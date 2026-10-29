'use strict';

// Per-function analyses for chapter 22 (and 21.20): heap / FILE resources,
// errno protocol, mutex ownership and thread join state. Each analysis runs
// once per function definition and is cached; rules pick their own events.

const cf = require('../../cfamily');
const B = require('./b-common');
const F = require('./b-flow');

const { msg, text, stripCasts, skipParens, calleeName } = B;

const ALLOC = new Set(['malloc', 'calloc', 'realloc', 'aligned_alloc', 'strdup', 'strndup']);
const OPEN = new Set(['fopen', 'tmpfile', 'freopen', 'popen']);
const CLOSE = new Set(['fclose', 'pclose']);
const WRITERS = new Map([
  ['fprintf', 0], ['vfprintf', 0], ['fputs', 1], ['fputc', 1], ['putc', 1], ['fwrite', 3], ['fputwc', 1], ['fputws', 1],
  ['fwprintf', 0], ['vfwprintf', 0],
]);
const WRITER_NAMES = new Set(WRITERS.keys());
// functions that use a pointer argument without keeping it
const NO_ESCAPE = new Set([
  'memcpy', 'memmove', 'memset', 'memcmp', 'memchr', 'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp', 'strlen',
  'strchr', 'strrchr', 'strstr', 'strspn', 'strcspn', 'strpbrk', 'strtok', 'printf', 'fprintf', 'sprintf', 'snprintf', 'vprintf',
  'vfprintf', 'vsprintf', 'vsnprintf', 'scanf', 'fscanf', 'sscanf', 'fgets', 'fputs', 'fputc', 'fgetc', 'getc', 'putc', 'puts',
  'fread', 'fwrite', 'fseek', 'ftell', 'rewind', 'fflush', 'feof', 'ferror', 'clearerr', 'ungetc', 'fgetpos', 'fsetpos', 'setvbuf',
  'setbuf', 'perror', 'atoi', 'atol', 'atoll', 'atof', 'strtol', 'strtoul', 'strtoll', 'strtoull', 'strtod', 'strtof', 'strtold',
  'fileno', 'qsort', 'bsearch',
]);

const argSym = (e) => {
  const x = stripCasts(e);
  return x && x.type === 'Identifier' && x.symbol && (x.symbol.kind === 'variable' || x.symbol.kind === 'parameter') && x.symbol.storage === 'automatic' ? x.symbol : null;
};

function openMode(call) {
  const n = calleeName(call);
  if (n === 'tmpfile') return 'W';
  const m = stripCasts(call.args[n === 'popen' ? 1 : 1]);
  if (!m || m.type !== 'StringLiteral') return 'O';
  const v = m.value || '';
  if (n === 'popen') return v.startsWith('r') ? 'R' : 'W';
  if (v.startsWith('r') && !v.includes('+')) return 'R';
  return 'W';
}

function isNullConst(e) {
  const y = stripCasts(e);
  return !!(y && ((y.type === 'IntegerLiteral' && y.value === 0n) || (y.loc && y.loc.macro === 'NULL')));
}

// Value class of an assigned expression.
function classify(rhs, st) {
  const x = stripCasts(rhs);
  if (!x) return '?';
  if (x.type === 'CallExpr') {
    const n = calleeName(x);
    if (n && ALLOC.has(n) && B.isLibCall(x, ALLOC)) return 'A';
    if (n && OPEN.has(n) && B.isLibCall(x, OPEN)) return openMode(x);
    return '?';
  }
  if (isNullConst(x)) return 'N';
  if (x.type === 'StringLiteral') return 'S';
  if (x.type === 'UnaryExpr' && x.op === '&') return 'S';
  if (x.type === 'Identifier' && x.symbol && B.isArrayType(x.symbol.type) && x.symbol.kind !== 'parameter') return 'S';
  void st;
  return '?';
}

const HELD = ['A', 'R', 'W', 'O'];

