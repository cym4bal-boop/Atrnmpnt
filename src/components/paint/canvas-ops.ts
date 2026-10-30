// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
export type LiquifyMode = 'Push' | 'Twirl Right' | 'Twirl Left' | 'Pinch' | 'Expand' | 'Crystals' | 'Edge' | 'Reconstruct';

export function resolveColor(value: string) {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const context = probe.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data] as [number, number, number, number];
}

export function floodFill(canvas: HTMLCanvasElement, x: number, y: number, color: string, tolerance = 34) {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const width = canvas.width;
  const height = canvas.height;
  const startX = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const startY = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const start = (startY * width + startX) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const fill = resolveColor(color);
  if (target.every((channel, i) => Math.abs(channel - fill[i]) < 2)) return false;
  const matches = (index: number) => {
    const alphaDiff = Math.abs(data[index + 3] - target[3]);
    if (alphaDiff > Math.max(28, tolerance)) return false;
    if (target[3] < 10) return data[index + 3] < 28;
    const alphaScale = target[3] / 255;
    return Math.abs(data[index] - target[0]) <= tolerance * alphaScale + 10 &&
      Math.abs(data[index + 1] - target[1]) <= tolerance * alphaScale + 10 &&
      Math.abs(data[index + 2] - target[2]) <= tolerance * alphaScale + 10;
  };
  const visited = new Uint8Array(width * height);
  const spans: number[] = [startX, startY];
  const writePixel = (pixel: number) => {
    const alpha = fill[3] / 255;
    data[pixel] = fill[0];
    data[pixel + 1] = fill[1];
    data[pixel + 2] = fill[2];
    data[pixel + 3] = Math.round(255 * alpha);
  };
  while (spans.length) {
    const sy = spans.pop()!;
    let sx = spans.pop()!;
    let offset = sy * width + sx;
    while (sx >= 0 && !visited[offset] && matches(offset * 4)) { sx--; offset--; }
    sx++;
    let reachAbove = false;
    let reachBelow = false;
    for (let px = sx; px < width; px++) {
      const cell = sy * width + px;
      const index = cell * 4;
      if (visited[cell] || !matches(index)) break;
      visited[cell] = 1;
      writePixel(index);
      if (sy > 0) {
        const above = cell - width;
        const matchesAbove = !visited[above] && matches(above * 4);
        if (matchesAbove && !reachAbove) spans.push(px, sy - 1);
        reachAbove = matchesAbove;
      }
      if (sy + 1 < height) {
        const below = cell + width;
        const matchesBelow = !visited[below] && matches(below * 4);
        if (matchesBelow && !reachBelow) spans.push(px, sy + 1);
        reachBelow = matchesBelow;
      }
    }
  }
  context.putImageData(image, 0, 0);
  return true;
}

export function drawGeometry(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, shape: 'Line' | 'Ellipse' | 'Rectangle', color: string, width: number, opacity: number) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.globalAlpha = opacity / 100;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (shape === 'Line') {
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
  } else {
    const left = Math.min(from.x, to.x);
    const top = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);
    if (shape === 'Ellipse') context.ellipse(left + w / 2, top + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
    else context.rect(left, top, w, h);
  }
  context.stroke();
  context.restore();
}

