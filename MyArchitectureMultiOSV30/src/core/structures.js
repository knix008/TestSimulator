// Parametric structures made of members (src/core/members.js): lattice towers
// and masts, and bridges (beam, truss, arch, suspension, cable-stayed) along
// an alignment with a horizontal curve and a vertical grade.
//
// A structure is kept as p.structures = [{id, kind: "tower" | "bridge", level,
// name, params}] and its members carry `structure: id` (and the same `group`,
// so they move together). generateStructure() makes the members from the
// params; regenerating replaces them, so "edit the bridge" is just new params.
// Pure functions; millimetres, z above the level's floor.

import { uid } from "./geom.js";
import { normalizeMember } from "./members.js";

// ---------------------------------------------------------------- defaults
export const TOWER_DEFAULTS = {
  height: 60000, baseWidth: 12000, topWidth: 3000, panels: 10, sides: 4, bracing: "X", // X | K | Z (single diagonal)
  leg: { profile: "tube", w: 400, t: 16 }, brace: { profile: "L", w: 150, h: 150, t: 12 }, strut: { profile: "L", w: 120, h: 120, t: 10 },
  platforms: [0.5, 1], mast: 8000, material: "galvanised", x: 0, y: 0, rot: 0,
};

// beam girder, truss, tied arch, suspension, cable-stayed (two A-pylons, fans);
// deckArch: the arch under the deck carries it on spandrel columns; haunched:
// a girder deeper over the piers; harp: one pylon, parallel (harp) stays;
// extradosed: short masts, stays in one central plane; ribbon: a stress-ribbon
// footbridge whose thin deck hangs between the supports.
export const BRIDGE_TYPES = ["beam", "truss", "arch", "suspension", "cableStayed", "deckArch", "haunched", "harp", "extradosed", "ribbon"];
export const BRIDGE_DEFAULTS = {
  type: "beam", x: 0, y: 0, angle: 0, // start of the alignment and its direction (degrees, plan)
  length: 120000, spans: 3, width: 12000, deckZ: 8000, deckDepth: 1800, grade: 0, crest: 0, radius: 0, // radius 0 = straight
  height: 0, // truss depth / arch rise / pylon height above the deck (0 = from the span)
  pierShape: "round", pierWidth: 2000, material: "concrete", steel: "steel-grey", cable: "cable", railing: true,
};

