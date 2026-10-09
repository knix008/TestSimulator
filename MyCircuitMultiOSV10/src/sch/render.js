// Draws a schematic into any canvas-like context set to world (mil) space.
// Used by the editor on screen, by printing and by SVG export.

import { getSymbol, symbolBounds, partSymbol, unitCount, unitLetter } from "../lib/symbols.js";
import { xform, DEG } from "../core/geom.js";
import { partPins, pageView, pageOf } from "../core/netlist.js";

export const SCH_THEMES = {
  dark: {
    bg: "#1d2027", grid: "#3a404c", gridMajor: "#4d5463", sheet: "#7b4a4a", sheetText: "#b98a8a",
    wire: "#4cc674", bus: "#4a8bdc", junction: "#4cc674", body: "#e0716b", bodyFill: "#3b302d", pin: "#e0716b",
    pinName: "#d9c8a8", pinNum: "#c07a7a", ref: "#45c8c8", value: "#45c8c8", label: "#ececec", global: "#e7a54a",
    power: "#e0716b", nc: "#4a8bdc", text: "#c8ccd4", select: "#ffd84a", hover: "#ffffff", highlight: "#ffffff",
    erc: "#ff4d4d", ercWarn: "#ffb020", probe: "#ffcc33", ghost: "rgba(255,216,74,0.65)",
  },
  light: {
    bg: "#f6f5f0", grid: "#c9c6bb", gridMajor: "#a9a596", sheet: "#8a2b2b", sheetText: "#8a2b2b",
    wire: "#008a2e", bus: "#1f4fbf", junction: "#008a2e", body: "#8a1f1f", bodyFill: "#fffbd0", pin: "#8a1f1f",
    pinName: "#215c5c", pinNum: "#8a1f1f", ref: "#00696b", value: "#00696b", label: "#111111", global: "#9a4d00",
    power: "#8a1f1f", nc: "#1f4fbf", text: "#222222", select: "#e08a00", hover: "#000000", highlight: "#ff00aa",
    erc: "#e00000", ercWarn: "#e08a00", probe: "#c06000", ghost: "rgba(224,138,0,0.55)",
  },
  print: {
    bg: "#ffffff", grid: "#dddddd", gridMajor: "#bbbbbb", sheet: "#7a1c1c", sheetText: "#7a1c1c",
    wire: "#006b22", bus: "#16409a", junction: "#006b22", body: "#7a1c1c", bodyFill: "#fffbd8", pin: "#7a1c1c",
    pinName: "#1d5555", pinNum: "#7a1c1c", ref: "#005c5e", value: "#005c5e", label: "#000000", global: "#874400",
    power: "#7a1c1c", nc: "#16409a", text: "#000000", select: "#e08a00", hover: "#000", highlight: "#000",
    erc: "#d00000", ercWarn: "#d08000", probe: "#c06000", ghost: "#999",
  },
  mono: {
    bg: "#ffffff", grid: "#dddddd", gridMajor: "#bbbbbb", sheet: "#000", sheetText: "#000",
    wire: "#000", bus: "#000", junction: "#000", body: "#000", bodyFill: "#ffffff", pin: "#000",
    pinName: "#000", pinNum: "#000", ref: "#000", value: "#000", label: "#000", global: "#000",
    power: "#000", nc: "#000", text: "#000", select: "#000", hover: "#000", highlight: "#000",
    erc: "#000", ercWarn: "#000", probe: "#000", ghost: "#999",
  },
};

export const SHEETS = {
  A4: { w: 11693, h: 8268 },
  A3: { w: 16535, h: 11693 },
  A2: { w: 23386, h: 16535 },
  Letter: { w: 11000, h: 8500 },
  Tabloid: { w: 17000, h: 11000 },
};

export const FONT = "Inter, 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";

function text(ctx, str, x, y, size, color, { align = "left", baseline = "alphabetic", rot = 0, bold = false, font = FONT } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(-rot * DEG);
  ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  // Overbar notation like KiCad: text between a pair of ~ is drawn with a bar
  // over it, anywhere in the name ("PB5/~RESET~", "~CS~/SS").
  if (String(str).includes("~") && String(str).split("~").length > 2) {
    const parts = String(str).split("~");
    const plain = parts.join("");
    ctx.fillText(plain, 0, 0);
    const total = ctx.measureText(plain).width;
    let x = align === "center" ? -total / 2 : align === "right" ? -total : 0;
    const yb = baseline === "middle" ? -size * 0.62 : -size * 1.0;
    parts.forEach((p, i) => {
      const w = ctx.measureText(p).width;
      if (i % 2 === 1 && p) ctx.fillRect(x, yb, w, size * 0.07);
      x += w;
    });
  } else ctx.fillText(str, 0, 0);
  ctx.restore();
}

