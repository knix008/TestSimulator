// Builders shared by the catalogue files: families of real products (sofas,
// chairs, tables, beds, cabinets, lamps, plants…) made of furnparts.js parts,
// each a function of the item size (w, d, h) so a resized item keeps its look.
// Item frame: x across, y from the back (−d/2, against the wall) to the front
// (+d/2), z up; millimetres.
import { B, C, S, L, E, T, R, G, SB, rrect, ellipsePts, smoothProfile, rng } from "../furnparts.js";
export { B, C, S, L, E, T, R, G, SB, rrect, ellipsePts, smoothProfile, rng };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { clamp };

// A catalogue entry. extra: {light, mount, elev, tags}.
export const item = (kind, cat, name, w, d, h, color, parts, extra = {}) => ({ kind, cat, name, w, d, h, color, parts, ...extra });
// The same product in another colour or size.
export const variant = (base, kind, name, over = {}) => ({ ...base, kind, name, ...over });

// ---------------------------------------------------------------- legs
// Tapered round leg: radius r at the top, k·r at the foot.
export const taperLeg = (x, y, z, r, h, c = "main", k = 0.62, o) => C(x, y, z, r * k, h, c, r * k, { top: 1 / k, ...o });
// Four legs at the corners of w × d (centres), each mk(x, y, sx, sy).
export const four = (w, d, mk) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => mk((a * w) / 2, (b * d) / 2, a, b));
// Hairpin leg: a bent rod from the top plate down to the floor and back.
export const hairpin = (x, y, h, sx, c = "black", r = 6) => T([[x - sx * 40, y, h], [x, y, 25], [x, y, 0], [x + sx * 10, y, 25], [x + sx * 40, y, h]].map(([a, b, z]) => [a, b, z]), r, c, { smooth: true });

// ---------------------------------------------------------------- upholstery
// Sofa / armchair: frame, arms, back, seat and back cushions, legs, pillows.
// o: {seats, arms: "track"|"round"|"slim"|"none", legs: "taper"|"block"|"metal"|"none",
//     legC, cushionC, pillows: [colour…], tufted, skirt, backCushions}
export function sofa(w, d, h, o = {}) {
  const n = o.seats ?? Math.max(1, Math.round(w / 700));
  const legH = o.legs === "none" || o.skirt ? 0 : clamp(0.12 * h, 60, 160);
  const armW = o.arms === "none" ? 0 : clamp(o.arms === "slim" ? 0.05 * w : 0.1 * w, 70, o.arms === "slim" ? 120 : 240);
  const armH = clamp(0.72 * h, 450, 680);
  const bd = clamp(0.22 * d, 150, 260); // back depth
  const seatZ = legH + clamp(0.3 * h - legH * 0.6, 150, 300); // top of the frame under the cushions
  const out = [];
  // Frame under the seat.
  out.push(SB(0, 0.01 * d, legH, w - 6, d * 0.98, seatZ - legH, "main", 0.05));
  // Back.
  out.push(SB(0, -d / 2 + bd / 2, legH, w - 2 * armW * 0.2, bd, h - legH, "main", 0.32));
  // Arms.
  if (armW) for (const s of [-1, 1]) {
    if (o.arms === "round") {
      out.push(SB(s * (w / 2 - armW / 2), 0.01 * d, legH, armW, d * 0.98, armH - legH - armW * 0.35, "main", 0.12));
      out.push(T([[s * (w / 2 - armW / 2), -d / 2 + bd * 0.6, armH - armW * 0.45], [s * (w / 2 - armW / 2), d / 2 - armW * 0.5, armH - armW * 0.45]], armW * 0.48, "main"));
    } else out.push(SB(s * (w / 2 - armW / 2), 0.01 * d, legH, armW, d * 0.98, armH - legH, "main", o.arms === "slim" ? 0.4 : 0.22));
  }
  // Seat cushions.
  const cw = (w - 2 * armW - 10) / n, cd = d - bd - 20, ch = clamp(0.2 * h, 110, 190);
  for (let i = 0; i < n; i++) out.push(SB(-w / 2 + armW + 5 + cw * (i + 0.5), -d / 2 + bd + cd / 2 + 5, seatZ, cw - 8, cd, ch, o.cushionC || "main", 0.22));
  // Back cushions, leaning back.
  if (o.backCushions !== false) {
    const bh = clamp(h - seatZ - ch - 20, 200, 520);
    for (let i = 0; i < n; i++) out.push(SB(-w / 2 + armW + 5 + cw * (i + 0.5), -d / 2 + bd + 75, seatZ + ch - 20, cw - 10, 150, bh, o.cushionC || "main", 0.38, { tx: 10 }));
  }
  if (o.tufted) for (let i = 0; i < Math.max(2, n * 3); i++) for (const z of [0.66, 0.84]) out.push(S(-w / 2 + armW + ((w - 2 * armW) * (i + 0.5)) / Math.max(2, n * 3), -d / 2 + bd + 2, z * h, 9, "main"));
  // Throw pillows at the ends.
  (o.pillows || []).forEach((c, i) => {
    const s = i % 2 ? 1 : -1;
    out.push(SB(s * (w / 2 - armW - 260 - (i >> 1) * 180), -d / 2 + bd + 140, seatZ + ch - 10, 420, 130, 420, c, 0.45, { tx: 16, tz: s * -8 }));
  });
  // Legs.
  if (legH) {
    const lx = w / 2 - 70, ly = d / 2 - 70;
    if (o.legs === "metal") out.push(...four(lx * 2, ly * 2, (x, y) => B(x, y, 0, 40, 40, legH, o.legC || "black", 4)));
    else if (o.legs === "block") out.push(...four(lx * 2, ly * 2, (x, y) => B(x, y, 0, 70, 70, legH, o.legC || "darkwood", 8)));
    else out.push(...four(lx * 2, ly * 2, (x, y) => taperLeg(x, y, 0, 24, legH, o.legC || "oak")));
  }
  return out;
}

