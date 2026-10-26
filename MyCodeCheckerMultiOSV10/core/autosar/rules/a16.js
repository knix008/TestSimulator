'use strict';

// AUTOSAR C++14 chapter 16 — preprocessing directives and MISRA C++:2008
// M16 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');

const userDirectives = (unit) => (unit.directives || []).filter((d) => !U.isBuiltin(d.file));

// Line ranges of namespace bodies, functions and classes per file.
function scopedRanges(unit) {
  return U.memo(unit, 'autosar.scopedRanges', () => {
    const out = [];
    for (const n of U.ix(unit).get('NamespaceDecl', 'FunctionDecl', 'RecordDecl')) {
      if (n.type === 'FunctionDecl' && !n.body) continue;
      if (n.type === 'RecordDecl' && !n.members) continue;
      out.push({ file: n.loc.file, start: n.loc.line, end: n.loc.endLine || n.loc.line, kind: n.type });
    }
    return out;
  });
}

module.exports = [
  D('A16-0-1', ['19.0.2'], {
    name: ['The preprocessor shall only be used for file inclusion, include guards and conditional compilation', '전처리기는 파일 포함, 포함 가드, 조건부 컴파일에만 써야 합니다'],
  }),
  D('A16-2-1', ['19.2.3'], { name: ["The ', \", /*, //, \\ characters shall not occur in a header file name or in an #include directive", "헤더 파일 이름이나 #include 지시문에 ', \", /*, //, \\ 가 있으면 안 됩니다"] }),
  A({
    id: 'A16-6-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['#error directive shall not be used', '#error 지시문은 쓰면 안 됩니다'],
    why: ['Configuration checks are better expressed with static_assert, which is type-aware and part of the language.', '설정 검사는 형식을 알고 언어의 일부인 static_assert 로 표현하는 편이 낫습니다.'],
    fix: ['Replace #error with static_assert.', '#error 를 static_assert 로 바꾸세요.'],
    check(unit, api) {
      for (const d of userDirectives(unit)) if (d.kind === 'error') api.report(d, M('The #error directive is used.', '#error 지시문을 씁니다.'));
    },
  }),
  D('A16-7-1', ['19.6.1'], { cat: 'Required', name: ['The #pragma directive shall not be used', '#pragma 지시문은 쓰면 안 됩니다'] }),
  // ------------------------------------------------------- MISRA C++:2008 M16
  D('M16-0-1', ['19.0.3'], { cat: 'Required' }),
  A({
    id: 'M16-0-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Macros shall only be #define\'d or #undef\'d in the global namespace', '매크로는 전역 네임스페이스에서만 #define/#undef 해야 합니다'],
    why: ['Macros ignore scopes, so defining one inside a namespace, class or function suggests a scoping that does not exist.', '매크로는 범위를 무시하므로 네임스페이스, 클래스, 함수 안에서 정의하면 존재하지 않는 범위가 있는 듯 보입니다.'],
    fix: ['Move the #define / #undef to file scope.', '#define / #undef 를 파일 범위로 옮기세요.'],
    check(unit, api) {
      const ranges = scopedRanges(unit);
      for (const d of userDirectives(unit)) {
        if (d.kind !== 'define' && d.kind !== 'undef') continue;
        const inside = ranges.find((r) => r.file === d.file && d.line > r.start && d.line < r.end);
        if (inside) api.report(d, M(`The macro '${d.macro || '?'}' is ${d.kind === 'define' ? 'defined' : 'undefined'} inside a ${inside.kind === 'NamespaceDecl' ? 'namespace' : inside.kind === 'RecordDecl' ? 'class' : 'function'}.`, `매크로 '${d.macro || '?'}' 를 ${inside.kind === 'NamespaceDecl' ? '네임스페이스' : inside.kind === 'RecordDecl' ? '클래스' : '함수'} 안에서 ${d.kind === 'define' ? '정의' : '해제'}합니다.`));
      }
    },
  }),
  D('M16-0-5', ['19.3.5']),
  D('M16-0-6', ['19.3.4']),
  D('M16-0-7', ['19.1.3']),
  D('M16-0-8', ['19.0.1']),
  D('M16-1-1', ['19.1.1']),
  D('M16-1-2', ['19.1.2']),
  D('M16-2-3', ['19.2.1']),
  A({
    id: 'M16-3-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['There shall be at most one occurrence of the # or ## operators in a single macro definition', '하나의 매크로 정의에는 # 이나 ## 연산자가 최대 한 번만 있어야 합니다'],
    why: ['The evaluation order of several # and ## operators is unspecified.', '여러 # 과 ## 연산자의 평가 순서는 정해져 있지 않습니다.'],
    fix: ['Split the macro so each uses at most one # or ##.', '매크로를 나누어 각각 # 이나 ## 를 최대 한 번만 쓰세요.'],
    check(unit, api) {
      for (const m of unit.macros || []) {
        if (U.isBuiltin(m.file) || m.predefined || m.commandLine) continue;
        const body = m.body || [];
        let n = 0;
        for (let i = 0; i < body.length; i++) {
          const t = body[i];
          if (t.kind !== 'punct') continue;
          if (t.value === '##') n++;
          else if (t.value === '#' && m.kind === 'function') n++;
        }
        if (n > 1) api.report({ file: m.file, line: m.line, col: m.col }, M(`The macro '${m.name}' uses # or ## ${n} times.`, `매크로 '${m.name}' 가 # 이나 ## 를 ${n}번 씁니다.`));
      }
    },
  }),
  D('M16-3-2', ['19.3.1']),
];
