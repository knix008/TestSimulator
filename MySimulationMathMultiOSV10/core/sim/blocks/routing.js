// Signal Routing: Mux / Demux, Bus Creator / Bus Selector, Switch, Multiport
// Switch, Manual Switch, Selector, Goto / From / Goto Tag Visibility (virtual,
// resolved by the compiler), Merge and the data store blocks.
import { def, L, P, enumP, boolP, numP, TS, S1, F, copy, tsOf, isBus } from './util.js';
import { MError } from '../../value.js';

const G = 'routing';
const count = (p, k, d) => { const s = String(p[k] ?? d).trim(); const m = /^\[(.*)\]$/.exec(s); if (m) return Math.max(1, m[1].split(/[\s,]+/).filter(Boolean).length); const n = Math.round(Number(s)); return n >= 1 ? n : d; };
const names = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const cat = (us) => { let n = 0; for (const u of us) { if (isBus(u)) throw new MError('sim:mux:bus', 'A bus cannot be combined by a Mux block; use a Bus Creator.'); n += u.length; } const y = F(n); let o = 0; for (const u of us) { y.set(u, o); o += u.length; } return y; };
function busPick(bus, path) {
  let cur = bus;
  for (const part of path.split('.')) {
    if (!isBus(cur)) throw new MError('sim:bus:notBus', `'${path}' does not name a bus element.`);
    const k = cur.names.indexOf(part);
    if (k < 0) throw new MError('sim:bus:noElement', `The bus has no element '${part}' (elements: ${cur.names.join(', ')}).`);
    cur = cur.signals[k];
  }
  return cur;
}
const sel = (c, a, b) => { const n = Math.max(a.length, b.length, c.length); const y = F(n); for (let i = 0; i < n; i++) y[i] = (c.length === 1 ? c[0] : c[i]) ? (a.length === 1 ? a[0] : a[i]) : (b.length === 1 ? b[0] : b[i]); return y; };

