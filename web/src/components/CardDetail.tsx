import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment, AttachmentFull, Label } from '@shared/types';
import { api } from '../api.ts';
import {
  assignCard,
  canEdit,
  createLabel,
  deleteCardDeferred,
  deleteLabel,
  getCard,
  moveCard,
  refreshSoon,
  toast,
  toggleCardLabel,
  updateCard,
  updateLabel,
  useStore,
} from '../store.ts';
import { CARD_COLORS, formatDateTime, formatDue, dueState, isoDatePlusDays, labelTextColor, randomLabelColor } from '../lib/util.ts';
import { Markdown } from '../lib/markdown.tsx';
import { cardUrl, navigateToCard } from '../lib/router.ts';
import { Comments } from './Comments.tsx';
import { CardLinks } from './CardLinks.tsx';
import { CardFiles } from './CardFiles.tsx';
import { CardActivity } from './CardActivity.tsx';
import {
  Avatar,
  Calendar,
  ConfirmDialog,
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconCollapse,
  IconCopy,
  IconEdit,
  IconExpand,
  IconLink,
  IconMore,
  IconTag,
  IconTrash,
  IconUser,
  IconX,
  Modal,
  Popover,
  PromptDialog,
  anchorFromEl,
  flyoutFromEl,
  type Anchor,
} from './ui.tsx';

/**
 * The card view renders identically as a modal (from the board) or as a page
 * (from /card/:id) — only the chrome around it differs, so the whole body is
 * shared and just the wrapper swaps.
 */
function Wrapper({
  fullPage,
  onClose,
  className,
  labelledBy,
  children,
}: {
  fullPage: boolean;
  onClose: () => void;
  className: string;
  labelledBy: string;
  children: React.ReactNode;
}) {
  if (!fullPage) {
    return (
      <Modal onClose={onClose} className={className} labelledBy={labelledBy}>
        {children}
      </Modal>
    );
  }
  // Full page: real app chrome + a wide reading column, not a floating dialog.
  return (
    <div className="card-page">
      <div className="card-page-bar">
        <button className="chip" onClick={onClose}>
          <IconArrowLeft size={13} />
          Board
        </button>
      </div>
      <div className={`card-page-inner ${className}`}>{children}</div>
    </div>
  );
}

interface Props {
  cardId: number;
  onClose: () => void;
  onOpenCard: (id: number) => void;
  fullPage?: boolean;
}

/**
 * Only mounts the view once the card is in the store, so its editable state
 * starts from the real title and notes. If the card goes away (deleted by
 * someone else, or its board isn't loaded), the view closes itself.
 */
export function CardDetail(props: Props) {
  const { boardLoaded } = useStore();
  const exists = getCard(props.cardId) !== null;
  const { onClose } = props;
  useEffect(() => {
    if (!exists && boardLoaded) onClose();
  }, [exists, boardLoaded, onClose]);
  return exists ? <CardDetailView {...props} /> : null;
}

