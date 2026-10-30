// @ts-nocheck -- strict index checks relaxed for canvas pixel code.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePinchScale } from './pinch';
import { Button } from '@/components/ui/button';
import { blendModes, type BlendMode, type LayerState } from './doc';
import { AdjustGlyph, DotsGlyph, PlusGlyph, WandGlyph } from './icons';
import { visibleRows } from './layer-tree';
import { adjustmentList, adjustShort } from './Panels';
import { textures } from './textures';
import { cornerSnap } from './docking';

/* Procreate-style layers panel: a compact second toolbar that opens from the
 * Layers button. It shows only the add-layer button on top, the layers and the
 * background row — everything else lives in the per-layer options window.
 * It drags with a mouse or two fingers and snaps only to the four corners,
 * mirroring its layout when seated on the left. Rows are tapped to select /
 * open their options window and hold-dragged vertically to reorder. */

const FolderGlyph = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M3 6.8A1.8 1.8 0 0 1 4.8 5h4.1l2 2.2h8.3A1.8 1.8 0 0 1 21 9v8.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2Z" /></svg>
);
const CaretGlyph = ({ open }: { open: boolean }) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }}><path d="M9 5.5v13L16.5 12 9 5.5Z" /></svg>
);
/* Clipping-mask marker: an arrow that runs up, then right, toward the layer it clips to. */
const ClipArrow = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V8h12" /><path d="M13 4l4 4-4 4" /></svg>
);
/* Procreate's visibility checkbox: a rounded square, filled with a check when visible. */
const CheckGlyph = ({ on, size = 17 }: { on?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    {on && <path d="M7.6 12.4l3 3 5.8-6.8" />}
  </svg>
);
const glyphName = (n: string) => (n === 'Hue, Saturation, Brightness' ? 'HSB' : n);

function LayerThumb({ layer, version }: { layer: LayerState; version: number }) {
  if (layer.kind === 'group') return <span className="pp-lb-kind"><FolderGlyph /></span>;
  if (layer.kind === 'adjust') return <span className="pp-lb-kind pp-lb-kind-adj"><AdjustGlyph name={glyphName(layer.adjust?.name ?? '')} size={24} /></span>;
  return <PixelThumb layer={layer} version={version} />;
}
function PixelThumb({ layer, version }: { layer: LayerState; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const tw = Math.round(74 * dpr), th = Math.round(48 * dpr);
    if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, c.width, c.height);
    const s = Math.min(c.width / layer.canvas.width, c.height / layer.canvas.height);
    const w = layer.canvas.width * s, h = layer.canvas.height * s;
    ctx.drawImage(layer.canvas, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }, [layer, version]);
  return <canvas ref={ref} width={222} height={144} className="pp-lb-canvas" />;
}

/* Option-window glyphs, drawn to match Procreate's dark panel. */
const GS = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const OptEye = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M2.5 12s3.5-6.2 9.5-6.2S21.5 12 21.5 12s-3.5 6.2-9.5 6.2S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.7" /></svg>
);
const OptDuplicate = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><rect x="8.5" y="8.5" width="12" height="12" rx="2.4" /><path d="M15.5 4.5v-.4A2.1 2.1 0 0 0 13.4 2H5.1a2.1 2.1 0 0 0-2.1 2.1v8.3a2.1 2.1 0 0 0 2.1 2.1h.4" /></svg>
);
const OptClear = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M6.6 2.6h6.6l5.3 5.3v11.4a2.2 2.2 0 0 1-2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2V4.8a2.2 2.2 0 0 1 2.2-2.2Z" /><path d="M13 2.8v4.4a1 1 0 0 0 1 1h4.4" /></svg>
);
const OptLock = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" /><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" /></svg>
);
const OptMerge = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M7 3v4.5L12 12l5-4.5V3" /><path d="M12 12v9" /><path d="M8.5 17.5 12 21l3.5-3.5" /></svg>
);
const OptDelete = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M3.5 6.5h17M9 6.5V4.2A1.7 1.7 0 0 1 10.7 2.5h2.6A1.7 1.7 0 0 1 15 4.2v2.3M5.5 6.5l1 13.2a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-13.2" /><path d="M10 10.5v6.5M14 10.5v6.5" /></svg>
);
const OptClip = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M12 3v11" /><path d="M7.5 9.5 12 14l4.5-4.5" /><path d="M4 20.5h16" /></svg>
);
const OptSelect = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS} strokeDasharray="3.2 3.4"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></svg>
);
const OptMask = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.4" fill="currentColor" /><circle cx="12" cy="12" r="4.1" fill="var(--pro-cut, #3a3a3e)" /></svg>
);
const OptCaret = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 9h13L12 16.5 5.5 9Z" /></svg>
);

