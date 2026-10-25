// Cuss for Canvas - browser app.
const $ = (sel) => document.querySelector(sel);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const icon = window.icon;

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
  openDraft: null, // newest unsent email draft, for the "send it" voice command
  voiceMode: false,
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
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

const iconEl = (name, size) => el("span", { class: "ic-wrap", html: icon(name, size), style: "display:contents" });

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Small, safe Markdown renderer (input is escaped first).
function markdown(src) {
  const inline = (t) =>
    escapeHtml(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
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
  else if (hours < 1) rel = `${Math.max(1, Math.round(ms / 6e4))}m`;
  else if (hours < 24) rel = `${Math.round(hours)}h`;
  else rel = `${Math.round(hours / 24)}d`;
  const cls = ms < 0 || hours < 24 ? "urgent" : hours < 72 ? "soon" : "later";
  const when = d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return { rel, cls, when };
}

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

function toast(title, body, { iconName = "sparkles", onclick } = {}) {
  const t = el("div", { class: "toast", onclick }, el("div", { class: "ti", html: icon(iconName, 16) }), el("div", {}, el("b", {}, title), el("span", {}, body || "")));
  if (onclick) t.style.cursor = "pointer";
  $("#toasts").append(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 300);
  }, 7000);
}

// Follow the conversation only if the student hasn't scrolled up to read.
function nearBottom() {
  const m = $("#messages");
  return m.scrollHeight - m.scrollTop - m.clientHeight < 160;
}
function scrollDown(force = false) {
  const m = $("#messages");
  if (force || nearBottom()) m.scrollTop = m.scrollHeight;
}

// ---------------------------------------------------------------- dashboard

async function loadDashboard() {
  if (!state.status) return;
  $("#todayDate").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  try {
    const { upcoming, missing } = await api("/api/deadlines?days=14");
    const list = $("#deadlineList");
    list.replaceChildren();
    const open = upcoming.filter((d) => !d.submitted && !d.markedDone);
    if (!upcoming.length) list.append(el("li", { class: "empty-note" }, "Nothing due in the next two weeks 🎉"));
    upcoming.forEach((d, i) => {
      const f = formatDue(d.dueAt);
      const done = d.submitted || d.markedDone;
      const a = el(
        "a",
        { class: `deadline ${done ? "done" : f.cls}`, href: d.url || "#", target: "_blank", rel: "noopener", style: `animation-delay:${i * 40}ms` },
        el("div", { class: "bar" }),
        el("div", { class: "info" }, el("div", { class: "title" }, d.title), el("div", { class: "meta" }, `${d.course || ""} · ${f.when}`)),
        el("span", { class: "when" }, done ? "done" : f.rel),
      );
      list.append(el("li", {}, a));
    });

    const teacher = state.status?.role === "teacher";
    const box = $("#missingList");
    if (!teacher) box.replaceChildren();
    if (missing.length && !teacher) {
      box.append(
        el(
          "details",
          { class: "missing" },
          el("summary", { html: `${icon("alert", 15)} ${missing.length} missing assignment${missing.length > 1 ? "s" : ""}` }),
          el("ul", {}, missing.map((m) => el("li", {}, el("a", { href: m.url, target: "_blank", rel: "noopener" }, m.title), m.course ? ` · ${m.course}` : ""))),
        ),
      );
    }

    if (teacher) throw { quiet: true }; // the professor dashboard fills the rest
    const week = open.filter((d) => new Date(d.dueAt) - Date.now() < 7 * 864e5).length;
    const soon = open.filter((d) => new Date(d.dueAt) - Date.now() < 48 * 36e5).length;
    $("#statDue").textContent = week;
    $("#statMissing").textContent = missing.length;
    const urgent = soon + missing.length;
    for (const id of ["#todayBadge", "#tabBadge"]) {
      $(id).textContent = urgent;
      $(id).classList.toggle("hidden", !urgent);
    }
    $("#welcomeSub").innerHTML =
      soon || missing.length
        ? `You have <b>${soon} thing${soon === 1 ? "" : "s"} due in the next 48 hours</b>${missing.length ? ` and <b>${missing.length} missing</b>` : ""}. Want me to help you get ahead?`
        : "You're all caught up for the next two days. Want to study ahead?";
  } catch (err) {
    if (!err.quiet) $("#deadlineList").replaceChildren(el("li", { class: "empty-note" }, err.message));
  }
  loadInbox();
  loadImpact();
  loadReadings();
  if (state.status?.role === "teacher") return loadTeacherDashboard();
  try {
    const courses = await api("/api/courses");
    state.courses = courses;
    const scored = courses.filter((c) => c.currentScore != null);
    $("#statGrade").textContent = scored.length ? Math.round(scored.reduce((s, c) => s + c.currentScore, 0) / scored.length) + "%" : "–";
    $("#courseList").replaceChildren(
      ...courses.map((c) => {
        const bar = el("div", { style: "width:0%" });
        requestAnimationFrame(() => setTimeout(() => (bar.style.width = `${Math.min(100, c.currentScore ?? 0)}%`), 60));
        return el(
          "li",
          { class: "course clickable", tabindex: "0", role: "button", "aria-label": `${c.name}: files and notes`, onclick: () => openClass(c.id), onkeydown: (e) => e.key === "Enter" && openClass(c.id) },
          el("div", { class: "course-top" }, el("span", {}, c.name), el("span", { class: "g" }, c.currentGrade || (c.currentScore != null ? `${c.currentScore}%` : ""), el("span", { class: "chev", html: icon("right", 14) }))),
          el("div", { class: "gbar" }, bar),
        );
      }),
    );
  } catch {}
}

// Professor mode: students who need attention and grading that's waiting.
async function loadTeacherDashboard() {
  try {
    const courses = await api("/api/teacher/overview");
    state.courses = courses.map((c) => ({ id: c.id, name: c.name }));
    const sum = (f) => courses.reduce((n, c) => n + (f(c) || 0), 0);
    const needs = sum((c) => c.atRisk.length);
    const grading = sum((c) => c.needsGrading);
    $("#statDue").textContent = sum((c) => c.summary?.students);
    $("#statMissing").textContent = needs;
    $("#statGrade").textContent = grading;
    for (const id of ["#todayBadge", "#tabBadge"]) {
      $(id).textContent = needs;
      $(id).classList.toggle("hidden", !needs);
    }
    $("#welcomeSub").innerHTML = needs || grading
      ? `<b>${needs} student${needs === 1 ? "" : "s"}</b> could use a check-in and <b>${grading} submission${grading === 1 ? "" : "s"}</b> are waiting to be graded. Want me to draft the outreach?`
      : "Everyone's on track and nothing is waiting to be graded.";
    const box = $("#missingList");
    // Professor layout: students first, then the class's upcoming deadlines.
    box.previousElementSibling.textContent = "Students needing attention";
    if (!$("#comingUpLabel")) $("#deadlineList").before(el("div", { class: "panel-label", id: "comingUpLabel" }, "Coming up in your classes"));
    box.replaceChildren(
      ...courses.flatMap((c) =>
        c.atRisk.map((s) =>
          el(
            "div",
            {
              class: "inbox-item",
              title: "Ask Cuss to draft a check-in",
              onclick: () => {
                closePanels();
                send(`Draft a kind, private check-in message to ${s.name} in ${c.name} about their missing work, offering help.`);
              },
            },
            el("span", { class: "avatar mini" }, initials(s.name)),
            el(
              "div",
              { class: "info" },
              el("div", { class: "from" }, s.name),
              el("div", { class: "snip" }, [s.missing ? `${s.missing} missing` : null, s.late ? `${s.late} late` : null, s.currentScore != null ? `${Math.round(s.currentScore)}% in ${c.name.split(" – ")[0]}` : null].filter(Boolean).join(" · ")),
            ),
          ),
        ),
      ),
    );
    if (!needs) box.append(el("div", { class: "empty-note" }, "No one is behind right now."));
    $("#courseList").replaceChildren(
      ...courses.map((c) => {
        const avg = c.summary?.classAverage;
        const bar = el("div", { style: "width:0%" });
        requestAnimationFrame(() => setTimeout(() => (bar.style.width = `${Math.min(100, avg ?? 0)}%`), 60));
        return el(
          "li",
          { class: "course clickable", tabindex: "0", role: "button", "aria-label": `${c.name}: files and notes`, onclick: () => openClass(c.id), onkeydown: (e) => e.key === "Enter" && openClass(c.id) },
          el("div", { class: "course-top" }, el("span", {}, c.name), el("span", { class: "g" }, avg != null ? `avg ${avg}%` : "", el("span", { class: "chev", html: icon("right", 14) }))),
          el("div", { class: "gbar" }, bar),
        );
      }),
    );
  } catch (err) {
    $("#missingList").replaceChildren(el("div", { class: "empty-note" }, err.message));
  }
}

