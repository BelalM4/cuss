// Cuss for Canvas - browser app.
const $ = (sel) => document.querySelector(sel);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("cuss." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("cuss." + key, JSON.stringify(value));
    } catch {}
  },
};

const state = {
  chatId: store.get("chatId", null) || crypto.randomUUID(),
  busy: false,
  speakReplies: store.get("speakReplies", false),
  lastNotification: store.get("lastNotification", new Date().toISOString()),
  status: null,
  openDraft: null, // the newest unsent draft card, for the "send it" voice command
};

// ---------------------------------------------------------------- utilities

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  if (res.status === 401) {
    location.replace("/login.html");
    throw new Error("Please log in.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Small, safe Markdown renderer (input is escaped first).
function markdown(src) {
  const inline = (t) =>
    escapeHtml(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of String(src).split("\n")) {
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
      if (list !== "ul") closeList(), out.push("<ul>"), (list = "ul");
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== "ol") closeList(), out.push("<ol>"), (list = "ol");
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^#{1,6}\s+(.*)/))) {
      closeList();
      out.push(`<h3>${inline(m[1])}</h3>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

function plainText(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .trim();
}

function formatDue(iso) {
  const d = new Date(iso);
  const ms = d - Date.now();
  const hours = ms / 36e5;
  let rel;
  if (ms < 0) rel = "past due";
  else if (hours < 1) rel = `${Math.max(1, Math.round(ms / 6e4))} min`;
  else if (hours < 24) rel = `${Math.round(hours)} h`;
  else rel = `${Math.round(hours / 24)} d`;
  const cls = ms < 0 || hours < 24 ? "urgent" : hours < 72 ? "soon" : "";
  const when = d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return { rel, cls, when };
}

function toast(title, body, onclick) {
  const t = el("div", { class: "toast", onclick }, el("b", {}, title), body || "");
  if (onclick) t.style.cursor = "pointer";
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 9000);
}

// ---------------------------------------------------------------- dashboard

async function loadDashboard() {
  if (!state.status) return;
  try {
    const { upcoming, missing } = await api("/api/deadlines?days=14");
    const list = $("#deadlineList");
    list.replaceChildren();
    const open = upcoming.filter((d) => !d.submitted && !d.markedDone);
    if (!upcoming.length) list.append(el("li", { class: "muted" }, "Nothing due in the next two weeks 🎉"));
    for (const d of upcoming) {
      const f = formatDue(d.dueAt);
      const done = d.submitted || d.markedDone;
      list.append(
        el(
          "li",
          {},
          el(
            "a",
            { class: "deadline" + (done ? " done" : ""), href: d.url || "#", target: "_blank", rel: "noopener" },
            el("div", { class: "title" }, d.title),
            el("div", { class: "meta" }, el("span", {}, d.course || ""), el("span", { class: "when " + (done ? "" : f.cls) }, done ? "done" : f.rel)),
            el("div", { class: "meta" }, el("span", {}, f.when)),
          ),
        ),
      );
    }
    const box = $("#missingList");
    box.replaceChildren();
    if (missing.length) {
      box.append(
        el(
          "details",
          { class: "missing" },
          el("summary", {}, `⚠️ ${missing.length} missing assignment${missing.length > 1 ? "s" : ""}`),
          el("ul", {}, missing.map((m) => el("li", {}, el("a", { href: m.url, target: "_blank", rel: "noopener" }, m.title), m.course ? ` · ${m.course}` : ""))),
        ),
      );
    }
    const urgent = open.filter((d) => new Date(d.dueAt) - Date.now() < 48 * 36e5).length + missing.length;
    $("#dashBadge").textContent = urgent;
    $("#dashBadge").classList.toggle("hidden", !urgent);
  } catch (err) {
    $("#deadlineList").replaceChildren(el("li", { class: "error-text" }, err.message));
  }
  try {
    const courses = await api("/api/courses");
    $("#courseList").replaceChildren(
      ...courses.map((c) =>
        el("li", { class: "course" }, el("span", {}, c.name), el("span", { class: "grade" }, c.currentGrade || (c.currentScore != null ? `${c.currentScore}%` : ""))),
      ),
    );
  } catch {}
}

// ---------------------------------------------------------------- chat history

async function loadChatList() {
  const list = await api("/api/chats").catch(() => []);
  const ul = $("#chatList");
  ul.replaceChildren();
  if (!list.length) ul.append(el("li", { class: "muted small" }, "Your conversations will be saved here."));
  for (const c of list) {
    ul.append(
      el(
        "li",
        { class: "chat-item" + (c.id === state.chatId ? " active" : ""), onclick: () => openChat(c.id), title: c.title },
        el("span", {}, c.kind === "briefing" ? "☀️" : "💬"),
        el("span", { class: "t" }, c.title),
        el("button", {
          class: "del",
          title: "Delete chat",
          onclick: async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete "${c.title}"?`)) return;
            await api(`/api/chats/${c.id}`, { method: "DELETE" });
            if (c.id === state.chatId) newChat();
            loadChatList();
          },
        }, "✕"),
      ),
    );
  }
}

