// AST → resolved predicate tree. Both the SQL compiler and the in-memory matcher consume this tree, so the
// two always agree (same date math, same value normalisation, same NULL rules).
//
// Every leaf predicate is two-valued: a NULL column never makes a predicate "unknown". Negative operators
// (!=, NOT IN, !~) on single-valued fields do not match empty values; on multi-valued fields (labels,
// components, versions, multi-select custom fields) they mean "has none equal" (so empty matches).
//
// Pred:
//   { t: 'and'|'or', items } | { t: 'not', item } | { t: 'const', value }
//   { t: 'ref', f, neg, values }           single-valued lookup (lower-cased names / ids / keys)
//   { t: 'empty', f, not }                 column IS [NOT] NULL (text: also '')
//   { t: 'category', neg, values }
//   { t: 'prioCmp', cmp, value }           priority position compare (cmp is on position)
//   { t: 'key', neg, keys, ids }  { t: 'keyCmp', cmp, project, number }
//   { t: 'multi', f, neg, values }  { t: 'multiLike', f, neg, value }  { t: 'multiEmpty', f, not }
//   { t: 'cmp', f, cmp, value }            number / epoch ms / 'YYYY-MM-DD' / lower-cased text
//   { t: 'inNum', f, neg, values }
//   { t: 'like', f, neg, value }           lower-cased substring
//   { t: 'alltext', neg, value }
//   { t: 'bool', f, value }                0 | 1
//   { t: 'cv', cf, neg, col: 'text'|'num', test }   custom value EXISTS test
//      test: { op: 'cmp', cmp, value } | { op: 'in', values } | { op: 'notIn', values } | { op: 'likeAny', subs }
//            | { op: 'notLike', sub } | { op: 'present' } | { op: 'user', neg, values }
import { JqlError } from './errors.js';
import { findField, ORDER_FIELDS, OP_LABEL } from './fields.js';
import { parseAbsolute, parseDuration, evalDateFunction, isDateFunction, localDate } from './dates.js';
import { parse } from './parser.js';

/**
 * @typedef {{ userId?: string|null, now?: number, fields?: object[], priorities?: object[], users?: object[], alias?: string }} JqlOptions
 */

/**
 * @param {string|object|null} textOrAst
 * @param {JqlOptions} opts
 * @returns {{ where: object|null, order: Array<{ f: object, dir: 'asc'|'desc' }> }}
 */
export function resolve(textOrAst, opts = {}) {
  const ast = typeof textOrAst === 'string' || textOrAst == null ? parse(textOrAst || '') : textOrAst;
  if (!ast) return { where: null, order: [] };
  const cx = { opts, now: opts.now ?? Date.now(), fields: opts.fields || [] };
  const where = ast.where ? node(ast.where, cx) : null;
  const order = ast.orderBy.map((o) => {
    const f = findField(o.field.name, cx.fields, o.field.quoted);
    if (!f) throw new JqlError('JQL_UNKNOWN_FIELD', `Unknown field '${o.field.name}'`, o.field.pos, o.field.end - o.field.pos);
    if (!f.order) throw new JqlError('JQL_BAD_OPERATOR', `Cannot order by '${o.field.name}'`, o.field.pos, o.field.end - o.field.pos, ORDER_FIELDS);
    return { f, dir: o.dir };
  });
  return { where, order };
}

function node(n, cx) {
  if (n.type === 'and' || n.type === 'or') return { t: n.type, items: n.items.map((x) => node(x, cx)) };
  if (n.type === 'not') return { t: 'not', item: node(n.item, cx) };
  return clause(n, cx);
}

const or = (items) => (items.length === 1 ? items[0] : { t: 'or', items });
const and = (items) => (items.length === 1 ? items[0] : { t: 'and', items });
const FALSE = { t: 'const', value: false };
const TRUE = { t: 'const', value: true };

