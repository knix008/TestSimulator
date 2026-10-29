// Parameter evaluation for the simulation engine: workspace scopes (mask →
// SimulationInput variables → model workspace → base workspace), mask
// initialization, and the B object that block make() functions receive.
import { MError, isTensor, isText, toStr, prod, isChar, isString } from '../value.js';
import { Interp, Scope } from './expr/interp.js';

/** An engine error that knows the block it belongs to. */
export class SimError extends MError {
  constructor(id, message, block = null, path = '') {
    super(id, message);
    this.block = block;
    this.path = path;
  }
}
export const simErr = (id, msg, block, path) => new SimError(id.startsWith('sim:') ? id : `sim:${id}`, msg, block, path);

/** Base workspace scope (read through ctx.getVar). */
export function baseScope(ctx) {
  return new Scope((name) => {
    if (!ctx || typeof ctx.getVar !== 'function') return undefined;
    try { const v = ctx.getVar(name, 'base'); return v === null ? undefined : v; } catch { return undefined; }
  });
}

/** Model workspace scope on top of the base workspace, plus variable overrides. */
export function modelScope(model, ctx, interp, overrides = null) {
  const base = baseScope(ctx);
  const ms = new Scope(null, base);
  for (const v of model.workspace || []) {
    if (!v || !v.name) continue;
    try { ms.set(v.name, interp.evalExpr(String(v.value ?? '[]'), ms)); } catch (e) {
      throw simErr('sim:workspace:eval', `Model workspace variable '${v.name}': ${e.message}`);
    }
  }
  if (overrides && overrides.size) { const top = new Scope(null, ms); for (const [k, v] of overrides) top.set(k, v); return top; }
  return ms;
}

/** Mask scope of a masked block: its parameters evaluated in the parent scope, then the init code. */
export function maskScope(block, parent, interp, path) {
  const mask = block.mask;
  if (!mask || (!(mask.params || []).length && !mask.init)) return parent;
  const s = new Scope(null, parent);
  for (const mp of mask.params || []) {
    const raw = block.params[mp.name] ?? mp.value ?? '';
    try {
      if (mp.type === 'popup') s.set(mp.name, { cls: 'char', dims: [1, String(raw).length], re: Float64Array.from(String(raw), (c) => c.charCodeAt(0)), im: null });
      else if (mp.type === 'checkbox') s.set(mp.name, { cls: 'logical', dims: [1, 1], re: Float64Array.of(raw === 'on' || raw === '1' || raw === 'true' ? 1 : 0), im: null });
      else s.set(mp.name, interp.evalExpr(String(raw === '' ? '[]' : raw), parent));
    } catch (e) { throw simErr('sim:mask:param', `Mask parameter '${mp.name}' of '${path}': ${e.message}`, block.id, path); }
  }
  if (mask.init && String(mask.init).trim()) {
    try { interp.run(String(mask.init), s); } catch (e) { throw simErr('sim:mask:init', `Mask initialization of '${path}': ${e.message}`, block.id, path); }
  }
  return s;
}

export const isOn = (s) => { const v = String(s).trim().toLowerCase(); return v === 'on' || v === 'true' || v === '1' || v === 'yes'; };

/** Real data of a Value as Float64Array (logical/char/int accepted). */
export function valueData(v) {
  if (v == null) return new Float64Array(0);
  if (typeof v === 'number') return Float64Array.of(v);
  if (isTensor(v)) return v.re;
  if (v.sparse) { const [m, n] = v.dims; const a = new Float64Array(m * n); for (let j = 0; j < n; j++) for (let k = v.colPtr[j]; k < v.colPtr[j + 1]; k++) a[v.rowIdx[k] + j * m] = v.re[k]; return a; }
  throw new MError('sim:param:notNumeric', `Expected a numeric value, got ${v.cls}.`);
}

/**
 * The parameter accessor handed to def.make(B).
 * opts: { block, path, def, scope, interp, ctx, nIn, nOut, run, model }
 */
export function makeB(opts) {
  const { block, path, def, scope, interp } = opts;
  const cache = new Map();
  const defaults = Object.create(null);
  for (const p of def.params || []) defaults[p.name] = p.def;
  const raw = (n) => (block.params && block.params[n] != null ? String(block.params[n]) : defaults[n] != null ? defaults[n] : '');
  const fail = (n, e) => { throw simErr('sim:param:eval', `Parameter '${n}' of block '${path}': ${e.message || e}`, block.id, path); };
  const B = {
    block, path, def, scope, interp, ctx: opts.ctx, nIn: opts.nIn, nOut: opts.nOut, run: opts.run || null, model: opts.model || null,
    has: (n) => (block.params && block.params[n] != null) || defaults[n] != null,
    str: (n) => raw(n),
    opt: (n) => raw(n).trim(),
    val(n) {
      if (cache.has(n)) return cache.get(n);
      const src = raw(n).trim();
      let v;
      try { v = src === '' ? { cls: 'double', dims: [0, 0], re: new Float64Array(0), im: null } : interp.evalExpr(src, scope); } catch (e) { fail(n, e); }
      if (v === undefined) fail(n, new Error('no value'));
      cache.set(n, v);
      return v;
    },
    eval(src) { return interp.evalExpr(String(src), scope); },
    arr(n) { const v = B.val(n); try { return Float64Array.from(valueData(v)); } catch (e) { return fail(n, e); } },
    num(n, dflt) {
      const a = B.arr(n);
      if (!a.length) { if (dflt !== undefined) return dflt; fail(n, new Error('the value is empty')); }
      return a[0];
    },
    int(n, dflt) { return Math.round(B.num(n, dflt)); },
    mat(n) {
      const v = B.val(n);
      const d = v && v.dims ? v.dims : [1, 1];
      return { re: Float64Array.from(valueData(v)), m: d[0], n: prod(d) / (d[0] || 1) || 0, im: v && v.im ? Float64Array.from(v.im) : null, dims: d.slice() };
    },
    bool(n) {
      const s = raw(n).trim();
      const l = s.toLowerCase();
      if (l === 'on' || l === 'true' || l === 'yes') return true;
      if (l === 'off' || l === 'false' || l === 'no' || l === '') return false;
      try { const a = B.arr(n); return a.length > 0 && a.every((x) => x !== 0); } catch { return false; }
    },
    text(n) {
      const v = B.val(n);
      if (isChar(v) || isString(v)) return toStr(v);
      if (isText(v)) return toStr(v);
      return raw(n);
    },
    err(msg, id = 'sim:block:param') { throw simErr(id, `${path}: ${msg}`, block.id, path); },
  };
  return B;
}

export { Interp, Scope };
