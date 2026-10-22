'use strict';

// Built-in stand-ins for the standard library headers. When a translation unit
// includes <stdio.h> and no such file is part of the project, the preprocessor
// uses these texts so that typedef names (size_t, uint8_t, FILE ...) are known,
// library calls have prototypes (return types, noreturn) and macros such as
// NULL, EOF, INT_MAX or offsetof expand as on a real target.
// They are processed as files named '<builtin>/stdio.h'.

function targetTypes(target) {
  const t = target || {};
  const long8 = (t.long || 8) === 8;
  const ptr8 = (t.pointer || 8) === 8;
  const sizeT = ptr8 ? (long8 ? 'unsigned long' : 'unsigned long long') : 'unsigned int';
  const ssizeT = ptr8 ? (long8 ? 'long' : 'long long') : 'int';
  const wchar = (t.wchar || 4) === 4 ? 'int' : 'unsigned short';
  return { sizeT, ssizeT, wchar, long8, ptr8 };
}

function build(lang, target) {
  const cpp = lang === 'cpp';
  const { sizeT, ssizeT, wchar, long8, ptr8 } = targetTypes(target);
  const NR = '__attribute__((noreturn))';
  const H = {};
  const sizeDecl = `typedef ${sizeT} size_t;`;
  const nullDef = cpp ? '#define NULL 0' : '#define NULL ((void *)0)';
  H['stddef.h'] = [
    sizeDecl,
    `typedef ${ssizeT} ptrdiff_t;`,
    cpp ? '' : `typedef ${wchar} wchar_t;`,
    'typedef long double max_align_t;',
    cpp ? 'typedef decltype(nullptr) nullptr_t;' : '',
    nullDef,
    '#define offsetof(type, member) __builtin_offsetof(type, member)',
  ].join('\n');
  const ints = [];
  const lim = [];
  for (const [bits, s, u] of [[8, 'signed char', 'unsigned char'], [16, 'short', 'unsigned short'], [32, 'int', 'unsigned int'], [64, long8 ? 'long' : 'long long', long8 ? 'unsigned long' : 'unsigned long long']]) {
    ints.push(`typedef ${s} int${bits}_t;`, `typedef ${u} uint${bits}_t;`);
    ints.push(`typedef ${s} int_least${bits}_t;`, `typedef ${u} uint_least${bits}_t;`);
    ints.push(`typedef ${bits === 8 ? s : (ptr8 && long8 ? 'long' : s)} int_fast${bits}_t;`, `typedef ${bits === 8 ? u : (ptr8 && long8 ? 'unsigned long' : u)} uint_fast${bits}_t;`);
    const max = (1n << BigInt(bits - 1)) - 1n;
    const sfx = bits === 64 ? (long8 ? 'L' : 'LL') : '';
    lim.push(`#define INT${bits}_MAX ${max}${sfx}`, `#define INT${bits}_MIN (-INT${bits}_MAX - 1)`, `#define UINT${bits}_MAX ${(1n << BigInt(bits)) - 1n}${bits >= 32 ? 'U' : ''}${sfx}`);
    lim.push(`#define INT${bits}_C(c) c${sfx}`, `#define UINT${bits}_C(c) c${bits >= 32 ? 'U' : ''}${sfx}`);
  }
  H['stdint.h'] = [
    ...ints,
    `typedef ${ptr8 ? (long8 ? 'long' : 'long long') : 'int'} intptr_t;`,
    `typedef ${ptr8 ? (long8 ? 'unsigned long' : 'unsigned long long') : 'unsigned int'} uintptr_t;`,
    `typedef ${long8 ? 'long' : 'long long'} intmax_t;`,
    `typedef ${long8 ? 'unsigned long' : 'unsigned long long'} uintmax_t;`,
    ...lim,
    `#define SIZE_MAX ${ptr8 ? '18446744073709551615UL' : '4294967295U'}`,
    `#define INTPTR_MAX ${ptr8 ? '9223372036854775807L' : '2147483647'}`,
    `#define UINTPTR_MAX ${ptr8 ? '18446744073709551615UL' : '4294967295U'}`,
    '#define INTMAX_MAX INT64_MAX',
    '#define UINTMAX_MAX UINT64_MAX',
  ].join('\n');
  H['inttypes.h'] = '#include <stdint.h>\n#define PRId8 "d"\n#define PRId16 "d"\n#define PRId32 "d"\n#define PRId64 "lld"\n#define PRIu8 "u"\n#define PRIu16 "u"\n#define PRIu32 "u"\n#define PRIu64 "llu"\n#define PRIx32 "x"\n#define PRIx64 "llx"\n#define PRIi32 "i"\nintmax_t imaxabs(intmax_t j);\nintmax_t strtoimax(const char *s, char **end, int base);\nuintmax_t strtoumax(const char *s, char **end, int base);';
  H['stdbool.h'] = cpp ? '#define __bool_true_false_are_defined 1' : '#define bool _Bool\n#define true 1\n#define false 0\n#define __bool_true_false_are_defined 1';
  H['limits.h'] = [
    '#define CHAR_BIT 8',
    '#define SCHAR_MIN (-128)', '#define SCHAR_MAX 127', '#define UCHAR_MAX 255',
    (target && target.charSigned === false) ? '#define CHAR_MIN 0\n#define CHAR_MAX 255' : '#define CHAR_MIN (-128)\n#define CHAR_MAX 127',
    '#define MB_LEN_MAX 16',
    '#define SHRT_MIN (-32768)', '#define SHRT_MAX 32767', '#define USHRT_MAX 65535',
    '#define INT_MIN (-INT_MAX - 1)', '#define INT_MAX 2147483647', '#define UINT_MAX 4294967295U',
    long8 ? '#define LONG_MAX 9223372036854775807L\n#define ULONG_MAX 18446744073709551615UL' : '#define LONG_MAX 2147483647L\n#define ULONG_MAX 4294967295UL',
    '#define LONG_MIN (-LONG_MAX - 1L)',
    '#define LLONG_MAX 9223372036854775807LL', '#define LLONG_MIN (-LLONG_MAX - 1LL)', '#define ULLONG_MAX 18446744073709551615ULL',
  ].join('\n');
  H['float.h'] = '#define FLT_RADIX 2\n#define FLT_MANT_DIG 24\n#define DBL_MANT_DIG 53\n#define FLT_DIG 6\n#define DBL_DIG 15\n#define FLT_EPSILON 1.19209290e-7F\n#define DBL_EPSILON 2.2204460492503131e-16\n#define FLT_MAX 3.40282347e+38F\n#define DBL_MAX 1.7976931348623157e+308\n#define FLT_MIN 1.17549435e-38F\n#define DBL_MIN 2.2250738585072014e-308\n#define LDBL_MAX DBL_MAX\n#define LDBL_MIN DBL_MIN\n#define LDBL_EPSILON DBL_EPSILON';
  H['stdarg.h'] = 'typedef __builtin_va_list va_list;\n#define va_start(ap, last) __builtin_va_start(ap, last)\n#define va_arg(ap, type) __builtin_va_arg(ap, type)\n#define va_end(ap) __builtin_va_end(ap)\n#define va_copy(d, s) __builtin_va_copy(d, s)\nvoid __builtin_va_start(va_list, ...);\nvoid __builtin_va_end(va_list);\nvoid __builtin_va_copy(va_list, va_list);';
  H['stdio.h'] = [
    '#include <stddef.h>', '#include <stdarg.h>',
    'typedef struct _IO_FILE FILE;', `typedef ${long8 ? 'long' : 'long long'} fpos_t;`,
    '#define EOF (-1)', '#define BUFSIZ 8192', '#define FILENAME_MAX 4096', '#define FOPEN_MAX 16',
    '#define SEEK_SET 0', '#define SEEK_CUR 1', '#define SEEK_END 2', '#define L_tmpnam 20', '#define TMP_MAX 238328',
    '#define _IOFBF 0', '#define _IOLBF 1', '#define _IONBF 2',
    'extern FILE *stdin;', 'extern FILE *stdout;', 'extern FILE *stderr;',
    'int printf(const char *format, ...);', 'int fprintf(FILE *stream, const char *format, ...);',
    'int sprintf(char *s, const char *format, ...);', 'int snprintf(char *s, size_t n, const char *format, ...);',
    'int vprintf(const char *format, va_list ap);', 'int vfprintf(FILE *stream, const char *format, va_list ap);',
    'int vsprintf(char *s, const char *format, va_list ap);', 'int vsnprintf(char *s, size_t n, const char *format, va_list ap);',
    'int scanf(const char *format, ...);', 'int fscanf(FILE *stream, const char *format, ...);', 'int sscanf(const char *s, const char *format, ...);',
    'FILE *fopen(const char *filename, const char *mode);', 'FILE *freopen(const char *filename, const char *mode, FILE *stream);',
    'int fclose(FILE *stream);', 'int fflush(FILE *stream);', 'void setbuf(FILE *stream, char *buf);',
    'int setvbuf(FILE *stream, char *buf, int mode, size_t size);',
    'size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream);', 'size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream);',
    'int fgetc(FILE *stream);', 'int getc(FILE *stream);', 'int getchar(void);', 'char *fgets(char *s, int n, FILE *stream);', 'char *gets(char *s);',
    'int fputc(int c, FILE *stream);', 'int putc(int c, FILE *stream);', 'int putchar(int c);', 'int fputs(const char *s, FILE *stream);', 'int puts(const char *s);',
    'int ungetc(int c, FILE *stream);', 'int fseek(FILE *stream, long offset, int whence);', 'long ftell(FILE *stream);', 'void rewind(FILE *stream);',
    'int fgetpos(FILE *stream, fpos_t *pos);', 'int fsetpos(FILE *stream, const fpos_t *pos);',
    'void clearerr(FILE *stream);', 'int feof(FILE *stream);', 'int ferror(FILE *stream);', 'void perror(const char *s);',
    'int remove(const char *filename);', 'int rename(const char *old, const char *new_name);', 'FILE *tmpfile(void);', 'char *tmpnam(char *s);',
    'FILE *popen(const char *command, const char *type);', 'int pclose(FILE *stream);', 'int fileno(FILE *stream);',
  ].join('\n');
  H['stdlib.h'] = [
    '#include <stddef.h>',
    '#define EXIT_SUCCESS 0', '#define EXIT_FAILURE 1', '#define RAND_MAX 2147483647', '#define MB_CUR_MAX 1',
    'typedef struct { int quot; int rem; } div_t;', 'typedef struct { long quot; long rem; } ldiv_t;', 'typedef struct { long long quot; long long rem; } lldiv_t;',
    'void *malloc(size_t size);', 'void *calloc(size_t nmemb, size_t size);', 'void *realloc(void *ptr, size_t size);',
    'void *aligned_alloc(size_t alignment, size_t size);', 'void free(void *ptr);',
    `${NR} void abort(void);`, `${NR} void exit(int status);`, `${NR} void _Exit(int status);`, `${NR} void quick_exit(int status);`,
    'int atexit(void (*func)(void));', 'int at_quick_exit(void (*func)(void));',
    'char *getenv(const char *name);', 'int system(const char *string);',
    'int atoi(const char *s);', 'long atol(const char *s);', 'long long atoll(const char *s);', 'double atof(const char *s);',
    'long strtol(const char *s, char **end, int base);', 'unsigned long strtoul(const char *s, char **end, int base);',
    'long long strtoll(const char *s, char **end, int base);', 'unsigned long long strtoull(const char *s, char **end, int base);',
    'double strtod(const char *s, char **end);', 'float strtof(const char *s, char **end);', 'long double strtold(const char *s, char **end);',
    'int rand(void);', 'void srand(unsigned int seed);',
    'void qsort(void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));',
    'void *bsearch(const void *key, const void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));',
    'int abs(int j);', 'long labs(long j);', 'long long llabs(long long j);', 'div_t div(int n, int d);', 'ldiv_t ldiv(long n, long d);',
    'int mblen(const char *s, size_t n);', 'char *realpath(const char *path, char *resolved);',
  ].join('\n');
  H['string.h'] = [
    '#include <stddef.h>',
    'void *memcpy(void *dst, const void *src, size_t n);', 'void *memmove(void *dst, const void *src, size_t n);',
    'void *memset(void *s, int c, size_t n);', 'int memcmp(const void *a, const void *b, size_t n);', 'void *memchr(const void *s, int c, size_t n);',
    'char *strcpy(char *dst, const char *src);', 'char *strncpy(char *dst, const char *src, size_t n);',
    'char *strcat(char *dst, const char *src);', 'char *strncat(char *dst, const char *src, size_t n);',
    'int strcmp(const char *a, const char *b);', 'int strncmp(const char *a, const char *b, size_t n);', 'int strcoll(const char *a, const char *b);',
    'size_t strxfrm(char *dst, const char *src, size_t n);', 'size_t strlen(const char *s);', 'size_t strnlen(const char *s, size_t n);',
    'char *strchr(const char *s, int c);', 'char *strrchr(const char *s, int c);', 'char *strstr(const char *h, const char *n);',
    'char *strpbrk(const char *s, const char *a);', 'size_t strspn(const char *s, const char *a);', 'size_t strcspn(const char *s, const char *r);',
    'char *strtok(char *s, const char *d);', 'char *strerror(int errnum);', 'char *strdup(const char *s);', 'char *strndup(const char *s, size_t n);',
  ].join('\n');
  H['ctype.h'] = ['isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper']
    .map((f) => `int ${f}(int c);`).join('\n');
  H['math.h'] = [
    'typedef float float_t;', 'typedef double double_t;',
    '#define HUGE_VAL (__builtin_huge_val())', '#define INFINITY (__builtin_inff())', '#define NAN (__builtin_nanf(""))',
    '#define M_PI 3.14159265358979323846',
    'double __builtin_huge_val(void);', 'float __builtin_inff(void);', 'float __builtin_nanf(const char *s);',
    ...['sqrt', 'fabs', 'floor', 'ceil', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'log10', 'log2', 'round', 'trunc', 'sinh', 'cosh', 'tanh', 'cbrt']
      .map((f) => `double ${f}(double x);`),
    'double pow(double x, double y);', 'double fmod(double x, double y);', 'double atan2(double y, double x);', 'double hypot(double x, double y);',
    'double fmin(double x, double y);', 'double fmax(double x, double y);', 'double ldexp(double x, int e);', 'double frexp(double x, int *e);',
    'double modf(double x, double *ip);', 'float sqrtf(float x);', 'float fabsf(float x);', 'float powf(float x, float y);',
    'int isnan(double x);', 'int isinf(double x);', 'int isfinite(double x);',
  ].join('\n');
  H['assert.h'] = `${NR} void __assert_fail(const char *expr, const char *file, unsigned int line, const char *func);\n#ifdef NDEBUG\n#define assert(e) ((void)0)\n#else\n#define assert(e) ((e) ? (void)0 : __assert_fail(#e, __FILE__, __LINE__, __func__))\n#endif\n${cpp ? '' : '#define static_assert _Static_assert'}`;
  H['errno.h'] = 'extern int errno;\n#define EDOM 33\n#define ERANGE 34\n#define EILSEQ 84\n#define EINVAL 22\n#define ENOMEM 12\n#define ENOENT 2\n#define EAGAIN 11';
  H['setjmp.h'] = `typedef long jmp_buf[8];\nint setjmp(jmp_buf env);\n${NR} void longjmp(jmp_buf env, int val);`;
  H['signal.h'] = 'typedef int sig_atomic_t;\ntypedef void (*__sighandler_t)(int);\n#define SIGABRT 6\n#define SIGFPE 8\n#define SIGILL 4\n#define SIGINT 2\n#define SIGSEGV 11\n#define SIGTERM 15\n#define SIG_DFL ((__sighandler_t)0)\n#define SIG_IGN ((__sighandler_t)1)\n#define SIG_ERR ((__sighandler_t)-1)\n__sighandler_t signal(int sig, __sighandler_t func);\nint raise(int sig);';
  H['time.h'] = '#include <stddef.h>\ntypedef long time_t;\ntypedef long clock_t;\nstruct tm { int tm_sec; int tm_min; int tm_hour; int tm_mday; int tm_mon; int tm_year; int tm_wday; int tm_yday; int tm_isdst; };\nstruct timespec { time_t tv_sec; long tv_nsec; };\n#define CLOCKS_PER_SEC 1000000L\nclock_t clock(void);\ntime_t time(time_t *t);\ndouble difftime(time_t a, time_t b);\ntime_t mktime(struct tm *tp);\nchar *asctime(const struct tm *tp);\nchar *ctime(const time_t *t);\nstruct tm *gmtime(const time_t *t);\nstruct tm *localtime(const time_t *t);\nsize_t strftime(char *s, size_t max, const char *fmt, const struct tm *tp);';
  H['wchar.h'] = `#include <stddef.h>\ntypedef unsigned int wint_t;\ntypedef struct { int __count; } mbstate_t;\n#define WEOF (0xffffffffu)\nsize_t wcslen(const wchar_t *s);\nwchar_t *wcscpy(wchar_t *d, const wchar_t *s);\nint wcscmp(const wchar_t *a, const wchar_t *b);`;
  H['uchar.h'] = cpp ? '' : 'typedef unsigned short char16_t;\ntypedef unsigned int char32_t;';
  H['stdalign.h'] = cpp ? '' : '#define alignas _Alignas\n#define alignof _Alignof\n#define __alignas_is_defined 1\n#define __alignof_is_defined 1';
  H['stdnoreturn.h'] = cpp ? '' : '#define noreturn _Noreturn';
  H['iso646.h'] = cpp ? '' : '#define and &&\n#define and_eq &=\n#define bitand &\n#define bitor |\n#define compl ~\n#define not !\n#define not_eq !=\n#define or ||\n#define or_eq |=\n#define xor ^\n#define xor_eq ^=';
  H['locale.h'] = 'struct lconv { char *decimal_point; };\n#define LC_ALL 6\n#define LC_NUMERIC 1\nchar *setlocale(int category, const char *locale);\nstruct lconv *localeconv(void);';
  H['fenv.h'] = 'typedef unsigned int fexcept_t;\ntypedef struct { unsigned int __f; } fenv_t;\nint feclearexcept(int e);\nint fetestexcept(int e);';
  H['complex.h'] = cpp ? '' : '#define complex _Complex\n#define I (__extension__ 1.0iF)';
  H['tgmath.h'] = '#include <math.h>';
  H['stdatomic.h'] = cpp ? '' : 'typedef _Atomic int atomic_int;\ntypedef _Atomic unsigned int atomic_uint;\ntypedef _Atomic _Bool atomic_bool;\n#define ATOMIC_VAR_INIT(v) (v)';
  H['threads.h'] = 'typedef unsigned long thrd_t;\ntypedef struct { int __m; } mtx_t;\ntypedef int (*thrd_start_t)(void *);\nint thrd_create(thrd_t *t, thrd_start_t f, void *arg);\nint mtx_lock(mtx_t *m);\nint mtx_unlock(mtx_t *m);';
  H['unistd.h'] = `#include <stddef.h>\ntypedef ${ssizeT} ssize_t;\ntypedef int pid_t;\nssize_t read(int fd, void *buf, size_t n);\nssize_t write(int fd, const void *buf, size_t n);\nint close(int fd);\nint unlink(const char *path);\nint access(const char *path, int mode);\npid_t fork(void);\nint execv(const char *path, char *const argv[]);\nint execl(const char *path, const char *arg, ...);\nint execlp(const char *file, const char *arg, ...);\nint execvp(const char *file, char *const argv[]);\nunsigned int sleep(unsigned int s);\nchar *getcwd(char *buf, size_t size);\n${NR} void _exit(int status);`;
  H['fcntl.h'] = 'int open(const char *path, int flags, ...);\n#define O_RDONLY 0\n#define O_WRONLY 1\n#define O_RDWR 2\n#define O_CREAT 64';
  H['sys/types.h'] = `typedef ${ssizeT} ssize_t;\ntypedef int pid_t;\ntypedef unsigned int mode_t;\ntypedef long off_t;`;

  if (cpp) {
    const C_NAMES = {
      cstddef: 'stddef.h', cstdint: 'stdint.h', cstdio: 'stdio.h', cstdlib: 'stdlib.h', cstring: 'string.h',
      cctype: 'ctype.h', cmath: 'math.h', cassert: 'assert.h', cerrno: 'errno.h', csetjmp: 'setjmp.h',
      csignal: 'signal.h', ctime: 'time.h', climits: 'limits.h', cfloat: 'float.h', cstdarg: 'stdarg.h',
      cinttypes: 'inttypes.h', cwchar: 'wchar.h', clocale: 'locale.h', cfenv: 'fenv.h', cuchar: 'uchar.h',
    };
    for (const [cxx, c] of Object.entries(C_NAMES)) {
      const names = declaredNames(H[c] || '');
      H[cxx] = `#include <${c}>\n` + (names.length ? `namespace std {\n${names.map((nm) => `using ::${nm};`).join('\n')}\n}` : '');
    }
  }
  return H;
}

