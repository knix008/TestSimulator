// Living room: sofas, armchairs, coffee and side tables, media, shelves, rugs, fireplaces.
import { B, C, S, L, E, T, R, G, SB, item, variant, sofa, table, taperLeg, four, books, shade, leaves, pot, move, smoothProfile, ellipsePts, clamp, rng, cabinet } from "./common.js";

const sofa3 = item("sofa3", "Living", "Sofa (3 seats)", 2100, 900, 800, "fabric", (w, d, h) => sofa(w, d, h, { seats: 3, pillows: ["mustard", "cream"] }), { tags: "couch settee" });
const chesterfield = item("chesterfield", "Living", "Chesterfield sofa", 2200, 950, 760, "cognac", (w, d, h) => sofa(w, d, h, { seats: 3, arms: "round", tufted: true, legs: "block", legC: "darkwood", backCushions: false }), { tags: "leather couch" });

// Corner sofa: a seat run along the back and a chaise on the right.
function sectional(w, d, h) {
  const run = Math.min(d, Math.max(800, 0.5 * d));
  const chaise = clamp(0.36 * w, 800, 1000);
  const main = move(sofa(w - chaise + 120, run, h, { seats: Math.max(2, Math.round((w - chaise) / 700)), arms: "track", pillows: ["terracotta", "cream"] }).filter((p) => !(p.x > (w - chaise) / 2 - 200 && p.w && p.w < 260 && p.h > 300)), -chaise / 2 + 60, -d / 2 + run / 2);
  const legH = clamp(0.12 * h, 60, 160), seatZ = legH + clamp(0.3 * h - legH * 0.6, 150, 300), ch = clamp(0.2 * h, 110, 190);
  const cx = w / 2 - chaise / 2, len = d - 0.22 * run;
  return [
    ...main,
    SB(cx, -d / 2 + run * 0.22 + len / 2, legH, chaise, len, seatZ - legH, "main", 0.05),
    SB(cx - 50, -d / 2 + run * 0.22 + 20 + (len - 20) / 2, seatZ, chaise - 160, len - 30, ch, "main", 0.15),
    SB(w / 2 - 60, -d / 2 + run * 0.22 + len / 2, legH, 120, len, clamp(0.72 * h, 450, 680) - legH, "main", 0.4),
    SB(cx, -d / 2 + 0.11 * run, legH, chaise, 0.22 * run, h - legH, "main", 0.32),
    SB(cx - 50, -d / 2 + 0.22 * run + 75, seatZ + ch - 20, chaise - 170, 150, clamp(h - seatZ - ch - 20, 200, 520), "main", 0.38, { tx: 10 }),
    ...four(w - 140, d - 140, (x, y) => B(x, y, 0, 40, 40, legH, "black", 4)).filter((p, i) => i !== 2),
  ];
}

