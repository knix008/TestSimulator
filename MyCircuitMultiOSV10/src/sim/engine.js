// SPICE-like circuit simulator: Modified Nodal Analysis + Newton-Raphson.
//
// Unknown vector x = [node voltages (nodes[0..N-1]) | branch currents]. Ground
// (net "GND", "0" or "AGND") is index -1 and never appears in the matrix.
// Every Newton iteration rebuilds the dense matrix from scratch: elements
// stamp their linearisation at the current guess (devices.js), then lu.js
// solves it. Circuits are small, so simplicity wins over sparse tricks.
//
// Sign conventions (all analyses):
//   * Device currents are the current flowing INTO the device at a model pin.
//     `currents[ref]` / "I(ref)" is the current into the device's main pin:
//       R, C, L, SW, POT  pin 1 (flows 1 → 2 through the part)
//       D, LED            anode (positive when forward biased)
//       V, BATTERY        + pin, through the source to − (SPICE convention:
//                         negative while the source delivers power)
//       I                 + pin; the source pushes `value` out of + into the
//                         circuit, so this reads −value
//       NPN/PNP           collector;  NMOS/PMOS drain;  REG input pin
//       OPAMP             output pin (negative while it sources current)
//   * power[ref] = Σ V(pin)·I(into pin): positive = absorbed, negative = delivered.

import { buildNetlist } from "../core/netlist.js";
import { parseValue } from "../core/project.js";
import { getSymbol } from "../lib/symbols.js";
import { solveReal, solveComplex, SingularMatrixError } from "./lu.js";
import {
  makeWave, Resistor, Pot, Capacitor, Inductor, VSource, ISource, Diode, BJT, MOSFET, OpAmp, Regulator,
} from "./devices.js";

const GROUND_NAMES = ["GND", "0", "AGND"];
const GMIN = 1e-12;
const RELTOL = 1e-6;
const VNTOL = 1e-7;
const ABSTOL = 1e-10;

const num = (v) => (typeof v === "number" ? v : parseValue(v));

// ---------------------------------------------------------------- circuit
// Gather each simulatable part with the nets of its model pins. Shared by
// buildCircuit and toSpiceNetlist.
function collectDevices(project) {
  const sch = project.schematic || {};
  const netlist = buildNetlist({ parts: [], wires: [], junctions: [], labels: [], ...sch });
  const warnings = [];
  const errors = [];
  const netByName = new Map(netlist.nets.map((n) => [n.name, n]));
  const devices = [];
  for (const part of sch.parts || []) {
    const sym = getSymbol(part.lib);
    if (!sym) { warnings.push(`${part.ref || part.lib}: unknown symbol "${part.lib}", ignored`); continue; }
    if (sym.power || sym.flag) continue;
    if (!sym.sim) {
      // Mechanical/non-electrical parts (mounting holes, test points) are silent.
      if ((sym.pins || []).length > 1) warnings.push(`${part.ref}: ${sym.title || sym.name} has no simulation model, ignored`);
      continue;
    }
    if (part.dnp) { warnings.push(`${part.ref}: marked DNP, excluded from simulation`); continue; }
    const fields = { ...(sym.fields || {}), ...(part.fields || {}) };
    // Model params: symbol defaults, overridable by numeric part fields of the same name.
    const params = { ...(sym.sim.params || {}) };
    for (const k of Object.keys(fields)) {
      if (["wave", "state", "amplitude", "freq", "offset", "period", "duty", "acmag", "acphase", "phase", "position"].includes(k)) continue;
      const v = num(fields[k]);
      if (Number.isFinite(v)) params[k] = v;
    }
    const pins = sym.sim.pins.map((pnum) => {
      const net = netlist.pinNet.get(`${part.id}:${pnum}`) || null;
      const info = net ? netByName.get(net) : null;
      // A pin alone on an unnamed net is as good as unconnected.
      const alone = !net || (info && info.pins.length <= 1 && !info.labels.length && !info.power.length);
      return { num: pnum, net, alone };
    });
    // Op-amp supply pins left unconnected become fixed rails, not nodes.
    if (sym.sim.model === "OPAMP") for (const i of [3, 4]) if (pins[i]) pins[i].rail = pins[i].alone;
    devices.push({ part, sym, ref: part.ref || part.id, model: sym.sim.model, fields, params, pins, fixed: sym.sim.fixed });
  }
  return { netlist, devices, warnings, errors };
}

