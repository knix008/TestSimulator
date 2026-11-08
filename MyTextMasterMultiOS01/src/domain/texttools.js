// Text tools that turn one string into another: case, line operations, Markdown and HTML
// snippets. Pure, so the menus and the tests use the same functions.

export const toUpper = (text) => text.toUpperCase();
export const toLower = (text) => text.toLowerCase();
/** Every word starts with a capital letter. */
export const toTitle = (text) => text.toLowerCase().replace(/(^|[\s\-_([{"'“‘])(\p{L})/gu, (m, before, letter) => before + letter.toUpperCase());

const lines = (text) => text.split('\n');

export function sortLines(text, { descending = false, unique = false, ignoreCase = true } = {}) {
  const collator = new Intl.Collator(undefined, { sensitivity: ignoreCase ? 'base' : 'variant', numeric: true });
  let list = lines(text);
  if (unique) list = [...new Set(list)];
  list.sort((a, b) => collator.compare(a, b));
  if (descending) list.reverse();
  return list.join('\n');
}

export const reverseLines = (text) => lines(text).reverse().join('\n');
export const removeDuplicateLines = (text) => [...new Set(lines(text))].join('\n');
export const trimTrailing = (text) => lines(text).map((line) => line.replace(/[ \t]+$/, '')).join('\n');
export const removeEmptyLines = (text) => lines(text).filter((line) => line.trim() !== '').join('\n');
export const joinLines = (text) => lines(text).map((line) => line.trim()).filter(Boolean).join(' ');

/** Tabs to spaces (the editor's tab size) or leading spaces back to tabs. */
export function tabsToSpaces(text, size = 4) {
  return lines(text).map((line) => {
    let out = '';
    for (const ch of line) out += ch === '\t' ? ' '.repeat(size - (out.length % size)) : ch;
    return out;
  }).join('\n');
}

export function spacesToTabs(text, size = 4) {
  return lines(text).map((line) => {
    const lead = /^ +/.exec(line)?.[0].length ?? 0;
    return '\t'.repeat(Math.floor(lead / size)) + ' '.repeat(lead % size) + line.slice(lead);
  }).join('\n');
}

// ───────────────────────── Markdown snippets

/** Wraps the selection in a marker (**bold**); unwraps it when it is wrapped already. */
export function toggleWrap(text, before, after = before) {
  if (text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length) {
    return text.slice(before.length, text.length - after.length);
  }
  return `${before}${text}${after}`;
}

/** Puts a prefix before every line ("> ", "- ", "1. "); takes it away when every line has it. */
export function togglePrefix(text, prefix) {
  const list = lines(text);
  const numbered = prefix === '1. ';
  const pattern = numbered ? /^\s*\d+\.\s/ : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (list.every((line) => pattern.test(line) || line === '')) return list.map((line) => line.replace(pattern, '')).join('\n');
  return list.map((line, i) => (line === '' && list.length > 1 ? line : `${numbered ? `${i + 1}. ` : prefix}${line}`)).join('\n');
}

/** Sets the heading level of a line (0 removes it). */
export function setHeading(line, level) {
  const body = line.replace(/^\s{0,3}#{1,6}\s*/, '');
  return level ? `${'#'.repeat(level)} ${body}` : body;
}

/** A Markdown table with empty cells. */
export function markdownTable(columns = 3, rows = 2, header = 'Column') {
  const head = Array.from({ length: columns }, (_, i) => `${header} ${i + 1}`);
  const row = (cells) => `| ${cells.join(' | ')} |`;
  return [row(head), row(head.map((cell) => '-'.repeat(Math.max(3, cell.length)))), ...Array.from({ length: rows }, () => row(head.map((cell) => ' '.repeat(cell.length))))].join('\n');
}

/** An HTML table with empty cells. */
export function htmlTable(columns = 3, rows = 2, header = 'Column') {
  const head = Array.from({ length: columns }, (_, i) => `      <th>${header} ${i + 1}</th>`).join('\n');
  const body = Array.from({ length: rows }, () => `    <tr>\n${Array.from({ length: columns }, () => '      <td></td>').join('\n')}\n    </tr>`).join('\n');
  return `<table>\n  <thead>\n    <tr>\n${head}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
}

// ───────────────────────── HTML

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', '!doctype']);
const RAW = new Set(['script', 'style', 'pre', 'textarea']);
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'label']);

/** Re-indents HTML: one block element per line, children indented; text, inline tags and <pre>/<script> kept as they are. */
export function formatHtml(source, indent = '  ') {
  const tokens = String(source).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? [];
  const out = [];
  let depth = 0;
  let line = '';
  const flush = () => { if (line.trim()) out.push(indent.repeat(Math.max(0, depth)) + line.trim()); line = ''; };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const tag = /^<\/?\s*([a-zA-Z!][\w:-]*)/.exec(token)?.[1]?.toLowerCase();
    if (!tag || token.startsWith('<!--')) {
      if (token.startsWith('<!--')) { flush(); out.push(indent.repeat(depth) + token.trim()); } else line += token.replace(/\s+/g, ' ');
      continue;
    }
    if (INLINE.has(tag)) { line += token; continue; }
    const closing = token.startsWith('</');
    const selfClosing = VOID.has(tag) || token.endsWith('/>');
    if (closing) { flush(); depth -= 1; out.push(indent.repeat(Math.max(0, depth)) + token.trim()); continue; }
    flush();
    if (RAW.has(tag) && !selfClosing) {
      // Keep the content of <pre>, <script>, <style>, <textarea> exactly.
      let raw = token;
      while (i + 1 < tokens.length && !new RegExp(`^</\\s*${tag}`, 'i').test(tokens[i + 1])) raw += tokens[++i];
      if (i + 1 < tokens.length) raw += tokens[++i];
      out.push(indent.repeat(depth) + raw.trim());
      continue;
    }
    out.push(indent.repeat(depth) + token.trim());
    if (!selfClosing) depth += 1;
  }
  flush();
  return out.join('\n');
}

/** Escapes text for HTML (the "Paste as HTML text" tool). */
export const escapeHtmlText = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ───────────────────────── encode / decode (Notepad++ MIME tools)

export function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64Decode(text) {
  const binary = atob(String(text).replace(/\s+/g, ''));
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export const urlEncode = (text) => encodeURIComponent(text);
export const urlDecode = (text) => decodeURIComponent(String(text).replace(/\+/g, ' '));

/** &lt; &amp; &#39; &#x41; … back to characters. */
export function unescapeHtmlText(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–' };
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') { const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return named[code.toLowerCase()] ?? m;
  });
}

/** SHA-1 / SHA-256 / SHA-512 of the UTF-8 text, as lower-case hex. */
export async function digest(text, algorithm = 'SHA-256') {
  const hash = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const trimLeading = (text) => text.split('\n').map((line) => line.replace(/^[ \t]+/, '')).join('\n');
export const trimBoth = (text) => text.split('\n').map((line) => line.trim()).join('\n');
export const sortByLength = (text) => text.split('\n').sort((a, b) => a.length - b.length).join('\n');
/** Line numbers in front of every line ("1. ", padded to the widest). */
export function numberLines(text) {
  const lines = text.split('\n');
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width, ' ')}  ${line}`).join('\n');
}
