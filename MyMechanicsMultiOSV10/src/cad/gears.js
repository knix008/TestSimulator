// Gear tooth geometry (pure maths, no kernel): the tooth space a rack cutter of the ISO 53 basic rack (20°,
// addendum 1 m, dedendum 1.25 m, tip radius ρ = 0.38 m) generates in a gear blank — the involute flank from the
// tip down to the form point and below it the trochoidal root fillet the cutter's rounded tip sweeps, with any
// undercut cut away — and the outlines of spur / helical (transverse section) gears, straight bevel gears
// (spherical involute on the back sphere), racks and synchronous belt pulleys.

const TAU = 2 * Math.PI;

/**
 * Generates one flank of a tooth space by rolling the rack cutter on the pitch circle (radius rp).
 * `pitch`: circular pitch at the pitch circle (π m), `alpha`: flank angle (radians), `ha` / `hf`: gear addendum
 * / dedendum (the cutter's dedendum / addendum), `rho`: cutter tip radius. `rhoX` (default rho): the tip round's
 * half width along the rack — a helical gear's transverse rack has an elliptic tip (the normal-section circle ρ
 * seen in the transverse plane: ρ across the tooth height, ρ / cos β along the pitch line).
 * Returns { fillet: [[r, w] …], involute: [[r, w] …], rootHalf, tipHalf, rf, ra } where w is the angle from the
 * space's centre line (positive toward the flank), both curves run outward, the fillet ends where the involute
 * starts (or where the undercut cut them).
 */
export function toothSpaceFlank({ rp, pitch, alpha, ha, hf, rho, rhoX = rho, samples = 60 }) {
  const ra = rp + ha; const rf = rp - hf;
  const a = rhoX; const b = rho; // the tip round: an ellipse (a circle when a = b), semi-axes along x / y
  const yc = hf - b; // tip-round centre height above the pitch line (toward the gear centre)
  // Tangent to the flank x cos α + y sin α = (p/4) cos α: the ellipse's support distance along the flank normal.
  const support = Math.hypot(a * Math.cos(alpha), b * Math.sin(alpha));
  const xc = (pitch / 4) - yc * Math.tan(alpha) - support / Math.cos(alpha);
  const tFlank = Math.atan2(b * Math.sin(alpha), a * Math.cos(alpha)); // ellipse parameter where its normal is the flank's
  const ytf = yc + b * Math.sin(tFlank); // where the straight flank meets the round
  // Cutter points with their normals, in order: the tip flat (x from 0 to xc), the round, the straight flank.
  const pts = [];
  pts.push({ q: [xc, hf], n: [0, 1], part: 'flat' });
  for (let i = 1; i <= samples; i++) {
    const t = Math.PI / 2 - ((Math.PI / 2 - tFlank) * i) / samples;
    const nx = Math.cos(t) / a; const ny = Math.sin(t) / b; const nl = Math.hypot(nx, ny);
    pts.push({ q: [xc + a * Math.cos(t), yc + b * Math.sin(t)], n: [nx / nl, ny / nl], part: 'fillet' });
  }
  const yLow = -ha * 1.6 - 0.2 * pitch;
  for (let i = 1; i <= samples * 2; i++) {
    const y = ytf + ((yLow - ytf) * i) / (samples * 2);
    pts.push({ q: [pitch / 4 - y * Math.tan(alpha), y], n: [Math.cos(alpha), Math.sin(alpha)], part: 'involute' });
  }
  // The envelope: the cutter point touches the gear when its normal passes through the pitch point.
  const gen = pts.map(({ q, n, part }) => {
    const s = (q[1] * n[0]) / n[1] - q[0];
    const cx = q[0] + s; const cy = q[1];
    const phi = s / rp; const c = Math.cos(-phi); const sn = Math.sin(-phi);
    const px = cx; const py = cy - rp;
    const x = px * c - py * sn; const y = px * sn + py * c;
    return { r: Math.hypot(x, y), w: Math.atan2(y, x) + Math.PI / 2, part };
  });
  // Undercut: a later piece of the curve crossing an earlier one — cut the loop out.
  const P = gen.map((g) => [g.r * Math.cos(g.w), g.r * Math.sin(g.w)]);
  const cross = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]]; const s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-18) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  };
  let cut = null;
  const firstInv = gen.findIndex((g) => g.part === 'involute');
  for (let j = gen.length - 2; j >= firstInv && !cut; j--) {
    for (let i = 0; i < Math.min(j - 1, firstInv); i++) {
      const x = cross(P[i], P[i + 1], P[j], P[j + 1]);
      if (x) { cut = { i, j, x }; break; }
    }
  }
  let fillet; let involute;
  const toRW = ([x, y]) => [Math.hypot(x, y), Math.atan2(y, x)];
  if (cut) {
    fillet = [...gen.slice(0, cut.i + 1).map((g) => [g.r, g.w]), toRW(cut.x)];
    involute = [toRW(cut.x), ...gen.slice(cut.j + 1).map((g) => [g.r, g.w])];
  } else {
    fillet = gen.slice(0, firstInv + 1).map((g) => [g.r, g.w]);
    involute = gen.slice(firstInv).map((g) => [g.r, g.w]);
  }
  // Clip at the tip circle.
  const k = involute.findIndex(([r]) => r >= ra);
  if (k > 0) {
    const [r0, w0] = involute[k - 1]; const [r1, w1] = involute[k];
    involute = [...involute.slice(0, k), [ra, w0 + ((w1 - w0) * (ra - r0)) / (r1 - r0)]];
  }
  // A fillet that already reaches the tip (very small gears) leaves no involute.
  const kf = fillet.findIndex(([r]) => r >= ra);
  if (kf > 0) { fillet = fillet.slice(0, kf + 1); fillet[kf] = [ra, fillet[kf][1]]; involute = [fillet[kf]]; }
  return { fillet, involute, rootHalf: fillet[0][1], tipHalf: involute.at(-1)[1], rf, ra, undercut: Boolean(cut) };
}

