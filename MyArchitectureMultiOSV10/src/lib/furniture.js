// Furniture and fixtures. Every item is described as a handful of parts
// (boxes, cylinders, spheres) in its own frame, scaled to the item's size; the
// plan symbol is the top view of those parts and the 3D model is built from
// the same list, so the drawing and the model always agree.
//
// Item frame: x across the width (−w/2…w/2), y across the depth (−d/2 is the
// back, against the wall; +d/2 the front), z up from the floor. Imported 3D
// models are furniture of kind "model" (see io/models3d.js).

export const COLORS = {
  main: "#8a9bb0", wood: "#a9784f", lightwood: "#d7b98e", dark: "#3b4048", white: "#f3f2ee", fabric: "#6f7f94", fabric2: "#8c98a8",
  cushion: "#c9ced6", metal: "#a4aab2", glass: "#a9d4e8", ceramic: "#f5f5f2", green: "#4e8b4a", leaf: "#5b9a50", trunk: "#7a5536",
  black: "#25282d", red: "#b5483e", rug: "#9e7f6b", stone: "#b9b4aa", screen: "#1c2026", water: "#7fc4dc", bulb: "#fff4dc",
};

const B = (x, y, z, w, d, h, c = "main", r = 0) => ({ t: "box", x, y, z, w, d, h, c, r });
const C = (x, y, z, rx, h, c = "main", ry = rx) => ({ t: "cyl", x, y, z, rx, ry, h, c });
const S = (x, y, z, r, c = "leaf") => ({ t: "sph", x, y, z, r, c });
// A part that glows when its lamp is on (g: 0…1, how strongly).
const G = (part, g = 1) => ({ ...part, g });

