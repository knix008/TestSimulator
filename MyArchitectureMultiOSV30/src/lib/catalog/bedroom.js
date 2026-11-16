// Bedroom and kids' room: beds, wardrobes, chests, nightstands, dressing tables, desks, toys.
import { B, C, S, L, E, T, R, G, SB, item, variant, bed, cabinet, table, taperLeg, four, books, shade, move, place, smoothProfile, officeChair, rng, clamp, woodChair } from "./common.js";

// Clothes on a rail from x1 to x2 (hangers and garments).
function clothes(x1, x2, y, z, len, depth, seed = 2) {
  const r = rng(seed), out = [T([[x1, y, z], [x2, y, z]], 12, "chrome")];
  const cs = ["navy", "cream", "charcoal", "sage", "terracotta", "white", "blush", "grey"];
  for (let x = x1 + 50; x < x2 - 40; x += 45 + r() * 35) {
    const l = len * (0.55 + r() * 0.45);
    out.push(SB(x, y, z - 40 - l, 18 + r() * 14, depth * (0.8 + r() * 0.2), l, cs[Math.floor(r() * cs.length)], 0.3, { plan: false }));
  }
  return out;
}
const lampOnTop = (x, y, z, s = 1) => [L(x, y, z, smoothProfile([[60 * s, 0], [75 * s, 60 * s], [55 * s, 170 * s], [15 * s, 210 * s], [0, 210 * s]], 3), "ceramic"), shade(x, y, z + 200 * s, 130 * s, 100 * s, 160 * s, "linen")];

const doubleBed = item("doubleBed", "Bedroom", "Double bed", 1600, 2100, 500, "white", (w, d, h) => bed(w, d, h, 2 * h, { head: "panel", frameC: "oak", headC: "oak", throwC: "sage" }), { tags: "queen bed" });
const singleBed = item("singleBed", "Bedroom", "Single bed", 1000, 2000, 500, "white", (w, d, h) => bed(w, d, h, 1.8 * h, { head: "slats", frameC: "white", headC: "white", beddingC: "navy", legs: true }));

