'use strict';

// MISRA C:2012 / 2023 chapter 7: literals and constants.

const U = require('../lib/a-util');
const { cf, T, meta, msg } = U;

// number tokens of user files, outside skipped regions
function* numberTokens(unit, api, id, skipIfLines) {
  const li = U.lineInfo(unit);
  for (const [file, src] of U.userSources(unit)) {
    if (!U.firstScan(api, id, file)) continue;
    for (const t of src.tokens || []) {
      if (t.kind !== 'number') continue;
      if (li.skipped(file, t.line)) continue;
      const d = li.directive(file, t.line);
      if (d && skipIfLines && d.kind !== 'define') continue;
      let info;
      try { info = cf.lexer.classifyNumber(t.value, { lang: 'c' }); } catch (_) { continue; }
      yield [t, info];
    }
  }
}

function r71(unit, api) {
  for (const [t, info] of numberTokens(unit, api, '7.1', false)) {
    if (info.kind === 'int' && info.octal) {
      api.report(t, msg(`Octal constant '${t.value}' (decimal ${info.value}) is used.`, `8진 상수 '${t.value}'(10진 ${info.value})를 사용합니다.`));
    }
  }
}

function r72(unit, api) {
  for (const [t, info] of numberTokens(unit, api, '7.2', true)) {
    if (info.kind !== 'int' || /u/i.test(info.suffix || '')) continue;
    let ty;
    try { ty = T.integerLiteralType(info.value, info.suffix || '', info.base, unit.target); } catch (_) { continue; }
    if (!ty || !T.isUnsigned(ty, unit.target)) continue;
    api.report(t, msg(
      `Constant '${t.value}' has unsigned type '${U.typeStr(ty)}' but no 'U' suffix.`,
      `상수 '${t.value}'는 부호 없는 타입 '${U.typeStr(ty)}'인데 'U' 접미사가 없습니다.`));
  }
}

function r73(unit, api) {
  for (const [t, info] of numberTokens(unit, api, '7.3', false)) {
    if (!/l/.test(info.suffix || '')) continue;
    api.report(t, msg(`Constant '${t.value}' uses the lower-case suffix 'l', which looks like '1'.`, `상수 '${t.value}'가 '1'과 헷갈리는 소문자 접미사 'l'을 씁니다.`));
  }
}

function r74(unit, api) {
  for (const s of U.conversionSites(unit)) {
    const v = U.skip(s.value);
    if (!v || v.type !== 'StringLiteral') continue;
    const c = U.canon(s.to);
    if (!c || c.kind !== 'pointer') continue;
    if (U.isConstQ(c.to)) continue;
    const pt = U.canon(c.to);
    if (!pt || (pt.kind !== 'int' && pt.kind !== 'void')) continue;
    api.report(v, msg(
      `String literal ${U.code(unit, v, 30)} is converted to '${U.typeStr(s.to)}' (${U.siteEn(s.kind)}), which allows it to be modified.`,
      `문자열 리터럴 ${U.code(unit, v, 30)}를 '${U.typeStr(s.to)}'로 ${U.siteKo(s.kind)}해 수정이 가능해집니다.`));
  }
}

const ICM = /^(U?)INT(8|16|32|64|MAX)_C$/;
function icmExpansions(unit, api, id) {
  const out = [];
  for (const e of unit.expansions || []) {
    if (U.isBuiltin(e.file) || e.nested) continue;
    const m = ICM.exec(e.name);
    if (!m) continue;
    if (!U.firstScan(api, `${id}@${e.line}:${e.col}`, e.file)) continue;
    out.push([e, m]);
  }
  return out;
}

function r75(unit, api) {
  for (const [e, m] of icmExpansions(unit, api, '7.5')) {
    const arg = (e.args && e.args[0]) || [];
    const text = arg.map((t) => t.value).join(' ');
    let bad = null;
    if (!e.args || e.args.length !== 1 || arg.length !== 1 || arg[0].kind !== 'number') bad = ['is not a single integer literal', '하나의 정수 리터럴이 아닙니다'];
    else {
      const info = cf.lexer.classifyNumber(arg[0].value, { lang: 'c' });
      if (info.kind !== 'int') bad = ['is not an integer literal', '정수 리터럴이 아닙니다'];
      else if (info.suffix) bad = [`has a suffix '${info.suffix}'`, `접미사 '${info.suffix}'가 있습니다`];
      else {
        const bits = m[2] === 'MAX' ? 64 : Number(m[2]);
        const max = m[1] ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
        if (info.value > max) bad = [`value ${info.value} does not fit the ${bits}-bit type`, `값 ${info.value}가 ${bits}비트 타입에 맞지 않습니다`];
      }
    }
    if (!bad) continue;
    api.report(e, msg(`Argument '${text}' of ${e.name} ${bad[0]}.`, `${e.name}의 인수 '${text}'가 ${bad[1]}.`));
  }
}

