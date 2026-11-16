// Furnished sample projects of the start page: 20 single rooms and 20 whole
// homes, built from the templates (their room rectangles come along as
// project.rects) and furnished by room kind in one of five styles. Furniture
// stands against walls by rules (sofa against an inside wall, bed head to a
// wall, kitchen along the longest wall …), so every plan gets a sensible layout.
import { buildTemplate } from './templates.js';
import { buildPlan, PLANS } from './plans.js';
import { newId } from './document.js';
import { PARAMETRIC_ITEMS } from '../library/parametric/index.js';
import { doorSwings, doorBlockers } from './checks.js';
import { overlapDepth, wallQuad } from './doorswing.js';
import { pointInPolygon } from './walls.js';
import { holePolygons } from './stairs.js';

const ITEMS = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));

export const SAMPLE_GROUPS = [
  { id: 'rooms', icon: 'libLiving', ko: '방 꾸미기', en: 'Rooms' },
  { id: 'homes', icon: 'plan2d', ko: '집 전체', en: 'Whole homes' },
  { id: 'plans', icon: 'wallTool', ko: '평면도', en: 'Floor plans' },
];

/** Styles: fabrics, woods, floors and wall paint that go together. */
const STYLES = {
  modern: { fabric: 'fabric-linen-grey', accent: 'fabric-mustard', wood: 'wood-walnut', floor: 'floor-oak', wall: 'wall-paint-white', rug: 'rug-wool-cream' },
  scandi: { fabric: 'fabric-boucle', accent: 'fabric-linen-beige', wood: 'wood-ash', floor: 'floor-light', wall: 'wall-paint-warm', rug: 'rug-wool-cream' },
  classic: { fabric: 'fabric-velvet-green', accent: 'fabric-mustard', wood: 'wood-dark', floor: 'floor-herringbone', wall: 'wall-paint-sage', rug: 'rug-pattern' },
  warm: { fabric: 'fabric-terracotta', accent: 'fabric-linen-white', wood: 'wood-teak', floor: 'floor-oak', wall: 'wall-plaster', rug: 'carpet-beige' },
  blue: { fabric: 'fabric-velvet-blue', accent: 'fabric-linen-white', wood: 'wood-white', floor: 'floor-grey', wall: 'wall-paint-blue', rug: 'carpet-grey' },
};

const R = (id, template, style, ko, en, koDesc, enDesc, icon) => ({ id, group: 'rooms', template, style, icon, ko: [ko, koDesc], en: [en, enDesc] });
const H = (id, template, style, ko, en, koDesc, enDesc, icon = 'plan2d') => ({ id, group: 'homes', template, style, icon, ko: [ko, koDesc], en: [en, enDesc] });

export const SAMPLE_PROJECTS = [
  // ── 30 rooms
  R('living-modern', 'living', 'modern', '모던 거실', 'Modern living room', '소파·러그·TV·조명·식물', 'Sofa, rug, TV, lamps, plants', 'libLiving'),
  R('living-scandi', 'living', 'scandi', '스칸디 거실', 'Scandinavian living room', '부클레 소파·밝은 나무', 'Bouclé sofa, light wood', 'libLiving'),
  R('living-classic', 'living', 'classic', '클래식 거실', 'Classic living room', '벨벳 소파·헤링본 마루', 'Velvet sofa, herringbone floor', 'libLiving'),
  R('living-corner', 'living', 'warm', '코너 소파 거실', 'Living room with sectional', 'L자 소파·라운지 체어', 'Sectional sofa, lounge chair', 'libLiving'),
  R('bedroom-cozy', 'bedroom', 'warm', '아늑한 침실', 'Cosy bedroom', '퀸 침대·협탁·옷장', 'Queen bed, nightstands, wardrobe', 'libBedroom'),
  R('bedroom-modern', 'bedroom', 'modern', '모던 침실', 'Modern bedroom', '침대·서랍장', 'Bed, dresser', 'libBedroom'),
  R('bedroom-guest', 'room', 'scandi', '손님 방', 'Guest room', '싱글 침대·책상', 'Single bed, desk', 'libBedroom'),
  R('kids-pastel', 'kidsroom', 'scandi', '아이 방 (파스텔)', 'Kids room (pastel)', '침대·책상·장난감 상자', 'Bed, desk, toy box', 'libKids'),
  R('kids-bunk', 'kidsroom', 'blue', '아이 방 (이층 침대)', 'Kids room (bunk bed)', '이층 침대·책상', 'Bunk bed, desk', 'libKids'),
  R('kitchen-galley', 'kitchen', 'modern', '일자형 주방', 'Galley kitchen', '싱크대·냉장고·쿡탑', 'Counter, fridge, hob', 'libKitchen'),
  R('kitchen-island', 'living', 'scandi', '아일랜드 주방', 'Island kitchen', '아일랜드·바 의자', 'Island, bar stools', 'libKitchen'),
  R('dining-round', 'dining', 'warm', '원형 식탁 식당', 'Dining with round table', '원형 식탁·의자 4', 'Round table, 4 chairs', 'libDining'),
  R('dining-long', 'dining', 'classic', '6인 식당', 'Dining for six', '긴 식탁·사이드보드', 'Long table, sideboard', 'libDining'),
  R('bathroom-spa', 'bathroom', 'modern', '욕실', 'Bathroom', '욕조·세면대·변기', 'Bathtub, vanity, toilet', 'libBathroom'),
  R('bathroom-shower', 'bathroom', 'scandi', '샤워 부스 욕실', 'Shower bathroom', '샤워 부스·세면대', 'Shower, vanity', 'libBathroom'),
  R('study', 'office', 'classic', '서재', 'Study', '책상·의자·책장', 'Desk, chair, bookcases', 'libOffice'),
  R('home-office', 'office', 'modern', '홈 오피스', 'Home office', 'L자 책상·모니터', 'L desk, monitor', 'libOffice'),
  R('dressing-room', 'dressing', 'warm', '드레스룸', 'Dressing room', '붙박이장·화장대', 'Closets, vanity', 'libStorage'),
  R('laundry-room', 'laundry', 'modern', '다용도실', 'Laundry', '세탁기·건조기·선반', 'Washer, dryer, shelves', 'libAppliances'),
  R('reading-nook', 'room', 'warm', '독서 공간', 'Reading room', '라운지 체어·책장·화분', 'Lounge chair, books, plants', 'libDecor'),
  R('living-l-sofa', 'living', 'blue', 'ㄱ자 소파 거실', 'Living room with L-sofa', 'ㄱ자 소파·TV·러그', 'L-shaped sofa, TV, rug', 'libLiving'),
  R('nursery', 'kidsroom', 'scandi', '아기 방', 'Nursery', '아기 침대·기저귀 교환대·수유 의자', 'Crib, changing table, nursing chair', 'libKids'),
  R('kitchen-dining', 'dining', 'warm', '주방 겸 식당', 'Kitchen-diner', '싱크대·냉장고·2인 식탁', 'Counter, fridge, table for two', 'libKitchen'),
  R('meeting-room', 'office', 'modern', '회의실', 'Meeting room', '6인 회의 테이블·화이트보드', 'Six-seat table, whiteboard', 'libWorkplace'),
  R('team-office', 'office', 'scandi', '팀 사무실', 'Team office', '4인 워크스테이션·복합기·사물함', '4-desk cluster, printer, lockers', 'libWorkplace'),
  // ── office and server rooms (five more: the start page shows full rows of five)
  R('open-office', 'openoffice1', 'modern', '사무실 (오픈형)', 'Open-plan office', '8인 책상·평판 조명·복합기·정수기', 'Eight desks, panel lights, printer, water cooler', 'libOfficeProps'),
  R('executive-office', 'executive', 'classic', '임원실', 'Executive office', 'L자 책상·일체형 PC·감사패·소파', 'L desk, all-in-one PC, plaques, lounge chairs', 'libOfficeProps'),
  R('server-room', 'serverroom', 'modern', '서버실', 'Server room', '냉복도 랙 포드·항온항습기·UPS·소화 설비', 'Cold-aisle rack pod, CRAC units, UPS, fire suppression', 'libServerRoom'),
  R('server-closet', 'servercloset', 'modern', '소형 전산실', 'Server closet', '하프 랙·벽걸이 랙·서버실 에어컨·작업대', 'Half rack, wall cabinet, wall AC, workbench', 'libServerRoom'),
  R('noc-room', 'noc', 'modern', '관제실', 'Operations room', '관제 콘솔·모니터 벽·IP 카메라', 'Console desk, video wall, IP cameras', 'libComputer'),
  // ── 25 homes
  H('studio-furnished', 'studio', 'scandi', '원룸 (스칸디)', 'Studio (Scandinavian)', '침대·책상·소파가 있는 원룸', 'Bed, desk and sofa in one room', 'floorTool'),
  H('studio-modern', 'studio', 'modern', '원룸 (모던)', 'Studio (modern)', '수납을 늘린 원룸', 'Studio with storage', 'floorTool'),
  H('officetel-a', 'officetel', 'modern', '오피스텔', 'Officetel', '1.5룸, 모던', '1.5 rooms, modern', 'floorTool'),
  H('officetel-b', 'officetel', 'warm', '오피스텔 (내추럴)', 'Officetel (natural)', '1.5룸, 내추럴', '1.5 rooms, natural', 'floorTool'),
  H('apt49-a', 'apt49', 'scandi', '49㎡ 아파트', '49 m² apartment', '신혼부부 투룸', 'Two rooms for a couple'),
  H('apt49-b', 'apt49', 'blue', '49㎡ 아파트 (블루)', '49 m² apartment (blue)', '아이 방이 있는 투룸', 'Two rooms with a kids room'),
  H('apt59-furnished', 'apt59', 'modern', '59㎡ 아파트', '59 m² apartment', '가구를 배치한 투룸', 'Two bedrooms, furnished'),
  H('apt59-scandi', 'apt59', 'scandi', '59㎡ 아파트 (스칸디)', '59 m² apartment (Scandinavian)', '밝은 나무와 부클레', 'Light wood and bouclé'),
  H('apt59-classic', 'apt59', 'classic', '59㎡ 아파트 (클래식)', '59 m² apartment (classic)', '벨벳과 짙은 나무', 'Velvet and dark wood'),
  H('apt74-a', 'apt74', 'modern', '74㎡ 아파트', '74 m² apartment', '방 3, 모던', '3 bedrooms, modern'),
  H('apt74-b', 'apt74', 'warm', '74㎡ 아파트 (내추럴)', '74 m² apartment (natural)', '방 3, 내추럴', '3 bedrooms, natural'),
  H('apt84-a', 'apt84', 'modern', '84㎡ 아파트', '84 m² apartment', '방 3 · 드레스룸', '3 bedrooms, dressing room'),
  H('apt84-b', 'apt84', 'scandi', '84㎡ 아파트 (스칸디)', '84 m² apartment (Scandinavian)', '아이 둘 가족', 'Family with two children'),
  H('apt84-c', 'apt84', 'classic', '84㎡ 아파트 (클래식)', '84 m² apartment (classic)', '서재가 있는 집', 'With a study'),
  H('apt104-a', 'apt104', 'modern', '104㎡ 아파트', '104 m² apartment', '방 4, 모던', '4 bedrooms, modern'),
  H('apt104-b', 'apt104', 'blue', '104㎡ 아파트 (블루)', '104 m² apartment (blue)', '방 4, 블루 포인트', '4 bedrooms, blue accent'),
  H('house-a', 'house', 'warm', '단독주택', 'House', '방 2 · 거실·주방', '2 bedrooms, living-kitchen', 'libStructure'),
  H('house-b', 'house', 'classic', '단독주택 (클래식)', 'House (classic)', '방 2, 클래식', '2 bedrooms, classic', 'libStructure'),
  H('duplex-a', 'duplex', 'modern', '2층 주택', 'Two-storey house', '1층 거실·서재, 2층 침실', 'Living & study below, bedrooms above', 'stairsTool'),
  H('duplex-b', 'duplex', 'scandi', '2층 주택 (스칸디)', 'Two-storey house (Scandinavian)', '밝은 2층 주택', 'Bright two-storey house', 'stairsTool'),
  H('apt74-c', 'apt74', 'classic', '74㎡ 아파트 (클래식)', '74 m² apartment (classic)', '방 3, 클래식', '3 bedrooms, classic'),
  H('loft-a', 'loft', 'scandi', '복층 원룸', 'Loft studio', '아래층 거실·주방, 위층 침실', 'Living below, bedroom in the loft', 'stairsTool'),
  H('loft-b', 'loft', 'modern', '복층 원룸 (모던)', 'Loft studio (modern)', '모던한 복층', 'Modern loft', 'stairsTool'),
  H('house3-a', 'house3', 'modern', '3층 단독 주택', 'Three-storey house', '1층 거실·서재, 2·3층 침실', 'Living & study, bedrooms above', 'stairsTool'),
  H('house3-b', 'house3', 'warm', '3층 단독 주택 (내추럴)', 'Three-storey house (natural)', '아이 방이 있는 3층 집', 'Three storeys with a kids room', 'stairsTool'),
];