async function loadImpact() {
  try {
    const imp = await api("/api/impact");
    const c = imp.counts || {};
    const items = state.status?.role === "teacher" ? [
      [(c.email_sent || 0) + (c.reply_sent || 0), "messages to students"],
      [c.announcement_posted || 0, "announcements"],
    ] : [
      [c.reminder || 0, "reminders"],
      [(c.email_sent || 0) + (c.reply_sent || 0), "emails sent"],
      [imp.quizzesTaken || 0, imp.quizAverage != null ? `quizzes · ${imp.quizAverage}% avg` : "quizzes"],
    ];
    if (imp.missing && imp.missing.firstDay !== imp.missing.lastDay) items.push([`${imp.missing.first}→${imp.missing.last}`, "missing work"]);
    $("#impactRow").replaceChildren(...items.map(([n, label]) => el("span", { class: "impact-chip" }, el("b", {}, String(n)), ` ${label}`)));
  } catch {}
}

async function loadInbox() {
  const ul = $("#inboxList");
  try {
    const unread = await api("/api/inbox");
    $("#inboxCount").textContent = unread.length;
    $("#inboxCount").classList.toggle("hidden", !unread.length);
    ul.replaceChildren();
    if (!unread.length) ul.append(el("li", { class: "empty-note" }, "No unread messages."));
    unread.forEach((c, i) => {
      const from = c.participants.find((p) => p !== state.status?.studentName) || c.participants[0] || "Canvas";
      ul.append(
        el(
          "li",
          {
            class: "inbox-item",
            style: `animation-delay:${i * 40}ms`,
            title: "Open with Cuss",
            onclick: () => {
              closePanels();
              send(`Open my Canvas message "${c.subject}" from ${from} and tell me what I need to do.`);
            },
          },
          el("span", { class: "avatar mini" }, initials(from)),
          el("div", { class: "info" }, el("div", { class: "from" }, from, el("span", { class: "dot-unread" })), el("div", { class: "subj" }, c.subject), el("div", { class: "snip" }, c.lastMessage)),
        ),
      );
    });
  } catch {
    ul.replaceChildren(el("li", { class: "empty-note" }, "Couldn't load messages."));
  }
}

// ---------------------------------------------------------------- chat history

