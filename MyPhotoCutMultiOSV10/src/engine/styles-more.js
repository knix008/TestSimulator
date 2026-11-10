// Twenty-four more caricature styles (styles.js has the first sixteen and the shared helpers,
// handed in as `k` so the two files do not import each other). Same render contract:
//   render({ raster, gray?, mask, features, random, seed, o, u }) → raster
import {
  bilateral, blurChannel, clamp, cloneRaster, createRaster, grayToRaster, kmeansPalette, kuwahara, mapToPalette, morph, multiplyBy,
  paperTexture, resize, sobel, toGray, valueNoise,
} from './raster.js';

export function moreStyles(k) {
  const { outlines, cel, tune, saturateRaster, withBackground, solid, gradient, paper, textured, stickerEdge, blurRaster, PASTELS, VIVID, pick } = k;
  const W = { head: 1.3, eyes: 1.25, nose: 1.2, mouth: 1.15, chin: 1.05, jaw: 1, forehead: 1.05, ears: 1.05 };
  const opts = (o) => ({ lines: 1.5, detail: 50, colors: 8, smooth: 50, texture: 0, background: 'style', ...o });

  /** Colours of a raster replaced by a function of its lightness 0…1. */
  const toneMap = (r, fn) => {
    const out = createRaster(r.width, r.height);
    const g = toGray(r);
    for (let p = 0; p < g.length; p++) { const c = fn(g[p] / 255, p); const i = p * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; }
    return out;
  };
  /** Thick dark lines where flat colour areas meet (stained glass lead, cel outlines). */
  const regionEdges = (flat, u, width = 1.5) => {
    const { mag } = sobel(toGray(flat), flat.width, flat.height);
    const edge = mag.map((m) => (m > 30 ? 0 : 1));
    return morph(edge, flat.width, flat.height, Math.max(1, Math.round(width * u)), 'min');
  };
  /** Average colour inside triangles of a jittered grid (low poly). */
  const triangles = (r, cell, random, jitter = 0.35) => {
    const w = r.width;
    const h = r.height;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const pts = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const edge = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
      pts.push([Math.min(w, i * cell + (edge ? 0 : (random() - 0.5) * cell * jitter * 2)), Math.min(h, j * cell + (edge ? 0 : (random() - 0.5) * cell * jitter * 2))]);
    }
    const out = createRaster(w, h);
    const s = r.data;
    const fill = (a, b, c) => {
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-6) return;
      const inside = (x, y) => {
        const w0 = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area;
        const w1 = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area;
        return w0 >= -0.001 && w1 >= -0.001 && 1 - w0 - w1 >= -0.001;
      };
      let rr = 0; let gg = 0; let bb = 0; let n = 0;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (inside(x + 0.5, y + 0.5)) { const i = (y * w + x) * 4; rr += s[i]; gg += s[i + 1]; bb += s[i + 2]; n++; }
      if (!n) return;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (inside(x + 0.5, y + 0.5)) { const i = (y * w + x) * 4; out.data[i] = rr / n; out.data[i + 1] = gg / n; out.data[i + 2] = bb / n; out.data[i + 3] = 255; }
    };
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const p00 = pts[j * cols + i]; const p10 = pts[j * cols + i + 1]; const p01 = pts[(j + 1) * cols + i]; const p11 = pts[(j + 1) * cols + i + 1];
      if ((i + j) % 2) { fill(p00, p10, p11); fill(p00, p11, p01); } else { fill(p00, p10, p01); fill(p10, p11, p01); }
    }
    return out;
  };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => {
    const x = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return lerp3(stops[i], stops[i + 1], x - i);
  };

  return [
    {
      id: 'mosaic', icon: 'stMosaic', warp: W, options: opts({ lines: 1, detail: 50, colors: 16, smooth: 40 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const tile = Math.max(6, Math.round((9 + (100 - o.detail) / 10) * u));
        const palette = kmeansPalette(raster, o.colors, { seed }).map((c) => tune(c, 1.25));
        const small = mapToPalette(resize(bilateral(raster, 2, 28, 1), Math.ceil(w / tile), Math.ceil(h / tile)), palette);
        const out = createRaster(w, h);
        const grout = [235, 230, 220];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4; const tx = Math.floor(x / tile); const ty = Math.floor(y / tile);
          const j = (ty * small.width + tx) * 4;
          const edge = x % tile === 0 || y % tile === 0;
          const shade = 1 - 0.12 * ((x % tile) + (y % tile)) / (2 * tile);
          const c = edge && o.lines > 0 ? grout : [small.data[j] * shade, small.data[j + 1] * shade, small.data[j + 2] * shade];
          out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
        }
        return withBackground(out, mask, out, { ...o, background: 'photo' });
      },
    },
    {
      id: 'stainedglass', icon: 'stStainedGlass', warp: W, options: opts({ lines: 2, colors: 10, smooth: 75 }),
      render({ raster, u, o, seed, mask }) {
        const { flat } = cel(raster, u, o, seed, { range: 40, saturate: 1.6, lift: 0.05 });
        const lead = regionEdges(flat, u, Math.max(0.5, o.lines * 0.7));
        const glow = blurChannel(toGray(flat), flat.width, flat.height, 6 * u);
        const lit = cloneRaster(flat);
        for (let p = 0; p < glow.length; p++) { const f = 0.85 + (glow[p] / 255) * 0.35; for (let c = 0; c < 3; c++) lit.data[p * 4 + c] = clamp(lit.data[p * 4 + c] * f, 0, 255); }
        return withBackground(multiplyBy(lit, lead, [25, 22, 30]), mask, [40, 30, 60], o);
      },
    },
    {
      id: 'woodcut', icon: 'stWoodcut', warp: { ...W, nose: 1.35, chin: 1.15, jaw: 1.15 }, options: opts({ lines: 1.5, detail: 55, colors: 2, smooth: 60, texture: 40 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const g = blurChannel(toGray(bilateral(raster, 2, 30, 2)), w, h, 1.2 * u);
        const noise = valueNoise(seed);
        const ink = [24, 18, 14]; const sheet = [238, 226, 200];
        const lines = outlines(g, w, h, u, o);
        const out = createRaster(w, h);
        for (let p = 0; p < g.length; p++) {
          const x = p % w; const y = (p - x) / w;
          const tone = g[p] / 255;
          const carve = Math.sin((y + Math.sin(x / (14 * u)) * 4 * u + noise(x, y, 10 * u) * 6 * u) / (3.4 * u)) * 0.5 + 0.5;
          let v = tone > 0.72 ? 1 : tone < 0.22 ? 0 : carve < tone ? 1 : 0;
          if (lines) v = Math.min(v, lines[p] > 0.5 ? 1 : 0);
          const c = v ? sheet : ink;
          out.data[p * 4] = c[0]; out.data[p * 4 + 1] = c[1]; out.data[p * 4 + 2] = c[2]; out.data[p * 4 + 3] = 255;
        }
        return withBackground(textured(out, paperTexture(w, h, seed), o.texture), mask, sheet, o);
      },
    },
    {
      id: 'engraving', icon: 'stEngraving', warp: { ...W, nose: 1.3 }, options: opts({ lines: 1, detail: 60, colors: 2, smooth: 40 }),
      render({ raster, u, o, mask }) {
        const w = raster.width; const h = raster.height;
        const g = blurChannel(toGray(raster), w, h, 1.5 * u);
        const ink = [60, 40, 25]; const sheet = [246, 238, 222];
        const period = Math.max(3, 4.2 * u);
        const out = createRaster(w, h);
        const lines = outlines(toGray(raster), w, h, u, o);
        for (let p = 0; p < g.length; p++) {
          const x = p % w; const y = (p - x) / w;
          const tone = g[p] / 255;
          const bend = Math.sin(x / (40 * u)) * 6 * u + tone * 8 * u;
          const s = Math.abs(((y + bend) / period) % 1 - 0.5) * 2;
          let v = s > 1 - tone * 1.1 ? 1 : 0;
          if (tone < 0.35) { const s2 = Math.abs(((x - y * 0.6) / period) % 1 - 0.5) * 2; if (s2 < 0.4) v = 0; }
          if (lines && lines[p] < 0.5) v = 0;
          const c = v ? sheet : ink;
          out.data[p * 4] = c[0]; out.data[p * 4 + 1] = c[1]; out.data[p * 4 + 2] = c[2]; out.data[p * 4 + 3] = 255;
        }
        return withBackground(out, mask, sheet, o);
      },
    },
    {
      id: 'crayon', icon: 'stCrayon', warp: W, options: opts({ lines: 1.5, colors: 9, smooth: 60, texture: 80 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const { flat } = cel(raster, u, o, seed, { saturate: 1.5, lift: 0.04 });
        const noise = valueNoise(seed + 5);
        const out = cloneRaster(flat);
        for (let p = 0; p < w * h; p++) {
          const x = p % w; const y = (p - x) / w;
          const stroke = noise(x * 0.5 + y, y * 3, 1.6 * u);
          const wax = stroke > 0.62 * (1 - o.texture / 300) ? 1 : 0.15;
          for (let c = 0; c < 3; c++) out.data[p * 4 + c] = 255 - (255 - out.data[p * 4 + c]) * (0.55 + 0.45 * wax);
        }
        const lines = outlines(toGray(flat), w, h, u, o);
        const art = lines ? multiplyBy(out, lines.map((v) => 0.3 + 0.7 * v), [40, 30, 60]) : out;
        return withBackground(art, mask, paper(w, h, seed, [252, 250, 240], o.texture), o);
      },
    },
    {
      id: 'pastel', icon: 'stPastel', warp: W, options: opts({ lines: 0.5, colors: 10, smooth: 70, texture: 70 }),
      render({ raster, u, o, seed, mask, random }) {
        const w = raster.width; const h = raster.height;
        const { flat } = cel(raster, u, o, seed, { saturate: 0.85, lift: 0.14 });
        const soft = blurRaster(flat, 1.2 * u);
        const chalk = paperTexture(w, h, seed + 2, 0.6);
        const art = textured(soft, chalk, o.texture);
        const lines = outlines(toGray(flat), w, h, u, o);
        const drawn = lines ? multiplyBy(art, lines.map((v) => 0.55 + 0.45 * v), [120, 90, 120]) : art;
        const tint = pick(PASTELS, random);
        return withBackground(drawn, mask, textured(solid(w, h, tint), chalk, 60), o);
      },
    },
    {
      id: 'gouache', icon: 'stGouache', warp: W, options: opts({ lines: 0, colors: 9, smooth: 80, texture: 30 }),
      render({ raster, u, o, seed, mask, random }) {
        const w = raster.width; const h = raster.height;
        const { flat } = cel(raster, u, o, seed, { range: 40, saturate: 1.3, lift: 0.02 });
        const opaque = kuwahara(flat, Math.max(2, Math.round(2 * u)));
        const art = textured(opaque, paperTexture(w, h, seed, 1.2), o.texture);
        const lines = outlines(toGray(flat), w, h, u, o);
        const drawn = lines ? multiplyBy(art, lines, [50, 40, 40]) : art;
        const c = pick(PASTELS, random);
        return withBackground(drawn, mask, solid(w, h, tune(c, 1.4, -0.06)), o);
      },
    },
    {
      id: 'marker', icon: 'stMarker', warp: W, options: opts({ lines: 2.5, colors: 7, smooth: 70 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const { flat } = cel(raster, u, o, seed, { saturate: 1.6, lift: 0.04 });
        const out = cloneRaster(flat);
        for (let p = 0; p < w * h; p++) {
          const x = p % w; const y = (p - x) / w;
          const band = Math.abs(((x + y * 0.3) / (9 * u)) % 1 - 0.5) < 0.06 ? 0.86 : 1;
          for (let c = 0; c < 3; c++) out.data[p * 4 + c] *= band;
        }
        const lines = outlines(toGray(flat), w, h, u, o);
        return withBackground(lines ? multiplyBy(out, lines, [15, 15, 20]) : out, mask, [255, 255, 255], o);
      },
    },
    {
      id: 'blueprint', icon: 'stBlueprint', warp: W, options: opts({ lines: 1.5, detail: 65, colors: 2, smooth: 40 }),
      render({ raster, u, o }) {
        const w = raster.width; const h = raster.height;
        const g = toGray(bilateral(raster, 2, 26, 1));
        const lines = outlines(g, w, h, u, { ...o, lines: Math.max(0.5, o.lines) }) ?? new Float32Array(w * h).fill(1);
        const blue = [22, 68, 140]; const white = [235, 245, 255];
        const grid = Math.max(12, 24 * u);
        const out = createRaster(w, h);
        for (let p = 0; p < w * h; p++) {
          const x = p % w; const y = (p - x) / w;
          const gridLine = x % grid < 1 || y % grid < 1 ? 0.25 : 0;
          const t = Math.max(1 - lines[p], gridLine);
          const c = lerp3(blue, white, t);
          out.data[p * 4] = c[0]; out.data[p * 4 + 1] = c[1]; out.data[p * 4 + 2] = c[2]; out.data[p * 4 + 3] = 255;
        }
        return out;
      },
    },
    {
      id: 'chalkboard', icon: 'stChalkboard', warp: W, options: opts({ lines: 2, detail: 60, colors: 2, smooth: 50, texture: 70 }),
      render({ raster, u, o, seed }) {
        const w = raster.width; const h = raster.height;
        const g = toGray(bilateral(raster, 2, 26, 1));
        const lines = outlines(g, w, h, u, { ...o, lines: Math.max(1, o.lines) }) ?? new Float32Array(w * h).fill(1);
        const grain = paperTexture(w, h, seed, 0.7);
        const board = [32, 56, 44];
        const out = createRaster(w, h);
        for (let p = 0; p < w * h; p++) {
          const chalk = (1 - lines[p]) * (0.55 + 0.45 * grain[p] * (o.texture / 100) * 1.6) + (1 - g[p] / 255) * 0 + (g[p] / 255 > 0.8 ? 0.12 : 0);
          const c = lerp3(board, [240, 240, 232], clamp(chalk, 0, 1));
          out.data[p * 4] = c[0] + grain[p] * 10; out.data[p * 4 + 1] = c[1] + grain[p] * 10; out.data[p * 4 + 2] = c[2] + grain[p] * 10; out.data[p * 4 + 3] = 255;
        }
        return out;
      },
    },
    {
      id: 'thermal', icon: 'stThermal', warp: W, options: opts({ lines: 0, colors: 8, smooth: 50 }),
      render({ raster, u, o, mask }) {
        const stops = [[10, 0, 60], [80, 0, 160], [200, 0, 120], [255, 80, 0], [255, 200, 0], [255, 255, 220]];
        const soft = bilateral(raster, 2, 30, 1 + Math.round(o.smooth / 50));
        const out = toneMap(soft, (t, p) => ramp(stops, t * 0.75 + (mask ? mask[p] * 0.25 : 0.1)));
        const lines = outlines(toGray(soft), raster.width, raster.height, u, o);
        return lines ? multiplyBy(out, lines, [0, 0, 0]) : out;
      },
    },
    {
      id: 'glitch', icon: 'stGlitch', warp: W, options: opts({ lines: 0, colors: 12, smooth: 30 }),
      render({ raster, u, random }) {
        const w = raster.width; const h = raster.height;
        const s = saturateRaster(raster, 1.4);
        const out = createRaster(w, h);
        const shift = Math.round(6 * u);
        const slices = Array.from({ length: 14 }, () => ({ y: Math.floor(random() * h), hgt: Math.floor((4 + random() * 22) * u), dx: Math.round((random() - 0.5) * 40 * u) }));
        for (let y = 0; y < h; y++) {
          const slice = slices.find((sl) => y >= sl.y && y < sl.y + sl.hgt);
          const dx = slice ? slice.dx : 0;
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const at = (xx) => (y * w + clamp(xx + dx, 0, w - 1)) * 4;
            out.data[i] = s.data[at(x - shift)];
            out.data[i + 1] = s.data[at(x) + 1];
            out.data[i + 2] = s.data[at(x + shift) + 2];
            out.data[i + 3] = 255;
            if (y % Math.max(2, Math.round(3 * u)) === 0) for (let c = 0; c < 3; c++) out.data[i + c] *= 0.82;
          }
        }
        return out;
      },
    },
    {
      id: 'retro8', icon: 'stRetro8', warp: { ...W, head: 1.45, eyes: 1.4 }, options: opts({ lines: 0, detail: 40, colors: 4, smooth: 40 }),
      render({ raster, u, o }) {
        const w = raster.width; const h = raster.height;
        const block = Math.max(3, Math.round((5 + (100 - o.detail) / 20) * u));
        const pal = [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]];
        const small = resize(bilateral(raster, 2, 28, 1), Math.ceil(w / block), Math.ceil(h / block));
        const g = toGray(small);
        const sorted = Float32Array.from(g).sort();
        const cuts = [0.25, 0.5, 0.75].map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
        const out = createRaster(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = g[Math.floor(y / block) * small.width + Math.floor(x / block)];
          const c = pal[cuts.filter((cut) => v > cut).length];
          const i = (y * w + x) * 4;
          out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
        }
        return out;
      },
    },
    {
      id: 'ukiyoe', icon: 'stUkiyoe', warp: { ...W, nose: 1.3, chin: 1.15 }, options: opts({ lines: 1.5, colors: 6, smooth: 75, texture: 50 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const inks = [[38, 52, 92], [176, 64, 50], [214, 170, 100], [236, 220, 190], [88, 120, 110], [30, 28, 30]];
        const smooth = bilateral(raster, Math.max(2, Math.round(2.5 * u)), 34, 2);
        const flat = mapToPalette(smooth, kmeansPalette(smooth, Math.min(o.colors, 8), { seed }).map((c) => inks.reduce((best, ink) => ((ink[0] - c[0]) ** 2 + (ink[1] - c[1]) ** 2 + (ink[2] - c[2]) ** 2 < (best[0] - c[0]) ** 2 + (best[1] - c[1]) ** 2 + (best[2] - c[2]) ** 2 ? ink : best), inks[0])));
        const lines = outlines(toGray(smooth), w, h, u, o);
        const art = textured(lines ? multiplyBy(flat, lines, [30, 26, 30]) : flat, paperTexture(w, h, seed, 1.3), o.texture);
        const sky = gradient(w, h, [236, 214, 180], [196, 120, 96]);
        return withBackground(art, mask, textured(sky, paperTexture(w, h, seed + 1, 1.3), o.texture), o);
      },
    },
    {
      id: 'noir', icon: 'stNoir', warp: { ...W, chin: 1.2, jaw: 1.15 }, options: opts({ lines: 1, colors: 2, smooth: 30, texture: 50 }),
      render({ raster, u, o, seed }) {
        const w = raster.width; const h = raster.height;
        const g = toGray(raster);
        const out = createRaster(w, h);
        const grain = paperTexture(w, h, seed, 0.5);
        for (let p = 0; p < g.length; p++) {
          const x = p % w; const y = (p - x) / w;
          let t = clamp((g[p] / 255 - 0.5) * 2.2 + 0.5, 0, 1);
          const d = Math.hypot(x / w - 0.5, y / h - 0.45);
          t *= clamp(1.25 - d * 1.6, 0, 1);
          t += (grain[p] - 0.5) * (o.texture / 100) * 0.25;
          const v = clamp(t, 0, 1) * 255;
          out.data[p * 4] = v; out.data[p * 4 + 1] = v; out.data[p * 4 + 2] = v; out.data[p * 4 + 3] = 255;
        }
        const lines = outlines(g, w, h, u, o);
        return lines ? multiplyBy(out, lines, [0, 0, 0]) : out;
      },
    },
    {
      id: 'duotone', icon: 'stDuotone', warp: W, options: opts({ lines: 1, colors: 5, smooth: 50 }),
      render({ raster, u, o, random, mask }) {
        const pairs = [[[20, 40, 90], [255, 120, 90]], [[30, 20, 70], [0, 220, 200]], [[60, 0, 60], [255, 210, 60]], [[0, 50, 60], [255, 150, 200]]];
        const [dark, light] = pick(pairs, random);
        const levels = clamp(o.colors, 2, 12);
        const soft = bilateral(raster, 2, 30, 1 + Math.round(o.smooth / 50));
        const out = toneMap(soft, (t) => lerp3(dark, light, Math.round(t * (levels - 1)) / (levels - 1)));
        const lines = outlines(toGray(soft), raster.width, raster.height, u, o);
        return withBackground(lines ? multiplyBy(out, lines, dark) : out, mask, light, o);
      },
    },
    {
      id: 'warhol', icon: 'stWarhol', warp: { ...W, eyes: 1.3 }, options: opts({ lines: 1.5, colors: 4, smooth: 60 }),
      render({ raster, u, o, mask }) {
        const w = raster.width; const h = raster.height;
        const sets = [
          [[30, 20, 60], [255, 60, 120], [255, 220, 60], [120, 220, 255]],
          [[20, 40, 30], [255, 140, 0], [80, 230, 120], [255, 240, 200]],
          [[40, 0, 60], [0, 200, 255], [255, 90, 200], [255, 255, 160]],
          [[10, 30, 80], [255, 220, 0], [255, 100, 80], [200, 255, 220]],
        ];
        const hw = Math.floor(w / 2); const hh = Math.floor(h / 2);
        const small = resize(bilateral(raster, 2, 32, 2), hw, hh);
        const smallMask = mask ? (() => { const m = new Float32Array(hw * hh); for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) m[y * hw + x] = mask[Math.min(h - 1, y * 2) * w + Math.min(w - 1, x * 2)]; return m; })() : null;
        const g = toGray(small);
        const sorted = Float32Array.from(g).sort();
        const cuts = [0.3, 0.6].map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
        const lines = outlines(g, hw, hh, u / 2, o);
        const out = createRaster(w, h);
        sets.forEach((pal, q) => {
          const ox = (q % 2) * hw; const oy = Math.floor(q / 2) * hh;
          for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
            const p = y * hw + x;
            const person = smallMask ? smallMask[p] > 0.5 : true;
            let c = person ? pal[cuts.filter((cut) => g[p] > cut).length] : pal[3];
            if (lines && lines[p] < 0.5) c = pal[0];
            const i = ((oy + y) * w + ox + x) * 4;
            out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
          }
        });
        return out;
      },
    },
    {
      id: 'sticker', icon: 'stSticker', warp: { ...W, head: 1.5, eyes: 1.35 }, options: opts({ lines: 2, colors: 8, smooth: 75 }),
      render({ raster, u, o, seed, mask, random }) {
        const w = raster.width; const h = raster.height;
        const { flat, smooth } = cel(raster, u, o, seed, { saturate: 1.35, lift: 0.04 });
        const lines = outlines(toGray(smooth), w, h, u, o);
        let art = lines ? multiplyBy(flat, lines, [25, 20, 30]) : flat;
        art = stickerEdge(art, mask, u, 9);
        if (mask) {
          // A soft drop shadow under the sticker.
          const grown = morph(mask, w, h, Math.round(9 * u), 'max');
          const shadow = blurChannel(grown, w, h, 6 * u);
          const bg = solid(w, h, tune(pick(PASTELS, random), 1.2, -0.04));
          const off = Math.round(6 * u);
          for (let y = h - 1; y >= off; y--) for (let x = w - 1; x >= off; x--) { const s2 = shadow[(y - off) * w + x - off] * 0.35; const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) bg.data[i + c] *= 1 - s2; }
          return withBackground(art, morph(mask, w, h, Math.round(9 * u), 'max'), bg, o);
        }
        return art;
      },
    },
    {
      id: 'lowpoly', icon: 'stLowPoly', warp: W, options: opts({ lines: 0, detail: 55, colors: 12, smooth: 30 }),
      render({ raster, u, o, random, mask }) {
        const cell = Math.max(5, (6 + (100 - o.detail) / 8) * u);
        const out = triangles(saturateRaster(raster, 1.15), cell, random);
        return withBackground(out, mask, out, { ...o, background: 'photo' });
      },
    },
    {
      id: 'cubism', icon: 'stCubism', warp: { ...W, nose: 1.4, eyes: 1.3 }, options: opts({ lines: 2, detail: 30, colors: 8, smooth: 50 }),
      render({ raster, u, o, random, seed }) {
        const w = raster.width; const h = raster.height;
        const cell = Math.max(10, (16 + (100 - o.detail) / 4) * u);
        const shards = triangles(saturateRaster(raster, 1.3), cell, random, 0.48);
        const flat = mapToPalette(shards, kmeansPalette(shards, o.colors, { seed }).map((c) => tune(c, 1.2)));
        const edges = regionEdges(flat, u, Math.max(0.5, o.lines * 0.5));
        return textured(multiplyBy(flat, edges, [40, 30, 25]), paperTexture(w, h, seed, 1.5), 35);
      },
    },
    {
      id: 'embroidery', icon: 'stEmbroidery', warp: W, options: opts({ lines: 1, detail: 50, colors: 12, smooth: 50 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const cell = Math.max(4, Math.round((5 + (100 - o.detail) / 25) * u));
        const palette = kmeansPalette(raster, o.colors, { seed }).map((c) => tune(c, 1.3));
        const small = mapToPalette(resize(bilateral(raster, 2, 28, 1), Math.ceil(w / cell), Math.ceil(h / cell)), palette);
        const smallMask = mask ? resize(grayToRaster(mask.map((v) => v * 255), w, h), small.width, small.height) : null;
        const cloth = [240, 232, 214];
        const out = solid(w, h, cloth);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const tx = Math.floor(x / cell); const ty = Math.floor(y / cell);
          const j = (ty * small.width + tx) * 4;
          if (smallMask && smallMask.data[j] < 128) continue;
          const lx = (x % cell) / cell; const ly = (y % cell) / cell;
          const onX = Math.abs(lx - ly) < 0.2 || Math.abs(lx + ly - 1) < 0.2;
          if (!onX) continue;
          const shade = 0.8 + 0.2 * (1 - Math.abs(lx - 0.5) * 2);
          const i = (y * w + x) * 4;
          out.data[i] = small.data[j] * shade; out.data[i + 1] = small.data[j + 1] * shade; out.data[i + 2] = small.data[j + 2] * shade;
        }
        // The weave of the cloth.
        for (let p = 0; p < w * h; p++) { const x = p % w; const y = (p - x) / w; if ((x + y) % Math.max(2, Math.round(2 * u)) === 0) for (let c = 0; c < 3; c++) out.data[p * 4 + c] *= 0.96; }
        return out;
      },
    },
    {
      id: 'graffiti', icon: 'stGraffiti', warp: { ...W, head: 1.45, mouth: 1.3 }, options: opts({ lines: 3, colors: 6, smooth: 70 }),
      render({ raster, u, o, seed, mask, random }) {
        const w = raster.width; const h = raster.height;
        const { flat, smooth } = cel(raster, u, o, seed, { saturate: 1.8, lift: 0.05 });
        const lines = outlines(toGray(smooth), w, h, u, o);
        let art = lines ? multiplyBy(flat, lines, [10, 10, 10]) : flat;
        art = stickerEdge(art, mask, u, 5, pick(VIVID, random));
        // Brick wall.
        const brick = [150, 70, 55]; const mortar = [200, 190, 175];
        const bw = 46 * u; const bh = 20 * u;
        const wall = createRaster(w, h);
        const grain = paperTexture(w, h, seed, 0.8);
        for (let p = 0; p < w * h; p++) {
          const x = p % w; const y = (p - x) / w;
          const row = Math.floor(y / bh);
          const xx = x + (row % 2 ? bw / 2 : 0);
          const isMortar = y % bh < 2.5 * u || xx % bw < 2.5 * u;
          const c = isMortar ? mortar : tune(brick, 1, (grain[p] - 0.5) * 0.12);
          wall.data[p * 4] = c[0]; wall.data[p * 4 + 1] = c[1]; wall.data[p * 4 + 2] = c[2]; wall.data[p * 4 + 3] = 255;
        }
        return withBackground(art, mask, wall, o);
      },
    },
    {
      id: 'sumi', icon: 'stSumi', warp: { ...W, nose: 1.3, chin: 1.15 }, options: opts({ lines: 2, detail: 40, colors: 3, smooth: 60, texture: 60 }),
      render({ raster, u, o, seed, mask }) {
        const w = raster.width; const h = raster.height;
        const g = toGray(bilateral(raster, 2, 30, 2));
        const wash = blurChannel(g, w, h, 3 * u);
        const levels = clamp(o.colors, 2, 6);
        const lines = outlines(g, w, h, u, { ...o, lines: Math.max(1, o.lines) }, { phi: 140 });
        const sheet = [244, 238, 224];
        const out = createRaster(w, h);
        const fibre = paperTexture(w, h, seed, 1.1);
        for (let p = 0; p < g.length; p++) {
          const t = Math.round((wash[p] / 255) * (levels - 1)) / (levels - 1);
          let v = 0.25 + 0.75 * t;
          if (lines) v *= 0.15 + 0.85 * lines[p];
          v += (fibre[p] - 0.5) * (o.texture / 100) * 0.12;
          const c = lerp3([20, 20, 24], sheet, clamp(v, 0, 1));
          out.data[p * 4] = c[0]; out.data[p * 4 + 1] = c[1]; out.data[p * 4 + 2] = c[2]; out.data[p * 4 + 3] = 255;
        }
        return withBackground(out, mask, textured(solid(w, h, sheet), fibre, o.texture), o);
      },
    },
    {
      id: 'papercut', icon: 'stPapercut', warp: W, options: opts({ lines: 0, colors: 5, smooth: 80 }),
      render({ raster, u, o, random, mask }) {
        const w = raster.width; const h = raster.height;
        const levels = clamp(o.colors, 3, 7);
        const base = pick(PASTELS, random);
        const g = blurChannel(toGray(bilateral(raster, 3, 34, 2)), w, h, 2 * u);
        const layer = new Float32Array(w * h);
        for (let p = 0; p < g.length; p++) layer[p] = Math.round((g[p] / 255) * (levels - 1));
        const shadow = blurChannel(layer, w, h, 3 * u);
        const off = Math.round(3 * u);
        const out = createRaster(w, h);
        for (let p = 0; p < g.length; p++) {
          const x = p % w; const y = (p - x) / w;
          const t = layer[p] / (levels - 1);
          const c = tune(base, 1.6, (t - 0.5) * 0.55);
          const sp = y >= off && x >= off ? shadow[(y - off) * w + x - off] : layer[p];
          const sh = clamp((sp - layer[p]) * 0.35, 0, 0.35);
          out.data[p * 4] = c[0] * (1 - sh); out.data[p * 4 + 1] = c[1] * (1 - sh); out.data[p * 4 + 2] = c[2] * (1 - sh); out.data[p * 4 + 3] = 255;
        }
        return withBackground(out, mask, out, { ...o, background: 'photo' });
      },
    },
  ];
}