export function lineWidthFor(scale, mils, minPx = 1) {
  return Math.max(mils, minPx / scale);
}

// Default field (reference/value) positions in world space.
export function fieldPositions(part, sym) {
  const b = symbolBounds({ ...sym, pins: [] });
  const corners = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map(([x, y]) => xform(x, y, part));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
  const tall = y2 - y1 > (x2 - x1) * 1.2 && sym.pins.length <= 3;
  let ref, value;
  if (tall) {
    ref = { x: x2 + 30, y: (y1 + y2) / 2 - 10, align: "left" };
    value = { x: x2 + 30, y: (y1 + y2) / 2 + 55, align: "left" };
  } else {
    ref = { x: (x1 + x2) / 2, y: y1 - 40, align: "center" };
    value = { x: (x1 + x2) / 2, y: y2 + 80, align: "center" };
  }
  if (part.refOffset) ref = { x: part.x + part.refOffset.x, y: part.y + part.refOffset.y, align: "left" };
  if (part.valueOffset) value = { x: part.x + part.valueOffset.x, y: part.y + part.valueOffset.y, align: "left" };
  return { ref, value, box: { x1, y1, x2, y2 } };
}

export function drawPart(ctx, part, theme, scale, { selected = false, hover = false, ghost = false, highlightPins = null } = {}) {
  const sym = partSymbol(part);
  if (!sym) {
    text(ctx, `?${part.lib}`, part.x, part.y, 50, theme.erc, { align: "center" });
    return;
  }
  const stroke = ghost ? theme.ghost : selected ? theme.select : hover ? theme.hover : sym.power || sym.flag ? theme.power : theme.body;
  const lw = lineWidthFor(scale, 8, 1.2);
  ctx.save();
  ctx.translate(part.x, part.y);
  ctx.rotate(-(part.rot || 0) * DEG);
  if (part.mirror) ctx.scale(-1, 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const b of sym.body) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw * (b.w || 1);
    if (b.t === "line") {
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    } else if (b.t === "rect") {
      if (b.fill === "body" && !ghost) { ctx.fillStyle = theme.bodyFill; ctx.fillRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1); }
      ctx.beginPath();
      ctx.rect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      ctx.stroke();
    } else if (b.t === "circle") {
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
      if (b.fill === "fg") { ctx.fillStyle = stroke; ctx.fill(); } else if (b.fill === "body" && !ghost) { ctx.fillStyle = theme.bodyFill; ctx.fill(); }
      ctx.stroke();
    } else if (b.t === "arc") {
      ctx.beginPath();
      // Library arcs are CCW on screen from a1 to a2 → canvas angles are negated.
      ctx.arc(b.cx, b.cy, b.r, -b.a2 * DEG, -b.a1 * DEG);
      ctx.stroke();
    } else if (b.t === "poly") {
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (b.fill === "fg") { ctx.fillStyle = stroke; ctx.fill(); } else if (b.fill === "body" && !ghost) { ctx.fillStyle = theme.bodyFill; ctx.fill(); }
      ctx.stroke();
    }
  }
  ctx.restore();

  // Text primitives stay upright.
  for (const b of sym.body) {
    if (b.t !== "text") continue;
    const [x, y] = xform(b.x, b.y, part);
    const str = b.valueText ? part.value || b.text : b.text;
    text(ctx, str, x, y, b.size || 50, b.valueText ? stroke : stroke, { align: b.anchor === "middle" ? "center" : b.anchor === "end" ? "right" : "left", baseline: "middle", bold: !!b.valueText });
  }

  // Pins.
  const pins = partPins(part);
  const boxed = sym.body.some((b) => b.t === "rect" && b.fill === "body") || sym.name === "OPAMP";
  for (const pin of pins) {
    if (!pin.len) continue;
    const dx = pin.dir === "L" ? -1 : pin.dir === "R" ? 1 : 0;
    const dy = pin.dir === "U" ? -1 : pin.dir === "D" ? 1 : 0;
    const ex = pin.x + dx * pin.len;
    const ey = pin.y + dy * pin.len;
    const hl = highlightPins && highlightPins.has(pin.num);
    ctx.strokeStyle = ghost ? theme.ghost : hl ? theme.highlight : selected ? theme.select : theme.pin;
    ctx.lineWidth = lw * (hl ? 2 : 1);
    ctx.beginPath();
    ctx.moveTo(pin.x, pin.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (ghost) continue;
    const vertical = dx === 0;
    if (!pin.hideName && pin.name && pin.name !== "~" && boxed) {
      const off = 40;
      const nx = ex + dx * off;
      const ny = ey + dy * off;
      const align = vertical ? (dy > 0 ? "left" : "right") : dx > 0 ? "left" : "right";
      text(ctx, pin.name, nx, ny, 45, theme.pinName, { align, baseline: "middle", rot: vertical ? 90 : 0 });
    }
    if (!pin.hideNum) {
      const mx = (pin.x + ex) / 2;
      const my = (pin.y + ey) / 2;
      if (vertical) text(ctx, pin.num, mx - 12, my, 38, theme.pinNum, { align: "center", baseline: "bottom", rot: 90 });
      else text(ctx, pin.num, mx, my - 10, 38, theme.pinNum, { align: "center", baseline: "bottom" });
    }
  }

  if (ghost || sym.power || sym.flag) return;
  const pos = fieldPositions(part, sym);
  // Multi-unit parts show their unit letter: U1A, U1B …
  const refText = (part.ref || "?") + (unitCount(getSymbol(part.lib)) > 1 ? unitLetter(part.unit || 1) : "");
  if (!part.hideRef) text(ctx, refText, pos.ref.x, pos.ref.y, 50, part.dnp ? theme.ercWarn : theme.ref, { align: pos.ref.align, baseline: "middle", bold: true });
  if (!part.hideValue) text(ctx, part.value || "", pos.value.x, pos.value.y, 48, theme.value, { align: pos.value.align, baseline: "middle" });
  if (part.dnp) {
    ctx.strokeStyle = theme.ercWarn;
    ctx.lineWidth = lw;
    const { box } = pos;
    ctx.beginPath();
    ctx.moveTo(box.x1, box.y1); ctx.lineTo(box.x2, box.y2);
    ctx.moveTo(box.x2, box.y1); ctx.lineTo(box.x1, box.y2);
    ctx.stroke();
  }
}

