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

/** A spreadsheet read from a file: { cells: { A1: text }, aliases: { name: 'A1' } }. */
export function normalizeSpreadsheet(raw) {
  const cells = {};
  for (const [k, v] of Object.entries(raw?.cells ?? {})) if (isCell(k) && typeof v === 'string' && v.trim() !== '') cells[k] = v.slice(0, 1000);
  const aliases = {};
  for (const [k, v] of Object.entries(raw?.aliases ?? {})) if (ALIAS.test(k) && !isCell(k.toUpperCase()) && isCell(v)) aliases[k] = v;
  return { cells, aliases };
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
