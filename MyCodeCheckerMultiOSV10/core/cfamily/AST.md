# C/C++ front end reference (`core/cfamily`)

This is the complete reference for the C11/C17 (+ GNU) and C++20 front end.
Rule modules (MISRA C:2012/2023, MISRA C++:2023, AUTOSAR C++14, CERT C/C++)
and the abstract-interpretation engine are built only on what is documented
here. Everything is CommonJS with Node built-ins only.

```js
const cf = require('../cfamily');            // from core/<area>/x.js
const unit = cf.parseUnit(text, { file: 'src/a.c' });
const { units, globalSymbols, callGraph } = cf.parseProject(files);
```

Contents

1. Entry points (`parseUnit`, `parseProject`, the Unit object)
2. Locations, tokens, comments (lexer)
3. Preprocessor records (directives, macros, expansions, includes)
4. AST: conventions, traversal helpers
5. AST node reference (declarations, declarators, statements, expressions)
6. Types (`cf.types`)
7. Symbols and scopes
8. Constant folding
9. Essential type model (MISRA C)
10. Value categories (C++)
11. Cross-unit symbols and the call graph
12. CFG and dataflow
13. Diagnostics
14. Recipes
15. Known limitations

---

## 1. Entry points

### `parseUnit(text, opts) -> Unit`

Preprocesses, parses and semantically analyses one translation unit. Never
throws on bad input; problems become `unit.diagnostics`.

| option | default | meaning |
| --- | --- | --- |
| `file` | `'<input>'` | path used in every location (normalised to `/`) |
| `lang` | from extension | `'c'` or `'cpp'` (`.cpp .cc .cxx .hpp .hh .hxx .ipp .tpp .inl .C` → cpp) |
| `std` | `'c17'` / `'c++20'` | `'c99'`, `'c11'`, `'c23'`, `'c++11'`…`'c++23'`; C23 adds its keywords |
| `target` | `'lp64'` | `'lp64'`, `'ilp32'`, `'llp64'` or an object overriding sizes (see §6) |
| `files` / `fileMap` | none | other project files for `#include`: `[{path,text}]`, `{path: text}` or `Map<path,{text}>` |
| `includeDirs` | `[]` | directories (project-relative) searched for `#include` |
| `defines` | none | `{ NAME: 'value' \| null }` or `['NAME=1', 'FLAG']` (like `-D`) |
| `undefs` | none | `['NAME']` (like `-U`) |
| `builtinHeaders` | `true` | use the built-in stand-ins for `<stdio.h>`, `<stdint.h>` … when no project file matches |
| `booleanTypedefs` | `bool bool_t boolean_t BOOL Boolean boolean` | typedef names treated as essentially Boolean (§9) |
| `knownTypes` | `[]` | extra identifiers the parser treats as type names (e.g. from a missing header) |
| `trigraphs` | `false` | replace trigraphs (they are always *reported*, see §2) |
| `lexCache` | new | a `Map` shared between units to lex each header once |

### The Unit object

| field | type | content |
| --- | --- | --- |
| `file`, `lang`, `std` | string | as resolved |
| `target` | object | resolved target (pass it to `types.*` functions) |
| `ast` | `TranslationUnit` | the AST, parent links attached (§4) |
| `tokens` | Token[] | preprocessed tokens of the whole TU, incl. included headers (§2) |
| `comments` | Comment[] | comments of every source file of the TU |
| `trigraphs` | object[] | trigraph sequences found (`{seq, replacement, file, line, col, offset}`) |
| `directives` | Directive[] | every directive, active or skipped (§3) |
| `macros` | MacroDef[] | every user `#define` in order (not predefined ones) |
| `macroTable` | `Map<name, MacroDef>` | macros still defined at the end of the TU |
| `expansions` | Expansion[] | every macro expansion (§3) |
| `includes` | Include[] | every `#include` (§3) |
| `headerGuards` | `Map<file, Guard>` | include-guard / `#pragma once` analysis per file |
| `skipped` | `{file,startLine,endLine}[]` | lines excluded by conditional compilation |
| `undefInIf` | object[] | identifiers evaluated as 0 in `#if`/`#elif` (`{name,file,line,col,directive}`) |
| `pragmas` | Directive[] | `#pragma` and `_Pragma` records |
| `sources` | `Map<file, LexResult>` | raw lexer output per file: `{text, tokens, comments, trigraphs, splices, lineStarts, guard}` |
| `files` | string[] | files that contributed, in inclusion order (main file first) |
| `diagnostics` | Diagnostic[] | sorted by file/line/col (§13) |
| `symbols` | Symbol[] | every symbol created (§7) |
| `scope` | Scope | the file scope |
| `externals` | Symbol[] | functions/variables with external linkage |
| `unresolved` | Identifier[] | identifier uses that resolved to nothing (typically names from missing headers or `std::`) |
| `lookup(name, scope?)` | fn | unqualified lookup (default: file scope) |
| `lookupQualified('a::b', scope?)` | fn | qualified lookup |
| `timings` | object | `{preprocess, parse, sema}` in ms |

Declarations from built-in headers live in the same AST with
`loc.file` such as `'<builtin>/stdio.h'`; project headers appear with their
own path. Use `cf.userDecls(unit)` or check `node.loc.file === unit.file`
when a rule must only look at the main file. A header included by N units is
analysed N times; deduplicate findings by `(file, line, rule)`.

### `parseProject(files, opts) -> Project`

`files = [{ path, text, lang? }]`. Every non-header file is a translation
unit. Headers are analysed through `#include`; a header that no unit includes
is parsed on its own (`unit.standaloneHeader = true`). `opts` are the
`parseUnit` options plus `headersAsUnits: true` to parse every header alone too.

```js
{
  units: Unit[],
  globalSymbols: Map<qname, GlobalSymbol>,   // §11
  callGraph: CallGraph,                      // §11
  diagnostics: (Diagnostic & { unit })[],
}
```

### Other exports

`lex`, `preprocess`, `parse`, `analyzeUnit`, `buildCFG`, `buildAllCFGs`,
`getCFG`, `solve`, `reachingDefinitions`, `liveVariables`, `essentialType`,
`essentialTypeOfType`, AST helpers (§4), and the modules themselves:
`cf.lexer`, `cf.preprocessor`, `cf.parser`, `cf.types`, `cf.symbols`,
`cf.essential`, `cf.cfg`, `cf.ast`. Also `cf.langOf(path)`, `cf.isHeader(path)`.

---

## 2. Locations, tokens, comments

### Locations

Every AST node has `loc`:

```js
loc = { file, line, col, endLine, endCol, start, end, macro? }
```

* `line`/`col` are 1-based; `endCol` is **exclusive** (the column just after
  the last character); `start`/`end` are 0-based offsets into the original
  file text (before line splicing).
* Columns count UTF-16 code units; a tab counts as one column.
* If the first token of a node came from a macro expansion, `loc` is the
  location of the outermost expansion (macro name through closing `)`), and
  `loc.macro` is the outermost macro's name.
* `cf.sourceText(unit, node)` returns the source text of `loc` (for macro
  nodes: the invocation text, e.g. `TWICE(3)`). `cf.locString(node)` gives
  `"file:line:col"`.

### Tokens

`cf.lex(text, { file, lang, std, trigraphs })` returns
`{ tokens, comments, trigraphs, splices, diagnostics, lineStarts, file, text }`.

