// Equations, global variables, configurations and design tables (an Equations dialog,
// ConfigurationManager and Design Table). A part may have:
//   variables:      [{ name: 'W', expr: '120' }, { name: 'H', expr: 'W / 2' }]      global variables
//   feature.exprs:  { depth: 'H - 5' }                                               a feature value driven by an equation
//   constraint.expr:'W'                                                              a sketch dimension driven by an equation
//   configurations: [{ id, name, variables: { W: '80' }, suppress: { featId: true }, values: { 'featId.depth': 12 } }]
//   config:         the active configuration's id (null = the default one)
// effectiveFeatures() gives the feature list the rebuild uses: the stored one with all of that applied.
// No DOM, no kernel.
import { solveSketch } from './sketch.js';

// ───────────────────────── expressions

const FUNCS = {
  sin: (d) => Math.sin((d * Math.PI) / 180), cos: (d) => Math.cos((d * Math.PI) / 180), tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (v) => (Math.asin(v) * 180) / Math.PI, acos: (v) => (Math.acos(v) * 180) / Math.PI, atan: (v) => (Math.atan(v) * 180) / Math.PI,
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, exp: Math.exp, log: Math.log,
  // iif(condition, then, else)
  iif: (c, a, b) => (c ? a : b),
};
const CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E };

export class ExprError extends Error {
  constructor(code, detail = '') { super(`${code}${detail ? `: ${detail}` : ''}`); this.code = code; this.detail = detail; }
}

/** Tokens: numbers, names (letters, digits, _, ., @, Korean; or "quoted"), operators. */
function tokenize(text) {
  const out = [];
  const s = String(text);
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new ExprError('syntax', s.slice(i));
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (ch === '"') {
      const j = s.indexOf('"', i + 1);
      if (j < 0) throw new ExprError('syntax', 'quote');
      out.push({ t: 'name', v: s.slice(i + 1, j) }); i = j + 1; continue;
    }
    const m = /^[A-Za-z_ㄱ-힝][\w.@ㄱ-힝]*/.exec(s.slice(i));
    if (m) { out.push({ t: 'name', v: m[0] }); i += m[0].length; continue; }
    const op = /^(<=|>=|==|!=|[-+*/^(),<>])/.exec(s.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    throw new ExprError('syntax', ch);
  }
  return out;
}

/** Evaluates an expression; `lookup(name)` → number (throws ExprError('unknown') when it cannot). */
export function evaluate(text, lookup = () => { throw new ExprError('unknown'); }) {
  const tokens = tokenize(text);
  let k = 0;
  const peek = () => tokens[k];
  const eat = (v) => { if (tokens[k]?.v === v) { k++; return true; } return false; };
  const expect = (v) => { if (!eat(v)) throw new ExprError('syntax', `expected ${v}`); };
  const compare = () => {
    let a = additive();
    for (;;) {
      const t = peek();
      if (t?.t !== 'op' || !['<', '>', '<=', '>=', '==', '!='].includes(t.v)) return a;
      k++;
      const b = additive();
      a = { '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b, '==': Math.abs(a - b) < 1e-12, '!=': Math.abs(a - b) >= 1e-12 }[t.v] ? 1 : 0;
    }
  };
  const additive = () => {
    let a = term();
    for (;;) { if (eat('+')) a += term(); else if (eat('-')) a -= term(); else return a; }
  };
  const term = () => {
    let a = power();
    for (;;) {
      if (eat('*')) a *= power();
      else if (eat('/')) { const b = power(); if (b === 0) throw new ExprError('divide'); a /= b; }
      else return a;
    }
  };
  const power = () => { const a = unary(); return eat('^') ? a ** power() : a; };
  const unary = () => (eat('-') ? -unary() : eat('+') ? unary() : primary());
  const primary = () => {
    const t = tokens[k++];
    if (!t) throw new ExprError('syntax', 'end');
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') { const v = compare(); expect(')'); return v; }
    if (t.t === 'name') {
      if (eat('(')) {
        const fn = FUNCS[t.v.toLowerCase()];
        if (!fn) throw new ExprError('function', t.v);
        const args = [];
        if (!eat(')')) { do args.push(compare()); while (eat(',')); expect(')'); }
        return fn(...args);
      }
      if (t.v in CONSTS) return CONSTS[t.v];
      return lookup(t.v);
    }
    throw new ExprError('syntax', String(t.v));
  };
  const v = compare();
  if (k < tokens.length) throw new ExprError('syntax', String(tokens[k].v));
  if (!Number.isFinite(v)) throw new ExprError('value');
  return v;
}

