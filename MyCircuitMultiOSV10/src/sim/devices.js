// Device models for the MNA engine (see engine.js for the stamping context).
//
// Every element exposes:
//   nodes        unknown index per model pin (-1 = ground)
//   nBranch      extra unknowns it needs (branch currents); engine sets `br`
//   stamp(ctx)   add its (linearised) equations to ctx's matrix/rhs
//   pinCurrents(ctx) -> current INTO the device at each model pin (A)
//   groups       node groups it connects conductively (for floating-net checks)
//   main         model-pin index whose current is the device's headline current
// and optionally initTran(ctx, uic), accept(ctx), breakpoints(tStop).
//
// Nonlinear devices are linearised around the current Newton guess and use
// SPICE-style junction voltage limiting so exponentials cannot blow up.

export const VT = 0.02585; // thermal voltage at ~27 °C
const GMIN = 1e-12;

// exp() that continues linearly above x=80 so huge guesses stay finite.
// Returns [value, derivative].
function expl(x) {
  if (x > 80) {
    const e = Math.exp(80);
    return [e * (1 + x - 80), e];
  }
  const e = Math.exp(x);
  return [e, e];
}

// SPICE3 pnjlim: keep a junction's Newton step on the log scale once it is
// forward biased past vcrit. Sets ctx.limited so the iteration is not
// declared converged on a limited step.
function pnjlim(ctx, vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    } else {
      vnew = vt * Math.log(vnew / vt);
    }
    ctx.limited = true;
  }
  return vnew;
}

// Stamp terminal currents I[k] (into the device at node terms[k]) linearised
// in a few controlling voltages: ctrl = {p, n, v, g:[dI_k/dv]} where v is the
// value of V(p)-V(n) the currents were evaluated at.
function stampNL(ctx, terms, I, ctrls) {
  for (let k = 0; k < terms.length; k++) {
    const t = terms[k];
    if (t < 0) continue;
    let ieq = I[k];
    for (const c of ctrls) {
      const g = c.g[k];
      if (!g) continue;
      ctx.a(t, c.p, g);
      ctx.a(t, c.n, -g);
      ieq -= g * c.v;
    }
    if (ctx.mode !== "ac") ctx.rhs(t, -ieq);
  }
}

function stampG(ctx, a, b, g) {
  ctx.a(a, a, g); ctx.a(b, b, g); ctx.a(a, b, -g); ctx.a(b, a, -g);
}

// ---------------------------------------------------------------- waveforms
// Shared by V and I sources. dc = value used for the operating point.
// Pulse is left-continuous at its edges: the value AT an edge time is the value
// just before it, so a step that starts on an edge carries the jump.
export function makeWave(fields, value, parse) {
  const f = (k, d) => { const v = parse(fields[k]); return Number.isFinite(v) ? v : d; };
  const wave = String(fields.wave || "dc").toLowerCase();
  const acmag = fields.acmag != null && fields.acmag !== "" ? f("acmag", 0) : null;
  const acphase = f("acphase", 0);
  if (wave === "sine" || wave === "sin") {
    const off = f("offset", 0), amp = f("amplitude", 1), freq = f("freq", 1e3), ph = f("phase", 0);
    return {
      kind: "sine", off, amp, freq, phase: ph, acmag, acphase,
      dc: off + amp * Math.sin(ph * Math.PI / 180),
      at: (t) => off + amp * Math.sin(2 * Math.PI * freq * t + ph * Math.PI / 180),
      breakpoints: () => [],
    };
  }
  if (wave === "pulse" || wave === "square") {
    const low = f("offset", 0), high = f("amplitude", 1), per = Math.max(f("period", 1e-3), 1e-15);
    const duty = Math.min(Math.max(f("duty", 50), 0), 100) / 100;
    return {
      kind: "pulse", low, high, period: per, duty, acmag, acphase,
      dc: low,
      at: (t) => {
        if (t <= 0) return low;
        const n = t / per;
        let frac = n - Math.floor(n);
        if (frac > 1 - 1e-9 || frac < 1e-9) return low; // on a rising edge: value before it
        return frac <= duty + 1e-9 ? high : low;
      },
      breakpoints: (tStop) => {
        const out = [];
        for (let k = 0; k * per <= tStop && out.length < 1e5; k++) {
          out.push(k * per);
          if (duty > 0 && duty < 1) out.push(k * per + duty * per);
        }
        return out;
      },
    };
  }
  return { kind: "dc", dc: value, acmag, acphase, at: () => value, breakpoints: () => [] };
}