export const BLOCKS = [
  def('Mux', G, 'Mux', '먹스', {
    desc: L('Combines its inputs into one vector signal.', '입력을 하나의 벡터 신호로 합칩니다.'),
    params: [P('Inputs', 'expr', '2', 'Number of inputs', '입력 개수', { num: true, min: 1, step: 1 })],
    size: [5, 50], shape: 'bar', hideName: true, ports: (p) => ({ in: count(p, 'Inputs', 2), out: 1 }), icon: () => ({ text: '' }),
    make: () => ({ ts: -1, output: (S, u) => [cat(u)] }),
  }),
  def('Demux', G, 'Demux', '디먹스', {
    desc: L('Splits a vector signal into equal parts (or the given widths).', '벡터 신호를 같은 크기(또는 지정한 폭)로 나눕니다.'),
    params: [P('Outputs', 'expr', '2', 'Number of outputs or widths', '출력 개수 또는 폭', { num: true, min: 1, step: 1 })],
    size: [5, 50], shape: 'bar', hideName: true, ports: (p) => ({ in: 1, out: count(p, 'Outputs', 2) }), icon: () => ({ text: '' }),
    make(B) {
      const a = B.arr('Outputs');
      const widths = a.length > 1 ? Array.from(a, Math.round) : null;
      const n = widths ? widths.length : Math.max(1, Math.round(a[0] || 2));
      return {
        ts: -1,
        y0: () => Array.from({ length: n }, () => S1(0)),
        output(S, u) {
          const v = u[0];
          let ws = widths;
          if (!ws) { const base = Math.floor(v.length / n), extra = v.length % n; ws = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); }
          const total = ws.reduce((x, y) => x + y, 0);
          if (total !== v.length && !S.trial) throw new MError('sim:demux:width', `The input width ${v.length} does not match the output widths (${ws.join(', ')}).`);
          let o = 0;
          return ws.map((w) => { const y = F(Math.max(w, 1)); for (let i = 0; i < w; i++) y[i] = v[o + i] ?? 0; o += w; return y; });
        },
      };
    },
  }),
  def('BusCreator', G, 'Bus Creator', '버스 생성기', {
    desc: L('Combines signals into a bus. Element names come from the line names (or signal1, signal2, …).', '신호를 버스로 묶습니다. 요소 이름은 선 이름(없으면 signal1, signal2, …)입니다.'),
    params: [numP('Inputs', '2', 'Number of inputs', '입력 개수', { min: 1, step: 1 }), P('SignalNames', 'text', '', 'Element names (comma separated, optional)', '요소 이름 (쉼표 구분, 선택)')],
    size: [5, 50], shape: 'bar', hideName: true, ports: (p) => ({ in: count(p, 'Inputs', 2), out: 1 }), icon: () => ({ text: '' }),
    make(B) {
      const given = names(B.str('SignalNames'));
      const nm = Array.from({ length: B.nIn }, (_, i) => given[i] || (B.inNames && B.inNames[i]) || `signal${i + 1}`);
      return { ts: -1, output: (S, u) => [{ bus: true, names: nm, signals: u.map((x) => (isBus(x) ? x : copy(x))) }] };
    },
  }),
  def('BusSelector', G, 'Bus Selector', '버스 선택기', {
    desc: L('Outputs the named elements of a bus (dotted names for nested buses).', '버스에서 이름으로 요소를 꺼냅니다 (중첩 버스는 점 표기).'),
    params: [P('OutputSignals', 'text', 'signal1,signal2', 'Selected elements (comma separated)', '선택한 요소 (쉼표 구분)'), boolP('OutputAsBus', false, 'Output as bus', '버스로 출력')],
    size: [5, 50], shape: 'bar', hideName: true, ports: (p) => ({ in: 1, out: String(p.OutputAsBus) === 'on' ? 1 : Math.max(1, names(p.OutputSignals).length) }), icon: () => ({ text: '' }),
    make(B) {
      const list = names(B.str('OutputSignals'));
      const asBus = B.bool('OutputAsBus');
      return {
        ts: -1,
        y0: () => (asBus ? [S1(0)] : list.map(() => S1(0))),
        output(S, u) {
          const b = u[0];
          if (!isBus(b)) { if (S.trial) return asBus ? [S1(0)] : list.map(() => S1(0)); throw new MError('sim:bus:notBus', 'The input of a Bus Selector must be a bus.'); }
          const vals = list.map((p) => busPick(b, p));
          return asBus ? [{ bus: true, names: list.map((p) => p.split('.').pop()), signals: vals }] : vals;
        },
      };
    },
  }),
  def('Switch', G, 'Switch', '스위치', {
    desc: L('Passes input 1 when the control input (2) meets the criterion, otherwise input 3.', '제어 입력(2)이 조건을 만족하면 입력 1, 아니면 입력 3을 내보냅니다.'),
    params: [enumP('Criteria', 'u2 >= Threshold', 'Criteria for passing first input', '첫 입력 통과 조건', ['u2 >= Threshold', 'u2 > Threshold', 'u2 ~= 0']), numP('Threshold', '0', 'Threshold', '임계값'), boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [40, 50], ports: { in: 3, out: 1 }, icon: () => ({ glyph: 'switch' }),
    make(B) {
      const th = B.num('Threshold', 0), cr = B.opt('Criteria');
      const test = cr === 'u2 > Threshold' ? (x) => x > th : cr === 'u2 ~= 0' ? (x) => x !== 0 : (x) => x >= th;
      const zc = B.bool('ZeroCross');
      const rt = {
        ts: -1,
        output(S, u) {
          const c = u[1];
          if (c.length === 1) return [copy(test(c[0]) ? u[0] : u[2])];
          return [sel(Float64Array.from(c, (x) => (test(x) ? 1 : 0)), u[0], u[2])];
        },
      };
      if (zc) rt.zc = (S, u) => Array.from(u[1], (x) => (cr === 'u2 ~= 0' ? x : x - th));
      return rt;
    },
  }),
  def('MultiportSwitch', G, 'Multiport Switch', '다중 포트 스위치', {
    desc: L('Passes the data input selected by the (rounded) control input 1.', '제어 입력 1(반올림)이 고른 데이터 입력을 내보냅니다.'),
    params: [numP('Inputs', '3', 'Number of data ports', '데이터 포트 수', { min: 1, step: 1 }), enumP('DataPortOrder', 'one-based', 'Data port order', '데이터 포트 번호', ['one-based', 'zero-based']), enumP('DataPortForDefault', 'last', 'Default for out-of-range', '범위 밖일 때', [{ value: 'last', label: L('Last data port', '마지막 포트') }, { value: 'error', label: L('Error', '오류') }])],
    size: [40, 70], ports: (p) => ({ in: 1 + count(p, 'Inputs', 3), out: 1 }), icon: () => ({ text: '*' }),
    make(B) {
      const n = Math.max(1, B.int('Inputs', 3)), zero = B.opt('DataPortOrder') === 'zero-based', err = B.opt('DataPortForDefault') === 'error';
      return {
        ts: -1,
        output(S, u) {
          let k = Math.round(u[0][0]) - (zero ? 0 : 1);
          if (!(k >= 0 && k < n)) { if (err && !S.trial) throw new MError('sim:multiport:range', `The control input ${u[0][0]} selects no data port.`); k = n - 1; }
          return [copy(u[1 + k])];
        },
      };
    },
  }),
  def('ManualSwitch', G, 'Manual Switch', '수동 스위치', {
    desc: L('Double-click to toggle between the two inputs (also while the simulation runs).', '두 번 클릭하면 두 입력 사이를 전환합니다 (시뮬레이션 중에도).'),
    params: [enumP('sw', '1', 'Position', '위치', [{ value: '1', label: L('Upper input', '위 입력') }, { value: '2', label: L('Lower input', '아래 입력') }])],
    size: [40, 40], ports: { in: 2, out: 1 }, icon: (p) => ({ glyph: 'manualswitch', pos: Number(p.sw || 1) }),
    make(B) { const k = B.opt('sw') === '2' ? 1 : 0; return { ts: -1, output: (S, u) => [copy(u[k])] }; },
  }),
  def('Selector', G, 'Selector', '선택기', {
    desc: L('Selects elements of a vector (or rows / columns of a matrix) by index.', '벡터 원소(또는 행렬의 행/열)를 인덱스로 고릅니다.'),
    params: [P('Indices', 'expr', '[1 3]', 'Index vector', '인덱스 벡터'), enumP('IndexMode', 'one', 'Index mode', '인덱스 모드', [{ value: 'one', label: L('One-based', '1부터') }, { value: 'zero', label: L('Zero-based', '0부터') }]), enumP('IndexOption', 'dialog', 'Index source', '인덱스 원천', [{ value: 'dialog', label: L('Index vector (dialog)', '인덱스 벡터 (대화상자)') }, { value: 'port', label: L('Index vector (port)', '인덱스 벡터 (포트)') }, { value: 'all', label: L('Select all', '모두 선택') }])],
    size: [50, 40], ports: (p) => ({ in: String(p.IndexOption) === 'port' ? 2 : 1, out: 1 }), icon: () => ({ text: 'Y = U(i)' }),
    make(B) {
      const opt = B.opt('IndexOption'), off = B.opt('IndexMode') === 'zero' ? 0 : 1;
      const fixed = opt === 'dialog' ? Array.from(B.arr('Indices'), (x) => Math.round(x) - off) : null;
      return {
        ts: -1,
        output(S, u) {
          const v = u[0];
          if (opt === 'all') return [copy(v)];
          const idx = fixed || Array.from(u[1], (x) => Math.round(x) - off);
          const y = F(idx.length);
          idx.forEach((k, i) => { if (!(k >= 0 && k < v.length)) { if (!S.trial) throw new MError('sim:selector:range', `Index ${k + off} exceeds the input width ${v.length}.`); } else y[i] = v[k]; });
          return [y];
        },
      };
    },
  }),
  def('Goto', G, 'Goto', 'Goto', {
    desc: L('Sends its input to the From blocks with the same tag (no line needed).', '같은 태그를 가진 From 블록으로 입력을 보냅니다 (선 없이).'),
    params: [P('GotoTag', 'text', 'A', 'Tag', '태그'), enumP('TagVisibility', 'local', 'Tag visibility', '태그 가시성', [{ value: 'local', label: L('local', '로컬') }, { value: 'scoped', label: L('scoped', '범위') }, { value: 'global', label: L('global', '전역') }])],
    size: [50, 24], shape: 'tag', ports: { in: 1, out: 0 }, icon: (p) => ({ text: String(p.TagVisibility) === 'global' ? `[${p.GotoTag || 'A'}]` : String(p.TagVisibility) === 'scoped' ? `{${p.GotoTag || 'A'}}` : `[${p.GotoTag || 'A'}]` }),
    extra: { role: 'goto' },
  }),
  def('From', G, 'From', 'From', {
    desc: L('Outputs the signal of the Goto block with the same tag.', '같은 태그를 가진 Goto 블록의 신호를 내보냅니다.'),
    params: [P('GotoTag', 'text', 'A', 'Tag', '태그')],
    size: [50, 24], shape: 'tag', ports: { in: 0, out: 1 }, icon: (p) => ({ text: `[${p.GotoTag || 'A'}]` }), extra: { role: 'from' },
  }),
  def('GotoTagVisibility', G, 'Goto Tag Visibility', 'Goto 태그 가시성', {
    desc: L('Marks the system where a scoped Goto tag is visible.', '범위 Goto 태그가 보이는 시스템을 표시합니다.'),
    params: [P('GotoTag', 'text', 'A', 'Tag', '태그')], size: [50, 24], ports: { in: 0, out: 0 }, icon: (p) => ({ text: `{${p.GotoTag || 'A'}}` }), extra: { role: 'gotovis' },
  }),
  def('Merge', G, 'Merge', '병합', {
    desc: L('Outputs the input that was computed most recently (typically outputs of action subsystems).', '가장 최근에 계산된 입력을 내보냅니다 (주로 동작 서브시스템 출력).'),
    params: [numP('Inputs', '2', 'Number of inputs', '입력 개수', { min: 1, step: 1 }), numP('InitialOutput', '0', 'Initial output', '초기 출력')],
    size: [50, 60], ports: (p) => ({ in: count(p, 'Inputs', 2), out: 1 }), icon: () => ({ text: 'Merge' }),
    make(B) {
      const ic = B.arr('InitialOutput');
      let last = -1;
      return {
        ts: -1, wantStamps: true,
        init() { last = -1; },
        y0: () => [ic.length ? copy(ic) : S1(0)],
        output(S, u) {
          const st = S.stamps || [];
          let k = -1, best = -1;
          for (let i = 0; i < st.length; i++) if (st[i] > best) { best = st[i]; k = i; }
          if (k < 0 || (best <= last && !S.trial)) return null;
          last = best;
          return [copy(u[k])];
        },
      };
    },
  }),
  def('DataStoreMemory', G, 'Data Store Memory', '데이터 저장소 메모리', {
    desc: L('Defines a named data store for Data Store Read / Write blocks.', 'Data Store Read/Write 블록이 쓰는 이름 있는 저장소를 정의합니다.'),
    params: [P('DataStoreName', 'text', 'A', 'Data store name', '저장소 이름'), numP('InitialValue', '0', 'Initial value', '초기값')],
    size: [60, 30], ports: { in: 0, out: 0 }, icon: (p) => ({ text: p.DataStoreName || 'A' }), extra: { role: 'dsm' },
  }),
  def('DataStoreRead', G, 'Data Store Read', '데이터 저장소 읽기', {
    desc: L('Outputs the current value of a data store.', '데이터 저장소의 현재 값을 내보냅니다.'),
    params: [P('DataStoreName', 'text', 'A', 'Data store name', '저장소 이름'), TS('0')],
    size: [60, 30], ports: { in: 0, out: 1 }, icon: (p) => ({ text: p.DataStoreName || 'A' }),
    make(B) {
      const nm = B.opt('DataStoreName') || 'A';
      return {
        ts: tsOf(B, 0), direct: false,
        output(S) { const v = S.run && S.run.dstore.get(nm); if (!v) throw new MError('sim:datastore:missing', `No Data Store Memory block defines '${nm}'.`); return [copy(v)]; },
      };
    },
  }),
  def('DataStoreWrite', G, 'Data Store Write', '데이터 저장소 쓰기', {
    desc: L('Writes its input to a data store.', '입력을 데이터 저장소에 씁니다.'),
    params: [P('DataStoreName', 'text', 'A', 'Data store name', '저장소 이름'), TS('-1')],
    size: [60, 30], ports: { in: 1, out: 0 }, icon: (p) => ({ text: p.DataStoreName || 'A' }),
    make(B) {
      const nm = B.opt('DataStoreName') || 'A';
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          if (S.trial || !S.run) return null;
          if (!S.run.dstore.has(nm)) throw new MError('sim:datastore:missing', `No Data Store Memory block defines '${nm}'.`);
          S.run.dstore.set(nm, copy(u[0]));
          return null;
        },
      };
    },
  }),
];

export { busPick, cat };
