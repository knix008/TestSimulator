// More sample models: the SimScale-style analysis types (turbulent CHT,
// thermal comfort, Joule heating, contact resistance, static structural,
// modal) and further application areas. Merged into samples.js.
import { materialFromLibrary } from './materials.js';

const mats = (language, ...ids) => ids.map((id) => materialFromLibrary(id, language));
const rect = (id, name, material, x, y, w, h, extra = {}) => ({ id, name, shape: 'rect', material, x, y, w, h, ...extra });
const circle = (id, name, material, cx, cy, r, extra = {}) => ({ id, name, shape: 'circle', material, cx, cy, r, ...extra });
const poly = (id, name, material, points, extra = {}) => ({ id, name, shape: 'polygon', material, points, ...extra });
const bc = (id, name, target, type, values = {}) => ({ id, name, target, type, ...values });
const L = (language, ko, en) => (language === 'en' ? en : ko);

export const MORE_BUILDERS_BASE = {
  turbulentDuct(language) {
    return {
      name: L(language, '가열 덕트의 난류 (k-ω SST)', 'Heated duct, turbulent (k-ω SST)'),
      description: L(language, 'Re ≈ 20 000 의 물이 아래에서 가열되는 강판 덕트를 흐릅니다. k-ω SST 난류 모델로 유동과 벽 열전달을 함께 풀고, 압력 강하와 출구 온도를 봅니다.', 'Water at Re ≈ 20 000 flows through a steel duct heated from below. The k-ω SST model solves the flow and the wall heat transfer together; read the pressure drop and the outlet temperature.'),
      domain: { dim: 2, width: 400, height: 24, depth: 100, nx: 200, ny: 48, background: null },
      materials: mats(language, 'water', 'steel'),
      bodies: [
        rect('wallBottom', L(language, '아래 벽', 'Bottom wall'), 'steel', 0, 0, 400, 2),
        rect('water', L(language, '물', 'Water'), 'water', 0, 2, 400, 20),
        rect('wallTop', L(language, '위 벽', 'Top wall'), 'steel', 0, 22, 400, 2),
      ],
      boundaries: [
        bc('in', L(language, '유입', 'Inlet'), 'left', 'inlet', { velocity: 0.4, Tin: 20, range: [2, 22], turbulenceIntensity: 0.05 }),
        bc('out', L(language, '유출', 'Outlet'), 'right', 'outlet', { range: [2, 22] }),
        bc('heater', L(language, '가열면', 'Heater'), 'bottom', 'flux', { q: 20000 }),
      ],
      probes: [{ id: 'p1', name: L(language, '출구 중앙', 'Outlet centre'), x: 398, y: 12 }, { id: 'p2', name: L(language, '가열 벽 끝', 'Heated wall end'), x: 390, y: 1 }],
      study: { type: 'steady', flow: true, turbulence: 'kOmegaSST', flowSteps: 4000 },
    };
  },

  dataCenter(language) {
    const rack = (id, x, name) => rect(id, name, 'serverRack', x, 300, 600, 2000, { power: 6000 });
    return {
      name: L(language, '데이터 센터 냉·열 통로', 'Data centre hot / cold aisle'),
      description: L(language, '이중 바닥에서 찬 공기가 냉통로로 올라와 서버 랙(다공성 + 발열)을 지나 열통로와 천장 환기구로 나갑니다. 난류 유동으로 랙 흡입 온도와 재순환을 확인합니다.', 'Cold air rises from the raised floor into the cold aisle, passes the server racks (porous + heat) and leaves through the hot aisle and the ceiling returns. A turbulent flow shows the rack inlet temperatures and recirculation.'),
      domain: { dim: 2, width: 6000, height: 3000, depth: 600, nx: 120, ny: 60, background: 'air' },
      materials: [...mats(language, 'air', 'concrete'), { ...materialFromLibrary('alFoam', language), id: 'serverRack', name: L(language, '서버 랙 (다공성)', 'Server rack (porous)'), k: 15, rho: 2000, cp: 800, porosity: 0.6, permeability: 2e-6, fluid: 'air', color: '#3d4a5c' }],
      bodies: [
        rect('floor', L(language, '바닥 슬래브', 'Floor slab'), 'concrete', 0, 0, 2400, 300),
        rect('floor2', L(language, '바닥 슬래브 2', 'Floor slab 2'), 'concrete', 3600, 0, 2400, 300),
        rack('rackA', 1800, L(language, '랙 A', 'Rack A')),
        rack('rackB', 3600, L(language, '랙 B', 'Rack B')),
      ],
      boundaries: [
        bc('supply', L(language, '바닥 급기 (냉통로)', 'Floor supply (cold aisle)'), 'bottom', 'inlet', { velocity: 1.6, Tin: 18, range: [2400, 3600], turbulenceIntensity: 0.1 }),
        bc('ret1', L(language, '천장 환기 1', 'Ceiling return 1'), 'top', 'outlet', { range: [300, 1500] }),
        bc('ret2', L(language, '천장 환기 2', 'Ceiling return 2'), 'top', 'outlet', { range: [4500, 5700] }),
      ],
      probes: [{ id: 'p1', name: L(language, '랙 A 흡입', 'Rack A inlet'), x: 2450, y: 1500 }, { id: 'p2', name: L(language, '랙 A 배기', 'Rack A exhaust'), x: 1750, y: 1500 }, { id: 'p3', name: L(language, '랙 B 흡입 위쪽', 'Rack B inlet top'), x: 3550, y: 2200 }],
      study: { type: 'steady', flow: true, turbulence: 'kOmegaSST', flowSteps: 3000 },
      ambient: 22,
    };
  },

  officeComfort(language) {
    return {
      name: L(language, '사무실 열 쾌적성 (PMV)', 'Office thermal comfort (PMV)'),
      description: L(language, '겨울철 차가운 창 아래 라디에이터가 있는 사무실 단면. 자연 대류로 데워진 공기의 온도·속도에서 ISO 7730 PMV/PPD 를 계산해 앉은 사람 자리의 쾌적성을 봅니다.', 'A winter office section with a radiator under a cold window. From the temperature and speed of the air moved by natural convection, the ISO 7730 PMV/PPD show the comfort at the seated occupant.'),
      domain: { dim: 2, width: 5000, height: 3000, depth: 1000, nx: 200, ny: 120, background: 'air' },
      materials: mats(language, 'air', 'steel', 'wood'),
      bodies: [
        rect('radiator', L(language, '라디에이터', 'Radiator'), 'steel', 150, 150, 125, 650),
        rect('desk', L(language, '책상', 'Desk'), 'wood', 2500, 720, 1400, 40),
        rect('person', L(language, '앉은 사람 (피부 34 °C)', 'Seated person (skin 34 °C)'), 'wood', 3000, 0, 400, 1300),
      ],
      boundaries: [
        bc('hotWater', L(language, '온수 60 °C', 'Hot water 60 °C'), 'body:radiator', 'temperature', { T: 60 }),
        bc('skin', L(language, '피부 34 °C', 'Skin 34 °C'), 'body:person', 'temperature', { T: 34 }),
        bc('window', L(language, '창 (외기 0 °C)', 'Window (0 °C outside)'), 'left', 'convection', { h: 2.8, Tinf: 0, range: [900, 2700] }),
        bc('wallL', L(language, '외벽', 'Outer wall'), 'left', 'convection', { h: 0.35, Tinf: 0, range: [0, 900] }),
        bc('ceiling', L(language, '천장', 'Ceiling'), 'top', 'convection', { h: 0.5, Tinf: 20 }),
      ],
      probes: [{ id: 'p1', name: L(language, '머리 높이', 'Head height'), x: 3200, y: 1400 }, { id: 'p2', name: L(language, '발목 높이', 'Ankle height'), x: 2800, y: 100 }, { id: 'p3', name: L(language, '창가', 'At the window'), x: 300, y: 1800 }],
      study: { type: 'steady', flow: true, natural: true, turbulence: 'kOmegaSST', flowSteps: 4000, Tref: 20 },
      ambient: 20,
    };
  },

  busbar(language) {
    return {
      name: L(language, '버스바 접합부 줄 발열', 'Busbar joint Joule heating'),
      description: L(language, '구리·알루미늄 버스바를 볼트로 겹쳐 붙인 접합부에 200 A 가 흐릅니다. 전위장으로 전류 밀도와 줄 발열을 구하고, 접합면의 접촉 열저항이 온도에 주는 영향을 봅니다.', '200 A flows through a bolted copper–aluminium busbar joint. The electric potential gives the current density and Joule heat; see how the thermal contact resistance of the joint raises the temperature.'),
      domain: { dim: 2, width: 300, height: 24, depth: 10, nx: 300, ny: 48, background: null },
      materials: mats(language, 'copper', 'al6061'),
      bodies: [
        rect('cu', L(language, '구리 바', 'Copper bar'), 'copper', 0, 4, 170, 8),
        rect('al', L(language, '알루미늄 바', 'Aluminium bar'), 'al6061', 130, 12, 170, 8),
      ],
      boundaries: [
        bc('plus', L(language, '전류 유입 (200 A)', 'Current in (200 A)'), 'left', 'currentIn', { I: 200 }),
        bc('gnd', L(language, '접지', 'Ground'), 'right', 'ground'),
        bc('joint', L(language, '접합면 열저항', 'Joint contact resistance'), 'body:al', 'contact', { resistance: 2e-4 }),
        bc('air', L(language, '주변 공기', 'Ambient air'), 'exterior', 'convection', { h: 15, Tinf: 30, emissivity: 0.3 }),
      ],
      probes: [{ id: 'p1', name: L(language, '접합부', 'Joint'), x: 150, y: 12 }, { id: 'p2', name: L(language, '구리 끝', 'Copper end'), x: 5, y: 8 }],
      study: { type: 'steady', electric: true },
      ambient: 30,
    };
  },

  fuseElement(language) {
    return {
      name: L(language, '퓨즈 소자 (줄 발열, 과도)', 'Fuse element (Joule heating, transient)'),
      description: L(language, '좁은 목이 있는 구리 퓨즈 소자에 과전류가 흐르면 목에 전류가 몰려 가장 먼저 뜨거워집니다. 전기 저항의 온도 의존성을 넣은 과도 줄 발열 해석입니다.', 'Over-current through a copper fuse element crowds in its narrow neck, which heats first. A transient Joule-heating study with temperature-dependent resistance.'),
      domain: { dim: 2, width: 40, height: 12, depth: 0.3, nx: 160, ny: 48, background: null },
      materials: mats(language, 'copper'),
      bodies: [poly('strip', L(language, '퓨즈 소자', 'Fuse element'), 'copper', [[0, 1], [17, 1], [19, 5], [21, 5], [23, 1], [40, 1], [40, 11], [23, 11], [21, 7], [19, 7], [17, 11], [0, 11]])],
      boundaries: [
        bc('v', L(language, '전압 0.05 V', 'Voltage 0.05 V'), 'left', 'voltage', { V: 0.05 }),
        bc('gnd', L(language, '접지', 'Ground'), 'right', 'ground'),
        bc('ends', L(language, '단자 (방열)', 'Terminals (heat sink)'), 'left', 'temperature', { T: 25 }),
        bc('ends2', L(language, '단자 2', 'Terminal 2'), 'right', 'temperature', { T: 25 }),
        bc('air', L(language, '공기', 'Air'), 'exterior', 'convection', { h: 15, Tinf: 25 }),
      ],
      probes: [{ id: 'p1', name: L(language, '목 중앙', 'Neck centre'), x: 20, y: 6 }],
      study: { type: 'transient', electric: true, endTime: 2, dt: 0.01, frames: 50, initialT: 25 },
    };
  },

  bracketModal(language) {
    return {
      name: L(language, 'L 브래킷 고유 진동수 (모드)', 'L-bracket natural frequencies (modal)'),
      description: L(language, '벽에 고정된 알루미늄 L 브래킷의 처음 여섯 고유 진동수와 모드 형상을 구합니다. 모드 번호를 바꿔 가며 형상을 봅니다.', 'The first six natural frequencies and mode shapes of an aluminium L-bracket fixed to a wall. Pick a mode number to see its shape.'),
      domain: { dim: 2, width: 120, height: 100, depth: 5, nx: 120, ny: 100, background: null },
      materials: mats(language, 'al6061'),
      bodies: [poly('bracket', L(language, 'L 브래킷', 'L-bracket'), 'al6061', [[0, 0], [10, 0], [10, 80], [110, 80], [110, 90], [0, 90]])],
      boundaries: [
        bc('wall', L(language, '벽 고정', 'Wall fixing'), 'left', 'fixed'),
        bc('air', L(language, '공기', 'Air'), 'exterior', 'convection', { h: 10, Tinf: 25 }),
      ],
      probes: [{ id: 'p1', name: L(language, '팔 끝', 'Arm tip'), x: 108, y: 85 }],
      study: { type: 'steady', stress: true, thermalStrain: false, modal: { enabled: true, modes: 6 } },
    };
  },

  cantilever(language) {
    return {
      name: L(language, '외팔보 정적 구조 해석', 'Cantilever static structural'),
      description: L(language, '한쪽 끝을 고정한 강철 보의 끝에 500 N 을 걸고 자중도 더합니다. 처짐과 굽힘 응력을 보고 보 이론 값(δ = FL³/3EI)과 비교합니다.', 'A steel beam fixed at one end carries 500 N at the tip plus its own weight. See the deflection and bending stress and compare with beam theory (δ = FL³/3EI).'),
      domain: { dim: 2, width: 220, height: 40, depth: 10, nx: 220, ny: 40, background: null },
      materials: mats(language, 'steel'),
      bodies: [rect('beam', L(language, '보', 'Beam'), 'steel', 0, 10, 200, 20)],
      boundaries: [
        bc('fix', L(language, '고정단', 'Fixed end'), 'left', 'fixed'),
        bc('load', L(language, '끝 하중 500 N', 'Tip load 500 N'), 'body:beam', 'force', { fx: 0, fy: -500, region: [199, 9, 201, 31] }),
        bc('air', L(language, '공기', 'Air'), 'exterior', 'convection', { h: 10, Tinf: 25 }),
      ],
      probes: [{ id: 'p1', name: L(language, '보 끝', 'Beam tip'), x: 199, y: 20 }],
      study: { type: 'steady', stress: true, thermalStrain: false, gravityLoad: true },
    };
  },

  streetLamp(language) {
    const fins = Array.from({ length: 7 }, (_, i) => rect(`fin${i + 1}`, `${L(language, '핀', 'Fin')} ${i + 1}`, 'adc12', 92 + i * 18, 116, 3, 30));
    return {
      name: L(language, 'LED 가로등 자연 대류', 'LED street lamp, natural convection'),
      description: L(language, '다이캐스팅 하우징 위의 핀이 LED 모듈(60 W)의 열을 주위 공기로 내보냅니다. 부력에 의한 상승 기류와 핀 사이 온도를 봅니다.', 'Fins on a die-cast housing pass the heat of an LED module (60 W) to the air. See the buoyant plume and the temperatures between the fins.'),
      domain: { dim: 2, width: 320, height: 240, depth: 200, nx: 160, ny: 120, background: 'air' },
      materials: mats(language, 'air', 'adc12', 'pcb4', 'glass'),
      bodies: [
        rect('housing', L(language, '하우징', 'Housing'), 'adc12', 80, 100, 160, 16),
        ...fins,
        rect('board', L(language, 'LED 기판', 'LED board'), 'pcb4', 95, 96, 130, 4, { power: 60 }),
        rect('lens', L(language, '렌즈', 'Lens'), 'glass', 90, 88, 140, 3),
      ],
      boundaries: [
        bc('open', L(language, '열린 경계', 'Open boundary'), 'top', 'open', { Tinf: 25 }),
        bc('openL', L(language, '왼쪽 열린 경계', 'Left opening'), 'left', 'open', { Tinf: 25 }),
        bc('openR', L(language, '오른쪽 열린 경계', 'Right opening'), 'right', 'open', { Tinf: 25 }),
        bc('openB', L(language, '아래 열린 경계', 'Bottom opening'), 'bottom', 'open', { Tinf: 25 }),
      ],
      probes: [{ id: 'p1', name: L(language, 'LED 기판', 'LED board'), x: 160, y: 98 }, { id: 'p2', name: L(language, '핀 끝', 'Fin tip'), x: 147, y: 145 }],
      study: { type: 'steady', flow: true, natural: true, flowSteps: 4000, Tref: 25 },
    };
  },

  tubeBank(language) {
    const tubes = [];
    let n = 0;
    for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) {
      const y = 20 + row * 30 + (col % 2 ? 15 : 0);
      if (y > 95) continue;
      n += 1;
      tubes.push(circle(`tube${n}`, `${L(language, '관', 'Tube')} ${n}`, 'copper', 90 + col * 30, y, 8));
    }
    return {
      name: L(language, '관군 열교환기 (난류 직교류)', 'Tube-bank heat exchanger (turbulent cross-flow)'),
      description: L(language, '엇갈려 배열된 80 °C 구리관 사이로 공기가 지나가며 데워집니다. 난류 유동의 후류와 관마다의 열전달량, 공기의 온도 상승과 압력 강하를 봅니다.', 'Air passing staggered copper tubes at 80 °C is heated. See the turbulent wakes, the heat of each tube, and the air\'s temperature rise and pressure drop.'),
      domain: { dim: 2, width: 300, height: 110, depth: 100, nx: 300, ny: 110, background: 'air' },
      materials: mats(language, 'air', 'copper'),
      bodies: tubes,
      boundaries: [
        bc('in', L(language, '유입 공기', 'Inlet air'), 'left', 'inlet', { velocity: 2.5, Tin: 20, turbulenceIntensity: 0.05 }),
        bc('out', L(language, '유출', 'Outlet'), 'right', 'outlet'),
        bc('top', L(language, '위 (대칭)', 'Top (symmetry)'), 'top', 'slip'),
        bc('bottom', L(language, '아래 (대칭)', 'Bottom (symmetry)'), 'bottom', 'slip'),
        ...tubes.map((t, i) => bc(`hot${i + 1}`, `${L(language, '관 온도', 'Tube wall')} ${i + 1}`, `body:${t.id}`, 'temperature', { T: 80 })),
      ],
      probes: [{ id: 'p1', name: L(language, '출구 공기', 'Outlet air'), x: 295, y: 55 }],
      study: { type: 'steady', flow: true, turbulence: 'kOmegaSST', flowSteps: 3000 },
    };
  },

  motorStator(language) {
    const slots = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return circle(`coil${i + 1}`, `${L(language, '코일', 'Coil')} ${i + 1}`, 'copper', 100 + Math.cos(a) * 52, 100 + Math.sin(a) * 52, 7, { power: 6 });
    });
    return {
      name: L(language, '전동기 고정자 단면', 'Electric motor stator section'),
      description: L(language, '알루미늄 하우징 안의 규소강 고정자와 코일 12개(동손 각 6 W). 회전자 공극은 공기층으로 두고, 하우징 바깥의 냉각풍으로 식는 정상 온도를 구합니다.', 'A silicon-steel stator in an aluminium housing with 12 coils (6 W copper loss each). The rotor gap is an air layer; the steady temperature with cooling air outside the housing.'),
      domain: { dim: 2, width: 200, height: 200, depth: 80, nx: 160, ny: 160, background: null },
      materials: mats(language, 'al6061', 'steel', 'copper', 'airCavity'),
      bodies: [
        circle('housing', L(language, '하우징', 'Housing'), 'al6061', 100, 100, 95),
        circle('stator', L(language, '고정자 철심', 'Stator core'), 'steel', 100, 100, 80),
        ...slots,
        circle('gap', L(language, '회전자·공극', 'Rotor and gap'), 'airCavity', 100, 100, 38),
      ],
      boundaries: [bc('air', L(language, '냉각풍', 'Cooling air'), 'exterior', 'convection', { h: 45, Tinf: 40 })],
      probes: [{ id: 'p1', name: L(language, '코일', 'Coil'), x: 152, y: 100 }, { id: 'p2', name: L(language, '하우징', 'Housing'), x: 193, y: 100 }],
      study: { type: 'steady' },
      ambient: 40,
    };
  },

  solarPanel(language) {
    const sun = Array.from({ length: 25 }, (_, h) => [h * 3600, h >= 6 && h <= 18 ? 70 * Math.sin(((h - 6) / 12) * Math.PI) : 0]);
    return {
      name: L(language, '태양광 모듈 하루 (과도)', 'Solar module over a day (transient)'),
      description: L(language, '유리·EVA·셀·백시트로 된 태양광 모듈 단면이 하루 동안 햇빛을 받아 데워졌다 식습니다. 앞면 대류·복사(하늘), 뒷면 대류로 셀 온도의 하루 변화를 봅니다.', 'A PV module section (glass, EVA, cell, backsheet) warms in the sun and cools over a day, with convection and sky radiation in front and convection behind: the daily cell temperature.'),
      domain: { dim: 2, width: 40, height: 4.6, depth: 1000, nx: 20, ny: 92, background: null },
      materials: mats(language, 'glass', 'silicone', 'silicon', 'pvc'),
      bodies: [
        rect('back', L(language, '백시트', 'Backsheet'), 'pvc', 0, 0, 40, 0.3),
        rect('eva2', 'EVA 2', 'silicone', 0, 0.3, 40, 0.45),
        rect('cell', L(language, '태양 전지', 'Solar cell'), 'silicon', 0, 0.75, 40, 0.2, { powerProfile: sun }),
        rect('eva1', 'EVA 1', 'silicone', 0, 0.95, 40, 0.45),
        rect('glassTop', L(language, '전면 유리', 'Front glass'), 'glass', 0, 1.4, 40, 3.2),
      ],
      boundaries: [
        bc('front', L(language, '앞면 (바람 + 하늘)', 'Front (wind + sky)'), 'top', 'convection', { h: 10, Tinf: 25, emissivity: 0.9 }),
        bc('rear', L(language, '뒷면', 'Rear'), 'bottom', 'convection', { h: 5, Tinf: 25, emissivity: 0.8 }),
      ],
      probes: [{ id: 'p1', name: L(language, '셀', 'Cell'), x: 20, y: 0.85 }, { id: 'p2', name: L(language, '유리 표면', 'Glass surface'), x: 20, y: 4.55 }],
      study: { type: 'transient', endTime: 86400, dt: 300, frames: 96, initialT: 18 },
      ambient: 25,
    };
  },

  coldPlate(language) {
    return {
      name: L(language, 'IGBT 수냉 냉각판', 'IGBT liquid cold plate'),
      description: L(language, '세 개의 IGBT 모듈(각 150 W)이 알루미늄 냉각판 위에 있고, 판 속 채널로 물이 흐릅니다. 하류로 갈수록 데워지는 물 때문에 모듈 온도가 달라지는 것을 봅니다.', 'Three IGBT modules (150 W each) sit on an aluminium cold plate with water flowing through it. Downstream the warmer water leaves each module a little hotter.'),
      domain: { dim: 2, width: 240, height: 16, depth: 60, nx: 240, ny: 64, background: null },
      materials: mats(language, 'al6061', 'water', 'silicon', 'grease'),
      bodies: [
        rect('plate', L(language, '냉각판', 'Cold plate'), 'al6061', 0, 0, 240, 12),
        rect('channel', L(language, '물 채널', 'Water channel'), 'water', 0, 3, 240, 5),
        ...[0, 1, 2].map((i) => rect(`tim${i + 1}`, `TIM ${i + 1}`, 'grease', 25 + i * 75, 12, 40, 0.5)),
        ...[0, 1, 2].map((i) => rect(`igbt${i + 1}`, `IGBT ${i + 1}`, 'silicon', 25 + i * 75, 12.5, 40, 3, { power: 150 })),
      ],
      boundaries: [
        bc('in', L(language, '냉각수 유입', 'Coolant in'), 'left', 'inlet', { velocity: 0.3, Tin: 40, range: [3, 8] }),
        bc('out', L(language, '냉각수 유출', 'Coolant out'), 'right', 'outlet', { range: [3, 8] }),
        bc('air', L(language, '공기', 'Air'), 'exterior', 'convection', { h: 5, Tinf: 40 }),
      ],
      probes: [1, 2, 3].map((i) => ({ id: `p${i}`, name: `IGBT ${i}`, x: 45 + (i - 1) * 75, y: 14 })),
      study: { type: 'steady', flow: true, flowSteps: 3000 },
      ambient: 40,
    };
  },

  pipeInsulation(language) {
    return {
      name: L(language, '보온한 증기관의 열손실', 'Heat loss of an insulated steam pipe'),
      description: L(language, '150 °C 증기가 흐르는 강관을 미네랄울과 알루미늄 외피로 보온했습니다. 단면 전도로 미터당 열손실과 외피 표면 온도를 구합니다(단열재 두께를 매개변수 연구로 비교해 보세요).', 'A steel pipe with 150 °C steam, insulated with mineral wool and an aluminium jacket. Conduction through the section gives the heat loss per metre and the jacket temperature (compare insulation thicknesses with a parameter study).'),
      domain: { dim: 2, width: 260, height: 260, depth: 1000, nx: 130, ny: 130, background: null },
      materials: mats(language, 'al6061', 'mineralWool', 'steel', 'airCavity'),
      bodies: [
        circle('jacket', L(language, '알루미늄 외피', 'Aluminium jacket'), 'al6061', 130, 130, 120),
        circle('wool', L(language, '미네랄울', 'Mineral wool'), 'mineralWool', 130, 130, 118),
        circle('pipe', L(language, '강관', 'Steel pipe'), 'steel', 130, 130, 57),
        circle('bore', L(language, '관 내부 (증기)', 'Bore (steam)'), 'airCavity', 130, 130, 51),
      ],
      boundaries: [
        bc('steam', L(language, '증기 150 °C', 'Steam 150 °C'), 'body:bore', 'temperature', { T: 150 }),
        bc('air', L(language, '외기 (바람 + 복사)', 'Outside air (wind + radiation)'), 'exterior', 'convection', { h: 10, Tinf: 10, emissivity: 0.1 }),
      ],
      probes: [{ id: 'p1', name: L(language, '외피 표면', 'Jacket surface'), x: 249, y: 130 }],
      study: { type: 'steady' },
      ambient: 10,
    };
  },
};

