// Reading DXF (text): the group-code pairs, the LAYER table, the BLOCKS and the ENTITIES of a drawing, as the same
// plain model the DWG reader produces (dwg/read.js) — so a DWG and a DXF import go through one path.
//
// Entities: LINE, CIRCLE, ARC, POINT, ELLIPSE, LWPOLYLINE, POLYLINE (with VERTEX … SEQEND), SPLINE, TEXT, MTEXT,
// INSERT, SOLID, DIMENSION (its block). Others are counted as skipped.

const num = (v) => Number(v);

/** Group-code pairs of a DXF text. */
function pairs(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw Object.assign(new Error(`bad group code at line ${i + 1}`), { code: 'dxf-read' });
    // \U+XXXX escapes (DXF 2007+, characters outside the code page) are decoded.
    out.push([code, lines[i + 1].replace(/\s+$/, '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))]);
  }
  return out;
}

/** Splits a run of pairs into records, each starting at a group 0. */
function records(list) {
  const out = []; let cur = null;
  for (const [c, v] of list) {
    if (c === 0) { cur = { type: v, g: [] }; out.push(cur); } else if (cur) cur.g.push([c, v]);
  }
  return out;
}

const first = (g, code, def = undefined) => { const p = g.find(([c]) => c === code); return p ? p[1] : def; };
const all = (g, code) => g.filter(([c]) => c === code).map(([, v]) => v);
const pt = (g, x, def = 0) => [num(first(g, x, def)), num(first(g, x + 10, def)), num(first(g, x + 20, 0))];
const hex = (v) => (v === undefined ? 0 : parseInt(v, 16));

/** One entity record as the plain model (names as the DWG reader's). */
function entity(rec) {
  const g = rec.g; const t = rec.type;
  const base = { handle: hex(first(g, 5)), layerName: first(g, 8, '0'), color: { index: num(first(g, 62, 256)) }, paperSpace: num(first(g, 67, 0)) === 1, extrusion: pt(g, 210, 0).map((x, i) => (first(g, 210 + i * 10) === undefined ? [0, 0, 1][i] : x)) };
  switch (t) {
    case 'LINE': return { ...base, name: 'LINE', start: pt(g, 10), end: pt(g, 11) };
    case 'CIRCLE': return { ...base, name: 'CIRCLE', center: pt(g, 10), radius: num(first(g, 40)) };
    case 'ARC': return { ...base, name: 'ARC', center: pt(g, 10), radius: num(first(g, 40)), startAngle: (num(first(g, 50)) * Math.PI) / 180, endAngle: (num(first(g, 51)) * Math.PI) / 180 };
    case 'POINT': return { ...base, name: 'POINT', point: pt(g, 10) };
    case 'ELLIPSE': return { ...base, name: 'ELLIPSE', center: pt(g, 10), majorAxis: pt(g, 11), ratio: num(first(g, 40)), startParam: num(first(g, 41, 0)), endParam: num(first(g, 42, 2 * Math.PI)) };
    case 'SOLID': case 'TRACE': return { ...base, name: 'SOLID', corners: [pt(g, 10), pt(g, 11), pt(g, 12), pt(g, 13)] };
    case 'LWPOLYLINE': {
      const points = []; const bulges = [];
      for (const [c, v] of g) {
        if (c === 10) { points.push([num(v), 0]); bulges.push(0); }
        else if (c === 20 && points.length) points.at(-1)[1] = num(v);
        else if (c === 42 && points.length) bulges[bulges.length - 1] = num(v);
      }
      return { ...base, name: 'LWPOLYLINE', points, bulges, closed: Boolean(num(first(g, 70, 0)) & 1), elevation: num(first(g, 38, 0)) };
    }
    case 'SPLINE': {
      const control = []; const fit = []; const weights = all(g, 41).map(num);
      for (let i = 0; i < g.length; i++) {
        const [c, v] = g[i];
        if (c === 10) control.push([num(v), 0, 0]); else if (c === 20) control.at(-1)[1] = num(v); else if (c === 30) control.at(-1)[2] = num(v);
        if (c === 11) fit.push([num(v), 0, 0]); else if (c === 21) fit.at(-1)[1] = num(v); else if (c === 31) fit.at(-1)[2] = num(v);
      }
      const flags = num(first(g, 70, 0));
      return { ...base, name: 'SPLINE', degree: num(first(g, 71, 3)), knots: all(g, 40).map(num), control, fit, weights: weights.length ? weights : null, closed: Boolean(flags & 1), periodic: Boolean(flags & 2), rational: Boolean(flags & 4) };
    }
    case 'TEXT': return { ...base, name: 'TEXT', insert: pt(g, 10).slice(0, 2), align: first(g, 11) === undefined ? null : pt(g, 11).slice(0, 2), height: num(first(g, 40, 1)), text: first(g, 1, ''), rotation: (num(first(g, 50, 0)) * Math.PI) / 180, widthFactor: num(first(g, 41, 1)), halign: num(first(g, 72, 0)), valign: num(first(g, 73, 0)) };
    case 'MTEXT': return { ...base, name: 'MTEXT', insert: pt(g, 10), height: num(first(g, 40, 1)), text: [...all(g, 3), first(g, 1, '')].join(''), xAxis: first(g, 11) === undefined ? [Math.cos((num(first(g, 50, 0)) * Math.PI) / 180), Math.sin((num(first(g, 50, 0)) * Math.PI) / 180), 0] : pt(g, 11), attachment: num(first(g, 71, 1)), rectWidth: num(first(g, 41, 0)) };
    case 'INSERT': return { ...base, name: 'INSERT', blockName: first(g, 2, ''), insert: pt(g, 10), scale: [num(first(g, 41, 1)), num(first(g, 42, 1)), num(first(g, 43, 1))], rotation: (num(first(g, 50, 0)) * Math.PI) / 180 };
    case 'DIMENSION': return { ...base, name: 'INSERT', blockName: first(g, 2, ''), insert: [0, 0, 0], scale: [1, 1, 1], rotation: 0, dimension: true };
    default: return null;
  }
}

/**
 * A DXF text as the plain drawing model: { release, layers: Map(name → { name, color }), blocks: Map(name → {
 * name, base, entities }), modelSpace, paperSpace, skipped: { type: count } }.
 */
export function readDxf(text) {
  const list = pairs(text);
  const sections = new Map();
  for (let i = 0; i < list.length; i++) {
    if (list[i][0] === 0 && list[i][1] === 'SECTION' && list[i + 1]?.[0] === 2) {
      const name = list[i + 1][1]; let j = i + 2;
      while (j < list.length && !(list[j][0] === 0 && list[j][1] === 'ENDSEC')) j++;
      sections.set(name, list.slice(i + 2, j)); i = j;
    }
  }
  if (!sections.size) throw Object.assign(new Error('not a DXF file'), { code: 'dxf-read' });
  const header = sections.get('HEADER') ?? [];
  const verAt = header.findIndex(([c, v]) => c === 9 && v === '$ACADVER');
  const release = verAt >= 0 ? header[verAt + 1]?.[1] : 'unknown';
  const layers = new Map();
  for (const rec of records(sections.get('TABLES') ?? [])) if (rec.type === 'LAYER') { const name = first(rec.g, 2, '0'); layers.set(name, { name, color: Math.abs(num(first(rec.g, 62, 7))), on: num(first(rec.g, 62, 7)) >= 0, ltype: first(rec.g, 6, 'CONTINUOUS') }); }
  const skipped = {};
  /** Entities of a record run, POLYLINE … VERTEX … SEQEND folded into one. */
  const entities = (recs) => {
    const out = [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (rec.type === 'POLYLINE') {
        const flags = num(first(rec.g, 70, 0)); const verts = [];
        for (i++; i < recs.length && recs[i].type === 'VERTEX'; i++) verts.push({ point: pt(recs[i].g, 10), bulge: num(first(recs[i].g, 42, 0)), flags: num(first(recs[i].g, 70, 0)) });
        if (flags & (16 | 64)) { skipped.POLYLINE_MESH = (skipped.POLYLINE_MESH ?? 0) + 1; continue; }
        out.push({ handle: hex(first(rec.g, 5)), layerName: first(rec.g, 8, '0'), name: flags & 8 ? 'POLYLINE_3D' : 'POLYLINE_2D', closed: Boolean(flags & 1), elevation: num(first(rec.g, 30, 0)), vertexList: verts, paperSpace: num(first(rec.g, 67, 0)) === 1, extrusion: [0, 0, 1] });
        continue;
      }
      if (rec.type === 'SEQEND' || rec.type === 'ATTRIB' || rec.type === 'VERTEX') continue;
      const e = entity(rec);
      if (e) out.push(e); else skipped[rec.type] = (skipped[rec.type] ?? 0) + 1;
    }
    return out;
  };
  const blocks = new Map();
  const brecs = records(sections.get('BLOCKS') ?? []);
  for (let i = 0; i < brecs.length; i++) {
    if (brecs[i].type !== 'BLOCK') continue;
    const name = first(brecs[i].g, 2, ''); const base = pt(brecs[i].g, 10);
    let j = i + 1; while (j < brecs.length && brecs[j].type !== 'ENDBLK') j++;
    blocks.set(name, { name, base, entities: entities(brecs.slice(i + 1, j)) });
    i = j;
  }
  const ents = entities(records(sections.get('ENTITIES') ?? []));
  const modelSpace = ents.filter((e) => !e.paperSpace); const paperSpace = ents.filter((e) => e.paperSpace);
  // Blocks referenced by name: the DWG reader's insert carries a handle, this one a name; both resolve below.
  const unitsAt = header.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  const units = unitsAt >= 0 ? num(header[unitsAt + 1]?.[1] ?? 0) : 0;
  return { release, units, layers, blocks, modelSpace, paperSpace, skipped };
}