async function loadChatList() {
  const list = await api("/api/chats").catch(() => []);
  const ul = $("#chatList");
  ul.replaceChildren();
  if (!list.length) ul.append(el("li", { class: "empty-note" }, "Your chats will show up here."));
  for (const c of list) {
    if (c.id === state.chatId) setChatTitle(c.title);
    ul.append(
      el(
        "li",
        { class: "chat-item" + (c.id === state.chatId ? " active" : ""), onclick: () => openChat(c.id), title: c.title },
        el("span", { html: icon(c.kind === "briefing" ? "sun" : "message", 16) }),
        el("span", { class: "t" }, c.title),
        el("button", {
          class: "del",
          title: "Delete chat",
          "aria-label": `Delete chat “${c.title}”`,
          html: icon("trash", 15),
          onclick: async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete "${c.title}"?`)) return;
            await api(`/api/chats/${c.id}`, { method: "DELETE" });
            if (c.id === state.chatId) newChat();
            loadChatList();
          },
        }),
      ),
    );
  }
}

function setChatTitle(t) {
  $("#chatTitle").textContent = t || "New chat";
}

const welcomeNode = $("#welcome");
function resetMessages() {
  $("#messages").replaceChildren(welcomeNode);
  welcomeNode.classList.remove("hidden");
  state.openDraft = null;
}

function newChat() {
  stopSpeaking();
  state.chatId = crypto.randomUUID();
  store.set("chatId", state.chatId);
  resetMessages();
  setChatTitle("New chat");
  loadChatList();
  closePanels();
  $("#input").focus();
}

async function openChat(id, { quiet = false } = {}) {
  stopSpeaking();
  try {
    const chat = await api(`/api/chats/${id}`);
    state.chatId = id;
    store.set("chatId", id);
    resetMessages();
    setChatTitle(chat.display.length ? chat.title : "New chat");
    if (chat.display.length) welcomeNode.classList.add("hidden");
    for (const item of chat.display) {
      if (item.card) addCard(item.card);
      else if (item.steps) renderStepGroup(item.steps);
      else if (item.role === "user") addUserMessage(item.text);
      else addBotMessage().finish(item.text);
    }
    if (chat.display.length) scrollDown(true);
    else $("#messages").scrollTop = 0;
    loadChatList();
    closePanels();
  } catch (err) {
    if (!quiet) toast("Couldn't open chat", err.message, { iconName: "alert" });
  }
}

// ---------------------------------------------------------------- messages

function botRow(...children) {
  welcomeNode.classList.add("hidden");
  const row = el("div", { class: "msg bot" }, el("div", { class: "orb av" }, el("span")), el("div", { class: "bubble" }, ...children));
  $("#messages").append(row);
  return row;
}

function addUserMessage(text) {
  welcomeNode.classList.add("hidden");
  $("#messages").append(el("div", { class: "msg user" }, el("div", { class: "bubble" }, text)));
  scrollDown(true);
}

function addBotMessage() {
  const stick = nearBottom();
  const content = el("div", { class: "md" });
  const tools = el("div", { class: "msg-tools" });
  const row = botRow(content, tools);
  const bubble = row.querySelector(".bubble");
  let text = "";
  let frame = 0;
  const render = () => {
    frame = 0;
    const keep = nearBottom();
    content.innerHTML = markdown(text);
    if (keep) scrollDown(true);
  };
  if (stick) scrollDown(true);
  return {
    get text() {
      return text;
    },
    append(delta) {
      text += delta;
      bubble.classList.add("cursor");
      if (!frame) frame = requestAnimationFrame(render);
    },
    finish(finalText = text) {
      text = finalText;
      bubble.classList.remove("cursor");
      if (frame) cancelAnimationFrame(frame);
      render();
      tools.replaceChildren(
        el("button", { onclick: () => speak(plainText(text)), html: `${icon("volume", 14)} Listen` }),
        el("button", {
          onclick: async () => {
            await navigator.clipboard.writeText(text);
            toast("Copied", "Reply copied to clipboard.", { iconName: "copy" });
          },
          html: `${icon("copy", 14)} Copy`,
        }),
      );
    },
  };
}

function addTyping() {
  const row = botRow(el("div", { class: "typing" }, el("i"), el("i"), el("i")));
  scrollDown();
  return row;
}

// Live "what Cuss is doing" steps.
function renderStepGroup(steps = []) {
  const wrap = el("div", { class: "steps" });
  const row = botRow(wrap);
  const byId = new Map();
  const update = ({ id, text, state: st }) => {
    let node = byId.get(id);
    if (!node) {
      node = el("div", { class: "step" }, el("span", { class: "dot" }), el("span", { class: "label" }));
      byId.set(id, node);
      wrap.append(node);
    }
    node.className = `step ${st}`;
    node.querySelector(".dot").innerHTML = st === "done" ? icon("check", 12) : st === "error" ? icon("x", 12) : "";
    node.querySelector(".label").textContent = st === "running" ? `${text}…` : text;
    scrollDown();
  };
  steps.forEach(update);
  return { row, update, has: (id) => byId.has(id) };
}

// ---------------------------------------------------------------- cards

function addCard(card) {
  welcomeNode.classList.add("hidden");
  const node =
    card.kind === "draft" || card.kind === "reply" || card.kind === "announcement" ? draftCard(card) : card.kind === "flashcards" ? flashcardCard(card) : card.kind === "quiz" ? quizCard(card) : card.kind === "library" ? libraryCard(card) : null;
  if (node) $("#messages").append(node);
  scrollDown();
}

function cardHead(iconName, title, ...extra) {
  return el("div", { class: "card-head" }, el("span", { html: icon(iconName, 18) }), el("h3", {}, title), ...extra);
}

function draftCard(draft) {
  const isReply = draft.kind === "reply";
  const isAnnouncement = draft.kind === "announcement";
  const subject = el("input", { value: isReply ? `Re: ${draft.subject}` : draft.subject, "aria-label": "Subject", disabled: isReply });
  const body = el("textarea", { "aria-label": "Message" }, draft.body);
  const actions = el("div", { class: "card-actions" });
  const status = el("span", { class: "chip" }, "Draft");
  const quote = isReply && draft.quote
    ? el(
        "div",
        { class: "quote" },
        el("div", { class: "quote-head" }, el("b", {}, draft.quote.from), " wrote", draft.quote.at ? ` · ${new Date(draft.quote.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""),
        el("div", { class: "quote-body" }, draft.quote.body),
      )
    : null;
  const card = el(
    "div",
    { class: "card" },
    cardHead(
      isAnnouncement ? "megaphone" : isReply ? "message" : "mail",
      isAnnouncement ? "Course announcement" : isReply ? "Reply in Canvas Inbox" : state.status?.role === "teacher" ? "Message to students" : "Email to your instructor",
      status,
    ),
    el(
      "div",
      { class: "card-body" },
      el(
        "div",
        { class: "mail-row" },
        el("span", { class: "k" }, "To"),
        el("div", {}, isAnnouncement ? el("span", { class: "recipient" }, `Everyone in ${draft.course || "the course"}`) : draft.recipients.map((r) => el("span", { class: "recipient" }, el("span", { class: "avatar mini" }, initials(r.name)), r.name))),
      ),
      el("div", { class: "mail-row" }, el("span", { class: "k" }, isAnnouncement ? "Title" : "Subject"), subject),
      quote,
      el("div", { class: "mail-body" }, body),
    ),
    actions,
  );

  const markSent = () => {
    subject.disabled = body.disabled = true;
    status.textContent = "Sent";
    status.className = "chip ok";
    status.textContent = isAnnouncement ? "Posted" : "Sent";
    actions.replaceChildren(el("span", { class: "sent-note", html: `${icon("check", 16)} ${isAnnouncement ? "Posted to the course in Canvas" : `${isReply ? "Reply sent" : "Sent"} through Canvas Inbox`}` }));
    if (state.openDraft?.id === draft.id) state.openDraft = null;
  };
  if (draft.status === "sent") {
    markSent();
    return card;
  }

  const sendLabel = `${icon(isAnnouncement ? "megaphone" : "send", 16)} ${isAnnouncement ? "Post to course" : isReply ? "Send reply" : "Send via Canvas"}`;
  const sendBtn = el("button", { class: "btn", html: sendLabel });
  const send = async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      await api(`/api/drafts/${draft.id}/send`, { method: "POST", body: { subject: isReply ? draft.subject : subject.value, body: body.value } });
      markSent();
      setTimeout(loadInbox, 1500);
      if (isAnnouncement) toast("Announcement posted", `Everyone in ${draft.course || "the course"} can see it now.`, { iconName: "megaphone" });
      else toast("Message sent", `Your message went to ${draft.recipients.map((r) => r.name).join(", ")}.`, { iconName: "send" });
      if (state.speakReplies || state.voiceMode) speak("Sent. Your message is on its way.");
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = sendLabel;
      toast("Couldn't send", err.message, { iconName: "alert" });
    }
  };
  sendBtn.addEventListener("click", send);
  actions.append(sendBtn);

  const emails = draft.recipients.map((r) => r.email).filter(Boolean);
  if (emails.length) {
    actions.append(
      el("button", {
        class: "btn ghost",
        html: `${icon("external", 15)} Open in email app`,
        onclick: () => (location.href = `mailto:${emails.join(",")}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`),
      }),
    );
  }
  actions.append(
    el("button", {
      class: "btn ghost",
      html: `${icon("copy", 15)} Copy`,
      onclick: async () => {
        await navigator.clipboard.writeText(`${subject.value}\n\n${body.value}`);
        toast("Copied", "Subject and message copied.", { iconName: "copy" });
      },
    }),
  );
  state.openDraft = { id: draft.id, send };
  return card;
}

function flashcardCard({ title, cards }) {
  let order = cards.map((_, i) => i);
  let i = 0;
  const front = el("div", { class: "flashcard-face front" });
  const back = el("div", { class: "flashcard-face back" });
  const flip = el("div", { class: "flashcard", title: "Click or press Space to flip" }, el("div", { class: "flashcard-inner" }, front, back));
  const dots = el("div", { class: "fc-progress" }, cards.map(() => el("i")));
  const counter = el("span", { class: "counter" });
  const show = () => {
    flip.classList.remove("flipped");
    const c = cards[order[i]];
    front.replaceChildren(el("small", {}, "Question"), c.front);
    back.replaceChildren(el("small", {}, "Answer"), c.back);
    counter.textContent = `${i + 1} / ${cards.length}`;
    [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
  };
  const next = () => ((i = (i + 1) % cards.length), show());
  const prev = () => ((i = (i - 1 + cards.length) % cards.length), show());
  flip.addEventListener("click", () => flip.classList.toggle("flipped"));
  show();
  const card = el(
    "div",
    { class: "card", tabindex: "0" },
    cardHead("layers", title, el("span", { class: "chip" }, `${cards.length} cards`)),
    el("div", { class: "card-body fc-wrap" }, flip, dots),
    el(
      "div",
      { class: "card-actions" },
      el("button", { class: "btn ghost small", onclick: prev, html: icon("left", 15) }),
      el("button", { class: "btn small", onclick: next, html: `Next ${icon("right", 15)}` }),
      el("button", { class: "btn ghost small", title: "Read aloud", html: icon("volume", 15), onclick: () => speak(flip.classList.contains("flipped") ? back.textContent.replace(/^Answer/, "") : front.textContent.replace(/^Question/, "")) }),
      el("button", {
        class: "btn ghost small",
        title: "Shuffle",
        html: icon("shuffle", 15),
        onclick: () => {
          order = order.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
          i = 0;
          show();
        },
      }),
      counter,
    ),
  );
  card.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === " ") e.preventDefault(), flip.classList.toggle("flipped");
  });
  card.addEventListener("mouseenter", () => card.focus({ preventScroll: true }));
  return card;
}

function confetti() {
  const colors = ["#6366f1", "#a855f7", "#ec4899", "#f5a524", "#12a150"];
  for (let k = 0; k < 90; k++) {
    const c = el("div", { class: "confetti" });
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[k % colors.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    c.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.append(c);
    setTimeout(() => c.remove(), 3800);
  }
}

function quizCard({ title, questions }) {
  let i = 0;
  let score = 0;
  const bar = el("div", { style: "width:0%" });
  const body = el("div");
  const chip = el("span", { class: "chip" }, `${questions.length} questions`);
  const render = () => {
    bar.style.width = `${(i / questions.length) * 100}%`;
    body.replaceChildren();
    if (i >= questions.length) {
      const perfect = score === questions.length;
      api("/api/impact/quiz", { method: "POST", body: { score, total: questions.length } }).then(loadImpact).catch(() => {});
      body.append(
        el(
          "div",
          { class: "score" },
          el("div", { class: "score-num grad-text" }, `${score}/${questions.length}`),
          el("p", { class: "muted" }, perfect ? "Perfect score! You're ready. 🎉" : score / questions.length >= 0.7 ? "Nice work! Review the ones you missed." : "Good practice. Let's go over the tricky ones."),
          el("button", { class: "btn small", onclick: () => ((i = 0), (score = 0), render()), html: `${icon("refresh", 15)} Try again` }),
        ),
      );
      if (perfect) confetti();
      return;
    }
    const q = questions[i];
    body.append(el("div", { class: "quiz-q" }, q.question));
    const buttons = q.choices.map((choice, idx) =>
      el(
        "button",
        {
          class: "choice",
          onclick: () => {
            buttons.forEach((b) => (b.disabled = true));
            buttons[q.answer_index]?.classList.add("correct");
            const right = idx === q.answer_index;
            if (right) score++;
            else buttons[idx].classList.add("wrong");
            body.append(
              el("div", { class: "explain" }, (right ? "✓ Correct. " : "✗ Not quite. ") + (q.explanation || "")),
              el("button", { class: "btn small", onclick: () => (i++, render()), html: i + 1 < questions.length ? `Next question ${icon("right", 15)}` : "See my score" }),
            );
            scrollDown();
          },
        },
        el("span", { class: "letter" }, "ABCDEFG"[idx]),
        el("span", {}, choice),
      ),
    );
    body.append(...buttons);
  };
  render();
  return el("div", { class: "card" }, cardHead("help", title, chip), el("div", { class: "card-body" }, el("div", { class: "progress" }, bar), body));
}

// ---------------------------------------------------------------- sending

async function send(text, { viaVoice = false } = {}) {
  text = text.trim();
  if (!text || state.busy) return null;

  // Voice shortcut: "send it" sends the open email draft.
  if (viaVoice && state.openDraft && /^(yes,? )?(send( it| the (email|message))?|go ahead and send( it)?)[.!]?$/i.test(text)) {
    addUserMessage(text);
    await state.openDraft.send();
    return "Sent. Your message is on its way.";
  }

  state.busy = true;
  $("#sendBtn").disabled = true;
  addUserMessage(text);
  $("#input").value = "";
  autosize();

  let bot = null;
  let steps = null;
  let typing = addTyping();
  const clearTyping = () => {
    typing?.remove();
    typing = null;
  };
  const replyParts = [];
  const endBot = () => {
    if (bot) bot.finish(), replyParts.push(bot.text);
    bot = null;
  };
  let madeCard = false;
  const stepGroups = [];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: state.chatId, text, voice: viaVoice && (state.speakReplies || state.voiceMode), timeZone }),
    });
    if (res.status === 401) return location.replace("/login.html");
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "Cuss didn't respond.");
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
          clearTyping();
          steps = null;
          if (!bot) bot = addBotMessage();
          bot.append(ev.delta);
          if (state.voiceMode) setVoiceCaption(plainText(bot.text));
        } else if (ev.type === "step") {
          clearTyping();
          const owner = stepGroups.find((g) => g.has(ev.id));
          if (owner) owner.update(ev);
          else {
            endBot();
            if (!steps) stepGroups.push((steps = renderStepGroup()));
            steps.update(ev);
          }
          if (state.voiceMode && ev.state === "running") setVoiceCaption(`${ev.text}…`);
        } else if (ev.type === "card") {
          clearTyping();
          endBot();
          steps = null;
          madeCard = true;
          addCard(ev.card);
        } else if (ev.type === "error") {
          clearTyping();
          botRow(el("div", { class: "bubble error-text" }, ev.error));
        }
      }
    }
  } catch (err) {
    clearTyping();
    botRow(el("div", { class: "error-text" }, err.message));
  } finally {
    clearTyping();
    endBot();
    state.busy = false;
    $("#sendBtn").disabled = false;
    loadChatList();
  }

  if (/remind|due|deadline|submitted/i.test(text)) loadDashboard();
  let reply = plainText(replyParts.filter((t) => t.trim()).join("\n"));
  if (state.voiceMode && madeCard && !reply) reply = "I put it on your screen.";
  return reply;
}