// ---------------------------------------------------------------- linear
export class Resistor {
  constructor(ref, a, b, r) {
    this.ref = ref; this.nodes = [a, b]; this.r = r; this.nBranch = 0; this.main = 0;
    this.groups = [[a, b]];
  }
  stamp(ctx) { stampG(ctx, this.nodes[0], this.nodes[1], 1 / this.r); }
  pinCurrents(ctx) {
    const i = (ctx.v(this.nodes[0]) - ctx.v(this.nodes[1])) / this.r;
    return [i, -i];
  }
}

// Potentiometer: pins 1, W, 3 → R(1-W) = total*pos, R(W-3) = total*(1-pos).
export class Pot {
  constructor(ref, a, w, b, total, pos) {
    this.ref = ref; this.nodes = [a, w, b]; this.nBranch = 0; this.main = 0;
    this.r1 = Math.max(total * pos, 1e-3);
    this.r2 = Math.max(total * (1 - pos), 1e-3);
    this.groups = [[a, w, b]];
  }
  stamp(ctx) {
    const [a, w, b] = this.nodes;
    stampG(ctx, a, w, 1 / this.r1);
    stampG(ctx, w, b, 1 / this.r2);
  }
  pinCurrents(ctx) {
    const [a, w, b] = this.nodes.map((n) => ctx.v(n));
    const i1 = (a - w) / this.r1, i2 = (w - b) / this.r2;
    return [i1, i2 - i1, -i2];
  }
}

export class Capacitor {
  constructor(ref, a, b, c) {
    this.ref = ref; this.nodes = [a, b]; this.c = c; this.nBranch = 0; this.main = 0;
    this.groups = []; // open at DC
    this.vPrev = 0; this.iPrev = 0; this.iNow = 0;
  }
  geq(ctx) { return ctx.method === "trap" ? 2 * this.c / ctx.h : this.c / ctx.h; }
  stamp(ctx) {
    const [a, b] = this.nodes;
    if (ctx.mode === "ac") {
      const y = ctx.omega * this.c;
      ctx.ai(a, a, y); ctx.ai(b, b, y); ctx.ai(a, b, -y); ctx.ai(b, a, -y);
      return;
    }
    if (ctx.mode !== "tran") return;
    // Companion model: i = G*v - Ieq.
    const g = this.geq(ctx);
    const ieq = ctx.method === "trap" ? g * this.vPrev + this.iPrev : g * this.vPrev;
    stampG(ctx, a, b, g);
    ctx.rhs(a, ieq); ctx.rhs(b, -ieq);
  }
  initTran(ctx, uic) {
    this.vPrev = uic ? 0 : ctx.v(this.nodes[0]) - ctx.v(this.nodes[1]);
    this.iPrev = 0; this.iNow = 0;
  }
  accept(ctx) {
    const v = ctx.v(this.nodes[0]) - ctx.v(this.nodes[1]);
    const g = this.geq(ctx);
    const i = ctx.method === "trap" ? g * (v - this.vPrev) - this.iPrev : g * (v - this.vPrev);
    this.vPrev = v; this.iPrev = i; this.iNow = i;
  }
  pinCurrents(ctx) {
    const i = ctx.mode === "tran" ? this.iNow : 0;
    return [i, -i];
  }
}

export class Inductor {
  constructor(ref, a, b, l) {
    this.ref = ref; this.nodes = [a, b]; this.l = l; this.nBranch = 1; this.main = 0;
    this.groups = [[a, b]];
    this.iPrev = 0; this.vPrev = 0;
  }
  stamp(ctx) {
    const [a, b] = this.nodes, br = this.br;
    ctx.a(a, br, 1); ctx.a(b, br, -1);
    ctx.a(br, a, 1); ctx.a(br, b, -1);
    if (ctx.mode === "ac") { ctx.ai(br, br, -ctx.omega * this.l); return; }
    if (ctx.mode !== "tran") return; // DC: short (V(a)-V(b) = 0)
    const trap = ctx.method === "trap";
    const req = trap ? 2 * this.l / ctx.h : this.l / ctx.h;
    ctx.a(br, br, -req);
    ctx.rhs(br, -req * this.iPrev - (trap ? this.vPrev : 0));
  }
  initTran(ctx, uic) { this.iPrev = uic ? 0 : ctx.x[this.br]; this.vPrev = 0; }
  accept(ctx) { this.iPrev = ctx.x[this.br]; this.vPrev = ctx.v(this.nodes[0]) - ctx.v(this.nodes[1]); }
  pinCurrents(ctx) { const i = ctx.x[this.br]; return [i, -i]; }
}

