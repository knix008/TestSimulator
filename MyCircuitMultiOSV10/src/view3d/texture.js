// Board face textures for the 3D viewer, painted with a plain 2D canvas API.
//
// Both faces are painted in board coordinates (mm, y down, not mirrored); the
// bottom face's UVs use the same mapping, so looking at it from below shows it
// mirrored exactly as the real board would. Bottom silkscreen text is drawn
// mirrored, as fabricated.
//
// Two flavours share the drawing code:
//   mode "color" : albedo (mask, copper under mask, exposed pads, silk)
//   mode "pbr"   : green = roughness, blue = metalness (three.js reads
//                  roughnessMap.g and metalnessMap.b), so pads shine and the
//                  mask stays glossy plastic.
// Everything here only needs a ctx with the usual 2D methods, so it can be
// exercised in Node with a stub context.

import { footprintPads, footprintGraphics, footprintRefPos } from "../pcb/board.js";
import { paintZone, drawPadPath } from "../pcb/zones.js";
import { polygonBounds } from "../core/geom.js";

// [mask over bare laminate, mask over copper]
export const MASK_COLORS = {
  green: ["#0f4d22", "#2b7a3a"],
  red: ["#9c1a18", "#c23a30"],
  blue: ["#123a8a", "#2c5cb6"],
  black: ["#121314", "#2a2b2d"],
  white: ["#e9e9e6", "#f6f3e8"],
  purple: ["#4b1f6f", "#6c3d93"],
  yellow: ["#c9a800", "#e2c63a"],
  matteblack: ["#18191a", "#262729"],
};

export const SILK_COLORS = { white: "#f2f2ee", black: "#151515", yellow: "#f0d63a", blue: "#2a55c0", red: "#c8302a", green: "#2f8f3e" };

const FR4 = "#b9a46a";
const BARE_COPPER = "#c98b4f";
const DEFAULT_SIZE = { pxPerMm: 20, maxSize: 4096 };

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex, toward, t) {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Mask colour by name ("green", "Red", ...) or any #rgb/#rrggbb.
export function maskPalette(name) {
  const key = String(name || "green").toLowerCase().replace(/[\s_-]/g, "");
  if (MASK_COLORS[key]) return { base: MASK_COLORS[key][0], copper: MASK_COLORS[key][1] };
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(name))) return { base: name, copper: mix(name, "#ffffff", 0.18) };
  return { base: MASK_COLORS.green[0], copper: MASK_COLORS.green[1] };
}

export function silkPalette(name) {
  const key = String(name || "white").toLowerCase();
  if (SILK_COLORS[key]) return SILK_COLORS[key];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(name))) return name;
  return SILK_COLORS.white;
}

// Surface finish of exposed copper: ENIG gold, HASL tin, OSP/none bare copper.
export function finishColor(finish) {
  const f = String(finish || "HASL");
  if (/enig|enepig|gold/i.test(f)) return "#dcb352";
  if (/osp|none|bare|copper/i.test(f)) return BARE_COPPER;
  return "#cdd1d6";
}

// Pixel layout of a face texture: adaptive density, capped to maxSize.
export function textureLayout(pcb, opts = {}) {
  const { pxPerMm, maxSize } = { ...DEFAULT_SIZE, ...opts };
  const b = polygonBounds(pcb.outline);
  const W = Math.max(1e-3, b.x2 - b.x1);
  const H = Math.max(1e-3, b.y2 - b.y1);
  const scale = Math.max(0.5, Math.min(pxPerMm, maxSize / Math.max(W, H)));
  const width = Math.max(1, Math.min(maxSize, Math.ceil(W * scale)));
  const height = Math.max(1, Math.min(maxSize, Math.ceil(H * scale)));
  // w/h are the mm the pixel grid really covers, so UVs line up exactly.
  return { x1: b.x1, y1: b.y1, w: width / scale, h: height / scale, scale, width, height };
}

// UV for a board point under a layout (texture flipY = true: canvas row 0 is v = 1).
export function boardUV(layout, x, y) {
  return [(x - layout.x1) / layout.w, 1 - (y - layout.y1) / layout.h];
}

function palette(pcb, opts) {
  const mask = opts.soldermask !== false;
  const mp = maskPalette(opts.maskColor || pcb.maskColor);
  if (opts.mode === "pbr") {
    // r unused, g = roughness, b = metalness
    return {
      base: mask ? "rgb(0,135,0)" : "rgb(0,180,0)",
      copper: mask ? "rgb(0,120,0)" : "rgb(0,90,210)",
      pad: "rgb(0,75,255)",
      silk: "rgb(0,215,0)",
    };
  }
  return {
    base: mask ? mp.base : FR4,
    copper: mask ? mp.copper : BARE_COPPER,
    pad: finishColor(pcb.finish),
    silk: silkPalette(opts.silkColor || pcb.silkColor),
  };
}

function normRot(r) {
  let a = (((r || 0) % 360) + 360) % 360;
  if (a > 90 && a <= 270) a -= 180; // keep reference designators readable
  return a;
}

