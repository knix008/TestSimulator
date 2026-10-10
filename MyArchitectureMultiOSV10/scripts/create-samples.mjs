// Builds the sample projects in sample/ (index.json + *.myarch) from code and
// checks every one: rooms detected and named, no model-check errors, the 3D
// model builds and the DXF/IFC writers accept it (when those modules exist).
//
//   npm run build:samples
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const imp = (f) => import(pathToFileURL(path.join(root, f)).href);
const { newProject, normalizeProject, newLevel, serializeProject } = await imp("src/core/project.js");
const { detectRooms } = await imp("src/core/rooms.js");
const { pointInPolygon, uid } = await imp("src/core/geom.js");
const { makeFurniture, furnitureDef, mountElevation } = await imp("src/lib/furniture.js");
const { runCheck } = await imp("src/core/check.js");
const { buildingOutlines } = await imp("src/core/rooms.js");

// ---------------------------------------------------------------- builder
function builder(title, meta = {}) {
  const p = newProject(title);
  Object.assign(p.meta, { author: "SHKWON", company: "MyArchitecture", ...meta });
  const L = { list: p.levels };
  const api = {
    p,
    level(i) { return p.levels[i].id; },
    addLevel(name, height = 2800) { const top = p.levels[p.levels.length - 1]; const lv = newLevel(name, top.elevation + top.height, height); p.levels.push(lv); return lv.id; },
    wall(level, a, b, t = 200, extra = {}) { const wt = extra.type && p.wallTypes.find((x) => x.id === extra.type); if (wt) t = wt.layers.reduce((s, l) => s + l.thickness, 0); /* the type sets the thickness, as normalizeProject does */ const w = { id: uid("w"), level, x1: a[0], y1: a[1], x2: b[0], y2: b[1], thickness: t, height: null, ...extra }; p.walls.push(w); return w; },
    // Closed outline of walls through the points.
    loop(level, pts, t = 250, extra = {}) { return pts.map((a, i) => api.wall(level, a, pts[(i + 1) % pts.length], t, extra)); },
    door(w, at, width = 900, extra = {}) { const o = { id: uid("o"), wall: w.id, kind: "door", type: "single", at, width, height: 2100, sill: 0, side: 1, hinge: "start", ...extra }; p.openings.push(o); return o; },
    window(w, at, width = 1200, extra = {}) { const o = { id: uid("o"), wall: w.id, kind: "window", type: "casement", at, width, height: 1200, sill: 900, side: 1, hinge: "start", ...extra }; p.openings.push(o); return o; },
    // Detect rooms on a level and name them from marker points.
    rooms(level, names) {
      const walls = p.walls.filter((w) => w.level === level);
      for (const r of detectRooms(walls)) {
        const n = names.find(([x, y]) => pointInPolygon(x, y, r.pts));
        if (!n) continue;
        p.rooms.push({ id: uid("r"), level, name: n[2], pts: r.pts, floor: n[3] || "oak" });
      }
    },
    furn(level, kind, x, y, rot = 0, extra = {}) { const f = { id: uid("u"), level, ...makeFurniture(kind, x, y), rot, ...extra }; p.furniture.push(f); return f; },
    // A light fixture; ceiling lamps hang under the ceiling of their level.
    lamp(level, kind, x, y, rot = 0, extra = {}) { const lv = p.levels.find((l) => l.id === level); return api.furn(level, kind, x, y, rot, { elevation: mountElevation(furnitureDef(kind), lv ? lv.height : 2800), ...extra }); },
    stair(level, x, y, rot, length, width = 1000, steps = 16) { p.stairs.push({ id: uid("s"), level, x, y, rot, length, width, steps }); },
    column(level, x, y, size = 400, shape = "rect") { p.columns.push({ id: uid("c"), level, x, y, w: size, d: size, rot: 0, shape }); },
    roof(level, kind = "gable", pitch = 30, overhang = 500) {
      for (const pts of buildingOutlines(p.walls.filter((w) => w.level === level))) p.roofs.push({ id: uid("f"), level, pts, kind, pitch, overhang, thickness: 200, material: kind === "flat" ? "concrete" : "roof-tiles" });
    },
    dims(level) {
      const ws = p.walls.filter((w) => w.level === level);
      const xs = ws.flatMap((w) => [w.x1, w.x2]), ys = ws.flatMap((w) => [w.y1, w.y2]);
      const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
      p.dimensions.push({ id: uid("k"), level, x1, y1, x2, y2: y1, offset: -1200, auto: true }, { id: uid("k"), level, x1, y1: y2, x2: x1, y2: y1, offset: -1200, auto: true });
    },
    text(level, x, y, text, size = 300) { p.texts.push({ id: uid("t"), level, x, y, text, size, rot: 0 }); },
  };
  void L;
  return api;
}

const samples = [];
function add(file, b, info) {
  const p = normalizeProject(b.p);
  p.view.level = p.levels[0].id;
  samples.push({ file, project: p, ...info });
}

// ---------------------------------------------------------------- 1. studio
{
  const b = builder("Studio apartment", { client: "Sample", address: "Seoul" });
  const L = b.level(0);
  const [o1, o2, o3, o4] = b.loop(L, [[0, 0], [7200, 0], [7200, 5400], [0, 5400]], 250);
  const part = b.wall(L, [4800, 3000], [7200, 3000], 120);
  const part2 = b.wall(L, [4800, 3000], [4800, 5400], 120);
  b.window(o1, 2000, 1800);
  b.window(o1, 5600, 1200);
  b.window(o2, 1500, 1200);
  b.door(o3, 3300, 1000, { side: 1, hinge: "end" });
  b.door(part2, 1100, 800, { side: -1 });
  b.window(o4, 2700, 1500);
  b.rooms(L, [[2400, 2700, "Living room", "oak"], [6000, 4200, "Bathroom", "tile-white"]]);
  b.furn(L, "doubleBed", 1250, 1300, 90);
  b.furn(L, "nightstand", 330, 2450, 90);
  b.furn(L, "sofa2", 2100, 4650, 180);
  b.furn(L, "coffeeTable", 2100, 3700);
  b.furn(L, "tvUnit", 2100, 2700, 0, { w: 1500 });
  b.furn(L, "counter", 5700, 450, 0, { w: 2400 });
  b.furn(L, "fridge", 6700, 1300, 270);
  b.furn(L, "roundTable", 5600, 1900, 0, { w: 800, d: 800 });
  b.furn(L, "chair", 5600, 2450, 180);
  b.furn(L, "toilet", 6700, 4900, 270);
  b.furn(L, "washbasin", 5200, 3350, 0);
  b.furn(L, "shower", 6630, 3570, 0);
  b.furn(L, "wardrobe", 450, 4300, 90, { w: 1400 });
  b.furn(L, "plant", 3900, 600);
  // Lighting: ceiling light, a pendant over the table, downlights in the shower room, a floor lamp by the sofa, a reading light over the bed.
  b.lamp(L, "ceilingLight", 2400, 2700); b.lamp(L, "pendantLamp", 5600, 1900); b.lamp(L, "downlight", 5500, 4200); b.lamp(L, "downlight", 6500, 4200);
  b.lamp(L, "floorLamp", 1050, 4800); b.lamp(L, "wallSconce", 205, 700, 270);
  b.dims(L);
  b.roof(L, "flat", 0, 200);
  add("01-studio.myarch", b, { title: "Studio apartment", titleKo: "원룸", description: "One room with a kitchen line and a shower room, fully furnished.", descriptionKo: "주방 라인과 샤워실이 있는 원룸, 가구 배치 포함.", tags: ["1 level", "furniture", "flat roof"] });
}

// ---------------------------------------------------------------- 2. two-bedroom apartment
{
  const b = builder("Two-bedroom apartment", { client: "Sample", address: "Busan" });
  const L = b.level(0);
  const [n, e, s, w] = b.loop(L, [[0, 0], [11400, 0], [11400, 8400], [0, 8400]], 250);
  const c1 = b.wall(L, [0, 4200], [6600, 4200], 150);
  const c2 = b.wall(L, [3600, 0], [3600, 4200], 150);
  const c3 = b.wall(L, [6600, 0], [6600, 8400], 150);
  const c4 = b.wall(L, [3600, 4200], [3600, 8400], 120);
  b.window(n, 1800, 1500); b.window(n, 5100, 1500); b.window(n, 9000, 2400, { type: "sliding" });
  b.window(e, 4200, 1500);
  b.window(s, 2500, 1500, { hinge: "end" }); b.window(s, 9000, 1800);
  b.window(w, 6300, 900);
  b.door(s, 5100, 1000, { side: 1 });
  b.door(c1, 1800, 900, { side: -1 });
  b.door(c1, 5100, 900, { side: -1, hinge: "end" });
  b.door(c4, 1500, 800, { side: 1 });
  b.door(c3, 6300, 1600, { kind: "opening", type: "none", height: 2100 });
  void c2;
  b.rooms(L, [[1800, 2100, "Bedroom", "oak"], [5100, 2100, "Bedroom", "oak"], [9000, 4200, "Living room", "walnut"], [1800, 6300, "Bathroom", "tile-white"], [5100, 6300, "Hall", "tile-grey"]]);
  b.furn(L, "doubleBed", 1800, 1250, 0); b.furn(L, "nightstand", 680, 300); b.furn(L, "wardrobe", 425, 2600, 90, { w: 1600 });
  b.furn(L, "singleBed", 4300, 1450, 0); b.furn(L, "desk", 6225, 1500, 270); b.furn(L, "officeChair", 5600, 1500, 90);
  b.furn(L, "sofa3", 9000, 7400, 180); b.furn(L, "coffeeTable", 9000, 6300); b.furn(L, "tvUnit", 9000, 4900, 0, { w: 1800 });
  b.furn(L, "counter", 8100, 450, 0, { w: 2700 }); b.furn(L, "stove", 10100, 450); b.furn(L, "fridge", 10800, 1300, 270);
  b.furn(L, "diningTable4", 8800, 2500); b.furn(L, "chair", 8400, 1900); b.furn(L, "chair", 9200, 1900); b.furn(L, "chair", 8400, 3100, 180); b.furn(L, "chair", 9200, 3100, 180);
  b.furn(L, "bathtub", 1800, 7920, 0); b.furn(L, "toilet", 3150, 7600, 270); b.furn(L, "washbasin", 450, 5700, 90); b.furn(L, "washer", 450, 4800, 90);
  b.furn(L, "plant", 10900, 7900); b.furn(L, "armchair", 7400, 6300, 90); b.furn(L, "rug", 9000, 6300, 0, { w: 2400, d: 1600 });
  b.dims(L);
  add("02-two-bedroom.myarch", b, { title: "Two-bedroom apartment", titleKo: "방 두 개 아파트", description: "Two bedrooms, living/dining/kitchen, bathroom and hall.", descriptionKo: "침실 2, 거실·식당·주방, 욕실, 현관.", tags: ["1 level", "apartment", "schedules"] });
}

