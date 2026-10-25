import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { startFakeClaude, startCuss, client } from "./helpers.js";

if (!process.env.TEST_DATABASE_URL) {
  test("database mirror (requires TEST_DATABASE_URL)", { skip: "TEST_DATABASE_URL is not set" }, () => {});
} else {
  const { Pool } = pg;
  const dbUrl = process.env.TEST_DATABASE_URL;
  let pool;
  let claude;
  let first;
  let second;
  let firstClient;
  let userId;

  before(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await pool.query(`
      create table if not exists cuss_files (
        path text primary key,
        content bytea not null,
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query("truncate cuss_files");
    claude = await startFakeClaude(() => [{ type: "text", text: "Here is your week." }]);
    first = await startCuss({ DATABASE_URL: dbUrl, ANTHROPIC_BASE_URL: claude.url });
    firstClient = client(first.url);
    await firstClient.loginDemo("Database Student");
    await firstClient.json("/api/memory", { method: "POST", json: { text: "I prefer short study sessions." } });
    const upload = await firstClient.json("/api/library/101/upload", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-file-name": "database-notes.txt" },
      body: "Persist this upload.",
    });
    assert.equal(upload.kind, "upload");
    const chat = await firstClient.chat("database-chat-0001", "What's due this week?");
    assert.equal(chat.status, 200);
    const sessions = JSON.parse(fs.readFileSync(path.join(first.dataDir, "sessions.json"), "utf8"));
    userId = sessions[firstClient.jar.get("cuss_sid")].userId;
    await first.stop();
  });

  after(async () => {
    await second?.stop();
    await claude?.close();
    await pool?.end();
  });

  test("restores sessions, memories, uploads and chats into a new data directory", async () => {
    second = await startCuss({ DATABASE_URL: dbUrl, ANTHROPIC_BASE_URL: claude.url });
    const restored = client(second.url);
    for (const [key, value] of firstClient.jar) restored.jar.set(key, value);

    assert.equal((await restored.request("/api/status")).status, 200);
    const memories = await restored.json("/api/memory");
    assert.equal(memories[0].text, "I prefer short study sessions.");
    const library = await restored.json("/api/library/101");
    const upload = library.items.find((item) => item.kind === "upload");
    assert.ok(upload);
    assert.equal(await (await restored.request(`/api/library/item/${upload.id}/file`)).text(), "Persist this upload.");
    const chat = await restored.json("/api/chats/database-chat-0001");
    assert.ok(chat.display.some((item) => JSON.stringify(item).includes("Here is your week.")));

    const deleted = await restored.json("/api/account/delete", { method: "POST", json: {} });
    assert.equal(deleted.ok, true);
    await second.stop();
    second = null;

    const result = await pool.query("select count(*)::int as count from cuss_files where path like $1", [`users/${userId}/%`]);
    assert.equal(result.rows[0].count, 0);
  });
}
