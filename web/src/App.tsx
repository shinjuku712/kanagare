import { useEffect, useState } from 'react';
import { checkAuth, getState, useStore } from './store.ts';
import { Board } from './components/Board.tsx';
import { TopBar } from './components/TopBar.tsx';
import { CardDetail } from './components/CardDetail.tsx';
import { TodayPanel } from './components/Today.tsx';
import { SearchOverlay } from './components/Search.tsx';
import { AdminUsers } from './components/AdminUsers.tsx';
import { Graph } from './components/Graph.tsx';
import { CardPage } from './components/CardPage.tsx';
import { navigateToBoard, navigateToCard, useRoute } from './lib/router.ts';
import { Login } from './components/Login.tsx';
import { Toasts } from './components/Toasts.tsx';
import { Modal, anyLayerOpen } from './components/ui.tsx';

export function App() {
  const { authChecked, user } = useStore();
  const route = useRoute();
  const [detailCardId, setDetailCardId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);

  useEffect(() => {
    void checkAuth();
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable]');
      if (!getState().user) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else if (!anyLayerOpen()) setSearchOpen(true);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (anyLayerOpen()) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setTodayOpen(true);
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setGraphOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  if (!authChecked) return null;
  if (!user) return <Login />;

  if (route.name === 'card') {
    return (
      <div className="app">
        <CardPage key={route.id} cardId={route.id} onClose={navigateToBoard} onOpenCard={navigateToCard} />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar onOpenSearch={() => setSearchOpen(true)} onOpenToday={() => setTodayOpen(true)} onOpenAdmin={() => setAdminOpen(true)} onOpenGraph={() => setGraphOpen(true)} />
      <Board onOpenCard={setDetailCardId} />
      {detailCardId !== null && (
        // Keyed so opening another card (from Links, search…) starts fresh
        // instead of carrying over the previous card's unsaved text.
        <CardDetail key={detailCardId} cardId={detailCardId} onClose={() => setDetailCardId(null)} onOpenCard={setDetailCardId} />
      )}
      {graphOpen && (
        <Graph
          onClose={() => setGraphOpen(false)}
          onOpenCard={(id) => {
            setGraphOpen(false);
            setDetailCardId(id);
          }}
        />
      )}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onOpenCard={setDetailCardId} />}
      {todayOpen && <TodayPanel onClose={() => setTodayOpen(false)} onOpenCard={setDetailCardId} />}
      {adminOpen && <AdminUsers onClose={() => setAdminOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      <Toasts />
    </div>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string[]][] = [
    ['Search', ['⌘K', '/']],
    ['Today', ['T']],
    ['Graph', ['G']],
    ['Open focused card', ['Enter']],
    ['Delete focused card', ['⌫']],
    ['Move focused card to next / previous column', [']', '[']],
    ['Reorder focused card', ['Alt ↑↓']],
    ['Close / cancel drag', ['Esc']],
    ['This help', ['?']],
  ];
  return (
    <Modal onClose={onClose} labelledBy="help-title">
      <h2 id="help-title">Keyboard shortcuts</h2>
      <div className="shortcuts-grid">
        {rows.map(([label, keys]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--text2)' }}>{label}</span>
            <span className="sc-keys">
              {keys.map((k) => (
                <span key={k} className="kbd">
                  {k}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
