// Walls, doors, windows and rooms from a picture of a floor plan (an image
// underlay): the recogniser ported from MySketchBook (plan-image.js reads the
// picture, plan-recognize.js pairs wall faces, plan-draft.js cleans up) and the
// result placed on the plan where the underlay lies, in this app's model (mm,
// walls x1 y1 x2 y2, openings at = centre along the wall, rooms detected from
// the new walls). Pure: RGBA pixels in ({ data, width, height }), plain objects out.

import { detectImageWalls, wallsOnly, borrowWindows, MAX_DETECT_SIZE } from "./plan-image.js";
import { fromResult, cleanupAll, pickDetection, dominantAngle, rotateDraft, wallLength, draftProblems } from "./plan-draft.js";
import { detectRooms } from "../core/rooms.js";
import { uid } from "../core/geom.js";
import { detectFurniture } from "./plan-furniture.js";
import { templateSource } from "./plan-templates.js";
import { furnitureDef, makeFurniture } from "../lib/furniture.js";

export { MAX_DETECT_SIZE };

let templateLoad = null;
/**
 * The library items' top views (MySketchBook's builders, loaded once; each item drawn once, when first asked for):
 * (item) → template, which plan-furniture.js compares the picture's shapes with — a bed's pillows, a sofa's back
 * and arms, a plant's leaves. Resolves to null when the builders cannot load (then the size rules alone name things).
 */
export function furnitureTemplates() {
  return (templateLoad ||= Promise.all([import("../lib/sketchbook/index.js"), import("../vendor/three/three.module.js")])
    .then(([sb, THREE]) => {
      const mat = new THREE.MeshBasicMaterial();
      return templateSource((id) => sb.sbItem(id)?.build({}, { quality: "low", wallThickness: 0.2, material: () => mat }) ?? null);
    })
    .catch(() => null));
}

/** What to read: 'auto' tries the four variants and keeps the one that leaves least to fix. */
export const PICTURE_METHODS = ["auto", "walls", "outline", "edges"];

// [method, walls-only picture first] — 'walls' leaves out furniture, coloured floors, hatching and text;
// 'outline' reads the borders of the ink (clean drawings), 'edges' Sobel + Hough (scans, photos, sketches).
const VARIANTS = {
  auto: [["outline", true], ["edges", true], ["outline", false], ["edges", false]],
  walls: [["outline", true]],
  outline: [["outline", false]],
  edges: [["edges", false]],
};

const EMPTY = { walls: [], openings: [], leftovers: [], texts: [], stats: { doors: 0, windows: 0 } };

/**
 * Reads a plan picture: the recogniser's result in picture metres (x right, z down from the top-left corner).
 * `step(i, total)` is awaited before each variant (a progress bar; lets the page breathe).
 */
export async function readPlanPicture(image, { metresPerPixel, method = "auto", step = async () => {}, furnitureStep = async () => {}, templates } = {}) {
  const variants = VARIANTS[method] || VARIANTS.auto;
  let wallsPicture;
  const found = [];
  for (const [i, [m, walls]] of variants.entries()) {
    await step(i, variants.length);
    if (walls && wallsPicture === undefined) wallsPicture = wallsOnly(image, { metresPerPixel });
    const picture = walls ? wallsPicture : image;
    found.push(picture ? { ...detectImageWalls(picture, { metresPerPixel, method: m, evidence: walls ? image : null }), leftovers: [], texts: [] } : EMPTY);
  }
  // The best reading, with the windows the others found where it has only thin frame lines.
  const best = found.length > 1 ? borrowWindows(found[pickDetection(found)], found) : found[0];
  if (!best) return EMPTY;
  // Furniture (MySketchBook's plan-furniture.js): sofas, beds, tables, wardrobes, toilets, baths, plants, rugs …
  // by their size, fill, colour, room and the walls they stand against.
  let furniture = [];
  if (best.walls.length) {
    await furnitureStep();
    const tpl = templates === undefined ? await furnitureTemplates() : templates;
    try { furniture = detectFurniture(image, { metresPerPixel, result: best, angle: best.angle ?? 0, templates: tpl }); } catch { furniture = []; }
  }
  return { ...best, furniture };
}

