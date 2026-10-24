// Sample models — one for each kind of study the tools this program follows
// are known for (electronics cooling, CHT, phase change, porous media, thermal
// stress, battery transients, building envelopes, spacecraft radiators).
// `npm run samples` also writes them to samples/*.myheat.
import { materialFromLibrary } from './materials.js';
import { normalizeModel } from './model.js';
import { MORE_BUILDERS, MORE_TAGS } from './samples-more.js';

const mats = (language, ...ids) => ids.map((id) => materialFromLibrary(id, language));
const rect = (id, name, material, x, y, w, h, extra = {}) => ({ id, name, shape: 'rect', material, x, y, w, h, ...extra });
const bc = (id, name, target, type, values = {}) => ({ id, name, target, type, ...values });
const L = (language, ko, en) => (language === 'en' ? en : ko);

/** id → builder(language) */
const BUILDERS = {
  tutorial(language) {
    return {
      name: L(language, '튜토리얼: 전원 모듈', 'Tutorial: power module'),
      description: L(language, '튜토리얼에서 쓰는 작은 모델입니다. PCB 위의 MOSFET 두 개와 게이트 드라이버가 열 패드를 거쳐 알루미늄 방열판으로 열을 보내고, 방열판은 팬 바람(대류)으로 식습니다.', 'The small model the tutorial uses: two MOSFETs and a gate driver on a PCB pass their heat through a thermal pad into an aluminium heat sink cooled by fan air (convection).'),
      domain: { dim: 2, width: 80, height: 30, depth: 40, nx: 160, ny: 60, background: null },
      materials: mats(language, 'pcb4', 'silicon', 'tim', 'al6061', 'emc'),
      bodies: [
        rect('pcb', 'PCB', 'pcb4', 0, 0, 80, 1.6),
        rect('q1', 'MOSFET Q1', 'silicon', 14, 1.6, 12, 2.4, { power: 6 }),
        rect('q2', 'MOSFET Q2', 'silicon', 34, 1.6, 12, 2.4, { power: 6 }),
        rect('drv', L(language, '게이트 드라이버', 'Gate driver'), 'emc', 60, 1.6, 8, 1.6, { power: 0.5 }),
        rect('pad', L(language, '열 패드', 'Thermal pad'), 'tim', 10, 4, 40, 1),
        rect('sink', L(language, '방열판', 'Heat sink'), 'al6061', 8, 5, 44, 5),
        ...Array.from({ length: 6 }, (_, i) => rect(`fin${i + 1}`, `${L(language, '핀', 'Fin')} ${i + 1}`, 'al6061', 9 + i * 8, 10, 2, 16)),
      ],
      boundaries: [
        bc('fan', L(language, '팬 바람', 'Fan air'), 'exterior', 'convection', { h: 40, Tinf: 30, region: [-1, 4.5, 81, 31] }),
        bc('board', L(language, '보드 주변 공기', 'Air round the board'), 'exterior', 'convection', { h: 8, Tinf: 30, emissivity: 0.9, region: [-1, -1, 81, 4.5] }),
      ],
      probes: [
        { id: 'p1', name: 'Q1', x: 20, y: 2.8 },
        { id: 'p2', name: 'Q2', x: 40, y: 2.8 },
        { id: 'p3', name: L(language, '핀 끝', 'Fin tip'), x: 26, y: 25 },
      ],
      study: { type: 'steady' },
      ambient: 30,
      reliability: { components: [{ body: 'q1', Ea: 0.7, Tref: 85, mttfRef: 500000, cycles: 3650 }, { body: 'q2', Ea: 0.7, Tref: 85, mttfRef: 500000, cycles: 3650 }, { body: 'drv', Ea: 0.6, Tref: 85, mttfRef: 1000000, cycles: 3650 }] },
    };
  },

  cpuHeatsink(language) {
    const fins = Array.from({ length: 8 }, (_, i) => rect(`fin${i + 1}`, `${L(language, '핀', 'Fin')} ${i + 1}`, 'al6061', 46 + i * 5, 8.5, 1.5, 14));
    return {
      name: L(language, 'CPU 히트싱크 (강제 대류 CHT)', 'CPU heat sink (forced-air CHT)'),
      description: L(language, '덕트 안의 공기가 보드 위 CPU 히트싱크와 부품을 식힙니다. 유동과 고체 전도를 함께 푸는 연성 열전달(CHT) 예제입니다.', 'Air in a duct cools a CPU heat sink and parts on a board. Conjugate heat transfer: flow and solid conduction solved together.'),
      domain: { dim: 2, width: 150, height: 40, depth: 80, nx: 300, ny: 80, background: 'air' },
      materials: mats(language, 'air', 'al6061', 'pcb4', 'silicon', 'tim'),
      bodies: [
        rect('board', L(language, '보드', 'Board'), 'pcb4', 0, 0, 150, 2),
        rect('cpu', 'CPU', 'silicon', 55, 2, 20, 2, { power: 5 }),
        rect('tim', 'TIM', 'tim', 55, 4, 20, 0.5),
        rect('base', L(language, '히트싱크 베이스', 'Heat sink base'), 'al6061', 45, 4.5, 40, 4),
        ...fins,
        rect('ram', L(language, '메모리', 'Memory'), 'silicon', 15, 2, 12, 2, { power: 2 }),
        rect('vrm', L(language, '전원부', 'Regulator'), 'silicon', 110, 2, 10, 3, { power: 3 }),
      ],
      boundaries: [
        bc('in', L(language, '팬 유입', 'Fan inlet'), 'left', 'inlet', { velocity: 0.2, Tin: 25 }),
        bc('out', L(language, '배기', 'Exhaust'), 'right', 'outlet'),
        bc('under', L(language, '보드 아래', 'Under the board'), 'bottom', 'convection', { h: 5, Tinf: 25 }),
      ],
      probes: [{ id: 'pj', name: L(language, 'CPU 접합부', 'CPU junction'), x: 65, y: 3 }, { id: 'pout', name: L(language, '배기 공기', 'Exhaust air'), x: 145, y: 20 }],
      study: { type: 'steady', flow: true, flowSteps: 5000 },
      reliability: { components: [{ body: 'cpu', Ea: 0.7, Tref: 55, mttfRef: 1e6, cycles: 1825 }, { body: 'vrm', Ea: 0.5, Tref: 55, mttfRef: 5e5, cycles: 1825 }] },
    };
  },

  pcb3d(language) {
    return {
      name: L(language, 'PCB 부품 배치 (3D)', 'PCB component layout (3D)'),
      description: L(language, '4층 PCB 위 부품들의 발열과 자연 대류·복사 냉각을 3D로 계산하고, 부품 온도로 신뢰성(수명)을 추정합니다.', 'Heat from components on a 4-layer PCB, cooled by natural convection and radiation, solved in 3D; component temperatures feed the reliability estimate.'),
      domain: { dim: 3, width: 80, height: 60, depth: 8, nx: 80, ny: 60, nz: 8, background: null },
      materials: mats(language, 'pcb4', 'emc', 'silicon', 'copper', 'al6061'),
      bodies: [
        rect('board', L(language, '보드', 'Board'), 'pcb4', 0, 0, 80, 60, { z0: 0, z1: 2 }),
        rect('mcu', 'MCU', 'emc', 26, 22, 16, 16, { z0: 2, z1: 4, power: 0.8 }),
        rect('pmic', L(language, '전원 IC', 'Power IC'), 'emc', 58, 38, 10, 10, { z0: 2, z1: 4, power: 1.2 }),
        rect('ldo', 'LDO', 'emc', 8, 44, 7, 7, { z0: 2, z1: 4, power: 0.8 }),
        rect('ind', L(language, '인덕터', 'Inductor'), 'emc', 58, 10, 10, 10, { z0: 2, z1: 7, power: 0.4 }),
        rect('sink', L(language, '방열판', 'Heat spreader'), 'al6061', 57, 37, 12, 12, { z0: 4, z1: 6 }),
      ],
      boundaries: [bc('air', L(language, '공기 (자연 대류 + 복사)', 'Air (natural convection + radiation)'), 'exterior', 'convection', { h: 10, Tinf: 25, emissivity: 0.85 })],
      probes: [
        { id: 'p1', name: 'MCU', x: 34, y: 30, z: 3 },
        { id: 'p2', name: L(language, '전원 IC', 'Power IC'), x: 63, y: 43, z: 3 },
        { id: 'p3', name: 'LDO', x: 11.5, y: 47.5, z: 3 },
      ],
      study: { type: 'steady' },
      reliability: { components: [
        { body: 'mcu', Ea: 0.7, Tref: 55, mttfRef: 2e6, cycles: 3650 },
        { body: 'pmic', Ea: 0.7, Tref: 55, mttfRef: 1e6, cycles: 3650 },
        { body: 'ldo', Ea: 0.6, Tref: 55, mttfRef: 1e6, cycles: 3650 },
      ] },
    };
  },

  icPackage(language) {
    return {
      name: L(language, 'IC 패키지 휨 (3D 열응력)', 'IC package warpage (3D thermal stress)'),
      description: L(language, '다이·몰드·기판·구리 리드로 된 패키지의 온도와 열팽창 차이로 생기는 응력·변형을 3D로 계산합니다.', 'Temperature, stress and warpage of a package (die, mould, substrate, copper lid) from mismatched thermal expansion, in 3D.'),
      domain: { dim: 3, width: 20, height: 20, depth: 3, nx: 40, ny: 40, nz: 15, background: null },
      materials: mats(language, 'pcb4', 'emc', 'silicon', 'copper', 'tim'),
      bodies: [
        rect('sub', L(language, '기판', 'Substrate'), 'pcb4', 0, 0, 20, 20, { z0: 0, z1: 0.6 }),
        rect('mold', L(language, '몰드', 'Mould'), 'emc', 2, 2, 16, 16, { z0: 0.6, z1: 1.8 }),
        rect('die', L(language, '다이', 'Die'), 'silicon', 7, 7, 6, 6, { z0: 0.6, z1: 1.2, power: 2 }),
        rect('tim', 'TIM', 'tim', 7, 7, 6, 6, { z0: 1.2, z1: 1.8 }),
        rect('lid', L(language, '리드', 'Lid'), 'copper', 2, 2, 16, 16, { z0: 1.8, z1: 2.4 }),
      ],
      boundaries: [
        bc('board', L(language, '보드 쪽', 'To the board'), 'front', 'convection', { h: 300, Tinf: 25 }),
        bc('top', L(language, '윗면 공기', 'Top air'), 'exterior', 'convection', { h: 15, Tinf: 25, emissivity: 0.9 }),
      ],
      probes: [{ id: 'pj', name: L(language, '접합부', 'Junction'), x: 10, y: 10, z: 0.9 }],
      study: { type: 'steady', stress: true, Tref: 25 },
    };
  },

  battery(language) {
    const cells = Array.from({ length: 5 }, (_, i) => rect(`cell${i + 1}`, `${L(language, '셀', 'Cell')} ${i + 1}`, 'liion', 5 + i * 23, 6, 18, 60, {
      current: [[0, 0], [60, 120], [300, 120], [360, 0], [600, 160], [900, 160], [960, 0], [1800, 0]], resistance: 1.2e-3,
    }));
    const fins = Array.from({ length: 4 }, (_, i) => rect(`fin${i + 1}`, `${L(language, '냉각 핀', 'Cooling fin')} ${i + 1}`, 'al6061', 24 + i * 23, 6, 3, 60));
    return {
      name: L(language, '배터리 팩 주행 사이클 (과도)', 'Battery pack drive cycle (transient)'),
      description: L(language, '파우치 셀 5개가 주행 전류(I²R 줄 발열)로 데워지고, 냉각 핀과 수냉 냉각판으로 식는 과정을 시간에 따라 계산합니다.', 'Five pouch cells heated by a drive-cycle current (I²R Joule heat) and cooled through fins into a liquid cold plate, over time.'),
      domain: { dim: 2, width: 120, height: 70, depth: 100, nx: 120, ny: 70, background: null },
      materials: mats(language, 'liion', 'al6061', 'tim'),
      bodies: [
        rect('plate', L(language, '냉각판', 'Cold plate'), 'al6061', 0, 0, 120, 4),
        rect('pad', L(language, '열 패드', 'Thermal pad'), 'tim', 0, 4, 120, 2),
        ...cells,
        ...fins,
      ],
      boundaries: [
        bc('cool', L(language, '냉각수', 'Coolant'), 'bottom', 'convection', { h: 800, Tinf: 25 }),
        bc('air', L(language, '팩 내부 공기', 'Pack air'), 'exterior', 'convection', { h: 4, Tinf: 30 }),
      ],
      probes: [
        { id: 'p1', name: `${L(language, '셀', 'Cell')} 3 ${L(language, '중심', 'centre')}`, x: 60, y: 40 },
        { id: 'p2', name: `${L(language, '셀', 'Cell')} 1 ${L(language, '위쪽', 'top')}`, x: 14, y: 64 },
      ],
      study: { type: 'transient', endTime: 1800, dt: 5, frames: 60, initialT: 25 },
      reliability: { components: [{ body: 'cell3', Ea: 0.5, Tref: 25, mttfRef: 40000, cycles: 730 }] },
    };
  },

  windowFrame(language) {
    return {
      name: L(language, '창틀 단면 U-값 (THERM 방식)', 'Window frame section U-factor (THERM-style)'),
      description: L(language, '단열바가 있는 알루미늄 창틀과 아르곤 복층 유리 단면의 2D 열전도. 실외 −18 °C / 실내 21 °C 표면 열전달로 U-값을 구합니다.', '2D conduction through an aluminium frame with a thermal break and an argon double glazing; U-factor from −18 °C outdoor / 21 °C indoor films.'),
      domain: { dim: 2, width: 75, height: 120, depth: 1000, nx: 150, ny: 240, background: null },
      materials: mats(language, 'al6061', 'polyamide', 'airCavity', 'glass', 'argonCavity', 'ss304', 'silicone'),
      bodies: [
        rect('outer', L(language, '외부 프레임', 'Outer frame'), 'al6061', 0, 0, 30, 40),
        rect('break', L(language, '단열바', 'Thermal break'), 'polyamide', 30, 6, 15, 28),
        rect('inner', L(language, '내부 프레임', 'Inner frame'), 'al6061', 45, 0, 30, 40),
        rect('cav1', L(language, '프레임 공기층 1', 'Frame cavity 1'), 'airCavity', 5, 8, 20, 24),
        rect('cav2', L(language, '프레임 공기층 2', 'Frame cavity 2'), 'airCavity', 50, 8, 20, 24),
        rect('glass1', L(language, '실외 유리', 'Outer pane'), 'glass', 20, 40, 4, 80),
        rect('gas', L(language, '아르곤층', 'Argon gap'), 'argonCavity', 24, 46, 16, 74),
        rect('spacer', L(language, '간봉', 'Spacer'), 'ss304', 24, 40, 16, 6),
        rect('glass2', L(language, '실내 유리', 'Inner pane'), 'glass', 40, 40, 4, 80),
        rect('gasketOut', L(language, '외부 가스켓', 'Outer gasket'), 'silicone', 14, 40, 6, 8),
        rect('gasketIn', L(language, '내부 가스켓', 'Inner gasket'), 'silicone', 44, 40, 6, 8),
      ],
      boundaries: [
        bc('ext', L(language, '실외 (NFRC 겨울)', 'Exterior (NFRC winter)'), 'exterior', 'convection', { h: 26, Tinf: -18, region: [-1, -1, 32, 121] }),
        bc('int', L(language, '실내', 'Interior'), 'exterior', 'convection', { h: 7.7, Tinf: 21, region: [32, -1, 76, 121] }),
        bc('cutTop', L(language, '유리 절단면', 'Glazing cut'), 'top', 'adiabatic'),
        bc('cutBottom', L(language, '벽 접합면', 'Wall joint'), 'bottom', 'adiabatic'),
      ],
      probes: [{ id: 'p1', name: L(language, '실내 유리 가장자리', 'Inner pane edge'), x: 43.5, y: 50 }, { id: 'p2', name: L(language, '실내 프레임', 'Inner frame face'), x: 74.5, y: 20 }],
      study: { type: 'steady' },
      view: { uFactor: { warm: 'int', cold: 'ext' } },
    };
  },

  wallStud(language) {
    return {
      name: L(language, '경량 철골 벽체 열교 (THERM 방식)', 'Steel-stud wall thermal bridge (THERM-style)'),
      description: L(language, '단열재를 관통하는 철골 스터드가 만드는 열교를 2D로 계산하고 U-값과 실내 표면 최저 온도(결로 위험)를 봅니다.', 'The thermal bridge of a steel stud through the insulation, in 2D: U-factor and the coldest indoor surface (condensation risk).'),
      domain: { dim: 2, width: 200, height: 400, depth: 1000, nx: 200, ny: 200, background: null },
      materials: mats(language, 'gypsum', 'mineralWool', 'steel', 'wood', 'eps', 'concrete'),
      bodies: [
        rect('gyp', L(language, '석고보드', 'Gypsum board'), 'gypsum', 0, 0, 12.5, 400),
        rect('wool', L(language, '미네랄울', 'Mineral wool'), 'mineralWool', 12.5, 0, 100, 400),
        rect('web', L(language, '스터드 웨브', 'Stud web'), 'steel', 12.5, 199, 100, 2),
        rect('fl1', L(language, '스터드 플랜지 (실내)', 'Stud flange (in)'), 'steel', 12.5, 180, 2, 40),
        rect('fl2', L(language, '스터드 플랜지 (실외)', 'Stud flange (out)'), 'steel', 110.5, 180, 2, 40),
        rect('osb', 'OSB', 'wood', 112.5, 0, 12.5, 400),
        rect('epsLayer', L(language, '외단열 EPS', 'EPS insulation'), 'eps', 125, 0, 50, 400),
        rect('render', L(language, '마감 몰탈', 'Render'), 'concrete', 175, 0, 25, 400),
      ],
      boundaries: [
        bc('int', L(language, '실내', 'Interior'), 'left', 'convection', { h: 7.7, Tinf: 20 }),
        bc('ext', L(language, '실외', 'Exterior'), 'right', 'convection', { h: 25, Tinf: -10 }),
      ],
      probes: [{ id: 'p1', name: L(language, '스터드 앞 실내 표면', 'Indoor surface at stud'), x: 0.5, y: 200 }, { id: 'p2', name: L(language, '단열재 앞 실내 표면', 'Indoor surface at insulation'), x: 0.5, y: 20 }],
      study: { type: 'steady' },
      view: { uFactor: { warm: 'int', cold: 'ext' } },
    };
  },

  pcmSink(language) {
    const pockets = Array.from({ length: 4 }, (_, i) => rect(`pcm${i + 1}`, `PCM ${i + 1}`, 'rt35', 6 + i * 13, 8, 9, 26));
    return {
      name: L(language, '상변화 재료 히트싱크 (과도)', 'Phase-change heat sink (transient)'),
      description: L(language, '파라핀(RT35)이 채워진 알루미늄 히트싱크가 10분 동안 열 펄스를 흡수하는 동안 녹고, 다시 굳는 과정을 계산합니다.', 'Paraffin (RT35) in an aluminium sink melts while it absorbs a 10-minute heat pulse, then solidifies again.'),
      domain: { dim: 2, width: 60, height: 40, depth: 50, nx: 120, ny: 80, background: null },
      materials: mats(language, 'al6061', 'rt35', 'silicon'),
      bodies: [
        rect('case', L(language, '알루미늄 케이스', 'Aluminium case'), 'al6061', 0, 0, 60, 40),
        ...pockets,
        rect('heater', L(language, '발열 소자', 'Heater'), 'silicon', 15, 0, 30, 3, { powerProfile: [[0, 25], [600, 25], [601, 0], [1800, 0]] }),
      ],
      boundaries: [bc('air', L(language, '공기', 'Air'), 'exterior', 'convection', { h: 8, Tinf: 25, emissivity: 0.8 })],
      probes: [{ id: 'p1', name: L(language, '발열 소자', 'Heater'), x: 30, y: 1.5 }, { id: 'p2', name: 'PCM 2', x: 23.5, y: 21 }],
      study: { type: 'transient', endTime: 1800, dt: 2, frames: 60, initialT: 25 },
    };
  },

  microchannel(language) {
    return {
      name: L(language, '마이크로채널 냉각기 (미세 유체)', 'Microchannel cooler (microfluidics)'),
      description: L(language, '실리콘 칩 안의 300 µm 물 채널이 50 W/cm² 열유속을 식히는 미세 유체 연성 열전달 예제입니다.', 'A 300 µm water channel inside a silicon chip removes a 50 W/cm² heat flux: microfluidic conjugate heat transfer.'),
      domain: { dim: 2, width: 10, height: 1, depth: 1, nx: 200, ny: 40, background: null },
      materials: mats(language, 'silicon', 'water'),
      bodies: [
        rect('chip', L(language, '실리콘', 'Silicon'), 'silicon', 0, 0, 10, 1),
        rect('channel', L(language, '물 채널', 'Water channel'), 'water', 0, 0.35, 10, 0.3),
      ],
      boundaries: [
        bc('heat', L(language, '발열 영역', 'Hot spot'), 'bottom', 'flux', { q: 5e5, range: [2, 8] }),
        bc('in', L(language, '유입', 'Inlet'), 'left', 'inlet', { velocity: 0.5, Tin: 20, range: [0.35, 0.65] }),
        bc('out', L(language, '유출', 'Outlet'), 'right', 'outlet', { range: [0.35, 0.65] }),
      ],
      probes: [{ id: 'p1', name: L(language, '최고점 근처', 'Near the hot spot'), x: 7.5, y: 0.05 }, { id: 'p2', name: L(language, '출구 물', 'Outlet water'), x: 9.9, y: 0.5 }],
      study: { type: 'steady', flow: true, flowSteps: 3000 },
    };
  },

  porous(language) {
    return {
      name: L(language, '다공성 금속 폼 열교환기', 'Porous metal-foam heat exchanger'),
      description: L(language, '물 채널 가운데의 구리 폼(다공성 매체, 다르시-브링크만)이 아래에서 들어오는 열을 물로 옮깁니다.', 'A copper foam block (porous medium, Darcy–Brinkman) in a water channel carries heat from the heated wall into the water.'),
      domain: { dim: 2, width: 100, height: 20, depth: 20, nx: 200, ny: 40, background: 'water' },
      materials: mats(language, 'water', 'cuFoamWater', 'copper'),
      bodies: [
        rect('foam', L(language, '구리 폼', 'Copper foam'), 'cuFoamWater', 40, 0, 20, 20),
        rect('wall', L(language, '바닥 구리판', 'Copper base'), 'copper', 0, 0, 100, 1),
      ],
      boundaries: [
        bc('heat', L(language, '가열면', 'Heated wall'), 'bottom', 'flux', { q: 1.5e5, range: [35, 65] }),
        bc('in', L(language, '유입', 'Inlet'), 'left', 'inlet', { velocity: 0.02, Tin: 20 }),
        bc('out', L(language, '유출', 'Outlet'), 'right', 'outlet'),
      ],
      probes: [{ id: 'p1', name: L(language, '가열면 중앙', 'Heated wall centre'), x: 50, y: 0.5 }],
      study: { type: 'steady', flow: true, flowSteps: 3000 },
    };
  },

  naturalConvection(language) {
    return {
      name: L(language, '밀폐 함 안의 자연 대류', 'Natural convection in an enclosure'),
      description: L(language, '발열 부품이 있는 밀폐 함 안에서 부력으로 공기가 순환하며 차가운 벽으로 열을 옮기는 자연 대류(부시네스크) 예제입니다.', 'Buoyancy drives air round a sealed box with a hot part, carrying heat to the cool walls (Boussinesq natural convection).'),
      domain: { dim: 2, width: 100, height: 100, depth: 100, nx: 100, ny: 100, background: 'air' },
      materials: mats(language, 'air', 'al6061', 'emc'),
      bodies: [
        rect('part', L(language, '발열 부품', 'Hot part'), 'emc', 40, 10, 20, 10, { power: 3 }),
        rect('plate', L(language, '방열판', 'Spreader plate'), 'al6061', 47, 20, 6, 40),
      ],
      boundaries: [
        bc('left', L(language, '왼쪽 벽', 'Left wall'), 'left', 'convection', { h: 10, Tinf: 20 }),
        bc('right', L(language, '오른쪽 벽', 'Right wall'), 'right', 'convection', { h: 10, Tinf: 20 }),
        bc('top', L(language, '천장', 'Ceiling'), 'top', 'convection', { h: 5, Tinf: 20 }),
      ],
      probes: [{ id: 'p1', name: L(language, '부품', 'Part'), x: 50, y: 15 }, { id: 'p2', name: L(language, '위쪽 공기', 'Upper air'), x: 50, y: 85 }],
      study: { type: 'steady', flow: true, natural: true, flowSteps: 4000, Tref: 20 },
      ambient: 20,
    };
  },

  brakeDisc(language) {
    const pulse = [[0, 0], [0.5, 9000], [4, 9000], [4.5, 0], [30, 0], [30.5, 9000], [34, 9000], [34.5, 0], [60, 0], [60.5, 9000], [64, 9000], [64.5, 0], [180, 0]];
    return {
      name: L(language, '반복 제동 디스크 (과도)', 'Brake disc, repeated stops (transient)'),
      description: L(language, '30초마다 반복되는 제동의 마찰열이 주철 디스크 단면에 쌓이고 대류·복사로 식는 과정을 계산합니다.', 'Friction heat from a stop every 30 s builds up in a cast-iron disc section and is shed by convection and radiation.'),
      domain: { dim: 2, width: 30, height: 80, depth: 200, nx: 60, ny: 160, background: null },
      materials: mats(language, 'castIron'),
      bodies: [
        rect('hat', L(language, '모자부', 'Hat'), 'castIron', 10, 0, 10, 20),
        rect('disc', L(language, '마찰면', 'Rubbing band'), 'castIron', 0, 20, 30, 60),
        rect('padIn', L(language, '안쪽 마찰층', 'Inner rubbing layer'), 'castIron', 0, 45, 1, 33, { powerProfile: pulse }),
        rect('padOut', L(language, '바깥 마찰층', 'Outer rubbing layer'), 'castIron', 29, 45, 1, 33, { powerProfile: pulse }),
      ],
      boundaries: [
        bc('air', L(language, '주행풍', 'Air stream'), 'exterior', 'convection', { h: 60, Tinf: 25, emissivity: 0.6 }),
        bc('hub', L(language, '허브', 'Hub'), 'bottom', 'temperature', { T: 60 }),
      ],
      probes: [{ id: 'p1', name: L(language, '마찰면', 'Rubbing surface'), x: 0.5, y: 60 }, { id: 'p2', name: L(language, '모자부', 'Hat'), x: 15, y: 10 }],
      study: { type: 'transient', endTime: 180, dt: 0.25, frames: 72, initialT: 25 },
    };
  },

  ledStress(language) {
    return {
      name: L(language, 'LED 모듈 열응력', 'LED module thermal stress'),
      description: L(language, 'MCPCB 위 LED의 온도와, 재료마다 다른 열팽창이 만드는 솔더·패키지 응력(평면 응력)을 계산합니다.', 'LED temperature on a metal-core PCB and the solder/package stress (plane stress) from mismatched thermal expansion.'),
      domain: { dim: 2, width: 40, height: 4, depth: 5, nx: 400, ny: 40, background: null },
      materials: mats(language, 'al6061', 'emc', 'copper', 'sac305', 'alumina', 'silicon'),
      bodies: [
        rect('base', L(language, '알루미늄 기판', 'Aluminium base'), 'al6061', 0, 0, 40, 1.5),
        rect('diel', L(language, '절연층', 'Dielectric'), 'emc', 0, 1.5, 40, 0.1),
        rect('cu', L(language, '구리 패드', 'Copper pad'), 'copper', 14, 1.6, 12, 0.2),
        rect('solder', L(language, '솔더', 'Solder'), 'sac305', 16, 1.8, 8, 0.1),
        rect('pkg', L(language, 'LED 세라믹 패키지', 'LED ceramic package'), 'alumina', 16, 1.9, 8, 0.6),
        rect('die', L(language, 'LED 칩', 'LED die'), 'silicon', 18.5, 2.5, 3, 0.2, { power: 1.5 }),
      ],
      boundaries: [
        bc('sink', L(language, '히트싱크 접촉', 'Heat sink contact'), 'bottom', 'convection', { h: 1500, Tinf: 25 }),
        bc('air', L(language, '공기', 'Air'), 'exterior', 'convection', { h: 10, Tinf: 25, emissivity: 0.8 }),
        bc('supY', L(language, '바닥 지지 (Y)', 'Bottom support (Y)'), 'bottom', 'rollerY'),
        bc('supX', L(language, '대칭면 (X)', 'Symmetry (X)'), 'left', 'rollerX'),
      ],
      probes: [{ id: 'p1', name: L(language, 'LED 칩', 'LED die'), x: 20, y: 2.6 }, { id: 'p2', name: L(language, '솔더', 'Solder'), x: 20, y: 1.85 }],
      study: { type: 'steady', stress: true, Tref: 25 },
      reliability: { components: [{ body: 'solder', Ea: 0.8, Tref: 85, mttfRef: 50000, cycles: 1000, cm: { C: 5e6, n: 2.2 } }] },
    };
  },

  satellitePanel(language) {
    return {
      name: L(language, '위성 방열 패널 (복사)', 'Satellite radiator panel (radiation)'),
      description: L(language, '진공에서 전자 장비 상자의 열을 히트파이프로 퍼뜨려 심우주(3 K)로 복사하는 패널. 대류 없이 복사만으로 평형 온도를 구하고 히트맵으로 봅니다.', 'In vacuum a panel spreads the heat of electronics boxes through a heat pipe and radiates it to deep space (3 K). Radiation only — no convection — and a heat map of the result.'),
      domain: { dim: 3, width: 400, height: 300, depth: 2, nx: 100, ny: 75, nz: 1, background: null },
      materials: [...mats(language, 'al6061', 'copper'), { ...materialFromLibrary('copper', language), id: 'heatPipe', name: L(language, '히트파이프 (유효)', 'Heat pipe (effective)'), k: 20000, color: '#d08a3c' }],
      bodies: [
        rect('panel', L(language, '알루미늄 패널', 'Aluminium panel'), 'al6061', 0, 0, 400, 300),
        rect('pipe', L(language, '히트파이프', 'Heat pipe'), 'heatPipe', 40, 196, 320, 8),
        rect('box1', L(language, '통신 장비', 'Transponder'), 'al6061', 60, 150, 100, 100, { power: 40 }),
        rect('box2', L(language, '전원 장비', 'Power unit'), 'al6061', 250, 50, 80, 80, { power: 25 }),
      ],
      boundaries: [
        bc('space', L(language, '방열면 → 우주', 'Radiator → space'), 'front', 'radiation', { emissivity: 0.85, Tamb: -270 }),
        bc('mli', L(language, '다층 단열재 쪽', 'Behind MLI'), 'back', 'radiation', { emissivity: 0.03, Tamb: 20 }),
      ],
      probes: [{ id: 'p1', name: L(language, '통신 장비', 'Transponder'), x: 110, y: 200, z: 1 }, { id: 'p2', name: L(language, '패널 구석', 'Panel corner'), x: 390, y: 290, z: 1 }],
      study: { type: 'steady' },
      ambient: 0,
    };
  },
};

