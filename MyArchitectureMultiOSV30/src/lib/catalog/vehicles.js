// Road vehicles: one detailed builder for cars, vans, trucks and buses.
// A body profile (side view, rounded) in the body colour, a narrower glass
// cabin with roof and A / B / C pillars, tyres standing out of the body side
// over dark wheel arches, rims with spokes and a hub, bumpers, grille, number
// plates, head and tail lights, mirrors, door seams and handles. Boxy
// vehicles (vans, trucks, buses) get glass panels on their faces instead of a
// cabin. Item frame: x across, y from the back (−d/2) to the front (+d/2), z up.
import { B, C, E, R, T, G, SB, item } from "./common.js";

const CAT = "Vehicles";

// Rounds the corners of a closed outline (Chaikin, n passes).
function rounded(pts, n = 2) {
  let p = pts;
  for (let k = 0; k < n; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

// Side profiles, [u along the length from the back 0 to the front 1, v up 0…1 of the height].
const PROFILES = {
  sedan: { body: [[0, 0.3], [0, 0.52], [0.06, 0.6], [0.27, 0.62], [0.68, 0.6], [0.93, 0.52], [1, 0.44], [1, 0.24], [0.97, 0.15], [0.03, 0.15]], cabin: [[0.24, 0.6], [0.36, 0.97], [0.62, 0.97], [0.72, 0.6]], axles: [0.2, 0.8], lights: [0.38, 0.47], doors: [0.36, 0.52, 0.68] },
  hatch: { body: [[0, 0.28], [0.01, 0.62], [0.1, 0.64], [0.66, 0.6], [0.92, 0.52], [1, 0.42], [1, 0.22], [0.97, 0.14], [0.03, 0.14]], cabin: [[0.04, 0.62], [0.11, 0.97], [0.56, 0.97], [0.69, 0.6]], axles: [0.18, 0.82], lights: [0.37, 0.5], doors: [0.3, 0.48, 0.66] },
  suv: { body: [[0, 0.28], [0, 0.6], [0.04, 0.63], [0.7, 0.62], [0.94, 0.56], [1, 0.46], [1, 0.24], [0.97, 0.18], [0.03, 0.18]], cabin: [[0.04, 0.62], [0.07, 0.98], [0.64, 0.98], [0.74, 0.61]], axles: [0.19, 0.81], lights: [0.42, 0.5], doors: [0.3, 0.5, 0.7], rails: true },
  coupe: { body: [[0, 0.32], [0.02, 0.55], [0.15, 0.58], [0.7, 0.52], [0.95, 0.42], [1, 0.34], [1, 0.2], [0.97, 0.12], [0.03, 0.12]], cabin: [[0.2, 0.57], [0.4, 0.95], [0.58, 0.95], [0.74, 0.53]], axles: [0.19, 0.8], lights: [0.3, 0.46], doors: [0.4, 0.7] },
  roadster: { body: [[0, 0.34], [0.02, 0.58], [0.15, 0.6], [0.7, 0.55], [0.95, 0.44], [1, 0.36], [1, 0.2], [0.97, 0.12], [0.03, 0.12]], cabin: [[0.62, 0.55], [0.66, 0.82], [0.69, 0.82], [0.74, 0.55]], axles: [0.19, 0.8], lights: [0.32, 0.48], doors: [0.4, 0.66], open: true },
  minivan: { body: [[0, 0.25], [0, 0.56], [0.03, 0.59], [0.78, 0.58], [0.95, 0.5], [1, 0.4], [1, 0.2], [0.97, 0.13], [0.03, 0.13]], cabin: [[0.02, 0.57], [0.04, 0.97], [0.72, 0.97], [0.86, 0.58]], axles: [0.17, 0.83], lights: [0.36, 0.48], doors: [0.3, 0.55, 0.74] },
  pickup: { body: [[0, 0.28], [0, 0.58], [0.02, 0.6], [0.46, 0.6], [0.7, 0.62], [0.94, 0.56], [1, 0.46], [1, 0.24], [0.97, 0.18], [0.03, 0.18]], cabin: [[0.46, 0.6], [0.48, 0.98], [0.64, 0.98], [0.74, 0.61]], axles: [0.19, 0.81], lights: [0.42, 0.5], doors: [0.48, 0.6, 0.72] },
  city: { body: [[0, 0.28], [0.01, 0.6], [0.1, 0.62], [0.7, 0.58], [0.93, 0.5], [1, 0.4], [1, 0.22], [0.97, 0.14], [0.03, 0.14]], cabin: [[0.05, 0.6], [0.12, 0.98], [0.6, 0.98], [0.76, 0.58]], axles: [0.17, 0.83], lights: [0.38, 0.5], doors: [0.36, 0.7] },
};

/**
 * A car-like vehicle (sedan, hatch, SUV, coupe, roadster, minivan, city): w × d × h mm.
 * o: { type, clearance, wheel (radius, mm), tumble (cabin width share), extras (u, v → mm helpers) }
 */
export function carBody(w, d, h, o = {}) {
  const P = PROFILES[o.type || "sedan"];
  const Y = (u) => -d / 2 + u * d, Z = (v) => v * h;
  const at = (pts) => pts.map(([u, v]) => [Y(u), Z(v)]);
  const out = [];
  const wr = o.wheel || Math.min(380, Math.max(300, h * 0.22));
  const tumble = o.tumble ?? 0.84;
  const cw = w * tumble;
  // Body (colour), cabin glass (dark), roof and pillars on the cabin.
  out.push(E(0, 0, 0, rounded(at(P.body), 2), w, "main", { axis: "x", b: 40, m: "gloss" }));
  const cab = at(P.cabin);
  out.push(E(0, 0, 0, rounded(cab, 1), cw, "screen", { axis: "x", b: 30, m: "blackGlass" }));
  const [c0, c1, c2, c3] = cab; // back base, back top, front top, front base
  if (!P.open) {
    out.push(E(0, 0, 0, [[c1[0] + 40, c1[1] - 30], [c2[0] - 40, c2[1] - 30], [c2[0] - 40, c2[1] + 6], [c1[0] + 40, c1[1] + 6]], cw - 30, "main", { axis: "x", m: "gloss", plan: false }));
    // The B pillar between the side windows (the glass's own edges read as the A and C pillars).
    const mid = (c0[0] + c3[0]) / 2 + (c3[0] - c0[0]) * 0.06; // B pillar
    for (const s of [-1, 1]) out.push(B(s * (cw / 2 + 4), mid, c0[1], 10, 70, c1[1] - c0[1], "main", 0, { m: "gloss", plan: false }));
    if (P.rails) for (const s of [-1, 1]) out.push(T([[s * (cw / 2 - 70), c1[0] + 60, c1[1] + 50], [s * (cw / 2 - 70), c2[0] - 80, c2[1] + 50]], 14, "steel", { plan: false }));
  } else {
    // A roadster: open, the seats show (two of them, behind the screen).
    for (const s of [-1, 1]) out.push(SB(s * w * 0.2, Y(0.48), Z(0.5), w * 0.3, d * 0.1, h * 0.28, "black", 0.3, { m: "leather", plan: false }));
    out.push(SB(0, Y(0.52), Z(0.58), w * 0.84, d * 0.02, h * 0.05, "black", 0.4, { plan: false }));
  }
  wheelsAndTrim(out, w, d, h, { Y, Z, wr, axles: P.axles, lights: P.lights, doors: P.doors, belt: c0[1], mirrorY: c3[0] - 80, front: 1 });
  return out;
}

// Tyres over dark arches, rims, bumpers, grille, plates, lights, mirrors, seams and handles.
function wheelsAndTrim(out, w, d, h, { Y, Z, wr, axles, lights, doors = [], belt, mirrorY = null, grille = true }) {
  const tyreW = wr * 0.56;
  for (const s of [-1, 1]) {
    for (const u of axles) {
      const y = Y(u);
      // The wheel arch: a dark half disc on the body side, above the axle.
      const arch = [];
      for (let i = 0; i <= 12; i++) { const a = (Math.PI * i) / 12; arch.push([y + Math.cos(a) * wr * 1.12, wr + Math.sin(a) * wr * 1.12]); }
      out.push(E(s * (w / 2 + 2), 0, 0, arch, 4, "black", { axis: "x", plan: false }));
      const cx = s * (w / 2 - tyreW / 2 + 12); // the tyre stands a little out of the body
      out.push(R(cx, y, wr, wr - tyreW / 2, tyreW / 2, "tyre", { axis: "x" }));
      // The rim on the tyre's outer face (a disc 40 deep: its outer face 8 mm beyond the tyre), spokes and a hub on it.
      const face = cx + s * (tyreW / 2 + 8); // outer face of the rim
      out.push(C(s > 0 ? face - 40 : face, y, wr, wr * 0.6, 40, "chrome", wr * 0.6, { ty: 90, plan: false }));
      for (let k = 0; k < 5; k++) out.push(B(face + s * 5, y, wr, 10, wr * 0.13, wr * 0.52, "steel", 0, { tx: k * 72, plan: false }));
      out.push(C(s > 0 ? face : face - 18, y, wr, wr * 0.15, 18, "dark", wr * 0.15, { ty: 90, plan: false }));
    }
    // Head and tail lights at the corners.
    out.push(G(B(s * (w / 2 - w * 0.17), d / 2 - 20, Z(lights[0]), w * 0.24, 50, h * 0.06, "white", 15, { m: "glass", plan: false }), 0.7));
    out.push(G(B(s * (w / 2 - w * 0.14), -d / 2 + 20, Z(lights[1]), w * 0.2, 50, h * 0.055, "red", 12, { plan: false }), 0.5));
    // Mirrors, door seams and handles.
    if (mirrorY !== null) out.push(B(s * (w / 2 + 25), mirrorY, belt + 20, 90, 60, 80, "main", 20, { m: "gloss", plan: false }));
    for (const u of doors) out.push(B(s * (w / 2 + 1), Y(u), Z(0.2), 4, 6, belt - Z(0.2) - 20, "black", 0, { plan: false }));
    for (let i = 0; i + 1 < doors.length; i++) out.push(B(s * (w / 2 + 6), Y(doors[i + 1]) - 160, belt - 120, 14, 130, 25, "chrome", 6, { plan: false }));
  }
  // Bumpers, grille and number plates.
  out.push(B(0, d / 2 - 70, Z(0.15), w * 0.97, 150, h * 0.13, "dark", 40, { plan: false }));
  out.push(B(0, -d / 2 + 70, Z(0.15), w * 0.97, 150, h * 0.13, "dark", 40, { plan: false }));
  if (grille) out.push(B(0, d / 2 - 12, Z(lights[0]) - h * 0.08, w * 0.4, 30, h * 0.09, "black", 20, { plan: false }));
  out.push(B(0, d / 2 + 5, Z(0.17), 520, 10, 110, "white", 0, { plan: false }), B(0, -d / 2 - 5, Z(0.2), 520, 10, 110, "white", 0, { plan: false }));
}

/**
 * A boxy vehicle (van, truck, bus): a body outline, glass panels on its faces instead of a cabin.
 * o: { body (u, v outline), axles, lights, windscreen [[u, v], [u, v]] (bottom, top of the front glass),
 *      windows [[u1, u2, v1, v2] …] (side glass), doors, extras(out, helpers) }
 */
export function boxBody(w, d, h, o) {
  const Y = (u) => -d / 2 + u * d, Z = (v) => v * h;
  const out = [];
  const wr = o.wheel || Math.min(560, Math.max(340, h * 0.16));
  out.push(E(0, 0, 0, rounded(o.body.map(([u, v]) => [Y(u), Z(v)]), 1), w, "main", { axis: "x", b: 50, m: "gloss" }));
  // The windscreen: a band just outside the body face between its two points.
  if (o.windscreen) {
    const [[u1, v1], [u2, v2]] = o.windscreen, a = [Y(u1), Z(v1)], b = [Y(u2), Z(v2)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (a[1] - b[1]) / L, ny = (b[0] - a[0]) / L; // outward: to the front
    const o2 = (p, k) => [p[0] + nx * k * (nx < 0 ? -1 : 1), p[1] + ny * k * (nx < 0 ? -1 : 1)];
    out.push(E(0, 0, 0, [o2(a, 2), o2(b, 2), o2(b, 22), o2(a, 22)], w * 0.88, "screen", { axis: "x", m: "blackGlass", plan: false }));
  }
  for (const [u1, u2, v1, v2] of o.windows || []) for (const s of [-1, 1]) out.push(B(s * (w / 2 + 3), (Y(u1) + Y(u2)) / 2, Z(v1), 8, Y(u2) - Y(u1), Z(v2) - Z(v1), "screen", 20, { m: "blackGlass", plan: false }));
  wheelsAndTrim(out, w, d, h, { Y, Z, wr, axles: o.axles, lights: o.lights, doors: o.doors || [], belt: Z(o.belt ?? 0.5), mirrorY: o.mirror === false ? null : Y(o.mirrorU ?? 0.86), grille: o.grille !== false });
  if (o.extras) o.extras(out, { Y, Z, w, d, h });
  return out;
}

// ---------------------------------------------------------------- the vehicles
const vanBody = (w, d, h, extras) => boxBody(w, d, h, {
  body: [[0, 0.14], [0, 0.97], [0.02, 0.99], [0.76, 0.99], [0.86, 0.62], [0.97, 0.5], [1, 0.4], [1, 0.18], [0.97, 0.12], [0.03, 0.12]],
  windscreen: [[0.86, 0.62], [0.765, 0.97]], windows: [[0.74, 0.85, 0.56, 0.86]], axles: [0.16, 0.84], lights: [0.38, 0.4], doors: [0.72, 0.86], belt: 0.55, mirrorU: 0.84, extras,
});
const busBody = (w, d, h, extras) => boxBody(w, d, h, {
  body: [[0, 0.1], [0, 0.95], [0.01, 1], [0.99, 1], [1, 0.95], [1, 0.1]],
  windscreen: [[1, 0.3], [1, 0.9]], windows: [...Array.from({ length: 7 }, (_, i) => [0.05 + i * 0.12, 0.15 + i * 0.12, 0.45, 0.86])], axles: [0.2, 0.84], lights: [0.2, 0.3], doors: [0.88, 0.97], belt: 0.45, mirrorU: 0.99, grille: false, wheel: 520, extras,
});
const truckBody = (w, d, h, extras) => boxBody(w, d, h, {
  body: [[0.7, 0.12], [0.7, 0.72], [0.74, 0.75], [0.86, 0.75], [0.95, 0.6], [1, 0.48], [1, 0.16], [0.97, 0.1], [0.7, 0.1]],
  windscreen: [[0.95, 0.6], [0.865, 0.74]], windows: [[0.76, 0.88, 0.45, 0.68]], axles: [0.18, 0.84], lights: [0.3, 0.3], doors: [0.74, 0.9], belt: 0.45, mirrorU: 0.9, wheel: 480, extras,
});
const lightBar = (out, { Y, Z, w }, u, v, colours = ["red", "blue"]) => colours.forEach((c, i) => out.push(G(B((i - (colours.length - 1) / 2) * w * 0.28, Y(u), Z(v), w * 0.26, 220, 110, c, 30, { m: "glass", plan: false }), 1)));

export const VEHICLES = [
  item("car", CAT, "Car", 1800, 4500, 1500, "red", (w, d, h) => carBody(w, d, h, { type: "sedan" }), { tags: "sedan saloon automobile" }),
  item("carHatch", CAT, "Compact hatchback", 1750, 4000, 1480, "blue", (w, d, h) => carBody(w, d, h, { type: "hatch" }), { tags: "hatchback automobile" }),
  item("carSUV", CAT, "SUV", 1950, 4750, 1750, "charcoal", (w, d, h) => carBody(w, d, h, { type: "suv", wheel: 400, tumble: 0.86 }), { tags: "suv jeep crossover automobile" }),
  item("van", CAT, "Delivery van", 2050, 5400, 2500, "white", (w, d, h) => vanBody(w, d, h), { tags: "van delivery" }),
  item("bus", CAT, "City bus", 2550, 12000, 3200, "yellow", (w, d, h) => busBody(w, d, h), { tags: "bus coach" }),
  // New ones.
  item("carCoupe", CAT, "Sports coupe", 1900, 4500, 1300, "orange", (w, d, h) => carBody(w, d, h, { type: "coupe", wheel: 340, tumble: 0.8 }), { tags: "coupe sports car" }),
  item("carRoadster", CAT, "Convertible roadster", 1850, 4300, 1250, "red", (w, d, h) => carBody(w, d, h, { type: "roadster", wheel: 330 }), { tags: "convertible cabriolet roadster" }),
  item("carMinivan", CAT, "Minivan", 1950, 5100, 1800, "steel", (w, d, h) => carBody(w, d, h, { type: "minivan", wheel: 360, tumble: 0.88 }), { tags: "minivan mpv people carrier" }),
  item("carCity", CAT, "City electric car", 1650, 3500, 1550, "sage", (w, d, h) => carBody(w, d, h, { type: "city", wheel: 300, tumble: 0.86 }), { tags: "electric ev small car" }),
  item("carPickup", CAT, "Pickup truck", 2000, 5400, 1850, "navy", (w, d, h) => {
    // The cab over the front; the open bed behind it (its floor dark, a tailgate at the back).
    const Y = (u) => -d / 2 + u * d, Z = (v) => v * h;
    return [...carBody(w, d, h, { type: "pickup", wheel: 420, tumble: 0.88 }),
      B(0, Y(0.24), Z(0.6) - 4, w - 140, d * 0.4, 6, "dark", 0, { plan: false }),
      B(0, Y(0.01), Z(0.58), w - 60, 60, Z(0.06), "main", 10, { m: "gloss", plan: false })];
  }, { tags: "pickup truck ute" }),
  item("carTaxi", CAT, "Taxi", 1800, 4800, 1500, "yellow", (w, d, h) => [...carBody(w, d, h, { type: "sedan" }), G(B(0, -d / 2 + 0.49 * d, 0.97 * h + 8, 420, 160, 120, "white", 30, { plan: false }), 0.8)], { tags: "taxi cab" }),
  item("carPolice", CAT, "Patrol car", 1850, 4900, 1520, "white", (w, d, h) => {
    const out = carBody(w, d, h, { type: "sedan" });
    lightBar(out, { Y: (u) => -d / 2 + u * d, Z: (v) => v * h, w }, 0.49, 0.975);
    for (const s of [-1, 1]) out.push(B(s * (w / 2 + 3), 0, 0.3 * h, 6, d * 0.7, 0.08 * h, "navy", 0, { plan: false }));
    return out;
  }, { tags: "police patrol emergency" }),
  item("ambulance", CAT, "Ambulance", 2100, 6000, 2700, "white", (w, d, h) => vanBody(w, d, h, (out, k) => {
    lightBar(out, k, 0.72, 0.99, ["red", "red", "blue"]);
    for (const s of [-1, 1]) { out.push(B(s * (w / 2 + 3), k.Y(0.36), k.Z(0.38), 6, d * 0.7, k.Z(0.08), "red", 0, { plan: false })); out.push(B(s * (w / 2 + 4), k.Y(0.36), k.Z(0.58), 6, 500, 500, "red", 0, { plan: false })); }
  }), { tags: "ambulance emergency hospital" }),
  item("truckBox", CAT, "Box truck", 2450, 7500, 3400, "white", (w, d, h) => truckBody(w, d, h, (out, k) => {
    out.push(B(0, k.Y(0.35), k.Z(0.17), w, d * 0.68, k.Z(0.81), "white", 20, { m: "gloss" }));
    out.push(B(0, k.Y(0.01), k.Z(0.18), w - 80, 20, k.Z(0.76), "steel", 0, { plan: false }));
  }), { tags: "lorry truck moving" }),
  item("fireEngine", CAT, "Fire engine", 2500, 9000, 3300, "red", (w, d, h) => truckBody(w, d, h, (out, k) => {
    out.push(B(0, k.Y(0.35), k.Z(0.14), w, d * 0.68, k.Z(0.6), "main", 20, { m: "gloss" }));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) out.push(B(s * (w / 2 + 3), k.Y(0.08 + i * 0.15), k.Z(0.25), 6, d * 0.12, k.Z(0.4), "steel", 10, { plan: false }));
    for (const s of [-1, 1]) out.push(T([[s * w * 0.3, k.Y(0.02), k.Z(0.78)], [s * w * 0.3, k.Y(0.85), k.Z(0.8)]], 30, "steel", { plan: false }));
    for (let i = 0; i < 12; i++) out.push(B(0, k.Y(0.05 + i * 0.065), k.Z(0.78), w * 0.6, 30, 30, "steel", 0, { plan: false }));
    lightBar(out, k, 0.78, 0.75, ["red", "red", "red"]);
  }), { tags: "fire truck emergency" }),
  item("schoolBus", CAT, "School bus", 2500, 11000, 3200, "yellow", (w, d, h) => busBody(w, d, h, (out, k) => {
    for (const s of [-1, 1]) out.push(B(s * (w / 2 + 3), 0, k.Z(0.4), 6, d * 0.96, 60, "black", 0, { plan: false }));
  }), { tags: "school bus" }),
];
