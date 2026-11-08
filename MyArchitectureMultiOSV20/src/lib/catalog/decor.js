// Decor and plants: vases, bowls, books, candles, sculptures, baskets, racks; indoor plants.
import { B, C, S, L, E, T, R, G, SB, item, variant, pot, leaves, crown, books, smoothProfile, four, rng, clamp } from "./common.js";

const vase = (prof) => (w, d, h) => [L(0, 0, 0, smoothProfile(prof.map(([r, z]) => [r * w, z * h]), 4), "main", { sy: d / w, seg: 40 })];
// Long thin stems with a tuft or flower at the end, from a vase mouth at z.
function stems(n, z, h, spread, seed, tip = "leaf", tipR = 30, stemC = "leaf2") {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, k = spread * (0.4 + r() * 0.6), top = z + h * (0.7 + r() * 0.3);
    const x = Math.cos(a) * k, y = Math.sin(a) * k;
    out.push(T([[0, 0, z], [x * 0.5, y * 0.5, (z + top) / 2], [x, y, top]], 4, stemC, { smooth: true, plan: false }));
    out.push(S(x, y, top, tipR * (0.8 + r() * 0.4), tip, { sz: tip === "sand" ? 3 : 1.2, plan: false }));
  }
  return out;
}

// A tall plant: big leaves on short stalks up a trunk (fiddle-leaf fig, rubber plant).
function treePlant(w, d, h, seed = 4, leafC = "leaf2") {
  const r = rng(seed), out = [...pot(0, 0, Math.min(w, d) * 0.28, h * 0.22, "white", { straight: true })];
  out.push(T([[0, 0, h * 0.2], [w * 0.03, 0, h * 0.55], [-w * 0.02, 0, h * 0.95]], 14, "trunk", { smooth: true }));
  for (let i = 0; i < 26; i++) {
    const z = h * (0.4 + (i / 26) * 0.55), a = i * 137.5 + r() * 20, L0 = Math.min(w, d) * (0.28 + r() * 0.12);
    const rx = Math.cos((a * Math.PI) / 180), ry = Math.sin((a * Math.PI) / 180);
    out.push(S(rx * L0 * 0.55, ry * L0 * 0.55, z, L0 * 0.5, i % 3 ? leafC : "leaf", { sy: 0.62, sz: 0.1, ty: -20, tz: a, plan: i > 18 ? undefined : false }));
  }
  return out;
}
// Sword-like upright leaves (snake plant, aloe, grasses).
function blades(cx, cy, z, n, len, width, seed, c = "leaf2", lean = 12) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = r() * 360, l = len * (0.6 + r() * 0.4);
    out.push(S(cx + (r() - 0.5) * width, cy + (r() - 0.5) * width, z + l * 0.48, l / 2, i % 2 ? c : "leaf3", { sx: 0.09, sy: 0.025, sz: 1, tx: (r() - 0.5) * lean * 2, ty: (r() - 0.5) * lean * 2, tz: a, plan: false }));
  }
  return out;
}

