import { useState } from 'react';
import type { Project } from '@shared/types';
import {
  archiveProject,
  canEdit,
  clearFilters,
  createProject,
  deleteProject,
  logout,
  moveProject,
  recolorProject,
  renameProject,
  selectProject,
  setFilters,
  setTheme,
  unarchiveProject,
  useStore,
} from '../store.ts';
import { PROJ_COLORS } from '../lib/util.ts';
import { prefs } from '../lib/prefs.ts';
import {
  Avatar,
  ConfirmDialog,
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconGraph,
  IconCheck,
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconMore,
  IconSearch,
  IconSun,
  IconUsers,
  Logo,
  Popover,
  PromptDialog,
  anchorFromEl,
  flyoutFromEl,
  type Anchor,
} from './ui.tsx';
import { brand } from '../brand.ts';

export function TopBar({
  onOpenSearch,
  onOpenToday,
  onOpenAdmin,
  onOpenGraph,
}: {
  onOpenSearch: () => void;
  onOpenToday: () => void;
  onOpenAdmin: () => void;
  onOpenGraph: () => void;
}) {
  const { projects, archived, currentProjectId, agendaBadge, user, filters, board } = useStore();
  const current = projects.find((p) => p.id === currentProjectId) ?? archived.find((p) => p.id === currentProjectId);
  const [switcher, setSwitcher] = useState<Anchor | null>(null);
  const [filterMenu, setFilterMenu] = useState<Anchor | null>(null);
  const [userMenu, setUserMenu] = useState<Anchor | null>(null);
  const activeFilterCount = filters.colors.size + filters.labels.size + filters.creators.size + filters.assignees.size;
  const anyFilterable = board.some((c) => c.cards.length > 0);

  return (
    <header className="topbar">
      <span className="brand-mark" aria-hidden="true">
        <Logo size={26} />
      </span>
      <button className="proj-switch" aria-haspopup="menu" aria-expanded={!!switcher} onClick={(e) => setSwitcher(anchorFromEl(e.currentTarget))}>
        {current && <span className="dot" style={{ background: current.color }} />}
        <span className="ps-name">{current?.name ?? brand.shortName}</span>
        <span className="ps-chev">
          <IconChevronDown size={14} />
        </span>
      </button>

      <span className="spacer" />

      <div className="topbar-right">
        {anyFilterable && (
          <button
            className={`chip ${activeFilterCount ? 'is-accent' : ''}`}
            aria-haspopup="menu"
            aria-expanded={!!filterMenu}
            onClick={(e) => setFilterMenu(anchorFromEl(e.currentTarget, true))}
          >
            Filter{activeFilterCount ? ` · ${activeFilterCount}` : ''}
          </button>
        )}
        <button className="chip icon-chip" aria-label="Search (Ctrl+K)" title="Search — ⌘K" onClick={onOpenSearch}>
          <IconSearch size={15} />
        </button>
        <button className="chip icon-chip" aria-label="Graph" title="Graph — G" onClick={onOpenGraph}>
          <IconGraph size={15} />
        </button>
        <button className="chip icon-chip" aria-label="Today" title="Today — T" style={{ position: 'relative' }} onClick={onOpenToday}>
          <IconCalendar size={15} />
          {agendaBadge > 0 && <span className="badge">{agendaBadge}</span>}
        </button>
        <button
          className="chip icon-chip"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={!!userMenu}
          style={{ padding: 0 }}
          onClick={(e) => setUserMenu(anchorFromEl(e.currentTarget, true))}
        >
          <Avatar email={user?.email} size={26} />
        </button>
      </div>

      {switcher && <ProjectSwitcher onClose={() => setSwitcher(null)} anchor={switcher} />}
      {filterMenu && <FilterMenu onClose={() => setFilterMenu(null)} anchor={filterMenu} />}
      {userMenu && (
        <UserMenu
          onClose={() => setUserMenu(null)}
          anchor={userMenu}
          onOpenAdmin={onOpenAdmin}
        />
      )}
    </header>
  );
}

// ---------- project switcher ----------

