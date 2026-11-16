// Dresses a sample project with the furniture library's props, so every
// room looks lived in: things on tables, counters, dressers and vanities
// (standing on their tops), and free-standing pieces in free corners chosen
// by what the room is (plants, bins, purifiers, people in lobbies, cars in
// garages…). Then the finishing touches of an interior: pictures, mirrors,
// clocks and shelves on free walls, curtains at the windows of living rooms
// and bedrooms, a rug under the coffee table and at the foot of the bed, a
// floor lamp beside the sofa, lamps on nightstands and desks, toys in
// children's rooms. Deterministic per sample. Whatever the model check
// complains about (a wall, a door swing, a clash) is taken out again, so the
// samples keep zero warnings.
import { makeFurniture, furnitureDef, furnitureCorners, mountElevation } from "../src/lib/furniture.js";
import { pointInPolygon, pointSegDist } from "../src/core/geom.js";
import { wallFrame, openingSpans } from "../src/core/walls.js";
import { runCheck } from "../src/core/check.js";
import { uid } from "../src/core/geom.js";

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

// Props by host: what stands on top of it.
const HOST_PROPS = [
  [/^coffee(Table|Oval|Marble|Glass|TableBlack|TableWalnut)$/, ["bowlDeco", "bookStack", "candles", "vaseSet", "flowerVase", "chessBoard"]],
  [/^(sideTable|sideTableMarble|sideTableWood|nestingTables)$/, ["flowerVase", "bookStack", "candles", "deskClock"]],
  [/^(consoleTable|consoleTableOak|sideboard|sideboardWhite|dresser|dresserWhite|dresserWalnut|tallboy)$/, ["vaseSet", "frameStanding", "candles", "bowlDeco", "lantern", "hourglass", "sculpture"]],
  [/^(diningTable4|diningTable4Walnut|diningTable4White|diningTable6|diningTable6Oak|diningTable8|diningOval|roundTable|roundTableWhite|roundMarble|glassDining|picnicTable)$/, ["table"]],
  [/^(island|islandNavy|islandOak|islandWaterfall)$/, ["fruitBowl", "cuttingBoard", "saladBowl", "flowerVase"]],
  [/^(counter|counterOak|counterNavy|counterSage|counterCharcoal)$/, ["kettle", "toaster", "coffeeMachine", "knifeBlock", "utensilHolder", "herbPots", "riceCooker", "breadBox", "microwave"]],
  [/^(meetingTable|readingTable|highTable)$/, ["laptop", "bookStack", "deskOrganizer", "coffeeMugs", "flowerVase"]],
  [/^(cafeTable|patioUmbrella)$/, ["coffeeMugs", "placeSetting"]],
  [/^(studentDesk)$/, ["bookStack", "laptop"]],
  [/^(vanity|vanityWalnut|vanityWhite)$/, ["soapSet", "towelStack"]],
  [/^(desk|deskWalnut|deskBlack|kidsDesk)$/, ["deskLamp", "laptop", "bookStack", "deskOrganizer", "monitor", "succulents"]],
  [/^(tvUnit|tvUnitOak)$/, ["vaseSet", "bookStack", "smartSpeaker", "succulents", "frameStanding"]],
  [/^(bedBench|ottoman|diningBench)$/, ["throwBlanket", "bookStack"]],
  [/^(barCounter)$/, ["wineBottle", "wineGlasses", "espresso"]],
];
// Free-standing pieces by room name.
const ROOM_FLOOR = [
  [/garage|parking/i, ["car", "carSUV", "carHatch", "carWhite", "carBlack", "carSilver"], 2],
  [/living|lounge|family|studio/i, ["plantFiddle", "plantMonstera", "snakePlant", "plantPalm", "oliveTree", "airPurifier", "plantRubber"], 2],
  [/bedroom|guest room/i, ["plantRubber", "laundryBasket", "snakePlant", "airPurifier", "peaceLily"], 2],
  [/kitchen|pantry|bakery/i, ["trashCan", "plantSmall"], 1],
  [/dining|restaurant|canteen|café|bar|ballroom/i, ["plantPalm", "plantFiddle", "oliveTree"], 2],
  [/bath|ensuite|shower|wc|toilet/i, ["wasteBasket", "laundryBasket", "plantBathroom"], 1],
  [/office|study|staff|teachers|principal|administration|business|computer|management|counselling/i, ["plantRubber", "snakePlant", "waterCooler", "airPurifier", "plantFiddle", "shredder"], 2],
  [/meeting|conference|seminar|group study/i, ["plantFiddle", "snakePlant", "plantRubber"], 1],
  [/lobby|foyer|reception|entrance|atrium|waiting|visitor/i, ["oliveTree", "plantPalm", "plantMonstera", "personBusiness", "personWoman", "personMan", "personSkirt"], 3],
  [/library|reading|book|lending/i, ["plantFiddle", "plantRubber", "personChild", "personWoman"], 2],
  [/class|art room|music|science|multipurpose|education|dance/i, ["plantRubber", "snakePlant", "airPurifier"], 1],
  [/gym|sports/i, ["kettlebells", "punchingBag", "personMan"], 1],
  [/shop|supermarket|clothing|store$/i, ["mannequin", "shoppingCart", "personWoman", "plantPalm"], 2],
  [/ward|recovery|exam|consultation|emergency|nurse/i, ["airPurifier", "patientMonitor", "plantRubber"], 1],
  [/gallery|exhibition/i, ["sculptureBust", "personMan", "personWoman", "personSkirt"], 2],
  [/utility|laundry/i, ["laundryBasket", "dryer"], 1],
  [/dressing/i, ["floorMirror", "laundryBasket"], 1],
  [/hall|corridor|landing|entry|vestibule/i, ["umbrellaStand", "plantSmall", "snakePlant", "basket", "zzPlant"], 1],
  [/kid|child|nursery|play/i, ["toyChest", "teddyBear", "rockingHorse", "toyBlocks", "ball", "teepee"], 3],
];
// Small tables that take one thing in the middle (a lamp on a nightstand).
const SINGLE_PROPS = [
  [/^(nightstand|nightstandWhite|nightstandWalnut|nightstandFloat)$/, ["tableLamp", "tableLampSage", "tableLampBrass", "tableLamp", "orchid", "deskClock"]],
];
// Pictures, mirrors, clocks and shelves on free walls, by room name: [kinds, how many].
const WALL_DECOR = [
  [/living|lounge|family|studio/i, ["wallArt", "galleryWall", "mirrorRound", "macrame", "floatingShelves", "mirrorSunburst", "wallClock"], 2],
  [/bedroom|guest room|suite/i, ["wallArt", "mirrorRound", "macrame", "floatingShelves", "wallArt"], 1],
  [/dining|restaurant|canteen|café|cafe|bistro/i, ["wallArt", "wallPlates", "mirrorSunburst", "galleryWall"], 1],
  [/kitchen/i, ["wallClock", "wallPlates"], 1],
  [/hall|corridor|entrance|foyer|landing|lobby|reception|entry/i, ["wallArt", "mirrorRound", "galleryWall", "coatHooks"], 1],
  [/office|study|meeting|conference|staff|seminar/i, ["wallArt", "wallClock", "galleryWall"], 1],
  [/class|library|reading|waiting|ward/i, ["wallClock", "wallArt"], 1],
  [/kid|child|nursery|play/i, ["wallArt", "floatingShelves"], 1],
  [/gallery|exhibition/i, ["wallArt", "galleryWall", "wallArt"], 4],
];
// Curtains at the windows of these rooms.
const CURTAIN_ROOMS = /living|lounge|family|studio|bedroom|guest room|suite|dining|study|kid|child|nursery/i;
const CURTAINS = ["curtainLinen", "curtain", "curtainSheer", "curtainVelvet", "curtainLinen"];
const RUGS = ["rug", "rugGrey", "rugSage", "rugTerracotta", "rugPattern", "rugJute"];