// Each builder gets the item size and returns parts.
const CATALOG = [
  // ---------------------------------------------------------------- living
  { kind: "sofa3", cat: "Living", name: "Sofa (3 seats)", w: 2100, d: 900, h: 800, color: "fabric", parts: (w, d, h) => [
    B(0, 0.1 * d, 0, w, 0.8 * d, 0.45 * h, "main", 60), B(0, -0.4 * d, 0, w, 0.2 * d, h, "main", 60),
    B(-w / 2 + 0.07 * w, 0.05 * d, 0, 0.14 * w * 0.6, 0.9 * d, 0.7 * h, "main", 50), B(w / 2 - 0.07 * w, 0.05 * d, 0, 0.14 * w * 0.6, 0.9 * d, 0.7 * h, "main", 50),
    ...[-1, 0, 1].map((k) => B((k * w) / 3.3, 0.12 * d, 0.45 * h, w / 3.6, 0.62 * d, 0.12 * h, "cushion", 40))] },
  { kind: "sofa2", cat: "Living", name: "Sofa (2 seats)", w: 1600, d: 900, h: 800, color: "fabric", parts: (w, d, h) => [
    B(0, 0.1 * d, 0, w, 0.8 * d, 0.45 * h, "main", 60), B(0, -0.4 * d, 0, w, 0.2 * d, h, "main", 60),
    B(-w / 2 + 0.06 * w, 0.05 * d, 0, 0.12 * w, 0.9 * d, 0.7 * h, "main", 50), B(w / 2 - 0.06 * w, 0.05 * d, 0, 0.12 * w, 0.9 * d, 0.7 * h, "main", 50),
    ...[-1, 1].map((k) => B((k * w) / 4.4, 0.12 * d, 0.45 * h, w / 2.6, 0.62 * d, 0.12 * h, "cushion", 40))] },
  { kind: "armchair", cat: "Living", name: "Armchair", w: 850, d: 850, h: 800, color: "fabric", parts: (w, d, h) => [
    B(0, 0.08 * d, 0, w, 0.84 * d, 0.45 * h, "main", 60), B(0, -0.4 * d, 0, w, 0.2 * d, h, "main", 60),
    B(-0.42 * w, 0.05 * d, 0, 0.16 * w, 0.9 * d, 0.7 * h, "main", 50), B(0.42 * w, 0.05 * d, 0, 0.16 * w, 0.9 * d, 0.7 * h, "main", 50),
    B(0, 0.1 * d, 0.45 * h, 0.66 * w, 0.62 * d, 0.12 * h, "cushion", 40)] },
  { kind: "coffeeTable", cat: "Living", name: "Coffee table", w: 1100, d: 600, h: 420, color: "wood", parts: (w, d, h) => [
    B(0, 0, h - 40, w, d, 40, "main", 20), ...legs(w, d, h - 40, 40), B(0, 0, 0.25 * h, w - 80, d - 80, 20, "main")] },
  { kind: "tvUnit", cat: "Living", name: "TV unit", w: 1800, d: 450, h: 500, color: "dark", parts: (w, d, h) => [
    B(0, 0, 0, w, d, h, "main", 10), B(0, -0.1 * d, h, 0.7 * w, 0.12 * d, 0.03 * w, "black"), B(0, -0.1 * d, h + 0.03 * w, 0.62 * w, 0.06 * d, 0.36 * w * 0.6, "screen")] },
  { kind: "bookshelf", cat: "Living", name: "Bookshelf", w: 900, d: 350, h: 1900, color: "wood", parts: (w, d, h) => [
    B(-w / 2 + 15, 0, 0, 30, d, h), B(w / 2 - 15, 0, 0, 30, d, h), B(0, -d / 2 + 8, 0, w, 16, h),
    ...[0, 0.2, 0.4, 0.6, 0.8, 0.985].map((k) => B(0, 0, k * h, w - 60, d, 25)),
    ...[0.03, 0.23, 0.43, 0.63].map((k, i) => B(-w * 0.15 + i * 30, 0.05 * d, k * h + 25, w * 0.55, d * 0.75, h * 0.14, ["red", "fabric", "lightwood", "fabric2"][i]))] },
  { kind: "sideTable", cat: "Living", name: "Side table", w: 500, d: 500, h: 550, color: "wood", parts: (w, d, h) => [C(0, 0, h - 30, w / 2, 30), C(0, 0, 0, w * 0.06, h - 30, "metal"), C(0, 0, 0, w * 0.3, 15, "metal")] },
  { kind: "plant", cat: "Living", name: "Plant", w: 500, d: 500, h: 1200, color: "leaf", parts: (w, d, h) => [C(0, 0, 0, w * 0.32, h * 0.28, "stone"), S(0, 0, h * 0.62, Math.min(w, d) * 0.5, "main"), S(w * 0.15, -d * 0.1, h * 0.78, Math.min(w, d) * 0.36, "main")] },
  { kind: "rug", cat: "Living", name: "Rug", w: 2000, d: 1400, h: 10, color: "rug", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 30)] },
  { kind: "floorLamp", cat: "Living", name: "Floor lamp", w: 400, d: 400, h: 1650, color: "white", light: { type: "point", lumens: 1200, at: (w, d, h) => [0, 0, h - 160] },
    parts: (w, d, h) => [C(0, 0, 0, w * 0.4, 20, "metal"), C(0, 0, 20, 12, h - 320, "metal"), G(C(0, 0, h - 320, w / 2, 320, "main", d / 2), 0.45)] },
  { kind: "piano", cat: "Living", name: "Upright piano", w: 1500, d: 600, h: 1250, color: "black", parts: (w, d, h) => [B(0, -0.15 * d, 0, w, 0.7 * d, h), B(0, 0.25 * d, 0.55 * h, w, 0.4 * d, 0.06 * h, "main"), B(0, 0.3 * d, 0.61 * h, w * 0.9, 0.2 * d, 0.02 * h, "white")] },
  // ---------------------------------------------------------------- dining
  { kind: "diningTable4", cat: "Dining", name: "Dining table (4)", w: 1400, d: 800, h: 750, color: "wood", parts: (w, d, h) => [B(0, 0, h - 40, w, d, 40, "main", 10), ...legs(w, d, h - 40, 60)] },
  { kind: "diningTable6", cat: "Dining", name: "Dining table (6)", w: 1800, d: 900, h: 750, color: "wood", parts: (w, d, h) => [B(0, 0, h - 40, w, d, 40, "main", 10), ...legs(w, d, h - 40, 60)] },
  { kind: "roundTable", cat: "Dining", name: "Round table", w: 1000, d: 1000, h: 750, color: "wood", parts: (w, d, h) => [C(0, 0, h - 40, w / 2, 40, "main", d / 2), C(0, 0, 0, 40, h - 40, "metal"), C(0, 0, 0, w * 0.25, 20, "metal", d * 0.25)] },
  { kind: "chair", cat: "Dining", name: "Chair", w: 450, d: 500, h: 900, color: "wood", parts: (w, d, h) => [B(0, 0.05 * d, 0.47 * h, w, 0.9 * d, 0.05 * h, "main", 15), ...legs(w * 0.9, d * 0.85, 0.47 * h, 35, 0.05 * d), B(0, -0.45 * d, 0.47 * h, w, 0.08 * d, 0.53 * h, "main", 10)] },
  { kind: "barStool", cat: "Dining", name: "Bar stool", w: 400, d: 400, h: 750, color: "metal", parts: (w, d, h) => [C(0, 0, h - 50, w / 2, 50, "fabric", d / 2), C(0, 0, 0, 25, h - 50, "main"), C(0, 0, 0, w * 0.4, 15, "main", d * 0.4)] },
  // ---------------------------------------------------------------- bedroom
  { kind: "doubleBed", cat: "Bedroom", name: "Double bed", w: 1600, d: 2100, h: 500, color: "white", parts: (w, d, h) => [
    B(0, 0.02 * d, 0, w, 0.96 * d, 0.6 * h, "wood", 20), B(0, 0.05 * d, 0.6 * h, w - 40, 0.9 * d, 0.4 * h, "main", 40),
    B(0, -0.48 * d, 0, w, 0.04 * d, 2 * h, "wood", 10), ...[-1, 1].map((k) => B((k * w) / 4.2, -0.38 * d, h, w * 0.4, 0.13 * d, 0.2 * h, "cushion", 60)),
    B(0, 0.22 * d, h, w - 30, 0.55 * d, 0.06 * h, "fabric2", 40)] },
  { kind: "singleBed", cat: "Bedroom", name: "Single bed", w: 1000, d: 2000, h: 500, color: "white", parts: (w, d, h) => [
    B(0, 0.02 * d, 0, w, 0.96 * d, 0.6 * h, "wood", 20), B(0, 0.05 * d, 0.6 * h, w - 40, 0.9 * d, 0.4 * h, "main", 40),
    B(0, -0.48 * d, 0, w, 0.04 * d, 2 * h, "wood", 10), B(0, -0.38 * d, h, w * 0.75, 0.13 * d, 0.2 * h, "cushion", 60), B(0, 0.22 * d, h, w - 30, 0.55 * d, 0.06 * h, "fabric2", 40)] },
  { kind: "bunkBed", cat: "Bedroom", name: "Bunk bed", w: 1000, d: 2000, h: 1700, color: "white", parts: (w, d, h) => [
    ...legs(w, d, h, 60), B(0, 0, 0.18 * h, w, d, 0.12 * h, "main", 30), B(0, 0, 0.7 * h, w, d, 0.12 * h, "main", 30), B(w / 2 - 30, 0.3 * d, 0.3 * h, 40, 0.3 * d, 0.4 * h, "wood")] },
  { kind: "wardrobe", cat: "Bedroom", name: "Wardrobe", w: 1200, d: 600, h: 2100, color: "lightwood", parts: (w, d, h) => [B(0, 0, 0, w, d, h), B(0, d / 2, h * 0.45, 20, 6, h * 0.12, "metal")] },
  { kind: "nightstand", cat: "Bedroom", name: "Nightstand", w: 450, d: 400, h: 500, color: "lightwood", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10), C(0, 0, h, w * 0.18, h * 0.5, "white")] },
  { kind: "dresser", cat: "Bedroom", name: "Dresser", w: 1000, d: 500, h: 800, color: "lightwood", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10), ...[0.25, 0.5, 0.75].map((k) => B(0, d / 2, h * k, w * 0.9, 6, 12, "metal"))] },
  { kind: "desk", cat: "Bedroom", name: "Desk", w: 1200, d: 600, h: 750, color: "white", parts: (w, d, h) => [B(0, 0, h - 30, w, d, 30, "main", 10), ...legs(w, d, h - 30, 40), B(0, -0.3 * d, h, 0.4 * w, 0.06 * d, 0.45 * h, "screen")] },
  // ---------------------------------------------------------------- kitchen
  { kind: "counter", cat: "Kitchen", name: "Kitchen counter", w: 2400, d: 600, h: 900, color: "white", parts: (w, d, h) => [B(0, 0.02 * d, 0, w, 0.96 * d, h - 40, "main"), B(0, 0, h - 40, w, d, 40, "stone"), B(0, -0.35 * d, h + 0.65 * h, w, 0.3 * d, 0.7 * h, "main")] },
  { kind: "sinkCounter", cat: "Kitchen", name: "Sink counter", w: 1200, d: 600, h: 900, color: "white", parts: (w, d, h) => [B(0, 0.02 * d, 0, w, 0.96 * d, h - 40, "main"), B(0, 0, h - 40, w, d, 40, "stone"), B(0, 0.05 * d, h - 30, 0.5 * w, 0.6 * d, 32, "metal", 40), C(0, -0.35 * d, h, 20, 250, "metal")] },
  { kind: "stove", cat: "Kitchen", name: "Cooktop", w: 600, d: 600, h: 900, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, h - 20, "main"), B(0, 0, h - 20, w, d, 20, "black"), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => C(a * w * 0.22, b * d * 0.22, h, Math.min(w, d) * 0.13, 6, "metal"))] },
  { kind: "fridge", cat: "Kitchen", name: "Refrigerator", w: 700, d: 700, h: 1800, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 20), B(0, d / 2, h * 0.62, w * 0.96, 6, 4, "dark"), B(w * 0.38, d / 2, h * 0.4, 20, 10, h * 0.18, "metal")] },
  { kind: "island", cat: "Kitchen", name: "Kitchen island", w: 1800, d: 900, h: 900, color: "white", parts: (w, d, h) => [B(0, -0.05 * d, 0, w - 100, d - 200, h - 40, "main"), B(0, 0, h - 40, w, d, 40, "stone")] },
  { kind: "dishwasher", cat: "Kitchen", name: "Dishwasher", w: 600, d: 600, h: 850, color: "metal", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main"), B(0, d / 2, h * 0.88, w * 0.8, 8, 20, "dark")] },
  // ---------------------------------------------------------------- bathroom
  { kind: "toilet", cat: "Bathroom", name: "Toilet", w: 400, d: 700, h: 800, color: "ceramic", parts: (w, d, h) => [B(0, -0.38 * d, 0.45 * h, w, 0.22 * d, 0.55 * h, "main", 30), C(0, 0.12 * d, 0, w * 0.46, 0.5 * h, "main", d * 0.34), C(0, 0.14 * d, 0.5 * h, w * 0.4, 0.04 * h, "white", d * 0.29)] },
  { kind: "washbasin", cat: "Bathroom", name: "Washbasin", w: 600, d: 450, h: 850, color: "ceramic", parts: (w, d, h) => [B(0, 0, 0.55 * h, w, d, 0.45 * h, "main", 50), C(0, 0.05 * d, h - 10, w * 0.36, 12, "water", d * 0.3), C(0, -0.4 * d, h, 15, 200, "metal"), B(0, -0.2 * d, 0, w * 0.6, d * 0.5, 0.55 * h, "white")] },
  { kind: "bathtub", cat: "Bathroom", name: "Bathtub", w: 1700, d: 750, h: 550, color: "ceramic", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 80), B(0.04 * w, 0, h - 10, w * 0.84, d * 0.74, 12, "water", 200)] },
  { kind: "shower", cat: "Bathroom", name: "Shower", w: 900, d: 900, h: 2000, color: "glass", parts: (w, d, h) => [B(0, 0, 0, w, d, 60, "ceramic", 20), B(-w / 2 + 5, 0, 60, 10, d, h - 60, "main"), B(0, d / 2 - 5, 60, w, 10, h - 60, "main"), C(w * 0.3, -d * 0.35, h - 150, 90, 20, "metal")] },
  { kind: "washer", cat: "Bathroom", name: "Washing machine", w: 600, d: 600, h: 850, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 20), B(0, d / 2 - 4, h * 0.2, w * 0.6, 10, w * 0.6, "glass", w * 0.3)] },
  // ---------------------------------------------------------------- office
  { kind: "officeDesk", cat: "Office", name: "Office desk", w: 1600, d: 800, h: 750, color: "lightwood", parts: (w, d, h) => [B(0, 0, h - 30, w, d, 30, "main", 10), B(-w / 2 + 20, 0, 0, 40, d - 40, h - 30, "metal"), B(w / 2 - 20, 0, 0, 40, d - 40, h - 30, "metal"), B(0, -0.3 * d, h, 0.35 * w, 0.06 * d, 0.5 * h, "screen")] },
  { kind: "officeChair", cat: "Office", name: "Office chair", w: 600, d: 600, h: 1000, color: "dark", parts: (w, d, h) => [C(0, 0, 0, w / 2, 40, "metal", d / 2), C(0, 0, 40, 25, 0.4 * h, "metal"), B(0, 0.05 * d, 0.45 * h, 0.8 * w, 0.75 * d, 0.08 * h, "main", 60), B(0, -0.38 * d, 0.5 * h, 0.75 * w, 0.1 * d, 0.5 * h, "main", 60)] },
  { kind: "filing", cat: "Office", name: "Filing cabinet", w: 500, d: 600, h: 1300, color: "metal", parts: (w, d, h) => [B(0, 0, 0, w, d, h), ...[0.2, 0.45, 0.7, 0.95].map((k) => B(0, d / 2, h * k - 60, w * 0.3, 8, 15, "dark"))] },
  { kind: "meetingTable", cat: "Office", name: "Meeting table", w: 2400, d: 1200, h: 750, color: "wood", parts: (w, d, h) => [B(0, 0, h - 40, w, d, 40, "main", 300), B(-w * 0.3, 0, 0, 120, d * 0.5, h - 40, "metal"), B(w * 0.3, 0, 0, 120, d * 0.5, h - 40, "metal")] },
  { kind: "workstation", cat: "Office", name: "Workstation with screen", w: 1400, d: 700, h: 1200, color: "white", parts: (w, d, h) => [
    B(0, 0.04 * d, 690, w, 0.92 * d, 30, "main", 10), B(-w / 2 + 20, 0.04 * d, 0, 40, 0.92 * d, 690, "metal"), B(w / 2 - 20, 0.04 * d, 0, 40, 0.92 * d, 690, "metal"),
    B(0, -d / 2 + 15, 300, w, 30, h - 300, "fabric2", 10), B(0, -0.25 * d, 720, 0.42 * w, 0.05 * d, 0.34 * h, "screen"), B(0.36 * w, -0.3 * d, 0, 0.2 * w, 0.32 * d, 600, "metal")] },
  { kind: "reception", cat: "Office", name: "Reception desk", w: 2400, d: 800, h: 1100, color: "lightwood", parts: (w, d, h) => [
    B(0, 0.4 * d, 0, w, 0.2 * d, h, "main", 20), B(-w / 2 + 0.05 * w, -0.05 * d, 0, 0.1 * w, 0.7 * d, h, "main"), B(w / 2 - 0.05 * w, -0.05 * d, 0, 0.1 * w, 0.7 * d, h, "main"),
    B(0, -0.05 * d, 0.66 * h, w, 0.8 * d, 30, "white"), B(0, 0.4 * d, h - 30, w, 0.2 * d, 30, "stone"), B(-0.2 * w, -0.1 * d, 0.69 * h, 0.2 * w, 0.04 * d, 0.3 * h, "screen")] },
  { kind: "printer", cat: "Office", name: "Copier / printer", w: 600, d: 550, h: 1000, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, 0.85 * h, "main", 20), B(0, -0.1 * d, 0.85 * h, w, 0.8 * d, 0.15 * h, "dark", 20), B(0.3 * w, 0.4 * d, 0.5 * h, 0.3 * w, 0.2 * d, 20, "metal")] },
  { kind: "whiteboard", cat: "Office", name: "Whiteboard", w: 1800, d: 60, h: 2100, color: "white", parts: (w, d, h) => [B(0, 0, 0.43 * h, w, d, 0.57 * h, "metal"), B(0, d * 0.2, 0.43 * h + 20, w - 40, d * 0.6, 0.57 * h - 40, "main"), B(0, 0, 0.43 * h, w * 0.6, d, 30, "metal")] },
  { kind: "serverRack", cat: "Office", name: "Server rack", w: 600, d: 1000, h: 2000, color: "black", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main"), ...[0.1, 0.25, 0.4, 0.55, 0.7].map((k) => B(0, d / 2, k * h, w * 0.8, 6, 0.1 * h, "dark"))] },
  { kind: "lockers", cat: "Office", name: "Lockers", w: 900, d: 500, h: 1800, color: "metal", parts: (w, d, h) => [B(0, 0, 0, w, d, h), ...[-1, 0, 1].map((k) => B((k * w) / 3, d / 2, 0.02 * h, w / 3 - 20, 6, 0.96 * h, "fabric2")), ...[-1, 0, 1].map((k) => B((k * w) / 3 + w / 9, d / 2 + 4, 0.55 * h, 15, 8, 80, "dark"))] },
  { kind: "sectional", cat: "Living", name: "Corner sofa", w: 2600, d: 1800, h: 800, color: "fabric", parts: (w, d, h) => [
    B(0, -d / 2 + 0.25 * d, 0, w, 0.5 * d, 0.45 * h, "main", 60), B(-w / 2 + 0.17 * w, 0.25 * d, 0, 0.34 * w, 0.5 * d, 0.45 * h, "main", 60),
    B(0, -d / 2 + 0.05 * d, 0, w, 0.1 * d, h, "main", 50), B(-w / 2 + 0.035 * w, 0.05 * d, 0, 0.07 * w, 0.9 * d, h, "main", 50),
    ...[-0.25, 0.05, 0.33].map((k) => B(k * w, -d / 2 + 0.3 * d, 0.45 * h, 0.27 * w, 0.36 * d, 0.12 * h, "cushion", 40)), B(-w / 2 + 0.2 * w, 0.27 * d, 0.45 * h, 0.24 * w, 0.42 * d, 0.12 * h, "cushion", 40)] },
  { kind: "loungeChair", cat: "Living", name: "Lounge chair", w: 750, d: 850, h: 750, color: "fabric2", parts: (w, d, h) => [C(0, 0, 0, w * 0.3, 20, "metal", d * 0.28), C(0, 0, 20, 30, 0.35 * h, "metal"), B(0, 0.05 * d, 0.38 * h, w, 0.85 * d, 0.14 * h, "main", 120), B(0, -0.4 * d, 0.38 * h, w, 0.18 * d, 0.62 * h, "main", 100)] },
  { kind: "kingBed", cat: "Bedroom", name: "King bed", w: 1900, d: 2150, h: 1100, color: "white", parts: (w, d, h) => [
    B(0, 0.02 * d, 0, w - 100, 0.96 * d, 300, "dark", 20), B(0, 0.05 * d, 300, w - 140, 0.9 * d, 200, "main", 40),
    B(0, -0.48 * d, 0, w, 0.04 * d, h, "fabric", 30), ...[-1, 1].map((k) => B((k * w) / 4.4, -0.38 * d, 500, w * 0.38, 0.13 * d, 100, "cushion", 60)),
    B(0, 0.3 * d, 500, w - 160, 0.4 * d, 30, "fabric2", 40)] },
  { kind: "crib", cat: "Bedroom", name: "Baby crib", w: 700, d: 1300, h: 1000, color: "white", parts: (w, d, h) => [...legs(w, d, h, 50), B(0, 0, 0.3 * h, w - 40, d - 40, 0.12 * h, "cushion", 20), B(-w / 2 + 15, 0, 0.42 * h, 20, d, 0.5 * h, "lightwood"), B(w / 2 - 15, 0, 0.42 * h, 20, d, 0.5 * h, "lightwood")] },
  { kind: "pantry", cat: "Kitchen", name: "Tall pantry cabinet", w: 600, d: 600, h: 2100, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, h), B(0, d / 2, 0.45 * h, 20, 8, 0.15 * h, "metal")] },
  { kind: "vanity2", cat: "Bathroom", name: "Double vanity", w: 1600, d: 550, h: 1050, color: "lightwood", parts: (w, d, h) => [B(0, 0, 0, w, d, 820, "main", 10), B(0, 0, 820, w, d, 30, "stone"), ...[-1, 1].map((k) => C((k * w) / 4, 0.05 * d, 840, w * 0.12, 12, "water", d * 0.3)), ...[-1, 1].map((k) => C((k * w) / 4, -0.4 * d, 850, 15, h - 850, "metal"))] },
  { kind: "urinal", cat: "Bathroom", name: "Urinal", w: 400, d: 350, h: 1200, color: "ceramic", parts: (w, d, h) => [B(0, -0.1 * d, 0.4 * h, w, 0.8 * d, 0.55 * h, "main", 120), C(0, 0.1 * d, 0.45 * h, w * 0.3, 0.35 * h, "water", d * 0.25)] },
  { kind: "toiletCubicle", cat: "Bathroom", name: "Toilet cubicle", w: 1000, d: 1600, h: 2000, color: "fabric2", parts: (w, d, h) => [
    B(-w / 2 + 15, 0, 150, 30, d, h - 150), B(w / 2 - 15, 0, 150, 30, d, h - 150), B(-0.3 * w, d / 2 - 15, 150, 0.4 * w, 30, h - 150), B(0.3 * w, d / 2 - 60, 150, 0.4 * w, 30, h - 150, "fabric"),
    B(0, -0.42 * d, 0.22 * h, 0.4 * w, 0.14 * d, 0.2 * h, "ceramic", 30), C(0, -0.2 * d, 0, 0.18 * w, 0.2 * h, "ceramic", 0.15 * d)] },
  // ---------------------------------------------------------------- commercial
  { kind: "shelving", cat: "Commercial", name: "Store shelving", w: 1800, d: 600, h: 1600, color: "white", parts: (w, d, h) => [
    B(0, 0, 0, w, d, 120, "dark"), B(0, 0, 0, w, 40, h, "main"), ...[0.3, 0.55, 0.8].map((k) => B(0, 0, k * h, w, d, 25, "main")),
    ...[0.075, 0.31, 0.56, 0.81].flatMap((k, i) => [-1, 1].map((s) => B(s * w * 0.22, s * d * 0.22, k * h + 25, w * 0.4, d * 0.4, 0.17 * h, ["red", "green", "fabric2", "lightwood"][i])))] },
  { kind: "checkout", cat: "Commercial", name: "Checkout counter", w: 1800, d: 700, h: 1250, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, 920, "main", 10), B(0, 0, 920, w, d, 30, "dark"), B(0.3 * w, -0.25 * d, 950, 0.18 * w, 0.2 * d, h - 950, "screen"), B(-0.2 * w, 0, 950, 0.45 * w, 0.5 * d, 8, "black")] },
  { kind: "displayTable", cat: "Commercial", name: "Display table", w: 1500, d: 900, h: 920, color: "lightwood", parts: (w, d, h) => [B(0, 0, 0, w, d, 120, "dark"), B(0, 0, 120, w - 80, d - 80, 650, "main", 10), B(0, 0, 770, w, d, 30, "white", 10), ...[-1, 0, 1].map((k) => B(k * w * 0.3, 0, 800, w * 0.2, d * 0.5, h - 800, ["red", "fabric", "green"][k + 1], 20))] },
  { kind: "clothesRack", cat: "Commercial", name: "Clothes rack", w: 1500, d: 500, h: 1600, color: "metal", parts: (w, d, h) => [
    B(0, 0, 0, w, d, 40, "dark"), C(-w / 2 + 40, 0, 40, 18, h - 40), C(w / 2 - 40, 0, 40, 18, h - 40), B(0, 0, h - 30, w, 30, 30),
    ...Array.from({ length: 7 }, (_, i) => B(-w * 0.38 + i * w * 0.127, 0, 0.42 * h, 30, d * 0.9, 0.52 * h, ["fabric", "red", "white", "fabric2", "dark", "rug", "lightwood"][i]))] },
  { kind: "vending", cat: "Commercial", name: "Vending machine", w: 900, d: 750, h: 1830, color: "red", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 20), B(-0.12 * w, d / 2, 0.35 * h, 0.66 * w, 8, 0.58 * h, "glass"), B(0.36 * w, d / 2, 0.55 * h, 0.16 * w, 10, 0.2 * h, "dark"), B(-0.12 * w, d / 2, 0.08 * h, 0.5 * w, 10, 0.12 * h, "black")] },
  { kind: "atm", cat: "Commercial", name: "ATM", w: 700, d: 800, h: 1600, color: "metal", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 20), B(0, 0.3 * d, 0.6 * h, 0.7 * w, 0.4 * d, 0.06 * h, "dark"), B(0, d / 2, 0.75 * h, 0.5 * w, 8, 0.15 * h, "screen")] },
  // ---------------------------------------------------------------- restaurant
  { kind: "booth", cat: "Restaurant", name: "Restaurant booth", w: 1500, d: 1800, h: 1100, color: "red", parts: (w, d, h) => [
    ...[-1, 1].flatMap((s) => [B(0, s * 0.39 * d, 0, w, 0.22 * d, 0.42 * h, "main", 30), B(0, s * 0.47 * d, 0, w, 0.06 * d, h, "main", 30)]),
    B(0, 0, 0.66 * h, w * 0.92, 0.42 * d, 35, "wood", 20), C(0, 0, 0, 60, 0.66 * h, "metal")] },
  { kind: "barCounter", cat: "Restaurant", name: "Bar counter", w: 3000, d: 700, h: 1100, color: "wood", parts: (w, d, h) => [B(0, 0.1 * d, 0, w, 0.6 * d, h - 40, "main", 10), B(0, 0, h - 40, w, d, 40, "stone", 10), B(0, -0.35 * d, 0.82 * h, w, 0.3 * d, 30, "stone"), ...[-0.35, -0.1, 0.15, 0.4].map((k) => C(k * w, -0.35 * d, 0.82 * h + 30, 35, 150, "glass"))] },
  { kind: "cafeTable", cat: "Restaurant", name: "Café table", w: 700, d: 700, h: 750, color: "white", parts: (w, d, h) => [C(0, 0, h - 30, w / 2, 30, "main", d / 2), C(0, 0, 0, 30, h - 30, "metal"), C(0, 0, 0, w * 0.3, 15, "metal", d * 0.3)] },
  { kind: "patioUmbrella", cat: "Outdoor", name: "Umbrella table", w: 2400, d: 2400, h: 2400, color: "white", parts: (w, d, h) => [C(0, 0, 0.3 * h - 30, 0.4 * Math.min(w, d) / 2, 30, "lightwood"), C(0, 0, 0, 25, 0.92 * h, "metal"), C(0, 0, 0.82 * h, w / 2, 0.08 * h, "main", d / 2)] },
  { kind: "range", cat: "Restaurant", name: "Commercial range with hood", w: 1200, d: 800, h: 2200, color: "metal", parts: (w, d, h) => [
    B(0, 0, 0, w, d, 900, "main"), B(0, 0, 900, w, d, 20, "black"), ...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].map(([a, b]) => C(a * w * 0.32, b * d * 0.22, 920, 110, 25, "dark")),
    B(0, -0.025 * d, 0.78 * h, w, d * 0.95, 0.12 * h, "main", 10), B(0, -0.3 * d, 0.9 * h, 0.4 * w, 0.3 * d, 0.1 * h, "main")] },
  { kind: "prepTable", cat: "Restaurant", name: "Stainless prep table", w: 1800, d: 700, h: 900, color: "metal", parts: (w, d, h) => [B(0, 0, h - 40, w, d, 40), ...legs(w, d, h - 40, 40), B(0, 0, 0.2 * h, w - 80, d - 80, 20)] },
  { kind: "coldRoom", cat: "Restaurant", name: "Walk-in cold room", w: 2400, d: 2000, h: 2400, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, h, "main", 10), B(0.2 * w, d / 2, 0, 0.4 * w, 10, 0.85 * h, "metal"), B(0.35 * w, d / 2 + 6, 0.45 * h, 40, 20, 0.15 * h, "dark")] },
  // ---------------------------------------------------------------- healthcare
  { kind: "hospitalBed", cat: "Healthcare", name: "Hospital bed", w: 1000, d: 2200, h: 1000, color: "white", parts: (w, d, h) => [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => C(a * (w / 2 - 60), b * (d / 2 - 80), 0, 40, 0.15 * h, "dark")), B(0, 0, 0.15 * h, w - 60, d - 100, 0.3 * h, "metal", 20),
    B(0, 0.03 * d, 0.45 * h, w - 100, 0.92 * d, 0.12 * h, "main", 40), B(0, -0.48 * d, 0.15 * h, w, 0.04 * d, 0.85 * h, "fabric2", 30), B(0, 0.48 * d, 0.15 * h, w, 0.04 * d, 0.55 * h, "fabric2", 30),
    ...[-1, 1].map((s) => B(s * (w / 2 - 15), -0.15 * d, 0.57 * h, 20, 0.45 * d, 0.2 * h, "metal")), B(0, -0.36 * d, 0.57 * h, w * 0.6, 0.12 * d, 0.1 * h, "cushion", 50)] },
  { kind: "examTable", cat: "Healthcare", name: "Examination table", w: 700, d: 1900, h: 950, color: "fabric2", parts: (w, d, h) => [B(0, 0, 0, w * 0.8, d * 0.8, 640, "white", 10), B(0, 0.05 * d, 640, w, 0.9 * d, 110, "main", 60), B(0, -0.4 * d, 750, w, 0.2 * d, h - 750, "main", 60)] },
  { kind: "waitingChairs", cat: "Healthcare", name: "Waiting chairs (row of 3)", w: 1800, d: 600, h: 850, color: "fabric", parts: (w, d, h) => [
    B(0, 0, 0, w, 0.12 * d, 0.4 * h, "metal"), ...[-1, 0, 1].flatMap((k) => [B((k * w) / 3, 0.05 * d, 0.47 * h, w / 3 - 40, 0.85 * d, 0.07 * h, "main", 40), B((k * w) / 3, -0.42 * d, 0.47 * h, w / 3 - 40, 0.08 * d, 0.53 * h, "main", 30)]),
    ...[-1, 1].map((s) => B(s * (w / 2 - 20), 0, 0, 40, d * 0.9, 0.47 * h, "metal"))] },
  { kind: "medCabinet", cat: "Healthcare", name: "Medical cabinet", w: 900, d: 450, h: 1900, color: "white", parts: (w, d, h) => [B(0, 0, 0, w, d, h), B(0, d / 2, 0.5 * h, w * 0.9, 8, 0.46 * h, "glass"), ...[0.1, 0.3].map((k) => B(0, d / 2, k * h, w * 0.9, 8, 4, "metal"))] },
  { kind: "ivPole", cat: "Healthcare", name: "IV stand", w: 500, d: 500, h: 1900, color: "metal", parts: (w, d, h) => [C(0, 0, 0, w / 2, 40, "dark", d / 2), C(0, 0, 40, 15, h - 40), B(0, 0, h - 60, w * 0.6, 20, 20), B(w * 0.2, 0, 0.7 * h, 80, 40, 0.15 * h, "water", 20)] },
  // ---------------------------------------------------------------- school
  { kind: "studentDesk", cat: "School", name: "Student desk", w: 700, d: 500, h: 740, color: "lightwood", parts: (w, d, h) => [B(0, 0, h - 25, w, d, 25, "main", 10), ...legs(w, d, h - 25, 30).map((p) => ({ ...p, c: "metal" })), B(0, 0, h - 180, w - 80, d - 60, 15, "metal")] },
  { kind: "studentChair", cat: "School", name: "Student chair", w: 420, d: 450, h: 820, color: "fabric2", parts: (w, d, h) => [B(0, 0.05 * d, 0.52 * h, w, 0.88 * d, 0.05 * h, "main", 30), ...legs(w * 0.9, d * 0.85, 0.52 * h, 25, 0.05 * d).map((p) => ({ ...p, c: "metal" })), B(0, -0.44 * d, 0.65 * h, w, 0.06 * d, 0.35 * h, "main", 20)] },
  { kind: "teacherDesk", cat: "School", name: "Teacher's desk", w: 1400, d: 700, h: 750, color: "wood", parts: (w, d, h) => [B(0, 0, h - 30, w, d, 30, "main", 10), B(-0.33 * w, 0, 0, 0.34 * w, d - 20, h - 30, "main"), B(0.47 * w, 0, 0, 0.06 * w, d - 20, h - 30, "main"), B(0, -0.45 * d, 0.3 * h, w * 0.9, 0.04 * d, 0.6 * h, "main")] },
  { kind: "libraryShelf", cat: "School", name: "Library shelf (double-sided)", w: 1800, d: 600, h: 1500, color: "wood", parts: (w, d, h) => [
    B(-w / 2 + 15, 0, 0, 30, d, h), B(w / 2 - 15, 0, 0, 30, d, h), B(0, 0, 0, w, 20, h), ...[0, 0.25, 0.5, 0.75, 0.985].map((k) => B(0, 0, k * h, w - 60, d, 22)),
    ...[0.015, 0.265, 0.515].flatMap((k, i) => [-1, 1].map((s) => B(-w * 0.05 * s, s * d * 0.24, k * h + 22, w * 0.82, d * 0.36, h * 0.19, ["red", "fabric", "green"][i])))] },
  { kind: "lectern", cat: "School", name: "Lectern", w: 600, d: 500, h: 1150, color: "wood", parts: (w, d, h) => [B(0, 0, 0, w, d, 40, "dark"), B(0, -0.1 * d, 40, w * 0.7, d * 0.6, 0.85 * h), B(0, 0, 0.9 * h, w, d, 0.1 * h, "main", 10)] },
  // ---------------------------------------------------------------- fitness / leisure
  { kind: "treadmill", cat: "Fitness", name: "Treadmill", w: 800, d: 1900, h: 1400, color: "dark", parts: (w, d, h) => [B(0, 0.08 * d, 0, w, 0.84 * d, 0.15 * h, "main", 60), B(0, 0.08 * d, 0.15 * h, w * 0.7, 0.78 * d, 15, "black"), ...[-1, 1].map((s) => B(s * (w / 2 - 30), -0.38 * d, 0, 50, 60, 0.85 * h, "metal")), B(0, -0.4 * d, 0.85 * h, w, 0.12 * d, 0.15 * h, "screen", 20)] },
  { kind: "spinBike", cat: "Fitness", name: "Exercise bike", w: 550, d: 1150, h: 1200, color: "red", parts: (w, d, h) => [B(0, 0, 0, w, 80, 50, "dark"), B(0, 0.4 * d, 0, w * 0.8, 80, 50, "dark"), B(0, 0.15 * d, 50, 60, 0.75 * d, 0.5 * h, "main"), C(0, -0.25 * d, 0.2 * h, 40, 0.5 * h, "metal"), B(0, -0.25 * d, 0.72 * h, 250, 300, 80, "black", 60), B(0, 0.4 * d, 0.85 * h, w, 60, 40, "black")] },
  { kind: "weightBench", cat: "Fitness", name: "Weight bench", w: 1800, d: 1300, h: 1500, color: "black", parts: (w, d, h) => [B(0, 0.1 * d, 0.28 * h, 300, 0.75 * d, 80, "main", 40), B(0, 0.1 * d, 0, 120, 0.7 * d, 0.28 * h, "metal"), ...[-1, 1].map((s) => B(s * 0.3 * w, -0.35 * d, 0, 60, 60, 0.8 * h, "metal")), C(0, -0.35 * d, 0.7 * h, 15, 10, "metal"), B(0, -0.35 * d, 0.7 * h, w, 30, 30, "metal"), ...[-1, 1].map((s) => B(s * 0.44 * w, -0.35 * d, 0.6 * h, 40, 300, 300, "main", 150))] },
  { kind: "poolTable", cat: "Fitness", name: "Pool table", w: 1400, d: 2600, h: 800, color: "wood", parts: (w, d, h) => [B(0, 0, 0.2 * h, w, d, 0.8 * h, "main", 40), B(0, 0, h - 5, w - 160, d - 160, 10, "green"), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * (w / 2 - 120), b * (d / 2 - 120), 0, 140, 140, 0.2 * h, "dark"))] },
  { kind: "liftCar", cat: "Building", name: "Elevator car", w: 1600, d: 1400, h: 2300, color: "metal", parts: (w, d, h) => [B(0, 0, 0, w, d, 60, "dark"), B(-w / 2 + 20, 0, 60, 40, d, h - 60), B(w / 2 - 20, 0, 60, 40, d, h - 60), B(0, -d / 2 + 20, 60, w, 40, h - 60, "glass"), B(0, 0, h - 60, w, d, 60, "dark")] },
  { kind: "planter", cat: "Building", name: "Planter box", w: 1800, d: 500, h: 1100, color: "stone", parts: (w, d, h) => [B(0, 0, 0, w, d, 0.5 * h, "main", 20), ...[-1, 0, 1].map((k) => S(k * w * 0.32, 0, 0.62 * h, Math.min(w / 6, d / 2), "leaf"))] },
  { kind: "fireExtinguisher", cat: "Building", name: "Fire hose cabinet", w: 700, d: 200, h: 1700, color: "red", parts: (w, d, h) => [B(0, 0, 0.3 * h, w, d, 0.7 * h, "main", 10), B(0, d / 2, 0.45 * h, w * 0.8, 6, 0.45 * h, "glass")] },
  // ---------------------------------------------------------------- outdoor / other
  { kind: "pergola", cat: "Outdoor", name: "Pergola", w: 3600, d: 3000, h: 2700, color: "wood", parts: (w, d, h) => [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * (w / 2 - 75), b * (d / 2 - 75), 0, 150, 150, h - 200)), ...[-1, 1].map((s) => B(0, s * (d / 2 - 75), h - 200, w, 100, 200)),
    ...Array.from({ length: 9 }, (_, i) => B(-w / 2 + 100 + i * ((w - 200) / 8), 0, h - 100, 60, d, 100))] },
  { kind: "pool", cat: "Outdoor", name: "Swimming pool", w: 8000, d: 4000, h: 60, color: "water", parts: (w, d, h) => [B(0, 0, 0, w, d, h * 0.5, "stone"), B(0, 0, h * 0.5, w - 600, d - 600, h * 0.5, "main")] },
  { kind: "streetLamp", cat: "Outdoor", name: "Street lamp", w: 400, d: 1200, h: 4500, color: "dark", light: { type: "spot", lumens: 4000, beam: 110, at: (w, d, h) => [0, 0.35 * d, h - 170], dir: [0, 0, -1] },
    parts: (w, d, h) => [C(0, -0.35 * d, 0, w / 2, 300, "main", w / 2), C(0, -0.35 * d, 300, 50, h - 300), B(0, 0, h - 80, 60, 0.8 * d, 60), G(B(0, 0.35 * d, h - 160, 250, 400, 100, "white", 40), 0.8)] },
  { kind: "bikeRack", cat: "Outdoor", name: "Bicycle rack", w: 1800, d: 600, h: 800, color: "metal", parts: (w, d, h) => Array.from({ length: 5 }, (_, i) => B(-w * 0.4 + i * w * 0.2, 0, 0, 40, d, h, "main", 20)) },
  { kind: "parkingSpace", cat: "Outdoor", name: "Parking space marking", w: 2500, d: 5000, h: 10, color: "white", parts: (w, d, h) => [B(-w / 2 + 50, 0, 0, 100, d, h), B(w / 2 - 50, 0, 0, 100, d, h), B(0, -d / 2 + 50, 0, w, 100, h)] },
  { kind: "car", cat: "Outdoor", cat: "Outdoor", name: "Car", w: 1800, d: 4500, h: 1500, color: "red", parts: (w, d, h) => [
    B(0, 0, 0.18 * h, w, d, 0.4 * h, "main", 300), B(0, 0.05 * d, 0.58 * h, w * 0.86, d * 0.48, 0.38 * h, "glass", 250),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * (w / 2 - 110), b * d * 0.32, 0, 200, 0.14 * d, 0.36 * h, "black", 80))] },
  { kind: "tree", cat: "Outdoor", name: "Tree", w: 3000, d: 3000, h: 5000, color: "leaf", parts: (w, d, h) => [C(0, 0, 0, Math.min(w, d) * 0.06, h * 0.55, "trunk"), S(0, 0, h * 0.62, Math.min(w, d) * 0.5, "main"), S(w * 0.18, d * 0.1, h * 0.8, Math.min(w, d) * 0.3, "main")] },
  { kind: "shrub", cat: "Outdoor", name: "Shrub", w: 1000, d: 1000, h: 900, color: "leaf", parts: (w, d, h) => [S(0, 0, h * 0.45, Math.min(w, d) * 0.5, "main")] },
  { kind: "bench", cat: "Outdoor", name: "Bench", w: 1500, d: 450, h: 450, color: "wood", parts: (w, d, h) => [B(0, 0, h - 50, w, d, 50), B(-w * 0.4, 0, 0, 60, d, h - 50, "dark"), B(w * 0.4, 0, 0, 60, d, h - 50, "dark")] },
  // ---------------------------------------------------------------- lighting
  // Light fixtures: `light` makes the item a lamp (3D light source, on/off,
  // brightness, colour); `mount` places it: "ceiling" hangs it under the
  // ceiling of its level, "wall" at `elev` on a wall, otherwise on the floor
  // (or on a table: raise its elevation). Parts with `g` glow when it is on.
  { kind: "ceilingLight", cat: "Lighting", name: "Ceiling light", w: 500, d: 500, h: 120, color: "white", mount: "ceiling", light: { type: "point", lumens: 2000, at: (w, d, h) => [0, 0, 0.3 * h] },
    parts: (w, d, h) => [C(0, 0, h - 25, w / 2, 25, "main", d / 2), G(C(0, 0, 0, w * 0.45, h - 25, "bulb", d * 0.45), 1)] },
  { kind: "pendantLamp", cat: "Lighting", name: "Pendant lamp", w: 400, d: 400, h: 900, color: "dark", mount: "ceiling", light: { type: "point", lumens: 900, at: (w, d, h) => [0, 0, 120] },
    parts: (w, d, h) => [C(0, 0, h - 20, 60, 20, "main"), C(0, 0, 260, 6, h - 280, "black"), C(0, 0, 60, w / 2, 200, "main", d / 2), G(S(0, 0, 100, Math.min(w, d) * 0.14, "bulb"), 1), G(C(0, 0, 50, w * 0.42, 12, "bulb", d * 0.42), 0.8)] },
  { kind: "downlight", cat: "Lighting", name: "Recessed downlight", w: 160, d: 160, h: 40, color: "white", mount: "ceiling", light: { type: "spot", lumens: 700, beam: 70, at: (w, d, h) => [0, 0, 0], dir: [0, 0, -1] },
    parts: (w, d, h) => [C(0, 0, 8, w / 2, h - 8, "main", d / 2), G(C(0, 0, 0, w * 0.34, 8, "bulb", d * 0.34), 1)] },
  { kind: "spotlight", cat: "Lighting", name: "Spotlight", w: 160, d: 160, h: 300, color: "black", mount: "ceiling", light: { type: "spot", lumens: 600, beam: 36, at: (w, d, h) => [0, 0, 20], dir: [0, 0.35, -1] },
    parts: (w, d, h) => [C(0, 0, h - 30, w * 0.4, 30, "metal", d * 0.4), C(0, 0, 150, 12, h - 180, "metal"), C(0, 0, 20, w / 2, 130, "main", d / 2), G(C(0, 0, 0, w * 0.38, 20, "bulb", d * 0.38), 1)] },
  { kind: "trackLight", cat: "Lighting", name: "Track light (3 spots)", w: 1500, d: 160, h: 300, color: "black", mount: "ceiling", light: { type: "spot", lumens: 1800, beam: 50, at: (w, d, h) => [0, 0, 20], dir: [0, 0.3, -1] },
    parts: (w, d, h) => [B(0, 0, h - 40, w, 50, 40, "metal"), ...[-0.35, 0, 0.35].flatMap((k) => [C(k * w, 0, 150, 10, h - 190, "metal"), C(k * w, 0, 20, d / 2, 130, "main"), G(C(k * w, 0, 0, d * 0.38, 20, "bulb"), 1)])] },
  { kind: "wallSconce", cat: "Lighting", name: "Wall sconce", w: 300, d: 160, h: 320, color: "white", mount: "wall", elev: 1800, light: { type: "point", lumens: 450, at: (w, d, h) => [0, 0.05 * d, 0.5 * h] },
    parts: (w, d, h) => [B(0, -d / 2 + 10, 0.25 * h, 0.35 * w, 20, 0.5 * h, "metal"), G(C(0, 0.06 * d, 0, w / 2, h, "main", d * 0.44), 0.6)] },
  { kind: "tableLamp", cat: "Lighting", name: "Table lamp", w: 350, d: 350, h: 550, color: "white", light: { type: "point", lumens: 450, at: (w, d, h) => [0, 0, 0.7 * h] },
    parts: (w, d, h) => [C(0, 0, 0, w * 0.3, 20, "metal", d * 0.3), C(0, 0, 20, 10, 0.5 * h, "metal"), G(C(0, 0, 0.5 * h, w / 2, 0.5 * h, "main", d / 2), 0.5)] },
  { kind: "box", cat: "Other", name: "Box", w: 1000, d: 1000, h: 1000, color: "main", parts: (w, d, h) => [B(0, 0, 0, w, d, h)] },
  { kind: "cylinder", cat: "Other", name: "Cylinder", w: 600, d: 600, h: 1000, color: "main", parts: (w, d, h) => [C(0, 0, 0, w / 2, h, "main", d / 2)] },
];

