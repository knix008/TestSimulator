// IDF export (MCAD → ECAD): a board solid's outline, cutouts and round holes, and the packages placed on it, written
// as an IDF 3.0 board file (.emn) and library file (.emp) in millimetres. Lines and circular arcs go as they are;
// other curves (splines, ellipses) as short lines, since IDF holds only those two.
import { rep } from './kernel.js';
import { faceSampler } from './mold-brep.js';

const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const fmtNum = (v) => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? '0' : String(r); };

/** A planar face's normal (BRepGProp: the face's orientation included). */
function planarNormal(face) {
  const S = faceSampler(face);
  try { const b = S.bounds; return S.at((b.uMin + b.uMax) / 2, (b.vMin + b.vMax) / 2).n; } finally { S.delete(); }
}

/**
 * The pieces of a wire, chained end to end: [{ a, b, angle (degrees, + counter-clockwise seen from +Z) }], or one
 * { circle, c, r } for a lone full circle.
 */
export function wireChain(wire) {
  const R = rep(); const oc = R.getOC();
  const segs = [];
  for (const e of R.iterTopo(wire.wrapped, 'edge')) {
    const edge = R.cast(e);
    const ad = new oc.BRepAdaptor_Curve(oc.TopoDS.Edge(edge.wrapped));
    try {
      const f = ad.FirstParameter(); const l = ad.LastParameter();
      const at = (u) => { const p = ad.Value(u); const out = [p.X(), p.Y()]; p.delete(); return out; };
      const p0 = at(f); const p1 = at(l);
      if (edge.geomType === 'LINE') segs.push({ a: p0, b: p1, angle: 0 });
      else if (edge.geomType === 'CIRCLE') {
        const ci = ad.Circle(); const c = ci.Location(); const centre = [c.X(), c.Y()]; const r = ci.Radius();
        if (Math.abs(l - f - 2 * Math.PI) < 1e-7) { segs.push({ circle: true, c: centre, r }); continue; }
        // The turn's sense from three points along it.
        const m = at((f + l) / 2);
        const cross = (m[0] - p0[0]) * (p1[1] - m[1]) - (m[1] - p0[1]) * (p1[0] - m[0]);
        segs.push({ a: p0, b: p1, angle: (((l - f) * 180) / Math.PI) * (cross >= 0 ? 1 : -1) });
      } else {
        const n = 24; let prev = p0;
        for (let i = 1; i <= n; i++) { const q = at(f + ((l - f) * i) / n); segs.push({ a: prev, b: q, angle: 0 }); prev = q; }
      }
    } finally { ad.delete(); }
  }
  if (segs.length === 1 && segs[0].circle) return segs;
  // Each next piece starts where the last ended (turned round when it runs the other way).
  const tol = 1e-6;
  const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
  const left = segs.filter((s) => !s.circle); const out = [left.shift()];
  while (left.length) {
    const end = out.at(-1).b;
    let i = left.findIndex((s) => same(s.a, end));
    if (i >= 0) { out.push(left.splice(i, 1)[0]); continue; }
    i = left.findIndex((s) => same(s.b, end));
    if (i < 0) break;
    const s = left.splice(i, 1)[0]; out.push({ a: s.b, b: s.a, angle: -s.angle });
  }
  return out;
}

/** IDF loop records of a chain (closed: back at the first point); a lone circle as its centre then 360. */
export function chainRecords(chain) {
  if (chain.length === 1 && chain[0].circle) { const { c, r } = chain[0]; return [{ x: c[0], y: c[1], angle: 0 }, { x: c[0] + r, y: c[1], angle: 360 }]; }
  return [{ x: chain[0].a[0], y: chain[0].a[1], angle: 0 }, ...chain.map((s) => ({ x: s.b[0], y: s.b[1], angle: s.angle }))];
}