// ---------------------------------------------------------------- 3. two-storey house
{
  const b = builder("Two-storey house", { client: "Sample", address: "Jeju" });
  const G = b.level(0);
  b.p.levels[0].name = "1F";
  const [n, e, s, w] = b.loop(G, [[0, 0], [10000, 0], [10000, 8000], [0, 8000]], 300);
  const g1 = b.wall(G, [6000, 0], [6000, 8000], 150);
  const g2 = b.wall(G, [6000, 4400], [10000, 4400], 150);
  b.window(n, 1600, 1800); b.window(n, 4300, 1800); b.window(n, 8000, 1200);
  b.window(w, 4000, 2400, { type: "sliding", sill: 0, height: 2200 });
  b.window(s, 1800, 2400, { type: "sliding", sill: 0, height: 2200 }); b.window(e, 2200, 1200);
  b.door(s, 4600, 1000, { side: -1, hinge: "end" });
  b.door(g1, 6200, 900, { side: -1 });
  b.door(g2, 2000, 800, { side: 1 });
  b.rooms(G, [[3000, 4000, "Living room", "oak"], [8000, 2200, "Kitchen", "tile-grey"], [8000, 6200, "Toilet", "tile-white"]]);
  b.stair(G, 4000, 6900, 0, 3600, 1000, 16);
  b.furn(G, "sofa3", 2400, 2100, 0); b.furn(G, "coffeeTable", 2400, 3200); b.furn(G, "armchair", 900, 3300, 90); b.furn(G, "tvUnit", 2400, 4600, 180);
  b.furn(G, "counter", 8000, 450, 0, { w: 3400 }); b.furn(G, "island", 8000, 2600); b.furn(G, "barStool", 7500, 3300); b.furn(G, "barStool", 8500, 3300); b.furn(G, "fridge", 9500, 1500, 270);
  b.furn(G, "toilet", 9500, 5300, 270); b.furn(G, "washbasin", 9600, 7000, 270);
  b.lamp(G, "ceilingLight", 2400, 3200); b.lamp(G, "pendantLamp", 7500, 2600); b.lamp(G, "pendantLamp", 8500, 2600); b.lamp(G, "downlight", 8000, 6200); b.lamp(G, "trackLight", 8000, 1200);
  b.furn(G, "car", -2600, 4000, 0); b.furn(G, "tree", 13000, 2500); b.furn(G, "tree", 12500, 7000, 0, { w: 2400, d: 2400, h: 4200 }); b.furn(G, "shrub", -1000, 9200);
  const U = b.addLevel("2F", 2800);
  const [n2, e2, s2, w2] = b.loop(U, [[0, 0], [10000, 0], [10000, 8000], [0, 8000]], 300);
  const u1 = b.wall(U, [5000, 0], [5000, 5600], 150);
  const u2 = b.wall(U, [0, 5600], [10000, 5600], 150);
  const u3 = b.wall(U, [7600, 5600], [7600, 8000], 120);
  b.window(n2, 2500, 1500); b.window(n2, 7500, 1500); b.window(w2, 2800, 1200); b.window(e2, 2800, 1200); b.window(s2, 8800, 900); b.window(s2, 3000, 1500);
  b.door(u2, 2000, 900, { side: 1 }); b.door(u2, 7000, 900, { side: 1, hinge: "end" }); b.door(u3, 1200, 800, { side: -1 });
  void u1;
  b.rooms(U, [[2500, 2800, "Bedroom", "oak"], [7500, 2800, "Bedroom", "oak"], [8800, 6800, "Bathroom", "tile-white"], [3800, 6800, "Hall", "oak"]]);
  b.furn(U, "doubleBed", 2500, 1300, 0); b.furn(U, "wardrobe", 700, 4200, 90, { w: 1800 }); b.furn(U, "nightstand", 1400, 450); b.furn(U, "nightstand", 3600, 450);
  b.furn(U, "singleBed", 8600, 1300, 0); b.furn(U, "desk", 6200, 500); b.furn(U, "chair", 6200, 1100, 180); b.furn(U, "bookshelf", 9650, 4300, 270);
  b.furn(U, "bathtub", 8900, 7450, 0, { w: 1500 }); b.furn(U, "toilet", 9500, 6100, 270); b.furn(U, "washbasin", 7900, 6100, 90);
  b.lamp(U, "ceilingLight", 2500, 2800); b.lamp(U, "ceilingLight", 7500, 2800); b.lamp(U, "downlight", 8800, 6800); b.lamp(U, "pendantLamp", 2500, 6800); b.lamp(U, "tableLamp", 5800, 400, 0, { elevation: 750 });
  b.roof(U, "gable", 32, 600);
  b.dims(G); b.dims(U);
  add("03-two-storey-house.myarch", b, { title: "Two-storey house", titleKo: "2층 주택", description: "Two levels joined by a stair, gable roof, garden with trees and a car.", descriptionKo: "계단으로 연결된 2개 층, 박공지붕, 나무와 자동차가 있는 마당.", tags: ["2 levels", "stairs", "gable roof"], hero: true });
}

// ---------------------------------------------------------------- 4. small office
{
  const b = builder("Small office", { client: "Sample", address: "Daejeon" });
  const L = b.level(0);
  b.p.levels[0].height = 3200;
  const [n, e, s, w] = b.loop(L, [[0, 0], [14000, 0], [14000, 9000], [0, 9000]], 300, { material: "concrete" });
  const m1 = b.wall(L, [9600, 0], [9600, 5000], 120, { material: "glass" });
  const m2 = b.wall(L, [9600, 5000], [14000, 5000], 120, { material: "glass" });
  const t1 = b.wall(L, [0, 6200], [4200, 6200], 150);
  const t2 = b.wall(L, [4200, 6200], [4200, 9000], 150);
  for (const x of [2000, 4600, 7200]) b.window(n, x, 1800);
  b.window(n, 11800, 2400); b.window(e, 2500, 1800); b.window(e, 7000, 1200); b.window(w, 3000, 1800);
  b.door(s, 7600, 1800, { type: "double" });
  b.door(m2, 1400, 1000, { side: -1, type: "sliding" });
  b.door(t1, 2400, 900, { side: -1 });
  b.door(t2, 1500, 800, { side: 1 });
  void m1;
  b.rooms(L, [[5000, 3000, "Office", "carpet"], [11800, 2500, "Meeting room", "carpet"], [2100, 7600, "Toilet", "tile-white"], [9000, 7300, "Entrance", "tile-grey"]]);
  for (const x of [4800, 9600 - 4800 + 4800]) b.column(L, x, 4500, 400);
  b.column(L, 4800, 4500, 400, "round");
  for (const [x, y] of [[1700, 1300], [4300, 1300], [6900, 1300], [1700, 3600], [4300, 3600], [6900, 3600]]) { b.furn(L, "officeDesk", x, y, 0); b.furn(L, "officeChair", x, y + 750, 180); }
  b.furn(L, "meetingTable", 11800, 2500); for (const dx of [-800, 0, 800]) { b.furn(L, "chair", 11800 + dx, 1650); b.furn(L, "chair", 11800 + dx, 3350, 180); }
  b.furn(L, "filing", 9150, 1000, 270); b.furn(L, "filing", 9150, 1600, 270); b.furn(L, "plant", 13500, 8500); b.furn(L, "sofa2", 11800, 8400, 180); b.furn(L, "toilet", 3700, 8500, 270); b.furn(L, "washbasin", 600, 8550, 0);
  b.dims(L);
  b.roof(L, "flat", 0, 300);
  add("04-small-office.myarch", b, { title: "Small office", titleKo: "소규모 사무실", description: "Open office, glass meeting room, columns and a reception.", descriptionKo: "오픈 오피스, 유리 회의실, 기둥, 로비.", tags: ["office", "columns", "glass walls"] });
}

// ---------------------------------------------------------------- 5. cabin
{
  const b = builder("Wooden cabin", { client: "Sample", address: "Gangwon" });
  const L = b.level(0);
  const [n, e, s, w] = b.loop(L, [[0, 0], [6000, 0], [6000, 4500], [0, 4500]], 200, { material: "wood-cladding" });
  const p1 = b.wall(L, [4000, 2500], [6000, 2500], 100, { material: "wood-cladding" });
  const p2 = b.wall(L, [4000, 2500], [4000, 4500], 100, { material: "wood-cladding" });
  b.window(s, 2000, 2400, { type: "sliding", sill: 0, height: 2100 }); b.window(w, 2200, 1200); b.window(n, 2000, 1500); b.window(e, 1200, 900);
  b.door(n, 4800, 900, { side: -1 });
  b.door(p2, 1000, 700, { side: -1, hinge: "end" });
  void p1;
  b.rooms(L, [[2000, 2200, "Living room", "walnut"], [5000, 3500, "Bathroom", "tile-white"]]);
  b.furn(L, "sofa2", 1700, 3800, 180); b.furn(L, "armchair", 500, 2600, 90); b.furn(L, "singleBed", 4300, 1100, 90); b.furn(L, "counter", 1600, 400, 0, { w: 2400 }); b.furn(L, "toilet", 5550, 4100, 270); b.furn(L, "shower", 5450, 3000);
  b.furn(L, "tree", -2500, -1500); b.furn(L, "tree", 8500, 6000, 0, { w: 2600, d: 2600, h: 5500 }); b.furn(L, "bench", 3000, 5600);
  b.roof(L, "shed", 15, 500);
  b.dims(L);
  add("05-wooden-cabin.myarch", b, { title: "Wooden cabin", titleKo: "목조 오두막", description: "A small cabin with wood cladding and a shed roof.", descriptionKo: "목재 외장과 외쪽지붕의 작은 오두막.", tags: ["shed roof", "materials"] });
}

// A saved 3D view looking at the model from direction `dir` (scenes).
function sceneFor(p, name, dir, extra = {}) {
  const xs = p.walls.flatMap((w) => [w.x1, w.x2]).concat((p.solids || []).flatMap((s) => s.pts.map((q) => q[0])));
  const ys = p.walls.flatMap((w) => [w.y1, w.y2]).concat((p.solids || []).flatMap((s) => s.pts.map((q) => q[1])));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2000, cz = (Math.min(...ys) + Math.max(...ys)) / 2000;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 1000;
  const L = Math.hypot(...dir) || 1;
  const d = span * 1.6 + 8;
  return { id: uid("sc"), name, camera: { pos: [cx + (dir[0] / L) * d, (dir[1] / L) * d, cz + (dir[2] / L) * d], target: [cx, 2, cz], ortho: !!extra.ortho }, style: extra.style || "realistic", section: extra.section ?? null, phase: extra.phase || "all" };
}

// ---------------------------------------------------------------- 6. renovation (BIM)
{
  const b = builder("Renovation of a small house", { client: "Sample", address: "Daegu", classificationSystem: "Uniclass 2015" });
  const p = b.p;
  const L = b.level(0);
  // The existing house: rendered external walls and a block partition.
  const ext = b.loop(L, [[0, 0], [9000, 0], [9000, 7000], [0, 7000]], 250, { type: "ext-render-250", phase: "existing" });
  const old = b.wall(L, [4500, 0], [4500, 7000], 150, { type: "int-block-150", phase: "demolish" });
  b.door(old, 3500, 900, { phase: "demolish", side: 1 });
  // New work: an open plan with a drywall bathroom and a new extension.
  const n1 = b.wall(L, [6000, 4000], [9000, 4000], 100, { type: "int-drywall-100", phase: "new" });
  const n2 = b.wall(L, [6000, 4000], [6000, 7000], 100, { type: "int-drywall-100", phase: "new" });
  const extension = [b.wall(L, [9000, 1000], [12500, 1000], 300, { type: "ext-brick-300" }), b.wall(L, [12500, 1000], [12500, 6000], 300, { type: "ext-brick-300" }), b.wall(L, [12500, 6000], [9000, 6000], 300, { type: "ext-brick-300" })];
  const opening = b.door(ext[1], 3500, 3000, { kind: "opening", type: "none", height: 2400, phase: "new" });
  void opening;
  b.window(ext[0], 2200, 1500, { phase: "existing" }); b.window(ext[0], 6700, 1500, { phase: "existing" });
  b.door(ext[2], 6600, 1000, { phase: "existing", side: 1, hinge: "end" });
  b.window(ext[3], 3500, 1200, { phase: "existing" });
  b.window(extension[1], 2500, 2400, { type: "sliding", sill: 300, height: 1800 });
  b.window(extension[0], 1750, 1500);
  b.door(n2, 1500, 800, { side: -1 });
  b.rooms(L, [[3000, 3500, "Living room", "oak"], [7500, 5500, "Bathroom", "tile-white"], [10700, 3500, "Dining room", "walnut"], [7500, 2000, "Kitchen", "tile-grey"]]);
  p.rooms.forEach((r, i) => { r.number = String(101 + i); r.department = r.name === "Bathroom" ? "Wet area" : "Living"; r.classification = "SL_45_10"; });
  for (const w of p.walls) w.classification = w.phase === "demolish" ? "Ss_25_12" : "Ss_25_10_30";
  ext[0].props = { FireRating: "REI 60", ThermalTransmittance: 0.24, LoadBearing: true };
  extension[1].props = { FireRating: "REI 90", ThermalTransmittance: 0.18, LoadBearing: true, Manufacturer: "Sample Bricks Co." };
  b.furn(L, "sofa3", 2400, 3000, 180); b.furn(L, "diningTable6", 10700, 3500); b.furn(L, "counter", 7500, 450, 0, { w: 2600 }); b.furn(L, "toilet", 8500, 6500, 270); b.furn(L, "shower", 6600, 6400);
  p.grids.push({ id: uid("g"), x1: 0, y1: -1500, x2: 0, y2: 8500, label: "1" }, { id: uid("g"), x1: 9000, y1: -1500, x2: 9000, y2: 8500, label: "2" }, { id: uid("g"), x1: 12500, y1: -1500, x2: 12500, y2: 8500, label: "3" },
    { id: uid("g"), x1: -1500, y1: 0, x2: 14000, y2: 0, label: "A" }, { id: uid("g"), x1: -1500, y1: 7000, x2: 14000, y2: 7000, label: "B" });
  p.roofs.push({ id: uid("f"), level: L, pts: [[9000, 1000], [12500, 1000], [12500, 6000], [9000, 6000]], kind: "flat", pitch: 0, overhang: 300, thickness: 250, material: "concrete" });
  b.dims(L);
  p.scenes.push(sceneFor(p, "Before (existing)", [1, 0.9, 1.2], { phase: "existing" }), sceneFor(p, "After (new design)", [1, 0.9, 1.2], { phase: "new" }), sceneFor(p, "Plan cut", [0, 1, 0.0001], { section: 1200, style: "realistic" }));
  add("06-renovation-bim.myarch", b, { title: "Renovation (BIM phases)", titleKo: "리모델링 (BIM 단계)", description: "Existing, demolished and new work with layered wall types, grids, room numbers, properties and a cost estimate.", descriptionKo: "기존·철거·신축 단계, 다층 벽 타입, 그리드, 실 번호, 속성과 공사비.", tags: ["BIM", "phases", "wall types", "grid"] });
}