const box = (f) => { const c = furnitureCorners(f); const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const overlaps = (a, b, m = 0) => a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;

// Pieces that have a back (beds, sofas, wardrobes, toilets, counters…).
export const BACKED = /bed|sofa|sectional|chesterfield|wardrobe|bookshelf|bookcase|tvUnit|sideboard|dresser|toilet|washbasin|vanity|fridge|range|counter|desk|wallTV|nightstand|armchair|piano|mediaWall|shelving|cabinet/i;
const NOT_BACKED = /bench|stool|chair$|^rug/i;

// Plan turn: an item's back (local −y) points to (sin rot, −cos rot). A piece
// whose front stands against a wall while its back is free is turned round
// (180° about its centre: the same footprint), so beds put their head, and
// toilets their cistern, to the wall. → how many were turned.
export function faceWalls(p) {
  let n = 0;
  const gap = (it, sgn) => {
    const a = ((it.rot || 0) * Math.PI) / 180;
    const x = it.x + sgn * Math.sin(a) * (it.d / 2), y = it.y - sgn * Math.cos(a) * (it.d / 2);
    let g = Infinity;
    for (const w of p.walls) if (w.level === it.level) g = Math.min(g, pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) - w.thickness / 2);
    return g;
  };
  for (const it of p.furniture) {
    if (!BACKED.test(it.kind) || NOT_BACKED.test(it.kind) || (it.elevation || 0) > 50) continue;
    if (gap(it, -1) < 120 && gap(it, 1) >= 120) { it.rot = ((it.rot || 0) + 180) % 360; n++; }
  }
  return n;
}

