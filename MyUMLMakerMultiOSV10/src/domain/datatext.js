// Text the data diagrams draw: JSON and YAML documents (parsed into values,
// then flattened into the rows of a tree table), EBNF grammars and regular
// expressions (parsed into the railroad trees the renderer lays out).
// Railroad nodes: { t: 'term' | 'nonterm' | 'special' | 'class' | 'skip', text }
//   { t: 'seq' | 'alt', items }  { t: 'opt', item }  { t: 'rep', item, min, max, label }  { t: 'group', item, label }
// Pure.

// ───────────────────────── JSON / YAML

/** { ok, value, error } of a JSON text. */
export function parseJson(text) {
  try { return { ok: true, value: JSON.parse(String(text ?? '').trim() || 'null') }; } catch (error) { return { ok: false, value: null, error: error.message }; }
}

const unquoteYaml = (s) => {
  const t = s.trim();
  if (/^"(.*)"$/s.test(t)) { try { return JSON.parse(t); } catch { return t.slice(1, -1); } }
  if (/^'(.*)'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  return t;
};
function yamlScalar(raw) {
  const t = raw.trim();
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (/^(true|True|TRUE|yes|on)$/.test(t)) return true;
  if (/^(false|False|FALSE|no|off)$/.test(t)) return false;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  if (t.startsWith('[') || t.startsWith('{')) return yamlFlow(t);
  return unquoteYaml(t);
}
/** Splits a flow collection's inside at top-level commas. */
function splitFlow(inner) {
  const out = []; let depth = 0; let quote = ''; let cur = '';
  for (const ch of inner) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if ('[{'.includes(ch)) depth += 1;
    if (']}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
function yamlFlow(text) {
  const t = text.trim();
  if (t.startsWith('[') && t.endsWith(']')) return splitFlow(t.slice(1, -1)).map(yamlScalar);
  if (t.startsWith('{') && t.endsWith('}')) {
    const out = {};
    for (const part of splitFlow(t.slice(1, -1))) { const at = keyColon(part); if (at > 0) out[unquoteYaml(part.slice(0, at))] = yamlScalar(part.slice(at + 1)); else out[unquoteYaml(part)] = null; }
    return out;
  }
  return unquoteYaml(t);
}
/** Index of the ':' that ends a mapping key ("key: value" or "key:"), or -1. */
function keyColon(text) {
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if ((ch === '"' || ch === "'") && i === 0) { quote = ch; continue; }
    if (ch === ':' && (i === text.length - 1 || text[i + 1] === ' ')) return i;
    if (ch === '[' || ch === '{') return -1;
  }
  return -1;
}
const stripComment = (line) => {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
};

/** { ok, value, error } of a YAML text (block maps and lists, flow [..] {..}, scalars, | and > blocks). */
export function parseYaml(text) {
  const raw = String(text ?? '').replace(/\t/g, '  ').split(/\r?\n/);
  const lines = [];
  for (let i = 0; i < raw.length; i += 1) {
    const content = stripComment(raw[i]).replace(/\s+$/, '');
    if (!content.trim() || /^(---|\.\.\.)\s*$/.test(content.trim())) { lines.push({ indent: -1, text: '', raw: raw[i] }); continue; }
    lines.push({ indent: content.length - content.trimStart().length, text: content.trim(), raw: raw[i] });
  }
  let pos = 0;
  const skipBlank = () => { while (pos < lines.length && lines[pos].indent < 0) pos += 1; };
  const blockScalar = (indicator, parentIndent) => {
    const out = [];
    let indent = null;
    while (pos < lines.length) {
      const line = lines[pos];
      const lead = line.raw.length - line.raw.trimStart().length;
      if (line.raw.trim() && lead <= parentIndent) break;
      if (line.raw.trim()) indent ??= lead;
      out.push(line.raw.trim() ? line.raw.slice(indent ?? 0) : '');
      pos += 1;
    }
    while (out.length && !out.at(-1)) out.pop();
    return indicator.startsWith('>') ? out.join(' ').replace(/\s+/g, ' ').trim() : out.join('\n');
  };
  const parseBlock = (indent) => {
    skipBlank();
    if (pos >= lines.length) return null;
    const first = lines[pos];
    if (first.indent < indent) return null;
    const level = first.indent;
    if (first.text === '-' || first.text.startsWith('- ')) {
      const list = [];
      while (pos < lines.length) {
        skipBlank();
        const line = lines[pos];
        if (!line || line.indent !== level || !(line.text === '-' || line.text.startsWith('- '))) break;
        const rest = line.text.slice(1).trim();
        pos += 1;
        if (!rest) { list.push(parseBlock(level + 1)); continue; }
        const at = keyColon(rest);
        if (at > 0) {
          // "- key: value" starts a mapping whose other keys are indented past the dash.
          const inner = level + 2 + (line.text.length - line.text.slice(1).trimStart().length - 1);
          lines[pos - 1] = { indent: inner, text: rest, raw: `${' '.repeat(inner)}${rest}` };
          pos -= 1;
          list.push(parseMap(inner));
        } else if (/^[|>][-+]?$/.test(rest)) list.push(blockScalar(rest, level));
        else list.push(yamlScalar(rest));
      }
      return list;
    }
    if (keyColon(first.text) > 0) return parseMap(level);
    pos += 1;
    return yamlScalar(first.text);
  };
  const parseMap = (level) => {
    const map = {};
    while (pos < lines.length) {
      skipBlank();
      const line = lines[pos];
      if (!line || line.indent !== level) break;
      const at = keyColon(line.text);
      if (at <= 0) throw new Error(`line ${pos + 1}: expected "key: value"`);
      const key = unquoteYaml(line.text.slice(0, at));
      const rest = line.text.slice(at + 1).trim();
      pos += 1;
      if (!rest) {
        skipBlank();
        const next = lines[pos];
        if (next && (next.indent > level || (next.indent === level && (next.text === '-' || next.text.startsWith('- '))))) map[key] = parseBlock(next.indent);
        else map[key] = null;
      } else if (/^[|>][-+]?$/.test(rest)) map[key] = blockScalar(rest, level);
      else map[key] = yamlScalar(rest);
    }
    return map;
  };
  try {
    const value = parseBlock(0);
    skipBlank();
    if (pos < lines.length) throw new Error(`line ${pos + 1}: unexpected "${lines[pos].text}"`);
    return { ok: true, value };
  } catch (error) { return { ok: false, value: null, error: error.message }; }
}

/** A JSON value as YAML text. */
export function toYaml(value, indent = '') {
  const scalar = (v) => (v === null ? 'null' : typeof v === 'string' ? (/^[\w ./@-]*$/.test(v) && v.trim() === v && v !== '' && !/^(true|false|null|yes|no|[-+]?\d)/.test(v) ? v : JSON.stringify(v)) : String(v));
  if (Array.isArray(value)) {
    if (!value.length) return `${indent}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object' && Object.keys(item).length) {
        const inner = toYaml(item, `${indent}  `).split('\n');
        return `${indent}- ${inner[0].trimStart()}${inner.length > 1 ? `\n${inner.slice(1).join('\n')}` : ''}`;
      }
      return `${indent}- ${item && typeof item === 'object' ? (Array.isArray(item) ? '[]' : '{}') : scalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return `${indent}{}`;
    return keys.map((k) => {
      const v = value[k];
      const key = /^[\w.-]+$/.test(k) ? k : JSON.stringify(k);
      if (v && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) return `${indent}${key}:\n${toYaml(v, `${indent}  `)}`;
      return `${indent}${key}: ${v && typeof v === 'object' ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`;
    }).join('\n');
  }
  return `${indent}${scalar(value)}`;
}

/** Parsed value of a data document (format 'json' | 'yaml'). */
export const parseData = (format, text) => (format === 'yaml' ? parseYaml(text) : parseJson(text));

/**
 * Rows of the tree table of a value: [{ depth, key, value, kind: 'object'|'array'|'scalar', type }].
 * Containers have value null; array items are keyed by their position.
 */
export function dataRows(value, { limit = 400 } = {}) {
  const rows = [];
  const visit = (v, key, depth) => {
    if (rows.length >= limit) return;
    if (v && typeof v === 'object') {
      const isArray = Array.isArray(v);
      if (key !== null) rows.push({ depth, key, value: isArray ? `[${v.length}]` : `{${Object.keys(v).length}}`, kind: isArray ? 'array' : 'object', type: isArray ? 'array' : 'object' });
      const entries = isArray ? v.map((x, i) => [`${i}`, x]) : Object.entries(v);
      for (const [k, x] of entries) visit(x, k, key === null ? depth : depth + 1);
      return;
    }
    rows.push({ depth, key: key ?? '', value: v === null ? 'null' : typeof v === 'string' ? v : String(v), kind: 'scalar', type: v === null ? 'null' : typeof v });
  };
  visit(value, null, 0);
  if (rows.length >= limit) rows.push({ depth: 0, key: '…', value: '', kind: 'scalar', type: 'null' });
  return rows;
}

// ───────────────────────── EBNF

/** Rules of an EBNF text: [{ name, expression }] ("name = expression ;", comments (* … *) dropped). */
export function splitEbnfRules(text) {
  const clean = String(text ?? '').replace(/\(\*[\s\S]*?\*\)/g, ' ');
  const out = [];
  let cur = ''; let quote = '';
  const flush = () => {
    const at = cur.search(/(?<![<>!])(::=|=)/);
    if (at > 0) out.push({ name: cur.slice(0, at).trim(), expression: cur.slice(at).replace(/^(::=|=)/, '').trim() });
    cur = '';
  };
  for (const ch of clean) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === ';') { flush(); continue; }
    cur += ch;
  }
  if (cur.trim()) flush();
  return out.filter((r) => r.name);
}

/** Railroad tree of an EBNF expression (ISO 14977: , | [ ] { } ( ) "…" ? … ?; also postfix ? * +). Throws on bad syntax. */
export function parseEbnf(expression) {
  const src = String(expression ?? '');
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i += 1; };
  const fail = (what) => { throw new Error(`${what} at ${i + 1}`); };
  const postfix = (node) => {
    for (;;) {
      ws();
      if (src[i] === '?') { i += 1; node = { t: 'opt', item: node }; } else if (src[i] === '*') { i += 1; node = { t: 'opt', item: { t: 'rep', item: node, min: 1 } }; } else if (src[i] === '+') { i += 1; node = { t: 'rep', item: node, min: 1 }; } else return node;
    }
  };
  const primary = () => {
    ws();
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) fail('unclosed string');
      const text = src.slice(i + 1, end); i = end + 1;
      return { t: 'term', text };
    }
    if (ch === '?') {
      const end = src.indexOf('?', i + 1);
      if (end < 0) fail('unclosed special sequence');
      const text = src.slice(i + 1, end).trim(); i = end + 1;
      return { t: 'special', text };
    }
    const close = { '[': ']', '{': '}', '(': ')' }[ch];
    if (close) {
      i += 1;
      const inner = alternation();
      ws();
      if (src[i] !== close) fail(`expected ${close}`);
      i += 1;
      if (ch === '[') return { t: 'opt', item: inner };
      if (ch === '{') { ws(); if (src[i] === '-') { i += 1; return { t: 'rep', item: inner, min: 1 }; } return { t: 'opt', item: { t: 'rep', item: inner, min: 1 } }; }
      return inner;
    }
    const m = /^[A-Za-z_À-￿][\wÀ-￿-]*(?:[ \t]+[A-Za-z_À-￿][\wÀ-￿-]*)*/.exec(src.slice(i));
    if (m) { i += m[0].length; return { t: 'nonterm', text: m[0].trim() }; }
    if (/\d/.test(ch ?? '')) {
      const n = /^\d+\s*\*/.exec(src.slice(i));
      if (n) { i += n[0].length; const count = Number.parseInt(n[0], 10); const item = factor(); return { t: 'rep', item, min: count, max: count, label: `×${count}` }; }
    }
    fail(ch === undefined ? 'unexpected end' : `unexpected "${ch}"`);
    return null;
  };
  const factor = () => postfix(primary());
  const sequence = () => {
    const items = [factor()];
    for (;;) {
      ws();
      if (src[i] === ',') { i += 1; items.push(factor()); continue; }
      if (i < src.length && !'|)]};'.includes(src[i]) && src[i] !== '-') { items.push(factor()); continue; }
      if (src[i] === '-' && src[i - 1] !== '}') { i += 1; const except = factor(); items.push({ t: 'special', text: `except ${except.text ?? '…'}` }); continue; }
      break;
    }
    return items.length === 1 ? items[0] : { t: 'seq', items };
  };
  const alternation = () => {
    const items = [sequence()];
    for (;;) { ws(); if (src[i] === '|') { i += 1; items.push(sequence()); } else break; }
    return items.length === 1 ? items[0] : { t: 'alt', items };
  };
  const tree = alternation();
  ws();
  if (i < src.length) fail(`unexpected "${src[i]}"`);
  return tree;
}

