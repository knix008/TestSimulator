// Walls, doors, windows and rooms from a CAD floor plan (DXF or SVG line
// drawing): the readers and the recogniser ported from MySketchBook
// (plan-dxf.js, plan-svg.js, plan-recognize.js), placed in this app's model the
// same way as a recognised picture (planpicture.js placePicturePlan, scale 1).
// Pure: text in, plain objects out (Node tests use it).

import { readDxf, flattenDxf, dxfUnits, extentOf, dxfToPlan, layerStats, SKIP_LAYER } from "./plan-dxf.js";
import { readSvgPlan, svgUnits, svgToPlan } from "./plan-svg.js";
import { recognizePlan } from "./plan-recognize.js";
import { placePicturePlan } from "./planpicture.js";
import { matchLibraryItem } from "./plan-match.js";
import { allFurniture } from "../lib/furniture.js";

// The catalogue as plan-match.js reads it (id, English name, tags, category, size [w, h, d] m), built once.
let matchItems = null;
const catalogueForMatch = () => (matchItems ||= allFurniture().map((d) => ({ id: d.kind, en: d.name, tags: String(d.tags || "").split(/\s+/).filter(Boolean), category: d.cat === "Outdoor" ? "outdoor" : d.cat, size: [d.w / 1000, d.h / 1000, d.d / 1000] })));

/** Furniture blocks of a DXF (inserts, plan metres) → [{ item, position, rotation, size }] (doors and windows are walls' business). */
export function blockFurniture(inserts) {
  const out = [];
  for (const b of inserts || []) {
    const name = `${b.name || ""} ${b.layer || ""}`;
    if (/door|window|wind|문|창|wall|벽|dim|text|title|grid/i.test(name)) continue;
    const bw = b.max[0] - b.min[0], bd = b.max[1] - b.min[1];
    if (!(bw > 0.15 && bd > 0.15) || bw > 6 || bd > 6) continue;
    // By name and size (both ways round: a block may be drawn turned); the height is not drawn (0.6 m guessed).
    const ways = [false, true].map((tw) => ({ tw, m: matchLibraryItem({ name: b.name, hints: b.layer, size: tw ? [bd, 0.6, bw] : [bw, 0.6, bd] }, catalogueForMatch()) })).filter((x) => x.m);
    if (!ways.length) continue;
    const best = ways.sort((x, y) => y.m.score - x.m.score)[0];
    const it = best.m.item, turn = best.tw;
    out.push({ item: it.id, position: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2], rotation: turn ? Math.PI / 2 : 0, size: turn ? [bd, bw] : [bw, bd] });
  }
  return out;
}

export const isPlanDrawingName = (name) => /\.(dxf|svg)$/i.test(name || "");

/**
 * Reads a DXF or SVG plan: { plan (lines, arcs, texts in metres, plan axes), result (the recogniser's walls and
 * openings), min, size (metres), units }. Dimension, furniture, text and hatch layers are left out (SKIP_LAYER).
 */
export function readPlanDrawing(name, text, { thickness = 0.15 } = {}) {
  let plan, units;
  if (/\.svg$/i.test(name)) {
    const svg = readSvgPlan(text);
    units = svgUnits(svg, "auto");
    plan = svgToPlan(svg, units.metres);
  } else {
    const doc = readDxf(text);
    const chosen = new Set(layerStats(doc).filter((l) => !l.off && !SKIP_LAYER.test(l.name)).map((l) => l.name));
    const flat = flattenDxf(doc, { layers: chosen });
    const all = flattenDxf(doc);
    units = dxfUnits(doc, extentOf(all).size, "auto");
    plan = dxfToPlan(flat, units.metres);
    plan.furniture = blockFurniture(dxfToPlan(all, units.metres).inserts); // furniture layers too
  }
  const result = recognizePlan(plan, { mode: "auto", defaultThickness: thickness });
  result.furniture = plan.furniture || [];
  const pts = [...plan.lines.flatMap((l) => [l.a, l.b]), ...plan.arcs.flatMap((a) => [a.p0, a.p1])];
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const min = pts.length ? [Math.min(...xs), Math.min(...zs)] : [0, 0];
  const size = pts.length ? [Math.max(...xs) - min[0], Math.max(...zs) - min[1]] : [0, 0];
  return { plan, result, min, size, units };
}

/**
 * A read drawing on the plan with its top-left corner at (x, y) mm: { walls, openings, rooms, problems } on `level`
 * (straightened a little if drawn turned, cleaned up: gaps joined, corners squared).
 */
export function placePlanDrawing(drawing, { level, x = 0, y = 0, roomName } = {}) {
  const [W, H] = drawing.size;
  if (!(W > 0)) return { walls: [], openings: [], rooms: [], problems: 0 };
  // The drawing's own metres as an underlay of the same size: one picture metre = one plan metre.
  const shift = (p) => [p[0] - drawing.min[0], p[1] - drawing.min[1]];
  const result = {
    ...drawing.result,
    walls: drawing.result.walls.map((w) => ({ ...w, a: shift(w.a), b: shift(w.b) })),
    furniture: (drawing.result.furniture || []).map((f) => ({ ...f, position: shift(f.position) })),
  };
  const u = { x, y, w: W * 1000, h: H * 1000, rot: 0 };
  const out = placePicturePlan(result, u, { level, pictureWidth: W, metresPerPixel: 1, ...(roomName ? { roomName } : {}) });
  return { walls: out.walls, openings: out.openings, rooms: out.rooms, furniture: out.furniture || [], problems: out.problems };
}
