// Autocomplete context: what can be typed at the caret, and the static candidates (fields, operators,
// keywords, functions). Values that live in the database (status names, users…) are added by the service.
import { lex, quoteValue } from './lexer.js';
import { FIELDS, ORDER_FIELDS, OP_LABEL, findField } from './fields.js';
import { DATE_FUNCTIONS } from './dates.js';

const isKw = (t, ...words) => t && t.type === 'word' && words.includes(t.value.toLowerCase());

/**
 * @param {string} text
 * @param {number} caret 0-based offset
 * @param {{ fields?: object[] }} [opts]
 * @returns {{ kind: string, prefix: string, start: number, end: number, field?: string, items: Array<{label: string, insert: string, detail?: string}> }}
 */
export function suggestContext(text, caret, opts = {}) {
  text = String(text ?? '');
  caret = Math.max(0, Math.min(caret ?? text.length, text.length));
  const customFields = opts.fields || [];
  const tokens = lex(text.slice(0, caret), { tolerant: true }).filter((t) => t.type !== 'eof');

  // the token being typed (touching the caret)
  let cur = null;
  const last = tokens[tokens.length - 1];
  if (last && last.end === caret && (last.type === 'word' || last.type === 'string' || (last.type === 'op' && last.value === '!'))) {
    cur = last;
    tokens.pop();
  }
  const st = run(tokens);
  const prefix = cur ? cur.value : '';
  let start = cur ? cur.pos : caret;
  let end = caret;
  if (cur) {
    const full = lex(text, { tolerant: true }).find((t) => t.pos === cur.pos);
    if (full) end = full.end;
  }
  const res = (kind, items, extra = {}) => ({ kind, prefix, start, end, ...extra, items: filter(items, prefix) });

  // an operator being typed as '!' or after a field
  if (cur && cur.type === 'op') {
    const f = st.field ? findField(st.field.name, customFields, st.field.quoted) : null;
    return res('operator', opItems(f));
  }

  switch (st.state) {
    case 'field': {
      const items = fieldItems(customFields);
      items.push({ label: 'NOT', insert: 'NOT', detail: 'keyword' });
      if (!st.hasWhere && !st.depth) items.push({ label: 'ORDER BY', insert: 'ORDER BY', detail: 'keyword' });
      return res('field', items);
    }
    case 'op': {
      const f = findField(st.field.name, customFields, st.field.quoted);
      return res('operator', opItems(f));
    }
    case 'value':
    case 'listValue': {
      const f = findField(st.field.name, customFields, st.field.quoted);
      return res('value', valueItems(f, st.op, st.state === 'listValue'), { field: f ? f.name : st.field.name });
    }
    case 'listStart': return res('keyword', [{ label: '(', insert: '(' }]);
    case 'listNext': return res('keyword', [{ label: ',', insert: ',' }, { label: ')', insert: ')' }]);
    case 'notIn': return res('keyword', [{ label: 'IN', insert: 'IN' }]);
    case 'is': return res('keyword', [{ label: 'EMPTY', insert: 'EMPTY' }, { label: 'NOT EMPTY', insert: 'NOT EMPTY' }]);
    case 'isnot': return res('keyword', [{ label: 'EMPTY', insert: 'EMPTY' }]);
    case 'after': {
      const items = [{ label: 'AND', insert: 'AND' }, { label: 'OR', insert: 'OR' }];
      if (st.depth > 0) items.push({ label: ')', insert: ')' });
      else items.push({ label: 'ORDER BY', insert: 'ORDER BY' });
      return res('keyword', items);
    }
    case 'order': return res('keyword', [{ label: 'BY', insert: 'BY' }]);
    case 'orderField': return res('orderField', ORDER_FIELDS.map((n) => ({ label: n, insert: n, detail: FIELDS.find((f) => f.name === n).detail })));
    case 'orderAfter': return res('keyword', [{ label: 'ASC', insert: 'ASC' }, { label: 'DESC', insert: 'DESC' }, { label: ',', insert: ',' }]);
    case 'orderDir': return res('keyword', [{ label: ',', insert: ',' }]);
  }
  return { kind: 'none', prefix, start, end, items: [] };
}

function filter(items, prefix) {
  const p = String(prefix).toLowerCase();
  return items.filter((it) => !p || it.label.toLowerCase().startsWith(p) || (it.aliases || []).some((a) => a.toLowerCase().startsWith(p)))
    .map(({ aliases, ...rest }) => rest);
}

