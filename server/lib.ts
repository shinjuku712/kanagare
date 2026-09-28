import { db } from './db.ts';

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  );
}

export function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function reindexColumn(colId: number): void {
  const cards = db.prepare('SELECT id FROM cards WHERE column_id = ? ORDER BY position').all(colId) as {
    id: number;
  }[];
  const stmt = db.prepare('UPDATE cards SET position = ? WHERE id = ?');
  cards.forEach((c, i) => stmt.run(i, c.id));
}

/**
 * Put a card at `position` in a column (0 = top), shifting the others down.
 * The target column is renumbered first, so gaps left by deletes can't make
 * the card land a slot off. Returns the column it came from.
 */
export function placeCard(cardId: number, columnId: number, position: number): number {
  let from = 0;
  db.transaction(() => {
    from = (db.prepare('SELECT column_id FROM cards WHERE id = ?').get(cardId) as { column_id: number }).column_id;
    reindexColumn(columnId);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM cards WHERE column_id = ? AND id <> ?').get(columnId, cardId) as { n: number }).n;
    const pos = Math.max(0, Math.min(Math.trunc(position) || 0, count));
    db.prepare('UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ? AND id <> ?').run(columnId, pos, cardId);
    db.prepare('UPDATE cards SET column_id = ?, position = ? WHERE id = ?').run(columnId, pos, cardId);
    reindexColumn(columnId);
    if (from !== columnId) reindexColumn(from);
  })();
  return from;
}

/** Resolve a column by numeric id or case-insensitive title within a project. */
export function resolveColumn(nameOrId: unknown, projectId: number) {
  if (typeof nameOrId === 'number' || /^\d+$/.test(String(nameOrId))) {
    return db
      .prepare('SELECT * FROM columns WHERE id = ? AND project_id = ?')
      .get(Number(nameOrId), projectId) as { id: number; title: string } | undefined;
  }
  return db
    .prepare('SELECT * FROM columns WHERE LOWER(title) = LOWER(?) AND project_id = ?')
    .get(String(nameOrId), projectId) as { id: number; title: string } | undefined;
}

/** Resolve a project by numeric id, slug, or name (case-insensitive). */
export function resolveProject(nameOrSlugOrId: unknown) {
  if (nameOrSlugOrId === undefined || nameOrSlugOrId === null || nameOrSlugOrId === '') return undefined;
  if (typeof nameOrSlugOrId === 'number' || /^\d+$/.test(String(nameOrSlugOrId))) {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(nameOrSlugOrId)) as
      | { id: number; name: string }
      | undefined;
  }
  const s = String(nameOrSlugOrId);
  return db
    .prepare('SELECT * FROM projects WHERE LOWER(slug) = LOWER(?) OR LOWER(name) = LOWER(?)')
    .get(s, s) as { id: number; name: string } | undefined;
}

export function firstProject() {
  return db.prepare('SELECT * FROM projects ORDER BY position LIMIT 1').get() as
    | { id: number; name: string }
    | undefined;
}

export function maxPosition(table: 'projects' | 'columns' | 'cards', where?: { col: string; val: number }): number {
  const sql = where
    ? `SELECT COALESCE(MAX(position), -1) AS m FROM ${table} WHERE ${where.col} = ?`
    : `SELECT COALESCE(MAX(position), -1) AS m FROM ${table}`;
  const row = (where ? db.prepare(sql).get(where.val) : db.prepare(sql).get()) as { m: number };
  return row.m;
}

export function guessLanguage(filename: string): string {
  const ext = filename.split('.').pop()!.toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    py: 'python', rb: 'ruby', sh: 'bash', json: 'json', yml: 'yaml', yaml: 'yaml',
    md: 'markdown', html: 'html', css: 'css', php: 'php', rs: 'rust', go: 'go',
    dart: 'dart', sql: 'sql', xml: 'xml', toml: 'toml', swift: 'swift',
  };
  return map[ext] || ext;
}