const wardrobe = item("wardrobe", "Bedroom", "Wardrobe", 1200, 600, 2100, "lightwood", (w, d, h) => cabinet(w, d, h, { fronts: "d".repeat(Math.max(2, Math.round(w / 500))), handle: "bar", plinth: 80 }), { tags: "closet armoire" });
const wardrobeSliding = item("wardrobeSliding", "Bedroom", "Sliding-door wardrobe with mirror", 2000, 650, 2200, "white", (w, d, h) => [
  B(0, -10, 0, w, d - 20, h, "main", 2),
  B(-w / 4, d / 2 - 20, 30, w / 2, 20, h - 60, "mirror", 0, { plan: false }), B(w / 4, d / 2 - 5, 30, w / 2, 20, h - 60, "main", 0, { plan: false }),
  B(0, d / 2 - 10, h - 30, w, 50, 30, "steel", 0, { plan: false }),
  B(w / 2 - 60, d / 2 + 6, h * 0.35, 20, 8, h * 0.35, "steel", 0, { plan: false }),
]);
const walkIn = item("closetOpen", "Bedroom", "Open closet system", 2400, 600, 2200, "oak", (w, d, h) => {
  const out = [];
  for (const k of [0, 1 / 3, 2 / 3, 1]) out.push(B(-w / 2 + 12 + k * (w - 24), 0, 0, 24, d, h, "main"));
  out.push(B(0, 0, h - 24, w, d, 24, "main"), B(0, -d / 2 + 8, 0, w, 16, h, "main", 0, { plan: false }));
  const bay = (w - 24) / 3;
  out.push(...clothes(-w / 2 + 24, -w / 2 + bay, 0, h - 120, 1000, d * 0.85, 3));
  out.push(...clothes(-w / 2 + 24, -w / 2 + bay, 0, h * 0.45, 700, d * 0.85, 4));
  for (const z of [0.15, 0.32, 0.5, 0.68, 0.85]) out.push(B(-w / 2 + bay * 1.5 + 12, 0, z * h, bay - 24, d, 20, "main", 0, { plan: false }));
  for (const z of [0.15, 0.32]) for (let i = 0; i < 4; i++) out.push(SB(-w / 2 + bay + 70 + i * (bay - 80) / 4, 0.1 * d, z * h + 20, 70, 260, 110, ["black", "tan", "white", "navy"][i], 0.4, { plan: false }));
  for (const z of [0.5, 0.68, 0.85]) for (let i = 0; i < 3; i++) out.push(SB(-w / 2 + bay + 120 + (i * (bay - 140)) / 3, 0, z * h + 20, (bay - 160) / 3, d * 0.7, 80, ["cream", "grey", "navy"][(i + z * 10) % 3 | 0], 0.15, { plan: false }));
  out.push(...clothes(w / 2 - bay, w / 2 - 24, 0, h - 120, 1500, d * 0.85, 5));
  return out;
}, { tags: "wardrobe walk-in" });
const nightstand = item("nightstand", "Bedroom", "Nightstand", 450, 400, 500, "lightwood", (w, d, h) => [...cabinet(w, d, h, { fronts: "D,D", handle: "knob", legs: true, legC: "walnut" }), ...lampOnTop(0, -0.1 * d, h, 0.9)]);
const dresser = item("dresser", "Bedroom", "Dresser", 1000, 500, 800, "lightwood", (w, d, h) => cabinet(w, d, h, { fronts: "DD,DD,DD", handle: "knob", legs: true, legC: "walnut", handleC: "brass" }), { tags: "chest of drawers" });
const tallboy = item("tallboy", "Bedroom", "Tall chest of drawers", 600, 450, 1300, "walnut", (w, d, h) => cabinet(w, d, h, { fronts: "D,D,D,D,D,D", handle: "bar", plinth: 60 }));
const dressing = item("dressingTable", "Bedroom", "Dressing table with mirror", 1000, 450, 1500, "white", (w, d, h) => [
  ...table(w, d, 760, { legs: "taper", thick: 25, legC: "oak" }), ...move(cabinet(w * 0.35, d * 0.9, 120, { fronts: "D", handle: "knob", handleC: "brass" }), w * 0.3, 0, 615),
  C(0, -d / 2 + 30, 760, 70, 12, "brass", 25), C(0, -d / 2 + 30, 772, 15, 150, "brass"),
  C(0, -d / 2 + 40, 1110, 360, 20, "mirror", 360, { tx: -90, plan: false }), R(0, -d / 2 + 50, 1110, 360, 12, "brass", { axis: "y", plan: false }),
  L(-w * 0.35, 0, 760, [[0, 0], [30, 0], [35, 60], [20, 100], [0, 100]], "glass"), C(-w * 0.25, 0.1 * d, 760, 40, 80, "blush"),
]);
const vanityStool = item("vanityStool", "Bedroom", "Upholstered stool", 450, 450, 460, "blush", (w, d, h) => [C(0, 0, h - 120, w / 2, 120, "main", d / 2, { seg: 36, m: "velvet" }), ...four(w * 0.5, d * 0.5, (x, y, a, b) => taperLeg(x * 1.2, y * 1.2, 0, 15, h - 120, "brass", 0.8, { ty: -a * 5, tx: b * 5 }))]);
const floorMirror = item("floorMirror", "Bedroom", "Full-length floor mirror", 600, 400, 1700, "black", (w, d, h) => [B(0, -0.3 * d, 0, w, 40, h, "main", 20, { tx: 8 }), B(0, -0.3 * d + 21, 30, w - 60, 2, h - 60, "mirror", 10, { tx: 8, plan: false }), T([[0, -0.3 * d, 0.6 * h], [0, d / 2 - 30, 0]], 12, "main")]);
const desk = item("desk", "Bedroom", "Desk", 1200, 600, 750, "white", (w, d, h) => [
  ...table(w, d, h, { legs: "taper", thick: 28, legC: "oak", noApron: true }), ...move(cabinet(w * 0.4, d * 0.9, 110, { fronts: "D", handle: "groove" }), -w * 0.25, 0, h - 138),
  // A laptop and a desk lamp on top.
  B(w * 0.05, 0.05 * d, h, 330, 230, 12, "steel", 8, { m: "metal" }), B(w * 0.05, 0.05 * d - 115, h + 12, 330, 8, 220, "steel", 6, { tx: 15, m: "metal" }), B(w * 0.05, 0.05 * d - 110, h + 20, 300, 2, 190, "screen", 0, { tx: 15, plan: false }),
  C(-w * 0.35, -0.25 * d, h, 70, 15, "black"), T([[-w * 0.35, -0.25 * d, h + 15], [-w * 0.3, -0.3 * d, h + 330], [-w * 0.2, -0.15 * d, h + 380]], 8, "black"), L(-w * 0.2, -0.15 * d, h + 300, [[70, 0], [30, 80], [8, 90], [0, 90]], "black", { ty: 25 }),
], { tags: "writing desk study" });
const kingBed = item("kingBed", "Bedroom", "King bed", 1900, 2150, 1100, "white", (w, d, h) => bed(w, d, 0.5 * h, h, { head: "tufted", frameC: "grey", headC: "grey", beddingC: "white", throwC: "charcoal", pillows: 2 }));