// ---------------------------------------------------------------- towers
// A lattice tower: tapered legs at the corners of a regular polygon, a strut
// ring at every panel, bracing on every face, optional platforms and a mast.
export function towerMembers(params = {}) {
  const q = { ...TOWER_DEFAULTS, ...params };
  const n = Math.max(3, Math.round(q.sides)), panels = Math.max(1, Math.round(q.panels));
  const rot = ((q.rot || 0) * Math.PI) / 180;
  // Corner k at height z: on a circle through the square's corners, scaled with the taper.
  const corner = (k, z) => {
    const w = q.baseWidth + (q.topWidth - q.baseWidth) * (z / q.height);
    const r = w / 2 / Math.cos(Math.PI / n);
    const a = rot + Math.PI / n + (k * 2 * Math.PI) / n; // a square's sides lie along x and y
    return [q.x + r * Math.cos(a), q.y + r * Math.sin(a), z];
  };
  // Panels get shorter towards the top (the faces narrow): heights in a gentle geometric series.
  const zs = [0];
  const ratio = Math.pow(Math.max(0.2, q.topWidth / q.baseWidth), 1 / panels);
  let sum = 0, h = 1;
  const hs = [];
  for (let i = 0; i < panels; i++) { hs.push(h); sum += h; h *= ratio; }
  for (const x of hs) zs.push(zs[zs.length - 1] + (x / sum) * q.height);
  const out = [];
  const add = (role, pts, sec, extra = {}) => out.push({ role, pts, ...sec, material: q.material, ...extra });
  for (let k = 0; k < n; k++) add("column", zs.map((z) => corner(k, z)), q.leg, { name: `Leg ${k + 1}` });
  for (let i = 1; i <= panels; i++) for (let k = 0; k < n; k++) add("chord", [corner(k, zs[i]), corner((k + 1) % n, zs[i])], q.strut);
  for (let i = 0; i < panels; i++) {
    const z0 = zs[i], z1 = zs[i + 1], zm = (z0 + z1) / 2;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const a0 = corner(k, z0), b0 = corner(j, z0), a1 = corner(k, z1), b1 = corner(j, z1);
      if (q.bracing === "K") {
        const mid = [(a0[0] + b0[0] + a1[0] + b1[0]) / 4, (a0[1] + b0[1] + a1[1] + b1[1]) / 4, zm];
        add("brace", [a0, mid], q.brace); add("brace", [b0, mid], q.brace); add("brace", [mid, a1], q.brace); add("brace", [mid, b1], q.brace);
      } else if (q.bracing === "Z") add("brace", [i % 2 ? a0 : b0, i % 2 ? b1 : a1], q.brace);
      else { add("brace", [a0, b1], q.brace); add("brace", [b0, a1], q.brace); }
    }
  }
  // Platforms: a deck plate over the strut ring nearest each fraction of the height.
  for (const f of q.platforms || []) {
    const i = Math.max(1, Math.min(panels, Math.round(f * panels)));
    const z = zs[i];
    const c = Array.from({ length: n }, (_, k) => corner(k, z));
    for (let k = 0; k < n; k++) add("deck", [c[k], c[(k + 1) % n]], { profile: "rect", w: 900, h: 60 }, { material: "metal-mesh" }); // a walkway round the ring
  }
  if (q.mast > 0) add("post", [[q.x, q.y, q.height], [q.x, q.y, q.height + q.mast]], { profile: "tube", w: Math.max(150, q.leg.w * 0.6), t: 10 }, { name: "Mast" });
  // Struts tying the mast foot to the top ring.
  if (q.mast > 0) for (let k = 0; k < n; k++) add("brace", [corner(k, q.height), [q.x, q.y, q.height]], q.strut);
  return out;
}

// ---------------------------------------------------------------- bridges
// The alignment: station s (mm from the start) → plan point, heading and the
// deck's top z. A horizontal curve of `radius` (left > 0, right < 0) and a
// grade (%) with an optional crest rise at mid-length (a parabolic vertical curve).
export function alignment(q) {
  const a0 = ((q.angle || 0) * Math.PI) / 180, R = +q.radius || 0, L = q.length;
  const at = (s) => {
    let x, y, h;
    if (!R) { x = q.x + Math.cos(a0) * s; y = q.y + Math.sin(a0) * s; h = a0; }
    else {
      const th = s / R; // turned so far
      x = q.x + R * (Math.sin(a0 + th) - Math.sin(a0));
      y = q.y - R * (Math.cos(a0 + th) - Math.cos(a0));
      h = a0 + th;
    }
    const u = s / L;
    const z = q.deckZ + (q.grade / 100) * s + 4 * (q.crest || 0) * u * (1 - u);
    return { x, y, z, h, n: [-Math.sin(h), Math.cos(h)] };
  };
  return at;
}

// Stations of the piers (between the spans) and of the abutments (the ends).
export function bridgeSpans(q) {
  const n = Math.max(1, Math.round(q.spans));
  if (q.type === "suspension" || q.type === "cableStayed") {
    // A long main span between two towers and side spans of a quarter each.
    if (n >= 3) { const side = q.length / 4.5, main = q.length - 2 * side; return [0, side, side + main, q.length]; }
  }
  if (q.type === "harp") return [0, q.length * 0.36, q.length]; // a back span and the main span
  if (q.type === "extradosed" && n >= 3) return [0, q.length * 0.25, q.length * 0.75, q.length];
  if (q.type === "deckArch") return [0, q.length];
  return Array.from({ length: n + 1 }, (_, i) => (i * q.length) / n);
}

