// Effects applied to one caricature after its style, in the order the user stacks them.
// Pixel effects run here (worker, tests); overlay effects (frame, caption, speech bubble,
// stickers) need fonts and are drawn on a canvas by ui/overlay.js — here they are only described.
// Each effect is { id, on, ...params }; EFFECTS describes the parameters for the panel.
import {
  blurChannel, blurRaster, clamp, cloneRaster, createRaster, hslToRgb, mix, morph, parseColor, rgbToHsl, rng, toGray,
} from './raster.js';

const num = (key, min, max, def, step = 1, unit = '') => ({ key, type: 'number', min, max, def, step, unit });
const color = (key, def) => ({ key, type: 'color', def });
const choice = (key, options, def) => ({ key, type: 'choice', options, def });
const text = (key, def = '') => ({ key, type: 'text', def });

export const EFFECTS = [
  { id: 'adjust', icon: 'fxAdjust', params: [num('brightness', -100, 100, 0, 5), num('contrast', -100, 100, 0, 5), num('saturation', -100, 100, 0, 5), num('hue', -180, 180, 0, 10, '°'), num('temperature', -100, 100, 0, 5)] },
  { id: 'background', icon: 'fxBackground', params: [choice('mode', ['color', 'gradient', 'blur', 'rays', 'dots'], 'gradient'), color('color1', '#ffd6e0'), color('color2', '#b8e0ff'), num('blur', 2, 40, 12, 1, 'px')] },
  { id: 'outline', icon: 'fxOutline', params: [num('width', 1, 24, 6, 1, 'px'), color('color', '#ffffff'), num('shadow', 0, 100, 40, 5, '%')] },
  { id: 'vignette', icon: 'fxVignette', params: [num('amount', 0, 100, 55, 5, '%'), num('size', 0, 100, 55, 5, '%'), color('color', '#000000')] },
  { id: 'grain', icon: 'fxGrain', params: [num('amount', 0, 100, 25, 5, '%'), num('size', 1, 4, 1, 1, 'px')] },
  { id: 'sepia', icon: 'fxSepia', params: [num('amount', 0, 100, 80, 5, '%')] },
  { id: 'grayscale', icon: 'fxGrayscale', params: [num('amount', 0, 100, 100, 5, '%')] },
  { id: 'duotone', icon: 'fxDuotone', params: [color('dark', '#1d2b64'), color('light', '#f8cdda'), num('amount', 0, 100, 100, 5, '%')] },
  { id: 'invert', icon: 'fxInvert', params: [num('amount', 0, 100, 100, 5, '%')] },
  { id: 'blur', icon: 'fxBlur', params: [num('radius', 0, 20, 2, 0.5, 'px')] },
  { id: 'sharpen', icon: 'fxSharpen', params: [num('amount', 0, 200, 60, 10, '%')] },
  { id: 'glow', icon: 'fxGlow', params: [num('amount', 0, 100, 45, 5, '%'), num('radius', 1, 30, 8, 1, 'px')] },
  { id: 'emboss', icon: 'fxEmboss', params: [num('amount', 0, 100, 60, 5, '%')] },
  { id: 'posterize', icon: 'fxPosterize', params: [num('levels', 2, 16, 5, 1)] },
  { id: 'halftone', icon: 'fxHalftone', params: [num('size', 3, 24, 6, 1, 'px'), num('angle', 0, 90, 45, 5, '°'), num('amount', 0, 100, 100, 5, '%')] },
  { id: 'pixelate', icon: 'fxPixelate', params: [num('size', 2, 40, 8, 1, 'px')] },
  // Overlays (ui/overlay.js)
  { id: 'frame', icon: 'fxFrame', overlay: true, params: [choice('style', ['simple', 'rounded', 'polaroid', 'film', 'stamp'], 'polaroid'), color('color', '#ffffff'), num('width', 2, 80, 24, 2, 'px')] },
  { id: 'caption', icon: 'fxCaption', overlay: true, params: [text('text', ''), choice('position', ['top', 'bottom'], 'bottom'), num('size', 10, 120, 44, 2, 'px'), color('color', '#ffffff'), color('band', '#000000'), num('bandOpacity', 0, 100, 45, 5, '%')] },
  { id: 'bubble', icon: 'fxBubble', overlay: true, params: [text('text', ''), choice('side', ['left', 'right'], 'right'), num('size', 10, 90, 32, 2, 'px')] },
  { id: 'sticker', icon: 'fxSticker', overlay: true, params: [choice('kind', ['crown', 'glasses', 'hearts', 'stars', 'sparkles', 'flowers'], 'crown'), num('size', 20, 200, 100, 10, '%')] },
];

