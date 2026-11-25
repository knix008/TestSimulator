// Auto Trace: the outlines of a sketch picture made into sketch curves. The picture's pixels are split into
// shape and background (darker or lighter than a threshold, or near a picked colour); the boundary between them
// is followed exactly along the pixel edges (shape on the left, so outer outlines run counterclockwise and holes
// clockwise); the staircase is smoothed through the edge midpoints; and each loop is fitted with lines, arcs and
// whole circles within a tolerance (recursive splitting at the point farthest from the chord, joined pieces of
// the same line or circle merged). Pure numbers — the app decodes the image and places the result.

/**
 * The shape mask of an image { width, height, data (RGBA bytes) }: mode 'dark' (luminance below the threshold),
 * 'light' (above it) or 'color' (within `tolerance` of `color` [r, g, b]); transparent pixels are background.
 */
export function shapeMask(img, { mode = 'dark', threshold = 128, color = [0, 0, 0], tolerance = 40 } = {}) {
  const { width: W, height: H, data } = img;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[4 * i], g = data[4 * i + 1], b = data[4 * i + 2], a = data[4 * i + 3] ?? 255;
    if (a < 128) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    m[i] = mode === 'light' ? (lum > threshold ? 1 : 0) : mode === 'color' ? (Math.hypot(r - color[0], g - color[1], b - color[2]) <= tolerance ? 1 : 0) : (lum < threshold ? 1 : 0);
  }
  return m;
}

/**
 * The boundary loops of a mask (W × H, row 0 at the top) on the pixel-corner lattice, in image coordinates with y
 * up (corner (x, y) = column x, H − row): shape on the left. Loops enclosing fewer than `minArea` pixels go.
 */
export function maskLoops(mask, W, H, { minArea = 4 } = {}) {
  const at = (x, row) => (x >= 0 && row >= 0 && x < W && row < H ? mask[row * W + x] : 0);
  // Directed unit edges keyed by start corner; with y up, a corner is (x, H - row).
  const out = new Map();
  const add = (x0, y0, x1, y1) => { const k = x0 * 100003 + y0; if (!out.has(k)) out.set(k, []); out.get(k).push([x0, y0, x1, y1]); };
  for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) {
    if (!at(x, row)) continue;
    const yb = H - row - 1; const yt = H - row; // the pixel spans [x, x+1] × [yb, yt]
    if (!at(x, row + 1)) add(x, yb, x + 1, yb); // bottom: left to right
    if (!at(x + 1, row)) add(x + 1, yb, x + 1, yt); // right: up
    if (!at(x, row - 1)) add(x + 1, yt, x, yt); // top: right to left
    if (!at(x - 1, row)) add(x, yt, x, yb); // left: down
  }
  const loops = [];
  const used = new Set();
  const key = (e) => `${e[0]},${e[1]},${e[2]},${e[3]}`;
  for (const list of out.values()) for (const e0 of list) {
    if (used.has(key(e0))) continue;
    const loop = []; let e = e0;
    for (let guard = 0; guard < 4 * W * H + 8; guard++) {
      used.add(key(e)); loop.push([e[0], e[1]]);
      const next = (out.get(e[2] * 100003 + e[3]) ?? []).filter((n) => !used.has(key(n)));
      if (!next.length) break;
      // At a corner two shape pixels touch diagonally: turn left (keeps them apart, the shape on the left).
      const d = [e[2] - e[0], e[3] - e[1]];
      e = next.length === 1 ? next[0] : next.reduce((best, n) => { const nd = [n[2] - n[0], n[3] - n[1]]; const turn = d[0] * nd[1] - d[1] * nd[0]; return turn > 0 ? n : best; }, next[0]);
    }
    let area = 0; for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (Math.abs(area / 2) >= minArea) loops.push(loop);
  }
  return loops;
}

