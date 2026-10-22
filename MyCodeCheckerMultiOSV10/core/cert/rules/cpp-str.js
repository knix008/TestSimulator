'use strict';

// SEI CERT C++ — STR: characters and strings.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cpp');
const CTR = require('./cpp-ctr');
const { M, T, cf } = U;

// leftmost operand of a `a >> b >> c` chain
function chainBase(e) {
  e = U.skip(e);
  while (e && e.type === 'BinaryExpr' && e.op === '>>') e = U.skip(e.left);
  return e;
}

function isCharBuffer(e) {
  const t = e && e.ctype && T.canonical(e.ctype);
  if (!t) return false;
  const el = t.kind === 'array' ? T.canonical(t.of) : t.kind === 'pointer' ? T.canonical(t.to) : null;
  return !!el && el.kind === 'int' && /^(char|signed char|unsigned char|wchar_t)$/.test(el.name) && !el.const;
}

const STREAM_NAMES = /^(cin|wcin)$/;
function isInputStream(e) {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'Identifier' && STREAM_NAMES.test(e.name) && (!e.qualifier || e.qualifier === 'std')) return true;
  const b = X.exprStd(e);
  return !!b && /^(istream|wistream|ifstream|wifstream|fstream|wfstream|istringstream|wistringstream|stringstream|wstringstream|basic_istream|iostream)$/.test(b);
}

const isNullish = (e) => {
  e = U.strip(e);
  if (!e) return false;
  if (U.isNullConst(e)) return true;
  return !!(e.loc && e.loc.macro === 'NULL');
};

