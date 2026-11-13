// Right-hand panel: stats, messages, deadlines, readings, classes and impact.
import { forwardRef, useEffect, useState } from "react";
import { GrowBar, Icon, Loadable, useApp } from "./ui.jsx";
import { dayLabel, formatDue, initials, shortCourse, store, ymdLocal } from "./lib/util.js";

const TodayPanel = forwardRef(function TodayPanel({ dash, summary, open, inert, refreshRef }, ref) {
  const { status, isTeacher, send, closePanels, openClass, courseById, subscribeCalendar } = useApp();
  const labels = isTeacher ? ["students", "check-ins", "to grade"] : ["due this week", "missing", "avg grade"];
  const stats = summary?.stats || ["–", "–", "–"];
  const ask = (text) => {
    closePanels();
    send(text);
  };

  return (
    <aside ref={ref} className={`today${open ? " open" : ""}`} id="today" aria-label="Today: deadlines, messages and grades" inert={inert}>
      <div className="today-head">
        <div>
          <div className="today-title">Today</div>
          <div className="today-date">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <button ref={refreshRef} className="icon-btn ghost" title="Refresh" aria-label="Refresh" onClick={dash.loadDashboard}>
          <Icon name="refresh" />
        </button>
      </div>
      <p className="sr-only" role="status">
        {dash.deadlines.state === "loading" ? "Loading your workspace." : "Deadline check complete."}
      </p>
      <div className="stats">
        {["", " warn", " good"].map((tone, i) => (
          <div key={i} className={`stat${tone}`}>
            <div className="stat-num">{stats[i] ?? "–"}</div>
            <div className="stat-label">{labels[i]}</div>
          </div>
        ))}
      </div>

      <Inbox inbox={dash.inbox} retry={dash.loadInbox} ask={ask} me={status?.studentName} />

      {isTeacher ? (
        <>
          <div className="panel-label">Students needing attention</div>
          <AtRisk teacher={dash.teacher} ask={ask} />
          <div className="panel-label">Coming up in your classes</div>
        </>
      ) : (
        <>
          <div className="panel-label">Coming up</div>
          <Missing missing={dash.deadlines.data?.missing} />
        </>
      )}
      <Deadlines deadlines={dash.deadlines} retry={dash.loadDashboard} />

      <div className="panel-label">Readings &amp; to-dos</div>
      <Readings readings={dash.readings} retry={dash.loadReadings} openClass={openClass} courseById={courseById} />
      <div className="cal-row">
        <button type="button" className="cal-link" onClick={() => subscribeCalendar()}>
          <Icon name="calendar" />
          Add to my iPhone Calendar
        </button>
        <a className="cal-link subtle" href="/calendar.ics" download>
          or download .ics
        </a>
      </div>

      <div className="panel-label">Classes</div>
      <Courses dash={dash} isTeacher={isTeacher} openClass={openClass} />

      <div className="panel-label">Your impact with Cuss</div>
      <Impact impact={dash.impact} isTeacher={isTeacher} />
      <NotifyBox />
    </aside>
  );
});
export default TodayPanel;