const rad = (deg) => (deg * Math.PI) / 180;
const turn = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

/** Plan point (mm) of a point of the underlay's picture given in picture metres (`k`: plan mm per picture metre). */
export function underlayPoint(u, p, k = 1000) {
  const q = turn([p[0] * k, p[1] * k], rad(u.rot || 0));
  return [u.x + q[0], u.y + q[1]];
}

/** The underlay turned by `angle` (radians) about its centre: { x, y, rot } (it turns about its top-left corner). */
export function turnUnderlay(u, angle) {
  const c = underlayPoint(u, [u.w / 2, u.h / 2], 1);
  const tl = turn([u.x - c[0], u.y - c[1]], angle);
  let rot = (u.rot || 0) + (angle * 180) / Math.PI;
  rot = Math.round(((rot % 360) + 540) % 360 * 1e6) / 1e6 - 180;
  return { x: c[0] + tl[0], y: c[1] + tl[1], rot: Math.abs(rot) < 1e-9 ? 0 : rot };
}

/** The recogniser's opening → this app's kind, type, hinge and side. */
export function openingOf(op) {
  const kind = op.kind === "window" ? "window" : op.kind === "passage" ? "opening" : "door";
  const type = kind === "window" ? (String(op.item || "").includes("sliding") ? "sliding" : "casement")
    : kind === "opening" ? undefined
    : op.kind === "double" || (op.kind === "folding" && op.width >= 1.2) ? "double"
    : op.kind === "sliding" || op.kind === "pocket" || op.kind === "folding" ? "sliding" : "single";
  // Plan-draft sides: 'left' = the wall's left normal (−dy, dx), as this app's side 1; the hinge 'left' / 'right'
  // is seen from the side the door opens to, so it is the wall's start when both say the same.
  const side = op.side === "right" ? -1 : 1;
  const hinge = op.hinge ? ((op.side !== "right") === (op.hinge === "left") ? "start" : "end") : "start";
  return { kind, ...(type ? { type } : {}), hinge, side };
}

/**
 * A recognised picture placed on the plan where underlay `u` lies (`pictureWidth`: the width in pixels the picture
 * was read at): { walls, openings, rooms, angle (the straightening turn, radians), underlay ({ x, y, rot } after
 * straightening, or null), problems } in this app's model on `level`. `straighten` turns a slightly tilted plan
 * square (and the underlay with it); `cleanup` joins gaps, squares corners and merges straight runs.
 */
