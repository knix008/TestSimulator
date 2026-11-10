// Getting a model ready for a 3D printer (slicers: PrusaSlicer, Cura, Bambu
// Studio, OrcaSlicer …) and writing it as 3MF or binary STL.
//
// What a slicer wants and a model straight from an image-to-3D model or a
// glTF file usually does not give:
//
//   millimetres   the models here are about one unit (metre) tall; the print
//                 is scaled so its height (or longest side) is what was asked
//   Z up          glTF is Y up; slicers are Z up, front towards -Y
//   on the bed    centred on X/Y, the lowest point at Z = 0
//   one solid     vertices welded across UV seams and parts, degenerate and
//                 duplicate triangles dropped, holes closed, every triangle
//                 wound the same way with the normals pointing out
//
// The result says how sound the mesh is (watertight or not, holes closed,
// edges shared by more than two triangles) and its volume, so the dialog can
// tell before saving whether the slicer will have to repair it.
//
// Input meshes are collectMeshes() entries (exporters.js): world positions,
// triangles, per-vertex colours or a base colour, sRGB 0..1.

import { write3MF } from './exporters.js';

export const PRINT_FORMATS = ['3mf', 'stl'];
export const PRINT_AXES = ['height', 'longest'];
export const PRINT_DEFAULTS = {
  size: 100,          // mm
  sizeAxis: 'height', // which dimension `size` sets
  format: '3mf',
  fillHoles: true,
  colors: true,       // 3MF only: per-vertex colours for multi-colour printers
};
export const PRINT_SIZE_MIN = 1;
export const PRINT_SIZE_MAX = 2000;
// Solid PLA: an upper bound on the filament (a print is hollow with infill).
export const PLA_DENSITY = 1.24; // g/cm³

export function normalizePrintOptions(o = {}) {
  const size = Number(o.size);
  return {
    size: Number.isFinite(size) ? Math.min(PRINT_SIZE_MAX, Math.max(PRINT_SIZE_MIN, size)) : PRINT_DEFAULTS.size,
    sizeAxis: PRINT_AXES.includes(o.sizeAxis) ? o.sizeAxis : PRINT_DEFAULTS.sizeAxis,
    format: PRINT_FORMATS.includes(o.format) ? o.format : PRINT_DEFAULTS.format,
    fillHoles: o.fillHoles === undefined ? PRINT_DEFAULTS.fillHoles : !!o.fillHoles,
    colors: o.colors === undefined ? PRINT_DEFAULTS.colors : !!o.colors,
  };
}

// ── Merging and welding ───────────────────────────────────

// All triangle meshes as one: positions, faces and (when any mesh has more
// than one colour, or meshes differ in colour) per-vertex colours.
export function mergeMeshes(meshes) {
  const list = (meshes || []).filter((m) => !m.points && m.faces && m.faces.length);
  let nv = 0;
  let nf = 0;
  for (const m of list) { nv += m.positions.length / 3; nf += m.faces.length; }
  const positions = new Float64Array(nv * 3);
  const faces = new Uint32Array(nf);
  const colors = new Float32Array(nv * 3);
  const base = list[0]?.color || [1, 1, 1];
  let coloured = list.some((m) => m.colors);
  let v = 0;
  let f = 0;
  for (const m of list) {
    const n = m.positions.length / 3;
    positions.set(m.positions, v * 3);
    for (let i = 0; i < m.faces.length; i++) faces[f + i] = m.faces[i] + v;
    for (let i = 0; i < n; i++) {
      const c = m.colors ? [m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]] : m.color || [1, 1, 1];
      colors.set(c, (v + i) * 3);
      if (!coloured && (c[0] !== base[0] || c[1] !== base[1] || c[2] !== base[2])) coloured = true;
    }
    v += n;
    f += m.faces.length;
  }
  return { positions, faces, colors: coloured ? colors : null, color: base };
}