function resetMessages() {
  $("#messages").replaceChildren($("#welcome") || welcomeNode);
  $("#welcome").classList.remove("hidden");
  state.openDraft = null;
}
const welcomeNode = $("#welcome");

function newChat() {
  stopSpeaking();
  state.chatId = crypto.randomUUID();
  store.set("chatId", state.chatId);
  resetMessages();
  loadChatList();
  closeDashboardOnMobile();
  $("#input").focus();
}

async function openChat(id, { quiet = false } = {}) {
  stopSpeaking();
  try {
    const chat = await api(`/api/chats/${id}`);
    state.chatId = id;
    store.set("chatId", id);
    resetMessages();
    if (chat.display.length) $("#welcome").classList.add("hidden");
    for (const item of chat.display) {
      if (item.card) addCard(item.card);
      else if (item.role === "user") addUserMessage(item.text);
      else addBotMessage().setText(item.text);
    }
    loadChatList();
    closeDashboardOnMobile();
  } catch (err) {
    if (!quiet) toast("Couldn't open chat", err.message);
  }
}

// ---------------------------------------------------------------- messages

function scrollDown() {
  const m = $("#messages");
  m.scrollTop = m.scrollHeight;
}

function addUserMessage(text) {
  $("#welcome")?.classList.add("hidden");
  $("#messages").append(el("div", { class: "msg user" }, el("div", { class: "bubble" }, text)));
  scrollDown();
}

function addBotMessage() {
  const bubble = el("div", { class: "bubble" });
  const wrap = el("div", { class: "msg bot" }, bubble);
  $("#messages").append(wrap);
  let text = "";
  return {
    wrap,
    bubble,
    get text() {
      return text;
    },
    setText(t) {
      text = t;
      bubble.innerHTML = markdown(text);
      if (text.trim()) {
        bubble.append(el("button", { class: "speak-btn", title: "Read aloud", onclick: () => speak(plainText(text)) }, "🔊 Listen"));
      }
      scrollDown();
    },
  };
}

function addStatus(text) {
  const node = el("div", { class: "msg bot" }, el("div", { class: "status" }, el("span", { class: "dots" }, text)));
  $("#messages").append(node);
  scrollDown();
  return node;
}

// ---------------------------------------------------------------- cards

function addCard(card) {
  $("#welcome")?.classList.add("hidden");
  const node =
    card.kind === "draft" ? draftCard(card) : card.kind === "flashcards" ? flashcardCard(card) : card.kind === "quiz" ? quizCard(card) : null;
  if (node) $("#messages").append(node);
  scrollDown();
}

