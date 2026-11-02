// Keyword option sets of the Octave-style solvers (lsode_options,
// daspk_options, dassl_options, dasrt_options, quad_options). The values are
// kept per session in ctx.state.octaveOptions and read by the solvers.
import { num, str, toNum, isText, toStr, tensor } from '../../../value.js';
import { E, F, H, isEmptyV, fmtG } from '../_util.js';

const EPSQ = 1.4901161193847656e-8; // sqrt(eps)

/** kind: 'num' scalar, 'vec' numeric array, 'str' one of `choices`. */
export const OPTION_SETS = {
  lsode: [
    ['absolute tolerance', 'vec', EPSQ],
    ['relative tolerance', 'num', EPSQ],
    ['integration method', 'str', 'stiff', ['adams', 'bdf', 'non-stiff', 'stiff']],
    ['initial step size', 'num', -1],
    ['maximum order', 'num', -1],
    ['maximum step size', 'num', -1],
    ['minimum step size', 'num', 0],
    ['step limit', 'num', 100000],
    ['jacobian type', 'str', 'full', ['full', 'banded', 'diagonal']],
    ['lower jacobian subdiagonals', 'num', 0],
    ['upper jacobian subdiagonals', 'num', 0],
  ],
  daspk: [
    ['absolute tolerance', 'vec', EPSQ],
    ['relative tolerance', 'vec', EPSQ],
    ['compute consistent initial condition', 'num', 0],
    ['use initial condition heuristics', 'num', 0],
    ['initial condition heuristics', 'vec', 0],
    ['print initial condition info', 'num', 0],
    ['exclude algebraic variables from error test', 'num', 0],
    ['algebraic variables', 'vec', 0],
    ['enforce inequality constraints', 'num', 0],
    ['inequality constraint types', 'vec', 0],
    ['initial step size', 'num', -1],
    ['maximum order', 'num', -1],
    ['maximum step size', 'num', -1],
  ],
  dassl: [
    ['absolute tolerance', 'vec', EPSQ],
    ['relative tolerance', 'vec', EPSQ],
    ['compute consistent initial condition', 'num', 0],
    ['enforce nonnegativity constraints', 'num', 0],
    ['initial step size', 'num', -1],
    ['maximum order', 'num', -1],
    ['maximum step size', 'num', -1],
    ['step limit', 'num', -1],
  ],
  dasrt: [
    ['absolute tolerance', 'vec', EPSQ],
    ['relative tolerance', 'vec', EPSQ],
    ['initial step size', 'num', -1],
    ['maximum order', 'num', -1],
    ['maximum step size', 'num', -1],
    ['step limit', 'num', -1],
  ],
  quad: [
    ['absolute tolerance', 'num', EPSQ],
    ['relative tolerance', 'num', EPSQ],
    ['single precision absolute tolerance', 'num', 1e-5],
    ['single precision relative tolerance', 'num', 1e-5],
  ],
};

function store(ctx, set) {
  if (!ctx.state.octaveOptions) ctx.state.octaveOptions = {};
  const s = ctx.state.octaveOptions;
  if (!s[set]) s[set] = Object.fromEntries(OPTION_SETS[set].map(([k, kind, d]) => [k, kind === 'vec' ? [d].flat() : d]));
  return s[set];
}
/** Current value (JS number, number[] or string) of an option. */
export function getOption(ctx, set, key) { return store(ctx, set)[key]; }

function match(set, name, fn) {
  const s = name.toLowerCase().trim().replace(/\s+/g, ' ');
  const keys = OPTION_SETS[set].map((o) => o[0]);
  if (keys.includes(s)) return keys.indexOf(s);
  const c = keys.map((k, i) => [k, i]).filter(([k]) => k.startsWith(s));
  if (c.length === 1) return c[0][1];
  if (c.length > 1) throw E(`${fn}:ambiguous`, `${fn}: ambiguous option '${name}'.`);
  throw E(`${fn}:unknownOption`, `${fn}: no match for option '${name}'.`);
}
const toVal = (v) => (typeof v === 'string' ? str(v) : Array.isArray(v) ? (v.length === 1 ? num(v[0]) : tensor('double', [v.length, 1], Float64Array.from(v))) : num(v));
const fmt = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => fmtG(x, 6)).join(' ') : fmtG(v, 6));