/** Twice the signed area of a loop (arcs add their segment: the sense comes out right for any loop). */
export function loopSense(pts) {
  let a = 0;
  for (let i = 1; i < pts.length; i++) {
    const P = pts[i - 1]; const Q = pts[i];
    a += P.x * Q.y - Q.x * P.y;
    if (Q.angle && Math.abs(Q.angle) < 360) {
      const th = (Q.angle * Math.PI) / 180; const c = Math.hypot(Q.x - P.x, Q.y - P.y); const r = c / (2 * Math.sin(Math.abs(th) / 2));
      a += Math.sign(th) * r * r * (Math.abs(th) - Math.sin(Math.abs(th)));
    }
  }
  return a;
}

/** A loop turned round (records reversed, each arc's angle negated and moved to its new end record). */
export function reverseLoop(pts) {
  const out = [{ x: pts.at(-1).x, y: pts.at(-1).y, angle: 0 }];
  for (let i = pts.length - 1; i > 0; i--) out.push({ x: pts[i - 1].x, y: pts[i - 1].y, angle: -pts[i].angle });
  return out;
}

/** A chain that is one whole circle (a single closed edge, or arcs round one centre adding up to 360°): the hole. */
function roundHole(chain) {
  if (chain.length === 1 && chain[0].circle) return { d: 2 * chain[0].r, x: chain[0].c[0], y: chain[0].c[1] };
  if (!chain.every((sg) => sg.angle)) return null;
  const total = chain.reduce((sum, sg) => sum + sg.angle, 0);
  if (Math.abs(Math.abs(total) - 360) > 1e-6) return null;
  // Every arc's centre (from its chord and angle) the same.
  const centres = chain.map((sg) => {
    const th = (sg.angle * Math.PI) / 180; const dx = sg.b[0] - sg.a[0]; const dy = sg.b[1] - sg.a[1]; const c = Math.hypot(dx, dy);
    const d = c / 2 / Math.tan(th / 2);
    return [(sg.a[0] + sg.b[0]) / 2 - (dy / c) * d, (sg.a[1] + sg.b[1]) / 2 + (dx / c) * d];
  });
  if (!centres.every((c) => Math.hypot(c[0] - centres[0][0], c[1] - centres[0][1]) < 1e-6)) return null;
  const r = Math.hypot(chain[0].a[0] - centres[0][0], chain[0].a[1] - centres[0][1]);
  return { d: 2 * r, x: centres[0][0], y: centres[0][1] };
}

/**
 * The board of a solid: its top face (the largest looking up +Z), the thickness (its Z extent), the outer loop
 * (counter-clockwise), cutouts (clockwise) and round through holes as drilled holes.
 */
export function boardFromBody(body) {
  const [lo, hi] = body.boundingBox.bounds;
  const R = rep(); const oc = R.getOC();
  const tops = body.faces.filter((f) => f.geomType === 'PLANE' && planarNormal(f)[2] > 0.999);
  if (!tops.length) throw Object.assign(new Error('no flat top face'), { code: 'idf-no-top' });
  const top = tops.reduce((a, b) => (R.measureArea(b) > R.measureArea(a) ? b : a));
  const outerWire = R.cast(oc.BRepTools.OuterWire(oc.TopoDS.Face(top.wrapped)));
  const loops = []; const holes = [];
  let k = 1;
  for (const w of R.iterTopo(top.wrapped, 'wire')) {
    const wire = R.cast(w);
    const chain = wireChain(wire);
    const isOuter = wire.isSame(outerWire);
    const round = roundHole(chain);
    if (!isOuter && round) { holes.push(round); continue; }
    let pts = chainRecords(chain);
    if ((loopSense(pts) > 0) !== isOuter) pts = reverseLoop(pts);
    loops.push({ label: isOuter ? 0 : k++, pts });
  }
  loops.sort((a, b) => a.label - b.label);
  return { thickness: hi[2] - lo[2], bottom: lo[2], top: hi[2], loops, holes };
}

/**
 * A package's outline and height from its solid: the bottom face (the largest looking down at the lowest Z) seen
 * from above, else the solid's bounding rectangle.
 */
