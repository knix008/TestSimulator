# MySimulator — architecture

MySimulator is a unified simulation workbench for Web, Windows, macOS and Linux.
A model is a **pipeline**: nodes (a source, a filter, an ODE, a regression, a
Monte Carlo study, a Python script …) joined by links from an output port to
an input port. The three layers:

```
┌──────────────── frontend (JavaScript, Vite, MyCAD-style GUI) ────────────────┐
│ src/core     catalog (node types, parameters, presets, help), model (graph,   │
│              links, checks), samples, result decoding, commands, i18n,        │
│              themes, settings, tutorial text                                  │
│ src/ui       app shell (menu bar, toolbar, panels, tabs, status bar),         │
│              graph.js (node editor canvas), views.js + charts.js (charts,     │
│              tables), plot3d.js (three.js), dialogs, start page, tutorial     │
│ src/platform native.js  — Tauri invoke / browser fallbacks                    │
│              solver.js  — runs a pipeline: Tauri command (desktop) or the     │
│                           WASM worker (web); both return the same bytes       │
└───────────────────────────────────────────────────────────────────────────────┘
          │ pipeline JSON (+ base folder)                ▲ result bytes (below)
          ▼                                              │
┌──── engine/sim-core (Rust library, no platform code) ───────────────────────┐
│ lib.rs     parse, validate, topological order, run nodes, contain failures  │
│ data.rs    Dataset = tables (named columns, text columns) + grids + scalars │
│            CSV in/out, interpolation, aggregates                            │
│ expr.rs    expression language (compiled to a stack program)                │
│ fft.rs     complex numbers, radix-2 FFT + Bluestein, windows                │
│ linalg.rs  LU, Householder least squares, Jacobi eigen, polynomial roots    │
│ ode.rs     Euler, RK4, Dormand–Prince RK45                                  │
│ rng.rs     xoshiro256**, distributions, inverse normal                      │
│ formats.rs data files: CSV, JSON, STL, WAV, XLSX (zip), MAT v5, PNG;        │
│            its own DEFLATE/zlib and base64 (the same in WebAssembly)        │
│ nodes/     source, table, signal, dynamics, blocks, spice, logic, mcu, fem, │
│            fem3d, physics, robot, cad, des, stats, ml, mc, optimize, io,    │
│            output — one                                                     │
│            function per node type (nodes/mod.rs: SPECS)                     │
│ result.rs  binary encoding of every node's output                           │
└──────────────────────────────────────────────────────────────────────────────┘
   used by  src-tauri (command `run_study`, CLI `--batch`, host.rs = files + programs)
   and by   engine/sim-wasm (cdylib for wasm32-unknown-unknown → public/sim.wasm)
```

The integration layer is the engine's `Host` trait: reading and writing files
and running external programs. The desktop host (`src-tauri/src/host.rs`)
implements it; the web build uses `NoHost`, whose methods return a clear
"desktop app only" error for those nodes.

## Pipeline JSON (`.mysim`)

```jsonc
{
  "format": "mysim", "version": 1,
  "name": "Signal cleanup", "description": "…",
  "nodes": [{
    "id": "sig", "type": "source.signal", "name": "Measured signal",
    "x": 60, "y": 190,                 // canvas place (the engine ignores it)
    "params": { "frequency": 50, "fs": 2000, "noise": 0.5 },
    "disabled": false                  // true: bypass (the first input passes through)
  }],
  "links": [{ "id": "l1", "from": "sig", "fromPort": "out", "to": "lp", "toPort": "in" }],
  "settings": { "seed": 1 }
}
```

- Every node has one output (`out`); inputs are named per type (`in`, `a`/`b`,
  `u`, `r`). An input takes one link; links may not form a loop.
- Parameters missing or `null` take their defaults; numbers may be strings
  holding an expression of constants (`"2*pi"`, `"1e-3"`).
- Random nodes use their own `seed` parameter, or the pipeline seed mixed with
  the node id.
- Nodes run in topological order (ties keep the node list order). A failed
  node keeps its error; the nodes after it are skipped ("an input failed").
- `opt.sweep` re-runs the part of the pipeline its metric node needs with a
  parameter of another node overridden (nested sweeps are refused).

## Node types

