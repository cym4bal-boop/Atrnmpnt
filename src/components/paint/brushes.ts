// Dab-based brush engine: brush definitions, tinted tip cache and stamping.
export type BrushDef = {
  id: string;
  name: string;
  category: string;
  author?: string;
  dateCreated?: string;
  signName?: string;

  // 1. Stroke path
  spacing: number; // fraction of size between dabs (0.01 – 1.2)
  spacingJitter?: number; // 0 – 1
  jitterLateral?: number; // 0 – 1
  jitterLinear?: number; // 0 – 1
  falloff?: number; // 0 – 1 (0 = infinite)
  streamline?: number; // 0 – 100

  // 2. Stabilization
  stabilization?: number; // 0 – 100
  motionFiltering?: number; // 0 – 100

  // 3. Taper
  taper: number; // start taper 0 – 1
  pressureTaper?: number; // 0 – 1
  touchTaper?: number; // 0 – 1
  taperSize?: number; // 0 – 1
  taperOpacity?: number; // 0 – 1
  taperTip?: 'sharp' | 'round';

  // 4. Shape
  hardness: number; // 0 soft – 1 hard
  roundness: number; // 1 round, <1 flattened
  angle: number; // tip angle in degrees
  rotateRandom: boolean;
  scatter: number; // position scatter fraction
  shapeScatter?: number; // 0 – 1
  shapeRotation?: number; // -180 – 180
  shapeFollowStroke?: boolean;
  shapeCount?: number; // 1 – 16 dabs
  shapeCountJitter?: number; // 0 – 1
  shapeRandomized?: boolean;

  // 5. Grain
  grain: number; // 0 – 1 noisy texture amount
  grainScale?: number; // 0.1 – 3.0
  grainZoom?: number; // 0 – 1
  grainDepth?: number; // 0 – 1
  grainBlend?: 'multiply' | 'overlay' | 'normal';

  // 6. Rendering
  renderMode?: 'light-glaze' | 'glaze' | 'blending' | 'intense-blending';
  flow: number; // per-dab alpha 0 – 1
  wetEdges?: number; // 0 – 1
  burntEdges?: number; // 0 – 1

  // 7. Wet Mix
  dilution?: number; // 0 – 1
  charge?: number; // 0 – 1
  attack?: number; // 0 – 1
  pull?: number; // 0 – 1
  grade?: number; // 0 – 1
  wetJitter?: number; // 0 – 1

  // 8. Color dynamics
  stampColorJitter?: number; // 0 – 1
  strokeColorJitter?: number; // 0 – 1
  colorPressure?: number; // 0 – 1

  // 9. Dynamics
  speedSize?: number; // -1 – 1
  speedOpacity?: number; // -1 – 1
  jitter: number; // size jitter 0 – 1
  jitterOpacity?: number; // 0 – 1

  // 10. Apple Pencil / Stylus
  sizePressure: number; // 0 – 1 how much pressure shrinks size
  opacityPressure: number; // 0 – 1 how much pressure reduces flow
  pressureFlow?: number; // 0 – 1
  pressureBleed?: number; // 0 – 1
  tiltAngle?: number; // 0 – 90
  tiltOpacity?: number; // 0 – 1
  tiltSize?: number; // 0 – 2

  // 11. Properties
  useStampPreview?: boolean;
  orientToScreen?: boolean;
  previewSize?: number; // 0.1 – 1
  smudge?: number; // 0 – 1
  minSize?: number; // px
  maxSize: number; // px at 100% size slider
  minOpacity?: number; // 0 – 1
  maxOpacity?: number; // 0 – 1

  // 12. Materials
  metallic?: number; // 0 – 1
  roughness?: number; // 0 – 1
};

const base: Omit<BrushDef, 'id' | 'name' | 'category'> = {
  spacing: 0.08, hardness: 0.85, flow: 1, sizePressure: 0.6, opacityPressure: 0, jitter: 0,
  scatter: 0, grain: 0, roundness: 1, angle: 0, rotateRandom: false, taper: 0.4, maxSize: 80,
  streamline: 30, renderMode: 'glaze', shapeCount: 1, minSize: 2, minOpacity: 0, maxOpacity: 1,
};

