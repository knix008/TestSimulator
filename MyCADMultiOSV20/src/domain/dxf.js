// DXF exchange. Export writes AutoCAD R12 (AC1009) — the most widely readable
// DXF — with layers, line types and colours; parts and dimensions are written
// as their lines, arcs and texts. Import reads the common 2D entities of any
// DXF version (blocks are expanded) into a new drawing.
import { AUTO, createDrawing, isVisible, normalizeLayer } from './drawing.js';
import { firstBaseline, newId, normalizeEntity, primitives } from './entities.js';
import { arcPoints, deg, dist, normDeg, rotate } from './geometry.js';

const hexToRgbSafe = (hex) => {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())?.[1] ?? '000000';
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
};

// ───────────────────────── colours

/** AutoCAD colour index → hex (1–9 exact, the rest approximated). */
export function aciToHex(aci) {
  const table = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: AUTO, 8: '#808080', 9: '#c0c0c0' };
  const index = Math.abs(Math.round(aci));
  if (table[index]) return table[index];
  if (index >= 250 && index <= 255) {
    const v = Math.round(51 + ((index - 250) * (255 - 51)) / 5);
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
  }
  if (index >= 10 && index <= 249) {
    const hue = Math.floor((index - 10) / 10) * 15;
    const step = (index - 10) % 10;
    const value = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][step];
    const saturation = step % 2 ? 0.5 : 1;
    const f = (k) => {
      const kk = (k + hue / 60) % 6;
      return Math.round(255 * (value - value * saturation * Math.max(0, Math.min(kk, 4 - kk, 1))));
    };
    return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }
  return AUTO;
}

/** Nearest of the basic AutoCAD colours (1–9) for a hex colour; "auto" → 7. */
export function hexToAci(hex) {
  if (!hex || hex === AUTO) return 7;
  const rgb = hexToRgbSafe(hex);
  let best = 7;
  let bestDistance = Infinity;
  for (let aci = 1; aci <= 9; aci++) {
    const candidate = aci === 7 ? [255, 255, 255] : hexToRgbSafe(aciToHex(aci));
    const d = (candidate[0] - rgb[0]) ** 2 + (candidate[1] - rgb[1]) ** 2 + (candidate[2] - rgb[2]) ** 2;
    if (d < bestDistance) { bestDistance = d; best = aci; }
  }
  return best;
}

const LTYPE_NAMES = { continuous: 'CONTINUOUS', dashed: 'DASHED', center: 'CENTER', hidden: 'HIDDEN', phantom: 'PHANTOM', dotted: 'DOT' };
const LTYPE_PATTERNS = {
  CONTINUOUS: ['Solid line', []], DASHED: ['Dashed __ __ __', [6, -3]], CENTER: ['Center ____ _ ____', [12, -3, 2, -3]],
  HIDDEN: ['Hidden _ _ _', [3, -2]], PHANTOM: ['Phantom ____ _ _ ____', [12, -3, 2, -3, 2, -3]], DOT: ['Dot . . .', [0, -2]],
};

export function lineTypeFromDxf(name) {
  const value = String(name ?? '').toUpperCase();
  if (!value || value === 'BYLAYER' || value === 'BYBLOCK') return null;
  if (value.includes('CENTER') || value.includes('CENTRE')) return 'center';
  if (value.includes('HIDDEN')) return 'hidden';
  if (value.includes('PHANTOM')) return 'phantom';
  if (value.includes('DOT')) return 'dotted';
  if (value.includes('DASH')) return 'dashed';
  return 'continuous';
}

// ───────────────────────── text encoding

