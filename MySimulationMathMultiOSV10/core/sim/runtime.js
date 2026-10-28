// Simulation run of a compiled program: initialisation (width trial pass),
// major / minor time steps, conditional execution groups, algebraic-loop
// Newton iterations, fixed- and variable-step integration with zero-crossing
// location (Hermite interpolation + Illinois) and breakpoints, logging, GUI
// streaming (sim.scope / sim.values / sim.status) and workspace results.
import { tensor, struct, str, num, object, MError } from '../value.js';
import { makeSolver, pickSolver, luFactor, luSolve } from './solvers.js';
import { simErr, makeB } from './params.js';
import { tsText } from './compile.js';
import { connections } from './model.js';

const Z1 = Float64Array.of(0);
const EMPTY = new Float64Array(0);
const gcdF = (a, b) => { a = Math.abs(a); b = Math.abs(b); for (let i = 0; i < 64 && b > 1e-9 * a; i++) { const r = a % b; a = b; b = r < 1e-9 * a || a - r < 1e-9 * a ? 0 : r; } return a; };
const colV = (arr) => tensor('double', [arr.length, 1], Float64Array.from(arr));

export class Run {
  /** opts: { post(msg), name, writeWorkspace, onDiagnostic(d) } */
  constructor(prog, ctx, opts = {}) {
    this.prog = prog; this.ctx = ctx; this.opts = opts;
    this.name = opts.name || prog.model.name;
    this.post = opts.post || null;
    this.nodes = prog.nodes;
    this.interp = prog.interp;
    this.state = 'idle';
    this.diags = [];
    this.stopReq = null;
    this.error = null;
  }

  // ------------------------------------------------------------ settings
  setting(key, dflt) {
    const s = String(this.prog.model.settings[key] ?? '').trim();
    if (s === '' || s === 'auto') return dflt;
    let v;
    try { v = this.interp.evalExpr(s, this.prog.scope); } catch (e) { throw simErr('sim:settings', `Model setting '${key}' = '${s}': ${e.message}`); }
    const x = v && v.re && v.re.length ? v.re[0] : NaN;
    if (Number.isNaN(x)) throw simErr('sim:settings', `Model setting '${key}' must be a number (got '${s}').`);
    return x;
  }
  flag(key) { const v = String(this.prog.model.settings[key] ?? 'off').toLowerCase(); return v === 'on' || v === 'true' || v === '1'; }

  diag(level, message, block = null) {
    const d = { level, message, block };
    this.diags.push(d);
    if (this.opts.onDiagnostic) this.opts.onDiagnostic(d);
  }
  warn(message, block = null) { this.diag('warning', message, block); }
  info(message, block = null) { this.diag('info', message, block); }
  requestStop(message = '', block = null) { if (!this.stopReq) this.stopReq = { message, block }; }
  assertFail(message, block = null) {
    if (this.flag('stopOnAssert')) throw simErr('sim:assertion', message || 'Assertion failed.', block);
    this.warn(message || 'Assertion failed.', block);
  }

