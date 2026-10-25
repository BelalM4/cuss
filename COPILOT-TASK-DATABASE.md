# Task: keep Cuss data across Render restarts (Postgres mirror)

## Why
Cuss runs on Render's free plan, which has no persistent disk. Everything in
`DATA_DIR` is wiped on every deploy or restart, including logins, chats,
memories, the class library, uploads, usage counts and `secret.key`.

## Approach (keep it small, don't rewrite storage)
Keep the current synchronous file storage exactly as it is, and **mirror** it
to Postgres:
- Every file write or delete under `DATA_DIR` is also queued to Postgres.
- On startup, before listening, the server restores `DATA_DIR` from Postgres.
- When `DATABASE_URL` is not set, all database code does nothing. Local dev and
  the existing tests must behave exactly as they do today.

Table:
```sql
create table if not exists cuss_files (
  path text primary key,              -- relative to DATA_DIR, forward slashes
  content bytea not null,
  updated_at timestamptz not null default now()
);
```

## Steps

1. **Dependency.** Run `npm install pg@8` and commit `package.json` and `package-lock.json`.

2. **New file `lib/db.js`** (ESM, same style as the other `lib/` files):
   - `export async function initDb(dataDir)`. If there is no `process.env.DATABASE_URL`,
     return `{ enabled: false }`. Otherwise:
     - Create a `pg.Pool`. Use `ssl: { rejectUnauthorized: false }` unless the
       host is `localhost` or `127.0.0.1`.
     - Create the table.
     - Write every row to `path.join(dataDir, row.path)`, creating directories.
       Reject any path that resolves outside `dataDir`.
     - Then walk `dataDir` and upload any local file that has no row yet, so
       existing data is migrated.
     - Return `{ enabled: true, restored, uploaded }`.
   - `export function persist(absPath)`. Queue an upsert of the file's current
     bytes (`insert ... on conflict (path) do update`). Read the file when the
     job runs, not when it's queued. If the file is gone by then, skip it.
   - `export function forget(absPath)`. Queue a delete of that path *and*
     everything under it (`path = $1 or path like $2`, with `%` `_` `\`
     escaped in the prefix). This is used for whole user folders.
   - Both of these:
     - Do nothing when the database is disabled.
     - Do nothing for paths outside `dataDir`.
     - Skip temp files (`*.tmp` and names containing `.tmp-`; check how
       `lib/store.js` names them).
   - All jobs run **one at a time, in order**, on a single promise chain, so a
     write followed by a delete can't land in the wrong order. Log errors with
     `console.error` and keep going. Never crash the request.
   - `export async function flush()`. Resolves when the queue is empty.
   - `export async function closeDb()`. Runs `flush()`, then `pool.end()`.

3. **Call `persist`/`forget` after every existing write/delete:**
   - `lib/store.js`:
     - `writeFile`, after the rename: `persist(file)`.
     - `deleteUserData`, after `rmSync`: `forget(dir)`.
   - `lib/chats.js`:
     - `saveChat`, after the rename: `persist`.
     - `deleteChat`, after `rmSync`: `forget`.
   - `lib/library.js`:
     - After writing an upload: `persist`.
     - After deleting an upload: `forget`.
   - `lib/secrets.js`: after creating `secret.key`, call `persist`.
   - Search for any other `writeFileSync`, `renameSync`, `rmSync` or
     `unlinkSync` under `lib/` and `server.js` that touches `DATA_DIR`, and
     hook those too.

4. **`server.js`:**
   - Before `app.listen(...)`, run `const db = await initDb(DATA_DIR)`, and log
     either `Database: restored N files` or `Database: off (no DATABASE_URL)`.
     Never log the URL.
   - Make sure `secret.key` is loaded *after* `initDb`, so a restored key is used
     instead of a new key being generated. Check the import order in
     `lib/secrets.js`; it may need lazy loading.
   - Add `SIGTERM` and `SIGINT` handlers. They should:
     - Stop accepting connections.
     - Run `await Promise.race([closeDb(), timeout(8000)])`.
     - Then call `process.exit(0)`.

5. **Config and docs:**
   - `render.yaml`: add `- key: DATABASE_URL` with `sync: false`.
   - `.env.example`: add `DATABASE_URL=` with a one-line comment.
   - `README.md`: add a short "Saving data on Render" section. It should say to
     create a free Neon Postgres database, paste its connection string into
     Render as `DATABASE_URL`, and redeploy.

6. **`test/helpers.js`:** change `stop()` to return a promise that resolves on the
   child's `exit` event (keep `child.kill()`). Existing tests that call
   `app?.stop()` without awaiting must still work.

7. **New test `test/database.test.js`.** Skip the whole file when
   `process.env.TEST_DATABASE_URL` is unset.
   - Start Cuss with `DATABASE_URL=TEST_DATABASE_URL` and a fresh `DATA_DIR`.
   - Demo login, then save a memory, upload a library file, and send one chat.
     Copy patterns from `test/library.test.js` and use `startFakeClaude`.
   - Run `await app.stop()`.
   - Start a **second** server with a **new, empty** `DATA_DIR` and the same
     database. Using the same cookie jar, check that:
     - The session still works.
     - The memory, the upload's bytes and the chat are all back.
   - Delete the account. Then check that
     `select count(*) from cuss_files where path like 'users/<id>/%'` is 0.
   - Drop or truncate the table in `before` so runs are independent.

8. **CI `.github/workflows/test.yml`:**
   - Add a `postgres:16` service with user, password and database `cuss`, port
     5432, and a health check.
   - Set `TEST_DATABASE_URL: postgres://cuss:cuss@localhost:5432/cuss` on the
     test step.

## Done when
- `npm test` passes locally *without* a database. The new test is skipped and
  all 45 existing tests still pass.
- `npm test` passes in CI *with* Postgres, including the new test.
- No secrets, `.env` or database URLs are committed or logged.

## Out of scope
- Don't change the JSON file formats.
- Don't move to an ORM, and don't change the frontend.
