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
