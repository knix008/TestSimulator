// Example projects, ready to solve. Faces are named by where they are (centre, normal, area in
// model units) — the solver finds the matching mesh face, so the examples survive mesh changes.
import { addBc, addBody, addSystem, createProject } from './project.js';

export const SAMPLE_GROUPS = [
  { id: 'structural', icon: 'simStatic', ko: '구조', en: 'Structural' },
  { id: 'dynamics', icon: 'simModal', ko: '동역학', en: 'Dynamics' },
  { id: 'thermal', icon: 'simThermal', ko: '열', en: 'Thermal' },
  { id: 'fluid', icon: 'simFluid', ko: '유동', en: 'Fluid flow' },
  { id: 'electromagnetic', icon: 'simMagnetic', ko: '전자기', en: 'Electromagnetics' },
  { id: 'acoustic', icon: 'simAcoustic', ko: '음향', en: 'Acoustics' },
];

const face = (body, c, n, a = 0, other = null) => ({ body: body.id, other, c, n, a });

function sample(id, group, icon, ko, en, build) { return { id, group, icon, ko, en, build }; }

function beam(p, { length = 200, size = 20, material = 'steel', name = 'Beam' } = {}) {
  return addBody(p, 'box', { name, params: { width: length, depth: size, height: size }, material, position: [length / 2, 0, 0] });
}

