// IFC mapping of the BIM elements (src/core/elements), used by ifc.js:
//
//   export  slabs → IfcSlab (FLOOR / BASESLAB, profile with voids for the
//           openings, layer set of the slab type), ceilings → IfcCovering
//           (CEILING), beams → IfcBeam (profile swept along the axis),
//           railings and stair railings → IfcRailing, ramps → IfcRamp,
//           curtain walls → IfcCurtainWall made of IfcMember (mullions,
//           transoms) and IfcPlate (panels), stairs by type → IfcStair with
//           IfcStairFlight and landing IfcSlab parts, shafts → one
//           IfcOpeningElement voiding each slab / ceiling it passes through.
//   import  the same entities from any IFC file (geometry), and this
//           program's own elements exactly: every element carries a
//           MyArchitecture_Element property set with its parameters.
//
// The exporter / reader objects of ifc.js are passed in; this module only uses
// their public helpers (product, extrude, local, geometry, levelFor …).

import { uid, polygonArea, pointInPolygon, labelPoint, orientedRect } from "../core/geom.js";
import { levelById, wallHeight, wallLength, openingTags } from "../core/project.js";
import { wallFrame } from "../core/walls.js";
import { stepString } from "./ifc.js";
import { memberSection, memberPoints, segmentFrame, MEMBER_IFC } from "../core/members.js";
import { DEFAULT_CURTAIN_TYPES, slabTypeById } from "../core/elements/model.js";
import {
  cutsOf, slabTop, ceilingZ, beamEnds, beamProfile, railingPath, railingParts, rampModel, stairLayout, stairRise, stairRails, STAIR_RAIL,
  curtainGrid, isCurtainWall, curtainTypeOf, shaftsAt, beamFrame, slabTypeOf,
} from "../core/elements/geometry.js";

const PSET = "MyArchitecture_Element";
const ccw = (pts) => (polygonArea(pts) < 0 ? pts.slice().reverse() : pts);
const toIfc2 = ([x, y]) => [x, -y];

function real(x) {
  const r = Math.round((Number.isFinite(x) ? x : 0) * 1e6) / 1e6;
  if (r === 0) return "0.";
  let s = String(r);
  if (s.includes("e")) { const [m, e] = s.split("e"); s = `${m.includes(".") ? m : `${m}.`}E${e}`; } else if (!s.includes(".")) s += ".";
  return s;
}

// STEP tokens built with the writer's own token class (its refs are instances).
function tokens(ex) {
  const Raw = ex.oh.constructor;
  const raw = (s) => new Raw(s);
  return {
    E: (n) => raw(`.${n}.`),
    int: (n) => raw(String(Math.round(n))),
    label: (s) => raw(`IFCLABEL(${stepString(s)})`),
    text: (s) => raw(`IFCTEXT(${stepString(s)})`),
    len: (v) => raw(`IFCLENGTHMEASURE(${real(v)})`),
    num: (v) => raw(`IFCREAL(${real(v)})`),
  };
}

// The element's own parameters (everything but id, level and BIM data that
// ifc.js already writes) for an exact round trip.
function dataOf(kind, it, extra = {}) {
  const { id, level, props, classification, group, phase, ...rest } = it;
  void id; void level; void props; void classification; void group; void phase;
  return JSON.stringify({ ...rest, ...extra, el: kind });
}

// IFC4.3 kinds of a bridge's members (IfcMemberTypeEnum, IfcBeamTypeEnum, IfcColumnTypeEnum).
function bridgeEnum(m, ex) {
  const st = (ex.p.structures || []).find((s) => s.id === m.structure);
  const type = st && st.params.type;
  if (m.role === "cable") return /cable/i.test(m.name || "") || type === "suspension" ? "SUSPENSION_CABLE" : "STAY_CABLE";
  if (m.role === "hanger") return "SUSPENDER";
  if (m.role === "arch") return "ARCH_SEGMENT";
  if (m.role === "girder") return "GIRDER_SEGMENT";
  if (m.role === "beam" && m.name === "Pier cap") return "PIERCAP";
  if (m.role === "column" && m.name === "Pier") return "PIERSTEM";
  return null;
}