export function packageFromBody(body) {
  const [lo, hi] = body.boundingBox.bounds;
  const R = rep(); const oc = R.getOC();
  const downs = body.faces.filter((f) => f.geomType === 'PLANE' && Math.abs(vec(f.center)[2] - lo[2]) < 1e-6 && planarNormal(f)[2] < -0.999);
  let pts;
  if (downs.length) {
    const f = downs.reduce((a, b) => (R.measureArea(b) > R.measureArea(a) ? b : a));
    pts = chainRecords(wireChain(R.cast(oc.BRepTools.OuterWire(oc.TopoDS.Face(f.wrapped)))));
    if (loopSense(pts) < 0) pts = reverseLoop(pts);
  } else pts = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]], [lo[0], lo[1]]].map(([x, y]) => ({ x, y, angle: 0 }));
  return { height: hi[2] - lo[2], base: lo[2], loops: [{ label: 0, pts }] };
}

/** The side, rotation (degrees about Z) and mounting offset of a component placed against a board (top / bottom Z). */
export function placementOf(position, quat, board) {
  const [x, y, z, w] = quat;
  const rot = ([vx, vy, vz]) => {
    const ix = w * vx + y * vz - z * vy; const iy = w * vy + z * vx - x * vz; const iz = w * vz + x * vy - y * vx; const iw = -x * vx - y * vy - z * vz;
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
  };
  const up = rot([0, 0, 1]); const ex = rot([1, 0, 0]);
  const bottom = up[2] < 0;
  const dir = bottom ? [-ex[0], -ex[1]] : [ex[0], ex[1]];
  let deg = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  if (deg < -1e-9) deg += 360;
  deg = Math.round(deg * 1e6) / 1e6; if (deg >= 360) deg -= 360;
  return { side: bottom ? 'BOTTOM' : 'TOP', rotation: deg + 0, offset: bottom ? board.bottom - position[2] : position[2] - board.top };
}

const loopText = (loops) => loops.flatMap((l) => l.pts.map((p) => `${l.label} ${fmtNum(p.x)} ${fmtNum(p.y)} ${fmtNum(p.angle)}`)).join('\n');
const quoted = (s) => `"${String(s ?? '').replace(/"/g, '″')}"`;
const word = (s) => String(s ?? '').trim().replace(/\s+/g, '_') || 'NONAME';
const stamp = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}.${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

/** The board file (IDF 3.0, mm). placements: [{ pkg, partNo, refdes, x, y, offset, rotation, side }]. */
export function writeIdfBoard({ name, board, placements = [], date = new Date() }) {
  const out = ['.HEADER', `BOARD_FILE 3.0 "MyMechanics" ${stamp(date)} 1`, `${word(name)} MM`, '.END_HEADER',
    '.BOARD_OUTLINE MCAD', fmtNum(board.thickness), loopText(board.loops), '.END_BOARD_OUTLINE'];
  if (board.holes.length) out.push('.DRILLED_HOLES', ...board.holes.map((h) => `${fmtNum(h.d)} ${fmtNum(h.x)} ${fmtNum(h.y)} NPTH BOARD MTG MCAD`), '.END_DRILLED_HOLES');
  if (placements.length) out.push('.PLACEMENT', ...placements.flatMap((p) => [`${word(p.pkg)} ${quoted(p.partNo)} ${word(p.refdes)}`, `${fmtNum(p.x)} ${fmtNum(p.y)} ${fmtNum(p.offset)} ${fmtNum(p.rotation)} ${p.side} MCAD`]), '.END_PLACEMENT');
  return `${out.join('\n')}\n`;
}

/** The library file (IDF 3.0, mm): each package's outline and height. packages: [{ pkg, partNo, height, loops, mechanical }]. */
export function writeIdfLibrary(packages, { date = new Date() } = {}) {
  const out = ['.HEADER', `LIBRARY_FILE 3.0 "MyMechanics" ${stamp(date)} 1`, '.END_HEADER'];
  for (const p of packages) {
    const tag = p.mechanical ? 'MECHANICAL' : 'ELECTRICAL';
    out.push(`.${tag}`, `${word(p.pkg)} ${quoted(p.partNo)} MM ${fmtNum(p.height)}`, loopText(p.loops), `.END_${tag}`);
  }
  return `${out.join('\n')}\n`;
}
