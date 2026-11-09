// Common floor plans for the start page's "Floor plans" samples (samples.js): Korean apartments
// (59·74·84·114㎡, flat 판상형 and tower 타워형 types), officetel, studio, two-room villa, detached
// houses, a small office, a shop/café, a clinic and a classroom. Each is a list of room rectangles
// per level (the format of templates.js PLANS), so walls, doors, windows and rooms are derived the
// same way; commercial plans also get structural columns (planedit.js) at their corners and bays.
// Pure (no three); `npm run samples` writes them to samples/.
import { buildPlanProject } from './templates.js';

/** Columns at the corners of a W × D outline and every `bay` metres along its long sides. */
function frame(w, d, bay, size = 0.5) {
  const out = [];
  const nx = Math.max(1, Math.round(w / bay));
  for (let i = 0; i <= nx; i++) out.push([Math.round((w * i) / nx * 1000) / 1000, 0, size], [Math.round((w * i) / nx * 1000) / 1000, d, size]);
  return out;
}

/** Plans: id → { plan: [level specs], ko, en (name, description), icon, area (m², nominal) }. */
export const PLANS = {
  'apt59-flat': {
    icon: 'plan2d', area: 59,
    ko: ['59㎡ 아파트 (판상형)', '방 3 · 욕실 1 · 3베이, 앞뒤로 트인 평면'],
    en: ['59 m² apartment (flat type)', '3 bedrooms, 1 bath, 3 bays, through ventilation'],
    plan: [{ rects: [['bedroom', 0, 0, 3.3, 3.6], ['living', 3.3, 0, 7.2, 3.6], ['bedroom2', 7.2, 0, 10.2, 3.6], ['bedroom3', 0, 3.6, 3.0, 6.0], ['kitchen', 3.0, 3.6, 6.6, 6.0], ['entry', 6.6, 3.6, 8.1, 6.0], ['bath', 8.1, 3.6, 10.2, 6.0]], open: [['living', 'kitchen']], entrance: 'entry' }],
  },
  'apt59-tower': {
    icon: 'plan2d', area: 59,
    ko: ['59㎡ 아파트 (타워형)', '방 2 · 욕실 1 · 거실이 모서리에서 두 면으로 트인 ㄱ자 평면'],
    en: ['59 m² apartment (tower type)', '2 bedrooms, 1 bath, L-shaped with a corner living room'],
    plan: [{ rects: [['living', 0, 0, 4.2, 4.5], ['bedroom', 4.2, 0, 7.5, 3.6], ['bath', 7.5, 0, 9.3, 3.6], ['kitchen', 4.2, 3.6, 7.5, 6.0], ['entry', 7.5, 3.6, 9.3, 6.0], ['bedroom2', 0, 4.5, 3.3, 7.8]], open: [['living', 'kitchen']], entrance: 'entry' }],
  },
  'apt74-flat': {
    icon: 'plan2d', area: 74,
    ko: ['74㎡ 아파트 (판상형)', '방 3 · 욕실 2 · 3베이'],
    en: ['74 m² apartment (flat type)', '3 bedrooms, 2 baths, 3 bays'],
    plan: [{ rects: [['bedroom', 0, 0, 3.6, 4.2], ['living', 3.6, 0, 7.8, 4.2], ['bedroom2', 7.8, 0, 11.1, 3.6], ['bath2', 0, 4.2, 2.1, 6.6], ['bedroom3', 2.1, 4.2, 5.1, 6.6], ['kitchen', 5.1, 4.2, 8.4, 6.6], ['entry', 8.4, 3.6, 9.6, 6.6], ['bath', 9.6, 3.6, 11.1, 6.6]], open: [['living', 'kitchen']], entrance: 'entry' }],
  },
  'apt74-tower': {
    icon: 'plan2d', area: 74,
    ko: ['74㎡ 아파트 (타워형)', '방 3 · 욕실 1 · 모서리 거실, 날개 쪽 침실'],
    en: ['74 m² apartment (tower type)', '3 bedrooms, 1 bath, corner living room, bedroom wing'],
    plan: [{ rects: [['living', 0, 0, 4.5, 4.8], ['kitchen', 4.5, 0, 7.8, 3.6], ['bedroom', 7.8, 0, 10.8, 3.6], ['hall', 4.5, 3.6, 9.0, 4.8], ['bath', 9.0, 3.6, 10.8, 6.0], ['entry', 7.2, 4.8, 9.0, 6.0], ['bedroom2', 0, 4.8, 3.6, 7.8], ['bedroom3', 3.6, 4.8, 7.2, 7.8]], open: [['living', 'kitchen'], ['hall', 'kitchen'], ['hall', 'entry']], entrance: 'entry' }],
  },
  'apt84-flat': {
    icon: 'plan2d', area: 84,
    ko: ['84㎡ 아파트 (판상형)', '방 3 · 욕실 2 · 4베이, 드레스룸·다용도실'],
    en: ['84 m² apartment (flat type)', '3 bedrooms, 2 baths, 4 bays, dressing room, utility'],
    plan: [{ rects: [['bedroom2', 0, 0, 3.0, 4.2], ['living', 3.0, 0, 7.2, 4.2], ['bedroom', 7.2, 0, 10.8, 4.2], ['bedroom3', 10.8, 0, 13.5, 4.2], ['bath2', 0, 4.2, 2.1, 6.0], ['utility', 0, 6.0, 2.1, 7.2], ['kitchen', 2.1, 4.2, 6.6, 7.2], ['hall', 6.6, 4.2, 13.5, 5.4], ['dressing', 6.6, 5.4, 8.7, 7.2], ['bath', 8.7, 5.4, 10.8, 7.2], ['entry', 10.8, 5.4, 13.5, 7.2]], open: [['living', 'kitchen'], ['hall', 'entry']], entrance: 'entry' }],
  },
  'apt84-3bay': {
    icon: 'plan2d', area: 84,
    ko: ['84㎡ 아파트 (3베이)', '방 3 · 욕실 2 · 3베이 판상형, 복도형 뒷부분'],
    en: ['84 m² apartment (3 bays)', '3 bedrooms, 2 baths, 3-bay flat type with a back hall'],
    plan: [{ rects: [['bedroom2', 0, 0, 3.3, 4.2], ['living', 3.3, 0, 7.8, 4.2], ['bedroom', 7.8, 0, 11.4, 4.2], ['bedroom3', 0, 4.2, 3.3, 7.5], ['kitchen', 3.3, 4.2, 6.9, 7.5], ['hall', 6.9, 4.2, 11.4, 5.4], ['bath2', 6.9, 5.4, 8.7, 7.5], ['bath', 8.7, 5.4, 10.2, 7.5], ['entry', 10.2, 5.4, 11.4, 7.5]], open: [['living', 'kitchen'], ['hall', 'entry']], entrance: 'entry' }],
  },
  'apt84-tower': {
    icon: 'plan2d', area: 84,
    ko: ['84㎡ 아파트 (타워형)', '방 3 · 욕실 2 · 모서리 거실이 두 면으로 트인 평면'],
    en: ['84 m² apartment (tower type)', '3 bedrooms, 2 baths, corner living room open on two sides'],
    plan: [{ rects: [['living', 0, 0, 5.1, 5.4], ['bedroom', 5.1, 0, 8.7, 4.2], ['bath2', 8.7, 0, 10.5, 2.4], ['dressing', 8.7, 2.4, 10.5, 4.2], ['hall', 5.1, 4.2, 10.5, 5.4], ['kitchen', 0, 5.4, 3.9, 8.4], ['bedroom2', 3.9, 5.4, 7.2, 8.4], ['bath', 7.2, 5.4, 9.0, 7.8], ['entry', 9.0, 5.4, 10.5, 7.8], ['bedroom3', 0, 8.4, 3.9, 11.4]], open: [['living', 'kitchen'], ['hall', 'entry']], entrance: 'entry' }],
  },
  'apt114-flat': {
    icon: 'plan2d', area: 114,
    ko: ['114㎡ 아파트 (판상형)', '방 4 · 욕실 2 · 4베이, 넓은 주방·식당·복도'],
    en: ['114 m² apartment (flat type)', '4 bedrooms, 2 baths, 4 bays, large kitchen-dining'],
    plan: [{ rects: [['bedroom2', 0, 0, 3.3, 4.5], ['living', 3.3, 0, 8.4, 4.5], ['bedroom', 8.4, 0, 12.3, 4.5], ['bedroom3', 12.3, 0, 15.3, 4.5], ['bedroom4', 0, 4.5, 3.3, 7.5], ['utility', 0, 7.5, 3.3, 8.7], ['kitchen', 3.3, 4.5, 7.2, 8.7], ['dining', 7.2, 4.5, 9.6, 8.7], ['hall', 9.6, 4.5, 15.3, 5.7], ['bath', 9.6, 5.7, 11.7, 8.7], ['bath2', 11.7, 5.7, 13.5, 8.7], ['entry', 13.5, 5.7, 15.3, 8.7]], open: [['living', 'kitchen'], ['kitchen', 'dining'], ['living', 'dining'], ['hall', 'entry']], entrance: 'entry' }],
  },
  officetel: {
    icon: 'floorTool', area: 33,
    ko: ['오피스텔 (분리형)', '침실 분리 1.5룸 · 주방·욕실·현관'],
    en: ['Officetel (separate bedroom)', '1.5 rooms with a kitchen, bath and entrance'],
    plan: [{ rects: [['entry', 0, 0, 1.8, 1.6], ['bath', 0, 1.6, 1.8, 4.2], ['living', 1.8, 0, 5.6, 4.2], ['bedroom', 5.6, 0, 8.4, 4.2]], open: [['entry', 'living']], entrance: 'entry' }],
  },
  studio: {
    icon: 'floorTool', area: 26,
    ko: ['원룸', '방 하나에 주방 · 욕실 · 현관'],
    en: ['Studio', 'One room with a kitchen line, bath and entrance'],
    plan: [{ rects: [['bath', 0, 0, 2.1, 2.4], ['entry', 0, 2.4, 2.1, 4.8], ['living', 2.1, 0, 6.3, 4.8]], open: [['entry', 'living']], entrance: 'entry' }],
  },
  villa: {
    icon: 'plan2d', area: 46,
    ko: ['빌라 투룸', '방 2 · 거실 겸 주방 · 욕실 · 현관'],
    en: ['Two-room villa', '2 bedrooms, living-kitchen, bath, entrance'],
    plan: [{ rects: [['bedroom', 0, 0, 3.3, 3.6], ['living', 3.3, 0, 7.5, 3.6], ['bedroom2', 0, 3.6, 3.0, 6.6], ['kitchen', 3.0, 3.6, 5.4, 6.6], ['bath', 5.4, 3.6, 7.5, 5.1], ['entry', 5.4, 5.1, 7.5, 6.6]], open: [['living', 'kitchen']], entrance: 'entry' }],
  },
  'villa-3room': {
    icon: 'plan2d', area: 65,
    ko: ['빌라 쓰리룸', '방 3 · 거실·주방 · 욕실 · 다용도실'],
    en: ['Three-room villa', '3 bedrooms, living-kitchen, bath, utility'],
    plan: [{ rects: [['bedroom', 0, 0, 3.3, 3.9], ['living', 3.3, 0, 6.6, 3.9], ['bedroom2', 6.6, 0, 9.0, 3.9], ['bedroom3', 0, 3.9, 3.0, 7.2], ['kitchen', 3.0, 3.9, 6.0, 7.2], ['bath', 6.0, 3.9, 7.8, 5.7], ['entry', 6.0, 5.7, 7.8, 7.2], ['utility', 7.8, 3.9, 9.0, 7.2]], open: [['living', 'kitchen']], entrance: 'entry' }],
  },
  'house-1f': {
    icon: 'libStructure', area: 98,
    ko: ['단독주택 (단층)', '방 3 · 욕실 · 거실·식당·주방 · 복도'],
    en: ['Detached house (single storey)', '3 bedrooms, bath, living, dining, kitchen, hall'],
    plan: [{ rects: [['living', 0, 0, 5.4, 4.8], ['dining', 5.4, 0, 8.4, 4.8], ['kitchen', 8.4, 0, 11.4, 4.8], ['bedroom', 0, 4.8, 4.2, 8.7], ['hall', 4.2, 4.8, 11.4, 6.0], ['bath', 4.2, 6.0, 6.3, 8.7], ['bedroom2', 6.3, 6.0, 9.0, 8.7], ['bedroom3', 9.0, 6.0, 11.4, 8.7]], open: [['living', 'dining'], ['dining', 'kitchen']], entrance: 'hall' }],
  },
  'house-2f': {
    icon: 'stairsTool', area: 132,
    ko: ['단독주택 (2층)', '1층 거실·주방·서재, 2층 침실 3 · 계단'],
    en: ['Detached house (two storeys)', 'Ground: living, kitchen, study; upper: 3 bedrooms; stairs'],
    plan: [
      { name: '1F', rects: [['living', 0, 0, 5.4, 4.8], ['kitchen', 5.4, 0, 9.6, 4.8], ['hall', 0, 4.8, 3.0, 8.1], ['bath', 3.0, 4.8, 5.1, 8.1], ['office', 5.1, 4.8, 9.6, 8.1]], open: [['living', 'kitchen'], ['hall', 'living']], entrance: 'hall', stairs: { room: 'hall' } },
      { name: '2F', rects: [['bedroom', 0, 0, 4.8, 4.8], ['bedroom2', 4.8, 0, 9.6, 4.8], ['hall', 0, 4.8, 3.0, 8.1], ['bath2', 3.0, 4.8, 5.1, 8.1], ['bedroom3', 5.1, 4.8, 9.6, 8.1]], open: [], stairwell: 'hall' },
    ],
  },
  'small-office': {
    icon: 'libWorkplace', area: 108,
    ko: ['소형 사무실', '안내·업무 공간·대표실·회의실·탕비실·화장실 · 기둥 6개'],
    en: ['Small office', 'Reception, open work area, director, meeting, pantry, toilet; 6 columns'],
    plan: [{ rects: [['reception', 0, 0, 4, 4], ['openoffice', 4, 0, 12, 6], ['meeting', 0, 4, 4, 9], ['pantry', 4, 6, 6.5, 9], ['toilet', 6.5, 6, 8, 9], ['director', 8, 6, 12, 9]], open: [['reception', 'openoffice']], entrance: 'reception', columns: [[0, 0], [4, 0], [12, 0], [0, 9], [8, 9], [12, 9]] }],
  },
  cafe: {
    icon: 'libDining', area: 77,
    ko: ['상가·카페', '매장·계산대·주방 창고·화장실 · 큰 앞 유리창 · 기둥'],
    en: ['Shop / café', 'Sales floor, counter, storage, toilet; big shop window; columns'],
    plan: [{ rects: [['hall2', 0, 0, 9, 6], ['counter', 0, 6, 5, 8.5], ['storage', 5, 6, 7.5, 8.5], ['toilet', 7.5, 6, 9, 8.5]], open: [['hall2', 'counter']], entrance: 'hall2', columns: frame(9, 8.5, 4.5, 0.5) }],
  },
  clinic: {
    icon: 'libOffice', area: 134,
    ko: ['의원 (클리닉)', '대기실·접수 · 진료실 2 · 처치실 · 직원실 · 화장실 2 · 기둥'],
    en: ['Clinic', 'Waiting & reception, 2 consulting rooms, treatment, staff room, 2 toilets; columns'],
    plan: [{ rects: [['waiting', 0, 0, 7.2, 5.4], ['consult', 7.2, 0, 10.8, 3.6], ['consult2', 10.8, 0, 14.4, 3.6], ['corridor', 7.2, 3.6, 14.4, 5.4], ['treatment', 0, 5.4, 4.8, 9.3], ['prep', 4.8, 5.4, 7.2, 9.3], ['toilet', 7.2, 5.4, 9.0, 9.3], ['toilet2', 9.0, 5.4, 10.8, 9.3], ['storage', 10.8, 5.4, 14.4, 9.3]], open: [['waiting', 'corridor']], entrance: 'waiting', columns: [[0, 0], [7.2, 0], [14.4, 0], [0, 9.3], [7.2, 9.3], [14.4, 9.3]] }],
  },
  academy: {
    icon: 'libOffice', area: 134,
    ko: ['학원', '안내·상담실 · 강의실 2 · 원장실 · 강사실 · 화장실 2 · 창고 · 복도 · 기둥'],
    en: ['Academy (tutoring school)', 'Reception, counselling, 2 classrooms, director, staff room, 2 toilets, storage, corridor; columns'],
    plan: [{ rects: [['reception', 0, 0, 4.5, 5.4], ['meeting', 0, 5.4, 4.5, 8.1], ['classroom', 4.5, 0, 9.0, 3.6], ['classroom2', 9.0, 0, 13.5, 3.6], ['director', 13.5, 0, 16.5, 3.6], ['corridor', 4.5, 3.6, 16.5, 5.4], ['prep', 4.5, 5.4, 9.0, 8.1], ['toilet', 9.0, 5.4, 10.8, 8.1], ['toilet2', 10.8, 5.4, 12.6, 8.1], ['storage', 12.6, 5.4, 16.5, 8.1]], open: [['reception', 'corridor']], entrance: 'reception', columns: [[0, 0], [9.0, 0], [16.5, 0], [0, 8.1], [9.0, 8.1], [16.5, 8.1]] }],
  },
  classroom: {
    icon: 'libKids', area: 160,
    ko: ['교실 (학교)', '교실 2 · 준비실 · 복도 · 기둥 간격 8.1m'],
    en: ['Classrooms (school)', '2 classrooms, a prep room and the corridor; 8.1 m column bays'],
    plan: [{ rects: [['classroom', 0, 0, 8.1, 7.5], ['prep', 8.1, 0, 10.8, 7.5], ['classroom2', 10.8, 0, 18.9, 7.5], ['corridor', 0, 7.5, 18.9, 9.9]], open: [], entrance: 'corridor', columns: [[0, 0], [8.1, 0], [10.8, 0], [18.9, 0], [0, 7.5], [8.1, 7.5], [10.8, 7.5], [18.9, 7.5]] }],
  },
};