// ---------------------------------------------------------------- voice

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let listening = false;

// Listens for one utterance. Calls onText(interim) while speaking; resolves with the final text.
function listenOnce(onText = () => {}) {
  return new Promise((resolve) => {
    if (!Recognition) {
      toast("Voice input isn't supported here", "Use Chrome, Edge or Safari to talk to Cuss. You can still type!", { iconName: "mic" });
      return resolve("");
    }
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
      onText((finalText + interim).trim());
    };
    recognizer.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone blocked", "Allow microphone access in your browser to talk to Cuss.", { iconName: "mic" });
    };
    recognizer.onend = () => {
      listening = false;
      resolve(finalText.trim());
    };
    try {
      recognizer.start();
      listening = true;
    } catch {
      resolve("");
    }
  });
}

function stopListening() {
  try {
    recognizer?.stop();
  } catch {}
}

// Mic button in the composer: dictate one message.
async function dictate() {
  if (listening) return stopListening();
  $("#micBtn").classList.add("listening");
  $("#voiceHint").textContent = "Listening… tap the mic again to stop.";
  $("#voiceHint").classList.add("live");
  const text = await listenOnce((t) => (($("#input").value = t), autosize()));
  $("#micBtn").classList.remove("listening");
  $("#voiceHint").classList.remove("live");
  $("#voiceHint").innerHTML = "Cuss reads your Canvas so you don't have to. <kbd>Enter</kbd> to send · <kbd>⌘M</kbd> to talk";
  if (!text) return;
  const reply = await send(text, { viaVoice: true });
  if (state.speakReplies && reply) speak(reply);
}

// Full-screen voice conversation.
function setVoiceState(mode, label) {
  const o = $("#voiceOverlay");
  o.classList.remove("listening", "thinking", "speaking");
  o.classList.add(mode);
  $("#voiceState").textContent = label;
}
function setVoiceCaption(text) {
  $("#voiceCaption").textContent = text.length > 280 ? "…" + text.slice(-280) : text;
}

async function voiceTurn() {
  if (!state.voiceMode) return;
  setVoiceState("listening", "Listening…");
  setVoiceCaption("Go ahead, I'm listening.");
  const text = await listenOnce((t) => setVoiceCaption(t));
  if (!state.voiceMode) return;
  if (!text) {
    setVoiceState("listening", "Tap to talk");
    setVoiceCaption("I didn't catch that. Tap “Tap to talk” and try again.");
    return;
  }
  setVoiceState("thinking", "Thinking…");
  const reply = await send(text, { viaVoice: true });
  if (!state.voiceMode) return;
  if (!reply) return voiceTurn();
  setVoiceState("speaking", "Speaking…");
  setVoiceCaption(reply);
  speak(reply, () => state.voiceMode && setTimeout(voiceTurn, 250));
}

