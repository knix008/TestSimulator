// Mould cooling (no DOM): cooling channels in the mould steel and the cycle-averaged mould wall temperature over the
// part, the cooling time it gives each place of the part, and the coolant side of each circuit.
//
// The model is the cycle-averaged steady conduction of mould cooling analysis, solved by superposition in the steel
// (taken as unbounded, conductivity k):
//   the part     each cavity node gives up its heat per cycle Qᵢ = mᵢ (cp (T_melt − T_eject) + latent heat) as a
//                mean power Pᵢ = Qᵢ / t_cycle, a point source P/(4πk r) (its own wall: a heated disc, P/(2πk a))
//   channels     every channel segment takes heat q′ₛ (W/m) along its length, a line sink whose field is the
//                closed-form integral of 1/(4πk r) along the segment
//   unknowns     q′ₛ for each segment and the far-field temperature T∞, from: at each segment's wall the steel
//                temperature equals the coolant's there plus the film drop q′ₛ / (h πd), and the heat taken by
//                the channels equals the heat the part gives (balance)
//   coolant      its temperature rises along the circuit by the heat taken so far / (ṁ cp); the film coefficient h
//                from Nu = 3.66 (laminar), Gnielinski (turbulent) blended between Re 2300 and 3000; the pressure
//                drop from the friction factor (64/Re, Petukhov) and 1.2 velocity heads per 90° of each bend
// Results per node: the mould wall temperature and the cooling time to the ejection temperature with that wall,
// t = h² / (π² α) · ln(8/π² · (T_melt − T_wall) / (T_eject − T_wall)) (Infinity where the wall is not below eject).
// Units: geometry mm, temperatures °C, flow L/min, power W, pressure kPa.

const PI = Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Mould steels: conductivity W/(m·K). */
export const MOULD_STEELS = { p20: { k: 29 }, h13: { k: 24.6 }, s136: { k: 16 }, alu7075: { k: 130 }, cube: { k: 130 }, becu: { k: 105 } };

/** Coolants: density kg/m³, specific heat J/(kg·K), conductivity W/(m·K), viscosity Pa·s at T °C. */
export const COOLANTS = {
  water: { rho: 998, cp: 4182, k: 0.6, mu: (T) => 2.414e-5 * 10 ** (247.8 / (T + 133.15)) },
  glycol: { rho: 1070, cp: 3300, k: 0.4, mu: (T) => 0.0045 * Math.exp(-0.025 * (T - 20)) },
  oil: { rho: 870, cp: 1900, k: 0.13, mu: (T) => 0.03 * Math.exp(-0.03 * (T - 20)) },
};

/** Latent heat of crystallisation J/kg released between melt and ejection (semi-crystalline families). */
export const LATENT = { pp: 1.0e5, hdpe: 1.4e5, pom: 1.5e5, pa66: 1.0e5, pbt: 6.0e4 };

/** The coolant side of a channel: velocity, Reynolds and Prandtl numbers, regime and film coefficient. */
export function coolantFlow({ coolant = 'water', diameter = 10, flow = 10, temperature = 25 }) {
  const c = COOLANTS[coolant] ?? COOLANTS.water;
  const d = diameter / 1000, Q = flow / 60000;           // m, m³/s
  const A = (PI * d * d) / 4, v = Q / A, mu = c.mu(temperature);
  const Re = (c.rho * v * d) / mu, Pr = (mu * c.cp) / c.k;
  const turb = (R) => { const f = (0.79 * Math.log(R) - 1.64) ** -2; return ((f / 8) * (R - 1000) * Pr) / (1 + 12.7 * Math.sqrt(f / 8) * (Pr ** (2 / 3) - 1)); };
  const Nu = Re <= 2300 ? 3.66 : Re >= 3000 ? turb(Re) : 3.66 + ((Re - 2300) / 700) * (turb(3000) - 3.66);
  const fric = Re <= 2300 ? 64 / Math.max(Re, 1e-9) : (0.79 * Math.log(Re) - 1.64) ** -2;
  return { v, Re, Pr, Nu, h: (Nu * c.k) / d, mdot: c.rho * Q, cp: c.cp, rho: c.rho, mu, friction: fric, regime: Re < 2300 ? 'laminar' : Re < 10000 ? 'transitional' : 'turbulent' };
}