export const EXTRA_BUILDERS_LIST = {
  vacuumOven(language) {
    const steel = { ...materialFromLibrary('ss304', language), emissivity: 0.3 };
    const heaterMat = { ...materialFromLibrary('al6061', language), id: 'blackAl', name: L(language, '흑색 아노다이징 알루미늄', 'Black anodised aluminium'), emissivity: 0.85, color: '#55606e' };
    return {
      name: L(language, '진공 오븐 면 사이 복사 (S2S)', 'Vacuum oven, surface-to-surface radiation (S2S)'),
      description: L(language, '진공 상자 안의 히터가 대류 없이 복사로만 벽과 시료에 열을 줍니다. 면 사이 복사(뷰 팩터 · 복사도)를 켜고, 히터 · 시료 · 벽의 온도와 열 흐름 qrad 를 봅니다. 위쪽 창은 바깥으로 열려 있습니다.', 'In an evacuated box a heater warms the walls and a sample by radiation only. With surface-to-surface radiation (view factors and radiosity) on, see the heater, sample and wall temperatures and the net radiative flux qrad. A window in the top opens to the outside.'),
      domain: { dim: 2, width: 160, height: 100, depth: 200, nx: 160, ny: 100, background: null },
      materials: [steel, heaterMat, { ...materialFromLibrary('alumina', language), emissivity: 0.8 }],
      bodies: [
        rect('floor', L(language, '바닥', 'Floor'), 'ss304', 0, 0, 160, 6),
        rect('wallL', L(language, '왼쪽 벽', 'Left wall'), 'ss304', 0, 6, 6, 94),
        rect('wallR', L(language, '오른쪽 벽', 'Right wall'), 'ss304', 154, 6, 6, 94),
        rect('roofL', L(language, '천장 (왼쪽)', 'Roof (left)'), 'ss304', 6, 94, 64, 6),
        rect('roofR', L(language, '천장 (오른쪽)', 'Roof (right)'), 'ss304', 90, 94, 64, 6),
        rect('heater', L(language, '히터', 'Heater'), 'blackAl', 20, 60, 40, 8, { power: 60 }),
        rect('sample', L(language, '시료 (알루미나)', 'Sample (alumina)'), 'alumina', 95, 20, 40, 12),
        rect('stand', L(language, '받침', 'Stand'), 'ss304', 110, 6, 10, 14),
      ],
      boundaries: [
        bc('cooling', L(language, '냉각 바닥 25 °C', 'Cooled floor 25 °C'), 'bottom', 'temperature', { T: 25 }),
        // Only the outer faces of the box: inside it is vacuum (radiation only).
        bc('outsideL', L(language, '바깥 왼쪽', 'Outside left'), 'left', 'convection', { h: 5, Tinf: 25, emissivity: 0.3 }),
        bc('outsideR', L(language, '바깥 오른쪽', 'Outside right'), 'right', 'convection', { h: 5, Tinf: 25, emissivity: 0.3 }),
        bc('outsideT', L(language, '바깥 천장', 'Outside roof'), 'top', 'convection', { h: 5, Tinf: 25, emissivity: 0.3 }),
      ],
      probes: [{ id: 'p1', name: L(language, '히터', 'Heater'), x: 40, y: 64 }, { id: 'p2', name: L(language, '시료', 'Sample'), x: 115, y: 26 }, { id: 'p3', name: L(language, '오른쪽 벽', 'Right wall'), x: 157, y: 50 }],
      study: { type: 'steady', s2s: true, s2sMedium: 'void' },
      ambient: 25,
    };
  },

  sunWallDay(language) {
    const day = [[0, 8], [21600, 10], [36000, 24], [50400, 30], [64800, 20], [86400, 8]];
    return {
      name: L(language, '하루 동안의 외벽 (시간 경계 조건)', 'Outer wall over a day (time-dependent boundaries)'),
      description: L(language, '바깥 기온과 대류 계수가 하루 동안 표에 따라 바뀌고(Tinf(t) · h(t)), 실내는 난방 일정(T(t))을 따릅니다. 단열 외벽 속 온도와 실내 표면 열 흐름이 하루에 어떻게 바뀌는지 봅니다.', 'Outside air temperature and film coefficient follow a daily table (Tinf(t), h(t)) and the room follows a heating schedule (T(t)). See how the temperatures inside an insulated wall and the heat flow at the inside face change over the day.'),
      domain: { dim: 2, width: 330, height: 60, depth: 1000, nx: 165, ny: 6, background: null },
      materials: mats(language, 'brick', 'eps', 'gypsum'),
      bodies: [
        rect('brick', L(language, '벽돌', 'Brick'), 'brick', 0, 0, 200, 60),
        rect('eps', L(language, '단열재 (EPS)', 'Insulation (EPS)'), 'eps', 200, 0, 115, 60),
        rect('plaster', L(language, '석고 마감', 'Plaster'), 'gypsum', 315, 0, 15, 60),
      ],
      boundaries: [
        bc('outside', L(language, '바깥 (하루 변화)', 'Outside (daily cycle)'), 'left', 'convection', { h: 20, Tinf: 8, Tinft: day, ht: [[0, 25], [43200, 12], [86400, 25]] }),
        bc('inside', L(language, '실내 (난방 일정)', 'Inside (heating schedule)'), 'right', 'convection', { h: 7.7, Tinf: 20, Tinft: [[0, 17], [21600, 17], [25200, 21], [79200, 21], [82800, 17], [86400, 17]] }),
      ],
      probes: [{ id: 'p1', name: L(language, '벽돌 가운데', 'Brick middle'), x: 100, y: 30 }, { id: 'p2', name: L(language, '단열재 안쪽', 'Insulation inner side'), x: 312, y: 30 }, { id: 'p3', name: L(language, '실내 표면', 'Inside surface'), x: 329, y: 30 }],
      study: { type: 'transient', endTime: 172800, dt: 600, frames: 96, initialT: 15 },
      ambient: 15,
    };
  },

  coatedTurbine(language) {
    return {
      name: L(language, '단열 코팅 터빈 날개 (박막층)', 'Coated turbine blade wall (thin layer)'),
      description: L(language, '뜨거운 연소 가스에 닿은 니켈 합금 벽에 0.3 mm 세라믹 단열 코팅(TBC)이 있습니다. 코팅을 따로 격자로 나누지 않고 박막층 경계로 넣어, 코팅이 금속 온도를 얼마나 낮추는지 봅니다. 안쪽은 냉각 공기입니다.', 'A nickel-alloy wall facing hot combustion gas carries a 0.3 mm ceramic thermal-barrier coating (TBC). The coating is a thin-layer boundary instead of extra mesh; see how much it lowers the metal temperature. Cooling air flows inside.'),
      domain: { dim: 2, width: 40, height: 20, depth: 50, nx: 80, ny: 40, background: null },
      materials: [{ ...materialFromLibrary('ss304', language), id: 'inconel', name: L(language, '니켈 초합금', 'Nickel superalloy'), k: 20, rho: 8200, cp: 450, color: '#8f9aa6' }],
      bodies: [rect('wall', L(language, '날개 벽', 'Blade wall'), 'inconel', 0, 6, 40, 8)],
      boundaries: [
        bc('tbc', L(language, '세라믹 코팅 0.3 mm', 'Ceramic coating 0.3 mm'), 'body:wall', 'thinLayer', { thickness: 0.3, k: 1.0, mode: 'resistive', region: [0, 13.5, 40, 14.5] }),
        bc('gas', L(language, '연소 가스 1400 °C', 'Combustion gas 1400 °C'), 'body:wall', 'convection', { h: 1500, Tinf: 1400, region: [0, 13.5, 40, 14.5] }),
        bc('cool', L(language, '냉각 공기 600 °C', 'Cooling air 600 °C'), 'body:wall', 'convection', { h: 800, Tinf: 600, region: [0, 5.5, 40, 6.5] }),
      ],
      probes: [{ id: 'p1', name: L(language, '금속 바깥면', 'Metal outer face'), x: 20, y: 13.8 }, { id: 'p2', name: L(language, '금속 안쪽면', 'Metal inner face'), x: 20, y: 6.2 }],
      study: { type: 'steady' },
      ambient: 600,
    };
  },

  naturalFins(language) {
    return {
      name: L(language, '자연 대류 방열판 (h 상관식)', 'Natural-convection heat sink (h correlations)'),
      description: L(language, '세운 방열판의 면마다 h 를 직접 넣지 않고 상관식(수직면 Churchill–Chu, 수평면 위 · 아래)으로 표면 온도에 맞춰 구합니다. 계산된 평균 h 와 LED 온도를 봅니다.', 'Instead of typing h on each face of an upright heat sink, correlations (vertical: Churchill–Chu; horizontal facing up / down) compute it from the surface temperature. See the evaluated mean h and the LED temperature.'),
      domain: { dim: 2, width: 120, height: 80, depth: 100, nx: 120, ny: 80, background: null },
      materials: mats(language, 'alAnodized', 'emc'),
      bodies: [
        rect('base', L(language, '베이스', 'Base'), 'alAnodized', 10, 10, 100, 6),
        ...Array.from({ length: 6 }, (_, i) => rect(`fin${i + 1}`, `${L(language, '핀', 'Fin')} ${i + 1}`, 'alAnodized', 12 + i * 18, 16, 3, 50)),
        rect('led', 'LED', 'emc', 45, 4, 30, 6, { power: 12 }),
      ],
      boundaries: [
        bc('sides', L(language, '세로면 (수직 상관식)', 'Vertical faces (vertical correlation)'), 'exterior', 'convection', { h: 5, Tinf: 25, emissivity: 0.8, hMode: 'naturalVertical', length: 50 }),
        bc('top', L(language, '핀 끝 (수평면 위)', 'Fin tips (horizontal, facing up)'), 'exterior', 'convection', { h: 5, Tinf: 25, emissivity: 0.8, hMode: 'naturalHorizontalUp', length: 20, region: [0, 64, 120, 68] }),
      ],
      probes: [{ id: 'p1', name: 'LED', x: 60, y: 7 }, { id: 'p2', name: L(language, '핀 끝', 'Fin tip'), x: 49.5, y: 64 }],
      study: { type: 'steady' },
      ambient: 25,
    };
  },

  heatSink3d(language) {
    const fins = Array.from({ length: 6 }, (_, i) => rect(`fin${i + 1}`, `${L(language, '핀', 'Fin')} ${i + 1}`, 'al6061', 30, 4, 60, 30, { z0: 12 + i * 6, z1: 14 + i * 6 }));
    return {
      name: L(language, '3D 방열판 덕트 (3D CHT)', 'Heat sink in a duct (3D CHT)'),
      description: L(language, '덕트 속 공기(1.5 m/s)가 칩 위의 판형 핀 방열판 사이를 흐릅니다. 3D 유동과 고체 전도를 함께 풀어 핀 사이 유속 · 칩 온도 · 압력 강하를 보고, 3D 보기의 단면으로 핀 사이 흐름을 봅니다.', 'Duct air at 1.5 m/s flows between the plate fins of a heat sink on a chip. 3D flow and solid conduction are solved together: the speed between the fins, the chip temperature and the pressure drop; slice the 3D view to see the flow between the fins.'),
      domain: { dim: 3, width: 120, height: 50, depth: 60, nx: 48, ny: 20, nz: 30, background: 'air' },
      materials: mats(language, 'air', 'al6061', 'silicon'),
      bodies: [
        rect('base', L(language, '베이스', 'Base'), 'al6061', 30, 0, 60, 4, { z0: 10, z1: 50 }),
        ...fins,
        rect('chip', L(language, '칩', 'Chip'), 'silicon', 50, 0, 20, 2, { z0: 22, z1: 38, power: 15 }),
      ],
      boundaries: [
        bc('in', L(language, '유입 (1.5 m/s)', 'Inlet (1.5 m/s)'), 'left', 'inlet', { velocity: 1.5, Tin: 25 }),
        bc('out', L(language, '유출', 'Outlet'), 'right', 'outlet'),
      ],
      probes: [{ id: 'p1', name: L(language, '칩', 'Chip'), x: 60, y: 1, z: 30 }, { id: 'p2', name: L(language, '출구 중앙', 'Outlet centre'), x: 118, y: 25, z: 30 }],
      study: { type: 'steady', flow: true, flowSteps: 3000 },
      ambient: 25,
    };
  },

  sunCabinet3d(language) {
    return {
      name: L(language, '햇빛 아래 옥외 함체 (태양 하중, 3D)', 'Outdoor cabinet in the sun (solar load, 3D)'),
      description: L(language, '여름 한낮(일사 900 W/m², 고도 65°) 옥외 통신 함체가 안의 장비 열 40 W 와 햇빛을 함께 받습니다. 위의 차양판이 함체 윗면에 그림자를 드리웁니다 — 해석 설정의 태양 고도 · 방위각을 바꾸거나 차양을 숨겨 장비 온도를 비교해 보세요.', 'An outdoor telecom cabinet at summer noon (900 W/m², 65° elevation) takes 40 W of equipment heat and the sun. A sunshade above casts its shadow on the roof — change the sun elevation and azimuth in the study settings, or hide the shade, and compare the equipment temperature.'),
      domain: { dim: 3, width: 800, height: 900, depth: 600, nx: 40, ny: 45, nz: 30, background: null },
      materials: [
        { ...materialFromLibrary('steel', language), id: 'shell', name: L(language, '도장 강판 (밝은 회색)', 'Painted steel (light grey)'), absorptivity: 0.45, emissivity: 0.9 },
        { ...materialFromLibrary('air', language), id: 'innerAir', kind: 'solid', name: L(language, '내부 공기 (유효 전도)', 'Inside air (effective conduction)'), k: 2, color: '#cfe3f0' },
        ...mats(language, 'al6061'),
      ],
      bodies: [
        rect('box', L(language, '함체', 'Cabinet'), 'shell', 200, 0, 400, 600, { z0: 100, z1: 500 }),
        rect('inside', L(language, '내부', 'Inside'), 'innerAir', 220, 20, 360, 560, { z0: 120, z1: 480 }),
        rect('rack', L(language, '장비', 'Equipment'), 'al6061', 300, 120, 200, 300, { z0: 200, z1: 400, power: 40 }),
        rect('shade', L(language, '차양판', 'Sunshade'), 'shell', 160, 700, 480, 20, { z0: 60, z1: 540 }),
        rect('post', L(language, '차양 기둥', 'Shade post'), 'shell', 380, 600, 40, 100, { z0: 280, z1: 320 }),
      ],
      boundaries: [
        bc('air', L(language, '바깥 공기 (대류 + 복사)', 'Outside air (convection + radiation)'), 'exterior', 'convection', { h: 8, Tinf: 35, emissivity: 0.9 }),
      ],
      probes: [{ id: 'p1', name: L(language, '장비', 'Equipment'), x: 400, y: 270, z: 300 }, { id: 'p2', name: L(language, '함체 윗면', 'Cabinet roof'), x: 400, y: 590, z: 300 }],
      study: { type: 'steady', solar: { enabled: true, irradiance: 900, elevation: 65, azimuth: 30 } },
      ambient: 35,
    };
  },

  fanChassis3d(language) {
    return {
      name: L(language, '내부 팬 섀시 (3D)', 'Chassis with an internal fan (3D)'),
      description: L(language, '양 끝이 열린 섀시 안의 내부 팬이 팬 곡선을 따라 공기를 밀어 두 보드의 부품을 식힙니다. 팬 곡선과 섀시 저항이 만나는 운전점(L/s · Pa)을 팬의 속성에서, 부품 온도를 탐침에서 봅니다.', 'An internal fan inside a chassis open at both ends pushes air along its fan curve over the parts on two boards. The operating point where the curve meets the chassis resistance (L/s, Pa) is in the fan\'s properties, the part temperatures in the probes.'),
      domain: { dim: 3, width: 160, height: 60, depth: 80, nx: 64, ny: 24, nz: 32, background: 'air' },
      materials: mats(language, 'air', 'fr4', 'emc', 'al6061'),
      bodies: [
        rect('board1', L(language, '보드 1', 'Board 1'), 'fr4', 50, 7.5, 100, 2.5, { z0: 5, z1: 75 }),
        rect('cpu', 'CPU', 'emc', 80, 10, 24, 2.5, { z0: 27.5, z1: 52.5, power: 4 }),
        rect('sink', L(language, 'CPU 방열판', 'CPU heat sink'), 'al6061', 80, 12.5, 24, 2.5, { z0: 25, z1: 55 }),
        ...[25, 35, 45, 52.5].map((z0, i) => rect(`sinkFin${i + 1}`, `${L(language, '방열핀', 'Sink fin')} ${i + 1}`, 'al6061', 80, 15, 24, 15, { z0, z1: z0 + 2.5 })),
        rect('board2', L(language, '보드 2', 'Board 2'), 'fr4', 50, 35, 100, 2.5, { z0: 5, z1: 75 }),
        rect('vr', L(language, '전원부', 'Voltage regulator'), 'emc', 110, 37.5, 15, 5, { z0: 12.5, z1: 35, power: 1 }),
      ],
      boundaries: [
        bc('fan', L(language, '내부 팬', 'Internal fan'), 'interior', 'internalFan', { region: [20, 0, 0, 27.5, 60, 80], direction: '+x', curve: [[0, 20], [0.002, 12], [0.004, 0]] }),
        bc('front', L(language, '앞 열림', 'Front opening'), 'left', 'open', { Tinf: 25 }),
        bc('rear', L(language, '뒤 배기구', 'Rear exhaust'), 'right', 'outlet'),
      ],
      probes: [{ id: 'p1', name: 'CPU', x: 92, y: 11.25, z: 40 }, { id: 'p2', name: L(language, '전원부', 'Voltage regulator'), x: 117.5, y: 38.75, z: 23.75 }],
      study: { type: 'steady', flow: true, turbulence: 'kOmegaSST', flowSteps: 3000 },
      ambient: 25,
    };
  },


  balconySlab(language) {
    return {
      name: L(language, '발코니 슬래브 열교 (THERM 방식)', 'Balcony slab thermal bridge (THERM-style)'),
      description: L(language, '외단열 벽을 콘크리트 발코니 슬래브가 관통합니다. 정상 상태 2D 전도로 열교를 지나는 열 흐름과 실내 모서리의 최저 표면 온도를 구하고, 결로 위험(fRsi)을 봅니다.', 'A concrete balcony slab runs through an externally insulated wall. Steady 2D conduction gives the heat flow through the thermal bridge and the lowest indoor corner temperature, with the condensation risk (fRsi).'),
      domain: { dim: 2, width: 1600, height: 1200, depth: 1000, nx: 160, ny: 120, background: null },
      materials: mats(language, 'concrete', 'eps', 'gypsum'),
      bodies: [
        rect('wallLow', L(language, '아래층 벽', 'Lower wall'), 'concrete', 500, 0, 200, 500),
        rect('wallHigh', L(language, '위층 벽', 'Upper wall'), 'concrete', 500, 700, 200, 500),
        rect('slab', L(language, '바닥·발코니 슬래브', 'Floor and balcony slab'), 'concrete', 0, 500, 1600, 200),
        rect('insLow', L(language, '외단열 (아래)', 'External insulation (lower)'), 'eps', 380, 0, 120, 500),
        rect('insHigh', L(language, '외단열 (위)', 'External insulation (upper)'), 'eps', 380, 700, 120, 500),
        rect('plasterLow', L(language, '석고 마감 (아래)', 'Plaster (lower)'), 'gypsum', 700, 0, 20, 500),
        rect('plasterHigh', L(language, '석고 마감 (위)', 'Plaster (upper)'), 'gypsum', 700, 700, 20, 500),
      ],
      boundaries: [
        bc('outside', L(language, '외기 −10 °C', 'Outside −10 °C'), 'left', 'convection', { h: 25, Tinf: -10 }),
        bc('inside', L(language, '실내 20 °C', 'Inside 20 °C'), 'right', 'convection', { h: 7.7, Tinf: 20 }),
      ],
      probes: [{ id: 'p1', name: L(language, '실내 모서리 (위)', 'Inner corner (upper)'), x: 725, y: 705 }, { id: 'p2', name: L(language, '실내 벽 중앙', 'Inner wall, middle'), x: 715, y: 1100 }, { id: 'p3', name: L(language, '발코니 끝', 'Balcony tip'), x: 20, y: 600 }],
      study: { type: 'steady' },
      ambient: 20,
    };
  },

  iceThaw(language) {
    return {
      name: L(language, '얼음 녹이기 (상변화)', 'Thawing ice (phase change)'),
      description: L(language, '냉동실에서 꺼낸 −10 °C 얼음 덩어리와 쟁반을 25 °C 실내에 둡니다. 잠열을 겉보기 열용량으로 푼 상변화 해석으로, 녹은 비율과 0 °C 에 머무는 시간을 봅니다.', 'A −10 °C block of ice and its tray come out of the freezer into a 25 °C room. The phase change (latent heat as an apparent heat capacity) shows the melted fraction and how long the ice stays at 0 °C.'),
      domain: { dim: 2, width: 120, height: 70, depth: 60, nx: 120, ny: 70, background: null },
      materials: mats(language, 'ice', 'al6061'),
      bodies: [
        rect('tray', L(language, '알루미늄 쟁반', 'Aluminium tray'), 'al6061', 0, 0, 120, 3),
        rect('ice', L(language, '얼음', 'Ice'), 'ice', 25, 3, 70, 50),
      ],
      boundaries: [
        bc('room', L(language, '실내 공기 25 °C', 'Room air 25 °C'), 'exterior', 'convection', { h: 12, Tinf: 25, emissivity: 0.9 }),
      ],
      probes: [{ id: 'p1', name: L(language, '얼음 가운데', 'Ice centre'), x: 60, y: 28 }, { id: 'p2', name: L(language, '얼음 모서리', 'Ice corner'), x: 27, y: 51 }, { id: 'p3', name: L(language, '쟁반 끝', 'Tray edge'), x: 5, y: 1.5 }],
      study: { type: 'transient', endTime: 7200, dt: 20, frames: 60, initialT: -10 },
      ambient: 25,
    };
  },

  massConcrete(language) {
    return {
      name: L(language, '매스 콘크리트 수화열 (과도)', 'Mass concrete heat of hydration (transient)'),
      description: L(language, '두께 2 m 기초 콘크리트를 부으면 시멘트 수화열이 사흘 동안 나옵니다. 시간에 따라 줄어드는 발열로 중심과 표면의 온도 차(균열 위험, 보통 20 °C 이하 권장)를 봅니다.', 'A 2 m thick concrete foundation releases cement hydration heat over three days. With heat that fades with time, see the core-to-surface temperature difference (crack risk; usually kept under 20 °C).'),
      domain: { dim: 2, width: 6000, height: 3000, depth: 1000, nx: 120, ny: 60, background: null },
      materials: mats(language, 'concrete', 'eps', 'brick'),
      bodies: [
        rect('ground', L(language, '지반', 'Ground'), 'brick', 0, 0, 6000, 800),
        rect('footing', L(language, '기초 콘크리트 (수화열)', 'Footing concrete (hydration heat)'), 'concrete', 1000, 800, 4000, 2000, { powerProfile: [[0, 0], [3600, 5500], [43200, 4500], [86400, 2400], [172800, 900], [259200, 350], [432000, 100]] }),
        rect('blanket', L(language, '보온 덮개', 'Insulating blanket'), 'eps', 1000, 2800, 4000, 50),
      ],
      boundaries: [
        bc('air', L(language, '바깥 공기 10 °C', 'Outside air 10 °C'), 'exterior', 'convection', { h: 12, Tinf: 10 }),
        bc('deep', L(language, '깊은 지반 12 °C', 'Deep ground 12 °C'), 'bottom', 'temperature', { T: 12 }),
      ],
      probes: [{ id: 'p1', name: L(language, '중심', 'Core'), x: 3000, y: 1800 }, { id: 'p2', name: L(language, '윗면 (덮개 아래)', 'Top (under blanket)'), x: 3000, y: 2780 }, { id: 'p3', name: L(language, '옆면', 'Side face'), x: 1030, y: 1800 }],
      study: { type: 'transient', endTime: 604800, dt: 1800, frames: 56, initialT: 15 },
      ambient: 10,
    };
  },

  inductionPan(language) {
    return {
      name: L(language, '인덕션 냄비 물 데우기 (과도)', 'Induction pan heating water (transient)'),
      description: L(language, '인덕션이 강철 냄비 바닥에 직접 2 kW 를 넣어 물을 데웁니다. 유리 세라믹 상판으로 새는 열과, 냄비 바닥·물의 온도가 시간에 따라 오르는 모습을 봅니다 (물의 대류는 유효 전도율로 근사).', 'An induction hob puts 2 kW straight into the steel bottom of a pan of water. See the heat lost into the glass-ceramic top and how the pan bottom and the water warm up over time (the water convection is approximated by an effective conductivity).'),
      domain: { dim: 2, width: 300, height: 160, depth: 200, nx: 150, ny: 80, background: null },
      materials: [...mats(language, 'steel', 'glass'), { ...materialFromLibrary('water', language), id: 'waterEff', name: L(language, '물 (유효 전도율)', 'Water (effective conductivity)'), kind: 'solid', k: 25 }],
      bodies: [
        rect('hob', L(language, '유리 세라믹 상판', 'Glass-ceramic top'), 'glass', 0, 0, 300, 6),
        rect('bottom', L(language, '냄비 바닥 (발열)', 'Pan bottom (heated)'), 'steel', 50, 6, 200, 4, { powerProfile: [[0, 0], [2, 2000], [600, 2000]] }),
        rect('wallL', L(language, '냄비 벽 (왼쪽)', 'Pan wall (left)'), 'steel', 50, 10, 2, 120),
        rect('wallR', L(language, '냄비 벽 (오른쪽)', 'Pan wall (right)'), 'steel', 248, 10, 2, 120),
        rect('water', L(language, '물', 'Water'), 'waterEff', 52, 10, 196, 100),
      ],
      boundaries: [
        bc('room', L(language, '주방 공기', 'Kitchen air'), 'exterior', 'convection', { h: 10, Tinf: 22, emissivity: 0.8 }),
      ],
      probes: [{ id: 'p1', name: L(language, '냄비 바닥', 'Pan bottom'), x: 150, y: 8 }, { id: 'p2', name: L(language, '물 가운데', 'Water centre'), x: 150, y: 60 }, { id: 'p3', name: L(language, '물 표면', 'Water surface'), x: 150, y: 108 }, { id: 'p4', name: L(language, '상판 가장자리', 'Hob edge'), x: 20, y: 3 }],
      study: { type: 'transient', endTime: 600, dt: 5, frames: 60, initialT: 22 },
      ambient: 22,
    };
  },


  tumorAblation(language) {
    const tissue = { id: 'tissue', name: L(language, '간 조직', 'Liver tissue'), kind: 'solid', color: '#c97a7a', k: 0.52, rho: 1060, cp: 3600, emissivity: 0.95, perfusion: 0.0064, metabolic: 700, bloodT: 37, E: 1e4, nu: 0.45, alpha: 0 };
    const tumor = { ...tissue, id: 'tumor', name: L(language, '종양', 'Tumour'), color: '#8b3a62', perfusion: 0.0016, metabolic: 4000 };
    return {
      name: L(language, '종양 고주파 소작 (생체 열전달)', 'Tumour RF ablation (bioheat)'),
      description: L(language, '간 조직 속 종양에 넣은 전극이 10분 동안 열을 냅니다. 혈류 관류와 대사열을 넣은 Pennes 생체 열전달식으로, 종양이 50 °C 이상(세포 괴사)에 이르는지와 주변 조직의 온도를 봅니다.', 'An electrode in a liver tumour heats for 10 minutes. With blood perfusion and metabolic heat (Pennes bioheat equation), see whether the tumour reaches 50 °C (cell death) and how hot the tissue round it gets.'),
      domain: { dim: 2, width: 80, height: 80, depth: 30, nx: 160, ny: 160, background: null },
      materials: [tissue, tumor, materialFromLibrary('ss304', language)],
      bodies: [
        rect('liver', L(language, '간', 'Liver'), 'tissue', 0, 0, 80, 80),
        circle('tumour', L(language, '종양', 'Tumour'), 'tumor', 40, 40, 12),
        rect('probe', L(language, '전극', 'Electrode'), 'ss304', 39, 30, 2, 50, { powerProfile: [[0, 0], [5, 26], [600, 26], [605, 0], [900, 0]] }),
      ],
      boundaries: [bc('skin', L(language, '체온 경계', 'Body temperature'), 'exterior', 'temperature', { T: 37 })],
      probes: [{ id: 'p1', name: L(language, '종양 가장자리', 'Tumour edge'), x: 51, y: 40 }, { id: 'p2', name: L(language, '전극 끝', 'Electrode tip'), x: 42.5, y: 31 }, { id: 'p3', name: L(language, '건강한 조직', 'Healthy tissue'), x: 65, y: 40 }],
      study: { type: 'transient', endTime: 900, dt: 5, frames: 60, initialT: 37 },
      ambient: 37,
    };
  },

  fanEnclosure(language) {
    return {
      name: L(language, '팬 곡선 전자 함체 (Icepak 방식)', 'Fan-cooled enclosure with a fan curve (Icepak-style)'),
      description: L(language, '전자 함체 왼쪽의 팬이 필터(다공성)를 지나 보드 위로 공기를 밀어 냅니다. 팬 곡선(압력–유량)과 함체 저항이 만나는 운전점을 찾고, 그때의 부품 온도를 봅니다.', 'A fan at the left of an electronics enclosure pushes air through a filter (porous) over the board. The operating point where the fan curve meets the enclosure resistance is found, with the part temperatures at that point.'),
      domain: { dim: 2, width: 240, height: 80, depth: 100, nx: 240, ny: 80, background: 'air' },
      materials: [...mats(language, 'air', 'pcb4', 'emc', 'al6061'), { ...materialFromLibrary('alFoam', language), id: 'filter', name: L(language, '먼지 필터 (다공성)', 'Dust filter (porous)'), porosity: 0.85, permeability: 5e-8, color: '#9aa2ad' }],
      bodies: [
        rect('filter', L(language, '필터', 'Filter'), 'filter', 6, 10, 6, 60),
        rect('board', L(language, '보드', 'Board'), 'pcb4', 30, 10, 200, 2),
        rect('cpu', 'CPU', 'emc', 70, 12, 20, 4, { power: 10 }),
        rect('sink', L(language, '방열판', 'Heat sink'), 'al6061', 62, 16, 36, 24),
        rect('fpga', 'FPGA', 'emc', 130, 12, 18, 3, { power: 4 }),
        rect('psu', L(language, '전원부', 'Power supply'), 'emc', 180, 12, 35, 20, { power: 8 }),
      ],
      boundaries: [
        bc('fan', L(language, '팬', 'Fan'), 'left', 'fan', { curve: [[0, 80], [0.004, 60], [0.008, 30], [0.011, 0]], Tin: 30, range: [10, 70], turbulenceIntensity: 0.1 }),
        bc('vent', L(language, '배기구', 'Exhaust vent'), 'right', 'outlet', { range: [20, 60] }),
      ],
      probes: [{ id: 'p1', name: 'CPU', x: 80, y: 14 }, { id: 'p2', name: 'FPGA', x: 139, y: 13.5 }, { id: 'p3', name: L(language, '전원부', 'Power supply'), x: 197, y: 22 }],
      study: { type: 'steady', flow: true, turbulence: 'kOmegaSST', flowSteps: 3000 },
      ambient: 30,
    };
  },


  dbcModule(language) {
    const die = (id, x, y, name) => rect(id, name, 'silicon', x, y, 10, 10, { z0: 2.85, z1: 3.0, power: 60 });
    const solder = (id, x, y) => rect(id, 'SAC305', 'sac305', x, y, 10, 10, { z0: 2.7, z1: 2.85 });
    return {
      name: L(language, '전력 모듈 DBC 기판 (3D 열응력)', 'Power module on a DBC substrate (3D thermal stress)'),
      description: L(language, '구리 베이스판 위 DBC(구리·질화알루미늄·구리) 기판에 IGBT 칩 4개(각 60 W)가 솔더로 붙어 있습니다. 수냉되는 바닥으로 열이 빠지는 3D 온도와, 재료마다 다른 열팽창이 만드는 솔더·세라믹 응력을 봅니다.', 'Four IGBT dies (60 W each) soldered onto a DBC substrate (copper / aluminium nitride / copper) on a copper base plate. The 3D temperature with a water-cooled bottom, and the solder and ceramic stress from mismatched expansion.'),
      // 0.15 mm layers: one cell each through the thickness (dz = 3.0 / 20).
      domain: { dim: 3, width: 60, height: 40, depth: 3.0, nx: 30, ny: 20, nz: 20, background: null },
      materials: mats(language, 'copper', 'aln', 'sac305', 'silicon'),
      bodies: [
        rect('base', L(language, '구리 베이스판', 'Copper base plate'), 'copper', 0, 0, 60, 40, { z0: 0, z1: 1.5 }),
        rect('solderBase', L(language, '기판 솔더', 'Substrate solder'), 'sac305', 5, 5, 50, 30, { z0: 1.5, z1: 1.65 }),
        rect('cuBottom', L(language, 'DBC 아래 구리', 'DBC bottom copper'), 'copper', 5, 5, 50, 30, { z0: 1.65, z1: 1.95 }),
        rect('ceramic', L(language, 'AlN 세라믹', 'AlN ceramic'), 'aln', 4, 4, 52, 32, { z0: 1.95, z1: 2.4 }),
        rect('cuTop', L(language, 'DBC 위 구리', 'DBC top copper'), 'copper', 5, 5, 50, 30, { z0: 2.4, z1: 2.7 }),
        solder('s1', 10, 8), solder('s2', 30, 8), solder('s3', 10, 22), solder('s4', 30, 22),
        die('d1', 10, 8, 'IGBT 1'), die('d2', 30, 8, 'IGBT 2'), die('d3', 10, 22, 'IGBT 3'), die('d4', 30, 22, 'IGBT 4'),
      ],
      boundaries: [
        bc('cool', L(language, '수냉 바닥', 'Water-cooled bottom'), 'front', 'convection', { h: 3000, Tinf: 65 }),
        bc('air', L(language, '모듈 내부 (겔)', 'Inside the module (gel)'), 'exterior', 'convection', { h: 5, Tinf: 80 }),
      ],
      probes: [{ id: 'p1', name: 'IGBT 1', x: 15, y: 13, z: 2.92 }, { id: 'p2', name: 'IGBT 4', x: 35, y: 27, z: 2.92 }],
      study: { type: 'steady', stress: true, Tref: 25 },
      ambient: 65,
      reliability: { components: [{ body: 's1', Ea: 0.8, Tref: 125, mttfRef: 100000, cycles: 20000, cm: { C: 3e6, n: 2.1 } }] },
    };
  },

  floorHeating(language) {
    const pipes = [0, 1, 2, 3].map((i) => circle(`pipe${i + 1}`, `${L(language, '온수관', 'Hot water pipe')} ${i + 1}`, 'pexWater', 75 + i * 150, 45, 8));
    return {
      name: L(language, '온수 바닥 난방 단면', 'Hydronic floor heating section'),
      description: L(language, '단열재 위 몰탈 속에 150 mm 간격으로 묻힌 40 °C 온수관이 바닥을 데웁니다. 바닥 표면 온도의 고르기(관 위와 관 사이 차이)와 아래로 새는 열을 봅니다.', 'Hot-water pipes at 40 °C buried 150 mm apart in screed over insulation warm the floor. See how even the surface temperature is (over versus between the pipes) and how much heat leaks downwards.'),
      domain: { dim: 2, width: 600, height: 200, depth: 1000, nx: 300, ny: 100, background: null },
      materials: [...mats(language, 'concrete', 'eps', 'wood'), { ...materialFromLibrary('pvc', language), id: 'pexWater', name: L(language, 'PEX 관 (물 포함, 유효)', 'PEX pipe with water (effective)'), k: 0.6, color: '#d9534f' }],
      bodies: [
        rect('base', L(language, '구조 슬래브', 'Structural slab'), 'concrete', 0, 0, 600, 100),
        rect('insulation', L(language, '단열재', 'Insulation'), 'eps', 0, 100, 600, 30),
        rect('screed', L(language, '난방 몰탈', 'Heating screed'), 'concrete', 0, 130, 600, 55),
        rect('floor', L(language, '마루', 'Wooden floor'), 'wood', 0, 185, 600, 15),
        ...pipes.map((p) => ({ ...p, cy: 150 })),
      ],
      boundaries: [
        ...pipes.map((p, i) => bc(`water${i + 1}`, `${L(language, '온수 40 °C', 'Water 40 °C')} ${i + 1}`, `body:${p.id}`, 'temperature', { T: 40 })),
        bc('room', L(language, '실내 (20 °C)', 'Room (20 °C)'), 'top', 'convection', { h: 10.8, Tinf: 20 }),
        bc('below', L(language, '아래층', 'Room below'), 'bottom', 'convection', { h: 6, Tinf: 18 }),
      ],
      probes: [{ id: 'p1', name: L(language, '관 위 바닥', 'Floor over a pipe'), x: 225, y: 199 }, { id: 'p2', name: L(language, '관 사이 바닥', 'Floor between pipes'), x: 300, y: 199 }],
      study: { type: 'steady' },
      ambient: 20,
      view: { uFactor: { warm: 'room', cold: 'below' } },
    };
  },

  mugCooling(language) {
    return {
      name: L(language, '커피 머그컵 식기 (과도)', 'Cooling coffee mug (transient)'),
      description: L(language, '80 °C 커피가 담긴 도자기 머그컵이 실내 공기(자연 대류 + 복사)로 30분 동안 식어 가는 과정입니다. 커피와 컵 손잡이 쪽 온도 변화를 탐침으로 봅니다.', 'A ceramic mug of 80 °C coffee cools in room air (natural convection + radiation) over 30 minutes. Probes follow the coffee and the side where you hold the mug.'),
      domain: { dim: 2, width: 120, height: 110, depth: 80, nx: 120, ny: 110, background: null },
      materials: [...mats(language, 'alumina', 'wood'), { ...materialFromLibrary('water', language), id: 'coffee', name: L(language, '커피 (정지 물)', 'Coffee (still water)'), kind: 'solid', k: 0.6, color: '#6b3e26' }],
      bodies: [
        rect('table', L(language, '나무 탁자', 'Wooden table'), 'wood', 0, 0, 120, 10),
        rect('mug', L(language, '머그컵', 'Mug'), 'alumina', 25, 10, 70, 95),
        rect('coffee', L(language, '커피', 'Coffee'), 'coffee', 30, 15, 60, 80),
        rect('handle', L(language, '손잡이', 'Handle'), 'alumina', 95, 40, 15, 40),
      ],
      boundaries: [
        bc('air', L(language, '실내 공기 (자연 대류 + 복사)', 'Room air (natural convection + radiation)'), 'exterior', 'convection', { h: 7, Tinf: 22, emissivity: 0.9 }),
        bc('top', L(language, '커피 표면 (증발 포함 유효)', 'Coffee surface (with evaporation, effective)'), 'body:coffee', 'convection', { h: 25, Tinf: 22, region: [29, 94, 91, 96] }),
        bc('tableBottom', L(language, '탁자 아래', 'Under the table'), 'bottom', 'convection', { h: 3, Tinf: 22 }),
      ],
      probes: [{ id: 'p1', name: L(language, '커피', 'Coffee'), x: 60, y: 55 }, { id: 'p2', name: L(language, '손잡이', 'Handle'), x: 103, y: 60 }, { id: 'p3', name: L(language, '탁자 표면', 'Table top'), x: 15, y: 9 }],
      // The coffee starts hot and the rest at room temperature: a uniform start at 80 °C would heat the table, so the
      // study begins with everything at 80 °C and the cooling is read from the coffee probe.
      study: { type: 'transient', endTime: 1800, dt: 5, frames: 60, initialT: 80 },
      ambient: 22,
    };
  },
};

