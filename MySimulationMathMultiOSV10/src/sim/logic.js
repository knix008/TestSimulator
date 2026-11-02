// Pure helpers of the block-diagram editor (no React, no DOM): tested by test/sim-gui.test.mjs.

/** −/+ on the zoom stepper move to the next multiple of 10 %; a typed value is taken as is. */
export const stepZoom = (cur, v) => (v === cur + 1 ? Math.floor(cur / 10) * 10 + 10 : v === cur - 1 ? Math.max(10, Math.ceil(cur / 10) * 10 - 10) : v);

/** A model save path always ends in one of `exts` ("pendulum" → "pendulum.smdl"; other extensions get one added). */
export function withModelExt(p, exts = ['.smdl']) {
  const s = String(p || '').trim();
  if (!s) return s;
  const name = s.replace(/^.*[\\/]/, '').toLowerCase();
  return exts.some((e) => name.endsWith(e.toLowerCase()) && name.length > e.length) ? s : `${s}${exts[0]}`;
}

/**
 * The hover description of a block on the canvas: its name, its kind (mask type, 서브시스템 or the
 * library label, left out when it repeats the name) and what it does (mask description or the
 * library description). def = blockDef(block.type); label / desc are [en, ko] or text, read with lbl.
 */
export function blockTipInfo(block, def, { lbl, subsystem }) {
  const m = block.mask || null;
  const type = m && m.type ? m.type : block.system ? subsystem : def ? lbl(def.label) : block.type;
  const text = m && m.description ? m.description : def ? lbl(def.desc) || '' : '';
  return { title: block.name, sub: type && type !== block.name ? type : '', text };
}

/** 코드 보기 width limits: at least `min`, and the canvas beside it keeps `canvasMin` (libW: the library column, 0 when hidden). */
export const CODE_PANE = { min: 240, width: 440, canvasMin: 200 };
export const codePaneMax = (bodyW, libW = 0) => Math.max(CODE_PANE.min, Math.round(bodyW - libW - CODE_PANE.canvasMin));
export const codePaneWidth = (w, bodyW, libW = 0) => Math.max(CODE_PANE.min, Math.min(codePaneMax(bodyW, libW), Math.round(Number(w) || CODE_PANE.width)));

/** 수식으로 모델 만들기 examples: { ko, en, icon, text }. */
export const EQ_EXAMPLES = [
  { ko: '스프링–질량–감쇠기', en: 'Spring–mass–damper', icon: 'waves', text: "% x'' = (u - c x' - k x) / m\nm = 1; c = 0.5; k = 4\nx'' = -c/m*x' - k/m*x + u/m\nx(0) = 0\nx'(0) = 0" },
  { ko: '진자 (비선형)', en: 'Pendulum (nonlinear)', icon: 'lineCurve', text: "g = 9.81; L = 1\nth'' = -g/L*sin(th) - 0.2*th'\nth(0) = 1" },
  { ko: '반데르폴 진동자', en: 'Van der Pol oscillator', icon: 'waves', text: "mu = 1\nx'' = mu*(1 - x^2)*x' - x\nx(0) = 2" },
  { ko: '로렌츠 끌개', en: 'Lorenz attractor', icon: 'cube', text: "sigma = 10; rho = 28; beta = 8/3\nx' = sigma*(y - x)\ny' = x*(rho - z) - y\nz' = x*y - beta*z\nx(0) = 1" },
  { ko: '1차 시스템 + 출력', en: 'First order + output', icon: 'flow', text: "tau = 2\nx' = (u - x)/tau\ny = 3*x" },
  { ko: '2차 전달 함수', en: 'Second-order transfer function', icon: 'equation', text: 'wn = 2; zeta = 0.3\nG = wn^2/(s^2 + 2*zeta*wn*s + wn^2)' },
  { ko: 'PI 제어기 × 플랜트', en: 'PI controller × plant', icon: 'equation', text: 'C = 2 + 1/s\nP = 1/(s + 1)\nL = C*P' },
  { ko: '이산 전달 함수', en: 'Discrete transfer function', icon: 'hash', text: 'Ts = 0.1\nH = 0.5/(z - 0.5)' },
  { ko: '상태 공간', en: 'State space', icon: 'grid', text: 'A = [0 1; -4 -1]\nB = [0; 1]\nC = [1 0]\nD = 0\nx0 = [1; 0]' },
];

