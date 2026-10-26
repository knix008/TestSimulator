'use strict';

// MISRA C:2004 chapter 6 — types; chapter 7 — constants.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');
const L = require('../../lib/lex');
const CH = require('../../lib/chars');

const { T } = U;

function bitFieldTypes(unit, api) {
  for (const f of S.bitFields(unit)) {
    const c = f.ctype && T.canonical(f.ctype);
    const names = S.specNames(f);
    let ok = false;
    if (c && c.kind === 'int' && (c.name === 'int' || c.name === 'unsigned int')) {
      ok = names ? (names.includes('signed') || names.includes('unsigned')) : true;
    }
    if (!ok) api.report(f.nameLoc || f, M(`Bit-field '${f.name || '<unnamed>'}' is not declared as signed int or unsigned int.`, `비트 필드 '${f.name || '<이름 없음>'}'가 signed int 또는 unsigned int로 선언되지 않았습니다.`));
  }
}

module.exports = [
  C04({
    id: '6.1', cat: 'R', dec: true, c2012: '10.1',
    name: ['Plain char shall only hold character values', '일반 char는 문자 값만 저장해야 합니다'],
    why: ['The signedness of plain char is implementation-defined, so numeric use is not portable.', '일반 char의 부호 여부는 구현 정의이므로 숫자로 쓰면 이식성이 없습니다.'],
    fix: ['Use signed char or unsigned char (or a typedef of them) for small numbers.', '작은 숫자에는 signed char나 unsigned char(또는 그 typedef)를 사용하세요.'],
    check: CH.plainCharMisuse,
  }),
  C04({
    id: '6.2', cat: 'R', dec: true,
    name: ['Signed and unsigned char shall only hold numeric values', 'signed char와 unsigned char는 숫자 값만 저장해야 합니다'],
    why: ['Character data in signed or unsigned char hides the intent and mixes the two uses.', 'signed 또는 unsigned char에 문자 데이터를 넣으면 의도가 숨고 두 용도가 섞입니다.'],
    fix: ['Use plain char for characters.', '문자에는 일반 char를 사용하세요.'],
    check: CH.numericCharMisuse,
  }),
  C04({
    id: '6.3', cat: 'A', dec: true, c2012: 'dir-4.6',
    name: ['Typedefs showing size and signedness should replace basic types', '기본 형식 대신 크기와 부호를 나타내는 typedef를 사용해야 합니다'],
    why: ['The size of int, short and long varies between targets.', 'int, short, long의 크기는 대상마다 다릅니다.'],
    fix: ['Use types such as int32_t or uint16_t.', 'int32_t나 uint16_t 같은 형식을 사용하세요.'],
    reuse: 'misra-c:dir-4.6',
  }),
  C04({
    id: '6.4', cat: 'R', dec: true, c2012: '6.1',
    name: ['Bit-fields shall be signed int or unsigned int', '비트 필드는 signed int 또는 unsigned int여야 합니다'],
    why: ['Other bit-field types and plain int bit-fields have implementation-defined behaviour.', '다른 비트 필드 형식과 일반 int 비트 필드는 구현 정의 동작을 합니다.'],
    fix: ['Declare the bit-field as unsigned int or signed int.', '비트 필드를 unsigned int 또는 signed int로 선언하세요.'],
    check: bitFieldTypes,
  }),
  C04({
    id: '6.5', cat: 'R', dec: true, c2012: '6.2',
    name: ['A signed bit-field shall be at least 2 bits wide', '부호 있는 비트 필드는 2비트 이상이어야 합니다'],
    why: ['A 1-bit signed field can only hold 0 and -1, which is rarely intended.', '1비트 부호 있는 필드는 0과 -1만 담을 수 있어 의도와 다르기 쉽습니다.'],
    fix: ['Make the field unsigned or wider.', '필드를 부호 없게 하거나 더 넓게 하세요.'],
    reuse: 'misra-c:6.2',
  }),
  C04({
    id: '7.1', cat: 'R', dec: true, c2012: '7.1',
    name: ['Octal constants and octal escapes shall not be used', '8진 상수와 8진 이스케이프를 사용하지 않아야 합니다'],
    why: ['A leading zero silently makes a number octal.', '앞의 0 하나로 숫자가 조용히 8진수가 됩니다.'],
    fix: ['Write the value in decimal or hexadecimal; \\0 is allowed.', '값을 10진수나 16진수로 쓰세요. \\0은 허용됩니다.'],
    check: L.octals,
  }),
];