function draftCard(draft) {
  const subject = el("input", { value: draft.subject });
  const body = el("textarea", {}, draft.body);
  const actions = el("div", { class: "card-actions" });
  const card = el(
    "div",
    { class: "card" },
    el("h3", {}, "✉️ Message to your instructor"),
    el("div", { class: "row" }, el("div", { class: "card-label" }, "To"), draft.recipients.map((r) => el("span", { class: "recipient" }, r.name))),
    el("div", { class: "row" }, el("div", { class: "card-label" }, "Subject"), subject),
    el("div", { class: "row" }, el("div", { class: "card-label" }, "Message"), body),
    actions,
  );

  const markSent = () => {
    subject.disabled = body.disabled = true;
    actions.replaceChildren(el("span", { class: "sent-note" }, "✓ Sent through Canvas Inbox"));
    if (state.openDraft?.id === draft.id) state.openDraft = null;
  };

  if (draft.status === "sent") {
    markSent();
    return card;
  }

  const sendBtn = el("button", { class: "btn" }, "Send via Canvas");
  const send = async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      await api(`/api/drafts/${draft.id}/send`, { method: "POST", body: { subject: subject.value, body: body.value } });
      markSent();
      toast("Message sent", `Your message went to ${draft.recipients.map((r) => r.name).join(", ")}.`);
      if (state.speakReplies) speak("Sent. Your message is on its way.");
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send via Canvas";
      toast("Couldn't send", err.message);
    }
  };
  sendBtn.addEventListener("click", send);
  actions.append(sendBtn);

  const emails = draft.recipients.map((r) => r.email).filter(Boolean);
  if (emails.length) {
    actions.append(
      el("button", {
        class: "btn ghost",
        onclick: () => (location.href = `mailto:${emails.join(",")}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`),
      }, "Open in my email app"),
    );
  }
  actions.append(
    el("button", {
      class: "btn ghost",
      onclick: async () => {
        await navigator.clipboard.writeText(`${subject.value}\n\n${body.value}`);
        toast("Copied", "Subject and message copied.");
      },
    }, "Copy"),
  );
  state.openDraft = { id: draft.id, send };
  return card;
}

function flashcardCard({ title, cards }) {
  let order = cards.map((_, i) => i);
  let i = 0;
  const front = el("div", { class: "flashcard-face front" });
  const back = el("div", { class: "flashcard-face back" });
  const flip = el("div", { class: "flashcard", title: "Tap to flip" }, el("div", { class: "flashcard-inner" }, front, back));
  const counter = el("span", { class: "counter" });
  const show = () => {
    flip.classList.remove("flipped");
    const c = cards[order[i]];
    front.textContent = c.front;
    back.textContent = c.back;
    counter.textContent = `${i + 1} / ${cards.length}`;
  };
  flip.addEventListener("click", () => flip.classList.toggle("flipped"));
  show();
  return el(
    "div",
    { class: "card" },
    el("h3", {}, `🃏 ${title}`),
    flip,
    el(
      "div",
      { class: "card-actions" },
      el("button", { class: "btn ghost small", onclick: () => ((i = (i - 1 + cards.length) % cards.length), show()) }, "← Prev"),
      el("button", { class: "btn small", onclick: () => ((i = (i + 1) % cards.length), show()) }, "Next →"),
      el("button", { class: "btn ghost small", onclick: () => speak(flip.classList.contains("flipped") ? back.textContent : front.textContent) }, "🔊"),
      el("button", {
        class: "btn ghost small",
        onclick: () => {
          order = order.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
          i = 0;
          show();
        },
      }, "Shuffle"),
      counter,
    ),
  );
}

function quizCard({ title, questions }) {
  let i = 0;
  let score = 0;
  const body = el("div");
  const render = () => {
    body.replaceChildren();
    if (i >= questions.length) {
      body.append(
        el("p", { class: "quiz-q" }, `You got ${score} of ${questions.length} right${score === questions.length ? " — perfect! 🎉" : "."}`),
        el("button", { class: "btn small", onclick: () => ((i = 0), (score = 0), render()) }, "Try again"),
      );
      return;
    }
    const q = questions[i];
    body.append(el("div", { class: "card-label" }, `Question ${i + 1} of ${questions.length}`), el("div", { class: "quiz-q" }, q.question));
    const buttons = q.choices.map((choice, idx) =>
      el("button", {
        class: "choice",
        onclick: () => {
          buttons.forEach((b) => (b.disabled = true));
          buttons[q.answer_index]?.classList.add("correct");
          if (idx === q.answer_index) score++;
          else buttons[idx].classList.add("wrong");
          body.append(
            el("div", { class: "explain" }, (idx === q.answer_index ? "✓ Correct. " : "✗ Not quite. ") + (q.explanation || "")),
            el("button", { class: "btn small", onclick: () => (i++, render()) }, i + 1 < questions.length ? "Next question →" : "See score"),
          );
          scrollDown();
        },
      }, choice),
    );
    body.append(...buttons);
  };
  render();
  return el("div", { class: "card" }, el("h3", {}, `🧠 ${title}`), body);
}

