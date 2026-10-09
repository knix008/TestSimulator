// A small single-stroke (Hershey-like) vector font for ASCII 0x20-0x7E.
//
// Used for silkscreen / copper text in Gerber and SVG output, and reusable by
// the PCB editor and 3D viewer: everything comes out as polylines in board mm
// (y grows down), so any renderer only needs to stroke lines.
//
// Glyph grid: y grows down, cap height runs from y=0 (top) to y=8 (baseline),
// lowercase x-height top is y=3, descenders reach y=11. Glyphs start at x=0;
// the advance is the glyph width plus 2 units unless given explicitly.

import { rotatePoint } from "../core/geom.js";

const CAP = 8; // grid units per "size" (text size = cap height in mm)
const GAP = 2; // inter-character spacing in grid units
const LINE = 14; // line pitch for multi-line text

// Shared bowls so a/b/d/g/p/q stay consistent.
const BOWL_R = "4.5,4.2 3.6,3.3 2.6,3 1.8,3 0.8,3.4 0.2,4.3 0,5.5 0.2,6.7 0.8,7.6 1.8,8 2.6,8 3.6,7.7 4.5,6.8";
const BOWL_L = "0,4.2 0.9,3.3 1.9,3 2.7,3 3.7,3.4 4.3,4.3 4.5,5.5 4.3,6.7 3.7,7.6 2.7,8 1.9,8 0.9,7.7 0,6.8";
const O_CAP = "2.5,0 1.2,0.5 0.4,1.6 0,3 0,5 0.4,6.4 1.2,7.5 2.5,8 3.5,8 4.8,7.5 5.6,6.4 6,5 6,3 5.6,1.6 4.8,0.5 3.5,0 2.5,0";
const C_CAP = "6,1.5 5.3,0.5 4,0 2.5,0 1.2,0.5 0.4,1.6 0,3 0,5 0.4,6.4 1.2,7.5 2.5,8 4,8 5.3,7.5 6,6.5";
const DIGIT = 7; // digits are monospaced so numbers line up

