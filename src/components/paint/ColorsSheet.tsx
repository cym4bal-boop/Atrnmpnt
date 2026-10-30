// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { Sheet } from './Sheet';
import { clamp, harmonyColors, harmonyModes, hexToHsv, hexToRgb, hsvToHex, isValidHex, rgbToHex, type HarmonyMode, type HSV } from './color';
import { Camera, Check, Plus, PanelTop, GalleryVerticalEnd, PictureInPicture2 } from 'lucide-react';
import { DotsGlyph } from './icons';
import { TabClassicGlyph, TabDiscGlyph, TabHarmonyGlyph, TabPalettesGlyph, TabValueGlyph } from './icons';

export type ColorTab = 'Disc' | 'Classic' | 'Harmony' | 'Value' | 'Palettes';
export type Palette = { id: string; name: string; colors: string[] };

type Props = {
  color: string;
  previous: string;
  recent: string[];
  palettes: Palette[];
  tab: ColorTab;
  harmony: HarmonyMode;
  paletteView: 'Compact' | 'Cards';
  onTab: (t: ColorTab) => void;
  onHarmony: (m: HarmonyMode) => void;
  onPaletteView: (v: 'Compact' | 'Cards') => void;
  onClearHistory: () => void;
  onChange: (hex: string) => void;
  onCommit: () => void;
  onSwap: () => void;
  onPalettes: (p: Palette[]) => void;
  onDragStart: (hex: string, e: RPE) => void;
  onClose: () => void;
  /** two-finger long press on the picker (or the per-palette PiP button): drag a floating copy out */
  onDetach?: (tab: ColorTab | 'Palette', x: number, y: number, paletteId?: string) => void;
  /** remap the active layer's pixels to this palette */
  onApplyPalette?: (colors: string[]) => void;
};

/** Hue angle on screen: red at right, counter-clockwise (matches the reference wheel). */
const hueToAngle = (h: number) => (-h * Math.PI) / 180;

function useHsv(color: string) {
  // Keep hue/saturation stable when brightness or saturation hits 0.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color));
  const last = useRef(color);
  useEffect(() => {
    if (color.toLowerCase() !== last.current.toLowerCase()) {
      const next = hexToHsv(color);
      setHsv((prev) => ({ h: next.s === 0 || next.v === 0 ? prev.h : next.h, s: next.v === 0 ? prev.s : next.s, v: next.v }));
      last.current = color;
    }
  }, [color]);
  return [hsv, (n: HSV) => { setHsv(n); last.current = hsvToHex(n); }] as const;
}

export function ColorsSheet(props: Props) {
  const { color, previous, tab, onTab, onChange, onCommit, onClose } = props;
  const [hsv, setLocal] = useHsv(color);
  const set = (n: HSV) => { setLocal(n); onChange(hsvToHex(n)); };

  const subtitle = tab === 'Harmony' ? props.harmony : tab === 'Palettes' ? 'Palettes' : '';

  return (
    <Sheet onClose={onClose} label="Colors" className="pp-sheet-inset pp-colors" height="min(78dvh, 660px)">
      {tab === 'Palettes' ? <PalettesHead {...props} /> : <div className="pp-colors-head">
        <div>
          <h2>Colors</h2>
          {tab === 'Harmony' ? (
            <Button variant="paint" size="paint" type="button" className="pp-sub-btn" onClick={() => props.onHarmony(harmonyModes[(harmonyModes.indexOf(props.harmony) + 1) % harmonyModes.length])}>{subtitle}</Button>
          ) : subtitle ? <div className="pp-sub">{subtitle}</div> : null}
        </div>
        {props.onDetach && <Button variant="paint" size="paint" type="button" className="pp-circle-btn pp-detach-btn" aria-label="Float this picker on the canvas (or hold it with two fingers)"
          onPointerDown={(e) => { e.stopPropagation(); props.onDetach?.(tab, e.clientX, e.clientY); }}><PictureInPicture2 size={18} /></Button>}
        <div className="pp-swatch-pair">
          <Button variant="paint" size="paint" type="button" aria-label="Current color" style={{ background: color }} onPointerDown={(e) => dragOrTap(e, () => {}, () => props.onDragStart(color, e))} />
          <Button variant="paint" size="paint" type="button" aria-label="Previous color" style={{ background: previous }} onPointerDown={(e) => dragOrTap(e, props.onSwap, () => props.onDragStart(previous, e))} />
        </div>
      </div>}

      <div className="pp-colors-body" {...useDetachPress((x, y) => props.onDetach?.(tab, x, y))}>
        <PickerFace {...props} hsv={hsv} set={set} />
        {props.recent.length > 0 && tab !== 'Palettes' && tab !== 'Harmony' && (
          <div className="pp-history">
            <div className="pp-history-head">
              <span>History</span>
              <Button variant="paint" size="paint" type="button" className="pp-text-btn" onClick={props.onClearHistory}>Clear</Button>
            </div>
            <div>
              {props.recent.slice(0, 10).map((c, i) => (
                <Button variant="paint" size="paint" key={i} type="button" aria-label={`Use ${c}`} style={{ background: c }} onPointerDown={(e) => dragOrTap(e, () => { onChange(c); onCommit(); }, () => props.onDragStart(c, e))} />
              ))}
            </div>
          </div>
        )}
      </div>

      <nav className="pp-color-tabs">
        {([
          ['Disc', TabDiscGlyph], ['Classic', TabClassicGlyph], ['Harmony', TabHarmonyGlyph], ['Value', TabValueGlyph], ['Palettes', TabPalettesGlyph],
        ] as const).map(([name, Icon]) => (
          <Button variant="paint" size="paint" key={name} type="button" className={tab === name ? 'active' : ''} onClick={() => onTab(name)}>
            <Icon /><span>{name}</span>
          </Button>
        ))}
      </nav>
    </Sheet>
  );
}