// ================================================================ export
export function exportElements(ex, lv) {
  const { p, v4 } = ex;
  const T = tokens(ex);
  const storey = ex.storeyPlc.get(lv.id);
  const el = lv.elevation;
  const own = (ref, kind, it, extra) => ex.addPset(ref, PSET, [["Kind", T.label(kind)], ["Data", T.text(dataOf(kind, it, extra))]]);
  const prismItem = (pts, z0, z1, style) => ex.style(ex.extrude(ex.polyProfile(pts.map(toIfc2)), Math.max(1, z1 - z0), ex.place3([0, 0, z0])), style);
  const voidsProfile = (outer, holes) => {
    const ring = (pts) => { const r = pts.map(toIfc2); return ex.add("IFCPOLYLINE", [[...r, r[0]].map((q) => ex.pt([q[0], q[1]]))]); };
    if (!holes.length) return ex.polyProfile(outer.map(toIfc2));
    // Outer counter-clockwise, voids clockwise (in IFC axes, y flipped).
    const outerI = ccw(outer.map(toIfc2));
    const holesI = holes.map((h) => { const r = h.map(toIfc2); return polygonArea(r) > 0 ? r.slice().reverse() : r; });
    const poly = (r) => ex.add("IFCPOLYLINE", [[...r, r[0]].map((q) => ex.pt([q[0], q[1]]))]);
    void ring;
    return ex.add("IFCARBITRARYPROFILEDEFWITHVOIDS", [T.E("AREA"), null, poly(outerI), holesI.map(poly)]);
  };
  const layerUsage = (st, offset) => {
    if (!st) return;
    const set = ex.layerSet(st.name, st.layers);
    return ex.add("IFCMATERIALLAYERSETUSAGE", v4 ? [set, T.E("AXIS3"), T.E("NEGATIVE"), offset, null] : [set, T.E("AXIS3"), T.E("NEGATIVE"), offset]);
  };
  const hosts = new Map(); // element id → IFC ref (shafts void them)
  const tags = openingTags(p);

  // ---- floor slabs and foundations
  for (const s of (p.slabs || []).filter((x) => x.level === lv.id)) {
    const holes = (s.holes || []);
    let item;
    if (s.slope > 0) {
      const top = slabTop(p, s);
      item = ex.style(ex.brepPrism(ccw(s.pts).map(([x, y]) => [x, -y, top(x, y) - el]), [0, 0, -s.thickness]), "slab");
    } else item = ex.style(ex.extrude(voidsProfile(s.pts, holes), s.thickness, ex.place3([0, 0, (s.offset || 0) - s.thickness])), "slab");
    const st = slabTypeOf(p, s);
    const ref = ex.product("IFCSLAB", s.id, { name: s.name || (s.kind === "foundation" ? "Foundation" : "Floor"), objectType: st ? st.name : null, placement: ex.local(storey), shape: ex.shape([ex.body([item], s.slope > 0 ? "Brep" : "SweptSolid")]), tag: s.id }, [T.E(s.kind === "foundation" ? "BASESLAB" : "FLOOR")]);
    ex.contain(lv.id, ref);
    ex.bim(ref, s, "Pset_SlabCommon");
    own(ref, "slab", s);
    const usage = layerUsage(st, s.offset || 0);
    if (usage) ex.add("IFCRELASSOCIATESMATERIAL", [ex.guid(`${s.id}:material`), ex.oh, null, null, [ref], usage]);
    hosts.set(s.id, { ref, z0: (s.offset || 0) - s.thickness - 10, z1: (s.offset || 0) + 10 + (s.slope > 0 ? 1e4 : 0) });
  }
  // ---- ceilings
  for (const c of (p.ceilings || []).filter((x) => x.level === lv.id)) {
    const z = ceilingZ(p, c) - el;
    const item = ex.style(ex.extrude(voidsProfile(c.pts, c.holes || []), c.thickness, ex.place3([0, 0, z])), "wall");
    const ref = ex.product("IFCCOVERING", c.id, { name: "Ceiling", placement: ex.local(storey), shape: ex.shape([ex.body([item])]), tag: c.id }, [T.E("CEILING")]);
    ex.contain(lv.id, ref);
    ex.bim(ref, c, "Pset_CoveringCommon");
    own(ref, "ceiling", c);
    hosts.set(c.id, { ref, z0: z - 10, z1: z + c.thickness + 10 });
  }
  // ---- beams and braces: the profile swept along the axis
  for (const b of (p.beams || []).filter((x) => x.level === lv.id)) {
    const [z1, z2] = beamEnds(p, b);
    const a = [b.x1, -b.y1, z1 - el], e = [b.x2, -b.y2, z2 - el];
    const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
    const L = Math.hypot(...d) || 1;
    const Z = d.map((c) => c / L);
    let Y = [-Z[0] * Z[2], -Z[1] * Z[2], 1 - Z[2] * Z[2]];
    const yl = Math.hypot(...Y);
    Y = yl > 1e-6 ? Y.map((c) => c / yl) : [0, 1, 0];
    const X = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];
    const prof = ex.polyProfile(beamProfile(b));
    const item = ex.style(ex.extrude(prof, L), "column");
    const plc = ex.add("IFCLOCALPLACEMENT", [storey, ex.place3(a, Z, X)]);
    const axis = ex.add("IFCSHAPEREPRESENTATION", [ex.ctxAxis, "Axis", "Curve3D", [ex.add("IFCPOLYLINE", [[ex.pt([0, 0, 0]), ex.pt([0, 0, L])]])]]);
    const brace = Math.abs(z2 - z1) > 1;
    const ref = ex.product(brace && v4 ? "IFCMEMBER" : "IFCBEAM", b.id, { name: brace ? "Brace" : "Beam", objectType: `${b.profile} ${b.w}x${b.h}`, placement: plc, shape: ex.shape([ex.body([item]), axis]), tag: b.id }, v4 ? [T.E(brace ? "BRACE" : "BEAM")] : []);
    ex.contain(lv.id, ref);
    ex.bim(ref, b, brace && v4 ? "Pset_MemberCommon" : "Pset_BeamCommon");
    own(ref, "beam", b);
  }
  // ---- structural members: the section extruded along every segment of the
  // axis (profile axes u, v; extrusion along t), as IfcMember / IfcBeam /
  // IfcColumn / IfcPlate by role. The first member of a tower or bridge
  // carries the structure's parameters, so it comes back editable.
  const MEMBER_ENUM = { beam: "BEAM", girder: "BEAM", column: "COLUMN", post: "COLUMN", brace: "BRACE", chord: "CHORD", hanger: "MEMBER", cable: "MEMBER", arch: "MEMBER", deck: "SHEET", other: "MEMBER" };
  const sectionProfile = (sec) => {
    if (!sec.hole) return ex.polyProfile(sec.outer);
    const poly = (r) => ex.add("IFCPOLYLINE", [[...r, r[0]].map((q) => ex.pt([q[0], q[1]]))]);
    return ex.add("IFCARBITRARYPROFILEDEFWITHVOIDS", [T.E("AREA"), null, poly(ccw(sec.outer)), [poly(ccw(sec.hole).slice().reverse())]]);
  };
  const told = new Set();
  for (const m of (p.members || []).filter((x) => x.level === lv.id)) {
    const prof = sectionProfile(memberSection(m));
    const pts = memberPoints(p, m);
    const items = [];
    for (let i = 1; i < pts.length; i++) {
      const f = segmentFrame(pts[i - 1], pts[i], m.roll || 0);
      if (f.length < 1) continue;
      const a = pts[i - 1];
      items.push(ex.style(ex.extrude(prof, f.length, ex.place3([a[0], -a[1], a[2] - el], [f.t[0], -f.t[1], f.t[2]], [f.u[0], -f.u[1], f.u[2]])), "column"));
    }
    if (!items.length) continue;
    const cls = (MEMBER_IFC[m.role] || "IfcMember").toUpperCase();
    const bridge = ex.v43 && m.structure && ex.bridges && ex.bridges.get(m.structure);
    const ref = ex.product(cls, m.id, { name: m.name || m.role, objectType: `${m.profile} ${m.w}x${m.h}`, placement: ex.local(storey), shape: ex.shape([ex.body(items)]), tag: m.id }, v4 ? [T.E((bridge && bridgeEnum(m, ex)) || MEMBER_ENUM[m.role] || "NOTDEFINED")] : []);
    if (bridge) ex.containIn(bridge, ref); // IFC4.3: in its IfcBridge
    else ex.contain(lv.id, ref);
    ex.bim(ref, m, cls === "IFCCOLUMN" ? "Pset_ColumnCommon" : cls === "IFCBEAM" ? "Pset_BeamCommon" : cls === "IFCPLATE" ? "Pset_PlateCommon" : "Pset_MemberCommon");
    const st = m.structure && !told.has(m.structure) ? (p.structures || []).find((x) => x.id === m.structure) : null;
    if (st) told.add(st.id);
    own(ref, "member", m, st ? { structureRecord: { kind: st.kind, name: st.name, params: st.params } } : {});
  }
  // ---- railings (free ones and the ones stairs carry)
  const railing = (key, base, r, name, typeEnum, data) => {
    const parts = railingParts(base, r);
    const items = [];
    const H = parts.height;
    const relz = (q) => q[2] - el;
    for (const q of parts.posts) items.push(prismItem(sq(q, Math.max(40, r.baluster * 2)), relz(q), relz(q) + H, "furniture"));
    for (const q of parts.balusters) items.push(prismItem(sq(q, r.baluster), relz(q), relz(q) + H - r.rail / 2, "furniture"));
    for (let i = 0; i + 1 < parts.rail.length; i++) {
      const A = parts.rail[i], B = parts.rail[i + 1];
      const pts = [[A[0], -A[1], relz(A)], [B[0], -B[1], relz(B)]];
      const d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
      const L = Math.hypot(...d);
      if (L < 1) continue;
      const Z = d.map((c) => c / L);
      let Y = [-Z[0] * Z[2], -Z[1] * Z[2], 1 - Z[2] * Z[2]];
      const yl = Math.hypot(...Y); Y = yl > 1e-6 ? Y.map((c) => c / yl) : [0, 1, 0];
      const X = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];
      items.push(ex.style(ex.extrude(ex.rectProfile(r.rail, r.rail), L, ex.place3([pts[0][0], pts[0][1], pts[0][2] - r.rail / 2], Z, X)), "furniture"));
    }
    for (const pn of parts.panels) {
      const [a, b] = pn;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const corners = [[-len / 2, -12], [len / 2, -12], [len / 2, 12], [-len / 2, 12]].map(([u, v]) => [mid[0] + u * Math.cos(ang) - v * Math.sin(ang), mid[1] + u * Math.sin(ang) + v * Math.cos(ang)]);
      items.push(prismItem(corners, relz(a) + 100, relz(a) + H - r.rail, r.style === "glass" ? "window" : "furniture"));
    }
    if (!items.length) return null;
    const ref = ex.product("IFCRAILING", key, { name, placement: ex.local(storey), shape: ex.shape([ex.body(items)]), tag: key }, [T.E(typeEnum)]);
    ex.contain(lv.id, ref);
    return { ref, data };
  };
  for (const r of (p.railings || []).filter((x) => x.level === lv.id)) {
    const got = railing(r.id, railingPath(p, r), r, "Railing", "GUARDRAIL");
    if (!got) continue;
    ex.bim(got.ref, r, "Pset_RailingCommon", [["Height", T.len(r.height)]]);
    own(got.ref, "railing", r);
  }
  for (const s of p.stairs.filter((x) => x.level === lv.id)) {
    stairRails(p, s).forEach((rail, i) => {
      const got = railing(`${s.id}:rail${i}`, rail, STAIR_RAIL, "Handrail", "HANDRAIL");
      if (got) ex.addPset(got.ref, PSET, [["Kind", T.label("stair-railing")], ["Data", T.text(JSON.stringify({ el: "stair-railing", x: s.x, y: s.y, railing: s.railing }))]]);
    });
  }
  // ---- ramps
  for (const r of (p.ramps || []).filter((x) => x.level === lv.id)) {
    const m = rampModel(p, r);
    const items = [];
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const top = [[m.left[i], m.z[i]], [m.left[i + 1], m.z[i + 1]], [m.right[i + 1], m.z[i + 1]], [m.right[i], m.z[i]]].map(([q, z]) => [q[0], -q[1], z - el]);
      items.push(ex.style(ex.brepPrism(top, [0, 0, -r.thickness]), "slab"));
    }
    const ramp = ex.product("IFCRAMP", r.id, { name: "Ramp", placement: ex.local(storey), shape: ex.shape([ex.body(items, "Brep")]), tag: r.id }, [T.E(r.pts.length > 2 ? "QUARTER_TURN_RAMP" : "STRAIGHT_RUN_RAMP")]);
    ex.contain(lv.id, ramp);
    ex.bim(ramp, r, "Pset_RampCommon");
    own(ramp, "ramp", r);
  }
  // ---- stairs by type (straight stairs are written by ifc.js)
  for (const s of p.stairs.filter((x) => x.level === lv.id && x.shape)) {
    const lay = stairLayout(s, stairRise(p, s));
    const flights = lay.treads.map((tr) => prismItem(tr.pts, Math.max(0, tr.z - Math.max(180, lay.riser) - 120), tr.z, "stair"));
    const stair = ex.product("IFCSTAIR", s.id, { name: "Stair", objectType: s.shape, placement: ex.local(storey), tag: s.id }, [T.E({ L: "QUARTER_TURN_STAIR", U: "HALF_TURN_STAIR", spiral: "SPIRAL_STAIR" }[s.shape] || "NOTDEFINED")]);
    const n = Math.max(1, lay.treads.length);
    const flight = ex.product("IFCSTAIRFLIGHT", `${s.id}:flight`, { name: "Flights", placement: ex.local(storey), shape: ex.shape([ex.body(flights)]) }, v4 ? [T.int(n + 1), T.int(n), lay.riser, s.length / Math.max(1, lay.n1), T.E(s.shape === "spiral" ? "SPIRAL" : "STRAIGHT")] : [T.int(n + 1), T.int(n), lay.riser, s.length / Math.max(1, lay.n1)]);
    const parts = [flight];
    lay.landings.forEach((ld, i) => {
      const item = prismItem(ld.pts, ld.z - 200, ld.z, "stair");
      parts.push(ex.product("IFCSLAB", `${s.id}:landing${i}`, { name: "Landing", placement: ex.local(storey), shape: ex.shape([ex.body([item])]) }, [T.E("LANDING")]));
    });
    ex.aggregate(`stair:${s.id}`, stair, parts);
    ex.contain(lv.id, stair);
    ex.bim(stair, s, "Pset_StairCommon", [["NumberOfRiser", T.int(s.steps)], ["RiserHeight", T.len(lay.riser)]]);
    own(stair, "stair", s);
  }
  // ---- curtain walls
  for (const w of p.walls.filter((x) => x.level === lv.id && isCurtainWall(p, x))) {
    const H = wallHeight(p, w);
    const g = curtainGrid(p, w, H);
    const f = wallFrame(w);
    const X = [f.d[0], -f.d[1]];
    const plc = ex.local(storey, [w.x1, -w.y1, w.baseOffset || 0], [X[0], X[1], 0]);
    const cw = ex.product("IFCCURTAINWALL", w.id, { name: w.name || "Curtain wall", objectType: (curtainTypeOf(p, w) || {}).name || null, placement: plc, tag: w.id }, v4 ? [T.E("NOTDEFINED")] : []);
    const m = g.c.mullion, dp = g.c.depth;
    const parts = [];
    const box = (u0, u1, z0, z1, th, style) => ex.style(ex.extrude(ex.polyProfile([[u0, -th / 2], [u1, -th / 2], [u1, th / 2], [u0, th / 2]]), Math.max(1, z1 - z0), ex.place3([0, 0, z0])), style);
    g.us.forEach((u, i) => {
      const uu = Math.min(g.L - m / 2, Math.max(m / 2, u));
      parts.push(ex.product("IFCMEMBER", `${w.id}:m${i}`, { name: "Mullion", placement: ex.local(plc), shape: ex.shape([ex.body([box(uu - m / 2, uu + m / 2, 0, H - (w.baseOffset || 0), dp, "furniture")])]) }, v4 ? [T.E("MULLION")] : []));
    });
    g.zs.forEach((z, j) => {
      const zz = Math.min(H - m / 2, Math.max(m / 2, z));
      parts.push(ex.product("IFCMEMBER", `${w.id}:t${j}`, { name: "Transom", placement: ex.local(plc), shape: ex.shape([ex.body([box(0, g.L, zz - m / 2, zz + m / 2, dp * 0.8, "furniture")])]) }, v4 ? [T.E("MULLION")] : []));
    });
    const spans = p.openings.filter((o) => o.wall === w.id).map((o) => ({ u1: o.at - o.width / 2, u2: o.at + o.width / 2, z1: o.sill, z2: o.sill + o.height }));
    for (let i = 0; i + 1 < g.us.length; i++) for (let j = 0; j + 1 < g.zs.length; j++) {
      const u1 = g.us[i], u2 = g.us[i + 1], z1 = g.zs[j], z2 = g.zs[j + 1];
      if (spans.some((sp) => sp.u1 < u2 - 1 && sp.u2 > u1 + 1 && sp.z1 < z2 - 1 && sp.z2 > z1 + 1)) continue;
      const spandrel = g.c.spandrel > 0 && z1 >= H - g.c.spandrel - 1;
      parts.push(ex.product("IFCPLATE", `${w.id}:p${i}.${j}`, { name: spandrel ? "Spandrel panel" : "Glazing panel", placement: ex.local(plc), shape: ex.shape([ex.body([box(u1 + m / 2, u2 - m / 2, z1 + m / 2, z2 - m / 2, 24, spandrel ? "furniture" : "window")])]) }, v4 ? [T.E("CURTAIN_PANEL")] : []));
    }
    ex.aggregate(`cw:${w.id}`, cw, parts);
    // Doors and windows take the place of panels: openings in the curtain wall.
    for (const o of p.openings.filter((x) => x.wall === w.id)) ex.opening(lv, w, o, plc, cw, tags.get(o.id));
    ex.contain(lv.id, cw);
    ex.bim(cw, w, "Pset_CurtainWallCommon");
    own(cw, "curtainwall", w, { curtainType: curtainTypeOf(p, w) });
    hosts.set(w.id, { ref: cw });
    void wallLength;
  }
  // ---- shafts: an opening element voiding every slab and ceiling it passes
  for (const s of shaftsAt(p, lv.id)) {
    let first = true;
    for (const host of [...(p.slabs || []), ...(p.ceilings || [])].filter((x) => x.level === lv.id)) {
      const h = hosts.get(host.id);
      if (!h || !s.pts.some(([x, y]) => pointInPolygon(x, y, host.pts)) && !host.pts.some(([x, y]) => pointInPolygon(x, y, s.pts))) continue;
      const item = ex.extrude(ex.polyProfile(s.pts.map(toIfc2)), h.z1 - h.z0, ex.place3([0, 0, h.z0]));
      const op = ex.product("IFCOPENINGELEMENT", `${s.id}:${host.id}`, { name: s.name || "Shaft", objectType: "Shaft", placement: ex.local(storey), shape: ex.shape([ex.body([item])]), tag: s.id }, v4 ? [T.E("OPENING")] : []);
      ex.add("IFCRELVOIDSELEMENT", [ex.guid(`${s.id}:${host.id}:voids`), ex.oh, null, null, h.ref, op]);
      if (first && s.level === lv.id) { own(op, "shaft", s, { top: (levelById(p, s.top) || {}).name || null, base: lv.name }); first = false; }
    }
  }
}