const RES = new WeakMap();
function resources(fd, unit) {
  if (RES.has(fd)) return RES.get(fd);
  const sites = new Map(); // sym -> node of the last acquisition
  const tracked = (s) => s && s.kind === 'variable' && s.storage === 'automatic';
  const setState = (st, s, v) => st.set(s, new Set([v]));
  const events = F.run(fd, {
    node(n, st, emit) {
      if (n.type === 'Identifier' && n.symbol && st.has(n.symbol)) {
        const set = st.get(n.symbol);
        if (F.only(set, 'C')) {
          const p = cf.parentOf(n);
          if (!(p && p.type === 'SizeofExpr')) emit('22.6', n, msg(`The FILE pointer '${n.name}' is used after its stream was closed.`, `스트림이 닫힌 뒤 FILE 포인터 '${n.name}'을(를) 사용합니다.`));
        }
        return;
      }
      if (n.type === 'UnaryExpr' && n.op === '&') {
        const s = argSym(n.arg);
        if (s && st.has(s)) setState(st, s, '?');
        return;
      }
      if (n.type === 'CallExpr') {
        const nm = calleeName(n);
        const lib = (set) => nm && set.has(nm) && B.isLibCall(n, set);
        if (lib(new Set(['free']))) {
          const a = n.args[0];
          const s = argSym(a);
          if (s && st.has(s)) {
            const set = st.get(s);
            if (F.only(set, 'F')) emit('22.2', n, msg(`'${s.name}' is freed again after it was already freed.`, `이미 해제된 '${s.name}'을(를) 다시 해제합니다.`));
            else if (F.only(set, 'S')) emit('22.2', n, msg(`'${s.name}' points to memory that was not allocated by malloc, calloc or realloc.`, `'${s.name}'은(는) malloc, calloc, realloc으로 할당되지 않은 메모리를 가리킵니다.`));
            else if (['R', 'W', 'O'].some((x) => F.only(set, x))) emit('22.2', n, msg(`'${s.name}' is a FILE pointer from fopen and must be closed with fclose, not freed.`, `'${s.name}'은(는) fopen으로 얻은 FILE 포인터이므로 free가 아니라 fclose로 닫아야 합니다.`));
            setState(st, s, 'F');
          } else if (s) {
            setState(st, s, 'F');
          } else if (a) {
            const c = classify(a, st);
            if (c === 'S' && !isNullConst(a)) emit('22.2', n, msg(`'${text(unit, a)}' is not memory allocated by the standard library.`, `'${text(unit, a)}'은(는) 표준 라이브러리로 할당한 메모리가 아닙니다.`));
          }
          return;
        }
        if (lib(CLOSE)) {
          const s = argSym(n.args[0]);
          if (s) setState(st, s, 'C');
          return;
        }
        if (nm && WRITERS.has(nm) && B.isLibCall(n, WRITER_NAMES)) {
          const s = argSym(n.args[WRITERS.get(nm)]);
          if (s && F.only(st.get(s), 'R')) emit('22.4', n, msg(`'${nm}' writes to '${s.name}', which was opened read-only.`, `'${nm}'이(가) 읽기 전용으로 연 '${s.name}'에 씁니다.`));
          return;
        }
        if (nm && (NO_ESCAPE.has(nm) || nm === 'realloc')) {
          if (nm === 'realloc') { const s = argSym(n.args[0]); if (s && st.has(s)) setState(st, s, '?'); }
          return;
        }
        // unknown callee: pointer arguments escape
        for (const a of n.args) {
          const s = argSym(a);
          if (s && st.has(s)) setState(st, s, '?');
        }
        return;
      }
      if (n.type === 'AssignExpr' || n.type === 'VarDecl') {
        const rhs = n.type === 'AssignExpr' ? n.right : n.init;
        // value copied into another object: the tracked pointer escapes
        const rs = rhs && argSym(rhs);
        if (rs && st.has(rs)) setState(st, rs, '?');
        let target = null;
        if (n.type === 'VarDecl') target = n.symbol;
        else if (n.op === '=') { const l = skipParens(n.left); if (l && l.type === 'Identifier') target = l.symbol; }
        if (!tracked(target)) return;
        if (n.type === 'AssignExpr' && st.has(target)) {
          const old = st.get(target);
          const reallocSelf = rhs && stripCasts(rhs).type === 'CallExpr' && calleeName(stripCasts(rhs)) === 'realloc';
          if (HELD.some((h) => old.has(h)) && !reallocSelf && sites.get(target)) {
            const site = sites.get(target);
            emit('22.1', n, msg(`'${target.name}' is overwritten while still holding the resource obtained at line ${site.loc.line}.`, `'${target.name}'이(가) ${site.loc.line}행에서 얻은 자원을 아직 가진 채 덮어써집니다.`));
          }
        }
        if (n.type === 'VarDecl' && !rhs) { st.delete(target); return; }
        const c = classify(rhs, st);
        if (HELD.includes(c)) sites.set(target, n);
        if (c === 'F') setState(st, target, '?');
        else setState(st, target, c);
        return;
      }
      if (n.type === 'ReturnStmt' && n.arg) {
        cf.walk(n.arg, (x) => { if (x.type === 'Identifier' && x.symbol && st.has(x.symbol)) setState(st, x.symbol, '?'); });
        return;
      }
      if (n.type === 'InitList') {
        cf.walk(n, (x) => { if (x.type === 'Identifier' && x.symbol && st.has(x.symbol)) setState(st, x.symbol, '?'); });
      }
    },
    edge(e, st) {
      if (e.kind !== 'true' && e.kind !== 'false') return st;
      const t = F.nullTest(e.cond);
      if (!t || !st.has(t.sym)) return st;
      const isNull = (e.kind === 'true') === t.nullWhenTrue;
      if (isNull) st.set(t.sym, new Set(['N']));
      else {
        const s = st.get(t.sym);
        s.delete('N');
        if (!s.size) s.add('?');
      }
      return st;
    },
    exit(st, emit) {
      for (const [s, set] of st) {
        if (!tracked(s) || !HELD.some((h) => set.has(h))) continue;
        const site = sites.get(s);
        if (!site) continue;
        const file = set.has('A') ? null : 'file';
        emit('22.1', site, file
          ? msg(`The stream opened into '${s.name}' is not closed on every path out of '${fd.name}'.`, `'${s.name}'에 연 스트림이 '${fd.name}'의 모든 종료 경로에서 닫히지 않습니다.`)
          : msg(`The memory allocated to '${s.name}' is not freed on every path out of '${fd.name}'.`, `'${s.name}'에 할당한 메모리가 '${fd.name}'의 모든 종료 경로에서 해제되지 않습니다.`));
      }
    },
  });
  RES.set(fd, events);
  return events;
}

