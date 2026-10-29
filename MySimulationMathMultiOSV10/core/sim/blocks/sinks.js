// Sinks: Scope, Floating Scope, XY Graph, Display, To Workspace, Terminator,
// Stop Simulation (and the root Out port entry). Logging sinks collect samples
// at major steps (rt.log); the engine streams them to the editor (rt.take) and
// writes workspace results at the end (rt.result).
import { def, L, P, enumP, boolP, numP, TS, tsOf, isBus } from './util.js';
import { tensor, struct, str, num } from '../../value.js';

const G = 'sinks';
const asArr = (u) => (u && !isBus(u) ? u : Float64Array.of(0));

/** Sample buffer with streaming (take) and a workspace value (struct with time / matrix). */
function recorder(nPorts, opts = {}) {
  const dec = Math.max(1, Math.round(opts.decimation || 1));
  const limit = opts.limit > 0 ? opts.limit : 0;
  let t = [], data = [], k = 0, sent = 0, widths = [];
  return {
    reset() { t = []; data = Array.from({ length: nPorts }, () => []); k = 0; sent = 0; widths = []; },
    push(time, u) {
      if ((k++ % dec) !== 0) return;
      t.push(time);
      for (let p = 0; p < nPorts; p++) {
        const v = asArr(u[p]);
        widths[p] = v.length;
        const row = new Array(v.length);
        for (let i = 0; i < v.length; i++) row[i] = v[i];
        data[p].push(row);
      }
      if (limit && t.length > limit + 4096) { const d = t.length - limit; t.splice(0, d); for (const a of data) a.splice(0, d); sent = Math.max(0, sent - d); }
    },
    take() {
      const nt = t.slice(sent);
      const series = [];
      for (let p = 0; p < nPorts; p++) {
        const w = widths[p] || 1;
        const flat = [];
        for (let i = sent; i < t.length; i++) { const r = data[p][i] || []; for (let j = 0; j < w; j++) flat.push(r[j] ?? 0); }
        series.push({ port: p + 1, width: w, data: flat });
      }
      sent = t.length;
      return { t: nt, series };
    },
    times: () => (limit && t.length > limit ? t.slice(t.length - limit) : t),
    rows: (p) => (limit && data[p].length > limit ? data[p].slice(data[p].length - limit) : data[p]),
    width: (p) => widths[p] || 1,
  };
}
const col = (a) => tensor('double', [a.length, 1], Float64Array.from(a));
function mat(rows, w) { const N = rows.length; const a = new Float64Array(N * w); for (let i = 0; i < N; i++) for (let j = 0; j < w; j++) a[i + j * N] = rows[i][j] ?? 0; return tensor('double', [N, w], a); }
const rec = (o) => Object.assign(Object.create(null), o);
/** Workspace value in the given save format. */
function saved(fmt, times, rows, w, blockName, name) {
  const T = col(times), Y = mat(rows, w);
  switch (String(fmt).toLowerCase()) {
    case 'array': return Y;
    case 'structure': return struct([1, 1], ['time', 'signals', 'blockName'], [rec({ time: tensor('double', [0, 0]), signals: struct([1, 1], ['values', 'dimensions', 'label'], [rec({ values: Y, dimensions: num(w), label: str('') })]), blockName: str(blockName) })]);
    case 'structure with time': return struct([1, 1], ['time', 'signals', 'blockName'], [rec({ time: T, signals: struct([1, 1], ['values', 'dimensions', 'label'], [rec({ values: Y, dimensions: num(w), label: str('') })]), blockName: str(blockName) })]);
    default: return struct([1, 1], ['Name', 'Time', 'Data'], [rec({ Name: str(name), Time: T, Data: Y })]);
  }
}

