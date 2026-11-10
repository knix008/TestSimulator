// Furniture in a floor plan picture → library items placed in the plan (the 2D plan workbench shows them, the 3D
// conversion puts them in). Classical image processing, no learning — propose many candidates, keep the best:
//   1. rooms: the rooms of the recognised walls (plus one 'rest' room for the inside no room covers, when walls did
//      not close), each with its floor colour (the commonest colour in it); door swings are left out;
//   2. candidates: outlined things (components of dark lines with what they and the walls enclose — line drawings,
//      and the edges colour plans draw around furniture) and solid patches (clearly another colour than the floor),
//      each also cut in two where a straight line spans it or its width steps (a bed with a nightstand against it);
//   3. naming (nameShape): size, fill, room kind, wall contact, colour (green leaves = a plant) and neighbours (beside
//      a bed, in front of a sofa, at a counter); a room with a toilet is a bathroom; big wall-to-wall patches are floor;
//   4. choosing: per candidate the whole or its halves, whichever explains more area with more confidence; across
//      candidates the strongest first without overlaps; the same thing found twice is dropped; a free-standing thing
//      with others on it is a rug;
//   5. placing: centre of the footprint, size parameters fitted, the back to the nearest wall (beds, baths and toilets
//      end-on, nearly square things by their nearest side, a fridge as its counter), free things across their length.
// Pure (no DOM): pixels in, plan items out. test/unit/plan-furniture.test.js measures it on the interior samples.
import { planEntities } from './plan-build.js';

const SQ = (v) => v * v;

/** Grey level and RGB of a picture (RGBA, transparent = white paper). */
function channels({ data, width: w, height: h }) {
  const n = w * h;
  const gray = new Uint8Array(n); const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (data[i * 4 + 3] ?? 255) / 255;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(data[i * 4 + c] * a + 255 * (1 - a));
    gray[i] = Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]);
  }
  return { gray, rgb };
}

function pointInPolygon([x, z], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]; const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Square-window morphology on a 0/1 mask (separable): `all` = erosion, else dilation. */
function morph(mask, w, h, r, all) {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h); const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = all ? 1 : 0;
      for (let d = -r; d <= r; d++) { const X = x + d; const s = X >= 0 && X < w ? mask[y * w + X] : 0; if (all ? !s : s) { v = all ? 0 : 1; break; } }
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = all ? 1 : 0;
      for (let d = -r; d <= r; d++) { const Y = y + d; const s = Y >= 0 && Y < h ? tmp[Y * w + x] : 0; if (all ? !s : s) { v = all ? 0 : 1; break; } }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 8-connected components of a mask: [{ pixels: Int32Array, x0, y0, x1, y1 }]. */
function components(mask, w, h, minPixels = 1) {
  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const pixels = [];
    let x0 = w; let x1 = 0; let y0 = h; let y1 = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); pixels.push(j);
      const x = j % w; const y = (j / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx; const Y = y + dy;
        if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h) { const k = Y * w + X; if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); } }
      }
    }
    if (pixels.length >= minPixels) out.push({ pixels: Int32Array.from(pixels), x0, y0, x1, y1 });
  }
  return out;
}

/** A component with everything it encloses (its holes filled), as pixel indices. */
function filled(comp, w, h, wall = null) {
  const bw = comp.x1 - comp.x0 + 3; const bh = comp.y1 - comp.y0 + 3;
  const local = new Uint8Array(bw * bh);
  for (const i of comp.pixels) local[((i / w | 0) - comp.y0 + 1) * bw + (i % w - comp.x0 + 1)] = 1;
  // Walls close an outline too (a wardrobe drawn against a wall has no line of its own there): wall pixels block.
  const blocks = (x, y) => {
    const X = x - 1 + comp.x0; const Y = y - 1 + comp.y0;
    return wall && X >= 0 && Y >= 0 && X < w && Y < h && wall[Y * w + X];
  };
  // Flood the outside from the frame; what it does not reach is inside.
  const outside = new Uint8Array(bw * bh);
  const stack = [];
  for (let x = 0; x < bw; x++) for (const y of [0, bh - 1]) { const j = y * bw + x; if (!local[j] && !outside[j] && !blocks(x, y)) { outside[j] = 1; stack.push(j); } }
  for (let y = 0; y < bh; y++) for (const x of [0, bw - 1]) { const j = y * bw + x; if (!local[j] && !outside[j] && !blocks(x, y)) { outside[j] = 1; stack.push(j); } }
  while (stack.length) {
    const j = stack.pop(); const x = j % bw; const y = (j / bw) | 0;
    for (const k of [x > 0 ? j - 1 : -1, x < bw - 1 ? j + 1 : -1, y > 0 ? j - bw : -1, y < bh - 1 ? j + bw : -1]) if (k >= 0 && !local[k] && !outside[k] && !blocks(k % bw, (k / bw) | 0)) { outside[k] = 1; stack.push(k); }
  }
  const out = [];
  for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) if (!outside[y * bw + x] && !blocks(x, y)) out.push((y - 1 + comp.y0) * w + (x - 1 + comp.x0));
  return Int32Array.from(out);
}

