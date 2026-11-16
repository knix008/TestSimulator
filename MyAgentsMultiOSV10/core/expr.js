// Expressions inside node settings (ARCHITECTURE.md §4).
//
//   "Hello {{ trigger.name }}"            → text with the value put in
//   "{{ nodes.Search.output.items }}"     → the value itself (a whole-field expression keeps its type)
//   "{{ input.text | upper | truncate:80 }}"  filters after |
//
// A path starts at a scope name (input, trigger, vars, nodes, item, index, run, env, memory) and goes on with
// .name, ["name"] or [0]. Nothing is evaluated as JavaScript here: the Code node is the place for that.

const WHOLE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
const PART = /\{\{([\s\S]+?)\}\}/g;

/** Splits on `sep` outside quotes and brackets. */
function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === '\\') { i += 1; continue; } if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth -= 1;
    else if (depth === 0 && text.startsWith(sep, i)) {
      // `||` is not a filter separator
      if (sep === '|' && (text[i + 1] === '|' || text[i - 1] === '|')) continue;
      out.push(text.slice(start, i));
      start = i + sep.length;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** A literal ("text", 'text', 12, true, null) → { ok, value }. */
function literal(text) {
  const s = text.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) { try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: true, value: s.slice(1, -1) }; } }
  if (/^'(?:[^'\\]|\\.)*'$/.test(s)) return { ok: true, value: s.slice(1, -1).replace(/\\'/g, "'") };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { ok: true, value: Number(s) };
  if (s === 'true') return { ok: true, value: true };
  if (s === 'false') return { ok: true, value: false };
  if (s === 'null') return { ok: true, value: null };
  return { ok: false };
}

/** "a.b[0]['c d'].e" → ['a', 'b', 0, 'c d', 'e']. */
export function parsePath(text) {
  const parts = [];
  const s = text.trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '.') { i += 1; continue; }
    if (ch === '[') {
      const end = s.indexOf(']', i);
      if (end < 0) throw new Error(`Missing ] in "${text}"`);
      const inner = s.slice(i + 1, end).trim();
      const lit = literal(inner);
      parts.push(lit.ok ? lit.value : inner);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < s.length && s[j] !== '.' && s[j] !== '[') j += 1;
    const name = s.slice(i, j).trim();
    if (name) parts.push(name);
    i = j;
  }
  return parts;
}

export function getPath(value, parts) {
  let cur = value;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur === 'string' && typeof p === 'string' && p !== 'length') {
      // a JSON text read like an object (an HTTP body, a model's JSON answer)
      try { cur = JSON.parse(cur); } catch { return undefined; }
    }
    cur = cur[p];
  }
  return cur;
}

export function toText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

const FILTERS = {
  upper: (v) => toText(v).toUpperCase(),
  lower: (v) => toText(v).toLowerCase(),
  trim: (v) => toText(v).trim(),
  json: (v) => JSON.stringify(v ?? null),
  pretty: (v) => JSON.stringify(v ?? null, null, 2),
  text: (v) => toText(v),
  number: (v) => Number(v),
  int: (v) => Math.trunc(Number(v)),
  round: (v, d = 0) => { const k = 10 ** Number(d); return Math.round(Number(v) * k) / k; },
  length: (v) => (v == null ? 0 : typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : (v.length ?? toText(v).length)),
  first: (v) => (Array.isArray(v) ? v[0] : toText(v)[0]),
  last: (v) => (Array.isArray(v) ? v.at(-1) : toText(v).at(-1)),
  keys: (v) => Object.keys(v ?? {}),
  values: (v) => Object.values(v ?? {}),
  join: (v, sep = ', ') => (Array.isArray(v) ? v.map(toText).join(sep) : toText(v)),
  split: (v, sep = ',') => toText(v).split(sep).map((x) => x.trim()),
  default: (v, d = '') => (v == null || v === '' || (Array.isArray(v) && !v.length) ? d : v),
  truncate: (v, n = 100) => { const s = toText(v); return s.length > Number(n) ? `${s.slice(0, Number(n))}…` : s; },
  replace: (v, a = '', b = '') => toText(v).split(String(a)).join(String(b)),
  parse: (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } },
  lines: (v) => toText(v).split(/\r?\n/).filter((x) => x.trim()),
  pluck: (v, key) => (Array.isArray(v) ? v.map((x) => x?.[key]) : v?.[key]),
  date: (v, style = 'iso') => { const d = v ? new Date(v) : new Date(); return style === 'date' ? d.toISOString().slice(0, 10) : style === 'time' ? d.toTimeString().slice(0, 8) : style === 'local' ? d.toLocaleString() : d.toISOString(); },
  not: (v) => !truthy(v),
  urlencode: (v) => encodeURIComponent(toText(v)),
  base64: (v) => Buffer.from(toText(v), 'utf8').toString('base64'),
};
export const FILTER_NAMES = Object.keys(FILTERS);

