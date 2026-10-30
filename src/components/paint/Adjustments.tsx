// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from './Sheet';
import {
  X, Check, RotateCcw, Sliders, Wand2, SunMedium, Palette, Activity,
  Layers, Disc, Eye, Zap, Sparkles, Tv, Grid3X3, Split
} from 'lucide-react';
import { AdjustGlyph, WandGlyph } from './icons';

export type AdjustmentName =
  | 'Hue, Saturation, Brightness'
  | 'Color Balance'
  | 'Curves'
  | 'Gradient Map'
  | 'Gaussian Blur'
  | 'Motion Blur'
  | 'Perspective Blur'
  | 'Noise'
  | 'Sharpen'
  | 'Bloom'
  | 'Glitch'
  | 'Halftone'
  | 'Chromatic Aberration'
  | 'Liquify';

export const ADJUSTMENT_LIST: AdjustmentName[] = [
  'Hue, Saturation, Brightness',
  'Color Balance',
  'Curves',
  'Gradient Map',
  'Gaussian Blur',
  'Motion Blur',
  'Perspective Blur',
  'Noise',
  'Sharpen',
  'Bloom',
  'Glitch',
  'Halftone',
  'Chromatic Aberration',
  'Liquify',
];

export const ADJUST_LABELS: Record<AdjustmentName, string> = {
  'Hue, Saturation, Brightness': 'HSB',
  'Color Balance': 'Color Balance',
  'Curves': 'Curves',
  'Gradient Map': 'Gradient Map',
  'Gaussian Blur': 'Gaussian Blur',
  'Motion Blur': 'Motion Blur',
  'Perspective Blur': 'Perspective Blur',
  'Noise': 'Noise',
  'Sharpen': 'Sharpen',
  'Bloom': 'Bloom',
  'Glitch': 'Glitch',
  'Halftone': 'Halftone',
  'Chromatic Aberration': 'Aberration',
  'Liquify': 'Liquify',
};

export type HsbParams = { hue: number; saturation: number; brightness: number };
export type ColorBalanceParams = {
  tone: 'shadows' | 'midtones' | 'highlights';
  cyanRed: [number, number, number]; // [shadows, midtones, highlights] (-100 to 100)
  magentaGreen: [number, number, number];
  yellowBlue: [number, number, number];
  preserveLuminosity: boolean;
};
export type CurvePoint = { x: number; y: number };
export type CurvesParams = {
  channel: 'composite' | 'red' | 'green' | 'blue';
  curves: {
    composite: CurvePoint[];
    red: CurvePoint[];
    green: CurvePoint[];
    blue: CurvePoint[];
  };
};
export type GradientStop = { pos: number; color: string };
export type GradientMapParams = {
  preset: string;
  stops: GradientStop[];
};
export type BlurParams = { amount: number; angle?: number; mode?: 'positional' | 'directional'; x?: number; y?: number };
export type NoiseParams = { amount: number; type: 'clouds' | 'billows' | 'ridges'; scale: number; octaves: number; turbulence: number };
export type BloomParams = { transition: number; size: number; burn: number };
export type GlitchParams = { mode: 'artifact' | 'wave' | 'signal' | 'diverge'; amount: number; blockSize: number };
export type HalftoneParams = { style: 'full-color' | 'screen-print' | 'newspaper'; dotSize: number; angle: number };
export type AberrationParams = { mode: 'perspective' | 'displace'; amount: number; angle: number };

