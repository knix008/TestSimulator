// Ports & Subsystems: Subsystem (plain, atomic, enabled, triggered, action,
// for / while iterator variants), Inport / Outport, the control port blocks,
// For / While Iterator, If and Switch Case. Subsystems are virtual: the
// compiler flattens them; control blocks inside turn them into conditional
// execution groups (see compile.js / runtime.js).
import { def, L, P, enumP, boolP, numP, TS, S1, F, copy } from './util.js';
import { Scope } from '../expr/interp.js';
import { MError, isCell, isTensor } from '../../value.js';

const G = 'ports';
const byPort = (a, b) => (Number(a.params.Port) || 1) - (Number(b.params.Port) || 1);
const maxPort = (list) => list.reduce((m, b) => Math.max(m, Math.round(Number(b.params.Port) || 1)), 0);

function subsystemPorts(p, b) {
  const s = b && b.system;
  if (!s) return { in: 1, out: 1, special: [] };
  const ins = s.blocks.filter((x) => x.type === 'Inport').sort(byPort);
  const outs = s.blocks.filter((x) => x.type === 'Outport').sort(byPort);
  const special = [];
  if (s.blocks.some((x) => x.type === 'EnablePort')) special.push('enable');
  if (s.blocks.some((x) => x.type === 'TriggerPort')) special.push('trigger');
  if (s.blocks.some((x) => x.type === 'ActionPort')) special.push('action');
  const named = (list) => (list.some((x) => !/^(In|Out)\d*$/.test(x.name)) ? list.map((x) => x.name) : []);
  return { in: maxPort(ins), out: maxPort(outs), special, inLabels: named(ins), outLabels: named(outs) };
}

const VARIANTS = {
  '': { label: L('Subsystem', '서브시스템') },
  atomic: { label: L('Atomic Subsystem', '원자 서브시스템'), params: { TreatAsAtomicUnit: 'on' } },
  enabled: { label: L('Enabled Subsystem', '활성화 서브시스템'), ctl: 'EnablePort' },
  triggered: { label: L('Triggered Subsystem', '트리거 서브시스템'), ctl: 'TriggerPort' },
  enabledTriggered: { label: L('Enabled and Triggered Subsystem', '활성화·트리거 서브시스템'), ctl: ['EnablePort', 'TriggerPort'] },
  ifAction: { label: L('If Action Subsystem', 'If 동작 서브시스템'), ctl: 'ActionPort' },
  switchCaseAction: { label: L('Switch Case Action Subsystem', 'Switch Case 동작 서브시스템'), ctl: 'ActionPort', ctlParams: { ActionType: 'switch' } },
  forIterator: { label: L('For Iterator Subsystem', 'For 반복 서브시스템'), ctl: 'ForIterator' },
  whileIterator: { label: L('While Iterator Subsystem', 'While 반복 서브시스템'), ctl: 'WhileIterator' },
};

function subsystemTemplate(variant = '') {
  const v = VARIANTS[variant] || VARIANTS[''];
  const blocks = [
    { type: 'Inport', name: 'In1', x: 60, y: 92, params: { Port: '1' } },
    { type: 'Outport', name: 'Out1', x: 300, y: 92, params: { Port: '1' } },
  ];
  const lines = [{ from: ['In1', 1], to: ['Out1', 1] }];
  const ctl = v.ctl ? (Array.isArray(v.ctl) ? v.ctl : [v.ctl]) : [];
  ctl.forEach((type, i) => {
    const name = { EnablePort: 'Enable', TriggerPort: 'Trigger', ActionPort: 'Action Port', ForIterator: 'For Iterator', WhileIterator: 'While Iterator' }[type];
    blocks.push({ type, name, x: 160 + i * 70, y: 20, params: v.ctlParams || {} });
  });
  if (ctl.includes('WhileIterator')) {
    blocks.push({ type: 'Constant', name: 'Condition', x: 60, y: 160, params: { Value: '0' } });
    lines.push({ from: ['Condition', 1], to: ['While Iterator', 1] });
  }
  return { params: v.params || {}, system: { blocks, lines } };
}

