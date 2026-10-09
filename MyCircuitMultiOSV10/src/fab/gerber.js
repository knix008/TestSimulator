// RS-274X (Gerber X2) layer writer.
//
// Coordinate convention: board space is mm with y growing DOWN; Gerber y grows
// UP. Every coordinate is written as (x, -y) — a plain negation about the
// board origin, no offset — so the image looks exactly like the editor view
// and the drill files (excellon.js) use the same convention. Rotations need no
// change: the app's angles are counter-clockwise *as seen on screen*, and
// Gerber's are counter-clockwise in its y-up frame, which is the same visual
// direction.
//
// Format: %FSLAX46Y46*% %MOMM*% — integers in nanometres (6 decimals).

import { rotatePoint } from "../core/geom.js";
import { fabLayers, layerInfo, layerPrimitives, roundRectRadius } from "./layers.js";
import { crc32 } from "./zip.js";

export { fabLayers, layerInfo };

const SCALE = 1e6;

// Coordinate integer for the 4.6 format.
const ci = (v) => {
  const n = Math.round(v * SCALE);
  return Object.is(n, -0) ? "0" : String(n);
};

// Decimal number for aperture/macro parameters.
function num(v) {
  if (Math.abs(v) < 5e-7) return "0";
  return String(+v.toFixed(6));
}

const norm = (a) => ((((a || 0) % 360) + 360) % 360);

// Attribute values may not contain the Gerber delimiters.
const attr = (s) => String(s ?? "").replace(/[%*,\r\n]/g, "_");

