# MySimulationMath — module contract

MySimulationMath is a numerical computing environment with an array language
(`.m` files), a plotting system and a block-diagram simulation tool. It runs as
a Tauri 2 desktop app (Windows, macOS, Linux) and as a web app.

**Name rule:** the words of the commercial products this app is compatible with
must never appear in code, UI, docs or tests (check with
`grep -rniE "matl[a]b|simul[i]nk" --exclude-dir=node_modules .`). The only
exception is the inside of `core/compat/`, and only where a file format
requires a literal (for example a MAT-file header text). Use our own terms:
"M 언어 / M language", "명령 창 / Command Window", "블록 다이어그램 /
block diagram", "모델 / model", "툴박스 / toolbox".

## 1. Layout and ownership

| Folder | Owner | What |
|---|---|---|
| `core/value.js` | shared (read-only for agents; ask before changing) | value model |
| `core/registry.js` | shared | collects all builtins |
| `core/lang/`, `core/session.js`, `core/classes.js` | language | lexer, parser, interpreter, OOP, debugger, session API |
| `core/lib/base/` | base library | operators, elmat, elfun, datafun, strings, cell/struct, sets, types, time, table/datetime/categorical/containers.Map, display/format, validation |
| `core/lib/linalg/` | linear algebra | matrix ops, factorizations, sparse, FFT, polynomials, interpolation, special functions |
| `core/lib/numeric/` | numerics | random numbers, ODE/DAE/BVP/PDE, optimization, integration, statistics, signal processing, control systems |
| `core/lib/io/`, `core/lib/image/`, `core/compat/mat*.js` | I/O | files, MAT/CSV/XLSX/JSON, images, audio, image processing |
| `core/graphics/`, `src/graphics/` | graphics | handle graphics, plotting, UI components, renderers |
| `core/sim/`, `src/sim/`, `core/compat/slx*.js` | simulation | block diagram engine, block library, editor |
| everything else (`src/`, `src-tauri/`, `server/`, `scripts/`, `core/fs-*.js`, `index.html`, `vite.config.mjs`, `package.json`) | app | GUI shell, worker, platform |

Rules: write only inside your folders. No new npm dependencies (only the app
owner edits `package.json`). `core/` is pure ES modules with no platform API
(no `node:*`, no DOM): it must run in a Web Worker and in Node. Tests go in
`test/<area>*.test.mjs` (`node --test`, ES modules, English output).

## 2. Values (`core/value.js`)

Read the file. Summary:

- Tensors `{cls, dims, re: Float64Array, im: Float64Array|null}` for
  `double single int8..uint64 logical char`. Column-major, `dims.length >= 2`.
  Complex only when needed (`simplifyComplex`).
- Sparse `{cls, sparse:true, dims:[m,n], colPtr, rowIdx, re, im}` (CSC).
- `string` arrays `{cls:'string', dims, data: (string|null)[]}`.
- `cell` `{cls:'cell', dims, data: Value[]}`.
- `struct` `{cls:'struct', dims, fields: string[], data: record[]}`.
- `function_handle` (interpreter-private fields; call through `ctx.call`).
- objects `{cls:<class>, isObject:true, handle, props, ...}`.
- Errors: `throw new MError(identifier, message)`.

Values are immutable: never mutate an argument. Return fresh values.

## 3. Builtins

Each area has an `index.js` that exports:

```js
export const builtins = {
  // (args: Value[], nargout: number, ctx) => Value | Value[]
  sum(args, nargout, ctx) { ... return value; },
  max(args, nargout, ctx) { ... return [m, i]; },   // several outputs
};
export const help = {
  // optional, shown by `help name` and the help browser
  sum: { en: 'Sum of array elements.', ko: '배열 원소의 합.', syntax: ['S = sum(A)', 'S = sum(A, dim)'] },
};
export const classes = { /* optional, see §5 */ };
export function install(ctx) { /* optional, once per session */ }
```

- `nargout` is the number of requested outputs (0 when called as a statement;
  return at least the first output anyway, or `[]`/`undefined` for none).
- Return a single Value, or an array of Values for several outputs.
- Argument errors: `MError('<area>:<fn>:<what>', 'English message.')`.
- Name/value pairs and `"text"` vs `'text'`: accept both char and string.
- A builtin name defined in two areas is an error at start-up (`registry.js`
  checks), except where `override: true` is set by the later area.

## 4. The context object `ctx` (made by the interpreter)

