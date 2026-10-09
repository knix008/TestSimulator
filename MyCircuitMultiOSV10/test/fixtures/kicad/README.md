# KiCad import fixtures

Test data for `test/unit/kicad.test.mjs` (the importer in `src/io/kicad.js`).
These files are data only; nothing here is executed.

| Folder | Source | KiCad format | Used for |
| --- | --- | --- | --- |
| `ecc83/` | `demos/ecc83/ecc83-pp.kicad_{sch,pcb}`, KiCad `master` | 9.0 (sch 20250114, pcb 20241229) | multi-unit symbol (ECC83 double triode), mirrored parts, rotated THT footprints, zone |
| `ecc83-v7/` | same design from the `7.0` branch | 7.0 (sch 20230121, pcb 20221018) | KiCad 6/7 syntax (bare `hide`, `fp_text reference`) |
| `sonde_xilinx/` | `demos/sonde xilinx/sonde xilinx.kicad_{sch,pcb}`, `master` (renamed without the space) | 9.0 | labels, 4-unit 74LS125 with hidden power pins, back-side footprint, vias, edge-mount connector with pads on both sides |
| `stickhub/StickHub.kicad_sch` | `demos/stickhub/StickHub.kicad_sch`, `master` | 9.0 | 140 parts incl. `(mirror x)` at 90°/270°, the only real data for rotated+mirrored symbols |
| `stickhub/StickHub.board-nets.json` | derived from `demos/stickhub/StickHub.kicad_pcb` (1 MB, not stored) | — | pad→net table KiCad wrote into the board: ground truth for the StickHub schematic connectivity |
| `synthetic/` | hand-written for these tests | 8.0 (20231120 / 20240108) | labels of every kind, bus + bus entry, sheet, De Morgan style, KiCad 6 and 8 flag spellings, 4-layer board, B-side SMD part at 150°, arc track, multi-layer zone, zone with arc outline, keep-out, rounded Edge.Cuts outline + round cut-out |

Downloaded from https://gitlab.com/kicad/code/kicad (`-/raw/<branch>/demos/...`) on 2026-10-09.

## Changes made to the downloaded files

* `.kicad_pcb` files: the `(filled_polygon ...)` blocks (zone fill caches that
  KiCad regenerates) were removed to keep the files small. Nothing else was
  touched; the importer ignores fills anyway.
* `StickHub.board-nets.json` was produced from the board by reading every
  footprint's pad `(net N "name")` (nets named `unconnected-*` left out).

## Licence

The KiCad demo projects are distributed with the KiCad source code, which is
licensed under the GNU General Public License v3 or later
(https://gitlab.com/kicad/code/kicad/-/blob/master/LICENSE.GPLv3). They are
included here unmodified apart from the notes above, as test inputs only, and
are not part of the MyCircuit application or its build output. The
`synthetic/` files were written for this project.