  // ------------------------------------------------------------ init
  init() {
    const st = this.prog.model.settings;
    this.tStart = this.setting('startTime', 0);
    this.tStop = this.setting('stopTime', 10);
    if (!(this.tStop >= this.tStart)) throw simErr('sim:settings', `The stop time (${this.tStop}) must not be less than the start time (${this.tStart}).`);
    this.S = { t: this.tStart, minor: false, major: true, run: this, stamps: null, h: 0, trial: false };
    this.dstore = new Map();
    for (const [k, v] of this.prog.stores) this.dstore.set(k, Float64Array.from(v.init.length ? v.init : [0]));
    for (const d of this.prog.diagnostics) this.diag(d.level, d.message, d.block);
    this.stepNo = 0; this.execCount = 0; this.initPass = true; this.trial = false; this.inIter = false;
    this.flat = [];
    const flatten = (plan) => { for (const s of plan) { if (s.kind === 'node') this.flat.push(s.node); else if (s.kind === 'loop') this.flat.push(...s.nodes); } };
    flatten(this.prog.plan);
    this.allocStates();
    for (const n of this.nodes) this.resetNode(n);
    // width trial: run the outputs once, resize width-following states, repeat
    this.trial = true; this.S.trial = true;
    for (let pass = 0; pass < 4; pass++) {
      this.Xe.set(this.x);
      this.execPlan(this.prog.plan, true);
      let changed = false;
      for (const n of this.nodes) {
        if (!n.rt.widthFromInput || !n.nIn) continue;
        const u = this.gather(n)[0];
        const w = u && !u.bus ? u.length : 1;
        if (w !== n.nx && typeof n.rt.setWidth === 'function') { n.rt.setWidth(w); changed = true; }
      }
      if (!changed) break;
      this.allocStates();
      for (const n of this.nodes) this.resetNode(n);
    }
    this.widths = this.portInfo();
    this.trial = false; this.S.trial = false;
    this.allocStates();
    for (const n of this.nodes) this.resetNode(n);
    for (const n of this.nodes) for (let g = n.group; g; g = g.parent) { g.active = !(g.kinds.has('enable') || g.kinds.has('action') || g.kinds.has('trigger')); g.prev = {}; g.stamp = -1; g.fired = false; }

    // solver and steps
    const nx = this.x.length;
    const sol = pickSolver(st, nx);
    if (sol.unknown) this.warn(`Unknown solver '${sol.unknown}'; using ${sol.name}.`);
    this.solverName = sol.name;
    this.fixed = sol.fixed;
    this.solver = nx && sol.name !== 'discrete' ? makeSolver(sol.name, nx) : (nx ? makeSolver(this.fixed ? 'ode3' : 'ode45', nx) : null);
    if (nx && sol.name === 'discrete') { this.warn('The model has continuous states; the discrete solver cannot be used. Using ' + this.solver.name + '.'); this.solverName = this.solver.name; }
    this.hasCont = this.nodes.some((n) => n.kind === 'cont');
    const span = this.tStop - this.tStart;
    const finite = Number.isFinite(span);
    this.maxStep = this.setting('maxStep', finite ? (span > 0 ? span / 50 : 0.2) : 0.2);
    if (!(this.maxStep > 0)) this.maxStep = finite && span > 0 ? span / 50 : 0.2;
    const rates = this.prog.rates;
    let base = 0;
    for (const r of rates) { base = base ? gcdF(base, r[0]) : r[0]; if (r[1]) base = gcdF(base, r[1]); }
    this.baseRate = base;
    if (this.fixed) {
      let h = this.setting('fixedStep', 0);
      if (!(h > 0)) {
        const def = finite && span > 0 ? span / 50 : 0.2;
        if (base > 0) h = (nx || this.hasCont) && def < base ? base / Math.ceil(base / def - 1e-9) : base;
        else h = def;
      }
      for (const r of rates) {
        const q = r[0] / h, qo = (r[1] || 0) / h;
        if (Math.abs(q - Math.round(q)) > 1e-6 * Math.max(1, q) || Math.abs(qo - Math.round(qo)) > 1e-6 * Math.max(1, qo)) throw simErr('sim:fixedStep', `The sample time ${r[0]} is not an integer multiple of the fixed step size ${h}.`);
      }
      this.h = h;
    }
    this.tol = { rel: this.setting('relTol', 1e-3), abs: this.setting('absTol', 1e-6) };
    this.minStep = this.setting('minStep', 0);
    this.hNext = this.setting('initialStep', 0);
    this.zcOn = this.flag('zeroCross') && !this.fixed;
    this.maxZc = this.setting('maxConsecutiveZc', 1000);
    this.zcNodes = this.nodes.filter((n) => typeof n.rt.zc === 'function' && n.kind === 'cont');
    this.zcGroups = this.prog.groups.filter((g) => (g.kinds.has('enable') || g.kinds.has('trigger') || g.kinds.has('action')));
    this.nZ = 0;
    // logging
    this.dec = Math.max(1, Math.round(this.setting('decimation', 1)));
    this.limit = this.flag('limitPoints') ? Math.max(1, Math.round(this.setting('maxPoints', 1000))) : 0;
    this.tout = []; this.yout = []; this.xout = []; this.logs = this.prog.logged.map(() => []);
    this.lineKeys = [];
    for (const info of this.prog.infos) for (const c of connections(info.sys)) {
      const key = `${c.src.block}:${c.src.port}`;
      if (this.lineKeys.some((k) => k.key === key)) continue;
      let s = null; try { s = this.prog.resolveSource(c.src.block, c.src.port); } catch { s = null; }
      if (s) this.lineKeys.push({ key, s });
    }
    this.t = this.tStart;
    this.k = 0;
    this.zcCount = 0;
    this.done = false;
    this.wallStart = Date.now();
    this.state = 'ready';
    return this;
  }

  allocStates() {
    let off = 0;
    for (const n of this.nodes) {
      const x0 = typeof n.rt.x0 === 'function' ? n.rt.x0() : new Float64Array(n.rt.nx || 0);
      n.x0 = Float64Array.from(x0);
      n.nx = n.x0.length; n.xOff = off; off += n.nx;
    }
    this.x = new Float64Array(off);
    this.Xe = new Float64Array(off);
    this.DXe = new Float64Array(off);
    for (const n of this.nodes) {
      this.x.set(n.x0, n.xOff);
      n.xv = n.nx ? this.Xe.subarray(n.xOff, n.xOff + n.nx) : EMPTY;
      n.dxv = n.nx ? this.DXe.subarray(n.xOff, n.xOff + n.nx) : EMPTY;
    }
    this.Xe.set(this.x);
  }
  resetNode(n) {
    if (typeof n.rt.init === 'function') n.rt.init(this.S);
    n.y = typeof n.rt.y0 === 'function' ? n.rt.y0() : Array.from({ length: n.nOut }, () => Z1);
    if (n.nx) { this.x.set(n.x0, n.xOff); }
  }

