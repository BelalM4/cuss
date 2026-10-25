// Class library: uploads, notes, readings "due next class", reminders,
// calendar links, Canvas imports, and Cuss reading and organizing it all.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startFakeClaude, startCuss, client } from "./helpers.js";

const T = (name, input) => ({ type: "tool_use", name, input });
let uploadedId = null;
const script = (text, step) => {
  if (/due next class/i.test(text))
    return [[T("organize_class_item", { course_id: 102, title: "Read chapter 4", read_by: "next_class", remind_at: "2099-01-01T18:00:00Z" })], [{ type: "text", text: "Added." }]][Math.min(step, 1)];
  if (/my notes/i.test(text)) return [[T("read_library_item", { item_id: uploadedId })], [{ type: "text", text: "Read your notes." }]][Math.min(step, 1)];
  if (/save/i.test(text)) return [[T("save_class_note", { course_id: 101, title: "Membrane transport summary", text: "- Diffusion\n- Osmosis" })], [{ type: "text", text: "Saved." }]][Math.min(step, 1)];
  return [[{ type: "text", text: "Hi." }]][0];
};

let claude, app;
before(async () => {
  claude = await startFakeClaude(script);
  app = await startCuss({ ANTHROPIC_BASE_URL: claude.url });
});
after(() => {
  app?.stop();
  claude?.close();
});

const steps = (events) => events.filter((e) => e.type === "step" && e.state === "done").map((e) => e.text);