/** The pressure drop of a channel (kPa): friction over its length f·L/d and the losses of its bends, times ρv²/2. */
export function channelPressureDrop(points, flow, diameter) {
  let L = 0, K = 0;
  for (let i = 1; i < points.length; i++) L += len(sub(points[i], points[i - 1])) / 1000;
  for (let i = 1; i < points.length - 1; i++) {
    const a = sub(points[i], points[i - 1]), b = sub(points[i + 1], points[i]);
    const c = dot(a, b) / Math.max(1e-12, len(a) * len(b));
    const ang = Math.acos(Math.max(-1, Math.min(1, c))) * (180 / PI);
    if (ang > 1) K += 1.2 * (ang / 90);
  }
  const head = 0.5 * flow.rho * flow.v * flow.v;
  return { length: L * 1000, bends: K, dp: ((flow.friction * L) / (diameter / 1000) + K) * head / 1000 };
}

/**
 * ∫ over the segment a–b of 1/|x − y| dl (mm⁻¹·mm = dimensionless): asinh form; `rMin` keeps the perpendicular
 * distance from going under the channel radius (the field at the channel's own wall).
 */
export function segmentIntegral(x, a, b, rMin = 0) {
  const e = sub(b, a), L = len(e);
  if (L < 1e-12) return 0;
  const u = e.map((v) => v / L);
  const w = sub(x, a), s = dot(w, u);
  const perp = Math.max(rMin, Math.sqrt(Math.max(0, dot(w, w) - s * s)));
  return Math.asinh((L - s) / perp) + Math.asinh(s / perp);
}

/** A channel polyline cut into segments no longer than `maxLen` (mm): [{ a, b, mid, L, channel }]. */
function segmentsOf(channels, maxLen) {
  const out = [];
  channels.forEach((ch, ci) => {
    for (let i = 1; i < ch.points.length; i++) {
      const p = ch.points[i - 1], q = ch.points[i], d = sub(q, p), L = len(d);
      const n = Math.max(1, Math.ceil(L / maxLen));
      for (let k = 0; k < n; k++) {
        const a = p.map((v, j) => v + (d[j] * k) / n), b = p.map((v, j) => v + (d[j] * (k + 1)) / n);
        out.push({ a, b, mid: a.map((v, j) => (v + b[j]) / 2), L: L / n, channel: ci });
      }
    }
  });
  return out;
}

/** Dense Gaussian elimination with partial pivoting (the system is small: segments + 1). */
function solveDense(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const piv = A[c][c]; if (Math.abs(piv) < 1e-300) throw Object.assign(new Error('singular'), { code: 'cooling-singular' });
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / piv; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}

/**
 * Sources clustered on a grid so the field at many points is quick: a cluster far from the point acts at its
 * centroid; the clusters around the point are summed node by node.
 */
function clusterField(pos, P, cell) {
  const key = (p) => p.map((v) => Math.floor(v / cell));
  const cells = new Map();
  for (let i = 0; i < P.length; i++) {
    const k = key(pos[i]); const s = k.join(',');
    let c = cells.get(s); if (!c) { c = { k, P: 0, c: [0, 0, 0], nodes: [] }; cells.set(s, c); }
    c.P += P[i]; for (let j = 0; j < 3; j++) c.c[j] += P[i] * pos[i][j]; c.nodes.push(i);
  }
  for (const c of cells.values()) for (let j = 0; j < 3; j++) c.c[j] = c.P > 0 ? c.c[j] / c.P : (c.k[j] + 0.5) * cell;
  const list = [...cells.values()];
  /** Σ Pⱼ / rⱼ (W/mm) at x, leaving out node `self` (its own term is added by the caller). */
  return (x, self = -1, rMin = 0.5) => {
    const kx = key(x); let s = 0;
    for (const c of list) {
      if (Math.abs(c.k[0] - kx[0]) <= 1 && Math.abs(c.k[1] - kx[1]) <= 1 && Math.abs(c.k[2] - kx[2]) <= 1) {
        for (const i of c.nodes) if (i !== self) s += P[i] / Math.max(rMin, len(sub(x, pos[i])));
      } else s += c.P / Math.max(rMin, len(sub(x, c.c)));
    }
    return s;
  };
}

/**
 * The cooling of a part in its mould. domain: the flow study's cavity graph (nodes { c, V, h }); resin: the study's
 * resin (rhoSolid, cp, k, melt, eject, family); channels: [{ points: [[x, y, z]…] mm, diameter mm, flow L/min,
 * inlet °C, coolant }]; options: cycleTime s, melt °C, steel, ambient-free.
 */