const POS_KEY = 'pp.lbPos';
const FULL_W = 238;
const COMPACT_W = 106;
type Pos = { x: number; y: number; l?: boolean; r?: boolean; t?: boolean; b?: boolean };

function loadPos(): Pos | null {
  try { const s = localStorage.getItem(POS_KEY); return s ? (JSON.parse(s) as Pos) : null; } catch { return null; }
}

const REC_KEY = 'pp.hideWhenRecording';
const COMPACT_KEY = 'pp.lbCompact';

/** One-finger swipe classifier for the layers bar. Returns 'compact' when the swipe
 *  heads toward the screen edge the bar sits on, 'expand' when it heads away. */
export function swipeIntent(dx: number, dy: number, sideLeft: boolean): 'compact' | 'expand' | null {
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.4) return null;
  const towardEdge = sideLeft ? dx < 0 : dx > 0;
  return towardEdge ? 'compact' : 'expand';
}
const loadRec = () => { try { return JSON.parse(localStorage.getItem(REC_KEY) ?? 'false') === true; } catch { return false; } };

/* Procreate-style opacity slider: a thin light track with a round knob. */
function ProSlider({ value, onChange, label = 'Layer opacity' }: { value: number; onChange: (v: number) => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (clientX - r.left - 11) / Math.max(1, r.width - 22))));
  };
  return (
    <div
      ref={ref}
      className="pp-pro-slider"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      onKeyDown={(e) => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); onChange(value + (e.key === 'ArrowRight' ? 0.05 : -0.05)); } }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e.clientX); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e.clientX); }}
    >
      <span className="pp-pro-slider-track" />
      <span className="pp-pro-slider-knob" style={{ left: `calc(${(value * 100).toFixed(1)}% + ${(11 - value * 22).toFixed(1)}px)` }} />
    </div>
  );
}

