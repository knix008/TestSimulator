'use strict';

// AUTOSAR C++14 chapter 2 — lexical conventions (character set, digraphs,
// comments, identifiers, literals) and MISRA C++:2008 M2 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const LITERAL_KINDS = new Set(['string', 'char']);
const BASIC = /^[\x09\x0b\x0c\x20-\x7e]*$/;

// Typographic normalisation for M2-10-1.
function confusable(name) {
  return name.toLowerCase().replace(/_/g, '').replace(/rn/g, 'm').replace(/[o]/g, '0').replace(/[il]/g, '1')
    .replace(/s/g, '5').replace(/z/g, '2').replace(/h/g, 'n').replace(/b/g, '8');
}

function headerDeclsWithoutDoc(unit) {
  const out = [];
  const comments = U.userComments(unit);
  const docAbove = (n) => {
    const line = n.loc.line;
    return comments.some((c) => c.file === n.loc.file && (c.endLine === line - 1 || (c.endLine === line && c.endCol <= n.loc.col)));
  };
  const visit = (decls) => {
    for (const d of decls || []) {
      if (!U.user(d) || !cf.isHeader(d.loc.file)) continue;
      if (d.type === 'NamespaceDecl') { visit(d.decls); continue; }
      const decl = d.type === 'TemplateDecl' ? d.decl : d;
      if (!decl || decl.type !== 'Declaration') continue;
      const ts = decl.specs && decl.specs.typeSpec;
      let name = null;
      if (!decl.declarators.length && ts && (ts.type === 'RecordDecl' || ts.type === 'EnumDecl') && ts.isDefinition && ts.name) name = ts.name;
      else if (decl.declarators.length === 1 && decl.declarators[0].type === 'FunctionDecl' && !decl.declarators[0].qualifier) name = decl.declarators[0].name;
      if (name && !docAbove(d)) out.push({ node: d, name });
    }
  };
  visit(unit.ast.decls);
  return out;
}