function deviceValue(dev, errors) {
  if (dev.fixed != null) return dev.fixed;
  let v = num(dev.part.value);
  if (!Number.isFinite(v)) v = num(dev.sym.value);
  if (!Number.isFinite(v)) { errors.push(`${dev.ref}: cannot read value "${dev.part.value}"`); return NaN; }
  return v;
}

function potPosition(fields) {
  let p = num(String(fields.position ?? "0.5").replace("%", ""));
  if (!Number.isFinite(p)) p = 0.5;
  if (p > 1) p /= 100;
  return Math.min(Math.max(p, 0), 1);
}

export function buildCircuit(project) {
  const { netlist, devices, warnings, errors } = collectDevices(project);
  const groundNets = new Set(netlist.nets.map((n) => n.name).filter((n) => GROUND_NAMES.includes(n)));
  const ground = groundNets.has("GND") ? "GND" : [...groundNets][0] || "GND";
  if (!groundNets.size) errors.push("No GND net: add a GND power symbol (or a net named GND / 0 / AGND) as the simulation reference");

  const nodes = [];
  const index = new Map();
  const internal = new Set();
  const nodeOf = (name) => {
    if (name == null) return -1;
    if (groundNets.has(name)) return -1;
    if (!index.has(name)) { index.set(name, nodes.length); nodes.push(name); }
    return index.get(name);
  };
  const internalNode = (name) => { const i = nodeOf(name); internal.add(name); return i; };
  // Register real nets first, in netlist order, so node order is stable.
  for (const n of netlist.nets) if (devices.some((d) => d.pins.some((p) => p.net === n.name && !p.rail))) nodeOf(n.name);

  const elements = [];
  const firstV = [];
  for (const dev of devices) {
    const { ref, model, fields, params } = dev;
    // Unconnected pins become private floating nodes (held by gmin).
    const pinNode = (i) => {
      const p = dev.pins[i];
      if (p.net) return nodeOf(p.net);
      warnings.push(`${ref}: pin ${p.num} is not connected`);
      return internalNode(`${ref}:${p.num}`);
    };
    let el = null;
    switch (model) {
      case "R": {
        let r = deviceValue(dev, errors);
        if (!Number.isFinite(r)) break;
        if (r <= 0) { warnings.push(`${ref}: resistance ${r} Ω replaced by 1 µΩ`); r = 1e-6; }
        el = new Resistor(ref, pinNode(0), pinNode(1), r);
        break;
      }
      case "POT": {
        const r = deviceValue(dev, errors);
        if (!Number.isFinite(r)) break;
        el = new Pot(ref, pinNode(0), pinNode(1), pinNode(2), Math.max(r, 1e-3), potPosition(fields));
        break;
      }
      case "C": case "L": {
        const v = deviceValue(dev, errors);
        if (!Number.isFinite(v)) break;
        if (v <= 0) { errors.push(`${ref}: ${model === "C" ? "capacitance" : "inductance"} must be positive`); break; }
        el = model === "C" ? new Capacitor(ref, pinNode(0), pinNode(1), v) : new Inductor(ref, pinNode(0), pinNode(1), v);
        break;
      }
      case "V": case "I": {
        let v = deviceValue(dev, errors);
        if (!Number.isFinite(v)) { if (String(fields.wave || "dc") === "dc") break; v = 0; }
        const wave = makeWave(fields, v, num);
        el = model === "V" ? new VSource(ref, pinNode(0), pinNode(1), wave) : new ISource(ref, pinNode(0), pinNode(1), wave);
        el.acmag = wave.acmag;
        if (model === "V") firstV.push({ el, dev });
        break;
      }
      case "SW": {
        const closed = String(fields.state || "open").toLowerCase() === "closed";
        el = new Resistor(ref, pinNode(0), pinNode(1), closed ? 0.01 : 1e9);
        el.closed = closed;
        break;
      }
      case "D": {
        const p = { ...params };
        // LEDs: a little series resistance (real parts have ~5-20 Ω) lifts the
        // ~1.77 V junction drop at 10 mA into the usual 1.8-2 V band.
        if (p.rs == null && p.led) p.rs = 10;
        const a = pinNode(0), k = pinNode(1);
        const mid = p.rs > 0 ? internalNode(`${ref}#rs`) : -1;
        el = new Diode(ref, a, k, p, mid);
        break;
      }
      case "NPN": case "PNP":
        el = new BJT(ref, pinNode(0), pinNode(1), pinNode(2), params, model === "NPN" ? 1 : -1);
        break;
      case "NMOS": case "PMOS":
        el = new MOSFET(ref, pinNode(0), pinNode(1), pinNode(2), params, model === "NMOS" ? 1 : -1);
        break;
      case "OPAMP": {
        // Supply pins left floating get fixed ±15 V rails (node marker -2).
        const sup = (i) => (dev.pins[i].rail ? -2 : pinNode(i));
        const ns = [pinNode(0), pinNode(1), pinNode(2), sup(3), sup(4)];
        el = new OpAmp(ref, ns, params.gain ?? 1e5, { pos: params.vpos ?? 15, neg: params.vneg ?? -15 });
        if (ns[3] === -2 || ns[4] === -2) warnings.push(`${ref}: supply pins not connected, using ±15 V rails`);
        break;
      }
      case "REG":
        el = new Regulator(ref, pinNode(0), pinNode(1), pinNode(2), internalNode(`${ref}#pass`), params);
        break;
      default:
        warnings.push(`${ref}: unsupported simulation model "${model}", ignored`);
    }
    if (el) { el.model = model; el.dev = dev; elements.push(el); }
  }

  // AC excitation: sources with an `acmag` field; otherwise the first V source
  // (preferring a sine/pulse signal source over a DC supply).
  if (!elements.some((e) => e.acmag)) {
    const pick = firstV.find((f) => f.el.wave.kind !== "dc") || firstV.find((f) => f.dev.part.lib === "VSOURCE") || firstV[0];
    if (pick) pick.el.acmag = 1;
  }

  // Branch unknowns follow the node voltages.
  let n = nodes.length;
  for (const el of elements) if (el.nBranch) { el.br = n; n += el.nBranch; }

  // Nets with no DC path to ground are only held by gmin: say so by name.
  const parent = new Map();
  const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const el of elements) for (const g of el.groups) for (let i = 1; i < g.length; i++) union(g[0], g[i]);
  const g0 = find(-1);
  for (let i = 0; i < nodes.length; i++) {
    if (find(i) !== g0 && !internal.has(nodes[i])) warnings.push(`Net ${nodes[i]} has no DC path to ground (floating); held at 0 V by gmin`);
  }
  if (!elements.length && !errors.length) errors.push("Nothing to simulate: no parts with simulation models");

  return { elements, nodes, ground, warnings, errors, size: n, internal, netlist };
}

