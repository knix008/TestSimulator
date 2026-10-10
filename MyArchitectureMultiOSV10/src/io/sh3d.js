// Sweet Home 3D reader (.sh3d). A .sh3d file is a ZIP archive; since version
// 5.3 it carries Home.xml next to the Java-serialized "Home" entry, and that
// XML is what is read here (the Java stream is not). Sweet Home 3D works in
// centimetres with x to the right and y down the screen, like our plan, and
// angles in radians clockwise on screen, so the conversion is a ×10 scale.
//
// Brought in: levels (elevation, height, floor thickness; levels at the same
// elevation are merged), walls (thickness, height, sloping tops as the higher
// end, round walls as short straight pieces, side colour), rooms (outline,
// name, floor texture or colour → floor material), doors and windows (as
// openings in the wall they sit in), furniture and lights (matched to our
// catalog by name / catalog id, otherwise a box of the item's size and
// colour), staircases (as stairs), furniture groups, dimension lines, labels,
// polylines and the compass (north, latitude, longitude).

import { isZip, zipEntries, zipEntryData } from "./unzip.js";
import { parseXml, kids, kid, textOf, localName, rootElement, numAttr, r1, furnitureKindFor, plainWords, argbToHex, floorMaterialFor, hostWall, alongWall, fitOpeningToWall, dropOverlappingOpenings, resolveWallOverlaps } from "./bimkit.js";
import { newProject, normalizeProject } from "../core/project.js";
import { uid } from "../core/geom.js";

const CM = 10; // mm per Sweet Home 3D unit
const DEG = 180 / Math.PI;

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""); } catch { return new TextDecoder("latin1").decode(bytes); }
}

// .sh3d bytes (or the bytes of a bare Home.xml) → {project, warnings, stats}.
export async function importSh3d(bytes, { name = "" } = {}) {
  if (!isZip(bytes)) {
    const text = decodeText(bytes);
    if (/<home[\s>]/.test(text.slice(0, 4096))) return importSweetHomeXml(text, { name });
    throw codedError("sh3d-not", "This is not a Sweet Home 3D file (no ZIP archive and no Home.xml).");
  }
  const entries = zipEntries(bytes);
  const xml = entries.find((e) => e.name === "Home.xml");
  if (!xml) {
    if (entries.some((e) => e.name === "Home")) throw codedError("sh3d-old", "This Sweet Home 3D file was saved by a version older than 5.3 and has no Home.xml. Open it in Sweet Home 3D 5.3 or later and save it again.");
    throw codedError("sh3d-not", "This ZIP archive is not a Sweet Home 3D file (no Home.xml).");
  }
  return importSweetHomeXml(decodeText(await zipEntryData(bytes, xml)), { name });
}

// Home.xml text → {project, warnings, stats}.
export function importSweetHomeXml(text, { name = "" } = {}) {
  const home = rootElement(parseXml(text));
  if (!home || localName(home.name) !== "home") throw codedError("sh3d-not", "This is not a Sweet Home 3D Home.xml (no <home> element).");
  return new Sh3dReader(home, name).run();
}

class Sh3dReader {
  constructor(home, name) {
    this.home = home;
    this.name = name;
    this.warnings = [];
    this.counts = {};
    this.walls = [];
    this.openings = [];
    this.rooms = [];
    this.furniture = [];
    this.stairs = [];
    this.dimensions = [];
    this.texts = [];
    this.drawings = [];
    this.doorWindows = [];
  }

  count(k, n = 1) { this.counts[k] = (this.counts[k] || 0) + n; }