// ---------------------------------------------------------------- chairs
// Wooden dining chair with spindle back.
export function woodChair(w, d, h, o = {}) {
  const sz = clamp(0.5 * h, 400, 480), lc = o.legC || "main", sc = o.seatC || "main";
  const out = [];
  // Seat.
  out.push(o.padded ? SB(0, 0.03 * d, sz - 30, w * 0.96, d * 0.86, 60, sc, 0.18) : B(0, 0.03 * d, sz - 28, w * 0.96, d * 0.86, 28, sc, 30, { b: 6 }));
  // Front legs (tapered), back legs carry on up as the back posts, leaning back a little.
  for (const s of [-1, 1]) {
    out.push(taperLeg(s * (w / 2 - 35), d / 2 - 50, 0, 18, sz - 28, lc));
    out.push(T([[s * (w / 2 - 35), -d / 2 + 30, 0], [s * (w / 2 - 35), -d / 2 + 45, sz], [s * (w / 2 - 38), -d / 2 + 18, h - 10]], 16, lc));
  }
  // Rails under the seat.
  out.push(B(0, d / 2 - 50, sz - 90, w - 90, 18, 55, lc, 0, { plan: false }), B(0, -d / 2 + 45, sz - 90, w - 90, 18, 55, lc, 0, { plan: false }));
  // Back: curved top rail and spindles.
  const top = h - 80;
  out.push(T([[-w / 2 + 38, -d / 2 + 22, top], [0, -d / 2 + 6, top + 12], [w / 2 - 38, -d / 2 + 22, top]], 30, lc, { smooth: true }));
  if (o.slats) out.push(B(0, -d / 2 + 26, sz + 0.45 * (top - sz), w - 90, 18, 70, lc, 0, { tx: 4 }));
  else for (const k of [-0.5, -0.17, 0.17, 0.5]) out.push(T([[k * (w - 100), -d / 2 + 40, sz], [k * (w - 100) * 1.02, -d / 2 + 18, top]], 9, lc));
  return out;
}

