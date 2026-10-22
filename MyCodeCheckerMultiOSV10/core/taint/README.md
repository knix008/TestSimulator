# Taint engine (`core/taint`)

Security taint analysis for MyCodeChecker, modelled on SonarQube's security
engine (source → sink injection tracking across functions and files) and the
Sparrow / Coverity security checkers. It follows `core/ENGINE_CONTRACT.md`
and is loaded by `core/engines.js`. CommonJS, Node built-ins only.

Languages: JavaScript, TypeScript, Python, Java, Kotlin, C#, PHP, Go, Ruby.
C/C++ are handled by another front end.

## Files

| File | Role |
| --- | --- |
| `index.js` | Contract entry: `catalog()`, `analyze(files, ctx)`, `defaultModels()` |
| `lexer.js` | One tolerant scanner configured per language family (comments, strings, template literals, f-strings, PHP/Kotlin/Ruby/C# interpolation, heredocs, regex literals, Ruby `%x()` and backticks) |
| `parser.js` | Structural parser for brace languages: functions, methods, lambdas, classes, imports, assignments (destructuring, typed declarations), calls with positional/named args, `new`, member chains, conditions, loops, returns |
| `parser-script.js` | Python (indentation) and Ruby (`end`) statement walkers on the same IR |
| `models.js` | Default sources, parameter sources, sinks, sanitizers, guards, propagators (JSON-able) |
| `resolve.js` | Model compilation, project index, module/import resolution, call resolution |
| `engine.js` | Taint propagation, function summaries, fixpoint, findings and event paths |
| `rules.js` | Rule catalog (`taint:*`), CWE / OWASP 2021 / CWE Top 25 mapping, Korean + English text |

## Design

1. **Parse.** Each file becomes an IR of functions (the top level is a
   `<module>` function). Statements are `assign`, `expr`, `return`, `guard`
   (if/while/switch conditions), `foreach` and `echo` (PHP `echo`/`include`).
   Expressions are `name`, `member`, `index`, `call` (with `isNew`), `str`
   (with interpolated parts), `op`, `arr`, `obj`, `fn` (nested function) and
   `cast`. Function literals passed as arguments become their own functions
   with a `parent`, so closures see the parent's variables. The parser never
   throws; anything it cannot read is skipped.
2. **Propagate (ordered, flow-insensitive per branch).** Statements run in
   source order. A plain assignment replaces the variable's taint; inside a
   branch or loop it is unioned instead. Taint goes through string
   concatenation, templates, f-strings, `%`/`format`/`Sprintf`, collection
   literals, unknown library calls (arguments and receiver to result),
   propagators such as `StringBuilder.append`, `list.push`, `json.Unmarshal`,
   iteration callbacks (`forEach`, `map`, `each do |x|`), object fields
   (`this.x`, `self.x`, `@x`) and destructuring (`const { id } = req.query`).
3. **Sanitize.** Sanitizer calls clear taint for the vulnerability classes
   they cover (`all` for numeric conversions). A partial sanitizer stays on
   the path as a `sanitizer` event; if the value later reaches a sink of
   another class the event says "not a … sanitizer" (sanitizer bypass).
   Guards in conditions (`startsWith` after normalization, allowlist
   `includes`/`in`/`contains`, anchored regex tests, `isdigit`, `IsLocalUrl`,
   `__proto__` checks, …) sanitize the checked variable for the following
   statements. Typed numeric declarations and casts (`int n = …`, `(int)$x`)
   and numeric parameters (`@RequestParam int n`) carry no taint.
4. **Summarize and iterate.** Every function is analysed with symbolic
   parameter origins. Its summary records parameter → return (with the
   sanitizer set), sources returned from inside, parameter → sink (with the
   inner path) and parameter → field writes. Calls resolved to project
   functions use the summaries; all functions of all files are re-analysed
   until summaries, callback seeds and fields stop changing (at most 12
   rounds).
5. **Resolve.** Same-class methods, same-file functions, JS `require`/ES
   `import` (named, default, namespace, path aliases), Python `import` /
   `from … import` (relative and absolute, module objects), Go import paths
   (package directory), PHP `require`/Ruby `require_relative` and global
   names, Java/Kotlin/C# class names, typed locals and fields
   (`private final Dao dao = new Dao()`, `this.repo = repo`) and inherited
   methods. A precisely resolved project function wins over a library sink
   model with the same name.
6. **Report.** A finding is reported at the sink (file, line, column) with
   events: `source`, each `assign`/`call`/`return`/`propagate`/`sanitizer`
   step (each with its own `file`, so cross-file paths are complete) and the
   final `sink` event with `main: true`. One finding per rule and sink line;
   the shortest path wins.

## API

```js
const taint = require('./core/taint');
taint.catalog();                 // RuleMeta[] (18 rules)
taint.analyze(files, ctx);       // Finding[]
taint.defaultModels();           // plain JSON model entries
```

`ctx.options`:

| Option | Meaning |
| --- | --- |
| `taintModels` | Extra model entries: an array, `{ models: [...] }` or `{ js: [...], py: [...] }` |
| `taintDefaults: false` | Start from an empty model set (only `taintModels`) |
| `taintLowTrust: true` | Also report lower-trust sources: argv, environment, stdin, file content |
| `taintMaxBytes` | Skip larger files (default 1.5 MB) |

Inactive rule keys in `ctx.inactive` are not reported.

## Model format

Each entry is a JSON object with `kind` and `lang` (`js` also covers `ts`;
`java` also covers `kt`; `*` is every language). Regex fields are strings
(or `{ "re": "...", "flags": "i" }`). Chain text writes member chains with
dots, calls with `()` and indexing with `[]`: `req.query.id`,
`request.getParameter()`, `$_GET[]`, `params[]`, `r.URL.Query().Get()`.

```json
[
  { "kind": "source", "lang": "js", "label": "ticket system", "chain": "^readTicket\\(\\)$" },
  { "kind": "source", "lang": "go", "label": "HTTP request", "root": "^(r|req)$", "rootType": "http\\.Request", "path": "^\\.FormValue\\(\\)" },
  { "kind": "param", "lang": "java", "label": "request parameter", "ann": "@\\s*RequestParam\\b", "notType": "^(int|long)$" },
  { "kind": "sink", "lang": "py", "vuln": "sqli", "method": "^execute$", "recv": "cursor$", "args": [0] },
  { "kind": "sink", "lang": "cs", "vuln": "sqli", "assign": "\\.CommandText$" },
  { "kind": "sanitizer", "lang": "js", "vulns": ["xss"], "call": "^escapeHtml$" },
  { "kind": "guard", "lang": "py", "vulns": ["path"], "method": "^startswith$", "check": "recv" },
  { "kind": "propagator", "lang": "java", "method": "^append$", "from": "all", "to": "recv" }
]
```

| Kind | Fields |
| --- | --- |
| `source` | `label`, `trust` (`high`/`low`); `chain`, or `root` + `path` (+ `rootType` checked against declared parameter/local types); `call` + `intoArg` for APIs that fill an argument (gin `ShouldBind(&x)`); `argHas`, `fnName`; `notFor` (classes it never reports), `remap` (`{ "code": "xss" }`) |
| `param` | parameters that are sources: `ann` (parameter annotation/attribute), `fnAnn` (function decorator/annotation), `clsBase` (class bases), `fnName`, `fnPublic`, `type`, `notType`, `notName`, `notDef`, `notAnnAny` |
| `sink` | `vuln`; `call` (full callee chain) or `method` + `recv`; `notRecv`, `newOnly`, `needsImport`; `args`: index list, `"all"`, `"last"`, `"rest1"`, `"recv"`; `kw` (named / keyword args); `argHas`/`argLacks` (on the call text), `orFile`, `fileHas`/`fileLacks`, `arg0Name`, `notObject`, `firstElement`, `objKeyOrWhole`, `recvType`; special forms: `assign` (lhs chain), `objKey` (object literal key), `echoKw`, `routeReturn` (+`fnAnn`, `retPrefix`), `shell`, `regexLiteral`, `dynamicCall`, `protoAssign` |
| `sanitizer` | `vulns` (list or `"all"`), `call` or `method` + `recv`, `argHas` |
| `guard` | `vulns`, `call` or `method` + `recv`, `check` (`"recv"`, arg index, `"all"`), `argHas`; `text` (regex over the condition), `inOp` + `rhs` (Python `x in ALLOWED`), `indexAllow` (Go `allowed[x]`) |
| `propagator` | `call` or `method` + `recv`, `notRecv`, `from` (`"all"`, `"recv"`, `"rest1"`, index), `to` (`"recv"`, index, `"last"`, `"rest2"`) |

Vulnerability ids: `sqli nosqli cmdi code path xss ssrf redirect ldap xpath
xxe deser log header regex ssti reflection proto`.

## Rules

| Key | CWE | OWASP 2021 | Top 25 | Severity |
| --- | --- | --- | --- | --- |
| `taint:sqli` | CWE-89 | A03 | yes | BLOCKER |
| `taint:nosqli` | CWE-943 | A03 | | CRITICAL |
| `taint:cmdi` | CWE-78 | A03 | yes | BLOCKER |
| `taint:code` | CWE-94 | A03 | yes | BLOCKER |
| `taint:path` | CWE-22 | A01 | yes | CRITICAL |
| `taint:xss` | CWE-79 | A03 | yes | CRITICAL |
| `taint:ssrf` | CWE-918 | A10 | yes | CRITICAL |
| `taint:redirect` | CWE-601 | A01 | | CRITICAL |
| `taint:ldap` | CWE-90 | A03 | | CRITICAL |
| `taint:xpath` | CWE-643 | A03 | | CRITICAL |
| `taint:xxe` | CWE-611 | A05 | | CRITICAL |
| `taint:deser` | CWE-502 | A08 | yes | CRITICAL |
| `taint:log` | CWE-117 | A09 | | MINOR |
| `taint:header` | CWE-113 | A03 | | MAJOR |
| `taint:regex` | CWE-1333 | A03 | | MAJOR |
| `taint:ssti` | CWE-1336 | A03 | | CRITICAL |
| `taint:reflection` | CWE-470 | A03 | | CRITICAL |
| `taint:proto` | CWE-1321 | A08 | | CRITICAL |

## Coverage

Every ✓ has a vulnerable and a sanitized/parameterized test in
`test/taint.test.mjs`. `–` means no sink model for that language.

| Rule | JS | TS | Py | Java | Kotlin | C# | PHP | Go | Ruby |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sqli | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| nosqli | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| cmdi | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| code | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| path | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| xss | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ssrf | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| redirect | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ldap | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| xpath | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| xxe | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| deser | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| log | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| header | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| regex | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ssti | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reflection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| proto | ✓ | ✓ | – | – | – | – | – | – | – |

Frameworks with source models: Express, Koa, Next.js (pages and app
router), Fastify/Hapi request objects, DOM (`location`, `document.URL`,
`postMessage` data); Flask, Django, FastAPI (route parameters, `Depends`
excluded), Starlette, Tornado; Servlet, Spring MVC/WebFlux annotations,
JAX-RS, Micronaut; ASP.NET Core / MVC (`Request.*`, `[FromQuery]` and friends,
controller action parameters); PHP superglobals, `php://input`,
`filter_input`, Laravel `Request`; Go `net/http`, gin, echo, fiber, chi, mux;
Rails/Sinatra `params`, `cookies`, `request.*`. Lower-trust: argv,
environment, stdin, file reads (off by default).

Cross-function and cross-file tests: helper chains with call/return events,
user sanitizer functions, JS `require` and ES `import`, Python relative
imports, Java controller → DAO through a typed field, Go package calls,
PHP `require_once`, Ruby `require_relative` + class methods, recursive merge
prototype pollution, Python fields written in `__init__` and read in another
method.

## Limitations

- Branches are not path-sensitive: a guard sanitizes the checked variable
  for every later statement, whether or not the failing branch returns.
  Assignments inside branches are unioned, never killed.
- Unknown library calls propagate taint from arguments and receiver to the
  result. This keeps recall high; it can over-report when a call returns an
  unrelated value (for example `api.call(name, args)`).
- Sources match by name and declared type; there is no type inference
  beyond declarations, `new`, constructor calls and field initializers.
  A variable called `req` in non-HTTP code is still treated as a request.
- Container precision is coarse: `obj.a` and `obj` share taint, array
  elements are not distinguished, maps keyed by constants are merged.
- Calls through function values, dependency injection containers,
  reflection, decorators that wrap functions and dynamic `require(variable)`
  are not followed. Overloads are merged by name.
- Interprocedural side effects are limited to returns, sinks and object
  fields; a callee that mutates a parameter object is not tracked.
- Each taint value keeps at most 6 origins and 40 path steps; the fixpoint
  stops after 12 rounds.
- The parsers are structural, not full grammars: unusual syntax (Kotlin DSL
  builders, C# LINQ query syntax, Ruby `method_missing` style DSLs, PHP
  alternative syntax `if: … endif;`) is parsed partially.
- XXE checks look for entity-enabling options in the call or the file
  (`noent`, `resolve_entities=True`, missing `disallow-doctype-decl`), not at
  the factory object the parser came from.