// ---------------------------------------------------------------------------
// errno (22.8 - 22.10)

const ERRNO_SETTING = new Set([
  'ftell', 'fgetpos', 'fsetpos', 'fgetwc', 'fputwc', 'strtoimax', 'strtoumax', 'strtol', 'strtoul', 'strtoll', 'strtoull', 'strtof',
  'strtod', 'strtold', 'wcstoimax', 'wcstoumax', 'wcstol', 'wcstoul', 'wcstoll', 'wcstoull', 'wcstof', 'wcstod', 'wcstold', 'wcrtomb',
  'wcsrtombs', 'mbrtowc', 'mbsrtowcs', 'mbrtoc16', 'c16rtomb', 'mbrtoc32', 'c32rtomb',
]);

// Functions that POSIX (not ISO C) documents as setting errno when they fail:
// reading errno right after one of them is what their documentation asks for
// (22.10), but they are not the errno-setting functions of 22.8 / 22.9.
const POSIX_ERRNO = new Set([
  'open', 'openat', 'creat', 'close', 'read', 'write', 'pread', 'pwrite', 'readv', 'writev', 'lseek', 'fsync', 'fdatasync',
  'ioctl', 'fcntl', 'dup', 'dup2', 'pipe', 'mkfifo', 'select', 'pselect', 'poll', 'epoll_create', 'epoll_ctl', 'epoll_wait',
  'socket', 'socketpair', 'bind', 'listen', 'accept', 'accept4', 'connect', 'send', 'sendto', 'sendmsg', 'recv', 'recvfrom',
  'recvmsg', 'shutdown', 'setsockopt', 'getsockopt', 'getsockname', 'getpeername', 'inet_pton',
  'tcgetattr', 'tcsetattr', 'tcflush', 'tcdrain', 'cfsetispeed', 'cfsetospeed',
  'stat', 'fstat', 'lstat', 'access', 'mkdir', 'rmdir', 'unlink', 'link', 'symlink', 'readlink', 'chdir', 'chmod', 'chown',
  'truncate', 'ftruncate', 'opendir', 'readdir', 'closedir', 'realpath', 'getcwd',
  'fork', 'execv', 'execvp', 'execve', 'execl', 'execlp', 'waitpid', 'wait', 'kill', 'sigaction', 'nanosleep', 'usleep',
  'mmap', 'munmap', 'mprotect', 'shm_open', 'sem_open', 'sem_wait', 'sem_post', 'clock_gettime', 'clock_settime', 'gettimeofday',
  'settimeofday', 'setenv', 'mount', 'umount', 'umount2', 'statvfs', 'fstatvfs', 'sysinfo', 'reboot', 'chroot', 'inotify_init',
  'fopen', 'fdopen', 'freopen', 'fclose', 'fflush', 'fseek', 'fread', 'fwrite', 'fgets', 'fputs', 'remove', 'rename',
  'tmpfile', 'popen', 'pclose', 'malloc', 'calloc', 'realloc', 'strdup', 'system',
]);