// ---------------------------------------------------------------- solver core
class Ctx {
  constructor(circ, complex = false) {
    this.circ = circ;
    this.n = circ.size;
    this.N = circ.nodes.length;
    this.A = new Float64Array(this.n * this.n);
    this.b = new Float64Array(this.n);
    if (complex) { this.Ai = new Float64Array(this.n * this.n); this.bi = new Float64Array(this.n); }
    this.x = new Float64Array(this.n);
    this.mode = "dc"; this.t = 0; this.h = 0; this.method = "be"; this.srcScale = 1; this.gmin = GMIN; this.omega = 0;
    this.limited = false;
  }
  v(i) { return i < 0 ? 0 : this.x[i]; }
  a(i, j, v) { if (i >= 0 && j >= 0) this.A[i * this.n + j] += v; }
  ai(i, j, v) { if (i >= 0 && j >= 0 && this.Ai) this.Ai[i * this.n + j] += v; }
  rhs(i, v) { if (i >= 0) this.b[i] += v; }
  rhsi(i, v) { if (i >= 0 && this.bi) this.bi[i] += v; }
  assemble() {
    this.A.fill(0); this.b.fill(0);
    if (this.Ai) { this.Ai.fill(0); this.bi.fill(0); }
    this.limited = false;
    for (let i = 0; i < this.N; i++) this.A[i * this.n + i] += this.gmin;
    for (const el of this.circ.elements) el.stamp(this);
  }
}

function unknownName(circ, k) {
  if (k < circ.nodes.length) return { kind: "node", name: circ.nodes[k] };
  const el = circ.elements.find((e) => e.nBranch && k >= e.br && k < e.br + e.nBranch);
  return { kind: "branch", name: el ? el.ref : `#${k}` };
}

function singularMessage(circ, e) {
  const u = unknownName(circ, e.index);
  if (u.kind === "node") return `Singular matrix: net ${u.name} is floating or not determined by the circuit`;
  return `Singular matrix at ${u.name}: voltage sources/inductors form a loop, or its terminals are shorted/floating`;
}

