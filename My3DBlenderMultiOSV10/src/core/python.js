// A Python interpreter, written here: indentation, classes, comprehensions, exceptions, f-strings, keyword arguments, and the
// `bpy` module. It is the language, not CPython: there are no C extensions, no pip and a small standard library. What it does
// not have fails with a normal ImportError.
import { activeObject, selectedObjects, setFrame } from './doc.js';
import { allOps, getOp, register, run as runOp, touch, unregister } from './ops.js';

// ─────────────── tokens

const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
const OPERATORS = ['**=', '//=', '>>=', '<<=', '...', '!=', '%=', '&=', '*=', '**', '+=', '-=', '->', '/=', '//', ':=', '<<', '<=', '==', '>=', '>>', '^=', '|=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '@', '=', '~', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^'];

export class PySyntaxError extends Error {
  constructor(message, line) { super(`SyntaxError: ${message} (line ${line})`); this.line = line; }
}

function tokenize(source) {
  const tokens = [];
  const lines = source.replace(/\r\n/g, '\n');
  let i = 0;
  let line = 1;
  let depth = 0;
  const indents = [0];
  let atLineStart = true;
  const n = lines.length;
  while (i < n) {
    if (atLineStart && depth === 0) {
      let col = 0;
      let j = i;
      while (j < n && (lines[j] === ' ' || lines[j] === '\t')) { col += lines[j] === '\t' ? 8 - (col % 8) : 1; j++; }
      if (lines[j] === '\n' || lines[j] === '#' || j >= n) {
        while (j < n && lines[j] !== '\n') j++;
        i = j + 1;
        line++;
        continue;
      }
      if (col > indents.at(-1)) { indents.push(col); tokens.push({ t: 'INDENT', line }); }
      while (col < indents.at(-1)) { indents.pop(); tokens.push({ t: 'DEDENT', line }); }
      if (col !== indents.at(-1)) throw new PySyntaxError('unindent does not match any outer indentation level', line);
      i = j;
      atLineStart = false;
    }
    const c = lines[i];
    if (c === '\n') {
      if (depth === 0) { tokens.push({ t: 'NEWLINE', line }); atLineStart = true; }
      i++;
      line++;
      continue;
    }
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '\\' && lines[i + 1] === '\n') { i += 2; line++; continue; }
    if (c === '#') { while (i < n && lines[i] !== '\n') i++; continue; }
    const prefix = /^([rRfFbBuU]{0,2})("""|'''|"|')/.exec(lines.slice(i, i + 5));
    if (prefix) {
      const flags = prefix[1].toLowerCase();
      const quote = prefix[2];
      let j = i + prefix[0].length;
      let value = '';
      const startLine = line;
      for (;;) {
        if (j >= n) throw new PySyntaxError('unterminated string', startLine);
        if (lines.startsWith(quote, j)) { j += quote.length; break; }
        const ch = lines[j];
        if (ch === '\n') { if (quote.length === 1) throw new PySyntaxError('unterminated string', startLine); line++; }
        if (ch === '\\' && !flags.includes('r')) {
          const next = lines[j + 1];
          const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', 0: '\0', '\n': '' };
          if (next in map) { value += map[next]; j += 2; continue; }
          if (next === 'x') { value += String.fromCharCode(parseInt(lines.slice(j + 2, j + 4), 16)); j += 4; continue; }
          if (next === 'u') { value += String.fromCharCode(parseInt(lines.slice(j + 2, j + 6), 16)); j += 6; continue; }
        }
        value += ch;
        j++;
      }
      tokens.push({ t: flags.includes('f') ? 'FSTRING' : 'STRING', value, line: startLine });
      i = j;
      continue;
    }
    const number = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)/.exec(lines.slice(i, i + 40));
    if (number && (/\d/.test(c) || (c === '.' && /\d/.test(lines[i + 1] ?? '')))) {
      const text = number[0];
      const isFloat = /[.eE]/.test(text) && !/^0[xX]/.test(text);
      tokens.push({ t: 'NUMBER', value: isFloat ? new PyFloat(Number(text)) : Number(text), line });
      i += text.length;
      continue;
    }
    const name = /^[A-Za-z_\u0080-￿][\w\u0080-￿]*/.exec(lines.slice(i, i + 200));
    if (name) {
      tokens.push({ t: KEYWORDS.has(name[0]) ? name[0] : 'NAME', value: name[0], line });
      i += name[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => lines.startsWith(o, i));
    if (!op) throw new PySyntaxError(`invalid character '${c}'`, line);
    if ('([{'.includes(op)) depth++;
    if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
    tokens.push({ t: op, line });
    i += op.length;
  }
  if (tokens.at(-1)?.t !== 'NEWLINE') tokens.push({ t: 'NEWLINE', line });
  while (indents.length > 1) { indents.pop(); tokens.push({ t: 'DEDENT', line }); }
  tokens.push({ t: 'EOF', line });
  return tokens;
}

// ─────────────── parser

function parse(source) {
  const tokens = tokenize(source);
  let p = 0;
  const peek = (k = 0) => tokens[p + k];
  const is = (t) => tokens[p].t === t;
  const accept = (t) => (tokens[p].t === t ? tokens[p++] : null);
  const fail = (message) => { throw new PySyntaxError(message, tokens[p].line); };
  const expect = (t) => tokens[p].t === t ? tokens[p++] : fail(`expected '${t}', found '${tokens[p].value ?? tokens[p].t}'`);

  const block = () => {
    expect(':');
    if (accept('NEWLINE')) {
      expect('INDENT');
      const body = [];
      while (!is('DEDENT') && !is('EOF')) body.push(...statement());
      accept('DEDENT');
      return body;
    }
    return simpleLine();
  };

  const statement = () => {
    const line = tokens[p].line;
    const with_ = (node) => { node.line = line; return node; };
    switch (tokens[p].t) {
      case 'if': {
        p++;
        const test = expression();
        const body = block();
        const node = with_({ k: 'If', test, body, orelse: [] });
        let cursor = node;
        while (is('elif')) {
          const l = tokens[p++].line;
          const inner = { k: 'If', test: expression(), body: block(), orelse: [], line: l };
          cursor.orelse = [inner];
          cursor = inner;
        }
        if (accept('else')) cursor.orelse = block();
        return [node];
      }
      case 'while': { p++; const test = expression(); const body = block(); return [with_({ k: 'While', test, body, orelse: accept('else') ? block() : [] })]; }
      case 'for': {
        p++;
        const target = targetList();
        expect('in');
        const iter = testList();
        const body = block();
        return [with_({ k: 'For', target, iter, body, orelse: accept('else') ? block() : [] })];
      }
      case 'def': return [with_(funcDef())];
      case 'class': {
        p++;
        const name = expect('NAME').value;
        const bases = [];
        if (accept('(')) { while (!is(')')) { if (peek(1).t === '=' && peek().t === 'NAME') { p += 2; expression(); } else bases.push(expression()); if (!accept(',')) break; } expect(')'); }
        return [with_({ k: 'Class', name, bases, body: block() })];
      }
      case '@': {
        const decorators = [];
        while (accept('@')) { decorators.push(expression()); expect('NEWLINE'); }
        const def = statement()[0];
        def.decorators = decorators;
        return [def];
      }
      case 'try': {
        p++;
        const body = block();
        const handlers = [];
        while (accept('except')) {
          let type = null;
          let name = null;
          if (!is(':')) { type = expression(); if (accept('as')) name = expect('NAME').value; }
          handlers.push({ type, name, body: block() });
        }
        const orelse = accept('else') ? block() : [];
        const finalbody = accept('finally') ? block() : [];
        return [with_({ k: 'Try', body, handlers, orelse, finalbody })];
      }
      case 'with': {
        p++;
        const items = [];
        do {
          const e = expression();
          items.push({ e, as: accept('as') ? primaryTarget() : null });
        } while (accept(','));
        return [with_({ k: 'With', items, body: block() })];
      }
      default: return simpleLine();
    }
  };
  const simpleLine = () => {
    const out = [simple()];
    while (accept(';')) { if (is('NEWLINE')) break; out.push(simple()); }
    expect('NEWLINE');
    return out;
  };
  const simple = () => {
    const line = tokens[p].line;
    const with_ = (node) => { node.line = line; return node; };
    switch (tokens[p].t) {
      case 'pass': p++; return with_({ k: 'Pass' });
      case 'break': p++; return with_({ k: 'Break' });
      case 'continue': p++; return with_({ k: 'Continue' });
      case 'return': { p++; return with_({ k: 'Return', value: is('NEWLINE') || is(';') ? null : testList() }); }
      case 'raise': { p++; const exc = is('NEWLINE') ? null : expression(); if (accept('from')) expression(); return with_({ k: 'Raise', exc }); }
      case 'global': case 'nonlocal': { const kind = tokens[p++].t; const names = [expect('NAME').value]; while (accept(',')) names.push(expect('NAME').value); return with_({ k: kind === 'global' ? 'Global' : 'Nonlocal', names }); }
      case 'del': { p++; const targets = [primaryTarget()]; while (accept(',')) targets.push(primaryTarget()); return with_({ k: 'Del', targets }); }
      case 'assert': { p++; const test = expression(); return with_({ k: 'Assert', test, msg: accept(',') ? expression() : null }); }
      case 'import': {
        p++;
        const names = [];
        do {
          let name = expect('NAME').value;
          while (accept('.')) name += `.${expect('NAME').value}`;
          names.push({ name, as: accept('as') ? expect('NAME').value : null });
        } while (accept(','));
        return with_({ k: 'Import', names });
      }
      case 'from': {
        p++;
        let module = expect('NAME').value;
        while (accept('.')) module += `.${expect('NAME').value}`;
        expect('import');
        const paren = accept('(');
        const names = [];
        if (accept('*')) names.push({ name: '*' });
        else do { if (paren && is(')')) break; const name = expect('NAME').value; names.push({ name, as: accept('as') ? expect('NAME').value : null }); } while (accept(','));
        if (paren) expect(')');
        return with_({ k: 'ImportFrom', module, names });
      }
      default: return exprStatement(with_);
    }
  };
  const AUG = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '>>=', '<<=', '&=', '|=', '^=']);
  // yield, yield from: a statement, the right side of an assignment, or in brackets.
  const yieldExpr = () => {
    expect('yield');
    if (accept('from')) return { k: 'YieldFrom', value: expression() };
    if (is('NEWLINE') || is(')') || is(';') || is('=')) return { k: 'Yield', value: null };
    return { k: 'Yield', value: testList() };
  };
  const valueList = () => (is('yield') ? yieldExpr() : testList());
  const exprStatement = (with_) => {
    const first = valueList();
    if (is(':') ) {
      // An annotated name: x: int = 3
      p++;
      const annotation = expression();
      const value = accept('=') ? testList() : null;
      return with_({ k: 'AnnAssign', target: first, annotation, value });
    }
    if (AUG.has(tokens[p].t)) { const op = tokens[p++].t.slice(0, -1); return with_({ k: 'AugAssign', target: first, op, value: valueList() }); }
    if (is('=')) {
      const targets = [first];
      let value = null;
      while (accept('=')) { value = valueList(); targets.push(value); }
      targets.pop();
      return with_({ k: 'Assign', targets, value });
    }
    return with_({ k: 'Expr', value: first });
  };
  const funcDef = () => {
    expect('def');
    const name = expect('NAME').value;
    expect('(');
    const params = parameters(')');
    expect(')');
    if (accept('->')) expression();
    const body = block();
    return { k: 'Def', name, params, body, generator: markYields(body) };
  };
  const parameters = (end) => {
    const params = [];
    while (!is(end)) {
      if (accept('*')) { if (is('NAME')) params.push({ name: tokens[p++].value, star: true }); else params.push({ name: null, star: true }); } else if (accept('**')) params.push({ name: expect('NAME').value, dstar: true });
      else if (accept('/')) { /* positional marker */ } else {
        const param = { name: expect('NAME').value };
        if (end === ')' && accept(':')) expression();
        if (accept('=')) param.def = expression();
        params.push(param);
      }
      if (!accept(',')) break;
    }
    return params;
  };
  const testList = () => {
    const first = star();
    if (!is(',')) return first;
    const elts = [first];
    while (accept(',')) {
      if (is('NEWLINE') || is('=') || is(')') || is(']') || is('}') || is(':') || is(';')) break;
      elts.push(star());
    }
    return { k: 'Tuple', elts };
  };
  const star = () => (accept('*') ? { k: 'Star', value: expression() } : expression());
  const targetList = () => {
    const first = primaryTargetStar();
    if (!is(',')) return first;
    const elts = [first];
    while (accept(',')) { if (is('in')) break; elts.push(primaryTargetStar()); }
    return { k: 'Tuple', elts };
  };
  const primaryTargetStar = () => (accept('*') ? { k: 'Star', value: primaryTarget() } : primaryTarget());
  const primaryTarget = () => postfix(atom());
  const expression = () => {
    if (is('lambda')) {
      p++;
      const params = parameters(':');
      expect(':');
      return { k: 'Lambda', params, body: expression() };
    }
    const value = orTest();
    if (accept('if')) {
      const test = orTest();
      expect('else');
      return { k: 'IfExp', test, body: value, orelse: expression() };
    }
    if (is(':=') && value.k === 'Name') { p++; return { k: 'Walrus', target: value, value: expression() }; }
    return value;
  };
  const orTest = () => { let left = andTest(); while (accept('or')) left = { k: 'Or', left, right: andTest() }; return left; };
  const andTest = () => { let left = notTest(); while (accept('and')) left = { k: 'And', left, right: notTest() }; return left; };
  const notTest = () => (accept('not') ? { k: 'Not', value: notTest() } : comparison());
  const comparison = () => {
    const first = bitOr();
    const ops = [];
    const rest = [];
    for (;;) {
      let op = null;
      if (['<', '>', '==', '>=', '<=', '!='].includes(tokens[p].t)) op = tokens[p++].t;
      else if (is('in')) { p++; op = 'in'; } else if (is('not') && peek(1).t === 'in') { p += 2; op = 'not in'; } else if (is('is')) { p++; op = accept('not') ? 'is not' : 'is'; } else break;
      ops.push(op);
      rest.push(bitOr());
    }
    return ops.length ? { k: 'Compare', first, ops, rest } : first;
  };
  const binary = (next, ops) => () => { let left = next(); while (ops.includes(tokens[p].t)) { const op = tokens[p++].t; left = { k: 'Bin', op, left, right: next() }; } return left; };
  const factor = () => {
    if (['-', '+', '~'].includes(tokens[p].t)) { const op = tokens[p++].t; return { k: 'Unary', op, value: factor() }; }
    return power();
  };
  const power = () => {
    const base = postfix(atom());
    if (accept('**')) return { k: 'Bin', op: '**', left: base, right: factor() };
    return base;
  };
  const term = binary(factor, ['*', '/', '//', '%', '@']);
  const arith = binary(term, ['+', '-']);
  const shift = binary(arith, ['<<', '>>']);
  const bitAnd = binary(shift, ['&']);
  const bitXor = binary(bitAnd, ['^']);
  const bitOr = binary(bitXor, ['|']);
  const postfix = (start) => {
    let node = start;
    for (;;) {
      if (accept('.')) node = { k: 'Attr', obj: node, name: tokens[p].value ?? fail('expected a name'), line: tokens[p++].line };
      else if (is('(')) {
        const line = tokens[p++].line;
        const args = [];
        const kwargs = [];
        while (!is(')')) {
          if (accept('*')) args.push({ k: 'Star', value: expression() });
          else if (accept('**')) kwargs.push({ dstar: expression() });
          else if (is('NAME') && peek(1).t === '=') { const name = tokens[p].value; p += 2; kwargs.push({ name, value: expression() }); } else {
            const value = expression();
            if (is('for')) args.push(comprehension('Gen', value)); else args.push(value);
          }
          if (!accept(',')) break;
        }
        expect(')');
        node = { k: 'Call', fn: node, args, kwargs, line };
      } else if (is('[')) {
        const line = tokens[p++].line;
        const index = sliceList();
        expect(']');
        node = { k: 'Index', obj: node, index, line };
      } else return node;
    }
  };
  const sliceItem = () => {
    if (is(':') || (!is(']') && false)) { /* falls through */ }
    let start = null;
    if (!is(':')) start = expression();
    if (!accept(':')) return start;
    let stop = null;
    let step = null;
    if (!is(':') && !is(']') && !is(',')) stop = expression();
    if (accept(':') && !is(']') && !is(',')) step = expression();
    return { k: 'Slice', start, stop, step };
  };
  const sliceList = () => {
    const first = sliceItem();
    if (!is(',')) return first;
    const elts = [first];
    while (accept(',')) { if (is(']')) break; elts.push(sliceItem()); }
    return { k: 'Tuple', elts };
  };
  const comprehension = (kind, element, value = null) => {
    const clauses = [];
    while (is('for')) {
      p++;
      const target = targetList();
      expect('in');
      const iter = orTest();
      const ifs = [];
      while (accept('if')) ifs.push(orTest());
      clauses.push({ target, iter, ifs });
    }
    return { k: kind, element, value, clauses };
  };
  const fstring = (text, line) => {
    const parts = [];
    let i = 0;
    let buffer = '';
    while (i < text.length) {
      const c = text[i];
      if (c === '{' && text[i + 1] === '{') { buffer += '{'; i += 2; continue; }
      if (c === '}' && text[i + 1] === '}') { buffer += '}'; i += 2; continue; }
      if (c !== '{') { buffer += c; i++; continue; }
      let depth2 = 1;
      let j = i + 1;
      let quote = null;
      let colon = -1;
      let conv = -1;
      while (j < text.length && depth2 > 0) {
        const d = text[j];
        if (quote) { if (d === quote) quote = null; } else if (d === '"' || d === "'") quote = d;
        else if (d === '{' || d === '(' || d === '[') depth2++;
        else if (d === '}' || d === ')' || d === ']') { depth2--; if (depth2 === 0) break; } else if (d === ':' && depth2 === 1 && colon < 0) colon = j;
        else if (d === '!' && depth2 === 1 && colon < 0 && text[j + 1] !== '=') conv = j;
        j++;
      }
      if (depth2 !== 0) throw new PySyntaxError("f-string: expecting '}'", line);
      const exprEnd = conv >= 0 ? conv : colon >= 0 ? colon : j;
      const code = text.slice(i + 1, exprEnd);
      if (buffer) { parts.push(buffer); buffer = ''; }
      parts.push({ expr: parseExpressionText(code, line), spec: colon >= 0 ? text.slice(colon + 1, j) : '', conv: conv >= 0 ? text[conv + 1] : '' });
      i = j + 1;
    }
    if (buffer) parts.push(buffer);
    return { k: 'FString', parts };
  };
  const atom = () => {
    const tok = tokens[p];
    switch (tok.t) {
      case 'NUMBER': p++; return { k: 'Const', value: tok.value };
      case 'STRING': case 'FSTRING': {
        // Adjacent strings join.
        const parts = [];
        while (is('STRING') || is('FSTRING')) { const s = tokens[p++]; parts.push(s.t === 'STRING' ? { k: 'Const', value: s.value } : fstring(s.value, s.line)); }
        if (parts.length === 1) return parts[0];
        return { k: 'FString', parts: parts.map((x) => (x.k === 'Const' ? x.value : { expr: x, spec: '', conv: '' })) };
      }
      case 'True': p++; return { k: 'Const', value: true };
      case 'False': p++; return { k: 'Const', value: false };
      case 'None': p++; return { k: 'Const', value: null };
      case '...': p++; return { k: 'Const', value: null };
      case 'NAME': p++; return { k: 'Name', name: tok.value, line: tok.line };
      case '(': {
        p++;
        if (accept(')')) return { k: 'Tuple', elts: [] };
        if (is('yield')) { const y = yieldExpr(); expect(')'); return y; }
        const first = star();
        if (is('for')) { const c = comprehension('Gen', first); expect(')'); return c; }
        if (!is(',')) { expect(')'); return first; }
        const elts = [first];
        while (accept(',')) { if (is(')')) break; elts.push(star()); }
        expect(')');
        return { k: 'Tuple', elts };
      }
      case '[': {
        p++;
        if (accept(']')) return { k: 'List', elts: [] };
        const first = star();
        if (is('for')) { const c = comprehension('ListComp', first); expect(']'); return c; }
        const elts = [first];
        while (accept(',')) { if (is(']')) break; elts.push(star()); }
        expect(']');
        return { k: 'List', elts };
      }
      case '{': {
        p++;
        if (accept('}')) return { k: 'Dict', keys: [], values: [] };
        if (accept('**')) { const keys = [null]; const values = [expression()]; while (accept(',')) { if (is('}')) break; if (accept('**')) { keys.push(null); values.push(expression()); } else { keys.push(expression()); expect(':'); values.push(expression()); } } expect('}'); return { k: 'Dict', keys, values }; }
        const first = star();
        if (accept(':')) {
          const firstValue = expression();
          if (is('for')) { const c = comprehension('DictComp', first, firstValue); expect('}'); return c; }
          const keys = [first];
          const values = [firstValue];
          while (accept(',')) { if (is('}')) break; if (accept('**')) { keys.push(null); values.push(expression()); } else { keys.push(expression()); expect(':'); values.push(expression()); } }
          expect('}');
          return { k: 'Dict', keys, values };
        }
        if (is('for')) { const c = comprehension('SetComp', first); expect('}'); return c; }
        const elts = [first];
        while (accept(',')) { if (is('}')) break; elts.push(star()); }
        expect('}');
        return { k: 'SetLit', elts };
      }
      default:
        return fail(`invalid syntax near '${tok.value ?? tok.t}'`);
    }
  };

  const body = [];
  while (!is('EOF')) {
    if (accept('NEWLINE')) continue;
    body.push(...statement());
  }
  return body;
}

function parseExpressionText(text, line) {
  const body = parse(text.trim());
  if (body.length !== 1 || body[0].k !== 'Expr') throw new PySyntaxError('f-string: invalid expression', line);
  return body[0].value;
}

// ─────────────── values

/** A float that stays one when it is a whole number, so that 2.0 prints as 2.0. Plain JS numbers are ints. */
class PyFloat {
  constructor(v) { this.v = v; }
  valueOf() { return this.v; }
  toJSON() { return this.v; }
}
const num = (x) => (x instanceof PyFloat ? x.v : x);
const isNum = (x) => typeof x === 'number' || x instanceof PyFloat;
const flt = (x) => new PyFloat(x);

export class PyTuple extends Array {}
const tuple = (items) => { const t = new PyTuple(); for (const x of items) t.push(x); return t; };

class PyDict {
  constructor() { this.map = new Map(); }
  static key(k) { if (k instanceof PyFloat) return Number.isInteger(k.v) ? k.v : `f:${k.v}`; if (k instanceof PyTuple) return `t:${k.map(PyDict.key).join('\u0001')}`; return k; }
  get(k) { const e = this.map.get(PyDict.key(k)); return e ? e[1] : undefined; }
  set(k, v) { this.map.set(PyDict.key(k), [k, v]); }
  has(k) { return this.map.has(PyDict.key(k)); }
  delete(k) { return this.map.delete(PyDict.key(k)); }
  keys() { return [...this.map.values()].map((e) => e[0]); }
  values() { return [...this.map.values()].map((e) => e[1]); }
  items() { return [...this.map.values()].map((e) => tuple(e)); }
  get size() { return this.map.size; }
}
class PySet {
  constructor(items = []) { this.d = new PyDict(); for (const x of items) this.d.set(x, true); }
  has(x) { return this.d.has(x); }
  add(x) { this.d.set(x, true); }
  delete(x) { return this.d.delete(x); }
  items() { return this.d.keys(); }
  get size() { return this.d.size; }
}

class PyClass {
  constructor(name, bases, attrs) { this.name = name; this.bases = bases; this.attrs = attrs; }
  lookup(name) {
    if (this.attrs.has(name)) return this.attrs.get(name);
    for (const b of this.bases) { const v = b.lookup?.(name); if (v !== undefined) return v; }
    return undefined;
  }
  isSubclassOf(other) { return this === other || this.bases.some((b) => b.isSubclassOf?.(other)); }
}
class PyInstance {
  constructor(cls) { this.cls = cls; this.attrs = new Map(); }
}
class PyFunction {
  constructor(name, params, body, scope, interp, isLambda = false) { this.name = name; this.params = params; this.body = body; this.scope = scope; this.interp = interp; this.isLambda = isLambda; }
}

// ─────────────── generators
// A function with yield in it runs on a JavaScript generator: statements that hold a yield run through statementG,
// the rest as usual. yield stands as a statement, on the right of an assignment, or in brackets there.
const STATEMENTS = new Set(['Expr', 'Assign', 'AnnAssign', 'AugAssign', 'If', 'While', 'For', 'Try', 'With', 'Return', 'Assert', 'Raise', 'Del']);
function scanYields(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) { let any = false; for (const x of node) if (scanYields(x)) any = true; return any; }
  if (node.k === 'Yield' || node.k === 'YieldFrom') { scanYields(node.value); return true; }
  if (node.k === 'Def' || node.k === 'Class' || node.k === 'Lambda') return false;
  let any = false;
  for (const [key, v] of Object.entries(node)) if (key !== 'line' && key !== 'y' && scanYields(v)) any = true;
  if (any && STATEMENTS.has(node.k)) node.y = true;
  return any;
}
/** Marks the statements of a function body that hold a yield; true when there is one (the function is a generator). */
function markYields(body) { return scanYields(body); }

class PyGenerator {
  constructor(interp, fn, scope) { this.interp = interp; this.name = fn.name; this.it = interp.execG(fn.body, scope); this.done = false; this.running = false; }
  /** Runs to the next yield: { done, value }; a return's value comes with done. */
  resume(sent = null, mode = 'next', error = null) {
    if (this.done) { if (mode === 'throw') throw error; return { done: true, value: null }; }
    if (this.running) raise('ValueError', 'generator already executing');
    this.running = true;
    try {
      const r = mode === 'throw' ? this.it.throw(error) : mode === 'close' ? this.it.return(null) : this.it.next(sent);
      if (r.done) { this.done = true; return { done: true, value: null }; }
      return r;
    } catch (e) {
      this.done = true;
      if (e instanceof ReturnSignal) return { done: true, value: e.value };
      throw e;
    } finally { this.running = false; }
  }
  __next() { return this.resume(null); }
  *[Symbol.iterator]() { for (;;) { const r = this.resume(null); if (r.done) return; yield r.value; } }
}
class BoundMethod {
  constructor(self, fn) { this.self = self; this.fn = fn; }
}
class Native {
  constructor(name, fn) { this.name = name; this.fn = fn; }
}
const native = (name, fn) => new Native(name, fn);

const base = (name, ...bases) => new PyClass(name, bases, new Map());
const BaseException = base('BaseException');
const Exception_ = base('Exception', BaseException);
const makeError = (name, parent = Exception_) => base(name, parent);
const ERRORS = { BaseException, Exception: Exception_ };
for (const [name, parent] of [['TypeError'], ['ValueError'], ['NameError'], ['AttributeError'], ['ArithmeticError'], ['LookupError'], ['RuntimeError'], ['ImportError'], ['StopIteration'], ['AssertionError'], ['NotImplementedError', 'RuntimeError'], ['ZeroDivisionError', 'ArithmeticError'], ['OverflowError', 'ArithmeticError'], ['KeyError', 'LookupError'], ['IndexError', 'LookupError'], ['ModuleNotFoundError', 'ImportError'], ['RecursionError', 'RuntimeError'], ['TimeoutError', 'RuntimeError'], ['SyntaxError']]) ERRORS[name] = makeError(name, parent ? ERRORS[parent] : Exception_);

/** A raised Python exception travelling through the interpreter. */
class PyRaise {
  constructor(instance, line = 0) { this.instance = instance; this.line = line; }
}
const raise = (type, message) => {
  const inst = new PyInstance(ERRORS[type]);
  inst.attrs.set('args', tuple([message]));
  throw new PyRaise(inst);
};
class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }

class Scope {
  constructor(parent = null, kind = 'function') { this.vars = new Map(); this.parent = parent; this.kind = kind; this.globals = null; this.nonlocals = null; }
  get root() { let s = this; while (s.parent) s = s.parent; return s; }
}

const typeName = (v) => {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'int';
  if (v instanceof PyFloat) return 'float';
  if (typeof v === 'string') return 'str';
  if (v instanceof PyTuple) return 'tuple';
  if (Array.isArray(v)) return 'list';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PySet) return 'set';
  if (v instanceof PyInstance) return v.cls.name;
  if (v instanceof PyClass) return 'type';
  if (v instanceof PyFunction || v instanceof Native || typeof v === 'function') return 'function';
  if (v instanceof BoundMethod) return 'method';
  if (v instanceof PyGenerator) return 'generator';
  return 'object';
};

const truthy = (interp, v) => {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (v instanceof PyFloat) return v.v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
  if (v instanceof PyInstance) {
    const b = v.cls.lookup('__bool__');
    if (b) return truthy(interp, interp.call(b, [v]));
    const l = v.cls.lookup('__len__');
    if (l) return num(interp.call(l, [v])) > 0;
  }
  return true;
};

function formatFloat(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return `${x}.0`;
  return String(x).replace(/e\+?(-?)(\d)$/, 'e$10$2').replace(/e\+/, 'e+');
}

function repr(interp, v) {
  if (typeof v === 'string') return v.includes("'") && !v.includes('"') ? `"${v}"` : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  return str(interp, v, true);
}

function str(interp, v, asRepr = false) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : formatFloat(v);
  if (v instanceof PyFloat) return formatFloat(v.v);
  if (typeof v === 'string') return v;
  if (v instanceof PyTuple) return v.length === 1 ? `(${repr(interp, v[0])},)` : `(${v.map((x) => repr(interp, x)).join(', ')})`;
  if (Array.isArray(v)) return `[${v.map((x) => repr(interp, x)).join(', ')}]`;
  if (v instanceof PyDict) return `{${v.items().map(([a, b]) => `${repr(interp, a)}: ${repr(interp, b)}`).join(', ')}}`;
  if (v instanceof PySet) return v.size ? `{${v.items().map((x) => repr(interp, x)).join(', ')}}` : 'set()';
  if (v instanceof PyInstance) {
    const custom = v.cls.lookup(asRepr ? '__repr__' : '__str__') ?? v.cls.lookup('__repr__');
    if (custom) return str(interp, interp.call(custom, [v]));
    if (v.cls.isSubclassOf(BaseException)) { const a = v.attrs.get('args') ?? []; return a.length === 1 ? str(interp, a[0]) : a.length ? str(interp, a) : ''; }
    return `<${v.cls.name} object>`;
  }
  if (v instanceof PyClass) return `<class '${v.name}'>`;
  if (v instanceof PyFunction) return `<function ${v.name}>`;
  if (v instanceof PyGenerator) return `<generator object ${v.name}>`;
  if (v instanceof Native || typeof v === 'function') return `<built-in function ${v.name ?? ''}>`;
  if (v instanceof BoundMethod) return '<bound method>';
  if (v.name !== undefined && v.type !== undefined) return `<${v.type} ${v.name}>`;
  try { return JSON.stringify(v); } catch { return '<object>'; }
}

function formatSpec(interp, value, spec) {
  if (!spec) return str(interp, value);
  const m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([a-zA-Z%])?$/.exec(spec);
  if (!m) raise('ValueError', `Invalid format specifier '${spec}'`);
  const [, fill, align, sign, , zero, width, group, precision, type] = m;
  let text;
  const n = isNum(value) || typeof value === 'boolean' ? Number(num(value)) : null;
  if (n !== null && type !== 's') {
    let body;
    if (type === 'f' || type === 'F') body = Math.abs(n).toFixed(precision != null ? Number(precision) : 6);
    else if (type === 'e' || type === 'E') { body = Math.abs(n).toExponential(precision != null ? Number(precision) : 6).replace(/e([+-])(\d)$/, 'e$10$2'); if (type === 'E') body = body.toUpperCase(); } else if (type === 'g' || type === 'G') body = String(Number(Math.abs(n).toPrecision(precision != null ? Number(precision) || 1 : 6)));
    else if (type === '%') body = `${(Math.abs(n) * 100).toFixed(precision != null ? Number(precision) : 6)}%`;
    else if (type === 'd') body = String(Math.trunc(Math.abs(n)));
    else if (type === 'x') body = Math.trunc(Math.abs(n)).toString(16);
    else if (type === 'X') body = Math.trunc(Math.abs(n)).toString(16).toUpperCase();
    else if (type === 'b') body = Math.trunc(Math.abs(n)).toString(2);
    else if (type === 'o') body = Math.trunc(Math.abs(n)).toString(8);
    else if (precision != null) body = String(Number(Math.abs(n).toPrecision(Number(precision) || 1)));
    else body = str(interp, typeof value === 'number' ? Math.abs(n) : flt(Math.abs(n)));
    if (group) { const [a, b] = body.split('.'); body = a.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (b ? `.${b}` : ''); }
    const prefix = n < 0 ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
    if (zero && width) body = body.padStart(Number(width) - prefix.length, '0');
    text = prefix + body;
  } else {
    text = str(interp, value);
    if (precision != null) text = text.slice(0, Number(precision));
  }
  const w = Number(width ?? 0);
  if (text.length >= w) return text;
  const pad = fill ?? ' ';
  const way = align ?? (n !== null ? '>' : '<');
  if (way === '<') return text.padEnd(w, pad);
  if (way === '^') { const left = Math.floor((w - text.length) / 2); return pad.repeat(left) + text + pad.repeat(w - text.length - left); }
  return text.padStart(w, pad);
}

/** Old-style "%d %s" % values. */
function percentFormat(interp, format, values) {
  const list = values instanceof PyTuple ? [...values] : [values];
  let i = 0;
  return format.replace(/%(%|(?:\(([^)]+)\))?([-+ 0#]*)(\d+)?(?:\.(\d+))?([a-zA-Z]))/g, (all, kind, key, flags, width, precision, type) => {
    if (kind === '%') return '%';
    const value = key != null ? values.get(key) : list[i++];
    const spec = `${flags.includes('-') ? '<' : '>'}${flags.includes('+') ? '+' : ''}${flags.includes('0') ? '0' : ''}${width ?? ''}${precision != null ? `.${precision}` : ''}${type === 's' || type === 'r' ? '' : type === 'i' ? 'd' : type}`;
    return formatSpec(interp, type === 'r' ? repr(interp, value) : type === 's' ? str(interp, value) : value, spec);
  });
}

// ─────────────── the interpreter

const MAX_STEPS = 80_000_000;

class Interpreter {
  constructor(print, modules = {}) {
    this.print = print;
    this.modules = modules;
    this.steps = 0;
    this.depth = 0;
    this.line = 0;
    this.globals = new Scope(null, 'module');
    this.builtins = makeBuiltins(this);
    this.globals.vars.set('__name__', '__main__');
  }

  run(code) { this.exec(parse(code), this.globals); }

  exec(list, scope) {
    for (const node of list) {
      this.line = node.line ?? this.line;
      if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
      this.statement(node, scope);
    }
  }

  /** A generator's body: like exec, but the statements that hold a yield pass it out. */
  *execG(list, scope) {
    for (const node of list) {
      this.line = node.line ?? this.line;
      if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
      if (node.y) yield* this.statementG(node, scope);
      else this.statement(node, scope);
    }
  }

  /** The value of a yield (what send() gave back) or of a yield from (what the inner generator returned). */
  *yieldValue(node, scope) {
    if (node.k === 'Yield') { const sent = yield (node.value ? this.eval(node.value, scope) : null); return sent ?? null; }
    if (node.k === 'YieldFrom') {
      const source = this.eval(node.value, scope);
      if (source instanceof PyGenerator) {
        let r = source.resume(null);
        while (!r.done) { const sent = yield r.value; r = source.resume(sent ?? null); }
        return r.value;
      }
      for (const x of this.iterate(source)) yield x;
      return null;
    }
    return raise('SyntaxError', 'yield is supported as a statement, on the right of an assignment or in brackets there, not inside a larger expression');
  }

  *statementG(n, scope) {
    switch (n.k) {
      case 'Expr': yield* this.yieldValue(n.value, scope); return;
      case 'Assign': { const v = yield* this.yieldValue(n.value, scope); for (const t of n.targets) this.assign(t, v, scope); return; }
      case 'AnnAssign': { const v = yield* this.yieldValue(n.value, scope); this.assign(n.target, v, scope); return; }
      case 'AugAssign': { const current = this.eval(n.target, scope); const right = yield* this.yieldValue(n.value, scope); this.assign(n.target, this.binary(n.op, current, right), scope); return; }
      case 'If': { if (truthy(this, this.eval(n.test, scope))) yield* this.execG(n.body, scope); else yield* this.execG(n.orelse, scope); return; }
      case 'While': {
        let broken = false;
        while (truthy(this, this.eval(n.test, scope))) {
          if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
          try { yield* this.execG(n.body, scope); } catch (e) { if (e instanceof BreakSignal) { broken = true; break; } if (!(e instanceof ContinueSignal)) throw e; }
        }
        if (!broken) yield* this.execG(n.orelse, scope);
        return;
      }
      case 'For': {
        let broken = false;
        for (const item of this.iterate(this.eval(n.iter, scope))) {
          if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
          this.assign(n.target, item, scope);
          try { yield* this.execG(n.body, scope); } catch (e) { if (e instanceof BreakSignal) { broken = true; break; } if (!(e instanceof ContinueSignal)) throw e; }
        }
        if (!broken) yield* this.execG(n.orelse, scope);
        return;
      }
      case 'With': {
        const entered = n.items.map((it) => {
          const manager = this.eval(it.e, scope);
          const value = this.call(this.getAttr(manager, '__enter__'), []);
          if (it.as) this.assign(it.as, value, scope);
          return manager;
        });
        try { yield* this.execG(n.body, scope); } finally { for (const m of entered.reverse()) this.call(this.getAttr(m, '__exit__'), [null, null, null]); }
        return;
      }
      case 'Try': {
        let pending = null;
        // Closing the generator unwinds it without coming back here: the finally block then runs in the unwinding.
        let finished = false;
        try {
          try {
            yield* this.execG(n.body, scope);
            yield* this.execG(n.orelse, scope);
          } catch (raw) {
          const e = raw instanceof PyRaise ? raw : this.wrapError(raw);
          if (!e) pending = raw;
          else {
            let handled = false;
            for (const h of n.handlers) {
              if (!this.matches(e.instance, h.type ? this.eval(h.type, scope) : null)) continue;
              handled = true;
              if (h.name) this.setName(h.name, e.instance, scope);
              const prior = this.handling;
              this.handling = e;
              try { yield* this.execG(h.body, scope); } catch (inner) { pending = inner; } finally { this.handling = prior; }
              break;
            }
            if (!handled) pending = e;
          }
          }
          finished = true;
        } finally {
          if (!finished) this.exec(n.finalbody, scope);
        }
        yield* this.execG(n.finalbody, scope);
        if (pending) throw pending;
        return;
      }
      case 'Return': throw new ReturnSignal(n.value ? yield* this.yieldValue(n.value, scope) : null);
      default: return raise('SyntaxError', `yield cannot stand in a ${n.k} statement here`);
    }
  }

  statement(n, scope) {
    switch (n.k) {
      case 'Expr': this.eval(n.value, scope); return;
      case 'Assign': { const v = this.eval(n.value, scope); for (const t of n.targets) this.assign(t, v, scope); return; }
      case 'AnnAssign': {
        if (n.value) this.assign(n.target, this.eval(n.value, scope), scope);
        else if (scope.kind === 'class') { /* only the annotation */ }
        if (scope.kind === 'class' && n.target.k === 'Name') {
          const ann = scope.vars.get('__annotations__') ?? new PyDict();
          ann.set(n.target.name, this.eval(n.annotation, scope));
          scope.vars.set('__annotations__', ann);
        }
        return;
      }
      case 'AugAssign': {
        const current = this.eval(n.target, scope);
        const right = this.eval(n.value, scope);
        // Lists grow in place, as Python does.
        if (n.op === '+' && Array.isArray(current) && !(current instanceof PyTuple)) { for (const x of this.iterate(right)) current.push(x); return; }
        this.assign(n.target, this.binary(n.op, current, right), scope);
        return;
      }
      case 'Pass': return;
      case 'If': {
        if (truthy(this, this.eval(n.test, scope))) this.exec(n.body, scope); else this.exec(n.orelse, scope);
        return;
      }
      case 'While': {
        let broken = false;
        while (truthy(this, this.eval(n.test, scope))) {
          if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
          try { this.exec(n.body, scope); } catch (e) { if (e instanceof BreakSignal) { broken = true; break; } if (!(e instanceof ContinueSignal)) throw e; }
        }
        if (!broken) this.exec(n.orelse, scope);
        return;
      }
      case 'For': {
        let broken = false;
        for (const item of this.iterate(this.eval(n.iter, scope))) {
          if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
          this.assign(n.target, item, scope);
          try { this.exec(n.body, scope); } catch (e) { if (e instanceof BreakSignal) { broken = true; break; } if (!(e instanceof ContinueSignal)) throw e; }
        }
        if (!broken) this.exec(n.orelse, scope);
        return;
      }
      case 'Break': throw new BreakSignal();
      case 'Continue': throw new ContinueSignal();
      case 'Return': throw new ReturnSignal(n.value ? this.eval(n.value, scope) : null);
      case 'Def': {
        let fn = new PyFunction(n.name, this.params(n.params, scope), n.body, scope, this);
        fn.generator = Boolean(n.generator);
        for (const d of [...(n.decorators ?? [])].reverse()) fn = this.call(this.eval(d, scope), [fn]);
        this.setName(n.name, fn, scope);
        return;
      }
      case 'Class': {
        const bases = n.bases.map((b) => this.eval(b, scope));
        const inner = new Scope(scope, 'class');
        this.exec(n.body, inner);
        const cls = new PyClass(n.name, bases.filter((b) => b instanceof PyClass), inner.vars);
        let out = cls;
        for (const d of [...(n.decorators ?? [])].reverse()) out = this.call(this.eval(d, scope), [out]);
        this.setName(n.name, out, scope);
        return;
      }
      case 'Global': (scope.globals ??= new Set()); for (const x of n.names) scope.globals.add(x); return;
      case 'Nonlocal': (scope.nonlocals ??= new Set()); for (const x of n.names) scope.nonlocals.add(x); return;
      case 'Del': {
        for (const t of n.targets) {
          if (t.k === 'Name') { if (!scope.vars.delete(t.name)) raise('NameError', `name '${t.name}' is not defined`); } else if (t.k === 'Index') this.deleteItem(this.eval(t.obj, scope), this.eval(t.index, scope));
          else if (t.k === 'Attr') { const o = this.eval(t.obj, scope); if (o instanceof PyInstance) o.attrs.delete(t.name); else delete o[t.name]; }
        }
        return;
      }
      case 'Assert': {
        if (!truthy(this, this.eval(n.test, scope))) raise('AssertionError', n.msg ? str(this, this.eval(n.msg, scope)) : '');
        return;
      }
      case 'Raise': {
        if (!n.exc) { if (this.handling) throw this.handling; raise('RuntimeError', 'No active exception to reraise'); }
        let v = this.eval(n.exc, scope);
        if (v instanceof PyClass) v = this.call(v, []);
        throw new PyRaise(v, this.line);
      }
      case 'Try': return this.tryStatement(n, scope);
      case 'With': {
        const entered = n.items.map((it) => {
          const manager = this.eval(it.e, scope);
          const value = this.call(this.getAttr(manager, '__enter__'), []);
          if (it.as) this.assign(it.as, value, scope);
          return manager;
        });
        try { this.exec(n.body, scope); } finally { for (const m of entered.reverse()) this.call(this.getAttr(m, '__exit__'), [null, null, null]); }
        return;
      }
      case 'Import': {
        for (const { name, as } of n.names) {
          const top = name.split('.')[0];
          const module = this.importModule(name);
          if (as) this.setName(as, module, scope); else this.setName(top, this.importModule(top), scope);
        }
        return;
      }
      case 'ImportFrom': {
        const module = this.importModule(n.module);
        for (const { name, as } of n.names) {
          if (name === '*') { for (const key of Object.keys(module)) if (!key.startsWith('_')) this.setName(key, module[key], scope); continue; }
          if (!(name in module)) raise('ImportError', `cannot import name '${name}' from '${n.module}'`);
          this.setName(as ?? name, module[name], scope);
        }
        return;
      }
      default: throw new Error(`Unknown statement ${n.k}`);
    }
    return undefined;
  }

  tryStatement(n, scope) {
    let pending = null;
    try {
      this.exec(n.body, scope);
      this.exec(n.orelse, scope);
    } catch (raw) {
      const e = raw instanceof PyRaise ? raw : this.wrapError(raw);
      if (!e) { pending = raw; } else {
        let handled = false;
        for (const h of n.handlers) {
          if (!this.matches(e.instance, h.type ? this.eval(h.type, scope) : null)) continue;
          handled = true;
          if (h.name) this.setName(h.name, e.instance, scope);
          const prior = this.handling;
          this.handling = e;
          try { this.exec(h.body, scope); } catch (inner) { pending = inner; } finally { this.handling = prior; }
          break;
        }
        if (!handled) pending = e;
      }
    }
    this.exec(n.finalbody, scope);
    if (pending) throw pending;
  }

  /** Signals keep going; anything a JavaScript function threw becomes a Python exception. */
  wrapError(raw) {
    if (raw instanceof BreakSignal || raw instanceof ContinueSignal || raw instanceof ReturnSignal) return null;
    const type = raw instanceof RangeError ? 'RecursionError' : 'RuntimeError';
    const inst = new PyInstance(ERRORS[type]);
    inst.attrs.set('args', tuple([raw?.message ?? String(raw)]));
    return new PyRaise(inst, this.line);
  }

  matches(instance, type) {
    if (!type) return true;
    if (type instanceof PyTuple || Array.isArray(type)) return type.some((t) => this.matches(instance, t));
    return instance instanceof PyInstance && instance.cls.isSubclassOf(type);
  }

  params(list, scope) { return list.map((p) => ({ ...p, value: p.def ? this.eval(p.def, scope) : undefined })); }

  setName(name, value, scope) {
    if (scope.globals?.has(name)) { this.globals.vars.set(name, value); return; }
    if (scope.nonlocals?.has(name)) {
      for (let s = scope.parent; s; s = s.parent) if (s.kind !== 'class' && s.vars.has(name)) { s.vars.set(name, value); return; }
    }
    scope.vars.set(name, value);
  }

  lookup(name, scope) {
    let s = scope;
    if (s.globals?.has(name)) s = this.globals;
    const first = s;
    for (; s; s = s.parent) {
      // A class body's names are not visible from the functions inside it.
      if (s.kind === 'class' && s !== first) continue;
      if (s.vars.has(name)) return s.vars.get(name);
    }
    if (name in this.builtins) return this.builtins[name];
    return raise('NameError', `name '${name}' is not defined`);
  }

  assign(target, value, scope) {
    switch (target.k) {
      case 'Name': this.setName(target.name, value, scope); return;
      case 'Tuple': case 'List': {
        const items = [...this.iterate(value)];
        const starAt = target.elts.findIndex((e) => e.k === 'Star');
        if (starAt < 0) {
          if (items.length !== target.elts.length) raise('ValueError', items.length > target.elts.length ? `too many values to unpack (expected ${target.elts.length})` : `not enough values to unpack (expected ${target.elts.length}, got ${items.length})`);
          target.elts.forEach((e, i) => this.assign(e, items[i], scope));
        } else {
          const after = target.elts.length - starAt - 1;
          target.elts.slice(0, starAt).forEach((e, i) => this.assign(e, items[i], scope));
          this.assign(target.elts[starAt].value, items.slice(starAt, items.length - after), scope);
          target.elts.slice(starAt + 1).forEach((e, i) => this.assign(e, items[items.length - after + i], scope));
        }
        return;
      }
      case 'Attr': this.setAttr(this.eval(target.obj, scope), target.name, value); return;
      case 'Index': this.setItem(this.eval(target.obj, scope), this.eval(target.index, scope), value); return;
      default: raise('TypeError', 'cannot assign to this expression');
    }
  }

  eval(n, scope) {
    switch (n.k) {
      case 'Const': return n.value;
      case 'Name': return this.lookup(n.name, scope);
      case 'Tuple': return tuple(this.expand(n.elts, scope));
      case 'List': return this.expand(n.elts, scope);
      case 'SetLit': return new PySet(this.expand(n.elts, scope));
      case 'Dict': {
        const d = new PyDict();
        n.keys.forEach((k, i) => {
          if (k === null) { const other = this.eval(n.values[i], scope); for (const [a, b] of other.items()) d.set(a, b); } else d.set(this.eval(k, scope), this.eval(n.values[i], scope));
        });
        return d;
      }
      case 'FString': return n.parts.map((part) => {
        if (typeof part === 'string') return part;
        let v = this.eval(part.expr, scope);
        if (part.conv === 'r') v = repr(this, v); else if (part.conv === 's') v = str(this, v);
        const spec = part.spec.includes('{') ? part.spec.replace(/\{([^}]+)\}/g, (_, code) => str(this, this.eval(parseExpressionText(code, this.line), scope))) : part.spec;
        return formatSpec(this, v, spec);
      }).join('');
      case 'Bin': return this.binary(n.op, this.eval(n.left, scope), this.eval(n.right, scope));
      case 'Unary': {
        const v = this.eval(n.value, scope);
        if (n.op === '-') { if (v instanceof PyInstance) return this.call(this.getAttr(v, '__neg__'), []); if (v instanceof PyFloat) return flt(-v.v); if (isNum(v) || typeof v === 'boolean') return -Number(v); }
        if (n.op === '+') return v;
        if (n.op === '~') return ~num(v);
        return raise('TypeError', `bad operand type for unary ${n.op}: '${typeName(v)}'`);
      }
      case 'Not': return !truthy(this, this.eval(n.value, scope));
      case 'And': { const l = this.eval(n.left, scope); return truthy(this, l) ? this.eval(n.right, scope) : l; }
      case 'Or': { const l = this.eval(n.left, scope); return truthy(this, l) ? l : this.eval(n.right, scope); }
      case 'IfExp': return truthy(this, this.eval(n.test, scope)) ? this.eval(n.body, scope) : this.eval(n.orelse, scope);
      case 'Walrus': { const v = this.eval(n.value, scope); this.setName(n.target.name, v, scope); return v; }
      case 'Compare': {
        let left = this.eval(n.first, scope);
        for (let i = 0; i < n.ops.length; i++) {
          const right = this.eval(n.rest[i], scope);
          if (!this.compare(n.ops[i], left, right)) return false;
          left = right;
        }
        return true;
      }
      case 'Attr': this.line = n.line ?? this.line; return this.getAttr(this.eval(n.obj, scope), n.name);
      case 'Index': return this.getItem(this.eval(n.obj, scope), this.eval(n.index, scope));
      case 'Slice': return { slice: true, start: n.start ? num(this.eval(n.start, scope)) : null, stop: n.stop ? num(this.eval(n.stop, scope)) : null, step: n.step ? num(this.eval(n.step, scope)) : null };
      case 'Call': {
        this.line = n.line ?? this.line;
        const fn = this.eval(n.fn, scope);
        const args = this.expand(n.args, scope);
        let kwargs = null;
        if (n.kwargs.length) {
          kwargs = new Map();
          for (const k of n.kwargs) {
            if (k.dstar) { for (const [a, b] of this.eval(k.dstar, scope).items()) kwargs.set(a, b); } else kwargs.set(k.name, this.eval(k.value, scope));
          }
        }
        return this.call(fn, args, kwargs);
      }
      case 'Yield': case 'YieldFrom': return raise('SyntaxError', 'yield is supported as a statement, on the right of an assignment or in brackets there, not inside a larger expression');
      case 'Lambda': return new PyFunction('<lambda>', this.params(n.params, scope), n.body, scope, this, true);
      case 'ListComp': return this.comprehend(n, scope, 'list');
      case 'Gen': return this.comprehend(n, scope, 'list');
      case 'SetComp': return new PySet(this.comprehend(n, scope, 'list'));
      case 'DictComp': return this.comprehend(n, scope, 'dict');
      case 'Star': return raise('TypeError', 'can only use * in a call or a list');
      default: throw new Error(`Unknown expression ${n.k}`);
    }
  }

  expand(list, scope) {
    const out = [];
    for (const e of list) {
      if (e.k === 'Star') out.push(...this.iterate(this.eval(e.value, scope)));
      else out.push(this.eval(e, scope));
    }
    return out;
  }

  comprehend(n, scope, kind) {
    const inner = new Scope(scope, 'function');
    const out = kind === 'dict' ? new PyDict() : [];
    const walk = (i) => {
      if (i === n.clauses.length) {
        if (kind === 'dict') out.set(this.eval(n.element, inner), this.eval(n.value, inner));
        else out.push(this.eval(n.element, inner));
        return;
      }
      const c = n.clauses[i];
      for (const item of this.iterate(this.eval(c.iter, inner))) {
        if (++this.steps > MAX_STEPS) raise('TimeoutError', 'The script ran too long and was stopped');
        this.assign(c.target, item, inner);
        if (c.ifs.every((t) => truthy(this, this.eval(t, inner)))) walk(i + 1);
      }
    };
    walk(0);
    return out;
  }

  *iterate(v) {
    if (Array.isArray(v) || typeof v === 'string') { yield* v; return; }
    if (v instanceof PyDict) { yield* v.keys(); return; }
    if (v instanceof PySet) { yield* v.items(); return; }
    if (v instanceof PyInstance) {
      const it = v.cls.lookup('__iter__');
      if (it) { yield* this.iterate(this.call(it, [v])); return; }
      const next = v.cls.lookup('__next__');
      if (next) {
        for (;;) {
          try { yield this.call(next, [v]); } catch (e) { if (e instanceof PyRaise && e.instance.cls.isSubclassOf(ERRORS.StopIteration)) return; throw e; }
        }
      }
      const getitem = v.cls.lookup('__getitem__');
      if (getitem) {
        for (let i = 0; ; i++) {
          try { yield this.call(getitem, [v, i]); } catch (e) { if (e instanceof PyRaise && e.instance.cls.isSubclassOf(ERRORS.IndexError)) return; throw e; }
        }
      }
    }
    if (v && typeof v[Symbol.iterator] === 'function') { yield* v; return; }
    raise('TypeError', `'${typeName(v)}' object is not iterable`);
  }

  compare(op, a, b) {
    switch (op) {
      case '==': return this.equal(a, b);
      case '!=': return !this.equal(a, b);
      case 'is': return a === b || (a == null && b == null);
      case 'is not': return !(a === b || (a == null && b == null));
      case 'in': return this.contains(b, a);
      case 'not in': return !this.contains(b, a);
      default:
    }
    if (a instanceof PyInstance) {
      const m = a.cls.lookup({ '<': '__lt__', '>': '__gt__', '<=': '__le__', '>=': '__ge__' }[op]);
      if (m) return truthy(this, this.call(m, [a, b]));
    }
    const [x, y] = [num(a), num(b)];
    const order = (p, q) => {
      if (Array.isArray(p) && Array.isArray(q)) {
        for (let i = 0; i < Math.min(p.length, q.length); i++) { if (!this.equal(p[i], q[i])) return order(num(p[i]), num(q[i])); }
        return p.length - q.length;
      }
      if ((typeof p === 'number' || typeof p === 'boolean') && (typeof q === 'number' || typeof q === 'boolean')) return Number(p) - Number(q);
      if (typeof p === 'string' && typeof q === 'string') return p < q ? -1 : p > q ? 1 : 0;
      return raise('TypeError', `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
    };
    const c = order(x, y);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  }

  equal(a, b) {
    if (a instanceof PyInstance) { const m = a.cls.lookup('__eq__'); if (m) return truthy(this, this.call(m, [a, b])); return a === b; }
    const [x, y] = [num(a), num(b)];
    if (x === y) return true;
    if ((x == null) !== (y == null)) return false;
    if (typeof x === 'boolean' || typeof y === 'boolean') return Number(x) === Number(y);
    if (Array.isArray(x) && Array.isArray(y)) return (x instanceof PyTuple) === (y instanceof PyTuple) && x.length === y.length && x.every((v, i) => this.equal(v, y[i]));
    if (x instanceof PyDict && y instanceof PyDict) return x.size === y.size && x.keys().every((k) => y.has(k) && this.equal(x.get(k), y.get(k)));
    if (x instanceof PySet && y instanceof PySet) return x.size === y.size && x.items().every((k) => y.has(k));
    return false;
  }

  contains(container, item) {
    if (typeof container === 'string') return container.includes(item);
    if (container instanceof PyDict || container instanceof PySet) return container.has(item);
    if (container instanceof PyInstance) { const m = container.cls.lookup('__contains__'); if (m) return truthy(this, this.call(m, [container, item])); }
    if (Array.isArray(container) && typeof item === 'string' && container.some((x) => x?.name === item)) return true;
    for (const x of this.iterate(container)) if (this.equal(x, item)) return true;
    return false;
  }

  binary(op, a, b) {
    if (a instanceof PyInstance || (a && typeof a === 'object' && a.__js_ops)) {
      const name = { '+': '__add__', '-': '__sub__', '*': '__mul__', '/': '__truediv__', '//': '__floordiv__', '%': '__mod__', '**': '__pow__', '@': '__matmul__' }[op];
      const m = a instanceof PyInstance ? a.cls.lookup(name) : a[name];
      if (m) return this.call(a instanceof PyInstance ? m : new Native(name, (args) => m.apply(a, args)), a instanceof PyInstance ? [a, b] : [b]);
    }
    if (b instanceof PyInstance || (b && typeof b === 'object' && b.__js_ops)) {
      const name = { '+': '__radd__', '-': '__rsub__', '*': '__rmul__', '/': '__rtruediv__' }[op];
      const m = name && (b instanceof PyInstance ? b.cls.lookup(name) : b[name]);
      if (m) return this.call(b instanceof PyInstance ? m : new Native(name, (args) => m.apply(b, args)), b instanceof PyInstance ? [b, a] : [a]);
    }
    if (op === '%' && typeof a === 'string') return percentFormat(this, a, b);
    const numeric = (x) => isNum(x) || typeof x === 'boolean';
    if (op === '+') {
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) { if ((a instanceof PyTuple) !== (b instanceof PyTuple)) raise('TypeError', `can only concatenate ${typeName(a)} to ${typeName(a)}`); const out = [...a, ...b]; return a instanceof PyTuple ? tuple(out) : out; }
    }
    if (op === '*') {
      const seq = (s, k) => { if (typeof s === 'string') return s.repeat(Math.max(0, k)); const out = []; for (let i = 0; i < k; i++) out.push(...s); return s instanceof PyTuple ? tuple(out) : out; };
      if ((typeof a === 'string' || Array.isArray(a)) && numeric(b)) return seq(a, Number(num(b)));
      if ((typeof b === 'string' || Array.isArray(b)) && numeric(a)) return seq(b, Number(num(a)));
    }
    if (a instanceof PySet && b instanceof PySet) {
      if (op === '|') return new PySet([...a.items(), ...b.items()]);
      if (op === '&') return new PySet(a.items().filter((x) => b.has(x)));
      if (op === '-') return new PySet(a.items().filter((x) => !b.has(x)));
    }
    if (!numeric(a) || !numeric(b)) raise('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
    const [x, y] = [Number(num(a)), Number(num(b))];
    const anyFloat = a instanceof PyFloat || b instanceof PyFloat;
    const keep = (v) => (anyFloat ? flt(v) : v);
    switch (op) {
      case '+': return keep(x + y);
      case '-': return keep(x - y);
      case '*': return keep(x * y);
      case '/': if (y === 0) raise('ZeroDivisionError', 'division by zero'); return flt(x / y);
      case '//': if (y === 0) raise('ZeroDivisionError', 'integer division or modulo by zero'); return keep(Math.floor(x / y));
      case '%': if (y === 0) raise('ZeroDivisionError', 'integer modulo by zero'); return keep(x - y * Math.floor(x / y));
      case '**': if (y < 0 || anyFloat) return flt(x ** y); return x ** y;
      case '<<': return x * 2 ** y;
      case '>>': return Math.floor(x / 2 ** y);
      case '&': return x & y;
      case '|': return x | y;
      case '^': return x ^ y;
      default: return raise('TypeError', `unsupported operator ${op}`);
    }
  }

  getItem(o, index) {
    const i = num(index);
    if (o instanceof PyInstance) { const m = o.cls.lookup('__getitem__'); if (m) return this.call(m, [o, index]); raise('TypeError', `'${o.cls.name}' object is not subscriptable`); }
    if (o instanceof PyDict) { const v = o.get(index); if (v === undefined) { const e = new PyInstance(ERRORS.KeyError); e.attrs.set('args', tuple([index])); throw new PyRaise(e); } return v; }
    if (typeof o === 'string' || Array.isArray(o)) {
      if (index?.slice === true) return this.slice(o, index);
      if (typeof i === 'string' && Array.isArray(o)) { const hit = o.find((x) => x?.name === i); if (!hit) { const e = new PyInstance(ERRORS.KeyError); e.attrs.set('args', tuple([i])); throw new PyRaise(e); } return hit; }
      if (typeof i !== 'number') raise('TypeError', `indices must be integers, not ${typeName(index)}`);
      const at = i < 0 ? o.length + i : i;
      if (at < 0 || at >= o.length) raise('IndexError', `${typeof o === 'string' ? 'string' : 'list'} index out of range`);
      return o[at];
    }
    if (o && typeof o === 'object') { const v = o[i]; if (v !== undefined) return v; }
    return raise('TypeError', `'${typeName(o)}' object is not subscriptable`);
  }

  slice(o, { start, stop, step }) {
    const len = o.length;
    const s = step ?? 1;
    if (s === 0) raise('ValueError', 'slice step cannot be zero');
    const norm = (v, fallback) => { if (v == null) return fallback; const x = v < 0 ? len + v : v; return s > 0 ? Math.max(0, Math.min(len, x)) : Math.max(-1, Math.min(len - 1, x)); };
    const [a, b] = s > 0 ? [norm(start, 0), norm(stop, len)] : [norm(start, len - 1), norm(stop, -1)];
    const out = [];
    for (let i = a; s > 0 ? i < b : i > b; i += s) out.push(o[i]);
    if (typeof o === 'string') return out.join('');
    return o instanceof PyTuple ? tuple(out) : out;
  }

  setItem(o, index, value) {
    if (o instanceof PyInstance) { const m = o.cls.lookup('__setitem__'); if (m) { this.call(m, [o, index, value]); return; } raise('TypeError', `'${o.cls.name}' object does not support item assignment`); }
    if (o instanceof PyDict) { o.set(index, value); return; }
    if (o instanceof PyTuple) raise('TypeError', "'tuple' object does not support item assignment");
    if (Array.isArray(o)) {
      if (index?.slice === true) { const { start, stop } = index; o.splice(start ?? 0, (stop ?? o.length) - (start ?? 0), ...this.iterate(value)); return; }
      const i = num(index);
      const at = i < 0 ? o.length + i : i;
      if (at < 0 || at >= o.length) raise('IndexError', 'list assignment index out of range');
      o[at] = num(value);
      return;
    }
    if (o && typeof o === 'object') { o[num(index)] = toJS(value); return; }
    raise('TypeError', `'${typeName(o)}' object does not support item assignment`);
  }

  deleteItem(o, index) {
    if (o instanceof PyDict) { if (!o.delete(index)) raise('KeyError', str(this, index)); return; }
    if (Array.isArray(o)) {
      if (index?.slice === true) { const { start, stop } = index; o.splice(start ?? 0, (stop ?? o.length) - (start ?? 0)); return; }
      const i = num(index);
      o.splice(i < 0 ? o.length + i : i, 1);
      return;
    }
    raise('TypeError', `'${typeName(o)}' object doesn't support item deletion`);
  }

  getAttr(o, name) {
    if (o === null || o === undefined) raise('AttributeError', `'NoneType' object has no attribute '${name}'`);
    if (o instanceof PyGenerator) {
      const step = (r) => { if (r.done) { const inst = new PyInstance(ERRORS.StopIteration); inst.attrs.set('args', tuple([r.value])); inst.attrs.set('value', r.value); throw new PyRaise(inst, this.line); } return r.value; };
      if (name === 'send') return native('send', ([v]) => step(o.resume(v ?? null)));
      if (name === '__next__') return native('__next__', () => step(o.resume(null)));
      if (name === '__iter__') return native('__iter__', () => o);
      if (name === 'close') return native('close', () => { o.resume(null, 'close'); return null; });
      if (name === 'throw') return native('throw', ([e]) => step(o.resume(null, 'throw', new PyRaise(e instanceof PyClass ? this.call(e, []) : e, this.line))));
      raise('AttributeError', `'generator' object has no attribute '${name}'`);
    }
    if (o instanceof PyInstance) {
      if (o.attrs.has(name)) return o.attrs.get(name);
      if (name === '__class__') return o.cls;
      const v = o.cls.lookup(name);
      if (v !== undefined) {
        if (v instanceof PyFunction || v instanceof Native) return new BoundMethod(o, v);
        if (v instanceof PropertyValue) return this.call(v.getter, [o]);
        if (v instanceof StaticValue) return v.fn;
        if (v instanceof ClassValue) return new BoundMethod(o.cls, v.fn);
        return v;
      }
      const ga = o.cls.lookup('__getattr__');
      if (ga) return this.call(ga, [o, name]);
      return raise('AttributeError', `'${o.cls.name}' object has no attribute '${name}'`);
    }
    if (o instanceof PyClass) {
      if (name === '__name__') return o.name;
      const v = o.lookup(name);
      if (v instanceof StaticValue) return v.fn;
      if (v instanceof ClassValue) return new BoundMethod(o, v.fn);
      if (v !== undefined) return v;
      return raise('AttributeError', `type object '${o.name}' has no attribute '${name}'`);
    }
    const method = methodOf(this, o, name);
    if (method) return method;
    if (o instanceof Vector && name === 'length') return flt(Math.hypot(...o));
    if (typeof o === 'object' || typeof o === 'function') {
      if (name in o) return wrapJS(o, o[name]);
      // location.x, location.y, location.z
      if (Array.isArray(o) && ['x', 'y', 'z', 'w'].includes(name)) return o['xyzw'.indexOf(name)];
    }
    return raise('AttributeError', `'${typeName(o)}' object has no attribute '${name}'`);
  }

  setAttr(o, name, value) {
    if (o instanceof PyInstance) {
      const v = o.cls.lookup(name);
      if (v instanceof PropertyValue && v.setter) { this.call(v.setter, [o, value]); return; }
      o.attrs.set(name, value);
      return;
    }
    if (o instanceof PyClass) { o.attrs.set(name, value); return; }
    if (Array.isArray(o) && ['x', 'y', 'z', 'w'].includes(name)) { o['xyzw'.indexOf(name)] = num(value); return; }
    if (o && typeof o === 'object') { o[name] = toJS(value); return; }
    raise('AttributeError', `'${typeName(o)}' object has no attribute '${name}'`);
  }

  call(fn, args = [], kwargs = null) {
    if (fn instanceof BoundMethod) return this.call(fn.fn, [fn.self, ...args], kwargs);
    if (fn instanceof Native) return fn.fn(args, kwargs);
    if (fn instanceof PyClass) return this.instantiate(fn, args, kwargs);
    if (fn instanceof PyFunction) return this.callFunction(fn, args, kwargs);
    if (typeof fn === 'function') {
      // A JavaScript function: keyword arguments arrive as one object, the way the operators want them.
      const js = args.map(toJS);
      if (kwargs) js.push(Object.fromEntries([...kwargs].map(([k, v]) => [k, toJS(v)])));
      return fromJS(fn(...js));
    }
    if (fn instanceof PyInstance) { const m = fn.cls.lookup('__call__'); if (m) return this.call(m, [fn, ...args], kwargs); }
    return raise('TypeError', `'${typeName(fn)}' object is not callable`);
  }

  instantiate(cls, args, kwargs) {
    const inst = new PyInstance(cls);
    if (cls.isSubclassOf(BaseException)) inst.attrs.set('args', tuple(args));
    const init = cls.lookup('__init__');
    if (init) this.call(init, [inst, ...args], kwargs);
    return inst;
  }

  callFunction(fn, args, kwargs) {
    if (++this.depth > 300) { this.depth = 0; raise('RecursionError', 'maximum recursion depth exceeded'); }
    const scope = new Scope(fn.scope, 'function');
    const rest = new Map(kwargs ?? []);
    let i = 0;
    let afterStar = false;
    for (const p of fn.params) {
      if (p.star) { afterStar = true; if (p.name) { scope.vars.set(p.name, tuple(args.slice(i))); i = args.length; } continue; }
      if (p.dstar) { const d = new PyDict(); for (const [k, v] of rest) d.set(k, v); rest.clear(); scope.vars.set(p.name, d); continue; }
      if (!afterStar && i < args.length) {
        if (rest.has(p.name)) raise('TypeError', `${fn.name}() got multiple values for argument '${p.name}'`);
        scope.vars.set(p.name, args[i++]);
      } else if (rest.has(p.name)) { scope.vars.set(p.name, rest.get(p.name)); rest.delete(p.name); } else if (p.def) scope.vars.set(p.name, p.value);
      else raise('TypeError', `${fn.name}() missing 1 required positional argument: '${p.name}'`);
    }
    if (i < args.length) raise('TypeError', `${fn.name}() takes ${fn.params.filter((p) => !p.star && !p.dstar).length} positional arguments but ${args.length} were given`);
    if (rest.size) raise('TypeError', `${fn.name}() got an unexpected keyword argument '${[...rest.keys()][0]}'`);
    if (fn.generator) { this.depth--; return new PyGenerator(this, fn, scope); }
    try {
      if (fn.isLambda) return this.eval(fn.body, scope);
      this.exec(fn.body, scope);
      return null;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    } finally {
      this.depth--;
    }
  }

  importModule(name) {
    const parts = name.split('.');
    let m = this.modules[parts[0]];
    if (!m) raise('ModuleNotFoundError', `No module named '${parts[0]}' (this Python has: ${Object.keys(this.modules).sort().join(', ')})`);
    for (const p of parts.slice(1)) { m = m[p]; if (!m) raise('ModuleNotFoundError', `No module named '${name}'`); }
    return m;
  }
}

class PropertyValue { constructor(getter, setter = null) { this.getter = getter; this.setter = setter; } }
class StaticValue { constructor(fn) { this.fn = fn; } }
class ClassValue { constructor(fn) { this.fn = fn; } }

/** Python values going into JavaScript (operators, document fields). */
function toJS(v) {
  if (v instanceof PyFloat) return v.v;
  if (v === undefined) return null;
  if (Array.isArray(v)) return Array.from(v, toJS);
  if (v instanceof PyDict) return Object.fromEntries(v.items().map(([a, b]) => [String(a), toJS(b)]));
  if (v instanceof PySet) return v.items().map(toJS);
  if (v instanceof PyInstance && v.attrs.has('__js__')) return v.attrs.get('__js__');
  return v;
}

/** JavaScript values coming back: arrays stay live (so that obj.location[0] = 1 writes through), floats print as floats. */
function fromJS(v) {
  if (v === undefined) return null;
  if (typeof v === 'number' && !Number.isInteger(v)) return flt(v);
  return v;
}

function wrapJS(owner, value) {
  if (typeof value === 'function') return new Native(value.name, (args, kwargs) => {
    const js = args.map(toJS);
    if (kwargs) js.push(Object.fromEntries([...kwargs].map(([k, v]) => [k, toJS(v)])));
    return fromJS(value.apply(owner, js));
  });
  return fromJS(value);
}

const STR_METHODS = {
  upper: (s) => s.toUpperCase(), lower: (s) => s.toLowerCase(), strip: (s, c) => (c == null ? s.trim() : s.replace(new RegExp(`^[${escapeClass(c)}]+|[${escapeClass(c)}]+$`, 'g'), '')),
  lstrip: (s, c) => (c == null ? s.trimStart() : s.replace(new RegExp(`^[${escapeClass(c)}]+`), '')), rstrip: (s, c) => (c == null ? s.trimEnd() : s.replace(new RegExp(`[${escapeClass(c)}]+$`), '')),
  split: (s, sep, max) => { const parts = sep == null ? s.trim().split(/\s+/).filter(Boolean) : s.split(sep); if (max != null && parts.length > max + 1) return [...parts.slice(0, max), parts.slice(max).join(sep ?? ' ')]; return parts; },
  splitlines: (s) => s.split(/\r?\n/), join: null, replace: (s, a, b, n) => { if (n == null) return s.split(a).join(b); let out = s; let left = n; let at = 0; while (left-- > 0) { const i = out.indexOf(a, at); if (i < 0) break; out = out.slice(0, i) + b + out.slice(i + a.length); at = i + b.length; } return out; },
  startswith: (s, x) => (Array.isArray(x) ? x.some((y) => s.startsWith(y)) : s.startsWith(x)), endswith: (s, x) => (Array.isArray(x) ? x.some((y) => s.endsWith(y)) : s.endsWith(x)), find: (s, x) => s.indexOf(x), rfind: (s, x) => s.lastIndexOf(x), count: (s, x) => s.split(x).length - 1,
  title: (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()), capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), isdigit: (s) => /^\d+$/.test(s), isalpha: (s) => /^\p{L}+$/u.test(s), isalnum: (s) => /^[\p{L}\d]+$/u.test(s), isspace: (s) => /^\s+$/.test(s), zfill: (s, w) => s.padStart(w, '0'), ljust: (s, w, c = ' ') => s.padEnd(w, c), rjust: (s, w, c = ' ') => s.padStart(w, c), center: (s, w, c = ' ') => { const l = Math.floor((w - s.length) / 2); return c.repeat(Math.max(0, l)) + s + c.repeat(Math.max(0, w - s.length - l)); },
};
const escapeClass = (c) => c.replace(/[\]\\^-]/g, '\\$&');

function methodOf(interp, o, name) {
  if (typeof o === 'string') {
    if (name === 'join') return native('join', ([items]) => [...interp.iterate(items)].map((x) => { if (typeof x !== 'string') raise('TypeError', `sequence item: expected str, found ${typeName(x)}`); return x; }).join(o));
    if (name === 'format') return native('format', (args, kwargs) => { let auto = 0; return o.replace(/\{\{|\}\}|\{([^}]*)\}/g, (all, body) => { if (all === '{{') return '{'; if (all === '}}') return '}'; const [field, spec = ''] = body.split(':'); let value; if (field === '') value = args[auto++]; else if (/^\d+$/.test(field)) value = args[Number(field)]; else value = kwargs?.get(field); return formatSpec(interp, value, spec); }); });
    const fn = STR_METHODS[name];
    if (fn) return native(name, (args) => { const r = fn(o, ...args.map(num)); return r === undefined ? null : r; });
    return null;
  }
  if (Array.isArray(o)) {
    const isTuple = o instanceof PyTuple;
    switch (name) {
      case 'count': return native('count', ([x]) => o.filter((y) => interp.equal(x, y)).length);
      case 'index': return native('index', ([x]) => { const i = o.findIndex((y) => interp.equal(x, y)); if (i < 0) raise('ValueError', `${str(interp, x)} is not in list`); return i; });
      case 'get': return native('get', ([key, fallback]) => o.find((y) => y?.name === key) ?? fallback ?? null);
      case 'keys': return native('keys', () => o.map((y) => y?.name));
      case 'values': return native('values', () => [...o]);
      case 'items': return native('items', () => o.map((y) => tuple([y?.name, y])));
      default:
    }
    if (isTuple) return null;
    switch (name) {
      case 'append': return native('append', ([x]) => { o.push(x); return null; });
      case 'extend': return native('extend', ([x]) => { for (const y of interp.iterate(x)) o.push(y); return null; });
      case 'insert': return native('insert', ([i, x]) => { o.splice(num(i), 0, x); return null; });
      case 'pop': return native('pop', ([i]) => { if (!o.length) raise('IndexError', 'pop from empty list'); const at = i == null ? o.length - 1 : num(i) < 0 ? o.length + num(i) : num(i); if (at < 0 || at >= o.length) raise('IndexError', 'pop index out of range'); return o.splice(at, 1)[0]; });
      case 'remove': return native('remove', ([x]) => { const i = o.findIndex((y) => interp.equal(x, y)); if (i < 0) raise('ValueError', 'list.remove(x): x not in list'); o.splice(i, 1); return null; });
      case 'clear': return native('clear', () => { o.length = 0; return null; });
      case 'reverse': return native('reverse', () => { o.reverse(); return null; });
      case 'copy': return native('copy', () => [...o]);
      case 'sort': return native('sort', (args, kwargs) => { const sorted = sortedList(interp, o, kwargs); o.length = 0; o.push(...sorted); return null; });
      default: return null;
    }
  }
  if (o instanceof PyDict) {
    switch (name) {
      case 'get': return native('get', ([k, d]) => { const v = o.get(k); return v === undefined ? d ?? null : v; });
      case 'keys': return native('keys', () => o.keys());
      case 'values': return native('values', () => o.values());
      case 'items': return native('items', () => o.items());
      case 'pop': return native('pop', ([k, d]) => { const v = o.get(k); if (v === undefined) { if (d === undefined) raise('KeyError', str(interp, k)); return d; } o.delete(k); return v; });
      case 'update': return native('update', ([other], kwargs) => { if (other) for (const [a, b] of other.items()) o.set(a, b); if (kwargs) for (const [a, b] of kwargs) o.set(a, b); return null; });
      case 'setdefault': return native('setdefault', ([k, d = null]) => { if (!o.has(k)) o.set(k, d); return o.get(k); });
      case 'clear': return native('clear', () => { o.map.clear(); return null; });
      case 'copy': return native('copy', () => { const c = new PyDict(); for (const [a, b] of o.items()) c.set(a, b); return c; });
      default: return null;
    }
  }
  if (o instanceof PySet) {
    switch (name) {
      case 'add': return native('add', ([x]) => { o.add(x); return null; });
      case 'remove': case 'discard': return native(name, ([x]) => { const ok = o.delete(x); if (!ok && name === 'remove') raise('KeyError', str(interp, x)); return null; });
      case 'union': return native('union', ([x]) => new PySet([...o.items(), ...interp.iterate(x)]));
      case 'intersection': return native('intersection', ([x]) => { const other = new PySet(interp.iterate(x)); return new PySet(o.items().filter((y) => other.has(y))); });
      case 'difference': return native('difference', ([x]) => { const other = new PySet(interp.iterate(x)); return new PySet(o.items().filter((y) => !other.has(y))); });
      default: return null;
    }
  }
  return null;
}

function sortedList(interp, items, kwargs) {
  const key = kwargs?.get('key');
  const rev = kwargs?.get('reverse');
  const decorated = [...items].map((x) => ({ x, k: key ? interp.call(key, [x]) : x }));
  decorated.sort((a, b) => (interp.compare('<', a.k, b.k) ? -1 : interp.compare('<', b.k, a.k) ? 1 : 0));
  if (rev && truthy(interp, rev)) decorated.reverse();
  return decorated.map((d) => d.x);
}

function makeBuiltins(interp) {
  const b = {
    print: native('print', (args, kwargs) => { const sep = kwargs?.get('sep') ?? ' '; interp.print(args.map((a) => str(interp, a)).join(sep)); return null; }),
    len: native('len', ([x]) => {
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      if (x instanceof PyDict || x instanceof PySet) return x.size;
      if (x instanceof PyInstance) { const m = x.cls.lookup('__len__'); if (m) return interp.call(m, [x]); }
      return raise('TypeError', `object of type '${typeName(x)}' has no len()`);
    }),
    range: native('range', (args) => {
      const n = args.map(num);
      const [start, stop, step] = n.length === 1 ? [0, n[0], 1] : [n[0], n[1], n[2] ?? 1];
      if (step === 0) raise('ValueError', 'range() arg 3 must not be zero');
      const out = [];
      if (Math.abs((stop - start) / step) > 5e7) raise('OverflowError', 'range too large');
      for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(i);
      return out;
    }),
    str: native('str', ([x = '']) => str(interp, x)),
    repr: native('repr', ([x]) => repr(interp, x)),
    int: native('int', ([x = 0, base2]) => {
      if (typeof x === 'string') { const v = base2 ? parseInt(x, num(base2)) : /^\s*[-+]?\d+\s*$/.test(x) ? Number(x) : NaN; if (Number.isNaN(v)) raise('ValueError', `invalid literal for int() with base 10: '${x}'`); return v; }
      return Math.trunc(Number(num(x)));
    }),
    float: native('float', ([x = 0]) => { const v = typeof x === 'string' ? (/^\s*(inf|-inf|nan)\s*$/i.test(x) ? Number(x.trim().replace(/inf/i, 'Infinity')) : Number(x)) : Number(num(x)); if (Number.isNaN(v) && !/nan/i.test(String(x))) raise('ValueError', `could not convert string to float: '${x}'`); return flt(v); }),
    bool: native('bool', ([x]) => truthy(interp, x)),
    list: native('list', ([x]) => (x === undefined ? [] : [...interp.iterate(x)])),
    tuple: native('tuple', ([x]) => tuple(x === undefined ? [] : interp.iterate(x))),
    set: native('set', ([x]) => new PySet(x === undefined ? [] : interp.iterate(x))),
    dict: native('dict', ([x], kwargs) => { const d = new PyDict(); if (x instanceof PyDict) for (const [a, c] of x.items()) d.set(a, c); else if (x) for (const pair of interp.iterate(x)) { const [a, c] = [...interp.iterate(pair)]; d.set(a, c); } if (kwargs) for (const [a, c] of kwargs) d.set(a, c); return d; }),
    abs: native('abs', ([x]) => (x instanceof PyFloat ? flt(Math.abs(x.v)) : x instanceof PyInstance ? interp.call(interp.getAttr(x, '__abs__'), []) : Math.abs(x))),
    round: native('round', ([x, nd]) => { const v = num(x); if (nd == null) { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; } const k = 10 ** num(nd); return flt(Math.round(v * k) / k); }),
    sum: native('sum', ([x, start = 0]) => { let s = start; for (const v of interp.iterate(x)) s = interp.binary('+', s, v); return s; }),
    min: native('min', (args, kwargs) => extreme(interp, args, kwargs, '<')),
    max: native('max', (args, kwargs) => extreme(interp, args, kwargs, '>')),
    sorted: native('sorted', ([x], kwargs) => sortedList(interp, [...interp.iterate(x)], kwargs)),
    reversed: native('reversed', ([x]) => [...interp.iterate(x)].reverse()),
    enumerate: native('enumerate', ([x, start = 0], kwargs) => { const first = num(kwargs?.get('start') ?? start); return [...interp.iterate(x)].map((v, i) => tuple([i + first, v])); }),
    zip: native('zip', (args) => { const lists = args.map((a) => [...interp.iterate(a)]); const n = lists.length ? Math.min(...lists.map((l) => l.length)) : 0; return Array.from({ length: n }, (_, i) => tuple(lists.map((l) => l[i]))); }),
    map: native('map', ([f, ...rest]) => { const lists = rest.map((a) => [...interp.iterate(a)]); const n = Math.min(...lists.map((l) => l.length)); return Array.from({ length: n }, (_, i) => interp.call(f, lists.map((l) => l[i]))); }),
    filter: native('filter', ([f, x]) => [...interp.iterate(x)].filter((v) => truthy(interp, f ? interp.call(f, [v]) : v))),
    any: native('any', ([x]) => [...interp.iterate(x)].some((v) => truthy(interp, v))),
    all: native('all', ([x]) => [...interp.iterate(x)].every((v) => truthy(interp, v))),
    isinstance: native('isinstance', ([x, t]) => {
      const one = (c) => {
        if (c === b.int) return (typeof x === 'number' && Number.isInteger(x)) || typeof x === 'boolean';
        if (c === b.float) return x instanceof PyFloat;
        if (c === b.str) return typeof x === 'string';
        if (c === b.list) return Array.isArray(x) && !(x instanceof PyTuple);
        if (c === b.tuple) return x instanceof PyTuple;
        if (c === b.dict) return x instanceof PyDict;
        if (c === b.set) return x instanceof PySet;
        if (c === b.bool) return typeof x === 'boolean';
        return c instanceof PyClass && x instanceof PyInstance && x.cls.isSubclassOf(c);
      };
      return Array.isArray(t) ? t.some(one) : one(t);
    }),
    issubclass: native('issubclass', ([a, c]) => a.isSubclassOf(c)),
    hasattr: native('hasattr', ([o, n]) => { try { interp.getAttr(o, n); return true; } catch (e) { if (e instanceof PyRaise) return false; throw e; } }),
    getattr: native('getattr', ([o, n, d]) => { try { return interp.getAttr(o, n); } catch (e) { if (e instanceof PyRaise && d !== undefined) return d; throw e; } }),
    setattr: native('setattr', ([o, n, v]) => { interp.setAttr(o, n, v); return null; }),
    callable: native('callable', ([f]) => f instanceof PyFunction || f instanceof Native || f instanceof BoundMethod || f instanceof PyClass || typeof f === 'function'),
    type: native('type', ([x]) => { if (x instanceof PyInstance) return x.cls; const nm = typeName(x); return b[nm] ?? nm; }),
    chr: native('chr', ([x]) => String.fromCodePoint(num(x))),
    ord: native('ord', ([x]) => x.codePointAt(0)),
    pow: native('pow', ([a, c, m]) => { const v = interp.binary('**', a, c); return m == null ? v : num(v) % num(m); }),
    divmod: native('divmod', ([a, c]) => tuple([interp.binary('//', a, c), interp.binary('%', a, c)])),
    hex: native('hex', ([x]) => `0x${num(x).toString(16)}`),
    bin: native('bin', ([x]) => `0b${num(x).toString(2)}`),
    oct: native('oct', ([x]) => `0o${num(x).toString(8)}`),
    iter: native('iter', ([x]) => { const it = interp.iterate(x); return { __next: () => it.next() }; }),
    next: native('next', ([it, d]) => { const r = it.__next?.(); if (!r || r.done) { if (d !== undefined) return d; raise('StopIteration', ''); } return r.value; }),
    id: native('id', () => 0),
    input: native('input', () => raise('RuntimeError', 'input() is not available: scripts run without a terminal')),
    open: native('open', () => raise('RuntimeError', 'open() is not available: scripts cannot read or write files')),
    exec: native('exec', () => raise('RuntimeError', 'exec() is not available')),
    eval: native('eval', () => raise('RuntimeError', 'eval() is not available')),
    property: native('property', ([g, s]) => new PropertyValue(g, s ?? null)),
    staticmethod: native('staticmethod', ([f]) => new StaticValue(f)),
    classmethod: native('classmethod', ([f]) => new ClassValue(f)),
    object: new PyClass('object', [], new Map()),
    super: null,
    ...ERRORS,
  };
  // super() finds the class of the running method from its first argument and the method's own definition.
  b.super = native('super', (args) => {
    if (args.length) return new SuperProxy(args[0], args[1]);
    return raise('RuntimeError', 'super(): pass the class and self: super(MyClass, self), or define it in a class');
  });
  return b;
}
class SuperProxy { constructor(cls, self) { this.cls = cls; this.self = self; } }

function extreme(interp, args, kwargs, op) {
  const items = args.length === 1 ? [...interp.iterate(args[0])] : args;
  if (!items.length) { const d = kwargs?.get('default'); if (d !== undefined) return d; raise('ValueError', `${op === '<' ? 'min' : 'max'}() arg is an empty sequence`); }
  const key = kwargs?.get('key');
  let best = items[0];
  let bestK = key ? interp.call(key, [best]) : best;
  for (const x of items.slice(1)) {
    const k = key ? interp.call(key, [x]) : x;
    if (interp.compare(op, k, bestK)) { best = x; bestK = k; }
  }
  return best;
}

// `super().__init__()` without arguments: the common form, recognised when getting the attribute of its result.
const origGetAttr = Interpreter.prototype.getAttr;
Interpreter.prototype.getAttr = function getAttr(o, name) {
  if (o instanceof SuperProxy) {
    for (const b of o.cls.bases) { const v = b.lookup(name); if (v !== undefined) return v instanceof PyFunction || v instanceof Native ? new BoundMethod(o.self, v) : v; }
    if (name === '__init__') return native('__init__', () => null);
    return raise('AttributeError', `'super' object has no attribute '${name}'`);
  }
  return origGetAttr.call(this, o, name);
};
const origEval = Interpreter.prototype.eval;
Interpreter.prototype.eval = function evalNode(n, scope) {
  if (n.k === 'Call' && n.fn.k === 'Name' && n.fn.name === 'super' && !n.args.length) {
    // Inside a method: its scope's parent is the class body, `self` is its first parameter.
    let s = scope;
    while (s && s.parent?.kind !== 'class') s = s.parent;
    if (s) {
      const self = s.vars.values().next().value;
      const classBody = s.parent;
      const cls = self.cls ? findDefiner(self.cls, classBody.vars) : null;
      if (cls) return new SuperProxy(cls, self);
    }
  }
  return origEval.call(this, n, scope);
};
function findDefiner(cls, vars) {
  if (cls.attrs === vars) return cls;
  for (const b of cls.bases) { const f = findDefiner(b, vars); if (f) return f; }
  return null;
}

// ─────────────── modules

function mathModule() {
  const f = (fn) => native(fn.name, (args) => { const v = fn(...args.map((x) => Number(num(x)))); return Number.isNaN(v) && !args.some((x) => Number.isNaN(Number(num(x)))) ? raise('ValueError', 'math domain error') : flt(v); });
  const i = (fn) => native(fn.name, (args) => fn(...args.map((x) => Number(num(x)))));
  return {
    pi: flt(Math.PI), e: flt(Math.E), tau: flt(Math.PI * 2), inf: flt(Infinity), nan: flt(NaN),
    sin: f(Math.sin), cos: f(Math.cos), tan: f(Math.tan), asin: f(Math.asin), acos: f(Math.acos), atan: f(Math.atan), atan2: f(Math.atan2), sinh: f(Math.sinh), cosh: f(Math.cosh), tanh: f(Math.tanh),
    sqrt: f(Math.sqrt), exp: f(Math.exp), log: native('log', ([x, base2]) => { const v = Number(num(x)); if (v <= 0) raise('ValueError', 'math domain error'); return flt(base2 == null ? Math.log(v) : Math.log(v) / Math.log(Number(num(base2)))); }), log2: f(Math.log2), log10: f(Math.log10), pow: f(Math.pow), hypot: f(Math.hypot), fabs: f(Math.abs),
    floor: i(Math.floor), ceil: i(Math.ceil), trunc: i(Math.trunc), radians: f((x) => (x * Math.PI) / 180), degrees: f((x) => (x * 180) / Math.PI), fmod: f((a, b) => a % b), copysign: f((a, b) => Math.abs(a) * (b < 0 ? -1 : 1)), isnan: i(Number.isNaN), isinf: i((x) => Math.abs(x) === Infinity), gcd: i((a, b) => { let [x, y] = [Math.abs(a), Math.abs(b)]; while (y) [x, y] = [y, x % y]; return x; }), factorial: i((n) => { let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; }),
  };
}

function randomModule() {
  let s = 12345;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return {
    seed: native('seed', ([x = 0]) => { s = (Number(num(x)) * 2654435761) >>> 0; next(); return null; }),
    random: native('random', () => flt(next())),
    uniform: native('uniform', ([a, b]) => flt(num(a) + (num(b) - num(a)) * next())),
    randint: native('randint', ([a, b]) => num(a) + Math.floor(next() * (num(b) - num(a) + 1))),
    choice: native('choice', ([x]) => x[Math.floor(next() * x.length)]),
    shuffle: native('shuffle', ([x]) => { for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return null; }),
    sample: native('sample', ([x, k]) => { const pool = [...x]; const out = []; for (let i = 0; i < num(k); i++) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]); return out; }),
  };
}

/** A small vector with the operators scripts expect. Items stay plain numbers, so it can be assigned to obj.location. */
class Vector extends Array {
  get __js_ops() { return true; }
  __add__(o) { return Vector.of(...this.map((x, i) => x + num(o[i]))); }
  __sub__(o) { return Vector.of(...this.map((x, i) => x - num(o[i]))); }
  __mul__(k) { return Vector.of(...this.map((x) => x * num(k))); }
  __rmul__(k) { return this.__mul__(k); }
  __truediv__(k) { return Vector.of(...this.map((x) => x / num(k))); }
  dot(o) { return this.reduce((s, x, i) => s + x * num(o[i]), 0); }
  cross(o) { return Vector.of(this[1] * o[2] - this[2] * o[1], this[2] * o[0] - this[0] * o[2], this[0] * o[1] - this[1] * o[0]); }
  normalized() { const l = Math.hypot(...this) || 1; return Vector.of(...this.map((x) => x / l)); }
}

function mathutilsModule() {
  return { Vector: native('Vector', ([x]) => Vector.of(...Array.from(x ?? [0, 0, 0], num))) };
}

function registeredClassOps(interp, ctx) {
  const made = [];
  const propsOf = (cls) => {
    const props = [];
    const ann = cls.lookup('__annotations__');
    if (ann instanceof PyDict) {
      for (const [name, spec] of ann.items()) {
        if (!spec?.__prop) continue;
        props.push({ name, en: spec.name ?? name, ko: spec.name ?? name, ...spec.__prop });
      }
    }
    return props;
  };
  return {
    made,
    register_class: native('register_class', ([cls]) => {
      const idname = cls.lookup('bl_idname');
      if (!idname) return null; // Panels and such have nothing to run; they are accepted and ignored.
      if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(idname)) raise('ValueError', `bl_idname must look like "object.my_tool": ${idname}`);
      const label = cls.lookup('bl_label') ?? idname;
      const execute = cls.lookup('execute');
      if (!execute) raise('ValueError', `${cls.name} has no execute(self, context)`);
      if (getOp(idname)) unregister(idname);
      const props = propsOf(cls);
      register({
        id: idname, en: label, ko: label, addon: true, props,
        exec: (_, values) => {
          const inst = new PyInstance(cls);
          for (const p of props) inst.attrs.set(p.name, values[p.name]);
          const result = interp.call(execute, [inst, makeContext(ctx)]);
          const done = result instanceof PySet ? result.items() : Array.isArray(result) ? result : [];
          return done.includes('CANCELLED') ? 'CANCELLED' : undefined;
        },
      });
      made.push(idname);
      return null;
    }),
    unregister_class: native('unregister_class', ([cls]) => { const idname = cls.lookup('bl_idname'); if (idname && getOp(idname)) unregister(idname); return null; }),
  };
}

function makeContext(ctx) {
  return { get active_object() { return activeObject(ctx.doc); }, get selected_objects() { return selectedObjects(ctx.doc); }, get mode() { return ctx.doc.mode; }, get scene() { return makeScene(ctx); }, get object() { return activeObject(ctx.doc); } };
}
function makeScene(ctx) {
  return {
    get frame_current() { return ctx.doc.frame; }, set frame_current(v) { setFrame(ctx.doc, v); },
    get frame_start() { return ctx.doc.frameStart; }, set frame_start(v) { ctx.doc.frameStart = v; },
    get frame_end() { return ctx.doc.frameEnd; }, set frame_end(v) { ctx.doc.frameEnd = v; },
    frame_set(v) { setFrame(ctx.doc, v); },
    get render() { return ctx.doc.render; }, get world() { return ctx.doc.world; }, get cursor() { return ctx.doc.cursor; }, get objects() { return ctx.doc.objects; },
  };
}

function bpyModule(interp, ctx) {
  const ops = {};
  for (const op of allOps()) {
    const [group, name] = op.id.split('.');
    (ops[group] ??= {})[name] = (props = {}) => {
      const result = runOp(ctx, op.id, props ?? {});
      return new PySet([result === 'CANCELLED' ? 'CANCELLED' : 'FINISHED']);
    };
  }
  const classes = registeredClassOps(interp, ctx);
  const prop = (type, extra = {}) => native(`${type}Property`, (args, kwargs) => {
    const options = kwargs ? Object.fromEntries([...kwargs].map(([k, v]) => [k, toJS(v)])) : {};
    const out = { name: options.name, __prop: { type: { Float: 'number', Int: 'int', Bool: 'bool', String: 'string', Enum: 'enum', FloatVector: 'vec3' }[type], def: options.default ?? { Float: 0, Int: 0, Bool: false, String: '', FloatVector: [0, 0, 0] }[type] ?? (options.items?.[0]?.[0] ?? ''), ...extra } };
    if (options.min !== undefined) out.__prop.min = options.min;
    if (options.max !== undefined) out.__prop.max = options.max;
    if (type === 'Float') out.__prop.step = options.step ?? 0.1;
    if (type === 'Int') out.__prop.step = 1;
    if (type === 'Enum') out.__prop.options = (options.items ?? []).map((i) => i[0]);
    return out;
  });
  const typesBase = (name) => new PyClass(name, [], new Map());
  return {
    ops,
    context: makeContext(ctx),
    data: {
      get objects() { return ctx.doc.objects; }, get materials() { return ctx.doc.materials; }, get collections() { return ctx.doc.collections; }, get images() { return ctx.doc.images; }, get texts() { return ctx.doc.texts; }, get scenes() { return ctx.doc.scenes; },
    },
    utils: classes,
    props: { FloatProperty: prop('Float'), IntProperty: prop('Int'), BoolProperty: prop('Bool'), StringProperty: prop('String'), EnumProperty: prop('Enum'), FloatVectorProperty: prop('FloatVector') },
    types: { Operator: typesBase('Operator'), Panel: typesBase('Panel'), Menu: typesBase('Menu') },
    app: { version: tuple([1, 0, 0]), version_string: '1.0.0 (My3DBlender)' },
    __classes: classes,
  };
}

const STANDARD = {
  sys: () => ({ version: '3.12 (My3DBlender subset)', argv: [], path: [] }),
  time: () => ({ time: native('time', () => flt(Date.now() / 1000)), perf_counter: native('perf_counter', () => flt(performance.now() / 1000)) }),
};

/** A prepared interpreter with its modules. */
export function createPython(ctx, print) {
  const interp = new Interpreter(print);
  const bpy = bpyModule(interp, ctx);
  interp.modules = { bpy, math: mathModule(), random: randomModule(), mathutils: mathutilsModule(), sys: STANDARD.sys(), time: STANDARD.time() };
  return interp;
}

const describe = (interp, e) => {
  if (e instanceof PyRaise) {
    const line = e.line || interp.line;
    return `line ${line}: ${e.instance?.cls?.name ?? 'Exception'}${str(interp, e.instance) ? `: ${str(interp, e.instance)}` : ''}`;
  }
  if (e instanceof PySyntaxError) return e.message;
  if (e instanceof BreakSignal || e instanceof ContinueSignal) return "SyntaxError: 'break' or 'continue' outside a loop";
  if (e instanceof ReturnSignal) return "SyntaxError: 'return' outside a function";
  return `line ${interp.line}: ${e.name ?? 'Error'}: ${e.message ?? e}`;
};

/** Runs a script. Returns { ok, output, error }, like runScript. */
export function runPython(ctx, code) {
  const output = [];
  const interp = createPython(ctx, (line) => output.push(line));
  try {
    interp.run(code);
    touch(ctx);
    ctx.history?.push(ctx.doc, 'Run Script');
    return { ok: true, output };
  } catch (e) {
    return { ok: false, error: describe(interp, e), output };
  }
}

/** A console that remembers its names. `run(line)` shows an expression's value as the Python prompt does. */
export function createPythonConsole(ctx) {
  let sink = () => {};
  const interp = createPython(ctx, (line) => sink(line));
  interp.globals.vars.set('bpy', interp.modules.bpy);
  interp.globals.vars.set('math', interp.modules.math);
  return {
    run(line) {
      const output = [];
      sink = (x) => output.push(x);
      try {
        const body = parse(line);
        if (body.length === 1 && body[0].k === 'Expr') {
          const value = interp.eval(body[0].value, interp.globals);
          if (value !== null && value !== undefined) output.push(repr(interp, value));
        } else interp.exec(body, interp.globals);
        touch(ctx);
        return { ok: true, output };
      } catch (e) {
        return { ok: false, error: describe(interp, e), output };
      }
    },
  };
}

/** Loads an add-on written in Python: its module runs, and its bl_info and register/unregister are returned. */
export function loadPythonAddon(ctx, code, print = () => {}) {
  const interp = createPython(ctx, print);
  try {
    interp.run(code);
  } catch (e) {
    throw new Error(describe(interp, e));
  }
  const g = interp.globals.vars;
  const guard = (fn) => () => { if (!fn) return; try { interp.call(fn, []); } catch (e) { throw new Error(describe(interp, e)); } };
  const info = g.get('bl_info');
  return {
    info: info instanceof PyDict ? toJS(info) : {},
    register: guard(g.get('register')),
    unregister: guard(g.get('unregister')),
    registered: () => interp.modules.bpy.__classes.made,
  };
}