export function applyCanvasEffect(canvas: HTMLCanvasElement, name: string, value: number, params?: any) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
  sourceContext.drawImage(canvas, 0, 0);
  const amount = params?.amount !== undefined ? Number(params.amount) : Math.max(0, Math.min(100, value));

  if (name === 'Gaussian Blur') {
    const radius = Math.max(0.5, (amount / 100) * 45);
    context.clearRect(0, 0, width, height);
    context.filter = `blur(${radius}px)`;
    context.drawImage(source, 0, 0);
    context.filter = 'none';
    return;
  }

  if (name === 'Motion Blur') {
    const angle = ((params?.angle ?? 0) * Math.PI) / 180;
    const dist = Math.max(1, (amount / 100) * 60);
    const passes = Math.max(3, Math.min(16, Math.round(dist / 3)));
    const dx = Math.cos(angle) * (dist / passes);
    const dy = Math.sin(angle) * (dist / passes);
    context.clearRect(0, 0, width, height);
    for (let i = -Math.floor(passes / 2); i <= Math.floor(passes / 2); i++) {
      context.globalAlpha = 1 / passes;
      context.drawImage(source, i * dx, i * dy);
    }
    context.globalAlpha = 1;
    return;
  }

  if (name === 'Perspective Blur') {
    const passes = Math.max(3, Math.round((amount / 100) * 12));
    const cx = (params?.x ?? 0.5) * width;
    const cy = (params?.y ?? 0.5) * height;
    context.clearRect(0, 0, width, height);
    for (let i = 0; i < passes; i++) {
      const scale = 1 + (i / passes) * (amount / 100) * 0.15;
      context.save();
      context.globalAlpha = 1 / passes;
      context.translate(cx, cy);
      context.scale(scale, scale);
      context.translate(-cx, -cy);
      context.drawImage(source, 0, 0);
      context.restore();
    }
    context.globalAlpha = 1;
    return;
  }

  if (name === 'Bloom') {
    const size = Math.max(1, ((params?.size ?? 30) / 100) * 40);
    const burn = 1 + ((params?.burn ?? 20) / 100) * 0.8;
    const transition = Math.max(0.1, (params?.transition ?? 40) / 100);
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0);
    context.save();
    context.globalCompositeOperation = 'screen';
    context.filter = `blur(${size}px) brightness(${burn})`;
    context.globalAlpha = transition;
    context.drawImage(source, 0, 0);
    context.restore();
    return;
  }

  const image = sourceContext.getImageData(0, 0, width, height);
  const data = image.data;
  const strength = amount / 100;

  if (name === 'Hue, Saturation, Brightness') {
    const hShift = (params?.hue ?? 0) / 360;
    const sShift = (params?.saturation ?? 0) / 100;
    const bShift = (params?.brightness ?? 0) / 100;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }

      h = (h + hShift + 1) % 1;
      s = Math.max(0, Math.min(1, s * (1 + sShift)));
      l = Math.max(0, Math.min(1, bShift >= 0 ? l + (1 - l) * bShift : l * (1 + bShift)));

      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      data[i] = clamp(Math.round(hue2rgb(p, q, h + 1 / 3) * 255));
      data[i + 1] = clamp(Math.round(hue2rgb(p, q, h) * 255));
      data[i + 2] = clamp(Math.round(hue2rgb(p, q, h - 1 / 3) * 255));
    }
  } else if (name === 'Color Balance') {
    const cr = params?.cyanRed ?? [0, 0, 0];
    const mg = params?.magentaGreen ?? [0, 0, 0];
    const yb = params?.yellowBlue ?? [0, 0, 0];
    const preserveLum = params?.preserveLuminosity !== false;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      const shadowW = Math.max(0, 1 - lum * 2);
      const highlightW = Math.max(0, (lum - 0.5) * 2);
      const midtoneW = 1 - shadowW - highlightW;

      const dR = (cr[0] * shadowW + cr[1] * midtoneW + cr[2] * highlightW) * 0.7;
      const dG = (mg[0] * shadowW + mg[1] * midtoneW + mg[2] * highlightW) * 0.7;
      const dB = (yb[0] * shadowW + yb[1] * midtoneW + yb[2] * highlightW) * 0.7;

      let nr = clamp(r + dR);
      let ng = clamp(g + dG);
      let nb = clamp(b + dB);

      if (preserveLum) {
        const newLum = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255;
        if (newLum > 0.001) {
          const ratio = lum / newLum;
          nr = clamp(nr * ratio);
          ng = clamp(ng * ratio);
          nb = clamp(nb * ratio);
        }
      }

      data[i] = nr;
      data[i + 1] = ng;
      data[i + 2] = nb;
    }
  } else if (name === 'Curves') {
    const curves = params?.curves;
    const lutComposite = buildCurveLut(curves?.composite);
    const lutR = buildCurveLut(curves?.red);
    const lutG = buildCurveLut(curves?.green);
    const lutB = buildCurveLut(curves?.blue);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      data[i] = lutR[lutComposite[data[i]]];
      data[i + 1] = lutG[lutComposite[data[i + 1]]];
      data[i + 2] = lutB[lutComposite[data[i + 2]]];
    }
  } else if (name === 'Gradient Map') {
    const stops: { pos: number; color: string }[] = params?.stops || [
      { pos: 0, color: '#090022' },
      { pos: 0.5, color: '#ff007f' },
      { pos: 1, color: '#00f6ff' },
    ];
    const lut = buildGradientLut(stops);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const mapped = lut[gray];
      data[i] = mapped[0];
      data[i + 1] = mapped[1];
      data[i + 2] = mapped[2];
    }
  } else if (name === 'Noise') {
    const noiseAmt = amount * 0.75;
    const scale = Math.max(1, Math.round(((params?.scale ?? 20) / 100) * 16));
    const turb = ((params?.turbulence ?? 40) / 100) * 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] === 0) continue;
        const n = (Math.sin((x / scale) * 2.3 + turb) * Math.cos((y / scale) * 2.7) + (Math.random() - 0.5)) * noiseAmt;
        data[i] = clamp(data[i] + n);
        data[i + 1] = clamp(data[i + 1] + n);
        data[i + 2] = clamp(data[i + 2] + n);
      }
    }
  } else if (name === 'Sharpen') {
    const original = new Uint8ClampedArray(data);
    const k = strength * 1.5;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] === 0) continue;
        for (let c = 0; c < 3; c++) {
          const center = original[i + c];
          const neighbors =
            (original[i - 4 + c] +
              original[i + 4 + c] +
              original[i - width * 4 + c] +
              original[i + width * 4 + c]) /
            4;
          data[i + c] = clamp(center + (center - neighbors) * k);
        }
      }
    }
  } else if (name === 'Glitch') {
    const original = new Uint8ClampedArray(data);
    const shift = Math.max(1, Math.round(amount * 0.4));
    const blockSize = Math.max(4, params?.blockSize ?? 24);
    for (let y = 0; y < height; y++) {
      const block = Math.floor(y / blockSize);
      const isShifted = (block * 97) % 5 === 1;
      const lineShift = isShifted ? Math.round(Math.sin(block * 13) * shift) : 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const sx = Math.max(0, Math.min(width - 1, x + lineShift));
        const srcI = (y * width + sx) * 4;
        data[i] = original[srcI];
        data[i + 2] = original[(y * width + Math.max(0, Math.min(width - 1, x - lineShift))) * 4 + 2];
      }
    }
  } else if (name === 'Halftone') {
    const cell = Math.max(3, Math.round(params?.dotSize ?? 12));
    const isNewspaper = params?.style === 'newspaper';
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let yy = y; yy < Math.min(height, y + cell); yy++) {
          for (let xx = x; xx < Math.min(width, x + cell); xx++) {
            const p = (yy * width + xx) * 4;
            sumR += data[p];
            sumG += data[p + 1];
            sumB += data[p + 2];
            count++;
          }
        }
        if (count === 0) continue;
        const avgLum = (sumR * 0.299 + sumG * 0.587 + sumB * 0.114) / (count * 255);
        const dotRadius = ((1 - avgLum) * cell * 0.5);
        const cx = x + cell / 2;
        const cy = y + cell / 2;

        for (let yy = y; yy < Math.min(height, y + cell); yy++) {
          for (let xx = x; xx < Math.min(width, x + cell); xx++) {
            const p = (yy * width + xx) * 4;
            const dist = Math.hypot(xx - cx, yy - cy);
            if (dist <= dotRadius) {
              if (isNewspaper) {
                data[p] = 20; data[p + 1] = 20; data[p + 2] = 20;
              } else {
                data[p] = Math.round(sumR / count);
                data[p + 1] = Math.round(sumG / count);
                data[p + 2] = Math.round(sumB / count);
              }
            } else {
              data[p] = 250; data[p + 1] = 250; data[p + 2] = 250;
            }
          }
        }
      }
    }
  } else if (name === 'Chromatic Aberration') {
    const original = new Uint8ClampedArray(data);
    const angle = ((params?.angle ?? 0) * Math.PI) / 180;
    const shift = Math.max(1, Math.round((amount / 100) * 24));
    const dx = Math.round(Math.cos(angle) * shift);
    const dy = Math.round(Math.sin(angle) * shift);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const rx = Math.max(0, Math.min(width - 1, x + dx));
        const ry = Math.max(0, Math.min(height - 1, y + dy));
        const bx = Math.max(0, Math.min(width - 1, x - dx));
        const by = Math.max(0, Math.min(height - 1, y - dy));

        data[i] = original[(ry * width + rx) * 4];
        data[i + 2] = original[(by * width + bx) * 4 + 2];
      }
    }
  }

  context.putImageData(image, 0, 0);
}

