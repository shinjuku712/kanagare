import { Router } from 'express';
import { db, seedDefaultColumns } from '../db.ts';
import { badRequest, idParam, optionalColor, optionalString, requiredTrimmed } from '../http.ts';
import { maxPosition, slugify } from '../lib.ts';
import { getProject, mustEdit, mustOwnCardsIn } from '../permissions.ts';
import { requireAuth } from '../auth/session.ts';
import { dropUnusedBlobs, fileKeysForCards } from '../blobs.ts';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const PROJECTS_SELECT = `
  SELECT p.*, u.email AS creator_email
  FROM projects p
  LEFT JOIN users u ON u.id = p.created_by
`;

projectsRouter.get('/', (req, res) => {
  const includeArchived = req.query.archived === '1';
  const sql = includeArchived
    ? PROJECTS_SELECT + ' ORDER BY p.archived, p.position'
    : PROJECTS_SELECT + ' WHERE p.archived = 0 ORDER BY p.position';
  res.json(db.prepare(sql).all());
});

/** Names and slugs are both unique; `exceptId` skips the project being renamed. */
const nameTaken = (name: string, slug: string, exceptId = 0) =>
  !!db.prepare('SELECT 1 FROM projects WHERE (LOWER(name) = LOWER(?) OR slug = ?) AND id <> ?').get(name, slug, exceptId);

projectsRouter.post('/', (req, res) => {
  const name = requiredTrimmed(req.body, 'name', 'Name required');
  const color = optionalColor(req.body, 'color');
  const slug = slugify(name);
  if (nameTaken(name, slug)) throw badRequest('A project with that name already exists');
  const id = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO projects (name, slug, color, position, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(name, slug, color || '#7c6ef6', maxPosition('projects') + 1, req.user.id);
    seedDefaultColumns(Number(result.lastInsertRowid), req.user.id);
    return Number(result.lastInsertRowid);
  })();
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

// Registered before '/:id' so "reorder" and "counts" aren't read as ids.
projectsRouter.put('/reorder', (req, res) => {
  const { order } = req.body ?? {};
  if (!Array.isArray(order)) throw badRequest('order array required');
  const stmt = db.prepare('UPDATE projects SET position = ? WHERE id = ?');
  db.transaction(() => {
    (order as unknown[]).forEach((id, i) => stmt.run(i, id));
  })();
  res.json({ ok: true });
});

projectsRouter.get('/counts', (_req, res) => {
  const counts = db
    .prepare(
      `SELECT p.id AS project_id, COUNT(c.id) AS card_count
       FROM projects p
       LEFT JOIN columns col ON col.project_id = p.id
       LEFT JOIN cards c ON c.column_id = col.id
       WHERE p.archived = 0
       GROUP BY p.id`,
    )
    .all() as { project_id: number; card_count: number }[];
  const map: Record<string, number> = {};
  counts.forEach((r) => {
    map[r.project_id] = r.card_count;
  });
  res.json(map);
});

projectsRouter.put('/:id', (req, res) => {
  const id = idParam(req);
  mustEdit(getProject(id), req.user, 'Project');
  const name = optionalString(req.body, 'name');
  const color = optionalColor(req.body, 'color');
  if (name !== undefined) {
    if (!name.trim()) throw badRequest('Name required');
    if (nameTaken(name.trim(), slugify(name), id)) throw badRequest('A project with that name already exists');
    db.prepare('UPDATE projects SET name = ?, slug = ? WHERE id = ?').run(name.trim(), slugify(name), id);
  }
  if (color !== undefined) db.prepare('UPDATE projects SET color = ? WHERE id = ?').run(color, id);
  res.json({ ok: true });
});

projectsRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  mustEdit(getProject(id), req.user, 'Project');
  mustOwnCardsIn({ projectId: id }, req.user, 'project');
  const files = fileKeysForCards('column_id IN (SELECT id FROM columns WHERE project_id = ?)', id);
  db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE column_id IN (SELECT id FROM columns WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM columns WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  })();
  dropUnusedBlobs(files);
  res.json({ ok: true });
});