/** The picker for one tab; shared by the Colors window and floating pickers. */
export function PickerFace(props: Props & { hsv: HSV; set: (h: HSV) => void; size?: number }) {
  const { tab, hsv, set, onCommit, size } = props;
  return <>
    {tab === 'Disc' && <Disc hsv={hsv} onChange={set} onCommit={onCommit} size={size} />}
    {tab === 'Classic' && <Classic hsv={hsv} onChange={set} onCommit={onCommit} size={size} />}
    {tab === 'Harmony' && <Harmony hsv={hsv} mode={props.harmony} onChange={set} onCommit={onCommit} onPick={(h) => { set(h); onCommit(); }} size={size} />}
    {tab === 'Value' && <Values hsv={hsv} onChange={set} onCommit={onCommit} size={size} />}
    {tab === 'Palettes' && <Palettes {...props} />}
  </>;
}

/** Floating picker body: keeps its own hue/sat memory like the window does. */
export function FloatingPickerFace(props: Props & { size?: number }) {
  const [hsv, setLocal] = useHsv(props.color);
  const set = (n: HSV) => { setLocal(n); props.onChange(hsvToHex(n)); };
  return <PickerFace {...props} hsv={hsv} set={set} size={props.size} />;
}

/** Two fingers held still on the picker for ~0.45s fires onHold at their midpoint. */
export function useDetachPress(onHold: (x: number, y: number) => void) {
  const pts = useRef(new Map<number, { x: number; y: number; sx: number; sy: number }>());
  const timer = useRef<number | undefined>(undefined);
  const holdRef = useRef(onHold); holdRef.current = onHold;
  const clear = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => clear, []);
  return {
    onPointerDownCapture: (e: RPE) => {
      if (e.pointerType === 'mouse') return;
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (pts.current.size === 2) {
        clear();
        timer.current = window.setTimeout(() => {
          const v = [...pts.current.values()];
          if (v.length < 2) return;
          if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* ignore */ }
          holdRef.current((v[0]!.x + v[1]!.x) / 2, (v[0]!.y + v[1]!.y) / 2);
        }, 450);
      } else if (pts.current.size > 2) clear();
    },
    onPointerMoveCapture: (e: RPE) => {
      const p = pts.current.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 14) clear();
    },
    onPointerUpCapture: (e: RPE) => { pts.current.delete(e.pointerId); clear(); },
    onPointerCancelCapture: (e: RPE) => { pts.current.delete(e.pointerId); clear(); },
  };
}

