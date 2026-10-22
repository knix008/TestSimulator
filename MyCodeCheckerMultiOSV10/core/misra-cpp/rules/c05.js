'use strict';

// MISRA C++:2023 chapter 5 — lexical conventions.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const userComments = (unit) => (unit.comments || []).filter((c) => !U.isBuiltin(c.file));

// Heuristic: does a comment line look like source code?
const CODE_PATTERNS = [
  /^\s*#\s*(include|define|undef|if|ifdef|ifndef|else|elif|endif|pragma)\b/,
  /^\s*(if|for|while|switch)\s*\(.*\)\s*\{?\s*$/,
  /^\s*(return|break|continue|goto)\b[^.!?]*;\s*$/,
  /^\s*[A-Za-z_][\w:.<>\->\[\]]*\s*(=|\+=|-=|\*=|\/=|\+\+|--)\s*[^=].*;\s*$/,
  /^\s*[A-Za-z_][\w:.<>\->]*\s*\([^()]*\)\s*;\s*$/,
  /^\s*(const\s+)?(int|char|bool|float|double|auto|void|unsigned|long|short|std::\w+|u?int\d+_t)\b[\w\s*&<>:,]*[\w\]]\s*(=[^;]*)?;\s*$/,
  /^\s*\}\s*(else\b.*)?$/,
  /^\s*else\s*\{?\s*$/,
];
function looksLikeCode(text) {
  let body = text;
  if (body.startsWith('//')) body = body.slice(2);
  else if (body.startsWith('/*')) body = body.slice(2, body.endsWith('*/') ? -2 : undefined);
  const lines = body.split(/\r?\n/).map((l) => l.replace(/^\s*\*+\s?/, '').replace(/\s*\/\/.*$/, ''));
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s*[!<\/]/.test(l)) continue;
    if (/\b(e\.g\.|i\.e\.|TODO|NOTE|see)\b/i.test(l) && !/;\s*$/.test(l)) continue;
    if (CODE_PATTERNS.some((re) => re.test(l))) return i;
  }
  return -1;
}

const RESERVED_RE = /^_[A-Z]|__/;

function declNameSites(unit) {
  const out = [];
  for (const s of unit.symbols) {
    if (!s.name || s.predefined || s.system) continue;
    const d = s.decls && s.decls[0];
    if (!d || !U.user(d)) continue;
    if (s.kind === 'templateParam') continue;
    out.push({ sym: s, node: d });
  }
  return out;
}

const escapesOf = (lit) => (lit.escapes || []);

function literalBody(lit, partIndex) {
  const raw = lit.type === 'StringLiteral' ? (lit.parts || [lit.raw])[partIndex || 0] : lit.raw;
  if (!raw) return '';
  const q = raw.indexOf(lit.type === 'CharLiteral' ? "'" : '"');
  const last = raw.lastIndexOf(lit.type === 'CharLiteral' ? "'" : '"');
  return q >= 0 && last > q ? raw.slice(q + 1, last) : raw;
}