// ───────────────────────── the scene: rooms, floor colours, ink, solid colour, candidates

/**
 * Everything the naming needs from a picture: { width, height, ink, solid, roomOf, floor, candidates }. `rooms`: polygons
 * in picture metres; `doors`: [{ c: [x, z], u: [ux, uz], width }] (door centres on their wall, along-wall direction) —
 * their swings are left out. Candidates: outlined things (line components with what they enclose) and solid colour
 * patches, as pixel index arrays.
 */
export function furnitureScene(image, { metresPerPixel: m, rooms, doors = [], rest = null }) {
  const { width: w, height: h } = image;
  const { gray, rgb } = channels(image);
  const n = w * h;
  // Room of every pixel (−1 outside), 2 px away from the walls.
  const roomOf = new Int16Array(n).fill(-1);
  // `rest` (room index rooms.length): the inside of the building outside every room.
  const all = rest ? [rest, ...rooms] : rooms;
  all.forEach((pts, k) => {
    const r = rest ? (k === 0 ? rooms.length : k - 1) : k;
    const xs = pts.map((p) => p[0] / m); const zs = pts.map((p) => p[1] / m);
    const X0 = Math.max(0, Math.floor(Math.min(...xs))); const X1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
    const Y0 = Math.max(0, Math.floor(Math.min(...zs))); const Y1 = Math.min(h - 1, Math.ceil(Math.max(...zs)));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (pointInPolygon([(x + 0.5) * m, (y + 0.5) * m], pts)) roomOf[y * w + x] = r;
  });
  const inner = morph(Uint8Array.from(roomOf, (v) => (v >= 0 ? 1 : 0)), w, h, 2, true);
  for (let i = 0; i < n; i++) if (!inner[i]) roomOf[i] = -1;
  // Door swings: the square in front of each door, on both sides of its wall.
  const blocked = new Uint8Array(n);
  for (const d of doors) {
    const nrm = [-d.u[1], d.u[0]];
    const half = d.width / 2 + 0.05; const reach = d.width + 0.08;
    for (let s = -half; s <= half; s += m * 0.7) for (let t = -reach; t <= reach; t += m * 0.7) {
      const x = Math.round((d.c[0] + d.u[0] * s + nrm[0] * t) / m); const y = Math.round((d.c[1] + d.u[1] * s + nrm[1] * t) / m);
      if (x >= 0 && y >= 0 && x < w && y < h) blocked[y * w + x] = 1;
    }
  }
  // Floor colour of each room: the commonest colour (16 levels a channel), averaged within its bin.
  const hists = Array.from({ length: rooms.length + (rest ? 1 : 0) }, () => new Map());
  for (let i = 0; i < n; i++) {
    const r = roomOf[i];
    if (r < 0) continue;
    const key = (rgb[i * 3] >> 4) * 256 + (rgb[i * 3 + 1] >> 4) * 16 + (rgb[i * 3 + 2] >> 4);
    const e = hists[r].get(key) ?? [0, 0, 0, 0];
    e[0]++; e[1] += rgb[i * 3]; e[2] += rgb[i * 3 + 1]; e[3] += rgb[i * 3 + 2];
    hists[r].set(key, e);
  }
  const floor = hists.map((hist) => {
    let best = null; for (const e of hist.values()) if (!best || e[0] > best[0]) best = e;
    return best ? [best[1] / best[0], best[2] / best[0], best[3] / best[0]] : [255, 255, 255];
  });
  const floorGray = floor.map((c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  // Ink: clearly darker than the floor (lines, outlines). Solid: clearly another colour than the floor.
  const ink = new Uint8Array(n); const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = roomOf[i];
    if (r < 0 || blocked[i]) continue;
    const dist = Math.sqrt(SQ(rgb[i * 3] - floor[r][0]) + SQ(rgb[i * 3 + 1] - floor[r][1]) + SQ(rgb[i * 3 + 2] - floor[r][2]));
    if (gray[i] < floorGray[r] - 55) ink[i] = 1;
    else if (dist > 40) solid[i] = 1;
  }
  const px = (area) => area / (m * m);
  const candidates = [];
  // Outlined: each line component with what it encloses.
  const inkClosed = morph(morph(ink, w, h, 1, false), w, h, 1, true);
  const wall = Uint8Array.from(roomOf, (v) => (v < 0 ? 1 : 0));
  for (const comp of components(inkClosed, w, h, px(0.02))) candidates.push({ pixels: filled(comp, w, h, wall), kind: 'outline' });
  // Solid: coloured patches (thin floor joints opened away), with the outline pixels around them.
  const solidOpen = morph(morph(solid, w, h, 1, true), w, h, 1, false);
  for (const comp of components(solidOpen, w, h, px(0.05))) candidates.push({ pixels: comp.pixels, kind: 'solid' });
  return { width: w, height: h, rgb, ink, roomOf, floor, candidates: candidates.filter((c) => c.pixels.length >= px(0.06)) };
}

// ───────────────────────── shape of a pixel set

/**
 * Features of a pixel set in the walls' frame (turned by `angle`): area, oriented rectangle (centre, long, short, axis,
 * du, dv), fill, mean colour, room (where most of it lies), and the frame coordinates of each pixel (for cutting).
 */
function shapeOf(pixels, scene, m, angle) {
  const { width: w, rgb, roomOf } = scene;
  const c = Math.cos(angle); const s = Math.sin(angle);
  const N = pixels.length;
  const us = new Float32Array(N); const vs = new Float32Array(N);
  let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
  let r = 0; let g = 0; let b = 0;
  const rooms = new Map();
  for (let k = 0; k < N; k++) {
    const i = pixels[k];
    const x = (i % w + 0.5) * m; const y = ((i / w | 0) + 0.5) * m;
    const u = x * c + y * s; const v = -x * s + y * c;
    us[k] = u; vs[k] = v;
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2];
    const ro = roomOf[i]; if (ro >= 0) rooms.set(ro, (rooms.get(ro) ?? 0) + 1);
  }
  let room = -1; let most = 0; for (const [ro, cnt] of rooms) if (cnt > most) { room = ro; most = cnt; }
  const du = u1 - u0 + m; const dv = v1 - v0 + m;
  const cu = (u0 + u1) / 2; const cv = (v0 + v1) / 2;
  const area = N * m * m;
  return {
    pixels, us, vs, u0, u1, v0, v1, du, dv, area, room, colour: [r / N, g / N, b / N],
    centre: [cu * c - cv * s, cu * s + cv * c], long: Math.max(du, dv), short: Math.min(du, dv), axis: du >= dv ? angle : angle + Math.PI / 2, fill: area / (du * dv),
  };
}

