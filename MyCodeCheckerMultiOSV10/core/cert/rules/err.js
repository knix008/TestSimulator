'use strict';

// SEI CERT C — ERR: error handling.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const S = require('../lib/sys');
const F = require('../lib/fmt');
const { M, cf } = U;

// Conversions whose only error report is errno (the return value is ambiguous).
const STRTO = new Set(['strtol', 'strtoll', 'strtoul', 'strtoull', 'strtod', 'strtof', 'strtold', 'strtoimax', 'strtoumax', 'wcstol', 'wcstoll', 'wcstoul', 'wcstoull', 'wcstod', 'wcstof', 'wcstold', 'wcstoimax', 'wcstoumax']);
// Functions that set errno and report failure in-band: check the return first.
const IN_BAND = new Set(['fopen', 'freopen', 'ftell', 'fgetpos', 'fsetpos', 'signal', 'malloc', 'calloc', 'realloc', 'mbrtowc', 'mbrlen', 'mbsrtowcs', 'wcrtomb', 'wcsrtombs', 'fgetwc', 'fputwc', 'tmpfile', 'remove', 'rename']);
// Functions that do not set errno at all (C standard).
const NO_ERRNO = new Set(['atoi', 'atol', 'atoll', 'atof', 'setlocale', 'strcpy', 'strncpy', 'strcat', 'strncat', 'memcpy', 'memmove', 'memset', 'strlen', 'strcmp', 'strncmp', 'strchr', 'strstr', 'toupper', 'tolower', 'abs', 'labs', 'qsort', 'bsearch', 'rand', 'srand']);

// ERR33-C: function -> what signals the error.
const ERR33 = {
  malloc: 'NULL', calloc: 'NULL', realloc: 'NULL', aligned_alloc: 'NULL', strdup: 'NULL', strndup: 'NULL',
  fopen: 'NULL', freopen: 'NULL', tmpfile: 'NULL', tmpnam: 'NULL', fgets: 'NULL', fgetws: 'NULL', setlocale: 'NULL',
  getenv: 'NULL', localtime: 'NULL', gmtime: 'NULL', bsearch: 'NULL',
  fread: 'a count smaller than requested', fwrite: 'a count smaller than requested',
  scanf: 'EOF or fewer conversions', fscanf: 'EOF or fewer conversions', sscanf: 'EOF or fewer conversions',
  vscanf: 'EOF or fewer conversions', vfscanf: 'EOF or fewer conversions', vsscanf: 'EOF or fewer conversions',
  wscanf: 'EOF or fewer conversions', fwscanf: 'EOF or fewer conversions', swscanf: 'EOF or fewer conversions',
  fgetc: 'EOF', getc: 'EOF', getchar: 'EOF', ungetc: 'EOF', fseek: 'nonzero', fsetpos: 'nonzero', fgetpos: 'nonzero',
  ftell: '-1L', remove: 'nonzero', rename: 'nonzero', setvbuf: 'nonzero', atexit: 'nonzero', at_quick_exit: 'nonzero',
  signal: 'SIG_ERR', raise: 'nonzero', mktime: '(time_t)-1', mbstowcs: '(size_t)-1', wcstombs: '(size_t)-1',
  mbrtowc: '(size_t)-1 or -2', wcrtomb: '(size_t)-1', mbtowc: '-1', wctomb: '-1',
  thrd_create: 'thrd_error', thrd_join: 'thrd_error', thrd_detach: 'thrd_error', mtx_init: 'thrd_error',
  mtx_lock: 'thrd_error', mtx_trylock: 'thrd_error', mtx_timedlock: 'thrd_error', cnd_init: 'thrd_error',
  cnd_wait: 'thrd_error', cnd_timedwait: 'thrd_error', tss_create: 'thrd_error', tss_set: 'thrd_error',
  timespec_get: '0', strftime: '0',
};
const ERR33_SET = new Set(Object.keys(ERR33));
const KO_IND = { 'an error number': '0 이 아닌 오류 번호', 'a count smaller than requested': '요청보다 작은 개수', 'EOF or fewer conversions': 'EOF 나 더 적은 변환 개수', nonzero: '0 이 아닌 값', '(size_t)-1 or -2': '(size_t)-1 또는 -2' };
const ko = (v) => KO_IND[v] || v;


