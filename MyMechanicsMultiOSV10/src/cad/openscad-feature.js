// The OpenSCAD feature: a part body made by an OpenSCAD program (its source, the Customizer values and the files
// it includes or imports are kept in the feature, so it rebuilds anywhere). The program runs on the OpenSCAD
// engine (openscad/); the mesh it gives becomes a solid with its coplanar triangles merged into faces.
import { rep } from './kernel.js';
import { runScad, manifoldReady, customizerParams } from './openscad/index.js';
import { solidFromMesh } from './stl.js';
import { codeError } from './features.js';

export { SCAD_DEFAULT_SOURCE as OPENSCAD_DEFAULT_SOURCE } from './part-more-types.js';

/**
 * A run made outside the feature (an import that loaded its files) as the feature's result: the solid is made
 * once and remembered, and `f.result` keeps it in the project so opening the file does not run the program.
 */
export function primeScadResult(f, r) {
  const key = scadKey(f);
  const shape = meshSolid(r.verts, r.tris);
  const entry = remember(key, { key: hashOf(key), brep: shape.serialize(), echoes: r.echoes, warnings: r.warnings, color: r.color, triangles: r.tris.length, missing: r.missing });
  return entry;
}

/**
 * A closed, outward-oriented triangle mesh (as Manifold gives it) as a solid: each connected piece becomes its
 * own solid; pieces turned inward (negative volume: cavities) are cut out of the solid around them. Several
 * separate solids come out as one compound.
 */
export function meshSolid(verts, tris) {
  // Connected pieces over shared corners (union–find).
  const parent = new Int32Array(verts.length).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const [a, b, c] of tris) { const ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra; }
  const groups = new Map();
  for (const t of tris) { const r = find(t[0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  if (groups.size === 1) return solidFromMesh(verts, tris);
  const R = rep();
  const pieces = [...groups.values()].map((list) => {
    const map = new Map(); const vs = [];
    const ts = list.map((t) => t.map((i) => { let j = map.get(i); if (j === undefined) { j = vs.length; vs.push(verts[i]); map.set(i, j); } return j; }));
    let vol = 0;
    for (const [a, b, c] of ts) { const p = vs[a], q = vs[b], r = vs[c]; vol += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]); }
    // solidFromMesh makes the volume positive either way; the sign says solid or cavity.
    return { solid: solidFromMesh(vs, ts), cavity: vol < 0, size: Math.abs(vol) };
  });
  const solids = pieces.filter((p) => !p.cavity).map((p) => p.solid);
  let shape = solids.length === 1 ? solids[0] : R.makeCompound(solids);
  for (const p of pieces.filter((x) => x.cavity).sort((a, b) => b.size - a.size)) shape = shape.cut(p.solid);
  return shape;
}

/** Files kept in a feature: text as it is, bytes as { b64 }. */
export function packFiles(files) {
  const out = {};
  for (const [k, v] of Object.entries(files ?? {})) {
    if (v == null) continue;
    if (typeof v === 'string') out[k] = v;
    else { let s = ''; const b = v instanceof Uint8Array ? v : new Uint8Array(v); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); out[k] = { b64: btoa(s) }; }
  }
  return out;
}
export function unpackFiles(files) {
  const out = {};
  for (const [k, v] of Object.entries(files ?? {})) {
    if (typeof v === 'string') out[k] = v;
    else if (v?.b64 != null) { const s = atob(v.b64); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); out[k] = b; }
  }
  return out;
}

/** The key a build is cached by: the program, its values and its files. */
export function scadKey(f) {
  const files = Object.entries(f.files ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v.length : v?.b64?.length ?? 0]).sort();
  return JSON.stringify([f.source ?? '', f.overrides ?? {}, files, f.fileName ?? '', ...(scadUsesTime(f) ? [scadTime(f)] : [])]);
}
/** The animation time $t of the feature (0 ≤ $t < 1). */
export const scadTime = (f) => { const v = Number(f.animT ?? 0); return Number.isFinite(v) ? v - Math.floor(v) : 0; };
/** Whether the program reads $t (otherwise every time gives the same body and one cache entry). */
export const scadUsesTime = (f) => /\$t\b/.test(String(f.source ?? ''));
/** The specials a run of the feature starts with. */
export const scadSpecials = (f) => ({ $t: scadTime(f) });

const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

const cache = new Map(); // key → { brep, echoes, warnings, color, dim, triangles }
const failed = new Map(); // key → { code, error, echoes, warnings } of a program that did not give a solid
function fail(key, code, info) {
  failed.set(key, { code, ...info });
  while (failed.size > 64) failed.delete(failed.keys().next().value);
  throw codeError(code, info);
}
const remember = (key, entry) => { cache.set(key, entry); while (cache.size > 96) cache.delete(cache.keys().next().value); return entry; };

/** Runs the program of `f` (or takes the cached result): { brep, echoes, warnings, color } or throws a coded error. */
export function scadResult(f) {
  const key = scadKey(f);
  const hit = cache.get(key);
  if (hit) return hit;
  // A result saved in the project with the same key (opening a file does not run the program again).
  if (f.result?.brep && f.result.key === hashOf(key)) return remember(key, { ...f.result });
  if (hit === undefined && failed.has(key)) { const x = failed.get(key); throw codeError(x.code, x); }
  if (!manifoldReady()) throw codeError('scad-engine');
  let r;
  try { r = runScad(String(f.source ?? ''), { files: unpackFiles(f.files), overrides: f.overrides ?? {}, fileName: f.fileName || 'model.scad', specials: scadSpecials(f) }); }
  catch (error) { fail(key, 'scad-error', { error: String(error?.message ?? error), echoes: [], warnings: [] }); }
  const info = { echoes: r.echoes, warnings: r.warnings, missing: r.missing };
  if (r.error) fail(key, 'scad-error', { error: r.error.message, ...info });
  if (r.dim === 2) fail(key, 'scad-2d', info);
  if (r.dim !== 3 || !r.tris?.length) fail(key, 'scad-empty', info);
  let shape;
  try { shape = meshSolid(r.verts, r.tris); } catch { fail(key, 'scad-solid', info); }
  failed.delete(key);
  return remember(key, { key: hashOf(key), brep: shape.serialize(), echoes: r.echoes, warnings: r.warnings, color: r.color, triangles: r.tris.length, missing: r.missing });
}

/** The feature's body (added to the part's body, as an imported body is). */
export function buildOpenScad(f, ctx) {
  const res = scadResult(f);
  const shape = rep().deserializeShape(res.brep);
  return { body: ctx.body ? ctx.body.fuse(shape) : shape };
}

/** The key a result saved in the project carries (a hash of the program, its values and files). */
export const scadSavedKey = (f) => hashOf(scadKey(f));

/** What the program printed and warned the last time it ran (for the PropertyManager), or null. */
export function scadReport(f) { const k = scadKey(f); return cache.get(k) ?? failed.get(k) ?? null; }

/** The Customizer parameters of the feature's program with the values it uses now. */
export function scadParams(f) {
  return customizerParams(f.source ?? '').map((p) => ({ ...p, current: Object.prototype.hasOwnProperty.call(f.overrides ?? {}, p.name) ? f.overrides[p.name] : p.value }));
}
