// Material library. A model carries its own copies (model.materials), so a
// saved file never depends on the library; the library only seeds them.
//
// Units: k W/(m·K), rho kg/m³, cp J/(kg·K), E Pa, alpha 1/K, mu Pa·s,
// beta 1/K, latent J/kg, permeability m². Values at about 25 °C from
// common handbook tables (Incropera, ASHRAE, manufacturers' data sheets).

const solid = (id, ko, en, category, color, k, rho, cp, emissivity, E, nu, alpha, extra = {}) => ({
  id, name: { ko, en }, category, kind: 'solid', color, k, rho, cp, emissivity, E, nu, alpha, ...extra,
});
const fluid = (id, ko, en, color, k, rho, cp, mu, beta, extra = {}) => ({
  id, name: { ko, en }, category: 'fluid', kind: 'fluid', color, k, rho, cp, mu, beta, emissivity: 0, ...extra,
});

export const MATERIAL_CATEGORIES = [
  { id: 'metal', ko: '금속', en: 'Metals' },
  { id: 'electronics', ko: '전자 재료', en: 'Electronics' },
  { id: 'ceramic', ko: '세라믹·유리', en: 'Ceramics & glass' },
  { id: 'building', ko: '건축 재료', en: 'Building' },
  { id: 'polymer', ko: '고분자·복합재', en: 'Polymers & composites' },
  { id: 'battery', ko: '배터리', en: 'Battery' },
  { id: 'fluid', ko: '유체', en: 'Fluids' },
  { id: 'pcm', ko: '상변화 재료', en: 'Phase change' },
  { id: 'porous', ko: '다공성 매체', en: 'Porous media' },
];