/** Non-ASCII characters as \U+XXXX (how R12 DXF carries Unicode), special symbols as %% codes. */
export function encodeDxfText(text) {
  let out = '';
  for (const ch of String(text)) {
    if (ch === 'Ø' || ch === '⌀') out += '%%c';
    else if (ch === '°') out += '%%d';
    else if (ch === '±') out += '%%p';
    else if (ch.codePointAt(0) > 126 || ch.codePointAt(0) < 32) {
      const code = ch.codePointAt(0);
      if (code <= 0xffff) out += `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    } else out += ch;
  }
  return out;
}

export function decodeDxfText(text) {
  return String(text ?? '')
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%');
}

/** MTEXT formatting codes → plain text with line breaks. */
export function mtextPlain(text) {
  return decodeDxfText(text)
    .replace(/\\P/g, '\n')
    .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*);/g, (_, part) => part.replace(/[#^]/, '/'))
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\\\/g, '\\');
}

// ───────────────────────── export

/**
 * DXF R12 text of the drawing. `entities` limits the export (default: everything visible).
 */
export function exportDxf(drawing, { entities = null } = {}) {
  const out = [];
  const pair = (code, value) => out.push(String(code), typeof value === 'number' ? fmt(value) : String(value));
  const list = (entities ?? drawing.entities).filter((entity) => isVisible(drawing, entity));
  const box = list.length ? list.reduce((acc, entity) => {
    for (const prim of primitives(entity)) {
      const pts = prim.kind === 'circle' || prim.kind === 'arc' ? [{ x: prim.c.x - prim.r, y: prim.c.y - prim.r }, { x: prim.c.x + prim.r, y: prim.c.y + prim.r }] : prim.kind === 'line' ? [prim.a, prim.b] : prim.kind === 'text' ? [prim.p] : prim.points ?? [];
      for (const p of pts) { acc.minX = Math.min(acc.minX, p.x); acc.minY = Math.min(acc.minY, p.y); acc.maxX = Math.max(acc.maxX, p.x); acc.maxY = Math.max(acc.maxY, p.y); }
    }
    return acc;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) : { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1009');
  pair(9, '$INSUNITS'); pair(70, 4);
  pair(9, '$MEASUREMENT'); pair(70, 1);
  pair(9, '$EXTMIN'); pair(10, Number.isFinite(box.minX) ? box.minX : 0); pair(20, Number.isFinite(box.minY) ? box.minY : 0); pair(30, 0);
  pair(9, '$EXTMAX'); pair(10, Number.isFinite(box.maxX) ? box.maxX : 100); pair(20, Number.isFinite(box.maxY) ? box.maxY : 100); pair(30, 0);
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, Object.keys(LTYPE_PATTERNS).length);
  for (const [name, [description, pattern]] of Object.entries(LTYPE_PATTERNS)) {
    pair(0, 'LTYPE'); pair(2, name); pair(70, 0); pair(3, description); pair(72, 65); pair(73, pattern.length);
    pair(40, pattern.reduce((sum, item) => sum + Math.abs(item), 0));
    for (const item of pattern) pair(49, item);
  }
  pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, drawing.layers.length);
  const layerNames = new Map(drawing.layers.map((layer) => [layer.id, dxfName(layer.name)]));
  for (const layer of drawing.layers) {
    pair(0, 'LAYER'); pair(2, layerNames.get(layer.id)); pair(70, layer.locked ? 4 : 0);
    pair(62, (layer.visible ? 1 : -1) * hexToAci(layer.color)); pair(6, LTYPE_NAMES[layer.lineType] ?? 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const entity of list) {
    const layer = layerNames.get(entity.layer) ?? '0';
    const own = (prim) => {
      pair(8, layer);
      const lineType = prim.lineType ?? entity.lineType;
      if (lineType) pair(6, LTYPE_NAMES[lineType] ?? 'CONTINUOUS');
      if (entity.color) pair(62, hexToAci(entity.color));
    };
    for (const prim of primitives(entity)) {
      switch (prim.kind) {
        case 'line':
          pair(0, 'LINE'); own(prim); pair(10, prim.a.x); pair(20, prim.a.y); pair(30, 0); pair(11, prim.b.x); pair(21, prim.b.y); pair(31, 0);
          break;
        case 'circle':
          pair(0, 'CIRCLE'); own(prim); pair(10, prim.c.x); pair(20, prim.c.y); pair(30, 0); pair(40, prim.r);
          break;
        case 'arc':
          pair(0, 'ARC'); own(prim); pair(10, prim.c.x); pair(20, prim.c.y); pair(30, 0); pair(40, prim.r); pair(50, prim.start); pair(51, prim.end);
          break;
        case 'poly':
          pair(0, 'POLYLINE'); own(prim); pair(66, 1); pair(10, 0); pair(20, 0); pair(30, 0); pair(70, prim.closed ? 1 : 0);
          for (const p of prim.points) { pair(0, 'VERTEX'); pair(8, layer); pair(10, p.x); pair(20, p.y); pair(30, 0); }
          pair(0, 'SEQEND'); pair(8, layer);
          break;
        case 'fill': {
          const [a, b, c] = prim.points;
          pair(0, 'SOLID'); own(prim);
          pair(10, a.x); pair(20, a.y); pair(30, 0); pair(11, b.x); pair(21, b.y); pair(31, 0);
          pair(12, c.x); pair(22, c.y); pair(32, 0); pair(13, c.x); pair(23, c.y); pair(33, 0);
          break;
        }
        case 'text': {
          const lines = String(prim.text).split('\n');
          const baseline = firstBaseline(prim);
          lines.forEach((line, i) => {
            const at = rotate({ x: prim.p.x, y: prim.p.y + baseline - i * 1.5 * prim.size }, prim.p, prim.angle);
            const halign = prim.align === 'center' ? 1 : prim.align === 'right' ? 2 : 0;
            pair(0, 'TEXT'); own(prim);
            pair(10, at.x); pair(20, at.y); pair(30, 0); pair(40, prim.size); pair(1, encodeDxfText(line));
            if (prim.angle) pair(50, prim.angle);
            if (halign) { pair(72, halign); pair(11, at.x); pair(21, at.y); pair(31, 0); }
          });
          break;
        }
        default:
          break;
      }
    }
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return `${out.join('\n')}\n`;
}

const fmt = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Layer names DXF accepts. */
export const dxfName = (name) => String(name || '0').replace(/[<>/\\":;?*|=`]/g, '_').slice(0, 255);

// ───────────────────────── import

/** [{ code, value }] pairs of a DXF file. */
export function tokenize(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) throw new Error(`DXF: line ${i + 1} is not a group code`);
    pairs.push({ code, value: lines[i + 1] });
  }
  return pairs;
}

