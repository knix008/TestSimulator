// Draws the board into a canvas context set to world (mm) space.

import { copperLayers } from "../core/project.js";
import { getFootprint } from "../lib/footprints.js";
import { footprintPads, footprintGraphics, footprintRefPos, footprintCourtyard, fpTransform } from "./board.js";
import { paintZone, drawPadPath } from "./zones.js";
import { xform } from "../core/geom.js";

export const PCB_THEMES = {
  dark: {
    bg: "#0f1218", board: "#141b1f", grid: "#2b3138", gridMajor: "#3c444e",
    "F.Cu": "#d0443e", "B.Cu": "#3f7fd8", "In1.Cu": "#d9b23a", "In2.Cu": "#4fb35a", "In3.Cu": "#b45cc0", "In4.Cu": "#3fb8b8",
    "F.SilkS": "#f0eaa0", "B.SilkS": "#d9a3c9", "F.Mask": "#a33d9c", "B.Mask": "#1c7a7a", "F.Paste": "#b0b0b0", "B.Paste": "#7d7d7d",
    "F.Fab": "#a0a0a0", "B.Fab": "#5868a0", "F.CrtYd": "#ff38e0", "B.CrtYd": "#38d8ff", "Edge.Cuts": "#e6e23b", "Dwgs.User": "#c8c8c8",
    pad: "#d2a23c", padSmdF: "#d0443e", padSmdB: "#3f7fd8", hole: "#0b0d10", via: "#c2c2c2", viaHole: "#3a2e10",
    rats: "#38c8ff", select: "#ffffff", highlight: "#ffffff", drc: "#ff3d3d", drcWarn: "#ffb020", text: "#e8e8e8", ghost: "rgba(255,255,255,0.55)", bad: "#ff3d3d",
  },
  light: {
    bg: "#f4f4f0", board: "#e8ecdf", grid: "#c9cbc0", gridMajor: "#a5a89a",
    "F.Cu": "#c0302a", "B.Cu": "#2f66c0", "In1.Cu": "#b08d10", "In2.Cu": "#2e8c3a", "In3.Cu": "#8c3a9a", "In4.Cu": "#1f8f8f",
    "F.SilkS": "#2a7a2a", "B.SilkS": "#8a3a7a", "F.Mask": "#8a2d84", "B.Mask": "#156565", "F.Paste": "#7a7a7a", "B.Paste": "#5a5a5a",
    "F.Fab": "#6e6e6e", "B.Fab": "#3c4c88", "F.CrtYd": "#c020b0", "B.CrtYd": "#1aa0c0", "Edge.Cuts": "#8a8600", "Dwgs.User": "#505050",
    pad: "#b8860b", padSmdF: "#c0302a", padSmdB: "#2f66c0", hole: "#ffffff", via: "#6b6b6b", viaHole: "#f4f4f0",
    rats: "#0090c0", select: "#000000", highlight: "#ff00aa", drc: "#e00000", drcWarn: "#d08000", text: "#202020", ghost: "rgba(0,0,0,0.45)", bad: "#e00000",
  },
};

let strokeTextFn = null;
// The fabrication module provides a vector font; once loaded the editor uses it
// so text on screen matches the Gerber output exactly.
export function setStrokeFont(fn) { strokeTextFn = fn; }

