// Query language public API.
//
//   parse(text) → ast | null                      syntax only (throws JqlError)
//   validate(text, opts) → { ok } | { ok: false, error: { code, message, details: { position, length, expected? } } }
//   compile(textOrAst, opts) → { where, params, orderBy }   portable SQL over issues aliased `i`
//   createMatcher(textOrAst, opts) → (issue) => boolean     same semantics in memory
//   createComparator(textOrAst, opts) → (a, b) => number | null
//   suggestContext(text, caret, opts) → { kind, prefix, start, end, field?, items }
//   customValueColumns(cf, raw) → { text_value, num_value }  how services must store custom values
//
// opts: { userId, now, fields: custom fields [{ id, name, type, options:[{id, value}] }],
//         priorities: [{ id, name, position }] (matcher: priority > X), users: [{ id, username, displayName }]
//         (matcher: user custom fields by name), alias }
//
// Hydrated issue for createMatcher / createComparator:
//   { id, key, number, projectId, project:{id,key,name}, type:{id,name,position?}, status:{id,name,category,position?},
//     priority:{id,name,position}|null, resolution:{id,name}|null, assignee:{id,username,displayName}|null, reporter,
//     labels:string[], components:[{id,name}], fixVersions:[{id,name}], affectedVersions:[{id,name}],
//     created, updated, resolved (ms|null), due ('YYYY-MM-DD'|null), summary, description,
//     epic:{id,key}|null, parent:{id,key}|null, flagged:boolean, storyPoints:number|null, rank,
//     custom:{ [fieldId]: value } }   (select/multiselect: option VALUE text; user: user id; checkbox: boolean)
import { parse } from './parser.js';
import { compile } from './compile.js';
import { createMatcher, createComparator, customRow } from './match.js';
import { resolve } from './resolve.js';
import { suggestContext } from './suggest.js';
import { JqlError } from './errors.js';
import { FIELDS, ORDER_FIELDS, OP_LABEL, CUSTOM_OPS, findField } from './fields.js';
import { quoteValue } from './lexer.js';
import { DATE_FUNCTIONS } from './dates.js';

export { parse, compile, createMatcher, createComparator, suggestContext, JqlError, FIELDS, ORDER_FIELDS, OP_LABEL, CUSTOM_OPS, findField, quoteValue, DATE_FUNCTIONS };

/**
 * Syntax + field/operator/value check.
 * @param {string} text
 * @param {object} [opts]
 */
export function validate(text, opts = {}) {
  try {
    resolve(text || '', opts);
    return { ok: true };
  } catch (err) {
    if (err instanceof JqlError) return { ok: false, error: err.toJSON() };
    throw err;
  }
}

/**
 * The stored query columns of a custom value (custom_values.text_value / num_value).
 * text_value: lower-cased, ≤191 chars; multiselect/labels as '|a|b|'; select: option value text; user: id;
 * date: 'YYYY-MM-DD'. num_value: number fields and checkbox (1/0). Empty → both null (or no row).
 * @param {{ type: string }} cf
 * @param {any} raw
 */
export function customValueColumns(cf, raw) {
  const row = customRow(cf, raw);
  return { text_value: row ? row.text : null, num_value: row ? row.num : null };
}
