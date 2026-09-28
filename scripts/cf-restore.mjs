#!/usr/bin/env node
/**
 * Restore a Node instance's backup into a Cloudflare deployment.
 *
 *   RESTORE_TOKEN=… node scripts/cf-restore.mjs <https://board.example.com> <kanagare.db> [uploads-dir]
 *
 * The deployment must have the same RESTORE_TOKEN set as a secret
 * (`wrangler secret put RESTORE_TOKEN`). This REPLACES everything the
 * deployment holds. Delete the secret once it's done.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Mirrors RESTORE_ORDER in worker/restore.ts: parents before children.
const ORDER = [
  'users', 'projects', 'columns', 'cards', 'labels', 'card_labels', 'attachments',
  'comments', 'card_links', 'templates', 'activity', 'sessions',
];
const BATCH = 100;

const [base, dbPath, uploadsDir] = process.argv.slice(2);
const token = process.env.RESTORE_TOKEN;
if (!base || !dbPath || !token) {
  console.error('usage: RESTORE_TOKEN=… node scripts/cf-restore.mjs <url> <db> [uploads-dir]');
  process.exit(1);
}

async function call(method, step, body, contentType = 'application/json') {
  const res = await fetch(new URL(`/__restore/${step}`, base), {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: contentType === 'application/json' ? (body === undefined ? undefined : JSON.stringify(body)) : body,
  });
  if (!res.ok) throw new Error(`${method} ${step}: ${res.status} ${await res.text()}`);
  return res.json();
}

const src = new Database(dbPath, { readonly: true, fileMustExist: true });
const tables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());

// A freshly set secret takes a little while to reach the running object;
// until then every step 404s. Wait for it rather than failing halfway.
for (let i = 0; ; i++) {
  try {
    await call('GET', 'ping');
    break;
  } catch (e) {
    if (i === 24) throw e;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

await call('POST', 'reset');

for (const table of ORDER) {
  if (!tables.has(table)) continue;
  const rows = src.prepare(`SELECT * FROM ${table}`).all();
  for (let i = 0; i < rows.length; i += BATCH) {
    await call('POST', 'rows', { table, rows: rows.slice(i, i + BATCH) });
  }
  console.log(`${table}: ${rows.length}`);
}

const seq = Object.fromEntries(src.prepare('SELECT name, seq FROM sqlite_sequence').raw().all());
await call('POST', 'sequence', seq);

const keys = src.prepare('SELECT DISTINCT storage_key FROM attachments WHERE storage_key IS NOT NULL').pluck().all();
let missing = 0;
for (const key of keys) {
  const file = uploadsDir && path.join(uploadsDir, key.slice(0, 2), key.slice(2, 4), key);
  if (!file || !fs.existsSync(file)) {
    missing++;
    console.warn(`missing upload: ${key}`);
    continue;
  }
  await call('PUT', `blob/${key}`, fs.readFileSync(file), 'application/octet-stream');
}
console.log(`files: ${keys.length - missing} of ${keys.length}`);
