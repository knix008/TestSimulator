# MyCAD

Cross-platform 3D CAD for the web, Windows, macOS and Linux. One React + three.js
front end, one TypeScript geometry core, packaged with Electron.

MyCAD mirrors the workbench model of FreeCAD, adds the CATIA workbenches
(Generative Shape Design, Sheet Metal, DMU Kinematics, Knowledgeware, Assembly
Design) and the SketchUp way of working (push/pull, follow me, groups,
components, tags, scenes, section planes).

```
npm install
npm start           # Electron app against the Vite dev server
npm run dev         # browser only
npm test            # 493 tests

npm run build:web   # static site in dist/
npm run build:win   # NSIS installer
npm run build:mac   # dmg
npm run build:linux # AppImage and deb
npm run build:all   # the web build and all three desktop targets
```

Each desktop command builds the web bundle first and leaves its installer in
`release/`. A target can only be built on a host that supports it (a dmg needs
macOS), so `build:all` is for a machine or CI runner with all three toolchains.
The Windows installer asks whether an installation it finds should be removed
first, and MyCAD runs one instance at a time: launching it again brings the open
window forward, with whatever file was passed on the command line.

## What is in the box

| Area | Highlights |
| --- | --- |
| Modelling | 13 primitives, booleans (union/cut/common/XOR/fragments), pad, pocket, revolve, loft, pipe, helix, fillet, chamfer, shell, thickness, draft, patterns |
| Kernel | B-rep topology with exact chamfer (half-space clipping) and constant-radius fillet (rolling ball / Steiner), NURBS curves and surfaces with rational circles and knot insertion |
| Sketcher | 2D constraint solver (coincident, horizontal, vertical, distance, radius, parallel, perpendicular, equal, symmetric, tangent…), degrees of freedom, redundancy check |
| Draft | Lines, arcs, B-splines, Bezier curves, offsets, trim/extend, join/split, upgrade/downgrade, five array types, dimensions, shape strings |
| Surfaces | GSD extrude, revolve, sweep, multi-section, fill, blend, offset, join, split, boundary extraction, healing report |
| Mesh & points | Evaluate, decimate, refine, smooth, harmonize/flip normals, fill holes, sections, plane/sphere fitting, surface approximation |
| Assembly | Product tree, constraint solver, exploded view, BOM with masses, inertia matrix, clash detection, DMU joints and simulation |
| Analysis | Volume FEM (voxel → tetrahedra → conjugate gradient) with von Mises stress, plus closed-form bar, beam, truss, modal and thermal checks |
| Manufacturing | CAM profile/pocket/drill/surface/helix/engrave/adaptive with grbl, LinuxCNC, Mach3, Marlin and Fanuc post-processors; sheet metal walls, flanges, hems, K-factor unfolding and flat-pattern DXF |
| BIM | Walls, columns, beams, slabs, roofs, windows, doors, stairs, spaces, levels, schedules, IFC4 import and export |
| Drawings | TechDraw projections, section and detail views, dimensions, hatching, BOM tables, A3/A4/A5/Letter/Legal sheets, SVG and DXF output |
| Scripting | Sandboxed Python interpreter with a FreeCAD-shaped API (`App`, `Part`, `Draft`, `math`), plus a compact macro form |
| Extensions | Addon manager: catalogue, manifest validation, install/enable/uninstall, addon-contributed commands and themes |
| View | Seven draw styles (as is, shaded, flat lines, wireframe, points, hidden line, no shading), perspective or orthographic camera, X/Y/Z section planes, four navigation styles (CAD, Blender, touchpad, Maya), six key-light kinds with colour and nine rigs |
| Units | mm, cm, m, inch and foot schemas for the status bar, measurements and volumes |
| Interface | 22 menus, 30 workbenches, 225 commands, a tool panel grouped by what the commands do, 40 pastel themes (20 dark + 20 light) plus a custom theme that can start from any preset, resizable tool and property panels, Korean and English |

## Documentation

- [USERSGUIDE.md](USERSGUIDE.md) — how to drive the application, workbench by workbench.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the code is organised and why.
- [sample/README.md](sample/README.md) — the 27 sample files and what each one exercises.
- `test-output/summary.txt` — the last test run, written by the reporter in `tests/summary-reporter.ts` (not committed).

## Project layout

```
electron/     main process, preload bridge, file associations at runtime
src/core/     geometry, document model, commands - no DOM, fully unit tested
src/ui/       React components: App shell, viewport, dialogs, toolbar controls
scripts/      icon, sample and installer generators
sample/       ready-made test files for every import path
tests/        481 tests (unit, contract and jsdom GUI)
```

## File formats

MyCAD opens `.mycad`, `.stl`, `.obj`, `.dxf`, `.svg`, `.scad`, `.ifc`, `.asc`,
`.xyz`, `.nc`, `.gcode`, `.mycadmacro`, `.mycadaddon` and `.csv`, and exports
twelve formats (MyCAD, STL, OBJ, SVG, DXF, drawing SVG/DXF, IFC4, G-code, point
cloud, CSV, macro, Python).

The Windows installer asks which of those extensions it should register; the
`.mycad` document type is always associated. Uninstalling removes only the
associations the installer created.

## Requirements

Node.js 20 or newer. Electron 35 ships with the project; no native toolchain is
needed because the geometry kernel is pure TypeScript.

## Licence and credits

Author: shkwon (knix008@naver.com). MyCAD is released under the MIT licence. The workbench names of FreeCAD, CATIA and
SketchUp are used to describe equivalent functionality; MyCAD is an independent
implementation and is not affiliated with those products.