function isErrno(n) {
  if (!n) return false;
  if (n.type === 'Identifier' && n.name === 'errno') return true;
  if (n.loc && n.loc.macro === 'errno' && n.type === 'UnaryExpr' && n.op === '*') return true;
  return false;
}

const ERR = new WeakMap();
function errnoEvents(fd, unit) {
  if (ERR.has(fd)) return ERR.get(fd);
  const pendingCalls = new Map();
  const events = F.run(fd, {
    init() { return new Map([['zero', new Set(['N'])], ['last', new Set(['O'])]]); },
    node(n, st, emit) {
      if (n.type === 'AssignExpr' && isErrno(skipParens(n.left))) {
        st.set('zero', new Set([n.op === '=' && B.constInt(n.right, unit) === 0n ? 'Y' : 'N']));
        return;
      }
      if (isErrno(n)) {
        const p = cf.parentOf(n);
        if (p && p.type === 'AssignExpr' && skipParens(p.left) === n) return;
        let q = n;
        let pp = p;
        while (pp && pp.type === 'ParenExpr') { q = pp; pp = cf.parentOf(pp); }
        if (pp && pp.type === 'AssignExpr' && pp.left === q) return;
        // a read of errno: it tests the pending calls
        if (!F.only(st.get('last'), 'E')) emit('22.10', n, msg('errno is tested although the last function called is not an errno-setting function.', '마지막으로 호출한 함수가 errno 설정 함수가 아닌데 errno를 검사합니다.'));
        for (const k of [...st.keys()]) if (k.startsWith('p')) st.delete(k);
        return;
      }
      if (n.type === 'CallExpr') {
        const nm = calleeName(n);
        if (nm && ERRNO_SETTING.has(nm) && B.isLibCall(n, ERRNO_SETTING)) {
          if (!F.only(st.get('zero'), 'Y')) emit('22.8', n, msg(`errno is not set to zero before calling the errno-setting function '${nm}'.`, `errno 설정 함수 '${nm}'을(를) 호출하기 전에 errno를 0으로 설정하지 않았습니다.`));
          for (const [k, v] of [...st]) if (k.startsWith('p') && v.has('P')) { emit('22.9', pendingCalls.get(k), pendMsg(pendingCalls.get(k))); st.delete(k); }
          const key = `p${n.loc.start}`;
          pendingCalls.set(key, n);
          st.set(key, new Set(['P']));
          st.set('zero', new Set(['N']));
          st.set('last', new Set(['E']));
          return;
        }
        if (B.callIsPure(n, unit)) return;
        for (const [k, v] of [...st]) if (k.startsWith('p') && v.has('P')) { emit('22.9', pendingCalls.get(k), pendMsg(pendingCalls.get(k))); st.delete(k); }
        st.set('zero', new Set(['N']));
        st.set('last', new Set([nm && POSIX_ERRNO.has(nm) && B.isLibCall(n, POSIX_ERRNO) ? 'E' : 'O']));
      }
    },
    exit(st, emit) {
      for (const [k, v] of st) if (k.startsWith('p') && v.has('P')) emit('22.9', pendingCalls.get(k), pendMsg(pendingCalls.get(k)));
    },
  });
  ERR.set(fd, events);
  return events;
}
function pendMsg(call) {
  const nm = calleeName(call);
  return msg(`errno is not tested after the errno-setting function '${nm}' and before the next call or return.`, `errno 설정 함수 '${nm}' 호출 후 다음 호출이나 반환 전에 errno를 검사하지 않습니다.`);
}