// Four legs inset `inset` from the corners, `size` square.
function legs(w, d, h, size, dy = 0) {
  const x = w / 2 - size / 2 - 10;
  const y = d / 2 - size / 2 - 10;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * x, b * y + dy, 0, size, size, h, "main"));
}

const BY_KIND = new Map(CATALOG.map((c) => [c.kind, c]));

export const FURNITURE_CATEGORIES = [...new Set(CATALOG.map((c) => c.cat))];

export function allFurniture() {
  return CATALOG.slice();
}

export function furnitureDef(kind) {
  return BY_KIND.get(kind) || null;
}

// A new furniture item of `kind` at (x, y).
export function makeFurniture(kind, x, y, extra = {}) {
  const def = furnitureDef(kind) || furnitureDef("box");
  const item = { kind: def.kind, x, y, rot: 0, w: def.w, d: def.d, h: def.h, elevation: mountElevation(def), color: null };
  if (def.light) item.light = defaultLight(def);
  return { ...item, ...extra };
}

// ---------------------------------------------------------------- lights
// A lamp item carries `light: {on, lumens, color, beam?}`; the catalogue
// entry says what kind of source it is (point or spot), where the bulb sits
// in the item frame and which way a spot points.
// Colour temperatures (kelvin → light colour) offered in the properties.
export const LIGHT_TEMPERATURES = [[2700, "#ffd3a3"], [3000, "#ffdfba"], [4000, "#fff1de"], [5000, "#fff8f0"], [6500, "#eef3ff"]];
const DEFAULT_LIGHT_COLOR = "#ffdfba";

