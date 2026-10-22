'use strict';

// MISRA C:2012 / 2023 chapter 3: comments.

const U = require('../lib/a-util');
const { meta, msg } = U;

function userComments(unit, api, id) {
  const files = new Set();
  for (const [f] of U.userSources(unit)) if (U.firstScan(api, id, f)) files.add(f);
  return (unit.comments || []).filter((c) => files.has(c.file));
}

function r31(unit, api) {
  for (const c of userComments(unit, api, '3.1')) {
    const v = c.value || '';
    const body = c.style === 'block' ? v.slice(2, v.endsWith('*/') ? -2 : undefined) : v.slice(2);
    const seq = [];
    if (body.includes('/*')) seq.push('/*');
    if (c.style === 'block' && body.includes('//')) seq.push('//');
    if (!seq.length) continue;
    api.report(c, msg(
      `Comment contains the sequence '${seq.join("' and '")}'.`,
      `주석 안에 '${seq.join("', '")}' 문자열이 있습니다.`));
  }
}

function r32(unit, api) {
  for (const c of userComments(unit, api, '3.2')) {
    if (c.style !== 'line' || !c.spliced) continue;
    api.report(c, msg('Line comment is continued onto the next line by a backslash.', '한 줄 주석이 역슬래시로 다음 줄까지 이어집니다.'));
  }
}

module.exports = [
  { meta: meta('3.1', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, name: ['Comment start sequences inside a comment', '주석 안의 주석 시작 문자열'],
    why: ['A "/*" inside a comment suggests a missing comment end, which can comment out code by accident.', '주석 안의 "/*"는 주석 끝이 빠졌다는 신호일 수 있고, 코드를 실수로 주석 처리할 수 있습니다.'],
    fix: ['Remove "/*" and "//" from inside comments (a "//" inside a line comment is fine).', '주석 안의 "/*"와 "//"를 없애세요(한 줄 주석 안의 "//"는 괜찮습니다).'] }), check: r31 },
  { meta: meta('3.2', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 2, dec: true, name: ['Line splicing in a // comment', '// 주석의 줄 이음'],
    why: ['A backslash at the end of a // comment silently turns the next line into comment.', '// 주석 끝의 역슬래시는 다음 줄을 소리 없이 주석으로 만듭니다.'],
    fix: ['Remove the trailing backslash or use a block comment.', '끝의 역슬래시를 없애거나 블록 주석을 쓰세요.'] }), check: r32 },
];