  run() {
    const { home } = this;
    this.readLevels();
    for (const el of kids(home, "wall")) this.readWall(el);
    const fix = resolveWallOverlaps(this.walls, []);
    this.count("wallOverlaps", fix.removed + fix.trimmed);
    for (const el of kids(home, "room")) this.readRoom(el);
    this.readPieces(kids(home), null);
    this.placeDoorWindows();
    for (const el of kids(home, "dimensionLine")) this.readDimension(el);
    for (const el of kids(home, "label")) this.readLabel(el);
    for (const el of kids(home, "polyline")) this.readPolyline(el);

    const p = newProject(this.title());
    p.levels = this.levels.map(({ id, name, elevation, height, slab }) => ({ id, name, elevation, height, slab }));
    Object.assign(p, { walls: this.walls, openings: this.openings, rooms: this.rooms, furniture: this.furniture, stairs: this.stairs, dimensions: this.dimensions, texts: this.texts, drawings: this.drawings });
    if (this.drawings.length) p.layers.push({ id: "SH3D", name: "Sweet Home 3D", color: "#9aa4b5", visible: true });
    const compass = kid(home, "compass");
    if (compass) {
      const north = numAttr(compass, "northDirection", 0);
      if (Math.abs(north) > 0.01) p.meta.north = r1(((north % 360) + 360) % 360);
      const lat = numAttr(compass, "latitude"), lon = numAttr(compass, "longitude");
      if (lat !== null && Math.abs(lat) <= Math.PI / 2) p.meta.latitude = Math.round(lat * DEG * 1e4) / 1e4;
      if (lon !== null && Math.abs(lon) <= Math.PI) p.meta.longitude = Math.round(lon * DEG * 1e4) / 1e4;
    }
    p.meta.comment = `Imported from Sweet Home 3D${home.attrs.version ? ` (file version ${home.attrs.version})` : ""}`;
    normalizeProject(p);
    p.view.level = p.levels[0].id;
    this.report();
    const stats = { levels: p.levels.length, walls: p.walls.length, openings: p.openings.length, rooms: p.rooms.length, furniture: p.furniture.length, stairs: p.stairs.length, dimensions: p.dimensions.length, texts: p.texts.length };
    return { project: p, warnings: this.warnings, stats };
  }

  title() {
    const n = this.home.attrs.name || this.name || "";
    return n.split(/[\\/]/).pop().replace(/\.sh3d$/i, "") || "Sweet Home 3D";
  }

  report() {
    const W = {
      mergedLevels: (n) => `${n} levels at the same elevation as another were merged into it`,
      roundWalls: (n) => `${n} round walls were split into straight pieces`,
      slopedWalls: (n) => `${n} walls with a sloping top were given the height of their higher end`,
      noWall: (n) => `${n} doors/windows are not in a wall and were skipped`,
      shortWall: (n) => `${n} doors/windows sit in walls too short for them and were skipped`,
      wallOverlaps: (n) => `${n} overlapping walls were removed or shortened`,
      stacked: (n) => `${n} doors/windows stacked above another were joined into one opening`,
      overlap: (n) => `${n} doors/windows overlapping another in the same wall were skipped`,
      resized: (n) => `${n} doors/windows were narrowed or lowered to fit their wall`,
      boxes: (n) => `${n} furniture items have no counterpart in the catalog and came in as boxes of their size and colour`,
      small: (n) => `${n} small accessories (under 15 cm, e.g. cups, switches) were skipped`,
      hidden: (n) => `${n} hidden items were skipped`,
      tinyRooms: (n) => `${n} rooms without a usable outline were skipped`,
      models: () => "Furniture shapes come from our catalog; the 3D models and textures inside the .sh3d are not imported",
    };
    for (const [k, n] of Object.entries(this.counts)) if (n && W[k]) this.warnings.push(W[k](n));
    if (this.furniture.length) this.warnings.push(W.models());
  }

  // -------------------------------------------------------------- levels
  readLevels() {
    const list = kids(this.home, "level").map((el) => ({
      key: el.attrs.id, name: el.attrs.name || "", elevation: numAttr(el, "elevation", 0) * CM, height: numAttr(el, "height", 250) * CM,
      slab: numAttr(el, "floorThickness", 12) * CM, index: numAttr(el, "elevationIndex", 0),
    }));
    this.levelOf = new Map();
    this.levels = [];
    if (!list.length) {
      const h = numAttr(this.home, "wallHeight", 250) * CM;
      this.levels.push({ id: uid("lv"), name: "1F", elevation: 0, height: h, slab: 120, wallHeight: h });
      this.defaultLevel = this.levels[0];
      return;
    }
    list.sort((a, b) => a.elevation - b.elevation || a.index - b.index);
    for (const l of list) {
      const same = this.levels.find((x) => Math.abs(x.elevation - l.elevation) < 1);
      if (same) { same.height = Math.max(same.height, l.height); same.wallHeight = Math.max(same.wallHeight, l.height); this.levelOf.set(l.key, same); this.count("mergedLevels"); continue; }
      const lv = { id: uid("lv"), name: l.name || `${this.levels.length + 1}F`, elevation: r1(l.elevation), height: l.height, slab: r1(l.slab), wallHeight: l.height };
      this.levels.push(lv);
      this.levelOf.set(l.key, lv);
    }
    // Our level height runs floor to floor: up to the next level when it sits
    // just above (on its floor slab), otherwise the level's own height.
    for (let i = 0; i < this.levels.length; i++) {
      const lv = this.levels[i], next = this.levels[i + 1];
      if (next) { const gap = next.elevation - lv.elevation; if (gap >= lv.height - 1 && gap <= lv.height + next.slab + 50) lv.height = gap; }
      lv.height = r1(Math.max(100, lv.height));
    }
    this.defaultLevel = this.levels.find((l) => l.elevation === 0) || this.levels[0];
  }