// ---------------------------------------------------------------- sending

async function send(text, { viaVoice = false } = {}) {
  text = text.trim();
  if (!text || state.busy) return;

  // Voice shortcut: "send it" sends the open email draft.
  if (viaVoice && state.openDraft && /^(yes,? )?(send( it| the (email|message))?|go ahead and send( it)?)[.!]?$/i.test(text)) {
    addUserMessage(text);
    return state.openDraft.send();
  }

  state.busy = true;
  $("#sendBtn").disabled = true;
  addUserMessage(text);
  $("#input").value = "";
  autosize();

  let bot = null;
  let status = addStatus("Thinking");
  const clearStatus = () => {
    status?.remove();
    status = null;
  };
  const replyParts = [];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: state.chatId, text, voice: viaVoice && state.speakReplies, timeZone }),
    });
    if (res.status === 401) return location.replace("/login.html");
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "The assistant didn't respond.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "text") {
          if (!bot && !ev.delta.trim()) continue;
          clearStatus();
          if (!bot) bot = addBotMessage();
          bot.setText(bot.text + ev.delta);
        } else if (ev.type === "status") {
          if (bot) replyParts.push(bot.text);
          bot = null;
          clearStatus();
          status = addStatus(ev.text);
        } else if (ev.type === "card") {
          clearStatus();
          if (bot) replyParts.push(bot.text);
          bot = null;
          addCard(ev.card);
          status = addStatus("Finishing up");
        } else if (ev.type === "error") {
          clearStatus();
          $("#messages").append(el("div", { class: "msg bot" }, el("div", { class: "bubble error-text" }, ev.error)));
          scrollDown();
        }
      }
    }
  } catch (err) {
    $("#messages").append(el("div", { class: "msg bot" }, el("div", { class: "bubble error-text" }, err.message)));
  } finally {
    clearStatus();
    if (bot) replyParts.push(bot.text);
    state.busy = false;
    $("#sendBtn").disabled = false;
    loadChatList();
  }

  const reply = plainText(replyParts.filter((t) => t.trim()).join("\n"));
  if (state.speakReplies && reply) speak(reply, { thenListen: viaVoice });
  if (/remind|due|deadline|submitted/i.test(text)) loadDashboard();
}

// ---------------------------------------------------------------- voice

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let listening = false;

function setVoiceHint(text) {
  $("#voiceHint").textContent = text || "";
  $("#voiceHint").classList.toggle("hidden", !text);
}

function startListening() {
  if (!Recognition) {
    toast("Voice input isn't supported here", "Use Chrome, Edge or Safari for talking to Cuss. You can still type!");
    return;
  }
  if (listening) return stopListening();
  stopSpeaking();
  recognizer = new Recognition();
  recognizer.lang = navigator.language || "en-US";
  recognizer.interimResults = true;
  recognizer.continuous = false;
  let finalText = "";
  recognizer.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    $("#input").value = (finalText + interim).trim();
    autosize();
  };
  recognizer.onerror = (e) => {
    if (e.error === "not-allowed") toast("Microphone blocked", "Allow microphone access in your browser to talk to Cuss.");
    else if (e.error !== "no-speech" && e.error !== "aborted") toast("Voice error", e.error);
  };
  recognizer.onend = () => {
    listening = false;
    $("#micBtn").classList.remove("listening");
    setVoiceHint("");
    const text = finalText.trim();
    if (text) send(text, { viaVoice: true });
  };
  recognizer.start();
  listening = true;
  $("#micBtn").classList.add("listening");
  setVoiceHint("Listening… speak now. Tap the mic again to stop.");
}

function stopListening() {
  recognizer?.stop();
}

