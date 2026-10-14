// Colour lookup tables (LUTs): Adobe/Resolve .cube files (1D or 3D) and a few
// built-in looks. A LUT maps every input colour to an output colour; 3D tables
// are sampled with trilinear interpolation and blended by `amount`.
//
// Rendering is synchronous, so tables live in a cache: `prepareEdit(edit)`
// loads whatever an edit needs (imported LUTs are kept in the app data folder
// as lut-<id>.cube) before `render()` runs.
import { fs } from '../platform/fs.js';

/**
 * Parses a .cube file. Returns { kind: '3d' | '1d', size, table: Float32Array (rgb triples,
 * red fastest), min: [r,g,b], max: [r,g,b], title }. Throws on malformed input.
 */
export function parseCube(text) {
  let size = 0;
  let kind = null;
  let title = '';
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const word = parts[0].toUpperCase();
    if (word === 'TITLE') { title = line.slice(5).trim().replace(/^"|"$/g, ''); continue; }
    if (word === 'LUT_3D_SIZE') { kind = '3d'; size = Number(parts[1]); continue; }
    if (word === 'LUT_1D_SIZE') { kind = '1d'; size = Number(parts[1]); continue; }
    if (word === 'DOMAIN_MIN') { min = parts.slice(1, 4).map(Number); continue; }
    if (word === 'DOMAIN_MAX') { max = parts.slice(1, 4).map(Number); continue; }
    if (/^[A-Z_]+$/.test(word)) continue; // other keywords (LUT_3D_INPUT_RANGE …)
    if (parts.length < 3) throw new Error(`bad LUT line: ${line}`);
    values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }
  if (!kind || !(size >= 2) || size > 256) throw new Error('not a .cube LUT (no LUT_3D_SIZE / LUT_1D_SIZE)');
  const expected = (kind === '3d' ? size ** 3 : size) * 3;
  if (values.length !== expected) throw new Error(`LUT has ${values.length / 3} entries, expected ${expected / 3}`);
  if (values.some((v) => !Number.isFinite(v))) throw new Error('LUT has a value that is not a number');
  if ([0, 1, 2].some((c) => !(max[c] > min[c]))) throw new Error('bad LUT domain');
  return { kind, size, table: Float32Array.from(values), min, max, title };
}

/** Writes a 3D table as .cube text (used for exporting built-in looks and in tests). */
export function cubeText(lut, title = '') {
  const lines = [];
  if (title) lines.push(`TITLE "${title}"`);
  lines.push(`LUT_${lut.kind === '1d' ? '1D' : '3D'}_SIZE ${lut.size}`);
  for (let i = 0; i < lut.table.length; i += 3) lines.push(`${lut.table[i].toFixed(6)} ${lut.table[i + 1].toFixed(6)} ${lut.table[i + 2].toFixed(6)}`);
  return `${lines.join('\n')}\n`;
}

/** Builds a 3D LUT from a function (r, g, b in 0…1) → [r, g, b]. */
export function lutFrom(fn, size = 17) {
  const table = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const out = fn(r / (size - 1), g / (size - 1), b / (size - 1));
    table[i++] = out[0]; table[i++] = out[1]; table[i++] = out[2];
  }
  return { kind: '3d', size, table, min: [0, 0, 0], max: [1, 1, 1], title: '' };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smooth = (v) => v * v * (3 - 2 * v);

/** Built-in looks (id → maker). */
const BUILTIN = {
  'teal-orange': () => lutFrom((r, g, b) => {
    const y = luma(r, g, b);
    const warm = smooth(clamp01((y - 0.35) / 0.5));
    return [clamp01(r + 0.12 * warm - 0.06 * (1 - warm)), clamp01(g + 0.03 * warm + 0.02 * (1 - warm)), clamp01(b - 0.1 * warm + 0.1 * (1 - warm))];
  }),
  'warm-film': () => lutFrom((r, g, b) => {
    const lift = (v) => 0.06 + v * 0.9;
    return [clamp01(lift(r) * 1.06), clamp01(lift(g) * 1.0), clamp01(lift(b) * 0.88)];
  }),
  'cool-fade': () => lutFrom((r, g, b) => {
    const fade = (v) => 0.1 + v * 0.82;
    return [clamp01(fade(r) * 0.94), clamp01(fade(g) * 1.0), clamp01(fade(b) * 1.08)];
  }),
  'mono-film': () => lutFrom((r, g, b) => {
    const y = smooth(clamp01(luma(r, g, b) * 1.05 - 0.02));
    return [clamp01(y * 1.02), y, clamp01(y * 0.96)];
  }),
  'high-contrast': () => lutFrom((r, g, b) => [smooth(r), smooth(g), smooth(b)]),
};
export const BUILTIN_LUTS = Object.keys(BUILTIN);

