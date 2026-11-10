// The caricature styles. Each style has its own exaggeration (warp), options and a render
// function that turns the warped photo into a drawing:
//   render({ raster, gray, mask, features, random, seed, o, u }) → raster
//     raster   the warped photo (RGBA), gray its lightness, mask the person (0…1)
//     features where the face is after the warp (decorations: blush, eye sparkles)
//     o        the style options (lines, detail, colours, smooth, texture, background)
//     u        size unit: 1 for a 600-pixel picture (kernels grow with the picture)
// All forty are drawn for a new photo by default (Settings › Caricature chooses the set).
import {
  bilateral, blurChannel, blurRaster, clamp, cloneRaster, createRaster, grayToRaster, hslToRgb, kmeansPalette, kuwahara, mapToPalette,
  meanColor, mix, morph, multiplyBy, paperTexture, parseColor, rgbToHsl, sobel, toGray, valueNoise, xdog,
} from './raster.js';
import { moreStyles } from './styles-more.js';

export const STYLE_OPTION_KEYS = ['lines', 'detail', 'colors', 'smooth', 'texture', 'background'];
export const STYLE_OPTION_RANGE = {
  lines: { min: 0, max: 5, step: 0.5 },
  detail: { min: 0, max: 100, step: 5 },
  colors: { min: 2, max: 24, step: 1 },
  smooth: { min: 0, max: 100, step: 5 },
  texture: { min: 0, max: 100, step: 5 },
};
export const BACKGROUNDS = ['style', 'photo', 'white'];

// ───────────────────────── helpers

/** Ink factor (1 = paper, 0 = ink) of the outlines of a grey image. */
function outlines(gray, w, h, u, o, { phi = 220, extra = 0 } = {}) {
  if (o.lines <= 0) return null;
  // At least 0.6 px: on very small pictures a thinner blur finds no edges at all.
  const sigma = Math.max(0.6, 0.7 * u * (0.6 + o.lines * 0.4));
  const tau = 0.985;
  // More detail = weaker edges also become lines.
  const eps = -0.012 * (1 - o.detail / 100) + extra;
  const lines = xdogEdges(gray, w, h, sigma, tau, phi, eps);
  return o.lines > 2.5 ? morph(lines, w, h, Math.round((o.lines - 2) * 0.5 * u), 'min') : lines;
}

/** Edge-only difference of Gaussians (no dark fills): flat areas stay white whatever their tone. */
function xdogEdges(gray, w, h, sigma, tau, phi, eps) {
  const g1 = blurChannel(gray, w, h, sigma);
  const g2 = blurChannel(gray, w, h, sigma * 1.6);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const d = (g1[i] - tau * g2[i]) / 255;
    out[i] = d >= eps ? 1 : Math.max(0, 1 + Math.tanh(phi * (d - eps)));
  }
  return out;
}

/** Flat colours: edge-keeping smoothing, then the k most typical colours. */
function cel(raster, u, o, seed, { range = 30, saturate = 1.1, lift = 0 } = {}) {
  const passes = 1 + Math.round(o.smooth / 35);
  const smooth = bilateral(raster, Math.max(2, Math.round(2.5 * u)), range, passes);
  const palette = kmeansPalette(smooth, o.colors, { seed }).map((c) => tune(c, saturate, lift));
  return { flat: mapToPalette(smooth, palette), smooth };
}

/** A colour with more saturation and lightness. */
function tune([r, g, b], saturate = 1, lift = 0) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, clamp(s * saturate, 0, 1), clamp(l + lift, 0, 1));
}

function saturateRaster(r, amount, lift = 0) {
  const out = cloneRaster(r);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const [nr, ng, nb] = tune([o[i], o[i + 1], o[i + 2]], amount, lift);
    o[i] = nr; o[i + 1] = ng; o[i + 2] = nb;
  }
  return out;
}

/** The style's own background (`bg`: a raster or a colour) outside the person, with a soft edge. */
function withBackground(fg, mask, bg, o) {
  if (o.background === 'photo' || !mask) return fg;
  const back = Array.isArray(bg) || o.background === 'white' ? solid(fg.width, fg.height, o.background === 'white' ? [255, 255, 255] : bg) : bg;
  const soft = blurChannel(mask, fg.width, fg.height, 1.2);
  return mix(back, fg, soft);
}

const solid = (w, h, [r, g, b]) => {
  const out = createRaster(w, h);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return out;
};

function gradient(w, h, top, bottom) {
  const out = createRaster(w, h);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const c = [0, 1, 2].map((k) => top[k] + (bottom[k] - top[k]) * t);
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  }
  return out;
}

