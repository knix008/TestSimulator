// Engineering data: the built-in material library (SI), the same values as the solver's fallback
// table (crates/sim-core/src/materials.rs). A project keeps its own editable copies.

const solid = (id, group, ko, en, color, p) => ({
  id, group, name: { ko, en }, color,
  density: p[0], young: p[1] * 1e9, poisson: p[2], cte: p[3], conductivity: p[4], specificHeat: p[5],
  yield: p[6] * 1e6, ultimate: p[7] * 1e6, tangent: p[1] * 1e9 / 100, fatigueSf: p[8] * 1e6, fatigueB: p[9], endurance: 0,
  resistivity: p[10], permittivity: p[11] ?? 1, permeability: p[12] ?? 1, viscosity: 0, soundSpeed: 0, expansion: 0, emissivity: p[13] ?? 0.8,
  fatigueEf: p[8] > 0 ? 0.5 : 0, fatigueC: p[8] > 0 ? -0.6 : 0, c10: 0, c01: 0, d1: 0, creepA: 0, creepN: 0, creepM: 0,
});
const withProps = (m, props) => Object.assign(m, props);
const fluid = (id, ko, en, color, p) => ({
  id, group: 'fluid', name: { ko, en }, color,
  density: p[0], young: 0, poisson: 0, cte: 0, conductivity: p[1], specificHeat: p[2], yield: 0, ultimate: 0, tangent: 0,
  fatigueSf: 0, fatigueB: 0, endurance: 0, resistivity: p[3], permittivity: p[4], permeability: 1, viscosity: p[5], soundSpeed: p[6], expansion: p[7], emissivity: 0,
});

//                    density  E(GPa) ν     α        k      cp     Sy    Su    Sf'   b      ρe       εr  μr    ε
export const MATERIALS = [
  solid('steel', 'metal', '구조용 강', 'Structural steel', '#8d99a6', [7850, 200, 0.3, 1.2e-5, 60.5, 434, 250, 460, 920, -0.106, 1.7e-7, 1, 1000, 0.8]),
  solid('stainless', 'metal', '스테인리스강', 'Stainless steel', '#b7c0c9', [7750, 193, 0.31, 1.7e-5, 15.1, 480, 207, 586, 1000, -0.1, 7.7e-7, 1, 1, 0.6]),
  solid('aluminum', 'metal', '알루미늄 합금', 'Aluminium alloy', '#c8ccd4', [2770, 71, 0.33, 2.3e-5, 144, 875, 280, 310, 500, -0.11, 4.3e-8, 1, 1, 0.2]),
  solid('titanium', 'metal', '티타늄 합금', 'Titanium alloy', '#a49e95', [4620, 96, 0.36, 9.4e-6, 21.9, 522, 930, 1070, 1400, -0.09, 1.7e-6, 1, 1, 0.5]),
  solid('copper', 'metal', '구리 합금', 'Copper alloy', '#c97b4a', [8300, 110, 0.34, 1.8e-5, 401, 385, 280, 430, 600, -0.1, 1.72e-8, 1, 1, 0.1]),
  solid('castIron', 'metal', '회주철', 'Gray cast iron', '#6f7377', [7200, 110, 0.28, 1.1e-5, 52, 447, 150, 240, 400, -0.1, 9.6e-7, 1, 300, 0.8]),
  solid('magnesium', 'metal', '마그네슘 합금', 'Magnesium alloy', '#b9b4a6', [1800, 45, 0.35, 2.6e-5, 156, 1024, 150, 250, 380, -0.11, 4.4e-8, 1, 1, 0.3]),
  solid('ferrite', 'magnetic', '연철(자성체)', 'Soft iron', '#5c6670', [7870, 200, 0.29, 1.2e-5, 80, 450, 50, 250, 0, -0.1, 1e-7, 1, 4000, 0.8]),
  solid('magnetNdFeB', 'magnetic', 'NdFeB 자석', 'NdFeB magnet', '#7d5d8a', [7500, 160, 0.24, 5e-6, 9, 440, 80, 80, 0, -0.1, 1.5e-6, 1, 1.05, 0.8]),
  solid('concrete', 'other', '콘크리트', 'Concrete', '#a7a29a', [2300, 30, 0.18, 1.4e-5, 0.72, 780, 30, 3, 0, -0.1, 1e3, 4.5, 1, 0.9]),
  solid('abs', 'polymer', 'ABS 수지', 'ABS plastic', '#e9d8a6', [1040, 2.2, 0.35, 9e-5, 0.17, 1400, 40, 45, 0, -0.1, 1e14, 3, 1, 0.9]),
  solid('nylon', 'polymer', '나일론', 'Nylon', '#e6e1d3', [1140, 2.7, 0.39, 8e-5, 0.25, 1700, 60, 75, 0, -0.1, 1e13, 3.5, 1, 0.9]),
  // Rubber: hyperelastic (Mooney–Rivlin); E and ν are its small-strain values for linear analyses.
  withProps(solid('rubber', 'polymer', '고무', 'Rubber', '#3c3c3c', [1000, 0.0036, 0.49, 2e-4, 0.16, 2000, 10, 15, 0, -0.1, 1e13, 3, 1, 0.9]), { c10: 0.5e6, c01: 0.1e6, d1: 3.33e-8 }),
  // A heat-resistant steel at 550 °C with Norton creep (ε̇ = A σⁿ tᵐ, σ in Pa, t in s).
  withProps(solid('creepSteel', 'metal', '내열강(550 °C)', 'Heat-resistant steel (550 °C)', '#9c7f6b', [7900, 170, 0.3, 1.4e-5, 25, 560, 180, 450, 700, -0.1, 9e-7, 1, 1, 0.7]), { creepA: 2e-49, creepN: 5, creepM: 0 }),
  solid('pcb', 'electronic', 'FR-4 기판', 'FR-4 board', '#3f7d4c', [1850, 22, 0.15, 1.4e-5, 0.3, 1100, 300, 310, 0, -0.1, 1e14, 4.4, 1, 0.9]),
  solid('silicon', 'electronic', '실리콘', 'Silicon', '#59616e', [2330, 130, 0.28, 2.6e-6, 148, 712, 7000, 7000, 0, -0.1, 6.4e2, 11.7, 1, 0.7]),
  solid('glass', 'other', '유리', 'Glass', '#9fd0dc', [2500, 70, 0.22, 9e-6, 1.05, 840, 50, 50, 0, -0.1, 1e12, 6, 1, 0.9]),
  solid('wood', 'other', '목재', 'Wood', '#b5885a', [600, 11, 0.3, 5e-6, 0.12, 1700, 40, 80, 0, -0.1, 1e14, 2, 1, 0.9]),
  solid('ptfe', 'polymer', 'PTFE(절연체)', 'PTFE insulator', '#f2f2ee', [2200, 0.5, 0.46, 1.2e-4, 0.25, 1000, 20, 25, 0, -0.1, 1e18, 2.1, 1, 0.9]),
  fluid('air', '공기', 'Air', '#bfe3ff', [1.225, 0.0262, 1006, 1e16, 1.0006, 1.81e-5, 343, 3.43e-3]),
  fluid('water', '물', 'Water', '#4aa3df', [998, 0.6, 4182, 2e5, 80, 1.0e-3, 1482, 2.1e-4]),
  fluid('oil', '엔진 오일', 'Engine oil', '#d8a23a', [880, 0.145, 1880, 1e12, 2.2, 0.2, 1450, 7e-4]),
];

