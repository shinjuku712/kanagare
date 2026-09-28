import type {
  ActivityEntry,
  AdminUserRow,
  AgendaItem,
  Attachment,
  AttachmentFull,
  BoardColumn,
  Card,
  CardLink,
  CardLinkType,
  CardLinkView,
  CheckResponse,
  Comment,
  DirectoryUser,
  GraphResponse,
  Label,
  LoginResponse,
  Project,
  ProjectCounts,
  SearchResult,
  Template,
  User,
} from '@shared/types';

export class ApiFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<T> {
  const res = await fetch('/api' + path, {
    method: init?.method ?? 'GET',
    keepalive: init?.keepalive,
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiFailure(res.status, typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  // auth
  login: (email: string, password: string) => req<LoginResponse>('/login', { method: 'POST', body: { email, password } }),
  logout: () => req('/logout', { method: 'POST' }),
  check: () => req<CheckResponse>('/check'),

  // projects
  projects: (includeArchived = true) => req<Project[]>(`/projects${includeArchived ? '?archived=1' : ''}`),
  projectCounts: () => req<ProjectCounts>('/projects/counts'),
  createProject: (name: string, color: string) => req<Project>('/projects', { method: 'POST', body: { name, color } }),
  updateProject: (id: number, patch: { name?: string; color?: string }) => req(`/projects/${id}`, { method: 'PUT', body: patch }),
  reorderProjects: (order: number[]) => req('/projects/reorder', { method: 'PUT', body: { order } }),
  archiveProject: (id: number) => req(`/projects/${id}/archive`, { method: 'PUT' }),
  unarchiveProject: (id: number) => req(`/projects/${id}/unarchive`, { method: 'PUT' }),
  deleteProject: (id: number) => req(`/projects/${id}`, { method: 'DELETE' }),

  // board
  board: (projectId: number) => req<BoardColumn[]>(`/projects/${projectId}/board`),

  // columns
  createColumn: (projectId: number, title: string, color: string) =>
    req<BoardColumn>('/columns', { method: 'POST', body: { project_id: projectId, title, color } }),
  updateColumn: (id: number, patch: { title?: string; color?: string }) => req(`/columns/${id}`, { method: 'PUT', body: patch }),
  reorderColumns: (order: number[]) => req('/columns/reorder', { method: 'PUT', body: { order } }),
  deleteColumn: (id: number) => req(`/columns/${id}`, { method: 'DELETE' }),

  // cards
  createCard: (body: { column_id: number; title: string; description?: string; color?: string; due_date?: string | null }) =>
    req<Card>('/cards', { method: 'POST', body }),
  updateCard: (
    id: number,
    patch: { title?: string; description?: string; color?: string; due_date?: string | null; assignee_id?: number | null },
  ) =>
    req(`/cards/${id}`, { method: 'PUT', body: patch }),
  moveCard: (cardId: number, targetColumnId: number, newPosition: number) =>
    req('/cards/move', { method: 'PUT', body: { cardId, targetColumnId, newPosition } }),
  /** keepalive lets a delete still in its undo window finish while the page closes. */
  deleteCard: (id: number, keepalive = false) => req(`/cards/${id}`, { method: 'DELETE', keepalive }),
  moveCardToNamed: (id: number, column: string) => req(`/cards/${id}/move-to`, { method: 'PUT', body: { column } }),

  // labels
  labels: (projectId: number) => req<Label[]>(`/projects/${projectId}/labels`),
  createLabel: (projectId: number, name: string, color: string) =>
    req<Label>(`/projects/${projectId}/labels`, { method: 'POST', body: { name, color } }),
  updateLabel: (id: number, patch: { name?: string; color?: string }) => req(`/labels/${id}`, { method: 'PUT', body: patch }),
  deleteLabel: (id: number) => req(`/labels/${id}`, { method: 'DELETE' }),
  addCardLabel: (cardId: number, labelId: number) => req(`/cards/${cardId}/labels`, { method: 'POST', body: { label_id: labelId } }),
  removeCardLabel: (cardId: number, labelId: number) => req(`/cards/${cardId}/labels/${labelId}`, { method: 'DELETE' }),

  // attachments
  attachments: (cardId: number) => req<Attachment[]>(`/cards/${cardId}/attachments`),
  attachment: (id: number) => req<AttachmentFull>(`/attachments/${id}`),
  createAttachment: (cardId: number, filename: string, content: string) =>
    req<AttachmentFull>(`/cards/${cardId}/attachments`, { method: 'POST', body: { filename, content } }),
  updateAttachment: (id: number, patch: { filename?: string; content?: string; language?: string }) =>
    req(`/attachments/${id}`, { method: 'PUT', body: patch }),
  deleteAttachment: (id: number) => req(`/attachments/${id}`, { method: 'DELETE' }),

  // comments
  comments: (cardId: number) => req<Comment[]>(`/cards/${cardId}/comments`),
  createComment: (cardId: number, body: string) => req<Comment>(`/cards/${cardId}/comments`, { method: 'POST', body: { body } }),
  updateComment: (id: number, body: string) => req<Comment>(`/comments/${id}`, { method: 'PUT', body: { body } }),
  deleteComment: (id: number) => req(`/comments/${id}`, { method: 'DELETE' }),

  // file attachments (binary)
  uploadFile: async (cardId: number, file: File): Promise<Attachment> => {
    const res = await fetch(`/api/cards/${cardId}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        // Header must be latin-1 safe; the server URI-decodes it.
        'X-Filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiFailure(res.status, typeof data.error === 'string' ? data.error : `Upload failed (${res.status})`);
    return data as unknown as Attachment;
  },
  fileUrl: (id: number, download = false) => `/api/files/${id}${download ? '?download=1' : ''}`,
  deleteFile: (id: number) => req(`/files/${id}`, { method: 'DELETE' }),

  // directory (for assignee pickers)
  users: () => req<DirectoryUser[]>('/users'),

  // links / graph
  cardLinks: (cardId: number) => req<CardLinkView[]>(`/cards/${cardId}/links`),
  createLink: (cardId: number, toCardId: number, type: CardLinkType) =>
    req<CardLink>(`/cards/${cardId}/links`, { method: 'POST', body: { to_card_id: toCardId, type } }),
  deleteLink: (id: number) => req(`/links/${id}`, { method: 'DELETE' }),
  graph: (projectId: number) => req<GraphResponse>(`/projects/${projectId}/graph`),

  // templates
  templates: (projectId?: number) => req<Template[]>(`/templates${projectId ? `?project=${projectId}` : ''}`),
  createTemplate: (body: { name: string; project_id?: number | null; title?: string; description?: string; color?: string; label_names?: string[] }) =>
    req<Template>('/templates', { method: 'POST', body }),
  deleteTemplate: (id: number) => req(`/templates/${id}`, { method: 'DELETE' }),
  applyTemplate: (id: number, columnId: number, title?: string) =>
    req<Card>(`/templates/${id}/apply`, { method: 'POST', body: { column_id: columnId, title } }),

  // activity
  cardActivity: (cardId: number) => req<ActivityEntry[]>(`/activity?card=${cardId}`),

  // search / agenda
  search: (q: string) => req<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  agenda: () => req<AgendaItem[]>('/agenda'),

  // admin
  adminUsers: () => req<AdminUserRow[]>('/admin/users'),
  adminCreateUser: (email: string, password: string, is_admin: boolean) =>
    req<User>('/admin/users', { method: 'POST', body: { email, password, is_admin } }),
  adminSetPassword: (id: number, password: string) => req(`/admin/users/${id}/password`, { method: 'PUT', body: { password } }),
  adminSetRole: (id: number, is_admin: boolean) => req(`/admin/users/${id}/admin`, { method: 'PUT', body: { is_admin } }),
  adminDeleteUser: (id: number) => req(`/admin/users/${id}`, { method: 'DELETE' }),
};