export default [
  // ---------------------------------------------------------------- decor
  item("vaseTall", "Decor", "Tall floor vase with branches", 350, 350, 1400, "terracotta", (w, d, h) => [...vase([[0.25, 0], [0.42, 0.12], [0.5, 0.25], [0.3, 0.42], [0.16, 0.48], [0.18, 0.5], [0.001, 0.5]])(w, d, h), ...stems(7, h * 0.45, h * 0.5, w * 0.6, 3, "sand", 25, "trunk")]),
  item("vasePampas", "Decor", "Vase with pampas grass", 450, 450, 1100, "cream", (w, d, h) => [...vase([[0.22, 0], [0.35, 0.15], [0.33, 0.33], [0.15, 0.4], [0.13, 0.42], [0.001, 0.42]])(w, d, h), ...stems(9, h * 0.38, h * 0.55, w * 0.55, 8, "sand", 45, "sand")]),
  item("vaseSet", "Decor", "Set of three vases", 400, 200, 350, "white", (w, d, h) => [...vase([[0.1, 0], [0.12, 0.4], [0.07, 0.8], [0.05, 1], [0.001, 1]])(w, d, h).map((p) => ({ ...p, x: -w * 0.3 })), ...vase([[0.12, 0], [0.2, 0.3], [0.18, 0.55], [0.1, 0.65], [0.001, 0.65]])(w, d, h).map((p) => ({ ...p, c: "sage" })), ...vase([[0.08, 0], [0.12, 0.2], [0.1, 0.45], [0.06, 0.5], [0.001, 0.5]])(w, d, h).map((p) => ({ ...p, x: w * 0.3, c: "terracotta" }))]),
  item("flowerVase", "Decor", "Flowers in a glass vase", 300, 300, 550, "glass", (w, d, h) => [L(0, 0, 0, [[0, 0], [w * 0.22, 0], [w * 0.2, h * 0.45], [w * 0.18, h * 0.45], [w * 0.2, 4], [0, 4]], "main"), C(0, 0, 4, w * 0.18, h * 0.3, "water", w * 0.18, { plan: false }), ...stems(9, h * 0.35, h * 0.62, w * 0.42, 5, "flower", 32), ...stems(5, h * 0.35, h * 0.55, w * 0.38, 9, "flower2", 28)]),
  item("bowlDeco", "Decor", "Decorative bowl", 400, 400, 150, "black", (w, d, h) => [L(0, 0, 0, smoothProfile([[w * 0.15, 0], [w * 0.35, h * 0.4], [w * 0.5, h], [w * 0.48, h], [w * 0.33, h * 0.4], [0, h * 0.1]], 3), "main", { m: "ceramic" })]),
  item("sculpture", "Decor", "Abstract sculpture", 300, 300, 700, "brass", (w, d, h) => [B(0, 0, 0, w, d, 80, "marble", 4), R(0, 0, 0.55 * h, w * 0.32, 22, "main", { axis: "y", arc: 300, ty: 20 }), C(0, 0, 80, 12, 0.18 * h, "main")]),
  item("bookStack", "Decor", "Stack of books", 300, 220, 160, "book2", (w, d, h) => { const r = rng(6), cs = ["book1", "book2", "book3", "book4", "cream"]; return Array.from({ length: 5 }, (_, i) => B((r() - 0.5) * 20, (r() - 0.5) * 15, (i * h) / 5, w * (0.8 + r() * 0.2), d * (0.8 + r() * 0.2), h / 5 - 1, cs[i], 0, { tz: (r() - 0.5) * 12, plan: i === 4 })); }),
  item("candles", "Decor", "Candles on a tray", 350, 200, 220, "cream", (w, d, h) => [B(0, 0, 0, w, d, 15, "black", 30), ...[[-0.3, 0, 0.9], [0, 0.1, 0.6], [0.28, -0.1, 0.75]].flatMap(([x, y, k]) => [C(x * w, y * d, 15, 32, k * (h - 40), "main", 32, { m: "paper" }), G(S(x * w, y * d, 15 + k * (h - 40) + 15, 8, "flower2", { sz: 2, plan: false }), 1)])], { light: { type: "point", lumens: 40, at: (w, d, h) => [0, 0, h - 20] } }),
  item("lantern", "Decor", "Candle lantern", 250, 250, 450, "black", (w, d, h) => [B(0, 0, 0, w, d, 30, "main", 8), ...four(w - 20, d - 20, (x, y) => B(x, y, 30, 18, 18, h - 110, "main")), B(0, 0, 30, w - 20, d - 20, h - 110, "glass"), L(0, 0, h - 80, [[w * 0.55, 0], [20, 60], [0, 62]], "main"), R(0, 0, h - 10, 30, 5, "main", { axis: "x" }), C(0, 0, 30, 40, 120, "cream", 40, { m: "paper" }), G(S(0, 0, 170, 10, "flower2", { sz: 2, plan: false }), 1)], { light: { type: "point", lumens: 60, at: (w, d, h) => [0, 0, 170] } }),
  item("globe", "Decor", "Desk globe", 300, 300, 450, "blue", (w, d, h) => [C(0, 0, 0, w * 0.35, 20, "walnut"), T([[0, 0, 20], [0, 0, 80]], 10, "brass"), R(0, 0, 0.6 * h, w * 0.47, 6, "brass", { axis: "x", arc: 200, tx: 90 }), S(0, 0, 0.6 * h, w * 0.42, "main", { m: "gloss" })]),
  item("magazineRack", "Decor", "Magazine rack", 400, 300, 450, "black", (w, d, h) => [...[-1, 1].map((s) => T([[s * w / 2, -d / 2, h], [s * w / 2, 0, 0], [s * w / 2, d / 2, h]], 8, "main")), T([[-w / 2, 0, 20], [w / 2, 0, 20]], 8, "main"), ...[-1, 0, 1].map((k) => B(k * 40, 0, 20, w * 0.8, 8, h * 0.7, ["mustard", "white", "navy"][k + 1], 0, { tx: k * 12, m: "paper", plan: false }))]),
  item("umbrellaStand", "Decor", "Umbrella stand", 300, 300, 550, "steel", (w, d, h) => [L(0, 0, 0, [[0, 0], [w / 2, 0], [w / 2, h], [w / 2 - 3, h], [w / 2 - 3, 5], [0, 5]], "main", { m: "metal" }), T([[0, 0, 20], [30, 20, h - 5]], 15, "navy"), T([[40, -30, 20], [-30, -20, h - 5]], 15, "black"), T([[30, 20, h - 5], [30, 20, h + 0]], 15, "tan")]),
  item("shoeRack", "Decor", "Shoe rack with shoes", 800, 300, 500, "oak", (w, d, h) => [...[-1, 1].map((s) => B(s * (w / 2 - 15), 0, 0, 30, d, h, "main")), ...[0.05, 0.5, 0.95].map((k) => B(0, 0, k * (h - 25), w - 60, d, 25, "main", 0, { plan: k > 0.9 })), ...[0, 1].flatMap((j) => Array.from({ length: 3 }, (_, i) => [-1, 1].map((s) => SB(-w / 2 + 130 + i * 230 + s * 50, 0, (j ? 0.5 : 0.05) * (h - 25) + 25, 85, 260, 90, ["black", "tan", "white"][(i + j) % 3], 0.4, { plan: false }))).flat())]),
  item("coatHooks", "Decor", "Wall coat hooks", 800, 120, 300, "walnut", (w, d, h) => [B(0, -d / 2 + 15, 0, w, 30, 120, "main", 6), ...[-0.35, -0.12, 0.12, 0.35].map((k) => T([[k * w, -d / 2 + 30, 60], [k * w, d * 0.2, 80], [k * w, d * 0.3, 110]], 9, "brass", { smooth: true }))], { mount: "wall", elev: 1650 }),
  item("basket", "Decor", "Woven basket with blanket", 450, 450, 400, "bamboo", (w, d, h) => [L(0, 0, 0, [[0, 0], [w * 0.42, 0], [w * 0.5, h * 0.9], [w * 0.47, h * 0.9], [w * 0.4, 10], [0, 10]], "main", { m: "wood" }), SB(0, 0, h * 0.6, w * 0.7, d * 0.5, h * 0.45, "cream", 0.45, { m: "fabric", plan: false })]),
  item("throwPillows", "Decor", "Throw pillows (pair)", 900, 260, 450, "mustard", (w, d, h) => [SB(-w * 0.22, 0, 0, 450, 150, 450, "main", 0.45, { tx: 12, tz: 6 }), SB(w * 0.22, 0.05 * d, 0, 450, 150, 450, "sage", 0.45, { tx: 15, tz: -6 })]),
  item("deskOrganizer", "Decor", "Desk set", 400, 200, 200, "walnut", (w, d, h) => [B(0, 0, 0, w, d, 30, "main", 10), C(-w * 0.3, 0, 30, 40, 110, "black"), ...[0, 1, 2].map((i) => C(-w * 0.3 + (i - 1) * 15, (i - 1) * 10, 30, 4, 160, ["red", "blue", "black"][i], 4, { ty: (i - 1) * 8, plan: false })), B(w * 0.15, 0, 30, 210, 150, 25, "paper", 0)]),
  // ---------------------------------------------------------------- plants
  item("plantFiddle", "Plants", "Fiddle-leaf fig", 700, 700, 1800, "leaf2", (w, d, h) => treePlant(w, d, h, 4, "leaf2")),
  item("plantRubber", "Plants", "Rubber plant", 600, 600, 1300, "leaf2", (w, d, h) => treePlant(w, d, h, 9, "dark").map((p) => (p.c === "dark" ? { ...p, c: "leaf2", m: "gloss" } : p))),
  item("plantMonstera", "Plants", "Monstera", 900, 900, 1100, "leaf2", (w, d, h) => [...pot(0, 0, Math.min(w, d) * 0.22, h * 0.3, "concrete"), ...Array.from({ length: 11 }, (_, i) => { const a = i * 137.5, up = 25 + (i % 4) * 12, L0 = Math.min(w, d) * 0.48; const cx = Math.cos((a * Math.PI) / 180) * L0 * 0.55, cy = Math.sin((a * Math.PI) / 180) * L0 * 0.55; return [T([[0, 0, h * 0.28], [cx * 0.6, cy * 0.6, h * 0.55 + (i % 3) * 60], [cx, cy, h * 0.6 + (i % 3) * 70]], 8, "leaf2", { smooth: true, plan: false }), S(cx * 1.05, cy * 1.05, h * 0.6 + (i % 3) * 70, L0 * 0.36, i % 2 ? "leaf2" : "leaf", { sy: 0.85, sz: 0.08, ty: -up, tz: a })]; }).flat()]),
  item("snakePlant", "Plants", "Snake plant", 350, 350, 900, "leaf2", (w, d, h) => [...pot(0, 0, w * 0.4, h * 0.3, "white", { straight: true }), ...blades(0, 0, h * 0.28, 14, h * 0.75, w * 0.4, 6)]),
  item("plantPalm", "Plants", "Areca palm", 900, 900, 1700, "leaf3", (w, d, h) => [...pot(0, 0, Math.min(w, d) * 0.25, h * 0.22, "bamboo"), ...Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * 360, k = Math.min(w, d) * 0.45; const x = Math.cos((a * Math.PI) / 180) * k, y = Math.sin((a * Math.PI) / 180) * k; const top = h * (0.85 + (i % 3) * 0.05); return [T([[0, 0, h * 0.2], [x * 0.3, y * 0.3, top * 0.8], [x, y, top * 0.75]], 7, "leaf2", { smooth: true, plan: false }), ...Array.from({ length: 6 }, (_, j) => S(x * (0.35 + j * 0.11), y * (0.35 + j * 0.11), top * (0.82 - j * 0.012), k * 0.2, j % 2 ? "leaf3" : "leaf", { sx: 1, sy: 0.25, sz: 0.06, tz: a + 90, plan: j > 3 ? undefined : false }))]; }).flat()]),
  item("cactus", "Plants", "Cactus", 350, 350, 1000, "leaf2", (w, d, h) => [...pot(0, 0, w * 0.4, h * 0.22, "terracotta"), C(0, 0, h * 0.2, w * 0.17, h * 0.7, "main", w * 0.17, { top: 0.7 }), S(0, 0, h * 0.9, w * 0.12, "main"), T([[0, 0, h * 0.45], [w * 0.32, 0, h * 0.5], [w * 0.36, 0, h * 0.72]], w * 0.08, "main", { smooth: true }), S(w * 0.36, 0, h * 0.72, w * 0.08, "main"), T([[0, 0, h * 0.58], [-w * 0.3, 0, h * 0.6], [-w * 0.32, 0, h * 0.78]], w * 0.07, "main", { smooth: true }), S(-w * 0.32, 0, h * 0.78, w * 0.07, "main")]),
  item("succulents", "Plants", "Succulents (trio)", 400, 150, 160, "sage", (w, d, h) => [-1, 0, 1].flatMap((k) => [...pot(k * w * 0.33, 0, 55, 80, ["white", "terracotta", "concrete"][k + 1]), ...leaves(k * w * 0.33, 0, 75, 8, 70, 35, 25 + k * 10, 10 + k, "main", 0.35).map((p) => ({ ...p, plan: false }))])),
  item("bonsai", "Plants", "Bonsai", 450, 300, 400, "leaf2", (w, d, h) => [B(0, 0, 0, w * 0.8, d * 0.7, 60, "darkwood", 10), T([[0, 0, 60], [w * 0.1, 0, 150], [-w * 0.1, 0, 220], [w * 0.05, 0, 280]], 18, "trunk", { smooth: true }), ...crown(-w * 0.15, 0, 180, w * 0.2, d * 0.25, 50, 4, 11), ...crown(w * 0.18, 0, 240, w * 0.22, d * 0.28, 55, 4, 12)]),
  item("orchid", "Plants", "Orchid", 250, 200, 550, "white", (w, d, h) => [...pot(0, 0, 60, 120, "white", { straight: true }), ...leaves(0, 0, 110, 5, 160, 60, 15, 4, "leaf2", 0.1), T([[0, 0, 120], [20, 0, h * 0.7], [70, 0, h * 0.9]], 3, "leaf2", { smooth: true, plan: false }), ...Array.from({ length: 6 }, (_, i) => S(20 + i * 10, 0, h * (0.62 + i * 0.05), 28, i % 2 ? "main" : "blush", { sy: 0.35, plan: false }))]),
  item("hangingPlant", "Plants", "Hanging plant", 400, 400, 900, "leaf", (w, d, h) => [...[0, 120, 240].map((a) => T([[0, 0, h - 5], [Math.cos((a * Math.PI) / 180) * 110, Math.sin((a * Math.PI) / 180) * 110, h * 0.45]], 2, "cream", { plan: false })), L(0, 0, h * 0.3, smoothProfile([[0, 0], [80, 10], [120, 80], [125, 150], [0, 150]], 3), "terracotta"), ...crown(0, 0, h * 0.35, w * 0.4, d * 0.4, 80, 7, 21), ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return T([[Math.cos(a) * 110, Math.sin(a) * 110, h * 0.45], [Math.cos(a) * 170, Math.sin(a) * 170, h * 0.25], [Math.cos(a) * 160, Math.sin(a) * 160, h * 0.02]], 8, i % 2 ? "leaf" : "leaf3", { smooth: true, plan: false }); })], { mount: "ceiling" }),
  item("oliveTree", "Plants", "Olive tree in a pot", 900, 900, 2000, "sage", (w, d, h) => [...pot(0, 0, w * 0.32, h * 0.25, "concrete", { straight: true }), T([[0, 0, h * 0.2], [w * 0.05, 0, h * 0.45], [-w * 0.05, 0, h * 0.6]], 30, "trunk", { smooth: true }), ...crown(0, 0, h * 0.5, w * 0.48, d * 0.48, h * 0.24, 10, 31, ["sage", "leaf2", "sage"])]),
  item("plantStand", "Plants", "Plant stand with pots", 600, 300, 900, "black", (w, d, h) => [...[-1, 1].flatMap((s) => [T([[s * w / 2 * 0.9, -d / 2 + 20, 0], [s * w / 2 * 0.9, -d / 2 + 20, h]], 8, "main"), T([[s * w / 2 * 0.9, d / 2 - 20, 0], [s * w / 2 * 0.9, d / 2 - 20, h * 0.6]], 8, "main")]), B(0, 0, h * 0.3, w, d, 15, "oak"), B(0, -d * 0.15, h * 0.62, w, d * 0.6, 15, "oak"), ...pot(-w * 0.25, 0, 70, 120, "terracotta").map((p) => ({ ...p, z: p.z + h * 0.3 + 15 })), ...leaves(-w * 0.25, 0, h * 0.3 + 120, 9, 200, 70, 40, 3, "leaf").map((p) => ({ ...p, plan: false })), ...pot(w * 0.2, -d * 0.15, 60, 110, "white").map((p) => ({ ...p, z: p.z + h * 0.62 + 15 })), ...blades(w * 0.2, -d * 0.15, h * 0.62 + 110, 7, 220, 50, 7)]),
  item("verticalGarden", "Plants", "Green wall panel", 1200, 150, 1800, "leaf", (w, d, h) => [B(0, -d / 2 + 15, 0, w, 30, h, "dark", 0), ...Array.from({ length: 30 }, (_, i) => S(-w / 2 + 100 + (i % 6) * ((w - 200) / 5), 0, 120 + Math.floor(i / 6) * ((h - 240) / 4), 150, ["leaf", "leaf2", "leaf3"][i % 3], { sy: 0.45, plan: i < 6 }))], { mount: "wall", elev: 400 }),
];
