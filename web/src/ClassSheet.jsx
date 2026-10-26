// One class: its files, notes, readings and to-dos. Anything can be "due next
// class" with a reminder, and go into the iPhone Calendar or Reminders app.
import { useEffect, useRef, useState } from "react";
import { Icon, Modal, useApp } from "./ui.jsx";
import { api, dayLabel, ymdLocal } from "./lib/util.js";
import { addToCalendar, addToReminders } from "./lib/calendar.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dueText(item, nextClass) {
  if (!item.readBy) return "";
  const past = item.readBy < ymdLocal() && !item.done;
  return `${past ? "Was due " : "Read by "}${dayLabel(item.readBy)}${item.readBy === nextClass ? " · next class" : ""}`;
}

// `target` is { courseId, focusId } while the sheet is open, otherwise null.
export default function ClassSheet({ target, onClose }) {
  const { toast, courseById, dash } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const scrollTo = useRef(null);
  const course = target ? courseById(target.courseId) || { id: Number(target.courseId), name: "Class" } : null;

  const refresh = async () => {
    try {
      setData(await api(`/api/library/${course.id}`));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!target) return;
    setData(null);
    setError(null);
    setEditing(null);
    setOpenId(target.focusId);
    scrollTo.current = target.focusId;
    refresh();
  }, [target]);

  useEffect(() => {
    if (!data || !scrollTo.current) return;
    document.getElementById(`lib-${scrollTo.current}`)?.scrollIntoView({ block: "center" });
    scrollTo.current = null;
  }, [data]);

  const patchItem = async (item, patch, message) => {
    try {
      await api(`/api/library/item/${item.id}`, { method: "PATCH", body: patch });
      if (message) toast(message, item.title, { iconName: "bell" });
      await refresh();
      dash.loadReadings();
    } catch (err) {
      toast("Couldn't save that", err.message, { iconName: "alert" });
    }
  };

  const setDays = async (day) => {
    const days = data.classDays.includes(day) ? data.classDays.filter((x) => x !== day) : [...data.classDays, day];
    setData(await api(`/api/library/${course.id}/days`, { method: "PUT", body: { days } }));
  };

  const upload = async (files) => {
    for (const f of files) {
      try {
        const res = await fetch(`/api/library/${course.id}/upload`, {
          method: "POST",
          headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) },
          body: f,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Upload failed.");
        toast("Uploaded", f.name, { iconName: "upload" });
      } catch (err) {
        toast(`Couldn't upload ${f.name}`, err.message, { iconName: "alert" });
      }
    }
    refresh();
  };

  const [importing, setImporting] = useState(false);
  const importFiles = async () => {
    setImporting(true);
    try {
      const r = await api(`/api/library/${course.id}/import`, { method: "POST" });
      toast(r.added ? `Brought in ${r.added} file${r.added === 1 ? "" : "s"} from Canvas` : "Already up to date", r.total ? `${r.total} file${r.total === 1 ? "" : "s"} in this Canvas course` : "This course has no files in Canvas yet.", { iconName: "sparkles" });
      await refresh();
    } catch (err) {
      toast("Couldn't reach Canvas", err.message, { iconName: "alert" });
    } finally {
      setImporting(false);
    }
  };

  const editItem = async (item) => setEditing({ kind: item.kind, item: await api(`/api/library/item/${item.id}`) });

  return (
    <Modal open={!!target} onClose={onClose} closeOnBackdrop className="class-sheet" aria-labelledby="classTitle">
      {course && (
        <div className="sheet-inner">
          <div className="dialog-head">
            <div>
              <div className="sheet-kicker">Class files &amp; notes</div>
              <h2 id="classTitle">{course.name}</h2>
            </div>
            <button type="button" className="icon-btn ghost" title="Close" aria-label="Close" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>

          <div className="meets">
            <span className="meets-label">Class meets</span>
            <div className="day-chips" role="group" aria-label="Days this class meets">
              {data &&
                DAY_ORDER.map((day) => (
                  <button key={day} type="button" className={`day-chip${data.classDays.includes(day) ? " on" : ""}`} aria-pressed={String(data.classDays.includes(day))} title={DAY_NAMES[day]} onClick={() => setDays(day)}>
                    {DAY_SHORT[day]}
                  </button>
                ))}
            </div>
            <span className="next-class">{data ? (data.nextClass ? `Next class: ${dayLabel(data.nextClass)}` : "Tap the days it meets") : ""}</span>
          </div>

          <div className="lib-actions">
            <label className="btn small lib-upload">
              <Icon name="upload" />
              Upload
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*"
                hidden
                onChange={(e) => {
                  const files = [...e.target.files];
                  e.target.value = "";
                  upload(files);
                }}
              />
            </label>
            <button type="button" className="btn ghost small" onClick={() => setEditing({ kind: "note", item: null })}>
              <Icon name="note" />
              Write a note
            </button>
            <button type="button" className="btn ghost small" onClick={() => setEditing({ kind: "task", item: null })}>
              <Icon name="list" />
              Add a reading or to-do
            </button>
            <button type="button" className="btn ghost small" onClick={importFiles} disabled={importing}>
              <Icon name="sparkles" />
              Bring in Canvas files
            </button>
          </div>

          {editing && data && (
            <Editor
              key={`${editing.kind}-${editing.item?.id || "new"}`}
              editing={editing}
              nextClass={data.nextClass}
              onCancel={() => setEditing(null)}
              onSave={async ({ title, text, readBy }) => {
                const { kind, item } = editing;
                try {
                  if (item) await api(`/api/library/item/${item.id}`, { method: "PATCH", body: { title, text } });
                  else await api(`/api/library/${course.id}/${kind === "task" ? "tasks" : "notes"}`, { method: "POST", body: { title: title || (kind === "task" ? "" : `Notes · ${dayLabel(ymdLocal())}`), text, readBy } });
                  setEditing(null);
                  await refresh();
                  dash.loadReadings();
                } catch (err) {
                  toast("Couldn't save that", err.message, { iconName: "alert" });
                }
              }}
            />
          )}

          <div className="lib-list" aria-live="polite">
            {error ? (
              <div className="empty-note">{error}</div>
            ) : !data ? (
              <>
                <div className="skeleton" />
                <div className="skeleton" />
              </>
            ) : (
              <ItemList
                data={data}
                openId={openId}
                toggle={(id) => setOpenId(openId === id ? null : id)}
                actions={(item) => (
                  <ItemActions
                    item={item}
                    course={course}
                    patchItem={patchItem}
                    editItem={editItem}
                    closeSheet={onClose}
                    onDelete={async () => {
                      if (!confirm(`Delete “${item.title}”?`)) return;
                      await api(`/api/library/item/${item.id}`, { method: "DELETE" });
                      setOpenId(null);
                      refresh();
                      dash.loadReadings();
                    }}
                  />
                )}
                patchItem={patchItem}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ItemList({ data, openId, toggle, actions, patchItem }) {
  const today = ymdLocal();
  const groups = [
    ["Due next class", (i) => !i.done && i.readBy && data.nextClass && i.readBy <= data.nextClass],
    ["Coming up", (i) => !i.done && i.readBy && !(data.nextClass && i.readBy <= data.nextClass)],
    ["Notes & files", (i) => !i.done && !i.readBy],
    ["Done", (i) => i.done],
  ];
  if (!data.nextClass) groups[0] = ["Overdue & today", (i) => !i.done && i.readBy && i.readBy <= today];
  const used = new Set();
  const sections = [];
  for (const [label, test] of groups) {
    const items = data.items.filter((i) => !used.has(i.id) && test(i));
    items.forEach((i) => used.add(i.id));
    if (label !== "Notes & files" && label !== "Done") items.sort((a, b) => a.readBy.localeCompare(b.readBy));
    if (items.length) sections.push([label, items]);
  }
  if (!sections.length)
    return (
      <div className="lib-empty">
        <div className="lib-empty-icon">
          <Icon name="folder" size={28} />
        </div>
        <b>This class is empty</b>
        <p>Upload a file, add a note or reading, or import from Canvas.</p>
      </div>
    );
  return sections.map(([label, items]) => [
    <div key={label} className="lib-group">
      {label}
    </div>,
    ...items.map((item) => <ItemRow key={item.id} item={item} nextClass={data.nextClass} open={openId === item.id} toggle={() => toggle(item.id)} actions={actions} patchItem={patchItem} />),
  ]);
}

function ItemRow({ item, nextClass, open, toggle, actions, patchItem }) {
  const kindIcon = { canvas: "file", upload: "upload", note: "note", task: "list" }[item.kind];
  const source = { canvas: "From Canvas", upload: "Uploaded", note: item.addedBy === "cuss" ? "Saved by Cuss" : "Your note", task: item.addedBy === "cuss" ? "Added by Cuss" : "To-do" }[item.kind];
  const due = dueText(item, nextClass);
  const late = item.readBy && item.readBy < ymdLocal() && !item.done;
  const meta = [source, due && <b className={late ? "late" : ""}>{due}</b>, item.remindAt && `🔔 ${new Date(item.remindAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`].filter(Boolean);
  return (
    <div className={`lib-item${item.done ? " done" : ""}${open ? " open" : ""}`} id={`lib-${item.id}`}>
      <div className="lib-main">
        <input type="checkbox" className="lib-check" checked={!!item.done} aria-label={item.done ? "Mark not done" : "Mark done"} onChange={(e) => patchItem(item, { done: e.target.checked })} />
        <button type="button" className="lib-body" aria-expanded={String(open)} onClick={toggle}>
          <span className={`lib-kind k-${item.kind}`}>
            <Icon name={kindIcon} size={16} />
          </span>
          <span className="lib-text">
            <span className="lib-title">{item.title}</span>
            <span className="lib-meta">
              {meta.map((x, n) => (
                <span key={n} style={{ display: "contents" }}>
                  {n ? " · " : ""}
                  {x}
                </span>
              ))}
            </span>
          </span>
        </button>
      </div>
      {open && actions(item)}
    </div>
  );
}

const toLocalInput = (date) => new Date(date - date.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function ItemActions({ item, course, patchItem, editItem, closeSheet, onDelete }) {
  const { toast, send, closePanels } = useApp();
  const defaultRemind = () => {
    const base = item.readBy ? new Date(item.readBy + "T19:00:00") : new Date(Date.now() + 864e5);
    if (item.readBy) base.setDate(base.getDate() - 1);
    else base.setHours(18, 0, 0, 0);
    return toLocalInput(base);
  };
  const [remindAt, setRemindAt] = useState(item.remindAt ? toLocalInput(new Date(item.remindAt)) : defaultRemind);
  const ask = (prompt) => {
    closeSheet();
    closePanels();
    send(prompt);
  };
  return (
    <div className="lib-actions-panel">
      <div className="lib-line">
        <span className="lib-line-label">Read by</span>
        <button type="button" className="chip" onClick={() => patchItem(item, { readBy: "next_class" })}>
          Next class
        </button>
        <input type="date" className="chip-date" value={item.readBy || ""} aria-label="Pick a date" onChange={(e) => patchItem(item, { readBy: e.target.value })} />
        {item.readBy && (
          <button type="button" className="chip ghost" onClick={() => patchItem(item, { readBy: "" })}>
            Clear
          </button>
        )}
      </div>
      <div className="lib-line">
        <span className="lib-line-label">Remind me</span>
        <input type="datetime-local" className="chip-date" value={remindAt} aria-label="Reminder time" onChange={(e) => setRemindAt(e.target.value)} />
        <button type="button" className="chip" onClick={() => remindAt && patchItem(item, { remindAt: new Date(remindAt).toISOString() }, "Reminder set")}>
          {item.remindAt ? "Update" : "Set"}
        </button>
        {item.remindAt && (
          <button type="button" className="chip ghost" onClick={() => patchItem(item, { remindAt: "" })}>
            Remove
          </button>
        )}
      </div>
      <div className="lib-line">
        <button type="button" className="chip" onClick={() => addToCalendar(toast, item, course.name)}>
          <Icon name="calendar" size={14} />
          Add to Calendar
        </button>
        <button type="button" className="chip" onClick={() => addToReminders(toast, item, course.name)}>
          <Icon name="bell" size={14} />
          Add to Reminders
        </button>
      </div>
      <div className="lib-line">
        <button type="button" className="chip accent" onClick={() => ask(`Summarize "${item.title}" from my ${course.name} class library (item ${item.id}).`)}>
          <Icon name="sparkles" size={14} />
          Summarize
        </button>
        <button type="button" className="chip accent" onClick={() => ask(`Quiz me on "${item.title}" from my ${course.name} class library (item ${item.id}).`)}>
          <Icon name="help" size={14} />
          Quiz me
        </button>
        {item.kind === "upload" && (
          <a className="chip" href={`/api/library/item/${item.id}/file`} target="_blank" rel="noopener">
            <Icon name="external" size={14} />
            Open
          </a>
        )}
        {(item.kind === "note" || item.kind === "task") && (
          <button type="button" className="chip" onClick={() => editItem(item)}>
            <Icon name="note" size={14} />
            {item.hasText ? "View & edit" : "Edit"}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="chip danger" onClick={onDelete}>
          <Icon name="trash" size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

// Notes and to-dos editor.
function Editor({ editing, nextClass, onCancel, onSave }) {
  const { kind, item } = editing;
  const task = kind === "task";
  const [title, setTitle] = useState(item?.title || "");
  const [text, setText] = useState(item?.text || "");
  const [due, setDue] = useState(item?.readBy ? "pick" : task && nextClass ? "next_class" : "");
  const [date, setDate] = useState(item?.readBy || "");
  const titleRef = useRef(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <form
      className="lib-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title: title.trim(), text, readBy: due === "pick" ? date || undefined : due || undefined });
      }}
    >
      <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={task ? "e.g. Read chapter 4, pages 80–95" : "Title, e.g. Week 8 lecture notes"} aria-label="Title" maxLength={200} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={task ? 2 : 7} placeholder={task ? "Details (optional)" : "Your notes…"} aria-label="Note text" />
      <div className="lib-editor-row">
        {!item && (
          <label className="inline">
            Read by
            <select value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">No date</option>
              <option value="next_class">Next class</option>
              <option value="pick">Pick a date…</option>
            </select>
          </label>
        )}
        {!item && due === "pick" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />}
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn small">
          Save
        </button>
      </div>
    </form>
  );
}