  level(el, inherited = null) {
    const k = el.attrs.level;
    return (k && this.levelOf.get(k)) || inherited || this.defaultLevel;
  }

  // -------------------------------------------------------------- walls
  readWall(el) {
    const lv = this.level(el);
    const x1 = numAttr(el, "xStart", 0) * CM, y1 = numAttr(el, "yStart", 0) * CM, x2 = numAttr(el, "xEnd", 0) * CM, y2 = numAttr(el, "yEnd", 0) * CM;
    if (Math.hypot(x2 - x1, y2 - y1) < 1) return;
    const thickness = Math.max(10, numAttr(el, "thickness", 10) * CM);
    const hStart = numAttr(el, "height", null), hEnd = numAttr(el, "heightAtEnd", null);
    let height = (hStart ?? numAttr(this.home, "wallHeight", null) ?? lv.wallHeight / CM) * CM;
    if (hEnd !== null && Math.abs(hEnd * CM - height) > 1) { height = Math.max(height, hEnd * CM); this.count("slopedWalls"); }
    const full = Math.abs(height - lv.height) < 1 || Math.abs(height - lv.wallHeight) < 1;
    const base = { level: lv.id, thickness: r1(thickness), height: full ? null : r1(height) };
    const color = argbToHex(el.attrs.leftSideColor) || argbToHex(el.attrs.rightSideColor);
    if (color) base.material = color;
    const arc = numAttr(el, "arcExtent", 0);
    const pts = Math.abs(arc) > 1e-3 ? arcPoints(x1, y1, x2, y2, arc) : [[x1, y1], [x2, y2]];
    if (pts.length > 2) this.count("roundWalls");
    for (let i = 0; i + 1 < pts.length; i++) {
      this.walls.push({ id: uid("w"), ...base, x1: r1(pts[i][0]), y1: r1(pts[i][1]), x2: r1(pts[i + 1][0]), y2: r1(pts[i + 1][1]) });
    }
  }

  // -------------------------------------------------------------- rooms
  readRoom(el) {
    const lv = this.level(el);
    const pts = kids(el, "point").map((q) => [r1(numAttr(q, "x", 0) * CM), r1(numAttr(q, "y", 0) * CM)]);
    const clean = pts.filter((q, i) => { const n = pts[(i + 1) % pts.length]; return Math.hypot(n[0] - q[0], n[1] - q[1]) > 1; });
    if (clean.length < 3) { this.count("tinyRooms"); return; }
    const room = { id: uid("r"), level: lv.id, name: (el.attrs.name || "").trim(), pts: clean };
    const tex = kids(el, "texture").find((t) => t.attrs.attribute === "floorTexture");
    const floor = floorMaterialFor(tex ? `${tex.attrs.name || ""} ${tex.attrs.catalogId || ""}` : "", argbToHex(el.attrs.floorColor));
    if (floor) room.floor = floor;
    this.rooms.push(room);
  }

  // -------------------------------------------------------------- furniture, lights, doors and windows
  readPieces(list, inherited) {
    for (const el of list) {
      const tag = localName(el.name);
      if (tag === "furnitureGroup") { this.readPieces(kids(el), this.level(el, inherited)); continue; }
      if (tag !== "pieceOfFurniture" && tag !== "doorOrWindow" && tag !== "light") continue;
      if (el.attrs.visible === "false") { this.count("hidden"); continue; }
      const lv = this.level(el, inherited);
      const item = {
        el, lv, x: numAttr(el, "x", 0) * CM, y: numAttr(el, "y", 0) * CM, angle: numAttr(el, "angle", 0),
        w: numAttr(el, "width", 50) * CM, d: numAttr(el, "depth", 50) * CM, h: numAttr(el, "height", 50) * CM,
        elevation: numAttr(el, "elevation", 0) * CM, names: [el.attrs.catalogId, el.attrs.name],
      };
      if (tag === "doorOrWindow" || el.attrs.doorOrWindow === "true") this.doorWindows.push(item);
      else this.readFurniture(item);
    }
  }

