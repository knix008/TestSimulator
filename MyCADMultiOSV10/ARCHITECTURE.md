# Architecture

Written for developers working on MyCAD.

## The shape of the code

```
electron/main.cjs      Electron main process: window, dialogs, printing,
                       downloads, file arguments from the shell
electron/preload.cjs   the only bridge into the renderer (contextIsolation)
src/core/*.ts          geometry, document model, commands - no DOM access
src/ui/*.tsx           React shell: App, Viewport, dialogs, toolbar controls
scripts/*.mjs          generators for icons, samples and the NSIS include
tests/*.ts(x)          unit, contract and jsdom GUI tests
```

The rule that shapes everything else: **`src/core` never touches the DOM.**
Geometry, the document model and every command are plain functions over plain
data, so they can be unit tested without a browser and reused by the CLI-style
generators. React only renders state and dispatches actions.

## Data flow

```
   user gesture
        │
        ▼
  runCommand(id)  ──►  COMMANDS[id](context) ──► CommandEffect
        │                                            │
        │                               solids / wires / extras / report /
        │                               download / settingsPatch / preset
        ▼                                            ▼
   reducer(state, action)  ◄─────────────────  applyEffect()
        │
        ▼
   AppState { documents[], settings, history, zoom, tool }
        │
        ▼
   <Viewport> three.js scene   <dialogs>   <panels>
```

- **`store.ts`** holds `AppState` and a pure reducer. Undo/redo is a snapshot
  stack per document; `withActive(state, doc, recordHistory)` decides whether an
  action is undoable, which is why dragging an object records once per drag
  rather than once per mouse move.
- **`commands.ts`** is the registry: 220 commands, each a pure
  `(CommandContext) => CommandEffect`. The UI does not know what a command does;
  it only applies the effect. This is what makes the behaviour tests possible -
  `tests/freecad-behavior.test.ts` runs *every* command against a prepared
  document and asserts that something changed.
- **`extras.ts`** carries the document state the original model did not have
  (wires, groups, tags, scenes, spreadsheets, FEM analyses, mechanisms, sheet
  metal parts, BIM elements). It is versioned through `serialize.ts` (`version:
  2`) and cloned defensively on every snapshot.

## Geometry layers

| Layer | Modules | What it provides |
| --- | --- | --- |
| Mesh | `part.ts`, `stl.ts`, `primitives.ts`, `meshwb.ts` | triangle soups, CSG through three-bvh-csg, bounding boxes, mesh repair |
| B-rep | `brep.ts` | faces with planes and loops, derived edges and vertices, Euler checks, convex clipping, exact chamfer, rolling-ball fillet |
| NURBS | `nurbs.ts` | B-spline basis functions, rational curves and surfaces, knot insertion, exact circles, tessellation |
| Sketch | `sketcher.ts` | 2D constraint system with a damped Gauss-Newton solver and DoF counting |
| Analysis | `fea.ts`, `femwb.ts` | voxel → tetrahedra meshing, linear elasticity, conjugate gradient solver; closed-form beam/truss/thermal checks |

`brep.ts` is worth reading first if you touch modelling. Two operations are
exact rather than approximations:

- **Chamfer** clips the solid with one half-space per edge. For a 40 mm cube
  chamfered by 5 mm the result is 58 750 mm³, which is exactly what
  inclusion-exclusion over the twelve prisms, twenty-four pairwise and eight
  triple corner overlaps predicts.
- **Fillet** shrinks the solid by the radius and takes the Minkowski sum with a
  ball: flat faces, cylindrical edge blends, spherical corners. Its volume
  follows Steiner's formula `V + rA + r²M + 4πr³/3`, which the tests check
  against the tessellation.

## Scripting and extensions

`python.ts` is a real interpreter, not a string matcher: tokenizer with
indentation handling, recursive-descent parser, tree-walking evaluator with
scopes, closures, `for`/`while`/`if`/`def`/`import`, lists and dicts. The
standard library is deliberately tiny (`App`, `Part`, `Draft`, `math`) and there
is no file or network access; a step budget stops runaway loops.

`addons.ts` treats addons as data: a manifest carries metadata, optional
commands whose bodies are Python source, and an optional theme. Nothing executes
outside the interpreter, so installing an addon cannot run arbitrary JavaScript.