// ---------------------------------------------------------------- sources
// Voltage source: V(pin1) - V(pin2) = wave. Branch current flows into pin 1,
// through the source, out of pin 2 (SPICE convention: negative when the
// source delivers power).
export class VSource {
  constructor(ref, a, b, wave) {
    this.ref = ref; this.nodes = [a, b]; this.wave = wave; this.nBranch = 1; this.main = 0;
    this.groups = [[a, b]];
    this.sweep = null; // DC sweep override
  }
  value(ctx) {
    if (ctx.mode === "tran") return this.wave.at(ctx.t);
    return (this.sweep ?? this.wave.dc) * ctx.srcScale;
  }
  stamp(ctx) {
    const [a, b] = this.nodes, br = this.br;
    ctx.a(a, br, 1); ctx.a(b, br, -1);
    ctx.a(br, a, 1); ctx.a(br, b, -1);
    if (ctx.mode === "ac") {
      const m = this.acmag || 0, ph = (this.wave.acphase || 0) * Math.PI / 180;
      ctx.rhs(br, m * Math.cos(ph)); ctx.rhsi(br, m * Math.sin(ph));
      return;
    }
    ctx.rhs(br, this.value(ctx));
  }
  breakpoints(tStop) { return this.wave.breakpoints(tStop); }
  pinCurrents(ctx) { const i = ctx.x[this.br]; return [i, -i]; }
}

// Current source: pushes `value` amps OUT of pin 1 into the external circuit
// and takes it back in at pin 2 (the symbol's arrow points at pin 1).
export class ISource {
  constructor(ref, a, b, wave) {
    this.ref = ref; this.nodes = [a, b]; this.wave = wave; this.nBranch = 0; this.main = 0;
    this.groups = [];
    this.sweep = null;
  }
  value(ctx) {
    if (ctx.mode === "tran") return this.wave.at(ctx.t);
    return (this.sweep ?? this.wave.dc) * ctx.srcScale;
  }
  stamp(ctx) {
    const [a, b] = this.nodes;
    if (ctx.mode === "ac") {
      const m = this.acmag || 0, ph = (this.wave.acphase || 0) * Math.PI / 180;
      ctx.rhs(a, m * Math.cos(ph)); ctx.rhs(b, -m * Math.cos(ph));
      ctx.rhsi(a, m * Math.sin(ph)); ctx.rhsi(b, -m * Math.sin(ph));
      return;
    }
    const i = this.value(ctx);
    ctx.rhs(a, i); ctx.rhs(b, -i);
  }
  breakpoints(tStop) { return this.wave.breakpoints(tStop); }
  pinCurrents(ctx) { const i = this.value(ctx.mode === "ac" ? { ...ctx, mode: "dc" } : ctx); return [-i, i]; }
}

