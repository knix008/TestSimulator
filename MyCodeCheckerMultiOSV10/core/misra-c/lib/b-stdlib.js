'use strict';

// Names declared by the C standard library headers (C11/C17 + Amendment
// threads/atomics), by header. Used for the reserved-name rules (21.1, 21.2),
// the banned-function rules and to recognise library calls that the built-in
// header stand-ins of the front end do not declare.

const variants = (base) => base.flatMap((f) => [f, f + 'f', f + 'l']);

const MATH = variants([
  'acos', 'asin', 'atan', 'atan2', 'cos', 'sin', 'tan', 'acosh', 'asinh', 'atanh', 'cosh', 'sinh', 'tanh', 'exp',
  'exp2', 'expm1', 'frexp', 'ilogb', 'ldexp', 'log', 'log10', 'log1p', 'log2', 'logb', 'modf', 'scalbn', 'scalbln',
  'cbrt', 'fabs', 'hypot', 'pow', 'sqrt', 'erf', 'erfc', 'lgamma', 'tgamma', 'ceil', 'floor', 'nearbyint', 'rint',
  'lrint', 'llrint', 'round', 'lround', 'llround', 'trunc', 'fmod', 'remainder', 'remquo', 'copysign', 'nan',
  'nextafter', 'nexttoward', 'fdim', 'fmax', 'fmin', 'fma',
]);
const COMPLEX = variants(['cabs', 'cacos', 'cacosh', 'carg', 'casin', 'casinh', 'catan', 'catanh', 'ccos', 'ccosh', 'cexp',
  'cimag', 'clog', 'conj', 'cpow', 'cproj', 'creal', 'csin', 'csinh', 'csqrt', 'ctan', 'ctanh']);

