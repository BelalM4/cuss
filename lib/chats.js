// Saved conversations and long-term memory, stored per student as JSON files
// in data/users/<id>/.
// Each chat keeps the raw Claude message history (so it can continue later)
// plus a "display" list the UI uses to redraw it.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { userDir, readJson, writeJson } from "./store.js";

function chatDir() {
  const dir = path.join(userDir(), "chats");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(id);
const chatFile = (id) => path.join(chatDir(), `${id}.json`);

export function newChatId() {
  return crypto.randomUUID();
}

export function loadChat(id) {
  if (!validId(id)) throw Object.assign(new Error("Bad chat id."), { status: 400 });
  try {
    return JSON.parse(fs.readFileSync(chatFile(id), "utf8"));
  } catch {
    const now = new Date().toISOString();
    return { id, title: "New chat", kind: "chat", createdAt: now, updatedAt: now, messages: [], display: [] };
  }
}

export function saveChat(chat) {
  chat.updatedAt = new Date().toISOString();
  const tmp = chatFile(chat.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(chat), { mode: 0o600 });
  fs.renameSync(tmp, chatFile(chat.id));
}

export function deleteChat(id) {
  if (!validId(id)) return;
  fs.rmSync(chatFile(id), { force: true });
}

export function listChats() {
  const dir = chatDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (!c.display?.length) return null;
        return { id: c.id, title: c.title, kind: c.kind, updatedAt: c.updatedAt };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// Update a card (e.g. mark an email draft as sent) wherever it was shown.
export function updateCardEverywhere(cardId, patch) {
  for (const { id } of listChats()) {
    const chat = loadChat(id);
    let changed = false;
    for (const item of chat.display) {
      if (item.card?.id === cardId) {
        Object.assign(item.card, patch);
        changed = true;
      }
    }
    if (changed) saveChat(chat);
  }
}

// --- Email drafts -----------------------------------------------------------------

export function getDraft(id) {
  return readJson("drafts.json", {})[id] || null;
}

export function saveDraft(draft) {
  const all = readJson("drafts.json", {});
  all[draft.id] = draft;
  // Forget drafts older than 30 days.
  for (const [k, d] of Object.entries(all)) if (Date.now() - new Date(d.createdAt) > 30 * 864e5) delete all[k];
  writeJson("drafts.json", all);
}

// --- Long-term memory ------------------------------------------------------------

export function getMemories() {
  return readJson("memory.json", []);
}

export function addMemory(text) {
  const all = getMemories();
  const item = { id: crypto.randomUUID().slice(0, 8), text: String(text).trim(), createdAt: new Date().toISOString() };
  all.push(item);
  writeJson("memory.json", all.slice(-200));
  return item;
}

export function removeMemory(id) {
  const all = getMemories();
  const next = all.filter((m) => m.id !== id);
  writeJson("memory.json", next);
  return next.length !== all.length;
}