// ---------------------------------------------------------------- diode
// Shockley diode with optional reverse breakdown (bv, ibv) and series
// resistance rs (which needs an internal node `mid` between rs and junction).
export class Diode {
  constructor(ref, a, k, p, mid = -1) {
    this.ref = ref; this.nodes = [a, k]; this.nBranch = 0; this.main = 0;
    this.is = p.is ?? 1e-14; this.n = p.n ?? 1; this.bv = p.bv || 0; this.ibv = p.ibv ?? 1e-3;
    this.rs = mid >= 0 ? p.rs : 0;
    this.mid = mid;
    this.nvt = this.n * VT;
    this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * this.is));
    this.vd = 0;
    this.groups = [[a, k, ...(mid >= 0 ? [mid] : [])]];
  }
  junction() { return this.mid >= 0 ? this.mid : this.nodes[0]; }
  iv(v) {
    const [e, de] = expl(v / this.nvt);
    let i = this.is * (e - 1);
    let g = this.is * de / this.nvt;
    if (this.bv > 0) {
      const [eb, deb] = expl(-(v + this.bv) / this.nvt);
      i -= this.ibv * eb;
      g += this.ibv * deb / this.nvt;
    }
    return [i + GMIN * v, g + GMIN];
  }
  stamp(ctx) {
    const a = this.junction(), k = this.nodes[1];
    if (this.mid >= 0) stampG(ctx, this.nodes[0], this.mid, 1 / this.rs);
    let v = ctx.v(a) - ctx.v(k);
    if (ctx.mode !== "ac") {
      if (this.bv > 0 && v < Math.min(0, -this.bv + 10 * this.nvt)) {
        const t = pnjlim(ctx, -(v + this.bv), -(this.vd + this.bv), this.nvt, this.vcrit);
        v = -(t + this.bv);
      } else {
        v = pnjlim(ctx, v, this.vd, this.nvt, this.vcrit);
      }
      this.vd = v;
    }
    const [i, g] = this.iv(v);
    stampNL(ctx, [a, k], [i, -i], [{ p: a, n: k, v, g: [g, -g] }]);
  }
  pinCurrents(ctx) {
    const i = this.mid >= 0
      ? (ctx.v(this.nodes[0]) - ctx.v(this.mid)) / this.rs
      : this.iv(ctx.v(this.nodes[0]) - ctx.v(this.nodes[1]))[0];
    return [i, -i];
  }
}

// ---------------------------------------------------------------- BJT
// Ebers-Moll transport model. Pins C B E. pol = +1 NPN, -1 PNP.
export class BJT {
  constructor(ref, c, b, e, p, pol) {
    this.ref = ref; this.nodes = [c, b, e]; this.nBranch = 0; this.main = 0; this.pol = pol;
    this.is = p.is ?? 1e-14; this.bf = p.bf ?? 100; this.br = p.br ?? 1;
    this.vcrit = VT * Math.log(VT / (Math.SQRT2 * this.is));
    this.vbe = 0; this.vbc = 0;
    this.groups = [[c, b, e]];
  }
  // Terminal currents (into C, B, E) for NPN-normalised junction voltages.
  eval(vbe, vbc) {
    const { is, bf, br } = this;
    const [ef, def] = expl(vbe / VT);
    const [er, der] = expl(vbc / VT);
    const If = is * (ef - 1), gf = is * def / VT;
    const Ir = is * (er - 1), gr = is * der / VT;
    const ic = If - Ir - Ir / br - GMIN * vbc;
    const ib = If / bf + Ir / br + GMIN * (vbe + vbc);
    const ie = -(If - Ir) - If / bf - GMIN * vbe;
    // d/dvbe and d/dvbc of [ic, ib, ie]
    const dbe = [gf, gf / bf + GMIN, -gf - gf / bf - GMIN];
    const dbc = [-gr - gr / br - GMIN, gr / br + GMIN, gr];
    return { I: [ic, ib, ie], dbe, dbc };
  }
  stamp(ctx) {
    const [c, b, e] = this.nodes, p = this.pol;
    let vbe = p * (ctx.v(b) - ctx.v(e));
    let vbc = p * (ctx.v(b) - ctx.v(c));
    if (ctx.mode !== "ac") {
      vbe = pnjlim(ctx, vbe, this.vbe, VT, this.vcrit);
      vbc = pnjlim(ctx, vbc, this.vbc, VT, this.vcrit);
      this.vbe = vbe; this.vbc = vbc;
    }
    const r = this.eval(vbe, vbc);
    // Actual currents are pol * normalised; derivatives w.r.t. actual node
    // differences pick up pol twice, so they are unchanged.
    stampNL(ctx, this.nodes, r.I.map((i) => p * i), [
      { p: b, n: e, v: p * vbe, g: r.dbe },
      { p: b, n: c, v: p * vbc, g: r.dbc },
    ]);
  }
  pinCurrents(ctx) {
    const [c, b, e] = this.nodes, p = this.pol;
    const r = this.eval(p * (ctx.v(b) - ctx.v(e)), p * (ctx.v(b) - ctx.v(c)));
    return r.I.map((i) => p * i);
  }
}