/** The staircase smoothed: the midpoints of the loop's unit edges, then straight runs of the steps averaged. */
export function smoothLoop(loop) {
  const n = loop.length;
  return loop.map((p, i) => { const q = loop[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
}

function circle3(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p) => p[0] * p[0] + p[1] * p[1];
  const cx = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
  const cy = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { c: [cx, cy], r: Math.hypot(a[0] - cx, a[1] - cy) };
}
/** Least-squares circle through points (Kåsa), or null. */
export function fitCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] [A B C] = [sxz syz sz]: x² + y² = A x + B y + C.
  const M = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  const A = M[0][3] / M[0][0], B = M[1][3] / M[1][1], C = M[2][3] / M[2][2];
  const cx = A / 2, cy = B / 2; const r = Math.sqrt(Math.max(0, C + cx * cx + cy * cy));
  return Number.isFinite(r) && r > 0 ? { c: [cx, cy], r } : null;
}
const devLine = (pts, a, b) => { const d = [b[0] - a[0], b[1] - a[1]]; const l = Math.hypot(d[0], d[1]); if (l < 1e-9) return Math.max(0, ...pts.map((p) => Math.hypot(p[0] - a[0], p[1] - a[1]))); return Math.max(0, ...pts.map((p) => Math.abs(d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / l)); };
const devCircle = (pts, c) => Math.max(0, ...pts.map((p) => Math.abs(Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) - c.r)));

/**
 * A closed loop of points fitted with pieces within `tol`: [{ kind: 'circle', c, r }] for a whole circle, or
 * [{ kind: 'line', a, b } | { kind: 'arc', c, r, a, b, ccw }] joined end to end (closed).
 */
export function fitLoop(pts, { tol = 1, minArcPoints = 6, maxRadius = Infinity } = {}) {
  const n = pts.length;
  if (n >= 12) {
    const c = fitCircle(pts);
    if (c && c.r < maxRadius && devCircle(pts, c) <= tol) return [{ kind: 'circle', c: c.c, r: c.r }];
  }
  // Start the walk at the point of sharpest turn (a real corner, when there is one).
  let start = 0; let best = -1; const k = Math.max(2, Math.round(n / 40));
  for (let i = 0; i < n; i++) {
    const a = pts[(i - k + n) % n], b = pts[i], c = pts[(i + k) % n];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const ang = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
    if (ang > best) { best = ang; start = i; }
  }
  const P = [...pts.slice(start), ...pts.slice(0, start), pts[start]];
  const pieces = [];
  const fit = (i, j) => {
    const seg = P.slice(i, j + 1);
    if (j - i <= 1 || devLine(seg, P[i], P[j]) <= tol) { pieces.push({ kind: 'line', a: P[i], b: P[j] }); return; }
    if (j - i + 1 >= minArcPoints) {
      const c = fitCircle(seg) ?? circle3(P[i], P[(i + j) >> 1], P[j]);
      if (c && c.r < maxRadius && devCircle(seg, c) <= tol) {
        // The arc through the ends at that circle (ends moved onto it), the way the points run.
        const ccw = cross2(P[i], P[(i + j) >> 1], P[j], c.c) > 0;
        pieces.push({ kind: 'arc', c: c.c, r: c.r, a: P[i], b: P[j], ccw });
        return;
      }
    }
    // Split at the point farthest from the chord.
    const d = [P[j][0] - P[i][0], P[j][1] - P[i][1]]; const l = Math.hypot(d[0], d[1]) || 1;
    let m = i + 1; let far = -1;
    for (let q = i + 1; q < j; q++) { const dist = l > 1e-9 ? Math.abs(d[0] * (P[q][1] - P[i][1]) - d[1] * (P[q][0] - P[i][0])) / l : Math.hypot(P[q][0] - P[i][0], P[q][1] - P[i][1]); if (dist > far) { far = dist; m = q; } }
    fit(i, m); fit(m, j);
  };
  // A closed run: first split at the point farthest from its start (the chord of a loop has no length).
  let far = 1; let fd = -1;
  for (let q = 1; q < P.length - 1; q++) { const d = Math.hypot(P[q][0] - P[0][0], P[q][1] - P[0][1]); if (d > fd) { fd = d; far = q; } }
  fit(0, far); fit(far, P.length - 1);
  const merged = mergePieces(pieces, tol);
  // The last piece may continue the first (same line or circle) across the start.
  if (merged.length > 2) {
    const first = merged[0]; const last = merged[merged.length - 1];
    const joined = mergePieces([last, first], tol);
    if (joined.length === 1) { merged.pop(); merged[0] = joined[0]; }
  }
  return merged;
}
function cross2(a, m, b, c) {
  const angle = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  let d1 = angle(m) - angle(a); while (d1 <= -Math.PI) d1 += 2 * Math.PI; while (d1 > Math.PI) d1 -= 2 * Math.PI;
  return d1;
}
/** Consecutive lines along one line, and arcs of one circle, made one piece. */
function mergePieces(list, tol) {
  const out = [];
  for (const p of list) {
    const q = out[out.length - 1];
    if (q && q.kind === 'line' && p.kind === 'line' && devLine([q.b], q.a, p.b) <= tol / 2 && devLine([p.a], q.a, p.b) <= tol / 2) { q.b = p.b; continue; }
    // A short line whose ends lie on the neighbouring arc's circle (its sagitta within the tolerance) is part of it.
    const onArc = (arc, line) => { const c = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]); const sag = arc.r - Math.sqrt(Math.max(0, arc.r * arc.r - (c / 2) ** 2)); return sag <= tol && [line.a, line.b].every((x) => Math.abs(Math.hypot(x[0] - arc.c[0], x[1] - arc.c[1]) - arc.r) <= tol); };
    if (q && q.kind === 'arc' && p.kind === 'line' && onArc(q, p)) { q.b = p.b; continue; }
    if (q && q.kind === 'line' && p.kind === 'arc' && onArc(p, q) && out.length > 1) { out[out.length - 1] = { ...p, a: q.a }; continue; }
    if (q && q.kind === 'arc' && p.kind === 'arc' && q.ccw === p.ccw && Math.hypot(q.c[0] - p.c[0], q.c[1] - p.c[1]) <= tol && Math.abs(q.r - p.r) <= tol) { q.b = p.b; q.c = [(q.c[0] + p.c[0]) / 2, (q.c[1] + p.c[1]) / 2]; q.r = (q.r + p.r) / 2; continue; }
    out.push({ ...p });
  }
  return out;
}