  readFurniture(it) {
    const { lv, w, d, h } = it;
    if (Math.max(w, d) < 150 && h < 150) { this.count("small"); return; }
    const rot = r1(normDeg(it.angle * DEG));
    const kind = furnitureKindFor(it.names, { w, d, h });
    if (kind === "@stair") {
      // Our stair runs along its local x and climbs toward +x; a Sweet Home
      // 3D staircase climbs from its front (+y) to its back.
      const vertical = Math.max(h, 100);
      this.stairs.push({ id: uid("s"), level: lv.id, x: r1(it.x), y: r1(it.y), rot: r1(normDeg(rot - 90)), length: r1(Math.max(300, d)), width: r1(Math.max(300, w)), steps: Math.max(2, Math.round(vertical / 175)) });
      return;
    }
    if (kind === "box") this.count("boxes");
    const item = { id: uid("f"), level: lv.id, kind, x: r1(it.x), y: r1(it.y), rot, w: r1(Math.max(10, w)), d: r1(Math.max(10, d)), h: r1(Math.max(1, h)), elevation: r1(it.elevation), color: argbToHex(it.el.attrs.color) };
    const name = (it.el.attrs.name || "").trim();
    if (name) item.name = name;
    this.furniture.push(item);
  }

  placeDoorWindows() {
    const wallsByLevel = new Map();
    for (const w of this.walls) { if (!wallsByLevel.has(w.level)) wallsByLevel.set(w.level, []); wallsByLevel.get(w.level).push(w); }
    const placed = [];
    for (const it of this.doorWindows) {
      const { lv } = it;
      const dir = [Math.cos(it.angle), Math.sin(it.angle)];
      const w = hostWall(wallsByLevel.get(lv.id) || [], it.x, it.y, { dir, depth: it.d, reach: 100 });
      if (!w) { this.count("noWall"); continue; }
      const words = it.names.filter(Boolean).map(plainWords).join(" ");
      const isDoor = /door|porte|porta|puerta|\btur\b|\btuer|garage|\bgate\b|portail|portillon|cancello|문/.test(words);
      const isWindow = /window|fenetre|finestra|ventana|fenster|skylight|velux|lucarne|hublot|oblo|창/.test(words);
      let kind;
      if (isDoor && (!isWindow || it.elevation < 300)) kind = /frame|\barch|arche|passage|opening|ouverture|doorway|\bvano\b/.test(words) && !/open door/.test(words) ? "opening" : "door";
      else if (isWindow) kind = "window";
      else kind = it.elevation < 300 && it.h >= 1700 ? "door" : "window";
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const n = [-(w.y2 - w.y1) / L, (w.x2 - w.x1) / L];
      const front = [-Math.sin(it.angle), Math.cos(it.angle)];
      const o = {
        id: uid("o"), wall: w.id, kind, at: alongWall(w, it.x, it.y), width: it.w, height: it.h, sill: Math.max(0, it.elevation),
        side: front[0] * n[0] + front[1] * n[1] >= 0 ? 1 : -1, hinge: it.el.attrs.modelMirrored === "true" ? "end" : "start",
      };
      if (kind === "door") o.type = /garage/.test(words) ? "garage" : /slid|coulis|scorrev|corredera|schiebe|patio/.test(words) ? "sliding" : (/double|french|porte fenetre|doppel|doppi/.test(words) && it.w >= 1100) ? "double" : "single";
      else if (kind === "window") o.type = /fixed|fixe|fisso|fija|fest/.test(words) ? "fixed" : /slid|coulis|scorrev|corredera|schiebe/.test(words) ? "sliding" : "casement";
      const before = [o.width, o.height, o.sill];
      const wallH = w.height ?? lv.height;
      if (!fitOpeningToWall(o, w, wallH)) { this.count("shortWall"); continue; }
      if (o.width < before[0] - 1 || o.height < before[1] - 1 || Math.abs(o.sill - before[2]) > 1) this.count("resized");
      const name = (it.el.attrs.name || "").trim();
      if (name) o.name = name;
      placed.push(o);
    }
    const { kept, dropped, stacked } = dropOverlappingOpenings(placed);
    this.count("overlap", dropped);
    this.count("stacked", stacked);
    const wallById = new Map(this.walls.map((w) => [w.id, w]));
    const heightOf = new Map(this.levels.map((l) => [l.id, l.height]));
    for (const o of kept) { const w = wallById.get(o.wall); fitOpeningToWall(o, w, w.height ?? heightOf.get(w.level)); }
    this.openings.push(...kept);
  }

