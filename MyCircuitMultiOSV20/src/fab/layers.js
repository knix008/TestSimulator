// What goes on each fabrication layer, as a flat ordered list of drawing
// primitives in board space (mm, y down). Gerber and SVG writers both render
// from this list, so the two outputs always agree.
//
// prim (all carry pol: "dark" | "clear", optional func = Gerber AperFunction,
//       optional obj = {net, ref, pin} for X2 object attributes):
//   {t: "pad", pad, inflate}                pad as from footprintPads()
//   {t: "circle", x, y, d}                  flashed round dot (vias, holes)
//   {t: "seg", x1, y1, x2, y2, w}           round-ended stroke
//   {t: "ring", cx, cy, r, w}               stroked circle
//   {t: "polyline", pts, w, closed}         stroked path (text, outlines)
//   {t: "poly", pts, grow?}                 filled region (+ outline grown by `grow`)

import { copperLayers } from "../core/project.js";
import { polygonBounds } from "../core/geom.js";
import { allPads, footprintGraphics, footprintRefPos } from "../pcb/board.js";
import { getFootprint } from "../lib/footprints.js";
import { zoneOps } from "../pcb/zones.js";
import { strokeText, strokeTextThickness } from "./strokefont.js";

// Layers a fab house needs, in conventional stack order.
export function fabLayers(pcb) {
  return [...copperLayers(pcb), "F.Mask", "B.Mask", "F.Paste", "B.Paste", "F.SilkS", "B.SilkS", "Edge.Cuts"];
}

// {kind, side, index, fileFunction, polarity} for a layer name.
export function layerInfo(pcb, layer) {
  const copper = copperLayers(pcb);
  if (layer.endsWith(".Cu")) {
    const index = copper.indexOf(layer);
    const n = index < 0 ? (parseInt(layer.slice(2), 10) || 0) + 1 : index + 1;
    const pos = layer === "F.Cu" ? "Top" : layer === "B.Cu" ? "Bot" : "Inr";
    return { kind: "copper", side: layer[0] === "B" ? "B" : layer[0] === "F" ? "F" : "In", index: n, fileFunction: `Copper,L${n},${pos}`, polarity: "Positive" };
  }
  const side = layer.startsWith("B.") ? "B" : "F";
  const pos = side === "B" ? "Bot" : "Top";
  if (layer.endsWith(".Mask")) return { kind: "mask", side, fileFunction: `Soldermask,${pos}`, polarity: "Negative" };
  if (layer.endsWith(".Paste")) return { kind: "paste", side, fileFunction: `Paste,${pos}`, polarity: "Positive" };
  if (layer.endsWith(".SilkS")) return { kind: "silk", side, fileFunction: `Legend,${pos}`, polarity: "Positive" };
  if (layer === "Edge.Cuts") return { kind: "edge", side: "", fileFunction: "Profile,NP", polarity: "Positive" };
  return { kind: "other", side, fileFunction: "Other,Drawing", polarity: "Positive" };
}

const isBack = (layer) => layer.startsWith("B.");

// Text on a layer as stroked polylines. Back-side text always reads mirrored.
export function textPrims(t, layer, func) {
  const size = t.size || 1;
  const w = t.w || t.thickness || strokeTextThickness(size);
  const mirror = isBack(layer) || !!t.mirror;
  return strokeText(t.text, t.x, t.y, size, { rot: t.rot || 0, mirror, anchor: t.anchor || "middle" })
    .map((pts) => ({ t: "polyline", pts, w, closed: false, pol: "dark", func }));
}

function graphicPrims(g, defaultW, func) {
  const w = g.w || defaultW;
  if (g.kind === "line") return [{ t: "seg", x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, w, pol: "dark", func }];
  if (g.kind === "rect") return [{ t: "polyline", pts: [[g.x1, g.y1], [g.x2, g.y1], [g.x2, g.y2], [g.x1, g.y2]], w, closed: true, pol: "dark", func }];
  if (g.kind === "circle") return [{ t: "ring", cx: g.cx, cy: g.cy, r: g.r, w, pol: "dark", func }];
  if (g.kind === "poly" && Array.isArray(g.pts)) return [{ t: "polyline", pts: g.pts, w, closed: true, pol: "dark", func }];
  return [];
}