const prefixOf = (part) => { const m = /^(u8|u|U|L)?R?"/.exec(part); return m ? (m[1] || '') : ''; };

module.exports = [
  R({
    id: '5.0.1', cat: 'Advisory', dec: true, autosar: 'A2-5-1', sev: 'MINOR', debt: 2,
    name: ['Trigraph-like sequences should not be used', '트라이그래프처럼 보이는 문자열은 쓰지 않아야 합니다'],
    why: ['Sequences such as ??= are replaced by other characters under some compiler settings, changing the meaning of the code or text.', '??= 같은 문자열은 일부 컴파일러 설정에서 다른 문자로 바뀌어 코드나 문자열의 뜻을 바꿉니다.'],
    fix: ['Break the sequence up, for example with an escape (\\?).', '이스케이프(\\?) 등으로 문자열을 끊으세요.'],
    check(unit, api) {
      for (const t of unit.trigraphs || []) {
        if (U.isBuiltin(t.file)) continue;
        api.report(t, M(`The sequence '${t.seq}' looks like a trigraph.`, `'${t.seq}' 는 트라이그래프처럼 보입니다.`));
      }
    },
  }),
  R({
    id: '5.7.1', cat: 'Required', dec: true, autosar: 'M2-7-1', sev: 'MAJOR', debt: 2,
    name: ['The character sequence /* shall not be used within a C-style comment', 'C 형식 주석 안에서 /* 를 쓰면 안 됩니다'],
    why: ['Comments do not nest, so a /* inside a comment usually means a missing */ swallowed real code.', '주석은 중첩되지 않으므로 주석 안의 /* 는 대개 */ 가 빠져 실제 코드가 주석이 되었음을 뜻합니다.'],
    fix: ['Close the earlier comment, or remove the inner /*.', '앞 주석을 닫거나 안쪽의 /* 를 지우세요.'],
    check(unit, api) {
      for (const c of userComments(unit)) {
        if (c.style !== 'block') continue;
        const inner = c.value.slice(2, c.value.endsWith('*/') ? -2 : undefined);
        const i = inner.indexOf('/*');
        if (i < 0) continue;
        const before = c.value.slice(0, i + 2);
        const nl = (before.match(/\n/g) || []).length;
        api.report({ file: c.file, line: c.line + nl, col: nl ? 1 : c.col }, M('The sequence /* appears inside a C-style comment.', 'C 형식 주석 안에 /* 가 있습니다.'));
      }
    },
  }),
  R({
    id: '5.7.2', dir: true, cat: 'Advisory', dec: false, autosar: 'A2-7-2', sev: 'MINOR', debt: 5,
    name: ['Sections of code should not be "commented out"', '코드를 주석으로 막아 두지 않아야 합니다'],
    why: ['Commented-out code rots: it is not compiled, not tested and leaves readers guessing whether it matters.', '주석 처리된 코드는 컴파일도 시험도 되지 않고, 중요한지 아닌지 읽는 사람이 추측하게 만듭니다.'],
    fix: ['Delete the dead code (version control keeps it) or use #if 0 with a justification.', '죽은 코드를 지우거나(버전 관리가 보관합니다) 사유를 적고 #if 0 을 쓰세요.'],
    check(unit, api) {
      for (const c of userComments(unit)) {
        const i = looksLikeCode(c.value);
        if (i < 0) continue;
        api.report({ file: c.file, line: c.line + i, col: i ? 1 : c.col }, M('This comment appears to contain commented-out code.', '이 주석에는 주석 처리된 코드가 있는 것 같습니다.'));
      }
    },
  }),
  R({
    id: '5.7.3', cat: 'Required', dec: true, autosar: 'A2-7-1', sev: 'MAJOR', debt: 2,
    name: ['Line-splicing shall not be used in // comments', '// 주석에서 줄 이어붙이기를 쓰면 안 됩니다'],
    why: ['A backslash at the end of a // comment silently turns the next line into part of the comment.', '// 주석 끝의 역슬래시는 다음 줄을 조용히 주석의 일부로 만듭니다.'],
    fix: ['Remove the trailing backslash from the comment.', '주석 끝의 역슬래시를 지우세요.'],
    check(unit, api) {
      for (const c of userComments(unit)) if (c.style === 'line' && c.spliced) api.report(c, M('This // comment is continued onto the next line by a backslash.', '이 // 주석이 역슬래시로 다음 줄까지 이어집니다.'));
    },
  }),
  R({
    id: '5.10.1', cat: 'Required', dec: true, autosar: 'A2-10-1', sev: 'MAJOR', debt: 5,
    name: ['User-defined identifiers shall have an appropriate form', '사용자 정의 식별자는 알맞은 형태여야 합니다'],
    why: ['Names containing a double underscore or starting with an underscore and a capital letter are reserved for the implementation.', '밑줄 두 개를 포함하거나 밑줄과 대문자로 시작하는 이름은 구현(컴파일러/라이브러리) 용으로 예약되어 있습니다.'],
    fix: ['Rename the identifier so that it does not use a reserved form.', '예약된 형태를 쓰지 않도록 이름을 바꾸세요.'],
    check(unit, api) {
      const bad = (name, global) => RESERVED_RE.test(name) || (global && /^_/.test(name));
      for (const { sym, node } of declNameSites(unit)) {
        const global = sym.scope && (sym.scope.kind === 'file' || sym.scope.kind === 'namespace');
        if (!bad(sym.name, global)) continue;
        api.report(node.nameLoc ? { ...node.nameLoc, file: node.loc.file } : node, M(`The identifier '${sym.name}' uses a reserved form.`, `식별자 '${sym.name}' 는 예약된 형태입니다.`));
      }
      for (const m of unit.macros || []) {
        if (U.isBuiltin(m.file) || m.predefined || m.commandLine) continue;
        const guard = [...(unit.headerGuards ? unit.headerGuards.values() : [])].some((g) => g.macro === m.name);
        if (bad(m.name, true) && !guard) api.report(m, M(`The macro name '${m.name}' uses a reserved form.`, `매크로 이름 '${m.name}' 는 예약된 형태입니다.`));
        else if (m.isKeyword || cf.lexer.isKeyword(m.name, 'cpp')) api.report(m, M(`The macro name '${m.name}' is a keyword.`, `매크로 이름 '${m.name}' 은(는) 키워드입니다.`));
      }
      for (const fd of U.ix(unit).get('FunctionDecl')) {
        const m = /^operator\s*""\s*(\w+)$/.exec(fd.name || '');
        if (m && !m[1].startsWith('_')) api.report(fd, M(`The literal suffix '${m[1]}' must start with an underscore.`, `리터럴 접미사 '${m[1]}' 는 밑줄로 시작해야 합니다.`));
      }
    },
  }),
  R({
    id: '5.13.1', cat: 'Required', dec: true, autosar: 'A2-13-1', sev: 'MAJOR', debt: 2,
    name: ['Within character and non-raw string literals, \\ shall only form a defined escape sequence or universal character name', '문자/일반 문자열 리터럴에서 \\ 는 정의된 이스케이프나 UCN 에만 써야 합니다'],
    why: ['An undefined escape sequence has implementation-defined meaning.', '정의되지 않은 이스케이프 시퀀스의 의미는 구현마다 다릅니다.'],
    fix: ['Use a standard escape such as \\n, \\\\ or \\x41.', '\\n, \\\\, \\x41 같은 표준 이스케이프를 쓰세요.'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('CharLiteral', 'StringLiteral')) {
        if (lit.rawString) continue;
        for (const e of escapesOf(lit)) if (e.kind === 'unknown') api.report(lit, M(`'${e.text}' is not a defined escape sequence.`, `'${e.text}' 는 정의된 이스케이프 시퀀스가 아닙니다.`));
      }
    },
  }),
  R({
    id: '5.13.2', cat: 'Required', dec: true, sev: 'MAJOR', debt: 2,
    name: ['Octal escape sequences, hexadecimal escape sequences and universal character names shall be terminated', '8진/16진 이스케이프와 UCN 은 끝이 분명해야 합니다'],
    why: ['An escape such as \\x1F followed by more characters can absorb them, so "\\x1Fa" does not mean what it appears to.', '\\x1F 뒤에 문자가 이어지면 그 문자까지 이스케이프에 흡수될 수 있어 "\\x1Fa" 가 보이는 뜻과 달라집니다.'],
    fix: ['End the escape with another escape or split the literal ("\\x1F" "a").', '이스케이프 뒤에 다른 이스케이프를 두거나 리터럴을 나누세요 ("\\x1F" "a").'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('CharLiteral', 'StringLiteral')) {
        if (lit.rawString) continue;
        for (const e of escapesOf(lit)) {
          if (e.kind !== 'octal' && e.kind !== 'hex') continue;
          const body = literalBody(lit, e.part);
          const end = e.end != null ? e.end : e.offset + e.text.length;
          if (end < body.length && body[end] !== '\\') api.report(lit, M(`The escape '${e.text}' is directly followed by '${body[end]}'.`, `이스케이프 '${e.text}' 바로 뒤에 '${body[end]}' 가 이어집니다.`));
        }
      }
    },
  }),
  R({
    id: '5.13.3', cat: 'Required', dec: true, autosar: 'M2-13-2', sev: 'MAJOR', debt: 2,
    name: ['Octal constants shall not be used', '8진 상수를 쓰면 안 됩니다'],
    why: ['A leading zero makes a number octal, which readers easily mistake for decimal.', '앞의 0 때문에 8진수가 되는데, 읽는 사람은 쉽게 10진수로 착각합니다.'],
    fix: ['Write the value in decimal or hexadecimal.', '값을 10진수나 16진수로 쓰세요.'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('IntegerLiteral')) if (lit.octal && !lit.loc.macro) api.report(lit, M(`'${lit.raw}' is an octal constant (value ${lit.value}).`, `'${lit.raw}' 는 8진 상수입니다 (값 ${lit.value}).`));
    },
  }),
  R({
    id: '5.13.4', cat: 'Required', dec: true, autosar: 'M2-13-3', sev: 'MAJOR', debt: 2,
    name: ['Unsigned integer literals shall be appropriately suffixed', '부호 없는 정수 리터럴에는 알맞은 접미사를 붙여야 합니다'],
    why: ['A hexadecimal or octal literal can silently become unsigned when it does not fit a signed type.', '16진/8진 리터럴은 부호 있는 타입에 맞지 않으면 조용히 부호 없는 타입이 됩니다.'],
    fix: ['Add a U suffix to make the unsigned type explicit.', 'U 접미사를 붙여 부호 없는 타입임을 밝히세요.'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('IntegerLiteral')) {
        if (lit.loc.macro && U.isBuiltin((unit.macroTable.get(lit.loc.macro) || {}).file)) continue;
        const t = lit.ctype && U.canon(lit.ctype);
        if (!t || t.kind !== 'int' || /[uU]/.test(lit.suffix || '')) continue;
        if (U.numCat(t, unit.target) === 'unsigned') api.report(lit, M(`'${lit.raw}' has type '${t.name}' but no U suffix.`, `'${lit.raw}' 의 타입은 '${t.name}' 인데 U 접미사가 없습니다.`));
      }
    },
  }),
  R({
    id: '5.13.5', cat: 'Required', dec: true, autosar: 'M2-13-4', sev: 'MINOR', debt: 1,
    name: ['The lowercase form of L shall not be used as the first character in a literal suffix', '리터럴 접미사의 첫 글자로 소문자 l 을 쓰면 안 됩니다'],
    why: ['A lowercase l is easily confused with the digit 1.', '소문자 l 은 숫자 1 과 혼동하기 쉽습니다.'],
    fix: ['Use an uppercase L.', '대문자 L 을 쓰세요.'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('IntegerLiteral', 'FloatingLiteral')) if ((lit.suffix || '').startsWith('l')) api.report(lit, M(`The suffix of '${lit.raw}' starts with a lowercase 'l'.`, `'${lit.raw}' 의 접미사가 소문자 'l' 로 시작합니다.`));
    },
  }),
  R({
    id: '5.13.6', cat: 'Required', dec: true, sev: 'MINOR', debt: 1,
    name: ['An integer-literal of type long long shall not use a single L or l in any suffix', 'long long 타입 정수 리터럴의 접미사에 L 을 하나만 쓰면 안 됩니다'],
    why: ['A single L promises long; when the value only fits long long the declared intent and the real type differ.', 'L 하나는 long 을 뜻하는데, 값이 long long 에만 맞으면 의도와 실제 타입이 달라집니다.'],
    fix: ['Use the LL suffix for long long values.', 'long long 값에는 LL 접미사를 쓰세요.'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('IntegerLiteral')) {
        const t = lit.ctype && U.canon(lit.ctype);
        if (!t || (t.name !== 'long long' && t.name !== 'unsigned long long')) continue;
        if (/^[uU]?[lL][uU]?$/.test(lit.suffix || '')) api.report(lit, M(`'${lit.raw}' has type '${t.name}' but only a single L suffix.`, `'${lit.raw}' 는 '${t.name}' 타입인데 L 접미사가 하나뿐입니다.`));
      }
    },
  }),
  R({
    id: '5.13.7', cat: 'Required', dec: true, autosar: 'A2-13-2', sev: 'MAJOR', debt: 2,
    name: ['String literals with different encoding prefixes shall not be concatenated', '인코딩 접두사가 다른 문자열 리터럴을 이어 붙이면 안 됩니다'],
    why: ['Concatenating literals with different encodings is conditionally supported and its result is implementation-defined.', '인코딩이 다른 리터럴을 이어 붙이는 것은 조건부로만 지원되며 결과가 구현마다 다릅니다.'],
    fix: ['Use the same encoding prefix on every piece of the literal.', '리터럴의 모든 조각에 같은 인코딩 접두사를 쓰세요.'],
    check(unit, api) {
      for (const lit of U.ix(unit).get('StringLiteral')) {
        const ps = new Set((lit.parts || []).map(prefixOf).filter(Boolean));
        if (ps.size > 1) api.report(lit, M(`String literals with prefixes ${[...ps].map((p) => `'${p}'`).join(' and ')} are concatenated.`, `접두사 ${[...ps].map((p) => `'${p}'`).join(', ')} 가 다른 문자열 리터럴을 이어 붙입니다.`));
      }
    },
  }),
];
