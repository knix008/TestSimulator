// Formatting commands of the note editor (each takes the EditorView): marks around the selection,
// line prefixes (lists, quotes, tasks), headings, links, tables (insert, align, rows / columns, Tab to
// the next cell), code blocks, callouts, math, rules and footnotes. The text logic lives in the pure
// modules (mdtext.js, table.js); these map it onto CodeMirror transactions with sensible selections.
import { EditorSelection } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { startCompletion } from '@codemirror/autocomplete';
import { indentLess, indentMore } from '@codemirror/commands';
import { t } from '../i18n.js';
import {
  cycleTaskLine, LIST_RE, nextFootnoteNumber, parseLine, setHeadingLine, toggleLinePrefixLines, toggleTaskLine, toggleWrap,
} from './mdtext.js';
import {
  addColumn, addRow, cellIndexAt, cellStart, deleteColumn, deleteRow, formatTable, isTableLine, lineOfRow, modelRow, newTable, parseTable, tableRangeAt,
} from './table.js';

const userEvent = (name) => ({ userEvent: name, scrollIntoView: true });

// ───────────────────────── marks

/** Wraps (or unwraps) every selection range in `before` … `after`. */
export function wrapSelection(view, before, after = before, placeholder = '') {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const base = Math.max(0, range.from - 12);
    const end = Math.min(state.doc.length, range.to + 12);
    const text = state.doc.sliceString(base, end);
    const r = toggleWrap(text, range.from - base, range.to - base, before, after, placeholder);
    const from = r.from + base;
    const to = r.to + base;
    return { changes: { from, to, insert: r.insert }, range: EditorSelection.range(r.selFrom + base, r.selTo + base) };
  });
  view.dispatch(state.update(tr, userEvent('input.format')));
  return true;
}

/** Toggles %%comment%% around the selection, or around the whole line(s) when nothing is selected. */
export function toggleComment(view) {
  const { state } = view;
  if (!state.selection.ranges.every((r) => r.empty)) return wrapSelection(view, '%%', '%%', '');
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const text = line.text;
    const m = /^(\s*)%%(.*)%%\s*$/.exec(text);
    if (m) {
      const insert = m[1] + m[2];
      return { changes: { from: line.from, to: line.to, insert }, range: EditorSelection.cursor(Math.min(line.from + insert.length, Math.max(line.from, range.head - 2))) };
    }
    const lead = /^\s*/.exec(text)[0].length;
    if (!text.trim()) return { changes: { from: range.head, insert: '%%%%' }, range: EditorSelection.cursor(range.head + 2) };
    return {
      changes: [{ from: line.from + lead, insert: '%%' }, { from: line.to, insert: '%%' }],
      range: EditorSelection.cursor(range.head + 2),
    };
  });
  view.dispatch(state.update(tr, userEvent('input.format')));
  return true;
}

// ───────────────────────── lines

/** The distinct line numbers the selection covers. */
function selectedLines(state) {
  const numbers = new Set();
  for (const range of state.selection.ranges) {
    const a = state.doc.lineAt(range.from).number;
    let b = state.doc.lineAt(range.to).number;
    if (b > a && range.to === state.doc.line(b).from) b--;
    for (let n = a; n <= b; n++) numbers.add(n);
  }
  return [...numbers].sort((x, y) => x - y);
}

/**
 * Replaces the selected lines with `fn(texts)` (same count). Cursors keep their distance from the end
 * of their line, so a cursor behind a new prefix stays behind it.
 */
