'use strict';

// SEI CERT C++ — DCL: declarations and initialization.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cpp');
const { M, T, cf } = U;

const inTemplate = (n) => !!cf.enclosing(n, 'TemplateDecl');
const declOf = (n) => U.parent(n); // Declaration of a declarator

// Names reserved to the implementation anywhere / at global scope.
function reservedWhy(name, globalScope) {
  if (!name || typeof name !== 'string') return null;
  if (/^_[A-Z]/.test(name)) return M('it begins with an underscore followed by an uppercase letter', '밑줄 뒤에 대문자가 오는 이름입니다');
  if (/__/.test(name) && !/^operator/.test(name)) return M('it contains a double underscore', '이중 밑줄을 포함합니다');
  if (globalScope && /^_/.test(name)) return M('it begins with an underscore at global scope', '전역 범위에서 밑줄로 시작합니다');
  return null;
}

const KEYWORDISH = new Set(['override', 'final', 'import', 'module', 'new', 'delete', 'class', 'private', 'public', 'protected',
  'virtual', 'inline', 'const', 'volatile', 'static', 'extern', 'register', 'auto', 'friend', 'explicit', 'noexcept', 'nullptr',
  'constexpr', 'bool', 'true', 'false', 'this', 'template', 'typename', 'namespace', 'operator', 'and', 'or', 'not', 'xor',
  'bitand', 'bitor', 'compl', 'and_eq', 'or_eq', 'xor_eq', 'not_eq', 'assert', 'errno', 'thread_local', 'alignas', 'alignof',
  'decltype', 'static_assert', 'char8_t', 'char16_t', 'char32_t', 'wchar_t', 'concept', 'requires', 'co_await', 'co_return', 'co_yield']);

const isGlobalScope = (n) => {
  const s = n && n.symbol && n.symbol.scope;
  if (s) return s.kind === 'file';
  const p = U.parent(U.parent(n));
  return !!p && p.type === 'TranslationUnit';
};

// A FunctionDecl's noexcept(false) or throw(...) specification.
function fnDeclarator(fd) {
  return fd && fd.declarator ? cf.directFunction(fd.declarator) : null;
}
function isNoexceptFalse(unit, fd) {
  const d = fnDeclarator(fd);
  if (!d) return false;
  if (d.noexceptExpr) {
    const e = U.strip(d.noexceptExpr);
    if (e && e.type === 'BoolLiteral' && e.value === false) return true;
    if (U.constInt(unit, d.noexceptExpr) === 0n) return true;
  }
  return false;
}

// throw expressions in fn body not enclosed by a try block inside fn
function escapingThrows(fn) {
  const out = [];
  if (!fn.body) return out;
  for (const t of cf.findAll(fn.body, 'ThrowExpr')) {
    if (U.enclosingFn(t) !== fn) continue;
    let p = U.parent(t), caught = false, child = t;
    while (p && p !== fn) {
      if (p.type === 'TryStmt' && p.body === child && p.handlers && p.handlers.length && !p.functionTry) { caught = true; break; }
      child = p;
      p = U.parent(p);
    }
    if (!caught) out.push(t);
  }
  return out;
}

const OPS_NEW = { 'operator new': 'operator delete', 'operator new[]': 'operator delete[]' };
const OPS_DEL = { 'operator delete': 'operator new', 'operator delete[]': 'operator new[]' };

const TRUST_SINKS = { copy_to_user: 1, __copy_to_user: 1, send: 1, sendto: 1, write: 1, fwrite: 0, WriteFile: 1, sendmsg: -1 };

function normText(s) {
  return String(s || '').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}();,:<>*&=])\s*/g, '$1').trim();
}