const armchair = item("armchair", "Living", "Armchair", 850, 850, 800, "fabric", (w, d, h) => sofa(w, d, h, { seats: 1, pillows: ["mustard"] }));
const loungeChair = item("loungeChair", "Living", "Lounge chair", 750, 850, 750, "fabric2", (w, d, h) => [
  // Low, deep seat on a solid oak frame with sled arms.
  ...[-1, 1].map((s) => E(s * (w / 2 - 25), 0, 0, [[-d / 2 + 40, 0], [d / 2 - 30, 0], [d / 2 - 30, 25], [d / 2 - 80, 30], [d / 2 - 90, 0.72 * h - 40], [d / 2 - 60, 0.72 * h], [-d / 2 + 140, 0.72 * h], [-d / 2 + 160, 0.72 * h - 30], [d / 2 - 120, 0.72 * h - 30], [d / 2 - 110, 60], [-d / 2 + 60, 60], [-d / 2 + 40, 40]], 50, "oak", { axis: "x", b: 6 })),
  SB(0, 0.06 * d, 0.2 * h, w - 70, d * 0.78, 0.22 * h, "main", 0.22),
  SB(0, -d / 2 + 110, 0.38 * h, w - 80, 170, 0.62 * h, "main", 0.4, { tx: 14 }),
  B(0, 0.04 * d, 0.16 * h, w - 50, d * 0.8, 40, "oak", 0, { plan: false }),
]);
const wingChair = item("wingChair", "Living", "Wingback armchair", 820, 880, 1100, "velvet", (w, d, h) => [
  ...four(w - 120, d - 120, (x, y) => taperLeg(x, y, 0, 22, 180, "walnut")),
  SB(0, 0.02 * d, 180, w, d * 0.96, 200, "main", 0.08),
  SB(0, 0.1 * d, 380, w - 220, d * 0.72, 110, "main", 0.2),
  SB(0, -d / 2 + 90, 180, w - 60, 180, h - 180, "main", 0.35, { tx: 6 }),
  ...[-1, 1].flatMap((s) => [SB(s * (w / 2 - 70), 0.02 * d, 180, 140, d * 0.8, 450, "main", 0.35), SB(s * (w / 2 - 60), -d / 2 + 210, 560, 120, 260, h - 600, "main", 0.4, { tz: s * -8 })]),
]);
const clubChair = item("clubChair", "Living", "Leather club chair", 900, 900, 780, "cognac", (w, d, h) => sofa(w, d, h, { seats: 1, arms: "round", legs: "none", skirt: true }));
const eggChair = item("eggChair", "Living", "Egg chair", 860, 800, 1070, "teal", (w, d, h) => [
  C(0, 0, 0, w * 0.38, 15, "chrome", d * 0.38), C(0, 0, 15, 22, 300, "chrome"),
  E(0, 0, 300, [[d / 2 - 10, 120], [d / 2 - 60, 30], [0, 0], [-d / 2 + 60, 60], [-d / 2 + 10, 380], [-d / 2 + 60, h - 330], [-d / 2 + 120, h - 330], [-d / 2 + 90, 360], [-d / 2 + 140, 120], [0, 80], [d / 2 - 100, 110], [d / 2 - 60, 150]], w * 0.9, "main", { axis: "x", b: 20 }),
  ...[-1, 1].map((s) => SB(s * (w / 2 - 70), -0.05 * d, 420, 140, d * 0.7, h - 520, "main", 0.45, { tz: s * -10 })),
  SB(0, 0.08 * d, 380, w * 0.6, d * 0.6, 90, "main", 0.3),
]);
const beanBag = item("beanBag", "Living", "Bean bag", 900, 900, 750, "charcoal", (w, d, h) => [S(0, 0.05 * d, 0.32 * h, Math.min(w, d) * 0.5, "main", { sz: (0.32 * h) / (Math.min(w, d) * 0.5), sy: 0.98 }), S(0, -0.2 * d, 0.5 * h, Math.min(w, d) * 0.34, "main", { sz: 0.75, sy: 0.65 })]);
const rockingChair = item("rockingChair", "Living", "Rocking chair", 650, 950, 1050, "oak", (w, d, h) => [
  ...[-1, 1].map((s) => T([[s * (w / 2 - 30), -d / 2 + 20, 80], [s * (w / 2 - 30), -d / 4, 15], [s * (w / 2 - 30), d / 4, 15], [s * (w / 2 - 30), d / 2 - 20, 80]], 15, "main", { smooth: true })),
  ...four(w - 60, d * 0.6, (x, y) => C(x, y, 30, 17, 400, "main")),
  SB(0, 0.05 * d, 420, w - 40, d * 0.55, 60, "cream", 0.2),
  ...[-1, 1].map((s) => B(s * (w / 2 - 30), 0, 640, 50, d * 0.55, 30, "main", 15)),
  ...[-1, 1].map((s) => T([[s * (w / 2 - 40), -d * 0.28, 420], [s * (w / 2 - 50), -d / 2 + 30, h - 20]], 17, "main")),
  ...[-0.3, -0.1, 0.1, 0.3].map((k) => T([[k * w, -d * 0.28, 450], [k * w, -d / 2 + 40, h - 60]], 10, "main")),
  T([[-w / 2 + 40, -d / 2 + 32, h - 40], [0, -d / 2 + 25, h - 25], [w / 2 - 40, -d / 2 + 32, h - 40]], 22, "main", { smooth: true }),
]);
const chaise = item("chaiseLongue", "Living", "Chaise longue", 700, 1700, 820, "linen", (w, d, h) => [
  ...four(w - 100, d - 150, (x, y) => taperLeg(x, y, 0, 20, 140, "walnut")),
  SB(0, 0.05 * d, 140, w, d * 0.9, 220, "main", 0.12),
  SB(0, -d / 2 + 250, 300, w, 380, h - 300, "main", 0.4, { tx: 30 }),
  SB(-w / 2 + 70, -0.05 * d, 300, 140, d * 0.5, 280, "main", 0.45),
  SB(0, 0.2 * d, 360, w - 40, d * 0.45, 30, "sage", 0.1),
]);
const daybed = item("daybed", "Living", "Daybed", 2000, 900, 700, "oak", (w, d, h) => [
  ...four(w - 80, d - 80, (x, y) => B(x, y, 0, 60, 60, 380, "main", 6)),
  B(0, 0, 220, w, d, 60, "main", 6),
  SB(0, 0, 280, w - 40, d - 40, 140, "white", 0.1),
  SB(0, -d / 2 + 90, 380, w - 120, 140, h - 380, "cream", 0.4, { tx: 8 }),
  B(0, -d / 2 + 25, 280, w, 50, h - 280, "main", 6),
  ...[-1, 1].map((s) => B(s * (w / 2 - 25), 0, 280, 50, d, 260, "main", 6)),
  ...[-1, 1].map((s) => SB(s * (w / 2 - 300), -d / 2 + 210, 420, 420, 130, 420, s > 0 ? "sage" : "mustard", 0.45, { tx: 15 })),
]);
const ottoman = item("ottoman", "Living", "Ottoman", 900, 600, 430, "leather", (w, d, h) => [...four(w - 80, d - 80, (x, y) => taperLeg(x, y, 0, 18, 100, "walnut")), SB(0, 0, 100, w, d, h - 100, "main", 0.15), ...[-1, 0, 1].flatMap((i) => [-1, 1].map((j) => S((i * w) / 4, (j * d) / 5, h - 2, 8, "main")))]);
const pouf = item("pouf", "Living", "Pouf", 450, 450, 420, "fabric2", (w, d, h) => [L(0, 0, 0, smoothProfile([[0, 0], [w * 0.42, 0], [w * 0.5, h * 0.35], [w * 0.48, h * 0.8], [w * 0.38, h], [0, h]], 4), "main", { sy: d / w, seg: 36 })]);

