import { useSyncExternalStore } from 'react';
import type { BoardColumn, Card, DirectoryUser, Label, Project, ProjectCounts, User } from '@shared/types';
import { api } from './api.ts';
import { COL_COLORS, PROJ_COLORS, dueState } from './lib/util.ts';
import { prefs } from './lib/prefs.ts';

export interface Toast {
  id: number;
  msg: string;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
}

export interface Filters {
  colors: Set<string>;
  labels: Set<number>;
  creators: Set<string>;
  /** Assignee emails; the empty string matches deliberately-unassigned cards. */
  assignees: Set<string>;
}

export interface State {
  authChecked: boolean;
  user: User | null;
  projects: Project[];
  archived: Project[];
  counts: ProjectCounts;
  currentProjectId: number | null;
  board: BoardColumn[];
  boardLoaded: boolean;
  labels: Label[];
  filters: Filters;
  agendaBadge: number;
  /** Minimal user directory, loaded once for assignee pickers/filters. */
  directory: DirectoryUser[];
  toasts: Toast[];
  justAddedCardId: number | null;
  /** Mirrors <html data-theme>; label colours are computed per theme. */
  theme: 'dark' | 'light';
}

let state: State = {
  authChecked: false,
  user: null,
  projects: [],
  archived: [],
  counts: {},
  currentProjectId: parseInt(prefs.get('project') || '') || null,
  board: [],
  boardLoaded: false,
  labels: [],
  filters: { colors: new Set(), labels: new Set(), creators: new Set(), assignees: new Set() },
  agendaBadge: 0,
  directory: [],
  toasts: [],
  justAddedCardId: null,
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
};

const listeners = new Set<() => void>();

function set(partial: Partial<State>) {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

export function useStore(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const getState = () => state;

/** Board component sets this while a drag is in flight so background refreshes don't fight the DOM. */
let dragActive = false;
export function setDragActive(v: boolean) {
  dragActive = v;
  if (!v && refreshQueued) refreshSoon();
}

export function setTheme(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0a0c' : '#f1f1f4');
  prefs.set('theme', theme);
  set({ theme });
}

// ---------- toasts ----------

let toastSeq = 1;
export function toast(msg: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }) {
  const id = toastSeq++;
  const t: Toast = {
    id,
    msg,
    actionLabel: opts?.actionLabel,
    onAction: opts?.onAction,
    duration: opts?.duration ?? (opts?.actionLabel ? 5000 : 2400),
  };
  set({ toasts: [...state.toasts, t].slice(-3) });
  window.setTimeout(() => dismissToast(id), t.duration);
}
export function dismissToast(id: number) {
  if (state.toasts.some((t) => t.id === id)) set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

function fail(e: unknown) {
  toast(e instanceof Error ? e.message : 'Something went wrong');
  void loadBoard(true);
  void loadProjects(true);
}

// ---------- auth ----------

export async function checkAuth() {
  try {
    const res = await api.check();
    set({ authChecked: true, user: res.authenticated && res.user ? res.user : null });
    if (res.authenticated) await loadAll();
  } catch {
    set({ authChecked: true, user: null });
  }
}

export async function login(email: string, password: string) {
  const res = await api.login(email, password);
  set({ user: res.user });
  await loadAll();
}

export async function logout() {
  try {
    await api.logout();
  } finally {
    location.reload();
  }
}

// ---------- loading ----------

async function loadAll() {
  await loadProjects(false);
  void refreshAgendaBadge();
  void loadDirectory();
}

/** User list for assignee pickers, fetched once per session. */
async function loadDirectory() {
  try {
    set({ directory: await api.users() });
  } catch {
    /* pickers fall back to showing just the current user */
  }
}

/** Assign or unassign a card, optimistically. */
export function assignCard(cardId: number, user: DirectoryUser | null) {
  updateCard(cardId, { assignee_id: user?.id ?? null, assignee_email: user?.email ?? null });
}

export async function loadProjects(silent: boolean) {
  try {
    const [all, counts] = await Promise.all([api.projects(true), api.projectCounts()]);
    const projects = all.filter((p) => !p.archived);
    const archived = all.filter((p) => p.archived);
    let current = state.currentProjectId;
    if (!current || !all.some((p) => p.id === current)) current = projects[0]?.id ?? null;
    const projectChanged = current !== state.currentProjectId;
    set({ projects, archived, counts, currentProjectId: current });
    if (current && (projectChanged || !state.boardLoaded || !silent)) await loadBoard(silent && !projectChanged);
    if (!current) set({ board: [], boardLoaded: true, labels: [] });
  } catch (e) {
    if (!silent) toast(e instanceof Error ? e.message : 'Failed to load projects');
  }
}

export async function loadBoard(silent = false) {
  const pid = state.currentProjectId;
  if (!pid) return;
  try {
    const [board, labels] = await Promise.all([api.board(pid), api.labels(pid)]);
    if (state.currentProjectId !== pid) return; // switched away meanwhile
    set({ board: stripPendingDeletes(board), labels, boardLoaded: true });
  } catch (e) {
    if (!silent) toast(e instanceof Error ? e.message : 'Failed to load board');
  }
}

let refreshTimer: number | undefined;
let refreshQueued = false;
/** Debounced background re-sync after mutations (multi-user freshness). */
export function refreshSoon() {
  if (dragActive) {
    refreshQueued = true;
    return;
  }
  refreshQueued = false;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void loadBoard(true);
    void loadCountsSilent();
    void refreshAgendaBadge();
  }, 900);
}

