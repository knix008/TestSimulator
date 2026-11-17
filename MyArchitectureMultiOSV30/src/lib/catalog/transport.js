// Lifts and escalators: lift cars (passenger, panoramic, bed, freight, home,
// car), landing entrances, platform and stair lifts, a dumbwaiter, escalators
// and moving walkways.
//
// An escalator or an inclined walkway is drawn on the lower floor: the bottom
// landing at the item's origin height, the top landing `h − 1000` higher (the
// floor-to-floor rise; the balustrade stands 950 above it). Setting the height
// to the storey height + 1000 lands it on the floor above; that floor needs a
// hole over the incline (a slab hole or an opening).
import { B, C, E, T, G, SB, item, variant } from "./common.js";

const CAT = "Lifts & escalators";
const HAND = 950; // handrail height above the steps

// A rounded end of a balustrade: a half circle about (y, z) of radius r, from
// the top (dir −1: towards −y) or the bottom (dir +1: towards +y).
function newel(y, z, r, dir, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (dir < 0 ? 1 : -1) * (Math.PI * i) / n; out.push([y + r * Math.cos(a), z + r * Math.sin(a)]); }
  return out;
}

// An escalator (steps) or a moving walkway / ramp (pallets), centred on x = ox,
// w wide, d long (landings included), rising `rise` from −y to +y.
// o: { steps, glass, land, base (raised deck of a flat walkway), side: "main" colour of the cladding }
export function mover(ox, w, d, rise, o = {}) {
  const out = [];
  const land = o.land ?? Math.min(1300, d * 0.15);
  const base = rise > 0 ? 0 : o.base ?? 150;
  const y1 = -d / 2 + land, y2 = d / 2 - land, run = y2 - y1;
  const bw = o.glass ? 70 : 120; // deck / balustrade width each side
  const iw = w - 2 * bw; // the band of steps or pallets
  // The truss under the incline (its top sits under the steps), or the raised deck of a flat walkway.
  if (rise > 0) {
    const dz = o.steps ? 200 : 0, t = rise / run, Td = Math.min(1000, rise * 0.6);
    out.push(E(ox, 0, 0, [[y1, -dz], [y2, rise - dz], [d / 2, rise - dz], [d / 2, rise - Td], [y2, rise - Td], [y1 + Td / t, 0]], w, "main", { axis: "x" }));
  } else {
    out.push(B(ox, 0, 0, w, d, base, "main", 0));
  }
  // Landing plates (comb plates).
  out.push(B(ox, -d / 2 + land / 2, base, iw, land, 15, "steel", 0, { plan: false }));
  out.push(B(ox, d / 2 - land / 2, base + rise, iw, land, 15, "steel", 0, { plan: false }));
  // The moving surface.
  if (rise > 0 && o.steps) {
    const n = Math.max(3, Math.round(rise / 210)), r = rise / n, g = run / n;
    for (let k = 0; k < n; k++) {
      const yc = y1 + (k + 0.5) * g, top = (k + 1) * r;
      out.push(B(ox, yc, k * r - 200, iw - 20, g - 8, r + 200, "black", 0, { plan: false }));
      out.push(B(ox, y1 + k * g + 20, top, iw - 20, 30, 2, "yellow", 0, { plan: false })); // the step nose line, 2 mm proud
    }
  } else if (rise > 0) {
    out.push(E(ox, 0, 0, [[y1, 0], [y2, rise], [y2, rise + 30], [y1, 30]], iw - 20, "black", { axis: "x", m: "rubber", plan: false }));
  } else {
    out.push(B(ox, 0, base, iw - 20, d - 2 * land, 30, "black", 0, { m: "rubber", plan: false }));
  }
  // Balustrades: the band from the steps up to the handrail with rounded ends, and the handrail.
  const yb = -d / 2 + 450, yt = d / 2 - 450, R0 = HAND / 2;
  const line = rise > 0 ? [[y1, base], [y2, base + rise]] : [];
  const band = (h0, h1) => [[yb, base + h0], ...line.map(([y, z]) => [y, z + h0]), [yt, base + rise + h0], ...newel(yt, base + rise + (h0 + h1) / 2, (h1 - h0) / 2, 1).slice(1, -1), [yt, base + rise + h1], ...line.slice().reverse().map(([y, z]) => [y, z + h1]), [yb, base + h1], ...newel(yb, base + (h0 + h1) / 2, (h1 - h0) / 2, -1).slice(1, -1)];
  const rail = [[yb, base + HAND], ...line.map(([y, z]) => [y, z + HAND]), [yt, base + rise + HAND]];
  for (const s of [-1, 1]) {
    const x = ox + s * (w / 2 - bw / 2);
    if (o.glass) {
      out.push(E(x, 0, 0, band(0, 120), bw, "steel", { axis: "x" })); // the deck and skirt
      out.push(E(x, 0, 0, band(120, HAND - 40), 12, "glass", { axis: "x", plan: false }));
    } else {
      out.push(E(x, 0, 0, band(0, HAND - 40), bw, o.side || "main", { axis: "x" }));
      out.push(E(x - s * (bw / 2 + 1), 0, 0, band(40, 140), 2, "steel", { axis: "x", plan: false })); // stainless skirt on the step side
    }
    out.push(T([[x, yb - R0, base + R0], ...newel(yb, base + R0, R0, -1).reverse().slice(1).map(([y, z]) => [x, y, z]), ...rail.slice(1).map(([y, z]) => [x, y, z]), ...newel(yt, base + rise + R0, R0, 1).slice(1).map(([y, z]) => [x, y, z])].filter((q, i, a) => i === 0 || Math.hypot(q[1] - a[i - 1][1], q[2] - a[i - 1][2]) > 1), 35, "black", { m: "rubber", plan: false }));
  }
  return out;
}

