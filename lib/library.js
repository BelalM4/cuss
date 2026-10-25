// Each class's library: Canvas files Cuss brings in, files the student uploads,
// and notes (written by the student or saved by Cuss). Anything can get a
// "read by" date (like "next class") and a reminder, even if it isn't a Canvas
// assignment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as canvas from "./canvas.js";
import { readFileForClaude } from "./files.js";
import { getConfig, getState, readJson, saveState, userDir, writeJson } from "./store.js";

const FILE = "library.json";
const MAX_UPLOAD = 20 * 1024 * 1024;
const MAX_ITEMS_PER_CLASS = 300;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Demo University's class schedule, so "next class" works right away in the demo.
const DEMO_CLASS_DAYS = { 101: [1, 3], 102: [2, 4], 103: [1, 3, 5] };

const load = () => readJson(FILE, { courses: {} });
const save = (lib) => writeJson(FILE, lib);

function courseOf(lib, courseId) {
  const key = String(Number(courseId));
  if (key === "NaN" || key === "0") throw Object.assign(new Error("Unknown class."), { status: 400 });
  lib.courses[key] ||= { classDays: getConfig().demo ? [...(DEMO_CLASS_DAYS[key] || [])] : [], items: [] };
  return lib.courses[key];
}

function findItem(lib, id) {
  for (const [courseId, c] of Object.entries(lib.courses)) {
    const item = c.items.find((i) => i.id === id);
    if (item) return { courseId, course: c, item };
  }
  throw Object.assign(new Error("That file or note no longer exists."), { status: 404 });
}

// --- Dates ---------------------------------------------------------------------

function todayIn(timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

const addDays = (ymd, n) => {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd) => new Date(ymd + "T12:00:00Z").getUTCDay();

// The next day this class meets, after today.
export function nextClassDate(classDays, timeZone = getConfig().timeZone) {
  if (!classDays?.length) return null;
  const today = todayIn(timeZone);
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (classDays.includes(weekday(d))) return d;
  }
  return null;
}

// "next_class" | "YYYY-MM-DD" | "" → a date string, or null to clear.
function resolveReadBy(value, course) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value === "next_class" || value === "next class") {
    const d = nextClassDate(course.classDays);
    if (!d) throw Object.assign(new Error("Set which days this class meets first, so Cuss knows when “next class” is."), { status: 400 });
    return d;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || isNaN(new Date(value))) throw Object.assign(new Error("Pick a valid date."), { status: 400 });
  return String(value);
}

// --- Reminders (they go through the same reminder loop as everything else) -----

function setReminder(item, courseName, remindAt) {
  const state = getState();
  state.customReminders = state.customReminders.filter((r) => r.libraryItem !== item.id);
  if (remindAt) {
    const at = new Date(remindAt);
    if (isNaN(at)) throw Object.assign(new Error("Pick a valid reminder time."), { status: 400 });
    state.customReminders.push({
      id: crypto.randomUUID(),
      libraryItem: item.id,
      text: `${item.kind === "task" ? "" : "Read: "}${item.title}${courseName ? ` (${courseName})` : ""}`,
      remindAt: at.toISOString(),
      sent: false,
    });
    item.remindAt = at.toISOString();
  } else {
    delete item.remindAt;
  }
  saveState(state);
}

// --- Reading and listing ---------------------------------------------------------

const publicItem = (i) => ({
  id: i.id,
  kind: i.kind, // canvas | upload | note | task
  title: i.title,
  type: i.type || null,
  size: i.size || null,
  readBy: i.readBy || null,
  remindAt: i.remindAt || null,
  done: !!i.done,
  addedBy: i.addedBy,
  createdAt: i.createdAt,
  hasText: i.kind === "note" || i.kind === "task" ? !!i.text : undefined,
});

export function getClass(courseId) {
  const lib = load();
  const c = courseOf(lib, courseId);
  return {
    courseId: Number(courseId),
    classDays: c.classDays,
    nextClass: nextClassDate(c.classDays),
    items: c.items.map(publicItem),
  };
}

