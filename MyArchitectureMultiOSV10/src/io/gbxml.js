// gbXML reader (.xml / .gbxml): the open energy-analysis exchange format that
// Revit, ArchiCAD, Vectorworks, DesignBuilder, OpenStudio and others export.
// A gbXML model is surfaces (polygons in 3D) bounding spaces; here it is
// turned back into building elements:
//
//   BuildingStorey               → level (elevation from Level, height up to the next)
//   Space (floor of its shell)   → room with its name
//   vertical wall Surface        → wall on the storey its bottom lies in, split
//                                  per storey when it runs through several;
//                                  thickness from its construction layers
//   Opening in a wall            → door / window / opening (at, width, sill, height)
//   Roof Surface                 → flat roof slab, or one pitched roof (gable /
//                                  hip / shed) per storey over the sloped faces
//
// Coordinates: x east, y north, z up in the file's lengthUnit; our plan has y
// down, so y is negated. Floors, ceilings, slabs, shading and air surfaces
// are not elements of their own (levels and rooms carry the floors).

import { parseXml, kids, kid, kidText, textOf, descendants, localName, rootElement, r1, alongWall, fitOpeningToWall, dropOverlappingOpenings, resolveWallOverlaps } from "./bimkit.js";
import { newProject, normalizeProject, DEFAULTS } from "../core/project.js";
import { uid, polygonArea, convexHull, orientedRect } from "../core/geom.js";

const UNITS = { meters: 1000, meter: 1000, centimeters: 10, centimeter: 10, millimeters: 1, millimeter: 1, kilometers: 1e6, feet: 304.8, foot: 304.8, inches: 25.4, inch: 25.4, yards: 914.4, miles: 1609344 };

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Bytes in UTF-8 or UTF-16 (Revit writes UTF-16 with a byte order mark) → text.
export function decodeXmlBytes(bytes) {
  if (typeof bytes === "string") return bytes.replace(/^﻿/, "");
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let enc = "utf-8";
  if (b[0] === 0xff && b[1] === 0xfe) enc = "utf-16le";
  else if (b[0] === 0xfe && b[1] === 0xff) enc = "utf-16be";
  else if (b[0] === 0x3c && b[1] === 0) enc = "utf-16le";
  else if (b[0] === 0 && b[1] === 0x3c) enc = "utf-16be";
  try { return new TextDecoder(enc, { fatal: enc === "utf-8" }).decode(b).replace(/^﻿/, ""); } catch { return new TextDecoder("latin1").decode(b); }
}

// Is this text (the start of it) a gbXML document?
export const looksLikeGbxml = (text) => /<(?:\w+:)?gbXML[\s>]/.test(String(text).slice(0, 4096));

// gbXML text or bytes → {project, warnings, stats}.
export function importGbxml(input, { name = "" } = {}) {
  const text = decodeXmlBytes(input);
  const root = rootElement(parseXml(text));
  if (!root || localName(root.name) !== "gbXML") throw codedError("gbxml-not", "This is not a gbXML file (no <gbXML> element).");
  return new GbxmlReader(root, name).run();
}

function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const ext = (vals) => { let lo = Infinity, hi = -Infinity; for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };

// Coplanar faces tiling one region → its outline (edges shared by two
// faces cancel; the rest are chained into loops, the biggest is returned),
// or null when they do not join cleanly.
function joinFaces(faces) {
  const key = (q) => `${Math.round(q[0] / 5)},${Math.round(q[1] / 5)}`;
  const pt = new Map();
  const edges = new Map();
  const all = faces.flat();
  // Split edges at corners of other faces lying on them (T-junctions).
  const split = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const on = [];
    for (const q of all) {
      const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (L2 || 1);
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const ex = a[0] + dx * t - q[0], ey = a[1] + dy * t - q[1];
      if (ex * ex + ey * ey < 25) on.push([t, q]);
    }
    on.sort((u, v) => u[0] - v[0]);
    return [a, ...on.map((x) => x[1]), b];
  };
  for (const face of faces) {
    const f = [];
    for (let i = 0; i < face.length; i++) f.push(...split(face[i], face[(i + 1) % face.length]).slice(0, -1));
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const ka = key(a), kb = key(b);
      if (ka === kb) continue;
      pt.set(ka, a); pt.set(kb, b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      edges.set(k, edges.has(k) ? null : [ka, kb]);
    }
  }
  const open = [...edges.values()].filter(Boolean);
  if (open.length < 3) return null;
  const next = new Map();
  for (const [a, b] of open) {
    if (!next.has(a)) next.set(a, []);
    if (!next.has(b)) next.set(b, []);
    next.get(a).push(b); next.get(b).push(a);
  }
  if ([...next.values()].some((l) => l.length !== 2)) return null;
  const seen = new Set();
  let best = null, bestArea = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let prev = null, cur = start;
    for (;;) {
      const [n1, n2] = next.get(cur);
      const nx = n1 !== prev ? n1 : n2;
      if (nx === start) break;
      if (seen.has(nx)) return null;
      seen.add(nx); loop.push(nx); prev = cur; cur = nx;
    }
    const q = loop.map((k) => pt.get(k));
    const area = Math.abs(polygonArea(q.map((v) => [v[0], v[1]])));
    if (area > bestArea) { bestArea = area; best = q; }
  }
  return best;
}

function dedupe2(pts, tol = 5) {
  const out = [];
  for (const q of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > tol) out.push(q); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tol) out.pop();
  // Drop points on a straight line between their neighbours.
  for (let i = 0; out.length > 3 && i < out.length;) {
    const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    if (Math.abs(cr) / L < 2) out.splice(i, 1); else i++;
  }
  return out;
}

class GbxmlReader {
  constructor(root, name) {
    this.root = root;
    this.name = name;
    this.warnings = [];
    this.counts = {};
    this.walls = [];
    this.openings = [];
    this.rooms = [];
    this.roofs = [];
    const unit = String(root.attrs.lengthUnit || "").toLowerCase();
    this.u = UNITS[unit] || 1000;
    this.dz = 0;
    if (!UNITS[unit]) this.warnings.push(unit ? `Unknown length unit "${root.attrs.lengthUnit}"; metres assumed` : "No lengthUnit given; metres assumed");
  }

  count(k, n = 1) { this.counts[k] = (this.counts[k] || 0) + n; }

  // CartesianPoint → [x, y, z] in mm, y north.
  point(cp) {
    const c = kids(cp, "Coordinate").map((e) => +textOf(e));
    return [(c[0] || 0) * this.u, (c[1] || 0) * this.u, (c[2] || 0) * this.u - this.dz];
  }
  loop(el) { return el ? kids(el, "CartesianPoint").map((cp) => this.point(cp)) : []; }
  planar(el) { const pg = kid(el, "PlanarGeometry"); return pg ? this.loop(kid(pg, "PolyLoop")) : []; }
  plan(q) { return [r1(q[0]), r1(-q[1])]; }