const coffeeTable = item("coffeeTable", "Living", "Coffee table", 1100, 600, 420, "wood", (w, d, h) => table(w, d, h, { legs: "taper", thick: 30, shelf: true, noApron: true }));
const coffeeMarble = item("coffeeMarble", "Living", "Round marble coffee table", 900, 900, 380, "marble", (w, d, h) => [C(0, 0, h - 25, w / 2, 25, "main", d / 2, { seg: 56 }), L(0, 0, 0, [[w * 0.3, 0], [w * 0.29, 10], [w * 0.22, h - 25], [w * 0.24, h - 25], [0, h - 25]], "brass")]);
const coffeeGlass = item("coffeeGlass", "Living", "Glass coffee table", 1200, 650, 400, "chrome", (w, d, h) => [B(0, 0, h - 12, w, d, 12, "glass", 20), ...[-1, 1].map((s) => T([[s * (w / 2 - 40), -d / 2 + 30, h - 12], [s * (w / 2 - 40), -d / 2 + 30, 0], [s * (w / 2 - 40), d / 2 - 30, 0], [s * (w / 2 - 40), d / 2 - 30, h - 12]], 12, "main")), B(0, 0, 120, w - 120, d - 80, 10, "glass", 10)]);
const nesting = item("nestingTables", "Living", "Nesting side tables", 550, 450, 520, "walnut", (w, d, h) => [...table(w, d, h, { legs: "square", legT: 22, thick: 20, noApron: true, legC: "black" }), ...move(table(w * 0.8, d * 0.86, h * 0.84, { legs: "square", legT: 20, thick: 18, noApron: true, legC: "black", topC: "black" }), 0, 0.03 * d)]);
const sideTable = item("sideTable", "Living", "Side table", 500, 500, 550, "wood", (w, d, h) => [C(0, 0, h - 28, w / 2, 28, "main", d / 2, { seg: 40 }), C(0, 0, 0, w * 0.035, h - 28, "black"), L(0, 0, 0, [[w * 0.3, 0], [w * 0.3, 8], [w * 0.26, 18], [0, 20]], "black")]);
const sideTableWood = item("sideTableWood", "Living", "Wooden side table with drawer", 450, 400, 560, "oak", (w, d, h) => [...cabinet(w, d, h * 0.3, { fronts: "D", handle: "knob" }).map((p) => ({ ...p, z: p.z + h * 0.7 })), ...four(w - 40, d - 40, (x, y) => taperLeg(x, y, 0, 18, h * 0.7, "main")), B(0, 0, 0.2 * h, w - 60, d - 60, 15, "main", 0, { plan: false })]);
const consoleTable = item("consoleTable", "Living", "Console table", 1200, 350, 780, "wood", (w, d, h) => [...table(w, d, h, { legs: "square", thick: 28, noApron: true, legC: "black" }), B(0, 0, 0.15 * h, w - 80, d - 50, 18, "main", 4), L(-w * 0.28, 0, h, smoothProfile([[0, 0], [55, 0], [85, 120], [45, 220], [35, 260], [0, 262]], 3), "ceramic"), ...books(w * 0.05, w * 0.35, 0, 0.15 * h + 18, 220, d * 0.7, 7, 0.95).map((p) => ({ ...p, tz: 0 }))]);