module.exports = [
  rule('DCL50-CPP', {
    risk: 'HPM', cwe: ['CWE-628'], approx: false,
    name: ['Do not define a C-style variadic function', 'C 스타일 가변 인수 함수를 정의하지 마세요'],
    why: ['Arguments passed through ... are not type checked; passing the wrong type or a class object is undefined behavior.', '... 로 전달된 인수는 형식 검사를 받지 않아 잘못된 형식이나 클래스 객체를 넘기면 정의되지 않은 동작입니다.'],
    fix: ['Use a variadic template (parameter pack), std::initializer_list or overloads.', '가변 템플릿(매개변수 팩), std::initializer_list 또는 오버로드를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const f of U.nodes(unit, 'FunctionDecl')) {
        if (!f.body || !f.variadic || inTemplate(f)) continue;
        if (cf.enclosing(f, 'LinkageSpec')) continue; // extern "C" interface
        api.report(f.nameLoc && f.nameLoc.line ? f.nameLoc : f, M(`Function '${f.qname || f.name}' is defined as a C-style variadic function (...).`, `함수 '${f.qname || f.name}' 가 C 스타일 가변 인수 함수(...)로 정의되었습니다.`));
      }
    },
  }),

  rule('DCL51-CPP', {
    risk: 'LUL', cwe: ['CWE-758'], approx: true,
    name: ['Do not declare or define a reserved identifier', '예약된 식별자를 선언하거나 정의하지 마세요'],
    why: ['Names with a double underscore, an underscore plus uppercase letter, global names starting with an underscore, user-defined literal suffixes without a leading underscore and macros named like keywords are reserved; using them is undefined behavior and may clash with the implementation.', '이중 밑줄, 밑줄+대문자, 밑줄로 시작하는 전역 이름, 밑줄 없는 사용자 정의 리터럴 접미사, 키워드와 같은 이름의 매크로는 예약되어 있어 사용하면 정의되지 않은 동작이며 구현과 충돌할 수 있습니다.'],
    fix: ['Rename the identifier (e.g. MY_HEADER_H instead of _MY_HEADER_H_, operator"" _km instead of operator"" km).', '식별자 이름을 바꾸세요(예: _MY_HEADER_H_ 대신 MY_HEADER_H, operator"" km 대신 operator"" _km).'],
  }, {
    check(unit, api) {
      const seen = new Set();
      const report = (node, name, why) => {
        const k = node.symbol ? node.symbol : `${name}@${node.loc.line}`;
        if (seen.has(k)) return;
        seen.add(k);
        api.report(node.nameLoc && node.nameLoc.line ? node.nameLoc : node, M(`Identifier '${name}' is reserved: ${why.en}.`, `식별자 '${name}' 는 예약되어 있습니다: ${why.ko}.`));
      };
      for (const n of U.nodes(unit, ['VarDecl', 'FunctionDecl', 'FieldDecl', 'TypedefDecl', 'ParamDecl', 'RecordDecl', 'EnumDecl', 'EnumConstant', 'AliasDecl', 'TemplateParam', 'NamespaceDecl'])) {
        const name = n.name;
        if (!name || typeof name !== 'string') continue;
        if (n.type === 'FunctionDecl' && n.qualifier) continue; // out-of-class definition: the declaration is checked
        if (n.type === 'FunctionDecl' && /^operator\s*""/.test(name)) {
          const suffix = name.replace(/^operator\s*""\s*/, '');
          if (suffix && !suffix.startsWith('_')) report(n, name, M(`the user-defined literal suffix '${suffix}' does not begin with an underscore`, `사용자 정의 리터럴 접미사 '${suffix}' 가 밑줄로 시작하지 않습니다`));
          else if (/^_[A-Z]/.test(suffix) || /__/.test(suffix)) report(n, name, M(`the literal suffix '${suffix}' is a reserved name`, `리터럴 접미사 '${suffix}' 는 예약된 이름입니다`));
          continue;
        }
        if (n.type === 'FunctionDecl' && (n.isOperator || n.isDestructor || n.isConversion)) continue;
        const why = reservedWhy(name, ['VarDecl', 'FunctionDecl', 'TypedefDecl', 'RecordDecl', 'EnumDecl', 'AliasDecl'].includes(n.type) && isGlobalScope(n));
        if (why) report(n, name, why);
      }
      for (const m of unit.macros || []) {
        if (!m.file || m.file.startsWith('<') || m.predefined || m.commandLine) continue;
        const why = reservedWhy(m.name, true);
        if (why) { report({ loc: { file: m.file, line: m.line, col: m.col } }, m.name, why); continue; }
        if (KEYWORDISH.has(m.name) || m.isKeyword) report({ loc: { file: m.file, line: m.line, col: m.col } }, m.name, M('a macro must not be named like a keyword or an identifier with special meaning', '매크로 이름은 키워드나 특별한 의미의 식별자와 같으면 안 됩니다'));
      }
      for (const d of unit.directives || []) {
        if (d.kind !== 'undef' || !d.active || !d.macro || !d.file || d.file.startsWith('<')) continue;
        const why = reservedWhy(d.macro, true) || (KEYWORDISH.has(d.macro) ? M('it names a keyword or a standard identifier', '키워드나 표준 식별자의 이름입니다') : null);
        if (why) report({ loc: { file: d.file, line: d.line, col: d.col } }, d.macro, why);
      }
    },
  }),

  rule('DCL52-CPP', {
    risk: 'LUL', cwe: ['CWE-758'],
    name: ['Never qualify a reference type with const or volatile', '참조 형식에 const 나 volatile 을 붙이지 마세요'],
    why: ['A cv-qualifier applied to a reference (directly, through a typedef or decltype) is ignored or ill-formed; the code does not mean what it says — the referred object stays modifiable.', '참조에 붙인 cv 한정자(직접, typedef 나 decltype 을 통해)는 무시되거나 잘못된 코드입니다. 참조된 객체는 여전히 수정 가능합니다.'],
    fix: ['Qualify the referred type instead: const int &r, or a typedef of const T &.', '대신 참조되는 형식을 한정하세요: const int &r 또는 const T & 의 typedef.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, ['VarDecl', 'ParamDecl', 'FieldDecl', 'TypedefDecl'])) {
        const specs = d.specs;
        const q = (specs && specs.qualifiers || []).filter((x) => x === 'const' || x === 'volatile');
        if (!q.length || !specs.typeSpec) continue;
        const ts = specs.typeSpec;
        let refT = null, via = '';
        if (ts.type === 'NamedType' && ts.symbol && ts.symbol.kind === 'typedef') {
          const c = T.canonical(ts.symbol.type);
          if (c && c.kind === 'reference') { refT = c; via = `typedef '${ts.name}'`; }
        } else if (ts.type === 'DecltypeType' && ts.ctype) {
          const c = T.canonical(ts.ctype);
          if (c && c.kind === 'reference') { refT = c; via = 'decltype'; }
        }
        if (!refT) continue;
        // only when the declarator itself does not add a pointer (const R *p is a pointer to reference: ill-formed anyway)
        api.report(d.nameLoc && d.nameLoc.line ? d.nameLoc : d, M(`'${q.join(' ')}' applied to reference type ${via} in the declaration of '${d.name || '?'}' has no effect.`, `'${d.name || '?'}' 선언에서 참조 형식 ${via} 에 붙인 '${q.join(' ')}' 는 효과가 없습니다.`));
      }
      // `T & const x` and `decltype((x)) const` do not parse; read them from the tokens.
      const toks = unit.tokens || [];
      for (let i = 0; i + 1 < toks.length; i++) {
        const t = toks[i];
        if (!t.file || t.file.startsWith('<') || t.fromMacro) continue;
        const n = toks[i + 1];
        if (t.kind === 'punct' && (t.value === '&' || t.value === '&&') && n.kind === 'keyword' && (n.value === 'const' || n.value === 'volatile')) {
          const prev = toks[i - 1];
          if (!prev || !(prev.kind === 'identifier' || prev.kind === 'keyword' || prev.value === '>' || prev.value === '*')) continue;
          if (prev.kind === 'keyword' && !/^(int|char|short|long|float|double|bool|unsigned|signed|void|auto|wchar_t|char8_t|char16_t|char32_t|const|volatile)$/.test(prev.value)) continue;
          api.report(t, M(`'${n.value}' applied directly to a reference declarator ('${t.value} ${n.value}') is ill-formed or ignored.`, `참조 선언자에 직접 붙인 '${n.value}' ('${t.value} ${n.value}') 는 잘못되었거나 무시됩니다.`));
        }
        if (t.kind === 'keyword' && t.value === 'decltype' && n.value === '(' && toks[i + 2] && toks[i + 2].value === '(') {
          let depth = 0, j = i + 1;
          for (; j < toks.length; j++) {
            if (toks[j].value === '(') depth++;
            else if (toks[j].value === ')') { depth--; if (!depth) break; }
          }
          const after = toks[j + 1];
          if (after && after.kind === 'keyword' && (after.value === 'const' || after.value === 'volatile') && toks[j - 1].value === ')') {
            api.report(t, M(`'${after.value}' applied to decltype((...)), which is a reference type, has no effect.`, `참조 형식인 decltype((...)) 에 붙인 '${after.value}' 는 효과가 없습니다.`));
          }
        }
      }
    },
  }),

  rule('DCL53-CPP', {
    risk: 'LUM', cwe: ['CWE-758'], approx: true,
    name: ['Do not write syntactically ambiguous declarations', '구문상 모호한 선언을 작성하지 마세요'],
    why: ['`T x();` declares a function, `T x(U(y));` declares a function taking a U, and `std::unique_lock<std::mutex>(m);` declares a new object m (or a temporary destroyed at once) instead of locking m.', '`T x();` 는 함수를, `T x(U(y));` 는 U 를 받는 함수를 선언하며, `std::unique_lock<std::mutex>(m);` 는 m 을 잠그는 대신 새 객체 m 을 선언하거나(또는 즉시 소멸되는 임시 객체를 만듭니다).'],
    fix: ['Use brace initialization (T x{}; T x{U(y)};) and always name RAII objects: std::unique_lock<std::mutex> lk(m);', '중괄호 초기화(T x{}; T x{U(y)};)를 쓰고 RAII 객체에는 항상 이름을 붙이세요: std::unique_lock<std::mutex> lk(m);'],
  }, {
    check(unit, api) {
      for (const f of U.nodes(unit, 'FunctionDecl')) {
        if (f.body) continue;
        const decl = declOf(f);
        const blk = decl && U.parent(decl);
        if (!blk || blk.type !== 'CompoundStmt') continue;
        const fd = fnDeclarator(f);
        const params = f.params || [];
        const vexing = !params.length && fd && !fd.voidParams;
        const parenParam = params.some((p) => p.declarator && cf.declLeaf(p.declarator) && cf.declLeaf(p.declarator).parenthesized);
        if (vexing || parenParam) {
          api.report(f.nameLoc && f.nameLoc.line ? f.nameLoc : f, M(`'${U.src(unit, decl).replace(/\s+/g, ' ').slice(0, 60)}' declares a local function '${f.name}', not an object (most vexing parse).`, `'${U.src(unit, decl).replace(/\s+/g, ' ').slice(0, 60)}' 는 객체가 아니라 지역 함수 '${f.name}' 를 선언합니다(most vexing parse).`));
        }
      }
      // T x(U(y)); / T x(U()); — the standard reads these as function declarations.
      for (const v of U.nodes(unit, 'VarDecl')) {
        if (!v.init || v.init.type !== 'ParenListInit' || v.init.args.length !== 1) continue;
        const blk = U.parent(declOf(v));
        if (!blk || blk.type !== 'CompoundStmt') continue;
        const a = v.init.args[0];
        if (!a || a.type !== 'CastExpr' || a.kind !== 'functional' || a.brace) continue;
        const inner = a.arg ? U.skip(a.arg) : null;
        const noArgs = !a.arg && (!a.args || !a.args.length);
        if (!(noArgs || (inner && inner.type === 'Identifier' && a.arg.type === 'Identifier'))) continue;
        api.report(v.nameLoc && v.nameLoc.line ? v.nameLoc : v, M(`'${U.src(unit, declOf(v)).replace(/\s+/g, ' ').slice(0, 60)}' is parsed as a function declaration '${v.name}', not as an object initialized from a temporary.`, `'${U.src(unit, declOf(v)).replace(/\s+/g, ' ').slice(0, 60)}' 는 임시 객체로 초기화한 객체가 아니라 함수 '${v.name}' 선언으로 해석됩니다.`));
      }
      // std::lock_guard<std::mutex>(m);  -> statement creating an unnamed temporary or a new variable m
      for (const s of U.nodes(unit, 'ExprStmt')) {
        const e = U.skip(s.expr);
        if (!e || e.type !== 'CastExpr' || e.kind !== 'functional' || e.brace) continue;
        const ct = e.typeName && e.typeName.ctype && T.canonical(e.typeName.ctype);
        if (!ct || !(ct.kind === 'record' || ct.kind === 'unknown')) continue;
        const a = e.arg && U.skip(e.arg);
        if (!a || a.type !== 'Identifier') continue;
        const tn = U.typeName(ct) || U.src(unit, e.typeName);
        api.report(s, M(`'${U.src(unit, s).trim()}' declares a new object '${a.name}' of type ${tn} (or creates a temporary that is destroyed immediately); it does not operate on the existing '${a.name}'.`, `'${U.src(unit, s).trim()}' 는 기존 '${a.name}' 에 작용하지 않고 ${tn} 형식의 새 객체 '${a.name}' 를 선언합니다(또는 즉시 소멸되는 임시 객체를 만듭니다).`));
      }
      // when the front end reads `T(m);` as a declaration of m (parenthesized declarator)
      for (const v of U.nodes(unit, 'VarDecl')) {
        if (v.init) continue;
        const leaf = v.declarator && cf.declLeaf(v.declarator);
        if (!leaf || !leaf.parenthesized) continue;
        const blk = U.parent(declOf(v));
        if (!blk || blk.type !== 'CompoundStmt') continue;
        const tn = U.declTypeName(v);
        if (!/lock|guard|mutex|scoped|unique|shared/i.test(tn)) continue;
        api.report(v, M(`'${U.src(unit, declOf(v)).trim()}' declares a new object '${v.name}' of type ${tn}; it does not lock the existing '${v.name}'.`, `'${U.src(unit, declOf(v)).trim()}' 는 기존 '${v.name}' 를 잠그지 않고 ${tn} 형식의 새 객체 '${v.name}' 를 선언합니다.`));
      }
    },
  }),

  rule('DCL54-CPP', {
    risk: 'LPL', cwe: ['CWE-762'],
    name: ['Overload allocation and deallocation functions as a pair in the same scope', '할당 함수와 해제 함수는 같은 범위에서 짝으로 오버로드하세요'],
    why: ['A custom operator new without the matching operator delete (or the reverse) makes the default function release memory it did not allocate.', '짝이 되는 operator delete 없이 사용자 operator new 만 정의하면(또는 그 반대) 기본 함수가 자신이 할당하지 않은 메모리를 해제합니다.'],
    fix: ['Declare operator new and operator delete (and the [] forms) together in the same class or at namespace scope.', 'operator new 와 operator delete(그리고 [] 형태)를 같은 클래스나 네임스페이스 범위에서 함께 선언하세요.'],
  }, {
    project(project, api) {
      const groups = new Map(); // scope key -> Map(opName -> node)
      for (const unit of project.units) {
        if (unit.lang !== 'cpp') continue;
        for (const f of U.nodes(unit, 'FunctionDecl')) {
          const name = String(f.name || '').replace(/\s+/g, ' ').replace(/ \[\]$/, '[]');
          if (!Object.hasOwn(OPS_NEW, name) && !Object.hasOwn(OPS_DEL, name)) continue;
          if (f.isDeleted) continue;
          const rec = cf.enclosing(f, 'RecordDecl');
          const scope = rec ? `class:${rec.qname || rec.name}` : f.qualifier ? `class:${f.qualifier}` : 'global';
          let g = groups.get(scope);
          if (!g) groups.set(scope, (g = { ops: new Map(), first: new Map() }));
          if (!g.first.has(name)) g.first.set(name, f);
          g.ops.set(name, true);
        }
      }
      for (const [scope, g] of groups) {
        for (const [name, f] of g.first) {
          const want = OPS_NEW[name] || OPS_DEL[name];
          if (g.ops.has(want)) continue;
          // a class that declares any member operator delete covers both forms when only the scalar new exists
          const where = scope === 'global' ? M('at namespace scope', '네임스페이스 범위에서') : M(`in class '${scope.slice(6)}'`, `클래스 '${scope.slice(6)}' 에서`);
          api.report(f, M(`'${name}' is overloaded ${where.en} without a matching '${want}'.`, `'${name}' 가 ${where.ko} 짝이 되는 '${want}' 없이 오버로드되었습니다.`));
        }
      }
    },
  }),

  rule('DCL55-CPP', {
    risk: 'LUH', cwe: ['CWE-200', 'CWE-226'], sec: true, approx: true,
    name: ['Avoid information leakage when passing a class object across a trust boundary', '신뢰 경계를 넘어 클래스 객체를 전달할 때 정보 누출을 피하세요'],
    why: ['Padding bytes of a class object hold leftover memory contents; copying the raw object to user space, a socket or a file leaks them.', '클래스 객체의 패딩 바이트에는 이전 메모리 내용이 남아 있어 객체를 그대로 사용자 공간, 소켓, 파일로 복사하면 이 내용이 누출됩니다.'],
    fix: ['Serialize the members one by one into a buffer, or declare the class without padding (reorder members, explicit reserved fields set to zero).', '멤버를 하나씩 버퍼로 직렬화하거나 패딩이 없도록 클래스를 선언하세요(멤버 순서 변경, 0 으로 채운 명시적 예약 필드).'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(Object.keys(TRUST_SINKS)))) {
        const i = TRUST_SINKS[U.callName(c)];
        if (i < 0) continue;
        let a = U.arg(c, i);
        if (!a) continue;
        let rt = null;
        if (a.type === 'UnaryExpr' && a.op === '&') rt = X.recType(U.strip(a.arg) && U.strip(a.arg).ctype);
        else rt = X.pointeeRec(a.ctype);
        if (!rt || !rt.complete) continue;
        const pad = X.paddingOf(rt, unit.target);
        if (!pad) continue;
        api.report(c, M(`${U.callName(c)}() copies an object of '${rt.name}' with ${pad} padding byte(s); the padding can leak uninitialized memory.`, `${U.callName(c)}() 가 패딩 ${pad} 바이트가 있는 '${rt.name}' 객체를 복사하여 초기화되지 않은 메모리가 누출될 수 있습니다.`));
      }
    },
  }),

  rule('DCL56-CPP', {
    risk: 'LUM', cwe: ['CWE-908', 'CWE-674'], approx: true,
    name: ['Avoid cycles during initialization of static objects', '정적 객체를 초기화할 때 순환을 피하세요'],
    why: ['A function-local static whose initializer re-enters the same function is undefined behavior (deadlock or recursion), and a global initialized from a global of another translation unit may read it before it is constructed.', '초기화식이 같은 함수로 다시 들어가는 함수 지역 static 은 정의되지 않은 동작(교착 또는 재귀)이며, 다른 번역 단위의 전역으로 초기화되는 전역은 생성 전의 값을 읽을 수 있습니다.'],
    fix: ['Break the recursion; use constant initialization or a function returning a local static (construct-on-first-use) for cross-unit globals.', '재귀를 끊고, 단위 간 전역에는 상수 초기화나 지역 static 을 반환하는 함수(처음 사용 시 생성)를 사용하세요.'],
  }, {
    project(project, api) {
      for (const unit of project.units) {
        if (unit.lang !== 'cpp') continue;
        for (const v of U.nodes(unit, 'VarDecl')) {
          if (!v.init || !v.symbol) continue;
          const fn = U.enclosingFn(v);
          if (fn && v.symbol.storage === 'static' && fn.type === 'FunctionDecl') {
            const self = fn.symbol;
            const rec = U.callsIn(v.init).find((c) => {
              const s = c.calleeSymbol || U.idSym(c.callee);
              return s && (s === self || (self && s.qname === self.qname && s.kind === 'function'));
            });
            if (rec) api.report(rec, M(`Static local '${v.name}' is initialized by calling '${U.fnName(fn)}' recursively from its own initializer.`, `정적 지역 변수 '${v.name}' 가 자신의 초기화식에서 '${U.fnName(fn)}' 를 재귀 호출하여 초기화됩니다.`));
            continue;
          }
          if (fn || v.symbol.storage !== 'static') continue;
          if ((v.specs && v.specs.functionSpecs || []).some((x) => x === 'constexpr' || x === 'constinit')) continue;
          for (const id of cf.findAll(v.init, 'Identifier')) {
            const s = id.symbol;
            if (!s || s.kind !== 'variable' || s.linkage !== 'external' || s.system) continue;
            if (s.definition && s.definition.loc && s.definition.loc.file === unit.file) continue;
            const g = project.globalSymbols.get(s.qname);
            if (!g) continue;
            const def = (g.definitions || []).find((d) => d.node && d.file !== unit.file && d.unit !== unit.file);
            if (!def || !def.node.init) continue;
            const init = X.initExpr(def.node.init);
            const dynamic = !init || init.type === 'CallExpr' || init.type === 'CastExpr' && init.kind === 'functional' || init.type === 'NewExpr' || U.constInt(unit, init) == null && !['StringLiteral', 'FloatingLiteral', 'CharLiteral', 'BoolLiteral', 'NullptrLiteral'].includes(init.type);
            if (!dynamic) continue;
            api.report({ file: unit.file, line: id.loc.line, column: id.loc.col }, M(`Global '${v.name}' is initialized from '${s.name}', a dynamically initialized global of another translation unit (${def.file}); the initialization order is unspecified.`, `전역 '${v.name}' 가 다른 번역 단위(${def.file})의 동적 초기화 전역 '${s.name}' 로 초기화되어 초기화 순서가 정해지지 않았습니다.`));
          }
        }
      }
    },
  }),

  rule('DCL57-CPP', {
    risk: 'LLM', cwe: ['CWE-248', 'CWE-705'],
    name: ['Do not let exceptions escape from destructors or deallocation functions', '소멸자나 해제 함수에서 예외가 빠져나가지 않게 하세요'],
    why: ['Destructors and operator delete are implicitly noexcept; an exception leaving them calls std::terminate, and during stack unwinding it always does.', '소멸자와 operator delete 는 암묵적으로 noexcept 이므로 예외가 빠져나가면 std::terminate 가 호출되며, 스택 해제 중에는 항상 그렇습니다.'],
    fix: ['Catch and handle every exception inside the destructor; do not declare it noexcept(false).', '소멸자 안에서 모든 예외를 잡아 처리하고 noexcept(false) 로 선언하지 마세요.'],
  }, {
    check(unit, api) {
      for (const f of U.nodes(unit, 'FunctionDecl')) {
        const name = String(f.name || '');
        const isDel = /^operator delete/.test(name);
        if (!f.isDestructor && !isDel) continue;
        const what = f.isDestructor ? M(`Destructor '${f.qname || name}'`, `소멸자 '${f.qname || name}'`) : M(`Deallocation function '${f.qname || name}'`, `해제 함수 '${f.qname || name}'`);
        if (isNoexceptFalse(unit, f)) {
          api.report(f, M(`${what.en} is declared noexcept(false); exceptions may escape it.`, `${what.ko} 가 noexcept(false) 로 선언되어 예외가 빠져나갈 수 있습니다.`));
          continue;
        }
        if (!f.body) continue;
        for (const t of escapingThrows(f)) api.report(t, M(`${what.en} throws an exception that is not caught inside it.`, `${what.ko} 가 내부에서 잡지 않는 예외를 던집니다.`));
        if (f.body.type === 'TryStmt' && f.body.functionTry && f.isDestructor) {
          for (const h of f.body.handlers || []) {
            const ends = h.body && h.body.body && h.body.body.length && h.body.body[h.body.body.length - 1];
            if (!ends || ends.type !== 'ReturnStmt') api.report(h, M(`${what.en} has a function-try-block whose handler rethrows implicitly at its end.`, `${what.ko} 의 함수 try 블록 처리기는 끝에서 암묵적으로 예외를 다시 던집니다.`));
          }
        }
      }
    },
  }),

  rule('DCL58-CPP', {
    risk: 'HLM', cwe: ['CWE-758'],
    name: ['Do not modify the standard namespaces', '표준 네임스페이스를 수정하지 마세요'],
    why: ['Adding declarations or definitions to namespace std or posix is undefined behavior; only specializations of standard templates for user-defined types are allowed.', 'std 나 posix 네임스페이스에 선언이나 정의를 추가하는 것은 정의되지 않은 동작입니다. 사용자 정의 형식에 대한 표준 템플릿 특수화만 허용됩니다.'],
    fix: ['Put the declaration in your own namespace; specialize std templates (std::hash<MyType>) only for your own types.', '선언은 자체 네임스페이스에 두고, std 템플릿 특수화(std::hash<MyType>)는 자신의 형식에 대해서만 하세요.'],
  }, {
    check(unit, api) {
      for (const ns of U.nodes(unit, 'NamespaceDecl')) {
        const name = String(ns.name || '');
        const outer = cf.enclosing(ns, 'NamespaceDecl');
        if (outer) continue; // nested in another namespace: not std
        if (!/^(std|posix)(::|$)/.test(name)) continue;
        for (const d of ns.decls || []) {
          if (d.type === 'TemplateDecl' && d.isSpecialization) continue;
          if (d.type === 'TemplateDecl' && d.instantiation) continue;
          if (d.type === 'EmptyDecl') continue;
          if (d.type === 'Declaration' && !(d.declarators || []).length && d.specs && d.specs.typeSpec && d.specs.typeSpec.type === 'RecordDecl' && d.specs.typeSpec.templateArgs) continue;
          const what = d.type === 'Declaration' ? ((d.declarators || [])[0] && d.declarators[0].name) || (d.specs && d.specs.typeSpec && d.specs.typeSpec.name) || 'declaration' : d.name || d.type;
          api.report(d, M(`Declaration '${what}' is added to namespace '${name}'.`, `네임스페이스 '${name}' 에 선언 '${what}' 가 추가되었습니다.`));
        }
      }
    },
  }),

  rule('DCL59-CPP', {
    risk: 'MUM', cwe: ['CWE-758'],
    name: ['Do not define an unnamed namespace in a header file', '헤더 파일에 이름 없는 네임스페이스를 정의하지 마세요'],
    why: ['Every translation unit that includes the header gets its own copy of the entities in the unnamed namespace, which wastes space and breaks code that expects one shared object.', '헤더를 포함하는 번역 단위마다 이름 없는 네임스페이스 안 개체의 별도 사본이 생겨 공간을 낭비하고 하나의 공유 객체를 기대하는 코드가 깨집니다.'],
    fix: ['Use a named namespace with inline variables/functions, or move the unnamed namespace into the source file.', '이름 있는 네임스페이스와 inline 변수/함수를 쓰거나 이름 없는 네임스페이스를 소스 파일로 옮기세요.'],
  }, {
    check(unit, api) {
      for (const ns of U.nodes(unit, 'NamespaceDecl')) {
        if (!ns.anonymous) continue;
        if (!X.isHeaderFile(ns.loc.file)) continue;
        api.report(ns, M(`Unnamed namespace defined in header '${ns.loc.file}'.`, `헤더 '${ns.loc.file}' 에 이름 없는 네임스페이스가 정의되었습니다.`));
      }
    },
  }),

  rule('DCL60-CPP', {
    risk: 'HUH', cwe: ['CWE-758'], approx: true,
    name: ['Obey the one-definition rule', '단일 정의 규칙(ODR)을 지키세요'],
    why: ['A class or inline function defined differently in two translation units, or a non-inline function defined twice, violates the one-definition rule; the program behaves unpredictably and the linker may not notice.', '두 번역 단위에서 다르게 정의된 클래스나 inline 함수, 또는 두 번 정의된 비 inline 함수는 단일 정의 규칙 위반입니다. 프로그램 동작을 예측할 수 없고 링커가 알아채지 못할 수 있습니다.'],
    fix: ['Define each class and inline function once in a shared header; put file-local helpers in an unnamed namespace.', '각 클래스와 inline 함수는 공유 헤더에서 한 번만 정의하고, 파일 전용 도우미는 이름 없는 네임스페이스에 두세요.'],
  }, {
    project(project, api) {
      const classes = new Map();
      const inlines = new Map();
      const namespaceLevel = (n) => {
        for (let p = U.parent(n); p; p = U.parent(p)) {
          if (p.type === 'TranslationUnit') return true;
          if (p.type === 'NamespaceDecl') { if (p.anonymous) return false; continue; }
          if (p.type === 'LinkageSpec' || p.type === 'Declaration' || p.type === 'DeclSpec') continue;
          return false;
        }
        return false;
      };
      for (const unit of project.units) {
        if (unit.lang !== 'cpp') continue;
        for (const r of U.nodes(unit, 'RecordDecl')) {
          if (!r.members || !r.name || r.anonymous || r.templateArgs || inTemplate(r) || !namespaceLevel(r)) continue;
          const k = r.qname || r.name;
          const loc = `${r.loc.file}:${r.loc.start}`;
          let l = classes.get(k);
          if (!l) classes.set(k, (l = new Map()));
          if (!l.has(loc)) l.set(loc, { node: r, unit, text: normText(U.src(unit, r)) });
        }
        for (const f of U.nodes(unit, 'FunctionDecl')) {
          if (!f.body || inTemplate(f) || !namespaceLevel(f)) continue;
          const fs = (f.specs && f.specs.functionSpecs) || [];
          if (!fs.includes('inline') && !fs.includes('constexpr')) continue;
          if (f.symbol && f.symbol.linkage !== 'external') continue;
          const k = `${f.qualifier ? f.qualifier + '::' : ''}${f.qname || f.name}(${U.tstr(f.ctype)})`;
          const loc = `${f.loc.file}:${f.loc.start}`;
          let l = inlines.get(k);
          if (!l) inlines.set(k, (l = new Map()));
          if (!l.has(loc)) l.set(loc, { node: f, unit, text: normText(U.src(unit, f)) });
        }
      }
      const check = (map, kind) => {
        for (const [name, defs] of map) {
          if (defs.size < 2) continue;
          const list = [...defs.values()];
          const first = list[0];
          for (const d of list.slice(1)) {
            if (d.text === first.text) continue;
            api.report({ file: d.node.loc.file, line: d.node.loc.line, column: d.node.loc.col }, M(`${kind.en} '${name.replace(/\(.*$/, '')}' is defined differently here and in ${first.node.loc.file}:${first.node.loc.line} (one-definition rule).`, `${kind.ko} '${name.replace(/\(.*$/, '')}' 가 여기와 ${first.node.loc.file}:${first.node.loc.line} 에서 다르게 정의되었습니다(단일 정의 규칙).`));
          }
        }
      };
      check(classes, M('Class', '클래스'));
      check(inlines, M('Inline function', 'inline 함수'));
      for (const g of project.globalSymbols.values()) {
        if (!g.multipleDefinitions || g.system) continue;
        // front end: a member defined out of class whose class is unresolved loses the class from its qname
        const defs = (g.definitions || []).filter((d) => d.node && !(d.node.qualifier && !(d.node.symbol && d.node.symbol.record)) &&String(d.file || '').match(/\.(cpp|cc|cxx|C|hpp|hh|hxx)$/));
        if (defs.length < 2) continue;
        const fsx = (defs[0].node.specs && defs[0].node.specs.functionSpecs) || [];
        if (fsx.includes('inline') || fsx.includes('constexpr')) continue;
        const d = defs[1];
        api.report({ file: d.file, line: d.line, column: d.col }, M(`'${g.qname}' is defined in more than one translation unit (${defs.map((x) => x.file).join(', ')}).`, `'${g.qname}' 가 둘 이상의 번역 단위(${defs.map((x) => x.file).join(', ')})에서 정의되었습니다.`));
      }
    },
  }),
];
