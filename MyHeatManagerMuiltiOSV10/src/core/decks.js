// Reading solver decks back into a model: Nastran / Simcenter bulk data (.bdf/.dat/.nas), Ansys MAPDL archives
// (.cdb), CalculiX / Abaqus input (.inp) and COMSOL text meshes (.mphtxt). Each reader collects nodes, cells,
// material groups (with k, ρ, cp when the deck has them), boundary faces with their values and volumetric heat;
// the geometry is then handed to gmshToModel as an MSH 2.2 text (the same outline tracing as a Gmsh import) and
// the properties, boundary values and body powers are put back. The engine's grid is structured, so curved or
// tetrahedral meshes come in as traced outlines or bounding boxes (gmshToModel warns). Pure functions, unit-tested.
import { gmshToModel } from './formats.js';
import { normalizeModel, bodyContains } from './model.js';

const finite = (v) => Number.isFinite(v);
const fmt = (v) => String(Number(Number(v).toPrecision(10)));

// ───────────────────────── shared mesh → model step

/** Corner-node lists of the faces of a cell, in the solver's own face numbering (index 0 = face 1). */
const FACE_NODES = {
  quad: [[0, 1], [1, 2], [2, 3], [3, 0]],
  tri: [[0, 1], [1, 2], [2, 0]],
  // Abaqus / CalculiX C3D8 and DC3D8: F1 1-2-3-4, F2 5-8-7-6, F3 1-5-6-2, F4 2-6-7-3, F5 3-7-8-4, F6 4-8-5-1.
  hex: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
  tet: [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]],
  wedge: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]],
};
// Ansys PLANE55 / SOLID70 faces (I J K L M N O P = 0..7).
const ANSYS_FACES = {
  quad: [[0, 1], [1, 2], [2, 3], [3, 0]],
  hex: [[1, 0, 3, 2], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]],
};
const GMSH_TYPE = { quad: 3, tri: 2, hex: 5, tet: 4, wedge: 6 };
const FACE_TYPE = (n) => (n === 2 ? 1 : n === 3 ? 2 : 3);
const DIM = { quad: 2, tri: 2, hex: 3, tet: 3, wedge: 3 };

/**
 * A fresh collector the readers fill:
 *  nodes Map(id → [x, y, z]) in deck units; cells [{ id, kind, nodes: [ids], group }]; groups Map(key → { name, k, kx,
 *  ky, kz, rho, cp, thickness }); faces [{ nodes: [ids], bc: { type, name?, T?, q?, h?, Tinf?, emissivity?, Tamb? } }];
 *  heat Map(cellId → W/m³); nodeT Map(nodeId → °C) for fixed temperatures; si (true = metres), initialT, warnings.
 */
function collector() {
  return { nodes: new Map(), cells: [], groups: new Map(), faces: [], heat: new Map(), nodeT: new Map(), si: null, initialT: null, domain: null, warnings: [] };
}

/**
 * The domain our own exports note in a comment ("MyHeatManager domain <dim> <width> <height> <depth> <nx> <ny> <nz>", mm),
 * so the empty cells around the bodies and the grid come back exactly; null for decks from other programs.
 */