function clause(c, cx) {
  const f = findField(c.field.name, cx.fields, c.field.quoted);
  if (!f) throw new JqlError('JQL_UNKNOWN_FIELD', `Unknown field '${c.field.name}'`, c.field.pos, c.field.end - c.field.pos);
  if (f.kind === 'orderOnly') throw new JqlError('JQL_BAD_OPERATOR', `'${f.name}' can only be used in ORDER BY`, c.field.pos, c.field.end - c.field.pos);
  if (!f.ops.includes(c.op)) {
    throw new JqlError('JQL_BAD_OPERATOR', `Operator ${OP_LABEL[c.op]} cannot be used with '${f.name}'`, c.opPos, c.opEnd - c.opPos, f.ops.map((o) => OP_LABEL[o]));
  }
  const ctx = { c, f, cx };
  if (c.op === 'is empty' || c.op === 'is not empty') return emptyPred(f, c.op === 'is not empty');
  if (f.kind === 'custom') return customClause(ctx);
  switch (f.kind) {
    case 'ref': return refClause(ctx);
    case 'category': return categoryClause(ctx);
    case 'key': return keyClause(ctx);
    case 'multi': return multiClause(ctx);
    case 'datetime':
    case 'date': return dateClause(ctx);
    case 'text': return textClause(ctx);
    case 'alltext': return { t: 'alltext', neg: c.op === '!~', value: textValue(ctx, c.values[0]) };
    case 'number': return numberClause(ctx);
    case 'bool': return { t: 'bool', f, value: boolValue(ctx, c.values[0]) === (c.op === '=') ? 1 : 0 };
  }
  throw new JqlError('JQL_UNKNOWN_FIELD', `Unsupported field '${f.name}'`, c.field.pos, c.field.end - c.field.pos);
}

function emptyPred(f, not) {
  if (f.kind === 'multi') return { t: 'multiEmpty', f, not };
  if (f.kind === 'custom') {
    const col = f.cf.type === 'number' || f.cf.type === 'checkbox' ? 'num' : 'text';
    return { t: 'cv', cf: f.cf, neg: !not, col, test: { op: 'present' } };
  }
  return { t: 'empty', f, not };
}

const badValue = (v, msg) => new JqlError('JQL_BAD_VALUE', msg, v.pos, v.end - v.pos);

function funcError(ctx, v) {
  const known = ['currentuser', ...['now', 'startofday', 'endofday', 'startofweek', 'endofweek', 'startofmonth', 'endofmonth', 'startofyear', 'endofyear']];
  if (!known.includes(v.name.toLowerCase())) return new JqlError('JQL_UNKNOWN_FUNCTION', `Unknown function ${v.name}()`, v.pos, v.end - v.pos);
  return badValue(v, `Function ${v.name}() cannot be used with '${ctx.f.name}'`);
}

const isUserField = (f) => f.valueType === 'user';

/**
 * Lower-cased string values of a clause. `currentUser()` → the user id (dropped when there is none).
 * @returns {{ values: string[], empty: boolean }}
 */
function stringValues(ctx, { lower = true } = {}) {
  const out = [];
  let empty = false;
  for (const v of ctx.c.values) {
    if (v.kind === 'empty') { empty = true; continue; }
    if (v.kind === 'func') {
      if (v.name.toLowerCase() === 'currentuser' && isUserField(ctx.f)) {
        if (v.args.length) throw badValue(v, 'currentUser() takes no arguments');
        if (ctx.cx.opts.userId) out.push(String(ctx.cx.opts.userId).toLowerCase());
        continue;
      }
      throw funcError(ctx, v);
    }
    out.push(lower ? String(v.value).toLowerCase() : String(v.value));
  }
  return { values: out, empty };
}

function checkSingle(ctx) {
  const v = ctx.c.values[0];
  if (v.kind === 'empty') throw badValue(v, `EMPTY cannot be used with ${OP_LABEL[ctx.c.op]}`);
  return v;
}

function refClause(ctx) {
  const { c, f } = ctx;
  if (f.name === 'priority' && ['>', '>=', '<', '<='].includes(c.op)) {
    const v = checkSingle(ctx);
    if (v.kind === 'func') throw funcError(ctx, v);
    // "priority > Medium" = higher priority = smaller position
    const cmp = { '>': '<', '>=': '<=', '<': '>', '<=': '>=' }[c.op];
    return { t: 'prioCmp', cmp, value: String(v.value).toLowerCase() };
  }
  const { values, empty } = stringValues(ctx);
  const neg = c.op === '!=' || c.op === 'not in';
  if (!neg) {
    const parts = [];
    if (values.length) parts.push({ t: 'ref', f, neg: false, values });
    if (empty) parts.push(emptyPred(f, false));
    return parts.length ? or(parts) : FALSE;
  }
  if (!values.length) return emptyPred(f, true);
  return { t: 'ref', f, neg: true, values };
}

const CATEGORY = {
  'to do': 'todo', todo: 'todo', new: 'todo', open: 'todo',
  'in progress': 'inprogress', inprogress: 'inprogress', indeterminate: 'inprogress',
  done: 'done', complete: 'done', closed: 'done',
};