export const GRADIENT_PRESETS: { name: string; stops: GradientStop[] }[] = [
  { name: 'Neon', stops: [{ pos: 0, color: '#090022' }, { pos: 0.35, color: '#7700a6' }, { pos: 0.7, color: '#ff007f' }, { pos: 1, color: '#00f6ff' }] },
  { name: 'Sunset', stops: [{ pos: 0, color: '#1a0b2e' }, { pos: 0.3, color: '#7b113a' }, { pos: 0.65, color: '#e8505b' }, { pos: 1, color: '#f9d56e' }] },
  { name: 'Breeze', stops: [{ pos: 0, color: '#0f2027' }, { pos: 0.5, color: '#203a43' }, { pos: 1, color: '#2c5364' }] },
  { name: 'Mystic', stops: [{ pos: 0, color: '#2b1055' }, { pos: 0.5, color: '#7597de' }, { pos: 1, color: '#b9e5fb' }] },
  { name: 'Flare', stops: [{ pos: 0, color: '#000000' }, { pos: 0.35, color: '#990000' }, { pos: 0.75, color: '#ff6600' }, { pos: 1, color: '#ffffcc' }] },
  { name: 'Mocha', stops: [{ pos: 0, color: '#2c1810' }, { pos: 0.45, color: '#6d4c41' }, { pos: 0.8, color: '#bcaaa4' }, { pos: 1, color: '#f5ebe6' }] },
  { name: 'Venice', stops: [{ pos: 0, color: '#14213d' }, { pos: 0.4, color: '#4a7c59' }, { pos: 0.75, color: '#e9c46a' }, { pos: 1, color: '#f4a261' }] },
  { name: 'Monochrome', stops: [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }] },
  { name: 'Heatmap', stops: [{ pos: 0, color: '#0000ff' }, { pos: 0.25, color: '#00ffff' }, { pos: 0.5, color: '#00ff00' }, { pos: 0.75, color: '#ffff00' }, { pos: 1, color: '#ff0000' }] },
  { name: 'Vintage', stops: [{ pos: 0, color: '#2e2017' }, { pos: 0.5, color: '#a08264' }, { pos: 1, color: '#ebdccb' }] },
];

export function defaultParams(name: AdjustmentName): any {
  switch (name) {
    case 'Hue, Saturation, Brightness':
      return { hue: 0, saturation: 0, brightness: 0 };
    case 'Color Balance':
      return {
        tone: 'midtones',
        cyanRed: [0, 0, 0],
        magentaGreen: [0, 0, 0],
        yellowBlue: [0, 0, 0],
        preserveLuminosity: true,
      };
    case 'Curves':
      return {
        channel: 'composite',
        curves: {
          composite: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        },
      };
    case 'Gradient Map':
      return { preset: 'Neon', stops: GRADIENT_PRESETS[0].stops };
    case 'Gaussian Blur':
      return { amount: 15 };
    case 'Motion Blur':
      return { amount: 25, angle: 0 };
    case 'Perspective Blur':
      return { amount: 30, mode: 'directional', x: 0.5, y: 0.5 };
    case 'Noise':
      return { amount: 35, type: 'clouds', scale: 20, octaves: 3, turbulence: 40 };
    case 'Sharpen':
      return { amount: 30 };
    case 'Bloom':
      return { transition: 40, size: 30, burn: 20 };
    case 'Glitch':
      return { mode: 'artifact', amount: 30, blockSize: 25 };
    case 'Halftone':
      return { style: 'full-color', dotSize: 12, angle: 45 };
    case 'Chromatic Aberration':
      return { mode: 'displace', amount: 20, angle: 0 };
    default:
      return { amount: 20 };
  }
}