// ---------------------------------------------------------------- 7. massing study (SketchUp-style)
{
  const b = builder("Massing study", { client: "Sample", address: "Incheon" });
  const p = b.p;
  const L = b.level(0);
  const box = (x, y, w, d, h, extra = {}) => { const s = { id: uid("v"), level: L, pts: [[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z0: 0, height: h, taper: 1, material: "concrete", ...extra }; p.solids.push(s); return s; };
  const podium = box(0, 0, 30000, 20000, 6000, { name: "Podium", material: "stone" });
  const towerA = box(3000, 3000, 10000, 10000, 36000, { name: "Tower A", material: "glass", z0: 6000 });
  const towerB = box(17000, 4000, 9000, 12000, 24000, { name: "Tower B", material: "plaster", z0: 6000 });
  const cyl = { id: uid("v"), level: L, name: "Rotunda", pts: Array.from({ length: 32 }, (_, i) => [24000 + 3500 * Math.cos((i / 32) * Math.PI * 2), -6000 + 3500 * Math.sin((i / 32) * Math.PI * 2)]), z0: 0, height: 9000, taper: 1, material: "brick" };
  const crown = { id: uid("v"), level: L, name: "Crown", pts: [[3000, 3000], [13000, 3000], [13000, 13000], [3000, 13000]], z0: 42000, height: 6000, taper: 0.3, material: "roof-metal" };
  p.solids.push(cyl, crown);
  const g = uid("grp");
  for (const s of [towerA, crown]) s.group = g;
  void podium; void towerB;
  for (const [x, y] of [[-6000, 24000], [0, 24000], [6000, 24000], [12000, 24000], [18000, 24000], [24000, 24000], [32000, 10000], [-5000, 6000]]) b.furn(L, "tree", x, y, 0, { w: 4000, d: 4000, h: 7000 });
  b.furn(L, "car", 34000, 18000, 90); b.furn(L, "car", 34000, 21000, 90);
  for (let i = 0; i < 6; i++) p.grids.push({ id: uid("g"), x1: i * 6000, y1: -11000, x2: i * 6000, y2: 22000, label: String(i + 1) });
  for (let j = 0; j < 4; j++) p.grids.push({ id: uid("g"), x1: -3000, y1: j * 6000 + 1000, x2: 33000, y2: j * 6000 + 1000, label: String.fromCharCode(65 + j) });
  b.text(L, -2000, 27000, "Massing options — heights are pushed/pulled in 3D", 600);
  p.scenes.push(sceneFor(p, "Aerial", [1, 1.1, 1.3]), sceneFor(p, "Street view", [0.2, 0.15, 1]), sceneFor(p, "White model", [-1, 0.9, 1], { style: "white" }), sceneFor(p, "Elevation", [0, 0.0001, 1], { ortho: true, style: "lines" }));
  add("07-massing-study.myarch", b, { title: "Massing study", titleKo: "매스 스터디", description: "SketchUp-style mass models: podium, towers, a rotunda and a tapered crown, with scenes to play.", descriptionKo: "스케치업식 매스 모델: 포디움, 타워, 원형 건물, 테이퍼 지붕과 장면 애니메이션.", tags: ["mass", "scenes", "push/pull", "groups"] });
}

// ---------------------------------------------------------------- 8. apartment block
{
  const b = builder("Apartment block", { client: "Sample", address: "Gwangju" });
  const p = b.p;
  const G = b.level(0);
  p.levels[0].name = "1F";
  const levels = [G, b.addLevel("2F", 2900), b.addLevel("3F", 2900)];
  p.levels[0].height = 2900;
  p.levels[1].elevation = 2900; p.levels[2].elevation = 5800;
  levels.forEach((L, li) => {
    const [n, e, s, w] = b.loop(L, [[0, 0], [16000, 0], [16000, 10000], [0, 10000]], 300, { type: "ext-brick-300" });
    const core1 = b.wall(L, [6500, 0], [6500, 10000], 200, { type: "concrete-200" });
    const core2 = b.wall(L, [9500, 0], [9500, 10000], 200, { type: "concrete-200" });
    const c3 = b.wall(L, [6500, 4000], [9500, 4000], 150, { type: "int-block-150" });
    const a1 = b.wall(L, [0, 6000], [6500, 6000], 100, { type: "int-drywall-100" });
    const a2 = b.wall(L, [9500, 6000], [16000, 6000], 100, { type: "int-drywall-100" });
    for (const at of [1600, 4800, 11200, 14400]) b.window(n, at, 1600);
    for (const at of [1600, 4800, 11200, 14400]) b.window(s, at, 1600);
    b.window(e, 3000, 1200); b.window(w, 3000, 1200);
    b.door(core1, 7000, 1000, { side: -1 }); b.door(core2, 7000, 1000, { side: 1, hinge: "end" });
    if (li === 0) b.door(s, 8000, 1600, { type: "double" });
    b.door(c3, 1500, 1000, { side: 1 });
    b.door(a1, 3200, 800, { side: -1 }); b.door(a2, 3200, 800, { side: -1, hinge: "end" });
    b.rooms(L, [[3200, 3000, "Living room", "oak"], [3200, 8000, "Bedroom", "oak"], [12800, 3000, "Living room", "oak"], [12800, 8000, "Bedroom", "oak"], [8000, 2000, "Stairs", "concrete"], [8000, 7000, "Hall", "tile-grey"]]);
    p.rooms.filter((r) => r.level === L).forEach((r, i) => { r.number = `${li + 1}${String(i + 1).padStart(2, "0")}`; r.department = r.name === "Stairs" || r.name === "Hall" ? "Common" : i < 2 ? "Unit A" : "Unit B"; });
    if (li < 2) b.stair(L, 8000, 2000, 270, 3200, 1100, 17);
    for (const x of [0, 6500, 9500, 16000]) for (const y of [0, 10000]) b.column(L, x, y, 450);
    b.furn(L, "sofa3", 3200, 3800, 180); b.furn(L, "doubleBed", 2000, 8200, 90); b.furn(L, "sofa3", 12800, 3800, 180); b.furn(L, "doubleBed", 14000, 8200, 270);
    b.furn(L, "counter", 3200, 450, 0, { w: 3000 }); b.furn(L, "counter", 12800, 450, 0, { w: 3000 });
    void w;
  });
  for (const [i, x] of [0, 6500, 9500, 16000].entries()) p.grids.push({ id: uid("g"), x1: x, y1: -2000, x2: x, y2: 12000, label: String(i + 1) });
  for (const [j, y] of [0, 10000].entries()) p.grids.push({ id: uid("g"), x1: -2000, y1: y, x2: 18000, y2: y, label: String.fromCharCode(65 + j) });
  b.roof(levels[2], "flat", 0, 300);
  for (const L of levels) b.dims(L);
  p.scenes.push(sceneFor(p, "Aerial", [1, 1, 1.2]), sceneFor(p, "2F cut", [0.6, 1.4, 0.8], { section: 4100 }));
  add("08-apartment-block.myarch", b, { title: "Apartment block", titleKo: "3층 공동주택", description: "Three storeys of two units around a stair core, with columns on a structural grid and numbered rooms.", descriptionKo: "계단실을 중심으로 한 2세대 × 3개 층, 구조 그리드 위 기둥, 실 번호.", tags: ["3 levels", "grid", "columns", "BIM"] });
}

// ---------------------------------------------------------------- 9. CAD tracing
{
  const { exportDxf, importDxf } = await imp("src/io/dxf.js");
  const src = samples.find((s) => s.file === "02-two-bedroom.myarch").project;
  const dxf = exportDxf(src, { level: src.levels[0].id });
  const b = builder("Tracing a DXF drawing", { client: "Sample", address: "Ulsan" });
  const p = b.p;
  const L = b.level(0);
  const res = importDxf(dxf, { level: L, units: "mm" });
  for (const l of res.layers) if (!p.layers.some((x) => x.id === l.id)) p.layers.push(l);
  // Drawings 10 m to the right so the traced model sits beside the CAD original.
  for (const d of res.drawings) { if (d.pts) d.pts = d.pts.map(([x, y]) => [x + 14000, y]); if (d.cx !== undefined) d.cx += 14000; p.drawings.push({ ...d, level: L }); }
  for (const tx of res.texts) p.texts.push({ ...tx, x: tx.x + 14000, level: L });
  for (const l of p.layers) if (/FURN|ANNO-DIMS/.test(l.name)) l.visible = false;
  // Half of the outline already traced as walls on top of the drawing.
  const [n, e] = b.loop(L, [[14000, 0], [25400, 0], [25400, 8400], [14000, 8400]], 250);
  b.window(n, 1800, 1500); b.window(n, 5100, 1500); b.window(e, 4200, 1500);
  b.text(L, 14000, -2200, "Continue tracing: W on the CAD lines, then A inside the walls", 400);
  add("09-cad-tracing.myarch", b, { title: "Tracing a DXF drawing", titleKo: "DXF 도면 따라 그리기", description: "An imported AutoCAD drawing on its own CAD layers, partly traced into walls.", descriptionKo: "CAD 레이어로 가져온 AutoCAD 도면을 벽으로 일부 따라 그린 예제.", tags: ["DXF", "CAD layers", "tracing"] });
}

// ---------------------------------------------------------------- larger buildings
// Shared helpers for the building-scale samples below.
// Walls of a rectangle (x1,y1)–(x2,y2) as [north, east, south, west]; "at" on
// north/east runs from the first corner, on south/west from the far corner.
function box4(b, L, x1, y1, x2, y2, t, extra) { return b.loop(L, [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], t, extra); }
// A row of identical items from x1 every `step` (count n).
function row(b, L, kind, x1, y, step, n, rot = 0, extra = {}) { for (let i = 0; i < n; i++) b.furn(L, kind, x1 + i * step, y, rot, extra); }
// Back-to-back pairs of workstations with their chairs, `n` desks per side
// from x1, the pair centred on y (desks face away from each other).
function deskPairs(b, L, x1, y, n, kind = "workstation", step = 1400) {
  const d = kind === "workstation" ? 700 : 800;
  for (let i = 0; i < n; i++) {
    const x = x1 + i * step;
    b.furn(L, kind, x, y + d / 2, 180); b.furn(L, "officeChair", x, y + d + 300, 0);
    b.furn(L, kind, x, y - d / 2, 0); b.furn(L, "officeChair", x, y - d - 300, 180);
  }
}
// Meeting table with chairs along both long sides.
function meeting(b, L, x, y, w = 2400, d = 1200, perSide = 3) {
  b.furn(L, "meetingTable", x, y, 0, { w, d });
  const step = w / perSide;
  for (let i = 0; i < perSide; i++) { const cx = x - w / 2 + step * (i + 0.5); b.furn(L, "chair", cx, y - d / 2 - 150, 0); b.furn(L, "chair", cx, y + d / 2 + 150, 180); }
}
// Table for four with chairs (dining / café).
function table4(b, L, kind, x, y, w = 1400, d = 800) {
  b.furn(L, kind, x, y, 0, kind === "cafeTable" || kind === "roundTable" ? { w, d: w } : { w, d });
  if (kind === "cafeTable" || kind === "roundTable") { b.furn(L, "chair", x, y - w / 2 - 150, 0); b.furn(L, "chair", x, y + w / 2 + 150, 180); return; }
  for (const s of [-1, 1]) { b.furn(L, "chair", x + s * w / 4, y - d / 2 - 150, 0); b.furn(L, "chair", x + s * w / 4, y + d / 2 + 150, 180); }
}

// ---------------------------------------------------------------- 10. office tower
{
  const b = builder("Office tower", { client: "Sample", address: "Seoul, Gangnam-daero", scale: 200 });
  const p = b.p;
  const W = 36000, D = 24000;
  const G = b.level(0);
  p.levels[0].name = "1F"; p.levels[0].height = 4500;
  const levels = [G];
  for (let i = 2; i <= 8; i++) levels.push(b.addLevel(`${i}F`, 3800));
  const cx1 = 13500, cx2 = 22500, cy1 = 9000, cy2 = 15000; // the core
  levels.forEach((L, li) => {
    const top = li === levels.length - 1;
    const [n, e, s, w] = box4(b, L, 0, 0, W, D, 250, { material: "glass" });
    // Core: stair, lift lobby with two lifts, two toilets.
    const [kn, ke, ks] = box4(b, L, cx1, cy1, cx2, cy2, 250, { type: "concrete-200" });
    const k1 = b.wall(L, [16500, cy1], [16500, cy2], 200, { type: "concrete-200" });
    const k2 = b.wall(L, [20000, cy1], [20000, cy2], 200, { type: "concrete-200" });
    const k3 = b.wall(L, [16500, 12500], [20000, 12500], 200, { type: "concrete-200" });
    b.wall(L, [18250, 12500], [18250, cy2], 150, { type: "concrete-200" });
    b.wall(L, [20000, 12000], [cx2, 12000], 150, { type: "int-block-150" });
    void k1; void k2;
    b.door(kn, 18250 - cx1, 1800, { kind: "opening", type: "none", height: 2400 });
    b.door(k3, 875, 1000, { type: "sliding" }); b.door(k3, 2625, 1000, { type: "sliding" });
    b.door(ke, 1500, 900, { type: "sliding" }); b.door(ke, 4500, 900, { type: "sliding" });
    b.door(ks, cx2 - 15000, 1000, { type: "sliding" }); // stair door to the south floor
    // Glass partitions with wide openings split the floor around the core.
    const pw = b.wall(L, [0, cy1], [cx1, cy1], 120, { material: "glass" });
    const pe = b.wall(L, [cx2, cy1], [W, cy1], 120, { material: "glass" });
    b.door(pw, 6750, 3000, { kind: "opening", type: "none", height: 2400 });
    b.door(pe, 6750, 3000, { kind: "opening", type: "none", height: 2400 });
    // Meeting room in the south-east corner.
    const m1 = b.wall(L, [27000, 18000], [W, 18000], 120, { material: "glass" });
    const m2 = b.wall(L, [27000, 18000], [27000, D], 120, { material: "glass" });
    void m1;
    b.door(m2, 1500, 1200, { type: "sliding" });
    const lower = li === 0 ? "Lobby" : "Open office";
    b.rooms(L, [[6000, 4000, li === 0 ? "Café" : "Open office", li === 0 ? "tile-grey" : "carpet"], [6000, 20000, lower, li === 0 ? "marble" : "carpet"],
      [15000, 12000, "Stairs", "concrete"], [18250, 10500, "Lift lobby", "marble"], [17375, 13750, "Lift", "concrete"], [19125, 13750, "Lift", "concrete"],
      [21250, 10500, "Toilet (men)", "tile-white"], [21250, 13500, "Toilet (women)", "tile-white"], [31500, 21000, li === 0 ? "Management office" : "Meeting room", "carpet"]]);
    p.rooms.filter((r) => r.level === L).forEach((r, i) => { r.number = `${li + 1}${String(i + 1).padStart(2, "0")}`; r.department = /Lift|Stairs|Toilet/.test(r.name) ? "Core" : li === 0 ? "Ground floor" : "Tenant"; });
    if (!top) b.stair(L, 14400, 12000, 90, 4200, 1200, li === 0 ? 26 : 22);
    // Structure: 9 × 8 m column grid; perimeter columns sit in the curtain wall line.
    for (let gx = 0; gx <= W; gx += 9000) for (let gy = 0; gy <= D; gy += 8000) {
      if (gx > cx1 - 400 && gx < cx2 + 400 && gy > cy1 - 400 && gy < cy2 + 400) continue;
      b.column(L, gx, gy, li < 3 ? 700 : 600, gx === 0 || gx === W || gy === 0 || gy === D ? "rect" : "round");
    }
    // Lifts and toilets on every floor.
    b.furn(L, "liftCar", 17375, 13750, 180, { w: 1300, d: 1300 }); b.furn(L, "liftCar", 19125, 13750, 180, { w: 1300, d: 1300 });
    b.furn(L, "toiletCubicle", 20650, 9930, 0); b.furn(L, "toiletCubicle", 21700, 9930, 0);
    b.furn(L, "urinal", 20500, 11740, 180); b.furn(L, "urinal", 21000, 11740, 180); b.furn(L, "washbasin", 21900, 11690, 180);
    b.furn(L, "toiletCubicle", 20650, 14070, 180); b.furn(L, "toiletCubicle", 21700, 14070, 180); b.furn(L, "vanity2", 21100, 12370, 0, { w: 1500 });
    b.furn(L, "fireExtinguisher", 15900, 9230, 0); b.furn(L, "fireExtinguisher", cx1 + 2900, cy2 + 230, 0);
    if (li === 0) {
      // Ground floor: café to the north, lobby with reception to the south.
      b.door(s, W - 13500, 2400, { type: "double", height: 2400 }); b.door(s, W - 4500, 1800, { type: "double" }); b.door(n, 25000, 1800, { type: "double" });
      b.door(m2, 4500, 900, { type: "sliding" });
      b.furn(L, "barCounter", 6000, 1000, 180, { w: 4200 }); b.furn(L, "counter", 2300, 450, 0, { w: 3000 }); b.furn(L, "fridge", 10100, 490, 0);
      for (const x of [2500, 5500, 8500, 11500]) { table4(b, L, "cafeTable", x, 3600, 800); table4(b, L, "cafeTable", x, 6400, 800); }
      for (const x of [16500, 20000, 23500]) table4(b, L, "diningTable4", x, 4500, 1400, 800);
      b.furn(L, "booth", 27500, 2600, 0); b.furn(L, "booth", 29600, 2600, 0); b.furn(L, "booth", 31700, 2600, 0); b.furn(L, "booth", 33800, 2600, 0);
      b.furn(L, "vending", 34900, 7000, 270); b.furn(L, "vending", 34900, 6000, 270); b.furn(L, "atm", 35350, 11000, 270);
      b.furn(L, "reception", 18000, 18400, 0, { w: 4000 }); b.furn(L, "officeChair", 17000, 17600, 180); b.furn(L, "officeChair", 19000, 17600, 180);
      for (const [x, y] of [[4000, 17500], [8000, 17500], [4000, 21000], [8000, 21000]]) { b.furn(L, "loungeChair", x - 700, y, 90); b.furn(L, "loungeChair", x + 700, y, 270); b.furn(L, "sideTable", x, y); }
      b.furn(L, "sectional", 24600, 22900, 180); b.furn(L, "coffeeTable", 24300, 21300);
      for (const x of [2000, 11500]) b.furn(L, "planter", x, 23500, 180);
      for (const y of [10500, 13500]) b.furn(L, "plant", 600, y);
      b.furn(L, "officeDesk", 30000, 19300, 0); b.furn(L, "officeChair", 30000, 20050, 180); b.furn(L, "officeDesk", 33500, 19300, 0); b.furn(L, "officeChair", 33500, 20050, 180);
      b.furn(L, "filing", 35560, 21800, 270); b.furn(L, "filing", 35560, 22400, 270); b.furn(L, "serverRack", 35360, 23250, 270); b.furn(L, "meetingTable", 31500, 22600, 0, { w: 1800, d: 900 });
      // Site: forecourt, parking, trees and street lamps.
      for (let i = 0; i < 8; i++) { b.furn(L, "parkingSpace", 2000 + i * 2600, 29000, 0); if (i % 3 !== 1) b.furn(L, "car", 2000 + i * 2600, 29200, 0, { color: ["#b5483e", "#3b4048", "#f3f2ee", "#4e6e8e"][i % 4] }); }
      for (const x of [-4000, 9000, 18000, 27000, 40000]) b.furn(L, "streetLamp", x, 26500, 180);
      for (const x of [-5000, 41000]) for (const y of [2000, 12000, 22000]) b.furn(L, "tree", x, y, 0, { w: 4000, d: 4000, h: 7000 });
      b.furn(L, "bikeRack", 30000, 26000, 0); b.furn(L, "bikeRack", 32000, 26000, 0); b.furn(L, "bench", 24000, 26200, 0);
      // Lobby lighting: pendants over the café tables, downlights over the lounge, the office's ceiling lights.
      for (const x of [2500, 5500, 8500, 11500]) for (const y of [3600, 6400]) b.lamp(L, "pendantLamp", x, y);
      for (const x of [3000, 6000, 9000]) for (const y of [17500, 21000]) b.lamp(L, "downlight", x, y);
      b.lamp(L, "ceilingLight", 30500, 21000); b.lamp(L, "ceilingLight", 33000, 21000);
    } else {
      // Typical floor: workstation clusters, a meeting room, printers and a break-out area.
      for (const y of [2600, 6000]) deskPairs(b, L, 1500, y, 24);
      for (const y of [19300, 22300]) deskPairs(b, L, 1500, y, 17);
      meeting(b, L, 31500, 21000, 3600, 1400, 4);
      b.furn(L, "whiteboard", 31500, 18100, 0); b.furn(L, "tvUnit", 35640, 21000, 270, { w: 1500 });
      b.furn(L, "sectional", 3000, 13600, 180); b.furn(L, "coffeeTable", 3200, 11900); b.furn(L, "plant", 600, 9700);
      for (const x of [7500, 10500]) table4(b, L, "cafeTable", x, 12000, 800);
      b.furn(L, "counter", 12300, 14600, 180, { w: 1800 }); b.furn(L, "vending", 12800, 9550, 0);
      b.furn(L, "printer", 23300, 9500, 0); b.furn(L, "printer", 24100, 9500, 0); b.furn(L, "lockers", 26000, 9450, 0); b.furn(L, "lockers", 27000, 9450, 0);
      for (const x of [29000, 32500]) { b.furn(L, "officeDesk", x, 11200, 0); b.furn(L, "officeChair", x, 11950, 180); b.furn(L, "officeDesk", x, 15200, 180); b.furn(L, "officeChair", x, 14450, 0); }
      b.furn(L, "plant", 35500, 9600); b.furn(L, "plant", 35500, 17500); b.furn(L, "filing", 23200, 17600, 180); b.furn(L, "filing", 23800, 17600, 180);
      // Ceiling lights over the desk rows and the meeting room (the 3D view lights only the nearest ones).
      for (let x = 3000; x <= 24000; x += 4500) for (const y of [4300, 20800]) b.lamp(L, "ceilingLight", x, y);
      b.lamp(L, "pendantLamp", 30600, 21000); b.lamp(L, "pendantLamp", 32400, 21000);
    }
    void e; void w;
  });
  b.roof(levels[levels.length - 1], "flat", 0, 300);
  for (const L of [levels[0], levels[1]]) b.dims(L);
  for (const [i, x] of [0, 9000, 18000, 27000, 36000].entries()) p.grids.push({ id: uid("g"), x1: x, y1: -2500, x2: x, y2: D + 2500, label: String(i + 1) });
  for (const [j, y] of [0, 8000, 16000, 24000].entries()) p.grids.push({ id: uid("g"), x1: -2500, y1: y, x2: W + 2500, y2: y, label: String.fromCharCode(65 + j) });
  p.scenes.push(sceneFor(p, "Aerial", [1, 1.1, 1.3]), sceneFor(p, "Street", [0.25, 0.12, 1]), sceneFor(p, "Typical floor cut", [0.7, 1.5, 0.9], { section: 9500 }), sceneFor(p, "Lobby cut", [0.4, 1.2, 1], { section: 2000 }), sceneFor(p, "X-ray core", [1, 0.8, 1], { style: "xray" }));
  add("10-office-tower.myarch", b, { title: "Office tower (8 storeys)", titleKo: "업무용 빌딩 (8개 층)", description: "A building-scale model: lobby and café, seven office floors with a concrete core (stairs, two lifts, toilets), curtain walls, a 9 × 8 m column grid, meeting rooms, 600+ furniture items and parking.", descriptionKo: "빌딩 규모 예제: 로비·카페, 코어(계단·엘리베이터 2대·화장실)가 있는 7개 사무 층, 커튼월, 9 × 8 m 기둥 그리드, 회의실, 가구 600여 개, 주차장.", tags: ["8 levels", "building", "core", "curtain wall", "column grid"] });
}

// ---------------------------------------------------------------- 11. mixed-use block
{
  const b = builder("Mixed-use building", { client: "Sample", address: "Busan, Haeundae", scale: 150 });
  const p = b.p;
  const W = 30000, CW = 4000, D = 14000; // units over W, core CW wide at the east end
  const G = b.level(0);
  p.levels[0].name = "1F"; p.levels[0].height = 4200;
  const levels = [G];
  for (let i = 2; i <= 5; i++) levels.push(b.addLevel(`${i}F`, 3000));
  levels.forEach((L, li) => {
    const top = li === levels.length - 1;
    const [n, e, s, w] = box4(b, L, 0, 0, W + CW, D, 300, { type: "ext-brick-300" });
    const core = b.wall(L, [W, 0], [W, D], 250, { type: "concrete-200" });
    const c1 = b.wall(L, [W, 6000], [W + CW, 6000], 200, { type: "concrete-200" });
    const c2 = b.wall(L, [W, 10000], [W + CW, 10000], 200, { type: "concrete-200" });
    b.wall(L, [W + 2000, 10000], [W + 2000, D], 150, { type: "concrete-200" });
    b.door(c1, 3000, 1000, { type: "sliding" });
    b.door(c2, 1000, 1000, { type: "sliding" }); b.door(c2, 3000, 1000, { type: "sliding" });
    if (!top) b.stair(L, W + 800, 3000, 90, li === 0 ? 4600 : 4200, 1200, li === 0 ? 24 : 18);
    const names = [[W + 2000, 3000, "Stairs", "concrete"], [W + 2000, 8000, "Lift lobby", "tile-grey"], [W + 1000, 12000, "Lift", "concrete"], [W + 3000, 12000, "Lift", "concrete"]];
    b.furn(L, "liftCar", W + 1000, 12000, 180, { w: 1500, d: 1500 }); b.furn(L, "liftCar", W + 3000, 12000, 180, { w: 1500, d: 1500 });
    if (li === 0) {
      // Ground floor: supermarket, café and a clothing shop; residents enter from the east.
      b.door(e, 8000, 1600, { type: "double" });
      b.door(core, 3000, 1000, { type: "sliding" }); // service door from the shop to the stairs
      const s1 = b.wall(L, [10000, 0], [10000, D], 200, { type: "int-block-150" });
      const s2 = b.wall(L, [20000, 0], [20000, D], 200, { type: "int-block-150" });
      void s1; void s2;
      for (const [x, wd] of [[5000, 2400], [15000, 2400], [25000, 2400]]) { b.door(s, W + CW - x, wd, { type: "double", height: 2400 }); b.window(s, W + CW - x - 3200, 2600, { type: "fixed", sill: 300, height: 2800 }); b.window(s, W + CW - x + 3200, 2600, { type: "fixed", sill: 300, height: 2800 }); }
      for (const x of [2500, 7500, 12500, 17500, 22500, 27500]) b.window(n, x, 2400, { sill: 1200, height: 1800 });
      names.push([5000, 7000, "Supermarket", "tile-grey"], [15000, 7000, "Café", "oak"], [25000, 7000, "Clothing store", "oak"]);
      // Supermarket: shelving aisles and two checkouts.
      for (const x of [1500, 3700, 5900, 8100]) for (const y of [2200, 5600]) b.furn(L, "shelving", x, y, 90, { w: 2800 });
      for (const x of [1500, 3700, 5900, 8100]) b.furn(L, "shelving", x, 9200, 90, { w: 1800 });
      b.furn(L, "checkout", 4500, 11000, 0); b.furn(L, "checkout", 7600, 11000, 0); b.furn(L, "fridge", 9500, 500, 0); b.furn(L, "fridge", 8700, 500, 0); b.furn(L, "coldRoom", 1450, 12700, 180);
      // Café: bar, booths and tables.
      b.furn(L, "barCounter", 15000, 1300, 180, { w: 4500 }); b.furn(L, "counter", 15000, 450, 0, { w: 4500 });
      for (const x of [13000, 14000, 15000, 16000, 17000]) b.furn(L, "barStool", x, 2050);
      for (const y of [4500, 6700, 8900]) { b.furn(L, "booth", 11000, y, 90); }
      for (const [x, y] of [[14000, 5000], [17500, 5000], [14000, 8300], [17500, 8300]]) table4(b, L, "cafeTable", x, y, 800);
      b.furn(L, "plant", 19500, 11200); b.furn(L, "patioUmbrella", 15000, 16500); b.furn(L, "patioUmbrella", 18500, 16500);
      for (const [x, y] of [[15000, 15100], [15000, 17900], [18500, 15100], [18500, 17900]]) b.furn(L, "chair", x, y, y > 16500 ? 180 : 0);
      // Clothing store.
      for (const y of [2000, 4600, 7200]) { b.furn(L, "clothesRack", 22500, y, 0); b.furn(L, "clothesRack", 27500, y, 0); }
      b.furn(L, "displayTable", 25000, 4000, 0); b.furn(L, "displayTable", 25000, 7600, 0); b.furn(L, "checkout", 27800, 11800, 0); b.furn(L, "wardrobe", 20500, 11000, 90, { w: 2000, color: "#f3f2ee" });
      for (const x of [21500, 23000]) b.furn(L, "box", x, 13300, 0, { w: 1200, d: 900, h: 2100, color: "#8c98a8" });
      // Street.
      for (const x of [3000, 13000, 23000, 33000]) b.furn(L, "streetLamp", x, 15500, 180);
      for (const x of [-3000, 37000]) b.furn(L, "tree", x, 7000, 0, { w: 3500, d: 3500, h: 6000 });
      b.furn(L, "bikeRack", 31500, 16000, 0); b.furn(L, "bench", 8000, 16000, 0);
    } else {
      // Housing floors: six flats on a central corridor.
      const k1 = b.wall(L, [0, 6000], [W, 6000], 200, { type: "int-block-150" });
      const k2 = b.wall(L, [0, 8000], [W, 8000], 200, { type: "int-block-150" });
      b.door(core, 7000, 1200, { type: "double" });
      names.push([15000, 7000, "Corridor", "tile-grey"]);
      for (let u = 0; u < 3; u++) {
        const x = u * 10000;
        for (const north of [true, false]) {
          const yA = north ? 0 : 8000, yB = north ? 6000 : D; // flat depth
          if (u > 0) b.wall(L, [x, yA], [x, yB], 200, { type: "int-block-150" });
          const part = b.wall(L, [x + 6000, yA], [x + 6000, yB], 120, { type: "int-drywall-100" });
          const yBath = north ? 3500 : 10500;
          b.wall(L, [x + 6000, yBath], [x + 10000, yBath], 120, { type: "int-drywall-100" });
          // Entrance from the corridor, bedroom and bathroom doors off the living room.
          if (north) b.door(k1, x + 1200, 1000, { side: -1 }); else b.door(k2, x + 1200, 1000, { side: 1 });
          b.door(part, north ? 1600 : 4400, 900, { type: "sliding" });
          b.door(part, north ? 4800 : 1200, 800, { type: "sliding" });
          const ext = north ? n : s, at = (cx) => (north ? cx : W + CW - cx);
          b.window(ext, at(x + 3200), 2400, { type: "sliding", sill: 0, height: 2200 }); b.window(ext, at(x + 8000), 1500);
          const yc = (a) => (north ? a : D - a); // depth measured from the façade
          names.push([x + 3000, yc(3000), "Living room", "oak"], [x + 8000, yc(1750), "Bedroom", "oak"], [x + 8000, yc(4750), "Bathroom", "tile-white"]);
          const r = north ? 0 : 180;
          b.furn(L, "sofa3", x + 3000, yc(2000), (r + 180) % 360); b.furn(L, "coffeeTable", x + 3000, yc(3100)); b.furn(L, "tvUnit", x + 3000, yc(4300), r, { w: 1600 });
          b.furn(L, "counter", x + 5600, yc(4200), 90, { w: 2400 }); b.furn(L, "diningTable4", x + 4200, yc(5100), 0, { w: 1200, d: 800 });
          b.furn(L, "doubleBed", x + 8000, yc(1300), r, { w: 1500, d: 2000 }); b.furn(L, "wardrobe", x + 9600, yc(2900), 270, { w: 1000 }); b.furn(L, "nightstand", x + 6600, yc(450), r);
          b.furn(L, "bathtub", x + 8200, yc(5550), (r + 180) % 360, { w: 1500, d: 700 }); b.furn(L, "toilet", x + 9500, yc(4200), 270); b.furn(L, "washbasin", x + 6450, yc(4200), 90);
          b.furn(L, "plant", x + 600, yc(600));
        }
      }
      void k2;
    }
    b.rooms(L, names);
    p.rooms.filter((r) => r.level === L).forEach((r, i) => { r.number = `${li + 1}${String(i + 1).padStart(2, "0")}`; r.department = li === 0 ? "Retail" : /Corridor|Lift|Stairs/.test(r.name) ? "Common" : "Housing"; });
    void w;
  });
  b.roof(levels[levels.length - 1], "flat", 0, 400);
  b.dims(levels[0]); b.dims(levels[1]);
  p.scenes.push(sceneFor(p, "Street corner", [1, 0.5, 1.4]), sceneFor(p, "Shops cut", [0.3, 1.3, 1], { section: 2500 }), sceneFor(p, "Flats cut", [0.3, 1.3, 1], { section: 5500 }), sceneFor(p, "White model", [-1, 0.9, 1], { style: "white" }));
  add("11-mixed-use.myarch", b, { title: "Mixed-use building (5 storeys)", titleKo: "주상복합 (5개 층)", description: "Shops on the ground floor (supermarket aisles, a café with booths, a clothing store) and four floors of flats on a corridor with a stair and two lifts.", descriptionKo: "1층 상가(슈퍼마켓 진열대, 부스석 카페, 옷가게)와 복도식 아파트 4개 층, 계단과 엘리베이터 2대.", tags: ["5 levels", "building", "retail", "housing"] });
}

// A double-loaded corridor building: rooms of the given widths north and
// south of a corridor, each with a sliding door to the corridor and a window.
// `fit(L, room, rect)` furnishes a room; rect = [x1, y1, x2, y2] inside the walls.
function corridorFloor(b, L, { len, dn, cw, ds, north, south, ext = {}, part = {}, fit, entrance = true }) {
  const D = dn + cw + ds;
  const [n, e, s, w] = box4(b, L, 0, 0, len, D, 300, ext);
  const kn = b.wall(L, [0, dn], [len, dn], 200, part);
  const ks = b.wall(L, [0, dn + cw], [len, dn + cw], 200, part);
  if (entrance) { b.door(w, D - dn - cw / 2, 1800, { type: "double" }); b.door(e, dn + cw / 2, 1800, { type: "double" }); }
  const names = [[len / 2, dn + cw / 2, "Corridor", "tile-grey"]];
  const side = (list, isNorth) => {
    let x = 0;
    for (const r of list) {
      const x2 = x + r.w;
      if (x2 < len - 1) b.wall(L, isNorth ? [x2, 0] : [x2, dn + cw], isNorth ? [x2, dn] : [x2, D], 150, part);
      if (!r.noDoor) b.door(isNorth ? kn : ks, x + (r.doorAt ?? r.w - 1000), r.door || 1000, { type: "sliding" });
      if (r.window !== false) { const wx = x + r.w / 2; if (isNorth) b.window(n, wx, r.window || Math.min(2400, r.w - 1200)); else b.window(s, len - wx, r.window || Math.min(2400, r.w - 1200)); }
      const y1 = isNorth ? 0 : dn + cw, y2 = isNorth ? dn : D;
      names.push([x + r.w / 2, (y1 + y2) / 2, r.name, r.floor || "tile-grey"]);
      if (fit) fit(L, r, [x + 200, y1 + 250, x2 - 200, y2 - 250], isNorth);
      x = x2;
    }
  };
  side(north, true); side(south, false);
  b.rooms(L, names);
  return { n, e, s, w, kn, ks, D };
}

// ---------------------------------------------------------------- 12. clinic / small hospital
{
  const b = builder("Community hospital", { client: "Sample", address: "Daegu", scale: 150 });
  const p = b.p;
  const G = b.level(0);
  p.levels[0].name = "1F"; p.levels[0].height = 3600;
  const U = b.addLevel("2F", 3600);
  const len = 42000, dn = 7000, cw = 2400, ds = 7000;
  const fit = (L, r, [x1, y1, x2, y2], north) => {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, back = north ? y1 : y2, rot = north ? 0 : 180, front = north ? y2 : y1;
    const into = (d) => (north ? back + d : back - d);
    switch (r.kind) {
      case "stair": b.stair(L, cx, cy, 90, 4600, 1300, 22); break;
      case "lift": b.furn(L, "liftCar", cx, into(1300), rot, { w: 1400, d: 2400 }); break;
      case "reception": b.furn(L, "reception", cx, front + (north ? -1400 : 1400), rot + 180, { w: 3600 }); b.furn(L, "officeChair", cx - 900, front + (north ? -2400 : 2400), rot); b.furn(L, "officeChair", cx + 900, front + (north ? -2400 : 2400), rot); b.furn(L, "filing", x1 + 300, into(350), rot); b.furn(L, "filing", x1 + 850, into(350), rot); b.furn(L, "printer", x2 - 400, into(350), rot); break;
      case "waiting": for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.furn(L, "waitingChairs", x1 + 1300 + i * 2200, into(900 + j * 1500), rot); b.furn(L, "vending", x2 - 500, into(500), rot); b.furn(L, "plant", x2 - 400, into(2000)); b.furn(L, "tvUnit", x2 - 300, cy + 1500, 270, { w: 1400 }); break;
      case "exam": b.furn(L, "examTable", x1 + 600, cy, 0); b.furn(L, "desk", x2 - 900, into(450), rot); b.furn(L, "officeChair", x2 - 900, into(1150), rot + 180); b.furn(L, "chair", x2 - 1700, into(1200), rot + 180); b.furn(L, "washbasin", x2 - 400, front + (north ? -400 : 400), 270); b.furn(L, "medCabinet", x1 + 700, into(300), rot); break;
      case "ward": for (const k of [0, 1]) { const bx = x1 + 1300 + k * 2700; b.furn(L, "hospitalBed", bx, into(1200), rot); b.furn(L, "nightstand", bx + 850, into(300), rot); b.furn(L, "ivPole", bx - 750, into(500)); } b.furn(L, "wardrobe", x2 - 350, front + (north ? -700 : 700), 270, { w: 1000 }); b.furn(L, "armchair", x1 + 1300, front + (north ? -800 : 800), rot + 180); break;
      case "toilet": b.furn(L, "toiletCubicle", x1 + 600, into(900), rot); b.furn(L, "toiletCubicle", x1 + 1700, into(900), rot); b.furn(L, "washbasin", x2 - 400, cy, 270); break;
      case "pharmacy": row(b, L, "medCabinet", x1 + 600, into(300), 1000, 4, rot); b.furn(L, "checkout", cx, front + (north ? -900 : 900), rot + 180); break;
      case "nurse": b.furn(L, "reception", cx, front + (north ? -1100 : 1100), rot + 180, { w: 2400 }); b.furn(L, "officeChair", cx, front + (north ? -2100 : 2100), rot); b.furn(L, "medCabinet", x1 + 600, into(300), rot); b.furn(L, "medCabinet", x1 + 1600, into(300), rot); b.furn(L, "fridge", x2 - 450, into(400), rot); break;
      case "staff": meeting(b, L, cx, cy, 2400, 1000, 3); b.furn(L, "lockers", x1 + 600, into(300), rot); b.furn(L, "counter", x2 - 1200, into(350), rot, { w: 1800 }); break;
      case "imaging": b.furn(L, "examTable", cx, cy, 90); b.furn(L, "box", x1 + 700, cy, 0, { w: 800, d: 1600, h: 1900, color: "#f3f2ee" }); b.furn(L, "desk", x2 - 800, into(450), rot); b.furn(L, "serverRack", x2 - 400, front + (north ? -600 : 600), rot); break;
      default: break;
    }
  };
  const lower = {
    north: [{ w: 5000, name: "Stairs", kind: "stair", floor: "concrete", window: 1200 }, { w: 3000, name: "Lift", kind: "lift", floor: "concrete", window: false, door: 1400, doorAt: 1500 }, { w: 9000, name: "Reception", kind: "reception", floor: "marble", door: 3000, doorAt: 4500 }, { w: 9000, name: "Waiting area", kind: "waiting", floor: "marble", door: 3000, doorAt: 4500 }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }],
    south: [{ w: 4000, name: "Toilets", kind: "toilet", floor: "tile-white", window: 900 }, { w: 6000, name: "Pharmacy", kind: "pharmacy", floor: "tile-grey" }, { w: 8000, name: "Imaging", kind: "imaging", floor: "tile-grey", window: false }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }, { w: 4000, name: "Exam room", kind: "exam", floor: "tile-white" }, { w: 6000, name: "Staff room", kind: "staff", floor: "oak" }, { w: 6000, name: "Office", kind: "staff", floor: "carpet" }],
  };
  const upper = {
    north: [{ w: 5000, name: "Stairs", kind: "stair", floor: "concrete", window: 1200 }, { w: 3000, name: "Lift", kind: "lift", floor: "concrete", window: false, door: 1400, doorAt: 1500 }, ...Array.from({ length: 6 }, () => ({ w: 5600, name: "Ward", kind: "ward", floor: "tile-grey" }))],
    south: [{ w: 4000, name: "Toilets", kind: "toilet", floor: "tile-white", window: 900 }, { w: 8000, name: "Nurse station", kind: "nurse", floor: "tile-grey" }, ...Array.from({ length: 5 }, () => ({ w: 6000, name: "Ward", kind: "ward", floor: "tile-grey" }))],
  };
  // Upper floor's north rooms must reach the east wall: widen the last ward.
  upper.north[upper.north.length - 1].w = len - upper.north.slice(0, -1).reduce((t, r) => t + r.w, 0);
  const extW = { type: "ext-render-250" }, partW = { type: "int-block-150" };
  corridorFloor(b, G, { len, dn, cw, ds, ...lower, ext: extW, part: partW, fit });
  // The stair only on the lower floor (it leads to 2F).
  const fitUp = (L, r, rect, north) => { if (r.kind !== "stair") fit(L, r, rect, north); };
  corridorFloor(b, U, { len, dn, cw, ds, ...upper, ext: extW, part: partW, fit: fitUp, entrance: false });
  for (const L of [G, U]) p.rooms.filter((r) => r.level === L).forEach((r, i) => { r.number = `${L === G ? 1 : 2}${String(i + 1).padStart(2, "0")}`; r.department = /Ward|Nurse/.test(r.name) ? "Inpatient" : /Exam|Imaging|Pharmacy/.test(r.name) ? "Outpatient" : "General"; });
  for (const x of [6000, 15000, 24000, 33000]) b.furn(G, "car", x, -6000, 0, { color: "#f3f2ee" });
  b.furn(G, "box", 39000, -6000, 0, { w: 2200, d: 5400, h: 2600, color: "#f3f2ee" }); b.text(G, 37600, -9500, "Ambulance bay", 400);
  for (const x of [-4000, 46000]) for (const y of [2000, 14000]) b.furn(G, "tree", x, y, 0, { w: 3500, d: 3500, h: 6000 });
  for (const x of [3000, 12000, 21000, 30000]) b.furn(G, "bench", x, 18000, 0);
  b.roof(U, "hip", 22, 600);
  b.dims(G); b.dims(U);
  p.scenes.push(sceneFor(p, "Entrance", [1, 0.6, -1.2]), sceneFor(p, "Wards cut", [0.4, 1.4, 1], { section: 5200 }), sceneFor(p, "Outpatients cut", [0.4, 1.4, 1], { section: 1500 }));
  add("12-hospital.myarch", b, { title: "Community hospital", titleKo: "지역 병원", description: "Two floors on a double-loaded corridor: reception, waiting area, exam rooms, imaging and pharmacy below, wards with hospital beds and a nurse station above.", descriptionKo: "중복도형 2개 층: 1층 접수·대기실·진료실·영상실·약국, 2층 병상이 있는 병실과 간호사실.", tags: ["2 levels", "healthcare", "corridor", "hip roof"] });
}

