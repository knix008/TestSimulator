// A small YAML reader (CONTRACT: pure) for voice-bank files: dsconfig.yaml, vocoder.yaml,
// character.yaml, dsdict*.yaml. It reads the subset those files use — block maps and lists (also a
// list at the same indent as its key), flow lists and maps ([a, b], {symbol: a, type: vowel}),
// quoted and plain scalars, numbers, booleans, null, comments, and | / > block text. Anchors, tags
// and multi-document streams are not supported (no voice bank uses them).

const NUMBER = /^[-+]?(?:\d[\d_]*\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)$/;

/** A plain scalar's value: null, booleans, numbers, otherwise the text. */
export function plainScalar(text) {
  const s = text.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (/^(?:true|True|TRUE)$/.test(s)) return true;
  if (/^(?:false|False|FALSE)$/.test(s)) return false;
  if (NUMBER.test(s) && /\d/.test(s)) return Number(s.replace(/_/g, ''));
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (/^\.(?:nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}

function unescapeDouble(body) {
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e) => {
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', 0: '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' ' }[e] ?? e;
  });
}

/** Removes a trailing comment (" #…") outside quotes. */
function stripComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (quote === '"' && c === '\\') { i++; continue; }
      if (c === quote) {
        if (quote === "'" && line[i + 1] === "'") { i++; continue; }
        quote = '';
      }
    } else if (c === '"' || c === "'") {
      // A quote only opens at the start of a scalar.
      const before = line.slice(0, i).trimEnd();
      if (before === '' || /[:\-[{,]$/.test(before)) quote = c;
    } else if (c === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Reads one flow value ([…], {…}, "…", '…' or plain) from `s` at `pos`: [value, nextPos]. */
function readFlow(s, pos, inFlow) {
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  const c = s[pos];
  if (c === '[') {
    const out = [];
    pos++;
    for (;;) {
      while (pos < s.length && /[\s]/.test(s[pos])) pos++;
      if (s[pos] === ']') return [out, pos + 1];
      if (pos >= s.length) throw new SyntaxError('Unclosed [ in YAML');
      const [v, next] = readFlow(s, pos, true);
      out.push(v);
      pos = next;
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      if (s[pos] === ',') pos++;
      else if (s[pos] !== ']') throw new SyntaxError(`Expected , or ] in YAML near "${s.slice(pos, pos + 20)}"`);
    }
  }
  if (c === '{') {
    const out = {};
    pos++;
    for (;;) {
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      if (s[pos] === '}') return [out, pos + 1];
      if (pos >= s.length) throw new SyntaxError('Unclosed { in YAML');
      const [k, afterKey] = readFlow(s, pos, true);
      pos = afterKey;
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      let v = null;
      if (s[pos] === ':') {
        const [val, next] = readFlow(s, pos + 1, true);
        v = val;
        pos = next;
      }
      out[String(k)] = v;
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      if (s[pos] === ',') pos++;
      else if (s[pos] !== '}') throw new SyntaxError(`Expected , or } in YAML near "${s.slice(pos, pos + 20)}"`);
    }
  }
  if (c === '"') {
    let i = pos + 1;
    let body = '';
    while (i < s.length && s[i] !== '"') { if (s[i] === '\\') { body += s[i] + s[i + 1]; i += 2; } else body += s[i++]; }
    return [unescapeDouble(body), i + 1];
  }
  if (c === "'") {
    let i = pos + 1;
    let body = '';
    for (; i < s.length; i++) {
      if (s[i] === "'") { if (s[i + 1] === "'") { body += "'"; i++; } else break; } else body += s[i];
    }
    return [body, i + 1];
  }
  // Plain scalar: inside flow it ends at , ] } or ": "; outside at the end.
  let i = pos;
  if (inFlow) {
    while (i < s.length && !/[,\]}]/.test(s[i]) && !(s[i] === ':' && (i + 1 >= s.length || /[\s,\]}]/.test(s[i + 1])))) i++;
  } else i = s.length;
  return [plainScalar(s.slice(pos, i)), i];
}

/** An inline value (after "key:" or "- "). */
function inlineValue(text) {
  const s = text.trim();
  if (!s) return null;
  if (s[0] === '[' || s[0] === '{' || s[0] === '"' || s[0] === "'") {
    const [v, next] = readFlow(s, 0, false);
    if (s.slice(next).trim()) {
      // "quoted" followed by more text is not valid YAML; keep the whole text.
      if (s[0] === '"' || s[0] === "'") return s;
    }
    return v;
  }
  return plainScalar(s);
}

/** Index of the ':' that ends a block map key in `text`, or -1. */
function keyColon(text) {
  let quote = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; else if (quote === '"' && c === '\\') i++; continue; }
    if ((c === '"' || c === "'") && i === 0) { quote = c; continue; }
    if (c === '[' || c === '{') { if (i === 0) return -1; depth++; }
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 === text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) return i;
  }
  return -1;
}

