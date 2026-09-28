import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, forbidden, idParam, notFound, optionalColor, optionalString, requiredTrimmed } from '../http.ts';
import { maxPosition, nowStamp } from '../lib.ts';
import { requireAuth } from '../auth/session.ts';
import { logActivity, projectIdForCard } from '../activity.ts';

/**
 * Card templates. `project_id` NULL makes one available in every project.
 * Labels are stored by name, so a global template works in any project:
 * applying it reuses a label with that name or creates it.
 */
export const templatesRouter = Router();
templatesRouter.use(requireAuth);

interface TemplateRow {
  id: number;
  name: string;
  project_id: number | null;
  title: string;
  description: string;
  color: string;
  label_names: string;
  created_by: number | null;
}

const getTemplate = (id: number) => db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined;

/** Templates visible on a board: that project's own, plus the global ones. */
templatesRouter.get('/', (req, res) => {
  const project = Number(req.query.project);
  const rows = Number.isInteger(project) && project > 0
    ? db.prepare('SELECT * FROM templates WHERE project_id IS NULL OR project_id = ? ORDER BY name').all(project)
    : db.prepare('SELECT * FROM templates ORDER BY name').all();
  res.json(rows);
});

templatesRouter.post('/', (req, res) => {
  const name = requiredTrimmed(req.body, 'name', 'Name required');
  const title = optionalString(req.body, 'title') ?? '';
  const description = optionalString(req.body, 'description') ?? '';
  const color = optionalColor(req.body, 'color') ?? '';
  const labels = Array.isArray(req.body?.label_names) ? (req.body.label_names as unknown[]).map(String) : [];
  const projectId = req.body?.project_id == null ? null : Number(req.body.project_id);
  if (projectId !== null && (!Number.isInteger(projectId) || !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId))) {
    throw badRequest('project_id must be a valid project, or null for a global template');
  }
  const info = db
    .prepare(
      `INSERT INTO templates (name, project_id, title, description, color, label_names, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, projectId, title, description, color, labels.join('\n'), req.user.id);
  res.json(getTemplate(Number(info.lastInsertRowid)));
});

templatesRouter.put('/:id', (req, res) => {
  const id = idParam(req);
  const t = getTemplate(id);
  if (!t) throw notFound('Template not found');
  if (!(req.user.is_admin || t.created_by === req.user.id)) {
    throw forbidden('Only the creator or an admin can modify this template');
  }
  // Validate everything before writing anything.
  const values = {
    name: optionalString(req.body, 'name')?.trim(),
    title: optionalString(req.body, 'title'),
    description: optionalString(req.body, 'description'),
    color: optionalColor(req.body, 'color'),
  };
  if (values.name === '') throw badRequest('Name required');
  db.transaction(() => {
    for (const [field, v] of Object.entries(values)) {
      if (v !== undefined) db.prepare(`UPDATE templates SET ${field} = ? WHERE id = ?`).run(v, id);
    }
    if (Array.isArray(req.body?.label_names)) {
      db.prepare('UPDATE templates SET label_names = ? WHERE id = ?').run((req.body.label_names as unknown[]).map(String).join('\n'), id);
    }
  })();
  res.json(getTemplate(id));
});

templatesRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  const t = getTemplate(id);
  if (!t) throw notFound('Template not found');
  if (!(req.user.is_admin || t.created_by === req.user.id)) {
    throw forbidden('Only the creator or an admin can delete this template');
  }
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  res.json({ ok: true });
});

/**
 * POST /api/templates/:id/apply {column_id, title?}
 * Creates a card from the template. An explicit title overrides the
 * template's, so "New bug report" can still be named at creation time.
 */
templatesRouter.post('/:id/apply', (req, res) => {
  const id = idParam(req);
  const t = getTemplate(id);
  if (!t) throw notFound('Template not found');

  const columnId = Number(req.body?.column_id);
  const column = db.prepare('SELECT id, project_id FROM columns WHERE id = ?').get(columnId) as
    | { id: number; project_id: number }
    | undefined;
  if (!column) throw badRequest('column_id must be a valid column');

  const title = (optionalString(req.body, 'title') || t.title || t.name).trim();

  const created = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO cards (column_id, title, description, color, position, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(columnId, title, t.description, t.color, maxPosition('cards', { col: 'column_id', val: columnId }) + 1, nowStamp(), req.user.id);
    const cardId = Number(info.lastInsertRowid);

    // Labels by name: reuse the project's label if it exists, create it if not.
    const names = t.label_names.split('\n').map((n) => n.trim()).filter(Boolean);
    for (const n of names) {
      let label = db
        .prepare('SELECT id FROM labels WHERE project_id = ? AND name = ? COLLATE NOCASE')
        .get(column.project_id, n) as { id: number } | undefined;
      if (!label) {
        const li = db
          .prepare('INSERT INTO labels (project_id, name, color, created_by) VALUES (?, ?, ?, ?)')
          .run(column.project_id, n, '#6366f1', req.user.id);
        label = { id: Number(li.lastInsertRowid) };
      }
      try {
        db.prepare('INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)').run(cardId, label.id);
      } catch {
        /* already applied */
      }
    }
    return cardId;
  })();

  logActivity({
    user: req.user,
    verb: 'card.created',
    cardId: created,
    projectId: projectIdForCard(created),
    subject: title,
    detail: `from template “${t.name}”`,
  });

  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(created));
});
