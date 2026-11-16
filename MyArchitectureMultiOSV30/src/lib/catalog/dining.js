// Dining: tables, chairs, stools, sideboards, and complete table-and-chair sets.
import { B, C, S, L, E, T, SB, item, variant, table, woodChair, padChair, shellChair, cantilever, barStool, taperLeg, four, cabinet, books, place, smoothProfile, clamp, rng } from "./common.js";

const chairW = 450, chairD = 520, chairH = 880;
// Chairs around a table: n along each long side, and one at each end when ends.
function setParts(w, d, h, tableParts, chairFn, perSide, ends) {
  const out = [...tableParts];
  const tw = w - 2 * (ends ? chairD * 0.55 : 0), td = d - 2 * chairD * 0.7;
  const cw = chairW, cd = chairD;
  for (let i = 0; i < perSide; i++) {
    const x = -tw / 2 + (tw * (i + 0.5)) / perSide;
    out.push(...place(chairFn(cw, cd, chairH), x, -td / 2 - cd * 0.25, 0));
    out.push(...place(chairFn(cw, cd, chairH), x, td / 2 + cd * 0.25, 180));
  }
  if (ends) for (const s of [-1, 1]) out.push(...place(chairFn(cw, cd, chairH), s * (tw / 2 + cd * 0.25), 0, s < 0 ? -90 : 90));
  return out;
}
// The table of a set sits in the middle of the set's box.
const setTable = (w, d, h, ends, o) => table(w - 2 * (ends ? chairD * 0.55 : 0) - 120, d - 2 * chairD * 0.7, 750, o);

const diningTable4 = item("diningTable4", "Dining", "Dining table (4)", 1400, 800, 750, "wood", (w, d, h) => table(w, d, h, { legs: "taper", thick: 32 }));
const chair = item("chair", "Dining", "Chair", 450, 500, 900, "wood", (w, d, h) => woodChair(w, d, h));