export const isLightKind = (kind) => !!(furnitureDef(kind) && furnitureDef(kind).light);
export const isLight = (item) => !!item && isLightKind(item.kind);

export function defaultLight(def) {
  const l = { on: true, lumens: def.light.lumens, color: DEFAULT_LIGHT_COLOR };
  if (def.light.type === "spot") l.beam = def.light.beam || 60;
  return l;
}

// Default elevation for a fixture: under the ceiling (of a level
// `levelHeight` high), at its wall height, or on the floor.
export function mountElevation(def, levelHeight = 2800) {
  if (!def) return 0;
  if (def.mount === "ceiling") return Math.max(0, levelHeight - def.h);
  if (def.mount === "wall") return def.elev ?? 1800;
  return 0;
}

// Clean up an item's light settings (load, kind change): lamps get a full
// light object, other items lose a stray one.
export function normalizeLight(item) {
  const def = furnitureDef(item.kind);
  if (!def || !def.light) { delete item.light; return item; }
  const src = item.light && typeof item.light === "object" ? item.light : {};
  const d = defaultLight(def);
  const n = (v, dv) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : dv);
  const l = { on: src.on !== false, lumens: Math.max(0, Math.min(100000, n(src.lumens, d.lumens))), color: /^#[0-9a-f]{6}$/i.test(src.color || "") ? src.color : d.color };
  if (def.light.type === "spot") l.beam = Math.max(5, Math.min(170, n(src.beam, d.beam)));
  item.light = l;
  return item;
}

