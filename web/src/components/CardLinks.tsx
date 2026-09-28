import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardLinkType, CardLinkView } from '@shared/types';
import { api } from '../api.ts';
import { canEdit, getCard, refreshSoon, toast, useStore } from '../store.ts';
import { IconPlus, IconX, Popover, anchorFromEl, type Anchor } from './ui.tsx';

/** Human phrasing per link type and direction — reads as a sentence about *this* card. */
const PHRASE: Record<CardLinkType, { outgoing: string; incoming: string }> = {
  relates: { outgoing: 'Relates to', incoming: 'Relates to' },
  blocks: { outgoing: 'Blocks', incoming: 'Blocked by' },
  parent: { outgoing: 'Subtasks', incoming: 'Subtask of' },
};

/** Order groups appear in — blockers first, they're the ones that matter most. */
const GROUP_ORDER = ['Blocked by', 'Blocks', 'Subtask of', 'Subtasks', 'Relates to'];

export function CardLinks({ cardId, onOpenCard }: { cardId: number; onOpenCard: (id: number) => void }) {
  const { board } = useStore();
  const card = getCard(cardId);
  const editable = canEdit(card);

  const [links, setLinks] = useState<CardLinkView[]>([]);
  const [picker, setPicker] = useState<Anchor | null>(null);
  const [type, setType] = useState<CardLinkType>('relates');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.cardLinks(cardId).then(setLinks).catch(() => {});
  }, [cardId]);
  useEffect(load, [load]);

  // Candidates: every other card on this board, minus ones already linked.
  const linkedIds = useMemo(() => new Set(links.map((l) => l.other_card_id)), [links]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { id: number; title: string; column: string }[] = [];
    for (const col of board) {
      for (const c of col.cards) {
        if (c.id === cardId || linkedIds.has(c.id)) continue;
        if (q && !c.title.toLowerCase().includes(q) && String(c.id) !== q.replace('#', '')) continue;
        out.push({ id: c.id, title: c.title, column: col.title });
      }
    }
    return out.slice(0, 40);
  }, [board, cardId, linkedIds, query]);

  const add = async (toCardId: number) => {
    setPicker(null);
    setQuery('');
    try {
      await api.createLink(cardId, toCardId, type);
      load();
      refreshSoon();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not link cards');
    }
  };

  const remove = async (l: CardLinkView) => {
    const before = links;
    setLinks((ls) => ls.filter((x) => x.id !== l.id));
    try {
      await api.deleteLink(l.id);
      refreshSoon();
    } catch (e) {
      setLinks(before);
      toast(e instanceof Error ? e.message : 'Could not remove link');
    }
  };

  // Group by the phrase so "Blocked by" and "Blocks" are separate sections.
  const groups = useMemo(() => {
    const m = new Map<string, CardLinkView[]>();
    for (const l of links) {
      const key = PHRASE[l.type][l.direction];
      const list = m.get(key) ?? [];
      list.push(l);
      m.set(key, list);
    }
    return [...m.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [links]);

  if (!links.length && !editable) return null;

  return (
    <div className="detail-links">
      <h3>
        Links
        {links.length > 0 && <span className="count">{links.length}</span>}
        {editable && (
          <button
            className="icon-btn"
            aria-label="Link a card"
            onClick={(e) => {
              setPicker(anchorFromEl(e.currentTarget));
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <IconPlus size={14} />
          </button>
        )}
      </h3>

      {groups.map(([label, items]) => (
        <div key={label} className="link-group">
          <div className="link-group-label">{label}</div>
          {items.map((l) => (
            <div key={l.id} className="link-row">
              <button
                className="link-open"
                onClick={() => onOpenCard(l.other_card_id)}
                title={`${l.other_project_name} · ${l.other_column_title}`}
              >
                <span className="link-id">#{l.other_card_id}</span>
                {l.other_color && <span className="dot" style={{ background: l.other_color }} />}
                <span className="link-title">{l.other_title}</span>
                <span className="link-col">{l.other_column_title}</span>
              </button>
              {editable && (
                <button className="icon-btn danger" aria-label="Remove link" onClick={() => remove(l)}>
                  <IconX size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {picker && (
        <Popover anchor={picker} onClose={() => setPicker(null)} width="22rem">
          <div className="link-picker">
            <div className="link-types">
              {(['relates', 'blocks', 'parent'] as CardLinkType[]).map((t) => (
                <button key={t} className={'chip' + (type === t ? ' is-accent' : '')} onClick={() => setType(t)}>
                  {t === 'relates' ? 'Relates to' : t === 'blocks' ? 'Blocks' : 'Subtask'}
                </button>
              ))}
            </div>
            <input
              ref={searchRef}
              className="field"
              placeholder="Search cards by title or #id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="link-results">
              {candidates.map((c) => (
                <button key={c.id} className="menu-item" onClick={() => add(c.id)}>
                  <span className="link-id">#{c.id}</span>
                  <span className="grow">{c.title}</span>
                  <span className="mi-meta">{c.column}</span>
                </button>
              ))}
              {!candidates.length && <div className="menu-hint">No matching cards on this board.</div>}
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}
