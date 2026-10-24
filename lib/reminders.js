// Background checker: watches Canvas for upcoming deadlines and queues
// reminder notifications (e.g. 3 days, 1 day and 3 hours before each one).
import crypto from "node:crypto";
import * as canvas from "./canvas.js";
import { getConfig, getState, saveState, isConfigured, listUserIds, runAsUser, currentUserId } from "./store.js";
import { chat, describeError } from "./agent.js";
import { newChatId } from "./chats.js";

const CHECK_EVERY_MS = 10 * 60 * 1000;

function describeLeft(ms) {
  const hours = Math.round(ms / 3600e3);
  if (hours < 1) return "in less than an hour";
  if (hours < 36) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.round(hours / 24)} days`;
}

function push(state, notification) {
  state.notifications.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...notification });
}

export async function checkReminders() {
  if (!isConfigured()) return;
  // Work on a snapshot, then merge into fresh state at the end so a briefing
  // finishing in the meantime isn't overwritten.
  const state = getState();
  const pending = [];
  const newKeys = [];
  const newSeen = [];
  const now = Date.now();
  const thresholds = [...getConfig().reminderHours].sort((a, b) => b - a);

  try {
    const deadlines = await canvas.getDeadlines({ daysAhead: Math.ceil(Math.max(...thresholds) / 24) + 1 });
    for (const d of deadlines) {
      if (d.submitted || d.markedDone) continue;
      const due = new Date(d.dueAt).getTime();
      const left = due - now;
      if (left <= 0) continue;
      // Only the tightest threshold we've crossed, so a late start doesn't spam.
      const crossed = thresholds.filter((h) => left <= h * 3600e3);
      if (!crossed.length) continue;
      const h = Math.min(...crossed);
      const key = `${d.key}@${d.dueAt}@${h}`;
      if (state.sentReminderKeys.includes(key)) continue;
      // Mark looser thresholds as done too.
      for (const other of crossed) newKeys.push(`${d.key}@${d.dueAt}@${other}`);
      pending.push({
        title: `${d.title} is due ${describeLeft(left)}`,
        body: `${d.course || "Canvas"} · due ${new Date(d.dueAt).toLocaleString("en-US", {
          timeZone: getConfig().timeZone || undefined,
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })}`,
        dueAt: d.dueAt,
        url: d.url,
      });
    }
  } catch (err) {
    console.warn("[reminders] Canvas check failed:", err.message);
  }

  // New announcements (first run just records what's already there).
  try {
    const courses = await canvas.listCourses();
    const names = Object.fromEntries(courses.map((c) => [c.id, c.name]));
    const anns = await canvas.getAnnouncements(courses.map((c) => c.id), 7);
    const firstRun = !state.seenAnnouncementIds.length;
    for (const a of anns) {
      if (state.seenAnnouncementIds.includes(a.id)) continue;
      newSeen.push(a.id);
      if (!firstRun) pending.push({ title: `New announcement: ${a.title}`, body: names[a.courseId] || "Canvas" });
    }
  } catch (err) {
    console.warn("[reminders] announcement check failed:", err.message);
  }

  const fresh = getState();
  fresh.sentReminderKeys.push(...newKeys);
  fresh.seenAnnouncementIds.push(...newSeen);
  pending.forEach((n) => push(fresh, n));
  saveState(fresh);
  fireCustomReminders();
}

// New Canvas Inbox messages (the first check just records what's already there).
export async function checkInbox() {
  if (!isConfigured()) return;
  let unread;
  try {
    unread = await canvas.listConversations({ scope: "unread", limit: 20 });
  } catch {
    return;
  }
  const state = getState();
  const firstRun = !state.seenMessageKeys;
  const seen = new Set(state.seenMessageKeys || []);
  const fresh = unread.filter((c) => !seen.has(`${c.id}@${c.lastMessageAt}`));
  if (!fresh.length && !firstRun) return;
  const latest = getState();
  latest.seenMessageKeys = [...(latest.seenMessageKeys || []), ...fresh.map((c) => `${c.id}@${c.lastMessageAt}`)].slice(-500);
  if (!firstRun) {
    for (const c of fresh) {
      const from = c.participants.find((p) => p !== getConfig().studentName) || c.participants[0] || "Canvas";
      push(latest, { title: `New message from ${from}`, body: c.subject, conversationId: c.id });
    }
  }
  saveState(latest);
}

// Reminders the student asked for ("remind me tomorrow at 6 to study").
function fireCustomReminders() {
  const state = getState();
  const now = Date.now();
  let changed = false;
  for (const r of state.customReminders) {
    if (!r.sent && new Date(r.remindAt).getTime() <= now) {
      r.sent = true;
      changed = true;
      push(state, { title: "Reminder", body: r.text });
    }
  }
  const kept = state.customReminders.filter((r) => !r.sent || now - new Date(r.remindAt) < 7 * 864e5);
  if (changed || kept.length !== state.customReminders.length) {
    state.customReminders = kept;
    saveState(state);
  }
}

// --- Independent mode: a daily check-in Cuss runs on its own -----------------

function localParts(timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const briefingRunning = new Set();

export async function runBriefing({ force = false } = {}) {
  const cfg = getConfig();
  const userId = currentUserId();
  if (!isConfigured() || briefingRunning.has(userId)) return null;
  const { date, time } = localParts(cfg.timeZone);
  const state = getState();
  if (!force && (!cfg.independent || time < cfg.briefingTime || state.lastBriefingDate === date)) return null;

  briefingRunning.add(userId);
  state.lastBriefingDate = date;
  saveState(state);
  try {
    const id = newChatId();
    await chat({
      conversationId: id,
      independent: true,
      title: `Daily briefing · ${new Date().toLocaleDateString("en-US", { timeZone: cfg.timeZone || undefined, weekday: "short", month: "short", day: "numeric" })}`,
      text: "Run my daily check-in: look through Canvas for what's due, what's missing, new announcements and grades, then give me today's briefing and plan. Make a study set if a test or quiz is coming up soon.",
    });
    const s = getState();
    push(s, { title: "Your daily briefing is ready", body: "Cuss checked Canvas and planned your day.", chatId: id });
    saveState(s);
    return id;
  } catch (err) {
    console.warn("[independent] briefing failed:", err.message);
    const s = getState();
    push(s, { title: "Daily briefing failed", body: describeError(err) });
    saveState(s);
    return null;
  } finally {
    briefingRunning.delete(userId);
  }
}

// Background jobs run once per student, each "as" that student.
function forEachUser(job) {
  for (const id of listUserIds()) {
    runAsUser(id, async () => {
      try {
        await job();
      } catch (err) {
        console.warn(`[background] user ${id}:`, err.message);
      }
    });
  }
}

export function startReminderLoop() {
  forEachUser(checkReminders);
  forEachUser(checkInbox);
  setInterval(() => forEachUser(checkReminders), CHECK_EVERY_MS).unref();
  setInterval(() => {
    forEachUser(async () => {
      fireCustomReminders();
      await checkInbox();
      await runBriefing();
    });
  }, 60 * 1000).unref();
}

export function notificationsSince(sinceIso) {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  return getState().notifications.filter((n) => new Date(n.createdAt).getTime() > since);
}

// iCalendar feed of upcoming deadlines (subscribe in Google/Apple Calendar).
export async function deadlinesIcs() {
  const items = await canvas.getDeadlines({ daysAhead: 120, daysBack: 7 });
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s = "") => String(s).replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cuss for Canvas//EN", "X-WR-CALNAME:Canvas deadlines"];
  for (const d of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.key}@cuss-canvas`,
      `DTSTAMP:${fmt(Date.now())}`,
      `DTSTART:${fmt(new Date(d.dueAt).getTime() - 30 * 60e3)}`,
      `DTEND:${fmt(d.dueAt)}`,
      `SUMMARY:${esc(`${d.title} due`)}`,
      `DESCRIPTION:${esc(`${d.course || ""}${d.url ? "\n" + d.url : ""}`)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT24H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(d.title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