  portInfo() {
    const ports = {};
    const add = (key, s) => { const nd = this.nodes[s.n]; const y = nd.y[s.p]; ports[key] = { width: y && !y.bus ? y.length : y && y.bus ? (y.signals || []).length : 1, ts: tsText(nd.ts), bus: !!(y && y.bus) }; };
    for (const info of this.prog.infos) for (const c of connections(info.sys)) {
      const key = `${c.src.block}:${c.src.port}`;
      if (ports[key]) continue;
      let s = null; try { s = this.prog.resolveSource(c.src.block, c.src.port); } catch { s = null; }
      if (s) add(key, s);
    }
    return ports;
  }
  compiledInfo() { return { ports: this.widths || {}, blocks: this.prog.info.blocks }; }

  // ------------------------------------------------------------ execution helpers
  gather(n) {
    const u = n.u, src = n.inSrc, nodes = this.nodes;
    for (let k = 0; k < src.length; k++) { const s = src[k]; u[k] = s ? (nodes[s.n].y[s.p] || Z1) : Z1; }
    return u;
  }
  ctrlValue(s) { return s ? (this.nodes[s.n].y[s.p] || Z1) : Z1; }
  hit(n, major) {
    if (this.trial || this.inIter) return true;
    if (!major) return n.kind === 'cont';
    switch (n.kind) {
      case 'cont': return true;
      case 'disc': return this.hits[n.rateIdx];
      case 'const': return this.initPass;
      default: { for (let g = n.group; g; g = g.parent) if (g.kinds.has('trigger') && g.fired) return true; return false; }
    }
  }
  active(g, major) {
    for (; g; g = g.parent) if (!this.groupOn(g, major)) return false;
    return true;
  }
  groupOn(g, major) {
    if (this.trial) return true;
    if (!major || g.stamp === this.stepNo) return g.kinds.has('trigger') && !major ? false : g.active;
    g.stamp = this.stepNo;
    const was = g.active;
    let on = true;
    if (g.kinds.has('enable')) on = this.ctrlValue(g.ctrl.enable).some((v) => v > 0);
    if (g.kinds.has('action')) on = on && this.ctrlValue(g.ctrl.action).some((v) => v > 0);
    if (g.kinds.has('trigger')) {
      const v = this.ctrlValue(g.ctrl.trigger);
      const cur = v.length ? v[0] : 0, prev = g.prev.trig;
      let fire = false;
      if (prev !== undefined) {
        const rise = (prev < 0 && cur >= 0) || (prev === 0 && cur > 0);
        const fall = (prev > 0 && cur <= 0) || (prev === 0 && cur < 0);
        const tt = String(g.trigType || 'rising').toLowerCase();
        fire = tt === 'falling' ? fall : tt === 'either' ? rise || fall : rise;
      }
      g.prev.trig = cur;
      g.fired = on && fire;
      on = g.fired;
    }
    if (on && !was && g.statesReset && !g.kinds.has('trigger')) for (const m of g.members) { this.resetNode(m); if (m.nx) m.xv.set(m.x0); }
    if (!on && was && !g.kinds.has('trigger')) for (const m of g.members) if (m.role === 'outport' && typeof m.rt.disable === 'function') { const y = m.rt.disable(); if (y) m.y = y; }
    g.active = on;
    return on;
  }
  callOutput(n) {
    const S = this.S;
    const u = this.gather(n);
    if (n.rt.wantStamps) S.stamps = n.inSrc.map((s) => (s ? this.nodes[s.n].stamp : -1));
    if (n.rt.output) {
      let y;
      try { y = n.rt.output(S, u, n.xv); } catch (e) { throw this.blockError(n, e); }
      if (y) n.y = y;
    }
    n.stamp = ++this.execCount;
  }
  blockError(n, e) {
    if (e && e.block) return e;
    const err = simErr(e && e.identifier && String(e.identifier).startsWith('sim:') ? e.identifier : 'sim:runtime', `${n.path}: ${e && e.message ? e.message : e}`, n.id, n.path);
    return err;
  }
  execPlan(plan, major) {
    for (let i = 0; i < plan.length; i++) {
      const s = plan[i];
      if (s.kind === 'node') { const n = s.node; if ((n.group === null || this.active(n.group, major)) && this.hit(n, major)) this.callOutput(n); }
      else if (s.kind === 'loop') this.execLoop(s, major);
      else if (major || this.trial) this.execIter(s);
    }
  }
  execIter(s) {
    const g = s.group;
    if (!this.active(g.parent, true)) return;
    const it = g.iter;
    if (!it) return;
    const S = this.S;
    if (!this.trial && typeof it.rt.resetEachStep === 'function' && it.rt.resetEachStep()) for (const m of s.nodes) if (m !== it) { this.resetNode(m); if (m.nx) m.xv.set(m.x0); }
    const max = this.trial ? 1 : Math.max(0, Math.round(it.rt.count ? it.rt.count(S, this.gather(it)) : 1));
    const order = [];
    const fl = (plan) => { for (const p of plan) { if (p.kind === 'node') order.push(p.node); else if (p.kind === 'loop') order.push(...p.nodes); else fl(p.plan); } };
    fl(s.plan);
    this.inIter = true;
    try {
      for (let i = 1; i <= max; i++) {
        if (it.rt.setIndex) it.rt.setIndex(i);
        this.execPlan(s.plan, true);
        if (!this.trial) for (const m of order) if (m.rt.update) m.rt.update(S, this.gather(m), m.xv);
        if (it.rt.cond && !it.rt.cond(S, this.gather(it))) break;
        if (i % 1000 === 0 && this.ctx && this.ctx.checkInterrupt) this.ctx.checkInterrupt();
      }
    } finally { this.inIter = false; }
  }
  execLoop(s, major) {
    const nodes = s.nodes;
    const run = nodes.filter((n) => (n.group === null || this.active(n.group, major)) && this.hit(n, major));
    if (!run.length) return;
    if (this.trial) { for (const n of run) this.callOutput(n); for (const n of run) this.callOutput(n); return; }
    const cut = s.cut;
    const widths = cut.map((c) => { const y = this.nodes[c.n].y[c.p]; return y && !y.bus ? y.length : 1; });
    const m = widths.reduce((a, b) => a + b, 0);
    let z = new Float64Array(m);
    let o = 0;
    cut.forEach((c, i) => { const y = this.nodes[c.n].y[c.p]; for (let k = 0; k < widths[i]; k++) z[o + k] = y && y.length > k ? y[k] : 0; o += widths[i]; });
    const G = (zz) => {
      let q = 0;
      cut.forEach((c, i) => { const nd = this.nodes[c.n]; const ys = nd.y.slice(); ys[c.p] = zz.slice(q, q + widths[i]); nd.y = ys; q += widths[i]; });
      for (const n of run) this.callOutput(n);
      const r = new Float64Array(m);
      q = 0;
      cut.forEach((c, i) => { const y = this.nodes[c.n].y[c.p]; for (let k = 0; k < widths[i]; k++) r[q + k] = (y && y.length > k ? y[k] : 0) - zz[q + k]; q += widths[i]; });
      return r;
    };
    const J = new Float64Array(m * m), piv = new Int32Array(m);
    let ok = false;
    for (let it = 0; it < 60; it++) {
      const r = G(z);
      let nr = 0, nz = 0;
      for (let i = 0; i < m; i++) { nr = Math.max(nr, Math.abs(r[i])); nz = Math.max(nz, Math.abs(z[i])); }
      if (!(nr === nr)) break;
      if (nr <= 1e-12 * (1 + nz)) { ok = true; break; }
      for (let j = 0; j < m; j++) {
        const d = 1e-7 * Math.max(1, Math.abs(z[j]));
        const zz = Float64Array.from(z); zz[j] += d;
        const rj = G(zz);
        for (let i = 0; i < m; i++) J[i + j * m] = (rj[i] - r[i]) / d;
      }
      if (!luFactor(J, m, piv)) break;
      const dz = Float64Array.from(r, (v) => -v);
      luSolve(J, m, piv, dz);
      for (let i = 0; i < m; i++) z[i] += dz[i];
    }
    G(z);
    if (!ok && !this.loopWarned) { this.loopWarned = true; this.warn(`The algebraic loop at '${nodes[0].path}' did not converge at t = ${this.S.t}.`, nodes[0].id); }
  }
  updates() {
    const S = this.S;
    for (const n of this.flat) {
      if (!n.rt.update) continue;
      if ((n.group === null || this.active(n.group, true)) && this.hit(n, true)) {
        try { n.rt.update(S, this.gather(n), n.xv); } catch (e) { throw this.blockError(n, e); }
      }
    }
  }
  computeHits(t) {
    const rates = this.prog.rates;
    this.hits = rates.map((r) => {
      const q = (t - r[1]) / r[0];
      return t >= r[1] - 1e-12 * Math.max(1, Math.abs(t)) && Math.abs(q - Math.round(q)) <= 1e-9 * Math.max(1, Math.abs(q));
    });
  }
  nextBreak(t) {
    let tb = this.tStop;
    const eps = 1e-12 * Math.max(1, Math.abs(t));
    for (const r of this.prog.rates) {
      let k = Math.floor((t - r[1]) / r[0] + 1e-9) + 1;
      let tk = r[1] + k * r[0];
      if (tk <= t + eps) tk = r[1] + (k + 1) * r[0];
      if (tk < r[1]) tk = r[1];
      if (tk < tb) tb = tk;
    }
    this.bpSource = false;
    for (const n of this.nodes) {
      if (typeof n.rt.nextHit !== 'function') continue;
      const th = n.rt.nextHit(t);
      if (th > t + eps && th < tb - eps) { tb = th; this.bpSource = true; }
      else if (th > t + eps && Math.abs(th - tb) <= eps) this.bpSource = true;
    }
    return tb;
  }