```js
Token = {
  kind: 'identifier' | 'keyword' | 'number' | 'char' | 'string' | 'punct' | 'other',
  value,               // spelling; punctuator digraphs are canonical ('<:' -> '[')
  line, col, endLine, endCol, start, end, file,
  space, bol,          // whitespace before / first token of a logical line
  // optional
  digraph: '<:',       // original spelling of a digraph
  alt: 'and',          // C++ alternative token (value is '&&')
  prefix: 'L'|'u'|'U'|'u8'|'',  raw: true,  udSuffix: '_km',  // literals
  unterminated: true,  ucn: true,
  // tokens produced by macro expansion (unit.tokens only)
  fromMacro: 'OUTER',  // outermost macro of the expansion
  macro: 'INNER',      // macro whose body produced the token
  spelling: { file, line, col },  // where the token was written (macro body or argument)
  site: { file, line, col, endLine, endCol, start, end, macro },
  pasted: true, stringified: true,
}
```

* Identifiers that spell a keyword of the selected language get
  `kind: 'keyword'` (GNU spellings such as `__attribute__`, `__asm__`,
  `__typeof__`, `__restrict` are keywords in both languages).
* `cf.lexer.C_KEYWORDS`, `C23_KEYWORDS`, `CPP_KEYWORDS`, `GNU_KEYWORDS`,
  `keywordSet(lang, std)`, `isKeyword(name, lang, std)` are exported for rules
  such as "macro named like a keyword".
* Raw tokens of one file: `cf.rawTokens(unit, file)` (`unit.sources.get(file).tokens`).
  They are *not* preprocessed: directive lines are included.

### Comments

```js
Comment = { kind: 'comment', style: 'line' | 'block', value /* full text incl. // or /* */ */,
            line, col, endLine, endCol, start, end, file, spliced?, unterminated? }
```

`spliced` is set on a `//` comment continued onto the next line with a
backslash (MISRA C 3.2). The comment text contains `/*` or `//` sequences
verbatim (MISRA C 3.1).

### Splices and trigraphs

* `splices: [{ file, line, col, offset, whitespace }]` — backslash-newline;
  `whitespace` when blanks separate them (still spliced, with a warning).
* `trigraphs: [{ seq: '??=', replacement: '#', file, line, col, offset }]`, found
  everywhere including string literals. They are replaced only with
  `{ trigraphs: true }`.

### Literal helpers (`cf.lexer`)

```js
classifyNumber(spelling, { lang }) ->
  { kind: 'int'|'float'|'invalid', value: BigInt|number, base: 2|8|10|16,
    suffix, octal, separators, udSuffix?, error? }
decodeEscapes(body) -> { codes: number[], escapes: [{ kind: 'simple'|'octal'|'hex'|'ucn'|'unknown', text, offset, end? }], errors }
literalParts(token) -> { prefix, body, raw, udSuffix }
spell(token) -> original spelling (digraph / alternative token restored)
```

`octal` is true for `0`-prefixed integers with more than one digit (MISRA C 7.1).

---

## 3. Preprocessor records

`cf.preprocess(text, opts)` (used by `parseUnit`) returns
`{ tokens, directives, macros (Map), macroDefs, allMacroDefs, expansions, includes, diagnostics, undefInIf, pragmas, skipped, headerGuards, sources, files, comments, trigraphs }`.

### Directive

```js
Directive = {
  kind: 'define'|'undef'|'include'|'import'|'if'|'ifdef'|'ifndef'|'elif'|'elifdef'|'elifndef'
      | 'else'|'endif'|'error'|'warning'|'pragma'|'line'|'ident'|'sccs'|'assert'|'unassert'|'null'|'unknown',
  name,                 // directive word as written ('include_next' for kind 'include')
  file, line, col, endLine, endCol,
  active,               // the directive is in an active region (for #elif/#else/#endif: the enclosing #if's region)
  tokens,               // raw tokens after the directive name
  text,                 // source text of the whole directive line
  nameToken, digraph?,  // '%:' used for '#'
  // conditionals
  group,                // id shared by #if ... #elif ... #else ... #endif
  branches,             // on the opening #if: every directive of the group
  taken,                // true/false: this branch was selected; null when not evaluated (inside a skipped region)
  value, valueUnsigned, exprOk,     // #if/#elif: evaluated value (Number, BigInt when huge)
  defined: [{ name, paren, line, col }],   // operands of `defined`
  undefinedIdentifiers: ['X'],      // identifiers replaced by 0
  macro,                // #ifdef/#ifndef/#define/#undef: the macro name
  // define / undef
  def, wasDefined, undefinesPredefined,
  // include
  include, headerName, angled, invalid,
  // others
  message, pragma, once, lineNumber, fileName, operator /* _Pragma */,
}
```

Directives inside skipped regions are recorded with `active: false` and are
not executed. Pseudo files `<predefined>` and `<command-line>` are not
recorded.

### MacroDef

```js
MacroDef = {
  name, kind: 'object'|'function', params: string[], variadic, vaName: '__VA_ARGS__'|'args'|null,
  body: Token[], file, line, col, directive, id,
  usesStringify, usesPaste, usesVaOpt, isKeyword,
  predefined, commandLine, builtin /* '__LINE__' ... */,
  redefines?, incompatibleRedefinition?, redefinesPredefined?,
  undef: { file, line, col, directive } | null,
  expansionCount,
}
```

Predefined macros: `__STDC__`, `__STDC_VERSION__` (C) or `__cplusplus`,
`__STDC_HOSTED__`, `__STDC_UTF_16__`, `__STDC_UTF_32__`, `__STDC_IEC_559__`,
`__CHAR_BIT__`, `__SIZEOF_*__`, `__LP64__`/`__ILP32__`, and the dynamic
`__FILE__`, `__LINE__`, `__COUNTER__`, `__DATE__`, `__TIME__`,
`__INCLUDE_LEVEL__`, `__BASE_FILE__`, `__FILE_NAME__`, `__TIMESTAMP__`.
Compiler identification macros (`__GNUC__`, `_MSC_VER`) are *not* defined;
pass them through `defines`. `#if` also supports `__has_include`,
`__has_include_next`, `__has_cpp_attribute`, `__has_c_attribute` (standard
attributes) and `__has_attribute`/`__has_builtin`/`__has_feature` (always 0).

### Expansion

```js
Expansion = { name, file, line, col, endLine, endCol, nested /* produced while rescanning another expansion */,
              def: MacroDef, args: Token[][] | null /* raw argument tokens */ }
```

### Include

```js
Include = {
  file, line, col, name /* as written between quotes or <> */, angled, viaMacro,
  resolved: 'src/util.h' | '<builtin>/stdio.h' | null,
  kind: 'project' | 'builtin' | 'missing',
  system,               // angled or builtin
  skipped: 'guard' | 'pragma-once' | undefined,   // already included
  precededByCode,       // a non-directive token appeared earlier in the including file (MISRA C 20.1)
  suspiciousChars,      // name contains ' " \ /* or // (MISRA C 20.2)
  depth, directive,
}
```

Resolution order: quoted names relative to the including file, then
`includeDirs`, then the exact project path, then (if still not found) the
shortest project file whose path ends with `/name`. Angled names skip the
relative step. Unresolved headers become an `info` (angled) or `warning`
(quoted) diagnostic `pp-include-not-found`; processing continues.

### Guard

```js
headerGuards.get(file) = { file, macro: 'UTIL_H' | null, pragmaOnce, guarded, ifLine, endifLine }
```

A guard is `#ifndef X` / `#if !defined(X)` as the first directive, `#define X`
next, and the matching `#endif` as the last token of the file.

### Built-in headers