export const looksLikeDxf = (text) => /^\s*0\s*\r?\n\s*SECTION\s*\r?\n/.test(String(text).replace(/^﻿/, '').slice(0, 200));

/** Groups the pairs of a section into records, each starting at a code-0 pair. */
function records(pairs, start, end) {
  const out = [];
  let current = null;
  for (let i = start; i < end; i++) {
    const { code, value } = pairs[i];
    if (code === 0) {
      current = { type: value.trim(), codes: [] };
      out.push(current);
    } else if (current) {
      current.codes.push([code, value]);
    }
  }
  return out;
}

const get = (record, code, fallback = undefined) => {
  const hit = record.codes.find(([c]) => c === code);
  return hit ? hit[1] : fallback;
};
const num = (record, code, fallback = 0) => {
  const value = Number.parseFloat(get(record, code, ''));
  return Number.isFinite(value) ? value : fallback;
};
const all = (record, code) => record.codes.filter(([c]) => c === code).map(([, value]) => value);

const UNIT_SCALE = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0000254, 9: 0.0254, 10: 914.4, 14: 100 };

/** Points of a polyline with bulges (arc segments) as straight segments. */
export function bulgePoints(vertices, closed) {
  const out = [];
  const count = vertices.length;
  for (let i = 0; i < count; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % count];
    out.push({ x: a.x, y: a.y });
    if (!closed && i === count - 1) break;
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) < 1e-9) continue;
    const angle = 4 * Math.atan(bulge);
    const chord = dist(a, b);
    if (chord < 1e-12) continue;
    const r = chord / (2 * Math.sin(Math.abs(angle) / 2));
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
    const dir = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord };
    const side = (bulge > 0) === (Math.abs(angle) < Math.PI) ? 1 : -1;
    const c = { x: middle.x - dir.y * h * side, y: middle.y + dir.x * h * side };
    const start = deg(Math.atan2(a.y - c.y, a.x - c.x));
    const end = deg(Math.atan2(b.y - c.y, b.x - c.x));
    const pts = bulge > 0 ? arcPoints(c.x, c.y, r, start, end, 8) : arcPoints(c.x, c.y, r, end, start, 8).reverse();
    out.push(...pts.slice(1, -1));
  }
  return out;
}