| Category | Types |
| --- | --- |
| Sources | `source.signal`, `source.table`, `source.file`, `source.random`, `source.function` |
| Data | `data.expression`, `data.filter`, `data.select`, `data.merge`, `data.resample`, `data.calculus` |
| Signal | `signal.fft`, `signal.psd`, `signal.filter`, `signal.spectrogram`, `signal.peaks`, `signal.correlate`, `signal.envelope` |
| Dynamics & control | `dyn.ode`, `ctrl.step`, `ctrl.bode`, `ctrl.pid`, `ctrl.statespace`, `dyn.blocks` |
| Circuits & physics | `circuit.spice`, `circuit.logic`, `fem.field`, `fem.solid` |
| Robots & multibody | `physics.rigid`, `robot.mobile`, `robot.arm` |
| CAD & geometry | `cad.part` |
| Statistics & ML | `stat.describe`, `stat.histogram`, `stat.regression`, `stat.correlation`, `ml.kmeans`, `ml.pca`, `ml.mlp` |
| Monte Carlo & optimisation | `mc.simulate`, `mc.process`, `des.process`, `opt.minimize`, `opt.fit`, `opt.sweep` |
| Integration | `io.python`, `io.command`, `io.readFile`, `io.writeFile`, `io.myheat` |
| Output | `out.plot`, `out.kpi` |

`src/core/catalog.js` lists the same types with parameters, names and help in
both languages; a unit test checks that the two lists (and their input ports)
agree.

Notes on the newer solvers:

- `spice.rs` flattens the netlist first (title line, `;` comments, `+`
  continuations, `.param` and `{expr}`, `.model`, `.subckt`/`X` expansion with
  instance-prefixed inner nodes), then builds MNA stamps. Nonlinear devices
  (diode with RS/BV, Ebers–Moll BJT, level-1 MOSFET, B sources with numeric
  derivatives) are linearised each Newton step; the operating point falls back
  to gmin stepping, source stepping and pseudo-transient continuation (B
  sources lag their expression) for high-gain loops such as clipped op-amps.
- `fem.rs` meshes a rectangle with six-node triangles on a structured grid;
  hole edges are fitted to the true outline before solving (preconditioned
  conjugate gradients on a CSR matrix).
- `cad.rs` integrates mass properties exactly along vertical rays (interval
  Booleans per ray), so curved sides converge with the grid; meshes use
  Eberly's polyhedral integrals.
- `physics.rs` is an impulse-based rigid-body engine: semi-implicit Euler, contacts from
  sphere/box/capsule pair tests (box–box by the separating-axis test), sequential
  impulses with Coulomb friction, restitution and Baumgarte correction, ball, hinge
  (with a motor row) and distance joints. It returns body frames and a scene
  description that `plot3d.js` plays back (`setScene`, `seekScene`).
- `fem3d.rs` meshes a CAD part (`cad::Geometry`) into equal box hexahedra; the
  elasticity element uses Wilson–Taylor incompatible modes condensed once.
- `mcu.rs` is the 8-bit CPU the logic node clocks as a part (`Part::Mcu`).
- `engine/heat-core` is MyHeatManager's engine, copied by
  `scripts/vendor-heat-core.mjs`; `io.myheat` calls `heat_core::run` in-process.
- `src/ui/blockeditor.js` turns a block diagram's text into blocks and wires and back
  (places in a `# layout:` comment).
- MyCircuit projects are converted in the browser by MyCircuit's own netlist
  builder and SPICE exporter, copied into `src/vendor/mycircuit` by
  `scripts/vendor-mycircuit.mjs` (not edited by hand).

## Expressions

`+ - * / ^ %`, comparisons and logic (1 = true), unary `- !`, implicit
multiplication after a number (`2x`), functions `sin cos tan asin acos atan
atan2 sinh cosh tanh exp ln log10 log2 sqrt cbrt abs sign floor ceil round
min max pow hypot clamp step if mod sat deg rad sinc erf gauss`, constants
`pi e`. An expression compiles once (names → slots) and evaluates many times.

## Result bytes

u32 LE magic `0x4D49534D` ("MSIM"), u32 LE header length, the header JSON,
padding to a multiple of 8, then f64 LE data. The header:

