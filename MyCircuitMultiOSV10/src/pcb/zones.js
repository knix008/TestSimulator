// Copper zone (pour) fill, described as an ordered list of drawing operations
// rather than computed polygons:
//
//   1. the zone outline, dark
//   2. clear-polarity knockouts: other-net copper grown by the clearance,
//      thermal gaps around same-net pads, holes
//   3. dark thermal spokes back to same-net pads
//
// Every consumer can render that exactly: the canvas with destination-out,
// Gerber with %LPC*% / %LPD*%, the 3D viewer through a canvas texture. The
// pads and tracks themselves are drawn on top afterwards, as normal.
//
// op = {polarity: "dark"|"clear", shape: "poly", pts}
//    | {polarity, shape: "pad", pad, inflate}           pad as from footprintPads()
//    | {polarity, shape: "segment", x1, y1, x2, y2, w}  round-ended
//    | {polarity, shape: "circle", x, y, d}

import { allPads, trackWidthFor } from "./board.js";
import { rotatePoint, polygonArea, pointInPolygon } from "../core/geom.js";

export function zoneOps(pcb, zone) {
  const ops = [{ polarity: "dark", shape: "poly", pts: zone.pts }];
  const gap = Math.max(zone.clearance ?? 0.3, pcb.rules.clearance);
  const spokes = [];
  for (const pad of allPads(pcb)) {
    if (pad.npth) {
      ops.push({ polarity: "clear", shape: "circle", x: pad.x, y: pad.y, d: pad.drill + gap * 2 });
      continue;
    }
    if (!pad.layers.includes(zone.layer)) continue;
    if (pad.net && pad.net === zone.net) {
      if (zone.thermal === false) continue;
      // Only pads inside the pour get reliefs; elsewhere the dark spokes
      // would paint copper stubs outside the zone.
      if (!pointInPolygon(pad.x, pad.y, zone.pts)) continue;
      ops.push({ polarity: "clear", shape: "pad", pad, inflate: gap });
      const sw = Math.max(0.3, Math.min(pad.w, pad.h) * 0.45, trackWidthFor(pcb.rules, zone.net) * 0.8);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const reach = (dx ? pad.w : pad.h) / 2 + gap + sw;
        const [ex, ey] = rotatePoint(dx * reach, dy * reach, pad.rot || 0);
        spokes.push({ polarity: "dark", shape: "segment", x1: pad.x, y1: pad.y, x2: pad.x + ex, y2: pad.y + ey, w: sw });
      }
    } else {
      ops.push({ polarity: "clear", shape: "pad", pad, inflate: gap });
    }
  }
  for (const t of pcb.tracks) {
    if (t.layer !== zone.layer || (t.net && t.net === zone.net)) continue;
    ops.push({ polarity: "clear", shape: "segment", x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, w: t.w + gap * 2 });
  }
  for (const v of pcb.vias) {
    if (v.net && v.net === zone.net) continue;
    ops.push({ polarity: "clear", shape: "circle", x: v.x, y: v.y, d: v.d + gap * 2 });
  }
  // Higher-priority zones of another net on the same layer win.
  for (const other of pcb.zones) {
    if (other === zone || other.layer !== zone.layer || other.net === zone.net) continue;
    if ((other.priority || 0) > (zone.priority || 0)) ops.push({ polarity: "clear", shape: "poly", pts: other.pts, grow: gap });
  }
  // Spokes are clipped by the zone's own clearance knockouts only where they
  // would hit other copper; a spoke crossing another net is simply dropped.
  for (const s of spokes) {
    const blocked = ops.some((o) => o.polarity === "clear" && o.shape === "segment" && segHits(s, o)) ||
      pcb.vias.some((v) => v.net !== zone.net && Math.hypot(v.x - s.x2, v.y - s.y2) < v.d / 2 + gap);
    if (!blocked) ops.push(s);
  }
  return ops;
}

function segHits(a, b) {
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;
  const dx = b.x2 - b.x1;
  const dy = b.y2 - b.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((a.x2 - b.x1) * dx + (a.y2 - b.y1) * dy) / len2));
  const d = Math.hypot(a.x2 - (b.x1 + t * dx), a.y2 - (b.y1 + t * dy));
  void mx; void my;
  return d < b.w / 2 + a.w / 2;
}

// Inset a simple polygon by `d` (miter join). Used to make a zone that
// covers the board but keeps the edge clearance.
export function insetPolygon(pts, d) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const ccw = polygonArea(pts) > 0; // in y-down coordinates positive area = clockwise on screen
  const s = ccw ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    // inward normal
    const nx = (-(y2 - y1) / len) * s;
    const ny = ((x2 - x1) / len) * s;
    lines.push([x1 + nx * d, y1 + ny * d, x2 + nx * d, y2 + ny * d]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const p = intersectLines(a, b) || [b[0], b[1]];
    out.push([+p[0].toFixed(4), +p[1].toFixed(4)]);
  }
  return out;
}

function intersectLines([x1, y1, x2, y2], [x3, y3, x4, y4]) {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return null;
  const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return [px, py];
}

// Paint a zone into a 2D canvas context already transformed to board mm.
// `color` is the fill style. Uses an offscreen layer so knockouts do not
// erase what is underneath the zone.
export function paintZone(ctx, pcb, zone, color, makeCanvas) {
  const { canvas } = ctx;
  const layer = makeCanvas(canvas.width, canvas.height);
  const lc = layer.getContext("2d");
  lc.setTransform(ctx.getTransform());
  lc.fillStyle = color;
  lc.strokeStyle = color;
  lc.lineCap = "round";
  for (const op of zoneOps(pcb, zone)) {
    lc.globalCompositeOperation = op.polarity === "clear" ? "destination-out" : "source-over";
    lc.fillStyle = color;
    lc.strokeStyle = color;
    drawOp(lc, op);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

export function drawOp(c, op) {
  if (op.shape === "poly") {
    c.beginPath();
    op.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
    if (op.grow) { c.lineWidth = op.grow * 2; c.lineJoin = "round"; c.stroke(); }
  } else if (op.shape === "circle") {
    c.beginPath();
    c.arc(op.x, op.y, op.d / 2, 0, Math.PI * 2);
    c.fill();
  } else if (op.shape === "segment") {
    c.lineWidth = op.w;
    c.beginPath();
    c.moveTo(op.x1, op.y1);
    c.lineTo(op.x2, op.y2);
    c.stroke();
  } else if (op.shape === "pad") {
    drawPadPath(c, op.pad, op.inflate || 0);
    c.fill();
  }
}

// Path of a pad (board mm) — shared by the editor renderer and the zone painter.
export function drawPadPath(c, pad, inflate = 0) {
  const w = pad.w + inflate * 2;
  const h = pad.h + inflate * 2;
  c.save();
  c.translate(pad.x, pad.y);
  // Board rotation is CCW on screen; canvas rotate() is CW for positive angles.
  c.rotate(-((pad.rot || 0) * Math.PI) / 180);
  c.beginPath();
  if (pad.shape === "circle") {
    c.arc(0, 0, Math.max(w, h) / 2, 0, Math.PI * 2);
  } else if (pad.shape === "oval" || pad.shape === "roundrect") {
    const r = pad.shape === "oval" ? Math.min(w, h) / 2 : Math.min(Math.min(w, h) / 2, Math.min(pad.w, pad.h) * 0.25 + inflate);
    roundRectPath(c, -w / 2, -h / 2, w, h, r);
  } else {
    c.rect(-w / 2, -h / 2, w, h);
  }
  c.restore();
}

function roundRectPath(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}