/**
 * A gear's transverse outline as pieces about the origin: for each tooth space a root arc, the two flanks
 * (fillet + involute each) and the tip arc of the next tooth. Pieces: { kind: 'arc', r, a0, a1 } (angles,
 * counter-clockwise) or { kind: 'curve', pts: [[x, y] …] }. Tooth i is centred at angle 2πi/z.
 * `module` is the transverse module, `pressureAngle` the transverse pressure angle (degrees), `ha` / `hf` /
 * `rho` in mm (defaults from the module: 1 m, 1.25 m, 0.38 m).
 */
export function gearProfile({ module: m, teeth: z, pressureAngle = 20, ha = null, hf = null, rho = null, rhoX = null }) {
  const rp = (m * z) / 2;
  const f = toothSpaceFlank({ rp, pitch: Math.PI * m, alpha: (pressureAngle * Math.PI) / 180, ha: ha ?? m, hf: hf ?? 1.25 * m, rho: rho ?? 0.38 * m, rhoX: rhoX ?? rho ?? 0.38 * m });
  const xy = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const pieces = [];
  const half = Math.PI / z;
  const tipHalf = Math.min(f.tipHalf, half * 0.999);
  for (let i = 0; i < z; i++) {
    const s = (TAU * i) / z + half; // space centre
    pieces.push({ kind: 'arc', r: f.rf, a0: s - f.rootHalf, a1: s + f.rootHalf });
    // Up the flank on the + side of the space (the trailing flank of tooth i + 1).
    pieces.push({ kind: 'curve', pts: f.fillet.map(([r, w]) => xy(r, s + w)) });
    if (f.involute.length > 1) pieces.push({ kind: 'curve', pts: f.involute.map(([r, w]) => xy(r, s + Math.min(w, tipHalf))) });
    const next = s + 2 * half; // the next space
    pieces.push({ kind: 'arc', r: f.ra, a0: s + tipHalf, a1: next - tipHalf });
    if (f.involute.length > 1) pieces.push({ kind: 'curve', pts: [...f.involute].reverse().map(([r, w]) => xy(r, next - Math.min(w, tipHalf))) });
    pieces.push({ kind: 'curve', pts: [...f.fillet].reverse().map(([r, w]) => xy(r, next - w)) });
  }
  return { pieces, rp, ra: f.ra, rf: f.rf, undercut: f.undercut, flank: f };
}