/**
 * Reads a DXF file into a new drawing.
 * Returns { drawing, imported, skipped: { TYPE: count }, units }.
 */
export function importDxf(text, { title = 'DXF', language = 'ko' } = {}) {
  const pairs = tokenize(text);
  const sections = new Map();
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value.trim() === 'SECTION' && pairs[i + 1]?.code === 2) {
      const name = pairs[i + 1].value.trim();
      let end = i + 2;
      while (end < pairs.length && !(pairs[end].code === 0 && pairs[end].value.trim() === 'ENDSEC')) end += 1;
      sections.set(name, [i + 2, end]);
      i = end;
    }
  }
  if (!sections.has('ENTITIES')) throw new Error('DXF: ENTITIES section not found');

  // Units → mm.
  let units = 0;
  if (sections.has('HEADER')) {
    const [start, end] = sections.get('HEADER');
    for (let i = start; i < end; i++) if (pairs[i].code === 9 && pairs[i].value.trim() === '$INSUNITS') units = Number.parseInt(pairs[i + 1]?.value, 10) || 0;
  }
  const unit = UNIT_SCALE[units] ?? 1;

  const drawing = createDrawing({ title, language });
  const layerByName = new Map();
  if (sections.has('TABLES')) {
    const [start, end] = sections.get('TABLES');
    for (const record of records(pairs, start, end)) {
      if (record.type !== 'LAYER') continue;
      const name = (get(record, 2, '0') ?? '0').trim();
      const color = num(record, 62, 7);
      const flags = num(record, 70, 0);
      layerByName.set(name, normalizeLayer({
        id: name === '0' ? '0' : newId('layer'), name, color: aciToHex(color), lineType: lineTypeFromDxf(get(record, 6, 'CONTINUOUS')) ?? 'continuous',
        lineWidth: name === '0' ? 0.5 : 0.25, visible: color >= 0 && !(flags & 1), locked: Boolean(flags & 4),
      }));
    }
  }
  const layerFor = (name) => {
    const key = String(name ?? '0').trim() || '0';
    if (!layerByName.has(key)) layerByName.set(key, normalizeLayer({ id: key === '0' ? '0' : newId('layer'), name: key, color: AUTO, lineType: 'continuous', lineWidth: key === '0' ? 0.5 : 0.25 }));
    return layerByName.get(key).id;
  };

  // Blocks: name → { base, records }.
  const blocks = new Map();
  if (sections.has('BLOCKS')) {
    const [start, end] = sections.get('BLOCKS');
    let current = null;
    for (const record of records(pairs, start, end)) {
      if (record.type === 'BLOCK') current = { name: (get(record, 2, '') ?? '').trim(), base: { x: num(record, 10), y: num(record, 20) }, records: [] };
      else if (record.type === 'ENDBLK') { if (current) blocks.set(current.name, current); current = null; }
      else if (current) current.records.push(record);
    }
  }

  const skipped = {};
  const entities = [];
  const skip = (type) => { skipped[type] = (skipped[type] ?? 0) + 1; };

  /** Converts records into entities; `xf` maps points (block inserts), `scale` multiplies sizes, `turn` adds rotation. */
  function convert(list, xf, scale, turn, depth, inheritedLayer) {
    for (let i = 0; i < list.length; i++) {
      const record = list[i];
      const layerName = get(record, 8, inheritedLayer ?? '0');
      const base = { layer: layerFor(layerName === '0' && inheritedLayer ? inheritedLayer : layerName) };
      const color = num(record, 62, 256);
      if (color > 0 && color < 256 && aciToHex(color) !== AUTO) base.color = aciToHex(color);
      const lineType = lineTypeFromDxf(get(record, 6, ''));
      if (lineType) base.lineType = lineType;
      const P = (xCode, yCode) => xf({ x: num(record, xCode) * unit, y: num(record, yCode) * unit });
      switch (record.type) {
        case 'LINE': {
          const a = P(10, 20); const b = P(11, 21);
          entities.push({ ...base, type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
          break;
        }
        case 'CIRCLE': {
          const c = P(10, 20);
          entities.push({ ...base, type: 'circle', cx: c.x, cy: c.y, r: num(record, 40) * unit * scale });
          break;
        }
        case 'ARC': {
          const c = P(10, 20);
          entities.push({ ...base, type: 'arc', cx: c.x, cy: c.y, r: num(record, 40) * unit * scale, start: normDeg(num(record, 50) + turn), end: normDeg(num(record, 51) + turn) });
          break;
        }
        case 'LWPOLYLINE': {
          const vertices = [];
          for (const [code, value] of record.codes) {
            if (code === 10) vertices.push({ x: Number.parseFloat(value) * unit, y: 0, bulge: 0 });
            else if (code === 20 && vertices.length) vertices[vertices.length - 1].y = Number.parseFloat(value) * unit;
            else if (code === 42 && vertices.length) vertices[vertices.length - 1].bulge = Number.parseFloat(value) || 0;
          }
          const closed = Boolean(num(record, 70) & 1);
          const points = bulgePoints(vertices, closed).map(xf);
          if (points.length >= 2) entities.push({ ...base, type: 'polyline', points, closed });
          break;
        }
        case 'POLYLINE': {
          const closed = Boolean(num(record, 70) & 1);
          const vertices = [];
          while (list[i + 1] && list[i + 1].type === 'VERTEX') {
            i += 1;
            vertices.push({ x: num(list[i], 10) * unit, y: num(list[i], 20) * unit, bulge: num(list[i], 42) });
          }
          if (list[i + 1]?.type === 'SEQEND') i += 1;
          const points = bulgePoints(vertices, closed).map(xf);
          if (points.length >= 2) entities.push({ ...base, type: 'polyline', points, closed });
          break;
        }
        case 'TEXT': case 'ATTRIB': {
          const halign = num(record, 72, 0);
          const at = halign ? P(11, 21) : P(10, 20);
          const value = decodeDxfText(get(record, 1, ''));
          if (value.trim()) entities.push({ ...base, type: 'text', x: at.x, y: at.y, text: value, size: num(record, 40, 2.5) * unit * scale, angle: normDeg(num(record, 50) + turn), align: halign === 1 || halign === 4 ? 'center' : halign === 2 ? 'right' : 'left' });
          break;
        }
        case 'MTEXT': {
          const at = P(10, 20);
          const value = mtextPlain([...all(record, 3), get(record, 1, '')].join(''));
          const size = num(record, 40, 2.5) * unit * scale;
          let angle = num(record, 50, NaN);
          if (!Number.isFinite(angle)) angle = deg(Math.atan2(num(record, 21, 0), num(record, 11, 1)));
          // MTEXT is anchored at its top-left: move to the first baseline.
          const first = rotate({ x: at.x, y: at.y - size }, at, angle + turn);
          if (value.trim()) entities.push({ ...base, type: 'text', x: first.x, y: first.y, text: value, size, angle: normDeg(angle + turn) });
          break;
        }
        case 'ELLIPSE': {
          const c = P(10, 20);
          const major = { x: num(record, 11) * unit * scale, y: num(record, 21) * unit * scale };
          const rx = Math.hypot(major.x, major.y);
          const ratio = num(record, 40, 1);
          const angle = normDeg(deg(Math.atan2(major.y, major.x)) + turn);
          const t0 = num(record, 41, 0);
          const t1 = num(record, 42, Math.PI * 2);
          if (Math.abs(t1 - t0 - Math.PI * 2) < 1e-6 || Math.abs(t1 - t0) < 1e-9) {
            entities.push({ ...base, type: 'ellipse', cx: c.x, cy: c.y, rx, ry: rx * ratio, angle });
          } else {
            const end = t1 > t0 ? t1 : t1 + Math.PI * 2;
            const steps = Math.max(8, Math.ceil(((end - t0) / (Math.PI * 2)) * 72));
            const points = Array.from({ length: steps + 1 }, (_, k) => {
              const t = t0 + ((end - t0) * k) / steps;
              return rotate({ x: c.x + rx * Math.cos(t), y: c.y + rx * ratio * Math.sin(t) }, c, angle);
            });
            entities.push({ ...base, type: 'polyline', points, closed: false });
          }
          break;
        }
        case 'SPLINE': {
          const xs = all(record, 11).length ? all(record, 11) : all(record, 10);
          const ys = all(record, 11).length ? all(record, 21) : all(record, 20);
          const points = xs.map((x, k) => xf({ x: Number.parseFloat(x) * unit, y: Number.parseFloat(ys[k] ?? 0) * unit }));
          if (points.length >= 2) entities.push({ ...base, type: 'polyline', points, closed: Boolean(num(record, 70) & 1) });
          break;
        }
        case 'SOLID': case 'TRACE': case '3DFACE': {
          const pts = [P(10, 20), P(11, 21), P(13, 23), P(12, 22)];
          entities.push({ ...base, type: 'polyline', points: pts.filter((p, k) => k === 0 || dist(p, pts[k - 1]) > 1e-9), closed: true });
          break;
        }
        case 'INSERT': case 'DIMENSION': {
          const block = blocks.get((get(record, 2, '') ?? '').trim());
          if (!block || depth > 8) { skip(record.type); break; }
          const at = record.type === 'DIMENSION' ? { x: 0, y: 0 } : { x: num(record, 10) * unit, y: num(record, 20) * unit };
          const sx = record.type === 'DIMENSION' ? 1 : num(record, 41, 1);
          const sy = record.type === 'DIMENSION' ? 1 : num(record, 42, sx);
          const rotation = record.type === 'DIMENSION' ? 0 : num(record, 50, 0);
          const inner = (p) => {
            const local = { x: (p.x - block.base.x * unit) * sx, y: (p.y - block.base.y * unit) * sy };
            return xf(rotate({ x: at.x + local.x, y: at.y + local.y }, at, rotation));
          };
          convert(block.records, inner, scale * Math.abs(sx), turn + rotation, depth + 1, layerName);
          break;
        }
        case 'VERTEX': case 'SEQEND': case 'ATTDEF': case 'VIEWPORT': break;
        default:
          skip(record.type);
      }
    }
  }

  const [start, end] = sections.get('ENTITIES');
  convert(records(pairs, start, end), (p) => p, 1, 0, 0, null);
  drawing.layers = layerByName.size ? [...layerByName.values()] : drawing.layers;
  if (!drawing.layers.some((layer) => layer.id === '0')) drawing.layers.unshift(normalizeLayer({ id: '0', name: '0', color: AUTO, lineType: 'continuous', lineWidth: 0.5 }));
  drawing.activeLayer = drawing.layers[0].id;
  drawing.entities = entities.map(normalizeEntity).filter(Boolean);
  return { drawing, imported: drawing.entities.length, skipped, units };
}

