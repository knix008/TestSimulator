// TechDraw annotations on a leader: balloons, GD&T feature control frames and
// datum feature symbols (ISO 1101 / ASME Y14.5). Everything is drawn with lines,
// circles, arcs and fills so the canvas, SVG, DXF and print all show the same.

export const LEADER_STYLES = ['note', 'balloon', 'gdt', 'datum'];
export const BALLOON_SHAPES = ['circle', 'hexagon', 'square', 'triangle', 'none'];
/** The 14 geometric characteristics. */
export const GDT_SYMBOLS = [
  'straightness', 'flatness', 'circularity', 'cylindricity', 'profileLine', 'profileSurface',
  'perpendicularity', 'angularity', 'parallelism', 'position', 'concentricity', 'symmetry', 'circularRunout', 'totalRunout',
];
/** Material condition modifiers: none, Ⓜ maximum, Ⓛ least. */
export const GDT_MODIFIERS = ['none', 'M', 'L'];

/** Approximate text width (the same rule as entities.textWidth; kept here to avoid a cycle). */
function textWidth(text, size) {
  let width = 0;
  for (const ch of String(text)) width += /[ᄀ-ᇿ가-힣]/u.test(ch) ? size : ch === ' ' ? size * 0.35 : /[il.,:;'|!]/.test(ch) ? size * 0.3 : /[A-Z0-9mwMW%@]/.test(ch) ? size * 0.68 : size * 0.56;
  return width;
}

const P = (x, y) => ({ x, y });
const line = (a, b) => ({ kind: 'line', a, b });
const poly = (points, closed = false) => ({ kind: 'poly', points, closed });
const circle = (c, r) => ({ kind: 'circle', c, r });
const text = (p, value, size, align = 'center') => ({ kind: 'text', p, text: value, size, angle: 0, align, valign: 'middle' });

/** Parses "A|B|C", "A B C" or "A,B,C" into at most three datum letters. */
export function datumList(value) {
  return String(value ?? '').split(/[|,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

/** One characteristic symbol in a box of size k around c. */
export function gdtSymbol(symbol, c, k) {
  const q = (x, y) => P(c.x + x * k, c.y + y * k);
  const slanted = (offset) => {
    const d = [0.5, 0.866];
    const n = [-0.866, 0.5];
    return line(q(n[0] * offset - d[0] * 0.5, n[1] * offset - d[1] * 0.5), q(n[0] * offset + d[0] * 0.5, n[1] * offset + d[1] * 0.5));
  };
  const runoutArrow = (x0, y0, x1, y1) => {
    const a = q(x0, y0);
    const b = q(x1, y1);
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = P((b.x - a.x) / l, (b.y - a.y) / l);
    const n = P(-d.y, d.x);
    const h = k * 0.28;
    const back = P(b.x - d.x * h, b.y - d.y * h);
    return [line(a, back), { kind: 'fill', points: [b, P(back.x + n.x * h * 0.35, back.y + n.y * h * 0.35), P(back.x - n.x * h * 0.35, back.y - n.y * h * 0.35)] }];
  };
  switch (symbol) {
    case 'straightness': return [line(q(-0.45, 0), q(0.45, 0))];
    case 'flatness': return [poly([q(-0.45, -0.2), q(0.25, -0.2), q(0.45, 0.2), q(-0.25, 0.2)], true)];
    case 'circularity': return [circle(c, 0.4 * k)];
    case 'cylindricity': return [circle(c, 0.28 * k), slanted(0.28), slanted(-0.28)];
    case 'profileLine': return [{ kind: 'arc', c: q(0, -0.2), r: 0.42 * k, start: 0, end: 180 }];
    case 'profileSurface': return [{ kind: 'arc', c: q(0, -0.2), r: 0.42 * k, start: 0, end: 180 }, line(q(-0.42, -0.2), q(0.42, -0.2))];
    case 'perpendicularity': return [line(q(0, -0.4), q(0, 0.42)), line(q(-0.42, -0.4), q(0.42, -0.4))];
    case 'angularity': return [line(q(-0.45, -0.4), q(0.45, -0.4)), line(q(-0.45, -0.4), q(0.4, 0.3))];
    case 'parallelism': return [line(q(-0.38, -0.4), q(0.02, 0.42)), line(q(-0.02, -0.4), q(0.38, 0.42))];
    case 'position': return [circle(c, 0.3 * k), line(q(-0.47, 0), q(0.47, 0)), line(q(0, -0.47), q(0, 0.47))];
    case 'concentricity': return [circle(c, 0.42 * k), circle(c, 0.2 * k)];
    case 'symmetry': return [line(q(-0.45, 0), q(0.45, 0)), line(q(-0.25, 0.25), q(0.25, 0.25)), line(q(-0.25, -0.25), q(0.25, -0.25))];
    case 'circularRunout': return runoutArrow(-0.32, -0.42, 0.32, 0.42);
    case 'totalRunout': return [...runoutArrow(-0.42, -0.42, 0.02, 0.42), ...runoutArrow(0.02, -0.42, 0.46, 0.42), line(q(-0.42, -0.42), q(0.02, -0.42))];
    default: return [];
  }
}

/** ⌀ drawn as a circle with a slash, at height `size`, its middle at c. */
function diameterMark(c, size) {
  const r = size * 0.36;
  return [circle(c, r), line(P(c.x - r * 1.05, c.y - r * 1.05), P(c.x + r * 1.05, c.y + r * 1.05))];
}

/** Where the annotation goes: the leader's last point, facing away from the bend before it. */
function anchor(e) {
  const end = e.points[e.points.length - 1];
  const before = e.points[e.points.length - 2];
  const l = Math.hypot(end.x - before.x, end.y - before.y) || 1;
  return { end, dir: P((end.x - before.x) / l, (end.y - before.y) / l), right: end.x >= before.x };
}

/** Balloon: the item number in a circle (or hexagon, square, triangle) touching the leader's end. */
function balloon(e) {
  const { end, dir } = anchor(e);
  const size = e.size;
  const r = Math.max(size * 1.1, (textWidth(e.text, size) + size) / 2);
  const c = P(end.x + dir.x * r, end.y + dir.y * r);
  const out = [];
  const ring = (n, turn) => poly(Array.from({ length: n }, (_, i) => {
    const a = turn + (i * 2 * Math.PI) / n;
    return P(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
  }), true);
  switch (e.shape) {
    case 'hexagon': out.push(ring(6, 0)); break;
    case 'square': out.push(poly([P(c.x - r, c.y - r), P(c.x + r, c.y - r), P(c.x + r, c.y + r), P(c.x - r, c.y + r)], true)); break;
    case 'triangle': out.push(ring(3, Math.PI / 2)); break;
    case 'none': break;
    default: out.push(circle(c, r));
  }
  if (e.text) out.push(text(c, e.text, size));
  return out;
}

/** Cell widths of a feature control frame: [symbol, tolerance, ...datums]. */
export function gdtCells(e) {
  const size = e.size;
  const h = size * 2;
  const pad = size * 0.5;
  const tolerance = pad + (e.diameter ? size * 1.0 : 0) + textWidth(e.text, size) + (e.modifier && e.modifier !== 'none' ? size * 1.3 : 0) + pad;
  return [h, Math.max(h, tolerance), ...datumList(e.datums).map((d) => Math.max(h, textWidth(d, size) + 2 * pad))];
}

/** Feature control frame: | symbol | ⌀ tolerance Ⓜ | A | B | C |, starting at the leader's end. */
function featureFrame(e) {
  const { end, right } = anchor(e);
  const size = e.size;
  const h = size * 2;
  const cells = gdtCells(e);
  const total = cells.reduce((a, b) => a + b, 0);
  const x0 = right ? end.x : end.x - total;
  const y0 = end.y - h / 2;
  const y1 = end.y + h / 2;
  const out = [poly([P(x0, y0), P(x0 + total, y0), P(x0 + total, y1), P(x0, y1)], true)];
  let x = x0;
  cells.forEach((w, i) => {
    if (i) out.push(line(P(x, y0), P(x, y1)));
    const mid = P(x + w / 2, end.y);
    if (i === 0) out.push(...gdtSymbol(e.symbol, mid, size * 1.3));
    else if (i === 1) {
      let tx = x + size * 0.5;
      if (e.diameter) { out.push(...diameterMark(P(tx + size * 0.4, end.y), size)); tx += size; }
      if (e.text) out.push(text(P(tx, end.y), e.text, size, 'left'));
      tx += textWidth(e.text, size);
      if (e.modifier && e.modifier !== 'none') {
        const c = P(tx + size * 0.7, end.y);
        out.push(circle(c, size * 0.55), text(c, e.modifier, size * 0.75));
      }
    } else out.push(text(mid, datumList(e.datums)[i - 2], size));
    x += w;
  });
  return out;
}

/** Datum feature symbol: a filled triangle on the surface (the leader's tip), the letter in a square at the end. */
function datumSymbol(e) {
  const { end, dir } = anchor(e);
  const size = e.size;
  const s = size * 2;
  const c = P(end.x + dir.x * s / 2, end.y + dir.y * s / 2);
  const tip = e.points[0];
  const second = e.points[1];
  const l = Math.hypot(second.x - tip.x, second.y - tip.y) || 1;
  const d = P((second.x - tip.x) / l, (second.y - tip.y) / l);
  const n = P(-d.y, d.x);
  const t = size * 0.9;
  const out = [
    // The triangle stands on the surface (its base through the tip), pointing along the leader.
    { kind: 'fill', points: [P(tip.x + n.x * t * 0.6, tip.y + n.y * t * 0.6), P(tip.x - n.x * t * 0.6, tip.y - n.y * t * 0.6), P(tip.x + d.x * t, tip.y + d.y * t)] },
    poly([P(c.x - s / 2, c.y - s / 2), P(c.x + s / 2, c.y - s / 2), P(c.x + s / 2, c.y + s / 2), P(c.x - s / 2, c.y + s / 2)], true),
  ];
  if (e.text) out.push(text(c, e.text, size));
  return out;
}

/** The head of a styled leader (the leader line itself is drawn by the caller). */
export function annotationPrimitives(e) {
  if (e.style === 'balloon') return balloon(e);
  if (e.style === 'gdt') return featureFrame(e);
  if (e.style === 'datum') return datumSymbol(e);
  return [];
}

/** A dot for a balloon's end on the part (FreeCAD's default balloon end). */
export function balloonDot(e) {
  const c = e.points[0];
  const r = e.size * 0.25;
  return { kind: 'fill', points: Array.from({ length: 16 }, (_, i) => P(c.x + r * Math.cos((i * Math.PI) / 8), c.y + r * Math.sin((i * Math.PI) / 8))) };
}