## The UI shell

- `App.tsx` owns the reducer, the dialogs and the command dispatch. It resolves
  the theme (`resolveTheme`) into CSS custom properties applied inline on the
  app root, so 40 themes plus the custom one need no stylesheet changes.
- `Viewport.tsx` builds the three.js scene from the document. The scene radius
  drives the axes, the grid, the camera distance and the near/far planes
  (`viewnav.ts`), so a 4 m wall frames like a 40 mm cube. Dragging moves the
  three.js mesh live and dispatches `move-solid` once on release.
- `ToolbarControls.tsx` holds the split controls (theme palette, zoom stepper,
  text-size stepper, light rig); `dialogs.tsx` holds every popup, including the
  shared `NumberField`, which always reads `[−] value [+]`.
- Panel widths are geometry, not guesswork: `toolPanelWidth()` sizes the tool
  panel from the intrinsic text width of its labels (measured on a canvas, since
  the label spans stretch to their button) and `propertyPanelWidth()` returns the
  narrowest property panel that fits a whole row. Both panels open at the same
  width, each has a splitter, and each can be closed from the toolbar.
- Theme variables are set inline on the app root, so the root also carries
  `color: var(--text)`; anything that inherits from `body` instead would keep the
  dark palette on a light theme.
- Every command, menu and toolbar id owns a unique icon. `tests/freecad-parity.test.ts`
  fails if two ids ever share one, or if an id falls back to the `•` placeholder.

## View state

The document owns what is modelled; the settings own how it is shown.

- `model.ts` holds the seven FreeCAD draw styles and `drawStyleSpec()`, which
  says for each one whether the faces are lit, flat-shaded, blanked, drawn as a
  wire mesh or as points, and whether the edges are outlined. `Viewport.tsx`
  builds materials straight from that description.
- `settings.ts` holds the camera projection, the four navigation styles, the
  three axis-aligned section planes and the unit schema; `units.ts` converts and
  formats lengths, areas and volumes (the document always stores millimetres).
- `viewnav.ts` owns the pure view maths: orbit, pan, drag placement, light
  angles, panel widths and `navAction()`, which maps a pointer gesture to
  `rotate`, `pan` or `none` per navigation style.

## Files and the operating system

`fileTypes.ts` is the single source of truth for what MyCAD can open. The same
table drives:

- `importFile()` at runtime,
- the open dialog filters,
- `scripts/create-installer.mjs`, which generates `build/installer-associations.nsh`
  (the wizard page with one checkbox per extension) and `build/file-types.json`,
- `electron/main.cjs`, which accepts those extensions from `process.argv`, from
  `second-instance` and from macOS `open-file`.

`tests/filetypes.test.ts` fails if any of those drift apart.

## Testing strategy

481 tests in four flavours:

1. **Unit** - geometry and maths checked against analytic values (Steiner's
   formula, `FL/AE`, bend allowance, partition of unity for NURBS bases).
2. **Registry coverage** - every command in `COMMANDS` runs against a prepared
   document; a command that produces no visible effect fails.
3. **Contract** - generated artefacts (samples, installer include, package.json)
   must match the code that consumes them.
4. **GUI** - jsdom renders the real `App`: menus, dialogs, theme switching,
   printing, export, drag state.

`npm test` regenerates the samples and the installer include first, so those
contracts are always checked against fresh output. The run must finish with no
failures **and no warnings**: a React `act()` warning means a test asserted
before the mount effects settled, so it is fixed in the test, not silenced.

`tests/summary-reporter.ts` prints a per-category table and writes the same text
to `test-output/summary.txt`. Categories come from the `[Tag]` prefix of each
test name, and both categories and rows are sorted by name so two runs of the
same suite produce the same file. The directory is generated output and is not
committed.

## Conventions

- Korean user-facing strings live in `i18n.ts` (typed keys) and `labels.ts`
  (command ids, with one-line help texts used for tooltips and the parameter
  dialog). Code comments and identifiers are English.
- Commands never mutate their input; they return an effect.
- New geometry goes into `src/core` with a test that pins it to an analytic or
  independently computed value, not to its own output.