`<stddef.h> <stdint.h> <inttypes.h> <stdbool.h> <limits.h> <float.h> <stdarg.h>
<stdio.h> <stdlib.h> <string.h> <ctype.h> <math.h> <assert.h> <errno.h>
<setjmp.h> <signal.h> <time.h> <wchar.h> <uchar.h> <stdalign.h> <stdnoreturn.h>
<iso646.h> <locale.h> <fenv.h> <complex.h> <tgmath.h> <stdatomic.h> <threads.h>
<unistd.h> <fcntl.h> <sys/types.h>` and in C++ the `<cXXX>` forms (which add
`using ::name;` into `namespace std`). They declare the real typedefs for the
target (e.g. `size_t` is `unsigned long` on LP64), library prototypes (so
calls have return types; `exit`, `abort`, `longjmp`, `__assert_fail` carry
`__attribute__((noreturn))`) and macros (`NULL`, `EOF`, `INT_MAX`, `offsetof`,
`assert`, `va_arg` …). C++ standard library headers such as `<vector>` are not
emulated: `std::vector<int>` parses as a type (the parser knows common
`std::` names) but has `unknown` type.

---

## 4. AST conventions and traversal

* Every node is a plain object `{ type, loc, ...fields }`.
* Child lists are arrays, absent children are `null`.
* Semantic analysis adds: `ctype` (a Type, §6) on expressions, declarators'
  entities, `TypeName`, `DeclSpec`, `RecordDecl`, `EnumDecl`; `symbol` on
  declarations, `Identifier`, labels; and a few per-node results listed in §5.
* `cf.VISITOR_KEYS[type]` lists the child fields of each node type in source
  order. Fields not listed (e.g. `specs` on a `VarDecl`, which is shared with
  its `Declaration`) are never visited, so every node is visited exactly once.

```js
cf.walk(root, {
  enter(node, parent, key) { /* return cf.walk.SKIP to skip children, cf.walk.STOP to abort */ },
  leave(node, parent, key) {},
});
cf.walk(root, (node, parent, key) => {});        // enter only
cf.findAll(root, 'CallExpr');                    // or ['IfStmt','WhileStmt'] or (node, parent) => bool
cf.findFirst(root, 'ReturnStmt');
cf.childrenOf(node);
cf.parentOf(node); cf.parentKey(node);           // 'left', 'body', ...
cf.ancestors(node);                              // nearest first
cf.enclosing(node, 'FunctionDecl');              // nearest ancestor of a type (or list / predicate)
cf.skipParens(expr);
cf.userDecls(unit, file?);                       // top-level decls spelled in the file
cf.functionsOf(unit, file?);                     // FunctionDecl nodes with a body
cf.switchClauses(switchStmt);                    // { prefix: [stmts before first label], clauses: [{ labels, body, node }] }
cf.declLeaf(declarator);                         // innermost IdentDeclarator / AbstractDeclarator
cf.directFunction(declarator);                   // FunctionDeclarator applied directly to the name, or null
```

`parseUnit` attaches parent links; for a hand-built tree call
`cf.attachParents(root)`.

---

## 5. AST node reference

Notation: `Expr` is any expression node, `Stmt` any statement node,
`?` marks nullable fields. Fields marked *(sema)* are filled by semantic
analysis.

### 5.1 Translation unit and declarations

**TranslationUnit** `{ decls }` — top-level nodes: `Declaration`, `StaticAssert`,
`AsmDecl`, `MacroCallDecl`, `EmptyDecl`, `ErrorDecl` and in C++ `NamespaceDecl`,
`NamespaceAlias`, `UsingDirective`, `UsingDecl`, `AliasDecl`, `TemplateDecl`,
`LinkageSpec`, `ModuleDecl`. Includes declarations from included headers
(check `loc.file`).

**Declaration** — one declaration statement, C or C++, at any scope.
```
{ specs: DeclSpec, declarators: (VarDecl|FieldDecl|FunctionDecl|TypedefDecl|BindingDecl)[],
  access?: 'public'|'private'|'protected'   // C++ class members
  condition?: true                          // declared in an if/while/switch/for condition
  exported?: true }                         // C++ `export`
```
`struct S { ... };` and `enum E { ... };` are Declarations with no
declarators. A function definition is a Declaration with one `FunctionDecl`
whose `body` is set. Members of a struct/class are Declarations inside
`RecordDecl.members`.

**DeclSpec**
```
{ storage: ('typedef'|'extern'|'static'|'auto'|'register'|'thread_local'|'mutable')[],
  qualifiers: ('const'|'volatile'|'restrict'|'atomic')[],
  functionSpecs: ('inline'|'virtual'|'explicit'|'_Noreturn'|'constexpr'|'consteval'|'constinit'|'friend')[],
  typeSpec?: BuiltinType|NamedType|RecordDecl|EnumDecl|TypeofType|DecltypeType|AutoType|AtomicType,
  attributes: Attribute[], alignas: AlignasSpec[], callingConvention?: '__cdecl'|..., empty?: true,
  ctype (sema) }
```
`__thread`/`_Thread_local` normalise to `thread_local`, GNU `__inline__` to
`inline`, `__restrict`/`__const`/`__volatile__` to the standard words, `_Atomic`
qualifier to `atomic`. In C++ `auto` is an `AutoType` type specifier; in C it
is storage. `typeSpec` is null for implicit int (C) and constructors.

Type specifiers:

| node | fields |
| --- | --- |
| **BuiltinType** | `names: string[]` as written (`['unsigned','long','long','int']`, `__signed__` → `signed`), `bits?: Expr` for `_BitInt(N)` |
| **NamedType** | `name`, `qualifier` (`'std'`), `qname` (`'std::string'`), `global`, `templateArgs?: (TypeName\|Expr\|PackExpansion)[]`, `unknown?: true` (heuristically a type: not declared), `dependent?: true` (`typename T::x`), `symbol` *(sema)* |
| **RecordDecl** | `tag: 'struct'\|'union'\|'class'`, `name?`, `qname?`, `qualifier`, `nameLoc?`, `templateArgs?` (specialisation), `bases: BaseSpecifier[]`, `members?: (Declaration\|AccessSpec\|TemplateDecl\|AliasDecl\|UsingDecl\|StaticAssert\|MacroCallDecl\|ErrorDecl\|EmptyDecl)[]` (null when not a definition), `isDefinition`, `isFinal`, `attributes`, `anonymous`, `ctype`, `symbol` *(sema)* |
| **EnumDecl** | `name?`, `qname?`, `nameLoc?`, `scoped` (enum class/struct), `key`, `underlying?: TypeName`, `enumerators?: EnumConstant[]` (`.trailingComma`), `isDefinition`, `attributes`, `ctype`, `symbol` |
| **TypeofType** | `arg: TypeName\|Expr`, `unqual` |
| **DecltypeType** | `expr?`, `auto` (`decltype(auto)`) |
| **AutoType** | `keyword: 'auto'\|'__auto_type'` |
| **AtomicType** | `typeName: TypeName` (`_Atomic(T)`) |

**EnumConstant** `{ name, value?: Expr, attributes, constValue: BigInt (sema), symbol }`

**BaseSpecifier** `{ access?, virtual, name, qname, templateArgs?, pack, ctype (sema) }`

**AccessSpec** `{ access: 'public'|'private'|'protected' }`

**Attribute** `{ name, namespace: 'gnu'|'msvc'|'clang'|null|..., args: string|null, syntax: 'cxx11'|'gnu'|'declspec' }` — `__noreturn__` normalises to `noreturn`.
`[[...]]` before a statement is stored on that statement's `attributes`.

**AlignasSpec** `{ arg: TypeName|Expr, pack, keyword }`

Entities (the declarators of a Declaration):