// char -> "x,y x,y;x,y x,y" (strokes separated by ";") or [advance, strokes].
const RAW = {
  " ": [5, ""],
  "!": "0,0 0,5.5;0,7.5 0,8",
  "\"": "0,0 0,2.5;2,0 2,2.5",
  "#": "1.5,0 0.5,8;4.5,0 3.5,8;0,2.5 5,2.5;0,5.5 5,5.5",
  "$": "5,1.5 4,0.5 1,0.5 0,1.5 0,3 1,4 4,4 5,5 5,6.5 4,7.5 1,7.5 0,6.5;2.5,-0.5 2.5,8.5",
  "%": "0,8 6,0;1,0 2,1 1,2 0,1 1,0;5,6 6,7 5,8 4,7 5,6",
  "&": "6,8 1.5,2.5 1.5,1 2.5,0 3.5,0 4.5,1 4.5,2.5 0,5.5 0,7 1,8 3,8 6,4.5",
  "'": "0,0 0,2.5",
  "(": "2,-0.5 0.5,1.5 0,4 0.5,6.5 2,8.5",
  ")": "0,-0.5 1.5,1.5 2,4 1.5,6.5 0,8.5",
  "*": "2,1.5 2,6.5;0,2.75 4,5.25;4,2.75 0,5.25",
  "+": "2.5,1.5 2.5,6.5;0,4 5,4",
  ",": "1,7.5 1,8.2 0,9.5",
  "-": "0,4.5 4,4.5",
  ".": "0,7.5 0,8",
  "/": "0,8.5 4,-0.5",
  "0": [DIGIT, "2,0 1,0.3 0.3,1.5 0,4 0.3,6.5 1,7.7 2,8 3,8 4,7.7 4.7,6.5 5,4 4.7,1.5 4,0.3 3,0 2,0"],
  "1": [DIGIT, "1,1.5 2.5,0 2.5,8"],
  "2": [DIGIT, "0,1.5 1,0.3 2,0 3,0 4,0.3 5,1.5 5,2.8 4.3,4 0,8 5,8"],
  "3": [DIGIT, "0,0 5,0 2.5,3.2 3.5,3.2 4.5,3.7 5,4.5 5,6.5 4,7.7 3,8 1.5,8 0.5,7.6 0,7"],
  "4": [DIGIT, "4,8 4,0 0,5.5 5.5,5.5"],
  "5": [DIGIT, "4.5,0 0.5,0 0,3.6 1.5,3.1 3,3.1 4.3,3.6 5,4.7 5,6.5 4.2,7.6 3,8 1.5,8 0.5,7.6 0,7"],
  "6": [DIGIT, "4.5,0.5 3,0 2,0 0.8,0.6 0.2,2 0,4 0,6 0.5,7.3 1.8,8 3.2,8 4.5,7.3 5,6 5,5.2 4.5,4 3.2,3.3 1.8,3.3 0.5,4 0,5.2"],
  "7": [DIGIT, "0,0 5,0 1.5,8"],
  "8": [DIGIT, "2.5,3.8 1,3.3 0.3,2.5 0.3,1.2 1,0.3 2,0 3,0 4,0.3 4.7,1.2 4.7,2.5 4,3.3 2.5,3.8 1,4.3 0,5.3 0,6.7 0.8,7.7 2,8 3,8 4.2,7.7 5,6.7 5,5.3 4,4.3 2.5,3.8"],
  "9": [DIGIT, "5,2.8 4.5,4 3.2,4.7 1.8,4.7 0.5,4 0,2.8 0,2 0.5,0.7 1.8,0 3.2,0 4.5,0.7 5,2 5,4 4.8,6 4.2,7.4 3,8 2,8 0.5,7.5"],
  ":": "0,3 0,3.5;0,7.5 0,8",
  ";": "1,3 1,3.5;1,7.5 1,8.2 0,9.5",
  "<": "5,1 0,4 5,7",
  "=": "0,2.8 5,2.8;0,5.2 5,5.2",
  ">": "0,1 5,4 0,7",
  "?": "0,1.5 0.7,0.4 2,0 3,0 4.3,0.4 5,1.5 5,2.5 4.3,3.5 2.5,4.5 2.5,5.8;2.5,7.5 2.5,8",
  "@": "4.5,3 3.5,2.5 2.5,2.5 1.7,3.3 1.7,4.7 2.5,5.5 3.5,5.5 4.5,4.8;4.5,2.5 4.5,5 5.2,5.6 6,5.4 6.5,4 6.5,3 6,1.5 4.8,0.4 3.3,0 2,0.3 0.8,1.2 0.1,2.8 0,4.3 0.5,6 1.6,7.4 3,8 4.5,7.9 5.8,7.3",
  "A": "0,8 3,0 6,8;1.1,5.2 4.9,5.2",
  "B": "0,0 0,8 3.8,8 5,7.5 5.5,6.5 5.5,5.5 5,4.5 3.8,4 0,4;3.8,4 4.8,3.5 5.2,2.7 5.2,1.3 4.8,0.5 3.8,0 0,0",
  "C": C_CAP,
  "D": "0,0 0,8 3,8 4.4,7.6 5.4,6.6 6,5 6,3 5.4,1.4 4.4,0.4 3,0 0,0",
  "E": "5,0 0,0 0,8 5,8;0,4 3.5,4",
  "F": "5,0 0,0 0,8;0,4 3.5,4",
  "G": `${C_CAP} 6,4.5 3.8,4.5`,
  "H": "0,0 0,8;6,0 6,8;0,4 6,4",
  "I": "0,0 0,8",
  "J": "4,0 4,6 3.6,7.4 2.6,8 1.4,8 0.4,7.4 0,6.3",
  "K": "0,0 0,8;5.5,0 0,5.3;1.8,3.6 5.8,8",
  "L": "0,0 0,8 5,8",
  "M": "0,8 0,0 3.5,6 7,0 7,8",
  "N": "0,8 0,0 6,8 6,0",
  "O": O_CAP,
  "P": "0,8 0,0 3.8,0 5,0.5 5.5,1.5 5.5,3 5,4 3.8,4.5 0,4.5",
  "Q": `${O_CAP};3.5,6 6,8.5`,
  "R": "0,8 0,0 3.8,0 5,0.5 5.5,1.5 5.5,2.8 5,3.8 3.8,4.3 0,4.3;3,4.3 5.5,8",
  "S": "5.5,1.2 4.5,0.2 3,0 2,0 0.8,0.4 0.2,1.2 0.2,2.4 0.8,3.3 2,3.8 3.6,4.2 4.9,4.8 5.5,5.7 5.5,6.8 4.8,7.6 3.5,8 2.2,8 0.9,7.7 0,6.8",
  "T": "0,0 6,0;3,0 3,8",
  "U": "0,0 0,5.5 0.5,7 1.5,7.8 2.5,8 3.5,8 4.5,7.8 5.5,7 6,5.5 6,0",
  "V": "0,0 3,8 6,0",
  "W": "0,0 2,8 4,1.5 6,8 8,0",
  "X": "0,0 6,8;6,0 0,8",
  "Y": "0,0 3,4 3,8;6,0 3,4",
  "Z": "0,0 6,0 0,8 6,8",
  "[": "2,-0.5 0,-0.5 0,8.5 2,8.5",
  "\\": "0,-0.5 4,8.5",
  "]": "0,-0.5 2,-0.5 2,8.5 0,8.5",
  "^": "0,2.5 2.5,0 5,2.5",
  "_": "0,9.5 6,9.5",
  "`": "0,0 1.2,1.5",
  "a": `4.5,3 4.5,8;${BOWL_R}`,
  "b": `0,0 0,8;${BOWL_L}`,
  "c": "4.5,4 3.7,3.3 2.7,3 1.8,3 0.8,3.4 0.2,4.3 0,5.5 0.2,6.7 0.8,7.6 1.8,8 2.7,8 3.7,7.7 4.5,7",
  "d": `4.5,0 4.5,8;${BOWL_R}`,
  "e": "0,5.5 4.5,5.5 4.4,4.5 3.8,3.5 2.8,3 1.8,3 0.8,3.4 0.2,4.3 0,5.5 0.2,6.7 0.8,7.6 1.8,8 2.8,8 3.8,7.7 4.5,7",
  "f": "3,0 2,0 1.2,0.5 1,1.5 1,8;0,3 2.8,3",
  "g": `4.5,3 4.5,9 4.2,10.3 3.4,11 1.2,11 0.4,10.4;${BOWL_R}`,
  "h": "0,0 0,8;0,4.5 1,3.4 2,3 2.8,3 3.8,3.3 4.4,4.2 4.5,5 4.5,8",
  "i": "0,3 0,8;0,0.5 0,1",
  "j": "1,3 1,9.8 0.6,10.8 0,11;1,0.5 1,1",
  "k": "0,0 0,8;4,3 0,6.2;1.5,5.2 4.3,8",
  "l": "0,0 0,8",
  "m": "0,3 0,8;0,4.4 0.8,3.3 1.6,3 2.4,3 3.2,3.4 3.5,4.5 3.5,8;3.5,4.4 4.3,3.3 5.1,3 5.9,3 6.7,3.4 7,4.5 7,8",
  "n": "0,3 0,8;0,4.5 1,3.4 2,3 2.8,3 3.8,3.3 4.4,4.2 4.5,5 4.5,8",
  "o": "1.8,3 0.8,3.4 0.2,4.3 0,5.5 0.2,6.7 0.8,7.6 1.8,8 2.7,8 3.7,7.6 4.3,6.7 4.5,5.5 4.3,4.3 3.7,3.4 2.7,3 1.8,3",
  "p": `0,3 0,11;${BOWL_L}`,
  "q": `4.5,3 4.5,11;${BOWL_R}`,
  "r": "0,3 0,8;0,5 0.5,3.9 1.4,3.2 2.3,3 3,3",
  "s": "4,3.8 3.2,3.1 2,3 0.9,3.2 0.2,3.9 0.3,4.8 1.2,5.3 2.9,5.7 3.9,6.2 4.2,7 3.6,7.8 2.4,8 1.1,7.9 0,7.2",
  "t": "1,1 1,6.8 1.4,7.7 2.2,8 3,8;0,3 2.8,3",
  "u": "0,3 0,6 0.3,7.2 1,7.8 1.8,8 2.7,8 3.6,7.6 4.5,6.6;4.5,3 4.5,8",
  "v": "0,3 2.25,8 4.5,3",
  "w": "0,3 1.5,8 3,4 4.5,8 6,3",
  "x": "0,3 4.5,8;4.5,3 0,8",
  "y": "0,3 2.25,8;4.5,3 2.25,8 1.4,10 0.7,10.8 0,11",
  "z": "0,3 4.5,3 0,8 4.5,8",
  "{": "2.5,-0.5 1.6,-0.2 1.2,0.6 1.2,3.2 0.8,3.8 0,4 0.8,4.2 1.2,4.8 1.2,7.4 1.6,8.2 2.5,8.5",
  "|": "0,-0.5 0,9.5",
  "}": "0,-0.5 0.9,-0.2 1.3,0.6 1.3,3.2 1.7,3.8 2.5,4 1.7,4.2 1.3,4.8 1.3,7.4 0.9,8.2 0,8.5",
  "~": "0,4.5 0.6,3.7 1.4,3.5 2.2,3.8 2.8,4.2 3.6,4.5 4.4,4.3 5,3.5",
};

