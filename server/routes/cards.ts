import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, idParam, notFound, optionalColor, optionalString, requiredTrimmed } from '../http.ts';
import { firstProject, guessLanguage, maxPosition, nowStamp, placeCard, reindexColumn, resolveColumn, resolveProject } from '../lib.ts';
import { getCard, getColumn, mustEdit } from '../permissions.ts';
import { requireAuth } from '../auth/session.ts';
import { dropUnusedBlobs, fileKeysForCards } from '../blobs.ts';
import { logActivity, projectIdForCard } from '../activity.ts';
import type { User } from '../../shared/types.ts';

export const cardsRouter = Router();
cardsRouter.use(requireAuth);

const MAX_BULK = 200;

/** Optional due date: "YYYY-MM-DD", or null/'' for none. */
function dueDate(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest('due_date must be YYYY-MM-DD, or null to clear');
  return v;
}

/** Optional text field, as a string. */
const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** Log a move between columns. Reordering within a column isn't logged. */
function logMove(user: User, cardId: number, from: number, to: number): void {
  if (from === to) return;
  const names = db
    .prepare('SELECT (SELECT title FROM columns WHERE id = ?) AS src, (SELECT title FROM columns WHERE id = ?) AS dst')
    .get(from, to) as { src: string | null; dst: string | null };
  const card = getCard(cardId);
  logActivity({
    user,
    verb: 'card.moved',
    cardId,
    projectId: projectIdForCard(cardId),
    subject: (card?.title as string) ?? null,
    detail: `${names.src ?? '?'} → ${names.dst ?? '?'}`,
  });
}

