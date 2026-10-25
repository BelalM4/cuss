// Encrypts Canvas tokens at rest with AES-256-GCM.
// The key comes from TOKEN_ENCRYPTION_KEY (any long random string; Render
// generates one). Without it, a random key is created once in data/secret.key.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { persist } from "./db.js";

const PREFIX = "enc:v1:";
let cachedKey = null;

function key(dataDir) {
  if (cachedKey) return cachedKey;
  let material = process.env.TOKEN_ENCRYPTION_KEY;
  if (!material) {
    const file = path.join(dataDir, "secret.key");
    try {
      material = fs.readFileSync(file, "utf8").trim();
    } catch {
      material = crypto.randomBytes(32).toString("base64");
      fs.writeFileSync(file, material, { mode: 0o600, flag: "wx" });
      persist(file);
    }
  }
  cachedKey = crypto.createHash("sha256").update(material).digest();
  return cachedKey;
}

export function encryptSecret(plain, dataDir) {
  if (!plain || String(plain).startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(dataDir), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(":");
}

// Values saved before encryption existed are returned as-is (and re-saved encrypted later).
export function decryptSecret(value, dataDir) {
  if (!value || !String(value).startsWith(PREFIX)) return value;
  try {
    const [iv, tag, data] = String(value).slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(dataDir), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return ""; // wrong key or tampered: the student just logs in again
  }
}