const tvUnit = item("tvUnit", "Living", "TV unit", 1800, 450, 500, "dark", (w, d, h) => [
  ...cabinet(w, d, h, { fronts: "dDd", handle: "groove", legs: true, legC: "oak" }),
  // A TV on its stand on top (the item's height is the unit's).
  B(0, -0.1 * d, h, 0.3 * w, 0.4 * d, 12, "black", 10), B(0, -0.1 * d, h + 12, 60, 40, 0.06 * w, "black"),
  B(0, -0.1 * d, h + 0.04 * w, 0.62 * w, 45, 0.35 * w, "black", 6), B(0, -0.1 * d + 23, h + 0.04 * w + 12, 0.62 * w - 24, 2, 0.35 * w - 24, "screen", 0, { plan: false }),
], { tags: "media console television" });
const mediaWall = item("mediaWall", "Living", "Media wall unit", 3000, 450, 2100, "white", (w, d, h) => [
  ...move(cabinet(w, d, 450, { fronts: "dddd", handle: "groove", plinth: 60 }), 0, 0),
  ...[-1, 1].flatMap((s) => [B(s * (w / 2 - 300), -d / 2 + 160, 450, 600, 320, h - 450, "oak", 0), ...[0.3, 0.55, 0.8].map((k) => B(s * (w / 2 - 300), -d / 2 + 170, 450 + k * (h - 450), 560, 300, 22, "white")), ...books(s * (w / 2 - 300) - 270, s * (w / 2 - 300) + 270, -d / 2 + 170, 450 + 0.55 * (h - 450) + 22, 260, 220, s > 0 ? 3 : 4)]),
  B(0, -d / 2 + 40, 650, 1650, 50, 950, "black", 8), B(0, -d / 2 + 66, 662, 1626, 2, 926, "screen", 0, { plan: false }),
]);
const bookshelf = item("bookshelf", "Living", "Bookshelf", 900, 350, 1900, "wood", (w, d, h) => {
  const out = [B(-w / 2 + 12, 0, 0, 24, d, h, "main", 0), B(w / 2 - 12, 0, 0, 24, d, h, "main", 0), B(0, -d / 2 + 6, 0, w, 12, h, "main", 0, { plan: false })];
  const n = Math.max(3, Math.round(h / 360));
  for (let i = 0; i <= n; i++) out.push(B(0, 0, i === n ? h - 24 : 60 + ((h - 84) * i) / n, w - 48, d, 24, "main", 0, i === n ? {} : { plan: false }));
  out.push(B(0, d / 2 - 10, 0, w - 48, 20, 60, "main", 0, { plan: false }));
  for (let i = 0; i < n; i++) out.push(...books(-w / 2 + 24, w / 2 - 24, -0.02 * d, 84 + ((h - 84) * i) / n, (h - 84) / n - 50, d * 0.85, i + 11, i === 1 ? 0.55 : 0.85));
  return out;
});
const cubeShelf = item("cubeShelf", "Living", "Cube shelving (4×4)", 1470, 390, 1470, "white", (w, d, h) => {
  const out = [], n = 4, r = rng(4), cs = ["oak", "sage", "charcoal"];
  for (let i = 0; i <= n; i++) { out.push(B(-w / 2 + 15 + ((w - 30) * i) / n, 0, 0, 30, d, h, "main", 0, { plan: i === 0 || i === n })); out.push(B(0, 0, ((h - 30) * i) / n, w, d, 30, "main", 0, { plan: i === n })); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -w / 2 + ((w - 30) * (i + 0.5)) / n + 15, z = ((h - 30) * j) / n + 30, c = (w - 30) / n - 40;
    const k = r();
    if (k < 0.35) out.push(SB(x, 0.02 * d, z, c - 20, d - 60, c - 30, cs[Math.floor(r() * 3)], 0.06, { plan: false }));
    else if (k < 0.7) out.push(...books(x - c / 2, x + c / 2, 0, z, c - 50, d * 0.8, i * 5 + j, 0.7));
  }
  return out;
});
const wallShelf = item("wallShelf", "Living", "Wall shelf", 1000, 250, 260, "wood", (w, d, h) => [B(0, 0, 0, w, d, 30, "main", 0), ...[-1, 1].map((s) => B(s * (w / 2 - 80), -d / 2 + 10, -0.0, 20, d * 0.5, h * 0.25, "black")), ...books(-w / 2 + 40, w * 0.1, 0, 30, h - 40, d * 0.8, 21, 0.95), ...pot(w * 0.3, 0, 60, 110, "ceramic").map((p) => ({ ...p, z: p.z + 30 })), ...leaves(w * 0.3, 0, 120, 7, 130, 50, 30, 9).map((p) => (p.z + p.r * 0.2 > h ? { ...p, sz: 0.1 } : p))], { mount: "wall", elev: 1400 });
const floatingShelves = item("floatingShelves", "Living", "Floating shelves (3)", 900, 220, 900, "oak", (w, d, h) => [0, 0.45, 0.9].flatMap((k, i) => [B(0, 0, k * h * 0.97, w, d, 35, "main", 0, { plan: i === 2 }), ...books(-w / 2 + 20, i === 1 ? w * 0.1 : w * 0.3, 0, k * h * 0.97 + 35, Math.min(260, h * 0.4), d * 0.8, 30 + i, 0.9)]), { mount: "wall", elev: 1100 });

