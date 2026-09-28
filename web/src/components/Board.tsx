import { memo, useEffect, useRef, useState } from 'react';
import type { BoardColumn, Card } from '@shared/types';
import {
  addColumn,
  canEdit,
  getState,
  cardMatchesFilters,
  clearJustAdded,
  deleteCardDeferred,
  deleteColumn,
  fullIndex,
  moveCard,
  moveColumn,
  quickAddCard,
  recolorColumn,
  renameColumn,
  useStore,
  type Filters,
} from '../store.ts';
import { lastDragEndedAt, useCardDrag, useFlip } from '../lib/dnd.ts';
import { TemplatePicker } from './Templates.tsx';
import { cardTint, dueState, formatDue, labelTextColor, markdownStripped, taskProgress, COL_COLORS } from '../lib/util.ts';
import { Avatar, ConfirmDialog, IconCheckSquare, IconClock, IconComment, IconFile, IconLink, IconMore, IconPlus, Popover, PromptDialog, anchorFromEl, type Anchor } from './ui.tsx';

export function Board({ onOpenCard }: { onOpenCard: (cardId: number) => void }) {
  const { board, boardLoaded, filters, currentProjectId, justAddedCardId, theme } = useStore();
  const boardRef = useRef<HTMLDivElement>(null);
  const { dragCardId, placeholder } = useCardDrag(boardRef);
  const [addingColumn, setAddingColumn] = useState(false);
  const [activeColId, setActiveColId] = useState<number | null>(null);

  // Mobile pager: track which column page is visible.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onScroll = () => {
      if (window.innerWidth > 700) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      const col = board[Math.max(0, Math.min(idx, board.length - 1))];
      if (col) setActiveColId(col.id);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [board]);

  // Keep the mobile quick-add pointed at a column of the current board.
  useEffect(() => {
    if (!board.some((c) => c.id === activeColId)) setActiveColId(board[0]?.id ?? null);
  }, [board, activeColId]);

  useEffect(() => {
    if (justAddedCardId !== null) {
      const t = setTimeout(clearJustAdded, 400);
      return () => clearTimeout(t);
    }
  }, [justAddedCardId]);

  if (!currentProjectId && boardLoaded) {
    return (
      <div className="empty-state">
        <h3>No projects yet</h3>
        <p>Projects group your columns and cards. Create one from the switcher in the top left.</p>
      </div>
    );
  }

  const scrollToCol = (colId: number) => {
    const el = boardRef.current?.querySelector<HTMLElement>(`.col[data-col-wrap="${colId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setActiveColId(colId);
  };

  return (
    <>
      <div className="pager" role="tablist" aria-label="Columns">
        {board.map((col) => (
          <button
            key={col.id}
            role="tab"
            aria-selected={col.id === activeColId}
            className={`pager-chip ${col.id === activeColId ? 'is-active' : ''}`}
            onClick={() => scrollToCol(col.id)}
          >
            {col.title}
            <span className="pc-n">{col.cards.length}</span>
          </button>
        ))}
      </div>

      <div className="board" ref={boardRef} onPointerDown={onBoardPan}>
        {board.map((col) => (
          <Column
            key={col.id}
            col={col}
            filters={filters}
            dragCardId={dragCardId}
            placeholder={placeholder?.colId === col.id ? placeholder : null}
            justAddedCardId={justAddedCardId}
            theme={theme}
            onOpenCard={onOpenCard}
          />
        ))}
        {boardLoaded && (
          <div className="add-col-lane">
            <button className="add-col-btn" onClick={() => setAddingColumn(true)}>
              + Add column
            </button>
          </div>
        )}
      </div>

      <QuickBar activeColId={activeColId} onOpenCard={onOpenCard} />

      {addingColumn && (
        <PromptDialog title="New column" placeholder="Column title…" onClose={() => setAddingColumn(false)} onSubmit={(t) => void addColumn(t)} />
      )}
    </>
  );
}

/** Mouse-drag on empty board space pans the board (and the column under the pointer). */
function onBoardPan(e: React.PointerEvent<HTMLDivElement>) {
  if (e.button !== 0 || e.pointerType !== 'mouse') return;
  const target = e.target as HTMLElement;
  if (target.closest('[data-card-id], button, input, textarea, select, a, .composer, .card-placeholder')) return;
  const board = e.currentTarget;
  const list = target.closest<HTMLElement>('[data-cards-scroll]');
  const startX = e.clientX;
  const startY = e.clientY;
  const startLeft = board.scrollLeft;
  const startTop = list?.scrollTop ?? 0;
  let moved = false;
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > 3) {
      moved = true;
      board.classList.add('is-panning');
      document.body.style.userSelect = 'none';
    }
    if (!moved) return;
    board.scrollLeft = startLeft - dx;
    if (list) list.scrollTop = startTop - dy;
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    board.classList.remove('is-panning');
    document.body.style.userSelect = '';
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ---------- column ----------

function Column({
  col,
  filters,
  dragCardId,
  placeholder,
  justAddedCardId,
  theme,
  onOpenCard,
}: {
  col: BoardColumn;
  filters: Filters;
  dragCardId: number | null;
  placeholder: { index: number; height: number } | null;
  justAddedCardId: number | null;
  theme: 'dark' | 'light';
  onOpenCard: (cardId: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [composing, setComposing] = useState(false);
  const [templates, setTemplates] = useState(false);
  const editable = canEdit(col);
  useFlip(listRef);

  const visible = col.cards.filter((c) => cardMatchesFilters(c, filters));
  const hidden = col.cards.length - visible.length;
  const rendered = visible.filter((c) => c.id !== dragCardId);

  const items: React.ReactNode[] = [];
  rendered.forEach((card, i) => {
    if (placeholder && placeholder.index === i) {
      items.push(<div key="ph" className="card-placeholder" style={{ height: placeholder.height }} />);
    }
    items.push(
      <CardItem key={card.id} card={card} theme={theme} justAdded={card.id === justAddedCardId} colId={col.id} onOpen={onOpenCard} />,
    );
  });
  if (placeholder && placeholder.index >= rendered.length) {
    items.push(<div key="ph" className="card-placeholder" style={{ height: placeholder.height }} />);
  }

  return (
    <section className="col" data-col-wrap={col.id} data-col-id={col.id} aria-label={col.title}>
      <div className="col-head">
        <span className="dot" style={{ background: col.color }} />
        <input
          className="col-title"
          defaultValue={col.title}
          readOnly={!editable}
          aria-label={`Column ${col.title}`}
          title={editable ? undefined : 'Only the creator or an admin can rename this column'}
          data-no-drag
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (editable && v && v !== col.title) void renameColumn(col.id, v);
            else e.target.value = col.title;
          }}
        />
        <span className="col-count">{hidden > 0 ? `${visible.length}/${col.cards.length}` : col.cards.length}</span>
        <button
          className="col-menu-btn"
          aria-label={`Column options for ${col.title}`}
          aria-expanded={!!menu}
          data-no-drag
          onClick={(e) => setMenu(anchorFromEl(e.currentTarget, true))}
        >
          <IconMore size={15} />
        </button>
      </div>

      <div className="col-cards" ref={listRef} data-cards-scroll>
        {items}
      </div>

      {composing ? (
        <Composer colId={col.id} onDone={() => setComposing(false)} />
      ) : (
        <button className="col-add" onClick={() => setComposing(true)}>
          <IconPlus size={13} /> New card
        </button>
      )}

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <ColumnMenu
            col={col}
            editable={editable}
            close={() => setMenu(null)}
            onDelete={() => setConfirmDelete(true)}
            onTemplates={() => {
              setMenu(null);
              setTemplates(true);
            }}
          />
        </Popover>
      )}
      {templates && (
        <TemplatePicker columnId={col.id} onClose={() => setTemplates(false)} onCreated={onOpenCard} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete column"
          message={`Delete "${col.title}"${col.cards.length ? ` and its ${col.cards.length} card${col.cards.length === 1 ? '' : 's'}` : ''}? This cannot be undone.`}
          onConfirm={() => void deleteColumn(col.id)}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}

function ColumnMenu({ col, editable, close, onDelete, onTemplates }: { col: BoardColumn; editable: boolean; close: () => void; onDelete: () => void; onTemplates: () => void }) {
  const { board } = useStore();
  const idx = board.findIndex((c) => c.id === col.id);
  return (
    <>
      {!editable && (
        <div className="menu-hint">
          Owned by {col.creator_email ?? 'system'}.<br />
          Only the creator or an admin can edit.
        </div>
      )}
      <button className="menu-item" onClick={onTemplates}>
        New card from template…
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item"
        disabled={idx <= 0}
        onClick={() => {
          void moveColumn(col.id, idx - 1);
          close();
        }}
      >
        Move left
      </button>
      <button
        className="menu-item"
        disabled={idx >= board.length - 1}
        onClick={() => {
          void moveColumn(col.id, idx + 1);
          close();
        }}
      >
        Move right
      </button>
      {editable && (
        <>
          <div className="menu-sep" />
          <div className="menu-label">Color</div>
          <div className="filter-row">
            {COL_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${col.color === c ? 'is-on' : ''}`}
                style={{ background: c }}
                aria-label={`Set color ${c}`}
                onClick={() => {
                  void recolorColumn(col.id, c);
                  close();
                }}
              />
            ))}
          </div>
          <div className="menu-sep" />
          <button
            className="menu-item is-danger"
            onClick={() => {
              close();
              onDelete();
            }}
          >
            Delete column…
          </button>
        </>
      )}
    </>
  );
}