// Newton-Raphson from x0. Returns {ok, x, iterations}.
function newton(ctx, x0, maxIter) {
  const { n, N } = ctx;
  let x = Float64Array.from(x0);
  for (let it = 1; it <= maxIter; it++) {
    ctx.x = x;
    ctx.assemble();
    const xn = solveReal(n, ctx.A, ctx.b);
    let conv = !ctx.limited;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(xn[i])) return { ok: false, x, iterations: it };
      if (conv) {
        const tol = RELTOL * Math.max(Math.abs(xn[i]), Math.abs(x[i])) + (i < N ? VNTOL : ABSTOL);
        if (Math.abs(xn[i] - x[i]) > tol) conv = false;
      }
    }
    x = xn;
    if (conv) { ctx.x = x; return { ok: true, x, iterations: it }; }
  }
  ctx.x = x;
  return { ok: false, x, iterations: maxIter };
}

// DC operating point with the usual fallbacks: plain Newton, then gmin
// stepping, then source stepping.
function solveOp(ctx, x0 = new Float64Array(ctx.n)) {
  ctx.mode = "dc"; ctx.srcScale = 1; ctx.gmin = GMIN;
  let total = 0;
  let r = newton(ctx, x0, 150);
  total += r.iterations;
  if (r.ok) return { ...r, iterations: total, method: "newton" };

  let x = new Float64Array(ctx.n);
  let ok = true;
  for (let g = 1e-2; g >= GMIN * 0.99; g /= 10) {
    ctx.gmin = g;
    r = newton(ctx, x, 150);
    total += r.iterations;
    if (!r.ok) { ok = false; break; }
    x = r.x;
  }
  ctx.gmin = GMIN;
  if (ok) {
    r = newton(ctx, x, 150);
    total += r.iterations;
    if (r.ok) return { ...r, iterations: total, method: "gmin stepping" };
  }

  x = new Float64Array(ctx.n);
  let scale = 0, step = 0.1;
  ctx.srcScale = 0;
  r = newton(ctx, x, 150);
  total += r.iterations;
  if (r.ok) {
    x = r.x;
    while (scale < 1) {
      const next = Math.min(1, scale + step);
      ctx.srcScale = next;
      r = newton(ctx, x, 100);
      total += r.iterations;
      if (r.ok) { x = r.x; scale = next; step = Math.min(step * 1.5, 0.25); }
      else { step /= 4; if (step < 1e-6) break; }
    }
  }
  ctx.srcScale = 1;
  if (scale >= 1 && r.ok) return { ...r, iterations: total, method: "source stepping" };
  return { ok: false, x: r.x, iterations: total };
}

// ---------------------------------------------------------------- results
function voltageMap(circ, ctx) {
  const out = {};
  for (let i = 0; i < circ.nodes.length; i++) if (!circ.internal.has(circ.nodes[i])) out[circ.nodes[i]] = ctx.x[i];
  return out;
}

function deviceReadings(circ, ctx) {
  const currents = {}, power = {}, pinCurrents = {};
  for (const el of circ.elements) {
    const ic = el.pinCurrents(ctx);
    const pc = {};
    let p = 0;
    el.dev.pins.forEach((pin, k) => {
      pc[pin.num] = ic[k];
      const node = el.nodes[k];
      const v = node === -2 ? (k === 3 ? el.rails.pos : el.rails.neg) : ctx.v(node);
      p += v * ic[k];
    });
    currents[el.ref] = ic[el.main];
    power[el.ref] = p;
    pinCurrents[el.ref] = pc;
  }
  return { currents, power, pinCurrents };
}

function time(v, fallback) {
  const t = num(v);
  return Number.isFinite(t) ? t : num(fallback);
}

// ---------------------------------------------------------------- analyses
function runOp(circ) {
  const ctx = new Ctx(circ);
  const r = solveOp(ctx);
  if (!r.ok) return { ok: false, mode: "op", errors: ["Operating point did not converge (tried Newton, gmin and source stepping)"] };
  ctx.x = r.x;
  const { currents, power, pinCurrents } = deviceReadings(circ, ctx);
  const voltages = voltageMap(circ, ctx);
  voltages[circ.ground] = 0;
  return { ok: true, mode: "op", voltages, currents, power, pinCurrents, iterations: r.iterations, method: r.method };
}