const FUNCS = {
  'ctype.h': ['isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper'],
  'fenv.h': ['feclearexcept', 'fegetexceptflag', 'feraiseexcept', 'fesetexceptflag', 'fetestexcept', 'fegetround', 'fesetround', 'fegetenv', 'feholdexcept', 'fesetenv', 'feupdateenv'],
  'inttypes.h': ['imaxabs', 'imaxdiv', 'strtoimax', 'strtoumax', 'wcstoimax', 'wcstoumax'],
  'locale.h': ['setlocale', 'localeconv'],
  'math.h': MATH,
  'complex.h': COMPLEX,
  'setjmp.h': ['setjmp', 'longjmp'],
  'signal.h': ['signal', 'raise'],
  'stdatomic.h': ['atomic_init', 'atomic_thread_fence', 'atomic_signal_fence', 'atomic_is_lock_free', 'atomic_store', 'atomic_store_explicit',
    'atomic_load', 'atomic_load_explicit', 'atomic_exchange', 'atomic_exchange_explicit', 'atomic_compare_exchange_strong',
    'atomic_compare_exchange_strong_explicit', 'atomic_compare_exchange_weak', 'atomic_compare_exchange_weak_explicit',
    'atomic_fetch_add', 'atomic_fetch_add_explicit', 'atomic_fetch_sub', 'atomic_fetch_sub_explicit', 'atomic_fetch_or',
    'atomic_fetch_or_explicit', 'atomic_fetch_xor', 'atomic_fetch_xor_explicit', 'atomic_fetch_and', 'atomic_fetch_and_explicit',
    'atomic_flag_test_and_set', 'atomic_flag_test_and_set_explicit', 'atomic_flag_clear', 'atomic_flag_clear_explicit', 'kill_dependency'],
  'stdio.h': ['remove', 'rename', 'tmpfile', 'tmpnam', 'fclose', 'fflush', 'fopen', 'freopen', 'setbuf', 'setvbuf', 'fprintf', 'fscanf',
    'printf', 'scanf', 'snprintf', 'sprintf', 'sscanf', 'vfprintf', 'vfscanf', 'vprintf', 'vscanf', 'vsnprintf', 'vsprintf', 'vsscanf',
    'fgetc', 'fgets', 'fputc', 'fputs', 'getc', 'getchar', 'gets', 'putc', 'putchar', 'puts', 'ungetc', 'fread', 'fwrite', 'fgetpos',
    'fseek', 'fsetpos', 'ftell', 'rewind', 'clearerr', 'feof', 'ferror', 'perror'],
  'stdlib.h': ['atof', 'atoi', 'atol', 'atoll', 'strtod', 'strtof', 'strtold', 'strtol', 'strtoll', 'strtoul', 'strtoull', 'rand', 'srand',
    'aligned_alloc', 'calloc', 'free', 'malloc', 'realloc', 'abort', 'atexit', 'at_quick_exit', 'exit', '_Exit', 'getenv', 'quick_exit',
    'system', 'bsearch', 'qsort', 'abs', 'labs', 'llabs', 'div', 'ldiv', 'lldiv', 'mblen', 'mbtowc', 'wctomb', 'mbstowcs', 'wcstombs'],
  'string.h': ['memcpy', 'memmove', 'strcpy', 'strncpy', 'strcat', 'strncat', 'memcmp', 'strcmp', 'strcoll', 'strncmp', 'strxfrm', 'memchr',
    'strchr', 'strcspn', 'strpbrk', 'strrchr', 'strspn', 'strstr', 'strtok', 'memset', 'strerror', 'strlen'],
  'threads.h': ['call_once', 'cnd_broadcast', 'cnd_destroy', 'cnd_init', 'cnd_signal', 'cnd_timedwait', 'cnd_wait', 'mtx_destroy', 'mtx_init',
    'mtx_lock', 'mtx_timedlock', 'mtx_trylock', 'mtx_unlock', 'thrd_create', 'thrd_current', 'thrd_detach', 'thrd_equal', 'thrd_exit',
    'thrd_join', 'thrd_sleep', 'thrd_yield', 'tss_create', 'tss_delete', 'tss_get', 'tss_set'],
  'time.h': ['clock', 'difftime', 'mktime', 'time', 'timespec_get', 'asctime', 'ctime', 'gmtime', 'localtime', 'strftime'],
  'uchar.h': ['mbrtoc16', 'c16rtomb', 'mbrtoc32', 'c32rtomb'],
  'wchar.h': ['fwprintf', 'fwscanf', 'swprintf', 'swscanf', 'vfwprintf', 'vfwscanf', 'vswprintf', 'vswscanf', 'vwprintf', 'vwscanf', 'wprintf',
    'wscanf', 'fgetwc', 'fgetws', 'fputwc', 'fputws', 'fwide', 'getwc', 'getwchar', 'putwc', 'putwchar', 'ungetwc', 'wcstod', 'wcstof',
    'wcstold', 'wcstol', 'wcstoll', 'wcstoul', 'wcstoull', 'wcscpy', 'wcsncpy', 'wmemcpy', 'wmemmove', 'wcscat', 'wcsncat', 'wcscmp',
    'wcscoll', 'wcsncmp', 'wcsxfrm', 'wmemcmp', 'wcschr', 'wcscspn', 'wcspbrk', 'wcsrchr', 'wcsspn', 'wcsstr', 'wcstok', 'wmemchr',
    'wcslen', 'wmemset', 'wcsftime', 'btowc', 'wctob', 'mbsinit', 'mbrlen', 'mbrtowc', 'wcrtomb', 'mbsrtowcs', 'wcsrtombs'],
  'wctype.h': ['iswalnum', 'iswalpha', 'iswblank', 'iswcntrl', 'iswdigit', 'iswgraph', 'iswlower', 'iswprint', 'iswpunct', 'iswspace',
    'iswupper', 'iswxdigit', 'iswctype', 'wctype', 'towlower', 'towupper', 'towctrans', 'wctrans'],
};