cardsRouter.post('/', (req, res) => {
  const title = requiredTrimmed(req.body, 'title', 'Title required');
  const description = text(req.body?.description);
  const due_date = dueDate(req.body?.due_date);
  const column_id = Number(req.body?.column_id);
  const color = optionalColor(req.body, 'color');
  if (!getColumn(column_id)) throw badRequest('column_id must be an existing column');
  const result = db
    .prepare(
      `INSERT INTO cards (column_id, title, description, color, position, due_date, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      column_id,
      title,
      description,
      color || '',
      maxPosition('cards', { col: 'column_id', val: column_id }) + 1,
      due_date,
      nowStamp(),
      req.user.id,
    );
  const created = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid) as { id: number };
  logActivity({ user: req.user, verb: 'card.created', cardId: created.id, projectId: projectIdForCard(created.id), subject: title });
  res.json(created);
});

// Anyone signed in can move cards; it's a shared board. Registered before '/:id'.
cardsRouter.put('/move', (req, res) => {
  const cardId = Number(req.body?.cardId);
  const targetColumnId = Number(req.body?.targetColumnId);
  if (!getCard(cardId)) throw notFound('Card not found');
  if (!getColumn(targetColumnId)) throw badRequest('targetColumnId must be an existing column');
  const from = placeCard(cardId, targetColumnId, Number(req.body?.newPosition));
  logMove(req.user, cardId, from, targetColumnId);
  res.json({ ok: true });
});

/** Convenience creation by column/project name — for scripts, CLI, hooks. */
cardsRouter.post('/quick', (req, res) => {
  const title = requiredTrimmed(req.body, 'title', 'Title required');
  const { column, project } = req.body ?? {};
  const description = text(req.body?.description);
  const color = optionalColor(req.body, 'color');
  const proj = (project !== undefined ? resolveProject(project) : undefined) || firstProject();
  if (!proj) throw badRequest('No projects found');
  const col = resolveColumn(column ?? 'To Do', proj.id);
  if (!col) throw badRequest(`Column "${column}" not found in project "${proj.name}"`);
  const result = db
    .prepare('INSERT INTO cards (column_id, title, description, color, position, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(col.id, title, description, color || '', maxPosition('cards', { col: 'column_id', val: col.id }) + 1, req.user.id);
  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid));
});

cardsRouter.post('/bulk', (req, res) => {
  const { cards, project } = req.body ?? {};
  if (!Array.isArray(cards) || !cards.length) throw badRequest('cards array required');
  if (cards.length > MAX_BULK) throw badRequest(`At most ${MAX_BULK} cards at a time`);
  const defaultProj = (project !== undefined ? resolveProject(project) : undefined) || firstProject();
  const results: unknown[] = [];
  let created = 0;
  db.transaction(() => {
    for (const c of cards as Record<string, unknown>[]) {
      const title = typeof c.title === 'string' ? c.title.trim() : '';
      if (!title) continue;
      const proj = (c.project ? resolveProject(c.project) : undefined) || defaultProj;
      if (!proj) continue;
      const col = resolveColumn(c.column ?? 'To Do', proj.id);
      if (!col) {
        results.push({ error: `Column "${c.column}" not found in "${proj.name}"`, title });
        continue;
      }
      const r = db
        .prepare('INSERT INTO cards (column_id, title, description, color, position, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(col.id, title, text(c.description), optionalColor(c, 'color') || '', maxPosition('cards', { col: 'column_id', val: col.id }) + 1, req.user.id);
      results.push(db.prepare('SELECT * FROM cards WHERE id = ?').get(r.lastInsertRowid));
      created++;
    }
  })();
  res.json({ created, cards: results });
});

cardsRouter.put('/:id', (req, res) => {
  const id = idParam(req);
  const before = getCard(id);
  mustEdit(before, req.user, 'Card');
  const title = optionalString(req.body, 'title');
  const description = optionalString(req.body, 'description');
  const color = optionalColor(req.body, 'color');
  const dueRaw = req.body?.due_date;
  const assigneeRaw = req.body?.assignee_id;
  if (title !== undefined && !title.trim()) throw badRequest('Title required');
  if (dueRaw !== undefined) dueDate(dueRaw);
  // null/'' clears the assignee; anything else must be a real user.
  let assignee: number | null = null;
  if (assigneeRaw !== undefined && assigneeRaw !== null && assigneeRaw !== '') {
    assignee = Number(assigneeRaw);
    if (!Number.isInteger(assignee) || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(assignee)) {
      throw badRequest('assignee_id must be a valid user id, or null to clear');
    }
  }
  db.transaction(() => {
    if (title !== undefined) db.prepare('UPDATE cards SET title = ? WHERE id = ?').run(title.trim(), id);
    if (description !== undefined) db.prepare('UPDATE cards SET description = ? WHERE id = ?').run(description, id);
    if (color !== undefined) db.prepare('UPDATE cards SET color = ? WHERE id = ?').run(color, id);
    if (dueRaw !== undefined) db.prepare('UPDATE cards SET due_date = ? WHERE id = ?').run(dueRaw || null, id);
    if (assigneeRaw !== undefined) db.prepare('UPDATE cards SET assignee_id = ? WHERE id = ?').run(assignee, id);
    db.prepare('UPDATE cards SET updated_at = ? WHERE id = ?').run(nowStamp(), id);
  })();

  // Log per changed field, and only when the value actually differs — an
  // autosaving editor re-sends unchanged values constantly.
  const pid = projectIdForCard(id);
  const label = (title ?? (before?.title as string) ?? '').trim();
  if (title !== undefined && title.trim() !== before?.title) {
    logActivity({ user: req.user, verb: 'card.renamed', cardId: id, projectId: pid, subject: label, detail: before?.title as string });
  }
  if (description !== undefined && description !== before?.description) {
    logActivity({ user: req.user, verb: 'card.described', cardId: id, projectId: pid, subject: label });
  }
  if (dueRaw !== undefined && (dueRaw || null) !== (before?.due_date ?? null)) {
    logActivity({ user: req.user, verb: 'card.due', cardId: id, projectId: pid, subject: label, detail: dueRaw || null });
  }
  if (assigneeRaw !== undefined) {
    const now = db.prepare('SELECT assignee_id FROM cards WHERE id = ?').get(id) as { assignee_id: number | null };
    if ((now?.assignee_id ?? null) !== (before?.assignee_id ?? null)) {
      const who = now?.assignee_id
        ? (db.prepare('SELECT email FROM users WHERE id = ?').get(now.assignee_id) as { email: string } | undefined)?.email
        : null;
      logActivity({
        user: req.user,
        verb: who ? 'card.assigned' : 'card.unassigned',
        cardId: id,
        projectId: pid,
        subject: label,
        detail: who ?? null,
      });
    }
  }
  res.json({ ok: true });
});

cardsRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  const card = getCard(id);
  mustEdit(card, req.user, 'Card');
  // Read the project and files before the row disappears.
  const pid = projectIdForCard(id);
  const files = fileKeysForCards('id = ?', id);
  db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE id = ?').run(id);
    reindexColumn(card!.column_id);
  })();
  dropUnusedBlobs(files);
  logActivity({ user: req.user, verb: 'card.deleted', cardId: id, projectId: pid, subject: (card?.title as string) ?? null });
  res.json({ ok: true });
});

/** Move by column name, for scripts. Anyone can move cards, as with /move. */
cardsRouter.put('/:id/move-to', (req, res) => {
  const id = idParam(req);
  const { column, position, project } = req.body ?? {};
  if (!column) throw badRequest('column name or id required');
  const card = db
    .prepare('SELECT c.*, col.project_id FROM cards c JOIN columns col ON c.column_id = col.id WHERE c.id = ?')
    .get(id) as { project_id: number } | undefined;
  if (!card) throw notFound('Card not found');
  const proj = project ? resolveProject(project) : { id: card.project_id };
  if (!proj) throw badRequest(`Project "${project}" not found`);
  const col = resolveColumn(column, proj.id);
  if (!col) throw badRequest(`Column "${column}" not found`);
  const from = placeCard(id, col.id, Number(position ?? 0));
  logMove(req.user, id, from, col.id);
  res.json({ ok: true });
});

// --- Card labels ---
const labelName = (id: number) =>
  (db.prepare('SELECT name FROM labels WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? null;

cardsRouter.post('/:id/labels', (req, res) => {
  const id = idParam(req);
  const card = mustEdit(getCard(id), req.user, 'Card');
  const labelId = Number(req.body?.label_id);
  // Only the card's own project's labels: another project's owner could
  // otherwise rename what shows on this card.
  const label = db.prepare('SELECT name, project_id FROM labels WHERE id = ?').get(labelId) as
    | { name: string; project_id: number }
    | undefined;
  if (!label || label.project_id !== projectIdForCard(id)) throw badRequest("label_id must be a label in this card's project");
  const name = label.name;
  const added = db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)').run(id, labelId).changes;
  if (added) {
    logActivity({ user: req.user, verb: 'card.labeled', cardId: id, projectId: projectIdForCard(id), subject: card.title as string, detail: name });
  }
  res.json({ ok: true });
});

cardsRouter.delete('/:id/labels/:labelId', (req, res) => {
  const id = idParam(req);
  const card = mustEdit(getCard(id), req.user, 'Card');
  const labelId = idParam(req, 'labelId');
  const removed = db.prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?').run(id, labelId).changes;
  if (removed) {
    logActivity({ user: req.user, verb: 'card.unlabeled', cardId: id, projectId: projectIdForCard(id), subject: card.title as string, detail: labelName(labelId) });
  }
  res.json({ ok: true });
});

// --- Card attachments (list/create live under /api/cards/:id/attachments) ---
cardsRouter.get('/:id/attachments', (req, res) => {
  const id = idParam(req);
  res.json(
    db
      .prepare('SELECT id, card_id, filename, language, created_at, storage_key, mime, size_bytes FROM attachments WHERE card_id = ? ORDER BY created_at')
      .all(id),
  );
});

cardsRouter.post('/:id/attachments', (req, res) => {
  const id = idParam(req);
  mustEdit(getCard(id), req.user, 'Card');
  const filename = requiredTrimmed(req.body, 'filename', 'Filename required');
  const content = optionalString(req.body, 'content');
  if (!content) throw badRequest('Content required');
  const language = optionalString(req.body, 'language');
  const result = db
    .prepare('INSERT INTO attachments (card_id, filename, content, language) VALUES (?, ?, ?, ?)')
    .run(id, filename, content, language || guessLanguage(filename));
  res.json(db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid));
});
