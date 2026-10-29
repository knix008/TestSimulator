'use strict';

// SEI CERT C — POS: POSIX.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const S = require('../lib/sys');
const { M, cf, T } = U;

const PRIV_UID = new Set(['setuid', 'seteuid', 'setreuid', 'setresuid']);
const PRIV_GID = new Set(['setgid', 'setegid', 'setregid', 'setresgid', 'setgroups', 'initgroups']);
const PRIV_ALL = new Set([...PRIV_UID, ...PRIV_GID]);
const OPENERS = new Set(['open', 'openat', 'fopen', 'creat', 'freopen']);
const EXEC = new Set(['execl', 'execle', 'execlp', 'execv', 'execve', 'execvp', 'execvpe', 'fexecve', 'posix_spawn', 'posix_spawnp']);
const FD_IO = new Set(['read', 'write', 'pread', 'pwrite', 'lseek', 'fread', 'fwrite', 'fgets', 'fgetc', 'getc', 'fputs', 'fputc', 'fprintf', 'fscanf', 'fseek', 'ftell', 'recv', 'send']);
const BLOCKING = new Set(['recv', 'recvfrom', 'recvmsg', 'read', 'readv', 'accept', 'accept4', 'connect', 'send', 'sendto', 'sleep', 'usleep', 'nanosleep', 'fgets', 'fread', 'fgetc', 'getc', 'getchar', 'scanf', 'fscanf', 'gets', 'select', 'poll', 'epoll_wait', 'wait', 'waitpid', 'pthread_join', 'sem_wait', 'msgrcv', 'pause', 'sigwait', 'system', 'getaddrinfo', 'gethostbyname']);
const TERM_SIGNALS = /^SIG(TERM|KILL|INT|QUIT|ABRT|HUP)$/;
const BYTE_ORDER = new Set(['htons', 'htonl', 'ntohs', 'ntohl', 'inet_addr', 'inet_network', 'htobe16', 'htobe32', 'htobe64', 'be16toh', 'be32toh', 'be64toh', '__bswap_16', '__bswap_32', 'bswap_16', 'bswap_32', '_byteswap_ushort', '_byteswap_ulong', '__builtin_bswap16', '__builtin_bswap32']);
const NTOH = new Set(['ntohs', 'ntohl', 'be16toh', 'be32toh', 'be64toh', 'htons', 'htonl', '__builtin_bswap16', '__builtin_bswap32', '__builtin_bswap64', 'bswap_16', 'bswap_32', 'bswap_64']);

const POS54 = {
  pthread_create: 'an error number', pthread_join: 'an error number', pthread_detach: 'an error number', pthread_mutex_init: 'an error number',
  pthread_cond_init: 'an error number', pthread_attr_init: 'an error number', pthread_key_create: 'an error number', pthread_setspecific: 'an error number',
  pthread_mutexattr_init: 'an error number', pthread_mutexattr_settype: 'an error number', pthread_attr_setdetachstate: 'an error number',
  pthread_sigmask: 'an error number', pthread_once: 'an error number',
  fork: '-1', pipe: '-1', dup: '-1', dup2: '-1', socket: '-1', bind: '-1', listen: '-1', connect: '-1', accept: '-1', setsockopt: '-1',
  chdir: '-1', fchdir: '-1', chroot: '-1', mkstemp: '-1', sigaction: '-1', sigprocmask: '-1', sigemptyset: '-1', sigaddset: '-1',
  posix_memalign: 'an error number', mkdir: '-1', unlink: '-1', rmdir: '-1', chmod: '-1', chown: '-1', fchmod: '-1', fchown: '-1',
  open: '-1', openat: '-1', read: '-1', lseek: '(off_t)-1', ftruncate: '-1', fsync: '-1', fstat: '-1', stat: '-1', lstat: '-1',
  mmap: 'MAP_FAILED', munmap: '-1', mprotect: '-1', mlock: '-1', setrlimit: '-1', getrlimit: '-1', waitpid: '-1', kill: '-1',
  execv: '-1', execvp: '-1', execve: '-1', execl: '-1', execlp: '-1', execle: '-1', opendir: 'NULL', fdopen: 'NULL', popen: 'NULL',
  realpath: 'NULL', getcwd: 'NULL', dlopen: 'NULL', sem_init: '-1', sem_wait: '-1', shm_open: '-1', ftok: '-1', shmget: '-1', shmat: '(void *)-1',
};

