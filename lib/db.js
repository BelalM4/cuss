import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

let pool = null;
let dataRoot = null;
let enabled = false;
let queue = Promise.resolve();

function relativePath(absPath) {
  if (!dataRoot || typeof absPath !== "string") return null;
  const root = path.resolve(dataRoot);
  const resolved = path.resolve(absPath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function isTemporary(filePath) {
  const name = path.basename(filePath);
  return name.endsWith(".tmp") || name.includes(".tmp-");
}

function enqueue(job) {
  queue = queue.then(job).catch((err) => {
    console.error("Database persistence error:", err);
  });
}

async function walkFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(file)));
    else if (entry.isFile() && !isTemporary(file)) files.push(file);
  }
  return files;
}

function targetFor(relative) {
  if (!relative || relative.startsWith("/") || relative.includes("\\")) throw new Error(`Invalid database row path: ${relative}`);
  const root = path.resolve(dataRoot);
  const target = path.resolve(root, ...relative.split("/"));
  if (!target.startsWith(root + path.sep)) throw new Error(`Database row path escapes DATA_DIR: ${relative}`);
  return target;
}

export async function initDb(dataDir) {
  if (!process.env.DATABASE_URL) return { enabled: false };

  dataRoot = path.resolve(dataDir);
  fs.mkdirSync(dataRoot, { recursive: true });
  const url = new URL(process.env.DATABASE_URL);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  await pool.query(`
    create table if not exists cuss_files (
      path text primary key,
      content bytea not null,
      updated_at timestamptz not null default now()
    )
  `);

  const rows = await pool.query("select path, content from cuss_files");
  const known = new Set();
  let restored = 0;
  for (const row of rows.rows) {
    const target = targetFor(row.path);
    known.add(row.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, row.content, { mode: 0o600 });
    restored++;
  }

  let uploaded = 0;
  for (const file of await walkFiles(dataRoot)) {
    const relative = relativePath(file);
    if (!relative || known.has(relative)) continue;
    await pool.query(
      "insert into cuss_files (path, content) values ($1, $2) on conflict (path) do update set content = excluded.content, updated_at = now()",
      [relative, await fs.promises.readFile(file)],
    );
    uploaded++;
  }

  enabled = true;
  return { enabled: true, restored, uploaded };
}

export function persist(absPath) {
  if (!enabled || !pool || isTemporary(absPath)) return;
  const relative = relativePath(absPath);
  if (!relative) return;
  enqueue(async () => {
    let content;
    try {
      content = await fs.promises.readFile(absPath);
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
    await pool.query(
      "insert into cuss_files (path, content) values ($1, $2) on conflict (path) do update set content = excluded.content, updated_at = now()",
      [relative, content],
    );
  });
}

export function forget(absPath) {
  if (!enabled || !pool || isTemporary(absPath)) return;
  const relative = relativePath(absPath);
  if (!relative) return;
  const escaped = relative.replace(/[\\%_]/g, (char) => `\\${char}`);
  enqueue(() => pool.query("delete from cuss_files where path = $1 or path like $2 escape '\\'", [relative, `${escaped}/%`]));
}

export async function flush() {
  await queue;
}

export async function closeDb() {
  await flush();
  if (pool) await pool.end();
  pool = null;
  dataRoot = null;
  enabled = false;
  queue = Promise.resolve();
}
