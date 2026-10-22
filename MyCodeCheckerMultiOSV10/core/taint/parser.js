'use strict';

// Lightweight structural parser for the taint engine. It recovers functions,
// classes, imports, assignments, calls, returns and conditions from tokens.
// It is tolerant: unknown syntax is skipped, nothing throws out of parseFile.
//
// IR:
//   FileIR  { path, lang, fam, fns: Fn[], module: Fn, imports, classes, defaultExport }
//   Fn      { id, name, cls, file, lang, line, params, anns, stmts, parent, isModule }
//   Stmt    assign | expr | return | guard | foreach | echo
//   Node    lit | str | name | member | index | call | op | arr | obj | fn | cast

const { lex, FAMILY } = require('./lexer');

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'final', 'abstract', 'sealed', 'open', 'override',
  'virtual', 'async', 'export', 'default', 'readonly', 'synchronized', 'native', 'transient', 'volatile',
  'suspend', 'inline', 'operator', 'infix', 'data', 'extern', 'unsafe', 'partial', 'declare', 'strictfp',
  'lateinit', 'const', 'tailrec', 'external', 'actual', 'expect', 'inner', 'enum', 'annotation', 'companion',
]);
const CLASS_KW = new Set(['class', 'interface', 'struct', 'record', 'trait', 'object', 'enum']);
const DECL_KW = new Set(['const', 'let', 'var', 'val', 'final', 'my', 'local', 'static', 'readonly', 'export', 'global', 'dim']);
const NOT_FN_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'super', 'this', 'synchronized', 'using', 'lock', 'foreach', 'elseif', 'when', 'with', 'typeof', 'sizeof', 'nameof', 'function', 'fixed', 'checked', 'unchecked', 'throw', 'await', 'yield', 'else', 'do', 'try', 'base']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '.=', '||=', '&&=', '??=', ':=', '|=', '<<=', '%=']);
const CMP_OPS = new Set(['==', '!=', '===', '!==', '<', '>', '<=', '>=', 'instanceof', 'is', 'in', 'not', '!', 'is_a?', '=~', '!~', '<=>']);
const VALUE_OPS = new Set(['||', '&&', '??', 'or', 'and', '?', '?:']);
const KW_OPS = new Set(['and', 'or', 'not', 'in', 'is', 'instanceof', 'typeof', 'await', 'void', 'delete', 'yield', 'as', 'if', 'else', 'for', 'of', 'then', 'unless', 'when', 'go', 'defer', 'throw', 'clone', 'print', 'out', 'ref', 'sizeof', 'from', 'async', 'select', 'where']);
const CAST_TYPES = /^(int|integer|float|double|bool|boolean|long|short|byte|uint|ulong|decimal|Int|Long|Double|Float|Boolean|Integer|unset)$/;
const OPENERS = { '(': ')', '[': ']', '{': '}', '#[': ']' };
const ASI = new Set(['js', 'go', 'kt']);

let fnSeq = 0;

class Parser {
  constructor(toks, file, lang, fir) {
    this.toks = toks;
    this.file = file;
    this.lang = lang;
    this.fam = FAMILY[lang] || 'js';
    this.fir = fir;
    this.match = matchBrackets(toks);
    this.fn = null;
    this.cls = null;
    this.cond = false;
  }

  // ---------- helpers ----------
  v(i) { const t = this.toks[i]; return t ? t.v : undefined; }
  isId(i) { const t = this.toks[i]; return !!t && t.t === 'id'; }
  text(s, e) {
    const out = [];
    for (let i = s; i < e && i < this.toks.length; i++) {
      const t = this.toks[i];
      out.push(t.t === 'str' ? JSON.stringify(t.v) : t.v);
    }
    return out.join(' ');
  }
  line(i) { const t = this.toks[i] || this.toks[this.toks.length - 1]; return t ? t.line : 1; }
  col(i) { const t = this.toks[i]; return t ? t.col : 1; }
  close(i) { const m = this.match[i]; return m == null ? -1 : m; }
  past(j) { return this.v(j) === ';' ? j + 1 : j; }
  lineEnd(i, e) { let j = i + 1; while (j < e && !this.toks[j].nl) j++; return j; }

  splitTop(s, e, sep) {
    const parts = [];
    let start = s;
    for (let i = s; i < e; i++) {
      const v = this.v(i);
      if (OPENERS[v] && this.toks[i].t === 'op') { const c = this.close(i); if (c > i && c < e) { i = c; continue; } }
      if (v === sep && this.toks[i].t === 'op') { parts.push([start, i]); start = i + 1; }
    }
    if (start < e || parts.length) parts.push([start, e]);
    return parts.filter(([a, b]) => b > a);
  }
  findTop(s, e, pred) {
    for (let i = s; i < e; i++) {
      const t = this.toks[i];
      if (pred(t, i)) return i;
      if (OPENERS[t.v] && t.t === 'op') { const c = this.close(i); if (c > i && c < e) { i = c; continue; } }
    }
    return -1;
  }

  newFn(name, line, params, anns) {
    const fn = {
      id: ++fnSeq, name: name || '', cls: this.cls, file: this.file, lang: this.lang, line,
      params: params || [], anns: anns || [], stmts: [], parent: this.fn, isModule: false,
    };
    this.fir.fns.push(fn);
    return fn;
  }
  withFn(fn, body) {
    const saved = [this.fn, this.cond, this.cls];
    this.fn = fn;
    this.cond = false;
    this.cls = fn.cls;
    try { body(); } catch { /* keep partial body */ }
    [this.fn, this.cond, this.cls] = saved;
  }
  emit(stmt) {
    if (!this.fn) return;
    if (stmt.cond == null) stmt.cond = this.cond;
    this.fn.stmts.push(stmt);
  }

  // ---------- params ----------
  parseParams(s, e) {
    const out = [];
    if (s >= e) return out;
    const groups = this.splitTop(s, e, ',');
    let pendingGo = [];
    for (const [gs, ge] of groups) {
      let a = gs;
      const anns = [];
      // annotations / attributes
      for (;;) {
        if (this.v(a) === '@' && this.isId(a + 1)) {
          let j = a + 2;
          while (this.v(j) === '.' && this.isId(j + 1)) j += 2;
          if (this.v(j) === '(') j = this.close(j) + 1;
          anns.push(this.text(a, j)); a = j; continue;
        }
        if ((this.v(a) === '[' || this.v(a) === '#[') && this.fam !== 'js' && this.fam !== 'py' && this.fam !== 'rb' && this.close(a) > a) {
          const c = this.close(a); anns.push(this.text(a, c + 1)); a = c + 1; continue;
        }
        break;
      }
      while (a < ge && (['final', 'val', 'var', 'readonly', 'public', 'private', 'protected', 'ref', 'out', 'in', 'params', 'this', 'vararg', 'noinline', 'crossinline', 'mut', 'scoped', 'override'].includes(this.v(a)) && a + 1 < ge && this.toks[a + 1].t !== 'op' || ['...', '*', '**', '&', '&&'].includes(this.v(a)))) a++;
      let eq = this.findTop(a, ge, (t) => t.v === '=' && t.t === 'op');
      const end = eq < 0 ? ge : eq;
      const def = eq < 0 ? '' : this.text(eq + 1, ge);
      let name = '';
      let type = '';
      let destructure = null;
      if (this.v(a) === '{' || this.v(a) === '[') {
        destructure = [];
        const c = this.close(a);
        for (const [x, y] of this.splitTop(a + 1, c, ',')) {
          const colon = this.findTop(x, y, (t) => t.v === ':');
          const keyTok = this.toks[x];
          const nameIdx = colon >= 0 ? colon + 1 : x;
          if (keyTok && this.isId(nameIdx)) destructure.push({ key: keyTok.v, name: this.v(nameIdx) });
        }
        name = '{' + destructure.map((d) => d.name).join(',') + '}';
        const colon = this.findTop(c + 1, end, (t) => t.v === ':');
        if (colon >= 0) type = this.text(colon + 1, end);
      } else if (this.fam === 'java' || this.fam === 'cs') {
        let k = end - 1;
        while (k > a && (this.v(k) === ']' || this.v(k) === '[')) k--;
        if (this.isId(k)) { name = this.v(k); type = this.text(a, k); }
      } else if (this.fam === 'go') {
        if (this.isId(a)) { name = this.v(a); type = this.text(a + 1, end); }
        if (!type) { pendingGo.push(out.length); } else {
          for (const idx of pendingGo) out[idx].type = type;
          pendingGo = [];
        }
      } else {
        let k = a;
        while (k < end && !this.isId(k)) k++;
        if (k < end) {
          name = this.v(k);
          const colon = this.findTop(k + 1, end, (t) => t.v === ':');
          if (colon >= 0) type = this.text(colon + 1, end);
          else if (this.fam === 'php' && k > a) type = this.text(a, k);
          else if (this.fam === 'php') type = '';
          if (this.fam === 'php') {
            // PHP: `Request $request` — the variable is the $-name
            let j = a;
            while (j < end && !(this.isId(j) && this.v(j)[0] === '$')) j++;
            if (j < end) { name = this.v(j); type = this.text(a, j); }
          }
        }
      }
      if (name) out.push({ name, type: type.trim(), ann: anns.join(' '), def, destructure });
    }
    return out;
  }