projectsRouter.put('/:id/archive', (req, res) => {
  const id = idParam(req);
  mustEdit(getProject(id), req.user, 'Project');
  db.prepare('UPDATE projects SET archived = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

projectsRouter.put('/:id/unarchive', (req, res) => {
  const id = idParam(req);
  mustEdit(getProject(id), req.user, 'Project');
  db.prepare('UPDATE projects SET archived = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

/** Full board for one project: columns with cards, labels, attachment counts. */
projectsRouter.get('/:id/board', (req, res) => {
  const id = idParam(req);
  res.json(boardForProject(id));
});

/**
 * Graph of a project: every card as a node, every link touching those cards as
 * an edge. Edges to cards outside this project are dropped — the view is
 * project-scoped, so a dangling half-edge would render as an arrow to nowhere.
 */
projectsRouter.get('/:id/graph', (req, res) => {
  const projectId = idParam(req);
  const nodes = db
    .prepare(
      `SELECT c.id, c.title, c.color, c.due_date, c.column_id,
              col.title AS column_title, col.color AS column_color,
              u.email AS creator_email,
              au.email AS assignee_email,
              (SELECT COUNT(*) FROM comments cm WHERE cm.card_id = c.id)      AS comment_count,
              (SELECT COUNT(*) FROM attachments a WHERE a.card_id = c.id)     AS attachment_count,
              (SELECT COUNT(*) FROM card_labels cl WHERE cl.card_id = c.id)   AS label_count
       FROM cards c
       JOIN columns col ON col.id = c.column_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users au ON au.id = c.assignee_id
       WHERE col.project_id = ?
       ORDER BY col.position, c.position`,
    )
    .all(projectId) as { id: number }[];

  const edges = nodes.length
    ? db
        .prepare(
          `SELECT l.id, l.from_card_id AS "from", l.to_card_id AS "to", l.type
           FROM card_links l
           JOIN cards fc ON fc.id = l.from_card_id
           JOIN columns fcol ON fcol.id = fc.column_id
           JOIN cards tc ON tc.id = l.to_card_id
           JOIN columns tcol ON tcol.id = tc.column_id
           WHERE fcol.project_id = ? AND tcol.project_id = ?`,
        )
        .all(projectId, projectId)
    : [];

  res.json({ nodes, edges });
});

export function boardForProject(projectId: number) {
  const columns = db
    .prepare(
      `SELECT col.*, u.email AS creator_email
       FROM columns col
       LEFT JOIN users u ON u.id = col.created_by
       WHERE col.project_id = ? ORDER BY col.position`,
    )
    .all(projectId) as ({ id: number } & Record<string, unknown>)[];
  if (!columns.length) return [];

  const cards = db
    .prepare(
      `SELECT c.*, u.email AS creator_email, au.email AS assignee_email
       FROM cards c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users au ON au.id = c.assignee_id
       WHERE c.column_id IN (SELECT id FROM columns WHERE project_id = ?)
       ORDER BY c.position`,
    )
    .all(projectId) as ({ id: number; column_id: number } & Record<string, unknown>)[];

  const attCounts = new Map<number, number>();
  const commentCounts = new Map<number, number>();
  const linkCounts = new Map<number, number>();
  const cardLabels = new Map<number, { id: number; name: string; color: string }[]>();
  if (cards.length) {
    const rowsA = db
      .prepare(
        `SELECT a.card_id, COUNT(*) AS c FROM attachments a
         JOIN cards ca ON ca.id = a.card_id
         JOIN columns col ON col.id = ca.column_id
         WHERE col.project_id = ? GROUP BY a.card_id`,
      )
      .all(projectId) as { card_id: number; c: number }[];
    rowsA.forEach((r) => attCounts.set(r.card_id, r.c));
    const rowsC = db
      .prepare(
        `SELECT cm.card_id, COUNT(*) AS c FROM comments cm
         JOIN cards ca ON ca.id = cm.card_id
         JOIN columns col ON col.id = ca.column_id
         WHERE col.project_id = ? GROUP BY cm.card_id`,
      )
      .all(projectId) as { card_id: number; c: number }[];
    rowsC.forEach((r) => commentCounts.set(r.card_id, r.c));
    const rowsK = db
      .prepare(
        `SELECT cid AS card_id, COUNT(*) AS c FROM (
           SELECT l.from_card_id AS cid FROM card_links l
           JOIN cards ca ON ca.id = l.from_card_id
           JOIN columns col ON col.id = ca.column_id WHERE col.project_id = ?
           UNION ALL
           SELECT l.to_card_id AS cid FROM card_links l
           JOIN cards ca ON ca.id = l.to_card_id
           JOIN columns col ON col.id = ca.column_id WHERE col.project_id = ?
         ) GROUP BY cid`,
      )
      .all(projectId, projectId) as { card_id: number; c: number }[];
    rowsK.forEach((r) => linkCounts.set(r.card_id, r.c));
    const rowsL = db
      .prepare(
        `SELECT cl.card_id, l.id, l.name, l.color FROM card_labels cl
         JOIN labels l ON cl.label_id = l.id
         JOIN cards ca ON ca.id = cl.card_id
         JOIN columns col ON col.id = ca.column_id
         WHERE col.project_id = ?`,
      )
      .all(projectId) as { card_id: number; id: number; name: string; color: string }[];
    rowsL.forEach((r) => {
      const list = cardLabels.get(r.card_id) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      cardLabels.set(r.card_id, list);
    });
  }

  return columns.map((col) => ({
    ...col,
    cards: cards
      .filter((c) => c.column_id === col.id)
      .map((c) => ({
        ...c,
        attachment_count: attCounts.get(c.id) ?? 0,
        comment_count: commentCounts.get(c.id) ?? 0,
        link_count: linkCounts.get(c.id) ?? 0,
        labels: cardLabels.get(c.id) ?? [],
      })),
  }));
}
