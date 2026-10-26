// An email, Canvas reply or course announcement Cuss drafted. Nothing is sent
// until the student presses Send (or says "send it" in voice mode).
import { useEffect, useRef, useState } from "react";
import { Icon, useApp } from "../ui.jsx";
import { api, initials } from "../lib/util.js";
import { speak } from "../lib/speech.js";

export function CardHead({ icon, title, children }) {
  return (
    <div className="card-head">
      <span>
        <Icon name={icon} size={18} />
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default function DraftCard({ draft }) {
  const { isTeacher, toast, dash, openDraftRef, voiceOut } = useApp();
  const isReply = draft.kind === "reply";
  const isAnnouncement = draft.kind === "announcement";
  const [subject, setSubject] = useState(isReply ? `Re: ${draft.subject}` : draft.subject);
  const [body, setBody] = useState(draft.body);
  const [sent, setSent] = useState(draft.status === "sent");
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      await api(`/api/drafts/${draft.id}/send`, { method: "POST", body: { subject: isReply ? draft.subject : subject, body } });
      setSent(true);
      setTimeout(dash.loadInbox, 1500);
      if (isAnnouncement) toast("Announcement posted", `Everyone in ${draft.course || "the course"} can see it now.`, { iconName: "megaphone" });
      else toast("Message sent", `Your message went to ${draft.recipients.map((r) => r.name).join(", ")}.`, { iconName: "send" });
      if (voiceOut()) speak("Sent. Your message is on its way.");
    } catch (err) {
      busy.current = false;
      toast("Couldn't send", err.message, { iconName: "alert" });
    } finally {
      setSending(false);
    }
  };

  // The newest unsent draft answers the voice command "send it".
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (sent) return;
    const mine = { id: draft.id, send: () => sendRef.current() };
    openDraftRef.current = mine;
    return () => {
      if (openDraftRef.current === mine) openDraftRef.current = null;
    };
  }, [sent, draft.id, openDraftRef]);

  const emails = (draft.recipients || []).map((r) => r.email).filter(Boolean);
  const copy = async () => {
    await navigator.clipboard.writeText(`${subject}\n\n${body}`);
    toast("Copied", "Subject and message copied.", { iconName: "copy" });
  };

  return (
    <div className="card">
      <CardHead icon={isAnnouncement ? "megaphone" : isReply ? "message" : "mail"} title={isAnnouncement ? "Course announcement" : isReply ? "Reply in Canvas Inbox" : isTeacher ? "Message to students" : "Email to your instructor"}>
        <span className={sent ? "chip ok" : "chip"}>{sent ? (isAnnouncement ? "Posted" : "Sent") : "Draft"}</span>
      </CardHead>
      <div className="card-body">
        <div className="mail-row">
          <span className="k">To</span>
          <div>
            {isAnnouncement ? (
              <span className="recipient">{`Everyone in ${draft.course || "the course"}`}</span>
            ) : (
              draft.recipients.map((r, i) => (
                <span key={i} className="recipient">
                  <span className="avatar mini">{initials(r.name)}</span>
                  {r.name}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="mail-row">
          <span className="k">{isAnnouncement ? "Title" : "Subject"}</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" disabled={isReply || sent} />
        </div>
        {isReply && draft.quote && (
          <div className="quote">
            <div className="quote-head">
              <b>{draft.quote.from}</b> wrote
              {draft.quote.at ? ` · ${new Date(draft.quote.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}
            </div>
            <div className="quote-body">{draft.quote.body}</div>
          </div>
        )}
        <div className="mail-body">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" disabled={sent} />
        </div>
      </div>
      <div className="card-actions">
        {sent ? (
          <span className="sent-note">
            <Icon name="check" size={16} /> {isAnnouncement ? "Posted to the course in Canvas" : `${isReply ? "Reply sent" : "Sent"} through Canvas Inbox`}
          </span>
        ) : (
          <>
            <button className="btn" onClick={send} disabled={sending}>
              {sending ? (
                "Sending…"
              ) : (
                <>
                  <Icon name={isAnnouncement ? "megaphone" : "send"} size={16} /> {isAnnouncement ? "Post to course" : isReply ? "Send reply" : "Send via Canvas"}
                </>
              )}
            </button>
            {emails.length > 0 && (
              <button className="btn ghost" onClick={() => (location.href = `mailto:${emails.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)}>
                <Icon name="external" size={15} /> Open in email app
              </button>
            )}
            <button className="btn ghost" onClick={copy}>
              <Icon name="copy" size={15} /> Copy
            </button>
          </>
        )}
      </div>
    </div>
  );
}
