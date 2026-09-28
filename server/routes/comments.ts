import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, forbidden, idParam, notFound, requiredTrimmed } from '../http.ts';
import { nowStamp } from '../lib.ts';
import { requireAuth } from '../auth/session.ts';
import type { User } from '../../shared/types.ts';
import { logActivity, projectIdForCard } from '../activity.ts';

/**
 * Comments belong to their author, not to the card's owner. Anyone can post;
 * only the author can edit; the author or an admin can delete.
 */
export const commentsRouter = Router();
commentsRouter.use(requireAuth);

const MAX_BODY = 10_000;

const SELECT_WITH_AUTHOR = `
  SELECT c.id, c.card_id, c.body, c.created_at, c.edited_at, c.created_by, u.email AS creator_email
  FROM comments c
  LEFT JOIN users u ON u.id = c.created_by
`;

interface CommentRow {
  id: number;
  card_id: number;
  created_by: number | null;
}

function getComment(id: number): CommentRow | undefined {
  return db.prepare('SELECT id, card_id, created_by FROM comments WHERE id = ?').get(id) as CommentRow | undefined;
}

function cardExists(cardId: number): boolean {
  return !!db.prepare('SELECT 1 FROM cards WHERE id = ?').get(cardId);
}

/** Editing: author only, admins included. */
function mustBeAuthor(row: CommentRow, user: User): void {
  if (row.created_by == null || row.created_by !== user.id) {
    throw forbidden('Only the author can edit this comment');
  }
}

/** Deleting: author or admin. */
function mustBeAuthorOrAdmin(row: CommentRow, user: User): void {
  if (user.is_admin) return;
  if (row.created_by == null || row.created_by !== user.id) {
    throw forbidden('Only the author or an admin can delete this comment');
  }
}

// --- Mounted at /api/cards/:id/comments ---
export const cardCommentsRouter = Router();
cardCommentsRouter.use(requireAuth);

cardCommentsRouter.get('/:id/comments', (req, res) => {
  const cardId = idParam(req);
  if (!cardExists(cardId)) throw notFound('Card not found');
  res.json(db.prepare(`${SELECT_WITH_AUTHOR} WHERE c.card_id = ? ORDER BY c.id`).all(cardId));
});

cardCommentsRouter.post('/:id/comments', (req, res) => {
  const cardId = idParam(req);
  if (!cardExists(cardId)) throw notFound('Card not found');
  const body = requiredTrimmed(req.body, 'body', 'Comment body required');
  if (body.length > MAX_BODY) throw badRequest(`Comment too long (max ${MAX_BODY} characters)`);
  const info = db
    .prepare('INSERT INTO comments (card_id, body, created_by) VALUES (?, ?, ?)')
    .run(cardId, body, req.user.id);
  const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(cardId) as { title: string } | undefined;
  logActivity({ user: req.user, verb: 'comment.added', cardId, projectId: projectIdForCard(cardId), subject: card?.title ?? null });
  res.json(db.prepare(`${SELECT_WITH_AUTHOR} WHERE c.id = ?`).get(info.lastInsertRowid));
});

// --- Mounted at /api/comments ---
commentsRouter.put('/:id', (req, res) => {
  const row = getComment(idParam(req));
  if (!row) throw notFound('Comment not found');
  mustBeAuthor(row, req.user);
  const body = requiredTrimmed(req.body, 'body', 'Comment body required');
  if (body.length > MAX_BODY) throw badRequest(`Comment too long (max ${MAX_BODY} characters)`);
  db.prepare('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?').run(body, nowStamp(), row.id);
  res.json(db.prepare(`${SELECT_WITH_AUTHOR} WHERE c.id = ?`).get(row.id));
});

commentsRouter.delete('/:id', (req, res) => {
  const row = getComment(idParam(req));
  if (!row) throw notFound('Comment not found');
  mustBeAuthorOrAdmin(row, req.user);
  db.prepare('DELETE FROM comments WHERE id = ?').run(row.id);
  const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(row.card_id) as { title: string } | undefined;
  logActivity({ user: req.user, verb: 'comment.deleted', cardId: row.card_id, projectId: projectIdForCard(row.card_id), subject: card?.title ?? null });
  res.json({ ok: true });
});