const piano = item("piano", "Living", "Upright piano", 1500, 600, 1250, "black", (w, d, h) => [
  B(0, -0.12 * d, 0, w, 0.76 * d, h, "main", 8, { b: 6 }), B(0, 0.2 * d, 0.56 * h, w - 80, 0.36 * d, 0.06 * h, "main", 4),
  B(0, 0.24 * d, 0.62 * h, w - 140, 0.18 * d, 20, "white", 0, { plan: false }), ...Array.from({ length: 36 }, (_, i) => B(-w / 2 + 110 + ((w - 220) * i) / 35, 0.2 * d, 0.62 * h + 20, 12, 0.1 * d, 14, "black", 0, { plan: false })),
  ...[-1, 1].map((s) => B(s * (w / 2 - 40), 0.12 * d, 0, 70, 0.76 * d, 0.56 * h, "main", 6)), B(0, -0.12 * d + 0.38 * d, 0.75 * h, w * 0.5, 15, 0.12 * h, "main"),
]);
const grandPiano = item("grandPiano", "Living", "Grand piano", 1500, 1900, 1000, "black", (w, d, h) => {
  // The case outline seen from above: straight bass side, the curved bentside, keyboard at the front.
  const out = [[-w / 2, d / 2 - 300], [-w / 2, -d / 2 + 80], [-w / 2 + 120, -d / 2], [-w / 2 + 330, -d / 2 + 30], [-w / 2 + 470, -d / 2 + 260], [w * 0.05, -d * 0.05], [w / 2 - 80, d * 0.15], [w / 2, d * 0.28], [w / 2, d / 2 - 300]];
  return [
    E(0, 0, 0.62 * h, out, 0.3 * h, "main", { b: 8 }),
    // The lid (closed) and the music desk.
    E(0, 0, 0.92 * h, out.map(([x, y]) => [x * 0.99, y * 0.99]), 18, "main", { b: 5, plan: false }),
    B(0, d / 2 - 330, 0.92 * h + 18, w * 0.5, 20, 0.07 * h, "main", 2, { tx: -15, plan: false }),
    B(0, d / 2 - 230, 0.62 * h, w, 160, 0.14 * h, "main", 4), B(0, d / 2 - 170, 0.7 * h, w - 160, 120, 18, "white", 0, { plan: false }),
    ...[[-w / 2 + 80, d / 2 - 250], [w / 2 - 80, d / 2 - 250], [-w / 2 + 200, -d / 2 + 200]].map(([x, y]) => C(x, y, 0, 45, 0.62 * h, "main", 45, { top: 1.3 })),
    B(0, d / 2 - 380, 40, 300, 40, 200, "brass", 0, { plan: false }),
  ];
});
const fireplace = item("fireplace", "Living", "Fireplace", 1500, 400, 1100, "stone", (w, d, h) => [
  B(0, 0, 0, w, d, 100, "main", 4), B(-w / 2 + 0.15 * w, -0.05 * d, 100, 0.3 * w, 0.9 * d, h - 200, "main"), B(w / 2 - 0.15 * w, -0.05 * d, 100, 0.3 * w, 0.9 * d, h - 200, "main"),
  B(0, -0.05 * d, h - 330, 0.4 * w, 0.9 * d, 230, "main"), B(0, 0.02 * d, h - 100, w + 40, d + 40, 100, "darkwood", 6, { b: 4 }),
  B(0, -0.3 * d, 100, 0.4 * w, 0.3 * d, h - 430, "black", 0, { plan: false }),
  ...[-1, 0, 1].map((k) => T([[k * 0.1 * w - 90, -0.1 * d, 130], [k * 0.1 * w + 90, 0.02 * d, 150]], 38, "trunk", { plan: false })),
  ...[-0.12, -0.04, 0.05, 0.13].map((k, i) => G(S(k * w, -0.06 * d, 200, 0.045 * w, i % 2 ? "yellow" : "orange", { sz: 2.6 - (i % 2) * 0.8, sy: 0.5, plan: false }), 0.12)),
], { tags: "hearth mantel", light: { type: "point", lumens: 600, at: (w, d, h) => [0, -0.05 * d, 260] } });
const fireplaceModern = item("fireplaceLinear", "Living", "Linear gas fireplace", 1800, 350, 600, "black", (w, d, h) => [B(0, 0, 0, w, d, h, "concrete", 4), B(0, d / 2 - 2, 0.25 * h, w - 200, 6, 0.5 * h, "glass"), B(0, -0.05 * d, 0.25 * h, w - 220, d * 0.5, 0.5 * h, "main", 0, { plan: false }), ...Array.from({ length: 9 }, (_, i) => G(S(-w / 2 + 200 + ((w - 400) * i) / 8, 0, 0.3 * h, 60, i % 2 ? "yellow" : "orange", { sz: 1.6, sy: 0.4, plan: false }), 0.12))], { light: { type: "point", lumens: 800, at: (w, d, h) => [0, 0, 0.45 * h] } });