function openVoiceMode() {
  if (!Recognition) {
    toast("Voice mode needs Chrome, Edge or Safari", "You can still type to Cuss.", { iconName: "mic" });
    return;
  }
  state.voiceMode = true;
  $("#voiceOverlay").classList.remove("hidden");
  voiceTurn();
}

function closeVoiceMode() {
  state.voiceMode = false;
  stopListening();
  stopSpeaking();
  $("#voiceOverlay").classList.add("hidden");
}

let voices = [];
function loadVoices() {
  voices = window.speechSynthesis?.getVoices() || [];
  const select = $("#voiceSelect");
  const saved = store.get("voice", "");
  select.replaceChildren(
    el("option", { value: "" }, "Default voice"),
    ...voices
      .filter((v) => v.lang.startsWith((navigator.language || "en").slice(0, 2)))
      .map((v) => el("option", { value: v.name, selected: v.name === saved }, `${v.name} (${v.lang})`)),
  );
}

let speakToken = 0;
function speak(text, onDone) {
  if (!("speechSynthesis" in window) || !text) return onDone?.();
  speechSynthesis.cancel();
  const token = ++speakToken;
  // Long replies are spoken in sentence-sized chunks (some browsers cut off long utterances).
  const chunks = text.match(/[^.!?\n]+[.!?]*\s*/g) || [text];
  const voice = voices.find((v) => v.name === store.get("voice", ""));
  let finished = false;
  const done = () => {
    if (finished || token !== speakToken) return;
    finished = true;
    onDone?.();
  };
  chunks.forEach((chunk, idx) => {
    const u = new SpeechSynthesisUtterance(chunk.trim());
    if (voice) u.voice = voice;
    u.rate = 1.04;
    if (idx === chunks.length - 1) u.onend = done;
    speechSynthesis.speak(u);
  });
  // Safety net: some browsers occasionally skip the "end" event.
  setTimeout(done, text.length * 75 + 2500);
}