const defaultLibrary: BrushDef[] = [
  // Pens
  { ...base, id: 'studio-pen', name: 'Studio Pen', category: 'Pens', spacing: 0.04, hardness: 0.98, flow: 1, sizePressure: 0.85, taper: 0.7, maxSize: 60, streamline: 50 },
  { ...base, id: 'technical-pen', name: 'Technical Pen', category: 'Pens', spacing: 0.04, hardness: 1, flow: 1, sizePressure: 0, taper: 0, maxSize: 40 },
  { ...base, id: 'gel-pen', name: 'Gel Pen', category: 'Pens', spacing: 0.03, hardness: 0.95, flow: 0.98, sizePressure: 0.45, taper: 0.3, maxSize: 48 },
  { ...base, id: 'fine-tip', name: 'Fine Tip Pen', category: 'Pens', spacing: 0.04, hardness: 0.92, flow: 0.95, sizePressure: 0.6, taper: 0.5, maxSize: 35 },
  { ...base, id: 'fountain-pen', name: 'Fountain Pen', category: 'Pens', spacing: 0.03, hardness: 0.96, flow: 0.9, sizePressure: 0.8, roundness: 0.4, angle: -30, taper: 0.6, maxSize: 55 },

  // Inks
  { ...base, id: 'dry-ink', name: 'Dry Ink', category: 'Inks', spacing: 0.06, hardness: 0.92, flow: 0.9, sizePressure: 0.5, grain: 0.4, rotateRandom: true, maxSize: 50 },
  { ...base, id: 'gesinski-ink', name: 'Gesinski Ink', category: 'Inks', spacing: 0.05, hardness: 0.88, flow: 0.95, sizePressure: 0.75, grain: 0.25, taper: 0.45, maxSize: 65 },
  { ...base, id: 'pandani-ink', name: 'Pandani Ink', category: 'Inks', spacing: 0.04, hardness: 0.94, flow: 0.85, sizePressure: 0.6, roundness: 0.6, angle: 15, grain: 0.3, maxSize: 70 },
  { ...base, id: 'thistle-ink', name: 'Thistle Ink', category: 'Inks', spacing: 0.05, hardness: 0.85, flow: 0.9, sizePressure: 0.7, grain: 0.5, jitter: 0.1, rotateRandom: true, maxSize: 55 },
  { ...base, id: 'bleed-ink', name: 'Bleed Ink', category: 'Inks', spacing: 0.06, hardness: 0.75, flow: 0.82, sizePressure: 0.65, grain: 0.45, maxSize: 80, wetEdges: 0.3 },

  // Markers
  { ...base, id: 'sleepyhead', name: 'Sleepyhead', category: 'Markers', roundness: 0.5, grain: 0.82, opacityPressure: 0.4, hardness: 0.65, maxSize: 130 },
  { ...base, id: 'magpie', name: 'Magpie', category: 'Markers', roundness: 0.35, angle: -12, grain: 0.3, flow: 0.75, maxSize: 110 },
  { ...base, id: 'apsley', name: 'Apsley', category: 'Markers', roundness: 0.3, angle: 12, grain: 0.25, flow: 0.9, maxSize: 120 },
  { ...base, id: 'flynn', name: 'Flynn', category: 'Markers', roundness: 0.25, angle: -15, hardness: 0.95, flow: 0.95, maxSize: 150 },
  { ...base, id: 'centurion', name: 'Centurion', category: 'Markers', roundness: 0.35, grain: 0.6, flow: 0.65, maxSize: 135 },
  { ...base, id: 'chisel-marker', name: 'Chisel Marker', category: 'Markers', roundness: 0.2, angle: 45, hardness: 0.9, flow: 0.85, maxSize: 160 },

  // Pastels
  { ...base, id: 'pastel', name: 'Soft Pastel', category: 'Pastels', grain: 0.9, flow: 0.45, hardness: 0.6, rotateRandom: true, maxSize: 100 },
  { ...base, id: 'oil-pastel', name: 'Oil Pastel', category: 'Pastels', grain: 0.7, flow: 0.8, hardness: 0.75, roundness: 0.8, rotateRandom: true, maxSize: 110 },
  { ...base, id: 'pan-pastel', name: 'Pan Pastel', category: 'Pastels', grain: 0.85, flow: 0.35, hardness: 0.4, maxSize: 140 },
  { ...base, id: 'chalk-pastel', name: 'Chalk Pastel', category: 'Pastels', grain: 0.95, flow: 0.5, hardness: 0.65, jitter: 0.15, rotateRandom: true, maxSize: 90 },
  { ...base, id: 'conte-crayon', name: 'Conté Crayon', category: 'Pastels', grain: 0.8, flow: 0.7, hardness: 0.8, roundness: 0.4, angle: 30, maxSize: 80 },

  // Oils
  { ...base, id: 'oil', name: 'Oil Paint', category: 'Oils', roundness: 0.4, grain: 0.4, flow: 0.85, maxSize: 140, pull: 0.6 },
  { ...base, id: 'wet-acrylic', name: 'Wet Acrylic', category: 'Oils', roundness: 0.6, grain: 0.2, flow: 0.9, hardness: 0.85, maxSize: 130, pull: 0.5 },
  { ...base, id: 'turpentine-glaze', name: 'Turpentine Glaze', category: 'Oils', roundness: 0.7, grain: 0.3, flow: 0.4, opacityPressure: 0.6, maxSize: 160 },
  { ...base, id: 'filbert-bristle', name: 'Filbert Bristle', category: 'Oils', roundness: 0.5, grain: 0.5, flow: 0.8, hardness: 0.78, angle: -15, maxSize: 135 },
  { ...base, id: 'impasto-oil', name: 'Impasto Oil', category: 'Oils', roundness: 0.35, grain: 0.6, flow: 0.95, hardness: 0.9, angle: 25, maxSize: 150 },

  // Paints
  { ...base, id: 'round-brush', name: 'Round Brush', category: 'Paints', spacing: 0.04, hardness: 0.9, flow: 0.9, sizePressure: 0.7, taper: 0.5, maxSize: 120 },
  { ...base, id: 'flat-brush', name: 'Flat Brush', category: 'Paints', spacing: 0.03, hardness: 0.8, flow: 0.7, sizePressure: 0.2, roundness: 0.25, angle: 45, taper: 0.2, maxSize: 140 },
  { ...base, id: 'wet-wash', name: 'Wet Wash', category: 'Paints', spacing: 0.05, hardness: 0.3, flow: 0.35, sizePressure: 0.5, opacityPressure: 0.7, grain: 0.2, maxSize: 220, wetEdges: 0.4 },
  { ...base, id: 'fan-brush', name: 'Fan Brush', category: 'Paints', spacing: 0.05, hardness: 0.7, flow: 0.65, roundness: 0.15, angle: 0, grain: 0.6, maxSize: 150 },
  { ...base, id: 'stucco-acrylic', name: 'Stucco Acrylic', category: 'Paints', spacing: 0.03, hardness: 0.85, flow: 0.88, grain: 0.55, rotateRandom: true, maxSize: 130 },

  // Gouache
  { ...base, id: 'gouache', name: 'Gouache', category: 'Gouache', spacing: 0.05, hardness: 0.7, flow: 0.55, sizePressure: 0.4, opacityPressure: 0.4, grain: 0.45, roundness: 0.75, angle: 30, maxSize: 140 },
  { ...base, id: 'wet-gouache', name: 'Wet Gouache', category: 'Gouache', spacing: 0.04, hardness: 0.55, flow: 0.65, sizePressure: 0.5, grain: 0.3, roundness: 0.85, maxSize: 150 },
  { ...base, id: 'dry-gouache', name: 'Dry Gouache', category: 'Gouache', spacing: 0.06, hardness: 0.82, flow: 0.75, grain: 0.7, rotateRandom: true, maxSize: 120 },
  { ...base, id: 'thick-gouache', name: 'Thick Gouache', category: 'Gouache', spacing: 0.03, hardness: 0.9, flow: 0.9, roundness: 0.4, angle: 40, maxSize: 135 },
  { ...base, id: 'opaque-gouache', name: 'Opaque Gouache', category: 'Gouache', spacing: 0.03, hardness: 0.95, flow: 1, sizePressure: 0.3, maxSize: 125 },

  // Sketching
  { ...base, id: 'hb-pencil', name: '6B Pencil', category: 'Sketching', spacing: 0.1, hardness: 0.6, flow: 0.55, sizePressure: 0.3, opacityPressure: 0.7, grain: 0.75, rotateRandom: true, maxSize: 30 },
  { ...base, id: 'narinder', name: 'Narinder Pencil', category: 'Sketching', spacing: 0.12, hardness: 0.7, flow: 0.4, sizePressure: 0.2, opacityPressure: 0.8, grain: 0.85, rotateRandom: true, maxSize: 20 },
  { ...base, id: 'technical-pencil', name: 'HB Pencil', category: 'Sketching', spacing: 0.08, hardness: 0.8, flow: 0.6, sizePressure: 0.25, grain: 0.5, maxSize: 18 },
  { ...base, id: 'peppermint', name: 'Peppermint', category: 'Sketching', spacing: 0.09, hardness: 0.65, flow: 0.5, sizePressure: 0.35, grain: 0.65, rotateRandom: true, maxSize: 28 },
  { ...base, id: 'derwent', name: 'Derwent Sketch', category: 'Sketching', spacing: 0.11, hardness: 0.5, flow: 0.5, sizePressure: 0.4, grain: 0.8, rotateRandom: true, maxSize: 36 },

  // Airbrushing
  { ...base, id: 'soft-brush', name: 'Soft Brush', category: 'Airbrushing', spacing: 0.06, hardness: 0, flow: 0.12, sizePressure: 0.1, opacityPressure: 0.6, taper: 0, maxSize: 260 },
  { ...base, id: 'hard-airbrush', name: 'Hard Airbrush', category: 'Airbrushing', spacing: 0.06, hardness: 0.55, flow: 0.25, sizePressure: 0.1, opacityPressure: 0.5, taper: 0, maxSize: 200 },
  { ...base, id: 'medium-airbrush', name: 'Medium Airbrush', category: 'Airbrushing', spacing: 0.05, hardness: 0.25, flow: 0.18, sizePressure: 0.1, opacityPressure: 0.55, maxSize: 230 },
  { ...base, id: 'flow-airbrush', name: 'Flow Airbrush', category: 'Airbrushing', spacing: 0.04, hardness: 0.15, flow: 0.08, sizePressure: 0.15, opacityPressure: 0.7, maxSize: 280 },
  { ...base, id: 'soft-blend', name: 'Soft Blend', category: 'Airbrushing', spacing: 0.05, hardness: 0.05, flow: 0.15, sizePressure: 0.2, maxSize: 250 },

  // Charcoals
  { ...base, id: 'charcoal', name: 'Vine Charcoal', category: 'Charcoals', spacing: 0.12, hardness: 0.4, flow: 0.45, sizePressure: 0.3, opacityPressure: 0.6, grain: 0.95, jitter: 0.25, scatter: 0.06, rotateRandom: true, maxSize: 90 },
  { ...base, id: 'willow-charcoal', name: 'Willow Charcoal', category: 'Charcoals', spacing: 0.1, hardness: 0.35, flow: 0.5, sizePressure: 0.35, grain: 0.9, jitter: 0.2, rotateRandom: true, maxSize: 95 },
  { ...base, id: 'compressed-charcoal', name: 'Compressed Charcoal', category: 'Charcoals', spacing: 0.08, hardness: 0.75, flow: 0.7, sizePressure: 0.4, grain: 0.8, rotateRandom: true, maxSize: 75 },
  { ...base, id: 'charcoal-block', name: 'Charcoal Block', category: 'Charcoals', spacing: 0.07, hardness: 0.6, flow: 0.6, roundness: 0.4, angle: 45, grain: 0.85, maxSize: 110 },
  { ...base, id: 'burnt-stick', name: 'Burnt Stick', category: 'Charcoals', spacing: 0.14, hardness: 0.5, flow: 0.4, grain: 1, jitter: 0.3, scatter: 0.1, rotateRandom: true, maxSize: 85 },

  // Spraypaints
  { ...base, id: 'spray', name: 'Medium Nozzle', category: 'Spraypaints', spacing: 0.2, hardness: 0.3, flow: 0.18, sizePressure: 0.2, grain: 1, jitter: 0.5, scatter: 0.4, rotateRandom: true, taper: 0, maxSize: 200 },
  { ...base, id: 'fine-spray', name: 'Fine Spray', category: 'Spraypaints', spacing: 0.15, hardness: 0.4, flow: 0.12, sizePressure: 0.15, grain: 1, jitter: 0.4, scatter: 0.25, rotateRandom: true, taper: 0, maxSize: 160 },
  { ...base, id: 'fat-cap', name: 'Fat Cap', category: 'Spraypaints', spacing: 0.18, hardness: 0.2, flow: 0.25, sizePressure: 0.3, grain: 1, jitter: 0.6, scatter: 0.5, rotateRandom: true, taper: 0, maxSize: 260 },
  { ...base, id: 'flicks', name: 'Flicks', category: 'Spraypaints', spacing: 0.35, hardness: 0.8, flow: 0.7, jitter: 0.9, scatter: 0.8, rotateRandom: true, maxSize: 180 },
  { ...base, id: 'splatter', name: 'Splatter', category: 'Spraypaints', spacing: 0.28, hardness: 0.6, flow: 0.5, jitter: 0.8, scatter: 0.7, grain: 0.8, rotateRandom: true, maxSize: 220 },

  // Calligraphy
  { ...base, id: 'calligraphy', name: 'Script', category: 'Calligraphy', spacing: 0.03, hardness: 1, flow: 1, sizePressure: 0.75, roundness: 0.3, angle: 45, taper: 0.6, maxSize: 60 },
  { ...base, id: 'monoline', name: 'Monoline', category: 'Calligraphy', spacing: 0.04, hardness: 1, flow: 1, sizePressure: 0, taper: 0, maxSize: 50 },
  { ...base, id: 'water-pen', name: 'Water Pen', category: 'Calligraphy', spacing: 0.04, hardness: 0.85, flow: 0.75, sizePressure: 0.7, roundness: 0.5, angle: -35, taper: 0.5, maxSize: 65 },
  { ...base, id: 'brush-pen', name: 'Brush Pen', category: 'Calligraphy', spacing: 0.03, hardness: 0.92, flow: 0.95, sizePressure: 0.85, taper: 0.8, maxSize: 70 },
  { ...base, id: 'chisel-nib', name: 'Chisel Nib', category: 'Calligraphy', spacing: 0.02, hardness: 1, flow: 1, sizePressure: 0.2, roundness: 0.15, angle: 45, maxSize: 75 },

  // Deevad Digital (Translated & Calibrated from Deevad bundle)
  { ...base, id: 'deevad-brush-pointy', name: 'Deevad Thin Pointy', category: 'Deevad', spacing: 0.04, hardness: 0.9, flow: 0.95, sizePressure: 0.85, grain: 0.15, taper: 0.6, maxSize: 65, author: 'David Revoy' },
  { ...base, id: 'deevad-pencil-2b', name: 'Deevad Pencil 2B', category: 'Deevad', spacing: 0.08, hardness: 0.72, flow: 0.65, sizePressure: 0.5, grain: 0.7, taper: 0.4, maxSize: 32, author: 'David Revoy' },
  { ...base, id: 'deevad-bristles-lineart', name: 'Deevad Bristles Lineart', category: 'Deevad', spacing: 0.04, hardness: 0.88, flow: 0.9, sizePressure: 0.7, roundness: 0.6, angle: 25, grain: 0.35, maxSize: 75, author: 'David Revoy' },
  { ...base, id: 'deevad-painterly', name: 'Deevad Painterly Brush', category: 'Deevad', spacing: 0.035, hardness: 0.82, flow: 0.8, sizePressure: 0.6, grain: 0.4, roundness: 0.5, angle: -20, maxSize: 130, pull: 0.5, author: 'David Revoy' },
  { ...base, id: 'deevad-airbrush', name: 'Deevad Smooth Airbrush', category: 'Deevad', spacing: 0.05, hardness: 0.1, flow: 0.16, sizePressure: 0.1, opacityPressure: 0.65, maxSize: 240, author: 'David Revoy' },

  // MyPaint Classic (Translated from MyPaint pack)
  { ...base, id: 'mypaint-calligraphy', name: 'MyPaint Calligraphy', category: 'MyPaint', spacing: 0.03, hardness: 0.92, flow: 0.95, sizePressure: 0.7, roundness: 0.25, angle: 45, maxSize: 70 },
  { ...base, id: 'mypaint-dry-brush', name: 'MyPaint Dry Brush', category: 'MyPaint', spacing: 0.06, hardness: 0.75, flow: 0.7, sizePressure: 0.5, grain: 0.6, rotateRandom: true, maxSize: 90 },
  { ...base, id: 'mypaint-coarse-bulk', name: 'MyPaint Coarse Bulk', category: 'MyPaint', spacing: 0.05, hardness: 0.7, flow: 0.8, roundness: 0.6, angle: 30, grain: 0.5, maxSize: 140 },
  { ...base, id: 'mypaint-blending-knife', name: 'MyPaint Blending Knife', category: 'MyPaint', spacing: 0.04, hardness: 0.85, flow: 0.6, roundness: 0.3, angle: -45, pull: 0.7, smudge: 0.8, maxSize: 120 },
];

