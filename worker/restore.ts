import crypto from 'node:crypto';
import { db } from '../server/db.ts';
import { blobs } from '../server/blobs.ts';
import type { Env } from './index.ts';

/**
 * Restore a Node instance's backup (kanagare.db + uploads/) into the Durable
 * Object. Driven by scripts/cf-restore.mjs, which reads the .db locally and
 * sends it over in batches:
 *
 *   GET  /__restore/ping             200 once the token is live (a new secret takes a moment)
 *   POST /__restore/reset            wipe every table
 *   POST /__restore/rows             { table, rows: [{col: value}] }
 *   POST /__restore/sequence         { table: nextId } — keeps AUTOINCREMENT from reusing ids
 *   PUT  /__restore/blob/:key        raw attachment bytes
 *
 * Off unless the RESTORE_TOKEN secret is set (32+ characters), and then only
 * with that token as a bearer. Set it for the restore, delete it afterwards.
 */

/** Parents before children, so foreign keys hold as rows arrive. */
const RESTORE_ORDER = [
  'users',
  'projects',
  'columns',
  'cards',
  'labels',
  'card_labels',
  'attachments',
  'comments',
  'card_links',
  'templates',
  'activity',
  'sessions',
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function authorized(request: Request, env: Env): boolean {
  const token = env.RESTORE_TOKEN;
  // A short token could be guessed, and whoever gets in can wipe everything.
  if (!token || token.length < 32) return false;
  const given = Buffer.from(request.headers.get('Authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function columnsOf(table: string): Set<string> {
  return new Set((db.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name));
}

export async function restore(request: Request, env: Env): Promise<Response> {
  if (!authorized(request, env)) return new Response('Not found', { status: 404 });
  const path = new URL(request.url).pathname;

  if (request.method === 'GET' && path === '/__restore/ping') return json({ ok: true });

  if (request.method === 'POST' && path === '/__restore/reset') {
    db.transaction(() => {
      for (const t of [...RESTORE_ORDER].reverse()) db.prepare(`DELETE FROM ${t}`).run();
      db.prepare('DELETE FROM search_fts').run();
      db.prepare('DELETE FROM blob_chunks').run();
      db.prepare('DELETE FROM sqlite_sequence').run();
    })();
    return json({ ok: true });
  }

  if (request.method === 'POST' && path === '/__restore/rows') {
    const { table, rows } = (await request.json()) as { table: string; rows: Record<string, unknown>[] };
    if (!(RESTORE_ORDER as readonly string[]).includes(table)) return json({ error: `Unknown table ${table}` }, 400);
    const known = columnsOf(table);
    db.transaction(() => {
      for (const row of rows) {
        const cols = Object.keys(row);
        const unknown = cols.find((c) => !known.has(c));
        if (unknown) throw new Error(`Unknown column ${table}.${unknown}`);
        db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
          ...cols.map((c) => row[c]),
        );
      }
    })();
    return json({ ok: true, inserted: rows.length });
  }

  if (request.method === 'POST' && path === '/__restore/sequence') {
    const seq = (await request.json()) as Record<string, number>;
    db.transaction(() => {
      for (const [name, value] of Object.entries(seq)) {
        db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(name);
        db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(name, value);
      }
    })();
    return json({ ok: true });
  }

  const blob = path.match(/^\/__restore\/blob\/([0-9a-f]{64}\.[a-z0-9]+)$/);
  if (request.method === 'PUT' && blob) {
    blobs().put(blob[1]!, Buffer.from(await request.arrayBuffer()));
    return json({ ok: true });
  }

  return json({ error: 'Unknown restore step' }, 400);
}