function categoryClause(ctx) {
  const { values } = stringValues(ctx);
  const mapped = values.map((v) => CATEGORY[v] || CATEGORY[v.replace(/[\s_-]+/g, '')] || v);
  const neg = ctx.c.op === '!=' || ctx.c.op === 'not in';
  if (!mapped.length) return neg ? TRUE : FALSE;
  return { t: 'category', neg, values: mapped };
}

function keyClause(ctx) {
  const { c } = ctx;
  if (['>', '>=', '<', '<='].includes(c.op)) {
    const v = checkSingle(ctx);
    if (v.kind === 'func') throw funcError(ctx, v);
    const m = /^(.+)-(\d+)$/.exec(String(v.value).trim());
    if (!m) throw badValue(v, `'${v.value}' is not an issue key like ABC-12`);
    return { t: 'keyCmp', cmp: c.op, project: m[1].toUpperCase(), number: Number(m[2]) };
  }
  const { values } = stringValues(ctx);
  const neg = c.op === '!=' || c.op === 'not in';
  if (!values.length) return neg ? TRUE : FALSE;
  return { t: 'key', neg, keys: values.map((v) => v.toUpperCase()), ids: values };
}

function multiClause(ctx) {
  const { c, f } = ctx;
  if (c.op === '~' || c.op === '!~') return { t: 'multiLike', f, neg: c.op === '!~', value: textValue(ctx, c.values[0]) };
  const { values, empty } = stringValues(ctx);
  const neg = c.op === '!=' || c.op === 'not in';
  if (!neg) {
    const parts = [];
    if (values.length) parts.push({ t: 'multi', f, neg: false, values });
    if (empty) parts.push({ t: 'multiEmpty', f, not: false });
    return parts.length ? or(parts) : FALSE;
  }
  const parts = [];
  if (values.length) parts.push({ t: 'multi', f, neg: true, values });
  if (empty) parts.push({ t: 'multiEmpty', f, not: true });
  return parts.length ? and(parts) : TRUE;
}

function textValue(ctx, v) {
  if (v.kind === 'func') throw funcError(ctx, v);
  if (v.kind === 'empty') throw badValue(v, `EMPTY cannot be used with ${OP_LABEL[ctx.c.op]}`);
  // a trailing/leading '*' wildcard is accepted and ignored (~ is already "contains")
  const s = String(v.value).replace(/^\*+|\*+$/g, '').toLowerCase();
  if (!s) throw badValue(v, 'Search text is empty');
  return s;
}

function textClause(ctx) {
  const { c, f } = ctx;
  if (c.op === '~' || c.op === '!~') return { t: 'like', f, neg: c.op === '!~', value: textValue(ctx, c.values[0]) };
  const v = checkSingle(ctx);
  if (v.kind === 'func') throw funcError(ctx, v);
  return { t: 'cmp', f, cmp: c.op, value: String(v.value).toLowerCase() };
}

function numberOf(ctx, v) {
  if (v.kind === 'func') throw funcError(ctx, v);
  if (v.kind === 'empty') throw badValue(v, `EMPTY cannot be used with ${OP_LABEL[ctx.c.op]}`);
  const s = String(v.value).trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) throw badValue(v, `'${v.value}' is not a number`);
  return Number(s);
}

function numberClause(ctx) {
  const { c, f } = ctx;
  if (c.op === 'in' || c.op === 'not in') return { t: 'inNum', f, neg: c.op === 'not in', values: c.values.map((v) => numberOf(ctx, v)) };
  return { t: 'cmp', f, cmp: c.op, value: numberOf(ctx, c.values[0]) };
}

const BOOL = { true: true, yes: true, on: true, 1: true, false: false, no: false, off: false, 0: false };
function boolValue(ctx, v) {
  if (v.kind !== 'literal' || !(String(v.value).toLowerCase() in BOOL)) throw badValue(v, `'${v.value ?? v.name}' is not true or false`);
  return BOOL[String(v.value).toLowerCase()];
}

/**
 * A date value → { day: true, start, end, date } | { day: false, ms }.
 */
function dateValue(ctx, v) {
  if (v.kind === 'empty') throw badValue(v, `EMPTY cannot be used with ${OP_LABEL[ctx.c.op]}`);
  if (v.kind === 'func') {
    if (!isDateFunction(v.name)) throw funcError(ctx, v);
    return { day: false, ms: evalDateFunction(v, ctx.cx.now) };
  }
  const s = String(v.value).trim();
  const abs = parseAbsolute(s);
  if (abs) return abs;
  const dur = parseDuration(s);
  if (dur !== null) return { day: false, ms: ctx.cx.now + dur };
  throw badValue(v, `'${v.value}' is not a date: use 2026-01-31, "2026-01-31 14:00", -7d or a date function`);
}

