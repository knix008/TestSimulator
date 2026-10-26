'use strict';

// Built-in models of libc / POSIX / Win32 / C++ runtime functions, plus the
// user model format shared with core/defects.js:
//   { name, kind: 'allocator' | 'sink' | 'source' | 'free' | 'deallocator',
//     pattern: '<regex tested against the call text>', langs?: ['c','cpp'|'*'],
//     checker?: 'TAINTED_SCALAR' | 'OS_CMD_INJECTION' | ..., key?, message? }
//
// A model entry describes what the interpreter must do at the call:
//   alloc   { ak, size: 'arg0' | 'calloc' | 'strdup' | 'strndup' | 'realloc', nul }
//   free    { ak }   release argument 0 (fclose, close, free, closedir ...)
//   deref   argument indexes that must be valid, non-null pointers
//   str     argument indexes read as NUL-terminated strings
//   nret    the result may be NULL (checked at most call sites)
//   neg     the result may be a negative error code
//   ...     specific behaviour handled by `op` in interp.js

const M = {};
const def = (names, m) => { for (const n of names.split(/\s+/)) if (n) M[n] = { name: n, ...m }; };

// Memory allocators: the result may be null (nul 'maybe'); NULL_RETURNS for an
// unchecked allocation is reported only with options.absint.allocNull (oom).
def('malloc valloc', { op: 'alloc', ak: 'malloc', size: 'arg0', nret: true, oom: true });
def('aligned_alloc', { op: 'alloc', ak: 'malloc', size: 'arg1', nret: true, oom: true });
def('calloc', { op: 'alloc', ak: 'malloc', size: 'calloc', nret: true, zero: true, oom: true });
def('realloc', { op: 'realloc', ak: 'malloc', nret: true, oom: true });
def('strdup _strdup', { op: 'alloc', ak: 'malloc', size: 'strdup', nret: true, deref: [0], str: [0], oom: true });
def('strndup', { op: 'alloc', ak: 'malloc', size: 'strndup', nret: true, deref: [0], oom: true });
def('free', { op: 'free', ak: 'malloc' });
def('fopen fdopen tmpfile fopen64', { op: 'alloc', ak: 'file', nret: true, deref: [0], str: [0] });
def('popen', { op: 'alloc', ak: 'pipe', nret: true, deref: [0], cmd: 0 });
def('fclose', { op: 'free', ak: 'file', deref: [0] });
def('pclose', { op: 'free', ak: 'pipe', deref: [0] });
def('opendir', { op: 'alloc', ak: 'dir', nret: true, deref: [0], str: [0] });
def('closedir', { op: 'free', ak: 'dir', deref: [0] });
def('open open64 creat socket accept', { op: 'fd', ak: 'fd' });
def('close', { op: 'free', ak: 'fd' });

def('memcpy memmove __builtin_memcpy', { op: 'copy', deref: [0, 1] });
def('memset __builtin_memset', { op: 'memset', deref: [0] });
def('bzero', { op: 'bzero', deref: [0] });
def('strcpy __builtin_strcpy', { op: 'strcpy', deref: [0, 1], str: [1] });
def('strncpy', { op: 'strncpy', deref: [0, 1] });
def('strcat', { op: 'strcat', deref: [0, 1], str: [0, 1] });
def('strncat', { op: 'strncat', deref: [0, 1], str: [0] });
def('sprintf vsprintf', { op: 'sprintf', deref: [0], fmt: 1 });
def('snprintf vsnprintf', { op: 'snprintf', fmt: 2 });
def('printf vprintf', { op: 'printf', fmt: 0 });
def('fprintf vfprintf dprintf', { op: 'printf', deref: [0], fmt: 1 });
def('syslog', { op: 'printf', fmt: 1 });
def('strlen __builtin_strlen', { op: 'strlen', deref: [0], str: [0] });
def('strnlen', { op: 'strnlen', deref: [0] });
def('strcmp strcasecmp', { op: 'strcmp', deref: [0, 1], str: [0, 1] });
def('strcoll', { op: 'pure', deref: [0, 1], str: [0, 1] });
def('strncmp strncasecmp', { op: 'strcmp', n: 2, deref: [0, 1] });
def('memcmp', { op: 'pure', deref: [0, 1] });
def('strchr strrchr strstr strpbrk', { op: 'find', deref: [0], str: [0], nret: true });
def('memchr', { op: 'find', deref: [0], nret: true });
def('strspn strcspn', { op: 'pure', deref: [0, 1], str: [0, 1] });
def('puts perror', { op: 'pure', deref: [0], str: [0] });
def('fputs', { op: 'pure', deref: [0, 1], str: [0] });
def('fputc putc', { op: 'pure', deref: [1] });
def('fwrite', { op: 'pure', deref: [0, 3] });
def('fflush', { op: 'pure' });
def('fseek rewind feof ferror fileno', { op: 'pure', deref: [0] });
def('ftell', { op: 'range', lo: -1, hi: Infinity, neg: true, deref: [0] });
def('atoi atol atoll', { op: 'atoi', deref: [0], str: [0] });
def('strtol strtoul strtoll strtoull', { op: 'atoi', deref: [0] });
def('atof strtod strtof', { op: 'pure', deref: [0] });
def('abs labs llabs', { op: 'abs' });
def('rand', { op: 'range', lo: 0, hi: 2147483647 });
def('toupper tolower', { op: 'pure' });
def('isalpha isdigit isalnum isspace isupper islower isxdigit isprint ispunct iscntrl', { op: 'range', lo: 0, hi: 2147483647 });
def('ntohl ntohs htonl htons', { op: 'passthru' });