const rug = item("rug", "Living", "Rug", 2000, 1400, 10, "rug", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 30), B(0, 0, h, w - 160, d - 160, 1, "cream", 20, { plan: false })]);
const rugRound = item("rugRound", "Living", "Round rug", 1600, 1600, 12, "terracotta", (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2, { seg: 64, m: "rug" }), C(0, 0, h, w * 0.38, 1, "cream", d * 0.38, { seg: 64, m: "rug", plan: false })]);
const rugShag = item("rugShag", "Living", "Shaggy rug", 2400, 1700, 30, "cream", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 20, { b: 12, m: "rug" })]);
const runner = item("runner", "Living", "Hallway runner", 800, 2500, 10, "navy", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10, { m: "rug" }), B(0, 0, h, w - 120, d - 120, 1, "mustard", 6, { m: "rug", plan: false })]);

const curtain = item("curtain", "Living", "Curtains", 1800, 120, 2500, "fabric2", (w, d, h) => {
  // Two gathered panels of soft folds hanging from a rod.
  const out = [T([[-w / 2, 0, h - 30], [w / 2, 0, h - 30]], 12, "black")];
  for (const s of [-1, 1]) {
    const pw = w * 0.3, n = 7;
    for (let i = 0; i < n; i++) out.push(C(s * (w / 2 - pw / 2) + ((i - (n - 1) / 2) * pw) / n, 0, 0, pw / n / 1.6, h - 60, "main", d * 0.35, { seg: 10, plan: i === 0 || i === n - 1 ? undefined : false }));
  }
  return out;
}, { tags: "drapes" });
const blinds = item("blinds", "Living", "Roller blind", 1400, 60, 1800, "cream", (w, d, h) => [C(0, 0, h - 80, 40, 1, "white", 30, { tx: 0, plan: false }), T([[-w / 2, 0, h - 40], [w / 2, 0, h - 40]], 40, "white"), B(0, 10, h * 0.25, w - 40, 2, h * 0.75 - 60, "main", 0, { m: "fabric" }), B(0, 10, h * 0.25 - 30, w - 40, 15, 30, "white")], { mount: "wall", elev: 700 });
const venetian = item("venetianBlind", "Living", "Venetian blind", 1200, 60, 1500, "oak", (w, d, h) => [B(0, 0, h - 50, w, d, 50, "white", 4), ...Array.from({ length: Math.floor((h - 60) / 50) }, (_, i) => B(0, 0, h - 90 - i * 50, w - 20, 50, 3, "main", 0, { tx: 15, plan: false }))], { mount: "wall", elev: 800 });

