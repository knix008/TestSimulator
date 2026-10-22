'use strict';

// SEI CERT C — SIG: signals.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const S = require('../lib/sys');
const { M, cf } = U;

// POSIX.1-2016 async-signal-safe functions plus the C standard ones.
const SAFE = new Set(`_Exit _exit abort accept access aio_error aio_return aio_suspend alarm bind cfgetispeed cfgetospeed
cfsetispeed cfsetospeed chdir chmod chown clock_gettime close connect creat dup dup2 execl execle execv execve faccessat
fchdir fchmod fchmodat fchown fchownat fcntl fdatasync fexecve ffs fork fstat fstatat fsync ftruncate futimens getegid
geteuid getgid getgroups getpeername getpgrp getpid getppid getsockname getsockopt getuid htonl htons kill link linkat
listen lseek lstat memccpy memchr memcmp memcpy memmove memset mkdir mkdirat mkfifo mkfifoat
mknod mknodat ntohl ntohs open openat pause pipe poll posix_trace_event pselect pthread_kill pthread_self pthread_sigmask
quick_exit raise read readlink readlinkat recv recvfrom recvmsg rename renameat rmdir select sem_post send sendmsg sendto
setgid setpgid setsid setsockopt setuid shutdown sigaction sigaddset sigdelset sigemptyset sigfillset sigismember signal
sigpause sigpending sigprocmask sigqueue sigset sigsuspend sleep sockatmark socket socketpair stat stpcpy stpncpy strcat
strchr strcmp strcpy strcspn strlen strncat strncmp strncpy strnlen strpbrk strrchr strspn strstr strtok_r symlink
symlinkat tcdrain tcflow tcflush tcgetattr tcgetpgrp tcsendbreak tcsetattr tcsetpgrp time timer_getoverrun timer_gettime
timer_settime times umask uname unlink unlinkat utime utimensat utimes wait waitpid wcpcpy wcpncpy wcscat wcschr wcscmp
wcscpy wcscspn wcslen wcsncat wcsncmp wcsncpy wcsnlen wcspbrk wcsrchr wcsspn wcsstr wcstok_r wmemchr wmemcmp wmemcpy
wmemmove wmemset write atomic_signal_fence atomic_load atomic_store atomic_exchange atomic_fetch_add atomic_fetch_sub
atomic_fetch_or atomic_fetch_and atomic_fetch_xor atomic_flag_test_and_set atomic_flag_clear atomic_is_lock_free`.split(/\s+/));

// Commonly misused functions that are reported even when no prototype is visible.
const UNSAFE = new Set(`printf fprintf sprintf snprintf vprintf vfprintf vsprintf vsnprintf puts fputs fputc putc putchar
fwrite fread fgets fgetc getc getchar scanf fscanf sscanf perror fopen fclose fflush freopen malloc calloc realloc free
aligned_alloc strdup strndup exit atexit at_quick_exit longjmp siglongjmp syslog openlog closelog strtok strerror
localtime gmtime asctime ctime mktime strftime setlocale localeconv getenv setenv putenv rand srand random srandom tmpnam
system popen pthread_mutex_lock pthread_mutex_unlock pthread_cond_signal pthread_cond_broadcast mtx_lock mtx_unlock
cnd_signal cnd_broadcast new delete operator_new`.split(/\s+/));

const via = (fn, roots) => {
  const r = roots.find((h) => h.fn === fn) || roots[0];
  return r.fn === fn ? { en: `signal handler '${S.fnLabel(fn)}'`, ko: `시그널 처리기 '${S.fnLabel(fn)}'` } : { en: `'${S.fnLabel(fn)}', called from signal handler '${S.fnLabel(r.fn)}'`, ko: `시그널 처리기 '${S.fnLabel(r.fn)}' 에서 호출되는 '${S.fnLabel(fn)}'` };
};

