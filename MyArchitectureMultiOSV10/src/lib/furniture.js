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
  black: "#25282d", red: "#b5483e", rug: "#9e7f6b", stone: "#b9b4aa", screen: "#1c2026", water: "#7fc4dc",
};

const B = (x, y, z, w, d, h, c = "main", r = 0) => ({ t: "box", x, y, z, w, d, h, c, r });
const C = (x, y, z, rx, h, c = "main", ry = rx) => ({ t: "cyl", x, y, z, rx, ry, h, c });
const S = (x, y, z, r, c = "leaf") => ({ t: "sph", x, y, z, r, c });

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
  { kind: "floorLamp", cat: "Living", name: "Floor lamp", w: 400, d: 400, h: 1650, color: "white", parts: (w, d, h) => [C(0, 0, 0, w * 0.4, 20, "metal"), C(0, 0, 20, 12, h - 320, "metal"), C(0, 0, h - 320, w / 2, 320, "main", d / 2)] },
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
  // ---------------------------------------------------------------- outdoor / other
  { kind: "car", cat: "Outdoor", name: "Car", w: 1800, d: 4500, h: 1500, color: "red", parts: (w, d, h) => [
    B(0, 0, 0.18 * h, w, d, 0.4 * h, "main", 300), B(0, 0.05 * d, 0.58 * h, w * 0.86, d * 0.48, 0.38 * h, "glass", 250),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * (w / 2 - 110), b * d * 0.32, 0, 200, 0.14 * d, 0.36 * h, "black", 80))] },
  { kind: "tree", cat: "Outdoor", name: "Tree", w: 3000, d: 3000, h: 5000, color: "leaf", parts: (w, d, h) => [C(0, 0, 0, Math.min(w, d) * 0.06, h * 0.55, "trunk"), S(0, 0, h * 0.62, Math.min(w, d) * 0.5, "main"), S(w * 0.18, d * 0.1, h * 0.8, Math.min(w, d) * 0.3, "main")] },
  { kind: "shrub", cat: "Outdoor", name: "Shrub", w: 1000, d: 1000, h: 900, color: "leaf", parts: (w, d, h) => [S(0, 0, h * 0.45, Math.min(w, d) * 0.5, "main")] },
  { kind: "bench", cat: "Outdoor", name: "Bench", w: 1500, d: 450, h: 450, color: "wood", parts: (w, d, h) => [B(0, 0, h - 50, w, d, 50), B(-w * 0.4, 0, 0, 60, d, h - 50, "dark"), B(w * 0.4, 0, 0, 60, d, h - 50, "dark")] },
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
  return { kind: def.kind, x, y, rot: 0, w: def.w, d: def.d, h: def.h, elevation: 0, color: null, ...extra };
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
