// Engineering tools (the Icepak / FloTHERM / Sherlock / HAM style helpers): compact package and heat-sink builders,
// a PCB stack-up calculator, power-map sources, solder-joint fatigue (physics of failure), a harmonic sweep from a
// modal result and a node heat-map comparison. Each opener takes the app API and shows one popup. On the desktop a
// popup moves into a window of its own, so every element is kept by reference (no document queries, no listeners
// on window / document).
import { h, replace, numberField } from './dom.js';
import { getLanguage } from '../core/i18n.js';
import { popup } from './dialogs.js';
import { drawLineChart } from './charts.js';
import { formatValue, lut } from '../core/colormap.js';
import { newId, bodyBounds } from '../core/model.js';
import { MATERIAL_LIBRARY, materialFromLibrary, materialName } from '../core/materials.js';
import { jedecTwoResistor, heatSink, pcbStackup, powerMapBodies } from '../core/compact.js';
import { componentLife, rainflow, miner, coffinManson, norrisLandzberg, engelmaier, steinberg, weibull } from '../core/reliability.js';
import { harmonicResponse, responsePeaks, dominantAxis } from '../core/harmonic.js';
import { parseNodeCsv, nodesAt, nodeStats, nodeBounds, idwRaster, deltaMap, envelope, sampleNodeCsv } from '../core/heatmap.js';
import * as native from '../platform/native.js';

const STR = {
  ko: {
    close: '닫기', addToModel: '모델에 추가', add: '추가', remove: '삭제', up: '위로', down: '아래로', name: '이름', material: '재료',
    noModel: '열린 모델이 없습니다.', needResult: '먼저 해석을 실행하세요.', added: (n) => `모델에 ${n}개를 추가했습니다.`,
    mm: 'mm', fromLibrary: '라이브러리',
    // compact
    compactTitle: 'JEDEC 2-저항 패키지 모델', pkgName: '패키지', footprint: '외형', posX: '위치 x', posY: '위치 y', width: '폭 (x)', depthZ: '깊이 (z)',
    thickness: '두께', z0: '시작 z', rjc: 'Rjc (접합-케이스)', rjb: 'Rjb (접합-기판)', power: '발열량', layers: '층 전도율',
    layer: '층', layerTop: '윗층 (케이스 쪽)', layerJunction: '접합층', layerBottom: '아래층 (기판 쪽)', kValue: 'k (W/m·K)',
    compactNote2d: (d) => `2D 단면: 깊이는 해석 영역의 깊이 ${d} mm 를 씁니다. 접합부 온도 탐침이 함께 추가됩니다.`,
    compactNote3d: '3D: 외형 x × z 를 y 방향으로 쌓습니다. 접합부 온도 탐침이 함께 추가됩니다.',
    // heat sink
    heatsinkTitle: '판형 핀 히트싱크', hsName: '히트싱크', baseX: '바닥 x', baseY: '바닥 y', baseW: '바닥 폭', baseT: '바닥 두께', finCount: '핀 개수',
    finT: '핀 두께', finH: '핀 높이', z1: '끝 z', gap: '핀 간격', pitch: '핀 피치', preview: '미리보기', bodiesN: (n) => `물체 ${n}개`,
    hsFit: (n, t, w) => `핀 ${n}개 × ${t} mm 는 ${w} mm 바닥에 들어가지 않습니다.`,
    // stack-up
    stackupTitle: 'PCB 적층 유효 전도율', stackName: 'PCB 적층', type: '종류', copper: '구리', dielectric: '절연층 (FR-4)', coverage: '구리 비율',
    preset: '프리셋', preset2: '2층 1.6 mm', preset4: '4층 1.6 mm', addLayer: '층 추가', kIn: '면내 k', kThrough: '두께 방향 k', totalT: '전체 두께', cuFraction: '구리 체적비',
    addMaterial: '재료로 추가', stackNote: '면내 = 두께 가중 평균(병렬), 두께 방향 = 직렬 합. 재료는 k = 두께 방향(2D 단면의 y), kx = kz = 면내로 들어갑니다.',
    stackAdded: (name) => `재료 "${name}" 을(를) 추가했습니다.`,
    // power map
    powermapTitle: '전력 맵 열원', csv: 'CSV (x, y, W)', loadFile: '파일 열기…', sample: '예제', sourceSize: '열원 크기', sources: '열원 수', totalPower: '전체 발열량',
    outside: (n) => `${n}개가 해석 영역 밖에 있습니다.`, pmNote: '한 줄에 x, y (mm), W — 쉼표·세미콜론·탭 구분, 머리글은 건너뜁니다. 각 점에 정사각형 열원이 생깁니다.', srcName: '열원',
    // fatigue
    fatigueTitle: '솔더 접합 피로 (고장 물리)', tabCycles: '열 사이클·마이너', tabNL: '노리스-란즈버그', tabWeibull: '와이블', tabVibration: '진동 (스타인버그)',
    component: '부품', board: '기판', history: '온도 이력', source: '이력 출처', bodyMax: '물체 최고', probe: '탐침',
    range: 'ΔT (K)', mean: '평균 (°C)', count: '횟수', nf: 'Nf', damage: '손상', cycles: '사이클', model: '수명 모델', coffin: '코핀-맨슨', engel: '엥겔마이어',
    cmC: 'C', cmN: 'n', ld: '중립점 거리 LD', dAlpha: 'Δα', solderH: '솔더 높이 h', dwell: '유지 시간', fromMaterials: '재료에서', repeats: '이력 반복/일',
    totalDamage: '이력 1회 손상 D', lifeRepeats: '수명 (반복 수)', lifeYears: '수명', steadyNote: '정상 상태 결과: 주위 온도 → 최고 온도를 전원 1사이클로 셉니다.',
    noHistory: '선택한 이력에 값이 없습니다.', alphaInfo: (a, b) => `부품 α ${a} ppm/K, 기판 α ${b} ppm/K`,
    nlTest: '시험', nlField: '현장', dT: 'ΔT', freq: '주파수', tmax: '최고 온도', nlN: '지수 n', nlM: '지수 m', ea: 'Ea', testNf: '시험 수명', af: '가속 계수 AF', fieldNf: '현장 수명',
    nlNote: 'AF = (ΔT시험/ΔT현장)^n · (f현장/f시험)^m · exp[Ea/k·(1/Tmax현장 − 1/Tmax시험)], 현장 수명 = AF × 시험 수명.',
    beta: '형상 β', mttf: 'MTTF', fromReliability: '신뢰성 부품에서', eta: '척도 η', b10: 'B10 수명', b1: 'B1 수명', mission: '임무 시간', rMission: '임무 신뢰도', reliability: '신뢰도 R(t)',
    noComponent: '이 부품의 신뢰성 항목이 없어 MTTF 를 직접 입력합니다.',
    fn: '고유 진동수 fn', fromModes: (f) => `모드 해석 1차 ${f} Hz`, input: '입력', gLevel: 'G rms', psd: 'PSD', bandwidth: '대역폭', boardB: '기판 변 B', compL: '부품 길이 L',
    boardH: '기판 두께 h', posR: '위치 계수 r', compC: '부품 상수 c', zAllow: 'Z 허용', zResp: 'Z 응답 (3σ)', ratioZ: 'Z허용/Z응답', hours: '시간',
    steinNote: 'Z허용 = 0.00022·B/(c·h·r·√L) (in, 2천만 회), Z1σ = 9.8·Grms/fn², Nf = 2·10⁷·(Z허용/Z응답)^6.4. PSD 입력이면 Miles 식으로 Grms 를 구합니다 (Q = √fn).',
    // harmonic
    harmonicTitle: '조화 응답 (사인 스윕)', needModes: '모드 결과가 없습니다. 모드 해석(해석 설정 → 고유 진동수)을 켜고 해석을 실행하세요.',
    fMin: '최저 주파수', fMax: '최고 주파수', dampingPct: '감쇠비', kind: '종류', kindModal: '모드 중첩 (상대 진폭)', kindBase: '바닥 반력 / 강체', axis: '축', auto: '자동',
    amplitude: '진폭', phase: '위상 (°)', peaks: '응답 최대점', mode: '모드', logF: 'log₁₀ f (Hz)',
    harmonicNote: '모드 형상 없이 유효 질량비의 √ 를 참여 계수로 쓰므로 진폭은 상대값입니다 (한 점의 전달률이 아님).',
    // heat map compare
    hmTitle: '노드 열지도 비교', addFile: 'CSV 추가…', sets: '데이터', modeLabel: '방식', modeDelta: 'B − A 차이', modeEnvelope: '포락선 (최대)', setA: 'A', setB: 'B',
    time: '시간', stats: '통계', exportCsv: 'CSV 내보내기', nodes: '노드', minV: '최소', maxV: '최대', avgV: '평균', needTwo: 'CSV 파일을 두 개 이상 불러오세요.',
    noMatch: 'A 와 B 에 같은 노드 번호가 없습니다.', loadFailed: '불러오기 실패', samplePair: '예제 한 쌍', removeSet: '빼기',
  },
  en: {
    close: 'Close', addToModel: 'Add to model', add: 'Add', remove: 'Remove', up: 'Up', down: 'Down', name: 'Name', material: 'Material',
    noModel: 'No model is open.', needResult: 'Run the analysis first.', added: (n) => `Added ${n} item${n === 1 ? '' : 's'} to the model.`,
    mm: 'mm', fromLibrary: 'Library',
    compactTitle: 'JEDEC two-resistor package', pkgName: 'Package', footprint: 'Footprint', posX: 'Position x', posY: 'Position y', width: 'Width (x)', depthZ: 'Depth (z)',
    thickness: 'Thickness', z0: 'Start z', rjc: 'Rjc (junction–case)', rjb: 'Rjb (junction–board)', power: 'Power', layers: 'Layer conductivities',
    layer: 'Layer', layerTop: 'Top (case side)', layerJunction: 'Junction', layerBottom: 'Bottom (board side)', kValue: 'k (W/m·K)',
    compactNote2d: (d) => `2D section: the depth is the domain depth, ${d} mm. A junction temperature probe is added too.`,
    compactNote3d: '3D: the x × z footprint is stacked along y. A junction temperature probe is added too.',
    heatsinkTitle: 'Plate-fin heat sink', hsName: 'Heat sink', baseX: 'Base x', baseY: 'Base y', baseW: 'Base width', baseT: 'Base thickness', finCount: 'Fin count',
    finT: 'Fin thickness', finH: 'Fin height', z1: 'End z', gap: 'Fin gap', pitch: 'Fin pitch', preview: 'Preview', bodiesN: (n) => `${n} bodies`,
    hsFit: (n, t, w) => `${n} fins of ${t} mm do not fit on a ${w} mm base.`,
    stackupTitle: 'PCB stack-up conductivity', stackName: 'PCB stack-up', type: 'Type', copper: 'Copper', dielectric: 'Dielectric (FR-4)', coverage: 'Copper coverage',
    preset: 'Preset', preset2: '2-layer 1.6 mm', preset4: '4-layer 1.6 mm', addLayer: 'Add layer', kIn: 'In-plane k', kThrough: 'Through-plane k', totalT: 'Total thickness', cuFraction: 'Copper fraction',
    addMaterial: 'Add as material', stackNote: 'In-plane = thickness-weighted mean (parallel), through-plane = series sum. The material gets k = through-plane (y of a 2D section), kx = kz = in-plane.',
    stackAdded: (name) => `Added the material "${name}".`,
    powermapTitle: 'Power map sources', csv: 'CSV (x, y, W)', loadFile: 'Open file…', sample: 'Sample', sourceSize: 'Source size', sources: 'Sources', totalPower: 'Total power',
    outside: (n) => `${n} lie outside the domain.`, pmNote: 'One line per source: x, y (mm), W — comma, semicolon or tab separated; a header is skipped. Each point becomes a square source.', srcName: 'Source',
    fatigueTitle: 'Solder-joint fatigue (physics of failure)', tabCycles: 'Thermal cycles · Miner', tabNL: 'Norris–Landzberg', tabWeibull: 'Weibull', tabVibration: 'Vibration (Steinberg)',
    component: 'Component', board: 'Board', history: 'Temperature history', source: 'History from', bodyMax: 'Body max', probe: 'Probe',
    range: 'ΔT (K)', mean: 'Mean (°C)', count: 'Count', nf: 'Nf', damage: 'Damage', cycles: 'Cycles', model: 'Life model', coffin: 'Coffin–Manson', engel: 'Engelmaier',
    cmC: 'C', cmN: 'n', ld: 'Distance to neutral point LD', dAlpha: 'Δα', solderH: 'Solder height h', dwell: 'Dwell time', fromMaterials: 'From materials', repeats: 'History repeats / day',
    totalDamage: 'Damage per history D', lifeRepeats: 'Life (repeats)', lifeYears: 'Life', steadyNote: 'Steady result: ambient → maximum counts as one power cycle.',
    noHistory: 'The chosen history has no values.', alphaInfo: (a, b) => `component α ${a} ppm/K, board α ${b} ppm/K`,
    nlTest: 'Test', nlField: 'Field', dT: 'ΔT', freq: 'Frequency', tmax: 'Max temperature', nlN: 'Exponent n', nlM: 'Exponent m', ea: 'Ea', testNf: 'Test life', af: 'Acceleration factor AF', fieldNf: 'Field life',
    nlNote: 'AF = (ΔT_test/ΔT_field)^n · (f_field/f_test)^m · exp[Ea/k·(1/Tmax_field − 1/Tmax_test)], field life = AF × test life.',
    beta: 'Shape β', mttf: 'MTTF', fromReliability: 'From reliability', eta: 'Scale η', b10: 'B10 life', b1: 'B1 life', mission: 'Mission time', rMission: 'Mission reliability', reliability: 'Reliability R(t)',
    noComponent: 'This component has no reliability entry; enter the MTTF directly.',
    fn: 'Natural frequency fn', fromModes: (f) => `first modal frequency ${f} Hz`, input: 'Input', gLevel: 'G rms', psd: 'PSD', bandwidth: 'Bandwidth', boardB: 'Board edge B', compL: 'Component length L',
    boardH: 'Board thickness h', posR: 'Position factor r', compC: 'Component constant c', zAllow: 'Z allowable', zResp: 'Z response (3σ)', ratioZ: 'Z_allow / Z_resp', hours: 'Hours',
    steinNote: 'Z_allow = 0.00022·B/(c·h·r·√L) (in, 20 million cycles), Z_1σ = 9.8·G_rms/fn², Nf = 2·10⁷·(Z_allow/Z_resp)^6.4. A PSD input gives G_rms by Miles (Q = √fn).',
    harmonicTitle: 'Harmonic response (sine sweep)', needModes: 'No modal result. Turn on the modal study (study settings → natural frequencies) and run the analysis.',
    fMin: 'Min frequency', fMax: 'Max frequency', dampingPct: 'Damping ratio', kind: 'Kind', kindModal: 'Modal superposition (relative)', kindBase: 'Base force / rigid', axis: 'Axis', auto: 'Auto',
    amplitude: 'Amplitude', phase: 'Phase (°)', peaks: 'Response peaks', mode: 'Mode', logF: 'log₁₀ f (Hz)',
    harmonicNote: 'Without mode shapes, √(effective mass fraction) stands in for the participation factor, so the amplitude is relative (not the transmissibility of one point).',
    hmTitle: 'Node heat-map comparison', addFile: 'Add CSV…', sets: 'Data sets', modeLabel: 'Mode', modeDelta: 'B − A delta', modeEnvelope: 'Envelope (max)', setA: 'A', setB: 'B',
    time: 'Time', stats: 'Statistics', exportCsv: 'Export CSV', nodes: 'Nodes', minV: 'Min', maxV: 'Max', avgV: 'Mean', needTwo: 'Load two or more CSV files.',
    noMatch: 'A and B share no node ids.', loadFailed: 'Could not load', samplePair: 'Sample pair', removeSet: 'Remove',
  },
};

