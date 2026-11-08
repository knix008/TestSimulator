// Bathroom and laundry: toilets, basins, vanities, baths, showers, radiators, mirrors, washers.
import { B, C, S, L, E, T, R, G, SB, item, variant, cabinet, move, smoothProfile, four, taperLeg, ellipsePts, rrect } from "./common.js";

const tap = (x, y, z, k = 1) => [C(x, y, z, 25 * k, 30 * k, "chrome"), T([[x, y, z + 30 * k], [x, y, z + 150 * k], [x, y + 110 * k, z + 150 * k], [x, y + 120 * k, z + 120 * k]], 11 * k, "chrome"), T([[x, y - 10, z + 110 * k], [x, y - 70 * k, z + 140 * k]], 7 * k, "chrome")];
// A wash basin bowl (turned shell) with its rim at z.
const basin = (x, y, z, rx, ry, depth, c = "ceramic") => L(x, y, z - depth, smoothProfile([[0, 0], [rx * 0.55, 0], [rx * 0.85, depth * 0.35], [rx, depth], [rx - 10, depth], [rx * 0.82, depth * 0.4], [rx * 0.5, 10], [0, 10]], 3), c, { sy: ry / rx });

const toilet = item("toilet", "Bathroom", "Toilet", 400, 700, 800, "ceramic", (w, d, h) => [
  // Close-coupled toilet: pedestal, bowl, seat and lid, cistern with a push button.
  L(0, 0.12 * d, 0, smoothProfile([[w * 0.28, 0], [w * 0.25, 0.25 * h], [w * 0.33, 0.42 * h], [w * 0.47, 0.5 * h], [w * 0.45, 0.5 * h], [w * 0.3, 0.36 * h], [0, 0.3 * h]], 3), "main", { sy: (0.34 * d) / (0.47 * w) }),
  E(0, 0.12 * d, 0.5 * h, ellipsePts(0, 0, w * 0.48, 0.35 * d, 32).filter(() => true), 25, "white", { b: 8 }),
  B(0, -0.12 * d, 0.5 * h, w * 0.5, 0.18 * d, 0.03 * h, "white", 6, { plan: false }),
  SB(0, -0.36 * d, 0.5 * h, w, 0.26 * d, 0.5 * h, "main", 0.2),
  C(0, -0.36 * d, h - 3, 25, 4, "chrome", 25, { plan: false }),
]);
const toiletWall = item("toiletWallHung", "Bathroom", "Wall-hung toilet", 360, 540, 400, "ceramic", (w, d, h) => [
  // Side profile of the bowl, hung on the wall (the cistern is in the wall: a flush plate above).
  E(0, 0, 0, [[-d / 2, 0.05 * h], [-d / 2 + 160, 0], [d / 2 - 120, 0.2 * h], [d / 2 - 10, 0.55 * h], [d / 2, h - 40], [-d / 2, h - 40]], w * 0.92, "main", { axis: "x", b: 40 }),
  E(0, 0.04 * d, h - 40, ellipsePts(0, 0.05 * d, w * 0.5, d * 0.45, 32), 22, "white", { b: 8 }),
  E(0, 0.04 * d, h - 18, ellipsePts(0, 0.05 * d, w * 0.48, d * 0.43, 32), 18, "white", { b: 7, plan: false }),
], { mount: "wall", elev: 400 });
const bidet = item("bidet", "Bathroom", "Bidet", 380, 560, 400, "ceramic", (w, d, h) => [L(0, 0.05 * d, 0, smoothProfile([[w * 0.3, 0], [w * 0.28, 0.4 * h], [w * 0.5, h], [w * 0.47, h], [w * 0.35, 0.6 * h], [0, 0.5 * h]], 3), "main", { sy: (0.45 * d) / (0.5 * w) }), ...tap(0, -0.32 * d, h, 0.7)]);
const washbasin = item("washbasin", "Bathroom", "Washbasin", 600, 450, 850, "ceramic", (w, d, h) => [
  // Pedestal basin.
  L(0, -0.1 * d, 0, smoothProfile([[w * 0.16, 0], [w * 0.12, 0.3 * h], [w * 0.12, 0.6 * h], [w * 0.2, 0.75 * h], [0, 0.75 * h]], 3), "main"),
  E(0, 0, h - 150, [...rrect(0, 0, w, d, 80)], 150, "main", { b: 20 }),
  basin(0, 0.05 * d, h + 1, w * 0.36, d * 0.33, 120, "white"),
  ...tap(0, -0.38 * d, h, 0.9),
]);
const vanity = item("vanity", "Bathroom", "Vanity with vessel basin", 900, 500, 1000, "oak", (w, d, h) => [
  ...cabinet(w, d, 800, { fronts: "DD,dd", handle: "groove", legs: true, legC: "black", top: "marble", topT: 20 }),
  L(0, 0.05 * d, 800, smoothProfile([[0, 0], [w * 0.18, 0], [w * 0.22, 0.4 * (h - 800)], [w * 0.22, h - 800 - 5], [w * 0.2, h - 800], [w * 0.17, 20], [0, 15]], 3), "ceramic"),
  C(0, -d / 2 + 40, 820, 22, h - 840, "black"), T([[0, -d / 2 + 40, h - 25], [0, -d / 2 + 150, h - 25]], 10, "black"),
]);
const vanity2 = item("vanity2", "Bathroom", "Double vanity", 1600, 550, 1050, "lightwood", (w, d, h) => {
  const out = [...cabinet(w, d, 850 - 20, { fronts: "DDDD,dddd", handle: "bar", plinth: 0 }).map((p) => ({ ...p, z: p.z + 0 }))];
  out.push(B(0, 0, 830, w, d, 20, "marble"));
  for (const s of [-1, 1]) { out.push(basin(s * w * 0.25, 0.05 * d, 851, 210, 170, 140, "white"), ...tap(s * w * 0.25, -d / 2 + 60, 850, 1)); }
  return out.filter((p) => true);
});
const bathtub = item("bathtub", "Bathroom", "Bathtub", 1700, 750, 550, "ceramic", (w, d, h) => [
  // Built-in tub: panel sides, rim, and the bowl inside.
  B(0, -d / 2 + 30, 0, w, 60, h, "main", 0), B(0, d / 2 - 30, 0, w, 60, h, "main", 0), B(-w / 2 + 40, 0, 0, 80, d - 120, h, "main", 0), B(w / 2 - 40, 0, 0, 80, d - 120, h, "main", 0),
  L(0, 0, 40, smoothProfile([[0, 0], [w * 0.36, 0], [w * 0.43, (h - 40) * 0.6], [w * 0.455, h - 40]], 3), "main", { sy: (d - 120) / (w * 0.91) }),
  ...tap(-w / 2 + 40, 0, h, 1).map((p) => ({ ...p, tz: -90 })),
]);
const bathFree = item("bathFreestanding", "Bathroom", "Freestanding bath", 1700, 800, 600, "ceramic", (w, d, h) => [L(0, 0, 0, smoothProfile([[w * 0.36, 0], [w * 0.38, 40], [w * 0.47, h * 0.75], [w * 0.5, h], [w * 0.48, h], [w * 0.44, h * 0.6], [w * 0.36, 60], [0, 60]], 3), "main", { sy: d / w, seg: 40 }), ...four(w * 0.7, d * 0.55, (x, y) => S(x, y, 25, 30, "brass", { sz: 0.9 }))]);
const shower = item("shower", "Bathroom", "Shower", 900, 900, 2000, "glass", (w, d, h) => [
  B(0, 0, 0, w, d, 50, "white", 20, { b: 6, m: "ceramic" }),
  B(-w / 2 + 5, 0, 50, 10, d, h - 50, "main", 0), B(0, d / 2 - 5, 50, w, 10, h - 50, "main", 0),
  T([[-w / 2 + 5, d / 2 - 5, 50], [-w / 2 + 5, d / 2 - 5, h]], 12, "chrome"), T([[-w / 2 + 5, -d / 2 + 5, h - 20], [-w / 2 + 5, d / 2 - 5, h - 20], [w / 2 - 5, d / 2 - 5, h - 20]], 10, "chrome"),
  C(w * 0.15, -d * 0.25, h - 160, 120, 12, "chrome"), T([[w * 0.15, -d / 2 + 10, h - 140], [w * 0.15, -d * 0.25, h - 140]], 10, "chrome"),
  C(w * 0.15, -d / 2 + 20, 1000, 40, 70, "chrome", 40, { tx: -90 }), C(0, 0, 50, 40, 3, "steel", 40, { plan: false }),
]);
const showerWalk = item("showerWalkIn", "Bathroom", "Walk-in shower with rain head", 1400, 900, 2100, "white", (w, d, h) => [
  B(0, 0, 0, w, d, 30, "concrete", 0), B(w * 0.2, d / 2 - 5, 30, w * 0.6, 10, h - 30, "glass", 0), T([[-w * 0.1, d / 2 - 5, h - 15], [w / 2, d / 2 - 5, h - 15]], 8, "black"),
  T([[-w * 0.2, -d / 2 + 20, h - 100], [-w * 0.2, -d / 2 + 20, h - 60], [-w * 0.2, -d * 0.1, h - 60]], 12, "black"), C(-w * 0.2, -d * 0.1, h - 80, 150, 15, "black"),
  T([[-w * 0.2, -d / 2 + 20, 600], [-w * 0.2, -d / 2 + 20, h - 100]], 12, "black"), B(-w * 0.2, -d / 2 + 30, 1000, 90, 30, 160, "black", 10),
  B(0, 0, 30, w * 0.6, 60, 3, "steel", 0, { plan: false }), B(w * 0.3, -d / 2 + 60, 30, 300, 120, 400, "white", 8, { m: "ceramic" }),
]);
const towelRad = item("towelRadiator", "Bathroom", "Heated towel rail", 500, 100, 1200, "chrome", (w, d, h) => [...[-1, 1].map((s) => T([[s * (w / 2 - 20), 0, 0], [s * (w / 2 - 20), 0, h]], 18, "main")), ...Array.from({ length: 12 }, (_, i) => T([[-w / 2 + 20, 0, 80 + i * ((h - 140) / 11)], [w / 2 - 20, 0, 80 + i * ((h - 140) / 11)]], 9, "main", { plan: false })), SB(0, 25, h * 0.42, w - 60, 40, h * 0.45, "cream", 0.3, { plan: false })], { mount: "wall", elev: 200 });
const mirror = item("mirror", "Bathroom", "Wall mirror", 600, 30, 900, "dark", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 30, { b: 4 }), B(0, d / 2, 25, w - 50, 2, h - 50, "mirror", 20, { plan: false })], { mount: "wall", elev: 1000 });
const mirrorCab = item("mirrorCabinet", "Bathroom", "Mirror cabinet with light", 800, 150, 700, "white", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 4), ...[-1, 1].map((s) => B((s * w) / 4, d / 2, 10, w / 2 - 4, 4, h - 20, "mirror", 0, { plan: false })), G(B(0, d / 2, -25, w - 40, d - 20, 25, "bulb", 0, { plan: false }), 0.8)], { mount: "wall", elev: 1150, light: { type: "point", lumens: 600, at: (w, d, h) => [0, 0, 0] } });
const urinal = item("urinal", "Bathroom", "Urinal", 400, 350, 1200, "ceramic", (w, d, h) => [L(0, -0.05 * d, 0.45 * h, smoothProfile([[w * 0.2, 0], [w * 0.45, 0.1 * h], [w * 0.48, 0.45 * h], [w * 0.42, 0.55 * h], [w * 0.38, 0.55 * h], [w * 0.4, 0.15 * h], [0, 0.08 * h]], 3), "main", { sy: (0.85 * d) / (0.96 * w) }), C(0, -d / 2 + 30, h - 120, 20, 120, "chrome")], { tags: "toilet" });
const cubicle = item("toiletCubicle", "Bathroom", "Toilet cubicle", 1000, 1600, 2000, "fabric2", (w, d, h) => [
  ...[-1, 1].map((s) => B(s * (w / 2 - 12), 0, 150, 25, d, h - 150, "main", 4, { m: "plastic" })),
  B(0.1 * w, d / 2 - 12, 150, w * 0.75, 25, h - 150, "main", 4, { m: "plastic" }), B(-w * 0.38, d / 2 - 12, 150, w * 0.2, 25, h - 150, "main", 0, { m: "plastic" }),
  ...[-1, 1].map((s) => C(s * (w / 2 - 12), d / 2 - 12, 0, 20, 150, "steel")), T([[-w / 2, d / 2 - 12, h], [w / 2, d / 2 - 12, h]], 15, "steel"),
  B(0.35 * w, d / 2 + 5, 0.5 * h, 60, 20, 30, "steel", 0, { plan: false }),
  ...move(toilet.parts(400, 700, 800), 0, -d / 2 + 350),
]);
const washer = item("washer", "Bathroom", "Washing machine", 600, 600, 850, "white", (w, d, h) => [
  B(0, 0, 0, w, d, h, "main", 20, { b: 6 }),
  R(0, d / 2 + 2, h * 0.45, w * 0.3, 22, "steel", { axis: "y", plan: false }), C(0, d / 2 - 10, h * 0.45, w * 0.28, 16, "glass", w * 0.28, { tx: -90, plan: false }),
  B(0, d / 2 - 2, h - 90, w - 40, 4, 70, "grey", 0, { plan: false }), C(w * 0.3, d / 2 - 2, h - 55, 28, 15, "chrome", 28, { tx: -90, plan: false }), B(-w * 0.32, d / 2 - 2, h - 80, 120, 4, 50, "screen", 0, { plan: false }),
], { tags: "laundry" });
const dryer = variant(washer, "dryer", "Tumble dryer", { color: "offwhite" });
const laundryBasket = item("laundryBasket", "Bathroom", "Laundry basket", 400, 400, 550, "bamboo", (w, d, h) => [L(0, 0, 0, [[0, 0], [w * 0.42, 0], [w * 0.5, h], [w * 0.47, h], [w * 0.4, 12], [0, 12]], "main", { sy: d / w }), SB(0, 0, h - 120, w * 0.8, d * 0.8, 140, "cream", 0.4, { plan: false })]);
const bathMat = item("bathMat", "Bathroom", "Bath mat", 800, 500, 15, "cream", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 40, { b: 6, m: "rug" })]);
const towelLadder = item("towelLadder", "Bathroom", "Towel ladder", 450, 400, 1600, "bamboo", (w, d, h) => [...[-1, 1].map((s) => T([[s * (w / 2 - 20), d / 2 - 30, 0], [s * (w / 2 - 20), -d / 2 + 30, h]], 18, "main")), ...[0.25, 0.45, 0.65, 0.85].map((k) => T([[-w / 2 + 20, d / 2 - 30 - k * (d - 60), k * h], [w / 2 - 20, d / 2 - 30 - k * (d - 60), k * h]], 12, "main", { plan: false })), SB(0, d / 2 - 30 - 0.45 * (d - 60), 0.45 * h - 330, w - 80, 40, 360, "white", 0.3, { plan: false }), SB(0, d / 2 - 30 - 0.65 * (d - 60), 0.65 * h - 280, w - 80, 40, 300, "sage", 0.3, { plan: false })]);

export default [
  toilet, toiletWall, bidet, urinal, washbasin, vanity, vanity2,
  bathtub, bathFree, shower, showerWalk, cubicle, mirror, mirrorCab, towelRad, towelLadder,
  washer, dryer, laundryBasket, bathMat,
];
