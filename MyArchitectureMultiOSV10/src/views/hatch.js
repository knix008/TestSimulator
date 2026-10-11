// Poché fills, material hatches and line styles for generated views and
// annotations. Hatch lines are clipped to the polygon analytically, so the
// same code draws on a canvas, into SvgContext (print, PDF, SVG) and into DXF.
// Spacings are paper millimetres; `scale` turns them into model units.

import { LINE_PATTERNS } from "./model.js";

// Material → hatch: lines [{angle, spacing, offset?}], dots, fill tint.
export const HATCHES = {
  concrete: { lines: [{ angle: 45, spacing: 3 }], dots: 1.2, tint: "#c9c9c4" },
  brick: { lines: [{ angle: 45, spacing: 1 }], tint: "#d9a493" },
  insulation: { zigzag: 1.6, tint: "#f3e9b5" },
  plaster: { dots: 0.9, tint: "#efece6" },
  "paint-white": { tint: "#f4f4f2" },
  stone: { lines: [{ angle: 45, spacing: 2.2 }, { angle: 135, spacing: 2.2 }], tint: "#d7cfbf" },
  "wood-cladding": { lines: [{ angle: 0, spacing: 1.2 }], tint: "#dcbf9b" },
  oak: { lines: [{ angle: 0, spacing: 1.2 }], tint: "#dcbf9b" },
  walnut: { lines: [{ angle: 0, spacing: 1.2 }], tint: "#b59377" },
  glass: { tint: "#cfe8f3" },
  "roof-tiles": { lines: [{ angle: 135, spacing: 1.2 }], tint: "#c88c80" },
  "roof-slate": { lines: [{ angle: 135, spacing: 1.2 }], tint: "#9aa1aa" },
  "roof-metal": { solid: true, tint: "#5a6168" },
  steel: { solid: true, tint: "#3a3f45" },
  earth: { lines: [{ angle: 45, spacing: 2 }, { angle: 45, spacing: 2, offset: 0.4 }], tint: "#c8b28c" },
  air: { tint: "#ffffff" },
};
const KIND_HATCH = { roofs: "roof-tiles", stairs: "concrete", columns: "concrete", rooms: "concrete", slabs: "concrete", floors: "concrete", beams: "concrete", furniture: "wood-cladding", openings: "wood-cladding", solids: "concrete" };

export function hatchOf(mat, kind) {
  if (HATCHES[mat]) return HATCHES[mat];
  if (/glass/i.test(mat || "")) return HATCHES.glass;
  if (/metal|steel|alu/i.test(mat || "")) return HATCHES.steel;
  if (/wood|oak|timber|walnut/i.test(mat || "")) return HATCHES.oak;
  if (/tile/i.test(mat || "")) return HATCHES.plaster;
  return HATCHES[KIND_HATCH[kind]] || { lines: [{ angle: 45, spacing: 2.5 }], tint: "#d8d8d8" };
}

// Segments of the family of lines at `angle` (degrees, screen), `spacing`
// apart, inside the polygon (even-odd) → [[x1, y1, x2, y2]].
export function hatchSegments(pts, angle, spacing, offset = 0) {
  if (pts.length < 3 || spacing <= 0) return [];
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const nx = -uy, ny = ux;
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of pts) { const s = x * nx + y * ny; lo = Math.min(lo, s); hi = Math.max(hi, s); }
  const out = [];
  const k0 = Math.ceil((lo - offset) / spacing);
  if ((hi - lo) / spacing > 4000) return out;
  for (let k = k0; k * spacing + offset <= hi; k++) {
    const s = k * spacing + offset;
    const ts = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const sp = p[0] * nx + p[1] * ny, sq = q[0] * nx + q[1] * ny;
      if ((sp <= s) === (sq <= s)) continue;
      const t = (s - sp) / (sq - sp);
      const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
      ts.push(x * ux + y * uy);
    }
    ts.sort((u, v) => u - v);
    for (let i = 0; i + 1 < ts.length; i += 2) out.push([ux * ts[i] + nx * s, uy * ts[i] + ny * s, ux * ts[i + 1] + nx * s, uy * ts[i + 1] + ny * s]);
  }
  return out;
}