// ── floor plans (plans.js): every plan empty; the common homes also lightly furnished (main rooms only).
const FURNISHED_PLANS = new Set(['apt59-flat', 'apt84-flat', 'villa', 'studio', 'officetel', 'house-1f']);
const LIGHT_KEYS = new Set(['living', 'bedroom', 'bedroom2', 'kitchen', 'dining', 'bath']);
for (const [plan, spec] of Object.entries(PLANS)) {
  SAMPLE_PROJECTS.push({ id: `plan-${plan}`, group: 'plans', plan, template: plan, style: 'modern', icon: spec.icon, ko: spec.ko, en: spec.en });
  if (FURNISHED_PLANS.has(plan)) SAMPLE_PROJECTS.push({ id: `plan-${plan}-furnished`, group: 'plans', plan, template: plan, style: 'scandi', furnish: true, icon: spec.icon, ko: [`${spec.ko[0]} · 가구 배치`, `${spec.ko[1]} · 기본 가구`], en: [`${spec.en[0]}, furnished`, `${spec.en[1]}; basic furniture`] });
}

const NAMES = {
  ko: { room: '방', living: '거실', bedroom: '안방', bedroom2: '침실 2', bedroom3: '침실 3', bedroom4: '침실 4', kitchen: '주방', bath: '욕실', bath2: '욕실 2', office: '서재', entry: '현관', kids: '아이 방', dining: '식당', dressing: '드레스룸', laundry: '다용도실', utility: '다용도실', hall: '복도', openoffice: '사무실', director: '임원실', server: '서버실', noc: '관제실' },
  en: { room: 'Room', living: 'Living room', bedroom: 'Master bedroom', bedroom2: 'Bedroom 2', bedroom3: 'Bedroom 3', bedroom4: 'Bedroom 4', kitchen: 'Kitchen', bath: 'Bathroom', bath2: 'Bathroom 2', office: 'Study', entry: 'Entrance', kids: 'Kids room', dining: 'Dining room', dressing: 'Dressing room', laundry: 'Laundry', utility: 'Utility room', hall: 'Hall', openoffice: 'Office', director: 'Executive office', server: 'Server room', noc: 'Operations room' },
};

// ───────────────────────── placing

const ROT = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
const OPPOSITE = { n: 's', s: 'n', w: 'e', e: 'w' };
/** Fraction along `side` that sits away from the corner it shares with `from`. */
const awayFrom = (side, from) => {
  if (side === from || side === OPPOSITE[from]) return 0.5;
  if ((from === 'e' && (side === 'n' || side === 's')) || (from === 's' && (side === 'e' || side === 'w'))) return 0.22;
  return 0.78;
};

class Furnisher {
  constructor(project, style) { this.p = project; this.style = style; }

  /** Item params with the style's fabrics and woods (explicit params win). */
  params(itemId, extra) {
    const out = {};
    for (const p of ITEMS.get(itemId)?.params ?? []) {
      if (p.type !== 'material') continue;
      if (p.filter === 'fabric') out[p.key] = /pillow|accent|throw/i.test(p.key) ? this.style.accent : this.style.fabric;
      else if (p.filter === 'wood') out[p.key] = this.style.wood;
      else if (p.filter === 'carpet') out[p.key] = this.style.rug;
    }
    return { ...out, ...extra };
  }