function savedDomain(text) {
  const m = String(text).match(/MyHeatManager domain\s+([23])\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}

/** Faces used by exactly one cell (the outside of the mesh), with the cell that owns each. */
function outerFaces(c) {
  const seen = new Map();
  for (const cell of c.cells) {
    for (const local of FACE_NODES[cell.kind]) {
      const ids = local.map((i) => cell.nodes[i]);
      const key = [...ids].sort((a, b) => a - b).join(',');
      const hit = seen.get(key);
      if (hit) hit.count++;
      else seen.set(key, { ids, cell, count: 1 });
    }
  }
  return [...seen.values()].filter((f) => f.count === 1);
}

/** Boundary value key → one boundary group (faces with the same type and values share a condition). */
function bcKey(bc) {
  return [bc.type, bc.name ?? '', bc.T, bc.q, bc.h, bc.Tinf, bc.emissivity, bc.Tamb].map((v) => (v == null ? '' : fmt(v))).join('|');
}

const TYPE_NAME = {
  ko: { temperature: '고정 온도', flux: '열유속', convection: '대류', radiation: '복사' },
  en: { temperature: 'Fixed temperature', flux: 'Heat flux', convection: 'Convection', radiation: 'Radiation' },
};

/** The collected deck → { model, warnings } through an MSH 2.2 text and gmshToModel. */
function toModel(c, { language = 'ko', title, unit, text } = {}) {
  c.domain ??= text ? savedDomain(text) : null;
  if (!c.nodes.size || !c.cells.length) throw new Error('the file has no nodes or cells that could be read');
  // Units: metres when the deck says SI, else guessed from the size (a part smaller than 5 units is taken as metres).
  const all = [...c.nodes.values()];
  const extent = Math.max(...[0, 1, 2].map((a) => Math.max(...all.map((p) => p[a])) - Math.min(...all.map((p) => p[a]))));
  let metres = unit ? unit === 'm' : c.si;
  if (metres == null) {
    metres = extent < 5;
    c.warnings.push(metres ? `coordinates taken as metres (the part is ${fmt(extent)} units across)` : 'coordinates taken as millimetres');
  }
  const s = metres ? 1000 : 1;
  // Fixed temperatures on nodes → the outer faces whose nodes all carry the same temperature.
  if (c.nodeT.size) {
    for (const f of outerFaces(c)) {
      const ts = f.ids.map((n) => c.nodeT.get(n));
      if (ts.every((t) => t != null && t === ts[0])) c.faces.push({ nodes: f.ids, bc: { type: 'temperature', T: ts[0] } });
    }
  }
  const usedGroups = [...new Set(c.cells.map((x) => x.group))];
  const groupTag = new Map(usedGroups.map((g, i) => [g, i + 1]));
  const bcGroups = new Map();
  for (const f of c.faces) {
    if (!f.bc || f.nodes.some((n) => !c.nodes.has(n))) continue;
    const key = bcKey(f.bc);
    if (!bcGroups.has(key)) bcGroups.set(key, { bc: f.bc, faces: [] });
    bcGroups.get(key).faces.push(f.nodes);
  }
  const top = Math.max(...c.cells.map((x) => DIM[x.kind]));
  const lang = language === 'en' ? 'en' : 'ko';
  const counters = {};
  const bcList = [...bcGroups.values()].map((g, i) => {
    const kind = g.bc.type;
    counters[kind] = (counters[kind] ?? 0) + 1;
    const name = String(g.bc.name || `${TYPE_NAME[lang][kind]} ${counters[kind]}`).replace(/["[\]]/g, "'");
    return { ...g, name, tag: usedGroups.length + i + 1 };
  });
  const groupName = (g) => String(c.groups.get(g)?.name || `Material ${groupTag.get(g)}`).replace(/"/g, "'");
  const out = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$PhysicalNames', String(usedGroups.length + bcList.length)];
  for (const g of usedGroups) out.push(`${top} ${groupTag.get(g)} "${groupName(g)}"`);
  for (const b of bcList) out.push(`${top - 1} ${b.tag} "${b.name} [${b.bc.type}]"`);
  out.push('$EndPhysicalNames');
  if (c.domain) out.push('$MyHeatManager', `domain ${c.domain.join(' ')}`, '$EndMyHeatManager');
  out.push('$Nodes', String(c.nodes.size));
  for (const [id, [x, y, z]] of c.nodes) out.push(`${id} ${fmt(x * s)} ${fmt(y * s)} ${fmt(z * s)}`);
  out.push('$EndNodes', '$Elements');
  const rows = [];
  for (const cell of c.cells.filter((x) => DIM[x.kind] === top)) {
    const tag = groupTag.get(cell.group);
    rows.push(`${GMSH_TYPE[cell.kind]} 2 ${tag} ${tag} ${cell.nodes.join(' ')}`);
  }
  for (const b of bcList) for (const f of b.faces) rows.push(`${FACE_TYPE(f.length)} 2 ${b.tag} ${b.tag} ${f.join(' ')}`);
  out.push(String(rows.length), ...rows.map((r, i) => `${i + 1} ${r}`), '$EndElements', '');
  const { model, warnings } = gmshToModel(out.join('\n'), { language });
  // Boundary values were not part of the MSH text: put them back by name.
  const byName = new Map(bcList.map((b) => [b.name, b.bc]));
  for (const bc of model.boundaries) {
    const src = byName.get(bc.name);
    if (!src) continue;
    for (const key of ['T', 'q', 'h', 'Tinf', 'emissivity', 'Tamb']) if (finite(src[key])) bc[key] = src[key];
  }
  // Material properties from the deck (library values stay for what the deck does not give).
  const matByName = new Map(usedGroups.map((g) => [groupName(g), c.groups.get(g) ?? {}]));
  for (const body of model.bodies) {
    const props = matByName.get(String(body.name).replace(/ \d+$/, '')) ?? matByName.get(body.name);
    const m = model.materials.find((x) => x.id === body.material);
    if (!props || !m || m.__deck) continue;
    for (const key of ['k', 'rho', 'cp']) if (finite(props[key]) && props[key] > 0) m[key] = props[key];
    for (const key of ['kx', 'ky', 'kz']) if (finite(props[key]) && props[key] > 0) m[key] = props[key];
    m.__deck = true;
  }
  for (const m of model.materials) delete m.__deck;
  // 2D thickness: the shell / section thickness becomes the domain depth.
  const thickness = usedGroups.map((g) => c.groups.get(g)?.thickness).find((t) => finite(t) && t > 0);
  if (top === 2 && thickness) model.domain.depth = thickness * s;
  // Body power: each heated cell's W/m³ times its volume, given to the body that holds its centre.
  if (c.heat.size) {
    const depthM = (top === 2 ? model.domain.depth : 1) / 1000;
    const power = new Map();
    let lost = 0;
    for (const cell of c.cells) {
      const q = c.heat.get(cell.id);
      if (!q) continue;
      const pts = cell.nodes.map((n) => c.nodes.get(n).map((v) => v * s));
      const centre = [0, 1, 2].map((a) => pts.reduce((sum, p) => sum + p[a], 0) / pts.length);
      const volume = cellVolume(cell.kind, pts) * (top === 2 ? depthM : 1);
      const body = [...model.bodies].reverse().find((b) => bodyContains(b, centre[0], centre[1]) && (top === 2 || (centre[2] >= b.z0 && centre[2] <= b.z1)));
      if (!body) { lost += q * volume; continue; }
      power.set(body, (power.get(body) ?? 0) + q * volume);
    }
    for (const [body, W] of power) body.power = Number(W.toPrecision(6));
    if (lost > 1e-9) warnings.push(`${fmt(lost)} W of volumetric heat lies in cells no body covers and was dropped`);
  }
  if (finite(c.initialT)) model.study.initialT = c.initialT;
  model.name = title ?? model.name;
  // gmshToModel's notes about MSH files lacking boundary values do not apply: the deck's values were put back.
  const notes = warnings.filter((w) => !/not stored in MSH files|without a "\[type\]" tag/.test(w));
  return { model: normalizeModel(model), warnings: [...c.warnings, ...notes] };
}

/** Volume (m³; in 2D the area in m², the caller multiplies by the depth) of a cell with corners in mm. */
function cellVolume(kind, p) {
  const m = p.map((q) => q.map((v) => v / 1000));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const tet = (a, b, c, d) => Math.abs(dot(sub(b, a), cross(sub(c, a), sub(d, a)))) / 6;
  if (kind === 'quad' || kind === 'tri') {
    let area = 0;
    for (let i = 0, j = m.length - 1; i < m.length; j = i++) area += m[j][0] * m[i][1] - m[i][0] * m[j][1];
    return Math.abs(area) / 2;
  }
  if (kind === 'tet') return tet(m[0], m[1], m[2], m[3]);
  if (kind === 'wedge') return tet(m[0], m[1], m[2], m[3]) + tet(m[1], m[2], m[3], m[4]) + tet(m[2], m[3], m[4], m[5]);
  // Hexahedron as five tetrahedra.
  return tet(m[0], m[1], m[3], m[4]) + tet(m[1], m[2], m[3], m[6]) + tet(m[1], m[4], m[5], m[6]) + tet(m[3], m[4], m[6], m[7]) + tet(m[1], m[3], m[4], m[6]);
}

/** Cell kind from a corner count and the dimension (a repeated corner makes a degenerate quad a triangle). */
function kindOf(nodes, dim) {
  const unique = new Set(nodes).size;
  if (dim === 2) return unique === 3 ? 'tri' : 'quad';
  if (unique === 4) return 'tet';
  if (unique === 6) return 'wedge';
  return 'hex';
}

// ───────────────────────── Nastran / Simcenter

/** A Nastran real: "1.5-3" means 1.5e-3, "2.+4" 2e4; blank → NaN. */
function nasNum(text) {
  const s = String(text ?? '').trim().toUpperCase().replace(/D/g, 'E');
  if (!s) return NaN;
  const m = s.match(/^([+-]?\d*\.?\d*)([+-]\d+)$/);
  return m && !s.includes('E') ? Number(`${m[1]}e${m[2]}`) : Number(s);
}

/** Bulk-data cards as field lists (free field with commas, small field 8, large field 16 with "*" names), continuations joined. */
function nastranCards(text) {
  const rows = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const cards = [];
  let inBulk = !rows.some((r) => /^\s*BEGIN\s+BULK/i.test(r));
  let current = null;
  const fieldsOf = (row) => {
    if (row.includes(',')) return row.split(',').map((f) => f.trim());
    const name = row.slice(0, 8).trim();
    const large = name.endsWith('*') || name === '*';
    const width = large ? 16 : 8;
    const count = large ? 4 : 8;
    const list = [name];
    for (let i = 0; i < count; i++) list.push(row.slice(8 + i * width, 8 + (i + 1) * width).trim());
    list.push(row.slice(8 + count * width, 8 + count * width + 8).trim());
    return list;
  };
  for (const raw of rows) {
    const row = raw.replace(/\$.*$/, '');
    if (!inBulk) { if (/^\s*BEGIN\s+BULK/i.test(raw)) inBulk = true; continue; }
    if (/^\s*ENDDATA/i.test(row)) break;
    if (!row.trim()) continue;
    const fields = fieldsOf(row);
    const first = fields[0];
    const continuation = first === '' || first.startsWith('+') || first.startsWith('*') && !/^\*?[A-Z]/i.test(first.slice(1)) || (first === '*' );
    if (continuation && current) {
      // Free field: drop the parent's trailing continuation marker; fixed field: the 10th field is the marker.
      if (current.fields.length && /^[+*]/.test(current.fields.at(-1))) current.fields.pop();
      else if (!row.includes(',')) current.fields.pop();
      current.fields.push(...fields.slice(1));
      continue;
    }
    if (current && !row.includes(',') && current.fixed) current.fields.pop();
    current = { name: first.replace(/\*$/, '').toUpperCase(), fields: fields.slice(1), fixed: !row.includes(',') };
    cards.push(current);
  }
  for (const card of cards) while (card.fields.length && card.fields.at(-1) === '') card.fields.pop();
  return { cards, comments: rows.filter((r) => /^\s*\$/.test(r)) };
}

/** Model from Nastran / Simcenter bulk data (heat transfer cards). Returns { model, warnings }. */
export function nastranToModel(text, options = {}) {
  const { cards, comments } = nastranCards(text);
  const c = collector();
  c.si = comments.some((r) => /SI units|\(m,/i.test(r)) ? true : null;
  const matNames = new Map();
  for (const r of comments) {
    const m = r.match(/^\s*\$\s*material\s+(\d+)\s*:\s*(.+?)\s*$/i);
    if (m) matNames.set(Number(m[1]), m[2]);
  }
  const props = new Map();
  const mats = new Map();
  const chbdy = new Map();
  const pconv = new Map();
  const spoint = new Map();
  const conv = [];
  const qbdy = [];
  for (const card of cards) {
    const f = card.fields;
    const n = (i) => nasNum(f[i]);
    switch (card.name) {
      case 'GRID': c.nodes.set(n(0), [n(2) || 0, n(3) || 0, n(4) || 0]); break;
      case 'CQUAD4': case 'CQUAD8': c.cells.push({ id: n(0), kind: 'quad', nodes: [n(2), n(3), n(4), n(5)], group: `p${n(1)}` }); break;
      case 'CTRIA3': case 'CTRIA6': c.cells.push({ id: n(0), kind: 'tri', nodes: [n(2), n(3), n(4)], group: `p${n(1)}` }); break;
      case 'CHEXA': c.cells.push({ id: n(0), kind: 'hex', nodes: [2, 3, 4, 5, 6, 7, 8, 9].map(n), group: `p${n(1)}` }); break;
      case 'CTETRA': c.cells.push({ id: n(0), kind: 'tet', nodes: [2, 3, 4, 5].map(n), group: `p${n(1)}` }); break;
      case 'CPENTA': c.cells.push({ id: n(0), kind: 'wedge', nodes: [2, 3, 4, 5, 6, 7].map(n), group: `p${n(1)}` }); break;
      case 'PSHELL': props.set(n(0), { mid: n(1), thickness: n(2) }); break;
      case 'PSOLID': props.set(n(0), { mid: n(1) }); break;
      case 'MAT4': mats.set(n(0), { k: n(1), cp: n(2), rho: n(3), h: n(4) }); break;
      case 'MAT5': mats.set(n(0), { kx: n(1), ky: n(4), kz: n(6), cp: n(7), rho: n(8) }); break;
      case 'SPOINT': for (let i = 0; i < f.length; i++) spoint.set(n(i), null); break;
      case 'SPC': {
        const comp = String(f[2] ?? '');
        const T = n(3);
        if (spoint.has(n(1))) spoint.set(n(1), T);
        else if (comp.includes('1') || comp === '0') c.nodeT.set(n(1), T);
        if (f.length >= 7) { const comp2 = String(f[5] ?? ''); if (comp2.includes('1')) c.nodeT.set(n(4), n(6)); }
        break;
      }
      case 'CHBDYG': chbdy.set(n(0), f.slice(8).map(nasNum).filter((v) => v > 0)); break;
      case 'CHBDYP': chbdy.set(n(0), [n(5), n(6)].filter((v) => v > 0)); break;
      case 'PCONV': pconv.set(n(0), n(1)); break;
      case 'CONV': conv.push({ eid: n(0), pid: n(1), ta: n(4) }); break;
      case 'QBDY1': for (let i = 2; i < f.length; i++) qbdy.push({ q: n(1), eid: n(i) }); break;
      case 'QVOL': for (let i = 3; i < f.length; i++) if (finite(n(i))) c.heat.set(n(i), n(1)); break;
      case 'TEMPD': c.initialT = n(1); break;
      default: break;
    }
  }
  for (const [pid, p] of props) {
    const m = mats.get(p.mid) ?? {};
    c.groups.set(`p${pid}`, { name: matNames.get(pid) ?? matNames.get(p.mid) ?? `PID ${pid}`, k: m.k, kx: m.kx, ky: m.ky, kz: m.kz, rho: m.rho, cp: m.cp, thickness: p.thickness });
  }
  // SPC'd scalar points are ambient temperatures, not model nodes.
  for (const id of spoint.keys()) c.nodeT.delete(id);
  for (const cv of conv) {
    const nodes = chbdy.get(cv.eid);
    const h = mats.get(pconv.get(cv.pid))?.h;
    if (nodes?.length >= 2 && finite(h)) c.faces.push({ nodes, bc: { type: 'convection', h, Tinf: spoint.get(cv.ta) ?? 25 } });
  }
  for (const qb of qbdy) {
    const nodes = chbdy.get(qb.eid);
    if (nodes?.length >= 2) c.faces.push({ nodes, bc: { type: 'flux', q: qb.q } });
  }
  return toModel(c, { title: options.language === 'en' ? 'Nastran import' : 'Nastran 가져오기', ...options, text });
}

// ───────────────────────── Ansys MAPDL (.cdb)

/** Field widths of a Fortran format such as (3i9,6e21.13e3) or (19i9). */
function fortranWidths(format) {
  const widths = [];
  for (const m of String(format).matchAll(/(\d*)([ie])(\d+)/gi)) {
    for (let i = 0; i < (Number(m[1]) || 1); i++) widths.push(Number(m[3]));
  }
  return widths;
}
const fixedFields = (row, widths) => {
  const out = [];
  let at = 0;
  for (const w of widths) { if (at >= row.length) break; out.push(row.slice(at, at + w).trim()); at += w; }
  return out;
};

/** Model from an Ansys MAPDL archive (.cdb, as CDWRITE writes it or with plain commands). Returns { model, warnings }. */
export function ansysToModel(text, options = {}) {
  const rows = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const c = collector();
  c.si = rows.some((r) => /^\s*\/UNITS\s*,\s*SI/i.test(r) || /SI units/i.test(r)) ? true : null;
  const names = new Map();
  const real = new Map();
  const elements = new Map();
  const realOf = new Map();
  const sfe = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const head = row.split(',')[0].trim().toUpperCase();
    const parts = row.split(',').map((x) => x.trim());
    if (head === '/COM') {
      const m = row.match(/material\s+(\d+)\s*:\s*(.+?)\s*$/i);
      if (m) names.set(Number(m[1]), m[2]);
    } else if (head === 'NBLOCK') {
      const widths = fortranWidths(rows[++i]);
      for (i++; i < rows.length; i++) {
        const r = rows[i];
        if (/^\s*N\s*,/i.test(r) || /^\s*-1/.test(r) || !r.trim()) break;
        const v = fixedFields(r, widths);
        c.nodes.set(Number(v[0]), [Number(v[3]) || 0, Number(v[4]) || 0, Number(v[5]) || 0]);
      }
    } else if (head === 'EBLOCK') {
      const widths = fortranWidths(rows[++i]);
      for (i++; i < rows.length; i++) {
        const r = rows[i];
        if (/^\s*-1\s*$/.test(r) || !r.trim()) break;
        let v = fixedFields(r, widths).map(Number);
        const count = v[8];
        // More than 8 nodes continue on the next line.
        if (count > widths.length - 11) v = v.concat(fixedFields(rows[++i], widths).map(Number));
        const nodes = v.slice(11, 11 + Math.min(count, 8));
        realOf.set(v[10], v[2]);
        elements.set(v[10], { id: v[10], mat: v[0], nodes });
      }
    } else if (head === 'N' && parts.length >= 3 && /^\d+$/.test(parts[1])) {
      c.nodes.set(Number(parts[1]), [Number(parts[2]) || 0, Number(parts[3]) || 0, Number(parts[4]) || 0]);
    } else if (head === 'MP') {
      const g = c.groups.get(Number(parts[2])) ?? {};
      g[{ KXX: 'kx', KYY: 'ky', KZZ: 'kz', DENS: 'rho', C: 'cp' }[parts[1].toUpperCase()] ?? '_'] = Number(parts[3]);
      c.groups.set(Number(parts[2]), g);
    } else if (head === 'MPDATA') {
      // MPDATA,R5.0, 1,KXX ,  mat, loc, value
      const label = parts[3]?.toUpperCase();
      const g = c.groups.get(Number(parts[4])) ?? {};
      g[{ KXX: 'kx', KYY: 'ky', KZZ: 'kz', DENS: 'rho', C: 'cp' }[label] ?? '_'] = Number(parts[6]);
      c.groups.set(Number(parts[4]), g);
    } else if (head === 'R') {
      real.set(Number(parts[1]), Number(parts[2]));
    } else if (head === 'RLBLOCK') {
      // RLBLOCK, nsets, max, ...  then (2i8,6g16.9) / (7g16.9): set id, count, values
      const widths = fortranWidths(rows[i + 1]);
      const r = rows[i + 3];
      if (r) { const v = fixedFields(r, widths); real.set(Number(v[0]), Number(v[2])); }
    } else if (head === 'D' && /TEMP/i.test(parts[2] ?? '')) {
      let T = Number(parts[3]);
      if (!finite(T) && /^R5/i.test(parts[3] ?? '')) T = Number(rows[++i].trim().split(/\s+/)[0]);
      c.nodeT.set(Number(parts[1]), T);
    } else if (head === 'SFE') {
      const label = (parts[3] ?? '').toUpperCase();
      const key = Number(parts[4]) || 1;
      let value = Number(parts[5]);
      if (/^R5/i.test(parts[5] ?? '')) value = Number(rows[++i].trim().split(/\s+/)[0]);
      const id = `${parts[1]}:${parts[2]}`;
      const entry = sfe.get(id) ?? { e: Number(parts[1]), face: Number(parts[2]) };
      if (label === 'CONV') entry[key === 1 ? 'h' : 'Tinf'] = value;
      if (label === 'HFLUX') entry.q = value;
      sfe.set(id, entry);
    } else if (head === 'BFE' && /HGEN/i.test(parts[2] ?? '')) {
      let value = Number(parts[4]);
      if (/^R5/i.test(parts[4] ?? '')) value = Number(rows[++i].trim().split(/\s+/)[0]);
      c.heat.set(Number(parts[1]), value);
    } else if (head === 'TUNIF') {
      c.initialT = Number(parts[1]);
    }
  }
  const zs = [...c.nodes.values()].map((p) => p[2]);
  const flat = zs.every((z) => Math.abs(z - zs[0]) < 1e-12);
  for (const e of elements.values()) {
    const nodes = flat ? e.nodes.slice(0, 4) : e.nodes.slice(0, 8);
    const kind = kindOf(nodes, flat ? 2 : 3);
    const cellNodes = kind === 'tri' ? [...new Set(nodes)] : nodes;
    c.cells.push({ id: e.id, kind, nodes: cellNodes, group: e.mat, ansys: nodes });
  }
  for (const [mat, g] of c.groups) {
    g.name = names.get(mat) ?? `MAT ${mat}`;
    if (finite(g.kx) && !finite(g.ky) && !finite(g.kz)) { g.k = g.kx; delete g.kx; }
    else g.k = g.kx;
  }
  // 2D thickness from the real constant of the elements (PLANE55 KEYOPT(3)=3).
  if (flat) {
    const t = real.get(realOf.values().next().value);
    for (const g of c.groups.values()) if (finite(t) && t > 0) g.thickness = t;
  }
  for (const [mat] of c.groups) if (!c.cells.some((x) => x.group === mat)) c.groups.delete(mat);
  for (const cell of c.cells) if (!c.groups.has(cell.group)) c.groups.set(cell.group, { name: `MAT ${cell.group}` });
  const cells = new Map(c.cells.map((x) => [x.id, x]));
  for (const s of sfe.values()) {
    const cell = cells.get(s.e);
    const local = cell && ANSYS_FACES[cell.kind === 'hex' ? 'hex' : 'quad']?.[s.face - 1];
    if (!local) continue;
    const nodes = local.map((k) => cell.ansys[k]);
    if (finite(s.h)) c.faces.push({ nodes, bc: { type: 'convection', h: s.h, Tinf: finite(s.Tinf) ? s.Tinf : 25 } });
    else if (finite(s.q)) c.faces.push({ nodes, bc: { type: 'flux', q: s.q } });
  }
  return toModel(c, { title: options.language === 'en' ? 'Ansys import' : 'Ansys 가져오기', ...options, text });
}

// ───────────────────────── CalculiX / Abaqus (.inp)

const ABAQUS_KIND = (type) => {
  const t = type.toUpperCase();
  if (/^(DC2D4|DC2D8|CPS4|CPE4|CAX4|CPS8|CPE8|CAX8|DCAX4|S4|M3D4)/.test(t)) return 'quad';
  if (/^(DC2D3|DC2D6|CPS3|CPE3|CAX3|CPS6|CPE6|S3|M3D3)/.test(t)) return 'tri';
  if (/^(DC3D8|DC3D20|C3D8|C3D20)/.test(t)) return 'hex';
  if (/^(DC3D4|DC3D10|C3D4|C3D10)/.test(t)) return 'tet';
  if (/^(DC3D6|DC3D15|C3D6|C3D15)/.test(t)) return 'wedge';
  return null;
};
const CORNERS = { quad: 4, tri: 3, hex: 8, tet: 4, wedge: 6 };

/** Model from a CalculiX / Abaqus input deck (heat transfer keywords). Returns { model, warnings }. */
export function calculixToModel(text, options = {}) {
  const rows = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const c = collector();
  c.si = rows.some((r) => /^\*\*.*SI units/i.test(r)) ? true : null;
  const nsets = new Map();
  const elsets = new Map();
  const materials = new Map();
  const sections = [];
  const elementSet = new Map();
  const films = new Map();
  let block = null;
  let material = null;
  let pending = '';
  const option = (head, key) => head.match(new RegExp(`${key}\\s*=\\s*([^,]+)`, 'i'))?.[1].trim();
  for (const raw of rows) {
    const row = raw.trim();
    if (!row || row.startsWith('**')) continue;
    if (row.startsWith('*')) {
      const head = row.toUpperCase();
      const word = head.slice(1).split(',')[0].trim();
      pending = '';
      block = { word, head: row };
      if (word === 'MATERIAL') { material = option(row, 'NAME'); materials.set(material, { name: material }); }
      else if (word === 'NODE' || word === 'NSET' || word === 'ELSET') block.set = option(row, word === 'ELSET' ? 'ELSET' : 'NSET');
      else if (word === 'ELEMENT') { block.kind = ABAQUS_KIND(option(row, 'TYPE') ?? ''); block.set = option(row, 'ELSET'); if (!block.kind) c.warnings.push(`element type ${option(row, 'TYPE')} is not read`); }
      else if (word === 'SOLID SECTION' || word === 'SHELL SECTION') { block.section = { elset: option(row, 'ELSET'), material: option(row, 'MATERIAL') }; sections.push(block.section); }
      else if (word === 'CONDUCTIVITY') block.ortho = /TYPE\s*=\s*ORTHO/i.test(row);
      if ((word === 'NSET' || word === 'ELSET') && /GENERATE/i.test(row)) block.generate = true;
      continue;
    }
    if (!block) continue;
    // Data lines ending in a comma continue on the next line (long element connectivity).
    const line = pending + row;
    if (block.word === 'ELEMENT' && line.endsWith(',')) { pending = line; continue; }
    pending = '';
    const v = line.split(',').map((x) => x.trim()).filter((x) => x !== '');
    const n = v.map(Number);
    switch (block.word) {
      case 'NODE':
        c.nodes.set(n[0], [n[1] || 0, n[2] || 0, n[3] || 0]);
        if (block.set) (nsets.get(block.set.toUpperCase()) ?? nsets.set(block.set.toUpperCase(), []).get(block.set.toUpperCase())).push(n[0]);
        break;
      case 'ELEMENT': {
        if (!block.kind) break;
        const nodes = n.slice(1, 1 + CORNERS[block.kind]);
        c.cells.push({ id: n[0], kind: block.kind, nodes, group: null });
        if (block.set) {
          const key = block.set.toUpperCase();
          elementSet.set(n[0], key);
          if (!elsets.has(key)) elsets.set(key, []);
          elsets.get(key).push(n[0]);
        }
        break;
      }
      case 'NSET': case 'ELSET': {
        const map = block.word === 'NSET' ? nsets : elsets;
        const key = block.set.toUpperCase();
        if (!map.has(key)) map.set(key, []);
        if (block.generate) { for (let x = n[0]; x <= n[1]; x += n[2] || 1) map.get(key).push(x); }
        else for (const x of v) map.get(key).push(...(/^\d+$/.test(x) ? [Number(x)] : map.get(x.toUpperCase()) ?? []));
        break;
      }
      case 'CONDUCTIVITY': {
        const m = materials.get(material);
        if (m && !finite(m.k) && !finite(m.kx)) {
          if (block.ortho || n.filter(finite).length >= 3 && v.length >= 3 && !/TYPE/i.test(block.head)) { if (block.ortho) { m.kx = n[0]; m.ky = n[1]; m.kz = n[2]; m.k = n[0]; } else m.k = n[0]; }
          else m.k = n[0];
        }
        break;
      }
      case 'DENSITY': { const m = materials.get(material); if (m && !finite(m.rho)) m.rho = n[0]; break; }
      case 'SPECIFIC HEAT': { const m = materials.get(material); if (m && !finite(m.cp)) m.cp = n[0]; break; }
      case 'SOLID SECTION': case 'SHELL SECTION':
        if (finite(n[0]) && block.section.thickness == null) block.section.thickness = n[0];
        break;
      case 'BOUNDARY': {
        // node or set, first dof, last dof, value — dof 11 is temperature.
        const first = Number(v[1]);
        const last = v[2] === undefined || v[2] === '' ? first : Number(v[2]);
        if (!(first <= 11 && last >= 11) && first !== 11) break;
        const T = Number(v[3] ?? v[2]);
        const ids = /^\d+$/.test(v[0]) ? [Number(v[0])] : nsets.get(v[0].toUpperCase()) ?? [];
        for (const id of ids) c.nodeT.set(id, finite(T) ? T : 0);
        break;
      }
      case 'INITIAL CONDITIONS': c.initialT = n[1]; break;
      case 'FILM': case 'RADIATE': case 'DFLUX': {
        const ids = /^\d+$/.test(v[0]) ? [Number(v[0])] : elsets.get(v[0].toUpperCase()) ?? [];
        const label = String(v[1]).toUpperCase();
        if (block.word === 'DFLUX' && label === 'BF') { for (const id of ids) c.heat.set(id, Number(v[2])); break; }
        const face = Number(label.replace(/^[FRS]/, ''));
        for (const id of ids) {
          const key = `${id}:${face}`;
          const entry = films.get(key) ?? { id, face };
          if (block.word === 'FILM') { entry.Tinf = Number(v[2]); entry.h = Number(v[3]); }
          else if (block.word === 'RADIATE') { entry.Tamb = Number(v[2]); entry.emissivity = Number(v[3]); }
          else entry.q = Number(v[2]);
          films.set(key, entry);
        }
        break;
      }
      default: break;
    }
  }
  // Section → material for each element set.
  for (const s of sections) {
    const ids = elsets.get(String(s.elset).toUpperCase()) ?? [...elementSet].filter(([, set]) => set === String(s.elset).toUpperCase()).map(([id]) => id);
    const key = String(s.material ?? s.elset);
    const m = materials.get(s.material) ?? { name: key };
    c.groups.set(key, { ...m, name: m.name ?? key, thickness: s.thickness });
    const idSet = new Set(ids);
    for (const cell of c.cells) if (idSet.has(cell.id)) cell.group = key;
  }
  for (const cell of c.cells) {
    if (cell.group != null) continue;
    cell.group = elementSet.get(cell.id) ?? 'EALL';
    if (!c.groups.has(cell.group)) c.groups.set(cell.group, { name: cell.group });
  }
  // Our own exports name element sets M_<material id>: show the material id.
  for (const g of c.groups.values()) g.name = String(g.name).replace(/^M_/, '');
  const cells = new Map(c.cells.map((x) => [x.id, x]));
  for (const f of films.values()) {
    const cell = cells.get(f.id);
    const local = cell && FACE_NODES[cell.kind][f.face - 1];
    if (!local) continue;
    const nodes = local.map((k) => cell.nodes[k]);
    if (finite(f.h)) c.faces.push({ nodes, bc: { type: 'convection', h: f.h, Tinf: f.Tinf, ...(finite(f.emissivity) ? { emissivity: f.emissivity } : {}) } });
    else if (finite(f.emissivity)) c.faces.push({ nodes, bc: { type: 'radiation', emissivity: f.emissivity, Tamb: f.Tamb } });
    else if (finite(f.q)) c.faces.push({ nodes, bc: { type: 'flux', q: f.q } });
  }
  return toModel(c, { title: options.language === 'en' ? 'CalculiX import' : 'CalculiX 가져오기', ...options, text });
}

// ───────────────────────── COMSOL (.mphtxt)

/** Model from a COMSOL text mesh: domains become material groups, boundary entities convection conditions. */
export function comsolToModel(text, options = {}) {
  const rows = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const c = collector();
  c.si = true;
  const num = (r) => Number(String(r).split('#')[0].trim().split(/\s+/)[0]);
  let i = rows.findIndex((r) => /# sdim/.test(r));
  if (i < 0) throw new Error('not a COMSOL text mesh (sdim missing)');
  const sdim = num(rows[i]);
  const count = num(rows[rows.findIndex((r) => /# number of mesh vertices/.test(r))]);
  const lowest = num(rows[rows.findIndex((r) => /# lowest mesh vertex index/.test(r))]);
  i = rows.findIndex((r) => /# Mesh vertex coordinates/.test(r));
  // Vertex index v (counted from `lowest`) is node v + 1.
  let vertex = lowest;
  for (let k = i + 1; k < rows.length && c.nodes.size < count; k++) {
    const v = rows[k].trim().split(/\s+/).map(Number);
    if (!rows[k].trim() || !v.every(finite)) continue;
    c.nodes.set(vertex + 1, [v[0], v[1], sdim === 3 ? v[2] : 0]);
    vertex++;
  }
  // Each "# Type #" block: type name, vertices per element, elements, then geometric entity indices.
  const lex = { quad: (n) => [n[0], n[1], n[3], n[2]], hex: (n) => [n[0], n[1], n[3], n[2], n[4], n[5], n[7], n[6]], tri: (n) => n, tet: (n) => n, prism: (n) => n, edg: (n) => n };
  let cellId = 1;
  for (let k = 0; k < rows.length; k++) {
    if (!/^# Type #/.test(rows[k])) continue;
    const nameRow = rows.slice(k + 1).find((r) => /# type name/.test(r));
    const name = nameRow.split('#')[0].trim().split(/\s+/)[1];
    const at = rows.findIndex((r, x) => x > k && /# number of elements/.test(r));
    const n = num(rows[at]);
    const elems = [];
    let r = at + 1;
    while (elems.length < n && r < rows.length) {
      const v = rows[r++].trim();
      if (!v || v.startsWith('#')) continue;
      elems.push(v.split(/\s+/).map((x) => Number(x) + 1));
    }
    const ge = rows.findIndex((x, y) => y >= r && /# number of geometric entity indices/.test(x));
    const entities = [];
    for (let q = ge + 1; q < rows.length && entities.length < n; q++) {
      const v = rows[q].trim();
      if (!v || v.startsWith('#')) continue;
      entities.push(Number(v));
    }
    const nodesOf = (e) => (lex[name] ?? ((x) => x))(e);
    const cellKind = { quad: 'quad', tri: 'tri', hex: 'hex', tet: 'tet', prism: 'wedge' }[name];
    const isCell = cellKind && DIM[cellKind] === sdim;
    elems.forEach((e, x) => {
      const nodes = nodesOf(e);
      if (isCell) {
        const group = `d${entities[x]}`;
        if (!c.groups.has(group)) c.groups.set(group, { name: `Domain ${entities[x]}` });
        c.cells.push({ id: cellId++, kind: cellKind, nodes, group });
      } else if ((sdim === 2 && name === 'edg') || (sdim === 3 && (name === 'quad' || name === 'tri'))) {
        c.faces.push({ nodes, bc: { type: 'convection', name: `Boundary ${entities[x]}`, h: 10, Tinf: 25 } });
      }
    });
  }
  if (c.faces.length) c.warnings.push('COMSOL meshes carry no boundary values: boundaries came in as convection (h = 10 W/m²K, 25 °C) — set them');
  c.warnings.push('COMSOL meshes carry no material properties: pick the materials of the imported domains');
  return toModel(c, { title: options.language === 'en' ? 'COMSOL import' : 'COMSOL 가져오기', ...options, text });
}

/** Reader for a file name, or null: .bdf/.dat/.nas/.blk → Nastran, .cdb → Ansys, .inp → CalculiX, .mphtxt → COMSOL. */
export function deckReader(fileName) {
  const ext = String(fileName).toLowerCase().split('.').pop();
  return { bdf: nastranToModel, dat: nastranToModel, nas: nastranToModel, blk: nastranToModel, cdb: ansysToModel, inp: calculixToModel, mphtxt: comsolToModel }[ext] ?? null;
}