/** Paper tone multiplied by grain (texture 0…100). */
function paper(w, h, seed, tone, texture) {
  const grain = paperTexture(w, h, seed);
  const out = createRaster(w, h);
  const d = out.data;
  const k = texture / 100;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const f = 1 - k * 0.22 * (1 - grain[p] * 1.6);
    d[i] = clamp(tone[0] * f, 0, 255); d[i + 1] = clamp(tone[1] * f, 0, 255); d[i + 2] = clamp(tone[2] * f, 0, 255); d[i + 3] = 255;
  }
  return out;
}

/** Multiplies a texture (0…1, around 0.5) into a raster by `amount` 0…100. */
function textured(r, tex, amount) {
  if (amount <= 0) return r;
  const out = cloneRaster(r);
  const o = out.data;
  const k = amount / 100;
  for (let i = 0, p = 0; i < o.length; i += 4, p++) {
    const f = 1 + k * 0.35 * (tex[p] - 0.5);
    o[i] = o[i] * f; o[i + 1] = o[i + 1] * f; o[i + 2] = o[i + 2] * f;
  }
  return out;
}

/** Halftone dots (black) where the picture is darker than their size allows: comic shading. */
function halftoneShade(r, gray, cell, angle, strength, ink = [20, 20, 30], below = 0.65) {
  const out = cloneRaster(r);
  const o = out.data;
  const w = r.width;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let p = 0; p < gray.length; p++) {
    const x = p % w;
    const y = (p - x) / w;
    const L = gray[p] / 255;
    if (L >= below) continue;
    const u = (x * c + y * s) / cell;
    const v = (-x * s + y * c) / cell;
    const du = u - Math.round(u);
    const dv = v - Math.round(v);
    const dist = Math.sqrt(du * du + dv * dv);
    const radius = Math.sqrt((below - L) / below) * 0.62 * strength;
    const t = clamp((radius - dist) * cell * 0.9 + 0.5, 0, 1);
    if (t <= 0) continue;
    const i = p * 4;
    o[i] += (ink[0] - o[i]) * t; o[i + 1] += (ink[1] - o[i + 1]) * t; o[i + 2] += (ink[2] - o[i + 2]) * t;
  }
  return out;
}

/** Soft round spots added into a raster (blush, sparkles). */
function spot(r, x, y, radius, color, alpha) {
  const w = r.width;
  const h = r.height;
  const d = r.data;
  for (let yy = Math.max(0, Math.floor(y - radius)); yy < Math.min(h, Math.ceil(y + radius)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - radius)); xx < Math.min(w, Math.ceil(x + radius)); xx++) {
      const t = Math.hypot(xx - x, yy - y) / radius;
      if (t >= 1) continue;
      const a = alpha * (1 - t * t) ** 1.5;
      const i = (yy * w + xx) * 4;
      d[i] += (color[0] - d[i]) * a; d[i + 1] += (color[1] - d[i + 1]) * a; d[i + 2] += (color[2] - d[i + 2]) * a;
    }
  }
}

/** A white outline (sticker border) around the person on a background. */
function stickerEdge(fg, mask, u, width = 3, color = [255, 255, 255]) {
  if (!mask) return fg;
  const w = fg.width;
  const h = fg.height;
  const grown = morph(mask, w, h, Math.max(1, Math.round(width * u)), 'max');
  const ring = new Float32Array(mask.length);
  for (let i = 0; i < ring.length; i++) ring[i] = clamp(grown[i] - mask[i], 0, 1);
  const softRing = blurChannel(ring, w, h, 0.8);
  return mix(fg, solid(w, h, color), softRing);
}

const PASTELS = [[255, 222, 230], [214, 236, 255], [222, 247, 225], [255, 241, 207], [234, 225, 255], [210, 245, 242], [255, 228, 210]];
const VIVID = [[255, 214, 0], [0, 200, 255], [255, 64, 129], [124, 77, 255], [0, 230, 118], [255, 145, 0]];
const POP_PALETTES = [
  [[24, 24, 48], [255, 46, 99], [255, 211, 42], [255, 249, 240]],
  [[20, 34, 74], [0, 184, 212], [255, 128, 171], [255, 255, 220]],
  [[46, 16, 64], [255, 87, 34], [124, 255, 178], [250, 250, 255]],
  [[10, 40, 30], [233, 30, 99], [3, 218, 197], [255, 245, 157]],
];
const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];

// ───────────────────────── styles

