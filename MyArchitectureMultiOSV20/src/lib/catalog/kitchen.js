// Kitchen: base and wall cabinets, sinks, cooking, refrigerators, appliances and worktop accessories.
import { B, C, S, L, E, T, R, G, SB, item, variant, cabinet, move, smoothProfile, rrect, four, taperLeg, leaves, pot, clamp } from "./common.js";

// Worktop with a hole for a sink of sw × sd centred at sx (pieces round it).
function worktopWithHole(w, d, z, t, sx, sw, sd, c = "granite") {
  const y0 = 0.03 * d, by = -d / 2, fy = d / 2;
  const hy1 = y0 - sd / 2, hy2 = y0 + sd / 2;
  return [
    B((-w / 2 + sx - sw / 2) / 2, 0, z, sx - sw / 2 + w / 2, d, t, c, 2),
    B((w / 2 + sx + sw / 2) / 2, 0, z, w / 2 - sx - sw / 2, d, t, c, 2),
    B(sx, (by + hy1) / 2, z, sw, hy1 - by, t, c, 0),
    B(sx, (fy + hy2) / 2, z, sw, fy - hy2, t, c, 0),
  ];
}
// An undermount steel sink bowl at (x, y) with top at z.
function sinkBowl(x, y, z, sw, sd, depth = 190) {
  return [
    B(x, y, z - depth, sw, sd, 12, "steel", 30, { plan: false }),
    ...[-1, 1].map((s) => B(x + s * (sw / 2 - 4), y, z - depth, 8, sd, depth, "steel", 0, { plan: false })),
    ...[-1, 1].map((s) => B(x, y + s * (sd / 2 - 4), z - depth, sw, 8, depth, "steel", 0, { plan: false })),
    C(x, y + sd * 0.2, z - depth + 12, 30, 2, "dark", 30, { plan: false }),
  ];
}
// Gooseneck faucet at (x, y) on a worktop at z.
const faucet = (x, y, z, k = 1) => [
  C(x, y, z, 28 * k, 40, "chrome"),
  T([[x, y, z + 40], [x, y, z + 300 * k], [x, y + 60 * k, z + 360 * k], [x, y + 170 * k, z + 330 * k], [x, y + 200 * k, z + 250 * k]], 13 * k, "chrome", { smooth: true }),
  T([[x + 30 * k, y, z + 120 * k], [x + 80 * k, y, z + 140 * k]], 8 * k, "chrome"),
];
// Burner rings of a hob (n = 4 or 5) on a top at z inside w × d.
const burners = (cx, cy, z, w, d, gas = false) => [[-0.25, -0.22, 1], [0.25, -0.22, 0.8], [-0.25, 0.22, 0.8], [0.25, 0.22, 1]].flatMap(([u, v, k]) => gas
  ? [C(cx + u * w, cy + v * d, z, 48 * k, 22, "black", 48 * k, { plan: false }), R(cx + u * w, cy + v * d, z + 26, 80 * k, 6, "black", { plan: false }), ...[0, 60, 120].map((a) => B(cx + u * w, cy + v * d, z + 20, 190 * k, 10, 10, "black", 0, { tz: a, plan: false }))]
  : [R(cx + u * w, cy + v * d, z + 1, 85 * k, 2.5, "grey", { plan: false })]);

const counter = item("counter", "Kitchen", "Kitchen counter", 2400, 600, 900, "white", (w, d, h) => [
  ...cabinet(w, d, h, { fronts: "D".repeat(Math.max(2, Math.round(w / 600))) + "," + "d".repeat(Math.max(2, Math.round(w / 600))), handle: "bar", plinth: 100, top: "granite", topT: 30 }),
  B(0, -d / 2 + 6, h, w, 12, 0.6 * h, "white", 0, { m: "ceramic", plan: false }),
  // Wall cabinets above (part of the counter run).
  ...move(cabinet(w, 0.35 * d * 1.65, 0.75 * h, { fronts: "d".repeat(Math.max(2, Math.round(w / 600))), handle: "bar", upper: true }), 0, -d / 2 + 0.29 * d, h + 0.6 * h),
], { tags: "base cabinets worktop" });

