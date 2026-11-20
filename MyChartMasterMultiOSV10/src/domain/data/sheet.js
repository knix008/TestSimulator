// The table as a spreadsheet (the data window, src/sheet.js): rows of cells where row 0 holds the column names
// (Excel's row 1) and row r + 1 the table's row r. Beside the values a chart keeps its sheet extras in
// `doc.sheet` = { formulas: { "r,c": "=…" }, formats: { "r,c": { b, i, u, s, align, fmt, dec, color, fill } },
// widths: { c: px } } — saved in .mychart and in .xlsx. Pure functions, no DOM.
import { cellText, columnLetter, createTable, normalizeCell, parseNumber, uniqueNames } from './table.js';
import { adjustFormula, isFormula, recalc, shiftFormula } from './formula.js';

export const emptySheet = () => ({ formulas: {}, formats: {}, widths: {} });
export const cellKey = (r, c) => `${r},${c}`;
export const splitKey = (key) => key.split(',').map(Number);

/** A sheet description cleaned up (unknown keys dropped, bad entries gone); null when there is nothing in it. */
export function normalizeSheet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = emptySheet();
  const valid = (key) => /^\d+,\d+$/.test(key);
  for (const [k, v] of Object.entries(raw.formulas ?? {})) if (valid(k) && isFormula(v)) out.formulas[k] = v;
  for (const [k, v] of Object.entries(raw.formats ?? {})) if (valid(k) && v && typeof v === 'object' && Object.keys(v).length) out.formats[k] = { ...v };
  for (const [k, v] of Object.entries(raw.widths ?? {})) if (/^\d+$/.test(k) && Number(v) >= 24 && Number(v) <= 1200) out.widths[k] = Math.round(Number(v));
  return hasSheet(out) ? out : null;
}

export const hasSheet = (sheet) => Boolean(sheet) && (Object.keys(sheet.formulas ?? {}).length > 0 || Object.keys(sheet.formats ?? {}).length > 0 || Object.keys(sheet.widths ?? {}).length > 0);
export const hasFormulas = (sheet) => Boolean(sheet) && Object.keys(sheet.formulas ?? {}).length > 0;
export const cloneSheet = (sheet) => (sheet ? { formulas: { ...sheet.formulas }, formats: Object.fromEntries(Object.entries(sheet.formats ?? {}).map(([k, v]) => [k, { ...v }])), widths: { ...sheet.widths } } : null);

/** The table as sheet rows: the names, then the data rows (copies). */
export function sheetCells(table) {
  return [table.columns.map((c) => c.name), ...table.rows.map((r) => [...r])];
}

const empty = (v) => v == null || v === '';

/**
 * Sheet rows back to a table: row 0 names the columns (empty names become letters, repeats get "(2)"), empty rows
 * and columns at the end are dropped (but never a column or row that still holds a formula), column types are
 * read from the values.
 */
export function tableFromCells(cells, sheet = null) {
  const keyed = Object.keys(sheet?.formulas ?? {}).map(splitKey);
  let width = 1;
  let height = 1;
  cells.forEach((row, r) => row.forEach((v, c) => { if (!empty(v)) { width = Math.max(width, c + 1); if (r > 0) height = Math.max(height, r + 1); } }));
  for (const [r, c] of keyed) { width = Math.max(width, c + 1); if (r > 0) height = Math.max(height, r + 1); }
  const names = uniqueNames(Array.from({ length: width }, (_, c) => (empty(cells[0]?.[c]) ? columnLetter(c) : String(cells[0][c]).trim() || columnLetter(c))));
  const rows = [];
  for (let r = 1; r < height; r++) rows.push(Array.from({ length: width }, (_, c) => normalizeCell(cells[r]?.[c] ?? null)));
  return createTable(names, rows);
}

/** The table with the sheet's formulas calculated again (the main grid's edits, an undo). */
export function recalcTable(table, sheet) {
  if (!hasFormulas(sheet)) return table;
  const t = tableFromCells(recalc(sheetCells(table), sheet.formulas), sheet);
  // Keep the column types the user chose where a column is still there.
  t.columns.forEach((c, i) => { const old = table.columns[i]; if (old && old.name === c.name && old.type !== c.type && old.forced) c.type = old.type; });
  return t;
}