/** Builds the builtin of an option set (e.g. lsode_options). */
export function optionsBuiltin(set, title) {
  const fn = `${set}_options`;
  return function opts(args, nargout, ctx) {
    const st = store(ctx, set);
    const defs = OPTION_SETS[set];
    if (args.length === 0) {
      if (nargout > 0) throw E(`${fn}:nargout`, `${fn}: an option name is needed to return a value.`);
      let t = `\nOptions for ${title} include:\n\n  keyword                                             value\n  -------                                             -----\n`;
      for (const [k] of defs) t += `  ${k.padEnd(52)}${fmt(st[k])}\n`;
      ctx.out(t + '\n');
      return undefined;
    }
    if (!isText(args[0])) throw E(`${fn}:badOption`, `${fn}: the option name must be a string.`);
    const idx = match(set, toStr(args[0]), fn);
    const [key, kind, , choices] = defs[idx];
    if (args.length === 1) return toVal(st[key]);
    if (args.length > 2) throw E(`${fn}:nargin`, `${fn}: expected ${fn}(name, value).`);
    const v = args[1];
    if (kind === 'str') {
      if (!isText(v)) throw E(`${fn}:badValue`, `${fn}: the value of '${key}' must be a string.`);
      const s = toStr(v).toLowerCase();
      const ok = choices.filter((c) => c.startsWith(s));
      if (!ok.length) throw E(`${fn}:badValue`, `${fn}: '${toStr(v)}' is not a valid value for '${key}' (${choices.join(', ')}).`);
      st[key] = choices.includes(s) ? s : ok[0];
    } else if (kind === 'num') {
      if (isEmptyV(v) || isText(v)) throw E(`${fn}:badValue`, `${fn}: the value of '${key}' must be a number.`);
      st[key] = toNum(v);
    } else {
      if (isText(v)) throw E(`${fn}:badValue`, `${fn}: the value of '${key}' must be numeric.`);
      st[key] = Array.from(F(v));
    }
    ctx.state.octaveOptions[`${set}:set`] = true;
    return undefined;
  };
}

export const builtins = {
  lsode_options: optionsBuiltin('lsode', 'LSODE'),
  daspk_options: optionsBuiltin('daspk', 'DASPK'),
  dassl_options: optionsBuiltin('dassl', 'DASSL'),
  dasrt_options: optionsBuiltin('dasrt', 'DASRT'),
  quad_options: optionsBuiltin('quad', 'QUAD'),
};
const optHelp = (name, solver, ko) => H(`Query or set the options of ${solver}. Without arguments the current values are listed; with a keyword (unique abbreviations allowed) the value is returned; with a keyword and a value it is set for this session.`,
  `${ko} 의 옵션을 조회하거나 설정합니다. 인수가 없으면 현재 값을 나열하고, 키워드(고유한 약어 허용)만 주면 값을 돌려주며, 키워드와 값을 주면 이 세션에 설정합니다.`,
  [`${name}()`, `val = ${name}(opt)`, `${name}(opt, val)`]);
export const help = {
  lsode_options: optHelp('lsode_options', 'lsode (absolute/relative tolerance, integration method stiff|non-stiff, initial/maximum step size, maximum order …)', 'lsode (절대·상대 허용 오차, 적분 방법 stiff|non-stiff, 초기·최대 스텝, 최대 차수 등)'),
  daspk_options: optHelp('daspk_options', 'daspk (tolerances, consistent initial condition computation, algebraic variables, step sizes, maximum order)', 'daspk (허용 오차, 일관된 초기 조건 계산, 대수 변수, 스텝 크기, 최대 차수)'),
  dassl_options: optHelp('dassl_options', 'dassl (tolerances, consistent initial condition computation, non-negativity, step sizes, maximum order)', 'dassl (허용 오차, 일관된 초기 조건 계산, 비음수 제약, 스텝 크기, 최대 차수)'),
  dasrt_options: optHelp('dasrt_options', 'dasrt (tolerances, step sizes, maximum order)', 'dasrt (허용 오차, 스텝 크기, 최대 차수)'),
  quad_options: optHelp('quad_options', 'quad (once set, the absolute tolerance becomes the default tolerance of quad)', 'quad (설정하면 절대 허용 오차가 quad 의 기본 허용 오차가 됨)'),
};