// Vertices closer than `tolerance` become one (colours averaged); triangles
// that lose a corner that way, and repeated triangles, are dropped.
export function weld(mesh, tolerance) {
  const { positions, faces, colors } = mesh;
  const n = positions.length / 3;
  const tol = tolerance > 0 ? tolerance : 1e-9;
  const map = new Uint32Array(n);
  const index = new Map();
  const outPos = [];
  const sum = [];
  const count = [];
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const key = `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`;
    let at = index.get(key);
    if (at === undefined) {
      at = outPos.length / 3;
      index.set(key, at);
      outPos.push(x, y, z);
      count.push(0);
      if (colors) sum.push(0, 0, 0);
    }
    map[i] = at;
    count[at] += 1;
    if (colors) {
      sum[at * 3] += colors[i * 3];
      sum[at * 3 + 1] += colors[i * 3 + 1];
      sum[at * 3 + 2] += colors[i * 3 + 2];
    }
  }
  const seen = new Set();
  const out = [];
  let degenerate = 0;
  let duplicate = 0;
  for (let i = 0; i + 2 < faces.length; i += 3) {
    const a = map[faces[i]];
    const b = map[faces[i + 1]];
    const c = map[faces[i + 2]];
    if (a === b || b === c || a === c) { degenerate += 1; continue; }
    const key = [a, b, c].sort((p, q) => p - q).join(',');
    if (seen.has(key)) { duplicate += 1; continue; }
    seen.add(key);
    out.push(a, b, c);
  }
  let outColors = null;
  if (colors) {
    outColors = new Float32Array(sum.length);
    for (let i = 0; i < count.length; i++) {
      for (let k = 0; k < 3; k++) outColors[i * 3 + k] = sum[i * 3 + k] / count[i];
    }
  }
  return {
    positions: Float64Array.from(outPos),
    faces: Uint32Array.from(out),
    colors: outColors,
    color: mesh.color,
    stats: { welded: n - outPos.length / 3, degenerate, duplicate },
  };
}

// ── Topology ──────────────────────────────────────────────

const edgeKey = (a, b, n) => (a < b ? a * n + b : b * n + a);

// Edge use: boundary edges (one triangle), non-manifold edges (more than
// two), and edges two triangles walk the same way (their windings disagree).
export function analyze(mesh) {
  const { faces } = mesh;
  const n = mesh.positions.length / 3;
  const uses = new Map();
  const directed = new Map();
  for (let i = 0; i < faces.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = faces[i + k];
      const b = faces[i + ((k + 1) % 3)];
      const key = edgeKey(a, b, n);
      uses.set(key, (uses.get(key) || 0) + 1);
      const d = a * n + b;
      directed.set(d, (directed.get(d) || 0) + 1);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  for (const c of uses.values()) {
    if (c === 1) boundary += 1;
    else if (c > 2) nonManifold += 1;
  }
  let misoriented = 0;
  for (const c of directed.values()) if (c > 1) misoriented += c - 1;
  return {
    triangles: faces.length / 3,
    vertices: n,
    edges: uses.size,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    misorientedEdges: misoriented,
    watertight: boundary === 0 && nonManifold === 0 && misoriented === 0,
  };
}

// Winds every triangle like its neighbours (across edges two triangles
// share), one connected piece at a time. Returns how many were turned.
export function orientConsistently(mesh) {
  const { faces } = mesh;
  const n = mesh.positions.length / 3;
  const nf = faces.length / 3;
  const edgeFaces = new Map();
  for (let f = 0; f < nf; f++) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)], n);
      const list = edgeFaces.get(key);
      if (list) list.push(f); else edgeFaces.set(key, [f]);
    }
  }
  const done = new Uint8Array(nf);
  let flipped = 0;
  const has = (f, a, b) => {
    for (let k = 0; k < 3; k++) if (faces[f * 3 + k] === a && faces[f * 3 + ((k + 1) % 3)] === b) return true;
    return false;
  };
  for (let start = 0; start < nf; start++) {
    if (done[start]) continue;
    done[start] = 1;
    const stack = [start];
    while (stack.length) {
      const f = stack.pop();
      for (let k = 0; k < 3; k++) {
        const a = faces[f * 3 + k];
        const b = faces[f * 3 + ((k + 1) % 3)];
        const list = edgeFaces.get(edgeKey(a, b, n));
        if (!list || list.length !== 2) continue; // boundary or non-manifold: no clear neighbour
        const g = list[0] === f ? list[1] : list[0];
        if (done[g]) continue;
        done[g] = 1;
        // A consistent neighbour walks the shared edge the other way (b → a).
        if (has(g, a, b)) {
          const t = faces[g * 3 + 1];
          faces[g * 3 + 1] = faces[g * 3 + 2];
          faces[g * 3 + 2] = t;
          flipped += 1;
        }
        stack.push(g);
      }
    }
  }
  return flipped;
}

