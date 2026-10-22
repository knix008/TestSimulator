'use strict';

// SEI CERT C — DCL: declarations and initialization.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/expr');
const { M, T, cf } = U;

// Address of an automatic object: &x, &x[i], &x.m, or an automatic array x (decays).
function autoAddress(e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) return autoAddress(e.left);
  if (e.type === 'UnaryExpr' && e.op === '&') {
    let o = U.strip(e.arg);
    while (o && (o.type === 'MemberExpr' && !o.arrow || o.type === 'IndexExpr')) {
      if (o.type === 'IndexExpr') { const ot = X.ctypeOf(o.object); if (ot && ot.kind === 'pointer') return null; }
      o = U.strip(o.object);
    }
    const s = U.idSym(o);
    if (s && X.isAutoLocal(s, true) && !(s.type && T.nonRef(s.type).kind === 'reference')) return { sym: s, node: e };
    return null;
  }
  if (e.type === 'Identifier' && e.symbol && X.isAutoLocal(e.symbol, false)) {
    const t = e.symbol.type && T.canonical(e.symbol.type);
    if (t && t.kind === 'array') return { sym: e.symbol, node: e };
  }
  return null;
}

// Std library names reserved at file scope (common subset).
const STD_NAMES = new Set(('abort abs acos asctime asin atan atan2 atexit atof atoi atol bsearch calloc ceil clearerr clock cos cosh ctime difftime div errno exit exp fabs fclose feof ferror fflush fgetc fgetpos fgets floor fmod fopen fprintf fputc fputs fread free freopen frexp fscanf fseek fsetpos ftell fwrite getc getchar getenv gets gmtime isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper isxdigit labs ldexp ldiv localeconv localtime log log10 longjmp malloc memchr memcmp memcpy memmove memset mktime modf perror pow printf putc putchar puts qsort raise rand realloc remove rename rewind scanf setbuf setjmp setlocale setvbuf signal sin sinh sprintf sqrt srand sscanf strcat strchr strcmp strcoll strcpy strcspn strerror strftime strlen strncat strncmp strncpy strpbrk strrchr strspn strstr strtod strtok strtol strtoul strxfrm system tan tanh time tmpfile tmpnam tolower toupper ungetc vfprintf vprintf vsprintf snprintf vsnprintf strtoll strtoull llabs aligned_alloc quick_exit at_quick_exit').split(' '));

// Feature-test and configuration macros the implementation documents for users to define.
const FEATURE_MACROS = /^(_+[A-Z0-9_]*_SOURCE|_FILE_OFFSET_BITS|_LARGEFILE\w*|_REENTRANT|_THREAD_SAFE|_TIME_BITS|_FORTIFY_SOURCE|_CRT_\w+|_WIN32_WINNT|_WIN32_IE|_USE_MATH_DEFINES|_WINSOCK_DEPRECATED_NO_WARNINGS|_SCL_SECURE_NO_WARNINGS|_HAS_EXCEPTIONS|_ITERATOR_DEBUG_LEVEL|_GLIBCXX_\w+|_LIBCPP_\w+|__STDC_WANT_\w+|__STDC_FORMAT_MACROS|__STDC_LIMIT_MACROS|__STDC_CONSTANT_MACROS|_UNICODE|_MBCS|_DEBUG)$/;

function reservedKind(name, fileScope, lang, macro) {
  if (!name || name === '_') return null;
  if (macro && FEATURE_MACROS.test(name)) return null;
  if (/^_[A-Z]/.test(name)) return 'begins with an underscore and an uppercase letter';
  if (lang === 'cpp' ? name.includes('__') : name.startsWith('__')) return lang === 'cpp' ? 'contains a double underscore' : 'begins with two underscores';
  if (fileScope && name.startsWith('_')) return 'begins with an underscore at file scope';
  return null;
}

// Struct / union members, flattened.
function fieldsOf(rd) {
  const out = [];
  for (const m of rd.members || []) if (m.type === 'Declaration') for (const d of m.declarators || []) if (d.type === 'FieldDecl') out.push(d);
  return out;
}