// ---------------------------------------------------------------------------
// mutexes (22.16 - 22.18) and threads (22.11)

// Stable key of a thread / synchronisation object argument.
function objKey(e, unit) {
  let x = stripCasts(e);
  let addr = false;
  if (x && x.type === 'UnaryExpr' && x.op === '&') { x = skipParens(x.arg); addr = true; }
  if (x && x.type === 'Identifier' && x.symbol) {
    const s = x.symbol;
    if (s.storage === 'static' || s.storage === 'thread') return { key: s.linkage === 'external' ? `g:${s.qname}` : `g:${s.file}#${s.qname}`, name: s.name, sym: s, global: true };
    return { key: `l:${s.id}`, name: s.name, sym: s, global: false };
  }
  const t = text(unit, x || e, 80);
  return { key: `t:${addr ? '' : '*'}${t}`, name: t, sym: null, global: false };
}

const LOCKS = new Set(['mtx_lock', 'mtx_timedlock', 'mtx_trylock']);

function lockedIn(fd, unit) {
  const out = new Set();
  if (!fd || !fd.body) return out;
  cf.walk(fd.body, (n) => {
    if (n.type === 'CallExpr' && LOCKS.has(calleeName(n)) && n.args[0]) out.add(objKey(n.args[0], unit).key);
  });
  return out;
}

const MTX = new WeakMap();
function mutexEvents(fd, unit, info) {
  if (MTX.has(fd)) return MTX.get(fd);
  const threadStart = info.threadStarts.has(fd.name);
  const names = new Map();
  const nameOf = (key) => names.get(key) || key.slice(2).split('#').pop();
  const events = F.run(fd, {
    node(n, st, emit) {
      if (n.type !== 'CallExpr') return;
      const nm = calleeName(n);
      if (!nm) return;
      if (LOCKS.has(nm) && n.args[0]) {
        const k = objKey(n.args[0], unit);
        names.set(k.key, k.name);
        const cur = st.get(k.key);
        if (F.only(cur, 'L') && !info.recursive.has(k.key)) emit('22.18', n, msg(`Non-recursive mutex '${k.name}' is locked again while this thread already holds it.`, `재귀적이지 않은 뮤텍스 '${k.name}'을(를) 이미 잠근 상태에서 다시 잠급니다.`));
        st.set(k.key, new Set(['L']));
        return;
      }
      if (nm === 'mtx_unlock' && n.args[0]) {
        const k = objKey(n.args[0], unit);
        const cur = st.get(k.key);
        if (F.only(cur, 'U') || (!cur && threadStart)) emit('22.17', n, msg(`Mutex '${k.name}' is unlocked although this thread has not locked it.`, `이 스레드가 잠그지 않은 뮤텍스 '${k.name}'을(를) 잠금 해제합니다.`));
        st.set(k.key, new Set(['U']));
        return;
      }
      if ((nm === 'cnd_wait' || nm === 'cnd_timedwait') && n.args[1]) {
        const k = objKey(n.args[1], unit);
        const cur = st.get(k.key);
        if (F.only(cur, 'U') || (!cur && threadStart)) emit('22.17', n, msg(`'${nm}' is called with mutex '${k.name}', which this thread has not locked.`, `이 스레드가 잠그지 않은 뮤텍스 '${k.name}'로 '${nm}'을(를) 호출합니다.`));
        return;
      }
      // direct call of a function that locks a mutex this thread holds
      const cs = n.calleeSymbol;
      const def = cs && cs.definition && cs.definition.body ? cs.definition : null;
      if (def && def !== fd) {
        for (const key of lockedIn(def, unit)) {
          if (!key.startsWith('g:') || info.recursive.has(key)) continue;
          if (F.only(st.get(key), 'L')) emit('22.18', n, msg(`'${nm}' locks mutex '${key.slice(2).split('#').pop()}', which the caller already holds.`, `'${nm}'이(가) 호출자가 이미 잠근 뮤텍스 '${key.slice(2).split('#').pop()}'을(를) 잠급니다.`));
        }
      }
    },
    exit(st, emit) {
      for (const [k, set] of st) {
        if (!set.has('L')) continue;
        emit('22.16', fd.nameLoc ? { loc: { ...fd.nameLoc, file: fd.loc.file } } : fd, msg(`'${fd.name}' can return while still holding mutex '${nameOf(k)}'.`, `'${fd.name}'이(가) 뮤텍스 '${nameOf(k)}'을(를) 잠근 채 반환할 수 있습니다.`));
      }
    },
  });
  MTX.set(fd, events);
  return events;
}