function mapLines(view, fn) {
  const { state } = view;
  const numbers = selectedLines(state);
  const lines = numbers.map((n) => state.doc.line(n));
  const next = fn(lines.map((line) => line.text));
  const changes = [];
  lines.forEach((line, i) => { if (next[i] !== line.text) changes.push({ from: line.from, to: line.to, insert: next[i] }); });
  if (!changes.length) return true;
  const changeSet = state.changes(changes);
  const ranges = state.selection.ranges.map((range) => {
    const move = (pos) => {
      const line = state.doc.lineAt(pos);
      const i = numbers.indexOf(line.number);
      if (i < 0 || next[i] === line.text) return changeSet.mapPos(pos);
      const fromEnd = line.to - pos;
      const newFrom = changeSet.mapPos(line.from, -1);
      const newLen = next[i].length;
      const markerEnd = newLen - parseLine(next[i]).body.length; // never inside a new list marker
      return newFrom + Math.min(newLen, Math.max(markerEnd, newLen - fromEnd));
    };
    return EditorSelection.range(move(range.anchor), move(range.head));
  });
  view.dispatch(state.update({ changes: changeSet, selection: EditorSelection.create(ranges, state.selection.mainIndex) }, userEvent('input.format')));
  return true;
}

export const toggleLinePrefix = (view, prefix) => mapLines(view, (texts) => toggleLinePrefixLines(texts, prefix));
export const setHeading = (view, level) => mapLines(view, (texts) => texts.map((text) => setHeadingLine(text, level)));
export const toggleTask = (view) => mapLines(view, (texts) => texts.map(toggleTaskLine));
export const cycleTaskState = (view) => mapLines(view, (texts) => texts.map(cycleTaskLine));

/** Toggles the task box on line `lineNumber` (a checkbox click in live preview). */
export function toggleTaskAtLine(view, lineNumber) {
  const line = view.state.doc.line(lineNumber);
  const info = parseLine(line.text);
  if (info.boxChar == null) return false;
  const offset = info.quote.length + info.indent.length + info.marker.length + info.space.length + 1;
  view.dispatch({ changes: { from: line.from + offset, to: line.from + offset + 1, insert: info.boxChar === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
  return true;
}

// ───────────────────────── blocks

/** Inserts `text` as block(s) on their own lines at the cursor; selects [selFrom, selTo) of the text. */
function insertBlock(view, text, selFrom = text.length, selTo = selFrom, { replaceSelection = true } = {}) {
  const { state } = view;
  const range = state.selection.main;
  const from = replaceSelection ? range.from : range.head;
  const to = replaceSelection ? range.to : range.head;
  const lineA = state.doc.lineAt(from);
  const lineB = state.doc.lineAt(to);
  const before = state.doc.sliceString(lineA.from, from);
  const after = state.doc.sliceString(to, lineB.to);
  let lead = '';
  if (before.trim()) lead = '\n\n';
  else if (lineA.number > 1 && state.doc.line(lineA.number - 1).text.trim() && !before) lead = '\n';
  let trail = '';
  if (after.trim()) trail = '\n\n';
  else if (lineB.number < state.doc.lines && state.doc.line(lineB.number + 1).text.trim()) trail = '\n';
  const insert = lead + text + trail;
  const start = from + lead.length;
  view.dispatch(state.update({ changes: { from, to, insert }, selection: EditorSelection.range(start + selFrom, start + selTo) }, userEvent('input.insert')));
  view.focus();
  return true;
}

export function insertCodeBlock(view, lang = '') {
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  const head = `\`\`\`${lang}\n`;
  const body = sel || '';
  return insertBlock(view, `${head}${body}\n\`\`\``, head.length, head.length + body.length);
}

export function insertCallout(view, type = 'note') {
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  const title = t('editor.text.calloutTitle');
  const head = `> [!${type}] `;
  const body = (sel || '').split('\n').map((line) => `> ${line}`).join('\n');
  return insertBlock(view, `${head}${title}\n${body}`, head.length, head.length + title.length);
}

export function insertMath(view, display = false) {
  const placeholder = t('editor.text.math');
  if (!display) return wrapSelection(view, '$', '$', 'x^2');
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  const body = sel || placeholder;
  return insertBlock(view, `$$\n${body}\n$$`, 3, 3 + body.length);
}

export const insertHorizontalRule = (view) => insertBlock(view, '---\n', 4, 4, { replaceSelection: false });

export function insertFootnote(view) {
  const { state } = view;
  const n = nextFootnoteNumber(state.doc.toString());
  const label = `[^${n}]`;
  const pos = state.selection.main.to;
  const docText = state.doc.toString();
  const tail = /\n\[\^[^\]]+\]:[^\n]*\s*$/.test(docText) ? '\n' : docText.endsWith('\n\n') ? '' : docText.endsWith('\n') ? '\n' : '\n\n';
  const def = `${tail}${label}: `;
  view.dispatch(state.update({
    changes: [{ from: pos, insert: label }, { from: state.doc.length, insert: def }],
    selection: EditorSelection.cursor(state.doc.length + label.length + def.length),
  }, userEvent('input.insert')));
  view.focus();
  return true;
}

// ───────────────────────── links

const URL_RE = /^(https?:\/\/|www\.|mailto:)\S+$/i;

export function insertLink(view) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const sel = state.sliceDoc(range.from, range.to);
    if (sel && URL_RE.test(sel.trim())) {
      const text = t('editor.text.linkText');
      const insert = `[${text}](${sel.trim()})`;
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(range.from + 1, range.from + 1 + text.length) };
    }
    const url = t('editor.text.url');
    const text = sel || t('editor.text.linkText');
    const insert = `[${text}](${url})`;
    if (sel) return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(range.from + text.length + 3, range.from + text.length + 3 + url.length) };
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(range.from + 1, range.from + 1 + text.length) };
  });
  view.dispatch(state.update(tr, userEvent('input.insert')));
  view.focus();
  return true;
}

