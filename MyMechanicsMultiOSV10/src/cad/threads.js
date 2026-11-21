// ISO metric screw threads (ISO 68-1 basic profile, ISO 261 / 262 sizes and pitches, ISO 965-1 design profile
// of the external thread): the diameters, the axial profile, the cross-section and the modelled thread solids.
//
// A thread is a screw-symmetric solid: every cross-section perpendicular to the axis is the same closed curve,
// turned by 360° per pitch. So a modelled thread is that cross-section (exact arcs, and B-splines through the
// flank spirals to 1e-6 mm) swept along the axis while it turns with an auxiliary helix — a single sweep, no
// faceting. OpenCASCADE's booleans take such a sweep reliably only where its end faces lie ON planar faces of
// the other solid (coplanar ends) or inside its material, never where a sweep crosses a plane, so every
// builder here starts a thread on a face and ends it on a face or inside material.
//
// Profiles (radius r as a function of the axial position z, one pitch, crest centred at z = 0):
//   internal  the basic profile: root flat P/8 at D/2, 60° flanks, crest flat P/4 at D1/2 = D/2 − 5H/8
//   external  the design profile: crest flat P/8 at d/2, 60° flanks, a root arc of radius H/6 tangent to the
//             flanks with its bottom at d3/2 = d/2 − 17H/24 (ISO 965-1; d3 = d − 1.22687 P)
// The external thread lies inside the basic profile everywhere, so a modelled bolt and nut never interfere.
// No DOM; the kernel only in the solid builders.
import { rep } from './kernel.js';
import { makeHelixStable, stableXDir } from './oriented.js';

const SQ3 = Math.sqrt(3);

/** ISO 261 coarse pitches (mm) by nominal diameter. */
export const COARSE_PITCH = { 1: 0.25, 1.2: 0.25, 1.6: 0.35, 2: 0.4, 2.5: 0.45, 3: 0.5, 4: 0.7, 5: 0.8, 6: 1, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2, 16: 2, 18: 2.5, 20: 2.5, 22: 2.5, 24: 3, 27: 3, 30: 3.5, 33: 3.5, 36: 4, 42: 4.5, 48: 5 };
/** ISO 261 fine pitches commonly used (first choice), by nominal diameter. */
export const FINE_PITCHES = { 8: [1], 10: [1.25, 1], 12: [1.5, 1.25], 14: [1.5], 16: [1.5], 18: [2, 1.5], 20: [2, 1.5], 22: [2, 1.5], 24: [2], 27: [2], 30: [2], 33: [2], 36: [3], 42: [3], 48: [3] };

/**
 * The diameters of an ISO metric thread M d × P: H (fundamental triangle height, √3/2 P), d2 (pitch diameter,
 * d − 0.649519 P), d1 (basic minor diameter = internal minor D1, d − 1.082532 P), d3 (external minor with the
 * H/6 root radius, d − 1.226869 P), rootRadius, tapDrill (d − P, the usual drill), and the profile flats.
 */
export function isoThread(d, P = COARSE_PITCH[d]) {
  d = Number(d); P = Number(P);
  if (!(d > 0) || !(P > 0) || P >= d / 2) throw Object.assign(new Error(`bad thread M${d}×${P}`), { code: 'thread-size' });
  const H = (SQ3 / 2) * P;
  return {
    d, P, H,
    d2: d - 0.75 * H, d1: d - 1.25 * H, d3: d - (17 / 12) * H,
    rootRadius: H / 6, tapDrill: Math.round((d - P) * 10) / 10,
    crestFlat: P / 8, rootFlat: P / 4,
  };
}