function canReturn(fn) {
  let g;
  try { g = cf.getCFG(fn); } catch (_) { return false; }
  const r = g.reachable();
  return g.exit.preds.some((e) => r.has(e.from) && e.kind !== 'noreturn' && e.kind !== 'throw' && e.kind !== 'exception');
}

const SIG_DFL_IGN = (unit, e) => {
  const t = U.src(unit, e).replace(/\s+/g, '');
  return /^(SIG_DFL|SIG_IGN|SIG_ERR)$/.test(t) || (e && e.loc && /^SIG_(DFL|IGN)$/.test(e.loc.macro || '')) || U.isNullConst(e);
};

module.exports = [
  rule('SIG30-C', {
    risk: 'HLM', cwe: ['CWE-479', 'CWE-662', 'CWE-828'], sec: true, approx: true,
    name: ['Call only asynchronous-safe functions within signal handlers', '시그널 처리기에서는 비동기 안전 함수만 호출하세요'],
    why: ['A signal can interrupt the program inside malloc(), printf() or any other non-reentrant library function; calling such a function again from the handler corrupts its internal state (heap, stdio buffers, locks) and can be exploited.', '시그널은 malloc(), printf() 등 재진입이 불가능한 함수 실행 도중에 올 수 있습니다. 처리기에서 같은 함수를 다시 부르면 힙, stdio 버퍼, 잠금 같은 내부 상태가 깨지고 공격에 악용될 수 있습니다.'],
    fix: ['In the handler only set a volatile sig_atomic_t flag (or call write(), _Exit(), abort()); do the real work in the main loop after checking the flag.', '처리기에서는 volatile sig_atomic_t 플래그만 설정하거나 write(), _Exit(), abort() 만 호출하고, 실제 작업은 주 루프에서 플래그를 확인한 뒤 하세요.'],
  }, {
    project(project, api) {
      const reach = S.reachMap(project, 'handlers');
      const seen = new Set();
      for (const [fn, roots] of reach) {
        for (const c of S.allLibCallsIn(fn.body, project)) {
          if (SAFE.has(c.name) || seen.has(c.node) || /^__builtin_/.test(c.name)) continue;
          const sym = c.node.calleeSymbol || (U.skip(c.node.callee) || {}).symbol;
          if (!UNSAFE.has(c.name) && !(sym && sym.system)) continue;
          seen.add(c.node);
          const w = via(fn, roots);
          api.report(c.node, M(`${c.name}() is not async-signal-safe but is called in ${w.en}.`, `${w.ko} 에서 비동기 시그널 안전하지 않은 ${c.name}() 를 호출합니다.`));
        }
      }
    },
  }),

  rule('SIG31-C', {
    risk: 'HLH', cwe: ['CWE-662', 'CWE-828'], approx: true,
    name: ['Do not access shared objects in signal handlers', '시그널 처리기에서 공유 객체에 접근하지 마세요'],
    why: ['A handler runs asynchronously with the interrupted code; reading or writing an ordinary static object from it is a data race with undefined behavior. Only volatile sig_atomic_t and lock-free atomic objects may be shared.', '처리기는 중단된 코드와 비동기로 실행되므로 일반 정적 객체를 읽거나 쓰면 데이터 경합이며 정의되지 않은 동작입니다. volatile sig_atomic_t 나 잠금 없는 원자 객체만 공유할 수 있습니다.'],
    fix: ['Communicate with the rest of the program through a volatile sig_atomic_t flag or a lock-free _Atomic object.', 'volatile sig_atomic_t 플래그나 잠금 없는 _Atomic 객체로만 나머지 프로그램과 통신하세요.'],
  }, {
    project(project, api) {
      const reach = S.reachMap(project, 'handlers');
      for (const [fn, roots] of reach) {
        const seen = new Set();
        for (const id of cf.findAll(fn.body, 'Identifier')) {
          const s = id.symbol;
          if (!s || s.kind !== 'variable' || s.storage !== 'static' || seen.has(s)) continue;
          if (s.name === 'errno' || s.system || s.isConstexpr || S.isConstType(s.type)) continue;
          if (S.isVolatileSigAtomic(s.type) || S.isAtomicSym(s)) continue;
          if (cf.enclosing(id, ['SizeofExpr', 'AlignofExpr'])) continue;
          const t = U.canon(s.type);
          if (t && t.kind === 'function') continue;
          seen.add(s);
          const w = via(fn, roots);
          const write = S.isWrite(S.lvalueTop(id));
          api.report(id, M(`'${s.name}' (${U.tstr(s.type)}) is ${write ? 'written' : 'read'} in ${w.en}; it is not volatile sig_atomic_t or a lock-free atomic.`, `${w.ko} 에서 '${s.name}'(${U.tstr(s.type)}) 를 ${write ? '씁니다' : '읽습니다'}. volatile sig_atomic_t 나 잠금 없는 원자 객체가 아닙니다.`));
        }
      }
    },
  }),

  rule('SIG34-C', {
    risk: 'LUL', cwe: ['CWE-479'], approx: true,
    name: ['Do not call signal() from within interruptible signal handlers', '중단될 수 있는 시그널 처리기 안에서 signal() 을 호출하지 마세요'],
    why: ['Re-installing a handler with signal() inside the handler leaves a window in which the signal has the default action (non-persistent handlers), and the call itself races with a second signal.', '처리기 안에서 signal() 로 처리기를 다시 등록하면 그 사이에 기본 동작이 적용되는 틈이 생기고(비지속 처리기), 호출 자체가 다음 시그널과 경합합니다.'],
    fix: ['Install the handler once with sigaction() (handlers stay installed), or do not reinstall it.', 'sigaction() 으로 한 번만 등록하거나(처리기가 유지됩니다) 다시 등록하지 마세요.'],
  }, {
    project(project, api) {
      const reach = S.reachMap(project, 'handlers');
      for (const [fn, roots] of reach) {
        const unit = S.unitOf(project, fn);
        for (const c of S.callsIn(fn.body, 'signal', project)) {
          if (!c.args[1] || SIG_DFL_IGN(unit, c.args[1])) continue;
          const w = via(fn, roots);
          api.report(c.node, M(`signal() re-installs a handler inside ${w.en}; use sigaction() instead.`, `${w.ko} 안에서 signal() 로 처리기를 다시 등록합니다. 대신 sigaction() 을 사용하세요.`));
        }
      }
    },
  }),

  rule('SIG35-C', {
    risk: 'LUH', cwe: ['CWE-248'], approx: true,
    name: ['Do not return from a computational exception signal handler', '계산 예외 시그널 처리기에서 반환하지 마세요'],
    why: ['Returning from a handler for SIGFPE, SIGILL or SIGSEGV (raised by the faulting instruction) is undefined behavior; execution usually restarts the same instruction and faults again.', 'SIGFPE, SIGILL, SIGSEGV 처리기에서 반환하면 정의되지 않은 동작입니다. 보통 같은 명령이 다시 실행되어 또 예외가 납니다.'],
    fix: ['End the handler with _Exit() or abort(), or do not catch these signals.', '처리기를 _Exit() 나 abort() 로 끝내거나 이 시그널들을 잡지 마세요.'],
  }, {
    project(project, api) {
      const done = new Set();
      for (const h of S.info(project).handlers) {
        if (!h.sig || !/^SIG(FPE|ILL|SEGV|BUS)$/.test(h.sig) || done.has(h.fn)) continue;
        done.add(h.fn);
        if (!canReturn(h.fn)) continue;
        api.report(h.fn.nameLoc ? { ...h.fn.nameLoc, file: h.fn.nameLoc.file || h.fn.loc.file } : h.fn, M(`Signal handler '${S.fnLabel(h.fn)}' for ${h.sig} can return; returning from a computational exception handler is undefined.`, `${h.sig} 처리기 '${S.fnLabel(h.fn)}' 가 반환할 수 있습니다. 계산 예외 처리기에서 반환하면 정의되지 않은 동작입니다.`));
      }
    },
  }),
];
