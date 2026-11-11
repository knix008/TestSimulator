// JQL text helpers for the views: quoting, the ORDER BY part, and the query a "basic" search builds.
// The tokeniser is the core's own (core/jql/lexer.js is plain ESM with no Node imports).
import { lex, quoteValue } from '../../../core/jql/lexer.js';

export { quoteValue };

/** Quotes a value always (names with spaces, keys, ids). */
export const quoted = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** { where, order: [{ field, dir }], orderText } — the ORDER BY clause found at depth 0, outside strings. */
export function splitOrder(jql) {
  const text = String(jql ?? '');
  let tokens;
  try { tokens = lex(text, { tolerant: true }); } catch { return { where: text.trim(), order: [], orderText: '' }; }
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'lparen') depth++;
    else if (tok.type === 'rparen') depth--;
    else if (depth === 0 && tok.type === 'word' && tok.value.toLowerCase() === 'order' && tokens[i + 1]?.type === 'word' && tokens[i + 1].value.toLowerCase() === 'by') {
      const orderText = text.slice(tokens[i + 1].end).trim();
      const order = [];
      let field = null;
      for (const t of tokens.slice(i + 2)) {
        if (t.type === 'eof') break;
        if (t.type === 'comma') { if (field) order.push({ field, dir: 'asc' }); field = null; continue; }
        if ((t.type === 'word' || t.type === 'string') && field && /^(asc|desc)$/i.test(t.value)) { order.push({ field, dir: t.value.toLowerCase() }); field = null; continue; }
        if (t.type === 'word' || t.type === 'string') { if (field) order.push({ field, dir: 'asc' }); field = t.value; }
      }
      if (field) order.push({ field, dir: 'asc' });
      return { where: text.slice(0, tok.pos).trim(), order, orderText };
    }
  }
  return { where: text.trim(), order: [], orderText: '' };
}

/** The query with its ORDER BY replaced (order: [{ field, dir }]; empty → none). */
export function withOrder(jql, order) {
  const { where } = splitOrder(jql);
  const by = (order ?? []).filter((o) => o?.field).map((o) => `${o.field} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
  return [where, by ? `ORDER BY ${by}` : ''].filter(Boolean).join(' ');
}

/** "a AND b" with each part wrapped when it has OR at depth 0. */
export function andJql(...parts) {
  const clean = parts.map((p) => String(p ?? '').trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? '';
  return clean.map((p) => (/\bor\b/i.test(p) ? `(${p})` : p)).join(' AND ');
}

const list = (field, values, empty = null) => {
  const v = values.filter((x) => x !== empty);
  const parts = [];
  if (v.length === 1) parts.push(`${field} = ${quoted(v[0])}`);
  else if (v.length > 1) parts.push(`${field} in (${v.map(quoted).join(', ')})`);
  if (empty != null && values.includes(empty)) parts.push(`${field} is EMPTY`);
  return parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0] ?? '';
};

/**
 * The query of the basic search. f: { projects: [key], types: [name], statuses: [name], assignees: [username | '' (none) | 'me'],
 * priorities: [name], labels: [text], text, epic: key | '' (none) | null, version: name | null, hideDone }
 */
export function basicJql(f) {
  const parts = [];
  if (f.projects?.length) parts.push(list('project', f.projects));
  if (f.types?.length) parts.push(list('type', f.types));
  if (f.statuses?.length) parts.push(list('status', f.statuses));
  if (f.assignees?.length) {
    const me = f.assignees.includes('me');
    const named = list('assignee', f.assignees.filter((a) => a !== 'me'), '');
    const pieces = [named, me ? 'assignee = currentUser()' : ''].filter(Boolean);
    parts.push(pieces.length > 1 ? `(${pieces.join(' OR ')})` : pieces[0]);
  }
  if (f.priorities?.length) parts.push(list('priority', f.priorities));
  if (f.labels?.length) parts.push(list('labels', f.labels));
  if (f.epic === '') parts.push('epic is EMPTY');
  else if (f.epic) parts.push(`epic = ${quoted(f.epic)}`);
  if (f.version) parts.push(`fixVersion = ${quoted(f.version)}`);
  if (f.hideDone) parts.push('statusCategory != done');
  if (f.text?.trim()) parts.push(`text ~ ${quoted(f.text.trim())}`);
  return parts.filter(Boolean).join(' AND ');
}

/** Columns of the list → the JQL field they sort by (null: not sortable). */
export const SORT_FIELD = {
  type: 'type', key: 'key', summary: 'summary', status: 'status', assignee: 'assignee', reporter: 'reporter', priority: 'priority',
  points: 'storyPoints', due: 'due', created: 'created', updated: 'updated', resolved: 'resolved', rank: 'rank', labels: null, epic: null,
};
