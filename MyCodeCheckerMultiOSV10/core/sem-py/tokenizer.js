'use strict';

// Python 3.12+ tokenizer. Produces NAME, NUMBER, STRING, OP, NEWLINE, INDENT,
// DEDENT and ENDMARKER tokens with 1-based lines and 0-based columns.
// f-strings / t-strings (PEP 701: nested quotes, comments and newlines inside
// replacement fields) are scanned here into pieces; the parser parses each
// replacement-field expression from its source span.
//
// The tokenizer never throws: problems are collected in `errors` and the scan
// continues with a best guess.

const OPS3 = ['**=', '//=', '>>=', '<<=', '...', '!='];
const OPS2 = ['->', ':=', '**', '//', '<<', '>>', '<=', '>=', '==', '!=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@='];
const OPS1 = '+-*/%@&|^~<>()[]{},:.;=!';

const ID_START = /[\p{L}\p{Nl}_ᢅᢆ℘℮゛゜]/u;
const ID_CONT = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_··፩-፱᧚]/u;
const STR_PREFIX = /^(?:[rR]|[uU]|[bB]|[fF]|[tT]|[rR][bBfFtT]|[bBfFtT][rR])$/;

class Tokenizer {
  // opts.base: { line, col, offset } for sub-tokenizing an f-string field.
  // opts.inParens: start inside an implicit bracket (no NEWLINE/INDENT).
  constructor(src, opts = {}) {
    this.src = src;
    this.end = opts.end == null ? src.length : opts.end;
    this.pos = opts.start || 0;
    this.line = opts.line || 1;
    this.lineStart = this.pos - (opts.col || 0);
    this.depth = opts.inParens ? 1 : 0;
    this.fieldMode = !!opts.inParens;
    this.tokens = [];
    this.errors = [];
    this.comments = [];
    this.indents = [0];
    this.atLineStart = !opts.inParens;
    this.brackets = [];
  }

  err(msg, line, col) {
    if (this.errors.length < 50) this.errors.push({ msg, line: line || this.line, col: col == null ? this.pos - this.lineStart : col });
  }

  col() { return this.pos - this.lineStart; }

  push(t, v, startPos, startLine, startCol, extra) {
    const tok = { t, v, line: startLine, col: startCol, start: startPos, stop: this.pos, endLine: this.line, endCol: this.pos - this.lineStart };
    if (extra) Object.assign(tok, extra);
    this.tokens.push(tok);
    return tok;
  }

  newline(at) {
    // advance over a line break starting at `at` (\r\n, \r or \n)
    let p = at;
    if (this.src[p] === '\r' && this.src[p + 1] === '\n') p += 2;
    else p += 1;
    this.pos = p;
    this.line++;
    this.lineStart = p;
  }

