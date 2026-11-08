// Dresses a sample project with the furniture library's props, so every
// room looks lived in: things on tables, counters, dressers and vanities
// (standing on their tops), and free-standing pieces in free corners chosen
// by what the room is (plants, bins, purifiers, people in lobbies, cars in
// garages…). Deterministic per sample. Whatever the model check complains
// about (a wall, a door swing, a clash) is taken out again, so the samples
// keep zero warnings.
import { makeFurniture, furnitureDef, furnitureCorners } from "../src/lib/furniture.js";
import { pointInPolygon } from "../src/core/geom.js";
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
];

const box = (f) => { const c = furnitureCorners(f); const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const overlaps = (a, b, m = 0) => a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;

export function dress(p, seed = 1) {
  const r = rng(seed);
  const added = new Set();
  const push = (f) => { const it = { id: uid("u"), ...f }; p.furniture.push(it); added.add(it.id); return it; };
  // ---- on top of hosts
  const hosts = p.furniture.filter((f) => !f.elevation || f.elevation < 50);
  for (const host of hosts) {
    const rule = HOST_PROPS.find(([re]) => re.test(host.kind));
    if (!rule || r() < 0.25) continue;
    const top = (host.elevation || 0) + host.h;
    const c = Math.cos(((host.rot || 0) * Math.PI) / 180), s = Math.sin(((host.rot || 0) * Math.PI) / 180);
    const at = (u, v) => [host.x + u * c - v * s, host.y + u * s + v * c];
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