  // ---------- expressions ----------
  parseExprRange(s, e) {
    try { return this.expr(s, e); } catch { return { k: 'lit', line: this.line(s) }; }
  }

  expr(s, e) {
    if (s >= e) return { k: 'lit', line: this.line(s) };
    const parts = [];
    const ops = [];
    const excluded = new Set();
    let i = s;
    let pyIf = false;
    let guard = 0;
    while (i < e && guard++ < 100000) {
      const t = this.toks[i];
      const lam = this.tryLambda(i, e);
      if (lam) { parts.push(lam.node); i = lam.next; continue; }
      if (t.t === 'op' && !OPENERS[t.v]) {
        if (t.v === '?' || t.v === '?:') {
          if (t.v === '?') for (let k = 0; k < parts.length; k++) excluded.add(k);
        }
        ops.push(t.v);
        i++;
        continue;
      }
      if (t.t === 'id' && KW_OPS.has(t.v) && !(this.v(i + 1) === '(' && ['print', 'select', 'from', 'where', 'async', 'out'].includes(t.v)) && !(t.v === 'print' && this.fam === 'php')) {
        if (t.v === 'if' && this.fam === 'py') { pyIf = true; }
        if (t.v === 'else' && this.fam === 'py') { pyIf = false; }
        ops.push(t.v);
        i++;
        continue;
      }
      const r = this.postfix(i, e);
      if (r.next <= i) { i++; continue; }
      if (pyIf) excluded.add(parts.length);
      parts.push(r.node);
      i = r.next;
    }
    if (parts.length === 1 && !ops.some((o) => CMP_OPS.has(o))) return parts[0];
    const node = { k: 'op', parts, ops, line: this.line(s) };
    if (excluded.size) node.excluded = [...excluded];
    if (ops.some((o) => CMP_OPS.has(o)) && !ops.some((o) => VALUE_OPS.has(o))) node.bool = true;
    return node;
  }

  tryLambda(i, e) {
    const fam = this.fam;
    let a = i;
    if (this.v(a) === 'async' && (this.v(a + 1) === '(' || this.isId(a + 1))) a++;
    if (fam === 'js' || fam === 'cs' || fam === 'java') {
      const arrow = fam === 'java' ? '->' : '=>';
      let paramsS = -1; let paramsE = -1; let after = -1;
      if (this.v(a) === '(' && this.close(a) > a) {
        const c = this.close(a);
        let k = c + 1;
        if (fam === 'js' && this.v(k) === ':') { // return type annotation
          let j = k + 1;
          while (j < e && this.v(j) !== arrow && j < k + 12) j++;
          if (this.v(j) === arrow) k = j;
        }
        if (this.v(k) === arrow) { paramsS = a + 1; paramsE = c; after = k + 1; }
      } else if (this.isId(a) && this.v(a + 1) === arrow) {
        paramsS = a; paramsE = a + 1; after = a + 2;
      }
      if (after < 0) return null;
      const params = this.parseParams(paramsS, paramsE);
      return this.lambdaBody(params, after, e, this.line(i));
    }
    if (fam === 'rb' && this.v(a) === '->') {
      let k = a + 1;
      let params = [];
      if (this.v(k) === '(') { params = this.parseParams(k + 1, this.close(k)); k = this.close(k) + 1; }
      if (this.v(k) === '{' || this.v(k) === 'do') return this.blockFn(k, params, e);
    }
    return null;
  }

  lambdaBody(params, after, e, line) {
    const fn = this.newFn('', line, params, []);
    let next;
    if (this.v(after) === '{' && this.close(after) > after) {
      const c = this.close(after);
      this.withFn(fn, () => this.block(after + 1, c));
      next = c + 1;
    } else {
      // expression body runs to the end of the range (callers pass an argument range)
      let end = e;
      const comma = this.findTop(after, e, (t) => t.v === ',' || t.v === ';');
      if (comma >= 0) end = comma;
      this.withFn(fn, () => this.emit({ k: 'return', e: this.parseExprRange(after, end), line: this.line(after) }));
      next = end;
    }
    return { node: { k: 'fn', fn, line }, next };
  }

  // `{ |a, b| ... }` / `do |a| ... end` (Ruby) and `{ a, b -> ... }` (Kotlin)
  blockFn(k, params, e) {
    const fam = this.fam;
    const open = this.v(k);
    let end = open === 'do' ? this.endMatch(k) : this.close(k);
    if (end == null || end < k) end = e - 1;
    let bodyS = k + 1;
    if (fam === 'rb' && this.v(bodyS) === '|') {
      let j = bodyS + 1;
      while (j < end && this.v(j) !== '|') j++;
      params = this.parseParams(bodyS + 1, j);
      bodyS = j + 1;
    } else if (fam === 'kt') {
      const arrow = this.findTop(bodyS, end, (t) => t.v === '->');
      if (arrow >= 0 && arrow < end) { params = this.parseParams(bodyS, arrow); bodyS = arrow + 1; } else if (!params.length) params = [{ name: 'it', type: '', ann: '', def: '' }];
    }
    const fn = this.newFn('', this.line(k), params, []);
    this.withFn(fn, () => {
      if (fam === 'rb') this.rbBlock(bodyS, end);
      else this.block(bodyS, end);
      // Kotlin/Ruby blocks return their last expression
      const last = fn.stmts[fn.stmts.length - 1];
      if (last && last.k === 'expr') fn.stmts.push({ k: 'return', e: last.e, line: last.line, cond: false });
    });
    return { node: { k: 'fn', fn, line: this.line(k) }, next: end + 1 };
  }

  endMatch(k) { return this.ends ? this.ends.get(k) : undefined; }

