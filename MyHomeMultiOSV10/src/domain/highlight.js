// Syntax colours for the code editor: HTML (with the CSS of <style> and the JavaScript of
// <script> inside), CSS, JavaScript and JSON. A small tokenizer per language, not a parser:
// it only has to colour what is on screen as the user types. Output is escaped HTML with
// <span class="tk-…"> around the tokens; the text itself is never changed.

export const LANGUAGES = {
  html: { ko: 'HTML', en: 'HTML', extensions: ['html', 'htm'], comment: ['<!--', '-->'] },
  css: { ko: 'CSS', en: 'CSS', extensions: ['css'], comment: ['/*', '*/'] },
  js: { ko: 'JavaScript', en: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], comment: ['//', ''] },
  json: { ko: 'JSON', en: 'JSON', extensions: ['json'], comment: null },
  text: { ko: '텍스트', en: 'Text', extensions: ['txt', 'md'], comment: null },
};

export const CODE_EXTENSIONS = Object.values(LANGUAGES).flatMap((language) => language.extensions);

/** The language of a file name (by its extension); text when unknown. */
export function languageOf(name) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(name ?? ''))?.[1]?.toLowerCase() ?? '';
  return Object.entries(LANGUAGES).find(([, language]) => language.extensions.includes(ext))?.[0] ?? 'text';
}

export const isCodeFileName = (name) => CODE_EXTENSIONS.includes(/\.([a-z0-9]+)$/i.exec(String(name ?? ''))?.[1]?.toLowerCase() ?? '');

const escapeHtml = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const span = (cls, text) => (text ? `<span class="tk-${cls}">${escapeHtml(text)}</span>` : '');

const JS_KEYWORDS = new Set('await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async get set'.split(' '));
const JS_LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

/** Runs a list of [regex (sticky), class | function] rules over the text. */
function tokenize(text, rules) {
  let out = '';
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { out += escapeHtml(plain); plain = ''; } };
  while (i < text.length) {
    let matched = false;
    for (const [re, kind] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m.index === i && m[0].length) {
        flush();
        out += typeof kind === 'function' ? kind(m[0], m) : span(kind, m[0]);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) { plain += text[i]; i += 1; }
  }
  flush();
  return out;
}