/** Distinguishes a tap from a drag on a swatch; drag starts ColorDrop. */
export function dragOrTap(e: RPE, tap: () => void, drag: () => void) {
  const sx = e.clientX, sy = e.clientY;
  let dragging = false;
  const move = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) {
      dragging = true;
      cleanup();
      drag();
    }
  };
  const up = () => { cleanup(); if (!dragging) tap(); };
  const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function usePad(onMove: (x: number, y: number, rect: DOMRect) => void, onEnd: () => void) {
  return {
    onPointerDown: (e: RPE<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const r = e.currentTarget.getBoundingClientRect();
      onMove(e.clientX - r.left, e.clientY - r.top, r);
    },
    onPointerMove: (e: RPE<HTMLElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const r = e.currentTarget.getBoundingClientRect();
      onMove(e.clientX - r.left, e.clientY - r.top, r);
    },
    onPointerUp: onEnd,
    onPointerCancel: onEnd,
  };
}

function drawHueWheel(ctx: CanvasRenderingContext2D, size: number, v: number) {
  const r = size / 2;
  ctx.clearRect(0, 0, size, size);
  const conic = ctx.createConicGradient(0, r, r);
  for (let i = 0; i <= 12; i++) conic.addColorStop(i / 12, hsvToHex({ h: 360 - i * 30, s: 1, v: 1 }));
  ctx.fillStyle = conic;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  const radial = ctx.createRadialGradient(r, r, 0, r, r, r);
  radial.addColorStop(0, 'rgba(255,255,255,1)');
  radial.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = radial;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  if (v < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - v})`;
    ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  }
}

function WheelCanvas({ v, size }: { v: number; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = size * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHueWheel(ctx, size, v);
  }, [v, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="pp-wheel-canvas" />;
}

function useWheelSize(override?: number) {
  const [size, setSize] = useState(() => override ?? 280);
  useEffect(() => {
    if (override) {
      setSize(override);
      return;
    }
    const f = () => setSize(Math.max(180, Math.min(290, window.innerWidth - 80, window.innerHeight * 0.38)));
    f(); window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [override]);
  return override ?? size;
}

export function Harmony({ hsv, mode, onChange, onCommit, onPick, size }: { hsv: HSV; mode: HarmonyMode; onChange: (h: HSV) => void; onCommit: () => void; onPick: (h: HSV) => void; size?: number }) {
  const fullSize = useWheelSize(size);
  const wheelSize = size ? Math.min(size - 32, Math.max(120, size * 0.8)) : Math.max(140, fullSize - 40);
  const r = wheelSize / 2;
  const pad = usePad((x, y) => {
    const dx = x - r, dy = y - r;
    const ang = Math.atan2(-dy, dx) * 180 / Math.PI;
    onChange({ h: (ang + 360) % 360, s: clamp(Math.hypot(dx, dy) / r), v: hsv.v });
  }, onCommit);
  const dot = (c: HSV) => ({ left: r + Math.cos(hueToAngle(c.h)) * c.s * r, top: r + Math.sin(hueToAngle(c.h)) * c.s * r, background: hsvToHex(c) });
  return (
    <div className="pp-harmony" style={{ width: size ? `${size}px` : `${fullSize}px`, maxWidth: '100%' }}>
      <div className="pp-wheel" style={{ width: wheelSize, height: wheelSize, margin: '0 auto' }} {...pad}>
        <WheelCanvas v={hsv.v} size={wheelSize} />
        {harmonyColors(hsv, mode).map((c, i) => (
          <Button variant="paint" size="paint" key={i} type="button" className="pp-wheel-dot small" style={dot(c)} aria-label="Use harmony color"
            onPointerDown={(e) => { e.stopPropagation(); onPick(c); }} />
        ))}
        <span className="pp-wheel-dot" style={dot(hsv)} />
      </div>
      <div className="w-full px-2 mt-3">
        <GradientSlider value={hsv.v} onChange={(v) => onChange({ ...hsv, v })} onCommit={onCommit}
          background={`linear-gradient(90deg, #000, ${hsvToHex({ ...hsv, v: 1 })})`} thin />
      </div>
    </div>
  );
}