/**
 * The whole trace of an image: [{ pieces, hole }] in image units (pixels, y up, origin at the lower-left corner).
 * Options: mask options (mode, threshold, color, tolerance), minArea (px²), tol (px, the fit tolerance).
 */
export function traceImage(img, { minArea = 9, tol = 1, ...maskOptions } = {}) {
  const mask = shapeMask(img, maskOptions);
  return maskLoops(mask, img.width, img.height, { minArea }).map((loop) => {
    let area = 0; for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; area += a[0] * b[1] - b[0] * a[1]; }
    return { pieces: fitLoop(smoothLoop(loop), { tol, maxRadius: Math.max(img.width, img.height) * 4 }), hole: area < 0 };
  });
}

/**
 * Adds traced loops to a sketch, placed as its picture is ({ x, y (centre), width, aspect, angle (degrees) } over an
 * image of imgW × imgH pixels): consecutive pieces share their end points; whole circles stay circles.
 * Returns the curves made.
 */
export function traceToSketch(sketch, traced, picture, imgW, imgH, { addLine, addArc, addCircle, newPoint }) {
  const w = Number(picture.width) || imgW; const h = w * (Number(picture.aspect) || imgH / imgW);
  const sx = w / imgW; const sy = h / imgH;
  const ang = ((Number(picture.angle) || 0) * Math.PI) / 180; const ca = Math.cos(ang); const sa = Math.sin(ang);
  const X = ([px, py]) => { const u = -w / 2 + px * sx; const v = -h / 2 + py * sy; return [(Number(picture.x) || 0) + ca * u - sa * v, (Number(picture.y) || 0) + sa * u + ca * v]; };
  const made = [];
  for (const loop of traced) {
    const P = loop.pieces;
    if (P.length === 1 && P[0].kind === 'circle') { const c = X(P[0].c); made.push(addCircle(sketch, c[0], c[1], P[0].r * sx)); continue; }
    const starts = P.map((p) => newPoint(sketch, ...X(p.a)));
    P.forEach((p, i) => {
      const a = starts[i]; const b = starts[(i + 1) % P.length];
      if (p.kind === 'line') { made.push(addLine(sketch, 0, 0, 0, 0, { from: a.id, to: b.id })); return; }
      const c = X(p.c); const angle = (q) => Math.atan2(q.y - c[1], q.x - c[0]);
      const [from, to] = p.ccw ? [a, b] : [b, a];
      made.push(addArc(sketch, c[0], c[1], p.r * sx, angle(from), angle(to), { from: from.id, to: to.id }));
    });
  }
  return made;
}