// ---------- inline composer ----------

function Composer({ colId, onDone }: { colId: number; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = () => {
    const v = ref.current?.value.trim();
    if (v) {
      void quickAddCard(colId, v);
      ref.current!.value = '';
      ref.current?.focus();
    } else onDone();
  };
  return (
    <div className="composer">
      <textarea
        ref={ref}
        rows={2}
        placeholder="What needs to be done?"
        aria-label="New card title"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') onDone();
        }}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v) void quickAddCard(colId, v);
          onDone();
        }}
      />
      <div className="composer-hint">Enter to add · Esc to close</div>
    </div>
  );
}

// ---------- card ----------

const CardItem = memo(function CardItem({
  card,
  theme,
  justAdded,
  colId,
  onOpen,
}: {
  card: Card;
  theme: 'dark' | 'light';
  justAdded: boolean;
  colId: number;
  onOpen: (cardId: number) => void;
}) {
  const due = dueState(card.due_date);
  const desc = card.description ? markdownStripped(card.description) : '';
  const tasks = card.description ? taskProgress(card.description) : null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const { board, filters } = getState();
    const colIdx = board.findIndex((c) => c.id === colId);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(card.id);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit(card)) {
      e.preventDefault();
      deleteCardDeferred(card.id);
    } else if (e.key === '[' && colIdx > 0) {
      e.preventDefault();
      moveCard(card.id, board[colIdx - 1]!.id);
    } else if (e.key === ']' && colIdx !== -1 && colIdx < board.length - 1) {
      e.preventDefault();
      moveCard(card.id, board[colIdx + 1]!.id);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const col = board[colIdx];
      if (!col) return;
      // Step past the neighbouring *visible* card; filters may hide others.
      const visible = col.cards.filter((c) => c.id === card.id || cardMatchesFilters(c, filters));
      const row = visible.findIndex((c) => c.id === card.id);
      const target = e.key === 'ArrowUp' ? row - 1 : row + 1;
      if (target >= 0 && target < visible.length) {
        moveCard(card.id, colId, fullIndex(colId, target, card.id), { toastUndo: false });
      }
    }
  };

  return (
    <div
      className={`card ${justAdded ? 'just-added' : ''}`}
      style={cardTint(card.color)}
      data-card-id={card.id}
      data-flip-id={`card-${card.id}`}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      onKeyDown={onKeyDown}
      onClick={() => {
        if (Date.now() - lastDragEndedAt < 250) return;
        onOpen(card.id);
      }}
    >
      <div className="card-title">{card.title}</div>
      {desc && <div className="card-desc">{desc}</div>}
      <div className="card-meta">
        <span className="card-id">#{card.id}</span>
        {card.labels.slice(0, 3).map((l) => (
          <span key={l.id} className="card-label" style={{ color: labelTextColor(l.color, theme) }}>
            {l.name}
          </span>
        ))}
        <span className="grow" />
        {tasks && tasks.total > 0 && (
          <span className={`card-files ${tasks.done === tasks.total ? 'all-done' : ''}`} title={`${tasks.done} of ${tasks.total} tasks done`}>
            <IconCheckSquare size={11} /> {tasks.done}/{tasks.total}
          </span>
        )}
        {card.link_count > 0 && (
          <span className="card-files" title={`${card.link_count} link${card.link_count === 1 ? '' : 's'}`}>
            <IconLink size={11} /> {card.link_count}
          </span>
        )}
        {card.comment_count > 0 && (
          <span className="card-files" title={`${card.comment_count} comment${card.comment_count === 1 ? '' : 's'}`}>
            <IconComment size={11} /> {card.comment_count}
          </span>
        )}
        {card.attachment_count > 0 && (
          <span className="card-files">
            <IconFile size={11} /> {card.attachment_count}
          </span>
        )}
        {card.due_date && due && (
          <span className={`card-due ${due === 'overdue' ? 'overdue' : due === 'today' ? 'today' : ''}`}>
            <IconClock size={11} />
            {formatDue(card.due_date)}
          </span>
        )}
        {/* Assignee is who's responsible, so it wins the avatar slot; an
            unassigned card still shows its creator so the face is never empty. */}
        <Avatar email={card.assignee_email ?? card.creator_email} size={17} />
      </div>
    </div>
  );
});

// ---------- mobile quick add ----------

function QuickBar({ activeColId, onOpenCard }: { activeColId: number | null; onOpenCard: (id: number) => void }) {
  const [value, setValue] = useState('');
  const [templates, setTemplates] = useState(false);
  const submit = () => {
    const v = value.trim();
    if (!v || !activeColId) return;
    void quickAddCard(activeColId, v);
    setValue('');
  };
  return (
    <div className="quickbar">
      {/* Column menus are hidden on phones, so templates are reached from here. */}
      {!value.trim() && activeColId && (
        <button className="qb-tpl" aria-label="New card from template" onClick={() => setTemplates(true)}>
          <IconFile size={16} />
        </button>
      )}
      {templates && activeColId && (
        <TemplatePicker columnId={activeColId} onClose={() => setTemplates(false)} onCreated={onOpenCard} />
      )}
      <input
        value={value}
        placeholder="Add a card…"
        aria-label="Add a card to the current column"
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      {value.trim() && (
        <button className="qb-send" aria-label="Add card" onClick={submit}>
          <IconPlus size={18} />
        </button>
      )}
    </div>
  );
}