export function coolingStudy(domain, resin, channels, { cycleTime = 30, melt = null, eject = null, steel = 'p20', maxSegment = null } = {}) {
  const nodes = domain.nodes;
  if (!nodes.length) return { ok: false, error: 'cooling-no-part' };
  const live = channels.filter((c) => Array.isArray(c.points) && c.points.length >= 2 && c.diameter > 0 && c.flow > 0);
  if (!live.length) return { ok: false, error: 'cooling-no-channel' };
  const k = (MOULD_STEELS[steel] ?? MOULD_STEELS.p20).k / 1000;      // W/(mm·K)
  const Tm = melt ?? resin.melt, Te = eject ?? resin.eject;
  const rho = (resin.rhoSolid ?? 1000) * 1e-9;                          // kg/mm³
  const latent = LATENT[resin.family] ?? 0;
  const tc = Math.max(1, cycleTime);
  const P = nodes.map((n) => (n.V * rho * ((resin.cp ?? 2000) * (Tm - Te) + latent)) / tc);
  const pos = nodes.map((n) => n.c);
  const heatPart = P.reduce((s, v) => s + v, 0);
  // Channel segments about three diameters long (finer near the part is not needed: the field is smooth there).
  const dMax = Math.max(...live.map((c) => c.diameter));
  const segs = segmentsOf(live, maxSegment ?? Math.max(3 * dMax, 6));
  const flows = live.map((c) => ({ ...coolantFlow({ coolant: c.coolant, diameter: c.diameter, flow: c.flow, temperature: c.inlet ?? 25 }), d: c.diameter / 1000 }));
  const lo = [0, 1, 2].map((j) => Math.min(...pos.map((p) => p[j]))), hi = [0, 1, 2].map((j) => Math.max(...pos.map((p) => p[j])));
  const cell = Math.max(domain.cell ?? 1, Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 20);
  const field = clusterField(pos, P, cell);
  const S = segs.length, N = S + 1;
  const A = Array.from({ length: N }, () => new Float64Array(N)); const b = new Float64Array(N);
  const g = 1 / (4 * PI * k);
  // Segment wall equations: T∞ + g ΣP/r − g Σ q′ₜ ∫1/r − (T_in + heat before / (ṁ cp)) − q′ₛ/(h π d) = 0.
  for (let s = 0; s < S; s++) {
    const sg = segs[s], ch = live[sg.channel], fl = flows[sg.channel], r = ch.diameter / 2;
    A[s][S] = 1;
    for (let q = 0; q < S; q++) A[s][q] -= g * segmentIntegral(sg.mid, segs[q].a, segs[q].b, q === s ? r : r);
    A[s][s] -= 1 / (fl.h / 1e6 * PI * ch.diameter);                     // film: q′ (W/mm) / (h W/(mm²K) · πd mm)
    // Coolant temperature at the segment's middle: the heat taken upstream in the same channel, and half its own.
    for (let q = 0; q < s; q++) if (segs[q].channel === sg.channel) A[s][q] -= segs[q].L / (fl.mdot * fl.cp);
    A[s][s] -= (0.5 * sg.L) / (fl.mdot * fl.cp);
    b[s] = (ch.inlet ?? 25) - g * field(sg.mid, -1, r);
  }
  // Balance: Σ q′ₛ Lₛ = Σ P.
  for (let s = 0; s < S; s++) A[S][s] = segs[s].L;
  b[S] = heatPart;
  const x = solveDense(A.map((row) => Array.from(row)), Array.from(b));
  const qs = x.slice(0, S), Tinf = x[S];
  // The wall temperature at every node: its neighbours' heat, its own heated disc, the channels' sinks.
  const wall = new Float64Array(nodes.length), cool = new Float64Array(nodes.length);
  const alpha = (resin.k ?? 0.2) / ((resin.rhoSolid ?? 1000) * (resin.cp ?? 2000)) * 1e6;   // mm²/s
  let wMin = Infinity, wMax = -Infinity, wSum = 0, vSum = 0, tMax = 0, hot = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const area = n.V / Math.max(1e-9, n.h), a = Math.sqrt(area / PI);
    let T = Tinf + g * field(n.c, i, n.h / 2) + P[i] / (2 * PI * k * Math.max(a, n.h / 2));
    for (let s = 0; s < S; s++) T -= g * qs[s] * segmentIntegral(n.c, segs[s].a, segs[s].b, live[segs[s].channel].diameter / 2);
    wall[i] = T;
    const tcool = T < Te ? ((n.h * n.h) / (PI * PI * alpha)) * Math.log(Math.max(1, (8 / (PI * PI)) * (Tm - T) / (Te - T))) : Infinity;
    cool[i] = tcool;
    if (!Number.isFinite(tcool)) hot++; else tMax = Math.max(tMax, tcool);
    wMin = Math.min(wMin, T); wMax = Math.max(wMax, T); wSum += T * n.V; vSum += n.V;
  }
  // Per circuit: heat, outlet temperature, pressure drop, and what to look at.
  const warnings = [];
  const circuits = live.map((ch, ci) => {
    const fl = flows[ci];
    let heat = 0; for (let s = 0; s < S; s++) if (segs[s].channel === ci) heat += qs[s] * segs[s].L;
    const rise = heat / (fl.mdot * fl.cp);
    const pd = channelPressureDrop(ch.points, fl, ch.diameter);
    let gap = Infinity;
    for (const sg of segs) if (sg.channel === ci) for (const n of nodes) gap = Math.min(gap, Math.sqrt(Math.max(0, (() => { const e = sub(sg.b, sg.a), L = len(e), u = e.map((v) => v / L), w = sub(n.c, sg.a), t = Math.max(0, Math.min(L, dot(w, u))); const d = sub(w, u.map((v) => v * t)); return dot(d, d); })())) - n.h / 2 - ch.diameter / 2);
    const out = { name: ch.name ?? `CH${ci + 1}`, length: pd.length, diameter: ch.diameter, flow: ch.flow, coolant: ch.coolant ?? 'water', velocity: fl.v, Re: fl.Re, regime: fl.regime, h: fl.h, heat, inlet: ch.inlet ?? 25, outlet: (ch.inlet ?? 25) + rise, rise, pressureDrop: pd.dp, steel: gap };
    if (fl.Re < 10000) warnings.push({ kind: 'not-turbulent', channel: out.name, Re: fl.Re });
    if (rise > 3) warnings.push({ kind: 'rise', channel: out.name, rise });
    if (gap < ch.diameter) warnings.push({ kind: 'too-close', channel: out.name, gap, diameter: ch.diameter });
    if (heat < 0) warnings.push({ kind: 'heating', channel: out.name });
    return out;
  });
  if (hot) warnings.push({ kind: 'hot-spot', nodes: hot });
  const heatChannels = circuits.reduce((s, c) => s + c.heat, 0);
  /** The cycle-averaged steel temperature at any point (the part's sources and the channels' sinks). */
  const wallAt = (x) => {
    let T = Tinf + g * field(x, -1, 0.5);
    for (let s = 0; s < S; s++) T -= g * qs[s] * segmentIntegral(x, segs[s].a, segs[s].b, live[segs[s].channel].diameter / 2);
    return T;
  };
  return {
    ok: true, wall, coolTime: cool, channels: circuits, warnings, Tinf, heatPart, heatChannels, wallAt,
    summary: { wallMin: wMin, wallMax: wMax, wallMean: wSum / vSum, wallSpread: wMax - wMin, coolTimeMax: hot ? Infinity : tMax, hotSpots: hot, cycleTime: tc, heat: heatPart },
  };
}