export function insertWikiLink(view) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const sel = state.sliceDoc(range.from, range.to);
    const insert = `[[${sel}]]`;
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + 2 + sel.length) };
  });
  view.dispatch(state.update(tr, userEvent('input.insert')));
  view.focus();
  if (state.selection.main.empty) startCompletion(view);
  return true;
}

// ───────────────────────── tables

/** The table around the cursor: { first, last (line numbers), lines, row (model), col, offsetInCell } or null. */
function tableAtCursor(state) {
  const { doc } = state;
  const head = state.selection.main.head;
  const line = doc.lineAt(head);
  if (!isTableLine(line.text)) return null;
  let a = line.number;
  let b = line.number;
  while (a > 1 && isTableLine(doc.line(a - 1).text)) a--;
  while (b < doc.lines && isTableLine(doc.line(b + 1).text)) b++;
  const texts = [];
  for (let n = a; n <= b; n++) texts.push(doc.line(n).text);
  const range = tableRangeAt(texts, line.number - a);
  if (!range) return null;
  const first = a + range[0];
  const last = a + range[1];
  const lines = texts.slice(range[0], range[1] + 1);
  const lineIndex = line.number - first;
  const ch = head - line.from;
  const col = cellIndexAt(line.text, ch);
  const start = cellStart(line.text, col);
  return { first, last, lines, lineIndex, row: modelRow(lineIndex), col, offsetInCell: Math.max(0, ch - start) };
}

/** Replaces the table with `model` formatted and puts the cursor in cell (row, col). */
function writeTable(view, info, model, row, col, { select = false } = {}) {
  const { state } = view;
  const formatted = formatTable(model);
  const from = state.doc.line(info.first).from;
  const to = state.doc.line(info.last).to;
  const insert = formatted.join('\n');
  const lineIndex = lineOfRow(Math.max(0, row));
  const offset = formatted.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0);
  const rowText = formatted[lineIndex] ?? '';
  const c = Math.max(0, Math.min(col, model.aligns.length - 1));
  const cellFrom = cellStart(rowText, c);
  const cellText = (model.rows[Math.max(0, row)] ?? [])[c] ?? '';
  const cursor = from + offset + cellFrom + (select ? 0 : Math.min(info.offsetInCell ?? 0, cellText.length));
  const selection = select ? EditorSelection.range(cursor, cursor + cellText.length) : EditorSelection.cursor(cursor);
  view.dispatch(state.update({ changes: { from, to, insert }, selection }, userEvent('input.table')));
  return true;
}