const cache = new Map(); // id → parsed LUT

/** FNV-1a of the name: the id of an imported LUT. */
export function lutId(name) {
  let hash = 0x811c9dc5;
  for (const ch of name) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `u${hash.toString(16).padStart(8, '0')}`;
}

/** A LUT that is ready (built-in, or imported and loaded). */
export function getLut(id) {
  if (!id) return null;
  if (!cache.has(id) && BUILTIN[id]) cache.set(id, BUILTIN[id]());
  return cache.get(id) ?? null;
}

/** Loads the LUTs an edit uses (imported ones from the data folder). */
export async function prepareEdit(edit) {
  const id = edit?.lut?.id;
  if (!id || getLut(id)) return;
  const text = await fs.readData(`lut-${id}.cube`).catch(() => null);
  if (text) cache.set(id, parseCube(text));
}

/** Stores an imported LUT and returns its library entry { id, name }. */
export async function importLut(name, text) {
  const lut = parseCube(text);
  const id = lutId(name);
  await fs.writeData(`lut-${id}.cube`, text);
  cache.set(id, lut);
  return { id, name, size: lut.size, kind: lut.kind };
}

/** Applies a LUT to ImageData-like pixels in place; amount 0…1 blends with the original. */
export function applyLut(pixels, lut, amount = 1) {
  const data = pixels.data;
  const { size, table, min, max } = lut;
  const n = size - 1;
  const a = Math.max(0, Math.min(1, amount));
  if (lut.kind === '1d') {
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = clamp01((data[i + c] / 255 - min[c]) / (max[c] - min[c])) * n;
        const i0 = Math.floor(v);
        const i1 = Math.min(n, i0 + 1);
        const f = v - i0;
        const out = table[i0 * 3 + c] * (1 - f) + table[i1 * 3 + c] * f;
        data[i + c] = Math.round((data[i + c] / 255) * (1 - a) * 255 + clamp01(out) * a * 255);
      }
    }
    return pixels;
  }
  const s2 = size * size;
  const at = (r, g, b, c) => table[(b * s2 + g * size + r) * 3 + c];
  for (let i = 0; i < data.length; i += 4) {
    const r = clamp01((data[i] / 255 - min[0]) / (max[0] - min[0])) * n;
    const g = clamp01((data[i + 1] / 255 - min[1]) / (max[1] - min[1])) * n;
    const b = clamp01((data[i + 2] / 255 - min[2]) / (max[2] - min[2])) * n;
    const r0 = Math.floor(r); const g0 = Math.floor(g); const b0 = Math.floor(b);
    const r1 = Math.min(n, r0 + 1); const g1 = Math.min(n, g0 + 1); const b1 = Math.min(n, b0 + 1);
    const fr = r - r0; const fg = g - g0; const fb = b - b0;
    for (let c = 0; c < 3; c++) {
      const c00 = at(r0, g0, b0, c) * (1 - fr) + at(r1, g0, b0, c) * fr;
      const c10 = at(r0, g1, b0, c) * (1 - fr) + at(r1, g1, b0, c) * fr;
      const c01 = at(r0, g0, b1, c) * (1 - fr) + at(r1, g0, b1, c) * fr;
      const c11 = at(r0, g1, b1, c) * (1 - fr) + at(r1, g1, b1, c) * fr;
      const out = (c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb;
      data[i + c] = Math.round(data[i + c] * (1 - a) + clamp01(out) * 255 * a);
    }
  }
  return pixels;
}