// Upholstered dining chair.
export function padChair(w, d, h, o = {}) {
  const sz = clamp(0.5 * h, 420, 480), lc = o.legC || "walnut";
  return [
    SB(0, 0.04 * d, sz - 80, w, d * 0.9, 90, "main", 0.12),
    SB(0, -d / 2 + 55, sz - 20, w * 0.96, 70, h - sz + 20, "main", 0.22, { tx: 7 }),
    ...four(w - 70, d - 90, (x, y, a, b) => taperLeg(x, y + 0.02 * d, 0, 20, sz - 80, lc, 0.6, { ty: -a * 3, tx: b * 3 })),
  ];
}

// Moulded shell chair on splayed wooden legs with a wire cross (the mid-century classic).
export function shellChair(w, d, h, o = {}) {
  const sz = clamp(0.48 * h, 400, 460);
  const prof = [[d / 2 - 10, sz + 25], [d / 2 - 40, sz], [-d / 2 + 140, sz - 10], [-d / 2 + 60, sz + 40], [-d / 2 + 22, sz + 200], [-d / 2 + 10, h - 5], [-d / 2 + 30, h - 5], [-d / 2 + 45, sz + 200], [-d / 2 + 80, sz + 60], [-d / 2 + 150, sz + 15], [d / 2 - 40, sz + 20], [d / 2 - 10, sz + 40]];
  const out = [E(0, 0, 0, prof, w * 0.98, o.shellC || "main", { axis: "x", b: 6 })];
  const lc = o.legC || "oak";
  out.push(...four(w * 0.62, d * 0.55, (x, y, a, b) => taperLeg(x * 1.12, y * 1.1 + 0.02 * d, 0, 15, sz - 35, lc, 0.7, { ty: -a * 7, tx: b * 7 })));
  out.push(T([[-w * 0.29, -d * 0.24, 140], [w * 0.29, d * 0.27, 140]], 4, "black"), T([[w * 0.29, -d * 0.24, 140], [-w * 0.29, d * 0.27, 140]], 4, "black"));
  out.push(B(0, 0, sz - 40, w * 0.36, d * 0.3, 18, "black", 0, { plan: false }));
  return out;
}

// Cantilever chair: one bent chrome tube per side, leather seat and back.
export function cantilever(w, d, h, o = {}) {
  const sz = clamp(0.5 * h, 420, 470), out = [];
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 16);
    out.push(T([[x, -d / 2 + 60, h - 20], [x, -d / 2 + 70, sz], [x, d / 2 - 30, sz], [x, d / 2 - 20, 15], [x, -d / 2 + 60, 15]], 12, "chrome"));
  }
  out.push(T([[-w / 2 + 16, -d / 2 + 60, 15], [w / 2 - 16, -d / 2 + 60, 15]], 12, "chrome"));
  out.push(SB(0, 0.05 * d, sz, w - 50, d * 0.8, 55, o.seatC || "main", 0.15));
  out.push(SB(0, -d / 2 + 70, sz + 70, w - 50, 45, h - sz - 90, o.seatC || "main", 0.3, { tx: 8 }));
  return out;
}

// Five-star swivel office chair.
export function officeChair(w, d, h, o = {}) {
  const r = Math.min(w, d) / 2 - 25, sz = clamp(0.47 * h, 430, 520), out = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    out.push(T([[0, 0, 85], [Math.cos(a) * r, Math.sin(a) * r, 60]], 16, o.baseC || "black"));
    out.push(S(Math.cos(a) * r, Math.sin(a) * r, 25, 25, "rubber", { sx: 0.8 }));
  }
  out.push(C(0, 0, 60, 32, 50, o.baseC || "black"), C(0, 0, 100, 16, sz - 180, "chrome"), C(0, 0, sz - 90, 70, 30, "black", 70, { plan: false }));
  out.push(SB(0, 0.05 * d, sz - 60, w * 0.82, d * 0.8, 85, o.seatC || "main", 0.25));
  out.push(SB(0, -d / 2 + 70, sz + 70, w * 0.76, 70, h - sz - 80 - (o.headrest ? 120 : 0), o.backC || o.seatC || "main", 0.3, { tx: 9 }));
  if (o.headrest) out.push(SB(0, -d / 2 + 22, h - 160, w * 0.44, 70, 140, o.seatC || "main", 0.4, { tx: 9 }));
  out.push(T([[0, -d / 2 + 95, sz - 40], [0, -d / 2 + 80, sz + 80]], 18, "black", { plan: false }));
  if (o.arms !== false) for (const s of [-1, 1]) {
    out.push(T([[s * (w * 0.37), 0, sz - 40], [s * (w * 0.42), -0.02 * d, sz + 160]], 14, "black"));
    out.push(SB(s * (w * 0.42), -0.02 * d, sz + 160, 70, 260, 35, "black", 0.4));
  }
  return out;
}