function buildCurveLut(pts?: { x: number; y: number }[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (!pts || pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let y = t;
    if (t <= sorted[0].x) y = sorted[0].y;
    else if (t >= sorted[sorted.length - 1].x) y = sorted[sorted.length - 1].y;
    else {
      for (let k = 1; k < sorted.length; k++) {
        if (t <= sorted[k].x) {
          const segT = (t - sorted[k - 1].x) / Math.max(0.0001, sorted[k].x - sorted[k - 1].x);
          y = sorted[k - 1].y + (sorted[k].y - sorted[k - 1].y) * segT;
          break;
        }
      }
    }
    lut[i] = clamp(Math.round(y * 255));
  }
  return lut;
}

function buildGradientLut(stops: { pos: number; color: string }[]): [number, number, number][] {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  sorted.forEach((s) => grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  const data = ctx.getImageData(0, 0, 256, 1).data;
  const lut: [number, number, number][] = [];
  for (let i = 0; i < 256; i++) {
    lut.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }
  return lut;
}

export function applyLiquify(canvas: HTMLCanvasElement, mode: LiquifyMode, values: { amount: number; size: number; pressure: number; distortion: number; momentum: number }) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  const input = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  const source = input.data;
  const target = output.data;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(8, Math.min(width, height) * values.size / 100);
  const strength = values.amount / 100 * values.pressure / 100;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    let sx = x;
    let sy = y;
    const influence = Math.max(0, 1 - dist / radius);
    if (influence > 0) {
      if (mode === 'Twirl Right' || mode === 'Twirl Left') {
        const direction = mode === 'Twirl Right' ? 1 : -1;
        const angle = direction * strength * influence * (1 + values.distortion / 100) * 4;
        sx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
        sy = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
      } else if (mode === 'Pinch' || mode === 'Expand' || mode === 'Push') {
        const factor = mode === 'Expand' ? 1 + strength * influence : 1 - strength * influence * (mode === 'Push' ? .6 : 1);
        sx = cx + dx * factor;
        sy = cy + dy * factor;
      } else if (mode === 'Crystals' || mode === 'Edge') {
        const cell = Math.max(3, radius / (mode === 'Edge' ? 8 : 16));
        sx = Math.round(x / cell) * cell;
        sy = Math.round(y / cell) * cell;
      } else if (mode === 'Reconstruct') {
        sx = x * (1 - strength * influence) + cx * strength * influence;
        sy = y * (1 - strength * influence) + cy * strength * influence;
      }
    }
    const ix = Math.max(0, Math.min(width - 1, Math.round(sx)));
    const iy = Math.max(0, Math.min(height - 1, Math.round(sy)));
    const from = (iy * width + ix) * 4;
    const to = (y * width + x) * 4;
    target[to] = source[from]; target[to + 1] = source[from + 1]; target[to + 2] = source[from + 2]; target[to + 3] = source[from + 3];
  }
  context.putImageData(output, 0, 0);
}

function clamp(value: number) { return Math.max(0, Math.min(255, value)); }