export const STYLES = [
  {
    id: 'cartoon', icon: 'stCartoon',
    warp: { head: 1.35, eyes: 1.3, nose: 1.25, mouth: 1.15, chin: 1.05, jaw: 1, forehead: 1.05, ears: 1.05 },
    options: { lines: 1.5, detail: 55, colors: 10, smooth: 60, texture: 0, background: 'photo' },
    render({ raster, mask, u, o, seed }) {
      const { flat, smooth } = cel(raster, u, o, seed, { saturate: 1.18 });
      const lines = outlines(toGray(smooth), raster.width, raster.height, u, o);
      const art = lines ? multiplyBy(flat, lines, [28, 22, 30]) : flat;
      return withBackground(art, mask, [235, 242, 250], o);
    },
  },
  {
    id: 'bighead', icon: 'stBigHead',
    warp: { head: 1.75, eyes: 1.25, nose: 1.2, mouth: 1.2, chin: 1, jaw: 0.95, forehead: 1.08, ears: 1.1 },
    options: { lines: 2, detail: 45, colors: 8, smooth: 70, texture: 0, background: 'style' },
    render({ raster, mask, u, o, seed, random }) {
      const { flat, smooth } = cel(raster, u, o, seed, { saturate: 1.25, lift: 0.02 });
      const lines = outlines(toGray(smooth), raster.width, raster.height, u, o);
      let art = lines ? multiplyBy(flat, lines, [30, 25, 35]) : flat;
      art = stickerEdge(art, mask, u, 5);
      const c = pick(PASTELS, random);
      return withBackground(art, mask, gradient(raster.width, raster.height, tune(c, 1.2, 0.04), tune(c, 1.4, -0.08)), o);
    },
  },
  {
    id: 'sketch', icon: 'stSketch',
    warp: { head: 1.25, eyes: 1.15, nose: 1.4, mouth: 1.15, chin: 1.15, jaw: 1.05, forehead: 1.1, ears: 1.1 },
    options: { lines: 1, detail: 70, colors: 2, smooth: 20, texture: 55, background: 'style' },
    render({ raster, mask, u, o, seed }) {
      const w = raster.width;
      const h = raster.height;
      const gray = toGray(o.smooth > 0 ? bilateral(raster, 2, 24, 1) : raster);
      // Colour dodge of the picture with its blurred negative: soft pencil shading.
      const inverse = gray.map((v) => 255 - v);
      const blurred = blurChannel(inverse, w, h, (3 + o.smooth / 25) * u);
      const shade = new Float32Array(w * h);
      for (let i = 0; i < shade.length; i++) shade[i] = clamp((gray[i] * 255) / Math.max(1, 255 - blurred[i]), 0, 255);
      // Hatching: diagonal strokes in the darker tones.
      const noise = valueNoise(seed);
      for (let p = 0; p < shade.length; p++) {
        const x = p % w;
        const y = (p - x) / w;
        const tone = shade[p] / 255;
        if (tone < 0.82) {
          const stroke = Math.abs(((x + y + noise(x, y, 3) * 6) / (3.2 * u)) % 2 - 1);
          shade[p] *= 1 - (0.82 - tone) * 0.55 * (stroke < 0.35 ? 1 : 0.15);
        }
      }
      const lines = outlines(gray, w, h, u, o, { extra: -0.002 });
      if (lines) for (let i = 0; i < shade.length; i++) shade[i] *= 0.35 + 0.65 * lines[i];
      const art = textured(grayToRaster(shade, w, h), paperTexture(w, h, seed), o.texture);
      return withBackground(art, mask, paper(w, h, seed, [250, 248, 242], o.texture), o);
    },
  },
  {
    id: 'comic', icon: 'stComic',
    warp: { head: 1.3, eyes: 1.2, nose: 1.25, mouth: 1.25, chin: 1.3, jaw: 1.2, forehead: 1, ears: 1 },
    options: { lines: 2.5, detail: 50, colors: 6, smooth: 55, texture: 0, background: 'style' },
    render({ raster, mask, u, o, seed, random, features }) {
      const { flat, smooth } = cel(raster, u, o, seed, { saturate: 1.45 });
      const gray = toGray(smooth);
      let art = halftoneShade(flat, gray, Math.max(4, 5 * u), Math.PI / 4, 1);
      const lines = outlines(gray, raster.width, raster.height, u, o);
      if (lines) art = multiplyBy(art, lines, [10, 10, 20]);
      art = stickerEdge(art, mask, u, 3, [20, 20, 30]);
      // A flat comic-panel colour with a light halftone dot screen (no burst rays).
      const a = tune(pick(VIVID, random), 0.85, 0.12);
      const screen = halftoneShade(solid(raster.width, raster.height, a), new Float32Array(raster.width * raster.height).fill(150), Math.max(5, 8 * u), Math.PI / 4, 0.5, tune(a, 1.1, -0.15), 0.9);
      return withBackground(art, mask, screen, o);
    },
  },
  {
    id: 'popart', icon: 'stPopArt',
    warp: { head: 1.3, eyes: 1.3, nose: 1.1, mouth: 1.25, chin: 1.05, jaw: 1, forehead: 1, ears: 1 },
    options: { lines: 2, detail: 40, colors: 4, smooth: 60, texture: 0, background: 'style' },
    render({ raster, mask, u, o, random }) {
      const w = raster.width;
      const h = raster.height;
      const smooth = bilateral(raster, Math.max(2, Math.round(2.5 * u)), 34, 2);
      const gray = toGray(smooth);
      const palette = pick(POP_PALETTES, random);
      const levels = clamp(o.colors, 2, 6);
      // Tones by rank (equalised), so every picture uses all of the palette.
      const sorted = Float32Array.from(gray).sort();
      const cuts = Array.from({ length: levels - 1 }, (_, i) => sorted[Math.floor(((i + 1) / levels) * (sorted.length - 1))]);
      const out = createRaster(w, h);
      const d = out.data;
      for (let p = 0; p < gray.length; p++) {
        let k = 0;
        while (k < cuts.length && gray[p] > cuts[k]) k++;
        const c = palette[Math.min(palette.length - 1, Math.round((k / Math.max(1, levels - 1)) * (palette.length - 1)))];
        const i = p * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
      const lines = outlines(gray, w, h, u, o);
      const art = lines ? multiplyBy(out, lines, palette[0]) : out;
      const bgColor = pick(VIVID.filter((c) => !palette.some((p) => p[0] === c[0] && p[1] === c[1])), random);
      return withBackground(art, mask, halftoneShade(solid(w, h, bgColor), new Float32Array(w * h).fill(120), Math.max(6, 9 * u), 0.3, 0.6, tune(bgColor, 1, -0.2), 0.9), o);
    },
  },
  {
    id: 'watercolor', icon: 'stWatercolor',
    warp: { head: 1.3, eyes: 1.25, nose: 1.15, mouth: 1.2, chin: 1.05, jaw: 1, forehead: 1.05, ears: 1 },
    options: { lines: 1, detail: 45, colors: 14, smooth: 60, texture: 60, background: 'style' },
    render({ raster, mask, u, o, seed }) {
      const w = raster.width;
      const h = raster.height;
      const { flat } = cel(raster, u, o, seed, { range: 34, saturate: 1.3, lift: 0.03 });
      // Pigment bleeding: the flat colours blurred and pushed around by noise.
      const noise = valueNoise(seed + 3);
      const blurred = blurRaster(flat, 1.1 * u);
      const bled = createRaster(w, h);
      const px = new Float32Array(4);
      const amp = 2.5 * u;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = x + (noise(x, y, 18 * u) - 0.5) * amp * 2;
          const ny = y + (noise(x + 97, y + 31, 18 * u) - 0.5) * amp * 2;
          const xi = clamp(Math.round(nx), 0, w - 1);
          const yi = clamp(Math.round(ny), 0, h - 1);
          const j = (yi * w + xi) * 4;
          px[0] = blurred.data[j]; px[1] = blurred.data[j + 1]; px[2] = blurred.data[j + 2];
          const i = (y * w + x) * 4;
          bled.data[i] = px[0]; bled.data[i + 1] = px[1]; bled.data[i + 2] = px[2]; bled.data[i + 3] = 255;
        }
      }
      // Edge darkening where colours meet (pigment pools at the rim of a wash).
      const { mag } = sobel(toGray(flat), w, h);
      const edge = blurChannel(mag, w, h, 1.2 * u);
      const pooled = multiplyBy(bled, edge.map((m) => 1 - clamp(m / 900, 0, 0.35)), [60, 40, 70]);
      // Washed out towards white like thin paint.
      const light = mix(pooled, solid(w, h, [255, 253, 248]), 0.05);
      const tex = paperTexture(w, h, seed, 1.4);
      let art = textured(light, tex, o.texture);
      const lines = outlines(toGray(raster), w, h, u, o);
      if (lines) art = multiplyBy(art, lines.map((v) => 0.3 + 0.7 * v), [70, 45, 40]);
      return withBackground(art, mask, textured(paper(w, h, seed, [250, 246, 236], 0), tex, o.texture), o);
    },
  },
  {
    id: 'ink', icon: 'stInk',
    warp: { head: 1.25, eyes: 1.15, nose: 1.45, mouth: 1.2, chin: 1.2, jaw: 1.1, forehead: 1.1, ears: 1.15 },
    options: { lines: 1.5, detail: 65, colors: 2, smooth: 40, texture: 0, background: 'style' },
    render({ raster, mask, u, o, random }) {
      const w = raster.width;
      const h = raster.height;
      const smooth = o.smooth > 0 ? bilateral(raster, 2, 26, 1 + Math.round(o.smooth / 50)) : raster;
      const gray = toGray(smooth);
      const lines = outlines(gray, w, h, u, { ...o, lines: Math.max(0.5, o.lines) }) ?? new Float32Array(w * h).fill(1);
      // Stippling in the shadows: dots, denser where darker.
      const ink = new Float32Array(w * h);
      const shade = blurChannel(gray, w, h, 1.5 * u);
      for (let p = 0; p < ink.length; p++) {
        const L = shade[p] / 255;
        const dot = L < 0.45 && random() < (0.45 - L) * 1.6 ? 0 : 1;
        ink[p] = Math.min(lines[p], dot, L < 0.12 ? 0 : 1);
      }
      return withBackground(grayToRaster(ink.map((v) => 12 + v * 240), w, h), mask, [252, 252, 250], o);
    },
  },
  {
    id: 'oil', icon: 'stOil',
    warp: { head: 1.25, eyes: 1.2, nose: 1.3, mouth: 1.15, chin: 1.1, jaw: 1.05, forehead: 1.05, ears: 1 },
    options: { lines: 0.5, detail: 30, colors: 16, smooth: 60, texture: 60, background: 'photo' },
    render({ raster, mask, u, o, seed }) {
      const w = raster.width;
      const h = raster.height;
      let art = kuwahara(raster, Math.max(2, Math.round((3 + o.smooth / 25) * u)));
      art = saturateRaster(art, 1.25);
      // Canvas weave and brush relief.
      const weave = new Float32Array(w * h);
      const noise = valueNoise(seed);
      for (let p = 0; p < weave.length; p++) {
        const x = p % w;
        const y = (p - x) / w;
        weave[p] = 0.5 + 0.25 * Math.sin(x * 1.9) * Math.sin(y * 1.9) + 0.25 * (noise(x, y, 4) - 0.5);
      }
      art = textured(art, weave, o.texture);
      const lines = outlines(toGray(art), w, h, u, o);
      if (lines) art = multiplyBy(art, lines.map((v) => 0.5 + 0.5 * v), [40, 30, 25]);
      return withBackground(art, mask, [96, 72, 52], o);
    },
  },
  {
    id: 'chibi', icon: 'stChibi',
    warp: { head: 1.95, eyes: 1.7, nose: 0.6, mouth: 0.75, chin: 0.7, jaw: 0.85, forehead: 1.15, ears: 0.95 },
    options: { lines: 1.5, detail: 35, colors: 7, smooth: 80, texture: 0, background: 'style' },
    render({ raster, mask, u, o, seed, random, features }) {
      const { flat, smooth } = cel(raster, u, o, seed, { saturate: 1.15, lift: 0.07 });
      const lines = outlines(toGray(smooth), raster.width, raster.height, u, o);
      let art = lines ? multiplyBy(flat, lines, [110, 60, 70]) : flat;
      art = cloneRaster(art);
      // Rosy cheeks and a sparkle in each eye.
      const f = features;
      for (const [i, side] of [[0, -1], [1, 1]]) {
        const e = f.eyes[i];
        spot(art, e.x + side * e.r * 0.7, e.y + f.face.ry * 0.28, f.face.rx * 0.2, [255, 120, 140], 0.38);
        spot(art, e.x - e.r * 0.25, e.y - e.r * 0.3, Math.max(2, e.r * 0.28), [255, 255, 255], 0.95);
        spot(art, e.x + e.r * 0.25, e.y + e.r * 0.2, Math.max(1.5, e.r * 0.13), [255, 255, 255], 0.85);
      }
      art = stickerEdge(art, mask, u, 4);
      const c = pick(PASTELS, random);
      const bg = gradient(raster.width, raster.height, tune(c, 1, 0.05), tune(c, 1.3, -0.04));
      // Little stars on the background.
      for (let s = 0; s < 26; s++) spot(bg, random() * raster.width, random() * raster.height, (2 + random() * 5) * u, [255, 255, 255], 0.9);
      return withBackground(art, mask, bg, o);
    },
  },
  {
    id: 'charcoal', icon: 'stCharcoal',
    warp: { head: 1.3, eyes: 1.15, nose: 1.4, mouth: 1.2, chin: 1.2, jaw: 1.25, forehead: 1.1, ears: 1.1 },
    options: { lines: 2, detail: 55, colors: 2, smooth: 30, texture: 80, background: 'style' },
    render({ raster, mask, u, o, seed }) {
      const w = raster.width;
      const h = raster.height;
      const gray = toGray(o.smooth > 0 ? bilateral(raster, 2, 26, 1) : raster);
      const blurred = blurChannel(gray, w, h, 1.4 * u);
      const grain = paperTexture(w, h, seed, 0.8);
      const tone = new Float32Array(w * h);
      for (let p = 0; p < tone.length; p++) {
        // Strong contrast, smudged; the grain shows through the dark strokes.
        let L = blurred[p] / 255;
        L = clamp((L - 0.5) * 1.6 + 0.55, 0, 1);
        L = L + (1 - L) * (grain[p] - 0.45) * (o.texture / 100) * 0.9;
        tone[p] = clamp(L, 0, 1);
      }
      const lines = outlines(gray, w, h, u, o, { phi: 160 });
      if (lines) for (let p = 0; p < tone.length; p++) tone[p] *= 0.25 + 0.75 * lines[p];
      const ink = [34, 30, 30];
      const sheet = [236, 228, 212];
      const out = createRaster(w, h);
      const d = out.data;
      for (let p = 0; p < tone.length; p++) {
        const t = tone[p];
        const i = p * 4;
        d[i] = ink[0] + (sheet[0] - ink[0]) * t; d[i + 1] = ink[1] + (sheet[1] - ink[1]) * t; d[i + 2] = ink[2] + (sheet[2] - ink[2]) * t; d[i + 3] = 255;
      }
      return withBackground(out, mask, paper(w, h, seed, sheet, o.texture), o);
    },
  },
  // ── more styles (not in the first ten)
  {
    id: 'pixel', icon: 'stPixel',
    warp: { head: 1.4, eyes: 1.35, nose: 1.1, mouth: 1.15, chin: 1, jaw: 1, forehead: 1, ears: 1 },
    options: { lines: 1, detail: 50, colors: 14, smooth: 40, texture: 0, background: 'photo' },
    render({ raster, u, o, seed, mask }) {
      const w = raster.width;
      const h = raster.height;
      const block = Math.max(3, Math.round((5 + (100 - o.detail) / 20) * u));
      const smooth = bilateral(raster, 2, 30, 1 + Math.round(o.smooth / 50));
      const palette = kmeansPalette(smooth, o.colors, { seed }).map((c) => tune(c, 1.2));
      const out = createRaster(w, h);
      const d = out.data;
      const s = smooth.data;
      for (let by = 0; by < h; by += block) {
        for (let bx = 0; bx < w; bx += block) {
          let r = 0; let g = 0; let b = 0; let n = 0;
          for (let y = by; y < Math.min(h, by + block); y++) for (let x = bx; x < Math.min(w, bx + block); x++) { const i = (y * w + x) * 4; r += s[i]; g += s[i + 1]; b += s[i + 2]; n++; }
          const c = palette.reduce((best, p) => ((p[0] - r / n) ** 2 + (p[1] - g / n) ** 2 + (p[2] - b / n) ** 2 < (best[0] - r / n) ** 2 + (best[1] - g / n) ** 2 + (best[2] - b / n) ** 2 ? p : best), palette[0]);
          for (let y = by; y < Math.min(h, by + block); y++) for (let x = bx; x < Math.min(w, bx + block); x++) {
            const i = (y * w + x) * 4;
            const edge = o.lines > 0 && (x === bx || y === by) ? 0.92 : 1;
            d[i] = c[0] * edge; d[i + 1] = c[1] * edge; d[i + 2] = c[2] * edge; d[i + 3] = 255;
          }
        }
      }
      return withBackground(out, mask, [40, 44, 72], o);
    },
  },
  {
    id: 'neon', icon: 'stNeon',
    warp: { head: 1.35, eyes: 1.3, nose: 1.2, mouth: 1.2, chin: 1.1, jaw: 1.05, forehead: 1.05, ears: 1 },
    options: { lines: 2, detail: 55, colors: 6, smooth: 50, texture: 0, background: 'style' },
    render({ raster, mask, u, o, seed, random }) {
      const w = raster.width;
      const h = raster.height;
      const smooth = bilateral(raster, 2, 28, 1 + Math.round(o.smooth / 40));
      const lines = outlines(toGray(smooth), w, h, u, { ...o, lines: Math.max(1, o.lines) }) ?? new Float32Array(w * h).fill(1);
      const glow = blurChannel(lines.map((v) => 1 - v), w, h, 3 * u);
      const hue0 = random();
      const out = createRaster(w, h);
      const d = out.data;
      const s = smooth.data;
      for (let p = 0; p < lines.length; p++) {
        const x = p % w;
        const y = (p - x) / w;
        const [r, g, b] = hslToRgb((hue0 + x / w * 0.35 + y / h * 0.25) % 1, 1, 0.6);
        const core = 1 - lines[p];
        const g2 = clamp(glow[p] * 2.2, 0, 1);
        const m = (mask?.[p] ?? 1) * 0.16;
        const i = p * 4;
        d[i] = clamp(10 + s[i] * m + r * g2 * 0.8 + 255 * core * 0.9, 0, 255);
        d[i + 1] = clamp(8 + s[i + 1] * m + g * g2 * 0.8 + 255 * core * 0.9, 0, 255);
        d[i + 2] = clamp(24 + s[i + 2] * m + b * g2 * 0.8 + 255 * core * 0.9, 0, 255);
        d[i + 3] = 255;
      }
      return out;
    },
  },
  {
    id: 'clay', icon: 'stClay',
    warp: { head: 1.5, eyes: 1.35, nose: 1.3, mouth: 1.1, chin: 0.95, jaw: 1.1, forehead: 1.05, ears: 1.15 },
    options: { lines: 0, detail: 40, colors: 9, smooth: 85, texture: 20, background: 'style' },
    render({ raster, mask, u, o, seed, random }) {
      const w = raster.width;
      const h = raster.height;
      const { flat } = cel(raster, u, o, seed, { range: 36, saturate: 1.35, lift: 0.03 });
      // Height from lightness, lit from the top left: plasticine relief.
      const height = blurChannel(toGray(flat), w, h, 3 * u);
      const lit = cloneRaster(flat);
      const d = lit.data;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          const nx = height[p - 1] - height[p + 1];
          const ny = height[p - w] - height[p + w];
          const light = clamp(1 + (nx + ny) * 0.018, 0.6, 1.45);
          const i = p * 4;
          d[i] = clamp(d[i] * light, 0, 255); d[i + 1] = clamp(d[i + 1] * light, 0, 255); d[i + 2] = clamp(d[i + 2] * light, 0, 255);
        }
      }
      const art = textured(lit, paperTexture(w, h, seed, 0.6), o.texture);
      const c = pick(PASTELS, random);
      return withBackground(art, mask, gradient(w, h, tune(c, 1.1, 0.06), tune(c, 1.2, -0.12)), o);
    },
  },
  {
    id: 'vintage', icon: 'stVintage',
    warp: { head: 1.3, eyes: 1.2, nose: 1.3, mouth: 1.2, chin: 1.15, jaw: 1.05, forehead: 1.1, ears: 1.05 },
    options: { lines: 1, detail: 45, colors: 5, smooth: 45, texture: 70, background: 'photo' },
    render({ raster, u, o, seed, mask }) {
      const w = raster.width;
      const h = raster.height;
      const smooth = bilateral(raster, 2, 28, 1 + Math.round(o.smooth / 40));
      const gray = toGray(smooth);
      const dark = [40, 52, 70];
      const light = [242, 226, 192];
      const levels = clamp(o.colors, 2, 12);
      let out = createRaster(w, h);
      const d = out.data;
      for (let p = 0; p < gray.length; p++) {
        const t = Math.round((gray[p] / 255) * (levels - 1)) / (levels - 1);
        const i = p * 4;
        d[i] = dark[0] + (light[0] - dark[0]) * t; d[i + 1] = dark[1] + (light[1] - dark[1]) * t; d[i + 2] = dark[2] + (light[2] - dark[2]) * t; d[i + 3] = 255;
      }
      out = halftoneShade(out, gray, Math.max(3, 4 * u), 0.26, 0.8, dark, 0.5);
      const lines = outlines(gray, w, h, u, o);
      if (lines) out = multiplyBy(out, lines, dark);
      out = textured(out, paperTexture(w, h, seed), o.texture);
      return withBackground(out, mask, light, o);
    },
  },
  {
    id: 'manga', icon: 'stManga',
    warp: { head: 1.35, eyes: 1.5, nose: 0.8, mouth: 0.9, chin: 0.85, jaw: 0.9, forehead: 1.05, ears: 1 },
    options: { lines: 1.5, detail: 50, colors: 3, smooth: 65, texture: 0, background: 'style' },
    render({ raster, mask, u, o, features }) {
      const w = raster.width;
      const h = raster.height;
      const smooth = bilateral(raster, Math.max(2, Math.round(2.5 * u)), 30, 2 + Math.round(o.smooth / 50));
      const gray = toGray(smooth);
      // White, screen tone and black: the three values of a manga page.
      const levels = clamp(o.colors, 2, 4);
      const sorted = Float32Array.from(gray).sort();
      const black = sorted[Math.floor(sorted.length * 0.12)];
      const tone = sorted[Math.floor(sorted.length * (levels >= 3 ? 0.45 : 0.12))];
      let out = createRaster(w, h);
      const d = out.data;
      for (let p = 0; p < gray.length; p++) {
        const v = gray[p] <= black ? 20 : 255;
        const i = p * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
      out = halftoneShade(out, gray.map((v) => (v > black && v <= tone ? 90 : 255)), Math.max(3, 3.6 * u), Math.PI / 4, 0.9, [20, 20, 20], 0.6);
      const lines = outlines(gray, w, h, u, o);
      if (lines) out = multiplyBy(out, lines, [10, 10, 10]);
      for (const e of features.eyes) {
        spot(out, e.x - e.r * 0.3, e.y - e.r * 0.3, Math.max(2, e.r * 0.3), [255, 255, 255], 1);
      }
      // Speed lines behind the head.
      const bg = createRaster(w, h);
      const b = bg.data;
      for (let p = 0; p < w * h; p++) {
        const x = p % w;
        const y = (p - x) / w;
        const ang = Math.atan2(y - features.face.cy, x - features.face.cx);
        const k = Math.abs(Math.sin(ang * 60)) > 0.97 ? 120 : 250;
        const i = p * 4;
        b[i] = k; b[i + 1] = k; b[i + 2] = k; b[i + 3] = 255;
      }
      return withBackground(out, mask, bg, o);
    },
  },
  {
    id: 'colorpencil', icon: 'stColorPencil',
    warp: { head: 1.3, eyes: 1.25, nose: 1.25, mouth: 1.2, chin: 1.1, jaw: 1.05, forehead: 1.05, ears: 1.05 },
    options: { lines: 1, detail: 60, colors: 12, smooth: 30, texture: 65, background: 'style' },
    render({ raster, mask, u, o, seed }) {
      const w = raster.width;
      const h = raster.height;
      const base = bilateral(raster, 2, 26, 1 + Math.round(o.smooth / 40));
      const out = cloneRaster(base);
      const d = out.data;
      // Each channel dodged like a pencil sketch, then strokes in two directions.
      for (let c = 0; c < 3; c++) {
        const ch = new Float32Array(w * h);
        for (let p = 0; p < ch.length; p++) ch[p] = d[p * 4 + c];
        const blurred = blurChannel(ch.map((v) => 255 - v), w, h, 5 * u);
        for (let p = 0; p < ch.length; p++) d[p * 4 + c] = clamp((ch[p] * 255) / Math.max(1, 255 - blurred[p] * 0.9), 0, 255);
      }
      const noise = valueNoise(seed);
      for (let p = 0; p < w * h; p++) {
        const x = p % w;
        const y = (p - x) / w;
        const s1 = Math.abs(((x * 0.8 + y + noise(x, y, 4) * 5) / (2.6 * u)) % 2 - 1);
        const s2 = Math.abs(((x - y * 0.7 + noise(y, x, 4) * 5) / (3.1 * u)) % 2 - 1);
        const f = 1 - (o.texture / 100) * 0.16 * ((s1 < 0.3 ? 1 : 0) + (s2 < 0.25 ? 0.6 : 0));
        const i = p * 4;
        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      }
      const art = saturateRaster(out, 1.25);
      const lines = outlines(toGray(base), w, h, u, o);
      const drawn = lines ? multiplyBy(art, lines.map((v) => 0.4 + 0.6 * v), [60, 50, 80]) : art;
      return withBackground(drawn, mask, paper(w, h, seed, [252, 250, 244], o.texture), o);
    },
  },
];

