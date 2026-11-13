import "./lib/env.js";
import express from "express";
import crypto from "node:crypto";
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as canvas from "./lib/canvas.js";
import { chat, describeError } from "./lib/agent.js";
import * as chats from "./lib/chats.js";
import * as auth from "./lib/auth.js";
import { demoCanvasRouter } from "./lib/demo-canvas.js";
import { recordImpact, myImpact, aggregateImpact } from "./lib/impact.js";
import {
  getConfig,
  saveConfig,
  isConfigured,
  serverConfig,
  ssoEnabled,
  runAsUser,
  restoreUser,
  deleteUserData,
} from "./lib/store.js";
import { startReminderLoop, notificationsSince, checkReminders, checkInbox, deadlinesIcs, runBriefing } from "./lib/reminders.js";
import * as library from "./lib/library.js";
import { listUserIds } from "./lib/store.js";
import { reserveAiUsage } from "./lib/usage.js";
import { closeDb, initDb } from "./lib/db.js";
import { DATA_DIR } from "./lib/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// Block cross-site form/JS posts (with SameSite cookies this is belt and braces).
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Cross-site request blocked." }); }
    catch { return res.status(403).json({ error: "Invalid request origin." }); }
  }
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

// The app itself is React (web/, built into web/dist by `npm run build`, which
// runs after every npm install). Login and the other pages live in public/.
const webDist = path.join(here, "web", "dist");
app.use(express.static(webDist));
app.use(express.static(path.join(here, "public")));
app.get("/", (req, res) => res.status(503).type("text").send("The Cuss app isn't built yet. Run `npm run build`, then restart."));

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(err);
    res.status(err.status && err.status < 600 ? err.status : 500).json({ error: describeError(err) });
  }
};

// --- Login ---------------------------------------------------------------------

// QR code pointing at this app, for "scan to try it" on a slide or poster.
app.get("/qr.svg", async (req, res) => {
  const svg = await QRCode.toString(serverConfig().publicUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  res.type("image/svg+xml").set("Cache-Control", "no-cache").send(svg);
});
app.get("/share", (req, res) => res.sendFile(path.join(here, "public", "share.html")));
app.get("/share-info", (req, res) => res.json({ url: serverConfig().publicUrl }));

// Anonymous totals for judges and partners: no names, no course data.
app.get("/impact.json", (req, res) => res.json(aggregateImpact()));
app.get("/impact", (req, res) => res.sendFile(path.join(here, "public", "impact.html")));

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
function beginLogin(res, demo, hint = "") {
  const state = crypto.randomBytes(24).toString("base64url") + (demo ? ".demo" : "");
  res.append("Set-Cookie", `cuss_oauth_state=${state}; ${auth.cookieOptions(600)}`);
  res.redirect(auth.authorizeUrl(state, { demo, hint }));
}

app.get("/auth/login", (req, res) => {
  if (!ssoEnabled()) return res.redirect("/login.html?error=" + encodeURIComponent("Canvas login isn't set up on this server yet."));
  beginLogin(res, false);
});

app.get("/auth/demo", (req, res) => {
  if (!serverConfig().demo) return res.redirect("/login.html?error=" + encodeURIComponent("The demo is turned off."));
  // ?as=professor opens the demo school as the BIOL 230 instructor.
  beginLogin(res, true, req.query.as === "professor" ? "teacher" : "");
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
    runAsUser(userId, () => detectRole().then(() => Promise.all([checkReminders(), checkInbox()])).catch(() => {}));
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
    restoreUser(userId);
    runAsUser(userId, () =>
      saveConfig({ accessToken: token, refreshToken: "", tokenExpiresAt: 0, studentName: profile.short_name || profile.name || "" }),
    );
    auth.startSession(res, userId);
    runAsUser(userId, () => detectRole().then(() => Promise.all([checkReminders(), checkInbox()])).catch(() => {}));
    res.json({ ok: true });
  }),
);

app.post("/auth/logout", (req, res) => {
  auth.endSession(req, res);
  res.json({ ok: true });
});

// Signs this student out everywhere (every browser and phone).
app.post("/auth/logout-all", (req, res) => {
  auth.endSession(req, res, { allForUser: true });
  res.json({ ok: true });
});

// Calendar subscription for iPhone/Google/Outlook. Calendar apps can't send a
// login cookie, so the address carries a private random token instead.
app.get(
  "/cal/:token.ics",
  wrap(async (req, res) => {
    const token = String(req.params.token);
    const owner = /^[a-f0-9]{48}$/.test(token) && listUserIds().find((id) => runAsUser(id, () => getConfig().calendarToken === token));
    if (!owner) return res.status(404).type("text/plain").send("This calendar link was turned off. Get a new one in Cuss.");
    const ics = await runAsUser(owner, () => deadlinesIcs());
    res.type("text/calendar").set("Cache-Control", "no-store").send(ics);
  }),
);

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