// Bar / counter stool: round seat, chrome column, foot ring, disc base.
export function barStool(w, d, h, o = {}) {
  const r = Math.min(w, d) / 2;
  return [
    L(0, 0, 0, [[0, 0], [r * 0.95, 0], [r * 0.95, 8], [r * 0.85, 22], [0, 24]], "chrome"),
    C(0, 0, 20, 22, h - 120, "chrome"),
    R(0, 0, h * 0.32, r * 0.75, 9, "chrome"),
    L(0, 0, h - 110, smoothProfile([[0, 0], [r * 0.85, 10], [r * 0.98, 60], [r * 0.9, 105], [0, 110]], 3), o.seatC || "main"),
  ];
}

// ---------------------------------------------------------------- tables
// Table: o.top "rect" | "round" | "oval"; o.legs "taper" | "square" | "pedestal" |
// "trestle" | "hairpin" | "frame" | "x"; o.topC, o.legC, o.thick, o.glass, o.shelf
export function table(w, d, h, o = {}) {
  const t = o.thick ?? clamp(0.045 * h, 18, 45), lc = o.legC || "main", tc = o.topC || "main", out = [];
  const top = o.top || "rect";
  if (top === "round") out.push(C(0, 0, h - t, w / 2, t, tc, d / 2, { seg: 48 }));
  else if (top === "oval") out.push(E(0, 0, h - t, ellipsePts(0, 0, w / 2, d / 2, 40), t, tc, { b: Math.min(6, t / 3) }));
  else out.push(B(0, 0, h - t, w, d, t, tc, o.radius ?? 8, { b: Math.min(4, t / 4) }));
  const lz = h - t;
  const legs = o.legs || "taper";
  if (legs === "pedestal") {
    out.push(L(0, 0, 0, smoothProfile([[Math.min(w, d) * 0.28, 0], [Math.min(w, d) * 0.27, 25], [70, 90], [55, lz * 0.5], [80, lz - 30], [120, lz]], 3), lc));
  } else if (legs === "trestle") {
    for (const s of [-1, 1]) {
      out.push(B(s * (w / 2 - 160), 0, 0, 70, d * 0.8, 50, lc, 6), B(s * (w / 2 - 160), 0, 50, 70, 90, lz - 100, lc, 6), B(s * (w / 2 - 160), 0, lz - 50, 70, d * 0.85, 50, lc, 6, { plan: false }));
    }
    out.push(B(0, 0, lz * 0.35, w - 320, 50, 70, lc, 4, { plan: false }));
  } else if (legs === "hairpin") {
    out.push(...four(w - 120, d - 120, (x, y, a) => hairpin(x, y, lz, -a, lc)));
  } else if (legs === "frame") {
    for (const s of [-1, 1]) out.push(T([[s * (w / 2 - 60), -d / 2 + 50, lz], [s * (w / 2 - 60), -d / 2 + 50, 0], [s * (w / 2 - 60), d / 2 - 50, 0], [s * (w / 2 - 60), d / 2 - 50, lz]], 15, lc));
    out.push(B(0, -d / 2 + 50, lz - 60, w - 120, 25, 60, lc, 0, { plan: false }), B(0, d / 2 - 50, lz - 60, w - 120, 25, 60, lc, 0, { plan: false }));
  } else if (legs === "x") {
    for (const s of [-1, 1]) out.push(T([[s * (w / 2 - 80), -d / 2 + 60, 0], [s * (w / 2 - 80), d / 2 - 60, lz]], 18, lc), T([[s * (w / 2 - 80), d / 2 - 60, 0], [s * (w / 2 - 80), -d / 2 + 60, lz]], 18, lc));
  } else {
    const inset = top === "rect" ? 70 : 0;
    const ax = top === "rect" ? w / 2 - inset : w * 0.3, ay = top === "rect" ? d / 2 - inset : d * 0.3;
    out.push(...four(ax * 2, ay * 2, (x, y, a, b) => legs === "square" ? B(x, y, 0, o.legT || 55, o.legT || 55, lz, lc, 3) : taperLeg(x, y, 0, 26, lz, lc, 0.6, top === "rect" ? {} : { ty: -a * 6, tx: b * 6 })));
    if (top === "rect" && !o.noApron) {
      out.push(B(0, -d / 2 + inset, lz - 80, w - 2 * inset, 22, 80, lc, 0, { plan: false }), B(0, d / 2 - inset, lz - 80, w - 2 * inset, 22, 80, lc, 0, { plan: false }));
      out.push(B(-w / 2 + inset, 0, lz - 80, 22, d - 2 * inset, 80, lc, 0, { plan: false }), B(w / 2 - inset, 0, lz - 80, 22, d - 2 * inset, 80, lc, 0, { plan: false }));
    }
  }
  if (o.shelf) out.push(B(0, 0, h * 0.18, w - 120, d - 120, 18, o.shelfC || tc, 6));
  return out;
}

