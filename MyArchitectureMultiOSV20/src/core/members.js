// Structural members: straight or polyline bars in 3D with a cross-section —
// the frames, braces, chords and cables that towers and bridges are made of
// (and steel or timber framing in buildings). Pure functions, no three.js.
//
// member = {
//   id, level, name?,
//   pts: [[x, y, z], …]   the axis (plan mm; z above the level's floor), ≥ 2 points
//   profile: MEMBER_PROFILES, w (width / diameter), h (depth), t (wall or flange thickness)
//   roll: degrees about the axis, role: MEMBER_ROLES, material
// }
// The axis runs through the middle of the cross-section. The section's u axis
// lies level (across the member) and v points up, turned by `roll`; a vertical
// member has u along plan x.

import { earcut } from "./earcut.js";

export const MEMBER_PROFILES = ["rect", "round", "tube", "box", "I", "H", "T", "L", "C", "cable"];
export const MEMBER_ROLES = ["beam", "column", "brace", "chord", "girder", "post", "hanger", "cable", "arch", "deck", "other"];
// IFC class of each role (src/io).
export const MEMBER_IFC = { beam: "IfcBeam", girder: "IfcBeam", chord: "IfcMember", brace: "IfcMember", column: "IfcColumn", post: "IfcColumn", hanger: "IfcMember", cable: "IfcMember", arch: "IfcMember", deck: "IfcPlate", other: "IfcMember" };

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);

// Clean a member (normalizeProject): numbers, sizes, a known profile and role.
export function normalizeMember(m) {
  m.pts = (Array.isArray(m.pts) ? m.pts : []).filter((q) => Array.isArray(q) && q.length >= 2).map((q) => [num(q[0], 0), num(q[1], 0), num(q[2], 0)]);
  m.profile = MEMBER_PROFILES.includes(m.profile) ? m.profile : "rect";
  m.w = Math.max(1, num(m.w, m.profile === "cable" ? 60 : 200));
  m.h = Math.max(1, num(m.h, m.profile === "round" || m.profile === "tube" || m.profile === "cable" ? m.w : 200));
  m.t = Math.max(0.5, Math.min(Math.min(m.w, m.h) / 2 - 0.5, num(m.t, defaultThickness(m))));
  m.roll = num(m.roll, 0);
  m.role = MEMBER_ROLES.includes(m.role) ? m.role : "beam";
  m.material = typeof m.material === "string" && m.material ? m.material : m.profile === "cable" ? "cable" : "steel";
  return m;
}
export function defaultThickness(m) {
  if (m.profile === "tube" || m.profile === "box") return Math.max(3, Math.round(Math.min(m.w, m.h || m.w) * 0.06));
  return Math.max(4, Math.round((m.h || m.w) * 0.07));
}
export const memberValid = (m) => m.pts.length >= 2 && memberLength(m) > 1;

// Cross-section {outer, hole}: rings of [u, v] (mm) about the axis, counter-clockwise.
export function memberSection(m) {
  const w = m.w, h = m.profile === "round" || m.profile === "tube" || m.profile === "cable" ? m.w : m.h, t = m.t;
  const rect = (a, b) => [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
  const circle = (d, n) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [(d / 2) * Math.cos(a), (d / 2) * Math.sin(a)]; });
  const hw = w / 2, hh = h / 2;
  switch (m.profile) {
    case "round": return { outer: circle(w, 20), hole: null };
    case "cable": return { outer: circle(w, 10), hole: null };
    case "tube": return { outer: circle(w, 20), hole: circle(Math.max(1, w - 2 * t), 20).reverse() };
    case "box": return { outer: rect(w, h), hole: rect(Math.max(1, w - 2 * t), Math.max(1, h - 2 * t)).reverse() };
    case "I":
    case "H": {
      const tf = t, tw = Math.max(1, m.profile === "H" ? t * 0.7 : t * 0.6);
      return { outer: [[-hw, -hh], [hw, -hh], [hw, -hh + tf], [tw / 2, -hh + tf], [tw / 2, hh - tf], [hw, hh - tf], [hw, hh], [-hw, hh], [-hw, hh - tf], [-tw / 2, hh - tf], [-tw / 2, -hh + tf], [-hw, -hh + tf]], hole: null };
    }
    case "T": return { outer: [[-t / 2, -hh], [t / 2, -hh], [t / 2, hh - t], [hw, hh - t], [hw, hh], [-hw, hh], [-hw, hh - t], [-t / 2, hh - t]], hole: null };
    case "L": return { outer: [[-hw, -hh], [hw, -hh], [hw, -hh + t], [-hw + t, -hh + t], [-hw + t, hh], [-hw, hh]], hole: null };
    case "C": return { outer: [[-hw, -hh], [hw, -hh], [hw, -hh + t], [-hw + t, -hh + t], [-hw + t, hh - t], [hw, hh - t], [hw, hh], [-hw, hh]], hole: null };
    default: return { outer: rect(w, h), hole: null };
  }
}