  // ------------------------------------------------------------ derivative function (minor steps)
  f(t, xs, dx) {
    const S = this.S;
    S.t = this.bpLeft != null && t >= this.bpLeft ? this.bpLeft : t;
    S.minor = true; S.major = false;
    this.Xe.set(xs);
    this.execPlan(this.prog.plan, false);
    for (const n of this.nodes) {
      if (!n.nx) continue;
      if (n.rt.deriv && (n.group === null || this.active(n.group, false))) {
        try { n.rt.deriv(S, this.gather(n), n.xv, n.dxv); } catch (e) { throw this.blockError(n, e); }
      } else n.dxv.fill(0);
    }
    dx.set(this.DXe);
  }
  zcValues(out) {
    const S = this.S;
    const vals = [];
    for (const n of this.zcNodes) {
      if (n.group !== null && !this.active(n.group, false)) { const k = n.zcLen || 0; for (let i = 0; i < k; i++) vals.push(n.zcLast ? n.zcLast[i] : 1); continue; }
      const z = n.rt.zc(S, this.gather(n), n.xv) || [];
      n.zcLen = z.length; n.zcLast = z;
      for (let i = 0; i < z.length; i++) vals.push(z[i]);
    }
    for (const g of this.zcGroups) {
      const k = g.kinds.has('trigger') ? 'trigger' : g.kinds.has('enable') ? 'enable' : 'action';
      const s = g.ctrl[k];
      if (!s || this.nodes[s.n].kind !== 'cont') { vals.push(1); continue; }
      const v = this.ctrlValue(s);
      vals.push(v.length ? v[0] : 0);
    }
    if (out && out.length === vals.length) { out.set(vals); return out; }
    return Float64Array.from(vals);
  }