  run() {
    const campus = kid(this.root, "Campus");
    if (!campus) throw codedError("gbxml-not", "This gbXML file has no Campus.");
    this.campus = campus;
    this.buildings = kids(campus, "Building");
    this.surfaces = kids(campus, "Surface");
    if (!this.surfaces.length) this.surfaces = descendants(campus, "Surface");
    this.readConstructions();
    this.readStoreys();
    this.readWalls();
    this.readSpaces();
    this.readRoofs();
    const fix = resolveWallOverlaps(this.walls, this.openings, (id) => (this.levels.find((l) => l.id === id) || {}).height);
    this.count("duplicates", fix.removed);
    this.count("trimmed", fix.trimmed);
    const { kept, dropped, stacked } = dropOverlappingOpenings(this.openings);
    this.count("openingOverlap", dropped);
    this.count("stacked", stacked);
    const wallById = new Map(this.walls.map((w) => [w.id, w]));
    for (const o of kept) { const w = wallById.get(o.wall); fitOpeningToWall(o, w, w.height ?? this.levels.find((l) => l.id === w.level).height); }
    this.openings = kept;

    const b = this.buildings[0];
    const title = (b && kidText(b, "Name")) || kidText(campus, "Name") || this.name.replace(/\.(gb)?xml$/i, "") || "gbXML model";
    const p = newProject(title);
    p.levels = this.levels.map(({ id, name, elevation, height, slab }) => ({ id, name, elevation, height, slab }));
    Object.assign(p, { walls: this.walls, openings: this.openings, rooms: this.rooms, roofs: this.roofs });
    const loc = kid(campus, "Location");
    if (loc) {
      const lat = +kidText(loc, "Latitude"), lon = +kidText(loc, "Longitude");
      if (kidText(loc, "Latitude") && Number.isFinite(lat) && Math.abs(lat) <= 90) p.meta.latitude = lat;
      if (kidText(loc, "Longitude") && Number.isFinite(lon) && Math.abs(lon) <= 180) p.meta.longitude = lon;
      const addr = [kidText(loc, "Name"), kidText(loc, "ZipcodeOrPostalCode")].filter(Boolean).join(" ");
      if (addr) p.meta.address = addr;
    }
    const app = descendants(this.root, "ProgramInfo")[0];
    const from = app ? [kidText(app, "ProductName"), kidText(app, "Version")].filter(Boolean).join(" ") : "";
    p.meta.comment = `Imported from gbXML${this.root.attrs.version ? ` ${this.root.attrs.version}` : ""}${from ? ` (${from})` : ""}`;
    normalizeProject(p);
    p.view.level = p.levels[0].id;
    this.report();
    const stats = { levels: p.levels.length, walls: p.walls.length, openings: p.openings.length, rooms: p.rooms.length, roofs: p.roofs.length, surfaces: this.surfaces.length };
    return { project: p, warnings: this.warnings, stats };
  }

  report() {
    const W = {
      noStoreys: () => "No BuildingStorey found; levels were made from the heights of the floors",
      wallSplit: (n) => `${n} walls running through several storeys were split per storey`,
      wallThin: (n) => `${n} wall surfaces too small to be walls were skipped`,
      gableWalls: (n) => `${n} walls with a sloping or gable top were cut at the height of their lower end`,
      wallTilted: (n) => `${n} tilted wall surfaces were skipped`,
      duplicates: (n) => `${n} wall surfaces that repeat another (both sides of one wall) were merged`,
      trimmed: (n) => `${n} overlapping walls were shortened`,
      defaultThickness: (n) => `${n} walls have no layer thicknesses in their construction; ${DEFAULTS.wallThickness} mm was used`,
      noOpeningGeometry: (n) => `${n} openings had no usable geometry and were skipped`,
      openingOverlap: (n) => `${n} openings overlapping another in the same wall were skipped`,
      stacked: (n) => `${n} openings stacked above another were joined into one`,
      skylights: (n) => `${n} skylights and roof openings were skipped`,
      spaceNoFloor: (n) => `${n} spaces had no usable floor outline and were skipped`,
      pitched: (n) => `${n} sloped roof surfaces were rebuilt as pitched roofs over their outline (approximate)`,
      shade: (n) => `${n} shading surfaces were skipped`,
      columns: (n) => `${n} column surfaces were skipped`,
    };
    for (const [k, n] of Object.entries(this.counts)) if (n && W[k]) this.warnings.push(W[k](n));
  }

  // -------------------------------------------------------------- constructions
  readConstructions() {
    const len = (el) => { if (!el) return null; const v = +textOf(el); if (!Number.isFinite(v)) return null; const u = UNITS[String(el.attrs.unit || "").toLowerCase()] || this.u; return v * u; };
    const mats = new Map(kids(this.root, "Material").map((m) => [m.attrs.id, len(kid(m, "Thickness"))]));
    const layers = new Map(kids(this.root, "Layer").map((l) => [l.attrs.id, kids(l, "MaterialId").reduce((s, m) => s + (mats.get(m.attrs.materialIdRef) || 0), 0)]));
    this.thickness = new Map();
    for (const c of kids(this.root, "Construction")) {
      const t = kids(c, "LayerId").reduce((s, l) => s + (layers.get(l.attrs.layerIdRef) || 0), 0);
      if (t >= 30 && t <= 1500) this.thickness.set(c.attrs.id, r1(t));
    }
  }