const NUMERIC_CONV = /^[diouxXaAeEfFgG]$/;
const SCAN_FMT = { scanf: 0, fscanf: 1, sscanf: 1, vscanf: 0, vfscanf: 1, vsscanf: 1 };

// Most digits a scanf conversion may read without leaving its target type
// (the smallest the standard allows: int/long 32 bits): '%4d' reads at most
// 9999, which no int overflows.
const SAFE_DIGITS = {
  dec: { hh: 2, h: 4, '': 9, l: 9, z: 9, t: 9, ll: 18, j: 18, q: 18, I64: 18, I32: 9 },
  x: { hh: 2, h: 4, '': 8, l: 8, z: 8, t: 8, ll: 16, j: 16, q: 16, I64: 16, I32: 8 },
  o: { hh: 2, h: 5, '': 10, l: 10, z: 10, t: 10, ll: 21, j: 21, q: 21, I64: 21, I32: 10 },
  f: { '': 38, l: 308, L: 308 },
};
function widthFits(c) {
  if (!c.width || c.width === '*') return false;
  const kind = /[diu]/.test(c.conv) ? 'dec' : /[xX]/.test(c.conv) ? 'x' : c.conv === 'o' ? 'o' : 'f';
  const max = SAFE_DIGITS[kind][c.length];
  return max != null && Number(c.width) <= max;
}

const isZeroAssign =(unit, a) => a.op === '=' && S.isErrno(a.left) && U.constInt(unit, a.right) === 0n;

// A NULL-returning result counts as checked when it is tested, returned, stored
// elsewhere or handed to a user function (not when passed to memset/fclose...).
function nullChecked(sym, call, project) {
  for (const u of sym.uses || []) {
    if (!u.loc || u.loc.file !== call.loc.file || u.loc.start <= call.loc.start) continue;
    const p = cf.parentOf(u);
    if (!p) continue;
    if (p.type === 'AssignExpr' && p.left === u) continue;
    if (U.inCondition(u) || p.type === 'ReturnStmt') return true;
    if (p.type === 'AssignExpr' || p.type === 'VarDecl' || p.type === 'InitList') return true;
    if (p.type === 'CallExpr' && p.callee !== u && !S.isLibP(p, U.callName(p) || '', project)) return true;
  }
  return false;
}

// The in-band result of call was tested before errno is read at r.
function checkedBefore(call, r) {
  const st = U.stmtOf(r) || r;
  if (S.encloses(st, call)) return true;
  const ru = U.resultUse(call);
  if (ru.kind === 'condition') return true;
  if (ru.kind !== 'var') return false;
  return (ru.sym.uses || []).some((u) => u.loc && u.loc.start > call.loc.end && u.loc.start < r.loc.start && U.inCondition(u));
}