/** Room names of the plans (keys of templates.js KINDS). */
export const PLAN_NAMES = {
  ko: { room: '방', living: '거실', bedroom: '안방', bedroom2: '침실 2', bedroom3: '침실 3', bedroom4: '침실 4', kitchen: '주방', dining: '식당', bath: '욕실', bath2: '부부 욕실', office: '서재', entry: '현관', kids: '아이 방', dressing: '드레스룸', laundry: '세탁실', utility: '다용도실', hall: '홀', reception: '안내', openoffice: '업무 공간', meeting: '회의실', director: '대표실', pantry: '탕비실', toilet: '화장실', toilet2: '화장실 2', storage: '창고', hall2: '매장', counter: '계산대', waiting: '대기실·접수', corridor: '복도', consult: '진료실 1', consult2: '진료실 2', treatment: '처치실', classroom: '교실 1', classroom2: '교실 2', prep: '준비실', lobby: '로비', stair: '계단실' },
  en: { room: 'Room', living: 'Living room', bedroom: 'Master bedroom', bedroom2: 'Bedroom 2', bedroom3: 'Bedroom 3', bedroom4: 'Bedroom 4', kitchen: 'Kitchen', dining: 'Dining room', bath: 'Bathroom', bath2: 'En-suite bath', office: 'Study', entry: 'Entrance', kids: 'Kids room', dressing: 'Dressing room', laundry: 'Laundry', utility: 'Utility room', hall: 'Hall', reception: 'Reception', openoffice: 'Open office', meeting: 'Meeting room', director: 'Director', pantry: 'Pantry', toilet: 'Toilet', toilet2: 'Toilet 2', storage: 'Storage', hall2: 'Sales floor', counter: 'Counter', waiting: 'Waiting & reception', corridor: 'Corridor', consult: 'Consulting room 1', consult2: 'Consulting room 2', treatment: 'Treatment room', classroom: 'Classroom 1', classroom2: 'Classroom 2', prep: 'Prep room', lobby: 'Lobby', stair: 'Stairs' },
};

/** The project of a plan (null for an unknown id): walls, doors, windows, rooms, stairs and columns, no furniture. */
export function buildPlan(id, { language = 'ko', name = null } = {}) {
  const spec = PLANS[id];
  if (!spec) return null;
  const lang = language === 'en' ? 'en' : 'ko';
  return buildPlanProject(spec.plan, { name: name ?? spec[lang][0], names: (k) => PLAN_NAMES[lang][k] ?? k });
}
