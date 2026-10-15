// FreeCAD Spreadsheet: cells with numbers, text or formulas ("=A1*2", "=width/3"),
// aliases naming cells, and expressions binding object values to them
// (entity.bind = { 'params.length': 'width*2' }). No DOM.

import { evaluate, setVariables } from './expr.js';

export const SHEET_COLUMNS = 26;
export const SHEET_ROWS = 200;

const CELL = /^([A-Z])([1-9]\d{0,2})$/;
export const isCell = (name) => CELL.test(name) && Number(CELL.exec(name)[2]) <= SHEET_ROWS;
export const columnName = (i) => String.fromCharCode(65 + i);
const ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const H_ALIGN = ['left', 'center', 'right'];
export const V_ALIGN = ['top', 'middle', 'bottom'];

/** A cell's look: bold, italic, underline, horizontal and vertical alignment (only what is set). */
function normalizeStyle(raw) {
  const s = {};
  if (raw?.b) s.b = true;
  if (raw?.i) s.i = true;
  if (raw?.u) s.u = true;
  if (H_ALIGN.includes(raw?.h)) s.h = raw.h;
  if (V_ALIGN.includes(raw?.v)) s.v = raw.v;
  return s;
}

/** Column index and row number of a cell name. */
export const cellPos = (cell) => { const m = CELL.exec(cell); return m ? { col: m[1].charCodeAt(0) - 65, row: Number(m[2]) } : null; };
const nameAt = (col, row) => `${columnName(col)}${row}`;

/** The cells of the rectangle between two cells (row by row). */
export function rangeCells(a, b = a) {
  const p = cellPos(a); const q = cellPos(b);
  if (!p || !q) return [];
  const out = [];
  for (let row = Math.min(p.row, q.row); row <= Math.max(p.row, q.row); row++) for (let col = Math.min(p.col, q.col); col <= Math.max(p.col, q.col); col++) out.push(nameAt(col, row));
  return out;
}

/** The merged block a cell is in, or null. */
export const mergeOf = (sheet, cell) => (sheet.merged ?? []).find((m) => rangeCells(m.from, m.to).includes(cell)) ?? null;

/**
 * A spreadsheet read from a file: { cells: { A1: text }, aliases: { name: 'A1' },
 * styles: { A1: { b, i, u, h, v } }, merged: [{ from, to }] }.
 */
export function normalizeSpreadsheet(raw) {
  const cells = {};
  for (const [k, v] of Object.entries(raw?.cells ?? {})) if (isCell(k) && typeof v === 'string' && v.trim() !== '') cells[k] = v.slice(0, 1000);
  const aliases = {};
  for (const [k, v] of Object.entries(raw?.aliases ?? {})) if (ALIAS.test(k) && !isCell(k.toUpperCase()) && isCell(v)) aliases[k] = v;
  const styles = {};
  for (const [k, v] of Object.entries(raw?.styles ?? {})) { const s = normalizeStyle(v); if (isCell(k) && Object.keys(s).length) styles[k] = s; }
  // Merged blocks: top-left to bottom-right, more than one cell, not overlapping an earlier one.
  const merged = [];
  for (const m of Array.isArray(raw?.merged) ? raw.merged : []) {
    const p = cellPos(m?.from); const q = cellPos(m?.to);
    if (!p || !q) continue;
    const block = { from: nameAt(Math.min(p.col, q.col), Math.min(p.row, q.row)), to: nameAt(Math.max(p.col, q.col), Math.max(p.row, q.row)) };
    const list = rangeCells(block.from, block.to);
    if (list.length < 2 || merged.some((x) => rangeCells(x.from, x.to).some((c) => list.includes(c)))) continue;
    merged.push(block);
  }
  return { cells, aliases, ...(Object.keys(styles).length ? { styles } : {}), ...(merged.length ? { merged } : {}) };
}

/** Spreadsheet_StyleBold / …Italic / …Underline / Spreadsheet_Align*: a style set on cells (null clears that key). */
export function styleCells(sheet, cells, patch) {
  const styles = { ...(sheet.styles ?? {}) };
  for (const cell of cells) {
    const next = { ...(styles[cell] ?? {}) };
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === false) delete next[k]; else next[k] = v; }
    if (Object.keys(next).length) styles[cell] = next; else delete styles[cell];
  }
  return { ...sheet, styles };
}

/** Spreadsheet_MergeCells: the rectangle becomes one block (blocks it touches are split first). */
export function mergeCells(sheet, a, b) {
  const list = rangeCells(a, b);
  if (list.length < 2) return sheet;
  const kept = (sheet.merged ?? []).filter((m) => !rangeCells(m.from, m.to).some((c) => list.includes(c)));
  return { ...sheet, merged: [...kept, { from: list[0], to: list[list.length - 1] }] };
}

/** Spreadsheet_SplitCell: the block a cell is in, split back into cells. */
export function splitCell(sheet, cell) {
  const block = mergeOf(sheet, cell);
  return block ? { ...sheet, merged: sheet.merged.filter((m) => m !== block) } : sheet;
}

