// Content-aware fill ("erase" in the repair tools): the masked pixels are
// rebuilt from the rest of the picture so that every small patch of the hole
// looks like some patch outside it (Wexler et al., "Space-time completion",
// with PatchMatch nearest neighbours — Barnes et al. 2009).
//
//   1. Work on the hole's neighbourhood only (its box plus a margin).
//   2. Pyramid: halve until the hole is a few pixels wide; there, fill it by
//      smooth diffusion from the border.
//   3. From coarse to fine: for each patch touching the hole find a similar
//      patch outside it (random search + propagation), then every hole pixel
//      becomes the weighted average of what the overlapping patches say.
// Deterministic (seeded random), so the preview and the saved file agree.

const R = 3; // patch radius → 7 × 7 patches

/** Fills `mask` (1 = hole, row-major, width × height) in `image` ({ width, height, data: RGBA }) in place. */
export function inpaint(image, mask, { seed = 1 } = {}) {
  const { width, height } = image;
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return image;
  const margin = Math.max(24, Math.round(Math.max(x1 - x0, y1 - y0) * 1.2));
  const bx = Math.max(0, x0 - margin); const by = Math.max(0, y0 - margin);
  const bw = Math.min(width, x1 + margin + 1) - bx; const bh = Math.min(height, y1 + margin + 1) - by;
  // Crop to float RGB + mask.
  let level = { w: bw, h: bh, rgb: new Float32Array(bw * bh * 3), hole: new Uint8Array(bw * bh) };
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const s = ((by + y) * width + bx + x);
    const d = y * bw + x;
    level.rgb[d * 3] = image.data[s * 4]; level.rgb[d * 3 + 1] = image.data[s * 4 + 1]; level.rgb[d * 3 + 2] = image.data[s * 4 + 2];
    level.hole[d] = mask[s] ? 1 : 0;
  }
  // Pyramid.
  const levels = [level];
  while (true) {
    const top = levels[levels.length - 1];
    const extent = holeExtent(top);
    if (extent <= 6 || top.w < 24 || top.h < 24) break;
    levels.push(downsample(top));
  }
  const random = rng(seed);
  // Coarsest: diffusion fill.
  diffuse(levels[levels.length - 1]);
  let nnf = null;
  for (let i = levels.length - 1; i >= 0; i--) {
    const lv = levels[i];
    if (i < levels.length - 1) {
      upsampleInto(levels[i + 1], lv);
      nnf = upsampleNnf(nnf, levels[i + 1], lv);
    }
    const iterations = i === 0 ? 3 : 5;
    for (let k = 0; k < iterations; k++) {
      nnf = patchMatch(lv, nnf, random);
      vote(lv, nnf);
    }
  }
  // Write back the hole pixels only.
  const out = levels[0];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const d = y * bw + x;
    if (!out.hole[d]) continue;
    const s = (by + y) * width + bx + x;
    image.data[s * 4] = clamp(out.rgb[d * 3]); image.data[s * 4 + 1] = clamp(out.rgb[d * 3 + 1]); image.data[s * 4 + 2] = clamp(out.rgb[d * 3 + 2]);
  }
  return image;
}

/** Rasterises brush strokes ([{ points: [[x, y]…], radius }]) into a mask at `scale`. */
export function strokeMask(width, height, strokes, scale = 1) {
  const mask = new Uint8Array(width * height);
  const dot = (cx, cy, r) => {
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) mask[y * width + x] = 1;
      }
    }
  };
  for (const stroke of strokes ?? []) {
    const r = Math.max(1, stroke.radius * scale);
    const pts = stroke.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [px, py] = pts[i + 1] ?? pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(px - ax, py - ay) * scale / Math.max(1, r / 2)));
      for (let s = 0; s <= steps; s++) dot((ax + (px - ax) * (s / steps)) * scale, (ay + (py - ay) * (s / steps)) * scale, r);
    }
  }
  return mask;
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

