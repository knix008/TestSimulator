'use strict';

// SEI CERT C — ENV: environment.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const { M, T, cf } = U;

// Functions returning a pointer to static, library-owned storage that the next call may overwrite.
const STATIC_RESULT = new Set(['getenv', 'setlocale', 'localeconv', 'strerror', 'asctime', 'ctime', 'gmtime', 'localtime', 'tmpnam', 'getlogin', 'ttyname', 'inet_ntoa', 'strsignal', 'getpwnam', 'getpwuid', 'getgrnam', 'gethostbyname']);
const MODIFIABLE_NOT = new Set(['getenv', 'setlocale', 'localeconv', 'strerror', 'asctime', 'ctime', 'strsignal']);
const WRITERS = new Set(['strcpy', 'strncpy', 'strcat', 'strncat', 'memset', 'memcpy', 'memmove', 'strtok', 'sprintf', 'snprintf']);
const ENV_MOD = new Set(['setenv', 'putenv', 'unsetenv', '_putenv', '_putenv_s', '_wputenv', 'clearenv', 'SetEnvironmentVariable', 'SetEnvironmentVariableA', 'SetEnvironmentVariableW']);
const EXITS = new Set(['exit', 'quick_exit', 'longjmp', 'siglongjmp', '_longjmp']);

// Functions sharing one static buffer.
const group = (n) => (n === 'asctime' || n === 'ctime' ? 'asctime' : n === 'gmtime' || n === 'localtime' ? 'tm' : n);

function resultVar(call) {
  let n = call, p = U.parent(call);
  while (p && (p.type === 'CastExpr' || p.type === 'ParenExpr')) { n = p; p = U.parent(p); }
  const r = U.resultUse(n);
  return r.kind === 'var' ? r.sym : null;
}