// Resolved light of an item, or null: {type, on, lumens, color, beam, at: [x, y, z]
// (item frame, mm), dir: [x, y, z] (item frame, spots only)}.
export function lightOf(item) {
  const def = furnitureDef(item && item.kind);
  if (!def || !def.light) return null;
  const l = { ...defaultLight(def), ...(item.light || {}) };
  return { type: def.light.type, on: l.on !== false, lumens: +l.lumens || 0, color: l.color || DEFAULT_LIGHT_COLOR, beam: l.beam || def.light.beam || 60, at: def.light.at(item.w, item.d, item.h), dir: def.light.dir || [0, 0, -1] };
}

// The on/off symbol drawn over a lamp in the plan (item frame, like
// drawFurniturePlan): a circle with a cross, filled and with rays when on.
export function drawLightSymbol(ctx, item, th, px = 10) {
  const l = lightOf(item);
  if (!l) return;
  const [x, y] = l.at;
  const r = Math.max(7 * px, Math.min(item.w, item.d, 600) * 0.32);
  ctx.save();
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = l.on ? (th.lightOnFill || "rgba(255, 196, 64, 0.55)") : (th.lightOffFill || "rgba(128, 128, 128, 0.12)");
  ctx.fill();
  ctx.strokeStyle = l.on ? (th.lightOn || "#e8a800") : (th.lightOff || th.furniture);
  ctx.stroke();
  const k = r * Math.SQRT1_2;
  ctx.beginPath();
  ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
  ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
  if (l.on) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25);
      ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// Resolved parts of an item (colour keys turned into hex colours).