test("upload a file, write a note, and set class days", async () => {
  const c = client(app.url);
  await c.loginDemo("Lib Student");
  const up = await c.json("/api/library/101/upload", {
    method: "POST",
    headers: { "content-type": "text/plain", "x-file-name": encodeURIComponent("My bio notes.txt") },
    body: "Osmosis moves water across a membrane.",
  });
  assert.equal(up.kind, "upload");
  assert.equal(up.title, "My bio notes");
  uploadedId = up.id;
  const file = await c.request(`/api/library/item/${up.id}/file`);
  assert.equal(await file.text(), "Osmosis moves water across a membrane.");

  const note = await c.json("/api/library/101/notes", { method: "POST", json: { title: "Lecture 15", text: "Active transport needs ATP." } });
  assert.equal(note.kind, "note");

  const days = await c.json("/api/library/101/days", { method: "PUT", json: { days: [1, 3, 9, "x"] } });
  assert.deepEqual(days.classDays, [1, 3]);
  assert.match(days.nextClass, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok([1, 3].includes(new Date(days.nextClass + "T12:00:00Z").getUTCDay()));

  const lib = await c.json("/api/library/101");
  assert.equal(lib.items.length, 2);
  // Demo classes come with their meeting days.
  assert.deepEqual((await c.json("/api/library/102")).classDays, [2, 4]);
});

test("a reading due next class, with a reminder, shows up everywhere", async () => {
  const c = client(app.url);
  await c.loginDemo("Reader");
  await c.json("/api/library/102/days", { method: "PUT", json: { days: [2, 4] } });
  const task = await c.json("/api/library/102/tasks", { method: "POST", json: { title: "Read the Wilson speech", readBy: "next_class" } });
  const { nextClass } = await c.json("/api/library/102");
  assert.equal(task.readBy, nextClass);

  const remindAt = new Date(Date.now() + 3 * 864e5).toISOString();
  const updated = await c.json(`/api/library/item/${task.id}`, { method: "PATCH", json: { remindAt } });
  assert.equal(updated.remindAt, remindAt);

  const upcoming = await c.json("/api/library/upcoming");
  assert.equal(upcoming[0].title, "Read the Wilson speech");

  const ics = await (await c.request(`/api/library/item/${task.id}/ics`)).text();
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, new RegExp(`DTSTART;VALUE=DATE:${nextClass.replace(/-/g, "")}`));
  assert.match(ics, /SUMMARY:Reminder: Read the Wilson speech/);

  // Done items leave the Today list.
  await c.json(`/api/library/item/${task.id}`, { method: "PATCH", json: { done: true } });
  assert.equal((await c.json("/api/library/upcoming")).length, 0);

  // "Next class" needs class days.
  await c.json("/api/library/103/days", { method: "PUT", json: { days: [] } });
  const bad = await c.request("/api/library/103/tasks", { method: "POST", json: { title: "Essay outline", readBy: "next_class" } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /days this class meets/);
});

test("private calendar subscription link works without a login", async () => {
  const c = client(app.url);
  await c.loginDemo("Cal");
  await c.json("/api/library/101/tasks", { method: "POST", json: { title: "Bring lab coat", readBy: "2099-03-04" } });
  const link = await c.json("/api/calendar-link", { method: "POST", json: {} });
  assert.match(link.webcal, /^webcal:\/\/.+\/cal\/[a-f0-9]{48}\.ics$/);
  const feed = await fetch(link.https);
  assert.equal(feed.status, 200);
  const ics = await feed.text();
  assert.match(ics, /SUMMARY:.+ due/); // Canvas deadlines
  assert.match(ics, /SUMMARY:Bring lab coat/); // library items
  // Resetting the link turns the old one off.
  await c.json("/api/calendar-link", { method: "POST", json: { reset: true } });
  assert.equal((await fetch(link.https)).status, 404);
  assert.equal((await fetch(`${app.url}/cal/${"0".repeat(48)}.ics`)).status, 404);
});

test("bring in Canvas files once", async () => {
  const c = client(app.url);
  await c.loginDemo("Importer");
  const first = await c.json("/api/library/101/import", { method: "POST" });
  assert.ok(first.added >= 1);
  const again = await c.json("/api/library/101/import", { method: "POST" });
  assert.equal(again.added, 0);
  const lib = await c.json("/api/library/101");
  assert.ok(lib.items.some((i) => i.kind === "canvas" && i.addedBy === "cuss"));
});

test("Cuss reads uploaded notes, adds readings due next class, and saves notes", async () => {
  const c = client(app.url);
  await c.loginDemo("Agent Student");
  const up = await c.json("/api/library/101/upload", {
    method: "POST",
    headers: { "content-type": "text/plain", "x-file-name": "notes.txt" },
    body: "The sodium-potassium pump uses ATP.",
  });
  uploadedId = up.id;
  let r = await c.chat("chat-lib-1", "What do my notes say?");
  assert.ok(steps(r.events).some((s) => s.includes("Read “notes")), steps(r.events).join(" | "));
  const toolResult = claude.requests.at(-1).messages.at(-1).content[0];
  assert.match(JSON.stringify(toolResult.content), /sodium-potassium pump/);

  await c.json("/api/library/102/days", { method: "PUT", json: { days: [0, 1, 2, 3, 4, 5, 6] } });
  r = await c.chat("chat-lib-2", "Chapter 4 reading is due next class, remind me");
  assert.ok(steps(r.events).some((s) => s.startsWith("“Read chapter 4” due")), steps(r.events).join(" | "));
  const card = r.events.find((e) => e.type === "card")?.card;
  assert.equal(card.kind, "library");
  assert.equal(card.item.title, "Read chapter 4");
  assert.match(card.courseName, /HIST/);
  const lib = await c.json("/api/library/102");
  const task = lib.items.find((i) => i.title === "Read chapter 4");
  assert.equal(task.readBy, lib.nextClass);
  assert.equal(task.addedBy, "cuss");
  assert.ok(task.remindAt);

  r = await c.chat("chat-lib-3", "Save that as notes");
  assert.ok(steps(r.events).some((s) => s.includes("Saved “Membrane transport summary”")));
  assert.ok((await c.json("/api/library/101")).items.some((i) => i.kind === "note" && i.addedBy === "cuss"));
});

test("students can't reach each other's library, and deleting removes the file", async () => {
  const a = client(app.url);
  const b = client(app.url);
  await a.loginDemo("Alice Lib");
  await b.loginDemo("Bob Lib");
  const up = await a.json("/api/library/101/upload", { method: "POST", headers: { "content-type": "text/plain", "x-file-name": "secret.txt" }, body: "private" });
  assert.equal((await b.request(`/api/library/item/${up.id}/file`)).status, 404);
  assert.equal((await b.request(`/api/library/item/${up.id}`, { method: "DELETE" })).status, 404);
  const users = fs.readdirSync(path.join(app.dataDir, "users"));
  const owner = users.find((u) => fs.existsSync(path.join(app.dataDir, "users", u, "uploads", up.id)));
  assert.ok(owner);
  assert.equal((await a.request(`/api/library/item/${up.id}`, { method: "DELETE" })).status, 200);
  assert.equal(fs.existsSync(path.join(app.dataDir, "users", owner, "uploads", up.id)), false);
});