function runTran(circ, project, options) {
  const sim = project.sim || {};
  const tStop = time(options.tStop, sim.tStop ?? "10m");
  let tStep = time(options.tStep, sim.tStep ?? tStop / 1000);
  const warnings = [];
  if (!(tStop > 0)) return { ok: false, mode: "tran", errors: ["tStop must be a positive time"] };
  if (!(tStep > 0)) tStep = tStop / 1000;
  const maxPoints = options.maxPoints || 100000;
  if (tStop / tStep > maxPoints) {
    tStep = tStop / maxPoints;
    warnings.push(`tStep raised to ${tStep.toExponential(3)} s to stay within ${maxPoints} points`);
  }
  const ctx = new Ctx(circ);

  let x;
  if (options.uic) {
    // Zero initial conditions: one tiny BE step pins every capacitor at 0 V
    // (huge C/h) and every inductor at 0 A (huge L/h), giving a consistent t=0.
    for (const el of circ.elements) if (el.initTran) el.initTran(ctx, true);
    ctx.mode = "tran"; ctx.method = "be"; ctx.t = 0; ctx.h = tStep * 1e-9;
    const r = newton(ctx, new Float64Array(ctx.n), 200);
    if (!r.ok) return { ok: false, mode: "tran", errors: ["Could not find the t=0 state with zero initial conditions"] };
    x = r.x;
  } else {
    const r = solveOp(ctx);
    if (!r.ok) return { ok: false, mode: "tran", errors: ["Operating point for t=0 did not converge"] };
    x = r.x;
    ctx.x = x;
    ctx.mode = "tran";
    for (const el of circ.elements) if (el.initTran) el.initTran(ctx, false);
  }
  ctx.x = x;
  ctx.mode = "tran";

  const names = circ.nodes.filter((nm) => !circ.internal.has(nm));
  const signals = {};
  for (const nm of names) signals[`V(${nm})`] = [];
  for (const el of circ.elements) signals[`I(${el.ref})`] = [];
  const timeArr = [];
  // Precompute node indices for speed.
  const idx = names.map((nm) => circ.nodes.indexOf(nm));
  const recordFast = (t) => {
    timeArr.push(t);
    names.forEach((nm, k) => signals[`V(${nm})`].push(ctx.x[idx[k]]));
    for (const el of circ.elements) signals[`I(${el.ref})`].push(el.pinCurrents(ctx)[el.main]);
  };
  recordFast(0);

  // Targets: the output grid plus source breakpoints (pulse edges).
  const bps = new Set();
  for (const el of circ.elements) if (el.breakpoints) for (const b of el.breakpoints(tStop)) if (b > 0 && b < tStop) bps.add(b);
  const breaks = [...bps].sort((a, b) => a - b);
  let bi = 0;
  let grid = 1;
  const eps = tStep * 1e-9;
  const hMin = tStep * 1e-9;
  let h = tStep / 10;
  let t = 0;
  let forceBE = 2; // first steps use backward Euler (no trapezoidal history yet)
  let steps = 0, rejected = 0;
  while (t < tStop - eps) {
    while (bi < breaks.length && breaks[bi] <= t + eps) bi++;
    const gridT = Math.min(grid * tStep, tStop);
    const target = bi < breaks.length ? Math.min(gridT, breaks[bi]) : gridT;
    let tNew = Math.min(t + h, target);
    if (target - tNew < hMin * 10) tNew = target;
    ctx.t = tNew; ctx.h = tNew - t;
    ctx.method = forceBE > 0 || options.method === "be" ? "be" : "trap";
    const r = newton(ctx, x, 60);
    if (!r.ok) {
      rejected++;
      h = ctx.h / 4;
      forceBE = Math.max(forceBE, 1);
      ctx.x = x;
      if (h < hMin) return { ok: false, mode: "tran", errors: [`Transient analysis failed to converge at t = ${t.toExponential(4)} s`], time: timeArr, signals, warnings };
      continue;
    }
    x = r.x;
    ctx.x = x;
    for (const el of circ.elements) if (el.accept) el.accept(ctx);
    t = tNew;
    steps++;
    if (forceBE > 0) forceBE--;
    const atBreak = bi < breaks.length && Math.abs(t - breaks[bi]) <= eps;
    if (Math.abs(t - gridT) <= eps || atBreak) recordFast(t);
    if (Math.abs(t - gridT) <= eps) grid++;
    if (atBreak) { forceBE = 1; h = tStep / 20; } // the next step carries the edge
    else h = Math.min(h * 2, tStep);
  }
  return { ok: true, mode: "tran", time: timeArr, signals, steps, rejected, tStep, warnings };
}