// Professor or student? Canvas says so through course enrollments.
async function detectRole() {
  const courses = await canvas.listCourses();
  const role = courses.some((c) => c.role === "teacher") ? "teacher" : "student";
  saveConfig({ role });
  return role;
}

// --- Settings --------------------------------------------------------------

app.get("/api/status", wrap(async (req, res) => {
  let c = getConfig();
  if (!c.role && c.canvasToken) {
    await detectRole().catch(() => {});
    c = getConfig();
  }
  res.json({
    role: c.role || "student",
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
}));

app.post(
  "/api/settings",
  wrap(async (req, res) => {
    const { reminderHours, independent, briefingTime, timeZone, autoSendEmails } = req.body || {};
    const patch = {};
    if (Array.isArray(reminderHours)) {
      const hours = reminderHours.map(Number).filter((h) => Number.isFinite(h) && h > 0);
      if (!hours.length) return res.status(400).json({ error: "Enter at least one positive reminder interval." });
      patch.reminderHours = hours;
    }
    if (typeof independent === "boolean") patch.independent = independent;
    if (typeof autoSendEmails === "boolean") patch.autoSendEmails = autoSendEmails;
    if (briefingTime !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(briefingTime)) return res.status(400).json({ error: "Enter a valid briefing time." });
      patch.briefingTime = briefingTime;
    }
    if (timeZone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: String(timeZone) }).format();
      } catch {
        return res.status(400).json({ error: "Enter a valid time zone." });
      }
      patch.timeZone = String(timeZone);
    }
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

// Impact: the student's own numbers, and quiz results reported by the page.
app.get("/api/impact", (req, res) => res.json(myImpact()));
app.post("/api/impact/quiz", (req, res) => {
  const score = Number(req.body?.score);
  const total = Number(req.body?.total);
  if (!(total > 0 && score >= 0 && score <= total && total <= 100)) return res.status(400).json({ error: "Bad quiz result." });
  recordImpact("quiz", { score, total });
  res.json({ ok: true });
});

// Professor dashboard: per course, students needing attention and grading waiting.
app.get(
  "/api/teacher/overview",
  wrap(async (req, res) => {
    const courses = (await canvas.listCourses()).filter((c) => c.role === "teacher");
    const out = await Promise.all(
      courses.map(async (c) => {
        const [roster, queue] = await Promise.all([canvas.getRosterStatus(c.id).catch(() => null), canvas.getGradingQueue(c.id).catch(() => [])]);
        return {
          id: c.id,
          name: c.name,
          summary: roster?.summary || null,
          atRisk: (roster?.students || []).filter((s) => s.missing > 0 || (s.currentScore != null && s.currentScore < 70)).slice(0, 6),
          needsGrading: queue.reduce((n, a) => n + a.needsGrading, 0),
          queue,
        };
      }),
    );
    res.json(out);
  }),
);

// Unread Canvas Inbox messages for the Today panel.
app.get(
  "/api/inbox",
  wrap(async (req, res) => res.json(await canvas.listConversations({ scope: "unread", limit: 5 }))),
);

app.get(
  "/calendar.ics",
  wrap(async (req, res) => {
    res.type("text/calendar").set("Content-Disposition", 'attachment; filename="canvas-deadlines.ics"');
    res.send(await deadlinesIcs());
  }),
);

// --- Class library: files, notes and readings for each class ------------------

const courseName = async (id) => (await canvas.listCourses().catch(() => [])).find((c) => c.id === Number(id))?.name || "";

app.get("/api/library/upcoming", wrap((req, res) => res.json(library.upcomingReading())));
app.get("/api/library/:courseId", wrap((req, res) => res.json(library.getClass(req.params.courseId))));
app.put("/api/library/:courseId/days", wrap((req, res) => res.json(library.setClassDays(req.params.courseId, req.body?.days))));
app.post("/api/library/:courseId/notes", wrap((req, res) => res.json(library.addNote(req.params.courseId, req.body || {}))));
app.post("/api/library/:courseId/tasks", wrap((req, res) => res.json(library.addTask(req.params.courseId, req.body || {}))));
app.post(
  "/api/library/:courseId/import",
  wrap(async (req, res) => res.json(await library.importCanvasFiles(req.params.courseId))),
);
app.post(
  "/api/library/:courseId/upload",
  express.raw({ type: () => true, limit: "20mb" }),
  wrap((req, res) => {
    let name = "file";
    try {
      name = decodeURIComponent(req.get("X-File-Name") || "file");
    } catch {}
    res.json(library.addUpload(req.params.courseId, { name, type: req.get("Content-Type"), buffer: req.body }));
  }),
);
app.get("/api/library/item/:id", wrap((req, res) => res.json(library.getItem(req.params.id))));
app.patch(
  "/api/library/item/:id",
  wrap(async (req, res) => {
    const patch = { ...(req.body || {}) };
    if (patch.remindAt) patch.courseName = await courseName(library.getItem(req.params.id).courseId);
    res.json(library.updateItem(req.params.id, patch));
  }),
);
app.delete(
  "/api/library/item/:id",
  wrap((req, res) => {
    library.deleteItem(req.params.id);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/library/item/:id/file",
  wrap((req, res) => {
    const f = library.uploadedFile(req.params.id);
  res.type(f.type || "application/octet-stream").set("Content-Disposition", `inline; filename="${encodeURIComponent(f.name)}"`).set("X-Content-Type-Options", "nosniff").set("Content-Security-Policy", "sandbox").send(f.buffer);
  }),
);
app.get(
  "/api/library/item/:id/ics",
  wrap(async (req, res) => {
    const item = library.getItem(req.params.id);
    res.type("text/calendar").set("Content-Disposition", 'inline; filename="cuss.ics"').send(library.itemIcs(req.params.id, await courseName(item.courseId)));
  }),
);

// A private, auto-updating calendar link (deadlines, readings and reminders).
app.post("/api/calendar-link", (req, res) => {
  let token = getConfig().calendarToken;
  if (!token || req.body?.reset) {
    token = crypto.randomBytes(24).toString("hex");
    saveConfig({ calendarToken: token });
  }
  const base = (serverConfig().publicUrl || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const https = `${base}/cal/${token}.ics`;
  res.json({ https, webcal: https.replace(/^https?:/, "webcal:") });
});

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
  if (typeof conversationId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(conversationId)) return res.status(400).json({ error: "Bad chat id." });
  if (timeZone) {
    try { new Intl.DateTimeFormat("en", { timeZone: String(timeZone) }); }
    catch { return res.status(400).json({ error: "Enter a valid time zone." }); }
    saveConfig({ timeZone: String(timeZone) });
  }
  try { reserveAiUsage(); }
  catch (err) { return res.status(err.status || 500).json({ error: err.message }); }
  recordImpact("chat");
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

// Drafts being sent right now (per student), so a double tap or two open
// tabs can never deliver the same message twice.
const sendingDrafts = new Set();

app.post(
  "/api/drafts/:id/send",
  wrap(async (req, res) => {
    const lockKey = `${req.userId}:${req.params.id}`;
    if (sendingDrafts.has(lockKey)) return res.status(409).json({ error: "That message is already being sent." });
    sendingDrafts.add(lockKey);
    try {
      await sendDraft(req, res);
    } finally {
      sendingDrafts.delete(lockKey);
    }
  }),
);

async function sendDraft(req, res) {
  const draft = chats.getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: "That draft expired. Ask me to write it again." });
  if (draft.status === "sent") return res.json({ ok: true, alreadySent: true });
  const subject = String(req.body?.subject ?? draft.subject).trim();
  const body = String(req.body?.body ?? draft.body).trim();
  if (!body || (!subject && draft.kind !== "reply")) return res.status(400).json({ error: "Subject and message can't be empty." });
  if (draft.kind === "reply") {
    await canvas.replyToConversation(draft.conversationId, body);
  } else if (draft.kind === "announcement") {
    await canvas.postAnnouncement(draft.courseId, subject, body);
  } else {
    await canvas.sendMessage({
      courseId: draft.courseId,
      recipientIds: draft.recipients.map((r) => r.id),
      subject,
      body,
    });
  }
  Object.assign(draft, { status: "sent", subject, body });
  chats.saveDraft(draft);
  chats.updateCardEverywhere(draft.id, { status: "sent", subject, body });
  recordImpact({ reply: "reply_sent", announcement: "announcement_posted" }[draft.kind] || "email_sent");
  res.json({ ok: true });
}

const PORT = Number(process.env.PORT) || 3000;
// Only this computer can reach the app by default. When hosting it for other
// students, set HOST=0.0.0.0 (most hosting services do this for you).
const HOST = process.env.HOST || "127.0.0.1";
const db = await initDb(DATA_DIR);
if (db.enabled) console.log(`  Database: restored ${db.restored} files`);
else console.log("  Database: off (no DATABASE_URL)");

const server = app.listen(PORT, HOST, () => {
  const s = serverConfig();
  console.log(`\n  Cuss for Canvas is running → ${s.publicUrl}`);
  if (!s.canvasUrl) console.log(s.demo ? "  ⓘ No CANVAS_URL set: running with the demo school only" : "  ⚠  Set CANVAS_URL in .env (e.g. https://sfsu.instructure.com)");
  if (!s.anthropicKey) console.log("  ⚠  Set ANTHROPIC_API_KEY in .env");
  console.log(ssoEnabled() ? "  ✓ Canvas SSO login is on" : "  ⓘ Canvas SSO login is off until CANVAS_CLIENT_ID / CANVAS_CLIENT_SECRET are set");
  console.log("");
  startReminderLoop();
});

let shuttingDown = false;
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await Promise.race([closeDb(), timeout(8000)]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