module.exports = [
  rule('DCL30-C', {
    risk: 'HPH', cwe: ['CWE-562'], sec: true, approx: true,
    name: ['Declare objects with appropriate storage durations', '객체를 알맞은 저장 기간으로 선언하세요'],
    why: ['The address of an automatic object becomes dangling when its function returns; returning it or storing it in a longer-lived pointer leads to use of a dead object.', '자동 객체의 주소는 함수가 반환하면 무효가 됩니다. 이를 반환하거나 수명이 더 긴 포인터에 저장하면 사라진 객체를 사용하게 됩니다.'],
    fix: ['Return the value, use static or allocated storage, or let the caller provide the buffer.', '값을 반환하거나 static·동적 저장소를 쓰거나 호출자가 버퍼를 넘기게 하세요.'],
  }, {
    check(unit, api) {
      for (const r of U.nodes(unit, 'ReturnStmt')) {
        const fn = U.enclosingFn(r);
        if (!fn || fn.type === 'LambdaExpr') continue;
        const hit = autoAddress(r.arg);
        const rtc = fn.ctype && T.canonical(fn.ctype);
        const rret = rtc && rtc.kind === 'function' && rtc.ret && T.canonical(rtc.ret);
        const byValue = rret && (T.isUnknown(rret) || rret.kind === 'record' || rret.kind === 'class' || rret.kind === 'struct');
        if (hit && !byValue) { api.report(r, M(`${U.fnName(fn)}() returns the address of automatic object '${hit.sym.name}', which is destroyed on return.`, `${U.fnName(fn)}() 가 반환 시 사라지는 자동 객체 '${hit.sym.name}' 의 주소를 반환합니다.`)); continue; }
        // C++: reference return of a local
        const rt = fn.ctype && T.canonical(fn.ctype);
        const ret = rt && rt.kind === 'function' && rt.ret;
        if (ret && ret.kind === 'reference') {
          const s = U.idSym(r.arg);
          if (s && X.isAutoLocal(s, true) && T.canonical(s.type).kind !== 'reference') api.report(r, M(`${U.fnName(fn)}() returns a reference to automatic object '${s.name}'.`, `${U.fnName(fn)}() 가 자동 객체 '${s.name}' 에 대한 참조를 반환합니다.`));
        }
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        const hit = autoAddress(a.right);
        if (!hit) continue;
        { const f = U.enclosingFn(a); if (f && f.name === 'main' && !f.qualifier && hit.sym.scope && U.enclosingFn(a) === f) continue; }
        const l = U.strip(a.left);
        let longer = false;
        const ls = U.idSym(l);
        if (ls && X.isFileOrStaticVar(ls)) longer = true;
        if (!longer && l && (l.type === 'UnaryExpr' && l.op === '*' || l.type === 'MemberExpr' && l.arrow)) {
          const base = U.idSym(l.type === 'UnaryExpr' ? l.arg : l.object);
          if (base && (base.kind === 'parameter' || X.isFileOrStaticVar(base))) longer = true;
        }
        if (!longer && l && l.type === 'MemberExpr' && !l.arrow) {
          const base = U.idSym(l.object);
          if (base && X.isFileOrStaticVar(base)) longer = true;
        }
        if (longer) api.report(a, M(`Address of automatic object '${hit.sym.name}' is stored in '${U.src(unit, a.left)}', which outlives it.`, `자동 객체 '${hit.sym.name}' 의 주소가 더 오래 사는 '${U.src(unit, a.left)}' 에 저장됩니다.`));
      }
    },
  }),

  rule('DCL31-C', {
    langs: ['c'], risk: 'LUL', cwe: ['CWE-758'],
    name: ['Declare identifiers before using them', '식별자는 사용하기 전에 선언하세요'],
    why: ['Implicit function declarations and implicit int were removed in C99; the compiler guesses an int return type and unchecked arguments.', '암시적 함수 선언과 암시적 int 는 C99 에서 제거되었습니다. 컴파일러가 int 반환과 검사 없는 인수를 가정합니다.'],
    fix: ['Include the right header or declare a prototype, and always write the type explicitly.', '알맞은 헤더를 포함하거나 원형을 선언하고 형을 항상 명시하세요.'],
  }, {
    check(unit, api) {
      // With unresolved headers the "undeclared" functions most likely come from them.
      const missing = X.missingHeaders(unit);
      for (const d of unit.diagnostics || []) {
        if (missing || d.code !== 'implicit-function-declaration' || !d.file || d.file.startsWith('<')) continue;
        const name = (/'([^']+)'/.exec(d.message) || [])[1] || '?';
        api.report({ file: d.file, line: d.line, column: d.col }, M(`Function '${name}' is called without a declaration (implicit declaration).`, `함수 '${name}' 를 선언 없이 호출합니다(암시적 선언).`));
      }
      const parseErr = (unit.diagnostics || []).some((d) => d.code === 'parse-error');
      for (const n of U.nodes(unit, ['FunctionDecl', 'VarDecl', 'ParamDecl', 'FieldDecl'])) {
        if (!n.implicitInt) continue;
        // `foo(x);` at block scope parsed as an implicit-int function declaration is a
        // front-end recovery artifact (statement after an unresolved macro/type), not real code.
        if (n.type === 'FunctionDecl' && !n.body && (U.enclosingFn(n) || parseErr)) continue;
        if (n.type === 'ParamDecl' && missing) continue;
        // an unknown all-caps name (G_BEGIN_DECLS, EXPORT_API ...) is a macro from a header that was not found
        if (missing && /^[A-Z][A-Z0-9_]*$/.test(n.name || '')) continue;
        const name = n.name || '<unnamed>';
        api.report(n.nameLoc ? { ...n.nameLoc, file: n.loc.file } : n, M(`'${name}' is declared without a type (implicit int).`, `'${name}' 가 형 없이 선언되었습니다(암시적 int).`));
      }
    },
  }),

  rule('DCL36-C', {
    risk: 'MPM', cwe: ['CWE-758'],
    name: ['Do not declare an identifier with conflicting linkage classifications', '식별자를 서로 다른 연결로 선언하지 마세요'],
    why: ['Declaring the same identifier with both internal and external linkage in one translation unit is undefined behavior.', '한 번역 단위에서 같은 식별자를 내부 연결과 외부 연결로 모두 선언하면 정의되지 않은 동작입니다.'],
    fix: ['Use one consistent linkage: either static on every declaration or none.', '모든 선언에 static 을 붙이거나 모두 빼서 연결을 일치시키세요.'],
  }, {
    check(unit, api) {
      for (const d of unit.diagnostics || []) {
        if (d.code !== 'linkage-conflict' || !d.file || d.file.startsWith('<')) continue;
        const name = (/'([^']+)'/.exec(d.message) || [])[1] || '?';
        api.report({ file: d.file, line: d.line, column: d.col }, M(`'${name}' is declared with conflicting linkage: ${d.message}.`, `'${name}' 가 내부 연결과 외부 연결로 함께 선언되었습니다.`));
      }
    },
  }),

  rule('DCL37-C', {
    risk: 'LUL', cwe: ['CWE-758'],
    name: ['Do not declare or define a reserved identifier', '예약된 식별자를 선언하거나 정의하지 마세요'],
    why: ['Names beginning with an underscore and an uppercase letter or two underscores, file-scope names starting with an underscore, and standard library names are reserved to the implementation.', '밑줄+대문자나 밑줄 두 개로 시작하는 이름, 파일 범위의 밑줄로 시작하는 이름, 표준 라이브러리 이름은 구현에 예약되어 있습니다.'],
    fix: ['Rename the identifier (e.g. drop the leading underscore from include guards).', '식별자 이름을 바꾸세요(예: 포함 가드에서 앞 밑줄을 빼세요).'],
  }, {
    check(unit, api) {
      const lang = unit.lang;
      const KO = { Macro: '매크로', Variable: '변수', Function: '함수', Typedef: 'typedef', Member: '멤버', Enumerator: '열거자', Tag: '태그' };
      const WHY_KO = {
        'begins with an underscore and an uppercase letter': '밑줄과 대문자로 시작합니다',
        'contains a double underscore': '밑줄 두 개를 포함합니다',
        'begins with two underscores': '밑줄 두 개로 시작합니다',
        'begins with an underscore at file scope': '파일 범위에서 밑줄로 시작합니다',
        'is a standard library name': '표준 라이브러리 이름입니다',
      };
      const say = (where, kind, name, why) => api.report(where, M(`${kind} '${name}' is a reserved identifier: it ${why}.`, `${KO[kind] || kind} '${name}' 는 예약된 식별자입니다: ${WHY_KO[why] || why}.`));
      for (const m of unit.macros || []) {
        if (!m.file || m.file.startsWith('<') || m.predefined || m.commandLine) continue;
        const why = reservedKind(m.name, true, lang, true) ||(STD_NAMES.has(m.name) ? 'is a standard library name' : null);
        if (why) say({ file: m.file, line: m.line, column: m.col }, 'Macro', m.name, why);
      }
      for (const n of U.nodes(unit, ['VarDecl', 'FunctionDecl', 'TypedefDecl', 'FieldDecl', 'EnumConstant', 'RecordDecl', 'EnumDecl'])) {
        if (!n.name || n.qualifier) continue;
        const s = n.symbol;
        const fileScope = !!s && s.scope && (s.scope.kind === 'file');
        if (n.type === 'FunctionDecl' && n.name === 'main') continue;
        let why = reservedKind(n.name, fileScope && n.type !== 'FieldDecl', lang);
        if (!why && fileScope && (n.type === 'VarDecl' || n.type === 'FunctionDecl') && STD_NAMES.has(n.name) && s.linkage === 'external' && !cf.enclosing(n, 'LinkageSpec')) {
          why = 'is a standard library name';
        }
        if (!why) continue;
        const kind = { VarDecl: 'Variable', FunctionDecl: 'Function', TypedefDecl: 'Typedef', FieldDecl: 'Member', EnumConstant: 'Enumerator', RecordDecl: 'Tag', EnumDecl: 'Tag' }[n.type];
        say(n.nameLoc ? { ...n.nameLoc, file: n.loc.file } : n, kind, n.name, why);
      }
    },
  }),

  rule('DCL38-C', {
    risk: 'LUL', cwe: ['CWE-758'],
    name: ['Use the correct syntax when declaring a flexible array member', '유연 배열 멤버는 올바른 문법으로 선언하세요'],
    why: ['The "struct hack" (last member declared as arr[1] or arr[0]) and indexing past its declared size is undefined behavior; C99 provides flexible array members.', '마지막 멤버를 arr[1] 이나 arr[0] 으로 선언하고 크기를 넘어 접근하는 "struct hack" 은 정의되지 않은 동작입니다. C99 의 유연 배열 멤버를 쓰세요.'],
    fix: ['Declare the last member as a flexible array member: type data[];', '마지막 멤버를 유연 배열 멤버로 선언하세요: type data[];'],
  }, {
    check(unit, api) {
      for (const rd of U.nodes(unit, 'RecordDecl')) {
        if (!rd.isDefinition || rd.tag === 'union' || !rd.members) continue;
        const fs = fieldsOf(rd);
        if (fs.length < 2) continue;
        const last = fs[fs.length - 1];
        const t = last.ctype && T.canonical(last.ctype);
        if (!t || t.kind !== 'array' || (t.size !== 0 && t.size !== 1)) continue;
        api.report(last, M(`Last member '${last.name}' of ${rd.tag} ${rd.name || '<anonymous>'} is declared with size ${t.size} (struct hack); use a flexible array member '${last.name}[]'.`, `${rd.tag} ${rd.name || '<익명>'} 의 마지막 멤버 '${last.name}' 가 크기 ${t.size} 로 선언되었습니다(struct hack). 유연 배열 멤버 '${last.name}[]' 를 쓰세요.`));
      }
    },
  }),

  rule('DCL39-C', {
    risk: 'LUH', cwe: ['CWE-200', 'CWE-1301'], sec: true, approx: true,
    name: ['Avoid information leakage when passing a structure across a trust boundary', '신뢰 경계 너머로 구조체를 넘길 때 정보 누출을 피하세요'],
    why: ['Padding bytes of a structure hold stale memory; copying the whole object to user space, a socket or a file leaks it.', '구조체의 패딩 바이트에는 이전 메모리 내용이 남아 있어 객체 전체를 사용자 공간·소켓·파일로 복사하면 누출됩니다.'],
    fix: ['Serialize the members one by one, or pack the structure so it has no padding.', '멤버를 하나씩 직렬화하거나 패딩이 없도록 구조체를 구성하세요.'],
  }, {
    check(unit, api) {
      const SINKS = { copy_to_user: 1, write: 1, send: 1, sendto: 1, fwrite: 0, __copy_to_user: 1, put_user: 0 };
      for (const c of U.libCalls(unit, new Set([...Object.keys(SINKS), 'memcpy']))) {
        const name = U.callName(c);
        let i = SINKS[name];
        if (name === 'memcpy') {
          const d = U.idSym(c.args[0]);
          if (!d || d.kind !== 'parameter') continue;
          i = 1;
        }
        const a = U.strip(c.args[i]);
        if (!a) continue;
        const rec = X.recordOf(a.ctype);
        if (!rec || !X.hasPadding(rec, unit.target)) continue;
        api.report(c, M(`${name}() copies '${U.src(unit, a)}' of ${rec.tag} ${rec.name || rec.typedefName || '<anonymous>'}, which contains padding bytes that may leak data.`, `${name}() 가 패딩 바이트가 있는 ${rec.tag} ${rec.name || rec.typedefName || '<익명>'} 형 '${U.src(unit, a)}' 를 복사해 데이터가 누출될 수 있습니다.`));
      }
    },
  }),

  rule('DCL40-C', {
    risk: 'LLH', cwe: ['CWE-758'],
    name: ['Do not create incompatible declarations of the same function or object', '같은 함수나 객체를 호환되지 않게 선언하지 마세요'],
    why: ['Declarations of one external identifier with incompatible types in different translation units make calls and accesses undefined behavior.', '여러 번역 단위에서 한 외부 식별자를 호환되지 않는 형으로 선언하면 호출과 접근이 정의되지 않은 동작이 됩니다.'],
    fix: ['Declare the identifier once in a header and include it everywhere it is used and defined.', '식별자를 헤더에 한 번 선언하고 사용하는 곳과 정의하는 곳에서 모두 포함하세요.'],
  }, {
    project(project, api) {
      const unitLang = new Map(project.units.map((u) => [u.file, u.lang]));
      for (const g of project.globalSymbols.values()) {
        if (!g.typeMismatch || g.system) continue;
        // only real declarations: implicit function declarations show up as the calling Identifier
        const decls = g.decls.filter((d) => d.file && !d.file.startsWith('<') && d.node && /Decl$/.test(d.node.type) && !(d.node.symbol && d.node.symbol.implicit)
          // front end: a member defined out of class whose class is unresolved loses the class from its qname
          && !(d.node.qualifier && !(d.node.symbol && d.node.symbol.record))
          // implicit-int declarations come from parse-error recovery (DCL31-C covers real ones)
          && !d.node.implicitInt);
        if (decls.length < 2) continue;
        // C++: differing parameter lists are overloads (constructors included), not conflicts,
        // unless the function has C language linkage.
        const isCppFn = (d) => d.node.type === 'FunctionDecl' && (unitLang.get(d.unit) === 'cpp' || /\.(cpp|cc|cxx|C|hpp|hh|hxx)$/.test(d.file))
          && !cf.ancestors(d.node).some((a) => a.type === 'LinkageSpec');
        if (decls.some(isCppFn)) continue;
        const ref = decls.find((d) => d.isDefinition) || decls[0];
        for (const d of decls) {
          if (d === ref || d.typeString === ref.typeString) continue;
          api.report({ file: d.file, line: d.line, column: d.col }, M(`'${g.name}' is declared here as '${d.typeString}' but as '${ref.typeString}' at ${ref.file}:${ref.line}.`, `'${g.name}' 가 여기서는 '${d.typeString}', ${ref.file}:${ref.line} 에서는 '${ref.typeString}' 로 선언되었습니다.`));
        }
      }
    },
  }),

  rule('DCL41-C', {
    risk: 'MUM', cwe: ['CWE-457'],
    name: ['Do not declare variables inside a switch statement before the first case label', 'switch 문의 첫 case 레이블 앞에 변수를 선언하지 마세요'],
    why: ['Statements before the first case label never run, so such a variable is never initialized.', '첫 case 레이블 앞의 문장은 실행되지 않아 그 변수는 초기화되지 않습니다.'],
    fix: ['Declare the variable before the switch statement.', '변수를 switch 문 앞에 선언하세요.'],
  }, {
    check(unit, api) {
      for (const sw of U.nodes(unit, 'SwitchStmt')) {
        let pre;
        try { pre = cf.switchClauses(sw).prefix || []; } catch (_) { continue; }
        for (const s of pre) {
          if (s.type !== 'Declaration') continue;
          for (const d of s.declarators || []) {
            if (d.type !== 'VarDecl') continue;
            api.report(d, M(`Variable '${d.name}' is declared before the first case label of the switch; its ${d.init ? 'initializer never runs' : 'value is never set'}.`, `변수 '${d.name}' 가 switch 의 첫 case 레이블 앞에 선언되어 ${d.init ? '초기화가 실행되지 않습니다' : '값이 설정되지 않습니다'}.`));
          }
        }
      }
    },
  }),

  rule('DCL00-C', {
    risk: 'LUH', cwe: [], approx: true,
    name: ['Const-qualify immutable objects', '변하지 않는 객체에 const 를 붙이세요'],
    why: ['A local that is initialized once and never modified documents intent and lets the compiler catch accidental writes when it is const.', '한 번 초기화되고 바뀌지 않는 지역 변수를 const 로 두면 의도가 드러나고 실수로 쓰는 것을 컴파일러가 잡아 줍니다.'],
    fix: ['Add const to the declaration.', '선언에 const 를 붙이세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'VarDecl')) {
        const s = d.symbol;
        if (!s || s.kind !== 'variable' || s.storage !== 'automatic' || !d.init || d.init.type === 'InitList') continue;
        const decl = U.parent(d);
        if (!decl || decl.type !== 'Declaration' || decl.condition) continue;
        const dp = U.parent(decl);
        if (!dp || dp.type !== 'CompoundStmt') continue;
        const t = d.ctype && T.canonical(d.ctype);
        if (!t || !T.isArithmetic(t) || t.const || t.volatile) continue;
        if (d.specs && (d.specs.qualifiers || []).length) continue;
        if (d.loc.macro) continue;
        // solid cases only: the initial value is a constant expression
        if (!X.constOf(unit, d.init) && X.floatConst(unit, d.init) == null) continue;
        const uses = (s.uses || []).filter((u) => u.type === 'Identifier');
        if (!uses.length) continue;
        let modified = false;
        for (const u of uses) {
          const k = X.useKind(u);
          if (k === 'write' || k === 'readwrite' || k === 'address') { modified = true; break; }
          if (unit.lang === 'cpp') {
            const p = U.parent(u);
            if (p && (p.type === 'CallExpr' || p.type === 'ParenListInit' || p.type === 'InitList' || p.type === 'LambdaCapture')) { modified = true; break; }
            const vd = p && p.type === 'VarDecl' && p.ctype && T.canonical(p.ctype);
            if (vd && vd.kind === 'reference') { modified = true; break; }
          }
          if (U.parent(u) && U.parent(u).type === 'AsmStmt') { modified = true; break; }
        }
        const fn = U.enclosingFn(d);
        if (!modified && fn && fn.body && cf.findFirst(fn.body, (n) => n.type === 'AsmStmt' || (n.type === 'LambdaExpr' && n.captureDefault === '&'))) modified = true;
        if (modified) continue;
        api.report(d.nameLoc ? { ...d.nameLoc, file: d.loc.file } : d, M(`Local '${d.name}' is never modified after initialization; declare it const.`, `지역 변수 '${d.name}' 는 초기화 뒤 바뀌지 않으니 const 로 선언하세요.`));
      }
    },
  }),
];
