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
  // ── 25 rooms
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
  ko: { room: '방', living: '거실', bedroom: '안방', bedroom2: '침실 2', bedroom3: '침실 3', bedroom4: '침실 4', kitchen: '주방', bath: '욕실', bath2: '욕실 2', office: '서재', entry: '현관', kids: '아이 방', dining: '식당', dressing: '드레스룸', laundry: '다용도실', utility: '다용도실', hall: '복도' },
  en: { room: 'Room', living: 'Living room', bedroom: 'Master bedroom', bedroom2: 'Bedroom 2', bedroom3: 'Bedroom 3', bedroom4: 'Bedroom 4', kitchen: 'Kitchen', bath: 'Bathroom', bath2: 'Bathroom 2', office: 'Study', entry: 'Entrance', kids: 'Kids room', dining: 'Dining room', dressing: 'Dressing room', laundry: 'Laundry', utility: 'Utility room', hall: 'Hall' },
};

// ───────────────────────── placing

const ROT = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
const OPPOSITE = { n: 's', s: 'n', w: 'e', e: 'w' };

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

  /** Against side n (−z) / s (+z) / w (−x) / e (+x) of a box; `t` along it; the item's depth from its size. */
  wall(b, side, t, item, { depth, off = 0, y = 0, params = {} } = {}) {
    const d = depth ?? ITEMS.get(item)?.size?.[2] ?? 0.5;
    const gap = 0.03 + off;
    const at = (lo, hi) => lo + (hi - lo) * t;
    if (side === 'n') this.add(b.level, item, at(b.x0, b.x1), b.z0 + d / 2 + gap, ROT.n, { y, params });
    else if (side === 's') this.add(b.level, item, at(b.x0, b.x1), b.z1 - d / 2 - gap, ROT.s, { y, params });
    else if (side === 'w') this.add(b.level, item, b.x0 + d / 2 + gap, at(b.z0, b.z1), ROT.w, { y, params });
    else this.add(b.level, item, b.x1 - d / 2 - gap, at(b.z0, b.z1), ROT.e, { y, params });
  }

  at(b, fx, fz, item, rotation = 0, options = {}) {
    this.add(b.level, item, b.x0 + (b.x1 - b.x0) * fx, b.z0 + (b.z1 - b.z0) * fz, rotation, options);
  }
}

/** The room's box shrunk to the inside faces of its walls. */
const inner = (r) => ({ level: r.level, key: r.key, x0: r.x0 + 0.13, z0: r.z0 + 0.13, x1: r.x1 - 0.13, z1: r.z1 - 0.13 });
const along = (side, b) => (side === 'n' || side === 's' ? b.x1 - b.x0 : b.z1 - b.z0);

/** Sides of a room that face other rooms (inside walls) first, longest first. */
function insideSides(r, rects) {
  const others = rects.filter((o) => o !== r && o.level === r.level);
  const touch = (side) => others.some((o) => (side === 'n' ? Math.abs(o.z1 - r.z0) < 1e-6 : side === 's' ? Math.abs(o.z0 - r.z1) < 1e-6 : side === 'w' ? Math.abs(o.x1 - r.x0) < 1e-6 : Math.abs(o.x0 - r.x1) < 1e-6)
    && (side === 'n' || side === 's' ? Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0) > 0.5 : Math.min(o.z1, r.z1) - Math.max(o.z0, r.z0) > 0.5));
  return ['n', 'w', 'e', 's'].sort((a, b) => Number(touch(b)) - Number(touch(a)) || along(b, r) - along(a, r));
}

// ───────────────────────── rooms by kind

function living(F, b, side, variant = 0) {
  const op = OPPOSITE[side];
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
  F.at(b, ...pt(0.55, variant === 1 ? 0.62 : 0.45), 'coffee-table', ROT[side]);
  F.at(b, ...pt(0.15, 0.55), variant === 2 ? 'lounge-chair' : 'armchair', ROT[side] + Math.PI / 2);
  F.wall(b, op, 0.5, 'tv-console');
  F.wall(b, op, 0.5, 'tv', { y: 0.5, off: 0.1 });
  if (variant !== 1) F.wall(b, side, 0.86, 'floor-lamp-tripod');
  else if (lampAt < 0.97) F.wall(b, side, lampAt, 'floor-lamp-arc');
  F.wall(b, side, Math.min(0.1, (plant / 2) / len), 'monstera', { off: -0.15 });
  F.wall(b, side, 0.5, 'wall-art', { y: 1.3 });
  F.at(b, ...pt(0.5, 0.45), 'pendant-light', 0, { y: 1.415 });
  F.at(b, ...pt(0.52, 0.45), 'vase-stems', 0, { y: 0.4 });
  F.wall(b, op, 0.1, 'fiddle-leaf-fig');
  F.wall(b, op, 0.88, 'bookshelf');
}

