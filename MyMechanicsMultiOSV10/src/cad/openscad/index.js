// OpenSCAD files in MyMechanics: load the engines (Manifold, fonts), run a program to a mesh or outlines,
// read its Customizer parameters, and write models back as OpenSCAD source.
import { evaluate } from './evaluate.js';
import { createGeometry, parseFontName } from './geometry.js';
import { parse, scadError } from './parser.js';
import { toStr, numStr } from './values.js';

let W = null; let loading = null;
const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node) && typeof window === 'undefined';

/** Loads the Manifold engine once (wasm). */
export function loadManifold() {
  if (W) return Promise.resolve(W);
  if (!loading) loading = (async () => {
    const Module = (await import('manifold-3d')).default;
    let locateFile;
    if (isNode) {
      const nodeUrl = 'node:url';
      const { fileURLToPath } = await import(/* @vite-ignore */ nodeUrl);
      const file = fileURLToPath(new URL('../../../node_modules/manifold-3d/manifold.wasm', import.meta.url));
      locateFile = () => file;
    } else {
      const url = (await import('manifold-3d/manifold.wasm?url')).default;
      locateFile = () => url;
    }
    const w = await Module({ locateFile });
    w.setup();
    W = w;
    return w;
  })();
  return loading;
}
export const manifoldReady = () => Boolean(W);

// ───────────────────────── fonts (Liberation, as OpenSCAD's default; others given by the host)

const FONT_FILES = {
  'liberation sans': 'LiberationSans', 'liberation serif': 'LiberationSerif', 'liberation mono': 'LiberationMono',
};
const STYLE_FILES = { regular: 'Regular', bold: 'Bold', italic: 'Italic', oblique: 'Italic', 'bold italic': 'BoldItalic', 'bold oblique': 'BoldItalic', book: 'Regular', normal: 'Regular' };
const fontCache = new Map(); // "family|style" → opentype Font
let extraFont = null; // (family, style) → Promise<bytes | null> from the host (system fonts)

/** Lets the app hand system fonts in: fn(family, style) → Promise<Uint8Array | null>. */
export function setFontSource(fn) { extraFont = fn; }

const fontKey = (family, style) => `${String(family).toLowerCase()}|${String(style).toLowerCase()}`;

async function fontBytes(family, style) {
  const base = FONT_FILES[String(family).toLowerCase()];
  if (base) {
    const file = `${base}-${STYLE_FILES[String(style).toLowerCase()] ?? 'Regular'}.ttf`;
    if (isNode) {
      const fsName = 'node:fs'; const urlName = 'node:url';
      const fs = await import(/* @vite-ignore */ fsName); const { fileURLToPath } = await import(/* @vite-ignore */ urlName);
      // The path is a variable: a literal `new URL('…', import.meta.url)` makes Vite resolve it as a browser asset
      // (and warn that public files are served from the root) — this branch only runs in Node.
      const rel = ['..', '..', '..', 'public', 'fonts', 'liberation', file].join('/');
      return new Uint8Array(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url))));
    }
    const base2 = (import.meta.env?.BASE_URL ?? '/');
    const r = await fetch(`${base2}fonts/liberation/${file}`);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  return extraFont ? extraFont(family, style) : null;
}

/** Loads the fonts a program names in text() (and Liberation Sans, the default). */
export async function loadFonts(source) {
  if (!/\btext\s*\(/.test(String(source))) return false;
  let added = false;
  const names = new Set(['Liberation Sans']);
  for (const m of String(source).matchAll(/font\s*=\s*"([^"]+)"/g)) names.add(m[1]);
  const ot = await import('opentype.js'); const parseFont = ot.parse ?? ot.default?.parse;
  for (const name of names) {
    const { family, style } = parseFontName(name);
    const key = fontKey(family, style);
    if (fontCache.has(key)) continue;
    try {
      const bytes = await fontBytes(family, style);
      fontCache.set(key, bytes ? parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) : null);
      added = true;
    } catch { fontCache.set(key, null); }
  }
  return added;
}
const fontLookup = (family, style) => fontCache.get(fontKey(family, style)) ?? null;

// ───────────────────────── running a program