// ---------------------------------------------------------------- 13. school with a sports hall
{
  const b = builder("Primary school", { client: "Sample", address: "Gwangju", scale: 200 });
  const p = b.p;
  const G = b.level(0);
  p.levels[0].name = "1F"; p.levels[0].height = 3800;
  const U = b.addLevel("2F", 3800);
  const len = 45000, dn = 8000, cw = 3000, ds = 8000, D = dn + cw + ds;
  const fit = (L, r, [x1, y1, x2, y2], north) => {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rot = north ? 0 : 180, back = north ? y1 : y2, front = north ? y2 : y1;
    const into = (d) => (north ? back + d : back - d);
    switch (r.kind) {
      case "class": {
        // 5 × 5 desks facing the board on the corridor side wall.
        for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const x = x1 + 1300 + i * 1500, y = into(1000 + j * 1300); b.furn(L, "studentDesk", x, y, rot + 180); b.furn(L, "studentChair", x, north ? y - 420 : y + 420, rot + 180); }
        b.furn(L, "teacherDesk", cx, front + (north ? -1300 : 1300), rot); b.furn(L, "officeChair", cx, front + (north ? -700 : 700), rot + 180);
        b.furn(L, "whiteboard", cx - 2000, front + (north ? -50 : 50), north ? 180 : 0, { w: 3600 });
        b.furn(L, "bookshelf", x2 - 500, into(250), rot, { w: 900 }); b.furn(L, "lockers", x1 + 500, into(300), rot);
        break;
      }
      case "library": for (let k = 0; k < 4; k++) b.furn(L, "libraryShelf", x1 + 1400, into(1300 + k * 1500), 0); for (const dy of [1800, 4800]) table4(b, L, "diningTable6", x1 + 4600, into(dy), 1800, 900); b.furn(L, "checkout", x2 - 1000, front + (north ? -900 : 900), rot + 180); if (x2 - x1 > 9000) { b.furn(L, "sectional", x2 - 1600, into(1200), rot); for (let k = 0; k < 2; k++) b.furn(L, "libraryShelf", x1 + 7600, into(1300 + k * 2000), 0); } break;
      case "toilet": b.furn(L, "toiletCubicle", x1 + 600, into(900), rot); b.furn(L, "toiletCubicle", x1 + 1650, into(900), rot); b.furn(L, "toiletCubicle", x1 + 2700, into(900), rot); b.furn(L, "vanity2", cx, front + (north ? -400 : 400), rot + 180, { w: 1500 }); break;
      case "stair": b.stair(L, cx, cy, 90, 5200, 1500, 24); break;
      case "office": for (const dx of [1200, 3400]) { b.furn(L, "officeDesk", x1 + dx, into(500), rot); b.furn(L, "officeChair", x1 + dx, into(1250), rot + 180); } meeting(b, L, x1 + 2300, into(4500), 2400, 1000, 3); b.furn(L, "printer", x2 - 400, into(400), rot); b.furn(L, "filing", x2 - 400, into(1300), 270); break;
      case "canteen": for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) table4(b, L, "diningTable6", x1 + 1700 + i * 3000, into(1500 + j * 3000), 1800, 900); b.furn(L, "prepTable", x2 - 1500, into(400), rot); break;
      case "kitchen": b.furn(L, "coldRoom", x2 - 1000, into(1000), rot, { w: 2000, d: 2000 }); b.furn(L, "range", x1 + 600, into(400), rot); b.furn(L, "prepTable", x1 + 2300, into(350), rot, { w: 1800 }); b.furn(L, "sinkCounter", x1 + 300, cy, 90, { w: 1300 }); b.furn(L, "prepTable", cx, cy, 0); break;
      default: break;
    }
  };
  const C = (name = "Classroom") => ({ w: 9000, name, kind: "class", floor: "oak", window: 4800, doorAt: 8000 });
  const lowerN = [{ w: 6000, name: "Stairs", kind: "stair", floor: "concrete", window: 1500, doorAt: 3000, door: 1800 }, C(), C(), C(), { w: 12000, name: "Canteen", kind: "canteen", floor: "tile-grey", door: 2400, doorAt: 6000 }];
  lowerN[lowerN.length - 1].w = len - lowerN.slice(0, -1).reduce((t, r) => t + r.w, 0);
  const lowerS = [{ w: 5000, name: "Toilets", kind: "toilet", floor: "tile-white", window: 1200 }, { w: 9000, name: "Staff office", kind: "office", floor: "carpet" }, C(), C(), { w: 6000, name: "School kitchen", kind: "kitchen", floor: "tile-white", window: 1800 }, { w: 7000, name: "Library", kind: "library", floor: "carpet", door: 1600 }];
  lowerS[lowerS.length - 1].w = len - lowerS.slice(0, -1).reduce((t, r) => t + r.w, 0);
  const upperN = [{ w: 6000, name: "Stairs", kind: "stair", floor: "concrete", window: 1500, doorAt: 3000, door: 1800 }, C(), C(), C(), C(), { w: 3000, name: "Store", floor: "concrete", window: false, doorAt: 1500 }];
  upperN[upperN.length - 1].w = len - upperN.slice(0, -1).reduce((t, r) => t + r.w, 0);
  const upperS = [{ w: 5000, name: "Toilets", kind: "toilet", floor: "tile-white", window: 1200 }, C(), C(), C(), { w: 12000, name: "Library", kind: "library", floor: "carpet", door: 1600 }];
  upperS[upperS.length - 1].w = len - upperS.slice(0, -1).reduce((t, r) => t + r.w, 0);
  const extW = { type: "ext-brick-300" }, partW = { type: "int-block-150" };
  const g = corridorFloor(b, G, { len, dn, cw, ds, north: lowerN, south: lowerS, ext: extW, part: partW, fit });
  corridorFloor(b, U, { len, dn, cw, ds, north: upperN, south: upperS, ext: extW, part: partW, fit: (L, r, rect, north) => { if (r.kind !== "stair") fit(L, r, rect, north); }, entrance: false });
  // Sports hall on the east, one tall storey, reached from the corridor.
  const H = 20000;
  const hall = [b.wall(G, [len, 0], [len + H, 0], 300, extW), b.wall(G, [len + H, 0], [len + H, D], 300, extW), b.wall(G, [len + H, D], [len, D], 300, extW)];
  for (const at of [3000, 8000, 13000, 18000]) b.window(hall[0], at, 3000, { sill: 1800, height: 1500 });
  for (const at of [3000, 8000, 13000, 18000]) b.window(hall[2], at, 3000, { sill: 1800, height: 1500 });
  b.door(hall[1], D / 2 + 4500, 2400, { type: "double" });
  b.rooms(G, [[len + H / 2, D / 2, "Sports hall", "walnut"]]);
  void g;
  for (const x of [len + 2000, len + H - 2000]) b.furn(G, "box", x, D / 2, 0, { w: 1800, d: 1200, h: 3500, color: "#f3f2ee" });
  for (const [x, y] of [[len + 6000, 1800], [len + 10000, 1800], [len + 14000, 1800]]) b.furn(G, "bench", x, y, 0, { w: 2500 });
  for (let i = 0; i < 3; i++) b.furn(G, "treadmill", len + 3000 + i * 1200, D - 1600, 180);
  for (let i = 0; i < 3; i++) b.furn(G, "spinBike", len + 8000 + i * 1000, D - 1300, 180);
  b.furn(G, "weightBench", len + 14000, D - 1500, 180); b.furn(G, "poolTable", len + 17500, D - 2400, 90);
  p.roofs.push({ id: uid("f"), level: G, pts: [[len, 0], [len + H, 0], [len + H, D], [len, D]], kind: "gable", pitch: 12, overhang: 500, thickness: 250, material: "roof-metal" });
  b.roof(U, "flat", 0, 400);
  // Playground.
  for (let i = 0; i < 6; i++) b.furn(G, "tree", -2000 + i * 9000, D + 12000, 0, { w: 4500, d: 4500, h: 7500 });
  for (const x of [5000, 15000, 25000, 35000]) b.furn(G, "bench", x, D + 3500, 0);
  b.furn(G, "box", 20000, D + 8000, 0, { w: 14000, d: 7000, h: 20, color: "#b5483e" });
  b.furn(G, "bikeRack", 2000, D + 6000, 0); b.furn(G, "bikeRack", 4000, D + 6000, 0); b.furn(G, "pergola", 32000, D + 8000, 0);
  b.dims(G); b.dims(U);
  for (const L of [G, U]) p.rooms.filter((r) => r.level === L).forEach((r, i) => { r.number = `${L === G ? 1 : 2}${String(i + 1).padStart(2, "0")}`; });
  p.scenes.push(sceneFor(p, "Playground side", [0.6, 0.7, 1.3]), sceneFor(p, "Classrooms cut", [0.3, 1.5, 1], { section: 5400 }), sceneFor(p, "Ground floor cut", [0.3, 1.5, 1], { section: 1500 }), sceneFor(p, "Line drawing", [-1, 0.8, 1], { style: "lines" }));
  add("13-school.myarch", b, { title: "Primary school", titleKo: "초등학교", description: "Two floors of classrooms with student desks, a library, canteen and school kitchen, staff office, and a tall sports hall with its own gable roof.", descriptionKo: "학생 책상이 놓인 교실 2개 층, 도서관, 급식실과 조리실, 교무실, 박공지붕의 높은 체육관.", tags: ["2 levels", "education", "corridor", "furniture"] });
}

