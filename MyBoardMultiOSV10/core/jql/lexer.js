// Tokeniser for the query language.
//
// Token: { type, value, pos, end, quoted?, unterminated? }
//   type: 'word' (bare word, also numbers, keys like KAN-12, relative dates like -7d, cf[123])
//         'string' (quoted "…" or '…' with backslash escapes; value is the unescaped text)
//         'op' (= != > >= < <= ~ !~), 'lparen', 'rparen', 'comma', 'eof'
// Keywords (AND, OR, NOT, IN, IS, EMPTY, NULL, ORDER, BY, ASC, DESC) are 'word' tokens; the parser decides.
import { JqlError } from './errors.js';

const SPECIAL = new Set(['(', ')', ',', '=', '!', '<', '>', '~', '"', "'"]);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/**
 * @param {string} text
 * @param {{ tolerant?: boolean }} [opts] tolerant: never throw (used by suggest): an unterminated string
 *        becomes a string token with `unterminated: true`, a lone '!' becomes op '!'.
 * @returns {Array<object>}
 */
export function lex(text, opts = {}) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (isSpace(c)) { i++; continue; }
    const start = i;
    if (c === '(') { tokens.push({ type: 'lparen', value: '(', pos: i, end: ++i }); continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: ')', pos: i, end: ++i }); continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: ',', pos: i, end: ++i }); continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n) {
        const d = text[j];
        if (d === '\\' && j + 1 < n) { value += text[j + 1]; j += 2; continue; }
        if (d === c) { closed = true; j++; break; }
        value += d;
        j++;
      }
      if (!closed) {
        if (!opts.tolerant) throw new JqlError('JQL_SYNTAX', 'Unterminated quoted string', start, n - start);
        tokens.push({ type: 'string', value, pos: start, end: n, quoted: true, unterminated: true });
        i = n;
        continue;
      }
      tokens.push({ type: 'string', value, pos: start, end: j, quoted: true });
      i = j;
      continue;
    }
    if (c === '=' ) { tokens.push({ type: 'op', value: '=', pos: i, end: ++i }); continue; }
    if (c === '~') { tokens.push({ type: 'op', value: '~', pos: i, end: ++i }); continue; }
    if (c === '!') {
      const d = text[i + 1];
      if (d === '=' || d === '~') { tokens.push({ type: 'op', value: '!' + d, pos: i, end: i + 2 }); i += 2; continue; }
      if (!opts.tolerant) throw new JqlError('JQL_SYNTAX', "Expected '!=' or '!~'", i, 1, ['!=', '!~']);
      tokens.push({ type: 'op', value: '!', pos: i, end: ++i });
      continue;
    }
    if (c === '<' || c === '>') {
      if (text[i + 1] === '=') { tokens.push({ type: 'op', value: c + '=', pos: i, end: i + 2 }); i += 2; continue; }
      tokens.push({ type: 'op', value: c, pos: i, end: ++i });
      continue;
    }
    // cf[123] custom field reference
    const cf = /^cf\[[^\]\s]*\]/i.exec(text.slice(i));
    if (cf) { tokens.push({ type: 'word', value: cf[0], pos: i, end: i + cf[0].length }); i += cf[0].length; continue; }
    // bare word
    let j = i;
    while (j < n && !isSpace(text[j]) && !SPECIAL.has(text[j])) j++;
    tokens.push({ type: 'word', value: text.slice(i, j), pos: i, end: j });
    i = j;
  }
  tokens.push({ type: 'eof', value: '', pos: n, end: n });
  return tokens;
}

/** Quote a value for insertion into a query when needed (spaces, specials, keywords). */
export function quoteValue(v) {
  const s = String(v);
  if (s !== '' && /^[^\s()",'=!<>~]+$/.test(s) && !KEYWORDS.has(s.toLowerCase())) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is', 'empty', 'null', 'order', 'by', 'asc', 'desc', 'was']);
