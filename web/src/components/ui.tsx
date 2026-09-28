import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { avatarColor, avatarInitials } from '../lib/util.ts';
import { brand } from '../brand.ts';

// ---------- icons ----------

const ic = (path: ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    );
  };

export const IconSearch = ic(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>);
export const IconPlus = ic(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
export const IconChevronDown = ic(<polyline points="6 9 12 15 18 9" />);
export const IconCheck = ic(<polyline points="20 6 9 17 4 12" />);
export const IconCalendar = ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>);
export const IconClock = ic(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>);
export const IconFile = ic(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>);
export const IconTag = ic(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>);
export const IconComment = ic(<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />);
export const IconGraph = ic(<><circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="8" r="2.6" /><circle cx="11" cy="18" r="2.6" /><line x1="8.4" y1="7" x2="15.5" y2="7.7" /><line x1="7.3" y1="8.3" x2="10" y2="15.5" /><line x1="17" y1="10.4" x2="12.2" y2="15.7" /></>);
export const IconArrowLeft = ic(<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>);
export const IconExpand = ic(<><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>);
export const IconCollapse = ic(<><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>);
export const IconLink = ic(<><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></>);
export const IconMore = ic(<><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" /></>);
export const IconX = ic(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>);
export const IconTrash = ic(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></>);
export const IconEdit = ic(<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>);
export const IconUsers = ic(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>);
export const IconLogout = ic(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>);
export const IconSun = ic(<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>);
export const IconMoon = ic(<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />);
export const IconArrowUp = ic(<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>);
export const IconArrowDown = ic(<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>);
export const IconArchive = ic(<><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>);
export const IconCopy = ic(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>);
export const IconUser = ic(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>);
export const IconCheckSquare = ic(<><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>);

export function Logo({ size = 26 }: { size?: number }) {
  if (brand.logo) return <img src={brand.logo} width={size} height={size} alt="" />;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="116" fill="#6d7cff" />
      <path
        fill="#fff"
        d="M80 126 A30 30 0 0 1 110 96 H150 A30 30 0 0 1 180 126 V179.8 A4 4 0 0 1 174.8 183.6 C145.5 174.6 115 172.2 84.8 178 A4 4 0 0 1 80 174.1 Z
           M80 239.9 A4 4 0 0 1 82.8 236.1 C98.8 231.4 115.1 229.7 131.6 231.4 C147.6 233.3 162.9 238.1 177.6 244.4 A4 4 0 0 1 180 248.1 V386 A30 30 0 0 1 150 416 H110 A30 30 0 0 1 80 386 Z
           M206 126 A30 30 0 0 1 236 96 H276 A30 30 0 0 1 306 126 V246.4 A4 4 0 0 1 300 249.8 C269.4 232.1 240.2 212.1 208.3 196.9 A4 4 0 0 1 206 193.3 Z
           M206 265.6 A4 4 0 0 1 212 262.2 C242.6 279.9 271.8 299.9 303.7 315.1 A4 4 0 0 1 306 318.7 V386 A30 30 0 0 1 276 416 H236 A30 30 0 0 1 206 386 Z
           M332 126 A30 30 0 0 1 362 96 H402 A30 30 0 0 1 432 126 V272.1 A4 4 0 0 1 429.2 275.9 C413.2 280.6 396.9 282.3 380.4 280.6 C364.4 278.7 349.1 273.9 334.4 267.6 A4 4 0 0 1 332 263.9 Z
           M332 332.2 A4 4 0 0 1 337.2 328.4 C366.5 337.4 397 339.8 427.2 334 A4 4 0 0 1 432 337.9 V386 A30 30 0 0 1 402 416 H362 A30 30 0 0 1 332 386 Z"
      />
    </svg>
  );
}

// ---------- avatar ----------

export function Avatar({ email, size = 20 }: { email: string | null | undefined; size?: number }) {
  return (
    <span
      className="avatar"
      title={email ?? 'unknown'}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: avatarColor(email) }}
    >
      {avatarInitials(email)}
    </span>
  );
}

// ---------- layers ----------

/*
 * Esc closes the topmost open layer (modal, popover, panel) and nothing under
 * it. The listener is on window in the bubble phase, so a focused field that
 * uses Esc itself (a comment draft, the notes editor) runs first and claims
 * the key with preventDefault().
 */
const layers: { current: () => void }[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !layers.length) return;
    e.preventDefault();
    layers[layers.length - 1]!.current();
  });
}

/** Register a layer that Esc should close while it's mounted. */
export function useEscape(onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    layers.push(ref);
    return () => {
      const i = layers.lastIndexOf(ref);
      if (i !== -1) layers.splice(i, 1);
    };
  }, []);
}

/** True while any modal, popover or panel is open. */
export const anyLayerOpen = () => layers.length > 0;

// ---------- popover ----------

