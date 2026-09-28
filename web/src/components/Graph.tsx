import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardLinkType, GraphEdge, GraphNode, GraphResponse } from '@shared/types';
import { api } from '../api.ts';
import { useStore } from '../store.ts';
import { IconX, useEscape } from './ui.tsx';

/**
 * Project graph: cards as nodes, links as edges, laid out by a small force
 * simulation on a canvas (no d3; O(n²) is fine at a few hundred cards). The
 * animation loop stops once the layout settles and restarts on interaction.
 */

interface Sim extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}

const EDGE_COLOR: Record<CardLinkType, string> = {
  relates: 'rgba(140,140,160,0.45)',
  blocks: 'rgba(229,83,75,0.75)',
  parent: 'rgba(91,108,240,0.7)',
};

export function Graph({ onClose, onOpenCard }: { onClose: () => void; onOpenCard: (id: number) => void }) {
  const { currentProjectId, projects } = useStore();
  const project = projects.find((p) => p.id === currentProjectId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Hovered node. A ref, not state: the draw loop reads it every frame. */
  const hover = useRef<number | null>(null);

  // View transform (pan/zoom) and simulation state live in refs — mutating them
  // must not trigger React re-renders, the canvas redraws itself.
  const view = useRef({ x: 0, y: 0, k: 1 });
  const nodes = useRef<Sim[]>([]);
  const edges = useRef<GraphEdge[]>([]);
  const alpha = useRef(1);
  const raf = useRef(0);
  /** Once the user pans/zooms, stop auto-fitting so we don't fight them. */
  const userMoved = useRef(false);
  const drag = useRef<{ id: number | null; panning: boolean; lx: number; ly: number; moved: boolean }>({
    id: null,
    panning: false,
    lx: 0,
    ly: 0,
    moved: false,
  });

  useEffect(() => {
    if (!currentProjectId) return;
    api
      .graph(currentProjectId)
      .then((g) => {
        setData(g);
        // Seed positions on a circle so the sim unfolds predictably rather than
        // exploding from a single point.
        const R = 220;
        nodes.current = g.nodes.map((n, i) => {
          const a = (i / Math.max(1, g.nodes.length)) * Math.PI * 2;
          return { ...n, x: Math.cos(a) * R, y: Math.sin(a) * R, vx: 0, vy: 0 };
        });
        edges.current = g.edges;
        alpha.current = 1;
        kick();
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load graph'));
  }, [currentProjectId]);

  const running = useRef(false);
  /** Start the loop if it isn't running (after reheating, panning, zooming). */
  const kick = useCallback(() => {
    if (running.current) return;
    running.current = true;
    raf.current = requestAnimationFrame(() => step());
  }, []);

  const step = useCallback(() => {
    const ns = nodes.current;
    const es = edges.current;
    const a = alpha.current;
    const linked = new Set(es.flatMap((e) => [e.from, e.to]));
    if (a > 0.005 && ns.length) {
      // repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const A = ns[i]!;
          const B = ns[j]!;
          let dx = B.x - A.x;
          let dy = B.y - A.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            d2 = 4;
          }
          const f = (5200 / d2) * a;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          A.vx -= fx;
          A.vy -= fy;
          B.vx += fx;
          B.vy += fy;
        }
      }
      // springs
      const byId = new Map(ns.map((n) => [n.id, n]));
      for (const e of es) {
        const A = byId.get(e.from);
        const B = byId.get(e.to);
        if (!A || !B) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = ((d - 150) * 0.02) * a;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        A.vx += fx;
        A.vy += fy;
        B.vx -= fx;
        B.vy -= fy;
      }
      // centring + integrate
      for (const n of ns) {
        if (n.fixed) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        // Unlinked cards are pulled in harder, so they don't drift to the edges.
        const pull = linked.has(n.id) ? 0.0016 : 0.006;
        n.vx -= n.x * pull * a;
        n.vy -= n.y * pull * a;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
      }
      alpha.current = a * 0.985;
      // Once the layout has mostly settled, frame it: fit all nodes in view with
      // padding. Only auto-fits until the user pans/zooms themselves.
      if (a < 0.28 && !userMoved.current) fitToView();
    }
    draw();
    if (alpha.current > 0.005 || drag.current.id !== null) raf.current = requestAnimationFrame(() => step());
    else running.current = false;
  }, []);

  /** Centre and scale the view so every node is comfortably on screen. */
  const fitToView = useCallback(() => {
    const cv = canvasRef.current;
    const ns = nodes.current;
    if (!cv || !ns.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of ns) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const pad = 90; // room for the labels drawn under each node
    const w = cv.clientWidth || 1;
    const h = cv.clientHeight || 1;
    const gw = Math.max(1, maxX - minX);
    const gh = Math.max(1, maxY - minY);
    const k = Math.min(2.2, Math.max(0.3, Math.min((w - pad * 2) / gw, (h - pad * 2) / gh)));
    const v = view.current;
    // ease toward the target so it doesn't snap
    v.k += (k - v.k) * 0.12;
    v.x += (-((minX + maxX) / 2) * v.k - v.x) * 0.12;
    v.y += (-((minY + maxY) / 2) * v.k - v.y) * 0.12;
  }, []);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue('--text').trim() || '#eee';
    const text3 = css.getPropertyValue('--text3').trim() || '#888';
    const surface = css.getPropertyValue('--surface2').trim() || '#222';
    const bg = css.getPropertyValue('--bg').trim() || '#111';

    const v = view.current;
    ctx.save();
    ctx.translate(w / 2 + v.x, h / 2 + v.y);
    ctx.scale(v.k, v.k);

    const byId = new Map(nodes.current.map((n) => [n.id, n]));

    // edges (drawn first so nodes sit on top)
    ctx.lineWidth = 1.5;
    for (const e of edges.current) {
      const A = byId.get(e.from);
      const B = byId.get(e.to);
      if (!A || !B) continue;
      const dim = hover.current !== null && hover.current !== A.id && hover.current !== B.id;
      ctx.globalAlpha = dim ? 0.15 : 1;
      ctx.strokeStyle = EDGE_COLOR[e.type];
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      // arrowhead for directional types
      if (e.type !== 'relates') {
        const ang = Math.atan2(B.y - A.y, B.x - A.x);
        const r = 20;
        const tx = B.x - Math.cos(ang) * r;
        const ty = B.y - Math.sin(ang) * r;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - Math.cos(ang - 0.4) * 8, ty - Math.sin(ang - 0.4) * 8);
        ctx.lineTo(tx - Math.cos(ang + 0.4) * 8, ty - Math.sin(ang + 0.4) * 8);
        ctx.closePath();
        ctx.fillStyle = EDGE_COLOR[e.type];
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // nodes
    for (const n of nodes.current) {
      const isHover = hover.current === n.id;
      const h = hover.current;
      const dim = h !== null && !isHover && !edges.current.some((e) => (e.from === n.id && e.to === h) || (e.to === n.id && e.from === h));
      ctx.globalAlpha = dim ? 0.25 : 1;
      const r = isHover ? 17 : 14;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.color || n.column_color || surface;
      ctx.fill();
      if (isHover) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = text;
        ctx.stroke();
      }
      // id inside the dot
      ctx.fillStyle = '#fff';
      ctx.font = '600 9px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n.id), n.x, n.y);
      // title under it
      ctx.font = `${isHover ? '600' : '400'} 11px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const label = n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title;
      // A plate behind the label so edges never cut through the text.
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = bg;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.roundRect(n.x - tw / 2 - 5, n.y + r + 2, tw + 10, 17, 5);
      ctx.fill();
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = isHover ? text : text3;
      ctx.fillText(label, n.x, n.y + r + 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, []);

  useEffect(() => {
    kick();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf.current);
      running.current = false;
      window.removeEventListener('resize', onResize);
    };
  }, [kick, draw]);

  useEscape(onClose);

  // ---- pointer interaction ----
  const toWorld = (clientX: number, clientY: number) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const v = view.current;
    return {
      x: (clientX - r.left - r.width / 2 - v.x) / v.k,
      y: (clientY - r.top - r.height / 2 - v.y) / v.k,
    };
  };
  const hit = (clientX: number, clientY: number) => {
    const p = toWorld(clientX, clientY);
    return nodes.current.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= 18) ?? null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const n = hit(e.clientX, e.clientY);
    drag.current = { id: n?.id ?? null, panning: !n, lx: e.clientX, ly: e.clientY, moved: false };
    if (n) n.fixed = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.id === null && !d.panning) {
      const id = hit(e.clientX, e.clientY)?.id ?? null;
      if (id !== hover.current) {
        hover.current = id;
        draw();
      }
      return;
    }
    const dx = e.clientX - d.lx;
    const dy = e.clientY - d.ly;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
    d.lx = e.clientX;
    d.ly = e.clientY;
    if (d.panning) {
      userMoved.current = true;
      view.current.x += dx;
      view.current.y += dy;
      draw();
    } else if (d.id !== null) {
      const n = nodes.current.find((x) => x.id === d.id);
      if (n) {
        const p = toWorld(e.clientX, e.clientY);
        n.x = p.x;
        n.y = p.y;
        alpha.current = Math.max(alpha.current, 0.3); // reheat so neighbours settle
        kick();
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.id !== null) {
      const n = nodes.current.find((x) => x.id === d.id);
      if (n) n.fixed = false;
      if (!d.moved) onOpenCard(d.id); // click, not drag ⇒ open the card
    }
    drag.current = { id: null, panning: false, lx: 0, ly: 0, moved: false };
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent) => {
    userMoved.current = true;
    const v = view.current;
    v.k = Math.min(3, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    draw();
  };

  const linked = useMemo(() => new Set(edges.current.flatMap((e) => [e.from, e.to])), [data]);
  const orphans = (data?.nodes.length ?? 0) - linked.size;

  return (
    <div className="graph-overlay" role="dialog" aria-modal="true" aria-label="Project graph">
      <div className="graph-head">
        <strong>{project?.name ?? 'Graph'}</strong>
        <span className="graph-stats">
          {data ? `${data.nodes.length} cards · ${data.edges.length} links` : 'Loading…'}
          {data && orphans > 0 && ` · ${orphans} unlinked`}
        </span>
        <span className="spacer" />
        <span className="graph-legend">
          <i style={{ background: EDGE_COLOR.blocks }} /> blocks
          <i style={{ background: EDGE_COLOR.parent }} /> subtask
          <i style={{ background: EDGE_COLOR.relates }} /> relates
        </span>
        <button
          className="chip"
          onClick={() => {
            userMoved.current = false;
            alpha.current = Math.max(alpha.current, 0.3);
            kick();
          }}
        >
          Fit
        </button>
        <button className="icon-btn" aria-label="Close graph" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      {error ? (
        <div className="graph-empty">{error}</div>
      ) : data && !data.nodes.length ? (
        <div className="graph-empty">No cards in this project yet.</div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="graph-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              if (hover.current !== null) {
                hover.current = null;
                draw();
              }
            }}
            onWheel={onWheel}
          />
          {data && !data.edges.length && (
            <div className="graph-hint">
              No links yet. Open a card and use <strong>Links</strong> to connect it to another.
            </div>
          )}
        </>
      )}
    </div>
  );
}