const MACROS = [
  'assert', 'static_assert', 'NDEBUG', 'complex', '_Complex_I', 'imaginary', '_Imaginary_I', 'I', 'CMPLX', 'CMPLXF', 'CMPLXL',
  'errno', 'EDOM', 'EILSEQ', 'ERANGE', 'FE_DIVBYZERO', 'FE_INEXACT', 'FE_INVALID', 'FE_OVERFLOW', 'FE_UNDERFLOW', 'FE_ALL_EXCEPT',
  'FE_DOWNWARD', 'FE_TONEAREST', 'FE_TOWARDZERO', 'FE_UPWARD', 'FE_DFL_ENV', 'LC_ALL', 'LC_COLLATE', 'LC_CTYPE', 'LC_MONETARY',
  'LC_NUMERIC', 'LC_TIME', 'HUGE_VAL', 'HUGE_VALF', 'HUGE_VALL', 'INFINITY', 'NAN', 'FP_INFINITE', 'FP_NAN', 'FP_NORMAL',
  'FP_SUBNORMAL', 'FP_ZERO', 'fpclassify', 'isfinite', 'isinf', 'isnan', 'isnormal', 'signbit', 'isgreater', 'isgreaterequal',
  'isless', 'islessequal', 'islessgreater', 'isunordered', 'MATH_ERRNO', 'MATH_ERREXCEPT', 'math_errhandling', 'SIG_DFL', 'SIG_ERR',
  'SIG_IGN', 'SIGABRT', 'SIGFPE', 'SIGILL', 'SIGINT', 'SIGSEGV', 'SIGTERM', 'alignas', 'alignof', 'va_arg', 'va_copy', 'va_end',
  'va_start', 'ATOMIC_VAR_INIT', 'ATOMIC_FLAG_INIT', 'bool', 'true', 'false', '__bool_true_false_are_defined', 'NULL', 'offsetof',
  'BUFSIZ', 'EOF', 'FOPEN_MAX', 'FILENAME_MAX', 'L_tmpnam', 'SEEK_CUR', 'SEEK_END', 'SEEK_SET', 'TMP_MAX', 'stderr', 'stdin',
  'stdout', '_IOFBF', '_IOLBF', '_IONBF', 'EXIT_FAILURE', 'EXIT_SUCCESS', 'MB_CUR_MAX', 'RAND_MAX', 'noreturn', 'ONCE_FLAG_INIT',
  'TSS_DTOR_ITERATIONS', 'thread_local', 'CLOCKS_PER_SEC', 'TIME_UTC', 'WCHAR_MAX', 'WCHAR_MIN', 'WEOF', 'CHAR_BIT', 'CHAR_MAX',
  'CHAR_MIN', 'INT_MAX', 'INT_MIN', 'LONG_MAX', 'LONG_MIN', 'LLONG_MAX', 'LLONG_MIN', 'MB_LEN_MAX', 'SCHAR_MAX', 'SCHAR_MIN',
  'SHRT_MAX', 'SHRT_MIN', 'UCHAR_MAX', 'UINT_MAX', 'ULONG_MAX', 'ULLONG_MAX', 'USHRT_MAX', 'SIZE_MAX', 'PTRDIFF_MAX', 'PTRDIFF_MIN',
  'SIG_ATOMIC_MAX', 'SIG_ATOMIC_MIN', 'WINT_MAX', 'WINT_MIN', 'INTPTR_MAX', 'INTPTR_MIN', 'UINTPTR_MAX', 'INTMAX_MAX', 'INTMAX_MIN',
  'UINTMAX_MAX', 'and', 'and_eq', 'bitand', 'bitor', 'compl', 'not', 'not_eq', 'or', 'or_eq', 'xor', 'xor_eq', 'DBL_MAX', 'DBL_MIN',
  'DBL_EPSILON', 'FLT_MAX', 'FLT_MIN', 'FLT_EPSILON', 'FLT_RADIX', 'LDBL_MAX', 'LDBL_MIN', 'LDBL_EPSILON', 'DECIMAL_DIG',
  'FLT_EVAL_METHOD', 'FLT_ROUNDS',
];

const TYPES = ['div_t', 'ldiv_t', 'lldiv_t', 'size_t', 'ptrdiff_t', 'wchar_t', 'max_align_t', 'FILE', 'fpos_t', 'va_list', 'jmp_buf',
  'sig_atomic_t', 'fenv_t', 'fexcept_t', 'time_t', 'clock_t', 'tm', 'timespec', 'lconv', 'mbstate_t', 'wint_t', 'wctrans_t', 'wctype_t',
  'thrd_t', 'mtx_t', 'cnd_t', 'tss_t', 'tss_dtor_t', 'thrd_start_t', 'once_flag', 'memory_order', 'atomic_flag', 'imaxdiv_t',
  'char16_t', 'char32_t', 'float_t', 'double_t', 'intmax_t', 'uintmax_t', 'intptr_t', 'uintptr_t', 'errno_t', 'rsize_t'];

const HEADER_OF = new Map();
for (const [h, list] of Object.entries(FUNCS)) for (const f of list) if (!HEADER_OF.has(f)) HEADER_OF.set(f, h);
// a few macros that are also used like functions
for (const f of ['setjmp']) HEADER_OF.set(f, 'setjmp.h');

const FUNC_NAMES = new Set(HEADER_OF.keys());
const MACRO_NAMES = new Set(MACROS);
const TYPE_NAMES = new Set(TYPES);
const OBJECT_NAMES = new Set(['errno', 'stdin', 'stdout', 'stderr']);

// Is the name reserved by the C standard / library for every use?
function reservedPrefix(name) {
  return /^__/.test(name) || /^_[A-Z]/.test(name);
}

module.exports = { FUNCS, HEADER_OF, FUNC_NAMES, MACRO_NAMES, TYPE_NAMES, OBJECT_NAMES, reservedPrefix };
