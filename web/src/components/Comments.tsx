import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comment } from '@shared/types';
import { api } from '../api.ts';
import { refreshSoon, toast, useStore } from '../store.ts';
import { timeAgo } from '../lib/util.ts';
import { Markdown } from '../lib/markdown.tsx';
import { Avatar, ConfirmDialog, IconTrash, IconEdit } from './ui.tsx';

/**
 * Card comment thread.
 *
 * Posting is optimistic: the comment appears immediately with a temporary
 * negative id, then is swapped for the server row. On failure it's rolled back
 * and the text is restored to the composer so nothing is silently lost.
 */
export function Comments({ cardId }: { cardId: number }) {
  const { user } = useStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    api
      .comments(cardId)
      .then((rows) => {
        setComments(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [cardId]);
  useEffect(load, [load]);

  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 320) + 'px';
  };
  useEffect(() => autosize(composerRef.current), [draft]);
  useEffect(() => autosize(editRef.current), [editDraft, editingId]);

  const post = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setDraft('');
    const tempId = -Date.now();
    const optimistic: Comment = {
      id: tempId,
      card_id: cardId,
      body,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      edited_at: null,
      created_by: user?.id ?? null,
      creator_email: user?.email ?? null,
    };
    setComments((cs) => [...cs, optimistic]);
    try {
      const saved = await api.createComment(cardId, body);
      setComments((cs) => cs.map((c) => (c.id === tempId ? saved : c)));
      refreshSoon(); // keep the board's comment badge in sync
    } catch (e) {
      setComments((cs) => cs.filter((c) => c.id !== tempId));
      setDraft(body); // don't lose what they typed
      toast(e instanceof Error ? e.message : 'Could not post comment');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (c: Comment) => {
    const body = editDraft.trim();
    setEditingId(null);
    if (!body || body === c.body) return;
    const before = comments;
    setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, body, edited_at: 'now' } : x)));
    try {
      const saved = await api.updateComment(c.id, body);
      setComments((cs) => cs.map((x) => (x.id === c.id ? saved : x)));
    } catch (e) {
      setComments(before);
      toast(e instanceof Error ? e.message : 'Could not save edit');
    }
  };

  const remove = async (c: Comment) => {
    const before = comments;
    setComments((cs) => cs.filter((x) => x.id !== c.id));
    try {
      await api.deleteComment(c.id);
      refreshSoon();
    } catch (e) {
      setComments(before);
      toast(e instanceof Error ? e.message : 'Could not delete comment');
    }
  };

  return (
    <div className="detail-comments">
      <h3>
        Comments
        {comments.length > 0 && <span className="count">{comments.length}</span>}
      </h3>

      {loaded && comments.length === 0 && <p className="comments-empty">No comments yet.</p>}

      {comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => {
            const mine = user != null && c.created_by === user.id;
            const canDelete = mine || !!user?.is_admin;
            const pending = c.id < 0;
            return (
              <li key={c.id} className={'comment' + (pending ? ' pending' : '')}>
                <Avatar email={c.creator_email} size={24} />
                <div className="comment-main">
                  <div className="comment-head">
                    <span className="who">{c.creator_email ?? 'unknown'}</span>
                    <span className="when">{pending ? 'sending…' : timeAgo(c.created_at)}</span>
                    {c.edited_at && !pending && <span className="edited">edited</span>}
                    {!pending && (mine || canDelete) && (
                      <span className="comment-actions">
                        {mine && (
                          <button
                            className="icon-btn"
                            aria-label="Edit comment"
                            onClick={() => {
                              setEditingId(c.id);
                              setEditDraft(c.body);
                              setTimeout(() => editRef.current?.focus(), 0);
                            }}
                          >
                            <IconEdit size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button className="icon-btn danger" aria-label="Delete comment" onClick={() => setConfirmDelete(c)}>
                            <IconTrash size={13} />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  {editingId === c.id ? (
                    <div className="comment-edit">
                      <textarea
                        ref={editRef}
                        value={editDraft}
                        aria-label="Edit comment"
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault(); // cancel the edit, not the card
                            setEditingId(null);
                          }
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit(c);
                          }
                        }}
                      />
                      <div className="comment-edit-actions">
                        <button className="btn ghost sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                        <button className="btn sm" onClick={() => saveEdit(c)}>
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="comment-body">
                      <Markdown text={c.body} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="comment-composer">
        <Avatar email={user?.email ?? null} size={24} />
        <div className="composer-main">
          <textarea
            ref={composerRef}
            value={draft}
            rows={1}
            placeholder="Write a comment…"
            aria-label="Write a comment"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline. Esc with an unsent draft
              // only leaves the field, so the card doesn't close and lose it.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                post();
              }
              if (e.key === 'Escape' && draft) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          {draft.trim() && (
            <div className="composer-actions">
              <span className="hint">Enter to send · Shift+Enter for newline · markdown supported</span>
              <button className="btn sm" disabled={busy} onClick={post}>
                Comment
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete comment"
          message="This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => remove(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
