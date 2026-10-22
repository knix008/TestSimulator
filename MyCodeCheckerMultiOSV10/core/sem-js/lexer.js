'use strict';

// On-demand JavaScript / TypeScript tokenizer. The parser drives it: a '/'
// token is re-scanned as a regular expression where an expression may start,
// template continuations are read after '}' and JSX text is read character by
// character. The lexer itself keeps no state besides its position, so the
// parser can back-track by saving and restoring `pos`.

class LexError extends Error {
  constructor(message, pos) {
    super(message);
    this.pos = pos;
  }
}

const PUNCT4 = new Set(['>>>=']);
const PUNCT3 = new Set(['...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=']);
const PUNCT2 = new Set(['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**']);

function isIdStart(c) {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 36 || c === 95 || (c >= 0x80 && !isSpaceCode(c) && c !== 0x2028 && c !== 0x2029);
}
function isIdPart(c) {
  return isIdStart(c) || (c >= 48 && c <= 57) || c === 0x200c || c === 0x200d;
}
function isSpaceCode(c) {
  return c === 32 || c === 9 || c === 11 || c === 12 || c === 0xa0 || c === 0xfeff || c === 0x1680
    || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000;
}
function isNewline(c) {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
}

class Lexer {
  constructor(src) {
    this.src = src;
    this.len = src.length;
    this.pos = 0;
    this.comments = [];
    this.lastComment = -1;
    // Skip a hashbang line.
    if (src.charCodeAt(0) === 35 && src.charCodeAt(1) === 33) {
      while (this.pos < this.len && !isNewline(src.charCodeAt(this.pos))) this.pos++;
    }
  }

  error(msg, pos) {
    throw new LexError(msg, pos == null ? this.pos : pos);
  }

  // Skip blanks and comments. Returns true when a line break was crossed.
  skipSpace() {
    const s = this.src;
    let nl = false;
    while (this.pos < this.len) {
      const c = s.charCodeAt(this.pos);
      if (c === 32 || c === 9) { this.pos++; continue; }
      if (isNewline(c)) { nl = true; this.pos++; continue; }
      if (c === 47) {
        const n = s.charCodeAt(this.pos + 1);
        if (n === 47) {
          const start = this.pos;
          this.pos += 2;
          while (this.pos < this.len && !isNewline(s.charCodeAt(this.pos))) this.pos++;
          this.addComment('Line', start, this.pos, s.slice(start + 2, this.pos));
          continue;
        }
        if (n === 42) {
          const start = this.pos;
          const end = s.indexOf('*/', this.pos + 2);
          if (end < 0) this.error('Unterminated comment', start);
          const body = s.slice(start + 2, end);
          if (/[\n\r\u2028\u2029]/.test(body)) nl = true;
          this.pos = end + 2;
          this.addComment('Block', start, this.pos, body);
          continue;
        }
        break;
      }
      if (c > 127 && isSpaceCode(c)) { this.pos++; continue; }
      if (c === 11 || c === 12) { this.pos++; continue; }
      break;
    }
    return nl;
  }

  addComment(type, start, end, value) {
    if (start <= this.lastComment) return;
    this.lastComment = start;
    this.comments.push({ type, value, start, end });
  }

  // Read the next token starting at pos.
  next() {
    const nl = this.skipSpace();
    const s = this.src;
    const start = this.pos;
    if (start >= this.len) return { type: 'eof', value: '', start, end: start, nl };
    const c = s.charCodeAt(start);
    if (isIdStart(c) || c === 92) return this.readName(start, nl, 'name');
    if (c === 35) {
      // #private
      if (isIdStart(s.charCodeAt(start + 1)) || s.charCodeAt(start + 1) === 92) {
        const t = this.readName(start + 1, nl, 'priv');
        t.start = start;
        return t;
      }
      this.pos++;
      return { type: 'punct', value: '#', start, end: this.pos, nl };
    }
    if (c >= 48 && c <= 57) return this.readNumber(start, nl);
    if (c === 46 && s.charCodeAt(start + 1) >= 48 && s.charCodeAt(start + 1) <= 57) return this.readNumber(start, nl);
    if (c === 34 || c === 39) return this.readString(start, nl, c);
    if (c === 96) return this.readTemplate(start + 1, nl, start);
    // punctuators
    const s4 = s.substr(start, 4);
    if (PUNCT4.has(s4)) { this.pos += 4; return { type: 'punct', value: s4, start, end: this.pos, nl }; }
    const s3 = s4.slice(0, 3);
    if (PUNCT3.has(s3)) { this.pos += 3; return { type: 'punct', value: s3, start, end: this.pos, nl }; }
    const s2 = s3.slice(0, 2);
    if (PUNCT2.has(s2)) {
      // ?. followed by a digit is a conditional with a number: a?.5:b
      if (s2 === '?.' && s.charCodeAt(start + 2) >= 48 && s.charCodeAt(start + 2) <= 57) {
        this.pos += 1;
        return { type: 'punct', value: '?', start, end: this.pos, nl };
      }
      this.pos += 2;
      return { type: 'punct', value: s2, start, end: this.pos, nl };
    }
    // HTML open comment in scripts: treat as line comment
    if (s4 === '<!--') {
      while (this.pos < this.len && !isNewline(s.charCodeAt(this.pos))) this.pos++;
      return this.next();
    }
    this.pos++;
    return { type: 'punct', value: s[start], start, end: this.pos, nl };
  }

