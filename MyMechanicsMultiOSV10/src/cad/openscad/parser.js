// The OpenSCAD language: tokens and syntax tree. Follows the grammar of OpenSCAD 2021.01 and later (exponent ^,
// function literals, C-style for in list comprehensions, each, let / assert / echo in expressions, modifiers
// * ! # %, include <…> / use <…>). No geometry here — evaluate.js runs the tree.

/** A syntax error with the line and column it was found at. */
export function scadError(message, at, code = 'scad-syntax') {
  const where = at ? ` (line ${at.line}, column ${at.col})` : '';
  return Object.assign(new Error(`${message}${where}`), { code, line: at?.line, col: at?.col });
}

const KEYWORDS = new Set(['module', 'function', 'if', 'else', 'let', 'for', 'each', 'true', 'false', 'undef', 'include', 'use', 'assert', 'echo']);
const PUNCT = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '!', '<', '>', '=', '?', ':', ',', ';', '.', '(', ')', '[', ']', '{', '}', '#'];

/** Tokens of a source text: { type: 'num' | 'str' | 'id' | 'kw' | 'op' | 'path' | 'eof', value, line, col }. */
export function tokenize(src) {
  const out = [];
  let i = 0; let line = 1; let col = 1;
  const n = src.length;
  const adv = (k = 1) => { for (let j = 0; j < k; j++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff' || c === '\ufffd') { adv(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const at = { line, col }; adv(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= n) throw scadError('unterminated comment', at);
      adv(2); continue;
    }
    const at = { line, col };
    // include <path> / use <path>: the path token is everything up to '>'.
    if ((src.startsWith('include', i) || src.startsWith('use', i)) && !/[\w$]/.test(src[i - 1] ?? '')) {
      const word = src.startsWith('include', i) ? 'include' : 'use';
      let j = i + word.length;
      while (j < n && /[ \t]/.test(src[j])) j++;
      if (src[j] === '<' && !/[\w$]/.test(src[i + word.length] ?? '')) {
        const end = src.indexOf('>', j);
        if (end < 0) throw scadError(`unterminated ${word} path`, at);
        out.push({ type: 'kw', value: word, ...at });
        adv(j - i);
        const pAt = { line, col };
        out.push({ type: 'path', value: src.slice(j + 1, end).trim(), ...pAt });
        adv(end + 1 - i);
        continue;
      }
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 64));
      const id = /^[A-Za-z0-9_]+/.exec(src.slice(i, i + 256));
      if (id && id[0].length > m[0].length) { out.push({ type: KEYWORDS.has(id[0]) ? 'kw' : 'id', value: id[0], ...at }); adv(id[0].length); continue; }
      out.push({ type: 'num', value: Number(m[0]), ...at });
      adv(m[0].length); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^\$?[A-Za-z0-9_]+/.exec(src.slice(i, i + 256)) ?? ['$'];
      const word = m[0];
      out.push({ type: KEYWORDS.has(word) ? 'kw' : 'id', value: word, ...at });
      adv(word.length); continue;
    }
    if (c === '"') {
      adv();
      let s = '';
      while (true) {
        if (i >= n) throw scadError('unterminated string', at);
        const d = src[i];
        if (d === '"') { adv(); break; }
        if (d === '\\') {
          const e = src[i + 1];
          const simple = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"' };
          if (e in simple) { s += simple[e]; adv(2); continue; }
          if (e === 'x') { const h = /^[0-7][0-9a-fA-F]/.exec(src.slice(i + 2, i + 4)); if (h) { s += String.fromCharCode(parseInt(h[0], 16)); adv(4); continue; } }
          if (e === 'u') { const h = /^[0-9a-fA-F]{4}/.exec(src.slice(i + 2, i + 6)); if (h) { const cp = parseInt(h[0], 16); s += cp ? String.fromCodePoint(cp) : ' '; adv(6); continue; } }
          if (e === 'U') { const h = /^[0-9a-fA-F]{6}/.exec(src.slice(i + 2, i + 8)); if (h) { const cp = parseInt(h[0], 16); s += !cp ? ' ' : cp <= 0x10ffff ? String.fromCodePoint(cp) : '\ufffd'; adv(8); continue; } }
          // An unknown or incomplete escape: OpenSCAD drops the backslash and keeps what follows.
          adv(); continue;
        }
        s += d; adv();
      }
      out.push({ type: 'str', value: s, ...at });
      continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (!p) throw scadError(`unexpected character '${c}'`, at);
    out.push({ type: 'op', value: p, ...at });
    adv(p.length);
  }
  out.push({ type: 'eof', value: null, line, col });
  return out;
}