module.exports = [
  A({
    id: 'A2-3-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Only characters of the basic source character set shall be used in the source code', '소스 코드에는 기본 소스 문자 집합의 문자만 써야 합니다'],
    why: ['Characters outside the basic set (non-ASCII letters, $, @, `) are implementation-defined and depend on the file encoding.', '기본 집합 밖의 문자(비 ASCII 문자, $, @, `)는 구현 정의이며 파일 인코딩에 따라 달라집니다.'],
    fix: ['Use only basic source characters outside comments and string literals.', '주석과 문자열 리터럴 밖에서는 기본 소스 문자만 쓰세요.'],
    check(unit, api) {
      for (const { file, tokens } of U.rawTokenFiles(unit)) {
        for (const t of tokens) {
          if (LITERAL_KINDS.has(t.kind)) continue;
          if (t.kind === 'other' || !BASIC.test(t.value) || /[$@`]/.test(t.value)) {
            api.report({ file, line: t.line, col: t.col }, M(`The token '${t.value}' uses a character outside the basic source character set.`, `토큰 '${t.value}' 에 기본 소스 문자 집합 밖의 문자가 있습니다.`));
          }
        }
      }
    },
  }),
  D('A2-5-1', ['5.0.1'], { cat: 'Required', name: ['Trigraphs shall not be used', '트라이그래프는 쓰면 안 됩니다'] }),
  A({
    id: 'A2-5-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Digraphs shall not be used', '다이그래프는 쓰면 안 됩니다'],
    why: ['Digraphs such as <: and %> are rarely known and make the code hard to read.', '<: 나 %> 같은 다이그래프는 잘 알려지지 않아 코드를 읽기 어렵게 만듭니다.'],
    fix: ['Write the ordinary punctuator ([, ], {, }, #).', '보통 구두점([, ], {, }, #)을 쓰세요.'],
    check(unit, api) {
      for (const { file, tokens } of U.rawTokenFiles(unit)) {
        for (const t of tokens) if (t.digraph) api.report({ file, line: t.line, col: t.col }, M(`The digraph '${t.digraph}' is used for '${t.value}'.`, `'${t.value}' 대신 다이그래프 '${t.digraph}' 를 씁니다.`));
      }
    },
  }),
  D('A2-7-1', ['5.7.3'], {
    name: ['The character \\ shall not occur as the last character of a C++ comment', 'C++ 주석의 마지막 문자로 \\ 가 오면 안 됩니다'],
  }),
  D('A2-7-2', ['dir-5.7.2'], { cat: 'Required' }),
  A({
    id: 'A2-7-3', cat: 'Required', enf: 'partially automated', sev: 'MINOR', debt: 5,
    name: ['Declarations of user-defined types and functions in headers shall be preceded by documentation', '헤더의 사용자 정의 형식과 함수 선언 앞에는 문서 주석이 있어야 합니다'],
    why: ['Interfaces declared in headers are used by other components; without documentation their contract is unknown.', '헤더에 선언한 인터페이스는 다른 구성 요소가 쓰므로, 문서가 없으면 그 계약을 알 수 없습니다.'],
    fix: ['Add a comment that documents the type or function directly above its declaration.', '선언 바로 위에 형식이나 함수를 설명하는 주석을 다세요.'],
    check(unit, api) {
      for (const { node, name } of headerDeclsWithoutDoc(unit)) api.report(node, M(`'${name}' is declared in a header without a preceding documentation comment.`, `'${name}' 이(가) 헤더에서 문서 주석 없이 선언되었습니다.`));
    },
  }),
  D('M2-7-1', ['5.7.1']),
  D('A2-10-1', ['6.4.1'], { name: ['An identifier declared in an inner scope shall not hide an identifier declared in an outer scope', '안쪽 범위에서 선언한 식별자가 바깥 범위의 식별자를 가리면 안 됩니다'] }),
  A({
    id: 'A2-10-4', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['The name of a static non-member object or static function shall not be reused within a namespace', '정적 비멤버 객체나 정적 함수의 이름을 같은 네임스페이스 안에서 다시 쓰면 안 됩니다'],
    why: ['Two internal-linkage entities with the same name in different files of one namespace are easily confused with each other.', '같은 네임스페이스의 서로 다른 파일에 같은 이름의 내부 링키지 개체가 있으면 서로 혼동하기 쉽습니다.'],
    fix: ['Give each internal entity a distinct name.', '내부 개체마다 다른 이름을 주세요.'],
    project(project, api) {
      const byName = new Map();
      for (const u of project.units) {
        if (u.lang !== 'cpp') continue;
        for (const d of U.ix(u).get('VarDecl', 'FunctionDecl')) {
          if (!d.symbol || d.symbol.linkage !== 'internal' || !U.hasStorage(d, 'static')) continue;
          if (cf.enclosing(d, ['FunctionDecl', 'RecordDecl', 'LambdaExpr'])) continue;
          const ns = cf.ancestors(d).filter((a) => a.type === 'NamespaceDecl').map((a) => a.name || '(anon)').reverse().join('::');
          const key = `${ns}::${d.name}`;
          let l = byName.get(key);
          if (!l) byName.set(key, (l = []));
          if (!l.some((x) => x.loc.file === d.loc.file)) l.push(d);
        }
      }
      for (const l of byName.values()) {
        if (l.length < 2) continue;
        for (const d of l.slice(1)) api.report({ ...U.at(d), file: d.loc.file }, M(`The internal name '${d.name}' is also used in ${l[0].loc.file}.`, `내부 이름 '${d.name}' 은(는) ${l[0].loc.file} 에서도 씁니다.`));
      }
    },
  }),
  A({
    id: 'A2-10-6', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A class or enumeration name shall not be hidden by a variable, function or enumerator declaration in the same scope', '클래스나 열거형 이름을 같은 범위의 변수, 함수, 열거자 선언으로 가리면 안 됩니다'],
    why: ['When an object and a type share a name, the type can only be named with an elaborated specifier, which confuses readers.', '객체와 형식이 이름을 공유하면 형식은 struct/enum 을 붙여야만 가리킬 수 있어 읽는 사람을 혼란스럽게 합니다.'],
    fix: ['Rename the variable, function or enumerator.', '변수, 함수, 열거자의 이름을 바꾸세요.'],
    check(unit, api) {
      const lists = [unit.ast.decls, ...U.ix(unit).get('NamespaceDecl').map((n) => n.decls), ...U.ix(unit).get('CompoundStmt').map((c) => c.body)];
      for (const list of lists) {
        const types = new Set();
        const others = [];
        for (const d of list || []) {
          if (!d || d.type !== 'Declaration' || !U.user(d)) continue;
          const ts = d.specs && d.specs.typeSpec;
          if (ts && (ts.type === 'RecordDecl' || ts.type === 'EnumDecl') && ts.name) {
            types.add(ts.name);
            if (ts.type === 'EnumDecl' && !ts.scoped) for (const e of ts.enumerators || []) others.push({ name: e.name, node: e });
          }
          for (const x of d.declarators) if (x.name && (x.type === 'VarDecl' || x.type === 'FunctionDecl')) others.push({ name: x.name, node: x });
        }
        for (const o of others) if (types.has(o.name)) api.report(U.at(o.node), M(`'${o.name}' hides the type of the same name.`, `'${o.name}' 이(가) 같은 이름의 형식을 가립니다.`));
      }
    },
  }),
  A({
    id: 'M2-10-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Different identifiers shall be typographically unambiguous', '서로 다른 식별자는 글자 모양으로 구별되어야 합니다'],
    why: ['Names that differ only in case, underscores or look-alike characters (O/0, l/1, S/5, rn/m) are easily mixed up.', '대소문자, 밑줄, 비슷한 글자(O/0, l/1, S/5, rn/m)만 다른 이름은 쉽게 뒤섞입니다.'],
    fix: ['Rename one of the identifiers so the two clearly differ.', '두 이름이 분명히 다르도록 하나를 바꾸세요.'],
    check(unit, api) {
      const seen = new Map();
      for (const s of unit.symbols || []) {
        if (!s.name || s.system || s.predefined || s.kind === 'label' || s.name.length < 2) continue;
        const d = s.decls && s.decls[0];
        if (!d || !U.user(d) || /^operator|^~/.test(s.name)) continue;
        const k = confusable(s.name);
        const prev = seen.get(k);
        if (prev && prev.name !== s.name) api.report(U.at(d), M(`'${s.name}' is typographically ambiguous with '${prev.name}'.`, `'${s.name}' 은(는) '${prev.name}' 과(와) 글자 모양으로 구별하기 어렵습니다.`));
        else if (!prev) seen.set(k, s);
      }
    },
  }),
  A({
    id: 'M2-10-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['A typedef name shall be a unique identifier', 'typedef 이름은 고유한 식별자여야 합니다'],
    why: ['Reusing a typedef name for another entity, even in another scope, makes it unclear which one a use refers to.', 'typedef 이름을 다른 범위에서라도 다른 개체에 다시 쓰면 사용처가 무엇을 가리키는지 불분명해집니다.'],
    fix: ['Give the other entity a different name.', '다른 개체에 다른 이름을 주세요.'],
    check(unit, api) {
      const typedefs = new Map();
      for (const s of unit.symbols || []) {
        if (s.kind === 'typedef' && !s.system && s.decls && s.decls[0] && U.user(s.decls[0])) typedefs.set(s.name, s);
      }
      for (const s of unit.symbols || []) {
        if (!s.name || s.system || s.kind === 'typedef' || s.kind === 'label' || s.kind === 'tag') continue;
        const t = typedefs.get(s.name);
        const d = s.decls && s.decls[0];
        if (t && d && U.user(d)) api.report(U.at(d), M(`'${s.name}' reuses the name of a typedef.`, `'${s.name}' 이(가) typedef 이름을 다시 씁니다.`));
      }
      // the same typedef name declared twice for different types
      const byName = new Map();
      for (const s of unit.symbols || []) {
        if (s.kind !== 'typedef' || s.system || !s.decls || !s.decls[0] || !U.user(s.decls[0])) continue;
        const prev = byName.get(s.name);
        if (prev && prev !== s) api.report(U.at(s.decls[0]), M(`The typedef name '${s.name}' is declared more than once.`, `typedef 이름 '${s.name}' 이(가) 두 번 이상 선언되었습니다.`));
        else byName.set(s.name, s);
      }
    },
  }),
  A({
    id: 'A2-11-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10,
    name: ['The volatile keyword shall not be used', 'volatile 키워드는 쓰면 안 됩니다'],
    why: ['volatile does not provide atomicity or ordering between threads and its exact semantics are implementation-defined.', 'volatile 은 스레드 사이의 원자성이나 순서를 보장하지 않으며 정확한 의미가 구현 정의입니다.'],
    fix: ['Use std::atomic for shared data; keep hardware access in an isolated, documented layer.', '공유 데이터에는 std::atomic 을 쓰고, 하드웨어 접근은 분리해 문서화한 계층에 두세요.'],
    check(unit, api) {
      for (const { file, tokens } of U.rawTokenFiles(unit)) {
        for (const t of tokens) if (t.kind === 'keyword' && (t.value === 'volatile' || t.value === '__volatile__' || t.value === '__volatile')) api.report({ file, line: t.line, col: t.col }, M("The keyword 'volatile' is used.", "'volatile' 키워드를 씁니다."));
      }
    },
  }),
  D('A2-13-1', ['5.13.1'], { name: ['Only escape sequences defined in the C++ standard shall be used', 'C++ 표준에 정의된 이스케이프 시퀀스만 써야 합니다'] }),
  D('A2-13-2', ['5.13.7']),
  A({
    id: 'A2-13-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Type wchar_t shall not be used', 'wchar_t 형식은 쓰면 안 됩니다'],
    why: ['The size and encoding of wchar_t are implementation-defined (16 bits on some platforms, 32 on others).', 'wchar_t 의 크기와 인코딩은 구현 정의입니다(어떤 플랫폼은 16비트, 어떤 플랫폼은 32비트).'],
    fix: ['Use char16_t, char32_t or UTF-8 encoded char data.', 'char16_t, char32_t, 또는 UTF-8 로 인코딩한 char 데이터를 쓰세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BuiltinType')) if (b.names.includes('wchar_t')) api.report(b, M("The type 'wchar_t' is used.", "'wchar_t' 형식을 씁니다."));
    },
  }),
  A({
    id: 'A2-13-4', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5, cwe: 'CWE-758',
    name: ['String literals shall not be assigned to non-constant pointers', '문자열 리터럴을 const 가 아닌 포인터에 대입하면 안 됩니다'],
    why: ['Modifying a string literal is undefined behaviour; a non-const pointer to it invites exactly that.', '문자열 리터럴을 수정하는 것은 정의되지 않은 동작이며, const 가 아닌 포인터는 그런 수정을 부릅니다.'],
    fix: ['Use a pointer to const char (or std::string / std::string_view).', 'const char 포인터(또는 std::string / std::string_view)를 쓰세요.'],
    check(unit, api) {
      const nonConstPtr = (t) => { const c = t && U.canon(t); return c && c.kind === 'pointer' && !U.canon(c.to).const; };
      const isStr = (e) => { e = U.strip(e); return e && e.type === 'StringLiteral'; };
      for (const v of U.ix(unit).get('VarDecl', 'FieldDecl')) {
        if (v.init && isStr(v.init) && nonConstPtr(v.ctype)) api.report(U.at(v), M(`The string literal is assigned to the non-const pointer '${v.name}'.`, `문자열 리터럴을 const 가 아닌 포인터 '${v.name}' 에 대입합니다.`));
      }
      for (const a of U.ix(unit).get('AssignExpr')) {
        if (a.op === '=' && isStr(a.right) && nonConstPtr(a.left.ctype)) api.report(a, M('A string literal is assigned to a non-const pointer.', '문자열 리터럴을 const 가 아닌 포인터에 대입합니다.'));
      }
    },
  }),
  A({
    id: 'A2-13-5', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['Hexadecimal constants should be upper case', '16진 상수는 대문자로 써야 합니다'],
    why: ['Mixing letter cases in hexadecimal digits makes constants harder to compare and read.', '16진 숫자에 대소문자를 섞으면 상수를 비교하고 읽기 어렵습니다.'],
    fix: ['Write the hexadecimal digits A-F in upper case.', '16진 숫자 A-F 를 대문자로 쓰세요.'],
    check(unit, api) {
      for (const l of U.ix(unit).get('IntegerLiteral')) {
        if (l.base !== 16) continue;
        const digits = String(l.raw).replace(/^0[xX]/, '').replace(/[uUlLzZ]+$/, '');
        if (/[a-f]/.test(digits)) api.report(l, M(`The hexadecimal constant '${l.raw}' uses lower-case digits.`, `16진 상수 '${l.raw}' 에 소문자 숫자가 있습니다.`));
      }
    },
  }),
  A({
    id: 'A2-13-6', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Universal character names shall be used only inside character or string literals', '유니버설 문자 이름은 문자나 문자열 리터럴 안에서만 써야 합니다'],
    why: ['A \\u escape in an identifier makes the name unreadable and hard to search for.', '식별자 안의 \\u 이스케이프는 이름을 읽고 찾기 어렵게 만듭니다.'],
    fix: ['Use plain ASCII identifiers.', '평범한 ASCII 식별자를 쓰세요.'],
    check(unit, api) {
      for (const { file, tokens } of U.rawTokenFiles(unit)) {
        for (const t of tokens) if (t.ucn && !LITERAL_KINDS.has(t.kind)) api.report({ file, line: t.line, col: t.col }, M(`The identifier '${t.value}' contains a universal character name.`, `식별자 '${t.value}' 에 유니버설 문자 이름이 있습니다.`));
      }
    },
  }),
  D('M2-13-2', ['5.13.3']),
  D('M2-13-3', ['5.13.4']),
  D('M2-13-4', ['5.13.5']),
];
