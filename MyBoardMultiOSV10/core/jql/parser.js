// Recursive-descent parser.
//
//   query   := [or] [ORDER BY orderItem (',' orderItem)*]
//   or      := and (OR and)*
//   and     := not (AND not)*
//   not     := NOT not | '(' or ')' | clause
//   clause  := field op value | field [NOT] IN list | field IS [NOT] (EMPTY|NULL)
//   value   := atom | EMPTY | NULL ;  list := '(' atom (',' atom)* ')'
//   atom    := word | string | word '(' [atom (',' atom)*] ')'      (function call)
//
// AST:
//   { where: Node|null, orderBy: [{ field: FieldRef, dir: 'asc'|'desc', pos, end }] }
//   Node   = { type: 'and'|'or', items: Node[] } | { type: 'not', item: Node, pos }
//          | { type: 'clause', field: FieldRef, op, opPos, opEnd, values: Value[], list: boolean, pos, end }
//   op     = '=' '!=' '>' '>=' '<' '<=' '~' '!~' 'in' 'not in' 'is empty' 'is not empty'
//   FieldRef = { name, quoted, pos, end }
//   Value  = { kind: 'literal', value, quoted, pos, end } | { kind: 'func', name, args: string[], pos, end }
import { lex } from './lexer.js';
import { JqlError } from './errors.js';

const kw = (t, word) => t.type === 'word' && t.value.toLowerCase() === word;

/**
 * @param {string} text
 * @returns {{ where: object|null, orderBy: object[] } | null} null for blank text
 */
export function parse(text) {
  if (text == null || !String(text).trim()) return null;
  const p = new Parser(String(text));
  return p.query();
}