Object.assign(BUILDERS, MORE_BUILDERS);

export const SAMPLE_IDS = Object.keys(BUILDERS);

/** Which tool each sample illustrates (shown in the gallery). */
export const SAMPLE_TAGS = {
  ...MORE_TAGS,
  tutorial: ['Tutorial', '2D'],
  cpuHeatsink: ['CHT', 'SimScale', 'SOLIDWORKS Flow'],
  pcb3d: ['3D', 'Ansys', 'Sherlock'],
  icPackage: ['3D', 'Stress', 'Ansys'],
  battery: ['Transient', 'Simcenter'],
  windowFrame: ['2D', 'THERM'],
  wallStud: ['2D', 'THERM'],
  pcmSink: ['PCM', 'COMSOL'],
  microchannel: ['CHT', 'COMSOL'],
  porous: ['Porous', 'COMSOL'],
  naturalConvection: ['CHT', 'STAR-CCM+'],
  brakeDisc: ['Transient', 'Simcenter 3D'],
  ledStress: ['Stress', 'Ansys'],
  satellitePanel: ['Radiation', 'NASA HAM'],
};

export function sampleModel(id, language = 'ko') {
  const build = BUILDERS[id];
  if (!build) throw new Error(`unknown sample ${id}`);
  const model = build(language);
  return normalizeModel({ ambient: 25, ...model, view: { ...(model.view ?? {}), sample: id } });
}
