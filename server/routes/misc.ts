import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth } from '../auth/session.ts';

export const miscRouter = Router();
miscRouter.use(requireAuth);

/**
 * Full-text search. One row per card, best match first. The input is split
 * into quoted terms before it reaches FTS5, because raw text like `foo"` or
 * `AND` is a syntax error in FTS5's query language.
 */
miscRouter.get('/search', (req, res) => {
  const raw = String(req.query.q ?? '').trim();
  if (!raw) {
    res.json([]);
    return;
  }
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  // Split on non-word characters, quote each term, and prefix-match the last
  // one so results narrow as you type.
  const terms = raw.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  if (!terms.length) {
    res.json([]);
    return;
  }
  const query = terms.map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`)).join(' AND ');

  try {
    // bm25() and snippet() can't be used inside an aggregate, so rank in
    // `hits` first and pick each card's best row afterwards.
    const rows = db
      .prepare(
        `WITH hits AS (
         SELECT rowid,
                kind,
                card_id,
                bm25(search_fts) AS score,
                snippet(search_fts, 0, '', '', '…', 12) AS snip
         FROM search_fts
         WHERE search_fts MATCH ?
         ORDER BY score
         LIMIT 200
       ),
       best AS (
         SELECT card_id, kind, score, snip,
                ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY score) AS rn
         FROM hits
       )
       SELECT c.id, c.title, c.description, c.color, c.column_id,
              col.title AS column_title, col.project_id,
              p.name AS project_name, p.color AS project_color,
              b.kind AS match_kind,
              b.snip AS match_snippet
       FROM best b
       JOIN cards c ON c.id = b.card_id
       JOIN columns col ON col.id = c.column_id
       JOIN projects p ON p.id = col.project_id
       WHERE b.rn = 1
       ORDER BY b.score
       LIMIT ?`,
      )
      .all(query, limit);
    res.json(rows);
  } catch {
    // Malformed FTS expression despite sanitising — fall back to a plain
    // substring scan rather than failing the search outright.
    const like = '%' + raw + '%';
    res.json(
      db
        .prepare(
          `SELECT c.id, c.title, c.description, c.color, c.column_id,
                  col.title AS column_title, col.project_id,
                  p.name AS project_name, p.color AS project_color,
                  'card' AS match_kind, '' AS match_snippet
           FROM cards c
           JOIN columns col ON c.column_id = col.id
           JOIN projects p ON col.project_id = p.id
           WHERE c.title LIKE ? OR c.description LIKE ?
           ORDER BY c.created_at DESC LIMIT ?`,
        )
        .all(like, like, limit),
    );
  }
});

/**
 * Cross-project agenda: every card with a due date, in non-archived projects,
 * excluding "Done" columns. The client groups into overdue / today / upcoming.
 */
miscRouter.get('/agenda', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT c.id, c.title, c.description, c.color, c.due_date, c.column_id, c.created_by,
                c.assignee_id, u.email AS creator_email, au.email AS assignee_email,
                col.title AS column_title, col.project_id,
                p.name AS project_name, p.color AS project_color
         FROM cards c
         JOIN columns col ON c.column_id = col.id
         JOIN projects p ON col.project_id = p.id
         LEFT JOIN users u ON u.id = c.created_by
         LEFT JOIN users au ON au.id = c.assignee_id
         WHERE c.due_date IS NOT NULL
           AND p.archived = 0
           AND LOWER(col.title) != 'done'
         ORDER BY c.due_date`,
      )
      .all(),
  );
});

/** Id and email of every user, for the assignee picker. */
miscRouter.get('/users', (_req, res) => {
  res.json(db.prepare('SELECT id, email FROM users ORDER BY email').all());
});

/** Activity for one card (?card=), one project (?project=) or everything, newest first. */
miscRouter.get('/activity', (req, res) => {
  const card = Number(req.query.card);
  const project = Number(req.query.project);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  if (Number.isInteger(card) && card > 0) {
    res.json(
      db
        .prepare('SELECT * FROM activity WHERE card_id = ? ORDER BY id DESC LIMIT ?')
        .all(card, limit),
    );
    return;
  }
  if (Number.isInteger(project) && project > 0) {
    res.json(
      db
        .prepare('SELECT * FROM activity WHERE project_id = ? ORDER BY id DESC LIMIT ?')
        .all(project, limit),
    );
    return;
  }
  res.json(db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(limit));
});

