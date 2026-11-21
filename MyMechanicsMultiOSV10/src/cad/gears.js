// Gear tooth geometry (pure maths, no kernel): the tooth space a rack cutter of the ISO 53 basic rack (20°,
// addendum 1 m, dedendum 1.25 m, tip radius ρ = 0.38 m) generates in a gear blank — the involute flank from the
// tip down to the form point and below it the trochoidal root fillet the cutter's rounded tip sweeps, with any
// undercut cut away — and the outlines of spur / helical (transverse section), bevel (Tredgold back cone)
// gears, racks and synchronous belt pulleys built from it.

const TAU = 2 * Math.PI;

/**
 * Generates one flank of a tooth space by rolling the rack cutter on the pitch circle (radius rp).
 * `pitch`: circular pitch at the pitch circle (π m), `alpha`: flank angle (radians), `ha` / `hf`: gear addendum
 * / dedendum (the cutter's dedendum / addendum), `rho`: cutter tip radius.
 * Returns { fillet: [[r, w] …], involute: [[r, w] …], rootHalf, tipHalf, rf, ra } where w is the angle from the
 * space's centre line (positive toward the flank), both curves run outward, the fillet ends where the involute
 * starts (or where the undercut cut them).
 */
export function toothSpaceFlank({ rp, pitch, alpha, ha, hf, rho, samples = 60 }) {
  const ra = rp + ha; const rf = rp - hf;
  const yc = hf - rho; // cutter tip-round centre height above the pitch line (toward the gear centre)
  const xc = pitch / 4 - yc * Math.tan(alpha) - rho / Math.cos(alpha);
  const ytf = yc + rho * Math.sin(alpha); // where the straight flank meets the round
  // Cutter points with their normals, in order: the tip flat (x from 0 to xc), the round, the straight flank.
  const pts = [];
  pts.push({ q: [xc, hf], n: [0, 1], part: 'flat' });
  for (let i = 1; i <= samples; i++) {
    const t = Math.PI / 2 - ((Math.PI / 2 - alpha) * i) / samples;
    pts.push({ q: [xc + rho * Math.cos(t), yc + rho * Math.sin(t)], n: [Math.cos(t), Math.sin(t)], part: 'fillet' });
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
export function gearProfile({ module: m, teeth: z, pressureAngle = 20, ha = null, hf = null, rho = null }) {
  const rp = (m * z) / 2;
  const f = toothSpaceFlank({ rp, pitch: Math.PI * m, alpha: (pressureAngle * Math.PI) / 180, ha: ha ?? m, hf: hf ?? 1.25 * m, rho: rho ?? 0.38 * m });
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
 * Straight bevel gear (shaft angle 90°): pitch angle δ = atan(z / zMate), outer cone distance Re, virtual
 * (Tredgold) tooth count zv = z / cos δ, the outer tip / root diameters and the face width limit Re / 3.
 */
export function bevelGeometry({ module: m, teeth: z, mateTeeth: z2 }) {
  const delta = Math.atan2(z, z2);
  const rp = (m * z) / 2;
  const Re = rp / Math.sin(delta);
  const zv = z / Math.cos(delta);
  return { delta, rp, Re, zv, apex: rp / Math.tan(delta), tipDiameter: m * z + 2 * m * Math.cos(delta), rootDiameter: m * z - 2.5 * m * Math.cos(delta), maxWidth: Re / 3 };
}

/**
 * Tredgold's approximation of a bevel gear's outer tooth section, laid flat in the back plane: the virtual
 * spur gear's outline (zv teeth, radius rp / cos δ) mapped radially by cos δ about the pitch circle and its
 * angles by zv / z. Returns pieces like gearProfile (arcs become curves).
 */
export function bevelSection({ module: m, teeth: z, mateTeeth: z2 }) {
  const g = bevelGeometry({ module: m, teeth: z, mateTeeth: z2 });
  const virt = gearProfile({ module: m, teeth: g.zv });
  const k = g.zv / z; const cd = Math.cos(g.delta);
  const map = ([x, y]) => { const R = Math.hypot(x, y); const a = Math.atan2(y, x) * k; const r = g.rp + (R - virt.rp) * cd; return [r * Math.cos(a), r * Math.sin(a)]; };
  // One period of the virtual outline (root arc, flank, tip arc, flank), mapped and repeated z times.
  const pieces = [];
  const firstTooth = virt.pieces.slice(0, virt.pieces.length / Math.ceil(g.zv));
  for (let i = 0; i < z; i++) {
    const turn = (TAU * i) / z;
    for (const p of firstTooth) {
      const pts = p.kind === 'arc' ? Array.from({ length: 9 }, (_, j) => { const a = p.a0 + ((p.a1 - p.a0) * j) / 8; return [p.r * Math.cos(a), p.r * Math.sin(a)]; }) : p.pts;
      const mapped = pts.map(map).map(([x, y]) => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)]);
      pieces.push({ kind: p.kind === 'arc' ? 'arcLike' : 'curve', pts: mapped, r: p.kind === 'arc' ? g.rp + (p.r - virt.rp) * cd : null });
    }
  }
  return { pieces, ...g };
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

/** DIN 7721 / ISO 17396 T-profile synchronous pulleys: pitch, groove width at the tip, depth, flank angle, PLD. */
export const PULLEY_PROFILES = {
  'T2.5': { pitch: 2.5, bw: 0.9, hg: 0.75, beta: 25, pld: 0.3 },
  T5: { pitch: 5, bw: 1.75, hg: 1.25, beta: 25, pld: 0.425 },
  T10: { pitch: 10, bw: 3.05, hg: 2.6, beta: 25, pld: 1 },
};

/** A pulley's diameters: pitch d0 = z p / π, outside da = d0 − 2·PLD. */
export function pulleyGeometry(profile, z) {
  const g = PULLEY_PROFILES[profile];
  const d0 = (z * g.pitch) / Math.PI;
  return { ...g, d0, da: d0 - 2 * g.pld, root: d0 - 2 * g.pld - 2 * g.hg };
}

/**
 * The pulley's outline pieces about the origin: tip arcs on the outside circle between z trapezoidal grooves
 * (flanks at β to the radial line, a flat bottom). { kind: 'arc', r, a0, a1 } | { kind: 'line', a: [x, y], b }.
 */
export function pulleyProfile(profile, z) {
  const g = pulleyGeometry(profile, z);
  const ro = g.da / 2; const rb = ro - g.hg;
  const tb = Math.tan((g.beta * Math.PI) / 180);
  const halfTop = g.bw / 2 / ro; // angular half width of the groove at the tip (chord ≈ arc)
  const bottomHalfW = Math.max(0.05, g.bw / 2 - g.hg * tb);
  const halfBottom = bottomHalfW / rb;
  const xy = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const pieces = [];
  for (let i = 0; i < z; i++) {
    const c = (TAU * i) / z; const next = (TAU * (i + 1)) / z;
    pieces.push({ kind: 'line', a: xy(ro, c - halfTop), b: xy(rb, c - halfBottom) });
    pieces.push({ kind: 'arc', r: rb, a0: c - halfBottom, a1: c + halfBottom });
    pieces.push({ kind: 'line', a: xy(rb, c + halfBottom), b: xy(ro, c + halfTop) });
    pieces.push({ kind: 'arc', r: ro, a0: c + halfTop, a1: next - halfTop });
  }
  return { pieces, ...g };
}
