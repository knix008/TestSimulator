'use strict';

// SEI CERT C — STR: characters and strings.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const F = require('../lib/fmt');
const { M, T } = U;

const MODIFYING = new Set(['strcpy', 'strncpy', 'strcat', 'strncat', 'strtok', 'memset', 'memcpy', 'memmove', 'sprintf', 'snprintf', 'gets', 'fgets', 'strerror_r', 'wcscpy', 'wcscat', 'wcstok']);

function arraySize(t) {
  const c = U.canon(t);
  return c && c.kind === 'array' && typeof c.size === 'number' ? c.size : null;
}

function isPlainCharPtr(t) {
  const c = U.canon(t);
  if (!c || c.kind !== 'pointer') return false;
  const to = T.canonical(c.to);
  return !!to && T.isCharType(to) && !to.const;
}

function charKind(t) {
  const c = U.canon(t);
  if (!c) return null;
  const el = c.kind === 'pointer' ? T.canonical(c.to) : c.kind === 'array' ? T.canonical(c.of) : null;
  if (!el || el.kind !== 'int') return null;
  if (el.name === 'char' || el.name === 'signed char' || el.name === 'unsigned char') return 'narrow';
  if (el.name === 'wchar_t') return 'wide';
  // wchar_t through a typedef on targets where it is int
  const raw = c.kind === 'pointer' ? c.to : c.of;
  if (raw && raw.kind === 'typedef' && raw.name === 'wchar_t') return 'wide';
  return null;
}

// strlen(src) / sizeof compared before the copy (in an enclosing condition or earlier in the function).
function lengthChecked(unit, call, srcArg) {
  const k = U.key(unit, srcArg);
  if (!k) return false;
  const fn = U.enclosingFn(call);
  if (!fn) return false;
  for (const l of U.libCallsIn(fn.body || fn, new Set(['strlen', 'strnlen', 'wcslen']))) {
    if (l.loc.start < call.loc.start && U.key(unit, l.args[0]) === k) return true;
  }
  return false;
}

const CTYPE = new Set(['isalnum', 'isalpha', 'isascii', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'toupper', 'tolower']);

const NARROW_FNS = new Set(['strlen', 'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp', 'strchr', 'strrchr', 'strstr', 'strdup', 'puts', 'fputs', 'atoi', 'atol', 'strtol', 'strtoul']);
const WIDE_FNS = new Set(['wcslen', 'wcscpy', 'wcsncpy', 'wcscat', 'wcsncat', 'wcscmp', 'wcsncmp', 'wcschr', 'wcsrchr', 'wcsstr', 'wcsdup', 'fputws', 'wcstol', 'wcstoul']);