export function drawWire(ctx, w, color, scale, width = 6) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidthFor(scale, width, 1.4);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();
}

export function drawJunction(ctx, j, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(j.x, j.y, 20, 0, Math.PI * 2);
  ctx.fill();
}

export function drawNoConnect(ctx, n, color, scale) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidthFor(scale, 6, 1.2);
  ctx.beginPath();
  ctx.moveTo(n.x - 25, n.y - 25); ctx.lineTo(n.x + 25, n.y + 25);
  ctx.moveTo(n.x + 25, n.y - 25); ctx.lineTo(n.x - 25, n.y + 25);
  ctx.stroke();
}

// Label geometry: rot 0 = text to the right of the anchor, 90 up, 180 left, 270 down.
export function labelBox(ctx, l) {
  const size = 50;
  ctx.font = `${size}px ${FONT}`;
  const w = ctx.measureText(l.text).width + (l.kind === "global" ? 70 : 10);
  return { w, h: size * 1.3 };
}

export function drawLabel(ctx, l, theme, scale, { selected = false } = {}) {
  const color = selected ? theme.select : l.kind === "global" ? theme.global : l.kind === "hier" ? (theme.hier || "#c97be8") : theme.label;
  const rot = l.rot || 0;
  const { w, h } = labelBox(ctx, l);
  ctx.save();
  ctx.translate(l.x, l.y);
  const flip = rot === 180 || rot === 90;
  ctx.rotate(-(rot % 180) * DEG);
  const dir = flip ? -1 : 1;
  ctx.lineWidth = lineWidthFor(scale, 5, 1);
  ctx.strokeStyle = color;
  if (l.kind === "global" || l.kind === "hier") {
    // Pentagon flag pointing back at the wire.
    const hh = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dir * hh, -hh);
    ctx.lineTo(dir * w, -hh);
    ctx.lineTo(dir * w, hh);
    ctx.lineTo(dir * hh, hh);
    ctx.closePath();
    ctx.stroke();
    text(ctx, l.text, dir * (hh + 12), 2, 50, color, { align: flip ? "right" : "left", baseline: "middle" });
  } else {
    text(ctx, l.text, dir * 10, -15, 50, color, { align: flip ? "right" : "left", baseline: "alphabetic" });
    ctx.fillStyle = color;
    ctx.fillRect(-6, -6, 12, 12);
  }
  ctx.restore();
}

// Length in mils as "12.70 mm (500 mil)" (or mil first when units = mil).
export function formatSchLength(mils, units = "mm") {
  const mm = (mils * 0.0254).toFixed(2);
  const mil = Math.round(mils);
  return units === "mil" ? `${mil} mil (${mm} mm)` : `${mm} mm (${mil} mil)`;
}