function ProjectSwitcher({ anchor, onClose }: { anchor: Anchor; onClose: () => void }) {
  const { projects, archived, counts, currentProjectId } = useStore();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ anchor: Anchor; project: Project } | null>(null);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  // A toggle: the nested menu's scrim already closed it on pointerdown, so a
  // plain "open" here would just reopen it.
  const toggleRowMenu = (el: HTMLElement, p: Project) =>
    setRowMenu(rowMenu?.project.id === p.id ? null : { anchor: flyoutFromEl(el), project: p });

  return (
    <>
      <Popover anchor={anchor} onClose={onClose} width="18rem">
        <div className="menu-label">Projects</div>
        {projects.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="menu-item"
              style={{ flex: 1 }}
              onClick={() => {
                selectProject(p.id);
                onClose();
              }}
            >
              <span className="dot" style={{ background: p.color }} />
              <span className="grow">{p.name}</span>
              {p.id === currentProjectId ? <IconCheck size={14} /> : <span className="mi-meta">{counts[p.id] ?? 0}</span>}
            </button>
            <button
              className="icon-btn"
              aria-label={`Options for ${p.name}`}
              onClick={(e) => {
                toggleRowMenu(e.currentTarget, p);
              }}
            >
              <IconMore size={14} />
            </button>
          </div>
        ))}
        {projects.length === 0 && <div className="menu-hint">No projects yet.</div>}
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => setCreating(true)}>
          + New project
        </button>
        {archived.length > 0 && (
          <button className="menu-item" style={{ color: 'var(--text3)' }} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived' : `Show ${archived.length} archived`}
          </button>
        )}
        {showArchived &&
          archived.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', opacity: 0.75 }}>
              <button
                className="menu-item"
                style={{ flex: 1 }}
                onClick={() => {
                  selectProject(p.id);
                  onClose();
                }}
              >
                <span className="dot" style={{ background: p.color }} />
                <span className="grow">{p.name}</span>
                <span className="mi-meta">archived</span>
              </button>
              <button
                className="icon-btn"
                aria-label={`Options for ${p.name}`}
                onClick={(e) => {
                toggleRowMenu(e.currentTarget, p);
              }}
              >
                <IconMore size={14} />
              </button>
            </div>
          ))}
      </Popover>

      {rowMenu && (
        <Popover anchor={rowMenu.anchor} onClose={() => setRowMenu(null)}>
          <ProjectRowMenu
            project={rowMenu.project}
            close={() => setRowMenu(null)}
            onRename={() => setRenaming(rowMenu.project)}
            onDelete={() => setDeleting(rowMenu.project)}
          />
        </Popover>
      )}

      {creating && (
        <PromptDialog
          title="New project"
          placeholder="Project name…"
          okLabel="Create"
          onClose={() => {
            setCreating(false);
            onClose();
          }}
          onSubmit={(name) => void createProject(name)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename project"
          initial={renaming.name}
          okLabel="Save"
          onClose={() => setRenaming(null)}
          onSubmit={(name) => void renameProject(renaming.id, name)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete project"
          message={`Delete "${deleting.name}" and all its cards? This cannot be undone.`}
          onConfirm={() => {
            void deleteProject(deleting.id);
            onClose();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function ProjectRowMenu({
  project,
  close,
  onRename,
  onDelete,
}: {
  project: Project;
  close: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { projects } = useStore();
  const editable = canEdit(project);
  const idx = projects.findIndex((p) => p.id === project.id);

  if (!editable) {
    return (
      <div className="menu-hint">
        Owned by {project.creator_email ?? 'system'}.<br />
        Only the creator or an admin can edit.
      </div>
    );
  }
  if (project.archived) {
    return (
      <>
        <button
          className="menu-item"
          onClick={() => {
            void unarchiveProject(project.id);
            close();
          }}
        >
          Unarchive
        </button>
        <button
          className="menu-item is-danger"
          onClick={() => {
            close();
            onDelete();
          }}
        >
          Delete…
        </button>
      </>
    );
  }
  return (
    <>
      <button
        className="menu-item"
        onClick={() => {
          close();
          onRename();
        }}
      >
        Rename…
      </button>
      <div className="menu-label">Color</div>
      <div className="filter-row">
        {PROJ_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${project.color === c ? 'is-on' : ''}`}
            style={{ background: c }}
            aria-label={`Set color ${c}`}
            onClick={() => {
              void recolorProject(project.id, c);
              close();
            }}
          />
        ))}
      </div>
      <div className="menu-sep" />
      <button className="menu-item" disabled={idx <= 0} onClick={() => void moveProject(project.id, -1)}>
        <IconArrowUp size={13} /> Move up
      </button>
      <button className="menu-item" disabled={idx === -1 || idx >= projects.length - 1} onClick={() => void moveProject(project.id, 1)}>
        <IconArrowDown size={13} /> Move down
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          void archiveProject(project.id);
          close();
        }}
      >
        <IconArchive size={13} /> Archive
      </button>
      <button
        className="menu-item is-danger"
        onClick={() => {
          close();
          onDelete();
        }}
      >
        Delete…
      </button>
    </>
  );
}

// ---------- filters ----------

function FilterMenu({ anchor, onClose }: { anchor: Anchor; onClose: () => void }) {
  const { board, filters, user } = useStore();

  const usedColors = new Set<string>();
  const usedLabels = new Map<number, { id: number; name: string; color: string }>();
  const usedCreators = new Set<string>();
  /** '' represents unassigned, so it can be filtered for like any other value. */
  const usedAssignees = new Set<string>();
  let anyAssigned = false;
  board.forEach((col) =>
    col.cards.forEach((card) => {
      if (card.color) usedColors.add(card.color);
      card.labels.forEach((l) => usedLabels.set(l.id, l));
      if (card.creator_email) usedCreators.add(card.creator_email);
      usedAssignees.add(card.assignee_email || '');
      if (card.assignee_email) anyAssigned = true;
    }),
  );
  // Only worth showing the group once something is actually assigned.
  if (!anyAssigned) usedAssignees.clear();

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const active = filters.colors.size + filters.labels.size + filters.creators.size + filters.assignees.size > 0;

  return (
    <Popover anchor={anchor} onClose={onClose} width="17rem">
      {usedColors.size > 0 && (
        <>
          <div className="menu-label">Color</div>
          <div className="filter-row">
            {[...usedColors].map((c) => (
              <button
                key={c}
                className={`swatch ${filters.colors.has(c) ? 'is-on' : ''}`}
                style={{ background: c }}
                aria-label={`Filter by color ${c}`}
                aria-pressed={filters.colors.has(c)}
                onClick={() => setFilters({ ...filters, colors: toggle(filters.colors, c) })}
              />
            ))}
          </div>
        </>
      )}
      {usedLabels.size > 0 && (
        <>
          <div className="menu-label">Labels</div>
          {[...usedLabels.values()].map((l) => (
            <button key={l.id} className="menu-item" aria-pressed={filters.labels.has(l.id)} onClick={() => setFilters({ ...filters, labels: toggle(filters.labels, l.id) })}>
              <span className="dot" style={{ background: l.color }} />
              <span className="grow">{l.name}</span>
              {filters.labels.has(l.id) && <IconCheck size={14} />}
            </button>
          ))}
        </>
      )}
      {usedAssignees.size > 0 && (
        <>
          <div className="menu-label">Assigned to</div>
          {[...usedAssignees].sort().map((email) => (
            <button
              key={email}
              className="menu-item"
              aria-pressed={filters.assignees.has(email)}
              onClick={() => setFilters({ ...filters, assignees: toggle(filters.assignees, email) })}
            >
              {email ? <Avatar email={email} size={18} /> : <span className="dot" style={{ background: 'var(--text3)' }} />}
              <span className="grow">{!email ? 'Unassigned' : email === user?.email ? 'Me' : email.split('@')[0]}</span>
              {filters.assignees.has(email) && <IconCheck size={14} />}
            </button>
          ))}
        </>
      )}
      {usedCreators.size > 1 && (
        <>
          <div className="menu-label">Created by</div>
          {[...usedCreators].sort().map((email) => (
            <button key={email} className="menu-item" aria-pressed={filters.creators.has(email)} onClick={() => setFilters({ ...filters, creators: toggle(filters.creators, email) })}>
              <Avatar email={email} size={18} />
              <span className="grow">{email === user?.email ? 'Mine' : email.split('@')[0]}</span>
              {filters.creators.has(email) && <IconCheck size={14} />}
            </button>
          ))}
        </>
      )}
      {active && (
        <>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              clearFilters();
              onClose();
            }}
          >
            Clear filters
          </button>
        </>
      )}
      {usedColors.size === 0 && usedLabels.size === 0 && usedCreators.size <= 1 && (
        <div className="menu-hint">Nothing to filter yet — add colors or labels to cards.</div>
      )}
    </Popover>
  );
}

// ---------- user menu ----------

function UserMenu({ anchor, onClose, onOpenAdmin }: { anchor: Anchor; onClose: () => void; onOpenAdmin: () => void }) {
  const { user, theme } = useStore();
  const [scale, setScale] = useState(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1);

  const applyScale = (s: number) => {
    const v = Math.round(s * 20) / 20;
    document.documentElement.style.setProperty('--ui-scale', String(v));
    prefs.set('scale', String(v));
    setScale(v);
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width="16.5rem">
      <div className="menu-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <Avatar email={user?.email} size={28} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', color: 'var(--text)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</span>
          {user?.is_admin && <span style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>admin</span>}
        </span>
      </div>
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
        <span className="grow">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <div className="menu-item" style={{ cursor: 'default' }}>
        <span className="grow">UI size</span>
        <button className="icon-btn" aria-label="Smaller" disabled={scale <= 0.8} onClick={() => applyScale(scale - 0.1)}>
          –
        </button>
        <span className="mi-meta" style={{ minWidth: '2.5rem', textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button className="icon-btn" aria-label="Larger" disabled={scale >= 1.5} onClick={() => applyScale(scale + 0.1)}>
          +
        </button>
      </div>
      {user?.is_admin && (
        <button
          className="menu-item"
          onClick={() => {
            onClose();
            onOpenAdmin();
          }}
        >
          <IconUsers size={14} />
          <span className="grow">Manage users</span>
        </button>
      )}
      <div className="menu-sep" />
      <button className="menu-item is-danger" onClick={() => void logout()}>
        <IconLogout size={14} />
        <span className="grow">Log out</span>
      </button>
    </Popover>
  );
}