// Parsed glyphs: {adv, strokes: [[[x,y],...], ...]}
const GLYPHS = {};
for (const [ch, spec] of Object.entries(RAW)) {
  const [advGiven, src] = Array.isArray(spec) ? spec : [null, spec];
  const strokes = src ? src.split(";").map((s) => s.trim().split(/\s+/).map((p) => p.split(",").map(Number))) : [];
  let maxX = 0;
  for (const s of strokes) for (const [x] of s) maxX = Math.max(maxX, x);
  GLYPHS[ch] = { adv: advGiven ?? maxX + GAP, strokes };
}

function glyph(ch) {
  return GLYPHS[ch] || GLYPHS["?"];
}

// Width of one line of text in mm (without the trailing gap).
export function strokeTextWidth(text, size = 1) {
  const lines = String(text ?? "").split("\n");
  let best = 0;
  for (const line of lines) best = Math.max(best, lineUnits(line));
  return (best * size) / CAP;
}

function lineUnits(line) {
  let w = 0;
  for (const ch of line) w += glyph(ch).adv;
  return Math.max(0, w - (line.length ? GAP : 0));
}

// Suggested stroke width for a text size (KiCad default ratio ~0.15).
export function strokeTextThickness(size = 1) {
  return Math.max(0.1, size * 0.15);
}