  args(s, e) {
    const args = [];
    const named = {};
    for (const [a, b] of this.splitTop(s, e, ',')) {
      // named args: py `k=v`, kt `k = v`, cs `k: v`, rb `k: v`, php `k: v`
      if (this.isId(a) && ((this.v(a + 1) === '=' && (this.fam === 'py' || this.fam === 'kt')) || (this.v(a + 1) === ':' && (this.fam === 'cs' || this.fam === 'php' || this.fam === 'rb' || this.fam === 'py' && false)))) {
        if (this.fam === 'rb') {
          // Ruby keyword args collect into a trailing hash
          let h = args.length && args[args.length - 1].k === 'obj' && args[args.length - 1].kw ? args[args.length - 1] : null;
          if (!h) { h = { k: 'obj', entries: [], kw: true, line: this.line(a) }; args.push(h); }
          h.entries.push({ key: this.v(a), value: this.parseExprRange(a + 2, b) });
        }
        named[this.v(a)] = this.parseExprRange(a + 2, b);
        continue;
      }
      if (this.fam === 'rb' && this.findTop(a, b, (t) => t.v === '=>') >= 0) {
        const arrow = this.findTop(a, b, (t) => t.v === '=>');
        let h = args.length && args[args.length - 1].k === 'obj' && args[args.length - 1].kw ? args[args.length - 1] : null;
        if (!h) { h = { k: 'obj', entries: [], kw: true, line: this.line(a) }; args.push(h); }
        const kt = this.toks[a];
        h.entries.push({ key: kt && kt.t === 'str' ? kt.v : this.text(a, arrow), value: this.parseExprRange(arrow + 1, b) });
        continue;
      }
      if (this.v(a) === '**' || this.v(a) === '...' || this.v(a) === '*') { args.push(this.parseExprRange(a + 1, b)); continue; }
      args.push(this.parseExprRange(a, b));
    }
    return { args, named };
  }

  postfix(i, e) {
    let { node, next } = this.primary(i, e);
    const fam = this.fam;
    let guard = 0;
    while (next < e && guard++ < 10000) {
      const t = this.toks[next];
      const v = t.v;
      if (((v === '.' || v === '?.') && fam !== 'php' || v === '->' && fam === 'php' || v === '::' || v === '&.') && t.t === 'op' && next + 1 < e && this.toks[next + 1].t === 'id') {
        node = { k: 'member', obj: node, prop: this.v(next + 1), line: t.line };
        next += 2;
        continue;
      }
      if (v === '?.' && this.v(next + 1) === '(' ) { next += 1; continue; }
      if (v === '[' && t.t === 'op' && this.close(next) > next && this.close(next) < e && !(t.nl && ASI.has(fam))) {
        const c = this.close(next);
        node = { k: 'index', obj: node, idx: this.parseExprRange(next + 1, c), line: t.line };
        next = c + 1;
        continue;
      }
      if (v === '(' && t.t === 'op' && this.close(next) > next && this.close(next) < e && !(t.nl && ASI.has(fam) && fam !== 'kt')) {
        const c = this.close(next);
        const { args, named } = this.args(next + 1, c);
        node = { k: 'call', callee: node, args, named, line: this.line(i), col: this.col(i), src: this.text(i, c + 1) };
        next = c + 1;
        // anonymous class / trailing lambda
        if ((fam === 'kt' || fam === 'rb') && this.v(next) === '{' && !this.toks[next].nl) {
          const r = this.blockFn(next, [], e);
          node.args.push(r.node); next = r.next;
        } else if (fam === 'rb' && this.v(next) === 'do') {
          const r = this.blockFn(next, [], e);
          node.args.push(r.node); next = r.next;
        }
        continue;
      }
      if (fam === 'go' && v === '{' && (node.k === 'name' || node.k === 'member' || node.k === 'index' || node.k === 'arr') && this.close(next) > next && this.close(next) < e) {
        const c = this.close(next);
        const obj = this.objLiteral(next, c);
        node = { k: 'call', callee: node, args: [obj], named: {}, line: this.line(i), col: this.col(i), src: this.text(i, c + 1), composite: true };
        next = c + 1;
        continue;
      }
      if ((fam === 'kt' || fam === 'rb') && v === '{' && !t.nl && (node.k === 'name' || node.k === 'member') && this.close(next) > next) {
        const r = this.blockFn(next, [], e);
        node = { k: 'call', callee: node, args: [r.node], named: {}, line: this.line(i), col: this.col(i), src: this.text(i, r.next) };
        next = r.next;
        continue;
      }
      if (fam === 'rb' && v === 'do' && (node.k === 'name' || node.k === 'member')) {
        const r = this.blockFn(next, [], e);
        node = { k: 'call', callee: node, args: [r.node], named: {}, line: this.line(i), col: this.col(i), src: this.text(i, r.next) };
        next = r.next;
        continue;
      }
      if ((v === '!' || v === '!!') && (fam === 'kt' || fam === 'js') && t.t === 'op') {
        const nv = this.v(next + 1);
        if (nv === '.' || nv === '!' || nv === ')' || nv === ',' || nv === ';' || nv === '?.' || next + 1 >= e || (this.toks[next + 1] && this.toks[next + 1].nl)) { next++; continue; }
      }
      if ((v === '++' || v === '--') && t.t === 'op') { next++; continue; }
      if (fam === 'rb' && !t.nl && (node.k === 'name' || node.k === 'member') && this.rbCommandArgStart(next)) {
        // command call without parentheses: `system "ls #{x}"`, `redirect_to params[:u]`
        let end = e;
        const mod = this.findTop(next, e, (tk) => tk.t === 'id' && (tk.v === 'if' || tk.v === 'unless' || tk.v === 'do' || tk.v === 'and' || tk.v === 'or'));
        if (mod >= 0) end = mod;
        const { args, named } = this.args(next, end);
        node = { k: 'call', callee: node, args, named, line: this.line(i), col: this.col(i), src: this.text(i, end) };
        next = end;
        if (this.v(next) === 'do') { const r = this.blockFn(next, [], e); node.args.push(r.node); next = r.next; }
        continue;
      }
      break;
    }
    return { node, next };
  }

  rbCommandArgStart(k) {
    const t = this.toks[k];
    if (!t) return false;
    if (t.t === 'str' || t.t === 'num') return true;
    if (t.t === 'id') return !['if', 'unless', 'and', 'or', 'do', 'then', 'rescue', 'while', 'until', 'end', 'else', 'in', 'not', 'when', 'elsif'].includes(t.v);
    if (t.v === '[' && this.toks[k - 1] && this.toks[k - 1].col + this.toks[k - 1].v.length < t.col) return true;
    if (t.v === '::' || t.v === '->' || t.v === '*' && false) return true;
    return false;
  }

  objLiteral(s, c) {
    const entries = [];
    for (const [a, b] of this.splitTop(s + 1, c, ',')) {
      if (this.v(a) === '...' || this.v(a) === '**') { entries.push({ key: null, value: this.parseExprRange(a + 1, b) }); continue; }
      const sep = this.findTop(a, b, (t) => t.v === ':' || t.v === '=>');
      if (sep > a) {
        const kt = this.toks[a];
        const key = kt.t === 'str' ? kt.v : (kt.v === '[' ? null : kt.v);
        entries.push({ key, keyNode: kt.v === '[' ? this.parseExprRange(a + 1, this.close(a)) : null, value: this.parseExprRange(sep + 1, b) });
      } else if (this.isId(a) && this.v(a + 1) === '(' && this.v(this.close(a + 1) + 1) === '{') {
        // method shorthand
        const pc = this.close(a + 1);
        const r = this.lambdaBody(this.parseParams(a + 2, pc), pc + 1, b, this.line(a));
        r.node.fn.name = this.v(a);
        entries.push({ key: this.v(a), value: r.node });
      } else {
        entries.push({ key: this.isId(a) ? this.v(a) : null, value: this.parseExprRange(a, b) });
      }
    }
    return { k: 'obj', entries, line: this.line(s) };
  }

