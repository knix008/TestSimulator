// gbXML writer (.xml / .gbxml, schema 7.03 — read by 6.01 tools as well):
// the project as an energy-analysis model for OpenStudio, DesignBuilder,
// IES VE, Trane TRACE, Revit Systems Analysis and the like.
//
//   Campus / Location        site (address, latitude, longitude, north)
//   Building                 the project; area = sum of the rooms
//   BuildingStorey           one per level (Level = elevation in m)
//   Space                    one per room: area, volume, ClosedShell (the
//                            room prism) and a SpaceBoundary per surface
//   Surface                  wall pieces (split where the room on either
//                            side changes), floors, ceilings and roofs, with
//                            surfaceType and the 1–2 spaces they separate
//                            (AdjacentSpaceId; the polygon is counter-
//                            clockwise seen from outside the first space,
//                            so its normal points away from that space)
//   Opening                  doors, windows and plain openings in their wall
//                            surface (OperableWindow, FixedWindow,
//                            NonSlidingDoor, SlidingDoor, Air)
//   Construction/Layer/Material   wall types with their layers, plain walls
//                            by thickness, roof and floor slabs
//
// Coordinates are metres, x east, y north, z up (our plan y points down, so
// y is negated). Wall surfaces lie on the wall centre lines
// (SurfaceReferenceLocation="Centerline"). Demolished elements are left out:
// the model is the building after the works.

import { levelById, wallHeight, wallTypeOf, wallLength, openingsOf, DEFAULTS } from "../core/project.js";
import { polygonArea, pointInPolygon, polygonCentroid, bounds } from "../core/geom.js";
import { wallFrame } from "../core/walls.js";
import { roofModel, roofBase } from "../core/roof.js";
import { MATERIALS } from "../lib/materials.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
// xsd:decimal: no exponent.
const dec = (v, n = 4) => { const s = (Math.round(v * 10 ** n) / 10 ** n).toFixed(n).replace(/\.?0+$/, ""); return s === "-0" ? "0" : s; };
const idSafe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, "_");

// Thermal data of our materials (W/m·K, kg/m³, J/kg·K); air gaps get an R-value.
const THERMAL = {
  brick: [0.77, 1700, 800], concrete: [1.4, 2300, 880], stone: [2.3, 2600, 840], plaster: [0.5, 1300, 1000],
  "paint-white": [0.5, 1300, 1000], "paint-sage": [0.5, 1300, 1000], "paint-sky": [0.5, 1300, 1000],
  insulation: [0.035, 30, 1030], "wood-cladding": [0.13, 500, 1600], oak: [0.16, 700, 1600], walnut: [0.16, 650, 1600],
  glass: [1.0, 2500, 750], "tile-white": [1.3, 2300, 840], "tile-grey": [1.3, 2300, 840], marble: [2.8, 2700, 880],
  carpet: [0.06, 200, 1300], "roof-tiles": [1.0, 2000, 800], "roof-slate": [2.0, 2700, 750], "roof-metal": [50, 7800, 450],
};

const plainName = (id) => (MATERIALS.find((m) => m.id === id) || { name: id }).name;
const live = (it) => it.phase !== "demolish";

// [x, y, z] plan mm → gbXML metres (y north).
const W = ([x, y, z]) => [x / 1000, -y / 1000, z / 1000];

function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// A loop (gbXML coordinates) turned so that its normal points along `out`.
const facing = (loop, out) => (dot(newell(loop), out) < 0 ? loop.slice().reverse() : loop);
// Plan polygon (mm) → gbXML ring at height z (mm), counter-clockwise from above.
function ring(pts, z) {
  const loop = pts.map(([x, y]) => W([x, y, z]));
  return facing(loop, [0, 0, 1]);
}

