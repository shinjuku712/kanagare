import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, idParam, optionalColor, optionalString, requiredTrimmed } from '../http.ts';
import { getLabel, mustEdit } from '../permissions.ts';
import { requireAuth } from '../auth/session.ts';

/** Project-scoped label routes — mounted under /api/projects. */
export const projectLabelsRouter = Router();
projectLabelsRouter.use(requireAuth);

projectLabelsRouter.get('/:id/labels', (req, res) => {
  res.json(db.prepare('SELECT * FROM labels WHERE project_id = ? ORDER BY name').all(idParam(req)));
});

projectLabelsRouter.post('/:id/labels', (req, res) => {
  const projectId = idParam(req);
  const name = requiredTrimmed(req.body, 'name', 'Name required');
  const color = optionalColor(req.body, 'color');
  const result = db
    .prepare('INSERT INTO labels (project_id, name, color, created_by) VALUES (?, ?, ?, ?)')
    .run(projectId, name, color || '#6366f1', req.user.id);
  res.json(db.prepare('SELECT * FROM labels WHERE id = ?').get(result.lastInsertRowid));
});

/** Label-id routes — mounted under /api/labels. */
export const labelsRouter = Router();
labelsRouter.use(requireAuth);

labelsRouter.put('/:id', (req, res) => {
  const id = idParam(req);
  mustEdit(getLabel(id), req.user, 'Label');
  const name = optionalString(req.body, 'name');
  const color = optionalColor(req.body, 'color');
  if (name !== undefined && !name.trim()) throw badRequest('Name required');
  if (name !== undefined) db.prepare('UPDATE labels SET name = ? WHERE id = ?').run(name.trim(), id);
  if (color !== undefined) db.prepare('UPDATE labels SET color = ? WHERE id = ?').run(color, id);
  res.json({ ok: true });
});

labelsRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  mustEdit(getLabel(id), req.user, 'Label');
  db.transaction(() => {
    db.prepare('DELETE FROM card_labels WHERE label_id = ?').run(id);
    db.prepare('DELETE FROM labels WHERE id = ?').run(id);
  })();
  res.json({ ok: true });
});
