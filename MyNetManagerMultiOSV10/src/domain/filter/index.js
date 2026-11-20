// Display filters — public API (see ARCHITECTURE.md "Display filters").
import { FILTER_ERRORS, FilterError } from './errors.js';
import { parse } from './parser.js';
import { compileAst } from './compile.js';

export { FILTER_ERRORS, FilterError } from './errors.js';
export { suggestFields, suggestValues, completionContext } from './suggest.js';
export { filterForNode, conversationFilter, combineFilters, formatFilterValue, packetEndpoints } from './apply.js';

import { getDefaultFields } from './registry.js';
export { setDefaultFields, getDefaultFields } from './registry.js';

const CACHE = new Map(); // text → compiled (per registry), bounded
const CACHE_MAX = 200;

// ───────────────────────── display filter macros (Analyze › Display Filter Macros)
//
// As Wireshark: "${name:arg1;arg2}" or "$name(arg1, arg2)" (or "${name}" without arguments) is replaced by
// the macro's text with $1, $2 … replaced by the arguments, before the filter is compiled. "${ip.src}" with
// no macro of that name stays a field reference.
const MACROS = new Map();
const MACRO_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Sets the macros: [{ name, text }] (names: letters, digits, underscores). */
export function setFilterMacros(list) {
  MACROS.clear();
  for (const m of list ?? []) if (m && MACRO_NAME.test(String(m.name ?? '')) && String(m.text ?? '').trim()) MACROS.set(m.name, String(m.text).trim());
  CACHE.clear();
}

export function getFilterMacros() { return [...MACROS].map(([name, text]) => ({ name, text })); }

/** Parses "name = text" lines (# comments, blank lines skipped) → { macros: [{ name, text }], errors: [line] }. */
export function parseMacroLines(text) {
  const macros = [];
  const errors = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.+)$/.exec(line);
    if (m) macros.push({ name: m[1], text: m[2].trim() }); else errors.push(line);
  }
  return { macros, errors };
}

/** The filter with every macro use replaced → { text } or { error, at, end }. */
export function expandMacros(text, macros = MACROS) {
  let out = String(text ?? '');
  for (let pass = 0; pass < 8; pass++) {
    let error = null;
    let used = false;
    const use = (match, name, args, at) => {
      const body = macros.get(name);
      if (body != null) used = true;
      if (body == null) {
        if (args != null) error = error ?? { error: `There is no display filter macro "${name}".`, at, end: at + match.length };
        return match;
      }
      const list = args == null || args === '' ? [] : args.split(match.startsWith('${') ? ';' : ',').map((a) => a.trim());
      return body.replace(/\$(\d+)/g, (m, n) => list[Number(n) - 1] ?? m);
    };
    const next = out
      .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([^}]*))?\}/g, (m, name, args, at) => use(m, name, args ?? null, at))
      .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/g, (m, name, args, at) => use(m, name, args, at));
    if (error) return error;
    if (!used) return { text: out };
    out = next;
  }
  return { error: 'Display filter macros are nested too deeply (a macro uses itself?).', at: 0, end: String(text).length };
}

/**
 * Compile a display filter.
 * opts: { fields?: Map, reference?: Dissection (for ${field} references), unknownFields?: 'error'|'absent' }
 * → { ok: true, test(d, ref?) → bool, fieldsUsed, text, deprecated: [{message, at, end}] }
 *   | { ok: false, error, code, at, end, text }
 * An empty filter compiles to a test that accepts everything (empty: true).
 */
export function compileFilter(text, opts = {}) {
  text = text == null ? '' : String(text);
  if (MACROS.size && text.includes('$')) {
    const expanded = expandMacros(text);
    if (expanded.error) return { ok: false, error: expanded.error, code: FILTER_ERRORS.UNEXPECTED_TOKEN, at: expanded.at ?? 0, end: expanded.end ?? text.length, text };
    if (expanded.text !== text) {
      const r = compileFilter(expanded.text, opts);
      return r.ok ? { ...r, text, expanded: expanded.text } : { ...r, text, expanded: expanded.text, error: `${r.error} (${expanded.text})`, at: 0, end: text.length };
    }
  }
  const fields = opts.fields || getDefaultFields();
  const key = text + '\u0000' + (opts.unknownFields || '');
  const cacheable = !opts.reference;
  if (cacheable) {
    const hit = CACHE.get(key);
    if (hit && hit.fields === fields) return hit.result;
  }
  const result = doCompile(text, fields, opts);
  if (cacheable) {
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, { fields, result });
  }
  return result;
}

function doCompile(text, fields, opts) {
  try {
    const { ast, deprecated, setSpaces } = parse(text);
    const dep = [...deprecated];
    for (const s of setSpaces || []) dep.push({ message: 'Set elements should be separated by commas ("{80, 443}").', at: s.at, end: s.end });
    if (!ast) return { ok: true, empty: true, test: () => true, fieldsUsed: [], text, deprecated: dep };
    const c = compileAst(ast, { fields, unknownFields: opts.unknownFields });
    const fn = c.test;
    const baseRef = opts.reference || null;
    const env = { ref: baseRef };
    const test = (d, ref) => {
      if (ref !== undefined) return fn(d, { ref });
      return fn(d, env);
    };
    return { ok: true, empty: false, test, fieldsUsed: c.fieldsUsed, text, deprecated: dep, usesReference: /\$/.test(text), presence: presenceOnly(ast) };
  } catch (e) {
    if (e instanceof FilterError) return { ok: false, error: e.message, code: e.code, at: e.at, end: e.end, args: e.args, text };
    return { ok: false, error: String(e && e.message || e), code: FILTER_ERRORS.UNEXPECTED_TOKEN, at: 0, end: text.length, text };
  }
}

/**
 * True when the filter only asks which fields / protocols a packet has ("tcp or udp", "not arp and not
 * dns", "tcp.analysis.retransmission"): and / or / xor / not over bare names, no comparisons, layers,
 * slices or references. Such a filter gives the same answer on a packet's field names alone
 * (CaptureDoc keeps them per packet), so it can run without dissecting the packet again.
 */
export function presenceOnly(ast) {
  if (!ast) return false;
  switch (ast.k) {
    case 'and': case 'or': case 'xor': return presenceOnly(ast.a) && presenceOnly(ast.b);
    case 'not': case 'paren': return presenceOnly(ast.a);
    case 'word': return !ast.layer && !ast.rawBytes && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(ast.text);
    default: return false;
  }
}

/** Status for the filter bar colour: 'empty' | 'valid' | 'invalid' | 'deprecated'. */
export function checkFilter(text, opts = {}) {
  return validateFilter(text, opts).status;
}

/** Like checkFilter with details: { status, error?, code?, at?, end?, deprecated: [...] }. */
export function validateFilter(text, opts = {}) {
  if (text == null || !String(text).trim()) return { status: 'empty', deprecated: [] };
  const r = compileFilter(text, opts);
  if (!r.ok) return { status: 'invalid', error: r.error, code: r.code, at: r.at, end: r.end, deprecated: [] };
  return { status: r.deprecated.length ? 'deprecated' : 'valid', deprecated: r.deprecated, fieldsUsed: r.fieldsUsed };
}

/** Filter a list of dissections; returns the indices that match. Convenience for tests and tools. */
export function applyFilter(text, dissections, opts = {}) {
  const c = compileFilter(text, opts);
  if (!c.ok) throw new Error(c.error);
  const out = [];
  for (let i = 0; i < dissections.length; i++) if (c.test(dissections[i])) out.push(i);
  return out;
}