// Drawing dimension: extension lines, arrowed dimension line, length text.
export function drawSchDimension(ctx, d, theme, scale, { selected = false, units = "mm" } = {}) {
  const color = selected ? theme.select : theme.dimension || theme.text || theme.label;
  const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
  const len = Math.hypot(dx, dy) || 1;
  const off = d.offset ?? 100;
  const nx = -dy / len, ny = dx / len, ux = dx / len, uy = dy / len;
  const ax = d.x1 + nx * off, ay = d.y1 + ny * off, bx = d.x2 + nx * off, by = d.y2 + ny * off;
  const ext = Math.sign(off || 1) * 25;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidthFor(scale, 4, 1);
  ctx.beginPath();
  ctx.moveTo(d.x1 + nx * Math.sign(off || 1) * 15, d.y1 + ny * Math.sign(off || 1) * 15); ctx.lineTo(ax + nx * ext, ay + ny * ext);
  ctx.moveTo(d.x2 + nx * Math.sign(off || 1) * 15, d.y2 + ny * Math.sign(off || 1) * 15); ctx.lineTo(bx + nx * ext, by + ny * ext);
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.stroke();
  const ah = Math.min(40, len / 4);
  for (const [px, py, s] of [[ax, ay, 1], [bx, by, -1]]) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + s * ux * ah + nx * ah * 0.35, py + s * uy * ah + ny * ah * 0.35);
    ctx.lineTo(px + s * ux * ah - nx * ah * 0.35, py + s * uy * ah - ny * ah * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  let ang = Math.atan2(dy, dx);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  ctx.save();
  ctx.translate((ax + bx) / 2 + nx * Math.sign(off || 1) * 30, (ay + by) / 2 + ny * Math.sign(off || 1) * 30);
  ctx.rotate(ang);
  text(ctx, formatSchLength(len, units), 0, 0, 45, color, { align: "center", baseline: "bottom" });
  ctx.restore();
}

// Hierarchical sheet block: frame, name above, target page below, pins on the edges.
export function drawSheetBlock(ctx, sh, theme, scale, { selected = false, pageName = "" } = {}) {
  const color = selected ? theme.select : theme.sheetBlock || theme.global;
  ctx.fillStyle = theme.sheetFill || "rgba(231,165,74,0.07)";
  ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidthFor(scale, 8, 1.4);
  ctx.strokeRect(sh.x, sh.y, sh.w, sh.h);
  text(ctx, sh.name || "Sheet", sh.x, sh.y - 30, 55, color, { bold: true });
  text(ctx, `→ ${pageName}`, sh.x, sh.y + sh.h + 70, 42, theme.sheetText || color);
  for (const sp of sh.pins || []) {
    const right = sp.side === "R";
    const x = right ? sh.x + sh.w : sh.x;
    const y = sh.y + sp.offset;
    const d = right ? -1 : 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 25); ctx.lineTo(x + d * 30, y - 25); ctx.lineTo(x + d * 55, y); ctx.lineTo(x + d * 30, y + 25); ctx.lineTo(x, y + 25);
    ctx.closePath();
    ctx.fill();
    text(ctx, sp.name, x + d * 75, y, 42, theme.label, { align: right ? "right" : "left", baseline: "middle" });
  }
}

export function drawText(ctx, t, theme, { selected = false } = {}) {
  const lines = String(t.text || "").split("\n");
  lines.forEach((line, i) => text(ctx, line, t.x, t.y + i * (t.size || 50) * 1.3, t.size || 50, selected ? theme.select : theme.text, { rot: t.rot || 0 }));
}

// Sheet border with zone references and the title block.
// Page number and name for the title block of the page `sch` shows.
export function pageInfo(fullSch, pageId) {
  const pages = fullSch.pages || [{ id: "", name: "" }];
  const i = Math.max(0, pages.findIndex((p) => p.id === pageId));
  return { index: i + 1, count: pages.length, name: pages[i] ? pages[i].name : "" };
}