function loadSavedCustomBrushes(): BrushDef[] {
  try {
    const raw = localStorage.getItem('pp.customBrushes');
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export const brushLibrary: BrushDef[] = [...defaultLibrary, ...loadSavedCustomBrushes()];

export function saveCustomBrushes() {
  try {
    const custom = brushLibrary.filter((b) => !defaultLibrary.some((d) => d.id === b.id) || b.id.startsWith('custom-'));
    localStorage.setItem('pp.customBrushes', JSON.stringify(custom));
  } catch {
    // Ignore storage quota
  }
}

export function registerBrushes(brushes: BrushDef[]) {
  for (const b of brushes) {
    const idx = brushLibrary.findIndex((item) => item.id === b.id);
    if (idx >= 0) {
      brushLibrary[idx] = b;
    } else {
      brushLibrary.push(b);
    }
  }
  saveCustomBrushes();
}

export function getBrushDef(id: string): BrushDef {
  return brushLibrary.find((b) => b.id === id) ?? brushLibrary[0] ?? defaultLibrary[0];
}

export function updateBrushDef(brush: BrushDef) {
  const idx = brushLibrary.findIndex((b) => b.id === brush.id);
  if (idx >= 0) {
    brushLibrary[idx] = { ...brush };
  } else {
    brushLibrary.push({ ...brush });
  }
  shapeCache.delete(`${brush.id}@${TIP}`);
  // Clear any cached tints for this brush
  for (const k of tintCache.keys()) {
    if (k.startsWith(`${brush.id}|`)) tintCache.delete(k);
  }
  saveCustomBrushes();
}

export function resetBrushDef(id: string): BrushDef | null {
  const original = defaultLibrary.find((b) => b.id === id);
  if (original) {
    updateBrushDef({ ...original });
    return { ...original };
  }
  return null;
}

export const brushCategories = [
  'Pens', 'Inks', 'Markers', 'Pastels', 'Oils', 'Paints', 'Gouache', 'Sketching',
  'Airbrushing', 'Charcoals', 'Spraypaints', 'Calligraphy', 'Deevad', 'MyPaint', 'Imported'
];

export function brushesInCategory(category: string) {
  return brushLibrary.filter((b) => b.category === category);
}

const TIP = 128;
const shapeCache = new Map<string, HTMLCanvasElement>();
const tintCache = new Map<string, HTMLCanvasElement>();

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function tipShape(brush: BrushDef, px = TIP) {
  const key = `${brush.id}@${px}`;
  const cached = shapeCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  const r = px / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const solid = Math.max(0, Math.min(0.98, brush.hardness));
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(solid, 'rgba(255,255,255,1)');
  g.addColorStop(Math.min(1, solid + 0.02), solid > 0.95 ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate((brush.angle * Math.PI) / 180);
  ctx.scale(1, brush.roundness);
  ctx.translate(-r, -r);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (brush.grain > 0) {
    const img = ctx.getImageData(0, 0, px, px);
    const rand = seeded(brush.id.length * 7919 + 13);
    for (let i = 3; i < img.data.length; i += 4) {
      const n = rand();
      img.data[i] = img.data[i] * (n < brush.grain * 0.7 ? n * 0.6 : 1);
    }
    ctx.putImageData(img, 0, 0);
  }
  if (shapeCache.size > 32) shapeCache.clear();
  shapeCache.set(key, c);
  return c;
}

/** Tinted brush tip. `px` renders the tip natively at that diameter (0 = default 128). */
export function brushTip(brush: BrushDef, color: string, px = TIP) {
  const key = `${brush.id}|${color}|${px}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(tipShape(brush, px), 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, px, px);
  if (tintCache.size > 50) tintCache.clear();
  tintCache.set(key, c);
  return c;
}

export function eraserTip(brush: BrushDef, px = TIP) {
  return brushTip(brush, '#000000', px);
}

export type DabInput = {
  x: number;
  y: number;
  pressure: number;
  travelled: number;
  dx?: number;
  dy?: number;
};

/** Stamps one dab of the brush. size = diameter in canvas px at full pressure. */
export function stampDab(
  ctx: CanvasRenderingContext2D,
  tip: HTMLCanvasElement,
  brush: BrushDef,
  d: DabInput,
  size: number,
  flowScale = 1
) {
  const taperLen = size * 6 * (brush.taper || 0.3);
  const taper = taperLen > 0 ? Math.min(1, 0.15 + d.travelled / taperLen) : 1;
  const p = Math.max(0.05, Math.min(1, d.pressure));

  // Pressure curves
  let s = size * (1 - brush.sizePressure + brush.sizePressure * p) * taper;
  if (brush.jitter) s *= 1 - Math.random() * brush.jitter;
  if (brush.speedSize) s *= Math.max(0.5, 1 + brush.speedSize * 0.3);
  s = Math.max(brush.minSize ?? 1.5, Math.min(brush.maxSize * 1.5, s));

  let alpha = brush.flow * (1 - brush.opacityPressure + brush.opacityPressure * p) * flowScale;
  if (brush.jitterOpacity) alpha *= 1 - Math.random() * brush.jitterOpacity;
  if (brush.falloff && d.travelled > 0) {
    const maxDist = size * 50 * (1.1 - brush.falloff);
    alpha *= Math.max(0, 1 - d.travelled / maxDist);
  }

  // Position offsets: scatter, jitter lateral, jitter linear
  let x = d.x, y = d.y;
  const scat = (brush.shapeScatter ?? brush.scatter ?? 0);
  if (scat > 0) {
    x += (Math.random() - 0.5) * size * scat * 2;
    y += (Math.random() - 0.5) * size * scat * 2;
  }

  if ((brush.jitterLateral || brush.jitterLinear) && (d.dx != null && d.dy != null)) {
    const dist = Math.hypot(d.dx, d.dy) || 1;
    const nx = -d.dy / dist, ny = d.dx / dist; // normal
    const tx = d.dx / dist, ty = d.dy / dist; // tangent
    if (brush.jitterLateral) {
      const lat = (Math.random() - 0.5) * size * brush.jitterLateral * 1.5;
      x += nx * lat;
      y += ny * lat;
    }
    if (brush.jitterLinear) {
      const lin = (Math.random() - 0.5) * size * brush.jitterLinear * 1.5;
      x += tx * lin;
      y += ty * lin;
    }
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  const count = brush.shapeCount && brush.shapeCount > 1 ? brush.shapeCount : 1;
  for (let c = 0; c < count; c++) {
    const cx = count > 1 ? x + (Math.random() - 0.5) * s * 0.5 : x;
    const cy = count > 1 ? y + (Math.random() - 0.5) * s * 0.5 : y;

    if (brush.rotateRandom || brush.shapeRandomized) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.random() * Math.PI * 2);
      ctx.drawImage(tip, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else if (brush.shapeFollowStroke && d.dx != null && d.dy != null) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(d.dy, d.dx));
      ctx.drawImage(tip, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else {
      ctx.drawImage(tip, cx - s / 2, cy - s / 2, s, s);
    }
  }

  return s;
}

/** Small preview stroke for the brush library list. */
export function drawBrushPreview(canvas: HTMLCanvasElement, brush: BrushDef, color = '#1c1c1e') {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tip = brushTip(brush, color);
  const w = canvas.width, h = canvas.height;
  const size = Math.min(h * 0.55, brush.maxSize * 0.5 + 6);
  let travelled = 0, prev: { x: number; y: number } | null = null;
  for (let t = 0; t <= 1; t += 0.0035) {
    const x = 12 + t * (w - 24);
    const y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.18;
    const dx = prev ? x - prev.x : 0;
    const dy = prev ? y - prev.y : 0;
    if (prev) travelled += Math.hypot(dx, dy);
    prev = { x, y };

    // Taper ends of stroke in both size and opacity so they don't get abruptly cut off
    const edgeTaper = Math.min(1, Math.min(t, 1 - t) / 0.15);
    const smoothTaper = Math.sin((edgeTaper * Math.PI) / 2);
    const pressure = Math.max(0.01, Math.sin(t * Math.PI) * smoothTaper);
    const flowScale = Math.pow(smoothTaper, 1.4);

    stampDab(ctx, tip, brush, { x, y, pressure, travelled, dx, dy }, size * smoothTaper, flowScale);
  }
  ctx.globalAlpha = 1;
}