function r76(unit, api) {
  for (const [e, m] of icmExpansions(unit, api, '7.6')) {
    if (m[2] !== '8' && m[2] !== '16') continue;
    api.report(e, msg(`Small integer constant macro ${e.name} is used; its result is promoted to int anyway.`, `작은 정수 상수 매크로 ${e.name}를 사용합니다. 결과는 어차피 int로 승격됩니다.`));
  }
}

module.exports = [
  { meta: meta('7.1', { cat: 'R', sev: 'MAJOR', debt: 2, dec: true, name: ['Octal constants shall not be used', '8진 상수를 사용하지 않아야 함'],
    why: ['A leading zero makes the number octal, which is easily read as decimal (010 is 8).', '앞의 0 때문에 8진수가 되어 10진수로 잘못 읽기 쉽습니다(010은 8).'],
    fix: ['Write the value in decimal or hexadecimal.', '10진수나 16진수로 쓰세요.'] }), check: r71 },
  { meta: meta('7.2', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, name: ['Unsigned constants need a "u" suffix', '부호 없는 상수에는 "u" 접미사가 필요함'],
    why: ['Without the suffix, whether a constant is signed depends on its value and on the target.', '접미사가 없으면 상수의 부호 여부가 값과 대상 환경에 따라 달라집니다.'],
    fix: ['Add a "U" suffix to constants that have an unsigned type.', '부호 없는 타입의 상수에 "U" 접미사를 붙이세요.'] }), check: r72 },
  { meta: meta('7.3', { cat: 'R', sev: 'MINOR', debt: 1, dec: true, name: ['Lower-case "l" suffix', '소문자 "l" 접미사'],
    why: ['A lower-case l is easily confused with the digit 1.', '소문자 l은 숫자 1과 헷갈리기 쉽습니다.'],
    fix: ['Use an upper-case "L".', '대문자 "L"을 쓰세요.'] }), check: r73 },
  { meta: meta('7.4', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 5, dec: true, cwe: ['CWE-758'], cert: 'STR30-C', name: ['String literal assigned to a non-const pointer', '문자열 리터럴을 const가 아닌 포인터에 대입'],
    why: ['Modifying a string literal is undefined behaviour; a non-const pointer makes that possible.', '문자열 리터럴을 수정하는 것은 미정의 동작인데, const가 아닌 포인터는 이를 가능하게 합니다.'],
    fix: ['Use a pointer to const char (or copy the literal into an array).', 'const char 포인터를 쓰거나 리터럴을 배열에 복사하세요.'] }), check: r74 },
  { meta: meta('7.5', { cat: 'M', type: 'BUG', sev: 'MAJOR', debt: 2, dec: true, amendment: 'AMD3', name: ['Integer constant macro argument has an inappropriate form', '정수 상수 매크로 인수의 형태가 부적절함'],
    why: ['The INTn_C / UINTn_C macros only work for an unsuffixed integer literal that fits the type.', 'INTn_C / UINTn_C 매크로는 타입에 맞는 접미사 없는 정수 리터럴에만 올바르게 동작합니다.'],
    fix: ['Pass a plain integer literal within range.', '범위 안의 일반 정수 리터럴을 넘기세요.'] }), check: r75 },
  { meta: meta('7.6', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, amendment: 'AMD3', name: ['Small integer constant macros shall not be used', '작은 정수 상수 매크로를 사용하지 않아야 함'],
    why: ['INT8_C, UINT8_C, INT16_C and UINT16_C produce int-sized values, which is misleading.', 'INT8_C, UINT8_C, INT16_C, UINT16_C는 int 크기 값을 만들어 오해를 부릅니다.'],
    fix: ['Use a cast to the small type or a plain constant.', '작은 타입으로의 캐스트나 일반 상수를 쓰세요.'] }), check: r76 },
];
