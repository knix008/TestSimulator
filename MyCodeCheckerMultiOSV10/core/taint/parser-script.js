'use strict';

// Python (indentation) and Ruby (`end`) statement walkers for the taint
// parser. They add methods to Parser.prototype.

const { Parser } = require('./parser');

const P = Parser.prototype;

// ---------- Python ----------

P.pyLineEnd = function pyLineEnd(i, e) {
  let j = i;
  while (j < e) {
    const t = this.toks[j];
    if (j > i && t.nl) return j;
    if ((t.v === '(' || t.v === '[' || t.v === '{') && t.t === 'op') {
      const c = this.close(j);
      if (c > j && c < e) { j = c + 1; continue; }
    }
    if (t.v === ';' && t.t === 'op') return j;
    j++;
  }
  return e;
};

P.pyBodyEnd = function pyBodyEnd(j, e, baseInd) {
  let k = j;
  while (k < e) {
    const t = this.toks[k];
    if (t.nl && t.ind <= baseInd) return k;
    if ((t.v === '(' || t.v === '[' || t.v === '{') && t.t === 'op') {
      const c = this.close(k);
      if (c > k && c < e) { k = c + 1; continue; }
    }
    k++;
  }
  return e;
};

P.pyBlock = function pyBlock(s, e) {
  let i = s;
  let decorators = [];
  let guard = 0;
  const baseInd = s < this.toks.length ? this.toks[s].ind : 0;
  while (i < e && guard++ < 200000) {
    const start = i;
    const j = this.pyLineEnd(i, e);
    try {
      const r = this.pyLine(i, j, e, decorators, baseInd);
      decorators = r.decorators || [];
      i = r.next;
    } catch {
      i = j;
      decorators = [];
    }
    if (this.v(i) === ';') i++;
    if (i <= start) i = start + 1;
  }
};

P.pyColon = function pyColon(i, j) {
  return this.findTop(i, j, (t) => t.v === ':' && t.t === 'op');
};