export function drawSheet(ctx, sch, meta, theme, scale, info = { index: 1, count: 1, name: "" }) {
  const s = SHEETS[sch.sheet] || SHEETS.A4;
  const m = 400;
  ctx.strokeStyle = theme.sheet;
  ctx.lineWidth = lineWidthFor(scale, 6, 1);
  ctx.strokeRect(0, 0, s.w, s.h);
  ctx.strokeRect(m / 2, m / 2, s.w - m, s.h - m);
  const cols = Math.round(s.w / 2000);
  const rows = Math.round(s.h / 2000);
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    const x = (s.w / cols) * i;
    ctx.moveTo(x, 0); ctx.lineTo(x, m / 2);
    ctx.moveTo(x, s.h); ctx.lineTo(x, s.h - m / 2);
  }
  for (let i = 1; i < rows; i++) {
    const y = (s.h / rows) * i;
    ctx.moveTo(0, y); ctx.lineTo(m / 2, y);
    ctx.moveTo(s.w, y); ctx.lineTo(s.w - m / 2, y);
  }
  ctx.stroke();
  for (let i = 0; i < cols; i++) {
    const x = (s.w / cols) * (i + 0.5);
    text(ctx, String(i + 1), x, m / 4, 60, theme.sheetText, { align: "center", baseline: "middle" });
    text(ctx, String(i + 1), x, s.h - m / 4, 60, theme.sheetText, { align: "center", baseline: "middle" });
  }
  for (let i = 0; i < rows; i++) {
    const y = (s.h / rows) * (i + 0.5);
    const ch = String.fromCharCode(65 + i);
    text(ctx, ch, m / 4, y, 60, theme.sheetText, { align: "center", baseline: "middle" });
    text(ctx, ch, s.w - m / 4, y, 60, theme.sheetText, { align: "center", baseline: "middle" });
  }
  // Title block.
  const bw = 4400;
  const bh = 1000;
  const x0 = s.w - m / 2 - bw;
  const y0 = s.h - m / 2 - bh;
  ctx.strokeRect(x0, y0, bw, bh);
  ctx.beginPath();
  ctx.moveTo(x0, y0 + 250); ctx.lineTo(x0 + bw, y0 + 250);
  ctx.moveTo(x0, y0 + 550); ctx.lineTo(x0 + bw, y0 + 550);
  ctx.moveTo(x0, y0 + 800); ctx.lineTo(x0 + bw, y0 + 800);
  ctx.moveTo(x0 + 2600, y0 + 800); ctx.lineTo(x0 + 2600, y0 + bh);
  ctx.moveTo(x0 + 2600, y0); ctx.lineTo(x0 + 2600, y0 + 250);
  ctx.stroke();
  const c = theme.sheetText;
  text(ctx, meta.company || "", x0 + 60, y0 + 160, 70, c);
  text(ctx, "MyCircuit 10.0", x0 + 2660, y0 + 160, 60, c);
  text(ctx, "Title:", x0 + 60, y0 + 330, 45, c);
  text(ctx, meta.title || "", x0 + 60, y0 + 480, 110, theme.text, { bold: true });
  text(ctx, `Date: ${meta.date || ""}`, x0 + 60, y0 + 700, 55, c);
  text(ctx, `Rev: ${meta.rev || ""}`, x0 + 2660, y0 + 700, 55, c);
  text(ctx, `Size: ${sch.sheet || "A4"}`, x0 + 60, y0 + 930, 50, c);
  text(ctx, `${meta.author ? "Author: " + meta.author : ""}`, x0 + 1300, y0 + 930, 50, c);
  text(ctx, `Sheet: ${info.index}/${info.count}${info.name ? "  " + info.name : ""}`, x0 + 2660, y0 + 930, 50, c);
  if (meta.comment) text(ctx, meta.comment, x0 + 1300, y0 + 700, 45, c);
}

// Everything in one call — used by print / SVG export and the minimap.
// opts.page: page id to draw (default: the first page).
export function drawSchematic(ctx, project, theme, scale, opts = {}) {
  const page = opts.page || pageOf(project.schematic, null);
  const sch = pageView(project.schematic, page);
  if (opts.sheet !== false) drawSheet(ctx, sch, project.meta, theme, scale, pageInfo(project.schematic, page));
  for (const b of sch.buses || []) drawWire(ctx, b, theme.bus, scale, 14);
  for (const w of sch.wires) drawWire(ctx, w, theme.wire, scale);
  for (const j of sch.junctions) drawJunction(ctx, j, theme.junction);
  for (const n of sch.noconnects) drawNoConnect(ctx, n, theme.nc, scale);
  for (const p of sch.parts) drawPart(ctx, p, theme, scale);
  for (const l of sch.labels) drawLabel(ctx, l, theme, scale);
  for (const t of sch.texts) drawText(ctx, t, theme);
  for (const sh of sch.sheets || []) {
    const pg = (project.schematic.pages || []).find((p) => p.id === sh.target);
    drawSheetBlock(ctx, sh, theme, scale, { pageName: pg ? pg.name : "?" });
  }
  for (const d of sch.dimensions || []) drawSchDimension(ctx, d, theme, scale, { units: opts.units });
}

export { text as drawTextRaw, MONO };