function Inbox({ inbox, retry, ask, me }) {
  const unread = inbox.data;
  return (
    <>
      <div className="panel-label">
        Messages {unread?.length ? <span className="count">{unread.length}</span> : null}
      </div>
      <Loadable className="inbox" state={inbox.state} error={inbox.error} retry={retry} short>
        {unread &&
          (unread.length ? (
            unread.map((c) => {
              const from = c.participants.find((p) => p !== me) || c.participants[0] || "Canvas";
              return (
                <li key={c.id}>
                  <button type="button" className="inbox-item" aria-label={`Open message: ${c.subject}, from ${from}`} onClick={() => ask(`Open my Canvas message "${c.subject}" from ${from} and tell me what I need to do.`)}>
                    <span className="avatar mini">{initials(from)}</span>
                    <span className="info">
                      <span className="from">
                        {from}
                        <span className="dot-unread" aria-hidden="true" />
                      </span>
                      <span className="subj">{c.subject}</span>
                      <span className="snip">{c.lastMessage}</span>
                    </span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="empty-note">No unread messages.</li>
          ))}
      </Loadable>
    </>
  );
}

function Missing({ missing }) {
  if (!missing?.length) return <div />;
  return (
    <div>
      <details className="missing">
        <summary>
          <Icon name="alert" size={15} /> {missing.length} missing assignment{missing.length > 1 ? "s" : ""}
        </summary>
        <ul>
          {missing.map((m, i) => (
            <li key={i}>
              <a href={m.url} target="_blank" rel="noopener">
                {m.title}
              </a>
              {m.course ? ` · ${m.course}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function AtRisk({ teacher, ask }) {
  if (teacher.state === "error" && !teacher.data) return <div className="empty-note">{teacher.error}</div>;
  const courses = teacher.data;
  if (!courses) return <div />;
  const students = courses.flatMap((c) => c.atRisk.map((s) => ({ s, c })));
  return (
    <div>
      {students.map(({ s, c }) => (
        <button key={`${c.id}-${s.name}`} className="inbox-item" type="button" title="Ask Cuss to draft a check-in" onClick={() => ask(`Draft a kind, private check-in message to ${s.name} in ${c.name} about their missing work, offering help.`)}>
          <span className="avatar mini">{initials(s.name)}</span>
          <div className="info">
            <div className="from">{s.name}</div>
            <div className="snip">{[s.missing ? `${s.missing} missing` : null, s.late ? `${s.late} late` : null, s.currentScore != null ? `${Math.round(s.currentScore)}% in ${c.name.split(" – ")[0]}` : null].filter(Boolean).join(" · ")}</div>
          </div>
        </button>
      ))}
      {!students.length && <div className="empty-note">No one is behind right now.</div>}
    </div>
  );
}

function Deadlines({ deadlines, retry }) {
  const upcoming = deadlines.data?.upcoming;
  return (
    <Loadable className="deadlines" state={deadlines.state} error={deadlines.error} retry={retry} skeletons={3}>
      {upcoming &&
        (upcoming.length ? (
          upcoming.map((d, i) => {
            const f = formatDue(d.dueAt);
            const done = d.submitted || d.markedDone;
            return (
              <li key={d.id ?? i}>
                <a className={`deadline ${done ? "done" : f.cls}`} href={d.url || "#"} target="_blank" rel="noopener" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="bar" />
                  <div className="info">
                    <div className="title">{d.title}</div>
                    <div className="meta">{`${d.course || ""} · ${f.when}`}</div>
                  </div>
                  <span className="when">{done ? "Done" : f.rel === "past due" ? "Overdue" : `${f.cls === "soon" ? "Soon · " : ""}${f.rel}`}</span>
                </a>
              </li>
            );
          })
        ) : (
          <li className="empty-note">Nothing due in the next two weeks 🎉</li>
        ))}
    </Loadable>
  );
}

function Readings({ readings, retry, openClass, courseById }) {
  const items = readings.data;
  const today = ymdLocal();
  const soonDay = ymdLocal(new Date(Date.now() + 2 * 864e5));
  return (
    <Loadable className="deadlines" state={readings.state} error={readings.error} retry={retry}>
      {items &&
        (items.length ? (
          items.slice(0, 6).map((i) => {
            const past = i.readBy < today;
            const cls = past || i.readBy === today ? "urgent" : i.readBy <= soonDay ? "soon" : "later";
            const go = () => openClass(i.courseId, i.id);
            return (
              <li
                key={i.id}
                className={`deadline ${cls}`}
                tabIndex={0}
                role="button"
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go();
                  }
                }}
              >
                <span className="bar" />
                <div className="info">
                  <div className="title">{i.kind === "task" ? i.title : `Read: ${i.title}`}</div>
                  <div className="meta">{`${shortCourse(courseById(i.courseId)?.name || "")}${i.remindAt ? " · 🔔 reminder set" : ""}`}</div>
                </div>
                <span className="when">{past ? "Late" : dayLabel(i.readBy).replace(/,.*/, "")}</span>
              </li>
            );
          })
        ) : (
          <li className="empty-note">No readings added.</li>
        ))}
    </Loadable>
  );
}

function Courses({ dash, isTeacher, openClass }) {
  const src = isTeacher ? dash.teacher : dash.courses;
  const list = src.data;
  return (
    <Loadable className="courses" state={src.state} error="Couldn’t load classes." retry={dash.loadDashboard} skeletons={2} short>
      {list?.map((c) => {
        const score = isTeacher ? c.summary?.classAverage : c.currentScore;
        const label = isTeacher ? (score != null ? `avg ${score}%` : "") : c.currentGrade || (score != null ? `${score}%` : "");
        return (
          <li key={c.id}>
            <button type="button" className="course clickable" aria-label={`${c.name}: files and notes`} onClick={() => openClass(c.id)}>
              <div className="course-top">
                <span>{c.name}</span>
                <span className="g">
                  {label}
                  <span className="chev">
                    <Icon name="right" size={14} />
                  </span>
                </span>
              </div>
              <div className="gbar">
                <GrowBar percent={score} />
              </div>
            </button>
          </li>
        );
      })}
    </Loadable>
  );
}

function Impact({ impact, isTeacher }) {
  if (!impact) return <div className="impact-row" />;
  const c = impact.counts || {};
  const items = isTeacher
    ? [
        [(c.email_sent || 0) + (c.reply_sent || 0), "messages to students"],
        [c.announcement_posted || 0, "announcements"],
      ]
    : [
        [c.reminder || 0, "reminders"],
        [(c.email_sent || 0) + (c.reply_sent || 0), "emails sent"],
        [impact.quizzesTaken || 0, impact.quizAverage != null ? `quizzes · ${impact.quizAverage}% avg` : "quizzes"],
      ];
  if (impact.missing && impact.missing.firstDay !== impact.missing.lastDay) items.push([`${impact.missing.first}→${impact.missing.last}`, "missing work"]);
  return (
    <div className="impact-row">
      {items.map(([n, label]) => (
        <span key={label} className="impact-chip">
          <b>{String(n)}</b> {label}
        </span>
      ))}
    </div>
  );
}

function NotifyBox() {
  const canAsk = () => "Notification" in window && Notification.permission === "default" && !store.get("notifyBoxDismissed", false);
  const [show, setShow] = useState(canAsk);
  useEffect(() => setShow(canAsk()), []);
  if (!show) return null;
  return (
    <div className="notify-box">
      <button
        type="button"
        className="notify-close"
        aria-label="Dismiss"
        onClick={() => {
          store.set("notifyBoxDismissed", true);
          setShow(false);
        }}
      >
        <Icon name="x" size={14} />
      </button>
      <b>Deadline reminders</b>
      <p>Get deadline reminders while Cuss is running.</p>
      <button
        className="btn small"
        onClick={async () => {
          await Notification.requestPermission();
          setShow(canAsk());
        }}
      >
        Enable reminders
      </button>
    </div>
  );
}