  // -------------------------------------------------------------- storeys
  readStoreys() {
    const list = [];
    for (const b of this.buildings) {
      for (const s of kids(b, "BuildingStorey")) {
        const lvText = kidText(s, "Level");
        const elevation = lvText !== "" && Number.isFinite(+lvText) ? +lvText * this.u : null;
        if (elevation === null) continue;
        list.push({ key: s.attrs.id, name: kidText(s, "Name"), elevation });
      }
    }
    if (!list.length) {
      // Levels from the heights where floors (and space shells) start.
      this.count("noStoreys");
      const zs = [];
      for (const s of this.surfaces) {
        const t = s.attrs.surfaceType || "";
        if (!/Floor|Slab/i.test(t)) continue;
        const pts = this.planar(s);
        if (pts.length) zs.push(ext(pts.map((q) => q[2]))[0]);
      }
      if (!zs.length) for (const s of this.surfaces) { const pts = this.planar(s); if (pts.length) zs.push(ext(pts.map((q) => q[2]))[0]); }
      zs.sort((a, b) => a - b);
      for (const z of zs) if (!list.length || z - list[list.length - 1].elevation > 1500) list.push({ key: null, name: "", elevation: z });
      if (!list.length) list.push({ key: null, name: "", elevation: 0 });
    }
    list.sort((a, b) => a.elevation - b.elevation);
    this.levels = [];
    this.levelByKey = new Map();
    for (const s of list) {
      const same = this.levels.find((l) => Math.abs(l.elevation - s.elevation) < 50);
      if (same) { if (s.key) this.levelByKey.set(s.key, same); continue; }
      const lv = { id: uid("lv"), name: s.name || `${this.levels.length + 1}F`, elevation: r1(s.elevation), height: 0, slab: DEFAULTS.slab };
      this.levels.push(lv);
      if (s.key) this.levelByKey.set(s.key, lv);
    }
    // Height: to the next storey; the top one from its tallest wall.
    let top = -Infinity;
    for (const s of this.surfaces) if (/Wall/i.test(s.attrs.surfaceType || "")) for (const q of this.planar(s)) if (q[2] > top) top = q[2];
    for (let i = 0; i < this.levels.length; i++) {
      const lv = this.levels[i], next = this.levels[i + 1];
      const h = next ? next.elevation - lv.elevation : top - lv.elevation;
      lv.height = r1(h > 500 && h < 30000 ? h : DEFAULTS.wallHeight);
    }
    // Heights above sea level (a survey datum): move the model down so the
    // lowest storey sits at 0; every point read from here on is shifted too.
    const low = this.levels[0].elevation;
    if (Math.abs(low) > 10000) {
      this.dz = low;
      for (const lv of this.levels) lv.elevation = r1(lv.elevation - low);
      this.warnings.push(`The lowest storey was ${r1(low / 1000)} m above zero; the model was moved down to start at 0`);
    }
  }

  levelAt(z) {
    let best = this.levels[0];
    for (const l of this.levels) if (l.elevation <= z + 100) best = l;
    return best;
  }