/** What someone typed into a cell: a number when it reads as one ("1,234", "12%", "₩3,000"), else text; '' is empty. */
export function parseInput(text) {
  if (text == null) return null;
  if (typeof text !== 'string') return normalizeCell(text);
  if (text === '') return null;
  const n = parseNumber(text);
  if (n != null && /^[\s+\-−(]*[$€£¥₩]?[\d.,\s]+(e[+-]?\d+)?%?[)]?$/i.test(text.trim())) return n;
  if (/^(true|false)$/i.test(text.trim())) return text.trim().toUpperCase();
  return text;
}

/** What a cell shows in the editor: its formula, or its value as text. */
export const inputText = (cells, sheet, r, c) => sheet?.formulas?.[cellKey(r, c)] ?? cellText(cells[r]?.[c] ?? null);

/**
 * Writes typed text into a cell (r, c): a formula ("=…") is kept in the sheet and calculated, anything else
 * replaces the value and drops a formula that was there. Returns { cells, sheet } (new objects).
 */
export function setInput(cells, sheet, r, c, text) {
  const out = cells.map((row) => [...row]);
  const s = cloneSheet(sheet) ?? emptySheet();
  while (out.length <= r) out.push([]);
  const key = cellKey(r, c);
  if (r > 0 && isFormula(text)) {
    s.formulas[key] = text.trim().replace(/^=\s*/, '=');
    out[r][c] = null;
  } else {
    delete s.formulas[key];
    out[r][c] = r === 0 ? (text === '' ? null : String(text)) : parseInput(text);
  }
  return { cells: recalc(out, s.formulas), sheet: s };
}

/** Moves the sheet's keys, formulas and column widths after rows or columns were inserted (count > 0) or deleted. */
export function shiftSheet(sheet, { axis, at, count }) {
  if (!sheet) return null;
  const s = emptySheet();
  const move = (key) => {
    const [r, c] = splitKey(key);
    const v = axis === 'row' ? r : c;
    if (count < 0 && v >= at && v < at - count) return null;
    const nv = v >= at ? v + count : v;
    return axis === 'row' ? cellKey(nv, c) : cellKey(r, nv);
  };
  for (const [k, f] of Object.entries(sheet.formulas ?? {})) { const nk = move(k); if (nk) s.formulas[nk] = adjustFormula(f, { axis, at, count }); }
  for (const [k, f] of Object.entries(sheet.formats ?? {})) { const nk = move(k); if (nk) s.formats[nk] = { ...f }; }
  for (const [k, w] of Object.entries(sheet.widths ?? {})) {
    const c = Number(k);
    if (axis !== 'col') { s.widths[k] = w; continue; }
    if (count < 0 && c >= at && c < at - count) continue;
    s.widths[c >= at ? c + count : c] = w;
  }
  return s;
}

/** Inserts `count` empty rows (axis 'row') or columns ('col') at sheet index `at`. Returns { cells, sheet }. */
export function insertCells(cells, sheet, axis, at, count = 1) {
  let out = cells.map((row) => [...row]);
  if (axis === 'row') { while (out.length < at) out.push([]); out.splice(at, 0, ...Array.from({ length: count }, () => [])); }
  else out = out.map((row) => { const r = [...row]; while (r.length < at) r.push(null); r.splice(at, 0, ...Array(count).fill(null)); return r; });
  const s = shiftSheet(sheet ?? emptySheet(), { axis, at, count });
  if (axis === 'col') for (let k = 0; k < count; k++) out[0][at + k] = null;
  return { cells: recalc(out, s.formulas), sheet: s };
}

/** Deletes `count` rows or columns from sheet index `at`. Returns { cells, sheet }. */
export function deleteCells(cells, sheet, axis, at, count = 1) {
  let out = cells.map((row) => [...row]);
  if (axis === 'row') out.splice(at, count);
  else out = out.map((row) => { const r = [...row]; r.splice(at, count); return r; });
  if (!out.length) out.push([]);
  const s = shiftSheet(sheet ?? emptySheet(), { axis, at, count: -count });
  return { cells: recalc(out, s.formulas), sheet: s };
}

/**
 * A block of cells for the clipboard: values (as shown), formulas and formats of the box, relative to its corner.
 * { rows, cols, values: [][], formulas: { "dr,dc": "=…" }, formats: { "dr,dc": {…} }, origin: { r, c } }
 */