const S = () => STR[getLanguage() === 'en' ? 'en' : 'ko'];
const fmt = (v, digits) => formatValue(v, digits);
const memory = {};

// ───────────────────────── small helpers (the dialogs.js equivalents)

const tid = (testid) => (testid ? { testid } : undefined);
const row = (label, control, extra = null) => h('div', { className: 'row' }, h('span', null, label), control, extra);
const select = (value, options, onChange, testid) => h('select', { dataset: tid(testid), onChange: (event) => onChange(event.target.value) },
  ...options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
const group = (legend, ...children) => h('fieldset', { className: 'field-group' }, h('legend', null, legend), ...children);
const num = (value, onChange, { step = 1, min = -Infinity, max = Infinity, suffix = '', testid = null, disabled = false, digits = 6 } = {}) =>
  numberField({ value, onChange, step, min, max, suffix, testid, disabled, digits });
const stat = (label, value, testid = null) => h('div', { className: 'stat' }, h('span', null, label), h('b', { dataset: tid(testid) }, value));
const button = (label, onClick, testid = null, opts = {}) => h('button', { type: 'button', dataset: tid(testid), onClick, ...opts }, label);
const table = (head, rows, testid = null) => h('table', { className: 'data-table', dataset: tid(testid) },
  head ? h('thead', null, h('tr', null, ...head.map((x, i) => h('th', { className: typeof rows[0]?.[i] === 'number' ? 'num' : null }, x)))) : null,
  h('tbody', null, ...rows.map((cells) => h('tr', null, ...cells.map((c) => (c instanceof Node ? h('td', null, c) : h('td', { className: typeof c === 'number' ? 'num' : null }, typeof c === 'number' ? fmt(c) : c)))))));
const cssOf = (el) => (name) => (el.ownerDocument?.defaultView ?? window).getComputedStyle(el).getPropertyValue(name).trim();
const later = (fn) => { requestAnimationFrame(fn); setTimeout(fn, 450); };
const setStatus = (app, text) => { try { app.setStatus?.(text); } catch { /* optional */ } };

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = (canvas.ownerDocument?.defaultView ?? window).devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/** All ids in use in the model (bodies, probes, materials, boundaries). */
const takenIds = (model) => [...model.bodies.map((b) => b.id), ...model.probes.map((p) => p.id), ...model.materials.map((m) => m.id), ...model.boundaries.map((b) => b.id)];

/** Materials list after making sure `id` exists (a library material is copied in when missing). */
function withMaterial(materials, id) {
  if (!id || materials.some((m) => m.id === id)) return materials;
  const copy = materialFromLibrary(id, getLanguage());
  return copy ? [...materials, copy] : materials;
}

/** Model materials first, then library solids of the given categories that the model lacks. */
function materialChoices(model, categories) {
  const lang = getLanguage();
  const own = model.materials.filter((m) => m.kind !== 'fluid').map((m) => [m.id, materialName(m, lang)]);
  const lib = MATERIAL_LIBRARY.filter((m) => categories.includes(m.category) && !model.materials.some((x) => x.id === m.id)).map((m) => [m.id, `${materialName(m, lang)} (${S().fromLibrary})`]);
  return [...own, ...lib];
}

// The core builders throw English messages; show the known ones in the UI language.
const CORE_ERRORS = [
  [/package size must be positive/, '패키지 크기는 0보다 커야 합니다.'],
  [/Rjc and Rjb must be positive/, 'Rjc 와 Rjb 는 0보다 커야 합니다.'],
  [/Rjc \/ Rjb smaller than the junction layer itself/, 'Rjc / Rjb 가 접합층 자체의 열저항보다 작습니다.'],
  [/base size must be positive/, '바닥 크기는 0보다 커야 합니다.'],
  [/fins need a count, thickness and height/, '핀 개수·두께·높이를 입력하세요.'],
  [/no layers/, '두께가 있는 층이 없습니다.'],
  [/need a header and at least one row/, '머리글과 한 줄 이상의 데이터가 필요합니다.'],
  [/columns x and y are required/, 'x, y 열이 필요합니다.'],
  [/a temperature column/, '온도 열(T, temp, temperature)이 필요합니다.'],
  [/no numeric rows/, '숫자 데이터 줄이 없습니다.'],
];
const localError = (text) => {
  if (getLanguage() === 'en') return text;
  const hit = CORE_ERRORS.find(([re]) => re.test(String(text)));
  return hit ? hit[1] : text;
};

/** The core builders name parts in English ("… junction", "… fin 3"); rename them for the Korean UI. */
const KO_PARTS = [[/ junction$/, ' 접합부'], [/ bottom$/, ' 아래층'], [/ top$/, ' 윗층'], [/ base$/, ' 바닥'], [/ fin (\d+)$/, ' 핀 $1']];
const localNames = (list) => (getLanguage() === 'en' ? list : list.map((x) => ({ ...x, name: KO_PARTS.reduce((n, [re, to]) => n.replace(re, to), x.name ?? '') })));

const message = (el, text, ok = false) => {
  el.textContent = ok ? (text ?? '') : localError(text ?? '');
  el.className = ok ? 'eng-msg ok' : 'eng-msg';
};

// ───────────────────────── 1. JEDEC two-resistor compact package

export function showCompactModel(app) {
  const s = S();
  const model0 = app.doc()?.model;
  if (!model0) return null;
  const is3d = model0.domain.dim === 3;
  const dom = model0.domain;
  const st = memory.compact ??= { name: s.pkgName, x: Math.round(dom.width / 2 - 5), y: 0, w: 10, d: 10, t: 1.2, z0: 0, Rjc: 0.5, Rjb: 5, power: 2 };
  // Remembered values from another model may fall outside this domain: bring the position back in.
  if (st.x < 0 || st.x + st.w > dom.width) st.x = Math.max(0, Math.round((dom.width - Math.min(st.w, dom.width)) / 2));
  if (st.y < 0 || st.y + st.t > dom.height) st.y = 0;
  if (is3d && (st.z0 < 0 || st.z0 + st.d > dom.depth)) { st.z0 = 0; st.d = Math.min(st.d, dom.depth); }
  const preview = h('div', { className: 'eng-pane', dataset: { testid: 'compact-preview' } });
  const msg = h('div', { className: 'eng-msg', dataset: { testid: 'compact-message' } });
  let addButton = null;
  const build = (model) => {
    const matIds = new Set(model.materials.map((m) => m.id));
    let prefix;
    do prefix = newId('pkg', []); while (['Top', 'Junction', 'Bottom'].some((x) => matIds.has(prefix + x)));
    const res = jedecTwoResistor({
      x: st.x, y: st.y, w: st.w, h: st.t, t: st.t, d: st.d, z0: st.z0, Rjc: st.Rjc, Rjb: st.Rjb, power: st.power,
      depth: model.domain.depth, dim: is3d ? 3 : 2, id: prefix, name: st.name || s.pkgName, taken: takenIds(model),
    });
    return { ...res, bodies: localNames(res.bodies), materials: localNames(res.materials) };
  };
  const update = () => {
    let res = null;
    try { res = build(app.doc().model); message(msg, ''); } catch (error) { message(msg, error.message); }
    if (addButton) addButton.disabled = !res;
    if (!res) { replace(preview); return; }
    const L = res.layers;
    replace(preview,
      table([s.layer, `${s.thickness} (mm)`, s.kValue], [
        [s.layerTop, L.top.thickness, L.top.k],
        [s.layerJunction, L.junction.thickness, L.junction.k],
        [s.layerBottom, L.bottom.thickness, L.bottom.k],
      ], 'compact-layers'),
      h('p', { className: 'part-help' }, `A = ${fmt(L.area * 1e6)} mm² · Tj ≈ Tcase + ${fmt(st.power * st.Rjc)} K (Rjc·P) · Tj ≈ Tboard + ${fmt(st.power * st.Rjb)} K (Rjb·P)`));
  };
  const field = (key, step, opts = {}) => num(st[key], (v) => { st[key] = v; update(); }, { step, testid: `compact-${key}`, ...opts });
  const form = h('div', { className: 'print-options' },
    row(s.name, h('input', { type: 'text', value: st.name, dataset: tid('compact-name'), onChange: (e) => { st.name = e.target.value; } })),
    group(s.footprint,
      row(s.posX, field('x', 1, { suffix: 'mm' })),
      row(s.posY, field('y', 1, { suffix: 'mm' })),
      row(s.width, field('w', 1, { min: 0.01, suffix: 'mm' })),
      is3d ? row(s.depthZ, field('d', 1, { min: 0.01, suffix: 'mm' })) : null,
      is3d ? row(s.z0, field('z0', 1, { suffix: 'mm' })) : null,
      row(s.thickness, field('t', 0.1, { min: 0.01, suffix: 'mm' }))),
    group('JEDEC',
      row(s.rjc, field('Rjc', 0.1, { min: 1e-4, suffix: 'K/W' })),
      row(s.rjb, field('Rjb', 0.5, { min: 1e-4, suffix: 'K/W' })),
      row(s.power, field('power', 0.5, { min: 0, suffix: 'W' }))));
  const side = h('div', { className: 'eng-col' }, h('strong', null, s.layers), preview, msg,
    h('p', { className: 'part-help' }, is3d ? s.compactNote3d : s.compactNote2d(model0.domain.depth)));
  const dialog = popup({
    id: 'compact', title: s.compactTitle, icon: '▣', width: 760, height: 520,
    body: h('div', { className: 'eng eng-layout' }, form, side),
    actions: [
      { label: s.addToModel, primary: true, testid: 'compact-add', onClick: () => {
        let res;
        try { res = build(app.doc().model); } catch (error) { message(msg, error.message); return; }
        app.updateModel((m) => ({ ...m, materials: [...m.materials, ...res.materials], bodies: [...m.bodies, ...res.bodies], probes: [...m.probes, res.probe] }));
        app.select?.({ kind: 'body', ids: res.bodies.map((b) => b.id) });
        message(msg, s.added(res.bodies.length + 1), true);
        setStatus(app, s.added(res.bodies.length + 1));
      } },
      { label: s.close, testid: 'compact-close' },
    ],
  });
  addButton = dialog.body.querySelector('[data-testid=compact-add]');
  update();
  return dialog;
}

// ───────────────────────── 2. plate-fin heat sink

export function showHeatSink(app) {
  const s = S();
  const model0 = app.doc()?.model;
  if (!model0) return null;
  const is3d = model0.domain.dim === 3;
  const dom = model0.domain;
  const st = memory.heatsink ??= { name: s.hsName, x: 10, y: 0, baseW: 40, baseT: 3, finCount: 8, finT: 1.5, finH: 20, material: 'al6061', z0: 0, z1: dom.depth };
  if (st.x < 0 || st.x >= dom.width) st.x = 0;
  if (st.y < 0 || st.y >= dom.height) st.y = 0;
  if (st.z0 < 0 || st.z1 > dom.depth || st.z1 <= st.z0) { st.z0 = 0; st.z1 = dom.depth; }
  const canvas = h('canvas', { className: 'eng-canvas', dataset: { testid: 'heatsink-preview' } });
  const info = h('div', { className: 'part-help', dataset: { testid: 'heatsink-info' } });
  const msg = h('div', { className: 'eng-msg', dataset: { testid: 'heatsink-message' } });
  let addButton = null;
  let last = null;
  const build = (model) => {
    const res = heatSink({
      x: st.x, y: st.y, baseW: st.baseW, baseT: st.baseT, finCount: st.finCount, finT: st.finT, finH: st.finH, material: st.material,
      dim: is3d ? 3 : 2, depth: model.domain.depth, z0: st.z0, z1: st.z1, name: st.name || s.hsName, taken: takenIds(model),
    });
    return { ...res, bodies: localNames(res.bodies) };
  };
  const paint = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const css = cssOf(canvas);
    const model = app.doc()?.model;
    if (!model) return;
    const dom = { x0: 0, y0: 0, x1: model.domain.width, y1: model.domain.height };
    const hs = { x0: st.x, y0: st.y, x1: st.x + st.baseW, y1: st.y + st.baseT + st.finH };
    const b = { x0: Math.min(dom.x0, hs.x0), y0: Math.min(dom.y0, hs.y0), x1: Math.max(dom.x1, hs.x1), y1: Math.max(dom.y1, hs.y1) };
    const pad = 16;
    const scale = Math.min((width - 2 * pad) / (b.x1 - b.x0 || 1), (height - 2 * pad) / (b.y1 - b.y0 || 1));
    const ox = (width - (b.x1 - b.x0) * scale) / 2;
    const oy = (height + (b.y1 - b.y0) * scale) / 2;
    const X = (x) => ox + (x - b.x0) * scale;
    const Y = (y) => oy - (y - b.y0) * scale;
    // domain and the bodies already there
    ctx.strokeStyle = css('--line') || '#555';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(X(dom.x0), Y(dom.y1), (dom.x1 - dom.x0) * scale, (dom.y1 - dom.y0) * scale);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = css('--muted') || '#888';
    for (const body of model.bodies) {
      const bb = bodyBounds(body);
      ctx.fillRect(X(bb.x0), Y(bb.y1), (bb.x1 - bb.x0) * scale, (bb.y1 - bb.y0) * scale);
    }
    ctx.globalAlpha = 1;
    const lib = MATERIAL_LIBRARY.find((m) => m.id === st.material) ?? model.materials.find((m) => m.id === st.material);
    ctx.fillStyle = lib?.color ?? '#b8c2cc';
    ctx.strokeStyle = css('--accent') || '#3ec1ff';
    for (const body of last?.bodies ?? []) {
      ctx.fillRect(X(body.x), Y(body.y + body.h), body.w * scale, body.h * scale);
      ctx.strokeRect(X(body.x) + 0.5, Y(body.y + body.h) + 0.5, Math.max(1, body.w * scale - 1), Math.max(1, body.h * scale - 1));
    }
  };
  const update = () => {
    last = null;
    try {
      last = build(app.doc().model);
      message(msg, '');
    } catch (error) {
      const n = Math.round(st.finCount);
      message(msg, n * st.finT > st.baseW ? s.hsFit(n, st.finT, st.baseW) : error.message);
    }
    if (addButton) addButton.disabled = !last;
    info.textContent = last ? `${s.gap} ${fmt(last.gap)} mm · ${s.pitch} ${fmt(last.pitch)} mm · ${s.bodiesN(last.bodies.length)}` : '';
    later(paint);
  };
  const field = (key, step, opts = {}) => num(st[key], (v) => { st[key] = v; update(); }, { step, testid: `heatsink-${key}`, ...opts });
  const metals = MATERIAL_LIBRARY.filter((m) => m.category === 'metal').map((m) => [m.id, materialName(m, getLanguage())]);
  const form = h('div', { className: 'print-options' },
    row(s.name, h('input', { type: 'text', value: st.name, dataset: tid('heatsink-name'), onChange: (e) => { st.name = e.target.value; } })),
    row(s.baseX, field('x', 1, { suffix: 'mm' })),
    row(s.baseY, field('y', 1, { suffix: 'mm' })),
    row(s.baseW, field('baseW', 1, { min: 0.1, suffix: 'mm' })),
    row(s.baseT, field('baseT', 0.5, { min: 0.1, suffix: 'mm' })),
    row(s.finCount, field('finCount', 1, { min: 1, max: 200, digits: 4 })),
    row(s.finT, field('finT', 0.1, { min: 0.05, suffix: 'mm' })),
    row(s.finH, field('finH', 1, { min: 0.1, suffix: 'mm' })),
    row(s.material, select(st.material, metals, (v) => { st.material = v; update(); }, 'heatsink-material')),
    is3d ? row(s.z0, field('z0', 1, { suffix: 'mm' })) : null,
    is3d ? row(s.z1, field('z1', 1, { suffix: 'mm' })) : null,
    msg);
  const dialog = popup({
    id: 'heatsink', title: s.heatsinkTitle, icon: '▥', width: 860, height: 560,
    body: h('div', { className: 'eng eng-layout' }, form, h('div', { className: 'eng-col' }, h('strong', null, s.preview), canvas, info)),
    actions: [
      { label: s.addToModel, primary: true, testid: 'heatsink-add', onClick: () => {
        let res;
        try { res = build(app.doc().model); } catch (error) { message(msg, error.message); return; }
        app.updateModel((m) => ({ ...m, materials: withMaterial(m.materials, st.material), bodies: [...m.bodies, ...res.bodies] }));
        app.select?.({ kind: 'body', ids: res.bodies.map((b) => b.id) });
        message(msg, s.added(res.bodies.length), true);
        setStatus(app, s.added(res.bodies.length));
        update();
      } },
      { label: s.close, testid: 'heatsink-close' },
    ],
  });
  addButton = dialog.body.querySelector('[data-testid=heatsink-add]');
  update();
  return dialog;
}