export const EFFECT_IDS = EFFECTS.map((e) => e.id);
export const effectDef = (id) => EFFECTS.find((e) => e.id === id) ?? null;
export const isOverlay = (id) => Boolean(effectDef(id)?.overlay);

/** A new effect with its default parameters. */
export function newEffect(id, extra = {}) {
  const def = effectDef(id);
  if (!def) throw new Error(`unknown effect ${id}`);
  const effect = { id, on: true };
  for (const p of def.params) effect[p.key] = p.def;
  return { ...effect, ...extra };
}

/** An effect read from a file or the history, repaired (unknown → null). */
export function normalizeEffect(raw) {
  const def = effectDef(raw?.id);
  if (!def) return null;
  const out = { id: def.id, on: raw.on !== false };
  for (const p of def.params) {
    const v = raw[p.key];
    if (p.type === 'number') out[p.key] = Number.isFinite(Number(v)) ? clamp(Number(v), p.min, p.max) : p.def;
    else if (p.type === 'color') out[p.key] = /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : p.def;
    else if (p.type === 'choice') out[p.key] = p.options.includes(v) ? v : p.def;
    else out[p.key] = typeof v === 'string' ? v.slice(0, 200) : p.def;
  }
  return out;
}

// ───────────────────────── pixel effects

function perPixel(r, fn) {
  const out = cloneRaster(r);
  const d = out.data;
  const px = [0, 0, 0];
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    px[0] = d[i]; px[1] = d[i + 1]; px[2] = d[i + 2];
    fn(px, p);
    d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2];
  }
  return out;
}

function adjust(r, e) {
  const b = e.brightness * 1.28;
  const c = (100 + e.contrast) / 100;
  const contrast = c * c;
  const sat = 1 + e.saturation / 100;
  const hue = e.hue / 360;
  const warm = e.temperature / 100;
  return perPixel(r, (px) => {
    for (let k = 0; k < 3; k++) px[k] = (px[k] - 128) * contrast + 128 + b;
    px[0] += warm * 22; px[2] -= warm * 22;
    if (sat !== 1 || hue !== 0) {
      const [h, s, l] = rgbToHsl(clamp(px[0], 0, 255), clamp(px[1], 0, 255), clamp(px[2], 0, 255));
      const rgb = hslToRgb((h + hue + 1) % 1, clamp(s * sat, 0, 1), l);
      px[0] = rgb[0]; px[1] = rgb[1]; px[2] = rgb[2];
    }
  });
}

function vignette(r, e) {
  const [cr, cg, cb] = parseColor(e.color);
  const w = r.width;
  const h = r.height;
  const inner = 0.25 + (e.size / 100) * 0.6;
  const k = e.amount / 100;
  return perPixel(r, (px, p) => {
    const x = p % w;
    const y = (p - x) / w;
    const d = Math.hypot((x / w - 0.5) * 2, (y / h - 0.5) * 2) / Math.SQRT2;
    const t = clamp((d - inner) / (1 - inner + 0.001), 0, 1) ** 1.6 * k;
    px[0] += (cr - px[0]) * t; px[1] += (cg - px[1]) * t; px[2] += (cb - px[2]) * t;
  });
}

function grain(r, e, seed) {
  const random = rng(seed + 101);
  const w = r.width;
  const size = Math.max(1, Math.round(e.size));
  const cols = Math.ceil(w / size);
  const field = new Float32Array(cols * Math.ceil(r.height / size));
  for (let i = 0; i < field.length; i++) field[i] = random() - 0.5;
  const k = e.amount * 1.1;
  return perPixel(r, (px, p) => {
    const x = p % w;
    const y = (p - x) / w;
    const n = field[Math.floor(y / size) * cols + Math.floor(x / size)] * k;
    px[0] += n; px[1] += n; px[2] += n;
  });
}