module.exports = [
  rule('STR50-CPP', {
    risk: 'HLM', cwe: ['CWE-120', 'CWE-787'], sec: true, approx: true,
    name: ['Guarantee that storage for strings has sufficient space for character data and the null terminator', '문자열 저장 공간이 문자 데이터와 널 종료 문자를 담기에 충분하도록 보장하세요'],
    why: ['Extracting into a character array with operator>> reads a whole word of any length unless a field width is set; long input overflows the buffer.', 'operator>> 로 문자 배열에 추출하면 필드 폭을 지정하지 않는 한 길이 제한 없이 단어를 읽어 긴 입력이 버퍼를 넘칩니다.'],
    fix: ['Read into a std::string, or set the width first: std::cin.width(sizeof buf) or std::cin >> std::setw(sizeof buf) >> buf.', 'std::string 으로 읽거나 먼저 폭을 지정하세요: std::cin.width(sizeof buf) 또는 std::cin >> std::setw(sizeof buf) >> buf.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op !== '>>') continue;
        const r = U.strip(b.right);
        if (!r || !isCharBuffer(r)) continue;
        const base = chainBase(b);
        if (!isInputStream(base)) continue;
        // `>> std::setw(n) >>` right before this operand
        const l = U.skip(b.left);
        if (l && l.type === 'BinaryExpr' && l.op === '>>') {
          const w = U.strip(l.right);
          if (w && w.type === 'CallExpr' && U.callName(w) === 'setw') continue;
        }
        // stream.width(n) earlier in the function
        const fn = U.enclosingFn(b);
        const bk = U.key(unit, base);
        const widthSet = fn && cf.findFirst(fn.body || fn, (n) => n.type === 'CallExpr' && n.loc.start < b.loc.start && U.callName(n) === 'width' && n.args.length === 1 && U.key(unit, X.memberObj(n)) === bk);
        if (widthSet) continue;
        api.report(b, M(`'${U.src(unit, base).trim()} >> ${U.src(unit, r).trim()}' extracts into a character buffer without a field width; long input overflows it.`, `'${U.src(unit, base).trim()} >> ${U.src(unit, r).trim()}' 가 필드 폭 없이 문자 버퍼로 추출하여 긴 입력이 버퍼를 넘칩니다.`));
      }
    },
  }),

  rule('STR51-CPP', {
    risk: 'HLM', cwe: ['CWE-476', 'CWE-690'], sec: true, approx: true,
    name: ['Do not attempt to create a std::string from a null pointer', '널 포인터로 std::string 을 만들지 마세요'],
    why: ['Constructing or assigning a std::string from a null const char * is undefined behavior; getenv() and similar functions return null when the value is missing.', '널 const char * 로 std::string 을 생성하거나 대입하면 정의되지 않은 동작입니다. getenv() 등은 값이 없을 때 널을 반환합니다.'],
    fix: ['Check the pointer before creating the string: const char *v = std::getenv("X"); std::string s = v ? v : "";', '문자열을 만들기 전에 포인터를 확인하세요: const char *v = std::getenv("X"); std::string s = v ? v : "";'],
  }, {
    check(unit, api) {
      const NULLY = new Set(['getenv', 'secure_getenv', '_getenv', 'strchr', 'strrchr', 'strstr', 'strpbrk', 'setlocale', 'getlogin', 'ttyname', 'tmpnam', 'readline']);
      const fromNullable = (e, at) => {
        e = U.strip(e);
        if (!e) return null;
        if (isNullish(e)) return M('a null pointer', '널 포인터');
        if (e.type === 'CallExpr' && U.isLib(e, NULLY)) return M(`${U.callName(e)}(), which can return null`, `널을 반환할 수 있는 ${U.callName(e)}()`);
        const s = U.idSym(e);
        if (s && (s.kind === 'variable' || s.kind === 'parameter')) {
          const vals = X.assignedValues(s).filter((v) => v.node.loc.start < at.loc.start);
          const last = vals[vals.length - 1];
          const lv = last && U.strip(last.value);
          if (lv && lv.type === 'CallExpr' && U.isLib(lv, NULLY)) {
            const tested = (s.uses || []).some((u) => u.loc.start > last.node.loc.start && u.loc.start < at.loc.start && (U.inCondition(u) || cf.enclosing(u, 'ConditionalExpr')));
            if (!tested && !cf.enclosing(at, 'ConditionalExpr')) return M(`'${s.name}' from ${U.callName(lv)}(), which can be null and is not checked`, `확인하지 않은, 널일 수 있는 ${U.callName(lv)}() 결과 '${s.name}'`);
          }
        }
        return null;
      };
      const rep = (where, name, why) => api.report(where, M(`std::string '${name}' is created from ${why.en}.`, `std::string '${name}' 가 ${why.ko} 로 만들어집니다.`));
      for (const v of U.nodes(unit, 'VarDecl')) {
        if (!v.init) continue;
        const b = X.stdBare(U.declTypeName(v));
        if (!X.isString(b) && b !== 'string_view') continue;
        const t = v.ctype && T.canonical(v.ctype);
        if (t && (t.kind === 'pointer' || t.kind === 'reference' && false)) continue;
        const args = X.initArgs(v.init);
        if (args.length !== 1) continue;
        const why = fromNullable(args[0], v);
        if (why) rep(v, v.name, why);
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op !== '=' && a.op !== '+=') continue;
        const s = U.idSym(a.left);
        if (!s || !X.isString(X.symStd(s))) continue;
        const why = fromNullable(a.right, a);
        if (why) rep(a, s.name, why);
      }
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (c.kind !== 'functional' || !c.arg || !X.isString(X.exprStd(c))) continue;
        const why = fromNullable(c.arg, c);
        if (why) rep(c, U.src(unit, c).trim(), why);
      }
    },
  }),

  rule('STR52-CPP', {
    risk: 'HPH', cwe: ['CWE-416', 'CWE-664'], sec: true, approx: true, deep: 'absint:INVALIDATED_ITERATOR',
    name: ['Use valid references, pointers, and iterators to reference elements of a basic_string', 'basic_string 요소는 유효한 참조, 포인터, 반복자로 참조하세요'],
    why: ['Appending, inserting, erasing or assigning to a std::string can reallocate its buffer; iterators, references and c_str()/data() pointers taken before the call then dangle.', 'std::string 에 덧붙이기, 삽입, 삭제, 대입을 하면 버퍼가 재할당될 수 있어 호출 전에 얻은 반복자, 참조, c_str()/data() 포인터가 댕글링됩니다.'],
    fix: ['Re-obtain the iterator or pointer after modifying the string, or work with indices.', '문자열을 수정한 뒤 반복자나 포인터를 다시 얻거나 인덱스를 사용하세요.'],
  }, {
    check(unit, api) {
      CTR.invalidationCheck(unit, api, true);
    },
  }),

  rule('STR53-CPP', {
    risk: 'HUM', cwe: ['CWE-119', 'CWE-125', 'CWE-787'], sec: true, approx: true,
    name: ['Range check element access', '요소 접근의 범위를 확인하세요'],
    why: ['std::string::operator[] does not check its index; an index past size() reads or writes outside the string.', 'std::string::operator[] 는 인덱스를 검사하지 않아 size() 를 넘는 인덱스는 문자열 밖을 읽거나 씁니다.'],
    fix: ['Check the index against size() first, or use at(), which throws std::out_of_range.', '먼저 인덱스를 size() 와 비교하거나 std::out_of_range 를 던지는 at() 을 사용하세요.'],
  }, {
    check(unit, api) {
      for (const ix of U.nodes(unit, 'IndexExpr')) {
        const cs = U.idSym(ix.object);
        if (!cs || !X.isString(X.symStd(cs))) continue;
        const fn = U.enclosingFn(ix);
        const k = U.constInt(unit, ix.index);
        if (k != null) {
          const n = CTR.knownSize(unit, cs);
          const changed = (cs.uses || []).some((u) => { const p = U.parent(u); return p && (p.type === 'MemberExpr' && U.pkey(u) === 'object' && !/^(size|length|c_str|data|at|empty|begin|end|find)$/.test(p.member) || p.type === 'AssignExpr' && U.pkey(u) === 'left' || p.type === 'CallExpr' && p.callee !== u); });
          if (n != null && !changed && (k < 0n || Number(k) > n || (Number(k) === n && isWrite(ix)))) api.report(ix, M(`Index ${k} is out of range for string '${cs.name}' of length ${n}.`, `인덱스 ${k} 는 길이 ${n} 인 문자열 '${cs.name}' 의 범위를 벗어납니다.`));
          continue;
        }
        const is = U.idSym(ix.index);
        if (!fn || fn.type !== 'FunctionDecl' || !is || is.kind !== 'parameter') continue;
        if (!(fn.params || []).some((p) => p.symbol === is)) continue;
        const it = is.type && T.canonical(is.type);
        if (!it || it.kind !== 'int') continue;
        if (X.testedIn(fn.body, is)) continue;
        api.report(ix, M(`'${cs.name}[${is.name}]' uses parameter '${is.name}' as an index without checking it against ${cs.name}.size(); use at() or check the range.`, `'${cs.name}[${is.name}]' 가 매개변수 '${is.name}' 를 ${cs.name}.size() 와 비교하지 않고 인덱스로 사용합니다. at() 을 쓰거나 범위를 확인하세요.`));
      }
    },
  }),
];

function isWrite(n) {
  const p = U.parent(n);
  return !!p && (p.type === 'AssignExpr' && U.pkey(n) === 'left' || p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--'));
}