  primary(i, e) {
    const t = this.toks[i];
    const fam = this.fam;
    const line = t.line;
    if (t.t === 'num') return { node: { k: 'lit', line }, next: i + 1 };
    if (t.t === 'str') {
      const parts = [];
      for (const p of t.parts || []) {
        try {
          const sub = new Parser(p, this.file, this.lang, this.fir);
          sub.fn = this.fn; sub.cls = this.cls; sub.ends = new Map();
          parts.push(sub.parseExprRange(0, p.length));
        } catch { /* skip */ }
      }
      return { node: { k: 'str', lit: t.v, parts, regex: !!t.regex, shell: !!t.shell, fstring: !!t.fstring, line, col: t.col }, next: i + 1 };
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        const c = this.close(i);
        if (c < 0 || c >= e) return { node: { k: 'lit', line }, next: i + 1 };
        // cast: (int) x
        if (c === i + 2 && this.isId(i + 1) && CAST_TYPES.test(this.v(i + 1)) && c + 1 < e && (this.toks[c + 1].t !== 'op' || this.v(c + 1) === '(')) {
          const r = this.postfix(c + 1, e);
          return { node: { k: 'cast', type: this.v(i + 1), e: r.node, line }, next: r.next };
        }
        const inner = this.splitTop(i + 1, c, ',');
        if (inner.length > 1) return { node: { k: 'op', parts: inner.map(([a, b]) => this.parseExprRange(a, b)), ops: [','], line }, next: c + 1 };
        return { node: this.parseExprRange(i + 1, c), next: c + 1 };
      }
      if (t.v === '[') {
        const c = this.close(i);
        if (c < 0 || c >= e) return { node: { k: 'lit', line }, next: i + 1 };
        if (fam === 'php' && this.findTop(i + 1, c, (tk) => tk.v === '=>') >= 0) return { node: this.objLiteral(i, c), next: c + 1 };
        const items = this.splitTop(i + 1, c, ',').map(([a, b]) => this.parseExprRange(a, b));
        return { node: { k: 'arr', items, line }, next: c + 1 };
      }
      if (t.v === '{') {
        const c = this.close(i);
        if (c < 0 || c >= e + 1) return { node: { k: 'lit', line }, next: i + 1 };
        if (fam === 'kt' || (fam === 'rb' && this.v(i + 1) === '|')) return this.blockFn(i, [], e);
        return { node: this.objLiteral(i, c), next: c + 1 };
      }
      return { node: { k: 'lit', line }, next: i + 1 };
    }
    // identifiers and keywords
    const v = t.v;
    if (v === 'new' && fam !== 'py' && fam !== 'rb') {
      let k = i + 1;
      const s0 = k;
      while (k < e && (this.isId(k) || this.v(k) === '.' || this.v(k) === '\\' || this.v(k) === '::')) k++;
      if (k === s0) {
        if (this.v(k) === '(' || this.v(k) === '{') return { node: { k: 'lit', line }, next: k };
        return { node: { k: 'lit', line }, next: i + 1 };
      }
      const nameNode = this.chainFromText(this.text(s0, k).replace(/\s+/g, ''), line);
      if (this.v(k) === '<') { // generics
        let depth = 0;
        for (; k < e; k++) { if (this.v(k) === '<') depth++; else if (this.v(k) === '>') { depth--; if (depth === 0) { k++; break; } } else if (this.v(k) === '>>') { depth -= 2; if (depth <= 0) { k++; break; } } }
      }
      if (this.v(k) === '(' && this.close(k) > k) {
        const c = this.close(k);
        const { args, named } = this.args(k + 1, c);
        const node = { k: 'call', callee: nameNode, args, named, isNew: true, line, col: t.col, src: this.text(i, c + 1) };
        let next = c + 1;
        if (this.v(next) === '{' && this.close(next) > next && fam !== 'js') { // anonymous class body
          const bc = this.close(next);
          const saved = [this.cls];
          this.cls = (this.cls || '') + '$anon';
          try { this.block(next + 1, bc, { inClass: true }); } catch { /* skip */ }
          [this.cls] = saved;
          next = bc + 1;
        }
        return { node, next };
      }
      if (this.v(k) === '[' || this.v(k) === '{') {
        const c = this.close(k);
        return { node: { k: 'lit', line }, next: c > k ? c + 1 : k + 1 };
      }
      return { node: { k: 'call', callee: nameNode, args: [], named: {}, isNew: true, line, col: t.col, src: this.text(i, k) }, next: k };
    }
    if ((v === 'function' && (fam === 'js' || fam === 'php')) || (v === 'func' && fam === 'go') || (v === 'fn' && fam === 'php' && this.v(i + 1) === '(')) {
      let k = i + 1;
      if (this.v(k) === '*' || this.v(k) === '&') k++;
      let name = '';
      if (this.isId(k) && this.v(k + 1) === '(') { name = this.v(k); k++; }
      if (this.v(k) !== '(' || this.close(k) < 0) return { node: { k: 'lit', line }, next: i + 1 };
      const pc = this.close(k);
      const params = this.parseParams(k + 1, pc);
      let b = pc + 1;
      if (v === 'fn') {
        while (b < e && this.v(b) !== '=>') b++;
        const r = this.lambdaBody(params, b + 1, e, line);
        r.node.fn.name = name;
        return r;
      }
      if (fam === 'php' && this.v(b) === 'use' && this.v(b + 1) === '(') b = this.close(b + 1) + 1;
      while (b < e && this.v(b) !== '{') b++;
      if (b >= e) return { node: { k: 'lit', line }, next: pc + 1 };
      const r = this.lambdaBody(params, b, e, line);
      r.node.fn.name = name;
      return r;
    }
    if (v === 'lambda' && fam === 'py') {
      const colon = this.findTop(i + 1, e, (tk) => tk.v === ':');
      if (colon < 0) return { node: { k: 'lit', line }, next: i + 1 };
      const params = this.parseParams(i + 1, colon);
      const fn = this.newFn('', line, params, []);
      this.withFn(fn, () => this.emit({ k: 'return', e: this.parseExprRange(colon + 1, e), line }));
      return { node: { k: 'fn', fn, line }, next: e };
    }
    if ((v === 'lambda' || v === 'proc') && fam === 'rb' && (this.v(i + 1) === '{' || this.v(i + 1) === 'do')) return this.blockFn(i + 1, [], e);
    if (fam === 'php' && (v === 'array' || v === 'list') && this.v(i + 1) === '(') {
      const c = this.close(i + 1);
      if (this.findTop(i + 2, c, (tk) => tk.v === '=>') >= 0) {
        const o = this.objLiteral(i + 1, c);
        return { node: o, next: c + 1 };
      }
      const items = this.splitTop(i + 2, c, ',').map(([a, b]) => this.parseExprRange(a, b));
      return { node: { k: 'arr', items, line }, next: c + 1 };
    }
    if (['true', 'false', 'null', 'nil', 'None', 'True', 'False', 'undefined', 'NULL', 'nullptr'].includes(v)) return { node: { k: 'lit', line }, next: i + 1 };
    return { node: { k: 'name', name: v, line, col: t.col }, next: i + 1 };
  }

  chainFromText(text, line) {
    const segs = text.split(/\.|::|\\/).filter(Boolean);
    let node = { k: 'name', name: segs[0] || text, line };
    for (let k = 1; k < segs.length; k++) node = { k: 'member', obj: node, prop: segs[k], line };
    return node;
  }

  // ---------- statements (brace languages) ----------
  stmtEnd(i, e) {
    const asi = ASI.has(this.fam);
    let j = i;
    while (j < e) {
      const t = this.toks[j];
      if (j > i && t.nl && asi && !continues(this.toks[j - 1], t, this.fam)) return j;
      if (OPENERS[t.v] && t.t === 'op') {
        const c = this.close(j);
        if (c > j && c < e) { j = c + 1; continue; }
        j++;
        continue;
      }
      if ((t.v === ';' || t.v === '}') && t.t === 'op') return j;
      j++;
    }
    return e;
  }

  block(s, e, opts) {
    const inClass = !!(opts && opts.inClass);
    let i = s;
    let anns = [];
    let nextCond = false;
    let guard = 0;
    while (i < e && guard++ < 200000) {
      const start = i;
      try {
        const r = this.statement(i, e, inClass, anns, nextCond);
        i = r.next;
        anns = r.anns || [];
        nextCond = !!r.nextCond;
      } catch {
        i = this.past(this.stmtEnd(i, e));
        anns = [];
      }
      if (i <= start) i = start + 1;
    }
  }

  statement(i, e, inClass, anns, nextCond) {
    const t = this.toks[i];
    const v = t.v;
    const fam = this.fam;
    if (t.t === 'op' && (v === ';' || v === ',' || v === '}' || v === ')' || v === ']')) return { next: i + 1, anns };
    // annotations / decorators / attributes
    if (v === '@' && this.isId(i + 1) && this.v(i + 1) !== 'interface') {
      let j = i + 2;
      while ((this.v(j) === '.' || this.v(j) === ':') && this.isId(j + 1)) j += 2;
      if (this.v(j) === '(' && this.close(j) > j) j = this.close(j) + 1;
      return { next: j, anns: anns.concat(this.text(i, j)) };
    }
    if ((v === '[' && fam === 'cs' || v === '#[' && fam === 'php') && this.close(i) > i) {
      const c = this.close(i);
      if (this.v(c + 1) !== '=' && this.v(c + 1) !== '.' && this.v(c + 1) !== ';') return { next: c + 1, anns: anns.concat(this.text(i, c + 1)) };
    }
    if (v === '{') {
      const c = this.close(i);
      if (c > i && c <= e) {
        const saved = this.cond;
        if (this.fn && !this.fn.isModule) this.cond = true;
        this.block(i + 1, c, inClass ? { inClass } : null);
        this.cond = saved;
        return { next: c + 1 };
      }
      return { next: i + 1 };
    }
    // imports
    const imp = this.tryImport(i, e);
    if (imp) return { next: imp };
    // modifiers
    let k = i;
    let isDefault = false;
    while (k < e && this.isId(k) && MODIFIERS.has(this.v(k)) && !(this.v(k) === 'enum' && this.isId(k + 1) && this.v(k + 2) !== '(' && fam !== 'kt' && false)) {
      if (this.v(k) === 'default') isDefault = true;
      if ((this.v(k) === 'const' || this.v(k) === 'static' || this.v(k) === 'final' || this.v(k) === 'readonly') && fam === 'js') break;
      if (this.v(k) === 'enum' && fam !== 'kt' && !(this.v(k + 1) === 'class')) break;
      k++;
    }
    if (fam === 'js' && this.v(i) === 'export' && this.v(i + 1) === 'default' && !['function', 'class', 'async'].includes(this.v(i + 2))) {
      // export default <expr>
      const end = this.stmtEnd(i + 2, e);
      const node = this.parseExprRange(i + 2, end);
      if (node.k === 'name') this.fir.defaultExport = node.name;
      if (node.k === 'fn') { node.fn.isDefault = true; }
      return { next: this.past(end) };
    }
    if (fam === 'js' && this.v(i) === 'export' && this.v(i + 1) === '{') {
      return { next: this.past(this.stmtEnd(i, e)) };
    }
    // classes
    if (this.isId(k) && CLASS_KW.has(this.v(k)) && this.isId(k + 1) && !(this.v(k) === 'object' && fam !== 'kt') && !(this.v(k) === 'record' && fam !== 'java' && fam !== 'cs')) {
      return { next: this.classDecl(k, e, anns) };
    }
    if (fam === 'kt' && this.v(k) === 'companion' && this.v(k + 1) === 'object') {
      let b = k + 2;
      while (b < e && this.v(b) !== '{') b++;
      if (b < e) { this.block(b + 1, this.close(b), { inClass: true }); return { next: this.close(b) + 1 }; }
    }
    if ((v === 'namespace' || v === 'package') && fam !== 'py') {
      let b = i + 1;
      while (b < e && this.v(b) !== '{' && this.v(b) !== ';' && !(this.toks[b].nl && ASI.has(fam))) b++;
      if (this.v(b) === '{' && this.close(b) > b) { this.block(b + 1, this.close(b)); return { next: this.close(b) + 1 }; }
      return { next: b + 1 };
    }
    // function declarations
    const fd = this.tryFnDecl(i, k, e, inClass, anns, isDefault);
    if (fd) return { next: fd };
    if (inClass && fam !== 'js' && fam !== 'php' && fam !== 'kt') {
      // field: `private String x = ...;` — parse as module-level assignment
    }
    // control flow
    if (t.t === 'id') {
      const ctl = this.control(i, e);
      if (ctl) return ctl;
    }
    // simple statement
    const end = this.stmtEnd(i, e);
    const savedCond = this.cond;
    if (nextCond) this.cond = true;
    this.simple(i, end, anns, inClass);
    this.cond = savedCond;
    return { next: end < e && this.v(end) === ';' ? end + 1 : end };
  }

  classDecl(k, e, anns) {
    const name = this.v(k + 1);
    let b = k + 2;
    let bases = '';
    let depth = 0;
    while (b < e) {
      const v = this.v(b);
      if (v === '(' && this.close(b) > b) { b = this.close(b) + 1; continue; }
      if (v === '<') depth++;
      if (v === '>') depth--;
      if (v === '{' && depth <= 0) break;
      if (v === ';') break;
      if (this.toks[b].nl && ASI.has(this.fam) && this.fam === 'kt' && b > k + 2 && this.v(b) !== ':' && !continues(this.toks[b - 1], this.toks[b], this.fam)) break;
      bases += ' ' + v;
      b++;
    }
    this.fir.classes.push({ name, bases: bases.trim(), anns: anns.join(' '), line: this.line(k), file: this.file });
    if (this.v(b) === '{' && this.close(b) > b) {
      const c = this.close(b);
      const saved = this.cls;
      this.cls = name;
      this.block(b + 1, c, { inClass: true });
      this.cls = saved;
      return c + 1;
    }
    return b + 1;
  }

  tryFnDecl(i, k, e, inClass, anns, isDefault) {
    const fam = this.fam;
    const v = this.v(k);
    let name = '';
    let pOpen = -1;
    let recvType = '';
    if ((fam === 'js' || fam === 'php') && v === 'function') {
      let j = k + 1;
      if (this.v(j) === '*' || this.v(j) === '&') j++;
      if (this.isId(j) && this.v(j + 1) === '(') { name = this.v(j); pOpen = j + 1; } else if (this.v(j) === '(') { pOpen = j; }
    } else if (fam === 'go' && v === 'func') {
      let j = k + 1;
      if (this.v(j) === '(' && this.close(j) > j) {
        const rc = this.close(j);
        const rp = this.parseParams(j + 1, rc);
        if (rp[0]) recvType = rp[0].type.replace(/[*\s]/g, '');
        j = rc + 1;
      }
      if (this.isId(j) && this.v(j + 1) === '(') { name = this.v(j); pOpen = j + 1; }
      if (this.isId(j) && this.v(j + 1) === '[') { name = this.v(j); const gc = this.close(j + 1); if (this.v(gc + 1) === '(') pOpen = gc + 1; }
    } else if (fam === 'kt' && v === 'fun') {
      let j = k + 1;
      if (this.v(j) === '<') { while (j < e && this.v(j) !== '>') j++; j++; }
      while (this.isId(j) && this.v(j + 1) === '.') j += 2;
      if (this.isId(j) && this.v(j + 1) === '(') { name = this.v(j); pOpen = j + 1; }
    } else if (fam === 'js' && inClass && (this.isId(k) || this.v(k) === '#') && !NOT_FN_NAME.has(v)) {
      let j = k;
      if ((this.v(j) === 'get' || this.v(j) === 'set') && this.isId(j + 1) && this.v(j + 2) === '(') j++;
      if (this.v(j) === '#') j++;
      if (this.isId(j) && this.v(j + 1) === '(') {
        const c = this.close(j + 1);
        let b = c + 1;
        if (this.v(b) === ':') { while (b < e && this.v(b) !== '{' && this.v(b) !== ';') b++; }
        if (this.v(b) === '{') { name = this.v(j); pOpen = j + 1; }
      }
    } else if ((fam === 'java' || fam === 'cs') && this.isId(k)) {
      // [type tokens] name ( params ) [throws X] {  |  => expr ;  |  ;
      const p = this.findTop(k, e, (tk) => tk.v === '(' || tk.v === '=' || tk.v === ';' || tk.v === '{' || tk.v === '=>' || tk.v === '}' || tk.v === '->');
      if (p > k && this.v(p) === '(' && this.isId(p - 1) && !NOT_FN_NAME.has(this.v(p - 1)) && this.v(p - 2) !== '.' && this.v(p - 2) !== 'new' && this.v(p - 2) !== '?.') {
        const typeToks = p - 1 - k;
        const isCtor = this.v(p - 1) === this.cls;
        if (typeToks >= 1 || isCtor || (inClass && fam === 'cs')) {
          const c = this.close(p);
          let b = c + 1;
          while (b < e && this.v(b) !== '{' && this.v(b) !== ';' && this.v(b) !== '=>' && this.v(b) !== '=' && this.v(b) !== '}') {
            if (this.v(b) === '(' && this.close(b) > b) { b = this.close(b) + 1; continue; }
            b++;
          }
          if (this.v(b) === '{' || this.v(b) === '=>' || (this.v(b) === ';' && inClass)) {
            if (typeToks >= 1 || isCtor || this.v(b) !== ';') { name = this.v(p - 1); pOpen = p; }
          }
        }
      }
    }
    if (pOpen < 0) return 0;
    const pc = this.close(pOpen);
    if (pc < 0) return 0;
    const params = this.parseParams(pOpen + 1, pc);
    let b = pc + 1;
    while (b < e && this.v(b) !== '{' && this.v(b) !== ';' && this.v(b) !== '=>' && !(this.v(b) === '=' && (fam === 'kt' || fam === 'cs'))) {
      if (this.v(b) === '(' && this.close(b) > b) { b = this.close(b) + 1; continue; }
      if (fam === 'kt' && this.toks[b].nl && b > pc + 1 && this.v(b) !== ':' && this.v(b - 1) !== ':') break;
      if (fam === 'go' && this.toks[b].nl) break;
      b++;
    }
    const fn = this.newFn(name, this.line(k), params, anns);
    fn.mods = this.text(i, k);
    if (recvType) fn.cls = recvType;
    if (isDefault || this.v(i) === 'export' && this.v(i + 1) === 'default') fn.isDefault = true;
    if (this.v(b) === '{' && this.close(b) > b) {
      const c = this.close(b);
      this.withFn(fn, () => this.block(b + 1, c));
      return c + 1;
    }
    if (this.v(b) === '=>' || this.v(b) === '=') {
      const end = this.stmtEnd(b + 1, e);
      this.withFn(fn, () => this.emit({ k: 'return', e: this.parseExprRange(b + 1, end), line: this.line(b) }));
      return this.past(end);
    }
    return b + 1;
  }

  tryImport(i, e) {
    const fam = this.fam;
    const v = this.v(i);
    const imports = this.fir.imports;
    if (fam === 'js' && v === 'import' && this.v(i + 1) !== '(' && this.v(i + 1) !== '.') {
      const end = this.stmtEnd(i, e);
      const fromIdx = this.findTop(i, end, (t) => t.v === 'from');
      const modTok = fromIdx >= 0 ? this.toks[fromIdx + 1] : this.toks[i + 1];
      if (!modTok || modTok.t !== 'str') return this.past(end);
      const mod = modTok.v;
      if (fromIdx > i + 1) {
        let j = i + 1;
        if (this.v(j) === 'type') j++;
        while (j < fromIdx) {
          if (this.isId(j) && this.v(j) !== 'as') { imports.push({ local: this.v(j), module: mod, imported: 'default', line: this.line(i) }); j++; continue; }
          if (this.v(j) === '*' && this.v(j + 1) === 'as') { imports.push({ local: this.v(j + 2), module: mod, imported: '*', line: this.line(i) }); j += 3; continue; }
          if (this.v(j) === '{') {
            const c = this.close(j);
            for (const [a, b] of this.splitTop(j + 1, c, ',')) {
              const asI = this.findTop(a, b, (t) => t.v === 'as');
              const orig = this.v(a) === 'type' ? this.v(a + 1) : this.v(a);
              imports.push({ local: asI >= 0 ? this.v(asI + 1) : orig, module: mod, imported: orig, line: this.line(i) });
            }
            j = c + 1;
            continue;
          }
          j++;
        }
      }
      return this.past(end);
    }
    if ((fam === 'java' || fam === 'kt') && (v === 'import' || v === 'package')) {
      let end = fam === 'kt' ? this.lineEnd(i, e) : this.stmtEnd(i, e);
      if (this.v(end - 1) === ';') end--;
      if (v === 'import') {
        let j = i + 1;
        const isStatic = this.v(j) === 'static';
        if (isStatic) j++;
        const asI = this.findTop(j, end, (t) => t.v === 'as');
        const path = this.text(j, asI >= 0 ? asI : end).replace(/\s+/g, '');
        const segs = path.split('.');
        const last = segs[segs.length - 1];
        if (last !== '*') {
          imports.push({ local: asI >= 0 ? this.v(asI + 1) : last, module: isStatic ? segs.slice(0, -1).join('.') : path, imported: isStatic ? last : '*', line: this.line(i), cls: isStatic ? segs[segs.length - 2] : last });
        }
      }
      return this.past(end);
    }
    if (fam === 'cs' && v === 'using' && this.v(i + 1) !== '(' && this.v(i + 1) !== 'var') {
      const end = this.stmtEnd(i, e);
      return this.past(end);
    }
    if (fam === 'go' && v === 'import') {
      const one = (a, b) => {
        let alias = '';
        let k = a;
        if (this.isId(k) || this.v(k) === '.' || this.v(k) === '_') { alias = this.v(k); k++; }
        const tk = this.toks[k];
        if (tk && tk.t === 'str') {
          const segs = tk.v.split('/');
          imports.push({ local: alias || segs[segs.length - 1], module: tk.v, imported: '*', line: this.line(a) });
        }
      };
      if (this.v(i + 1) === '(') {
        const c = this.close(i + 1);
        let a = i + 2;
        for (let k = i + 2; k <= c; k++) {
          if (k === c || (k > a && this.toks[k].nl) || this.v(k) === ';') { if (k > a) one(a, k); a = this.v(k) === ';' ? k + 1 : k; }
        }
        return c + 1;
      }
      one(i + 1, i + 3);
      return this.past(this.stmtEnd(i + 1, e));
    }
    if (fam === 'go' && v === 'package') return this.past(this.stmtEnd(i + 1, e));
    if (fam === 'php' && v === 'use' && (this.fn == null || this.fn.isModule)) {
      const end = this.stmtEnd(i, e);
      const path = this.text(i + 1, end).replace(/\s+/g, '');
      const segs = path.split('\\');
      const asM = /^(.*)as(\w+)$/.exec(segs[segs.length - 1]);
      imports.push({ local: asM ? asM[2] : segs[segs.length - 1], module: path, imported: '*', line: this.line(i), cls: asM ? asM[1] : segs[segs.length - 1] });
      return this.past(end);
    }
    return 0;
  }

  // control statements; returns { next, nextCond } or null
  control(i, e) {
    const fam = this.fam;
    const v = this.v(i);
    const line = this.line(i);
    if (v === 'else' || v === 'try' || v === 'finally' || v === 'do' || v === 'default' && this.v(i + 1) === ':' || v === 'unsafe' || v === 'checked') {
      let n = i + 1;
      if (this.v(n) === ':') n++;
      return { next: n, nextCond: true };
    }
    if (v === 'case') {
      const colon = this.findTop(i + 1, e, (t) => t.v === ':' || t.v === '->');
      return { next: colon < 0 ? i + 1 : colon + 1 };
    }
    if (v === 'return' || v === 'throw' || v === 'yield' && fam !== 'py') {
      const end = this.stmtEnd(i + 1, e);
      const node = end > i + 1 ? this.parseExprRange(i + 1, end) : { k: 'lit', line };
      this.emit({ k: v === 'return' || v === 'yield' ? 'return' : 'expr', e: node, line });
      return { next: end < e && this.v(end) === ';' ? end + 1 : end };
    }
    if (fam === 'php' && (v === 'echo' || v === 'print' || v === 'include' || v === 'require' || v === 'include_once' || v === 'require_once')) {
      const end = this.stmtEnd(i + 1, e);
      const items = this.splitTop(i + 1, end, ',').map(([a, b]) => this.parseExprRange(a, b));
      this.emit({ k: 'echo', kw: v, e: items, line, col: this.col(i) });
      if (v !== 'echo' && v !== 'print') {
        const tk = this.toks[i + 1];
        if (tk && tk.t === 'str') this.fir.imports.push({ local: '', module: tk.v, imported: '*', line });
        else if (this.v(i + 1) === '(' && this.toks[i + 2] && this.toks[i + 2].t === 'str') this.fir.imports.push({ local: '', module: this.toks[i + 2].v, imported: '*', line });
      }
      return { next: this.past(end) };
    }
    if (fam === 'go' && (v === 'if' || v === 'for' || v === 'switch' || v === 'select')) {
      // header up to the block brace
      let b = i + 1;
      while (b < e && this.v(b) !== '{') {
        if ((this.v(b) === '(' || this.v(b) === '[') && this.close(b) > b) { b = this.close(b) + 1; continue; }
        b++;
      }
      const parts = this.splitTop(i + 1, b, ';');
      if (v === 'for' && parts.length === 1) {
        const [a, z] = parts[0];
        const rng = this.findTop(a, z, (t) => t.v === 'range');
        if (rng >= 0) {
          const asg = this.findTop(a, rng, (t) => t.v === ':=' || t.v === '=');
          const names = asg >= 0 ? this.splitTop(a, asg, ',').map(([x]) => this.v(x)) : [];
          this.emit({ k: 'foreach', targets: names.slice(-1), e: this.parseExprRange(rng + 1, z), line, cond: true });
          return { next: b };
        }
      }
      for (let p = 0; p < parts.length; p++) {
        const [a, z] = parts[p];
        const isLast = p === parts.length - 1;
        if (!isLast || this.findTop(a, z, (t) => t.v === ':=') >= 0) {
          this.simple(a, z, [], false);
          this.emit({ k: 'guard', e: this.parseExprRange(a, z), line });
        }
        else this.emit({ k: 'guard', e: this.parseExprRange(a, z), line });
      }
      return { next: b };
    }
    if (['if', 'while', 'switch', 'catch', 'synchronized', 'lock', 'with', 'elseif', 'foreach', 'for', 'using', 'when', 'fixed'].includes(v) && this.v(i + 1) === '(' && this.close(i + 1) > i + 1) {
      const c = this.close(i + 1);
      const s = i + 2;
      if (v === 'catch') return { next: c + 1 };
      if (v === 'for' || v === 'foreach') {
        const semis = this.splitTop(s, c, ';');
        if (this.findTop(s, c, (t) => t.v === ';') >= 0) {
          for (const [a, z] of semis) this.simple(a, z, [], false);
          return { next: c + 1, nextCond: true };
        }
        const sep = this.findTop(s, c, (t) => t.v === 'of' || t.v === 'in' || t.v === ':' || t.v === 'as');
        if (sep >= 0) {
          let tS = s; let tE = sep; let iS = sep + 1; let iE = c;
          if (this.v(sep) === 'as') { iS = s; iE = sep; tS = sep + 1; tE = c; }
          const names = [];
          const arrow = this.findTop(tS, tE, (t) => t.v === '=>');
          const tStart = arrow >= 0 ? arrow + 1 : tS;
          for (let q = tStart; q < tE; q++) if (this.isId(q) && !DECL_KW.has(this.v(q)) && this.v(q + 1) !== '.' && this.v(q - 1) !== '.') names.push(this.v(q));
          const tgt = this.fam === 'java' || this.fam === 'cs' ? names.slice(-1) : names;
          this.emit({ k: 'foreach', targets: tgt, e: this.parseExprRange(iS, iE), line, cond: true });
          return { next: c + 1, nextCond: true };
        }
        return { next: c + 1, nextCond: true };
      }
      if (v === 'using' || v === 'with' || v === 'fixed') { this.simple(s, c, [], false); return { next: c + 1 }; }
      if (fam === 'kt' && v === 'when') {
        this.emit({ k: 'guard', e: this.parseExprRange(s, c), line });
        return { next: c + 1 };
      }
      this.emit({ k: 'guard', e: this.parseExprRange(s, c), line });
      return { next: c + 1, nextCond: true };
    }
    if (fam === 'kt' && v === 'when' && this.v(i + 1) === '{') return { next: i + 1 };
    return null;
  }

  // assignment or expression statement in [s, e)
  simple(s, e, anns, inClass) {
    if (s >= e) return;
    const fam = this.fam;
    let a = s;
    let declared = false;
    while (a < e && this.isId(a) && (DECL_KW.has(this.v(a)) || MODIFIERS.has(this.v(a)) && this.isId(a + 1) && this.v(a + 1) !== '=')) { declared = true; a++; }
    if (fam === 'go' && this.v(s) === 'var') declared = true;
    if (fam === 'go' && (this.v(a) === 'defer' || this.v(a) === 'go')) a++;
    const asg = this.findTop(a, e, (t) => t.t === 'op' && ASSIGN_OPS.has(t.v));
    const line = this.line(s);
    if (asg > a) {
      const op = this.v(asg);
      // chained a = b = c
      const valueNode = this.assignValue(asg + 1, e, anns, inClass);
      const { targets, declType } = this.targets(a, asg, declared || fam === 'java' || fam === 'cs');
      // name function literals after their binding
      if (valueNode.k === 'fn' && !valueNode.fn.name && targets[0]) {
        const tn = targetName(targets[0]);
        if (tn) {
          valueNode.fn.name = tn.split('.').pop();
          if (/^(module\.exports|exports)$/.test(tn)) valueNode.fn.isDefault = true;
          if (/^this\./.test(tn) || inClass) valueNode.fn.cls = this.cls;
        }
      }
      // imports: require()
      if (fam === 'js') this.jsRequire(targets, valueNode, line);
      if (fam === 'js' && targets[0] && targetName(targets[0]) === 'module.exports' && valueNode.k === 'name') this.fir.defaultExport = valueNode.name;
      this.emit({ k: 'assign', targets, value: valueNode, op, line, col: this.col(s), declType });
      return;
    }
    if (fam === 'go' && this.v(s) === 'var') {
      // var x T (no value)
      return;
    }
    if ((fam === 'java' || fam === 'cs' || fam === 'kt') && inClass) {
      // field declaration without initializer, or other member
      return;
    }
    const node = this.parseExprRange(a, e);
    if (fam === 'js' && node.k === 'call' && node.callee.k === 'name' && node.callee.name === 'require') this.jsRequire([], node, line);
    this.emit({ k: 'expr', e: node, line });
  }

  assignValue(s, e, anns, inClass) {
    const asg = this.findTop(s, e, (t) => t.t === 'op' && t.v === '=');
    if (asg > s && this.fam !== 'py') {
      // chained assignment: the inner one becomes its own statement
      this.simple(s, e, anns, inClass);
      const { targets } = this.targets(s, asg, false);
      return targets[0] && targets[0].k !== 'destructure' ? targets[0] : this.parseExprRange(asg + 1, e);
    }
    return this.parseExprRange(s, e);
  }

  jsRequire(targets, valueNode, line) {
    let node = valueNode;
    let prop = null;
    if (node.k === 'member' && node.obj.k === 'call') { prop = node.prop; node = node.obj; }
    if (node.k !== 'call' || node.callee.k !== 'name' || node.callee.name !== 'require') return;
    const arg = node.args[0];
    if (!arg || arg.k !== 'str') return;
    const mod = arg.lit;
    if (!targets.length) { this.fir.imports.push({ local: '', module: mod, imported: '*', line }); return; }
    const t = targets[0];
    if (t.k === 'destructure') {
      for (const it of t.items) this.fir.imports.push({ local: it.name, module: mod, imported: it.key || it.name, line });
    } else {
      const n = targetName(t);
      if (n) this.fir.imports.push({ local: n, module: mod, imported: prop || '*', line });
    }
  }

  targets(s, e, maybeTyped) {
    const fam = this.fam;
    let declType = '';
    // destructuring
    if ((this.v(s) === '{' || this.v(s) === '[') && fam !== 'php' && this.close(s) === e - 1 || (this.v(s) === '{' || this.v(s) === '[') && this.v(this.close(s) + 1) === ':') {
      const c = this.close(s);
      const items = [];
      for (const [a, b] of this.splitTop(s + 1, c, ',')) {
        let x = a;
        if (this.v(x) === '...') x++;
        const colon = this.findTop(x, b, (t) => t.v === ':');
        const eq = this.findTop(x, b, (t) => t.v === '=');
        const keyTok = this.toks[x];
        let nameIdx = colon >= 0 ? colon + 1 : x;
        if (this.v(nameIdx) === '{' || this.v(nameIdx) === '[') {
          // nested destructuring: take inner names
          const cc = this.close(nameIdx);
          for (let q = nameIdx + 1; q < cc; q++) if (this.isId(q) && this.v(q + 1) !== ':') items.push({ key: keyTok.v, name: this.v(q) });
          continue;
        }
        if (this.isId(nameIdx)) items.push({ key: this.v(s) === '{' && keyTok ? keyTok.v : null, name: this.v(nameIdx), def: eq >= 0 });
      }
      return { targets: [{ k: 'destructure', items, line: this.line(s) }], declType };
    }
    // type annotation `x: T`
    const colon = this.findTop(s, e, (t) => t.v === ':');
    if (colon > s && (fam === 'js' || fam === 'kt' || fam === 'py') && this.isId(colon - 1)) {
      declType = this.text(colon + 1, e);
      return { targets: [{ k: 'name', name: this.v(colon - 1), line: this.line(s) }], declType };
    }
    const groups = fam === 'java' || fam === 'cs' || fam === 'js' ? [[s, e]] : this.splitTop(s, e, ',');
    const targets = [];
    for (const [a, b] of groups) {
      if ((fam === 'java' || fam === 'cs') && maybeTyped && b - a >= 2 && this.isId(b - 1) && this.v(b - 2) !== '.' && this.v(b - 2) !== '::' && this.v(b - 2) !== '->') {
        declType = this.text(a, b - 1);
        targets.push({ k: 'name', name: this.v(b - 1), line: this.line(a) });
        continue;
      }
      if (fam === 'go' && b - a >= 2 && this.isId(a) && this.isId(a + 1) && this.v(a) !== '*') {
        declType = this.text(a + 1, b);
        targets.push({ k: 'name', name: this.v(a), line: this.line(a) });
        continue;
      }
      if (fam === 'php' && this.v(a) === 'list' || fam === 'php' && this.v(a) === '[') {
        for (let q = a; q < b; q++) if (this.isId(q) && this.v(q)[0] === '$') targets.push({ k: 'name', name: this.v(q), line: this.line(a) });
        continue;
      }
      let x = a;
      if (this.v(x) === '*' || this.v(x) === '&') x++;
      const node = this.parseExprRange(x, b);
      if (node.k === 'op' && node.parts) { for (const p of node.parts) targets.push(p); } else targets.push(node);
    }
    return { targets, declType };
  }
}