module.exports = [
  rule('ERR30-C', {
    risk: 'MPM', cwe: ['CWE-456', 'CWE-391'], approx: true,
    name: ['Take care when reading errno', 'errno 를 읽을 때 주의하세요'],
    why: ['Library functions never clear errno: a value left by an earlier call makes the check after strtol() report a bogus error. Functions that do not document setting errno leave it meaningless, and functions with an in-band error indicator must be checked through their return value first.', '라이브러리 함수는 errno 를 0 으로 지우지 않으므로 이전 호출이 남긴 값 때문에 strtol() 뒤의 검사가 잘못된 오류를 보고합니다. errno 를 설정한다고 문서화되지 않은 함수 뒤의 errno 는 의미가 없고, 반환값으로 오류를 알리는 함수는 반환값을 먼저 확인해야 합니다.'],
    fix: ['Set errno = 0 immediately before strtol()/strtod() and similar calls, check errno only after functions that set it, and only after their return value signalled an error.', 'strtol()/strtod() 등을 호출하기 직전에 errno = 0 으로 설정하고, errno 를 설정하는 함수 뒤에서만, 그리고 반환값이 오류를 알린 뒤에만 errno 를 확인하세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const fn of U.functions(unit)) {
        const reads = S.errnoUses(fn.body).filter((e) => !S.isWrite(e));
        if (!reads.length) continue;
        const resets = cf.findAll(fn.body, 'AssignExpr').filter((a) => isZeroAssign(unit, a));
        const strto = S.callsIn(fn.body, STRTO, project);
        // (a) strto* without errno = 0 before it, errno inspected afterwards
        strto.forEach((c, i) => {
          const next = strto[i + 1];
          const checked = reads.some((r) => r.loc.start > c.loc.end && (!next || r.loc.start < next.loc.start));
          if (!checked) return;
          const prev = strto[i - 1];
          const loop = U.loopOf(c.node, fn);
          const ok = resets.some((a) => a.loc.start < c.loc.start && (!prev || a.loc.start > prev.loc.start) && (!loop || S.encloses(loop, a)));
          if (!ok) api.report(c.node, M(`errno is inspected after ${c.name}() but is not set to 0 before the call.`, `${c.name}() 뒤에 errno 를 확인하지만 호출 전에 errno 를 0 으로 설정하지 않습니다.`));
        });
        // (b)/(c) errno read after a call that does not set it, or before checking an in-band indicator
        const allCalls = cf.findAll(fn.body, 'CallExpr').filter((c) => !(c.loc && c.loc.macro === 'errno'));
        const seen = new Set();
        for (const r of reads) {
          if (!U.inCondition(r)) continue;
          let last = null;
          for (const c of allCalls) if (c.loc.end <= r.loc.start && (!last || c.loc.end > last.loc.end)) last = c;
          if (!last || seen.has(last)) continue;
          const name = U.callName(last);
          if (!name || !S.isLibP(last, name, project)) continue;
          if (resets.some((a) => a.loc.start > last.loc.end && a.loc.start < r.loc.start)) continue;
          if (NO_ERRNO.has(name)) {
            seen.add(last);
            api.report(r, M(`errno is checked after ${name}(), which does not set errno.`, `errno 를 설정하지 않는 ${name}() 뒤에 errno 를 확인합니다.`));
          } else if (IN_BAND.has(name) && !checkedBefore(last, r) && !cf.findFirst(cf.enclosing(r, ['IfStmt', 'WhileStmt', 'ForStmt', 'DoStmt', 'ReturnStmt', 'ExprStmt']) || r, (x) => x === last)) {
            seen.add(last);
            api.report(r, M(`errno is checked after ${name}() without first testing its return value for an error.`, `${name}() 의 반환값으로 오류를 먼저 확인하지 않고 errno 를 확인합니다.`));
          }
        }
      }
    },
  }),

  rule('ERR32-C', {
    risk: 'LUL', cwe: ['CWE-456'], approx: true,
    name: ['Do not rely on indeterminate values of errno', '부정 값인 errno 에 의존하지 마세요'],
    why: ['When signal() fails inside a signal handler errno becomes indeterminate; reading it (directly or through perror/strerror) afterwards is undefined.', '시그널 처리기 안에서 signal() 이 실패하면 errno 는 부정 값이 됩니다. 그 뒤에 직접 또는 perror/strerror 로 읽으면 정의되지 않은 동작입니다.'],
    fix: ['Inside a handler do not inspect errno after signal(); just return or call _Exit().', '처리기 안에서는 signal() 뒤에 errno 를 확인하지 말고 그냥 반환하거나 _Exit() 를 호출하세요.'],
  }, {
    project(project, api) {
      const reach = S.reachMap(project, 'handlers');
      for (const [fn] of reach) {
        const sig = S.callsIn(fn.body, 'signal', project);
        if (!sig.length) continue;
        const first = sig[0];
        const uses = [...S.errnoUses(fn.body), ...S.callsIn(fn.body, ['perror', 'strerror'], project).map((c) => c.node)]
          .filter((n) => n.loc.start > first.loc.end).sort((a, b) => a.loc.start - b.loc.start);
        if (uses.length) api.report(uses[0], M(`errno is read in signal handler '${S.fnLabel(fn)}' after signal(); its value is indeterminate there.`, `시그널 처리기 '${S.fnLabel(fn)}' 에서 signal() 뒤에 errno 를 읽습니다. 그 값은 부정 값입니다.`));
      }
    },
  }),

  rule('ERR33-C', {
    risk: 'HLM', cwe: ['CWE-252', 'CWE-253', 'CWE-391'], sec: true, approx: true,
    name: ['Detect and handle standard library errors', '표준 라이브러리 오류를 감지하고 처리하세요'],
    why: ['Functions such as malloc(), fopen(), fgets() and scanf() report failure only through their return value; ignoring it lets the program continue with a null pointer, an unread buffer or uninitialised variables.', 'malloc(), fopen(), fgets(), scanf() 같은 함수는 반환값으로만 실패를 알립니다. 무시하면 널 포인터, 읽히지 않은 버퍼, 초기화되지 않은 변수로 계속 실행됩니다.'],
    fix: ['Compare the return value with the documented error indicator and handle the failure; cast to (void) only when a failure is truly harmless.', '반환값을 문서화된 오류 표시값과 비교하고 실패를 처리하세요. 실패가 정말 무해할 때만 (void) 로 캐스트하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, ERR33_SET, api.project)) {
        if (c.node.type !== 'CallExpr') continue;
        const r = U.resultUse(c.node);
        if (r.kind === 'discarded') {
          api.report(c.node, M(`The return value of ${c.name}() is ignored; it reports failure with ${ERR33[c.name]}.`, `${c.name}() 의 반환값을 무시합니다. 이 함수는 실패를 ${ko(ERR33[c.name])} 로 알립니다.`));
        } else if (r.kind === 'var' && !(ERR33[c.name] === 'NULL' ? nullChecked(r.sym, c.node, api.project) : U.symChecked(r.sym, c.node))) {
          api.report(c.node, M(`The result of ${c.name}() is stored in '${r.sym.name}' but never compared with ${ERR33[c.name]}.`, `${c.name}() 의 결과를 '${r.sym.name}' 에 저장하지만 ${ko(ERR33[c.name])} 와 비교하지 않습니다.`));
        }
      }
    },
  }),

  rule('ERR34-C', {
    langs: ['c'], risk: 'MUM', cwe: ['CWE-676', 'CWE-20'], approx: true,
    name: ['Detect errors when converting a string to a number', '문자열을 숫자로 변환할 때 오류를 감지하세요'],
    why: ['atoi(), atol(), atof() and scanf("%d") cannot report invalid input or out-of-range values; an overflowing value is undefined behavior and garbage input silently becomes 0.', 'atoi(), atol(), atof(), scanf("%d") 는 잘못된 입력이나 범위를 벗어난 값을 알릴 수 없습니다. 넘치는 값은 정의되지 않은 동작이고 엉터리 입력은 조용히 0 이 됩니다.'],
    fix: ['Use strtol(), strtoul(), strtod() with an end pointer and errno checks.', '끝 포인터와 errno 검사를 함께 쓰는 strtol(), strtoul(), strtod() 를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, ['atoi', 'atol', 'atoll', 'atof'], api.project)) {
        api.report(c.node, M(`${c.name}() cannot detect invalid or out-of-range input; use ${c.name === 'atof' ? 'strtod' : c.name === 'atoll' ? 'strtoll' : 'strtol'}() with error checks.`, `${c.name}() 는 잘못되거나 범위를 벗어난 입력을 감지하지 못합니다. 오류 검사와 함께 ${c.name === 'atof' ? 'strtod' : c.name === 'atoll' ? 'strtoll' : 'strtol'}() 를 사용하세요.`));
      }
      for (const c of S.calls(unit, Object.keys(SCAN_FMT), api.project)) {
        const fmt = U.strLit(c.args[SCAN_FMT[c.name]]);
        if (fmt == null) continue;
        const conv = F.parse(fmt).find((x) => NUMERIC_CONV.test(x.conv) && !x.flags.includes('*') && !/^%\*/.test(x.text) && !widthFits(x));
        if (conv) api.report(c.node, M(`${c.name}() converts a number with '${conv.text}'; overflow is undefined and cannot be detected.`, `${c.name}() 가 '${conv.text}' 로 숫자를 변환합니다. 넘침은 정의되지 않은 동작이며 감지할 수 없습니다.`));
      }
    },
  }),
];
