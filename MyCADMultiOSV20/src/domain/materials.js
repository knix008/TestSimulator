// Engineering materials (FreeCAD's Material workbench and Std_SetMaterial):
// density, elastic modulus, Poisson's ratio, yield strength, thermal
// conductivity, expansion and specific heat, plus a colour for the 3D view.
// Units: kg/m³, MPa, –, MPa, W/(m·K), 1/K (×1e-6), J/(kg·K).

export const MATERIALS = [
  { id: 'steel', name: { ko: '구조용 강 (S235)', en: 'Structural steel (S235)' }, density: 7850, E: 210000, nu: 0.3, yield: 235, k: 50, alpha: 12, cp: 460, color: '#8a939c' },
  { id: 'stainless', name: { ko: '스테인리스강 (304)', en: 'Stainless steel (304)' }, density: 8000, E: 193000, nu: 0.29, yield: 215, k: 16, alpha: 17.3, cp: 500, color: '#b6bcc2' },
  { id: 'castIron', name: { ko: '회주철 (FC250)', en: 'Grey cast iron' }, density: 7200, E: 110000, nu: 0.26, yield: 250, k: 46, alpha: 10.5, cp: 490, color: '#5d6166' },
  { id: 'aluminium', name: { ko: '알루미늄 (6061-T6)', en: 'Aluminium (6061-T6)' }, density: 2700, E: 69000, nu: 0.33, yield: 276, k: 167, alpha: 23.6, cp: 896, color: '#c9ced4' },
  { id: 'copper', name: { ko: '구리', en: 'Copper' }, density: 8960, E: 117000, nu: 0.34, yield: 70, k: 401, alpha: 16.5, cp: 385, color: '#c46a3c' },
  { id: 'brass', name: { ko: '황동', en: 'Brass' }, density: 8500, E: 100000, nu: 0.34, yield: 200, k: 109, alpha: 19, cp: 380, color: '#c9a64a' },
  { id: 'titanium', name: { ko: '티타늄 (Ti-6Al-4V)', en: 'Titanium (Ti-6Al-4V)' }, density: 4430, E: 113800, nu: 0.342, yield: 880, k: 6.7, alpha: 8.6, cp: 526, color: '#9fa3ad' },
  { id: 'abs', name: { ko: 'ABS 플라스틱', en: 'ABS plastic' }, density: 1050, E: 2300, nu: 0.35, yield: 40, k: 0.17, alpha: 90, cp: 1400, color: '#e8e4d8' },
  { id: 'pla', name: { ko: 'PLA (3D 프린팅)', en: 'PLA (3D printing)' }, density: 1240, E: 3500, nu: 0.36, yield: 60, k: 0.13, alpha: 68, cp: 1800, color: '#f2f0ea' },
  { id: 'nylon', name: { ko: '나일론 (PA6)', en: 'Nylon (PA6)' }, density: 1140, E: 2800, nu: 0.39, yield: 70, k: 0.25, alpha: 85, cp: 1700, color: '#efe9d6' },
  { id: 'wood', name: { ko: '목재 (침엽수)', en: 'Wood (softwood)' }, density: 500, E: 11000, nu: 0.3, yield: 40, k: 0.12, alpha: 5, cp: 1700, color: '#b88a55' },
  { id: 'concrete', name: { ko: '콘크리트 (C25)', en: 'Concrete (C25)' }, density: 2400, E: 31000, nu: 0.2, yield: 25, k: 1.7, alpha: 10, cp: 880, color: '#a7a49c' },
  { id: 'glass', name: { ko: '유리', en: 'Glass' }, density: 2500, E: 70000, nu: 0.22, yield: 50, k: 1, alpha: 9, cp: 840, color: '#bfe3f0' },
];

export const MATERIAL_FIELDS = ['density', 'E', 'nu', 'yield', 'k', 'alpha', 'cp'];
export const MATERIAL_UNITS = { density: 'kg/m³', E: 'MPa', nu: '', yield: 'MPa', k: 'W/(m·K)', alpha: 'µm/(m·K)', cp: 'J/(kg·K)' };

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** A material stored on an entity: its id and values (a library one, or the user's own). */
export function normalizeMaterial(raw, custom = []) {
  if (!raw || typeof raw !== 'object') return null;
  const base = [...MATERIALS, ...custom].find((m) => m.id === raw.id) ?? MATERIALS[0];
  const out = { id: typeof raw.id === 'string' ? raw.id.slice(0, 40) : base.id, name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : (base.name?.en ?? base.name) };
  for (const key of MATERIAL_FIELDS) out[key] = Math.max(0, finite(raw[key], base[key]));
  out.color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : base.color;
  return out;
}

/** The materials the user made (Material_Edit), from the settings. */
export function normalizeCustomMaterials(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m) => m && typeof m.id === 'string' && m.id.startsWith('custom-')).slice(0, 100).map((m) => normalizeMaterial(m)).filter(Boolean);
}

/** Mass (kg) of a volume (mm³) of a material. */
export const massOf = (volumeMm3, material) => (volumeMm3 * 1e-9) * (material?.density ?? 0);

export const materialName = (material, language) => (typeof material.name === 'object' ? material.name[language] ?? material.name.en : material.name);
