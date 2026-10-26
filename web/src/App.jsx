// Cuss for Canvas: chats on the left, the conversation in the middle and the
// Today panel on the right. Phones get a tab bar and slide-in panels instead.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContext, Icon, Modal, Toasts, useMediaQuery, useToasts } from "./ui.jsx";
import { api, initials, store, timeZone } from "./lib/util.js";
import { Recognition, isListening, listenOnce, speak, stopListening, stopSpeaking } from "./lib/speech.js";
import { subscribeCalendar } from "./lib/calendar.js";
import { summarize, useDashboard } from "./useDashboard.js";
import { useChat } from "./useChat.js";
import Messages from "./Messages.jsx";
import TodayPanel from "./TodayPanel.jsx";
import Settings from "./Settings.jsx";
import ClassSheet from "./ClassSheet.jsx";

const HINT = (
  <>
    <kbd>Enter</kbd> to send · <kbd>Shift Enter</kbd> for a new line
  </>
);

export default function App() {
  const { toasts, toast, dismiss } = useToasts();
  const [status, setStatus] = useState(null);
  const isTeacher = status?.role === "teacher";
  const dash = useDashboard(status);
  const summary = summarize(dash, isTeacher);
  const openDraftRef = useRef(null); // newest unsent email draft, for the "send it" voice command

  // --- Panels and layout
  const mobile = useMediaQuery("(max-width:760px)");
  const narrow = useMediaQuery("(max-width:1180px)");
  const [drawer, setDrawer] = useState(null); // "history" | "today" (phones and tablets)
  const [todayCollapsed, setTodayCollapsed] = useState(() => store.get("todayCollapsed", false));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => store.get("sidebarCollapsed", false));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [classTarget, setClassTarget] = useState(null);
  const refs = { newChat: useRef(null), refresh: useRef(null), todayBtn: useRef(null), chatTab: useRef(null), input: useRef(null), sidebar: useRef(null), today: useRef(null) };
  useEffect(() => store.set("todayCollapsed", todayCollapsed), [todayCollapsed]);
  useEffect(() => store.set("sidebarCollapsed", sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => {
    document.body.classList.toggle("teacher", isTeacher);
  }, [isTeacher]);

  const closePanels = useCallback(() => {
    const wasToday = refs.today.current?.contains(document.activeElement);
    const drawerFocused = wasToday || refs.sidebar.current?.contains(document.activeElement);
    setDrawer(null);
    if (drawerFocused) {
      if (matchMedia("(max-width:760px)").matches) refs.chatTab.current?.focus();
      else if (wasToday) refs.todayBtn.current?.focus();
    }
  }, []);
  const openDrawer = (name) => {
    setDrawer(name);
    setTimeout(() => (name === "history" ? refs.newChat : refs.refresh).current?.focus());
  };
  const historyOpen = mobile && drawer === "history";
  const todayOpen = narrow && drawer === "today";

  // --- Chat
  const [speakReplies, setSpeakReplies] = useState(() => store.get("speakReplies", false));
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const speakRef = useRef(speakReplies);
  speakRef.current = speakReplies;
  const [chats, setChats] = useState(null);
  const [chatsError, setChatsError] = useState(false);

  const loadChatList = useCallback(async () => {
    try {
      setChats(await api("/api/chats"));
      setChatsError(false);
    } catch {
      setChatsError(true);
    }
  }, []);
  const onSent = useCallback(
    (text) => {
      loadChatList();
      if (/remind|due|deadline|submitted/i.test(text)) dash.loadDashboard();
    },
    [loadChatList, dash.loadDashboard],
  );
  const chat = useChat({ toast, onSent, openDraftRef });
  const [input, setInput] = useState("");
  const chatTitle = chats?.find((c) => c.id === chat.chatId)?.title;

  const send = useCallback(
    (text, opts = {}) => {
      if (!opts.viaVoice && !chat.busy) setInput("");
      return chat.send(text, { ...opts, voiceOut: speakRef.current || voiceModeRef.current, voiceMode: voiceModeRef.current, onCaption: setVoiceCaption });
    },
    [chat.send, chat.busy],
  );
  const newChat = () => {
    stopSpeaking();
    chat.newChat();
    loadChatList();
    closePanels();
    refs.input.current?.focus();
  };
  const openChat = useCallback(
    async (id, opts) => {
      stopSpeaking();
      const opened = await chat.openChat(id, opts);
      if (opened) {
        loadChatList();
        closePanels();
      }
    },
    [chat.openChat, loadChatList, closePanels],
  );

  // --- Voice
  const [listeningDictation, setListeningDictation] = useState(false);
  const [voiceState, setVoiceState] = useState({ mode: "listening", label: "Listening…" });
  const [voiceCaption, setVoiceCaptionRaw] = useState("Ask about deadlines, studying, or your professors.");
  const [voiceButton, setVoiceButton] = useState("Tap to talk");
  function setVoiceCaption(text) {
    setVoiceCaptionRaw(text.length > 280 ? "…" + text.slice(-280) : text);
  }

  const dictate = async () => {
    if (isListening()) return stopListening();
    setListeningDictation(true);
    const text = await listenOnce(setInput, toast);
    setListeningDictation(false);
    if (!text) return;
    const reply = await send(text, { viaVoice: true });
    setInput("");
    if (speakRef.current && reply) speak(reply);
  };

  const voiceTurn = async () => {
    if (!voiceModeRef.current) return;
    setVoiceState({ mode: "listening", label: "Listening…" });
    setVoiceCaption("Go ahead, I'm listening. Take your time.");
    setVoiceButton("Done");
    const text = await listenOnce(setVoiceCaption, toast);
    setVoiceButton("Tap to talk");
    if (!voiceModeRef.current) return;
    if (!text) {
      setVoiceState({ mode: "listening", label: "Tap to talk" });
      setVoiceCaption("I didn't hear anything. Tap “Tap to talk” and try again.");
      return;
    }
    setVoiceState({ mode: "thinking", label: "Thinking…" });
    const reply = await send(text, { viaVoice: true });
    if (!voiceModeRef.current) return;
    if (!reply) return voiceTurn();
    setVoiceState({ mode: "speaking", label: "Speaking…" });
    setVoiceCaption(reply);
    speak(reply, () => voiceModeRef.current && setTimeout(voiceTurn, 250));
  };
  const openVoiceMode = () => {
    if (!Recognition) return toast("Voice mode needs Chrome, Edge or Safari", "You can still type to Cuss.", { iconName: "mic" });
    voiceModeRef.current = true;
    setVoiceMode(true);
    voiceTurn();
  };
  const closeVoiceMode = () => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    stopListening();
    stopSpeaking();
  };
  const toggleSpeak = () => {
    const on = !speakReplies;
    setSpeakReplies(on);
    store.set("speakReplies", on);
    if (!on) stopSpeaking();
  };

  // --- Status, notifications and start-up
  const refreshStatus = useCallback(async () => setStatus(await api("/api/status")), []);
  const lastNotification = useRef(store.get("lastNotification", new Date().toISOString()));
  const pollNotifications = async () => {
    try {
      const items = await api(`/api/notifications?since=${encodeURIComponent(lastNotification.current)}`);
      for (const n of items) {
        const open = n.chatId ? () => openChat(n.chatId) : n.conversationId ? () => send(`Open my Canvas message "${n.body}" and tell me what it says.`) : n.url ? () => window.open(n.url, "_blank") : undefined;
        toast(n.title, n.body, { iconName: n.chatId ? "sun" : n.conversationId ? "message" : /announcement/i.test(n.title) ? "megaphone" : "clock", onclick: open });
        if (n.conversationId) dash.loadInbox();
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
          const note = new Notification(n.title, { body: n.body, tag: n.id });
          note.onclick = () => {
            window.focus();
            open?.();
          };
        }
        lastNotification.current = n.createdAt;
      }
      if (items.length) {
        store.set("lastNotification", lastNotification.current);
        dash.loadDashboard();
        loadChatList();
      }
    } catch {}
  };
  const poll = useRef(pollNotifications);
  poll.current = pollNotifications;

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    (async () => {
      try {
        await refreshStatus();
        // Scheduled briefings and reminders must use the same zone as this browser.
        await api("/api/settings", { method: "POST", body: { timeZone } });
      } catch (err) {
        if (err.message !== "Please log in.") toast("Can't reach the Cuss server", "Make sure `npm start` is running.", { iconName: "alert" });
        return;
      }
      await chat.openChat(chat.chatId, { quiet: true });
      loadChatList();
    })();
  }, []);

  useEffect(() => {
    if (!status) return;
    if (!status.aiReady) toast("AI not set up yet", "The app owner needs to add ANTHROPIC_API_KEY on the server.", { iconName: "alert" });
    dash.loadDashboard();
    poll.current();
    const a = setInterval(() => poll.current(), 30 * 1000);
    const b = setInterval(dash.loadDashboard, 10 * 60 * 1000);
    return () => (clearInterval(a), clearInterval(b));
  }, [status?.studentName, status?.role]);

  // Keyboard: ⌘M dictates, Escape closes voice mode or panels.
  const keys = useRef();
  keys.current = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") e.preventDefault(), dictate();
    if (e.key === "Escape") voiceModeRef.current ? closeVoiceMode() : closePanels();
  };
  useEffect(() => {
    const on = (e) => keys.current(e);
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);

  // Courses for the class sheet, from whichever dashboard is loaded.
  const courses = isTeacher ? dash.teacher.data?.map((c) => ({ id: c.id, name: c.name })) : dash.courses.data;
  const courseById = useCallback((id) => (courses || []).find((c) => c.id === Number(id)), [courses]);

  const ctx = useMemo(
    () => ({
      status,
      isTeacher,
      toast,
      dash,
      send,
      openChat,
      closePanels,
      courseById,
      openDraftRef,
      refreshStatus,
      openClass: (courseId, focusId = null) => setClassTarget({ courseId, focusId }),
      subscribeCalendar: (opts) => subscribeCalendar(toast, opts),
      voiceOut: () => speakRef.current || voiceModeRef.current,
    }),
    [status, isTeacher, toast, dash, send, openChat, closePanels, courseById, refreshStatus],
  );

  // Keyboard and screen readers skip whatever is hidden behind a panel.
  const sidebarInert = (mobile && todayOpen) || (!mobile && sidebarCollapsed);
  const todayInert = historyOpen || (!narrow && todayCollapsed);
  const activeTab = historyOpen ? "history" : todayOpen ? "today" : "chat";
  const badge = summary?.badge || 0;
  const s = status;

  return (
    <AppContext.Provider value={ctx}>
      <a className="skip-link" href="#input">
        Skip to message box
      </a>
      <div className={`app${todayCollapsed ? " today-collapsed" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <aside ref={refs.sidebar} className={`sidebar${historyOpen ? " open" : ""}`} id="sidebar" aria-label="Chats" inert={sidebarInert}>
          <div className="brand">
            <img className="logo-img" src="/logo-3d.svg" alt="Cuss" />
            <div className="brand-text">
              <div className="brand-name">Cuss</div>
              <div className="brand-sub">{s?.independent ? "Independent mode on" : "for Canvas"}</div>
            </div>
          </div>
          <button ref={refs.newChat} className="new-chat" onClick={newChat}>
            <Icon name="plus" />
            New chat
          </button>
          <div className="side-label">Recent</div>
          <ChatList chats={chats} error={chatsError} retry={loadChatList} activeId={chat.chatId} openChat={openChat} onDeleted={(id) => (id === chat.chatId ? newChat() : loadChatList())} />
          <div className="side-foot">
            <div className="avatar">{s ? initials(s.studentName) : "?"}</div>
            <div className="who">
              <div className="who-name">{s?.studentName || "Student"}</div>
              <div className="who-sub">{s ? `${isTeacher ? "Professor · " : ""}${s.demo ? "Demo University" : s.schoolName || "Canvas"}` : "Canvas"}</div>
            </div>
            <button className="icon-btn ghost" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Icon name="settings" />
            </button>
          </div>
        </aside>
        <div className={`scrim${drawer && (historyOpen || todayOpen) ? " show" : ""}`} onClick={closePanels} />

        <main className="chat" inert={historyOpen || todayOpen}>
          <header className="chat-head">
            <button id="menuBtn" className="icon-btn ghost only-mobile" aria-controls="sidebar" aria-expanded={String(historyOpen)} title="Chats" aria-label="Chats" onClick={() => openDrawer("history")}>
              <Icon name="menu" />
            </button>
            <button
              id="sidebarToggle"
              className="icon-btn ghost only-sidebar-toggle"
              aria-controls="sidebar"
              aria-expanded={String(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Show the sidebar" : "Hide the sidebar"}
              aria-label={sidebarCollapsed ? "Show the sidebar" : "Hide the sidebar"}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <Icon name="sidebar" />
            </button>
            <button id="newChatMini" className={`icon-btn ghost only-sidebar-toggle${sidebarCollapsed ? "" : " hidden"}`} title="New chat" aria-label="New chat" onClick={newChat}>
              <Icon name="plus" />
            </button>
            <div className="chat-title">{chat.items.length && chatTitle ? chatTitle : "New chat"}</div>
            <div className="head-actions">
              {s?.demo && <span className="demo-pill">DEMO</span>}
              <button className="toggle" aria-pressed={String(speakReplies)} title="Read replies out loud" aria-label="Read replies out loud" onClick={toggleSpeak}>
                <Icon name={speakReplies ? "volume" : "mute"} size={16} />
                <span>Voice replies</span>
              </button>
              <button
                id="panelToggle"
                className={`icon-btn ghost only-wide${todayCollapsed ? "" : " on"}`}
                aria-controls="today"
                aria-expanded={String(!todayCollapsed)}
                title={todayCollapsed ? "Show the Today panel" : "Hide the Today panel"}
                aria-label={todayCollapsed ? "Show the Today panel" : "Hide the Today panel"}
                onClick={() => setTodayCollapsed(!todayCollapsed)}
              >
                <Icon name="panel" />
              </button>
              <button ref={refs.todayBtn} id="todayBtn" className="icon-btn ghost only-narrow" aria-controls="today" aria-expanded={String(todayOpen)} title="Today" aria-label="Today" onClick={() => openDrawer("today")}>
                <Icon name="calendar" />
                {badge ? <span className="badge">{badge}</span> : null}
              </button>
            </div>
          </header>

          <Messages items={chat.items} scrollSignal={chat.scrollSignal} summary={summary} />

          <div className="composer-wrap">
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <button type="button" className={`comp-btn${listeningDictation ? " listening" : ""}`} title={Recognition ? "Dictate (⌘M)" : "Voice input needs Chrome, Edge or Safari"} aria-label="Dictate (⌘M)" onClick={dictate}>
                <Icon name="mic" />
              </button>
              <AutoTextarea
                inputRef={refs.input}
                value={input}
                onChange={setInput}
                placeholder={isTeacher ? "Ask Cuss about your classes…" : "Ask Cuss anything…"}
                onEnter={() => send(input)}
              />
              <button type="button" id="voiceModeBtn" className="comp-btn voice-mode-btn" title="Voice conversation" aria-label="Voice conversation" onClick={openVoiceMode}>
                <Icon name="wave" />
              </button>
              <button type="submit" className="send" title="Send" aria-label="Send" disabled={chat.busy}>
                <Icon name="up" />
              </button>
            </form>
            <div className={`composer-hint${listeningDictation ? " live" : ""}`}>{listeningDictation ? "Listening… tap the mic again to stop." : HINT}</div>
          </div>
        </main>

        <TodayPanel ref={refs.today} refreshRef={refs.refresh} dash={dash} summary={summary} open={todayOpen} inert={todayInert} />
      </div>

      <nav className="tabbar" id="tabbar" aria-label="Sections">
        {[
          ["chat", "message", "Chat"],
          ["history", "history", "History"],
          ["voice", "wave", "Talk"],
          ["today", "calendar", "Today"],
          ["settings", "settings", "Settings"],
        ].map(([tab, ic, label]) => (
          <button
            key={tab}
            ref={tab === "chat" ? refs.chatTab : undefined}
            className={`${tab === "voice" ? "tab-talk" : ""}${activeTab === tab ? " active" : ""}`.trim() || undefined}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => {
              if (tab === "voice") return openVoiceMode();
              if (tab === "settings") return setSettingsOpen(true);
              if (tab === "chat") closePanels();
              else openDrawer(tab);
              if (navigator.vibrate) navigator.vibrate(8);
            }}
          >
            {tab === "voice" ? (
              <span className="talk-orb">
                <Icon name={ic} size={22} />
              </span>
            ) : (
              <Icon name={ic} size={22} />
            )}
            <span>{label}</span>
            {tab === "today" && badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </nav>

      <Modal open={voiceMode} onClose={closeVoiceMode} className={`voice-overlay ${voiceState.mode}${voiceMode ? "" : " hidden"}`} aria-label="Voice conversation" aria-live="polite">
        <button className="icon-btn ghost voice-close" title="End voice mode" aria-label="End voice mode" onClick={closeVoiceMode}>
          <Icon name="x" />
        </button>
        <div className="orb big-orb">
          <span />
        </div>
        <div className="voice-state">{voiceState.label}</div>
        <div className="voice-caption">{voiceCaption}</div>
        <div className="voice-actions">
          {/* While listening this is "Done" and sends right away. Otherwise it
              starts listening, directly inside the tap: iPhone Safari blocks a
              microphone start that comes later. */}
          <button
            className="btn ghost"
            onClick={() => {
              if (chat.busy) return;
              if (isListening()) return stopListening();
              stopSpeaking();
              voiceTurn();
            }}
          >
            {voiceButton}
          </button>
          <button className="btn danger-solid" onClick={closeVoiceMode}>
            End
          </button>
        </div>
      </Modal>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ClassSheet target={classTarget} onClose={() => setClassTarget(null)} />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </AppContext.Provider>
  );
}

function ChatList({ chats, error, retry, activeId, openChat, onDeleted }) {
  if (error)
    return (
      <ul className="chat-list">
        <li className="load-error">
          <span>Couldn’t load chats.</span>
          <button type="button" className="link-btn" onClick={retry}>
            Try again
          </button>
        </li>
      </ul>
    );
  return (
    <ul className="chat-list">
      {chats && !chats.length && <li className="empty-note">Your chats will show up here.</li>}
      {chats?.map((c) => (
        <li key={c.id} className={`chat-item${c.id === activeId ? " active" : ""}`} title={c.title}>
          <button type="button" className="chat-open" onClick={() => openChat(c.id)} aria-current={c.id === activeId ? "true" : undefined}>
            <span>
              <Icon name={c.kind === "briefing" ? "sun" : "message"} size={16} />
            </span>
            <span className="t">{c.title}</span>
          </button>
          <button
            className="del"
            title="Delete chat"
            aria-label={`Delete chat “${c.title}”`}
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm(`Delete "${c.title}"?`)) return;
              await api(`/api/chats/${c.id}`, { method: "DELETE" });
              onDeleted(c.id);
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}

// The message box grows with its text, up to a limit.
function AutoTextarea({ inputRef, value, onChange, placeholder, onEnter }) {
  useEffect(() => {
    const t = inputRef.current;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 180) + "px";
  }, [value]);
  return (
    <textarea
      ref={inputRef}
      id="input"
      rows={1}
      placeholder={placeholder}
      aria-label="Message Cuss"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