export const SAMPLES = [
  // ── structural
  sample('cantilever', 'structural', 'simStatic', ['외팔보 정적 해석', '끝단 하중을 받는 강철 보의 변위와 응력'], ['Cantilever static', 'Deflection and stress of a steel beam with a tip load'], (p) => {
    const b = beam(p);
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 400)] });
    addBc(s, 'force', { vector: [0, 0, -500], faces: [face(b, [200, 0, 0], [1, 0, 0], 400)] });
    s.mesh.size = 0.004;
  }),
  sample('plateHole', 'structural', 'shapePlateHole', ['구멍 뚫린 판의 응력 집중', '인장 하중에서 구멍 가장자리의 응력 집중'], ['Plate with a hole', 'Stress concentration at a hole under tension'], (p) => {
    const b = addBody(p, 'plateHole', { name: 'Plate', params: { width: 200, depth: 60, thickness: 8, holeDiameter: 20 } });
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [-100, 0, 0], [-1, 0, 0], 480)] });
    addBc(s, 'force', { vector: [24000, 0, 0], faces: [face(b, [100, 0, 0], [1, 0, 0], 480)] });
    s.mesh.size = 0.004;
  }),
  sample('bracket', 'structural', 'shapeBracket', ['L 브래킷', '벽에 고정된 브래킷 끝에 걸린 하중'], ['L bracket', 'A wall bracket loaded at its free leg'], (p) => {
    const b = addBody(p, 'lBracket', { name: 'Bracket', params: { width: 80, height: 80, thickness: 8, depth: 40, holeDiameter: 12 }, material: 'aluminum' });
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [-40, 0, 0], [-1, 0, 0], 3200)] });
    addBc(s, 'force', { vector: [0, 0, -800], faces: [face(b, [40, 0, -36], [1, 0, 0], 320)] });
    s.mesh.size = 0.004;
  }),
  sample('shaftTorsion', 'structural', 'shapeShaft', ['단붙이 축의 비틀림', '한쪽을 고정하고 반대쪽에 토크를 건 축'], ['Stepped shaft torsion', 'A shaft fixed at one end, twisted at the other'], (p) => {
    const b = addBody(p, 'shaft', { name: 'Shaft', params: { d1: 40, l1: 60, d2: 30, l2: 100, d3: 24, l3: 60 } });
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [-110, 0, 0], [-1, 0, 0], 1257)] });
    addBc(s, 'moment', { vector: [200, 0, 0], faces: [face(b, [110, 0, 0], [1, 0, 0], 452)] });
    s.mesh.size = 0.004;
  }),
  sample('flange', 'structural', 'shapeFlange', ['플랜지 볼트 하중', '볼트 구멍을 고정하고 허브를 누르는 플랜지'], ['Flange', 'A flange held at its bolt holes, pushed at the hub'], (p) => {
    const b = addBody(p, 'flange', { name: 'Flange', params: { outer: 160, bore: 50, thickness: 14, hubDiameter: 80, hubHeight: 34, boltCircle: 125, boltDiameter: 14, bolts: 6 } });
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [0, 0, -1], 17000)] });
    addBc(s, 'pressure', { value: 20e6, faces: [face(b, [0, 0, 34], [0, 0, 1], 3000)] });
    s.mesh.size = 0.006;
  }),
  sample('fatiguePlate', 'structural', 'simFatigue', ['피로 수명', '완전 역전 하중을 받는 구멍 판의 수명과 안전율'], ['Fatigue life', 'Life and safety factor of a holed plate, fully reversed load'], (p) => {
    const b = addBody(p, 'plateHole', { name: 'Plate', params: { width: 200, depth: 60, thickness: 8, holeDiameter: 20 } });
    const s = addSystem(p, 'fatigue');
    addBc(s, 'fixed', { faces: [face(b, [-100, 0, 0], [-1, 0, 0], 480)] });
    addBc(s, 'force', { vector: [30000, 0, 0], faces: [face(b, [100, 0, 0], [1, 0, 0], 480)] });
    s.mesh.size = 0.004;
  }),
  sample('plasticBar', 'structural', 'simNonlinear', ['소성 변형(비선형)', '항복을 넘는 인장 하중, 하중-변위 곡선'], ['Plastic yielding', 'A bar pulled beyond yield: the load–displacement curve'], (p) => {
    const b = beam(p, { length: 100, size: 10, name: 'Bar' });
    const s = addSystem(p, 'nonlinear');
    s.settings.steps = 12;
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 100)] });
    addBc(s, 'force', { vector: [30000, 0, 0], faces: [face(b, [100, 0, 0], [1, 0, 0], 100)] });
    s.mesh.order = 1; s.mesh.size = 0.004;
  }),
  sample('contactBlocks', 'structural', 'simContact', ['접촉(마찰 없음)', '두 블록 사이 접촉면의 하중 전달'], ['Contact', 'Load transfer across a frictionless contact between two blocks'], (p) => {
    const a = addBody(p, 'box', { name: 'Base', params: { width: 60, depth: 40, height: 20 }, position: [0, 0, 10] });
    const b = addBody(p, 'box', { name: 'Block', params: { width: 30, depth: 20, height: 20 }, position: [0, 0, 30], material: 'aluminum' });
    const s = addSystem(p, 'nonlinear');
    s.settings.plasticity = false; s.settings.steps = 4;
    s.contacts.push({ id: 'k1', a: a.id, b: b.id, type: 'frictionless', friction: 0 });
    addBc(s, 'fixed', { faces: [face(a, [0, 0, 0], [0, 0, -1], 2400)] });
    addBc(s, 'pressure', { value: 30e6, faces: [face(b, [0, 0, 40], [0, 0, 1], 600)] });
    addBc(s, 'frictionless', { faces: [face(b, [-15, 0, 30], [-1, 0, 0], 400), face(b, [0, -10, 30], [0, -1, 0], 600)] });
    s.mesh.order = 1; s.mesh.size = 0.004;
  }),
  sample('column', 'structural', 'simBuckling', ['기둥 좌굴', '압축 기둥의 좌굴 하중 배수와 모드'], ['Column buckling', 'Load factors and shapes of a compressed column'], (p) => {
    const b = addBody(p, 'box', { name: 'Column', params: { width: 12, depth: 12, height: 300 }, position: [0, 0, 150] });
    const s = addSystem(p, 'buckling');
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [0, 0, -1], 144)] });
    addBc(s, 'force', { vector: [0, 0, -1000], faces: [face(b, [0, 0, 300], [0, 0, 1], 144)] });
    s.mesh.size = 0.006;
  }),
  sample('topologyPlate', 'structural', 'simTopology', ['위상 최적화', '외팔 판에서 재료 40%만 남기는 최적 형상'], ['Topology optimisation', 'The best 40 % of a cantilever plate'], (p) => {
    const b = addBody(p, 'box', { name: 'Design space', params: { width: 120, depth: 60, height: 10 }, position: [60, 0, 0] });
    const s = addSystem(p, 'topology');
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 600)] });
    addBc(s, 'force', { vector: [0, -2000, 0], faces: [face(b, [120, 0, 0], [1, 0, 0], 600)] });
    s.settings.resolution = 48;
  }),
  // ── dynamics
  sample('modalBeam', 'dynamics', 'simModal', ['외팔보 고유진동', '고유진동수, 모드 형상, 유효 질량'], ['Cantilever modes', 'Natural frequencies, mode shapes, effective mass'], (p) => {
    const b = beam(p, { length: 200, size: 15 });
    const s = addSystem(p, 'modal');
    s.settings.modes = 8;
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 225)] });
    s.mesh.size = 0.005;
  }),
  sample('freePlate', 'dynamics', 'simModal', ['자유 판의 진동', '지지 없는 판: 강체 모드 6개와 굽힘 모드'], ['Free plate modes', 'An unsupported plate: six rigid modes, then bending'], (p) => {
    addBody(p, 'box', { name: 'Plate', params: { width: 150, depth: 100, height: 4 }, material: 'aluminum' });
    const s = addSystem(p, 'modal');
    s.settings.modes = 10;
    s.mesh.size = 0.006;
  }),
  sample('harmonicBeam', 'dynamics', 'simHarmonic', ['조화 응답', '끝단 가진력에 대한 주파수 응답과 공진'], ['Harmonic response', 'Frequency response and resonance to a tip force'], (p) => {
    const b = beam(p, { length: 200, size: 15 });
    const s = addSystem(p, 'harmonic');
    Object.assign(s.settings, { fmin: 10, fmax: 1000, points: 200, damping: 0.02 });
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 225)] });
    addBc(s, 'force', { vector: [0, 0, -10], faces: [face(b, [200, 0, 0], [1, 0, 0], 225)] });
    s.mesh.size = 0.005;
  }),
  sample('transientBeam', 'dynamics', 'simTransient', ['과도 응답', '계단 하중에 흔들리는 외팔보'], ['Transient response', 'A cantilever ringing after a step load'], (p) => {
    const b = beam(p, { length: 200, size: 15 });
    const s = addSystem(p, 'transient');
    Object.assign(s.settings, { endTime: 0.05, steps: 200, history: [[0, 0], [0.001, 1], [0.05, 1]], beta: 2e-5 });
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 225)] });
    addBc(s, 'force', { vector: [0, 0, -50], faces: [face(b, [200, 0, 0], [1, 0, 0], 225)] });
    s.mesh.size = 0.006; s.mesh.order = 1;
  }),
  sample('spectrumTower', 'dynamics', 'simSpectrum', ['응답 스펙트럼(지진)', '바닥 가속도 스펙트럼에 대한 탑의 최대 응답'], ['Response spectrum', 'Peak response of a tower to a floor spectrum'], (p) => {
    const b = addBody(p, 'box', { name: 'Tower', params: { width: 20, depth: 20, height: 250 }, position: [0, 0, 125] });
    const s = addSystem(p, 'spectrum');
    s.settings.direction = [1, 0, 0];
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [0, 0, -1], 400)] });
    s.mesh.size = 0.008;
  }),
  sample('randomPcb', 'dynamics', 'simRandom', ['랜덤 진동(PCB)', '가속도 PSD에 대한 기판의 1σ 응답'], ['Random vibration', '1σ response of a board to an acceleration PSD'], (p) => {
    const b = addBody(p, 'box', { name: 'Board', params: { width: 100, depth: 80, height: 1.6 }, material: 'pcb' });
    const s = addSystem(p, 'random');
    s.settings.modes = 6;
    for (const [c, n, a] of [[[-50, 0, 0], [-1, 0, 0], 128], [[50, 0, 0], [1, 0, 0], 128]]) addBc(s, 'fixed', { faces: [face(b, c, n, a)] });
    s.mesh.size = 0.004;
  }),
  sample('dropTest', 'dynamics', 'simExplicit', ['낙하 충격(외연적)', '바닥에 떨어지는 알루미늄 블록의 충격 응력'], ['Drop test', 'Impact stress of an aluminium block hitting the floor'], (p) => {
    const b = addBody(p, 'box', { name: 'Block', params: { width: 40, depth: 40, height: 40 }, material: 'aluminum', position: [0, 0, 30], rotation: [0, 12, 8] });
    const s = addSystem(p, 'explicit');
    Object.assign(s.settings, { endTime: 0.0016, frames: 40, targetTimeStep: 2e-7 });
    addBc(s, 'velocity', { vector: [0, 0, -8], bodies: [b.id] });
    addBc(s, 'wall', { point: [0, 0, 0], normal: [0, 0, 1], friction: 0.2 });
    s.mesh.size = 0.006; s.mesh.order = 1;
  }),
  // ── thermal
  sample('heatSink', 'thermal', 'shapeHeatSink', ['방열판 정상 열전달', '바닥에서 열이 들어오고 핀에서 대류로 식는 방열판'], ['Heat sink', 'Heat in at the base, convection off the fins'], (p) => {
    const b = addBody(p, 'heatSink', { name: 'Heat sink', material: 'aluminum' });
    const s = addSystem(p, 'thermal');
    addBc(s, 'heatFlow', { value: 15, faces: [face(b, [0, 0, 0], [0, 0, -1], 3600)] });
    const fins = [];
    for (let i = 0; i < 7; i++) { const x = -30 + 1 + i * (58 / 6); fins.push(face(b, [x, 0, 30], [0, 0, 1], 120)); }
    addBc(s, 'convection', { h: 25, ambient: 25, faces: fins });
    s.mesh.size = 0.003;
  }),
  sample('heatUp', 'thermal', 'simThermalTransient', ['과도 가열', '한쪽 면에 열유속을 받는 판의 시간별 온도'], ['Transient heating', 'Temperature over time of a plate heated on one face'], (p) => {
    const b = addBody(p, 'box', { name: 'Plate', params: { width: 100, depth: 100, height: 10 }, material: 'steel' });
    const s = addSystem(p, 'thermalTransient');
    Object.assign(s.settings, { endTime: 600, steps: 60 });
    addBc(s, 'heatFlux', { value: 20000, faces: [face(b, [0, 0, -5], [0, 0, -1], 10000)] });
    addBc(s, 'convection', { h: 15, ambient: 22, faces: [face(b, [0, 0, 5], [0, 0, 1], 10000)] });
    s.mesh.size = 0.008;
  }),
  sample('thermalStress', 'thermal', 'simThermalStress', ['열응력', '양끝이 고정된 막대를 가열할 때의 열응력'], ['Thermal stress', 'Stress in a bar held at both ends and heated'], (p) => {
    const b = beam(p, { length: 120, size: 20, name: 'Bar' });
    const s = addSystem(p, 'thermalStress');
    addBc(s, 'temperature', { value: 120, faces: [face(b, [60, 0, 10], [0, 0, 1], 2400)] });
    addBc(s, 'temperature', { value: 22, faces: [face(b, [60, 0, -10], [0, 0, -1], 2400)] });
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 400)] });
    addBc(s, 'fixed', { faces: [face(b, [120, 0, 0], [1, 0, 0], 400)] });
    s.mesh.size = 0.005;
  }),
  sample('pipeLoss', 'thermal', 'shapePipe', ['배관 열손실', '뜨거운 물이 흐르는 관의 바깥 대류와 복사'], ['Pipe heat loss', 'Hot pipe losing heat by convection and radiation'], (p) => {
    const b = addBody(p, 'tube', { name: 'Pipe', params: { outer: 30, inner: 25, height: 200 } });
    const s = addSystem(p, 'thermal');
    addBc(s, 'convection', { h: 2000, ambient: 90, faces: [face(b, [0, 0, 0], [0, 0, 0], 31400)] });
    addBc(s, 'convection', { h: 8, ambient: 20, faces: [face(b, [0, 0, 0], [0, 0, 0], 37700)] });
    addBc(s, 'radiation', { emissivity: 0.8, ambient: 20, faces: [face(b, [0, 0, 0], [0, 0, 0], 37700)] });
    s.mesh.size = 0.006;
  }),
  // ── fluid
  sample('cubeDrag', 'fluid', 'simFluid', ['정육면체 주위 유동', '바람 속 정육면체의 항력과 후류'], ['Flow around a cube', 'Drag and wake of a cube in the wind'], (p) => {
    addBody(p, 'box', { name: 'Cube', params: { width: 40, depth: 40, height: 40 } });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [5, 0, 0], maxSteps: 400 });
  }),
  sample('wingLift', 'fluid', 'shapeWing', ['날개 단면 양력', '받음각 8°의 날개 주위 유동과 양력'], ['Wing lift', 'Flow and lift of a wing at 8° incidence'], (p) => {
    addBody(p, 'wing', { name: 'Wing', params: { chord: 100, thickness: 12, span: 60, angle: 8 } });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [10, 0, 0], maxSteps: 400, ymin: 'slip', ymax: 'slip' });
  }),
  sample('heatSinkFlow', 'fluid', 'shapeHeatSink', ['방열판 강제 대류', '공기 흐름으로 식는 방열판(공액 열전달)'], ['Forced convection cooling', 'A heat sink cooled by an air stream (conjugate)'], (p) => {
    const b = addBody(p, 'heatSink', { name: 'Heat sink', material: 'aluminum' });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [0, 2, 0], thermal: true, buoyancy: false, maxSteps: 400, xmin: 'slip', xmax: 'slip', ymin: 'inlet', ymax: 'outlet' });
    addBc(s, 'heatPower', { value: 10, bodies: [b.id] });
  }),
  sample('ductFlow', 'fluid', 'shapeElbow', ['굽은 관로 내부 유동', '입구에서 들어와 꺾여 나가는 물의 흐름과 압력 손실'], ['Bent duct flow', 'Water entering, turning and leaving: velocity and pressure loss'], (p) => {
    const b = addBody(p, 'bentChannel', { name: 'Channel', params: { width: 30, legA: 150, legB: 150 }, material: 'water' });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { flowType: 'internal', fluid: 'water', inletVelocity: [0.2, 0, 0], maxSteps: 800, turbulence: 'turbulent' });
    addBc(s, 'inlet', { speed: 0.2, faces: [face(b, [-15, 0, 0], [-1, 0, 0], 900)] });
    addBc(s, 'outlet', { faces: [face(b, [0, 0, 150], [0, 0, 1], 900)] });
  }),
  // ── electromagnetic
  sample('capacitor', 'electromagnetic', 'shapeCapacitor', ['평행판 축전기', '두 전극 사이의 전위, 전기장, 정전 용량'], ['Parallel plates', 'Potential, field and capacitance between two electrodes'], (p) => {
    const a = addBody(p, 'box', { name: 'Electrode +', params: { width: 40, depth: 40, height: 2 }, material: 'copper', position: [0, 0, 4] });
    const c = addBody(p, 'box', { name: 'Electrode −', params: { width: 40, depth: 40, height: 2 }, material: 'copper', position: [0, 0, -4] });
    const s = addSystem(p, 'electrostatic');
    s.enclosure.padding = 0.03;
    addBc(s, 'voltage', { value: 100, bodies: [a.id] });
    addBc(s, 'voltage', { value: 0, bodies: [c.id] });
    s.mesh.size = 0.003; s.mesh.order = 1;
  }),
  sample('busbar', 'electromagnetic', 'simCurrent', ['버스바 전류와 발열', '구리 버스바의 저항, 전류 밀도, 줄 발열 온도'], ['Busbar current and heating', 'Resistance, current density and Joule heating of a copper bar'], (p) => {
    const b = addBody(p, 'plateHole', { name: 'Busbar', params: { width: 150, depth: 30, thickness: 5, holeDiameter: 10 }, material: 'copper' });
    const s = addSystem(p, 'conduction');
    s.settings.coupleThermal = true;
    addBc(s, 'voltage', { value: 0, faces: [face(b, [-75, 0, 0], [-1, 0, 0], 150)] });
    addBc(s, 'current', { value: 200, faces: [face(b, [75, 0, 0], [1, 0, 0], 150)] });
    addBc(s, 'convection', { h: 10, ambient: 25, faces: [face(b, [0, 0, 2.5], [0, 0, 1], 4400), face(b, [0, 0, -2.5], [0, 0, -1], 4400)] });
    addBc(s, 'temperature', { value: 25, faces: [face(b, [-75, 0, 0], [-1, 0, 0], 150)] });
    s.mesh.size = 0.004;
  }),
  sample('solenoid', 'electromagnetic', 'shapeCoil', ['솔레노이드 코일', '전류가 흐르는 코일의 자속 밀도와 인덕턴스'], ['Solenoid coil', 'Flux density and inductance of a current-carrying coil'], (p) => {
    const c = addBody(p, 'coil', { name: 'Coil', params: { outer: 30, inner: 22, height: 60 }, material: 'copper' });
    const s = addSystem(p, 'magnetostatic');
    s.enclosure.padding = 0.05;
    addBc(s, 'coil', { current: 2, turns: 300, kind: 'loop', axis: [0, 0, 1], bodies: [c.id] });
    s.mesh.size = 0.007; s.mesh.order = 1;
  }),
  sample('magnetPlate', 'electromagnetic', 'shapeMagnet', ['영구 자석과 철판', '자석이 철판을 끄는 힘과 자속 분포'], ['Magnet and iron plate', 'Flux of a magnet and the pull on an iron plate'], (p) => {
    const m = addBody(p, 'magnetDisc', { name: 'Magnet', params: { radius: 10, height: 8 }, material: 'magnetNdFeB', position: [0, 0, 4] });
    addBody(p, 'box', { name: 'Iron plate', params: { width: 40, depth: 40, height: 4 }, material: 'ferrite', position: [0, 0, 12] });
    const s = addSystem(p, 'magnetostatic');
    s.enclosure.padding = 0.03;
    addBc(s, 'magnet', { remanence: 1.2, direction: [0, 0, 1], bodies: [m.id] });
    s.mesh.size = 0.003; s.mesh.order = 1;
  }),
  // ── acoustic
  sample('roomModes', 'acoustic', 'simAcoustic', ['공간 공명 모드', '벽이 단단한 상자 안 공기의 음향 모드'], ['Cavity modes', 'Acoustic modes of air in a rigid box'], (p) => {
    addBody(p, 'box', { name: 'Air volume', params: { width: 400, depth: 300, height: 250 }, material: 'air' });
    const s = addSystem(p, 'acousticModal');
    s.settings.modes = 10;
    s.mesh.size = 0.03;
  }),
  sample('ductAcoustic', 'acoustic', 'simAcousticHarmonic', ['덕트 음향 응답', '한쪽에서 가진하고 반대쪽에서 흡음하는 덕트의 음압'], ['Duct acoustics', 'Sound pressure in a duct driven at one end, absorbed at the other'], (p) => {
    const b = addBody(p, 'box', { name: 'Duct air', params: { width: 500, depth: 60, height: 60 }, material: 'air', position: [250, 0, 0] });
    const s = addSystem(p, 'acousticHarmonic');
    Object.assign(s.settings, { fmin: 50, fmax: 1500, points: 60 });
    addBc(s, 'acVelocity', { value: 1e-3, faces: [face(b, [0, 0, 0], [-1, 0, 0], 3600)] });
    addBc(s, 'absorbing', { impedance: 420, faces: [face(b, [500, 0, 0], [1, 0, 0], 3600)] });
    s.mesh.size = 0.012;
  }),
];

export function buildSample(id, lang = 'ko') {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) return null;
  const p = createProject(s[lang === 'en' ? 'en' : 'ko'][0]);
  s.build(p);
  p.active = p.systems[0]?.id ?? null;
  p.sample = id;
  return p;
}