export function placePicturePlan(result, u, { level, pictureWidth, metresPerPixel, straighten = true, cleanup = true, roomName = (area, i) => `Room ${i + 1}`, maxTilt = 20 } = {}) {
  // Picture metres → plan metres: the underlay's scale (its width over the picture's), turn and corner.
  const k = u.w / 1000 / (pictureWidth * metresPerPixel) || 1;
  const toPlan = (p) => { const q = underlayPoint(u, [p[0] * k, p[1] * k]); return [q[0] / 1000, q[1] / 1000]; };
  const placed = {
    ...result,
    walls: result.walls.map((w) => ({ ...w, a: toPlan(w.a), b: toPlan(w.b), thickness: w.thickness * k, ...(w.curve ? { curve: undefined } : {}) })),
    openings: result.openings.map((o) => ({ ...o, offset: o.offset * k, width: o.width * k })),
    texts: [], leftovers: [], furniture: [],
  };
  const d = fromResult(placed);
  let angle = 0;
  if (straighten && d.walls.length) {
    const a = dominantAngle(d);
    if (Math.abs(a) > rad(0.2) && Math.abs(a) < rad(maxTilt)) {
      const c = underlayPoint(u, [u.w / 2, u.h / 2], 1).map((v) => v / 1000);
      rotateDraft(d, c, -a);
      angle = -a;
    }
  }
  if (cleanup) cleanupAll(d);
  const problems = draftProblems(d).length;
  const mm = (v) => Math.round(v * 1000 * 10) / 10;
  const walls = []; const ids = new Map();
  for (const w of d.walls) {
    if (wallLength(w) < 0.05) continue;
    const id = uid("w");
    ids.set(w.id, { id, L: wallLength(w) });
    walls.push({ id, level, x1: mm(w.a[0]), y1: mm(w.a[1]), x2: mm(w.b[0]), y2: mm(w.b[1]), thickness: Math.max(50, Math.round(w.thickness * 1000 / 5) * 5), height: null });
  }
  const openings = [];
  for (const o of d.openings) {
    const w = ids.get(o.wall);
    if (!w) continue;
    const width = Math.min(o.width, Math.max(0.2, w.L - 0.02));
    const at = Math.max(width / 2, Math.min(w.L - width / 2, o.offset));
    openings.push({ id: uid("o"), wall: w.id, ...openingOf(o), at: mm(at), width: Math.round(width * 1000), height: Math.round((o.height ?? 2.1) * 1000), sill: Math.round((o.sill ?? 0) * 1000) });
  }
  const rooms = detectRooms(walls).sort((a, b) => b.area - a.area).map((r, i) => ({ id: uid("r"), level, name: roomName(r.area, i), pts: r.pts }));
  const furniture = placeFurniture(result.furniture || [], { u, k, toPlan, angle, level });
  return { walls, openings, rooms, furniture, angle, underlay: angle ? turnUnderlay(u, angle) : null, problems };
}

/**
 * Recognised furniture ({ item, position: [x, z] picture metres, rotation (radians about +Y, three.js), size: [w, d] m,
 * on: the index of the piece it stands on, if any }) as this app's furniture on `level`: the item is a catalogue kind, or MySketchBook's id ("sb-<id>"). A piece turned
 * by θ faces (sin θ, cos θ); this app's rot r faces (−sin r, cos r): r = −θ, plus the underlay's and the straightening turn.
 */
export function placeFurniture(list, { u, k, toPlan, angle = 0, level }) {
  const c = underlayPoint(u, [u.w / 2, u.h / 2], 1).map((v) => v / 1000);
  const about = (p) => { if (!angle) return p; const s = Math.sin(angle), co = Math.cos(angle), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co]; };
  const out = [];
  const placed = new Map(); // index in `list` → the piece made of it
  list.forEach((f, i) => {
    const def = furnitureDef(f.item) || furnitureDef(`sb-${f.item}`);
    if (!def || !f.position || !f.size) return;
    const q = about(toPlan(f.position));
    let rot = ((-(f.rotation || 0) + angle) * 180) / Math.PI + (u.rot || 0);
    rot = Math.round((((rot % 360) + 360) % 360) * 10) / 10;
    const w = Math.max(100, Math.round(f.size[0] * k * 1000)), d = Math.max(100, Math.round(f.size[1] * k * 1000));
    // A small thing found on another (a lamp on a nightstand, a TV on its console) stands on that one's top.
    const host = f.on != null ? placed.get(f.on) : null;
    const extra = host ? { elevation: (host.elevation || 0) + (host.h || 0) } : f.elevation != null ? { elevation: Math.round(f.elevation * 1000) } : {};
    const piece = { ...makeFurniture(def.kind, Math.round(q[0] * 1000), Math.round(q[1] * 1000), { rot, w, d, ...extra }), id: uid("u"), level };
    placed.set(i, piece);
    out.push(piece);
  });
  return out;
}

/** Pixels per metre the picture would have if the underlay's size is right (for the dialog's sanity note). */
export const picturePxPerMetre = (u, pictureWidth) => (pictureWidth * 1000) / u.w;