// ---------------------------------------------------------------- 14. courtyard house
{
  const b = builder("Courtyard house", { client: "Sample", address: "Jeju, Aewol" });
  const p = b.p;
  const L = b.level(0);
  p.levels[0].height = 3200;
  const outer = b.loop(L, [[0, 0], [24000, 0], [24000, 18000], [16000, 18000], [16000, 8000], [8000, 8000], [8000, 18000], [0, 18000]], 300, { material: "stone" });
  const [nW, eW, sE, iE, iN, iW, sW, wW] = outer;
  const a = b.wall(L, [8000, 0], [8000, 8000], 200, { material: "plaster" });
  const c = b.wall(L, [16000, 0], [16000, 8000], 200, { material: "plaster" });
  const w1 = b.wall(L, [0, 6000], [8000, 6000], 150);
  b.wall(L, [4000, 6000], [4000, 9000], 120);
  const w3 = b.wall(L, [0, 9000], [8000, 9000], 150);
  const w4 = b.wall(L, [0, 13500], [8000, 13500], 150);
  const e1 = b.wall(L, [16000, 8000], [24000, 8000], 200);
  const e2 = b.wall(L, [16000, 12000], [24000, 12000], 200);
  void w3; void w4;
  // Doors: entrance north, living → wings, glass doors onto the courtyard.
  b.door(nW, 11000, 1200, { type: "double" });
  b.door(a, 6800, 1000, { type: "sliding" }); b.door(c, 6800, 1000, { type: "sliding" });
  b.door(w1, 2000, 800, { type: "sliding" }); b.door(w1, 6000, 800, { type: "sliding" });
  b.door(iN, 4000, 5000, { type: "sliding", height: 2400 });
  b.door(iW, 2250, 2400, { type: "sliding", height: 2400 }); b.door(iW, 6750, 2400, { type: "sliding", height: 2400 });
  b.door(e1, 1500, 900, { type: "sliding" }); b.door(e2, 1500, 900, { type: "sliding" });
  b.door(sE, 4000, 5000, { type: "garage", height: 2400 });
  b.door(iE, 6000, 1000, { type: "sliding" });
  // Windows.
  b.window(nW, 2500, 2400); b.window(nW, 6000, 1500); b.window(nW, 14000, 2400, { type: "fixed", sill: 300, height: 2400 }); b.window(nW, 20000, 3000, { sill: 1000 });
  b.window(wW, 2250, 2400); b.window(wW, 6750, 2400); b.window(wW, 15000, 1200);
  b.window(eW, 4000, 2400); b.window(eW, 10000, 900);
  b.window(sW, 4000, 3000, { type: "sliding", sill: 0, height: 2200 });
  b.rooms(L, [[12000, 4000, "Living room", "walnut"], [20000, 4000, "Kitchen and dining", "oak"], [20000, 10000, "Utility", "tile-grey"], [20000, 15000, "Garage", "concrete"],
    [4000, 3000, "Master bedroom", "oak"], [2000, 7500, "Bathroom", "marble"], [6000, 7500, "Dressing room", "oak"], [4000, 11250, "Bedroom", "oak"], [4000, 15750, "Bedroom", "oak"]]);
  // Living.
  b.furn(L, "sectional", 11500, 2450, 0); b.furn(L, "coffeeTable", 11800, 3950); b.furn(L, "rug", 11800, 3800, 0, { w: 3200, d: 2400 }); b.furn(L, "tvUnit", 11800, 5900, 180, { w: 2200 });
  b.furn(L, "loungeChair", 14900, 3300, 270); b.furn(L, "floorLamp", 15500, 600); b.furn(L, "piano", 9200, 6900, 90); b.furn(L, "bookshelf", 15700, 5800, 270); b.furn(L, "plant", 8600, 600);
  // Kitchen and dining.
  b.furn(L, "counter", 20000, 450, 0, { w: 4800 }); b.furn(L, "pantry", 23400, 450, 0); b.furn(L, "fridge", 23450, 1400, 270); b.furn(L, "island", 20000, 2700, 0, { w: 2400 });
  for (const x of [19200, 20800]) b.furn(L, "barStool", x, 3500, 180);
  table4(b, L, "diningTable6", 20000, 6000, 1800, 900); b.furn(L, "chair", 18700, 6000, 90); b.furn(L, "chair", 21300, 6000, 270);
  // Utility and garage.
  b.furn(L, "washer", 23450, 9000, 270); b.furn(L, "washer", 23450, 9700, 270); b.furn(L, "sinkCounter", 21500, 11550, 180, { w: 1200 }); b.furn(L, "lockers", 16700, 9200, 90);
  b.furn(L, "car", 18300, 15000, 0, { color: "#3b4048" }); b.furn(L, "car", 21500, 15000, 0, { color: "#f3f2ee" }); b.furn(L, "bikeRack", 23500, 15000, 90, { w: 1400 });
  // Bedrooms and bathroom.
  b.furn(L, "kingBed", 3600, 2800, 90); b.furn(L, "nightstand", 450, 1500, 90); b.furn(L, "nightstand", 450, 4100, 90); b.furn(L, "dresser", 6500, 450, 0); b.furn(L, "loungeChair", 6900, 4800, 270);
  b.furn(L, "bathtub", 1100, 7500, 90, { w: 1700, d: 750 }); b.furn(L, "vanity2", 2700, 8640, 180, { w: 1400 }); b.furn(L, "toilet", 3600, 6600, 270);
  b.furn(L, "wardrobe", 6000, 8620, 180, { w: 3000 }); b.furn(L, "dresser", 7650, 7400, 270, { w: 900 });
  b.furn(L, "doubleBed", 1600, 11250, 90); b.furn(L, "desk", 7300, 10000, 270, { w: 1100 }); b.furn(L, "officeChair", 6600, 10000, 90); b.furn(L, "wardrobe", 3500, 13100, 180, { w: 1800 });
  b.furn(L, "bunkBed", 1100, 15750, 90); b.furn(L, "crib", 4500, 17450, 180); b.furn(L, "desk", 7300, 14900, 270, { w: 1100 }); b.furn(L, "chair", 6700, 14900, 90);
  // Lighting: ceiling lights in every room, pendants over the island and the dining table, a track light in the living room.
  b.lamp(L, "ceilingLight", 11800, 3900); b.lamp(L, "trackLight", 11800, 700); b.lamp(L, "pendantLamp", 19400, 2700); b.lamp(L, "pendantLamp", 20600, 2700);
  b.lamp(L, "pendantLamp", 19400, 6000); b.lamp(L, "pendantLamp", 20600, 6000); b.lamp(L, "ceilingLight", 20000, 10000); b.lamp(L, "ceilingLight", 20000, 15000);
  b.lamp(L, "ceilingLight", 4000, 3000); b.lamp(L, "downlight", 1500, 7500); b.lamp(L, "downlight", 2700, 7500); b.lamp(L, "ceilingLight", 6000, 7500);
  b.lamp(L, "ceilingLight", 4000, 11250); b.lamp(L, "ceilingLight", 4000, 15750);
  // Courtyard: pool, pergola, terrace.
  b.furn(L, "pool", 12000, 14200, 0, { w: 6400, d: 3000 }); b.furn(L, "pergola", 12000, 10200, 0, { w: 4000, d: 2600 });
  table4(b, L, "diningTable4", 12000, 16900, 1400, 800); b.furn(L, "loungeChair", 9200, 16800, 0); b.furn(L, "loungeChair", 14800, 16800, 0);
  for (const [x, y] of [[9000, 9000], [15000, 9000], [-3500, -3500], [27500, -3500], [-3000, 21000], [27000, 21000]]) b.furn(L, "tree", x, y, 0, x > 8500 && x < 15500 ? { w: 1600, d: 1600, h: 3200 } : { w: 4000, d: 4000, h: 6500 });
  for (let i = 0; i < 6; i++) b.furn(L, "shrub", 1000 + i * 1400, 19500); b.furn(L, "streetLamp", 10000, -2500, 0);
  // One hip roof per wing so the courtyard stays open to the sky.
  for (const pts of [[[0, 0], [8000, 0], [8000, 18000], [0, 18000]], [[8000, 0], [16000, 0], [16000, 8000], [8000, 8000]], [[16000, 0], [24000, 0], [24000, 18000], [16000, 18000]]]) p.roofs.push({ id: uid("f"), level: L, pts, kind: "hip", pitch: 25, overhang: 600, thickness: 200, material: "roof-tiles" });
  b.dims(L);
  p.scenes.push(sceneFor(p, "Courtyard", [0.1, 0.6, 1]), sceneFor(p, "Aerial", [1, 1.2, 1.1]), sceneFor(p, "Plan cut", [0, 1, 0.0001], { section: 1300 }));
  add("14-courtyard-house.myarch", b, { title: "Courtyard house", titleKo: "중정형 주택", description: "A U-shaped single-storey house around a courtyard with a pool and pergola: three bedrooms, dressing room, open living, kitchen island, utility and a two-car garage under a hip roof.", descriptionKo: "수영장과 퍼걸러가 있는 중정을 둘러싼 ㄷ자형 단층 주택: 침실 3, 드레스룸, 거실, 아일랜드 주방, 다용도실, 2대 차고, 모임지붕.", tags: ["1 level", "house", "courtyard", "furniture", "hip roof"] });
}

