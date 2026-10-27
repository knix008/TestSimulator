# Block diagram editor ↔ engine protocol

The model lives in the engine (`ctx.state.sim`, one entry per loaded model,
keyed by model name). The editor (`src/sim/ModelEditor.jsx`) keeps a local copy
for instant editing and Undo/Redo and sends the whole model back after each
edit. All messages are plain JSON objects with a `type` starting with `sim.`;
the engine registers `ctx.onMessage('sim.', handler)` in `install(ctx)`.

## Model format

See `core/sim/model.js` (top comment). Files are `.smdl`: the model as JSON
text (UTF-8). A file starting with the zip signature `PK` is a zipped model
(`model.json` inside); both are read. `.slx` / `.mdl` files are imported
read-only by `core/compat/slx.js` (best effort for common blocks).

Block parameters are strings (M expressions or option values). Booleans are
`'on'` / `'off'`. Block ids (`b12`) and line ids (`l7`) are unique in the whole
model; messages identify blocks by id.

## GUI → engine

| type | fields | effect / reply |
|---|---|---|
| `sim.open` | `reqId, path?, name?` | Loads the model (already loaded by name → that one; else the file at `path`: `.smdl`, `.slx`, `.mdl`; else a new empty model named after the path). Reply `sim.model` with `reason:'open'`. |
| `sim.new` | `reqId, name?` | New empty model. Reply `sim.model`. |
| `sim.edit` | `name, model, ops?` | Replaces the engine copy with `model` (a full snapshot). `ops` is informational. No reply. |
| `sim.save` | `reqId, name, path, model?` | Writes the model (after an optional `model` snapshot) to `path` with `ctx.fs.writeText`. When the file name differs from the model name the model is renamed. Reply `sim.saved {reqId, name, oldName, path, ok, error?}`. |
| `sim.compile` | `reqId?, name, model?` | Update diagram: compiles without running. Reply `sim.compiled {name, ok, error?, ports:{'id:port':{width, ts}}, blocks:{id:{ts, rate}}}`; `ts` is `-1`/`0`/`'inf'`/`[T, off]`, `rate` is an index for sample-time colours (0 continuous, 1.. discrete rates fastest first, `'const'`, `'trig'`). |
| `sim.run` | `name, model?, paused?` | Starts a simulation of the model (chunked: the worker stays responsive). With `paused:true` it compiles, initialises and waits. |
| `sim.pause` | `name` | Pauses a running simulation. |
| `sim.continue` | `name` | Resumes a paused simulation. |
| `sim.step` | `name` | One major time step (starts paused when stopped). |
| `sim.stop` | `name` | Stops; outputs are written to the base workspace as after a complete run. |
| `sim.tune` | `name, block, params:{name:value}` | Changes block parameters, also while running (Slider Gain, Manual Switch, Constant…). |
| `sim.close` | `name` | Forgets the model in the engine. |

## Engine → GUI

| type | fields | when |
|---|---|---|
| `sim.model` | `name, path, model, reqId?, reason` | `reason:'open'` answer to `sim.open`/`sim.new`; `reason:'engine'` after M-code changed the model (`add_block`, `set_param`, …; coalesced once per tick). The editor replaces its copy. |
| `sim.saved` | `reqId, name, oldName, path, ok, error?` | answer to `sim.save` |
| `sim.status` | `name, state, time, start, stop, progress, elapsed, message?` | `state`: `compiling` `running` `paused` `stopped` `error` (≤ 10 per second while running, always on state changes) |
| `sim.scope` | `name, block, reset?, t:number[], series:[{port, width, data:number[]}]` | new samples of a Scope / Floating Scope / XY Graph block (`data` is time-major: `width` values per time). `reset:true` starts a new run. |
| `sim.values` | `name, values:{'id:port': number[]}, displays:{id: number[]}` | latest signal values (first 16 elements) for hover and Display blocks |
| `sim.diagnostic` | `name, level, message, block?, path?` | errors (`error`), warnings, information; `block` is a block id when known |
| `sim.compiled` | see `sim.compile` | |
| `sim.openEditor` | `name, path` | `open_system` asks the app to show the model in an editor tab |
| `sim.closed` | `name` | `close_system` |

After a run (complete or stopped) the engine writes `out` (a `SimulationOutput`
object, when *single simulation output* is on) or `tout`/`yout`/`logsout`
and the To Workspace variables to the base workspace, then posts
`sim.status` with `state:'stopped'`. The app should refresh its Workspace
panel on that message.

## Builtins

`new_system open_system load_system close_system save_system bdroot gcs gcb
gcbh find_system add_block delete_block add_line delete_line replace_block
set_param get_param sim simset simget parsim SimulationInput` (+ methods
`setVariable setModelParameter setBlockParameter`). See `help <name>`.