const KO_IND = { 'an error number': '0 이 아닌 오류 번호', 'a count smaller than requested': '요청보다 작은 개수', 'EOF or fewer conversions': 'EOF 나 더 적은 변환 개수', nonzero: '0 이 아닌 값', '(size_t)-1 or -2': '(size_t)-1 또는 -2' };
const ko = (v) => KO_IND[v] || v;
const fnOf = (n) => U.enclosingFn(n);

function arrSize(t) {
  const c = U.canon(t);
  return c && c.kind === 'array' && typeof c.size === 'number' ? c.size : null;
}

// POS38 helper: variable receiving an fd/FILE from an opener call.
function resultSym(call) {
  const r = U.resultUse(call);
  return r.kind === 'var' ? r.sym : null;
}

module.exports = [
  rule('POS30-C', {
    risk: 'HPM', cwe: ['CWE-170', 'CWE-193'], sec: true, approx: true,
    name: ['Use the readlink() function properly', 'readlink() 함수를 올바르게 사용하세요'],
    why: ['readlink() does not null-terminate the buffer and returns the byte count (or -1); using the buffer as a string without writing the terminator at the returned length reads past the data, and passing sizeof buf leaves no room for it.', 'readlink() 는 버퍼를 널로 끝내지 않고 바이트 수(또는 -1)를 반환합니다. 반환 길이 위치에 종료 문자를 쓰지 않고 버퍼를 문자열로 쓰면 데이터 너머를 읽고, sizeof buf 를 넘기면 종료 문자 자리가 없습니다.'],
    fix: ['Pass sizeof buf - 1, check the result for -1 and write buf[len] = \'\\0\'.', 'sizeof buf - 1 을 넘기고, 결과가 -1 인지 확인한 뒤 buf[len] = \'\\0\' 을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, ['readlink', 'readlinkat'], api.project)) {
        const bi = c.name === 'readlinkat' ? 2 : 1;
        const buf = U.strip(c.args[bi]);
        const bk = U.key(unit, buf);
        const r = U.resultUse(c.node);
        const bname = U.src(unit, buf);
        if (r.kind !== 'var') {
          if (r.kind === 'discarded' || r.kind === 'void') api.report(c.node, M(`${c.name}() result is ignored, so '${bname}' is never null-terminated at the returned length.`, `${c.name}() 결과를 무시해 '${bname}' 를 반환 길이 위치에서 널로 끝내지 않습니다.`));
          continue;
        }
        const fn = fnOf(c.node);
        const term = fn && cf.findAll(fn.body, 'AssignExpr').find((a) => {
          if (a.loc.start < c.loc.end) return false;
          const l = U.strip(a.left);
          return l && l.type === 'IndexExpr' && U.key(unit, l.object) === bk && U.refersTo(l.index, r.sym) && U.constInt(unit, a.right) === 0n;
        });
        if (!term) { api.report(c.node, M(`'${bname}' filled by ${c.name}() is not null-terminated with the returned length '${r.sym.name}'.`, `${c.name}() 가 채운 '${bname}' 를 반환 길이 '${r.sym.name}' 로 널 종료하지 않습니다.`)); continue; }
        const lenArg = c.args[bi + 1];
        const size = arrSize(buf && buf.ctype);
        const n = U.constInt(unit, lenArg);
        const txt = U.src(unit, lenArg).replace(/\s+/g, '');
        if ((size != null && n != null && Number(n) >= size) || (/^sizeof/.test(txt) && !/-/.test(txt))) {
          api.report(c.node, M(`${c.name}() may fill all of '${bname}' (length ${txt}), so '${U.src(unit, term.left)} = 0' writes one byte past the end.`, `${c.name}() 가 '${bname}' 전체(길이 ${txt})를 채울 수 있어 '${U.src(unit, term.left)} = 0' 이 끝을 한 바이트 넘어 씁니다.`));
        }
      }
    },
  }),

  rule('POS33-C', {
    risk: 'LPL', cwe: ['CWE-676'], sec: true,
    name: ['Do not use vfork()', 'vfork() 를 사용하지 마세요'],
    why: ['vfork() shares the parent\'s address space with the child; almost anything the child does before exec (modifying data, returning, calling most functions) is undefined and can corrupt the parent.', 'vfork() 는 자식이 부모의 주소 공간을 공유합니다. exec 전에 자식이 하는 거의 모든 일(데이터 수정, 반환, 대부분의 함수 호출)이 정의되지 않은 동작이며 부모를 망가뜨릴 수 있습니다.'],
    fix: ['Use fork() or posix_spawn().', 'fork() 나 posix_spawn() 을 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, 'vfork', api.project)) api.report(c.node, M('vfork() is used; use fork() or posix_spawn() instead.', 'vfork() 를 사용합니다. 대신 fork() 나 posix_spawn() 을 사용하세요.'));
    },
  }),

  rule('POS34-C', {
    risk: 'HUM', cwe: ['CWE-562', 'CWE-686'], sec: true,
    name: ['Do not call putenv() with a pointer to an automatic variable as the argument', '자동 변수를 가리키는 포인터로 putenv() 를 호출하지 마세요'],
    why: ['putenv() stores the pointer itself in the environment; when the automatic array goes out of scope the environment refers to dead stack memory.', 'putenv() 는 포인터 자체를 환경에 저장하므로 자동 배열이 범위를 벗어나면 환경이 사라진 스택 메모리를 가리킵니다.'],
    fix: ['Use setenv(), or pass static or heap storage that lives as long as the environment entry.', 'setenv() 를 사용하거나 환경 항목만큼 오래 사는 정적 또는 힙 저장소를 넘기세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, 'putenv', api.project)) {
        const s = S.rootSym(c.args[0]);
        if (!s || s.kind !== 'variable' || s.storage !== 'automatic') continue;
        const t = U.canon(s.type);
        if (!t || t.kind !== 'array') continue;
        api.report(c.node, M(`putenv() keeps a pointer to automatic array '${s.name}', which is destroyed when '${U.fnName(fnOf(c.node))}' returns.`, `putenv() 가 '${U.fnName(fnOf(c.node))}' 반환 시 사라지는 자동 배열 '${s.name}' 의 포인터를 보관합니다.`));
      }
    },
  }),

  rule('POS35-C', {
    risk: 'HLM', cwe: ['CWE-363', 'CWE-367', 'CWE-59'], sec: true, approx: true,
    name: ['Avoid race conditions while checking for the existence of a symbolic link', '심볼릭 링크 존재를 확인할 때 경합 조건을 피하세요'],
    why: ['Checking a path with lstat() and then opening it by name is a time-of-check/time-of-use race: an attacker can swap the file for a symbolic link between the two calls.', 'lstat() 로 경로를 확인한 뒤 이름으로 여는 것은 확인 시점과 사용 시점 사이의 경합입니다. 공격자가 두 호출 사이에 파일을 심볼릭 링크로 바꿀 수 있습니다.'],
    fix: ['Open first (O_NOFOLLOW where available), then fstat() the descriptor and compare st_ino/st_dev with the lstat() result.', '먼저 열고(가능하면 O_NOFOLLOW), fstat() 으로 서술자를 확인해 st_ino/st_dev 를 lstat() 결과와 비교하세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const fn of U.functions(unit)) {
        const checks = S.callsIn(fn.body, ['lstat', 'stat', 'access'], project);
        if (!checks.length) continue;
        const opens = S.callsIn(fn.body, OPENERS, project);
        const fstat = S.callsIn(fn.body, ['fstat', 'fstatat'], project);
        for (const o of opens) {
          const pi = o.name === 'openat' ? 1 : 0;
          const pk = U.key(unit, o.args[pi]) || U.strLit(o.args[pi]);
          if (pk == null) continue;
          const chk = checks.find((c) => c.loc.start < o.loc.start && (U.key(unit, c.args[0]) || U.strLit(c.args[0])) === pk);
          if (!chk) continue;
          if (chk.name === 'access') continue; // FIO45-C territory
          if (/O_NOFOLLOW/.test(U.src(unit, o.args[pi + 1] || o.node))) continue;
          if (fstat.some((f) => f.loc.start > o.loc.start)) continue;
          api.report(o.node, M(`${o.name}('${U.src(unit, o.args[pi])}') follows a ${chk.name}() check at line ${chk.loc.line}; the file can be replaced by a symbolic link in between.`, `${o.name}('${U.src(unit, o.args[pi])}') 가 ${chk.loc.line} 행의 ${chk.name}() 확인 뒤에 옵니다. 그 사이에 파일이 심볼릭 링크로 바뀔 수 있습니다.`));
        }
      }
    },
  }),

  rule('POS36-C', {
    risk: 'HPM', cwe: ['CWE-696', 'CWE-250'], sec: true,
    name: ['Observe correct revocation order while relinquishing privileges', '권한을 포기할 때 올바른 해제 순서를 지키세요'],
    why: ['Once setuid() drops root, the process may no longer change its group ids; calling setgid() afterwards fails and the process keeps the privileged group.', 'setuid() 로 root 권한을 버리면 그룹 ID 를 더 이상 바꿀 수 없을 수 있어, 그 뒤의 setgid() 는 실패하고 프로세스가 특권 그룹을 유지합니다.'],
    fix: ['Drop supplementary groups and the group id (setgroups, setgid) before the user id (setuid).', '보조 그룹과 그룹 ID(setgroups, setgid)를 사용자 ID(setuid)보다 먼저 버리세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const fn of U.functions(unit)) {
        const list = S.callsIn(fn.body, PRIV_ALL, project);
        const firstUid = list.find((c) => PRIV_UID.has(c.name));
        if (!firstUid) continue;
        for (const g of list) {
          if (!PRIV_GID.has(g.name) || g.loc.start < firstUid.loc.end || S.exclusive(firstUid.node, g.node)) continue;
          api.report(g.node, M(`${g.name}() is called after ${firstUid.name}() (line ${firstUid.loc.line}); group privileges must be dropped before user privileges.`, `${firstUid.loc.line} 행의 ${firstUid.name}() 뒤에 ${g.name}() 를 호출합니다. 그룹 권한은 사용자 권한보다 먼저 버려야 합니다.`));
        }
      }
    },
  }),

  rule('POS37-C', {
    risk: 'HPL', cwe: ['CWE-250', 'CWE-273', 'CWE-252'], sec: true,
    name: ['Ensure that privilege relinquishment is successful', '권한 포기가 성공했는지 확인하세요'],
    why: ['setuid(), setgid() and friends can fail (resource limits, capabilities); ignoring the result lets the program continue with elevated privileges.', 'setuid(), setgid() 등은 자원 한도나 권한 때문에 실패할 수 있습니다. 결과를 무시하면 높은 권한으로 계속 실행됩니다.'],
    fix: ['Check every return value and abort when it is not 0; optionally verify with getuid()/geteuid() that the privileges are gone.', '모든 반환값을 확인해 0 이 아니면 중단하고, 필요하면 getuid()/geteuid() 로 권한이 사라졌는지 확인하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, PRIV_ALL, api.project)) {
        if (c.node.type !== 'CallExpr' || U.resultChecked(c.node)) continue;
        api.report(c.node, M(`The return value of ${c.name}() is not checked; if it fails the process keeps its privileges.`, `${c.name}() 의 반환값을 확인하지 않습니다. 실패하면 프로세스가 권한을 유지합니다.`));
      }
    },
  }),

  rule('POS38-C', {
    risk: 'MUM', cwe: ['CWE-403', 'CWE-362'], sec: true, approx: true,
    name: ['Beware of race conditions when using fork and file descriptors', 'fork 와 파일 서술자를 함께 쓸 때 경합 조건에 주의하세요'],
    why: ['After fork() parent and child share open file descriptions (including the file offset), so both reading or writing the same descriptor race; descriptors without close-on-exec also leak into programs started with exec.', 'fork() 뒤 부모와 자식은 열린 파일 기술(파일 위치 포함)을 공유하므로 같은 서술자를 둘 다 읽거나 쓰면 경합합니다. close-on-exec 가 없는 서술자는 exec 로 시작한 프로그램에도 새어 나갑니다.'],
    fix: ['Open the file after fork() in the process that uses it, close it in the other one, and open descriptors with O_CLOEXEC when the program execs.', '파일은 fork() 뒤 사용하는 프로세스에서 열고 다른 쪽에서는 닫으며, exec 하는 프로그램에서는 O_CLOEXEC 로 여세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      const execs = S.calls(unit, EXEC, project).length > 0;
      for (const fn of U.functions(unit)) {
        const forks = S.callsIn(fn.body, 'fork', project);
        if (!forks.length) continue;
        const fk = forks[0];
        const opens = S.callsIn(fn.body, OPENERS, project).filter((o) => o.loc.start < fk.loc.start);
        const ios = S.callsIn(fn.body, FD_IO, project);
        const closes = S.callsIn(fn.body, ['close', 'fclose', 'fcntl'], project);
        for (const o of opens) {
          const s = resultSym(o.node);
          if (!s) continue;
          const after = ios.filter((c) => c.loc.start > fk.loc.end && (c.args || []).some((a) => U.idSym(a) === s));
          const closed = closes.some((c) => c.loc.start > fk.loc.end && U.idSym(c.args[0]) === s);
          if (after.length && !closed) {
            api.report(after[0].node, M(`'${s.name}' was opened before fork() (line ${fk.loc.line}) and is used afterwards; parent and child share its file offset.`, `'${s.name}' 는 fork()(${fk.loc.line} 행) 전에 열렸고 그 뒤에 사용됩니다. 부모와 자식이 파일 위치를 공유합니다.`));
            continue;
          }
          if (execs && o.name !== 'fopen' && o.name !== 'freopen' && !closed) {
            const flags = U.src(unit, o.args[o.name === 'openat' ? 2 : 1] || o.node);
            if (!/O_CLOEXEC/.test(flags)) api.report(o.node, M(`'${s.name}' is opened without O_CLOEXEC before fork() and exec; the descriptor leaks into the new program.`, `'${s.name}' 를 O_CLOEXEC 없이 열고 fork() 와 exec 를 합니다. 서술자가 새 프로그램으로 새어 나갑니다.`));
          }
        }
      }
    },
  }),

  rule('POS39-C', {
    risk: 'MLL', cwe: ['CWE-188', 'CWE-198'], approx: true,
    name: ['Use the correct byte ordering when transferring data between systems', '시스템 간 데이터 전송 시 올바른 바이트 순서를 사용하세요'],
    why: ['Socket addresses and wire protocols use network (big-endian) byte order; storing a host-order port or address, or using a received integer without ntohl()/ntohs(), gives wrong values on little-endian machines.', '소켓 주소와 통신 규약은 네트워크(빅 엔디언) 바이트 순서를 씁니다. 호스트 순서 포트나 주소를 저장하거나, 받은 정수를 ntohl()/ntohs() 없이 쓰면 리틀 엔디언 기계에서 값이 틀립니다.'],
    fix: ['Convert with htons()/htonl() before storing into sin_port/s_addr or sending, and with ntohs()/ntohl() after receiving.', 'sin_port/s_addr 에 저장하거나 보내기 전에는 htons()/htonl() 로, 받은 뒤에는 ntohs()/ntohl() 로 변환하세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const a of U.nodes(unit, 'AssignExpr')) {
        const l = U.strip(a.left);
        if (a.op !== '=' || !l || l.type !== 'MemberExpr' || !/^(sin_port|sin6_port|s_addr)$/.test(l.member)) continue;
        const r = U.strip(a.right);
        if (!r) continue;
        if (r.type === 'CallExpr' && (BYTE_ORDER.has(U.callName(r) || '') || /^(__)?(hton|bswap|htobe)/.test(U.callName(r) || ''))) continue;
        if (r.type === 'MemberExpr' && r.member === l.member) continue;
        const v = U.constInt(unit, r);
        const named = r.type === 'Identifier' && !r.symbol && /^INADDR_/.test(r.name);
        if (v === 0n || (named && /^INADDR_(ANY|NONE)$/.test(r.name))) continue;
        const isVar = r.type === 'Identifier' && r.symbol && (r.symbol.kind === 'variable' || r.symbol.kind === 'parameter') && r.ctype && T.isInteger(T.canonical(r.ctype));
        if (v == null && !named && !isVar) continue;
        const conv = l.member === 's_addr' ? 'htonl' : 'htons';
        api.report(a, M(`'${U.src(unit, l)}' is assigned the host-order value '${U.src(unit, r)}'; convert it with ${conv}().`, `'${U.src(unit, l)}' 에 호스트 순서 값 '${U.src(unit, r)}' 를 대입합니다. ${conv}() 로 변환하세요.`));
      }
      for (const c of S.calls(unit, ['recv', 'recvfrom', 'read'], project)) {
        const b = U.strip(c.args[1]);
        if (!b || b.type !== 'UnaryExpr' || b.op !== '&') continue;
        const s = U.idSym(b.arg);
        if (!s) continue;
        const t = U.canon(s.type);
        if (!t || t.kind !== 'int' || (T.sizeOf(t, unit.target) || 1) < 2) continue;
        const fn = fnOf(c.node);
        const converted = S.callsIn(fn && fn.body, NTOH, project).some((x) => (x.args || []).some((arg) => U.refersTo(arg, s)));
        if (!converted) api.report(c.node, M(`Integer '${s.name}' received by ${c.name}() is used without ntohs()/ntohl().`, `${c.name}() 로 받은 정수 '${s.name}' 를 ntohs()/ntohl() 없이 사용합니다.`));
      }
    },
  }),

  rule('POS44-C', {
    risk: 'LPL', cwe: ['CWE-479'],
    name: ['Do not use signals to terminate threads', '스레드를 끝내려고 시그널을 사용하지 마세요'],
    why: ['A terminating signal such as SIGTERM or SIGKILL sent with pthread_kill() ends the whole process, not just the target thread.', 'pthread_kill() 로 보낸 SIGTERM, SIGKILL 같은 종료 시그널은 대상 스레드만이 아니라 프로세스 전체를 끝냅니다.'],
    fix: ['Ask the thread to stop (a flag, pthread_cancel() at a cancellation point) and join it.', '플래그나 취소 지점의 pthread_cancel() 로 스레드에 종료를 요청하고 조인하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, 'pthread_kill', api.project)) {
        const sig = S.signalName(unit, c.args[1]);
        if (sig && TERM_SIGNALS.test(sig)) api.report(c.node, M(`pthread_kill(..., ${sig}) terminates the whole process, not only the thread.`, `pthread_kill(..., ${sig}) 는 스레드만이 아니라 프로세스 전체를 종료합니다.`));
      }
    },
  }),

  rule('POS47-C', {
    risk: 'MPM', cwe: ['CWE-662'],
    name: ['Do not use threads that can be canceled asynchronously', '비동기로 취소될 수 있는 스레드를 사용하지 마세요'],
    why: ['With PTHREAD_CANCEL_ASYNCHRONOUS a thread can be cancelled at any instruction, e.g. while holding a mutex or inside malloc(), leaving shared state corrupted.', 'PTHREAD_CANCEL_ASYNCHRONOUS 이면 스레드가 뮤텍스를 쥐고 있거나 malloc() 안에 있는 등 아무 명령에서나 취소되어 공유 상태가 깨집니다.'],
    fix: ['Keep the default deferred cancellation type.', '기본값인 지연 취소 방식을 유지하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, 'pthread_setcanceltype', api.project)) {
        if (/PTHREAD_CANCEL_ASYNCHRONOUS/.test(U.src(unit, c.args[0]))) api.report(c.node, M('pthread_setcanceltype(PTHREAD_CANCEL_ASYNCHRONOUS) lets the thread be cancelled at any point.', 'pthread_setcanceltype(PTHREAD_CANCEL_ASYNCHRONOUS) 는 스레드를 아무 지점에서나 취소되게 합니다.'));
      }
    },
  }),

  rule('POS48-C', {
    risk: 'MPH', cwe: ['CWE-667'], approx: true,
    name: ['Do not unlock or destroy another POSIX thread\'s mutex', '다른 POSIX 스레드의 뮤텍스를 풀거나 파괴하지 마세요'],
    why: ['Unlocking a mutex the calling thread does not own, or destroying it while another thread holds or still uses it, is undefined behavior.', '호출 스레드가 소유하지 않은 뮤텍스를 풀거나, 다른 스레드가 쥐고 있거나 아직 쓰는 뮤텍스를 파괴하면 정의되지 않은 동작입니다.'],
    fix: ['Unlock only in the thread that locked, and destroy the mutex after joining every thread that uses it.', '잠근 스레드에서만 풀고, 뮤텍스를 쓰는 모든 스레드를 조인한 뒤 파괴하세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      S.destroyLocked(unit, api, 'pthread');
      const reach = S.reachMap(project, 'threads', 'pthread');
      // mutex keys locked by thread code
      const lockedBy = new Map();
      for (const [f, roots] of reach) {
        const fu = S.unitOf(project, f);
        if (!fu) continue;
        for (const e of S.lockEvents(fu, f, project)) if (e.op === 'lock' && e.key && S.API.pthread.lock.has(e.name)) lockedBy.set(e.key, roots[0].fn);
      }
      if (!lockedBy.size) return;
      for (const fn of U.functions(unit)) {
        if (reach.has(fn)) continue;
        const evs = S.lockEvents(unit, fn, project);
        for (const e of evs) {
          if (e.op !== 'unlock' || e.name !== 'pthread_mutex_unlock' || !lockedBy.has(e.key)) continue;
          if (evs.some((x) => x.op === 'lock' && x.key === e.key)) continue;
          api.report(e.call.node, M(`'${U.fnName(fn)}' unlocks '${S.bare(unit, e.call.args[0])}' without locking it; it is locked by thread routine '${S.fnLabel(lockedBy.get(e.key))}'.`, `'${U.fnName(fn)}' 가 잠그지 않은 '${S.bare(unit, e.call.args[0])}' 를 풉니다. 이 뮤텍스는 스레드 루틴 '${S.fnLabel(lockedBy.get(e.key))}' 가 잠급니다.`));
        }
      }
    },
  }),

  rule('POS49-C', {
    risk: 'MPM', cwe: ['CWE-362'], approx: true,
    name: ['When data must be accessed by multiple threads, provide a mutex and guarantee no adjacent data is also accessed', '여러 스레드가 접근하는 데이터에는 뮤텍스를 두고 인접 데이터가 함께 접근되지 않게 하세요'],
    why: ['Adjacent bit-fields share one memory location; pthreads writing different bit-fields of the same object without a common mutex overwrite each other\'s updates.', '인접한 비트 필드는 같은 메모리 위치를 공유해, 공통 뮤텍스 없이 pthread 들이 같은 객체의 서로 다른 비트 필드를 쓰면 서로의 갱신을 덮어씁니다.'],
    fix: ['Guard the whole object with one pthread mutex, or use separate non-bit-field members.', '객체 전체를 하나의 pthread 뮤텍스로 보호하거나 비트 필드가 아닌 별도 멤버를 사용하세요.'],
  }, { project(project, api) { S.bitfieldRace(project, api, 'pthread'); } }),

  rule('POS50-C', {
    risk: 'MPH', cwe: ['CWE-562', 'CWE-416'], approx: true,
    name: ['Declare objects shared between POSIX threads with appropriate storage durations', 'POSIX 스레드 간 공유 객체는 알맞은 저장 기간으로 선언하세요'],
    why: ['Passing the address of a local variable to pthread_create() lets the thread use it after the creating function returned.', 'pthread_create() 에 지역 변수 주소를 넘기면 만든 함수가 반환한 뒤에도 스레드가 그 변수를 사용할 수 있습니다.'],
    fix: ['Join the thread before returning, or pass static or heap storage.', '반환 전에 스레드를 조인하거나 정적 또는 힙 저장소를 넘기세요.'],
  }, { check(unit, api) { S.autoArgToThread(unit, api, 'pthread'); } }),

  rule('POS51-C', {
    risk: 'LPM', cwe: ['CWE-764', 'CWE-833'], approx: true,
    name: ['Avoid deadlock with POSIX threads by locking in predefined order', '정해진 순서로 잠가 POSIX 스레드 교착 상태를 피하세요'],
    why: ['Two threads taking the same pthread mutexes in opposite orders can deadlock.', '같은 pthread 뮤텍스들을 반대 순서로 잡는 두 스레드는 교착 상태가 될 수 있습니다.'],
    fix: ['Always acquire the mutexes in one global order.', '항상 하나의 전역 순서로 뮤텍스를 잡으세요.'],
  }, { project(project, api) { S.lockOrder(project, api, 'pthread'); } }),

  rule('POS52-C', {
    risk: 'LPH', cwe: ['CWE-667', 'CWE-833'], approx: true,
    name: ['Do not perform operations that can block while holding a POSIX lock', 'POSIX 잠금을 쥔 채 막힐 수 있는 작업을 하지 마세요'],
    why: ['Blocking I/O or sleeping while a mutex is held stalls every other thread that needs the lock, possibly forever if the I/O never completes.', '뮤텍스를 쥔 채 블로킹 입출력이나 대기를 하면 그 잠금이 필요한 다른 모든 스레드가 멈추고, 입출력이 끝나지 않으면 영원히 멈춥니다.'],
    fix: ['Release the mutex before the blocking call, or use non-blocking I/O / timeouts.', '블로킹 호출 전에 뮤텍스를 풀거나 비블로킹 입출력이나 시간 제한을 사용하세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const fn of U.functions(unit)) {
        const evs = S.lockEvents(unit, fn, project);
        if (!evs.some((e) => e.op === 'lock' && S.API.pthread.lock.has(e.name))) continue;
        for (const c of S.callsIn(fn.body, BLOCKING, project)) {
          const held = S.heldAt(unit, fn, c.node, project);
          if (!held.length) continue;
          const lk = evs.find((e) => e.op === 'lock' && e.key === held[held.length - 1]);
          if (!lk || !S.API.pthread.lock.has(lk.name)) continue;
          api.report(c.node, M(`${c.name}() can block while mutex '${S.bare(unit, lk.call.args[0])}' is held (locked at line ${lk.call.loc.line}).`, `뮤텍스 '${S.bare(unit, lk.call.args[0])}' 를 쥔 채(${lk.call.loc.line} 행에서 잠금) 막힐 수 있는 ${c.name}() 를 호출합니다.`));
        }
      }
    },
  }),

  rule('POS53-C', {
    risk: 'MPH', cwe: ['CWE-667'],
    name: ['Do not use more than one mutex for concurrent waiting operations on a condition variable', '조건 변수의 동시 대기에 둘 이상의 뮤텍스를 쓰지 마세요'],
    why: ['Waiting on one condition variable with different mutexes at the same time is undefined behavior in POSIX.', '하나의 조건 변수를 동시에 서로 다른 뮤텍스로 기다리는 것은 POSIX 에서 정의되지 않은 동작입니다.'],
    fix: ['Pair each condition variable with exactly one mutex.', '조건 변수마다 정확히 하나의 뮤텍스를 짝지으세요.'],
  }, {
    project(project, api) {
      const byCv = new Map();
      for (const unit of project.units) {
        for (const c of S.calls(unit, ['pthread_cond_wait', 'pthread_cond_timedwait'], project)) {
          const cv = S.gkey(unit, c.args[0]), mx = S.gkey(unit, c.args[1]);
          if (!cv || !mx) continue;
          if (!byCv.has(cv)) byCv.set(cv, []);
          byCv.get(cv).push({ c, unit, mx });
        }
      }
      for (const list of byCv.values()) {
        const first = list[0];
        for (const x of list) {
          if (x.mx === first.mx) continue;
          api.report(x.c.node, M(`Condition variable '${S.bare(x.unit, x.c.args[0])}' is waited on with mutex '${S.bare(x.unit, x.c.args[1])}' here but with '${S.bare(first.unit, first.c.args[1])}' at line ${first.c.loc.line}.`, `조건 변수 '${S.bare(x.unit, x.c.args[0])}' 를 여기서는 '${S.bare(x.unit, x.c.args[1])}' 로, ${first.c.loc.line} 행에서는 '${S.bare(first.unit, first.c.args[1])}' 로 기다립니다.`));
        }
      }
    },
  }),

  rule('POS54-C', {
    risk: 'HLM', cwe: ['CWE-252', 'CWE-253', 'CWE-391'], sec: true, approx: true,
    name: ['Detect and handle POSIX library errors', 'POSIX 라이브러리 오류를 감지하고 처리하세요'],
    why: ['POSIX functions report failure through their return value (-1, an error number, NULL or MAP_FAILED); ignoring it or comparing with the wrong indicator lets the program run on with invalid descriptors, threads or mappings.', 'POSIX 함수는 반환값(-1, 오류 번호, NULL, MAP_FAILED)으로 실패를 알립니다. 무시하거나 잘못된 표시값과 비교하면 잘못된 서술자, 스레드, 매핑으로 계속 실행됩니다.'],
    fix: ['Check each return value against the documented error indicator (mmap() against MAP_FAILED, not NULL) and handle the failure.', '각 반환값을 문서화된 오류 표시값과 비교하고(mmap() 은 NULL 이 아니라 MAP_FAILED) 실패를 처리하세요.'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, Object.keys(POS54), api.project)) {
        if (c.node.type !== 'CallExpr') continue;
        if (c.name === 'mmap') {
          const r = U.resultUse(c.node);
          const nullCmp = (u) => {
            const p = cf.parentOf(u);
            if (p && p.type === 'UnaryExpr' && p.op === '!') return true;
            if (p && p.type === 'BinaryExpr' && (p.op === '==' || p.op === '!=')) return U.isNullConst(p.left === u ? p.right : p.left);
            const q = cf.parentOf(u);
            return !!q && (q.type === 'IfStmt' || q.type === 'WhileStmt') && cf.parentKey(u) === 'cond';
          };
          let top = c.node;
          while (cf.parentOf(top) && cf.parentOf(top).type === 'ParenExpr') top = cf.parentOf(top);
          const uses = r.kind === 'var' ? (r.sym.uses || []).filter((u) => u.loc.start > c.loc.end) : [top];
          const bad = uses.find((u) => nullCmp(u));
          if (bad) { api.report(c.node, M('mmap() returns MAP_FAILED, not NULL, on failure; the check compares with NULL.', 'mmap() 은 실패 시 NULL 이 아니라 MAP_FAILED 를 반환하는데 NULL 과 비교합니다.')); continue; }
        }
        const r = U.resultUse(c.node);
        // exec*() returns only on failure: the code after the call is its
        // error handling, so the value itself need not be tested.
        if (/^exec/.test(c.name) && (r.kind === 'discarded' || r.kind === 'var')) continue;
        if (r.kind === 'discarded') api.report(c.node, M(`The return value of ${c.name}() is ignored; it reports failure with ${POS54[c.name]}.`, `${c.name}() 의 반환값을 무시합니다. 이 함수는 실패를 ${ko(POS54[c.name])} 로 알립니다.`));
        else if (r.kind === 'var' && !U.symChecked(r.sym, c.node)) api.report(c.node, M(`The result of ${c.name}() is stored in '${r.sym.name}' but never checked for ${POS54[c.name]}.`, `${c.name}() 의 결과를 '${r.sym.name}' 에 저장하지만 ${ko(POS54[c.name])} 인지 확인하지 않습니다.`));
      }
    },
  }),
];