export function drawBoardText(ctx, text, x, y, size, color, { rot = 0, mirror = false, anchor = "middle", w } = {}) {
  if (strokeTextFn) {
    const lines = strokeTextFn(String(text), x, y, size, { rot, mirror, anchor });
    ctx.strokeStyle = color;
    ctx.lineWidth = w || size * 0.15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const pl of lines) pl.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-rot * Math.PI / 180);
  if (mirror) ctx.scale(-1, 1);
  ctx.font = `${size * 1.25}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = anchor === "start" ? "left" : anchor === "end" ? "right" : "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text), 0, 0);
  ctx.restore();
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Layer drawing order, back to front, with the active layer last.
export function layerOrder(pcb, active) {
  const cu = copperLayers(pcb).slice().reverse();
  const order = cu.filter((l) => l !== active);
  if (cu.includes(active)) order.push(active);
  return order;
}

export function drawBoard(ctx, project, theme, scale, opts = {}) {
  const pcb = project.pcb;
  const vis = opts.visible || {};
  const isVis = (l) => vis[l] !== false;
  const active = opts.activeLayer || "F.Cu";
  const contrast = opts.highContrast;
  const hlNet = opts.highlightNet || null;
  const sel = opts.selection || new Set();
  const dim = (layer) => (contrast && layer !== active ? 0.25 : 1);

  // Board body.
  ctx.fillStyle = theme.board;
  ctx.beginPath();
  pcb.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();

  const padsByFp = new Map(pcb.footprints.map((fp) => [fp.id, footprintPads(fp, pcb)]));
  const order = layerOrder(pcb, active);

  for (const layer of order) {
    if (!isVis(layer)) continue;
    ctx.globalAlpha = dim(layer);
    const color = theme[layer] || "#888";
    // Zones.
    if (isVis("zones")) {
      for (const z of pcb.zones) {
        if (z.layer !== layer) continue;
        ctx.globalAlpha = dim(layer) * (hlNet && z.net !== hlNet ? 0.35 : 0.55);
        if (opts.zoneOutlinesOnly) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.15;
        } else paintZone(ctx, pcb, z, color, makeCanvas);
        ctx.globalAlpha = dim(layer);
        ctx.strokeStyle = sel.has(z.id) ? theme.select : color;
        ctx.lineWidth = Math.max(0.1, 1.5 / scale);
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.beginPath();
        z.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Tracks.
    ctx.lineCap = "round";
    for (const t of pcb.tracks) {
      if (t.layer !== layer) continue;
      const hl = hlNet && t.net === hlNet;
      ctx.strokeStyle = sel.has(t.id) ? theme.select : color;
      ctx.globalAlpha = dim(layer) * (hlNet && !hl ? 0.35 : 1);
      ctx.lineWidth = t.w;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
      if (hl) {
        ctx.strokeStyle = theme.highlight;
        ctx.lineWidth = Math.max(0.05, 1 / scale);
        ctx.stroke();
      }
    }
    // SMD pads on this layer.
    for (const [fpId, pads] of padsByFp) {
      for (const pad of pads) {
        if (!pad.smd || !pad.layers.includes(layer)) continue;
        ctx.globalAlpha = dim(layer) * (hlNet && pad.net !== hlNet ? 0.4 : 1);
        ctx.fillStyle = sel.has(fpId) ? mix(color, "#ffffff") : color;
        drawPadPath(ctx, pad);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  // Through-hole pads and vias are on every layer.
  for (const [fpId, pads] of padsByFp) {
    for (const pad of pads) {
      if (pad.smd) continue;
      if (pad.npth) {
        ctx.fillStyle = theme.hole;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, pad.drill / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = theme["Dwgs.User"];
        ctx.lineWidth = 0.05;
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = hlNet && pad.net !== hlNet ? 0.4 : 1;
      ctx.fillStyle = sel.has(fpId) ? mix(theme.pad, "#ffffff") : theme.pad;
      drawPadPath(ctx, pad);
      ctx.fill();
      ctx.fillStyle = theme.hole;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, pad.drill / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (isVis("vias")) {
    for (const v of pcb.vias) {
      ctx.globalAlpha = hlNet && v.net !== hlNet ? 0.4 : 1;
      ctx.fillStyle = sel.has(v.id) ? theme.select : theme.via;
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.d / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.viaHole;
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.drill / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Pad numbers / net names when zoomed in.
  if (opts.padLabels !== false && scale > 12) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const pads of padsByFp.values()) {
      for (const pad of pads) {
        const s = Math.min(pad.w, pad.h);
        if (s * scale < 14) continue;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = `bold ${s * 0.42}px 'Segoe UI', sans-serif`;
        ctx.fillText(pad.num, pad.x, pad.y - (pad.net && s * scale > 30 ? s * 0.12 : 0));
        if (pad.net && s * scale > 30) {
          ctx.font = `${s * 0.2}px 'Segoe UI', sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.75)";
          ctx.fillText(pad.net.length > 12 ? pad.net.slice(0, 11) + "…" : pad.net, pad.x, pad.y + s * 0.22);
        }
      }
    }
  }

  // Silkscreen and fab layers.
  for (const side of ["B", "F"]) {
    const silk = `${side}.SilkS`;
    if (!isVis(silk)) continue;
    const color = theme[silk];
    ctx.globalAlpha = contrast && !active.startsWith(side) ? 0.3 : 1;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    for (const fp of pcb.footprints) {
      if (fp.side !== side) continue;
      for (const g of footprintGraphics(fp)) {
        ctx.strokeStyle = sel.has(fp.id) ? theme.select : color;
        ctx.lineWidth = g.w;
        ctx.beginPath();
        if (g.kind === "line") { ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); }
        else ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (fp.hideRef) continue;
      const rp = footprintRefPos(fp);
      const def = getFootprint(fp.footprint);
      const sz = def && def.courtyard ? Math.min(1.0, Math.max(0.6, (def.courtyard.x2 - def.courtyard.x1) / 4)) : 1;
      drawBoardText(ctx, fp.ref, rp.x, rp.y, sz, sel.has(fp.id) ? theme.select : color, { mirror: side === "B" });
    }
    for (const t of pcb.texts) {
      if (t.layer !== silk) continue;
      drawBoardText(ctx, t.text, t.x, t.y, t.size || 1.5, sel.has(t.id) ? theme.select : color, { rot: t.rot || 0, mirror: side === "B" || t.mirror, anchor: "middle" });
    }
    for (const g of pcb.graphics) if (g.layer === silk) drawGraphic(ctx, g, sel.has(g.id) ? theme.select : color);
  }
  ctx.globalAlpha = 1;
  // Copper texts.
  for (const t of pcb.texts) {
    if (!t.layer.endsWith(".Cu") || !isVis(t.layer)) continue;
    drawBoardText(ctx, t.text, t.x, t.y, t.size || 1.5, sel.has(t.id) ? theme.select : theme[t.layer], { rot: t.rot || 0, mirror: t.layer === "B.Cu" || t.mirror });
  }

  // Courtyards and fab outlines.
  if (isVis("F.CrtYd") && opts.courtyards) {
    ctx.lineWidth = Math.max(0.03, 1 / scale);
    for (const fp of pcb.footprints) {
      ctx.strokeStyle = theme[fp.side === "B" ? "B.CrtYd" : "F.CrtYd"];
      const c = footprintCourtyard(fp);
      ctx.beginPath();
      c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
  }
  if (isVis("F.Fab") && opts.fab) {
    ctx.lineWidth = Math.max(0.03, 1 / scale);
    ctx.fillStyle = theme["F.Fab"];
    for (const fp of pcb.footprints) {
      const def = getFootprint(fp.footprint);
      if (!def) continue;
      const [x, y] = xform((def.courtyard.x1 + def.courtyard.x2) / 2, (def.courtyard.y1 + def.courtyard.y2) / 2, fpTransform(fp));
      drawBoardText(ctx, fp.value || "", x, y, 0.7, theme["F.Fab"], {});
    }
  }

  // Board edge.
  if (isVis("Edge.Cuts")) {
    ctx.strokeStyle = sel.has("outline") ? theme.select : theme["Edge.Cuts"];
    ctx.lineWidth = Math.max(0.1, 1.5 / scale);
    ctx.beginPath();
    pcb.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    for (const g of pcb.graphics) if (g.layer === "Edge.Cuts") drawGraphic(ctx, g, sel.has(g.id) ? theme.select : theme["Edge.Cuts"]);
  }
  for (const g of pcb.graphics) if (g.layer === "Dwgs.User" && isVis("Dwgs.User")) drawGraphic(ctx, g, sel.has(g.id) ? theme.select : theme["Dwgs.User"]);
  for (const d of pcb.dimensions) drawDimension(ctx, d, sel.has(d.id) ? theme.select : theme["Dwgs.User"], scale);
}