export function copyBlock(cells, sheet, box) {
  const values = [];
  const formulas = {};
  const formats = {};
  for (let r = box.r0; r <= box.r1; r++) {
    const row = [];
    for (let c = box.c0; c <= box.c1; c++) {
      row.push(cells[r]?.[c] ?? null);
      const key = cellKey(r, c);
      if (sheet?.formulas?.[key]) formulas[cellKey(r - box.r0, c - box.c0)] = sheet.formulas[key];
      if (sheet?.formats?.[key]) formats[cellKey(r - box.r0, c - box.c0)] = { ...sheet.formats[key] };
    }
    values.push(row);
  }
  return { rows: box.r1 - box.r0 + 1, cols: box.c1 - box.c0 + 1, values, formulas, formats, origin: { r: box.r0, c: box.c0 } };
}

/** The block as tab-separated text (what Excel and other spreadsheets paste). */
export const blockText = (block) => block.values.map((row) => row.map((v) => cellText(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\r\n');

/**
 * Pastes a block at (r, c). `mode`: 'all' (values, formulas moved like Excel, formats), 'values', 'formats', or
 * 'formulas'. When the target box is a multiple of the block's size the block repeats over it. Header-row cells
 * take text only. Returns { cells, sheet, box }.
 */
export function pasteBlock(cells, sheet, block, target, mode = 'all') {
  const out = cells.map((row) => [...row]);
  const s = cloneSheet(sheet) ?? emptySheet();
  const tr = target.r1 != null && (target.r1 - target.r0 + 1) % block.rows === 0 ? target.r1 - target.r0 + 1 : block.rows;
  const tc = target.c1 != null && (target.c1 - target.c0 + 1) % block.cols === 0 ? target.c1 - target.c0 + 1 : block.cols;
  for (let dr = 0; dr < tr; dr++) {
    for (let dc = 0; dc < tc; dc++) {
      const r = target.r0 + dr;
      const c = target.c0 + dc;
      const sk = cellKey(dr % block.rows, dc % block.cols);
      const key = cellKey(r, c);
      while (out.length <= r) out.push([]);
      if (mode !== 'formats') {
        const formula = block.formulas?.[sk];
        if (formula && mode !== 'values' && r > 0) {
          const origin = block.origin ?? { r: target.r0, c: target.c0 };
          s.formulas[key] = shiftFormula(formula, r - (origin.r + dr % block.rows), c - (origin.c + dc % block.cols));
          out[r][c] = null;
        } else if (mode !== 'formulas' || !formula) {
          delete s.formulas[key];
          const v = block.values[dr % block.rows]?.[dc % block.cols] ?? null;
          out[r][c] = r === 0 ? (v == null ? null : cellText(v)) : typeof v === 'string' ? parseInput(v) : normalizeCell(v);
        }
      }
      if (mode === 'all' || mode === 'formats') {
        const f = block.formats?.[sk];
        if (f) s.formats[key] = { ...f }; else delete s.formats[key];
      }
    }
  }
  return { cells: recalc(out, s.formulas), sheet: s, box: { r0: target.r0, c0: target.c0, r1: target.r0 + tr - 1, c1: target.c0 + tc - 1 } };
}

/** A block from tab-separated (or comma-separated) text, quoted cells allowed. */
export function textBlock(text, split) {
  const raw = String(text ?? '').replace(/\r?\n$/, '');
  const rows = split(raw, raw.includes('\t') ? '\t' : ',');
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return { rows: rows.length || 1, cols, values: rows.map((r) => Array.from({ length: cols }, (_, i) => (r[i] == null || r[i] === '' ? null : r[i]))), formulas: {}, formats: {} };
}

/** Clears values and formulas (and formats with `formats`) of a box. Header names stay unless `header`. */
export function clearBox(cells, sheet, box, { values = true, formats = false } = {}) {
  const out = cells.map((row) => [...row]);
  const s = cloneSheet(sheet) ?? emptySheet();
  for (let r = box.r0; r <= box.r1 && r < Math.max(out.length, box.r1 + 1); r++) {
    for (let c = box.c0; c <= box.c1; c++) {
      const key = cellKey(r, c);
      if (values) { if (out[r]) out[r][c] = null; delete s.formulas[key]; }
      if (formats) delete s.formats[key];
    }
  }
  return { cells: recalc(out, s.formulas), sheet: s };
}

/** Sets format properties on every cell of a box (null removes a property). */
export function formatBox(sheet, box, patch) {
  const s = cloneSheet(sheet) ?? emptySheet();
  for (let r = box.r0; r <= box.r1; r++) {
    for (let c = box.c0; c <= box.c1; c++) {
      const key = cellKey(r, c);
      const next = { ...(s.formats[key] ?? {}) };
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === false || v === '') delete next[k]; else next[k] = v; }
      if (Object.keys(next).length) s.formats[key] = next; else delete s.formats[key];
    }
  }
  return s;
}

/**
 * Fills from the source box over the target box (the fill handle, Ctrl+D, Ctrl+R): numbers continue their step
 * (one number repeats, 1 2 → 3 4 5), text ending in a number counts on ("Q1" → "Q2"), formulas move like a copy,
 * formats are copied. The target contains the source and extends it down, up, right or left.
 */
export function fillBox(cells, sheet, source, target) {
  let out = cells.map((row) => [...row]);
  const s = cloneSheet(sheet) ?? emptySheet();
  const down = target.r1 > source.r1 || target.r0 < source.r0;
  const lines = down ? [source.c0, source.c1] : [source.r0, source.r1];
  for (let line = lines[0]; line <= lines[1]; line++) {
    const srcIdx = down ? range(source.r0, source.r1) : range(source.c0, source.c1);
    const at = (i) => (down ? [i, line] : [line, i]);
    const seq = srcIdx.map((i) => { const [r, c] = at(i); return out[r]?.[c] ?? null; });
    const nums = seq.every((v) => typeof v === 'number');
    const step = nums && seq.length > 1 ? (seq[seq.length - 1] - seq[0]) / (seq.length - 1) : nums ? 0 : null;
    const tail = seq.length === 1 && typeof seq[0] === 'string' ? /^(.*?)(\d+)$/.exec(seq[0]) : null;
    const forward = down ? target.r1 > source.r1 : target.c1 > source.c1;
    const tIdx = down ? (forward ? range(source.r1 + 1, target.r1) : range(target.r0, source.r0 - 1).reverse()) : forward ? range(source.c1 + 1, target.c1) : range(target.c0, source.c0 - 1).reverse();
    tIdx.forEach((i, k) => {
      const n = k + 1;
      const from = forward ? srcIdx[k % srcIdx.length] : srcIdx[srcIdx.length - 1 - (k % srcIdx.length)];
      const [fr, fc] = at(from);
      const [r, c] = at(i);
      while (out.length <= r) out.push([]);
      const key = cellKey(r, c);
      const formula = s.formulas[cellKey(fr, fc)];
      if (formula && r > 0) { s.formulas[key] = shiftFormula(formula, r - fr, c - fc); out[r][c] = null; }
      else {
        delete s.formulas[key];
        if (step != null && r > 0) out[r][c] = forward ? seq[seq.length - 1] + step * n : seq[0] - step * n;
        else if (tail && r > 0) out[r][c] = `${tail[1]}${Math.max(0, Number(tail[2]) + (forward ? n : -n))}`.replace(/^(.*?)(\d+)$/, (m, a, b) => a + b.padStart(tail[2].length, '0'));
        else out[r][c] = out[fr]?.[fc] ?? null;
      }
      const f = s.formats[cellKey(fr, fc)];
      if (f) s.formats[key] = { ...f }; else delete s.formats[key];
    });
  }
  out = recalc(out, s.formulas);
  return { cells: out, sheet: s };
}

const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };

/**
 * Sorts the rows r0..r1 (sheet rows, never the header row) of columns c0..c1 by column `c`. Formulas move with
 * their rows (their relative references shift like a copy) and so do formats; empty cells go last.
 */
export function sortBox(cells, sheet, box, c, direction = 1, locale = 'ko') {
  const r0 = Math.max(1, box.r0);
  const out = cells.map((row) => [...row]);
  const s = cloneSheet(sheet) ?? emptySheet();
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const order = range(r0, box.r1).filter((r) => r < out.length);
  const key = (r) => out[r]?.[c] ?? null;
  order.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (empty(x) && empty(y)) return a - b;
    if (empty(x)) return 1;
    if (empty(y)) return -1;
    const nx = typeof x === 'number' ? x : null;
    const ny = typeof y === 'number' ? y : null;
    if (nx != null && ny != null) return direction * (nx - ny) || a - b;
    if (nx != null) return -direction;
    if (ny != null) return direction;
    return direction * collator.compare(String(x), String(y)) || a - b;
  });
  const old = { cells: order.map((r) => (out[r] ?? []).slice()), formulas: {}, formats: {} };
  for (const r of order) for (let cc = box.c0; cc <= box.c1; cc++) { const k = cellKey(r, cc); if (s.formulas[k]) old.formulas[k] = s.formulas[k]; if (s.formats[k]) old.formats[k] = s.formats[k]; delete s.formulas[k]; delete s.formats[k]; }
  order.forEach((from, i) => {
    const to = r0 + i;
    while (out.length <= to) out.push([]);
    for (let cc = box.c0; cc <= box.c1; cc++) {
      out[to][cc] = old.cells[i][cc] ?? null;
      const f = old.formulas[cellKey(from, cc)];
      if (f) s.formulas[cellKey(to, cc)] = shiftFormula(f, to - from, 0);
      const fm = old.formats[cellKey(from, cc)];
      if (fm) s.formats[cellKey(to, cc)] = fm;
    }
  });
  return { cells: recalc(out, s.formulas), sheet: s };
}

