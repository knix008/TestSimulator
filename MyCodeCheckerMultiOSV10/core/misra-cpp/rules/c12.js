'use strict';

// MISRA C++:2023 chapter 12 — classes (bit-fields, unions).

const { R, M } = require('../lib/meta');
const U = require('../lib/util');

const bitFields = (unit) => U.ix(unit).get('FieldDecl').filter((f) => f.bitWidth);

module.exports = [
  R({
    id: '12.2.1', cat: 'Advisory', dec: true, autosar: 'A9-6-2', sev: 'MINOR', debt: 10,
    name: ['Bit-fields should not be declared', '비트 필드는 선언하지 않아야 합니다'],
    why: ['The layout of bit-fields is largely implementation-defined.', '비트 필드의 배치는 대부분 구현 정의입니다.'],
    fix: ['Use ordinary members and explicit masks/shifts where a layout is needed.', '일반 멤버를 쓰고, 배치가 필요하면 명시적인 마스크/시프트를 쓰세요.'],
    check(unit, api) {
      for (const f of bitFields(unit)) api.report(f, M(`'${f.name || '<unnamed>'}' is a bit-field.`, `'${f.name || '<이름 없음>'}' 가 비트 필드입니다.`));
    },
  }),
  R({
    id: '12.2.2', cat: 'Required', dec: true, autosar: 'A9-6-1', sev: 'MAJOR', debt: 5,
    name: ['A bit-field shall have an appropriate type', '비트 필드는 알맞은 타입이어야 합니다'],
    why: ['Character types and enumerations without a fixed underlying type make the signedness and range of a bit-field unclear.', '문자 타입이나 기반 타입이 고정되지 않은 열거형은 비트 필드의 부호와 범위를 모호하게 합니다.'],
    fix: ['Use bool, an explicitly signed or unsigned integer type, or an enumeration with a fixed underlying type.', 'bool, 명시적인 signed/unsigned 정수 타입, 기반 타입이 고정된 열거형을 쓰세요.'],
    check(unit, api) {
      for (const f of bitFields(unit)) {
        const c = U.canon(f.ctype || U.T.T.unknown);
        let bad = null;
        if (c.kind === 'int' && U.CHAR_NAMES.has(c.name)) bad = c.name;
        else if (c.kind === 'enum' && !c.fixed) bad = `enum ${c.name || ''}`.trim();
        else if (c.kind !== 'int' && c.kind !== 'enum' && !U.unknownT(c)) bad = U.tstr(f.ctype);
        if (bad) api.report(f, M(`Bit-field '${f.name || '<unnamed>'}' has the inappropriate type '${bad}'.`, `비트 필드 '${f.name || '<이름 없음>'}' 의 타입 '${bad}' 가 알맞지 않습니다.`));
      }
    },
  }),
  R({
    id: '12.2.3', cat: 'Required', dec: true, sev: 'MAJOR', debt: 2,
    name: ['A named bit-field with signed integer type shall not have a length of one bit', '부호 있는 정수 타입의 이름 있는 비트 필드는 길이가 1비트이면 안 됩니다'],
    why: ['A one-bit signed field can only hold 0 and -1, which surprises most readers.', '1비트 부호 있는 필드는 0 과 -1 만 담을 수 있어 대부분의 독자를 놀라게 합니다.'],
    fix: ['Use an unsigned type or bool, or widen the field.', '부호 없는 타입이나 bool 을 쓰거나 필드를 넓히세요.'],
    check(unit, api) {
      for (const f of bitFields(unit)) {
        if (!f.name || f.bitWidthValue !== 1) continue;
        if (U.numCat(f.ctype, unit.target) === 'signed') api.report(f, M(`Signed bit-field '${f.name}' is only one bit wide.`, `부호 있는 비트 필드 '${f.name}' 의 폭이 1비트입니다.`));
      }
    },
  }),
  R({
    id: '12.3.1', cat: 'Required', dec: true, autosar: 'A9-5-1', type: 'BUG', cwe: 'CWE-843', sev: 'MAJOR', debt: 15,
    name: ['The union keyword shall not be used', 'union 키워드는 쓰면 안 됩니다'],
    why: ['Reading a member other than the last one written is undefined behaviour, and nothing tracks the active member.', '마지막으로 쓴 멤버가 아닌 멤버를 읽으면 정의되지 않은 동작이고, 활성 멤버를 추적하는 장치도 없습니다.'],
    fix: ['Use std::variant or separate members.', 'std::variant 나 별도 멤버를 쓰세요.'],
    check(unit, api) {
      for (const r of U.ix(unit).get('RecordDecl')) {
        if (r.tag === 'union') api.report(r, M(`The union '${r.name || '<anonymous>'}' is used.`, `union '${r.name || '<익명>'}' 을 씁니다.`));
      }
    },
  }),
];