export function drawGraphic(ctx, g, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = g.w || 0.15;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (g.kind === "line") { ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); }
  else if (g.kind === "rect") ctx.rect(Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1));
  else if (g.kind === "circle") ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawDimension(ctx, d, color, scale) {
  const dx = d.x2 - d.x1;
  const dy = d.y2 - d.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = d.offset ?? 2;
  const ax = d.x1 + nx * off, ay = d.y1 + ny * off, bx = d.x2 + nx * off, by = d.y2 + ny * off;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(0.05, 1 / scale);
  ctx.beginPath();
  ctx.moveTo(d.x1, d.y1); ctx.lineTo(ax + nx * 0.5, ay + ny * 0.5);
  ctx.moveTo(d.x2, d.y2); ctx.lineTo(bx + nx * 0.5, by + ny * 0.5);
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.stroke();
  const ux = dx / len, uy = dy / len, ah = 0.6;
  for (const [px, py, s] of [[ax, ay, 1], [bx, by, -1]]) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + s * ux * ah + nx * ah * 0.35, py + s * uy * ah + ny * ah * 0.35);
    ctx.lineTo(px + s * ux * ah - nx * ah * 0.35, py + s * uy * ah - ny * ah * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  let ang = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  drawBoardText(ctx, `${len.toFixed(2)} mm`, (ax + bx) / 2 + nx * 0.9, (ay + by) / 2 + ny * 0.9, 1.0, color, { rot: ang });
}

function mix(a, b) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) + (pb >> 16)) >> 1;
  const g = (((pa >> 8) & 255) + ((pb >> 8) & 255)) >> 1;
  const bl = ((pa & 255) + (pb & 255)) >> 1;
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}