/**
 * Ways to cut a shape in two: across a straight ink line that spans the whole shape (two things side by side, each
 * outlined), or where its width steps (an L of two things). Returns [[pixelsA, pixelsB], …] (best first, at most 2).
 */
function cutsOf(shape, scene, m) {
  const out = [];
  const { ink } = scene;
  for (const axis of ['u', 'v']) {
    const a = axis === 'u' ? shape.us : shape.vs; const lo = axis === 'u' ? shape.u0 : shape.v0;
    const size = axis === 'u' ? shape.du : shape.dv;
    const bins = Math.max(1, Math.round(size / m));
    if (bins < 8) continue;
    const count = new Float32Array(bins); const inkCount = new Float32Array(bins);
    for (let k = 0; k < a.length; k++) { const bi = Math.min(bins - 1, Math.max(0, Math.floor((a[k] - lo) / m))); count[bi]++; if (ink[shape.pixels[k]]) inkCount[bi]++; }
    const maxCount = Math.max(...count);
    const margin = Math.max(2, Math.round(0.28 / m));
    let best = null;
    for (let bi = margin; bi < bins - margin; bi++) {
      // A line across: (nearly) all of this slice is ink, and the slice is (nearly) as tall as the shape.
      const line = count[bi] > 0 ? inkCount[bi] / count[bi] : 0;
      if (line >= 0.8 && count[bi] >= maxCount * 0.55) { const score = line + 0.5; if (!best || score > best.score) best = { at: bi, score }; }
      // A step: the slices on either side differ a lot.
      const d = Math.max(2, Math.round(0.06 / m));
      if (bi - d >= 0 && bi + d < bins) {
        const step = Math.abs(count[bi + d] - count[bi - d]) / maxCount;
        if (step >= 0.35) { const score = step; if (!best || score > best.score) best = { at: bi, score }; }
      }
    }
    if (best) {
      const cut = lo + best.at * m;
      const A = []; const B = [];
      for (let k = 0; k < a.length; k++) (a[k] < cut ? A : B).push(shape.pixels[k]);
      if (A.length * m * m >= 0.08 && B.length * m * m >= 0.08) out.push({ parts: [Int32Array.from(A), Int32Array.from(B)], score: best.score });
    }
  }
  return out.sort((p, q) => q.score - p.score).slice(0, 2).map((x) => x.parts);
}