function runDc(circ, options) {
  const el = circ.elements.find((e) => e.ref === options.source && (e instanceof VSource || e instanceof ISource));
  if (!el) return { ok: false, mode: "dc", errors: [`DC sweep source "${options.source}" is not a voltage or current source`] };
  const start = num(options.start), stop = num(options.stop);
  let step = Math.abs(num(options.step));
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return { ok: false, mode: "dc", errors: ["DC sweep needs numeric start and stop"] };
  if (!(step > 0)) step = Math.abs(stop - start) / 100 || 1;
  const count = Math.min(Math.floor(Math.abs(stop - start) / step + 1e-9) + 1, 100001);
  const dir = stop >= start ? 1 : -1;
  const ctx = new Ctx(circ);
  const names = circ.nodes.filter((nm) => !circ.internal.has(nm));
  const signals = {};
  for (const nm of names) signals[`V(${nm})`] = [];
  for (const e of circ.elements) signals[`I(${e.ref})`] = [];
  const sweep = [];
  let x = new Float64Array(ctx.n);
  const errors = [];
  try {
    for (let k = 0; k < count; k++) {
      const val = start + dir * k * step;
      el.sweep = val;
      ctx.mode = "dc"; ctx.srcScale = 1; ctx.gmin = GMIN;
      let r = newton(ctx, x, 100);
      if (!r.ok) r = solveOp(ctx, x);
      if (!r.ok) { errors.push(`DC sweep did not converge at ${options.source} = ${val}`); break; }
      x = r.x; ctx.x = x;
      sweep.push(val);
      for (const nm of names) signals[`V(${nm})`].push(x[circ.nodes.indexOf(nm)]);
      for (const e of circ.elements) signals[`I(${e.ref})`].push(e.pinCurrents(ctx)[e.main]);
    }
  } finally {
    el.sweep = null;
  }
  return { ok: !errors.length, mode: "dc", source: options.source, sweep, signals, errors };
}

function runAc(circ, project, options) {
  const sim = project.sim || {};
  const fStart = num(options.fStart ?? sim.fStart ?? 10);
  const fStop = num(options.fStop ?? sim.fStop ?? 1e6);
  const ppd = Math.max(1, Math.round(num(options.points ?? sim.points ?? 20)));
  if (!(fStart > 0) || !(fStop >= fStart)) return { ok: false, mode: "ac", errors: ["AC sweep needs 0 < fStart <= fStop"] };
  if (!circ.elements.some((e) => e.acmag)) return { ok: false, mode: "ac", errors: ["AC analysis needs a source with an acmag field (or any voltage source)"] };
  const ctx = new Ctx(circ, true);
  const op = solveOp(ctx);
  if (!op.ok) return { ok: false, mode: "ac", errors: ["Operating point for AC analysis did not converge"] };
  const xop = op.x;
  const freq = [];
  const decades = Math.log10(fStop / fStart);
  const total = Math.floor(decades * ppd + 1e-9);
  for (let k = 0; k <= total; k++) freq.push(fStart * 10 ** (k / ppd));
  if (freq[freq.length - 1] < fStop * (1 - 1e-9)) freq.push(fStop);
  const names = circ.nodes.filter((nm) => !circ.internal.has(nm));
  const signals = {};
  for (const nm of names) signals[`V(${nm})`] = { mag: [], db: [], phase: [], re: [], im: [] };
  ctx.mode = "ac";
  for (const f of freq) {
    ctx.omega = 2 * Math.PI * f;
    ctx.x = xop;
    ctx.assemble();
    const s = solveComplex(ctx.n, ctx.A, ctx.Ai, ctx.b, ctx.bi);
    for (const nm of names) {
      const i = circ.nodes.indexOf(nm);
      const re = s.re[i], im = s.im[i];
      const mag = Math.hypot(re, im);
      const sg = signals[`V(${nm})`];
      sg.mag.push(mag);
      sg.db.push(20 * Math.log10(Math.max(mag, 1e-300)));
      sg.phase.push(Math.atan2(im, re) * 180 / Math.PI);
      sg.re.push(re); sg.im.push(im);
    }
  }
  return { ok: true, mode: "ac", freq, signals };
}