// ---------------------------------------------------------------- MOSFET
// Square law (SPICE level 1 style), pins D G S, no body:
//   sat:    Id = k/2 (Vgs-Vt)^2 (1 + lambda Vds)
//   linear: Id = k ((Vgs-Vt) Vds - Vds^2/2) (1 + lambda Vds)
// Symmetric: for Vds < 0 drain and source swap roles. pol = +1 N, -1 P.
export class MOSFET {
  constructor(ref, d, g, s, p, pol) {
    this.ref = ref; this.nodes = [d, g, s]; this.nBranch = 0; this.main = 0; this.pol = pol;
    this.vt = Math.abs(p.vt ?? 2); this.k = p.k ?? 0.1; this.lambda = p.lambda ?? 0.01;
    this.vgs = 0; this.vds = 0;
    this.groups = [[d, s]];
  }
  // Forward-mode current and partials (vds >= 0).
  fwd(vgs, vds) {
    const vov = vgs - this.vt;
    if (vov <= 0) return [0, 0, 0];
    const cl = 1 + this.lambda * vds;
    if (vds < vov) {
      const base = this.k * (vov * vds - vds * vds / 2);
      return [base * cl, this.k * vds * cl, this.k * (vov - vds) * cl + base * this.lambda];
    }
    const base = this.k / 2 * vov * vov;
    return [base * cl, this.k * vov * cl, base * this.lambda];
  }
  // Id into drain (normalised) and partials w.r.t. vgs, vds.
  eval(vgs, vds) {
    let id, gm, gds;
    if (vds >= 0) [id, gm, gds] = this.fwd(vgs, vds);
    else {
      const [i, fg, fd] = this.fwd(vgs - vds, -vds);
      id = -i; gm = -fg; gds = fg + fd;
    }
    return [id + GMIN * vds, gm, gds + GMIN];
  }
  stamp(ctx) {
    const [d, g, s] = this.nodes, p = this.pol;
    let vgs = p * (ctx.v(g) - ctx.v(s));
    let vds = p * (ctx.v(d) - ctx.v(s));
    if (ctx.mode !== "ac") {
      // Cheap fetlim: bound how far the gate drive moves per iteration.
      const step = 2;
      if (Math.abs(vgs - this.vgs) > step && Math.max(vgs, this.vgs) > this.vt) {
        vgs = this.vgs + Math.sign(vgs - this.vgs) * step;
        ctx.limited = true;
      }
      this.vgs = vgs; this.vds = vds;
    }
    const [id, gm, gds] = this.eval(vgs, vds);
    stampNL(ctx, [d, s], [p * id, -p * id], [
      { p: g, n: s, v: p * vgs, g: [gm, -gm] },
      { p: d, n: s, v: p * vds, g: [gds, -gds] },
    ]);
  }
  pinCurrents(ctx) {
    const [d, g, s] = this.nodes, p = this.pol;
    const id = p * this.eval(p * (ctx.v(g) - ctx.v(s)), p * (ctx.v(d) - ctx.v(s)))[0];
    return [id, 0, -id];
  }
}

