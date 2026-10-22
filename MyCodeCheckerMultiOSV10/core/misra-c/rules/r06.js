'use strict';

// MISRA C:2012 / 2023 chapter 6: types (bit-fields).

const U = require('../lib/a-util');
const { cf, T, meta, msg } = U;

// How the type of a bit-field was written: 'explicit' (signed/unsigned/_Bool), 'plain', 'enum', 'other'
function writtenKind(typeSpec, depth = 0) {
  if (!typeSpec || depth > 20) return 'plain';
  if (typeSpec.type === 'BuiltinType') {
    const n = typeSpec.names || [];
    if (n.includes('_Bool') || n.includes('bool')) return 'explicit';
    if (n.includes('signed') || n.includes('unsigned')) return 'explicit';
    if (n.some((x) => x === 'float' || x === 'double')) return 'other';
    return 'plain';
  }
  if (typeSpec.type === 'EnumDecl') return 'enum';
  if (typeSpec.type === 'NamedType') {
    const s = typeSpec.symbol;
    const d = s && (s.decls || []).find((x) => x.type === 'TypedefDecl');
    if (d && d.specs) return writtenKind(d.specs.typeSpec, depth + 1);
    const c = U.canon(typeSpec.ctype || (s && s.type));
    if (c && c.kind === 'int') return c.name === 'bool' || c.name.startsWith('unsigned') || c.name === 'signed char' ? 'explicit' : 'plain';
    if (c && c.kind === 'enum') return 'enum';
    return 'other';
  }
  return 'other';
}

function bitFields(unit) {
  return U.nodes(unit, 'FieldDecl').filter((f) => f.bitWidth);
}

function r61(unit, api) {
  for (const f of bitFields(unit)) {
    const k = writtenKind(f.specs && f.specs.typeSpec);
    if (k === 'explicit') continue;
    const why = k === 'enum' ? ['an enumeration type', '열거 타입'] : k === 'plain' ? ['a type whose signedness is implementation-defined for bit-fields', '비트 필드에서 부호가 구현 정의인 타입'] : ['an inappropriate type', '부적절한 타입'];
    api.report(f.nameLoc || f.loc, msg(
      `Bit-field '${f.name || '<unnamed>'}' is declared with ${why[0]} ('${U.typeStr(f.ctype)}'); use signed int, unsigned int or _Bool.`,
      `비트 필드 '${f.name || '<이름 없음>'}'를 ${why[1]}('${U.typeStr(f.ctype)}')으로 선언했습니다. signed int, unsigned int, _Bool을 쓰세요.`));
  }
}

function r62(unit, api) {
  for (const f of bitFields(unit)) {
    if (!f.name || f.bitWidthValue !== 1) continue;
    const c = U.canon(f.ctype);
    if (!c || c.kind !== 'int' || c.name === 'bool') continue;
    if (!T.isSigned(c, unit.target)) continue;
    api.report(f.nameLoc || f.loc, msg(
      `Single-bit bit-field '${f.name}' has signed type '${U.typeStr(f.ctype)}' and can only hold 0 and -1.`,
      `1비트 비트 필드 '${f.name}'가 부호 있는 타입 '${U.typeStr(f.ctype)}'이라 0과 -1만 담을 수 있습니다.`));
  }
}

function r63(unit, api) {
  for (const f of bitFields(unit)) {
    const rec = cf.enclosing(f, 'RecordDecl');
    if (!rec || rec.tag !== 'union') continue;
    api.report(f.nameLoc || f.loc, msg(
      `Bit-field '${f.name || '<unnamed>'}' is a member of union '${rec.name || '<anonymous>'}'.`,
      `비트 필드 '${f.name || '<이름 없음>'}'가 공용체 '${rec.name || '<익명>'}'의 멤버입니다.`));
  }
}

module.exports = [
  { meta: meta('6.1', { cat: 'R', sev: 'MAJOR', debt: 5, dec: true, cwe: ['CWE-758'], cert: 'INT12-C', name: ['Bit-fields shall use an appropriate type', '비트 필드는 적절한 타입을 사용해야 함'],
    why: ['Whether a plain int bit-field is signed is implementation-defined, and other types may not be supported.', '일반 int 비트 필드의 부호는 구현 정의이며, 다른 타입은 지원되지 않을 수 있습니다.'],
    fix: ['Declare bit-fields as signed int, unsigned int or _Bool (or explicitly signed/unsigned typedefs).', '비트 필드를 signed int, unsigned int, _Bool(또는 부호가 명시된 typedef)로 선언하세요.'] }), check: r61 },
  { meta: meta('6.2', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 5, dec: true, name: ['Single-bit named bit-field of signed type', '부호 있는 1비트 이름 있는 비트 필드'],
    why: ['A one-bit signed field holds only 0 and -1, so comparing it with 1 never succeeds.', '1비트 부호 있는 필드는 0과 -1만 담아 1과 비교하면 절대 참이 되지 않습니다.'],
    fix: ['Make single-bit fields unsigned.', '1비트 필드는 부호 없는 타입으로 만드세요.'] }), check: r62 },
  { meta: meta('6.3', { cat: 'R', sev: 'MAJOR', debt: 5, dec: true, amendment: 'AMD3', name: ['Bit-field declared in a union', '공용체 안의 비트 필드'],
    why: ['The layout of bit-fields in a union is implementation-defined, so accessing them through other members is not portable.', '공용체 안 비트 필드의 배치는 구현 정의라 다른 멤버를 통한 접근은 이식성이 없습니다.'],
    fix: ['Wrap the bit-fields in a structure, or avoid them in unions.', '비트 필드를 구조체로 감싸거나 공용체에서 쓰지 마세요.'] }), check: r63 },
];