// options.mode: "op" | "tran" | "dc" | "ac" (defaults to project.sim.mode).
export function simulate(project, options = {}) {
  const mode = options.mode || (project.sim && project.sim.mode) || "op";
  let circ;
  try {
    circ = buildCircuit(project);
  } catch (e) {
    return { ok: false, mode, warnings: [], errors: [`Could not build circuit: ${e.message}`] };
  }
  const warnings = [...circ.warnings];
  if (circ.errors.length) return { ok: false, mode, warnings, errors: [...circ.errors] };
  let res;
  try {
    if (mode === "op") res = runOp(circ);
    else if (mode === "tran") res = runTran(circ, project, options);
    else if (mode === "dc") res = runDc(circ, options);
    else if (mode === "ac") res = runAc(circ, project, options);
    else res = { ok: false, mode, errors: [`Unknown analysis mode "${mode}"`] };
  } catch (e) {
    if (e instanceof SingularMatrixError) res = { ok: false, mode, errors: [singularMessage(circ, e)] };
    else res = { ok: false, mode, errors: [`Simulation failed: ${e.message}`] };
  }
  res.warnings = [...warnings, ...(res.warnings || [])];
  res.errors = res.errors || [];
  return res;
}

// ---------------------------------------------------------------- SPICE export
function spiceNum(v) {
  if (!Number.isFinite(v)) return "0";
  return String(+v.toPrecision(6));
}