function opBounds(op) {
  if (op.shape === "poly") {
    const b = polygonBounds(op.pts);
    const g = op.grow || 0;
    return { x1: b.x1 - g, y1: b.y1 - g, x2: b.x2 + g, y2: b.y2 + g };
  }
  if (op.shape === "pad") {
    const r = Math.hypot(op.pad.w, op.pad.h) / 2 + (op.inflate || 0);
    return { x1: op.pad.x - r, y1: op.pad.y - r, x2: op.pad.x + r, y2: op.pad.y + r };
  }
  if (op.shape === "segment") {
    const h = op.w / 2;
    return { x1: Math.min(op.x1, op.x2) - h, y1: Math.min(op.y1, op.y2) - h, x2: Math.max(op.x1, op.x2) + h, y2: Math.max(op.y1, op.y2) + h };
  }
  const r = op.d / 2;
  return { x1: op.x - r, y1: op.y - r, x2: op.x + r, y2: op.y + r };
}

function overlaps(a, b) {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2;
}

// zoneOps -> prims, polarity preserved one-to-one. Clear ops that cannot touch
// this zone are dropped: Gerber has no clipping, so a stray knockout from zone
// A would otherwise punch through a neighbouring zone B drawn earlier.
export function zonePrims(pcb, zone) {
  const zb = polygonBounds(zone.pts);
  const out = [];
  for (const op of zoneOps(pcb, zone)) {
    if (op.polarity === "clear" && !overlaps(opBounds(op), zb)) continue;
    const pol = op.polarity;
    if (op.shape === "poly") out.push({ t: "poly", pts: op.pts, grow: op.grow || 0, pol });
    else if (op.shape === "pad") out.push({ t: "pad", pad: op.pad, inflate: op.inflate || 0, pol });
    else if (op.shape === "segment") out.push({ t: "seg", x1: op.x1, y1: op.y1, x2: op.x2, y2: op.y2, w: op.w, pol, func: "Conductor" });
    else if (op.shape === "circle") out.push({ t: "circle", x: op.x, y: op.y, d: op.d, pol });
  }
  return out;
}

function padFunc(pad) {
  if (pad.npth) return "ComponentDrill";
  return pad.smd ? "SMDPad,CuDef" : "ComponentPad";
}

