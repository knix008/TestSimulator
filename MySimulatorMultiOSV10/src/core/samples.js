// Sample pipelines: one or more for every area (signal, dynamics and control,
// statistics and machine learning, Monte Carlo and optimisation, integration).
// Each is built in the language of the UI.
import { defaultParams, nodeSpec, nodeName } from './catalog.js';
import { normalizeModel } from './model.js';

const COL = [60, 320, 580, 840, 1100];
const ROW = [50, 190, 330, 470, 610];

/** A builder: n(id, type, column, row, params, [ko, en]) and l(from, to, port). */
function build(lang, name, description, fn) {
  const nodes = [];
  const links = [];
  const n = (id, type, col, row, params = {}, names = null) => {
    const spec = nodeSpec(type);
    nodes.push({
      id, type, x: COL[col] ?? col, y: ROW[row] ?? row,
      name: names ? names[lang === 'en' ? 1 : 0] : nodeName(spec, lang),
      params: { ...defaultParams(type), ...params },
    });
  };
  const l = (from, to, toPort = 'in') => links.push({ id: `l${links.length + 1}`, from, fromPort: 'out', to, toPort });
  fn(n, l);
  return normalizeModel({ name: name[lang === 'en' ? 1 : 0], description: description[lang === 'en' ? 1 : 0], nodes, links, settings: { seed: 1 } });
}

/** UTF-8 text or bytes → base64 (the same in the browser and in Node). */
function base64(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? A[n & 63] : '=');
  }
  return out;
}

