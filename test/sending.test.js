// Email safety: drafts stay drafts unless the student explicitly asks to send
// with auto-send on, and a draft is delivered once no matter how often Send is hit.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startFakeClaude, startCuss, client } from "./helpers.js";

const T = (name, input) => ({ type: "tool_use", name, input });
const email = (extra = {}) => T("draft_email", { course_id: 101, recipients: [{ id: 501, name: "Dr. Maya Chen" }], subject: "Office hours", body: "Hi Dr. Chen, could I come by Wednesday?", ...extra });
const script = (text, step) => {
  if (step > 0) return [{ type: "text", text: "Done." }];
  if (/and send it/i.test(text)) return [email({ send_now: true })];
  return [email()];
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

const cardOf = (events) => events.find((e) => e.type === "card")?.card;

test("with auto-send on, a draft request still stays a draft", async () => {
  const c = client(app.url);
  await c.loginDemo("Careful Student");
  await c.request("/api/settings", { method: "POST", json: { autoSendEmails: true } });
  assert.equal((await c.json("/api/status")).autoSendEmails, true);

  const { events } = await c.chat("chat-send-1", "Help me draft an email to Dr. Chen about office hours");
  assert.equal(cardOf(events).status, "draft");
  assert.equal((await c.json("/api/impact")).counts.email_sent || 0, 0);

  const sent = await c.chat("chat-send-2", "Email Dr. Chen about office hours and send it");
  assert.equal(cardOf(sent.events).status, "sent");
});

test("without auto-send, even an explicit send request stays a draft", async () => {
  const c = client(app.url);
  await c.loginDemo("Default Student");
  const { events } = await c.chat("chat-send-3", "Email Dr. Chen about office hours and send it");
  assert.equal(cardOf(events).status, "draft");
});

test("pressing Send many times at once delivers the message once", async () => {
  const c = client(app.url);
  await c.loginDemo("Double Tapper");
  const drafts = [];
  for (let i = 0; i < 4; i++) drafts.push(cardOf((await c.chat(`chat-send-burst-${i}`, "Write an email to Dr. Chen")).events));
  for (const draft of drafts) {
    const results = await Promise.all(Array.from({ length: 12 }, () => c.request(`/api/drafts/${draft.id}/send`, { method: "POST", json: {} })));
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.every((s) => s === 200 || s === 409), statuses.join(","));
  }
  assert.equal((await c.json("/api/impact")).counts.email_sent, drafts.length);
  // Sending again later is a no-op.
  assert.equal((await c.json(`/api/drafts/${drafts[0].id}/send`, { method: "POST", json: {} })).alreadySent, true);
  assert.equal((await c.json("/api/impact")).counts.email_sent, drafts.length);
});