module.exports = [
  rule('ENV30-C', {
    risk: 'LPM', cwe: ['CWE-471'],
    name: ['Do not modify the object referenced by the return value of certain functions', '일부 함수의 반환값이 가리키는 객체를 수정하지 마세요'],
    why: ['getenv(), setlocale(), localeconv(), strerror() and asctime() return library-owned storage; writing to it is undefined behavior.', 'getenv(), setlocale(), localeconv(), strerror(), asctime() 는 라이브러리 소유 저장소를 반환해 이를 수정하면 정의되지 않은 동작입니다.'],
    fix: ['Copy the string (strdup / a local buffer) and modify the copy.', '문자열을 복사(strdup 또는 지역 버퍼)해 복사본을 수정하세요.'],
  }, {
    check(unit, api) {
      const owned = new Map();
      for (const c of U.libCalls(unit, MODIFIABLE_NOT)) {
        const s = resultVar(c);
        if (s) owned.set(s, c);
      }
      const origin = (e) => {
        e = U.strip(e);
        if (!e) return null;
        if (e.type === 'CallExpr' && U.isLib(e, MODIFIABLE_NOT)) return e;
        if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) return origin(e.left);
        const s = U.idSym(e);
        return s && owned.has(s) ? owned.get(s) : null;
      };
      const say = (node, base, src) => api.report(node, M(`Writes through '${U.src(unit, base)}', which points to storage returned by ${U.callName(src)}().`, `${U.callName(src)}() 가 반환한 저장소를 가리키는 '${U.src(unit, base)}' 를 통해 값을 씁니다.`));
      for (const a of U.nodes(unit, ['AssignExpr', 'UnaryExpr'])) {
        const t = a.type === 'AssignExpr' ? U.strip(a.left) : (a.op === '++' || a.op === '--') ? U.strip(a.arg) : null;
        if (!t) continue;
        let base = null;
        if (t.type === 'IndexExpr') base = t.object;
        else if (t.type === 'UnaryExpr' && t.op === '*') base = t.arg;
        else if (t.type === 'MemberExpr' && t.arrow) base = t.object;
        const o = base && origin(base);
        if (o) say(a, base, o);
      }
      for (const c of U.libCalls(unit, WRITERS)) {
        const o = origin(c.args[0]);
        if (o) say(c, c.args[0], o);
      }
    },
  }),

  rule('ENV31-C', {
    risk: 'LPM', cwe: ['CWE-562'], approx: true,
    name: ['Do not rely on an environment pointer following an operation that may invalidate it', '환경을 무효화할 수 있는 작업 뒤에는 환경 포인터에 의존하지 마세요'],
    why: ['setenv()/putenv() may reallocate the environment, leaving the envp parameter of main() pointing to freed memory.', 'setenv()/putenv() 는 환경을 다시 할당할 수 있어 main() 의 envp 매개변수가 해제된 메모리를 가리키게 됩니다.'],
    fix: ['Use the global environ (or getenv) after modifying the environment, not envp.', '환경을 바꾼 뒤에는 envp 대신 전역 environ(또는 getenv)을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (fn.name !== 'main' || !fn.params || fn.params.length < 3) continue;
        const envp = fn.params[2].symbol;
        if (!envp) continue;
        const mods = U.libCallsIn(fn.body, ENV_MOD);
        if (!mods.length) continue;
        const first = mods[0];
        const use = (envp.uses || []).find((u) => u.loc && u.loc.start > first.loc.start);
        if (use) api.report(use, M(`'${envp.name}' is used after ${U.callName(first)}() on line ${first.loc.line}, which may have reallocated the environment.`, `${first.loc.line}행의 ${U.callName(first)}() 가 환경을 다시 할당했을 수 있는데 그 뒤에 '${envp.name}' 를 사용합니다.`));
      }
    },
  }),

  rule('ENV32-C', {
    risk: 'MLM', cwe: ['CWE-705'],
    name: ['All exit handlers must return normally', '모든 종료 처리기는 정상적으로 반환해야 합니다'],
    why: ['Calling exit() or longjmp() from a function registered with atexit()/at_quick_exit() is undefined behavior and may skip other handlers.', 'atexit()/at_quick_exit() 로 등록한 함수에서 exit() 나 longjmp() 를 호출하면 정의되지 않은 동작이며 다른 처리기를 건너뛸 수 있습니다.'],
    fix: ['Let exit handlers simply return; do any cleanup without calling exit-like functions.', '종료 처리기는 그냥 반환하게 하고 정리 작업에서 exit 류 함수를 호출하지 마세요.'],
  }, {
    check(unit, api) {
      for (const reg of U.libCalls(unit, new Set(['atexit', 'at_quick_exit']))) {
        const h = U.fnFromExpr(reg.args[0], api.project);
        if (!h) continue;
        for (const def of U.reachableDefs(h, api.project)) {
          for (const c of U.libCallsIn(def.body, EXITS)) {
            api.report(c, M(`${U.callName(c)}() is reachable from exit handler ${h.name}() registered on line ${reg.loc.line}${def !== h ? ` (via ${def.name}())` : ''}.`, `${reg.loc.line}행에서 등록한 종료 처리기 ${h.name}() 에서 ${U.callName(c)}() 를 호출합니다${def !== h ? ` (${def.name}() 경유)` : ''}.`), { file: c.loc.file });
          }
        }
      }
    },
  }),

  rule('ENV33-C', {
    risk: 'HPM', cwe: ['CWE-78', 'CWE-88'], sec: true, checker: 'OS_CMD_INJECTION',
    name: ['Do not call system()', 'system() 을 호출하지 마세요'],
    why: ['system() and popen() run a shell: any part of the command that comes from outside can inject commands, and PATH/IFS can redirect which program runs.', 'system() 과 popen() 은 셸을 실행해 외부에서 온 명령 일부가 명령 주입을 일으키고 PATH/IFS 로 실행 프로그램이 바뀔 수 있습니다.'],
    fix: ['Use execve()/posix_spawn() with an absolute path and an argument vector, or a library API instead of a command.', '절대 경로와 인수 배열로 execve()/posix_spawn() 을 쓰거나 명령 대신 라이브러리 API 를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['system', '_wsystem', 'popen', '_popen', '_wpopen']))) {
        if (/system/.test(U.callName(c)) && U.isNullConst(c.args[0])) continue; // system(NULL) only queries for a shell
        const lit = U.strLit(c.args[0]);
        api.report(c, M(lit != null
          ? `${U.callName(c)}("${lit}") runs a command through the shell.`
          : `${U.callName(c)}() runs the shell with the non-constant command '${U.src(unit, c.args[0])}'.`,
        lit != null ? `${U.callName(c)}("${lit}") 가 셸을 통해 명령을 실행합니다.` : `${U.callName(c)}() 가 상수가 아닌 명령 '${U.src(unit, c.args[0])}' 로 셸을 실행합니다.`));
      }
    },
  }),

  rule('ENV34-C', {
    risk: 'LPM', cwe: ['CWE-416', 'CWE-825'], approx: true,
    name: ['Do not store pointers returned by certain functions', '일부 함수가 반환한 포인터를 저장해 두지 마세요'],
    why: ['getenv(), setlocale(), strerror(), asctime() and similar may overwrite the same static buffer on the next call, so a stored pointer silently changes value.', 'getenv(), setlocale(), strerror(), asctime() 등은 다음 호출에서 같은 정적 버퍼를 덮어쓸 수 있어 저장한 포인터의 값이 몰래 바뀝니다.'],
    fix: ['Copy the result (strdup / strncpy into your own buffer) before calling the function again.', '함수를 다시 호출하기 전에 결과를 복사(strdup 또는 자체 버퍼로 strncpy)하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        const calls = U.libCallsIn(fn.body, STATIC_RESULT);
        if (calls.length < 2) continue;
        for (const c of calls) {
          const s = resultVar(c);
          if (!s || s.kind !== 'variable') continue;
          const name = U.callName(c);
          const later = calls.find((o) => o !== c && o.loc.start > c.loc.start && group(U.callName(o)) === group(name));
          if (!later) continue;
          // reassigned in between?
          const reassigned = (s.uses || []).some((u) => { const p = U.parent(u); return p && p.type === 'AssignExpr' && p.left === u && u.loc.start > c.loc.start && u.loc.start < later.loc.start; });
          if (reassigned) continue;
          const use = (s.uses || []).find((u) => u.loc && u.loc.start > later.loc.end && cf.ancestors(u).includes(fn) && !(U.parent(u).type === 'AssignExpr' && U.parent(u).left === u));
          if (use) api.report(use, M(`'${s.name}' holds the result of ${name}() from line ${c.loc.line}, but ${U.callName(later)}() on line ${later.loc.line} may have overwritten it.`, `'${s.name}' 는 ${c.loc.line}행 ${name}() 의 결과인데 ${later.loc.line}행의 ${U.callName(later)}() 가 덮어썼을 수 있습니다.`));
        }
      }
    },
  }),
];
