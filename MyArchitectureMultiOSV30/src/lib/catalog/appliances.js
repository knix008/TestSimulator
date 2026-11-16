// Electronics and home appliances modelled on real products and their sizes:
// thin-bezel TVs and monitors, laptops, PCs, speakers, consoles, printers;
// refrigerators, washers and dryers, dishwashers, microwaves, ovens, hobs,
// small kitchen appliances; air conditioners, purifiers, fans, heaters,
// vacuums, water purifiers, clothes stylers. Black glass screens, brushed
// metal, matte plastics, rounded edges, and small LEDs that glow at night.
// Entries here replace older ones of the same kind (index.js).
import { B, C, S, L, E, T, R, G, SB, item, four, smoothProfile, rrect, ellipsePts, clamp, cabinet } from "./common.js";

const LED = (part) => ({ ...part, m: "led", plan: false });
const glassFront = (x, y, z, w, h, r = 6) => B(x, y, z, w, 3, h, "black", r, { m: "blackGlass", plan: false });

// ---------------------------------------------------------------- screens
// A flat panel facing +y: bezel body (thin), the black glass, a slimmer top.
function panel(x, y, z, w, hh, depth = 28, o = {}) {
  const bez = o.bezel ?? 6;
  return [
    B(x, y - depth / 2 + 4, z, w, 8, hh, o.c || "black", 4, { m: "matte" }),
    B(x, y - depth / 2 - 4, z + hh * 0.15, w * 0.7, depth - 8, hh * 0.55, o.c || "black", 30, { b: 8, m: "matte", plan: false }), // the electronics bulge at the back
    B(x, y - depth / 2 + 8 + 1.5, z + bez, w - 2 * bez, 3, hh - 2 * bez - (o.chin || 0), "screen", 0, { m: "blackGlass", plan: false }),
    ...(o.chin ? [B(x, y - depth / 2 + 8, z, w, 6, o.chin + bez, o.chinC || "steel", 2, { plan: false })] : []),
    ...(o.led !== false ? [LED(B(x, y - depth / 2 + 10, z + 2, 8, 2, 3, "white", 1))] : []),
  ];
}
// A TV on two blade feet.
function tvOnFeet(w, d, h, o = {}) {
  const hh = w * 0.565, z = h - hh;
  return [
    ...[-1, 1].map((s) => E(s * w * 0.4, 0, 0, [[-d / 2, 0], [d / 2, 0], [d / 2 - 15, 12], [12, z + 40], [-12, z + 40], [-d / 2 + 15, 12]], 18, "steel", { axis: "x", b: 2, tz: s * 8 })),
    ...panel(0, 30, z, w, hh, o.depth || 30, { bezel: 5 }),
  ];
}

// ---------------------------------------------------------------- appliances: fronts and details
const handleBar = (x, y, z, len, vertical = true, c = "steel") => vertical
  ? T([[x, y, z], [x, y + 30, z + 12], [x, y + 30, z + len - 12], [x, y, z + len]], 9, c, { m: "brushed", plan: false })
  : T([[x, y, z], [x + 12, y + 30, z], [x + len - 12, y + 30, z], [x + len, y, z]], 9, c, { m: "brushed", plan: false });
const knob = (x, y, z, r = 18, c = "steel") => [C(x, y, z, r, 22, c, r, { tx: -90, m: "brushed", plan: false }), B(x, y + 22, z + r * 0.4, 3, 2, r * 0.6, "black", 0, { plan: false })];
const keypad = (x, y, z, cols, rows, pitch = 22) => Array.from({ length: cols * rows }, (_, i) => B(x + (i % cols) * pitch - ((cols - 1) * pitch) / 2, y, z - Math.floor(i / cols) * pitch, pitch - 6, 2, pitch - 8, "grey", 2, { plan: false }));
// A front-loading drum door: chrome ring, glass bowl, dark drum behind.
const porthole = (x, y, z, r) => [
  C(x, y - 6, z, r * 0.88, 8, "dark", r * 0.88, { tx: -90, plan: false }),
  L(x, y + 2, z, smoothProfile([[r * 0.78, 0], [r * 0.62, r * 0.18], [r * 0.3, r * 0.26], [0, r * 0.27]], 3), "glass", { tx: -90, plan: false }),
  R(x, y + 4, z, r * 0.86, r * 0.1, "chrome", { axis: "y", plan: false }),
  R(x, y + 2, z, r * 1.0, r * 0.06, "grey", { axis: "y", plan: false }),
];