/**
 * The syntax tree of a source text: { statements: [...] }. Statements:
 *   { t: 'assign', name, expr } · { t: 'module', name, params, body } · { t: 'function', name, params, expr }
 *   { t: 'inst', name, args, children, mod } (mod: '' | '*' | '!' | '#' | '%') · { t: 'if', cond, then, else }
 *   { t: 'block', body } · { t: 'include' | 'use', path }
 * Expressions are { t: 'num' | 'str' | 'bool' | 'undef' | 'id' | 'vec' | 'range' | 'call' | 'index' | 'member' |
 *   'un' | 'bin' | 'tern' | 'let' | 'assert' | 'echo' | 'func', … }; list comprehension parts are 'lc-for',
 *   'lc-cfor', 'lc-if', 'lc-each' and 'lc-let'. Every node carries its line.
 */
export function parse(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = (o = 0) => toks[Math.min(k + o, toks.length - 1)];
  const next = () => toks[k++];
  const is = (type, value, o = 0) => { const t = peek(o); return t.type === type && (value === undefined || t.value === value); };
  const isOp = (v, o = 0) => is('op', v, o);
  const accept = (type, value) => { if (is(type, value)) return next(); return null; };
  const expect = (type, value, what) => {
    if (is(type, value)) return next();
    const t = peek();
    throw scadError(`expected ${what ?? (value ?? type)} but found ${t.type === 'eof' ? 'the end of the file' : `'${t.value}'`}`, t);
  };
  const at = () => ({ line: peek().line });

  function statements(until) {
    const list = [];
    while (!(until ? isOp(until) : is('eof'))) {
      if (is('eof')) throw scadError(`missing '${until}'`, peek());
      const s = statement();
      if (s) list.push(s);
    }
    return list;
  }

  function statement() {
    const loc = at();
    if (accept('op', ';')) return null;
    if (isOp('{')) { next(); const body = statements('}'); expect('op', '}'); return { t: 'block', body, ...loc }; }
    if (is('kw', 'include') || is('kw', 'use')) { const kind = next().value; const path = expect('path', undefined, 'a <path>').value; return { t: kind, path, ...loc }; }
    if (is('kw', 'module')) {
      next(); const name = expect('id', undefined, 'a module name').value;
      expect('op', '('); const params = paramList(); expect('op', ')');
      const body = childStatement();
      return { t: 'module', name, params, body, ...loc };
    }
    if (is('kw', 'function')) {
      next(); const name = expect('id', undefined, 'a function name').value;
      expect('op', '('); const params = paramList(); expect('op', ')');
      expect('op', '='); const e = expr(); expect('op', ';');
      return { t: 'function', name, params, expr: e, ...loc };
    }
    if (is('id') && isOp('=', 1)) {
      const name = next().value; next();
      const e = expr(); expect('op', ';');
      return { t: 'assign', name, expr: e, ...loc };
    }
    return instantiation();
  }

  /** A module instantiation (with modifiers), if / else, for, let, echo, assert … */
  function instantiation() {
    const loc = at();
    let mod = '';
    while (isOp('*') || isOp('!') || isOp('#') || isOp('%')) {
      const m = next().value;
      // '*' disables; the others stack, the strongest kept ('!' root, then '%', then '#').
      if (m === '*') mod = '*'; else if (mod !== '*') mod = mod === '!' ? '!' : m === '!' ? '!' : mod === '%' ? '%' : m;
    }
    if (is('kw', 'if')) {
      next(); expect('op', '('); const cond = expr(); expect('op', ')');
      const then = childStatement();
      let els = null;
      if (accept('kw', 'else')) els = childStatement();
      return { t: 'if', cond, then, else: els, mod, ...loc };
    }
    let name;
    if (is('id')) name = next().value;
    else if (is('kw', 'for') || is('kw', 'let') || is('kw', 'echo') || is('kw', 'assert') || is('kw', 'each')) name = next().value;
    else { const t = peek(); throw scadError(`unexpected ${t.type === 'eof' ? 'end of the file' : `'${t.value}'`}`, t); }
    expect('op', '(', `'(' after ${name}`); const args = argList(); expect('op', ')');
    const children = childStatement();
    return { t: 'inst', name, args, children, mod, ...loc };
  }

  /** The child of a module instantiation: ';' (none), a block, or one statement. */
  function childStatement() {
    if (accept('op', ';')) return [];
    if (isOp('{')) { next(); const body = statements('}'); expect('op', '}'); return body; }
    const s = statement();
    return s ? [s] : [];
  }

  function paramList() {
    const out = [];
    while (!isOp(')')) {
      const name = expect('id', undefined, 'a parameter name').value;
      let def = null;
      if (accept('op', '=')) def = expr();
      out.push({ name, def });
      if (!accept('op', ',')) break;
    }
    return out;
  }

  function argList() {
    const out = [];
    while (accept('op', ','));
    while (!isOp(')')) {
      let name = null;
      if (is('id') && isOp('=', 1)) { name = next().value; next(); }
      out.push({ name, expr: expr() });
      if (!accept('op', ',')) break;
      while (accept('op', ','));
    }
    return out;
  }

  // ── expressions (precedence: ternary < || < && < == != < < <= > >= < + - < * / % < unary < ^ < postfix)

  function expr() {
    const loc = at();
    if (is('kw', 'function') && isOp('(', 1)) {
      next(); expect('op', '('); const params = paramList(); expect('op', ')');
      return { t: 'func', params, body: expr(), ...loc };
    }
    if (is('kw', 'let') && isOp('(', 1)) { next(); expect('op', '('); const binds = argList(); expect('op', ')'); return { t: 'let', binds, body: expr(), ...loc }; }
    if (is('kw', 'assert') && isOp('(', 1)) { next(); expect('op', '('); const args = argList(); expect('op', ')'); return { t: 'assert', args, body: exprOrNull(), ...loc }; }
    if (is('kw', 'echo') && isOp('(', 1)) { next(); expect('op', '('); const args = argList(); expect('op', ')'); return { t: 'echo', args, body: exprOrNull(), ...loc }; }
    const c = logicOr();
    if (accept('op', '?')) { const a = expr(); expect('op', ':'); const b = expr(); return { t: 'tern', c, a, b, ...loc }; }
    return c;
  }
  // assert(…) / echo(…) may end an expression with nothing after them: `x = assert(c);`
  function exprOrNull() { return isOp(')') || isOp(';') || isOp(',') || isOp(']') || isOp(':') ? null : expr(); }

  const binary = (sub, ops) => () => {
    let a = sub();
    while (is('op') && ops.includes(peek().value)) { const loc = at(); const op = next().value; a = { t: 'bin', op, a, b: sub(), ...loc }; }
    return a;
  };
  const mult = () => { let a = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const loc = at(); const op = next().value; a = { t: 'bin', op, a, b: unary(), ...loc }; } return a; };
  const add = binary(mult, ['+', '-']);
  const comparison = binary(add, ['<', '<=', '>', '>=']);
  const equality = binary(comparison, ['==', '!=']);
  const logicAnd = binary(equality, ['&&']);
  const logicOr = binary(logicAnd, ['||']);

  function unary() {
    const loc = at();
    if (isOp('-') || isOp('+') || isOp('!')) { const op = next().value; return { t: 'un', op, e: unary(), ...loc }; }
    return exponent();
  }
  function exponent() {
    const a = postfix();
    if (isOp('^')) { const loc = at(); next(); return { t: 'bin', op: '^', a, b: unary(), ...loc }; }
    return a;
  }
  function postfix() {
    let e = primary();
    while (true) {
      const loc = at();
      if (isOp('(')) { next(); const args = argList(); expect('op', ')'); e = { t: 'call', fn: e, args, ...loc }; continue; }
      if (isOp('[')) { next(); const idx = expr(); expect('op', ']'); e = { t: 'index', obj: e, idx, ...loc }; continue; }
      if (isOp('.')) { next(); const name = expect('id', undefined, 'a member name').value; e = { t: 'member', obj: e, name, ...loc }; continue; }
      return e;
    }
  }
  function primary() {
    const loc = at();
    const tk = peek();
    if (tk.type === 'num') { next(); return { t: 'num', v: tk.value, ...loc }; }
    if (tk.type === 'str') { next(); return { t: 'str', v: tk.value, ...loc }; }
    if (is('kw', 'true') || is('kw', 'false')) { next(); return { t: 'bool', v: tk.value === 'true', ...loc }; }
    if (is('kw', 'undef')) { next(); return { t: 'undef', ...loc }; }
    if (tk.type === 'id') { next(); return { t: 'id', name: tk.value, ...loc }; }
    if (isOp('(')) { next(); const e = expr(); expect('op', ')'); return e; }
    if (isOp('[')) return vector();
    if (is('kw', 'let') || is('kw', 'assert') || is('kw', 'echo') || is('kw', 'function')) return expr();
    throw scadError(`unexpected ${tk.type === 'eof' ? 'end of the file' : `'${tk.value}'`}`, tk);
  }

  /** [ ], [a : b], [a : s : b], or a vector of expressions and list comprehension elements. */
  function vector() {
    const loc = at();
    expect('op', '[');
    if (accept('op', ']')) return { t: 'vec', items: [], ...loc };
    if (!startsComprehension()) {
      const first = expr();
      if (accept('op', ':')) {
        const second = expr();
        if (accept('op', ':')) { const third = expr(); expect('op', ']'); return { t: 'range', begin: first, step: second, end: third, ...loc }; }
        expect('op', ']');
        return { t: 'range', begin: first, step: null, end: second, ...loc };
      }
      const items = [first];
      while (accept('op', ',')) { while (accept('op', ',')); if (isOp(']')) break; items.push(element()); }
      expect('op', ']');
      return { t: 'vec', items, ...loc };
    }
    const items = [];
    while (!isOp(']')) { items.push(element()); if (!accept('op', ',')) break; while (accept('op', ',')); }
    expect('op', ']');
    return { t: 'vec', items, ...loc };
  }
  function startsComprehension() {
    return (is('kw', 'for') || is('kw', 'each') || is('kw', 'if') || is('kw', 'let')) || (isOp('(') && (is('kw', 'for', 1) || is('kw', 'each', 1) || is('kw', 'if', 1) || is('kw', 'let', 1)));
  }
  /** One element of a vector: an expression or a comprehension part. */
  function element() {
    const loc = at();
    if (isOp('(') && (is('kw', 'for', 1) || is('kw', 'each', 1) || is('kw', 'if', 1) || is('kw', 'let', 1))) { next(); const e = element(); expect('op', ')'); return e; }
    if (is('kw', 'for')) {
      next(); expect('op', '(');
      const first = argList();
      if (accept('op', ';')) {
        const cond = expr(); expect('op', ';');
        const update = argList(); expect('op', ')');
        return { t: 'lc-cfor', init: first, cond, update, body: element(), ...loc };
      }
      expect('op', ')');
      return { t: 'lc-for', binds: first, body: element(), ...loc };
    }
    if (is('kw', 'each')) { next(); return { t: 'lc-each', body: element(), ...loc }; }
    if (is('kw', 'if')) {
      next(); expect('op', '('); const cond = expr(); expect('op', ')');
      const then = element();
      let els = null;
      if (accept('kw', 'else')) els = element();
      return { t: 'lc-if', cond, then, else: els, ...loc };
    }
    if (is('kw', 'let') && isOp('(', 1)) {
      // let(…) followed by a comprehension part, or by a plain expression (then it is a let expression).
      const save = k;
      next(); expect('op', '('); const binds = argList(); expect('op', ')');
      if (is('kw', 'for') || is('kw', 'each') || is('kw', 'if') || (is('kw', 'let') && isOp('(', 1)) || (isOp('(') && (is('kw', 'for', 1) || is('kw', 'each', 1) || is('kw', 'if', 1)))) return { t: 'lc-let', binds, body: element(), ...loc };
      k = save;
      return expr();
    }
    return expr();
  }

  const tree = { statements: statements(null) };
  return tree;
}