export interface Anchor {
  x: number;
  y: number;
  /** align popover's right edge to x */
  alignRight?: boolean;
  /**
   * Open beside the anchor instead of below it, top-aligned to the row.
   * Used for menus nested inside another popover: dropping below would cover
   * the list the menu came from.
   */
  flyout?: boolean;
  /** Right edge of the parent surface, so a flyout clears it. */
  flyoutFrom?: number;
  /** Left edge of the parent surface, for flipping to the other side. */
  flyoutLeft?: number;
}

export function anchorFromEl(el: HTMLElement, alignRight = false): Anchor {
  const r = el.getBoundingClientRect();
  return { x: alignRight ? r.right : r.left, y: r.bottom + 6, alignRight };
}

/**
 * Anchor for a menu opened from a row *inside* another popover. It flies out
 * to the side of the parent panel, aligned with the row you clicked, so the
 * parent list stays readable.
 */
export function flyoutFromEl(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  const parent = el.closest('.popover')?.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    flyout: true,
    flyoutFrom: parent ? parent.right : r.right,
    flyoutLeft: parent ? parent.left : r.left,
  };
}

/** Below this width a popover is presented as a bottom sheet, not a panel. */
function isSheetViewport() {
  return window.matchMedia('(max-width: 700px)').matches;
}

export function Popover({ anchor, onClose, children, width }: { anchor: Anchor; onClose: () => void; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [sheetMode] = useState(() => isSheetViewport());
  const sheet = useSheetDrag(ref, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // On small screens the popover is a bottom sheet — CSS owns the geometry.
    if (isSheetViewport()) {
      setPos({ left: 0, top: 0 });
      return;
    }
    const r = el.getBoundingClientRect();
    const gap = 8;
    let left: number;
    let top = anchor.y;

    if (anchor.flyout) {
      // Beside the parent panel, top-aligned with the clicked row.
      const rightSpace = window.innerWidth - (anchor.flyoutFrom ?? anchor.x) - gap;
      if (rightSpace >= r.width) left = (anchor.flyoutFrom ?? anchor.x) + gap;
      else left = (anchor.flyoutLeft ?? anchor.x) - r.width - gap; // flip to the left
    } else {
      left = anchor.alignRight ? anchor.x - r.width : anchor.x;
    }

    left = Math.max(gap, Math.min(left, window.innerWidth - r.width - gap));
    if (top + r.height > window.innerHeight - gap) top = Math.max(gap, window.innerHeight - r.height - gap);
    setPos({ left, top });
  }, [anchor]);

  useEscape(onClose);

  // A sheet taller than the screen scrolls; then only the handle drags it.
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setScrolls(el.scrollHeight > el.clientHeight + 1);
  });

  return (
    <>
      {/* Close on pointerdown so the same tap can't reopen the menu via its trigger. */}
      <div
        className={'scrim' + (sheetMode ? '' : ' transparent')}
        onPointerDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={sheet.scrimStyle}
      />
      <div
        ref={ref}
        className={'popover' + (scrolls ? ' scrolls' : '')}
        role="menu"
        style={sheetMode ? sheet.style : { left: pos.left, top: pos.top, width }}
        onPointerDown={sheet.onPointerDown}
        onPointerMove={sheet.onPointerMove}
        onPointerUp={sheet.onPointerUp}
        onPointerCancel={sheet.onPointerUp}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

// ---------- calendar ----------

const WEEKDAYS = [...Array(7)].map((_, i) =>
  // Jan 7 2024 is a Sunday — locale-correct narrow weekday labels, Sunday-first.
  new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }),
);