class Parser {
  constructor(text) {
    this.text = text;
    this.tokens = lex(text);
    this.i = 0;
  }
  get t() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }

  fail(expected, message) {
    const t = this.t;
    const got = t.type === 'eof' ? 'end of query' : `'${this.text.slice(t.pos, t.end)}'`;
    throw new JqlError('JQL_SYNTAX', message || `Expected ${expected.join(' or ')} but found ${got}`, t.pos, t.end - t.pos, expected);
  }

  query() {
    let where = null;
    if (!kw(this.t, 'order')) where = this.or();
    const orderBy = [];
    if (kw(this.t, 'order')) {
      this.next();
      if (!kw(this.t, 'by')) this.fail(['BY']);
      this.next();
      for (;;) {
        const f = this.fieldRef('order');
        let dir = 'asc';
        let end = f.end;
        if (kw(this.t, 'asc') || kw(this.t, 'desc')) { dir = this.t.value.toLowerCase(); end = this.t.end; this.next(); }
        orderBy.push({ field: f, dir, pos: f.pos, end });
        if (this.t.type === 'comma') { this.next(); continue; }
        break;
      }
    }
    if (this.t.type !== 'eof') {
      if (this.t.type === 'rparen') this.fail([], `Unexpected ')'`);
      this.fail(where ? ['AND', 'OR', 'ORDER BY'] : ['ORDER BY']);
    }
    return { where, orderBy };
  }

  or() {
    const items = [this.and()];
    while (kw(this.t, 'or')) { this.next(); items.push(this.and()); }
    return items.length === 1 ? items[0] : { type: 'or', items };
  }

  and() {
    const items = [this.not()];
    while (kw(this.t, 'and')) { this.next(); items.push(this.not()); }
    return items.length === 1 ? items[0] : { type: 'and', items };
  }

  not() {
    const t = this.t;
    if (kw(t, 'not')) { this.next(); return { type: 'not', item: this.not(), pos: t.pos }; }
    if (t.type === 'lparen') {
      this.next();
      const inner = this.or();
      if (this.t.type !== 'rparen') this.fail([')', 'AND', 'OR']);
      this.next();
      return inner;
    }
    return this.clause();
  }

  fieldRef(where = 'clause') {
    const t = this.t;
    const ok = (t.type === 'word' && !['and', 'or', 'order', 'in', 'is', 'empty', 'null'].includes(t.value.toLowerCase())) || t.type === 'string';
    if (!ok) this.fail([where === 'order' ? 'a field to order by' : 'a field name']);
    this.next();
    return { name: t.value, quoted: t.type === 'string', pos: t.pos, end: t.end };
  }

  clause() {
    const field = this.fieldRef();
    const t = this.t;
    const base = { type: 'clause', field, opPos: t.pos, pos: field.pos };
    if (t.type === 'op') {
      this.next();
      let op = t.value;
      const v = this.t;
      // `= EMPTY` / `!= EMPTY` are the same as IS [NOT] EMPTY
      if ((op === '=' || op === '!=') && (kw(v, 'empty') || kw(v, 'null'))) {
        this.next();
        return { ...base, op: op === '=' ? 'is empty' : 'is not empty', opEnd: t.end, values: [], list: false, end: v.end };
      }
      if (this.t.type === 'lparen' && (op === '=' || op === '!=')) {
        // tolerate `status = (a, b)` as IN
        const values = this.list();
        return { ...base, op: op === '=' ? 'in' : 'not in', opEnd: t.end, values, list: true, end: this.tokens[this.i - 1].end };
      }
      const val = this.atom();
      return { ...base, op, opEnd: t.end, values: [val], list: false, end: val.end };
    }
    if (kw(t, 'in') || kw(t, 'not')) {
      let op = 'in';
      let opEnd = t.end;
      if (kw(t, 'not')) {
        this.next();
        if (!kw(this.t, 'in')) this.fail(['IN']);
        op = 'not in';
        opEnd = this.t.end;
      }
      this.next();
      const values = this.list();
      return { ...base, op, opEnd, values, list: true, end: this.tokens[this.i - 1].end };
    }
    if (kw(t, 'is')) {
      this.next();
      let not = false;
      if (kw(this.t, 'not')) { not = true; this.next(); }
      if (!(kw(this.t, 'empty') || kw(this.t, 'null'))) this.fail(not ? ['EMPTY'] : ['EMPTY', 'NOT EMPTY']);
      const e = this.next();
      return { ...base, op: not ? 'is not empty' : 'is empty', opEnd: e.end, values: [], list: false, end: e.end };
    }
    if (kw(t, 'was')) {
      throw new JqlError('JQL_BAD_OPERATOR', 'The WAS operator is not supported', t.pos, t.end - t.pos);
    }
    this.fail(['=', '!=', '>', '>=', '<', '<=', '~', '!~', 'IN', 'NOT IN', 'IS']);
  }

  list() {
    if (this.t.type !== 'lparen') this.fail(['(']);
    this.next();
    const values = [];
    if (this.t.type === 'rparen') this.fail(['a value']);
    for (;;) {
      values.push(this.atom());
      if (this.t.type === 'comma') { this.next(); continue; }
      if (this.t.type === 'rparen') { this.next(); break; }
      this.fail([',', ')']);
    }
    return values;
  }

  atom() {
    const t = this.t;
    if (t.type === 'string') { this.next(); return { kind: 'literal', value: t.value, quoted: true, pos: t.pos, end: t.end }; }
    if (t.type === 'word') {
      const lower = t.value.toLowerCase();
      if (['and', 'or', 'order', 'in', 'is'].includes(lower)) this.fail(['a value']);
      this.next();
      if (this.t.type === 'lparen' && /^[a-z_][a-z0-9_]*$/i.test(t.value)) {
        this.next();
        const args = [];
        if (this.t.type !== 'rparen') {
          for (;;) {
            const a = this.t;
            if (a.type !== 'word' && a.type !== 'string') this.fail(['a function argument']);
            this.next();
            args.push(a.value);
            if (this.t.type === 'comma') { this.next(); continue; }
            break;
          }
        }
        if (this.t.type !== 'rparen') this.fail([')']);
        const close = this.next();
        return { kind: 'func', name: t.value, args, pos: t.pos, end: close.end };
      }
      if (lower === 'empty' || lower === 'null') return { kind: 'empty', value: t.value, pos: t.pos, end: t.end };
      return { kind: 'literal', value: t.value, quoted: false, pos: t.pos, end: t.end };
    }
    this.fail(['a value']);
  }
}
