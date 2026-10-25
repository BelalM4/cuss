import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TOKEN_ENCRYPTION_KEY = "unit-test-key";
const { encryptSecret, decryptSecret } = await import("../lib/secrets.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuss-secret-"));

test("tokens round-trip through AES-256-GCM", () => {
  const enc = encryptSecret("canvas-token-123", dir);
  assert.match(enc, /^enc:v1:/);
  assert.ok(!enc.includes("canvas-token-123"));
  assert.equal(decryptSecret(enc, dir), "canvas-token-123");
});

test("each encryption is different (random IV)", () => {
  assert.notEqual(encryptSecret("same", dir), encryptSecret("same", dir));
});

test("older plaintext values still read; tampered values do not", () => {
  assert.equal(decryptSecret("plain-old-token", dir), "plain-old-token");
  const enc = encryptSecret("secret", dir);
  assert.equal(decryptSecret(enc.slice(0, -2) + "AA", dir), "");
});