export function bridgeMembers(params = {}) {
  const q = { ...BRIDGE_DEFAULTS, ...params };
  const stations = bridgeSpans(q);
  const base = alignment(q);
  // A stress ribbon hangs between its supports: the deck sags span/50 in each span.
  const at = q.type !== "ribbon" ? base : (s) => {
    const a = base(s);
    let i = 1;
    while (i < stations.length - 1 && s > stations[i]) i++;
    const s0 = stations[i - 1], s1 = stations[i], u = (s - s0) / (s1 - s0 || 1);
    return { ...a, z: a.z - ((s1 - s0) / 50) * 4 * u * (1 - u) };
  };
  const out = [];
  const add = (role, pts, sec, material, extra = {}) => out.push({ role, pts, ...sec, material, ...extra });
  const off = (s, v, dz = 0) => { const a = at(s); return [a.x + a.n[0] * v, a.y + a.n[1] * v, a.z + dz]; };
  // Deck and chord segments: short enough on a curve that the wide deck's
  // outer edge shows no gaps between them (≤ 20 mm).
  const step = Math.min(5000, q.length / 40, q.radius ? (40 * Math.abs(q.radius)) / q.width : Infinity);
  // A vertical member's section turned square to the deck at station s.
  const across = (s) => -(((at(s).h * 180) / Math.PI) + 90);
  const along = (s0, s1, fn) => { const n = Math.max(1, Math.ceil((s1 - s0) / step)); return Array.from({ length: n + 1 }, (_, i) => fn(s0 + ((s1 - s0) * i) / n)); };
  const W = q.width, D = q.deckDepth;
  // Deck: a wide slab member along the alignment (its centre a half depth under the top).
  add("deck", along(0, q.length, (s) => off(s, 0, -D / 2 / 3)), { profile: "rect", w: W, h: D / 3 }, q.material, { name: "Deck" });
  // Main girders under the deck edges (box girders for the concrete types, I for steel).
  const steelDeck = q.type === "truss" || q.type === "arch";
  if (q.type !== "ribbon" && q.type !== "haunched") for (const v of [-W * 0.3, W * 0.3]) add("girder", along(0, q.length, (s) => off(s, v, -D / 3 - (D * 2 / 3) / 2)), steelDeck ? { profile: "I", w: 600, h: (D * 2) / 3, t: 30 } : { profile: "box", w: W * 0.25, h: (D * 2) / 3, t: 400 }, steelDeck ? q.steel : q.material);
  // Piers at the inner stations; abutment walls at the ends.
  const pierSec = q.pierShape === "round" ? { profile: "round", w: q.pierWidth } : { profile: "rect", w: q.pierWidth, h: q.pierWidth * 1.6 };
  stations.forEach((s, i) => {
    const a = at(s);
    const end = i === 0 || i === stations.length - 1;
    const bottom = a.z - D;
    if (bottom <= 200) return; // the deck sits on the ground there
    if (end) { add("column", [[a.x, a.y, 0], [a.x, a.y, bottom]], { profile: "rect", w: W, h: 1500 }, q.material, { name: "Abutment", roll: across(s) }); return; }
    if (q.type === "suspension" || q.type === "cableStayed" || q.type === "harp") return; // the towers stand there
    for (const v of W > 9000 ? [-W * 0.25, W * 0.25] : [0]) add("column", [[a.x + a.n[0] * v, a.y + a.n[1] * v, 0], [a.x + a.n[0] * v, a.y + a.n[1] * v, bottom]], pierSec, q.material, { name: "Pier", roll: across(s) });
    add("beam", [off(s, -W / 2, -D - 600), off(s, W / 2, -D - 600)], { profile: "rect", w: 1600, h: 1200 }, q.material, { name: "Pier cap" });
  });
  // Superstructure by type.
  const H = q.height > 0 ? q.height : null;
  if (q.type === "truss") {
    const depth = H || Math.max(4000, (q.length / stations.length) / 8);
    const bays = Math.max(4, Math.round(q.length / Math.max(4000, depth)));
    for (const v of [-W / 2, W / 2]) {
      const bot = (s) => off(s, v, 0), top = (s) => off(s, v, depth);
      add("chord", along(0, q.length, top), { profile: "box", w: 600, h: 600, t: 25 }, q.steel);
      add("chord", along(0, q.length, bot), { profile: "box", w: 600, h: 600, t: 25 }, q.steel);
      for (let i = 0; i <= bays; i++) {
        const s = (i * q.length) / bays;
        add("post", [bot(s), top(s)], { profile: "H", w: 400, h: 400, t: 20 }, q.steel);
        if (i < bays) { const s1 = ((i + 1) * q.length) / bays; add("brace", i < bays / 2 ? [bot(s), top(s1)] : [top(s), bot(s1)], { profile: "H", w: 400, h: 400, t: 20 }, q.steel); }
      }
    }
    // Top bracing between the two trusses.
    for (let i = 0; i <= bays; i++) { const s = (i * q.length) / bays; add("brace", [off(s, -W / 2, depth), off(s, W / 2, depth)], { profile: "H", w: 300, h: 300, t: 15 }, q.steel); }
  } else if (q.type === "arch") {
    // Tied arch over the main (longest) span: two ribs, hangers every few metres.
    const [s0, s1] = longestSpan(stations);
    const rise = H || (s1 - s0) / 5;
    const rib = (v) => (s) => { const u = (s - s0) / (s1 - s0); return off(s, v, 4 * rise * u * (1 - u)); };
    for (const v of [-W / 2, W / 2]) {
      add("arch", along(s0, s1, rib(v)), { profile: "box", w: 1200, h: 1500, t: 40 }, q.steel, { name: "Arch rib" });
      const nh = Math.max(4, Math.round((s1 - s0) / 6000));
      for (let i = 1; i < nh; i++) { const s = s0 + ((s1 - s0) * i) / nh; add("hanger", [off(s, v, 0), rib(v)(s)], { profile: "cable", w: 90 }, q.cable); }
    }
    const nb = Math.max(3, Math.round((s1 - s0) / 15000));
    for (let i = 1; i < nb; i++) { const s = s0 + ((s1 - s0) * i) / nb; const u = (s - s0) / (s1 - s0); if (u < 0.2 || u > 0.8) continue; add("brace", [off(s, -W / 2, 4 * rise * u * (1 - u)), off(s, W / 2, 4 * rise * u * (1 - u))], { profile: "box", w: 600, h: 600, t: 20 }, q.steel); }
  } else if (q.type === "suspension") {
    const [sa, sb] = [stations[1], stations[stations.length - 2]];
    const main = sb - sa;
    const tower = H || main / 9;
    const sag = tower * 0.85;
    for (const s of [sa, sb]) towerPortal(add, at, off, s, W, tower, q, false, across(s));
    for (const v of [-W / 2 - 600, W / 2 + 600]) {
      const top = (s) => off(s, v, tower);
      // Main cable: a parabola between the tower tops, straight backstays to the anchors.
      const cab = (s) => { const u = (s - sa) / main; const a = top(s); return [a[0], a[1], a[2] - 4 * sag * u * (1 - u)]; };
      add("cable", [off(0, v, -D), ...along(sa, sb, cab), off(q.length, v, -D)], { profile: "cable", w: 600 }, q.cable, { name: "Main cable" });
      const nh = Math.max(6, Math.round(main / 10000));
      for (let i = 1; i < nh; i++) { const s = sa + (main * i) / nh; add("hanger", [off(s, v, 0), cab(s)], { profile: "cable", w: 80 }, q.cable); }
    }
  } else if (q.type === "cableStayed") {
    const [sa, sb] = [stations[1], stations[stations.length - 2]];
    const tower = H || (sb - sa) / 4.5;
    const mid = (sa + sb) / 2;
    for (const s of [sa, sb]) {
      towerPortal(add, at, off, s, W, tower, q, true, across(s));
      // A fan of stays each side of the pylon, anchored near its top: to the
      // middle of the main span one way, to the end of the deck the other.
      const toMid = Math.abs(mid - s) * 0.95, toEnd = (s === sa ? s : q.length - s) * 0.95;
      const nst = Math.max(4, Math.round(Math.min(toMid, toEnd) / 12000));
      for (const v of [-W / 2 - 300, W / 2 + 300]) for (const dir of [-1, 1]) {
        const lim = (dir > 0) === (s === sa) ? toMid : toEnd;
        for (let i = 1; i <= nst; i++) {
          const sd = s + dir * (lim * i) / nst;
          add("cable", [off(sd, v, 0), off(s, v * 0.15, tower * (0.65 + 0.33 * (i / nst)))], { profile: "cable", w: 150 }, q.cable);
        }
      }
    }
  } else if (q.type === "deckArch") {
    // An open-spandrel arch under the deck: two ribs springing from the valley
    // floor, columns from the ribs up to the deck, struts between the ribs.
    const s0 = q.length * 0.07, s1 = q.length * 0.93, mid = (s0 + s1) / 2;
    const crown = at(mid).z - D - 700;
    const ribZ = (s) => { const u = (s - s0) / (s1 - s0); return crown * 4 * u * (1 - u); };
    const pt = (s, v, z) => { const a = at(s); return [a.x + a.n[0] * v, a.y + a.n[1] * v, z]; };
    for (const v of [-W * 0.3, W * 0.3]) {
      add("arch", along(s0, s1, (s) => pt(s, v, ribZ(s))), { profile: "box", w: 1400, h: 2200, t: 450 }, q.material, { name: "Arch rib", roll: 0 });
      const n = Math.max(6, Math.round((s1 - s0) / 9000));
      for (let i = 1; i < n; i++) {
        const s = s0 + ((s1 - s0) * i) / n;
        const top = at(s).z - D;
        if (top - ribZ(s) > 1500) add("post", [pt(s, v, ribZ(s) + 1100), pt(s, v, top)], { profile: "rect", w: 900, h: 900 }, q.material, { name: "Spandrel column" });
      }
    }
    for (let i = 1; i < 8; i++) { const s = s0 + ((s1 - s0) * i) / 8; add("brace", [pt(s, -W * 0.3, ribZ(s)), pt(s, W * 0.3, ribZ(s))], { profile: "rect", w: 700, h: 900 }, q.material); }
  } else if (q.type === "haunched") {
    // A box girder deeper over the inner piers (2.4 × the depth at mid-span),
    // in short pieces of stepped depth (rounded to 50 mm, so pieces share sections).
    const inner = (s) => stations.slice(1, -1).some((x) => Math.abs(x - s) < 1);
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1], b = stations[i];
      const n = Math.max(6, Math.round((b - a) / 3000));
      for (let k = 0; k < n; k++) {
        const sA = a + ((b - a) * k) / n, sB = a + ((b - a) * (k + 1)) / n, u = ((sA + sB) / 2 - a) / (b - a);
        const deep = (inner(a) ? (1 - u) ** 2 : 0) + (inner(b) ? u ** 2 : 0);
        const hh = Math.round(((D * 2) / 3) * (1 + 1.4 * Math.min(1, deep)) / 50) * 50;
        add("girder", [off(sA, 0, -D / 3 - hh / 2), off(sB, 0, -D / 3 - hh / 2)], { profile: "box", w: W * 0.55, h: hh, t: 350 }, q.material);
      }
    }
  } else if (q.type === "harp") {
    // One pylon on the axis; the stays run parallel (a harp) to both spans.
    const sp = stations[1], back = sp, main = q.length - sp;
    const tower = H || main * 0.42;
    const a = at(sp);
    add("column", [[a.x, a.y, 0], off(sp, 0, tower)], { profile: "box", w: 3500, h: 5000, t: 700 }, q.material, { name: "Pylon", roll: across(sp) });
    add("beam", [off(sp, -W / 2, -D - 800), off(sp, W / 2, -D - 800)], { profile: "rect", w: 3000, h: 1600 }, q.material, { name: "Pier cap" });
    const n = Math.max(6, Math.round(main / 14000));
    for (const v of [-W / 2 + 500, W / 2 - 500]) for (let k = 1; k <= n; k++) {
      const z = tower * (0.18 + 0.78 * (k / n));
      add("cable", [off(sp + main * 0.93 * (k / n), v, 0), off(sp, v * 0.12, z)], { profile: "cable", w: 160 }, q.cable);
      add("cable", [off(sp - back * 0.92 * (k / n), v, 0), off(sp, v * 0.12, z)], { profile: "cable", w: 160 }, q.cable);
    }
  } else if (q.type === "extradosed") {
    // Short masts over the inner piers, stays in one plane on the deck's axis,
    // spread over the middle of each side of a mast (not near it).
    const masts = stations.slice(1, -1);
    const span = Math.max(...stations.slice(1).map((s, i) => s - stations[i]));
    const mast = H || span / 10;
    for (const s of masts) {
      add("post", [off(s, 0, -D / 3), off(s, 0, mast)], { profile: "box", w: 2200, h: 3200, t: 500 }, q.material, { name: "Mast", roll: across(s) });
      const n = 6;
      for (const dir of [-1, 1]) for (let k = 0; k < n; k++) {
        const d = span * (0.12 + 0.3 * (k / (n - 1)));
        const sd = s + dir * d;
        if (sd < 0 || sd > q.length) continue;
        add("cable", [off(sd, 0, 0), off(s, 0, mast * (0.72 + 0.24 * (k / (n - 1))))], { profile: "cable", w: 220 }, q.cable);
      }
    }
  } else if (q.type === "ribbon") {
    // Saddles over the piers and anchor blocks at the ends.
    for (const s of stations) add("beam", [off(s, -W / 2 - 300, -D - 400), off(s, W / 2 + 300, -D - 400)], { profile: "rect", w: 2400, h: 800 }, q.material, { name: s === 0 || s === q.length ? "Anchor block" : "Saddle" });
  } else {
    // Beam bridge: cross beams (diaphragms) over the piers.
    for (const s of stations) add("beam", [off(s, -W * 0.3, -D / 3 - D / 3), off(s, W * 0.3, -D / 3 - D / 3)], { profile: "rect", w: 400, h: (D * 2) / 3 }, q.material);
  }
  // Railings: posts every 2.5 m and a top rail along both edges.
  if (q.railing) {
    for (const v of [-W / 2 + 150, W / 2 - 150]) {
      if (q.type === "ribbon") { // a ribbon's rail follows its sag closely: short pieces
        add("chord", Array.from({ length: Math.ceil(q.length / 2000) + 1 }, (_, i) => off(Math.min(q.length, i * 2000), v, 1100)), { profile: "tube", w: 60, t: 4 }, q.steel, { name: "Handrail" });
        const n = Math.max(2, Math.round(q.length / 2000));
        for (let i = 0; i <= n; i++) { const s = (i * q.length) / n; add("post", [off(s, v, 0), off(s, v, 1100)], { profile: "box", w: 60, h: 60, t: 4 }, q.steel); }
        continue;
      }
      add("chord", along(0, q.length, (s) => off(s, v, 1100)), { profile: "tube", w: 60, t: 4 }, q.steel, { name: "Handrail" });
      const n = Math.max(2, Math.round(q.length / 2500));
      for (let i = 0; i <= n; i++) { const s = (i * q.length) / n; add("post", [off(s, v, 0), off(s, v, 1100)], { profile: "box", w: 60, h: 60, t: 4 }, q.steel); }
    }
  }
  return out;
}

