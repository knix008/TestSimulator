// Example designs (start screen › Examples): finished icons made of shapes, emoji, text and
// effects, to open and change. Each builds a fresh design with new ids, like the templates.
import { createObject, DEFAULT_FX } from './iconCanvas.js';
import { emptyDesign } from './project.js';

const obj = (type, props) => {
  const o = createObject(type, 0, 0);
  const { fx, ...rest } = props;
  return { ...o, ...rest, fx: { ...DEFAULT_FX, ...(fx ?? {}) } };
};
const box = (x, y, w, h) => ({ x, y, w, h });
/** An emoji in the square box at (x, y) of side s. */
const emoji = (code, x, y, s, props = {}) => obj('emoji', { ...box(x, y, s, s), emoji: code, ...props });
/** The usual app tile: a rounded square with a gradient. */
const tile = (c1, c2, props = {}) => obj('rect', { ...box(32, 32, 448, 448), rx: 104, fill: c1, fill2: c2, fillType: 'linear', gradAngle: 90, fx: { shadow: true }, ...props });
const design = (objects, extra = {}) => ({ ...emptyDesign(), ...extra, objects });

export const EXAMPLES = [
  { id: 'happyApp', ko: '웃는 앱', en: 'Happy app', build: () => design([
    tile('#fde68a', '#f59e0b', { fx: { shadow: true, gloss: true } }),
    emoji('1f604', 96, 96, 320, { fx: { shadow: true, shadowDy: 8, shadowOpacity: 0.3 } }),
  ]) },
  { id: 'weather', ko: '날씨', en: 'Weather', build: () => design([
    emoji('26c5', 76, 86, 360, { fx: { shadow: true, shadowOpacity: 0.25 } }),
    obj('text', { ...box(150, 380, 220, 96), text: '24°', fontSize: 84, fontWeight: 800, fill: '#ffffff', fx: { shadow: true, shadowDy: 4, shadowBlur: 4 } }),
  ], { background: '#7dd3fc', background2: '#0369a1', bgGradient: true, bgRadius: 22 }) },
  { id: 'catBadge', ko: '고양이 배지', en: 'Cat badge', build: () => design([
    obj('ellipse', { ...box(32, 32, 448, 448), fill: '#f9a8d4', fill2: '#db2777', fillType: 'radial', fx: { shadow: true } }),
    obj('ellipse', { ...box(66, 66, 380, 380), hasFill: false, hasStroke: true, stroke: '#ffffff', strokeWidth: 10, dash: 'dash' }),
    emoji('1f431', 116, 116, 280),
  ]) },
  { id: 'rocket', ko: '로켓 발사', en: 'Rocket launch', build: () => design([
    obj('squircle', { ...box(32, 32, 448, 448), fill: '#312e81', fill2: '#0f172a', fillType: 'linear', fx: { shadow: true } }),
    obj('star4', { ...box(92, 92, 48, 48), fill: '#fef08a' }),
    obj('star4', { ...box(378, 140, 34, 34), fill: '#fef08a' }),
    obj('star4', { ...box(118, 360, 30, 30), fill: '#c7d2fe' }),
    emoji('1f680', 120, 112, 290, { fx: { glow: true, glowColor: '#fb923c', glowSize: 12 } }),
  ]) },
  { id: 'cafe', ko: '카페', en: 'Café', build: () => design([
    tile('#a16207', '#451a03'),
    emoji('2615', 116, 70, 280),
    obj('text', { ...box(150, 350, 230, 96), text: 'CAFE', fontSize: 76, fontWeight: 800, fill: '#fef3c7' }),
  ]) },
  { id: 'music', ko: '음악', en: 'Music', build: () => design([
    tile('#ec4899', '#6d28d9', { gradAngle: 45 }),
    emoji('1f3b8', 70, 120, 290, { rotate: -12 }),
    emoji('1f3b5', 300, 70, 150, { fx: { glow: true, glowColor: '#fdf4ff' } }),
  ]) },
  { id: 'game', ko: '게임', en: 'Game', build: () => design([
    tile('#22c55e', '#14532d', { fx: { shadow: true, gloss: true } }),
    emoji('1f3ae', 86, 110, 340, { fx: { shadow: true, shadowOpacity: 0.35 } }),
    emoji('1f3b2', 330, 300, 120, { rotate: 18 }),
  ]) },
  { id: 'loveLetter', ko: '러브레터', en: 'Love letter', build: () => design([
    obj('envelope', { ...box(56, 110, 400, 300), fill: '#ffffff', fill2: '#fce7f3', fillType: 'linear', hasStroke: true, stroke: '#f472b6', strokeWidth: 8, fx: { shadow: true } }),
    emoji('2764', 186, 196, 140, { fx: { glow: true, glowColor: '#fda4af' } }),
  ]) },
  { id: 'birthday', ko: '생일', en: 'Birthday', build: () => design([
    emoji('1f388', 40, 40, 170, { rotate: -10 }),
    emoji('1f389', 320, 50, 150),
    emoji('1f382', 106, 150, 300, { fx: { shadow: true, shadowOpacity: 0.3 } }),
  ], { background: '#fef9c3', background2: '#fde68a', bgGradient: true, bgShape: 'circle' }) },
  { id: 'pizza', ko: '피자 가게', en: 'Pizza place', build: () => design([
    obj('ellipse', { ...box(32, 32, 448, 448), fill: '#fb923c', fill2: '#c2410c', fillType: 'radial', fx: { shadow: true } }),
    emoji('1f355', 96, 96, 320, { rotate: 15, fx: { threeD: true, depth: 4 } }),
  ]) },
  { id: 'eco', ko: '친환경', en: 'Eco', build: () => design([
    obj('ellipse', { ...box(32, 32, 448, 448), fill: '#bbf7d0', fill2: '#16a34a', fillType: 'radial' }),
    emoji('267b', 106, 106, 300),
    emoji('1f340', 330, 330, 130, { rotate: 20 }),
  ]) },
  { id: 'trophy', ko: '우승', en: 'Champion', build: () => design([
    obj('burst', { ...box(24, 24, 464, 464), fill: '#fde047', fill2: '#ea580c', fillType: 'radial', fx: { shadow: true } }),
    emoji('1f3c6', 116, 106, 280, { fx: { glow: true, glowColor: '#fff7ae', glowSize: 14 } }),
  ]) },
  { id: 'security', ko: '보안', en: 'Security', build: () => design([
    obj('shield', { ...box(66, 30, 380, 452), fill: '#3b82f6', fill2: '#1e3a8a', fillType: 'linear', fx: { shadow: true, gloss: true } }),
    emoji('1f512', 156, 140, 200, { fx: { shadow: true, shadowOpacity: 0.35 } }),
  ]) },
  { id: 'photo', ko: '사진', en: 'Photos', build: () => design([
    tile('#f8fafc', '#cbd5e1', { hasStroke: true, stroke: '#94a3b8', strokeWidth: 6 }),
    emoji('1f4f7', 96, 96, 320, { fx: { shadow: true, shadowOpacity: 0.3 } }),
  ]) },
  { id: 'notes', ko: '메모', en: 'Notes', build: () => design([
    obj('document', { ...box(86, 30, 340, 452), fill: '#fefce8', fill2: '#fde68a', fillType: 'linear', hasStroke: true, stroke: '#ca8a04', strokeWidth: 6, fx: { shadow: true } }),
    emoji('1f4dd', 160, 170, 220, { rotate: -8 }),
  ]) },
  { id: 'shopping', ko: '쇼핑', en: 'Shopping', build: () => design([
    tile('#38bdf8', '#1d4ed8'),
    emoji('1f6d2', 96, 106, 300),
    obj('ellipse', { ...box(336, 52, 124, 124), fill: '#ef4444', hasStroke: true, stroke: '#ffffff', strokeWidth: 10 }),
    obj('text', { ...box(374, 66, 60, 96), text: '3', fontSize: 80, fontWeight: 800, fill: '#ffffff' }),
  ]) },
  { id: 'petChat', ko: '반려동물 채팅', en: 'Pet chat', build: () => design([
    obj('speech', { ...box(30, 40, 452, 420), fill: '#a7f3d0', fill2: '#059669', fillType: 'linear', fx: { shadow: true } }),
    emoji('1f436', 126, 90, 260),
  ]) },
  { id: 'nightSky', ko: '밤하늘', en: 'Night sky', build: () => design([
    emoji('1f319', 120, 100, 300, { rotate: -15, fx: { glow: true, glowColor: '#fef08a', glowSize: 16 } }),
    emoji('2b50', 60, 70, 90),
    emoji('2b50', 380, 330, 70),
    emoji('2728', 360, 70, 100),
  ], { background: '#1e1b4b', background2: '#020617', bgGradient: true, bgShape: 'circle' }) },
  { id: 'idea', ko: '아이디어', en: 'Idea', build: () => design([
    tile('#fef08a', '#facc15', { fx: { shadow: true, gloss: true } }),
    emoji('1f4a1', 106, 76, 300, { fx: { glow: true, glowColor: '#ffffff', glowSize: 18 } }),
    emoji('2728', 320, 300, 120),
  ]) },
  { id: 'hotStreak', ko: '불꽃 기록', en: 'Hot streak', build: () => design([
    tile('#f97316', '#b91c1c', { gradAngle: 45 }),
    emoji('1f525', 76, 66, 300, { fx: { glow: true, glowColor: '#fde047', glowSize: 12 } }),
    emoji('1f4af', 270, 280, 170, { rotate: -10, fx: { shadow: true, shadowOpacity: 0.35 } }),
  ]) },
];

export const EXAMPLE_BY_ID = Object.fromEntries(EXAMPLES.map((example) => [example.id, example]));