function sepia(r, e) {
  const k = e.amount / 100;
  return perPixel(r, (px) => {
    const [a, b, c] = px;
    const sr = 0.393 * a + 0.769 * b + 0.189 * c;
    const sg = 0.349 * a + 0.686 * b + 0.168 * c;
    const sb = 0.272 * a + 0.534 * b + 0.131 * c;
    px[0] = a + (sr - a) * k; px[1] = b + (sg - b) * k; px[2] = c + (sb - c) * k;
  });
}

function grayscale(r, e) {
  const k = e.amount / 100;
  return perPixel(r, (px) => {
    const l = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
    for (let i = 0; i < 3; i++) px[i] += (l - px[i]) * k;
  });
}

function duotone(r, e) {
  const dark = parseColor(e.dark);
  const light = parseColor(e.light);
  const k = e.amount / 100;
  return perPixel(r, (px) => {
    const t = (0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]) / 255;
    for (let i = 0; i < 3; i++) px[i] += (dark[i] + (light[i] - dark[i]) * t - px[i]) * k;
  });
}

function invert(r, e) {
  const k = e.amount / 100;
  return perPixel(r, (px) => { for (let i = 0; i < 3; i++) px[i] += (255 - 2 * px[i]) * k; });
}

function sharpen(r, e, u) {
  const soft = blurRaster(r, 1.2 * u);
  const k = e.amount / 100;
  const out = cloneRaster(r);
  const d = out.data;
  const s = soft.data;
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (d[i + c] - s[i + c]) * k;
  return out;
}

function glow(r, e, u) {
  const soft = blurRaster(r, e.radius * u);
  const k = e.amount / 100;
  const out = cloneRaster(r);
  const d = out.data;
  const s = soft.data;
  // Screen blend of the blurred picture.
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (255 - (255 - d[i + c]) * (255 - s[i + c]) / 255 - d[i + c]) * k;
  return out;
}

function emboss(r, e) {
  const w = r.width;
  const h = r.height;
  const gray = toGray(r);
  const k = e.amount / 100;
  return perPixel(r, (px, p) => {
    const x = p % w;
    const y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return;
    const relief = (gray[p - w - 1] - gray[p + w + 1]) * 0.9;
    for (let i = 0; i < 3; i++) px[i] += relief * k;
  });
}

function posterize(r, e) {
  const n = Math.max(1, Math.round(e.levels) - 1);
  return perPixel(r, (px) => { for (let i = 0; i < 3; i++) px[i] = Math.round((clamp(px[i], 0, 255) / 255) * n) * (255 / n); });
}

function halftone(r, e, u) {
  const w = r.width;
  const cell = Math.max(3, e.size * u);
  const angle = (e.angle * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const soft = blurRaster(r, cell / 3);
  const k = e.amount / 100;
  return perPixel(r, (px, p) => {
    const x = p % w;
    const y = (p - x) / w;
    const uu = (x * c + y * s) / cell;
    const vv = (-x * s + y * c) / cell;
    const dist = Math.hypot(uu - Math.round(uu), vv - Math.round(vv));
    const i = p * 4;
    for (let ch = 0; ch < 3; ch++) {
      const ink = 1 - soft.data[i + ch] / 255;
      const radius = Math.sqrt(ink) * 0.7;
      const t = clamp((radius - dist) * cell + 0.5, 0, 1);
      const v = 255 * (1 - t);
      px[ch] += (v - px[ch]) * k;
    }
  });
}

function pixelate(r, e, u) {
  const size = Math.max(2, Math.round(e.size * u));
  const w = r.width;
  const h = r.height;
  const out = cloneRaster(r);
  const d = out.data;
  const s = r.data;
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) {
      let rr = 0; let gg = 0; let bb = 0; let n = 0;
      for (let y = by; y < Math.min(h, by + size); y++) for (let x = bx; x < Math.min(w, bx + size); x++) { const i = (y * w + x) * 4; rr += s[i]; gg += s[i + 1]; bb += s[i + 2]; n++; }
      for (let y = by; y < Math.min(h, by + size); y++) for (let x = bx; x < Math.min(w, bx + size); x++) { const i = (y * w + x) * 4; d[i] = rr / n; d[i + 1] = gg / n; d[i + 2] = bb / n; }
    }
  }
  return out;
}