export function Disc({ hsv, onChange, onCommit, size }: { hsv: HSV; onChange: (h: HSV) => void; onCommit: () => void; size?: number }) {
  const wheelSize = useWheelSize(size);
  const r = wheelSize / 2;
  const ring = Math.max(22, wheelSize * 0.11);
  const inner = r - ring - 6;
  const mode = useRef<'ring' | 'inner' | null>(null);
  const pad = usePad((x, y) => {
    const dx = x - r, dy = y - r;
    const dist = Math.hypot(dx, dy);
    if (!mode.current) mode.current = dist > inner + 4 ? 'ring' : 'inner';
    if (mode.current === 'ring') {
      onChange({ ...hsv, h: ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360 });
    } else {
      let ix = dx, iy = dy;
      if (dist > inner) { ix = (dx / dist) * inner; iy = (dy / dist) * inner; }
      onChange({ h: hsv.h, s: clamp((ix + inner) / (inner * 2)), v: clamp(1 - (iy + inner) / (inner * 2)) });
    }
  }, () => { mode.current = null; onCommit(); });
  const ringDot = { left: r + Math.cos(hueToAngle(hsv.h)) * (r - ring / 2), top: r + Math.sin(hueToAngle(hsv.h)) * (r - ring / 2), background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) };
  const innerDot = { left: r - inner + hsv.s * inner * 2, top: r - inner + (1 - hsv.v) * inner * 2, background: hsvToHex(hsv) };
  return (
    <div className="pp-wheel pp-disc" style={{ width: wheelSize, height: wheelSize }} {...pad}>
      <div className="pp-disc-ring" style={{ inset: 0, WebkitMask: `radial-gradient(circle, transparent ${r - ring}px, #000 ${r - ring + 1}px)`, mask: `radial-gradient(circle, transparent ${r - ring}px, #000 ${r - ring + 1}px)` }} />
      <div className="pp-disc-inner" style={{ width: inner * 2, height: inner * 2, left: r - inner, top: r - inner, background: `linear-gradient(0deg, #000, transparent), linear-gradient(90deg, #fff, ${hsvToHex({ h: hsv.h, s: 1, v: 1 })})` }} />
      <span className="pp-wheel-dot" style={ringDot} />
      <span className="pp-wheel-dot" style={innerDot} />
    </div>
  );
}

export function Classic({ hsv, onChange, onCommit, size }: { hsv: HSV; onChange: (h: HSV) => void; onCommit: () => void; size?: number }) {
  const pad = usePad((x, y, rect) => onChange({ h: hsv.h, s: clamp(x / rect.width), v: clamp(1 - y / rect.height) }), onCommit);
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const w = size ?? 270;
  const h = size ? Math.max(100, size - 34) : 180;
  return (
    <div className="pp-classic" style={{ width: w }}>
      <div className="pp-sv" {...pad} style={{ height: h, background: `linear-gradient(0deg, #000, transparent), linear-gradient(90deg, #fff, ${pure})` }}>
        <span className="pp-wheel-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
      </div>
      <GradientSlider value={hsv.h / 360} onChange={(t) => onChange({ ...hsv, h: t * 360 })} onCommit={onCommit}
        background="linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" thin knobColor={pure} />
    </div>
  );
}

