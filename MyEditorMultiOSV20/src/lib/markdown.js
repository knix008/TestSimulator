// Markdown editing helpers: the formatting commands behind the Markdown
// toolbar (src/components/MarkdownBar.jsx) — they insert / toggle the
// Markdown syntax around the selection so the marks can be applied like in
// a WYSIWYG editor — and the renderer for the live preview.
import { EditorSelection } from '@codemirror/state';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ── line-prefix commands (headings, quotes, lists) ──

function selectedLines(state) {
  const seen = new Set();
  const lines = [];
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number;
    const to = state.doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) if (!seen.has(n)) { seen.add(n); lines.push(state.doc.line(n)); }
  }
  return lines;
}

const HEADING_RE = /^(\s{0,3})(#{1,6})\s+/;
const QUOTE_RE = /^(\s*)>\s?/;
const BULLET_RE = /^(\s*)[-*+]\s+(\[[ xX]\]\s+)?/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+/;
const TASK_RE = /^(\s*)[-*+]\s+\[[ xX]\]\s+/;

// Rewrites each selected line with `fn(text) → text`, keeping the selection on the same lines.
function rewriteLines(view, fn) {
  const { state } = view;
  const changes = [];
  for (const line of selectedLines(state)) {
    const next = fn(line.text);
    if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  }
  if (!changes.length) return false;
  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}

// H1…H6 — toggles off when every selected line already has that level.
export function heading(view, level) {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => { const m = l.text.match(HEADING_RE); return m && m[2].length === level; });
  const mark = '#'.repeat(level) + ' ';
  return rewriteLines(view, (text) => (all ? text.replace(HEADING_RE, '$1') : text.replace(HEADING_RE, '$1').replace(/^(\s*)/, `$1${mark}`)));
}

export function quote(view) {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => QUOTE_RE.test(l.text));
  return rewriteLines(view, (text) => (all ? text.replace(QUOTE_RE, '$1') : text.replace(/^(\s*)/, '$1> ')));
}

export function bulletList(view) {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => BULLET_RE.test(l.text) && !TASK_RE.test(l.text));
  return rewriteLines(view, (text) => (all ? text.replace(BULLET_RE, '$1') : text.replace(BULLET_RE, '$1').replace(ORDERED_RE, '$1').replace(/^(\s*)/, '$1- ')));
}

export function orderedList(view) {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => ORDERED_RE.test(l.text));
  let n = 0;
  return rewriteLines(view, (text) => (all ? text.replace(ORDERED_RE, '$1') : text.replace(BULLET_RE, '$1').replace(ORDERED_RE, '$1').replace(/^(\s*)/, `$1${++n}. `)));
}

export function taskList(view) {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => TASK_RE.test(l.text));
  return rewriteLines(view, (text) => (all ? text.replace(TASK_RE, '$1') : text.replace(BULLET_RE, '$1').replace(ORDERED_RE, '$1').replace(/^(\s*)/, '$1- [ ] ')));
}

// ── inline wrap commands (bold, italic, strike, code) ──

// Wraps every selection in `open`…`close`; unwraps when it is already wrapped
// (or when the markers sit just outside the selection). With an empty
// selection the word under the cursor is wrapped, or the markers are inserted
// with the cursor between them.
export function wrap(view, open, close = open) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    let { from, to } = range;
    if (from === to) {
      // Expand to the word around the cursor.
      const line = state.doc.lineAt(from);
      const text = line.text;
      let a = from - line.from, b = a;
      while (a > 0 && /[\p{L}\p{N}_]/u.test(text[a - 1])) a--;
      while (b < text.length && /[\p{L}\p{N}_]/u.test(text[b])) b++;
      from = line.from + a; to = line.from + b;
    }
    const sel = state.sliceDoc(from, to);
    const before = state.sliceDoc(Math.max(0, from - open.length), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + close.length));
    if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) {
      const inner = sel.slice(open.length, sel.length - close.length);
      return { changes: { from, to, insert: inner }, range: EditorSelection.range(from, from + inner.length) };
    }
    if (before === open && after === close) {
      return { changes: [{ from: from - open.length, to: from, insert: '' }, { from: to, to: to + close.length, insert: '' }], range: EditorSelection.range(from - open.length, to - open.length) };
    }
    return { changes: { from, to, insert: open + sel + close }, range: EditorSelection.range(from + open.length, from + open.length + sel.length) };
  });
  view.dispatch(tr, { scrollIntoView: true });
  view.focus();
  return true;
}

export const bold = (v) => wrap(v, '**');
export const italic = (v) => wrap(v, '*');
export const strike = (v) => wrap(v, '~~');
export const inlineCode = (v) => wrap(v, '`');

// ── block inserts ──

function insertBlock(view, text, { selectFrom = null, selectTo = null } = {}) {
  const { state } = view;
  const r = state.selection.main;
  const lineStart = state.doc.lineAt(r.from).from;
  const atLineStart = r.from === lineStart;
  const prefix = atLineStart ? '' : '\n';
  const insert = prefix + text;
  const base = r.from + prefix.length;
  view.dispatch({
    changes: { from: r.from, to: r.to, insert },
    selection: selectFrom != null ? EditorSelection.range(base + selectFrom, base + (selectTo != null ? selectTo : selectFrom)) : EditorSelection.cursor(r.from + insert.length),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function codeBlock(view, lang = '') {
  const { state } = view;
  const r = state.selection.main;
  const sel = state.sliceDoc(r.from, r.to);
  if (sel) {
    const body = sel.endsWith('\n') ? sel : `${sel}\n`;
    const insert = `\`\`\`${lang}\n${body}\`\`\`\n`;
    view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.cursor(r.from + 3), scrollIntoView: true });
    view.focus();
    return true;
  }
  return insertBlock(view, `\`\`\`${lang}\n\n\`\`\`\n`, { selectFrom: 4 + lang.length });
}

export function link(view) {
  const { state } = view;
  const r = state.selection.main;
  const sel = state.sliceDoc(r.from, r.to);
  const text = sel || 'text';
  const insert = `[${text}](url)`;
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.range(r.from + text.length + 3, r.from + text.length + 6), scrollIntoView: true });
  view.focus();
  return true;
}

export function image(view) {
  const { state } = view;
  const r = state.selection.main;
  const sel = state.sliceDoc(r.from, r.to);
  const alt = sel || 'alt';
  const insert = `![${alt}](url)`;
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.range(r.from + alt.length + 4, r.from + alt.length + 7), scrollIntoView: true });
  view.focus();
  return true;
}

export function table(view, cols = 3, rows = 2) {
  const head = `| ${Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(' | ')} |`;
  const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = Array.from({ length: rows }, () => `| ${Array.from({ length: cols }, () => '    ').join(' | ')} |`).join('\n');
  return insertBlock(view, `${head}\n${sep}\n${body}\n`, { selectFrom: 2, selectTo: 10 });
}

export const hr = (view) => insertBlock(view, '\n---\n\n');

export const commands = { heading, quote, bulletList, orderedList, taskList, bold, italic, strike, inlineCode, codeBlock, link, image, table, hr };

// ── preview ──

marked.setOptions({ gfm: true, breaks: false });

// The rendered HTML, sanitized (a document may contain raw HTML).
export function renderMarkdown(text) {
  let html = '';
  try { html = marked.parse(text || ''); } catch (e) { html = `<pre>${String(e.message)}</pre>`; }
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
}