module.exports = [
  rule('STR30-C', {
    risk: 'LLL', cwe: ['CWE-758'], approx: true,
    name: ['Do not attempt to modify string literals', '문자열 리터럴을 수정하지 마세요'],
    why: ['String literals may live in read-only memory; writing to one is undefined behavior and usually crashes.', '문자열 리터럴은 읽기 전용 메모리에 있을 수 있어 수정하면 정의되지 않은 동작이며 보통 충돌합니다.'],
    fix: ['Copy the literal into a char array (char s[] = "...") or point to it with const char *.', '리터럴을 char 배열(char s[] = "...")로 복사하거나 const char * 로 가리키세요.'],
  }, {
    check(unit, api) {
      // pointers initialised with / assigned a literal
      const litPtr = new Map();
      for (const d of U.nodes(unit, 'VarDecl')) {
        if (d.init && U.strLit(d.init) != null && isPlainCharPtr(d.ctype)) litPtr.set(d.symbol, d);
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op === '=' && U.strLit(a.right) != null) { const s = U.idSym(a.left); if (s && isPlainCharPtr(s.type)) litPtr.set(s, a); }
      }
      const isLitTarget = (e) => {
        e = U.strip(e);
        if (!e) return null;
        if (e.type === 'StringLiteral') return e;
        const s = U.idSym(e);
        return s && litPtr.has(s) ? e : null;
      };
      for (const a of U.nodes(unit, ['AssignExpr', 'UnaryExpr'])) {
        let target = a.type === 'AssignExpr' ? U.strip(a.left) : (a.op === '++' || a.op === '--') ? U.strip(a.arg) : null;
        if (!target) continue;
        let base = null;
        if (target.type === 'IndexExpr') base = target.object;
        else if (target.type === 'UnaryExpr' && target.op === '*') {
          base = U.strip(target.arg);
          if (base && base.type === 'BinaryExpr' && (base.op === '+' || base.op === '-')) base = base.left;
        }
        const hit = base && isLitTarget(base);
        if (hit) api.report(a, M(`Write through '${U.src(unit, hit)}', which points to a string literal.`, `문자열 리터럴을 가리키는 '${U.src(unit, hit)}' 를 통해 값을 씁니다.`));
      }
      for (const c of U.libCalls(unit, MODIFYING)) {
        const hit = isLitTarget(c.args[0]);
        if (hit) api.report(c, M(`${U.callName(c)}() modifies '${U.src(unit, hit)}', which is a string literal.`, `${U.callName(c)}() 가 문자열 리터럴인 '${U.src(unit, hit)}' 를 수정합니다.`));
      }
    },
  }),

  rule('STR31-C', {
    risk: 'HLM', cwe: ['CWE-120', 'CWE-787', 'CWE-119'], sec: true, approx: true, deep: 'absint:OVERRUN', checker: 'STRING_OVERFLOW',
    name: ['Guarantee that storage for strings has sufficient space for character data and the null terminator', '문자열 저장 공간이 문자와 널 종료 문자를 담기에 충분하도록 보장하세요'],
    why: ['Unbounded string copies (gets, strcpy, strcat, sprintf, %s without width) overflow the destination buffer when the input is longer than expected; this is the classic stack-smashing vulnerability.', '길이 제한 없는 문자열 복사(gets, strcpy, strcat, sprintf, 폭 없는 %s)는 입력이 길면 대상 버퍼를 넘어 씁니다. 대표적인 스택 오버플로 취약점입니다.'],
    fix: ['Use bounded functions (fgets, snprintf, strncpy + explicit terminator, strlcpy) with the destination size, or width-limited %Ns conversions.', '대상 크기를 넘기는 함수(fgets, snprintf, strncpy+종료 문자, strlcpy)나 폭이 지정된 %Ns 를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['gets', '_getws', 'getws']))) {
        api.report(c, M(`${U.callName(c)}() cannot limit the input length; use fgets() with the buffer size.`, `${U.callName(c)}() 는 입력 길이를 제한할 수 없습니다. 버퍼 크기와 함께 fgets() 를 사용하세요.`));
      }
      for (const c of U.libCalls(unit, new Set(['strcpy', 'strcat', 'wcscpy', 'wcscat', 'lstrcpy', 'lstrcat', 'stpcpy']))) {
        const dst = U.arg(c, 0), s = U.strLit(c.args[1]);
        const size = arraySize(dst && dst.ctype);
        if (s != null) {
          if (size != null && s.length + 1 > size) {
            api.report(c, M(`${U.callName(c)}() copies ${s.length + 1} bytes into '${U.src(unit, dst)}' of ${size} bytes.`, `${U.callName(c)}() 가 ${size} 바이트인 '${U.src(unit, dst)}' 에 ${s.length + 1} 바이트를 복사합니다.`));
          }
          continue;
        }
        if (lengthChecked(unit, c, c.args[1])) continue;
        api.report(c, M(`${U.callName(c)}() into '${U.src(unit, dst)}' is unbounded; the source length is not checked against the destination size.`, `'${U.src(unit, dst)}' 로의 ${U.callName(c)}() 는 길이 제한이 없어 원본 길이를 대상 크기와 비교하지 않습니다.`));
      }
      for (const c of U.libCalls(unit, new Set(['sprintf', 'vsprintf', 'swprintf_unsafe']))) {
        const fmt = U.strLit(c.args[1]);
        const dst = U.arg(c, 0);
        const size = arraySize(dst && dst.ctype);
        const max = F.maxLen(fmt);
        if (max !== Infinity && (size == null || max + 1 <= size)) continue;
        if (size == null && fmt != null && U.callName(c) === 'sprintf') {
          // heap buffer sized from the strlen() of every %s argument (malloc(strlen(a) + k))
          let ai = 2;
          let allMeasured = true;
          for (const cv of F.parse(fmt)) {
            if (cv.width === '*') ai++;
            if (cv.precision === '*') ai++;
            const a = c.args[ai++];
            if (cv.conv === 's' && cv.precision == null && !(a && lengthChecked(unit, c, a))) allMeasured = false;
          }
          if (allMeasured) continue;
        }
        api.report(c, M(`${U.callName(c)}() into '${U.src(unit, dst)}' has no size limit; use snprintf() with sizeof the buffer.`, `'${U.src(unit, dst)}' 로의 ${U.callName(c)}() 는 크기 제한이 없습니다. 버퍼 크기와 함께 snprintf() 를 사용하세요.`));
      }
      const SCAN = { scanf: 0, fscanf: 1, sscanf: 1, wscanf: 0, fwscanf: 1, swscanf: 1, vscanf: 0, vfscanf: 1, vsscanf: 1 };
      for (const c of U.libCalls(unit, new Set(Object.keys(SCAN)))) {
        const fmt = U.strLit(c.args[SCAN[U.callName(c)]]);
        if (fmt != null && F.scanUnbounded(fmt)) api.report(c, M(`${U.callName(c)}() reads a string with '%s' and no field width; the input can overflow the buffer.`, `${U.callName(c)}() 가 폭이 없는 '%s' 로 문자열을 읽어 버퍼가 넘칠 수 있습니다.`));
      }
    },
  }),

  rule('STR32-C', {
    risk: 'HPM', cwe: ['CWE-170', 'CWE-125'], sec: true, approx: true, deep: 'absint:STRING_NULL',
    name: ['Do not pass a non-null-terminated character sequence to a library function that expects a string', '널로 끝나지 않는 문자열을 문자열 함수에 넘기지 마세요'],
    why: ['strncpy() does not terminate the destination when the source is as long as the limit; later string functions read past the end.', 'strncpy() 는 원본이 제한 길이만큼 길면 대상을 널로 끝내지 않아 이후 문자열 함수가 끝을 넘어 읽습니다.'],
    fix: ['Write the terminator explicitly after strncpy (d[n - 1] = \'\\0\') or copy with snprintf.', 'strncpy 뒤에 종료 문자를 직접 쓰거나(d[n - 1] = \'\\0\') snprintf 로 복사하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['strncpy', 'wcsncpy']))) {
        const dst = U.strip(c.args[0]);
        const k = U.key(unit, dst);
        if (!k) continue;
        const size = arraySize(dst.ctype);
        const n = U.constInt(unit, c.args[2]);
        const lenSrc = U.src(unit, c.args[2]);
        const lenText = lenSrc.replace(/\s+/g, '');
        const full = (size != null && n != null && Number(n) >= size) || /^sizeof\(?/.test(lenText) && !/-/.test(lenText);
        if (!full) continue;
        const stmt = U.stmtOf(c);
        const next = U.following(stmt).slice(0, 3);
        const terminated = next.some((s) => U.cf.findFirst(s, (x) => x.type === 'AssignExpr' && (() => {
          const l = U.strip(x.left);
          return l && l.type === 'IndexExpr' && U.key(unit, l.object) === k && (U.constInt(unit, x.right) === 0n);
        })()));
        if (!terminated) api.report(c, M(`${U.callName(c)}(${U.src(unit, dst)}, ..., ${lenSrc}) may leave '${U.src(unit, dst)}' without a null terminator.`, `${U.callName(c)}(${U.src(unit, dst)}, ..., ${lenSrc}) 는 '${U.src(unit, dst)}' 를 널 종료 없이 남길 수 있습니다.`));
      }
    },
  }),

  rule('STR34-C', {
    risk: 'MPM', cwe: ['CWE-704'], approx: true,
    name: ['Cast characters to unsigned char before converting to larger integer sizes', '더 큰 정수로 변환하기 전에 문자를 unsigned char 로 캐스트하세요'],
    why: ['Plain char is signed on many targets; a byte above 0x7F becomes a negative int and breaks table lookups and comparisons.', '일반 char 는 많은 환경에서 부호가 있어 0x7F 보다 큰 바이트가 음수 int 가 되고 테이블 조회와 비교가 깨집니다.'],
    fix: ['Convert through unsigned char: (int)(unsigned char)*s.', 'unsigned char 를 거쳐 변환하세요: (int)(unsigned char)*s.'],
  }, {
    check(unit, api) {
      const fromString = (e) => {
        e = U.skip(e);
        if (!e || !e.ctype) return false;
        const t = T.canonical(e.ctype);
        if (!t || t.kind !== 'int' || t.name !== 'char') return false;
        return (e.type === 'UnaryExpr' && e.op === '*') || e.type === 'IndexExpr';
      };
      const wide = (t) => {
        const c = U.canon(t);
        return c && c.kind === 'int' && T.intRank(c) >= 3 && !(c.name === 'wchar_t');
      };
      for (const d of U.nodes(unit, 'VarDecl')) {
        if (d.init && wide(d.ctype) && fromString(d.init)) api.report(d.init, M(`'${U.src(unit, d.init)}' (plain char) is widened to ${U.tstr(d.ctype)} '${d.name}' without going through unsigned char.`, `일반 char 인 '${U.src(unit, d.init)}' 가 unsigned char 를 거치지 않고 ${U.tstr(d.ctype)} '${d.name}' 로 확장됩니다.`));
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op === '=' && wide(a.left.ctype) && fromString(a.right)) api.report(a.right, M(`'${U.src(unit, a.right)}' (plain char) is widened to ${U.tstr(a.left.ctype)} without going through unsigned char.`, `일반 char 인 '${U.src(unit, a.right)}' 가 unsigned char 를 거치지 않고 ${U.tstr(a.left.ctype)} 로 확장됩니다.`));
      }
    },
  }),

  rule('STR37-C', {
    risk: 'LUL', cwe: ['CWE-704', 'CWE-686'],
    name: ['Arguments to character-handling functions must be representable as an unsigned char', '문자 처리 함수의 인수는 unsigned char 로 표현 가능해야 합니다'],
    why: ['isalpha(), toupper() and friends accept EOF or an unsigned char value; a negative plain char is undefined behavior and may index outside the lookup table.', 'isalpha(), toupper() 등은 EOF 나 unsigned char 값만 받습니다. 음수인 일반 char 를 넘기면 정의되지 않은 동작이며 조회 테이블 밖을 읽을 수 있습니다.'],
    fix: ['Cast the argument: isalpha((unsigned char)c).', '인수를 캐스트하세요: isalpha((unsigned char)c).'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, CTYPE)) {
        const a = U.skip(c.args[0]);
        if (!a || !a.ctype) continue;
        if (a.type === 'CastExpr') {
          const ct = T.canonical(a.typeName && a.typeName.ctype);
          if (ct && ct.kind === 'int' && ct.name === 'unsigned char') continue;
          const inner = U.skip(a.arg);
          const it = inner && inner.ctype && T.canonical(inner.ctype);
          if (it && it.kind === 'int' && (it.name === 'char' || it.name === 'signed char')) {
            api.report(c, M(`${U.callName(c)}() gets '${U.src(unit, a)}', a char converted without unsigned char.`, `${U.callName(c)}() 가 unsigned char 를 거치지 않고 변환된 char '${U.src(unit, a)}' 를 받습니다.`));
          }
          continue;
        }
        const t = T.canonical(a.ctype);
        if (t && t.kind === 'int' && (t.name === 'char' && T.isSigned(t, unit.target) || t.name === 'signed char')) {
          api.report(c, M(`${U.callName(c)}() gets '${U.src(unit, a)}' of type ${t.name}, which may be negative; cast it to unsigned char.`, `${U.callName(c)}() 가 음수일 수 있는 ${t.name} 형 '${U.src(unit, a)}' 를 받습니다. unsigned char 로 캐스트하세요.`));
        }
      }
    },
  }),

  rule('STR38-C', {
    risk: 'HLL', cwe: ['CWE-704', 'CWE-135'],
    name: ['Do not confuse narrow and wide character strings and functions', '좁은 문자열과 넓은 문자열 및 그 함수를 혼동하지 마세요'],
    why: ['Passing a wchar_t string to strlen() or a char string to wcslen() miscomputes lengths and leads to buffer overflows.', 'wchar_t 문자열을 strlen() 에, char 문자열을 wcslen() 에 넘기면 길이가 틀려 버퍼 오버플로로 이어집니다.'],
    fix: ['Use the wcs* functions for wchar_t strings and the str* functions for char strings.', 'wchar_t 문자열에는 wcs* 함수를, char 문자열에는 str* 함수를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set([...NARROW_FNS, ...WIDE_FNS]))) {
        const want = NARROW_FNS.has(U.callName(c)) ? 'narrow' : 'wide';
        const n = Math.min(c.args.length, /cpy|cat|cmp|str$|chr/.test(U.callName(c)) ? 2 : 1);
        for (let i = 0; i < n; i++) {
          const a = U.strip(c.args[i]);
          if (!a) continue;
          const k = charKind(a.ctype);
          if (k && k !== want) {
            api.report(c, M(`${U.callName(c)}() expects a ${want} string but argument ${i + 1} '${U.src(unit, a)}' is ${k}.`, `${U.callName(c)}() 는 ${want === 'narrow' ? '좁은' : '넓은'} 문자열을 기대하지만 인수 ${i + 1} '${U.src(unit, a)}' 는 ${k === 'narrow' ? '좁은' : '넓은'} 문자열입니다.`));
            break;
          }
        }
      }
    },
  }),

  rule('STR11-C', {
    risk: 'LLL', cwe: ['CWE-665'],
    name: ['Do not specify the bound of a character array initialized with a string literal', '문자열 리터럴로 초기화하는 문자 배열의 크기를 지정하지 마세요'],
    why: ['When the bound equals the literal length the terminator is silently dropped and the array is not a string.', '크기가 리터럴 길이와 같으면 종료 문자가 조용히 빠져 배열이 문자열이 아니게 됩니다.'],
    fix: ['Omit the bound (char s[] = "abc";) so the compiler counts the terminator.', '크기를 생략해(char s[] = "abc";) 컴파일러가 종료 문자까지 세게 하세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'VarDecl')) {
        const t = d.ctype && T.canonical(d.ctype);
        if (!t || t.kind !== 'array' || t.size == null || !T.isCharType(T.canonical(t.of))) continue;
        const lit = d.init && U.strip(d.init);
        const s = lit && lit.type === 'StringLiteral' ? lit : lit && lit.type === 'InitList' && lit.items.length === 1 && U.strip(lit.items[0]).type === 'StringLiteral' ? U.strip(lit.items[0]) : null;
        if (!s) continue;
        const n = s.value.length;
        if (t.size === n && /\b(uint8_t|int8_t|u8|BYTE|unsigned char|signed char)\b/.test(U.tstr(t.of))) continue;
        if (t.size <= n) api.report(d, M(`'${d.name}[${t.size}]' is initialized with a ${n}-character literal and has no room for the null terminator.`, `'${d.name}[${t.size}]' 를 ${n} 글자 리터럴로 초기화해 널 종료 문자 자리가 없습니다.`));
      }
    },
  }),
];