  readName(start, nl, type) {
    const s = this.src;
    let p = start;
    let value = '';
    let esc = false;
    let chunk = p;
    while (p < this.len) {
      const c = s.charCodeAt(p);
      if (c === 92) {
        // \uXXXX or \u{...}
        value += s.slice(chunk, p);
        if (s[p + 1] !== 'u') this.error('Bad escape in identifier', p);
        let code;
        if (s[p + 2] === '{') {
          const close = s.indexOf('}', p + 3);
          if (close < 0) this.error('Bad escape', p);
          code = parseInt(s.slice(p + 3, close), 16);
          p = close + 1;
        } else {
          code = parseInt(s.slice(p + 2, p + 6), 16);
          p += 6;
        }
        if (!Number.isFinite(code)) this.error('Bad escape', p);
        value += String.fromCodePoint(code);
        esc = true;
        chunk = p;
        continue;
      }
      if (c >= 0xd800 && c <= 0xdbff) { p += 2; continue; }
      if (!isIdPart(c)) break;
      p++;
    }
    value += s.slice(chunk, p);
    if (!value) this.error('Unexpected character', start);
    this.pos = p;
    return { type, value, start, end: p, nl, esc };
  }

  readNumber(start, nl) {
    const s = this.src;
    let p = start;
    const c0 = s[p];
    const c1 = (s[p + 1] || '').toLowerCase();
    let value;
    let bigint = false;
    let legacyOctal = false;
    if (c0 === '0' && (c1 === 'x' || c1 === 'o' || c1 === 'b')) {
      p += 2;
      const q = p;
      while (p < this.len && /[0-9a-fA-F_]/.test(s[p])) p++;
      const digits = s.slice(q, p).replace(/_/g, '');
      if (s[p] === 'n') { bigint = true; p++; }
      const radix = c1 === 'x' ? 16 : c1 === 'o' ? 8 : 2;
      value = bigint ? null : parseInt(digits, radix);
      if (!bigint && digits.length > 12) {
        try { value = Number(BigInt((c1 === 'x' ? '0x' : c1 === 'o' ? '0o' : '0b') + digits)); } catch { /* keep */ }
      }
    } else {
      if (c0 === '0' && /[0-9]/.test(c1)) {
        // legacy octal 017 or decimal-looking 089
        while (p < this.len && /[0-9_]/.test(s[p])) p++;
        const digits = s.slice(start, p);
        legacyOctal = /^0[0-7]+$/.test(digits);
        value = legacyOctal ? parseInt(digits, 8) : parseFloat(digits);
      } else {
        while (p < this.len && /[0-9_]/.test(s[p])) p++;
        if (s[p] === 'n') { bigint = true; p++; } else {
          if (s[p] === '.') { p++; while (p < this.len && /[0-9_]/.test(s[p])) p++; }
          if (s[p] === 'e' || s[p] === 'E') {
            let q = p + 1;
            if (s[q] === '+' || s[q] === '-') q++;
            if (/[0-9]/.test(s[q] || '')) { p = q; while (p < this.len && /[0-9_]/.test(s[p])) p++; }
          }
          value = parseFloat(s.slice(start, p).replace(/_/g, ''));
        }
      }
    }
    if (p < this.len && isIdStart(s.charCodeAt(p))) this.error('Identifier directly after number', p);
    this.pos = p;
    return { type: 'num', value, start, end: p, nl, bigint, legacyOctal };
  }

  readEscape(p, out) {
    // p points at the char after the backslash; returns new p
    const s = this.src;
    const c = s[p];
    switch (c) {
      case 'n': out.v += '\n'; return p + 1;
      case 't': out.v += '\t'; return p + 1;
      case 'r': out.v += '\r'; return p + 1;
      case 'b': out.v += '\b'; return p + 1;
      case 'f': out.v += '\f'; return p + 1;
      case 'v': out.v += '\v'; return p + 1;
      case '\r': return s[p + 1] === '\n' ? p + 2 : p + 1;
      case '\n': case '\u2028': case '\u2029': return p + 1;
      case 'x': {
        const h = parseInt(s.slice(p + 1, p + 3), 16);
        if (!/^[0-9a-fA-F]{2}$/.test(s.slice(p + 1, p + 3))) { out.bad = true; return p + 1; }
        out.v += String.fromCharCode(h);
        return p + 3;
      }
      case 'u': {
        if (s[p + 1] === '{') {
          const close = s.indexOf('}', p + 2);
          const code = close > 0 ? parseInt(s.slice(p + 2, close), 16) : NaN;
          if (!Number.isFinite(code) || code > 0x10ffff) { out.bad = true; return p + 1; }
          out.v += String.fromCodePoint(code);
          return close + 1;
        }
        const hex = s.slice(p + 1, p + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) { out.bad = true; return p + 1; }
        out.v += String.fromCharCode(parseInt(hex, 16));
        return p + 5;
      }
      default:
        if (c >= '0' && c <= '7') {
          let q = p;
          let digits = '';
          while (q < p + 3 && s[q] >= '0' && s[q] <= '7') digits += s[q++];
          if (digits !== '0' || (s[q] >= '0' && s[q] <= '9')) out.octal = true;
          out.v += String.fromCharCode(parseInt(digits, 8));
          return q;
        }
        if (c === '8' || c === '9') out.octal = true;
        out.v += c === undefined ? '' : c;
        return p + 1;
    }
  }