// ---------------------------------------------------------------- beds
// Bed of overall width w, length d; mattress top at mt, headboard to hb (absolute heights).
// o: {head: "panel"|"tufted"|"slats"|"wing"|"none", frameC, headC, beddingC, throwC, pillows, legs}
export function bed(w, d, mt, hb, o = {}) {
  const out = [];
  const fc = o.frameC || "main", hc = o.headC || fc;
  const headT = 90, frameH = mt * 0.55, legH = o.legs ? clamp(mt * 0.25, 80, 160) : 0;
  // Base / frame.
  out.push(SB(0, headT / 2, legH, w, d - headT, frameH - legH, fc, 0.03));
  if (legH) out.push(...four(w - 80, d - headT - 80, (x, y) => taperLeg(x, y + headT / 2, 0, 25, legH, o.legC || "walnut")));
  // Mattress.
  out.push(SB(0, headT / 2 + 5, frameH, w - 50, d - headT - 50, mt - frameH, "white", 0.06));
  // Duvet: over the front two thirds, hanging over the sides.
  const dvL = (d - headT) * 0.72;
  out.push(SB(0, d / 2 - dvL / 2 - 10, frameH + (mt - frameH) * 0.25, w - 20, dvL, (mt - frameH) * 0.75 + 45, o.beddingC || "linen", 0.05));
  // Folded throw at the foot.
  if (o.throwC) out.push(SB(0, d / 2 - 260, mt + 40, w - 10, 380, 22, o.throwC, 0.05));
  // Pillows.
  const np = o.pillows ?? (w > 1300 ? 2 : 1);
  const pw = clamp((w - 120) / np - 30, 450, 750);
  for (let i = 0; i < np; i++) out.push(SB(-((np - 1) * (pw + 30)) / 2 + i * (pw + 30), -d / 2 + headT + 230, mt - 10, pw, 380, 150, "white", 0.45, { tx: 14 }));
  if (np >= 2 && w > 1500) for (let i = 0; i < 2; i++) out.push(SB(-((pw + 30)) / 2 + i * (pw + 30), -d / 2 + headT + 400, mt + 10, pw * 0.75, 140, 380, o.cushionC || "sage", 0.45, { tx: 20 }));
  // Headboard.
  const head = o.head || "panel";
  if (head === "tufted" || head === "wing") {
    out.push(SB(0, -d / 2 + headT / 2, 0, w + (head === "wing" ? 0 : 0), headT, hb, hc, 0.4));
    for (let i = 0; i < 8; i++) for (const z of [0.62, 0.8]) out.push(S(-w / 2 + (w * (i + 0.5)) / 8, -d / 2 + headT, z * hb, 10, hc));
    if (head === "wing") for (const s of [-1, 1]) out.push(SB(s * (w / 2 - 60), -d / 2 + 180, frameH, 120, 220, hb - frameH, hc, 0.4));
  } else if (head === "slats") {
    out.push(B(0, -d / 2 + 20, hb - 70, w, 40, 70, hc, 6));
    for (let i = 0; i < 9; i++) out.push(B(-w / 2 + 40 + ((w - 80) * i) / 8, -d / 2 + 20, 0, 50, 35, hb - 70, hc, 4));
  } else if (head !== "none") out.push(B(0, -d / 2 + headT / 2, 0, w, headT, hb, hc, 20, { b: 10 }));
  return out;
}