async function loadCountsSilent() {
  try {
    set({ counts: await api.projectCounts() });
  } catch {
    /* ignore */
  }
}

export async function refreshAgendaBadge() {
  try {
    const items = await api.agenda();
    const n = items.filter((i) => {
      const s = dueState(i.due_date);
      return s === 'overdue' || s === 'today';
    }).length;
    set({ agendaBadge: n });
  } catch {
    /* ignore */
  }
}

// Poll while visible; refresh on focus.
window.setInterval(() => {
  if (document.visibilityState === 'visible' && state.user && !dragActive) {
    void loadBoard(true);
    void loadCountsSilent();
  }
}, 30000);
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) refreshSoon();
});

// ---------- projects ----------

/** Switch projects. Resolves once the new board is loaded. */
export function selectProject(id: number): Promise<void> {
  if (id === state.currentProjectId) return Promise.resolve();
  prefs.set('project', String(id));
  set({
    currentProjectId: id,
    boardLoaded: false,
    board: [],
    labels: [],
    filters: { colors: new Set(), labels: new Set(), creators: new Set(), assignees: new Set() },
  });
  return loadBoard();
}

export async function createProject(name: string) {
  const color = PROJ_COLORS[state.projects.length % PROJ_COLORS.length]!;
  try {
    const p = await api.createProject(name, color);
    prefs.set('project', String(p.id));
    set({ currentProjectId: p.id, board: [], boardLoaded: false });
    await loadProjects(false);
  } catch (e) {
    fail(e);
  }
}

export async function renameProject(id: number, name: string) {
  set({ projects: state.projects.map((p) => (p.id === id ? { ...p, name } : p)) });
  try {
    await api.updateProject(id, { name });
  } catch (e) {
    fail(e);
  }
  void loadProjects(true);
}

export async function recolorProject(id: number, color: string) {
  set({
    projects: state.projects.map((p) => (p.id === id ? { ...p, color } : p)),
    archived: state.archived.map((p) => (p.id === id ? { ...p, color } : p)),
  });
  try {
    await api.updateProject(id, { color });
  } catch (e) {
    fail(e);
  }
}