/** Evaluates a text expression with u1..un bound to the first input elements. */
function condFn(B, src, nIn) {
  const text = String(src).trim();
  if (!text) return () => false;
  return (u) => {
    const s = new Scope(null, B.scope);
    for (let i = 0; i < nIn; i++) { const ui = u[i] || S1(0); s.set(`u${i + 1}`, { cls: 'double', dims: [ui.length, 1], re: ui, im: null }); }
    let v;
    try { v = B.interp.evalExpr(text, s); } catch (e) { throw new MError('sim:if:expr', `Condition '${text}': ${e.message}`); }
    if (!v || !v.re || !v.re.length) return false;
    for (let i = 0; i < v.re.length; i++) if (!v.re[i]) return false;
    return true;
  };
}
const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export const BLOCKS = [
  def('Subsystem', G, 'Subsystem', '서브시스템', {
    desc: L('Groups blocks into a system. Double-click to open; add Enable, Trigger, Action Port or an iterator block inside to make it conditional.', '블록을 하나의 시스템으로 묶습니다. 두 번 클릭해 엽니다. 내부에 Enable/Trigger/Action Port/반복 블록을 넣으면 조건부 실행이 됩니다.'),
    params: [boolP('TreatAsAtomicUnit', false, 'Treat as atomic unit', '원자 단위로 처리')],
    size: [90, 50], ports: subsystemPorts, icon: (p, b) => ({ glyph: 'subsystem', text: b && b.system && b.system.blocks.some((x) => x.type === 'ForIterator') ? 'for { … }' : b && b.system && b.system.blocks.some((x) => x.type === 'WhileIterator') ? 'while { … }' : '' }),
    template: subsystemTemplate, extra: { role: 'subsystem' },
  }),
  def('Inport', G, 'In', '입력 포트', {
    desc: L('Input port of a subsystem, or an external input of the model (root level).', '서브시스템의 입력 포트 또는 모델의 외부 입력(최상위).'),
    params: [numP('Port', '1', 'Port number', '포트 번호', { min: 1, step: 1 }), numP('PortDimensions', '-1', 'Port dimensions (-1 = inherited)', '포트 차원 (-1 = 상속)'), TS('-1'), boolP('Interpolate', true, 'Interpolate external input', '외부 입력 보간')],
    size: [30, 16], ports: { in: 0, out: 1 }, shape: 'port', icon: (p) => ({ text: String(p.Port || '1') }),
    extra: { role: 'inport' },
    make(B) {
      const k = Math.max(1, B.int('Port', 1));
      const dim = B.num('PortDimensions', -1);
      const w = dim > 0 ? Math.round(dim) : 1;
      const interp = B.bool('Interpolate');
      let y = F(w);
      return {
        ts: B.num('SampleTime', -1) === -1 ? 0 : (() => { const a = B.arr('SampleTime'); return a[0] > 0 ? [a[0], a[1] || 0] : a[0]; })(),
        direct: false,
        init() { y = F(w); },
        output(S) {
          const ext = S.run && S.run.extInput;
          if (!ext || !ext.t.length) return [y];
          const cols = ext.cols[k - 1];
          if (!cols) return [y];
          const t = S.t, tt = ext.t;
          const out = F(cols.length);
          let i = 0;
          while (i + 1 < tt.length && tt[i + 1] <= t) i++;
          for (let c = 0; c < cols.length; c++) {
            const col = cols[c];
            if (t <= tt[0]) out[c] = col[0];
            else if (i >= tt.length - 1) out[c] = col[tt.length - 1];
            else if (!interp) out[c] = col[i];
            else { const f = (t - tt[i]) / (tt[i + 1] - tt[i] || 1); out[c] = col[i] + f * (col[i + 1] - col[i]); }
          }
          return [out];
        },
      };
    },
  }),
  def('Outport', G, 'Out', '출력 포트', {
    desc: L('Output port of a subsystem, or a model output logged to yout (root level). In a conditional subsystem it holds or resets its value while disabled.', '서브시스템의 출력 포트 또는 yout에 기록되는 모델 출력(최상위). 조건부 서브시스템에서는 비활성 동안 값을 유지하거나 초기화합니다.'),
    params: [numP('Port', '1', 'Port number', '포트 번호', { min: 1, step: 1 }), enumP('OutputWhenDisabled', 'held', 'Output when disabled', '비활성 시 출력', [{ value: 'held', label: L('held', '유지') }, { value: 'reset', label: L('reset', '초기화') }]), numP('InitialOutput', '0', 'Initial output', '초기 출력')],
    size: [30, 16], ports: { in: 1, out: 0 }, shape: 'port', icon: (p) => ({ text: String(p.Port || '1') }),
    extra: { role: 'outport' },
    make(B) {
      const ic = B.arr('InitialOutput');
      const y0 = ic.length ? ic : S1(0);
      const reset = B.opt('OutputWhenDisabled') === 'reset';
      return { ts: -1, y0: () => [copy(y0)], output: (S, u) => [u[0] && u[0].bus ? u[0] : copy(u[0])], disable: () => (reset ? [copy(y0)] : null) };
    },
  }),
  def('EnablePort', G, 'Enable', '활성화 포트', {
    desc: L('Makes the subsystem run only while the enable signal is positive.', '활성화 신호가 양수일 때만 서브시스템을 실행합니다.'),
    params: [enumP('StatesWhenEnabling', 'held', 'States when enabling', '활성화 시 상태', [{ value: 'held', label: L('held', '유지') }, { value: 'reset', label: L('reset', '초기화') }])],
    size: [30, 30], ports: { in: 0, out: 0 }, icon: () => ({ glyph: 'enable' }), extra: { role: 'enableport' },
  }),
  def('TriggerPort', G, 'Trigger', '트리거 포트', {
    desc: L('Runs the subsystem once at each rising, falling or either edge of the trigger signal.', '트리거 신호의 상승/하강/양쪽 에지마다 서브시스템을 한 번 실행합니다.'),
    params: [enumP('TriggerType', 'rising', 'Trigger type', '트리거 종류', [{ value: 'rising', label: L('rising', '상승') }, { value: 'falling', label: L('falling', '하강') }, { value: 'either', label: L('either', '양쪽') }])],
    size: [30, 30], ports: { in: 0, out: 0 }, icon: () => ({ glyph: 'trigger' }), extra: { role: 'triggerport' },
  }),
  def('ActionPort', G, 'Action Port', '동작 포트', {
    desc: L('Makes the subsystem an action subsystem driven by an If or Switch Case block.', 'If 또는 Switch Case 블록이 구동하는 동작 서브시스템으로 만듭니다.'),
    params: [enumP('InitializeStates', 'held', 'States when execution is resumed', '실행 재개 시 상태', [{ value: 'held', label: L('held', '유지') }, { value: 'reset', label: L('reset', '초기화') }]), P('ActionType', 'text', 'if', 'Action type', '동작 종류', { tab: 'advanced' })],
    size: [50, 30], ports: { in: 0, out: 0 }, icon: () => ({ text: 'Action' }), extra: { role: 'actionport' },
  }),
  def('ForIterator', G, 'For Iterator', 'For 반복', {
    desc: L('Runs the subsystem it is placed in N times per time step; outputs the iteration number.', '들어 있는 서브시스템을 시간 스텝마다 N번 실행하고 반복 번호를 출력합니다.'),
    params: [numP('NumberOfIterations', '5', 'Iteration limit', '반복 횟수', { min: 0, step: 1 }), enumP('ResetStates', 'held', 'States when starting', '시작 시 상태', [{ value: 'held', label: L('held', '유지') }, { value: 'reset', label: L('reset', '초기화') }]), enumP('IndexMode', 'one', 'Index mode', '인덱스 모드', [{ value: 'one', label: L('One-based', '1부터') }, { value: 'zero', label: L('Zero-based', '0부터') }])],
    size: [50, 40], ports: { in: 0, out: 1 }, icon: (p) => ({ text: `1:${p.NumberOfIterations || 'N'}` }), extra: { role: 'foriter' },
    make(B) {
      const N = Math.max(0, B.int('NumberOfIterations', 1));
      const zero = B.opt('IndexMode') === 'zero';
      const reset = B.opt('ResetStates') === 'reset';
      let i = 1;
      return { ts: 0, direct: false, count: () => N, setIndex(k) { i = k; }, resetEachStep: () => reset, output: () => [S1(zero ? i - 1 : i)] };
    },
  }),
  def('WhileIterator', G, 'While Iterator', 'While 반복', {
    desc: L('Repeats the subsystem it is placed in while the condition input is true (at most the iteration limit).', '조건 입력이 참인 동안 들어 있는 서브시스템을 반복합니다(최대 반복 한도).'),
    params: [numP('MaxIters', '100', 'Maximum iterations', '최대 반복 횟수', { min: 1, step: 1 }), enumP('WhileBlockType', 'do-while', 'While loop type', '반복 종류', ['do-while', 'while']), boolP('InitialCondition', true, 'Initial condition (while)', '초기 조건 (while)'), enumP('ResetStates', 'held', 'States when starting', '시작 시 상태', [{ value: 'held', label: L('held', '유지') }, { value: 'reset', label: L('reset', '초기화') }])],
    size: [60, 40], ports: { in: 1, out: 1 }, icon: () => ({ text: 'while' }), extra: { role: 'whileiter' },
    make(B) {
      const max = Math.max(1, B.int('MaxIters', 100));
      const pre = B.opt('WhileBlockType') === 'while';
      const ic = B.bool('InitialCondition');
      const reset = B.opt('ResetStates') === 'reset';
      let i = 1;
      return { ts: 0, direct: false, count: () => (pre && !ic ? 0 : max), setIndex(k) { i = k; }, cond: (S, u) => !!(u[0] && u[0][0]), resetEachStep: () => reset, output: () => [S1(i)] };
    },
  }),
  def('If', G, 'If', 'If', {
    desc: L('Evaluates if / elseif conditions on u1, u2, … and sends an action signal to the matching action subsystem.', 'u1, u2, …에 대한 if/elseif 조건을 평가하여 해당 동작 서브시스템에 동작 신호를 보냅니다.'),
    params: [numP('NumInputs', '1', 'Number of inputs', '입력 개수', { min: 1, step: 1 }), P('IfExpression', 'text', 'u1 > 0', 'If expression', 'If 식'), P('ElseIfExpressions', 'text', '', 'Elseif expressions (comma separated)', 'Elseif 식 (쉼표 구분)'), boolP('ShowElse', true, 'Show else condition', 'else 조건 표시')],
    size: [70, 60],
    ports: (p) => { const n = 1 + splitList(p.ElseIfExpressions).length + (String(p.ShowElse || 'on') === 'on' ? 1 : 0); return { in: Math.max(1, Math.round(Number(p.NumInputs) || 1)), out: n, outLabels: ['if', ...splitList(p.ElseIfExpressions).map(() => 'elseif'), ...(String(p.ShowElse || 'on') === 'on' ? ['else'] : [])] }; },
    icon: () => ({ text: 'if { }' }),
    make(B) {
      const nIn = Math.max(1, B.int('NumInputs', 1));
      const conds = [B.str('IfExpression'), ...splitList(B.str('ElseIfExpressions'))].map((s) => condFn(B, s, nIn));
      const els = B.bool('ShowElse');
      const n = conds.length + (els ? 1 : 0);
      return {
        ts: -1,
        y0: () => Array.from({ length: n }, () => S1(0)),
        output(S, u) {
          const y = Array.from({ length: n }, () => S1(0));
          let k = conds.findIndex((c) => c(u));
          if (k < 0 && els) k = conds.length;
          if (k >= 0) y[k] = S1(1);
          return y;
        },
      };
    },
  }),
  def('SwitchCase', G, 'Switch Case', 'Switch Case', {
    desc: L('Compares the rounded input with case values and sends an action signal to the matching action subsystem.', '반올림한 입력을 case 값과 비교하여 해당 동작 서브시스템에 동작 신호를 보냅니다.'),
    params: [P('CaseConditions', 'expr', '{1, 2}', 'Case conditions (cell array)', 'Case 조건 (셀 배열)'), boolP('ShowDefaultCase', true, 'Show default case', 'default case 표시')],
    size: [70, 60],
    ports: (p) => { const m = /^\s*\{(.*)\}\s*$/.exec(String(p.CaseConditions || '')); const k = m ? Math.max(1, m[1].split(/,(?![^[]*\])/).filter((x) => x.trim()).length) : 1; return { in: 1, out: k + (String(p.ShowDefaultCase || 'on') === 'on' ? 1 : 0) }; },
    icon: () => ({ text: 'switch' }),
    make(B) {
      const v = B.val('CaseConditions');
      const cases = (isCell(v) ? v.data : [v]).map((c) => (isTensor(c) ? Array.from(c.re) : []));
      const dflt = B.bool('ShowDefaultCase');
      const n = cases.length + (dflt ? 1 : 0);
      return {
        ts: -1,
        y0: () => Array.from({ length: n }, () => S1(0)),
        output(S, u) {
          const x = Math.round(u[0] ? u[0][0] : 0);
          const y = Array.from({ length: n }, () => S1(0));
          let k = cases.findIndex((c) => c.includes(x));
          if (k < 0 && dflt) k = cases.length;
          if (k >= 0) y[k] = S1(1);
          return y;
        },
      };
    },
  }),
];

export const LIBRARY_EXTRA = Object.entries(VARIANTS).filter(([k]) => k).map(([k, v]) => ({
  id: `Subsystem.${k}`, type: 'Subsystem', group: G, label: v.label, variant: k, params: v.params,
  desc: L(`${v.label.en}: a subsystem with ${v.ctl ? [].concat(v.ctl).join(' + ') : 'atomic execution'}.`, `${v.label.ko}`),
}));

export { subsystemTemplate };
