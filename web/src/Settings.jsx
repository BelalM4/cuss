// Settings: account, reminders, calendar, independent mode, memory, voice and data.
import { useEffect, useState } from "react";
import { Icon, Modal, useApp } from "./ui.jsx";
import { api, initials, store, timeZone } from "./lib/util.js";
import { getVoices } from "./lib/speech.js";

const leave = (to = "/login.html") => {
  store.set("chatId", null);
  location.replace(to);
};

export default function Settings({ open, onClose }) {
  const { status: s, toast, refreshStatus, openChat, subscribeCalendar } = useApp();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      reminderHours: (s?.reminderHours || [72, 24, 3]).join(", "),
      independent: Boolean(s?.independent),
      briefingTime: s?.briefingTime || "07:30",
      autoSendEmails: Boolean(s?.autoSendEmails),
      voice: store.get("voice", ""),
    });
    setError(null);
    const load = () => setVoices(getVoices().filter((v) => v.lang.startsWith((navigator.language || "en").slice(0, 2))));
    load();
    if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = load;
  }, [open]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    store.set("voice", form.voice);
    try {
      await api("/api/settings", {
        method: "POST",
        body: {
          reminderHours: form.reminderHours.split(/[,\s]+/).filter(Boolean).map(Number),
          independent: form.independent,
          briefingTime: form.briefingTime,
          autoSendEmails: form.autoSendEmails,
          timeZone,
        },
      });
      await refreshStatus();
      onClose();
      toast("Saved", "Your settings are updated.", { iconName: "check" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runBriefing = async () => {
    setBriefing(true);
    try {
      const { chatId } = await api("/api/briefing", { method: "POST" });
      onClose();
      await openChat(chatId);
    } catch (err) {
      toast("Briefing failed", err.message, { iconName: "alert" });
    } finally {
      setBriefing(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} id="settings" aria-label="Settings">
      {form && (
        <form method="dialog" onSubmit={save}>
          <div className="dialog-head">
            <h2>Settings</h2>
            <button type="button" className="icon-btn ghost" title="Close" aria-label="Close" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>

          <div className="account-row">
            <div className="avatar">{initials(s?.studentName)}</div>
            <span className="muted">{`${s?.studentName || "You"} · ${s?.demo ? "Demo University" : s?.schoolName || "Canvas"}`}</span>
            <button
              type="button"
              className="btn ghost small"
              onClick={async () => {
                await api("/auth/logout", { method: "POST" }).catch(() => {});
                leave();
              }}
            >
              <Icon name="logout" />
              Log out
            </button>
          </div>
          <div style={{ textAlign: "right", marginTop: 6 }}>
            <button
              type="button"
              className="link-btn small"
              onClick={async () => {
                if (!confirm("Log out of Cuss on every device (laptops and phones)?")) return;
                await api("/auth/logout-all", { method: "POST" }).catch(() => {});
                leave();
              }}
            >
              Log out of all devices
            </button>
          </div>

          <h3 className="settings-sub">Reminders</h3>
          <label>
            Remind me before due dates (hours)
            <input name="reminderHours" placeholder="72, 24, 3" value={form.reminderHours} onChange={set("reminderHours")} />
          </label>

          <h3 className="settings-sub">iPhone Calendar &amp; Reminders</h3>
          <p className="muted small">Put every deadline, reading and reminder in your iPhone Calendar, with alerts. It updates by itself.</p>
          <div className="inline-row">
            <button type="button" className="btn small" onClick={() => subscribeCalendar()}>
              <Icon name="calendar" />
              Add to iPhone Calendar
            </button>
            <button type="button" className="btn ghost small" onClick={() => subscribeCalendar({ copyOnly: true })}>
              <Icon name="copy" />
              Copy link for Google or Outlook
            </button>
          </div>
          <p className="muted small">
            For Reminders: open a class, tap a reading or to-do, then <b>Add to Reminders</b>. When Cuss adds something for you in chat, the buttons are right on the card.
          </p>
          <button type="button" className="link-btn small" onClick={() => confirm("Turn off your current calendar link? Calendars subscribed to it stop updating.") && subscribeCalendar({ reset: true })}>
            Turn off my old calendar link
          </button>

          <h3 className="settings-sub">Independent mode</h3>
          <label className="switch-row">
            <input type="checkbox" name="independent" checked={form.independent} onChange={set("independent")} />
            <span>
              <b>Let Cuss work on its own</b>
              <small>Every morning Cuss checks Canvas by itself, writes your daily briefing and study plan, makes study sets before tests, and alerts you about new announcements.</small>
            </span>
          </label>
          <div className="inline-row">
            <label>
              Daily briefing time <input name="briefingTime" type="time" value={form.briefingTime} onChange={set("briefingTime")} />
            </label>
            <button type="button" className="btn ghost small" onClick={runBriefing} disabled={briefing}>
              {briefing ? (
                "Cuss is checking Canvas…"
              ) : (
                <>
                  <Icon name="sun" />
                  Run a briefing now
                </>
              )}
            </button>
          </div>

          <label className="switch-row">
            <input
              type="checkbox"
              name="autoSendEmails"
              checked={form.autoSendEmails}
              onChange={(e) => {
                if (e.target.checked && !confirm("Cuss will send messages to your instructors without showing you first. Emails can't be unsent. Turn this on?")) return;
                set("autoSendEmails")(e);
              }}
            />
            <span>
              <b>Send emails without asking me</b>
              <small>Off: you review every email and press Send. On: Cuss sends right away when you ask it to email someone. Emails can't be unsent.</small>
            </span>
          </label>

          <h3 className="settings-sub">What Cuss remembers about you</h3>
          <Memory open={open} />

          <h3 className="settings-sub">Voice</h3>
          <label>
            Speaking voice{" "}
            <select value={form.voice} onChange={set("voice")}>
              <option value="">Default voice</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{`${v.name} (${v.lang})`}</option>
              ))}
            </select>
          </label>

          <h3 className="settings-sub">Your data</h3>
          <p className="muted small">Cuss stores your chats, notes and settings so it can remember you.</p>
          <div className="inline-row">
            {s?.demo && (
              <button
                type="button"
                className="btn ghost small"
                onClick={async () => {
                  await api("/api/account/delete", { method: "POST" }).catch(() => {});
                  leave(s?.role === "teacher" ? "/auth/demo?as=professor" : "/auth/demo");
                }}
              >
                <Icon name="refresh" />
                Start the demo over
              </button>
            )}
            <button
              type="button"
              className="btn danger small"
              onClick={async () => {
                if (!confirm("Delete all your chats, notes and settings, and disconnect Cuss from Canvas? This can't be undone.")) return;
                try {
                  await api("/api/account/delete", { method: "POST" });
                  leave();
                } catch (err) {
                  toast("Couldn't delete", err.message, { iconName: "alert" });
                }
              }}
            >
              <Icon name="trash" />
              Delete my data &amp; disconnect
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}
          <div className="dialog-actions">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Memory({ open }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const load = () => api("/api/memory").catch(() => []).then(setItems);
  useEffect(() => {
    if (open) load();
  }, [open]);
  const add = async () => {
    if (!text.trim()) return;
    await api("/api/memory", { method: "POST", body: { text } });
    setText("");
    load();
  };
  return (
    <>
      <ul className="memory-list">
        {!items.length && <li className="muted">Nothing yet. Cuss saves things as you chat, or add your own below.</li>}
        {items.map((m) => (
          <li key={m.id}>
            <span>{m.text}</span>
            <button
              type="button"
              title="Forget this"
              onClick={async () => {
                await api(`/api/memory/${m.id}`, { method: "DELETE" });
                load();
              }}
            >
              <Icon name="x" size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="memory-add">
        <input
          aria-label="Note for Cuss to remember"
          placeholder="e.g. I'm a nursing major and learn best with practice questions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault(), add();
          }}
        />
        <button type="button" className="btn small" onClick={add}>
          Add
        </button>
      </div>
    </>
  );
}