function continues(prev, next, fam) {
  if (!prev) return true;
  if (prev.t === 'op' && !['}', ')', ']', '++', '--', '!', '!!'].includes(prev.v)) return true;
  if (prev.t === 'id' && ['return', 'throw'].includes(prev.v) && false) return true;
  if (next.t === 'op' && ['.', '?.', ')', ']', '&&', '||', '?', ':', '??', '?:', '=>', '->', '==', '===', '!=', '!==', ',', '+', '*', '/', '%', '=', '|', '&', '.='].includes(next.v)) return true;
  if (fam === 'kt' && next.t === 'id' && ['else', 'catch', 'finally'].includes(next.v)) return false;
  return false;
}

function targetName(t) {
  if (!t) return '';
  if (t.k === 'name') return t.name;
  if (t.k === 'member') { const o = targetName(t.obj); return o ? o + '.' + t.prop : ''; }
  return '';
}

function matchBrackets(toks) {
  const match = new Array(toks.length);
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'op') continue;
    if (t.v === '(' || t.v === '[' || t.v === '{' || t.v === '#[') stack.push(i);
    else if (t.v === ')' || t.v === ']' || t.v === '}') {
      const want = t.v === ')' ? '(' : t.v === ']' ? '[' : '{';
      // tolerate mismatches: pop until a matching opener
      let k = stack.length - 1;
      while (k >= 0 && toks[stack[k]].v !== want && !(want === '[' && toks[stack[k]].v === '#[')) k--;
      if (k < 0) continue;
      const open = stack[k];
      stack.length = k;
      match[open] = i;
      match[i] = open;
    }
  }
  return match;
}

function parseFile(path, text, lang) {
  const fir = { path, lang, fam: FAMILY[lang] || 'js', fns: [], imports: [], classes: [], defaultExport: null, module: null };
  const toks = lex(text, lang);
  const p = new Parser(toks, path, lang, fir);
  const mod = { id: ++fnSeq, name: '<module>', cls: null, file: path, lang, line: 1, params: [], anns: [], stmts: [], parent: null, isModule: true };
  fir.fns.push(mod);
  fir.module = mod;
  p.fn = mod;
  try {
    if (p.fam === 'py') p.pyBlock(0, toks.length);
    else if (p.fam === 'rb') { p.computeEnds(); p.rbBlock(0, toks.length); } else p.block(0, toks.length);
  } catch { /* partial IR is still useful */ }
  return fir;
}

module.exports = { Parser, parseFile, targetName, continues };

require('./parser-script');