// ───────────────────────── 3. PCB stack-up

const STACK_PRESETS = {
  two: () => [{ type: 'copper', thickness: 0.035, coverage: 0.3 }, { type: 'dielectric', thickness: 1.53 }, { type: 'copper', thickness: 0.035, coverage: 0.3 }],
  four: () => [
    { type: 'copper', thickness: 0.035, coverage: 0.3 }, { type: 'dielectric', thickness: 0.2 }, { type: 'copper', thickness: 0.035, coverage: 0.9 },
    { type: 'dielectric', thickness: 1.06 },
    { type: 'copper', thickness: 0.035, coverage: 0.9 }, { type: 'dielectric', thickness: 0.2 }, { type: 'copper', thickness: 0.035, coverage: 0.3 },
  ],
};

export function showPcbStackup(app) {
  const s = S();
  if (!app.doc()) return null;
  const st = memory.stackup ??= { name: s.stackName, layers: STACK_PRESETS.four() };
  const tableHost = h('div', { className: 'eng-pane' });
  const results = h('div', { className: 'stat-grid', dataset: { testid: 'stackup-results' } });
  const msg = h('div', { className: 'eng-msg', dataset: { testid: 'stackup-message' } });
  let addButton = null;
  let res = null;
  const render = () => {
    const layers = st.layers;
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= layers.length) return; [layers[i], layers[j]] = [layers[j], layers[i]]; render(); };
    replace(tableHost, h('table', { className: 'data-table', dataset: { testid: 'stackup-table' } },
      h('thead', null, h('tr', null, ...['#', s.type, `${s.thickness} (mm)`, `${s.coverage} (%)`, ''].map((x) => h('th', null, x)))),
      h('tbody', null, ...layers.map((layer, i) => h('tr', null,
        h('td', { className: 'num' }, String(i + 1)),
        h('td', null, select(layer.type, [['copper', s.copper], ['dielectric', s.dielectric]], (v) => { layer.type = v; if (v === 'copper' && layer.coverage == null) layer.coverage = 1; render(); }, `stackup-type-${i}`)),
        h('td', null, num(layer.thickness, (v) => { layer.thickness = v; render(); }, { step: layer.type === 'copper' ? 0.005 : 0.05, min: 0.001, testid: `stackup-thickness-${i}` })),
        h('td', null, num(layer.type === 'copper' ? (layer.coverage ?? 1) * 100 : NaN, (v) => { layer.coverage = v / 100; render(); }, { step: 5, min: 0, max: 100, testid: `stackup-coverage-${i}`, disabled: layer.type !== 'copper' })),
        h('td', { className: 'eng-row-tools' },
          button('▲', () => move(i, -1), `stackup-up-${i}`, { title: s.up, disabled: i === 0 }),
          button('▼', () => move(i, 1), `stackup-down-${i}`, { title: s.down, disabled: i === layers.length - 1 }),
          button('✕', () => { layers.splice(i, 1); render(); }, `stackup-remove-${i}`, { title: s.remove })))))));
    res = null;
    try { res = pcbStackup(layers, { name: st.name || s.stackName }); message(msg, ''); } catch (error) { message(msg, error.message); }
    if (addButton) addButton.disabled = !res;
    replace(results,
      stat(s.kIn, res ? `${fmt(res.kInPlane)} W/m·K` : '—', 'stackup-kin'),
      stat(s.kThrough, res ? `${fmt(res.kThrough)} W/m·K` : '—', 'stackup-kthrough'),
      stat(s.totalT, res ? `${fmt(res.thickness)} mm` : '—', 'stackup-total'),
      stat(s.cuFraction, res ? `${fmt(res.copperFraction * 100, 3)} %` : '—'));
  };
  const body = h('div', { className: 'eng eng-col' },
    h('div', { className: 'row eng-toolbar' },
      h('span', null, s.preset),
      button(s.preset2, () => { st.layers = STACK_PRESETS.two(); render(); }, 'stackup-preset-2'),
      button(s.preset4, () => { st.layers = STACK_PRESETS.four(); render(); }, 'stackup-preset-4'),
      button(`✚ ${s.addLayer}`, () => { st.layers.push({ type: 'dielectric', thickness: 0.2 }); render(); }, 'stackup-add-layer'),
      h('span', { className: 'eng-spacer' }),
      h('span', null, s.name),
      h('input', { type: 'text', value: st.name, className: 'eng-name', dataset: tid('stackup-name'), onChange: (e) => { st.name = e.target.value; } })),
    tableHost, results, msg, h('p', { className: 'part-help' }, s.stackNote));
  const dialog = popup({
    id: 'stackup', title: s.stackupTitle, icon: '☰', width: 760, height: 600, body,
    actions: [
      { label: s.addMaterial, primary: true, testid: 'stackup-add', onClick: () => {
        if (!res) return;
        const material = { ...res.material, name: st.name || s.stackName };
        let id;
        if (app.addMaterial) id = app.addMaterial(material);
        else {
          const model = app.doc().model;
          id = material.id; let n = 2;
          while (model.materials.some((m) => m.id === id)) id = `${material.id}${n++}`;
          app.updateModel((m) => ({ ...m, materials: [...m.materials, { ...material, id }] }));
        }
        message(msg, s.stackAdded(material.name), true);
        return id;
      } },
      { label: s.close, testid: 'stackup-close' },
    ],
  });
  addButton = dialog.body.querySelector('[data-testid=stackup-add]');
  render();
  return dialog;
}

