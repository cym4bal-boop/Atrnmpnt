import JSZip from 'jszip';
import type { BrushDef } from './brushes';

/**
 * Native Aeternum Paint Brush format (.apb) wrapper.
 */
export type ApbFile = {
  version: 2;
  generator: 'AeternumPaint Studio';
  dateExported: string;
  brush: BrushDef;
};

/**
 * Downloads a brush definition as a .apb file.
 */
export function exportBrushToApb(brush: BrushDef) {
  const apb: ApbFile = {
    version: 2,
    generator: 'AeternumPaint Studio',
    dateExported: new Date().toISOString(),
    brush: {
      ...brush,
      author: brush.author || 'AeternumPaint Artist',
      dateCreated: brush.dateCreated || new Date().toLocaleDateString(),
    },
  };

  const json = JSON.stringify(apb, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (brush.name || 'brush').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  a.href = url;
  a.download = `${safeName}.apb`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Quality Control sanitizer: ensures all brush parameters are safe,
 * non-stuttering, finite numbers within pleasant, responsive bounds.
 */
export function sanitizeBrushDef(b: Partial<BrushDef>, fallbackName = 'Imported Brush'): BrushDef {
  const clamp = (val: unknown, min: number, max: number, def: number) => {
    const n = typeof val === 'number' && !Number.isNaN(val) ? val : def;
    return Math.max(min, Math.min(max, n));
  };

  const id = b.id && b.id.trim() ? b.id : `brush-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = b.name && b.name.trim() ? b.name.trim() : fallbackName;
  const category = b.category && b.category.trim() ? b.category.trim() : 'Imported';

  return {
    id,
    name,
    category,
    author: b.author || 'Imported Brush',
    dateCreated: b.dateCreated || new Date().toLocaleDateString(),
    signName: b.signName || '',

    // Stroke path
    spacing: clamp(b.spacing, 0.01, 1.2, 0.06),
    spacingJitter: clamp(b.spacingJitter, 0, 1, 0),
    jitterLateral: clamp(b.jitterLateral, 0, 1, 0),
    jitterLinear: clamp(b.jitterLinear, 0, 1, 0),
    falloff: clamp(b.falloff, 0, 1, 0),
    streamline: clamp(b.streamline, 0, 100, 30),

    // Stabilization
    stabilization: clamp(b.stabilization, 0, 100, 0),
    motionFiltering: clamp(b.motionFiltering, 0, 100, 0),

    // Taper
    taper: clamp(b.taper, 0, 1, 0.3),
    pressureTaper: clamp(b.pressureTaper, 0, 1, 0),
    touchTaper: clamp(b.touchTaper, 0, 1, 0),
    taperSize: clamp(b.taperSize, 0, 1, 0.5),
    taperOpacity: clamp(b.taperOpacity, 0, 1, 0.8),
    taperTip: b.taperTip === 'sharp' ? 'sharp' : 'round',

    // Shape
    hardness: clamp(b.hardness, 0, 1, 0.8),
    roundness: clamp(b.roundness, 0.1, 1, 1),
    angle: clamp(b.angle, -180, 180, 0),
    rotateRandom: Boolean(b.rotateRandom),
    scatter: clamp(b.scatter, 0, 2, 0),
    shapeScatter: clamp(b.shapeScatter, 0, 1, 0),
    shapeRotation: clamp(b.shapeRotation, -180, 180, 0),
    shapeFollowStroke: Boolean(b.shapeFollowStroke),
    shapeCount: Math.round(clamp(b.shapeCount, 1, 16, 1)),
    shapeCountJitter: clamp(b.shapeCountJitter, 0, 1, 0),
    shapeRandomized: Boolean(b.shapeRandomized),

    // Grain
    grain: clamp(b.grain, 0, 1, 0),
    grainScale: clamp(b.grainScale, 0.1, 3, 1),
    grainZoom: clamp(b.grainZoom, 0, 1, 0.5),
    grainDepth: clamp(b.grainDepth, 0, 1, 0.5),
    grainBlend: b.grainBlend === 'multiply' || b.grainBlend === 'overlay' ? b.grainBlend : 'normal',

    // Rendering
    renderMode: b.renderMode || 'glaze',
    flow: clamp(b.flow, 0.05, 1, 0.9),
    wetEdges: clamp(b.wetEdges, 0, 1, 0),
    burntEdges: clamp(b.burntEdges, 0, 1, 0),

    // Wet Mix
    dilution: clamp(b.dilution, 0, 1, 0),
    charge: clamp(b.charge, 0, 1, 1),
    attack: clamp(b.attack, 0, 1, 0.8),
    pull: clamp(b.pull, 0, 1, 0.5),
    grade: clamp(b.grade, 0, 1, 0.5),
    wetJitter: clamp(b.wetJitter, 0, 1, 0),

    // Color Dynamics
    stampColorJitter: clamp(b.stampColorJitter, 0, 1, 0),
    strokeColorJitter: clamp(b.strokeColorJitter, 0, 1, 0),
    colorPressure: clamp(b.colorPressure, 0, 1, 0),

    // Dynamics
    speedSize: clamp(b.speedSize, -1, 1, 0),
    speedOpacity: clamp(b.speedOpacity, -1, 1, 0),
    jitter: clamp(b.jitter, 0, 1, 0),
    jitterOpacity: clamp(b.jitterOpacity, 0, 1, 0),

    // Stylus / Pressure
    sizePressure: clamp(b.sizePressure, 0, 1, 0.6),
    opacityPressure: clamp(b.opacityPressure, 0, 1, 0),
    pressureFlow: clamp(b.pressureFlow, 0, 1, 0.5),
    pressureBleed: clamp(b.pressureBleed, 0, 1, 0),
    tiltAngle: clamp(b.tiltAngle, 0, 90, 0),
    tiltOpacity: clamp(b.tiltOpacity, 0, 1, 0),
    tiltSize: clamp(b.tiltSize, 0, 2, 0),

    // Properties
    useStampPreview: Boolean(b.useStampPreview),
    orientToScreen: Boolean(b.orientToScreen),
    previewSize: clamp(b.previewSize, 0.1, 1, 0.5),
    smudge: clamp(b.smudge, 0, 1, 0),
    minSize: clamp(b.minSize, 1, 200, 2),
    maxSize: clamp(b.maxSize, 10, 500, 80),
    minOpacity: clamp(b.minOpacity, 0, 1, 0),
    maxOpacity: clamp(b.maxOpacity, 0.1, 1, 1),

    // Materials
    metallic: clamp(b.metallic, 0, 1, 0),
    roughness: clamp(b.roughness, 0, 1, 0),
  };
}

/**
 * Translates a MyPaint (.myb) JSON string or parsed object into an Aeternum BrushDef.
 */
export function translateMyPaintBrush(obj: Record<string, any>, rawName = 'MyPaint Brush'): BrushDef {
  const settings = obj.settings || {};
  const getVal = (key: string, def = 0): number => {
    const item = settings[key];
    if (typeof item === 'number') return item;
    if (item && typeof item.base_value === 'number') return item.base_value;
    return def;
  };

  const hasPressure = (key: string): number => {
    const item = settings[key];
    if (item?.inputs?.pressure?.length) {
      const pts = item.inputs.pressure;
      const last = pts[pts.length - 1];
      if (Array.isArray(last) && typeof last[1] === 'number') return Math.abs(last[1]);
      return 0.6;
    }
    return 0;
  };

  const hardness = Math.min(1, Math.max(0, getVal('hardness', 0.8)));
  const opaque = Math.min(1, Math.max(0.1, getVal('opaque', 0.9)));
  const dabsPerRad = getVal('dabs_per_actual_radius', 2.0);
  const spacing = Math.max(0.02, Math.min(0.8, dabsPerRad > 0 ? 0.35 / dabsPerRad : 0.08));

  const dabRatio = getVal('elliptical_dab_ratio', 1.0);
  const roundness = dabRatio > 0 ? Math.min(1, 1 / dabRatio) : 1;
  const angle = getVal('elliptical_dab_angle', 0);

  const radLog = getVal('radius_logarithmic', 2.0);
  const maxSize = Math.max(16, Math.min(300, Math.round(Math.exp(radLog) * 10)));

  const sizePres = hasPressure('radius_logarithmic') || (hasPressure('radius_by_random') ? 0.4 : 0.6);
  const opacPres = hasPressure('opaque_multiply') || hasPressure('opaque');
  const jitter = Math.min(1, Math.max(0, getVal('radius_by_random', 0)));
  const scatter = Math.min(1, Math.max(0, getVal('offset_by_random', 0)));
  const streamline = Math.round(Math.min(100, Math.max(0, getVal('slow_tracking', 0) * 100)));
  const smudge = Math.min(1, Math.max(0, getVal('smudge', 0)));

  const cleanName = (obj.parent_brush_name || rawName)
    .replace(/^.*[\\/]/, '')
    .replace(/\.myb$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return sanitizeBrushDef({
    name: cleanName,
    category: 'MyPaint',
    hardness,
    flow: opaque,
    spacing,
    roundness,
    angle,
    maxSize,
    sizePressure: sizePres ? 0.7 : 0.2,
    opacityPressure: opacPres ? 0.6 : 0,
    jitter,
    scatter,
    streamline,
    pull: smudge,
    smudge,
    taper: 0.3,
    grain: 0.1,
  }, cleanName);
}

/**
 * Translates the dynamics-properties/stroke-properties JSON schema (brushes2.zip) into BrushDef.
 */
export function translateCustomJsonBrush(data: Record<string, any>, rawName = 'Custom Brush'): BrushDef {
  const stroke = data['stroke-properties'] || {};
  const dynamics = data['dynamics-properties'] || {};
  const blend = data['blend-properties'] || {};
  const texture = data['texture-properties'] || {};

  const name = data['display-name'] || rawName.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
  const flow = typeof blend.flow === 'number' ? blend.flow : 0.85;
  const size = typeof stroke['paint-size'] === 'number' ? stroke['paint-size'] : 60;
  const wetEdges = typeof stroke['wet-edges'] === 'number' ? stroke['wet-edges'] : 0;
  const smudge = typeof blend['smudge-amount'] === 'number' ? blend['smudge-amount'] : 0;

  const sizePres = Boolean(dynamics['pressure - effects size']);
  const flowPres = Boolean(dynamics['pressure - effects flow']);
  const grainVal = typeof texture.pressure === 'number' ? texture.pressure * 0.5 : 0;

  // Categorize smartly based on name
  let category = 'Pens';
  const lower = name.toLowerCase();
  if (lower.includes('pencil') || lower.includes('sketch')) category = 'Sketching';
  else if (lower.includes('marker')) category = 'Markers';
  else if (lower.includes('charcoal') || lower.includes('chalk')) category = 'Charcoals';
  else if (lower.includes('ink') || lower.includes('pen')) category = 'Inks';
  else if (lower.includes('paint') || lower.includes('oil')) category = 'Oils';
  else if (lower.includes('airbrush') || lower.includes('spray')) category = 'Airbrushing';
  else if (lower.includes('gouache') || lower.includes('water')) category = 'Gouache';
  else category = 'Custom';

  return sanitizeBrushDef({
    name,
    category,
    flow,
    maxSize: Math.max(12, Math.min(320, size * 1.5)),
    sizePressure: sizePres ? 0.75 : 0.1,
    opacityPressure: flowPres ? 0.65 : 0,
    grain: grainVal,
    wetEdges,
    pull: smudge,
    smudge,
    spacing: 0.05,
    hardness: 0.85,
    taper: 0.4,
  }, name);
}

/**
 * Translates a single Krita .kpp file (PNG with embedded preset metadata).
 */
export function translateKritaPreset(name: string, buffer: ArrayBuffer): BrushDef {
  const cleanName = name
    .replace(/^.*[\\/]/, '')
    .replace(/\.kpp$/i, '')
    .replace(/^[a-z0-9]+\)\s*/i, '') // strip leading "b1) "
    .replace(/[-_]/g, ' ')
    .trim();

  // Inspect preset name to set realistic physical parameters
  const lower = cleanName.toLowerCase();
  let category = 'Deevad';
  let hardness = 0.8;
  let flow = 0.9;
  let grain = 0;
  let size = 60;
  let spacing = 0.05;

  if (lower.includes('airbrush')) {
    category = 'Airbrushing';
    hardness = 0.1;
    flow = 0.2;
    size = 180;
    spacing = 0.04;
  } else if (lower.includes('pencil')) {
    category = 'Sketching';
    hardness = 0.7;
    flow = 0.6;
    grain = 0.6;
    size = 25;
    spacing = 0.09;
  } else if (lower.includes('bristle') || lower.includes('painterly')) {
    category = 'Oils';
    hardness = 0.85;
    flow = 0.85;
    grain = 0.3;
    size = 90;
    spacing = 0.03;
  } else if (lower.includes('chalk')) {
    category = 'Pastels';
    hardness = 0.6;
    flow = 0.5;
    grain = 0.8;
    size = 50;
    spacing = 0.08;
  } else if (lower.includes('eraser')) {
    category = 'Pens';
    hardness = 0.9;
    flow = 1;
    size = 40;
  }

  return sanitizeBrushDef({
    name: cleanName || 'Krita Preset',
    category,
    author: 'David Revoy (Deevad)',
    hardness,
    flow,
    grain,
    maxSize: size,
    spacing,
    sizePressure: 0.75,
    opacityPressure: 0.4,
    streamline: 35,
    taper: 0.35,
  }, cleanName);
}

/**
 * Universal Brush Importer: takes any uploaded file (.apb, .myb, .kpp, .bundle, .json, .zip)
 * and translates it into an array of validated Aeternum BrushDef presets.
 */
export async function importBrushFile(file: File): Promise<BrushDef[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'apb') {
    const text = await file.text();
    const data = JSON.parse(text);
    const brush = data.brush || data;
    return [sanitizeBrushDef(brush, file.name.replace(/\.apb$/i, ''))];
  }

  if (ext === 'myb') {
    const text = await file.text();
    const json = JSON.parse(text);
    return [translateMyPaintBrush(json, file.name)];
  }

  if (ext === 'kpp') {
    const buffer = await file.arrayBuffer();
    return [translateKritaPreset(file.name, buffer)];
  }

  if (ext === 'json') {
    const text = await file.text();
    const json = JSON.parse(text);
    if (json.brush) {
      return [sanitizeBrushDef(json.brush, file.name)];
    }
    if (json.settings && json.version) {
      return [translateMyPaintBrush(json, file.name)];
    }
    if (json['stroke-properties'] || json['blend-properties']) {
      return [translateCustomJsonBrush(json, file.name)];
    }
    if (Array.isArray(json)) {
      return json.map((item, idx) => sanitizeBrushDef(item, `${file.name} #${idx + 1}`));
    }
    return [sanitizeBrushDef(json, file.name)];
  }

  if (ext === 'bundle' || ext === 'zip' || ext === 'brushset') {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const results: BrushDef[] = [];

    const entries = Object.keys(zip.files);
    for (const path of entries) {
      const entry = zip.files[path];
      if (!entry || entry.dir) continue;
      const lower = path.toLowerCase();

      try {
        if (lower.endsWith('.apb')) {
          const txt = await entry.async('text');
          const data = JSON.parse(txt);
          results.push(sanitizeBrushDef(data.brush || data, path));
        } else if (lower.endsWith('.myb')) {
          const txt = await entry.async('text');
          const data = JSON.parse(txt);
          results.push(translateMyPaintBrush(data, path));
        } else if (lower.endsWith('.kpp')) {
          const ab = await entry.async('arraybuffer');
          results.push(translateKritaPreset(path, ab));
        } else if (lower.endsWith('.json') && !lower.includes('manifest') && !lower.includes('package')) {
          const txt = await entry.async('text');
          const data = JSON.parse(txt);
          if (data['stroke-properties'] || data['blend-properties']) {
            results.push(translateCustomJsonBrush(data, path));
          } else if (data.settings) {
            results.push(translateMyPaintBrush(data, path));
          } else {
            results.push(sanitizeBrushDef(data, path));
          }
        }
      } catch {
        // Skip corrupted entries
      }
    }

    if (results.length > 0) return results;
  }

  throw new Error(`Unsupported brush format: .${ext}. Please upload .apb, .myb, .kpp, .bundle, or .json`);
}