// Volume enclosed (positive when the triangles face outwards).
export function signedVolume(mesh) {
  const p = mesh.positions;
  const f = mesh.faces;
  let v = 0;
  for (let i = 0; i < f.length; i += 3) {
    const a = f[i] * 3;
    const b = f[i + 1] * 3;
    const c = f[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

export function flipAll(mesh) {
  const f = mesh.faces;
  for (let i = 0; i < f.length; i += 3) {
    const t = f[i + 1];
    f[i + 1] = f[i + 2];
    f[i + 2] = t;
  }
}

// The open rims: closed loops of boundary edges, each in the direction its
// triangle walks it.
export function boundaryLoops(mesh) {
  const { faces } = mesh;
  const n = mesh.positions.length / 3;
  const directed = new Set();
  for (let i = 0; i < faces.length; i += 3) {
    for (let k = 0; k < 3; k++) directed.add(faces[i + k] * n + faces[i + ((k + 1) % 3)]);
  }
  const next = new Map(); // a → [b …] for boundary half-edges a → b
  for (const d of directed) {
    const a = Math.floor(d / n);
    const b = d - a * n;
    if (directed.has(b * n + a)) continue;
    const list = next.get(a);
    if (list) list.push(b); else next.set(a, [b]);
  }
  const loops = [];
  for (const [first] of next) {
    while ((next.get(first) || []).length) {
      const loop = [first];
      let at = next.get(first).pop();
      let guard = 0;
      while (at !== first && guard++ < n) {
        loop.push(at);
        const list = next.get(at);
        if (!list || !list.length) { loop.length = 0; break; }
        at = list.pop();
      }
      if (at === first && loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

// Closes each hole with a fan around its centre (a new vertex there, its
// colour the rim's average), wound to match the triangles around it.
export function fillHoles(mesh) {
  const loops = boundaryLoops(mesh);
  if (!loops.length) return { mesh, filled: 0, added: 0 };
  const pos = Array.from(mesh.positions);
  const col = mesh.colors ? Array.from(mesh.colors) : null;
  const faces = Array.from(mesh.faces);
  let added = 0;
  for (const loop of loops) {
    const c = [0, 0, 0];
    const cc = [0, 0, 0];
    for (const v of loop) {
      for (let k = 0; k < 3; k++) {
        c[k] += pos[v * 3 + k];
        if (col) cc[k] += col[v * 3 + k];
      }
    }
    const centre = pos.length / 3;
    pos.push(c[0] / loop.length, c[1] / loop.length, c[2] / loop.length);
    if (col) col.push(cc[0] / loop.length, cc[1] / loop.length, cc[2] / loop.length);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      // The rim's triangle walks a → b; the patch walks b → a.
      faces.push(b, a, centre);
      added += 1;
    }
  }
  return {
    mesh: {
      ...mesh,
      positions: Float64Array.from(pos),
      colors: col ? Float32Array.from(col) : null,
      faces: Uint32Array.from(faces),
    },
    filled: loops.length,
    added,
  };
}

// ── Placing ───────────────────────────────────────────────

export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

// Y up → Z up: (x, y, z) → (x, −z, y), a turn about X (the front, +Z in
// glTF, becomes −Y, the front of a slicer's bed). Then the scale that makes
// the chosen dimension `size` mm, centred on X/Y, standing on Z = 0.
export function placeOnBed(positions, { size, sizeAxis }) {
  const out = new Float64Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i];
    out[i + 1] = -positions[i + 2];
    out[i + 2] = positions[i + 1];
  }
  const b = bounds(out);
  const ref = sizeAxis === 'longest' ? Math.max(...b.size) : b.size[2];
  const scale = ref > 0 ? size / ref : 1;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  for (let i = 0; i < out.length; i += 3) {
    out[i] = (out[i] - cx) * scale;
    out[i + 1] = (out[i + 1] - cy) * scale;
    out[i + 2] = (out[i + 2] - b.min[2]) * scale;
  }
  return { positions: out, scale };
}

// ── All together ──────────────────────────────────────────

export function preparePrint(meshes, options = {}) {
  const opts = normalizePrintOptions(options);
  const merged = mergeMeshes(meshes);
  if (!merged.faces.length) throw new Error('The model has no triangles to print.');
  const before = bounds(merged.positions);
  const diag = Math.hypot(...before.size) || 1;
  const welded = weld(merged, diag * 1e-6);
  const found = analyze(welded);
  let mesh = welded;
  let filled = 0;
  let added = 0;
  if (opts.fillHoles && found.boundaryEdges) {
    const r = fillHoles(mesh);
    mesh = r.mesh;
    filled = r.filled;
    added = r.added;
  }
  const flipped = orientConsistently(mesh);
  let inverted = false;
  if (signedVolume(mesh) < 0) {
    flipAll(mesh);
    inverted = true;
  }
  const placed = placeOnBed(mesh.positions, opts);
  mesh = { ...mesh, positions: placed.positions };
  const after = analyze(mesh);
  const box = bounds(mesh.positions);
  const volume = Math.abs(signedVolume(mesh)); // mm³
  return {
    mesh: { ...mesh, colors: opts.colors && opts.format === '3mf' ? mesh.colors : null },
    options: opts,
    report: {
      size: box.size,                      // mm, X × Y × Z (Z up)
      scale: placed.scale,                 // model units → mm
      triangles: after.triangles,
      vertices: after.vertices,
      welded: welded.stats.welded,
      removed: welded.stats.degenerate + welded.stats.duplicate,
      holesFound: found.boundaryEdges ? boundaryLoops(welded).length || 1 : 0,
      holesFilled: filled,
      patchTriangles: added,
      turned: flipped,
      inverted,
      boundaryEdges: after.boundaryEdges,
      nonManifoldEdges: after.nonManifoldEdges,
      watertight: after.watertight,
      volume,                              // mm³
      grams: after.watertight ? (volume / 1000) * PLA_DENSITY : null,
      colors: !!mesh.colors,               // the model has colours a 3MF can keep
    },
  };
}

// ── Writers ───────────────────────────────────────────────

// Binary STL (millimetres, no colours): 80-byte header, count, then per
// triangle its normal and three corners.
export function writeBinarySTL(mesh, header = 'My3DObjects 3D print (mm, Z up)') {
  const { positions: p, faces: f } = mesh;
  const nf = f.length / 3;
  const buf = new ArrayBuffer(84 + nf * 50);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const text = new TextEncoder().encode(header).slice(0, 80);
  bytes.set(text, 0);
  view.setUint32(80, nf, true);
  let o = 84;
  for (let i = 0; i < f.length; i += 3) {
    const a = f[i] * 3;
    const b = f[i + 1] * 3;
    const c = f[i + 2] * 3;
    const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a]; const vy = p[c + 1] - p[a + 1]; const vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [nx, ny, nz, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]) {
      view.setFloat32(o, v, true);
      o += 4;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return bytes;
}

export function writePrint(prepared, name = 'model') {
  const { mesh, options } = prepared;
  if (options.format === 'stl') return writeBinarySTL(mesh);
  return write3MF([{
    name,
    positions: mesh.positions,
    faces: mesh.faces,
    colors: mesh.colors,
    color: mesh.color || [0.8, 0.8, 0.8],
    points: false,
  }], { units: 'mm' });
}

export function printFileName(name, format) {
  const base = String(name || 'model').replace(/\.[^./\\]+$/, '') || 'model';
  return `${base}-print.${format === 'stl' ? 'stl' : '3mf'}`;
}

// ── Texture colours ───────────────────────────────────────

// Per-vertex colours from a mesh's base-colour texture, for printers that
// print colour (3MF). `sample(texture, uvs)` returns sRGB 0..1 per vertex;
// the browser one reads the texture's pixels through a canvas.
export function canvasTextureSampler(doc = globalThis.document) {
  const cache = new Map();
  const pixels = (texture) => {
    if (cache.has(texture)) return cache.get(texture);
    const img = texture?.image;
    const w = img?.width || img?.naturalWidth || 0;
    const h = img?.height || img?.naturalHeight || 0;
    let data = null;
    if (w && h && doc?.createElement) {
      const canvas = doc.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (img.data && img.data.length === w * h * 4) ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), w, h), 0, 0);
        else ctx.drawImage(img, 0, 0);
        data = { w, h, rgba: ctx.getImageData(0, 0, w, h).data };
      }
    }
    cache.set(texture, data);
    return data;
  };
  return (texture, uvs) => {
    const px = pixels(texture);
    if (!px) return null;
    const n = uvs.length / 2;
    const out = new Float32Array(n * 3);
    const flip = texture.flipY !== false; // three.js: v = 0 at the bottom when flipY
    for (let i = 0; i < n; i++) {
      let u = uvs[i * 2] % 1;
      let v = uvs[i * 2 + 1] % 1;
      if (u < 0) u += 1;
      if (v < 0) v += 1;
      const x = Math.min(px.w - 1, Math.floor(u * px.w));
      const y = Math.min(px.h - 1, Math.floor((flip ? 1 - v : v) * px.h));
      const k = (y * px.w + x) * 4;
      out[i * 3] = px.rgba[k] / 255;
      out[i * 3 + 1] = px.rgba[k + 1] / 255;
      out[i * 3 + 2] = px.rgba[k + 2] / 255;
    }
    return out;
  };
}