/** Names an expression uses (for the dependency order and the "unknown name" check). */
export function namesIn(text) {
  try { return tokenize(text).filter((t, i, all) => t.t === 'name' && all[i + 1]?.v !== '(' && !(t.v in CONSTS)).map((t) => t.v); } catch { return []; }
}

// ───────────────────────── variables

/** The active configuration of a part (null = default). */
export const activeConfiguration = (part) => (part.configurations ?? []).find((c) => c.id === part.config) ?? null;

/**
 * Values of the global variables (in dependency order). Returns { values: Map name → number, errors: Map name → code }.
 * A configuration may give a variable another expression.
 */
export function variableValues(part, config = activeConfiguration(part)) {
  const defs = new Map((part.variables ?? []).map((v) => [v.name, config?.variables?.[v.name] ?? v.expr]));
  const values = new Map(); const errors = new Map();
  const visiting = new Set();
  const value = (name) => {
    if (values.has(name)) return values.get(name);
    if (!defs.has(name)) throw new ExprError('unknown', name);
    if (visiting.has(name)) throw new ExprError('cycle', name);
    visiting.add(name);
    try { const v = evaluate(defs.get(name), value); values.set(name, v); return v; } finally { visiting.delete(name); }
  };
  for (const name of defs.keys()) {
    try { value(name); } catch (error) { errors.set(name, error.code ?? 'syntax'); }
  }
  return { values, errors };
}

/** A lookup for expressions in a part: variables, then "Feature.key" (a feature's value) and "D@Sketch" dims. */
function lookupIn(part, features, values) {
  return (name) => {
    if (values.has(name)) return values.get(name);
    const dot = name.lastIndexOf('.');
    if (dot > 0) {
      const f = features.find((x) => x.name === name.slice(0, dot));
      const v = Number(f?.[name.slice(dot + 1)]);
      if (Number.isFinite(v)) return v;
    }
    const at = name.indexOf('@');
    if (at > 0) {
      const f = features.find((x) => x.name === name.slice(at + 1) && x.type === 'sketch');
      const c = f?.constraints.find((x) => x.name === name.slice(0, at));
      if (c && Number.isFinite(Number(c.value))) return Number(c.value);
    }
    throw new ExprError('unknown', name);
  };
}

// ───────────────────────── effective features

/**
 * The features as they are built: the active configuration's suppressions and values, then the equations
 * (feature.exprs and sketch dimension exprs; a sketch whose dimensions change is solved again). The stored
 * part is not changed. Problems go to part._equationErrors (a list the app shows).
 */
export function effectiveFeatures(part) {
  const config = activeConfiguration(part);
  const hasWork = config || part.variables?.length || part.features.some((f) => f.exprs || (f.type === 'sketch' && f.constraints?.some((c) => c.expr)));
  if (!hasWork) return part.features;
  const features = JSON.parse(JSON.stringify(part.features));
  const errors = [];
  if (config) {
    for (const f of features) {
      if (config.suppress && f.id in config.suppress) f.suppressed = Boolean(config.suppress[f.id]);
      for (const [key, v] of Object.entries(config.values ?? {})) {
        const [id, field] = key.split('.');
        if (id === f.id && field) f[field] = v;
      }
    }
  }
  const { values, errors: varErrors } = variableValues(part, config);
  for (const [name, code] of varErrors) errors.push({ where: name, code });
  const lookup = lookupIn(part, features, values);
  for (const f of features) {
    for (const [key, expr] of Object.entries(f.exprs ?? {})) {
      try { f[key] = evaluate(expr, lookup); } catch (error) { errors.push({ where: `${f.name}.${key}`, code: error.code ?? 'syntax' }); }
    }
    if (f.type === 'sketch' && f.constraints?.some((c) => c.expr)) {
      let changed = false;
      for (const c of f.constraints) {
        if (!c.expr) continue;
        try { const v = evaluate(c.expr, lookup); if (Math.abs(v - Number(c.value)) > 1e-12) { c.value = v; changed = true; } } catch (error) { errors.push({ where: `${c.name ?? c.id}@${f.name}`, code: error.code ?? 'syntax' }); }
      }
      if (changed) solveSketch(f);
    }
  }
  Object.defineProperty(features, 'errors', { value: errors, enumerable: false });
  return features;
}

