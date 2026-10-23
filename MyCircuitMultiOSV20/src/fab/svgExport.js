// Board plot as SVG (printing, documentation). Board mm map 1:1 to SVG user
// units and both have y down, so no flip is needed. Layers draw in the order
// given (later on top). A layer that has clear-polarity operations (zones) is
// rendered through an SVG <mask> so knockouts behave exactly like Gerber
// %LPC*%.

import { polygonBounds } from "../core/geom.js";
import { layerPrimitives, drillHoles, roundRectRadius } from "./layers.js";

export const DEFAULT_LAYER_COLORS = {
  "F.Cu": "#c83434", "B.Cu": "#4d7fc4", "In1.Cu": "#c2c200", "In2.Cu": "#c261c2", "In3.Cu": "#7fc27f", "In4.Cu": "#c29f61",
  "F.SilkS": "#f2eda1", "B.SilkS": "#e8b2a7", "F.Mask": "#d864ff", "B.Mask": "#02ffee",
  "F.Paste": "#b4a0a0", "B.Paste": "#00c2c2", "Edge.Cuts": "#d0d200", "F.Fab": "#afafaf", "B.Fab": "#5858ff",
};

const n = (v) => String(+(+v).toFixed(4));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function padSvg(pad, inflate, fill) {
  const w = Math.max(0.001, pad.w + 2 * inflate);
  const h = Math.max(0.001, pad.h + 2 * inflate);
  if (pad.shape === "circle") return `<circle cx="${n(pad.x)}" cy="${n(pad.y)}" r="${n(Math.max(w, h) / 2)}" fill="${fill}"/>`;
  let r = 0;
  if (pad.shape === "oval") r = Math.min(w, h) / 2;
  else if (pad.shape === "roundrect") r = roundRectRadius(pad, inflate);
  // Board rotation is CCW on screen; SVG rotate() is clockwise in y-down.
  const tf = pad.rot ? ` transform="rotate(${n(-pad.rot)} ${n(pad.x)} ${n(pad.y)})"` : "";
  const rr = r > 0 ? ` rx="${n(r)}" ry="${n(r)}"` : "";
  return `<rect x="${n(pad.x - w / 2)}" y="${n(pad.y - h / 2)}" width="${n(w)}" height="${n(h)}"${rr} fill="${fill}"${tf}/>`;
}

const ptsAttr = (pts) => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");

function primSvg(p, c) {
  switch (p.t) {
    case "pad": return padSvg(p.pad, p.inflate || 0, c);
    case "circle": return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.d / 2)}" fill="${c}"/>`;
    case "seg": return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${c}" stroke-width="${n(p.w)}" stroke-linecap="round"/>`;
    case "ring": return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="none" stroke="${c}" stroke-width="${n(p.w)}"/>`;
    case "polyline": {
      const tag = p.closed ? "polygon" : "polyline";
      return `<${tag} points="${ptsAttr(p.pts)}" fill="none" stroke="${c}" stroke-width="${n(p.w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case "poly": {
      const grow = p.grow > 0 ? ` stroke="${c}" stroke-width="${n(p.grow * 2)}" stroke-linejoin="round"` : "";
      return `<polygon points="${ptsAttr(p.pts)}" fill="${c}"${grow}/>`;
    }
    default: return "";
  }
}

// layers: names, drawn in order. opts:
//   colors     {layer: css colour} overrides
//   opacity    {layer: 0..1} (masks default 0.6, others 1)
//   mirror     view from the bottom (flip x)
//   background css colour or null for transparent (default "#001023")
//   fit        true: width/height 100% (scales to the container); false: real mm size
//   drill      draw drill holes on top in the background colour (default true)
//   margin     mm around the outline (default 2)
//   + layerPrimitives options (maskExpansion, tentVias, ...)
export function pcbLayerSvg(project, layers, opts = {}) {
  const pcb = project.pcb;
  const colors = { ...DEFAULT_LAYER_COLORS, ...(opts.colors || {}) };
  const background = opts.background === undefined ? "#001023" : opts.background;
  const margin = opts.margin ?? 2;
  const b = polygonBounds(pcb.outline && pcb.outline.length ? pcb.outline : [[0, 0], [10, 10]]);
  const vx = b.x1 - margin;
  const vy = b.y1 - margin;
  const vw = b.x2 - b.x1 + 2 * margin;
  const vh = b.y2 - b.y1 + 2 * margin;
  const size = opts.fit ? `width="100%" height="100%" preserveAspectRatio="xMidYMid meet"` : `width="${n(vw)}mm" height="${n(vh)}mm"`;
  const defs = [];
  const body = [];
  if (background) body.push(`<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${esc(background)}"/>`);
  for (const layer of layers) {
    const prims = layerPrimitives(project, layer, opts);
    if (!prims.length) continue;
    const color = esc(colors[layer] || "#888888");
    const op = (opts.opacity && opts.opacity[layer]) ?? (layer.endsWith(".Mask") ? 0.6 : 1);
    const id = `L_${layer.replace(/[^A-Za-z0-9]/g, "_")}`;
    const opAttr = op < 1 ? ` opacity="${n(op)}"` : "";
    if (prims.some((p) => p.pol === "clear")) {
      // Paint white for dark, black for clear, in order; then fill through the mask.
      defs.push(`<mask id="${id}_m" maskUnits="userSpaceOnUse" x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}">`);
      for (const p of prims) defs.push(primSvg(p, p.pol === "clear" ? "#000" : "#fff"));
      defs.push("</mask>");
      body.push(`<g id="${id}" data-layer="${esc(layer)}"${opAttr}><rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${color}" mask="url(#${id}_m)"/></g>`);
    } else {
      body.push(`<g id="${id}" data-layer="${esc(layer)}"${opAttr}>`);
      for (const p of prims) body.push(primSvg(p, color));
      body.push("</g>");
    }
  }
  if (opts.drill !== false) {
    const holeColor = esc(background || "#ffffff");
    const holes = drillHoles(pcb);
    if (holes.length) {
      body.push(`<g id="drill" data-layer="Drill">`);
      for (const h of holes) body.push(`<circle cx="${n(h.x)}" cy="${n(h.y)}" r="${n(h.d / 2)}" fill="${holeColor}"/>`);
      body.push("</g>");
    }
  }
  const content = opts.mirror
    ? `<g transform="translate(${n(b.x1 + b.x2)} 0) scale(-1 1)">\n${body.join("\n")}\n</g>`
    : body.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}">
<title>${esc((project.meta && project.meta.title) || "Board")} - ${esc(layers.join(", "))}</title>
${defs.length ? `<defs>\n${defs.join("\n")}\n</defs>\n` : ""}${content}
</svg>
`;
}