| node | fields |
| --- | --- |
| **VarDecl** | `name`, `qualifier`, `qname`, `nameLoc`, `specs`, `declarator`, `init?: Expr\|InitList\|ParenListInit`, `initStyle: 'assign'\|'brace'\|'paren'\|null`, `attributes`, `asmLabel?`, `implicitInt?`, `templateArgs?`, `ctype`, `symbol` |
| **FieldDecl** | as VarDecl plus `bitWidth?: Expr`, `bitWidthValue: number` *(sema)*; member variables of struct/union/class (static ones too) |
| **TypedefDecl** | `name`, `specs`, `declarator`, `attributes`, `ctype` (a `typedef` Type), `symbol` |
| **FunctionDecl** | `name` (`'operator+'`, `'~Foo'`, `'operator bool'`), `qualifier`, `qname`, `nameLoc`, `specs`, `declarator`, `params: ParamDecl[]`, `variadic`, `body?: CompoundStmt\|TryStmt` (function-try-block), `isDefinition`, `isDefault`, `isDeleted`, `isPure`, `isOverride`, `isFinal`, `isConstructor?`, `isDestructor?`, `isOperator?`, `isConversion?`, `ctorInits?: CtorInit[]`, `krDecls?: Declaration[]` (K&R parameter declarations), `oldStyle?`, `requires?: Expr`, `attributes`, `implicitInt?`, `friend?`, `ctype`, `symbol`, `scope` *(sema)* |
| **BindingDecl** | `names: [{ name, loc }]`, `specs`, `declarator`, `init?`, `initStyle`, `bindings: Symbol[]` *(sema)* — `auto [a, b] = ...` |

`FunctionDecl.params` are the parameters of the function declarator that
applies to the name (`directFunction(declarator).params`). For a variable of
function-pointer type the parameters stay inside the declarator.

**ParamDecl** `{ name?, nameLoc?, specs, declarator, default?: Expr, attributes, pack, krIdentifier?: true, ctype (sema, after array/function adjustment), declaredType (sema, before), symbol (sema, in definitions), implicitInt? }`
A K&R identifier-list parameter has `krIdentifier: true` and `specs: null`;
its type comes from `FunctionDecl.krDecls`.

**CtorInit** `{ name ('Base', 'member_'), args: (Expr|InitList)[], brace, pack, field: Symbol (sema) }`

**ParenListInit** `{ args: Expr[] }` — C++ direct initialisation `T x(1, 2)`, `new T(1)`.

### 5.2 Declarators

The declarator chain describes how the declared type is built from the
specifier type, **outermost node first**: applying each node in turn to the
base type yields the entity's type. `int *a[3]` →
`PointerDeclarator{ inner: ArrayDeclarator{ inner: IdentDeclarator a } }`
(base `int` → pointer to int → array of 3 of that).

| node | fields |
| --- | --- |
| **IdentDeclarator** | `name`, `qualifier`, `qname`, `global`, `templateArgs?`, `isOperator`, `isDestructor`, `isConversion`, `conversionType?: TypeName`, `parenthesized?`, `pack?`, `attributes?`, `asmLabel?` |
| **AbstractDeclarator** | (no name; type names, unnamed parameters) |
| **PointerDeclarator** | `quals: string[]`, `attributes`, `inner` |
| **ReferenceDeclarator** | `rvalue`, `inner` |
| **MemberPointerDeclarator** | `cls: 'C'`, `quals`, `inner` |
| **ArrayDeclarator** | `inner`, `size?: Expr`, `quals`, `isStatic` (`[static 10]`), `star` (`[*]`) |
| **FunctionDeclarator** | `inner`, `params: ParamDecl[]`, `variadic`, `voidParams` (`(void)`), `noPrototype` (C `()`), `krIdentifiers`, `quals` (member `const`), `refQual: '&'\|'&&'\|null`, `noexcept`, `noexceptExpr?`, `throwSpec?`, `trailingReturn?: TypeName`, `attributes`, `requires?`, `ctype` *(sema)* |
| **BindingDeclarator** | `names: [{ name, loc }]` |

**TypeName** `{ specs: DeclSpec, declarator, ctype (sema) }` — casts,
`sizeof(T)`, template arguments, `new` types, trailing return types.

### 5.3 C++ declarations

| node | fields |
| --- | --- |
| **NamespaceDecl** | `name?: 'a::b'`, `inline`, `anonymous`, `decls`, `attributes`, `scope` *(sema)* |
| **NamespaceAlias** | `name`, `target` |
| **UsingDirective** | `name` (`using namespace std;`) |
| **UsingDecl** | `name`, `qname`, `names: string[]`, `typename`, `isEnum` |
| **AliasDecl** | `name`, `nameLoc`, `typeName`, `attributes`, `ctype`, `symbol` (`using T = ...;`) |
| **TemplateDecl** | `params: TemplateParam[]`, `decl`, `requires?`, `isSpecialization` (`template<>`), `instantiation` (explicit instantiation; `params` empty) |
| **TemplateParam** | `kind: 'type'\|'nontype'\|'template'`, `keyword?`, `name?`, `pack`, `default?` (type/template kinds), `param?: ParamDecl` (nontype; its default is `param.default`), `params?` (template template), `constraint?` (`Concept T`), `symbol` |
| **ConceptDecl** | `name`, `expr` |
| **LinkageSpec** | `language: 'C'\|'C++'\|'export'`, `decls`, `braced` |
| **StaticAssert** | `cond`, `message?`, `keyword`, `value: true\|false\|null` *(sema)* (statement or declaration) |
| **AsmDecl** | `text` |
| **ModuleDecl** | `text` (C++20 `module`/`import`, kept as text) |
| **MacroCallDecl** | `name`, `args: string\|null` — an unknown function-like or object-like macro used where a declaration is expected (`DECLARE_TASK(x, 1);`, `Q_OBJECT`); reported as info `unknown-macro-invocation` |
| **EmptyDecl** | stray `;` |
| **ErrorDecl** | tokens skipped by error recovery |

### 5.4 Statements

| node | fields |
| --- | --- |
| **CompoundStmt** | `body: (Stmt\|Declaration)[]`, `scope` *(sema)* |
| **ExprStmt** | `expr` |
| **IfStmt** | `init?: Stmt\|Declaration` (C++17), `cond: Expr\|Declaration` (null for `if consteval`), `then`, `else?`, `constexpr`, `consteval`, `negated` |
| **SwitchStmt** | `init?`, `cond: Expr\|Declaration`, `body` |
| **CaseStmt** | `value: Expr`, `high?: Expr` (GNU `case 1 ... 3`), `body?: Stmt` (the labelled statement, possibly another CaseStmt), `constValue: BigInt\|null`, `constHigh` *(sema)* |
| **DefaultStmt** | `body?` |
| **LabelStmt** | `label`, `body?`, `attributes`, `symbol` |
| **WhileStmt** | `cond: Expr\|Declaration`, `body` |
| **DoStmt** | `body`, `cond` |
| **ForStmt** | `init?: Declaration\|ExprStmt`, `cond?: Expr\|Declaration`, `inc?: Expr`, `body` |
| **RangeForStmt** | `init?`, `decl: Declaration` (one VarDecl or BindingDecl), `range: Expr\|InitList`, `body` |
| **GotoStmt** | `label?`, `labelLoc?`, `target?: Expr` (GNU computed goto), `computed?`, `labelSymbol` *(sema)* |
| **ContinueStmt**, **BreakStmt** | — |
| **ReturnStmt** | `arg?: Expr\|InitList`, `coroutine` (co_return), `functionReturnType` *(sema)* |
| **NullStmt** | `attributes?` (e.g. `[[fallthrough]];`), `gnuLabelDecl?` |
| **TryStmt** | `body: CompoundStmt`, `handlers: CatchClause[]`, `functionTry?` |
| **CatchClause** | `param?: ParamDecl`, `catchAll` (`catch (...)`), `body` |
| **AsmStmt** | `text` |
| **ErrorStmt** | tokens skipped by error recovery |

Declarations, `StaticAssert`, `UsingDirective`, `UsingDecl`, `AliasDecl`,
`NamespaceAlias` can appear as statements. A statement preceded by
`[[attr]]` carries `attributes`.

