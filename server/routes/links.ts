import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, forbidden, idParam, notFound } from '../http.ts';
import { getCard, mustEdit } from '../permissions.ts';
import { requireAuth } from '../auth/session.ts';
import { CARD_LINK_TYPES, type CardLinkType } from '../../shared/types.ts';
import { logActivity, projectIdForCard } from '../activity.ts';

/**
 * Card-to-card links.
 *
 * Permission model follows the *source* card: if you can edit a card, you can
 * link it to things. Linking doesn't mutate the target, so requiring rights on
 * both ends would make cross-owner links impossible on a shared board.
 *
 * `relates` is symmetric, so it's normalised (lower id becomes `from`) and the
 * unique index then makes A↔B impossible to duplicate. `blocks` and `parent`
 * are directional and stored as given.
 */
export const linksRouter = Router();
linksRouter.use(requireAuth);

/** Resolved view of a card's links — the other end, plus which way it points. */
const LINKS_FOR_CARD = `
  SELECT l.id, l.type,
         CASE WHEN l.from_card_id = :id THEN 'outgoing' ELSE 'incoming' END AS direction,
         CASE WHEN l.from_card_id = :id THEN l.to_card_id ELSE l.from_card_id END AS other_card_id,
         c.title  AS other_title,
         c.color  AS other_color,
         col.title AS other_column_title,
         p.id     AS other_project_id,
         p.name   AS other_project_name
  FROM card_links l
  JOIN cards   c   ON c.id   = CASE WHEN l.from_card_id = :id THEN l.to_card_id ELSE l.from_card_id END
  JOIN columns col ON col.id = c.column_id
  JOIN projects p  ON p.id   = col.project_id
  WHERE l.from_card_id = :id OR l.to_card_id = :id
  ORDER BY l.type, c.title
`;

function linksForCard(cardId: number) {
  return db.prepare(LINKS_FOR_CARD).all({ id: cardId });
}

/**
 * Would making `toCard` a subtask of `fromCard` create a loop? Walks `parent`
 * links upward from `fromCard` looking for `toCard`.
 */
function wouldCycle(fromCard: number, toCard: number): boolean {
  const parents = db.prepare("SELECT from_card_id FROM card_links WHERE to_card_id = ? AND type = 'parent'");
  const seen = new Set<number>();
  const stack = [fromCard];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === toCard) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const row of parents.all(cur) as { from_card_id: number }[]) stack.push(row.from_card_id);
  }
  return false;
}

// Mounted on /api/cards (see app.ts).
export const cardLinksRouter = Router();
cardLinksRouter.use(requireAuth);

cardLinksRouter.get('/:id/links', (req, res) => {
  const id = idParam(req);
  if (!getCard(id)) throw notFound('Card not found');
  res.json(linksForCard(id));
});

cardLinksRouter.post('/:id/links', (req, res) => {
  const fromId = idParam(req);
  const from = getCard(fromId);
  if (!from) throw notFound('Card not found');
  mustEdit(from, req.user, 'Card');

  const toId = Number(req.body?.to_card_id);
  if (!Number.isInteger(toId) || toId <= 0) throw badRequest('to_card_id required');
  if (toId === fromId) throw badRequest('A card cannot link to itself');
  if (!getCard(toId)) throw notFound('Target card not found');

  const type = (req.body?.type ?? 'relates') as CardLinkType;
  if (!CARD_LINK_TYPES.includes(type)) {
    throw badRequest(`type must be one of: ${CARD_LINK_TYPES.join(', ')}`);
  }

  // Symmetric links get a canonical direction so A→B and B→A collapse to one row.
  let a = fromId;
  let b = toId;
  if (type === 'relates' && a > b) [a, b] = [b, a];

  if (type === 'parent' && wouldCycle(fromId, toId)) {
    throw badRequest('That would create a circular parent/subtask chain');
  }

  try {
    const info = db
      .prepare('INSERT INTO card_links (from_card_id, to_card_id, type, created_by) VALUES (?, ?, ?, ?)')
      .run(a, b, type, req.user.id);
    const target = db.prepare('SELECT title FROM cards WHERE id = ?').get(toId) as { title: string } | undefined;
    logActivity({
      user: req.user,
      verb: 'card.linked',
      cardId: fromId,
      projectId: projectIdForCard(fromId),
      subject: (from as { title?: string }).title ?? null,
      detail: `${type} → #${toId} ${target?.title ?? ''}`.trim(),
    });
    res.json(db.prepare('SELECT * FROM card_links WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw badRequest('These cards are already linked that way');
    throw e;
  }
});

// DELETE /api/links/:id — removable from either end.
linksRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  const link = db.prepare('SELECT * FROM card_links WHERE id = ?').get(id) as
    | { id: number; from_card_id: number; to_card_id: number }
    | undefined;
  if (!link) throw notFound('Link not found');
  // Editing either endpoint is enough to break the link.
  const from = getCard(link.from_card_id);
  const to = getCard(link.to_card_id);
  const canFrom = from && (req.user.is_admin || from.created_by === req.user.id);
  const canTo = to && (req.user.is_admin || to.created_by === req.user.id);
  if (!canFrom && !canTo) {
    throw forbidden('You can only remove links on cards you can edit');
  }
  db.prepare('DELETE FROM card_links WHERE id = ?').run(id);
  logActivity({
    user: req.user,
    verb: 'card.unlinked',
    cardId: link.from_card_id,
    projectId: projectIdForCard(link.from_card_id),
    subject: (from as { title?: string } | undefined)?.title ?? null,
    detail: `#${link.to_card_id}`,
  });
  res.json({ ok: true });
});
