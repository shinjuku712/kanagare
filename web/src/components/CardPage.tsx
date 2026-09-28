import { useEffect, useState } from 'react';
import type { BoardColumn } from '@shared/types';
import { api } from '../api.ts';
import { getState, loadBoard, selectProject, useStore } from '../store.ts';
import { CardDetail } from './CardDetail.tsx';

/**
 * Full-page card route (/card/:id).
 *
 * The card modal renders from board state, but a deep link can land before any
 * board is loaded — or on a card belonging to a different project than the one
 * last selected. So this resolves the card's project first, switches to it, and
 * only then renders the detail view.
 */
export function CardPage({ cardId, onClose, onOpenCard }: { cardId: number; onClose: () => void; onOpenCard: (id: number) => void }) {
  const { board, boardLoaded, projects } = useStore();
  const [status, setStatus] = useState<'resolving' | 'ready' | 'missing'>('resolving');

  const onBoard = board.some((col) => col.cards.some((c) => c.id === cardId));

  useEffect(() => {
    let cancelled = false;
    if (onBoard) {
      setStatus('ready');
      return;
    }
    // Not on the current board — find which project owns it.
    (async () => {
      // Wait until projects are known (auth/bootstrap may still be running).
      if (!projects.length) return;
      for (const p of projects) {
        try {
          const cols: BoardColumn[] = await api.board(p.id);
          if (cancelled) return;
          if (cols.some((col) => col.cards.some((c) => c.id === cardId))) {
            if (getState().currentProjectId !== p.id) {
              selectProject(p.id);
            } else {
              void loadBoard(true);
            }
            setStatus('ready');
            return;
          }
        } catch {
          /* try the next project */
        }
      }
      if (!cancelled) setStatus('missing');
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId, onBoard, projects]);

  if (onBoard) {
    return <CardDetail cardId={cardId} onClose={onClose} onOpenCard={onOpenCard} fullPage />;
  }
  if (status === 'missing') {
    return (
      <div className="card-page-state">
        <h3>Card #{cardId} not found</h3>
        <p>It may have been deleted, or you're looking at a link from a different board.</p>
        <button className="btn" onClick={onClose}>
          Back to board
        </button>
      </div>
    );
  }
  return <div className="card-page-state">{boardLoaded || projects.length ? 'Finding card…' : 'Loading…'}</div>;
}
