// A USD stage, the same whichever way it was written: text (.usda), binary (.usdc), or either inside a .usdz.
// prims: Map(path → { path, name, type, parent, children, attrs: Map(name → { value, samples, connect, interpolation }), rels: Map(name → [paths]) }).
// References, payloads, inherits and variants are composed (composeStage); other files are found inside a .usdz or among those given.
import { Crate } from './usdc.js';
import { readZipEntries } from './formats.js';

// ─────────────── text

const PUNCT = new Set(['(', ')', '[', ']', '{', '}', '=', ',', ':', ';']);

function lex(text) {
  const tokens = [];
  let i = text.startsWith('#usda') ? text.indexOf('\n') + 1 : 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '#') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'") {
      const triple = text.startsWith(c.repeat(3), i);
      const close = triple ? c.repeat(3) : c;
      let j = i + close.length;
      let out = '';
      while (j < n && !text.startsWith(close, j)) {
        if (text[j] === '\\' && j + 1 < n) { const e = text[j + 1]; out += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; } else out += text[j++];
      }
      tokens.push({ kind: 'str', value: out });
      i = j + close.length;
      continue;
    }
    if (c === '@') {
      const triple = text.startsWith('@@@', i);
      const close = triple ? '@@@' : '@';
      const j = text.indexOf(close, i + close.length);
      tokens.push({ kind: 'asset', value: text.slice(i + close.length, j) });
      i = j + close.length;
      continue;
    }
    if (c === '<') {
      const j = text.indexOf('>', i);
      tokens.push({ kind: 'path', value: text.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const number = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(text.slice(i, i + 40));
    if (number && (c !== '-' || /[\d.]/.test(text[i + 1]))) { tokens.push({ kind: 'num', value: Number(number[0]) }); i += number[0].length; continue; }
    if (c === '-' && text.startsWith('-inf', i)) { tokens.push({ kind: 'num', value: -Infinity }); i += 4; continue; }
    if (PUNCT.has(c)) { tokens.push({ kind: c }); i++; continue; }
    const word = /^[A-Za-z_][\w:.|-]*/.exec(text.slice(i, i + 256));
    if (word) {
      const w = word[0];
      if (w === 'inf') tokens.push({ kind: 'num', value: Infinity });
      else if (w === 'nan') tokens.push({ kind: 'num', value: NaN });
      else tokens.push({ kind: 'id', value: w });
      i += w.length;
      continue;
    }
    i++;
  }
  return tokens;
}

/** The text format into a stage. */
function parseUSDA(text) {
  const t = lex(text);
  let at = 0;
  const peek = (k = 0) => t[at + k];
  const next = () => t[at++];
  const is = (kind, value) => peek()?.kind === kind && (value === undefined || peek().value === value);
  const skipBalanced = () => {
    const open = next().kind;
    const close = { '(': ')', '[': ']', '{': '}' }[open];
    let depth = 1;
    while (at < t.length && depth > 0) { const k = next().kind; if (k === open) depth++; else if (k === close) depth--; }
  };
  const value = () => {
    const tok = peek();
    if (!tok) return null;
    if (tok.kind === 'num' || tok.kind === 'str') { at++; return tok.value; }
    if (tok.kind === 'asset' || tok.kind === 'path') {
      // A reference or payload: a file, a prim in it, or both, perhaps with a time offset after.
      at++;
      const out = tok.kind === 'asset' ? { asset: tok.value } : { path: tok.value };
      if (tok.kind === 'asset' && is('path')) out.path = next().value;
      if (is('(') && peek(1)?.kind === 'id' && peek(2)?.kind === '=') skipBalanced();
      return out;
    }
    if (tok.kind === 'id') { at++; return tok.value === 'None' ? null : tok.value === 'true' ? true : tok.value === 'false' ? false : tok.value; }
    if (tok.kind === '(' || tok.kind === '[') {
      const close = tok.kind === '(' ? ')' : ']';
      at++;
      const list = [];
      while (at < t.length && !is(close)) { list.push(value()); if (is(',')) at++; }
      at++;
      return list;
    }
    if (tok.kind === '{') {
      // Time samples are numbers and values; anything else in braces is a dictionary.
      if (peek(1)?.kind === 'num' && peek(2)?.kind === ':') {
        at++;
        const samples = [];
        while (at < t.length && !is('}')) {
          const time = next().value;
          at++; // ':'
          samples.push([time, value()]);
          if (is(',')) at++;
        }
        at++;
        return { samples };
      }
      return dictionary();
    }
    at++;
    return null;
  };
  /** A dictionary: typed entries, "dictionary" ones nested. Kept as { name: { type, value } }. */
  const dictionary = () => {
    at++; // '{'
    const out = {};
    while (at < t.length && !is('}')) {
      if (!is('id')) { at++; continue; }
      const type = next().value;
      if (is('[') && peek(1)?.kind === ']') at += 2;
      const name = is('str') || is('id') ? next().value : '';
      if (!is('=')) continue;
      at++;
      out[name] = { type, value: type === 'dictionary' ? (is('{') ? dictionary() : null) : value() };
      if (is(',') || is(';')) at++;
    }
    at++;
    return out;
  };
  /** Metadata in parentheses: the plain key = value pairs. */
  const meta = () => {
    const out = {};
    if (!is('(')) return out;
    at++;
    while (at < t.length && !is(')')) {
      let op = null;
      if (is('id') && ['prepend', 'append', 'delete', 'add', 'reorder'].includes(peek().value)) op = next().value;
      if (is('id') && peek(1)?.kind === '=') {
        const key = next().value;
        at++;
        const v = value();
        // A deleted list item takes nothing away here; only what is set, added, prepended or appended counts.
        if (op !== 'delete' && op !== 'reorder') out[key] = op && Array.isArray(out[key]) ? [...out[key], ...(Array.isArray(v) ? v : [v])] : v;
      } else if (is('(') || is('[') || is('{')) skipBalanced(); else at++;
      if (is(',') || is(';')) at++;
    }
    at++;
    return out;
  };
  const stage = { meta: {}, prims: new Map() };
  const root = { path: '/', name: '', type: '', parent: null, children: [], attrs: new Map(), rels: new Map() };
  stage.prims.set('/', root);
  // Where new prims are kept: the stage, or a variant's own registry while one is read.
  let registry = stage.prims;
  if (is('(')) stage.meta = meta();
  const SPECIFIERS = new Set(['def', 'over', 'class']);
  const QUALIFIERS = new Set(['custom', 'uniform', 'varying', 'config', 'prepend', 'append', 'delete', 'add', 'reorder']);
  const primBody = (prim) => {
    at++; // '{'
    while (at < t.length && !is('}')) {
      const tok = peek();
      if (tok.kind === 'id' && SPECIFIERS.has(tok.value)) { prim.children.push(primDef(prim)); continue; }
      if (tok.kind === 'id' && tok.value === 'variantSet') {
        // variantSet "name" = { "variant" { …a prim body… } … }: each kept aside, its prims in a registry of its own.
        at++;
        const setName = is('str') ? next().value : '';
        if (is('=')) at++;
        if (!is('{')) continue;
        at++;
        while (at < t.length && !is('}')) {
          if (!is('str')) { at++; continue; }
          const variant = next().value;
          meta();
          if (!is('{')) continue;
          const holder = { path: prim.path, name: prim.name, type: '', parent: prim.parent, children: [], attrs: new Map(), rels: new Map(), meta: {} };
          const saved = registry;
          registry = new Map();
          primBody(holder);
          holder.registry = registry;
          registry = saved;
          ((prim.variantSets ??= {})[setName] ??= {})[variant] = holder;
        }
        at++;
        continue;
      }
      if (tok.kind !== 'id') { if (is('(') || is('[') || is('{')) skipBalanced(); else at++; continue; }
      // A property: qualifiers, a type (or rel), a name, perhaps a value and metadata.
      const qualifiers = new Set();
      while (is('id') && QUALIFIERS.has(peek().value)) qualifiers.add(next().value);
      if (!is('id')) continue;
      if (peek().value === 'rel') {
        at++;
        const name = next().value;
        let targets = [];
        if (is('=')) { at++; const v = value(); targets = (Array.isArray(v) ? v : [v]).filter(Boolean).map((x) => x.path); }
        meta();
        prim.rels.set(name, [...(prim.rels.get(name) ?? []), ...targets]);
        (prim.relOrder ??= []).includes(name) || prim.relOrder.push(name);
        continue;
      }
      let typeName = next().value;
      if (is('[') && peek(1)?.kind === ']') { at += 2; typeName += '[]'; }
      if (!is('id')) continue;
      let name = next().value;
      let part = '';
      const dot = /\.(timeSamples|connect|default)$/.exec(name);
      if (dot) { part = dot[1]; name = name.slice(0, -dot[0].length); }
      const attr = prim.attrs.get(name) ?? { value: null, samples: null, connect: null, interpolation: null };
      attr.typeName = typeName;
      if (qualifiers.has('uniform')) attr.uniform = true;
      if (qualifiers.has('custom')) attr.custom = true;
      if (is('=')) {
        at++;
        const v = value();
        if (part === 'timeSamples') attr.samples = v?.samples ?? null;
        else if (part === 'connect') attr.connect = (Array.isArray(v) ? v : [v]).filter(Boolean).map((x) => x.path);
        else attr.value = v;
      }
      const m = meta();
      if (m.interpolation) attr.interpolation = m.interpolation;
      if (m.elementSize != null) attr.elementSize = m.elementSize;
      prim.attrs.set(name, attr);
    }
    at++; // '}'
  };
  const primDef = (parent) => {
    const specifier = next().value;
    const type = is('id') ? next().value : '';
    const name = is('str') ? next().value : '';
    const path = parent.path === '/' ? `/${name}` : `${parent.path}/${name}`;
    const prim = { path, name, type, specifier, parent: parent.path, children: [], attrs: new Map(), rels: new Map() };
    registry.set(path, prim);
    prim.meta = meta();
    if (is('{')) primBody(prim);
    return prim;
  };
  while (at < t.length) {
    if (is('id') && SPECIFIERS.has(peek().value)) root.children.push(primDef(root));
    else at++;
  }
  return stage;
}

// ─────────────── binary

function crateStage(bytes) {
  const crate = new Crate(bytes);
  const stage = { meta: {}, prims: new Map() };
  const rootSpec = crate.specs.get('/');
  for (const key of ['upAxis', 'metersPerUnit', 'timeCodesPerSecond', 'framesPerSecond', 'startTimeCode', 'endTimeCode', 'defaultPrim']) {
    if (rootSpec?.fields[key] != null) stage.meta[key] = crate.value(rootSpec.fields[key]);
  }
  const primOf = (path) => {
    if (stage.prims.has(path)) return stage.prims.get(path);
    const parent = path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/';
    const prim = { path, name: path.slice(path.lastIndexOf('/') + 1), type: '', parent, children: [], attrs: new Map(), rels: new Map() };
    stage.prims.set(path, prim);
    if (parent != null) primOf(parent).children.push(prim);
    return prim;
  };
  primOf('/');
  for (const [path, spec] of crate.specs) {
    const dot = path.indexOf('.', path.lastIndexOf('/'));
    if (dot < 0) {
      // Variants are not read from binary files: their prims sit at paths with braces, left out here.
      if (path.includes('{')) continue;
      const prim = primOf(path);
      const f = spec.fields;
      if (f.typeName != null) prim.type = crate.value(f.typeName) ?? '';
      if (f.specifier != null) prim.specifier = ['def', 'over', 'class'][crate.value(f.specifier)] ?? 'def';
      prim.meta ??= {};
      if (f.references != null) prim.meta.references = crate.value(f.references) ?? [];
      if (f.payload != null) { const p = crate.value(f.payload); prim.meta.payload = Array.isArray(p) ? p : p ? [p] : []; }
      if (f.inheritPaths != null) prim.meta.inherits = (crate.value(f.inheritPaths) ?? []).map((x) => ({ path: x }));
      continue;
    }
    const prim = primOf(path.slice(0, dot) || '/');
    const name = path.slice(dot + 1);
    if (spec.type === 8) { prim.rels.set(name, crate.value(spec.fields.targetPaths) ?? []); continue; }
    if (spec.type !== 1) continue;
    const timeSamples = spec.fields.timeSamples != null ? crate.value(spec.fields.timeSamples) : null;
    prim.attrs.set(name, {
      value: spec.fields.default != null ? crate.value(spec.fields.default) : null,
      samples: timeSamples ? timeSamples.times.map((time, i) => [time, timeSamples.values[i]]) : null,
      connect: spec.fields.connectionPaths != null ? crate.value(spec.fields.connectionPaths) : null,
      interpolation: spec.fields.interpolation != null ? crate.value(spec.fields.interpolation) : null,
      elementSize: spec.fields.elementSize != null ? crate.value(spec.fields.elementSize) : null,
    });
  }
  return stage;
}

export { parseUSDA };

/**
 * Any USD file into a stage, with a .usdz's other files (pictures, other layers) by name, composed: references, payloads,
 * inherits and variants followed (`compose: false` leaves them as written). Files outside a .usdz can be given as `files`.
 */
export function readUSDStage(input, { compose = true, files = null } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const head = new TextDecoder().decode(bytes.subarray(0, 8));
  let stage;
  if (head.startsWith('PK')) {
    const entries = readZipEntries(bytes);
    const main = entries.find((e) => /\.usd[ac]?$/i.test(e.name));
    if (!main) throw new Error('This .usdz holds no USD file');
    stage = readUSDStage(main.bytes, { compose: false });
    stage.files = new Map(entries.filter((e) => e !== main).map((e) => [e.name, e.bytes]));
  } else {
    stage = head.startsWith('PXR-USDC') ? crateStage(bytes) : head.startsWith('#usda') ? parseUSDA(new TextDecoder().decode(bytes)) : null;
    if (!stage) throw new Error('Not a USD file');
    stage.files = new Map();
  }
  if (files) for (const [k, v] of files) stage.files.set(k, v);
  return compose ? composeStage(stage) : stage;
}

/**
 * Composition, in USD's order of strength: what a prim says itself, then the classes it inherits, its chosen variants, its
 * references and its payloads. Each fills in only what is not said already, and brings the prims under it along, moved to their
 * new place (paths inside the copied part follow it). Other files are found among `files` (a .usdz's own); one that is not
 * there is listed in stage.missing. Returns the stage.
 */
export function composeStage(stage, files = stage.files ?? new Map(), depth = 0) {
  const layers = new Map();
  stage.missing ??= [];
  const layerOf = (asset) => {
    const name = String(asset).replace(/\\/g, '/').replace(/^\.\//, '');
    if (layers.has(name)) return layers.get(name);
    const bytes = files.get(name) ?? [...files.entries()].find(([k]) => k.endsWith(`/${name}`) || k === name.split('/').pop())?.[1];
    let layer = null;
    if (bytes && depth < 8) {
      try { layer = composeStage(readUSDStage(bytes, { compose: false }), files, depth + 1); } catch { layer = null; }
    }
    if (!layer && !stage.missing.includes(name)) stage.missing.push(name);
    layers.set(name, layer);
    return layer;
  };
  const prims = stage.prims;
  const moved = (p, from, to) => (p === from || p.startsWith(`${from}/`) || p.startsWith(`${from}.`) ? to + p.slice(from.length) : p);
  /** Copies what `source` says into `target` where `target` is silent, prims below included. */
  const graft = (target, source, from, to) => {
    if (!source) return;
    if (!target.type && source.type) target.type = source.type;
    target.meta ??= {};
    for (const [k, v] of Object.entries(source.meta ?? {})) if (target.meta[k] == null && !['references', 'payload', 'inherits', 'variants', 'variantSets', 'specializes'].includes(k)) target.meta[k] = v;
    for (const [name, a] of source.attrs) {
      if (target.attrs.has(name)) continue;
      target.attrs.set(name, { ...a, connect: a.connect?.map((p) => moved(p, from, to)) ?? null });
    }
    for (const [name, list] of source.rels) if (!target.rels.has(name)) target.rels.set(name, list.map((p) => moved(p, from, to)));
    for (const child of source.children) {
      const path = `${target.path}/${child.name}`;
      let mine = prims.get(path);
      if (!mine) {
        mine = { path, name: child.name, type: '', specifier: child.specifier, parent: target.path, children: [], attrs: new Map(), rels: new Map(), meta: {} };
        prims.set(path, mine);
        target.children.push(mine);
      }
      // The child's own arcs go along, to be composed in its new place.
      for (const k of ['references', 'payload', 'inherits', 'variants']) if (child.meta?.[k] != null && mine.meta[k] == null) mine.meta[k] = child.meta[k];
      if (child.variantSets && !mine.variantSets) mine.variantSets = child.variantSets;
      mine.layer ??= source.layer;
      graft(mine, child, from, to);
    }
  };
  const arcs = (value) => (Array.isArray(value) ? value : value ? [value] : []).filter((x) => x && (x.asset || x.path));
  const compose = (prim, seen) => {
    if (seen.has(prim.path)) return;
    seen.add(prim.path);
    const meta = prim.meta ?? {};
    // Inherits: classes in this layer.
    for (const arc of arcs(meta.inherits)) { const source = prims.get(arc.path); if (source) compose(source, seen); graft(prim, source, arc.path, prim.path); }
    // Variants: the selected one of each set, or its first.
    for (const [set, variants] of Object.entries(prim.variantSets ?? {})) {
      const chosen = meta.variants?.[set]?.value ?? Object.keys(variants)[0];
      // The variant's prims come under this one, as if written here.
      if (variants[chosen]) graft(prim, variants[chosen], prim.path, prim.path);
    }
    // References, then payloads: a prim of this layer by path, or of another file (its default prim when no path is given).
    for (const arc of [...arcs(meta.references), ...arcs(meta.payload)]) {
      const layer = arc.asset ? layerOf(arc.asset) : stage;
      if (!layer) continue;
      const path = arc.path ?? (layer.meta?.defaultPrim ? `/${layer.meta.defaultPrim}` : layer.prims.get('/')?.children[0]?.path);
      const source = path ? layer.prims.get(path) : null;
      if (!source) continue;
      if (layer === stage) { compose(source, seen); graft(prim, source, path, prim.path); } else {
        // From another file: its prims come in under this one, their paths moved likewise.
        graft(prim, source, path, prim.path);
        if (layer.files) for (const [k, v] of layer.files) if (!files.has(k)) files.set(k, v);
      }
    }
    for (const c of [...prim.children]) compose(c, seen);
  };
  const seen = new Set();
  for (const c of [...prims.get('/').children]) compose(c, seen);
  return stage;
}

/** An attribute's value at a time: held before the first sample and after the last, straight between. */
export function attrAt(attr, time) {
  if (!attr) return null;
  const s = attr.samples;
  if (!s?.length || time == null) return attr.value ?? s?.[0]?.[1] ?? null;
  if (time <= s[0][0]) return s[0][1];
  if (time >= s.at(-1)[0]) return s.at(-1)[1];
  let i = 0;
  while (i + 1 < s.length - 1 && s[i + 1][0] <= time) i++;
  const [[t0, a], [t1, b]] = [s[i], s[i + 1]];
  const k = (time - t0) / (t1 - t0);
  const mix = (x, y) => (Array.isArray(x) ? x.map((v, n) => mix(v, y[n])) : typeof x === 'number' ? x + (y - x) * k : x);
  return mix(a, b);
}