/** Cells whose text (or formula) matches; `whole` matches the whole cell, `formulas` searches formulas. */
export function findCells(cells, sheet, query, { matchCase = false, whole = false, formulas = true } = {}) {
  if (!query) return [];
  const q = matchCase ? query : query.toLowerCase();
  const hits = [];
  cells.forEach((row, r) => row.forEach((v, c) => {
    const f = formulas ? sheet?.formulas?.[cellKey(r, c)] : null;
    for (const text of [cellText(v), f].filter(Boolean)) {
      const t = matchCase ? text : text.toLowerCase();
      if (whole ? t === q : t.includes(q)) { hits.push({ r, c }); break; }
    }
  }));
  for (const key of Object.keys(sheet?.formulas ?? {})) {
    const [r, c] = splitKey(key);
    if (cells[r]?.[c] == null && !hits.some((h) => h.r === r && h.c === c)) {
      const t = matchCase ? sheet.formulas[key] : sheet.formulas[key].toLowerCase();
      if (whole ? t === q : t.includes(q)) hits.push({ r, c });
    }
  }
  return hits.sort((a, b) => a.r - b.r || a.c - b.c);
}

/** Replaces text in one cell's value or formula. Returns the new input text, or null when nothing matched. */
export function replaceIn(input, query, replacement, { matchCase = false, whole = false } = {}) {
  if (!query) return null;
  if (whole) return (matchCase ? input === query : input.toLowerCase() === query.toLowerCase()) ? replacement : null;
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
  return re.test(input) ? input.replace(re, () => replacement) : null;
}

/** Statistics of the selected cells for the status bar: count of filled cells, numbers, sum, average, min, max. */
export function boxStats(cells, box, limit = 200000) {
  let count = 0;
  let numbers = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let seen = 0;
  for (let r = box.r0; r <= box.r1 && r < cells.length; r++) {
    const row = cells[r];
    if (!row) continue;
    for (let c = box.c0; c <= box.c1 && c < row.length; c++) {
      if (++seen > limit) break;
      const v = row[c];
      if (empty(v)) continue;
      count++;
      if (typeof v === 'number' && r > 0) { numbers++; sum += v; min = Math.min(min, v); max = Math.max(max, v); }
    }
  }
  return { count, numbers, sum, average: numbers ? sum / numbers : null, min: numbers ? min : null, max: numbers ? max : null };
}

/** The extent that holds data: { rows, cols } of the sheet (header row included), formulas counted. */
export function usedSize(cells, sheet) {
  let rows = cells.length;
  let cols = Math.max(1, ...cells.map((r) => r.length));
  for (const key of Object.keys(sheet?.formulas ?? {})) { const [r, c] = splitKey(key); rows = Math.max(rows, r + 1); cols = Math.max(cols, c + 1); }
  return { rows, cols };
}

/**
 * Ctrl+arrow: from (r, c) to the edge of the data block in a direction, as in Excel — along filled cells to the
 * last filled one, or across empty cells to the next filled one (or the sheet's end).
 */
export function jumpEdge(cells, r, c, dr, dc, limits) {
  const filled = (rr, cc) => !empty(cells[rr]?.[cc]);
  const inside = (rr, cc) => rr >= 0 && cc >= 0 && rr < limits.rows && cc < limits.cols;
  let rr = r;
  let cc = c;
  if (!inside(rr + dr, cc + dc)) return { r: rr, c: cc };
  if (filled(rr, cc) && filled(rr + dr, cc + dc)) {
    while (inside(rr + dr, cc + dc) && filled(rr + dr, cc + dc)) { rr += dr; cc += dc; }
    return { r: rr, c: cc };
  }
  rr += dr; cc += dc;
  while (inside(rr, cc) && !filled(rr, cc)) {
    if (!inside(rr + dr, cc + dc)) return { r: rr, c: cc };
    rr += dr; cc += dc;
  }
  return { r: rr, c: cc };
}