// ---------------------------------------------------------------- op-amp
// Pins +in, -in, out, V+, V-. Ideal VCVS whose output is squashed smoothly
// between the rails: Vout = mid + half*tanh((A*vd - mid)/half). Supplies that
// are not connected are fixed rails (rails = {pos, neg} in volts, or null).
export class OpAmp {
  constructor(ref, nodes, gain, rails) {
    this.ref = ref; this.nodes = nodes; this.gain = gain; this.rails = rails;
    this.nBranch = 1; this.main = 2;
    this.xl = 0; // last linearisation point of the tanh argument
    this.groups = [[nodes[2], -1]]; // output is driven against ground
  }
  supply(ctx, k) {
    const n = this.nodes[k];
    if (n === -2) return (k === 3 ? this.rails.pos : this.rails.neg) * ctx.srcScale;
    return ctx.v(n);
  }
  stamp(ctx) {
    const [ip, im, out, vp, vn] = this.nodes, br = this.br, A = this.gain;
    ctx.a(out, br, 1);
    ctx.a(br, out, 1);
    const vpos = this.supply(ctx, 3), vneg = this.supply(ctx, 4);
    const mid = (vpos + vneg) / 2;
    const halfRaw = (vpos - vneg) / 2;
    const half = Math.max(halfRaw, 0.01);
    let vd = ctx.v(ip) - ctx.v(im);
    let x = (A * vd - mid) / half;
    if (ctx.mode !== "ac") {
      // Like pnjlim for the tanh: from a saturated guess the slope is ~0 and
      // Newton would bounce between rails, so walk the argument in bounded steps
      // unless both points are deep in the same saturation.
      const xo = this.xl;
      const sameSat = (x > 3 && xo > 3) || (x < -3 && xo < -3);
      if (!sameSat && Math.abs(x - xo) > 2) {
        x = xo + Math.sign(x - xo) * 2;
        vd = (x * half + mid) / A;
        ctx.limited = true;
      }
      this.xl = x;
    }
    const th = Math.tanh(x), s = 1 - th * th;
    const F = mid + half * th;
    const dVd = A * s;
    const dMid = 1 - s;
    const dHalf = halfRaw > 0.01 ? th - s * x : 0;
    const dPos = 0.5 * dMid + 0.5 * dHalf, dNeg = 0.5 * dMid - 0.5 * dHalf;
    // Row: Vout - dVd*vd - dPos*vpos - dNeg*vneg = F - (same at the linearisation point)
    ctx.a(br, ip, -dVd); ctx.a(br, im, dVd);
    let rhs = F - dVd * vd;
    if (vp !== -2) { ctx.a(br, vp, -dPos); rhs -= dPos * vpos; }
    if (vn !== -2) { ctx.a(br, vn, -dNeg); rhs -= dNeg * vneg; }
    if (ctx.mode !== "ac") ctx.rhs(br, rhs);
  }
  pinCurrents(ctx) { return [0, 0, ctx.x[this.br], 0, 0]; }
}

// ---------------------------------------------------------------- regulator
// Pins IN OUT GND. An internal ideal source sets V(mid)-V(GND) to
// min(vout, Vin - dropout) (smoothed, never below 0); 0.1 Ω from mid to OUT.
// The source's current is taken from IN (a series pass element), plus a
// quiescent current from IN to GND.
const SM = 0.01;
const smin = (a, b) => { const r = Math.sqrt((a - b) ** 2 + SM * SM); return [(a + b - r) / 2, (1 + (a - b) / r) / 2, (1 - (a - b) / r) / 2]; };
const smax0 = (a) => { const r = Math.sqrt(a * a + SM * SM); return [(a + r) / 2, (1 + a / r) / 2]; };

export class Regulator {
  constructor(ref, inp, out, gnd, mid, p) {
    this.ref = ref; this.nodes = [inp, out, gnd]; this.mid = mid; this.nBranch = 1; this.main = 0;
    this.vout = p.vout ?? 5; this.dropout = p.dropout ?? 2; this.rout = p.rout ?? 0.1; this.iq = p.iq ?? 5e-3;
    this.groups = [[inp, out, gnd, mid]];
  }
  setpoint(u) {
    const [m1, , dm1] = smin(this.vout, u - this.dropout);
    const [m, dm] = smax0(m1);
    return [m, dm * dm1];
  }
  iqOf(u) {
    const t = Math.tanh(u / 0.5);
    return [this.iq * t, this.iq * (1 - t * t) / 0.5];
  }
  stamp(ctx) {
    const [inp, out, g] = this.nodes, x = this.mid, br = this.br;
    stampG(ctx, x, out, 1 / this.rout);
    ctx.a(x, br, 1); ctx.a(inp, br, -1);
    const u = ctx.v(inp) - ctx.v(g);
    const [S, dS] = this.setpoint(u);
    ctx.a(br, x, 1); ctx.a(br, g, -1);
    ctx.a(br, inp, -dS); ctx.a(br, g, dS);
    if (ctx.mode !== "ac") ctx.rhs(br, S - dS * u);
    const [iq, giq] = this.iqOf(u);
    stampNL(ctx, [inp, g], [iq, -iq], [{ p: inp, n: g, v: u, g: [giq, -giq] }]);
  }
  pinCurrents(ctx) {
    const [inp, out, g] = this.nodes;
    const ib = ctx.x[this.br];
    const iout = (ctx.v(this.mid) - ctx.v(out)) / this.rout; // leaving through OUT
    const [iq] = this.iqOf(ctx.v(inp) - ctx.v(g));
    return [-ib + iq, -iout, -iq];
  }
}
