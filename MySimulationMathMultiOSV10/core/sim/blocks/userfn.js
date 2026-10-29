// User-Defined Functions: Fcn (an expression of u), M Function (an M-language
// function, run by the engine's own evaluator with persistent variables;
// unknown functions go to the full session library through ctx.call) and
// Interpreted M Function (a function name or expression applied to u).
import { def, L, P, numP, TS, tsOf, isBus, withDims } from './util.js';
import { Interp, Scope } from '../expr/interp.js';
import { MError, isTensor, isStruct, struct } from '../../value.js';

const G = 'userfn';
const DEFAULT_SCRIPT = 'function y = fcn(u)\n  y = u;\nend';

/** Signal → Value (column vector, matrix when the signal has dims, struct for a bus). */
export function toValue(sig) {
  if (isBus(sig)) {
    const r = Object.create(null);
    sig.names.forEach((n, i) => { r[n] = toValue(sig.signals[i]); });
    return struct([1, 1], sig.names.slice(), [r]);
  }
  const d = sig && sig.dims ? sig.dims.slice() : [sig ? sig.length : 1, 1];
  return { cls: 'double', dims: d, re: Float64Array.from(sig || [0]), im: null };
}
/** Value → signal. */
export function fromValue(v, what) {
  if (v == null) throw new MError('sim:userfn:noValue', `${what} did not return a value.`);
  if (isStruct(v) && v.data.length === 1) return { bus: true, names: v.fields.slice(), signals: v.fields.map((f) => fromValue(v.data[0][f], what)) };
  if (!isTensor(v) || v.cls === 'char') throw new MError('sim:userfn:type', `${what} must return numeric or logical values (got ${v.cls}).`);
  if (v.im && v.im.some((x) => x !== 0)) throw new MError('sim:userfn:complex', `${what} returned a complex value; complex signals are not supported.`);
  const y = Float64Array.from(v.re);
  return withDims(y, v.dims.length === 2 && v.dims[0] > 1 && v.dims[1] > 1 ? v.dims.slice() : null);
}

/** Parses the first function line: { name, ins, outs }. */
export function signature(src) {
  const m = /^\s*function\s+(?:(\[[^\]]*\]|[A-Za-z]\w*)\s*=\s*)?([A-Za-z]\w*)\s*(?:\(([^)]*)\))?/m.exec(String(src || ''));
  if (!m) return null;
  const list = (s) => String(s || '').replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean);
  return { name: m[2], outs: list(m[1]), ins: list(m[3]) };
}

/** An expression of u evaluated with the block's scope. */
function exprRuntime(B, text, what) {
  const src = String(text || '').trim();
  if (!src) B.err('The expression is empty.');
  const interp = B.interp;
  return (u) => {
    const s = new Scope(null, B.scope);
    s.set('u', toValue(u[0]));
    let v;
    try { v = interp.evalExpr(src, s); } catch (e) { throw new MError(e.identifier && String(e.identifier).startsWith('sim:') ? e.identifier : 'sim:userfn:eval', `${what} '${src}': ${e.message}`); }
    return fromValue(v, what);
  };
}

export const BLOCKS = [
  def('Fcn', G, 'Fcn', 'Fcn', {
    desc: L('Applies an expression of the input u (u(1), u(2), … for elements), e.g. sin(u(1))*exp(-u(2)).', '입력 u의 식을 적용합니다 (원소는 u(1), u(2), …), 예: sin(u(1))*exp(-u(2)).'),
    params: [P('Expr', 'text', 'sin(u(1))', 'Expression', '식'), TS('-1')],
    size: [70, 30], icon: (p) => ({ text: String(p.Expr || 'f(u)').length > 16 ? 'f(u)' : String(p.Expr || 'f(u)') }),
    make(B) { const f = exprRuntime(B, B.str('Expr'), 'Fcn'); return { ts: tsOf(B, -1), output: (S, u) => [f(u)] }; },
  }),
  def('MFunction', G, 'M Function', 'M 함수', {
    desc: L('An M-language function y = fcn(u, …) run at every time step; persistent variables keep state; other functions of the M language can be called.', '시간 스텝마다 실행되는 M 언어 함수 y = fcn(u, …). persistent 변수로 상태를 유지하고 M 언어의 다른 함수를 호출할 수 있습니다.'),
    params: [P('Script', 'code', DEFAULT_SCRIPT, 'Function', '함수'), TS('-1')],
    size: [70, 50],
    ports: (p) => { const s = signature(p.Script ?? DEFAULT_SCRIPT); return s ? { in: s.ins.length, out: s.outs.length, inLabels: s.ins, outLabels: s.outs } : { in: 1, out: 1 }; },
    icon: (p) => { const s = signature(p.Script ?? DEFAULT_SCRIPT); return { text: s ? s.name : 'fcn' }; },
    make(B) {
      const script = B.str('Script');
      const sig = signature(script);
      if (!sig) B.err('The script must start with a function definition, e.g. function y = fcn(u).');
      const interp = new Interp(B.ctx, { persist: new Map() });
      try { interp.run(script, new Scope(null, B.scope)); } catch (e) { B.err(`Syntax error: ${e.message}`); }
      if (!interp.funcs[sig.name]) B.err(`The function '${sig.name}' is not defined in the script.`);
      const nOut = sig.outs.length;
      const majorOnly = /\bpersistent\b/.test(script);
      let last = null;
      const call = (u) => {
        let r;
        try { r = interp.callUser(sig.name, u.map(toValue), nOut); } catch (e) { throw new MError(e.identifier && String(e.identifier).startsWith('sim:') ? e.identifier : 'sim:mfunction:error', `${sig.name}: ${e.message}`); }
        const out = [];
        for (let i = 0; i < nOut; i++) out.push(fromValue(r[i], `Output '${sig.outs[i]}' of ${sig.name}`));
        return out;
      };
      return {
        ts: tsOf(B, -1),
        init() { interp.persist = new Map(); last = null; },
        output(S, u) {
          if (!nOut) { if (S.major && !S.trial) call(u); return null; }
          if (majorOnly && S.minor && last) return last;
          const y = call(u);
          if (S.major) last = y;
          return y;
        },
      };
    },
  }),
  def('InterpretedFunction', G, 'Interpreted M Function', '해석형 M 함수', {
    desc: L('Applies an M-language function (a name such as sin, or an expression of u) to the input.', 'M 언어 함수(sin 같은 이름 또는 u의 식)를 입력에 적용합니다.'),
    params: [P('Function', 'text', 'sin(u)', 'Function or expression', '함수 또는 식'), numP('OutputDimensions', '-1', 'Output dimensions (-1 = same as input)', '출력 차원 (-1 = 입력과 같음)'), TS('-1')],
    size: [90, 30], icon: (p) => ({ text: String(p.Function || 'f(u)') }),
    make(B) {
      const txt = B.str('Function').trim();
      const f = exprRuntime(B, /^[A-Za-z][\w.]*$/.test(txt) ? `${txt}(u)` : txt, 'Interpreted M Function');
      const dim = B.num('OutputDimensions', -1);
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          const y = f(u);
          if (dim > 0 && y.length !== Math.round(dim) && !S.trial) throw new MError('sim:userfn:dims', `The function returned ${y.length} values; expected ${Math.round(dim)}.`);
          return [y];
        },
      };
    },
  }),
];