| Member | Meaning |
|---|---|
| `ctx.call(fn, args, nargout = 1) → Value[]` | call a function handle, a function name (string) or a builtin |
| `ctx.out(text)` / `ctx.errOut(text)` | write to the Command Window (stdout / stderr) |
| `ctx.warning(id, message)` | issue a warning (respects `warning off id`) |
| `ctx.fs` | synchronous file system (§6) |
| `ctx.host` | GUI bridge: `post(msg)` (fire and forget), `request(msg) → reply` (blocks the worker until the GUI answers; returns `null` when no GUI) |
| `ctx.onMessage(prefix, fn)` | register a handler for GUI → engine messages whose `type` starts with `prefix` (e.g. `'graphics.'`, `'sim.'`) |
| `ctx.checkInterrupt()` | throws `MError('core:interrupted')` when the user pressed Ctrl+C; call it in long loops |
| `ctx.getVar(name, scope='caller'|'base')`, `ctx.setVar(name, v, scope)` | workspace access (evalin/assignin, simulation parameters) |
| `ctx.evalString(code, scope='base') → Value[]` | evaluate code text |
| `ctx.state` | per-session store for library state: `ctx.state.rng`, `ctx.state.graphics`, `ctx.state.sim`, `ctx.state.files` … (each area uses its own key) |
| `ctx.format` | current `format` settings `{ numeric:'short'|'long'|..., spacing:'loose'|'compact' }` |
| `ctx.session` | the session (§7) |

## 5. Classes written in JS (`core/classes.js`)

Areas register built-in classes (table, datetime, duration, categorical,
containers.Map, tf/ss/zpk, digitalFilter, inputParser, MException…) with:

```js
export const classes = {
  'containers.Map': {
    handle: true,
    construct(args, ctx) → object value,
    methods: { keys(args, nargout, ctx) {...}, ... },    // obj is args[0]
    subsref(obj, subs, nargout, ctx) → Value[],          // optional; subs: [{type:'()'|'{}'|'.', subs:[...]}]
    subsasgn(obj, subs, rhs, ctx) → obj,                  // optional
    display(obj, name, ctx) → text,                       // optional
    size(obj) → dims, numel(obj),                         // optional
    props: ['Count', 'KeyType', 'ValueType'],             // for properties/fieldnames
  },
};
```

Operators on objects call methods named `plus`, `minus`, `mtimes`, `eq`, … when
the class defines them. User `classdef` classes are handled by the interpreter
the same way.

## 6. File system (`ctx.fs`)

All synchronous, absolute paths with `/` separators (Windows: `C:/x/y`):

```
readText(path) → string          writeText(path, text)          appendText(path, text)
readBytes(path) → Uint8Array     writeBytes(path, bytes)
exists(path) → boolean           stat(path) → {isDir, size, mtimeMs}
list(dir) → [{name, isDir, size, mtimeMs}]
mkdir(path)  remove(path, {recursive})  rename(from, to)  copy(from, to)
cwd() → path   chdir(path)   tempDir() → path   homeDir() → path
system(command) → {status, output}   // desktop only; elsewhere throws
```

Implementations: `core/fs-memory.js` (tests), `core/fs-node.js` (Node CLI and
tests), `src/engine/fs-http.js` (Web Worker → host HTTP API, synchronous XHR).

## 7. Session API (`core/session.js`, used by the worker and by tests)

```js
import { createSession } from './core/session.js';
const s = createSession({ fs, host, print(text, stream) {}, onEvent(ev) {} });
s.evaluate(code, { echo: true, file: null }) → { ok: true } | { ok: false, error: { identifier, message, stack } }
s.runFile(path)
s.listVariables() → [{ name, cls, dims, bytes, summary, global }]
s.getVariable(name) / s.setVariable(name, value) / s.clear(names?)
s.complete(text, cursor) → [{ label, kind }]      // functions, variables, fields, files
s.help(name) → { text, syntax, en, ko } | null
s.catalog() → [{ name, kind, area, en, ko }]      // every documented builtin (kind: function | constant)
s.check(src, { file }) → [{ severity, line, col, code, name?, message }]  // static problems (core/lang/check.js)
s.handleMessage(msg)                              // GUI → engine messages (routes ctx.onMessage handlers)
s.setInterruptFlag(int32Array)                    // SharedArrayBuffer flag (index 0 != 0 → interrupt)
s.setBreakpoints(file, lines[])                   // debugger
```

Debugging: when a breakpoint is hit the session calls
`host.request({ type: 'debug.paused', file, line, stack, vars })` and acts on the
reply: `'continue' | 'step' | 'stepIn' | 'stepOut' | 'stop' | { eval: code }`.

`onEvent` events: `{type:'workspace'}` (variables changed), `{type:'cwd', path}`,
`{type:'busy', busy}`, `{type:'openFile', path, line}` (`edit`, `open`),
`{type:'clc'}`, `{type:'history', command}`.

## 8. Engine ↔ GUI messages

The engine runs in a Web Worker (`src/engine/worker.js`). Messages are plain
JSON objects with a `type`:

- GUI → engine: `eval`, `complete`, `catalog`, `check`, `variables`, `variable.get`, `variable.set`,
  `graphics.*` (figure interaction, UI callbacks), `sim.*` (run, stop, step,
  model edits from the editor).
- engine → GUI: `out`, `done`, `event` (session events above), `request`
  (synchronous request, answered through a SharedArrayBuffer),
  `graphics.*` (figure scene updates), `sim.*` (model opened/changed, scope
  data, simulation status).

`src/engine/client.js` exports the `engine` object used by GUI code:
`engine.eval(code, opts) → Promise`, `engine.on(type, fn) → unsubscribe`,
`engine.post(msg)`, `engine.onRequest(type, async fn)` (answers worker requests).
