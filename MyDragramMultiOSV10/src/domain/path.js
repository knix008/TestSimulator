// SVG path data as segments: parsing (M L H V C S Q T A Z, absolute and
// relative), arcs turned into cubic Béziers, and mapping every point through a
// function (scaling, flipping, moving). Used by the Visio import / export and
// by shapes that carry their own outline (imported or freeform).

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Absolute segments: [{ c: 'M'|'L'|'C'|'Q'|'Z', p: [x, y, …] }]. Arcs become C, H/V become L, S/T are expanded. */
export function parsePath(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let x = 0; let y = 0; let sx = 0; let sy = 0;
  let lastC = null; let lastQ = null;
  let match;
  while ((match = re.exec(String(d ?? '')))) {
    const cmd = match[1];
    const nums = (match[2].match(NUM) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    let i = 0;
    const take = (k) => { const v = nums.slice(i, i + k); i += k; return v; };
    if (C === 'Z') { out.push({ c: 'Z', p: [] }); x = sx; y = sy; lastC = lastQ = null; continue; }
    do {
      if (C === 'M') {
        const [a, b] = take(2); if (b === undefined) break;
        x = rel ? x + a : a; y = rel ? y + b : b; sx = x; sy = y;
        out.push({ c: out.length && out[out.length - 1].c !== 'Z' && i > 2 ? 'L' : 'M', p: [x, y] });
        lastC = lastQ = null;
      } else if (C === 'L') {
        const [a, b] = take(2); if (b === undefined) break;
        x = rel ? x + a : a; y = rel ? y + b : b; out.push({ c: 'L', p: [x, y] }); lastC = lastQ = null;
      } else if (C === 'H') {
        const [a] = take(1); if (a === undefined) break;
        x = rel ? x + a : a; out.push({ c: 'L', p: [x, y] }); lastC = lastQ = null;
      } else if (C === 'V') {
        const [a] = take(1); if (a === undefined) break;
        y = rel ? y + a : a; out.push({ c: 'L', p: [x, y] }); lastC = lastQ = null;
      } else if (C === 'C') {
        const v = take(6); if (v.length < 6) break;
        const p = rel ? v.map((val, k) => val + (k % 2 ? y : x)) : v;
        out.push({ c: 'C', p }); lastC = [p[2], p[3]]; lastQ = null; x = p[4]; y = p[5];
      } else if (C === 'S') {
        const v = take(4); if (v.length < 4) break;
        const p = rel ? v.map((val, k) => val + (k % 2 ? y : x)) : v;
        const c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        out.push({ c: 'C', p: [...c1, ...p] }); lastC = [p[0], p[1]]; lastQ = null; x = p[2]; y = p[3];
      } else if (C === 'Q') {
        const v = take(4); if (v.length < 4) break;
        const p = rel ? v.map((val, k) => val + (k % 2 ? y : x)) : v;
        out.push({ c: 'Q', p }); lastQ = [p[0], p[1]]; lastC = null; x = p[2]; y = p[3];
      } else if (C === 'T') {
        const v = take(2); if (v.length < 2) break;
        const p = rel ? [v[0] + x, v[1] + y] : v;
        const c1 = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
        out.push({ c: 'Q', p: [...c1, ...p] }); lastQ = c1; lastC = null; x = p[0]; y = p[1];
      } else if (C === 'A') {
        const v = take(7); if (v.length < 7) break;
        const ex = rel ? v[5] + x : v[5]; const ey = rel ? v[6] + y : v[6];
        for (const seg of arcToCubics(x, y, v[0], v[1], v[2], v[3], v[4], ex, ey)) out.push({ c: 'C', p: seg });
        x = ex; y = ey; lastC = lastQ = null;
      }
    } while (i < nums.length);
  }
  return out;
}

/** An SVG arc as cubic Béziers: [[c1x, c1y, c2x, c2y, x, y], …]. */
export function arcToCubics(x1, y1, rxIn, ryIn, rotation, largeArc, sweep, x2, y2) {
  if ((x1 === x2 && y1 === y2) || !rxIn || !ryIn) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi); const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2; const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy; const y1p = -sin * dx + cos * dy;
  let rx = Math.abs(rxIn); let ry = Math.abs(ryIn);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const sign = Number(largeArc) === Number(sweep) ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (coef * rx * y1p) / ry; const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!Number(sweep) && dt > 0) dt -= 2 * Math.PI;
  if (Number(sweep) && dt < 0) dt += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const delta = dt / segments;
  const k = (4 / 3) * Math.tan(delta / 4);
  const out = [];
  let t = t1;
  const pt = (a) => ({ x: cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, y: cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos });
  const dpt = (a) => ({ x: -rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, y: -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos });
  for (let s = 0; s < segments; s++) {
    const p1 = pt(t); const p2 = pt(t + delta);
    const d1 = dpt(t); const d2 = dpt(t + delta);
    out.push([p1.x + k * d1.x, p1.y + k * d1.y, p2.x - k * d2.x, p2.y - k * d2.y, p2.x, p2.y]);
    t += delta;
  }
  return out;
}

const f = (v) => Number(Number(v).toFixed(3));

/** Segments back to path data. */
export function segmentsToPath(segments) {
  return segments.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.p.map(f).join(' ')}`)).join('');
}

/** Maps every point of the path through fn(x, y) → [x, y]. */
export function mapPath(d, fn) {
  return segmentsToPath(parsePath(d).map((s) => {
    const p = [];
    for (let i = 0; i < s.p.length; i += 2) p.push(...fn(s.p[i], s.p[i + 1]));
    return { c: s.c, p };
  }));
}

export const scalePath = (d, sx, sy) => mapPath(d, (x, y) => [x * sx, y * sy]);

/** Bounding box of a path's points (control points included: a little generous). */
export function pathBounds(d) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const s of parsePath(d)) for (let i = 0; i < s.p.length; i += 2) {
    minX = Math.min(minX, s.p[i]); maxX = Math.max(maxX, s.p[i]); minY = Math.min(minY, s.p[i + 1]); maxY = Math.max(maxY, s.p[i + 1]);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };
}