// Ordered primitives for one layer.
// opts: maskExpansion (0.05), tentVias (true), pasteShrink (0), edgeWidth (0.1),
//       refText (true): reference designators on silk.
export function layerPrimitives(project, layer, opts = {}) {
  const pcb = project.pcb;
  const info = layerInfo(pcb, layer);
  const out = [];
  const sideCu = info.side === "B" ? "B.Cu" : "F.Cu";
  const pads = allPads(pcb);

  if (info.kind === "copper") {
    // Zones first: their knockouts must not erase pads/tracks drawn afterwards.
    const zones = (pcb.zones || []).filter((z) => z.layer === layer && z.pts && z.pts.length >= 3)
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    for (const z of zones) out.push(...zonePrims(pcb, z));
    for (const pad of pads) {
      if (!pad.layers.includes(layer)) continue;
      out.push({ t: "pad", pad, inflate: 0, pol: "dark", func: padFunc(pad), obj: { net: pad.net, ref: pad.ref, pin: pad.num } });
    }
    for (const t of pcb.tracks || []) {
      if (t.layer !== layer) continue;
      out.push({ t: "seg", x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, w: t.w, pol: "dark", func: "Conductor", obj: { net: t.net || "" } });
    }
    for (const v of pcb.vias || []) out.push({ t: "circle", x: v.x, y: v.y, d: v.d, pol: "dark", func: "ViaPad", obj: { net: v.net || "" } });
    for (const t of pcb.texts || []) if (t.layer === layer) out.push(...textPrims(t, layer, "NonConductor"));
    for (const g of pcb.graphics || []) if (g.layer === layer) out.push(...graphicPrims(g, 0.2, "NonConductor"));
  } else if (info.kind === "mask") {
    const e = opts.maskExpansion ?? 0.05;
    for (const pad of pads) {
      if (!(pad.npth || pad.layers.includes(sideCu))) continue;
      out.push({ t: "pad", pad, inflate: e, pol: "dark", func: padFunc(pad), obj: { ref: pad.ref, pin: pad.num } });
    }
    if (opts.tentVias === false) {
      for (const v of pcb.vias || []) out.push({ t: "circle", x: v.x, y: v.y, d: v.d + 2 * e, pol: "dark", func: "ViaPad" });
    }
    for (const g of pcb.graphics || []) if (g.layer === layer) out.push(...graphicPrims(g, 0.2));
  } else if (info.kind === "paste") {
    const shrink = opts.pasteShrink ?? 0;
    for (const pad of pads) {
      if (!pad.smd || !pad.layers.includes(sideCu)) continue;
      if (Math.min(pad.w, pad.h) - 2 * shrink <= 0) continue;
      out.push({ t: "pad", pad, inflate: -shrink, pol: "dark", func: "SMDPad,CuDef", obj: { ref: pad.ref, pin: pad.num } });
    }
  } else if (info.kind === "silk") {
    for (const fp of pcb.footprints || []) {
      for (const g of footprintGraphics(fp)) if (g.layer === layer) out.push(...graphicPrims(g, 0.12));
      const fpLayer = fp.side === "B" ? "B.SilkS" : "F.SilkS";
      if (fpLayer !== layer || opts.refText === false || fp.hideRef || !fp.ref || !getFootprint(fp.footprint)) continue;
      const p = footprintRefPos(fp);
      // Keep references upright-ish: never upside down.
      let rot = (((fp.rot || 0) % 360) + 360) % 360;
      if (rot > 90 && rot <= 270) rot -= 180;
      const size = fp.refSize || 1;
      out.push(...textPrims({ text: fp.ref, x: p.x, y: p.y, size, rot, w: strokeTextThickness(size) }, layer));
    }
    for (const t of pcb.texts || []) if (t.layer === layer) out.push(...textPrims(t, layer));
    for (const g of pcb.graphics || []) if (g.layer === layer) out.push(...graphicPrims(g, 0.12));
  } else if (info.kind === "edge") {
    const w = opts.edgeWidth ?? 0.1;
    if (pcb.outline && pcb.outline.length >= 3) out.push({ t: "polyline", pts: pcb.outline, w, closed: true, pol: "dark", func: "Profile" });
    for (const g of pcb.graphics || []) if (g.layer === layer) out.push(...graphicPrims(g, w, "Profile"));
  } else {
    for (const g of pcb.graphics || []) if (g.layer === layer) out.push(...graphicPrims(g, 0.1));
    for (const t of pcb.texts || []) if (t.layer === layer) out.push(...textPrims(t, layer));
  }
  return out;
}

// Effective corner radius of a roundrect pad, matching geom.padPolygon and
// zones.drawPadPath so every renderer agrees.
export function roundRectRadius(pad, inflate = 0) {
  const w = pad.w + inflate * 2;
  const h = pad.h + inflate * 2;
  return Math.max(0, Math.min(Math.min(w, h) / 2, Math.min(pad.w, pad.h) * 0.25 + inflate));
}

// Every drilled hole: {x, y, d, plated, kind: "pad"|"via", ref, pin, net}.
export function drillHoles(pcb) {
  const out = [];
  for (const pad of allPads(pcb)) {
    if (!(pad.drill > 0)) continue;
    out.push({ x: pad.x, y: pad.y, d: pad.drill, plated: !pad.npth, kind: "pad", ref: pad.ref, pin: pad.num, net: pad.net });
  }
  for (const v of pcb.vias || []) if (v.drill > 0) out.push({ x: v.x, y: v.y, d: v.drill, plated: true, kind: "via", net: v.net || "" });
  return out;
}