function fieldItems(customFields) {
  const items = FIELDS.filter((f) => f.kind !== 'orderOnly').map((f) => ({ label: f.name, insert: f.name, detail: f.detail, aliases: f.aliases }));
  for (const cf of customFields) items.push({ label: cf.name, insert: quoteValue(cf.name), detail: `Custom field (${cf.type})` });
  return items;
}

function opItems(f) {
  const ops = f ? f.ops : Object.keys(OP_LABEL);
  return ops.map((o) => ({ label: OP_LABEL[o], insert: OP_LABEL[o] }));
}

function valueItems(f, op, inList) {
  if (!f) return [];
  const items = [];
  if (f.ops.includes('is empty') && (op === '=' || op === '!=' || inList)) items.push({ label: 'EMPTY', insert: 'EMPTY', detail: 'no value' });
  if (f.valueType === 'user') items.push({ label: 'currentUser()', insert: 'currentUser()', detail: 'you' });
  if (f.valueType === 'date') for (const fn of DATE_FUNCTIONS) items.push({ label: fn + '()', insert: fn + '()', detail: 'date function' });
  if (f.valueType === 'bool' || f.valueType === 'checkbox') items.push({ label: 'true', insert: 'true' }, { label: 'false', insert: 'false' });
  if (f.valueType === 'statusCategory') for (const c of ['To Do', 'In Progress', 'Done']) items.push({ label: c, insert: quoteValue(c) });
  return items;
}

/** Walk the complete tokens before the caret and return the parser state there. */
function run(tokens) {
  let state = 'field';
  let depth = 0; // open groups
  let field = null;
  let op = null;
  let hasWhere = false;
  let inList = false;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const nextIsParen = tokens[k + 1]?.type === 'lparen';
    switch (state) {
      case 'field':
        if (isKw(t, 'not')) break;
        if (t.type === 'lparen') { depth++; break; }
        if (isKw(t, 'order') && !depth) { state = 'order'; break; }
        if (t.type === 'word' || t.type === 'string') { field = { name: t.value, quoted: t.type === 'string' }; state = 'op'; hasWhere = true; break; }
        return { state: 'none' };
      case 'op':
        if (t.type === 'op') { op = t.value; state = 'value'; break; }
        if (isKw(t, 'in')) { op = 'in'; state = 'listStart'; break; }
        if (isKw(t, 'not')) { state = 'notIn'; break; }
        if (isKw(t, 'is')) { state = 'is'; break; }
        return { state: 'none' };
      case 'notIn':
        if (isKw(t, 'in')) { op = 'not in'; state = 'listStart'; break; }
        return { state: 'none' };
      case 'is':
        if (isKw(t, 'not')) { state = 'isnot'; break; }
        if (isKw(t, 'empty', 'null')) { state = 'after'; break; }
        return { state: 'none' };
      case 'isnot':
        if (isKw(t, 'empty', 'null')) { state = 'after'; break; }
        return { state: 'none' };
      case 'value':
      case 'listValue':
        if (t.type === 'lparen' && state === 'value') { inList = true; state = 'listValue'; break; }
        if (t.type === 'word' && nextIsParen) {
          // function call: skip to ')'
          k += 2;
          while (k < tokens.length && tokens[k].type !== 'rparen') k++;
          if (k >= tokens.length) return { state: 'none' };
        } else if (t.type !== 'word' && t.type !== 'string') return { state: 'none' };
        state = state === 'listValue' ? 'listNext' : 'after';
        break;
      case 'listStart':
        if (t.type === 'lparen') { inList = true; state = 'listValue'; break; }
        return { state: 'none' };
      case 'listNext':
        if (t.type === 'comma') { state = 'listValue'; break; }
        if (t.type === 'rparen') { inList = false; state = 'after'; break; }
        return { state: 'none' };
      case 'after':
        if (isKw(t, 'and', 'or')) { state = 'field'; break; }
        if (t.type === 'rparen' && depth > 0) { depth--; break; }
        if (isKw(t, 'order') && !depth) { state = 'order'; break; }
        return { state: 'none' };
      case 'order':
        if (isKw(t, 'by')) { state = 'orderField'; break; }
        return { state: 'none' };
      case 'orderField':
        if (t.type === 'word' || t.type === 'string') { state = 'orderAfter'; break; }
        return { state: 'none' };
      case 'orderAfter':
        if (isKw(t, 'asc', 'desc')) { state = 'orderDir'; break; }
        if (t.type === 'comma') { state = 'orderField'; break; }
        return { state: 'none' };
      case 'orderDir':
        if (t.type === 'comma') { state = 'orderField'; break; }
        return { state: 'none' };
      default:
        return { state: 'none' };
    }
  }
  return { state, depth, field, op, hasWhere, inList };
}