export function Values({ hsv, onChange, onCommit, size }: { hsv: HSV; onChange: (h: HSV) => void; onCommit: () => void; size?: number }) {
  const [valMode, setValMode] = useState<'hsb' | 'rgb'>('hsb');
  const hex = hsvToHex(hsv);
  const rgb = hexToRgb(hex);
  const [draft, setDraft] = useState(hex.slice(1).toUpperCase());
  useEffect(() => setDraft(hex.slice(1).toUpperCase()), [hex]);
  const setRgb = (k: 'r' | 'g' | 'b', t: number) => onChange(hexToHsv(rgbToHex({ ...rgb, [k]: Math.round(t * 255) })));

  const hsbRows: [string, number, (t: number) => void, string, string][] = [
    ['H', hsv.h / 360, (t) => onChange({ ...hsv, h: t * 360 }), 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)', `${Math.round(hsv.h)}°`],
    ['S', hsv.s, (s) => onChange({ ...hsv, s }), `linear-gradient(90deg, ${hsvToHex({ ...hsv, s: 0 })}, ${hsvToHex({ ...hsv, s: 1 })})`, `${Math.round(hsv.s * 100)}%`],
    ['B', hsv.v, (v) => onChange({ ...hsv, v }), `linear-gradient(90deg, #000, ${hsvToHex({ ...hsv, v: 1 })})`, `${Math.round(hsv.v * 100)}%`],
  ];

  const rgbRows: [string, number, (t: number) => void, string, string][] = [
    ['R', rgb.r / 255, (t) => setRgb('r', t), `linear-gradient(90deg, ${rgbToHex({ ...rgb, r: 0 })}, ${rgbToHex({ ...rgb, r: 255 })})`, `${rgb.r}`],
    ['G', rgb.g / 255, (t) => setRgb('g', t), `linear-gradient(90deg, ${rgbToHex({ ...rgb, g: 0 })}, ${rgbToHex({ ...rgb, g: 255 })})`, `${rgb.g}`],
    ['B', rgb.b / 255, (t) => setRgb('b', t), `linear-gradient(90deg, ${rgbToHex({ ...rgb, b: 0 })}, ${rgbToHex({ ...rgb, b: 255 })})`, `${rgb.b}`],
  ];

  const activeRows = valMode === 'hsb' ? hsbRows : rgbRows;
  const w = size ?? 270;

  return (
    <div className="pp-values flex flex-col gap-2 w-full max-w-full" style={{ width: w }}>
      {/* HSB / RGB Segmented Picker */}
      <div className="flex bg-black/10 dark:bg-white/10 p-0.5 rounded-full mx-1">
        <button
          type="button"
          onClick={() => setValMode('hsb')}
          className={`flex-1 py-1 text-xs font-semibold rounded-full transition-all ${
            valMode === 'hsb' ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
          }`}
        >
          HSB
        </button>
        <button
          type="button"
          onClick={() => setValMode('rgb')}
          className={`flex-1 py-1 text-xs font-semibold rounded-full transition-all ${
            valMode === 'rgb' ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
          }`}
        >
          RGB
        </button>
      </div>

      {/* 3 Active Sliders */}
      <div className="pp-value-group bg-black/5 dark:bg-white/5 rounded-2xl p-2.5 flex flex-col gap-1.5">
        {activeRows.map(([label, value, fn, bg, text], i) => (
          <div key={label} className="pp-value-row grid grid-cols-[20px_1fr_44px] items-center gap-2 h-8">
            <span className="pp-value-label text-xs font-bold text-neutral-600 dark:text-neutral-300">{label}</span>
            <GradientSlider value={value} onChange={fn} onCommit={onCommit} background={bg} thin knobColor={label === 'H' ? hsvToHex({ ...hsv, s: 1, v: 1 }) : hex} />
            <span className="pp-value-num text-xs font-mono font-semibold text-right text-neutral-700 dark:text-neutral-200">{text}</span>
          </div>
        ))}
      </div>

      {/* Hexadecimal Input */}
      <label className="pp-hex flex items-center justify-between px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-xl text-xs font-semibold">
        <span className="text-neutral-600 dark:text-neutral-300">Hexadecimal</span>
        <span className="pp-hex-field flex items-center bg-black/10 dark:bg-white/10 px-2.5 py-1 rounded-lg font-mono">
          #
          <input
            value={draft}
            maxLength={6}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9a-f]/gi, '');
              setDraft(v);
              if (v.length === 6 && isValidHex(v)) {
                onChange(hexToHsv(`#${v}`));
                onCommit();
              }
            }}
            className="w-16 bg-transparent outline-none uppercase font-mono font-bold text-xs pl-0.5"
          />
        </span>
      </label>
    </div>
  );
}

const DEFAULT_PAL_KEY = 'pp.defaultPalette';