const JS_RULES = [
  [/\/\/[^\n]*/y, 'comment'],
  [/\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
  [/`(?:\\[\s\S]|[^\\`])*`?/y, 'string'],
  [/"(?:\\.|[^\\"\n])*"?/y, 'string'],
  [/'(?:\\.|[^\\'\n])*'?/y, 'string'],
  [/\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/iy, 'number'],
  [/[A-Za-z_$][\w$]*/y, (word, m) => {
    if (JS_KEYWORDS.has(word)) return span('keyword', word);
    if (JS_LITERALS.has(word)) return span('literal', word);
    // A name followed by "(" is a call.
    const after = m.input.slice(m.index + word.length).match(/^\s*\(/);
    return after ? span('function', word) : escapeHtml(word);
  }],
  [/[{}()[\];,.]/y, 'punct'],
  [/[=+\-*/%!<>&|^~?:]+/y, 'operator'],
];

const CSS_RULES = [
  [/\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
  [/"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?/y, 'string'],
  [/@[\w-]+/y, 'keyword'],
  [/#[\da-f]{3,8}\b/iy, 'number'],
  [/-?\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt|cm|mm|in)?\b/iy, 'number'],
  [/--[\w-]+/y, 'property'],
  [/[\w-]+(?=\s*:(?!:)[^{;]*[;}\n])/y, 'property'],
  [/[.#][\w-]+/y, 'selector'],
  [/::?[\w-]+/y, 'selector'],
  [/!important\b/y, 'keyword'],
  [/[{}();,:>+~*]/y, 'punct'],
];

const JSON_RULES = [
  [/"(?:\\.|[^\\"\n])*"(?=\s*:)/y, 'property'],
  [/"(?:\\.|[^\\"\n])*"?/y, 'string'],
  [/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/iy, 'number'],
  [/\b(?:true|false|null)\b/y, 'literal'],
  [/[{}[\],:]/y, 'punct'],
];

export const highlightJs = (text) => tokenize(text, JS_RULES);
export const highlightCss = (text) => tokenize(text, CSS_RULES);
export const highlightJson = (text) => tokenize(text, JSON_RULES);

/** A tag: <name attr="value" …> with the names and values coloured. */
function tagHtml(tag) {
  const m = /^(<\/?)([\w:-]*)([\s\S]*?)(\/?>)?$/.exec(tag);
  if (!m) return escapeHtml(tag);
  const attrs = tokenize(m[3], [
    [/"[^"]*"?|'[^']*'?/y, 'string'],
    [/[^\s=/>"']+/y, 'attr'],
    [/=/y, 'punct'],
  ]);
  return `${span('punct', m[1])}${span('tag', m[2])}${attrs}${span('punct', m[4] ?? '')}`;
}

export function highlightHtml(text) {
  let out = '';
  let i = 0;
  const re = /<!--[\s\S]*?(?:-->|$)|<!doctype[^>]*>?|<\/?[\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*>?|&[#\w]+;/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0]) { re.lastIndex += 1; continue; }
    out += escapeHtml(text.slice(i, m.index));
    const token = m[0];
    if (token.startsWith('<!--')) out += span('comment', token);
    else if (/^<!doctype/i.test(token)) out += span('keyword', token);
    else if (token.startsWith('&')) out += span('entity', token);
    else {
      out += tagHtml(token);
      // The inside of <style> and <script> in its own language, up to the closing tag.
      const inner = /^<(style|script)\b/i.exec(token)?.[1]?.toLowerCase();
      if (inner && token.endsWith('>')) {
        const close = new RegExp(`</${inner}\\s*>`, 'i');
        const rest = text.slice(m.index + token.length);
        const end = rest.search(close);
        const body = end < 0 ? rest : rest.slice(0, end);
        out += inner === 'style' ? highlightCss(body) : highlightJs(body);
        re.lastIndex = m.index + token.length + body.length;
        i = re.lastIndex;
        continue;
      }
    }
    i = m.index + token.length;
  }
  out += escapeHtml(text.slice(i));
  return out;
}

export function highlight(text, language) {
  const source = String(text ?? '');
  if (language === 'html') return highlightHtml(source);
  if (language === 'css') return highlightCss(source);
  if (language === 'js') return highlightJs(source);
  if (language === 'json') return highlightJson(source);
  return escapeHtml(source);
}

/** Strips the colours: what highlight() shows is the text as typed (the unit tests check this). */
export const plainOf = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Line and column (1-based) of an offset. */
export function lineColumn(text, offset) {
  const before = String(text).slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

/** The offset where a line (1-based) starts. */
export function lineOffset(text, line) {
  let offset = 0;
  const source = String(text);
  for (let n = 1; n < line; n += 1) {
    const next = source.indexOf('\n', offset);
    if (next < 0) return source.length;
    offset = next + 1;
  }
  return offset;
}

/** Line comment toggling for the lines a selection touches: { text, start, end } with the selection kept on the same lines. */
export function toggleComment(text, start, end, language) {
  const marks = LANGUAGES[language]?.comment;
  if (!marks) return { text, start, end };
  const [open, close] = marks;
  const from = text.lastIndexOf('\n', start - 1) + 1;
  let to = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  if (to < 0) to = text.length;
  const lines = text.slice(from, to).split('\n');
  const commented = lines.filter((l) => l.trim()).every((l) => l.trimStart().startsWith(open) && (!close || l.trimEnd().endsWith(close)));
  const changed = lines.map((l) => {
    if (!l.trim()) return l;
    const indent = /^\s*/.exec(l)[0];
    const body = l.slice(indent.length);
    if (commented) {
      let inner = body.slice(open.length);
      if (close) inner = inner.replace(new RegExp(`\\s?${close.replace(/[*]/g, '\\*')}\\s*$`), '');
      return indent + inner.replace(/^ /, '');
    }
    return `${indent}${open} ${body}${close ? ` ${close}` : ''}`;
  }).join('\n');
  const next = text.slice(0, from) + changed + text.slice(to);
  return { text: next, start: from, end: from + changed.length };
}

/** Find all: offsets of the matches of a query (plain text, or a regular expression), with case as asked. */
export function findAll(text, query, { regex = false, caseSensitive = false } = {}) {
  if (!query) return [];
  let re;
  try {
    re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  } catch {
    return [];
  }
  const out = [];
  for (let m = re.exec(text); m && out.length < 10000; m = re.exec(text)) {
    if (!m[0].length) { re.lastIndex += 1; continue; }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}