  // ------------------------------------------------------------ major step
  /** One major time step; returns false when the simulation has finished. */
  step() {
    if (this.done) return false;
    const S = this.S;
    const t = this.t;
    this.stepNo++; this.tOut = t;
    S.t = t; S.minor = false; S.major = true;
    this.computeHits(t);
    this.Xe.set(this.x);
    this.execPlan(this.prog.plan, true);
    this.log(t);
    this.updates();
    this.x.set(this.Xe);
    this.initPass = false;
    if (this.constDirty) this.constDirty = false;
    this.k++;
    if (this.stopReq) { this.done = true; if (this.stopReq.message) this.info(this.stopReq.message, this.stopReq.block); return false; }
    const tiny = 1e-12 * Math.max(1, Math.abs(this.tStop));
    if (t >= this.tStop - tiny) { this.done = true; return false; }
    this.advance(t);
    return true;
  }
  advance(t) {
    const nx = this.x.length;
    if (this.fixed) {
      let tn = this.tStart + this.k * this.h;
      if (tn <= t) tn = t + this.h;
      if (tn > this.tStop - 1e-12 * Math.max(1, Math.abs(this.tStop))) tn = this.tStop;
      if (nx) {
        this.bpLeft = null;
        const xn = new Float64Array(nx);
        this.solver.step((tt, xx, dd) => this.f(tt, xx, dd), t, this.x, tn - t, xn, null, this.tol);
        this.x.set(xn);
      }
      this.t = tn;
      return;
    }
    const tb = this.nextBreak(t);
    if (!nx) {
      let tn = this.hasCont ? Math.min(t + this.maxStep, tb) : tb;
      if (tn > tb - 1e-12 * Math.max(1, Math.abs(tb))) tn = tb;
      if (this.zcOn && this.hasCont && (this.zcNodes.length || this.zcGroups.length)) {
        // no states: locate zero crossings on time alone
        const e = new Float64Array(0);
        const g = (tau) => { this.bpLeft = tau === tb && this.bpSource ? tb - 1e-10 * Math.max(1, Math.abs(tb)) : null; this.f(tau, e, e); return this.zcValues(); };
        const z0 = g(t), z1 = g(tn);
        let best = tn;
        for (let i = 0; i < Math.min(z0.length, z1.length); i++) {
          if (!((z0[i] > 0 && z1[i] < 0) || (z0[i] < 0 && z1[i] > 0))) continue;
          let a = t, b = tn, fa = z0[i], fb = z1[i], side = 0;
          for (let it = 0; it < 80 && b - a > 64 * 2.2e-16 * Math.max(1, Math.abs(b)); it++) {
            let c = (a * fb - b * fa) / (fb - fa);
            if (!(c > a && c < b)) c = 0.5 * (a + b);
            const fc = g(c)[i];
            if ((fc > 0 && fb > 0) || (fc < 0 && fb < 0) || fc === 0) { b = c; fb = fc; if (side === 1) fa /= 2; side = 1; if (fc === 0) break; }
            else { a = c; fa = fc; if (side === -1) fb /= 2; side = -1; }
          }
          if (b < best) best = b;
        }
        this.bpLeft = null;
        if (best < tn) {
          if (best - t < 1e-10 * Math.max(1, Math.abs(t))) { if (++this.zcCount > this.maxZc) throw simErr('sim:solver:zeroCrossings', `Too many consecutive zero crossings at t = ${t}.`); }
          else this.zcCount = 0;
          tn = best;
        }
      }
      this.t = tn;
      return;
    }
    this.integrate(t, tb);
  }
  integrate(t, tb) {
    const nx = this.x.length;
    const f = (tt, xx, dd) => this.f(tt, xx, dd);
    const x0 = Float64Array.from(this.x);
    const k0 = new Float64Array(nx), k1 = new Float64Array(nx), xn = new Float64Array(nx);
    this.bpLeft = null;
    f(t, x0, k0);
    const z0 = this.zcOn ? this.zcValues() : null;
    let h = this.hNext;
    if (!(h > 0)) {
      // initial step from the derivative size (Hairer & Wanner style)
      let d0 = 0, d1 = 0;
      for (let i = 0; i < nx; i++) { const sc = this.tol.abs + this.tol.rel * Math.abs(x0[i]); d0 = Math.max(d0, Math.abs(x0[i]) / sc); d1 = Math.max(d1, Math.abs(k0[i]) / sc); }
      h = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * d0 / d1;
      h = Math.min(h, this.maxStep, Math.max(tb - t, 1e-12));
      h = Math.max(h, 1e-9 * Math.max(1, Math.abs(t)));
    }
    h = Math.min(h, this.maxStep);
    const minH = Math.max(this.minStep, 16 * 2.2e-16 * Math.max(1, Math.abs(t)));
    let info, land = false;
    for (let tries = 0; ; tries++) {
      land = false;
      if (t + h >= tb - 1e-10 * Math.max(1, Math.abs(tb)) - 0.01 * h) { h = tb - t; land = true; }
      this.bpLeft = land && this.bpSource ? tb - 1e-10 * Math.max(1, Math.abs(tb)) : null;
      info = this.solver.step(f, t, x0, h, xn, k0, this.tol);
      if (info.err <= 1) break;
      if (h <= minH || tries > 200) {
        if (this.minStep > 0 && h <= this.minStep) { this.warn(`Error tolerance not met with the minimum step size ${this.minStep} at t = ${t}.`); break; }
        throw simErr('sim:solver:stepTooSmall', `The solver could not reduce the step size below ${h} at t = ${t} (the model may be singular or have a discontinuity that is not located).`);
      }
      h = Math.max(minH, h * Math.max(0.1, 0.9 * info.err ** (-1 / ((this.solver.order || 4) + 1))));
    }
    const q = (this.solver.order || 4) + 1;
    let hNext = info.hNext != null ? info.hNext : h * Math.min(5, Math.max(0.2, info.err > 0 ? 0.9 * info.err ** (-1 / q) : 5));
    let tn = land ? tb : t + h;
    this.bpLeft = land && this.bpSource ? tb - 1e-10 * Math.max(1, Math.abs(tb)) : null;
    if (this.zcOn && z0 && z0.length) {
      f(tn, xn, k1);
      const z1 = this.zcValues();
      const idx = [];
      for (let i = 0; i < Math.min(z0.length, z1.length); i++) if ((z0[i] > 0 && z1[i] < 0) || (z0[i] < 0 && z1[i] > 0)) idx.push(i);
      if (idx.length) {
        const hh = tn - t;
        const herm = (tau, out) => {
          const th = (tau - t) / hh, t2 = th * th, t3 = t2 * th;
          const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + th, c = -2 * t3 + 3 * t2, d = t3 - t2;
          for (let i = 0; i < nx; i++) out[i] = a * x0[i] + b * hh * k0[i] + c * xn[i] + d * hh * k1[i];
          return out;
        };
        const xt = new Float64Array(nx), dd = new Float64Array(nx);
        const g = (tau) => { herm(tau, xt); f(tau, xt, dd); return this.zcValues(); };
        let best = tn;
        for (const i of idx) {
          let a = t, b = tn, fa = z0[i], fb = z1[i], side = 0;
          for (let it = 0; it < 80 && b - a > 64 * 2.2e-16 * Math.max(1, Math.abs(b)); it++) {
            let c = (a * fb - b * fa) / (fb - fa);
            if (!(c > a && c < b)) c = 0.5 * (a + b);
            const fc = g(c)[i];
            if ((fc > 0 && fb > 0) || (fc < 0 && fb < 0) || fc === 0) { b = c; fb = fc; if (side === 1) fa /= 2; side = 1; if (fc === 0) break; }
            else { a = c; fa = fc; if (side === -1) fb /= 2; side = -1; }
          }
          if (b < best) best = b;
        }
        if (best < tn) {
          tn = best;
          herm(tn, xn);
          this.bpLeft = null;
          hNext = Math.min(hNext, Math.max(h, 1e-6));
          if (++this.zcCount > this.maxZc && best - t < 1e-10 * Math.max(1, Math.abs(t))) {
            throw simErr('sim:solver:zeroCrossings', `Too many consecutive zero crossings at t = ${t}.`);
          }
        }
        if (best - t > 1e-10 * Math.max(1, Math.abs(t))) this.zcCount = 0;
      }
    }
    this.bpLeft = null;
    this.hNext = Math.min(Math.max(hNext, minH), this.maxStep);
    this.t = tn;
    this.x.set(xn);
  }

