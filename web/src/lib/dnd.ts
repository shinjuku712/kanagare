import { useEffect, useRef, useState } from 'react';
import { fullIndex, moveCard, setDragActive } from '../store.ts';

export interface DragPlaceholder {
  colId: number;
  index: number;
  height: number;
}

/** Timestamp of the last completed drag — used to suppress the trailing click. */
export let lastDragEndedAt = 0;

/**
 * Pointer-based card drag & drop, attached by event delegation to the board
 * element. Mouse starts after a 5px threshold; touch after a 280ms long-press.
 * The dragged card leaves the flow; a placeholder gap marks the drop target
 * and siblings shift via the list's FLIP animations.
 *
 * Cards carry `data-card-id`; each column (the whole section, so empty space
 * below the cards is a drop target too) carries `data-col-id`, and its card
 * list `data-cards-scroll`.
 */
export function useCardDrag(boardRef: React.RefObject<HTMLElement | null>) {
  const [dragCardId, setDragCardId] = useState<number | null>(null);
  const [placeholder, setPlaceholder] = useState<DragPlaceholder | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    interface Candidate {
      cardId: number;
      el: HTMLElement;
      startX: number;
      startY: number;
      isTouch: boolean;
      longPressTimer?: number;
    }
    interface Drag {
      cardId: number;
      ghost: HTMLElement;
      height: number;
      offsetX: number;
      offsetY: number;
      baseLeft: number;
      baseTop: number;
    }

    let candidate: Candidate | null = null;
    let drag: Drag | null = null;
    let ph: DragPlaceholder | null = null;
    let raf = 0;
    const pointer = { x: 0, y: 0 };

    const setPh = (p: DragPlaceholder | null) => {
      if (p && ph && p.colId === ph.colId && p.index === ph.index) return;
      ph = p;
      setPlaceholder(p);
    };

    const cancelCandidate = () => {
      if (candidate?.longPressTimer) window.clearTimeout(candidate.longPressTimer);
      candidate = null;
    };

    const computeTarget = (x: number, y: number, excludeCardId: number): DragPlaceholder | null => {
      const under = document.elementFromPoint(x, y);
      const colEl = under?.closest<HTMLElement>('[data-col-id]');
      if (!colEl) return null;
      const colId = Number(colEl.dataset.colId);
      const cardEls = [...colEl.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
        (el) => Number(el.dataset.cardId) !== excludeCardId,
      );
      let index = cardEls.length;
      for (let i = 0; i < cardEls.length; i++) {
        const r = cardEls[i]!.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { colId, index, height: drag?.height ?? 0 };
    };

    const startDrag = (c: Candidate) => {
      window.getSelection()?.removeAllRanges();
      const rect = c.el.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      const clone = c.el.cloneNode(true) as HTMLElement;
      clone.style.width = rect.width + 'px';
      ghost.appendChild(clone);
      ghost.style.left = '0px';
      ghost.style.top = '0px';
      document.body.appendChild(ghost);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      drag = {
        cardId: c.cardId,
        ghost,
        height: rect.height,
        offsetX: c.startX - rect.left,
        offsetY: c.startY - rect.top,
        baseLeft: rect.left,
        baseTop: rect.top,
      };
      candidate = null;
      setDragActive(true);
      setDragCardId(c.cardId);
      const initial = computeTarget(pointer.x, pointer.y, c.cardId);
      setPh(initial ?? { colId: colIdOf(c.el), index: 0, height: rect.height });
      raf = requestAnimationFrame(loop);
    };

    const colIdOf = (el: HTMLElement) => Number(el.closest<HTMLElement>('[data-col-id]')?.dataset.colId ?? 0);

    const loop = () => {
      if (!drag) return;
      const x = pointer.x - drag.offsetX;
      const y = pointer.y - drag.offsetY;
      drag.ghost.style.transform = `translate(${x}px, ${y}px) scale(1.02)`;

      // edge auto-scroll (board horizontally, card list vertically)
      const br = board.getBoundingClientRect();
      const EDGE = 64;
      const SPEED = 16;
      if (pointer.x < br.left + EDGE) board.scrollLeft -= SPEED * ((br.left + EDGE - pointer.x) / EDGE);
      else if (pointer.x > br.right - EDGE) board.scrollLeft += SPEED * ((pointer.x - (br.right - EDGE)) / EDGE);
      const under = document.elementFromPoint(pointer.x, pointer.y);
      const list = under?.closest<HTMLElement>('[data-cards-scroll]');
      if (list) {
        const lr = list.getBoundingClientRect();
        if (pointer.y < lr.top + EDGE) list.scrollTop -= SPEED * 0.75;
        else if (pointer.y > lr.bottom - EDGE) list.scrollTop += SPEED * 0.75;
      }

      const target = computeTarget(pointer.x, pointer.y, drag.cardId);
      if (target) setPh(target);
      raf = requestAnimationFrame(loop);
    };

    const endDrag = (commit: boolean) => {
      if (!drag) return;
      cancelAnimationFrame(raf);
      drag.ghost.remove();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const dropped = ph;
      const cardId = drag.cardId;
      drag = null;
      setPh(null);
      setDragCardId(null);
      lastDragEndedAt = Date.now();
      // The placeholder index counts visible cards; filters may hide others.
      if (commit && dropped) moveCard(cardId, dropped.colId, fullIndex(dropped.colId, dropped.index, cardId));
      setDragActive(false);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, a, [data-no-drag]')) return;
      const cardEl = target.closest<HTMLElement>('[data-card-id]');
      if (!cardEl) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      const c: Candidate = {
        cardId: Number(cardEl.dataset.cardId),
        el: cardEl,
        startX: e.clientX,
        startY: e.clientY,
        isTouch: e.pointerType !== 'mouse',
      };
      if (c.isTouch) {
        c.longPressTimer = window.setTimeout(() => {
          if (candidate === c) {
            if (navigator.vibrate) navigator.vibrate(25);
            startDrag(c);
          }
        }, 280);
      }
      candidate = c;
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (candidate) {
        const dist = Math.hypot(e.clientX - candidate.startX, e.clientY - candidate.startY);
        if (candidate.isTouch) {
          if (dist > 10 && candidate.longPressTimer) cancelCandidate(); // finger is scrolling
        } else if (dist > 5) {
          const c = candidate;
          candidate = null;
          startDrag(c);
        }
      }
      if (drag && e.cancelable) e.preventDefault();
    };

    const onPointerUp = () => {
      cancelCandidate();
      endDrag(true);
    };
    const onPointerCancel = () => {
      cancelCandidate();
      endDrag(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag) endDrag(false);
    };
    // Once a touch drag is active, block native scrolling.
    const onTouchMove = (e: TouchEvent) => {
      if (drag && e.cancelable) e.preventDefault();
    };

    board.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      board.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchmove', onTouchMove);
      endDrag(false);
    };
  }, [boardRef]);

  return { dragCardId, placeholder };
}

/** FLIP: animate children with `data-flip-id` when their layout position changes. */
export function useFlip(ref: React.RefObject<HTMLElement | null>) {
  const rects = useRef(new Map<string, DOMRect>());
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = el.querySelectorAll<HTMLElement>('[data-flip-id]');
    const next = new Map<string, DOMRect>();
    els.forEach((child) => {
      const id = child.dataset.flipId!;
      const rect = child.getBoundingClientRect();
      next.set(id, rect);
      const prev = rects.current.get(id);
      if (prev) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          child.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 190, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          );
        }
      }
    });
    rects.current = next;
  });
}