function PalettesHead({ palettes, onPalettes }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const add = () => onPalettes([...palettes, { id: Math.random().toString(36).slice(2), name: 'Untitled', colors: [] }]);
  const fromPhoto = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
      const c = document.createElement('canvas'); c.width = 10; c.height = 3;
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, 10, 3);
      const d = ctx.getImageData(0, 0, 10, 3).data;
      const colors: string[] = [];
      for (let i = 0; i < 30; i++) colors.push(rgbToHex({ r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] }));
      onPalettes([...palettes, { id: Math.random().toString(36).slice(2), name: file.name.replace(/\.[^.]+$/, '') || 'Photo', colors }]);
    } catch { /* unreadable image */ } finally { URL.revokeObjectURL(url); }
  };
  return (
    <div className="pp-colors-head pp-pal-head">
      <h2>Palettes</h2>
      <div className="pp-head-btns">
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="New palette from a photo" onClick={() => fileRef.current?.click()}><Camera size={20} /></Button>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="New palette" onClick={add}><Plus size={22} /></Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromPhoto(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}

function Palettes({ palettes, color, paletteView, onPaletteView, onPalettes, onChange, onCommit, onDragStart, onApplyPalette, onDetach }: Props) {
  const [def, setDef] = useState<string>(() => { try { return localStorage.getItem(DEFAULT_PAL_KEY) ?? palettes[0]?.id ?? ''; } catch { return palettes[0]?.id ?? ''; } });
  const [menu, setMenu] = useState<string | null>(null);
  const makeDefault = (id: string) => { setDef(id); try { localStorage.setItem(DEFAULT_PAL_KEY, id); } catch { /* ignore */ } };
  return (
    <div className="pp-palettes">
      <div className="pp-seg pp-pal-seg" role="radiogroup" aria-label="Palette style">
        {([['Compact', PanelTop], ['Cards', GalleryVerticalEnd]] as const).map(([v, Icon]) => (
          <Button variant="paint" size="paint" key={v} type="button" role="radio" aria-checked={paletteView === v} className={paletteView === v ? 'on' : ''} onClick={() => onPaletteView(v)}><Icon size={17} />{v}</Button>
        ))}
      </div>
      {palettes.map((p, pi) => (
        <div key={p.id} className={`pp-palette ${paletteView === 'Cards' ? 'cards' : ''}`}>
          <div className="pp-palette-name">
            {p.id === def && <span className="pp-pal-check" aria-label="Default palette"><Check size={12} strokeWidth={3.5} /></span>}
            <input value={p.name} aria-label="Palette name" onChange={(e) => onPalettes(palettes.map((x, i) => (i === pi ? { ...x, name: e.target.value } : x)))} />
            {onDetach && <Button variant="paint" size="paint" type="button" className="pp-pal-pip" aria-label={`Float ${p.name} on the canvas (picture-in-picture)`}
              onPointerDown={(e) => { e.stopPropagation(); onDetach('Palette', e.clientX, e.clientY, p.id); }}><PictureInPicture2 size={15} /></Button>}
            <Button variant="paint" size="paint" type="button" className="pp-pal-more" aria-label={`${p.name} options`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}><DotsGlyph size={18} /></Button>
          </div>
          {menu === p.id && (
            <div className="pp-pal-menu" role="menu">
              {onApplyPalette && <Button variant="paint" size="paint" type="button" role="menuitem" disabled={!p.colors.length} onClick={() => { onApplyPalette(p.colors); setMenu(null); }}>Apply to layer</Button>}
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => makeDefault(p.id)}>Set as default</Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => onPalettes(palettes.map((x, i) => (i === pi ? { ...x, colors: [] } : x)))}>Clear</Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" className="danger" onClick={() => { onPalettes(palettes.filter((_, i) => i !== pi)); setMenu(null); }}>Delete</Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => setMenu(null)}>Done</Button>
            </div>
          )}
          <div className="pp-palette-grid">
            {Array.from({ length: Math.max(30, Math.ceil((p.colors.length + 1) / 10) * 10) }, (_, ci) => {
              const c = p.colors[ci];
              return c ? (
                <Button variant="paint" size="paint" key={ci} type="button" aria-label={`Swatch ${c}`} style={{ background: c }}
                  onContextMenu={(e) => { e.preventDefault(); onPalettes(palettes.map((x, i) => (i === pi ? { ...x, colors: x.colors.filter((_, j) => j !== ci) } : x))); }}
                  onPointerDown={(e) => dragOrTap(e, () => { onChange(c); onCommit(); }, () => onDragStart(c, e))} />
              ) : (
                <Button variant="paint" size="paint" key={ci} type="button" className="empty" aria-label="Add current color to palette"
                  onClick={() => onPalettes(palettes.map((x, i) => (i === pi ? { ...x, colors: [...x.colors, color] } : x)))} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GradientSlider({ value, onChange, onCommit, background, thin, knobColor }: { value: number; onChange: (v: number) => void; onCommit?: () => void; background: string; thin?: boolean; knobColor?: string }) {
  const pad = usePad((x, _y, rect) => onChange(clamp(x / rect.width)), () => onCommit?.());
  return (
    <div className={`pp-gslider ${thin ? 'thin' : ''}`} {...pad}>
      <div className="pp-gslider-track" style={{ background }} />
      <span className="pp-gslider-knob" style={{ left: `${value * 100}%`, background: knobColor }} />
    </div>
  );
}