/** Procreate Pocket Adjustments Grid Selector */
export function AdjustmentsSheet({ onPick, onClose }: { onPick: (name: AdjustmentName) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Adjustments" className="pp-sheet-inset pp-adjust-menu" height="min(65dvh, 560px)">
      <div className="pp-sheet-head">
        <h2>Adjustments</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>
      <div className="pp-sheet-scroll">
        <span className="pp-set-label">Procreate Pocket Adjustments</span>
        <div className="pp-adjust-grid">
          {ADJUSTMENT_LIST.map((a) => (
            <Button
              variant="paint"
              size="paint"
              key={a}
              type="button"
              className="pp-adjust-cell"
              onClick={() => onPick(a)}
            >
              {a === 'Liquify' ? (
                <WandGlyph size={22} />
              ) : (
                <AdjustGlyph name={a === 'Hue, Saturation, Brightness' ? 'HSB' : a} size={22} />
              )}
              <span>{ADJUST_LABELS[a] ?? a}</span>
            </Button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Interactive Procreate Pocket 5 Adjustment Controls Bar */
export function AdjustmentBar({
  name,
  params,
  onChange,
  onApply,
  onCancel,
  onReset,
  isLayer = false,
}: {
  name: AdjustmentName;
  params: any;
  onChange: (newParams: any) => void;
  onApply: () => void;
  onCancel: () => void;
  onReset?: () => void;
  isLayer?: boolean;
}) {
  const [activeTone, setActiveTone] = useState<'shadows' | 'midtones' | 'highlights'>('midtones');
  const [activeChannel, setActiveChannel] = useState<'composite' | 'red' | 'green' | 'blue'>('composite');

  return (
    <div
      className="fixed z-40 left-1/2 bottom-4 -translate-x-1/2 w-[min(480px,calc(100%-20px))] max-h-[48dvh] overflow-y-auto no-scrollbar rounded-3xl p-4 flex flex-col gap-3 shadow-2xl transition-all border"
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--pp-sheet-glass, #1e1e22e6) 90%, #ffffff30) 0%, var(--pp-sheet-glass, #1e1e22f2) 40%, color-mix(in srgb, var(--pp-sheet-glass, #1e1e22f2) 94%, #00000050) 100%)',
        backdropFilter: 'blur(32px) saturate(160%)',
        borderColor: 'color-mix(in srgb, var(--pp-border, #4a4a4f) 65%, transparent)',
        boxShadow: '0 20px 48px -10px rgba(0,0,0,0.45), inset 0 1px 1px 0 rgba(255,255,255,0.3)',
      }}
      role="region"
      aria-label={`${name} adjustment`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between pb-1 border-b border-white/10 shrink-0">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
            {isLayer ? 'Adjustment Layer' : 'Adjustment'}
          </span>
          <b className="text-base font-bold leading-tight text-white">{name}</b>
        </div>
        <div className="flex items-center gap-2">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title="Reset adjustment values"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-90"
            >
              <RotateCcw size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            title="Cancel"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-90"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={onApply}
            title="Apply adjustment"
            className="w-8 h-8 rounded-full bg-[#2b7fff] hover:bg-[#1a6ee6] text-white flex items-center justify-center transition-transform active:scale-95 shadow-md"
          >
            <Check size={18} strokeWidth={2.6} />
          </button>
        </div>
      </div>

      {/* Adjustment Body */}
      <div className="flex flex-col gap-2.5 pt-1">
        {/* 1. HSB */}
        {name === 'Hue, Saturation, Brightness' && (
          <div className="flex flex-col gap-2">
            <SliderRow
              label="Hue"
              val={params.hue}
              min={-180}
              max={180}
              unit="°"
              bg="linear-gradient(90deg, #00ffff, #0000ff, #ff00ff, #ff0000, #ffff00, #00ff00, #00ffff)"
              onChange={(v) => onChange({ ...params, hue: v })}
            />
            <SliderRow
              label="Saturation"
              val={params.saturation}
              min={-100}
              max={100}
              unit="%"
              bg="linear-gradient(90deg, #888888, #ff2d55)"
              onChange={(v) => onChange({ ...params, saturation: v })}
            />
            <SliderRow
              label="Brightness"
              val={params.brightness}
              min={-100}
              max={100}
              unit="%"
              bg="linear-gradient(90deg, #000000, #888888, #ffffff)"
              onChange={(v) => onChange({ ...params, brightness: v })}
            />
          </div>
        )}

        {/* 2. Color Balance */}
        {name === 'Color Balance' && (
          <div className="flex flex-col gap-2">
            {/* Tone Selector: Shadows | Midtones | Highlights */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-black/20 rounded-xl">
              {(['shadows', 'midtones', 'highlights'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setActiveTone(t);
                    onChange({ ...params, tone: t });
                  }}
                  className={`py-1.5 text-xs font-semibold capitalize rounded-lg transition-all ${
                    activeTone === t ? 'bg-[#2b7fff] text-white shadow-sm' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {(() => {
              const idx = activeTone === 'shadows' ? 0 : activeTone === 'midtones' ? 1 : 2;
              const updateTone = (key: 'cyanRed' | 'magentaGreen' | 'yellowBlue', val: number) => {
                const arr = [...params[key]] as [number, number, number];
                arr[idx] = val;
                onChange({ ...params, [key]: arr });
              };
              return (
                <div className="flex flex-col gap-2">
                  <SliderRow
                    label="Cyan / Red"
                    val={params.cyanRed[idx]}
                    min={-100}
                    max={100}
                    bg="linear-gradient(90deg, #00ffff, #ff0000)"
                    onChange={(v) => updateTone('cyanRed', v)}
                  />
                  <SliderRow
                    label="Magenta / Green"
                    val={params.magentaGreen[idx]}
                    min={-100}
                    max={100}
                    bg="linear-gradient(90deg, #ff00ff, #00ff00)"
                    onChange={(v) => updateTone('magentaGreen', v)}
                  />
                  <SliderRow
                    label="Yellow / Blue"
                    val={params.yellowBlue[idx]}
                    min={-100}
                    max={100}
                    bg="linear-gradient(90deg, #ffff00, #0000ff)"
                    onChange={(v) => updateTone('yellowBlue', v)}
                  />
                  <label className="flex items-center justify-between text-xs font-medium text-white/80 pt-1 cursor-pointer">
                    <span>Preserve Luminosity</span>
                    <input
                      type="checkbox"
                      checked={params.preserveLuminosity}
                      onChange={(e) => onChange({ ...params, preserveLuminosity: e.target.checked })}
                      className="accent-[#2b7fff] w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              );
            })()}
          </div>
        )}

        {/* 3. Curves */}
        {name === 'Curves' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/20 rounded-xl">
              {(['composite', 'red', 'green', 'blue'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => {
                    setActiveChannel(ch);
                    onChange({ ...params, channel: ch });
                  }}
                  className={`py-1 text-xs font-semibold capitalize rounded-lg transition-all ${
                    activeChannel === ch ? 'bg-[#2b7fff] text-white shadow-sm' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  {ch === 'composite' ? 'Gamma' : ch}
                </button>
              ))}
            </div>

            {/* Interactive Curves Canvas */}
            <CurvesEditor
              channel={activeChannel}
              points={params.curves[activeChannel] || [{ x: 0, y: 0 }, { x: 1, y: 1 }]}
              onChange={(pts) => {
                onChange({
                  ...params,
                  curves: {
                    ...params.curves,
                    [activeChannel]: pts,
                  },
                });
              }}
            />
          </div>
        )}

        {/* 4. Gradient Map */}
        {name === 'Gradient Map' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/70">Presets</span>
            <div className="grid grid-cols-5 gap-1.5 max-h-24 overflow-y-auto no-scrollbar p-0.5">
              {GRADIENT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => onChange({ ...params, preset: p.name, stops: p.stops })}
                  className={`h-8 rounded-lg overflow-hidden border-2 transition-all p-0.5 relative group ${
                    params.preset === p.name ? 'border-[#2b7fff] scale-102 shadow-md' : 'border-white/20 hover:border-white/50'
                  }`}
                  title={p.name}
                >
                  <div
                    className="w-full h-full rounded"
                    style={{
                      background: `linear-gradient(90deg, ${p.stops.map((s) => `${s.color} ${s.pos * 100}%`).join(', ')})`,
                    }}
                  />
                  <span className="absolute inset-x-0 bottom-0 text-[9px] font-bold text-center text-white bg-black/60 truncate px-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Gradient Bar Preview */}
            <div className="mt-1">
              <span className="text-xs font-medium text-white/70 block mb-1">Current Gradient</span>
              <div
                className="w-full h-7 rounded-xl border border-white/20 shadow-inner"
                style={{
                  background: `linear-gradient(90deg, ${(params.stops || GRADIENT_PRESETS[0].stops)
                    .map((s: GradientStop) => `${s.color} ${s.pos * 100}%`)
                    .join(', ')})`,
                }}
              />
            </div>
          </div>
        )}

        {/* 5. Gaussian Blur */}
        {name === 'Gaussian Blur' && (
          <SliderRow
            label="Blur Radius"
            val={params.amount}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ ...params, amount: v })}
          />
        )}

        {/* 6. Motion Blur */}
        {name === 'Motion Blur' && (
          <div className="flex flex-col gap-2">
            <SliderRow
              label="Distance"
              val={params.amount}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, amount: v })}
            />
            <SliderRow
              label="Angle"
              val={params.angle ?? 0}
              min={0}
              max={360}
              unit="°"
              onChange={(v) => onChange({ ...params, angle: v })}
            />
          </div>
        )}

        {/* 7. Perspective Blur */}
        {name === 'Perspective Blur' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-black/20 rounded-xl">
              {(['directional', 'positional'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ ...params, mode: m })}
                  className={`py-1.5 text-xs font-semibold capitalize rounded-lg transition-all ${
                    (params.mode || 'directional') === m ? 'bg-[#2b7fff] text-white' : 'text-white/70'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <SliderRow
              label="Blur Amount"
              val={params.amount}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, amount: v })}
            />
          </div>
        )}

        {/* 8. Noise */}
        {name === 'Noise' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1 p-1 bg-black/20 rounded-xl">
              {(['clouds', 'billows', 'ridges'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...params, type: t })}
                  className={`py-1 text-xs font-semibold capitalize rounded-lg transition-all ${
                    (params.type || 'clouds') === t ? 'bg-[#2b7fff] text-white' : 'text-white/70'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <SliderRow
              label="Noise Amount"
              val={params.amount}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, amount: v })}
            />
            <SliderRow
              label="Scale"
              val={params.scale ?? 20}
              min={1}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, scale: v })}
            />
            <SliderRow
              label="Turbulence"
              val={params.turbulence ?? 40}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, turbulence: v })}
            />
          </div>
        )}

        {/* 9. Sharpen */}
        {name === 'Sharpen' && (
          <SliderRow
            label="Sharpness"
            val={params.amount}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ ...params, amount: v })}
          />
        )}

        {/* 10. Bloom */}
        {name === 'Bloom' && (
          <div className="flex flex-col gap-2">
            <SliderRow
              label="Transition"
              val={params.transition ?? 40}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, transition: v })}
            />
            <SliderRow
              label="Size"
              val={params.size ?? 30}
              min={1}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, size: v })}
            />
            <SliderRow
              label="Burn"
              val={params.burn ?? 20}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, burn: v })}
            />
          </div>
        )}

        {/* 11. Glitch */}
        {name === 'Glitch' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/20 rounded-xl">
              {(['artifact', 'wave', 'signal', 'diverge'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ ...params, mode: m })}
                  className={`py-1 text-[11px] font-semibold capitalize rounded-lg transition-all ${
                    (params.mode || 'artifact') === m ? 'bg-[#2b7fff] text-white' : 'text-white/70'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <SliderRow
              label="Amount"
              val={params.amount}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onChange({ ...params, amount: v })}
            />
            <SliderRow
              label="Block Size"
              val={params.blockSize ?? 25}
              min={5}
              max={100}
              unit="px"
              onChange={(v) => onChange({ ...params, blockSize: v })}
            />
          </div>
        )}

        {/* 12. Halftone */}
        {name === 'Halftone' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1 p-1 bg-black/20 rounded-xl">
              {(['full-color', 'screen-print', 'newspaper'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...params, style: s })}
                  className={`py-1 text-xs font-semibold capitalize rounded-lg transition-all ${
                    (params.style || 'full-color') === s ? 'bg-[#2b7fff] text-white' : 'text-white/70'
                  }`}
                >
                  {s.replace('-', ' ')}
                </button>
              ))}
            </div>
            <SliderRow
              label="Dot Size"
              val={params.dotSize ?? 12}
              min={2}
              max={64}
              unit="px"
              onChange={(v) => onChange({ ...params, dotSize: v })}
            />
            <SliderRow
              label="Screen Angle"
              val={params.angle ?? 45}
              min={0}
              max={90}
              unit="°"
              onChange={(v) => onChange({ ...params, angle: v })}
            />
          </div>
        )}

        {/* 13. Chromatic Aberration */}
        {name === 'Chromatic Aberration' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-black/20 rounded-xl">
              {(['perspective', 'displace'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ ...params, mode: m })}
                  className={`py-1.5 text-xs font-semibold capitalize rounded-lg transition-all ${
                    (params.mode || 'displace') === m ? 'bg-[#2b7fff] text-white' : 'text-white/70'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <SliderRow
              label="Shift Amount"
              val={params.amount}
              min={0}
              max={100}
              unit="px"
              onChange={(v) => onChange({ ...params, amount: v })}
            />
            <SliderRow
              label="Direction Angle"
              val={params.angle ?? 0}
              min={0}
              max={360}
              unit="°"
              onChange={(v) => onChange({ ...params, angle: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  val,
  min,
  max,
  unit = '',
  bg,
  onChange,
}: {
  label: string;
  val: number;
  min: number;
  max: number;
  unit?: string;
  bg?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs font-medium text-white/90">
        <span>{label}</span>
        <span className="font-mono text-[11px] font-bold text-white/70">
          {Math.round(val)}
          {unit}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        {bg && (
          <div
            className="absolute inset-x-0 h-1.5 rounded-full pointer-events-none opacity-80"
            style={{ background: bg }}
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          value={val}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#2b7fff] z-10"
        />
      </div>
    </div>
  );
}

/** Interactive Curves Graph Editor */
function CurvesEditor({
  channel,
  points,
  onChange,
}: {
  channel: 'composite' | 'red' | 'green' | 'blue';
  points: CurvePoint[];
  onChange: (pts: CurvePoint[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePoint = useRef<number | null>(null);

  const channelColor =
    channel === 'red' ? '#ff3b30' : channel === 'green' ? '#34c759' : channel === 'blue' ? '#007aff' : '#ffffff';

  const renderCurve = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const w = cvs.width;
    const h = cvs.height;

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(w * (i / 4), 0);
      ctx.lineTo(w * (i / 4), h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, h * (i / 4));
      ctx.lineTo(w, h * (i / 4));
      ctx.stroke();
    }

    // Diagonal base line
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();

    // Sorted points
    const sorted = [...points].sort((a, b) => a.x - b.x);

    // Draw spline curve
    ctx.strokeStyle = channelColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sorted[0].x * w, h - sorted[0].y * h);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const cx1 = (prev.x + (cur.x - prev.x) / 2) * w;
      const cy1 = h - prev.y * h;
      const cx2 = (prev.x + (cur.x - prev.x) / 2) * w;
      const cy2 = h - cur.y * h;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, cur.x * w, h - cur.y * h);
    }
    ctx.stroke();

    // Draw control nodes
    sorted.forEach((p, idx) => {
      const px = p.x * w;
      const py = h - p.y * h;
      ctx.fillStyle = channelColor;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  useEffect(() => {
    renderCurve();
  }, [points, channel]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    // Check if clicked near an existing node
    let closestIdx = -1;
    let minDist = 0.08;
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    });

    if (closestIdx >= 0) {
      activePoint.current = closestIdx;
    } else if (points.length < 6) {
      // Add a new point
      const next = [...points, { x, y }].sort((a, b) => a.x - b.x);
      activePoint.current = next.findIndex((p) => p.x === x && p.y === y);
      onChange(next);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePoint.current === null) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    const next = [...points];
    const idx = activePoint.current;
    if (idx === 0) {
      next[idx] = { x: 0, y };
    } else if (idx === points.length - 1 && next[idx].x === 1) {
      next[idx] = { x: 1, y };
    } else {
      next[idx] = { x, y };
    }
    onChange(next);
  };

  const handlePointerUp = () => {
    activePoint.current = null;
  };

  return (
    <div className="w-full h-36 bg-black/40 rounded-xl overflow-hidden border border-white/10 relative touch-none">
      <canvas
        ref={canvasRef}
        width={300}
        height={144}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full cursor-crosshair"
      />
      <span className="absolute bottom-1 right-2 text-[10px] text-white/50 pointer-events-none">
        Tap to add point, drag to adjust
      </span>
    </div>
  );
}