export default [
  diningTable4,
  variant(diningTable4, "diningTable6", "Dining table (6)", { w: 1800, d: 900, parts: (w, d, h) => table(w, d, h, { legs: "square", legT: 70, thick: 40, radius: 4 }) }),
  item("diningTable8", "Dining", "Trestle dining table (8)", 2400, 1000, 750, "oak", (w, d, h) => table(w, d, h, { legs: "trestle", thick: 45 })),
  item("diningOval", "Dining", "Oval dining table", 2000, 1050, 750, "walnut", (w, d, h) => table(w, d, h, { top: "oval", legs: "taper", thick: 30 })),
  item("roundTable", "Dining", "Round table", 1000, 1000, 750, "wood", (w, d, h) => table(w, d, h, { top: "round", legs: "pedestal", thick: 30 })),
  item("roundMarble", "Dining", "Round marble table", 1200, 1200, 750, "marble", (w, d, h) => [C(0, 0, h - 25, w / 2, 25, "main", d / 2, { seg: 64 }), L(0, 0, 0, smoothProfile([[w * 0.25, 0], [w * 0.24, 20], [w * 0.1, 160], [w * 0.07, h * 0.6], [w * 0.13, h - 25], [0, h - 25]], 3), "black")]),
  item("glassDining", "Dining", "Glass dining table", 1600, 900, 750, "chrome", (w, d, h) => [B(0, 0, h - 12, w, d, 12, "glass", 12), ...[-1, 1].map((s) => T([[s * (w / 2 - 150), -d / 2 + 80, h - 12], [s * (w / 2 - 150), 0, 30], [s * (w / 2 - 150), d / 2 - 80, h - 12]], 22, "main", { smooth: true })), ...[-1, 1].map((s) => B(s * (w / 2 - 150), 0, 0, 80, d * 0.6, 30, "main", 15))]),
  item("highTable", "Dining", "High table", 1400, 600, 1050, "oak", (w, d, h) => table(w, d, h, { legs: "frame", legC: "black", thick: 40 })),
  chair,
  variant(chair, "chairSlat", "Slat-back chair", { color: "walnut", parts: (w, d, h) => woodChair(w, d, h, { slats: true, padded: true, seatC: "linen" }) }),
  item("chairUpholstered", "Dining", "Upholstered dining chair", 480, 560, 900, "linen", (w, d, h) => padChair(w, d, h)),
  variant(chair, "chairVelvet", "Velvet dining chair", { color: "velvet", w: 500, d: 560, h: 850, parts: (w, d, h) => padChair(w, d, h, { legC: "brass" }) }),
  item("chairShell", "Dining", "Moulded shell chair", 470, 540, 810, "white", (w, d, h) => shellChair(w, d, h)),
  item("chairShellBlack", "Dining", "Shell chair, black", 470, 540, 810, "black", (w, d, h) => shellChair(w, d, h, { legC: "walnut" })),
  item("chairCantilever", "Dining", "Cantilever chair", 470, 580, 830, "leather", (w, d, h) => cantilever(w, d, h)),
  item("diningBench", "Dining", "Dining bench", 1400, 380, 460, "oak", (w, d, h) => table(w, d, h, { legs: "taper", thick: 40 })),
  item("barStool", "Dining", "Bar stool", 400, 400, 750, "metal", (w, d, h) => barStool(w, d, h, { seatC: "leather" })),
  item("counterStool", "Dining", "Wooden counter stool", 420, 420, 650, "oak", (w, d, h) => [C(0, 0, h - 40, w / 2 - 10, 40, "main", d / 2 - 10, { seg: 32 }), ...four(w * 0.62, d * 0.62, (x, y, a, b) => taperLeg(x * 1.15, y * 1.15, 0, 17, h - 40, "main", 0.75, { ty: -a * 6, tx: b * 6 })), ...[-1, 1].map((s) => T([[s * w * 0.36, -d * 0.36, 230], [s * w * 0.36, d * 0.36, 230]], 10, "main", { plan: false }))]),
  item("sideboard", "Dining", "Sideboard", 1800, 450, 800, "wood", (w, d, h) => [...cabinet(w, d, h, { fronts: "dDd", handle: "bar", legs: true, legC: "black" }), L(-w * 0.3, 0, h, smoothProfile([[0, 0], [70, 0], [95, 100], [55, 240], [40, 300], [0, 302]], 3), "terracotta"), L(w * 0.32, 0, h, [[0, 0], [160, 0], [180, 70], [0, 72]], "white")]),
  item("buffet", "Dining", "Buffet cabinet with glass doors", 1200, 450, 1900, "white", (w, d, h) => [...cabinet(w, d, h, { fronts: "gg,dd", handle: "knob", plinth: 80 }), ...books(-w / 2 + 40, w / 2 - 40, 0, h * 0.62, 180, d * 0.6, 40, 0.5)]),
  item("wineRack", "Dining", "Wine rack", 600, 350, 1200, "walnut", (w, d, h) => {
    const out = [B(-w / 2 + 12, 0, 0, 24, d, h, "main"), B(w / 2 - 12, 0, 0, 24, d, h, "main"), B(0, 0, h - 24, w, d, 24, "main")];
    const r = rng(9), cols = 5, rows = Math.floor((h - 60) / 110);
    for (let j = 0; j < rows; j++) {
      out.push(B(0, 0, 30 + j * 110, w - 48, d, 12, "main", 0, { plan: false }));
      for (let i = 0; i < cols; i++) if (r() < 0.8) out.push(C(-w / 2 + 24 + ((w - 48) * (i + 0.5)) / cols, -d / 2 + 20, 30 + j * 110 + 50, 38, d - 40, r() < 0.5 ? "leaf2" : "darkwood", 38, { tx: -90, m: "glass", plan: false }));
    }
    return out;
  }),
  item("diningSet4", "Dining", "Dining set (table + 4 chairs)", 1500, 1800, 900, "oak", (w, d, h) => setParts(w, d, h, setTable(w, d, h, false, { legs: "taper", thick: 32 }), (cw, cd, ch) => woodChair(cw, cd, ch), 2, false), { tags: "table chairs" }),
  item("diningSet6", "Dining", "Dining set (table + 6 chairs)", 2300, 2000, 900, "walnut", (w, d, h) => setParts(w, d, h, setTable(w, d, h, true, { legs: "square", legT: 60, thick: 38 }), (cw, cd, ch) => padChair(cw, cd, ch).map((p) => (p.c === "main" ? { ...p, c: "linen" } : p)), 2, true), { tags: "table chairs" }),
  item("diningSetRound", "Dining", "Round dining set (4 shell chairs)", 1900, 1900, 820, "white", (w, d, h) => [
    ...table(Math.min(w, d) - 2 * chairD * 0.6, Math.min(w, d) - 2 * chairD * 0.6, 740, { top: "round", legs: "pedestal", thick: 25 }),
    ...[0, 90, 180, 270].flatMap((a) => { const r = (Math.min(w, d) - 2 * chairD * 0.6) / 2 + chairD * 0.22; const t = (a * Math.PI) / 180; return place(shellChair(470, 540, 810), -Math.sin(t) * r * -1, -Math.cos(t) * r, a); }),
  ], { tags: "table chairs" }),
  item("breakfastSet", "Dining", "Breakfast set (2 seats)", 1000, 1500, 880, "oak", (w, d, h) => setParts(w, d, h, setTable(w, d, h, false, { top: "round", legs: "pedestal", thick: 25, legC: "black" }), (cw, cd, ch) => woodChair(cw * 0.95, cd * 0.95, ch), 1, false)),
];