// Every class's items with a read-by date (for the Today panel and calendar).
export function upcomingReading({ includeDone = false } = {}) {
  const lib = load();
  const out = [];
  for (const [courseId, c] of Object.entries(lib.courses)) {
    for (const i of c.items) if (i.readBy && (includeDone || !i.done)) out.push({ ...publicItem(i), courseId: Number(courseId) });
  }
  return out.sort((a, b) => a.readBy.localeCompare(b.readBy));
}

// Everything that belongs on a calendar: read-by dates and reminders.
export function calendarItems() {
  const lib = load();
  const out = [];
  for (const [courseId, c] of Object.entries(lib.courses)) {
    for (const i of c.items) if (!i.done && (i.readBy || i.remindAt)) out.push({ ...publicItem(i), courseId: Number(courseId) });
  }
  return out;
}

export function setClassDays(courseId, days) {
  const lib = load();
  const c = courseOf(lib, courseId);
  c.classDays = [...new Set((days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  save(lib);
  return getClass(courseId);
}

function addItem(courseId, fields) {
  const lib = load();
  const c = courseOf(lib, courseId);
  if (c.items.length >= MAX_ITEMS_PER_CLASS) throw Object.assign(new Error("This class's library is full. Delete a few items first."), { status: 400 });
  const item = { id: crypto.randomUUID(), done: false, createdAt: new Date().toISOString(), addedBy: "you", ...fields };
  item.title = String(item.title || "Untitled").trim().slice(0, 200) || "Untitled";
  if (fields.readBy !== undefined) item.readBy = resolveReadBy(fields.readBy, c) || undefined;
  c.items.unshift(item);
  save(lib);
  return item;
}

export function addNote(courseId, { title, text, addedBy = "you", readBy }) {
  if (!String(text || "").trim()) throw Object.assign(new Error("The note is empty."), { status: 400 });
  return publicItem(addItem(courseId, { kind: "note", title, text: String(text).slice(0, 100_000), addedBy, readBy }));
}

// A to-do that isn't a file, like "Read chapter 4" or "Bring a lab coat".
export function addTask(courseId, { title, text, addedBy = "you", readBy }) {
  if (!String(title || "").trim()) throw Object.assign(new Error("Give it a name."), { status: 400 });
  return publicItem(addItem(courseId, { kind: "task", title, text: text ? String(text).slice(0, 4000) : undefined, addedBy, readBy }));
}

export function addUpload(courseId, { name, type, buffer }) {
  if (!buffer?.length) throw Object.assign(new Error("That file is empty."), { status: 400 });
  if (buffer.length > MAX_UPLOAD) throw Object.assign(new Error("Files can be up to 20 MB."), { status: 413 });
  const safeName = path.basename(String(name || "file")).slice(0, 180) || "file";
  const item = addItem(courseId, { kind: "upload", title: safeName.replace(/\.[^.]+$/, ""), fileName: safeName, type: String(type || "application/octet-stream").slice(0, 100), size: buffer.length });
  const dir = path.join(userDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, item.id), buffer, { mode: 0o600 });
  return publicItem(item);
}

// Brings the class's Canvas files into its library (once each).
export async function importCanvasFiles(courseId) {
  const files = await canvas.listFiles(courseId);
  const lib = load();
  const c = courseOf(lib, courseId);
  const have = new Set(c.items.filter((i) => i.kind === "canvas").map((i) => String(i.fileId)));
  const fresh = files.filter((f) => !have.has(String(f.id)));
  for (const f of fresh.reverse()) {
    c.items.unshift({
      id: crypto.randomUUID(),
      kind: "canvas",
      fileId: f.id,
      title: String(f.name || "Course file").replace(/\.[^.]+$/, ""),
      fileName: f.name,
      type: f.type,
      done: false,
      addedBy: "cuss",
      createdAt: new Date().toISOString(),
    });
  }
  save(lib);
  return { added: fresh.length, total: files.length };
}

export function updateItem(id, patch = {}) {
  const lib = load();
  const { courseId, course, item } = findItem(lib, id);
  if (patch.title !== undefined) item.title = String(patch.title).trim().slice(0, 200) || item.title;
  if (patch.text !== undefined && (item.kind === "note" || item.kind === "task")) item.text = String(patch.text).slice(0, 100_000);
  if (patch.done !== undefined) item.done = !!patch.done;
  const readBy = resolveReadBy(patch.readBy, course);
  if (readBy !== undefined) {
    if (readBy) item.readBy = readBy;
    else delete item.readBy;
  }
  if (patch.remindAt !== undefined) setReminder(item, patch.courseName, patch.remindAt);
  save(lib);
  return { ...publicItem(item), courseId: Number(courseId) };
}

export function deleteItem(id) {
  const lib = load();
  const { course, item } = findItem(lib, id);
  course.items = course.items.filter((i) => i.id !== id);
  save(lib);
  if (item.kind === "upload") fs.rmSync(path.join(userDir(), "uploads", item.id), { force: true });
  const state = getState();
  state.customReminders = state.customReminders.filter((r) => r.libraryItem !== id);
  saveState(state);
}

// The raw uploaded file, for opening it in the browser.
export function uploadedFile(id) {
  const { item } = findItem(load(), id);
  if (item.kind !== "upload") throw Object.assign(new Error("Only uploaded files can be downloaded here."), { status: 400 });
  return { buffer: fs.readFileSync(path.join(userDir(), "uploads", item.id)), name: item.fileName, type: item.type };
}

export function getItem(id) {
  const { courseId, item } = findItem(load(), id);
  return { ...publicItem(item), courseId: Number(courseId), text: item.kind === "note" || item.kind === "task" ? item.text || "" : undefined, fileId: item.fileId };
}

// Content for Claude: { text } | { pdf } | { image, mediaType }.
export async function readItemForClaude(id) {
  const { courseId, item } = findItem(load(), id);
  if (item.kind === "note") return { text: `# ${item.title}\n\n${item.text}`, name: item.title };
  if (item.kind === "task") return { text: `# ${item.title}\n\n${item.text || "(A to-do with no extra details.)"}`, name: item.title };
  if (item.kind === "canvas") return { ...(await canvas.readCourseItem(courseId, "file", item.fileId)), name: item.title };
  const { buffer, name, type } = uploadedFile(id);
  return { ...(await readFileForClaude(buffer, name, type)), name };
}

// --- Calendar --------------------------------------------------------------------

const icsEsc = (s = "") => String(s).replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
const icsStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Calendar events for read-by dates (all-day, with an alert at 6 PM the night
// before) and for reminders (at the reminder time).
export function libraryEvents(items, courseNames = {}) {
  const lines = [];
  for (const i of items) {
    const course = courseNames[i.courseId] || "";
    const what = i.kind === "task" ? i.title : `Read: ${i.title}`;
    if (i.readBy) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:read-${i.id}@cuss-canvas`,
        `DTSTAMP:${icsStamp(Date.now())}`,
        `DTSTART;VALUE=DATE:${i.readBy.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${addDays(i.readBy, 1).replace(/-/g, "")}`,
        `SUMMARY:${icsEsc(what)}`,
        `DESCRIPTION:${icsEsc(`${course ? course + " · " : ""}Due before class. Added with Cuss.`)}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT6H",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEsc(what)}`,
        "END:VALARM",
        "END:VEVENT",
      );
    }
    if (i.remindAt) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:remind-${i.id}@cuss-canvas`,
        `DTSTAMP:${icsStamp(Date.now())}`,
        `DTSTART:${icsStamp(i.remindAt)}`,
        `DTEND:${icsStamp(new Date(i.remindAt).getTime() + 15 * 60e3)}`,
        `SUMMARY:${icsEsc(`Reminder: ${i.title}`)}`,
        `DESCRIPTION:${icsEsc(course)}`,
        "BEGIN:VALARM",
        "TRIGGER:PT0M",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEsc(i.title)}`,
        "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  return lines;
}

export function itemIcs(id, courseName) {
  const item = getItem(id);
  if (!item.readBy && !item.remindAt) throw Object.assign(new Error("Give it a read-by date or a reminder first."), { status: 400 });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cuss for Canvas//EN", ...libraryEvents([item], { [item.courseId]: courseName }), "END:VCALENDAR"].join("\r\n");
}

export const dayNames = DAYS;