/** M8 → { d: 8, P: 1.25 } (coarse), "M10x1.25" → fine; null for anything else. */
export function parseThreadSize(name) {
  const m = /^M(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?$/i.exec(String(name ?? '').trim());
  if (!m) return null;
  const d = Number(m[1]); const P = m[2] ? Number(m[2]) : COARSE_PITCH[d];
  return P ? { d, P } : null;
}

/** The size name of M d × P ("M8" for the coarse pitch, "M10×1.25" for a fine one). */
export const threadName = (d, P) => (COARSE_PITCH[d] === P ? `M${d}` : `M${d}×${P}`);

/**
 * The axial profile as pieces over one pitch, z from −P/16 (start of a crest) to 15P/16 + … : a list of
 * { z0, z1, kind: 'flat' | 'line' | 'arc', r(z) }. `kind`: 'external' (design profile) or 'internal' (basic).
 */
export function profilePieces(spec, kind = 'external') {
  const { d, P, H } = spec;
  const R = d / 2;
  const line = (z0, r0, z1, r1) => ({ z0, z1, kind: 'line', r: (z) => r0 + ((r1 - r0) * (z - z0)) / (z1 - z0), r0, r1 });
  const flat = (z0, z1, r) => ({ z0, z1, kind: 'flat', r: () => r, r0: r, r1: r });
  const crest0 = -P / 16; const crest1 = P / 16;
  if (kind === 'internal') {
    const r1 = R - (5 * H) / 8;
    return [flat(crest0, crest1, R), line(crest1, R, (6 * P) / 16, r1), flat((6 * P) / 16, (10 * P) / 16, r1), line((10 * P) / 16, r1, (15 * P) / 16, R)];
  }
  const rho = H / 6;
  const rc = R - (7 * H) / 8 + 2 * rho; // root arc centre (radius)
  const zc = P / 2;
  const w = (rho * SQ3) / 2; // half the axial span of the root arc
  const zt = zc - w; const rt = rc - rho / 2; // tangent point on the descending flank
  const arc = { z0: zt, z1: zc + w, kind: 'arc', r: (z) => rc - Math.sqrt(Math.max(0, rho * rho - (z - zc) ** 2)), r0: rt, r1: rt, rc, zc, rho };
  return [flat(crest0, crest1, R), line(crest1, R, zt, rt), arc, line(zc + w, rt, (15 * P) / 16, R)];
}

/** The profile radius at axial position z (periodic). */
export function profileRadius(spec, z, kind = 'external') {
  const { P } = spec;
  let u = ((z % P) + P) % P;
  if (u >= (15 * P) / 16) u -= P;
  for (const piece of profilePieces(spec, kind)) if (u >= piece.z0 - 1e-12 && u <= piece.z1 + 1e-12) return piece.r(u);
  return spec.d / 2;
}

/**
 * π/P · ∫₀ᴾ r(z)² dz — the area of the cross-section, i.e. the volume of a modelled thread per unit length
 * (exact, from the pieces: flats, straight flanks and the root arc in closed form).
 */
export function sectionArea(spec, kind = 'external') {
  let I = 0;
  for (const p of profilePieces(spec, kind)) {
    const dz = p.z1 - p.z0;
    if (p.kind === 'flat') I += dz * p.r0 * p.r0;
    else if (p.kind === 'line') I += (dz * (p.r0 * p.r0 + p.r0 * p.r1 + p.r1 * p.r1)) / 3;
    else {
      // ∫ (rc − √(ρ² − x²))² dx over x ∈ [−w, w]
      const { rc, rho } = p; const w = dz / 2;
      const F = (x) => (x / 2) * Math.sqrt(rho * rho - x * x) + ((rho * rho) / 2) * Math.asin(x / rho);
      I += 2 * w * (rc * rc + rho * rho) - (2 * w ** 3) / 3 - 2 * rc * (F(w) - F(-w));
    }
  }
  return (Math.PI / spec.P) * I;
}

/** The axial width of the material at radius r (one pitch): P/2 at the pitch diameter by definition. */
export function widthAtRadius(spec, r, kind = 'external') {
  const N = 4000; let n = 0;
  for (let i = 0; i < N; i++) { const z = ((i + 0.5) / N) * spec.P; if (profileRadius(spec, z, kind) > r) n++; }
  return (n / N) * spec.P;
}

// ───────────────────────── solids

const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A frame for a thread: origin, axis `dir`, x and y perpendicular to it. */
export function threadFrame(origin, dir, xDir = null) {
  const z = unit(dir);
  let x = xDir ? unit(xDir) : stableXDir(z);
  const k = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = unit([x[0] - z[0] * k, x[1] - z[1] * k, x[2] - z[2] * k]);
  return { origin: [...origin], z, x, y: cross(z, x) };
}

/**
 * The closed cross-section of a thread in the plane through fr.origin perpendicular to fr.z: the boundary of
 * the material of an external thread (kind 'external') or of the hole of an internal one ('internal'). Arcs
 * are exact circles; flank spirals and the root arc are B-splines through 17 points each (1e-6 mm).
 * `lefthand` mirrors the turn.
 */
export function sectionWire(spec, kind, fr, { lefthand = false } = {}) {
  const R = rep();
  const hand = lefthand ? -1 : 1;
  const at = (z) => {
    const r = profileRadius(spec, z, kind);
    const a = (-hand * 2 * Math.PI * z) / spec.P;
    const c = Math.cos(a) * r; const s = Math.sin(a) * r;
    return [0, 1, 2].map((k) => fr.origin[k] + fr.x[k] * c + fr.y[k] * s);
  };
  const edges = [];
  for (const p of profilePieces(spec, kind)) {
    if (p.kind === 'flat') edges.push(R.makeThreePointArc(at(p.z0), at((p.z0 + p.z1) / 2), at(p.z1)));
    else {
      const pts = [];
      const n = 16;
      for (let i = 0; i <= n; i++) pts.push(at(p.z0 + ((p.z1 - p.z0) * i) / n));
      edges.push(R.makeBSplineApproximation(pts, { tolerance: 1e-6, degMax: 4, degMin: 2 }));
    }
  }
  return R.assembleWire(edges);
}

/** Sweeps a cross-section wire along fr.z for `length`, turning one revolution per pitch (a screw sweep). */
function screwSweep(wire, fr, length, P, lefthand) {
  const R = rep(); const oc = R.getOC();
  const end = fr.origin.map((v, k) => v + fr.z[k] * length);
  const spine = R.assembleWire([R.makeLine(fr.origin, end)]);
  const aux = makeHelixStable(P, length, 1, fr.origin, fr.z, lefthand);
  const b = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
  try {
    b.SetMode(aux.wrapped, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
    b.Add(wire.wrapped, false, false);
    b.Build();
    if (!b.IsDone()) throw Object.assign(new Error('thread sweep failed'), { code: 'thread-failed' });
    b.MakeSolid();
    let solid = R.cast(b.Shape());
    if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
    return solid;
  } finally { b.delete(); spine.delete(); aux.delete(); }
}

/**
 * The modelled thread solid: kind 'external' — the threaded rod itself (the material, r ≤ r(θ)); kind
 * 'internal' — the threaded hole (the region to cut from a part). From `origin` along `dir` for `length`.
 */
export function threadSolid(spec, kind, { origin = [0, 0, 0], dir = [0, 0, 1], xDir = null, length, lefthand = false }) {
  const fr = threadFrame(origin, dir, xDir);
  const L = Number(length);
  if (!(L > 0)) throw Object.assign(new Error('thread length'), { code: 'thread-failed' });
  return screwSweep(sectionWire(spec, kind, fr, { lefthand }), fr, L, spec.P, lefthand);
}

/** The volume of a modelled thread of `length` (analytic): the cross-section area times the length. */
export const threadVolume = (spec, kind, length) => sectionArea(spec, kind) * length;

// ───────────────────────── cosmetic thread data

/**
 * The cosmetic thread record a feature returns (the view draws it, drawings show it the standard way):
 * { centre (where the thread starts, on the face), dir (into the thread), length, internal, major, minor,
 *   pitch, radius (the modelled surface: the shank for external, the drilled hole for internal), size, lefthand }.
 */
export function cosmeticThread({ centre, dir, length, internal, d, P, radius = null, modelled = false, lefthand = false }) {
  const s = isoThread(d, P);
  return {
    centre: [...centre], dir: unit(dir), length, internal: Boolean(internal), pitch: P,
    major: d, minor: internal ? s.d1 : s.d3, pitchDiameter: s.d2,
    radius: radius ?? (internal ? s.d1 / 2 : d / 2), size: `${threadName(d, P)}${lefthand ? '-LH' : ''}`, modelled: Boolean(modelled), lefthand: Boolean(lefthand),
  };
}

// ───────────────────────── global option

let modelledByDefault = false;
/** The global "modelled threads" option (Settings): features with thread display 'auto' follow it. */
export const setModelledThreads = (on) => { modelledByDefault = Boolean(on); };
export const modelledThreadsGlobal = () => modelledByDefault;
/** Whether a feature models its threads: its own choice ('modelled' / 'cosmetic'), else the global option. */
export const wantsModelled = (mode) => (mode === 'modelled' || mode === true ? true : mode === 'cosmetic' || mode === false ? false : modelledByDefault);