export async function archiveProject(id: number) {
  const proj = state.projects.find((p) => p.id === id);
  try {
    await api.archiveProject(id);
  } catch (e) {
    fail(e);
    return;
  }
  await loadProjects(false);
  toast(`Archived "${proj?.name ?? 'project'}"`, {
    actionLabel: 'Undo',
    onAction: () => {
      api
        .unarchiveProject(id)
        .then(() => {
          prefs.set('project', String(id));
          set({ currentProjectId: id });
          void loadProjects(false);
        })
        .catch(fail);
    },
  });
}

export async function unarchiveProject(id: number) {
  try {
    await api.unarchiveProject(id);
  } catch (e) {
    fail(e);
    return;
  }
  await loadProjects(false);
}

export async function deleteProject(id: number) {
  try {
    await api.deleteProject(id);
  } catch (e) {
    fail(e);
    return;
  }
  if (state.currentProjectId === id) set({ currentProjectId: null });
  await loadProjects(false);
}

export async function moveProject(id: number, dir: -1 | 1) {
  const ids = state.projects.map((p) => p.id);
  const idx = ids.indexOf(id);
  const to = idx + dir;
  if (idx === -1 || to < 0 || to >= ids.length) return;
  [ids[idx], ids[to]] = [ids[to]!, ids[idx]!];
  const byId = new Map(state.projects.map((p) => [p.id, p]));
  set({ projects: ids.map((i) => byId.get(i)!) });
  try {
    await api.reorderProjects(ids);
  } catch (e) {
    fail(e);
  }
}

// ---------- columns ----------

export async function addColumn(title: string) {
  const pid = state.currentProjectId;
  if (!pid) return;
  const color = COL_COLORS[state.board.length % COL_COLORS.length]!;
  try {
    const col = await api.createColumn(pid, title, color);
    set({ board: [...state.board, { ...col, cards: [] }] });
  } catch (e) {
    fail(e);
  }
}

export async function renameColumn(id: number, title: string) {
  set({ board: state.board.map((c) => (c.id === id ? { ...c, title } : c)) });
  try {
    await api.updateColumn(id, { title });
  } catch (e) {
    fail(e);
  }
}

export async function recolorColumn(id: number, color: string) {
  set({ board: state.board.map((c) => (c.id === id ? { ...c, color } : c)) });
  try {
    await api.updateColumn(id, { color });
  } catch (e) {
    fail(e);
  }
}

export async function deleteColumn(id: number) {
  set({ board: state.board.filter((c) => c.id !== id) });
  try {
    await api.deleteColumn(id);
    refreshSoon();
  } catch (e) {
    fail(e);
  }
}

export async function moveColumn(id: number, toIndex: number) {
  const fromIndex = state.board.findIndex((c) => c.id === id);
  if (fromIndex === -1) return;
  const next = [...state.board];
  const [col] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, col!);
  set({ board: next });
  try {
    await api.reorderColumns(next.map((c) => c.id));
  } catch (e) {
    fail(e);
  }
}

// ---------- cards ----------

function findCard(cardId: number): { col: number; row: number } | null {
  for (let ci = 0; ci < state.board.length; ci++) {
    const ri = state.board[ci]!.cards.findIndex((c) => c.id === cardId);
    if (ri !== -1) return { col: ci, row: ri };
  }
  return null;
}

export function getCard(cardId: number): Card | null {
  const idx = findCard(cardId);
  return idx ? state.board[idx.col]!.cards[idx.row]! : null;
}

/**
 * Turn a position among the *visible* cards of a column (what drag-and-drop
 * and keyboard moves see) into a position in the full list, when filters hide
 * some cards. Both exclude the card being moved.
 */
export function fullIndex(columnId: number, visibleIndex: number, movingId: number): number {
  const col = state.board.find((c) => c.id === columnId);
  if (!col) return visibleIndex;
  const all = col.cards.filter((c) => c.id !== movingId);
  const visible = all.filter((c) => cardMatchesFilters(c, state.filters));
  if (visible.length === all.length) return visibleIndex;
  if (visibleIndex < visible.length) return all.indexOf(visible[visibleIndex]!);
  const last = visible.at(-1);
  return last ? all.indexOf(last) + 1 : all.length;
}