function holeExtent(lv) {
  let x0 = lv.w; let y0 = lv.h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (lv.hole[y * lv.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? 0 : Math.max(x1 - x0 + 1, y1 - y0 + 1);
}

function downsample(lv) {
  const w = Math.max(1, lv.w >> 1); const h = Math.max(1, lv.h >> 1);
  const rgb = new Float32Array(w * h * 3); const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0; let g = 0; let b = 0; let n = 0; let any = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = Math.min(lv.w - 1, x * 2 + dx); const sy = Math.min(lv.h - 1, y * 2 + dy);
      const s = sy * lv.w + sx;
      if (lv.hole[s]) { any = 1; continue; }
      r += lv.rgb[s * 3]; g += lv.rgb[s * 3 + 1]; b += lv.rgb[s * 3 + 2]; n++;
    }
    const d = y * w + x;
    hole[d] = any;
    if (n) { rgb[d * 3] = r / n; rgb[d * 3 + 1] = g / n; rgb[d * 3 + 2] = b / n; }
  }
  return { w, h, rgb, hole };
}

/** Smooth fill of the hole from its border (repeated neighbour averaging, onion order). */
function diffuse(lv) {
  const { w, h, rgb, hole } = lv;
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = hole[i] ? 0 : 1;
  let remaining = hole.reduce((s, v) => s + v, 0);
  while (remaining > 0) {
    const next = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (known[i]) continue;
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || (!dx && !dy)) continue;
        const j = ny * w + nx;
        if (!known[j]) continue;
        r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; n++;
      }
      if (n) next.push([i, r / n, g / n, b / n]);
    }
    if (!next.length) break;
    for (const [i, r, g, b] of next) { rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; known[i] = 1; remaining--; }
  }
  for (let k = 0; k < 20; k++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!hole[i]) continue;
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; n++;
      }
      rgb[i * 3] = r / n; rgb[i * 3 + 1] = g / n; rgb[i * 3 + 2] = b / n;
    }
  }
}

function upsampleInto(coarse, fine) {
  for (let y = 0; y < fine.h; y++) for (let x = 0; x < fine.w; x++) {
    const i = y * fine.w + x;
    if (!fine.hole[i]) continue;
    const cx = Math.min(coarse.w - 1, (x + 0.5) / 2 - 0.5); const cy = Math.min(coarse.h - 1, (y + 0.5) / 2 - 0.5);
    const x0 = Math.max(0, Math.floor(cx)); const y0 = Math.max(0, Math.floor(cy));
    const x1 = Math.min(coarse.w - 1, x0 + 1); const y1 = Math.min(coarse.h - 1, y0 + 1);
    const fx = Math.max(0, cx - x0); const fy = Math.max(0, cy - y0);
    for (let c = 0; c < 3; c++) {
      const a = coarse.rgb[(y0 * coarse.w + x0) * 3 + c] * (1 - fx) + coarse.rgb[(y0 * coarse.w + x1) * 3 + c] * fx;
      const b = coarse.rgb[(y1 * coarse.w + x0) * 3 + c] * (1 - fx) + coarse.rgb[(y1 * coarse.w + x1) * 3 + c] * fx;
      fine.rgb[i * 3 + c] = a * (1 - fy) + b * fy;
    }
  }
}

/** Centres whose whole patch lies inside the level and outside the hole. */
function validSources(lv) {
  const { w, h, hole } = lv;
  // Distance-free test: a centre is valid when no hole pixel is within R (box).
  const integral = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += hole[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row; }
  }
  const sum = (ax, ay, bx, by) => integral[(by + 1) * (w + 1) + bx + 1] - integral[ay * (w + 1) + bx + 1] - integral[(by + 1) * (w + 1) + ax] + integral[ay * (w + 1) + ax];
  const ok = new Uint8Array(w * h);
  const list = [];
  for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) {
    if (sum(x - R, y - R, x + R, y + R) === 0) { ok[y * w + x] = 1; list.push(y * w + x); }
  }
  return { ok, list };
}

/** Patch centres that touch the hole. */
function targets(lv) {
  const { w, h, hole } = lv;
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let touch = false;
    for (let dy = -R; dy <= R && !touch; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && hole[yy * w + xx]) { touch = true; break; } }
    }
    if (touch) out.push(y * w + x);
  }
  return out;
}

function patchDistance(lv, p, q, best) {
  const { w, h, rgb } = lv;
  const px = p % w; const py = (p / w) | 0; const qx = q % w; const qy = (q / w) | 0;
  let d = 0; let n = 0;
  for (let dy = -R; dy <= R; dy++) {
    const ay = py + dy; const by = qy + dy;
    if (ay < 0 || ay >= h) continue;
    for (let dx = -R; dx <= R; dx++) {
      const ax = px + dx;
      if (ax < 0 || ax >= w) continue;
      const a = (ay * w + ax) * 3; const b = (by * w + qx + dx) * 3;
      const e0 = rgb[a] - rgb[b]; const e1 = rgb[a + 1] - rgb[b + 1]; const e2 = rgb[a + 2] - rgb[b + 2];
      d += e0 * e0 + e1 * e1 + e2 * e2; n++;
    }
    if (d > best * n) return Infinity; // early exit (per-pixel average)
  }
  return n ? d / n : Infinity;
}

