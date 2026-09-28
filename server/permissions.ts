import type { User } from '../shared/types.ts';
import { db } from './db.ts';
import { forbidden, notFound } from './http.ts';

interface Owned {
  created_by: number | null;
}

/**
 * A row can be edited or deleted by its creator or any admin. Rows with no
 * creator (seeded, or the creator was deleted) are admin-only.
 */
export function canEdit(row: Owned | undefined | null, user: User): boolean {
  if (!row) return false;
  if (user.is_admin) return true;
  return row.created_by != null && row.created_by === user.id;
}

/** Returns the row, or throws 404 if it's missing and 403 if the user can't edit it. */
export function mustEdit<T extends Owned>(row: T | undefined, user: User, kind: string): T {
  if (!row) throw notFound(`${kind} not found`);
  if (!canEdit(row, user)) {
    throw forbidden(`Only the creator or an admin can modify this ${kind.toLowerCase()}`);
  }
  return row;
}

export const getCard = (id: number | string) =>
  db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as
    | ({ id: number; column_id: number } & Owned & Record<string, unknown>)
    | undefined;
export const getColumn = (id: number | string) =>
  db.prepare('SELECT * FROM columns WHERE id = ?').get(id) as
    | ({ id: number; project_id: number } & Owned & Record<string, unknown>)
    | undefined;
export const getProject = (id: number | string) =>
  db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | ({ id: number; name: string } & Owned & Record<string, unknown>)
    | undefined;
export const getLabel = (id: number | string) =>
  db.prepare('SELECT * FROM labels WHERE id = ?').get(id) as
    | ({ id: number } & Owned & Record<string, unknown>)
    | undefined;

/**
 * Deleting a column or project deletes the cards in it. Anyone can move cards,
 * so without this check a user could move someone else's card into their own
 * column and delete that. Non-admins may only delete containers holding cards
 * they could have deleted one by one.
 */
export function mustOwnCardsIn(scope: { columnId: number } | { projectId: number }, user: User, kind: string): void {
  if (user.is_admin) return;
  const inScope =
    'columnId' in scope
      ? 'column_id = ?'
      : 'column_id IN (SELECT id FROM columns WHERE project_id = ?)';
  const foreign = db
    .prepare(`SELECT 1 FROM cards WHERE ${inScope} AND (created_by IS NULL OR created_by <> ?) LIMIT 1`)
    .get('columnId' in scope ? scope.columnId : scope.projectId, user.id);
  if (foreign) throw forbidden(`This ${kind} has cards made by someone else. Move them out first, or ask an admin.`);
}