/** A 1 s, 8 kHz, 16-bit WAV: an A-major chord (440 + 660 Hz), a quiet 1.2 kHz whistle and noise. */
function chordWav() {
  const rate = 8000;
  const n = rate;
  const bytes = new Uint8Array(44 + 2 * n);
  const v = new DataView(bytes.buffer);
  const tag = (at, s) => [...s].forEach((c, k) => v.setUint8(at + k, c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + 2 * n, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, 2 * rate, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, 'data'); v.setUint32(40, 2 * n, true);
  let seed = 12345;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  for (let k = 0; k < n; k++) {
    const t = k / rate;
    const y = 0.4 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.sin(2 * Math.PI * 660 * t) + 0.08 * Math.sin(2 * Math.PI * 1200 * t) + 0.15 * noise();
    v.setInt16(44 + 2 * k, Math.round(Math.max(-1, Math.min(1, y)) * 32767), true);
  }
  return bytes;
}

const THIN_LAYER = "{\n  \"format\": \"myheat\", \"version\": 1,\n  \"name\": \"Thin layers: chip with TIM and a conductive copper foil\",\n  \"description\": \"A 0.1 mm thermal interface material (resistive) around the chip and a 35 µm copper foil (conductive) on the board surface spreading heat sideways.\",\n  \"domain\": { \"dim\": 2, \"width\": 80, \"height\": 20, \"depth\": 20, \"nx\": 80, \"ny\": 20, \"background\": null },\n  \"ambient\": 25,\n  \"materials\": [\n    { \"id\": \"fr4\", \"kind\": \"solid\", \"k\": 0.3, \"rho\": 1850, \"cp\": 1100 },\n    { \"id\": \"si\", \"kind\": \"solid\", \"k\": 148, \"rho\": 2330, \"cp\": 700 },\n    { \"id\": \"al\", \"kind\": \"solid\", \"k\": 200, \"rho\": 2700, \"cp\": 900 }\n  ],\n  \"bodies\": [\n    { \"id\": \"board\", \"name\": \"Board\", \"shape\": \"rect\", \"x\": 0, \"y\": 0, \"w\": 80, \"h\": 2, \"material\": \"fr4\" },\n    { \"id\": \"chip\", \"name\": \"Chip\", \"shape\": \"rect\", \"x\": 30, \"y\": 2, \"w\": 20, \"h\": 2, \"material\": \"si\", \"power\": 3 },\n    { \"id\": \"sink\", \"name\": \"Heat sink\", \"shape\": \"rect\", \"x\": 20, \"y\": 4, \"w\": 40, \"h\": 6, \"material\": \"al\" }\n  ],\n  \"boundaries\": [\n    { \"id\": \"tim\", \"name\": \"TIM\", \"target\": \"body:chip\", \"type\": \"thinLayer\", \"thickness\": 0.1, \"k\": 3, \"mode\": \"resistive\" },\n    { \"id\": \"foil\", \"name\": \"Copper foil\", \"target\": \"body:board\", \"type\": \"thinLayer\", \"thickness\": 0.035, \"k\": 390, \"mode\": \"conductive\",\n      \"region\": [0, 1.5, 80, 2.5] },\n    { \"id\": \"fan\", \"target\": \"body:sink\", \"type\": \"convection\", \"h\": 40, \"Tinf\": 25, \"region\": [0, 4.5, 80, 20] },\n    { \"id\": \"under\", \"target\": \"bottom\", \"type\": \"convection\", \"h\": 5, \"Tinf\": 25 }\n  ],\n  \"study\": { \"type\": \"steady\" }\n}\n";
const WALL_CYCLE = "{\n  \"format\": \"myheat\", \"version\": 1,\n  \"name\": \"Time-dependent boundaries: wall with a daily temperature cycle\",\n  \"description\": \"Outside air temperature (Tinft) and film coefficient (ht) follow tables; the inside face is held by a temperature ramp (Tt).\",\n  \"domain\": { \"dim\": 2, \"width\": 200, \"height\": 20, \"depth\": 1000, \"nx\": 100, \"ny\": 4, \"background\": \"concrete\" },\n  \"ambient\": 20,\n  \"materials\": [{ \"id\": \"concrete\", \"kind\": \"solid\", \"k\": 1.4, \"rho\": 2300, \"cp\": 880 }],\n  \"boundaries\": [\n    { \"id\": \"outside\", \"target\": \"left\", \"type\": \"convection\", \"h\": 25, \"Tinf\": 5,\n      \"Tinft\": [[0, 5], [21600, 15], [43200, 25], [64800, 15], [86400, 5]],\n      \"ht\": [[0, 25], [43200, 10], [86400, 25]] },\n    { \"id\": \"inside\", \"target\": \"right\", \"type\": \"temperature\", \"T\": 20, \"Tt\": [[0, 18], [28800, 22], [86400, 22]] }\n  ],\n  \"probes\": [{ \"id\": \"mid\", \"name\": \"Mid wall\", \"x\": 100, \"y\": 10 }],\n  \"study\": { \"type\": \"transient\", \"endTime\": 86400, \"dt\": 600, \"frames\": 48, \"initialT\": 18 }\n}\n";
const MYCIRCUIT_OPAMP = "Non-inverting amplifier (gain 11) - generated by MyCircuit\nV1 _12V 0 DC 12\nV2 0 _12V_ DC 12\nV3 IN 0 DC 0 SIN(0 0.5 1000 0 0 0)\nXU1 IN FB OUT _12V _12V_ OPAMP_U1\nR2 FB OUT 100000\nR3 FB 0 10000\nR1 OUT 0 10000\n\n.subckt OPAMP_U1 inp inn out vp vn\nB1 out 0 V=max(min(100000*(V(inp)-V(inn)), V(vp)), V(vn))\n.ends\n\n.tran 2u 3m\n.end\n";
const MYCIRCUIT_NPN = "NPN transistor switch - generated by MyCircuit\nVBT1 VCC 0 DC 4.5\nRSW1 VCC SW_OUT 0.01 ; switch closed\nR2 SW_OUT BASE 10000\nR3 BASE 0 100000\nQ1 LED_K BASE 0 Q_Q1\nR1 VCC Net-_D1-Pad2_ 220\nD1 Net-_D1-Pad2_ LED_K D_D1\n\n.model Q_Q1 NPN(IS=6.7e-15 BF=200 BR=2)\n.model D_D1 D(IS=1e-19 N=1.8 RS=10)\n\n.op\n.end\n";
const MYCIRCUIT_RECTIFIER = "Half-wave rectifier - generated by MyCircuit\nV1 AC_IN 0 DC 0 SIN(0 12 50 0 0 0)\nD1 AC_IN VOUT D_D1\nC1 VOUT 0 0.00047\nR1 VOUT 0 1000\n\n.model D_D1 D(IS=2.52e-9 N=1.752)\n\n.tran 100u 100m\n.end\n";

const SAMPLES = {
  signalCleanup: (lang) => build(lang, ['신호 잡음 제거와 스펙트럼', 'Signal cleanup and spectrum'], ['잡음 섞인 50 Hz 신호를 버터워스 저역 통과 필터로 정제하고 FFT 로 성분을 확인합니다.', 'A noisy 50 Hz signal is cleaned with a Butterworth low pass and checked with an FFT.'], (n, l) => {
    n('sig', 'source.signal', 0, 1, { frequency: 50, amplitude: 1, fs: 2000, duration: 1, components: '180:0.4', noise: 0.5, seed: 7 }, ['측정 신호', 'Measured signal']);
    n('lp', 'signal.filter', 1, 0, { design: 'butterworth', type: 'lowpass', cutoff: 90, order: 6 }, ['저역 통과 90 Hz', 'Low pass 90 Hz']);
    n('fftRaw', 'signal.fft', 1, 2, {}, ['원신호 스펙트럼', 'Raw spectrum']);
    n('fftClean', 'signal.fft', 2, 1, { column: 'filtered' }, ['정제 후 스펙트럼', 'Clean spectrum']);
    n('plotTime', 'out.plot', 2, 0, { title: lang === 'en' ? 'Raw and filtered' : '원신호와 필터 출력', chart: 'line', y: 'y, filtered', span: '2' }, ['시간 영역', 'Time domain']);
    n('plotSpec', 'out.plot', 3, 2, { title: lang === 'en' ? 'Spectrum (dB)' : '스펙트럼 (dB)', y: 'dB', span: '1' }, ['스펙트럼', 'Spectrum']);
    n('kpiF', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Dominant frequency' : '주 주파수', source: 'dominant frequency', unit: 'Hz' }, ['주 주파수', 'Dominant frequency']);
    n('kpiRms', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Noise removed (RMS)' : '제거된 잡음 RMS', source: 'RMS removed', high: 0.6 }, ['제거된 잡음', 'Noise removed']);
    l('sig', 'lp'); l('sig', 'fftRaw'); l('lp', 'fftClean'); l('lp', 'plotTime'); l('fftRaw', 'plotSpec'); l('fftClean', 'kpiF'); l('lp', 'kpiRms');
  }),
  chirpSpectrogram: (lang) => build(lang, ['처프 신호 스펙트로그램', 'Chirp spectrogram'], ['10 → 250 Hz 로 훑는 처프의 시간-주파수 지도와 전력 스펙트럼 밀도.', 'The time–frequency map and the PSD of a 10 → 250 Hz chirp.'], (n, l) => {
    n('chirp', 'source.signal', 0, 1, { waveform: 'chirp', frequency: 10, frequency2: 250, fs: 1000, duration: 4, noise: 0.2 }, ['처프 10→250 Hz', 'Chirp 10→250 Hz']);
    n('spec', 'signal.spectrogram', 1, 0, { segment: 128, overlap: 85 });
    n('psd', 'signal.psd', 1, 2, { segment: 512 });
    n('env', 'signal.envelope', 1, 1, {});
    n('plotSpec', 'out.plot', 2, 0, { title: lang === 'en' ? 'Spectrogram' : '스펙트로그램', chart: 'heatmap', span: '2' });
    n('plotPsd', 'out.plot', 2, 2, { title: 'PSD', y: 'dB' });
    n('plotEnv', 'out.plot', 2, 1, { title: lang === 'en' ? 'Instantaneous frequency' : '순간 주파수', y: 'frequency' });
    l('chirp', 'spec'); l('chirp', 'psd'); l('chirp', 'env'); l('spec', 'plotSpec'); l('psd', 'plotPsd'); l('env', 'plotEnv');
  }),
  vibration: (lang) => build(lang, ['감쇠 진동과 감쇠비 추정', 'Damped vibration and damping ratio'], ['질량-스프링-댐퍼 ODE 를 풀고, 피크의 대수 감쇠율로 감쇠비를, FFT 로 고유 진동수를 구합니다.', 'Solves a mass–spring–damper ODE, estimates the damping ratio from the peaks (log decrement) and the natural frequency by FFT.'], (n, l) => {
    n('msd', 'dyn.ode', 0, 1, { equations: "x' = v\nv' = (-c*v - k*x)/m\nE = 0.5*m*v^2 + 0.5*k*x^2", constants: 'm = 1, c = 0.4, k = 16', initial: 'x = 1, v = 0', tEnd: 20, dt: 0.005 }, ['질량-스프링-댐퍼', 'Mass–spring–damper']);
    n('pk', 'signal.peaks', 1, 0, { column: 'x', minProminence: 0.01 }, ['피크', 'Peaks']);
    n('fft', 'signal.fft', 1, 2, { column: 'x', zeroPad: true }, ['진동 스펙트럼', 'Vibration spectrum']);
    n('plotX', 'out.plot', 2, 1, { title: lang === 'en' ? 'Displacement and energy' : '변위와 에너지', y: 'x, E', span: '2' });
    n('plotPhase', 'out.plot', 2, 0, { title: lang === 'en' ? 'Phase portrait' : '위상 평면', chart: 'xy', x: 'x', y: 'v' });
    n('kz', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Damping ratio ζ' : '감쇠비 ζ', source: 'damping ratio (log decrement)' });
    n('kf', 'out.kpi', 2, 2, { label: lang === 'en' ? 'Damped frequency' : '감쇠 진동수', source: 'dominant frequency', unit: 'Hz' });
    l('msd', 'pk'); l('msd', 'fft'); l('msd', 'plotX'); l('msd', 'plotPhase'); l('pk', 'kz'); l('fft', 'kf');
  }),
  lorenz: (lang) => build(lang, ['로렌츠 끌개 (혼돈)', 'Lorenz attractor (chaos)'], ['로렌츠 방정식의 혼돈 궤적과 3D 궤적 보기.', 'The chaotic trajectory of the Lorenz equations, also in the 3D view.'], (n, l) => {
    n('lor', 'dyn.ode', 0, 1, { equations: "x' = s*(y - x)\ny' = x*(r - z) - y\nz' = x*y - b*z", constants: 's = 10, r = 28, b = 8/3', initial: 'x = 1, y = 1, z = 1', tEnd: 50, dt: 0.005 }, ['로렌츠 방정식', 'Lorenz equations']);
    n('pxz', 'out.plot', 1, 0, { title: 'x – z', chart: 'xy', x: 'x', y: 'z' });
    n('pt', 'out.plot', 1, 2, { title: lang === 'en' ? 'Time series' : '시계열', y: 'x, y, z', span: '2' });
    n('psd', 'signal.psd', 1, 1, { column: 'x', segment: 1024 });
    n('ppsd', 'out.plot', 2, 1, { title: 'PSD x', y: 'dB', logX: true });
    l('lor', 'pxz'); l('lor', 'pt'); l('lor', 'psd'); l('psd', 'ppsd');
  }),
  pidControl: (lang) => build(lang, ['PID 제어와 안정 여유', 'PID control and stability margins'], ['3차 플랜트를 PID 로 제어하고(외란·포화 포함), 플랜트의 보드 선도로 이득·위상 여유와 지글러-니콜스 값을 구합니다.', 'A PID controls a third-order plant (with a disturbance and saturation); the plant\'s Bode plot gives the margins and Ziegler–Nichols values.'], (n, l) => {
    n('pid', 'ctrl.pid', 0, 0, { num: '1', den: '1, 3, 3, 1', kp: 2.5, ki: 1.2, kd: 1.5, tf: 0.05, setpoint: 1, stepTime: 1, disturbance: -0.3, disturbanceTime: 20, uMin: -5, uMax: 5, tEnd: 40, dt: 0.01 }, ['PID 루프', 'PID loop']);
    n('bode', 'ctrl.bode', 0, 2, { num: '1', den: '1, 3, 3, 1', gain: 2.5 }, ['개루프 보드', 'Open-loop Bode']);
    n('py', 'out.plot', 1, 0, { title: lang === 'en' ? 'Setpoint, output, control' : '목표·출력·제어 입력', y: 'r, y, u', span: '2' });
    n('pb', 'out.plot', 1, 2, { title: lang === 'en' ? 'Bode magnitude' : '보드 크기', y: 'dB', logX: true });
    n('pp', 'out.plot', 2, 2, { title: lang === 'en' ? 'Bode phase' : '보드 위상', y: 'phase', logX: true });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Overshoot' : '오버슈트', source: 'overshoot', unit: '%', high: 30 });
    n('k2', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Settling time' : '정착 시간', source: 'settling time (2%)', unit: 's' });
    n('k3', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Phase margin' : '위상 여유', source: 'phase margin', unit: '°', low: 30 });
    l('pid', 'py'); l('bode', 'pb'); l('bode', 'pp'); l('pid', 'k1'); l('pid', 'k2'); l('bode', 'k3');
  }),
  pidSweep: (lang) => build(lang, ['PID 미분 이득 스윕', 'PID derivative gain sweep'], ['Kd 를 0 → 3 으로 바꾸며 오버슈트와 IAE 가 어떻게 변하는지 매개변수 스윕으로 봅니다.', 'A parameter sweep of Kd from 0 to 3 shows how the overshoot changes.'], (n, l) => {
    n('pid', 'ctrl.pid', 0, 1, { num: '1', den: '1, 2, 1', kp: 4, ki: 2, kd: 0.5, tEnd: 20, dt: 0.01 }, ['PID 루프', 'PID loop']);
    n('sw', 'opt.sweep', 1, 0, { node: 'pid', param: 'kd', from: 0, to: 3, steps: 13, metricNode: 'pid', metric: 'overshoot' }, ['Kd 스윕 → 오버슈트', 'Kd sweep → overshoot']);
    n('sw2', 'opt.sweep', 1, 2, { node: 'pid', param: 'kp', from: 1, to: 8, steps: 8, node2: 'pid', param2: 'ki', '2from': 0.5, '2to': 4, '2steps': 8, metricNode: 'pid', metric: 'IAE' }, ['Kp·Ki 지도 → IAE', 'Kp·Ki map → IAE']);
    n('p1', 'out.plot', 2, 0, { title: lang === 'en' ? 'Overshoot vs Kd' : 'Kd 에 따른 오버슈트', chart: 'line' });
    n('p2', 'out.plot', 2, 2, { title: lang === 'en' ? 'IAE over Kp × Ki' : 'Kp × Ki 별 IAE', chart: 'heatmap' });
    n('p3', 'out.plot', 2, 1, { title: lang === 'en' ? 'Loop response' : '루프 응답', y: 'r, y' });
    l('sw', 'p1'); l('sw2', 'p2'); l('pid', 'p3');
  }),
  stateSpace: (lang) => build(lang, ['1/4 차량 현가 (상태공간)', 'Quarter-car suspension (state space)'], ['4 상태 현가 모델의 노면 계단 응답, 고유값과 가제어성.', 'The road-step response of a four-state suspension model, its eigenvalues and controllability.'], (n, l) => {
    n('ss', 'ctrl.statespace', 0, 1, { A: '0 1 0 0; -20 -2 20 2; 0 0 0 1; 200 20 -2200 -20', B: '0; 0; 0; 2000', C: '1 0 0 0; 0 0 1 0', D: '', input: 'step', amplitude: 0.05, tEnd: 5, dt: 0.002 }, ['현가 모델', 'Suspension model']);
    n('p', 'out.plot', 1, 0, { title: lang === 'en' ? 'Body and wheel' : '차체와 바퀴', y: 'y1, y2', span: '2' });
    n('eig', 'out.plot', 1, 2, { title: lang === 'en' ? 'Eigenvalues' : '고유값', chart: 'scatter', table: 'eigenvalues', x: 'real', y: 'imag' });
    n('fft', 'signal.fft', 1, 1, { column: 'y1', zeroPad: true });
    n('pf', 'out.plot', 2, 1, { title: lang === 'en' ? 'Body spectrum' : '차체 스펙트럼', y: 'amplitude', logY: true });
    l('ss', 'p'); l('ss', 'eig'); l('ss', 'fft'); l('fft', 'pf');
  }),
  regression: (lang) => build(lang, ['실험 데이터 회귀 분석', 'Regression of test data'], ['엔진 회전수-토크 시험 데이터의 기술 통계, 2차 회귀, 잔차 분포.', 'Descriptive statistics, a quadratic fit and the residuals of engine speed–torque test data.'], (n, l) => {
    const rows = ['rpm,torque (N·m),temp (°C)'];
    const torque = (r) => 80 + 0.06 * r - 0.0000085 * r * r;
    let s = 3;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
    for (let r = 1000; r <= 6000; r += 125) rows.push(`${r},${(torque(r) + rand() * 9).toFixed(1)},${(70 + r / 120 + rand() * 4).toFixed(1)}`);
    n('data', 'source.table', 0, 1, { data: rows.join('\n') }, ['시험 데이터', 'Test data']);
    n('desc', 'stat.describe', 1, 0, {});
    n('reg', 'stat.regression', 1, 1, { model: 'polynomial', degree: 2, x: 'rpm', y: 'torque' }, ['2차 회귀', 'Quadratic fit']);
    n('hist', 'stat.histogram', 2, 2, { column: 'residual', bins: 12 }, ['잔차 분포', 'Residuals']);
    n('corr', 'stat.correlation', 1, 2, {});
    n('pfit', 'out.plot', 2, 0, { title: lang === 'en' ? 'Torque curve' : '토크 곡선', chart: 'scatter', y: 'torque, fit', span: '2' });
    n('k', 'out.kpi', 2, 1, { label: 'R²', source: 'R²', low: 0.9 });
    n('ph', 'out.plot', 3, 2, { title: lang === 'en' ? 'Residual histogram' : '잔차 히스토그램', chart: 'bar', y: 'count' });
    l('data', 'desc'); l('data', 'reg'); l('data', 'corr'); l('reg', 'hist'); l('reg', 'pfit'); l('reg', 'k'); l('hist', 'ph');
  }),
  clustering: (lang) => build(lang, ['군집 분석과 PCA', 'Clustering and PCA'], ['세 무리의 점을 만들어 k-평균으로 나누고, 주성분 분석으로 축을 찾습니다.', 'Three blobs of points are split by k-means; PCA finds the main axes.'], (n, l) => {
    n('rnd', 'source.random', 0, 1, { distribution: 'normal', p1: 0, p2: 0.6, count: 600, columns: 3, seed: 5 }, ['난수', 'Random']);
    n('blobs', 'data.expression', 1, 1, { expressions: 'group = floor(i / 200) + 1\nx = x1 + 3*(group == 2) - 2*(group == 3)\ny = x2 + 3*(group == 3) + 0.5*x\nz = x3 + 0.3*x - 0.2*y' }, ['세 무리', 'Three blobs']);
    n('km', 'ml.kmeans', 2, 0, { columns: 'x, y, z', k: 3 });
    n('pca', 'ml.pca', 2, 2, { columns: 'x, y, z', components: 2 });
    n('p1', 'out.plot', 3, 0, { title: lang === 'en' ? 'Clusters' : '군집', chart: 'scatter', x: 'x', y: 'y', color: 'cluster' });
    n('p2', 'out.plot', 3, 2, { title: lang === 'en' ? 'Explained variance' : '설명 분산', chart: 'bar', table: 'explained variance', y: 'ratio' });
    n('k', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Silhouette' : '실루엣', source: 'silhouette', low: 0.5 });
    l('rnd', 'blobs'); l('blobs', 'km'); l('blobs', 'pca'); l('km', 'p1'); l('pca', 'p2'); l('km', 'k');
  }),
  neuralRegression: (lang) => build(lang, ['신경망 회귀', 'Neural network regression'], ['잡음 섞인 sinc 함수를 MLP 로 학습하고, 학습/검증 손실과 예측 곡선을 봅니다.', 'An MLP learns a noisy sinc function; train/test loss and the prediction curve.'], (n, l) => {
    n('f', 'source.function', 0, 0, { expression: 'clean = sinc(x/2)', from: -10, to: 10, points: 400 }, ['참 함수', 'True function']);
    n('noise', 'source.random', 0, 2, { distribution: 'normal', p1: 0, p2: 0.08, count: 400, prefix: 'e', seed: 3 }, ['잡음', 'Noise']);
    n('mg', 'data.merge', 1, 1, { mode: 'columns' });
    n('ex', 'data.expression', 2, 1, { expressions: 'y = clean + e' }, ['측정값', 'Measured']);
    n('mlp', 'ml.mlp', 3, 1, { features: 'x', target: 'y', hidden: '24, 24', activation: 'tanh', epochs: 400, learningRate: 0.01, batch: 32 });
    n('pc', 'out.plot', 4, 0, { title: lang === 'en' ? 'Fit' : '학습 결과', chart: 'scatter', y: 'y, prediction', span: '2' });
    n('pl', 'out.plot', 4, 2, { title: lang === 'en' ? 'Loss' : '손실', table: 'loss', y: 'train, test', logY: true });
    n('k', 'out.kpi', 4, 1, { label: lang === 'en' ? 'Test R²' : '검증 R²', source: 'test R²', low: 0.9 });
    l('f', 'mg', 'a'); l('noise', 'mg', 'b'); l('mg', 'ex'); l('ex', 'mlp'); l('mlp', 'pc'); l('mlp', 'pl'); l('mlp', 'k');
  }),
  classification: (lang) => build(lang, ['신경망 분류 (두 개의 달)', 'Neural network classification (two moons)'], ['서로 맞물린 두 반달 모양 점을 MLP 로 분류하고 예측 지도와 혼동 행렬을 봅니다.', 'An MLP separates two interleaved half-moons: the prediction map and the confusion matrix.'], (n, l) => {
    n('rnd', 'source.random', 0, 1, { distribution: 'uniform', p1: 0, p2: 1, count: 800, columns: 3, seed: 11 }, ['난수', 'Random']);
    n('moons', 'data.expression', 1, 1, { expressions: 'cls = (x1 > 0.5)\nang = pi*x2\nx = if(cls, 1 - cos(ang), cos(ang)) + 0.15*(x3 - 0.5)\ny = if(cls, 0.5 - sin(ang), sin(ang)) + 0.15*(x3 - 0.5) + 0.1*(x1 - 0.5)' }, ['두 개의 달', 'Two moons']);
    n('mlp', 'ml.mlp', 2, 1, { features: 'x, y', target: 'cls', task: 'classification', hidden: '16, 16', activation: 'tanh', epochs: 200, learningRate: 0.02 });
    n('pm', 'out.plot', 3, 0, { title: lang === 'en' ? 'Prediction map' : '예측 지도', chart: 'heatmap', table: 'prediction map', span: '1' });
    n('pc', 'out.plot', 4, 0, { title: lang === 'en' ? 'Confusion matrix' : '혼동 행렬', chart: 'heatmap', table: 'confusion' });
    n('pd', 'out.plot', 3, 2, { title: lang === 'en' ? 'Data' : '데이터', chart: 'scatter', x: 'x', y: 'y', color: 'cls' });
    n('k', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Test accuracy' : '검증 정확도', source: 'test accuracy', unit: '%', low: 90 });
    l('rnd', 'moons'); l('moons', 'mlp'); l('mlp', 'pm'); l('mlp', 'pc'); l('moons', 'pd'); l('mlp', 'k');
  }),
  tolerance: (lang) => build(lang, ['공차 누적 몬테카를로', 'Tolerance stack-up Monte Carlo'], ['부품 치수 공차가 조립 간극에 주는 영향: 분포, 불량 확률, 민감도.', 'How part tolerances add up in an assembly gap: the distribution, the reject probability and the sensitivities.'], (n, l) => {
    n('mc', 'mc.simulate', 0, 1, { model: 'housing ~ normal(50.0, 0.05)\npartA ~ normal(20.0, 0.04)\npartB ~ normal(29.8, 0.04)\nshim ~ uniform(-0.02, 0.02)\ngap = housing - partA - partB + shim', condition: 'gap < 0.05', samples: 100000 }, ['간극 시뮬레이션', 'Gap simulation']);
    n('h', 'stat.histogram', 1, 0, { column: 'gap', bins: 40 });
    n('ph', 'out.plot', 2, 0, { title: lang === 'en' ? 'Gap distribution' : '간극 분포', chart: 'bar', y: 'density, normal fit' });
    n('ps', 'out.plot', 1, 2, { title: lang === 'en' ? 'Sensitivity' : '민감도', chart: 'bar', table: 'sensitivity', y: 'share of variance' });
    n('pc', 'out.plot', 2, 2, { title: lang === 'en' ? 'Convergence of the mean' : '평균의 수렴', table: 'convergence', logX: true });
    n('k', 'out.kpi', 2, 1, { label: lang === 'en' ? 'Reject rate (gap < 0.05)' : '불량률 (간극 < 0.05)', source: 'P(condition)', unit: '%', high: 1 });
    l('mc', 'h'); l('h', 'ph'); l('mc', 'ps'); l('mc', 'pc'); l('mc', 'k');
  }),
  finance: (lang) => build(lang, ['주가 경로 시뮬레이션 (GBM)', 'Price paths (GBM)'], ['기하 브라운 운동으로 1년 주가 경로 2000개를 만들어 분위수 띠, 최종값 분포, VaR 를 봅니다.', 'Two thousand one-year price paths by geometric Brownian motion: quantile bands, the final value distribution and VaR.'], (n, l) => {
    n('gbm', 'mc.process', 0, 1, { process: 'gbm', x0: 100, mu: 0.08, sigma: 0.25, horizon: 1, steps: 252, paths: 2000, showPaths: 8 }, ['GBM 경로', 'GBM paths']);
    n('pp', 'out.plot', 1, 0, { title: lang === 'en' ? 'Paths and bands' : '경로와 분위수 띠', span: '2' });
    n('h', 'stat.histogram', 1, 2, { table: 'final values', column: 'final', bins: 50 });
    n('ph', 'out.plot', 2, 2, { title: lang === 'en' ? 'Final value' : '최종값 분포', chart: 'bar', y: 'count' });
    n('k1', 'out.kpi', 2, 1, { label: 'VaR 95%', source: 'VaR 95%' });
    n('k2', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Loss probability' : '손실 확률', source: 'P(final < x0)', unit: '%' });
    l('gbm', 'pp'); l('gbm', 'h'); l('h', 'ph'); l('gbm', 'k1'); l('gbm', 'k2');
  }),
  optimization: (lang) => build(lang, ['최적화 (국소·전역)', 'Optimisation (local and global)'], ['로젠브록 함수의 넬더-미드 탐색 경로와, 국소 최솟값이 많은 라스트리긴 함수의 차분 진화 전역 탐색.', 'Nelder–Mead on the Rosenbrock function and a global differential evolution search on the many-minima Rastrigin function.'], (n, l) => {
    n('nm', 'opt.minimize', 0, 0, { variables: 'x: -2 .. 2 = -1.2\ny: -1 .. 3 = 1', objective: '(1 - x)^2 + 100*(y - x^2)^2', method: 'nelderMead' }, ['로젠브록 (넬더-미드)', 'Rosenbrock (Nelder–Mead)']);
    n('de', 'opt.minimize', 0, 2, { variables: 'x: -5.12 .. 5.12\ny: -5.12 .. 5.12', objective: '20 + x^2 - 10*cos(2*pi*x) + y^2 - 10*cos(2*pi*y)', method: 'de', maxIterations: 300 }, ['라스트리긴 (차분 진화)', 'Rastrigin (differential evolution)']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Rosenbrock map and path' : '로젠브록 지도와 경로', chart: 'heatmap' });
    n('p2', 'out.plot', 2, 0, { title: lang === 'en' ? 'Convergence' : '수렴', table: 'history', y: 'objective', logY: true });
    n('p3', 'out.plot', 1, 2, { title: lang === 'en' ? 'Rastrigin map and path' : '라스트리긴 지도와 경로', chart: 'heatmap' });
    n('k', 'out.kpi', 2, 2, { label: lang === 'en' ? 'Global minimum found' : '찾은 전역 최솟값', source: 'optimum' });
    l('nm', 'p1'); l('nm', 'p2'); l('de', 'p3'); l('de', 'k');
  }),
  curveFit: (lang) => build(lang, ['비선형 곡선 맞춤', 'Nonlinear curve fit'], ['측정한 냉각 곡선에 지수 감쇠 모델을 레벤버그-마쿼트로 맞추고 매개변수 신뢰 구간을 구합니다.', 'An exponential cooling model is fitted to measured data by Levenberg–Marquardt, with parameter confidence intervals.'], (n, l) => {
    n('f', 'source.function', 0, 0, { expression: 'T0 = 25 + 60*exp(-t/180)', variable: 't', from: 0, to: 900, points: 91 }, ['냉각 곡선', 'Cooling curve']);
    n('e', 'source.random', 0, 2, { distribution: 'normal', p1: 0, p2: 0.8, count: 91, prefix: 'noise', seed: 2 }, ['측정 잡음', 'Noise']);
    n('mg', 'data.merge', 1, 1, {});
    n('ex', 'data.expression', 2, 1, { expressions: 'T = T0 + noise' }, ['측정 온도', 'Measured T']);
    n('fit', 'opt.fit', 3, 1, { model: 'Ta + dT*exp(-x/tau)', parameters: 'Ta = 20, dT = 50, tau = 100', x: 't', y: 'T' }, ['모델 맞춤', 'Model fit']);
    n('p', 'out.plot', 4, 0, { title: lang === 'en' ? 'Data and fit' : '데이터와 맞춤', chart: 'scatter', y: 'T, fit', span: '2' });
    n('k', 'out.kpi', 4, 2, { label: lang === 'en' ? 'Time constant τ' : '시정수 τ', source: 'tau', unit: 's' });
    l('f', 'mg', 'a'); l('e', 'mg', 'b'); l('mg', 'ex'); l('ex', 'fit'); l('fit', 'p'); l('fit', 'k');
  }),
  blockDiagram: (lang) => build(lang, ['블록 다이어그램: 정속 주행과 모터 제어', 'Block diagrams: cruise control and motor control'], ['Simulink 형 블록 다이어그램 두 개: 언덕을 만난 자동차의 정속 주행(PI, 공기 저항, 포화)과 DC 모터 속도 루프(기울기 제한, 부하 외란). 피드백 루프를 매 시간 단계에 함께 풉니다.', 'Two Simulink-style block diagrams: cruise control of a car meeting a hill (PI, air drag, saturation) and a DC motor speed loop (rate limiter, load step). The feedback loops are solved together at every time step.'], (n, l) => {
    const cruise = nodeSpec('dyn.blocks').presets.find((p) => p.id === 'cruise').params;
    const motor = nodeSpec('dyn.blocks').presets.find((p) => p.id === 'motor').params;
    n('car', 'dyn.blocks', 0, 0, { ...cruise }, ['정속 주행', 'Cruise control']);
    n('mot', 'dyn.blocks', 0, 2, { ...motor }, ['모터 속도 루프', 'Motor speed loop']);
    n('pv', 'out.plot', 1, 0, { title: lang === 'en' ? 'Speed (m/s)' : '속도 (m/s)', y: 'v_ref, v' });
    n('pf', 'out.plot', 2, 0, { title: lang === 'en' ? 'Engine force (N)' : '구동력 (N)', y: 'force' });
    n('pw', 'out.plot', 1, 2, { title: lang === 'en' ? 'Motor speed (rad/s)' : '모터 속도 (rad/s)', y: 'ref, w' });
    n('pi', 'out.plot', 2, 2, { title: lang === 'en' ? 'Voltage and current' : '전압과 전류', y: 'volt, i' });
    n('k', 'out.kpi', 1, 1, { label: lang === 'en' ? 'Final speed' : '최종 속도', source: 'v', aggregate: 'last', unit: 'm/s', low: 24.5, high: 25.5 });
    l('car', 'pv'); l('car', 'pf'); l('mot', 'pw'); l('mot', 'pi'); l('car', 'k');
  }),
  factory: (lang) => build(lang, ['생산 라인 이산 사건 시뮬레이션', 'Production line discrete-event simulation'], ['주문이 절단(2대)·용접·검사를 거치고, 검사 결과에 따라 출하·재작업·폐기됩니다. 작업장별 가동률과 대기, 대기열 변화, 처리량을 보고 병목을 찾습니다.', 'Orders pass cutting (2 machines), welding and inspection, then ship, go to rework or are scrapped. Utilisation and waiting per station, queues over time and throughput show the bottleneck.'], (n, l) => {
    n('line', 'des.process', 0, 1, { ...nodeSpec('des.process').presets.find((p) => p.id === 'factory').params }, ['생산 라인', 'Production line']);
    n('pu', 'out.plot', 1, 0, { title: lang === 'en' ? 'Utilisation (%)' : '가동률 (%)', chart: 'bar', table: 'stations', y: 'utilization' });
    n('pq', 'out.plot', 2, 0, { title: lang === 'en' ? 'Queues over time' : '시간에 따른 대기열', table: 'timeline', y: 'cutting queue, welding queue, inspection queue, rework queue', chart: 'step', span: '2' });
    n('po', 'out.plot', 1, 2, { title: lang === 'en' ? 'Finished orders' : '완료 주문', table: 'output', chart: 'area' });
    n('k1', 'out.kpi', 2, 2, { label: lang === 'en' ? 'Throughput (per min)' : '처리량 (분당)', source: 'throughput' });
    n('k2', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Mean time in system' : '평균 체류 시간', source: 'mean time in system', unit: 'min', high: 30 });
    l('line', 'pu'); l('line', 'pq'); l('line', 'po'); l('line', 'k1'); l('line', 'k2');
  }),
  circuits: (lang) => build(lang, ['회로 해석 (LTspice 형): 필터·트랜지스터·CMOS·연산 증폭기', 'Circuit analysis (LTspice-style): filter, transistor, CMOS, op-amp'], ['SPICE 넷리스트 다섯 개: RC 저역 통과의 과도 응답과 보드 선도, BJT 공통 이미터 증폭기(이득 약 51 dB), CMOS 인버터의 DC 전달 곡선, 부회로로 만든 연산 증폭기(B 전원), 스위칭 벅 컨버터. 잡음 섞인 신호 발생기 출력을 INPUT 으로 넣은 RC 필터도 있습니다.', 'Five SPICE netlists: the transient and Bode plot of an RC low-pass, a BJT common-emitter amplifier (about 51 dB of gain), the DC transfer curve of a CMOS inverter, an op-amp built as a subcircuit (B source) and a switching buck converter, plus an RC filter fed with a noisy signal generator through INPUT.'], (n, l) => {
    const preset = (id) => ({ ...nodeSpec('circuit.spice').presets.find((p) => p.id === id).params });
    n('rc', 'circuit.spice', 0, 0, preset('rc'), ['RC 저역 통과', 'RC low-pass']);
    n('bjt', 'circuit.spice', 0, 1, preset('bjt'), ['BJT 증폭기', 'BJT amplifier']);
    n('cmos', 'circuit.spice', 0, 2, preset('cmos'), ['CMOS 인버터', 'CMOS inverter']);
    n('opamp', 'circuit.spice', 0, 3, preset('subckt'), ['연산 증폭기 (부회로)', 'Op-amp (subcircuit)']);
    n('buck', 'circuit.spice', 0, 4, preset('buck'), ['벅 컨버터', 'Buck converter']);
    n('sig', 'source.signal', 0, 5, { waveform: 'square', frequency: 5, amplitude: 1, fs: 2000, duration: 1, noise: 0.2 }, ['잡음 섞인 구형파', 'Noisy square wave']);
    n('filt', 'circuit.spice', 1, 5, { netlist: '* RC filter driven by the signal\nV1 in 0 INPUT(y)\nR1 in out 1k\nC1 out 0 4.7u\n.tran 200u 1', probes: 'in, out' }, ['신호 → RC 필터', 'Signal → RC filter']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'RC Bode magnitude (dB)' : 'RC 보드 크기 (dB)', table: 'ac', y: 'V(out) dB', logX: true });
    n('p2', 'out.plot', 2, 1, { title: lang === 'en' ? 'BJT amplifier gain (dB)' : 'BJT 증폭기 이득 (dB)', table: 'ac', y: 'V(c) dB', logX: true });
    n('p3', 'out.plot', 1, 2, { title: lang === 'en' ? 'CMOS transfer (V)' : 'CMOS 전달 곡선 (V)', table: 'dc sweep', y: 'V(out)' });
    n('p4', 'out.plot', 2, 3, { title: lang === 'en' ? 'Op-amp: in and out (V)' : '연산 증폭기: 입력과 출력 (V)', table: 'transient', y: 'V(in), V(out)' });
    n('p5', 'out.plot', 1, 4, { title: lang === 'en' ? 'Buck converter (V)' : '벅 컨버터 (V)', table: 'transient', y: 'V(sw), V(out)' });
    n('p6', 'out.plot', 2, 5, { title: lang === 'en' ? 'Filtered signal (V)' : '필터 통과 신호 (V)', table: 'transient', y: 'V(in), V(out)' });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'RC −3 dB frequency' : 'RC −3 dB 주파수', source: '−3 dB frequency', unit: 'Hz' });
    n('k2', 'out.kpi', 3, 1, { label: lang === 'en' ? 'BJT mid-band gain' : 'BJT 중역 이득', source: 'peak gain', unit: 'dB' });
    n('k3', 'out.kpi', 3, 4, { label: lang === 'en' ? 'Buck output (end)' : '벅 출력 (끝)', source: 'V(out)', aggregate: 'last', table: 'transient', unit: 'V', low: 5, high: 6.5 });
    l('rc', 'p1'); l('bjt', 'p2'); l('cmos', 'p3'); l('opamp', 'p4'); l('buck', 'p5'); l('sig', 'filt'); l('filt', 'p6'); l('rc', 'k1'); l('bjt', 'k2'); l('buck', 'k3');
  }),
  logic: (lang) => build(lang, ['디지털 논리와 마이크로컨트롤러 (Proteus 형)', 'Digital logic and microcontrollers (Proteus-style)'], ['Proteus 처럼 회로와 펌웨어를 함께 돌립니다: 보행자 버튼을 읽는 신호등 MCU, 소프트웨어 PWM 으로 밝기를 바꾸는 MCU, 리셋 있는 4비트 카운터의 타이밍도, 전가산기 진리표. 사건 구동 시뮬레이션이 게이트 지연까지 계산합니다.', 'Circuits and firmware run together, as in Proteus: a traffic-light microcontroller reading a crossing button, a microcontroller dimming with software PWM, the timing diagram of a 4-bit counter with reset and a full adder truth table. The event-driven simulation includes gate delays.'], (n, l) => {
    const preset = (id) => ({ ...nodeSpec('circuit.logic').presets.find((p) => p.id === id).params });
    n('mcu', 'circuit.logic', 0, 0, preset('mcuTraffic'), ['신호등 MCU', 'Traffic-light MCU']);
    n('pwm', 'circuit.logic', 0, 1, preset('mcuPwm'), ['PWM MCU', 'PWM MCU']);
    n('cnt', 'circuit.logic', 0, 2, preset('counter'), ['4비트 카운터', '4-bit counter']);
    n('add', 'circuit.logic', 0, 4, preset('adder'), ['전가산기', 'Full adder']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Traffic light and button' : '신호등과 버튼', table: 'timing diagram', chart: 'step', span: '2' });
    n('p2', 'out.plot', 1, 1, { title: lang === 'en' ? 'PWM output' : 'PWM 출력', table: 'timing', chart: 'step', y: 'pwm', span: '2' });
    n('p3', 'out.plot', 1, 2, { title: lang === 'en' ? 'Counter timing' : '카운터 타이밍', table: 'timing diagram', chart: 'step', span: '2' });
    n('p4', 'out.plot', 1, 4, { title: lang === 'en' ? 'Truth table' : '진리표', chart: 'table' });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Instructions run' : '실행한 명령', source: 'u1 instructions' });
    n('k2', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Count at the end' : '끝 카운트', source: 'count (end)' });
    l('mcu', 'p1'); l('pwm', 'p2'); l('cnt', 'p3'); l('add', 'p4'); l('mcu', 'k1'); l('cnt', 'k2');
  }),
  fem: (lang) => build(lang, ['유한요소: 열과 응력', 'Finite elements: heat and stress'], ['Ansys·COMSOL 형 2D 유한요소 해석 세 가지: 냉각 구멍이 있는 판의 온도 분포, 구멍 난 판의 인장 응력 집중(이론값 약 3배), 막대가 데워지는 과도 열전도.', 'Three Ansys/COMSOL-style 2D finite element analyses: the temperature in a plate with a cooling bore, the stress concentration at a hole in a plate under tension (about 3 × in theory) and a bar warming up over time.'], (n, l) => {
    const preset = (id) => ({ ...nodeSpec('fem.field').presets.find((p) => p.id === id).params });
    n('heat', 'fem.field', 0, 0, preset('plate'), ['판의 온도', 'Plate temperature']);
    n('stress', 'fem.field', 0, 2, preset('hole'), ['구멍 주위 응력', 'Stress around a hole']);
    n('warm', 'fem.field', 0, 4, preset('warmup'), ['막대 가열', 'Bar warming up']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Temperature (°C)' : '온도 (°C)', chart: 'heatmap', table: 'T', span: '2' });
    n('p2', 'out.plot', 1, 2, { title: lang === 'en' ? 'von Mises stress (Pa)' : 'von Mises 응력 (Pa)', chart: 'heatmap', table: 'von Mises', span: '2' });
    n('p3', 'out.plot', 1, 4, { title: lang === 'en' ? 'Temperatures over time (°C)' : '시간에 따른 온도 (°C)', table: 'history' });
    n('k1', 'out.kpi', 2, 1, { label: lang === 'en' ? 'Heat into the plate' : '판에 들어간 열', source: 'heat in (left)', unit: 'W/m' });
    n('k2', 'out.kpi', 2, 3, { label: lang === 'en' ? 'Stress concentration' : '응력 집중 계수', source: 'von Mises max', scale: 1 / 50e6, low: 2.5, high: 3.6 });
    l('heat', 'p1'); l('stress', 'p2'); l('warm', 'p3'); l('heat', 'k1'); l('stress', 'k2');
  }),
  robots: (lang) => build(lang, ['로봇: 이동 로봇과 로봇 팔', 'Robots: a mobile robot and an arm'], ['Gazebo·Webots 형 로봇 시뮬레이션 두 가지: 라이다로 장애물을 피해 목표로 가는 이동 로봇, 역기구학으로 끝점이 원을 그리는 2관절 팔의 다물체 동역학.', 'Two Gazebo/Webots-style robot simulations: a mobile robot that avoids obstacles with its lidar on the way to a goal, and the multibody dynamics of a two-joint arm whose tip draws a circle by inverse kinematics.'], (n, l) => {
    const preset = (type, id) => ({ ...nodeSpec(type).presets.find((p) => p.id === id).params });
    n('bot', 'robot.mobile', 0, 0, preset('robot.mobile', 'avoid'), ['장애물 회피 로봇', 'Obstacle-avoiding robot']);
    n('arm', 'robot.arm', 0, 2, preset('robot.arm', 'circle'), ['원 그리는 팔', 'Arm drawing a circle']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Map and path' : '지도와 경로', table: 'map', chart: 'xy', y: 'walls, path, goals', equal: true, span: '2' });
    n('p2', 'out.plot', 2, 0, { title: lang === 'en' ? 'Speed and lidar' : '속도와 라이다', table: 'trajectory', y: 'v, front' });
    n('p3', 'out.plot', 1, 2, { title: lang === 'en' ? 'Arm poses' : '팔 자세', table: 'poses', chart: 'xy', y: 'arm, tip path', equal: true });
    n('p4', 'out.plot', 2, 2, { title: lang === 'en' ? 'Joint torques (N·m)' : '관절 토크 (N·m)', table: 'joints', y: 'tau1, tau2' });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Time to goal' : '도착 시간', source: 'time to goal', unit: 's' });
    n('k2', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Tip error (rms)' : '끝점 오차 (rms)', source: 'rms tip error', scale: 1000, unit: 'mm', high: 5 });
    l('bot', 'p1'); l('bot', 'p2'); l('arm', 'p3'); l('arm', 'p4'); l('bot', 'k1'); l('arm', 'k2');
  }),
  cad: (lang) => build(lang, ['CAD: 부품 질량 특성', 'CAD: part mass properties'], ['SolidWorks 형 특징 트리로 만든 부품 두 개(볼트 구멍 8개 플랜지, 스포크 휠)의 부피·질량·무게중심·관성. 특징마다 부피가 어떻게 바뀌는지, 위에서 본 두께 지도, 3D 보기의 표면 점.', 'Two parts built from SolidWorks-style feature trees (a flange with 8 bolt holes, a spoked wheel): volume, mass, centre of gravity and inertia, the volume after each feature, a thickness map seen from above and the surface points in the 3D view.'], (n, l) => {
    const preset = (id) => ({ ...nodeSpec('cad.part').presets.find((p) => p.id === id).params });
    n('flange', 'cad.part', 0, 0, preset('flange'), ['플랜지', 'Flange']);
    n('wheel', 'cad.part', 0, 2, preset('wheel'), ['스포크 휠', 'Spoked wheel']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Flange thickness (mm)' : '플랜지 두께 (mm)', chart: 'heatmap', table: 'thickness' });
    n('p2', 'out.plot', 2, 0, { title: lang === 'en' ? 'Volume after each feature (mm³)' : '특징별 부피 (mm³)', chart: 'bar', table: 'features', y: 'volume after' });
    n('p3', 'out.plot', 1, 2, { title: lang === 'en' ? 'Wheel thickness (mm)' : '휠 두께 (mm)', chart: 'heatmap', table: 'thickness' });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Flange mass' : '플랜지 질량', source: 'mass', unit: 'kg' });
    n('k2', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Wheel inertia about its axis' : '휠 축 관성', source: 'Izz', scale: 1e4, unit: 'kg·cm²' });
    l('flange', 'p1'); l('flange', 'p2'); l('wheel', 'p3'); l('flange', 'k1'); l('wheel', 'k2');
  }),
  solid: (lang) => build(lang, ['유한요소 3D: 방열판과 브래킷', '3D finite elements: heat sink and bracket'], ['SolidWorks Simulation·Ansys 형 3D 해석 두 가지: 핀 8개 알루미늄 방열판에 10 W 칩을 얹고 공기로 식힐 때의 온도, 벽에 볼트로 고정한 강철 L 브래킷에 1.5 kN 을 걸 때의 von Mises 응력과 안전율. 3D 보기에서 색칠된 표면을 돌려 봅니다.', 'Two SolidWorks Simulation/Ansys-style 3D analyses: the temperature of an eight-fin aluminium heat sink carrying a 10 W chip in air, and the von Mises stress and safety factor of a steel L bracket bolted to a wall under 1.5 kN. Turn the coloured surfaces in the 3D view.'], (n, l) => {
    const preset = (id) => ({ ...nodeSpec('fem.solid').presets.find((p) => p.id === id).params });
    n('sink', 'fem.solid', 0, 0, preset('heatsink'), ['방열판 온도', 'Heat sink temperature']);
    n('bracket', 'fem.solid', 0, 2, preset('bracket'), ['브래킷 응력', 'Bracket stress']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Temperature, middle slice (°C)' : '가운데 단면 온도 (°C)', chart: 'heatmap', span: '2' });
    n('p2', 'out.plot', 1, 2, { title: lang === 'en' ? 'von Mises stress, middle slice (Pa)' : '가운데 단면 von Mises 응력 (Pa)', chart: 'heatmap', span: '2' });
    n('k1', 'out.kpi', 2, 1, { label: lang === 'en' ? 'Chip temperature' : '칩 온도', source: 'T(chip)', unit: '°C', high: 85 });
    n('k2', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Safety factor' : '안전율', source: 'safety factor', low: 2 });
    l('sink', 'p1'); l('bracket', 'p2'); l('sink', 'k1'); l('bracket', 'k2');
  }),
  physics: (lang) => build(lang, ['3D 물리 엔진: 차량·뉴턴의 요람·상자 탑', '3D physics: a vehicle, Newton\'s cradle, a box tower'], ['Gazebo·Webots 형 강체 물리: 모터 바퀴 네 개로 경사로를 오르는 차량, 에너지를 그대로 전하는 뉴턴의 요람, 쇠공에 무너지는 상자 탑. 노드를 고르고 3D 보기에서 ▶ 재생을 누르면 장면이 움직입니다.', 'Gazebo/Webots-style rigid-body physics: a vehicle climbing a ramp on four motor-driven wheels, Newton\'s cradle passing its energy along, and a box tower knocked down by a heavy ball. Pick a node and press ▶ Play in the 3D view to watch the scene.'], (n, l) => {
    const preset = (id) => ({ ...nodeSpec('physics.rigid').presets.find((p) => p.id === id).params });
    n('car', 'physics.rigid', 0, 0, preset('car'), ['모터 바퀴 차량', 'Motor-driven vehicle']);
    n('cradle', 'physics.rigid', 0, 2, preset('cradle'), ['뉴턴의 요람', 'Newton\'s cradle']);
    n('tower', 'physics.rigid', 0, 4, preset('tower'), ['상자 탑과 쇠공', 'Box tower and ball']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Vehicle position (m)' : '차량 위치 (m)', table: 'trajectories', y: 'chassis.x, chassis.z' });
    n('p2', 'out.plot', 2, 0, { title: lang === 'en' ? 'Wheel motor torque (N·m)' : '바퀴 모터 토크 (N·m)', table: 'joints', y: 'h1 torque, h3 torque' });
    n('p3', 'out.plot', 1, 2, { title: lang === 'en' ? 'Cradle: first and last ball (m)' : '요람: 처음·마지막 공 (m)', table: 'trajectories', y: 'b1.x, b5.x', span: '2' });
    n('p4', 'out.plot', 1, 4, { title: lang === 'en' ? 'Energy of the tower (J)' : '탑의 에너지 (J)', table: 'energy', y: 'kinetic, potential, total', span: '2' });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Distance driven' : '주행 거리', source: 'chassis.x (end)', unit: 'm' });
    n('k2', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Energy kept by the cradle' : '요람 에너지 보존', source: 'energy (end)', unit: 'J' });
    l('car', 'p1'); l('car', 'p2'); l('cradle', 'p3'); l('tower', 'p4'); l('car', 'k1'); l('cradle', 'k2');
  }),
  heatStudy: (lang) => build(lang, ['MyHeatManager 열 해석 (내장 엔진)', 'MyHeatManager heat studies (built-in engine)'], ['MyHeatManager 의 해석 엔진이 MySimulator 에 들어 있어 다른 프로그램 없이 .myheat 모델을 풉니다: 열 계면재·구리 박막이 있는 칩과 방열판(정상), 하루 동안 바깥 기온이 바뀌는 벽(과도). 결과는 다른 노드처럼 차트와 KPI 로 이어집니다.', 'MyHeatManager\'s solver is built into MySimulator, so .myheat models run without any other program: a chip with a thermal interface and a copper foil under a heat sink (steady) and a wall under a daily outdoor temperature cycle (transient). The results feed charts and KPIs like any other node.'], (n, l) => {
    n('chip', 'io.myheat', 0, 0, { content: base64(THIN_LAYER), fileName: 'thin_layer.myheat', field: 'T' }, ['칩과 방열판', 'Chip and heat sink']);
    n('wall', 'io.myheat', 0, 2, { content: base64(WALL_CYCLE), fileName: 'time_bc.myheat', field: 'T' }, ['하루 동안의 벽', 'A wall over a day']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Temperature (°C)' : '온도 (°C)', chart: 'heatmap', span: '2' });
    n('p2', 'out.plot', 1, 2, { title: lang === 'en' ? 'Wall at the end of the day (°C)' : '하루 끝의 벽 (°C)', chart: 'heatmap', span: '2' });
    n('k1', 'out.kpi', 3, 0, { label: lang === 'en' ? 'Hottest point' : '최고 온도', source: 'Tmax', unit: '°C' });
    n('k2', 'out.kpi', 3, 1, { label: lang === 'en' ? 'Heat balance error' : '열 수지 오차', source: 'balance error' });
    n('k3', 'out.kpi', 3, 2, { label: lang === 'en' ? 'Mid-wall temperature' : '벽 가운데 온도', source: 'probe mid', unit: '°C' });
    l('chip', 'p1'); l('wall', 'p2'); l('chip', 'k1'); l('chip', 'k2'); l('wall', 'k3');
  }),
  mycircuit: (lang) => build(lang, ['MyCircuit 회로를 그대로 시뮬레이션', 'MyCircuit circuits simulated as they are'], ['MyCircuit 의 "SPICE 내보내기" 로 나온 넷리스트 세 개(연산 증폭기 비반전 증폭기, NPN 트랜지스터 스위치, 반파 정류기)를 그대로 풉니다. 부회로·B 전원·BJT·다이오드 모델이 들어 있습니다. .mycircuit 프로젝트를 열면 같은 노드가 만들어집니다.', 'Three netlists from MyCircuit\'s "Export SPICE" (a non-inverting op-amp amplifier, an NPN transistor switch, a half-wave rectifier) solved as they are, with subcircuits, B sources, a BJT and diode models. Opening a .mycircuit project makes the same node.'], (n, l) => {
    n('amp', 'circuit.spice', 0, 0, { netlist: MYCIRCUIT_OPAMP, probes: 'in, out' }, ['비반전 증폭기 (MyCircuit)', 'Non-inverting amplifier (MyCircuit)']);
    n('sw', 'circuit.spice', 0, 2, { netlist: MYCIRCUIT_NPN, probes: '' }, ['NPN 스위치 (MyCircuit)', 'NPN switch (MyCircuit)']);
    n('rect', 'circuit.spice', 0, 4, { netlist: MYCIRCUIT_RECTIFIER, probes: '' }, ['반파 정류기 (MyCircuit)', 'Half-wave rectifier (MyCircuit)']);
    n('p1', 'out.plot', 1, 0, { title: lang === 'en' ? 'Amplifier: in and out (V)' : '증폭기: 입력과 출력 (V)', table: 'transient', y: 'V(in), V(out)', span: '2' });
    n('p2', 'out.plot', 1, 2, { title: lang === 'en' ? 'Operating point' : '동작점', chart: 'table', table: 'operating point' });
    n('p3', 'out.plot', 1, 4, { title: lang === 'en' ? 'Rectifier (V)' : '정류기 (V)', table: 'transient', span: '2' });
    n('k1', 'out.kpi', 2, 2, { label: lang === 'en' ? 'Switch output' : '스위치 출력', source: 'V(sw_out)', unit: 'V' });
    l('amp', 'p1'); l('sw', 'p2'); l('rect', 'p3'); l('sw', 'k1');
  }),
  audio: (lang) => build(lang, ['소리 파일 분석 (WAV)', 'Sound file analysis (WAV)'], ['파이프라인 안에 담은 WAV 파일(가 장화음 440·660 Hz, 1.2 kHz 휘파람, 잡음)을 읽어 스펙트럼으로 음을 찾고, 스펙트로그램을 그리고, 필터로 휘파람을 지웁니다. Excel·STL·MATLAB·PNG 파일도 같은 파일 데이터 노드로 읽습니다.', 'A WAV file kept in the pipeline (an A-major chord at 440 and 660 Hz, a 1.2 kHz whistle and noise) is read; the spectrum finds the notes, a spectrogram shows them over time and a filter removes the whistle. Excel, STL, MATLAB and PNG files load through the same file data node.'], (n, l) => {
    n('wav', 'source.file', 0, 1, { content: base64(chordWav()), fileName: 'chord.wav' }, ['chord.wav', 'chord.wav']);
    n('fft', 'signal.fft', 1, 0, { window: 'hann' }, ['스펙트럼', 'Spectrum']);
    n('spec', 'signal.spectrogram', 1, 2, {}, ['스펙트로그램', 'Spectrogram']);
    n('lp', 'signal.filter', 1, 1, { design: 'butterworth', type: 'lowpass', cutoff: 900, order: 8 }, ['휘파람 제거 (900 Hz)', 'Whistle removed (900 Hz)']);
    n('peaks', 'signal.peaks', 2, 0, { column: 'amplitude', prominence: 0.05 }, ['음 찾기', 'Notes']);
    n('fft2', 'signal.fft', 2, 1, { column: 'filtered', window: 'hann' }, ['필터 후 스펙트럼', 'Filtered spectrum']);
    n('p1', 'out.plot', 3, 0, { title: lang === 'en' ? 'Spectrum (dB)' : '스펙트럼 (dB)', y: 'dB', span: '2' });
    n('p2', 'out.plot', 2, 2, { title: lang === 'en' ? 'Spectrogram' : '스펙트로그램', chart: 'heatmap', span: '2' });
    n('p3', 'out.plot', 3, 1, { title: lang === 'en' ? 'After the filter (dB)' : '필터 후 (dB)', y: 'dB' });
    n('k1', 'out.kpi', 4, 0, { label: lang === 'en' ? 'Loudest note' : '가장 큰 음', source: 'dominant frequency', unit: 'Hz' });
    l('wav', 'fft'); l('wav', 'spec'); l('wav', 'lp'); l('fft', 'peaks'); l('lp', 'fft2'); l('fft', 'p1'); l('spec', 'p2'); l('fft2', 'p3'); l('fft', 'k1');
  }),
  python: (lang) => build(lang, ['Python 연동 (데스크톱)', 'Python integration (desktop)'], ['신호를 설치된 Python 스크립트로 처리하고 결과를 다시 파이프라인으로 받습니다. Python 이 있는 데스크톱 앱에서 실행됩니다.', 'A signal is processed by a script in the installed Python and the result comes back into the pipeline. Runs in the desktop app with Python installed.'], (n, l) => {
    n('sig', 'source.signal', 0, 1, { frequency: 3, fs: 200, duration: 4, noise: 0.3 }, ['신호', 'Signal']);
    n('py', 'io.python', 1, 1, { code: "import math\n# data: the input table, out: the result table\nt = data['t']\ny = data['y']\nk = 9\nsmooth = []\nfor i in range(len(y)):\n    w = y[max(0, i - k):i + k + 1]\n    smooth.append(sum(w) / len(w))\nout['t'] = t\nout['y'] = y\nout['smooth'] = smooth\nresult('peak', max(smooth))\nprint('rows:', len(t))" }, ['Python 이동 평균', 'Python moving average']);
    n('p', 'out.plot', 2, 1, { title: lang === 'en' ? 'Python result' : 'Python 결과', y: 'y, smooth', span: '2' });
    n('k', 'out.kpi', 2, 2, { label: lang === 'en' ? 'Peak (from Python)' : '최댓값 (Python)', source: 'peak' });
    l('sig', 'py'); l('py', 'p'); l('py', 'k');
  }),
};

// β is swept through a source node feeding the SIR model's input u (a sweep sets numeric parameters).
SAMPLES.epidemic = (lang) => build(lang, ['감염병 SIR 과 전파율 스윕', 'Epidemic SIR and a transmission sweep'], ['SIR 모델을 풀고, 전파율 β 에 따라 최대 감염자 수가 어떻게 바뀌는지 스윕합니다.', 'Solves the SIR model and sweeps the transmission rate β against the peak number of infected.'], (n, l) => {
  n('sir', 'dyn.ode', 0, 1, { equations: "S' = -beta*S*I/N\nI' = beta*S*I/N - gamma*I\nR' = gamma*I", constants: 'beta = 0.3, gamma = 0.1, N = 1000', initial: 'S = 999, I = 1, R = 0', tEnd: 160, dt: 0.5 }, ['SIR 모델', 'SIR model']);
  n('beta', 'source.function', 0, 3, { expression: 'beta = b', constants: 'b = 0.3', from: 0, to: 160, points: 321, variable: 't' }, ['β(t) (스윕 대상)', 'β(t) (swept)']);
  n('sirU', 'dyn.ode', 1, 3, { equations: "S' = -u*S*I/N\nI' = u*S*I/N - gamma*I\nR' = gamma*I", constants: 'gamma = 0.1, N = 1000', initial: 'S = 999, I = 1, R = 0', tEnd: 160, dt: 0.5, uColumn: 'beta' }, ['SIR (β 입력)', 'SIR (β input)']);
  n('sw', 'opt.sweep', 2, 3, { node: 'beta', param: 'b', from: 0.12, to: 0.6, steps: 13, metricNode: 'sirU', metric: 'I', aggregate: 'max' }, ['β 스윕 → 최대 감염자', 'β sweep → peak infected']);
  n('p', 'out.plot', 1, 0, { title: 'S, I, R', y: 'S, I, R', span: '2' });
  n('ps', 'out.plot', 3, 3, { title: lang === 'en' ? 'Peak infected vs β' : 'β 에 따른 최대 감염자' });
  n('k', 'out.kpi', 2, 1, { label: lang === 'en' ? 'Peak infected' : '최대 감염자', source: 'I', aggregate: 'max' });
  l('sir', 'p'); l('sir', 'k'); l('beta', 'sirU', 'u'); l('sw', 'ps');
});

/** Sample ids in gallery order. */
const ORDER = ['blockDiagram', 'circuits', 'mycircuit', 'logic', 'fem', 'solid', 'cad', 'physics', 'robots', 'factory', 'heatStudy', 'audio'];
export const SAMPLE_IDS = [...ORDER.filter((id) => SAMPLES[id]), ...Object.keys(SAMPLES).filter((id) => !ORDER.includes(id))];

/** Tags per sample (shown on the cards; "desktop" = needs the desktop app). */
export const SAMPLE_TAGS = {
  signalCleanup: ['signal'], chirpSpectrogram: ['signal'], vibration: ['dynamics', 'signal'], lorenz: ['dynamics'],
  pidControl: ['control'], pidSweep: ['control', 'sweep'], stateSpace: ['control'], regression: ['statistics'],
  clustering: ['ml'], neuralRegression: ['ml'], classification: ['ml'], tolerance: ['montecarlo'], finance: ['montecarlo'],
  optimization: ['optimization'], curveFit: ['optimization'], blockDiagram: ['control', 'dynamics'], factory: ['process'], circuits: ['circuit'], logic: ['circuit'], fem: ['physics'], robots: ['robotics'], cad: ['cad'], solid: ['physics', 'cad'], physics: ['robotics'], heatStudy: ['physics', 'integration'], mycircuit: ['circuit', 'integration'], audio: ['signal'], epidemic: ['dynamics', 'sweep'], python: ['integration', 'desktop'],
};

export function sampleModel(id, lang = 'ko') {
  const make = SAMPLES[id] ?? SAMPLES.signalCleanup;
  return make(lang);
}
