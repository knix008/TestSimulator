// Shared pieces of the readers for other architecture programs' files
// (Sweet Home 3D, gbXML): XML tree helpers, furniture names → our catalog,
// colours → floor materials, and placing a door or window on the wall it sits in.

import { parseXml } from "./svgimport.js";
import { furnitureDef } from "../lib/furniture.js";
import { MATERIALS } from "../lib/materials.js";
import { closestOnSegment } from "../core/geom.js";

// ---------------------------------------------------------------- XML
export { parseXml };
export const localName = (n) => String(n || "").replace(/^.*:/, "");
export const kids = (el, name) => (el && el.children ? el.children.filter((c) => c.name && (!name || localName(c.name) === name)) : []);
export const kid = (el, name) => (el && el.children ? el.children.find((c) => c.name && localName(c.name) === name) || null : null);
export const textOf = (el) => (el && el.children ? el.children.map((c) => (c.text !== undefined ? c.text : textOf(c))).join("") : "");
export const kidText = (el, name) => { const k = kid(el, name); return k ? textOf(k).trim() : ""; };
// Every element named `name` under el (depth first).
export function descendants(el, name, out = []) {
  for (const c of el.children || []) {
    if (!c.name) continue;
    if (localName(c.name) === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}
export const rootElement = (doc) => kids(doc)[0] || null;
export const numAttr = (el, k, d = null) => { const v = el && el.attrs ? el.attrs[k] : undefined; const n = v === undefined || v === "" ? NaN : +v; return Number.isFinite(n) ? n : d; };

export const r1 = (v) => Math.round(v * 10) / 10 || 0;

// ---------------------------------------------------------------- furniture names
// Lower case, accents stripped, camelCase / ids split into words.
export function plainWords(s) {
  const str = String(s || "");
  return (str.includes("#") ? str.slice(str.indexOf("#") + 1) : str) // catalog id "Creator#name" → "name"
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
    .toLowerCase().replace(/[_\-#/().,'’]+/g, " ").replace(/\s+/g, " ").trim();
}

// [pattern, kind or (sizes) → kind candidates]. The first rule whose pattern
// matches wins; the first candidate kind the catalog has is used. Words in
// English, French, Italian, Spanish, German and Korean (the languages of the
// common Sweet Home 3D catalogs and of BIM exports).
const RULES = [
  [/stair|escalier|scala\b|scale\b|escalera|treppe|계단/, "@stair"],
  [/pool table|billiard|billard|biliardo/, "poolTable"],
  [/\bbunk|superpose|etagenbett|litera|castello|soppalco|이층침대/, "bunkBed"],
  [/\bcrib\b|\bcot\b|berceau|lit bebe|babybett|culla|cuna|아기침대/, "crib"],
  [/hospital bed|lit medicalise|lit d hopital/, "hospitalBed"],
  [/\bbeds?\b|\blit\b|\blits\b|letto|\bcama\b|\bbett\b|침대/, (s) => (s.w >= 1800 ? ["kingBed", "doubleBed"] : s.w >= 1300 ? ["doubleBed"] : ["singleBed"])],
  [/sofa|couch|canape|capane|divano|settee|divan|소파/, (s) => (s.w >= 2400 && s.d >= 1500 ? ["sectional", "sofa3"] : s.w >= 1900 ? ["sofa3"] : ["sofa2"])],
  [/office chair|desk chair|swivel|chaise de bureau|fauteuil de bureau|sedia ufficio|silla de oficina|burostuhl|사무용 의자/, "officeChair"],
  [/armchair|fauteuil|poltrona|sillon|sessel|recliner|lounge|transat|deck chair|chaise longue/, ["armchair", "loungeChair"]],
  [/\bstool|tabouret|sgabello|taburete|hocker|스툴/, "barStool"],
  [/\bbench|\bbanc\b|panchina|\bbanco\b|벤치/, "bench"],
  [/chair|chaise|sedia|silla|stuhl|\bseat|의자/, "chair"],
  [/coffee table|table basse|tavolino|couchtisch|mesa de centro|mesa baja|low table|소파 테이블|티 테이블/, "coffeeTable"],
  [/night ?stand|night table|bedside|table de nuit|chevet|comodino|nachttisch|mesita|협탁/, "nightstand"],
  [/round table|table ronde|tavolo rotondo|mesa redonda|원탁/, "roundTable"],
  [/meeting table|conference table|table de reunion/, "meetingTable"],
  [/reception/, "reception"],
  [/\bdesk|bureau|scrivania|escritorio|schreibtisch|책상/, (s) => (s.w >= 1500 ? ["officeDesk", "desk"] : ["desk"])],
  [/dining|\btable\b|tavolo|\bmesa\b|\btisch|테이블|식탁/, (s) => (s.w < 700 && s.d < 700 ? ["sideTable"] : Math.abs(s.w - s.d) < 100 && s.w <= 1300 ? ["roundTable", "diningTable4"] : s.w >= 1700 ? ["diningTable6"] : ["diningTable4"])],
  [/\btv\b|television|televiseur|meuble tv|tv unit|tv stand|televisore|tele\b|티비|텔레비전/, "tvUnit"],
  [/bookcase|book shelf|bookshelf|biblioth|libreria|estanteria|bucherregal|\bregal|\bshel(f|ves)|etagere|mensola|책장/, (s) => (s.h >= 1000 ? ["bookshelf"] : ["shelving", "bookshelf"])],
  [/wardrobe|closet|armoire|armadio|armario|kleiderschrank|schrank|cupboard|옷장/, "wardrobe"],
  [/sideboard|buffet|credenza|bahut|aparador|anrichte/, "dresser"],
  [/dresser|chest of drawers|commode|cassettiera|comoda|kommode|drawers|서랍장/, "dresser"],
  [/fridge|refrigerat|frigo|kuhlschrank|nevera|frigorifero|냉장고/, "fridge"],
  [/dishwasher|lave vaisselle|lavastoviglie|lavavajillas|spulmaschine|식기세척기/, "dishwasher"],
  [/washing machine|washer|lave linge|lavatrice|lavadora|waschmaschine|dryer|seche linge|세탁기/, "washer"],
  [/cooker|\bstove|\boven|\bhob\b|cooktop|\brange\b|cuisiniere|\bfour\b|plaque de cuisson|piano cottura|\bforno|\bcocina\b|\bherd\b|가스레인지|오븐/, "stove"],
  [/kitchen sink|\bevier|lavello|fregadero|\bspule\b|싱크/, ["sinkCounter", "counter"]],
  [/\bisland|\bilot\b|아일랜드/, "island"],
  [/kitchen|cuisine|cucina|\bkuche|counter|worktop|meuble bas|element bas|plan de travail|base unit|base cabinet|lower cabinet|kitchen cabinet|주방/, "counter"],
  [/pantry|garde manger|dispensa|despensa/, ["pantry", "wardrobe"]],
  [/urinal|urinoir|orinatoio|urinario|소변기/, ["urinal", "toilet"]],
  [/toilet|\bwc\b|lavatory|toilette|\bwater\b|inodoro|gabinetto|\bvaso\b|sanitari|변기/, "toilet"],
  [/bath ?tub|\bbath\b|baignoire|vasca|banera|badewanne|\btub\b|욕조/, "bathtub"],
  [/shower|douche|doccia|ducha|dusche|샤워/, "shower"],
  [/wash ?basin|\bbasin|\bsink|lavabo|vanity|waschbecken|lavandino|세면/, (s) => (s.w >= 1400 ? ["vanity2", "washbasin"] : ["washbasin"])],
  [/piano/, "piano"],
  [/treadmill|tapis de course/, "treadmill"],
  [/exercise bike|spin bike|velo d appartement|cyclette/, "spinBike"],
  [/bicycle rack|bike rack|velo|bicycle|bike\b/, "bikeRack"],
  [/swimming pool|\bpool\b|piscine|piscina|schwimmbad|수영장/, "pool"],
  [/street ?lamp|lamp ?post|reverbere|lampione|farola|가로등/, "streetLamp"],
  [/floor ?lamp|standard lamp|lampadaire|piantana|stehlampe|lampara de pie|floor uplight|스탠드/, "floorLamp"],
  [/switch|interrupteur|outlet|socket|\bprise\b|presa|enchufe|steckdose|스위치|콘센트/, "box"],
  [/pendant|hanging (light|lamp)|suspension|chandelier|lustre|lampadario|lampara colgante|hangeleuchte|펜던트|샹들리에/, ["pendantLamp", "ceilingLight"]],
  [/track ?light|rail light|spots? rail/, ["trackLight", "spotlight"]],
  [/down ?light|recessed|encastre|incasso|einbauleuchte|매입등/, ["downlight", "ceilingLight"]],
  [/\bspot|projecteur|faretto/, ["spotlight", "ceilingLight"]],
  [/sconce|applique|wall (lamp|light|uplight)|porch light|wandleuchte|aplique|lampada da parete|벽등/, ["wallSconce", "ceilingLight"]],
  [/table lamp|desk lamp|work lamp|bedside lamp|lampe de (bureau|chevet|table)|lampada da tavolo|lampara de mesa|tischleuchte|little lamp|스탠드 조명/, ["tableLamp", "floorLamp"]],
  [/ceiling (light|lamp)|plafonnier|plafoniera|plafon|deckenleuchte|fluorescent|neon|light source|lightsource|tube light|천장등|조명/, ["ceilingLight"]],
  [/\blamps?\b|lampe|lampada|lampara|leuchte|\blights?\b|luminaire|램프/, (s) => (s.h >= 1000 ? ["floorLamp"] : ["tableLamp", "floorLamp"])],
  [/\brug\b|carpet|tapis|tappeto|alfombra|teppich|러그|카펫/, "rug"],
  [/planter|jardiniere|fioriera|jardinera|pflanzkubel|화분대/, ["planter", "plant"]],
  [/shrub|\bbush|hedge|buisson|\bhaie\b|arbuste|cespuglio|arbusto|strauch|hecke|관목/, "shrub"],
  [/\btrees?\b|\barbre|albero|arbol|\bbaum|\boak\b|\bpine\b|aspen|poplar|birch|maple|\bchene\b|sapin|peuplier|palmier|palm tree|bouleau|cypress|cypres|willow|나무/, "tree"],
  [/plant|\bplante|pianta|planta|pflanze|flower|fleur|\bfiori?\b|maceta|cactus|ficus|bonsai|식물/, "plant"],
  [/\bcars?\b|voiture|\bauto\b|\bcoche\b|macchina|vehicle|vehicule|\btruck\b|\bsuv\b|자동차/, "car"],
  [/filing|classeur|archivio|archivador/, "filing"],
  [/printer|copier|imprimante|stampante|impresora|프린터/, "printer"],
  [/whiteboard|tableau blanc|lavagna|pizarra|화이트보드/, "whiteboard"],
  [/locker|casier|armadietto|taquilla|사물함/, "lockers"],
  [/pergola|gazebo|tonnelle/, "pergola"],
  [/umbrella|parasol|ombrellone|sombrilla|파라솔/, "patioUmbrella"],
  [/elevator|\blift\b|ascenseur|ascensore|ascensor|aufzug|엘리베이터/, "liftCar"],
  [/vending|distributeur automatique/, "vending"],
  [/server rack|\brack\b/, "serverRack"],
];

// → our furniture kind for a name / catalog id with the item's size in mm
// ({w, d, h}); "@stair" for a staircase, "box" when nothing matches.
export function furnitureKindFor(names, size = { w: 600, d: 600, h: 750 }) {
  const text = names.filter(Boolean).map(plainWords).join(" | ");
  for (const [re, target] of RULES) {
    if (!re.test(text)) continue;
    if (target === "@stair") return "@stair";
    const list = typeof target === "function" ? target(size) : Array.isArray(target) ? target : [target];
    const kind = list.find((k) => furnitureDef(k));
    if (kind) return kind;
  }
  return "box";
}

// ---------------------------------------------------------------- colours
// "AARRGGBB" / "RRGGBB" (Sweet Home 3D) or an integer → "#rrggbb", or null.
export function argbToHex(v) {
  if (v === undefined || v === null || v === "") return null;
  let s = String(v).trim();
  if (/^-?\d+$/.test(s) && s.length > 8) s = (Number(s) >>> 0).toString(16);
  s = s.replace(/^#|^0x/i, "");
  if (!/^[0-9a-f]{6,8}$/i.test(s)) return null;
  return `#${s.slice(-6).toLowerCase()}`;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Floor material id for a texture name and/or colour (nearest by colour).
export function floorMaterialFor(name, hex) {
  const n = plainWords(name);
  if (n) {
    if (/walnut|noyer|noce|nogal|dark wood|wenge/.test(n)) return "walnut";
    if (/parquet|parket|wood|\bbois\b|legno|madera|\bholz|\boak\b|\bchene|laminate|stratifie|plank|lame|마루/.test(n)) return "oak";
    if (/marble|marbre|marmo|marmol|marmor|대리석/.test(n)) return "marble";
    if (/carpet|moquette|tapis|moquette|teppich|alfombra|카펫/.test(n)) return "carpet";
    if (/grass|gazon|herbe|lawn|prato|cesped|rasen|잔디/.test(n)) return "grass";
    if (/concrete|beton|cemento|hormigon|콘크리트/.test(n)) return "concrete";
    if (/stone|pierre|pietra|piedra|\bstein|pave|cobble|gravel|gravier|slate|ardoise|돌/.test(n)) return "stone";
    if (/tile|carrel|carreau|piastrell|baldosa|azulejo|fliese|ceram|타일/.test(n)) {
      if (hex) { const [r, g, b] = rgb(hex); return (r + g + b) / 3 > 170 ? "tile-white" : "tile-grey"; }
      return "tile-white";
    }
  }
  if (!hex) return null;
  const [r, g, b] = rgb(hex);
  let best = null, bd = Infinity;
  for (const m of MATERIALS) {
    if (!m.use.includes("floor") || m.id === "grass") continue;
    const [R, G, B] = rgb(m.color);
    const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2;
    if (d < bd) { bd = d; best = m.id; }
  }
  return best;
}

// ---------------------------------------------------------------- walls and openings
const wallLen = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);

// The wall of `walls` a door/window centred at (x, y) sits in: nearest wall
// within reach whose direction agrees with `dir` (when given).
export function hostWall(walls, x, y, { reach = 150, dir = null, depth = 0 } = {}) {
  let best = null;
  for (const w of walls) {
    const L = wallLen(w);
    if (L < 1) continue;
    const c = closestOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
    if (c.d > w.thickness / 2 + depth / 2 + reach) continue;
    if (dir) {
      const dx = (w.x2 - w.x1) / L, dy = (w.y2 - w.y1) / L;
      if (Math.abs(dx * dir[1] - dy * dir[0]) > 0.35) continue;
    }
    if (!best || c.d < best.d) best = { w, d: c.d };
  }
  return best ? best.w : null;
}

// Position along a wall (mm from its start) of a point.
export const alongWall = (w, x, y) => { const L = wallLen(w) || 1; return ((x - w.x1) * (w.x2 - w.x1) + (y - w.y1) * (w.y2 - w.y1)) / L; };

// Keep an opening inside its wall and under its top; returns false when the
// wall is too short to hold it at all.
export function fitOpeningToWall(o, w, wallHeight) {
  const L = wallLen(w);
  if (L < 150) return false;
  if (o.width > L - 20) o.width = Math.max(100, Math.floor(L - 20));
  const half = o.width / 2;
  o.at = Math.min(Math.max(o.at, half + 1), L - half - 1);
  if (wallHeight && o.sill + o.height > wallHeight) {
    if (o.sill > wallHeight - 200) o.sill = Math.max(0, wallHeight - 200 - Math.min(o.height, wallHeight - 200));
    o.height = Math.max(100, Math.min(o.height, wallHeight - o.sill));
  }
  o.at = r1(o.at); o.width = r1(o.width); o.height = r1(o.height); o.sill = r1(o.sill);
  return true;
}

// Openings of one wall may not overlap along it (our walls have one opening
// per stretch). Units stacked one above the other at the same place (a
// window with a fixed light above it) become one opening spanning both; any
// other overlap keeps the wider opening; the same opening twice (read from
// both faces of a wall) is kept once. → {kept, dropped, stacked, twins}
export function dropOverlappingOpenings(openings) {
  const byWall = new Map();
  for (const o of openings) { if (!byWall.has(o.wall)) byWall.set(o.wall, []); byWall.get(o.wall).push(o); }
  const drop = new Set();
  let dropped = 0, stacked = 0, twins = 0;
  for (const list of byWall.values()) {
    list.sort((a, b) => b.width - a.width);
    for (let i = 0; i < list.length; i++) {
      if (drop.has(list[i])) continue;
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (drop.has(b)) continue;
        const overlap = Math.min(a.at + a.width / 2, b.at + b.width / 2) - Math.max(a.at - a.width / 2, b.at - b.width / 2);
        if (overlap <= 1) continue;
        const vert = Math.min(a.sill + a.height, b.sill + b.height) - Math.max(a.sill, b.sill);
        drop.add(b);
        if (Math.abs(a.at - b.at) < 50 && Math.abs(a.width - b.width) < 50 && Math.abs(a.sill - b.sill) < 50 && b.sill + b.height <= a.sill + a.height + 50) twins++;
        else if (vert <= 1 && Math.abs(a.at - b.at) < 100 && Math.abs(a.width - b.width) < 100) {
          const top = Math.max(a.sill + a.height, b.sill + b.height);
          a.sill = Math.min(a.sill, b.sill);
          a.height = top - a.sill;
          if (b.kind === "door" && a.kind !== "door") { a.kind = "door"; a.type = b.type; }
          stacked++;
        } else dropped++;
      }
    }
  }
  return { kept: openings.filter((o) => !drop.has(o)), dropped, stacked, twins };
}

// Collinear walls of one level that overlap (drawn twice, or one running
// into the next): a wall inside another is removed, a partial overlap is cut
// off the second wall. Openings move to the wall that stays.
// Mutates and returns {walls, openings, removed, trimmed}.
export function resolveWallOverlaps(walls, openings, levelHeight = () => null) {
  let removed = 0, trimmed = 0;
  const gone = new Set();
  const frame = (w) => { const L = wallLen(w) || 1; return { L, d: [(w.x2 - w.x1) / L, (w.y2 - w.y1) / L] }; };
  const moveOpenings = (from, to) => {
    for (const o of openings) {
      if (o.wall !== from.id) continue;
      const f = frame(from);
      const x = from.x1 + f.d[0] * o.at, y = from.y1 + f.d[1] * o.at;
      o.wall = to.id;
      o.at = alongWall(to, x, y);
    }
  };
  const byLevel = new Map();
  for (const w of walls) { if (!byLevel.has(w.level)) byLevel.set(w.level, []); byLevel.get(w.level).push(w); }
  for (const list of byLevel.values()) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (gone.has(a)) continue;
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (i === j || gone.has(b) || gone.has(a)) continue;
        const fa = frame(a), fb = frame(b);
        if (Math.abs(fa.d[0] * fb.d[1] - fa.d[1] * fb.d[0]) > 1e-3) continue;
        const off = (x, y) => Math.abs((x - a.x1) * -fa.d[1] + (y - a.y1) * fa.d[0]);
        if (off(b.x1, b.y1) > 5 || off(b.x2, b.y2) > 5) continue;
        const u = (x, y) => (x - a.x1) * fa.d[0] + (y - a.y1) * fa.d[1];
        const ub1 = u(b.x1, b.y1), ub2 = u(b.x2, b.y2);
        const lo = Math.min(ub1, ub2), hi = Math.max(ub1, ub2);
        const ov = Math.min(fa.L, hi) - Math.max(0, lo);
        if (ov <= 1) continue;
        if (lo >= -1 && hi <= fa.L + 1) {
          // b lies inside a.
          if (b.thickness > a.thickness) a.thickness = b.thickness;
          a.height = a.height === null || b.height === null ? null : Math.max(a.height, b.height);
          moveOpenings(b, a); gone.add(b); removed++;
        } else if (lo <= 1 && hi >= fa.L - 1) {
          if (a.thickness > b.thickness) b.thickness = a.thickness;
          b.height = a.height === null || b.height === null ? null : Math.max(a.height, b.height);
          moveOpenings(a, b); gone.add(a); removed++;
        } else {
          // Partial overlap: b's end inside a moves to the end of a on the
          // side where b carries on.
          const inside = (uu) => uu > 0 && uu < fa.L;
          const old = { ...b };
          if (inside(ub1)) [b.x1, b.y1] = ub2 < 0 ? [a.x1, a.y1] : [a.x2, a.y2];
          else if (inside(ub2)) [b.x2, b.y2] = ub1 < 0 ? [a.x1, a.y1] : [a.x2, a.y2];
          else continue;
          for (const o of openings) {
            if (o.wall !== b.id) continue;
            const f = frame(old);
            o.at = alongWall(b, old.x1 + f.d[0] * o.at, old.y1 + f.d[1] * o.at);
          }
          trimmed++;
        }
      }
    }
  }
  const kept = walls.filter((w) => !gone.has(w));
  const wallById = new Map(kept.map((w) => [w.id, w]));
  const fitted = openings.filter((o) => { const w = wallById.get(o.wall); return w && fitOpeningToWall(o, w, w.height ?? levelHeight(w.level)); });
  walls.length = 0; walls.push(...kept);
  openings.length = 0; openings.push(...fitted);
  return { walls, openings, removed, trimmed };
}