export function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  if (typeof v === 'string') return v.trim() !== '' && v.trim().toLowerCase() !== 'false' && v.trim() !== '0';
  return Boolean(v);
}

/** One expression (the text between {{ and }}): path or literal, then filters. */
export function evaluate(expr, scope) {
  const [head, ...filters] = splitTop(String(expr), '|');
  // a || b → the first value that is not empty
  const alternatives = head.split('||');
  let value;
  for (const alt of alternatives) {
    const lit = literal(alt);
    value = lit.ok ? lit.value : alt.trim() ? getPath(scope, parsePath(alt)) : undefined;
    if (value != null && value !== '') break;
  }
  for (const f of filters) {
    const [name, ...args] = splitTop(f.trim(), ':');
    const fn = FILTERS[name.trim()];
    if (!fn) throw new Error(`Unknown filter "${name.trim()}"`);
    value = fn(value, ...args.map((a) => { const lit = literal(a); return lit.ok ? lit.value : getPath(scope, parsePath(a)); }));
  }
  return value;
}

/** A setting's value with its {{ }} put in: a whole-field expression keeps its type, mixed text becomes text. */
export function render(template, scope) {
  if (typeof template !== 'string') {
    if (Array.isArray(template)) return template.map((x) => render(x, scope));
    if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, render(v, scope)]));
    return template;
  }
  if (!template.includes('{{')) return template;
  const whole = WHOLE.exec(template);
  if (whole && !whole[1].includes('}}')) return evaluate(whole[1], scope);
  return template.replace(PART, (_, expr) => toText(evaluate(expr, scope)));
}

/** The paths an expression text refers to (for the editor's checks): ['nodes.Search.output', …]. */
export function references(template) {
  const out = [];
  if (typeof template !== 'string') return out;
  for (const m of template.matchAll(PART)) {
    const [head] = splitTop(m[1], '|');
    for (const alt of head.split('||')) if (!literal(alt).ok && alt.trim()) out.push(alt.trim());
  }
  return out;
}

export const OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty', 'matches', 'isTrue', 'isFalse'];

/** A condition row of the If node. Values are rendered before the comparison. */
export function compare(left, op, right) {
  const num = (x) => (typeof x === 'number' ? x : Number(String(x).trim()));
  const bothNumbers = !Number.isNaN(num(left)) && !Number.isNaN(num(right)) && String(left).trim() !== '' && String(right).trim() !== '';
  const L = toText(left);
  const R = toText(right);
  switch (op) {
    case 'equals': return bothNumbers ? num(left) === num(right) : L === R;
    case 'notEquals': return bothNumbers ? num(left) !== num(right) : L !== R;
    case 'contains': return Array.isArray(left) ? left.map(toText).includes(R) : L.toLowerCase().includes(R.toLowerCase());
    case 'notContains': return !compare(left, 'contains', right);
    case 'startsWith': return L.startsWith(R);
    case 'endsWith': return L.endsWith(R);
    case 'gt': return num(left) > num(right);
    case 'gte': return num(left) >= num(right);
    case 'lt': return num(left) < num(right);
    case 'lte': return num(left) <= num(right);
    case 'isEmpty': return !truthy(left) && left !== 0 && left !== true;
    case 'isNotEmpty': return truthy(left) || left === 0;
    case 'matches': try { return new RegExp(R, 'i').test(L); } catch { return false; }
    case 'isTrue': return truthy(left);
    case 'isFalse': return !truthy(left);
    default: throw new Error(`Unknown operator "${op}"`);
  }
}