Labels own the statement that follows them (as in the C grammar):
`case 1: case 2: x++; break;` is
`CaseStmt(1, CaseStmt(2, ExprStmt(x++)))`, `BreakStmt` as the next sibling.
Use `cf.switchClauses(sw)` to get clause groups for MISRA C 16.x rules.

### 5.5 Expressions

Every expression gets `ctype` *(sema)*.

| node | fields |
| --- | --- |
| **Identifier** | `name`, `qualifier`, `qname`, `global`, `templateArgs?`, `isOperator`, `isDestructor`, `predefined?` (`__func__`), `symbol` *(sema; null when unresolved)*, `implicitThis?` (C++ member used without `this->`), `bitField?: width` |
| **IntegerLiteral** | `raw`, `value: BigInt`, `base`, `suffix` (as written, e.g. `'UL'`), `octal`, `udSuffix?`, `invalid` |
| **FloatingLiteral** | `raw`, `value: number`, `suffix`, `base`, `udSuffix?` |
| **CharLiteral** | `raw`, `prefix`, `value: number`, `codes: number[]`, `multi`, `escapes`, `udSuffix?` |
| **StringLiteral** | `raw` (all parts joined by a space), `parts: string[]` (adjacent literals), `prefix`, `value: string` (decoded), `codes`, `length` (code units incl. terminator), `escapes: [{kind,text,offset,part}]`, `rawString`, `udSuffix?` |
| **BoolLiteral** | `value` (`true`/`false` keywords; in C17 `true` from `<stdbool.h>` is an IntegerLiteral with `loc.macro === 'true'`) |
| **NullptrLiteral**, **ThisExpr** | — |
| **ParenExpr** | `expr` (parentheses are kept for MISRA C 12.1) |
| **UnaryExpr** | `op: '++'\|'--'\|'&'\|'*'\|'+'\|'-'\|'~'\|'!'\|'co_await'\|'co_yield'\|'__real__'\|'__imag__'`, `prefix` (false for postfix `++`/`--`), `arg` |
| **BinaryExpr** | `op` (`* / % + - << >> < > <= >= == != & ^ \| && \|\| , <=> .* ->*`), `left`, `right` |
| **AssignExpr** | `op` (`= *= /= %= += -= <<= >>= &= ^= \|=`), `left`, `right` |
| **ConditionalExpr** | `test`, `consequent?` (null for GNU `a ?: b`), `alternate`, `gnuElvis` |
| **CallExpr** | `callee`, `args: (Expr\|InitList\|PackExpansion)[]`, `calleeSymbol` *(sema: the function Symbol, after overload selection by arity)*, `refType` *(sema: declared return type incl. reference)* |
| **MemberExpr** | `object`, `member` (name), `arrow`, `memberLoc`, `isDestructor`, `templateArgs?`, `qualifier`, `memberSymbol` *(sema)*, `bitField?: width` |
| **IndexExpr** | `object`, `index` |
| **CastExpr** | `kind: 'c-style'\|'static_cast'\|'dynamic_cast'\|'reinterpret_cast'\|'const_cast'\|'functional'`, `typeName: TypeName`, `arg?` (the operand; for functional casts with exactly one argument or a brace list), `args?` (functional casts with 0 or ≥2 arguments), `brace` |
| **SizeofExpr** | `typeName?`, `arg?` |
| **SizeofPackExpr** | `name` |
| **AlignofExpr** | `typeName?`, `arg?`, `keyword` |
| **CompoundLiteral** | `typeName`, `init: InitList` |
| **InitList** | `items: (Expr\|InitList\|DesignatedInit\|PackExpansion)[]`, `trailingComma` |
| **DesignatedInit** | `designators: Designator[]`, `value` |
| **Designator** | `kind: 'field'\|'index'`, `name?`, `index?: Expr`, `high?: Expr` (GNU range), `gnuColon?`, `field: Symbol` *(sema)*, `indexValue` *(sema)* |
| **GenericSelection** | `control`, `assocs: GenericAssoc[]`, `selected: index` *(sema)* |
| **GenericAssoc** | `typeName?` (null for `default`), `isDefault`, `expr` |
| **StmtExpr** | `body: CompoundStmt` (GNU `({ ... })`) |
| **LambdaExpr** | `captures: LambdaCapture[]`, `captureDefault: '&'\|'='\|null`, `templateParams?`, `params`, `variadic`, `mutable`, `constexpr`, `consteval`, `static`, `noexcept`, `trailingReturn?`, `body`, `attributes`, `scope` *(sema)* |
| **LambdaCapture** | `kind: 'name'\|'init'\|'this'`, `name`, `byRef`, `init?`, `pack?`, `symbol` *(sema)* |
| **NewExpr** | `global`, `placement?: Expr[]`, `typeName`, `init?: ParenListInit\|InitList`, `initStyle`, `isArray`, `parenType` |
| **DeleteExpr** | `global`, `array`, `arg` |
| **ThrowExpr** | `arg?` |
| **TypeidExpr** | `typeName?`, `arg?` |
| **NoexceptExpr** | `arg` |
| **VaArgExpr** | `arg`, `typeName` (`va_arg` expands to `__builtin_va_arg`) |
| **OffsetofExpr** | `typeName`, `member: 'a.b[]'`, `designators`, `offset: number\|null` *(sema)* |
| **PackExpansion** | `expr` (`args...`) |
| **FoldExpr** | `op`, `left?`, `right?`, `direction: 'left'\|'right'\|'binary'` |
| **RequiresExpr** | `text` |
| **AddrLabelExpr** | `label` (GNU `&&label`) |

---

## 6. Types (`cf.types`)

Types are plain objects. Qualifiers are boolean fields on the type object
(`const`, `volatile`, `restrict`, `atomic`). Do not mutate types; build new
ones with the helpers.

| kind | fields |
| --- | --- |
| `'void'` | `name: 'void'` |
| `'int'` | `name`: `'bool' 'char' 'signed char' 'unsigned char' 'short' 'unsigned short' 'int' 'unsigned int' 'long' 'unsigned long' 'long long' 'unsigned long long' '__int128' 'unsigned __int128' 'wchar_t' 'char8_t' 'char16_t' 'char32_t'`; `_BitInt(N)` has `bitInt, bits, signedBitInt` |
| `'float'` | `name: 'float'\|'double'\|'long double'\|'_Decimal32'...`, `complex?` |
| `'pointer'` | `to` |
| `'reference'` | `to`, `rvalue` |
| `'array'` | `of`, `size: number\|null`, `vla?`, `sizeExpr?` |
| `'function'` | `ret`, `params: Type[]`, `variadic`, `prototype` (false for C `()` and K&R), `quals?: ['const']` (member functions), `refQual?`, `noexcept?` |
| `'record'` | `tag: 'struct'\|'union'\|'class'`, `name`, `decl: RecordDecl`, `fields: [{ name, type, bitWidth, symbol, node, anonymous?, unnamed? }]`, `complete`, `scope` (class Scope), `bases: Type[]`, `template?`, `typedefName?` (anonymous struct named by a typedef), `id` |
| `'enum'` | `name`, `decl`, `underlying: Type`, `constants: [{ name, value: BigInt, symbol }]`, `scoped`, `fixed` (explicit underlying type), `scope`, `typedefName?` |
| `'typedef'` | `name`, `target: Type`, `decl` — kept so rules can see `uint8_t` vs `unsigned char` |
| `'memberPointer'` | `cls`, `to` |
| `'nullptr'` | `std::nullptr_t` |
| `'auto'` | placeholder not deduced |
| `'dependent'` | `name` — depends on a template parameter |
| `'unknown'` | `name` — unresolved type name (missing header, `std::` class) |
| `'closure'` | `node: LambdaExpr`, `ret`, `params` |
| `'initList'` | type of a bare braced list |

Shared primitive objects: `types.T.void, bool, char, schar, uchar, short, ushort, int, uint, long, ulong, llong, ullong, wchar, char8, char16, char32, float, double, ldouble, nullptr, unknown`.