const longestSpan = (st) => { let best = [st[0], st[1]]; for (let i = 1; i < st.length; i++) if (st[i] - st[i - 1] > best[1] - best[0]) best = [st[i - 1], st[i]]; return best; };

// A tower of a suspension or cable-stayed bridge at station s: two legs from
// the ground through the deck, cross beams under the deck and at the top.
function towerPortal(add, at, off, s, W, tower, q, single = false, roll = 0) {
  const a = at(s);
  const base = (v) => [a.x + a.n[0] * v, a.y + a.n[1] * v, 0];
  if (single) {
    // An A-frame: legs from beside the deck to one head over the middle.
    const head = off(s, 0, tower);
    for (const v of [-W / 2 - 1500, W / 2 + 1500]) {
      add("column", [base(v), off(s, v, 0)], { profile: "box", w: 2500, h: 3500, t: 500 }, q.material, { name: "Pylon", roll }); // square to the deck
      add("column", [off(s, v, 0), head], { profile: "box", w: 2500, h: 3500, t: 500 }, q.material, { name: "Pylon" }); // leaning in: its frame is already across
    }
    add("beam", [off(s, -W / 2 - 1500, -q.deckDepth - 500), off(s, W / 2 + 1500, -q.deckDepth - 500)], { profile: "rect", w: 2500, h: 2000 }, q.material);
    return;
  }
  for (const v of [-W / 2 - 600, W / 2 + 600]) add("column", [base(v), off(s, v, tower)], { profile: "box", w: 3000, h: 4000, t: 600 }, q.material, { name: "Tower", roll });
  for (const dz of [-q.deckDepth - 800, tower * 0.55, tower - 1500]) add("beam", [off(s, -W / 2 - 600, dz), off(s, W / 2 + 600, dz)], { profile: "box", w: 2500, h: 2500, t: 400 }, q.material);
}