/** Replaces what is outside the person (mask) by a colour, a gradient, blur, rays or dots. */
function background(r, e, mask, u, features) {
  if (!mask) return r;
  const w = r.width;
  const h = r.height;
  const c1 = parseColor(e.color1);
  const c2 = parseColor(e.color2);
  let back;
  if (e.mode === 'blur') back = blurRaster(r, e.blur * u);
  else {
    back = createRaster(w, h);
    const d = back.data;
    const cx = features?.face.cx ?? w / 2;
    const cy = features?.face.cy ?? h / 2;
    const cell = 18 * u;
    for (let p = 0; p < w * h; p++) {
      const x = p % w;
      const y = (p - x) / w;
      let t;
      if (e.mode === 'color') t = 0;
      else if (e.mode === 'gradient') t = y / Math.max(1, h - 1);
      else if (e.mode === 'rays') t = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 32) % 2;
      else {
        const du = x / cell - Math.round(x / cell);
        const dv = y / cell - Math.round(y / cell);
        t = Math.hypot(du, dv) < 0.28 ? 1 : 0;
      }
      const i = p * 4;
      d[i] = c1[0] + (c2[0] - c1[0]) * t; d[i + 1] = c1[1] + (c2[1] - c1[1]) * t; d[i + 2] = c1[2] + (c2[2] - c1[2]) * t; d[i + 3] = 255;
    }
  }
  return mix(back, r, blurChannel(mask, w, h, 1.2));
}

/** A coloured border around the person (sticker look) with an optional soft shadow. */
function outline(r, e, mask, u) {
  if (!mask) return r;
  const w = r.width;
  const h = r.height;
  const grown = morph(mask, w, h, Math.max(1, Math.round(e.width * u)), 'max');
  let out = r;
  if (e.shadow > 0) {
    const shadow = blurChannel(grown, w, h, 4 * u);
    const offset = Math.round(4 * u);
    const shifted = new Float32Array(w * h);
    for (let y = offset; y < h; y++) for (let x = offset; x < w; x++) shifted[y * w + x] = shadow[(y - offset) * w + (x - offset)] * (1 - grown[y * w + x]);
    out = mix(out, solid(w, h, [0, 0, 0]), shifted.map((v) => v * (e.shadow / 100) * 0.6));
  }
  const ring = grown.map((v, i) => clamp(v - mask[i], 0, 1));
  return mix(out, solid(w, h, parseColor(e.color)), blurChannel(ring, w, h, 0.7));
}

function solid(w, h, [r, g, b]) {
  const out = createRaster(w, h);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return out;
}

/**
 * Applies the pixel effects of a list in order (switched-off and overlay effects are skipped).
 * `u` is the size unit (1 for a 600-pixel picture) so a 6 px outline looks the same at any size.
 */
export function applyEffects(raster, effects, { mask = null, seed = 1, u = 1, features = null } = {}) {
  let r = raster;
  for (const effect of effects ?? []) {
    if (!effect?.on || isOverlay(effect.id)) continue;
    const e = normalizeEffect(effect);
    if (!e) continue;
    switch (e.id) {
      case 'adjust': r = adjust(r, e); break;
      case 'background': r = background(r, e, mask, u, features); break;
      case 'outline': r = outline(r, e, mask, u); break;
      case 'vignette': r = vignette(r, e); break;
      case 'grain': r = grain(r, e, seed); break;
      case 'sepia': r = sepia(r, e); break;
      case 'grayscale': r = grayscale(r, e); break;
      case 'duotone': r = duotone(r, e); break;
      case 'invert': r = invert(r, e); break;
      case 'blur': r = e.radius > 0 ? blurRaster(r, e.radius * u) : r; break;
      case 'sharpen': r = sharpen(r, e, u); break;
      case 'glow': r = glow(r, e, u); break;
      case 'emboss': r = emboss(r, e); break;
      case 'posterize': r = posterize(r, e); break;
      case 'halftone': r = halftone(r, e, u); break;
      case 'pixelate': r = pixelate(r, e, u); break;
      default: break;
    }
  }
  return r;
}