/**
 * Runs an OpenSCAD program (synchronously — the engines must be loaded: loadManifold, loadFonts). Options:
 *   files       { path: string | Uint8Array } — include / use / import / surface files
 *   overrides   { name: value } — Customizer values
 *   fileName    the program's own name (messages)
 * Returns { dim: 3, verts, tris, color, volume } | { dim: 2, outlines, color, area } | { dim: 0 } with
 * echoes, warnings and `missing` (files asked for but not given).
 */
/** Text of a .scad file: UTF-8, or Latin-1 when the bytes are not valid UTF-8 (as OpenSCAD reads old files). */
export function decodeScad(data) {
  if (typeof data === 'string') return data;
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { /* walk it */ }
  let out = ''; let i = 0;
  const lenOf = (c) => (c < 0x80 ? 1 : c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : c < 0xf8 ? 4 : c < 0xfc ? 5 : c < 0xfe ? 6 : 1);
  while (i < b.length) {
    const n = Math.min(lenOf(b[i]), b.length - i);
    let ch;
    try { ch = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(i, i + n)); } catch { ch = '\ufffd'; }
    out += ch; i += n;
  }
  return out;
}

export function runScad(source, { files = {}, overrides = {}, fileName = 'model.scad', specials = {} } = {}) {
  if (!W) throw scadError('the OpenSCAD engine is not loaded', null, 'scad-engine');
  const missing = new Set();
  const warnings = [];
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  const readFile = (path) => {
    const p = norm(path);
    const key = Object.keys(files).find((k) => norm(k) === p || norm(k).split('/').pop() === p.split('/').pop());
    if (key !== undefined) return files[key];
    missing.add(p);
    return null;
  };
  const geo = createGeometry(W, { fonts: fontLookup, warn: (m) => warnings.push(m) });
  try {
    const r = evaluate(source, { geo, readFile, overrides, fileName, specials });
    warnings.push(...r.warnings);
    const out = geo.finish(r.node) ?? { dim: 0 };
    if (out.mixed2d) warnings.push('Mixing 2D and 3D objects is not supported (the 2D objects are left out)');
    return { ...out, echoes: r.echoes, warnings, missing: [...missing] };
  } catch (error) {
    // The program stopped (assertion, recursion, syntax): what it echoed and warned so far, and the error.
    if (error?.code?.startsWith?.('scad')) return { dim: 0, error, echoes: error.echoes ?? [], warnings: [...(error.warnings ?? []), ...warnings], missing: [...missing] };
    throw error;
  } finally { geo.dispose(); }
}

/**
 * Runs a program, asking for the files it needs (`loadFile(path) → Promise<string | Uint8Array | null>`) and
 * running again until nothing is missing. Returns the result and the files used.
 */
export async function runScadWithFiles(source, { files = {}, loadFile = null, overrides = {}, fileName = 'model.scad', specials = {} } = {}) {
  await loadManifold();
  await loadFonts(source);
  const have = { ...files };
  for (let round = 0; round < 8; round++) {
    // Fonts named in included files too.
    const r = runScad(source, { files: have, overrides, fileName, specials });
    const need = r.missing.filter((p) => !(p in have));
    if (!need.length || !loadFile) return { result: r, files: have };
    let got = 0;
    for (const p of need) { const data = await loadFile(p); have[p] = data; if (data != null) { got++; if (/\.scad$/i.test(p)) await loadFonts(typeof data === 'string' ? data : new TextDecoder().decode(data)); } }
    if (!got) return { result: r, files: have };
  }
  return { result: runScad(source, { files: have, overrides, fileName, specials }), files: have };
}

// ───────────────────────── Customizer

/**
 * The Customizer parameters of a program: top-level assignments of plain values before the first module or
 * function definition, grouped by /* [Tab] *\/ comments ("Hidden" ones left out), with the comment above as
 * the description and the comment after as the widget: [a:b] slider, [a:s:b] slider with step, [x, y, z]
 * drop-down, [v:Label, …] labelled drop-down, [n] maximum or length of text.
 * Returns [{ name, value, kind: 'number' | 'string' | 'bool' | 'vector', group, description, min, max, step, options }].
 */