const THR = new WeakMap();
function threadEvents(fd, unit) {
  if (THR.has(fd)) return THR.get(fd);
  const events = F.run(fd, {
    node(n, st, emit) {
      if (n.type !== 'CallExpr') return;
      const nm = calleeName(n);
      if (nm === 'thrd_create' && n.args[0]) { st.set(objKey(n.args[0], unit).key, new Set(['C'])); return; }
      if ((nm === 'thrd_join' || nm === 'thrd_detach') && n.args[0]) {
        const k = objKey(n.args[0], unit);
        const cur = st.get(k.key);
        if (cur && cur.has('J') && !cur.has('C')) emit('22.11', n, msg(`Thread '${k.name}' was already joined or detached before this '${nm}'.`, `스레드 '${k.name}'은(는) 이 '${nm}' 이전에 이미 join 또는 detach되었습니다.`));
        st.set(k.key, new Set(['J']));
      }
    },
  });
  THR.set(fd, events);
  return events;
}

// Project facts for the thread rules: mutex init types, thread start routines.
const PINFO = new WeakMap();
function projectInfo(project, unitForKeys) {
  const key = project || unitForKeys;
  if (PINFO.has(key)) return PINFO.get(key);
  const info = { recursive: new Set(), timed: new Map(), inits: new Map(), threadStarts: new Set(), tss: new Set() };
  const units = project ? project.units : [unitForKeys];
  for (const u of units) {
    for (const c of B.nodes(u, 'CallExpr')) {
      const nm = calleeName(c);
      if (nm === 'mtx_init' && c.args[0]) {
        const k = objKey(c.args[0], u).key;
        const t = c.args[1] ? text(u, c.args[1], 200) : '';
        if (/mtx_recursive/.test(t)) info.recursive.add(k);
        info.timed.set(k, (info.timed.get(k) || false) || /mtx_timed/.test(t));
        info.inits.set(k, true);
      } else if (nm === 'cnd_init' && c.args[0]) info.inits.set(objKey(c.args[0], u).key, true);
      else if (nm === 'tss_create' && c.args[0]) info.tss.add(objKey(c.args[0], u).key);
      else if (nm === 'thrd_create' && c.args[1]) {
        const f = stripCasts(c.args[1]);
        const g = f && f.type === 'UnaryExpr' && f.op === '&' ? skipParens(f.arg) : f;
        if (g && g.type === 'Identifier') info.threadStarts.add(g.name);
      }
    }
  }
  PINFO.set(key, info);
  return info;
}

module.exports = { resources, errnoEvents, mutexEvents, threadEvents, projectInfo, objKey, ALLOC, OPEN, ERRNO_SETTING, isErrno };