  // -------------------------------------------------------------- annotations
  readDimension(el) {
    const lv = this.level(el);
    const zs = numAttr(el, "elevationStart", 0), ze = numAttr(el, "elevationEnd", zs);
    if (Math.abs(ze - zs) > 0.1) return; // vertical dimension in 3D: not a plan dimension
    const d = { id: uid("k"), level: lv.id, x1: r1(numAttr(el, "xStart", 0) * CM), y1: r1(numAttr(el, "yStart", 0) * CM), x2: r1(numAttr(el, "xEnd", 0) * CM), y2: r1(numAttr(el, "yEnd", 0) * CM), offset: r1(numAttr(el, "offset", 0) * CM) };
    if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 1) this.dimensions.push(d);
  }

  readLabel(el) {
    const lv = this.level(el);
    const body = kid(el, "text");
    const text = (body ? textOf(body) : el.attrs.text || "").trim();
    if (!text) return;
    const style = kids(el, "textStyle")[0];
    const size = style ? numAttr(style, "fontSize", 18) * CM : 180;
    this.texts.push({ id: uid("t"), level: lv.id, x: r1(numAttr(el, "x", 0) * CM), y: r1(numAttr(el, "y", 0) * CM), text, size: r1(size), rot: r1(normDeg(numAttr(el, "angle", 0) * DEG)) });
  }

  readPolyline(el) {
    const lv = this.level(el);
    const pts = kids(el, "point").map((q) => [r1(numAttr(q, "x", 0) * CM), r1(numAttr(q, "y", 0) * CM)]);
    if (pts.length < 2) return;
    const d = { id: uid("g"), level: lv.id, layer: "SH3D", kind: "polyline", pts, closed: el.attrs.closedPath === "true" && pts.length > 2 };
    const color = argbToHex(el.attrs.color);
    if (color) d.color = color;
    this.drawings.push(d);
  }
}

function normDeg(a) {
  let x = ((a % 360) + 360) % 360;
  if (x > 359.95) x = 0;
  return x;
}

// Points along a round wall from (x1, y1) to (x2, y2) turning by `extent`
// radians (Sweet Home 3D: a negative extent bulges to the right of the chord on
// screen, a positive one to the left),
// in pieces of at most 15°.
export function arcPoints(x1, y1, x2, y2, extent) {
  const chord = Math.hypot(x2 - x1, y2 - y1);
  const a = Math.min(Math.abs(extent), 2 * Math.PI - 1e-3);
  const dx = (x2 - x1) / chord, dy = (y2 - y1) / chord;
  const nx = -dy, ny = dx; // left normal (y down)
  const k = ((chord / 2) / Math.tan(a / 2)) * (extent < 0 ? 1 : -1);
  const cx = (x1 + x2) / 2 + nx * k, cy = (y1 + y2) / 2 + ny * k;
  const R = Math.hypot(x1 - cx, y1 - cy);
  const t1 = Math.atan2(y1 - cy, x1 - cx), t2 = Math.atan2(y2 - cy, x2 - cx);
  // The way round whose middle lies on the bulge side (opposite the normal
  // for a negative extent, along it for a positive one).
  const s = extent < 0 ? -1 : 1;
  const tm = Math.atan2(ny * s, nx * s);
  const wrap = (v) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const pos = wrap(t2 - t1), neg = pos - 2 * Math.PI;
  const sweep = Math.cos(t1 + pos / 2 - tm) >= Math.cos(t1 + neg / 2 - tm) ? pos : neg;
  const n = Math.max(2, Math.ceil(a / (Math.PI / 12) - 1e-4));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t1 + (sweep * i) / n;
    out.push(i === 0 ? [x1, y1] : i === n ? [x2, y2] : [cx + R * Math.cos(t), cy + R * Math.sin(t)]);
  }
  return out;
}