// ───────────────────────── naming

const between = (v, a, b) => v >= a && v <= b;
const hueOf = ([r, g, b]) => {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  if (mx - mn < 18) return { h: 0, s: 0 };
  let h;
  if (mx === r) h = ((g - b) / (mx - mn)) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
  return { h: (h * 60 + 360) % 360, s: (mx - mn) / mx };
};

/** Items that stand with their back to a wall (the rest stand free). */
const WALL_ITEMS = new Set(['bed', 'nightstand', 'wardrobe', 'built-in-closet', 'dresser', 'bookshelf', 'tv-console', 'desk', 'kitchen-sink-counter', 'kitchen-base-cabinet', 'refrigerator', 'toilet', 'washbasin-vanity', 'washing-machine', 'bathtub', 'shower-booth', 'sofa-modern', 'sofa-loveseat', 'sofa-sectional', 'shoe-cabinet']);
/** The item's width runs along its short side (beds, baths: the head / one end is at the wall). */
const END_TO_WALL = new Set(['bed', 'bathtub', 'toilet']);

/**
 * The library item for a shape: { item, params, score (0 … 1) } or null. ctx: { room ('living' | 'bedroom' | 'bath'
 * | 'hall' | 'storage' | 'room' | 'rest'), wet (a bathroom), atWall, plant, dark, carries, nearBed, nearSofa, nearCounter }.
 */
