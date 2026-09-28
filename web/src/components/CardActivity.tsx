import { useCallback, useEffect, useState } from 'react';
import type { ActivityEntry } from '@shared/types';
import { api } from '../api.ts';
import { timeAgo } from '../lib/util.ts';
import { Avatar } from './ui.tsx';

/**
 * Card history.
 *
 * Each row is phrased as a sentence about what someone did, because "verb:
 * card.moved, detail: To Do → Done" is data, not history. Unknown verbs fall
 * back to the raw string rather than being hidden, so a future event type shows
 * up as something rather than silently vanishing.
 */
function phrase(a: ActivityEntry): string {
  const d = a.detail;
  switch (a.verb) {
    case 'card.created': return 'created this card';
    case 'card.deleted': return 'deleted this card';
    case 'card.moved': return d ? `moved it ${d}` : 'moved it';
    case 'card.renamed': return d ? `renamed it from “${d}”` : 'renamed it';
    case 'card.described': return 'edited the notes';
    case 'card.due': return d ? `set the due date to ${d}` : 'cleared the due date';
    case 'card.assigned': return d ? `assigned it to ${d}` : 'assigned it';
    case 'card.unassigned': return 'unassigned it';
    case 'card.labeled': return d ? `added the label ${d}` : 'added a label';
    case 'card.unlabeled': return d ? `removed the label ${d}` : 'removed a label';
    case 'card.linked': return d ? `linked ${d}` : 'linked another card';
    case 'card.unlinked': return d ? `removed a link to ${d}` : 'removed a link';
    case 'file.added': return d ? `attached ${d}` : 'attached a file';
    case 'file.removed': return d ? `removed ${d}` : 'removed a file';
    case 'comment.added': return 'commented';
    case 'comment.deleted': return 'deleted a comment';
    default: return a.verb;
  }
}

export function CardActivity({ cardId }: { cardId: number }) {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.cardActivity(cardId).then(setItems).catch(() => {});
  }, [cardId]);
  useEffect(load, [load]);

  if (!items.length) return null;

  // Collapsed by default: history is reference material, not the main read.
  const shown = open ? items : items.slice(0, 3);

  return (
    <div className="detail-activity">
      <h3>
        History
        <span className="count">{items.length}</span>
      </h3>
      <ul className="activity-list">
        {shown.map((a) => (
          <li key={a.id} className="activity-row">
            <Avatar email={a.actor_email} size={18} />
            <span className="act-text">
              <strong>{a.actor_email ? a.actor_email.split('@')[0] : 'someone'}</strong> {phrase(a)}
            </span>
            <span className="act-when">{timeAgo(a.created_at)}</span>
          </li>
        ))}
      </ul>
      {items.length > 3 && (
        <button className="attach-inline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