function keyText(raw) {
  const k = raw.trim();
  if ((k[0] === '"' && k.endsWith('"')) || (k[0] === "'" && k.endsWith("'"))) return String(readFlow(k, 0, false)[0]);
  return k;
}

/** Parses a YAML document to plain JS values. Throws SyntaxError on what it cannot read. */
export function parseYaml(source) {
  const text = String(source ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const raw = text.split('\n');
  // Lines: { indent, text, rawIndex }, comments and blank lines dropped (kept for block scalars).
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (/^\s*(?:---|\.\.\.)\s*$/.test(r)) continue;
    const stripped = stripComment(r).replace(/\s+$/, '');
    if (!stripped.trim()) continue;
    const indent = stripped.length - stripped.replace(/^[ \t]+/, '').length;
    lines.push({ indent, text: stripped.slice(indent), raw: i });
  }
  let pos = 0;

  // Flow collections may span lines: join until the brackets close.
  function joinFlow(first) {
    let s = first;
    const balance = (x) => { let d = 0; let q = ''; for (let i = 0; i < x.length; i++) { const c = x[i]; if (q) { if (c === q) q = ''; else if (q === '"' && c === '\\') i++; continue; } if (c === '"' || c === "'") q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--; } return d; };
    while (balance(s) > 0 && pos < lines.length) { s += ` ${lines[pos].text}`; pos++; }
    return s;
  }

  function blockScalar(indicator, parentIndent, rawLine) {
    const folded = indicator[0] === '>';
    const keep = indicator.includes('+');
    const strip = indicator.includes('-');
    const out = [];
    let blockIndent = -1;
    let r = rawLine + 1;
    for (; r < raw.length; r++) {
      const line = raw[r].replace(/\r$/, '');
      if (!line.trim()) { out.push(''); continue; }
      const ind = line.length - line.replace(/^ +/, '').length;
      if (ind <= parentIndent) break;
      if (blockIndent < 0) blockIndent = ind;
      out.push(line.slice(blockIndent));
    }
    while (pos < lines.length && lines[pos].raw < r) pos++;
    let body = folded ? out.join('\n').replace(/([^\n])\n(?=[^\n ])/g, '$1 ') : out.join('\n');
    if (strip) body = body.replace(/\n+$/, '');
    else if (!keep) body = body.replace(/\n+$/, '\n');
    return body;
  }

  function valueAfter(rest, indent, rawLine) {
    const s = rest.trim();
    if (s === '|' || s === '>' || /^[|>][-+]?\d*$/.test(s)) return blockScalar(s, indent, rawLine);
    if (s) return inlineValue(s[0] === '[' || s[0] === '{' ? joinFlow(s) : s);
    // Nested block: deeper, or a list at the same indent.
    const next = lines[pos];
    if (next && (next.indent > indent || (next.indent === indent && /^-(?:\s|$)/.test(next.text)))) return block(next.indent);
    return null;
  }

  function block(indent) {
    const first = lines[pos];
    if (!first) return null;
    if (/^-(?:\s|$)/.test(first.text)) {
      const list = [];
      while (pos < lines.length && lines[pos].indent === indent && /^-(?:\s|$)/.test(lines[pos].text)) {
        const line = lines[pos++];
        const rest = line.text.replace(/^-\s*/, '');
        if (!rest) { list.push(valueAfter('', indent, line.raw)); continue; }
        const colon = rest[0] === '[' || rest[0] === '{' ? -1 : keyColon(rest);
        if (colon > 0) {
          // "- key: value" opens a map whose other keys sit at the key's column.
          const childIndent = indent + (line.text.length - rest.length);
          lines[--pos] = { indent: childIndent, text: rest, raw: line.raw };
          list.push(mapping(childIndent));
        } else list.push(inlineValue(rest[0] === '[' || rest[0] === '{' ? joinFlow(rest) : rest));
      }
      return list;
    }
    if (keyColon(first.text) < 0) {
      pos++;
      return inlineValue(first.text[0] === '[' || first.text[0] === '{' ? joinFlow(first.text) : first.text);
    }
    return mapping(indent);
  }

  function mapping(indent) {
    const map = {};
    while (pos < lines.length && lines[pos].indent === indent && !/^-(?:\s|$)/.test(lines[pos].text)) {
      const line = lines[pos];
      const colon = keyColon(line.text);
      if (colon < 0) throw new SyntaxError(`YAML line ${line.raw + 1}: expected "key: value"`);
      pos++;
      map[keyText(line.text.slice(0, colon))] = valueAfter(line.text.slice(colon + 1), indent, line.raw);
    }
    return map;
  }

  if (!lines.length) return null;
  const value = block(lines[0].indent);
  if (pos < lines.length) throw new SyntaxError(`YAML line ${lines[pos].raw + 1}: unexpected indentation`);
  return value;
}