// The other twenty-four (styles-more.js) with the helpers above.
STYLES.push(...moreStyles({ outlines, cel, tune, saturateRaster, withBackground, solid, gradient, paper, textured, halftoneShade, spot, stickerEdge, blurRaster, PASTELS, VIVID, pick }));

export const STYLE_IDS = STYLES.map((s) => s.id);
/** Every style is drawn for a new photo (Settings › Caricature narrows the set). */
export const DEFAULT_STYLE_IDS = [...STYLE_IDS];
/** The classic ten (the style chooser's "Classic 10" button). */
export const CLASSIC_STYLE_IDS = STYLE_IDS.slice(0, 10);
export const styleById = (id) => STYLES.find((s) => s.id === id) ?? STYLES[0];

/** A style's options with gaps filled and values clamped. */
export function normalizeOptions(styleId, raw = {}) {
  const base = styleById(styleId).options;
  const out = { ...base };
  for (const key of Object.keys(STYLE_OPTION_RANGE)) {
    const v = Number(raw?.[key]);
    if (Number.isFinite(v)) out[key] = clamp(v, STYLE_OPTION_RANGE[key].min, STYLE_OPTION_RANGE[key].max);
  }
  out.colors = Math.round(out.colors);
  out.background = BACKGROUNDS.includes(raw?.background) ? raw.background : base.background;
  return out;
}

/** A person mask (0…1) from the features alone: head ellipse, neck and shoulders (no model). */
export function maskFromFeatures(width, height, f) {
  const mask = new Float32Array(width * height);
  const { cx, cy, rx, ry } = f.face;
  const c = Math.cos(f.face.angle ?? 0);
  const s = Math.sin(f.face.angle ?? 0);
  const neckTop = cy + ry * 0.75;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * c + dy * s) / (rx * 1.12);
      const v = (-dx * s + dy * c) / (ry * 1.08);
      let m = clamp((1 - Math.hypot(u, v)) * 6 + 0.5, 0, 1);
      if (y > neckTop) {
        // Neck, then shoulders widening down to the bottom.
        const t = (y - neckTop) / Math.max(1, height - neckTop);
        const half = rx * (0.55 + Math.min(1, t * 3) * 1.6);
        m = Math.max(m, clamp((half - Math.abs(x - cx)) / (rx * 0.12) + 0.5, 0, 1));
      }
      mask[y * width + x] = m;
    }
  }
  return mask;
}

/** The mean colour of the face (skin) area: used by effects that need a matching tone. */
export const faceColor = (raster, mask) => meanColor(raster, mask, 0.6);

export { parseColor };