  add(level, item, x, z, rotation = 0, { y = 0, params = {} } = {}) {
    if (!ITEMS.has(item)) return;
    this.p.objects.push({ id: newId('ob'), level, item, params: this.params(item, params), position: [x, y, z], rotation: [0, rotation, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' });
  }

  /**
   * Against side n (−z) / s (+z) / w (−x) / e (+x) of a box; `t` along it.
   * The box edge is the wall face, so the item's back (half its depth behind its centre) meets that face.
   * An open side (no wall) uses another solid side.
   */
  wall(b, side, t, item, { depth, off = 0, y = 0, params = {} } = {}) {
    const spec = ITEMS.get(item);
    if (!spec) return;
    if (b.open?.[side]) {
      const alt = ['n', 'e', 'w', 's'].find((s) => !b.open?.[s]);
      if (!alt) return;
      side = alt;
    }
    const d = depth ?? spec.size?.[2] ?? 0.5;
    const gap = ((spec.placement ?? 'floor') === 'wall' ? 0.002 : 0.015) + off;
    const span = b.spans?.[side];
    const tt = Math.max(0.02, Math.min(0.98, t));
    const alongAt = span && span.len > 0.3 ? span.lo + span.len * tt : null;
    if (side === 'n') this.add(b.level, item, alongAt ?? (b.x0 + (b.x1 - b.x0) * tt), b.z0 + d / 2 + gap, ROT.n, { y, params });
    else if (side === 's') this.add(b.level, item, alongAt ?? (b.x0 + (b.x1 - b.x0) * tt), b.z1 - d / 2 - gap, ROT.s, { y, params });
    else if (side === 'w') this.add(b.level, item, b.x0 + d / 2 + gap, alongAt ?? (b.z0 + (b.z1 - b.z0) * tt), ROT.w, { y, params });
    else this.add(b.level, item, b.x1 - d / 2 - gap, alongAt ?? (b.z0 + (b.z1 - b.z0) * tt), ROT.e, { y, params });
  }

  at(b, fx, fz, item, rotation = 0, options = {}) {
    this.add(b.level, item, b.x0 + (b.x1 - b.x0) * fx, b.z0 + (b.z1 - b.z0) * fz, rotation, options);
  }
}

/**
 * The longest wall actually standing on one side of a room rectangle.
 * A side can be open for most of its length and still have a short stub: only the real wall counts,
 * so a sofa or a kitchen run is placed on that wall and not in the opening.
 */
function wallSpan(project, r, side) {
  const horiz = side === 'n' || side === 's';
  const edge = horiz ? (side === 'n' ? r.z0 : r.z1) : (side === 'w' ? r.x0 : r.x1);
  const edgeLo = horiz ? r.x0 : r.z0;
  const edgeHi = horiz ? r.x1 : r.z1;
  let best = null;
  for (const w of project?.walls ?? []) {
    if (w.level !== r.level) continue;
    if (horiz) { if (Math.abs(w.a[1] - edge) > 0.03 || Math.abs(w.b[1] - edge) > 0.03) continue; }
    else if (Math.abs(w.a[0] - edge) > 0.03 || Math.abs(w.b[0] - edge) > 0.03) continue;
    const a = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const b = horiz ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    const lo = Math.max(edgeLo, a) + 0.04;
    const hi = Math.min(edgeHi, b) - 0.04;
    if (hi - lo > (best?.len ?? 0)) best = { lo, hi, len: hi - lo, thick: (w.thickness ?? 0.15) / 2, wall: w };
  }
  return best ?? { lo: edgeLo, hi: edgeHi, len: 0, thick: 0.02, wall: null };
}

/** A door (not a window) whose opening lies on the wall span of this side. */
const sideHasDoor = (project, r, side) => doorFraction(project, r, side) != null;

/** The candidate side whose middle sits farthest from a door. */
function fartherFromDoors(project, r, sides) {
  if (!project || !r) return sides[0] ?? null;
  let best = sides[0] ?? null;
  let bestD = -1;
  for (const s of sides) {
    if (!s) continue;
    const span = wallSpan(project, r, s);
    const mid = span.len > 0.3 ? (span.lo + span.hi) / 2 : (s === 'n' || s === 's' ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2);
    const px = s === 'n' || s === 's' ? mid : (s === 'w' ? r.x0 : r.x1);
    const pz = s === 'w' || s === 'e' ? mid : (s === 'n' ? r.z0 : r.z1);
    let d = 99;
    for (const o of project.openings) {
      if (/window/.test(o.item) || (o.sill ?? 0) > 0.3 || o.height < 1.6) continue;
      const w = project.walls.find((w) => w.id === o.wall);
      if (!w || w.level !== r.level) continue;
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
      d = Math.min(d, Math.hypot(w.a[0] + ((w.b[0] - w.a[0]) * o.offset) / L - px, w.a[1] + ((w.b[1] - w.a[1]) * o.offset) / L - pz));
    }
    if (d > bestD) { bestD = d; best = s; }
  }
  return best;
}

/** Where a door sits along this side's wall, 0 at `span.lo` and 1 at `span.hi`, or null. */
function doorFraction(project, r, side) {
  const span = wallSpan(project, r, side);
  const w = span.wall;
  if (!w || span.len < 0.5) return null;
  const horiz = side === 'n' || side === 's';
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  const dx = (w.b[0] - w.a[0]) / L; const dz = (w.b[1] - w.a[1]) / L;
  let best = null;
  for (const o of project.openings) {
    if (o.wall !== w.id || /window/.test(o.item) || (o.sill ?? 0) > 0.3 || o.height < 1.6) continue;
    const c = horiz ? w.a[0] + dx * o.offset : w.a[1] + dz * o.offset;
    if (c < span.lo - 0.05 || c > span.hi + 0.05) continue;
    const f = (c - span.lo) / span.len;
    if (best == null || Math.min(f, 1 - f) < Math.min(best, 1 - best)) best = f;
  }
  return best;
}

/**
 * The room's box on the inside faces of its walls (each side inset by that wall's half thickness).
 * A side with no wall (an opening into the next room) is `open` and is barely inset.
 */
function inner(r, project) {
  const spans = {};
  for (const s of ['n', 's', 'w', 'e']) spans[s] = project ? wallSpan(project, r, s) : { lo: 0, hi: 0, len: 0, thick: 0.13, wall: null };
  const open = {};
  for (const s of ['n', 's', 'w', 'e']) open[s] = spans[s].len < 0.8;
  const inset = (side) => (open[side] ? 0.02 : spans[side].thick);
  return { level: r.level, key: r.key, rect: r, spans, open, x0: r.x0 + inset('w'), z0: r.z0 + inset('n'), x1: r.x1 - inset('e'), z1: r.z1 - inset('s') };
}
const along = (side, b) => b.spans?.[side]?.len || (side === 'n' || side === 's' ? b.x1 - b.x0 : b.z1 - b.z0);

/**
 * Solid walls of a room: no door first, then the longest real wall, then a wall shared with
 * another room. Open sides (no wall, or only a short stub) are left out.
 */
function furnishingSides(project, r, rects) {
  const others = rects.filter((o) => o !== r && o.level === r.level);
  const touch = (side) => others.some((o) => (side === 'n' ? Math.abs(o.z1 - r.z0) < 1e-6 : side === 's' ? Math.abs(o.z0 - r.z1) < 1e-6 : side === 'w' ? Math.abs(o.x1 - r.x0) < 1e-6 : Math.abs(o.x0 - r.x1) < 1e-6)
    && (side === 'n' || side === 's' ? Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0) > 0.5 : Math.min(o.z1, r.z1) - Math.max(o.z0, r.z0) > 0.5));
  const door = (side) => sideHasDoor(project, r, side);
  const spanLen = (side) => wallSpan(project, r, side).len;
  const sides = ['n', 'w', 'e', 's'].filter((s) => spanLen(s) >= 0.8);
  sides.sort((a, b) => Number(door(a)) - Number(door(b)) || spanLen(b) - spanLen(a) || Number(touch(b)) - Number(touch(a)));
  return sides.length ? sides : ['n'];
}

// ───────────────────────── rooms by kind

function living(F, b, side, variant = 0) {
  // Opposite the sofa when that wall is real and has no door; otherwise another solid wall, away from the sofa's corner.
  const solid = (s) => !b.open?.[s] && along(s, b) >= 1.5;
  const free = (s) => solid(s) && !(b.rect && sideHasDoor(F.p, b.rect, s));
  const op = free(OPPOSITE[side]) ? OPPOSITE[side]
    : ['e', 'w', 'n', 's'].find((s) => s !== side && free(s))
    ?? (solid(OPPOSITE[side]) ? OPPOSITE[side] : ['e', 'w', 'n', 's'].find((s) => s !== side && solid(s)) ?? OPPOSITE[side]);
  const adjacent = op !== OPPOSITE[side];
  let tvT = adjacent ? awayFrom(op, side) : 0.5;
  if (b.rect) {
    const doorAt = doorFraction(F.p, b.rect, op);
    if (doorAt != null) tvT = doorAt < 0.5 ? 0.78 : 0.22;
  }
  const across = side === 'n' || side === 's';
  const pt = (t, depth) => (across ? [t, side === 'n' ? depth : 1 - depth] : [side === 'w' ? depth : 1 - depth, t]);
  const len = along(side, b);
  // A sectional starts past the corner plant; the lamp stands at its far end when there is room.
  const sw = ITEMS.get('sofa-sectional')?.size?.[0] ?? 2.9;
  const plant = (ITEMS.get('monstera')?.size?.[0] ?? 1.15) + 0.1;
  const sectionalAt = (plant + sw / 2) / len;
  const lampAt = (plant + sw + 0.3) / len;
  if (variant === 1 && plant + sw + 0.1 <= len) F.wall(b, side, sectionalAt, 'sofa-sectional');
  else if (variant === 1) variant = 0;
  else if (variant === 2) F.wall(b, side, 0.5, 'sofa-loveseat');
  else F.wall(b, side, 0.5, 'sofa-modern');
  F.at(b, ...pt(0.5, 0.5), 'rug', ROT[side]);
  const tableDepth = variant === 1 ? 0.62 : 0.45;
  F.at(b, ...pt(0.55, tableDepth), 'coffee-table', ROT[side]);
  F.at(b, ...pt(0.55, tableDepth), 'vase-stems', 0, { y: ITEMS.get('coffee-table')?.size?.[1] ?? 0.4 });
  F.at(b, ...pt(0.15, 0.55), variant === 2 ? 'lounge-chair' : 'armchair', ROT[side] + Math.PI / 2);
  F.wall(b, op, tvT, 'tv-console');
  F.wall(b, op, tvT, 'tv', { y: 0.5, off: 0.1 });
  if (variant !== 1) F.wall(b, side, 0.86, 'floor-lamp-tripod');
  else if (lampAt < 0.97) F.wall(b, side, lampAt, 'floor-lamp-arc');
  F.wall(b, side, Math.min(0.12, (plant / 2) / len), 'monstera');
  F.wall(b, side, 0.5, 'wall-art', { y: 1.3 });
  F.at(b, ...pt(0.5, 0.45), 'pendant-light', 0, { y: 1.415 });
  if (!adjacent && along(op, b) > 2.8 && tvT > 0.4) F.wall(b, op, 0.12, 'fiddle-leaf-fig');
  if (!adjacent && along(op, b) > 3.6 && tvT < 0.6) F.wall(b, op, 0.88, 'bookshelf');
}

function bedroom(F, b, side, { single = false } = {}) {
  // A bed against the wall opposite a door in a small room stands in that doorway: turn it onto a side wall.
  const across = (side === 'n' || side === 's' ? b.z1 - b.z0 : b.x1 - b.x0);
  if (b.rect && across < 3.3 && sideHasDoor(F.p, b.rect, OPPOSITE[side])) {
    const alt = fartherFromDoors(F.p, b.rect, ['n', 'e', 's', 'w'].filter((s) => s !== side && s !== OPPOSITE[side] && !b.open?.[s] && !sideHasDoor(F.p, b.rect, s)));
    if (alt) side = alt;
  }
  const op = OPPOSITE[side];
  const len = along(side, b);
  const bedSize = single ? 'single' : len > 3.4 ? 'queen' : 'supersingle';
  F.wall(b, side, 0.5, 'bed', { params: { bedSize } });
  const [bw, , bl] = ITEMS.get('bed').sizeOf({ bedSize });
  const ns = (ITEMS.get('nightstand')?.size?.[0] ?? 0.5) / 2 + 0.03;
  const half = (bw / 2 + ns) / len;
  F.wall(b, side, 0.5 - half, 'nightstand');
  if (!single) F.wall(b, side, 0.5 + half, 'nightstand');
  F.wall(b, side, 0.5 - half, 'table-lamp', { y: 0.55, off: 0.02 });
  // Wardrobe and dresser opposite the bed when there is room to walk between; else on a side wall by the foot.
  const deep = (side === 'n' || side === 's' ? b.z1 - b.z0 : b.x1 - b.x0);
  const ward = (!b.open?.[op] && !(b.rect && sideHasDoor(F.p, b.rect, op))) ? op
    : ['e', 'w', 'n', 's'].find((s) => s !== side && !b.open?.[s] && !(b.rect && sideHasDoor(F.p, b.rect, s)));
  if (ward && deep >= bl + 0.6 + 0.7) {
    F.wall(b, ward, ward === op ? 0.3 : awayFrom(ward, side), 'wardrobe');
    if (ward === op) F.wall(b, op, 0.78, single ? 'desk' : 'dresser');
  } else if (ward) F.wall(b, ward, awayFrom(ward, side), 'wardrobe');
  F.at(b, 0.5, 0.5, 'ceiling-flush', 0, { y: 2.3 });
}

function kids(F, b, side, bunk) {
  F.wall(b, side, 0.32, bunk ? 'bunk-bed' : 'bed', { params: bunk ? {} : { bedSize: 'single' } });
  F.wall(b, OPPOSITE[side], 0.35, 'kids-desk');
  F.wall(b, OPPOSITE[side], 0.82, 'toy-box');
  F.wall(b, side, 0.85, 'cube-storage');
  F.at(b, 0.62, 0.55, 'rug', 0, { params: { shape: 'round', width: 1.2, depth: 1.2 } });
  F.at(b, 0.5, 0.5, 'ceiling-flush', 0, { y: 2.3 });
}

function kitchen(F, b, side, island = false) {
  const len = along(side, b);
  // The stretch of this wall that is clear of the door, and of a door around either corner.
  let lo = 0.12;
  let hi = Math.max(lo + 0.5, len - 0.12);
  const horiz = side === 'n' || side === 's';
  if (b.rect && sideHasDoor(F.p, b.rect, horiz ? 'w' : 'n')) lo = Math.max(lo, 0.7);
  if (b.rect && sideHasDoor(F.p, b.rect, horiz ? 'e' : 's')) hi = Math.min(hi, len - 0.7);
  const doorAt = b.rect ? doorFraction(F.p, b.rect, side) : null;
  if (doorAt != null) {
    const at = doorAt * len;
    const left = at - 0.65; const right = at + 0.65;
    if (left - lo >= hi - right) hi = Math.max(lo + 0.7, left);
    else lo = Math.min(hi - 0.7, right);
  }
  const span = Math.max(0, hi - lo);
  const u = (metres) => (lo + metres) / Math.max(len, 0.01);
  // Fridge at the clear end, then a sink and cabinets for as long as the clear stretch allows.
  if (span >= 0.7) F.wall(b, side, u(Math.min(0.48, span / 2)), 'refrigerator');
  let at = Math.min(0.98, span);
  const place = (item, width, options) => { if (at + width > span + 0.02) return false; F.wall(b, side, u(at + width / 2), item, options); at += width; return true; };
  if (span >= 2.9) place('kitchen-base-cabinet', 0.6);
  if (place('kitchen-sink-counter', 1.8)) F.wall(b, side, u(at - 0.9), 'kitchen-wall-cabinet', { y: 1.45 });
  else place('kitchen-base-cabinet', 0.6);
  if (place('kitchen-base-cabinet', 0.6)) { F.wall(b, side, u(at - 0.3), 'cooktop', { y: 0.85, off: 0.04 }); F.wall(b, side, u(at - 0.3), 'range-hood', { y: 1.55 }); }
  place('kitchen-base-cabinet', 0.6);
  if (island) {
    F.at(b, 0.5, 0.62, 'kitchen-island', ROT[side]);
    const cx = (b.x0 + b.x1) / 2; const cz = b.z0 + (b.z1 - b.z0) * 0.62 + 0.8;
    for (const dx of [-0.55, 0, 0.55]) F.add(b.level, 'bar-stool', cx + dx, cz, Math.PI);
    F.at(b, 0.5, 0.62, 'pendant-cluster', 0, { y: 1.29 });
  }
}

function dining(F, b, long = false) {
  F.at(b, 0.5, 0.52, 'dining-table', 0, { params: long ? { length: 1.9 } : { shape: 'round', length: 1.1, depth: 1.1 } });
  const cx = (b.x0 + b.x1) / 2; const cz = b.z0 + (b.z1 - b.z0) * 0.52;
  const seats = long ? [[-0.6, -0.68, 0], [0, -0.68, 0], [0.6, -0.68, 0], [-0.6, 0.68, Math.PI], [0, 0.68, Math.PI], [0.6, 0.68, Math.PI]] : [[0, -0.8, 0], [0, 0.8, Math.PI], [-0.8, 0, Math.PI / 2], [0.8, 0, -Math.PI / 2]];
  for (const [dx, dz, rot] of seats) F.add(b.level, 'dining-chair', cx + dx, cz + dz, rot);
  F.at(b, 0.5, 0.52, long ? 'chandelier' : 'pendant-light', 0, { y: long ? 1.71 : 1.415 });
  F.wall(b, 'n', 0.5, 'sideboard');
  F.wall(b, 's', 0.9, 'olive-tree');
}

function bathroom(F, b, shower = false) {
  const dx = b.x1 - b.x0; const dz = b.z1 - b.z0;
  const ranked = b.rect ? furnishingSides(F.p, b.rect, [b.rect]) : [];
  const long = ranked[0] ?? (dx >= dz ? 'n' : 'w');
  const open = (s) => b.open?.[s];
  const door = (s) => b.rect && sideHasDoor(F.p, b.rect, s);
  const ends = ['n', 'e', 's', 'w'].filter((s) => s !== long && !open(s) && !door(s));
  const endA = ends[0] ?? ['n', 'e', 's', 'w'].find((s) => s !== long && !open(s)) ?? OPPOSITE[long];
  const endB = ends.find((s) => s !== endA) ?? ['n', 'e', 's', 'w'].find((s) => s !== long && s !== endA && !open(s)) ?? OPPOSITE[endA];
  // A tub is 1.87 m wide, so in a short bath it takes the long wall alone; the basin and toilet stand on the ends.
  if (!shower && Math.min(dx, dz) < 2.6) {
    const ta = awayFrom(endA, long);
    const tb = awayFrom(endB, long);
    F.wall(b, long, 0.5, 'bathtub');
    F.wall(b, endA, ta, 'washbasin-vanity');
    F.wall(b, endA, ta, 'mirror-cabinet', { y: 1.15 });
    if (endB !== endA) F.wall(b, endB, tb, 'toilet');
    const rail = ['n', 'e', 's', 'w'].find((s) => s !== long && s !== endA && s !== endB && !open(s));
    if (rail) F.wall(b, rail, 0.5, 'towel-rail', { y: 1.15 });
    return;
  }
  // A shower shares the long wall with the basin; the toilet sits opposite, at the basin's end.
  if (shower && Math.min(dx, dz) < 2.6) {
    const far = fartherFromDoors(F.p, b.rect, [OPPOSITE[long], endA, endB].filter((s) => s && !open(s) && !door(s))) ?? endA;
    F.wall(b, long, 0.24, 'washbasin-vanity');
    F.wall(b, long, 0.24, 'mirror-cabinet', { y: 1.15 });
    F.wall(b, long, 0.78, 'shower-booth');
    F.wall(b, far, far === OPPOSITE[long] ? 0.22 : awayFrom(far, long), 'toilet');
    const rail = ['n', 'e', 's', 'w'].find((s) => s !== long && s !== far && !open(s));
    if (rail) F.wall(b, rail, 0.5, 'towel-rail', { y: 1.15 });
    return;
  }
  F.wall(b, 'n', 0.3, 'washbasin-vanity');
  F.wall(b, 'n', 0.3, 'mirror-cabinet', { y: 1.1 });
  F.wall(b, 'e', 0.3, 'toilet');
  if (shower) F.wall(b, 's', 0.25, 'shower-booth');
  else F.wall(b, 's', 0.55, 'bathtub');
  F.wall(b, 'w', 0.6, 'towel-rail', { y: 1.1 });
}

function office(F, b, side, lDesk = false) {
  F.wall(b, side, 0.4, lDesk ? 'desk-l' : 'desk');
  F.wall(b, side, 0.4, 'monitor', { y: 0.74, off: 0.15 });
  const across = side === 'n' || side === 's';
  F.at(b, across ? 0.4 : side === 'w' ? 0.3 : 0.7, across ? (side === 'n' ? 0.3 : 0.7) : 0.4, 'office-chair', ROT[side] + Math.PI);
  F.wall(b, OPPOSITE[side], 0.3, 'bookcase-cabinet');
  F.wall(b, OPPOSITE[side], 0.65, 'bookshelf');
  F.wall(b, side, 0.4, 'desk-lamp', { y: 0.74, off: 0.1, depth: 0.45 });
  F.wall(b, side, 0.88, 'olive-tree');
}

function dressing(F, b) {
  const back = b.rect ? (furnishingSides(F.p, b.rect, [b.rect])[0] ?? 'n') : 'n';
  const front = !b.open?.[OPPOSITE[back]] ? OPPOSITE[back] : ['s', 'n', 'e', 'w'].find((s) => s !== back && !b.open?.[s]) ?? 's';
  F.wall(b, back, 0.5, 'built-in-closet', { params: { width: Math.min(2.4, along(back, b) - 0.15) } });
  F.wall(b, front, 0.3, 'vanity-table');
  F.wall(b, front, 0.78, 'wall-mirror', { y: 1 });
  if (Math.min(b.x1 - b.x0, b.z1 - b.z0) > 1.9) F.at(b, 0.5, 0.55, 'ottoman');
}

function laundry(F, b) {
  F.wall(b, 'n', 0.22, 'washing-machine');
  F.wall(b, 'n', 0.5, 'dryer');
  F.wall(b, 's', 0.5, 'shelving-unit', { params: { width: Math.min(1, b.x1 - b.x0 - 0.2) } });
}

function entry(F, b) {
  const sides = b.rect ? furnishingSides(F.p, b.rect, [b.rect]) : ['w', 'e'];
  const shoe = sides[0] ?? 'w';
  const coat = sides.find((s) => s !== shoe) ?? OPPOSITE[shoe];
  F.wall(b, shoe, 0.5, 'shoe-cabinet', { params: { width: Math.min(1, along(shoe, b) - 0.3) } });
  if (!b.open?.[coat]) F.wall(b, coat, 0.25, 'coat-rack');
}

function reading(F, b) {
  F.at(b, 0.3, 0.45, 'lounge-chair', Math.PI * 0.8);
  F.at(b, 0.45, 0.35, 'side-table');
  F.at(b, 0.45, 0.35, 'table-lamp', 0, { y: 0.55 });
  F.wall(b, 'e', 0.3, 'bookshelf');
  F.wall(b, 'e', 0.7, 'bookshelf');
  F.at(b, 0.35, 0.5, 'rug', 0, { params: { shape: 'round', width: 1.6, depth: 1.6 } });
  F.wall(b, 'n', 0.12, 'monstera');
  F.wall(b, 's', 0.12, 'fiddle-leaf-fig');
}

function livingL(F, b) {
  // ㄱ자 sofa in the north-west corner, TV across, rug and table in the middle.
  // Tucked into the corner; its square footprint covers the corner, so the side table stands beside it.
  const lw = ITEMS.get('sectional-l-3x2-left')?.size?.[0] ?? 2.7;
  F.wall(b, 'n', (lw / 2 + 0.05) / (b.x1 - b.x0), 'sectional-l-3x2-left');
  F.at(b, 0.35, 0.5, 'rug', 0);
  F.add(b.level, 'side-table', b.x0 + lw + 0.35, b.z0 + 0.4, 0);
  F.wall(b, 's', 0.42, 'tv-console');
  F.wall(b, 's', 0.42, 'tv-55', { y: 0.5, off: 0.05 });
  F.wall(b, 'e', 0.2, 'floor-lamp-arc');
  F.wall(b, 'e', 0.85, 'monstera');
}

function nursery(F, b) {
  F.wall(b, 'n', 0.32, 'kids-crib-convertible');
  F.wall(b, 'n', 0.32, 'kids-mobile', { y: 1.0, off: 0.2 });
  F.wall(b, 'e', 0.3, 'kids-changing-table');
  F.at(b, 0.22, 0.72, 'kids-nursing-glider', Math.PI * 0.75);
  F.at(b, 0.55, 0.6, 'kids-play-mat-puzzle', 0);
  F.wall(b, 'w', 0.35, 'kids-toy-chest-bench');
}

function kitchenDining(F, b) {
  F.wall(b, 'n', 0.42, 'kitchen-sink-counter-long', { params: { width: Math.min(2.6, b.x1 - b.x0 - 1.1) } });
  F.wall(b, 'n', 0.92, 'refrigerator');
  F.at(b, 0.42, 0.66, 'dining-table-bistro', 0);
  F.at(b, 0.42, 0.66 - 0.6 / (b.z1 - b.z0), 'dining-chair', 0);
  F.at(b, 0.42, 0.66 + 0.6 / (b.z1 - b.z0), 'dining-chair', Math.PI);
  F.at(b, 0.42, 0.66, 'pendant-light', 0, { y: 1.415 });
}

function meetingRoom(F, b) {
  F.at(b, 0.5, 0.52, 'wp-conf-6', 0);
  const cx = (b.x0 + b.x1) / 2; const cz = b.z0 + (b.z1 - b.z0) * 0.52;
  for (const dx of [-0.6, 0, 0.6]) { F.add(b.level, 'wp-boardroom-chair', cx + dx, cz - 0.82, 0); F.add(b.level, 'wp-boardroom-chair', cx + dx, cz + 0.82, Math.PI); }
  F.wall(b, 'n', 0.5, 'wp-whiteboard-mobile');
  F.wall(b, 'e', 0.5, 'wp-video-cart');
  F.wall(b, 'w', 0.15, 'olive-tree');
}

function teamOffice(F, b) {
  F.at(b, 0.45, 0.5, 'wp-cluster-4', 0);
  F.wall(b, 'e', 0.25, 'wp-printer-station');
  F.wall(b, 's', 0.8, 'wp-lockers');
  F.wall(b, 'w', 0.3, 'wp-planter-divider');
  F.wall(b, 's', 0.12, 'monstera');
}

/** Height of an item (its default build). */
const heightOf = (id) => ITEMS.get(id)?.size?.[1] ?? 0;
/** A ceiling item hanging from a ceiling `H` metres up, at fractions (fx, fz) of the box. */
const ceil = (F, b, fx, fz, id, H, rotation = 0, params = {}) => F.at(b, fx, fz, id, rotation, { y: H - heightOf(id), params });
/** A small item standing on top of a piece of furniture `under` placed at (fx, fz). */
const onTop = (F, b, fx, fz, id, under, rotation = 0, params = {}) => F.at(b, fx, fz, id, rotation, { y: heightOf(under), params });

function openOffice(F, b) {
  const H = 2.4;
  F.at(b, 0.3, 0.42, 'wp-cluster-4', 0);
  F.at(b, 0.62, 0.42, 'wp-cluster-4', 0);
  for (const fx of [0.3, 0.62]) for (const dx of [-0.07, 0.07]) {
    onTop(F, b, fx + dx, 0.36, 'cmp-monitor-24-office', 'wp-cluster-4', 0);
    onTop(F, b, fx + dx, 0.48, 'cmp-monitor-24-office', 'wp-cluster-4', Math.PI);
  }
  F.wall(b, 'n', 0.12, 'wp-lateral-filing');
  F.wall(b, 'n', 0.5, 'ofp-cork-notice-board', { y: 1.1 });
  F.wall(b, 'n', 0.8, 'ofp-office-wall-clock', { y: 1.9 });
  F.wall(b, 'e', 0.18, 'ofp-water-cooler');
  F.wall(b, 'e', 0.45, 'wp-printer-station');
  F.wall(b, 'e', 0.78, 'ofp-recycling-bins-trio');
  F.wall(b, 'w', 0.5, 'ofp-mobile-double-whiteboard');
  F.wall(b, 's', 0.62, 'ofp-paper-shredder');
  F.wall(b, 's', 0.85, 'wp-lockers');
  F.wall(b, 's', 0.28, 'monstera');
  F.wall(b, 'e', 0.95, 'ofp-fire-extinguisher-stand');
  for (const fx of [0.2, 0.46, 0.72]) for (const fz of [0.3, 0.7]) ceil(F, b, fx, fz, 'lgx-led-panel-600', H);
  ceil(F, b, 0.95, 0.05, 'ofp-ip-camera-dome', H);
  ceil(F, b, 0.05, 0.95, 'ofp-ip-camera-dome', H);
}

function executiveOffice(F, b) {
  const H = 2.4;
  const fx = 0.48; const fz = 0.38;
  F.at(b, fx, fz, 'wp-manager-l', 0);
  const cx = b.x0 + (b.x1 - b.x0) * fx; const cz = b.z0 + (b.z1 - b.z0) * fz;
  const [dw, , dd] = ITEMS.get('wp-manager-l')?.size ?? [1.8, 0.75, 1.8];
  // Just outside the desk's footprint: one chair at the back, two in front of the return.
  F.add(b.level, 'wp-mesh-chair', cx - dw / 2 - 0.35, cz - 0.05, Math.PI / 2);
  F.add(b.level, 'wp-visitor-chair', cx - 0.45, cz + dd / 2 + 0.32, Math.PI);
  F.add(b.level, 'wp-visitor-chair', cx + 0.45, cz + dd / 2 + 0.32, Math.PI);
  onTop(F, b, 0.47, 0.3, 'cmp-aio-27-pro', 'wp-manager-l', 0);
  onTop(F, b, 0.6, 0.4, 'ofp-desk-name-plate', 'wp-manager-l', 0);
  onTop(F, b, 0.36, 0.38, 'ofp-ip-desk-phone', 'wp-manager-l', 0.3);
  F.wall(b, 'n', 0.5, 'wp-credenza');
  onTop(F, b, 0.5, 0.06, 'ofp-trophy-trio', 'wp-credenza', 0);
  F.wall(b, 'n', 0.2, 'ofp-award-plaques-wall', { y: 1.3 });
  F.wall(b, 'n', 0.8, 'ofp-framed-certificates', { y: 1.4 });
  F.wall(b, 'w', 0.62, 'wp-lounge-chair');
  F.wall(b, 'w', 0.85, 'wp-lounge-chair');
  F.wall(b, 'e', 0.15, 'olive-tree');
  F.wall(b, 'e', 0.6, 'ofp-office-safe');
  F.wall(b, 'e', 0.85, 'ofp-office-coat-stand');
  for (const fx of [0.3, 0.7]) for (const fz of [0.3, 0.7]) ceil(F, b, fx, fz, 'lgx-trimless-downlight', H);
}

function serverRoom(F, b) {
  const H = 3.0;
  F.at(b, 0.42, 0.5, 'srv-cold-aisle-pod', 0, { params: { racks: 4 } });
  F.wall(b, 'e', 0.28, 'srv-crac-downflow', { params: { modules: 2 } });
  F.wall(b, 'e', 0.74, 'srv-crac-downflow', { params: { modules: 2 } });
  F.wall(b, 'w', 0.15, 'srv-modular-ups-frame');
  F.wall(b, 'w', 0.45, 'srv-battery-string-rack', { params: { blocks: 6 } });
  F.wall(b, 'w', 0.85, 'srv-power-distribution-cabinet');
  F.wall(b, 'n', 0.12, 'srv-fire-suppression-cylinders');
  F.wall(b, 'n', 0.42, 'srv-fire-alarm-control-panel', { y: 1.2 });
  F.wall(b, 'n', 0.6, 'srv-emergency-power-off', { y: 1.3 });
  F.wall(b, 'n', 0.75, 'srv-aspirating-smoke-detector', { y: 1.5 });
  F.wall(b, 's', 0.62, 'srv-rack-patching');
  F.at(b, 0.86, 0.86, 'srv-kvm-crash-cart', -Math.PI / 2);
  for (const fz of [0.25, 0.75]) ceil(F, b, 0.42, fz, 'srv-ladder-cable-tray', H, 0, { length: 2.6 });
  for (const fx of [0.2, 0.42, 0.64]) ceil(F, b, fx, 0.5, 'srv-led-linear-light', H, Math.PI / 2, { length: 1.2 });
  ceil(F, b, 0.95, 0.06, 'srv-ptz-dome-camera', H);
}

function serverCloset(F, b) {
  const H = 3.0;
  F.wall(b, 'n', 0.28, 'srv-half-rack-24u');
  F.wall(b, 'n', 0.72, 'srv-rack-mixed', { params: { units: 42 } });
  F.wall(b, 'e', 0.4, 'srv-wall-cabinet-12u', { y: 1.3 });
  F.wall(b, 'w', 0.4, 'srv-wall-precision-ac', { y: 2.2 });
  F.wall(b, 'w', 0.82, 'srv-spare-parts-shelving', { params: { width: 0.8 } });
  F.wall(b, 's', 0.42, 'srv-esd-workbench', { params: { width: 1.4 } });
  F.at(b, 0.42, 0.62, 'wp-task-chair', Math.PI);
  F.wall(b, 's', 0.92, 'ofp-fire-extinguisher-stand');
  ceil(F, b, 0.5, 0.5, 'srv-led-linear-light', H, 0, { length: 1.2 });
}

function nocRoom(F, b) {
  const H = 2.4;
  F.wall(b, 'n', 0.5, 'srv-dcim-monitoring-wall', { y: 0.95, params: { cols: 4, rows: 2 } });
  F.at(b, 0.5, 0.46, 'srv-noc-console-desk', 0, { params: { positions: 3 } });
  for (const dx of [-0.18, 0, 0.18]) F.at(b, 0.5 + dx, 0.66, 'wp-task-chair', Math.PI);
  F.wall(b, 'e', 0.3, 'wp-lateral-filing');
  F.wall(b, 'e', 0.8, 'ofp-water-cooler');
  F.wall(b, 'w', 0.3, 'srv-wall-cabinet-9u', { y: 1.3 });
  F.wall(b, 'w', 0.7, 'ofp-wall-whiteboard', { y: 0.9 });
  F.wall(b, 's', 0.85, 'ofp-face-recognition-terminal', { y: 1.35 });
  for (const fx of [0.25, 0.5, 0.75]) ceil(F, b, fx, 0.7, 'lgx-led-panel-600', H, 0, { power: 0.6 });
  ceil(F, b, 0.05, 0.05, 'ofp-ip-camera-turret', H);
  ceil(F, b, 0.95, 0.95, 'ofp-ip-camera-fisheye', H);
}

/** Furnishes one room of a home by its kind. */
function furnish(F, r, rects, sample, index) {
  const b = inner(r, F.p);
  const sides = furnishingSides(F.p, r, rects);
  const studio = /studio/.test(sample.template);
  switch (r.key) {
    case 'living':
      if (studio) {
        // A studio: bed, desk and a small sofa in one room, each against a real wall.
        const bedSide = sides[0];
        const free = sides.filter((s) => s !== bedSide && !sideHasDoor(F.p, r, s));
        const sofaSide = free.find((s) => s === OPPOSITE[bedSide]) ?? free[0] ?? sides.find((s) => s !== bedSide) ?? bedSide;
        const deskSide = free.find((s) => s !== sofaSide) ?? sofaSide;
        const horiz = sofaSide === 'n' || sofaSide === 's';
        const lowDoor = sideHasDoor(F.p, r, horiz ? 'w' : 'n');
        const highDoor = sideHasDoor(F.p, r, horiz ? 'e' : 's');
        const sofaT = lowDoor && !highDoor ? 0.72 : highDoor && !lowDoor ? 0.28 : (sofaSide === OPPOSITE[bedSide] ? 0.5 : awayFrom(sofaSide, bedSide));
        F.wall(b, bedSide, 0.62, 'bed', { params: { bedSize: 'super-single' } });
        F.wall(b, deskSide, 0.35, 'desk');
        if (sofaSide !== bedSide) F.wall(b, sofaSide, sofaT, 'sofa-loveseat');
        F.at(b, 0.6, 0.5, 'rug', 0, { params: { width: 1.6, depth: 1.2 } });
        if (sample.style === 'modern') F.wall(b, bedSide, 0.16, 'wardrobe');
        return undefined;
      }
      return living(F, b, sides[0], index % 3);
    case 'bedroom': return bedroom(F, b, sides[0]);
    case 'bedroom2': return /49-b|84-b/.test(sample.id) ? kids(F, b, sides[0], false) : bedroom(F, b, sides[0], { single: true });
    case 'bedroom3': return /84-c/.test(sample.id) ? office(F, b, sides[0]) : kids(F, b, sides[0], true);
    case 'bedroom4': return office(F, b, sides[0]);
    case 'kids': return kids(F, b, sides[0], false);
    case 'kitchen': {
      const free = sides.filter((s) => !sideHasDoor(F.p, r, s));
      const run = [...(free.length ? free : sides)].sort((x, y) => along(y, b) - along(x, b))[0];
      return kitchen(F, b, run, false);
    }
    case 'dining': return dining(F, b);
    case 'bath': case 'bath2': return bathroom(F, b, index % 2 === 1 || b.z1 - b.z0 < 2.2);
    case 'office': return office(F, b, sides[0]);
    case 'dressing': return dressing(F, b);
    case 'laundry': case 'utility': return laundry(F, b);
    case 'entry': return entry(F, b);
    case 'room': return reading(F, b);
    default: return undefined;
  }
}

// ───────────────────────── doors: room to open them and to walk through

const itemOf = (id) => ITEMS.get(id) ?? null;
const HUBS = new Set(['living', 'kitchen', 'dining', 'hall', 'entry']);
const hitsAny = (polys, quad, depth) => polys.some((poly) => overlapDepth(poly, quad) > depth);
const SEAT = /chair|stool|bench/;
/** Stairs and structural columns never move to make room for a door. */
const FIXED = /^(stairs|column(-.*)?)$/;
const BIG = /bed|sofa|wardrobe|closet|refrigerator|kitchen|vanity|bathtub|shower|toilet|washing|dryer|desk|tv-console|island|bookcase|dresser|sideboard|dining-table|shoe-cabinet/;
const weightOf = (b) => {
  if (FIXED.test(b.o.item)) return 50;
  return BIG.test(b.o.item) ? 8 : 1;
};
const rectAt = (rects, level, [x, z]) =>rects.find((r) => r.level === level && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) ?? null;

/**
 * Makes every door of a furnished sample usable: each hinged door first gets the hinge side and
 * swing (into the room, entrance doors outwards) that keeps its leaf clear of furniture, walls
 * and other doors; furniture still in a swing or right in front of a doorway then slides along
 * its wall (with what stands on it) or, when there is no free place, is left out.
 */
function clearDoors(p, rects) {
  const walls = new Map(p.walls.map((w) => [w.id, w]));
  const swingOf = (o) => doorSwings({ openings: [o], walls: p.walls }, itemOf, walls)[0] ?? null;
  // 1. Hinge side and swing of each door.
  const done = [];
  for (const o of p.openings) {
    const first = swingOf(o);
    if (!first) continue;
    if (!first.leaves.length) { done.push(first); continue; }
    // Big pieces (and stairs, which never move) count more than a plant or a lamp.
    const blockers = doorBlockers(p, itemOf).filter((b) => b.o.level === first.wall.level).map((b) => ({ ...b, weight: weightOf(b) }));
    const entrance = /entrance|front/.test(o.item);
    const wall = first.wall;
    const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    const n = [-(wall.b[1] - wall.a[1]) / L, (wall.b[0] - wall.a[0]) / L];
    const roomsAt = (t) => [1, -1].map((s) => rectAt(rects, wall.level, [wall.a[0] + ((wall.b[0] - wall.a[0]) * t) / L + n[0] * s * 0.4, wall.a[1] + ((wall.b[1] - wall.a[1]) * t) / L + n[1] * s * 0.4]));
    const home = roomsAt(o.offset);
    const sameRooms = (t, w = o.width) => [t - w / 2 - 0.06, t, t + w / 2 + 0.06].every((x) => roomsAt(x).every((r, i) => r === home[i]));
    const free = (t, w = o.width) => p.openings.every((x) => x === o || x.wall !== o.wall || Math.abs(x.offset - t) > (x.width + w) / 2 + 0.1);
    const orient = (offset, width = o.width) => {
      let best = null;
      for (const side of ['left', 'right']) {
        for (const flip of [false, true]) {
          const d = swingOf({ ...o, side, flip, offset, width });
          let score = Math.abs(offset - o.offset) * 0.4;
          for (const b of blockers) { if (hitsAny(d.zones, b.quad, 0.01)) score += 3 * b.weight; else if (hitsAny(d.ways, b.quad, 0.02)) score += b.weight; }
          for (const w of p.walls) if (w.id !== o.wall && w.level === wall.level && hitsAny(d.sectors, wallQuad(w), 0.02)) score += 60;
          for (const e of done) if (e.wall.level === wall.level && d.sectors.some((s) => hitsAny(e.sectors, s, 0.02))) score += 60;
          // A step through this door must meet a floor, not the opening the stairs cut.
          if (overHole(offset, width)) score += 200;
          // Into the room (the private one between two rooms); entrance doors open outwards.
          const l = d.leaves[0];
          const cx = d.leaves.reduce((s, x) => s + x.hinge[0], 0) / d.leaves.length; const cz = d.leaves.reduce((s, x) => s + x.hinge[1], 0) / d.leaves.length;
          const into = rectAt(rects, wall.level, [cx + l.v[0] * 0.6, cz + l.v[1] * 0.6]);
          const back = rectAt(rects, wall.level, [cx - l.v[0] * 0.6, cz - l.v[1] * 0.6]);
          if (entrance) { if (into && !back) score += 2; } else if (!into) score += 2;
          else if (back && HUBS.has(into.key) && !HUBS.has(back.key)) score += 1.5;
          // The open leaf rests near a wall end rather than in the middle of the wall.
          score += Math.min(...[wall.a, wall.b].map((q) => Math.hypot(q[0] - l.hinge[0], q[1] - l.hinge[1]))) * 0.02;
          if (!best || score < best.score - 1e-9) best = { score, side, flip, offset, width, d };
        }
      }
      return best;
    };
    const overHole = (t, width = o.width) => {
      for (const along of [-width / 2, 0, width / 2]) {
        for (const s of [1, -1]) for (const dist of [0.35, 0.7]) {
          const at = t + along;
          const pt = [wall.a[0] + ((wall.b[0] - wall.a[0]) * at) / L + n[0] * s * dist, wall.a[1] + ((wall.b[1] - wall.a[1]) * at) / L + n[1] * s * dist];
          for (const room of p.rooms) {
            if (room.level !== wall.level || !pointInPolygon(pt, room.points)) continue;
            if (holePolygons(room.holes).some((h) => pointInPolygon(pt, h))) return true;
          }
        }
      }
      return false;
    };
    let best = orient(o.offset);
    // Still in the way of something, or standing over the stair opening: try the door elsewhere on its wall (between the same rooms,
    // clear of the other openings); moving it costs a little, so it stays put when nothing gains.
    // A door that still meets the stairs may also get a little narrower (down to 0.85 m).
    if (best.score >= 1) {
      for (const width of [o.width, 0.9, 0.85]) {
        if (width > o.width || (width < o.width && best.score < 50)) continue;
        for (let t = width / 2 + 0.12; t < L - width / 2 - 0.12; t += 0.05) {
          if ((Math.abs(t - o.offset) < 1e-6 && width === o.width) || !free(t, width) || !sameRooms(t, width)) continue;
          const c = orient(t, width);
          if (c.score < best.score - 1e-9) best = c;
        }
      }
    }
    o.side = best.side;
    o.flip = best.flip;
    o.offset = best.offset;
    o.width = best.width;
    done.push(best.d);
  }
  // 2. Furniture out of swings and doorways.
  const doors = done;
  const kept = new Set();
  const blocked = (quad, level) => doors.some((d) => d.wall.level === level && (hitsAny(d.zones, quad, 0.01) || hitsAny(d.ways, quad, 0.02)));
  for (let guard = 0; guard < 200; guard++) {
    const all = doorBlockers(p, itemOf);
    const mover = all.find((b) => !FIXED.test(b.o.item) && !kept.has(b.o) && blocked(b.quad, b.o.level));
    if (!mover) break;
    const o = mover.o;
    // What goes with it: things standing on it or hung above it, chairs tucked under it.
    const grown = mover.quad.map(([x, z]) => [x + Math.sign(x - o.position[0]) * 0.05, z + Math.sign(z - o.position[2]) * 0.05]);
    const group = p.objects.filter((x) => x === o || (x.level === o.level && ((x.position[1] > 0.03 || (itemOf(x.item)?.placement ?? 'floor') !== 'floor') && insideQuad([x.position[0], x.position[2]], grown))));
    for (const b of all) if (b.o !== o && b.o.level === o.level && !group.includes(b.o) && SEAT.test(b.o.item) && overlapDepth(b.quad, mover.quad) > 0.05) group.push(b.o);
    const members = new Set(group);
    const others = all.filter((b) => !members.has(b.o) && b.o.level === o.level);
    const room = rectAt(rects, o.level, [o.position[0], o.position[2]]);
    const box = room ? inner(room) : null;
    const ry = o.rotation[1];
    const axis = [Math.cos(ry), -Math.sin(ry)];
    const quads = all.filter((b) => members.has(b.o));
    let moved = false;
    for (let k = 1; k <= 60 && !moved; k++) {
      for (const s of [1, -1]) {
        const t = s * k * 0.05;
        const shift = (q) => q.map(([x, z]) => [x + axis[0] * t, z + axis[1] * t]);
        const ok = quads.every((b) => {
          const q = shift(b.quad);
          if (box && q.some(([x, z]) => x < box.x0 - 0.02 || x > box.x1 + 0.02 || z < box.z0 - 0.02 || z > box.z1 + 0.02)) return false;
          if (blocked(q, o.level)) return false;
          return !others.some((x) => overlapDepth(x.quad, q) > 0.02);
        });
        if (!ok) continue;
        for (const x of group) { x.position[0] += axis[0] * t; x.position[2] += axis[1] * t; }
        moved = true;
        break;
      }
    }
    if (moved) continue;
    // Big pieces only in front of a doorway (not in a swing) stay: the passage is a hint, the piece is not optional.
    if (weightOf(mover) > 1 && !doors.some((d) => d.wall.level === o.level && hitsAny(d.zones, mover.quad, 0.01))) { kept.add(o); continue; }
    p.objects = p.objects.filter((x) => !members.has(x));
  }
}

function insideQuad(pt, quad) {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]; const b = quad[(i + 1) % quad.length];
    const c = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
    if (Math.abs(c) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/**
 * Builds a sample (or null for an unknown id). `doors: false` leaves the doors and furniture as
 * the rules placed them (without making room for the doors; tests compare the two).
 */
export function buildSampleProject(id, language = 'ko', { doors = true } = {}) {
  const sample = SAMPLE_PROJECTS.find((s) => s.id === id);
  if (!sample) return null;
  const lang = language === 'en' ? 'en' : 'ko';
  const names = (k) => NAMES[lang][k] ?? k;
  const p = sample.plan ? buildPlan(sample.plan, { language: lang, name: sample[lang][0] }) : buildTemplate(sample.template, { name: sample[lang][0], names });
  const style = STYLES[sample.style] ?? STYLES.modern;
  const F = new Furnisher(p, style);
  const rects = p.rects ?? [];
  // Finishes of the style: floors of the living spaces and bedrooms, wall paint (bathrooms keep their tiles).
  for (const room of p.rooms) if (['living', 'bedroom', 'bedroom2', 'bedroom3', 'bedroom4', 'dining', 'office', 'room', 'kids'].includes(room.key)) room.floor = style.floor;
  for (const w of p.walls) w.material = { left: w.material?.left ?? style.wall, right: w.material?.right ?? style.wall };
  const index = SAMPLE_PROJECTS.indexOf(sample);
  if (sample.group === 'rooms') {
    const b = inner(rects[0], p);
    switch (sample.id) {
      case 'living-modern': living(F, b, 'n', 0); break;
      case 'living-scandi': living(F, b, 'n', 2); break;
      case 'living-classic': living(F, b, 'n', 0); break;
      case 'living-corner': living(F, b, 'n', 1); break;
      case 'bedroom-cozy': case 'bedroom-modern': bedroom(F, b, 'n'); break;
      case 'bedroom-guest': bedroom(F, b, 'n', { single: true }); break;
      case 'kids-pastel': kids(F, b, 'n', false); break;
      case 'kids-bunk': kids(F, b, 'n', true); break;
      case 'kitchen-galley': kitchen(F, b, 'n', false); break;
      case 'kitchen-island': kitchen(F, b, 'n', true); break;
      case 'dining-round': dining(F, b, false); break;
      case 'dining-long': dining(F, b, true); break;
      case 'bathroom-spa': bathroom(F, b, false); break;
      case 'bathroom-shower': bathroom(F, b, true); break;
      case 'study': office(F, b, 'n'); break;
      case 'home-office': office(F, b, 'n', true); break;
      case 'dressing-room': dressing(F, b); break;
      case 'laundry-room': laundry(F, b); break;
      case 'reading-nook': reading(F, b); break;
      case 'living-l-sofa': livingL(F, b); break;
      case 'nursery': nursery(F, b); break;
      case 'kitchen-dining': kitchenDining(F, b); break;
      case 'meeting-room': meetingRoom(F, b); break;
      case 'team-office': teamOffice(F, b); break;
      case 'open-office': openOffice(F, b); break;
      case 'executive-office': executiveOffice(F, b); break;
      case 'server-room': serverRoom(F, b); break;
      case 'server-closet': serverCloset(F, b); break;
      case 'noc-room': nocRoom(F, b); break;
      default: break;
    }
  } else if (!sample.plan || sample.furnish) {
    for (const r of rects) if (!sample.plan || LIGHT_KEYS.has(r.key)) furnish(F, r, rects, sample, index);
  }
  if (doors) clearDoors(p, rects);
  p.style.lightsOn = false;
  return p;
}
