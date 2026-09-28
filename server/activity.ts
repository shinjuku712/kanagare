import { db } from './db.ts';
import type { User } from '../shared/types.ts';

/**
 * Card history: creation, moves, edits, assignment, labels, links, files and
 * comments. The actor's email and the card title are copied into each row, so
 * entries still read correctly after the card or the user is deleted.
 */

export type Verb =
  | 'card.created'
  | 'card.deleted'
  | 'card.moved'
  | 'card.renamed'
  | 'card.described'
  | 'card.due'
  | 'card.assigned'
  | 'card.unassigned'
  | 'card.labeled'
  | 'card.unlabeled'
  | 'card.linked'
  | 'card.unlinked'
  | 'file.added'
  | 'file.removed'
  | 'comment.added'
  | 'comment.deleted';

interface LogArgs {
  user: User;
  verb: Verb;
  cardId?: number | null;
  projectId?: number | null;
  /** Human label for the thing acted on — kept even if that thing is deleted. */
  subject?: string | null;
  /** Extra context: the new column, the assignee, the filename… */
  detail?: string | null;
}

// Prepared lazily: this module is imported before migrate() creates the table.
type InsertArgs = [number | null, string | null, string, number | null, number | null, string | null, string | null];
let insert: import('better-sqlite3').Statement<InsertArgs> | null = null;
function stmt() {
  if (!insert) {
    insert = db.prepare<InsertArgs>(
      `INSERT INTO activity (actor_id, actor_email, verb, card_id, project_id, subject, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
  }
  return insert;
}

/**
 * Never throws. An audit trail failing must not take a real mutation down with
 * it — a missing log line is a much smaller problem than a 500 on a card edit.
 */
export function logActivity({ user, verb, cardId, projectId, subject, detail }: LogArgs): void {
  try {
    stmt().run(user.id, user.email, verb, cardId ?? null, projectId ?? null, subject ?? null, detail ?? null);
  } catch (e) {
    console.error('[activity] failed to log', verb, e);
  }
}

/** Resolve a card's project so entries can be filtered per project. */
export function projectIdForCard(cardId: number): number | null {
  const row = db
    .prepare('SELECT col.project_id AS pid FROM cards c JOIN columns col ON col.id = c.column_id WHERE c.id = ?')
    .get(cardId) as { pid: number } | undefined;
  return row?.pid ?? null;
}
