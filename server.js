import "./lib/env.js";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as canvas from "./lib/canvas.js";
import { chat, describeError } from "./lib/agent.js";
import * as chats from "./lib/chats.js";
import * as auth from "./lib/auth.js";
import { demoCanvasRouter } from "./lib/demo-canvas.js";
import {
  getConfig,
  saveConfig,
  isConfigured,
  serverConfig,
  ssoEnabled,
  runAsUser,
  deleteUserData,
  getState,
  saveState,
} from "./lib/store.js";
import { startReminderLoop, notificationsSince, checkReminders, deadlinesIcs, runBriefing } from "./lib/reminders.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// Block cross-site form/JS posts (with SameSite cookies this is belt and braces).
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Cross-site request blocked." });
  next();
});

// The built-in demo school ("Try the demo" on the login page).
if (serverConfig().demo) app.use("/demo-canvas", demoCanvasRouter);

// Every request runs "as" the logged-in student, if there is one.
app.use((req, res, next) => {
  const userId = auth.sessionUserId(req);
  req.userId = userId;
  if (userId) runAsUser(userId, next);
  else next();
});

app.use(express.static(path.join(here, "public")));

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(err);
    res.status(err.status && err.status < 600 ? err.status : 500).json({ error: describeError(err) });
  }
};

// --- Login ---------------------------------------------------------------------

// What the login page needs to know (no secrets).
app.get("/auth/info", (req, res) => {
  const s = serverConfig();
  res.json({
    schoolName: s.schoolName,
    canvasUrl: s.canvasUrl,
    sso: ssoEnabled(),
    tokenLogin: s.allowTokenLogin && Boolean(s.canvasUrl),
    demo: s.demo,
    aiReady: Boolean(s.anthropicKey),
  });
});

// Step 1: send the student to the school's Canvas/SSO login page
// (or the demo school's pretend login page).
function beginLogin(res, demo) {
  const state = crypto.randomBytes(24).toString("base64url") + (demo ? ".demo" : "");
  res.append("Set-Cookie", `cuss_oauth_state=${state}; ${auth.cookieOptions(600)}`);
  res.redirect(auth.authorizeUrl(state, { demo }));
}

app.get("/auth/login", (req, res) => {
  if (!ssoEnabled()) return res.redirect("/login.html?error=" + encodeURIComponent("Canvas login isn't set up on this server yet."));
  beginLogin(res, false);
});

app.get("/auth/demo", (req, res) => {
  if (!serverConfig().demo) return res.redirect("/login.html?error=" + encodeURIComponent("The demo is turned off."));
  beginLogin(res, true);
});

// Step 2: Canvas sends them back here with a one-time code.
app.get("/auth/callback", async (req, res) => {
  const fail = (msg) => res.redirect("/login.html?error=" + encodeURIComponent(msg));
  const { code, state, error } = req.query;
  if (error) return fail(error === "access_denied" ? "Login was cancelled." : `Canvas said: ${error}`);
  if (!code || !state || state !== auth.parseCookies(req).cuss_oauth_state) return fail("That login link expired. Please try again.");
  res.append("Set-Cookie", `cuss_oauth_state=; ${auth.cookieOptions(0)}`);
  try {
    const userId = await auth.finishLogin(String(code), { demo: String(state).endsWith(".demo") });
    auth.startSession(res, userId);
    runAsUser(userId, () => checkReminders().catch(() => {}));
    res.redirect("/");
  } catch (err) {
    console.error(err);
    fail(err.message);
  }
});

// Alternative: log in with a personal access token (schools that allow them, testing).
app.post(
  "/auth/token",
  wrap(async (req, res) => {
    if (!serverConfig().allowTokenLogin) return res.status(403).json({ error: "Token login is turned off." });
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "Paste your Canvas access token." });
    const r = await fetch(serverConfig().canvasUrl + "/api/v1/users/self/profile", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!r.ok) return res.status(400).json({ error: "Canvas didn't accept that token." });
    const profile = await r.json();
    const userId = String(profile.id);
    runAsUser(userId, () =>
      saveConfig({ accessToken: token, refreshToken: "", tokenExpiresAt: 0, studentName: profile.short_name || profile.name || "" }),
    );
    auth.startSession(res, userId);
    runAsUser(userId, () => checkReminders().catch(() => {}));
    res.json({ ok: true });
  }),
);

app.post("/auth/logout", (req, res) => {
  auth.endSession(req, res);
  res.json({ ok: true });
});

// Everything under /api needs a logged-in student.
app.use(["/api", "/calendar.ics"], (req, res, next) => {
  if (!req.userId) return res.status(401).json({ error: "Please log in." });
  next();
});

// Removes this student's data and disconnects Cuss from their Canvas account.
app.post(
  "/api/account/delete",
  wrap(async (req, res) => {
    await auth.revokeToken();
    deleteUserData();
    auth.endSession(req, res, { allForUser: true });
    res.json({ ok: true });
  }),
);

// --- Settings --------------------------------------------------------------

app.get("/api/status", (req, res) => {
  const c = getConfig();
  res.json({
    configured: isConfigured(),
    aiReady: Boolean(c.anthropicKey),
    demo: c.demo,
    schoolName: serverConfig().schoolName,
    studentName: c.studentName,
    reminderHours: c.reminderHours,
    independent: c.independent,
    briefingTime: c.briefingTime,
    autoSendEmails: c.autoSendEmails,
  });
});

