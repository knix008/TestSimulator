'use strict';

// SEI CERT C — MSC: miscellaneous.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const S = require('../lib/sys');
const { M, cf, T } = U;

const MSC24 = {
  gets: 'fgets()', asctime: 'strftime()', ctime: 'localtime_r() + strftime()', atof: 'strtod()', atoi: 'strtol()', atol: 'strtol()',
  atoll: 'strtoll()', rewind: 'fseek() + clearerr()', setbuf: 'setvbuf()',
};

const MACRO_ONLY = new Set(['assert', 'va_start', 'va_arg', 'va_copy', 'va_end', 'math_errhandling']);
const UNDEF_BAD = new Set(['assert', 'errno', 'setjmp', 'va_start', 'va_arg', 'va_copy', 'va_end', 'math_errhandling']);

const SEEDS = new Set(['srand', 'srandom', 'srand48', 'seed48', 'lcong48']);

// ---------------------------------------------------------------- MSC41 helpers
const SECRET_WORDS = new Set(['password', 'passwd', 'pwd', 'passphrase', 'secret', 'apikey', 'token', 'credential', 'credentials', 'privatekey', 'secretkey', 'accesskey', 'authtoken', 'pass', 'pw']);
const NOT_SECRET = new Set(['prompt', 'msg', 'message', 'label', 'hint', 'len', 'length', 'size', 'path', 'file', 'filename', 'name', 'field', 'fmt', 'format', 'env', 'var', 'url', 'text', 'title', 'caption', 'id', 'type', 'count', 'max', 'min', 'placeholder', 'policy', 'regex', 'pattern', 'help', 'error', 'err', 'prefix', 'suffix', 'header', 'param', 'arg', 'opt', 'option', 'flag', 'mode', 'char', 'chars', 'buf', 'buffer', 'column', 'col', 'attr', 'tag', 'key_name', 'expiry', 'expires', 'timeout', 'store', 'manager', 'dir']);

function words(name) {
  return String(name || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[_\W]+/).filter(Boolean);
}

function secretName(name) {
  const w = words(name);
  if (!w.length || w.some((x) => NOT_SECRET.has(x))) return false;
  const joined = w.join('');
  if (w.some((x) => SECRET_WORDS.has(x))) return true;
  return /(apikey|secretkey|privatekey|accesskey|authtoken|password|passwd)/.test(joined);
}

function secretLiteral(v) {
  if (v == null || v.length < 4) return false;
  if (/[%\s:]/.test(v) || /^\W+$/.test(v)) return false;
  if (/^(null|none|changeme|xxx+|\*+|todo|password|secret|token)$/i.test(v)) return false;
  if (/^_*[A-Z][A-Z0-9_]*$/.test(v) && /_/.test(v)) return false; // placeholder / marker such as __PW_FD__
  if (/^[a-z][a-z0-9]*(?:[_.-][a-z0-9]+)+$/.test(v) && secretName(v.replace(/[.-]/g, '_'))) return false;
  return true;
}

const AUTH_ARG = { mysql_real_connect: 3, LogonUserA: 2, LogonUserW: 2, LogonUser: 2, ldap_simple_bind_s: 2, ldap_simple_bind: 2, ldap_bind_s: 2, SQLConnect: 5, SQLConnectA: 5, SQLConnectW: 5, PQsetdbLogin: 6, sqlite3_key: 1, ssh_userauth_password: 2, libssh2_userauth_password: 2, curl_easy_setopt_password: 2 };

function canReturnOff(fn) {
  if (U.hasParseError(fn.body)) return false;
  let g;
  try { g = cf.getCFG(fn); } catch (_) { return false; }
  const r = g.reachable();
  return g.exit.preds.some((e) => r.has(e.from) && !['return', 'noreturn', 'throw', 'exception'].includes(e.kind));
}

const isVaList = (e) => {
  const x = U.strip(e);
  return !!(x && x.ctype && S.typedefNames(x.ctype).some((n) => n === 'va_list' || n === '__builtin_va_list' || n === '__gnuc_va_list'));
};