// ───────────────────────── 4. power map

const SAMPLE_POWER_MAP = 'x,y,W\n20,10,1.5\n35,10,0.8\n50,10,2.2\n65,10,0.5\n';

export function showPowerMap(app) {
  const s = S();
  const model0 = app.doc()?.model;
  if (!model0) return null;
  const is3d = model0.domain.dim === 3;
  const st = memory.powermap ??= { text: '', size: 2, material: 'silicon', z0: 0, z1: 1, name: s.srcName };
  if (st.z0 < 0 || st.z1 > model0.domain.depth || st.z1 <= st.z0) { st.z0 = 0; st.z1 = Math.min(1, model0.domain.depth); }
  const area = h('textarea', { className: 'eng-csv', spellcheck: false, placeholder: 'x,y,W\n20,10,1.5', value: st.text, dataset: tid('powermap-csv'), onInput: () => { st.text = area.value; update(); } });
  const summary = h('div', { className: 'stat-grid', dataset: { testid: 'powermap-summary' } });
  const msg = h('div', { className: 'eng-msg', dataset: { testid: 'powermap-message' } });
  const fileName = h('div', { className: 'part-help eng-file' });
  let addButton = null;
  const build = (model) => powerMapBodies(st.text, { size: st.size, material: st.material, dim: is3d ? 3 : 2, z0: st.z0, z1: st.z1, taken: takenIds(model), name: st.name || s.srcName });
  const update = () => {
    let bodies = [];
    try { bodies = build(app.doc().model); message(msg, ''); } catch (error) { message(msg, error.message); }
    const d = app.doc().model.domain;
    const out = bodies.filter((b) => b.x + b.w / 2 < 0 || b.y + b.h / 2 < 0 || b.x + b.w / 2 > d.width || b.y + b.h / 2 > d.height).length;
    if (out) message(msg, s.outside(out));
    if (addButton) addButton.disabled = !bodies.length;
    replace(summary,
      stat(s.sources, String(bodies.length), 'powermap-count'),
      stat(s.totalPower, `${fmt(bodies.reduce((sum, b) => sum + b.power, 0))} W`, 'powermap-total'),
      stat(s.sourceSize, `${fmt(st.size)} mm`),
      stat(s.material, materialName(app.doc().model.materials.find((m) => m.id === st.material) ?? MATERIAL_LIBRARY.find((m) => m.id === st.material), getLanguage()) || st.material));
  };
  const field = (key, step, opts = {}) => num(st[key], (v) => { st[key] = v; update(); }, { step, testid: `powermap-${key}`, ...opts });
  const form = h('div', { className: 'print-options' },
    h('div', { className: 'row eng-buttons' },
      button(`📂 ${s.loadFile}`, async () => {
        try {
          const file = await native.openTextFile([{ name: 'CSV', extensions: ['csv', 'txt'] }]);
          if (!file) return;
          st.text = file.text; area.value = file.text; fileName.textContent = file.name; update();
        } catch (error) { message(msg, `${s.loadFailed}: ${error?.message ?? error}`); }
      }, 'powermap-load'),
      button(s.sample, () => { st.text = SAMPLE_POWER_MAP; area.value = st.text; fileName.textContent = ''; update(); }, 'powermap-sample')),
    fileName,
    row(s.name, h('input', { type: 'text', value: st.name, dataset: tid('powermap-name'), onChange: (e) => { st.name = e.target.value; } })),
    row(s.sourceSize, field('size', 0.5, { min: 0.01, suffix: 'mm' })),
    row(s.material, select(st.material, materialChoices(model0, ['electronics', 'metal', 'ceramic']), (v) => { st.material = v; update(); }, 'powermap-material')),
    is3d ? row(s.z0, field('z0', 0.5, { suffix: 'mm' })) : null,
    is3d ? row(s.z1, field('z1', 0.5, { suffix: 'mm' })) : null,
    h('p', { className: 'part-help' }, s.pmNote));
  const side = h('div', { className: 'eng-col' }, h('strong', null, s.csv), area, summary, msg);
  const dialog = popup({
    id: 'powermap', title: s.powermapTitle, icon: '⚡', width: 820, height: 540,
    body: h('div', { className: 'eng eng-layout' }, form, side),
    actions: [
      { label: s.addToModel, primary: true, testid: 'powermap-add', onClick: () => {
        let bodies;
        try { bodies = build(app.doc().model); } catch (error) { message(msg, error.message); return; }
        if (!bodies.length) return;
        app.updateModel((m) => ({ ...m, materials: withMaterial(m.materials, st.material), bodies: [...m.bodies, ...bodies] }));
        app.select?.({ kind: 'body', ids: bodies.map((b) => b.id) });
        message(msg, s.added(bodies.length), true);
        setStatus(app, s.added(bodies.length));
      } },
      { label: s.close, testid: 'powermap-close' },
    ],
  });
  addButton = dialog.body.querySelector('[data-testid=powermap-add]');
  update();
  return dialog;
}