// ---------------------------------------------------------------- 15. SketchUp-style cultural complex
{
  const b = builder("Cultural complex (SketchUp style)", { client: "Sample", address: "Sejong" });
  const p = b.p;
  const L = b.level(0);
  const solid = (name, pts, z0, height, material, extra = {}) => { const s = { id: uid("v"), level: L, name, pts, z0, height, taper: 1, material, ...extra }; p.solids.push(s); return s; };
  const rect = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  const rot = (pts, deg, cx, cy) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
  const circle = (cx, cy, r, n = 40, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(a0 + ((a1 - a0) * i) / (a1 - a0 === Math.PI * 2 ? n : n - 1)), cy + r * Math.sin(a0 + ((a1 - a0) * i) / (a1 - a0 === Math.PI * 2 ? n : n - 1))]);
  const group = (items, name) => { const g = uid("grp"); for (const s of items) { s.group = g; s.groupName = name; } };
  // Museum: an L-shaped stone plinth, a glass foyer and a cantilevered gallery.
  const museum = [
    solid("Plinth", [[0, 0], [42000, 0], [42000, 14000], [16000, 14000], [16000, 30000], [0, 30000]], 0, 5000, "stone"),
    solid("Glass foyer", rect(16000, 14000, 14000, 9000), 0, 5000, "glass"),
    solid("Cantilevered gallery", rect(-6000, 4000, 34000, 11000), 5000, 7000, "plaster"),
    solid("Gallery window band", rect(-6200, 6000, 200, 7000), 7000, 2500, "glass"),
    solid("Skylight pyramid", rect(30000, 2000, 10000, 10000), 5000, 4500, "glass", { taper: 0 }),
    solid("Rooftop pavilion", rect(4000, 18000, 9000, 9000), 5000, 3200, "wood-cladding"),
  ];
  for (let i = 0; i < 6; i++) museum.push(solid(`Fin ${i + 1}`, rect(-5000 + i * 5000, 15000, 300, 1200), 5000, 7000, "concrete"));
  group(museum, "Museum");
  // Concert hall: a round drum with a tapered roof, an amphitheatre of steps.
  const hall = [
    solid("Concert hall drum", circle(62000, 12000, 11000, 48), 0, 14000, "brick"),
    solid("Hall roof", circle(62000, 12000, 11600, 48), 14000, 3500, "roof-metal", { taper: 0.55 }),
    solid("Fly tower", rect(66000, 6000, 8000, 12000), 0, 21000, "concrete"),
  ];
  for (let i = 0; i < 7; i++) hall.push(solid(`Amphitheatre step ${i + 1}`, circle(62000, 34000, 12000 - i * 1500, 24, Math.PI, Math.PI * 2), 0, 450 * (i + 1), "stone"));
  group(hall, "Concert hall");
  // Twisting tower: 24 floor plates, each turned 3.75° on the one below.
  const tower = [];
  for (let i = 0; i < 24; i++) {
    const z = i * 3600;
    tower.push(solid(`Tower floor ${i + 1}`, rot(rect(82000, 26000, 16000, 16000), i * 3.75, 90000, 34000), z, 3300, "glass"));
    tower.push(solid(`Tower slab ${i + 1}`, rot(rect(81500, 25500, 17000, 17000), i * 3.75, 90000, 34000), z + 3300, 300, "concrete"));
  }
  tower.push(solid("Tower crown", rot(rect(83000, 27000, 14000, 14000), 90, 90000, 34000), 24 * 3600, 6000, "roof-metal", { taper: 0.2 }));
  tower.push(solid("Tower core", circle(90000, 34000, 3500, 24), 24 * 3600 + 6000, 4000, "concrete"));
  group(tower, "Twisting tower");
  // Canopy on columns joining museum and hall.
  const canopy = [solid("Canopy", [[42000, 16000], [51000, 16000], [54000, 22000], [42000, 26000]], 6000, 400, "wood-cladding")];
  for (const [x, y] of [[43000, 17000], [49000, 17000], [52500, 21500], [43000, 25000], [48000, 23500]]) canopy.push(solid("Canopy column", circle(x, y, 250, 12), 0, 6000, "concrete"));
  group(canopy, "Canopy");
  // Terraced housing block: stepped boxes.
  const terrace = [];
  for (let i = 0; i < 6; i++) terrace.push(solid(`Terrace ${i + 1}`, rect(0 + i * 2500, 40000 + i * 2000, 22000 - i * 2500, 12000 - i * 2000), i * 3200, 3200, i % 2 ? "plaster" : "brick"));
  group(terrace, "Terraced housing");
  // Landscape: paths, a reflecting pool, lawns.
  solid("Plaza", [[-8000, -8000], [104000, -8000], [104000, 56000], [-8000, 56000]], 0, 30, "stone");
  solid("Reflecting pool", rect(20000, -6000, 22000, 4000), 30, 60, "glass");
  solid("Lawn", rect(24000, 28000, 26000, 20000), 30, 60, "grass");
  for (let i = 0; i < 10; i++) b.furn(L, "tree", 26000 + (i % 5) * 5500, 31000 + Math.floor(i / 5) * 9000, 0, { w: 4500, d: 4500, h: 8000 });
  for (let i = 0; i < 8; i++) b.furn(L, "streetLamp", -4000 + i * 13500, -4000, 0);
  for (let i = 0; i < 6; i++) b.furn(L, "bench", 22000 + i * 3500, -1000, 0, { w: 2000 });
  for (let i = 0; i < 10; i++) { b.furn(L, "parkingSpace", 76000 + i * 2600, 50000, 180); if (i % 3) b.furn(L, "car", 76000 + i * 2600, 49800, 180, { color: ["#b5483e", "#3b4048", "#f3f2ee", "#4e6e8e"][i % 4] }); }
  b.furn(L, "pergola", 36000, 45500, 0, { w: 6000, d: 4000 }); b.furn(L, "patioUmbrella", 30000, 52000); b.furn(L, "patioUmbrella", 34000, 52000);
  for (let i = 0; i < 7; i++) p.grids.push({ id: uid("g"), x1: i * 16000, y1: -10000, x2: i * 16000, y2: 58000, label: String(i + 1) });
  for (let j = 0; j < 5; j++) p.grids.push({ id: uid("g"), x1: -10000, y1: j * 14000, x2: 106000, y2: j * 14000, label: String.fromCharCode(65 + j) });
  b.text(L, -6000, 60000, "Push/pull the masses in 3D (Tool: Push/Pull) — each building is a group", 900);
  b.text(L, 6000, -11000, "Museum", 900); b.text(L, 56000, -11000, "Concert hall", 900); b.text(L, 84000, 21000, "Twisting tower (24 floors)", 900); b.text(L, 0, 55000, "Terraced housing", 900);
  p.scenes.push(
    sceneFor(p, "Aerial", [1, 1.1, 1.3]), sceneFor(p, "Plaza view", [0.15, 0.12, -1]), sceneFor(p, "Tower from the park", [1, 0.35, 0.5]),
    sceneFor(p, "White model", [-1, 0.9, 1], { style: "white" }), sceneFor(p, "Hidden line", [1, 0.7, -1], { style: "lines" }),
    sceneFor(p, "X-ray", [-0.8, 1, -1], { style: "xray" }), sceneFor(p, "Section at 10 m", [0.5, 1.3, 1], { section: 10000 }), sceneFor(p, "Site plan", [0, 1, 0.0001], { ortho: true }), sceneFor(p, "South elevation", [0, 0.0001, -1], { ortho: true, style: "lines" }));
  add("15-sketchup-complex.myarch", b, { title: "Cultural complex (SketchUp style)", titleKo: "문화 단지 (스케치업 스타일)", description: "A large push/pull massing model in groups: a museum with a cantilevered gallery and skylight pyramid, a round concert hall with an amphitheatre, a 24-floor twisting tower, a canopy on columns and terraced housing — with nine scenes in every style.", descriptionKo: "그룹으로 묶은 대형 밀기/끌기 매스 모델: 캔틸레버 전시동과 피라미드 천창의 미술관, 원형 공연장과 계단식 야외극장, 24층 비틀린 타워, 기둥 위 캐노피, 계단식 주거 — 모든 스타일의 장면 9개.", tags: ["SketchUp", "massing", "groups", "scenes"] });
}