// Share of a polygon covered by other polygons (sampled on a grid).
function covered(pts, others) {
  if (!others.length) return { frac: 0, by: [] };
  const b = bounds(pts);
  const N = 16;
  let inside = 0;
  const hits = new Map();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = b.x1 + ((b.x2 - b.x1) * (i + 0.5)) / N, y = b.y1 + ((b.y2 - b.y1) * (j + 0.5)) / N;
      if (!pointInPolygon(x, y, pts)) continue;
      inside++;
      for (const o of others) if (pointInPolygon(x, y, o.pts)) { hits.set(o, (hits.get(o) || 0) + 1); break; }
    }
  }
  if (!inside) return { frac: 0, by: [] };
  const by = [...hits].sort((a, c) => c[1] - a[1]).map(([o, n]) => ({ o, frac: n / inside }));
  return { frac: by.reduce((s, x) => s + x.frac, 0), by };
}

class GbxmlWriter {
  constructor(p, opts) {
    this.p = p;
    this.opts = opts;
    this.surfaces = [];
    this.spaces = [];
    this.constructions = new Map(); // id → {name, layers: [{material, thickness}]}
    this.n = 0;
  }

  nid(prefix) { return `${prefix}-${++this.n}`; }

  construction(id, name, layers) {
    if (!this.constructions.has(id)) this.constructions.set(id, { name, layers });
    return id;
  }

  wallConstruction(w) {
    const wt = wallTypeOf(this.p, w);
    if (wt) return this.construction(`con-${idSafe(wt.id)}`, wt.name, wt.layers.map((l) => ({ material: l.material, thickness: l.thickness })));
    const t = Math.round(w.thickness);
    return this.construction(`con-wall-${t}`, `Wall ${t} mm`, [{ material: w.material && THERMAL[w.material] ? w.material : "concrete", thickness: t }]);
  }

  slabConstruction(kind, t) {
    const th = Math.round(t || DEFAULTS.slab);
    return this.construction(`con-${kind}-${th}`, `${kind === "roof" ? "Roof" : "Floor slab"} ${th} mm`, [{ material: "concrete", thickness: th }]);
  }

  surface(type, loop, adj, construction, extra = {}) {
    const s = { id: this.nid("su"), type, loop, adj: adj.filter(Boolean).slice(0, 2), construction, openings: [], ...extra };
    this.surfaces.push(s);
    for (const a of s.adj) a.space.boundaries.push(s);
    return s;
  }

  run() {
    const p = this.p;
    const levels = p.levels.slice().sort((a, b) => a.elevation - b.elevation);
    this.levels = levels.map((lv, i) => ({ lv, id: `st-${i + 1}`, below: levels[i - 1] || null, above: levels[i + 1] || null }));
    // Spaces first: every surface needs to know the rooms beside it.
    for (const L of this.levels) {
      for (const r of p.rooms.filter((x) => x.level === L.lv.id && live(x) && x.pts.length >= 3)) {
        const area = Math.abs(polygonArea(r.pts));
        if (area < 1e4) continue;
        this.spaces.push({ id: `sp-${idSafe(r.id)}`, room: r, L, pts: r.pts, z0: L.lv.elevation, z1: L.lv.elevation + L.lv.height, area, boundaries: [] });
      }
    }
    for (const L of this.levels) this.walls(L);
    for (const L of this.levels) this.floorsAndTops(L);
    this.roofs();
    this.masses();
    return this.xml();
  }