/** Every equation of the part, for the Equations list: [{ kind: 'variable'|'feature'|'dimension', target, expr, value, error }]. */
export function equationRows(part) {
  const rows = [];
  const { values, errors } = variableValues(part);
  for (const v of part.variables ?? []) rows.push({ kind: 'variable', target: v.name, expr: v.expr, value: values.get(v.name) ?? null, error: errors.get(v.name) ?? null });
  const eff = effectiveFeatures(part);
  const failed = new Map((eff.errors ?? []).map((e) => [e.where, e.code]));
  for (const f of part.features) {
    for (const [key, expr] of Object.entries(f.exprs ?? {})) {
      const e = eff.find((x) => x.id === f.id);
      rows.push({ kind: 'feature', target: `${f.name}.${key}`, id: f.id, key, expr, value: e?.[key] ?? null, error: failed.get(`${f.name}.${key}`) ?? null });
    }
    if (f.type === 'sketch') for (const c of f.constraints ?? []) if (c.expr) rows.push({ kind: 'dimension', target: `${c.name ?? c.id}@${f.name}`, id: f.id, cid: c.id, expr: c.expr, value: eff.find((x) => x.id === f.id)?.constraints.find((k) => k.id === c.id)?.value ?? null, error: failed.get(`${c.name ?? c.id}@${f.name}`) ?? null });
  }
  return rows;
}

/** A free name for a new variable ("D1", "D2" …). */
export function nextVariableName(part, base = 'D') {
  const taken = new Set((part.variables ?? []).map((v) => v.name));
  let i = 1;
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

// ───────────────────────── configurations

let cn = 0;
export const newConfigId = () => `cfg${Date.now().toString(36).slice(-5)}${(cn++).toString(36)}`;

/** Adds a configuration copying the active one (or the default). Returns it. */
export function addConfiguration(part, name) {
  part.configurations ??= [];
  const from = activeConfiguration(part);
  const c = { id: newConfigId(), name: name || `Config${part.configurations.length + 2}`, variables: { ...(from?.variables ?? {}) }, suppress: { ...(from?.suppress ?? {}) }, values: { ...(from?.values ?? {}) } };
  part.configurations.push(c);
  return c;
}

/** In a configuration, a feature's suppression (configurations keep their own; the default changes the feature). */
export function setSuppressedIn(part, featureId, value) {
  const c = activeConfiguration(part);
  if (!c) { const f = part.features.find((x) => x.id === featureId); if (f) f.suppressed = value; return; }
  c.suppress ??= {};
  c.suppress[featureId] = value;
}

// ───────────────────────── design table (CSV)

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * The design table as CSV: one row per configuration (the default first), a column per global variable and
 * a "$STATE@Feature" column per feature suppressed in any configuration (S = suppressed, U = unsuppressed).
 */
export function designTableCsv(part, defaultName = 'Default') {
  const vars = (part.variables ?? []).map((v) => v.name);
  const configs = part.configurations ?? [];
  const states = part.features.filter((f) => f.suppressed || configs.some((c) => c.suppress && f.id in c.suppress));
  const head = ['Configuration', ...vars, ...states.map((f) => `$STATE@${f.name}`)];
  const row = (name, c) => [name, ...vars.map((n) => c?.variables?.[n] ?? part.variables.find((v) => v.name === n).expr), ...states.map((f) => ((c?.suppress && f.id in c.suppress ? c.suppress[f.id] : f.suppressed) ? 'S' : 'U'))];
  return [head, row(defaultName, null), ...configs.map((c) => row(c.name, c))].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Reads a design table: the first data row sets the default values, the others become configurations
 * (matched by name, made when missing). Unknown variable columns become new variables. Returns { configs, variables }.
 */
export function applyDesignTable(part, text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ExprError('table-empty');
  const [head, ...data] = rows;
  part.variables ??= [];
  part.configurations ??= [];
  const cols = head.slice(1).map((h) => h.trim());
  for (const name of cols) if (!name.startsWith('$') && !part.variables.some((v) => v.name === name)) part.variables.push({ name, expr: '0' });
  const featureOf = (col) => part.features.find((f) => f.name === col.replace(/^\$STATE@/i, ''));
  let made = 0;
  data.forEach((r, i) => {
    const name = r[0].trim() || `Config${i + 1}`;
    let c = null;
    if (i > 0) {
      c = part.configurations.find((x) => x.name === name);
      if (!c) { c = { id: newConfigId(), name, variables: {}, suppress: {}, values: {} }; part.configurations.push(c); made++; }
    }
    cols.forEach((col, j) => {
      const v = (r[j + 1] ?? '').trim();
      if (!v) return;
      if (col.startsWith('$')) {
        const f = featureOf(col);
        if (!f) return;
        const sup = /^s/i.test(v);
        if (c) c.suppress[f.id] = sup; else f.suppressed = sup;
      } else if (c) c.variables[col] = v;
      else part.variables.find((x) => x.name === col).expr = v;
    });
  });
  return { configs: data.length - 1, made, variables: cols.filter((x) => !x.startsWith('$')).length };
}
