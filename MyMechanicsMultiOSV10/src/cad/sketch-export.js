// A sketch as a 2D drawing (DXF text or, through dwg/write.js, DWG): its geometry in the sketch plane's own
// coordinates (millimetres) on one layer. Construction geometry and the origin are left out.
//   line → LINE, circle → CIRCLE, arc → ARC, ellipse → ELLIPSE, spline → LWPOLYLINE (its curve as a fine
//   polyline), point → POINT, text → TEXT.
import { arcGeometry, polyline } from './sketch.js';

/** The sketch's entities in the plain drawing model of dxf-read.js / dwg/read.js. */
export function sketchToEntities(sketch, layer = 'SKETCH') {
  const map = new Map(sketch.entities.map((e) => [e.id, e]));
  const out = [];
  const used = new Set();
  for (const e of sketch.entities) {
    if (e.construction) continue;
    for (const k of ['p1', 'p2', 'c']) if (e[k]) used.add(e[k]);
    if (e.type === 'spline') for (const p of e.pts) used.add(p);
    const P = (id) => { const p = map.get(id); return [p.x, p.y, 0]; };
    if (e.type === 'line') out.push({ name: 'LINE', layerName: layer, start: P(e.p1), end: P(e.p2) });
    else if (e.type === 'circle') out.push({ name: 'CIRCLE', layerName: layer, center: P(e.c), radius: e.r });
    else if (e.type === 'arc') { const g = arcGeometry(sketch, e, map); out.push({ name: 'ARC', layerName: layer, center: [g.cx, g.cy, 0], radius: g.r, startAngle: norm(g.a0), endAngle: norm(g.a1) }); }
    else if (e.type === 'ellipse') {
      const c = P(e.c); const rot = e.rot ?? 0; const major = e.rx >= e.ry;
      const a = major ? e.rx : e.ry; const ang = major ? rot : rot + Math.PI / 2;
      out.push({ name: 'ELLIPSE', layerName: layer, center: c, majorAxis: [a * Math.cos(ang), a * Math.sin(ang), 0], ratio: Math.min(e.rx, e.ry) / Math.max(e.rx, e.ry), startParam: 0, endParam: 2 * Math.PI });
    } else if (e.type === 'spline') {
      const pts = polyline(sketch, e, map);
      const closed = e.pts.length > 2 && e.pts[0] === e.pts.at(-1);
      out.push({ name: 'LWPOLYLINE', layerName: layer, points: (closed ? pts.slice(0, -1) : pts).map(([x, y]) => [x, y]), bulges: [], closed });
    } else if (e.type === 'text') out.push({ name: 'TEXT', layerName: layer, insert: [e.x, e.y], height: (Number(e.size) || 10) * 0.72, text: String(e.text ?? ''), rotation: e.rot ?? 0 });
  }
  for (const e of sketch.entities) if (e.type === 'point' && !e.origin && !e.construction && !used.has(e.id)) out.push({ name: 'POINT', layerName: layer, point: [e.x, e.y, 0] });
  return out;
}
const norm = (a) => { let x = a % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x; };

/** DXF text (R12-style sections, millimetres) of plain-model entities on their layers. */
export function entitiesToDxf(entities, layers = [{ name: 'SKETCH', color: 7 }]) {
  const f = (v) => String(Math.round(Number(v) * 1e9) / 1e9);
  const deg = (r) => f((r * 180) / Math.PI);
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.length)];
  for (const l of layers) out.push('0', 'LAYER', '2', l.name, '70', '0', '62', String(l.color ?? 7), '6', l.ltype ?? 'CONTINUOUS');
  out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  const pt = (code, p) => [String(code), f(p[0]), String(code + 10), f(p[1]), String(code + 20), f(p[2] ?? 0)];
  for (const e of entities) {
    const head = ['0', e.name, '8', e.layerName ?? '0'];
    if (e.name === 'LINE') out.push(...head, ...pt(10, e.start), ...pt(11, e.end));
    else if (e.name === 'CIRCLE') out.push(...head, ...pt(10, e.center), '40', f(e.radius));
    else if (e.name === 'ARC') out.push(...head, ...pt(10, e.center), '40', f(e.radius), '50', deg(e.startAngle), '51', deg(e.endAngle));
    else if (e.name === 'ELLIPSE') out.push(...head, ...pt(10, e.center), ...pt(11, e.majorAxis), '40', f(e.ratio), '41', f(e.startParam), '42', f(e.endParam));
    else if (e.name === 'POINT') out.push(...head, ...pt(10, e.point));
    else if (e.name === 'TEXT') out.push(...head, ...pt(10, [e.insert[0], e.insert[1], 0]), '40', f(e.height), '1', e.text, '50', deg(e.rotation ?? 0));
    else if (e.name === 'LWPOLYLINE') { out.push(...head, '90', String(e.points.length), '70', e.closed ? '1' : '0'); for (const [x, y] of e.points) out.push('10', f(x), '20', f(y)); }
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}