export function customizerParams(source) {
  const lines = String(source).split(/\r?\n/);
  let tree;
  try { tree = parse(source); } catch { return []; }
  const stop = tree.statements.findIndex((s) => s.t === 'module' || s.t === 'function');
  const stopLine = stop >= 0 ? tree.statements[stop].line : Infinity;
  const out = [];
  for (const s of tree.statements) {
    if (s.t !== 'assign' || s.line >= stopLine) continue;
    const value = literal(s.expr);
    if (value === NOT_LITERAL) continue;
    // The group: the last /* [Name] */ above the line.
    let group = '';
    for (let i = s.line - 1; i >= 0; i--) { const m = /\/\*\s*\[([^\]]+)\]\s*\*\//.exec(lines[i] ?? ''); if (m) { group = m[1].trim(); break; } }
    if (/^hidden$/i.test(group)) continue;
    const line = lines[s.line - 1] ?? '';
    const after = /;\s*\/\/\s*(.*)$/.exec(line)?.[1]?.trim() ?? '';
    const above = /^\s*\/\/\s*(.*)$/.exec(lines[s.line - 2] ?? '')?.[1]?.trim() ?? '';
    const p = { name: s.name, value, kind: typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'bool' : 'vector', group: group || 'Parameters', description: above.startsWith('[') ? '' : above };
    const w = /^\[(.*)\]$/.exec(after)?.[1];
    if (w != null) {
      const range = /^\s*(-?[\d.]+)\s*(?::\s*(-?[\d.]+)\s*)?(?::\s*(-?[\d.]+)\s*)?$/.exec(w);
      if (range && w.includes(':')) {
        if (range[3] != null) { p.min = Number(range[1]); p.step = Number(range[2]); p.max = Number(range[3]); }
        else { p.min = Number(range[1]); p.max = Number(range[2]); }
      } else if (range && p.kind === 'number') { p.min = 0; p.max = Number(range[1]); }
      else if (range && p.kind === 'string') p.maxLength = Number(range[1]);
      else {
        p.options = w.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
          const [v, label] = x.split(':');
          const val = /^-?[\d.]+$/.test(v.trim()) ? Number(v) : v.trim().replace(/^"|"$/g, '');
          return { value: val, label: label?.trim() ?? String(val) };
        });
      }
    }
    out.push(p);
  }
  return out;
}

const NOT_LITERAL = Symbol('not literal');
function literal(e) {
  switch (e.t) {
    case 'num': return e.v;
    case 'str': return e.v;
    case 'bool': return e.v;
    case 'un': { if (e.op !== '-') return NOT_LITERAL; const v = literal(e.e); return typeof v === 'number' ? -v : NOT_LITERAL; }
    case 'vec': { const v = e.items.map(literal); return v.includes(NOT_LITERAL) ? NOT_LITERAL : v; }
    default: return NOT_LITERAL;
  }
}

// ───────────────────────── writing OpenSCAD source

const fmt = (v) => numStr(Number(v) === 0 ? 0 : v);

/**
 * Bodies as an OpenSCAD program: each one a polyhedron() (faces clockwise seen from outside, as OpenSCAD
 * wants), coloured, placed by multmatrix() when it carries a 4×4 matrix (rows).
 *   bodies [{ name, verts: [[x, y, z]], tris: [[a, b, c]] (counterclockwise outward), color?: '#rrggbb' | [r, g, b], matrix? }]
 */
export function writeScad(bodies, { title = 'model', date = new Date() } = {}) {
  const out = [];
  out.push(`// ${title} — written by MyMechanics ${date.toISOString().slice(0, 10)}`);
  out.push('// Each body is a polyhedron (units: mm).');
  out.push('');
  for (const b of bodies) {
    const ident = String(b.name ?? 'body').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'body';
    out.push(`// ${b.name ?? ident}`);
    out.push(`module ${ident}() {`);
    out.push('  polyhedron(');
    out.push(`    points = [${b.verts.map((p) => `[${p.map(fmt).join(', ')}]`).join(', ')}],`);
    out.push(`    faces = [${b.tris.map(([a, b2, c]) => `[${a}, ${c}, ${b2}]`).join(', ')}],`);
    out.push('    convexity = 10);');
    out.push('}');
    out.push('');
  }
  for (const b of bodies) {
    const ident = String(b.name ?? 'body').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'body';
    let call = `${ident}();`;
    if (b.matrix) call = `multmatrix(${toStr(b.matrix.map((r) => r.map((v) => Number(fmt(v)))))}) ${call}`;
    if (b.color) {
      const c = typeof b.color === 'string' ? `"${b.color}"` : `[${b.color.map(fmt).join(', ')}]`;
      call = `color(${c}) ${call}`;
    }
    out.push(call);
  }
  out.push('');
  return out.join('\n');
}