function patchMatch(lv, previous, random) {
  const { w, h } = lv;
  const { ok, list } = validSources(lv);
  if (!list.length) return previous ?? new Map();
  const centres = targets(lv);
  const nnf = new Map(); // target centre → [source centre, distance]
  for (const p of centres) {
    let q = previous?.get(p)?.[0];
    if (q == null || !ok[q]) q = list[Math.floor(random() * list.length)];
    nnf.set(p, [q, patchDistance(lv, p, q, Infinity)]);
  }
  for (let pass = 0; pass < 2; pass++) {
    const order = pass % 2 === 0 ? centres : [...centres].reverse();
    const step = pass % 2 === 0 ? -1 : 1;
    for (const p of order) {
      const entry = nnf.get(p);
      let [best, bestD] = entry;
      const px = p % w; const py = (p / w) | 0;
      // Propagation from the left/up (or right/down) neighbour's match.
      for (const [dx, dy] of [[step, 0], [0, step]]) {
        const nx = px + dx; const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = nnf.get(ny * w + nx);
        if (!n) continue;
        const qx = (n[0] % w) - dx; const qy = ((n[0] / w) | 0) - dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (!ok[q] || q === best) continue;
        const d = patchDistance(lv, p, q, bestD);
        if (d < bestD) { best = q; bestD = d; }
      }
      // Random search around the best, shrinking radius.
      for (let radius = Math.max(w, h); radius >= 1; radius >>= 1) {
        const bx = best % w; const by = (best / w) | 0;
        const qx = Math.round(bx + (random() * 2 - 1) * radius); const qy = Math.round(by + (random() * 2 - 1) * radius);
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (!ok[q]) continue;
        const d = patchDistance(lv, p, q, bestD);
        if (d < bestD) { best = q; bestD = d; }
      }
      entry[0] = best; entry[1] = bestD;
    }
  }
  return nnf;
}

function vote(lv, nnf) {
  const { w, h, rgb, hole } = lv;
  const acc = new Float64Array(w * h * 3);
  const weight = new Float64Array(w * h);
  let sigma = 0; let count = 0;
  for (const [, [, d]] of nnf) if (Number.isFinite(d)) { sigma += d; count++; }
  sigma = Math.max(1, count ? sigma / count : 1);
  for (const [p, [q, d]] of nnf) {
    const wgt = Math.exp(-d / (2 * sigma));
    const px = p % w; const py = (p / w) | 0; const qx = q % w; const qy = (q / w) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const ty = py + dy;
      if (ty < 0 || ty >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const tx = px + dx;
        if (tx < 0 || tx >= w) continue;
        const t = ty * w + tx;
        if (!hole[t]) continue;
        const s = ((qy + dy) * w + qx + dx) * 3;
        acc[t * 3] += rgb[s] * wgt; acc[t * 3 + 1] += rgb[s + 1] * wgt; acc[t * 3 + 2] += rgb[s + 2] * wgt;
        weight[t] += wgt;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!hole[i] || !weight[i]) continue;
    rgb[i * 3] = acc[i * 3] / weight[i]; rgb[i * 3 + 1] = acc[i * 3 + 1] / weight[i]; rgb[i * 3 + 2] = acc[i * 3 + 2] / weight[i];
  }
}

function upsampleNnf(nnf, coarse, fine) {
  if (!nnf) return null;
  const out = new Map();
  for (const [p, [q]] of nnf) {
    const px = p % coarse.w; const py = (p / coarse.w) | 0; const qx = q % coarse.w; const qy = (q / coarse.w) | 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const fx = px * 2 + dx; const fy = py * 2 + dy;
      const sx = Math.min(fine.w - 1, qx * 2 + dx); const sy = Math.min(fine.h - 1, qy * 2 + dy);
      if (fx < fine.w && fy < fine.h) out.set(fy * fine.w + fx, [sy * fine.w + sx, Infinity]);
    }
  }
  return out;
}