```jsonc
{ "ok": true, "error": null, "name": "…", "elapsedMs": 12.5,
  "nodes": [{ "id": "fft", "ok": true, "error": null, "warnings": [], "skipped": false, "elapsedMs": 0.8,
    "tables": [{ "name": "spectrum", "x": 0, "rows": 1001,
                 "columns": [{ "name": "f", "unit": "Hz", "offset": 0, "length": 1001 },
                             { "name": "label", "unit": "", "labels": ["…"], "length": 3 }] }],
    "grids": [{ "name": "spectrogram", "nx": 120, "ny": 129, "x": { "offset": …, "length": 120 }, "y": …, "z": …,
                "xLabel": "t (s)", "yLabel": "f (Hz)", "zLabel": "dB", "xNames": null, "yNames": null }],
    "scalars": [{ "name": "dominant frequency", "value": 50.0, "unit": "Hz" }],
    "text": "" }] }
```

Offsets and lengths count f64 values from the data start. Non-finite scalars
are `null`. WebAssembly has no clock: the web engine reports 0 ms per node and
the page times the whole run.

## WASM ABI (`engine/sim-wasm`)

Exports `sm_alloc(len)`, `sm_free(ptr, len)`, `sm_run(ptr, len) → out`,
`sm_validate(ptr, len) → out`, `sm_result_free(out)`; `out` points at a u32 LE
length followed by the payload. Imports `env.sm_progress(phasePtr, phaseLen,
fraction, msgPtr, msgLen)` and `env.sm_cancelled()`. The page runs it in a Web
Worker (`src/platform/sim-worker.js`); stopping terminates the worker.

## Desktop host (`src-tauri`)

- `run_study(model, baseDir)` runs on a blocking thread, emits `study-progress`
  events (at most every 80 ms) and returns the bytes as an ArrayBuffer;
  `cancel_study` sets the cancel flag the engine polls between nodes and inside
  long loops.
- `host.rs`: paths relative to the pipeline file's folder; external programs run
  in a fresh temporary folder (`in.csv`, `out.csv`, the Python script), with a
  time limit and the cancel flag, without a console window. Python is found as
  `py -3`, `python` or `python3` (Windows) and its version checked.
- `read_bytes` serves binary data files to `io.readFile`; `read_base64_file`
  hands them to the File data node.
- Before the first run of a pipeline with Python or command nodes the UI asks
  for permission (once per tab).
- `--batch` (`batch.rs`): `MySimulator --batch a.mysim [--out dir] [--set
  node.param=value]… [--only ids] [--quiet]` writes `<name>.summary.json`,
  `<name>.<node>.<table>.csv` and `<name>.<node>.<grid>.png`; exit code 0 (all
  nodes ran), 2 (a node failed) or 1 (bad arguments).
- Dialogs and drop-down menus open in pop-out windows (`popout.rs`), the window
  has no system frame (the menu bar row carries the title and the window
  buttons), several copies may run at once (`instance.rs`), the window place is
  kept (`window_state.rs`).

## Frontend notes

- `app.js` keeps documents (tabs) with undo/redo of the pipeline, the results
  of the last run (a Map of node outputs) and a "stale" set: a change marks the
  node and everything after it; auto run re-runs after 700 ms.
- Run to selection runs the selected nodes and their inputs (and what a sweep
  reaches) and merges the outputs into the document's results.
- `graph.js` draws on one canvas; double clicks are detected from the presses
  (pointer capture and re-rendering mean the browser never sends `dblclick`).
  Nodes come from the palette by click (added after the selected node and
  linked) or by HTML5 drag and drop (`application/x-mysim-node`).
- `views.js` picks a chart for any output: a heat map for grids, horizontal
  bars for labelled rows, lines against the x column otherwise; a chart node's
  settings (type, table, x, y, colour column, log axes) override.

## Tests

`npm test` — js (node:test), engine (`cargo test` in sim-core: unit tests and
every node type against known answers), rust (desktop shell, the installed
MyHeatManager when present), wasm (build, ABI smoke, every sample and every
preset of every node), web (Vite + headless browser over CDP) and desktop (the
debug program over WebView2 CDP, and `--batch`).

`engine/sim-core/tests/fixtures` holds data files written by the usual tools
(`make_fixtures.py`: scipy, PIL, numpy, zipfile), MyCircuit's exported
netlists with MyCircuit's own operating points (`make_mycircuit_fixtures.mjs`)
and a real MyHeatManager batch result, so the readers and the circuit solver
are checked against other programs, not only against themselves.
