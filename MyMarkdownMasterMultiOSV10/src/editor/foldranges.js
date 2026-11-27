// Fold ranges on plain text lines (no CodeMirror): headings (to the next heading of the same or a
// higher level), list items with indented children, fenced code blocks, quotes / callouts, display
// math and the front matter. `doc` is { lines: count, text(n) } with 1-based line numbers; the result is
// { fromLine, toLine } (the fold hides from the end of fromLine to the end of toLine) or null.
import { headingOf, LIST_RE } from './mdtext.js';

/** A `doc` over an array of strings (tests, and plain text). */
export const linesDoc = (array) => ({ lines: array.length, text: (n) => array[n - 1] ?? '' });

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const indentOf = (text) => {
  let n = 0;
  for (const ch of text) { if (ch === ' ') n++; else if (ch === '\t') n += 4; else break; }
  return n;
};
const blank = (text) => text.trim() === '';

const closesFence = (text, fence) => {
  const m = FENCE_RE.exec(text);
  return Boolean(m && m[1][0] === fence[0] && m[1].length >= fence.length && !/\S/.test(text.trim().slice(m[1].length)));
};

/**
 * 1-based line predicate: inside a fenced code block, display math or the front matter (fences
 * included). `starts` holds the first lines of those blocks.
 */
export function codeLines(doc) {
  const code = new Uint8Array(doc.lines + 2);
  const starts = new Set();
  let n = 1;
  if (/^---\s*$/.test(doc.text(1))) {
    for (let i = 2; i <= doc.lines; i++) {
      if (/^(---|\.\.\.)\s*$/.test(doc.text(i))) { for (let j = 1; j <= i; j++) code[j] = 1; starts.add(1); n = i + 1; break; }
    }
  }
  let fence = null;
  let math = false;
  for (; n <= doc.lines; n++) {
    const text = doc.text(n);
    if (fence) { code[n] = 1; if (closesFence(text, fence)) fence = null; continue; }
    if (math) { code[n] = 1; if (/\$\$\s*$/.test(text)) math = false; continue; }
    const m = FENCE_RE.exec(text);
    if (m) { fence = m[1]; code[n] = 1; starts.add(n); continue; }
    if (/^\s*\$\$/.test(text)) {
      code[n] = 1;
      starts.add(n);
      if (!/\$\$\s*$/.test(text.trim().slice(2))) math = true;
    }
  }
  const test = (line) => code[line] === 1;
  test.starts = starts;
  return test;
}

function trimBlankEnd(doc, from, to) {
  while (to > from && blank(doc.text(to))) to--;
  return to > from ? { fromLine: from, toLine: to } : null;
}

export function headingFold(doc, n, isCode) {
  if (isCode(n)) return null;
  const h = headingOf(doc.text(n));
  if (!h) return null;
  let end = doc.lines;
  for (let m = n + 1; m <= doc.lines; m++) {
    if (isCode(m)) continue;
    const other = headingOf(doc.text(m));
    if (other && other.level <= h.level) { end = m - 1; break; }
  }
  return trimBlankEnd(doc, n, end);
}

export function fenceFold(doc, n) {
  const m = FENCE_RE.exec(doc.text(n));
  if (!m) return null;
  const fence = m[1];
  for (let k = n + 1; k <= doc.lines; k++) {
    const c = FENCE_RE.exec(doc.text(k));
    if (c && c[1][0] === fence[0] && c[1].length >= fence.length && !/\S/.test(doc.text(k).trim().slice(c[1].length))) return k > n ? { fromLine: n, toLine: k } : null;
  }
  return null;
}

export function mathFold(doc, n) {
  const text = doc.text(n).trim();
  if (text !== '$$') return null;
  for (let k = n + 1; k <= doc.lines; k++) if (/\$\$\s*$/.test(doc.text(k))) return { fromLine: n, toLine: k };
  return null;
}

export function frontMatterFold(doc, n) {
  if (n !== 1 || !/^---\s*$/.test(doc.text(1))) return null;
  for (let k = 2; k <= doc.lines; k++) if (/^(---|\.\.\.)\s*$/.test(doc.text(k))) return k > 2 ? { fromLine: 1, toLine: k } : null;
  return null;
}

export function quoteFold(doc, n) {
  const isQuote = (k) => /^\s*>/.test(doc.text(k));
  if (!isQuote(n) || (n > 1 && isQuote(n - 1))) return null;
  let end = n;
  while (end < doc.lines && isQuote(end + 1)) end++;
  return end > n ? { fromLine: n, toLine: end } : null;
}

export function listFold(doc, n) {
  const text = doc.text(n);
  const quote = /^(\s*>\s?)*/.exec(text)[0];
  const m = LIST_RE.exec(text.slice(quote.length));
  if (!m) return null;
  const base = indentOf(m[1]);
  let end = n;
  for (let k = n + 1; k <= doc.lines; k++) {
    const line = doc.text(k).slice(quote.length);
    if (blank(line)) continue;
    if (indentOf(line) > base) end = k; else break;
  }
  return end > n ? { fromLine: n, toLine: end } : null;
}

/**
 * The fold range starting on line `n`, or null. `isCode(n)` tells code / math / front matter lines and
 * `isCode.starts` (a Set) their first lines; it defaults to a scan of the fences.
 */
export function foldRangeAt(doc, n, isCode = null) {
  const code = isCode ?? codeLines(doc);
  if (n === 1) {
    const fm = frontMatterFold(doc, 1);
    if (fm) return fm;
  }
  if (code(n)) {
    if (code.starts && !code.starts.has(n)) return null;
    return fenceFold(doc, n) ?? mathFold(doc, n);
  }
  return headingFold(doc, n, code) ?? quoteFold(doc, n) ?? listFold(doc, n);
}