// Polylines for `text`, placed at (x, y) in board mm.
//   size   : cap height in mm
//   rot    : degrees, counter-clockwise on screen (same as the rest of the app)
//   mirror : read mirrored (back-side text); mirrors about the anchor
//   anchor : horizontal alignment "start" | "middle" | "end"
//   valign : "middle" (default, centre of the caps) | "baseline" | "top" | "bottom"
// Multi-line text ("\n") stacks downwards from the first line.
export function strokeText(text, x, y, size = 1, opts = {}) {
  const { rot = 0, mirror = false, anchor = "start", valign = "middle" } = opts;
  const s = size / CAP;
  const lines = String(text ?? "").split("\n");
  const totalH = CAP + (lines.length - 1) * LINE;
  let vy = 0; // grid y of the anchor relative to the first line's cap top
  if (valign === "middle") vy = totalH / 2;
  else if (valign === "baseline") vy = CAP;
  else if (valign === "bottom") vy = totalH;
  const out = [];
  lines.forEach((line, li) => {
    const w = lineUnits(line);
    const ax = anchor === "middle" ? w / 2 : anchor === "end" ? w : 0;
    let pen = 0;
    for (const ch of line) {
      const g = glyph(ch);
      for (const stroke of g.strokes) {
        out.push(stroke.map(([gx, gy]) => {
          let lx = (pen + gx - ax) * s;
          const ly = (gy + li * LINE - vy) * s;
          if (mirror) lx = -lx;
          const [rx, ry] = rotatePoint(lx, ly, rot);
          return [x + rx, y + ry];
        }));
      }
      pen += g.adv;
    }
  });
  return out;
}

export const STROKE_FONT_CHARS = Object.keys(GLYPHS).join("");
