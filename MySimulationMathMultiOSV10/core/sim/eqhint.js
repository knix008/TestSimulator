// 수식 오류의 힌트: what to change when parseEquations fails, in Korean and English, and — when the
// change is clear — the corrected text (a fix). Every fix is tried before it is offered: the text must
// then build, or stop later (a later line, a later stage) with another message.
//
//   eqHints(text, error, { kind }) → [{ ko, en, fix?, preview? }]   (fix: the whole corrected text,
//                                                                     preview: its changed lines)
//   eqNotes(text, { kind })        → the same for text that builds but looks like a typo
//                                    (an input named like a state or parameter: kk, K for k …)
import { parseEquations, eqParts } from './eqmodel.js';

const { statements, parseStatement, print, varsOf, FUNCS, CONSTS, matText } = eqParts;

const H = (ko, en, fix = null) => ({ ko, en, fix });
const norm = (text) => String(text || '').replace(/\r\n?/g, '\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const primes = (d) => "'".repeat(d || 0);
const lead = (s) => /^\s*/.exec(s)[0];
const commentOf = (l) => { const m = /[%#].*$/.exec(l); return m ? m[0] : ''; };

/** Edit distance (insert, delete, change one letter). */
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
/**
 * The name in `names` that `name` is most likely a typo of: another case, or a letter or two apart
 * (short names: a letter apart only when one holds the other, kk → k; loose: any letter, sn → sin).
 */
export function nearestName(name, names, { loose = false } = {}) {
  const low = name.toLowerCase();
  let best = null, bd = Infinity;
  for (const c of names) {
    if (c === name) continue;
    const cl = c.toLowerCase();
    let d = cl === low ? 0 : lev(low, cl);
    if (name.length <= 2 && d === 1 && !loose && !cl.includes(low) && !low.includes(cl)) d = Infinity;
    if (d < bd) { bd = d; best = c; }
  }
  const max = name.length <= 4 ? 1 : 2;
  return best != null && bd <= max ? best : null;
}

// ---------------------------------------------------------------- text edits (null: cannot)
const linesOf = (t) => t.split('\n');
const lineStart = (ls, n) => { let o = 0; for (let i = 0; i < n - 1; i++) o += ls[i].length + 1; return o; };
/** The statement source on line n that `pred(parsed)` picks (first one when no pred). */
function stmtAt(t, n, pred = null) {
  for (const s of statements(t)) {
    if (s.line !== n) continue;
    if (!pred) return s;
    try { if (pred(parseStatement(s.src, s.line))) return s; } catch { /* not this one */ }
  }
  return null;
}
/** `src` (a statement starting on line n) replaced by `to`; the whole line when src was rewritten (dx/dt → x'). */
function replaceStatement(t, n, src, to) {
  const ls = linesOf(t);
  if (src && src.trim()) {
    const at = t.indexOf(src, lineStart(ls, n));
    if (at >= 0) return t.slice(0, at) + to + t.slice(at + src.length);
  }
  const l = ls[n - 1];
  if (l == null || l.replace(/[%#].*$/, '').includes(';')) return null;
  const c = commentOf(l);
  ls[n - 1] = lead(l) + to.trim() + (c ? `  ${c}` : '');
  return ls.join('\n');
}
/** The statement on line n turned into a comment (only it, when the line has others). */
function commentOut(t, n, pred = null) {
  const s = stmtAt(t, n, pred);
  if (!s) return null;
  const ls = linesOf(t);
  const l = ls[n - 1];
  if (l.replace(/[%#].*$/, '').trim().replace(/;$/, '').trim() === s.src.trim()) { ls[n - 1] = `% ${l}`; return ls.join('\n'); }
  const at = t.indexOf(s.src, lineStart(ls, n));
  if (at < 0) return null;
  let end = at + s.src.length;
  if (t[end] === ';') end++;
  return t.slice(0, at) + t.slice(end);
}
/** Whole-word renames of `from` (a name; primes after it stay), on line n or everywhere (n = 0). */
function rename(t, from, to, n = 0) {
  const re = new RegExp(`(?<![\\w])${esc(from)}(?![\\w])`, 'g');
  if (!n) return t.replace(re, () => to);
  const ls = linesOf(t);
  if (ls[n - 1] == null) return null;
  ls[n - 1] = ls[n - 1].replace(re, () => to);
  return ls.join('\n');
}
const insertLine = (t, n, s) => { const ls = linesOf(t); ls.splice(Math.max(0, n - 1), 0, s); return ls.join('\n'); };
const appendLine = (t, s) => (t.endsWith('\n') || !t ? t + s : `${t}\n${s}`);
/** `name = …` on line n with a new right side. */
function replaceDef(t, n, name, rhs) {
  const s = stmtAt(t, n, (p) => p.lhs && p.lhs.k === 'var' && p.lhs.name === name && !p.lhs.d);
  return s ? replaceStatement(t, n, s.src, `${lead(s.src)}${name} = ${rhs}`) : null;
}

/** Names on the left of every statement that parses (states, definitions). */
function definedNames(t) {
  const out = { states: [], defs: [] };
  for (const s of statements(t)) {
    try {
      const { lhs } = parseStatement(s.src, s.line);
      if (lhs && lhs.k === 'var') (lhs.d ? out.states : out.defs).push(lhs.name);
    } catch { /* skipped */ }
  }
  return out;
}

// ---------------------------------------------------------------- solving for the derivative
// -(k*x) is written -k*x: the sign goes on the first factor
const negate = (n) => (n.k === 'neg' ? n.a : n.k === 'num' ? { k: 'num', v: -n.v }
  : n.k === 'bin' && (n.op === '*' || n.op === '/') ? { ...n, a: negate(n.a) } : { k: 'neg', a: n });
/**
 * L = R rewritten with the highest derivative alone on the left ("x'' + c*x' = u" → "x'' = u - c*x'"),
 * when it appears once as a plain factor of one term; else null.
 */
export function isolateDerivative(L, R) {
  const top = (n) => varsOf(n).filter((v) => v.d && !v.bad).reduce((a, v) => (!a || v.d > a.d ? v : a), null);
  let tl = top(L);
  const tr = top(R);
  if (!tl && !tr) return null;
  if (!tl || (tr && tr.d > tl.d)) { [L, R] = [R, L]; tl = tr; }
  const target = tl;
  const has = (n) => varsOf(n).some((v) => v.name === target.name && v.d === target.d);
  const terms = [];
  const split = (n, s) => {
    if (n.k === 'bin' && (n.op === '+' || n.op === '-')) { split(n.a, s); split(n.b, n.op === '-' ? -s : s); } else if (n.k === 'neg') split(n.a, -s);
    else terms.push({ s, n });
  };
  split(L, 1);
  const mine = terms.filter((x) => has(x.n));
  if (mine.length !== 1) return null;
  const num = [], den = [];
  let sign = mine[0].s;
  const fac = (n, up) => {
    if (n.k === 'bin' && n.op === '*') { fac(n.a, up); fac(n.b, up); } else if (n.k === 'bin' && n.op === '/') { fac(n.a, up); fac(n.b, !up); } else if (n.k === 'neg') { sign = -sign; fac(n.a, up); }
    else (up ? num : den).push(n);
  };
  fac(mine[0].n, true);
  const at = num.findIndex((n) => n.k === 'var' && n.name === target.name && n.d === target.d);
  if (at < 0) return null;
  num.splice(at, 1);
  if ([...num, ...den].some(has) || has(R)) return null;
  let sum = R.k === 'num' && R.v === 0 ? null : R;
  for (const x of terms) {
    if (x === mine[0]) continue;
    sum = sum ? { k: 'bin', op: x.s > 0 ? '-' : '+', a: sum, b: x.n } : (x.s > 0 ? negate(x.n) : x.n);
  }
  sum = sum || { k: 'num', v: 0 };
  if (sign < 0) sum = negate(sum);
  const prod = (list) => list.reduce((a, b) => (a ? { k: 'bin', op: '*', a, b } : b), null);
  const dn = prod(den), nm = prod(num);
  if (dn) sum = { k: 'bin', op: '*', a: sum, b: dn };
  if (nm) sum = { k: 'bin', op: '/', a: sum, b: nm };
  return `${target.name}${primes(target.d)} = ${print(sum)}`;
}

// ---------------------------------------------------------------- characters
const CHAR_FIX = {
  '×': '*', '·': '*', '⋅': '*', '∙': '*', '∗': '*', '÷': '/', '−': '-', '–': '-', '—': '-', '²': '^2', '³': '^3',
  '’': "'", '‘': "'", '′': "'", '`': "'", '´': "'", '″': "''", '"': "''", '{': '(', '}': ')', '\\': '/', ' ': ' ', '　': ' ',
};
const charFix = (c) => {
  if (c in CHAR_FIX) return CHAR_FIX[c];
  const code = c.charCodeAt(0);
  return code >= 0xff01 && code <= 0xff5e ? String.fromCharCode(code - 0xfee0) : null;   // full-width ＋（）…
};
const GREEK = Object.fromEntries(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', null, 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega']
  .flatMap((n, i) => (n ? [[String.fromCharCode(0x3b1 + i), n], [String.fromCharCode(0x391 + i), n[0].toUpperCase() + n.slice(1)]] : [])));
GREEK['ς'] = 'sigma';
/** Greek letters spelled out (θ → theta), keeping a following letter apart (θ1 → theta1, 2ω → 2*omega stays implicit). */
const spellGreek = (t) => t.replace(/[Α-Ωα-ω]/g, (c) => GREEK[c] || c);
const ALIAS = { ln: 'log', arcsin: 'asin', arccos: 'acos', arctan: 'atan', sgn: 'sign', pow: 'power', tg: 'tan', sqr: 'sqrt', root: 'sqrt', lg: 'log10' };
const FORMS_KO = "미분방정식 x' = -x, 전달 함수 G = 1/(s + 1), 상태 공간 A = …, B = …, C = …, D = …";
const FORMS_EN = "differential equations x' = -x, a transfer function G = 1/(s + 1), or state space A = …, B = …, C = …, D = …";

/** Parentheses (or brackets) of src: the ones left open, and src with the unmatched closing ones removed. */
function balance(src, open, close) {
  let depth = 0, out = '';
  for (const c of src) {
    if (c === open) depth++;
    if (c === close) { if (!depth) continue; depth--; }
    out += c;
  }
  return { open: depth, cleaned: out };
}
/** Decimal commas (1,5 → 1.5) outside parentheses and brackets; null when there are none. */
function decimalPoints(src) {
  let depth = 0, out = '', hit = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && !depth && /\d/.test(src[i - 1] || '') && /\d/.test(src[i + 1] || '')) { out += '.'; hit = true; continue; }
    out += c;
  }
  return hit ? out : null;
}

// ---------------------------------------------------------------- hints
const STAGE = { syntax: 0, empty: 0, lhs: 1, dup: 1, kind: 1 };
const stage = (e) => STAGE[String(e.identifier || '').replace(/^sim:eq:/, '')] ?? 2;
/** A fix counts when the text then builds, or fails later (a later line or stage) with another message. */
function improves(text, fix, e, kind) {
  if (fix == null || fix === text) return false;
  try { parseEquations(fix, { kind }); return true; } catch (f) {
    if (f.message === e.message) return false;
    const a = (e.extra && e.extra.line) || 0, b = (f.extra && f.extra.line) || 0;
    return b > a || stage(f) > stage(e) || (a === 0 && stage(f) >= stage(e));
  }
}
/** The changed lines of a fix (at most three), to show next to its button. */
function previewOf(text, fix) {
  const a = linesOf(text), b = linesOf(fix);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length - 1, jb = b.length - 1;
  while (ja >= i && jb >= i && a[ja] === b[jb]) { ja--; jb--; }
  const out = b.slice(i, jb + 1).map((l) => l.trim()).filter(Boolean);
  return out.length ? out.slice(0, 3).join('\n') + (out.length > 3 ? '\n…' : '') : null;
}

/** Suggestions for an error thrown by parseEquations (or equationModel) on `text`. */
export function eqHints(text, e, { kind = 'auto' } = {}) {
  if (!e) return [];
  const t = norm(text);
  const x = e.extra || {};
  const id = String(e.identifier || '').replace(/^sim:eq:/, '');
  const line = x.line || 0;
  const out = [];
  const add = (h) => {
    if (!h || out.some((o) => o.en === h.en)) return;
    if (h.fix != null && !improves(t, h.fix, e, kind)) h = { ...h, fix: null };
    if (h.fix != null) h.preview = previewOf(t, h.fix);
    out.push(h);
  };

  // x(t), y'(t): the time argument is never written
  const timeArg = /(?<![\w])([A-Za-z_]\w*)('*)\(\s*t\s*\)/g;
  const timed = [...t.matchAll(timeArg)].map((m) => m[1]).filter((n) => !FUNCS.has(n));
  if (timed.length && id !== 'ss') {
    const n = timed[0];
    add(H(`신호에는 시간 인수를 붙이지 않습니다: ${n}(t) → ${n}`, `Leave out the time argument: ${n}(t) → ${n}`,
      t.replace(timeArg, (m, f, p) => (FUNCS.has(f) ? m : f + p))));
  }

  if (id === 'syntax') syntaxHints(t, x, line, add);
  else if (id === 'lhs') {
    if (x.ss) add(H('상태 공간은 A = [0 1; -2 -3]처럼 이름 = 행렬로 씁니다 (A, B, C, D, x0).', 'Write state space as name = matrix, e.g. A = [0 1; -2 -3] (A, B, C, D, x0).'));
    else {
      const solved = x.rhs && isolateDerivative(x.bare ? x.rhs : x.lhs, x.bare ? { k: 'num', v: 0 } : x.rhs);
      if (solved) {
        add(H(`가장 높은 미분을 왼쪽에 혼자 두세요: ${solved}`, `Put the highest derivative alone on the left: ${solved}`,
          replaceStatement(t, line, x.src, lead(x.src || '') + solved)));
      } else if (x.lhs && x.lhs.k === 'call' && x.lhs.args.length === 1 && x.lhs.args[0].k === 'num') {
        add(H(`초기값은 t = 0일 때만 줍니다: ${x.lhs.name}${primes(x.lhs.d)}(0) = …`, `Initial values are given at t = 0 only: ${x.lhs.name}${primes(x.lhs.d)}(0) = …`));
      } else if (x.bare) {
        add(H("식은 이름 = … 로 씁니다. 미분방정식이면 x' = …", "Write equations as name = …; a differential equation as x' = …"));
      } else if (!out.some((h) => h.fix)) {
        add(H("왼쪽에는 이름(y = …), 미분(x' = …), 초기값(x(0) = …) 중 하나만 씁니다. 나머지 항은 오른쪽으로 옮기세요.",
          "The left side is a name (y = …), a derivative (x' = …) or an initial value (x(0) = …); move the other terms to the right."));
      }
    }
  } else if (id === 'dup') {
    const n = x.name;
    if (x.why === 'ode') {
      add(H(`${n}의 미분방정식이 ${x.first}행과 ${line}행에 있습니다. 하나만 남기세요 (${line}행을 주석으로 바꿉니다).`,
        `${n} has differential equations on lines ${x.first} and ${line}; keep one (this comments out line ${line}).`,
        commentOut(t, line, (p) => p.lhs && p.lhs.k === 'var' && p.lhs.name === n && p.lhs.d > 0)));
    } else if (x.why === 'def') {
      add(H(`${n}이(가) ${x.first}행과 ${line}행에서 정의됩니다. 하나만 남기세요 (앞의 ${x.first}행을 주석으로 바꿉니다).`,
        `${n} is defined on lines ${x.first} and ${line}; keep one (this comments out line ${x.first}).`,
        commentOut(t, x.first, (p) => p.lhs && p.lhs.k === 'var' && p.lhs.name === n && !p.lhs.d)));
    } else if (x.why === 'statedef') {
      const constant = x.rhs && varsOf(x.rhs).every((v) => !v.d && v.name !== n);
      const s = stmtAt(t, line, (p) => p.lhs && p.lhs.k === 'var' && p.lhs.name === n && !p.lhs.d);
      if (constant && s) {
        add(H(`${n}은(는) 미분방정식이 있는 상태입니다. 초기값이라면 ${n}(0) = ${print(x.rhs)} 로 씁니다.`,
          `${n} is a state (it has a differential equation); an initial value is written ${n}(0) = ${print(x.rhs)}.`,
          replaceStatement(t, line, s.src, s.src.replace(new RegExp(`^(\\s*)${esc(n)}(\\s*=)`), (m, a, b) => `${a}${n}(0)${b}`))));
      } else {
        add(H(`${n}은(는) 상태라서 다시 정의할 수 없습니다. 이 신호에는 다른 이름을 쓰세요 (예: ${n}_out = …).`,
          `${n} is a state and cannot be defined again; give this signal another name (e.g. ${n}_out = …).`));
      }
    }
  } else if (id === 'deriv') {
    const n = x.name, d = primes(x.d);
    if (x.why === 'notstate') {
      const near = nearestName(n, x.states || []);
      if (near) add(H(`${n}${d}의 미분방정식은 없습니다. 상태 ${near}을(를) 뜻했나요? (${n}${d} → ${near}${d})`, `${n}${d} has no differential equation. Did you mean the state ${near}? (${n}${d} → ${near}${d})`, rename(t, n, near, line)));
      else if ((x.signals || []).includes(n)) add(H(`${n}은(는) 신호(${n} = …)라서 미분이 없습니다. 미분이 필요하면 ${n}을(를) 상태로 두고 ${n}' = … 로 쓰세요.`, `${n} is a signal (${n} = …), which has no derivative; to use one, make ${n} a state with ${n}' = ….`));
      else add(H(`${n}의 미분방정식이 없습니다. ${n}${d.slice(1)}' = … 식을 추가하거나 미분 기호(')를 빼세요.`, `There is no differential equation for ${n}; add ${n}' = … or leave out the prime (').`));
    } else if (x.why === 'higher') {
      add(H(`${n}의 식은 ${n}${primes(x.order)} = … 입니다. ${n}${d}을(를) 쓰려면 식을 ${n}${d} = … 로 올리세요.`, `The equation of ${n} is ${n}${primes(x.order)} = …; to use ${n}${d}, raise it to ${n}${d} = ….`));
    } else {
      add(H('함수에는 미분 기호를 붙일 수 없습니다. 미분할 양을 상태로 두고 식을 세우세요.', 'A function cannot take a prime; make the quantity a state and write its equation.'));
    }
  } else if (id === 'func') {
    const n = x.name;
    const near = ALIAS[n.toLowerCase()] || nearestName(n, [...FUNCS], { loose: true });
    const callRe = new RegExp(`(?<![\\w])${esc(n)}(?=\\s*\\()`, 'g');
    const onLine = (f) => { const ls = linesOf(t); if (ls[line - 1] == null) return null; ls[line - 1] = ls[line - 1].replace(callRe, f); return ls.join('\n'); };
    if (near && FUNCS.has(near)) add(H(`${n} 함수는 없습니다. ${near}을(를) 뜻했나요?`, `There is no function ${n}. Did you mean ${near}?`, onLine(() => near)));
    const names = new Set([...(x.known || []), ...definedNames(t).defs, ...definedNames(t).states]);
    if (names.has(n) || n.length === 1) add(H(`${n}(…)은 함수 호출로 읽힙니다. 곱셈이면 ${n}*(…)로 쓰세요.`, `${n}(…) reads as a function call; for a product write ${n}*(…).`, onLine(() => `${n}*`)));
    if (!out.some((h) => h.fix)) add(H(`쓸 수 있는 함수: ${[...FUNCS].join(', ')}`, `Functions you can use: ${[...FUNCS].join(', ')}`));
  } else if (id === 'const') {
    const n = x.name;
    if (x.why === 'value') {
      const near = nearestName(n, [...definedNames(t).defs, 's', 'z', ...Object.keys(CONSTS)]);
      if (near) add(H(`${n}의 값이 없습니다. ${near}을(를) 뜻했나요?`, `${n} has no value. Did you mean ${near}?`, rename(t, n, near)));
      add(H(`${n}의 값이 없습니다. 맨 위에 ${n} = 1 처럼 값을 정하세요 (1은 임시 값입니다).`, `${n} has no value; define it at the top, e.g. ${n} = 1 (1 is a placeholder).`, insertLine(t, 1, `${n} = 1`)));
    } else if (x.d) {
      add(H('여기에는 미분이 아닌 상수(숫자나 매개변수)만 씁니다.', 'Only constants (numbers or parameters) go here, not derivatives.'));
    } else add(H('여기에는 숫자 하나가 와야 합니다.', 'A single number goes here.'));
  } else if (id === 'dims') dimsHints(t, x, line, add);
  else if (id === 'ss') {
    if (x.missing) {
      const n = matrixRows(t, 'A');
      const tpl = x.missing === 'B' ? (n > 1 ? `[${new Array(n - 1).fill('0').join('; ')}; 1]` : '1')
        : x.missing === 'C' ? (n > 1 ? `[1 ${new Array(n - 1).fill('0').join(' ')}]` : '1') : null;
      if (tpl && n) add(H(`상태 공간에는 ${x.missing}이(가) 필요합니다. 예: ${x.missing} = ${tpl}`, `State space needs ${x.missing}, e.g. ${x.missing} = ${tpl}`, appendLine(t, `${x.missing} = ${tpl}`)));
      else add(H(`상태 공간에는 ${x.missing}이(가) 필요합니다 (A, B, C와 선택으로 D, x0).`, `State space needs ${x.missing} (A, B, C and optionally D, x0).`));
    } else add(H('샘플 시간 Ts는 0보다 커야 합니다 (예: Ts = 0.1).', 'The sample time Ts must be above 0 (e.g. Ts = 0.1).'));
  } else if (id === 'tf') tfHints(t, x, line, add);
  else if (id === 'loop') {
    add(H(`${x.names.join(' → ')}이(가) 서로를 읽습니다. 하나를 미분방정식(상태)으로 바꾸거나, 대입해서 한 식으로 쓰세요.`,
      `${x.names.join(' → ')} read each other; make one of them a state (a differential equation) or substitute to write one equation.`));
  } else if (id === 'ic') {
    const n = x.name, d = primes(x.d);
    if (x.why === 'noode') {
      const near = nearestName(n, x.states || []);
      if (near) add(H(`${n}에는 미분방정식이 없습니다. 상태 ${near}을(를) 뜻했나요?`, `${n} has no differential equation. Did you mean the state ${near}?`, rename(t, n, near, line)));
      else add(H(`${n}에는 미분방정식이 없어 초기값을 줄 수 없습니다. ${n}' = … 를 추가하거나 이 줄을 지우세요 (주석으로 바꿉니다).`,
        `${n} has no differential equation, so it takes no initial value; add ${n}' = … or remove this line (this comments it out).`, commentOut(t, line)));
    } else if (x.why === 'order') {
      add(H(`${n}${primes(x.order)}은(는) 식이 정합니다. 초기값은 ${n}${x.order > 1 ? `(0) … ${n}${primes(x.order - 1)}(0)` : '(0)'}까지만 줍니다 (이 줄을 주석으로 바꿉니다).`,
        `${n}${primes(x.order)} comes from its equation; initial values go up to ${n}${primes(x.order - 1)}(0) (this comments the line out).`, commentOut(t, line)));
    } else {
      const defined = definedNames(t);
      const free = !defined.defs.includes(x.bad) && !defined.states.includes(x.bad);
      add(H(`${n}${d}(0)은 숫자나 매개변수로 씁니다. ${x.bad}을(를) 상수로 정하세요 (예: ${x.bad} = 1).`, `Write ${n}${d}(0) with numbers or parameters; define ${x.bad} as a constant (e.g. ${x.bad} = 1).`,
        free ? insertLine(t, 1, `${x.bad} = 1`) : null));
    }
  } else if (id === 'kind') kindHints(t, x, kind, add);
  else if (id === 'empty') add(H("예제를 고르거나 x' = -x 처럼 식을 쓰세요.", "Pick an example or write an equation such as x' = -x."));
  return out.slice(0, 4);
}

function syntaxHints(t, x, line, add) {
  const src = x.src || '';
  const fixSrc = (to) => replaceStatement(t, line, src, to);
  if (x.char) {
    const c = x.char, to = charFix(c);
    const shown = c === ' ' || c === '　' ? '␣' : c;
    if (to != null) add(H(`'${shown}' 대신 '${to}'을(를) 씁니다.`, `Write '${to}' instead of '${shown}'.`, t.split(c).join(to)));
    else if (c === ':' && /:=/.test(t)) add(H("대입은 := 가 아니라 = 로 씁니다.", 'Use = rather than :=.', t.split(':=').join('=')));
    else if ('<>&|!~?'.includes(c)) add(H('수식에서는 비교·논리 연산을 쓸 수 없습니다. 모델을 만든 뒤 Relational Operator, Logical Operator, Switch 블록을 더하세요.', 'Comparisons and logic are not supported in equations; add Relational Operator, Logical Operator or Switch blocks after building.'));
    else if (GREEK[c]) add(H(`이름은 영문자로 씁니다: ${c} → ${GREEK[c]}`, `Names are written in English letters: ${c} → ${GREEK[c]}`, spellGreek(t)));
    else if (/\p{L}/u.test(c)) add(H('이름은 영문자로 시작하고 영문자, 숫자, _만 씁니다 (예: theta, x_1).', 'Names start with a letter and use English letters, digits and _ only (e.g. theta, x_1).'));
    else add(H(`'${shown}'은(는) 쓸 수 없습니다. 쓸 수 있는 기호: + - * / ^ ( ) [ ] , ; = '`, `'${shown}' is not allowed. Symbols: + - * / ^ ( ) [ ] , ; = '`));
    return;
  }
  const f = x.found;
  if (x.expected === ')' && f === 'eof') {
    const b = balance(src, '(', ')');
    add(H(`닫히지 않은 괄호 '('가 ${b.open}개 있습니다.`, `${b.open} '(' ${b.open > 1 ? 'are' : 'is'} not closed.`, fixSrc(src.trimEnd() + ')'.repeat(Math.max(1, b.open)))));
  } else if (x.expected === ']') {
    add(H("행렬의 '['가 닫히지 않았습니다.", "A '[' is not closed.", fixSrc(src.trimEnd() + ']')));
  } else if (f === ')' || f === ']') {
    const b = balance(src, f === ')' ? '(' : '[', f);
    add(H(`짝이 없는 '${f}'이(가) 있습니다.`, `There is a '${f}' with no opening pair.`, fixSrc(b.cleaned)));
  } else if (f === '=') {
    if (src.includes('==')) add(H("식에는 '='를 하나만 씁니다 (== 대신 =).", "Use a single '=' (= rather than ==).", fixSrc(src.split('==').join('='))));
    else add(H("한 식에는 '='가 하나입니다. 여러 식은 줄을 바꾸거나 ;로 나눕니다.", "One equation has one '='; put equations on separate lines or separate them with ;."));
  } else if (f === ',') {
    const dp = decimalPoints(src);
    if (dp) add(H('소수점은 쉼표가 아니라 점으로 씁니다 (1,5 → 1.5).', 'Decimals take a point, not a comma (1,5 → 1.5).', fixSrc(dp)));
    else add(H('쉼표는 함수 인수 max(a, b)나 행렬 [1, 2] 안에서만 씁니다. 식을 나누려면 ;를 쓰세요.', 'Commas belong in function arguments max(a, b) and matrices [1, 2]; separate equations with ;.'));
  } else if (f === 'eof') {
    const s = src.replace(/[%#].*$/, '').trimEnd();
    const op = /[+\-*/^]$/.exec(s);
    if (op) add(H(`끝의 '${op[0]}' 뒤에 항이 빠졌습니다.`, `A term is missing after the last '${op[0]}'.`, fixSrc(s.slice(0, -1).trimEnd())));
    else if (/=$/.test(s)) add(H("'=' 오른쪽이 비어 있습니다.", "The right side of '=' is empty."));
    else add(H('식이 끝나지 않았습니다. 빠진 항이나 괄호가 없는지 보세요.', 'The expression is unfinished; look for a missing term or parenthesis.'));
  } else if (f === 'nl') {
    add(H('행렬 밖에서는 식을 줄바꿈으로 나눌 수 없습니다. 한 줄에 쓰세요.', 'Outside a matrix an expression cannot break across lines; keep it on one line.'));
  } else if (/^[*/^]$/.test(f)) {
    add(H(`'${f}' 앞에 항이 빠졌거나 연산자가 두 번 있습니다.`, `A term is missing before '${f}', or an operator is doubled.`));
  } else {
    add(H(`'${f}' 앞뒤에 연산자(+ - * / ^)가 빠졌거나 남았는지 보세요.`, `Check for a missing or extra operator (+ - * / ^) around '${f}'.`));
  }
}

/** Rows of the matrix `name = […]` in the text (0 when it is not there). */
function matrixRows(t, name) {
  for (const s of statements(t)) {
    try {
      const p = parseStatement(s.src, s.line);
      if (p.lhs && p.lhs.k === 'var' && p.lhs.name === name) return p.rhs.k === 'mat' ? p.rhs.rows.length : 1;
    } catch { /* skipped */ }
  }
  return 0;
}

function dimsHints(t, x, line, add) {
  const T = (M) => M[0].map((_, j) => M.map((r) => r[j]));
  if (x.why === 'rows') add(H(`${x.what}의 행마다 값의 개수가 같아야 합니다. 행은 ;로 나누고 빠진 값이 없는지 보세요.`, `Every row of ${x.what} needs the same number of values; rows are separated by ; — look for a missing value.`));
  else if (x.why === 'odemat') add(H("상태마다 식을 하나씩 씁니다: x1' = …, x2' = …  행렬로 쓰려면 상태 공간(A, B, C, D)을 쓰세요.", "Write one equation per state: x1' = …, x2' = …; for matrices use state space (A, B, C, D)."));
  else if (x.what === 'A') add(H('A는 정사각 행렬(상태 수 × 상태 수)이어야 합니다.', 'A must be square (states × states).'));
  else if (x.what === 'B') {
    const g = x.got;
    const fix = g && g.length === 1 && g[0].length === x.n ? replaceDef(t, line, 'B', matText(T(g))) : null;
    add(H(`B는 ${x.n}행(상태 수)이어야 합니다. 입력이 하나면 [0; 1]처럼 열로 씁니다.`, `B needs ${x.n} rows (one per state); with one input write it as a column, e.g. [0; 1].`, fix));
  } else if (x.what === 'C') {
    const g = x.got;
    const fix = g && g.length === x.n && g[0].length === 1 ? replaceDef(t, line, 'C', matText(T(g))) : null;
    add(H(`C는 ${x.n}열(상태 수)이어야 합니다. 출력이 하나면 [1 0]처럼 행으로 씁니다.`, `C needs ${x.n} columns (one per state); with one output write it as a row, e.g. [1 0].`, fix));
  } else if (x.what === 'D') {
    const z = Array.from({ length: x.p }, () => new Array(x.m).fill(0));
    add(H(`D는 ${x.p}×${x.m}(출력 수 × 입력 수)이어야 합니다.`, `D must be ${x.p}×${x.m} (outputs × inputs).`, replaceDef(t, line, 'D', matText(z))));
  } else if (x.what === 'x0') {
    const v = Array.from({ length: x.n }, (_, i) => (x.got && i < x.got.length ? x.got[i] : 0));
    const col = v.map((a) => [a]);
    add(H(`x0에는 상태 수만큼 ${x.n}개 값이 필요합니다.`, `x0 needs ${x.n} values, one per state.`, replaceDef(t, line, 'x0', matText(col)) || replaceDef(t, line, 'X0', matText(col))));
  }
}

function tfHints(t, x, line, add) {
  const upper = /(?<![\w])([SZ])(?![\w'])/.exec(t);
  if (x.why === 'both') add(H('연속(s)과 이산(z)을 함께 쓸 수 없습니다. 한 가지만 쓰세요.', 'Use s (continuous) or z (discrete), not both.'));
  else if (x.why === 'none') {
    if (upper) add(H(`전달 함수의 변수는 소문자 ${upper[1].toLowerCase()}입니다.`, `The transfer-function variable is a lowercase ${upper[1].toLowerCase()}.`, rename(t, upper[1], upper[1].toLowerCase())));
    else add(H('전달 함수는 G = (s + 1)/(s^2 + 2*s + 1)처럼 s로 씁니다 (이산은 z와 Ts = 0.1).', 'Write a transfer function with s, e.g. G = (s + 1)/(s^2 + 2*s + 1) (discrete: z with Ts = 0.1).'));
  } else if (x.why === 'neither') add(H(`${x.name}에 ${x.v}도 상수도 아닌 이름이 있습니다. 전달 함수는 ${x.v}와 상수, 다른 전달 함수로만 씁니다.`, `${x.name} reads a name that is neither ${x.v} nor a constant; a transfer function uses only ${x.v}, constants and other transfer functions.`));
  else if (x.why === 'ts') add(H('이산 전달 함수(z)에는 샘플 시간이 필요합니다: Ts = 0.1', 'A discrete transfer function (z) needs its sample time: Ts = 0.1', insertLine(t, 1, 'Ts = 0.1')));
  else if (x.why === 'tspos') add(H('샘플 시간 Ts는 0보다 커야 합니다.', 'The sample time Ts must be above 0.'));
  else if (x.why === 'improper') add(H(`${x.name}의 분자 차수가 분모보다 높아 구현할 수 없습니다. 분모 차수를 올리세요 (예: s 대신 s/(0.01*s + 1)).`, `${x.name} has a higher numerator degree than its denominator; raise the denominator (e.g. s/(0.01*s + 1) instead of s).`));
  else if (x.why === 'zero') add(H(`${x.name}의 분모가 0이 됩니다. 분모 식을 확인하세요.`, `The denominator of ${x.name} is zero; check it.`));
  else if (x.why === 'power') add(H('s의 거듭제곱 지수는 정수여야 합니다.', 'Powers of s must be integers.'));
  else if (x.why === 'deriv') add(H("전달 함수에는 미분(')을 쓰지 않습니다. 미분방정식이면 종류를 '자동'이나 '미분방정식'으로 두세요.", "Transfer functions take no primes ('); for differential equations set the kind to Auto or Differential equations."));
  else if (x.why === 'matrix') add(H('여러 입출력은 상태 공간(A, B, C, D)으로 쓰세요.', 'For several inputs or outputs use state space (A, B, C, D).'));
}

function kindHints(t, x, kind, add) {
  if (x.why === 'unknown') { add(H('종류는 auto, ode, tf, ss 중 하나입니다.', 'The kind is auto, ode, tf or ss.')); return; }
  // x'' + x (no '='): read as … = 0
  for (const s of statements(t)) {
    let p;
    try { p = parseStatement(s.src, s.line); } catch { continue; }
    if (p.lhs) continue;
    const solved = isolateDerivative(p.rhs, { k: 'num', v: 0 });
    if (solved) {
      add(H(`식에 '='가 없습니다. ${print(p.rhs)} = 0 이라면: ${solved}`, `The equation has no '='; if it means ${print(p.rhs)} = 0: ${solved}`, replaceStatement(t, s.line, s.src, lead(s.src) + solved)));
      return;
    }
  }
  // xdot = …, dx = …, x_dot = … : derivatives written as names
  const { defs } = definedNames(t);
  for (const n of defs) {
    const m = /^(?:d_?([A-Za-z]\w*?)(?:_?dt)?|([A-Za-z]\w*?)_?dot)$/.exec(n);
    const base = m && (m[1] || m[2]);
    if (base && new RegExp(`(?<![\\w])${esc(base)}(?![\\w])`).test(t)) {
      const fix = rename(t, n, `${base}'`);
      add(H(`미분은 ${base}' 로 씁니다 (${n} → ${base}').`, `Write the derivative as ${base}' (${n} → ${base}').`, fix));
      return;
    }
  }
  const upper = /(?<![\w])([SZ])(?![\w'])/.exec(t);
  if (upper) { add(H(`전달 함수의 변수는 소문자 ${upper[1].toLowerCase()}입니다.`, `The transfer-function variable is a lowercase ${upper[1].toLowerCase()}.`, rename(t, upper[1], upper[1].toLowerCase()))); return; }
  if (defs.includes('A')) { add(H('상태 공간에는 A와 함께 B, C가 필요합니다 (D, x0는 선택).', 'State space needs B and C besides A (D and x0 are optional).')); return; }
  if (x.why === 'noode' && /(?<![\w])[sz](?![\w'])/.test(t)) { add(H("전달 함수라면 종류를 '자동'이나 '전달 함수'로 두세요.", 'For a transfer function set the kind to Auto or Transfer function.')); return; }
  add(H(`이렇게 씁니다: ${FORMS_KO}`, `Write ${FORMS_EN}.`));
}

/** Notes for text that builds: undefined names (inputs) that look like typos of defined ones. */
export function eqNotes(text, { kind = 'auto' } = {}) {
  const t = norm(text);
  let spec;
  try { spec = parseEquations(t, { kind }); } catch { return []; }
  if (spec.kind !== 'ode') return [];
  const names = [...spec.states.map((s) => s.name), ...spec.signals.map((s) => s.name), ...spec.params.map((p) => p.name)];
  const out = [];
  for (const n of spec.inputs) {
    const near = nearestName(n, names);
    if (!near) continue;
    const fix = rename(t, n, near);
    let ok = false;
    try { parseEquations(fix, { kind }); ok = true; } catch { /* not offered */ }
    out.push({ ko: `${n}은(는) 정의되지 않아 입력이 됩니다. ${near}을(를) 뜻했나요?`, en: `${n} is not defined, so it becomes an input. Did you mean ${near}?`, fix: ok ? fix : null, preview: ok ? previewOf(t, fix) : null });
  }
  return out;
}