  // -------------------------------------------------------------- walls and openings
  readWalls() {
    const def = DEFAULTS.wallThickness;
    for (const s of this.surfaces) {
      const type = s.attrs.surfaceType || "";
      if (/Shade/i.test(type)) { this.count("shade"); continue; }
      if (/Column/i.test(type)) { this.count("columns"); continue; }
      if (!/Wall/i.test(type)) continue;
      const pts = this.planar(s);
      if (pts.length < 3) { this.count("wallThin"); continue; }
      const n = newell(pts);
      if (Math.abs(n[2]) > 0.2) { this.count("wallTilted"); continue; }
      // Wall line: the two plan points farthest apart.
      const pl = pts.map((q) => [q[0], -q[1]]);
      let a = pl[0], b = pl[0], best = -1;
      for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) { const d = Math.hypot(pl[i][0] - pl[j][0], pl[i][1] - pl[j][1]); if (d > best) { best = d; a = pl[i]; b = pl[j]; } }
      const [z1, z2] = ext(pts.map((q) => q[2]));
      if (best < 100 || z2 - z1 < 300) { this.count("wallThin"); continue; }
      let thickness = this.thickness.get(s.attrs.constructionIdRef);
      if (!thickness) { thickness = def; this.count("defaultThickness"); }
      // One wall per storey the surface runs through (at least 300 mm of it).
      const pieces = [];
      for (let i = 0; i < this.levels.length; i++) {
        const lv = this.levels[i], next = this.levels[i + 1];
        const lo = Math.max(z1, lv.elevation), hi = Math.min(z2, next ? next.elevation : Infinity);
        if (hi - lo >= 300) pieces.push({ lv, lo, hi });
      }
      if (!pieces.length) pieces.push({ lv: this.levelAt(z1), lo: z1, hi: z2 });
      // A gable end (or a wall under a sloping roof) stops at the lower of
      // its two ends: our walls have a flat top and the roof fills the gable.
      const endTop = (e) => { let z = -Infinity; for (let i = 0; i < pts.length; i++) if (Math.hypot(pl[i][0] - e[0], pl[i][1] - e[1]) < 50 && pts[i][2] > z) z = pts[i][2]; return z; };
      const eave = Math.min(endTop(a), endTop(b));
      if (eave > z1 + 300 && eave < z2 - 50) { const top = pieces[pieces.length - 1]; if (eave > top.lo + 300) top.hi = Math.min(top.hi, eave); this.count("gableWalls"); }
      if (pieces.length > 1) this.count("wallSplit");
      for (const pc of pieces) {
        const { lv, hi } = pc;
        const height = hi - lv.elevation;
        const w = { id: uid("w"), level: lv.id, x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), thickness, height: Math.abs(height - lv.height) < 30 ? null : r1(Math.max(100, height)) };
        if (/Exterior|Underground/i.test(type) || kids(s, "AdjacentSpaceId").length === 1) w.props = { gbxmlType: type };
        this.walls.push(w);
        pc.wall = w;
      }
      for (const op of kids(s, "Opening")) this.readOpening(op, s, pieces);
    }
  }

  readOpening(op, surface, pieces) {
    const type = op.attrs.openingType || "";
    if (/Skylight/i.test(type)) { this.count("skylights"); return; }
    let pts = this.planar(op);
    if (pts.length < 3) pts = this.rectOpening(op, surface);
    if (pts.length < 3) { this.count("noOpeningGeometry"); return; }
    const [z1, z2] = ext(pts.map((q) => q[2]));
    const zc = (z1 + z2) / 2;
    const piece = pieces.find((p) => zc >= p.lv.elevation - 1 && zc <= p.hi + 1) || pieces[0];
    const w = piece.wall;
    const lv = piece.lv;
    const us = pts.map((q) => alongWall(w, q[0], -q[1]));
    const [u1, u2] = ext(us);
    if (u2 - u1 < 100 || z2 - z1 < 100) { this.count("noOpeningGeometry"); return; }
    const kind = /Door/i.test(type) ? "door" : /Window/i.test(type) ? "window" : "opening";
    const o = { id: uid("o"), wall: w.id, kind, at: (u1 + u2) / 2, width: u2 - u1, height: z2 - z1, sill: Math.max(0, z1 - lv.elevation), side: 1, hinge: "start" };
    if (kind === "door") o.type = /Sliding/i.test(type) && !/NonSliding/i.test(type) ? "sliding" : o.width >= 1400 ? "double" : "single";
    else if (kind === "window") o.type = /Fixed/i.test(type) ? "fixed" : "casement";
    const nm = kidText(op, "Name");
    if (nm) o.name = nm;
    if (!fitOpeningToWall(o, w, w.height ?? lv.height)) { this.count("noOpeningGeometry"); return; }
    this.openings.push(o);
  }

  // An opening given only by RectangularGeometry: its CartesianPoint is the
  // lower left corner in the wall's own rectangle (x along, y up), seen from
  // outside; the wall rectangle's origin and azimuth place it in the model.
  rectOpening(op, surface) {
    const rg = kid(op, "RectangularGeometry"), sg = kid(surface, "RectangularGeometry");
    if (!rg || !sg) return [];
    const cp = kid(rg, "CartesianPoint"), so = kid(sg, "CartesianPoint");
    if (!cp || !so) return [];
    const c = kids(cp, "Coordinate").map((e) => +textOf(e) * this.u);
    const o = this.point(so);
    const az = ((+kidText(sg, "Azimuth") || 0) * Math.PI) / 180;
    const ax = [-Math.cos(az), Math.sin(az)]; // horizontal x axis of the wall (east, north)
    const wd = (+kidText(rg, "Width") || 0) * this.u, ht = (+kidText(rg, "Height") || 0) * this.u;
    if (!(wd > 0 && ht > 0)) return [];
    const P = (x, y) => [o[0] + ax[0] * x, o[1] + ax[1] * x, o[2] + y];
    const x0 = c[0] || 0, y0 = c[1] || 0;
    return [P(x0, y0), P(x0 + wd, y0), P(x0 + wd, y0 + ht), P(x0, y0 + ht)];
  }

  // -------------------------------------------------------------- spaces → rooms
  readSpaces() {
    const surfById = new Map(this.surfaces.map((s) => [s.attrs.id, s]));
    for (const b of this.buildings) {
      for (const sp of kids(b, "Space")) {
        // The bottom of the space's closed shell, else its floor boundaries,
        // else its PlanarGeometry (Revit writes a bounding rectangle there).
        const shell = kid(kid(sp, "ShellGeometry"), "ClosedShell");
        const candidates = [
          () => this.lowestFace(shell ? kids(shell, "PolyLoop").map((l) => this.loop(l)).filter((f) => f.length >= 3) : []),
          () => this.lowestFace(kids(sp, "SpaceBoundary").map((bd) => {
            const s = surfById.get(bd.attrs.surfaceIdRef);
            if (!s || !/Floor|Slab/i.test(s.attrs.surfaceType || "")) return [];
            const own = this.planar(bd);
            return own.length >= 3 ? own : this.planar(s);
          }).filter((f) => f.length >= 3)),
          () => { const pg = this.planar(sp); return pg.length >= 3 && Math.abs(newell(pg)[2]) > 0.95 ? pg : null; },
        ];
        let floor = null, pts = null;
        for (const c of candidates) {
          const f = c();
          if (!f) continue;
          const q = dedupe2(f.map((v) => this.plan(v)));
          if (q.length >= 3 && Math.abs(polygonArea(q)) >= 1e5) { floor = f; pts = q; break; }
        }
        if (!floor) { this.count("spaceNoFloor"); continue; }
        const z = ext(floor.map((q) => q[2]))[0];
        const lv = this.levelByKey.get(sp.attrs.buildingStoreyIdRef) || this.levelAt(z);
        const name = kidText(sp, "Name") || kidText(sp, "Description") || "";
        const room = { id: uid("r"), level: lv.id, name: name.trim(), pts };
        const num = kidText(sp, "Number") || "";
        if (num && num !== room.name) room.number = num;
        this.rooms.push(room);
      }
    }
  }

  // The biggest horizontal face at the bottom of a set of faces.
  lowestFace(faces) {
    const flat = faces.filter((f) => Math.abs(newell(f)[2]) > 0.95);
    if (!flat.length) return null;
    const zmin = Math.min(...flat.map((f) => ext(f.map((q) => q[2]))[0]));
    const bottom = flat.filter((f) => ext(f.map((q) => q[2]))[1] <= zmin + 50);
    // A floor in several pieces (an L-shaped room, triangles) is joined
    // along the edges the pieces share.
    if (bottom.length > 1) { const joined = joinFaces(bottom); if (joined) return joined; }
    let best = null, area = 0;
    for (const f of bottom) {
      const a = Math.abs(polygonArea(f.map((q) => [q[0], q[1]])));
      if (a > area) { area = a; best = f; }
    }
    return best;
  }

  // -------------------------------------------------------------- roofs
  readRoofs() {
    const sloped = new Map(); // level id → [{pts, n, z1}]
    for (const s of this.surfaces) {
      if (!/Roof/i.test(s.attrs.surfaceType || "")) continue;
      for (const op of kids(s, "Opening")) { void op; this.count("skylights"); }
      const pts = this.planar(s);
      if (pts.length < 3) continue;
      const n = newell(pts);
      if (Math.abs(n[2]) < 0.2) continue; // a vertical "roof" is a parapet face
      const [z1, z2] = ext(pts.map((q) => q[2]));
      const lv = this.levelAt(z1 - 200);
      const top = lv.elevation + lv.height;
      const th = this.thickness.get(s.attrs.constructionIdRef) || 200;
      const plan = dedupe2(pts.map((q) => this.plan(q)));
      if (plan.length < 3) continue;
      if (Math.abs(n[2]) > 0.995 || z2 - z1 < 50) {
        const r = { id: uid("rf"), level: lv.id, kind: "flat", pts: plan, pitch: 0, overhang: 0, thickness: r1(th), material: "concrete" };
        if (Math.abs(z1 - top) > 50) r.offset = r1(z1 - top - th);
        this.roofs.push(r);
      } else {
        if (!sloped.has(lv.id)) sloped.set(lv.id, []);
        sloped.get(lv.id).push({ plan, n, z1, th });
        this.count("pitched");
      }
    }
    for (const [levelId, faces] of sloped) {
      const lv = this.levels.find((l) => l.id === levelId);
      const hull = convexHull(faces.flatMap((f) => f.plan));
      if (hull.length < 3) continue;
      const pitch = faces.reduce((s, f) => s + (Math.acos(Math.min(1, Math.abs(f.n[2]))) * 180) / Math.PI, 0) / faces.length;
      // Downhill directions of the faces (plan, y down).
      const dirs = faces.map((f) => { const l = Math.hypot(f.n[0], f.n[1]) || 1; return [f.n[0] / l, -f.n[1] / l]; });
      const r = orientedRect(hull);
      const along = [Math.cos((r.angle * Math.PI) / 180), Math.sin((r.angle * Math.PI) / 180)];
      const aligned = dirs.map((d) => d[0] * along[0] + d[1] * along[1]);
      const across = dirs.every((d, i) => Math.abs(aligned[i]) < 0.3);
      const lengthwise = dirs.every((d, i) => Math.abs(aligned[i]) > 0.95);
      const oneWay = dirs.every((d) => d[0] * dirs[0][0] + d[1] * dirs[0][1] > 0.95);
      let kind = "hip", rot = 0;
      if (oneWay) kind = "shed";
      else if (across) kind = "gable";
      else if (lengthwise) { kind = "gable"; rot = 90; }
      const z1 = Math.min(...faces.map((f) => f.z1));
      const roof = { id: uid("rf"), level: levelId, kind, pts: hull.map(([x, y]) => [r1(x), r1(y)]), pitch: r1(Math.min(75, pitch)), overhang: 0, thickness: r1(faces[0].th), material: "roof-tiles" };
      if (rot) roof.rot = rot;
      const top = lv.elevation + lv.height;
      if (Math.abs(z1 - top) > 50) roof.offset = r1(z1 - top);
      this.roofs.push(roof);
    }
  }
}