/** Spreadsheet_Import: CSV (comma, semicolon or tab separated; quotes) into cells from A1. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].sort((x, y) => firstLine.split(y).length - firstLine.split(x).length)[0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const cells = {};
  rows.slice(0, SHEET_ROWS).forEach((r, ri) => r.slice(0, SHEET_COLUMNS).forEach((v, ci) => { if (v.trim() !== '') cells[nameAt(ci, ri + 1)] = v.trim().slice(0, 1000); }));
  return { cells, aliases: {} };
}

/**
 * Values of every cell: number, text, or { error }. Formulas see other cells
 * (A1 …) and aliases; a cell that depends on itself is an error.
 */
export function computeSheet(sheet) {
  const values = {};
  const busy = new Set();
  const byAlias = new Map(Object.entries(sheet.aliases ?? {}).map(([name, cell]) => [name.toLowerCase(), cell]));
  const valueOf = (cell) => {
    if (cell in values) return values[cell];
    const text = sheet.cells?.[cell];
    if (text === undefined) return 0;
    if (busy.has(cell)) return { error: 'cycle' };
    busy.add(cell);
    let value;
    const raw = String(text).trim();
    if (raw.startsWith('=')) {
      // Every name the formula uses: cells and aliases, looked up as they come.
      const names = [...raw.slice(1).toLowerCase().matchAll(/[a-z_][a-z0-9_]*/g)].map((m) => m[0]);
      const vars = new Map();
      let bad = null;
      for (const name of names) {
        const target = isCell(name.toUpperCase()) ? name.toUpperCase() : byAlias.get(name);
        if (!target) continue;
        const v = valueOf(target);
        if (typeof v === 'number') vars.set(name, v);
        else bad = v?.error ?? 'text';
      }
      value = bad ? { error: bad } : withVariables(vars, () => evaluate(raw.slice(1)));
      if (typeof value === 'number' && !Number.isFinite(value)) value = { error: 'formula' };
    } else {
      const v = Number(raw.replace(/,/g, ''));
      value = raw !== '' && Number.isFinite(v) ? v : raw;
    }
    busy.delete(cell);
    values[cell] = value;
    return value;
  };
  for (const cell of Object.keys(sheet.cells ?? {})) valueOf(cell);
  return values;
}

/** Runs fn with the expression variables set to vars (then puts the old ones back). */
function withVariables(vars, fn) {
  const before = setVariables(vars);
  try { return fn(); } finally { setVariables(before); }
}

/** Names a formula elsewhere may use: every numeric cell (a1 …) and alias, lower case. */
export function sheetVariables(sheet) {
  const values = computeSheet(sheet ?? { cells: {}, aliases: {} });
  const vars = new Map();
  for (const [cell, v] of Object.entries(values)) if (typeof v === 'number') vars.set(cell.toLowerCase(), v);
  for (const [name, cell] of Object.entries(sheet?.aliases ?? {})) if (typeof values[cell] === 'number') vars.set(name.toLowerCase(), values[cell]);
  return vars;
}

/** Evaluates an expression with a sheet's names. NaN when it does not work out. */
export function evaluateWith(sheet, text) {
  return withVariables(sheetVariables(sheet), () => evaluate(text));
}

/** Bindings of an entity read from a file: { key: expression } (keys 'params.name' or a top-level number field). */
export function normalizeBind(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) if (/^(params\.)?[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string' && v.trim()) out[k] = v.slice(0, 500);
  return Object.keys(out).length ? out : null;
}

/**
 * Puts every bound value from the sheet into its object (FreeCAD recomputing
 * expressions). Returns the number of values changed. Entities are replaced by
 * new objects (views cache by object).
 */
export function applyBindings(drawing) {
  const bound = drawing.entities.filter((e) => e.bind);
  if (!bound.length) return 0;
  const vars = sheetVariables(drawing.spreadsheet);
  let changed = 0;
  drawing.entities = drawing.entities.map((e) => {
    if (!e.bind) return e;
    let next = e;
    for (const [key, expression] of Object.entries(e.bind)) {
      const value = withVariables(vars, () => evaluate(expression));
      if (!Number.isFinite(value)) continue;
      if (key.startsWith('params.')) {
        const name = key.slice(7);
        if (next.params?.[name] !== value) { next = { ...next, params: { ...next.params, [name]: value } }; changed++; }
      } else if (typeof next[key] === 'number' && next[key] !== value) { next = { ...next, [key]: value }; changed++; }
    }
    return next;
  });
  return changed;
}

/** The sheet as CSV (formulas as their values), A1 at the top left. */
export function sheetCsv(sheet) {
  const values = computeSheet(sheet);
  const cells = Object.keys(sheet.cells ?? {});
  if (!cells.length) return '';
  const rows = Math.max(...cells.map((c) => Number(CELL.exec(c)[2])));
  const cols = Math.max(...cells.map((c) => c.charCodeAt(0) - 64));
  const q = (v) => { const s = typeof v === 'object' ? '#ERR' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [];
  for (let r = 1; r <= rows; r++) lines.push(Array.from({ length: cols }, (_, c) => (values[`${columnName(c)}${r}`] !== undefined ? q(values[`${columnName(c)}${r}`]) : '')).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
