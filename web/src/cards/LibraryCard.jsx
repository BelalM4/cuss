// Chat card when Cuss adds a reading, to-do or notes to a class.
import { Icon, useApp } from "../ui.jsx";
import { dayLabel, shortCourse } from "../lib/util.js";
import { addToCalendar, addToReminders } from "../lib/calendar.js";
import { CardHead } from "./DraftCard.jsx";

export default function LibraryCard({ courseId, courseName, item }) {
  const { toast, openClass } = useApp();
  const due = item.readBy ? `Read by ${dayLabel(item.readBy)}` : "";
  const remind = item.remindAt ? `🔔 ${new Date(item.remindAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";
  return (
    <div className="card lib-card">
      <CardHead icon={item.kind === "note" ? "note" : "list"} title={`${item.kind === "note" ? "Saved to" : "Added to"} ${shortCourse(courseName) || "your class"}`} />
      <div className="lib-card-title">{item.title}</div>
      {(due || remind) && <div className="lib-card-meta">{[due, remind].filter(Boolean).join(" · ")}</div>}
      <div className="lib-line">
        {(item.readBy || item.remindAt) && (
          <button type="button" className="chip" onClick={() => addToCalendar(toast, item, courseName)}>
            <Icon name="calendar" size={14} />
            Add to Calendar
          </button>
        )}
        {item.kind !== "note" && (
          <button type="button" className="chip" onClick={() => addToReminders(toast, item, courseName)}>
            <Icon name="bell" size={14} />
            Add to Reminders
          </button>
        )}
        <button type="button" className="chip accent" onClick={() => openClass(courseId, item.id)}>
          <Icon name="folder" size={14} />
          Open class
        </button>
      </div>
    </div>
  );
}