const kidsDesk = item("kidsDesk", "Kids", "Kids' desk and chair", 900, 900, 700, "white", (w, d, h) => [
  ...move(table(w, d * 0.6, 0.85 * h, { legs: "square", legT: 40, thick: 22, noApron: true, legC: "sage" }), 0, -0.2 * d),
  ...place(woodChair(360, 380, 650).map((p) => ({ ...p, c: p.c === "main" ? "sage" : p.c })), 0, 0.25 * d, 180),
  ...books(-w * 0.4, -w * 0.15, -0.35 * d, 0.85 * h, 200, 150, 77, 1),
]);

export default [
  doubleBed, singleBed,
  item("queenBed", "Bedroom", "Queen bed, upholstered", 1700, 2200, 1150, "linen", (w, d, h) => bed(w, d, 0.48 * h, h, { head: "tufted", frameC: "main", headC: "main", beddingC: "white", throwC: "terracotta", legs: true })),
  kingBed,
  item("bedPlatform", "Bedroom", "Low platform bed", 1800, 2200, 800, "oak", (w, d, h) => bed(w, d, 0.42 * h, h, { head: "panel", frameC: "main", headC: "main", beddingC: "cream", throwC: "charcoal" })),
  item("bedWing", "Bedroom", "Wingback bed", 1800, 2250, 1400, "velvet", (w, d, h) => bed(w, d, 0.38 * h, h, { head: "wing", frameC: "main", headC: "main", beddingC: "white", throwC: "mustard", legs: true })),
  item("bedSlatted", "Bedroom", "Slatted wooden bed", 1600, 2100, 1000, "walnut", (w, d, h) => bed(w, d, 0.5 * h, h, { head: "slats", frameC: "main", headC: "main", beddingC: "linen", legs: true })),
  item("canopyBed", "Bedroom", "Four-poster bed", 1800, 2200, 2200, "black", (w, d, h) => [...bed(w, d, 550, 1100, { head: "panel", frameC: "main", headC: "main", beddingC: "white", throwC: "sage" }), ...four(w - 40, d - 40, (x, y) => C(x, y, 0, 22, h - 30, "main")), ...[-1, 1].flatMap((s) => [T([[s * (w / 2 - 20), -d / 2 + 20, h - 25], [s * (w / 2 - 20), d / 2 - 20, h - 25]], 18, "main"), T([[-w / 2 + 20, s * (d / 2 - 20), h - 25], [w / 2 - 20, s * (d / 2 - 20), h - 25]], 18, "main")])]),
  item("bunkBed", "Bedroom", "Bunk bed", 1000, 2000, 1700, "white", (w, d, h) => [
    ...four(w - 50, d - 50, (x, y) => B(x, y, 0, 60, 60, h, "main", 6)),
    ...move(bed(w - 70, d - 70, 0.3 * h, 0.3 * h, { head: "none", frameC: "main", beddingC: "navy" }).filter((p, i) => i > 0), 0, 0, 0),
    ...move(bed(w - 70, d - 70, 0.3 * h, 0.3 * h, { head: "none", frameC: "main", beddingC: "terracotta" }).filter((p, i) => i > 0), 0, 0, 0.5 * h),
    ...[0.08, 0.58].flatMap((z) => [B(0, -d / 2 + 25, z * h, w - 50, 30, 120, "main"), B(0, d / 2 - 25, z * h, w - 50, 30, 120, "main"), B(-w / 2 + 25, 0, z * h, 30, d - 50, 120, "main"), B(w / 2 - 25, 0, z * h, 30, d - 50, 120, "main")]),
    B(-w / 2 + 25, 0.1 * d, 0.85 * h, 30, d * 0.7, 80, "main"), B(w / 2 - 25, 0, 0.85 * h, 30, d - 50, 80, "main"),
    ...[0.2, 0.35, 0.5, 0.65].map((z) => B(w / 2 - 15, d / 2 - 350, z * h, 30, 300, 30, "main")),
  ], { tags: "kids" }),
  item("loftBed", "Kids", "Loft bed with desk", 1000, 2000, 1800, "oak", (w, d, h) => [
    ...four(w - 50, d - 50, (x, y) => B(x, y, 0, 60, 60, h, "main", 6)),
    ...move(bed(w - 70, d - 70, 0.25 * h, 0.25 * h, { head: "none", frameC: "white", beddingC: "sage" }).filter((p, i) => i > 0), 0, 0, 0.62 * h - 0.14 * h),
    B(0, -d / 2 + 25, 0.62 * h, w - 50, 30, 0.3 * h, "main"), B(0, d / 2 - 25, 0.62 * h, w - 50, 30, 0.3 * h, "main"), B(w / 2 - 25, 0, 0.82 * h, 30, d - 50, 100, "main"),
    B(0, -0.15 * d, 0.4 * h, w - 50, d * 0.55, 25, "white"), ...books(-w * 0.3, w * 0.1, -0.35 * d, 0.4 * h + 25, 200, 150, 88, 1),
    ...[0.1, 0.25, 0.4, 0.55].map((z) => B(-w / 2 + 15, d / 2 - 250, z * h, 30, 300, 30, "main")),
  ]),
  item("crib", "Bedroom", "Baby crib", 700, 1300, 1000, "white", (w, d, h) => [
    ...four(w - 40, d - 40, (x, y) => B(x, y, 0, 45, 45, h, "main", 6)),
    SB(0, 0, 0.3 * h, w - 70, d - 70, 120, "white", 0.06), SB(0, 0.1 * d, 0.3 * h + 120, w - 90, d * 0.55, 40, "blush", 0.08),
    ...[-1, 1].flatMap((s) => [B(s * (w / 2 - 20), 0, h - 40, 30, d - 40, 40, "main"), B(s * (w / 2 - 20), 0, 0.28 * h, 30, d - 40, 40, "main"), ...Array.from({ length: 11 }, (_, i) => C(s * (w / 2 - 20), -d / 2 + 60 + ((d - 120) * i) / 10, 0.28 * h + 40, 9, 0.72 * h - 80, "main", 9, { plan: false }))]),
    ...[-1, 1].map((s) => B(0, s * (d / 2 - 20), 0.28 * h, w - 40, 30, 0.72 * h, "main")),
  ], { tags: "cot baby" }),
  wardrobe, wardrobeSliding, walkIn, nightstand,
  variant(nightstand, "nightstandFloat", "Floating nightstand", { color: "walnut", h: 600, parts: (w, d, h) => [...cabinet(w, d, 160, { fronts: "D", handle: "groove" }).map((p) => ({ ...p, z: p.z + 380 })), ...lampOnTop(0, -0.1 * d, 540, 0.75)] }),
  dresser, tallboy, dressing, vanityStool, floorMirror,
  item("bedBench", "Bedroom", "Bed bench", 1400, 450, 450, "fabric", (w, d, h) => [...four(w - 60, d - 60, (x, y) => taperLeg(x, y, 0, 18, h - 160, "walnut")), SB(0, 0, h - 160, w, d, 160, "main", 0.12), ...[-1, 0, 1].map((k) => S((k * w) / 3.2, 0, h - 1, 8, "main"))]),
  desk,
  item("deskOffice", "Bedroom", "Home office desk with chair", 1400, 1200, 1100, "walnut", (w, d, h) => [...move(desk.parts(w, 0.55 * d, 750), 0, -0.22 * d), ...place(officeChair(600, 620, 1050, { seatC: "charcoal" }), 0, 0.22 * d, 180)].filter((p) => p.z + (p.h || 0) <= h + 1)),
  item("coatStand", "Bedroom", "Coat stand", 500, 500, 1800, "walnut", (w, d, h) => [C(0, 0, 0, w * 0.4, 25, "main", d * 0.4), C(0, 0, 25, 22, h - 60, "main", 22, { top: 0.8 }), S(0, 0, h - 25, 28, "main"), ...[0, 90, 180, 270].map((a) => T([[0, 0, h - 220], [Math.cos((a * Math.PI) / 180) * 160, Math.sin((a * Math.PI) / 180) * 160, h - 160]], 10, "main")), SB(0.25 * w, 0, h - 900, 60, 320, 650, "navy", 0.3, { plan: false })]),
  item("toyChest", "Kids", "Toy chest", 900, 450, 500, "white", (w, d, h) => [B(0, 0, 0, w, d, h - 40, "main", 10, { b: 4 }), B(0, -0.02 * d, h - 40, w + 10, d + 10, 40, "sage", 10, { b: 6 }), ...[-1, 1].map((s) => B(s * (w / 2), 0, h * 0.6, 20, 120, 30, "sage", 0, { plan: false }))]),
  item("playTable", "Kids", "Kids' play table set", 1100, 1100, 560, "white", (w, d, h) => [...table(600, 600, 480, { top: "round", legs: "taper", thick: 22, legC: "yellow" }), ...[0, 120, 240].flatMap((a) => { const t = (a * Math.PI) / 180; return place(woodChair(300, 300, 560).map((p) => ({ ...p, c: ["sage", "blush", "teal"][a / 120] })), Math.sin(t) * 380, -Math.cos(t) * 380, a); })]),
  item("rockingHorse", "Kids", "Rocking horse", 300, 900, 700, "oak", (w, d, h) => [
    ...[-1, 1].map((s) => T([[s * w * 0.4, -d / 2 + 30, 90], [s * w * 0.4, -d / 4, 15], [s * w * 0.4, d / 4, 15], [s * w * 0.4, d / 2 - 30, 90]], 14, "main", { smooth: true })),
    ...four(w * 0.8, d * 0.5, (x, y, a, b) => T([[x, y, 20], [x * 0.4, y * 0.7, 0.45 * h]], 16, "main")),
    S(0, -0.02 * d, 0.5 * h, 200, "main", { sx: 0.5, sz: 0.55, sy: 1.1 }), T([[0, 0.12 * d, 0.55 * h], [0, 0.25 * d, 0.85 * h]], 55, "main"), S(0, 0.32 * d, 0.86 * h, 90, "main", { sx: 0.55, sy: 1.3, sz: 0.65 }),
    S(0, 0.2 * d, 0.88 * h, 40, "darkwood", { sx: 0.4, sy: 2.2 }), SB(0, -0.04 * d, 0.6 * h, 140, 220, 40, "red", 0.3), T([[-60, 0.27 * d, 0.85 * h], [60, 0.27 * d, 0.85 * h]], 10, "black"),
  ]),
  item("teepee", "Kids", "Play tent (teepee)", 1200, 1200, 1700, "cream", (w, d, h) => [L(0, 0, 0, [[w * 0.48, 0], [w * 0.06, h * 0.82], [w * 0.05, h * 0.82], [w * 0.47, 0]], "main", { m: "fabric" }), ...[0, 72, 144, 216, 288].map((a) => T([[Math.cos((a * Math.PI) / 180) * w * 0.48, Math.sin((a * Math.PI) / 180) * d * 0.48, 0], [-Math.cos((a * Math.PI) / 180) * w * 0.06, -Math.sin((a * Math.PI) / 180) * d * 0.06, h]], 15, "oak")), SB(0, 0, 0, w * 0.6, d * 0.6, 60, "blush", 0.3, { plan: false })]),
  item("highChair", "Kids", "Baby high chair", 550, 600, 950, "white", (w, d, h) => [...four(w * 0.8, d * 0.8, (x, y, a, b) => taperLeg(x, y, 0, 18, 0.55 * h, "oak", 0.8, { ty: -a * 8, tx: b * 8 })), B(0, 0, 0.55 * h, w * 0.6, d * 0.55, 30, "main", 30), B(0, -0.2 * d, 0.55 * h, w * 0.6, 30, 0.45 * h, "main", 15, { tx: 6 }), B(0, 0.25 * d, 0.75 * h, w * 0.65, d * 0.35, 25, "main", 40), ...[-1, 1].map((s) => B(s * w * 0.3, 0, 0.58 * h, 25, d * 0.5, 0.2 * h, "main", 10))]),
  item("changingTable", "Kids", "Changing table", 900, 550, 950, "white", (w, d, h) => [...cabinet(w, d, h - 100, { fronts: "D,D,D", handle: "knob", plinth: 60 }), SB(0, 0.02 * d, h - 100, w - 60, d - 60, 80, "blush", 0.15), B(0, -d / 2 + 15, h - 100, w, 30, 100, "main"), ...[-1, 1].map((s) => B(s * (w / 2 - 15), 0, h - 100, 30, d, 100, "main"))]),
  item("kidsBookcase", "Kids", "Kids' front-facing bookcase", 800, 300, 900, "white", (w, d, h) => [...[-1, 1].map((s) => B(s * (w / 2 - 12), 0, 0, 24, d, h, "main")), ...[0.05, 0.38, 0.71].flatMap((k, i) => [B(0, 0.25 * d, k * h, w - 24, 0.4 * d, 20, "main"), B(0, 0.42 * d, k * h + 20, w - 24, 14, 90, "main"), ...books(-w / 2 + 30, w / 2 - 30, -0.05 * d, k * h + 30, 0.28 * h, 18, 100 + i, 1).map((p) => ({ ...p, w: p.w * 6, x: p.x, tx: -12 })).filter((p, j) => j % 6 === 0)]), B(0, -d / 2 + 8, 0, w, 16, h, "main")]),
  kidsDesk,
  item("toyBlocks", "Kids", "Toy blocks", 400, 400, 200, "yellow", (w, d, h) => { const r = rng(12), out = []; const cs = ["red", "yellow", "blue", "leaf3", "orange"]; for (let i = 0; i < 12; i++) out.push(B((r() - 0.5) * (w - 80), (r() - 0.5) * (d - 80), i > 8 ? 70 : 0, 70, 70, 70, cs[i % 5], 6, { tz: r() * 40, m: "gloss" })); return out; }),
];