app.post(
  "/api/settings",
  wrap(async (req, res) => {
    const { reminderHours, independent, briefingTime, timeZone, autoSendEmails } = req.body || {};
    const patch = {};
    if (Array.isArray(reminderHours)) patch.reminderHours = reminderHours.map(Number).filter((h) => h > 0);
    if (typeof independent === "boolean") patch.independent = independent;
    if (typeof autoSendEmails === "boolean") patch.autoSendEmails = autoSendEmails;
    if (/^\d{2}:\d{2}$/.test(briefingTime || "")) patch.briefingTime = briefingTime;
    if (timeZone) patch.timeZone = String(timeZone);
    saveConfig(patch);
    res.json({ ok: true });
  }),
);

// --- Dashboard data -----------------------------------------------------------

app.get("/api/courses", wrap(async (req, res) => res.json(await canvas.listCourses())));

app.get(
  "/api/deadlines",
  wrap(async (req, res) => {
    const [upcoming, missing] = await Promise.all([
      canvas.getDeadlines({ daysAhead: Number(req.query.days) || 14 }),
      canvas.getMissing().catch(() => []),
    ]);
    res.json({ upcoming, missing });
  }),
);

app.get(
  "/calendar.ics",
  wrap(async (req, res) => {
    res.type("text/calendar").set("Content-Disposition", 'attachment; filename="canvas-deadlines.ics"');
    res.send(await deadlinesIcs());
  }),
);

app.get("/api/notifications", (req, res) => res.json(notificationsSince(req.query.since)));

// --- Saved chats & memory -----------------------------------------------------

app.get("/api/chats", (req, res) => res.json(chats.listChats()));
app.get(
  "/api/chats/:id",
  wrap(async (req, res) => {
    const c = chats.loadChat(req.params.id);
    res.json({ id: c.id, title: c.title, kind: c.kind, display: c.display });
  }),
);
app.delete("/api/chats/:id", (req, res) => {
  chats.deleteChat(req.params.id);
  res.json({ ok: true });
});

app.get("/api/memory", (req, res) => res.json(chats.getMemories()));
app.post("/api/memory", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Write something to remember." });
  res.json(chats.addMemory(text));
});
app.delete("/api/memory/:id", (req, res) => res.json({ ok: chats.removeMemory(req.params.id) }));

app.post(
  "/api/briefing",
  wrap(async (req, res) => {
    const id = await runBriefing({ force: true });
    if (!id) return res.status(409).json({ error: "A briefing is already running, or the briefing failed. Check notifications." });
    res.json({ chatId: id });
  }),
);

// --- Chat (streams newline-delimited JSON events) -----------------------------

app.post("/api/chat", async (req, res) => {
  const { conversationId, text, voice, timeZone } = req.body || {};
  if (!conversationId || !text) return res.status(400).json({ error: "Missing message." });
  // Everyone shares the app owner's AI key, so keep a daily cap per student.
  const limit = Number(process.env.DAILY_MESSAGE_LIMIT) || 150;
  const state = getState();
  const today = new Date().toISOString().slice(0, 10);
  if (state.usageDay !== today) Object.assign(state, { usageDay: today, usageCount: 0 });
  if (state.usageCount >= limit) {
    return res.status(429).json({ error: `You've reached today's limit of ${limit} messages. It resets tomorrow.` });
  }
  state.usageCount++;
  saveState(state);
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  const emit = (event) => res.write(JSON.stringify(event) + "\n");
  try {
    await chat({ conversationId, text: String(text).slice(0, 8000), voice, timeZone }, emit);
  } catch (err) {
    console.error(err);
    emit({ type: "error", error: describeError(err) });
  }
  emit({ type: "done" });
  res.end();
});

// --- Sending drafted emails (only ever triggered by the student) --------------

app.post(
  "/api/drafts/:id/send",
  wrap(async (req, res) => {
    const draft = chats.getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: "That draft expired. Ask me to write it again." });
    if (draft.status === "sent") return res.json({ ok: true, alreadySent: true });
    const subject = String(req.body?.subject ?? draft.subject).trim();
    const body = String(req.body?.body ?? draft.body).trim();
    if (!subject || !body) return res.status(400).json({ error: "Subject and message can't be empty." });
    await canvas.sendMessage({
      courseId: draft.courseId,
      recipientIds: draft.recipients.map((r) => r.id),
      subject,
      body,
    });
    Object.assign(draft, { status: "sent", subject, body });
    chats.saveDraft(draft);
    chats.updateCardEverywhere(draft.id, { status: "sent", subject, body });
    res.json({ ok: true });
  }),
);

const PORT = Number(process.env.PORT) || 3000;
// Only this computer can reach the app by default. When hosting it for other
// students, set HOST=0.0.0.0 (most hosting services do this for you).
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  const s = serverConfig();
  console.log(`\n  Cuss for Canvas is running → ${s.publicUrl}`);
  if (!s.canvasUrl) console.log("  ⚠  Set CANVAS_URL in .env (e.g. https://sfsu.instructure.com)");
  if (!s.anthropicKey) console.log("  ⚠  Set ANTHROPIC_API_KEY in .env");
  console.log(ssoEnabled() ? "  ✓ Canvas SSO login is on" : "  ⓘ Canvas SSO login is off until CANVAS_CLIENT_ID / CANVAS_CLIENT_SECRET are set");
  console.log("");
  startReminderLoop();
});