export const MATERIAL_LIBRARY = [
  // Metals
  solid('al6061', '알루미늄 6061', 'Aluminium 6061', 'metal', '#b8c2cc', 167, 2700, 896, 0.09, 68.9e9, 0.33, 23.6e-6),
  solid('alAnodized', '알루미늄 (아노다이징)', 'Aluminium (anodised)', 'metal', '#5f6f86', 167, 2700, 896, 0.8, 68.9e9, 0.33, 23.6e-6),
  solid('adc12', '다이캐스팅 알루미늄 ADC12', 'Die-cast aluminium ADC12', 'metal', '#a9b3bd', 96, 2740, 963, 0.2, 71e9, 0.33, 21e-6),
  solid('copper', '구리', 'Copper', 'metal', '#c87533', 391, 8933, 385, 0.05, 117e9, 0.34, 16.6e-6),
  solid('steel', '탄소강', 'Carbon steel', 'metal', '#6b7178', 51.9, 7850, 486, 0.6, 200e9, 0.29, 12e-6),
  solid('ss304', '스테인리스강 304', 'Stainless steel 304', 'metal', '#9ea7ad', 16.2, 8000, 500, 0.3, 193e9, 0.29, 17.3e-6),
  solid('ti64', '티타늄 Ti-6Al-4V', 'Titanium Ti-6Al-4V', 'metal', '#8c8f99', 6.7, 4430, 526, 0.3, 114e9, 0.34, 8.6e-6),
  solid('castIron', '회주철', 'Grey cast iron', 'metal', '#4f5257', 52, 7200, 460, 0.65, 110e9, 0.26, 11e-6),
  // Electronics
  solid('silicon', '실리콘 (다이)', 'Silicon (die)', 'electronics', '#3c4a6e', 148, 2330, 712, 0.6, 130e9, 0.28, 2.6e-6, {
    kT: [[-50, 230], [25, 148], [100, 105], [150, 85], [200, 70]],
  }),
  solid('fr4', 'FR-4', 'FR-4', 'electronics', '#3f7d3a', 0.3, 1900, 1150, 0.9, 22e9, 0.15, 14e-6, { kx: 0.81, kz: 0.81 }),
  solid('pcb4', 'PCB 4층 (유효)', 'PCB 4-layer (effective)', 'electronics', '#2e6b34', 0.4, 2100, 1100, 0.9, 25e9, 0.15, 16e-6, { kx: 25, kz: 25 }),
  solid('sac305', '솔더 SAC305', 'Solder SAC305', 'electronics', '#c9c9c0', 58, 7400, 220, 0.1, 50e9, 0.36, 21.7e-6),
  solid('emc', '에폭시 몰딩 컴파운드', 'Epoxy mould compound', 'electronics', '#26262b', 0.8, 1900, 900, 0.9, 25e9, 0.3, 12e-6),
  solid('tim', '열 패드 (TIM)', 'Thermal pad (TIM)', 'electronics', '#d9a441', 3.0, 2500, 1000, 0.9, 1e6, 0.45, 150e-6),
  solid('grease', '서멀 그리스', 'Thermal grease', 'electronics', '#e8e8e8', 0.8, 2400, 800, 0.9, 1e6, 0.45, 200e-6),
  solid('graphite', '그래파이트 시트', 'Graphite sheet', 'electronics', '#2b2b2b', 5, 1900, 850, 0.8, 10e9, 0.2, 1e-6, { kx: 1500, kz: 1500 }),
  solid('alumina', '알루미나 (Al₂O₃)', 'Alumina (Al₂O₃)', 'ceramic', '#efe9dc', 30, 3900, 880, 0.8, 370e9, 0.22, 8.1e-6),
  solid('aln', '질화알루미늄 (AlN)', 'Aluminium nitride (AlN)', 'ceramic', '#d8d2c2', 170, 3260, 740, 0.8, 330e9, 0.24, 4.5e-6),
  solid('sic', '탄화규소 (SiC)', 'Silicon carbide (SiC)', 'ceramic', '#5a5d61', 370, 3210, 690, 0.85, 410e9, 0.14, 4.0e-6),
  solid('glass', '판유리', 'Float glass', 'ceramic', '#9fd3e6', 1.0, 2500, 840, 0.84, 70e9, 0.22, 9e-6),
  // Building envelope (THERM-style sections)
  solid('concrete', '콘크리트', 'Concrete', 'building', '#a7a39b', 1.4, 2300, 880, 0.9, 30e9, 0.2, 10e-6),
  solid('brick', '벽돌', 'Brick', 'building', '#a5523a', 0.72, 1920, 835, 0.93, 15e9, 0.2, 6e-6),
  solid('mineralWool', '미네랄울 단열재', 'Mineral wool', 'building', '#e6d27a', 0.035, 30, 840, 0.9, 1e5, 0.1, 10e-6),
  solid('eps', 'EPS 단열재', 'EPS insulation', 'building', '#f2f2f2', 0.035, 20, 1300, 0.9, 5e6, 0.1, 70e-6),
  solid('gypsum', '석고보드', 'Gypsum board', 'building', '#ece6dc', 0.17, 800, 1090, 0.9, 2e9, 0.2, 18e-6),
  solid('wood', '목재 (소나무)', 'Wood (pine)', 'building', '#c49a6c', 0.12, 510, 1380, 0.9, 10e9, 0.3, 5e-6),
  solid('pvc', 'PVC 창틀', 'PVC frame', 'building', '#f4f4ee', 0.17, 1380, 900, 0.9, 3e9, 0.38, 70e-6),
  solid('airCavity', '공기층 (유효 전도율)', 'Air cavity (effective k)', 'building', '#cfe8ff', 0.05, 1.2, 1007, 0.9, 1e3, 0.1, 0),
  solid('argonCavity', '아르곤층 (유효 전도율)', 'Argon cavity (effective k)', 'building', '#d9d0ff', 0.03, 1.66, 520, 0.9, 1e3, 0.1, 0),
  solid('polyamide', '단열바 (폴리아미드)', 'Thermal break (polyamide)', 'building', '#555555', 0.3, 1450, 1600, 0.9, 5e9, 0.35, 30e-6),
  // Polymers and composites
  solid('abs', 'ABS', 'ABS', 'polymer', '#e0dccf', 0.17, 1050, 1400, 0.9, 2.3e9, 0.35, 90e-6),
  solid('pc', '폴리카보네이트', 'Polycarbonate', 'polymer', '#cfe0e6', 0.2, 1200, 1200, 0.9, 2.4e9, 0.37, 65e-6),
  solid('ptfe', 'PTFE', 'PTFE', 'polymer', '#fafafa', 0.25, 2200, 1000, 0.9, 0.5e9, 0.46, 120e-6),
  solid('cfrp', 'CFRP (탄소섬유)', 'CFRP (carbon fibre)', 'polymer', '#333a40', 0.7, 1550, 900, 0.85, 70e9, 0.3, 2e-6, { kx: 5, kz: 5 }),
  solid('silicone', '실리콘 고무', 'Silicone rubber', 'polymer', '#c4d6c1', 0.2, 1100, 1300, 0.9, 5e6, 0.48, 250e-6),
  // Battery
  solid('liion', '리튬이온 셀 (유효)', 'Li-ion cell (effective)', 'battery', '#4a6fa5', 1.0, 2500, 1000, 0.9, 5e9, 0.3, 10e-6, { kx: 30, kz: 30 }),
  solid('cellCan', '셀 캔 (니켈 도금강)', 'Cell can (Ni-plated steel)', 'battery', '#9a9aa0', 45, 7900, 470, 0.3, 200e9, 0.29, 12e-6),
  // Fluids (ρ, μ at about 30 °C)
  fluid('air', '공기', 'Air', '#d6ecff', 0.0263, 1.164, 1007, 1.872e-5, 3.3e-3),
  fluid('water', '물', 'Water', '#4aa3ff', 0.613, 996, 4178, 7.98e-4, 3.0e-4),
  fluid('glycol50', '에틸렌글리콜 50%', 'Ethylene glycol 50%', '#6fc3b2', 0.38, 1070, 3300, 3.9e-3, 5.5e-4),
  fluid('oil', '엔진 오일', 'Engine oil', '#c8a24a', 0.145, 884, 1910, 0.486, 7.0e-4),
  fluid('fc72', '절연 냉매 (FC-72)', 'Dielectric coolant (FC-72)', '#b3a5ff', 0.057, 1680, 1100, 6.4e-4, 1.6e-3),
  // Phase change
  { id: 'rt35', name: { ko: '파라핀 RT35', en: 'Paraffin RT35' }, category: 'pcm', kind: 'pcm', color: '#f2d7a0', k: 0.2, kLiquid: 0.2, rho: 800, cp: 2000, Tmelt: 35, meltRange: 4, latent: 160e3, emissivity: 0.9, E: 1e8, nu: 0.4, alpha: 1e-4 },
  { id: 'ice', name: { ko: '얼음 / 물', en: 'Ice / water' }, category: 'pcm', kind: 'pcm', color: '#bfe6ff', k: 2.2, kLiquid: 0.6, rho: 917, cp: 2050, Tmelt: 0, meltRange: 1, latent: 334e3, emissivity: 0.95, E: 9e9, nu: 0.33, alpha: 5e-5 },
  { id: 'saltHydrate', name: { ko: '염 수화물 (CaCl₂·6H₂O)', en: 'Salt hydrate (CaCl₂·6H₂O)' }, category: 'pcm', kind: 'pcm', color: '#e6e1f5', k: 1.09, kLiquid: 0.54, rho: 1560, cp: 1400, Tmelt: 29, meltRange: 2, latent: 190e3, emissivity: 0.9, E: 1e9, nu: 0.35, alpha: 5e-5 },
  // Porous media (k, rho, cp are the solid matrix; `fluid` fills the pores)
  { id: 'alFoam', name: { ko: '알루미늄 폼 (공기)', en: 'Aluminium foam (air)' }, category: 'porous', kind: 'porous', color: '#9aa7b3', k: 167, rho: 2700, cp: 896, porosity: 0.9, permeability: 1e-7, fluid: 'air', emissivity: 0.3, E: 1e9, nu: 0.3, alpha: 23.6e-6 },
  { id: 'cuFoamWater', name: { ko: '구리 폼 (물)', en: 'Copper foam (water)' }, category: 'porous', kind: 'porous', color: '#b27a4b', k: 391, rho: 8933, cp: 385, porosity: 0.92, permeability: 5e-8, fluid: 'water', emissivity: 0.1, E: 1e9, nu: 0.3, alpha: 16.6e-6 },
  { id: 'packedBed', name: { ko: '유리구슬 충전층 (물)', en: 'Packed glass beads (water)' }, category: 'porous', kind: 'porous', color: '#c9e0d8', k: 1.0, rho: 2500, cp: 840, porosity: 0.4, permeability: 1e-9, fluid: 'water', emissivity: 0.9, E: 1e9, nu: 0.3, alpha: 9e-6 },
];