### Functions

```js
// construction
types.intType(name), types.floatType(name), types.builtinFromNames(['unsigned','char'])
types.pointerTo(t, quals?), types.referenceTo(t, rvalue), types.arrayOf(t, size), types.functionType(ret, params, variadic)
types.typedefType(name, target), types.unknownType(name)
types.withQuals(t, { const: true }), types.qualsOf(t), types.unqualified(t)
// inspection
types.canonical(t)        // strip typedefs (qualifiers along the chain are kept)
types.nonRef(t)           // canonical, then strip a reference
types.isVoid, isBool, isEnum, isInteger (incl. enum and bool), isFloating, isArithmetic, isPointer, isArray,
types.isFunction, isRecord, isScalar, isUnknown (unknown/dependent/auto), isCharType, isPlainChar, isComplete
types.isSigned(t, target), isUnsigned(t, target)  // plain char per target.charSigned
types.intRank(t)          // bool 0, char 1, short 2, int 3, long 4, long long 5, __int128 6
types.intBits(t, target), intRange(t, target) -> { min: BigInt, max: BigInt, bits }
types.fitsIn(value: BigInt, t, target), wrapTo(value, t, target)
types.sizeOf(t, target) -> bytes | null (incomplete, VLA, function), alignOf(t, target)
types.layout(recordType, target) -> { size, align, fields: [{ name, offset, size, bitOffset?, bitWidth? }] }
types.sizeTType(target), ptrdiffTType(target)
// conversions
types.integerPromote(t, target, bitFieldWidth?)
types.usualArithmetic(a, b, target)
types.decay(t)            // array -> pointer, function -> pointer to function, reference stripped
types.pointee(t)          // element / pointee type after decay, or null
types.integerLiteralType(value, suffix, base, target)
// printing / comparison
types.typeToString(t, name?)   // C declarator syntax: 'int (*)[4]', 'char *(*(*)(void))[8]', 'size_t'
types.sameType(a, b, { ignoreQuals })   // compatible types (typedefs transparent)
```

### Targets

`types.TARGETS.lp64 | ilp32 | llp64`; `types.resolveTarget(t)` merges an
object over a named base:

```js
{ name, char: 1, short: 2, int: 4, long: 8, longlong: 8, pointer: 8, float: 4, double: 8,
  longdouble: 16, wchar: 4, wcharSigned: true, charSigned: true, bool: 1, int128: 16, maxAlign: 16 }
// e.g. parseUnit(text, { target: { name: 'ilp32', charSigned: false } })
```

Record layout follows the usual ABI rules (natural alignment, bit-fields
packed into units of their declared type, zero-width bit-field ends a unit, no
`#pragma pack`).

---

## 7. Symbols and scopes

### Symbol

```js
Symbol = {
  id, name, qname /* 'ns::Class::f' */, kind:
    'variable' | 'function' | 'parameter' | 'field' | 'typedef' | 'tag' | 'enumerator'
  | 'label' | 'namespace' | 'templateParam',
  type,                         // declared Type (for 'typedef' the aliased type; for 'tag' the record/enum type)
  linkage: 'external' | 'internal' | 'none',
  storage: 'static' | 'thread' | 'automatic' | 'none',   // storage duration ('none' for functions, types, constants)
  scope: Scope, file /* declaring file */, system /* declared in a built-in header */,
  decls: Node[],                // every declaration (VarDecl, FunctionDecl, ParamDecl, RecordDecl ...)
  definition: Node | null,      // initialised / bodied declaration; for C tentative-only objects, the first tentative one
  tentative: VarDecl[],         // C tentative definitions (file scope, no initializer, not extern)
  tentativeDefinition?: true,   // definition came from a tentative definition
  uses: Node[],                 // Identifier / MemberExpr / NamedType / GotoStmt referring to it
  isStatic, isExtern, isInline, isConstexpr, externC,
  // kind specific
  value: BigInt,                // enumerator
  enumType,                     // enumerator: its enum Type
  bitWidth,                     // field
  member, record, access,       // class members
  isVirtual, pure, deleted, noreturn, implicit /* C implicit function declaration */,
  overloads: Symbol[], overloadOf, // C++ overload set (first declared symbol owns the list)
  constInit: Expr,              // const integer/float variable initializer (usable for folding in C++)
  template, templateParam, mutable, binding, predefined,
}
```

Linkage rules implemented: C 6.2.2 (file-scope `static` internal; `extern`
takes the prior visible linkage; block-scope `extern` refers to the
file-level entity; functions default to external) and C++ additions
(namespace-scope `const`/`constexpr` non-`inline` variables and everything in
an anonymous namespace are internal). Diagnostics are raised for
redefinitions, conflicting types, static-after-extern and redeclarations
(§13).

Lookups: `unit.lookup(name, scope?)`, `unit.lookupQualified('ns::x', scope?)`.
Identifiers get `node.symbol`; member accesses get `memberSymbol`; calls get
`calleeSymbol`. `unit.unresolved` lists Identifier nodes with no symbol (in C a
call to an undeclared function creates an `implicit` function symbol and an
`implicit-function-declaration` warning instead).

### Scope

```js
Scope = { kind: 'file'|'namespace'|'class'|'function'|'block'|'prototype'|'template'|'enum',
          parent, node, name, names: Map<name, Symbol>, tags: Map<name, Symbol> /* C struct/union/enum tags */,
          labels: Map /* function scopes */, usings: Scope[], children: Map<name, Scope>, record /* class scopes */ }
```

`FunctionDecl.scope`, `CompoundStmt.scope`, `NamespaceDecl.scope`,
`LambdaExpr.scope` and `recordType.scope` are available after analysis.
`scope.qualifiedName()` returns `'a::b'`. In C, tags (`struct S`) are in
`tags`; in C++ class and enum names are also entered in `names`.

---

## 8. Constant folding

```js
types.constValue(expr, { target, allowFloat?, allowConstVars? }) ->
  null | { value: BigInt, type, overflow?, wrapped?, divByZero?, shiftOutOfRange?, invalid? }
       | { value: number, type, float: true }        // with allowFloat
```