export function projectGuid(project) {
  // Deterministic GUID-shaped id from the project title, so re-exports match.
  const t = (project.meta && project.meta.title) || "Untitled";
  const h = [crc32(t), crc32(`${t}#1`), crc32(`${t}#2`), crc32(`${t}#3`)].map((n) => n.toString(16).padStart(8, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function baseName(project) {
  const t = (project.meta && project.meta.title) || "board";
  return t.trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "board";
}

// KiCad "Protel" file extensions.
export function gerberExtension(layerName) {
  const fixed = { "F.Cu": "gtl", "B.Cu": "gbl", "F.SilkS": "gto", "B.SilkS": "gbo", "F.Mask": "gts", "B.Mask": "gbs", "F.Paste": "gtp", "B.Paste": "gbp", "Edge.Cuts": "gm1" };
  if (fixed[layerName]) return fixed[layerName];
  const m = /^In(\d+)\.Cu$/.exec(layerName);
  if (m) return `g${+m[1] + 1}`;
  return "gbr";
}

export function gerberFileName(project, layerName) {
  return `${baseName(project)}-${layerName.replace(/\./g, "_")}.${gerberExtension(layerName)}`;
}

function isoDate(d) {
  const date = d ? new Date(d) : new Date();
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------- apertures
class Apertures {
  constructor() {
    this.list = []; // {code, def, func}
    this.byKey = new Map();
    this.macros = []; // {name, body}
    this.macroByBody = new Map();
    this.next = 10;
  }
  get(def, func = "") {
    const key = `${func}|${def}`;
    let a = this.byKey.get(key);
    if (!a) {
      a = { code: this.next++, def, func };
      this.byKey.set(key, a);
      this.list.push(a);
    }
    return a.code;
  }
  macro(lines) {
    const body = lines.join("*\n");
    let name = this.macroByBody.get(body);
    if (!name) {
      name = `MCPAD${this.macros.length + 1}`;
      this.macroByBody.set(body, name);
      this.macros.push({ name, body });
    }
    return name;
  }
  circle(d, func) {
    return this.get(`C,${num(Math.max(d, 0.001))}`, func);
  }
  // Aperture for a pad, grown by `inflate` (negative shrinks).
  pad(pad, inflate = 0, func = "") {
    const w = Math.max(0.001, pad.w + inflate * 2);
    const h = Math.max(0.001, pad.h + inflate * 2);
    const rot = norm(pad.rot);
    const quarter = Math.abs(rot / 90 - Math.round(rot / 90)) < 1e-9;
    const swap = quarter && Math.round(rot / 90) % 2 === 1;
    const [W, H] = swap ? [h, w] : [w, h];
    let shape = pad.shape;
    let r = 0;
    if (shape === "roundrect") {
      r = roundRectRadius(pad, inflate);
      if (r < 1e-6) shape = "rect";
      else if (r >= Math.min(w, h) / 2 - 1e-9) shape = "oval";
    }
    if (shape === "oval" && Math.abs(w - h) < 1e-9) shape = "circle";
    if (shape === "circle") return this.circle(Math.max(w, h), func);
    if (shape === "rect" && quarter) return this.get(`R,${num(W)}X${num(H)}`, func);
    if (shape === "oval" && quarter) return this.get(`O,${num(W)}X${num(H)}`, func);
    // Rotated / rounded shapes: a macro with literal values. Offsets are
    // rotated here and flipped into Gerber's y-up frame; primitive 21 takes the
    // rotation itself (about the macro origin, which is its centre).
    const at = (lx, ly) => {
      const [x, y] = rotatePoint(lx, ly, rot);
      return `${num(x)},${num(-y)}`;
    };
    const lines = [];
    if (shape === "rect") {
      lines.push(`21,1,${num(w)},${num(h)},0,0,${num(rot)}`);
    } else if (shape === "oval") {
      const d = Math.min(w, h);
      const half = (Math.max(w, h) - d) / 2;
      const along = w >= h ? [half, 0] : [0, half];
      lines.push(`21,1,${num(w >= h ? w - d : w)},${num(w >= h ? h : h - d)},0,0,${num(rot)}`);
      lines.push(`1,1,${num(d)},${at(along[0], along[1])}`);
      lines.push(`1,1,${num(d)},${at(-along[0], -along[1])}`);
    } else {
      // roundrect: two crossing rectangles plus four corner discs
      lines.push(`21,1,${num(w)},${num(h - 2 * r)},0,0,${num(rot)}`);
      lines.push(`21,1,${num(w - 2 * r)},${num(h)},0,0,${num(rot)}`);
      const cx = w / 2 - r;
      const cy = h / 2 - r;
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) lines.push(`1,1,${num(2 * r)},${at(sx * cx, sy * cy)}`);
    }
    return this.get(this.macro(lines), func);
  }
}

// ---------------------------------------------------------------- writer
class Body {
  constructor() {
    this.lines = [];
    this.ap = null;
    this.pol = "dark";
    this.x = null;
    this.y = null;
    this.obj = "";
  }
  push(s) { this.lines.push(s); }
  polarity(p) {
    if (p !== this.pol) { this.push(p === "clear" ? "%LPC*%" : "%LPD*%"); this.pol = p; }
  }
  select(code) {
    if (code !== this.ap) { this.push(`D${code}*`); this.ap = code; }
  }
  object(o) {
    let s = "";
    if (o) {
      if (o.ref && o.pin != null && o.pin !== "") s += `%TO.P,${attr(o.ref)},${attr(o.pin)}*%\n`;
      else if (o.ref) s += `%TO.C,${attr(o.ref)}*%\n`;
      if (o.net != null) s += `%TO.N,${attr(o.net)}*%\n`;
    }
    if (s === this.obj) return;
    if (this.obj) this.push("%TD*%");
    if (s) this.push(s.trimEnd());
    this.obj = s;
  }
  // Board coordinates in, Gerber coordinates out (y negated).
  xy(x, y) { return `X${ci(x)}Y${ci(-y)}`; }
  move(x, y) {
    if (this.x === x && this.y === y) return;
    this.push(`${this.xy(x, y)}D02*`);
    this.x = x; this.y = y;
  }
  line(x, y) {
    this.push(`${this.xy(x, y)}D01*`);
    this.x = x; this.y = y;
  }
  flash(x, y) {
    this.push(`${this.xy(x, y)}D03*`);
    this.x = x; this.y = y;
  }
  // Full circle through (cx + r, cy), counter-clockwise (G75 multi quadrant).
  circle(cx, cy, r) {
    this.move(cx + r, cy);
    this.push(`G03${this.xy(cx + r, cy)}I${ci(-r)}J0D01*`);
    this.push("G01*");
  }
}

// Render one layer as RS-274X text.
// opts: maskExpansion, tentVias, pasteShrink, edgeWidth, refText (see layers.js),
//       date (Date|string, for reproducible output).
export function gerberLayer(project, layerName, opts = {}) {
  const pcb = project.pcb;
  const info = layerInfo(pcb, layerName);
  const prims = layerPrimitives(project, layerName, opts);
  const aps = new Apertures();
  const b = new Body();
  const copper = info.kind === "copper";

  for (const p of prims) {
    b.polarity(p.pol || "dark");
    b.object(copper ? p.obj : null);
    const func = copper || info.kind === "mask" || info.kind === "paste" || info.kind === "edge" ? p.func || "" : "";
    if (p.t === "pad") {
      b.select(aps.pad(p.pad, p.inflate || 0, func));
      b.flash(p.pad.x, p.pad.y);
    } else if (p.t === "circle") {
      b.select(aps.circle(p.d, func));
      b.flash(p.x, p.y);
    } else if (p.t === "seg") {
      b.select(aps.circle(p.w, func));
      b.move(p.x1, p.y1);
      b.line(p.x2, p.y2);
    } else if (p.t === "ring") {
      b.select(aps.circle(p.w, func));
      b.circle(p.cx, p.cy, p.r);
    } else if (p.t === "polyline") {
      if (!p.pts.length) continue;
      b.select(aps.circle(p.w, func));
      b.move(p.pts[0][0], p.pts[0][1]);
      if (p.pts.length === 1) { b.line(p.pts[0][0], p.pts[0][1]); continue; }
      for (let i = 1; i < p.pts.length; i++) b.line(p.pts[i][0], p.pts[i][1]);
      if (p.closed) b.line(p.pts[0][0], p.pts[0][1]);
    } else if (p.t === "poly") {
      if (p.pts.length < 3) continue;
      b.push("G36*");
      b.x = null; // a region always starts with an explicit D02
      b.move(p.pts[0][0], p.pts[0][1]);
      for (let i = 1; i < p.pts.length; i++) b.line(p.pts[i][0], p.pts[i][1]);
      const [fx, fy] = p.pts[0];
      const [lx, ly] = p.pts[p.pts.length - 1];
      if (fx !== lx || fy !== ly) b.line(fx, fy);
      b.push("G37*");
      if (p.grow > 0) {
        // Grown outline (higher-priority zone knockouts): stroke the edge.
        b.select(aps.circle(p.grow * 2, ""));
        b.move(fx, fy);
        for (let i = 1; i < p.pts.length; i++) b.line(p.pts[i][0], p.pts[i][1]);
        b.line(fx, fy);
      }
    }
  }
  b.object(null);

  const meta = project.meta || {};
  const head = [
    `G04 MyCircuit 10.0 - ${attr(meta.title || "Untitled")} - layer ${layerName}*`,
    "G04 Coordinates: mm, Y = -Y(board) (board y grows down, Gerber y grows up)*",
    "%TF.GenerationSoftware,MyCircuit,10.0*%",
    `%TF.CreationDate,${isoDate(opts.date)}*%`,
    `%TF.ProjectId,${attr(meta.title || "Untitled")},${projectGuid(project)},${attr(meta.rev || "1.0")}*%`,
    "%TF.SameCoordinates,Original*%",
    `%TF.FileFunction,${info.fileFunction}*%`,
    `%TF.FilePolarity,${info.polarity}*%`,
    "%FSLAX46Y46*%",
    "%MOMM*%",
    "%LPD*%",
    "G01*",
    "G75*",
  ];
  for (const m of aps.macros) head.push(`%AM${m.name}*\n${m.body}*%`);
  let curFunc = "";
  for (const a of aps.list) {
    if (a.func !== curFunc) {
      head.push(a.func ? `%TA.AperFunction,${a.func}*%` : "%TD.AperFunction*%");
      curFunc = a.func;
    }
    head.push(`%ADD${a.code}${a.def}*%`);
  }
  if (curFunc) head.push("%TD*%");
  return [...head, ...b.lines, "M02*", ""].join("\n");
}