export function formatTableAtCursor(view) {
  const info = tableAtCursor(view.state);
  if (!info) return false;
  const model = parseTable(info.lines);
  return writeTable(view, info, model, info.row < 0 ? 0 : info.row, info.col);
}

export function tableAddRow(view) {
  const info = tableAtCursor(view.state);
  if (!info) return false;
  const r = addRow(parseTable(info.lines), info.row < 0 ? 0 : info.row);
  return writeTable(view, { ...info, last: info.last, offsetInCell: 0 }, r.model, r.row, info.col);
}

export function tableAddColumn(view) {
  const info = tableAtCursor(view.state);
  if (!info) return false;
  const r = addColumn(parseTable(info.lines), info.col, t('editor.table.newColumn'));
  return writeTable(view, { ...info, offsetInCell: 0 }, r.model, Math.max(0, info.row), r.col, { select: info.row <= 0 });
}

export function tableDeleteRow(view) {
  const info = tableAtCursor(view.state);
  if (!info) return false;
  const r = deleteRow(parseTable(info.lines), info.row < 0 ? 0 : info.row);
  return writeTable(view, { ...info, offsetInCell: 0 }, r.model, r.row, info.col);
}

export function tableDeleteColumn(view) {
  const info = tableAtCursor(view.state);
  if (!info) return false;
  const r = deleteColumn(parseTable(info.lines), info.col);
  if (!r) {
    // The last column: the table goes.
    const { state } = view;
    const from = state.doc.line(info.first).from;
    const to = Math.min(state.doc.length, state.doc.line(info.last).to + 1);
    view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: 'delete.table' });
    return true;
  }
  return writeTable(view, { ...info, offsetInCell: 0 }, r.model, Math.max(0, info.row), r.col);
}

/** Tab in a table: format it and go to the next cell (a new row after the last one). */
export function tableNextCell(view, backwards = false) {
  const info = tableAtCursor(view.state);
  if (!info) return false;
  let model = parseTable(info.lines);
  let row = Math.max(0, info.row);
  let col = info.col + (backwards ? -1 : 1);
  const cols = model.aligns.length;
  if (col >= cols) { col = 0; row += 1; }
  if (col < 0) { col = cols - 1; row -= 1; }
  if (row < 0) { row = 0; col = 0; }
  if (row >= model.rows.length) {
    const r = addRow(model, model.rows.length - 1);
    model = r.model;
    row = r.row;
  }
  return writeTable(view, { ...info, offsetInCell: 0 }, model, row, col, { select: true });
}

export function insertTable(view, rows = 2, cols = 3) {
  const lines = newTable(rows, cols, (i) => t('editor.table.column', { n: i + 1 }));
  const first = cellStart(lines[0], 0);
  const name = t('editor.table.column', { n: 1 });
  return insertBlock(view, lines.join('\n'), first, first + name.length, { replaceSelection: false });
}

// ───────────────────────── indentation

const isListLine = (text) => LIST_RE.test(text.replace(/^(\s*>\s?)+/, ''));

/** Tab: next table cell, indent list items / selections, else insert the indent unit. */
export function tabKey(view) {
  const { state } = view;
  if (tableNextCell(view)) return true;
  const ranges = state.selection.ranges;
  if (ranges.some((r) => !r.empty) || ranges.some((r) => isListLine(state.doc.lineAt(r.head).text))) return indentMore(view);
  view.dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), userEvent('input.indent')));
  return true;
}

export function shiftTabKey(view) {
  if (tableNextCell(view, true)) return true;
  return indentLess(view);
}