/** The outline as a dense closed polygon (arcs every ~2°) — for areas, previews and tests. */
export function profilePolygon(profile) {
  const out = [];
  for (const p of profile.pieces) {
    if (p.kind === 'arc') {
      const n = Math.max(2, Math.ceil(Math.abs(p.a1 - p.a0) / 0.035));
      for (let k = 0; k < n; k++) { const a = p.a0 + ((p.a1 - p.a0) * k) / n; out.push([p.r * Math.cos(a), p.r * Math.sin(a)]); }
    } else out.push(...p.pts.slice(0, -1));
  }
  return out;
}

/** Transverse module and pressure angle of a helical gear (normal module mn, helix angle β, normal α). */
export function helicalTransverse(mn, beta, alphaN = 20) {
  const b = (beta * Math.PI) / 180;
  const mt = mn / Math.cos(b);
  const at = (Math.atan(Math.tan((alphaN * Math.PI) / 180) / Math.cos(b)) * 180) / Math.PI;
  return { mt, alphaT: at, pitchDiameter: 0, cosBeta: Math.cos(b) };
}

/**
 * Straight bevel gear (shaft angle 90°): pitch angle δ = atan(z / zMate), outer cone distance Re,
 * virtual (back-cone) tooth count zv = z / cos δ, the outer tip / root diameters and the face width limit Re / 3.
 */
export function bevelGeometry({ module: m, teeth: z, mateTeeth: z2 }) {
  const delta = Math.atan2(z, z2);
  const rp = (m * z) / 2;
  const Re = rp / Math.sin(delta);
  const zv = z / Math.cos(delta);
  return { delta, rp, Re, zv, apex: rp / Math.tan(delta), tipDiameter: m * z + 2 * m * Math.cos(delta), rootDiameter: m * z - 2.5 * m * Math.cos(delta), maxWidth: Re / 3 };
}

/**
 * A point of the spherical involute of base cone angle δb on the unit sphere about the cone apex (axis +z away
 * from the gear, so the cones open toward −z is handled by the caller): the great circle tangent to the base cone
 * rolls on it by ψ; the traced point is g(ψ) cos θ − t(ψ) sin θ with θ = ψ sin δb, g the base-cone generator at
 * azimuth ψ and t the circle's tangent there. Returns { gamma (polar angle), phi (azimuth), p }.
 */
export function sphericalInvolute(deltaB, psi) {
  const sb = Math.sin(deltaB); const cb = Math.cos(deltaB);
  const th = psi * sb;
  const g = [sb * Math.cos(psi), sb * Math.sin(psi), cb];
  const t = [-Math.sin(psi), Math.cos(psi), 0];
  const p = [g[0] * Math.cos(th) - t[0] * Math.sin(th), g[1] * Math.cos(th) - t[1] * Math.sin(th), g[2] * Math.cos(th)];
  return { gamma: Math.acos(Math.max(-1, Math.min(1, p[2]))), phi: Math.atan2(p[1], p[0]), p, generator: g };
}

/**
 * Straight bevel gear tooth on the outer (back) sphere of radius Re about the cone apex: spherical involute
 * flanks (the exact conjugate form for straight bevel gears — every tooth line runs to the apex) on the base
 * cone sin δb = sin δ cos α, the tip cone δa = δ + atan(m / Re), the root cone δf = δ − atan(1.25 m / Re), below
 * the base cone a radial flank, and the root fillet of radius 0.38 m (on the sphere, developed locally).
 * Returns { pieces: [{ kind: 'cone', gamma, phi0, phi1 } | { kind: 'curve', pts: [[gamma, phi] …] }], … } — the
 * outline as cone angle / azimuth pairs; tooth i centred at azimuth 2πi/z.
 */
