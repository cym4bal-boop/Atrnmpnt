// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { applyCanvasEffect } from './canvas-ops';
import { brushLibrary, brushTip, eraserTip, stampDab, registerBrushes, getBrushDef, updateBrushDef, type BrushDef } from './brushes';
import { BrushStudio } from './BrushStudio';
import { ColorsSheet, dragOrTap, type ColorTab, type Palette } from './ColorsSheet';
import { blendModes, composite, ctx2d, flatten, makeCanvas, type Floating, type LayerMeta, type LayerState, type LiveStroke, type Texture } from './doc';
import { blockRange, moveRow, visibleRows } from './layer-tree';
import { resolveTexture, textures } from './textures';
import { adjustShort } from './Panels';
import { colorDrop } from './fill';
import { detectShape, type Pt, type QuickShapeResult } from './geometry';
import { ArrowGlyph, BrushGlyph, DotsGlyph, EraserGlyph, LayersGlyph, SelectGlyph, SmudgeGlyph, WrenchGlyph } from './icons';
import { Check, ChevronRight, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Scan } from 'lucide-react';
import { AdjustmentBar, type AdjustmentName } from './Adjustments';
import { TextSheet } from './TextSheet';
import { defaultDraft, drawText, ensureFont, type TextDraft } from './text';
import { LiquifySheet, BlobGhost, LIQ_DEFAULT, type LiqSettings } from './Liquify';
import { ActionsSheet, AdjustmentsSheet, BrushSheet, type ActionId } from './Panels';
import { LayersBar } from './LayersBar';
import { cornerSnap } from './docking';
import { canvasToBlob, clampSize, downloadBlob, loadImage, makeId, type Artwork, type StoredLayer } from './storage';
import { loadHistory, saveHistory, type HistEntry, type HistPixels } from './history-store';
import { saveBackup } from './backups';
import type { HarmonyMode } from './color';
import { DEFAULT_ACCENT, applyCurve, applyTheme, readAccent, readPrefs, writePrefs, type Prefs } from './settings';
import { CanvasPrefs, colorModeFilter } from './CanvasPrefs';
import { exportArnm, exportPsd, exportZip } from './formats';
import { FloatingPicker, type Floater } from './FloatingPicker';
import { usePinchScale } from './pinch';
import { mapToPalette } from './palette-map';
import { Sheet } from './Sheet';

type Tool = 'brush' | 'smudge' | 'eraser' | 'select' | 'transform';
type PaintTool = 'brush' | 'smudge' | 'eraser';
type Panel = null | 'colors' | 'layers' | 'brush' | 'actions' | 'adjust';
type View = { x: number; y: number; scale: number; rot: number; flip: boolean };
type Rect = { x: number; y: number; w: number; h: number };
type Selection = { path: Path2D; outlines: Pt[][]; inverted: boolean; bounds: Rect };
type SelMode = 'Freehand' | 'Rectangle' | 'Ellipse';
type Tf = { tx: number; ty: number; scale: number; rot: number; fx: number; fy: number };

const HISTORY_BYTES = 220 * 1024 * 1024;
const WORKSPACE = '#e4e4e4';

const defaultPalettes: Palette[] = [
  { id: 'default', name: 'Default', colors: ['#000000', '#3a3a3c', '#8e8e93', '#d1d1d6', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#ffe6d9', '#f4b183', '#c55a11', '#5b3a29'] },
  { id: 'earth', name: 'Skin & Earth', colors: ['#fde7d6', '#f6cba8', '#e8a87c', '#c58b5f', '#8d5b3d', '#5a3825', '#2f1d13', '#d9c7a3', '#a89874', '#6f6a4e', '#4e5b3a', '#2e3b2a'] },
];

function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV] as const;
}