// Text: vector stroke font when available, canvas fillText otherwise.
export function drawText(ctx, layout, text, x, y, size, { rot = 0, mirror = false } = {}, strokeText = null) {
  if (!text) return;
  if (strokeText) {
    let lines = null;
    try { lines = strokeText(String(text), x, y, size, { rot, mirror, anchor: "middle" }); } catch { lines = null; }
    if (Array.isArray(lines)) {
      ctx.lineWidth = Math.max(0.1, size * 0.15);
      ctx.beginPath();
      for (const pl of lines) {
        pl.forEach((p, i) => {
          const px = Array.isArray(p) ? p[0] : p.x;
          const py = Array.isArray(p) ? p[1] : p.y;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        });
      }
      ctx.stroke();
      return;
    }
  }
  // Pixel space, so tiny mm font sizes don't hit browser font clamping.
  const s = layout.scale;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate((x - layout.x1) * s, (y - layout.y1) * s);
  ctx.rotate((-rot * Math.PI) / 180);
  if (mirror) ctx.scale(-1, 1);
  ctx.font = `bold ${Math.max(1, size * s * 1.3).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text), 0, 0);
  ctx.restore();
}

// Paint one face. side: "top"|"bottom" (or "F"|"B").
// opts: {soldermask, copper, zones, silkscreen, maskColor, silkColor, mode}
// helpers: {makeCanvas(w,h), strokeText}
// Returns counts of what was drawn (handy for tests and stats).
export function paintBoardSide(ctx, project, side, layout, opts = {}, helpers = {}) {
  const pcb = project.pcb || project;
  const top = side === "top" || side === "F";
  const cu = top ? "F.Cu" : "B.Cu";
  const silkLayer = top ? "F.SilkS" : "B.SilkS";
  const pal = palette(pcb, opts);
  const s = layout.scale;
  const stats = { zones: 0, tracks: 0, vias: 0, pads: 0, silk: 0, texts: 0 };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.setTransform(s, 0, 0, s, -layout.x1 * s, -layout.y1 * s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const pads = pcb.footprints.flatMap((fp) => footprintPads(fp, pcb)).filter((p) => !p.npth && p.layers.includes(cu));

  if (opts.copper !== false) {
    // Copper under the mask reads as a lighter shade of the mask.
    if (opts.zones !== false && helpers.makeCanvas) {
      const zones = pcb.zones.filter((z) => z.layer === cu).sort((a, b) => (a.priority || 0) - (b.priority || 0));
      for (const z of zones) {
        if (!z.pts || z.pts.length < 3) continue;
        paintZone(ctx, pcb, z, pal.copper, helpers.makeCanvas);
        stats.zones++;
      }
    }
    ctx.strokeStyle = pal.copper;
    ctx.fillStyle = pal.copper;
    for (const t of pcb.tracks) {
      if (t.layer !== cu) continue;
      ctx.lineWidth = t.w || 0.25;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
      stats.tracks++;
    }
    // Vias are tented: copper ring under the mask.
    for (const v of pcb.vias) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, (v.d || 0.8) / 2, 0, Math.PI * 2);
      ctx.fill();
      stats.vias++;
    }
  }

  if (opts.silkscreen !== false) {
    ctx.strokeStyle = pal.silk;
    ctx.fillStyle = pal.silk;
    const strokeShape = (g) => {
      ctx.lineWidth = g.w || 0.12;
      ctx.beginPath();
      if (g.kind === "circle") ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
      else if (g.kind === "rect") ctx.rect(Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1));
      else { ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); }
      ctx.stroke();
      stats.silk++;
    };
    for (const fp of pcb.footprints) for (const g of footprintGraphics(fp)) if (g.layer === silkLayer) strokeShape(g);
    for (const g of pcb.graphics || []) if (g.layer === silkLayer) strokeShape(g);
    for (const fp of pcb.footprints) {
      if ((fp.side === "B") === top || !fp.ref) continue;
      const p = footprintRefPos(fp);
      ctx.fillStyle = pal.silk;
      ctx.strokeStyle = pal.silk;
      drawText(ctx, layout, fp.ref, p.x, p.y, fp.refSize || 1.0, { rot: normRot(fp.rot), mirror: !top }, helpers.strokeText);
      stats.texts++;
    }
    for (const t of pcb.texts || []) {
      if (t.layer !== silkLayer) continue;
      ctx.fillStyle = pal.silk;
      ctx.strokeStyle = pal.silk;
      drawText(ctx, layout, t.text, t.x, t.y, t.size || 1.5, { rot: t.rot || 0, mirror: !!t.mirror }, helpers.strokeText);
      stats.texts++;
    }
  }

  // Exposed pads last: the fab clips silkscreen off them.
  if (opts.copper !== false) {
    ctx.fillStyle = pal.pad;
    for (const pad of pads) {
      drawPadPath(ctx, pad, 0);
      ctx.fill();
      stats.pads++;
    }
  }
  ctx.restore();
  return stats;
}