  readString(start, nl, quote) {
    const s = this.src;
    let p = start + 1;
    const out = { v: '', octal: false, bad: false };
    let chunk = p;
    for (;;) {
      if (p >= this.len) this.error('Unterminated string', start);
      const c = s.charCodeAt(p);
      if (c === quote) break;
      if (c === 92) {
        out.v += s.slice(chunk, p);
        p = this.readEscape(p + 1, out);
        chunk = p;
        continue;
      }
      if (c === 10 || c === 13) this.error('Unterminated string', start);
      p++;
    }
    out.v += s.slice(chunk, p);
    this.pos = p + 1;
    return { type: 'str', value: out.v, start, end: this.pos, nl, octal: out.octal };
  }

  // Read a template chunk starting at p (just after ` or }). tokStart is the
  // offset of the opening ` or }.
  readTemplate(p, nl, tokStart) {
    const s = this.src;
    const out = { v: '', octal: false, bad: false };
    const rawStart = p;
    let chunk = p;
    for (;;) {
      if (p >= this.len) this.error('Unterminated template', tokStart);
      const c = s.charCodeAt(p);
      if (c === 96) {
        out.v += s.slice(chunk, p);
        this.pos = p + 1;
        return { type: 'template', value: out.bad ? null : out.v, raw: s.slice(rawStart, p), tail: true, start: tokStart, end: this.pos, nl, quasiStart: rawStart, quasiEnd: p };
      }
      if (c === 36 && s.charCodeAt(p + 1) === 123) {
        out.v += s.slice(chunk, p);
        this.pos = p + 2;
        return { type: 'template', value: out.bad ? null : out.v, raw: s.slice(rawStart, p), tail: false, start: tokStart, end: this.pos, nl, quasiStart: rawStart, quasiEnd: p };
      }
      if (c === 92) {
        out.v += s.slice(chunk, p);
        p = this.readEscape(p + 1, out);
        chunk = p;
        continue;
      }
      p++;
    }
  }

  readRegex(start, nl) {
    const s = this.src;
    let p = start + 1;
    let inClass = false;
    for (;;) {
      if (p >= this.len) this.error('Unterminated regex', start);
      const c = s[p];
      if (c === '\n' || c === '\r') this.error('Unterminated regex', start);
      if (c === '\\') { p += 2; continue; }
      if (inClass) { if (c === ']') inClass = false; } else if (c === '[') inClass = true; else if (c === '/') break;
      p++;
    }
    const pattern = s.slice(start + 1, p);
    p++;
    const fs = p;
    while (p < this.len && isIdPart(s.charCodeAt(p))) p++;
    const flags = s.slice(fs, p);
    this.pos = p;
    return { type: 'regex', value: { pattern, flags }, start, end: p, nl };
  }

  // ---- JSX helpers (character level)
  jsxSkip() {
    this.skipSpace();
  }
  peekChar() {
    return this.src[this.pos];
  }
  readJsxName() {
    const s = this.src;
    const start = this.pos;
    let p = start;
    while (p < this.len) {
      const c = s.charCodeAt(p);
      if (isIdPart(c) || c === 45) p++; else break;
    }
    if (p === start) this.error('JSX name expected', start);
    this.pos = p;
    return { value: s.slice(start, p), start, end: p };
  }
  readJsxString() {
    const s = this.src;
    const start = this.pos;
    const q = s[start];
    const end = s.indexOf(q, start + 1);
    if (end < 0) this.error('Unterminated JSX string', start);
    this.pos = end + 1;
    return { value: decodeEntities(s.slice(start + 1, end)), raw: s.slice(start, end + 1), start, end: end + 1 };
  }
  readJsxText() {
    const s = this.src;
    const start = this.pos;
    let p = start;
    while (p < this.len) {
      const c = s[p];
      if (c === '{' || c === '<') break;
      p++;
    }
    this.pos = p;
    return { value: decodeEntities(s.slice(start, p)), raw: s.slice(start, p), start, end: p };
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', times: '×', middot: '·', bull: '•', rarr: '→', larr: '←' };
function decodeEntities(text) {
  if (text.indexOf('&') < 0) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] != null ? ENTITIES[e] : m;
  });
}

module.exports = { Lexer, LexError, isIdStart, isIdPart, isNewline };