/**
 * Straight channels laid out over and under the part (both mould halves): along the part's longer side, `pitch`
 * apart (default 3 d), their axes `depth` (default 1.5 d + d/2) from the part's faces; one circuit per half, the
 * channels joined at alternate ends (a serpentine).
 */
export function suggestChannels(domain, { diameter = 8, depth = null, pitch = null, flow = 8, inlet = 25, coolant = 'water' } = {}) {
  const pos = domain.nodes.map((n) => n.c);
  const hMax = Math.max(...domain.nodes.map((n) => n.h));
  const lo = [0, 1, 2].map((j) => Math.min(...pos.map((p) => p[j]))), hi = [0, 1, 2].map((j) => Math.max(...pos.map((p) => p[j])));
  const along = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1, across = 1 - along;
  const dz = depth ?? 1.5 * diameter + diameter / 2;
  const step = pitch ?? 3 * diameter;
  const n = Math.max(1, Math.floor((hi[across] - lo[across]) / step) + 1);
  const span = (n - 1) * step, start = (lo[across] + hi[across]) / 2 - span / 2;
  const ext = 1.5 * diameter;
  const out = [];
  for (const [side, z] of [['core', lo[2] - hMax / 2 - dz], ['cavity', hi[2] + hMax / 2 + dz]]) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const c = start + i * step;
      const a = [0, 0, z], b = [0, 0, z];
      a[along] = lo[along] - ext; b[along] = hi[along] + ext; a[across] = c; b[across] = c;
      if (i % 2) pts.push(b, a); else pts.push(a, b);
    }
    out.push({ name: side === 'core' ? 'Core' : 'Cavity', side, points: pts, diameter, flow, inlet, coolant });
  }
  return out;
}
