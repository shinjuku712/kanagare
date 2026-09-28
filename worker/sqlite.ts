import type Database from 'better-sqlite3';

/**
 * A Durable Object's SQLite storage behind the slice of the better-sqlite3 API
 * the server uses: prepare().get/all/run, exec, pragma and transaction.
 *
 * This works because DO SQLite is synchronous, like better-sqlite3, so the
 * route code runs unchanged. The storage handle is looked up on every call
 * instead of being captured: modules cache prepared statements (activity.ts),
 * and a cached statement must keep working after the object is evicted and
 * rebuilt in the same isolate with a fresh `ctx.storage`.
 */

let storage: DurableObjectStorage | null = null;

export function bindStorage(s: DurableObjectStorage): void {
  storage = s;
}

function sql(): SqlStorage {
  if (!storage) throw new Error('SQLite storage not bound');
  return storage.sql;
}

// DO SQLite binds only strings, numbers, null and ArrayBuffers. Anything else
// must fail here: it would otherwise be bound as garbage and quietly match
// nothing. undefined becomes NULL and booleans 0/1, as in better-sqlite3.
function bindable(v: unknown): SqlStorageValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return Number(v);
  if (typeof v === 'string' || typeof v === 'number' || v instanceof ArrayBuffer) return v;
  if (typeof v === 'bigint') return Number(v);
  throw new TypeError(`Cannot bind ${Object.prototype.toString.call(v)} to a SQL parameter`);
}

/**
 * better-sqlite3 also takes named parameters (`:id`, `@id`, `$id`) bound from
 * one object; DO SQLite only has `?`. Rewrite the query to positional form,
 * skipping string literals, quoted identifiers and comments.
 */
const namedCache = new Map<string, { sql: string; names: string[] }>();
function toPositional(query: string) {
  let hit = namedCache.get(query);
  if (hit) return hit;
  let out = '';
  const names: string[] = [];
  for (let i = 0; i < query.length; ) {
    const ch = query[i]!;
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = query.indexOf(ch, i + 1);
      const stop = end === -1 ? query.length : end + 1;
      out += query.slice(i, stop);
      i = stop;
    } else if (ch === '-' && query[i + 1] === '-') {
      const end = query.indexOf('\n', i);
      const stop = end === -1 ? query.length : end;
      out += query.slice(i, stop);
      i = stop;
    } else if (ch === '/' && query[i + 1] === '*') {
      const end = query.indexOf('*/', i + 2);
      const stop = end === -1 ? query.length : end + 2;
      out += query.slice(i, stop);
      i = stop;
    } else if ((ch === ':' || ch === '@' || ch === '$') && /[A-Za-z_]/.test(query[i + 1] ?? '')) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(query.slice(i + 1))!;
      names.push(m[0]);
      out += '?';
      i += 1 + m[0].length;
    } else {
      out += ch;
      i++;
    }
  }
  hit = { sql: out, names };
  namedCache.set(query, hit);
  return hit;
}

const isNamed = (params: unknown[]) =>
  params.length === 1 &&
  typeof params[0] === 'object' &&
  params[0] !== null &&
  !(params[0] instanceof ArrayBuffer) &&
  !ArrayBuffer.isView(params[0]);

function exec(query: string, params: unknown[]): Record<string, SqlStorageValue>[] {
  if (isNamed(params)) {
    const obj = params[0] as Record<string, unknown>;
    const { sql: positional, names } = toPositional(query);
    return sql()
      .exec(positional, ...names.map((n) => bindable(obj[n])))
      .toArray();
  }
  return sql()
    .exec(query, ...params.map(bindable))
    .toArray();
}

const statement = (query: string) => ({
  get: (...params: unknown[]) => exec(query, params)[0],
  all: (...params: unknown[]) => exec(query, params),
  run(...params: unknown[]) {
    exec(query, params);
    const r = sql().exec('SELECT changes() AS changes, last_insert_rowid() AS id').one();
    return { changes: Number(r.changes), lastInsertRowid: Number(r.id) };
  },
});

const handle = {
  prepare: statement,
  exec(query: string) {
    sql().exec(query);
    return handle;
  },
  pragma(p: string) {
    // WAL is managed by the platform and can't be set from inside.
    if (/^\s*journal_mode/i.test(p)) return [];
    return sql().exec(`PRAGMA ${p}`).toArray();
  },
  transaction<A extends unknown[], R>(fn: (...args: A) => R) {
    return (...args: A): R => storage!.transactionSync(() => fn(...args));
  },
};

export const doDatabase = handle as unknown as Database.Database;
