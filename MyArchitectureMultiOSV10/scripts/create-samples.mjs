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
const { makeFurniture } = await imp("src/lib/furniture.js");
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
    wall(level, a, b, t = 200, extra = {}) { const w = { id: uid("w"), level, x1: a[0], y1: a[1], x2: b[0], y2: b[1], thickness: t, height: null, ...extra }; p.walls.push(w); return w; },
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
  console.log(`${errors.length || notes.length ? "✖" : "✔"} ${s.file}: ${project.levels.length} levels, ${project.walls.length} walls, ${project.openings.length} openings, ${project.rooms.length} rooms (${project.rooms.map((r) => r.name).join(", ")}), ${project.furniture.length} furniture${w ? `, ${w} warnings` : ""}${notes.length ? `\n    ${notes.join("\n    ")}` : ""}`);
}
fs.writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`create-samples: ${samples.length} samples written to sample/${failed ? `, ${failed} problems` : ""}`);
process.exit(failed ? 1 : 0);
