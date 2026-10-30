/* A color picker or palette floating over the canvas in a frosted-glass window.
 * Always maintains a 1:1 square aspect ratio.
 * Drags smoothly by its grip; slides to the bottom edge to remove; two-finger pinch resizes without jitter.
 * The window is always strictly clamped inside the screen boundaries. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FloatingPickerFace, type ColorTab, type Palette } from './ColorsSheet';
import type { HarmonyMode } from './color';
import { readSize, useSquarePinchResize } from './pinch';

export type Floater = { id: string; tab: ColorTab | 'Palette'; x: number; y: number; paletteId?: string };
const REMOVE_ZONE = 64;
const MARGIN = 8;
const DEFAULT_SIZE = 240;
const MIN_SIZE = 180;
const MAX_SIZE = 380;

type Props = {
  floater: Floater;
  grabbed?: boolean;
  color: string;
  previous: string;
  recent: string[];
  palettes: Palette[];
  harmony: HarmonyMode;
  paletteView: 'Compact' | 'Cards';
  onChange: (hex: string) => void;
  onCommit: () => void;
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
  onHarmony: (m: HarmonyMode) => void;
  onPalettes: (p: Palette[]) => void;
  onPaletteView: (v: 'Compact' | 'Cards') => void;
  onDragStart: (hex: string, e: { clientX: number; clientY: number }) => void;
};

/** Strictly keeps a centered (translate: -50% -50%) square element fully inside the viewport. */
const clampPos = (x: number, y: number, sz: number) => {
  const half = sz / 2;
  const minX = half + MARGIN;
  const maxX = Math.max(minX, window.innerWidth - half - MARGIN);
  const minY = half + MARGIN;
  const maxY = Math.max(minY, window.innerHeight - half - MARGIN);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
};

export function FloatingPicker(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const storageKey = `pp.floatSize.${p.floater.id}`;
  const [size, setSize] = useState(() => readSize(storageKey, DEFAULT_SIZE, MIN_SIZE, MAX_SIZE));
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const [pos, setPosState] = useState(() => clampPos(p.floater.x, p.floater.y, size));
  const posRef = useRef(pos);
  posRef.current = pos;

  const [dragging, setDragging] = useState(!!p.grabbed);
  const [doomed, setDoomed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const setPos = (v: { x: number; y: number }) => {
    posRef.current = v;
    setPosState(v);
  };

  const keepOnScreen = useCallback((currentSize?: number) => {
    const s = currentSize ?? sizeRef.current;
    const clamped = clampPos(posRef.current.x, posRef.current.y, s);
    if (Math.abs(clamped.x - posRef.current.x) > 0.5 || Math.abs(clamped.y - posRef.current.y) > 0.5) {
      setPos(clamped);
      p.onMove(clamped.x, clamped.y);
    }
  }, [p]);

  const handleResize = useCallback((newSize: number) => {
    setSize(newSize);
    sizeRef.current = newSize;
    keepOnScreen(newSize);
  }, [keepOnScreen]);

  useSquarePinchResize({
    ref,
    size,
    onResize: handleResize,
    minSize: MIN_SIZE,
    maxSize: MAX_SIZE,
    storageKey,
  });

  useEffect(() => {
    keepOnScreen();
    window.addEventListener('resize', () => keepOnScreen());
    return () => window.removeEventListener('resize', () => keepOnScreen());
  }, [keepOnScreen]);

  const startDrag = (sx: number, sy: number, ox: number, oy: number, initialPointerId?: number) => {
    setDragging(true);
    let last = { x: ox, y: oy };
    const dragPointerId = initialPointerId;

    const move = (e: PointerEvent) => {
      // Ignore pointer events from other fingers during multi-touch/pinch to prevent jitter
      if (dragPointerId !== undefined && e.pointerId !== dragPointerId) return;
      last = { x: ox + e.clientX - sx, y: oy + e.clientY - sy };
      setPos(last);
      const isNearBottom = e.clientY > window.innerHeight - REMOVE_ZONE || last.y + sizeRef.current / 2 > window.innerHeight - 20;
      setDoomed(isNearBottom);
    };

    const up = (e: PointerEvent) => {
      if (dragPointerId !== undefined && e.pointerId !== dragPointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(false);

      const isNearBottom = e.clientY > window.innerHeight - REMOVE_ZONE || last.y + sizeRef.current / 2 > window.innerHeight - 20;
      if (isNearBottom) {
        setLeaving(true);
        window.setTimeout(p.onRemove, 250);
        return;
      }

      setDoomed(false);
      const clamped = clampPos(last.x, last.y, sizeRef.current);
      setPos(clamped);
      p.onMove(clamped.x, clamped.y);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  useEffect(() => {
    if (p.grabbed) {
      startDrag(p.floater.x, p.floater.y, p.floater.x, p.floater.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const innerSize = Math.max(140, size - 26);

  return (
    <div
      ref={ref}
      className={`pp-floater pp-floater-square ${dragging ? 'dragging' : ''} ${doomed ? 'doomed' : ''} ${leaving ? 'leaving' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: `${size}px`,
        height: `${size}px`,
      }}
      role="dialog"
      aria-label={`Floating ${p.floater.tab} picker`}
    >
      <div
        className="pp-floater-grip"
        aria-label="Drag picker (slide to bottom to remove)"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startDrag(e.clientX, e.clientY, pos.x, pos.y, e.pointerId);
        }}
      >
        <span />
      </div>

      <div
        className="pp-floater-body"
        style={{ width: `${innerSize}px`, height: `${innerSize}px` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {p.floater.tab === 'Palette' ? (
          <PaletteFloat p={p} size={innerSize} />
        ) : (
          <FloatingPickerFace
            tab={p.floater.tab}
            color={p.color}
            previous={p.previous}
            recent={p.recent}
            palettes={p.palettes}
            harmony={p.harmony}
            paletteView={p.paletteView}
            size={innerSize}
            onTab={() => {}}
            onHarmony={p.onHarmony}
            onPaletteView={p.onPaletteView}
            onClearHistory={() => {}}
            onChange={p.onChange}
            onCommit={p.onCommit}
            onSwap={() => {}}
            onPalettes={p.onPalettes}
            onDragStart={(hex, e) => p.onDragStart(hex, e)}
            onClose={() => {}}
          />
        )}
      </div>

      {doomed && <div className="pp-floater-bin">Release to remove</div>}
    </div>
  );
}

/** Picture-in-picture for a single palette: swatches grid only, no drag-drop to palette. */
function PaletteFloat({ p, size }: { p: Props; size: number }) {
  const pal = p.palettes.find((x) => x.id === p.floater.paletteId) ?? p.palettes[0];
  if (!pal) return <div className="pp-pal-float-empty">No palette</div>;

  return (
    <div className="pp-pal-float" style={{ width: `${size}px`, height: `${size}px` }}>
      <div className="pp-pal-float-header">
        <span className="pp-pal-float-name">{pal.name}</span>
        <span className="pp-pal-float-count">{pal.colors.length} swatches</span>
      </div>
      <div className="pp-palette-grid pp-pal-float-grid" style={{ maxHeight: `${size - 38}px` }}>
        {pal.colors.length === 0 && <span className="pp-pal-float-empty">Empty palette</span>}
        {pal.colors.map((c, i) => (
          <Button
            key={i}
            variant="paint"
            size="paint"
            type="button"
            aria-label={`Swatch ${c}`}
            style={{ background: c }}
            onClick={() => {
              p.onChange(c);
              p.onCommit();
            }}
          />
        ))}
      </div>
    </div>
  );
}