/**
 * Optimistic move. `targetRow` is the index in the destination list
 * EXCLUDING the dragged card (what drop hit-testing naturally measures);
 * undefined = append. Converted to the server's including-self position.
 */
export function moveCard(cardId: number, toColumnId: number, targetRow?: number, opts?: { toastUndo?: boolean }) {
  const src = findCard(cardId);
  if (!src) return;
  const dstCol = state.board.findIndex((c) => c.id === toColumnId);
  if (dstCol === -1) return;
  const sameColumn = state.board[src.col]!.id === toColumnId;
  const srcColId = state.board[src.col]!.id;
  const srcRow = src.row;

  const board = state.board.map((c) => ({ ...c, cards: [...c.cards] }));
  const card = { ...board[src.col]!.cards[src.row]! };
  board[src.col]!.cards.splice(src.row, 1);
  let row = targetRow ?? board[dstCol]!.cards.length;
  row = Math.max(0, Math.min(row, board[dstCol]!.cards.length));
  if (sameColumn && row === src.row) return; // no-op
  card.column_id = toColumnId;
  board[dstCol]!.cards.splice(row, 0, card);
  set({ board });

  // Server positions are against the pre-move list (including the card).
  const apiPos = sameColumn && row > srcRow ? row + 1 : row;
  api
    .moveCard(cardId, toColumnId, apiPos)
    .then(() => refreshSoon())
    .catch(fail);

  if (!sameColumn && opts?.toastUndo !== false) {
    const toName = state.board[dstCol]!.title;
    toast(`Moved to ${toName}`, {
      actionLabel: 'Undo',
      onAction: () => moveCard(cardId, srcColId, srcRow, { toastUndo: false }),
    });
  }
}

export async function quickAddCard(columnId: number, title: string): Promise<void> {
  const t = title.trim();
  if (!t) return;
  try {
    const card = await api.createCard({ column_id: columnId, title: t });
    const enriched: Card = {
      ...card,
      attachment_count: 0,
      comment_count: 0,
      link_count: 0,
      labels: [],
      creator_email: state.user?.email ?? null,
      created_by: state.user?.id ?? null,
    };
    set({
      board: state.board.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, enriched] } : c)),
      justAddedCardId: card.id,
    });
    refreshSoon();
  } catch (e) {
    fail(e);
  }
}

export function updateCard(
  cardId: number,
  patch: Partial<Pick<Card, 'title' | 'description' | 'color' | 'due_date' | 'assignee_id' | 'assignee_email'>>,
) {
  const idx = findCard(cardId);
  if (!idx) return;
  const board = state.board.map((c) => ({ ...c, cards: [...c.cards] }));
  board[idx.col]!.cards[idx.row] = { ...board[idx.col]!.cards[idx.row]!, ...patch };
  set({ board });
  api
    .updateCard(cardId, patch)
    .then(() => refreshSoon())
    .catch(fail);
}

// Deferred deletes: the card disappears at once and the server delete happens
// when the undo window closes, so Undo never has to recreate the card.
const UNDO_MS = 5000;
const pendingDeletes = new Map<number, () => void>();
// Closing the tab inside the undo window still deletes.
window.addEventListener('pagehide', () => {
  for (const id of pendingDeletes.keys()) void api.deleteCard(id, true).catch(() => {});
  pendingDeletes.clear();
});

function stripPendingDeletes(board: BoardColumn[]): BoardColumn[] {
  if (!pendingDeletes.size) return board;
  return board.map((c) => ({ ...c, cards: c.cards.filter((card) => !pendingDeletes.has(card.id)) }));
}