/** Electrical conductivity σ (S/m, at 20 °C) and its temperature coefficient of resistance αR (1/K), for Joule heating. */
const ELECTRIC = {
  al6061: [2.5e7, 0.0039], alAnodized: [2.5e7, 0.0039], adc12: [1.3e7, 0.0039], copper: [5.96e7, 0.00393], steel: [5.9e6, 0.005],
  ss304: [1.39e6, 0.001], ti64: [5.8e5, 0.0035], castIron: [1.5e6, 0.003], sac305: [7.0e6, 0.0045], graphite: [1.0e5, -0.0005], cellCan: [6.0e6, 0.005],
};
for (const material of MATERIAL_LIBRARY) {
  const e = ELECTRIC[material.id];
  material.sigma = e ? e[0] : 0;
  if (e) material.alphaR = e[1];
}

export function libraryMaterial(id) {
  return MATERIAL_LIBRARY.find((m) => m.id === id) ?? null;
}

/** The model's own copy of a library material (plain name string in the UI language). */
export function materialFromLibrary(id, language = 'ko') {
  const source = libraryMaterial(id);
  if (!source) return null;
  const { name, category, ...rest } = source;
  return { ...rest, name: language === 'en' ? name.en : name.ko };
}

export function materialName(material, language) {
  if (!material) return '';
  if (typeof material.name === 'string') return material.name;
  return language === 'en' ? material.name?.en : material.name?.ko;
}

/** Thermal diffusivity α = k / (ρ·cp), m²/s. */
export function diffusivity(material) {
  return material.k / (material.rho * material.cp);
}