  run() {
    const s = this.src;
    while (this.pos < this.end) {
      if (this.atLineStart) {
        if (!this.handleIndent()) continue;
      }
      const c = s[this.pos];
      if (c === ' ' || c === '\t' || c === '\f') { this.pos++; continue; }
      if (c === '#') { this.comment(); continue; }
      if (c === '\n' || c === '\r') {
        const sl = this.line;
        const sc = this.col();
        const sp = this.pos;
        if (this.depth > 0) { this.newline(this.pos); continue; }
        this.newline(this.pos);
        const tok = { t: 'NEWLINE', v: '\n', line: sl, col: sc, start: sp, stop: this.pos, endLine: sl, endCol: sc + 1 };
        this.tokens.push(tok);
        this.atLineStart = true;
        continue;
      }
      if (c === '\\') {
        let p = this.pos + 1;
        while (p < this.end && (s[p] === ' ' || s[p] === '\t')) p++;
        if (s[p] === '\n' || s[p] === '\r') { this.newline(p); continue; }
        if (p >= this.end) { this.pos = p; continue; }
        this.err('unexpected character after line continuation');
        this.pos++;
        continue;
      }
      const sp = this.pos;
      const sl = this.line;
      const sc = this.col();
      // identifiers and string prefixes
      if (ID_START.test(c) || (c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdbff && ID_START.test(s.slice(this.pos, this.pos + 2)))) {
        let p = this.pos + (c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdbff ? 2 : 1);
        while (p < this.end) {
          const ch = s[p];
          if (ch.charCodeAt(0) < 128) {
            if (/[A-Za-z0-9_]/.test(ch)) { p++; continue; }
            break;
          }
          const cp = s.codePointAt(p);
          const chs = String.fromCodePoint(cp);
          if (ID_CONT.test(chs)) { p += chs.length; continue; }
          break;
        }
        const word = s.slice(this.pos, p);
        if ((s[p] === '"' || s[p] === "'") && word.length <= 2 && STR_PREFIX.test(word)) {
          this.pos = p;
          this.string(word, sp, sl, sc);
          continue;
        }
        this.pos = p;
        this.push('NAME', word, sp, sl, sc);
        continue;
      }
      if (c === '"' || c === "'") { this.string('', sp, sl, sc); continue; }
      if ((c >= '0' && c <= '9') || (c === '.' && s[this.pos + 1] >= '0' && s[this.pos + 1] <= '9')) { this.number(sp, sl, sc); continue; }
      // operators
      let op = null;
      const three = s.substr(this.pos, 3);
      if (OPS3.includes(three)) op = three;
      else {
        const two = s.substr(this.pos, 2);
        if (OPS2.includes(two)) op = two;
        else if (OPS1.includes(c)) op = c;
      }
      if (op) {
        this.pos += op.length;
        if (op === '(' || op === '[' || op === '{') { this.depth++; this.brackets.push(op); }
        else if (op === ')' || op === ']' || op === '}') {
          if (this.depth > (this.fieldMode ? 1 : 0)) { this.depth--; this.brackets.pop(); } else this.err(`unmatched '${op}'`, sl, sc);
        }
        this.push('OP', op, sp, sl, sc);
        continue;
      }
      if (c === '$' || c === '?' || c === '`') {
        this.err(`invalid character '${c}'`);
        this.pos++;
        this.push('ERRORTOKEN', c, sp, sl, sc);
        continue;
      }
      // other unicode: try as identifier char (e.g. emoji) -> error token
      const cp = s.codePointAt(this.pos);
      const chs = String.fromCodePoint(cp);
      if (/\s/u.test(chs)) { this.pos += chs.length; continue; }
      this.err(`invalid character '${chs}'`);
      this.pos += chs.length;
      this.push('ERRORTOKEN', chs, sp, sl, sc);
    }
    if (!this.fieldMode) {
      const last = this.tokens[this.tokens.length - 1];
      if (last && last.t !== 'NEWLINE' && last.t !== 'DEDENT' && last.t !== 'INDENT') {
        this.tokens.push({ t: 'NEWLINE', v: '', line: this.line, col: this.col(), start: this.pos, stop: this.pos, endLine: this.line, endCol: this.col() });
      }
      while (this.indents.length > 1) {
        this.indents.pop();
        this.tokens.push({ t: 'DEDENT', v: '', line: this.line, col: 0, start: this.pos, stop: this.pos, endLine: this.line, endCol: 0 });
      }
    }
    this.tokens.push({ t: 'ENDMARKER', v: '', line: this.line, col: this.col(), start: this.pos, stop: this.pos, endLine: this.line, endCol: this.col() });
    return this.tokens;
  }

  // Measures indentation at a line start. Returns false when the line is
  // blank or comment-only (consumed), true to continue tokenizing the line.
  handleIndent() {
    const s = this.src;
    let p = this.pos;
    let width = 0;
    while (p < this.end) {
      const c = s[p];
      if (c === ' ') width++;
      else if (c === '\t') width = (Math.floor(width / 8) + 1) * 8;
      else if (c === '\f') width = 0;
      else break;
      p++;
    }
    const c = s[p];
    if (p >= this.end) { this.pos = p; this.atLineStart = false; return false; }
    if (c === '#' || c === '\n' || c === '\r' || (c === '\\' && (s[p + 1] === '\n' || s[p + 1] === '\r'))) {
      this.pos = p;
      if (c === '#') this.comment();
      if (this.pos < this.end && (s[this.pos] === '\n' || s[this.pos] === '\r')) this.newline(this.pos);
      else if (c === '\\') { this.newline(p + 1); }
      return false;
    }
    this.atLineStart = false;
    this.pos = p;
    const cur = this.indents[this.indents.length - 1];
    const col = p - this.lineStart;
    if (width > cur) {
      this.indents.push(width);
      this.tokens.push({ t: 'INDENT', v: '', line: this.line, col: 0, start: this.lineStart, stop: p, endLine: this.line, endCol: col });
    } else if (width < cur) {
      while (this.indents.length > 1 && width < this.indents[this.indents.length - 1]) {
        this.indents.pop();
        this.tokens.push({ t: 'DEDENT', v: '', line: this.line, col, start: p, stop: p, endLine: this.line, endCol: col });
      }
      if (width !== this.indents[this.indents.length - 1]) {
        this.err('unindent does not match any outer indentation level', this.line, col);
        this.indents.push(width);
        this.tokens.push({ t: 'INDENT', v: '', line: this.line, col: 0, start: this.lineStart, stop: p, endLine: this.line, endCol: col, bad: true });
      }
    }
    return true;
  }