// ---------------------------------------------------------------- lift cars
// A lift car open at the front (+y): floor, walls, ceiling with a light, handrail, panel.
export function car(w, d, h, o = {}) {
  const wall = o.wall || "main", out = [];
  out.push(B(0, 0, 0, w, d, 40, o.floor || "granite", 0, o.floorM ? { m: o.floorM } : undefined));
  if (o.glassBack) {
    out.push(B(0, -d / 2 + 6, 40, w - 160, 12, h - 80, "glass", 0));
    for (const s of [-1, 1]) out.push(B(s * (w / 2 - 40), -d / 2 + 40, 40, 80, 80, h - 80, wall, 0));
  } else out.push(B(0, -d / 2 + 15, 40, w, 30, h - 80, wall, 0));
  for (const s of [-1, 1]) {
    if (o.glassSides) {
      out.push(B(s * (w / 2 - 6), 0, 40, 12, d - 160, h - 80, "glass", 0));
      out.push(B(s * (w / 2 - 40), d / 2 - 40, 40, 80, 80, h - 80, wall, 0));
    } else out.push(B(s * (w / 2 - 15), 0, 40, 30, d, h - 80, wall, 0));
  }
  out.push(B(0, 0, h - 40, w, d, 40, wall, 0));
  out.push(G(B(0, 0, h - 42, w * 0.7, d * 0.7, 2, "white", 0, { plan: false }), 0.6));
  // Handrails along the back and sides.
  const hr = o.rail ?? 900;
  if (hr) {
    out.push(T([[-w / 2 + 50, -d / 2 + 70, hr], [w / 2 - 50, -d / 2 + 70, hr]], 18, "chrome", { plan: false }));
    if (o.sideRails) for (const s of [-1, 1]) out.push(T([[s * (w / 2 - 70), -d / 2 + 120, hr], [s * (w / 2 - 70), d / 2 - 250, hr]], 18, "chrome", { plan: false }));
  }
  // Bumper rails (bed and freight lifts).
  if (o.bumpers) for (const z of o.bumpers) {
    out.push(B(0, -d / 2 + 45, z, w - 60, 30, 120, o.bumperC || "oak", 0, { plan: false }));
    for (const s of [-1, 1]) out.push(B(s * (w / 2 - 45), 0, z, 30, d - 60, 120, o.bumperC || "oak", 0, { plan: false }));
  }
  // The button panel on the right wall beside the door.
  if (!o.glassSides) {
    out.push(B(w / 2 - 32, d / 2 - 200, 900, 4, 200, 500, "black", 0, { plan: false }));
    out.push(G(B(w / 2 - 35, d / 2 - 200, 1300, 3, 120, 50, "orange", 0, { plan: false }), 1));
  }
  return out;
}

const liftCar = item("liftCar", CAT, "Elevator car", 1600, 1400, 2300, "metal", (w, d, h) => [...car(w, d, h), B(0, -d / 2 + 32, 900, w * 0.6, 4, 1100, "mirror", 0, { plan: false })], { tags: "lift elevator passenger" });