function stopSpeaking() {
  speakToken++;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function setSpeak(on) {
  state.speakReplies = on;
  store.set("speakReplies", on);
  const t = $("#speakToggle");
  t.setAttribute("aria-pressed", String(on));
  t.querySelector("svg").outerHTML = icon(on ? "volume" : "mute", 16);
  if (!on) stopSpeaking();
}

// ---------------------------------------------------------------- notifications

async function pollNotifications() {
  if (!state.status) return;
  try {
    const items = await api(`/api/notifications?since=${encodeURIComponent(state.lastNotification)}`);
    for (const n of items) {
      const open = n.chatId
        ? () => openChat(n.chatId)
        : n.conversationId
          ? () => send(`Open my Canvas message "${n.body}" and tell me what it says.`)
          : n.url
            ? () => window.open(n.url, "_blank")
            : undefined;
      toast(n.title, n.body, { iconName: n.chatId ? "sun" : n.conversationId ? "message" : /announcement/i.test(n.title) ? "megaphone" : "clock", onclick: open });
      if (n.conversationId) loadInbox();
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        const note = new Notification(n.title, { body: n.body, tag: n.id });
        note.onclick = () => {
          window.focus();
          open?.();
        };
      }
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
      el(
        "li",
        {},
        el("span", {}, m.text),
        el("button", {
          title: "Forget this",
          html: icon("x", 15),
          onclick: async () => {
            await api(`/api/memory/${m.id}`, { method: "DELETE" });
            loadMemory();
          },
        }),
      ),
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
  $("#accountLine").textContent = `${s.studentName || "You"} · ${s.demo ? "Demo University" : s.schoolName || "Canvas"}`;
  form.reminderHours.value = (s.reminderHours || [72, 24, 3]).join(", ");
  form.independent.checked = Boolean(s.independent);
  form.briefingTime.value = s.briefingTime || "07:30";
  form.autoSendEmails.checked = Boolean(s.autoSendEmails);
  $("#resetDemoBtn").classList.toggle("hidden", !s.demo);
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
    toast("Saved", "Your settings are updated.", { iconName: "check" });
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
  btn.textContent = "Cuss is checking Canvas…";
  try {
    const { chatId } = await api("/api/briefing", { method: "POST" });
    dialog.close();
    await openChat(chatId);
  } catch (err) {
    toast("Briefing failed", err.message, { iconName: "alert" });
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon("sun", 16)} Run a briefing now`;
  }
});

$("#memoryAdd").addEventListener("click", addMemory);
$("#memoryInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault(), addMemory();
});
$("#settingsCancel").addEventListener("click", () => dialog.close());
$("#logoutAllBtn").addEventListener("click", async () => {
  if (!confirm("Log out of Cuss on every device (laptops and phones)?")) return;
  await api("/auth/logout-all", { method: "POST" }).catch(() => {});
  store.set("chatId", null);
  location.replace("/login.html");
});
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
    toast("Couldn't delete", err.message, { iconName: "alert" });
  }
});
$("#resetDemoBtn").addEventListener("click", async () => {
  await api("/api/account/delete", { method: "POST" }).catch(() => {});
  store.set("chatId", null);
  location.replace(state.status?.role === "teacher" ? "/auth/demo?as=professor" : "/auth/demo");
});

// Swap in professor suggestions and dashboard labels.
function useTeacherLayout() {
  const ideas = [
    ["alert", "Who's falling behind?", "Missing work and low scores", "Which students in my courses are falling behind? Show missing work and scores, and suggest who to reach out to first."],
    ["check", "What needs grading?", "Submissions waiting", "What needs grading in my courses?"],
    ["message", "Answer student messages", "Summaries and reply drafts", "Check my Canvas inbox and help me answer my students' messages."],
    ["mail", "Nudge students", "Kind check-ins about missing work", "Draft kind, private check-in messages to students who have missing work."],
    ["megaphone", "Draft an announcement", "Reminders, changes, encouragement", "Draft a course announcement reminding students about the next quiz and how to prepare."],
    ["help", "Practice quiz for students", "From your lecture files", "Make a practice quiz for my students from my latest lecture slides."],
  ];
  const grid = $(".suggestions");
  grid.replaceChildren(
    ...ideas.map(([ic, title, sub, prompt]) =>
      el("button", { class: "suggestion", onclick: () => send(prompt) }, el("span", { html: icon(ic, 22) }), el("b", {}, title), el("span", {}, sub)),
    ),
  );
  const labels = document.querySelectorAll(".stat-label");
  ["students", "need a check-in", "to grade"].forEach((t, i) => labels[i] && (labels[i].textContent = t));
  document.querySelectorAll(".panel-label").forEach((l) => {
    if (l.textContent === "Your impact with Cuss") l.textContent = "Your impact with Cuss";
    if (l.textContent === "Courses") l.textContent = "Your classes";
  });
  $("#input").placeholder = "Ask Cuss about your classes…";
}

async function refreshStatus() {
  state.status = await api("/api/status");
  const s = state.status;
  const name = s.studentName || "there";
  const parts = name.split(" ");
  const teacher = s.role === "teacher";
  const first = teacher && /^(dr|prof)\.?$/i.test(parts[0]) && parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : parts[0];
  document.body.classList.toggle("teacher", teacher);
  if (teacher) useTeacherLayout();
  const h = new Date().getHours();
  const hello = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  $("#welcomeTitle").innerHTML = `${hello}, <span class="grad-text">${escapeHtml(first)}</span>`;
  $("#whoName").textContent = s.studentName || "Student";
  $("#whoSub").textContent = `${teacher ? "Professor · " : ""}${s.demo ? "Demo University" : s.schoolName || "Canvas"}`;
  $("#schoolLine").textContent = s.independent ? "Independent mode on" : "for Canvas";
  $("#avatar").textContent = $("#avatar2").textContent = initials(s.studentName);
  $("#demoPill").classList.toggle("hidden", !s.demo);
}

// ---------------------------------------------------------------- wiring

function autosize() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 180) + "px";
}

function closePanels() {
  $("#sidebar").classList.remove("open");
  $("#today").classList.remove("open");
  $("#scrim").classList.remove("show");
  setActiveTab("chat");
}

// Phone tab bar (iOS style).
function setActiveTab(name) {
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
}
function openTab(name) {
  if (name === "voice") return openVoiceMode();
  if (name === "settings") return openSettings();
  $("#sidebar").classList.toggle("open", name === "history");
  $("#today").classList.toggle("open", name === "today");
  $("#scrim").classList.remove("show");
  setActiveTab(name);
  if (navigator.vibrate) navigator.vibrate(8);
}
document.querySelectorAll("#tabbar button").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  send($("#input").value);
});
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send($("#input").value);
  }
});
$("#input").addEventListener("input", autosize);
$("#micBtn").addEventListener("click", dictate);
$("#voiceModeBtn").addEventListener("click", openVoiceMode);
$("#voiceEnd").addEventListener("click", closeVoiceMode);
$("#voiceClose").addEventListener("click", closeVoiceMode);
$("#voiceTap").addEventListener("click", () => {
  if (state.busy) return;
  stopSpeaking();
  stopListening();
  setTimeout(voiceTurn, 150);
});
$("#speakToggle").addEventListener("click", () => setSpeak(!state.speakReplies));
$("#settingsBtn").addEventListener("click", openSettings);
$("#newChatBtn").addEventListener("click", newChat);
$("#refreshBtn").addEventListener("click", loadDashboard);
$("#menuBtn").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
  $("#scrim").classList.add("show");
});
$("#todayBtn").addEventListener("click", () => {
  $("#today").classList.add("open");
  $("#scrim").classList.add("show");
});
$("#scrim").addEventListener("click", closePanels);
document.querySelectorAll(".suggestion").forEach((s) => s.addEventListener("click", () => send(s.dataset.prompt)));
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") e.preventDefault(), dictate();
  if (e.key === "Escape" && state.voiceMode) closeVoiceMode();
});
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = loadVoices;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

(async function init() {
  setSpeak(state.speakReplies);
  if (!Recognition) $("#micBtn").title = "Voice input needs Chrome, Edge or Safari";
  try {
    await refreshStatus();
  } catch (err) {
    if (err.message !== "Please log in.") toast("Can't reach the Cuss server", "Make sure `npm start` is running.", { iconName: "alert" });
    return;
  }
  if (!state.status.aiReady) toast("AI not set up yet", "The app owner needs to add ANTHROPIC_API_KEY on the server.", { iconName: "alert" });
  loadDashboard();
  setupNotifyBox();
  await openChat(state.chatId, { quiet: true });
  loadChatList();
  setInterval(pollNotifications, 30 * 1000);
  setInterval(loadDashboard, 10 * 60 * 1000);
  pollNotifications();
})();

// ---------------------------------------------------------------- class library
// Each class gets its own files and notes: Canvas files Cuss brings in,
// uploads, the student's notes and to-dos. Anything can be "due next class"
// with a reminder, and go into the iPhone Calendar or Reminders app.

const lib = { course: null, data: null, open: null, editing: null };
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];
const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const nativeCal = () => window.Capacitor?.Plugins?.CapacitorCalendar;

const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayLabel = (ymd) => {
  const today = ymdLocal();
  const tomorrow = ymdLocal(new Date(Date.now() + 864e5));
  if (ymd === today) return "Today";
  if (ymd === tomorrow) return "Tomorrow";
  return new Date(ymd + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const shortCourse = (name = "") => name.split(/ [–-] /)[0];
const courseById = (id) => (state.courses || []).find((c) => c.id === Number(id));

function dueText(item, nextClass) {
  if (!item.readBy) return "";
  const past = item.readBy < ymdLocal() && !item.done;
  return `${past ? "Was due " : "Read by "}${dayLabel(item.readBy)}${item.readBy === nextClass ? " · next class" : ""}`;
}

// Today panel: readings and to-dos from every class, soonest first.
async function loadReadings() {
  const list = $("#readingList");
  try {
    const items = await api("/api/library/upcoming");
    if (!items.length) {
      list.replaceChildren(el("li", { class: "empty-note" }, "Nothing yet. Tap a class below to add readings, notes and files."));
      return;
    }
    list.replaceChildren(
      ...items.slice(0, 6).map((i) => {
        const past = i.readBy < ymdLocal();
        const cls = past || i.readBy === ymdLocal() ? "urgent" : i.readBy <= ymdLocal(new Date(Date.now() + 2 * 864e5)) ? "soon" : "later";
        return el(
          "li",
          { class: `deadline ${cls}`, tabindex: "0", role: "button", onclick: () => openClass(i.courseId, i.id), onkeydown: (e) => e.key === "Enter" && openClass(i.courseId, i.id) },
          el("span", { class: "bar" }),
          el("div", { class: "info" }, el("div", { class: "title" }, i.kind === "task" ? i.title : `Read: ${i.title}`), el("div", { class: "meta" }, `${shortCourse(courseById(i.courseId)?.name || "")}${i.remindAt ? " · 🔔 reminder set" : ""}`)),
          el("span", { class: "when" }, past ? "Late" : dayLabel(i.readBy).replace(/,.*/, "")),
        );
      }),
    );
  } catch {
    list.replaceChildren();
  }
}

async function openClass(courseId, focusId = null) {
  const course = courseById(courseId) || { id: Number(courseId), name: "Class" };
  lib.course = course;
  lib.open = focusId;
  lib.scrollTo = focusId;
  lib.editing = null;
  $("#classTitle").textContent = course.name;
  $("#libEditor").classList.add("hidden");
  $("#libList").replaceChildren(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
  const sheet = $("#classSheet");
  if (!sheet.open) sheet.showModal();
  await refreshClass();
}

async function refreshClass() {
  try {
    lib.data = await api(`/api/library/${lib.course.id}`);
    renderClass();
  } catch (err) {
    $("#libList").replaceChildren(el("div", { class: "empty-note" }, err.message));
  }
}

function renderClass() {
  const d = lib.data;
  $("#dayChips").replaceChildren(
    ...DAY_ORDER.map((day) =>
      el(
        "button",
        {
          type: "button",
          class: `day-chip${d.classDays.includes(day) ? " on" : ""}`,
          "aria-pressed": String(d.classDays.includes(day)),
          title: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
          onclick: async () => {
            const days = d.classDays.includes(day) ? d.classDays.filter((x) => x !== day) : [...d.classDays, day];
            lib.data = await api(`/api/library/${lib.course.id}/days`, { method: "PUT", body: { days } });
            renderClass();
          },
        },
        DAY_SHORT[day],
      ),
    ),
  );
  $("#nextClass").textContent = d.nextClass ? `Next class: ${dayLabel(d.nextClass)}` : "Tap the days it meets";

  const today = ymdLocal();
  const groups = [
    ["Due next class", (i) => !i.done && i.readBy && d.nextClass && i.readBy <= d.nextClass],
    ["Coming up", (i) => !i.done && i.readBy && !(d.nextClass && i.readBy <= d.nextClass)],
    ["Notes & files", (i) => !i.done && !i.readBy],
    ["Done", (i) => i.done],
  ];
  if (!d.nextClass) groups[0] = ["Overdue & today", (i) => !i.done && i.readBy && i.readBy <= today];
  const used = new Set();
  const sections = [];
  for (const [label, test] of groups) {
    const items = d.items.filter((i) => !used.has(i.id) && test(i));
    items.forEach((i) => used.add(i.id));
    if (label !== "Notes & files" && label !== "Done") items.sort((a, b) => a.readBy.localeCompare(b.readBy));
    if (items.length) sections.push(el("div", { class: "lib-group" }, label), ...items.map(libRow));
  }
  $("#libList").replaceChildren(
    ...(sections.length
      ? sections
      : [
          el(
            "div",
            { class: "lib-empty" },
            el("div", { class: "lib-empty-icon", html: icon("folder", 28) }),
            el("b", {}, "This class is empty"),
            el("p", {}, "Upload your notes or slides, write a note, add a reading that's due next class, or let Cuss bring in the files from Canvas."),
          ),
        ]),
  );
  if (lib.scrollTo) document.getElementById(`lib-${lib.scrollTo}`)?.scrollIntoView({ block: "center" });
  lib.scrollTo = null;
}

function libRow(item) {
  const kindIcon = { canvas: "file", upload: "upload", note: "note", task: "list" }[item.kind];
  const source = { canvas: "From Canvas", upload: "Uploaded", note: item.addedBy === "cuss" ? "Saved by Cuss" : "Your note", task: item.addedBy === "cuss" ? "Added by Cuss" : "To-do" }[item.kind];
  const due = dueText(item, lib.data.nextClass);
  const late = item.readBy && item.readBy < ymdLocal() && !item.done;
  const open = lib.open === item.id;
  const row = el(
    "div",
    { class: `lib-item${item.done ? " done" : ""}${open ? " open" : ""}`, id: `lib-${item.id}` },
    el(
      "div",
      { class: "lib-main" },
      el("input", {
        type: "checkbox",
        class: "lib-check",
        checked: item.done,
        "aria-label": item.done ? "Mark not done" : "Mark done",
        onchange: (e) => patchItem(item, { done: e.target.checked }),
      }),
      el(
        "button",
        { type: "button", class: "lib-body", "aria-expanded": String(open), onclick: () => ((lib.open = open ? null : item.id), renderClass()) },
        el("span", { class: `lib-kind k-${item.kind}`, html: icon(kindIcon, 16) }),
        el(
          "span",
          { class: "lib-text" },
          el("span", { class: "lib-title" }, item.title),
          el("span", { class: "lib-meta" }, [source, due && el("b", { class: late ? "late" : "" }, due), item.remindAt && `🔔 ${new Date(item.remindAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`].filter(Boolean).flatMap((x, n) => (n ? [" · ", x] : [x]))),
        ),
      ),
    ),
  );
  if (open) row.append(libActions(item));
  return row;
}

function libActions(item) {
  const box = el("div", { class: "lib-actions-panel" });
  const course = lib.course.name;
  const ask = (prompt) => {
    $("#classSheet").close();
    closePanels();
    send(prompt);
  };
  const due = el(
    "div",
    { class: "lib-line" },
    el("span", { class: "lib-line-label" }, "Read by"),
    el("button", { type: "button", class: "chip", onclick: () => patchItem(item, { readBy: "next_class" }) }, "Next class"),
    el("input", { type: "date", class: "chip-date", value: item.readBy || "", "aria-label": "Pick a date", onchange: (e) => patchItem(item, { readBy: e.target.value }) }),
    item.readBy && el("button", { type: "button", class: "chip ghost", onclick: () => patchItem(item, { readBy: "" }) }, "Clear"),
  );
  const defaultRemind = () => {
    const base = item.readBy ? new Date(item.readBy + "T19:00:00") : new Date(Date.now() + 864e5);
    if (item.readBy) base.setDate(base.getDate() - 1);
    else base.setHours(18, 0, 0, 0);
    return new Date(base - base.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  };
  const remindInput = el("input", { type: "datetime-local", class: "chip-date", value: item.remindAt ? new Date(new Date(item.remindAt) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : defaultRemind(), "aria-label": "Reminder time" });
  const remind = el(
    "div",
    { class: "lib-line" },
    el("span", { class: "lib-line-label" }, "Remind me"),
    remindInput,
    el("button", { type: "button", class: "chip", onclick: () => remindInput.value && patchItem(item, { remindAt: new Date(remindInput.value).toISOString() }, "Reminder set") }, item.remindAt ? "Update" : "Set"),
    item.remindAt && el("button", { type: "button", class: "chip ghost", onclick: () => patchItem(item, { remindAt: "" }) }, "Remove"),
  );
  const apple = el(
    "div",
    { class: "lib-line" },
    el("button", { type: "button", class: "chip", onclick: () => addToCalendar(item) }, iconEl("calendar", 14), "Add to Calendar"),
    el("button", { type: "button", class: "chip", onclick: () => addToReminders(item) }, iconEl("bell", 14), "Add to Reminders"),
  );
  const study = el(
    "div",
    { class: "lib-line" },
    el("button", { type: "button", class: "chip accent", onclick: () => ask(`Summarize "${item.title}" from my ${course} class library (item ${item.id}).`) }, iconEl("sparkles", 14), "Summarize"),
    el("button", { type: "button", class: "chip accent", onclick: () => ask(`Quiz me on "${item.title}" from my ${course} class library (item ${item.id}).`) }, iconEl("help", 14), "Quiz me"),
    item.kind === "upload" && el("a", { class: "chip", href: `/api/library/item/${item.id}/file`, target: "_blank", rel: "noopener" }, iconEl("external", 14), "Open"),
    (item.kind === "note" || item.kind === "task") && el("button", { type: "button", class: "chip", onclick: () => editItem(item) }, iconEl("note", 14), item.hasText ? "View & edit" : "Edit"),
    el("span", { class: "spacer" }),
    el(
      "button",
      {
        type: "button",
        class: "chip danger",
        onclick: async () => {
          if (!confirm(`Delete “${item.title}”?`)) return;
          await api(`/api/library/item/${item.id}`, { method: "DELETE" });
          lib.open = null;
          refreshClass();
          loadReadings();
        },
      },
      iconEl("trash", 14),
      "Delete",
    ),
  );
  box.append(due, remind, apple, study);
  return box;
}

async function patchItem(item, patch, message) {
  try {
    await api(`/api/library/item/${item.id}`, { method: "PATCH", body: patch });
    if (message) toast(message, item.title, { iconName: "bell" });
    await refreshClass();
    loadReadings();
  } catch (err) {
    toast("Couldn't save that", err.message, { iconName: "alert" });
  }
}

// --- Notes and to-dos editor
function showEditor(kind, item = null) {
  lib.editing = { kind, item };
  const f = $("#libEditor");
  f.classList.remove("hidden");
  $("#libEditTitle").value = item?.title || "";
  $("#libEditTitle").placeholder = kind === "task" ? "e.g. Read chapter 4, pages 80–95" : "Title, e.g. Week 8 lecture notes";
  $("#libEditText").value = item?.text || "";
  $("#libEditText").placeholder = kind === "task" ? "Details (optional)" : "Your notes…";
  $("#libEditText").rows = kind === "task" ? 2 : 7;
  $("#libEditDue").value = item?.readBy ? "pick" : kind === "task" && lib.data.nextClass ? "next_class" : "";
  $("#libEditDate").value = item?.readBy || "";
  $("#libEditDate").classList.toggle("hidden", $("#libEditDue").value !== "pick");
  $("#libEditDue").closest(".lib-editor-row").querySelector("label").classList.toggle("hidden", !!item);
  $("#libEditDate").classList.toggle("hidden", !!item || $("#libEditDue").value !== "pick");
  $("#libEditTitle").focus();
}

async function editItem(item) {
  const full = await api(`/api/library/item/${item.id}`);
  showEditor(item.kind, full);
}

$("#libEditDue").addEventListener("change", (e) => $("#libEditDate").classList.toggle("hidden", e.target.value !== "pick"));
$("#libEditCancel").addEventListener("click", () => $("#libEditor").classList.add("hidden"));
$("#libEditor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { kind, item } = lib.editing || {};
  const title = $("#libEditTitle").value.trim();
  const text = $("#libEditText").value;
  const choice = $("#libEditDue").value;
  const readBy = choice === "pick" ? $("#libEditDate").value || undefined : choice || undefined;
  try {
    if (item) await api(`/api/library/item/${item.id}`, { method: "PATCH", body: { title, text } });
    else await api(`/api/library/${lib.course.id}/${kind === "task" ? "tasks" : "notes"}`, { method: "POST", body: { title: title || (kind === "task" ? "" : `Notes · ${dayLabel(ymdLocal())}`), text, readBy } });
    $("#libEditor").classList.add("hidden");
    await refreshClass();
    loadReadings();
  } catch (err) {
    toast("Couldn't save that", err.message, { iconName: "alert" });
  }
});
$("#libNewNote").addEventListener("click", () => showEditor("note"));
$("#libNewTask").addEventListener("click", () => showEditor("task"));
$("#classClose").addEventListener("click", () => $("#classSheet").close());
$("#classSheet").addEventListener("click", (e) => e.target === $("#classSheet") && $("#classSheet").close());

$("#libUpload").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  for (const f of files) {
    try {
      const res = await fetch(`/api/library/${lib.course.id}/upload`, {
        method: "POST",
        headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) },
        body: f,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      toast("Uploaded", f.name, { iconName: "upload" });
    } catch (err) {
      toast(`Couldn't upload ${f.name}`, err.message, { iconName: "alert" });
    }
  }
  refreshClass();
});

$("#libImport").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const r = await api(`/api/library/${lib.course.id}/import`, { method: "POST" });
    toast(r.added ? `Brought in ${r.added} file${r.added === 1 ? "" : "s"} from Canvas` : "Already up to date", r.total ? `${r.total} file${r.total === 1 ? "" : "s"} in this Canvas course` : "This course has no files in Canvas yet.", { iconName: "sparkles" });
    await refreshClass();
  } catch (err) {
    toast("Couldn't reach Canvas", err.message, { iconName: "alert" });
  } finally {
    btn.disabled = false;
  }
});

