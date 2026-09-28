import { useEffect, useState } from 'react';
import type { AgendaItem } from '@shared/types';
import { api } from '../api.ts';
import { refreshAgendaBadge, refreshSoon, selectProject, toast } from '../store.ts';
import { dueState, formatDue } from '../lib/util.ts';
import { IconX, useEscape } from './ui.tsx';

export function TodayPanel({ onClose, onOpenCard }: { onClose: () => void; onOpenCard: (cardId: number) => void }) {
  const [items, setItems] = useState<AgendaItem[] | null>(null);

  useEffect(() => {
    api.agenda().then(setItems).catch(() => setItems([]));
  }, []);

  useEscape(onClose);

  const overdue = (items ?? []).filter((i) => dueState(i.due_date) === 'overdue');
  const today = (items ?? []).filter((i) => dueState(i.due_date) === 'today');
  const week = (items ?? []).filter((i) => dueState(i.due_date) === 'soon');

  const complete = (item: AgendaItem) => {
    setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    api
      .moveCardToNamed(item.id, 'Done')
      .then(() => {
        refreshSoon();
        void refreshAgendaBadge();
      })
      .catch(() => toast(`No "Done" column in ${item.project_name}`));
  };

  const open = (item: AgendaItem) => {
    onClose();
    void selectProject(item.project_id).then(() => onOpenCard(item.id));
  };

  const group = (title: string, list: AgendaItem[], color: string) =>
    list.length > 0 && (
      <div className="today-group">
        <h3 style={{ color }}>{title.toUpperCase()}</h3>
        {list.map((item) => (
          <div key={item.id} className="today-row">
            <button className="today-check" aria-label={`Mark "${item.title}" done`} title="Move to Done" onClick={() => complete(item)} />
            <button className="tr-main" onClick={() => open(item)}>
              <div className="tr-title">{item.title}</div>
              <div className="tr-meta">
                <span className="dot" style={{ background: item.project_color }} />
                {item.project_name} · {item.column_title}
                <span style={{ flex: 1 }} />
                <span style={{ color }}>{formatDue(item.due_date)}</span>
              </div>
            </button>
          </div>
        ))}
      </div>
    );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="today-panel" role="dialog" aria-label="Today">
        <div className="today-head">
          <h2>Today</h2>
          <button className="chip icon-chip" aria-label="Close" onClick={onClose}>
            <IconX size={15} />
          </button>
        </div>
        <div className="today-list">
          {items !== null && !overdue.length && !today.length && !week.length && (
            <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '4rem 1rem', fontSize: '0.9rem' }}>
              Nothing due this week.
            </p>
          )}
          {group('Overdue', overdue, 'var(--danger)')}
          {group('Today', today, 'var(--warn)')}
          {group('This week', week, 'var(--text3)')}
        </div>
      </aside>
    </>
  );
}