Folds integer constant expressions over the analysed AST: integer/char/bool
literals, enumerators, `sizeof`/`_Alignof`/`offsetof` of complete types,
casts (with wrap-around to the target type), unary/binary/conditional
operators with the C conversions. Signed overflow sets `overflow` (the value
is wrapped two's complement); unsigned wrap-around sets `wrapped`; division by
zero and out-of-range shifts return `invalid` results with value 0.
`allowConstVars` (used automatically in C++ for array bounds and case labels)
lets `const`/`constexpr` integer variables fold. `CaseStmt.constValue`,
`EnumConstant.constValue`, array sizes and bit-field widths are precomputed.

---

## 9. Essential type model (MISRA C:2012/2023)

```js
cf.essentialType(expr, { target?, booleanTypedefs? }) -> {
  category: 'boolean'|'character'|'signed'|'unsigned'|'enum'|'floating'|'other',
  type,        // the essential type as a types.js Type (canonical, e.g. unsigned char)
  name,        // printable ('unsigned char', 'enum <anonymous>')
  size,        // bytes on the target
  typedefName, // declared typedef when the operand's type is one (e.g. 'uint8_t')
  enumName,    // 'enum' category: the enum tag or its typedef name
  complex,     // essentially complex floating
  bitField,    // width, for bit-field operands
  ice, value,  // integer constant expression and its BigInt value
}
cf.essentialTypeOfType(type, opts)   // category of a declared type
cf.essential.stlr(value, target)    // signed type of lowest rank holding value
cf.essential.utlr(value, target)    // unsigned type of lowest rank holding value
```

Rules (first match wins):

| expression | essential type |
| --- | --- |
| object / function result / member / array element | from the declared type: `_Bool`/`bool` or a Boolean typedef → boolean; plain `char` → character; `signed char` and signed integers → signed; unsigned integers (incl. `unsigned char`) → unsigned; enum type → enum; floating → floating; otherwise other |
| bit-field | Boolean / enum bit-fields as declared; signed / unsigned bit-fields: the signed / unsigned type of lowest rank able to hold the field's width |
| integer constant | non-`u` constant → signed, STLR of its value; `u` constant (or hex/octal that is unsigned) → unsigned, UTLR |
| `true` / `false` (keywords, or the `<stdbool.h>` macros) | boolean |
| character constant `'a'` | character (prefixed `L'a'` etc.: from its type) |
| enumeration constant | enum of its (named or typedef-named) enum; anonymous enum: signed, STLR |
| `(T)x`, `static_cast<T>(x)` | from `T` |
| `!x`, relational, equality, `&&`, `\|\|` | boolean |
| `,` | right operand |
| `x = y`, compound assignment | left operand |
| `++x`, `x--` | operand |
| `+x`, `-x` on signed (or `+x` on unsigned) | ICE → STLR/UTLR of the result; else the operand's |
| `~x` on unsigned | ICE → UTLR of the result (in the operand's essential type); else the operand's |
| `x << n`, `x >> n` with unsigned `x` | both ICE → UTLR of the result; else the left operand's |
| `&`, `\|`, `^` both unsigned | ICE → UTLR of the result; else the larger of the two |
| `+` with one character and one signed/unsigned operand; `-` with character left and signed/unsigned right | character |
| `+ - * / %` both signed or both unsigned | ICE (without overflow) → STLR/UTLR of the result; else the larger |
| `+ - * /` both floating | the larger |
| `c ? a : b` | same essential type → that; both signed or both unsigned (or same category) → the larger; else standard |
| `sizeof`, `_Alignof`, `offsetof` | ICE → UTLR of the value; else unsigned `size_t` |
| anything else | category of the standard C type (`expr.ctype`) |

"Larger" compares size, then rank. Pass `booleanTypedefs` to change which
typedef names count as Boolean.

---

## 10. Value categories (C++)

`types.valueCategory(expr, { lang }) -> 'lvalue' | 'xvalue' | 'prvalue'`:
named objects/functions and string literals are lvalues; `*p`, `a[i]`,
`p->m`, prefix `++`/`--` and assignments are lvalues (C++); `o.m` follows
`o`; calls and casts to `T&` are lvalues, to `T&&` xvalues (as are
`std::move`/`std::forward` calls); everything else is a prvalue. In C (`lang:
'c'`) assignments, prefix increments and conditionals are prvalues.

---

## 11. Cross-unit symbols and the call graph

### `project.globalSymbols: Map<qname, GlobalSymbol>`

Only external-linkage functions and variables.

```js
GlobalSymbol = {
  name, qname, kind, units: Set<file>,
  decls: [{ key, unit, node, file, line, col, isDefinition, type, typeString }],  // deduplicated by location
  definitions: (same entries with isDefinition),
  defined,                 // at least one definition in the project
  multipleDefinitions,     // definitions at more than one location (inline excluded)
  typeMismatch,            // declarations with incompatible types (MISRA C 8.3/8.4, CERT DCL40-C)
  kindMismatch?, types: string[], system /* only declared in built-in headers */,
  symbols: [{ unit, symbol }],
}
```

### `project.callGraph`

```js
callGraph.nodes: Map<key, {
  key, name, qname, linkage, defined, noreturn, unit,
  definitions: [{ unit, node: FunctionDecl }],
  callees: Set<key>, callers: Set<key>,
  calls: [{ from, to /* key or null */, node: CallExpr, unit, line, indirect, calleeText? }],
}>
callGraph.edges                    // every call record
callGraph.callees(key), callGraph.callers(key)
callGraph.reachableFrom(key) -> Set<key>
callGraph.recursion() -> key[][]   // SCCs with recursion (MISRA C 17.2)
callGraph.sccs() -> key[][]        // all SCCs, bottom-up (callees before callers) — summary order
```

Keys are the function's `qname` for external linkage and `'file#qname'` for
internal (`static`) functions, so same-named static functions in different
files stay separate. Indirect calls (through pointers, members of unknown
type, unresolved names) are recorded with `to: null, indirect: true`.

---

## 12. CFG and dataflow

```js
const g = cf.buildCFG(functionDecl, { constantConditions: 'prune' | 'keep', splitConditions: true, noreturn: ['my_panic'], target });
const g2 = cf.getCFG(functionDecl);        // cached, default options
const all = cf.buildAllCFGs(unit.ast, { lambdas: true });   // Map<FunctionDecl|LambdaExpr, CFG>
```

### Blocks and elements

```js
Block = {
  id, kind: 'entry' | 'exit' | 'normal' | 'handler',
  elements: Node[],     // in evaluation order: ExprStmt, VarDecl / BindingDecl (one per declarator),
                        // ReturnStmt, BreakStmt, ContinueStmt, GotoStmt, NullStmt, AsmStmt, the for-increment
                        // Expr, the range expression of a range-for, a CatchClause's ParamDecl ...
  terminator: null | { kind: 'branch', cond, node, constant /* true|false|null */ }
                   | { kind: 'switch', cond, node } | { kind: 'range', node }
                   | { kind: 'return' | 'goto' | 'throw', node },
  succs: Edge[], preds: Edge[],
  label?, labelNode?, caseNode?, catchNode?, loopNode?, loopHeader?,
}
Edge = { from, to, kind, cond?, node?, value?, constValue?, high?, implicit?, back?, computed?, unresolved? }
```

Edge kinds: `normal`, `true`, `false` (with `cond`), `case` (with `node:
CaseStmt`, `value`, `constValue`, `high`), `default` (`implicit: true` when the
switch has no default), `fallthrough` (into a case label), `break`,
`continue`, `back` (loop latch to header), `goto`, `return`, `throw`,
`exception` (from a block in a try body that may throw — contains a call,
`new` or `throw` — to each handler), `noreturn` (after a call to a noreturn
function, to exit).

Construction details:

* `&&`, `||`, `!` and `,` in branch conditions are split into separate
  branch blocks (`splitConditions: false` keeps whole conditions); `?:`
  inside expressions is not split.
* Integer-constant conditions are pruned by default (`while (1)` has no
  false edge, `if (0)` has no true edge), so code they make unreachable shows
  up in `g.unreachable()` (MISRA C 2.1). `constantConditions: 'keep'` keeps both
  edges.
* Statements after `return`, `break`, `continue`, `goto`, `throw` or a
  noreturn call start a block with no predecessors. Statements in a switch
  body before the first label are unreachable.
* Calls are noreturn when the callee symbol is noreturn (`_Noreturn`,
  `[[noreturn]]`, `__attribute__((noreturn))`, built-in headers) or its name is
  one of `exit abort _Exit quick_exit longjmp siglongjmp __assert_fail
  __builtin_unreachable __builtin_trap pthread_exit thrd_exit _exit
  std::exit std::abort std::terminate ...` (`cf.symbols.NORETURN_NAMES`), or
  listed in `opts.noreturn`.
* GNU statement expressions and lambdas are single elements (lambdas get
  their own CFG via `buildCFG(lambdaExpr)`).

### Queries

```js
g.entry, g.exit, g.blocks, g.edges
g.blockOf(node)            // block holding an element / condition / case / label node
g.reachable() -> Set<Block>;  g.isReachable(nodeOrBlock)
g.unreachable() -> [{ block, nodes }]
g.rpo()                    // reverse post-order of reachable blocks
g.dominators() -> Map<Block, idom>;  g.dominates(a, b)
g.postDominators() -> Map<Block, ipdom>;  g.postDominates(a, b)
g.loops() -> [{ header, latches, blocks: Set<Block>, backEdges, exits: Edge[] }]   // natural loops
cf.cfg.blockItems(block)   // elements followed by the branch/switch condition
```

### Dataflow solver

```js
const res = cf.solve(g, {
  direction: 'forward',                 // or 'backward'
  boundary: V,                          // value at entry (forward) / exit (backward)
  init: V | (block) => V,               // initial value elsewhere (bottom)
  transferElement(node, value, block) { return V; },   // applied to blockItems(block) in order
  // or transfer(block, valueIn) { return valueOut; }
  join(a, b) { return V; },
  equal(a, b) { return bool; },
  edge(edge, value) { return V | null; },   // optional: refine along an edge (null = infeasible)
  widen(prev, next, block, visits) { return V; },  // optional: at loop headers after `widenAfter` visits
  widenAfter: 2, maxIterations: 100000,
});
res.in.get(block), res.out.get(block)   // forward: before / after the block
res.iterations, res.converged
```

The worklist runs in reverse post-order (priority queue); unreachable blocks
are never processed and keep `init`. For backward problems `res.in` is the
value *before* the block (at its start) and `res.out` after it, as for forward
problems.

`edge` is where an abstract interpreter refines on conditions:

```js
edge(e, env) {
  if (e.kind === 'true' || e.kind === 'false') return assume(env, e.cond, e.kind === 'true');
  if (e.kind === 'case') return assumeEqual(env, e.from.terminator.cond, e.constValue);
  return env;
}
```

Reference analyses built on `solve`: `cf.reachingDefinitions(g)` (value:
`Map<Symbol, Set<defining node>>`) and `cf.liveVariables(g)` (value:
`Set<Symbol>`).

---

## 13. Diagnostics

```js
Diagnostic = { severity: 'error' | 'warning' | 'info', code, message /* English */, file, line, col }
```

| code | layer | meaning |
| --- | --- | --- |
| `lex-unterminated-comment`, `lex-unterminated-literal`, `lex-stray-character`, `lex-splice-whitespace`, `lex-escape` | lexer | literal / comment problems (literal and stray-character errors only in active code) |
| `pp-include-not-found` | pp | header not found (info for `<>`, warning for `""`) |
| `pp-include-invalid`, `pp-include-depth`, `pp-include-recursion` | pp | bad `#include` |
| `pp-unknown-directive` | pp | `#foo` in active code (MISRA C 20.13) |
| `pp-if-syntax`, `pp-if-no-expression`, `pp-if-div-zero`, `pp-defined-no-name`, `pp-defined-no-paren`, `pp-defined-from-macro`, `pp-has-syntax`, `pp-ifdef-no-macro` | pp | `#if` evaluation |
| `pp-unmatched-conditional`, `pp-unterminated-conditional`, `pp-conditional-across-files`, `pp-elif-after-else`, `pp-else-after-else` | pp | conditional structure (MISRA C 20.14) |
| `pp-define-no-name`, `pp-define-invalid-name`, `pp-define-defined`, `pp-define-bad-params`, `pp-duplicate-param`, `pp-define-missing-space`, `pp-stringify-non-param`, `pp-paste-at-edge`, `pp-va-opt-non-variadic`, `pp-va-args-misuse`, `pp-va-args-param`, `pp-macro-redefined`, `pp-undef-no-name` | pp | `#define` / `#undef` |
| `pp-macro-arg-count`, `pp-unterminated-macro-call`, `pp-invalid-paste`, `pp-directive-in-macro-args` (MISRA C 20.6), `pp-expansion-limit` | pp | expansion |
| `pp-extra-tokens`, `pp-line-invalid`, `pp-pragma-operator`, `pp-extension-directive`, `pp-error`, `pp-warning` | pp | other directives |
| `parse-error` | parser | syntax error (recovered) |
| `unknown-macro-invocation` | parser | info: unknown macro used as a declaration |
| `redefinition`, `redeclaration`, `conflicting-types`, `linkage-conflict`, `typedef-redefinition`, `duplicate-label`, `undeclared-label`, `no-member`, `static-assert-failed`, `array-size-negative` | sema | semantic errors |
| `implicit-function-declaration`, `integer-literal-too-large`, `enum-value-not-constant` | sema | warnings |
| `pp-internal`, `parse-internal`, `sema-internal`, `sema-too-deep` | any | internal failure contained |

Diagnostics are not findings: rule modules decide what to report.

---

## 14. Recipes

Find octal constants (MISRA C 7.1):

```js
for (const lit of cf.findAll(unit.ast, 'IntegerLiteral')) if (lit.octal && lit.loc.file === unit.file) report(lit);
```

Composite expression assigned to a wider essential type (MISRA C 10.6):

```js
for (const a of cf.findAll(unit.ast, 'AssignExpr')) {
  const L = cf.essentialType(a.left), R = cf.essentialType(a.right);
  if (isComposite(a.right) && R.size < L.size && R.category === L.category) report(a);
}
```

Macros that are `#undef`-ed (MISRA C 20.5) and `#` / `##` usage (20.10):

```js
unit.directives.filter((d) => d.kind === 'undef' && d.active);
unit.macros.filter((m) => m.usesStringify || m.usesPaste);
```

Functions defined with external linkage but used in one unit only (MISRA C 8.7):

```js
for (const g of project.globalSymbols.values())
  if (g.kind === 'function' && g.defined) {
    const users = new Set(g.symbols.filter((s) => s.symbol.uses.length).map((s) => s.unit));
    if (users.size <= 1) report(g.definitions[0]);
  }
```

Unreachable code (MISRA C 2.1) and a forward analysis skeleton:

```js
for (const fn of cf.functionsOf(unit, unit.file)) {
  const g = cf.getCFG(fn);
  for (const { nodes } of g.unreachable()) report(nodes[0]);
  const res = cf.solve(g, { boundary: initialState(fn), init: null, transferElement, join, equal, edge, widen });
}
```

Switch clauses without `break` (MISRA C 16.3):

```js
for (const sw of cf.findAll(unit.ast, 'SwitchStmt'))
  for (const c of cf.switchClauses(sw).clauses) {
    const last = c.body[c.body.length - 1];
    if (!last || !['BreakStmt', 'ReturnStmt', 'ContinueStmt', 'GotoStmt'].includes(last.type)) report(c.node);
  }
```

---

## 15. Known limitations

* No template instantiation or overload resolution beyond arity: expressions
  in templates often have `dependent`/`unknown` types; members of class
  templates used through a specialisation are not resolved.
* C++ standard library headers are not emulated; `std::` classes parse as
  types but have `unknown` type, and their members do not resolve.
* Name lookup does not implement argument-dependent lookup, `using`
  declarations that bring overload sets of base classes, or friend injection.
* Type/expression ambiguity is resolved with the declared names plus
  heuristics for undeclared identifiers (`foo_t x;`, `foo_t *p = 0;` and
  `(foo_t)x` are declarations/casts; `a * b;` with unknown `a` is a
  declaration). C++ "most vexing parse" follows the standard when the names
  are known.
* `#line` is recorded but does not change locations; `#include_next` behaves
  like `#include`; `#embed` is not supported.
* Raw string literals that contain a backslash-newline are lexed after line
  splicing (the splice is removed).
* Macro-expanded tokens all carry the outermost expansion site location;
  tokens from macro arguments keep their real position only in `spelling`.
* `__has_attribute`, `__has_builtin`, `__has_feature` evaluate to 0.
* `?:`, `&&` and `||` inside non-condition expressions are not split in the
  CFG; exceptions are modelled with edges from blocks that contain calls.
* Bit-field layout follows the common System V rules only; `#pragma pack` and
  `__attribute__((packed))` are ignored by `layout`.