const ringArea = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
// Cross-section area in mm².
export function memberArea(m) {
  const s = memberSection(m);
  return Math.abs(ringArea(s.outer)) - (s.hole ? Math.abs(ringArea(s.hole)) : 0);
}

// Triangles of the section's face: [[u, v] × 3] (counter-clockwise).
export function sectionTriangles(section) {
  const flat = [...section.outer.flat(), ...(section.hole ? section.hole.flat() : [])];
  const pts = [...section.outer, ...(section.hole || [])];
  const idx = earcut(flat, section.hole ? [section.outer.length] : []);
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = pts[idx[i]], b = pts[idx[i + 1]], c = pts[idx[i + 2]];
    const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
    tris.push(ccw ? [a, b, c] : [a, c, b]);
  }
  return tris;
}

// Absolute axis points (z from the level's elevation).
export function memberPoints(p, m) {
  const lv = (p.levels || []).find((l) => l.id === m.level);
  const z0 = lv ? lv.elevation : 0;
  return m.pts.map(([x, y, z]) => [x, y, z0 + (z || 0)]);
}
export function memberLength(m) {
  let s = 0;
  for (let i = 1; i < m.pts.length; i++) s += Math.hypot(m.pts[i][0] - m.pts[i - 1][0], m.pts[i][1] - m.pts[i - 1][1], (m.pts[i][2] || 0) - (m.pts[i - 1][2] || 0));
  return s;
}
// Weight (kg) from the section, the length and the material's density (kg/m³).
export function memberWeight(m, density = 7850) {
  return (memberArea(m) / 1e6) * (memberLength(m) / 1000) * density;
}

// The member's frame on one segment, in plan axes (x, y, z up): t along the
// axis, u across (level unless the member is vertical) and v "up" in the section.
export function segmentFrame(a, b, roll = 0) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d) || 1;
  const t = d.map((x) => x / L);
  let u = Math.hypot(t[0], t[1]) < 1e-6 ? [1, 0, 0] : norm([t[1], -t[0], 0]); // level, across
  let v = cross(u, t);
  if (v[2] < 0 && Math.hypot(t[0], t[1]) >= 1e-6) { u = u.map((x) => -x); v = cross(u, t); }
  if (roll) {
    const c = Math.cos((roll * Math.PI) / 180), s = Math.sin((roll * Math.PI) / 180);
    const u2 = u.map((x, i) => x * c + v[i] * s), v2 = v.map((x, i) => -u[i] * s + x * c);
    u = u2; v = v2;
  }
  return { t, u, v, length: L };
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

// Plan footprint of a member: the outline of its projected axis widened by
// its width (for drawing and picking), one quad per segment.
export function memberFootprints(m) {
  const out = [];
  for (let i = 1; i < m.pts.length; i++) {
    const a = m.pts[i - 1], b = m.pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1) { const r = m.w / 2; out.push([[a[0] - r, a[1] - r], [a[0] + r, a[1] - r], [a[0] + r, a[1] + r], [a[0] - r, a[1] + r]]); continue; }
    const nx = (-dy / L) * (m.w / 2), ny = (dx / L) * (m.w / 2);
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  return out;
}
