import { useCallback, useEffect, useState } from 'react';
import type { Template } from '@shared/types';
import { api } from '../api.ts';
import { getState, loadBoard, refreshSoon, toast, useStore } from '../store.ts';
import { IconPlus, IconTrash, Modal } from './ui.tsx';

/**
 * Card templates — pick one to create a pre-filled card, or save a new one.
 *
 * Opened from a column's menu, so "new card from template" lands in the column
 * you asked from rather than making you choose a destination twice.
 */
export function TemplatePicker({ columnId, onClose, onCreated }: { columnId: number; onClose: () => void; onCreated: (id: number) => void }) {
  const { currentProjectId, user } = useStore();
  const [items, setItems] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // new-template form
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState('');
  const [scoped, setScoped] = useState(true);

  const load = useCallback(() => {
    api
      .templates(currentProjectId ?? undefined)
      .then((t) => {
        setItems(t);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentProjectId]);
  useEffect(load, [load]);

  const apply = async (t: Template) => {
    if (busy) return;
    setBusy(true);
    try {
      const card = await api.applyTemplate(t.id, columnId);
      await loadBoard(true);
      refreshSoon();
      onCreated(card.id);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not apply template');
      setBusy(false);
    }
  };

  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await api.createTemplate({
        name: n,
        project_id: scoped ? (getState().currentProjectId ?? null) : null,
        title: title.trim(),
        description,
        label_names: labels.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setCreating(false);
      setName('');
      setTitle('');
      setDescription('');
      setLabels('');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save template');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    const before = items;
    setItems((xs) => xs.filter((x) => x.id !== t.id));
    try {
      await api.deleteTemplate(t.id);
    } catch (e) {
      setItems(before);
      toast(e instanceof Error ? e.message : 'Could not delete template');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="tpl-title">
      <h2 id="tpl-title">Templates</h2>

      {loaded && !items.length && !creating && (
        <p className="menu-hint" style={{ padding: '0.5rem 0' }}>
          No templates yet. Save one for the cards you create over and over — a bug report, a deploy checklist.
        </p>
      )}

      {items.length > 0 && (
        <div className="tpl-list">
          {items.map((t) => (
            <div key={t.id} className="tpl-row">
              <button className="tpl-pick" onClick={() => apply(t)} disabled={busy}>
                <span className="tpl-name">
                  {t.color && <span className="dot" style={{ background: t.color }} />}
                  {t.name}
                </span>
                <span className="tpl-meta">
                  {t.project_id === null ? 'all boards' : 'this board'}
                  {t.label_names ? ` · ${t.label_names.split('\n').filter(Boolean).join(', ')}` : ''}
                </span>
              </button>
              {(user?.is_admin || t.created_by === user?.id) && (
                <button className="icon-btn danger" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}>
                  <IconTrash size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <div className="tpl-form">
          <input className="field" placeholder="Template name (e.g. Bug report)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="field" placeholder="Default card title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="field" rows={4} placeholder="Default notes — markdown, checklists…" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className="field" placeholder="Labels, comma separated (optional)" value={labels} onChange={(e) => setLabels(e.target.value)} />
          <label className="tpl-scope">
            <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} />
            Only on this board
          </label>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={!name.trim() || busy}>
              Save template
            </button>
          </div>
        </div>
      ) : (
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn" onClick={() => setCreating(true)}>
            <IconPlus size={13} />
            New template
          </button>
        </div>
      )}
    </Modal>
  );
}