/** Comparison on an epoch-ms field with a day or instant value. */
function datetimeCmp(f, op, dv) {
  const cmp = (k, value) => ({ t: 'cmp', f, cmp: k, value });
  if (!dv.day) return cmp(op, dv.ms);
  switch (op) {
    case '=': return and([cmp('>=', dv.start), cmp('<', dv.end)]);
    case '!=': return or([cmp('<', dv.start), cmp('>=', dv.end)]);
    case '<': return cmp('<', dv.start);
    case '<=': return cmp('<', dv.end);
    case '>': return cmp('>=', dv.end);
    case '>=': return cmp('>=', dv.start);
  }
  throw new Error('bad op ' + op);
}

/** A date value as 'YYYY-MM-DD' (for date-only columns). */
const asDate = (dv) => (dv.day ? dv.date : localDate(dv.ms));

function dateClause(ctx) {
  const { c, f } = ctx;
  const dv = dateValue(ctx, c.values[0]);
  if (f.kind === 'datetime') return datetimeCmp(f, c.op, dv);
  return { t: 'cmp', f, cmp: c.op, value: asDate(dv) };
}

// ---- custom fields --------------------------------------------------------------------------------------

function customClause(ctx) {
  const { c, f } = ctx;
  const cf = f.cf;
  const neg = c.op === '!=' || c.op === 'not in' || c.op === '!~';
  const cv = (col, test, n = false) => ({ t: 'cv', cf, neg: n, col, test });
  switch (cf.type) {
    case 'number': {
      if (c.op === 'in' || c.op === 'not in') {
        const values = c.values.map((v) => numberOf(ctx, v));
        return cv('num', { op: c.op === 'in' ? 'in' : 'notIn', values });
      }
      return cv('num', { op: 'cmp', cmp: c.op, value: numberOf(ctx, c.values[0]) });
    }
    case 'checkbox': {
      const b = boolValue(ctx, c.values[0]) === (c.op === '=');
      // unchecked may be stored as 0 or not at all → "false" = not checked
      return cv('num', { op: 'cmp', cmp: '=', value: 1 }, !b);
    }
    case 'date': {
      const dv = dateValue(ctx, c.values[0]);
      return cv('text', { op: 'cmp', cmp: c.op, value: asDate(dv) });
    }
    case 'text':
    case 'textarea':
    case 'url': {
      if (c.op === '~') return cv('text', { op: 'likeAny', subs: [textValue(ctx, c.values[0])] });
      if (c.op === '!~') return cv('text', { op: 'notLike', sub: textValue(ctx, c.values[0]) });
      const v = checkSingle(ctx);
      if (v.kind === 'func') throw funcError(ctx, v);
      return cv('text', { op: 'cmp', cmp: c.op, value: String(v.value).toLowerCase().slice(0, 191) });
    }
    case 'select': {
      const values = optionValues(ctx, stringValues(ctx).values);
      if (!values.length) return neg ? TRUE : FALSE;
      return cv('text', { op: neg ? 'notIn' : 'in', values });
    }
    case 'multiselect':
    case 'labels': {
      if (c.op === '~' || c.op === '!~') return cv('text', { op: 'likeAny', subs: [textValue(ctx, c.values[0])] }, c.op === '!~');
      const values = cf.type === 'multiselect' ? optionValues(ctx, stringValues(ctx).values) : stringValues(ctx).values;
      if (!values.length) return neg ? TRUE : FALSE;
      return cv('text', { op: 'likeAny', subs: values.map((v) => '|' + v + '|') }, neg);
    }
    case 'user': {
      const { values } = stringValues(ctx);
      if (!values.length) return neg ? TRUE : FALSE;
      return cv('text', { op: 'user', neg, values });
    }
  }
  throw new JqlError('JQL_BAD_OPERATOR', `Unsupported custom field type ${cf.type}`, c.field.pos, c.field.end - c.field.pos);
}

/** Map option ids to their value text (lower-cased); other values pass through. */
function optionValues(ctx, values) {
  const opts = ctx.f.cf.options || [];
  return values.map((v) => {
    const o = opts.find((x) => String(x.id).toLowerCase() === v);
    return o ? String(o.value).toLowerCase() : v;
  });
}