// ---------------------------------------------------------------- casework
// Cabinet with doors and drawers. fronts: string of rows from the top, e.g.
// "dd" two doors, "DDD" three drawers stacked, "d" one door; o.handle "bar"|"knob"|"none"|"groove",
// o.plinth, o.top (worktop colour), o.topT, o.frontC, o.legs, o.glass
export function cabinet(w, d, h, o = {}) {
  const out = [];
  const plinth = o.legs ? clamp(0.14 * h, 90, 160) : o.plinth ?? 0;
  const topT = o.top ? (o.topT ?? 30) : 0;
  const body = h - plinth - topT;
  const fc = o.frontC || "main";
  // Carcass.
  out.push(B(0, -10, plinth, w, d - 20, body, o.bodyC || "main", 2));
  if (o.legs) out.push(...four(w - 60, d - 80, (x, y) => taperLeg(x, y, 0, 18, plinth, o.legC || "black", 0.7)));
  else if (plinth) out.push(B(0, -30, 0, w - 20, d - 70, plinth, "dark", 0, { plan: false }));
  if (o.top) out.push(B(0, 0, h - topT, w + (o.overhang || 0), d, topT, o.top, 3, { b: 2 }));
  // Fronts: rows of equal height (drawer rows "D" are lower than door rows).
  const rows = (o.fronts || "dd").split(",");
  const weights = rows.map((r) => (r[0] === "D" || r[0] === "s" ? 1 : 2.4));
  const tot = weights.reduce((a, b) => a + b, 0);
  let z = plinth + body;
  const gap = 3, y = d / 2 - 10;
  rows.forEach((r, ri) => {
    const fh = (body * weights[ri]) / tot;
    z -= fh;
    const n = r.length;
    const fw = (w - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + gap + fw / 2 + i * (fw + gap);
      const kind = r[i];
      if (kind === "g") { // glass door: frame + pane
        out.push(B(x, y, z + gap, fw, 20, fh - 2 * gap, fc, 0, { plan: false }), B(x, y + 2, z + gap + 60, fw - 120, 20, fh - 2 * gap - 120, "glass", 0, { plan: false }));
      } else if (kind === "o") { // open shelf
        out.push(B(x, y - 30, z, fw, 18, 18, o.bodyC || "main", 0, { plan: false }));
        continue;
      } else out.push(B(x, y, z + gap / 2, fw, 20, fh - gap, kind === "s" ? "dark" : fc, 2, { plan: false }));
      if (o.handle === "none" || o.handle === "groove") continue;
      const hy = y + 10;
      if (o.handle === "knob") out.push(S(kind === "D" ? x : x + (i % 2 ? -1 : 1) * (fw / 2 - 50), hy + 8, kind === "D" ? z + fh / 2 : z + fh * 0.75, 14, o.handleC || "brass", { plan: false }));
      else if (kind === "D" || kind === "s") out.push(T([[x - Math.min(160, fw * 0.3), hy, z + fh * 0.6], [x - Math.min(160, fw * 0.3), hy + 22, z + fh * 0.6], [x + Math.min(160, fw * 0.3), hy + 22, z + fh * 0.6], [x + Math.min(160, fw * 0.3), hy, z + fh * 0.6]], 6, o.handleC || "steel", { plan: false }));
      else { const hx = x + (n > 1 ? (i % 2 ? -1 : 1) * (fw / 2 - 45) : fw / 2 - 45); const hz = o.upper ? z + 60 : z + fh - Math.min(260, fh * 0.4); out.push(T([[hx, hy, hz], [hx, hy + 22, hz], [hx, hy + 22, hz + Math.min(200, fh * 0.3)], [hx, hy, hz + Math.min(200, fh * 0.3)]], 6, o.handleC || "steel", { plan: false })); }
    }
  });
  return out;
}