def('getenv secure_getenv', { op: 'getenv', deref: [0], nret: true });
def('fgets', { op: 'fgets', deref: [0, 2] });
def('gets', { op: 'gets', deref: [0] });
def('read', { op: 'read', buf: 1, len: 2, neg: true });
def('recv', { op: 'read', buf: 1, len: 2, neg: true });
def('recvfrom', { op: 'read', buf: 1, len: 2, neg: true });
def('fread', { op: 'fread', deref: [0, 3] });
def('getchar', { op: 'getc' });
def('fgetc getc', { op: 'getc', deref: [0] });
def('scanf', { op: 'scanf', fmt: 0 });
def('fscanf', { op: 'scanf', fmt: 1, deref: [0] });
def('sscanf', { op: 'scanf', fmt: 1, deref: [0], from: 0 });
def('write send', { op: 'range', lo: -1, hi: Infinity, neg: true });
def('lseek', { op: 'range', lo: -1, hi: Infinity, neg: true });

def('system', { op: 'cmd', cmd: 0 });
def('execl execlp execle execv execvp execve _execl _execv _execvp WinExec ShellExecuteA ShellExecuteW', { op: 'cmd', cmd: 0 });
def('putenv', { op: 'tstr', arg: 0 });
def('setenv', { op: 'tstr', arg: 1 });
def('dlopen LoadLibraryA LoadLibraryW LoadLibrary', { op: 'tstr', arg: 0 });
def('chroot chdir rmdir unlink remove mkdir', { op: 'tstr', arg: 0 });

def('pthread_mutex_lock pthread_spin_lock pthread_rwlock_wrlock pthread_rwlock_rdlock mtx_lock EnterCriticalSection AcquireSRWLockExclusive AcquireSRWLockShared spin_lock mutex_lock raw_spin_lock spin_lock_irqsave', { op: 'lock' });
def('pthread_mutex_unlock pthread_spin_unlock pthread_rwlock_unlock mtx_unlock LeaveCriticalSection ReleaseSRWLockExclusive ReleaseSRWLockShared spin_unlock mutex_unlock raw_spin_unlock spin_unlock_irqrestore', { op: 'unlock' });
def('pthread_mutex_trylock mtx_trylock pthread_spin_trylock', { op: 'trylock', succ: 'zero' });
def('TryEnterCriticalSection mutex_trylock spin_trylock', { op: 'trylock', succ: 'nonzero' });
def('sleep usleep nanosleep Sleep msleep pause pthread_join wait waitpid sem_wait', { op: 'sleep' });

// Arguments that a function reads as a NUL-terminated string (STRING_NULL / taint).
const NORETURN = new Set(['exit', 'abort', '_Exit', 'quick_exit', 'longjmp', 'siglongjmp', '__assert_fail', '_exit',
  '__builtin_unreachable', '__builtin_trap', 'pthread_exit', 'thrd_exit', 'terminate', 'std::exit', 'std::abort', 'std::terminate', 'err', 'errx']);

// Functions whose result is usually checked; CHECKED_RETURN also reports
// these with fewer call sites.
const MUST_CHECK = new Set(['setuid', 'setgid', 'seteuid', 'setegid', 'setreuid', 'setresuid', 'chroot', 'chdir',
  'pthread_mutex_init', 'fseek', 'lseek', 'remove', 'rename']);

function lookup(name) {
  if (!name) return null;
  const n = name.startsWith('std::') ? name.slice(5) : name.startsWith('::') ? name.slice(2) : name;
  return Object.prototype.hasOwnProperty.call(M, n) ? M[n] : null;
}

function compileUserModels(models, lang) {
  const out = [];
  for (const m of models || []) {
    if (!m || !m.pattern) continue;
    if (m.langs && m.langs.length && !m.langs.includes('*') && lang && !m.langs.includes(lang)) continue;
    let re;
    try { re = new RegExp(m.pattern); } catch { continue; }
    const kind = m.kind === 'deallocator' ? 'free' : m.kind;
    if (!['allocator', 'sink', 'source', 'free'].includes(kind)) continue;
    out.push({ ...m, kind, re });
  }
  return out;
}

module.exports = { MODELS: M, NORETURN, MUST_CHECK, lookup, compileUserModels };