function bedroom(F, b, side, { single = false } = {}) {
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
  if (deep >= bl + 0.6 + 0.7) {
    F.wall(b, op, 0.3, 'wardrobe');
    F.wall(b, op, 0.78, single ? 'desk' : 'dresser');
  } else {
    const sideWall = side === 'n' || side === 's' ? 'w' : 'n';
    const tFoot = side === 's' || side === 'e' ? 0.2 : 0.8;
    const room = along(sideWall, b) * (1 - tFoot) - 0.05;
    if (along(op, b) / 2 - bw / 2 > 0.65 || room > 1.1) F.wall(b, sideWall, tFoot, 'wardrobe');
  }
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
  // Fridge at one end, a sink counter, base cabinets with a hob under the hood, wall cabinets above.
  F.wall(b, side, 0.48 / len, 'refrigerator');
  let at = 0.98;
  const place = (item, width, options) => { if (at + width > len - 0.02) return false; F.wall(b, side, (at + width / 2) / len, item, options); at += width; return true; };
  place('kitchen-base-cabinet', 0.6);
  if (place('kitchen-sink-counter', 1.8)) F.wall(b, side, (at - 0.9) / len, 'kitchen-wall-cabinet', { y: 1.45 });
  const hob = at + 0.3;
  if (place('kitchen-base-cabinet', 0.6)) { F.wall(b, side, hob / len, 'cooktop', { y: 0.85, off: 0.04 }); F.wall(b, side, hob / len, 'range-hood', { y: 1.55 }); }
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
  F.wall(b, 'n', 0.3, 'washbasin-vanity');
  F.wall(b, 'n', 0.3, 'mirror-cabinet', { y: 1.1 });
  F.wall(b, 'e', 0.3, 'toilet');
  if (shower) F.wall(b, 's', 0.25, 'shower-booth');
  else F.wall(b, 's', 0.55, 'bathtub');
  F.wall(b, 'w', 0.6, 'towel-rail', { y: 0.5 });
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
  F.wall(b, 'n', 0.5, 'built-in-closet', { params: { width: Math.min(2.4, b.x1 - b.x0 - 0.1) } });
  F.wall(b, 's', 0.3, 'vanity-table');
  F.wall(b, 's', 0.8, 'wall-mirror', { y: 1 });
  F.at(b, 0.5, 0.55, 'ottoman');
}

function laundry(F, b) {
  F.wall(b, 'n', 0.22, 'washing-machine');
  F.wall(b, 'n', 0.5, 'dryer');
  F.wall(b, 's', 0.5, 'shelving-unit', { params: { width: Math.min(1, b.x1 - b.x0 - 0.2) } });
}

function entry(F, b) {
  F.wall(b, 'w', 0.5, 'shoe-cabinet', { params: { width: Math.min(1, b.z1 - b.z0 - 0.3) } });
  F.wall(b, 'e', 0.25, 'coat-rack');
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

/** Furnishes one room of a home by its kind. */
function furnish(F, r, rects, sample, index) {
  const b = inner(r);
  const sides = insideSides(r, rects);
  const studio = /studio/.test(sample.template);
  switch (r.key) {
    case 'living':
      if (studio) {
        // A studio: bed, desk and a small sofa in one room.
        F.wall(b, sides[0], 0.25, 'bed', { params: { bedSize: 'super-single' } });
        F.wall(b, OPPOSITE[sides[0]], 0.3, 'desk');
        F.wall(b, OPPOSITE[sides[0]], 0.75, 'sofa-loveseat');
        F.at(b, 0.6, 0.5, 'rug', 0, { params: { width: 1.6, depth: 1.2 } });
        if (sample.style === 'modern') F.wall(b, sides[0], 0.75, 'wardrobe');
        return undefined;
      }
      return living(F, b, sides[0], index % 3);
    case 'bedroom': return bedroom(F, b, sides[0]);
    case 'bedroom2': return /49-b|84-b/.test(sample.id) ? kids(F, b, sides[0], false) : bedroom(F, b, sides[0], { single: true });
    case 'bedroom3': return /84-c/.test(sample.id) ? office(F, b, sides[0]) : kids(F, b, sides[0], true);
    case 'bedroom4': return office(F, b, sides[0]);
    case 'kids': return kids(F, b, sides[0], false);
    case 'kitchen': return kitchen(F, b, [...sides].sort((x, y) => along(y, b) - along(x, b))[0], false);
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
    let best = orient(o.offset);
    // Still in the way of something: try the door elsewhere on its wall (between the same rooms,
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
    const b = inner(rects[0]);
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
      default: break;
    }
  } else if (!sample.plan || sample.furnish) {
    for (const r of rects) if (!sample.plan || LIGHT_KEYS.has(r.key)) furnish(F, r, rects, sample, index);
  }
  if (doors) clearDoors(p, rects);
  p.style.lightsOn = false;
  return p;
}
