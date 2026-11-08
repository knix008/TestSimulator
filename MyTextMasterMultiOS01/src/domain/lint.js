// Problems of a document for the bottom panel: things that are probably mistakes (a heading level
// skipped, a link to a missing #heading, a picture without alt text, an unclosed HTML tag, trailing
// spaces, mixed line indentation, very long lines). Pure: { line, col, severity, code, params }.
import { markdownOutline, htmlOutline, slugify } from './outline.js';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen', 'command']);
const OPTIONAL_CLOSE = new Set(['p', 'li', 'td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'option', 'dt', 'dd', 'html', 'head', 'body', 'colgroup', 'rt', 'rp', 'optgroup']);

function common(text, out) {
  const lines = text.split('\n');
  let tabs = 0;
  let spaces = 0;
  lines.forEach((line, i) => {
    // Exactly two spaces at the end are a Markdown line break, not a mistake.
    if (/[ \t]+$/.test(line) && !/(^|[^ ]) {2}$/.test(line)) out.push({ line: i + 1, col: line.replace(/[ \t]+$/, '').length + 1, severity: 'info', code: 'trailingSpace' });
    if (/^\t/.test(line)) tabs += 1;
    if (/^ {2,}\S/.test(line)) spaces += 1;
    if ([...line].length > 400) out.push({ line: i + 1, col: 401, severity: 'info', code: 'longLine', params: { n: [...line].length } });
  });
  if (tabs && spaces) out.push({ line: 1, col: 1, severity: 'info', code: 'mixedIndent', params: { tabs, spaces } });
}

export function lintMarkdown(text) {
  const out = [];
  const headings = markdownOutline(text);
  let previous = 0;
  for (const h of headings) {
    if (previous && h.level > previous + 1) out.push({ line: h.line, col: 1, severity: 'warning', code: 'headingSkip', params: { from: previous, to: h.level } });
    if (!h.text) out.push({ line: h.line, col: 1, severity: 'warning', code: 'emptyHeading' });
    previous = h.level;
  }
  const slugs = new Set(headings.map((h) => slugify(h.text)));
  const lines = text.split('\n');
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) { fence = !fence; return; }
    if (fence) return;
    for (const m of line.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)) {
      if (!m[1].trim()) out.push({ line: i + 1, col: m.index + 1, severity: 'warning', code: 'imageAlt' });
      if (!m[2].trim()) out.push({ line: i + 1, col: m.index + 1, severity: 'error', code: 'emptyLink' });
    }
    for (const m of line.matchAll(/(?<!!)\[([^\]]*)\]\(([^)]*)\)/g)) {
      const href = m[2].trim();
      if (!href) out.push({ line: i + 1, col: m.index + 1, severity: 'error', code: 'emptyLink' });
      else if (href.startsWith('#') && !slugs.has(decodeURIComponent(href.slice(1)).toLowerCase()) && !slugs.has(slugify(decodeURIComponent(href.slice(1))))) out.push({ line: i + 1, col: m.index + 1, severity: 'warning', code: 'missingAnchor', params: { name: href } });
    }
    if (/^#{1,6}[^#\s]/.test(line)) out.push({ line: i + 1, col: 1, severity: 'warning', code: 'headingSpace' });
  });
  if (fence) out.push({ line: lines.length, col: 1, severity: 'error', code: 'openFence' });
  common(text, out);
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

export function lintHtml(text) {
  const out = [];
  const stack = [];
  const source = String(text).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (m) => m.replace(/[^\n]/g, ' '));
  const lineOf = (index) => source.slice(0, index).split('\n').length;
  for (const m of source.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g)) {
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    if (VOID.has(tag) || m[2] === '/') {
      if (tag === 'img' && !/\balt\s*=/.test(m[0])) out.push({ line: lineOf(m.index), col: 1, severity: 'warning', code: 'imageAlt' });
      continue;
    }
    if (!closing) { stack.push({ tag, index: m.index }); continue; }
    let found = stack.length - 1;
    while (found >= 0 && stack[found].tag !== tag) found -= 1;
    if (found < 0) { out.push({ line: lineOf(m.index), col: 1, severity: 'error', code: 'strayClose', params: { tag } }); continue; }
    for (const open of stack.splice(found)) if (open.tag !== tag && !OPTIONAL_CLOSE.has(open.tag)) out.push({ line: lineOf(open.index), col: 1, severity: 'error', code: 'unclosed', params: { tag: open.tag } });
  }
  for (const open of stack) if (!OPTIONAL_CLOSE.has(open.tag)) out.push({ line: lineOf(open.index), col: 1, severity: 'error', code: 'unclosed', params: { tag: open.tag } });
  if (/<html\b/i.test(text) && !/<title\b/i.test(text)) out.push({ line: 1, col: 1, severity: 'info', code: 'noTitle' });
  if (/<html\b/i.test(text) && !/^\s*<!doctype html/i.test(text)) out.push({ line: 1, col: 1, severity: 'info', code: 'noDoctype' });
  const ids = new Map();
  for (const m of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    if (ids.has(m[1])) out.push({ line: lineOf(m.index), col: 1, severity: 'warning', code: 'duplicateId', params: { name: m[1] } });
    ids.set(m[1], true);
  }
  let previous = 0;
  for (const h of htmlOutline(text)) {
    if (previous && h.level > previous + 1) out.push({ line: h.line, col: 1, severity: 'warning', code: 'headingSkip', params: { from: previous, to: h.level } });
    previous = h.level;
  }
  common(text, out);
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

export function lintJson(text) {
  try { JSON.parse(text); return []; } catch (error) {
    const at = Number(/position (\d+)/.exec(error.message)?.[1] ?? 0);
    const before = text.slice(0, at);
    return [{ line: before.split('\n').length, col: at - before.lastIndexOf('\n'), severity: 'error', code: 'json', params: { message: error.message } }];
  }
}

/** Problems for a document kind (text: JSON files are parsed; other text only the common checks). */
export function lint(kind, text, name = '') {
  if (kind === 'markdown') return lintMarkdown(text);
  if (kind === 'html') return lintHtml(text);
  const out = /\.json$/i.test(name) && text.trim() ? lintJson(text) : [];
  common(text, out);
  return out;
}