const sq = (q, s) => [[q[0] - s / 2, q[1] - s / 2], [q[0] + s / 2, q[1] - s / 2], [q[0] + s / 2, q[1] + s / 2], [q[0] - s / 2, q[1] + s / 2]];

// Wall profiles (sloped top, base offset, attached top) kept for the round trip.
export function exportWallExtras(ex, ref, w) {
  if (!w.heightEnd && !w.baseOffset && !w.attachTop) return;
  const T = tokens(ex);
  ex.addPset(ref, PSET, [["Kind", T.label("wall-profile")], ["Data", T.text(JSON.stringify({ el: "wall-profile", heightEnd: w.heightEnd || null, baseOffset: w.baseOffset || 0, attachTop: w.attachTop ? (w.attachTop === "roof" ? "roof" : "roof") : null }))]]);
}

// Roof extras (per-edge slopes, openings) kept for the round trip.
export function exportRoofExtras(ex, ref, r) {
  if (r.kind !== "edges" && !(r.holes && r.holes.length)) return;
  const T = tokens(ex);
  ex.addPset(ref, PSET, [["Kind", T.label("roof")], ["Data", T.text(JSON.stringify({ el: "roof", pts: r.pts, roofKind: r.kind, edges: r.edges, holes: r.holes }))]]);
}

