// Test helpers: start Cuss against a fake Claude API, and log in to the
// built-in demo school like a real student would (OAuth redirects and all).
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// A tiny stand-in for the Claude Messages API (streaming). `script(text, step)`
// returns the content blocks for the next assistant turn.
export async function startFakeClaude(script) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = JSON.parse(body);
      requests.push(json);
      const msgs = json.messages;
      const firstUser = [...msgs].reverse().find((m) => m.role === "user" && typeof m.content === "string").content;
      let step = 0;
      for (let i = msgs.length - 1; i >= 0 && !(msgs[i].role === "user" && typeof msgs[i].content === "string"); i--) if (msgs[i].role === "assistant") step++;
      const blocks = script(firstUser, step);
      const events = [{ type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }];
      blocks.forEach((b, i) => {
        if (b.type === "text") {
          events.push({ type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
          events.push({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: b.text } });
        } else {
          events.push({ type: "content_block_start", index: i, content_block: { type: "tool_use", id: `toolu_${i}_${step}`, name: b.name, input: {} } });
          events.push({ type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
        }
        events.push({ type: "content_block_stop", index: i });
      });
      events.push({ type: "message_delta", delta: { stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn" }, usage: { output_tokens: 1 } });
      events.push({ type: "message_stop" });
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() };
}

export async function startCuss(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuss-test-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ANTHROPIC_API_KEY: "sk-test", TOKEN_ENCRYPTION_KEY: "test-key", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start:\n" + log)), 10000);
    const on = (d) => {
      log += d;
      if (log.includes("is running")) clearTimeout(t), resolve();
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
  });
  return { url: `http://localhost:${port}`, dataDir, stop: () => child.kill() };
}

// A browser-like client with its own cookie jar.
export function client(base) {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  async function request(pathOrUrl, opts = {}) {
    const res = await fetch(pathOrUrl.startsWith("http") ? pathOrUrl : base + pathOrUrl, {
      redirect: "manual",
      ...opts,
      headers: { cookie: cookieHeader(), ...(opts.json ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) },
      body: opts.json ? JSON.stringify(opts.json) : opts.body,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    return res;
  }
  return {
    request,
    jar,
    json: async (p, opts) => (await request(p, opts)).json(),
    // Full demo sign-in: app → demo school login page → approve → callback.
    async loginDemo(name, role = "student") {
      const start = await request(role === "professor" ? "/auth/demo?role=professor" : "/auth/demo");
      const authorize = new URL(start.headers.get("location"));
      const approve = await request(new URL("approve", authorize).href, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ redirect_uri: authorize.searchParams.get("redirect_uri"), state: authorize.searchParams.get("state"), name, role }),
      });
      const callback = await request(approve.headers.get("location"));
      if (callback.status !== 302 || callback.headers.get("location") !== "/") throw new Error("login failed: " + callback.headers.get("location"));
    },
    // Sends a chat message and returns the streamed events.
    async chat(conversationId, text) {
      const res = await request("/api/chat", { method: "POST", json: { conversationId, text } });
      const body = await res.text();
      if (!res.ok) return { status: res.status, events: [], error: JSON.parse(body).error };
      return { status: res.status, events: body.trim().split("\n").map((l) => JSON.parse(l)) };
    },
  };
}