// ───────────────────────── regular expressions

const ESCAPES = { d: 'digit', D: 'not digit', w: 'word char', W: 'not word char', s: 'white space', S: 'not white space', b: 'word boundary', B: 'not word boundary', n: 'new line', t: 'tab', r: 'return' };

/** Railroad tree of a regular expression (JavaScript / PCRE syntax). Throws on bad syntax. */
export function parseRegex(pattern) {
  const src = String(pattern ?? '');
  let i = 0;
  let groups = 0;
  const fail = (what) => { throw new Error(`${what} at ${i + 1}`); };
  const classText = () => {
    const start = i; i += 1;
    if (src[i] === '^') i += 1;
    if (src[i] === ']') i += 1;
    while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i += 1; i += 1; }
    if (src[i] !== ']') fail('unclosed [');
    i += 1;
    return src.slice(start, i);
  };
  const atom = () => {
    const ch = src[i];
    if (ch === '(') {
      i += 1;
      let label = '';
      if (src.startsWith('?:', i)) i += 2;
      else if (src.startsWith('?=', i)) { i += 2; label = 'followed by'; } else if (src.startsWith('?!', i)) { i += 2; label = 'not followed by'; } else if (src.startsWith('?<=', i)) { i += 3; label = 'preceded by'; } else if (src.startsWith('?<!', i)) { i += 3; label = 'not preceded by'; } else if (src.startsWith('?<', i) || src.startsWith('?P<', i)) {
        i += src[i + 1] === 'P' ? 3 : 2;
        const end = src.indexOf('>', i); if (end < 0) fail('unclosed group name');
        groups += 1; label = `#${groups} ${src.slice(i, end)}`; i = end + 1;
      } else { groups += 1; label = `#${groups}`; }
      const inner = alternation();
      if (src[i] !== ')') fail('expected )');
      i += 1;
      return { t: 'group', item: inner, label };
    }
    if (ch === '[') {
      const text = classText();
      const negated = text.startsWith('[^');
      return { t: 'class', text: `${negated ? 'none of ' : 'one of '}${text.slice(negated ? 2 : 1, -1)}` };
    }
    if (ch === '.') { i += 1; return { t: 'special', text: 'any char' }; }
    if (ch === '^') { i += 1; return { t: 'special', text: 'start' }; }
    if (ch === '$') { i += 1; return { t: 'special', text: 'end' }; }
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === undefined) fail('trailing \\');
      i += 2;
      if (ESCAPES[next]) return { t: 'special', text: ESCAPES[next] };
      if (/\d/.test(next)) return { t: 'special', text: `back reference #${next}` };
      if (next === 'u' && /^[0-9a-fA-F]{4}/.test(src.slice(i))) { const code = src.slice(i, i + 4); i += 4; return { t: 'term', text: String.fromCharCode(parseInt(code, 16)) }; }
      return { t: 'term', text: next };
    }
    if (ch === ')' ) fail('unmatched )');
    if ('*+?'.includes(ch)) fail(`nothing to repeat before "${ch}"`);
    i += 1;
    return { t: 'term', text: ch };
  };
  const quantified = () => {
    let node = atom();
    for (;;) {
      const ch = src[i];
      let min = null; let max = null;
      if (ch === '*') { min = 0; max = Infinity; i += 1; } else if (ch === '+') { min = 1; max = Infinity; i += 1; } else if (ch === '?') { min = 0; max = 1; i += 1; } else if (ch === '{') {
        const m = /^\{(\d*)(,?)(\d*)\}/.exec(src.slice(i));
        if (!m || (!m[1] && !m[3])) break;
        i += m[0].length;
        min = Number(m[1] || 0); max = m[2] ? (m[3] ? Number(m[3]) : Infinity) : min;
      } else break;
      if (src[i] === '?' || src[i] === '+') i += 1; // lazy / possessive
      node = quantify(node, min, max);
    }
    return node;
  };
  const sequence = () => {
    const items = [];
    while (i < src.length && src[i] !== '|' && src[i] !== ')') {
      const node = quantified();
      const last = items.at(-1);
      if (node.t === 'term' && last?.t === 'term' && !last.quantified) last.text += node.text; else items.push(node);
    }
    for (const item of items) delete item.quantified;
    if (!items.length) return { t: 'skip' };
    return items.length === 1 ? items[0] : { t: 'seq', items };
  };
  const alternation = () => {
    const items = [sequence()];
    while (src[i] === '|') { i += 1; items.push(sequence()); }
    return items.length === 1 ? items[0] : { t: 'alt', items };
  };
  const tree = alternation();
  if (i < src.length) fail(`unexpected "${src[i]}"`);
  return tree;
}
function quantify(node, min, max) {
  let out;
  if (max === 1 && min === 0) out = { t: 'opt', item: node };
  else if (min === 0 && max === Infinity) out = { t: 'opt', item: { t: 'rep', item: node, min: 1 } };
  else if (min === 1 && max === Infinity) out = { t: 'rep', item: node, min: 1 };
  else {
    const label = max === Infinity ? `${min}+ times` : min === max ? `${min} times` : `${min}–${max} times`;
    out = min === 0 ? { t: 'opt', item: { t: 'rep', item: node, min: 1, label } } : { t: 'rep', item: node, min, max, label };
  }
  out.quantified = true;
  return out;
}

/** { ok, tree, error } without throwing. */
export function railroadOf(kind, text) {
  try { return { ok: true, tree: kind === 'regex' ? parseRegex(text) : parseEbnf(text) }; } catch (error) { return { ok: false, tree: null, error: error.message }; }
}