export default [
  // ---------------------------------------------------------------- TVs and screens
  item("tv65", "Electronics", "65\" TV on a stand", 1450, 300, 900, "black", (w, d, h) => tvOnFeet(w, d, h), { tags: "television" }),
  item("tvOLED", "Electronics", "77\" OLED TV on a pedestal", 1720, 300, 1060, "black", (w, d, h) => {
    const hh = w * 0.565, z = h - hh;
    return [B(0, 0, 0, w * 0.4, d, 18, "steel", 40, { b: 4, m: "brushed" }), B(0, -0.15 * d, 18, 120, 40, z + 120, "steel", 6, { m: "brushed" }), ...panel(0, -0.15 * d + 30, z, w, hh, 14, { bezel: 4 })];
  }, { tags: "television" }),
  item("tvCurved", "Electronics", "55\" curved TV", 1230, 260, 790, "black", (w, d, h) => {
    const hh = w * 0.565, z = h - hh, R0 = 4000, half = Math.asin(w / 2 / R0);
    const arc = (r) => Array.from({ length: 17 }, (_, i) => { const a = -half + (2 * half * i) / 16; return [Math.sin(a) * r, R0 - Math.cos(a) * r - d / 2 + 60]; });
    const band = (r1, r2) => [...arc(r1), ...arc(r2).reverse()];
    return [B(0, 0, 0, w * 0.32, d * 0.9, 14, "steel", 30, { m: "brushed" }), B(0, 0, 14, 90, 35, z + 100, "steel", 6, { m: "brushed" }),
      E(0, 0, z, band(R0 + 22, R0), hh, "black", { m: "matte" }), E(0, 0, z + 6, band(R0 - 1, R0 - 4), hh - 12, "screen", { m: "blackGlass", plan: false })];
  }, { tags: "television" }),
  item("wallTV", "Living", "Wall-mounted TV", 1400, 60, 800, "black", (w, d, h) => [B(0, -d / 2 + 15, h * 0.3, w * 0.3, 30, h * 0.4, "dark", 4, { plan: false }), ...panel(0, d / 2, 0, w, h, 30, { bezel: 6 })], { mount: "wall", elev: 1000, tags: "television" }),
  item("monitor", "Electronics", "Computer monitor", 615, 220, 470, "black", (w, d, h) => {
    const hh = w * 0.58;
    return [B(0, -0.05 * d, 0, w * 0.38, d * 0.85, 10, "steel", 40, { b: 3, m: "brushed" }), E(0, -0.22 * d, 10, [[-20, 0], [20, 0], [12, h - hh * 0.4], [-28, h - hh * 0.4]], 60, "steel", { axis: "x", b: 4, m: "brushed" }), ...panel(0, -0.05 * d + 24, h - hh, w, hh, 22, { bezel: 6, chin: 12, chinC: "black" })];
  }),
  item("monitorDual", "Electronics", "Dual monitors on an arm", 1250, 300, 520, "black", (w, d, h) => [C(0, -d / 2 + 50, 0, 15, 30, "black", 15), B(0, -d / 2 + 30, 0, 90, 60, 30, "black", 6), C(0, -d / 2 + 50, 30, 16, 330, "black"), ...[-1, 1].flatMap((s) => [T([[0, -d / 2 + 50, 330], [s * w * 0.15, -d / 2 + 80, 345], [s * w * 0.25, -d / 2 + 90, 330]], 13, "black"), ...panel(s * w * 0.25, -d / 2 + 120, 140, w / 2 - 10, (w / 2 - 10) * 0.57, 22, { bezel: 6 }).map((p) => ({ ...p, tz: -s * 6 }))])]),
  item("laptop", "Electronics", "Laptop", 313, 230, 215, "steel", (w, d, h) => {
    const t = 15, lid = 6, lh = d * 0.93;
    return [
      B(0, 0.04 * d, 0, w, d * 0.92, t, "main", 10, { b: 3, m: "brushed" }),
      B(0, 0.04 * d - d * 0.12, t, w * 0.86, d * 0.4, 1, "black", 2, { plan: false }),
      ...Array.from({ length: 5 }, (_, r) => B(0, 0.04 * d - d * 0.27 + r * d * 0.075, t + 0.5, w * 0.84, d * 0.055, 1, "dark", 1, { plan: false })),
      B(0, 0.04 * d + d * 0.27, t, w * 0.36, d * 0.24, 0.6, "grey", 4, { plan: false }),
      B(0, -d / 2 + 6, t, w, lid, lh, "main", 6, { tx: 18, m: "brushed" }),
      B(0, -d / 2 + 6 + lid / 2 + 0.8, t + 6, w - 14, 1, lh - 14, "screen", 2, { tx: 18, m: "blackGlass", plan: false }),
    ];
  }),
  item("keyboardMouse", "Electronics", "Keyboard and mouse", 560, 160, 40, "black", (w, d, h) => [
    B(-w * 0.1, 0, 0, 440, 135, 22, "main", 8, { b: 3, tx: 3, m: "matte" }),
    ...Array.from({ length: 6 }, (_, r) => Array.from({ length: r === 5 ? 3 : 1 }, (_, k) => B(-w * 0.1 + (r === 5 ? (k - 1) * 140 : 0), -50 + r * 19, 22, r === 5 ? (k === 1 ? 200 : 70) : 410, 15, 6, "dark", 2, { plan: false }))).flat(),
    S(w / 2 - 45, 0, 0, 34, "main", { sy: 1.7, sz: 0.55, m: "matte" }), B(w / 2 - 45, -30, 18, 2, 30, 3, "grey", 0, { plan: false }),
  ]),
  item("desktopPC", "Electronics", "Desktop computer", 220, 460, 480, "black", (w, d, h) => [
    B(0, 0, 25, w, d, h - 25, "main", 6, { b: 3, m: "matte" }),
    B(0, d / 2, 40, w - 30, 4, h - 80, "charcoal", 3, { m: "grille", plan: false }),
    B(w / 2, 0, 45, 3, d - 60, h - 90, "glass", 2, { plan: false }),
    ...[0.3, 0.55, 0.8].map((k) => LED(R(w / 2 - 50, d / 2 - 90 - 0, h * k, 50, 4, "blue", { axis: "x" }))),
    LED(C(w * 0.3, d / 2 + 1, h - 40, 7, 3, "white", 7, { tx: -90 })),
    ...four(w - 40, d - 60, (x, y) => C(x, y, 0, 18, 25, "rubber")),
  ]),
  item("printerHome", "Electronics", "Home printer", 450, 370, 220, "black", (w, d, h) => [
    B(0, 0, 0, w, d * 0.8, 150, "main", 12, { b: 5, m: "matte" }),
    B(0, -d * 0.35, 120, w * 0.65, 30, 100, "main", 4, { tx: -25 }), B(0, -d * 0.36, 130, w * 0.6, 3, 85, "paper", 0, { tx: -25, plan: false }),
    B(0, d * 0.4, 40, w * 0.7, 80, 6, "grey", 4, { plan: false }), B(w * 0.3, d * 0.36, 120, 80, 10, 25, "screen", 3, { m: "blackGlass", plan: false }), LED(C(w * 0.42, d * 0.4, 130, 4, 2, "leaf3", 4, { tx: -90 })),
  ]),
  item("speakersBookshelf", "Electronics", "Bookshelf speakers (pair)", 900, 250, 290, "walnut", (w, d, h) => [-1, 1].flatMap((s) => [
    B(s * (w / 2 - 85), 0, 0, 170, d, h, "main", 6, { b: 4 }), B(s * (w / 2 - 85), d / 2, 8, 160, 3, h - 16, "black", 4, { m: "matte", plan: false }),
    C(s * (w / 2 - 85), d / 2 + 1, h * 0.36, 62, 6, "charcoal", 62, { tx: -90, plan: false }), C(s * (w / 2 - 85), d / 2 + 2, h * 0.36, 25, 10, "grey", 25, { top: 0.4, tx: -90, plan: false }),
    C(s * (w / 2 - 85), d / 2 + 1, h * 0.78, 20, 6, "steel", 20, { tx: -90, m: "brushed", plan: false }),
  ])),
  item("speakerFloor", "Electronics", "Floor-standing speaker", 220, 320, 1050, "walnut", (w, d, h) => [B(0, 0, 40, w, d, h - 40, "main", 10, { b: 5 }), B(0, 0, 0, w + 60, d + 60, 25, "black", 10), ...four(w + 20, d + 20, (x, y) => C(x, y, 25, 10, 15, "chrome", 10, { top: 0.5 })), B(0, d / 2, 50, w - 12, 4, h - 70, "black", 4, { m: "matte", plan: false }), ...[0.28, 0.5].map((k) => C(0, d / 2 + 2, k * h, 75, 8, "charcoal", 75, { tx: -90, plan: false })), C(0, d / 2 + 2, 0.78 * h, 22, 8, "steel", 22, { tx: -90, m: "brushed", plan: false })]),
  item("subwoofer", "Electronics", "Subwoofer", 380, 400, 400, "black", (w, d, h) => [B(0, 0, 25, w, d, h - 25, "main", 12, { b: 6, m: "matte" }), C(0, d / 2, h / 2 + 12, w * 0.4, 8, "charcoal", w * 0.4, { tx: -90, plan: false }), C(0, d / 2 + 6, h / 2 + 12, w * 0.12, 12, "grey", w * 0.12, { tx: -90, plan: false }), ...four(w - 60, d - 60, (x, y) => C(x, y, 0, 22, 25, "rubber")), LED(C(w * 0.38, d / 2 + 1, 50, 4, 2, "blue", 4, { tx: -90 }))]),
  item("soundbar", "Electronics", "Soundbar", 900, 100, 70, "black", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 30, { b: 22, m: "grille" }), B(0, -d / 2 + 2, 6, w - 60, 4, h - 12, "black", 4, { plan: false }), LED(B(0, d / 2 - 5, h * 0.5, 60, 3, 3, "white", 1))]),
  item("gameConsole", "Electronics", "Game console", 110, 270, 400, "white", (w, d, h) => [B(0, 0, 0, w * 0.6, d * 0.6, 20, "black", 30), B(0, 0, 20, w * 0.42, d * 0.94, h - 30, "black", 10, { b: 4, m: "gloss" }), ...[-1, 1].map((s) => E(s * w * 0.32, 0, 20, [[-d / 2, 0], [d / 2 - 20, 0], [d / 2, 60], [d / 2 - 10, h - 60], [d / 2 - 40, h - 20], [-d / 2 + 30, h - 30], [-d / 2 + 5, h - 80]], w * 0.25, "main", { axis: "x", b: 6, m: "matte" })), LED(B(0, d / 2 - 2, 40, 6, 2, h - 120, "blue", 1))]),
  item("router", "Electronics", "Wi-Fi router", 250, 180, 200, "black", (w, d, h) => [B(0, 0, 0, w, d, 40, "main", 20, { b: 12, m: "matte" }), ...[-0.35, -0.12, 0.12, 0.35].map((k) => C(k * w, -d / 2 + 20, 40, 7, h - 40, "main", 7, { top: 0.8 })), ...[-0.2, -0.07, 0.07, 0.2].map((k) => LED(C(k * w, d / 2 - 1, 25, 3, 2, "leaf3", 3, { tx: -90 })))]),
  item("projector", "Electronics", "Projector", 330, 260, 110, "white", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 20, { b: 12, m: "matte" }), C(-w * 0.22, d / 2, h / 2, 42, 18, "black", 42, { tx: -90, plan: false }), C(-w * 0.22, d / 2 + 14, h / 2, 32, 4, "glass", 32, { tx: -90, m: "blackGlass", plan: false }), B(w * 0.25, d / 2, h * 0.3, 80, 3, h * 0.45, "grey", 2, { m: "grille", plan: false }), LED(C(w * 0.38, 0, h, 5, 2, "blue"))], { mount: "ceiling" }),
  // ---------------------------------------------------------------- refrigerators
  item("fridge", "Kitchen", "Refrigerator", 700, 700, 1800, "white", (w, d, h) => [
    B(0, -0.04 * d, 0, w, d * 0.9, h, "main", 12, { b: 4 }),
    B(0, d / 2 - 35, 30, w - 4, 60, 0.36 * h - 34, "main", 10, { b: 8, m: "gloss", plan: false }), B(0, d / 2 - 35, 0.36 * h, w - 4, 60, 0.64 * h - 4, "main", 10, { b: 8, m: "gloss", plan: false }),
    B(w / 2 - 40, d / 2 + 4, 0.38 * h, 18, 8, 0.25 * h, "steel", 4, { m: "brushed", plan: false }), B(w / 2 - 40, d / 2 + 4, 0.18 * h, 18, 8, 0.15 * h, "steel", 4, { m: "brushed", plan: false }),
    B(0, d / 2 + 0.5, 0.36 * h - 4, w - 10, 2, 4, "dark", 0, { plan: false }), B(0, -d / 2 + 12, 0, w - 20, 30, 60, "dark", 0, { plan: false }),
    LED(B(-w * 0.25, d / 2 + 1, 0.85 * h, 60, 2, 18, "blue", 2)),
  ], { tags: "fridge freezer" }),
  item("fridgeFrench", "Kitchen", "French-door refrigerator", 910, 740, 1790, "steel", (w, d, h) => [
    B(0, -0.05 * d, 0, w, d * 0.88, h, "main", 12, { b: 5, m: "brushed" }),
    ...[-1, 1].map((s) => B((s * w) / 4, d / 2 - 40, 0.37 * h, w / 2 - 5, 70, 0.63 * h - 4, "main", 10, { b: 10, m: "brushed", plan: false })),
    B(0, d / 2 - 40, 30, w - 4, 70, 0.355 * h - 30, "main", 10, { b: 10, m: "brushed", plan: false }),
    ...[-1, 1].map((s) => handleBar(s * 45, d / 2 + 2, 0.45 * h, 0.4 * h)), handleBar(-w * 0.35, d / 2 + 2, 0.31 * h, w * 0.7, false),
    B(-w / 4, d / 2 + 1, 0.6 * h, 190, 30, 280, "black", 12, { m: "blackGlass", plan: false }), B(-w / 4, d / 2 + 8, 0.6 * h + 30, 120, 30, 20, "grey", 4, { plan: false }),
    LED(B(-w / 4, d / 2 + 2, 0.6 * h + 220, 120, 2, 30, "blue", 3)),
    B(0, -d / 2 + 15, 0, w - 30, 30, 70, "black", 0, { m: "grille", plan: false }),
  ]),
  item("fridgeSideBySide", "Kitchen", "Side-by-side refrigerator", 910, 740, 1790, "black", (w, d, h) => [
    B(0, -0.05 * d, 0, w, d * 0.88, h, "main", 12, { b: 5, m: "matte" }),
    ...[-1, 1].map((s) => B((s * w) / 4, d / 2 - 40, 30, w / 2 - 5, 70, h - 34, "main", 10, { b: 10, m: "blackGlass", plan: false })),
    ...[-1, 1].map((s) => handleBar(s * 45, d / 2 + 2, 0.3 * h, 0.55 * h, true, "steel")),
    B(-w / 4, d / 2 + 1, 0.5 * h, 200, 40, 320, "dark", 14, { plan: false }), T([[-w / 4, d / 2 - 10, 0.5 * h + 260], [-w / 4, d / 2 + 20, 0.5 * h + 230]], 8, "steel", { plan: false }),
    LED(B(-w / 4, d / 2 + 2, 0.5 * h + 340, 130, 2, 26, "white", 3)),
  ]),
  item("clothesStyler", "Bathroom", "Clothes care cabinet (styler)", 445, 585, 1850, "black", (w, d, h) => [B(0, -0.03 * d, 0, w, d * 0.94, h, "main", 8, { b: 3, m: "matte" }), B(0, d / 2 - 20, 20, w - 6, 40, h - 30, "black", 6, { b: 6, m: "blackGlass", plan: false }), LED(B(0, d / 2 + 1, h - 140, 90, 2, 22, "white", 3)), B(w / 2 - 6, d / 2 - 10, h * 0.45, 8, 30, h * 0.2, "dark", 2, { plan: false })], { tags: "steam closet laundry" }),
  // ---------------------------------------------------------------- laundry
  item("washer", "Bathroom", "Washing machine", 600, 600, 850, "white", (w, d, h) => [
    B(0, -0.02 * d, 0, w, d * 0.96, h, "main", 12, { b: 6 }),
    ...porthole(-0.02 * w, d / 2 - 2, h * 0.44, w * 0.32),
    B(0, d / 2 - 2, h - 130, w - 20, 6, 110, "offwhite", 4, { plan: false }),
    B(-w * 0.32, d / 2 + 1, h - 115, 150, 4, 80, "main", 6, { plan: false }),
    ...knob(w * 0.05, d / 2 + 2, h - 75, 32, "chrome"),
    B(w * 0.3, d / 2 + 2, h - 95, 130, 2, 40, "black", 4, { m: "blackGlass", plan: false }), LED(B(w * 0.3, d / 2 + 3, h - 85, 60, 1, 14, "blue", 1)),
    B(0, d / 2 - 2, 0, w - 40, 6, 60, "offwhite", 4, { plan: false }),
  ], { tags: "laundry front-load" }),
  item("dryer", "Bathroom", "Tumble dryer", 600, 650, 850, "offwhite", (w, d, h) => [
    B(0, -0.02 * d, 0, w, d * 0.96, h, "main", 12, { b: 6 }),
    ...porthole(-0.02 * w, d / 2 - 2, h * 0.44, w * 0.33),
    B(0, d / 2 - 2, h - 130, w - 20, 6, 110, "grey", 4, { plan: false }), ...knob(-w * 0.2, d / 2 + 2, h - 75, 30, "chrome"),
    B(w * 0.25, d / 2 + 2, h - 95, 150, 2, 40, "black", 4, { m: "blackGlass", plan: false }), LED(B(w * 0.25, d / 2 + 3, h - 85, 70, 1, 14, "orange", 1)),
  ], { tags: "laundry" }),
  item("washTower", "Bathroom", "Washer-dryer tower", 700, 830, 1890, "charcoal", (w, d, h) => [
    B(0, -0.02 * d, 0, w, d * 0.96, h, "main", 12, { b: 6, m: "matte" }),
    ...porthole(0, d / 2 - 2, h * 0.24, w * 0.34), ...porthole(0, d / 2 - 2, h * 0.7, w * 0.34),
    B(0, d / 2 - 1, h * 0.47, w - 60, 4, 120, "black", 6, { m: "blackGlass", plan: false }), ...knob(-w * 0.25, d / 2 + 2, h * 0.47 + 60, 30, "chrome"), LED(B(w * 0.15, d / 2 + 3, h * 0.47 + 50, 120, 1, 20, "white", 2)),
  ], { tags: "laundry" }),
  // ---------------------------------------------------------------- kitchen appliances
  item("dishwasher", "Kitchen", "Dishwasher", 600, 600, 850, "metal", (w, d, h) => [B(0, -0.02 * d, 0, w, d * 0.96, h, "main", 4, { m: "brushed" }), B(0, d / 2 - 14, 90, w - 6, 28, h - 94, "main", 6, { b: 3, m: "brushed", plan: false }), B(0, d / 2 + 1, h - 70, w - 40, 3, 50, "black", 4, { m: "blackGlass", plan: false }), handleBar(-w * 0.32, d / 2 + 2, h - 120, w * 0.64, false), LED(B(w * 0.25, d / 2 + 3, h - 50, 60, 1, 12, "white", 2)), B(0, d / 2 - 30, 0, w - 20, 10, 90, "dark", 0, { plan: false })]),
  item("microwave", "Kitchen", "Microwave", 490, 380, 290, "black", (w, d, h) => [
    B(0, 0, 8, w, d, h - 8, "main", 10, { b: 5, m: "matte" }),
    B(-w * 0.12, d / 2, 22, w * 0.7, 3, h - 44, "black", 6, { m: "blackGlass", plan: false }),
    B(-w * 0.13, d / 2 + 1, 50, w * 0.5, 2, h - 100, "dark", 3, { plan: false }),
    T([[w * 0.22, d / 2, 40], [w * 0.22, d / 2 + 25, 50], [w * 0.22, d / 2 + 25, h - 50], [w * 0.22, d / 2, h - 40]], 8, "steel", { m: "brushed", plan: false }),
    B(w * 0.37, d / 2, 22, w * 0.22, 3, h - 44, "dark", 4, { plan: false }),
    LED(B(w * 0.37, d / 2 + 2, h - 70, 70, 1, 22, "leaf3", 2)), ...keypad(w * 0.37, d / 2 + 2, h - 105, 3, 4, 22),
    ...four(w - 60, d - 60, (x, y) => C(x, y, 0, 15, 8, "rubber")),
  ]),
  item("ovenBuiltIn", "Kitchen", "Built-in oven", 595, 570, 595, "black", (w, d, h) => [B(0, -0.04 * d, 0, w - 10, d * 0.9, h - 6, "dark", 4), B(0, d / 2 - 12, 0, w, 24, h, "steel", 4, { m: "brushed" }), B(0, d / 2 + 1, 30, w - 40, 3, h * 0.72, "black", 6, { m: "blackGlass", plan: false }), handleBar(-w * 0.38, d / 2 + 3, h * 0.78, w * 0.76, false), B(0, d / 2 + 1, h * 0.86, w - 40, 3, 60, "black", 4, { m: "blackGlass", plan: false }), ...knob(-w * 0.35, d / 2 + 4, h * 0.91, 18), ...knob(w * 0.35, d / 2 + 4, h * 0.91, 18), LED(B(0, d / 2 + 4, h * 0.9, 80, 1, 20, "orange", 2))]),
  item("hobInduction", "Kitchen", "Induction hob", 590, 520, 60, "black", (w, d, h) => [B(0, 0, 0, w - 20, d - 20, h - 6, "dark", 4, { plan: false }), B(0, 0, h - 6, w, d, 6, "black", 4, { m: "blackGlass" }), ...[[-0.24, -0.18, 95], [0.24, -0.18, 75], [-0.24, 0.2, 75], [0.24, 0.2, 95]].map(([u, v, r]) => R(u * w, v * d, h, r, 1.5, "grey", { plan: false })), ...Array.from({ length: 6 }, (_, i) => LED(C(-w * 0.3 + i * w * 0.12, d / 2 - 30, h, 6, 1, i === 2 ? "red" : "white", 6)))]),
  item("hobGas", "Kitchen", "Gas hob with cast-iron grates", 600, 520, 100, "black", (w, d, h) => [
    B(0, 0, 0, w, d, 30, "black", 6, { m: "blackGlass" }),
    ...[[-0.25, -0.2, 1], [0.25, -0.2, 0.75], [-0.25, 0.22, 0.75], [0.25, 0.22, 0.9]].flatMap(([u, v, k]) => [C(u * w, v * d, 30, 45 * k, 18, "black", 45 * k, { m: "blackMetal", plan: false }), C(u * w, v * d, 48, 30 * k, 6, "black", 30 * k, { m: "blackMetal", plan: false })]),
    ...[-1, 1].flatMap((s) => [T([[s * (w / 2 - 25), -d / 2 + 25, 60], [s * (w / 2 - 25), d / 2 - 25, 60]], 7, "black", { m: "blackMetal" }), T([[s * w * 0.02, -d / 2 + 25, 60], [s * w * 0.02, d / 2 - 25, 60]], 7, "black", { m: "blackMetal", plan: false })]),
    ...[-1, 0, 1].map((k) => T([[-w / 2 + 25, k * (d / 2 - 25), 60], [w / 2 - 25, k * (d / 2 - 25), 60]], 7, "black", { m: "blackMetal" })),
    ...[-0.32, -0.11, 0.11, 0.32].flatMap((k) => [C(k * w, d / 2 - 20, 30, 18, 22, "steel", 18, { m: "brushed", plan: false })]),
  ]),
  item("coffeeMachine", "Kitchen", "Espresso machine", 280, 400, 380, "steel", (w, d, h) => [
    B(0, -0.12 * d, 0, w, d * 0.74, h, "main", 20, { b: 8, m: "brushed" }),
    B(0, 0.2 * d, 0, w, d * 0.58, 25, "black", 10, { m: "matte" }), B(0, 0.22 * d, 25, w * 0.85, d * 0.5, 4, "steel", 4, { m: "grille", plan: false }),
    B(0, 0.12 * d, h * 0.62, w, d * 0.5, h * 0.38, "main", 20, { b: 8, m: "brushed" }),
    L(0, 0.24 * d, 29, [[0, 0], [38, 0], [40, 80], [37, 80], [35, 4], [0, 4]], "white", { m: "ceramic" }),
    C(0, 0.24 * d, h * 0.53, 32, 45, "black"), T([[0, 0.24 * d, h * 0.62], [0, 0.24 * d, h * 0.58]], 10, "black"),
    T([[w * 0.32, 0.3 * d, h * 0.65], [w * 0.4, 0.42 * d, h * 0.5]], 5, "chrome", { plan: false }),
    B(-w * 0.2, 0.36 * d, h * 0.8, 70, 2, 40, "black", 4, { m: "blackGlass", plan: false }), LED(B(-w * 0.2, 0.36 * d + 1, h * 0.8 + 12, 40, 1, 14, "white", 2)),
  ]),
  item("coffeeCapsule", "Kitchen", "Capsule coffee machine", 130, 330, 260, "red", (w, d, h) => [B(0, -0.05 * d, 0, w, d * 0.9, h, "main", 30, { b: 15, m: "gloss" }), B(0, 0.32 * d, 0, w * 0.9, d * 0.3, 20, "black", 10), B(0, 0.25 * d, h * 0.55, w * 0.8, d * 0.4, 50, "black", 12, { b: 6, m: "gloss" }), L(0, 0.32 * d, 20, [[0, 0], [30, 0], [32, 60], [29, 60], [27, 4], [0, 4]], "white", { m: "ceramic" }), LED(C(0, -0.05 * d, h, 9, 2, "white", 9))]),
  item("kettle", "Kitchen", "Kettle", 220, 180, 250, "steel", (w, d, h) => [C(0, 0, 0, w * 0.4, 15, "black", d * 0.45, { m: "matte" }), L(0, 0, 15, smoothProfile([[w * 0.38, 0], [w * 0.4, 0.4 * h], [w * 0.32, 0.8 * h], [w * 0.15, 0.92 * h], [0, 0.92 * h]], 3), "main", { m: "brushed" }), T([[-w * 0.3, 0, 0.3 * h], [-w * 0.48, 0, 0.55 * h], [-w * 0.3, 0, 0.9 * h]], 12, "black", { smooth: true }), T([[w * 0.32, 0, 0.35 * h], [w * 0.48, 0, 0.72 * h]], 12, "main", { m: "brushed" }), LED(C(-w * 0.3, 0, 0.2 * h, 6, 2, "blue", 6, { ty: -90 }))]),
  item("riceCooker", "Kitchen", "Rice cooker", 260, 340, 260, "white", (w, d, h) => [L(0, 0, 0, smoothProfile([[w * 0.42, 0], [w * 0.5, h * 0.3], [w * 0.5, h * 0.7], [w * 0.4, h * 0.95], [0, h]], 3), "main", { sy: (d * 0.82) / w, m: "gloss" }), B(0, d * 0.36, h * 0.35, w * 0.55, 40, h * 0.3, "black", 12, { m: "blackGlass" }), LED(B(0, d * 0.42, h * 0.52, 50, 2, 18, "leaf3", 2)), T([[-w * 0.3, -d * 0.3, h * 0.92], [0, -d * 0.4, h * 0.98], [w * 0.3, -d * 0.3, h * 0.92]], 10, "grey", { smooth: true, plan: false })]),
  item("waterPurifier", "Kitchen", "Countertop water purifier", 180, 460, 400, "white", (w, d, h) => [B(0, -0.06 * d, 0, w, d * 0.88, h, "main", 25, { b: 10, m: "gloss" }), B(0, 0.3 * d, 0, w * 0.9, d * 0.38, 20, "grey", 12), T([[0, 0.2 * d, h * 0.75], [0, 0.4 * d, h * 0.75], [0, 0.42 * d, h * 0.66]], 12, "chrome", { plan: false }), B(0, 0.37 * d, h * 0.82, w * 0.8, 3, 60, "black", 6, { tx: -20, m: "blackGlass", plan: false }), LED(B(0, 0.37 * d + 2, h * 0.84, 40, 1, 14, "blue", 2, { tx: -20 }))]),
  // ---------------------------------------------------------------- climate and cleaning
  item("acIndoor", "Building", "Air conditioner (wall split)", 900, 230, 300, "white", (w, d, h) => [
    E(0, 0, 0, [[-d / 2, h], [d / 2 - 60, h], [d / 2, h * 0.7], [d / 2 - 10, h * 0.25], [d / 2 - 70, 0], [-d / 2, 0]], w, "main", { axis: "x", b: 20, m: "gloss" }),
    B(0, d * 0.1, 8, w - 60, 70, 10, "offwhite", 4, { tx: 30, plan: false }),
    B(0, -d * 0.1, h - 2, w - 80, d * 0.4, 2, "grey", 4, { m: "grille", plan: false }),
    LED(B(w * 0.35, d / 2 - 4, h * 0.45, 40, 2, 10, "blue", 1)), LED(B(w * 0.35 + 50, d / 2 - 4, h * 0.45, 10, 2, 10, "leaf3", 1)),
  ], { mount: "wall", elev: 2250 }),
  item("acStand", "Building", "Air conditioner (floor-standing)", 400, 350, 1850, "white", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 120, { b: 20, m: "gloss" }), B(0, d / 2 - 30, h * 0.45, w * 0.55, 40, h * 0.42, "grey", 40, { m: "grille", plan: false }), B(0, d / 2 - 10, h * 0.3, w * 0.5, 4, 80, "black", 10, { m: "blackGlass", plan: false }), LED(B(0, d / 2 - 6, h * 0.3 + 30, 70, 2, 20, "blue", 2)), B(0, 0, 0, w * 0.9, d * 0.9, 30, "grey", 100)]),
  item("acOutdoor", "Building", "Air conditioner outdoor unit", 880, 330, 690, "offwhite", (w, d, h) => [B(0, 0, 50, w, d, h - 50, "main", 12, { b: 6, m: "matte" }), C(-w * 0.13, d / 2 - 15, h * 0.53, 255, 15, "black", 255, { tx: -90, m: "grille", plan: false }), R(-w * 0.13, d / 2, h * 0.53, 255, 10, "grey", { axis: "y", plan: false }), ...Array.from({ length: 5 }, (_, i) => B(-w * 0.13, d / 2 + 2, h * 0.53 - 220 + i * 110, 500, 4, 8, "grey", 0, { plan: false })), B(w * 0.36, d / 2, h * 0.3, 160, 4, h * 0.5, "grey", 4, { plan: false }), ...[-1, 1].map((s) => B(s * (w / 2 - 80), 0, 0, 60, d + 40, 50, "black", 6))]),
  item("airPurifier", "Building", "Air purifier", 270, 270, 640, "white", (w, d, h) => [C(0, 0, 0, w / 2, h - 40, "main", d / 2, { seg: 40, m: "matte" }), C(0, 0, 40, w / 2 + 1, h * 0.55, "grey", d / 2 + 1, { seg: 40, m: "grille" }), C(0, 0, h - 40, w / 2 - 4, 40, "offwhite", d / 2 - 4, { seg: 40 }), R(0, 0, h, w / 2 - 30, 4, "grey", { plan: false }), LED(R(0, 0, h - 2, w * 0.2, 4, "blue"))], { tags: "air cleaner" }),
  item("dehumidifier", "Building", "Dehumidifier", 360, 280, 600, "white", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 50, { b: 15, m: "gloss" }), B(0, 0, h - 2, w * 0.8, d * 0.6, 2, "grey", 20, { m: "grille", plan: false }), B(0, d / 2 - 2, 40, w * 0.8, 4, h * 0.4, "offwhite", 20, { plan: false }), B(0, d / 2 - 1, h * 0.6, w * 0.4, 2, 50, "black", 8, { m: "blackGlass", plan: false }), LED(B(0, d / 2, h * 0.6 + 15, 40, 1, 16, "leaf3", 2))]),
  item("fanPedestal", "Building", "Pedestal fan", 450, 450, 1300, "white", (w, d, h) => {
    const hz = h - w / 2, r = w / 2 - 15;
    return [C(0, 0, 0, w * 0.32, 30, "main", d * 0.32, { m: "matte" }), C(0, 0, 30, 14, hz - 60, "steel", 14, { m: "brushed" }), C(0, 0, hz - 140, 18, 100, "main", 18),
      B(0, -0.02 * d, hz - 60, 110, 200, 120, "main", 50, { b: 25, m: "matte" }), C(0, 0.12 * d, hz, 30, 30, "main", 30, { tx: -90 }),
      ...[0, 120, 240].map((a) => S(Math.cos((a * Math.PI) / 180) * r * 0.5, 0.17 * d, hz + Math.sin((a * Math.PI) / 180) * r * 0.5, r * 0.5, "blue", { sx: 1, sy: 0.08, sz: 0.38, ty: -a, plan: false, m: "plastic" })),
      R(0, 0.17 * d, hz, r, 5, "main", { axis: "y" }), R(0, 0.22 * d, hz, r * 0.4, 3, "main", { axis: "y", plan: false }),
      ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return T([[Math.cos(a) * r * 0.4, 0.22 * d, hz + Math.sin(a) * r * 0.4], [Math.cos(a) * r, 0.17 * d, hz + Math.sin(a) * r]], 2, "main", { plan: false }); })];
  }),
  item("fanTower", "Building", "Tower fan", 300, 300, 1000, "white", (w, d, h) => [C(0, 0, 0, w / 2, 40, "main", d / 2, { m: "matte" }), B(0, 0, 40, w * 0.45, d * 0.45, h - 40, "main", 60, { b: 20, m: "matte" }), B(0, d * 0.22, 120, w * 0.3, 4, h - 260, "grey", 20, { m: "grille", plan: false }), LED(B(0, 0, h - 1, 50, 30, 1, "blue", 4))]),
  item("heaterOil", "Building", "Oil-filled radiator", 600, 250, 650, "white", (w, d, h) => [...Array.from({ length: 9 }, (_, i) => B(-w / 2 + 40 + i * ((w - 80) / 8), 0, 70, 30, d * 0.75, h - 90, "main", 14, { b: 8, plan: i === 0 || i === 8 })), B(0, 0, 70, w - 40, 30, h - 120, "main", 0, { plan: false }), ...four(w - 40, d, (x, y) => S(x, y, 40, 40, "grey", { sy: 0.6 })), B(w / 2 - 20, 0, h - 120, 30, 90, 90, "grey", 10), ...knob(w / 2, 0, h - 75, 16, "black").map((p) => ({ ...p, tz: -90, x: w / 2 - 5 })), LED(C(w / 2 - 2, 25, h - 110, 4, 3, "orange", 4, { ty: 90 }))]),
  item("vacuumStick", "Building", "Cordless stick vacuum", 260, 240, 1150, "charcoal", (w, d, h) => [B(0, 0.08 * d, 0, w, d * 0.5, 60, "main", 25, { b: 10, m: "matte" }), C(0, 0.08 * d, 40, 18, h * 0.6, "steel", 18, { m: "brushed", ty: 0 }), C(0, -0.05 * d, h * 0.62, 55, 260, "main", 55, { m: "matte", tx: 10 }), L(0, -0.1 * d, h * 0.62 + 200, [[0, 0], [48, 0], [48, 120], [0, 125]], "glass", { tx: 10 }), T([[0, -0.15 * d, h * 0.7], [0, -0.3 * d, h - 60], [0, -0.1 * d, h - 20]], 18, "main", { smooth: true }), LED(B(0, -0.12 * d, h * 0.66, 20, 2, 30, "blue", 2, { tx: 10 }))]),
  item("robotVacuum", "Building", "Robot vacuum", 350, 350, 95, "black", (w, d, h) => [C(0, 0, 8, w / 2, h - 30, "main", d / 2, { seg: 48, m: "gloss" }), C(0, 0, 8, w / 2 + 1, 25, "grey", d / 2 + 1, { seg: 48, m: "matte" }), C(0, -0.1 * d, h - 22, 45, 22, "main", 45, { m: "matte" }), LED(C(w * 0.25, 0.2 * d, h - 22, 6, 1, "leaf3", 6)), ...[-1, 1].map((s) => C(s * w * 0.3, 0.32 * d, 0, 25, 8, "grey", 25, { plan: false }))]),
  item("robotDock", "Building", "Robot vacuum with docking station", 400, 450, 450, "white", (w, d, h) => [B(0, -d * 0.3, 0, w * 0.9, d * 0.35, h, "main", 40, { b: 12, m: "gloss" }), B(0, -d * 0.05, 0, w * 0.85, d * 0.25, 15, "grey", 30), C(0, d * 0.15, 15, w * 0.42, 80, "main", w * 0.42, { seg: 48, m: "gloss" }), C(0, d * 0.08, 95, 40, 20, "offwhite", 40), LED(B(0, -d * 0.12, h * 0.8, 40, 2, 10, "blue", 2))]),
];
