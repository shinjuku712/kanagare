import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, idParam, optionalColor, optionalString, requiredTrimmed } from '../http.ts';
import { firstProject, maxPosition } from '../lib.ts';
import { getColumn, getProject, mustEdit, mustOwnCardsIn } from '../permissions.ts';
import { dropUnusedBlobs, fileKeysForCards } from '../blobs.ts';
import { requireAuth } from '../auth/session.ts';

export const columnsRouter = Router();
columnsRouter.use(requireAuth);

columnsRouter.post('/', (req, res) => {
  const title = requiredTrimmed(req.body, 'title', 'Title required');
  const color = optionalColor(req.body, 'color');
  const pid = req.body?.project_id !== undefined ? Number(req.body.project_id) : firstProject()?.id;
  if (!pid || !getProject(pid)) throw badRequest('project_id must be an existing project');
  const result = db
    .prepare('INSERT INTO columns (project_id, title, position, color, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(pid, title, maxPosition('columns', { col: 'project_id', val: pid }) + 1, color || '#6366f1', req.user.id);
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ...(col as object), cards: [] });
});

// Anyone can reorder columns, like moving cards. Registered before '/:id'.
columnsRouter.put('/reorder', (req, res) => {
  const { order } = req.body ?? {};
  if (!Array.isArray(order)) throw badRequest('order array required');
  const stmt = db.prepare('UPDATE columns SET position = ? WHERE id = ?');
  db.transaction(() => {
    (order as unknown[]).forEach((id, i) => stmt.run(i, id));
  })();
  res.json({ ok: true });
});

columnsRouter.put('/:id', (req, res) => {
  const id = idParam(req);
  mustEdit(getColumn(id), req.user, 'Column');
  const title = optionalString(req.body, 'title');
  const color = optionalColor(req.body, 'color');
  if (title !== undefined && !title.trim()) throw badRequest('Title required');
  if (title !== undefined) db.prepare('UPDATE columns SET title = ? WHERE id = ?').run(title.trim(), id);
  if (color !== undefined) db.prepare('UPDATE columns SET color = ? WHERE id = ?').run(color, id);
  res.json({ ok: true });
});

columnsRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  mustEdit(getColumn(id), req.user, 'Column');
  mustOwnCardsIn({ columnId: id }, req.user, 'column');
  const files = fileKeysForCards('column_id = ?', id);
  db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE column_id = ?').run(id);
    db.prepare('DELETE FROM columns WHERE id = ?').run(id);
  })();
  dropUnusedBlobs(files);
  res.json({ ok: true });
});