const wallArt = item("wallArt", "Living", "Wall art", 900, 40, 600, "dark", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 0), B(0, 2, 40, w - 80, d, h - 80, "cream", 0, { plan: false }), ...[[0.2, 0.3, "terracotta", 0.25], [0.55, 0.55, "navy", 0.3], [0.35, 0.65, "mustard", 0.15]].map(([u, v, c, r]) => C(-w / 2 + 40 + u * (w - 80), d / 2 + 2, 40 + v * (h - 80), r * Math.min(w, h) * 0.6, 1, c, r * Math.min(w, h) * 0.6, { tx: 90, plan: false }))], { mount: "wall", elev: 1300, tags: "picture painting frame" });
const gallery = item("galleryWall", "Living", "Gallery wall (6 frames)", 1600, 30, 1000, "black", (w, d, h) => {
  const fr = [[0, 0.45, 0.32, 0.55], [0.36, 0.55, 0.28, 0.45], [0.68, 0.35, 0.32, 0.65], [0.02, 0, 0.3, 0.4], [0.36, 0, 0.28, 0.5], [0.68, 0.0, 0.32, 0.3]];
  const cs = ["sage", "terracotta", "cream", "navy", "mustard", "blush"];
  return fr.flatMap(([u, v, fw, fh], i) => [B(-w / 2 + (u + fw / 2) * w, 0, v * h, fw * w, d, fh * h, "main", 0), B(-w / 2 + (u + fw / 2) * w, 4, v * h + 25, fw * w - 50, d, fh * h - 50, cs[i], 0, { m: "paper", plan: false })]);
}, { mount: "wall", elev: 1100 });
const mirrorRound = item("mirrorRound", "Living", "Round mirror", 800, 40, 800, "brass", (w, d, h) => [R(0, 0, h / 2, w / 2 - 15, 15, "main", { axis: "y" }), C(0, -d / 2 + 5, h / 2, w / 2 - 12, 10, "mirror", h / 2 - 12, { tx: -90, plan: false })], { mount: "wall", elev: 1200 });
const wallClock = item("wallClock", "Living", "Wall clock", 400, 50, 400, "white", (w, d, h) => [C(0, -d / 2, h / 2, w / 2, d * 0.8, "black", h / 2, { tx: -90 }), C(0, -d / 2 + 4, h / 2, w / 2 - 15, d * 0.8, "main", h / 2 - 15, { tx: -90, plan: false }), ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return B(Math.cos(a) * w * 0.4, d * 0.35, h / 2 + Math.sin(a) * h * 0.4, 8, 3, 25, "black", 0, { ty: -(a * 180) / Math.PI + 90, plan: false }); }), B(0, d * 0.4, h / 2, 6, 3, h * 0.3, "black", 0, { ty: 40, plan: false }), B(0, d * 0.42, h / 2, 5, 3, h * 0.4, "black", 0, { ty: -110, plan: false })], { mount: "wall", elev: 1800 });
const wallTV = item("wallTV", "Living", "Wall-mounted TV", 1400, 60, 800, "black", (w, d, h) => [B(0, 0, 0, w, d * 0.6, h, "main", 6), B(0, d * 0.3 + 1, 12, w - 24, 2, h - 24, "screen", 0, { plan: false }), B(0, -d * 0.3, h * 0.3, w * 0.3, d * 0.4, h * 0.4, "metal", 0, { plan: false })], { mount: "wall", elev: 1000 });