// ───────────────────────── 5. solder-joint fatigue (Sherlock-style)

/** Temperature histories of the current result: body maxima, then probes. */
function resultHistories(doc) {
  const header = doc?.result?.header;
  if (!header) return [];
  const times = header.times ?? [];
  const out = [];
  for (const b of header.bodies ?? []) {
    const values = (b.maxHistory ?? []).map((v) => (v == null ? NaN : Number(v)));
    const name = doc.model.bodies.find((x) => x.id === b.id)?.name || b.id;
    out.push({ key: `body:${b.id}`, body: b.id, name, values: values.length ? values : [b.max], max: b.max, min: b.min, times });
  }
  for (const p of header.probes ?? []) {
    const name = doc.model.probes.find((x) => x.id === p.id)?.name || p.id;
    out.push({ key: `probe:${p.id}`, body: null, name, values: (p.values ?? []).map((v) => (v == null ? NaN : Number(v))), times });
  }
  return out;
}

export function showSolderFatigue(app) {
  const s = S();
  const doc0 = app.doc();
  if (!doc0) return null;
  const st = memory.fatigue ??= {
    tab: 'cycles', source: null, board: null, life: 'cm', C: 1e6, n: 2, LD: 5, dAlpha: null, h: 0.1, dwell: 15, repeats: 1,
    nl: { dTtest: 165, dTfield: 40, fTest: 48, fField: 2, TmaxTest: 125, TmaxField: 60, n: 1.9, m: 1 / 3, Ea: 0.122, testNf: 1000 },
    beta: 2, mttf: null, mission: 43830,
    vib: { fn: null, input: 'g', g: 5, psd: 0.04, bandwidth: 2000, B: 100, L: 20, h: 1.6, r: 1, c: 1 },
  };
  // Values that come from the model / result are looked up again on every open.
  st.mttf = null;
  st.vib.fn = null;
  const tabsEl = h('div', { className: 'eng-tabs' });
  const pane = h('div', { className: 'eng-pane eng-tabpane' });
  const charts = [];
  const tabs = [['cycles', s.tabCycles], ['nl', s.tabNL], ['weibull', s.tabWeibull], ['vibration', s.tabVibration]];

  const histories = () => resultHistories(app.doc());
  const pickSource = (list) => {
    if (st.source && list.some((x) => x.key === st.source)) return list.find((x) => x.key === st.source);
    const d = app.doc();
    const sel = d.selection?.kind === 'body' ? d.selection.ids[0] : null;
    const rel = d.model.reliability?.components?.[0]?.body;
    const hot = d.model.bodies.find((b) => b.power > 0 || b.current || b.powerProfile)?.id;
    const found = [sel, rel, hot].filter(Boolean).map((id) => list.find((x) => x.body === id)).find(Boolean) ?? list.find((x) => x.body) ?? list[0];
    st.source = found?.key ?? null;
    return found;
  };
  const materialOf = (bodyId) => {
    const { model } = app.doc();
    const body = model.bodies.find((b) => b.id === bodyId);
    return body ? model.materials.find((m) => m.id === body.material) : null;
  };
  const pickBoard = (componentId) => {
    const { model } = app.doc();
    if (st.board && model.bodies.some((b) => b.id === st.board)) return st.board;
    // A board is a body of a PCB-like material or name; without one Δα is entered by hand.
    const others = model.bodies.filter((b) => b.id !== componentId);
    const isBoard = (b) => /pcb|fr4|fr-4|board|기판|보드/i.test(`${b.material} ${b.name} ${model.materials.find((m) => m.id === b.material)?.name ?? ''}`);
    const area = (b) => { const bb = bodyBounds(b); return (bb.x1 - bb.x0) * (bb.y1 - bb.y0); };
    st.board = [...others.filter(isBoard)].sort((x, y) => area(y) - area(x))[0]?.id ?? null;
    return st.board;
  };
  const alphaFromMaterials = (componentId, boardId) => {
    const a = materialOf(componentId)?.alpha;
    const b = materialOf(boardId)?.alpha;
    return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : null;
  };

  function cyclesTab() {
    const doc = app.doc();
    const list = histories();
    if (!doc.result || !list.length) return [h('p', { className: 'error-headline', dataset: tid('fatigue-need-result') }, s.needResult)];
    const src = pickSource(list);
    const values = src.values.filter(Number.isFinite);
    const ambient = doc.model.ambient;
    let cycles = values.length > 1 ? rainflow(values) : [];
    let steady = false;
    if (!cycles.length && values.length) {
      const top = Math.max(...values);
      cycles = [{ range: Math.max(0, top - ambient), mean: (top + ambient) / 2, count: 1 }];
      steady = true;
    }
    const board = src.body ? pickBoard(src.body) : st.board;
    const derived = src.body ? alphaFromMaterials(src.body, board) : null;
    const dAlpha = st.dAlpha ?? derived ?? 8e-6;
    const NfOf = st.life === 'eng'
      ? (range, mean) => engelmaier({ LD: st.LD, dAlpha, dT: range, h: st.h, Tmean: mean, dwellMin: st.dwell }).Nf50
      : (range) => coffinManson(range, st.C, st.n);
    const D = miner(cycles, NfOf);
    const repeatsLife = D > 0 ? 1 / D : Infinity;
    const years = repeatsLife / Math.max(1e-9, st.repeats) / 365;
    const { model } = doc;
    const chart = h('canvas', { className: 'eng-chart small', dataset: tid('fatigue-history-chart') });
    const times = src.times?.length === src.values.length ? src.times : src.values.map((_, i) => i);
    charts.push(() => drawLineChart(chart, [{ name: src.name, points: src.values.map((v, i) => [times[i], v]) }], { xLabel: 't (s)', yLabel: '°C', css: cssOf(chart) }));
    const sorted = [...cycles].sort((a, b) => b.range - a.range).slice(0, 200);
    const aC = materialOf(src.body)?.alpha; const aB = materialOf(board)?.alpha;
    return [
      h('div', { className: 'eng-grid2' },
        h('div', { className: 'print-options' },
          row(s.source, select(src.key, list.map((x) => [x.key, `${x.key.startsWith('body:') ? s.bodyMax : s.probe} · ${x.name}`]), (v) => { st.source = v; st.board = null; render(); }, 'fatigue-source')),
          row(s.model, select(st.life, [['cm', s.coffin], ['eng', s.engel]], (v) => { st.life = v; render(); }, 'fatigue-life')),
          st.life === 'cm' ? [
            row(s.cmC, num(st.C, (v) => { st.C = v; render(); }, { step: 1e5, min: 1, testid: 'fatigue-C' })),
            row(s.cmN, num(st.n, (v) => { st.n = v; render(); }, { step: 0.1, min: 0.1, testid: 'fatigue-n' })),
          ] : [
            row(s.board, select(board ?? '', [['', '—'], ...model.bodies.filter((b) => b.id !== src.body).map((b) => [b.id, b.name || b.id])], (v) => { st.board = v || null; st.dAlpha = null; render(); }, 'fatigue-board')),
            row(`${s.dAlpha}`, num(dAlpha * 1e6, (v) => { st.dAlpha = v * 1e-6; render(); }, { step: 0.5, min: 0, suffix: 'ppm/K', testid: 'fatigue-dalpha' }),
              button('↺', () => { st.dAlpha = null; render(); }, 'fatigue-dalpha-reset', { title: s.fromMaterials })),
            Number.isFinite(aC) && Number.isFinite(aB) ? h('p', { className: 'part-help' }, s.alphaInfo(fmt(aC * 1e6), fmt(aB * 1e6))) : null,
            row(s.ld, num(st.LD, (v) => { st.LD = v; render(); }, { step: 0.5, min: 0.01, suffix: 'mm', testid: 'fatigue-LD' })),
            row(s.solderH, num(st.h, (v) => { st.h = v; render(); }, { step: 0.01, min: 0.001, suffix: 'mm', testid: 'fatigue-h' })),
            row(s.dwell, num(st.dwell, (v) => { st.dwell = v; render(); }, { step: 5, min: 0.1, suffix: 'min', testid: 'fatigue-dwell' })),
          ],
          row(s.repeats, num(st.repeats, (v) => { st.repeats = v; render(); }, { step: 1, min: 0.001, testid: 'fatigue-repeats' }))),
        h('div', { className: 'eng-col' }, chart,
          h('div', { className: 'stat-grid three' },
            stat(s.totalDamage, fmt(D), 'fatigue-damage'),
            stat(s.lifeRepeats, fmt(repeatsLife), 'fatigue-life-repeats'),
            stat(s.lifeYears, `${fmt(years)} y`, 'fatigue-life-years')))),
      steady ? h('p', { className: 'part-help' }, s.steadyNote) : null,
      values.length ? null : h('p', { className: 'eng-msg' }, s.noHistory),
      table([s.range, s.mean, s.count, s.nf, s.damage], sorted.map((c) => { const Nf = NfOf(c.range, c.mean); return [c.range, c.mean, c.count, Nf, Number.isFinite(Nf) && Nf > 0 ? c.count / Nf : 0]; }), 'fatigue-cycles'),
    ];
  }

  function nlTab() {
    const p = st.nl;
    const AF = norrisLandzberg(p, { n: p.n, m: p.m, Ea: p.Ea });
    const f = (key, step, suffix, opts = {}) => num(p[key], (v) => { p[key] = v; render(); }, { step, suffix, testid: `fatigue-nl-${key}`, ...opts });
    return [
      h('div', { className: 'eng-grid2' },
        h('div', { className: 'print-options' },
          group(s.nlTest,
            row(s.dT, f('dTtest', 5, 'K', { min: 0.1 })),
            row(s.freq, f('fTest', 1, '/day', { min: 0.001 })),
            row(s.tmax, f('TmaxTest', 5, '°C')),
            row(s.testNf, f('testNf', 100, s.cycles, { min: 0 }))),
          group(s.nlField,
            row(s.dT, f('dTfield', 5, 'K', { min: 0.1 })),
            row(s.freq, f('fField', 1, '/day', { min: 0.001 })),
            row(s.tmax, f('TmaxField', 5, '°C')))),
        h('div', { className: 'print-options' },
          group('Norris–Landzberg',
            row(s.nlN, f('n', 0.1, '', { min: 0 })),
            row(s.nlM, f('m', 0.05, '', { min: 0 })),
            row(s.ea, f('Ea', 0.01, 'eV', { min: 0 }))),
          h('div', { className: 'stat-grid three' },
            stat(s.af, fmt(AF), 'fatigue-nl-af'),
            stat(s.fieldNf, `${fmt(AF * p.testNf)}`, 'fatigue-nl-field'),
            stat(s.lifeYears, `${fmt((AF * p.testNf) / p.fField / 365)} y`)))),
      h('p', { className: 'part-help' }, s.nlNote),
    ];
  }

  function weibullTab() {
    const doc = app.doc();
    const list = histories();
    const src = list.length ? pickSource(list) : null;
    const component = src?.body ? doc.model.reliability?.components?.find((c) => c.body === src.body) : null;
    let relMttf = null;
    if (component && src) {
      const values = src.values.filter(Number.isFinite);
      const swing = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
      relMttf = componentLife(component, { max: src.max ?? Math.max(...values), min: src.min ?? Math.min(...values), swing }, doc.model.ambient).mttf;
    }
    if (st.mttf == null) st.mttf = Number.isFinite(relMttf) ? relMttf : 1e5;
    const w = weibull({ beta: st.beta, mttf: st.mttf });
    const span = w.bLife(0.999) * 1.05;
    const tEnd = Math.max(span, Math.min(st.mission * 1.1, span * 3));
    const points = Array.from({ length: 160 }, (_, i) => { const t = (tEnd * i) / 159; return [t, w.reliability(t)]; });
    const chart = h('canvas', { className: 'eng-chart', dataset: tid('fatigue-weibull-chart') });
    charts.push(() => drawLineChart(chart, [{ name: 'R(t)', points }], { xLabel: 't (h)', yLabel: s.reliability, marker: st.mission, css: cssOf(chart) }));
    return [
      h('div', { className: 'eng-grid2' },
        h('div', { className: 'print-options' },
          row(s.beta, num(st.beta, (v) => { st.beta = v; render(); }, { step: 0.1, min: 0.1, testid: 'fatigue-beta' })),
          row(s.mttf, num(st.mttf, (v) => { st.mttf = v; render(); }, { step: 1000, min: 1, suffix: 'h', testid: 'fatigue-mttf' }),
            relMttf != null ? button('↺', () => { st.mttf = relMttf; render(); }, 'fatigue-mttf-reset', { title: s.fromReliability }) : null),
          relMttf == null ? h('p', { className: 'part-help' }, s.noComponent) : h('p', { className: 'part-help' }, `${s.fromReliability}: ${fmt(relMttf)} h`),
          row(s.mission, num(st.mission, (v) => { st.mission = v; render(); }, { step: 8766, min: 1, suffix: 'h', testid: 'fatigue-mission' })),
          h('div', { className: 'stat-grid two' },
            stat(s.eta, `${fmt(w.eta)} h`),
            stat(s.b10, `${fmt(w.bLife(0.1))} h`, 'fatigue-b10'),
            stat(s.b1, `${fmt(w.bLife(0.01))} h`),
            stat(s.rMission, `${fmt(w.reliability(st.mission) * 100)} %`, 'fatigue-rmission'))),
        h('div', { className: 'eng-col' }, chart)),
    ];
  }

  function vibrationTab() {
    const v = st.vib;
    const modes = app.doc()?.result?.header?.modes ?? [];
    const f1 = modes.find((m) => m.frequency > 0)?.frequency;
    if (v.fn == null) v.fn = Number.isFinite(f1) ? f1 : 200;
    const r = steinberg({ fn: v.fn, gLevel: v.input === 'g' ? v.g : null, psd: v.input === 'psd' ? v.psd : null, bandwidth: v.input === 'psd' ? v.bandwidth : null, B: v.B, L: v.L, h: v.h, r: v.r, c: v.c });
    const f = (key, step, suffix, opts = {}) => num(v[key], (x) => { v[key] = x; render(); }, { step, suffix, testid: `fatigue-vib-${key}`, ...opts });
    return [
      h('div', { className: 'eng-grid2' },
        h('div', { className: 'print-options' },
          row(s.fn, f('fn', 10, 'Hz', { min: 0.1 }), Number.isFinite(f1) ? button('↺', () => { v.fn = f1; render(); }, 'fatigue-vib-fn-reset', { title: s.fromModes(fmt(f1)) }) : null),
          Number.isFinite(f1) ? h('p', { className: 'part-help' }, s.fromModes(fmt(f1))) : null,
          row(s.input, select(v.input, [['g', s.gLevel], ['psd', s.psd]], (x) => { v.input = x; render(); }, 'fatigue-vib-input')),
          v.input === 'g' ? row(s.gLevel, f('g', 0.5, 'g', { min: 0 })) : [row(s.psd, f('psd', 0.01, 'g²/Hz', { min: 0 })), row(s.bandwidth, f('bandwidth', 100, 'Hz', { min: 1 }))],
          row(s.boardB, f('B', 5, 'mm', { min: 1 })),
          row(s.compL, f('L', 1, 'mm', { min: 0.1 })),
          row(s.boardH, f('h', 0.1, 'mm', { min: 0.1 })),
          row(s.posR, f('r', 0.1, '', { min: 0.01 })),
          row(s.compC, f('c', 0.25, '', { min: 0.1 }))),
        h('div', { className: 'eng-col' },
          h('div', { className: 'stat-grid two' },
            stat('G rms', `${fmt(r.Grms)} g`, 'fatigue-vib-grms'),
            stat('Q', fmt(r.Q)),
            stat(s.zAllow, `${fmt(r.Zallow)} mm`, 'fatigue-vib-zallow'),
            stat(s.zResp, `${fmt(r.Zresp)} mm`, 'fatigue-vib-zresp'),
            stat(s.ratioZ, fmt(r.ratio)),
            stat(s.nf, `${fmt(r.Nf)}`, 'fatigue-vib-nf'),
            stat(s.hours, `${fmt(r.hours)} h`),
            r.GrmsInput != null ? stat(`G rms (${s.input})`, `${fmt(r.GrmsInput)} g`) : null),
          h('p', { className: 'part-help' }, s.steinNote))),
    ];
  }

  function render() {
    replace(tabsEl, ...tabs.map(([id, label]) => h('button', { type: 'button', className: st.tab === id ? 'on' : null, dataset: tid(`fatigue-tab-${id}`), onClick: () => { st.tab = id; render(); } }, label)));
    charts.length = 0;
    const content = st.tab === 'nl' ? nlTab() : st.tab === 'weibull' ? weibullTab() : st.tab === 'vibration' ? vibrationTab() : cyclesTab();
    replace(pane, ...content);
    const draw = () => charts.forEach((fn) => fn());
    later(draw);
  }

  render();
  return popup({
    id: 'fatigue', title: s.fatigueTitle, icon: '🔩', width: 1000, height: 660,
    body: h('div', { className: 'eng eng-col' }, tabsEl, pane),
    actions: [{ label: s.close, primary: true, testid: 'fatigue-close' }],
  });
}