let voices = [];
function loadVoices() {
  voices = speechSynthesis?.getVoices() || [];
  const select = $("#voiceSelect");
  const saved = store.get("voice", "");
  select.replaceChildren(
    el("option", { value: "" }, "Default voice"),
    ...voices
      .filter((v) => v.lang.startsWith((navigator.language || "en").slice(0, 2)))
      .map((v) => el("option", { value: v.name, selected: v.name === saved }, `${v.name} (${v.lang})`)),
  );
}

function speak(text, { thenListen = false } = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  // Long replies are spoken in sentence-sized chunks (some browsers cut off long utterances).
  const chunks = text.match(/[^.!?\n]+[.!?]*\s*/g) || [text];
  const voice = voices.find((v) => v.name === store.get("voice", ""));
  chunks.forEach((chunk, idx) => {
    const u = new SpeechSynthesisUtterance(chunk.trim());
    if (voice) u.voice = voice;
    u.rate = 1.03;
    if (idx === chunks.length - 1 && thenListen) {
      // Conversation mode: keep listening after Cuss finishes talking.
      u.onend = () => setTimeout(startListening, 300);
    }
    speechSynthesis.speak(u);
  });
}

function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function setSpeak(on) {
  state.speakReplies = on;
  store.set("speakReplies", on);
  $("#speakToggle").setAttribute("aria-pressed", String(on));
  $("#speakToggle").firstChild.textContent = on ? "🔊 " : "🔈 ";
  if (!on) stopSpeaking();
}

// ---------------------------------------------------------------- notifications

async function pollNotifications() {
  if (!state.status) return;
  try {
    const items = await api(`/api/notifications?since=${encodeURIComponent(state.lastNotification)}`);
    for (const n of items) {
      const open = n.chatId ? () => openChat(n.chatId) : n.url ? () => window.open(n.url, "_blank") : undefined;
      toast(n.title, n.body, open);
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        const note = new Notification(n.title, { body: n.body, tag: n.id });
        note.onclick = () => {
          window.focus();
          open?.();
        };
      }
      if (state.speakReplies && !document.hidden) speak(n.title);
      state.lastNotification = n.createdAt;
    }
    if (items.length) {
      store.set("lastNotification", state.lastNotification);
      loadDashboard();
      loadChatList();
    }
  } catch {}
}

function setupNotifyBox() {
  const box = $("#notifyBox");
  if (!("Notification" in window) || Notification.permission !== "default") return box.classList.add("hidden");
  box.classList.remove("hidden");
  $("#enableNotify").onclick = async () => {
    await Notification.requestPermission();
    setupNotifyBox();
  };
}

// ---------------------------------------------------------------- settings

const dialog = $("#settings");
const form = $("#settingsForm");

async function loadMemory() {
  const items = await api("/api/memory").catch(() => []);
  const ul = $("#memoryList");
  ul.replaceChildren();
  if (!items.length) ul.append(el("li", { class: "muted" }, "Nothing yet. Cuss saves things as you chat, or add your own below."));
  for (const m of items) {
    ul.append(
      el("li", {}, el("span", {}, m.text), el("button", {
        title: "Forget this",
        onclick: async () => {
          await api(`/api/memory/${m.id}`, { method: "DELETE" });
          loadMemory();
        },
      }, "✕")),
    );
  }
}

async function addMemory() {
  const input = $("#memoryInput");
  if (!input.value.trim()) return;
  await api("/api/memory", { method: "POST", body: { text: input.value } });
  input.value = "";
  loadMemory();
}