const plant = item("plant", "Living", "Plant", 500, 500, 1200, "leaf", (w, d, h) => [...pot(0, 0, Math.min(w, d) * 0.3, h * 0.3, "ceramic"), C(0, 0, h * 0.28, 12, h * 0.25, "trunk"), ...leaves(0, 0, h * 0.4, 14, Math.min(w, d, h * 0.9) * 0.62, Math.min(w, d) * 0.22, 45, 2, "leaf").map((p) => ({ ...p, sz: 0.1 })), ...leaves(0, 0, h * 0.6, 9, Math.min(w, d) * 0.55, Math.min(w, d) * 0.2, 65, 6, "leaf3")], { tags: "houseplant" });

export default [
  sofa3, variant(sofa3, "sofa2", "Sofa (2 seats)", { w: 1600, parts: (w, d, h) => sofa(w, d, h, { seats: 2, pillows: ["sage"] }) }),
  variant(sofa3, "sofaGrey", "Sofa, grey linen (3 seats)", { color: "grey", w: 2300, d: 950, h: 780, parts: (w, d, h) => sofa(w, d, h, { seats: 3, arms: "slim", legs: "metal", pillows: ["cream", "terracotta"] }) }),
  variant(sofa3, "sofaVelvet", "Velvet sofa (2 seats)", { color: "velvet", w: 1750, h: 760, parts: (w, d, h) => sofa(w, d, h, { seats: 2, arms: "round", legs: "metal", legC: "brass", backCushions: false, tufted: true, pillows: ["blush"] }) }),
  variant(sofa3, "sofaModular", "Low modular sofa (4 seats)", { color: "cream", w: 2900, d: 1000, h: 700, parts: (w, d, h) => sofa(w, d, h, { seats: 4, arms: "track", legs: "none", skirt: true, pillows: ["sage", "charcoal", "mustard"] }) }),
  variant(sofa3, "sofaLeather", "Leather sofa (3 seats)", { color: "leather", w: 2150, d: 920, h: 820, parts: (w, d, h) => sofa(w, d, h, { seats: 3, arms: "track", legs: "metal", legC: "chrome" }) }),
  variant(sofa3, "sofaBed", "Sofa bed", { color: "charcoal", w: 2000, d: 950, h: 850, parts: (w, d, h) => sofa(w, d, h, { seats: 2, arms: "slim", legs: "block", legC: "black", pillows: ["cream"] }) }),
  chesterfield,
  item("sectional", "Living", "Corner sofa", 2600, 1800, 800, "fabric", sectional, { tags: "L-shaped sectional" }),
  armchair, variant(armchair, "armchairLinen", "Linen armchair", { color: "linen", parts: (w, d, h) => sofa(w, d, h, { seats: 1, arms: "slim", legs: "taper", pillows: ["terracotta"] }) }),
  loungeChair, wingChair, clubChair, eggChair, beanBag, rockingChair, chaise, daybed, ottoman, pouf,
  coffeeTable, coffeeMarble, coffeeGlass, variant(coffeeTable, "coffeeOval", "Oval coffee table", { color: "walnut", w: 1300, d: 700, h: 380, parts: (w, d, h) => table(w, d, h, { top: "oval", legs: "taper", thick: 28 }) }),
  nesting, sideTable, sideTableWood, consoleTable,
  tvUnit, mediaWall, bookshelf, cubeShelf, wallShelf, floatingShelves,
  piano, grandPiano, fireplace, fireplaceModern,
  rug, rugRound, rugShag, runner, curtain, blinds, venetian,
  wallArt, gallery, mirrorRound, wallClock, wallTV, plant,
];