  // -------------------------------------------------------------- walls
  walls(L) {
    const p = this.p;
    const spaces = this.spaces.filter((s) => s.L === L);
    for (const w of p.walls.filter((x) => x.level === L.lv.id && live(x))) {
      const len = wallLength(w);
      if (len < 50) continue;
      const f = wallFrame(w);
      const h = wallHeight(p, w);
      const z0 = L.lv.elevation, z1 = z0 + h;
      const reach = w.thickness / 2 + 80;
      // Rooms against each face: [{side, sp, u1, u2}].
      const touch = [];
      for (const sp of spaces) {
        const pts = sp.pts;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey);
          if (el < 50 || Math.abs(ex * f.d[1] - ey * f.d[0]) / el > 0.02) continue;
          const va = (a[0] - w.x1) * f.n[0] + (a[1] - w.y1) * f.n[1], vb = (b[0] - w.x1) * f.n[0] + (b[1] - w.y1) * f.n[1];
          if (Math.abs(va) > reach || Math.abs(vb) > reach) continue;
          const ua = (a[0] - w.x1) * f.d[0] + (a[1] - w.y1) * f.d[1], ub = (b[0] - w.x1) * f.d[0] + (b[1] - w.y1) * f.d[1];
          const u1 = Math.max(0, Math.min(ua, ub)), u2 = Math.min(len, Math.max(ua, ub));
          if (u2 - u1 < 50) continue;
          const mu = (u1 + u2) / 2;
          const probe = (s) => pointInPolygon(w.x1 + f.d[0] * mu + f.n[0] * s * (reach + 30), w.y1 + f.d[1] * mu + f.n[1] * s * (reach + 30), pts);
          const side = probe(1) ? 1 : probe(-1) ? -1 : 0;
          if (side) touch.push({ side, sp, u1, u2 });
        }
      }
      const spans = openingsOf(p, w.id).filter(live).map((o) => ({ o, u1: Math.max(0, o.at - o.width / 2), u2: Math.min(len, o.at + o.width / 2) })).filter((s) => s.u2 - s.u1 > 1);
      // Break points where the room on a side changes, kept out of openings.
      let cuts = [0, len];
      for (const t of touch) cuts.push(t.u1, t.u2);
      cuts = cuts.map((u) => { const s = spans.find((x) => u > x.u1 + 1 && u < x.u2 - 1); return s ? (u - s.u1 < s.u2 - u ? s.u1 : s.u2) : u; });
      cuts.sort((a, b) => a - b);
      const at = cuts.filter((u, i) => i === 0 || u - cuts[i - 1] > 20);
      if (len - at[at.length - 1] > 1e-6) at.push(len); else at[at.length - 1] = len;
      const who = (side, u) => { let best = null; for (const t of touch) if (t.side === side && u >= t.u1 - 1 && u <= t.u2 + 1 && (!best || t.u2 - t.u1 > best.u2 - best.u1)) best = t; return best ? best.sp : null; };
      const pieces = [];
      for (let i = 0; i + 1 < at.length; i++) {
        const a = at[i], b = at[i + 1];
        if (b - a < 20) continue;
        const mu = (a + b) / 2;
        const left = who(1, mu), right = who(-1, mu);
        const last = pieces[pieces.length - 1];
        if (last && last.left === left && last.right === right && Math.abs(last.b - a) < 1) last.b = b;
        else pieces.push({ a, b, left, right });
      }
      // Short bits beside no room (a wall end past the room corners, the
      // thickness of a crossing wall) go to the piece next to them.
      for (let i = 0; i < pieces.length && pieces.length > 1;) {
        const pc = pieces[i];
        if (pc.left || pc.right || pc.b - pc.a > 700) { i++; continue; }
        const prev = pieces[i - 1], next = pieces[i + 1];
        const to = prev && (prev.left || prev.right) ? prev : next && (next.left || next.right) ? next : prev || next;
        if (to === prev) prev.b = pc.b; else next.a = pc.a;
        pieces.splice(i, 1);
      }
      for (let i = 1; i < pieces.length;) {
        if (pieces[i].left === pieces[i - 1].left && pieces[i].right === pieces[i - 1].right) { pieces[i - 1].b = pieces[i].b; pieces.splice(i, 1); } else i++;
      }
      const wt = wallTypeOf(p, w);
      const con = this.wallConstruction(w);
      const below = z1 <= 50 || L.lv.elevation < -100;
      for (const pc of pieces) {
        const P = (u, z) => W([w.x1 + f.d[0] * u, w.y1 + f.d[1] * u, z]);
        let first = pc.left, second = pc.right, outSide = -1; // normal points away from the first space
        if (!first && second) { first = second; second = null; outSide = 1; }
        if (first && second === first) second = null;
        const out = [f.n[0] * outSide, -f.n[1] * outSide, 0];
        let type;
        if (first && second) type = "InteriorWall";
        else if (below) type = "UndergroundWall";
        else if (wt && !wt.exterior && first) type = "InteriorWall";
        else type = (w.props && /Interior/i.test(w.props.gbxmlType || "")) ? "InteriorWall" : "ExteriorWall";
        const loop = facing([P(pc.a, z0), P(pc.b, z0), P(pc.b, z1), P(pc.a, z1)], out);
        const adj = [];
        if (first) adj.push({ space: first, type: type === "InteriorWall" || type === "ExteriorWall" || type === "UndergroundWall" ? type : "InteriorWall" });
        if (second) adj.push({ space: second, type: "InteriorWall" });
        const s = this.surface(type, loop, adj, con, { name: w.name || `Wall ${w.id}`, cad: `Wall [${w.id}]` });
        for (const sp of spans) {
          const mu = (sp.u1 + sp.u2) / 2;
          if (mu < pc.a || mu > pc.b) continue;
          const o = sp.o;
          const u1 = Math.max(pc.a, sp.u1), u2 = Math.min(pc.b, sp.u2);
          const oz0 = z0 + o.sill, oz1 = Math.min(z1, z0 + o.sill + o.height);
          if (u2 - u1 < 10 || oz1 - oz0 < 10) continue;
          let type2;
          if (o.kind === "door") type2 = o.type === "sliding" ? "SlidingDoor" : "NonSlidingDoor";
          else if (o.kind === "window") type2 = o.type === "fixed" ? "FixedWindow" : "OperableWindow";
          else type2 = "Air";
          s.openings.push({ id: this.nid("op"), type: type2, name: o.name || `${o.kind} ${o.id}`, loop: facing([P(u1, oz0), P(u2, oz0), P(u2, oz1), P(u1, oz1)], out), w: (u2 - u1) / 1000, h: (oz1 - oz0) / 1000 });
        }
      }
    }
  }

  // -------------------------------------------------------------- floors, ceilings, flat tops
  floorsAndTops(L) {
    const p = this.p;
    const mine = this.spaces.filter((s) => s.L === L);
    const belowSpaces = L.below ? this.spaces.filter((s) => s.L.lv === L.below) : [];
    const aboveSpaces = L.above ? this.spaces.filter((s) => s.L.lv === L.above) : [];
    const roofs = p.roofs.filter((r) => r.level === L.lv.id && live(r));
    const slab = this.slabConstruction("slab", L.lv.slab);
    for (const sp of mine) {
      // Floor: shared with the room below when that one covers most of it.
      const under = covered(sp.pts, belowSpaces);
      const z = sp.z0;
      if (under.frac > 0.5) {
        const other = under.by[0].o;
        this.surface("InteriorFloor", facing(ring(sp.pts, z), [0, 0, -1]), [{ space: sp, type: "InteriorFloor" }, { space: other, type: "Ceiling" }], slab, { name: `Floor ${sp.room.name || sp.room.id}` });
        other.ceilingDone = (other.ceilingDone || 0) + Math.abs(polygonArea(sp.pts));
      } else {
        const lowest = !L.below;
        let type = "SlabOnGrade";
        if (z < -100) type = "UndergroundSlab";
        else if (!lowest) type = "ExposedFloor";
        else if (z > 300) type = "RaisedFloor";
        this.surface(type, facing(ring(sp.pts, z), [0, 0, -1]), [{ space: sp, type }], slab, { name: `Floor ${sp.room.name || sp.room.id}` });
      }
      // Top: a roof of this level covers it (the roof faces are written by
      // roofs()), or a room above takes it as its floor, or a flat roof.
      const c = polygonCentroid(sp.pts);
      const roof = roofs.find((r) => { const m = roofModel(r, roofBase(p, r)); return pointInPolygon(c[0], c[1], m.outline); });
      if (roof) { sp.roof = roof; continue; }
      if ((p.solids || []).some((s) => s.level === L.lv.id && Array.isArray(s.faces) && live(s) && pointInPolygon(c[0], c[1], s.pts))) continue;
      const over = covered(sp.pts, aboveSpaces);
      if (over.frac > 0.5) continue;
      this.surface("Roof", ring(sp.pts, sp.z1), [{ space: sp, type: "Roof" }], this.slabConstruction("roof", 200), { name: `Roof ${sp.room.name || sp.room.id}` });
    }
  }

  // -------------------------------------------------------------- roofs
  roofs() {
    const p = this.p;
    for (const r of p.roofs.filter(live)) {
      const m = roofModel(r, roofBase(p, r));
      const spaces = this.spaces.filter((s) => s.L.lv.id === r.level);
      const con = this.slabConstruction("roof", r.thickness);
      const under = (pts2) => {
        const c = polygonCentroid(pts2);
        const hit = spaces.find((s) => pointInPolygon(c[0], c[1], s.pts));
        if (hit) return hit;
        const cov = covered(pts2, spaces);
        return cov.by.length ? cov.by[0].o : null;
      };
      for (const f of m.faces) {
        const loop = facing(f.pts.map(W), [0, 0, 1]);
        const sp = under(f.pts.map(([x, y]) => [x, y]));
        this.surface("Roof", loop, sp ? [{ space: sp, type: "Roof" }] : [], con, { name: `Roof ${r.id}` });
      }
      // Gable ends: triangles above the walls at the ridge ends.
      for (const g of m.gables) {
        const loop = g.pts.map(W);
        const c = polygonCentroid(g.pts.map(([x, y]) => [x, y]));
        const n = newell(loop);
        const sp = under([[c[0] - 1, c[1] - 1], [c[0] + 1, c[1] - 1], [c[0] + 1, c[1] + 1], [c[0] - 1, c[1] + 1]]);
        // Outward: away from the roof centre.
        const rc = polygonCentroid(r.pts);
        const out = [(c[0] - rc[0]), -(c[1] - rc[1]), 0];
        void n;
        this.surface("ExteriorWall", facing(loop, out), sp ? [{ space: sp, type: "ExteriorWall" }] : [], this.construction("con-gable", "Gable wall", [{ material: "concrete", thickness: 200 }]), { name: `Gable ${r.id}` });
      }
    }
  }

  // Mass models are shading for the energy model.
  masses() {
    const p = this.p;
    for (const s of (p.solids || []).filter(live)) {
      const lv = levelById(p, s.level);
      const z0 = (lv ? lv.elevation : 0) + (s.z0 || 0), z1 = z0 + s.height;
      const pts = s.pts;
      if (Array.isArray(s.faces) && s.faces.length) {
        // A roof kept as its sloped faces (read from gbXML): Roof surfaces again.
        const spaces = this.spaces.filter((x) => x.L.lv.id === s.level);
        const con = this.slabConstruction("roof", s.thickness || 200);
        for (const f of s.faces) {
          const plan = f.map(([x, y]) => [x, y]);
          const c = polygonCentroid(plan);
          const sp = spaces.find((x) => pointInPolygon(c[0], c[1], x.pts)) || null;
          this.surface("Roof", facing(f.map(([x, y, z]) => W([x, y, z + (lv ? lv.elevation : 0)])), [0, 0, 1]), sp ? [{ space: sp, type: "Roof" }] : [], con, { name: s.name || `Roof ${s.id}` });
        }
        continue;
      }
      const con = this.construction("con-shade", "Shade", [{ material: "concrete", thickness: 100 }]);
      const taper = s.taper ?? 1;
      const c = polygonCentroid(pts);
      const top = pts.map(([x, y]) => [c[0] + (x - c[0]) * taper, c[1] + (y - c[1]) * taper]);
      this.surface("Shade", facing(ring(pts, z0), [0, 0, -1]), [], con, { name: s.name || `Mass ${s.id}` });
      if (taper > 0.001) this.surface("Shade", ring(top, z1), [], con, { name: s.name || `Mass ${s.id}` });
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        const quad = [W([...pts[i], z0]), W([...pts[j], z0]), W([...top[j], z1]), W([...top[i], z1])];
        const mid = [(pts[i][0] + pts[j][0]) / 2 - c[0], -((pts[i][1] + pts[j][1]) / 2 - c[1]), 0];
        const q = taper > 0.001 ? quad : quad.slice(0, 3);
        this.surface("Shade", facing(q, mid), [], con, { name: s.name || `Mass ${s.id}` });
      }
    }
  }

  // -------------------------------------------------------------- XML
  xml() {
    const p = this.p;
    const o = [];
    const pt = (q, pad) => `${pad}<CartesianPoint><Coordinate>${dec(q[0])}</Coordinate><Coordinate>${dec(q[1])}</Coordinate><Coordinate>${dec(q[2])}</Coordinate></CartesianPoint>`;
    const loop = (l, pad) => [`${pad}<PolyLoop>`, ...l.map((q) => pt(q, `${pad}  `)), `${pad}</PolyLoop>`];
    const planar = (l, pad) => [`${pad}<PlanarGeometry>`, ...loop(l, `${pad}  `), `${pad}</PlanarGeometry>`];
    const meta = p.meta || {};
    const ts = (this.opts.timestamp || new Date().toISOString()).slice(0, 19);
    const ver = this.opts.schemaVersion === "6.01" ? "6.01" : "7.03";
    o.push('<?xml version="1.0" encoding="UTF-8"?>');
    o.push(`<gbXML xmlns="http://www.gbxml.org/schema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.gbxml.org/schema http://gbxml.org/schema/${ver.replace(".", "-")}/GreenBuildingXML_Ver${ver}.xsd" temperatureUnit="C" lengthUnit="Meters" areaUnit="SquareMeters" volumeUnit="CubicMeters" useSIUnitsForResults="true" version="${ver}" SurfaceReferenceLocation="Centerline">`);
    o.push('  <Campus id="campus-1">');
    o.push(`    <Name>${esc(meta.title || "Project")}</Name>`);
    o.push("    <Location>");
    o.push(`      <Name>${esc(meta.address || meta.title || "")}</Name>`);
    o.push(`      <ZipcodeOrPostalCode>${esc(meta.zip || meta.postalCode || "")}</ZipcodeOrPostalCode>`);
    if (Number.isFinite(+meta.longitude) && meta.longitude !== "" && meta.longitude !== null) o.push(`      <Longitude>${dec(+meta.longitude, 6)}</Longitude>`);
    if (Number.isFinite(+meta.latitude) && meta.latitude !== "" && meta.latitude !== null) o.push(`      <Latitude>${dec(+meta.latitude, 6)}</Latitude>`);
    if (Number.isFinite(+meta.elevation) && meta.elevation !== undefined && meta.elevation !== "") o.push(`      <Elevation>${dec(+meta.elevation, 2)}</Elevation>`);
    const north = +meta.north || 0;
    if (north) o.push(`      <CADModelAzimuth>${dec(((360 - north) % 360 + 360) % 360, 4)}</CADModelAzimuth>`);
    o.push("    </Location>");
    const area = this.spaces.reduce((s, x) => s + x.area, 0) / 1e6;
    o.push(`    <Building id="building-1" buildingType="${esc(this.opts.buildingType || meta.buildingType || "Unknown")}">`);
    o.push(`      <Name>${esc(meta.title || "Building")}</Name>`);
    if (meta.address) o.push(`      <StreetAddress>${esc(meta.address)}</StreetAddress>`);
    o.push(`      <Area>${dec(area, 3)}</Area>`);
    for (const L of this.levels) {
      o.push(`      <BuildingStorey id="${L.id}">`, `        <Name>${esc(L.lv.name)}</Name>`, `        <Level>${dec(L.lv.elevation / 1000)}</Level>`, "      </BuildingStorey>");
    }
    for (const sp of this.spaces) {
      const r = sp.room;
      o.push(`      <Space id="${sp.id}" conditionType="HeatedAndCooled" buildingStoreyIdRef="${sp.L.id}">`);
      o.push(`        <Name>${esc(r.name || r.number || sp.id)}</Name>`);
      if (r.number && r.number !== r.name) o.push(`        <Description>${esc(r.number)}</Description>`);
      o.push(`        <Area>${dec(sp.area / 1e6, 3)}</Area>`);
      o.push(`        <Volume>${dec((sp.area * (sp.z1 - sp.z0)) / 1e9, 3)}</Volume>`);
      // Closed shell: the room prism, every face counter-clockwise from outside.
      const bottom = facing(ring(sp.pts, sp.z0), [0, 0, -1]);
      const top = ring(sp.pts, sp.z1);
      const ccw = polygonArea(sp.pts.map(([x, y]) => [x, -y])) > 0 ? sp.pts : sp.pts.slice().reverse();
      o.push(`        <ShellGeometry id="sh-${sp.id}" unit="Meters">`, "          <ClosedShell>");
      o.push(...loop(bottom, "            "), ...loop(top, "            "));
      for (let i = 0; i < ccw.length; i++) {
        const a = ccw[i], b = ccw[(i + 1) % ccw.length];
        o.push(...loop([W([...a, sp.z0]), W([...b, sp.z0]), W([...b, sp.z1]), W([...a, sp.z1])], "            "));
      }
      o.push("          </ClosedShell>", "        </ShellGeometry>");
      for (const s of sp.boundaries) o.push(`        <SpaceBoundary isSecondLevelBoundary="true" surfaceIdRef="${s.id}">`, ...planar(s.loop, "          "), "        </SpaceBoundary>");
      o.push("      </Space>");
    }
    o.push("    </Building>");
    for (const s of this.surfaces) {
      o.push(`    <Surface id="${s.id}" surfaceType="${s.type}" constructionIdRef="${s.construction}"${s.type === "Shade" || /Underground|SlabOnGrade|Interior|Ceiling/.test(s.type) ? ' exposedToSun="false"' : ""}>`);
      if (s.name) o.push(`      <Name>${esc(s.name)}</Name>`);
      for (const a of s.adj) o.push(`      <AdjacentSpaceId spaceIdRef="${a.space.id}" surfaceType="${a.type}"/>`);
      o.push(...this.rect(s.loop, "      "));
      o.push(...planar(s.loop, "      "));
      for (const op of s.openings) {
        o.push(`      <Opening id="${op.id}" openingType="${op.type}">`, `        <Name>${esc(op.name)}</Name>`);
        o.push(...this.rect(op.loop, "        ", s.loop));
        o.push(...planar(op.loop, "        "), "      </Opening>");
      }
      // The element a surface belongs to (pieces of one wall share it).
      if (s.cad) o.push(`      <CADObjectId>${esc(s.cad)}</CADObjectId>`);
      o.push("    </Surface>");
    }
    o.push("  </Campus>");
    // Constructions, their layers and the materials.
    const mats = new Map();
    for (const [id, c] of this.constructions) {
      o.push(`  <Construction id="${id}">`, `    <Name>${esc(c.name)}</Name>`, `    <LayerId layerIdRef="lay-${id.slice(4)}"/>`, "  </Construction>");
    }
    for (const [id, c] of this.constructions) {
      o.push(`  <Layer id="lay-${id.slice(4)}">`, `    <Name>${esc(c.name)}</Name>`);
      for (const l of c.layers) {
        const mid = `mat-${idSafe(l.material)}-${Math.round(l.thickness)}`;
        mats.set(mid, l);
        o.push(`    <MaterialId materialIdRef="${mid}"/>`);
      }
      o.push("  </Layer>");
    }
    for (const [id, l] of mats) {
      const th = THERMAL[l.material];
      o.push(`  <Material id="${id}">`, `    <Name>${esc(`${plainName(l.material)} ${Math.round(l.thickness)} mm`)}</Name>`);
      if (l.material === "air") o.push(`    <R-value unit="SquareMeterKPerW">0.18</R-value>`);
      o.push(`    <Thickness unit="Meters">${dec(l.thickness / 1000)}</Thickness>`);
      if (th) o.push(`    <Conductivity unit="WPerMeterK">${dec(th[0])}</Conductivity>`, `    <Density unit="KgPerCubicM">${dec(th[1])}</Density>`, `    <SpecificHeat unit="JPerKgK">${dec(th[2])}</SpecificHeat>`);
      o.push("  </Material>");
    }
    const app = this.opts.application || "MyArchitecture";
    o.push("  <DocumentHistory>");
    o.push(`    <ProgramInfo id="program-1">`, `      <CompanyName>${esc(app)}</CompanyName>`, `      <ProductName>${esc(app)}</ProductName>`, `      <Version>${esc(this.opts.version || "10")}</Version>`, `      <Platform>${esc(this.opts.platform || "Electron")}</Platform>`, "      <ProjectEntity>", `        <URI>${esc(meta.title || "project")}</URI>`, "        <GUID entity=\"Project\">00000000-0000-0000-0000-000000000000</GUID>", "      </ProjectEntity>", "    </ProgramInfo>");
    const author = String(meta.author || "").trim().split(/\s+/);
    o.push(`    <PersonInfo id="person-1">`, `      <FirstName>${esc(author[0] || "-")}</FirstName>`, `      <LastName>${esc(author.slice(1).join(" ") || "-")}</LastName>`, ...(meta.company ? [`      <CompanyName>${esc(meta.company)}</CompanyName>`] : []), "    </PersonInfo>");
    o.push(`    <CreatedBy personId="person-1" programId="program-1" date="${esc(ts)}"/>`);
    o.push("  </DocumentHistory>");
    o.push("</gbXML>", "");
    return o.join("\n");
  }

  // RectangularGeometry of a planar loop (gbXML): azimuth and tilt of its
  // normal, its lowest-left corner, width and height (of the bounding
  // rectangle in its own plane).
  // An opening's corner is given in its surface's rectangle (2 coordinates).
  rect(l, pad, parent = null) {
    const n = newell(parent || l);
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const nz = n[2] / len;
    const tilt = (Math.acos(Math.max(-1, Math.min(1, nz))) * 180) / Math.PI;
    let az = (Math.atan2(n[0], n[1]) * 180) / Math.PI;
    if (Math.hypot(n[0], n[1]) / len < 1e-6) az = 0;
    az = ((az % 360) + 360) % 360;
    // In-plane axes: x horizontal (or east for flat faces), y up the slope.
    let ax = Math.hypot(n[0], n[1]) / len < 1e-6 ? [1, 0, 0] : [-n[1], n[0], 0]; // to the right, seen from outside
    const al = Math.hypot(...ax);
    ax = ax.map((v) => v / al);
    const nn = n.map((v) => v / len);
    const ay = [nn[1] * ax[2] - nn[2] * ax[1], nn[2] * ax[0] - nn[0] * ax[2], nn[0] * ax[1] - nn[1] * ax[0]];
    const us = l.map((q) => dot(q, ax)), vs = l.map((q) => dot(q, ay));
    const u0 = Math.min(...us), v0 = Math.min(...vs);
    if (parent) {
      const pu = Math.min(...parent.map((q) => dot(q, ax))), pv = Math.min(...parent.map((q) => dot(q, ay)));
      return [`${pad}<RectangularGeometry>`, `${pad}  <Azimuth>${dec(az, 3)}</Azimuth>`,
        `${pad}  <CartesianPoint><Coordinate>${dec(u0 - pu)}</Coordinate><Coordinate>${dec(v0 - pv)}</Coordinate></CartesianPoint>`,
        `${pad}  <Tilt>${dec(tilt, 3)}</Tilt>`, `${pad}  <Width>${dec(Math.max(...us) - u0)}</Width>`, `${pad}  <Height>${dec(Math.max(...vs) - v0)}</Height>`, `${pad}</RectangularGeometry>`];
    }
    const corner = [ax[0] * u0 + ay[0] * v0 + nn[0] * dot(l[0], nn), ax[1] * u0 + ay[1] * v0 + nn[1] * dot(l[0], nn), ax[2] * u0 + ay[2] * v0 + nn[2] * dot(l[0], nn)];
    return [`${pad}<RectangularGeometry>`, `${pad}  <Azimuth>${dec(az, 3)}</Azimuth>`,
      `${pad}  <CartesianPoint><Coordinate>${dec(corner[0])}</Coordinate><Coordinate>${dec(corner[1])}</Coordinate><Coordinate>${dec(corner[2])}</Coordinate></CartesianPoint>`,
      `${pad}  <Tilt>${dec(tilt, 3)}</Tilt>`, `${pad}  <Width>${dec(Math.max(...us) - u0)}</Width>`, `${pad}  <Height>${dec(Math.max(...vs) - v0)}</Height>`, `${pad}</RectangularGeometry>`];
  }
}

// `project` → gbXML text. opts: {schemaVersion: "7.03" (default) | "6.01",
// timestamp, application, version, buildingType}.
export function exportGbxml(project, opts = {}) {
  return new GbxmlWriter(project, opts).run();
}

// For tests: the surfaces and spaces the writer derives (without XML).
export function gbxmlModel(project, opts = {}) {
  const w = new GbxmlWriter(project, opts);
  w.run();
  return { spaces: w.spaces, surfaces: w.surfaces, constructions: w.constructions };
}