// ================================================================ import
// After the walls are read: this program's own elements (exact, from the
// property set) and curtain walls; their entities are marked consumed so the
// readers of ifc.js leave them alone.
const val = (v) => (v && typeof v === "object" && !Array.isArray(v) && "typed" in v ? val(v.value) : v);

function ownData(rd, id) {
  const props = rd.props(id);
  const d = props.get(`${PSET}.Data`);
  if (typeof d !== "string") return null;
  try { return JSON.parse(d); } catch { return null; }
}

export function readElements(rd) {
  const out = { slabs: [], ceilings: [], beams: [], railings: [], ramps: [], shafts: [], stairs: [], wallTypes: [], stairRails: [], roofs: [], foreignSlabs: [], members: [], structures: [] };
  rd.elementsRead = out;
  const app = (rd.byType.get("IFCAPPLICATION") || []).map((i) => rd.ents.get(i)).some((e) => /myarchitecture/i.test(String(val(e.args[2]) || "") + String(val(e.args[3]) || "")));
  rd.ownFile = app;
  const levelById2 = (id) => rd.levels.find((l) => l.id === id);
  const take = (types, fn) => { for (const id of types.flatMap((t) => rd.byType.get(t) || [])) { if (rd.consumed.has(id)) continue; fn(id); } };
  const restore = (id, list, d, extra = {}) => {
    const g = rd.geometry(id);
    const lv = rd.levelFor(id, g.M);
    const { el, curtainType, top, base, ...rest } = d;
    void el; void base;
    const it = rd.applyBim({ id: uid(list.slice(0, 2)), level: lv.id, ...rest, ...extra }, id);
    if (it.props) { for (const k of Object.keys(it.props)) if (k.startsWith(`${PSET}.`)) delete it.props[k]; if (!Object.keys(it.props).length) delete it.props; }
    rd.consumed.add(id);
    for (const k of rd.children.get(id) || []) rd.consumed.add(k);
    void curtainType; void top;
    return it;
  };
  // ---- own elements (exact)
  take(["IFCSLAB", "IFCSLABSTANDARDCASE"], (id) => { const d = ownData(rd, id); if (d && d.el === "slab") out.slabs.push(restore(id, "slabs", d)); else if (!rd.ownFile) out.foreignSlabs.push(id); });
  take(["IFCCOVERING"], (id) => {
    const d = ownData(rd, id);
    if (d && d.el === "ceiling") { out.ceilings.push(restore(id, "ceilings", d)); return; }
    const e = rd.ents.get(id);
    const pt = (val(e.args[8]) || {}).enum || (e.args[8] && e.args[8].enum);
    if (pt !== "CEILING") return;
    const g = rd.geometry(id);
    const fp = rd.footprint(g);
    if (!fp || fp.length < 3) return;
    const lv = rd.levelFor(id, g.M);
    const z = (g.ext ? g.ext.base : Math.min(...g.points.map((q) => q[2]))) * rd.lu - lv.elevation;
    out.ceilings.push(rd.applyBim({ id: uid("cl"), level: lv.id, pts: fp.map((q) => rd.plan(q)), holes: [], thickness: g.ext ? Math.max(1, g.ext.height * rd.lu) : 20, height: Math.max(100, Math.round(z)) }, id));
    rd.consumed.add(id);
  });
  // Structural members written by us (any class), with their tower / bridge.
  take(["IFCMEMBER", "IFCMEMBERSTANDARDCASE", "IFCBEAM", "IFCBEAMSTANDARDCASE", "IFCCOLUMN", "IFCCOLUMNSTANDARDCASE", "IFCPLATE", "IFCPLATESTANDARDCASE"], (id) => {
    const d = ownData(rd, id);
    if (!d || d.el !== "member") return;
    const { structureRecord, ...rest } = d;
    const m = restore(id, "members", rest);
    if (m.structure) {
      m.group = m.structure;
      if (structureRecord && !out.structures.some((s) => s.id === m.structure)) out.structures.push({ id: m.structure, level: m.level, ...structureRecord });
    }
    out.members.push(m);
  });
  take(["IFCBEAM", "IFCBEAMSTANDARDCASE", "IFCMEMBER"], (id) => {
    const d = ownData(rd, id);
    if (d && d.el === "beam") { out.beams.push(restore(id, "beams", d)); return; }
    if (rd.parent.has(id) && (rd.ents.get(rd.parent.get(id)) || {}).type === "IFCCURTAINWALL") return; // a mullion
    const e = rd.ents.get(id);
    if (e.type === "IFCMEMBER") return;
    // A foreign beam: the longest horizontal extent of its body is the axis.
    const g = rd.geometry(id);
    if (!g.points.length) return;
    const lv = rd.levelFor(id, g.M);
    const pts = g.points.map((q) => rd.plan(q));
    const r = orientedRect(pts);
    if (!(r.len > 100)) return;
    const a = (r.angle * Math.PI) / 180;
    const zs = g.points.map((q) => rd.z(q));
    const top = Math.max(...zs) - lv.elevation, bot = Math.min(...zs) - lv.elevation;
    out.beams.push(rd.applyBim({ id: uid("bm"), level: lv.id, x1: r.cx - (Math.cos(a) * r.len) / 2, y1: r.cy - (Math.sin(a) * r.len) / 2, x2: r.cx + (Math.cos(a) * r.len) / 2, y2: r.cy + (Math.sin(a) * r.len) / 2, w: Math.max(10, Math.round(r.wid)), h: Math.max(10, Math.round(top - bot)), profile: "rect", z1: Math.round(top), z2: Math.round(top), material: "concrete" }, id));
    rd.consumed.add(id);
  });
  take(["IFCRAILING"], (id) => {
    const d = ownData(rd, id);
    if (d && d.el === "railing") { out.railings.push(restore(id, "railings", d)); return; }
    if (d && d.el === "stair-railing") { out.stairRails.push(d); rd.consumed.add(id); return; }
    const g = rd.geometry(id);
    if (!g.points.length) return;
    const lv = rd.levelFor(id, g.M);
    const r = orientedRect(g.points.map((q) => rd.plan(q)));
    if (!(r.len > 200)) return;
    const a = (r.angle * Math.PI) / 180;
    const zs = g.points.map((q) => rd.z(q));
    out.railings.push(rd.applyBim({ id: uid("rl"), level: lv.id, pts: [[r.cx - (Math.cos(a) * r.len) / 2, r.cy - (Math.sin(a) * r.len) / 2], [r.cx + (Math.cos(a) * r.len) / 2, r.cy + (Math.sin(a) * r.len) / 2]].map((q) => q.map(Math.round)), height: Math.max(300, Math.round(Math.max(...zs) - Math.min(...zs))), z: Math.round(Math.min(...zs) - lv.elevation) }, id));
    rd.consumed.add(id);
  });
  take(["IFCRAMP"], (id) => {
    const d = ownData(rd, id);
    if (d && d.el === "ramp") { out.ramps.push(restore(id, "ramps", d)); return; }
    const kids = rd.children.get(id) || [];
    const g = rd.geometry(id);
    const pts = [...g.points, ...kids.flatMap((k) => rd.geometry(k).points)];
    if (!pts.length) return;
    const lv = rd.levelFor(id, g.M);
    const r = orientedRect(pts.map((q) => rd.plan(q)));
    const zs = pts.map((q) => rd.z(q));
    const a = (r.angle * Math.PI) / 180;
    // The low end first.
    let A = [r.cx - (Math.cos(a) * r.len) / 2, r.cy - (Math.sin(a) * r.len) / 2], B = [r.cx + (Math.cos(a) * r.len) / 2, r.cy + (Math.sin(a) * r.len) / 2];
    const zAt = (P) => { let best = null; for (const q of pts) { const dd = Math.hypot(rd.plan(q)[0] - P[0], rd.plan(q)[1] - P[1]); if (!best || dd < best.d) best = { d: dd, z: rd.z(q) }; } return best ? best.z : 0; };
    if (zAt(A) > zAt(B)) [A, B] = [B, A];
    out.ramps.push(rd.applyBim({ id: uid("rp"), level: lv.id, pts: [A, B].map((q) => q.map(Math.round)), width: Math.max(300, Math.round(r.wid)), rise: Math.round(Math.max(...zs) - Math.min(...zs) - 150), thickness: 150 }, id));
    rd.consumed.add(id);
    for (const k of kids) rd.consumed.add(k);
  });
  take(["IFCSTAIR"], (id) => { const d = ownData(rd, id); if (d && d.el === "stair") out.stairs.push(restore(id, "stairs", d)); });
  take(["IFCOPENINGELEMENT"], (id) => {
    const d = ownData(rd, id);
    if (d && d.el === "shaft") {
      const it = restore(id, "shafts", d);
      const topLv = rd.levels.find((l) => l.name === d.top);
      it.top = topLv ? topLv.id : it.level;
      out.shafts.push(it);
    } else if (d === null && /shaft/i.test(String(val(rd.ents.get(id).args[4]) || ""))) rd.consumed.add(id);
    void levelById2;
  });
  // Every other opening of ours (one per shaft and host) is part of a shaft.
  for (const id of rd.byType.get("IFCOPENINGELEMENT") || []) if (String(val(rd.ents.get(id).args[4]) || "") === "Shaft") rd.consumed.add(id);
  // ---- curtain walls: the walls ifc.js read from IfcCurtainWall get a curtain type
  for (const id of rd.byType.get("IFCCURTAINWALL") || []) {
    for (const k of rd.children.get(id) || []) rd.consumed.add(k);
    const d = ownData(rd, id);
    let walls = rd.wallsOf.get(id) || [];
    if (d && d.el === "curtainwall" && walls.length) {
      // ifc.js approximated it from its parts: put the exact wall back.
      const { el, curtainType, ...rest } = d;
      void el; void curtainType;
      Object.assign(walls[0], rest);
      for (const extra of walls.slice(1)) rd.walls.splice(rd.walls.indexOf(extra), 1);
      walls = [walls[0]];
      rd.wallsOf.set(id, walls);
      if (rd.counts.wallBrep) rd.counts.wallBrep--;
    }
    if (d && d.el === "curtainwall" && !walls.length) {
      // Ours has no body of its own (the members and plates are the body).
      const lv = rd.levelFor(id, rd.placement(rd.ents.get(id).args[5]));
      const { el, curtainType, ...rest } = d;
      void el; void curtainType;
      const w = rd.applyBim({ id: uid("w"), level: lv.id, ...rest }, id);
      if (w.props) { for (const k of Object.keys(w.props)) if (k.startsWith(`${PSET}.`)) delete w.props[k]; if (!Object.keys(w.props).length) delete w.props; }
      rd.walls.push(w);
      rd.wallsOf.set(id, [w]);
      walls = [w];
      if (rd.counts.wallNoGeometry) rd.counts.wallNoGeometry--;
      rd.consumed.add(id);
    }
    let type = d && d.curtainType ? d.curtainType : null;
    if (!type) type = JSON.parse(JSON.stringify(DEFAULT_CURTAIN_TYPES[0]));
    if (!out.wallTypes.some((t) => t.id === type.id)) out.wallTypes.push(type);
    for (const w of walls) {
      w.type = type.id;
      w.thickness = type.curtain.depth;
      if (d && d.curtain) w.curtain = d.curtain;
      if (d && d.baseOffset) w.baseOffset = d.baseOffset;
    }
  }
  // ---- roofs: per-edge slopes and openings come back from the property set
  for (const id of rd.byType.get("IFCROOF") || []) { const d = ownData(rd, id); if (d && d.el === "roof") out.roofs.push(d); }
  return out;
}