// --- iPhone Calendar and Reminders
function itemWhen(item) {
  if (item.remindAt) return new Date(item.remindAt);
  if (item.readBy) return new Date(item.readBy + "T09:00:00");
  return null;
}

async function addToCalendar(item, courseName = lib.course?.name || "") {
  if (!item.readBy && !item.remindAt) return toast("Pick a date first", "Set “Read by” or a reminder, then add it to your calendar.", { iconName: "calendar" });
  const native = nativeCal();
  if (native?.createEvent) {
    try {
      await native.requestFullCalendarAccess?.();
      const start = item.readBy ? new Date(item.readBy + "T00:00:00") : new Date(item.remindAt);
      await native.createEvent({
        title: item.kind === "task" ? item.title : `Read: ${item.title}`,
        startDate: start.getTime(),
        endDate: item.readBy ? start.getTime() + 864e5 : start.getTime() + 15 * 6e4,
        isAllDay: !!item.readBy,
        notes: courseName,
        alerts: item.readBy ? [-360] : [0],
      });
      return toast("Added to Calendar", item.title, { iconName: "calendar" });
    } catch {}
  }
  // iPhone Safari opens this as an event with an "Add to Calendar" button;
  // computers download it for Calendar, Outlook or Google Calendar.
  location.href = `/api/library/item/${item.id}/ics`;
}

