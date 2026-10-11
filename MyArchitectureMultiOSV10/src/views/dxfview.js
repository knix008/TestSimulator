// DXF (AutoCAD R12, ASCII) of a documentation view or a sheet. The view is
// drawn once more through a recording canvas (an SvgContext that keeps every
// stroked path and text), so the DXF holds exactly what is printed: cut and
// projection lines, hatches, annotations, level and grid heads, title block.
// Views are written 1:1 in millimetres of the building, sheets in paper
// millimetres. y is flipped (DXF y points up). Layers follow the line weight.

import { SvgContext } from "../ui/svgctx.js";
import { viewSpec, drawView, viewExtent, ensureGen, cachedGen } from "./viewdraw.js";
import { drawSheet, prepareSheet } from "./sheets.js";
import { sheetLayout } from "./model.js";

class RecordingContext extends SvgContext {
  constructor(w, h) { super(w, h); this.ents = []; }
  parsePath() {
    const polys = [];
    let cur = null;
    for (const seg of this.path) {
      const c = seg[0];
      if (c === "M") { cur = { pts: [], closed: false }; polys.push(cur); const [x, y] = seg.slice(1).split(" ").map(Number); cur.pts.push([x, y]); }
      else if (c === "L" && cur) { const [x, y] = seg.slice(1).split(" ").map(Number); cur.pts.push([x, y]); }
      else if (c === "Z" && cur) cur.closed = true;
    }
    return polys.filter((q) => q.pts.length >= 2);
  }
  stroke() {
    super.stroke();
    const w = this.lineWidth * this.scaleFactor();
    const layer = w >= 0.34 ? "A-HEAVY" : w >= 0.2 ? "A-MEDIUM" : "A-THIN";
    for (const q of this.parsePath()) this.ents.push({ type: "poly", layer, color: this.strokeStyle, ...q });
  }
  fillText(text, x, y) {
    super.fillText(text, x, y);
    const size = parseFloat((this.font.match(/([\d.]+)px/) || [0, 10])[1]) * this.scaleFactor();
    const [px, py] = this.pt(x, y);
    const m = this.m;
    const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    this.ents.push({ type: "text", layer: "A-TEXT", text: String(text), x: px, y: py, size, rot, align: this.textAlign, base: this.textBaseline });
  }
}

// Non-ASCII as \U+XXXX (R12 reads it), like src/io/dxf.js.
const enc = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
const f = (n) => (Math.abs(n) < 1e-9 ? "0" : (+n.toFixed(4)).toString());

export function entitiesToDxf(ents, unitsMM = true) {
  const out = [];
  const g = (c, v) => out.push(String(c), String(v));
  const layers = [...new Set(ents.map((e) => e.layer))];
  const colours = { "A-HEAVY": 7, "A-MEDIUM": 7, "A-THIN": 8, "A-TEXT": 7 };
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$INSUNITS"); g(70, unitsMM ? 4 : 0); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length + 1);
  for (const l of ["0", ...layers]) { g(0, "LAYER"); g(2, l); g(70, 0); g(62, colours[l] || 7); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const e of ents) {
    if (e.type === "poly") {
      if (e.pts.length === 2 && !e.closed) {
        g(0, "LINE"); g(8, e.layer); g(10, f(e.pts[0][0])); g(20, f(-e.pts[0][1])); g(30, 0); g(11, f(e.pts[1][0])); g(21, f(-e.pts[1][1])); g(31, 0);
      } else {
        g(0, "POLYLINE"); g(8, e.layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.closed ? 1 : 0);
        for (const [x, y] of e.pts) { g(0, "VERTEX"); g(8, e.layer); g(10, f(x)); g(20, f(-y)); g(30, 0); }
        g(0, "SEQEND"); g(8, e.layer);
      }
    } else if (e.type === "text" && e.text.trim()) {
      const h72 = e.align === "center" ? 1 : e.align === "right" || e.align === "end" ? 2 : 0;
      const v73 = e.base === "middle" ? 2 : e.base === "top" || e.base === "hanging" ? 3 : 0;
      g(0, "TEXT"); g(8, e.layer); g(10, f(e.x)); g(20, f(-e.y)); g(30, 0); g(40, f(Math.max(0.01, e.size))); g(1, enc(e.text)); g(50, f(-e.rot));
      if (h72 || v73) { g(72, h72); g(73, v73); g(11, f(e.x)); g(21, f(-e.y)); g(31, 0); }
    }
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

// DXF of one view at 1:1 (building millimetres).
export async function viewDxf(p, view, rev = 0, o = {}) {
  const spec = viewSpec(p, view);
  if (!spec) throw new Error("view not found");
  if (spec.type === "model") await ensureGen(p, spec, rev);
  const ext = viewExtent(p, view, null, rev);
  const ctx = new RecordingContext(ext.x2 - ext.x1, ext.y2 - ext.y1);
  drawView(ctx, p, view, { ink: "#000000", bg: "#ffffff", print: true, rev, gen: spec.type === "model" ? cachedGen(p, spec, rev) : null, theme: o.planTheme, units: o.units, minLw: 0, planOpts: { lw: 0.18 * spec.scale, px: 0.06 * spec.scale } });
  return { dxf: entitiesToDxf(ctx.ents), entities: ctx.ents.length };
}

// DXF of one sheet in paper millimetres.
export async function sheetDxf(p, sheet, rev = 0, o = {}) {
  await prepareSheet(p, sheet, rev);
  const L = sheetLayout(sheet);
  const ctx = new RecordingContext(L.W, L.H);
  drawSheet(ctx, p, sheet, { rev, print: true, t: o.t, units: o.units });
  return { dxf: entitiesToDxf(ctx.ents), entities: ctx.ents.length };
}