// ---------------------------------------------------------------- in the project
// The members of a structure record, ready to push into p.members.
export function generateStructure(st) {
  const raw = st.kind === "tower" ? towerMembers(st.params) : bridgeMembers(st.params);
  return raw.map((m, i) => normalizeMember({ ...m, id: `${st.id}-${i}`, level: st.level, structure: st.id, group: st.id, phase: st.phase || "new" }));
}

// Add a new structure to the project → its record.
export function addStructure(p, kind, level, params, name) {
  if (!Array.isArray(p.structures)) p.structures = [];
  const st = { id: uid(kind === "tower" ? "tw" : "br"), kind, level, name: name || "", params: { ...(kind === "tower" ? TOWER_DEFAULTS : BRIDGE_DEFAULTS), ...params } };
  p.structures.push(st);
  p.members.push(...generateStructure(st));
  return st;
}

// New params for a structure: its members are made again (same ids where the
// count allows, so selections and links survive small edits).
export function updateStructure(p, id, params) {
  const st = (p.structures || []).find((s) => s.id === id);
  if (!st) return null;
  st.params = { ...st.params, ...params };
  p.members = p.members.filter((m) => m.structure !== id);
  p.members.push(...generateStructure(st));
  return st;
}

export function removeStructure(p, id) {
  p.structures = (p.structures || []).filter((s) => s.id !== id);
  p.members = p.members.filter((m) => m.structure !== id);
}

// Structures whose members were all deleted go too (normalizeProject).
export function normalizeStructures(p) {
  p.structures = (Array.isArray(p.structures) ? p.structures : []).filter((s) => s && s.id && (s.kind === "tower" || s.kind === "bridge") && p.members.some((m) => m.structure === s.id));
  for (const s of p.structures) if (!s.params || typeof s.params !== "object") s.params = {};
}