export function dress(p, seed = 1) {
  faceWalls(p);
  const r = rng(seed);
  const added = new Set();
  const push = (f) => { const it = { id: uid("u"), ...f }; p.furniture.push(it); added.add(it.id); return it; };
  // ---- on top of hosts
  const hosts = p.furniture.filter((f) => !f.elevation || f.elevation < 50);
  for (const host of hosts) {
    const single = SINGLE_PROPS.find(([re]) => re.test(host.kind));
    const rule = HOST_PROPS.find(([re]) => re.test(host.kind));
    if ((!rule && !single) || r() < 0.12) continue;
    const top = (host.elevation || 0) + host.h;
    const c = Math.cos(((host.rot || 0) * Math.PI) / 180), s = Math.sin(((host.rot || 0) * Math.PI) / 180);
    const at = (u, v) => [host.x + u * c - v * s, host.y + u * s + v * c];
    if (single) {
      const kind = pick(r, single[1]);
      const d = furnitureDef(kind);
      if (d && d.w < host.w - 40 && d.d < host.d - 20) { const [x, y] = at(0, 0); push({ ...makeFurniture(kind, x, y), level: host.level, rot: host.rot || 0, elevation: top }); }
      continue;
    }
    const counter = /^counter/.test(host.kind);
    if (rule[1][0] === "table") {
      // A table set for four on big tables, flowers or fruit on the rest.
      const kind = host.w >= 1300 && host.d >= 750 ? pick(r, ["tableSetFour", "tableSetFour", "flowerVase", "fruitBowl"]) : pick(r, ["flowerVase", "fruitBowl", "saladBowl", "placeSetting"]);
      const d = furnitureDef(kind);
      if (d.w < host.w - 40 && d.d < host.d - 40) { const [x, y] = at(0, 0); push({ ...makeFurniture(kind, x, y), level: host.level, rot: host.rot || 0, elevation: top }); }
      continue;
    }
    const n = Math.max(1, Math.min(3, Math.floor(host.w / 600)));
    const used = [];
    for (let i = 0; i < n; i++) {
      const kind = pick(r, rule[1]);
      const d = furnitureDef(kind);
      if (!d || d.w > host.w * 0.6 || d.d > host.d * 0.85) continue;
      // Counters: on the front half (the wall cabinets are above the back), clear of the middle.
      const u = (r() - 0.5) * (host.w - d.w - 60);
      const v = counter ? Math.max(0, host.d / 2 - d.d / 2 - 40) - host.d * 0.05 : (r() - 0.5) * Math.max(0, host.d - d.d - 60);
      const fp = [u - d.w / 2, v - d.d / 2, u + d.w / 2, v + d.d / 2];
      if (used.some((b) => overlaps(b, fp, 30))) continue;
      used.push(fp);
      const [x, y] = at(u, v);
      push({ ...makeFurniture(kind, x, y), level: host.level, rot: ((host.rot || 0) + (counter ? 0 : Math.round(r() * 3) * 15)) % 360, elevation: top });
    }
  }
  // ---- free-standing in the rooms' corners
  for (const room of p.rooms) {
    const rule = ROOM_FLOOR.find(([re]) => re.test(room.name || ""));
    if (!rule) continue;
    const xs = room.pts.map((q) => q[0]), ys = room.pts.map((q) => q[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const near = p.furniture.filter((f) => f.level === room.level && (!f.elevation || f.elevation < 1800) && f.kind !== "rug").map(box);
    const garage = /garage|parking/i.test(room.name);
    const tries = garage ? [[(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], [bb[0] + 1600, (bb[1] + bb[3]) / 2], [bb[2] - 1600, (bb[1] + bb[3]) / 2]]
      : [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].sort(() => r() - 0.5);
    let placed = 0;
    for (const [cx, cy] of tries) {
      if (placed >= rule[2]) break;
      const kind = pick(r, rule[1]);
      const d = furnitureDef(kind);
      if (!d) continue;
      let x = cx, y = cy, rot = 0;
      if (garage) {
        rot = bb[3] - bb[1] >= bb[2] - bb[0] ? 0 : 90;
        if (Math.min(bb[2] - bb[0], bb[3] - bb[1]) < d.w + 500 || Math.max(bb[2] - bb[0], bb[3] - bb[1]) < d.d + 600) continue;
      } else {
        const inset = Math.max(d.w, d.d) / 2 + 260;
        x = cx === bb[0] ? bb[0] + inset : bb[2] - inset;
        y = cy === bb[1] ? bb[1] + inset : bb[3] - inset;
        if (/^person/.test(kind)) { x = (x + (bb[0] + bb[2]) / 2) / 2; y = (y + (bb[1] + bb[3]) / 2) / 2; rot = Math.round(r() * 7) * 45; }
      }
      const f = { ...makeFurniture(kind, x, y), level: room.level, rot };
      const fb = box(f);
      if (!furnitureCorners(f).every(([px, py]) => pointInPolygon(px, py, room.pts))) continue;
      if (near.some((b) => overlaps(b, fb, garage ? 300 : 120))) continue;
      near.push(fb);
      push(f);
      placed++;
    }
  }
  finishingTouches(p, r, push);
  // ---- take out whatever the model check does not like
  for (let pass = 0; pass < 6 && added.size; pass++) {
    const bad = new Set();
    for (const i of runCheck(p)) for (const id of i.ids || []) if (added.has(id)) bad.add(id);
    if (!bad.size) break;
    p.furniture = p.furniture.filter((f) => !bad.has(f.id));
    for (const id of bad) added.delete(id);
  }
  return added.size;
}

// ---------------------------------------------------------------- finishing touches
// Rotation of an item whose back is against a wall whose inward normal (into
// the room) is n: the back (local −y) turns to (sin rot, −cos rot) = −n.
const rotFacing = (n) => ((Math.round((Math.atan2(-n[0], n[1]) * 180) / Math.PI) % 360) + 360) % 360;

const overlapsZ = (a, b) => {
  const za = [a.elevation || 0, (a.elevation || 0) + (a.h || 0)], zb = [b.elevation || 0, (b.elevation || 0) + (b.h || 0)];
  return za[0] < zb[1] && zb[0] < za[1];
};
const isRug = (g) => /^rug|^runner/.test(g.kind);

// The room's edges that lie on a wall face: {a, b, len, n (into the room),
// wall, f (its frame), uOf(x, y) (along the wall), spans (its openings)}.
function wallEdges(p, room) {
  const out = [];
  const walls = p.walls.filter((w) => w.level === room.level);
  const pts = room.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 900) continue;
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [-d[1], d[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (!pointInPolygon(mid[0] + n[0] * 60, mid[1] + n[1] * 60, pts)) n = [-n[0], -n[1]];
    if (!pointInPolygon(mid[0] + n[0] * 60, mid[1] + n[1] * 60, pts)) continue;
    // The wall behind: parallel, its face on the edge.
    const wall = walls.find((w) => {
      const f = wallFrame(w);
      if (Math.abs(f.d[0] * d[1] - f.d[1] * d[0]) > 0.02) return false;
      const v = (mid[0] - w.x1) * f.n[0] + (mid[1] - w.y1) * f.n[1];
      const u = (mid[0] - w.x1) * f.d[0] + (mid[1] - w.y1) * f.d[1];
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      return Math.abs(Math.abs(v) - w.thickness / 2) < 40 && u > -50 && u < L + 50;
    });
    if (!wall) continue;
    const f = wallFrame(wall);
    const uOf = (x, y) => (x - wall.x1) * f.d[0] + (y - wall.y1) * f.d[1];
    out.push({ a, b, len, n, wall, f, uOf, spans: openingSpans(p, wall) });
  }
  return out;
}

function finishingTouches(p, r, push) {
  const lvH = (id) => ((p.levels.find((l) => l.id === id) || {}).height || 2800);
  for (const room of p.rooms) {
    const name = room.name || "";
    const lv = room.level;
    const here = () => p.furniture.filter((f) => f.level === lv && pointInPolygon(f.x, f.y, room.pts));
    const inside = (f) => furnitureCorners(f).every(([x, y]) => pointInPolygon(x, y, room.pts));
    const fits = (f, m = 80) => {
      const b = box(f);
      return inside(f) && !here().some((g) => !isRug(g) && overlapsZ(f, g) && overlaps(box(g), b, m));
    };
    const edges = wallEdges(p, room);
    // ---- curtains at the windows
    if (CURTAIN_ROOMS.test(name)) {
      const kind = pick(r, CURTAINS);
      const def = furnitureDef(kind);
      for (const e of edges) {
        for (const s of e.spans) {
          if (s.o.kind !== "window" || s.u2 - s.u1 < 500) continue;
          const uc = (s.u1 + s.u2) / 2;
          // The window's centre on the wall, then just into the room.
          const wx = e.wall.x1 + e.f.d[0] * uc, wy = e.wall.y1 + e.f.d[1] * uc;
          const off = e.wall.thickness / 2 + def.d / 2 + 30;
          const x = wx + e.n[0] * off, y = wy + e.n[1] * off;
          const w = Math.min(s.u2 - s.u1 + 400, e.len - 100);
          const h = Math.min(def.h, lvH(lv) - 380);
          const f = { ...makeFurniture(kind, Math.round(x), Math.round(y)), level: lv, rot: rotFacing(e.n), w: Math.round(w), h: Math.round(h) };
          if (fits(f, 0)) push(f);
        }
      }
    }
    // ---- pictures, mirrors, clocks, shelves on free walls
    const deco = WALL_DECOR.find(([re]) => re.test(name));
    if (deco) {
      let placed = 0;
      const order = edges.slice().sort((a, b) => b.len - a.len);
      for (const e of order) {
        if (placed >= deco[2]) break;
        const kind = pick(r, deco[1]);
        const def = furnitureDef(kind);
        if (!def || e.len < def.w + 600) continue;
        const elev = mountElevation(def, lvH(lv));
        // The middle of the edge first, then a third of the way along each way.
        for (const t of [0.5, 0.33, 0.67]) {
          const x = e.a[0] + (e.b[0] - e.a[0]) * t + e.n[0] * (def.d / 2 + 5);
          const y = e.a[1] + (e.b[1] - e.a[1]) * t + e.n[1] * (def.d / 2 + 5);
          // Clear of every opening of that wall (and a hand's width more).
          const u = e.uOf(x, y);
          if (e.spans.some((s) => u + def.w / 2 > s.u1 - 150 && u - def.w / 2 < s.u2 + 150)) continue;
          const f = { ...makeFurniture(kind, Math.round(x), Math.round(y)), level: lv, rot: rotFacing(e.n), elevation: elev };
          if (!inside(f)) continue;
          // Nothing at its height in front of it (a wardrobe, a bookshelf, a wall cabinet) within 400 mm.
          const fb = box(f);
          const reach = [Math.min(fb[0], fb[0] + e.n[0] * 400), Math.min(fb[1], fb[1] + e.n[1] * 400), Math.max(fb[2], fb[2] + e.n[0] * 400), Math.max(fb[3], fb[3] + e.n[1] * 400)];
          if (here().some((g) => !isRug(g) && (g.elevation || 0) + g.h > elev - 50 && (g.elevation || 0) < elev + f.h && overlaps(box(g), reach, 0))) continue;
          push(f);
          placed++;
          break;
        }
      }
    }
    // ---- a rug under the coffee table, a floor lamp beside the sofa
    if (/living|lounge|family|studio/i.test(name)) {
      const table = here().find((g) => /^coffee/.test(g.kind));
      if (table && !here().some(isRug)) {
        const kind = pick(r, RUGS);
        const def = furnitureDef(kind);
        const f = { ...makeFurniture(kind, table.x, table.y), level: lv, rot: table.rot || 0, w: Math.max(def.w, table.w + 1000), d: Math.max(def.d, table.d + 900) };
        if (inside(f)) push(f);
      }
      const sofa = here().find((g) => /^(sofa|sectional|chesterfield)/.test(g.kind) && !g.elevation);
      if (sofa && !here().some((g) => /^(floorLamp|arcLamp|floorUplight)/.test(g.kind))) {
        const rr = ((sofa.rot || 0) * Math.PI) / 180;
        const right = [Math.cos(rr), Math.sin(rr)], back = [Math.sin(rr), -Math.cos(rr)];
        for (const side of [1, -1]) {
          const x = sofa.x + right[0] * side * (sofa.w / 2 + 300) + back[0] * (sofa.d / 2 - 250);
          const y = sofa.y + right[1] * side * (sofa.w / 2 + 300) + back[1] * (sofa.d / 2 - 250);
          const f = { ...makeFurniture(pick(r, ["floorLamp", "floorLampBlack", "floorLamp"]), Math.round(x), Math.round(y)), level: lv, rot: sofa.rot || 0 };
          if (fits(f, 60)) { push(f); break; }
        }
      }
    }
    // ---- a rug at the foot of the bed
    if (/bedroom|guest room|suite|kid|child/i.test(name) && !here().some(isRug)) {
      const bed = here().find((g) => furnitureDef(g.kind) && furnitureDef(g.kind).cat === "Bedroom" && /bed/i.test(g.kind) && !/bunk|loft|crib|bench/i.test(g.kind));
      if (bed) {
        const rr = ((bed.rot || 0) * Math.PI) / 180;
        const back = [Math.sin(rr), -Math.cos(rr)];
        const kind = pick(r, RUGS);
        const x = bed.x - back[0] * bed.d * 0.22, y = bed.y - back[1] * bed.d * 0.22;
        const f = { ...makeFurniture(kind, Math.round(x), Math.round(y)), level: lv, rot: bed.rot || 0, w: bed.w + 900, d: Math.round(bed.d * 0.75) };
        if (inside(f)) push(f);
      }
    }
  }
}