function openSettings() {
  const s = state.status || {};
  $("#accountLine").textContent = `Logged in as ${s.studentName || "you"} with ${s.schoolName || "Canvas"}`;
  form.reminderHours.value = (s.reminderHours || [72, 24, 3]).join(", ");
  form.independent.checked = Boolean(s.independent);
  form.briefingTime.value = s.briefingTime || "07:30";
  form.autoSendEmails.checked = Boolean(s.autoSendEmails);
  $("#settingsError").classList.add("hidden");
  loadVoices();
  loadMemory();
  dialog.showModal();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#settingsSave");
  btn.disabled = true;
  btn.textContent = "Saving…";
  store.set("voice", $("#voiceSelect").value);
  try {
    await api("/api/settings", {
      method: "POST",
      body: {
        reminderHours: form.reminderHours.value.split(/[,\s]+/).filter(Boolean).map(Number),
        independent: form.independent.checked,
        briefingTime: form.briefingTime.value,
        autoSendEmails: form.autoSendEmails.checked,
        timeZone,
      },
    });
    await refreshStatus();
    dialog.close();
    toast("Saved", "Your settings are updated.");
  } catch (err) {
    $("#settingsError").textContent = err.message;
    $("#settingsError").classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

form.autoSendEmails.addEventListener("change", () => {
  if (form.autoSendEmails.checked && !confirm("Cuss will send messages to your instructors without showing you first. Emails can't be unsent. Turn this on?")) {
    form.autoSendEmails.checked = false;
  }
});

$("#briefNowBtn").addEventListener("click", async () => {
  const btn = $("#briefNowBtn");
  btn.disabled = true;
  btn.textContent = "Cuss is checking Canvas… (about a minute)";
  try {
    const { chatId } = await api("/api/briefing", { method: "POST" });
    dialog.close();
    await openChat(chatId);
  } catch (err) {
    toast("Briefing failed", err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Run a briefing now";
  }
});

$("#memoryAdd").addEventListener("click", addMemory);
$("#memoryInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault(), addMemory();
});
$("#settingsCancel").addEventListener("click", () => dialog.close());
$("#logoutBtn").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  store.set("chatId", null);
  location.replace("/login.html");
});
$("#deleteAccountBtn").addEventListener("click", async () => {
  if (!confirm("Delete all your chats, notes and settings, and disconnect Cuss from Canvas? This can't be undone.")) return;
  try {
    await api("/api/account/delete", { method: "POST" });
    store.set("chatId", null);
    location.replace("/login.html");
  } catch (err) {
    toast("Couldn't delete", err.message);
  }
});

async function refreshStatus() {
  state.status = await api("/api/status");
  const name = state.status.studentName;
  $("#greeting").textContent = name
    ? `${state.status.demo ? "Demo · " : ""}${state.status.independent ? "Independent mode on · " : ""}Hi, ${name.split(" ")[0]}`
    : "Your study assistant";
  if (name) $("#welcomeTitle").textContent = `Hi ${name.split(" ")[0]}! What can I help with?`;
}

// ---------------------------------------------------------------- wiring

function autosize() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 160) + "px";
}

function closeDashboardOnMobile() {
  $("#dashboard").classList.remove("open");
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  send($("#input").value);
});
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send($("#input").value);
  }
});
$("#input").addEventListener("input", autosize);
$("#micBtn").addEventListener("click", startListening);
$("#speakToggle").addEventListener("click", () => setSpeak(!state.speakReplies));
$("#settingsBtn").addEventListener("click", openSettings);
$("#newChatBtn").addEventListener("click", newChat);
$("#newChatBtn2").addEventListener("click", newChat);
$("#refreshBtn").addEventListener("click", loadDashboard);
$("#dashToggle").addEventListener("click", () => $("#dashboard").classList.toggle("open"));
document.querySelectorAll(".chip").forEach((chip) => chip.addEventListener("click", () => send(chip.dataset.prompt)));
document.addEventListener("keydown", (e) => {
  // Hold-free shortcut: Ctrl/Cmd + M toggles the microphone.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") e.preventDefault(), startListening();
});
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = loadVoices;

(async function init() {
  setSpeak(state.speakReplies);
  if (!Recognition) $("#micBtn").title = "Voice input needs Chrome, Edge or Safari";
  try {
    await refreshStatus();
  } catch (err) {
    if (err.message !== "Please log in.") toast("Can't reach the Cuss server", "Make sure `npm start` is running.");
    return;
  }
  if (!state.status.aiReady) toast("AI not set up yet", "The app owner needs to add ANTHROPIC_API_KEY on the server.");
  loadDashboard();
  setupNotifyBox();
  await openChat(state.chatId, { quiet: true });
  loadChatList();
  setInterval(pollNotifications, 60 * 1000);
  setInterval(loadDashboard, 15 * 60 * 1000);
  pollNotifications();
})();