  // ------------------------------------------------------------ logging
  log(t) {
    const S = this.S;
    const keep = (this.k % this.dec) === 0;
    if (keep) {
      this.tout.push(t);
      if (this.prog.rootOut.length) {
        const row = [];
        for (const n of this.prog.rootOut) { const y = n.y[0] || Z1; for (let i = 0; i < y.length; i++) row.push(y[i]); }
        this.yout.push(row);
      }
      if (this.flag('saveState') && this.x.length) this.xout.push(Array.from(this.x));
      this.prog.logged.forEach((l, i) => { const y = this.nodes[l.src.n].y[l.src.p]; this.logs[i].push(y && !y.bus ? Array.from(y) : [0]); });
    }
    for (const n of this.flat) {
      if (!n.rt.log) continue;
      if ((n.group === null || this.active(n.group, true)) && this.hit(n, true)) {
        try { n.rt.log(S, this.gather(n)); } catch (e) { throw this.blockError(n, e); }
      }
    }
    for (const s of this.prog.plan) if (s.kind === 'iter') for (const n of s.nodes) if (n.rt.log && this.active(n.group, true)) n.rt.log(S, this.gather(n));
  }

  // ------------------------------------------------------------ GUI streaming
  scopeMessages(reset = false) {
    const out = [];
    for (const n of this.nodes) {
      if (typeof n.rt.take !== 'function') continue;
      const d = n.rt.take();
      if (!d || (!d.t.length && !reset && !n.sentOnce)) continue;
      out.push({ type: 'sim.scope', name: this.name, block: n.id, reset: !n.sentOnce, t: d.t, series: d.series });
      n.sentOnce = true;
    }
    return out;
  }
  valuesMessage() {
    const values = {};
    for (const { key, s } of this.lineKeys) { const y = this.nodes[s.n].y[s.p]; if (y && !y.bus) values[key] = Array.from(y.length > 16 ? y.subarray(0, 16) : y); }
    const displays = {};
    for (const n of this.nodes) if (n.role === 'display') { const y = n.rt.last || n.u[0]; if (y && !y.bus) displays[n.id] = Array.from(y.length > 64 ? y.subarray(0, 64) : y); }
    return { type: 'sim.values', name: this.name, values, displays };
  }
  status(state, message) {
    const span = this.tStop - this.tStart;
    const progress = Number.isFinite(span) && span > 0 ? Math.min(1, ((this.tOut ?? this.t) - this.tStart) / span) : (state === 'stopped' ? 1 : 0);
    const m = { type: 'sim.status', name: this.name, state, time: this.tOut ?? this.t, start: this.tStart, stop: Number.isFinite(this.tStop) ? this.tStop : 'inf', progress, elapsed: (Date.now() - (this.wallStart || Date.now())) / 1000 };
    if (message) m.message = message;
    return m;
  }

