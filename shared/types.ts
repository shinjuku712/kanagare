/**
 * API response types, imported by both the server and the web client. Change
 * a shape here and both sides have to agree.
 */

export interface User {
  id: number;
  email: string;
  is_admin: boolean;
}

/** Row as returned by /api/admin/users (raw DB flag, not boolean). */
export interface AdminUserRow {
  id: number;
  email: string;
  is_admin: 0 | 1;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  color: string;
  position: number;
  archived: 0 | 1;
  created_at: string;
  created_by: number | null;
  creator_email: string | null;
}

export interface Label {
  id: number;
  project_id: number;
  name: string;
  color: string;
  created_by: number | null;
}

export interface CardLabel {
  id: number;
  name: string;
  color: string;
}

export interface Card {
  id: number;
  column_id: number;
  title: string;
  description: string;
  color: string;
  position: number;
  due_date: string | null;
  created_at: string;
  updated_at: string | null;
  created_by: number | null;
  creator_email: string | null;
  /** Who's responsible for the card — independent of created_by (edit rights). */
  assignee_id: number | null;
  assignee_email: string | null;
  attachment_count: number;
  comment_count: number;
  link_count: number;
  labels: CardLabel[];
}

export interface Column {
  id: number;
  project_id: number;
  title: string;
  position: number;
  color: string;
  created_at: string;
  created_by: number | null;
  creator_email: string | null;
}

/** One entry of GET /api/projects/:id/board */
export interface BoardColumn extends Column {
  cards: Card[];
}

/**
 * Relationship types between two cards.
 *
 * `blocks` and `parent` are directional (A blocks B is not B blocks A);
 * `relates` is symmetric and stored once with the lower card id as `from`
 * so the pair can't be duplicated in both directions.
 */
export type CardLinkType = 'relates' | 'blocks' | 'parent';

export const CARD_LINK_TYPES: CardLinkType[] = ['relates', 'blocks', 'parent'];

/** A link row as stored. */
export interface CardLink {
  id: number;
  from_card_id: number;
  to_card_id: number;
  type: CardLinkType;
  created_at: string;
  created_by: number | null;
}

/**
 * A link as seen *from a particular card* — resolved to the card at the other
 * end, with `direction` telling you which way the arrow points.
 *
 *   outgoing + blocks  ⇒ this card blocks `other`
 *   incoming + blocks  ⇒ this card is blocked by `other`
 *   outgoing + parent  ⇒ `other` is a subtask of this card
 *   incoming + parent  ⇒ this card is a subtask of `other`
 */
export interface CardLinkView {
  id: number;
  type: CardLinkType;
  direction: 'outgoing' | 'incoming';
  other_card_id: number;
  other_title: string;
  other_column_title: string;
  other_project_id: number;
  other_project_name: string;
  other_color: string;
}

/** Node in GET /api/projects/:id/graph */
export interface GraphNode {
  id: number;
  title: string;
  color: string;
  column_id: number;
  column_title: string;
  column_color: string;
  due_date: string | null;
  creator_email: string | null;
  assignee_email: string | null;
  comment_count: number;
  attachment_count: number;
  label_count: number;
}

/** Edge in GET /api/projects/:id/graph */
export interface GraphEdge {
  id: number;
  from: number;
  to: number;
  type: CardLinkType;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * A comment on a card. `created_by` goes NULL if the author's account is
 * deleted — the comment stays (thread continuity) but shows as unattributed.
 */
export interface Comment {
  id: number;
  card_id: number;
  body: string;
  created_at: string;
  /** Set the first time the author edits; drives the "edited" marker. */
  edited_at: string | null;
  created_by: number | null;
  creator_email: string | null;
}

export interface Attachment {
  id: number;
  card_id: number;
  filename: string;
  language: string;
  created_at: string;
  /** Set for uploaded files; NULL for text snippets. */
  storage_key: string | null;
  mime: string | null;
  size_bytes: number | null;
}

export interface AttachmentFull extends Attachment {
  content: string;
}

export interface SearchResult {
  id: number;
  title: string;
  description: string;
  color: string;
  column_id: number;
  column_title: string;
  project_id: number;
  project_name: string;
  project_color: string;
  /** Where the match was found: the card itself, a comment on it, or a file. */
  match_kind?: 'card' | 'comment' | 'attachment';
  /** Context around the match, for hits that aren't in the title. */
  match_snippet?: string;
}

/** One entry of GET /api/agenda — a due card with its location. */
export interface AgendaItem {
  id: number;
  title: string;
  description: string;
  color: string;
  due_date: string;
  column_id: number;
  column_title: string;
  project_id: number;
  project_name: string;
  project_color: string;
  created_by: number | null;
  creator_email: string | null;
  assignee_id: number | null;
  assignee_email: string | null;
}

/** Entry of GET /api/users — minimal directory for assignee pickers. */
export interface DirectoryUser {
  id: number;
  email: string;
}

/** A reusable card blueprint. project_id null ⇒ available on every board. */
export interface Template {
  id: number;
  name: string;
  project_id: number | null;
  title: string;
  description: string;
  color: string;
  /** Newline-separated label names; resolved to real labels when applied. */
  label_names: string;
  created_at: string;
  created_by: number | null;
}

/** One entry of GET /api/activity. Denormalised so it survives deletions. */
export interface ActivityEntry {
  id: number;
  created_at: string;
  actor_id: number | null;
  actor_email: string | null;
  verb: string;
  card_id: number | null;
  project_id: number | null;
  /** Label of the thing acted on, as it was at the time. */
  subject: string | null;
  /** Extra context: destination column, assignee, filename… */
  detail: string | null;
}

export interface CheckResponse {
  authenticated: boolean;
  user?: User;
}

export interface LoginResponse {
  ok: true;
  user: User;
}

/** project_id -> non-archived card count */
export type ProjectCounts = Record<string, number>;