P.pyLine = function pyLine(i, j, e, decorators, baseInd) {
  const v = this.v(i);
  const line = this.line(i);
  const ind = this.toks[i].ind;
  const savedCond = this.cond;
  if (this.fn && !this.fn.isModule && ind > baseInd) this.cond = true;
  const done = (next, extra) => { this.cond = savedCond; return Object.assign({ next }, extra || {}); };
  const rest = (colon) => {
    if (colon >= 0 && colon + 1 < j) this.pyLine(colon + 1, j, e, [], -1);
  };
  if (v === '@') return done(j, { decorators: decorators.concat(this.text(i, j)) });
  let k = i;
  if (v === 'async' && (this.v(i + 1) === 'def' || this.v(i + 1) === 'for' || this.v(i + 1) === 'with')) k++;
  const kv = this.v(k);
  if (kv === 'def' && this.isId(k + 1) && this.v(k + 2) === '(') {
    const pc = this.close(k + 2);
    const params = this.parseParams(k + 3, pc);
    const colon = this.findTop(pc + 1, j, (t) => t.v === ':');
    const fn = this.newFn(this.v(k + 1), line, params, decorators);
    let be = j;
    if (colon >= 0 && colon + 1 < j) {
      this.withFn(fn, () => this.pyLine(colon + 1, j, e, [], -1));
    } else {
      be = this.pyBodyEnd(j, e, ind);
      this.withFn(fn, () => this.pyBlock(j, be));
    }
    this.cond = savedCond;
    return { next: be };
  }
  if (kv === 'class' && this.isId(k + 1)) {
    const name = this.v(k + 1);
    const colon = this.pyColon(k + 1, j);
    const bases = colon > k + 2 ? this.text(k + 2, colon) : '';
    this.fir.classes.push({ name, bases, anns: decorators.join(' '), line, file: this.file });
    const be = this.pyBodyEnd(j, e, ind);
    const saved = this.cls;
    this.cls = name;
    try { this.pyBlock(j, be); } catch { /* skip */ }
    this.cls = saved;
    return done(be);
  }
  if (kv === 'if' || kv === 'elif' || kv === 'while') {
    const colon = this.pyColon(k + 1, j);
    this.emit({ k: 'guard', e: this.parseExprRange(k + 1, colon < 0 ? j : colon), line });
    rest(colon);
    return done(j);
  }
  if (kv === 'else' || kv === 'try' || kv === 'finally' || kv === 'except') {
    const colon = this.pyColon(k, j);
    rest(colon);
    return done(j);
  }
  if (kv === 'for') {
    const inI = this.findTop(k + 1, j, (t) => t.v === 'in');
    const colon = this.pyColon(inI < 0 ? k : inI, j);
    if (inI > 0) {
      const names = [];
      for (let q = k + 1; q < inI; q++) if (this.isId(q)) names.push(this.v(q));
      this.emit({ k: 'foreach', targets: names, e: this.parseExprRange(inI + 1, colon < 0 ? j : colon), line, cond: true });
    }
    rest(colon);
    return done(j);
  }
  if (kv === 'with') {
    const colon = this.pyColon(k + 1, j);
    for (const [a, b] of this.splitTop(k + 1, colon < 0 ? j : colon, ',')) {
      const asI = this.findTop(a, b, (t) => t.v === 'as');
      if (asI > a && this.isId(asI + 1)) {
        this.emit({ k: 'assign', targets: [{ k: 'name', name: this.v(asI + 1), line }], value: this.parseExprRange(a, asI), op: '=', line });
      } else this.emit({ k: 'expr', e: this.parseExprRange(a, b), line });
    }
    rest(colon);
    return done(j);
  }
  if (kv === 'return' || kv === 'yield') {
    this.emit({ k: 'return', e: this.parseExprRange(k + 1, j), line });
    return done(j);
  }
  if (kv === 'raise' || kv === 'assert' || kv === 'del') {
    this.emit({ k: 'expr', e: this.parseExprRange(k + 1, j), line });
    return done(j);
  }
  if (kv === 'import') {
    for (const [a, b] of this.splitTop(k + 1, j, ',')) {
      const asI = this.findTop(a, b, (t) => t.v === 'as');
      const mod = this.text(a, asI < 0 ? b : asI).replace(/\s+/g, '');
      const local = asI < 0 ? mod.split('.')[0] : this.v(asI + 1);
      this.fir.imports.push({ local, module: asI < 0 ? mod.split('.')[0] : mod, imported: '*', line });
    }
    return done(j);
  }
  if (kv === 'from') {
    const impI = this.findTop(k + 1, j, (t) => t.v === 'import');
    if (impI > k) {
      const mod = this.text(k + 1, impI).replace(/\s+/g, '');
      let a = impI + 1;
      let b = j;
      if (this.v(a) === '(') { b = this.close(a); a++; }
      for (const [x, y] of this.splitTop(a, b, ',')) {
        const asI = this.findTop(x, y, (t) => t.v === 'as');
        const name = this.v(x);
        const local = asI < 0 ? name : this.v(asI + 1);
        // `from . import db` / `from pkg import module` may name a module
        this.fir.imports.push({ local, module: mod, imported: name, line, maybeModule: true });
      }
    }
    return done(j);
  }
  if (['pass', 'break', 'continue', 'global', 'nonlocal', 'match', 'case'].includes(kv)) {
    if (kv === 'match' || kv === 'case') { const colon = this.pyColon(k, j); rest(colon); }
    return done(j);
  }
  if (kv === 'print' && this.v(k + 1) !== '(' && k + 1 < j) {
    this.emit({ k: 'expr', e: { k: 'call', callee: { k: 'name', name: 'print', line }, args: [this.parseExprRange(k + 1, j)], named: {}, line, src: this.text(k, j) }, line });
    return done(j);
  }
  this.pySimple(k, j);
  return done(j);
};