export function toSpiceNetlist(project) {
  const { devices, warnings } = collectDevices(project);
  const names = new Map();
  const used = new Set(["0"]);
  const node = (net, fallback) => {
    if (net == null) net = fallback;
    if (GROUND_NAMES.includes(net)) return "0";
    if (names.has(net)) return names.get(net);
    let s = String(net).replace(/[^A-Za-z0-9_+\-.]/g, "_").replace(/^[+\-.]/, "_") || "n";
    while (used.has(s)) s += "_";
    used.add(s);
    names.set(net, s);
    return s;
  };
  const elName = (prefix, ref) => {
    const r = String(ref).replace(/[^A-Za-z0-9_]/g, "_");
    return r.toUpperCase().startsWith(prefix) ? r : `${prefix}${r}`;
  };
  const lines = [`${(project.meta && project.meta.title) || "MyCircuit"} - generated by MyCircuit`];
  const models = [];
  const subckts = [];
  const errors = [];
  for (const dev of devices) {
    const { ref, model, fields, params } = dev;
    const n = dev.pins.map((p) => node(p.net, `${ref}_nc${p.num}`));
    switch (model) {
      case "R": {
        lines.push(`${elName("R", ref)} ${n[0]} ${n[1]} ${spiceNum(deviceValue(dev, errors))}`);
        break;
      }
      case "SW": {
        const closed = String(fields.state || "open").toLowerCase() === "closed";
        lines.push(`${elName("R", ref)} ${n[0]} ${n[1]} ${closed ? "0.01" : "1e9"} ; switch ${closed ? "closed" : "open"}`);
        break;
      }
      case "POT": {
        const r = deviceValue(dev, errors), pos = potPosition(fields);
        lines.push(`${elName("R", ref)}_A ${n[0]} ${n[1]} ${spiceNum(Math.max(r * pos, 1e-3))}`);
        lines.push(`${elName("R", ref)}_B ${n[1]} ${n[2]} ${spiceNum(Math.max(r * (1 - pos), 1e-3))}`);
        break;
      }
      case "C": case "L":
        lines.push(`${elName(model, ref)} ${n[0]} ${n[1]} ${spiceNum(deviceValue(dev, errors))}`);
        break;
      case "V": case "I": {
        const v = deviceValue(dev, errors);
        const w = makeWave(fields, v, num);
        let src;
        if (w.kind === "sine") src = `DC ${spiceNum(w.dc)} SIN(${spiceNum(w.off)} ${spiceNum(w.amp)} ${spiceNum(w.freq)} 0 0 ${spiceNum(w.phase)})`;
        else if (w.kind === "pulse") {
          const tr = w.period * 1e-3;
          const pw = Math.max(w.duty * w.period - tr, 0);
          src = `DC ${spiceNum(w.low)} PULSE(${spiceNum(w.low)} ${spiceNum(w.high)} 0 ${spiceNum(tr)} ${spiceNum(tr)} ${spiceNum(pw)} ${spiceNum(w.period)})`;
        } else src = `DC ${spiceNum(v)}`;
        if (w.acmag != null) src += ` AC ${spiceNum(w.acmag)} ${spiceNum(w.acphase || 0)}`;
        // Our I source pushes current out of pin 1; SPICE's flows into its first node.
        lines.push(model === "V" ? `${elName("V", ref)} ${n[0]} ${n[1]} ${src}` : `${elName("I", ref)} ${n[1]} ${n[0]} ${src}`);
        break;
      }
      case "D": {
        const m = `D_${ref}`;
        const p = { ...params };
        if (p.rs == null && p.led) p.rs = 10;
        let card = `.model ${m} D(IS=${spiceNum(p.is ?? 1e-14)} N=${spiceNum(p.n ?? 1)}`;
        if (p.rs) card += ` RS=${spiceNum(p.rs)}`;
        if (p.bv) card += ` BV=${spiceNum(p.bv)} IBV=${spiceNum(p.ibv ?? 1e-3)}`;
        models.push(card + ")");
        lines.push(`${elName("D", ref)} ${n[0]} ${n[1]} ${m}`);
        break;
      }
      case "NPN": case "PNP": {
        const m = `Q_${ref}`;
        models.push(`.model ${m} ${model}(IS=${spiceNum(params.is ?? 1e-14)} BF=${spiceNum(params.bf ?? 100)} BR=${spiceNum(params.br ?? 1)})`);
        lines.push(`${elName("Q", ref)} ${n[0]} ${n[1]} ${n[2]} ${m}`);
        break;
      }
      case "NMOS": case "PMOS": {
        const m = `M_${ref}`;
        const vt = Math.abs(params.vt ?? 2);
        models.push(`.model ${m} ${model}(LEVEL=1 VTO=${spiceNum(model === "NMOS" ? vt : -vt)} KP=${spiceNum(params.k ?? 0.1)} LAMBDA=${spiceNum(params.lambda ?? 0.01)})`);
        lines.push(`${elName("M", ref)} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${m}`);
        break;
      }
      case "OPAMP": {
        const sub = `OPAMP_${String(ref).replace(/[^A-Za-z0-9_]/g, "_")}`;
        const gain = params.gain ?? 1e5;
        const sup = [3, 4].map((i, k) => {
          if (!dev.pins[i].rail) return n[i];
          const nm = node(null, `${ref}_${k ? "vneg" : "vpos"}`);
          lines.push(`${elName("V", ref)}_${k ? "NEG" : "POS"} ${nm} 0 DC ${k ? spiceNum(params.vneg ?? -15) : spiceNum(params.vpos ?? 15)}`);
          return nm;
        });
        subckts.push(`.subckt ${sub} inp inn out vp vn`, `B1 out 0 V=max(min(${spiceNum(gain)}*(V(inp)-V(inn)), V(vp)), V(vn))`, ".ends");
        lines.push(`${elName("X", ref)} ${n[0]} ${n[1]} ${n[2]} ${sup[0]} ${sup[1]} ${sub}`);
        break;
      }
      case "REG": {
        const sub = `REG_${String(ref).replace(/[^A-Za-z0-9_]/g, "_")}`;
        const vout = params.vout ?? 5, drop = params.dropout ?? 2;
        // Pass element: B sets the output, F mirrors its current out of IN.
        subckts.push(
          `.subckt ${sub} in out gnd`,
          `B1 x gnd V=max(min(${spiceNum(vout)}, V(in,gnd)-${spiceNum(drop)}), 0)`,
          "VSNS x xo 0",
          `R1 xo out ${spiceNum(params.rout ?? 0.1)}`,
          "F1 in gnd VSNS 1",
          `IQ in gnd DC ${spiceNum(params.iq ?? 5e-3)}`,
          ".ends",
        );
        lines.push(`${elName("X", ref)} ${n[0]} ${n[1]} ${n[2]} ${sub}`);
        break;
      }
      default:
        lines.push(`* ${ref}: model ${model} not exported`);
    }
  }
  const out = [...lines];
  if (models.length) out.push("", ...models);
  if (subckts.length) out.push("", ...subckts);
  const sim = project.sim || {};
  out.push("");
  if (sim.mode === "tran") out.push(`.tran ${sim.tStep || "10u"} ${sim.tStop || "10m"}`);
  else if (sim.mode === "ac") out.push(`.ac dec ${sim.points || 20} ${sim.fStart || "10"} ${sim.fStop || "1Meg"}`);
  else if (sim.mode === "dc" && sim.dcSource) out.push(`.dc ${sim.dcSource} ${sim.dcStart ?? 0} ${sim.dcStop ?? 10} ${sim.dcStep ?? 0.1}`);
  else out.push(".op");
  for (const w of [...warnings, ...errors]) out.push(`* ${w}`);
  out.push(".end", "");
  return out.join("\n");
}
