// The Java-serialized "Home" entry of a Sweet Home 3D file (the only home
// data in files saved before version 5.3) → the same element tree that
// Home.xml parses into, so src/io/sh3d.js reads both the same way.
//
// The objects are com.eteks.sweethome3d.model.* (Home, Level, Wall, Room,
// HomePieceOfFurniture, HomeDoorOrWindow, HomeLight, HomeFurnitureGroup,
// DimensionLine, Label, Polyline, Compass, HomeTexture, HomeMaterial…) read
// field by field through src/io/javaser.js, so the layouts of every version
// since 1.0 work: missing fields take Sweet Home 3D's defaults. Model and
// texture contents are URLs into the archive ("jar:file:…!/12/chair.obj"),
// turned back into entry names.

import { readJavaObject, javaValue } from "./javaser.js";

const PKG = "com.eteks.sweethome3d.model.";

const el = (name, attrs = {}, children = []) => {
  const a = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== "" && !(typeof v === "number" && !Number.isFinite(v))) a[k] = String(v);
  return { name, attrs: a, children };
};

const f = (o) => (o && o.$fields) || {};
const list = (v) => { const x = javaValue(v); return Array.isArray(x) ? x : x instanceof Map ? [...x.values()] : []; };
// Java floats print as their shortest float32 decimal (as Home.xml has them).
function floatText(x) {
  if (!Number.isFinite(x) || Number.isInteger(x) || Math.fround(x) !== x) return x;
  for (let p = 1; p <= 9; p++) { const y = +x.toPrecision(p); if (Math.fround(y) === x) return y; }
  return x;
}
const num = (v) => { const x = javaValue(v); return typeof x === "number" ? floatText(x) : null; };
const color = (v) => { const x = num(v); return x === null ? null : (x >>> 0).toString(16).toUpperCase().padStart(8, "0"); };
const bool = (v) => (v === true ? "true" : v === false ? "false" : null);
const short = (c) => String((c && c.$class) || "").replace(/^.*\./, "");

// Archive entry named by a Content (URLContent / HomeURLContent / …).
function contentEntry(c) {
  if (!c || typeof c !== "object") return null;
  const url = javaValue(f(c).url);
  if (typeof url === "string") {
    const i = url.indexOf("!/");
    return i >= 0 ? url.slice(i + 2) : null;
  }
  return null;
}

// → the <home> element for a serialized Home entry (bytes).
export function sh3dJavaHome(bytes) {
  const home = readJavaObject(bytes);
  if (!home || home.$class !== `${PKG}Home`) throw new Error(`the Home entry holds ${home && home.$class ? home.$class : "no object"}, not a Sweet Home 3D home`);
  return new JavaHomeMapper(home).home();
}

class JavaHomeMapper {
  constructor(home) {
    this.h = home;
    this.levelIds = new Map();
  }

  levelRef(o) {
    const lv = f(o).level;
    return lv ? this.levelIds.get(lv) || null : null;
  }

  home() {
    const H = f(this.h);
    const out = el("home", { version: num(H.version), name: H.name, wallHeight: num(H.wallHeight) });
    const kids = out.children;
    const levels = list(H.levels);
    levels.forEach((lv, i) => {
      const id = `level${i}`;
      this.levelIds.set(lv, id);
      const L = f(lv);
      kids.push(el("level", { id, name: L.name ?? `Level ${i}`, elevation: num(L.elevation) ?? 0, floorThickness: num(L.floorThickness) ?? 12, height: num(L.height) ?? num(H.wallHeight) ?? 250, elevationIndex: num(L.elevationIndex), visible: bool(L.visible), viewable: bool(L.viewable) }));
    });
    const compass = H.compass;
    if (compass) {
      const C = f(compass);
      kids.push(el("compass", { x: num(C.x), y: num(C.y), diameter: num(C.diameter), northDirection: num(C.northDirection), latitude: num(C.latitude), longitude: num(C.longitude), visible: bool(C.visible) }));
    }
    // Home.readObject: the full furniture list sits in a backward-compatibility
    // field (with groups since 2.3, with doors / windows since 1.7).
    const furniture = list(H.furnitureWithGroups ?? H.furnitureWithDoorsAndWindows ?? H.furniture);
    for (const p of furniture) { const e = this.piece(p); if (e) kids.push(e); }
    const wallHeight = num(H.wallHeight);
    const walls = list(H.walls);
    const wallIds = new Map(walls.map((w, i) => [w, `wall${i}`]));
    for (const w of walls) kids.push(this.wall(w, wallIds, wallHeight));
    for (const r of list(H.rooms)) kids.push(this.room(r));
    for (const p of list(H.polylines)) kids.push(this.polyline(p));
    for (const d of list(H.dimensionLines)) kids.push(this.dimension(d));
    for (const l of list(H.labels)) kids.push(this.label(l));
    return out;
  }

  texture(t, attribute) {
    if (!t) return null;
    const T = f(t);
    return el("texture", { attribute, catalogId: T.catalogId, name: T.name || "texture", width: num(T.width), height: num(T.height), image: contentEntry(T.image) });
  }