module.exports = [
  rule('MSC24-C', {
    risk: 'HPL', cwe: ['CWE-676', 'CWE-477'],
    name: ['Do not use deprecated or obsolescent functions', '폐지되었거나 쓰지 않게 된 함수를 사용하지 마세요'],
    why: ['gets() was removed from C11, and asctime(), ctime(), atoi(), atof(), rewind(), setbuf() offer no error reporting or bounds; safer replacements exist for each.', 'gets() 는 C11 에서 제거되었고 asctime(), ctime(), atoi(), atof(), rewind(), setbuf() 는 오류 보고나 경계 검사가 없습니다. 각각 더 안전한 대체 함수가 있습니다.'],
    fix: ['Use the replacement: fgets, strftime, strtol/strtod, fseek + clearerr, setvbuf.', '대체 함수를 사용하세요: fgets, strftime, strtol/strtod, fseek + clearerr, setvbuf.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, Object.keys(MSC24), api.project)) {
        api.report(c.node, M(`${c.name}() is ${c.name === 'gets' ? 'deprecated (removed in C11)' : 'obsolescent'}; use ${MSC24[c.name]} instead.`, `${c.name}() 는 ${c.name === 'gets' ? '폐지된(C11 에서 제거) 함수' : '쓰지 않게 된 함수'}입니다. 대신 ${MSC24[c.name]} 를 사용하세요.`));
      }
    },
  }),

  rule('MSC30-C', {
    langs: ['c'], risk: 'MUL', cwe: ['CWE-338', 'CWE-330'], sec: true,
    name: ['Do not use the rand() function for generating pseudorandom numbers', '의사 난수 생성에 rand() 함수를 사용하지 마세요'],
    why: ['rand() has a short period and predictable output on many implementations; values derived from it (tokens, keys, nonces) can be guessed.', 'rand() 는 많은 구현에서 주기가 짧고 출력을 예측할 수 있어 이것으로 만든 토큰, 키, 논스를 추측할 수 있습니다.'],
    fix: ['Use a cryptographically strong generator: getrandom()/arc4random() (POSIX), BCryptGenRandom() (Windows), or a vetted library.', '암호학적으로 안전한 생성기를 사용하세요: getrandom()/arc4random()(POSIX), BCryptGenRandom()(Windows) 또는 검증된 라이브러리.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, 'rand', api.project)) api.report(c.node, M('rand() produces predictable pseudorandom numbers; use a cryptographically secure generator.', 'rand() 는 예측 가능한 의사 난수를 만듭니다. 암호학적으로 안전한 생성기를 사용하세요.'));
    },
  }),

  rule('MSC32-C', {
    langs: ['c'], risk: 'MLL', cwe: ['CWE-330', 'CWE-331', 'CWE-337'], sec: true, approx: true,
    name: ['Properly seed pseudorandom number generators', '의사 난수 생성기를 올바르게 시드하세요'],
    why: ['An unseeded generator, a constant seed or a seed taken from time() (one-second resolution) yields the same or an easily guessed sequence on every run.', '시드하지 않거나, 상수 시드나 time()(1초 단위) 값으로 시드한 생성기는 실행할 때마다 같거나 쉽게 추측되는 수열을 만듭니다.'],
    fix: ['Seed from a high-entropy source (getrandom(), /dev/urandom, BCryptGenRandom) or use a generator that seeds itself.', '높은 엔트로피 원본(getrandom(), /dev/urandom, BCryptGenRandom)으로 시드하거나 스스로 시드하는 생성기를 사용하세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const c of S.calls(unit, SEEDS, project)) {
        const a = U.strip(c.args[0]);
        if (!a) continue;
        if (U.constInt(unit, a) != null) { api.report(c.node, M(`${c.name}() is seeded with the constant ${U.src(unit, a)}; every run produces the same sequence.`, `${c.name}() 를 상수 ${U.src(unit, a)} 로 시드해 실행마다 같은 수열이 나옵니다.`)); continue; }
        if (a.type === 'CallExpr' && /^(time|_time64|_time32|getpid|clock)$/.test(U.callName(a) || '')) api.report(c.node, M(`${c.name}() is seeded with ${U.callName(a)}(), which an attacker can guess.`, `${c.name}() 를 공격자가 추측할 수 있는 ${U.callName(a)}() 로 시드합니다.`));
      }
      // generator used without any seed in the whole program
      let seeded = false;
      for (const u of project.units) if (S.calls(u, SEEDS, project).length) { seeded = true; break; }
      if (seeded) return;
      const use = S.calls(unit, ['random', 'rand', 'drand48', 'lrand48', 'mrand48'], project)[0];
      if (use) api.report(use.node, M(`${use.name}() is used but the generator is never seeded; it yields the same sequence on every run.`, `${use.name}() 를 사용하지만 생성기를 시드하지 않아 실행마다 같은 수열이 나옵니다.`));
    },
  }),

  rule('MSC33-C', {
    risk: 'HLM', cwe: ['CWE-676', 'CWE-120'], sec: true, approx: true,
    name: ['Do not pass invalid data to the asctime() function', 'asctime() 함수에 잘못된 데이터를 넘기지 마세요'],
    why: ['asctime() writes into a 26-byte static buffer; a struct tm with out-of-range fields (e.g. tm_year beyond 9999) overflows it.', 'asctime() 는 26 바이트 정적 버퍼에 씁니다. 범위를 벗어난 struct tm 필드(예: 9999 보다 큰 tm_year)는 버퍼를 넘칩니다.'],
    fix: ['Format times with strftime() into a buffer of known size.', '크기를 아는 버퍼에 strftime() 으로 시간을 형식화하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, 'asctime', api.project)) api.report(c.node, M('asctime() overflows its static buffer for out-of-range struct tm values; use strftime().', 'asctime() 는 범위를 벗어난 struct tm 값에서 정적 버퍼를 넘칩니다. strftime() 을 사용하세요.'));
    },
  }),

  rule('MSC37-C', {
    langs: ['c'], risk: 'HUL', cwe: ['CWE-758', 'CWE-393'],
    name: ['Ensure that control never reaches the end of a non-void function', 'void 가 아닌 함수의 끝에 제어가 도달하지 않게 하세요'],
    why: ['If control falls off the end of a function that returns a value and the caller uses the result, the behavior is undefined and the value is garbage.', '값을 반환하는 함수의 끝으로 제어가 빠져나가고 호출자가 결과를 쓰면 정의되지 않은 동작이며 값은 쓰레기입니다.'],
    fix: ['Return a value on every path, including after loops and in the default case.', '루프 뒤와 default 경우를 포함해 모든 경로에서 값을 반환하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (fn.name === 'main' || !fn.ctype || fn.ctype.kind !== 'function') continue;
        const ret = T.canonical(fn.ctype.ret);
        if (!ret || T.isVoid(ret) || T.isUnknown(ret)) continue;
        if (fn.symbol && fn.symbol.noreturn) continue;
        if (fn.implicitInt) continue; // e.g. a function defined through an unknown macro
        const bl = fn.body.loc;
        if ((unit.skipped || []).some((k) => k.file === bl.file && k.startLine > bl.line && k.endLine < bl.endLine)) continue; // depends on configuration
        if (!canReturnOff(fn)) continue;
        const b = fn.body.loc;
        api.report({ file: b.file, line: b.endLine, col: Math.max(1, (b.endCol || 2) - 1) }, M(`Control can reach the end of '${fn.name}', which returns ${U.tstr(fn.ctype.ret)}, without a return statement.`, `${U.tstr(fn.ctype.ret)} 를 반환하는 '${fn.name}' 의 끝에 return 없이 도달할 수 있습니다.`));
      }
    },
  }),

  rule('MSC38-C', {
    risk: 'LUM', cwe: ['CWE-758'],
    name: ['Do not treat a predefined identifier as an object if it might only be implemented as a macro', '매크로로만 구현될 수 있는 미리 정의된 식별자를 객체처럼 다루지 마세요'],
    why: ['assert, errno, setjmp, va_start, va_arg, va_copy, va_end and math_errhandling may be macros; taking their address, suppressing the macro, #undef-ing it or declaring errno yourself is undefined behavior.', 'assert, errno, setjmp, va_start, va_arg, va_copy, va_end, math_errhandling 은 매크로일 수 있습니다. 주소를 얻거나, 매크로를 억제하거나, #undef 하거나, errno 를 직접 선언하면 정의되지 않은 동작입니다.'],
    fix: ['Use these names only as the documented macro invocations and include the proper header instead of declaring errno.', '이 이름들은 문서화된 매크로 호출로만 쓰고, errno 는 직접 선언하지 말고 알맞은 헤더를 포함하세요.'],
  }, {
    check(unit, api) {
      for (const d of unit.directives || []) {
        if (d.kind !== 'undef' || !d.active || !d.file || d.file.startsWith('<') || !UNDEF_BAD.has(d.macro)) continue;
        api.report({ file: d.file, line: d.line, col: d.col }, M(`#undef ${d.macro} removes a standard macro definition; using ${d.macro} afterwards is undefined.`, `#undef ${d.macro} 는 표준 매크로 정의를 없앱니다. 그 뒤 ${d.macro} 를 쓰면 정의되지 않은 동작입니다.`));
      }
      for (const v of U.nodes(unit, 'VarDecl')) {
        if (v.name === 'errno') api.report(v, M('errno is declared by the program; it must come from <errno.h> (it may be a macro).', '프로그램이 errno 를 직접 선언합니다. errno 는 <errno.h> 에서 와야 합니다(매크로일 수 있습니다).'));
      }
      for (const id of U.nodes(unit, 'Identifier')) {
        if (id.loc && id.loc.macro) continue;
        if (MACRO_ONLY.has(id.name) && !((!id.symbol || id.symbol.implicit) && (unit.includes || []).some((i) => i.kind === 'missing'))) {
          api.report(id, M(`'${id.name}' is used without invoking the macro (suppressed or taken as a function); it may not exist as a function.`, `'${id.name}' 를 매크로 호출 없이 사용합니다(억제되었거나 함수처럼 취급). 함수로 존재하지 않을 수 있습니다.`));
        } else if (id.name === 'setjmp' && id.symbol && id.symbol.system) {
          const p = cf.parentOf(id);
          if (p && p.type === 'CallExpr' && p.callee === id) continue;
          api.report(id, M("setjmp is used other than as a direct call; it may be a macro, so its address cannot be taken.", 'setjmp 를 직접 호출이 아닌 방식으로 사용합니다. 매크로일 수 있어 주소를 얻을 수 없습니다.'));
        }
      }
    },
  }),

  rule('MSC39-C', {
    risk: 'LUL', cwe: ['CWE-758'], approx: true,
    name: ['Do not call va_arg() on a va_list that has an indeterminate value', '값이 부정인 va_list 에 va_arg() 를 호출하지 마세요'],
    why: ['After a va_list is passed to a function that calls va_arg() on it (vfprintf and friends), its value in the caller is indeterminate; using it again is undefined.', 'va_list 를 va_arg() 를 호출하는 함수(vfprintf 등)에 넘기면 호출자 쪽 값은 부정이 됩니다. 다시 쓰면 정의되지 않은 동작입니다.'],
    fix: ['Call va_end() and va_start() again, or pass a va_copy() of the list to the other function.', 'va_end() 후 va_start() 를 다시 하거나 다른 함수에는 va_copy() 한 사본을 넘기세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        const evs = [];
        for (const n of cf.findAll(fn.body, ['CallExpr', 'VaArgExpr'])) {
          if (n.type === 'VaArgExpr') { if (isVaList(n.arg)) evs.push({ op: 'use', key: S.gkey(unit, n.arg), node: n, arg: n.arg }); continue; }
          const name = U.callName(n) || '';
          if (name === '__builtin_va_start' || name === '__builtin_va_end') { evs.push({ op: 'reset', key: S.gkey(unit, n.args[0]), node: n }); continue; }
          if (name === '__builtin_va_copy') { evs.push({ op: 'reset', key: S.gkey(unit, n.args[0]), node: n }); continue; }
          for (const a of n.args || []) if (isVaList(a) && U.strip(a).type === 'Identifier') evs.push({ op: 'pass', key: S.gkey(unit, a), node: n, name, arg: a });
        }
        evs.sort((a, b) => a.node.loc.start - b.node.loc.start);
        const passed = new Map();
        for (const e of evs) {
          if (e.op === 'reset') { const blk = cf.enclosing(e.node, 'CompoundStmt'); const p0 = passed.get(e.key); if (p0) p0.resets.push(blk); continue; }
          const p = passed.get(e.key);
          if (p && !S.exclusive(p.node, e.node) && !p.resets.some((b) => S.encloses(b, e.node))) {
            api.report(e.node, M(`'${(U.strip(e.arg) && U.strip(e.arg).name) || U.src(unit, e.arg)}' is used ${e.op === 'use' ? 'by va_arg()' : `again in ${e.name}()`} after being passed to ${p.name}() at line ${p.node.loc.line}; its value is indeterminate.`, `${p.node.loc.line} 행에서 ${p.name}() 에 넘긴 va_list 를 ${e.op === 'use' ? 'va_arg() 로' : `${e.name}() 에서 다시`} 사용합니다. 값이 부정입니다.`));
            passed.delete(e.key);
            continue;
          }
          if (e.op === 'pass') passed.set(e.key, { ...e, resets: [] });
        }
      }
    },
  }),

  rule('MSC40-C', {
    langs: ['c'], risk: 'LUL', cwe: ['CWE-758'],
    name: ['Do not violate constraints', '제약 조건을 위반하지 마세요'],
    why: ['An inline function with external linkage must not define a modifiable static object or refer to an identifier with internal linkage; such a constraint violation makes the program ill-formed and behaves differently across compilers.', '외부 연결을 가진 inline 함수는 수정 가능한 정적 객체를 정의하거나 내부 연결 식별자를 참조하면 안 됩니다. 이런 제약 위반은 프로그램을 잘못된 것으로 만들고 컴파일러마다 다르게 동작합니다.'],
    fix: ['Make the inline function static, or move the static object / internal identifier out of it.', 'inline 함수를 static 으로 만들거나 정적 객체/내부 식별자를 함수 밖으로 옮기세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        const specs = fn.specs || {};
        if (!(specs.functionSpecs || []).includes('inline') || (specs.storage || []).includes('static')) continue;
        if (fn.symbol && fn.symbol.linkage !== 'external') continue;
        for (const v of cf.findAll(fn.body, 'VarDecl')) {
          const s = v.symbol;
          if (s && (s.storage === 'static' || s.storage === 'thread') && !S.isConstType(v.ctype)) {
            api.report(v, M(`Inline function '${fn.name}' with external linkage defines modifiable static object '${v.name}'.`, `외부 연결을 가진 inline 함수 '${fn.name}' 가 수정 가능한 정적 객체 '${v.name}' 를 정의합니다.`));
          }
        }
        const seen = new Set();
        for (const id of cf.findAll(fn.body, 'Identifier')) {
          const s = id.symbol;
          if (!s || s.linkage !== 'internal' || seen.has(s) || s.system) continue;
          if (s.kind !== 'variable' && s.kind !== 'function') continue;
          seen.add(s);
          api.report(id, M(`Inline function '${fn.name}' with external linkage refers to '${s.name}', which has internal linkage.`, `외부 연결을 가진 inline 함수 '${fn.name}' 가 내부 연결인 '${s.name}' 를 참조합니다.`));
        }
      }
    },
  }),

  rule('MSC41-C', {
    risk: 'HPM', cwe: ['CWE-259', 'CWE-798'], sec: true, approx: true,
    name: ['Never hard code sensitive information', '민감한 정보를 하드코딩하지 마세요'],
    why: ['Passwords, keys and tokens written in the source are visible to anyone with the binary or the repository and cannot be rotated without a rebuild.', '소스에 쓴 비밀번호, 키, 토큰은 바이너리나 저장소를 가진 누구에게나 보이고 다시 빌드하지 않으면 바꿀 수 없습니다.'],
    fix: ['Read secrets at run time from a protected configuration file, the environment or a secret store, and compare password hashes instead of plain text.', '비밀 값은 실행 시 보호된 설정 파일, 환경 변수, 비밀 저장소에서 읽고, 평문 대신 비밀번호 해시를 비교하세요.'],
  }, {
    check(unit, api) {
      const hit = (node, what, lit, ko) => api.report(node, M(`Hard-coded secret: ${what} uses the string literal "${lit.length > 12 ? lit.slice(0, 3) + '...' : lit.replace(/./g, (ch, i) => (i < 2 ? ch : '*'))}".`, `하드코딩된 비밀 값: ${ko || what} 에 문자열 리터럴을 사용합니다.`));
      for (const d of U.nodes(unit, 'VarDecl')) {
        if (!d.init || !secretName(d.name)) continue;
        const v = U.strLit(d.init.type === 'InitList' && d.init.items.length === 1 ? d.init.items[0] : d.init);
        if (secretLiteral(v)) hit(d, `'${d.name}'`, v);
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        const l = U.strip(a.left);
        const nm = l && (l.type === 'Identifier' ? l.name : l.type === 'MemberExpr' ? l.member : null);
        const v = U.strLit(a.right);
        if (nm && secretName(nm) && secretLiteral(v)) hit(a, `'${U.src(unit, l)}'`, v);
      }
      for (const c of S.calls(unit, ['strcpy', 'strncpy', 'strlcpy', 'wcscpy', 'memcpy', 'strcmp', 'strncmp', 'memcmp', 'strcasecmp', 'wcscmp'], api.project)) {
        const a0 = U.strip(c.args[0]), a1 = U.strip(c.args[1]);
        const pairs = /cmp/.test(c.name) ? [[a0, a1], [a1, a0]] : [[a0, a1]];
        for (const [x, y] of pairs) {
          const nm = x && (x.type === 'Identifier' ? x.name : x.type === 'MemberExpr' ? x.member : null);
          const v = U.strLit(y);
          if (nm && secretName(nm) && secretLiteral(v)) { hit(c.node, `'${U.src(unit, x)}' (${c.name})`, v); break; }
        }
      }
      for (const c of S.calls(unit, Object.keys(AUTH_ARG), api.project)) {
        const v = U.strLit(c.args[AUTH_ARG[c.name]]);
        if (v && v.length) hit(c.node, `the password argument of ${c.name}()`, v, `${c.name}() 의 비밀번호 인수`);
      }
      for (const s of U.nodes(unit, 'StringLiteral')) {
        const m = /(?:^|[;\s])(?:password|pwd|passwd)\s*=\s*([^;\s'"]{3,})/i.exec(s.value || '');
        if (m && !/^[%$]/.test(m[1]) && !/[{}%]/.test(m[1])) hit(s, 'a connection string password', m[1], '연결 문자열의 비밀번호');
      }
      for (const m of unit.macros || []) {
        if (!m.file || m.file.startsWith('<') || m.kind !== 'object' || !secretName(m.name) || m.body.length !== 1 || m.body[0].kind !== 'string') continue;
        const v = m.body[0].value.replace(/^[a-zA-Z0-9]*"/, '').replace(/"$/, '');
        if (secretLiteral(v)) hit({ file: m.file, line: m.line, col: m.col }, `macro '${m.name}'`, v, `매크로 '${m.name}'`);
      }
    },
  }),
];
