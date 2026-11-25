// Engineering materials (the common ones): density for mass properties,
// a display colour and finish, and the mechanical values shown in the material list.
// density: kg/m³ · E: elastic modulus (GPa) · nu · yield / ultimate strength (MPa) · k W/(m·K) · cp J/(kg·K) ·
// alpha 1e-6/K · cut: the machining class. The wider library is in materials-more.js.
import { MORE_MATERIALS } from './materials-more.js';

const BASE_MATERIALS = [
  { id: 'steel-1020', group: 'steel', ko: '탄소강 AISI 1020', en: 'AISI 1020 steel', density: 7900, E: 200, yield: 351, nu: 0.29, ultimate: 420, k: 51.9, cp: 486, alpha: 11.7, cut: 'steel', color: '#9aa4ae', metal: 0.85, rough: 0.38 },
  { id: 'steel-4340', group: 'steel', ko: '합금강 AISI 4340', en: 'AISI 4340 alloy steel', density: 7850, E: 205, yield: 710, nu: 0.29, ultimate: 745, k: 44.5, cp: 475, alpha: 12.3, cut: 'alloySteel', color: '#8c96a0', metal: 0.85, rough: 0.34 },
  { id: 'stainless-304', group: 'steel', ko: '스테인리스 304', en: 'Stainless steel 304', density: 8000, E: 193, yield: 215, nu: 0.29, ultimate: 505, k: 16.2, cp: 500, alpha: 17.3, cut: 'stainless', color: '#c3c9cf', metal: 0.9, rough: 0.22 },
  { id: 'cast-iron', group: 'iron', ko: '회주철', en: 'Grey cast iron', density: 7200, E: 110, yield: 152, nu: 0.26, ultimate: 214, k: 46, cp: 490, alpha: 10.8, cut: 'castIron', color: '#6e7378', metal: 0.7, rough: 0.6 },
  { id: 'al-6061', group: 'aluminium', ko: '알루미늄 6061-T6', en: 'Aluminium 6061-T6', density: 2700, E: 69, yield: 276, nu: 0.33, ultimate: 310, k: 167, cp: 896, alpha: 23.6, cut: 'aluminium', color: '#c8ced6', metal: 0.9, rough: 0.3 },
  { id: 'al-7075', group: 'aluminium', ko: '알루미늄 7075-T6', en: 'Aluminium 7075-T6', density: 2810, E: 72, yield: 503, nu: 0.33, ultimate: 572, k: 130, cp: 960, alpha: 23.6, cut: 'aluminium', color: '#bcc4cc', metal: 0.9, rough: 0.28 },
  { id: 'brass', group: 'copper', ko: '황동', en: 'Brass', density: 8500, E: 100, yield: 200, nu: 0.33, ultimate: 340, k: 109, cp: 380, alpha: 20, cut: 'copperAlloy', color: '#c9a74f', metal: 0.95, rough: 0.25 },
  { id: 'copper', group: 'copper', ko: '구리', en: 'Copper', density: 8900, E: 110, yield: 70, nu: 0.34, ultimate: 220, k: 391, cp: 385, alpha: 17, cut: 'copperAlloy', color: '#c07a4a', metal: 0.95, rough: 0.25 },
  { id: 'titanium', group: 'titanium', ko: '티타늄 Ti-6Al-4V', en: 'Titanium Ti-6Al-4V', density: 4430, E: 114, yield: 880, nu: 0.34, ultimate: 950, k: 6.7, cp: 526, alpha: 8.6, cut: 'titanium', color: '#a7a9b3', metal: 0.85, rough: 0.35 },
  { id: 'abs', group: 'plastic', ko: 'ABS 수지', en: 'ABS plastic', density: 1040, E: 2.0, yield: 40, nu: 0.35, ultimate: 40, k: 0.17, cp: 1400, alpha: 90, cut: 'plastic', color: '#e9e4d8', metal: 0, rough: 0.55 },
  { id: 'pc', group: 'plastic', ko: '폴리카보네이트', en: 'Polycarbonate', density: 1200, E: 2.4, yield: 62, nu: 0.37, ultimate: 62, k: 0.2, cp: 1200, alpha: 68, cut: 'plastic', color: '#9fc6e6', metal: 0, rough: 0.2 },
  { id: 'nylon', group: 'plastic', ko: '나일론 6/6', en: 'Nylon 6/6', density: 1140, E: 2.8, yield: 70, nu: 0.39, ultimate: 80, k: 0.25, cp: 1670, alpha: 80, cut: 'plastic', color: '#ece9df', metal: 0, rough: 0.6 },
  { id: 'pom', group: 'plastic', ko: 'POM (아세탈)', en: 'POM (acetal)', density: 1410, E: 2.9, yield: 65, nu: 0.35, ultimate: 65, k: 0.31, cp: 1470, alpha: 110, cut: 'plastic', color: '#f2f2ee', metal: 0, rough: 0.45 },
  { id: 'rubber', group: 'other', ko: '고무', en: 'Rubber', density: 1100, E: 0.05, yield: 15, nu: 0.49, ultimate: 15, k: 0.16, cp: 2010, alpha: 200, cut: 'plastic', color: '#2f3134', metal: 0, rough: 0.9 },
  { id: 'oak', group: 'other', ko: '참나무', en: 'Oak', density: 750, E: 11, yield: 40, nu: 0.35, ultimate: 45, k: 0.17, cp: 2380, alpha: 5, cut: 'wood', color: '#a77b4a', metal: 0, rough: 0.8 },
  { id: 'glass', group: 'other', ko: '유리', en: 'Glass', density: 2500, E: 70, yield: 50, nu: 0.22, ultimate: 50, k: 1.05, cp: 840, alpha: 9, cut: 'plastic', color: '#bfe3ea', metal: 0, rough: 0.05 },
];

/** Every material: the common ones first, then the wider library (materials-more.js). */
export const MATERIALS = [...BASE_MATERIALS, ...MORE_MATERIALS];

/** The families the material lists are grouped by, in order (a material's family, else its group). */
export const MATERIAL_FAMILIES = ['steel', 'tool', 'stainless', 'iron', 'aluminium', 'copper', 'titanium', 'nickel', 'magnesium', 'zinc', 'refractory', 'precious', 'plastic', 'elastomer', 'composite', 'wood', 'glass', 'ceramic', 'stone', 'other'];
export const familyOf = (m) => m.family ?? (m.id === 'rubber' ? 'elastomer' : m.id === 'oak' ? 'wood' : m.id === 'glass' ? 'glass' : m.id === 'stainless-304' ? 'stainless' : m.group);

export const DEFAULT_MATERIAL = 'steel-1020';
export const materialOf = (id) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
export const materialName = (id, lang) => { const m = materialOf(id); return lang === 'en' ? m.en : m.ko; };

/** Mass in kg of `volume` mm³ of the material. */
export const massOf = (volumeMm3, id) => (volumeMm3 * 1e-9) * materialOf(id).density;
