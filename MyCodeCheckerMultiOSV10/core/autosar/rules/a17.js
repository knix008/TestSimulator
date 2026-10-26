'use strict';

// AUTOSAR C++14 chapter 17 — library introduction (reserved names, the std
// namespace) and MISRA C++:2008 M17 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const S = (...a) => new Set(a);
// Macros and objects of the standard library.
const STD_MACROS = S('NULL', 'errno', 'assert', 'EOF', 'offsetof', 'setjmp', 'va_arg', 'va_start', 'va_end', 'va_copy', 'stdin', 'stdout', 'stderr',
  'BUFSIZ', 'FILENAME_MAX', 'SEEK_SET', 'SEEK_CUR', 'SEEK_END', 'CHAR_BIT', 'INT_MAX', 'INT_MIN', 'UINT_MAX', 'LONG_MAX', 'LONG_MIN', 'SIZE_MAX', 'RAND_MAX',
  'EXIT_SUCCESS', 'EXIT_FAILURE', 'MB_CUR_MAX', 'CLOCKS_PER_SEC', 'SIG_DFL', 'SIG_IGN', 'SIG_ERR', 'HUGE_VAL', 'INFINITY', 'NAN', 'EDOM', 'ERANGE', 'EILSEQ',
  '__cplusplus', '__FILE__', '__LINE__', '__DATE__', '__TIME__', 'true', 'false', 'bool', 'define', 'defined');
const STD_OBJECTS = S('errno', 'cin', 'cout', 'cerr', 'clog', 'wcin', 'wcout', 'wcerr', 'wclog', 'stdin', 'stdout', 'stderr');
const C_FUNCS = S('abs', 'atof', 'atoi', 'atol', 'calloc', 'exit', 'free', 'malloc', 'realloc', 'qsort', 'bsearch', 'rand', 'srand', 'getenv', 'system', 'abort',
  'printf', 'fprintf', 'sprintf', 'snprintf', 'scanf', 'fscanf', 'sscanf', 'puts', 'fputs', 'gets', 'fgets', 'putchar', 'getchar', 'fopen', 'fclose', 'fread', 'fwrite', 'fseek', 'ftell', 'remove', 'rename',
  'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp', 'strlen', 'strchr', 'strrchr', 'strstr', 'strtok', 'memcpy', 'memmove', 'memset', 'memcmp', 'memchr',
  'isalpha', 'isdigit', 'isspace', 'isupper', 'islower', 'toupper', 'tolower', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'exp', 'log', 'log10', 'floor', 'ceil', 'fabs',
  'time', 'clock', 'difftime', 'mktime', 'strftime', 'localtime', 'gmtime', 'asctime', 'ctime', 'signal', 'raise', 'setlocale', 'longjmp');
const RESERVED = /^(_[A-Z]|__)/;

module.exports = [
  A({
    id: 'A17-0-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5, cert: 'DCL51-CPP',
    name: ['Reserved identifiers, macros and functions of the C++ standard library shall not be defined, redefined or undefined', 'C++ 표준 라이브러리의 예약 식별자, 매크로, 함수를 정의, 재정의, 해제하면 안 됩니다'],
    why: ['Changing names that the library relies on is undefined behaviour and breaks headers in subtle ways.', '라이브러리가 기대는 이름을 바꾸는 것은 정의되지 않은 동작이며 헤더를 미묘하게 깨뜨립니다.'],
    fix: ['Choose a different, non-reserved macro name.', '예약되지 않은 다른 매크로 이름을 고르세요.'],
    check(unit, api) {
      for (const d of unit.directives || []) {
        if (U.isBuiltin(d.file) || (d.kind !== 'define' && d.kind !== 'undef') || !d.macro) continue;
        const name = d.macro;
        if (STD_MACROS.has(name) || RESERVED.test(name) || cf.lexer.isKeyword(name, 'cpp')) {
          api.report(d, M(`The reserved name '${name}' is ${d.kind === 'define' ? 'defined' : 'undefined'} as a macro.`, `예약된 이름 '${name}' 을(를) 매크로로 ${d.kind === 'define' ? '정의' : '해제'}합니다.`));
        }
      }
    },
  }),
  A({
    id: 'A17-6-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10, cert: 'DCL58-CPP',
    name: ['Non-standard entities shall not be added to standard namespaces', '표준 네임스페이스에 비표준 개체를 추가하면 안 됩니다'],
    why: ['Adding declarations to namespace std is undefined behaviour (except permitted template specializations).', 'std 네임스페이스에 선언을 추가하는 것은 (허용된 템플릿 특수화를 빼면) 정의되지 않은 동작입니다.'],
    fix: ['Put the declarations into your own namespace.', '선언을 자신의 네임스페이스에 두세요.'],
    check(unit, api) {
      for (const ns of U.ix(unit).get('NamespaceDecl')) {
        if (!ns.name || !/^(std|posix)(::|$)/.test(ns.name)) continue;
        if (cf.enclosing(ns, 'NamespaceDecl')) continue;
        for (const d of ns.decls || []) {
          if (d.type === 'TemplateDecl' && d.isSpecialization) continue;
          if (d.type === 'EmptyDecl') continue;
          api.report(d, M(`A declaration is added to the standard namespace '${ns.name}'.`, `표준 네임스페이스 '${ns.name}' 에 선언을 추가합니다.`));
        }
      }
    },
  }),
  // ------------------------------------------------------- MISRA C++:2008 M17
  A({
    id: 'M17-0-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The names of standard library macros and objects shall not be reused', '표준 라이브러리 매크로와 객체의 이름을 다시 쓰면 안 됩니다'],
    why: ['A local errno or cout hides the standard one and confuses readers.', '지역 errno 나 cout 은 표준의 것을 가리고 읽는 사람을 혼란스럽게 합니다.'],
    fix: ['Rename the entity.', '개체 이름을 바꾸세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl', 'FieldDecl', 'ParamDecl', 'FunctionDecl')) {
        if (!v.name || (!STD_OBJECTS.has(v.name) && !STD_MACROS.has(v.name)) || v.loc.macro) continue;
        api.report(U.at(v), M(`'${v.name}' reuses the name of a standard library macro or object.`, `'${v.name}' 이(가) 표준 라이브러리 매크로나 객체의 이름을 다시 씁니다.`));
      }
    },
  }),
  A({
    id: 'M17-0-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The names of standard library functions shall not be overridden', '표준 라이브러리 함수의 이름을 재정의하면 안 됩니다'],
    why: ['Defining a function called strlen or malloc at global scope replaces or clashes with the library one.', '전역 범위에서 strlen 이나 malloc 이라는 함수를 정의하면 라이브러리 함수를 대체하거나 충돌합니다.'],
    fix: ['Rename the function or put it into a namespace.', '함수 이름을 바꾸거나 네임스페이스에 넣으세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (!C_FUNCS.has(f.name) || f.qualifier || cf.enclosing(f, ['NamespaceDecl', 'RecordDecl'])) continue;
        api.report(U.at(f), M(`The function '${f.name}' overrides a standard library function.`, `함수 '${f.name}' 이(가) 표준 라이브러리 함수를 재정의합니다.`));
      }
    },
  }),
  D('M17-0-5', ['21.10.2'], { name: ['The setjmp macro and the longjmp function shall not be used', 'setjmp 매크로와 longjmp 함수는 쓰면 안 됩니다'] }),
];
