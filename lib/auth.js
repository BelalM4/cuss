// Sign-in: Canvas OAuth2 (the school's normal SSO login page) plus browser
// sessions. Canvas docs: https://canvas.instructure.com/doc/api/file.oauth.html
import crypto from "node:crypto";
import { serverConfig, saveConfig, getConfig, readAppJson, writeAppJson, runAsUser, demoCanvasUrl } from "./store.js";
import { DEMO_CLIENT } from "./demo-canvas.js";

// The real school, or the built-in demo school.
function provider(demo) {
  const s = serverConfig();
  return demo
    ? { canvasUrl: demoCanvasUrl(), ...DEMO_CLIENT, scopes: "", publicUrl: s.publicUrl }
    : { canvasUrl: s.canvasUrl, clientId: s.clientId, clientSecret: s.clientSecret, scopes: s.scopes, publicUrl: s.publicUrl };
}

// --- OAuth2 -------------------------------------------------------------------------

export function authorizeUrl(state, { demo = false, hint = "" } = {}) {
  const s = provider(demo);
  const url = new URL(s.canvasUrl + "/login/oauth2/auth");
  url.searchParams.set("client_id", s.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", s.publicUrl + "/auth/callback");
  url.searchParams.set("state", state);
  if (s.scopes) url.searchParams.set("scope", s.scopes);
  if (hint) url.searchParams.set("login_hint", hint);
  return url.href;
}

async function tokenRequest(params, demo = false) {
  const s = provider(demo);
  const res = await fetch(s.canvasUrl + "/login/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      redirect_uri: s.publicUrl + "/auth/callback",
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error_description || data.error || `Canvas login failed (${res.status}).`), {
      status: 401,
    });
  }
  return data;
}

function tokenFields(data) {
  return {
    accessToken: data.access_token,
    // Canvas only sends the refresh token the first time; keep the old one otherwise.
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    tokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : 0,
  };
}

// Exchange the code from the login redirect for tokens; returns the Canvas user id.
export async function finishLogin(code, { demo = false } = {}) {
  const data = await tokenRequest({ grant_type: "authorization_code", code }, demo);
  const userId = String(data.user?.id || "");
  if (!/^\d+$/.test(userId)) throw new Error("Canvas didn't say who logged in.");
  runAsUser(userId, () => saveConfig({ ...tokenFields(data), demo, studentName: data.user?.name || "" }));
  return userId;
}

// Called by the Canvas client before each request (runs as the current user).
let refreshing = new Map();
export async function accessToken({ forceRefresh = false } = {}) {
  const cfg = getConfig();
  const stale = cfg.tokenExpiresAt && Date.now() > cfg.tokenExpiresAt - 5 * 60e3;
  if (!cfg.refreshToken || (!stale && !forceRefresh)) return cfg.accessToken;
  // One refresh at a time per user.
  const key = cfg.refreshToken;
  if (!refreshing.has(key)) {
    refreshing.set(
      key,
      tokenRequest({ grant_type: "refresh_token", refresh_token: cfg.refreshToken }, cfg.demo)
        .then((data) => {
          saveConfig(tokenFields(data));
          return data.access_token;
        })
        .finally(() => refreshing.delete(key)),
    );
  }
  return refreshing.get(key);
}

export async function revokeToken() {
  const { canvasUrl, accessToken: token } = getConfig();
  if (!token) return;
  await fetch(canvasUrl + "/login/oauth2/token", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(
    () => {},
  );
}

// --- Sessions (an httpOnly cookie pointing at a server-side record) -------------------

const COOKIE = "cuss_sid";
const SESSION_DAYS = 30;

function sessions() {
  return readAppJson("sessions.json", {});
}

export function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k, decodeURIComponent(v)]),
  );
}

export function cookieOptions(maxAgeSeconds) {
  const secure = serverConfig().publicUrl.startsWith("https://") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function startSession(res, userId) {
  const sid = crypto.randomBytes(32).toString("base64url");
  const all = sessions();
  const now = Date.now();
  for (const [k, s] of Object.entries(all)) if (s.expiresAt < now) delete all[k];
  all[sid] = { userId: String(userId), expiresAt: now + SESSION_DAYS * 864e5 };
  writeAppJson("sessions.json", all);
  res.append("Set-Cookie", `${COOKIE}=${sid}; ${cookieOptions(SESSION_DAYS * 86400)}`);
}

export function sessionUserId(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return null;
  const s = sessions()[sid];
  return s && s.expiresAt > Date.now() ? s.userId : null;
}

export function endSession(req, res, { allForUser = false } = {}) {
  const sid = parseCookies(req)[COOKIE];
  const all = sessions();
  const userId = all[sid]?.userId;
  delete all[sid];
  if (allForUser && userId) for (const [k, s] of Object.entries(all)) if (s.userId === userId) delete all[k];
  writeAppJson("sessions.json", all);
  res.append("Set-Cookie", `${COOKIE}=; ${cookieOptions(0)}`);
}