function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// Fill a cut polygon. detail: coarse → solid dark poché; medium / fine →
// tint + hatch of the material. o: {scale, mono, lw}
export function drawPoche(ctx, pts, mat, kind, detail, o) {
  const scale = o.scale || 100;
  const hz = hatchOf(mat, kind);
  polyPath(ctx, pts);
  if (detail === "coarse" || hz.solid) {
    ctx.fillStyle = o.mono ? "#202020" : hz.solid ? hz.tint : "#4a4f57";
    ctx.fill();
    return;
  }
  ctx.fillStyle = o.mono ? "#ffffff" : hz.tint || "#dddddd";
  ctx.fill();
  ctx.strokeStyle = o.mono ? "#000000" : "#444444";
  ctx.lineWidth = Math.max(o.lw || 0, 0.09 * scale);
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const l of hz.lines || []) for (const s of hatchSegments(pts, l.angle, l.spacing * scale, (l.offset || 0) * scale)) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
  if (hz.zigzag) {
    // Batt insulation: a zigzag along the long side of the strip.
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [x, y] of pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    const vertical = y2 - y1 > x2 - x1;
    const w = vertical ? x2 - x1 : y2 - y1;
    const stepZ = Math.max(hz.zigzag * scale, w * 0.5);
    const from = vertical ? y1 : x1, to = vertical ? y2 : x2;
    let first = true;
    for (let s = from, i = 0; s <= to + 1e-6; s += stepZ / 2, i++) {
      const across = i % 2 ? (vertical ? x2 : y2) : (vertical ? x1 : y1);
      const [x, y] = vertical ? [across, s] : [s, across];
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  if (hz.dots) {
    const st = hz.dots * scale * 1.6;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [x, y] of pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    if ((x2 - x1) * (y2 - y1) / (st * st) < 20000) {
      ctx.fillStyle = ctx.strokeStyle;
      const r = 0.12 * scale;
      for (let y = Math.floor(y1 / st) * st; y <= y2; y += st) {
        for (let x = Math.floor(x1 / st) * st; x <= x2; x += st) {
          // Deterministic jitter so the dots look scattered.
          const hsh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const jx = x + (hsh - Math.floor(hsh)) * st * 0.7, jy = y + ((hsh * 7) - Math.floor(hsh * 7)) * st * 0.7;
          if (!inPoly(jx, jy, pts)) continue;
          ctx.beginPath();
          ctx.arc(jx, jy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

// Fill patterns of filled regions (annotations).
export const REGION_PATTERNS = ["solid", "hatch", "crosshatch", "concrete", "brick", "insulation", "earth", "wood", "glass"];
export function drawRegionFill(ctx, pts, pattern, color, o) {
  const scale = o.scale || 100;
  if (pattern === "solid") { polyPath(ctx, pts); ctx.fillStyle = color || "#9e9e9e"; ctx.fill(); return; }
  const map = { hatch: { lines: [{ angle: 45, spacing: 2 }] }, crosshatch: { lines: [{ angle: 45, spacing: 2 }, { angle: 135, spacing: 2 }] }, wood: HATCHES.oak };
  const hz = map[pattern] || HATCHES[pattern] || map.hatch;
  polyPath(ctx, pts);
  ctx.fillStyle = o.mono ? "#ffffff" : hz.tint || "#ffffff";
  ctx.fill();
  if (hz.lines) {
    ctx.strokeStyle = color || "#333333";
    ctx.lineWidth = 0.1 * scale;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const l of hz.lines) for (const s of hatchSegments(pts, l.angle, l.spacing * scale, (l.offset || 0) * scale)) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
    ctx.stroke();
  }
  if (!hz.lines && pattern !== "glass") drawPoche(ctx, pts, pattern, "", "fine", o);
}

// Apply a line style (from project.lineStyles) to the context.
export function applyLineStyle(ctx, p, styleId, o) {
  const list = (p && p.lineStyles) || [];
  const st = list.find((s) => s.id === styleId) || list[0] || { weight: 0.18, color: "#000000", pattern: "solid" };
  const scale = o.scale || 100;
  ctx.strokeStyle = o.mono ? "#000000" : st.color || "#000000";
  ctx.lineWidth = Math.max(st.weight * scale, o.minLw || 0);
  const pat = LINE_PATTERNS[st.pattern] || [];
  ctx.setLineDash(pat.map((v) => v * scale));
  return st;
}