export function nameShape(f, ctx) {
  const L = f.long; const S = f.short; const room = ctx.room;
  const living = room === 'living' || room === 'room' || room === 'rest';
  if (ctx.plant && L <= 1.6) return { item: 'fiddle-leaf-fig', params: {}, score: 0.8 };
  // Toilets are narrow and long (a vanity of the same length is wider).
  if (between(L, 0.52, 0.82) && between(S, 0.3, 0.46) && L / S >= 1.45 && between(f.fill, 0.55, 0.97) && ctx.atWall && (ctx.wet || !['bedroom', 'living', 'rest'].includes(room))) return { item: 'toilet', params: {}, score: 0.75 };
  if (ctx.wet) {
    if (between(L, 1.2, 2.05) && between(S, 0.62, 0.98)) return { item: 'bathtub', params: { length: L, width: S }, score: 0.7 };
    if (between(L, 0.7, 1.45) && between(S, 0.68, 1.45) && L / S < 1.6) return { item: 'shower-booth', params: { width: L, depth: S }, score: 0.6 };
    if (between(L, 0.45, 1.65) && between(S, 0.32, 0.62) && ctx.atWall) return { item: 'washbasin-vanity', params: { width: Math.min(1.6, L) }, score: 0.6 };
  }
  if ((ctx.wet || room === 'storage' || room === 'hall') && between(L, 0.52, 0.74) && between(S, 0.5, 0.74)) return { item: 'washing-machine', params: {}, score: 0.55 };
  // A sofa-sized shape in a living room is a sofa (a single bed there is rare).
  // Beds stand with their head to a wall (a rug of a bed's size lies free).
  if (between(L, 1.85, 2.35) && between(S, 0.85, 2.05) && f.fill > 0.75 && ctx.wall <= 0.25 && !(room === 'living' && S < 1.2)) {
    const bedSize = S < 1.05 ? 'single' : S < 1.3 ? 'supersingle' : S < 1.55 ? 'queen' : S < 1.75 ? 'king' : 'largeking';
    return { item: 'bed', params: { bedSize }, score: room === 'bedroom' ? 0.9 : living ? 0.65 : 0.8 };
  }
  if (living && between(L, 1.9, 4.5) && between(S, 1.25, 2.4) && between(f.fill, 0.45, 0.82)) return { item: 'sofa-sectional', params: { width: Math.min(4.5, L), chaise: Math.min(2.4, S) }, score: 0.6 };
  if (living && between(L, 1.2, 3.6) && between(S, 0.75, 1.15) && f.fill > 0.7) return { item: L < 1.8 ? 'sofa-loveseat' : 'sofa-modern', params: { width: L, depth: S }, score: 0.65 };
  // In front of a sofa, a low free-standing table is a coffee table (before the counter, which can be as deep).
  if (ctx.nearSofa && !ctx.atWall && between(L, 0.5, 1.8) && between(S, 0.38, 1.05) && (L / S >= 1.25 || f.fill < 0.85)) return { item: 'coffee-table', params: { width: L, depth: S, shape: f.fill < 0.85 && L / S < 1.15 ? 'round' : 'rect' }, score: 0.7 };
  if (living && between(S, 0.55, 0.72) && L >= 1.2) return { item: 'kitchen-sink-counter', params: { width: Math.min(4, L) }, score: ctx.atWall ? 0.65 : 0.55 };
  if (living && ctx.nearCounter && between(L, 0.55, 0.68) && between(S, 0.52, 0.68)) return { item: 'kitchen-base-cabinet', params: { width: L }, score: 0.55 };
  if (between(L, 0.6, 1.05) && between(S, 0.58, 1.0) && L / S < 1.35 && living && (ctx.dark || ctx.nearCounter)) return { item: 'refrigerator', params: { width: Math.min(1, L) }, score: 0.6 };
  if (ctx.atWall && between(S, 0.53, 0.72) && between(L, 0.8, 4.8) && !living && room !== 'bath') return { item: L > 1.9 ? 'built-in-closet' : 'wardrobe', params: { width: L, depth: S }, score: 0.6 };
  if (ctx.atWall && between(S, 0.3, 0.55) && between(L, 1.0, 2.8) && living) return { item: 'tv-console', params: { width: L, depth: S }, score: 0.55 };
  if ((room === 'bedroom' || ctx.nearBed) && between(L, 0.32, 0.65) && between(S, 0.3, 0.6)) return { item: 'nightstand', params: { width: Math.min(0.7, Math.max(0.35, L)) }, score: ctx.nearBed ? 0.75 : 0.5 };
  if (ctx.atWall && between(S, 0.2, 0.5) && between(L, 0.4, 2.0)) {
    const dresser = room === 'bedroom' && S > 0.38;
    return { item: dresser ? 'dresser' : 'bookshelf', params: dresser ? { width: L } : { width: L, depth: S }, score: 0.45 };
  }
  if (!ctx.plant && f.fill < 0.55 && between(L, 0.45, 1.4) && L / S < 1.5) return { item: 'fiddle-leaf-fig', params: {}, score: 0.45 };
  if (between(L, 0.65, 1.12) && between(S, 0.6, 1.1) && L / S < 1.25 && f.fill > 0.8 && room !== 'bath' && !ctx.atWall) return { item: 'armchair', params: { width: Math.min(1.1, L) }, score: 0.55 };
  if (!ctx.atWall && between(L, 0.5, 1.8) && between(S, 0.38, 1.05) && (L / S >= 1.25 || f.fill < 0.85) && (ctx.nearSofa || room === 'living')) return { item: 'coffee-table', params: { width: L, depth: S, shape: f.fill < 0.85 && L / S < 1.15 ? 'round' : 'rect' }, score: ctx.nearSofa ? 0.7 : 0.5 };
  if (between(L, 0.62, 1.12) && between(S, 0.6, 1.1) && L / S < 1.3 && room !== 'bath') return { item: 'armchair', params: { width: Math.min(1.1, L) }, score: 0.5 };
  if (ctx.atWall && between(L, 0.8, 2.4) && between(S, 0.45, 0.9)) return { item: 'desk', params: { width: L, depth: S }, score: 0.45 };
  if (!ctx.atWall && living && between(L, 0.8, 3) && between(S, 0.7, 1.25)) return { item: 'dining-table', params: { length: L, depth: S, shape: f.fill < 0.85 && L / S < 1.15 ? 'round' : 'rect' }, score: 0.45 };
  if (ctx.carries && !ctx.atWall && L >= 1 && S >= 0.6) return { item: 'rug', params: { width: Math.min(4, L), depth: Math.min(3.5, S), shape: 'rect' }, score: 0.35 };
  return null;
}