P.pySimple = function pySimple(s, e) {
  // chained a = b = expr; tuple targets a, b = x, y
  const eqs = [];
  for (let q = s; q < e; q++) {
    const t = this.toks[q];
    if (t.t === 'op' && (t.v === '(' || t.v === '[' || t.v === '{')) { const c = this.close(q); if (c > q && c < e) { q = c; continue; } }
    if (t.t === 'op' && ['=', '+=', '-=', '*=', '|=', '%=', ':='].includes(t.v)) eqs.push(q);
  }
  const line = this.line(s);
  if (!eqs.length) { this.emit({ k: 'expr', e: this.parseExprRange(s, e), line }); return; }
  const last = eqs[eqs.length - 1];
  const value = this.parseExprRange(last + 1, e);
  let from = s;
  for (const eq of eqs) {
    const { targets, declType } = this.targets(from, eq, false);
    let val = value;
    // a, b = x, y pairs
    if (targets.length > 1 && value.k === 'op' && value.ops && value.ops.length === 1 && value.ops[0] === ',' && value.parts.length === targets.length) {
      targets.forEach((t, n) => this.emit({ k: 'assign', targets: [t], value: value.parts[n], op: this.v(eq), line }));
      from = eq + 1;
      continue;
    }
    if (value.k === 'fn' && !value.fn.name && targets[0] && targets[0].k === 'name') value.fn.name = targets[0].name;
    this.emit({ k: 'assign', targets, value: val, op: this.v(eq), line, declType });
    from = eq + 1;
  }
};

// ---------- Ruby ----------

const RB_ALWAYS = new Set(['def', 'class', 'module', 'begin', 'case']);
const RB_STMT = new Set(['if', 'unless', 'while', 'until', 'for']);
const RB_START_PREV = new Set([';', '=', '(', '||=', '&&=', 'return', ',', '[', '{', '+=', 'then', 'do', '=>']);

P.computeEnds = function computeEnds() {
  const ends = new Map();
  const stack = [];
  let loopLine = -1;
  for (let i = 0; i < this.toks.length; i++) {
    const t = this.toks[i];
    if (t.t !== 'id') continue;
    const prev = this.toks[i - 1];
    if (prev && (prev.v === '.' || prev.v === '::' || prev.v === '&.')) continue; // method names like x.class
    if (this.toks[i + 1] && this.toks[i + 1].v === ':' && !(this.toks[i + 1].v === '::')) {
      // hash key `if:` — not a keyword
      if (t.v !== 'do' && t.v !== 'end') { if (RB_ALWAYS.has(t.v) || RB_STMT.has(t.v)) continue; }
    }
    const atStart = t.nl || !prev || RB_START_PREV.has(prev.v);
    if (RB_ALWAYS.has(t.v) || (RB_STMT.has(t.v) && atStart)) {
      if (t.v === 'def' && this.isEndless(i)) continue;
      stack.push(i);
      if (t.v === 'while' || t.v === 'until' || t.v === 'for') loopLine = t.line;
      continue;
    }
    if (t.v === 'do') {
      if (loopLine === t.line) { loopLine = -1; continue; }
      stack.push(i);
      continue;
    }
    if (t.v === 'end') {
      const open = stack.pop();
      if (open != null) ends.set(open, i);
    }
  }
  this.ends = ends;
};

P.isEndless = function isEndless(i) {
  // def name(args) = expr
  let j = i + 1;
  while (this.toks[j] && (this.isId(j) || this.v(j) === '.')) j++;
  if (this.v(j) === '(') j = this.close(j) + 1;
  return this.v(j) === '=' && this.toks[j] && this.toks[j].line === this.toks[i].line;
};

P.rbStmtEnd = function rbStmtEnd(i, e) {
  let j = i;
  while (j < e) {
    const t = this.toks[j];
    if (j > i && t.nl && !this.rbContinues(j)) return j;
    if ((t.v === '(' || t.v === '[' || t.v === '{') && t.t === 'op') {
      const c = this.close(j);
      if (c > j && c < e) { j = c + 1; continue; }
    }
    if (t.t === 'id' && t.v === 'do' && this.ends.has(j)) { j = this.ends.get(j) + 1; continue; }
    if (t.v === ';' && t.t === 'op') return j;
    j++;
  }
  return e;
};