export function furnitureParts(item) {
  const def = furnitureDef(item.kind);
  if (!def) return [B(0, 0, 0, item.w, item.d, item.h)];
  const main = item.color || COLORS[def.color] || COLORS.main;
  return def.parts(item.w, item.d, item.h).map((p) => ({ ...p, color: p.c === "main" ? main : COLORS[p.c] || p.c }));
}

// Plan symbol of an item in its own frame (the caller applies x, y, rot).
// `px` is one screen pixel in millimetres (keeps the strokes thin).
export function drawFurniturePlan(ctx, item, th, px = 10) {
  const parts = furnitureParts(item).slice().sort((a, b) => a.z + (a.h || a.r || 0) - (b.z + (b.h || b.r || 0)));
  ctx.lineWidth = px;
  ctx.lineJoin = "round";
  for (const p of parts) {
    ctx.beginPath();
    if (p.t === "box") {
      const r = Math.min(p.r || 0, p.w / 2, p.d / 2);
      if (r > 0 && ctx.roundRect) ctx.roundRect(p.x - p.w / 2, p.y - p.d / 2, p.w, p.d, r);
      else ctx.rect(p.x - p.w / 2, p.y - p.d / 2, p.w, p.d);
    } else if (p.t === "cyl") ctx.ellipse(p.x, p.y, Math.max(1, p.rx), Math.max(1, p.ry), 0, 0, Math.PI * 2);
    else ctx.arc(p.x, p.y, Math.max(1, p.r), 0, Math.PI * 2);
    ctx.fillStyle = th.furnitureFill;
    ctx.fill();
    ctx.strokeStyle = th.furniture;
    ctx.stroke();
  }
}

// Footprint outline points of an item in world coordinates (for hit tests).
export function furnitureCorners(item) {
  const c = Math.cos(((item.rot || 0) * Math.PI) / 180);
  const s = Math.sin(((item.rot || 0) * Math.PI) / 180);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = (a * item.w) / 2, y = (b * item.d) / 2;
    return [item.x + x * c - y * s, item.y + x * s + y * c];
  });
}