// Books on a shelf from x1 to x2 at height z (deterministic mix of sizes and colours).
export function books(x1, x2, y, z, maxH, depth, seed = 1, fill = 0.8) {
  const r = rng(seed), out = [];
  const cols = ["book1", "book2", "book3", "book4", "book5", "paper"];
  let x = x1 + 10;
  while (x < x2 - 30) {
    if (r() > fill) { x += 60 + r() * 120; continue; }
    const t = 18 + r() * 34, hh = maxH * (0.62 + r() * 0.36);
    if (r() < 0.12 && x + hh < x2) { // a stack lying down
      for (let k = 0; k < 3; k++) out.push(B(x + hh / 2, y, z + k * 28, hh, depth * (0.8 + r() * 0.15), 26, cols[Math.floor(r() * cols.length)], 0, { plan: false }));
      x += hh + 15;
      continue;
    }
    out.push(B(x + t / 2, y, z, t, depth * (0.75 + r() * 0.2), hh, cols[Math.floor(r() * cols.length)], 0, { plan: false, ...(r() < 0.08 ? { ty: 8 } : {}) }));
    x += t + 1;
  }
  return out;
}

// ---------------------------------------------------------------- lamps and shades
// A drum / cone / dome shade as a thin turned shell (radius r1 at the bottom, r2 at the top).
export const shade = (x, y, z, r1, r2, h, c = "linen", g = 0.5) => G(L(x, y, z, [[r1, 0], [r2, h], [r2 - 2, h], [r1 - 2, 0]], c), g);
export const dome = (x, y, z, r, h, c = "black") => L(x, y, z, smoothProfile([[r, 0], [r * 0.95, h * 0.35], [r * 0.6, h * 0.85], [r * 0.12, h], [0, h]], 3), c);

// ---------------------------------------------------------------- plants
// Pot (turned, slightly flared) with soil.
export function pot(x, y, r, h, c = "terracotta", o = {}) {
  const k = o.straight ? 1 : 0.78;
  return [L(x, y, 0, [[0, 0], [r * k, 0], [r * k, 4], [r, h - 12], [r + 6, h - 10], [r + 6, h], [r - 6, h], [r * k - 6, 12], [0, 12]], c), C(x, y, h - 40, r - 10, 30, "soil", r - 10, { plan: false })];
}
// Leaves fanning out from (x, y, z): n ellipsoid blades of length len, rising at `rise` degrees.
export function leaves(x, y, z, n, len, width, rise = 40, seed = 3, c = "leaf", thick = 0.12) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + r() * 25;
    const up = rise + (r() - 0.5) * 30;
    const L0 = len * (0.7 + r() * 0.35);
    const cx = Math.cos((a * Math.PI) / 180) * Math.cos((up * Math.PI) / 180) * L0 * 0.5;
    const cy = Math.sin((a * Math.PI) / 180) * Math.cos((up * Math.PI) / 180) * L0 * 0.5;
    const cz = Math.sin((up * Math.PI) / 180) * L0 * 0.5;
    out.push(S(x + cx, y + cy, z + cz, L0 / 2, i % 3 === 0 ? "leaf2" : c, { sx: 1, sy: width / L0, sz: thick, ty: -up, tz: a }));
  }
  return out;
}
// A rounded crown of foliage clusters (trees, shrubs): clumps of spheres in a dome.
export function crown(cx, cy, z0, rx, ry, rz, n = 9, seed = 5, cs = ["leaf", "leaf2", "leaf3"]) {
  const r = rng(seed), out = [S(cx, cy, z0 + rz, Math.min(rx, ry) * 0.72, cs[0], { sx: 1, sy: ry / rx, sz: (rz / rx) * 0.95 })];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, e = (r() - 0.25) * 1.1;
    const k = 0.5 + r() * 0.25;
    const cr = Math.min(rx, ry, rz) * (0.32 + r() * 0.16);
    out.push(S(cx + Math.cos(a) * Math.cos(e) * rx * k, cy + Math.sin(a) * Math.cos(e) * ry * k, z0 + rz + Math.sin(e) * rz * k * 0.95, cr, cs[i % cs.length]));
  }
  return out;
}