P.rbContinues = function rbContinues(j) {
  const prev = this.toks[j - 1];
  const next = this.toks[j];
  if (!prev) return false;
  if (prev.t === 'op' && !['}', ')', ']'].includes(prev.v)) return true;
  if (next.t === 'op' && ['.', '&.', '&&', '||'].includes(next.v)) return true;
  if (prev.t === 'id' && (prev.v === 'and' || prev.v === 'or')) return true;
  return false;
};

P.rbBlock = function rbBlock(s, e) {
  let i = s;
  let guard = 0;
  const condEnds = [];
  while (i < e && guard++ < 200000) {
    const start = i;
    while (condEnds.length && condEnds[condEnds.length - 1] < i) condEnds.pop();
    const savedCond = this.cond;
    if (condEnds.length && this.fn && !this.fn.isModule) this.cond = true;
    try {
      i = this.rbStatement(i, e, condEnds);
    } catch {
      i = this.rbStmtEnd(i, e);
    }
    this.cond = savedCond;
    if (this.v(i) === ';') i++;
    if (i <= start) i = start + 1;
  }
};

P.rbStatement = function rbStatement(i, e, condEnds) {
  const v = this.v(i);
  const line = this.line(i);
  const t = this.toks[i];
  if (t.t === 'op' && (v === ';' || v === ')' || v === '}' || v === ']')) return i + 1;
  if (v === 'def') {
    const end = this.ends.get(i);
    let k = i + 1;
    if (this.v(k) === 'self' && this.v(k + 1) === '.') k += 2;
    const name = this.v(k);
    let params = [];
    let bodyS = k + 1;
    if (this.v(k + 1) === '(') {
      const pc = this.close(k + 1);
      params = this.parseParams(k + 2, pc);
      bodyS = pc + 1;
    } else {
      let q = k + 1;
      while (q < e && !this.toks[q].nl && this.v(q) !== ';') q++;
      params = this.parseParams(k + 1, q);
      bodyS = q;
    }
    const fn = this.newFn(name, line, params, []);
    if (end == null) {
      // endless def: def name(args) = expr
      const stop = this.rbStmtEnd(bodyS, e);
      if (this.v(bodyS) === '=') this.withFn(fn, () => this.emit({ k: 'return', e: this.parseExprRange(bodyS + 1, stop), line }));
      return stop;
    }
    this.withFn(fn, () => {
      this.rbBlock(bodyS, end);
      const last = fn.stmts[fn.stmts.length - 1];
      if (last && last.k === 'expr') fn.stmts.push({ k: 'return', e: last.e, line: last.line, cond: false, implicit: true });
    });
    return end + 1;
  }
  if (v === 'class' || v === 'module') {
    const end = this.ends.get(i);
    let k = i + 1;
    let name = '';
    while (k < e && (this.isId(k) || this.v(k) === '::') && !(k > i + 1 && this.toks[k].nl)) { if (this.isId(k)) name = this.v(k); k++; }
    if (this.v(i + 1) === '<<') { k = this.rbStmtEnd(i, e); name = this.cls || ''; }
    let bases = '';
    if (this.v(k) === '<') { const q = this.rbStmtEnd(k, e); bases = this.text(k + 1, q); k = q; }
    this.fir.classes.push({ name, bases, anns: '', line, file: this.file });
    const saved = this.cls;
    this.cls = name;
    try { this.rbBlock(k, end == null ? e : end); } catch { /* skip */ }
    this.cls = saved;
    return end == null ? e : end + 1;
  }
  if (v === 'end' || v === 'else' || v === 'ensure' || v === 'begin' || v === 'then' || v === 'private' || v === 'protected' || v === 'public') {
    if (v === 'begin' && this.ends.has(i)) condEnds.push(this.ends.get(i));
    return i + 1;
  }
  if (v === 'rescue') return this.rbStmtEnd(i, e);
  if (v === 'if' || v === 'unless' || v === 'while' || v === 'until' || v === 'elsif' || v === 'when' || v === 'case') {
    let end = this.rbStmtEnd(i + 1, e);
    const thenI = this.findTop(i + 1, end, (tk) => tk.v === 'then' || tk.v === 'do');
    const condEnd = thenI >= 0 ? thenI : end;
    if (this.ends.has(i)) condEnds.push(this.ends.get(i));
    this.emit({ k: v === 'case' ? 'expr' : 'guard', e: this.parseExprRange(i + 1, condEnd), line });
    if (thenI >= 0) return thenI + 1;
    return end;
  }
  if (v === 'for') {
    const end = this.rbStmtEnd(i + 1, e);
    const inI = this.findTop(i + 1, end, (tk) => tk.v === 'in');
    if (this.ends.has(i)) condEnds.push(this.ends.get(i));
    if (inI > 0) {
      const names = [];
      for (let q = i + 1; q < inI; q++) if (this.isId(q)) names.push(this.v(q));
      const doI = this.findTop(inI, end, (tk) => tk.v === 'do');
      this.emit({ k: 'foreach', targets: names, e: this.parseExprRange(inI + 1, doI < 0 ? end : doI), line, cond: true });
    }
    return end;
  }
  if (v === 'return') {
    const end = this.rbStmtEnd(i + 1, e);
    const mod = this.findTop(i + 1, end, (tk) => tk.t === 'id' && (tk.v === 'if' || tk.v === 'unless'));
    this.emit({ k: 'return', e: this.parseExprRange(i + 1, mod < 0 ? end : mod), line });
    if (mod >= 0) this.emit({ k: 'guard', e: this.parseExprRange(mod + 1, end), line });
    return end;
  }
  if ((v === 'require' || v === 'require_relative' || v === 'load') && this.toks[i + 1] && (this.toks[i + 1].t === 'str' || this.v(i + 1) === '(')) {
    const end = this.rbStmtEnd(i, e);
    const tk = this.toks[i + 1].t === 'str' ? this.toks[i + 1] : this.toks[i + 2];
    if (tk && tk.t === 'str') this.fir.imports.push({ local: '', module: tk.v, imported: '*', line, relative: v === 'require_relative' });
    return end;
  }
  if (['include', 'extend', 'attr_accessor', 'attr_reader', 'attr_writer', 'before_action', 'skip_before_action', 'helper_method', 'protect_from_forgery', 'layout', 'alias', 'undef'].includes(v)) {
    return this.rbStmtEnd(i, e);
  }
  const end = this.rbStmtEnd(i, e);
  // modifier if/unless/while
  const mod = this.findTop(i + 1, end, (tk) => tk.t === 'id' && (tk.v === 'if' || tk.v === 'unless' || tk.v === 'while' || tk.v === 'until') && !this.ends.has(this.toks.indexOf(tk)));
  const stmtEnd = mod >= 0 ? mod : end;
  if (mod >= 0) this.emit({ k: 'guard', e: this.parseExprRange(mod + 1, end), line });
  const savedCond = this.cond;
  if (mod >= 0 && this.fn && !this.fn.isModule) this.cond = true;
  this.rbSimple(i, stmtEnd);
  this.cond = savedCond;
  return end;
};

P.rbSimple = function rbSimple(s, e) {
  const asg = this.findTop(s, e, (tk) => tk.t === 'op' && ['=', '+=', '||=', '&&=', '-=', '<<='].includes(tk.v));
  const line = this.line(s);
  if (asg > s) {
    const value = this.parseExprRange(asg + 1, e);
    const { targets } = this.targets(s, asg, false);
    if (targets.length > 1 && value.k === 'op' && value.ops && value.ops[0] === ',' && value.parts.length === targets.length) {
      targets.forEach((tg, n) => this.emit({ k: 'assign', targets: [tg], value: value.parts[n], op: '=', line }));
      return;
    }
    this.emit({ k: 'assign', targets, value, op: this.v(asg), line });
    return;
  }
  // `arr << x` appends
  const app = this.findTop(s, e, (tk) => tk.t === 'op' && tk.v === '<<');
  if (app > s) {
    const { targets } = this.targets(s, app, false);
    this.emit({ k: 'assign', targets, value: this.parseExprRange(app + 1, e), op: '+=', line });
    return;
  }
  this.emit({ k: 'expr', e: this.parseExprRange(s, e), line });
};

module.exports = {};