  comment() {
    const s = this.src;
    const sp = this.pos;
    let p = this.pos;
    while (p < this.end && s[p] !== '\n' && s[p] !== '\r') p++;
    this.comments.push({ line: this.line, col: sp - this.lineStart, text: s.slice(sp, p) });
    this.pos = p;
  }

  number(sp, sl, sc) {
    const s = this.src;
    const m = /^(?:0[xX](?:_?[0-9a-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+|(?:(?:\d(?:_?\d)*)?\.\d(?:_?\d)*|\d(?:_?\d)*\.?)(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?)/.exec(s.slice(this.pos, Math.min(this.end, this.pos + 400)));
    const text = m ? m[0] : s[this.pos];
    this.pos += text.length;
    this.push('NUMBER', text, sp, sl, sc);
  }

  // Scans a string literal starting at this.pos (at the quote).
  string(prefix, sp, sl, sc) {
    const s = this.src;
    const q = s[this.pos];
    const triple = s[this.pos + 1] === q && s[this.pos + 2] === q;
    const ql = triple ? 3 : 1;
    const lp = prefix.toLowerCase();
    const raw = lp.includes('r');
    const isF = lp.includes('f') || lp.includes('t');
    this.pos += ql;
    const bodyStart = this.pos;
    const bodyLine = this.line;
    const bodyCol = this.col();
    if (isF) {
      const parts = this.fstringBody(q, triple, raw);
      const tok = this.push('STRING', s.slice(sp, this.pos), sp, sl, sc, { prefix, quote: q, triple, raw, fstring: true, tstring: lp.includes('t'), parts, bodyStart, bodyLine, bodyCol });
      tok.closed = !!parts.closed;
      tok.bodyEnd = tok.closed ? this.pos - ql : this.pos;
      return;
    }
    let closed = false;
    while (this.pos < this.end) {
      const c = s[this.pos];
      if (c === '\\') {
        if (s[this.pos + 1] === '\n' || s[this.pos + 1] === '\r') { this.newline(this.pos + 1); continue; }
        this.pos += 2;
        continue;
      }
      if (c === q && (!triple || (s[this.pos + 1] === q && s[this.pos + 2] === q))) { this.pos += ql; closed = true; break; }
      if (c === '\n' || c === '\r') {
        if (!triple) { this.err('unterminated string literal', sl, sc); break; }
        this.newline(this.pos);
        continue;
      }
      this.pos++;
    }
    const bodyEnd = closed ? this.pos - ql : this.pos;
    this.push('STRING', s.slice(sp, this.pos), sp, sl, sc, { prefix, quote: q, triple, raw, bytes: lp.includes('b'), body: s.slice(bodyStart, bodyEnd), bodyStart, bodyLine, bodyCol, closed });
  }

  // f-string body: returns parts [{kind:'lit', text, line} | {kind:'field', start, end, line, col, conv, spec:[parts], debug}]
  fstringBody(q, triple, raw, inSpec) {
    const s = this.src;
    const parts = [];
    let lit = '';
    let litLine = this.line;
    const flush = () => { if (lit) parts.push({ kind: 'lit', text: lit, line: litLine }); lit = ''; };
    while (this.pos < this.end) {
      const c = s[this.pos];
      if (inSpec && c === '}') { flush(); return parts; }
      if (c === q && (!triple || (s[this.pos + 1] === q && s[this.pos + 2] === q))) {
        if (inSpec) { flush(); return parts; }
        this.pos += triple ? 3 : 1;
        flush();
        parts.closed = true;
        return parts;
      }
      if (c === '\\' && !raw) {
        if (s[this.pos + 1] === '\n' || s[this.pos + 1] === '\r') { this.newline(this.pos + 1); continue; }
        if (s[this.pos + 1] === 'N' && s[this.pos + 2] === '{') {
          const e = s.indexOf('}', this.pos);
          if (e > 0 && e - this.pos < 100) { lit += s.slice(this.pos, e + 1); this.pos = e + 1; continue; }
        }
        if (s[this.pos + 1] === '{' || s[this.pos + 1] === '}') { lit += c; this.pos++; continue; }
        lit += s.substr(this.pos, 2);
        this.pos += 2;
        continue;
      }
      if (c === '\\' && raw && s[this.pos + 1] !== '\n' && s[this.pos + 1] !== '\r' && s[this.pos + 1] !== '{' && s[this.pos + 1] !== '}' && this.pos + 1 < this.end) { lit += s.substr(this.pos, 2); this.pos += 2; continue; }
      if (c === '\n' || c === '\r') {
        if (!triple && !inSpec) { this.err('unterminated f-string literal'); flush(); return parts; }
        if (!triple && inSpec) { flush(); return parts; }
        lit += '\n';
        this.newline(this.pos);
        continue;
      }
      if (c === '{') {
        if (s[this.pos + 1] === '{' && !inSpec) { lit += '{'; this.pos += 2; continue; }
        flush();
        this.pos++;
        const field = this.fstringField(q, triple);
        parts.push(field);
        litLine = this.line;
        continue;
      }
      if (c === '}') {
        if (s[this.pos + 1] === '}') { lit += '}'; this.pos += 2; continue; }
        this.err("f-string: single '}' is not allowed");
        this.pos++;
        continue;
      }
      lit += c;
      this.pos++;
    }
    flush();
    return parts;
  }

  fstringField(q, triple) {
    const s = this.src;
    const start = this.pos;
    const line = this.line;
    const col = this.col();
    let depth = 0;
    let end = -1;
    let debug = false;
    while (this.pos < this.end) {
      const c = s[this.pos];
      if (c === '\\' && (s[this.pos + 1] === '\n' || s[this.pos + 1] === '\r')) { this.newline(this.pos + 1); continue; }
      if (c === '\n' || c === '\r') { this.newline(this.pos); continue; }
      if (c === '#') { while (this.pos < this.end && s[this.pos] !== '\n' && s[this.pos] !== '\r') this.pos++; continue; }
      if (c === '"' || c === "'") {
        // nested string (any prefix already consumed as NAME chars handled below)
        if (!triple && c === q && depth === 0 && !this.nestedQuoteAllowed()) { break; }
        this.skipNestedString();
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let p = this.pos;
        while (p < this.end && /[A-Za-z0-9_]/.test(s[p])) p++;
        const word = s.slice(this.pos, p);
        if ((s[p] === '"' || s[p] === "'") && word.length <= 2 && STR_PREFIX.test(word)) {
          this.pos = p;
          this.skipNestedString(word);
          continue;
        }
        this.pos = p;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') { depth++; this.pos++; continue; }
      if (c === ')' || c === ']') { depth--; this.pos++; continue; }
      if (c === '}') {
        if (depth > 0) { depth--; this.pos++; continue; }
        end = this.pos;
        break;
      }
      if (depth === 0 && c === '=' && s[this.pos + 1] !== '=' && !/[=!<>:]/.test(s[this.pos - 1] || '')) {
        // debug specifier f"{x=}"
        let p = this.pos + 1;
        while (s[p] === ' ') p++;
        if (s[p] === '}' || s[p] === '!' || s[p] === ':') { end = this.pos; debug = true; this.pos++; break; }
      }
      if (depth === 0 && c === '!' && s[this.pos + 1] !== '=') { end = this.pos; break; }
      if (depth === 0 && c === ':') { end = this.pos; break; }
      if (c === q && !triple && depth === 0) { break; }
      this.pos++;
    }
    if (end < 0) {
      end = this.pos;
      this.err('f-string: expecting }', line, col);
      return { kind: 'field', start, end, line, col, conv: null, spec: null, debug, bad: true };
    }
    // skip debug trailing spaces
    while (debug && s[this.pos] === ' ') this.pos++;
    let conv = null;
    let spec = null;
    if (s[this.pos] === '!') {
      conv = s[this.pos + 1];
      this.pos += 2;
      while (s[this.pos] === ' ' || s[this.pos] === '\t') this.pos++;
    }
    if (s[this.pos] === ':') {
      this.pos++;
      spec = this.fstringBody(q, triple, false, true);
    }
    if (s[this.pos] === '}') this.pos++;
    else this.err('f-string: expecting }', this.line, this.col());
    return { kind: 'field', start, end, line, col, conv, spec, debug };
  }

  nestedQuoteAllowed() { return true; }

  skipNestedString(prefix = '') {
    const s = this.src;
    const q = s[this.pos];
    const triple = s[this.pos + 1] === q && s[this.pos + 2] === q;
    const lp = prefix.toLowerCase();
    if (lp.includes('f') || lp.includes('t')) {
      this.pos += triple ? 3 : 1;
      this.fstringBody(q, triple, lp.includes('r'));
      return;
    }
    this.pos += triple ? 3 : 1;
    while (this.pos < this.end) {
      const c = s[this.pos];
      if (c === '\\') { if (s[this.pos + 1] === '\n' || s[this.pos + 1] === '\r') { this.newline(this.pos + 1); continue; } this.pos += 2; continue; }
      if (c === q && (!triple || (s[this.pos + 1] === q && s[this.pos + 2] === q))) { this.pos += triple ? 3 : 1; return; }
      if (c === '\n' || c === '\r') { if (!triple) return; this.newline(this.pos); continue; }
      this.pos++;
    }
  }
}

function tokenize(src, opts) {
  const t = new Tokenizer(src, opts);
  t.run();
  return { tokens: t.tokens, errors: t.errors, comments: t.comments };
}

module.exports = { tokenize, Tokenizer };
