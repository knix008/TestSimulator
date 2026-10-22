'use strict';

// MISRA C:2012 / 2023 chapter 4: character sets and lexical conventions.

const U = require('../lib/a-util');
const { cf, meta, msg } = U;

function r41(unit, api) {
  for (const [file, src] of U.userSources(unit)) {
    if (!U.firstScan(api, '4.1', file)) continue;
    const li = U.lineInfo(unit);
    for (const t of src.tokens || []) {
      if (t.kind !== 'string' && t.kind !== 'char') continue;
      if (li.skipped(file, t.line)) continue;
      let parts;
      try { parts = cf.lexer.literalParts(t); } catch (_) { continue; }
      if (!parts || parts.raw) continue;
      const body = parts.body || '';
      let esc;
      try { esc = cf.lexer.decodeEscapes(body).escapes || []; } catch (_) { continue; }
      for (const e of esc) {
        if (e.kind !== 'octal' && e.kind !== 'hex') continue;
        const end = e.end != null ? e.end : e.offset + e.text.length;
        if (end >= body.length || body[end] === '\\') continue;
        api.report(t, msg(
          `${e.kind === 'hex' ? 'Hexadecimal' : 'Octal'} escape '${e.text}' in ${t.value} is directly followed by '${body[end]}'.`,
          `${t.value}의 ${e.kind === 'hex' ? '16진' : '8진'} 이스케이프 '${e.text}' 바로 뒤에 '${body[end]}'가 이어집니다.`));
      }
    }
  }
}

function r42(unit, api) {
  for (const tg of unit.trigraphs || []) {
    if (U.isBuiltin(tg.file) || !U.firstScan(api, `4.2@${tg.line}:${tg.col}`, tg.file)) continue;
    api.report(tg, msg(`Trigraph '${tg.seq}' (meaning '${tg.replacement}') is used.`, `트라이그래프 '${tg.seq}'('${tg.replacement}')를 사용합니다.`));
  }
}

module.exports = [
  { meta: meta('4.1', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 2, dec: true, name: ['Unterminated octal or hexadecimal escape sequence', '끝나지 않은 8진/16진 이스케이프 시퀀스'],
    why: ['An escape followed by more characters can absorb them, e.g. "\\x41g" is fine but "\\x4142" is one character.', '이스케이프 뒤에 문자가 이어지면 그 문자까지 흡수될 수 있습니다.'],
    fix: ['End the escape with the literal end or another escape, or split the literal ("\\x41" "B").', '이스케이프를 리터럴 끝이나 다른 이스케이프로 끝내거나 리터럴을 나누세요("\\x41" "B").'] }), check: r41 },
  { meta: meta('4.2', { cat: 'A', sev: 'MINOR', debt: 2, dec: true, name: ['Trigraphs should not be used', '트라이그래프를 사용하지 않아야 함'],
    why: ['Trigraphs are replaced even inside strings and surprise most readers.', '트라이그래프는 문자열 안에서도 바뀌어 대부분의 독자를 놀라게 합니다.'],
    fix: ['Write the characters directly or break the "??" sequence.', '문자를 직접 쓰거나 "??" 시퀀스를 끊으세요.'] }), check: r42 },
];