/** The eq2model call that builds equations as a new model: the text goes in as a cell, one line per element. */
export function eqCommand({ name = '', text, kind = 'auto', input = 'step', stopTime = '10' }) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  const args = [...(name ? [q(name)] : []), `{${lines.map(q).join(', ')}}`, `'Kind', ${q(kind)}`, `'Input', ${q(input)}`, `'StopTime', ${q(stopTime)}`];
  return `eq2model(${args.join(', ')});`;
}

/** Removes a segment (branch) from a line; returns false when the whole line went away. */
export function removeSeg(line, target) {
  if (line === target) return false;
  const rec = (seg) => {
    seg.branches = (seg.branches || []).filter((b) => b !== target);
    seg.branches.forEach(rec);
    seg.branches = seg.branches.filter((b) => b.dst || (b.branches && b.branches.length));
    if (!seg.dst && seg.branches.length === 1) {
      const b = seg.branches[0];
      seg.points = [...(seg.points || []), ...(b.points || [])];
      seg.dst = b.dst; seg.branches = b.branches || [];
    }
  };
  rec(line);
  return !!(line.dst || (line.branches && line.branches.length));
}

// Icons (src/components/Chrome.jsx names) for block option values, so every dropdown entry says what it is.
const ENUM_ICONS = [
  [/^round$/i, 'circleDot'], [/^rectangular$/i, 'layout'],
  [/^(sine|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|sincos)$/i, 'waves'],
  [/^(square|sawtooth|rectangular|hold|held|zero|floor|ceil|ceiling|fix|round|convergent|simplest|setting to zero|holding final value)$/i, 'plotStairs'],
  [/random/i, 'dice'],
  [/^(time|sample|rad\/sec|hertz)$/i, 'clock'],
  [/linear|interpolation|extrapolation|nearest|above|below|flat|clip/i, 'plotLine'],
  [/^separate$/i, 'layout'], [/^overlay$/i, 'layers'],
  [/structure|struct/i, 'database'], [/^array$/i, 'table'], [/timeseries/i, 'plotLine'],
  [/^(short|long|short e|long e|bank|hex|one-based|zero-based|1|2|last|one|all)$/i, 'hash'],
  [/^(rising|falling|either|level|reset|none)$/i, 'flow'],
  [/^(internal|external|port|dialog)$/i, 'link'],
  [/^(PID|PI|PD|P|I)$/, 'gauge'], [/^parallel$/i, 'branch'], [/^ideal$/i, 'target'], [/integration/i, 'stepIn'],
  [/^(oldest|newest)$/i, 'history'],
  [/matrix|element-wise|transpose|hermitian|vector|1-d array|customize/i, 'grid'],
  [/^(exp|log|10\^u|log10|magnitude\^2|sqrt|pow|conj|reciprocal|hypot|rem|mod|signedsqrt|rsqrt)$/i, 'code'],
  [/^(==|~=|<|<=|>=|>|isinf|isnan|isfinite)$|threshold/i, 'filter'],
  [/^(and|or|nand|nor|xor|nxor|not)$/i, 'gate'],
  [/^(min|max)$/i, 'chevronsUp'], [/^(left|right)$/i, 'move'],
  [/real|imag|magnitude|angle/i, 'target'],
  [/^error$/i, 'alert'], [/^warning$/i, 'alert'],
  [/^global$/i, 'globe'], [/^local$/i, 'lock'], [/^scoped$/i, 'eye'],
  [/while/i, 'refresh'],
];
export function enumIcon(value) {
  const v = String(value ?? '');
  for (const [re, icon] of ENUM_ICONS) if (re.test(v)) return icon;
  return 'list';
}

/**
 * Which run buttons work in a simulation state (the model toolbar and the 시뮬레이션 ribbon):
 *   idle / stopped / done / error → Run, Step;  compiling → Stop;  running → Pause, Stop;
 *   paused → Run (continue), Pause (on), Step, Stop.  state null (no model open) → none.
 */
export function simButtons(state) {
  if (state == null) return { run: false, pause: false, step: false, stop: false, paused: false };
  const running = state === 'running', paused = state === 'paused', compiling = state === 'compiling';
  return { run: !running && !compiling, pause: running || paused, step: !running && !compiling, stop: running || paused || compiling, paused };
}