// ---------------------------------------------------------------- verify and write
const out = path.join(root, "sample");
fs.mkdirSync(out, { recursive: true });
const index = [];
let failed = 0;
for (const s of samples) {
  const issues = runCheck(s.project);
  const errors = issues.filter((i) => i.severity === "error");
  const notes = [];
  if (errors.length) { failed++; notes.push(`${errors.length} errors: ${errors.map((e) => e.message).join("; ")}`); }
  if (!s.project.rooms.length && !s.project.solids.length && !s.project.drawings.length) { failed++; notes.push("no rooms"); }
  for (const opt of ["src/io/dxf.js", "src/io/ifc.js"]) {
    if (!fs.existsSync(path.join(root, opt))) continue;
    try {
      const m = await imp(opt);
      if (m.exportDxf) for (const lv of s.project.levels) m.exportDxf(s.project, { level: lv.id });
      if (m.exportIfc) m.exportIfc(s.project, { schema: "IFC4" });
    } catch (e) { failed++; notes.push(`${opt}: ${e.message}`); }
  }
  fs.writeFileSync(path.join(out, s.file), serializeProject(s.project));
  const { project, ...info } = s;
  index.push(info);
  const w = issues.length - errors.length;
  for (const i of issues.filter((x) => x.severity !== "error")) console.log(`    · ${i.code}: ${i.message} @ ${Math.round(i.x)},${Math.round(i.y)} ${(s.project.levels.find((l) => l.id === i.level) || {}).name || ""}`);
  console.log(`${errors.length || notes.length ? "✖" : "✔"} ${s.file}: ${project.levels.length} levels, ${project.walls.length} walls, ${project.openings.length} openings, ${project.rooms.length} rooms (${project.rooms.map((r) => r.name).join(", ")}), ${project.furniture.length} furniture${w ? `, ${w} warnings` : ""}${notes.length ? `\n    ${notes.join("\n    ")}` : ""}`);
}
fs.writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`create-samples: ${samples.length} samples written to sample/${failed ? `, ${failed} problems` : ""}`);
process.exit(failed ? 1 : 0);