async function addToReminders(item, courseName = lib.course?.name || "") {
  const when = itemWhen(item);
  const title = item.kind === "task" ? item.title : `Read: ${item.title}`;
  const native = nativeCal();
  if (native?.createReminder) {
    try {
      await native.requestFullRemindersAccess?.();
      await native.createReminder({ title, notes: courseName, dueDate: when?.getTime() });
      return toast("Added to Reminders", title, { iconName: "bell" });
    } catch {}
  }
  const text = `${title}${courseName ? ` (${shortCourse(courseName)})` : ""}${when ? `, ${item.readBy ? `by ${dayLabel(item.readBy)}` : when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast("Copied", "Paste it into Reminders. In the iPhone app, Cuss adds it directly.", { iconName: "bell" });
}

// Chat card when Cuss adds a reading, to-do or notes to a class.
function libraryCard({ courseId, courseName, item }) {
  const due = item.readBy ? `Read by ${dayLabel(item.readBy)}` : "";
  const remind = item.remindAt ? `🔔 ${new Date(item.remindAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";
  const what = item.kind === "note" ? "Saved to" : "Added to";
  return el(
    "div",
    { class: "card lib-card" },
    cardHead(item.kind === "note" ? "note" : "list", `${what} ${shortCourse(courseName) || "your class"}`),
    el("div", { class: "lib-card-title" }, item.title),
    (due || remind) && el("div", { class: "lib-card-meta" }, [due, remind].filter(Boolean).join(" · ")),
    el(
      "div",
      { class: "lib-line" },
      (item.readBy || item.remindAt) && el("button", { type: "button", class: "chip", onclick: () => addToCalendar(item, courseName) }, iconEl("calendar", 14), "Add to Calendar"),
      item.kind !== "note" && el("button", { type: "button", class: "chip", onclick: () => addToReminders(item, courseName) }, iconEl("bell", 14), "Add to Reminders"),
      el("button", { type: "button", class: "chip accent", onclick: () => openClass(courseId, item.id) }, iconEl("folder", 14), "Open class"),
    ),
  );
}

// A private calendar link that keeps deadlines, readings and reminders in sync.
async function subscribeCalendar({ copyOnly = false, reset = false } = {}) {
  try {
    const { https, webcal } = await api("/api/calendar-link", { method: "POST", body: { reset } });
    if (reset) return toast("Old calendar link turned off", "Tap Add to iPhone Calendar again to subscribe with the new one.", { iconName: "calendar" });
    if (!copyOnly && isApple && !/localhost|127\.0\.0\.1/.test(https)) {
      location.href = webcal;
      toast("Opening Calendar", "Tap Subscribe. Deadlines, readings and reminders stay in sync.", { iconName: "calendar" });
    } else {
      await navigator.clipboard?.writeText(https).catch(() => {});
      toast("Calendar link copied", /localhost|127\.0\.0\.1/.test(https) ? "This link works once Cuss is online (not on localhost)." : "Google Calendar: Other calendars → From URL. Outlook: Add calendar → Subscribe from web.", { iconName: "calendar" });
    }
  } catch (err) {
    toast("Couldn't make a calendar link", err.message, { iconName: "alert" });
  }
}
$("#calSubscribeBtn").addEventListener("click", () => subscribeCalendar());
$("#calSubscribeBtn2").addEventListener("click", () => subscribeCalendar());
$("#calCopyBtn").addEventListener("click", () => subscribeCalendar({ copyOnly: true }));
$("#calResetBtn").addEventListener("click", () => confirm("Turn off your current calendar link? Calendars subscribed to it stop updating.") && subscribeCalendar({ reset: true }));
