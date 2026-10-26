'use strict';

// AUTOSAR C++14 chapter 1 — general (language standard conformance).

const { D } = require('../lib/delegate');

module.exports = [
  D('A1-1-1', ['4.1.1', '4.1.2'], {
    cat: 'Required', enf: 'automated',
    name: ['All code shall conform to ISO/IEC 14882:2014 without language extensions or deprecated features', '모든 코드는 언어 확장이나 폐기 예정 기능 없이 ISO/IEC 14882:2014 를 따라야 합니다'],
    why: ['Compiler extensions and deprecated features make the code non-portable and their behaviour is not covered by the standard.', '컴파일러 확장과 폐기 예정 기능은 이식성을 떨어뜨리고 그 동작이 표준으로 보장되지 않습니다.'],
    fix: ['Rewrite the construct with standard C++14 features.', '표준 C++14 기능으로 다시 작성하세요.'],
  }),
];