// ───────────────────────── 6. harmonic response

export function showHarmonic(app) {
  const s = S();
  const doc = app.doc();
  if (!doc) return null;
  const modes = doc.result?.header?.modes?.filter((m) => m.frequency > 0) ?? [];
  if (!modes.length) {
    return popup({
      id: 'harmonic', title: s.harmonicTitle, icon: '〰', width: 520, height: 200,
      body: h('div', { className: 'eng' }, h('p', { className: 'error-headline', dataset: tid('harmonic-need-modes') }, s.needModes)),
      actions: [{ label: s.close, primary: true, testid: 'harmonic-close' }],
    });
  }
  const fTop = Math.max(...modes.map((m) => m.frequency));
  const fLow = Math.min(...modes.map((m) => m.frequency));
  const st = { fMin: Math.max(1, Math.floor(fLow / 4)), fMax: Math.ceil(fTop * 2), damping: 2, kind: 'modal', axis: 'auto' };
  const prev = memory.harmonic;
  if (prev && prev.fMax > prev.fMin) Object.assign(st, prev);
  memory.harmonic = st;
  const ampChart = h('canvas', { className: 'eng-chart', dataset: tid('harmonic-amplitude') });
  const phaseChart = h('canvas', { className: 'eng-chart', dataset: tid('harmonic-phase') });
  const peaks = h('div', { className: 'eng-pane', dataset: tid('harmonic-peaks') });
  const msg = h('div', { className: 'eng-msg' });
  const dims = (modes[0].participation?.length ?? 2) >= 3 ? 3 : 2;
  const axisNames = ['x', 'y', 'z'].slice(0, dims);
  let curve = [];
  const paint = () => {
    if (!curve.length) return;
    const lg = (f) => Math.log10(f);
    drawLineChart(ampChart, [{ name: s.amplitude, points: curve.map((p) => [lg(p.f), p.amplitude]) }], { xLabel: s.logF, yLabel: s.amplitude, css: cssOf(ampChart) });
    drawLineChart(phaseChart, [{ name: s.phase, points: curve.map((p) => [lg(p.f), p.phase]), color: '#ff7a59' }], { xLabel: s.logF, yLabel: s.phase, css: cssOf(phaseChart) });
  };
  const update = () => {
    if (!(st.fMax > st.fMin)) { message(msg, `${s.fMax} > ${s.fMin}`); return; }
    message(msg, '');
    const axis = st.axis === 'auto' ? dominantAxis(modes) : Number(st.axis);
    curve = harmonicResponse({ modes, fMin: st.fMin, fMax: st.fMax, points: 500, damping: st.damping / 100, axis, kind: st.kind });
    const list = responsePeaks(curve, 8);
    const nearest = (f) => modes.reduce((best, m, i) => (Math.abs(m.frequency - f) < Math.abs(modes[best].frequency - f) ? i : best), 0);
    replace(peaks, h('strong', null, s.peaks),
      table(['f (Hz)', s.amplitude, s.mode], list.map((p) => { const k = nearest(p.f); return [p.f, p.amplitude, `${k + 1} · ${fmt(modes[k].frequency)} Hz`]; }), 'harmonic-peak-table'),
      h('strong', null, s.mode),
      table(['#', 'f (Hz)', ...axisNames.map((a) => `m_eff ${a}`)], modes.map((m, i) => [String(i + 1), m.frequency, ...axisNames.map((_, a) => (Array.isArray(m.participation) ? m.participation[a] ?? NaN : NaN))])));
    later(paint);
  };
  const form = h('div', { className: 'print-options' },
    row(s.fMin, num(st.fMin, (v) => { st.fMin = v; update(); }, { step: 10, min: 0.01, suffix: 'Hz', testid: 'harmonic-fmin' })),
    row(s.fMax, num(st.fMax, (v) => { st.fMax = v; update(); }, { step: 100, min: 0.02, suffix: 'Hz', testid: 'harmonic-fmax' })),
    row(s.dampingPct, num(st.damping, (v) => { st.damping = v; update(); }, { step: 0.5, min: 0.01, max: 100, suffix: '%', testid: 'harmonic-damping' })),
    row(s.kind, select(st.kind, [['modal', s.kindModal], ['baseForce', s.kindBase]], (v) => { st.kind = v; update(); }, 'harmonic-kind')),
    row(s.axis, select(st.axis, [['auto', `${s.auto} (${axisNames[dominantAxis(modes)] ?? 'y'})`], ...axisNames.map((a, i) => [String(i), a])], (v) => { st.axis = v; update(); }, 'harmonic-axis')),
    msg, peaks,
    h('p', { className: 'part-help' }, s.harmonicNote));
  const dialog = popup({
    id: 'harmonic', title: s.harmonicTitle, icon: '〰', width: 1040, height: 680,
    body: h('div', { className: 'eng eng-layout wide-side' }, form, h('div', { className: 'eng-col' }, ampChart, phaseChart)),
    actions: [{ label: s.close, primary: true, testid: 'harmonic-close' }],
  });
  update();
  return dialog;
}

