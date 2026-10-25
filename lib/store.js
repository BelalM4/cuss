// JSON-file storage. Server-wide settings come from environment variables
// (.env); everything about a student lives in data/users/<canvas user id>/.
// The "current user" for a request or background job is tracked with
// AsyncLocalStorage, so the rest of the code just calls getConfig().
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import { encryptSecret, decryptSecret } from "./secrets.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, "..", "data");
const USERS_DIR = path.join(DATA_DIR, "users");
fs.mkdirSync(USERS_DIR, { recursive: true });

// --- Server settings (set once by whoever runs the app) ----------------------

export function serverConfig() {
  let canvasUrl = (process.env.CANVAS_URL || "").trim();
  if (canvasUrl && !/^https?:\/\//.test(canvasUrl)) canvasUrl = "https://" + canvasUrl;
  const port = Number(process.env.PORT) || 3000;
  return {
    canvasUrl: canvasUrl.replace(/\/+$/, ""),
    schoolName: process.env.SCHOOL_NAME || "Canvas",
    clientId: process.env.CANVAS_CLIENT_ID || "",
    clientSecret: process.env.CANVAS_CLIENT_SECRET || "",
    scopes: process.env.CANVAS_SCOPES || "",
    // Render (and similar hosts) tell the app its public address automatically.
    publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    // Personal-access-token login, for schools that allow tokens and for testing.
    allowTokenLogin: process.env.ALLOW_TOKEN_LOGIN !== "false",
    // "Try the demo" with the built-in pretend school.
    demo: process.env.DEMO_MODE !== "false",
  };
}

// The built-in demo school (lib/demo-canvas.js) is served by this same app.
export function demoCanvasUrl() {
  return serverConfig().publicUrl + "/demo-canvas";
}

export function ssoEnabled() {
  const s = serverConfig();
  return Boolean(s.canvasUrl && s.clientId && s.clientSecret);
}

// --- Current user ----------------------------------------------------------------

const userContext = new AsyncLocalStorage();

export function runAsUser(userId, fn) {
  return userContext.run(String(userId), fn);
}

export function currentUserId() {
  const id = userContext.getStore();
  if (!id) throw Object.assign(new Error("Please log in."), { status: 401 });
  return id;
}

export function userDir(userId = currentUserId()) {
  if (!/^\d+$/.test(String(userId))) throw new Error("Bad user id.");
  const dir = path.join(USERS_DIR, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listUserIds() {
  return fs.readdirSync(USERS_DIR).filter((d) => /^\d+$/.test(d));
}

export function deleteUserData(userId = currentUserId()) {
  fs.rmSync(userDir(userId), { recursive: true, force: true });
}

// --- JSON helpers ----------------------------------------------------------------

function readFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function writeFile(file, value) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Per-user JSON files.
export function readJson(name, fallback) {
  return readFile(path.join(userDir(), name), fallback);
}

export function writeJson(name, value) {
  writeFile(path.join(userDir(), name), value);
}

// App-wide JSON files (sessions).
export function readAppJson(name, fallback) {
  return readFile(path.join(DATA_DIR, name), fallback);
}

export function writeAppJson(name, value) {
  writeFile(path.join(DATA_DIR, name), value);
}

// --- Per-user settings -------------------------------------------------------------

const DEFAULT_USER = {
  // Canvas credentials (from SSO login, or a pasted token).
  accessToken: "",
  demo: false, // signed in to the demo school instead of the real one
  refreshToken: "",
  tokenExpiresAt: 0,
  studentName: "",
  // Hours before a due date to send a reminder.
  reminderHours: [72, 24, 3],
  // Independent mode: Cuss checks Canvas on its own and writes a daily briefing.
  independent: false,
  briefingTime: "07:30",
  timeZone: "",
  // Let Cuss send emails to instructors without asking first (off by default).
  autoSendEmails: false,
};

function validTimeZone(value) {
  if (!value) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) }).format();
    return String(value);
  } catch {
    return "";
  }
}

// Server settings + the current student's settings in one object.
export function getConfig() {
  const s = serverConfig();
  const user = { ...DEFAULT_USER, ...readJson("config.json", {}) };
  user.accessToken = decryptSecret(user.accessToken, DATA_DIR);
  user.refreshToken = decryptSecret(user.refreshToken, DATA_DIR);
  const reminderHours = Array.isArray(user.reminderHours)
    ? user.reminderHours.map(Number).filter((hours) => Number.isFinite(hours) && hours > 0)
    : [];
  return {
    ...user,
    reminderHours: reminderHours.length ? reminderHours : DEFAULT_USER.reminderHours,
    briefingTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(user.briefingTime || "") ? user.briefingTime : DEFAULT_USER.briefingTime,
    timeZone: validTimeZone(user.timeZone),
    canvasUrl: user.demo ? demoCanvasUrl() : s.canvasUrl,
    anthropicKey: s.anthropicKey,
    canvasToken: user.accessToken,
  };
}

// Canvas tokens are always written encrypted.
export function saveConfig(patch) {
  const next = { ...readJson("config.json", {}), ...patch };
  for (const k of ["accessToken", "refreshToken"]) next[k] = encryptSecret(next[k], DATA_DIR);
  writeJson("config.json", next);
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.canvasUrl && c.canvasToken && c.anthropicKey);
}

// --- Reminders state ------------------------------------------------------------------

export function getState() {
  const defaults = { sentReminderKeys: [], customReminders: [], notifications: [], seenAnnouncementIds: [], lastBriefingDate: "" };
  return { ...defaults, ...readJson("state.json", {}) };
}

export function saveState(state) {
  // Keep the files from growing forever.
  state.sentReminderKeys = state.sentReminderKeys.slice(-2000);
  state.notifications = state.notifications.slice(-200);
  state.seenAnnouncementIds = (state.seenAnnouncementIds || []).slice(-1000);
  writeJson("state.json", state);
}