const scopeParams = (extra = []) => [
  ...extra,
  P('Title', 'text', '', 'Title', '제목'),
  boolP('AutoScale', true, 'Auto scale', '자동 축척'),
  numP('YMin', '-1', 'Y minimum', 'Y 최소'), numP('YMax', '1', 'Y maximum', 'Y 최대'),
  P('TimeRange', 'text', 'auto', 'Time range (auto or seconds)', '시간 범위 (auto 또는 초)'),
  enumP('Layout', 'separate', 'Layout', '배치', [{ value: 'separate', label: L('One axes per input', '입력마다 축') }, { value: 'overlay', label: L('Overlay', '겹쳐 그리기') }]),
  boolP('Legend', false, 'Legend', '범례'),
  numP('Decimation', '1', 'Decimation', '솎아내기', { tab: 'logging', min: 1, step: 1 }),
  boolP('LimitDataPoints', false, 'Limit data points', '데이터 점 제한', { tab: 'logging' }),
  numP('MaxDataPoints', '5000', 'Maximum data points', '최대 데이터 점', { tab: 'logging', min: 1, step: 100 }),
  boolP('DataLogging', false, 'Log data to workspace', '작업 공간에 기록', { tab: 'logging' }),
  P('DataLoggingVariableName', 'text', 'ScopeData', 'Variable name', '변수 이름', { tab: 'logging' }),
  enumP('DataLoggingSaveFormat', 'Structure With Time', 'Save format', '저장 형식', ['Structure With Time', 'Structure', 'Array', 'Timeseries'], { tab: 'logging' }),
];
function scopeMake(B, nPorts) {
  const r = recorder(nPorts, { decimation: B.num('Decimation', 1), limit: B.bool('LimitDataPoints') ? B.num('MaxDataPoints', 5000) : 0 });
  const logging = B.bool('DataLogging'), vname = B.opt('DataLoggingVariableName') || 'ScopeData', fmt = B.opt('DataLoggingSaveFormat');
  return {
    ts: tsOf(B, -1), direct: false,
    init() { r.reset(); },
    log(S, u) { r.push(S.t, u); },
    take: () => r.take(),
    result() {
      if (!logging) return [];
      if (nPorts === 1) return [{ name: vname, value: saved(fmt, r.times(), r.rows(0), r.width(0), B.path, vname) }];
      const times = r.times();
      const sigs = Array.from({ length: nPorts }, (_, p) => rec({ values: mat(r.rows(p), r.width(p)), dimensions: num(r.width(p)), label: str('') }));
      return [{ name: vname, value: struct([1, 1], ['time', 'signals', 'blockName'], [rec({ time: col(times), signals: struct([1, nPorts], ['values', 'dimensions', 'label'], sigs), blockName: str(B.path) })]) }];
    },
  };
}
const nIn = (p, k, d = 1) => { const n = Math.round(Number(p[k])); return n >= 1 ? n : d; };

