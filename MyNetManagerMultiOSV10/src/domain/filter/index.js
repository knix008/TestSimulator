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

/**
 * Compile a display filter.
 * opts: { fields?: Map, reference?: Dissection (for ${field} references), unknownFields?: 'error'|'absent' }
 * → { ok: true, test(d, ref?) → bool, fieldsUsed, text, deprecated: [{message, at, end}] }
 *   | { ok: false, error, code, at, end, text }
 * An empty filter compiles to a test that accepts everything (empty: true).
 */
export function compileFilter(text, opts = {}) {
  text = text == null ? '' : String(text);
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
    return { ok: true, empty: false, test, fieldsUsed: c.fieldsUsed, text, deprecated: dep, usesReference: /\$/.test(text) };
  } catch (e) {
    if (e instanceof FilterError) return { ok: false, error: e.message, code: e.code, at: e.at, end: e.end, args: e.args, text };
    return { ok: false, error: String(e && e.message || e), code: FILTER_ERRORS.UNEXPECTED_TOKEN, at: 0, end: text.length, text };
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