const items = [
  liftCar,
  item("liftGlass", CAT, "Panoramic glass elevator", 1500, 1500, 2400, "steel", (w, d, h) => [...car(w, d, h, { glassBack: true, glassSides: true, floor: "marble", rail: 950 }), ...[-1, 1].map((s) => T([[s * (w / 2 - 60), -d / 2 + 70, 950], [s * (w / 2 - 60), d / 2 - 150, 950]], 18, "chrome", { plan: false })), B(w / 2 - 120, d / 2 - 45, 900, 60, 4, 450, "black", 0, { plan: false })], { tags: "lift elevator panoramic scenic atrium" }),
  item("liftBed", CAT, "Bed elevator (hospital)", 1600, 2700, 2300, "steel", (w, d, h) => car(w, d, h, { floor: "concrete", floorM: "matte", sideRails: true, bumpers: [250], bumperC: "grey" }), { tags: "lift elevator hospital stretcher" }),
  item("liftFreight", CAT, "Freight elevator", 2400, 3000, 2600, "steel", (w, d, h) => [...car(w, d, h, { floor: "steel", rail: 0, bumpers: [200, 800, 1400], bumperC: "oak" }), B(0, d / 2 - 40, 40, w - 60, 60, 4, "yellow", 0, { plan: false })], { tags: "lift elevator goods service" }),
  item("liftHome", CAT, "Home elevator", 1000, 1250, 2200, "oak", (w, d, h) => [...car(w, d, h, { floor: "oak", rail: 900 }), SB(-w / 2 + 120, 0, 500, 180, 450, 40, "cognac", 0.3, { m: "leather", plan: false })], { tags: "lift elevator residential villa" }),
  item("liftVehicle", CAT, "Car elevator", 2800, 5800, 2400, "steel", (w, d, h) => [B(0, 0, 0, w, d, 60, "steel", 0), C(0, 0, 60, Math.min(w, d) * 0.45, 4, "grey", Math.min(w, d) * 0.45, { m: "concrete", plan: false }), ...[-1, 1].flatMap((s) => [B(s * (w / 2 - 50), 0, 60, 100, d, h - 60, "main", 0), ...Array.from({ length: 6 }, (_, i) => B(s * (w / 2 - 102), -d / 2 + 400 + i * ((d - 800) / 5), 300, 4, 200, 120, i % 2 ? "black" : "yellow", 0, { plan: false }))]), B(0, -d / 2 + 50, 60, w, 100, h - 60, "main", 0), B(0, 0, h - 60, w, d, 60, "main", 0), G(B(0, 0, h - 62, w * 0.3, d * 0.8, 2, "white", 0, { plan: false }), 0.5)], { tags: "lift elevator parking garage" }),
  item("liftEntrance", CAT, "Elevator entrance (landing doors)", 1800, 250, 2600, "steel", (w, d, h) => {
    const ow = Math.min(1100, w - 500), oh = Math.min(2100, h - 400), jw = (w - ow) / 2, f = d / 2;
    return [B(0, -d / 2 + 60, 0, w, 120, h, "marble", 0), ...[-1, 1].map((s) => B(s * (ow / 2 + jw / 2), f - 60, 0, jw, 120, h, "main", 0)), B(0, f - 60, oh, ow, 120, h - oh, "main", 0),
      ...[-1, 1].map((s) => B(s * (ow / 4 + 1), -d / 2 + 140, 0, ow / 2 - 2, 30, oh, "main", 0, { m: "brushed", plan: false })), B(0, f - 2, 0, ow + 100, 8, 10, "steel", 0, { plan: false }),
      G(B(0, f + 1, oh + 150, 300, 2, 90, "black", 0, { m: "screen", plan: false }), 1), G(B(0, f + 2, oh + 180, 80, 2, 30, "orange", 0, { plan: false }), 1),
      B(ow / 2 + jw / 2, f + 1, 1000, 90, 4, 260, "black", 0, { plan: false }), ...[0, 1].map((k) => G(C(ow / 2 + jw / 2, f + 3, 1060 + k * 110, 22, 4, "white", 22, { tx: -90, plan: false }), 1))];
  }, { tags: "lift elevator doors landing call button" }),
  item("platformLift", CAT, "Wheelchair platform lift", 1100, 1500, 2300, "white", (w, d, h) => [B(0, 0, 0, w, d, 80, "steel", 0), B(0, -d / 2 + 120, 0, w, 240, h, "main", 20), ...[-1, 1].map((s) => B(s * (w / 2 - 8), 120, 80, 16, d - 240, 1100, "glass", 0, { plan: false })), ...[-1, 1].map((s) => T([[s * (w / 2 - 8), -d / 2 + 240, 1180], [s * (w / 2 - 8), d / 2, 1180]], 20, "steel", { plan: false })), B(w / 2 - 80, -d / 2 + 260, 950, 120, 40, 200, "black", 0, { plan: false }), B(0, d / 2 - 20, 80, w - 40, 40, 4, "yellow", 0, { plan: false })], { tags: "lift accessible wheelchair disabled" }),
  item("stairLift", CAT, "Stair lift", 800, 3600, 2800, "cream", (w, d, h) => {
    const rx = w / 2 - 80, z0 = 350, z1 = h - 700;
    return [T([[rx, -d / 2 + 200, z0 - 200], [rx, d / 2 - 200, z1 - 200]], 40, "steel"), ...[[-d / 2 + 200, z0 - 200], [d / 2 - 200, z1 - 200]].map(([y, z]) => B(rx, y, 0, 60, 60, z, "steel", 0)),
      B(rx - 60, -d / 2 + 450, z0 - 200, 160, 260, 380, "white", 30), SB(0, -d / 2 + 450, z0 + 120, 480, 440, 90, "main", 0.25, { m: "leather" }), SB(0, -d / 2 + 450 - 230, z0 + 200, 480, 90, 560, "main", 0.3, { m: "leather", plan: false }),
      ...[-1, 1].map((s) => B(s * 250, -d / 2 + 470, z0 + 380, 50, 380, 40, "white", 15, { plan: false })), B(0, -d / 2 + 560, 60, 380, 300, 30, "white", 10, { plan: false }), B(0, -d / 2 + 520, 60, 40, 40, z0 + 70, "white", 0, { plan: false })];
  }, { tags: "chair lift stairs accessible" }),
  item("dumbwaiter", CAT, "Dumbwaiter", 700, 600, 900, "steel", (w, d, h) => [B(0, 0, 0, w, d, h, "main", 0), B(0, d / 2, 60, w - 120, 4, h - 160, "main", 0, { m: "brushed", plan: false }), B(0, d / 2 + 4, 200, 160, 20, 24, "chrome", 0, { plan: false }), B(w / 2 - 30, d / 2 + 2, h - 80, 40, 4, 60, "black", 0, { plan: false })], { mount: "wall", elev: 800, tags: "service lift kitchen hatch" }),
  // ---------------------------------------------------------------- escalators and walkways
  item("escalator", CAT, "Escalator", 1400, 9530, 5000, "steel", (w, d, h) => mover(0, w, d, Math.max(0, h - 1000), { steps: true }), { tags: "escalator moving stairs mall station" }),
  item("escalatorGlass", CAT, "Escalator (glass balustrade)", 1400, 9530, 5000, "steel", (w, d, h) => mover(0, w, d, Math.max(0, h - 1000), { steps: true, glass: true }), { tags: "escalator moving stairs mall" }),
  item("escalatorPair", CAT, "Escalator pair (up and down)", 2800, 9530, 5000, "steel", (w, d, h) => [-1, 1].flatMap((s) => mover((s * w) / 4, w / 2, d, Math.max(0, h - 1000), { steps: true, glass: true })), { tags: "escalator twin mall department store" }),
  item("movingWalkway", CAT, "Moving walkway", 1600, 20000, 1100, "steel", (w, d) => mover(0, w, d, 0, { glass: true, land: 1500 }), { tags: "travelator airport conveyor" }),
  item("movingRamp", CAT, "Inclined moving walkway", 1600, 17100, 4000, "steel", (w, d, h) => mover(0, w, d, Math.max(0, h - 1000), { glass: true, land: 1500 }), { tags: "travelator ramp supermarket incline" }),
];

// Sizes and finishes of the same products.
items.push(
  variant(items.find((d) => d.kind === "liftCar"), "liftCarSmall", "Elevator car (8 persons)", { w: 1400, d: 1300 }),
  variant(items.find((d) => d.kind === "liftCar"), "liftCarLarge", "Elevator car (17 persons)", { w: 2000, d: 1600, color: "brass" }),
  variant(items.find((d) => d.kind === "liftEntrance"), "liftEntranceWide", "Elevator entrance (wide)", { w: 2300 }),
  variant(items.find((d) => d.kind === "escalator"), "escalatorNarrow", "Escalator (narrow, 600 step)", { w: 1000 }),
  variant(items.find((d) => d.kind === "escalator"), "escalatorBlack", "Escalator (black)", { color: "black" }),
);

export default items;