// Last step, on the new project (before it is normalized).
export function importElementsInto(rd, p) {
  const out = rd.elementsRead;
  if (!out) return;
  for (const k of ["slabs", "ceilings", "beams", "railings", "ramps", "shafts", "members", "structures"]) p[k] = out[k];
  // Foreign floor slabs (files from other programs): their outline and thickness.
  for (const id of out.foreignSlabs) {
    const e = rd.ents.get(id);
    const parent = rd.ents.get(rd.parent.get(id));
    if (parent && (parent.type === "IFCROOF" || parent.type === "IFCSTAIR" || parent.type === "IFCRAMP")) continue;
    const pt = e.args[8] && e.args[8].enum;
    if (pt && !["FLOOR", "BASESLAB", "NOTDEFINED", "USERDEFINED"].includes(pt)) continue;
    const g = rd.geometry(id);
    const fp = rd.footprint(g);
    if (!fp || fp.length < 3) continue;
    const lv = rd.levelFor(id, g.M);
    const zs = g.points.map((q) => rd.z(q));
    const th = g.ext && g.ext.vertical ? g.ext.height * rd.lu : Math.max(...zs) - Math.min(...zs);
    const top = Math.max(...zs) - lv.elevation;
    const pts = fp.map((q) => rd.plan(q));
    if (Math.abs(polygonArea(pts)) < 1e4) continue;
    p.slabs.push(rd.applyBim({ id: uid("sl"), level: lv.id, pts, holes: [], thickness: Math.max(10, Math.round(th)), offset: Math.abs(top) < 1 ? 0 : Math.round(top), kind: pt === "BASESLAB" ? "foundation" : "floor" }, id));
  }
  if (out.foreignSlabs.length) rd.warnings.splice(0, rd.warnings.length, ...rd.warnings.filter((w) => !/floor slabs on storeys without spaces/.test(w)));
  // Stairs by type replace the straight stand-ins (none are read for them).
  p.stairs.push(...out.stairs);
  for (const d of out.stairRails) {
    const s = p.stairs.find((q) => Math.abs(q.x - d.x) < 2 && Math.abs(q.y - d.y) < 2);
    if (s) s.railing = d.railing;
  }
  for (const wt of out.wallTypes) if (!p.wallTypes.some((x) => x.id === wt.id)) p.wallTypes.push(wt);
  // Wall profiles from the property set (ifc.js keeps unknown sets as props).
  for (const w of p.walls) {
    const raw = w.props && w.props[`${PSET}.Data`];
    if (typeof raw !== "string") continue;
    try { const d = JSON.parse(raw); if (d.heightEnd) w.heightEnd = d.heightEnd; if (d.baseOffset) w.baseOffset = d.baseOffset; if (d.attachTop) w.attachTop = d.attachTop; } catch { /* not ours */ }
    for (const k of Object.keys(w.props)) if (k.startsWith(`${PSET}.`)) delete w.props[k];
    if (!Object.keys(w.props).length) delete w.props;
  }
  for (const d of out.roofs) {
    const [cx, cy] = labelPoint(d.pts);
    const r = p.roofs.find((q) => pointInPolygon(cx, cy, q.pts));
    if (!r) continue;
    r.pts = d.pts; r.kind = d.roofKind; if (d.edges) r.edges = d.edges; if (d.holes) r.holes = d.holes;
  }
  // Our property set is read back above; it must not stay as free properties.
  for (const k of Object.keys(p)) {
    if (!Array.isArray(p[k])) continue;
    for (const it of p[k]) {
      if (!it || !it.props) continue;
      for (const key of Object.keys(it.props)) if (key.startsWith(`${PSET}.`)) delete it.props[key];
      if (!Object.keys(it.props).length) delete it.props;
    }
  }
  void slabTypeById; void cutsOf; void beamFrame;
}