export function LayersBar({ layers, activeId, version, background, backgroundVisible, onSelect, onAdd, onToggle, onReorder, onUpdate, onAction, onBackground, onBackgroundVisible, onAdjustments, onNotice, onClose,
  onAddAdjustment, onAddGroup, onAddText, onSelectAll, onShare, onAdjustValue, texture, onTexture }: {
  onAddAdjustment: (name: string) => void;
  onAddGroup: () => void;
  onAddText: () => void;
  onSelectAll: () => void;
  onShare: () => void;
  onAdjustValue: (id: string, value: number) => void;
  texture: string | null;
  onTexture: (id: string | null) => void;
  layers: LayerState[];
  activeId: string;
  version: number;
  background: string;
  backgroundVisible: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onUpdate: (id: string, patch: Partial<LayerState>) => void;
  onAction: (id: string, action: 'duplicate' | 'delete' | 'clear' | 'merge' | 'rename' | 'fill' | 'select' | 'flatten' | 'invert') => void;
  onBackground: () => void;
  onBackgroundVisible: () => void;
  onAdjustments: () => void;
  onNotice?: (message: string) => void;
  onClose?: () => void;
}) {
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const posRef = useRef(pos); posRef.current = pos;
  const [snapping, setSnapping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [options, setOptions] = useState<string | null>(null);
  const [optPos, setOptPos] = useState({ left: 12, top: 80 });
  const [blendOpen, setBlendOpen] = useState(false);
  const [extras, setExtras] = useState(false);
  const [recHide, setRecHide] = useState(loadRec);
  // the layer bar always opens in compact mode; expand it with a swipe outward
  const [compact, setCompactState] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | { left: number; top: number; sub: null | 'adjust' | 'texture' }>(null);
  const rows = visibleRows(layers);
  const openMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const W = 250;
    setMenu({ left: Math.max(12, Math.min(window.innerWidth - W - 12, r.right - W + 6)), top: Math.min(window.innerHeight - 380, r.bottom + 8), sub: null });
  };
  const [nameDraft, setNameDraft] = useState('');
  const setCompact = (v: boolean) => {
    setCompactState(v);
    try { localStorage.setItem(COMPACT_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    // Re-seat in the SAME corner right away using the target width, so the bar
    // never overshoots the screen edge or jumps to the other side mid-animation.
    if (posRef.current) {
      snap(v ? COMPACT_W : FULL_W, true);
      // correct with the real rendered size once the width transition settles
      window.setTimeout(() => { if (posRef.current) snap(undefined, true); }, 420);
    }
  };
  const commitRename = () => {
    if (renaming) { const n = nameDraft.trim(); if (n) onUpdate(renaming, { name: n }); }
    setRenaming(null);
  };
  const [drag, setDrag] = useState<{ index: number; y: number; over: number } | null>(null);
  const morphTimer = useRef<number | undefined>(undefined);
  const flipTimer = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const rowMoved = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowH = 66;
  const sideLeft = !!(pos?.l && !pos.r);
  const sideLeftRef = useRef(sideLeft); sideLeftRef.current = sideLeft;
  const compactRef = useRef(false); compactRef.current = compact;

  const optLayer = layers.find((l) => l.id === options);
  // remember where the bar was seated
  useEffect(() => { if (pos && !dragging) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ } } }, [pos, dragging]);
  // a single tap on the canvas closes the options window first, then the bar
  const optionsRef = useRef(options); optionsRef.current = options;
  const menuRef = useRef(menu); menuRef.current = menu;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    const onTap = () => { if (menuRef.current) setMenu(null); else if (optionsRef.current) setOptions(null); };
    window.addEventListener('pp-close-windows', onTap);
    return () => window.removeEventListener('pp-close-windows', onTap);
  }, []);
  useEffect(() => { setBlendOpen(false); setExtras(false); }, [options]);
  useEffect(() => () => { window.clearTimeout(morphTimer.current); window.clearTimeout(flipTimer.current); }, []);

  const rect = () => {
    const el = rootRef.current;
    if (!el) return { w: compact ? COMPACT_W : FULL_W, h: 320 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };
  const defaultPos = () => {
    const el = rootRef.current;
    if (!el) return { x: window.innerWidth - (compact ? COMPACT_W : FULL_W) - 14, y: 14 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  };
  const clamp = (x: number, y: number) => {
    const { w, h } = rect();
    const maxX = Math.max(6, window.innerWidth - w - 6);
    const maxY = Math.max(6, window.innerHeight - h - 6);
    return { x: Math.max(6, Math.min(maxX, x)), y: Math.max(6, Math.min(maxY, y)) };
  };
  /** Snap to the nearest corner only — never an edge or screen center.
   *  keepSide pins the bar to its current corner (used when folding/unfolding). */
  const snap = (targetW?: number, keepSide = false) => {
    const r0 = rect();
    const w = targetW ?? r0.w, h = r0.h;
    const prev0 = posRef.current;
    const prefer = keepSide && prev0 && (prev0.l || prev0.r) ? { left: !prev0.r, top: !!prev0.t } : undefined;
    const seat = cornerSnap(prev0 ?? defaultPos(), w, h, window.innerWidth, window.innerHeight, 14, prefer);
    const prev = posRef.current;
    const prevSide = prev?.l ? 'l' : prev?.r ? 'r' : null;
    if (prevSide && prevSide !== (seat.l ? 'l' : 'r')) {
      setFlipped(true);
      window.clearTimeout(flipTimer.current);
      flipTimer.current = window.setTimeout(() => setFlipped(false), 560);
    }
    window.clearTimeout(morphTimer.current);
    setSnapping(true);
    morphTimer.current = window.setTimeout(() => setSnapping(false), 480);
    setPos({ x: seat.x, y: seat.y, l: seat.l, r: seat.r, t: seat.t, b: seat.b });
  };
  // keep a seated panel in its corner after resizes
  useEffect(() => {
    const resnap = () => {
      const p = posRef.current;
      if (!p || gest.current) return;
      if (p.l || p.r || p.t || p.b) snap();
    };
    const onResize = () => { resnap(); window.setTimeout(resnap, 60); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- panel drag: mouse drag on the frame, or two fingers anywhere ---------- */
  type Gest = { move: boolean; cx: number; cy: number; pos0: { x: number; y: number }; moved: boolean; lx?: number; ly?: number; multi?: boolean };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<Gest | null>(null);
  const winMove = (e: PointerEvent) => {
    const g = gest.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) { g.lx = e.clientX; g.ly = e.clientY; }
    if (pts.length >= 2) {
      g.multi = true;
      e.preventDefault();
      const [a, b] = pts;
      const p = clamp(g.pos0.x + (a.x + b.x) / 2 - g.cx, g.pos0.y + (a.y + b.y) / 2 - g.cy);
      g.moved = true;
      setPos({ x: p.x, y: p.y });
    } else if (g.move) {
      const [a] = pts;
      const p = clamp(g.pos0.x + a.x - g.cx, g.pos0.y + a.y - g.cy);
      g.moved = true;
      setPos({ x: p.x, y: p.y });
    }
  };
  const winUp = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    window.removeEventListener('pointerdown', winDown, true);
    window.removeEventListener('pointermove', winMove, true);
    window.removeEventListener('pointerup', winUp, true);
    window.removeEventListener('pointercancel', winUp, true);
    const g = gest.current;
    gest.current = null;
    setDragging(false);
    if (!g) return;
    if (!g.moved && !g.multi && !g.move && g.lx !== undefined && e.type === 'pointerup') {
      const intent = swipeIntent(g.lx - g.cx, (g.ly ?? g.cy) - g.cy, sideLeftRef.current);
      if (intent) {
        suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 350);
        if ((intent === 'compact') !== compactRef.current) setCompact(intent === 'compact');
        return;
      }
    }
    if (g.moved) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 350); snap(); }
  };
  const winDown = (e: PointerEvent) => {
    if (!gest.current || pointers.current.has(e.pointerId) || e.pointerType === 'mouse') return;
    if (pointers.current.size >= 2) return;
    e.preventDefault(); e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    gest.current = { move: true, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, pos0: posRef.current ?? defaultPos(), moved: true, multi: true };
    setDragging(true);
  };

  const frameDown = (e: React.PointerEvent) => {
    const onWidget = !!(e.target as HTMLElement).closest('button, .pp-lb-row, input');
    if ((e.target as HTMLElement).closest('input')) return;
    suppressClick.current = false;
    if (e.pointerType === 'mouse') {
      if (onWidget) return;
      e.preventDefault();
      pointers.current.clear();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gest.current = { move: true, cx: e.clientX, cy: e.clientY, pos0: posRef.current ?? defaultPos(), moved: false };
      setDragging(true);
      window.addEventListener('pointermove', winMove, true);
      window.addEventListener('pointerup', winUp, true);
      window.addEventListener('pointercancel', winUp, true);
      return;
    }
    if (gest.current || pointers.current.size > 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // register the gesture so a second finger can claim it for a panel drag,
    // or a one-finger horizontal swipe can fold / unfold the bar
    gest.current = { move: false, cx: e.clientX, cy: e.clientY, pos0: posRef.current ?? defaultPos(), moved: false };
    window.addEventListener('pointerdown', winDown, true);
    window.addEventListener('pointermove', winMove, { capture: true, passive: false });
    window.addEventListener('pointerup', winUp, true);
    window.addEventListener('pointercancel', winUp, true);
  };

  /* ---------- row gesture: hold-drag vertically to reorder ---------- */
  const startDrag = (index: number, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') e.stopPropagation();
    if ((e.target as HTMLElement).closest('input, .pp-lb-name')) return;
    const startY = e.clientY, startX = e.clientX, pid = e.pointerId;
    let started = false;
    let over = index;
    const t = window.setTimeout(() => {
      started = true;
      over = index;
      setDrag({ index, y: 0, over: index });
    }, 280);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const dy = ev.clientY - startY;
      if (!started) {
        if (Math.abs(dy) < 10 && Math.abs(ev.clientX - startX) < 10) return;
        window.clearTimeout(t);
        cleanup();
        return;
      }
      ev.preventDefault();
      over = Math.max(0, Math.min(rows.length - 1, index + Math.round(dy / rowH)));
      setDrag({ index, y: dy, over });
    };
    const up = () => {
      window.clearTimeout(t);
      cleanup();
      if (started) {
        rowMoved.current = true;
        if (over !== index) onReorder(index, over);
      }
      setDrag(null);
    };
    const blockScroll = (ev: TouchEvent) => { if (started && ev.cancelable) ev.preventDefault(); };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', blockScroll);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', blockScroll, { passive: false });
  };

  const cls = ['pp-lb', compact ? 'pp-lb-compact' : '', sideLeft ? 'pp-lb-left' : 'pp-lb-right', dragging ? 'dragging' : '',
    snapping ? 'snapping' : '', flipped ? 'pp-lb-flip' : '', pos?.l ? 'snap-l' : '', pos?.r ? 'snap-r' : '', pos?.t ? 'snap-t' : '', pos?.b ? 'snap-b' : '',
    !pos || (!pos.l && !pos.r && !pos.t && !pos.b) ? 'floating' : ''].filter(Boolean).join(' ');
  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {};

  const blendLabel = (m: string) => blendModes.find((b) => b.mode === m)?.label ?? 'Normal';
  const openOptions = (l: LayerState, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const W = 272, H = 420;
    setOptPos({
      left: Math.max(12, Math.min(window.innerWidth - W - 12, r.left > window.innerWidth / 2 ? r.left - W - 10 : r.right + 10)),
      top: Math.max(12, Math.min(window.innerHeight - H - 12, Math.max(12, r.top - 120))),
    });
    setOptions(l.id);
  };

  usePinchScale(rootRef, 'pp.lbScale', 'top left');

  return (
    <div ref={rootRef} className={cls} style={style as React.CSSProperties}
      onPointerDownCapture={frameDown}
      onClickCapture={(e) => { if (suppressClick.current || rowMoved.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; rowMoved.current = false; } }}>
      <div className="pp-lb-inner">
        {/* compact face: adjustments + add on top, the layers, the background */}
        <div className="pp-lb-main">
          <div className="pp-lb-head">
            {!compact && <Button variant="paint" size="paint" type="button" className={`pp-lb-wand ${menu ? 'on' : ''}`} aria-label="Layer menu" aria-expanded={!!menu} onClick={(e) => { if (menu) setMenu(null); else openMenu(e.currentTarget); }}><DotsGlyph size={20} /></Button>}
            <Button variant="paint" size="paint" type="button" className="pp-circle-btn pp-lb-add" aria-label="Add layer" onClick={onAdd}><PlusGlyph size={22} /></Button>
            <span className="pp-lb-head-spacer" aria-hidden="true" />
          </div>
          <div className="pp-lb-scroll">
            {rows.map((l, i) => {
              let shift = 0;
              if (drag && i !== drag.index) {
                if (drag.index < i && drag.over >= i) shift = -rowH;
                if (drag.index > i && drag.over <= i) shift = rowH;
              }
              const isDrag = drag?.index === i;
              const op = Math.round((l.opacity ?? 1) * 100);
              return (
                <div key={l.id} className="pp-lb-row-wrap"
                  style={{ transform: `translateY(${isDrag ? drag?.y ?? 0 : shift}px)`, zIndex: isDrag ? 2 : undefined, animationDelay: `${Math.min(i * 35, 320)}ms` }}>
                  <div className={`pp-lb-row ${l.id === activeId ? 'active' : ''} ${isDrag ? 'dragging' : ''} ${l.parent ? 'pp-lb-child' : ''} ${l.kind === 'group' ? 'pp-lb-group' : ''} ${l.clip ? 'pp-lb-clipped' : ''}`}
                    onPointerDown={(e) => startDrag(i, e)}
                    onClick={(e) => {
                      if (drag || rowMoved.current) { rowMoved.current = false; return; }
                      if (l.id === activeId) { if (options === l.id) setOptions(null); else openOptions(l, e.currentTarget); }
                      else onSelect(l.id);
                    }}>
                    {l.kind === 'group' && (
                      <button type="button" className="pp-lb-caret" aria-label={l.collapsed ? 'Open folder' : 'Close folder'} aria-expanded={!l.collapsed}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onUpdate(l.id, { collapsed: !l.collapsed }); }}><CaretGlyph open={!l.collapsed} /></button>
                    )}
                    {l.clip && <span className="pp-lb-cliparrow" aria-label="Clipping mask"><ClipArrow /></span>}
                    <div className="pp-lb-thumb">
                      <LayerThumb layer={l} version={version} />
                      {op < 100 && <span className="pp-lb-badge">{op}%</span>}
                      {l.kind === 'group' && <span className="pp-lb-count">{layers.filter((x) => x.parent === l.id).length}</span>}
                    </div>
                    {!compact && (renaming === l.id ? (
                      <input className="pp-lb-name-input" aria-label="Layer name" autoFocus value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }} />
                    ) : (
                      <button type="button" className="pp-lb-name" aria-label={`Rename ${l.name}`}
                        onClick={(e) => { e.stopPropagation(); if (suppressClick.current) return; setNameDraft(l.name); setRenaming(l.id); }}>
                        {l.name}
                        {l.kind === 'adjust' && <small> · {Math.round(l.adjust?.value ?? 0)}%</small>}
                        {l.kind === 'group' && l.blend !== 'source-over' && <small> · {blendModes.find((b) => b.mode === l.blend)?.short}</small>}
                        {l.locked && <small> · Locked</small>}
                        {l.alphaLock && <small> · α</small>}
                      </button>
                    ))}
                    <Button variant="paint" size="paint" type="button" className={`pp-lb-eye pp-lb-check ${l.visible ? 'on' : 'off'}`} aria-label={l.visible ? 'Hide layer' : 'Show layer'} aria-pressed={l.visible} onClick={(e) => { e.stopPropagation(); onToggle(l.id); }}>
                      <CheckGlyph on={l.visible} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pp-lb-foot">
            <Button variant="paint" size="paint" type="button" className="pp-lb-bgdot" style={{ background }} aria-label="Set background to the current color" onClick={onBackground} />
            {!compact && <Button variant="paint" size="paint" type="button" className={`pp-lb-eye pp-lb-check ${backgroundVisible ? 'on' : 'off'}`} aria-label={backgroundVisible ? 'Hide background' : 'Show background'} aria-pressed={backgroundVisible} onClick={onBackgroundVisible}>
              <CheckGlyph on={backgroundVisible} />
            </Button>}
          </div>
        </div>
      </div>

      {/* ⋯ layer menu: Procreate 6 style */}
      {menu && createPortal(
        <div className="pp-pro-window pp-glass-window pp-lb-menu" role="menu" aria-label="Layer menu" style={{ left: menu.left, top: menu.top }}>
          {menu.sub ? (
            <>
              <button type="button" className="pp-lb-menu-back" onClick={() => setMenu({ ...menu, sub: null })}>‹ {menu.sub === 'adjust' ? 'Add Adjustment layer' : 'Canvas texture'}</button>
              <div className="pp-lb-menu-list">
                {menu.sub === 'adjust' ? adjustmentList.filter((a) => a !== 'Liquify').map((a) => (
                  <button key={a} type="button" role="menuitem" onClick={() => { onAddAdjustment(a); setMenu(null); }}>
                    <AdjustGlyph name={glyphName(a)} size={18} /><span>{adjustShort(a)}</span>
                  </button>
                )) : <>
                  <button type="button" role="menuitemradio" aria-checked={!texture} className={!texture ? 'on' : ''} onClick={() => onTexture(null)}><span className="pp-tex-swatch none" /><span>None</span></button>
                  {textures.map((t) => (
                    <button key={t.id} type="button" role="menuitemradio" aria-checked={texture === t.id} className={texture === t.id ? 'on' : ''} onClick={() => onTexture(t.id)}>
                      <span className="pp-tex-swatch" style={{ backgroundImage: `url(${t.url})` }} /><span>{t.name}</span>
                    </button>
                  ))}
                </>}
              </div>
            </>
          ) : (
            <div className="pp-lb-menu-list">
              <button type="button" role="menuitem" onClick={() => { onSelectAll(); setMenu(null); }}><OptSelect size={18} /><span>Select All</span></button>
              <div className="pp-lb-menu-sep" />
              <button type="button" role="menuitem" onClick={() => setMenu({ ...menu, sub: 'adjust' })}><WandGlyph size={18} /><span>Add Adjustment layer</span><em>›</em></button>
              <button type="button" role="menuitem" onClick={() => { onAddText(); setMenu(null); onClose?.(); }}><span className="pp-lb-menu-t">T</span><span>Add text</span></button>
              <button type="button" role="menuitem" onClick={() => { onAddGroup(); setMenu(null); }}><FolderGlyph size={18} /><span>Add folder</span></button>
              <button type="button" role="menuitem" onClick={() => setMenu({ ...menu, sub: 'texture' })}><span className="pp-tex-swatch small" /><span>Canvas texture</span><em>›</em></button>
              <button type="button" role="menuitem" onClick={() => { setMenu(null); onAdjustments(); }}><AdjustGlyph name="Curves" size={18} /><span>Adjustments</span></button>
              <div className="pp-lb-menu-sep" />
              <button type="button" role="menuitem" onClick={() => { onShare(); setMenu(null); }}><svg width={18} height={18} viewBox="0 0 24 24" {...GS}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" /></svg><span>Share</span></button>
              <button type="button" role="menuitem" onClick={() => { onAction(activeId, 'duplicate'); setMenu(null); }}><OptDuplicate size={18} /><span>Duplicate</span></button>
              <div className="pp-lb-menu-sep" />
              <button type="button" role="menuitem" className="danger" onClick={() => { onAction(activeId, 'delete'); setMenu(null); }}><OptDelete size={18} /><span>Delete</span></button>
            </div>
          )}
        </div>, (document.querySelector('.pp-editor') ?? document.body) as HTMLElement
      )}

      {/* Procreate-style layer options window (tap the active layer) */}
      {optLayer && createPortal(
        <>
          <div className="pp-pro-window pp-glass-window" role="menu" aria-label={`Options for ${optLayer.name}`} style={{ left: optPos.left, top: optPos.top }}>
            <div className="pp-pro-titlebar">
              <button type="button" className="pp-pro-title" aria-label={`Rename ${optLayer.name}`} onClick={() => onAction(optLayer.id, 'rename')}>{optLayer.name}</button>
              <button type="button" className="pp-pro-close" aria-label="Close layer options" onClick={() => setOptions(null)}>✕</button>
            </div>
            <Button variant="paint" size="paint" type="button" className="pp-pro-blend" aria-expanded={blendOpen} onClick={() => setBlendOpen((v) => !v)}>
              <span>{blendLabel(optLayer.blend)}</span><OptCaret />
            </Button>
            {blendOpen && (
              <div className="pp-pro-blend-list" role="listbox" aria-label="Blend mode">
                {blendModes.map((b) => (
                  <Button variant="paint" size="paint" key={b.mode} type="button" role="option" aria-selected={optLayer.blend === b.mode}
                    className={optLayer.blend === b.mode ? 'on' : ''}
                    onClick={() => onUpdate(optLayer.id, { blend: b.mode as BlendMode })}>
                    <span>{b.label}</span><em>{b.short}</em>
                  </Button>
                ))}
              </div>
            )}
            <span className="pp-pro-label">Opacity</span>
            <ProSlider value={optLayer.opacity ?? 1} onChange={(v) => onUpdate(optLayer.id, { opacity: v })} />
            {optLayer.kind === 'adjust' && <>
              <span className="pp-pro-label">{optLayer.adjust?.name} · {Math.round(optLayer.adjust?.value ?? 0)}%</span>
              <ProSlider label="Adjustment strength" value={(optLayer.adjust?.value ?? 0) / 100} onChange={(v) => onAdjustValue(optLayer.id, Math.round(v * 100))} />
            </>}
            {optLayer.kind && optLayer.kind !== 'pixel' ? (
              <div className="pp-pro-grid">
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => onToggle(optLayer.id)}><OptEye /><span>{optLayer.visible ? 'Hide' : 'Show'}</span></Button>
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => onAction(optLayer.id, 'duplicate')}><OptDuplicate /><span>Duplicate</span></Button>
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'merge'); setOptions(null); }}><OptMerge /><span>{optLayer.kind === 'group' ? 'Flatten' : 'Merge'}</span></Button>
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'rename'); }}><OptClear /><span>Rename</span></Button>
                {optLayer.kind === 'group' && <Button variant="paint" size="paint" type="button" className={`pp-pro-cell ${optLayer.clip ? 'on' : ''}`} aria-pressed={!!optLayer.clip} onClick={() => onUpdate(optLayer.id, { clip: !optLayer.clip })}><OptClip /><span>Clip</span></Button>}
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'delete'); setOptions(null); }}><OptDelete /><span>Delete</span></Button>
              </div>
            ) : (
            <div className="pp-pro-grid">
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onToggle(optLayer.id); }}>
                <OptEye /><span>Hide</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'duplicate'); }}>
                <OptDuplicate /><span>Duplicate</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'clear'); }}>
                <OptClear /><span>Clear</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className={`pp-pro-cell ${optLayer.locked ? 'on' : ''}`} aria-pressed={optLayer.locked} onClick={() => onUpdate(optLayer.id, { locked: !optLayer.locked })}>
                <OptLock /><span>Lock</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'merge'); }}>
                <OptMerge /><span>Merge</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'delete'); }}>
                <OptDelete /><span>Delete</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className={`pp-pro-cell ${optLayer.clip ? 'on' : ''}`} aria-pressed={!!optLayer.clip} onClick={() => onUpdate(optLayer.id, { clip: !optLayer.clip })}>
                <OptClip /><span>Clip</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'select'); }}>
                <OptSelect /><span>Select</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onNotice?.("Layer masks aren't available yet"); }}>
                <OptMask /><span>Mask</span>
              </Button>
            </div>
            )}
            <div className="pp-pro-foot">
              <label className="pp-pro-rec">
                <span>Hide when recording</span>
                <input type="checkbox" hidden checked={recHide} onChange={(e) => {
                  setRecHide(e.target.checked);
                  try { localStorage.setItem(REC_KEY, JSON.stringify(e.target.checked)); } catch { /* ignore */ }
                }} />
                <span className={`pp-toggle ${recHide ? 'on' : ''}`} aria-hidden="true"><span /></span>
              </label>
              <Button variant="paint" size="paint" type="button" className="pp-pro-more" aria-label="More layer options" aria-expanded={extras} onClick={() => setExtras((v) => !v)}><DotsGlyph size={18} /></Button>
            </div>
            {extras && (
              <div className="pp-pro-extras" role="menu" aria-label="More layer options">
                {([
                  ['rename', 'Rename'], ['fill', 'Fill Layer'], ['invert', 'Invert'],
                ] as const).map(([a, label]) => (
                  <Button variant="paint" size="paint" key={a} type="button" role="menuitem" onClick={() => { onAction(optLayer.id, a); }}>{label}</Button>
                ))}
                <Button variant="paint" size="paint" type="button" role="menuitemcheckbox" aria-checked={optLayer.alphaLock} className={optLayer.alphaLock ? 'on' : ''}
                  onClick={() => onUpdate(optLayer.id, { alphaLock: !optLayer.alphaLock })}>Alpha Lock</Button>
                <Button variant="paint" size="paint" type="button" role="menuitemcheckbox" aria-checked={optLayer.locked} className={optLayer.locked ? 'on' : ''}
                  onClick={() => onUpdate(optLayer.id, { locked: !optLayer.locked })}>Lock</Button>
              </div>
            )}
          </div>
        </>, (document.querySelector('.pp-editor') ?? document.body) as HTMLElement
      )}
    </div>
  );
}