// ---------------------------------------------------------------- people (scale figures)
// A standing figure facing +y (front), height h, shoulders sh wide.
export function figure(h, o = {}) {
  const k = h / 1750, sk = o.skin || "skin", top = o.top || "navy", pants = o.pants || "charcoal", out = [];
  const hip = 0.53 * h, sh = 0.82 * h;
  const lw = 62 * k;
  // Legs and shoes.
  for (const s of [-1, 1]) {
    out.push(C(s * 95 * k, 0, 70 * k, lw, hip - 70 * k, pants, lw, { top: 1.35 }));
    out.push(SB(s * 95 * k, 35 * k, 0, 95 * k, 260 * k, 75 * k, o.shoes || "black", 0.4));
  }
  if (o.skirt) out.push(C(0, 0, hip - 300 * k, 210 * k, 330 * k, o.skirt, 150 * k, { top: 0.7 }));
  // Torso.
  out.push(L(0, 0, hip - 40 * k, smoothProfile([[150 * k, 0], [160 * k, 120 * k], [150 * k, 300 * k], [185 * k, sh - hip - 40 * k], [70 * k, sh - hip + 30 * k], [0, sh - hip + 40 * k]], 3), top, { sy: 0.62 }));
  // Arms.
  for (const s of [-1, 1]) {
    out.push(T([[s * 195 * k, 0, sh - 40 * k], [s * 215 * k, 10 * k, sh - 330 * k], [s * 205 * k, 40 * k, hip - 20 * k]], 45 * k, o.sleeves || top, { smooth: true }));
    out.push(S(s * 205 * k, 45 * k, hip - 70 * k, 50 * k, sk, { sz: 1.3 }));
  }
  // Neck and head (with hair).
  out.push(C(0, 0, sh + 20 * k, 50 * k, 90 * k, sk));
  out.push(S(0, 5 * k, h - 120 * k, 105 * k, sk, { sz: 1.2, sy: 0.92 }));
  out.push(S(0, -12 * k, h - 100 * k, 108 * k, o.hair || "hair", { sz: 1.05, sy: 0.95 }));
  if (o.longHair) out.push(SB(0, -55 * k, h - 420 * k, 210 * k, 90 * k, 300 * k, o.hair || "hair", 0.4));
  return out;
}

// Shift parts by dx, dy, dz (tubes move their whole path).
export const move = (parts, dx = 0, dy = 0, dz = 0) => parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz, ...(p.t === "tube" ? { pts: p.pts.map((q) => [q[0] + dx, q[1] + dy, q[2] + dz]) } : {}) }));
// Recolour parts: map {from: to} on the colour keys.
export const recolor = (parts, map) => parts.map((p) => (map[p.c] ? { ...p, c: map[p.c] } : p));
// Turn parts about the item origin by deg (about z): anchors move round, the
// parts turn with them (tubes turn their path).
export const turn = (parts, deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const rot = (x, y) => [x * c - y * s, x * s + y * c];
  return parts.map((p) => {
    const [x, y] = rot(p.x, p.y);
    if (p.t === "tube") return { ...p, x, y, pts: p.pts.map((q) => [...rot(q[0], q[1]), q[2]]) };
    return { ...p, x, y, tz: (p.tz || 0) + deg };
  });
};
// Place a furniture builder's parts at (x, y) turned by deg (sets: a table with its chairs).
export const place = (parts, x, y, deg = 0) => move(turn(parts, deg), x, y);