export const MORE_TAGS = {
  vacuumOven: ['S2S radiation', 'COMSOL', 'Icepak'],
  sunWallDay: ['Transient', 'Time BC', 'Simcenter'],
  coatedTurbine: ['Thin layer', 'COMSOL'],
  naturalFins: ['h correlation', 'SOLIDWORKS', 'Steady'],
  heatSink3d: ['3D', 'CHT', 'Icepak'],
  fanChassis3d: ['3D', 'Internal fan', 'Icepak'],
  sunCabinet3d: ['3D', 'Solar', 'Icepak'],
  balconySlab: ['THERM', 'Steady', 'Building'],
  iceThaw: ['Phase change', 'Transient', 'COMSOL'],
  massConcrete: ['Transient', 'Civil', 'Simcenter'],
  inductionPan: ['Transient', 'Heating', 'SOLIDWORKS'],
  tumorAblation: ['Bioheat', 'Transient', 'COMSOL'],
  fanEnclosure: ['Fan', 'Turbulent', 'Icepak'],
  dbcModule: ['3D', 'Stress', 'Electronics'],
  floorHeating: ['2D', 'Building'],
  mugCooling: ['Transient', 'Radiation'],
  turbulentDuct: ['Turbulent', 'CHT', 'SimScale'],
  dataCenter: ['Turbulent', 'Porous', 'SimScale'],
  officeComfort: ['Comfort', 'Natural', 'SimScale'],
  busbar: ['Joule', 'Contact', 'SimScale'],
  fuseElement: ['Joule', 'Transient'],
  bracketModal: ['Modal', 'SimScale'],
  cantilever: ['Static', 'SimScale'],
  streetLamp: ['Natural', 'CHT'],
  tubeBank: ['Turbulent', 'CHT'],
  motorStator: ['2D', 'Motor'],
  solarPanel: ['Transient', 'Radiation'],
  coldPlate: ['CHT', 'Electronics'],
  pipeInsulation: ['2D', 'Insulation'],
};

export const MORE_BUILDERS = { ...MORE_BUILDERS_BASE, ...EXTRA_BUILDERS_LIST };