export function deleteCardDeferred(cardId: number) {
  const idx = findCard(cardId);
  if (!idx) return;
  const colId = state.board[idx.col]!.id;
  const row = idx.row;
  const card = state.board[idx.col]!.cards[row]!;

  const board = state.board.map((c) => ({ ...c, cards: [...c.cards] }));
  board[idx.col]!.cards.splice(row, 1);
  set({ board });

  const commit = () => {
    if (!pendingDeletes.delete(cardId)) return;
    api
      .deleteCard(cardId)
      .then(() => refreshSoon())
      .catch(fail);
  };
  const timer = window.setTimeout(commit, UNDO_MS);
  const undo = () => {
    // Too late once the delete has been sent.
    if (!pendingDeletes.delete(cardId)) return;
    window.clearTimeout(timer);
    const b = state.board.map((c) => ({ ...c, cards: [...c.cards] }));
    const ci = b.findIndex((c) => c.id === colId);
    if (ci !== -1) b[ci]!.cards.splice(Math.min(row, b[ci]!.cards.length), 0, card);
    set({ board: b });
  };
  pendingDeletes.set(cardId, commit);
  toast(`Deleted "${card.title}"`, { actionLabel: 'Undo', onAction: undo, duration: UNDO_MS });
}

export function toggleCardLabel(cardId: number, label: Label) {
  const idx = findCard(cardId);
  if (!idx) return;
  const board = state.board.map((c) => ({ ...c, cards: [...c.cards] }));
  const card = { ...board[idx.col]!.cards[idx.row]! };
  const has = card.labels.some((l) => l.id === label.id);
  card.labels = has ? card.labels.filter((l) => l.id !== label.id) : [...card.labels, { id: label.id, name: label.name, color: label.color }];
  board[idx.col]!.cards[idx.row] = card;
  set({ board });
  (has ? api.removeCardLabel(cardId, label.id) : api.addCardLabel(cardId, label.id)).catch(fail);
}

export async function createLabel(name: string, color: string): Promise<Label | null> {
  const pid = state.currentProjectId;
  if (!pid) return null;
  try {
    const l = await api.createLabel(pid, name, color);
    set({ labels: [...state.labels, l].sort((a, b) => a.name.localeCompare(b.name)) });
    return l;
  } catch (e) {
    fail(e);
    return null;
  }
}

/** Rename or recolour a label everywhere it shows. */
export function updateLabel(id: number, patch: { name?: string; color?: string }) {
  set({
    labels: state.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)).sort((a, b) => a.name.localeCompare(b.name)),
    board: state.board.map((c) => ({
      ...c,
      cards: c.cards.map((card) => ({ ...card, labels: card.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    })),
  });
  api.updateLabel(id, patch).catch(fail);
}

export function deleteLabel(id: number) {
  set({
    labels: state.labels.filter((l) => l.id !== id),
    board: state.board.map((c) => ({ ...c, cards: c.cards.map((card) => ({ ...card, labels: card.labels.filter((l) => l.id !== id) })) })),
  });
  api.deleteLabel(id).catch(fail);
}

// ---------- filters ----------

export function setFilters(f: Filters) {
  set({
    filters: {
      colors: new Set(f.colors),
      labels: new Set(f.labels),
      creators: new Set(f.creators),
      assignees: new Set(f.assignees),
    },
  });
}
export function clearFilters() {
  set({ filters: { colors: new Set(), labels: new Set(), creators: new Set(), assignees: new Set() } });
}
export function cardMatchesFilters(card: Card, f: Filters): boolean {
  if (f.colors.size && !f.colors.has(card.color || '')) return false;
  if (f.labels.size && !card.labels.some((l) => f.labels.has(l.id))) return false;
  if (f.creators.size && !f.creators.has(card.creator_email || '')) return false;
  if (f.assignees.size && !f.assignees.has(card.assignee_email || '')) return false;
  return true;
}

// ---------- permissions ----------

export function canEdit(row: { created_by: number | null } | null | undefined): boolean {
  if (!row || !state.user) return false;
  if (state.user.is_admin) return true;
  return row.created_by != null && row.created_by === state.user.id;
}

export function clearJustAdded() {
  if (state.justAddedCardId !== null) set({ justAddedCardId: null });
}
