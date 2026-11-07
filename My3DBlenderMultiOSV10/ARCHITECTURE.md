# Architecture

Three layers. Dependencies only point down.

```
src/ui        DOM and WebGL: app shell, area system, editors, widgets, menus, dialogs
src/core      The program itself: no DOM. Runs in the page, in workers and in Node (that is what the unit tests use)
src/platform  File access and windows: Tauri on the desktop, browser APIs on the web
src-tauri     The desktop shell in Rust: window, file commands, pop-out windows, single install. No 3D code
```

## Core

| Module | Holds |
|---|---|
| `mesh.js` | Polygon mesh data, primitives, triangulation, UV projections |
| `meshops.js` | Edit-mode tools: extrude, inset, bevel, loop cut, bisect, merge, selection |
| `modifiers.js`, `csg.js` | The modifier stack, Catmull-Clark, BSP booleans |
| `doc.js` | The scene document, transforms, constraints, frames, evaluated geometry, save and load |
| `ops.js` | The operator registry |
| `anim.js`, `armature.js` | F-curves, NLA, drivers; bones, skinning, IK |
| `nodes.js` | One node engine for shader, world, geometry and compositor trees |
| `pathtracer.js` | BVH path tracer, denoise, view transform |
| `physics.js` | Rigid bodies, cloth, soft bodies, particles, force fields |
| `sculpt.js` | Sculpt, vertex and weight paint brushes |
| `simulation.js` | Smoke, FLIP liquid and Dynamic Paint; results in `simCache` |
| `unwrap.js`, `paint.js` | LSCM unwrap and island packing; texture painting and PNG encoding |
| `remesh.js`, `metaball.js`, `nurbs.js` | Voxel remesh, skin, ocean, multires, dyntopo; implicit and NURBS surfaces |
| `scenes.js` | Several scenes, instances, motion paths, onion skin |
| `sequencer.js`, `tracking.js` | Video strips and their picture at a frame; marker tracking and camera solve |
| `freestyle.js`, `osl.js` | Stylized lines; the OSL subset behind the Script node |
| `io.js`, `formats.js`, `blendfile.js`, `inflate.js` | OBJ, STL, PLY, GLB, SVG; FBX, DAE, USDA; reading `.blend` |
| `script.js`, `python.js`, `addons.js` | The `bpy`-shaped API; its Python interpreter (own code, no C extensions); add-ons |
| `keymap.js`, `assets.js` | Key rebinding; the asset library |
| `alembic.js`, `zstd.js` | Alembic (Ogawa) reading and writing; Zstandard decoding for compressed `.blend` files |
| `tutorial.js` | The tutorial's steps as data: what to light, what to do, how to tell it is done, how to do it |
| `features.js` | The feature checklist behind Help › Feature Coverage |

## Decisions that shape the code

**Operators.** Every action is one registered operator (`ops.js`, plus `ui/uiops.js` for what needs dialogs). Menus, keys, F3 search, scripts and tests all call `run(ctx, id, props)`. To add a feature, add an operator; it is then reachable from everywhere and the tests pick it up.

**A plain JSON document.** `doc` holds no classes. Keys starting with `_` are run-time only. Files, undo and worker hand-over are all the same serialization.

**Undo by snapshot.** `history.js` keeps whole serialized documents: always correct whatever an operator changed, at the cost of memory on very large scenes. Selection and frame changes are folded into the current snapshot (`amend`) rather than making steps. Adjust Last Operation is undo plus re-run with new values.

**Evaluated geometry.** Object data stays as edited; `evaluatedMesh` applies shape keys and modifiers. `ui/sync.js` rebuilds a mesh in three.js only when a fingerprint of its data changes, so moving an object or stepping a frame on a static mesh is cheap.

**Rotation order.** `'XYZ'` means X first, then Y, then Z, which three.js calls `'ZYX'`. All conversion goes through `rotationQuat` and `rotationFromQuat` in `doc.js`.

**Z up.** The scene is Z-up, cameras look down −Z with Y up. glTF turns on the way in and out.

**Simulation results stay out of the document.** Smoke, liquid and paint results live in `simCache`, a Map in `simulation.js`. They are not saved or snapshotted, which keeps undo cheap; a sample with `bake: true` bakes when it opens.

**Scenes.** The active scene's fields sit on the document root, and the others wait in `doc.scenes[i].state`. `switchScene` swaps them, so the rest of the code only ever sees one scene.

**Node groups.** A group node carries its own graph in `node.group`; `nodeSockets(node)` gives its sockets, which depend on that graph.

**Samples are generated.** `scripts/create-samples.mjs` writes `sample/<level>/*.my3d`, the pictures and the index, and copies them to `public/sample`. Change the generator, not the files.

**Honest coverage.** Unbuilt features are not shown as working menu items. `features.js` records each as done, partial (with what is missing) or planned, and a unit test checks that everything it names exists in the code.

## Rendering

The path tracer takes a snapshot of the scene (`buildRenderScene`), and `ui/render.js` hands one row at a time to as many workers as there are spare CPUs. Finished images go through denoise, the compositor and the view transform. The real-time engine draws through `SceneSync` on an off-screen WebGL renderer. `ui/gpupath.js` is a second path tracer that runs in WebGL2 shaders.

## Tests

`npm test` (`scripts/test.mjs`) runs four categories and prints one summary, in English.

| Category | What it covers |
|---|---|
| `js` | Everything in `src/core`, with exact checks: volumes, Euler characteristic, known curve values, rendered pixels |
| `rust` | The desktop shell's file and window code |
| `web` | The app in headless Edge or Chrome, with real mouse and key events over CDP; `E2E_ONLY=<text>` filters |
| `verify:blender` (not part of `npm test`) | Our files read by a real Blender, and Blender's files read by us, compared in numbers |
| `desktop` | The real debug program over WebView2's DevTools port, with its own temporary config folders |