  // ------------------------------------------------------------ tuning
  tune(blockId, params) {
    const n = this.nodes.find((x) => x.id === blockId);
    const prog = this.prog;
    if (!n) {
      // a block that is not a node (e.g. a Goto or a masked subsystem): just store the values
      return false;
    }
    Object.assign(n.block.params, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
    const B = makeB({ block: n.block, path: n.path, def: n.def, scope: n.info.scope, interp: this.interp, ctx: this.ctx, nIn: n.nIn, nOut: n.nOut, model: prog.model });
    B.held = n.B.held; B.root = n.B.root;
    if (typeof n.rt.tune === 'function') { n.rt.tune(B); }
    else {
      const rt = n.def.make(B) || {};
      const nx = typeof rt.x0 === 'function' ? rt.x0().length : (rt.nx || 0);
      if (nx !== n.nx) throw simErr('sim:tune:states', `${n.path}: this change alters the number of states and cannot be made while the simulation runs.`, n.id);
      if (rt.widthFromInput && rt.setWidth && n.nx) rt.setWidth(n.nx);
      n.rt = rt;
      if (typeof rt.init === 'function') rt.init(this.S);
    }
    n.B = B;
    if (n.kind === 'const' || this.nodes.some((m) => m.kind === 'const')) this.recomputeConst();
    return true;
  }
  recomputeConst() {
    const was = this.initPass;
    this.initPass = true;
    const saveHits = this.hits;
    this.hits = (this.prog.rates || []).map(() => false);
    const S = this.S; const st = { t: S.t, minor: S.minor, major: S.major };
    S.major = true; S.minor = false;
    for (const n of this.flat) if (n.kind === 'const' && (n.group === null || this.active(n.group, true))) this.callOutput(n);
    Object.assign(S, st);
    this.hits = saveHits;
    this.initPass = was;
  }

  // ------------------------------------------------------------ results
  finish() {
    if (this.finished) return this.result;
    this.finished = true;
    for (const n of this.nodes) if (typeof n.rt.term === 'function') { try { n.rt.term(this.S); } catch { /* ignore */ } }
    const st = this.prog.model.settings;
    const props = Object.create(null);
    let tout = this.tout, yout = this.yout, xout = this.xout, logs = this.logs;
    if (this.limit && tout.length > this.limit) {
      const d = tout.length - this.limit;
      tout = tout.slice(d); yout = yout.slice(d); xout = xout.slice(d); logs = logs.map((l) => l.slice(d));
    }
    const matrix = (rows, w) => { const N = rows.length; const a = new Float64Array(N * w); for (let i = 0; i < N; i++) for (let j = 0; j < w; j++) a[i + j * N] = rows[i][j] ?? 0; return tensor('double', [N, w], a); };
    if (this.flag('saveTime')) props[String(st.timeName || 'tout')] = colV(tout);
    if (this.flag('saveOutput') && this.prog.rootOut.length) props[String(st.outputName || 'yout')] = matrix(yout, yout.length ? yout[0].length : this.prog.rootOut.length);
    if (this.flag('saveState') && this.x.length) props[String(st.stateName || 'xout')] = matrix(xout, this.x.length);
    if (this.flag('signalLogging') && this.prog.logged.length) {
      const rec = Object.create(null);
      this.prog.logged.forEach((l, i) => {
        const w = logs[i].length ? logs[i][0].length : 1;
        rec[l.name] = struct([1, 1], ['Name', 'Time', 'Data'], [Object.assign(Object.create(null), { Name: str(l.name), Time: colV(tout), Data: matrix(logs[i], w) })]);
      });
      props[String(st.logName || 'logsout')] = struct([1, 1], Object.keys(rec), [rec]);
    }
    for (const n of this.nodes) {
      if (typeof n.rt.result !== 'function') continue;
      for (const r of n.rt.result() || []) if (r && r.name) props[r.name] = r.value;
    }
    const meta = Object.assign(Object.create(null), {
      ModelName: str(this.name), StartTime: num(this.tStart), StopTime: num(this.t), Solver: str(this.solverName || ''),
      StepCount: num(this.k), ExecutionTime: num((Date.now() - this.wallStart) / 1000),
    });
    props.SimulationMetadata = struct([1, 1], Object.keys(meta), [meta]);
    props.ErrorMessage = str(this.error ? this.error.message : '');
    this.result = object('SimulationOutput', props);
    return this.result;
  }
  /** Writes the results to the base workspace (as after a run from the editor). */
  writeWorkspace(ctx = this.ctx) {
    const out = this.finish();
    const st = this.prog.model.settings;
    if (!ctx || typeof ctx.setVar !== 'function') return out;
    if (this.flag('singleOutput')) ctx.setVar(String(st.singleOutputName || 'out'), out, 'base');
    else for (const [k, v] of Object.entries(out.props)) if (k !== 'SimulationMetadata' && k !== 'ErrorMessage') ctx.setVar(k, v, 'base');
    return out;
  }

  /** Runs to the end (M-language sim). */
  runSync() {
    if (this.state !== 'ready') this.init();
    this.state = 'running';
    let i = 0;
    while (this.step()) { if (++i % 200 === 0 && this.ctx && this.ctx.checkInterrupt) this.ctx.checkInterrupt(); }
    this.state = 'stopped';
    return this.finish();
  }
  /** Runs major steps for about `ms` milliseconds; returns true while not finished. */
  runFor(ms, pacing = 0) {
    const t0 = Date.now();
    let i = 0;
    for (;;) {
      if (pacing > 0) { const allowed = this.tStart + ((Date.now() - this.wallStart) / 1000) * pacing; if (this.t > allowed) return !this.done; }
      if (!this.step()) return false;
      if ((++i & 15) === 0 && Date.now() - t0 >= ms) return true;
    }
  }
}

export { MError };