  piece(p) {
    if (!p || !p.$class) return null;
    const P = f(p);
    const cls = short(p);
    const tag = cls === "HomeFurnitureGroup" ? "furnitureGroup" : cls === "HomeDoorOrWindow" || (P.doorOrWindow === true && cls === "HomePieceOfFurniture") ? "doorOrWindow" : cls === "HomeLight" ? "light" : cls === "HomeShelfUnit" ? "shelfUnit" : "pieceOfFurniture";
    const attrs = {
      level: this.levelRef(p), catalogId: P.catalogId, name: P.name ?? "", x: num(P.x), y: num(P.y), elevation: num(P.elevation), angle: num(P.angle),
      width: num(P.width), depth: num(P.depth), height: num(P.height), visible: bool(P.visible), modelMirrored: bool(P.modelMirrored),
      color: color(P.color), shininess: num(P.shininess), pitch: num(P.pitch), roll: num(P.roll), staircaseCutOutShape: P.staircaseCutOutShape,
    };
    const children = [];
    if (tag === "furnitureGroup") {
      for (const c of list(P.furniture)) { const e = this.piece(c); if (e) children.push(e); }
      return el(tag, attrs, children);
    }
    attrs.model = contentEntry(P.model);
    const rot = P.modelRotation;
    if (Array.isArray(rot) && rot.length === 3) {
      const flat = rot.flatMap((row) => Array.from(row || []));
      if (flat.length === 9 && flat.join(" ") !== "1 0 0 0 1 0 0 0 1") attrs.modelRotation = flat.join(" ");
    }
    if (tag === "doorOrWindow") attrs.doorOrWindow = "true";
    const tex = this.texture(P.texture, null);
    if (tex) children.push(tex);
    for (const m of Array.isArray(P.modelMaterials) ? P.modelMaterials : []) {
      if (!m) continue;
      const M = f(m);
      const mt = this.texture(M.texture, null);
      children.push(el("material", { name: M.name, key: M.key, color: color(M.color), shininess: num(M.shininess) }, mt ? [mt] : []));
    }
    return el(tag, attrs, children);
  }

  wall(w, ids, wallHeight) {
    const W = f(w);
    const children = [];
    for (const [k, a] of [["leftSideTexture", "leftSideTexture"], ["rightSideTexture", "rightSideTexture"]]) { const t = this.texture(W[k], a); if (t) children.push(t); }
    return el("wall", {
      id: ids.get(w), level: this.levelRef(w), wallAtStart: W.wallAtStart ? ids.get(W.wallAtStart) : null, wallAtEnd: W.wallAtEnd ? ids.get(W.wallAtEnd) : null,
      xStart: num(W.xStart), yStart: num(W.yStart), xEnd: num(W.xEnd), yEnd: num(W.yEnd),
      // Home.readObject gives walls without a height the home's wall height.
      height: num(W.height) ?? wallHeight, heightAtEnd: num(W.heightAtEnd), thickness: num(W.thickness), arcExtent: num(W.arcExtent),
      leftSideColor: color(W.leftSideColor), rightSideColor: color(W.rightSideColor), topColor: color(W.topColor),
    }, children);
  }

  room(r) {
    const R = f(r);
    const children = [];
    for (const [k, a] of [["floorTexture", "floorTexture"], ["ceilingTexture", "ceilingTexture"]]) { const t = this.texture(R[k], a); if (t) children.push(t); }
    for (const pt of Array.isArray(R.points) ? R.points : []) if (pt && pt.length >= 2) children.push(el("point", { x: pt[0], y: pt[1] }));
    return el("room", { level: this.levelRef(r), name: R.name, floorColor: color(R.floorColor), ceilingColor: color(R.ceilingColor), floorVisible: bool(R.floorVisible), ceilingVisible: bool(R.ceilingVisible), areaVisible: bool(R.areaVisible) }, children);
  }

  polyline(p) {
    const P = f(p);
    const children = (Array.isArray(P.points) ? P.points : []).filter((pt) => pt && pt.length >= 2).map((pt) => el("point", { x: pt[0], y: pt[1] }));
    return el("polyline", { level: this.levelRef(p), thickness: num(P.thickness), closedPath: bool(P.closedPath), color: color(P.color) }, children);
  }

  dimension(d) {
    const D = f(d);
    return el("dimensionLine", { level: this.levelRef(d), xStart: num(D.xStart), yStart: num(D.yStart), xEnd: num(D.xEnd), yEnd: num(D.yEnd), elevationStart: num(D.elevationStart), elevationEnd: num(D.elevationEnd), offset: num(D.offset) ?? 0 });
  }

  label(l) {
    const L = f(l);
    const children = [];
    const style = L.style ? f(L.style) : null;
    if (style && num(style.fontSize) !== null) children.push(el("textStyle", { fontSize: num(style.fontSize) }));
    children.push({ name: "text", attrs: {}, children: [{ text: String(L.text ?? "") }] });
    return el("label", { level: this.levelRef(l), x: num(L.x), y: num(L.y), angle: num(L.angle), color: color(L.color) }, children);
  }
}