export const BLOCKS = [
  def('Scope', G, 'Scope', '스코프', {
    desc: L('Plots its inputs against simulation time. Double-click to open the scope window.', '입력을 시뮬레이션 시간에 대해 그립니다. 두 번 클릭하면 스코프 창이 열립니다.'),
    params: scopeParams([numP('NumInputPorts', '1', 'Number of inputs', '입력 개수', { min: 1, step: 1 }), TS('-1')]),
    size: [40, 40], ports: (p) => ({ in: nIn(p, 'NumInputPorts'), out: 0 }), icon: () => ({ glyph: 'scope' }), extra: { role: 'scope' },
    make: (B) => scopeMake(B, B.nIn),
  }),
  def('FloatingScope', G, 'Floating Scope', '플로팅 스코프', {
    desc: L('A scope without input ports: right-click a line and choose "Add to scope" to show it.', '입력 포트가 없는 스코프: 선을 오른쪽 클릭해 "스코프에 추가"를 고르면 표시됩니다.'),
    params: scopeParams([P('Signals', 'text', '', 'Signals (block:port, comma separated)', '신호 (블록:포트, 쉼표 구분)')]),
    size: [40, 40], ports: { in: 0, out: 0 }, icon: () => ({ glyph: 'scope' }), extra: { role: 'floatscope' },
    make: (B) => scopeMake(B, B.nIn),
  }),
  def('XYGraph', G, 'XY Graph', 'XY 그래프', {
    desc: L('Plots input 2 (Y) against input 1 (X).', '입력 2(Y)를 입력 1(X)에 대해 그립니다.'),
    params: [numP('XMin', '-1', 'X minimum', 'X 최소'), numP('XMax', '1', 'X maximum', 'X 최대'), numP('YMin', '-1', 'Y minimum', 'Y 최소'), numP('YMax', '1', 'Y maximum', 'Y 최대'), boolP('AutoScale', true, 'Auto scale', '자동 축척'), P('Title', 'text', '', 'Title', '제목'), TS('-1'), numP('Decimation', '1', 'Decimation', '솎아내기', { tab: 'logging', min: 1, step: 1 })],
    size: [40, 40], ports: { in: 2, out: 0 }, icon: () => ({ glyph: 'xy' }), extra: { role: 'xy' },
    make: (B) => scopeMake(B, 2),
  }),
  def('Display', G, 'Display', '디스플레이', {
    desc: L('Shows the current value of its input on the block.', '입력의 현재 값을 블록에 표시합니다.'),
    params: [enumP('Format', 'short', 'Format', '형식', ['short', 'long', 'short e', 'long e', 'bank', 'hex']), numP('Decimation', '1', 'Decimation', '솎아내기', { min: 1, step: 1 }), TS('-1')],
    size: [90, 30], ports: { in: 1, out: 0 }, icon: () => ({ glyph: 'display', text: '0' }), extra: { role: 'display' },
    make(B) {
      const dec = Math.max(1, B.int('Decimation', 1));
      let k = 0;
      const rt = { ts: tsOf(B, -1), direct: false, last: null, init() { k = 0; rt.last = null; }, log(S, u) { if ((k++ % dec) === 0) rt.last = Float64Array.from(asArr(u[0])); } };
      return rt;
    },
  }),
  def('ToWorkspace', G, 'To Workspace', '작업 공간으로', {
    desc: L('Saves its input to a workspace variable (inside the simulation output when single output is on).', '입력을 작업 공간 변수로 저장합니다 (단일 출력이 켜져 있으면 시뮬레이션 출력 안에).'),
    params: [P('VariableName', 'text', 'simout', 'Variable name', '변수 이름'), numP('MaxDataPoints', 'inf', 'Limit data points to last', '마지막 데이터 점 개수 제한'), numP('Decimation', '1', 'Decimation', '솎아내기', { min: 1, step: 1 }), TS('-1'), enumP('SaveFormat', 'Timeseries', 'Save format', '저장 형식', ['Timeseries', 'Structure With Time', 'Structure', 'Array'])],
    size: [70, 30], ports: { in: 1, out: 0 }, icon: (p) => ({ text: p.VariableName || 'simout' }), extra: { role: 'toworkspace' },
    make(B) {
      const max = B.num('MaxDataPoints', Infinity);
      const r = recorder(1, { decimation: B.num('Decimation', 1), limit: Number.isFinite(max) && max > 0 ? Math.round(max) : 0 });
      const name = B.opt('VariableName') || 'simout', fmt = B.opt('SaveFormat');
      if (!/^[A-Za-z]\w*$/.test(name)) B.err(`'${name}' is not a valid variable name.`);
      return { ts: tsOf(B, -1), direct: false, init() { r.reset(); }, log(S, u) { r.push(S.t, u); }, result: () => [{ name, value: saved(fmt, r.times(), r.rows(0), r.width(0), B.path, name) }] };
    },
  }),
  def('Terminator', G, 'Terminator', '종단', {
    desc: L('Terminates an unused output (avoids the unconnected-port warning).', '쓰지 않는 출력을 끝맺습니다 (연결 안 됨 경고 방지).'),
    size: [24, 24], ports: { in: 1, out: 0 }, icon: () => ({ glyph: 'terminator' }), hideName: true, extra: { role: 'terminator' },
    make: () => ({ ts: -1, direct: false }),
  }),
  def('StopSimulation', G, 'Stop Simulation', '시뮬레이션 정지', {
    desc: L('Stops the simulation at the end of the time step in which the input is nonzero.', '입력이 0이 아닌 시간 스텝이 끝나면 시뮬레이션을 멈춥니다.'),
    size: [50, 40], ports: { in: 1, out: 0 }, icon: () => ({ text: 'STOP' }),
    make: (B) => ({ ts: -1, log(S, u) { const v = asArr(u[0]); for (let i = 0; i < v.length; i++) if (v[i] !== 0 && !Number.isNaN(v[i])) { S.run.requestStop(`Simulation stopped by '${B.path}' at t = ${S.t}.`, B.block.id); return; } } }),
  }),
];

export const LIBRARY_EXTRA = [
  { id: 'Out1', type: 'Outport', group: G, label: L('Out1', '출력 1'), params: { Port: '1' }, desc: L('Model output port (logged to yout).', '모델 출력 포트 (yout에 기록).') },
];

export { recorder, saved };