// Names declared (typedef names and functions) by a header text, for std:: re-exports.
function declaredNames(text) {
  const out = new Set();
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue;
    let m = /typedef\s.*?\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?;\s*$/.exec(line);
    if (m && !/\(\*/.test(line)) { out.add(m[1]); continue; }
    m = /\b([A-Za-z_]\w*)\s*\(/.exec(line.replace(/__attribute__\(\(\w+\)\)/g, ''));
    if (m && !/^(typedef|struct)\b/.test(line)) out.add(m[1]);
  }
  for (const n of [...out]) if (n.startsWith('__')) out.delete(n);
  return [...out];
}

const CACHE = new Map();
function builtinHeaders(lang, target) {
  const key = (lang === 'cpp' ? 'cpp' : 'c') + JSON.stringify(target || {});
  let h = CACHE.get(key);
  if (!h) { h = build(lang, target); CACHE.set(key, h); }
  return h;
}

// Well-known C++ standard library names (types and class templates) in namespace std.
// The parser treats std::<name> (and <name> after `using namespace std;`) as a type.
const STD_TEMPLATES = [
  'vector', 'map', 'set', 'unordered_map', 'unordered_set', 'multimap', 'multiset', 'list', 'deque', 'array',
  'forward_list', 'stack', 'queue', 'priority_queue', 'pair', 'tuple', 'optional', 'variant', 'unique_ptr',
  'shared_ptr', 'weak_ptr', 'function', 'basic_string', 'basic_string_view', 'span', 'initializer_list',
  'allocator', 'less', 'greater', 'equal_to', 'hash', 'atomic', 'reference_wrapper', 'complex', 'valarray',
  'bitset', 'enable_if', 'enable_if_t', 'is_same', 'is_integral', 'remove_reference', 'remove_reference_t',
  'decay', 'decay_t', 'conditional', 'conditional_t', 'integral_constant', 'numeric_limits', 'char_traits',
  'basic_ostream', 'basic_istream', 'istream_iterator', 'ostream_iterator', 'back_insert_iterator',
  'lock_guard', 'unique_lock', 'scoped_lock', 'future', 'promise', 'duration', 'time_point', 'ratio',
  'is_base_of', 'is_convertible', 'common_type', 'underlying_type', 'underlying_type_t', 'any_of',
];
const STD_TYPES = [
  'string', 'wstring', 'u8string', 'u16string', 'u32string', 'string_view', 'wstring_view', 'size_t', 'ptrdiff_t',
  'nullptr_t', 'byte', 'ostream', 'istream', 'iostream', 'ofstream', 'ifstream', 'fstream', 'stringstream',
  'ostringstream', 'istringstream', 'exception', 'runtime_error', 'logic_error', 'out_of_range',
  'invalid_argument', 'bad_alloc', 'length_error', 'overflow_error', 'range_error', 'domain_error',
  'bad_cast', 'thread', 'mutex', 'recursive_mutex', 'shared_mutex', 'condition_variable', 'nothrow_t',
  'any', 'monostate', 'type_info', 'error_code', 'regex', 'smatch', 'cmatch', 'streamsize', 'max_align_t',
  'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'intptr_t', 'uintptr_t',
  'true_type', 'false_type', 'FILE', 'time_t', 'clock_t', 'nanoseconds', 'microseconds', 'milliseconds', 'seconds',
  'minutes', 'hours', 'steady_clock', 'system_clock', 'high_resolution_clock', 'random_device', 'mt19937',
  'filesystem', 'path', 'strong_ordering', 'weak_ordering', 'partial_ordering', 'source_location',
];

module.exports = { builtinHeaders, declaredNames, STD_TEMPLATES, STD_TYPES, targetTypes };
