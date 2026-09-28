import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@shared/types';
import { api } from '../api.ts';
import { selectProject } from '../store.ts';
import { IconSearch, useEscape } from './ui.tsx';

export function SearchOverlay({ onClose, onOpenCard }: { onClose: () => void; onOpenCard: (cardId: number) => void }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [hl, setHl] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => inputRef.current?.focus(), []);

  useEscape(onClose);

  const runSearch = (q: string) => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        setHl(-1);
        return;
      }
      api
        .search(q)
        .then((r) => {
          setResults(r);
          setHl(r.length ? 0 : -1);
        })
        .catch(() => {});
    }, 140);
  };

  const pick = (r: SearchResult) => {
    onClose();
    // Another project's card only exists in the store once its board loads.
    void selectProject(r.project_id).then(() => onOpenCard(r.id));
  };

  return (
    <div className="search-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="search-box" role="dialog" aria-label="Search cards">
        <div className="search-input-row">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search cards across all projects…"
            aria-label="Search"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHl((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHl((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter' && hl >= 0 && results[hl]) {
                e.preventDefault();
                pick(results[hl]!);
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="search-results">
          {query.trim() === '' ? (
            <div className="search-empty">Type to search…</div>
          ) : results.length === 0 ? (
            <div className="search-empty">No cards found</div>
          ) : (
            results.map((r, i) => (
              <button key={r.id} className={`search-item ${i === hl ? 'is-hl' : ''}`} onMouseEnter={() => setHl(i)} onClick={() => pick(r)}>
                <span className="dot" style={{ background: r.color || r.project_color }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="si-title" style={{ display: 'block' }}>
                    {r.title}
                  </span>
                  <span className="si-meta" style={{ display: 'block' }}>
                    {r.project_name} · {r.column_title}
                    {/* Say where the hit came from when it wasn't the card itself,
                        otherwise a comment match looks like a mystery result. */}
                    {r.match_kind && r.match_kind !== 'card' && (
                      <>
                        {' · '}
                        <span className="si-kind">in {r.match_kind === 'comment' ? 'a comment' : 'a file'}</span>
                      </>
                    )}
                  </span>
                  {r.match_kind && r.match_kind !== 'card' && r.match_snippet && (
                    <span className="si-snippet">{r.match_snippet}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