function CardDetailView({ cardId, onClose, onOpenCard, fullPage = false }: Props) {
  const { board, labels, directory, theme } = useStore();
  const card = getCard(cardId)!;
  const editable = canEdit(card);

  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.description ?? '');
  const [editingNotes, setEditingNotes] = useState(!card.description);
  const [colMenu, setColMenu] = useState<Anchor | null>(null);
  const [dueMenu, setDueMenu] = useState<Anchor | null>(null);
  const [labelMenu, setLabelMenu] = useState<Anchor | null>(null);
  const [colorMenu, setColorMenu] = useState<Anchor | null>(null);
  const [moreMenu, setMoreMenu] = useState<Anchor | null>(null);
  const [assignMenu, setAssignMenu] = useState<Anchor | null>(null);
  const [newLabel, setNewLabel] = useState(false);
  const [labelEdit, setLabelEdit] = useState<{ anchor: Anchor; label: Label } | null>(null);
  const [renamingLabel, setRenamingLabel] = useState<Label | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [openFile, setOpenFile] = useState<AttachmentFull | null>(null);
  const [newFile, setNewFile] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const savedRef = useRef({ title: card.title, notes: card.description ?? '' });

  const column = board.find((c) => c.cards.some((cc) => cc.id === cardId));

  const loadAttachments = useCallback(() => {
    api.attachments(cardId).then(setAttachments).catch(() => {});
  }, [cardId]);
  useEffect(loadAttachments, [loadAttachments]);

  // Debounced autosave.
  const save = useCallback(() => {
    if (!editable) return;
    const t = title.trim() || savedRef.current.title;
    if (t === savedRef.current.title && notes === savedRef.current.notes) return;
    savedRef.current = { title: t, notes };
    updateCard(cardId, { title: t, description: notes });
  }, [cardId, title, notes, editable]);

  useEffect(() => {
    const t = window.setTimeout(save, 1100);
    return () => window.clearTimeout(t);
  }, [save]);
  const saveLatest = useRef(save);
  saveLatest.current = save;
  useEffect(() => () => saveLatest.current(), []); // save on unmount (latest closure)

  // autosize textareas
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => autosize(titleRef.current), [title]);
  useEffect(() => autosize(notesRef.current), [notes, editingNotes]);

  const due = dueState(card.due_date);

  const setDue = (date: string | null) => {
    updateCard(cardId, { due_date: date });
    setDueMenu(null);
  };

  const close = () => {
    save();
    onClose();
  };

  return (
    <Wrapper onClose={close} className="detail" labelledBy="cd-title" fullPage={fullPage}>
      <div className="detail-head">
        <div className="detail-chips">
          <button className="chip" aria-haspopup="menu" aria-label="Column" onClick={(e) => setColMenu(anchorFromEl(e.currentTarget))}>
            <span className="dot" style={{ background: column?.color ?? 'var(--surface3)' }} />
            {column?.title ?? '—'}
            <IconChevronDown size={12} />
          </button>
          <button
            className={`chip ${due === 'overdue' ? 'is-danger' : due === 'today' ? 'is-warn' : ''}`}
            aria-haspopup="menu"
            disabled={!editable}
            onClick={(e) => setDueMenu(anchorFromEl(e.currentTarget))}
          >
            <IconClock size={13} />
            {card.due_date ? `Due ${formatDue(card.due_date)}` : 'Due date'}
          </button>
          <button
            className="chip"
            aria-haspopup="menu"
            disabled={!editable}
            title={card.assignee_email ? `Assigned to ${card.assignee_email}` : 'Unassigned'}
            onClick={(e) => setAssignMenu(anchorFromEl(e.currentTarget))}
          >
            {card.assignee_email ? (
              <>
                <Avatar email={card.assignee_email} size={16} />
                {card.assignee_email.split('@')[0]}
              </>
            ) : (
              <>
                <IconUser size={13} />
                Assign
              </>
            )}
          </button>
          {editable && (
            <button className="chip" aria-haspopup="menu" onClick={(e) => setLabelMenu(anchorFromEl(e.currentTarget))}>
              <IconTag size={13} />
              Labels
            </button>
          )}
          {editable && (
            <button className="chip" aria-haspopup="menu" onClick={(e) => setColorMenu(anchorFromEl(e.currentTarget))}>
              <span className="dot" style={{ background: card.color || 'var(--surface3)' }} />
              Color
            </button>
          )}
        </div>
        <div className="detail-actions">
          <button
            className="chip icon-chip"
            aria-label={fullPage ? 'Back to board' : 'Open full page'}
            title={fullPage ? 'Back to board' : 'Open full page'}
            onClick={() => (fullPage ? onClose() : navigateToCard(cardId))}
          >
            {fullPage ? <IconCollapse size={15} /> : <IconExpand size={15} />}
          </button>
          <button className="chip icon-chip" aria-label="More options" onClick={(e) => setMoreMenu(anchorFromEl(e.currentTarget, true))}>
            <IconMore size={15} />
          </button>
          {!fullPage && (
            <button className="chip icon-chip" aria-label="Close" title="Close (Esc)" onClick={close}>
              <IconX size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-main">
          <textarea
            id="cd-title"
            ref={titleRef}
            className="detail-title"
            value={title}
            readOnly={!editable}
            rows={1}
            maxLength={200}
            aria-label="Card title"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!editable) return;
                setEditingNotes(true);
                setTimeout(() => notesRef.current?.focus(), 0);
              }
            }}
          />

          {card.labels.length > 0 && (
            <div className="detail-labels">
              {card.labels.map((l) => (
                <span key={l.id} className="card-label" style={{ color: labelTextColor(l.color, theme), fontSize: '0.78rem' }}>
                  {l.name}
                </span>
              ))}
            </div>
          )}

          <div className="detail-notes">
            {editingNotes && editable ? (
              <textarea
                ref={notesRef}
                value={notes}
                placeholder="Add notes… (markdown supported)"
                aria-label="Notes"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  save();
                  if (notes.trim()) setEditingNotes(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    // Esc leaves the editor; a second Esc closes the card.
                    e.preventDefault();
                    save();
                    if (notes.trim()) setEditingNotes(false);
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
              />
            ) : notes.trim() ? (
              <div
                className={editable ? 'notes-view' : undefined}
                title={editable ? 'Click to edit' : undefined}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, input')) return;
                  if (editable) {
                    setEditingNotes(true);
                    setTimeout(() => notesRef.current?.focus(), 0);
                  }
                }}
              >
                {editable && (
                  <span className="notes-edit-btn" aria-hidden="true">
                    <IconEdit size={13} />
                  </span>
                )}
                <Markdown
                  text={notes}
                  onToggleTask={
                    editable
                      ? (updated) => {
                          setNotes(updated);
                          savedRef.current.notes = updated;
                          updateCard(cardId, { description: updated });
                        }
                      : undefined
                  }
                />
              </div>
            ) : editable ? (
              <div
                className="notes-placeholder"
                onClick={() => {
                  setEditingNotes(true);
                  setTimeout(() => notesRef.current?.focus(), 0);
                }}
              >
                Add notes… (markdown supported)
              </div>
            ) : null}
          </div>

          <CardFiles
            cardId={cardId}
            editable={editable}
            attachments={attachments}
            reload={loadAttachments}
            onOpenSnippet={(id) => {
              api.attachment(id).then(setOpenFile).catch(() => {});
            }}
            onNewSnippet={() => setNewFile(true)}
          />

          <Comments cardId={cardId} />
        </div>

        {/* On a wide full page this is a side column; elsewhere it stacks (see CSS). */}
        <div className="detail-side">
          <CardLinks cardId={cardId} onOpenCard={onOpenCard} />

          <CardActivity cardId={cardId} />

          <div className="detail-meta">
            <Avatar email={card.creator_email} size={18} />
            {card.creator_email && <span>{card.creator_email}</span>}
            <span>· Created {formatDateTime(card.created_at)}</span>
            {card.updated_at && <span>· Updated {formatDateTime(card.updated_at)}</span>}
            {!editable && <span>· Read-only (not your card)</span>}
            <button
              className="card-id-copy"
              title="Copy card ID"
              onClick={() => {
                // Copy a shareable link rather than the bare id — more useful in chat.
                navigator.clipboard?.writeText(cardUrl(card.id)).then(
                  () => toast(`Copied link to #${card.id}`),
                  () => {},
                );
              }}
            >
              #{card.id}
            </button>
          </div>
        </div>
      </div>

      {colMenu && (
        <Popover anchor={colMenu} onClose={() => setColMenu(null)}>
          {board.map((c) => (
            <button
              key={c.id}
              className="menu-item"
              onClick={() => {
                if (c.id !== card.column_id) moveCard(cardId, c.id, undefined, { toastUndo: false });
                setColMenu(null);
              }}
            >
              <span className="dot" style={{ background: c.color }} />
              <span className="grow">{c.title}</span>
              {c.id === card.column_id && <IconCheck size={14} />}
            </button>
          ))}
        </Popover>
      )}

      {dueMenu && (
        <Popover anchor={dueMenu} onClose={() => setDueMenu(null)}>
          <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem 0.25rem 0.375rem' }}>
            <button className="chip" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDue(isoDatePlusDays(0))}>
              Today
            </button>
            <button className="chip" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDue(isoDatePlusDays(1))}>
              Tomorrow
            </button>
            <button className="chip" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDue(isoDatePlusDays(7))}>
              Next week
            </button>
          </div>
          <Calendar value={card.due_date} onPick={(iso) => setDue(iso)} />
          {card.due_date && (
            <>
              <div className="menu-sep" />
              <button className="menu-item is-danger" onClick={() => setDue(null)}>
                Remove due date
              </button>
            </>
          )}
        </Popover>
      )}

      {assignMenu && (
        <Popover anchor={assignMenu} onClose={() => setAssignMenu(null)} width="16rem">
          <button
            className="menu-item"
            onClick={() => {
              assignCard(cardId, null);
              setAssignMenu(null);
            }}
          >
            <span className="grow">Unassigned</span>
            {!card.assignee_id && <IconCheck size={13} />}
          </button>
          {directory.map((u) => (
            <button
              key={u.id}
              className="menu-item"
              onClick={() => {
                assignCard(cardId, u);
                setAssignMenu(null);
              }}
            >
              <Avatar email={u.email} size={18} />
              <span className="grow">{u.email}</span>
              {card.assignee_id === u.id && <IconCheck size={13} />}
            </button>
          ))}
        </Popover>
      )}

      {labelMenu && (
        <Popover anchor={labelMenu} onClose={() => setLabelMenu(null)}>
          {labels.map((l) => {
            const on = card.labels.some((cl) => cl.id === l.id);
            return (
              <div key={l.id} className="menu-row">
                <button className="menu-item" aria-pressed={on} onClick={() => toggleCardLabel(cardId, l)}>
                  <span className="dot" style={{ background: l.color }} />
                  <span className="grow">{l.name}</span>
                  {on && <IconCheck size={14} />}
                </button>
                {canEdit(l) && (
                  <button
                    className="icon-btn"
                    aria-label={`Edit label ${l.name}`}
                    onClick={(e) => {
                      const el = e.currentTarget;
                      setLabelEdit((cur) => (cur?.label.id === l.id ? null : { anchor: flyoutFromEl(el), label: l }));
                    }}
                  >
                    <IconMore size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {labels.length > 0 && <div className="menu-sep" />}
          <button
            className="menu-item"
            onClick={() => {
              setLabelMenu(null);
              setNewLabel(true);
            }}
          >
            + New label…
          </button>
        </Popover>
      )}

      {labelEdit && (
        <Popover anchor={labelEdit.anchor} onClose={() => setLabelEdit(null)}>
          <button
            className="menu-item"
            onClick={() => {
              setRenamingLabel(labelEdit.label);
              setLabelEdit(null);
            }}
          >
            <IconEdit size={14} />
            Rename…
          </button>
          <div className="menu-label">Color</div>
          <div className="filter-row">
            {CARD_COLORS.slice(1).map((c) => (
              <button
                key={c}
                className={`swatch ${labelEdit.label.color === c ? 'is-on' : ''}`}
                style={{ background: c }}
                aria-label={`Set color ${c}`}
                onClick={() => {
                  updateLabel(labelEdit.label.id, { color: c });
                  setLabelEdit(null);
                }}
              />
            ))}
          </div>
          <div className="menu-sep" />
          <button
            className="menu-item is-danger"
            onClick={() => {
              setDeletingLabel(labelEdit.label);
              setLabelEdit(null);
            }}
          >
            <IconTrash size={14} />
            Delete…
          </button>
        </Popover>
      )}
      {renamingLabel && (
        <PromptDialog
          title="Rename label"
          initial={renamingLabel.name}
          okLabel="Save"
          onClose={() => setRenamingLabel(null)}
          onSubmit={(name) => updateLabel(renamingLabel.id, { name })}
        />
      )}
      {deletingLabel && (
        <ConfirmDialog
          title="Delete label"
          message={`Delete "${deletingLabel.name}"? It comes off every card in this project.`}
          onConfirm={() => deleteLabel(deletingLabel.id)}
          onClose={() => setDeletingLabel(null)}
        />
      )}

      {colorMenu && (
        <Popover anchor={colorMenu} onClose={() => setColorMenu(null)}>
          <div className="filter-row">
            {CARD_COLORS.map((c) => (
              <button
                key={c || 'none'}
                className={`swatch ${(card.color || '') === c ? 'is-on' : ''} ${c ? '' : 'none'}`}
                style={c ? { background: c } : undefined}
                aria-label={c ? `Color ${c}` : 'No color'}
                onClick={() => {
                  updateCard(cardId, { color: c });
                  setColorMenu(null);
                }}
              />
            ))}
          </div>
        </Popover>
      )}

      {moreMenu && (
        <Popover anchor={moreMenu} onClose={() => setMoreMenu(null)}>
          <button
            className="menu-item"
            onClick={() => {
              let md = `## ${card.title}`;
              if (card.description) md += `\n\n${card.description}`;
              void navigator.clipboard.writeText(md);
              toast('Copied as markdown');
              setMoreMenu(null);
            }}
          >
            <IconCopy size={14} />
            Copy as markdown
          </button>
          <button
            className="menu-item"
            onClick={() => {
              void navigator.clipboard.writeText(cardUrl(card.id));
              toast(`Copied link to #${card.id}`);
              setMoreMenu(null);
            }}
          >
            <IconLink size={14} />
            Copy link
          </button>
          {editable && (
            <button
              className="menu-item is-danger"
              onClick={() => {
                setMoreMenu(null);
                onClose();
                deleteCardDeferred(cardId);
              }}
            >
              <IconTrash size={14} />
              Delete card
            </button>
          )}
        </Popover>
      )}

      {newLabel && (
        <PromptDialog
          title="New label"
          placeholder="Label name…"
          okLabel="Create"
          onClose={() => setNewLabel(false)}
          onSubmit={(name) => {
            void createLabel(name, randomLabelColor()).then((l) => {
              if (l) toggleCardLabel(cardId, l);
            });
          }}
        />
      )}

      {newFile && (
        <FileEditor
          cardId={cardId}
          onClose={() => {
            setNewFile(false);
            loadAttachments();
            refreshSoon();
          }}
        />
      )}
      {openFile && (
        <FileEditor
          cardId={cardId}
          file={openFile}
          readOnly={!editable}
          onClose={() => {
            setOpenFile(null);
            loadAttachments();
            refreshSoon();
          }}
        />
      )}
    </Wrapper>
  );
}

// ---------- file viewer / editor ----------

function FileEditor({
  cardId,
  file,
  readOnly = false,
  onClose,
}: {
  cardId: number;
  file?: AttachmentFull;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const [filename, setFilename] = useState(file?.filename ?? '');
  const [content, setContent] = useState(file?.content ?? '');
  const savedRef = useRef({ filename: file?.filename ?? '', content: file?.content ?? '' });
  const idRef = useRef<number | null>(file?.id ?? null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = useCallback(async () => {
    if (readOnly) return;
    const name = filename.trim();
    if (!name || !content) return;
    if (name === savedRef.current.filename && content === savedRef.current.content) return;
    savedRef.current = { filename: name, content };
    try {
      if (idRef.current === null) {
        const att = await api.createAttachment(cardId, name, content);
        idRef.current = att.id;
      } else {
        await api.updateAttachment(idRef.current, { filename: name, content });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save file');
    }
  }, [cardId, filename, content, readOnly]);

  useEffect(() => {
    const t = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(t);
  }, [save]);

  const close = () => {
    void save().then(onClose);
  };

  return (
    <Modal onClose={close} className="file-editor-modal" labelledBy="file-name">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <input
          id="file-name"
          className="field mono"
          data-autofocus={!file}
          style={{ fontSize: '0.875rem', fontWeight: 600 }}
          placeholder="filename.ext"
          value={filename}
          readOnly={readOnly}
          onChange={(e) => setFilename(e.target.value)}
        />
        {idRef.current !== null && !readOnly && (
          <button className="btn danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            void navigator.clipboard.writeText(content);
            toast('Copied');
          }}
        >
          Copy
        </button>
      </div>
      <textarea
        className="code"
        value={content}
        readOnly={readOnly}
        placeholder="Paste or write content…"
        spellCheck={false}
        aria-label="File content"
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            setContent(content.slice(0, start) + '  ' + content.slice(ta.selectionEnd));
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + 2;
            });
          }
        }}
      />
      <div className="modal-actions">
        <button className="btn" onClick={close}>
          Done
        </button>
      </div>
      {confirmingDelete && (
        <ConfirmInline
          onConfirm={() => {
            if (idRef.current !== null) {
              api.deleteAttachment(idRef.current).then(onClose).catch(() => onClose());
            } else onClose();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  );
}

function ConfirmInline({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
      <span style={{ fontSize: '0.8125rem', color: 'var(--text2)' }}>Delete this file permanently?</span>
      <button className="btn ghost" onClick={onCancel}>
        Cancel
      </button>
      <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={onConfirm}>
        Delete
      </button>
    </div>
  );
}
