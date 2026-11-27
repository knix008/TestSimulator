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
    s.probes = [{ id: 'p1', name: 'Tip', point: [200, 0, 7.5] }, { id: 'p2', name: 'Middle', point: [100, 0, 7.5] }, { id: 'p3', name: 'Quarter', point: [50, 0, 7.5] }];
    s.mesh.size = 0.006; s.mesh.order = 1;
  }),
  sample('spectrumTower', 'dynamics', 'simSpectrum', ['응답 스펙트럼(지진)', '바닥 가속도 스펙트럼에 대한 탑의 최대 응답'], ['Response spectrum', 'Peak response of a tower to a floor spectrum'], (p) => {
    const b = addBody(p, 'box', { name: 'Tower', params: { width: 20, depth: 20, height: 250 }, position: [0, 0, 125] });
    const s = addSystem(p, 'spectrum');
    Object.assign(s.settings, { direction: [1, 1, 0], combination: 'cqc', damping: 0.05 });
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
  // ── more structural: bolts, remote points, booleans and profiles
  sample('boltedJoint', 'structural', 'bcBolt', ['볼트 체결 겹치기 이음', '예하중 10 kN 볼트로 죈 두 판을 마찰 접촉으로 당김'], ['Bolted lap joint', 'Two plates clamped by a 10 kN bolt, pulled apart with frictional contact'], (p) => {
    const hole1 = addBody(p, 'cylinder', { name: 'Hole 1', params: { radius: 7, height: 12 }, position: [0, 0, 5] });
    const hole2 = addBody(p, 'cylinder', { name: 'Hole 2', params: { radius: 7, height: 12 }, position: [0, 0, 15] });
    const head = addBody(p, 'cylinder', { name: 'Head', params: { radius: 11, height: 5 }, position: [0, 0, 22.5] });
    const nut = addBody(p, 'cylinder', { name: 'Nut', params: { radius: 11, height: 5 }, position: [0, 0, -2.5] });
    const lower = addBody(p, 'box', { name: 'Lower plate', params: { width: 80, depth: 40, height: 10 }, position: [-20, 0, 5], material: 'aluminum' });
    const upper = addBody(p, 'box', { name: 'Upper plate', params: { width: 80, depth: 40, height: 10 }, position: [20, 0, 15], material: 'aluminum' });
    const bolt = addBody(p, 'cylinder', { name: 'Bolt', params: { radius: 5, height: 30 }, position: [0, 0, 10] });
    lower.ops = [{ op: 'subtract', tool: hole1.id }];
    upper.ops = [{ op: 'subtract', tool: hole2.id }];
    bolt.ops = [{ op: 'union', tool: head.id }, { op: 'union', tool: nut.id }];
    for (const tb of [hole1, hole2, head, nut]) tb.tool = true;
    const s = addSystem(p, 'static');
    s.contacts.push({ id: 'k1', a: lower.id, b: upper.id, type: 'frictional', friction: 0.2, suppressed: false });
    addBc(s, 'fixed', { faces: [face(lower, [-60, 0, 5], [-1, 0, 0], 400)] });
    addBc(s, 'force', { vector: [1200, 0, 0], faces: [face(upper, [60, 0, 15], [1, 0, 0], 400)] });
    addBc(s, 'boltPretension', { mode: 'force', force: 10000, axis: [0, 0, 1], bodies: [bolt.id] });
    s.mesh.size = 0.0025; s.mesh.order = 1;
  }),
  sample('remoteLever', 'structural', 'bcRemoteForce', ['원격 힘(레버)', '보 끝에서 100 mm 떨어진 점의 힘 — 굽힘과 비틀림'], ['Remote force (lever)', 'A force 100 mm off the beam end: bending and twisting'], (p) => {
    const b = beam(p, { length: 200, size: 20, name: 'Arm' });
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [0, 0, 0], [-1, 0, 0], 400)] });
    addBc(s, 'remoteForce', { behavior: 'rigid', atCentroid: false, point: [0.2, 0, 0.1], vector: [0, 400, 0], moment: [0, 0, 0], faces: [face(b, [200, 0, 0], [1, 0, 0], 400)] });
    s.probes = [{ id: 'p1', name: 'Tip', point: [200, 0, 10] }, { id: 'p2', name: 'Middle', point: [100, 0, 10] }];
    s.mesh.size = 0.004;
  }),
  sample('shaftTwist', 'structural', 'bcRemoteDisplacement', ['원격 변위(축 끝 회전)', '축 끝면을 강체처럼 0.5° 돌릴 때의 응력과 반력 토크'], ['Remote displacement (twist)', 'Stress and reaction torque when the shaft end turns 0.5° rigidly'], (p) => {
    const b = addBody(p, 'shaft', { name: 'Shaft', params: { d1: 40, l1: 60, d2: 30, l2: 100, d3: 24, l3: 60 } });
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(b, [-110, 0, 0], [-1, 0, 0], 1257)] });
    addBc(s, 'remoteDisplacement', { atCentroid: true, x: 0, y: 0, z: 0, rx: 0.5, ry: null, rz: null, faces: [face(b, [110, 0, 0], [1, 0, 0], 452)] });
    s.mesh.size = 0.004;
  }),
  sample('revolvedHub', 'structural', 'profileRevolve', ['윤곽 회전·불리언 허브', '윤곽을 돌려 만든 허브에 키 홈을 빼서 누름'], ['Revolved hub with keyway', 'A hub revolved from a profile, a keyway subtracted, pressed on top'], (p) => {
    const key = addBody(p, 'box', { name: 'Keyway', params: { width: 6, depth: 6, height: 40 }, position: [11, 0, 15] });
    const hub = addBody(p, 'profileRevolve', { name: 'Hub', material: 'castIron' });
    hub.profile = [[10, 0], [40, 0], [40, 8], [20, 8], [20, 30], [10, 30]];
    hub.ops = [{ op: 'subtract', tool: key.id }];
    key.tool = true;
    const s = addSystem(p, 'static');
    addBc(s, 'fixed', { faces: [face(hub, [0, 0, 0], [0, 0, -1], 4712)] });
    addBc(s, 'pressure', { value: 20e6, faces: [face(hub, [0, 0, 30], [0, 0, 1], 942)] });
    s.mesh.size = 0.003;
  }),
  sample('ballImpact', 'dynamics', 'shapeSphere', ['두 바디 충돌(외연적)', '강철 공이 알루미늄 판에 부딪히는 바디 사이 접촉'], ['Two-body impact', 'A steel ball striking an aluminium plate: body-to-body contact'], (p) => {
    const plate = addBody(p, 'box', { name: 'Plate', params: { width: 100, depth: 100, height: 8 }, material: 'aluminum', position: [0, 0, -4] });
    const ball = addBody(p, 'sphere', { name: 'Ball', params: { radius: 10 }, position: [0, 0, 14] });
    const s = addSystem(p, 'explicit');
    Object.assign(s.settings, { endTime: 0.0012, frames: 40, targetTimeStep: 2e-7, bodyContact: true, contactFriction: 0.1 });
    addBc(s, 'fixed', { faces: [face(plate, [0, 0, -8], [0, 0, -1], 10000)] });
    addBc(s, 'velocity', { vector: [0, 0, -15], bodies: [ball.id] });
    s.probes = [{ id: 'p1', name: 'Ball top', point: [0, 0, 24] }, { id: 'p2', name: 'Plate centre', point: [0, 0, 0] }];
    s.mesh.size = 0.004; s.mesh.order = 1;
  }),
  // ── more dynamics
  sample('plateModes', 'dynamics', 'simModal', ['외팔 판의 진동 모드', '한쪽 끝이 고정된 얇은 판의 굽힘·비틀림 모드'], ['Cantilever plate modes', 'Bending and twisting modes of a thin plate fixed at one end'], (p) => {
    const b = addBody(p, 'box', { name: 'Plate', params: { width: 120, depth: 80, height: 3 }, material: 'aluminum' });
    const s = addSystem(p, 'modal');
    s.settings.modes = 6;
    addBc(s, 'fixed', { faces: [face(b, [-60, 0, 0], [-1, 0, 0], 240)] });
    s.mesh.size = 0.004;
  }),
  sample('plateHarmonic', 'dynamics', 'simHarmonic', ['판의 조화 응답', '양 끝이 고정된 판에 압력 가진 — 공진 주파수의 응답'], ['Plate harmonic response', 'A plate held at both ends under an oscillating pressure: response at resonance'], (p) => {
    const b = addBody(p, 'box', { name: 'Plate', params: { width: 120, depth: 80, height: 3 }, material: 'steel' });
    const s = addSystem(p, 'harmonic');
    Object.assign(s.settings, { fmin: 50, fmax: 3000, points: 80, modes: 10, damping: 0.02 });
    addBc(s, 'fixed', { faces: [face(b, [-60, 0, 0], [-1, 0, 0], 240)] });
    addBc(s, 'fixed', { faces: [face(b, [60, 0, 0], [1, 0, 0], 240)] });
    addBc(s, 'pressure', { value: 1000, faces: [face(b, [0, 0, 1.5], [0, 0, 1], 9600)] });
    s.probes = [{ id: 'p1', name: 'Centre', point: [0, 0, 1.5] }, { id: 'p2', name: 'Quarter', point: [-30, 0, 1.5] }];
    s.mesh.size = 0.004; s.mesh.order = 1;
  }),
  // ── more thermal
  sample('finConduction', 'thermal', 'simThermal', ['냉각 핀', '뿌리가 100 °C인 알루미늄 핀의 대류 냉각과 온도 분포'], ['Cooling fin', 'Convection cooling and temperature along an aluminium fin with a 100 °C root'], (p) => {
    const b = addBody(p, 'box', { name: 'Fin', params: { width: 100, depth: 20, height: 4 }, material: 'aluminum', position: [50, 0, 0] });
    const s = addSystem(p, 'thermal');
    addBc(s, 'temperature', { value: 100, faces: [face(b, [0, 0, 0], [-1, 0, 0], 80)] });
    addBc(s, 'convection', { h: 30, ambient: 20, faces: [face(b, [50, 0, 2], [0, 0, 1], 2000), face(b, [50, 0, -2], [0, 0, -1], 2000), face(b, [100, 0, 0], [1, 0, 0], 80)] });
    s.mesh.size = 0.002;
  }),
  sample('chipOnBoard', 'thermal', 'shapeCapacitor', ['기판 위의 칩 발열', '2 W 칩이 FR-4 기판으로 열을 퍼뜨리고 대류로 식음'], ['Chip on a board', 'A 2 W chip spreading heat into an FR-4 board, cooled by convection'], (p) => {
    const board = addBody(p, 'box', { name: 'Board', params: { width: 80, depth: 60, height: 1.6 }, material: 'pcb' });
    const chip = addBody(p, 'box', { name: 'Chip', params: { width: 16, depth: 16, height: 2 }, material: 'silicon', position: [0, 0, 1.8] });
    const s = addSystem(p, 'thermal');
    addBc(s, 'heatPower', { value: 2, bodies: [chip.id] });
    addBc(s, 'convection', { h: 15, ambient: 25, faces: [face(board, [0, 0, 0.8], [0, 0, 1], 4544), face(board, [0, 0, -0.8], [0, 0, -1], 4800), face(chip, [0, 0, 2.8], [0, 0, 1], 256)] });
    s.mesh.size = 0.0016; s.mesh.order = 1;
  }),
  sample('compositeWall', 'thermal', 'shapeBox', ['단열 벽체', '콘크리트와 목재 두 층 벽을 통한 열손실'], ['Insulated wall', 'Heat loss through a two-layer concrete and wood wall'], (p) => {
    const c = addBody(p, 'box', { name: 'Concrete', params: { width: 100, depth: 100, height: 40 }, material: 'concrete', position: [0, 0, 20] });
    const w = addBody(p, 'box', { name: 'Wood', params: { width: 100, depth: 100, height: 20 }, material: 'wood', position: [0, 0, 50] });
    const s = addSystem(p, 'thermal');
    addBc(s, 'temperature', { value: 22, faces: [face(c, [0, 0, 0], [0, 0, -1], 10000)] });
    addBc(s, 'convection', { h: 25, ambient: -10, faces: [face(w, [0, 0, 60], [0, 0, 1], 10000)] });
    s.mesh.size = 0.008;
  }),
  sample('radiantPanel', 'thermal', 'bcRadiation', ['복사 패널', '아래에서 가열되고 위로 복사와 자연 대류로 식는 강판'], ['Radiant panel', 'A steel panel heated from below, losing heat by radiation and natural convection'], (p) => {
    const b = addBody(p, 'box', { name: 'Panel', params: { width: 100, depth: 100, height: 2 }, material: 'steel' });
    const s = addSystem(p, 'thermal');
    addBc(s, 'heatFlux', { value: 2000, faces: [face(b, [0, 0, -1], [0, 0, -1], 10000)] });
    addBc(s, 'radiation', { emissivity: 0.9, ambient: 20, faces: [face(b, [0, 0, 1], [0, 0, 1], 10000)] });
    addBc(s, 'convection', { h: 5, ambient: 20, faces: [face(b, [0, 0, 1], [0, 0, 1], 10000)] });
    s.mesh.size = 0.004; s.mesh.order = 1;
  }),
  sample('quenchBlock', 'thermal', 'simThermalTransient', ['담금질 냉각', '600 °C 강 블록을 물에 넣었을 때의 시간별 냉각'], ['Quenching', 'A 600 °C steel block cooling in water, over time'], (p) => {
    const b = addBody(p, 'box', { name: 'Block', params: { width: 40, depth: 40, height: 40 }, material: 'steel' });
    const s = addSystem(p, 'thermalTransient');
    Object.assign(s.settings, { endTime: 120, steps: 40, initialTemperature: 600 });
    const all = [[[20, 0, 0], [1, 0, 0]], [[-20, 0, 0], [-1, 0, 0]], [[0, 20, 0], [0, 1, 0]], [[0, -20, 0], [0, -1, 0]], [[0, 0, 20], [0, 0, 1]], [[0, 0, -20], [0, 0, -1]]].map(([c, n]) => face(b, c, n, 1600));
    addBc(s, 'convection', { h: 500, ambient: 25, faces: all });
    s.probes = [{ id: 'p1', name: 'Centre', point: [0, 0, 0] }, { id: 'p2', name: 'Corner', point: [20, 20, 20] }];
    s.mesh.size = 0.005; s.mesh.order = 1;
  }),
  sample('heatedRod', 'thermal', 'bcHeatGeneration', ['내부 발열 봉', '구리 봉의 균일 발열과 양 끝 냉각 — 포물선 온도 분포'], ['Rod with internal heating', 'Uniform heating in a copper rod cooled at both ends: a parabolic temperature'], (p) => {
    const b = addBody(p, 'cylinder', { name: 'Rod', params: { radius: 10, height: 100 }, material: 'copper' });
    const s = addSystem(p, 'thermal');
    addBc(s, 'heatGeneration', { value: 2e6, bodies: [b.id] });
    addBc(s, 'temperature', { value: 25, faces: [face(b, [0, 0, 50], [0, 0, 1], 314), face(b, [0, 0, -50], [0, 0, -1], 314)] });
    s.mesh.size = 0.004;
  }),
  // ── more fluid
  sample('cylinderCrossflow', 'fluid', 'shapeCylinder', ['원기둥 주위 유동', '흐름에 수직인 원기둥의 항력과 후류 소용돌이'], ['Flow across a cylinder', 'Drag and wake of a cylinder across the stream'], (p) => {
    addBody(p, 'cylinder', { name: 'Cylinder', params: { radius: 15, height: 60 }, rotation: [90, 0, 0] });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [5, 0, 0], maxSteps: 400 });
  }),
  sample('sphereDrag', 'fluid', 'shapeSphere', ['구의 항력', '바람 속 구의 항력 계수와 압력 분포'], ['Sphere drag', 'Drag coefficient and pressure on a sphere in the wind'], (p) => {
    addBody(p, 'sphere', { name: 'Sphere', params: { radius: 20 } });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [5, 0, 0], maxSteps: 400 });
  }),
  sample('plateNormal', 'fluid', 'shapeBox', ['흐름에 수직인 판', '정면으로 바람을 받는 판의 큰 항력과 박리 후류'], ['Plate normal to the flow', 'The large drag and separated wake of a plate facing the wind'], (p) => {
    addBody(p, 'box', { name: 'Plate', params: { width: 4, depth: 60, height: 60 } });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [5, 0, 0], maxSteps: 400 });
  }),
  sample('heatedCylinderFlow', 'fluid', 'simThermal', ['가열 원기둥의 강제 대류', '5 W로 가열되는 원기둥을 식히는 공기 흐름(공액)'], ['Heated cylinder in crossflow', 'An air stream cooling a cylinder heated with 5 W (conjugate)'], (p) => {
    const b = addBody(p, 'cylinder', { name: 'Heater', params: { radius: 12, height: 50 }, rotation: [90, 0, 0], material: 'aluminum' });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { inletVelocity: [2, 0, 0], thermal: true, buoyancy: false, maxSteps: 400 });
    addBc(s, 'heatPower', { value: 5, bodies: [b.id] });
  }),
  sample('channelFlow', 'fluid', 'shapeDuct', ['사각 관로 유동', '물이 흐르는 사각 관로의 속도 분포와 압력 강하'], ['Square channel flow', 'Velocity profile and pressure drop of water in a square channel'], (p) => {
    const b = addBody(p, 'box', { name: 'Channel', params: { width: 200, depth: 30, height: 30 }, material: 'water' });
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { flowType: 'internal', fluid: 'water', inletVelocity: [0.1, 0, 0], maxSteps: 300, turbulence: 'laminar' });
    addBc(s, 'inlet', { speed: 0.1, faces: [face(b, [-100, 0, 0], [-1, 0, 0], 900)] });
    addBc(s, 'outlet', { faces: [face(b, [100, 0, 0], [1, 0, 0], 900)] });
  }),
  sample('backwardStep', 'fluid', 'pushPull', ['뒤쪽 계단 유동', '갑자기 넓어지는 관로에서 생기는 재순환 영역'], ['Backward-facing step', 'The recirculation behind a sudden widening of a channel'], (p) => {
    const b = addBody(p, 'profileExtrude', { name: 'Channel', params: { height: 30 }, material: 'water' });
    b.profile = [[0, 0], [200, 0], [200, 40], [40, 40], [40, 20], [0, 20]];
    const s = addSystem(p, 'fluid');
    Object.assign(s.settings, { flowType: 'internal', fluid: 'water', inletVelocity: [0.1, 0, 0], maxSteps: 350, turbulence: 'turbulent' });
    addBc(s, 'inlet', { speed: 0.1, faces: [face(b, [0, 10, 0], [-1, 0, 0], 600)] });
    addBc(s, 'outlet', { faces: [face(b, [200, 20, 0], [1, 0, 0], 1200)] });
  }),
  // ── more electromagnetics
  sample('coaxial', 'electromagnetic', 'shapeTube', ['동축 전극', '안쪽 도체와 바깥 관 사이의 전기장과 단위 길이 정전 용량'], ['Coaxial electrodes', 'Field and capacitance between an inner conductor and an outer tube'], (p) => {
    const inner = addBody(p, 'cylinder', { name: 'Inner', params: { radius: 5, height: 60 }, material: 'copper' });
    const outer = addBody(p, 'tube', { name: 'Outer', params: { outer: 22, inner: 20, height: 60 }, material: 'copper' });
    const s = addSystem(p, 'electrostatic');
    s.enclosure.padding = 0.01;
    addBc(s, 'voltage', { value: 100, bodies: [inner.id] });
    addBc(s, 'voltage', { value: 0, bodies: [outer.id] });
    s.mesh.size = 0.003; s.mesh.order = 1;
  }),
  sample('chargedSphere', 'electromagnetic', 'shapeSphere', ['대전된 구', '1 kV 구 주위 공기의 전위와 전기장 — 1/r² 감쇠'], ['Charged sphere', 'Potential and field around a sphere at 1 kV: the 1/r² decay'], (p) => {
    const b = addBody(p, 'sphere', { name: 'Sphere', params: { radius: 10 }, material: 'copper' });
    const s = addSystem(p, 'electrostatic');
    s.enclosure.padding = 0.04;
    addBc(s, 'voltage', { value: 1000, bodies: [b.id] });
    s.mesh.size = 0.004; s.mesh.order = 1;
  }),
  sample('stripResistor', 'electromagnetic', 'simCurrent', ['박막 저항', '스테인리스 띠의 저항과 전류 밀도'], ['Strip resistor', 'Resistance and current density of a stainless steel strip'], (p) => {
    const b = addBody(p, 'box', { name: 'Strip', params: { width: 50, depth: 10, height: 1 }, material: 'stainless' });
    const s = addSystem(p, 'conduction');
    addBc(s, 'voltage', { value: 0, faces: [face(b, [-25, 0, 0], [-1, 0, 0], 10)] });
    addBc(s, 'voltage', { value: 0.05, faces: [face(b, [25, 0, 0], [1, 0, 0], 10)] });
    s.mesh.size = 0.001; s.mesh.order = 1;
  }),
  sample('heaterTrack', 'electromagnetic', 'bcHeatGeneration', ['히터 트랙', '전압을 건 스테인리스 트랙의 줄 발열과 온도(연성)'], ['Heater track', 'Joule heating and temperature of a powered stainless track (coupled)'], (p) => {
    const b = addBody(p, 'plateHole', { name: 'Track', params: { width: 80, depth: 12, thickness: 1, holeDiameter: 6 }, material: 'stainless' });
    const s = addSystem(p, 'conduction');
    s.settings.coupleThermal = true;
    addBc(s, 'voltage', { value: 0, faces: [face(b, [-40, 0, 0], [-1, 0, 0], 12)] });
    addBc(s, 'voltage', { value: 0.1, faces: [face(b, [40, 0, 0], [1, 0, 0], 12)] });
    addBc(s, 'convection', { h: 20, ambient: 25, faces: [face(b, [0, 0, 0.5], [0, 0, 1], 932), face(b, [0, 0, -0.5], [0, 0, -1], 932)] });
    addBc(s, 'temperature', { value: 25, faces: [face(b, [-40, 0, 0], [-1, 0, 0], 12), face(b, [40, 0, 0], [1, 0, 0], 12)] });
    s.mesh.size = 0.0012; s.mesh.order = 1;
  }),
  sample('coilCore', 'electromagnetic', 'bcCoil', ['철심 코일', '연철 철심이 코일의 자속과 인덕턴스를 크게 높임'], ['Coil with an iron core', 'A soft iron core raising the flux and inductance of a coil'], (p) => {
    const c = addBody(p, 'coil', { name: 'Coil', params: { outer: 30, inner: 22, height: 60 }, material: 'copper' });
    addBody(p, 'cylinder', { name: 'Core', params: { radius: 18, height: 80 }, material: 'ferrite' });
    const s = addSystem(p, 'magnetostatic');
    s.enclosure.padding = 0.05;
    addBc(s, 'coil', { current: 2, turns: 300, kind: 'loop', axis: [0, 0, 1], bodies: [c.id] });
    s.mesh.size = 0.007; s.mesh.order = 1;
  }),
  sample('magnetPair', 'electromagnetic', 'shapeMagnet', ['자석 두 개', '마주 보는 두 영구 자석 사이의 자속과 끄는 힘'], ['Two magnets', 'Flux between two facing permanent magnets and their pull'], (p) => {
    const a = addBody(p, 'magnetDisc', { name: 'Magnet A', params: { radius: 10, height: 6 }, material: 'magnetNdFeB', position: [0, 0, -7] });
    const b = addBody(p, 'magnetDisc', { name: 'Magnet B', params: { radius: 10, height: 6 }, material: 'magnetNdFeB', position: [0, 0, 7] });
    const s = addSystem(p, 'magnetostatic');
    s.enclosure.padding = 0.03;
    addBc(s, 'magnet', { remanence: 1.2, direction: [0, 0, 1], bodies: [a.id] });
    addBc(s, 'magnet', { remanence: 1.2, direction: [0, 0, 1], bodies: [b.id] });
    s.mesh.size = 0.003; s.mesh.order = 1;
  }),
  // ── more acoustics
  sample('tubeModes', 'acoustic', 'simAcoustic', ['닫힌 관의 공명', '양 끝이 막힌 관 속 공기의 축 방향 모드 (f = n·c/2L)'], ['Closed tube resonance', 'Axial modes of the air in a tube closed at both ends (f = n·c/2L)'], (p) => {
    addBody(p, 'box', { name: 'Air column', params: { width: 600, depth: 40, height: 40 }, material: 'air' });
    const s = addSystem(p, 'acousticModal');
    s.settings.modes = 6;
    s.mesh.size = 0.02;
  }),
  sample('cylinderCavity', 'acoustic', 'shapeCylinder', ['원통 공동 모드', '닫힌 원통 속 공기의 축·반지름·둘레 방향 모드'], ['Cylindrical cavity', 'Axial, radial and circumferential modes of air in a closed cylinder'], (p) => {
    addBody(p, 'cylinder', { name: 'Air', params: { radius: 100, height: 150 }, material: 'air' });
    const s = addSystem(p, 'acousticModal');
    s.settings.modes = 8;
    s.mesh.size = 0.02;
  }),
  sample('sphereCavity', 'acoustic', 'shapeSphere', ['구형 공동 모드', '구 안의 공기 — 첫 모드가 겹친(축퇴) 세 쌍'], ['Spherical cavity', 'Air inside a sphere: the first mode comes as a degenerate triple'], (p) => {
    addBody(p, 'sphere', { name: 'Air', params: { radius: 100 }, material: 'air' });
    const s = addSystem(p, 'acousticModal');
    s.settings.modes = 6;
    s.mesh.size = 0.025; s.mesh.order = 1;
  }),
  sample('roomResponse', 'acoustic', 'simAcousticHarmonic', ['방의 음향 응답', '한쪽 벽이 진동하고 맞은편 벽이 흡음하는 방의 음압'], ['Room response', 'Sound pressure in a room driven by one wall, absorbed by the opposite one'], (p) => {
    const b = addBody(p, 'box', { name: 'Room air', params: { width: 400, depth: 300, height: 250 }, material: 'air' });
    const s = addSystem(p, 'acousticHarmonic');
    Object.assign(s.settings, { fmin: 30, fmax: 600, points: 30 });
    addBc(s, 'acVelocity', { value: 1e-3, faces: [face(b, [-200, 0, 0], [-1, 0, 0], 75000)] });
    addBc(s, 'absorbing', { impedance: 1500, faces: [face(b, [200, 0, 0], [1, 0, 0], 75000)] });
    s.probes = [{ id: 'p1', name: 'Listener', point: [100, 50, 0] }];
    s.mesh.size = 0.035; s.mesh.order = 1;
  }),
  sample('muffler', 'acoustic', 'shapePipe', ['소음기 확장실', '좁은 관 사이 확장실이 만드는 주파수별 소음 저감'], ['Expansion chamber muffler', 'The frequency-dependent attenuation of a chamber between two narrow pipes'], (p) => {
    const inlet = addBody(p, 'box', { name: 'Inlet pipe', params: { width: 100, depth: 30, height: 30 }, material: 'air', position: [-100, 0, 0] });
    addBody(p, 'box', { name: 'Chamber', params: { width: 100, depth: 100, height: 100 }, material: 'air' });
    const outlet = addBody(p, 'box', { name: 'Outlet pipe', params: { width: 100, depth: 30, height: 30 }, material: 'air', position: [100, 0, 0] });
    const s = addSystem(p, 'acousticHarmonic');
    Object.assign(s.settings, { fmin: 50, fmax: 1500, points: 30 });
    addBc(s, 'acVelocity', { value: 1e-3, faces: [face(inlet, [-150, 0, 0], [-1, 0, 0], 900)] });
    addBc(s, 'absorbing', { impedance: 420, faces: [face(outlet, [150, 0, 0], [1, 0, 0], 900)] });
    s.probes = [{ id: 'p1', name: 'Outlet', point: [145, 0, 0] }, { id: 'p2', name: 'Inlet', point: [-145, 0, 0] }];
    s.mesh.size = 0.01;
  }),
  sample('helmholtz', 'acoustic', 'bcAcPressure', ['헬름홀츠 공명기', '상자와 목으로 된 공명기 — 낮은 첫 모드'], ['Helmholtz resonator', 'A box with a neck: a low first mode'], (p) => {
    addBody(p, 'box', { name: 'Cavity', params: { width: 100, depth: 100, height: 100 }, material: 'air', position: [0, 0, 50] });
    const neck = addBody(p, 'cylinder', { name: 'Neck', params: { radius: 10, height: 40 }, material: 'air', position: [0, 0, 120] });
    const s = addSystem(p, 'acousticModal');
    s.settings.modes = 6;
    // The neck opens to the room: zero sound pressure at its end.
    addBc(s, 'acPressure', { value: 0, faces: [face(neck, [0, 0, 140], [0, 0, 1], 314)] });
    s.mesh.size = 0.008;
  }),
  sample('bentDuctAcoustic', 'acoustic', 'shapeElbow', ['굽은 덕트 음향', '꺾인 덕트를 지나는 소리의 전달과 공명'], ['Bent duct acoustics', 'Sound travelling through a duct with a bend, and its resonances'], (p) => {
    const b = addBody(p, 'bentChannel', { name: 'Duct air', params: { width: 30, legA: 150, legB: 150 }, material: 'air' });
    const s = addSystem(p, 'acousticHarmonic');
    Object.assign(s.settings, { fmin: 100, fmax: 2500, points: 40 });
    addBc(s, 'acVelocity', { value: 1e-3, faces: [face(b, [-15, 0, 0], [-1, 0, 0], 900)] });
    addBc(s, 'absorbing', { impedance: 420, faces: [face(b, [0, 0, 150], [0, 0, 1], 900)] });
    s.mesh.size = 0.008;
  }),
  sample('twoRooms', 'acoustic', 'shapeBox', ['문으로 이어진 두 방', '문 하나로 이어진 두 방의 결합 음향 모드'], ['Two coupled rooms', 'Acoustic modes of two rooms joined by a doorway'], (p) => {
    addBody(p, 'box', { name: 'Room A', params: { width: 200, depth: 200, height: 150 }, material: 'air', position: [-120, 0, 0] });
    addBody(p, 'box', { name: 'Door', params: { width: 40, depth: 60, height: 100 }, material: 'air', position: [0, 0, -25] });
    addBody(p, 'box', { name: 'Room B', params: { width: 200, depth: 200, height: 150 }, material: 'air', position: [120, 0, 0] });
    const s = addSystem(p, 'acousticModal');
    s.settings.modes = 10;
    s.mesh.size = 0.02;
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