const sinkCounter = item("sinkCounter", "Kitchen", "Sink counter", 1200, 600, 900, "white", (w, d, h) => {
  const sw = Math.min(760, w * 0.6), sd = 0.72 * d;
  return [
    ...cabinet(w, d, h - 30, { fronts: "dd", handle: "bar", plinth: 100 }),
    ...worktopWithHole(w, d, h - 30, 30, 0, sw, sd),
    ...sinkBowl(0, 0.03 * d, h - 30, sw, sd),
    ...faucet(0, -d / 2 + 70, h),
  ];
});
const doubleSink = item("sinkDouble", "Kitchen", "Double-bowl sink counter", 1500, 600, 900, "oak", (w, d, h) => {
  const sw = 420, sd = 0.7 * d;
  return [
    ...cabinet(w, d, h - 30, { fronts: "ddd", handle: "groove", plinth: 100 }),
    ...worktopWithHole(w, d, h - 30, 30, -sw / 2 - 15, sw, sd, "marble").filter((p, i) => i !== 1),
    ...worktopWithHole(w, d, h - 30, 30, sw / 2 + 15, sw, sd, "marble").filter((p, i) => i !== 0),
    B(0, 0.03 * d, h - 30, 30, sd, 30, "marble", 0, { plan: false }),
    ...sinkBowl(-sw / 2 - 15, 0.03 * d, h - 30, sw, sd), ...sinkBowl(sw / 2 + 15, 0.03 * d, h - 30, sw, sd),
    ...faucet(0, -d / 2 + 70, h),
  ];
});
const stove = item("stove", "Kitchen", "Cooktop", 600, 600, 900, "white", (w, d, h) => [
  B(0, 0, 0, w, d - 20, h - 20, "main", 4),
  B(0, 0, h - 20, w, d, 20, "black", 6, { m: "screen" }),
  ...burners(0, 0, h, w, d),
  B(0, d / 2 - 8, 0.25 * h, w - 30, 16, 0.5 * h, "black", 0, { m: "screen", plan: false }),
  T([[-w * 0.35, d / 2, 0.71 * h], [-w * 0.35, d / 2 + 18, 0.71 * h], [w * 0.35, d / 2 + 18, 0.71 * h], [w * 0.35, d / 2, 0.71 * h]], 9, "steel", { plan: false }),
  ...[-0.33, -0.11, 0.11, 0.33].map((k) => C(k * w, d / 2 - 10, 0.82 * h, 16, 25, "steel", 16, { tx: -90, plan: false })),
  B(0, d / 2 - 10, 0.05 * h, w - 30, 20, 0.17 * h, "main", 0, { plan: false }),
], { tags: "range oven hob" });
const rangeGas = item("rangeGas", "Kitchen", "Gas range (5 burners)", 900, 650, 920, "steel", (w, d, h) => [
  B(0, 0, 0, w, d - 30, h - 25, "main", 4),
  B(0, 0, h - 25, w, d, 25, "black", 4),
  ...burners(0, 0, h, w, d, true), C(0, 0, h, 60, 22, "black", 60, { plan: false }),
  B(0, d / 2 - 10, 0.12 * h, w - 30, 20, 0.62 * h, "main", 0, { plan: false }), B(0, d / 2, 0.3 * h, w * 0.6, 4, 0.3 * h, "glass", 0, { plan: false }),
  T([[-w * 0.4, d / 2 - 15, 0.76 * h], [-w * 0.4, d / 2 + 20, 0.76 * h], [w * 0.4, d / 2 + 20, 0.76 * h], [w * 0.4, d / 2 - 15, 0.76 * h]], 11, "chrome", { plan: false }),
  ...[-0.38, -0.19, 0, 0.19, 0.38].map((k) => C(k * w, d / 2 - 15, 0.86 * h, 22, 30, "black", 22, { tx: -90, plan: false })),
]);
const fridge = item("fridge", "Kitchen", "Refrigerator", 700, 700, 1800, "white", (w, d, h) => [
  B(0, -0.03 * d, 0, w, d * 0.94, h, "main", 20, { b: 6 }),
  B(0, d / 2 - 30, 40, w - 6, 50, 0.36 * h - 44, "main", 10, { b: 6, plan: false }), B(0, d / 2 - 30, 0.36 * h, w - 6, 50, 0.64 * h - 4, "main", 10, { b: 6, plan: false }),
  T([[w / 2 - 60, d / 2, 0.42 * h], [w / 2 - 60, d / 2 + 30, 0.42 * h], [w / 2 - 60, d / 2 + 30, 0.62 * h], [w / 2 - 60, d / 2, 0.62 * h]], 10, "steel", { plan: false }),
  T([[w / 2 - 60, d / 2, 0.16 * h], [w / 2 - 60, d / 2 + 30, 0.16 * h], [w / 2 - 60, d / 2 + 30, 0.3 * h], [w / 2 - 60, d / 2, 0.3 * h]], 10, "steel", { plan: false }),
], { tags: "fridge freezer" });
const fridgeFrench = item("fridgeFrench", "Kitchen", "French-door refrigerator", 910, 750, 1780, "steel", (w, d, h) => [
  B(0, -0.03 * d, 0, w, d * 0.94, h, "main", 15, { b: 5, m: "metal" }),
  ...[-1, 1].map((s) => B((s * w) / 4, d / 2 - 30, 0.36 * h, w / 2 - 6, 50, 0.64 * h - 4, "main", 8, { b: 5, m: "metal", plan: false })),
  B(0, d / 2 - 30, 30, w - 6, 50, 0.34 * h, "main", 8, { b: 5, m: "metal", plan: false }),
  ...[-1, 1].map((s) => T([[s * 50, d / 2, 0.45 * h], [s * 50, d / 2 + 40, 0.47 * h], [s * 50, d / 2 + 40, 0.88 * h], [s * 50, d / 2, 0.9 * h]], 12, "chrome", { plan: false })),
  T([[-w * 0.35, d / 2, 0.3 * h], [-w * 0.35, d / 2 + 40, 0.3 * h], [w * 0.35, d / 2 + 40, 0.3 * h], [w * 0.35, d / 2, 0.3 * h]], 12, "chrome", { plan: false }),
  B(-w / 4, d / 2 + 2, 0.6 * h, 180, 6, 260, "black", 6, { m: "screen", plan: false }),
]);
const fridgeSide = variant(fridgeFrench, "fridgeSideBySide", "Side-by-side refrigerator", { color: "black", w: 910, parts: (w, d, h) => [
  B(0, -0.03 * d, 0, w, d * 0.94, h, "main", 15, { b: 5, m: "metal" }),
  ...[-1, 1].map((s) => B((s * w) / 4, d / 2 - 30, 30, w / 2 - 6, 50, h - 34, "main", 8, { b: 5, m: "metal", plan: false })),
  ...[-1, 1].map((s) => T([[s * 50, d / 2, 0.3 * h], [s * 50, d / 2 + 40, 0.32 * h], [s * 50, d / 2 + 40, 0.82 * h], [s * 50, d / 2, 0.84 * h]], 12, "chrome", { plan: false })),
  B(-w / 4, d / 2 + 2, 0.5 * h, 200, 10, 320, "dark", 10, { plan: false }),
] });
const island = item("island", "Kitchen", "Kitchen island", 1800, 900, 900, "white", (w, d, h) => [
  ...move(cabinet(w - 100, d - 300, h - 40, { fronts: "DDD,ddd", handle: "bar", plinth: 100 }), 0, -150),
  B(0, 0, h - 40, w, d, 40, "marble", 4, { b: 3 }),
  B(0, d / 2 - 160, 100, w - 100, 20, h - 140, "main", 0, { plan: false }),
]);
const islandWaterfall = item("islandWaterfall", "Kitchen", "Waterfall island with seating", 2400, 1000, 920, "walnut", (w, d, h) => [
  ...move(cabinet(w - 100, d - 330, h - 50, { fronts: "dDDd", handle: "groove", plinth: 100 }), 0, -165),
  B(0, 0, h - 50, w, d, 50, "marble", 0),
  ...[-1, 1].map((s) => B(s * (w / 2 - 25), 0, 0, 50, d, h - 50, "marble", 0)),
  ...burners(-w * 0.15, -0.12 * d, h, 600, 520),
  B(-w * 0.15, -0.12 * d, h, 600, 520, 3, "black", 6, { m: "screen", plan: false }),
]);
const dishwasher = item("dishwasher", "Kitchen", "Dishwasher", 600, 600, 850, "metal", (w, d, h) => [B(0, -0.02 * d, 0, w, d * 0.96, h, "main", 3), B(0, d / 2 - 12, 90, w - 6, 24, h - 94, "main", 4, { plan: false }), B(0, d / 2 + 1, h - 70, w - 40, 4, 40, "black", 0, { m: "screen", plan: false }), T([[-w * 0.35, d / 2, h - 110], [-w * 0.35, d / 2 + 25, h - 110], [w * 0.35, d / 2 + 25, h - 110], [w * 0.35, d / 2, h - 110]], 8, "chrome", { plan: false })]);
const pantry = item("pantry", "Kitchen", "Tall pantry cabinet", 600, 600, 2100, "white", (w, d, h) => cabinet(w, d, h, { fronts: "d,d", handle: "bar", plinth: 100 }));
const ovenTower = item("ovenTower", "Kitchen", "Oven tower (two ovens)", 600, 600, 2100, "white", (w, d, h) => [
  ...cabinet(w, d, h, { fronts: "d,s,s,D", handle: "bar", plinth: 100 }),
  ...[0.5, 0.31].map((k) => T([[-w * 0.35, d / 2 + 2, k * h + 0.16 * h], [-w * 0.35, d / 2 + 25, k * h + 0.16 * h], [w * 0.35, d / 2 + 25, k * h + 0.16 * h], [w * 0.35, d / 2 + 2, k * h + 0.16 * h]], 8, "chrome", { plan: false })),
]);
const upperCabinet = item("upperCabinet", "Kitchen", "Wall cabinets", 2400, 350, 700, "white", (w, d, h) => cabinet(w, d, h, { fronts: "d".repeat(Math.max(2, Math.round(w / 600))), handle: "bar", upper: true }), { mount: "wall", elev: 1500 });
const upperGlass = variant(upperCabinet, "upperGlass", "Wall cabinets with glass doors", { color: "oak", w: 1200, parts: (w, d, h) => cabinet(w, d, h, { fronts: "g".repeat(Math.max(2, Math.round(w / 600))), handle: "knob", upper: true }) });
const openShelves = item("kitchenShelves", "Kitchen", "Open kitchen shelves", 1200, 280, 700, "oak", (w, d, h) => [
  ...[0, 0.5].map((k) => B(0, 0, k * h, w, d, 35, "main", 0)),
  ...[0, 1, 2, 3].map((i) => L(-w / 2 + 120 + i * 90, 0, 35, [[0, 0], [70, 0], [85, 20], [85, 180], [80, 180], [65, 20], [0, 18]], "white")),
  ...[0, 1, 2].map((i) => L(w * 0.15 + i * 140, 0, 35, [[0, 0], [45, 0], [55, 100], [45, 150], [40, 160], [0, 160]], ["glass", "terracotta", "white"][i])),
  ...[0, 1, 2, 3, 4].map((i) => L(-w / 2 + 150 + i * 200, 0, h * 0.5 + 35, [[0, 0], [40, 0], [45, 90], [43, 90], [36, 2], [0, 2]], i % 2 ? "white" : "glass")),
], { mount: "wall", elev: 1450 });
const rangeHood = item("rangeHood", "Kitchen", "Range hood", 900, 500, 900, "metal", (w, d, h) => [
  E(0, 0, 0, [[-d / 2, 0], [d / 2, 0], [d / 2, 60], [-d / 2 + 260, 0.35 * h], [-d / 2, 0.35 * h]], w, "main", { axis: "x", b: 3 }),
  B(0, -d / 2 + 140, 0.35 * h, 0.32 * w, 260, 0.65 * h, "main", 2),
  B(0, 0, -2, w - 60, d - 60, 4, "grey", 0, { plan: false }),
  G(C(-w * 0.3, d * 0.2, -4, 25, 4, "bulb", 25, { plan: false }), 1), G(C(w * 0.3, d * 0.2, -4, 25, 4, "bulb", 25, { plan: false }), 1),
], { mount: "wall", elev: 1500, tags: "extractor chimney" });
const microwave = item("microwave", "Kitchen", "Microwave", 480, 380, 290, "black", (w, d, h) => [B(0, 0, 10, w, d, h - 10, "main", 8, { b: 4 }), B(-w * 0.12, d / 2, 40, w * 0.62, 4, h - 80, "screen", 4, { plan: false }), B(w * 0.36, d / 2, 40, w * 0.18, 4, h - 80, "dark", 4, { plan: false }), ...four(w - 60, d - 60, (x, y) => C(x, y, 0, 15, 10, "rubber"))]);
const coffeeMachine = item("coffeeMachine", "Kitchen", "Espresso machine", 300, 400, 380, "steel", (w, d, h) => [B(0, -0.15 * d, 0, w, d * 0.7, h, "main", 20, { b: 6, m: "chrome" }), B(0, 0.2 * d, 0, w, d * 0.6, 30, "black", 10), B(0, 0.25 * d, h * 0.6, w * 0.7, d * 0.5, h * 0.4 - 20, "main", 12, { b: 5, m: "chrome" }), C(0, 0.2 * d, 30, 40, 85, "white", 40, { m: "ceramic" }), C(0, 0.25 * d, h * 0.5, 30, 70, "black"), T([[w * 0.3, 0.3 * d, h * 0.75], [w * 0.42, 0.45 * d, h * 0.62]], 6, "chrome")]);
const kettle = item("kettle", "Kitchen", "Kettle", 220, 180, 250, "steel", (w, d, h) => [C(0, 0, 0, w * 0.42, 15, "black", d * 0.45), L(0, 0, 15, smoothProfile([[w * 0.38, 0], [w * 0.4, 0.4 * h], [w * 0.3, 0.8 * h], [w * 0.15, 0.92 * h], [0, 0.92 * h]], 3), "main", { m: "chrome" }), T([[-w * 0.3, 0, 0.3 * h], [-w * 0.48, 0, 0.55 * h], [-w * 0.3, 0, 0.9 * h]], 12, "black", { smooth: true }), T([[w * 0.32, 0, 0.35 * h], [w * 0.48, 0, 0.7 * h]], 12, "main", { m: "chrome" })]);
const toaster = item("toaster", "Kitchen", "Toaster", 300, 180, 200, "red", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 40, { b: 20 }), B(0, -d * 0.18, h - 2, w * 0.7, 25, 4, "black", 0, { plan: false }), B(0, d * 0.18, h - 2, w * 0.7, 25, 4, "black", 0, { plan: false }), B(w / 2, 0, h * 0.5, 15, 30, 20, "chrome", 0, { plan: false })]);
const mixer = item("standMixer", "Kitchen", "Stand mixer", 240, 360, 360, "teal", (w, d, h) => [B(0, 0.05 * d, 0, w, d * 0.8, 50, "main", 40, { b: 15, m: "gloss" }), B(0, -d * 0.3, 0, w * 0.7, 110, h * 0.7, "main", 40, { b: 20, m: "gloss" }), SB(0, 0.02 * d, h * 0.62, w * 0.8, d * 0.9, h * 0.3, "main", 0.45, { m: "gloss" }), L(0, 0.15 * d, 50, smoothProfile([[45, 0], [90, 60], [100, 140], [102, 150], [0, 150]], 3), "steel")]);
const fruitBowl = item("fruitBowl", "Kitchen", "Fruit bowl", 320, 320, 160, "walnut", (w, d, h) => [L(0, 0, 0, smoothProfile([[w * 0.2, 0], [w * 0.38, 0.4 * h], [w * 0.5, 0.75 * h], [w * 0.48, 0.75 * h], [w * 0.36, 0.38 * h], [0, 0.15 * h]], 3), "main"), ...[[0, 0, "orange"], [-55, 30, "red"], [50, 35, "yellow"], [10, -55, "leaf3"], [-40, -30, "red"]].map(([x, y, c]) => S(x * (w / 320), y * (d / 320), 0.45 * h, 0.17 * w, c, { m: "plastic", plan: false }))]);
const herbs = item("herbPots", "Kitchen", "Herb pots (3)", 450, 150, 300, "terracotta", (w, d, h) => [-1, 0, 1].flatMap((k, i) => [...pot(k * w * 0.33, 0, 60, 130, "main"), ...leaves(k * w * 0.33, 0, 120, 10, 160, 45, 55, i + 3, ["leaf", "leaf3", "leaf2"][i])]).map((p) => (p.t === "sph" ? { ...p, plan: false } : p)));
const wineCooler = item("wineCooler", "Kitchen", "Wine cooler", 600, 580, 820, "black", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 4), B(0, d / 2, 40, w - 30, 6, h - 60, "glass", 2, { plan: false }), ...[0.2, 0.4, 0.6, 0.8].flatMap((k) => [-0.3, -0.1, 0.1, 0.3].map((u) => C(u * w, -d * 0.3, k * h, 36, d * 0.6, "leaf2", 36, { tx: -90, m: "glass", plan: false }))), G(B(0, 0, h - 30, w - 60, d - 60, 4, "bulb", 0, { plan: false }), 0.5)]);
const chestFreezer = item("chestFreezer", "Kitchen", "Chest freezer", 1100, 650, 850, "white", (w, d, h) => [B(0, 0, 0, w, d, h - 60, "main", 20, { b: 6 }), B(0, 0, h - 60, w, d, 60, "main", 20, { b: 10 }), B(0, d / 2, h - 110, 200, 30, 30, "dark", 6, { plan: false })]);
const kitchenLine = item("kitchenLine", "Kitchen", "Complete kitchen (straight, 3.6 m)", 3600, 650, 2300, "white", (w, d, h) => {
  const H = 900;
  const run = (x0, x1, f) => { const ww = x1 - x0; return move(f(ww), (x0 + x1) / 2, 0); };
  const base = d - 50;
  return [
    ...run(-w / 2, -w / 2 + 700, (ww) => fridgeFrench.parts(ww, base + 40, 1850).map((p) => ({ ...p, c: p.c === "main" ? "steel" : p.c }))).map((p) => ({ ...p, y: p.y + 0 })),
    ...run(-w / 2 + 700, -w / 2 + 1300, (ww) => [...cabinet(ww, base, H - 30, { fronts: "DDD", handle: "bar", plinth: 100 }), B(0, 0, H - 30, ww, base, 30, "granite", 0)]),
    ...run(-w / 2 + 1300, -w / 2 + 2200, (ww) => [...cabinet(ww, base, H - 30, { fronts: "dd", handle: "bar", plinth: 100 }), ...worktopWithHole(ww, base, H - 30, 30, 0, 700, 0.7 * base), ...sinkBowl(0, 0.03 * base, H - 30, 700, 0.7 * base), ...faucet(0, -base / 2 + 70, H)]),
    ...run(-w / 2 + 2200, -w / 2 + 2800, (ww) => dishwasher.parts(ww, base, H - 30).concat([B(0, 0, H - 30, ww, base, 30, "granite", 0)])),
    ...run(-w / 2 + 2800, w / 2, (ww) => [...cabinet(ww, base, H - 30, { fronts: "s,D", handle: "bar", plinth: 100 }), B(0, 0, H - 30, ww, base, 30, "black", 0, { m: "screen" }), ...burners(0, 0, H, ww, base)]),
    B(w * 0.1, -d / 2 + 6, H, w * 0.8, 12, 600, "white", 0, { m: "ceramic", plan: false }),
    ...move(cabinet(w - 700 - 800, 350, 700, { fronts: "dddd", handle: "bar", upper: true }), (-w / 2 + 700 + w / 2 - 800) / 2, -d / 2 + 175, 1500),
    ...move(rangeHood.parts(800, 480, 800), w / 2 - 400, -d / 2 + 240, 1500),
  ];
}, { tags: "kitchen set" });

export default [
  counter, sinkCounter, doubleSink, stove, rangeGas,
  item("cooktopIsland", "Kitchen", "Induction hob counter", 900, 600, 900, "oak", (w, d, h) => [...cabinet(w, d, h - 30, { fronts: "D,D,D", handle: "groove", plinth: 100 }), B(0, 0, h - 30, w, d, 30, "marble", 2), B(0, 0, h, 0.8 * w, 0.85 * d, 5, "black", 6, { m: "screen" }), ...burners(0, 0, h + 5, 0.8 * w, 0.85 * d)]),
  fridge, variant(fridge, "fridgeSteel", "Refrigerator, stainless", { color: "steel" }), fridgeFrench, fridgeSide, island, islandWaterfall, dishwasher, pantry, ovenTower,
  upperCabinet, upperGlass, openShelves, rangeHood, kitchenLine,
  microwave, coffeeMachine, kettle, toaster, mixer, fruitBowl, herbs, wineCooler, chestFreezer,
];