// ───────────────────────── recognition

/**
 * The furniture of a plan picture: [{ item, params, position: [x, z], rotation (radians about +Y), size: [w, d],
 * score }] in picture metres (x right, z down). `result`: the recognised walls and openings of the same picture
 * (picture metres); `angle`: the walls' direction (radians; 0 for a square picture).
 */
export function detectFurniture(image, { metresPerPixel: m, result, angle = 0 }) {
  if (!result?.walls?.length) return [];
  const built = planEntities({ ...result, texts: [] }, { level: 'f', keepLeftovers: false });
  const rooms = built.rooms;
  if (!rooms.length) return [];
  const byId = new Map(built.walls.map((w) => [w.id, w]));
  const doors = built.openings.filter((o) => o.item.startsWith('door')).map((o) => {
    const w = byId.get(o.wall); const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    return { c: [w.a[0] + u[0] * o.offset, w.a[1] + u[1] * o.offset], u, width: o.width };
  });
  // What the recognised rooms leave out inside the building (a room whose walls did not close) is one more room.
  const xs = built.walls.flatMap((v) => [v.a[0], v.b[0]]); const zs = built.walls.flatMap((v) => [v.a[1], v.b[1]]);
  const t = Math.max(...built.walls.map((v) => v.thickness)) / 2;
  const rest = [[Math.min(...xs) + t, Math.min(...zs) + t], [Math.max(...xs) - t, Math.min(...zs) + t], [Math.max(...xs) - t, Math.max(...zs) - t], [Math.min(...xs) + t, Math.max(...zs) - t]];
  const scene = furnitureScene(image, { metresPerPixel: m, rooms: rooms.map((r) => r.points), doors, rest });
  const n = scene.width * scene.height;
  // Distance from a point to the nearest wall face (m).
  const wallAt = (p) => {
    let best = null;
    for (const v of built.walls) {
      const d = [v.b[0] - v.a[0], v.b[1] - v.a[1]]; const L2 = d[0] * d[0] + d[1] * d[1] || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - v.a[0]) * d[0] + (p[1] - v.a[1]) * d[1]) / L2));
      const q = [v.a[0] + d[0] * t, v.a[1] + d[1] * t];
      const dist = Math.hypot(p[0] - q[0], p[1] - q[1]) - v.thickness / 2;
      if (!best || dist < best.dist) best = { dist };
    }
    return { dist: best.dist };
  };
  const shapes = [];
  const shape = (pixels) => {
    const f = shapeOf(pixels, scene, m, angle);
    if (f.room < 0) return null;
    const U = [Math.cos(f.axis), Math.sin(f.axis)]; const V = [-U[1], U[0]];
    // The four sides (mid points): `long` = the side runs along the long axis.
    f.sides = [[U, f.long / 2, false], [[-U[0], -U[1]], f.long / 2, false], [V, f.short / 2, true], [[-V[0], -V[1]], f.short / 2, true]].map(([dir, half, long]) => ({ dir, long, ...wallAt([f.centre[0] + dir[0] * half, f.centre[1] + dir[1] * half]) }));
    f.wall = Math.min(...f.sides.map((s) => s.dist));
    const g = 0.299 * f.colour[0] + 0.587 * f.colour[1] + 0.114 * f.colour[2];
    const fl = scene.floor[f.room]; const fg = 0.299 * fl[0] + 0.587 * fl[1] + 0.114 * fl[2];
    const hs = hueOf(f.colour);
    f.dark = g < fg - 70 || g < 60;
    f.plant = hs.s > 0.3 && between(hs.h, 70, 170);
    shapes.push(f);
    return f;
  };
  // Candidate trees: each candidate, and (up to two levels) the halves it can be cut into.
  const tree = (pixels, depth) => {
    const f = shape(pixels);
    if (!f) return null;
    const node = { f, children: [] };
    if (depth < 2 && f.area >= 0.3) for (const parts of cutsOf(f, scene, m)) {
      const kids = parts.map((p) => tree(p, depth + 1));
      if (kids.every(Boolean)) node.children.push(kids);
    }
    return node;
  };
  const roots = scene.candidates.map((c) => tree(c.pixels, 0)).filter(Boolean);
  // Room kinds: the guess from size and shape, a room with a toilet is a bathroom.
  // 'rest': the space no recognised room covers (like a living room, never a bathroom).
  const kinds = [...rooms.map((r) => r.guess ?? 'room'), 'rest'];
  const wet = kinds.map((k) => k === 'bath');
  // Context from what has been chosen so far (pass 2 uses the first pass's choice).
  let chosen = [];
  const overlap = (a, b) => {
    const gu = Math.max(0, Math.max(a.u0, b.u0) - Math.min(a.u1, b.u1)); const gv = Math.max(0, Math.max(a.v0, b.v0) - Math.min(a.v1, b.v1));
    return Math.hypot(gu, gv);
  };
  const contextOf = (f, all) => ({
    room: kinds[f.room], wet: wet[f.room], wall: f.wall, atWall: f.wall <= 0.12, plant: f.plant, dark: f.dark,
    carries: all.some((o) => o.f !== f && o.f.u0 >= f.u0 - 0.03 && o.f.u1 <= f.u1 + 0.03 && o.f.v0 >= f.v0 - 0.03 && o.f.v1 <= f.v1 + 0.03 && o.f.area < f.area * 0.8),
    nearBed: chosen.some((c) => c.name.item === 'bed' && c.f !== f && overlap(c.f, f) <= 0.25),
    nearSofa: chosen.some((c) => c.name.item.startsWith('sofa') && c.f !== f && overlap(c.f, f) <= 1.3),
    nearCounter: chosen.some((c) => c.name.item.startsWith('kitchen') && c.f !== f && overlap(c.f, f) <= 0.1),
  });
  // How much a name explains: its confidence times the area it covers (halves must explain clearly more than the whole).
  const weigh = (name, f) => (name ? name.score * f.area : 0);
  // Best way to explain a tree: the whole as one item, or its halves (each explained best).
  // A big patch reaching from wall to wall is floor (a corridor or a tiled area in another colour), not furniture.
  const floorPatch = (f) => f.area > 2.5 && ((f.sides[0].dist <= 0.15 && f.sides[1].dist <= 0.15) || (f.sides[2].dist <= 0.15 && f.sides[3].dist <= 0.15));
  const best = (node, all) => {
    const name = floorPatch(node.f) ? null : nameShape(node.f, contextOf(node.f, all));
    let pick = { items: name ? [{ f: node.f, name }] : [], weight: weigh(name, node.f) };
    for (const kids of node.children) {
      const parts = kids.map((k) => best(k, all));
      const weight = parts.reduce((s, p) => s + p.weight, 0);
      if (weight > pick.weight * 1.15) pick = { items: parts.flatMap((p) => p.items), weight };
    }
    return pick;
  };
  const choose = () => {
    const all = roots.map((r) => ({ f: r.f }));
    const proposals = roots.flatMap((r) => best(r, all).items).sort((a, b) => weigh(b.name, b.f) - weigh(a.name, a.f));
    const owner = new Int32Array(n).fill(-1);
    const picked = [];
    const rugs = [];
    for (const p of proposals) {
      if (p.name.item === 'rug') { rugs.push(p); continue; }
      let shared = 0; for (const i of p.f.pixels) if (owner[i] >= 0) shared++;
      if (shared > p.f.pixels.length * 0.3) continue;
      // Also not when it covers most of something already chosen (the same thing found twice).
      const hit = new Map(); for (const i of p.f.pixels) if (owner[i] >= 0) hit.set(owner[i], (hit.get(owner[i]) ?? 0) + 1);
      if ([...hit].some(([k, c]) => c > picked[k].f.pixels.length * 0.5)) continue;
      const k = picked.length;
      picked.push(p);
      for (const i of p.f.pixels) if (owner[i] < 0) owner[i] = k;
    }
    // Rugs: under other things, one per place.
    for (const r of rugs) {
      if (picked.some((p) => p.name.item === 'rug' && overlap(p.f, r.f) === 0 && Math.abs(p.f.centre[0] - r.f.centre[0]) < 0.5 && Math.abs(p.f.centre[1] - r.f.centre[1]) < 0.5)) continue;
      picked.push(r);
    }
    return picked;
  };
  chosen = choose();
  for (const c of chosen) if (c.name.item === 'toilet') wet[c.f.room] = true;
  chosen = choose();
  // Footprints in the walls' frame: the same thing found twice (more than half of the smaller one shared) keeps the
  // stronger name; a free-standing thing with another sizeable thing on it is a rug.
  const box = (c) => [c.f.u0, c.f.v0, c.f.u1, c.f.v1];
  const shared = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const areaOf = (a) => (a[2] - a[0]) * (a[3] - a[1]);
  const inside = (outer, inner) => inner[0] >= outer[0] - 0.05 && inner[1] >= outer[1] - 0.05 && inner[2] <= outer[2] + 0.05 && inner[3] <= outer[3] + 0.05;
  for (const a of chosen) {
    if (a.name.item === 'rug') continue;
    const A = box(a);
    const carried = chosen.some((b) => b !== a && b.name.item !== 'rug' && inside(A, box(b)) && b.f.area >= 0.25 && b.f.area < a.f.area * 0.7);
    if (carried && a.f.wall > 0.12) a.name = { item: 'rug', params: { width: Math.min(4, a.f.long), depth: Math.min(3.5, a.f.short), shape: 'rect' }, score: 0.35 };
  }
  const order = [...chosen].sort((p, q) => q.name.score * q.f.area - p.name.score * p.f.area);
  const kept = [];
  for (const c of order) {
    if (c.name.item !== 'rug' && kept.some((k) => k.name.item !== 'rug' && shared(box(k), box(c)) > Math.min(areaOf(box(k)), areaOf(box(c))) * 0.5)) continue;
    if (c.name.item === 'rug' && kept.some((k) => k.name.item === 'rug' && shared(box(k), box(c)) > Math.min(areaOf(box(k)), areaOf(box(c))) * 0.5)) continue;
    kept.push(c);
  }
  chosen = kept;
  // Placement: centre of the rectangle; wall things with their back to the nearest wall.
  const placed = chosen.map(({ f, name }) => {
    const endToWall = END_TO_WALL.has(name.item);
    // Nearly square things: whichever side is nearest a wall is the back.
    const square = f.long / f.short < 1.15;
    const backs = square ? f.sides : f.sides.filter((s) => (endToWall ? !s.long : s.long));
    const back = [...backs].sort((p, q) => p.dist - q.dist)[0];
    const U = [Math.cos(f.axis), Math.sin(f.axis)];
    const free = !WALL_ITEMS.has(name.item) && !(back && back.dist < 0.3);
    // Free things face across their long axis (a table's long side to the room), on the side away from the nearest wall.
    // A side's `dir` is its outward normal (along the rectangle's axes).
    const dir = !free && back ? back.dir : endToWall ? U : (back && back.dist < 1.5 ? back.dir : [-U[1], U[0]]);
    const front = [-dir[0], -dir[1]];
    // Width runs along the back: across the back side's normal.
    const alongBack = back ? Math.abs(back.dir[0] * Math.cos(f.axis) + back.dir[1] * Math.sin(f.axis)) < 0.5 : !endToWall;
    const width = alongBack ? f.long : f.short; const depth = alongBack ? f.short : f.long;
    return { item: name.item, params: name.params, position: f.centre, rotation: Math.atan2(front[0], front[1]), size: [width, depth], score: name.score, box: [f.u0, f.v0, f.u1, f.v1] };
  });
  // A fridge or a loose cabinet at the end of a counter run faces the way the counter does.
  const counters = placed.filter((p) => p.item === 'kitchen-sink-counter');
  for (const p of placed) {
    if (p.item !== 'refrigerator' && p.item !== 'kitchen-base-cabinet') continue;
    const c = counters.find((k) => Math.max(0, Math.max(k.box[0], p.box[0]) - Math.min(k.box[2], p.box[2])) <= 0.15 && Math.max(0, Math.max(k.box[1], p.box[1]) - Math.min(k.box[3], p.box[3])) <= 0.15);
    if (!c) continue;
    const turn = c.rotation - p.rotation;
    // Its footprint swaps width and depth when it turns a quarter.
    if (Math.abs(Math.sin(turn)) > 0.7) p.size = [p.size[1], p.size[0]];
    p.rotation = c.rotation;
  }
  return placed.map(({ box, ...p }) => p);
}
