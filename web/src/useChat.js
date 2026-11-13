// The conversation on screen and sending messages to Cuss. Replies stream in
// as lines of JSON: text deltas, "what Cuss is doing" steps, cards and errors.
import { useCallback, useRef, useState } from "react";
import { api, plainText, store, timeZone } from "./lib/util.js";

let nextKey = 0;
const key = () => ++nextKey;

// Turns a saved chat into on-screen items.
const fromDisplay = (display) =>
  display.map((item) =>
    item.card ? { key: key(), kind: "card", card: item.card } : item.steps ? { key: key(), kind: "steps", steps: item.steps } : item.role === "user" ? { key: key(), kind: "user", text: item.text } : { key: key(), kind: "bot", text: item.text },
  );

const upsertStep = (steps, ev) => {
  const i = steps.findIndex((s) => s.id === ev.id);
  const step = { id: ev.id, text: ev.text, state: ev.state };
  return i < 0 ? [...steps, step] : steps.map((s, n) => (n === i ? step : s));
};

export function useChat({ toast, onSent, openDraftRef }) {
  const [chatId, setChatId] = useState(() => store.get("chatId", null) || crypto.randomUUID());
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [scrollSignal, setScrollSignal] = useState(null); // "bottom" | "top" after a chat opens
  const chatIdRef = useRef(chatId);
  const busyRef = useRef(false);
  const view = useRef(0); // bumps whenever the chat on screen changes, so an old reply stops drawing into it

  const show = (id, list) => {
    view.current++;
    chatIdRef.current = id;
    setChatId(id);
    store.set("chatId", id);
    openDraftRef.current = null;
    setItems(list);
  };

  const newChat = useCallback(() => show(crypto.randomUUID(), []), []);

  const openChat = useCallback(
    async (id, { quiet = false } = {}) => {
      try {
        const chat = await api(`/api/chats/${id}`);
        show(id, fromDisplay(chat.display));
        setScrollSignal({ to: chat.display.length ? "bottom" : "top" });
        return chat;
      } catch (err) {
        if (!quiet) toast("Couldn't open chat", err.message, { iconName: "alert" });
      }
    },
    [toast],
  );

  // Sends one message and resolves with the spoken-style reply (for voice).
  const send = useCallback(
    async (text, { viaVoice = false, voiceOut = false, voiceMode = false, onCaption } = {}) => {
      text = text.trim();
      if (!text) return null;
      if (busyRef.current) {
        toast("One moment", "Cuss is still finishing the last answer.", { iconName: "clock" });
        return null;
      }

      // Voice shortcut: "send it" sends the open email draft.
      if (viaVoice && openDraftRef.current && /^(yes,? )?(send( it| the (email|message))?|go ahead and send( it)?)[.!]?$/i.test(text)) {
        setItems((all) => [...all, { key: key(), kind: "user", text }]);
        setScrollSignal({ to: "bottom" });
        await openDraftRef.current.send();
        return "Sent. Your message is on its way.";
      }

      busyRef.current = true;
      setBusy(true);
      const myView = view.current;
      const onScreen = () => view.current === myView;
      const typingKey = key();
      setItems((all) => [...all, { key: key(), kind: "user", text }, { key: typingKey, kind: "typing" }]);
      setScrollSignal({ to: "bottom" });

      const update = (fn) => onScreen() && setItems(fn);
      const clearTyping = () => update((all) => all.filter((x) => x.key !== typingKey));
      let botKey = null; // the reply being streamed right now
      let botText = "";
      let stepsKey = null; // the step group new steps go into
      const stepOwner = new Map(); // step id -> group key
      const replyParts = [];
      let madeCard = false;
      const endBot = () => {
        if (botKey === null) return;
        const k = botKey;
        update((all) => all.map((x) => (x.key === k ? { ...x, streaming: false } : x)));
        replyParts.push(botText);
        botKey = null;
        botText = "";
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: chatIdRef.current, text, voice: viaVoice && voiceOut, timeZone }),
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
            // The student switched chats: the reply keeps saving to its own chat
            // on the server, but stops drawing on this screen.
            if (!onScreen()) continue;
            if (ev.type === "text") {
              if (botKey === null && !ev.delta.trim()) continue;
              clearTyping();
              stepsKey = null;
              if (botKey === null) {
                botKey = key();
                const k = botKey;
                update((all) => [...all, { key: k, kind: "bot", text: "", streaming: true }]);
              }
              botText += ev.delta;
              const k = botKey;
              const t = botText;
              update((all) => all.map((x) => (x.key === k ? { ...x, text: t } : x)));
              if (voiceMode) onCaption?.(plainText(botText));
            } else if (ev.type === "step") {
              clearTyping();
              let owner = stepOwner.get(ev.id);
              if (!owner) {
                endBot();
                if (stepsKey === null) {
                  stepsKey = key();
                  const k = stepsKey;
                  update((all) => [...all, { key: k, kind: "steps", steps: [] }]);
                }
                owner = stepsKey;
                stepOwner.set(ev.id, owner);
              }
              update((all) => all.map((x) => (x.key === owner ? { ...x, steps: upsertStep(x.steps, ev) } : x)));
              if (voiceMode && ev.state === "running") onCaption?.(`${ev.text}…`);
            } else if (ev.type === "card") {
              clearTyping();
              endBot();
              stepsKey = null;
              madeCard = true;
              update((all) => [...all, { key: key(), kind: "card", card: ev.card }]);
            } else if (ev.type === "error") {
              clearTyping();
              update((all) => [...all, { key: key(), kind: "error", text: ev.error, bubble: true }]);
            }
          }
        }
      } catch (err) {
        clearTyping();
        update((all) => [...all, { key: key(), kind: "error", text: err.message }]);
      } finally {
        clearTyping();
        endBot();
        busyRef.current = false;
        setBusy(false);
        onSent?.(text);
      }

      if (!onScreen()) return null;
      let reply = plainText(replyParts.filter((t) => t.trim()).join("\n"));
      if (voiceMode && madeCard && !reply) reply = "I put it on your screen.";
      return reply;
    },
    [toast, onSent, openDraftRef],
  );

  return { chatId, items, busy, send, newChat, openChat, scrollSignal };
}