export function bevelSphericalSection({ module: m, teeth: z, mateTeeth: z2, pressureAngle = 20 }) {
  const g = bevelGeometry({ module: m, teeth: z, mateTeeth: z2 });
  const a = (pressureAngle * Math.PI) / 180;
  const deltaB = Math.asin(Math.sin(g.delta) * Math.cos(a));
  const Re = g.Re;
  const deltaA = g.delta + Math.atan(m / Re); const deltaF = g.delta - Math.atan((1.25 * m) / Re);
  // ψ for a cone angle on the involute (it grows monotonically with ψ).
  const psiAt = (gamma) => { let lo = 0; let hi = Math.PI; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (sphericalInvolute(deltaB, mid).gamma < gamma) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const phiP = sphericalInvolute(deltaB, psiAt(g.delta)).phi;
  // Half tooth (azimuth) at cone angle γ: π/(2z) at the pitch cone, narrowing outward along the involute.
  const half = (gamma) => Math.PI / (2 * z) - (sphericalInvolute(deltaB, psiAt(gamma)).phi - phiP);
  const gLow = Math.max(deltaB, deltaF);
  const flank = [];
  const n = 40;
  for (let i = 0; i <= n; i++) { const gm = gLow + ((deltaA - gLow) * i) / n; flank.push([gm, half(gm)]); }
  // Below the base cone a radial flank, then the 0.38 m root fillet into the root cone (developed at the root:
  // x = Re sin γ · φ across, y = Re γ along the sphere).
  const rho = 0.38 * m;
  const tauB = flank[0][1];
  const sinF = Math.sin(deltaF);
  const fillet = [];
  let rootHalf = tauB;
  if (deltaB > deltaF + 1e-9 && Re * (deltaB - deltaF) > rho * 0.5) {
    const x0 = Re * sinF * tauB; const yF = Re * deltaF;
    const rr = Math.min(rho, Re * (deltaB - deltaF));
    // The space lies at φ > τ (beyond the tooth's half width): the fillet's centre is in that corner.
    const cxs = x0 + rr; const cy = yF + rr;
    for (let i = 0; i <= 12; i++) {
      const t = Math.PI + (Math.PI / 2) * (i / 12); // from the flank (left of centre) down to the root (below)
      const x = cxs + rr * Math.cos(t); const y = cy + rr * Math.sin(t);
      fillet.push([y / Re, x / (Re * Math.sin(y / Re))]);
    }
    // From the root tangent up to the flank tangent; the radial flank then runs up to the base cone.
    rootHalf = fillet.at(-1)[1];
    fillet.reverse();
  } else if (deltaB > deltaF) {
    flank.unshift([deltaF, tauB]);
    rootHalf = tauB;
  }
  const tipHalf = Math.max(flank.at(-1)[1], 1e-4);
  // Assemble tooth by tooth: root cone arc of the space, up the flank of the next tooth, its tip, down.
  const pieces = [];
  const pitchA = (2 * Math.PI) / z;
  const up = [...fillet, ...flank]; // from the root (in the space) up to the tip, as (γ, half-width) pairs
  for (let i = 0; i < z; i++) {
    const c = pitchA * i; const nx = c + pitchA;
    // right flank of tooth i (φ = c + w), going down from the tip into the space
    pieces.push({ kind: 'curve', pts: [...up].reverse().map(([gm, w]) => [gm, c + w]) });
    pieces.push({ kind: 'cone', gamma: deltaF, phi0: c + rootHalf, phi1: nx - rootHalf });
    pieces.push({ kind: 'curve', pts: up.map(([gm, w]) => [gm, nx - w]) });
    pieces.push({ kind: 'cone', gamma: deltaA, phi0: nx - tipHalf, phi1: nx + tipHalf });
  }
  return { pieces, ...g, deltaB, deltaA, deltaF, rootHalf, tipHalf, half };
}

/**
 * The outline of a straight rack (the ISO 53 basic rack: flanks at α, addendum m above the pitch line,
 * dedendum 1.25 m below it, root fillets ρ = 0.38 m), `count` teeth along +X from x = 0, pitch line at y = 0,
 * base at y = −height. Returns corner points with fillet radii: [{ p: [x, y], r }].
 */
export function rackOutline({ module: m, count, height, pressureAngle = 20 }) {
  const a = (pressureAngle * Math.PI) / 180;
  const p = Math.PI * m; const tn = Math.tan(a); const rho = 0.38 * m;
  const pts = [{ p: [0, -1.25 * m], r: 0 }];
  for (let k = 0; k < count; k++) {
    const c = (k + 0.5) * p;
    pts.push({ p: [c - (p / 4 + 1.25 * m * tn), -1.25 * m], r: rho });
    pts.push({ p: [c - (p / 4 - m * tn), m], r: 0 });
    pts.push({ p: [c + (p / 4 - m * tn), m], r: 0 });
    pts.push({ p: [c + (p / 4 + 1.25 * m * tn), -1.25 * m], r: rho });
  }
  pts.push({ p: [count * p, -1.25 * m], r: 0 }, { p: [count * p, -height], r: 0 }, { p: [0, -height], r: 0 });
  return pts;
}

/**
 * DIN 7721 / ISO 17396 T-profile synchronous pulleys: pitch, groove width at the tip bw (a chord on the
 * outside circle), groove depth hg, flank angle β (to the groove's centre line, 2β = 50°), the pitch line
 * differential PLD (= a, d_a = d_0 − 2a), the tip radius rt and the groove bottom radius rb.
 * Sources: 2a from the Mulco T-profile pulley table (d0 − dK: T2.5 0.52–0.54, T5 0.82–0.85, T10 1.84–1.85;
 * mulco_Synchronscheiben_Komponenten.pdf p. 90, klocke-antrieb.de). bw, hg, 2β and the radii: DIN 7721-2 /
 * ISO 17396 values as reproduced in pulley catalogues (2β = 50°, T10 radii ≈ 0.8 / 0.6 mm, Misumi T10 drawing);
 * the standard's own groove table was not available to check them against.
 */
export const PULLEY_PROFILES = {
  'T2.5': { pitch: 2.5, bw: 0.9, hg: 0.75, beta: 25, pld: 0.27, rt: 0.2, rb: 0.15 },
  T5: { pitch: 5, bw: 1.75, hg: 1.25, beta: 25, pld: 0.425, rt: 0.4, rb: 0.3 },
  T10: { pitch: 10, bw: 3.05, hg: 2.6, beta: 25, pld: 0.925, rt: 0.8, rb: 0.6 },
};

/** A pulley's diameters: pitch d0 = z p / π, outside da = d0 − 2·PLD. */
export function pulleyGeometry(profile, z) {
  const g = PULLEY_PROFILES[profile];
  const d0 = (z * g.pitch) / Math.PI;
  return { ...g, d0, da: d0 - 2 * g.pld, root: d0 - 2 * g.pld - 2 * g.hg };
}

/** The fillet of radius rf between a line (point p, unit direction u) and a circle about the origin (radius Rc): { c, onLine, onCircle } nearest to `near`. */
function lineCircleFillet(p, u, Rc, rf, near, outsideCircle) {
  const n = [-u[1], u[0]];
  let best = null;
  for (const s of [1, -1]) {
    const q = [p[0] + n[0] * s * rf, p[1] + n[1] * s * rf];
    // |q + u t| = Rc ± rf
    const Rt = outsideCircle ? Rc + rf : Rc - rf;
    const b = q[0] * u[0] + q[1] * u[1]; const c = q[0] * q[0] + q[1] * q[1] - Rt * Rt;
    const disc = b * b - c;
    if (disc < 0) continue;
    for (const t of [-b + Math.sqrt(disc), -b - Math.sqrt(disc)]) {
      const cen = [q[0] + u[0] * t, q[1] + u[1] * t];
      const d = Math.hypot(cen[0] - near[0], cen[1] - near[1]);
      if (!best || d < best.d) best = { d, c: cen };
    }
  }
  const c = best.c;
  const tl = (c[0] - p[0]) * u[0] + (c[1] - p[1]) * u[1];
  const onLine = [p[0] + u[0] * tl, p[1] + u[1] * tl];
  const k = Math.hypot(c[0], c[1]);
  const onCircle = [(c[0] / k) * Rc, (c[1] / k) * Rc];
  return { c, onLine, onCircle };
}

/**
 * The pulley's outline pieces about the origin: z trapezoidal grooves (flanks at β to the groove's centre line,
 * a bottom arc at d_a − 2 hg) with the tip radius rt where a flank meets the outside circle and the bottom radius
 * rb where it meets the groove bottom. Pieces: { kind: 'arc', r, a0, a1 } (about the origin), { kind: 'line', a, b },
 * { kind: 'arc3', a, m, b } (a fillet through three points).
 */
export function pulleyProfile(profile, z) {
  const g = pulleyGeometry(profile, z);
  const ro = g.da / 2; const rbase = ro - g.hg;
  const tb = Math.tan((g.beta * Math.PI) / 180);
  // One groove centred on +x (local), its lower flank (y < 0); the upper one is the mirror image.
  const top = [Math.sqrt(ro * ro - (g.bw / 2) ** 2), -g.bw / 2];
  const u = (() => { const v = [-1, tb]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l]; })(); // inward along the flank
  // The flank meets the bottom circle.
  const bq = top[0] * u[0] + top[1] * u[1]; const bc = top[0] ** 2 + top[1] ** 2 - rbase * rbase;
  const tBot = -bq - Math.sqrt(Math.max(0, bq * bq - bc));
  const bot = [top[0] + u[0] * tBot, top[1] + u[1] * tBot];
  const tipF = lineCircleFillet(top, u, ro, g.rt, top, false); // inside the outside circle (convex corner)
  const botF = lineCircleFillet(top, u, rbase, g.rb, bot, true); // outside the bottom circle (concave corner)
  const mid = (f, r) => { const a = [f.onLine[0] - f.c[0], f.onLine[1] - f.c[1]]; const b = [f.onCircle[0] - f.c[0], f.onCircle[1] - f.c[1]]; const m = [a[0] + b[0], a[1] + b[1]]; const l = Math.hypot(...m) || 1; return [f.c[0] + (m[0] / l) * r, f.c[1] + (m[1] / l) * r]; };
  const tipMid = mid(tipF, g.rt); const botMid = mid(botF, g.rb);
  const ang = (p) => Math.atan2(p[1], p[0]);
  const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const mir = (p) => [p[0], -p[1]];
  const pieces = [];
  const TAU = 2 * Math.PI;
  const tipAngle = -ang(tipF.onCircle); // angular half width of the groove at the outside circle, fillet included
  for (let i = 0; i < z; i++) {
    const c = (TAU * i) / z; const R = (p) => rot(p, c);
    pieces.push({ kind: 'arc3', a: R(tipF.onCircle), m: R(tipMid), b: R(tipF.onLine) });
    pieces.push({ kind: 'line', a: R(tipF.onLine), b: R(botF.onLine) });
    pieces.push({ kind: 'arc3', a: R(botF.onLine), m: R(botMid), b: R(botF.onCircle) });
    pieces.push({ kind: 'arc', r: rbase, a0: c + ang(botF.onCircle), a1: c - ang(botF.onCircle) });
    pieces.push({ kind: 'arc3', a: R(mir(botF.onCircle)), m: R(mir(botMid)), b: R(mir(botF.onLine)) });
    pieces.push({ kind: 'line', a: R(mir(botF.onLine)), b: R(mir(tipF.onLine)) });
    pieces.push({ kind: 'arc3', a: R(mir(tipF.onLine)), m: R(mir(tipMid)), b: R(mir(tipF.onCircle)) });
    pieces.push({ kind: 'arc', r: ro, a0: c + tipAngle, a1: c + TAU / z - tipAngle });
  }
  return { pieces, ...g, bottomRadius: rbase, flankBottom: bot };
}