export const MATERIAL_GROUPS = ['metal', 'polymer', 'electronic', 'magnetic', 'other', 'fluid'];
export const materialById = (id, list = MATERIALS) => list.find((m) => m.id === id) ?? MATERIALS[0];
export const materialName = (m, lang) => (m?.name ? m.name[lang] ?? m.name.en : String(m?.id ?? ''));

/** The editable properties, in the order Engineering Data shows them, with their unit kinds. */
export const MATERIAL_FIELDS = [
  ['density', 'density'], ['young', 'modulus'], ['poisson', 'ratio'], ['yield', 'stress'], ['ultimate', 'stress'], ['tangent', 'modulus'],
  ['cte', 'cte'], ['conductivity', 'conductivity'], ['specificHeat', 'specificHeat'], ['emissivity', 'ratio'],
  ['fatigueSf', 'stress'], ['fatigueB', 'ratio'], ['endurance', 'stress'], ['fatigueEf', 'ratio'], ['fatigueC', 'ratio'],
  ['c10', 'stress'], ['c01', 'stress'], ['d1', 'compliance'], ['creepA', 'ratio'], ['creepN', 'ratio'], ['creepM', 'ratio'],
  ['resistivity', 'resistivity'], ['permittivity', 'ratio'], ['permeability', 'ratio'],
  ['viscosity', 'viscosity'], ['soundSpeed', 'velocity'], ['expansion', 'cte'],
];

/** What the solver reads (camelCase keys as in sim-core Material). */
export function solverMaterial(m) {
  return {
    name: m.name?.en ?? m.id, density: m.density, young: m.young, poisson: m.poisson, cte: m.cte, conductivity: m.conductivity,
    specificHeat: m.specificHeat, yield: m.yield, ultimate: m.ultimate, tangent: m.tangent, fatigueSf: m.fatigueSf, fatigueB: m.fatigueB,
    endurance: m.endurance, resistivity: m.resistivity, permittivity: m.permittivity, permeability: m.permeability,
    viscosity: m.viscosity, soundSpeed: m.soundSpeed, expansion: m.expansion, emissivity: m.emissivity,
    fatigueEf: m.fatigueEf ?? 0, fatigueC: m.fatigueC ?? 0, c10: m.c10 ?? 0, c01: m.c01 ?? 0, d1: m.d1 ?? 0,
    creepA: m.creepA ?? 0, creepN: m.creepN ?? 0, creepM: m.creepM ?? 0,
  };
}
