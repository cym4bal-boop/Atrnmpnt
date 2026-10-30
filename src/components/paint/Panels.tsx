// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { Button } from '@/components/ui/button';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { CopyPlus, AudioWaveform, Share, ToggleRight, CircleHelp, ImagePlus, Upload, Sliders } from 'lucide-react';
import { brushCategories, brushLibrary, brushesInCategory, drawBrushPreview, getBrushDef, updateBrushDef, type BrushDef } from './brushes';
import { AdjustGlyph, BrushGlyph, EraserGlyph, SmudgeGlyph, DotsGlyph, PlusGlyph, WandGlyph } from './icons';
import { importBrushFile } from './brush-translator';



/* ---------------- Brush library ---------------- */


function BrushPreview({ brush, selected }: { brush: BrushDef; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const token = getComputedStyle(ref.current).getPropertyValue(selected ? '--pp-paper' : '--pp-ink').trim();
    drawBrushPreview(ref.current, brush, token);
  }, [brush, selected]);
  return <canvas ref={ref} width={300} height={70} className="pp-brush-preview" />;
}

export function BrushSheet({
  title,
  brushId,
  onPick,
  onClose,
  streamline,
  onStreamline,
  onOpenStudio,
  onImportBrushes,
}: {
  title: string;
  brushId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  streamline: number;
  onStreamline: (v: number) => void;
  onOpenStudio?: (brush: BrushDef) => void;
  onImportBrushes?: (brushes: BrushDef[]) => void;
}) {
  const [cat, setCat] = useState('Pens');
  const [settings, setSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const icons = [EraserGlyph, SmudgeGlyph, EraserGlyph, EraserGlyph, BrushGlyph, BrushGlyph, EraserGlyph];

  const currentBrush = brushesInCategory(cat).find((b) => b.id === brushId) ?? getBrushDef(brushId);

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allImported: BrushDef[] = [];
    for (const f of files) {
      try {
        const imported = await importBrushFile(f);
        allImported.push(...imported);
      } catch (err) {
        console.warn('Could not import brush file:', f.name, err);
      }
    }
    if (allImported.length && onImportBrushes) {
      onImportBrushes(allImported);
      setCat(allImported[0].category || 'Imported');
      onPick(allImported[0].id);
    }
    e.target.value = '';
  };

  return (
    <Sheet onClose={onClose} label="Brush library" className="pp-sheet-inset pp-brushes">
      <div className="pp-sheet-head">
        <h2>{title === 'Brushes' ? 'Aeternum Library' : `${title} Library`}</h2>
        <div className="pp-head-btns">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".apb,.myb,.kpp,.bundle,.json,.brush,.brushset,.zip"
            multiple
            onChange={handleImportFiles}
          />
          <Button
            variant="paint"
            size="paint"
            className="pp-circle-btn"
            aria-label="Import brushes"
            title="Import brushes from file (.apb, .myb, .kpp, .bundle, .json, .zip)"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} />
          </Button>
          <Button
            variant="paint"
            size="paint"
            className="pp-circle-btn"
            aria-label="Open Brush Studio"
            title="Open Procreate Pocket Brush Studio"
            onClick={() => {
              if (onOpenStudio && currentBrush) {
                onOpenStudio(currentBrush);
              } else {
                setSettings((v) => !v);
              }
            }}
          >
            <DotsGlyph />
          </Button>
          <Button
            variant="paint"
            size="paint"
            className="pp-circle-btn"
            aria-label="Duplicate brush"
            title="Duplicate brush and edit in Studio"
            onClick={() => {
              const source = currentBrush ?? brushesInCategory(cat)[0];
              if (!source) return;
              const copy: BrushDef = {
                ...source,
                id: `custom-${Date.now()}`,
                name: `${source.name} copy`,
                category: cat,
              };
              updateBrushDef(copy);
              onPick(copy.id);
              if (onOpenStudio) onOpenStudio(copy);
            }}
          >
            <PlusGlyph />
          </Button>
        </div>
      </div>
      <div className="pp-brush-columns">
        <div className="pp-brush-cats">
          {brushCategories.map((c, i) => {
            const Icon = icons[i] ?? BrushGlyph;
            return (
              <Button
                variant="paint"
                size="paint"
                key={c}
                className={c === cat ? 'on' : ''}
                aria-pressed={c === cat}
                onClick={() => setCat(c)}
              >
                <Icon size={22} />
                <span>{c}</span>
              </Button>
            );
          })}
        </div>
        <div className="pp-brush-list" key={cat}>
          {brushesInCategory(cat).map((b) => {
            const isSel = b.id === brushId;
            return (
              <Button
                variant="paint"
                size="paint"
                key={b.id}
                className={`pp-brush ${isSel ? 'on' : ''}`}
                aria-pressed={isSel}
                onClick={() => {
                  if (isSel && onOpenStudio) {
                    onOpenStudio(b);
                  } else {
                    onPick(b.id);
                  }
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span>{b.name}</span>
                  {isSel && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStudio?.(b);
                      }}
                      className="text-xs px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-white font-medium ml-2 cursor-pointer transition-colors"
                      title="Tap to edit in Brush Studio"
                    >
                      Studio
                    </span>
                  )}
                </div>
                <BrushPreview brush={b} selected={isSel} />
              </Button>
            );
          })}
        </div>
      </div>
      {settings && (
        <Sheet label="Brush settings" className="pp-nested-menu" onClose={() => setSettings(false)}>
          <div className="pp-sheet-head">
            <h2>Brush settings</h2>
          </div>
          <label className="pp-range-row">
            <span>StreamLine</span>
            <input
              type="range"
              min={0}
              max={100}
              value={streamline}
              onChange={(e) => onStreamline(Number(e.target.value))}
            />
            <b>{streamline}%</b>
          </label>
          {onOpenStudio && currentBrush && (
            <div className="p-3">
              <Button
                variant="paint"
                size="paint"
                className="w-full py-2 bg-[#2b7fff] text-white font-semibold rounded-xl"
                onClick={() => {
                  setSettings(false);
                  onOpenStudio(currentBrush);
                }}
              >
                Open in Brush Studio
              </Button>
            </div>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}

/* ---------------- Actions ---------------- */

export type ActionId =
  | 'insert-photo' | 'add-text' | 'cut' | 'copy' | 'paste' | 'flip-canvas-h' | 'flip-canvas-v' | 'rotate-canvas'
  | 'guide' | 'reference' | 'export-png' | 'export-jpg' | 'export-layers' | 'export-psd' | 'export-zip' | 'export-arnm' | 'clear-all' | 'rename' | 'info';

function Switch({ on }: { on: boolean }) {
  return <span className={`pp-ios-switch ${on ? 'on' : ''}`} aria-hidden="true"><span /></span>;
}

type Row = { id?: ActionId; label: string; toggle?: boolean; on?: boolean; onToggle?: () => void; dim?: boolean };

export function ActionsSheet({ onClose, onAction, guide, reference, tab, onTab, info, dark, onDark, frost, onFrost, prefsSlot }: {
  onClose: () => void; onAction: (a: ActionId) => void; guide: boolean; reference: boolean; tab: string; onTab: (t: string) => void;
  info: string[]; dark: boolean; onDark: (v: boolean) => void; frost?: boolean; onFrost?: (v: boolean) => void; prefsSlot?: React.ReactNode;
}) {
  const tabs = [['Add', CopyPlus], ['Canvas', AudioWaveform], ['Share', Share], ['Settings', ToggleRight], ['Help', CircleHelp]] as const;
  const current = tabs.some(([t]) => t === tab) ? tab : 'Add';
  const groups: Record<string, Row[][]> = {
    Add: [[{ id: 'insert-photo', label: 'Insert a photo' }, { id: 'add-text', label: 'Add text' }], [{ id: 'cut', label: 'Cut' }, { id: 'copy', label: 'Copy' }, { id: 'paste', label: 'Paste' }]],
    Canvas: [
      [{ id: 'guide', label: 'Drawing Guide', toggle: true, on: guide }],
      [{ id: 'reference', label: 'Reference', toggle: true, on: reference }],
      [{ id: 'flip-canvas-h', label: 'Flip horizontal' }, { id: 'flip-canvas-v', label: 'Flip vertical' }, { id: 'rotate-canvas', label: 'Rotate 90°' }],
      [{ id: 'clear-all', label: 'Clear all layers' }],
      [{ label: 'Canvas information', onToggle: () => onTab('Help') }],
    ],
    Share: [[{ id: 'export-arnm', label: 'Aeternum (.arnm)' }, { id: 'export-psd', label: 'PSD' }, { id: 'export-jpg', label: 'JPEG' }, { id: 'export-png', label: 'PNG' }], [{ id: 'export-zip', label: 'ZIP (layers & groups)' }, { id: 'export-layers', label: 'PNG Files' }]],
    Settings: [
      [
        { label: 'Dark interface', toggle: true, on: dark, onToggle: () => onDark(!dark) },
        { label: 'Frosted glass UI', toggle: true, on: !!frost, onToggle: () => onFrost?.(!frost) },
      ],
    ],
    Help: [[{ id: 'rename', label: 'Rename artwork' }]],
  };
  return (
    <Sheet onClose={onClose} label="Actions" className="pp-sheet-inset pp-actions">
      <div className="pp-sheet-head"><h2>Actions</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Insert a photo" onClick={() => onAction('insert-photo')}><ImagePlus size={22} /></Button>
      </div>
      <div className="pp-icon-tabs" role="tablist">
        {tabs.map(([t, Icon]) => (
          <Button variant="paint" size="paint" key={t} type="button" role="tab" aria-selected={t === current} className={t === current ? 'on' : ''} onClick={() => onTab(t)}>
            <Icon size={24} /><span>{t}</span>
          </Button>
        ))}
      </div>
      <div className="pp-sheet-scroll pp-action-list">
        {current === 'Share' && <span className="pp-set-label pp-share-label">Share Image</span>}
        {groups[current].map((g, gi) => (<Fragment key={gi}>
          {current === 'Share' && gi === 1 && <span className="pp-set-label pp-share-label">Share Layers</span>}
          <div key={gi} className="pp-cell-group">
            {g.map((r) => (
              <Button variant="paint" size="paint" key={r.label} type="button" className="pp-cell" role={r.toggle ? 'switch' : undefined} aria-checked={r.toggle ? !!r.on : undefined}
                onClick={() => (r.onToggle ? r.onToggle() : r.id && onAction(r.id))}>
                <span>{r.label}</span>{r.toggle && <Switch on={!!r.on} />}
              </Button>
            ))}
          </div>
        </Fragment>))}
        {current === 'Settings' && prefsSlot}
        {current === 'Help' && (
          <div className="pp-cell-group pp-info">
            {info.map((line) => <div key={line} className="pp-cell pp-cell-static">{line}</div>)}
          </div>
        )}
        {current === 'Help' && (
          <div className="pp-cell-group pp-info">
            {['Two-finger tap — Undo', 'Three-finger tap — Redo', 'Three-finger scrub — Clear layer', 'Three-finger swipe down — Copy & Paste menu', 'Four-finger tap — Hide interface', 'Pinch — Zoom & rotate', 'Touch and hold — Eyedropper', 'Draw and hold — QuickShape', 'Drag the color circle — ColorDrop', 'Swipe the layers bar sideways — Compact layers'].map((l) => <div key={l} className="pp-cell pp-cell-static">{l}</div>)}
          </div>
        )}
      </div>
    </Sheet>
  );
}


/* ---------------- Adjustments ---------------- */

export const adjustmentList = [
  'Hue, Saturation, Brightness', 'Color Balance', 'Curves', 'Gradient Map', 'Gaussian Blur', 'Motion Blur', 'Perspective Blur',
  'Noise', 'Sharpen', 'Bloom', 'Glitch', 'Halftone', 'Chromatic Aberration', 'Liquify',
];

export const adjustShort = (name: string) => adjustLabels[name] ?? name;
const adjustLabels: Record<string, string> = {
  'Hue, Saturation, Brightness': 'HSB',
  'Chromatic Aberration': 'Aberration',
  'Perspective Blur': 'Perspective',
  'Gaussian Blur': 'Gaussian',
};

/* Procreate-style icon grid: each adjustment is an icon cell with its label. */
export function AdjustmentsSheet({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Adjustments" className="pp-sheet-inset pp-adjust-menu">
      <div className="pp-sheet-head"><h2>Adjustments</h2></div>
      <div className="pp-sheet-scroll">
        <span className="pp-set-label">Adjust</span>
        <div className="pp-adjust-grid">
          {adjustmentList.map((a) => (
            <Button variant="paint" size="paint" key={a} type="button" className="pp-adjust-cell" onClick={() => onPick(a)}>
              {a === 'Liquify' ? <WandGlyph size={22} /> : <AdjustGlyph name={a === 'Hue, Saturation, Brightness' ? 'HSB' : a} size={22} />}
              <span>{adjustLabels[a] ?? a}</span>
            </Button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