const metaOf = (l: LayerState): LayerMeta => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, alphaLock: l.alphaLock, kind: l.kind ?? 'pixel', parent: l.parent, collapsed: l.collapsed, clip: l.clip, adjust: l.adjust ? { ...l.adjust } : undefined });
const unionRect = (a: Rect | null, b: Rect): Rect => {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export function Editor({ artwork, onExit, onSaved }: { artwork: Artwork; onExit: (a: Artwork) => void; onSaved: (a: Artwork) => void | Promise<void> }) {
  const W = artwork.width, H = artwork.height;
  const viewCanvas = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<LayerState[]>([]);
  const [layers, setLayersState] = useState<LayerState[]>([]);
  const [activeId, setActiveIdState] = useState('');
  const activeRef = useRef('');
  const [bg, setBgState] = useState(artwork.background ?? '#ffffff');
  const [bgVisible, setBgVisibleState] = useState(artwork.backgroundVisible ?? true);
  const bgRef = useRef({ color: bg, visible: bgVisible });
  const [title, setTitle] = useState(artwork.title);
  const [texture, setTextureState] = useState<{ id: string; strength: number } | null>(artwork.texture ?? null);
  const textureSel = useRef(texture);
  const texRef = useRef<Texture | null>(null);
  useEffect(() => {
    textureSel.current = texture;
    let off = false;
    void resolveTexture(texture).then((t) => { if (!off) { texRef.current = t; requestRender(); } });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture?.id, texture?.strength]);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [dropWave, setDropWave] = useState<{ x: number; y: number; color: string } | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [brushIds, setBrushIds] = useStored<Record<PaintTool, string>>('pp.brushIds', { brush: 'sleepyhead', smudge: 'soft-brush', eraser: 'soft-brush' });
  const [sizes, setSizes] = useStored<Record<PaintTool, number>>('pp.sizes', { brush: 0.25, smudge: 0.4, eraser: 0.4 });
  const [opacities, setOpacities] = useStored<Record<PaintTool, number>>('pp.opacity', { brush: 1, smudge: 0.7, eraser: 1 });
  const [streamline, setStreamline] = useStored('pp.streamline', 30);
  const [color, setColor] = useStored('pp.color', readAccent());
  const [prevColor, setPrevColor] = useStored('pp.prevColor', '#ffb74d');
  const [recent, setRecent] = useStored<string[]>('pp.recent', []);
  const [palettes, setPalettes] = useStored<Palette[]>('pp.palettes', defaultPalettes);
  const [colorTab, setColorTab] = useStored<ColorTab>('pp.colorTab', 'Harmony');
  const [harmony, setHarmony] = useStored<HarmonyMode>('pp.harmony', 'Tetradic');
  const [expanded, setExpanded] = useStored('pp.toolbarOpen', true);
  const [panel, setPanel] = useState<Panel>(null);
  const [dark, setDark] = useStored('pp.dark', false);
  const [accent, setAccent] = useStored('pp.accent', DEFAULT_ACCENT);
  const [tbPos, setTbPos] = useStored<null | { x: number; y: number; l?: boolean; r?: boolean; t?: boolean; b?: boolean }>('pp.tbPos', null);
  const [tbDrag, setTbDrag] = useState(false);
  const [tbSnapping, setTbSnapping] = useState(false);
  const [tbFlip, setTbFlip] = useState(false);
  const [paletteView, setPaletteView] = useStored<'Compact' | 'Cards'>('pp.paletteView', 'Compact');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tbPosRef = useRef(tbPos); tbPosRef.current = tbPos;
  usePinchScale(toolbarRef, 'pp.tbScale');
  // canvas-only settings (Actions → Settings)
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const [floaters, setFloaters] = useStored<Floater[]>('pp.floaters', []);
  const [grabbedFloater, setGrabbedFloater] = useState<string | null>(null);
  const [hideUI, setHideUI] = useState(false);
  const [sliderHeights, setSliderHeights] = useStored<{ size: number; opacity: number }>('pp.sliderHeights', { size: 108, opacity: 108 });
  const [editingBrush, setEditingBrush] = useState<BrushDef | null>(null);

  /* ---------- toolbar: drag (mouse or two fingers). Snapping is corner-only:
     the nearest corner wins; the bar keeps its size and never folds on its own,
     and it flips its layout when it seats on the opposite left/right side. ---------- */
  type TbGest = { drag: boolean; cx: number; cy: number; pos0: { x: number; y: number }; moved: boolean };
  const tbPointers = useRef(new Map<number, { x: number; y: number }>());
  const tbGest = useRef<TbGest | null>(null);
  const tbMorphTimer = useRef<number | undefined>(undefined);
  const tbFlipTimer = useRef<number | undefined>(undefined);
  const tbSuppressClick = useRef(false);
  const tbRect = () => {
    const el = toolbarRef.current;
    if (!el) return { w: 244, h: 150 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };
  const tbDefaultPos = () => {
    const el = toolbarRef.current;
    if (!el) return { x: 24, y: 60 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  };
  const tbClamp = (x: number, y: number) => {
    const { w, h } = tbRect();
    return { x: Math.max(6, Math.min(window.innerWidth - w - 6, x)), y: Math.max(6, Math.min(window.innerHeight - h - 6, y)) };
  };
  const tbSnap = () => {
    const { w, h } = tbRect();
    const seat = cornerSnap(tbPosRef.current ?? { x: 24, y: 60 }, w, h, window.innerWidth, window.innerHeight);
    // flip pop when the bar seats on the opposite left/right side from before
    const prev = tbPosRef.current;
    const prevSide = prev?.l ? 'l' : prev?.r ? 'r' : null;
    if (prevSide && prevSide !== (seat.l ? 'l' : 'r')) {
      setTbFlip(true);
      window.clearTimeout(tbFlipTimer.current);
      tbFlipTimer.current = window.setTimeout(() => setTbFlip(false), 560);
    }
    window.clearTimeout(tbMorphTimer.current);
    setTbSnapping(true);
    tbMorphTimer.current = window.setTimeout(() => setTbSnapping(false), 480);
    setTbPos({ x: seat.x, y: seat.y, l: seat.l, r: seat.r, t: seat.t, b: seat.b });
  };
  // Toolbar gestures track every finger at window level, so a second finger landing
  // next to the (small) toolbar still counts as a two-finger drag / pinch.
  const tbStartGesture = (pos0: { x: number; y: number }) => {
    const [a, b] = [...tbPointers.current.values()];
    tbGest.current = { drag: true, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, pos0, moved: true };
    setTbDrag(true);
  };
  const tbWinDown = (e: PointerEvent) => {
    if (!tbGest.current || tbPointers.current.has(e.pointerId) || e.pointerType === 'mouse') return;
    if (tbPointers.current.size >= 2) return;
    // second finger: claim it for the toolbar so it never paints on the canvas
    e.preventDefault(); e.stopPropagation();
    tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tbStartGesture(tbPosRef.current ?? tbDefaultPos());
  };
  const tbWinMove = (e: PointerEvent) => {
    const g = tbGest.current;
    if (!g || !tbPointers.current.has(e.pointerId)) return;
    tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...tbPointers.current.values()];
    if (pts.length >= 2) {
      e.preventDefault();
      const [a, b] = pts;
      const p = tbClamp(g.pos0.x + (a.x + b.x) / 2 - g.cx, g.pos0.y + (a.y + b.y) / 2 - g.cy);
      g.moved = true;
      setTbPos({ x: p.x, y: p.y });
    } else if (g.drag) {
      const [a] = pts;
      const p = tbClamp(g.pos0.x + a.x - g.cx, g.pos0.y + a.y - g.cy);
      g.moved = true;
      setTbPos({ x: p.x, y: p.y });
    }
  };
  const tbWinUp = (e: PointerEvent) => {
    if (!tbPointers.current.has(e.pointerId)) return;
    tbPointers.current.delete(e.pointerId);
    if (tbPointers.current.size > 0) return;
    window.removeEventListener('pointerdown', tbWinDown, true);
    window.removeEventListener('pointermove', tbWinMove, true);
    window.removeEventListener('pointerup', tbWinUp, true);
    window.removeEventListener('pointercancel', tbWinUp, true);
    const g = tbGest.current;
    tbGest.current = null;
    setTbDrag(false);
    if (!g) return;
    if (g.moved) { tbSuppressClick.current = true; window.setTimeout(() => { tbSuppressClick.current = false; }, 350); tbSnap(); }
  };
  const tbDown = (e: RPE<HTMLDivElement>) => {
    const onButton = !!(e.target as HTMLElement).closest('button');
    if (onButton && e.pointerType === 'mouse') return;
    if (tbPointers.current.has(e.pointerId)) return;
    const pos0 = tbPosRef.current ?? tbDefaultPos();
    if (tbGest.current && tbPointers.current.size === 1) {
      e.preventDefault();
      tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tbStartGesture(pos0);
      return;
    }
    tbPointers.current.clear();
    tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tbGest.current = { drag: e.pointerType === 'mouse' && !onButton, cx: e.clientX, cy: e.clientY, pos0, moved: false };
    if (e.pointerType === 'mouse') { e.preventDefault(); setTbDrag(true); }
    window.addEventListener('pointerdown', tbWinDown, true);
    window.addEventListener('pointermove', tbWinMove, { capture: true, passive: false });
    window.addEventListener('pointerup', tbWinUp, true);
    window.addEventListener('pointercancel', tbWinUp, true);
  };
  const tbClickGuard = (e: React.MouseEvent) => {
    if (tbSuppressClick.current) { e.preventDefault(); e.stopPropagation(); tbSuppressClick.current = false; }
  };
  useEffect(() => () => { window.clearTimeout(tbMorphTimer.current); window.clearTimeout(tbFlipTimer.current); }, []);
  const tbProps = (extra: string) => {
    const p = tbPos;
    const cls = ['pp-toolbar', extra, tbFlip ? 'pp-tb-flip' : '', tbDrag ? 'dragging' : '', tbSnapping ? 'snapping' : '',
      p?.l ? 'snap-l' : '', p?.r ? 'snap-r' : '', p?.t ? 'snap-t' : '', p?.b ? 'snap-b' : '', p && !p.l && !p.r && !p.t && !p.b ? 'floating' : ''].filter(Boolean).join(' ');
    return {
      ref: toolbarRef,
      className: cls,
      style: p ? { left: p.x, top: p.y, right: 'auto', bottom: 'auto' } : undefined,
      onPointerDown: tbDown, onClickCapture: tbClickGuard,
    };
  };
  // the toolbar starts seated in the top-left corner
  useEffect(() => {
    if (tbPosRef.current) return;
    const id = requestAnimationFrame(() => {
      if (tbPosRef.current) return;
      const seat = cornerSnap({ x: 0, y: 0 }, tbRect().w, tbRect().h, window.innerWidth, window.innerHeight);
      setTbPos({ x: seat.x, y: seat.y, l: seat.l, r: seat.r, t: seat.t, b: seat.b });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // keep the toolbar on screen after resizes / mode changes
  useEffect(() => {
    if (!tbPosRef.current) return;
    const resnap = () => {
      const p = tbPosRef.current;
      if (!p || tbGest.current) return;
      // only re-seat already-snapped toolbars; a floating one stays where it is
      if (p.l || p.r || p.t || p.b) tbSnap();
    };
    const id = requestAnimationFrame(resnap);
    // re-snap once the vertical-bar width transition has settled so the edge seat is exact
    const id2 = window.setTimeout(resnap, 430);
    return () => { cancelAnimationFrame(id); window.clearTimeout(id2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);
  const [actionTab, setActionTab] = useState('Add');
  useEffect(() => { applyTheme(dark, accent); }, [dark, accent]);
  const [toast, setToast] = useState('');
  const previewTimer = useRef(0);
  const [loupe, setLoupe] = useState<null | { x: number; y: number; color: string; old: string }>(null);
  const [ghost, setGhost] = useState<null | { x: number; y: number; color: string; gliding?: boolean }>(null);
  const [drop, setDrop] = useState<null | { x: number; y: number; color: string; threshold: number; layerId: string; base: HTMLCanvasElement; continuing?: boolean }>(null);
  const [selection, setSelectionState] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const [selMode, setSelMode] = useState<SelMode>('Freehand');
  const [guide, setGuide] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<null | { name: string; value: number; base: HTMLCanvasElement; layerId: string }>(null);
  const [liq, setLiq] = useStored<LiqSettings>('pp.liq', LIQ_DEFAULT);
  const [dropThreshold, setDropThreshold] = useStored('pp.dropThreshold', 34);
  const [dropSliding, setDropSliding] = useState(false);
  const [clipMenu, setClipMenu] = useState(false); // three-finger swipe down: cut / copy / paste
  const [tf, setTfState] = useState<Tf>({ tx: 0, ty: 0, scale: 1, rot: 0, fx: 1, fy: 1 });
  const [tfMode, setTfMode] = useState<'Freeform' | 'Uniform'>('Uniform');
  const [interp, setInterp] = useStored<'Nearest neighbor' | 'Bilinear' | 'Bicubic'>('pp.interp', 'Nearest neighbor');
  const interpRef = useRef(interp); interpRef.current = interp;
  const cycleInterp = () => {
    const order = ['Nearest neighbor', 'Bilinear', 'Bicubic'] as const;
    const next = order[(order.indexOf(interpRef.current) + 1) % order.length]!;
    setInterp(next);
    flash(`Interpolation: ${next}`);
  };
  const tfRef = useRef(tf);
  const floatingRef = useRef<null | { layerId: string; canvas: HTMLCanvasElement; bounds: Rect }>(null);
  const [floatingOn, setFloatingOn] = useState(false);
  const [textDraft, setTextDraft] = useState<null | TextDraft>(null);
  const textPreview = useRef<HTMLCanvasElement | null>(null);
  const [historyInfo, setHistoryInfo] = useState({ undo: 0, redo: 0 });

  const view = useRef<View>({ x: 0, y: 0, scale: 1, rot: 0, flip: false });
  const undoStack = useRef<HistEntry[]>([]);
  const redoStack = useRef<HistEntry[]>([]);
  const strokeCanvas = useRef<HTMLCanvasElement | null>(null);
  const backup = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<LiveStroke | null>(null);
  const draftOverlay = useRef<null | { kind: 'lasso'; points: Pt[] } | { kind: 'rect' | 'ellipse'; from: Pt; to: Pt }>(null);
  const clipboard = useRef<HTMLCanvasElement | null>(null);
  const dirty = useRef(new Set<string>());
  const blobCache = useRef(new Map<string, Blob>());
  const saveTimer = useRef<number | undefined>(undefined);
  const renderQueued = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setTf = (t: Tf) => { tfRef.current = t; setTfState(t); requestRender(); };
  const setSelection = (s: Selection | null) => { selectionRef.current = s; setSelectionState(s); requestRender(); };
  const setLayers = (next: LayerState[]) => { layersRef.current = next; setLayersState(next); };
  const setActiveId = (id: string) => { activeRef.current = id; setActiveIdState(id); };
  const setBg = (c: string) => { bgRef.current.color = c; setBgState(c); requestRender(); };
  const setBgVisible = (v: boolean) => { bgRef.current.visible = v; setBgVisibleState(v); requestRender(); };
  const active = () => layersRef.current.find((l) => l.id === activeRef.current) ?? layersRef.current[0];
  const notPixel = (l: LayerState) => {
    if ((l.kind ?? 'pixel') === 'pixel') return false;
    flash(l.kind === 'group' ? 'Select a layer inside the folder to paint' : 'Adjustment layers can’t be painted on');
    return true;
  };
  const flash = useCallback((m: string) => setToast(m), []);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 1700); return () => window.clearTimeout(t); }, [toast]);

  const docScale = Math.max(W, H) / 1500;
  const paintTool: PaintTool = tool === 'smudge' || tool === 'eraser' ? tool : 'brush';
  const brushFor = (t: PaintTool): BrushDef => brushLibrary.find((b) => b.id === brushIds[t]) ?? brushLibrary[0];
  const sizePx = (t: PaintTool) => Math.max(1, brushFor(t).maxSize * Math.pow(sizes[t], 1.7) * Math.max(docScale, 0.02) * 2.2);
  const colorRef = useRef(color); colorRef.current = color;
  const paintToolRef = useRef(paintTool); paintToolRef.current = paintTool;
  const sliderPreview = useRef<null | { kind: 'size' | 'opacity'; value: number }>(null);

  /* ---------- load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored: StoredLayer[] = artwork.layers?.length ? artwork.layers : [{ id: makeId(), name: 'Layer 1', visible: true }];
      const built: LayerState[] = [];
      for (const s of stored) {
        const c = makeCanvas(W, H);
        if (s.image) {
          try { const img = await loadImage(s.image); ctx2d(c).drawImage(img, 0, 0, W, H); } catch { /* skip broken layer */ }
          if (s.image instanceof Blob) blobCache.current.set(s.id, s.image);
        }
        built.push({ id: s.id, name: s.name, visible: s.visible !== false, opacity: s.opacity ?? 1, blend: s.blend ?? 'source-over', locked: !!s.locked, alphaLock: !!s.alphaLock, kind: s.kind ?? 'pixel', parent: s.parent, collapsed: s.collapsed, clip: s.clip, adjust: s.adjust, canvas: c });
      }
      if (cancelled) return;
      strokeCanvas.current = makeCanvas(W, H);
      backup.current = makeCanvas(W, H);
      setLayers(built);
      setActiveId(built[0].id);
      setReady(true);
      fitView();
      const ss = artwork.selection;
      if (ss?.outlines?.[0]?.length) { const sel = buildSelection(ss.outlines[0], ss.inverted); if (sel) setSelection(sel); }
      // undo/redo history survives leaving the canvas
      void loadHistory(artwork.id).then((h) => {
        if (!h || cancelled) return;
        undoStack.current = h.undo;
        redoStack.current = h.redo;
        setHistoryInfo({ undo: h.undo.length, redo: h.redo.length });
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- view & rendering ---------- */
  const matrix = () => {
    const v = view.current;
    return new DOMMatrix().translate(v.x, v.y).rotate(v.rot).scale(v.scale * (v.flip ? -1 : 1), v.scale);
  };
  const toDoc = (clientX: number, clientY: number): Pt => {
    const r = viewCanvas.current!.getBoundingClientRect();
    const p = matrix().inverse().transformPoint(new DOMPoint(clientX - r.left, clientY - r.top));
    return { x: p.x, y: p.y };
  };
  const toScreen = (p: Pt): Pt => {
    const r = viewCanvas.current!.getBoundingClientRect();
    const q = matrix().transformPoint(new DOMPoint(p.x, p.y));
    return { x: q.x + r.left, y: q.y + r.top };
  };
  function fitView() {
    const el = wrapRef.current;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    const s = Math.min(cw / W, ch / H);
    view.current = { x: (cw - W * s) / 2, y: (ch - H * s) / 2, scale: s, rot: 0, flip: view.current.flip };
    if (view.current.flip) view.current.x += W * s;
    requestRender();
  }

  const tfMatrix = (t: Tf, b: Rect) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return new DOMMatrix().translate(cx + t.tx, cy + t.ty).rotate(t.rot).scale(t.scale * t.fx, t.scale * t.fy).translate(-cx, -cy);
  };

  const render = () => {
    renderQueued.current = false;
    const c = viewCanvas.current;
    if (!c || !layersRef.current.length) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // workspace behind the canvas: dark in dark mode, separate from the artwork background
    ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#151517' : WORKSPACE;
    ctx.fillRect(0, 0, c.width, c.height);
    const m = new DOMMatrix().scale(dpr, dpr).multiply(matrix());
    ctx.setTransform(m);
    ctx.imageSmoothingEnabled = view.current.scale < 2;
    ctx.save();
    ctx.shadowColor = document.documentElement.classList.contains('dark') ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (!bgRef.current.visible) {
      // transparency checkerboard
      const sz = Math.max(8, 14 / view.current.scale);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e9e9e9';
      for (let y = 0; y < H; y += sz) for (let x = (Math.floor(y / sz) % 2) * sz; x < W; x += sz * 2) ctx.fillRect(x, y, sz, sz);
    }
    const f = floatingRef.current;
    const floating: Floating | null = f ? { layerId: f.layerId, canvas: f.canvas, matrix: tfMatrix(tfRef.current, f.bounds) } : null;
    composite(ctx, layersRef.current, bgRef.current.color, bgRef.current.visible, { stroke: live.current, floating, texture: texRef.current });
    if (textPreview.current) ctx.drawImage(textPreview.current, 0, 0);
    if (guideRef.current) {
      const step = Math.max(W, H) / 12;
      ctx.strokeStyle = 'rgba(0,122,255,0.35)';
      ctx.lineWidth = 1 / view.current.scale;
      ctx.beginPath();
      for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    ctx.restore();
    // overlays (selection, drafts, transform box)
    const lw = 1 / view.current.scale;
    const ants = (draw: () => void) => {
      ctx.save();
      ctx.lineWidth = lw * 1.2;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      draw(); ctx.stroke();
      ctx.setLineDash([5 * lw, 5 * lw]);
      ctx.strokeStyle = '#1c1c1e';
      draw(); ctx.stroke();
      ctx.restore();
    };
    const sel = selectionRef.current;
    if (sel && !f) {
      ctx.save();
      if (sel.inverted) { ctx.fillStyle = 'rgba(0,0,0,0)'; }
      else {
        ctx.fillStyle = 'rgba(30,30,40,0.18)';
        ctx.beginPath(); ctx.rect(0, 0, W, H);
        sel.outlines.forEach((o) => { o.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); });
        ctx.fill('evenodd');
      }
      ctx.restore();
      ants(() => { ctx.beginPath(); sel.outlines.forEach((o) => { o.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }); });
    }
    const d = draftOverlay.current;
    if (d) {
      ants(() => {
        ctx.beginPath();
        if (d.kind === 'lasso') d.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        else if (d.kind === 'rect') ctx.rect(Math.min(d.from.x, d.to.x), Math.min(d.from.y, d.to.y), Math.abs(d.to.x - d.from.x), Math.abs(d.to.y - d.from.y));
        else ctx.ellipse((d.from.x + d.to.x) / 2, (d.from.y + d.to.y) / 2, Math.abs(d.to.x - d.from.x) / 2 || 1, Math.abs(d.to.y - d.from.y) / 2 || 1, 0, 0, Math.PI * 2);
      });
    }
    if (f && floating) {
      ctx.save();
      ctx.setTransform(m.multiply(floating.matrix));
      const s = tfRef.current.scale;
      ctx.lineWidth = lw / s * 1.5;
      ctx.strokeStyle = '#0a84ff';
      ctx.setLineDash([6 * lw / s, 4 * lw / s]);
      ctx.strokeRect(f.bounds.x, f.bounds.y, f.bounds.w, f.bounds.h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      const hs = 7 * lw / s;
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, b]) => {
        ctx.beginPath(); ctx.arc(f.bounds.x + a * f.bounds.w, f.bounds.y + b * f.bounds.h, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    }
    // live brush size / opacity preview, drawn directly on the canvas.
    // The tip is rendered natively at the preview size so the size preview
    // truly grows with the slider, and the opacity preview shows the same
    // brush dimmed to the current opacity.
    const pv = sliderPreview.current;
    if (pv && !live.current) {
      const r = c.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const cx = r.width / 2, cy = r.height / 2;
      let rad = 36;
      ctx.save();
      const t = paintToolRef.current;
      const brush = brushFor(t);
      const s = Math.max(12, Math.min(r.width * 0.85, r.height * 0.85, sizePx(t) * view.current.scale));
      // render the tip at its native resolution (capped) — never an upscaled sprite
      const px = Math.max(16, Math.min(Math.ceil(s), 512));
      const tip = t === 'brush' ? brushTip(brush, colorRef.current, px) : eraserTip(brush, px);
      if (pv.kind === 'size') {
        ctx.drawImage(tip, cx - s / 2, cy - s / 2, s, s);
        rad = s / 2;
      } else {
        ctx.globalAlpha = pv.value;
        ctx.drawImage(tip, cx - s / 2, cy - s / 2, s, s);
        ctx.globalAlpha = 1;
        rad = s / 2;
      }
      const label = `${Math.round(pv.value * 100)}%`;
      ctx.font = '600 15px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const py = Math.min(cy + rad + 24, r.height - 26);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(cx - tw / 2 - 12, py - 13, tw + 24, 26, 13); else ctx.rect(cx - tw / 2 - 12, py - 13, tw + 24, 26);
      ctx.fillStyle = 'rgba(20,20,20,.55)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, cx, py);
      ctx.restore();
    }
  };
  const guideRef = useRef(guide);
  guideRef.current = guide;
  function requestRender() {
    if (renderQueued.current) return;
    renderQueued.current = true;
    requestAnimationFrame(render);
  }
  useEffect(() => { requestRender(); });

  useEffect(() => {
    const resize = () => {
      const c = viewCanvas.current, el = wrapRef.current;
      if (!c || !el) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(el.clientWidth * dpr);
      c.height = Math.round(el.clientHeight * dpr);
      requestRender();
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- history ---------- */
  const capture = (ids: string[], rect?: Rect, fromBackup?: HTMLCanvasElement): HistEntry => {
    const pixels = new Map<string, HistPixels>();
    for (const id of ids) {
      const l = layersRef.current.find((x) => x.id === id);
      if (!l) continue;
      const r = rect ? clipRect(rect) : { x: 0, y: 0, w: W, h: H };
      if (r.w <= 0 || r.h <= 0) continue;
      const src = fromBackup ?? l.canvas;
      pixels.set(id, { rect: r, data: src.getContext('2d', { willReadFrequently: true })!.getImageData(r.x, r.y, r.w, r.h) });
    }
    return { metas: layersRef.current.map(metaOf), activeId: activeRef.current, bg: bgRef.current.color, bgVisible: bgRef.current.visible, pixels };
  };
  const clipRect = (r: Rect): Rect => {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    return { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y };
  };
  const bytes = (e: HistEntry) => { let b = 0; e.pixels.forEach((p) => (b += p.data.data.length)); return b + 1000; };
  const pushEntry = (e: HistEntry) => {
    undoStack.current.push(e);
    redoStack.current = [];
    let total = undoStack.current.reduce((s, x) => s + bytes(x), 0);
    while (total > HISTORY_BYTES && undoStack.current.length > 1) total -= bytes(undoStack.current.shift()!);
    while (undoStack.current.length > Math.max(5, prefsRef.current.historyLimit || 60)) undoStack.current.shift();
    setHistoryInfo({ undo: undoStack.current.length, redo: 0 });
  };
  const pushHistory = (ids: string[] = [], rect?: Rect) => pushEntry(capture(ids, rect));
  const restore = (e: HistEntry) => {
    const byId = new Map(layersRef.current.map((l) => [l.id, l]));
    const next = e.metas.map((m) => {
      const existing = byId.get(m.id);
      const canvas = existing?.canvas ?? makeCanvas(W, H);
      return { ...m, canvas };
    });
    e.pixels.forEach((p, id) => {
      const l = next.find((x) => x.id === id);
      if (l) { l.canvas.getContext('2d')!.putImageData(p.data, p.rect.x, p.rect.y); dirty.current.add(id); }
    });
    next.forEach((l) => dirty.current.add(l.id));
    setLayers(next);
    setActiveId(next.some((l) => l.id === e.activeId) ? e.activeId : next[0].id);
    setBg(e.bg); setBgVisible(e.bgVisible);
    bump();
  };
  const inverseOf = (e: HistEntry) => {
    const ids = new Set(e.pixels.keys());
    const keep = new Set(e.metas.map((m) => m.id));
    const extra = layersRef.current.filter((l) => !keep.has(l.id)).map((l) => l.id);
    const inv = capture([...ids], undefined);
    // match rects for partial entries
    e.pixels.forEach((p, id) => {
      const l = layersRef.current.find((x) => x.id === id);
      if (l) inv.pixels.set(id, { rect: p.rect, data: l.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(p.rect.x, p.rect.y, p.rect.w, p.rect.h) });
    });
    extra.forEach((id) => {
      const l = layersRef.current.find((x) => x.id === id)!;
      inv.pixels.set(id, { rect: { x: 0, y: 0, w: W, h: H }, data: l.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H) });
    });
    return inv;
  };
  const undo = () => {
    finishTransientModes();
    const e = undoStack.current.pop();
    if (!e) { flash('Nothing to undo'); return; }
    redoStack.current.push(inverseOf(e));
    restore(e);
    setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
    flash('Undo');
  };
  const redo = () => {
    finishTransientModes();
    const e = redoStack.current.pop();
    if (!e) { flash('Nothing to redo'); return; }
    undoStack.current.push(inverseOf(e));
    restore(e);
    setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
    flash('Redo');
  };

  /* ---------- saving ---------- */
  const changedSinceOpen = useRef(false);
  const bump = () => { changedSinceOpen.current = true; setVersion((v) => v + 1); requestRender(); scheduleSave(); };
  const markDirty = (id: string) => { dirty.current.add(id); bump(); };
  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void save().catch(() => flash("Could not save artwork. Please try again.")); }, 1500);
  };
  const save = async (): Promise<Artwork> => {
    window.clearTimeout(saveTimer.current);
    const ls = layersRef.current;
    const stored: StoredLayer[] = [];
    for (const l of ls) {
      let blob = blobCache.current.get(l.id);
      if (!blob || dirty.current.has(l.id)) {
        blob = await canvasToBlob(l.canvas);
        blobCache.current.set(l.id, blob);
      }
      stored.push({ ...metaOf(l), image: blob });
    }
    dirty.current.clear();
    const preview = ls.length ? flatten(ls, bgRef.current.color, bgRef.current.visible, 1400, texRef.current).toDataURL(bgRef.current.visible ? 'image/jpeg' : 'image/png', 0.95) : artwork.preview;
    const next: Artwork = { ...artwork, title: titleRef.current, layers: stored, preview, background: bgRef.current.color, backgroundVisible: bgRef.current.visible, texture: textureSel.current, selection: selectionRef.current ? { outlines: selectionRef.current.outlines, inverted: selectionRef.current.inverted } : null, updated: Date.now() };
    await onSaved(next);
    return next;
  };
  const titleRef = useRef(title);
  titleRef.current = title;

  const exit = async () => {
    finishTransientModes();
    const a = await save();
    // keep the undo/redo stacks for next time, and snapshot a restorable backup
    void saveHistory(artwork.id, undoStack.current, redoStack.current);
    if (changedSinceOpen.current) void saveBackup(a);
    onExit(a);
  };

  /* ---------- painting ---------- */
  type StrokeState = {
    tool: PaintTool; brush: BrushDef; tip: HTMLCanvasElement; size: number; layer: LayerState;
    last: Pt; smooth: Pt; travelled: number; residual: number; started: number; pressure: number;
    raw: Pt[]; bbox: Rect | null; smudgeBuf?: HTMLCanvasElement; shape: QuickShapeResult; shapeAnchor?: Pt;
  };
  const stroke = useRef<StrokeState | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const eyedropTimer = useRef<number | undefined>(undefined);

  const beginStroke = (p: Pt, pressure: number) => {
    const layer = active();
    if (!layer) return false;
    if (notPixel(layer)) return false;
    if (layer.locked) { flash('Layer is locked'); return false; }
    if (!layer.visible) { flash('Layer is hidden'); return false; }
    const t = paintTool;
    const brush = brushFor(t);
    const size = sizePx(t);
    ctx2d(backup.current!).clearRect(0, 0, W, H);
    ctx2d(backup.current!).drawImage(layer.canvas, 0, 0);
    const st: StrokeState = { tool: t, brush, tip: t === 'brush' ? brushTip(brush, color) : eraserTip(brush), size, layer, last: p, smooth: p, travelled: 0, residual: 0, started: performance.now(), pressure, raw: [p], bbox: null, shape: null };
    if (t === 'brush') {
      ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H);
      live.current = { layerId: layer.id, canvas: strokeCanvas.current!, alpha: opacities.brush, clip: selectionRef.current?.path ?? null, alphaLock: layer.alphaLock };
    }
    if (t === 'smudge') {
      const s = Math.ceil(size) + 2;
      const buf = makeCanvas(s, s);
      ctx2d(buf).drawImage(layer.canvas, p.x - s / 2, p.y - s / 2, s, s, 0, 0, s, s);
      st.smudgeBuf = buf;
    }
    stroke.current = st;
    dab(st, p, pressure);
    requestRender();
    return true;
  };

  const dab = (st: StrokeState, p: Pt, pressure: number) => {
    const sel = selectionRef.current;
    if (st.tool === 'brush') {
      const c = ctx2d(strokeCanvas.current!);
      const s = stampDab(c, st.tip, st.brush, { ...p, pressure, travelled: st.travelled }, st.size);
      st.bbox = unionRect(st.bbox, { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 });
    } else if (st.tool === 'eraser') {
      const c = ctx2d(st.layer.canvas);
      c.save();
      if (sel) c.clip(sel.path, 'evenodd');
      c.globalCompositeOperation = 'destination-out';
      const s = stampDab(c, st.tip, st.brush, { ...p, pressure, travelled: st.travelled }, st.size, opacities.eraser);
      c.restore();
      st.bbox = unionRect(st.bbox, { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 });
    } else if (st.smudgeBuf) {
      const buf = st.smudgeBuf;
      const s = buf.width;
      const masked = makeCanvas(s, s);
      const mc = ctx2d(masked);
      mc.drawImage(buf, 0, 0);
      mc.globalCompositeOperation = 'destination-in';
      mc.drawImage(st.tip, 0, 0, s, s);
      const c = ctx2d(st.layer.canvas);
      c.save();
      if (sel) c.clip(sel.path, 'evenodd');
      if (st.layer.alphaLock) c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = opacities.smudge * (0.35 + 0.65 * pressure);
      c.drawImage(masked, p.x - s / 2, p.y - s / 2);
      c.restore();
      const bc = ctx2d(buf);
      bc.globalAlpha = 0.25;
      bc.drawImage(st.layer.canvas, p.x - s / 2, p.y - s / 2, s, s, 0, 0, s, s);
      bc.globalAlpha = 1;
      st.bbox = unionRect(st.bbox, { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 });
    }
  };

  const strokeTo = (st: StrokeState, target: Pt, pressure: number) => {
    const k = 1 - (streamline / 100) * 0.88;
    pressure = st.pressure + (pressure - st.pressure) * 0.45;
    const sm = { x: st.smooth.x + (target.x - st.smooth.x) * k, y: st.smooth.y + (target.y - st.smooth.y) * k };
    st.smooth = sm;
    const dx = sm.x - st.last.x, dy = sm.y - st.last.y;
    const dist = Math.hypot(dx, dy);
    const spacing = Math.max(0.4, st.size * st.brush.spacing);
    let d = spacing - st.residual;
    while (d <= dist) {
      const t = d / dist;
      const pt = { x: st.last.x + dx * t, y: st.last.y + dy * t };
      st.travelled += spacing;
      const pr = st.pressure + (pressure - st.pressure) * t;
      dab(st, pt, pr);
      d += spacing;
    }
    st.residual = dist - (d - spacing);
    st.last = sm;
    st.pressure = pressure;
  };

  const redrawShape = (st: StrokeState) => {
    const s = st.shape;
    if (!s) return;
    if (st.tool === 'brush') ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H);
    else { const c = ctx2d(st.layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(backup.current!, 0, 0); }
    let pts: Pt[] = [];
    if (s.kind === 'line') pts = [s.from, s.to];
    else if (s.kind === 'rect') pts = [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }, { x: s.x, y: s.y }];
    else {
      const n = 160;
      for (let i = 0; i <= n; i++) pts.push({ x: s.cx + Math.cos((i / n) * Math.PI * 2) * s.rx, y: s.cy + Math.sin((i / n) * Math.PI * 2) * s.ry });
    }
    st.travelled = st.size * 10; st.residual = 0; st.last = pts[0]; st.smooth = pts[0]; st.pressure = 1;
    const savedStream = streamline;
    dab(st, pts[0], 1);
    for (const p of pts.slice(1)) {
      // bypass streamline while tracing a perfect shape
      const dx = p.x - st.last.x, dy = p.y - st.last.y;
      const dist = Math.hypot(dx, dy);
      const spacing = Math.max(0.4, st.size * st.brush.spacing);
      for (let d = spacing; d <= dist; d += spacing) dab(st, { x: st.last.x + (dx * d) / dist, y: st.last.y + (dy * d) / dist }, 1);
      st.last = p;
    }
    void savedStream;
    requestRender();
  };

  const triggerQuickShape = () => {
    const st = stroke.current;
    if (!st || st.tool === 'smudge' || st.shape || !prefsRef.current.shapeDetection) return;
    const s = detectShape(st.raw);
    if (!s) return;
    let shape = s;
    if (s.kind === 'ellipse' && s.circle) { const r = (s.rx + s.ry) / 2; shape = { ...s, rx: r, ry: r }; }
    st.shape = shape;
    st.shapeAnchor = st.raw[st.raw.length - 1];
    redrawShape(st);
    flash(`QuickShape · ${shape.kind === 'line' ? 'Line' : shape.kind === 'rect' ? 'Rectangle' : (shape as { circle: boolean }).circle ? 'Circle' : 'Ellipse'}`);
  };

  const adjustShape = (st: StrokeState, p: Pt) => {
    const s = st.shape;
    if (!s || !st.shapeAnchor) return;
    if (s.kind === 'line') st.shape = { ...s, to: p };
    else if (s.kind === 'rect') st.shape = { ...s, w: p.x - s.x, h: p.y - s.y };
    else {
      const a = st.shapeAnchor;
      const k = Math.hypot(p.x - s.cx, p.y - s.cy) / Math.max(1, Math.hypot(a.x - s.cx, a.y - s.cy));
      st.shape = { ...s, rx: s.rx * k, ry: s.ry * k };
      st.shapeAnchor = p;
    }
    redrawShape(st);
  };

  const endStroke = () => {
    window.clearTimeout(holdTimer.current);
    const st = stroke.current;
    if (!st) return;
    stroke.current = null;
    const rect = st.shape || st.tool !== 'brush' ? { x: 0, y: 0, w: W, h: H } : st.bbox ?? { x: 0, y: 0, w: 1, h: 1 };
    const fullRect = st.shape ? { x: 0, y: 0, w: W, h: H } : rect;
    pushEntry(capture([st.layer.id], fullRect, backup.current!));
    if (st.tool === 'brush') {
      const c = ctx2d(st.layer.canvas);
      c.save();
      if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
      c.globalAlpha = opacities.brush;
      if (st.layer.alphaLock) c.globalCompositeOperation = 'source-atop';
      c.drawImage(strokeCanvas.current!, 0, 0);
      c.restore();
      ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H);
      live.current = null;
    }
    markDirty(st.layer.id);
  };

  const cancelStroke = () => {
    window.clearTimeout(holdTimer.current);
    const st = stroke.current;
    if (!st) return;
    stroke.current = null;
    if (st.tool === 'brush') { ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H); live.current = null; }
    else { const c = ctx2d(st.layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(backup.current!, 0, 0); }
    requestRender();
  };

  /* ---------- eyedropper ---------- */
  const sampleAt = (p: Pt) => {
    const c = makeCanvas(1, 1);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.translate(-Math.floor(p.x), -Math.floor(p.y));
    composite(ctx, layersRef.current, bgRef.current.color, true);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const eyedropAt = (clientX: number, clientY: number, old: string) => {
    const p = toDoc(clientX, clientY);
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
    const c = sampleAt(p);
    setLoupe({ x: clientX, y: clientY, color: c, old });
  };

  const pickColor = (c: string) => {
    if (c.toLowerCase() === color.toLowerCase()) return;
    setPrevColor(color);
    setColor(c);
  };
  const commitRecent = (c: string = color) => setRecent((r) => [c, ...r.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 20));

  /* ---------- ColorDrop ---------- */
  const doColorDrop = (clientX: number, clientY: number, hex: string, threshold = dropThreshold, continuing = false) => {
    const layer = active();
    const p = toDoc(clientX, clientY);
    if (!layer || p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
    if (notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    const base = makeCanvas(W, H);
    ctx2d(base).drawImage(layer.canvas, 0, 0);
    pushHistory([layer.id]);
    const ref = layersRef.current.find((l) => l.id === referenceId);
    const ok = colorDrop(layer.canvas, ref ? ref.canvas : base, p.x, p.y, hex, threshold, selectionRef.current?.path ?? null, layer.alphaLock, undefined, prefsRef.current.edgeDetect);
    if (!ok) { undoStack.current.pop(); return; }
    if (!layer.visible) { layer.visible = true; setLayers([...layersRef.current]); }
    markDirty(layer.id);
    pickColor(hex);
    commitRecent(hex);
    setDropWave({ x: clientX, y: clientY, color: hex });
    window.setTimeout(() => setDropWave(null), 650);
    setDrop({ x: p.x, y: p.y, color: hex, threshold, layerId: layer.id, base, continuing });
  };
  const redoDrop = (threshold: number) => {
    if (!drop) return;
    const layer = layersRef.current.find((l) => l.id === drop.layerId);
    if (!layer) return;
    const c = ctx2d(layer.canvas);
    c.clearRect(0, 0, W, H);
    c.drawImage(drop.base, 0, 0);
    const ref = layersRef.current.find((l) => l.id === referenceId);
    colorDrop(layer.canvas, ref ? ref.canvas : drop.base, drop.x, drop.y, drop.color, threshold, selectionRef.current?.path ?? null, layer.alphaLock, undefined, prefsRef.current.edgeDetect);
    setDrop({ ...drop, threshold });
    setDropThreshold(threshold);
    markDirty(layer.id);
  };

  const startColorDrag = (hex: string, e: { clientX: number; clientY: number }) => {
    setPanel(null);
    setGhost({ x: e.clientX, y: e.clientY, color: hex });
    const move = (ev: PointerEvent) => setGhost({ x: ev.clientX, y: ev.clientY, color: hex });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el === viewCanvas.current) doColorDrop(ev.clientX, ev.clientY, hex);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---------- selection ---------- */
  const buildSelection = (outline: Pt[], inverted = false): Selection | null => {
    if (outline.length < 3) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    outline.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    if (maxX - minX < 2 && maxY - minY < 2) return null;
    const path = new Path2D();
    if (inverted) path.rect(0, 0, W, H);
    outline.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    const bounds = inverted ? { x: 0, y: 0, w: W, h: H } : clipRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    return { path, outlines: [outline], inverted, bounds };
  };
  const ellipsePts = (a: Pt, b: Pt) => {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    return Array.from({ length: 96 }, (_, i) => ({ x: cx + Math.cos((i / 96) * Math.PI * 2) * rx, y: cy + Math.sin((i / 96) * Math.PI * 2) * ry }));
  };
  const rectPts = (a: Pt, b: Pt) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

  const selectionAction = (a: 'invert' | 'clear' | 'fill' | 'delete' | 'copy-paste' | 'all') => {
    const sel = selectionRef.current;
    const layer = active();
    if (a === 'all') { setSelection(buildSelection([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }])); return; }
    if (!sel) { flash('Draw a selection first'); return; }
    if (a === 'clear') { setSelection(null); return; }
    if (a === 'invert') { setSelection(buildSelection(sel.outlines[0], !sel.inverted)); return; }
    if (!layer) return;
    if (a === 'copy-paste') { copySelection(false); pasteClipboard(); return; }
    pushHistory([layer.id]);
    const c = ctx2d(layer.canvas);
    c.save();
    c.clip(sel.path, 'evenodd');
    if (a === 'fill') { c.fillStyle = color; if (layer.alphaLock) c.globalCompositeOperation = 'source-atop'; c.fillRect(0, 0, W, H); }
    else c.clearRect(0, 0, W, H);
    c.restore();
    markDirty(layer.id);
  };

  /* ---------- clipboard ---------- */
  const copySelection = (cut: boolean) => {
    const layer = active();
    if (!layer) return;
    const sel = selectionRef.current;
    const out = makeCanvas(W, H);
    const c = ctx2d(out);
    if (sel) c.clip(sel.path, 'evenodd');
    c.drawImage(layer.canvas, 0, 0);
    clipboard.current = out;
    if (cut) {
      pushHistory([layer.id]);
      const lc = ctx2d(layer.canvas);
      lc.save(); if (sel) lc.clip(sel.path, 'evenodd'); lc.clearRect(0, 0, W, H); lc.restore();
      markDirty(layer.id);
    }
    flash(cut ? 'Cut' : 'Copied');
  };
  const pasteClipboard = () => {
    if (!clipboard.current) { flash('Clipboard is empty'); return; }
    const l = insertLayer('Pasted Layer');
    ctx2d(l.canvas).drawImage(clipboard.current, 0, 0);
    markDirty(l.id);
  };

  /* ---------- layers ---------- */
  const insertLayer = (name?: string, opts?: { kind?: 'pixel' | 'adjust' | 'group'; adjust?: { name: string; value: number } }) => {
    pushHistory([]);
    const cur = active();
    const idx = Math.max(0, layersRef.current.findIndex((l) => l.id === activeRef.current));
    const count = layersRef.current.filter((l) => (l.kind ?? 'pixel') === 'pixel').length + 1;
    // inside an open folder the new layer joins it; otherwise it sits above the active row
    const intoGroup = cur?.kind === 'group' && !cur.collapsed;
    const parent = intoGroup ? cur.id : cur?.parent;
    const l: LayerState = { id: makeId(), name: name ?? `Layer ${count}`, visible: true, opacity: 1, blend: 'source-over', locked: false, alphaLock: false, kind: opts?.kind ?? 'pixel', parent: opts?.kind === 'group' ? undefined : parent, adjust: opts?.adjust, canvas: makeCanvas(W, H) };
    const next = [...layersRef.current];
    const at = l.kind === 'group' && cur?.parent ? blockRange(next, cur.parent)[0] : intoGroup ? idx + 1 : idx;
    next.splice(Math.max(0, at), 0, l);
    setLayers(next);
    setActiveId(l.id);
    dirty.current.add(l.id);
    bump();
    return l;
  };
  const updateLayer = (id: string, patch: Partial<LayerState>) => {
    pushHistory([]);
    setLayers(layersRef.current.map((l) => (l.id === id ? Object.assign(l, patch) : l)));
    bump();
  };
  const layerAction = (id: string, a: 'duplicate' | 'delete' | 'clear' | 'merge' | 'rename' | 'fill' | 'select' | 'flatten' | 'invert') => {
    const ls = layersRef.current;
    const idx = ls.findIndex((l) => l.id === id);
    const l = ls[idx];
    if (!l) return;
    if (a === 'duplicate') {
      pushHistory([]);
      const [bs, be] = blockRange(ls, id);
      const gid = makeId();
      const copies: LayerState[] = ls.slice(bs, be).map((x, k) => {
        const c: LayerState = { ...metaOf(x), id: k === 0 ? gid : makeId(), name: k === 0 ? `${x.name} copy` : x.name, parent: k === 0 ? x.parent : gid, canvas: makeCanvas(W, H) };
        ctx2d(c.canvas).drawImage(x.canvas, 0, 0);
        dirty.current.add(c.id);
        return c;
      });
      const next = [...ls]; next.splice(idx, 0, ...copies);
      setLayers(next); setActiveId(gid); bump();
    } else if (a === 'delete') {
      const [bs, be] = blockRange(ls, id);
      const doomed = new Set(ls.slice(bs, be).map((x) => x.id));
      if (!ls.some((x) => !doomed.has(x.id) && (x.kind ?? 'pixel') === 'pixel')) {
        if ((l.kind ?? 'pixel') === 'pixel') { pushHistory([l.id]); ctx2d(l.canvas).clearRect(0, 0, W, H); markDirty(l.id); }
        else flash('A canvas needs at least one layer');
        return;
      }
      pushHistory([...doomed]);
      const next = ls.filter((x) => !doomed.has(x.id));
      setLayers(next);
      setActiveId(next[Math.min(idx, next.length - 1)].id);
      bump();
    } else if (a === 'clear') {
      pushHistory([l.id]); ctx2d(l.canvas).clearRect(0, 0, W, H); markDirty(l.id);
    } else if (a === 'fill') {
      pushHistory([l.id]);
      const c = ctx2d(l.canvas); c.save(); if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
      if (l.alphaLock) c.globalCompositeOperation = 'source-atop';
      c.fillStyle = color; c.fillRect(0, 0, W, H); c.restore(); markDirty(l.id);
    } else if (a === 'invert') {
      pushHistory([l.id]);
      const c = l.canvas.getContext('2d', { willReadFrequently: true })!;
      const img = c.getImageData(0, 0, W, H);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 255 - img.data[i]; img.data[i + 1] = 255 - img.data[i + 1]; img.data[i + 2] = 255 - img.data[i + 2]; }
      c.putImageData(img, 0, 0); markDirty(l.id);
    } else if (a === 'merge') {
      if (l.kind === 'group') {
        // collapse the folder into one layer that keeps the folder's blend + opacity
        const kids = ls.filter((x) => x.parent === id);
        pushHistory([id, ...kids.map((x) => x.id)]);
        const out = makeCanvas(W, H);
        composite(ctx2d(out), kids.map((x) => ({ ...x, parent: undefined })), '#000', false);
        ctx2d(l.canvas).clearRect(0, 0, W, H); ctx2d(l.canvas).drawImage(out, 0, 0);
        const kidIds = new Set(kids.map((x) => x.id));
        setLayers(ls.filter((x) => !kidIds.has(x.id)).map((x) => (x.id === id ? Object.assign(x, { kind: 'pixel' as const, collapsed: undefined }) : x)));
        dirty.current.add(id); bump(); flash('Folder merged into one layer');
        return;
      }
      const sibs = ls.filter((x) => x.parent === l.parent);
      const below = sibs[sibs.indexOf(l) + 1];
      if (!below) { flash('No layer below'); return; }
      if ((below.kind ?? 'pixel') !== 'pixel') { flash(below.kind === 'group' ? 'Merge the folder first' : 'Can’t merge onto an adjustment layer'); return; }
      pushHistory([l.id, below.id]);
      const c = ctx2d(below.canvas);
      if (l.kind === 'adjust') {
        // bake the adjustment into the layer below
        if (l.visible && l.adjust && l.adjust.value > 0) {
          const fx = makeCanvas(W, H); ctx2d(fx).drawImage(below.canvas, 0, 0);
          applyCanvasEffect(fx, l.adjust.name, l.adjust.value);
          c.save();
          if (l.opacity >= 0.999 && l.blend === 'source-over') c.globalCompositeOperation = 'copy';
          else { c.globalAlpha = l.opacity; c.globalCompositeOperation = l.blend; }
          c.drawImage(fx, 0, 0); c.restore();
        }
      } else {
        c.save(); c.globalAlpha = l.opacity; c.globalCompositeOperation = l.blend; if (l.visible) c.drawImage(l.canvas, 0, 0); c.restore();
      }
      setLayers(ls.filter((x) => x.id !== id)); setActiveId(below.id); dirty.current.add(below.id); bump();
    } else if (a === 'flatten') {
      pushHistory(ls.map((x) => x.id));
      const out = makeCanvas(W, H);
      composite(ctx2d(out), ls, bgRef.current.color, false);
      const base = ls[ls.length - 1];
      ctx2d(base.canvas).clearRect(0, 0, W, H);
      ctx2d(base.canvas).drawImage(out, 0, 0);
      const merged = { ...base, opacity: 1, blend: 'source-over' as const, visible: true, name: 'Layer 1', kind: 'pixel' as const, parent: undefined, adjust: undefined, collapsed: undefined };
      setLayers([merged]); setActiveId(merged.id); dirty.current.add(merged.id); bump();
    } else if (a === 'rename') {
      const name = window.prompt('Layer name', l.name);
      if (name) updateLayer(id, { name });
    } else if (a === 'select') {
      // select the non-transparent pixels' bounding box
      const small = l.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (small[(y * W + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      if (maxX < 0) { flash('Layer is empty'); return; }
      setSelection(buildSelection(rectPts({ x: minX, y: minY }, { x: maxX + 2, y: maxY + 2 })));
      setTool('select');
    }
  };
  const reorder = (from: number, to: number) => {
    pushHistory([]);
    setLayers(moveRow(layersRef.current, from, to));
    bump();
  };

  const addAdjustmentLayer = (name: string) => {
    if (name === 'Liquify') { startAdjust('Liquify'); return; }
    insertLayer(adjustShort(name), { kind: 'adjust', adjust: { name, value: 50 } });
    flash(`${adjustShort(name)} adjustment layer added`);
  };
  const addGroup = () => {
    const cur = active();
    const l = insertLayer('New Group', { kind: 'group' });
    // Procreate drops the active layer into the new folder
    if (cur && (cur.kind ?? 'pixel') !== 'group' && !cur.parent) {
      setLayers(moveRow(layersRef.current.map((x) => (x.id === l.id ? Object.assign(x, { collapsed: false }) : x)),
        visibleRows(layersRef.current).findIndex((x) => x.id === cur.id), visibleRows(layersRef.current).findIndex((x) => x.id === l.id) + 1));
      bump();
    }
  };
  const setAdjustValue = (id: string, value: number) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (!l?.adjust) return;
    l.adjust = { ...l.adjust, value };
    setLayers([...layersRef.current]);
    bump();
  };
  const selectAll = () => {
    setSelection(buildSelection(rectPts({ x: 0, y: 0 }, { x: W, y: H })));
    setTool('select');
    flash('Selected all');
  };
  const chooseTexture = (id: string | null) => {
    pushHistory([]);
    const def = textures.find((t) => t.id === id);
    const next = def ? { id: def.id, strength: def.strength } : null;
    setTextureState(next); textureSel.current = next;
    if (!next) { texRef.current = null; requestRender(); }
    scheduleSave();
    flash(def ? `Canvas: ${def.name}` : 'Texture removed');
  };

  /* ---------- transform ---------- */
  const startTransform = () => {
    const layer = active();
    if (!layer || floatingRef.current) return;
    if (notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    pushHistory([layer.id]);
    const sel = selectionRef.current;
    const fc = makeCanvas(W, H);
    const c = ctx2d(fc);
    if (sel) { c.save(); c.clip(sel.path, 'evenodd'); }
    c.drawImage(layer.canvas, 0, 0);
    if (sel) c.restore();
    const lc = ctx2d(layer.canvas);
    lc.save(); if (sel) lc.clip(sel.path, 'evenodd'); lc.clearRect(0, 0, W, H); lc.restore();
    floatingRef.current = { layerId: layer.id, canvas: fc, bounds: sel ? sel.bounds : { x: 0, y: 0, w: W, h: H } };
    setFloatingOn(true);
    setTf({ tx: 0, ty: 0, scale: 1, rot: 0, fx: 1, fy: 1 });
  };
  const commitTransform = (cancel = false) => {
    const f = floatingRef.current;
    if (!f) return;
    const layer = layersRef.current.find((l) => l.id === f.layerId);
    if (layer) {
      const c = ctx2d(layer.canvas);
      c.save();
      if (!cancel) {
        c.setTransform(tfMatrix(tfRef.current, f.bounds));
        if (interpRef.current === 'Nearest neighbor') c.imageSmoothingEnabled = false;
        else { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = interpRef.current === 'Bicubic' ? 'high' : 'medium'; }
      }
      c.drawImage(f.canvas, 0, 0);
      c.restore();
      markDirty(layer.id);
    }
    floatingRef.current = null;
    setFloatingOn(false);
    if (!cancel && selectionRef.current) {
      const m = tfMatrix(tfRef.current, f.bounds);
      const outline = selectionRef.current.outlines[0].map((p) => { const q = m.transformPoint(new DOMPoint(p.x, p.y)); return { x: q.x, y: q.y }; });
      setSelection(buildSelection(outline, selectionRef.current.inverted));
    }
    setTf({ tx: 0, ty: 0, scale: 1, rot: 0, fx: 1, fy: 1 });
    if (cancel) undoStack.current.pop();
  };

  /* ---------- adjustments ---------- */
  const startAdjust = (name: string) => {
    setPanel(null);
    const layer = active();
    if (!layer) return;
    if (notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    pushHistory([layer.id]);
    const base = makeCanvas(W, H);
    ctx2d(base).drawImage(layer.canvas, 0, 0);
    setAdjust({ name, value: name === 'Liquify' ? 0 : 0, base, layerId: layer.id });
    setTool('brush');
  };
  const adjustFrame = useRef<number | undefined>(undefined);
  const applyAdjust = (value: number, params?: any) => {
    if (!adjust) return;
    const p = params ?? adjust.params;
    setAdjust({ ...adjust, value, params: p });
    if (adjustFrame.current) cancelAnimationFrame(adjustFrame.current);
    adjustFrame.current = requestAnimationFrame(() => {
      const layer = layersRef.current.find((l) => l.id === adjust.layerId);
      if (!layer) return;
      const fx = makeCanvas(W, H);
      ctx2d(fx).drawImage(adjust.base, 0, 0);
      applyCanvasEffect(fx, adjust.name, value, p);
      const c = ctx2d(layer.canvas);
      c.clearRect(0, 0, W, H);
      c.drawImage(adjust.base, 0, 0);
      c.save();
      if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
      c.clearRect(0, 0, W, H);
      c.drawImage(fx, 0, 0);
      c.restore();
      markDirty(layer.id);
    });
  };
  const endAdjust = (cancel: boolean) => {
    if (!adjust) return;
    if (cancel) {
      const layer = layersRef.current.find((l) => l.id === adjust.layerId);
      if (layer) { const c = ctx2d(layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(adjust.base, 0, 0); markDirty(layer.id); }
      undoStack.current.pop();
      setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
    }
    setAdjust(null);
  };
  const liquifyAt = (p: Pt, prev: Pt, strength = 1) => {
    if (!adjust) return;
    const layer = layersRef.current.find((l) => l.id === adjust.layerId);
    if (!layer) return;
    const R = Math.max(6, (liq.size / 100) * Math.min(W, H) * 0.3);
    const rect = clipRect({ x: p.x - R, y: p.y - R, w: R * 2, h: R * 2 });
    if (rect.w <= 0 || rect.h <= 0) return;
    const c = layer.canvas.getContext('2d', { willReadFrequently: true })!;
    const src = c.getImageData(rect.x, rect.y, rect.w, rect.h);
    const baseData = liq.mode === 'Reconstruct' ? adjust.base.getContext('2d', { willReadFrequently: true })!.getImageData(rect.x, rect.y, rect.w, rect.h).data : null;
    const out = new ImageData(new Uint8ClampedArray(src.data), rect.w, rect.h);
    const k = (liq.pressure / 100) * strength;
    const amt = 0.25 + (liq.amount / 100) * 1.75;
    const dist0 = liq.distortion / 100;
    const ddx = p.x - prev.x, ddy = p.y - prev.y;
    const dl = Math.hypot(ddx, ddy) || 1;
    const nx = -ddy / dl, ny = ddx / dl;
    const hash = (x: number, y: number) => { const t = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return t - Math.floor(t) - 0.5; };
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
      const gx = rect.x + x, gy = rect.y + y;
      const dx = gx - p.x, dy = gy - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= R) continue;
      const f = Math.pow(1 - dist / R, 2) * k;
      let sx = gx, sy = gy;
      if (liq.mode === 'Push') { sx = gx - ddx * f; sy = gy - ddy * f; }
      else if (liq.mode === 'Twirl Right' || liq.mode === 'Twirl Left') {
        const a = (liq.mode === 'Twirl Right' ? 1 : -1) * f * 0.22 * amt;
        sx = p.x + dx * Math.cos(a) - dy * Math.sin(a); sy = p.y + dx * Math.sin(a) + dy * Math.cos(a);
      } else if (liq.mode === 'Pinch') { sx = p.x + dx * (1 + f * 0.1 * amt); sy = p.y + dy * (1 + f * 0.1 * amt); }
      else if (liq.mode === 'Expand') { sx = p.x + dx * (1 - f * 0.1 * amt); sy = p.y + dy * (1 - f * 0.1 * amt); }
      else if (liq.mode === 'Crystals') { sx = gx + hash(gx, gy) * f * R * 0.12 * amt; sy = gy + hash(gy, gx) * f * R * 0.12 * amt; }
      else if (liq.mode === 'Edge') { const d = dx * nx + dy * ny; sx = gx + nx * d * f * 0.12 * amt; sy = gy + ny * d * f * 0.12 * amt; }
      if (dist0 > 0 && !baseData) { sx += hash(gx * 0.05 | 0, gy * 0.05 | 0) * f * R * 0.08 * dist0; sy += hash(gy * 0.05 | 0, gx * 0.05 | 0) * f * R * 0.08 * dist0; }
      const o = (y * rect.w + x) * 4;
      if (baseData) {
        for (let ch = 0; ch < 4; ch++) out.data[o + ch] = src.data[o + ch]! + (baseData[o + ch]! - src.data[o + ch]!) * Math.min(1, f * 1.5 * amt);
        continue;
      }
      const ix = Math.round(sx) - rect.x, iy = Math.round(sy) - rect.y;
      if (ix < 0 || iy < 0 || ix >= rect.w || iy >= rect.h) continue;
      const si = (iy * rect.w + ix) * 4;
      out.data[o] = src.data[si]!; out.data[o + 1] = src.data[si + 1]!; out.data[o + 2] = src.data[si + 2]!; out.data[o + 3] = src.data[si + 3]!;
    }
    c.putImageData(out, rect.x, rect.y);
    dirty.current.add(layer.id);
    requestRender();
  };
  /** Momentum: the liquify brush keeps gliding after the finger lifts. */
  const liqMomentum = useRef<number | undefined>(undefined);
  const glideLiquify = (from: Pt, v: Pt) => {
    const steps = Math.round((liq.momentum / 100) * 24);
    if (!steps || Math.hypot(v.x, v.y) < 0.5) return;
    let p = from, vel = v, i = 0;
    const tick = () => {
      if (i++ >= steps) { bump(); return; }
      vel = { x: vel.x * 0.86, y: vel.y * 0.86 };
      const next = { x: p.x + vel.x, y: p.y + vel.y };
      liquifyAt(next, p, 1 - i / steps);
      p = next;
      liqMomentum.current = requestAnimationFrame(tick);
    };
    liqMomentum.current = requestAnimationFrame(tick);
  };
  const resetLiquify = () => {
    if (!adjust) return;
    if (liqMomentum.current) cancelAnimationFrame(liqMomentum.current);
    const layer = layersRef.current.find((l) => l.id === adjust.layerId);
    if (!layer) return;
    const c = ctx2d(layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(adjust.base, 0, 0);
    markDirty(layer.id);
    requestRender();
  };

  /* ---------- misc ---------- */
  const finishTransientModes = () => {
    if (stroke.current) endStroke();
    if (floatingRef.current) commitTransform();
    if (adjust) setAdjust(null);
    setDrop(null);
  };

  const chooseTool = (t: Tool) => {
    if (t !== 'transform' && floatingRef.current) commitTransform();
    if (adjust) endAdjust(false);
    setDrop(null);
    if (t === tool && (t === 'brush' || t === 'smudge' || t === 'eraser')) { setPanel(panel === 'brush' ? null : 'brush'); return; }
    if (t === tool && t === 'select') { setSelection(null); }
    setTool(t);
    if (t === 'transform') startTransform();
  };

  const applyPaletteToLayer = (colors: string[]) => {
    const layer = active();
    if (!layer || notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    pushHistory([layer.id]);
    const c = layer.canvas.getContext('2d', { willReadFrequently: true })!;
    const img = c.getImageData(0, 0, W, H);
    mapToPalette(img.data, colors);
    c.putImageData(img, 0, 0);
    markDirty(layer.id);
    flash(`“${layer.name}” now uses only this palette`);
  };

  const runAction = async (a: ActionId) => {
    const layer = active();
    switch (a) {
      case 'insert-photo': fileRef.current?.click(); break;
      case 'add-text': setPanel(null); setTextDraft(defaultDraft(W, H)); break;
      case 'cut': copySelection(true); break;
      case 'copy': copySelection(false); break;
      case 'paste': pasteClipboard(); break;
      case 'flip-canvas-h':
      case 'flip-canvas-v': {
        pushHistory(layersRef.current.map((l) => l.id));
        for (const l of layersRef.current) {
          const tmp = makeCanvas(W, H); ctx2d(tmp).drawImage(l.canvas, 0, 0);
          const c = ctx2d(l.canvas); c.save(); c.clearRect(0, 0, W, H);
          if (a === 'flip-canvas-h') { c.translate(W, 0); c.scale(-1, 1); } else { c.translate(0, H); c.scale(1, -1); }
          c.drawImage(tmp, 0, 0); c.restore(); dirty.current.add(l.id);
        }
        bump(); break;
      }
      case 'rotate-canvas': {
        const el = wrapRef.current!;
        const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
        const anchor = toDoc(el.getBoundingClientRect().left + cx, el.getBoundingClientRect().top + cy);
        view.current.rot = (view.current.rot + 90) % 360;
        const q = new DOMMatrix().rotate(view.current.rot).scale(view.current.scale * (view.current.flip ? -1 : 1), view.current.scale).transformPoint(new DOMPoint(anchor.x, anchor.y));
        view.current.x = cx - q.x; view.current.y = cy - q.y; requestRender(); break;
      }
      case 'guide': setGuide((g) => !g); break;
      case 'reference':
        if (referenceId) { setReferenceId(null); flash('Reference off'); }
        else if (layer) { setReferenceId(layer.id); flash(`ColorDrop will follow “${layer.name}”`); }
        break;
      case 'clear-all':
        pushHistory(layersRef.current.map((l) => l.id));
        layersRef.current.forEach((l) => { ctx2d(l.canvas).clearRect(0, 0, W, H); dirty.current.add(l.id); });
        bump(); break;
      case 'export-png':
      case 'export-jpg': {
        const out = flatten(layersRef.current, bgRef.current.color, a === 'export-jpg' ? true : bgRef.current.visible, Infinity, texRef.current);
        const blob = await canvasToBlob(out, a === 'export-png' ? 'image/png' : 'image/jpeg', 0.95);
        downloadBlob(blob, `${title || 'Artwork'}.${a === 'export-png' ? 'png' : 'jpg'}`);
        break;
      }
      case 'export-psd':
      case 'export-zip':
      case 'export-arnm': {
        finishTransientModes();
        flash('Packing your file…');
        try {
          const art = await save();
          const name = title || 'Artwork';
          if (a === 'export-psd') downloadBlob(await exportPsd(art), `${name}.psd`);
          else if (a === 'export-zip') downloadBlob(await exportZip(art), `${name}.zip`);
          else {
            await saveHistory(artwork.id, undoStack.current, redoStack.current);
            const sel = selectionRef.current;
            downloadBlob(await exportArnm(art, { palettes, selection: sel ? { outlines: sel.outlines, inverted: sel.inverted } : null }), `${name}.arnm`);
          }
          flash('Exported');
        } catch { flash('Could not export that file'); }
        break;
      }
      case 'export-layers':
        for (const [i, l] of layersRef.current.entries()) downloadBlob(await canvasToBlob(l.canvas), `${title}-${i + 1}-${l.name}.png`);
        break;
      case 'rename': { const n = window.prompt('Artwork name', title); if (n) { setTitle(n); titleRef.current = n; scheduleSave(); } break; }
      default: break;
    }
  };

  const insertImage = async (file: File) => {
    try {
      const img = await loadImage(file);
      const l = insertLayer('Inserted Image');
      const s = Math.min(1, W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx2d(l.canvas).drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      markDirty(l.id);
      setTool('transform');
      setTimeout(startTransform, 0);
    } catch { flash('Could not open that image'); }
  };

  // live text preview drawn over the artwork until the text is applied
  useEffect(() => {
    if (!textDraft) { textPreview.current = null; requestRender(); return; }
    let off = false;
    void ensureFont(textDraft).then(() => {
      if (off) return;
      const c = textPreview.current && textPreview.current.width === W ? textPreview.current : makeCanvas(W, H);
      const x = ctx2d(c); x.clearRect(0, 0, W, H);
      drawText(x, textDraft, W, H, color);
      textPreview.current = c; requestRender();
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textDraft, color]);
  const applyText = () => {
    if (!textDraft || !textDraft.value.trim()) { setTextDraft(null); return; }
    const d = textDraft;
    void ensureFont(d).then(() => {
      const l = insertLayer(d.value.trim().split('\n')[0]!.slice(0, 24) || 'Text');
      drawText(ctx2d(l.canvas), d, W, H, color);
      markDirty(l.id);
      setTextDraft(null);
    });
  };

  /* ---------- pointer handling ---------- */
  type Ptr = { x: number; y: number; sx: number; sy: number; type: string };
  const pointers = useRef(new Map<number, Ptr>());
  const mode = useRef<'idle' | 'draw' | 'gesture' | 'eyedrop' | 'select' | 'transform' | 'pan' | 'adjust' | 'liquify' | 'tapclose'>('idle');
  const gesture = useRef<null | { start: number; max: number; moved: boolean; v0: View; anchor: Pt; d0: number; a0: number; c0: Pt; tf0: Tf; s0: number; vx0: number; vy0: number }>(null);
  const dragStart = useRef<{ p: Pt; tf: Tf; client: Pt; value: number } | null>(null);
  const lastLiq = useRef<Pt | null>(null);
  const liqVel = useRef<Pt>({ x: 0, y: 0 });
  const pendingTap = useRef<null | { p: Pt; pressure: number }>(null);
  /** A single quick tap on the canvas closes open windows and does nothing else. */
  const closeWindows = () => { window.dispatchEvent(new Event('pp-close-windows')); };
  const spaceDown = useRef(false);

  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()];
    return { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  const onPointerDown = (e: RPE<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType });
    // windows stay open until the user closes them — painting never dismisses them
    if (drop) setDrop(null);
    const n = pointers.current.size;
    if (n >= 2 && e.pointerType === 'touch') {
      window.clearTimeout(eyedropTimer.current);
      if (mode.current === 'draw') {
        const st = stroke.current;
        if (st && performance.now() - st.started < 400) cancelStroke(); else endStroke();
      }
      if (mode.current === 'select') draftOverlay.current = null;
      if (mode.current === 'eyedrop') setLoupe(null);
      const pts0 = [...pointers.current.values()] as [Ptr, Ptr];
      const g = twoFinger();
      const v0 = { ...view.current };
      gesture.current = { start: gesture.current?.start ?? performance.now(), max: Math.max(n, gesture.current?.max ?? 0), moved: gesture.current?.moved ?? false, v0, anchor: toDoc(g.c.x, g.c.y), d0: g.d, a0: g.a, c0: g.c, tf0: { ...tfRef.current }, s0: v0.scale, vx0: pts0[1].x - pts0[0].x, vy0: pts0[1].y - pts0[0].y };
      mode.current = 'gesture';
      return;
    }
    if (n > 1) return;
    gesture.current = null;
    const p = toDoc(e.clientX, e.clientY);
    if (spaceDown.current || e.button === 1) { mode.current = 'pan'; dragStart.current = { p, tf: tfRef.current, client: { x: e.clientX, y: e.clientY }, value: 0 }; return; }
    if (e.altKey) { mode.current = 'eyedrop'; eyedropAt(e.clientX, e.clientY, color); return; }
    if (adjust) {
      if (adjust.name === 'Liquify') { mode.current = 'liquify'; lastLiq.current = p; return; }
      mode.current = 'adjust';
      dragStart.current = { p, tf: tfRef.current, client: { x: e.clientX, y: e.clientY }, value: adjust.value };
      return;
    }
    if (tool === 'transform') {
      if (!floatingRef.current) startTransform();
      mode.current = 'transform';
      dragStart.current = { p, tf: { ...tfRef.current }, client: { x: e.clientX, y: e.clientY }, value: 0 };
      return;
    }
    if (tool === 'select') {
      mode.current = 'select';
      draftOverlay.current = selMode === 'Freehand' ? { kind: 'lasso', points: [p] } : { kind: selMode === 'Rectangle' ? 'rect' : 'ellipse', from: p, to: p };
      requestRender();
      return;
    }
    const pressure = e.pointerType === 'pen' ? applyCurve(prefsRef.current.curvePressure, e.pressure || 0.5) : 1;
    if (panel) {
      // wait: a tap closes the window, a drag still paints
      mode.current = 'tapclose';
      pendingTap.current = { p, pressure };
      return;
    }
    if (beginStroke(p, pressure)) {
      mode.current = 'draw';
      const old = color;
      window.clearTimeout(eyedropTimer.current);
      eyedropTimer.current = window.setTimeout(() => {
        const ptr = pointers.current.get(e.pointerId);
        if (!ptr || mode.current !== 'draw' || Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) return;
        cancelStroke();
        mode.current = 'eyedrop';
        eyedropAt(ptr.x, ptr.y, old);
      }, 480);
    }
  };

  const onPointerMove = (e: RPE<HTMLCanvasElement>) => {
    const ptr = pointers.current.get(e.pointerId);
    if (!ptr) return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (mode.current === 'tapclose' && pointers.current.size === 1) {
      if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) <= 8) return;
      const pt = pendingTap.current;
      pendingTap.current = null;
      mode.current = pt && beginStroke(pt.p, pt.pressure) ? 'draw' : 'idle';
    }
    const m = mode.current;
    if (m === 'gesture' && gesture.current && pointers.current.size >= 2) {
      const g = gesture.current;
      const t = twoFinger();
      // multi-finger gestures: 3-finger scrub (horizontal & vertical back-and-forth) clears active layer; 3-finger swipe down opens clipboard menu
      const gX = g as any;
      if (pointers.current.size >= 3) {
        const all = [...pointers.current.values()];
        const cx = all.reduce((s, p) => s + p.x, 0) / all.length;
        const cy = all.reduce((s, p) => s + p.y, 0) / all.length;
        gX.mx = cx;
        gX.my = cy;
        if (!gX.cleared) {
          if (!gX.scrub) {
            gX.scrub = { lastX: cx, lastY: cy, revX: 0, revY: 0, dirX: 0, dirY: 0, totalDist: 0 };
          } else {
            const sc = gX.scrub;
            const ddx = cx - sc.lastX;
            const ddy = cy - sc.lastY;
            sc.totalDist += Math.hypot(ddx, ddy);
            const stepThresh = 12;
            if (Math.abs(ddx) > stepThresh) {
              const signX = ddx > 0 ? 1 : -1;
              if (sc.dirX !== 0 && signX !== sc.dirX) {
                sc.revX++;
              }
              sc.dirX = signX;
              sc.lastX = cx;
            }
            if (Math.abs(ddy) > stepThresh) {
              const signY = ddy > 0 ? 1 : -1;
              if (sc.dirY !== 0 && signY !== sc.dirY) {
                sc.revY++;
              }
              sc.dirY = signY;
              sc.lastY = cy;
            }
            // Scrub detected in either horizontal or vertical direction
            if ((sc.revX >= 2 || sc.revY >= 2) && sc.totalDist > 45) {
              gX.cleared = true;
              const l = active();
              if (l && (l.kind ?? 'pixel') === 'pixel' && !l.locked) {
                pushHistory([l.id]);
                ctx2d(l.canvas).clearRect(0, 0, W, H);
                markDirty(l.id);
                flash('Layer cleared');
              }
            }
          }
        }
        // Three-finger downward swipe detection
        if (!gX.cleared) {
          const dy = cy - g.c0.y;
          const dx = cx - g.c0.x;
          if (dy > 75 && Math.abs(dy) > Math.abs(dx) * 1.3) {
            setClipMenu(true);
          }
        }
      }
      if (Math.hypot(t.c.x - g.c0.x, t.c.y - g.c0.y) > 10 || Math.abs(t.d - g.d0) > 12) g.moved = true;
      if (tool === 'transform' && floatingRef.current) {
        const d0 = toDoc(g.c0.x, g.c0.y), d1 = toDoc(t.c.x, t.c.y);
        if (tfMode === 'Freeform') {
          // stretch along the fingers' separation axes instead of uniform scaling
          const pts = [...pointers.current.values()] as [Ptr, Ptr];
          const vx = pts[1].x - pts[0].x, vy = pts[1].y - pts[0].y;
          const kx = Math.abs(g.vx0) > 14 ? Math.abs(vx) / Math.abs(g.vx0) : g.tf0.fx;
          const ky = Math.abs(g.vy0) > 14 ? Math.abs(vy) / Math.abs(g.vy0) : g.tf0.fy;
          setTf({ ...g.tf0, fx: Math.max(0.02, kx), fy: Math.max(0.02, ky), tx: g.tf0.tx + d1.x - d0.x, ty: g.tf0.ty + d1.y - d0.y });
        } else {
          setTf({ ...g.tf0, scale: Math.max(0.02, g.tf0.scale * (t.d / g.d0)), rot: g.tf0.rot + ((t.a - g.a0) * 180) / Math.PI, tx: g.tf0.tx + d1.x - d0.x, ty: g.tf0.ty + d1.y - d0.y });
        }
        return;
      }
      const scale = Math.max(0.02, Math.min(64, g.v0.scale * (t.d / g.d0)));
      let rot = prefsRef.current.rotateCanvas ? g.v0.rot + ((t.a - g.a0) * 180) / Math.PI : g.v0.rot;
      // soft magnet towards right angles instead of a hard jump
      const snap = Math.round(rot / 90) * 90, off = rot - snap;
      if (Math.abs(off) < 6) rot = snap + off * Math.pow(Math.abs(off) / 6, 2);
      const base = new DOMMatrix().rotate(rot).scale(scale * (g.v0.flip ? -1 : 1), scale);
      const q = base.transformPoint(new DOMPoint(g.anchor.x, g.anchor.y));
      const gr = g as typeof g & { rect?: DOMRect };
      const r = gr.rect ?? (gr.rect = viewCanvas.current!.getBoundingClientRect());
      view.current = { ...g.v0, scale, rot, x: t.c.x - r.left - q.x, y: t.c.y - r.top - q.y };
      requestRender();
      return;
    }
    if (pointers.current.size > 1) return;
    if (m === 'draw' && stroke.current) {
      const st = stroke.current;
      if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) window.clearTimeout(eyedropTimer.current);
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const p = toDoc(ev.clientX, ev.clientY);
        const pressure = ev.pointerType === 'pen' ? applyCurve(prefsRef.current.curvePressure, ev.pressure || 0.5) : 1;
        if (st.shape) { adjustShape(st, p); continue; }
        const last = st.raw[st.raw.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.5) st.raw.push(p);
        strokeTo(st, p, pressure);
      }
      if (!st.shape) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(triggerQuickShape, 650);
      }
      requestRender();
    } else if (m === 'eyedrop') {
      eyedropAt(e.clientX, e.clientY, loupe?.old ?? color);
    } else if (m === 'select' && draftOverlay.current) {
      const p = toDoc(e.clientX, e.clientY);
      const d = draftOverlay.current;
      if (d.kind === 'lasso') d.points.push(p); else d.to = p;
      requestRender();
    } else if (m === 'transform' && dragStart.current) {
      const p = toDoc(e.clientX, e.clientY);
      const s = dragStart.current;
      setTf({ ...s.tf, tx: s.tf.tx + p.x - s.p.x, ty: s.tf.ty + p.y - s.p.y });
    } else if (m === 'pan' && dragStart.current) {
      const s = dragStart.current;
      view.current.x += e.clientX - s.client.x; view.current.y += e.clientY - s.client.y;
      s.client = { x: e.clientX, y: e.clientY };
      requestRender();
    } else if (m === 'adjust' && dragStart.current && adjust) {
      const s = dragStart.current;
      const width = wrapRef.current?.clientWidth ?? 400;
      applyAdjust(Math.round(Math.max(0, Math.min(100, s.value + ((e.clientX - s.client.x) / width) * 120))));
    } else if (m === 'liquify' && lastLiq.current) {
      const p = toDoc(e.clientX, e.clientY);
      liquifyAt(p, lastLiq.current);
      liqVel.current = { x: p.x - lastLiq.current.x, y: p.y - lastLiq.current.y };
      lastLiq.current = p;
    }
  };

  const onPointerUp = (e: RPE<HTMLCanvasElement>) => {
    const had = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const m = mode.current;
    if (m === 'gesture') {
      if (pointers.current.size === 0) {
        const g = gesture.current;
        if (g) {
          const dur = performance.now() - g.start;
          if (!g.moved && dur < 400) {
            if (g.max === 2) undo();
            else if (g.max === 3) redo();
            else if (g.max >= 4) {
              // four-finger tap temporarily hides all UI elements (not browser fullscreen)
              setHideUI((prev) => {
                const next = !prev;
                flash(next ? 'Interface hidden (four-finger tap to restore)' : 'Interface restored');
                return next;
              });
            }
          } else if (g.max === 3) {
            // three-finger swipe down opens the cut / copy / paste menu
            const gX = g as any;
            if (gX.my !== undefined && !gX.cleared) {
              const dx = (gX.mx ?? g.c0.x) - g.c0.x, dy = gX.my - g.c0.y;
              if (dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.2) setClipMenu(true);
            }
          }
        }
        gesture.current = null;
        mode.current = 'idle';
      }
      return;
    }
    if (pointers.current.size > 0) return;
    window.clearTimeout(eyedropTimer.current);
    if (m === 'tapclose') {
      pendingTap.current = null;
      mode.current = 'idle';
      if (e.type === 'pointerup') closeWindows();
      return;
    }
    if (m === 'draw') endStroke();
    else if (m === 'eyedrop') {
      if (loupe) { pickColor(loupe.color); commitRecent(loupe.color); }
      setLoupe(null);
    } else if (m === 'select' && draftOverlay.current) {
      const d = draftOverlay.current;
      draftOverlay.current = null;
      const outline = d.kind === 'lasso' ? d.points : d.kind === 'rect' ? rectPts(d.from, d.to) : ellipsePts(d.from, d.to);
      setSelection(buildSelection(outline));
    } else if (m === 'liquify') {
      const last = lastLiq.current;
      lastLiq.current = null;
      if (last) glideLiquify(last, liqVel.current); else bump();
      liqVel.current = { x: 0, y: 0 };
    } else if (m === 'transform' || m === 'adjust') {
      bump();
    }
    void had;
    dragStart.current = null;
    mode.current = 'idle';
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = viewCanvas.current!.getBoundingClientRect();
    const zoom = e.ctrlKey || e.metaKey || (Math.abs(e.deltaY) >= 40 && e.deltaX === 0 && e.deltaMode === 0 && Number.isInteger(e.deltaY));
    if (zoom) {
      const anchor = toDoc(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      const v = view.current;
      v.scale = Math.max(0.02, Math.min(64, v.scale * factor));
      const q = new DOMMatrix().rotate(v.rot).scale(v.scale * (v.flip ? -1 : 1), v.scale).transformPoint(new DOMPoint(anchor.x, anchor.y));
      v.x = e.clientX - r.left - q.x; v.y = e.clientY - r.top - q.y;
    } else {
      view.current.x -= e.deltaX; view.current.y -= e.deltaY;
    }
    requestRender();
  };

  // keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'c') { copySelection(false); return; }
      if (mod && e.key.toLowerCase() === 'x') { copySelection(true); return; }
      if (mod && e.key.toLowerCase() === 'v') { pasteClipboard(); return; }
      if (e.code === 'Space') { spaceDown.current = true; return; }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (k === 'b') chooseTool('brush');
      else if (k === 's') chooseTool('smudge');
      else if (k === 'e') chooseTool('eraser');
      else if (k === 'v') chooseTool('transform');
      else if (k === 'l') chooseTool('select');
      else if (k === '[') setSizes((s) => ({ ...s, [paintTool]: Math.max(0.01, s[paintTool] - 0.04) }));
      else if (k === ']') setSizes((s) => ({ ...s, [paintTool]: Math.min(1, s[paintTool] + 0.04) }));
      else if (k === 'escape') { setPanel(null); if (floatingRef.current) commitTransform(true); if (adjust) endAdjust(true); setDrop(null); }
      else if (k === 'enter') { if (floatingRef.current) commitTransform(); if (adjust) endAdjust(false); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  useEffect(() => () => { window.clearTimeout(saveTimer.current); }, []);

  /* ---------- side sliders: the pair is repositioned together with two
     fingers and seats on the left or right side only — never top, bottom,
     center or a corner. ---------- */
  const [sbSide, setSbSide] = useStored<'left' | 'right'>('pp.sbSide', 'left');
  const [sbDrag, setSbDrag] = useState<null | { x: number; y: number }>(null);
  const [sbY, setSbY] = useStored('pp.sbY', 0);
  const sbYRef = useRef(sbY); sbYRef.current = sbY;
  const sbDragRef = useRef<null | { x: number; y: number }>(null);
  const sbPts = useRef(new Map<number, { x: number; y: number }>());
  const sbGest = useRef<null | { cx: number; cy: number }>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sbBusy = useRef(false);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const mid = () => {
      const [a, b] = [...sbPts.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      sbPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (sbPts.current.size === 2 && !sbGest.current) {
        const m = mid();
        sbGest.current = { cx: m.x, cy: m.y };
        sbBusy.current = true; // freeze slider value changes while moving the pair
        e.preventDefault(); e.stopPropagation();
      }
    };
    const move = (e: PointerEvent) => {
      if (!sbPts.current.has(e.pointerId)) return;
      sbPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = sbGest.current;
      if (!g || sbPts.current.size < 2) return;
      e.preventDefault();
      const m = mid();
      const next = { x: m.x - g.cx, y: m.y - g.cy };
      sbDragRef.current = next;
      setSbDrag(next);
    };
    const up = (e: PointerEvent) => {
      if (!sbPts.current.has(e.pointerId)) return;
      sbPts.current.delete(e.pointerId);
      if (sbPts.current.size < 2 && sbGest.current) {
        sbGest.current = null;
        const dx = sbDragRef.current?.x ?? 0;
        const dy = sbDragRef.current?.y ?? 0;
        sbDragRef.current = null;
        setSbDrag(null);
        // seat on the nearer side only — left or right, nothing else
        const el2 = sidebarRef.current;
        let side: 'left' | 'right';
        if (el2) {
          const r = el2.getBoundingClientRect();
          side = r.left + dx + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
          // keep the vertical spot the pair was dropped at (stays on screen)
          const top = Math.max(8, Math.min(window.innerHeight - r.height - 8, r.top + dy));
          setSbY(sbYRef.current + (top - r.top));
        } else side = dx >= 0 ? 'right' : 'left';
        setSbSide(side);
        window.setTimeout(() => { sbBusy.current = false; }, 60);
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  /* pinch or resize the slider pair, then keep it fully on screen */
  const clampSbY = () => {
    requestAnimationFrame(() => {
      const el = sidebarRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minTop = 10;
      const maxBottom = window.innerHeight - 10;
      let nextY = sbYRef.current;
      if (r.top < minTop) {
        nextY += (minTop - r.top);
      } else if (r.bottom > maxBottom) {
        nextY -= (r.bottom - maxBottom);
      }
      if (Math.abs(nextY - sbYRef.current) > 1) {
        setSbY(Math.round(nextY));
      }
    });
  };
  usePinchScale(sidebarRef, 'pp.sbScale', 'center center', clampSbY);
  useEffect(() => {
    window.addEventListener('resize', clampSbY);
    return () => window.removeEventListener('resize', clampSbY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSliderResizeStart = (kind: 'size' | 'opacity', e: React.PointerEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    const startH = sliderHeights[kind] || 108;
    const onMove = (ev: PointerEvent) => {
      const nextH = Math.max(68, Math.min(240, Math.round(startH + (ev.clientY - startY))));
      setSliderHeights((h) => ({ ...h, [kind]: nextH }));
      clampSbY();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clampSbY();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const showPreview = (kind: 'size' | 'opacity', value: number) => {
    window.clearTimeout(previewTimer.current);
    sliderPreview.current = { kind, value };
    requestRender();
  };
  const fadePreview = () => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => { sliderPreview.current = null; requestRender(); }, 550);
  };
  const sideSlider = (kind: 'size' | 'opacity') => {
    const value = kind === 'size' ? sizes[paintTool] : opacities[paintTool];
    const height = sliderHeights[kind] || 108;
    const set = (v: number) => {
      const c = Math.max(0.01, Math.min(1, v));
      if (kind === 'size') setSizes((s) => ({ ...s, [paintTool]: c })); else setOpacities((s) => ({ ...s, [paintTool]: c }));
      showPreview(kind, c);
    };
    const handle = (e: RPE<HTMLDivElement>) => {
      if (sbBusy.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      const knob = 26, inset = 4;
      set(1 - (e.clientY - r.top - inset - knob / 2) / (r.height - knob - inset * 2));
    };
    const pct = `${Math.round(value * 100)}%`;
    return (
      <div className="pp-vwrap">
        {kind === 'size' && <span className="pp-vlabel">{pct}</span>}
        <div
          className="pp-vslider"
          style={{ height }}
          role="slider"
          tabIndex={0}
          aria-valuemin={1}
          aria-valuemax={100}
          onKeyDown={(e) => { if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); set(e.key === 'Home' ? 0.01 : e.key === 'End' ? 1 : value + (e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.01 : -0.01)); } }}
          onBlur={fadePreview}
          aria-label={kind === 'size' ? 'Brush size' : 'Brush opacity'}
          aria-valuenow={Math.round(value * 100)}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); showPreview(kind, value); handle(e); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e); }}
          onPointerUp={fadePreview}
          onPointerCancel={fadePreview}
        >
          <span className="pp-vknob" style={{ top: `calc(4px + ${(1 - value).toFixed(4)} * (100% - 34px))` }} />
        </div>
        {kind === 'opacity' && <span className="pp-vlabel">{pct}</span>}
      </div>
    );
  };

  const toolIcon = { brush: BrushGlyph, smudge: SmudgeGlyph, eraser: EraserGlyph }[paintTool];
  const ToolIcon = toolIcon;
  const brushTitle = { brush: 'Brushes', smudge: 'Smudge', eraser: 'Erase' }[paintTool];
  const infoLines = useMemo(() => [`${W} × ${H}px`, `${layers.length} layer${layers.length === 1 ? '' : 's'}`, `Created ${new Date(artwork.created).toLocaleDateString()}`, title], [W, H, layers.length, artwork.created, title]);

  /* ---------- UI ---------- */
  return (
    <div className="pp-editor" ref={wrapRef}>
      <canvas
        ref={viewCanvas}
        className="pp-view"
        style={{ filter: colorModeFilter(prefs.colorMode), cursor: prefs.drawCursor ? 'crosshair' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Canvas"
      />
      {!ready && <div className="pp-loading">Opening…</div>}

      {/* toolbar */}
      {!hideUI && (!expanded ? (
        <div key="folded" {...tbProps('compact pp-collapse')}>
          <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool !== 'select' && tool !== 'transform' ? 'on' : ''}`} aria-label={brushTitle} onClick={() => (tool === 'select' || tool === 'transform' ? chooseTool('brush') : setPanel(panel === 'brush' ? null : 'brush'))}>
            {tool === 'select' ? <SelectGlyph size={18} /> : tool === 'transform' ? <ArrowGlyph size={18} /> : <ToolIcon size={20} />}
          </Button>
          <Button variant="paint" size="paint" type="button" className="pp-more" aria-label="Show tools" onClick={() => setExpanded(true)}><DotsGlyph size={20} /></Button>
        </div>
      ) : (
        <div key="unfolded" {...tbProps('pp-unfold')}>
          <div className="pp-row">
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool === 'brush' ? 'on' : ''}`} aria-label="Paint" onClick={() => chooseTool('brush')}><BrushGlyph size={22} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool === 'smudge' ? 'on' : ''}`} aria-label="Smudge" onClick={() => chooseTool('smudge')}><SmudgeGlyph size={24} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool === 'eraser' ? 'on' : ''}`} aria-label="Erase" onClick={() => chooseTool('eraser')}><EraserGlyph size={24} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${panel === 'layers' ? 'on' : ''}`} aria-label="Layers" onClick={() => setPanel(panel === 'layers' ? null : 'layers')}><LayersGlyph size={24} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-color-btn ${panel === 'colors' ? 'on' : ''}`} aria-label="Colors (drag onto the canvas to fill)" style={{ background: color }}
              onPointerDown={(e) => dragOrTap(e, () => setPanel(panel === 'colors' ? null : 'colors'), () => startColorDrag(color, e))} />
          </div>
          <div className="pp-row pp-row2">
            <Button variant="paint" size="paint" type="button" className="pp-back" aria-label="Gallery" onClick={() => { void exit().catch(() => flash("Could not save artwork. Please try again.")); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l-8 8 8 8" /></svg>
            </Button>
            <Button variant="paint" size="paint" type="button" className={`pp-sub ${panel === 'actions' ? 'on' : ''}`} aria-label="Actions" onClick={() => setPanel(panel === 'actions' ? null : 'actions')}><WrenchGlyph size={18} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-sub ${tool === 'select' ? 'on' : ''}`} aria-label="Selection" onClick={() => chooseTool('select')}><SelectGlyph size={17} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-sub ${tool === 'transform' ? 'on' : ''}`} aria-label="Transform" onClick={() => chooseTool(tool === 'transform' ? 'brush' : 'transform')}><ArrowGlyph size={17} /></Button>
            <Button variant="paint" size="paint" type="button" className="pp-sub pp-fold-btn" aria-label="Fold toolbar" onClick={() => setExpanded(false)}><DotsGlyph size={16} /></Button>
          </div>
        </div>
      ))}

      {/* side sliders — moved together with two fingers; seat on the left or right side */}
      {!hideUI && (
        <div ref={sidebarRef} className={`pp-sidebar sb-${sbSide} ${sbDrag ? 'sb-dragging' : ''}`}
          style={{ transform: sbDrag ? `translate(${sbDrag.x}px, ${sbY + sbDrag.y}px)` : `translateY(${sbY}px)` }}>
          {sideSlider('size')}
          {sideSlider('opacity')}
        </div>
      )}

      {toast && <div className="pp-toast">{toast}</div>}

      {/* contextual bottom bars */}
      {!hideUI && tool === 'select' && !panel && !adjust && (
        <Sheet modal={false} label="Selection" className="pp-bottombar" onClose={() => setTool('brush')}>
          <div className="pp-seg small">
            {(['Freehand', 'Rectangle', 'Ellipse'] as SelMode[]).map((m) => <Button variant="paint" size="paint" key={m} type="button" className={selMode === m ? 'on' : ''} onClick={() => setSelMode(m)}>{m}</Button>)}
          </div>
          <div className="pp-chip-row">
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('all')}>All</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('invert')}>Invert</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('copy-paste')}>Copy &amp; Paste</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('fill')}>Fill</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('delete')}>Delete</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('clear')}>Clear</Button>
          </div>
        </Sheet>
      )}
      {!hideUI && tool === 'transform' && floatingOn && !panel && (
        <Sheet modal={false} label="Transform" className="pp-bottombar pp-tf-sheet" onClose={() => { commitTransform(); setTool('brush'); }}>
          <div className="pp-seg small pp-tf-tabs" role="tablist" aria-label="Transform mode">
            {(['Freeform', 'Uniform', 'Distort', 'Warp'] as const).map((m) => (
              <Button variant="paint" size="paint" key={m} type="button" role="tab" aria-selected={tfMode === m} className={tfMode === m ? 'on' : ''}
                onClick={() => { if (m === 'Distort' || m === 'Warp') { flash(`${m} isn't available yet`); return; } setTfMode(m); }}>{m}</Button>
            ))}
          </div>
          <div className="pp-tf-icons">
            <Button variant="paint" size="paint" type="button" aria-label="Reset transform" onClick={() => setTf({ tx: 0, ty: 0, scale: 1, rot: 0, fx: 1, fy: 1 })}><RotateCcw size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Flip horizontally" onClick={() => setTf({ ...tf, fx: -tf.fx })}><FlipHorizontal2 size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Flip vertically" onClick={() => setTf({ ...tf, fy: -tf.fy })}><FlipVertical2 size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Rotate 45 degrees" onClick={() => setTf({ ...tf, rot: tf.rot + 45 })}><RotateCw size={19} /></Button>
          </div>
          <Button variant="paint" size="paint" type="button" className="pp-tf-interp" onClick={cycleInterp}>
            <span>Interpolation: {interp}</span><ChevronRight size={17} />
          </Button>
          <Button variant="paint" size="paint" type="button" className="pp-tf-done" aria-label="Apply transform" onClick={() => { commitTransform(); setTool('brush'); }}>
            <Check size={20} />
          </Button>
        </Sheet>
      )}
      {!hideUI && !adjust && (() => {
        const activeLayer = layers.find((l) => l.id === activeId);
        if (activeLayer?.kind === 'adjust' && activeLayer.adjust) {
          const adjName = activeLayer.adjust.name as AdjustmentName;
          const params = activeLayer.adjust.params ?? { amount: activeLayer.adjust.value ?? 50, value: activeLayer.adjust.value ?? 50 };
          return (
            <AdjustmentBar
              name={adjName}
              params={params}
              isLayer={true}
              onChange={(newParams) => {
                const val = newParams.amount ?? newParams.value ?? 50;
                updateLayer(activeLayer.id, {
                  adjust: { name: adjName, value: val, params: newParams }
                });
              }}
              onApply={() => {
                const firstPixel = layers.find((l) => (l.kind ?? 'pixel') === 'pixel');
                if (firstPixel) setActiveId(firstPixel.id);
              }}
              onCancel={() => {
                const firstPixel = layers.find((l) => (l.kind ?? 'pixel') === 'pixel');
                if (firstPixel) setActiveId(firstPixel.id);
              }}
              onReset={() => {
                updateLayer(activeLayer.id, {
                  adjust: { name: adjName, value: 0 }
                });
              }}
            />
          );
        }
        return null;
      })()}
      {!hideUI && adjust && adjust.name !== 'Liquify' && (
        <AdjustmentBar
          name={adjust.name as AdjustmentName}
          params={adjust.params ?? { amount: adjust.value, value: adjust.value }}
          onChange={(newParams) => {
            const val = newParams.amount ?? newParams.value ?? 50;
            applyAdjust(val, newParams);
          }}
          onApply={() => endAdjust(false)}
          onCancel={() => endAdjust(true)}
          onReset={() => applyAdjust(0)}
        />
      )}
      {!hideUI && adjust && adjust.name === 'Liquify' && (
        <LiquifySheet value={liq} onChange={setLiq} onReset={resetLiquify} onDone={() => endAdjust(false)} />
      )}
      {!hideUI && drop && (
        <div
          className="pp-drop-capture"
          onPointerDown={(e) => {
            const startX = e.clientX, startY = e.clientY, startT = drop.threshold;
            let moved = false;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const el = e.currentTarget as HTMLElement;
            const move = (ev: PointerEvent) => {
              const dx = ev.clientX - startX;
              if (!moved && Math.abs(dx) > 6) { moved = true; setDropSliding(true); }
              if (!moved) return;
              const t = Math.max(0, Math.min(100, Math.round(startT + dx / 3)));
              if (t !== drop.threshold) redoDrop(t);
            };
            const up = () => {
              el.removeEventListener('pointermove', move);
              el.removeEventListener('pointerup', up);
              setDropSliding(false);
              if (moved) return;
              if (drop.continuing) doColorDrop(startX, startY, drop.color, drop.threshold, true);
              else setDrop(null);
            };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerup', up);
          }}
        >
          {dropSliding && (
            <div className="pp-drop-threshold" role="slider" aria-label="ColorDrop Threshold" aria-valuenow={drop.threshold} aria-valuemin={0} aria-valuemax={100}>
              <div className="pp-drop-fill" style={{ width: `${drop.threshold}%` }} />
              <span>ColorDrop Threshold</span>
              <b>{drop.threshold}%</b>
            </div>
          )}
        </div>
      )}
      {!hideUI && drop && (
        <div className="pp-adjust-pill pp-drop-pill" role="group" aria-label="ColorDrop">
          <div className="pp-adjust-pill-copy">
            <b>ColorDrop</b>
            <span>Slide canvas to adjust</span>
          </div>
          <Button variant="paint" size="paint" type="button" className={`pp-drop-continue ${drop.continuing ? 'on' : ''}`} aria-pressed={!!drop.continuing}
            onClick={() => setDrop({ ...drop, continuing: !drop.continuing })}>Continue filling</Button>
          <Button variant="paint" size="paint" type="button" className={`pp-circle-btn pp-drop-edge-btn ${prefs.edgeDetect ? 'on' : ''}`}
            title="Edge detection" aria-label="Toggle edge detection" aria-pressed={prefs.edgeDetect}
            onClick={() => { const next = !prefs.edgeDetect; setPrefs(writePrefs({ edgeDetect: next })); flash(next ? 'Edge detection on' : 'Edge detection off — plain flood fill'); }}>
            <Scan size={18} strokeWidth={2.4} />
          </Button>
          <Button variant="paint" size="paint" type="button" className="pp-adjust-check" aria-label="Finish ColorDrop" onClick={() => setDrop(null)}>
            <Check size={20} strokeWidth={2.6} />
          </Button>
        </div>
      )}
      {!hideUI && textDraft && <TextSheet draft={textDraft} onChange={setTextDraft} onCancel={() => setTextDraft(null)} onApply={applyText} onNotice={flash} />}

      {/* three-finger swipe down: cut / copy / paste for the current layer */}
      {!hideUI && clipMenu && (
        <Sheet label="Copy & Paste" className="pp-nested-menu pp-clipmenu" onClose={() => setClipMenu(false)}>
          <div className="pp-menu-items">
            <Button variant="paint" size="paint" type="button" onClick={() => { copySelection(true); setClipMenu(false); }}>Cut</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { copySelection(false); setClipMenu(false); }}>Copy</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { pasteClipboard(); setClipMenu(false); }}>Paste</Button>
          </div>
        </Sheet>
      )}

      {/* ColorDrop wave animation, loupe & ColorDrop ghost */}
      {dropWave && (
        <div
          className="pp-colordrop-wave"
          style={{ left: dropWave.x, top: dropWave.y, '--wave-color': dropWave.color } as any}
        />
      )}
      {loupe && (
        <div className="pp-loupe" style={{ left: Math.max(46, Math.min(window.innerWidth - 46, loupe.x)), top: Math.max(46, Math.min(window.innerHeight - 46, loupe.y - 70)), background: `linear-gradient(180deg, ${loupe.color} 50%, ${loupe.old} 50%)` }} />
      )}
      {ghost && <BlobGhost x={ghost.x} y={ghost.y} color={ghost.color} />}

      <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f); e.target.value = ''; }} />

      {/* panels */}
      {!hideUI && panel === 'colors' && (
        <ColorsSheet
          color={color} previous={prevColor} recent={recent} palettes={palettes} tab={colorTab} harmony={harmony}
          onTab={setColorTab} onHarmony={setHarmony}
          onChange={(c) => setColor(c)}
          onCommit={() => commitRecent()}
          onSwap={() => { setPrevColor(color); setColor(prevColor); }}
          onPalettes={setPalettes}
          onDragStart={(hex, e) => startColorDrag(hex, e)}
          paletteView={paletteView} onPaletteView={setPaletteView}
          onClearHistory={() => setRecent([])}
          onClose={() => { setPanel(null); commitRecent(); }}
          onDetach={(t, x, y, paletteId) => {
            const id = makeId();
            setPanel(null);
            setGrabbedFloater(id);
            setFloaters((f) => [...f.slice(-5), { id, tab: t, x, y, paletteId }]);
          }}
          onApplyPalette={applyPaletteToLayer}
        />
      )}
      {!hideUI && floaters.map((f) => (
        <FloatingPicker key={f.id} floater={f} grabbed={grabbedFloater === f.id}
          color={color} previous={prevColor} recent={recent} palettes={palettes} harmony={harmony} paletteView={paletteView}
          onChange={(c) => setColor(c)} onCommit={() => commitRecent()}
          onHarmony={setHarmony} onPalettes={setPalettes} onPaletteView={setPaletteView}
          onDragStart={(hex, e) => startColorDrag(hex, e)}
          onMove={(x, y) => { setGrabbedFloater(null); setFloaters((all) => all.map((o) => (o.id === f.id ? { ...o, x, y } : o))); }}
          onRemove={() => { setGrabbedFloater(null); setFloaters((all) => all.filter((o) => o.id !== f.id)); try { localStorage.removeItem(`pp.floatScale.${f.id}`); } catch { /* ignore */ } }} />
      ))}
      {!hideUI && panel === 'layers' && (
        <LayersBar
          layers={layers} activeId={activeId} version={version} background={bg} backgroundVisible={bgVisible}
          onSelect={(id) => setActiveId(id)}
          onAdd={() => insertLayer()}
          onToggle={(id) => { const l = layersRef.current.find((x) => x.id === id); if (l) updateLayer(id, { visible: !l.visible }); }}
          onReorder={reorder}
          onUpdate={updateLayer}
          onAction={layerAction}
          onAdjustments={() => { if (adjust) endAdjust(false); setPanel('adjust'); }}
          onAddAdjustment={addAdjustmentLayer}
          onAddGroup={addGroup}
          onAddText={() => void runAction('add-text')}
          onSelectAll={selectAll}
          onShare={() => void runAction('export-png')}
          onAdjustValue={setAdjustValue}
          texture={texture?.id ?? null}
          onTexture={chooseTexture}
          onNotice={flash}
          onClose={() => setPanel(null)}
          onBackground={() => { pushHistory([]); setBg(color); scheduleSave(); flash('Background set to current color'); }}
          onBackgroundVisible={() => { pushHistory([]); setBgVisible(!bgVisible); scheduleSave(); }}
        />
      )}
      {!hideUI && panel === 'brush' && (
        <BrushSheet
          title={brushTitle}
          brushId={brushIds[paintTool]}
          streamline={streamline}
          onStreamline={setStreamline}
          onPick={(id) => setBrushIds((b) => ({ ...b, [paintTool]: id }))}
          onOpenStudio={(b) => setEditingBrush(b)}
          onImportBrushes={(imported) => {
            registerBrushes(imported);
            if (imported.length > 0) {
              setBrushIds((b) => ({ ...b, [paintTool]: imported[0].id }));
              flash(`Imported ${imported.length} brush${imported.length === 1 ? '' : 'es'}`);
            }
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {!hideUI && panel === 'actions' && (
        <ActionsSheet tab={actionTab} onTab={setActionTab} guide={guide} reference={!!referenceId} info={infoLines} dark={dark} onDark={setDark}
          prefsSlot={<CanvasPrefs prefs={prefs} onPrefs={setPrefs} />}
          onAction={(a) => void runAction(a)} onClose={() => setPanel(null)} />
      )}
      {!hideUI && panel === 'adjust' && <AdjustmentsSheet onPick={startAdjust} onClose={() => setPanel(null)} />}
      {editingBrush && (
        <BrushStudio
          brush={editingBrush}
          onSave={(updated) => {
            updateBrushDef(updated);
            flash(`Saved "${updated.name}"`);
            setEditingBrush(null);
          }}
          onClose={() => setEditingBrush(null)}
        />
      )}
    </div>
  );
}

export { blendModes, clampSize };