/** Flat month calendar. `value` and onPick use ISO yyyy-mm-dd. */
export function Calendar({ value, onPick }: { value: string | null; onPick: (iso: string) => void }) {
  const today = new Date();
  const selected = value ? new Date(value.slice(0, 10) + 'T00:00:00') : null;
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const first = new Date(view.year, view.month, 1);
  const startPad = first.getDay(); // Sunday-first
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const iso = (d: number) =>
    `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isToday = (d: number) =>
    today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === d;
  const isSelected = (d: number) =>
    !!selected && selected.getFullYear() === view.year && selected.getMonth() === view.month && selected.getDate() === d;

  const shift = (delta: number) => {
    const m = view.month + delta;
    setView({ year: view.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="cal" role="grid" aria-label="Calendar">
      <div className="cal-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <span className="cal-title">
          {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="cal-wd">
            {w}
          </span>
        ))}
        {[...Array(startPad)].map((_, i) => (
          <span key={'p' + i} />
        ))}
        {[...Array(daysInMonth)].map((_, i) => {
          const d = i + 1;
          return (
            <button
              key={d}
              className={`cal-day ${isSelected(d) ? 'is-sel' : ''} ${isToday(d) ? 'is-today' : ''}`}
              onClick={() => onPick(iso(d))}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- modal ----------

export function Modal({ onClose, children, className, labelledBy }: { onClose: () => void; children: ReactNode; className?: string; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the mount effect — re-running it
  // would steal focus from whatever the user is typing in on every re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const auto = el?.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    (auto ?? el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && el) {
        const focusables = [...el.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(
          (f) => !f.hasAttribute('disabled') && f.offsetParent !== null,
        );
        if (!focusables.length) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);

  useEscape(() => onCloseRef.current());
  const sheet = useSheetDrag(ref, onClose);

  return (
    <>
      {/* close on click (not pointerdown): a tap that dismisses the modal must
          not fall through to whatever sits under the scrim on mobile */}
      <div className="scrim" onClick={onClose} style={sheet.scrimStyle} />
      <div className="modal-wrap" style={{ pointerEvents: 'none' }}>
        <div
          ref={ref}
          className={`modal ${className ?? ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          style={{ pointerEvents: 'auto', ...sheet.style }}
          onPointerDown={sheet.onPointerDown}
          onPointerMove={sheet.onPointerMove}
          onPointerUp={sheet.onPointerUp}
          onPointerCancel={sheet.onPointerUp}
        >
          {/* Grab handle: only rendered as a sheet on small screens (CSS), and
              it's what tells people the sheet can be dragged at all. */}
          <div className="sheet-handle" aria-hidden="true" />
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Swipe-down-to-dismiss for bottom sheets.
 *
 * Only engages on coarse pointers (touch) where the modal is presented as a
 * sheet — on desktop a modal is a centred dialog and dragging it would be
 * meaningless.
 *
 * The drag is ignored when it starts inside something scrollable that isn't
 * already at the top, otherwise flicking a long comment thread upward would
 * fight the sheet instead of scrolling it.
 */
function useSheetDrag(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const [dy, setDy] = useState(0);
  const drag = useRef<{ active: boolean; startY: number; id: number }>({ active: false, startY: 0, id: -1 });

  const isSheet = () => window.matchMedia('(max-width: 700px)').matches && window.matchMedia('(pointer: coarse)').matches;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSheet() || e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    // Never hijack a drag that starts on something interactive.
    if (target.closest('input, textarea, select, button, a, [contenteditable]')) return;
    // A scrolling popover only drags from its handle; the rest scrolls.
    if (target.closest('.popover.scrolls') && !target.closest('.sheet-handle')) return;
    // Let inner scroll containers scroll unless they're already at the top.
    const scrollable = target.closest<HTMLElement>('.detail-body, .modal, .today-list, .tpl-list, .activity-list');
    if (scrollable && scrollable.scrollTop > 0) return;
    drag.current = { active: true, startY: e.clientY, id: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.id) return;
    const delta = e.clientY - d.startY;
    // Downward only; a little resistance upward so it feels anchored.
    setDy(delta > 0 ? delta : delta / 6);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.id) return;
    drag.current = { active: false, startY: 0, id: -1 };
    const h = ref.current?.offsetHeight ?? 0;
    // Dismiss past a quarter of the sheet's height, or 120px on a tall sheet.
    if (dy > Math.min(h * 0.25, 120)) onClose();
    else setDy(0);
  };

  const dragging = drag.current.active;
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    style: dy
      ? { transform: `translateY(${dy}px)`, transition: dragging ? 'none' : 'transform 0.2s cubic-bezier(0.2,0.8,0.2,1)', animation: 'none' as const }
      : undefined,
    // Fade the scrim as the sheet is pulled down, so dismissal feels connected.
    scrimStyle: dy > 0 ? { opacity: Math.max(0, 1 - dy / 400), transition: dragging ? 'none' : 'opacity 0.2s' } : undefined,
  };
}

/** Two-option segmented control (radio group), instead of a native select. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={'seg-opt' + (value === o.value ? ' is-on' : '')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Styled checkbox that keeps a real input underneath for a11y and forms. */
export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden="true">
        {checked && <IconCheck size={12} />}
      </span>
      {label}
    </label>
  );
}

// ---------- confirm / prompt ----------

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} labelledBy="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <p style={{ color: 'var(--text2)', fontSize: '0.9rem', lineHeight: 1.5 }}>{message}</p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn"
          data-autofocus
          style={danger ? { background: 'var(--danger)', color: '#fff' } : { background: 'var(--accent)', color: 'var(--on-accent)' }}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  title,
  placeholder,
  initial = '',
  okLabel = 'Add',
  onSubmit,
  onClose,
}: {
  title: string;
  placeholder?: string;
  initial?: string;
  okLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const v = value.trim();
    onClose();
    if (v) onSubmit(v);
  };
  return (
    <Modal onClose={onClose} labelledBy="prompt-title">
      <h2 id="prompt-title">{title}</h2>
      <input
        className="field"
        data-autofocus
        value={value}
        placeholder={placeholder}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={submit}>
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
