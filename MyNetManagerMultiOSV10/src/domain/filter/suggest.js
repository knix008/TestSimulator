// Autocomplete for the filter bar.
import { getDefaultFields } from './registry.js';

const reg = (opts) => (opts && opts.fields) || getDefaultFields() || new Map();

/**
 * Field/protocol names starting with `prefix` (case-insensitive), best first:
 * exact match, then the shallowest names (protocols before their fields), then alphabetical.
 * → [{ abbrev, name, type, protocol }]
 */
export function suggestFields(prefix, limit = 50, opts) {
  const fields = reg(opts);
  const p = String(prefix || '').toLowerCase();
  const depth = p.split('.').length;
  const hits = [];
  for (const [abbrev, f] of fields) {
    if (abbrev.startsWith('_ws.') && !p.startsWith('_')) continue;
    if (!abbrev.toLowerCase().startsWith(p)) continue;
    hits.push(f && f.abbrev ? f : { abbrev, name: abbrev, type: 'none' });
  }
  hits.sort((a, b) => {
    if (a.abbrev === prefix) return -1;
    if (b.abbrev === prefix) return 1;
    const da = Math.max(0, a.abbrev.split('.').length - depth), db = Math.max(0, b.abbrev.split('.').length - depth);
    if (da !== db) return da - db;
    return a.abbrev < b.abbrev ? -1 : a.abbrev > b.abbrev ? 1 : 0;
  });
  return hits.slice(0, limit).map((f) => ({ abbrev: f.abbrev, name: f.name, type: f.type, protocol: f.protocol }));
}

/**
 * Values that can follow `abbrev ==`: value strings (names usable as literals) and booleans.
 * → [{ value, label, text }] where text is what to insert.
 */
export function suggestValues(abbrev, opts) {
  const f = reg(opts).get(abbrev);
  if (!f) return [];
  if (f.type === 'bool') {
    const tfs = f.tfs || ['True', 'False'];
    return [{ value: 1, label: tfs[0], text: '1' }, { value: 0, label: tfs[1], text: '0' }];
  }
  if (f.strings) {
    const out = [];
    for (const [k, label] of Object.entries(f.strings)) {
      const n = Number(k);
      const simple = /^[A-Za-z_][A-Za-z0-9_\-]*$/.test(String(label));
      out.push({ value: Number.isNaN(n) ? k : n, label: String(label), text: simple ? String(label) : (Number.isNaN(n) ? JSON.stringify(k) : String(n)) });
    }
    return out;
  }
  return [];
}

const OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'matches', 'in', '&&', '||', '!'];

/**
 * What is being typed at `caret`: { kind: 'field'|'value'|'operator', token, start, end, field? }.
 * The UI replaces text[start, end) with the chosen suggestion.
 */
export function completionContext(text, caret = text.length) {
  const before = text.slice(0, caret);
  const m = /[A-Za-z0-9_.\-:]*$/.exec(before);
  const start = caret - m[0].length;
  const token = m[0];
  let end = caret;
  while (end < text.length && /[A-Za-z0-9_.\-:]/.test(text[end])) end++;
  const head = before.slice(0, start).trimEnd();
  const cmp = /([A-Za-z0-9_.\-]+)\s*(==|!=|===|!==|>=|<=|>|<|\beq|\bne|\bgt|\blt|\bge|\ble)$/.exec(head);
  if (cmp) return { kind: 'value', token, start, end, field: cmp[1] };
  const inSet = /([A-Za-z0-9_.\-]+)\s+in\s*\{[^}]*$/.exec(head);
  if (inSet) return { kind: 'value', token, start, end, field: inSet[1] };
  if (head && /[A-Za-z0-9_.\])"]$/.test(head) && !/(\b(and|or|not|xor)|&&|\|\||\^\^|!|\()$/.test(head)) {
    return { kind: 'operator', token, start, end, operators: OPERATORS };
  }
  return { kind: 'field', token, start, end };
}
