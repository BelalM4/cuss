// End-to-end tests: real server, built-in demo school, fake Claude.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startFakeClaude, startCuss, client } from "./helpers.js";

const T = (name, input) => ({ type: "tool_use", name, input });
const script = (text, step) => {
  if (/email/i.test(text))
    return [
      [T("get_instructors", { course_id: 101 })],
      [T("draft_email", { course_id: 101, recipients: [{ id: 501, name: "Dr. Maya Chen" }], subject: "Office hours", body: "Hi Dr. Chen, could I come by Wednesday?" })],
      [{ type: "text", text: "Drafted it." }],
    ][Math.min(step, 2)];
  if (/inbox/i.test(text))
    return [[T("check_inbox", { unread_only: true })], [T("draft_reply", { conversation_id: 3001, body: "Yes please, thank you!" })], [{ type: "text", text: "Reply drafted." }]][Math.min(step, 2)];
  if (/slides/i.test(text)) return [[T("read_course_item", { course_id: 101, item_type: "file", item_id: "4001" })], [{ type: "text", text: "Read them." }]][Math.min(step, 1)];
  return [[T("get_deadlines", { days_ahead: 7 })], [{ type: "text", text: "Here is your week." }]][Math.min(step, 1)];
};

let claude, app;
before(async () => {
  claude = await startFakeClaude(script);
  app = await startCuss({ ANTHROPIC_BASE_URL: claude.url, DAILY_MESSAGE_LIMIT: "6" });
});
after(() => {
  app?.stop();
  claude?.close();
});

const cardsOf = (events) => events.filter((e) => e.type === "card").map((e) => e.card);
const steps = (events) => events.filter((e) => e.type === "step" && e.state === "done").map((e) => e.text);

test("logged-out visitors get 401 from the API and see the login page", async () => {
  const c = client(app.url);
  assert.equal((await c.request("/api/status")).status, 401);
  assert.equal((await c.request("/login.html")).status, 200);
});

test("demo OAuth sign-in creates a session and an encrypted token on disk", async () => {
  const c = client(app.url);
  await c.loginDemo("Ada Student");
  const status = await c.json("/api/status");
  assert.equal(status.demo, true);
  assert.equal(status.studentName, "Ada Student");
  const users = fs.readdirSync(path.join(app.dataDir, "users"));
  const cfgs = users.map((u) => fs.readFileSync(path.join(app.dataDir, "users", u, "config.json"), "utf8"));
  assert.ok(cfgs.every((cfg) => cfg.includes('"accessToken": "enc:v1:') && !/"accessToken": "demo-/.test(cfg)));
});

test("dashboard: deadlines, missing work, unread inbox and course files", async () => {
  const c = client(app.url);
  await c.loginDemo("Dash");
  const { upcoming, missing } = await c.json("/api/deadlines");
  assert.ok(upcoming.length >= 5);
  assert.equal(missing.length, 1);
  assert.equal((await c.json("/api/inbox")).length, 2);
  assert.equal((await c.json("/api/courses")).length, 3);
});

test("chat shows live steps and the agent reads a PDF from course files", async () => {
  const c = client(app.url);
  await c.loginDemo("Reader");
  const due = await c.chat("chat-due-0001", "What's due this week?");
  assert.ok(steps(due.events).some((s) => s.startsWith("Checked deadlines")));
  const pdf = await c.chat("chat-pdf-0001", "Quiz me on the lecture slides");
  assert.ok(steps(pdf.events).some((s) => s.includes("Lecture15")));
  const toolResult = claude.requests.at(-1).messages.at(-1).content[0];
  assert.equal(toolResult.content[0].type, "document");
  assert.equal(toolResult.content[0].source.media_type, "application/pdf");
});

test("emails are drafts until the student sends them; sending counts toward impact", async () => {
  const c = client(app.url);
  await c.loginDemo("Writer");
  const { events } = await c.chat("chat-mail-0001", "Email my bio professor");
  const [draft] = cardsOf(events);
  assert.equal(draft.kind, "draft");
  assert.equal(draft.status, "draft");
  const sent = await c.json(`/api/drafts/${draft.id}/send`, { method: "POST", json: {} });
  assert.equal(sent.ok, true);
  assert.equal((await c.json("/api/impact")).counts.email_sent, 1);
});

test("inbox replies are drafted in the right conversation and marked read", async () => {
  const c = client(app.url);
  await c.loginDemo("Replier");
  const { events } = await c.chat("chat-inbox-0001", "Check my inbox");
  const [reply] = cardsOf(events);
  assert.equal(reply.kind, "reply");
  assert.equal(reply.conversationId, 3001);
  assert.equal(reply.quote.from, "Prof. Daniel Ortiz");
  await c.json(`/api/drafts/${reply.id}/send`, { method: "POST", json: {} });
  const unread = await c.json("/api/inbox");
  assert.ok(!unread.some((x) => x.id === 3001));
});

test("students can't see or use each other's data", async () => {
  const a = client(app.url);
  const b = client(app.url);
  await a.loginDemo("Alice");
  await b.loginDemo("Bob");
  await a.json("/api/memory", { method: "POST", json: { text: "Alice is a nursing major" } });
  const { events } = await a.chat("chat-private-01", "Email my professor");
  const [draft] = cardsOf(events);
  assert.equal((await b.json("/api/memory")).length, 0);
  assert.equal((await b.json("/api/chats/chat-private-01")).display.length, 0);
  assert.equal((await b.request(`/api/drafts/${draft.id}/send`, { method: "POST", json: {} })).status, 404);
});

test("cross-site requests are blocked", async () => {
  const c = client(app.url);
  await c.loginDemo("Csrf");
  const res = await c.request("/api/memory", { method: "POST", json: { text: "x" }, headers: { origin: "https://evil.example" } });
  assert.equal(res.status, 403);
});

test("daily message cap per student", async () => {
  const c = client(app.url);
  await c.loginDemo("Chatty");
  let last;
  for (let i = 0; i < 7; i++) last = await c.chat(`chat-cap-000${i}`, "What's due?");
  assert.equal(last.status, 429);
});

test("log out of all devices ends every session", async () => {
  const phone = client(app.url);
  await phone.loginDemo("Multi");
  // A second device: another session for the same student.
  const file = path.join(app.dataDir, "sessions.json");
  const sessions = JSON.parse(fs.readFileSync(file, "utf8"));
  const userId = sessions[phone.jar.get("cuss_sid")].userId;
  sessions["second-device-session"] = { userId, expiresAt: Date.now() + 864e5 };
  fs.writeFileSync(file, JSON.stringify(sessions));
  const laptop = client(app.url);
  laptop.jar.set("cuss_sid", "second-device-session");
  assert.equal((await laptop.request("/api/status")).status, 200);
  await phone.request("/auth/logout-all", { method: "POST" });
  assert.equal((await laptop.request("/api/status")).status, 401);
});

test("public pages load", async () => {
  const c = client(app.url);
  for (const p of ["/impact", "/impact.json", "/share", "/privacy.html", "/manifest.webmanifest", "/sw.js", "/qr.svg"]) {
    assert.equal((await c.request(p)).status, 200, p);
  }
});