// ───────────────────────── 7. node heat-map comparison

export function showHeatmapCompare(app) {
  const s = S();
  const st = memory.hmcompare ??= { sets: [], mode: 'delta', a: 0, b: 1, time: null };
  const canvas = h('canvas', { className: 'eng-canvas', dataset: tid('hmcompare-canvas') });
  const side = h('div', { className: 'heatmap-side eng-side' });
  const msg = h('div', { className: 'eng-msg', dataset: tid('hmcompare-message') });
  let rows = [];
  const allTimes = () => [...new Set(st.sets.flatMap((x) => x.data.times))].sort((a, b) => a - b);
  const at = (set) => {
    if (st.time == null || !set.data.times.includes(st.time)) return nodesAt(set.data);
    return nodesAt(set.data, st.time);
  };
  const compute = () => {
    if (st.sets.length < 2) return [];
    if (st.mode === 'envelope') return envelope(st.sets.map(at));
    const a = st.sets[Math.min(st.a, st.sets.length - 1)];
    const b = st.sets[Math.min(st.b, st.sets.length - 1)];
    return deltaMap(at(a), at(b));
  };
  const paint = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const css = cssOf(canvas);
    if (rows.length < 1) {
      ctx.fillStyle = css('--muted') || '#999';
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.sets.length < 2 ? s.needTwo : s.noMatch, width / 2, height / 2);
      return;
    }
    const b = nodeBounds(rows);
    const aspect = (b.y1 - b.y0) / (b.x1 - b.x0 || 1);
    const nx = 200;
    const ny = Math.max(4, Math.min(600, Math.round(nx * aspect)));
    const raster = idwRaster(rows, b, nx, ny, 2);
    let lo = Infinity; let hi = -Infinity;
    for (const v of raster) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (st.mode === 'delta') { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -m; hi = m; } // symmetric about zero
    const settings = app.state?.settings ?? {};
    const table = lut(st.mode === 'delta' ? 'coolwarm' : (settings.colormap ?? 'turbo'), settings.colorSteps ?? 0);
    const off = canvas.ownerDocument.createElement('canvas');
    off.width = nx; off.height = ny;
    const octx = off.getContext('2d');
    const image = octx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = raster[i + j * nx];
      const n = Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo || 1)) * 255)));
      const p = (i + (ny - 1 - j) * nx) * 4;
      image.data[p] = table[n * 3]; image.data[p + 1] = table[n * 3 + 1]; image.data[p + 2] = table[n * 3 + 2]; image.data[p + 3] = Number.isFinite(v) ? 255 : 0;
    }
    octx.putImageData(image, 0, 0);
    const pad = 24;
    const scale = Math.min((width - pad * 2 - 80) / (b.x1 - b.x0 || 1), (height - pad * 2) / (b.y1 - b.y0 || 1));
    const w = (b.x1 - b.x0) * scale;
    const hgt = (b.y1 - b.y0) * scale;
    const ox = pad;
    const oy = (height - hgt) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, ox, oy, w, hgt);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const n of rows) { ctx.beginPath(); ctx.arc(ox + (n.x - b.x0) * scale, oy + hgt - (n.y - b.y0) * scale, 1.6, 0, Math.PI * 2); ctx.fill(); }
    const barX = ox + w + 16;
    for (let y = 0; y < hgt; y++) {
      const n = Math.round((1 - y / hgt) * 255);
      ctx.fillStyle = `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]})`;
      ctx.fillRect(barX, oy + y, 14, 1);
    }
    const unit = st.mode === 'delta' ? 'K' : '°C';
    ctx.fillStyle = css('--text') || '#ddd';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${fmt(hi)} ${unit}`, barX + 18, oy + 8);
    if (st.mode === 'delta') ctx.fillText(`0 ${unit}`, barX + 18, oy + hgt / 2 + 4);
    ctx.fillText(`${fmt(lo)} ${unit}`, barX + 18, oy + hgt);
  };
  const exportCsv = async () => {
    if (!rows.length) return;
    const lines = st.mode === 'delta'
      ? ['node,x,y,z,T_A_C,T_B_C,dT_K', ...rows.map((r) => [r.id, r.x, r.y, r.z, r.TA, r.TB, r.T].map((v) => (typeof v === 'number' ? Number(v.toPrecision(7)) : v)).join(','))]
      : ['node,x,y,z,T_max_C,T_min_C,range_K,max_set,min_set', ...rows.map((r) => [r.id, r.x, r.y, r.z, r.max, r.min, r.range, st.sets[r.maxSet]?.name ?? r.maxSet, st.sets[r.minSet]?.name ?? r.minSet].map((v) => (typeof v === 'number' ? Number(v.toPrecision(7)) : `${v}`.replace(/,/g, ' '))).join(','))];
    try {
      await native.saveTextFile(st.mode === 'delta' ? 'heatmap-delta.csv' : 'heatmap-envelope.csv', `${lines.join('\n')}\n`, [{ name: 'CSV', extensions: ['csv'] }]);
    } catch (error) { message(msg, String(error?.message ?? error)); }
  };
  const addSet = (text, name) => {
    try {
      st.sets.push({ name, data: parseNodeCsv(text) });
      if (st.sets.length === 2) { st.a = 0; st.b = 1; }
      message(msg, '');
    } catch (error) { message(msg, `${s.loadFailed}: ${name} — ${error.message}`); }
    render();
  };
  const samplePair = () => {
    const base = sampleNodeCsv();
    const hotter = base.split('\n').map((line, i) => {
      if (i === 0 || !line) return line;
      const c = line.split(',');
      const x = Number(c[1]); const y = Number(c[2]);
      c[4] = (Number(c[4]) + 12 * Math.exp(-(((x - 600) / 150) ** 2 + ((y - 400) / 120) ** 2)) - 3).toFixed(2);
      return c.join(',');
    }).join('\n');
    st.sets = [];
    addSet(base, 'radiator-A.csv');
    addSet(hotter, 'radiator-B.csv');
  };
  function render() {
    rows = compute();
    const times = allTimes();
    const stats = rows.length ? nodeStats(rows) : null;
    const unit = st.mode === 'delta' ? 'K' : '°C';
    const setOptions = st.sets.map((x, i) => [i, `${i + 1}. ${x.name}`]);
    replace(side,
      h('div', { className: 'row eng-buttons' },
        button(`📂 ${s.addFile}`, async () => {
          try {
            const file = await native.openTextFile([{ name: 'CSV', extensions: ['csv', 'txt'] }]);
            if (file) addSet(file.text, file.name);
          } catch (error) { message(msg, `${s.loadFailed}: ${error?.message ?? error}`); }
        }, 'hmcompare-add'),
        button(s.samplePair, samplePair, 'hmcompare-sample')),
      h('strong', null, s.sets),
      h('div', { className: 'eng-setlist', dataset: tid('hmcompare-sets') }, ...st.sets.map((x, i) => h('div', { className: 'row' },
        h('span', { className: 'ellipsis', title: x.name }, `${i + 1}. ${x.name} (${x.data.nodes.length})`),
        button('✕', () => { st.sets.splice(i, 1); st.a = Math.min(st.a, Math.max(0, st.sets.length - 1)); st.b = Math.min(st.b, Math.max(0, st.sets.length - 1)); render(); }, `hmcompare-remove-${i}`, { title: s.removeSet })))),
      h('div', { className: 'row' }, h('span', null, s.modeLabel), select(st.mode, [['delta', s.modeDelta], ['envelope', s.modeEnvelope]], (v) => { st.mode = v; render(); }, 'hmcompare-mode')),
      st.mode === 'delta' && st.sets.length >= 2 ? [
        h('div', { className: 'row' }, h('span', null, s.setA), select(st.a, setOptions, (v) => { st.a = Number(v); render(); }, 'hmcompare-a')),
        h('div', { className: 'row' }, h('span', null, s.setB), select(st.b, setOptions, (v) => { st.b = Number(v); render(); }, 'hmcompare-b')),
      ] : null,
      times.length > 1 ? h('div', { className: 'row' }, h('span', null, s.time), select(st.time ?? '', [['', '—'], ...times.map((x) => [x, String(x)])], (v) => { st.time = v === '' ? null : Number(v); render(); }, 'hmcompare-time')) : null,
      msg,
      stats ? [
        h('strong', null, s.stats),
        h('table', { className: 'data-table', dataset: tid('hmcompare-stats') }, h('tbody', null,
          ...[[s.nodes, String(stats.count)], [s.minV, `${fmt(stats.min)} ${unit}`], [s.maxV, `${fmt(stats.max)} ${unit}`], [s.avgV, `${fmt(stats.mean)} ${unit}`], ['σ', `${fmt(stats.sd)} K`],
            ['P5 / P50 / P95', `${fmt(stats.p5)} / ${fmt(stats.p50)} / ${fmt(stats.p95)}`]].map(([a, b]) => h('tr', null, h('td', null, a), h('td', { className: 'num' }, b))))),
        h('strong', null, st.mode === 'delta' ? `${s.maxV} ΔT` : s.maxV),
        h('table', { className: 'data-table' }, h('tbody', null, ...stats.hottest.slice(0, 6).map((n) => h('tr', null, h('td', null, String(n.id)), h('td', { className: 'num' }, `(${fmt(n.x)}, ${fmt(n.y)})`), h('td', { className: 'num' }, `${fmt(n.T)} ${unit}`))))),
      ] : null,
      button(`⇩ ${s.exportCsv}`, exportCsv, 'hmcompare-export', { disabled: !rows.length }));
    later(paint);
  }
  render();
  return popup({
    id: 'hmcompare', title: s.hmTitle, icon: '🗺', width: 1040, height: 680,
    body: h('div', { className: 'eng heatmap-layout' }, canvas, side),
    actions: [{ label: s.close, primary: true, testid: 'hmcompare-close' }],
  });
}
