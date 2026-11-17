# MyArchitecture — Test report / 테스트 결과 보고서

- **Result / 결과**: ❌ TESTS FAILED (실패 있음)
- **Run at / 실행 시각**: 2026-11-17 01:30:04 UTC
- **Duration / 소요 시간**: 1 m 02 s
- **Tests / 테스트**: 4551 — 4545 passed, 1 failed, 5 skipped
- **Files / 파일**: 57/58 passed · **Categories / 분류**: 19/20 passed
- **Environment / 환경**: node v24.15.0, win32 x64

## Summary / 요약

| # | Category | 분류 | Files | Tests | Pass | Fail | Skip | Time | Result |
|--:|:--|:--|--:|--:|--:|--:|--:|--:|:-:|
| 1 | Core model & geometry | 핵심 모델·기하 | 4 | 295 | 295 | 0 | 0 | 1.16 s | ✅ |
| 2 | Plan editing | 평면 편집 | 4 | 135 | 135 | 0 | 0 | 4.28 s | ✅ |
| 3 | Checks & schedules | 검사·집계 | 3 | 117 | 117 | 0 | 0 | 719 ms | ✅ |
| 4 | Views, sheets & annotation | 뷰·시트·주석 | 1 | 36 | 36 | 0 | 0 | 2.04 s | ✅ |
| 5 | 3D model | 3D 모델 | 13 | 3046 | 3046 | 0 | 0 | 20.24 s | ✅ |
| 6 | Furniture library | 가구 라이브러리 | 1 | 9 | 8 | 1 | 0 | 273 ms | ❌ |
| 7 | Materials & asset library | 재료·에셋 라이브러리 | 2 | 12 | 12 | 0 | 0 | 395 ms | ✅ |
| 8 | SketchUp modelling | 스케치업 모델링 | 3 | 77 | 77 | 0 | 0 | 728 ms | ✅ |
| 9 | CAD exchange (DXF, DWG, SVG, plan pictures) | CAD 교환 (DXF, DWG, SVG, 평면도 그림) | 7 | 116 | 112 | 0 | 4 | 10.18 s | ✅ |
| 10 | Printing & PDF | 인쇄·PDF | 2 | 11 | 11 | 0 | 0 | 413 ms | ✅ |
| 11 | BIM exchange (IFC, ifcXML) | BIM 교환 (IFC, ifcXML) | 2 | 25 | 25 | 0 | 0 | 930 ms | ✅ |
| 12 | Other BIM (SH3D, gbXML) | 다른 BIM (SH3D, gbXML) | 3 | 114 | 114 | 0 | 0 | 5.51 s | ✅ |
| 13 | 3D exchange | 3D 교환 | 3 | 34 | 33 | 0 | 1 | 894 ms | ✅ |
| 14 | Samples | 예제 | 1 | 363 | 363 | 0 | 0 | 3.80 s | ✅ |
| 15 | User interface (icons, widgets) | 사용자 인터페이스 (아이콘, 위젯) | 1 | 3 | 3 | 0 | 0 | 182 ms | ✅ |
| 16 | Start page & tutorial | 시작 화면·튜토리얼 | 2 | 21 | 21 | 0 | 0 | 543 ms | ✅ |
| 17 | Localization | 다국어 | 1 | 5 | 5 | 0 | 0 | 290 ms | ✅ |
| 18 | Build & maintenance scripts | 빌드·정리 스크립트 | 1 | 4 | 4 | 0 | 0 | 515 ms | ✅ |
| 19 | Desktop shell (Rust) | 데스크톱 셸 (Rust) | 1 | 21 | 21 | 0 | 0 | 7.21 s | ✅ |
| 20 | Other | 기타 | 3 | 107 | 107 | 0 | 0 | 1.61 s | ✅ |
| | **Total** | **합계** | **58** | **4551** | **4545** | **1** | **5** | **1 m 02 s** | ❌ |

## Failures / 실패

### ❌ the thumbnail sprite has a picture of every item (npm run build:furniture)

- File / 파일: `test/unit/library.test.mjs`

```
The expression evaluated to a falsy value:

  assert.ok(fs.statSync(path.join(root, "assets/furniture/thumbs.webp")).size > 10000)

```

## Files / 파일별 결과

| Category / 분류 | File | Tests | Pass | Fail | Skip | Time | Result |
|:--|:--|--:|--:|--:|--:|--:|:-:|
| Core model & geometry | `core.test.mjs` | 171 | 171 | 0 | 0 | 325 ms | ✅ |
| Core model & geometry | `elements.test.mjs` | 26 | 26 | 0 | 0 | 380 ms | ✅ |
| Core model & geometry | `rooms.test.mjs` | 47 | 47 | 0 | 0 | 228 ms | ✅ |
| Core model & geometry | `walls.test.mjs` | 51 | 51 | 0 | 0 | 228 ms | ✅ |
| Plan editing | `docs.test.mjs` | 9 | 9 | 0 | 0 | 199 ms | ✅ |
| Plan editing | `plan.test.mjs` | 116 | 116 | 0 | 0 | 3.44 s | ✅ |
| Plan editing | `store.test.mjs` | 6 | 6 | 0 | 0 | 196 ms | ✅ |
| Plan editing | `wallcleanup.test.mjs` | 4 | 4 | 0 | 0 | 441 ms | ✅ |
| Checks & schedules | `check.test.mjs` | 75 | 75 | 0 | 0 | 245 ms | ✅ |
| Checks & schedules | `fixes.test.mjs` | 17 | 17 | 0 | 0 | 243 ms | ✅ |
| Checks & schedules | `schedule.test.mjs` | 25 | 25 | 0 | 0 | 231 ms | ✅ |
| Views, sheets & annotation | `views.test.mjs` | 36 | 36 | 0 | 0 | 2.04 s | ✅ |
| 3D model | `background3d.test.mjs` | 3 | 3 | 0 | 0 | 152 ms | ✅ |
| 3D model | `doors.test.mjs` | 4 | 4 | 0 | 0 | 258 ms | ✅ |
| 3D model | `environments.test.mjs` | 4 | 4 | 0 | 0 | 227 ms | ✅ |
| 3D model | `ground.test.mjs` | 4 | 4 | 0 | 0 | 274 ms | ✅ |
| 3D model | `interior.test.mjs` | 13 | 13 | 0 | 0 | 274 ms | ✅ |
| 3D model | `lightlist.test.mjs` | 3 | 3 | 0 | 0 | 213 ms | ✅ |
| 3D model | `lights.test.mjs` | 17 | 17 | 0 | 0 | 303 ms | ✅ |
| 3D model | `members.test.mjs` | 17 | 17 | 0 | 0 | 271 ms | ✅ |
| 3D model | `perf3d.test.mjs` | 24 | 24 | 0 | 0 | 2.86 s | ✅ |
| 3D model | `photo.test.mjs` | 3 | 3 | 0 | 0 | 167 ms | ✅ |
| 3D model | `structures.test.mjs` | 17 | 17 | 0 | 0 | 396 ms | ✅ |
| 3D model | `tour.test.mjs` | 47 | 47 | 0 | 0 | 3.79 s | ✅ |
| 3D model | `view3d.test.mjs` | 2890 | 2890 | 0 | 0 | 11.06 s | ✅ |
| Furniture library | `library.test.mjs` | 9 | 8 | 1 | 0 | 273 ms | ❌ |
| Materials & asset library | `assetlib.test.mjs` | 5 | 5 | 0 | 0 | 151 ms | ✅ |
| Materials & asset library | `presets.test.mjs` | 7 | 7 | 0 | 0 | 244 ms | ✅ |
| SketchUp modelling | `massing.test.mjs` | 12 | 12 | 0 | 0 | 243 ms | ✅ |
| SketchUp modelling | `mesh.test.mjs` | 36 | 36 | 0 | 0 | 180 ms | ✅ |
| SketchUp modelling | `sketchup.test.mjs` | 29 | 29 | 0 | 0 | 305 ms | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `cadextra.test.mjs` | 16 | 14 | 0 | 2 | 229 ms | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `dwg.test.mjs` | 12 | 10 | 0 | 2 | 213 ms | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `dwgwrite.test.mjs` | 6 | 6 | 0 | 0 | 320 ms | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `dxf.test.mjs` | 46 | 46 | 0 | 0 | 273 ms | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `dxfbin.test.mjs` | 16 | 16 | 0 | 0 | 364 ms | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `planpicture.test.mjs` | 14 | 14 | 0 | 0 | 8.63 s | ✅ |
| CAD exchange (DXF, DWG, SVG, plan pictures) | `svgimport.test.mjs` | 6 | 6 | 0 | 0 | 152 ms | ✅ |
| Printing & PDF | `imageformats.test.mjs` | 5 | 5 | 0 | 0 | 139 ms | ✅ |
| Printing & PDF | `pdf.test.mjs` | 6 | 6 | 0 | 0 | 274 ms | ✅ |
| BIM exchange (IFC, ifcXML) | `ifc.test.mjs` | 14 | 14 | 0 | 0 | 287 ms | ✅ |
| BIM exchange (IFC, ifcXML) | `ifcxml.test.mjs` | 11 | 11 | 0 | 0 | 643 ms | ✅ |
| Other BIM (SH3D, gbXML) | `gbxml.test.mjs` | 64 | 64 | 0 | 0 | 4.69 s | ✅ |
| Other BIM (SH3D, gbXML) | `interop.test.mjs` | 28 | 28 | 0 | 0 | 365 ms | ✅ |
| Other BIM (SH3D, gbXML) | `sh3d.test.mjs` | 22 | 22 | 0 | 0 | 456 ms | ✅ |
| 3D exchange | `export3d.test.mjs` | 18 | 18 | 0 | 0 | 301 ms | ✅ |
| 3D exchange | `modelformats.test.mjs` | 7 | 7 | 0 | 0 | 273 ms | ✅ |
| 3D exchange | `rhino3dm.test.mjs` | 9 | 8 | 0 | 1 | 320 ms | ✅ |
| Samples | `samples.test.mjs` | 363 | 363 | 0 | 0 | 3.80 s | ✅ |
| User interface (icons, widgets) | `autoicon.test.mjs` | 3 | 3 | 0 | 0 | 182 ms | ✅ |
| Start page & tutorial | `startlayout.test.mjs` | 12 | 12 | 0 | 0 | 303 ms | ✅ |
| Start page & tutorial | `templates.test.mjs` | 9 | 9 | 0 | 0 | 240 ms | ✅ |
| Localization | `i18n.test.mjs` | 5 | 5 | 0 | 0 | 290 ms | ✅ |
| Build & maintenance scripts | `clean.test.mjs` | 4 | 4 | 0 | 0 | 515 ms | ✅ |
| Desktop shell (Rust) | `src-tauri (cargo test)` | 21 | 21 | 0 | 0 | 7.21 s | ✅ |
| Other | `placement.test.mjs` | 6 | 6 | 0 | 0 | 226 ms | ✅ |
| Other | `plan3d.test.mjs` | 93 | 93 | 0 | 0 | 1.19 s | ✅ |
| Other | `plansamples.test.mjs` | 8 | 8 | 0 | 0 | 197 ms | ✅ |

## Tests / 테스트 목록

Slowest first within each category. / 분류마다 오래 걸린 순서입니다.

<details><summary><b>Core model & geometry</b> · 핵심 모델·기하 — 295 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | IFC: exported as their IFC classes and read back exactly (IFC4 and IFC2X3) | elements | 40 ms |
| ✅ | the undo history is capped at 200 steps | core | 29 ms |
| ✅ | every element builds 3D meshes without NaN | elements | 25 ms |
| ✅ | schedules, U-values and the cost estimate include the elements | elements | 6.7 ms |
| ✅ | DXF puts every element on its layer | elements | 4.5 ms |
| ✅ | roofBase is the top of the level's walls plus the roof offset | rooms | 3.5 ms |
| ✅ | plan drawing runs for every element and extends the bounds | elements | 3.2 ms |
| ✅ | wall profiles: sloped top and a top attached to the roof | elements | 3.0 ms |
| ✅ | a T made of three wall ends after splitting the through wall stays closed | walls | 3.0 ms |
| ✅ | linear and radial arrays copy the selection | elements | 2.5 ms |
| ✅ | new collections exist and are level collections | elements | 2.2 ms |
| ✅ | a missing or non-object input becomes a fresh project | core | 2.1 ms |
| ✅ | model check rules see the elements | elements | 1.9 ms |
| ✅ | normalize is idempotent and survives a save round trip | elements | 1.7 ms |
| ✅ | an old file without any element fields loads unchanged in its old parts | elements | 1.7 ms |
| ✅ | IFC: a foreign floor slab becomes a slab element | elements | 1.5 ms |
| ✅ | newProject has the expected shape | core | 1.5 ms |
| ✅ | hit test, box select, move, rotate, copy / paste | elements | 1.4 ms |
| ✅ | normalizeProject is idempotent | core | 1.2 ms |
| ✅ | uid makes distinct ids with the requested prefix | core | 1.1 ms |
| ✅ | theme espresso: body text is readable on the background (contrast ≥ 4.5) | core | 1.0 ms |
| ✅ | stairs by type: every riser equal, landing between the flights, rails | elements | 0.9 ms |
| ✅ | splitWall cuts a wall in two and moves later openings to the new part | walls | 0.9 ms |
| ✅ | a closed rectangle has four nodes and four edges (eight half-edges) | rooms | 0.8 ms |
| ✅ | uiTokens has every token for every theme | core | 0.8 ms |
| ✅ | wallFrame gives the length, the unit direction and the left normal | walls | 0.8 ms |
| ✅ | edit records a step that undo and redo replay | core | 0.7 ms |
| ✅ | serialize → parse round-trips a project unchanged | core | 0.7 ms |
| ✅ | only the active option is shown, built and checked | elements | 0.7 ms |
| ✅ | slabs: area without the openings and shafts, sloped tops | elements | 0.6 ms |
| ✅ | daylight in Seoul: long days in June, short days in December | core | 0.6 ms |
| ✅ | history lists undo labels oldest first and redo labels next first | core | 0.6 ms |
| ✅ | type parameters are copied onto their instances; a missing type unlinks | elements | 0.6 ms |
| ✅ | Seoul at the summer solstice: noon altitude ≈ 75.9° | core | 0.6 ms |
| ✅ | revision counts every change, preview and load | core | 0.6 ms |
| ✅ | the southern hemisphere mirrors the northern one | core | 0.5 ms |
| ✅ | one rectangle makes one room bounded by the inner wall faces | rooms | 0.5 ms |
| ✅ | solar noon in Seoul is about half an hour after 12:00 and the sun is due south | core | 0.5 ms |
| ✅ | per-edge roofs: gables on flat edges, hips on sloped ones, openings | elements | 0.5 ms |
| ✅ | 3D model assets are kept out of the undo snapshots | core | 0.5 ms |
| ✅ | a free wall is a rectangle with square ends | walls | 0.5 ms |
| ✅ | a T splits the through walls: six nodes, seven edges | rooms | 0.5 ms |
| ✅ | beams: ends, profiles, systems | elements | 0.5 ms |
| ✅ | dist, clamp, snap, deg, rad and normAngle behave like their maths | core | 0.5 ms |
| ✅ | railings: posts at corners, balusters between | elements | 0.4 ms |
| ✅ | rotPt with a zero or missing angle returns the point unchanged | core | 0.4 ms |
| ✅ | openingSpans clamps to the wall and sorts by position | walls | 0.4 ms |
| ✅ | ramps rise along their path | elements | 0.4 ms |
| ✅ | serialize writes the current project | core | 0.4 ms |
| ✅ | Seoul at the winter solstice: noon altitude ≈ 29° | core | 0.4 ms |
| ✅ | openingTags number doors and windows in plan order per level | core | 0.4 ms |
| ✅ | canvasColors gives a plan palette for every theme | core | 0.4 ms |
| ✅ | an empty object gets every collection and default | core | 0.4 ms |
| ✅ | a room on a slab keeps only its finish | elements | 0.4 ms |
| ✅ | cancel restores the snapshot taken by begin | core | 0.4 ms |
| ✅ | roomAtPoint picks the smallest room containing the point | rooms | 0.4 ms |
| ✅ | mergeCollinear joins two walls end to end and re-bases the openings | walls | 0.4 ms |
| ✅ | begin and commit make one drag one undo step | core | 0.4 ms |
| ✅ | there are 40 themes, 20 dark and 20 light, with unique ids and valid colours | core | 0.4 ms |
| ✅ | rooms and roofs with fewer than three points are dropped; points are cleaned | core | 0.4 ms |
| ✅ | dirty is set by edits and undo and cleared by markSaved | core | 0.4 ms |
| ✅ | begin twice keeps the first snapshot and label | core | 0.3 ms |
| ✅ | graphFaces of an open chain has no bounded face | rooms | 0.3 ms |
| ✅ | a new edit clears the redo stack | core | 0.3 ms |
| ✅ | bad values are clamped or dropped | elements | 0.3 ms |
| ✅ | a gable roof: overhang outline, ridge height, eaves and two gables | rooms | 0.3 ms |
| ✅ | splitWall on a slanted wall puts the cut point on the centre line | walls | 0.3 ms |
| ✅ | curtain wall grid: equal cells no wider than the spacing | elements | 0.3 ms |
| ✅ | openingSpans drops openings entirely past the wall end | walls | 0.3 ms |
| ✅ | ceilings default to 300 mm under the next floor | elements | 0.3 ms |
| ✅ | load replaces the project and clears history and dirty | core | 0.3 ms |
| ✅ | an L corner is mitred to the exact outer and inner corners | walls | 0.3 ms |
| ✅ | items on a missing level move to the first (lowest) level | core | 0.3 ms |
| ✅ | levels are cleaned, clamped and sorted by elevation | core | 0.3 ms |
| ✅ | openings of missing walls are dropped and the rest are cleaned | core | 0.3 ms |
| ✅ | unknown fields on the project and on items survive | core | 0.3 ms |
| ✅ | mass-model solids are cleaned and clamped | core | 0.3 ms |
| ✅ | openingSpans only lists the openings of that wall | walls | 0.3 ms |
| ✅ | findItem finds items of every collection, including grids | core | 0.3 ms |
| ✅ | onLevel, wallById, openingsOf, wallLength and levelOfItem | core | 0.3 ms |
| ✅ | a new store holds a normalized empty project and no history | core | 0.3 ms |
| ✅ | mergeCollinear merges a chain of three walls into one | walls | 0.3 ms |
| ✅ | parseProject rejects text that is not JSON | core | 0.3 ms |
| ✅ | openingTags keeps a tag the user typed | core | 0.3 ms |
| ✅ | a flat roof follows the polygon grown by the overhang | rooms | 0.3 ms |
| ✅ | wallPieces: no opening gives one piece | walls | 0.3 ms |
| ✅ | daylight near the pole: midnight sun in June and polar night in December | core | 0.3 ms |
| ✅ | splitWall refuses a cut at or near either end | walls | 0.3 ms |
| ✅ | parseProject accepts a file with only walls or only levels | core | 0.3 ms |
| ✅ | listeners can unsubscribe and a throwing listener does not stop the others | core | 0.3 ms |
| ✅ | roomArea, roomPerimeter and roomLabelPoint | rooms | 0.3 ms |
| ✅ | levelById, levelIndex and levelAbove | core | 0.3 ms |
| ✅ | randomTheme never returns the current theme | core | 0.2 ms |
| ✅ | wallPieces: two openings give three pieces | walls | 0.2 ms |
| ✅ | buildingOutlines ignores inner walls and handles several blocks | rooms | 0.2 ms |
| ✅ | the mitre does not depend on the drawing direction of the walls | walls | 0.2 ms |
| ✅ | a dividing wall (T) makes two rooms | rooms | 0.2 ms |
| ✅ | typed walls take their thickness from the layers and unknown types are removed | core | 0.2 ms |
| ✅ | furniture, stairs, columns and texts are clamped | core | 0.2 ms |
| ✅ | polygonArea is positive counter-clockwise and negative clockwise | core | 0.2 ms |
| ✅ | wallPieces: an opening at the very start leaves one solid piece | walls | 0.2 ms |
| ✅ | walls are clamped and get the default thickness | core | 0.2 ms |
| ✅ | mergeCollinear does not merge walls of different thickness or height | walls | 0.2 ms |
| ✅ | wallTypeThickness and wallTypeOf | core | 0.2 ms |
| ✅ | wallPieces: an opening at the very end leaves one solid piece | walls | 0.2 ms |
| ✅ | commit without a change records nothing | core | 0.2 ms |
| ✅ | wallAt returns the nearest wall under the point with its position | walls | 0.2 ms |
| ✅ | items without ids get ids from their collection letter | core | 0.2 ms |
| ✅ | graphFaces of a rectangle: one bounded face (positive) and the outer face (negative) | rooms | 0.2 ms |
| ✅ | mergeCollinear does not merge walls at an angle or running back | walls | 0.2 ms |
| ✅ | wallPieces: the solid area is right even when an opening reaches the end | walls | 0.2 ms |
| ✅ | a shaft that ends at the top floor leaves the roof whole; one that goes on above cuts it | elements | 0.2 ms |
| ✅ | edits during a pending drag fold into the drag step | core | 0.2 ms |
| ✅ | phases default to new and keep valid values | core | 0.2 ms |
| ✅ | wallPieces: one opening gives two pieces with a gap of its width | walls | 0.2 ms |
| ✅ | wallPieces: overlapping openings make one gap | walls | 0.2 ms |
| ✅ | a T junction is trimmed to the face of the through wall (3D, draw: false) | walls | 0.2 ms |
| ✅ | defaults are merged over the built-in ones | core | 0.2 ms |
| ✅ | triangulate covers the convex square exactly with n − 2 triangles | core | 0.2 ms |
| ✅ | a cross splits every wall at the centre: nine nodes, twelve edges | rooms | 0.2 ms |
| ✅ | custom themes are registered, looked up and reset | core | 0.2 ms |
| ✅ | an edit function returning false vetoes the step | core | 0.2 ms |
| ✅ | wallHeight uses the wall's own height, else its level's | core | 0.2 ms |
| ✅ | mergeCollinear does not merge across a T | walls | 0.2 ms |
| ✅ | graphFaces of a T: two bounded faces and one outer face | rooms | 0.2 ms |
| ✅ | slicePoly cuts the outline between two positions along the wall | walls | 0.2 ms |
| ✅ | labelPoint finds a point inside a U-shaped polygon whose centroid is in the notch | core | 0.2 ms |
| ✅ | contrast and mix follow the WCAG and linear-blend formulas | core | 0.2 ms |
| ✅ | costs, grids and wall types get defaults | core | 0.2 ms |
| ✅ | rotPt turns a point counter-clockwise in maths axes | core | 0.2 ms |
| ✅ | closestOnSegment clamps to the start before the segment | core | 0.2 ms |
| ✅ | wall types are cleaned: empty layers become concrete 200, thin layers 1 mm | core | 0.2 ms |
| ✅ | wallPoint and wallUV round-trip on a slanted wall | walls | 0.1 ms |
| ✅ | pitched roofs on a rotated box follow the box | rooms | 0.1 ms |
| ✅ | group, props and classification on elements survive normalization | core | 0.1 ms |
| ✅ | an L-shaped house makes one six-cornered room | rooms | 0.1 ms |
| ✅ | wallSnapPoints lists both ends and the middle of every wall | walls | 0.1 ms |
| ✅ | drawings on unknown layers create those layers | core | 0.1 ms |
| ✅ | minArea filters out small spaces | rooms | 0.1 ms |
| ✅ | offsetPolygon insets a counter-clockwise square by one distance | core | 0.1 ms |
| ✅ | the equinox noon altitude is the co-latitude | core | 0.1 ms |
| ✅ | a cross makes four rooms | rooms | 0.1 ms |
| ✅ | an edit returning undefined still counts | core | 0.1 ms |
| ✅ | orientedRect fits an axis-aligned rectangle | core | 0.1 ms |
| ✅ | clipHalfPlane keeps the part on the positive side | core | 0.1 ms |
| ✅ | buildingOutlines of an L follows the re-entrant corner | rooms | 0.1 ms |
| ✅ | buildingOutlines gives the outside faces of each block | rooms | 0.1 ms |
| ✅ | a merged wall still makes a clean outline | walls | 0.1 ms |
| ✅ | cleanup drops repeated and collinear points and rounds to 0.1 mm | rooms | 0.1 ms |
| ✅ | a three-way joint leaves no hole between the three outlines | walls | 0.1 ms |
| ✅ | room areas follow walls of different thickness exactly | rooms | 0.1 ms |
| ✅ | orientedRect fits a rotated rectangle and reports its angle | core | 0.1 ms |
| ✅ | wallUV measures along the wall and to its left | walls | 0.1 ms |
| ✅ | endsAt finds every wall end at a point | walls | 0.1 ms |
| ✅ | a hip roof: four faces, ridge length = length − width | rooms | 0.1 ms |
| ✅ | a slanted free wall keeps its thickness | walls | 0.1 ms |
| ✅ | convexHull drops interior and collinear points and runs counter-clockwise | core | 0.1 ms |
| ✅ | two separate buildings make separate rooms | rooms | 0.1 ms |
| ✅ | toWorld applies a quarter turn about the item origin | core | 0.1 ms |
| ✅ | toWorld and toLocal are inverse to each other | core | 0.1 ms |
| ✅ | room polygons are cleaned: no repeated or collinear corners | rooms | 0.1 ms |
| ✅ | bounds and unionBounds | core | 0.1 ms |
| ✅ | labelPoint returns the centroid when it lies inside | core | 0.1 ms |
| ✅ | mergeCollinear only looks at the requested level | walls | 0.1 ms |
| ✅ | rot 180 keeps the ridge direction | rooms | 0.1 ms |
| ✅ | the half-edges around a node are sorted by angle | rooms | 0.1 ms |
| ✅ | rot 90 swaps the ridge to the short side | rooms | 0.1 ms |
| ✅ | a T junction reaches the centre line of the through wall (plan, draw: true) | walls | 0.1 ms |
| ✅ | polygonCentroid of a rectangle, a triangle and an L | core | 0.1 ms |
| ✅ | a gable roof surface passes through the wall line at the base height | rooms | 0.1 ms |
| ✅ | a four-way joint meets in a square of the wall thickness | walls | 0.1 ms |
| ✅ | wallFrame of a zero-length wall does not divide by zero | walls | 0.1 ms |
| ✅ | a shed roof: one sloped face rising across the width | rooms | 0.1 ms |
| ✅ | the default dark and light themes exist | core | 0.1 ms |
| ✅ | newLevel has an id, a name, an elevation, a height and a slab | core | 0.1 ms |
| ✅ | a wall end 1 mm short of another wall still connects | rooms | 0.1 ms |
| ✅ | snapAngle rounds to the nearest step | core | 0.1 ms |
| ✅ | rotPt keeps the distance from the origin | core | 0.1 ms |
| ✅ | parseProject rejects JSON that is not a project | core | 0.1 ms |
| ✅ | closestOnSegment clamps to the end past the segment | core | 0.1 ms |
| ✅ | roomAtPoint picks the right room of a T | rooms | 0.1 ms |
| ✅ | two new projects do not share wall types or levels | core | 0.1 ms |
| ✅ | toWorld of an item without rot only translates | core | 0.1 ms |
| ✅ | two walls crossing without ends at the crossing are split there | rooms | 0.1 ms |
| ✅ | a flat roof keeps the polygon's own orientation (clockwise input) | rooms | 0.1 ms |
| ✅ | a closed rectangle of walls tiles the exact frame area | walls | 0.1 ms |
| ✅ | triangulate covers the convex hexagon exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | labelPoint stays inside a C-shaped polygon opening to the side | core | 0.1 ms |
| ✅ | constants describe the format and the collections | core | 0.1 ms |
| ✅ | the sun is below the horizon at midnight and azimuths stay in 0…360 | core | 0.1 ms |
| ✅ | fmtLen in millimetres rounds to whole millimetres | core | 0.1 ms |
| ✅ | the drawing direction of the walls does not matter | rooms | 0.1 ms |
| ✅ | a flat roof's top follows its own thickness, 200 mm by default | rooms | 0.1 ms |
| ✅ | offsetPolygon insets a clockwise square into the polygon too | core | 0.1 ms |
| ✅ | a very sharp angle falls back to square ends instead of a long spike | walls | 0.1 ms |
| ✅ | walls of different thickness meet at the corner of both faces | walls | 0.1 ms |
| ✅ | polygonPerimeter of closed and open outlines | core | 0.1 ms |
| ✅ | a T at the end of the stem is trimmed too | walls | 0.1 ms |
| ✅ | wallAt honours the thickness and the margin | walls | 0.1 ms |
| ✅ | a three-way joint mitres the two corners, keeps the straight face and reaches the joint point | walls | 0.1 ms |
| ✅ | every wall gets an outline and the map is keyed by id | walls | 0.1 ms |
| ✅ | a hip roof on a square comes to a point | rooms | 0.1 ms |
| ✅ | uiTokens picks white accent text on dark accents and dark text on light accents | core | 0.1 ms |
| ✅ | triangulate covers the concave L exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | roomAtPoint finds small rooms below the normal minimum area | rooms | 0.1 ms |
| ✅ | a T from a slanted through wall ends on that wall's face | walls | 0.1 ms |
| ✅ | a four-way joint leaves no hole in the crossing square | walls | 0.1 ms |
| ✅ | suggestRoomName goes by size | rooms | 0.1 ms |
| ✅ | a roof without overhang or pitch fields still builds | rooms | 0.1 ms |
| ✅ | closestOnSegment projects onto the middle of the segment | core | 0.1 ms |
| ✅ | a pitched roof with zero pitch is flat | rooms | 0.1 ms |
| ✅ | sunPosition accepts a timestamp as well as a Date | core | 0.1 ms |
| ✅ | the default wall types are as thick as their layers say | core | 0.1 ms |
| ✅ | segIntersect reports a proper crossing with both parameters | core | 0.1 ms |
| ✅ | walls that do not close make no room | rooms | 0.1 ms |
| ✅ | polygonCentroid of a degenerate polygon falls back to the vertex average | core | 0.1 ms |
| ✅ | clipHalfPlane keeps everything or nothing when the line misses | core | 0.1 ms |
| ✅ | offsetPolygon applies per-edge distances (counter-clockwise) | core | 0.1 ms |
| ✅ | ends within the 2 mm joint tolerance are joined | walls | 0.1 ms |
| ✅ | fitOpening keeps an opening inside its wall | walls | 0.1 ms |
| ✅ | triangulate covers the concave U exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | cleanup keeps a triangle and real corners | rooms | 0.1 ms |
| ✅ | a gap larger than the tolerance keeps the outline open | rooms | 0.1 ms |
| ✅ | lineIntersect finds the crossing of two infinite lines | core | 0.1 ms |
| ✅ | convexHull does not modify its input | core | 0.1 ms |
| ✅ | two walls crossing in the middle stay full rectangles | walls | 0.1 ms |
| ✅ | a collinear continuation is cut square at the shared point | walls | 0.1 ms |
| ✅ | slicePoly works on a slanted wall | walls | 0.1 ms |
| ✅ | orientedRect swaps length and width so the long side wins | core | 0.1 ms |
| ✅ | buildingOutlines drops lone walls (less than 1 m² enclosed) | rooms | 0.0 ms |
| ✅ | segIntersect reports touching segments (T and shared end) | core | 0.0 ms |
| ✅ | orientedRect of nothing is an empty rectangle | core | 0.0 ms |
| ✅ | offsetPolygon bevels a very sharp corner instead of spiking | core | 0.0 ms |
| ✅ | triangulate covers the clockwise U exactly with n − 2 triangles | core | 0.0 ms |
| ✅ | theme midnight: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | offsetPolygon applies per-edge distances (clockwise) | core | 0.0 ms |
| ✅ | offsetPolygon with a negative distance grows the polygon | core | 0.0 ms |
| ✅ | pointInPolygon distinguishes inside, outside and the notch | core | 0.0 ms |
| ✅ | cleanup removes a point in the middle of a straight edge | rooms | 0.0 ms |
| ✅ | suggestRoomName passes the name through the translator | rooms | 0.0 ms |
| ✅ | the morning sun is in the east and the afternoon sun in the west | core | 0.0 ms |
| ✅ | offsetPolygon leaves fewer than three points alone | core | 0.0 ms |
| ✅ | segIntersect returns null when segments miss or are parallel | core | 0.0 ms |
| ✅ | fmtLen in feet and inches | core | 0.0 ms |
| ✅ | pointSegDist is the distance part of closestOnSegment | core | 0.0 ms |
| ✅ | triangulate of fewer than three points is empty | core | 0.0 ms |
| ✅ | offsetPolygon of an L keeps the re-entrant corner exact | core | 0.0 ms |
| ✅ | triangulate covers the clockwise L exactly with n − 2 triangles | core | 0.0 ms |
| ✅ | fmtArea in square metres and square feet | core | 0.0 ms |
| ✅ | theme deep-sea: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | closestOnSegment of a degenerate segment returns its single point | core | 0.0 ms |
| ✅ | convexHull of fewer than three points returns them sorted | core | 0.0 ms |
| ✅ | triangulate of a triangle is that triangle | core | 0.0 ms |
| ✅ | fmtLen in centimetres and metres | core | 0.0 ms |
| ✅ | theme graphite: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | lineIntersect returns null for parallel and coincident lines | core | 0.0 ms |
| ✅ | theme solarized-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | snapAngle leaves an angle alone outside the tolerance | core | 0.0 ms |
| ✅ | fmtLen in feet never shows 12 inches | core | 0.0 ms |
| ✅ | fmtLen of a non-finite value is a dash | core | 0.0 ms |
| ✅ | theme sky: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme nord: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme mocha: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme slate: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme sand: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme cyberpunk: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme dracula: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme crimson: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme oceanic: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme hc-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme aurora: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme forest: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme monokai: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme tokyo-night: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme amethyst: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme lavender: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme mint: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme hc-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme solarized-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme daylight: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme arctic: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme nord-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme one-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme gruvbox-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme github-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme latte: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme gruvbox-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme paper: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme peach: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme sakura: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme lime: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme rose: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme stone: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme ivory: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme cobalt-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |

</details>

<details><summary><b>Plan editing</b> · 평면 편집 — 135 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | draws every level of 37-u-shaped-apartments.myarch in every wall style and phase filter | plan | 568 ms |
| ✅ | draws every level of 29-hotel.myarch in every wall style and phase filter | plan | 453 ms |
| ✅ | draws every level of 32-residential-complex.myarch in every wall style and phase filter | plan | 367 ms |
| ✅ | draws every level of 35-courtyard-school.myarch in every wall style and phase filter | plan | 299 ms |
| ✅ | draws every level of 34-general-hospital.myarch in every wall style and phase filter | plan | 274 ms |
| ✅ | draws every level of 10-office-tower.myarch in every wall style and phase filter | plan | 253 ms |
| ✅ | every sample: no problems added, no door or window lost, no room lost | wallcleanup | 231 ms |
| ✅ | draws every level of 11-mixed-use.myarch in every wall style and phase filter | plan | 166 ms |
| ✅ | draws every level of 33-atrium-office.myarch in every wall style and phase filter | plan | 132 ms |
| ✅ | draws every level of 36-terraced-office.myarch in every wall style and phase filter | plan | 113 ms |
| ✅ | draws every level of 30-university-library.myarch in every wall style and phase filter | plan | 59 ms |
| ✅ | draws every level of 13-school.myarch in every wall style and phase filter | plan | 53 ms |
| ✅ | draws every level of 12-hospital.myarch in every wall style and phase filter | plan | 35 ms |
| ✅ | draws every level of 01-studio.myarch in every wall style and phase filter | plan | 28 ms |
| ✅ | draws every level of 08-apartment-block.myarch in every wall style and phase filter | plan | 26 ms |
| ✅ | draws every level of 23-bridges.myarch in every wall style and phase filter | plan | 25 ms |
| ✅ | draws every level of 16-modern-villa.myarch in every wall style and phase filter | plan | 23 ms |
| ✅ | draws every level of 03-two-storey-house.myarch in every wall style and phase filter | plan | 22 ms |
| ✅ | draws every level of 31-sports-centre.myarch in every wall style and phase filter | plan | 22 ms |
| ✅ | draws every level of 17-townhouse.myarch in every wall style and phase filter | plan | 22 ms |
| ✅ | draws every level of 19-duplex.myarch in every wall style and phase filter | plan | 20 ms |
| ✅ | draws every level of 40-penthouse.myarch in every wall style and phase filter | plan | 20 ms |
| ✅ | draws every level of 02-two-bedroom.myarch in every wall style and phase filter | plan | 20 ms |
| ✅ | draws every level of 38-museum.myarch in every wall style and phase filter | plan | 17 ms |
| ✅ | draws every level of 14-courtyard-house.myarch in every wall style and phase filter | plan | 17 ms |
| ✅ | draws every level of 15-sketchup-complex.myarch in every wall style and phase filter | plan | 16 ms |
| ✅ | draws every level of 18-modern-farmhouse.myarch in every wall style and phase filter | plan | 14 ms |
| ✅ | draws every level of 21-interior-design.myarch in every wall style and phase filter | plan | 14 ms |
| ✅ | draws every level of 06-renovation-bim.myarch in every wall style and phase filter | plan | 13 ms |
| ✅ | draws every level of 04-small-office.myarch in every wall style and phase filter | plan | 11 ms |
| ✅ | draws every level of 39-cafe-bistro.myarch in every wall style and phase filter | plan | 8.3 ms |
| ✅ | a sample plan renders to well-formed SVG through SvgContext | plan | 7.6 ms |
| ✅ | a messy plan comes out closed, square and merged; the door stays put; settings and room names are kept | wallcleanup | 6.6 ms |
| ✅ | draws every level of 22-lattice-towers.myarch in every wall style and phase filter | plan | 5.6 ms |
| ✅ | an opening wins over the wall it sits in | plan | 5.3 ms |
| ✅ | draws every level of 05-wooden-cabin.myarch in every wall style and phase filter | plan | 4.5 ms |
| ✅ | draws every level of 20-compact-house.myarch in every wall style and phase filter | plan | 3.9 ms |
| ✅ | undo and redo restore the project and name the step | store | 3.8 ms |
| ✅ | draws every level of 09-cad-tracing.myarch in every wall style and phase filter | plan | 3.5 ms |
| ✅ | tracing images are pooled: snapshots hold a short reference, undo restores the picture | store | 3.5 ms |
| ✅ | draws every level of 27-extradosed-bridge.myarch in every wall style and phase filter | plan | 3.5 ms |
| ✅ | starts with one untouched tab | docs | 3.5 ms |
| ✅ | draws every level of 07-massing-study.myarch in every wall style and phase filter | plan | 3.4 ms |
| ✅ | draws every level of 26-harp-cable-stayed-bridge.myarch in every wall style and phase filter | plan | 3.1 ms |
| ✅ | draws every level of 25-haunched-girder-bridge.myarch in every wall style and phase filter | plan | 2.9 ms |
| ✅ | draws every level of 24-deck-arch-bridge.myarch in every wall style and phase filter | plan | 2.9 ms |
| ✅ | each tab keeps its own project, undo stack and dirty flag | docs | 2.1 ms |
| ✅ | draws every level of 28-stress-ribbon-footbridge.myarch in every wall style and phase filter | plan | 2.0 ms |
| ✅ | handles of a selected wall come first | plan | 1.6 ms |
| ✅ | walls set differently are not merged; a clean level changes nothing | wallcleanup | 1.6 ms |
| ✅ | mass models: hit, selected, moved, scaled and drawn with their taper | plan | 1.2 ms |
| ✅ | furniture wins over the room it stands in; the smaller room wins over the bigger | plan | 1.0 ms |
| ✅ | planBounds covers a level, every level, or nothing | plan | 0.9 ms |
| ✅ | an edit marks only the active tab dirty | docs | 0.8 ms |
| ✅ | drawPlan draws every kind of item of the test scene | plan | 0.7 ms |
| ✅ | closing: the active tab hands over to its right, then left neighbour; the last leaves a blank tab | docs | 0.7 ms |
| ✅ | grid bubbles and grid lines are hit on every level | plan | 0.7 ms |
| ✅ | new tabs open right after the active one | docs | 0.7 ms |
| ✅ | change events fire for edits, undo and redo; revision increases | store | 0.6 ms |
| ✅ | move, neighbour (wrapping) and find by path | docs | 0.6 ms |
| ✅ | drawings: arcs only along their sweep, circles on the rim, polylines on their segments | plan | 0.6 ms |
| ✅ | moving a wall stretches the walls joined to it | plan | 0.6 ms |
| ✅ | a drag (begin / preview / commit) is one undo step | store | 0.6 ms |
| ✅ | a new edit clears the redo stack | store | 0.6 ms |
| ✅ | pasting gives new ids, the target level and the offset | plan | 0.6 ms |
| ✅ | the revision only grows across switches | docs | 0.5 ms |
| ✅ | selectionCentre is the middle of the selection's bounding box | plan | 0.5 ms |
| ✅ | a wall is hit within half its thickness plus the tolerance | plan | 0.5 ms |
| ✅ | closing an inactive tab leaves the store alone | docs | 0.5 ms |
| ✅ | options: nothing squared or merged when switched off; rooms left alone on request | wallcleanup | 0.5 ms |
| ✅ | a window selects only what is fully inside | plan | 0.5 ms |
| ✅ | opening another document empties the image pool | store | 0.5 ms |
| ✅ | wall ends attract the cursor first | plan | 0.5 ms |
| ✅ | pasting dimensions, texts, drawings and labels moves every point | plan | 0.5 ms |
| ✅ | scaleItems scales positions and sizes about the centre | plan | 0.5 ms |
| ✅ | rotating nothing does nothing | plan | 0.4 ms |
| ✅ | every kind of item moves by the offset | plan | 0.4 ms |
| ✅ | text notes are hit inside their text box | plan | 0.4 ms |
| ✅ | openings on a stretched wall are kept inside it | plan | 0.4 ms |
| ✅ | handles of selected rooms, roofs and dimensions | plan | 0.4 ms |
| ✅ | groupMembers selects a whole group with the openings of its walls | plan | 0.4 ms |
| ✅ | copying a wall brings its openings and the selection centre | plan | 0.4 ms |
| ✅ | moveWallEnd moves every wall end joined at that point | plan | 0.4 ms |
| ✅ | rotateItems turns furniture, columns, stairs, texts, arcs and underlays | plan | 0.4 ms |
| ✅ | mirroring keeps rooms counter-clockwise and flips dimensions and arcs | plan | 0.3 ms |
| ✅ | image pools are per tab (loading one tab does not clear another's) | docs | 0.3 ms |
| ✅ | drawing from a point constrains to 45° steps and grid lengths | plan | 0.3 ms |
| ✅ | grids are drawn on every level and can be hidden | plan | 0.3 ms |
| ✅ | a counter-clockwise arc covers the other part of the circle | plan | 0.3 ms |
| ✅ | underlays and roof overhangs are hit last | plan | 0.3 ms |
| ✅ | drawWalls returns the outlines and the solid pieces | plan | 0.3 ms |
| ✅ | mirroring furniture flips its rotation | plan | 0.3 ms |
| ✅ | columns and stairs are hit inside their outline | plan | 0.3 ms |
| ✅ | the nearest target wins and excluded items are skipped | plan | 0.3 ms |
| ✅ | with endpoints off the cursor projects onto the wall, on the grid | plan | 0.3 ms |
| ✅ | mirroring about y moves points across the horizontal centre line | plan | 0.3 ms |
| ✅ | mirroring a wall flips its door to the same physical side | plan | 0.3 ms |
| ✅ | a dimension is hit on its offset line | plan | 0.3 ms |
| ✅ | circles and arcs are tested by their bounding square | plan | 0.3 ms |
| ✅ | plain numbers are millimetres | plan | 0.3 ms |
| ✅ | an opening moved on its own slides along its wall, clamped | plan | 0.3 ms |
| ✅ | room vertices and column centres are snap targets | plan | 0.3 ms |
| ✅ | deleting a wall deletes its openings; grids can be deleted | plan | 0.3 ms |
| ✅ | drawings on hidden layers are not hit | plan | 0.3 ms |
| ✅ | an opening copied without its wall is not pasted | plan | 0.3 ms |
| ✅ | moving a wall does not drag walls on other levels | plan | 0.3 ms |
| ✅ | away from everything the cursor snaps to the grid | plan | 0.3 ms |
| ✅ | items on other levels are ignored and empty space hits nothing | plan | 0.3 ms |
| ✅ | planBounds includes circles by their radius and ignores non-finite points | plan | 0.3 ms |
| ✅ | a crossing box selects what it touches | plan | 0.3 ms |
| ✅ | rotateItems turns walls about the selection centre | plan | 0.3 ms |
| ✅ | with stretch off (Alt) joined walls stay | plan | 0.2 ms |
| ✅ | an opening moved with its wall keeps its position on the wall | plan | 0.2 ms |
| ✅ | a big window selects every kind of item on the level | plan | 0.2 ms |
| ✅ | moveWallEnd keeps openings inside the shortened wall | plan | 0.2 ms |
| ✅ | copying nothing gives an empty clipboard centred at the origin | plan | 0.2 ms |
| ✅ | deleting only an opening keeps its wall | plan | 0.2 ms |
| ✅ | ortho never runs backwards past the start point | plan | 0.2 ms |
| ✅ | a ray that meets a wall centre line ends exactly on it | plan | 0.2 ms |
| ✅ | ortho is off without a start point or with ortho: false | plan | 0.2 ms |
| ✅ | ortho lines up with another wall's end and returns the guide | plan | 0.2 ms |
| ✅ | rotateItems about a given centre, snapped to the grid | plan | 0.2 ms |
| ✅ | SvgContext escapes text and keeps the transform stack | plan | 0.1 ms |
| ✅ | on-wall snapping is clamped to the wall's length | plan | 0.1 ms |
| ✅ | the dark and light plan themes define the same colours | plan | 0.1 ms |
| ✅ | stairGeometry gives the outline of a rotated stair | plan | 0.1 ms |
| ✅ | roomColor uses the room's colour, else its floor material | plan | 0.1 ms |
| ✅ | phaseVisible for every filter | plan | 0.1 ms |
| ✅ | pointAtLength walks from a point towards another | plan | 0.1 ms |
| ✅ | metres, centimetres and a decimal comma | plan | 0.1 ms |
| ✅ | dimensionGeometry offsets the line along its left normal | plan | 0.1 ms |
| ✅ | feet and inches | plan | 0.1 ms |
| ✅ | bad input gives null | plan | 0.0 ms |
| ✅ | a length with an angle | plan | 0.0 ms |
| ✅ | gridBubble sits beyond each end of the grid line | plan | 0.0 ms |

</details>

<details><summary><b>Checks & schedules</b> · 검사·집계 — 117 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | Fix all: a messy flat comes out with nothing left that a repair can settle | fixes | 13 ms |
| ✅ | door-blocked: a repair that removes it and adds nothing | fixes | 6.3 ms |
| ✅ | lists every opening with its tag, sorted by tag | schedule | 6.0 ms |
| ✅ | an empty project has no issues | check | 4.8 ms |
| ✅ | lists each room with level, area and perimeter | schedule | 4.4 ms |
| ✅ | furniture-window: a repair that removes it and adds nothing | fixes | 3.0 ms |
| ✅ | room-no-door: a repair that removes it and adds nothing | fixes | 2.7 ms |
| ✅ | wall-gap: a repair that removes it and adds nothing | fixes | 2.2 ms |
| ✅ | door-door: a repair that removes it and adds nothing | fixes | 1.8 ms |
| ✅ | furniture-outside: the trigger fixture raises it and the near miss does not | check | 1.3 ms |
| ✅ | wall-short: the trigger fixture raises it and the near miss does not | check | 1.2 ms |
| ✅ | goes level by level and fills missing names and floors with empty strings | schedule | 1.1 ms |
| ✅ | opening-overlap: the trigger fixture raises it and the near miss does not | check | 1.0 ms |
| ✅ | room-no-door: the trigger fixture raises it and the near miss does not | check | 1.0 ms |
| ✅ | furniture-outside: a repair that removes it and adds nothing | fixes | 1.0 ms |
| ✅ | door-door: the trigger fixture raises it and the near miss does not | check | 1.0 ms |
| ✅ | clash-furniture: the trigger fixture raises it and the near miss does not | check | 0.9 ms |
| ✅ | wall-duplicate: the trigger fixture raises it and the near miss does not | check | 0.8 ms |
| ✅ | opening-outside: the trigger fixture raises it and the near miss does not | check | 0.8 ms |
| ✅ | door-blocked: the trigger fixture raises it and the near miss does not | check | 0.8 ms |
| ✅ | door-wall: a repair that removes it and adds nothing | fixes | 0.8 ms |
| ✅ | stair-riser: the trigger fixture raises it and the near miss does not | check | 0.8 ms |
| ✅ | opening-outside: a repair that removes it and adds nothing | fixes | 0.8 ms |
| ✅ | furniture-wall: a repair that removes it and adds nothing | fixes | 0.7 ms |
| ✅ | opening-overlap: a repair that removes it and adds nothing | fixes | 0.7 ms |
| ✅ | the box building's numbers | schedule | 0.7 ms |
| ✅ | door-narrow: a repair that removes it and adds nothing | fixes | 0.7 ms |
| ✅ | every check has advice in words | fixes | 0.7 ms |
| ✅ | slab-overlap: the trigger fixture raises it and the near miss does not | check | 0.7 ms |
| ✅ | CHECKS lists unique codes with descriptions | check | 0.7 ms |
| ✅ | two levels and projectTotals | schedule | 0.7 ms |
| ✅ | clash-furniture: a repair that removes it and adds nothing | fixes | 0.6 ms |
| ✅ | sliding and garage doors, rugs and low furniture never block a swing | check | 0.6 ms |
| ✅ | furniture-window: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | wall-short: a repair that removes it and adds nothing | fixes | 0.6 ms |
| ✅ | ramp-steep: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | prices walls, floors, doors and windows of the box | schedule | 0.6 ms |
| ✅ | door-wall: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | a door far from the room does not count | check | 0.5 ms |
| ✅ | groups typed walls by type and untyped walls by thickness | schedule | 0.5 ms |
| ✅ | opening-tall: a repair that removes it and adds nothing | fixes | 0.5 ms |
| ✅ | furniture-wall: the trigger fixture raises it and the near miss does not | check | 0.5 ms |
| ✅ | custom unit prices and currency, and a project without costs | schedule | 0.5 ms |
| ✅ | door-blocked follows the hinge side | check | 0.5 ms |
| ✅ | room-small: the trigger fixture raises it and the near miss does not | check | 0.5 ms |
| ✅ | wall-gap: the trigger fixture raises it and the near miss does not | check | 0.5 ms |
| ✅ | shaft-empty: the trigger fixture raises it and the near miss does not | check | 0.5 ms |
| ✅ | clash-column: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | roofs by plan area, stairs, columns and openings per piece | schedule | 0.4 ms |
| ✅ | stair-top: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | furniture uses each item's own price, else the unit price | schedule | 0.4 ms |
| ✅ | wall-short scales with the thickness (75 %) and has a 50 mm floor | check | 0.4 ms |
| ✅ | opening-tall: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | an opening whose wall is gone shows no level and no thickness | schedule | 0.4 ms |
| ✅ | beam-short: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | opening-tall uses the wall's own height | check | 0.4 ms |
| ✅ | room-overlap: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | a window is not a way in, but an opening is | check | 0.4 ms |
| ✅ | a full room schedule exports one row per room | schedule | 0.4 ms |
| ✅ | slab-hole: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | door-narrow: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | no repair for a stair leading nowhere: null, project unchanged, the advice instead | fixes | 0.4 ms |
| ✅ | clash-stair: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | opening-outside at the far end and within the 1 mm slack | check | 0.3 ms |
| ✅ | openings past the wall end only remove the part on the wall | schedule | 0.3 ms |
| ✅ | furniture at different heights, rugs and low items do not clash | check | 0.3 ms |
| ✅ | rugs, high furniture and furniture in an opening are not in a wall | check | 0.3 ms |
| ✅ | wall-short is a warning with the length, at the wall's middle | check | 0.3 ms |
| ✅ | every issue has the documented fields | check | 0.3 ms |
| ✅ | chairs tucked under a table are not a clash | check | 0.3 ms |
| ✅ | railing-low: the trigger fixture raises it and the near miss does not | check | 0.3 ms |
| ✅ | door-blocked names the door and points at the furniture | check | 0.3 ms |
| ✅ | walls with their own height count that height | schedule | 0.3 ms |
| ✅ | furniture-wall is a warning with the furniture and the wall | check | 0.3 ms |
| ✅ | a window above the wall top only removes the part inside the wall | schedule | 0.3 ms |
| ✅ | a user tag sorts with the others | schedule | 0.3 ms |
| ✅ | wall-duplicate ignores parallel walls apart and short overlaps | check | 0.3 ms |
| ✅ | rows are sorted by area, largest first | schedule | 0.3 ms |
| ✅ | room-no-door names the room | check | 0.3 ms |
| ✅ | a stair inside the room is a way in | check | 0.3 ms |
| ✅ | opening-outside names the opening by its tag | check | 0.3 ms |
| ✅ | demolished items are left out and existing ones cost nothing | schedule | 0.3 ms |
| ✅ | runCheck does not change the project | check | 0.3 ms |
| ✅ | an empty project has no rows | schedule | 0.3 ms |
| ✅ | opening-overlap names both openings | check | 0.2 ms |
| ✅ | room-small reports the name and the area in m² | check | 0.2 ms |
| ✅ | rotated furniture is tested by its rotated footprint | check | 0.2 ms |
| ✅ | wall-duplicate is an error with the overlap length at its middle | check | 0.2 ms |
| ✅ | opening-overlap between a door and a window, in any order | check | 0.2 ms |
| ✅ | opening-tall reports the head height and the wall height | check | 0.2 ms |
| ✅ | stair-top is a warning on the top level | check | 0.2 ms |
| ✅ | clash-column names the blocked opening | check | 0.2 ms |
| ✅ | room-overlap names both rooms at the second room's centre | check | 0.2 ms |
| ✅ | clash-stair is an error naming the stair and the wall | check | 0.2 ms |
| ✅ | clash-stair follows the stair's rotation | check | 0.2 ms |
| ✅ | starts with a UTF-8 BOM and ends every line with CRLF | schedule | 0.2 ms |
| ✅ | room-small stops at 1.5 m² | check | 0.2 ms |
| ✅ | an empty project sums to zero | schedule | 0.2 ms |
| ✅ | furniture in a wall is reported once even across several walls | check | 0.2 ms |
| ✅ | walls on different levels never overlap each other | check | 0.2 ms |
| ✅ | clash-furniture is a warning at the midpoint of the two pieces | check | 0.2 ms |
| ✅ | door-blocked follows the swing side | check | 0.2 ms |
| ✅ | openings that just touch do not overlap | check | 0.2 ms |
| ✅ | issues are reported per level | check | 0.2 ms |
| ✅ | wall-duplicate also finds walls drawn the other way | check | 0.2 ms |
| ✅ | an unnamed room is called — | check | 0.2 ms |
| ✅ | furniture touching a wall face is fine | check | 0.2 ms |
| ✅ | room-no-door needs walls on the level | check | 0.1 ms |
| ✅ | a column in a window is a clash too | check | 0.1 ms |
| ✅ | every check code has a test fixture | check | 0.1 ms |
| ✅ | rooms on different levels do not overlap | check | 0.1 ms |
| ✅ | a stair on the upper of two levels leads nowhere either | check | 0.1 ms |
| ✅ | room-overlap finds a room inside another | check | 0.1 ms |
| ✅ | missing values become empty fields and Korean text is kept | schedule | 0.1 ms |
| ✅ | numbers: integers as they are, others with two decimals | schedule | 0.1 ms |
| ✅ | quotes fields with commas, quotes, semicolons and line breaks | schedule | 0.1 ms |
| ✅ | headers are escaped too and no rows gives just the header | schedule | 0.1 ms |

</details>

<details><summary><b>Views, sheets & annotation</b> · 뷰·시트·주석 — 36 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every sample generates a section and an elevation without errors | views | 1.65 s |
| ✅ | the sheet renders to SVG with its title block and the generated section | views | 20 ms |
| ✅ | an elevation sees the wall face and hides the column behind it | views | 19 ms |
| ✅ | DXF of the section view and of the sheet | views | 9.7 ms |
| ✅ | sorting, filters, grouping with subtotals, totals | views | 5.7 ms |
| ✅ | fine: one strip per layer, exact widths and materials | views | 5.1 ms |
| ✅ | layer boundaries are lines between different materials | views | 4.6 ms |
| ✅ | a ceiling plan cuts the walls at the cut height (plan orientation) | views | 4.1 ms |
| ✅ | the far clip drops what lies beyond it | views | 3.8 ms |
| ✅ | medium: the wall reads as its structure layer, one polygon | views | 2.8 ms |
| ✅ | a crop clips the poché | views | 2.1 ms |
| ✅ | flipping looks the other way (the column is behind the viewer) | views | 1.6 ms |
| ✅ | old files get the implicit level views and one sheet per level with its plan | views | 1.5 ms |
| ✅ | every tool, command label and category name has a Korean translation | views | 0.8 ms |
| ✅ | the frame looks to the left of the drawn line | views | 0.8 ms |
| ✅ | room tags show name and area | views | 0.6 ms |
| ✅ | sections show as markers on plans and are hit by their heads | views | 0.5 ms |
| ✅ | hit testing and moving | views | 0.4 ms |
| ✅ | editable cells write back to the model; CSV exports | views | 0.4 ms |
| ✅ | plan views hide categories and windows above the cut | views | 0.4 ms |
| ✅ | calculated values and formulas | views | 0.3 ms |
| ✅ | dangling references are dropped | views | 0.3 ms |
| ✅ | a viewport is the view's crop at its scale, centred on its point | views | 0.3 ms |
| ✅ | sheet numbering, detail numbers, placement and drawing list | views | 0.3 ms |
| ✅ | ensureView stores an implicit view; templates apply | views | 0.2 ms |
| ✅ | door tags show the mark, size fields read through | views | 0.2 ms |
| ✅ | hatch lines stay inside the polygon | views | 0.2 ms |
| ✅ | free placement does not overlap existing viewports | views | 0.2 ms |
| ✅ | the cut wall is one exact rectangle (poché) | views | 0.2 ms |
| ✅ | the cut outline is drawn heavy and complete | views | 0.1 ms |
| ✅ | wall tags show the type or thickness | views | 0.1 ms |
| ✅ | chaining and merging helpers | views | 0.1 ms |
| ✅ | the column beyond is projected exactly, with no triangulation diagonals | views | 0.1 ms |
| ✅ | revisions on a sheet: listed and from clouds in its views | views | 0.1 ms |
| ✅ | templates leave unknown fields blank; missing targets show ? | views | 0.1 ms |
| ✅ | tags can find the elements in the view | views | 0.1 ms |

</details>

<details><summary><b>3D model</b> · 3D 모델 — 3046 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | an imported model replaces its placeholder once loaded | view3d | 6.82 s |
| ✅ | moving furniture again and again: kept and patched batches stay exact | perf3d | 1.32 s |
| ✅ | 37-u-shaped-apartments.myarch | tour | 1.27 s |
| ✅ | every catalogue item builds one mesh per surface (and one per glowing part), inside its box | view3d | 946 ms |
| ✅ | 29-hotel.myarch | tour | 689 ms |
| ✅ | 35-courtyard-school.myarch | tour | 387 ms |
| ✅ | 32-residential-complex.myarch | tour | 355 ms |
| ✅ | the sample 37-u-shaped-apartments.myarch builds with one tagged mesh per item | view3d | 326 ms |
| ✅ | the sample 10-office-tower.myarch builds with one tagged mesh per item | view3d | 267 ms |
| ✅ | moving furniture rebuilds only its level, and the result equals a fresh build | perf3d | 261 ms |
| ✅ | the sample 35-courtyard-school.myarch builds with one tagged mesh per item | view3d | 239 ms |
| ✅ | furniture parts, frames and door leaves share a handful of geometries | perf3d | 232 ms |
| ✅ | the sample 29-hotel.myarch builds with one tagged mesh per item | view3d | 232 ms |
| ✅ | 34-general-hospital.myarch | tour | 229 ms |
| ✅ | the sample 32-residential-complex.myarch builds with one tagged mesh per item | view3d | 191 ms |
| ✅ | the sample 36-terraced-office.myarch builds with one tagged mesh per item | view3d | 155 ms |
| ✅ | the sample 33-atrium-office.myarch builds with one tagged mesh per item | view3d | 139 ms |
| ✅ | the sample 34-general-hospital.myarch builds with one tagged mesh per item | view3d | 136 ms |
| ✅ | repeated meshes become instances: far fewer draw calls | perf3d | 134 ms |
| ✅ | 10-office-tower.myarch | tour | 134 ms |
| ✅ | a shadow frame draws every instance in full; the next frame culls again | perf3d | 129 ms |
| ✅ | seen whole from afar: hardly anything left out, most drawn with the coarse copy | perf3d | 126 ms |
| ✅ | close up: what is out of view is not drawn, what is near is drawn in full | perf3d | 114 ms |
| ✅ | 33-atrium-office.myarch | tour | 108 ms |
| ✅ | 11-mixed-use.myarch | tour | 97 ms |
| ✅ | the sample 11-mixed-use.myarch builds with one tagged mesh per item | view3d | 97 ms |
| ✅ | the sample 30-university-library.myarch builds with one tagged mesh per item | view3d | 77 ms |
| ✅ | the sample 15-sketchup-complex.myarch builds with one tagged mesh per item | view3d | 66 ms |
| ✅ | a shown item stays shown across a rebuild that keeps its batch | perf3d | 65 ms |
| ✅ | IFC: members export as their classes and come back with their bridge | structures | 55 ms |
| ✅ | drawFurniturePlan draws one filled and stroked shape per part | view3d | 50 ms |
| ✅ | an unchanged project reuses every level group | perf3d | 48 ms |
| ✅ | the sample 13-school.myarch builds with one tagged mesh per item | view3d | 45 ms |
| ✅ | 30-university-library.myarch | tour | 44 ms |
| ✅ | 36-terraced-office.myarch | tour | 42 ms |
| ✅ | glowing lamp parts and see-through parts are never batched | perf3d | 40 ms |
| ✅ | the sample 23-bridges.myarch builds with one tagged mesh per item | view3d | 39 ms |
| ✅ | IFC4.3: a bridge is an IfcBridge holding its members, and reads back | structures | 37 ms |
| ✅ | the sample 17-townhouse.myarch builds with one tagged mesh per item | view3d | 36 ms |
| ✅ | 12-hospital.myarch | tour | 35 ms |
| ✅ | the sample 12-hospital.myarch builds with one tagged mesh per item | view3d | 33 ms |
| ✅ | the sample 08-apartment-block.myarch builds with one tagged mesh per item | view3d | 32 ms |
| ✅ | unit primitives are one per kind and flagged as shared | perf3d | 31 ms |
| ✅ | the sample 18-modern-farmhouse.myarch builds with one tagged mesh per item | view3d | 31 ms |
| ✅ | the sample 14-courtyard-house.myarch builds with one tagged mesh per item | view3d | 30 ms |
| ✅ | 13-school.myarch | tour | 27 ms |
| ✅ | the sample 31-sports-centre.myarch builds with one tagged mesh per item | view3d | 25 ms |
| ✅ | every lamp gets one anchor at its bulb; lit lamps glow, switched-off lamps do not | lights | 23 ms |
| ✅ | the sample 19-duplex.myarch builds with one tagged mesh per item | view3d | 22 ms |
| ✅ | the instances sit exactly where the meshes were | perf3d | 22 ms |
| ✅ | 3D: a tower builds with a handful of geometries and few draw calls | structures | 22 ms |
| ✅ | the sample 38-museum.myarch builds with one tagged mesh per item | view3d | 22 ms |
| ✅ | the sample 16-modern-villa.myarch builds with one tagged mesh per item | view3d | 21 ms |
| ✅ | the sample 03-two-storey-house.myarch builds with one tagged mesh per item | view3d | 17 ms |
| ✅ | the sample 21-interior-design.myarch builds with one tagged mesh per item | view3d | 17 ms |
| ✅ | the sample 40-penthouse.myarch builds with one tagged mesh per item | view3d | 16 ms |
| ✅ | the sample 01-studio.myarch builds with one tagged mesh per item | view3d | 15 ms |
| ✅ | opts.furniture: false leaves furniture out; imported models get a placeholder | view3d | 15 ms |
| ✅ | 19-duplex.myarch | tour | 14 ms |
| ✅ | a wall deleted and drawn again: the merged batches follow | perf3d | 14 ms |
| ✅ | the sample 22-lattice-towers.myarch builds with one tagged mesh per item | view3d | 12 ms |
| ✅ | 31-sports-centre.myarch | tour | 12 ms |
| ✅ | the sample 02-two-bedroom.myarch builds with one tagged mesh per item | view3d | 12 ms |
| ✅ | the vendored path tracer imports only this app's three.js, and finds every name in it | photo | 11 ms |
| ✅ | the drawn instances carry the matrices of the meshes they stand for | perf3d | 10 ms |
| ✅ | 08-apartment-block.myarch | tour | 9.7 ms |
| ✅ | by level (top first) and room, each lamp once, with counts | lightlist | 9.5 ms |
| ✅ | sheets, views and annotations do not touch the 3D | perf3d | 9.1 ms |
| ✅ | 15-sketchup-complex.myarch | tour | 9.0 ms |
| ✅ | 14-courtyard-house.myarch | tour | 9.0 ms |
| ✅ | 38-museum.myarch | tour | 8.9 ms |
| ✅ | 3D: the leaf stands in the wall when closed and swings out when open | doors | 8.6 ms |
| ✅ | the sample 06-renovation-bim.myarch builds with one tagged mesh per item | view3d | 8.4 ms |
| ✅ | DXF: members on S-MEMB | structures | 8.3 ms |
| ✅ | the catalogue has unique kinds, categories and sensible sizes | view3d | 8.0 ms |
| ✅ | the sample 39-cafe-bistro.myarch builds with one tagged mesh per item | view3d | 7.7 ms |
| ✅ | a plain wall stays one mesh in its own material | interior | 7.5 ms |
| ✅ | the sample 20-compact-house.myarch builds with one tagged mesh per item | view3d | 7.0 ms |
| ✅ | 16-modern-villa.myarch | tour | 6.8 ms |
| ✅ | 17-townhouse.myarch | tour | 6.4 ms |
| ✅ | the sample 27-extradosed-bridge.myarch builds with one tagged mesh per item | view3d | 6.4 ms |
| ✅ | a wall without openings is a closed box of L × T × H | view3d | 6.4 ms |
| ✅ | the sample 24-deck-arch-bridge.myarch builds with one tagged mesh per item | view3d | 6.2 ms |
| ✅ | the sky: equirectangular, float, blue above, bright horizon, darker ground; night is dark | photo | 6.0 ms |
| ✅ | 23-bridges.myarch | tour | 5.9 ms |
| ✅ | the sample 04-small-office.myarch builds with one tagged mesh per item | view3d | 5.7 ms |
| ✅ | the sample 26-harp-cable-stayed-bridge.myarch builds with one tagged mesh per item | view3d | 5.7 ms |
| ✅ | the raycaster still picks batched meshes | perf3d | 5.7 ms |
| ✅ | a horizontal member spans its axis at its height, its section around it | members | 5.6 ms |
| ✅ | every type makes valid members | structures | 5.5 ms |
| ✅ | identical members share one geometry and batch into one draw call | members | 5.3 ms |
| ✅ | the sample 25-haunched-girder-bridge.myarch builds with one tagged mesh per item | view3d | 5.2 ms |
| ✅ | batched meshes move to the hidden layer and come back on release | perf3d | 4.8 ms |
| ✅ | 03-two-storey-house.myarch | tour | 4.8 ms |
| ✅ | 21-interior-design.myarch | tour | 4.7 ms |
| ✅ | the project's style keeps a valid ground; new projects take the defaults from the settings | ground | 4.4 ms |
| ✅ | 02-two-bedroom.myarch | tour | 4.2 ms |
| ✅ | the sample 07-massing-study.myarch builds with one tagged mesh per item | view3d | 4.1 ms |
| ✅ | the sample 05-wooden-cabin.myarch builds with one tagged mesh per item | view3d | 4.1 ms |
| ✅ | the project's 3D style keeps a valid environment; the background needs one | environments | 4.0 ms |
| ✅ | 18-modern-farmhouse.myarch | tour | 4.0 ms |
| ✅ | toggle: closed → open (the last angle, else 90°), open → closed; back to following the switch | doors | 4.0 ms |
| ✅ | the sample 28-stress-ribbon-footbridge.myarch builds with one tagged mesh per item | view3d | 3.9 ms |
| ✅ | starts outside the front door, visits both rooms once and never walks through a wall | tour | 3.9 ms |
| ✅ | walls are cut at the doors; each door gives a crossing with a point either side | tour | 3.7 ms |
| ✅ | catalogue item sb-dining-table-bar: parts are valid and fit its box | view3d | 3.6 ms |
| ✅ | 01-studio.myarch | tour | 3.5 ms |
| ✅ | mass models are tagged prisms; a taper of 0 makes a pyramid | view3d | 3.5 ms |
| ✅ | add, edit (members made again) and remove a structure | structures | 3.5 ms |
| ✅ | show(ids) draws an item by its own meshes and hides its instances | perf3d | 3.5 ms |
| ✅ | a hidden level is carried over but stays hidden | perf3d | 3.4 ms |
| ✅ | a window cuts a hole of width × height through the wall | view3d | 3.3 ms |
| ✅ | openings keep their reveals in the wall material | interior | 3.3 ms |
| ✅ | 06-renovation-bim.myarch | tour | 3.2 ms |
| ✅ | paintPattern paints corten (noise) deterministically | view3d | 3.2 ms |
| ✅ | 04-small-office.myarch | tour | 3.2 ms |
| ✅ | normalizeProject fills in lamps, clamps values and drops stray light data | lights | 3.1 ms |
| ✅ | no lamps: an empty list; every sample's lamps are all listed | lightlist | 3.0 ms |
| ✅ | hills: flat on the pad around the building, rising smoothly beyond, never below zero | ground | 2.8 ms |
| ✅ | stops at a door but runs under a window | interior | 2.8 ms |
| ✅ | a build made without keys can be followed by a keyed one | perf3d | 2.6 ms |
| ✅ | a stair on the top level climbs the level height; rotation turns it | view3d | 2.3 ms |
| ✅ | pickLamps: only lit lamps, nearest first, capped per type | lights | 2.3 ms |
| ✅ | big buildings get the lighter furniture detail, small ones the full one | view3d | 2.3 ms |
| ✅ | catalogue item pendantLampWhite: parts are valid and fit its box | view3d | 2.3 ms |
| ✅ | simplify.js: fewer triangles, the same attribute layout, cached per geometry | perf3d | 2.3 ms |
| ✅ | paintPattern paints asphalt (asphalt) deterministically | view3d | 2.2 ms |
| ✅ | the sample 09-cad-tracing.myarch builds with one tagged mesh per item | view3d | 2.2 ms |
| ✅ | every lamp has a glowing part and its bulb inside its box | lights | 2.1 ms |
| ✅ | 40-penthouse.myarch | tour | 2.1 ms |
| ✅ | ceiling lamps and wall lights do not raise model-check warnings | lights | 2.1 ms |
| ✅ | a gable roof peaks at base + (wid / 2)·tan(pitch), with gable walls | view3d | 2.1 ms |
| ✅ | 22-lattice-towers.myarch | tour | 2.1 ms |
| ✅ | 09-cad-tracing.myarch | tour | 2.1 ms |
| ✅ | a room no door reaches is still shown (the camera glides in) | tour | 1.9 ms |
| ✅ | wall finishes show as bands in their colour along the faces | interior | 1.9 ms |
| ✅ | catalogue item curtainLinen: parts are valid and fit its box | view3d | 1.9 ms |
| ✅ | furniture groups are placed, turned and tagged | view3d | 1.8 ms |
| ✅ | catalogue item shelving: parts are valid and fit its box | view3d | 1.7 ms |
| ✅ | 39-cafe-bistro.myarch | tour | 1.7 ms |
| ✅ | 05-wooden-cabin.myarch | tour | 1.7 ms |
| ✅ | paintPattern paints marble (noise) deterministically | view3d | 1.7 ms |
| ✅ | 20-compact-house.myarch | tour | 1.7 ms |
| ✅ | a door cuts down to the floor; a full-height opening leaves no head | view3d | 1.7 ms |
| ✅ | catalogue item queenBedGrey: parts are valid and fit its box | view3d | 1.6 ms |
| ✅ | openings of demolished phase are hidden by the new filter | view3d | 1.6 ms |
| ✅ | a spot points down (and the spotlight tilts forward with the item's rotation) | lights | 1.6 ms |
| ✅ | many surfaces, each a library material the 3D view can draw | ground | 1.6 ms |
| ✅ | double, sliding and garage doors build their own leaves | view3d | 1.6 ms |
| ✅ | finishR / finishL paint one face each; the rest keeps the wall material | interior | 1.6 ms |
| ✅ | paintPattern paints concrete (noise) deterministically | view3d | 1.5 ms |
| ✅ | a stair has one prism per step and climbs to the level above | view3d | 1.5 ms |
| ✅ | paintPattern paints carpet (noise) deterministically | view3d | 1.5 ms |
| ✅ | the lamp rig: a fixed pool, switches change intensities only | lights | 1.5 ms |
| ✅ | paintPattern paints grass (noise) deterministically | view3d | 1.4 ms |
| ✅ | catalogue item conferenceSet: parts are valid and fit its box | view3d | 1.4 ms |
| ✅ | project-wide parts (levels, roofs, materials, options) rebuild every level | perf3d | 1.4 ms |
| ✅ | a post stands from the floor to its top; a brace climbs | members | 1.3 ms |
| ✅ | openDoors swings the leaf into the room on its side | view3d | 1.3 ms |
| ✅ | an opening follows its wall's level | perf3d | 1.3 ms |
| ✅ | switchLamps flips the chosen lamps in one undo step; undo brings them back | lights | 1.3 ms |
| ✅ | paintPattern paints concrete-dark (noise) deterministically | view3d | 1.2 ms |
| ✅ | 26-harp-cable-stayed-bridge.myarch | tour | 1.2 ms |
| ✅ | paintPattern paints lime-plaster (noise) deterministically | view3d | 1.2 ms |
| ✅ | paintPattern paints screed (noise) deterministically | view3d | 1.2 ms |
| ✅ | paintPattern paints venetian-plaster (noise) deterministically | view3d | 1.2 ms |
| ✅ | paintPattern paints concrete-polished (noise) deterministically | view3d | 1.2 ms |
| ✅ | catalogue item treePalm: parts are valid and fit its box | view3d | 1.2 ms |
| ✅ | catalogue item sb-sec-hand-geometry-reader: parts are valid and fit its box | view3d | 1.2 ms |
| ✅ | slender round members (cables, rods) get a centre-line wire; angles and heavy members do not | members | 1.2 ms |
| ✅ | the project keeps it (a valid angle on doors only) | doors | 1.2 ms |
| ✅ | a pasted structure is a new one | structures | 1.1 ms |
| ✅ | paintPattern paints insulation (noise) deterministically | view3d | 1.1 ms |
| ✅ | paintPattern paints sand (noise) deterministically | view3d | 1.1 ms |
| ✅ | windows of every type stay inside their hole | view3d | 1.1 ms |
| ✅ | paintPattern paints marble-black (noise) deterministically | view3d | 1.1 ms |
| ✅ | paintPattern paints soil (noise) deterministically | view3d | 1.1 ms |
| ✅ | saved and read back; a structure without members is dropped | structures | 1.1 ms |
| ✅ | paintPattern paints vinyl-grey (noise) deterministically | view3d | 1.1 ms |
| ✅ | paintPattern paints roof-green (noise) deterministically | view3d | 1.1 ms |
| ✅ | paintPattern paints galvanised (noise) deterministically | view3d | 1.1 ms |
| ✅ | 3D: every part type makes a closed, outward geometry inside its bounds | view3d | 1.1 ms |
| ✅ | paintPattern paints rubber-black (noise) deterministically | view3d | 1.0 ms |
| ✅ | a room's wall finish covers every wall face that looks into it | interior | 1.0 ms |
| ✅ | eight places, ids unique, outdoor, indoor and studio, a sharper file for the main ones, all credited | environments | 1.0 ms |
| ✅ | 25-haunched-girder-bridge.myarch | tour | 1.0 ms |
| ✅ | every profile has a closed section with a positive area | members | 1.0 ms |
| ✅ | flat, hip and shed roofs build; opts.roofs: false leaves them out | view3d | 1.0 ms |
| ✅ | follow the theme: a gradient in each theme's own colours | background3d | 1.0 ms |
| ✅ | catalogue item saladBowl: parts are valid and fit its box | view3d | 1.0 ms |
| ✅ | mitred corners: the walls of a closed box hold the frame volume | view3d | 1.0 ms |
| ✅ | catalogue item personSkin2: parts are valid and fit its box | view3d | 1.0 ms |
| ✅ | catalogue item chessBoard: parts are valid and fit its box | view3d | 0.9 ms |
| ✅ | 27-extradosed-bridge.myarch | tour | 0.9 ms |
| ✅ | moving a bridge moves its parameters, so an edit rebuilds it in place | structures | 0.9 ms |
| ✅ | catalogue item plantPalm: parts are valid and fit its box | view3d | 0.9 ms |
| ✅ | the mesh carries its id, kind and level | view3d | 0.9 ms |
| ✅ | 24-deck-arch-bridge.myarch | tour | 0.9 ms |
| ✅ | a section cut keeps the lamps of the levels below it (a ceiling lamp above the cut still lights its room) | lights | 0.9 ms |
| ✅ | 28-stress-ribbon-footbridge.myarch | tour | 0.8 ms |
| ✅ | two openings remove both holes | view3d | 0.8 ms |
| ✅ | normalize fills sizes, profile, role and material | members | 0.8 ms |
| ✅ | demolished walls: hidden by the new-phase filter, red and translucent in the full view | view3d | 0.8 ms |
| ✅ | the wall's own finish wins over the room's | interior | 0.8 ms |
| ✅ | legs, ring struts, X bracing on every face, platforms and a mast | structures | 0.8 ms |
| ✅ | a room floor is a slab under the level, as thick as the slab | view3d | 0.8 ms |
| ✅ | runs round the room at its height, inside the room | interior | 0.8 ms |
| ✅ | catalogue item sb-acc-dumbbell-pair: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | paintPattern paints carpet-wool (weave) deterministically | view3d | 0.8 ms |
| ✅ | the HDR reader decodes a Radiance picture (as the downloaded skies are) | environments | 0.7 ms |
| ✅ | doors and windows become tagged groups with frames | view3d | 0.7 ms |
| ✅ | modelExtent covers walls, rooms, roofs and furniture (plan millimetres) and the top | view3d | 0.7 ms |
| ✅ | material ids are unique and colours are valid | view3d | 0.7 ms |
| ✅ | paintPattern paints gravel (gravel) deterministically | view3d | 0.7 ms |
| ✅ | catalogue item wineRack: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | moving, turning and pasting keep the heights | members | 0.7 ms |
| ✅ | catalogue item zzPlant: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | paintPattern paints granite (terrazzo) deterministically | view3d | 0.7 ms |
| ✅ | a wall's own height and the level elevation place the wall | view3d | 0.7 ms |
| ✅ | three modes: sky, follow the theme, theme colour | background3d | 0.6 ms |
| ✅ | a polyline member is one mesh per segment, tagged | members | 0.6 ms |
| ✅ | the plan hit test prefers a lamp over the table under it | lights | 0.6 ms |
| ✅ | paintPattern paints concrete-board (boards) deterministically | view3d | 0.6 ms |
| ✅ | 07-massing-study.myarch | tour | 0.6 ms |
| ✅ | catalogue item herbPots: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | piers stand at the inner stations, down to the ground | structures | 0.6 ms |
| ✅ | catalogue item sb-wp-training-chair: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | one group per level, named and tagged; opts.levels hides the others | view3d | 0.6 ms |
| ✅ | on/off, brightness, colour and beam survive save and load | lights | 0.6 ms |
| ✅ | paintPattern paints carpet-blue (weave) deterministically | view3d | 0.6 ms |
| ✅ | members count in the model extent and the level keys | members | 0.6 ms |
| ✅ | catalogue item tableSetFour: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item tulips: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | ids of all, a level, a room | lightlist | 0.6 ms |
| ✅ | paintPattern paints linen (weave) deterministically | view3d | 0.6 ms |
| ✅ | a suspension bridge: two towers, two main cables, hangers between them | structures | 0.6 ms |
| ✅ | paintPattern paints fabric-panel (weave) deterministically | view3d | 0.6 ms |
| ✅ | catalogue item succulents: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item sofa3: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item wallShelving: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | a Lighting category with ceiling, pendant, recessed, spot, track, wall and table lights | lights | 0.5 ms |
| ✅ | no skirting unless the room asks for it | interior | 0.5 ms |
| ✅ | catalogue item barSet: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | hit test and box select find a member | members | 0.5 ms |
| ✅ | a stand spot moves off a wall to the nearest clear place | tour | 0.5 ms |
| ✅ | catalogue item chandelierCrystal: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item libraryShelf: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plantFiddleSmall: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plantFiddle: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | columns: square prisms with rotation and round cylinders | view3d | 0.5 ms |
| ✅ | shapes follow the building: field, plot with 8 m around it, the horizon, hills | ground | 0.5 ms |
| ✅ | depth ranks: roofs over walls over slabs over masses over the ground; copies are shared | members | 0.5 ms |
| ✅ | catalogue item plantRubber: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | wall materials: the wall's own, else the type's outer layer, else plaster | view3d | 0.5 ms |
| ✅ | paintPattern draws each pattern with its own strokes | view3d | 0.5 ms |
| ✅ | catalogue item chandelier: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plant: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | makeFurniture: lamps come on, ceiling lamps hang under the ceiling, wall lights at their height | lights | 0.5 ms |
| ✅ | catalogue item chandelierBlack: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plantSmall: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item kitchenShelves: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | a door's own angle wins; unset follows the view's switch; windows never open | doors | 0.4 ms |
| ✅ | no rooms: no tour; hidden levels are left out | tour | 0.4 ms |
| ✅ | catalogue item carHatch: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | an L-shaped floor keeps its exact area | view3d | 0.4 ms |
| ✅ | catalogue item diningSetRound: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item car: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item plantStand: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item diningSet6: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | only doors and full-height floor openings are passable | tour | 0.4 ms |
| ✅ | catalogue item spiceRack: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item grassTuft: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item verticalGarden: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item fireEngine: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item highTop: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item patioSet: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item kitchenLine: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | a flat roof slab holds its plan area times thickness | view3d | 0.4 ms |
| ✅ | paintPattern paints metal-mesh (mesh) deterministically | view3d | 0.4 ms |
| ✅ | a switch reaches an open 3D view straight away | lights | 0.4 ms |
| ✅ | catalogue item rangeGas: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item carWhite: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | paintPattern paints terrazzo (terrazzo) deterministically | view3d | 0.4 ms |
| ✅ | catalogue item schoolBus: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item peaceLily: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item carMinivan: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | paintPattern paints oak-herringbone (herringbone) deterministically | view3d | 0.4 ms |
| ✅ | catalogue item carSUV: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item diningSet4: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item carTaxi: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item bus: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item carPolice: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item carPickup: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carBlack: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carSUVWhite: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carCoupe: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carSilver: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carHatchRed: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carRoadster: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item truckBox: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item flowerPotOutdoor: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item chesterfield: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item escalatorPair: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item ambulance: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item carCity: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item van: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item vanity2: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item flowerVase: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item snakePlant: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item sb-wpx-desk-wave: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item vanity2Grey: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item plantMonstera: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | a plain opening has no frame | view3d | 0.3 ms |
| ✅ | catalogue item dumbbellRack: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item sofaVelvet: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item sb-ofx-book-stack: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item shrubFlowering: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item fruitBowl: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item bedWing: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item plantBathroom: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item washTower: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item queenBedSage: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item flowerBed: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item crib: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item pendantCluster: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item hangingPlant: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item vasePampas: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item sb-storage-wall-cabinet: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item mannequin: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item queenBed: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item vaseSet: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item bedWingBlush: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item vaseTall: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item cashCounter: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item bookshelfWide: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item consoleTableOak: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item deskOffice: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | a wire runs inside the material: in an angle's heel and a channel's web, not the empty middle | members | 0.3 ms |
| ✅ | catalogue item teaSet: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item playTable: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | depth fixes: edge and wire lines move towards the camera; the ground disc gives way | members | 0.3 ms |
| ✅ | catalogue item treeLarge: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item dishRack: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | normalize keeps the finishes and clamps the skirting height | interior | 0.3 ms |
| ✅ | every HDRI file is in the library's download list (1k, and 2k for the main ones) | environments | 0.3 ms |
| ✅ | paintPattern paints brick (brick) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item diningBench: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item breakfastSet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item wallShelf: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item orchid: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cafeSet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | surface materials are cached per id and fall back to a colour | view3d | 0.2 ms |
| ✅ | catalogue item treeSmall: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item curtainVelvet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item kingBed: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item oliveTree: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bambooGrove: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | cable-stayed stays stay on the deck | structures | 0.2 ms |
| ✅ | catalogue item fanPedestal: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sb-dining-chair-shell: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | the legs taper from the base width to the top width and reach the height | structures | 0.2 ms |
| ✅ | catalogue item sideboard: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | the item colour replaces the main colour only | view3d | 0.2 ms |
| ✅ | catalogue item curtainCharcoal: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item wineCooler: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item range: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pouf: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | every material used by the default wall types exists | view3d | 0.2 ms |
| ✅ | catalogue item curtain: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | the plan symbol: a circle with a cross, with rays when on | lights | 0.2 ms |
| ✅ | catalogue item curtainSheer: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints plaster (plain) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item vending: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item terrarium: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personMan: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sideboardWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item espresso: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personSkirt: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item wineGlasses: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints tile-hex (hex) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item bathFreestanding: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item hobInduction: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | parts scale with the item size | view3d | 0.2 ms |
| ✅ | catalogue item barStool: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | drawFurniturePlan uses rect when roundRect is missing | view3d | 0.2 ms |
| ✅ | catalogue item washbasin: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item fittingRoom: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | surface physics reach the 3D materials | interior | 0.2 ms |
| ✅ | modelExtent's top includes tall furniture such as trees | view3d | 0.2 ms |
| ✅ | catalogue item planter: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item hobGas: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstandFloat: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item dressingTable: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item stove: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item privacyCurtain: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item wheelchair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item stoveSteel: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personWoman: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item tree: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item escalatorGlass: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item poolTable: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstand: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pothosShelf: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personBusiness: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item toyTrain: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | an empty project builds an empty level group | view3d | 0.2 ms |
| ✅ | catalogue item treeAutumn: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item escalator: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item barStoolBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bookshelf: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item escalatorBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bathBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pendantLampBrass: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treeBlossom: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personChild: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item escalatorNarrow: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item hourglass: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bbqKettle: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item meetingSet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item vanity: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cakeStand: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item vanityWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bicycleBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item oilBottles: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bookshelfWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstandWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item vanityWalnut: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counterOak: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | frames: level u across, v up, t along; a vertical member has u on plan x | members | 0.2 ms |
| ✅ | catalogue item officeChair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ottoman: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item toyKitchen: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item toiletCubicle: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item toilet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstandWalnut: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item officeBookcase: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ceilingFan: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treeBirch: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item poufMustard: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cooktopIsland: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item dresserWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | the washing machine's door stays within its depth | view3d | 0.2 ms |
| ✅ | catalogue item bonsai: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item washer: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sofaTerracotta: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | modelExtent of an empty project is a default 10 m box | view3d | 0.2 ms |
| ✅ | catalogue item closetOpen: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item executiveChair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item shrub: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | materialsFor filters by use | view3d | 0.2 ms |
| ✅ | catalogue item dryer: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counterNavy: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bicycle: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item desktopPC: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | K and single-diagonal bracing | structures | 0.2 ms |
| ✅ | catalogue item tvUnit: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item dresser: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item medCabinet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | colour, glass, frame and door materials | view3d | 0.2 ms |
| ✅ | catalogue item patioUmbrella: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints tile-mosaic (mosaic) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item cactus: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item desk: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ottomanGrey: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item teddyBear: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item heaterOil: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item kettlebells: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item islandWaterfall: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item hedge: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | part outlines seen from above | view3d | 0.1 ms |
| ✅ | catalogue item dresserWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item consoleTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeChairMesh: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | furnitureCorners follows position and rotation | view3d | 0.1 ms |
| ✅ | catalogue item motorbike: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeChairBlue: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item patioUmbrellaSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeChairGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item placeSetting: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item shoppingCart: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counterSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counterCharcoal: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeMugs: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints pavers-clay (herringbone) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item readingTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fireplaceLinear: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item soapSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item drumKit: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeTableBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item trampoline: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item extinguisher: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item shrubSmall: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tableLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item hospitalBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantRattan: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item displayCase: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item raisedBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sectional: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rockingChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item kettle: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tableLampSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bbqGas: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counterStool: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningOval: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tableLampBrass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item microwave: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item potsPans: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lockers: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item ivPole: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item roundTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item kettleBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item jarSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sinkDouble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofa2: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lantern: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item booth: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sectionalGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mirrorSunburst: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sectionalCream: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item airPurifier: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item piano: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item buffet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | near plane: half the free space in front of the camera, within its limits | members | 0.1 ms |
| ✅ | length and weight | members | 0.1 ms |
| ✅ | catalogue item sofa2Cream: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item treeConiferTall: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints wood-slats (slats) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item cafeTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairShell: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counterStoolWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sinkCounter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wineBottle: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item arcLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugJute: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item executiveDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | fitParts squeezes parts into the item's box and leaves fitting parts alone | view3d | 0.1 ms |
| ✅ | catalogue item urinal: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item studentSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | materials: every colour key has a surface class | view3d | 0.1 ms |
| ✅ | catalogue item router: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item speakersBookshelf: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeOval: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item trackLight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item movingRamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bidet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints concrete-block (subway) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item fireExtinguisher: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rockingHorse: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedBench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item speakerFloor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvUnitOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item waterHeater: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item canopyBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bathtub: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floatingShelves: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item towelRing: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item firePit: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item subwoofer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item kidsDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | areas: box = outer − inner, tube = annulus | members | 0.1 ms |
| ✅ | catalogue item fireplace: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item roundTableWhite: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairShellMustard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item roundMarble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofa2Navy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item armchairMustard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sideTableWood: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item candles: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | a straight alignment climbs with the grade; a crest rises in the middle | structures | 0.1 ms |
| ✅ | a curved alignment keeps its radius | structures | 0.1 ms |
| ✅ | catalogue item movingWalkway: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item headphones: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item waterCooler: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wingChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sinkCounterOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item singleBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeMachine: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedSlatted: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item riceCooker: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-out-concrete-bench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item liftEntrance: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item printer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item benchDesk4: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairShellSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pedestal: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item armchair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallClock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bowlDeco: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | part bounds follow the part's turn | view3d | 0.1 ms |
| ✅ | catalogue item armchairVelvet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item macrame: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wingChairGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningTable4: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item ceilingLight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item hammock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toiletRollHolder: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | makeFurniture fills in the catalogue defaults | view3d | 0.1 ms |
| ✅ | catalogue item chairShellBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item armchairLinen: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cubeShelf: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item weightBench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-wp-cubicle-l: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantGlobe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item globe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pergola: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item grandPiano: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item vanityStool: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskOrganizer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item robotVacuum: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item treeConifer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | a kind change into or out of a lamp fixes the light data | lights | 0.1 ms |
| ✅ | catalogue item mediaWall: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item singleBedOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item standMixer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item vacuumStick: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | sky and theme colour as before | background3d | 0.1 ms |
| ✅ | catalogue item diningTable4White: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item island: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item utensilHolder: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints roof-tiles (rooftiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item chairUpholstered: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bunkBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints pavers (pavers) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item chairBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-out-steamer-chair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-acc-wall-key-rack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item monitorDual: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints stone (stone) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item standMixerRed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chaiseLongue: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningTable4Walnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item buffetCounter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item islandNavy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item highChairRestaurant: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairUpholsteredGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item islandOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item workstation: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item venetianBlind: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairVelvet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cookbookStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaModular: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item shower: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item acOutdoor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item loftBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | enough choice for interiors, structures and landscape | interior | 0.1 ms |
| ✅ | catalogue item examTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-wp-bench-4: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairUpholsteredBlush: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallPlates: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-ofp-spiral-notebook-stack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeTableWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item highChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tallboy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item displayTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rocks: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-storage-cardboard-boxes: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeStorage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item monitor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item flushDrum: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantGlobeSmoke: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item clothesRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item scooter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item teacherDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item ovenBuiltIn: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item shoeRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantLinear: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | the eye is at a person's height | tour | 0.1 ms |
| ✅ | catalogue item sideTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeCapsule: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rangeHood: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coatStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item ovenTower: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item changingTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallArt: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairSlat: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-checker (checker) deterministically | view3d | 0.1 ms |
| ✅ | wallFinishes is null when nothing is finished | interior | 0.1 ms |
| ✅ | catalogue item officeDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeMarble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sculpture: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | quality presets grow | photo | 0.1 ms |
| ✅ | catalogue item blender: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lockersSchool: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item patientMonitor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item serverRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item guitarStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item daybed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-dining-chair-cesca: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cuttingBoard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item liftVehicle: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints roof-slate (rooftiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item bollard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaLeatherTan: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item paperTray: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item eggChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item adirondack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item liftEntranceWide: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item multiGym: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item recycleBins: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bathCaddy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaLeather: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mailboxes: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints air (plain) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item sideTableMarble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridgeFrench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallLantern: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item checkout: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mirrorRound: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item spotlight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item liftHome: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints wood-cladding (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item officeDeskWhite: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallSwingArm: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints wallpaper-stripes (stripes) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item dentalChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toyStorage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item umbrellaStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item projector: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item upperGlass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorUplight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeDeskWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item teepee: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item towelRadiator: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wheelieBin: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sculptureBust: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item barCounter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | furnitureDef and furnitureParts for known and unknown kinds | view3d | 0.1 ms |
| ✅ | catalogue item toiletWallHung: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item kidsBookcase: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorLampBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item upperCabinetOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item outdoorSofa: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-green (subway) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints concrete-precast (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item spinBike: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item radiator: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item swingSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item beanBag: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item upperCabinet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints timber (planks) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints oak (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item camera: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvCurved: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item phoneBooth: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item filing: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item trashCan: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints roof-shingles (rooftiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item upperCabinetNavy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints travertine (stone) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item treadmill: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item platformLift: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningTable8: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-apx-air-fryer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item smartSpeaker: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-dining-chair-shell-eiffel: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item punchingBag: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item knifeBlock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item laundryBasket: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item basket: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rower: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-out-bbq-kettle: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints plywood (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item showerWalkIn: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item keyboardMouse: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-wp-conf-16: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item umbrellaCantilever: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-ofx-desk-blotter-set: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item recordPlayer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-kitchen-bar-counter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wasteBasket: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | brightness: more lumens, more light; a narrow spot is brighter on axis | lights | 0.1 ms |
| ✅ | catalogue item sunLounger: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item clothesStyler: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | thresholds: under about a pixel left out, under the far radius coarse | perf3d | 0.1 ms |
| ✅ | catalogue item rugRound: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints ash (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item liftFreight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wardrobe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bikeRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridgeSideBySide: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wardrobeWhite: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item streetLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item robotDock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rug: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskClock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item beanBagBlue: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedPlatformWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fenceWood: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item liftGlass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item violin: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-kitchen-recycling-bins: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wardrobeWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item magazineRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-subway (subway) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item whiteboard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridge: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item laptop: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sb-planter-box: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item blinds: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cushionRound: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallSconce: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvStand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item reception: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item liftBed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-wall-plates: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-banana-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item deskDual: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-reception-curved: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item waitingChairs: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item printerHome: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item galleryWall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bedPlatform: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item loungeChair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bookends: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints walnut (planks) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item coatHooks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item parkBench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugRoundNavy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item toyBlocks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item auditoriumSeats: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-folding-shower-seat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item picnicTable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item cone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item meetingTable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item clubChair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-led-panel-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints teak-deck (planks) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item downlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-single-board-computer-case: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-tree-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-chesterfield: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item pantry: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item chairCantilever: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item pallet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item fridgeSteel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugPattern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item clubChairBlack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item studentChair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints brick-white (brick) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item lectern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-picture-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item standingDesk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item stairLift: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item dishwasher: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item cashRegister: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item studentDesk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item liftCarSmall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item binders: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints brick-dark (brick) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item tv65: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shelving-unit-walnut: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item liftCar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item nestingTables: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints limestone (tiles) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item safe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item pantryOak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item highTable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints bamboo (planks) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item towelLadder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item glassDining: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item tableTennis: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sphere: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-clear-ballot-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item doubleBed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-outdoor-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item fanTower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-easel-tv: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints tile-grey (tiles) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item visitorChair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cube-storage-3x1: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-potting-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item lDesk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints tile-white (tiles) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item fridgeBlack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints slate-floor (tiles) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item loungeOffice: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item throwPillowsBlue: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item liftCarLarge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints acoustic-tile (tiles) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item coffeeGlass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item loungeChairSage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | materialById and materialColor | view3d | 0.0 ms |
| ✅ | catalogue item dollhouse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-moon-jar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item gardenShed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item prepTable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item romanBlind: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item tvOLED: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item crate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item diningTable6Oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item hairDryer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shelving-unit-low-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-coat-rack-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-sliding-wardrobe-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-air-purifier-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-herb-spiral: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item diningTable6: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cube-storage-4x4: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-built-in-closet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item acIndoor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-locker-two-tier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-trough-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-bench-sit-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-fountain-pen-ink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item waterPurifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-garage-rack-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item toyChest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-coat-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | the default materials exist with the right use | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-hand-sanitiser-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shoe-cabinet-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-rolling-cart-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-hot-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item plotter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item coldRoom: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item acStand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shelving-unit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-electric-fireplace: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-built-in-closet-grey-3door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cube-storage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-trackball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item wallTV: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-round-pedestal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-ottoman-round-rose: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-butcher-block-island: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shoe-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item mirrorArch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-led-mirror-rect: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item benchBlack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-shower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bookStack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item frameStanding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item throwPillows: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-huddle-media-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints tile-terracotta (tiles) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item gameConsole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-tieback-drapes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-korean-red-pine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-prickly-pear: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-bistro: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item toaster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item hotTub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-towel-basket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-orrery: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints roof-metal (seams) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item breadBox: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints wallpaper-green (stripes) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-arched-mirror-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-ust-projector: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item ball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item floorMirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-standing-bar-power: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-storage-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-gas-boiler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-inkjet-mfp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item dehumidifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-console-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints roof-membrane (seams) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-sage (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-garment-steamer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-rolling-kick-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-drum-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item cylinder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-iron-spindle-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-usb-fingerprint-scanner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-chromebook: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-wooden-headphone-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item mailbox: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-end-bench-upholstered: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-banquette-corner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints wood-panel (slats) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-lantern-post: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-2in1-convertible: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-saguaro-cactus-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cabin-suitcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-ladder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bbq-gas: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item atm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-bench-2: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-floor-cushion: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-wishbone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-calculator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-water-butt: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item towelStack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-forsythia: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item mirrorCabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-back-to-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints steel-red (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints water (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item toasterCream: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-white (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-solar-4g-pole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item wardrobeSliding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bathScale: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item chestFreezer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-adirondack-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-focus-pod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-nursing-glider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item throwBlanket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-hanging-daybed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints copper (seams) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bbq-island: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-sandbox: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-smart-evidence-lockers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-sheetfed-document-scanner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item towelStackGrey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints zinc (seams) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-hot-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item chalkboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints gypsum (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-grid-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-patching: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item parkingSpace: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item dumbwaiter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-moka-pot: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item projectorScreen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-ice-maker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-toilet-wall-hung: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item runner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-dc-ceiling-fan-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints glass (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints brass (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item smartphone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-kettlebell: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-raised-floor-section: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-hard-drive-degausser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item deskPhone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-knitting-basket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-with-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item soundbar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-bird-cage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item electricalPanel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints stainless (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item roomDivider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item signExit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-whiteboard-mobile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-partition: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugGrey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item tablet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-farmhouse-sink-counter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints cable (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-ceramic-heater: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item pool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-floor-bath-filler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-game-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-edison-cluster-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item panelLight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-aio-24-colour: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-magnetic-clip-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-korean-orchid: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-jigsaw-puzzle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-pen-display: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sputnik-chandelier-large-gold: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-biometric-enrolment-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-backpack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-bar-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item throwBlanketGrey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-water-lily-planter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-air-fryer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugSage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-glider-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-philodendron-selloum: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item yogaMat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-clawfoot-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints aluminium (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-coffee-grinder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-folding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-sky (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-tube-batten: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-key-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-easter-egg-basket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-sailing-ship-model: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugTerracotta: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugShag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item shredder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-bladeless-fan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-air-circulator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-magnifying-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-lawn-patch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-xl-desk-mouse-mat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-cable-management-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-floating-vanity: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-desk-magnifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-hand-dryer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-mustard (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-photo-album: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-hotel-towel-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-coaster-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-snow-globe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-led-mirror-pill: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desk-ring-light-phone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-rotary-line: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-reception-accessible: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-celadon-vase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-plant-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-chesterfield-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-kidney-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-pyeongsang: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-grandfather-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-stage-par-can: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-ottoman-coffee-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-sectional: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-corten-trough: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-baby-bath-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desktop-label-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-moss-garden-mound: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-adjustable-footrest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints glass-frosted (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-sneakers-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-french-press: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-document-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-15-budget: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lounge-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-module-ottoman: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-wall-hanger-rail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-warming-drawer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toothbrush-cup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-standby-generator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-task-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-navy (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-tote-bag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-fluted-vase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-armchair-shell: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-grate-with-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-mesh-wastebasket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-warm-grey (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-rice-cooker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-rain-chain-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-fedora-hat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-washi-tape-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-quadrant-enclosure: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-platform-low-single: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-fountain-tiered: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-cream (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cheese-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cube-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-paperweight-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-skipping-rope: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tv: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-vessel-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-wall-cubby: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-lantern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-creeping-juniper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-camelback: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-ankle-boots-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-desk-fan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-air-conditioner-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-nappy-bin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-open-base-shelving: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints glass-tinted (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-board-game-boxes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-turntable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-washbowl-dipper-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-pc-stick-hdmi: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-dresser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-drafting-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-network-800: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints steel-grey (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-slippers-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-folded-clothes-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-remote-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-clawfoot-tub-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-soldering-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-laundry-basket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-drawer-unit-legs: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-screening-table-wand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-folded-umbrella: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-yoga-mat-roll: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-portable-air-conditioner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-microcontroller-breadboard-kit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-parasol: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-teal (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-magazine-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-vinyl-crate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-basket-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-canopy-plain: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-clothed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-planter-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints steel (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-blush (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item bathMat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-water-heater: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tv-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-curtain: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-led-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-toilet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-low-floor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-louvred-pergola: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-binoculars: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-outdoor-vrf-side: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-steam-iron-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-frame-tv: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-messenger-bag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-mirror-light-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-olive (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-charcoal (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-handbag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cookbook-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-notebook-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-duckboard-mat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-smart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-bidet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bathtub-built-in: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-topiary-spiral: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-under-desk-panel-heater: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-mug-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-roll-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-corner-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-wraparound: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-rattan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-sff-desktop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desktop-speakers-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-racing-wheel-pedals: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-wide-bowl-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-hanging-file-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-greenhouse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-stone-wall-tiled: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-sotdae: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-conf-u-shape: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-greige (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-forest (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cocktail-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-lunch-box-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-sauna-cabin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-usb-microphone-arm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-cuckoo-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-binders-row: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-chiminea: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-croton: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-bench-6: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-music-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-perfume-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-pour-over-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-projector-ceiling: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-platform-low: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-anthurium: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-mobile-shelving: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-vintage-radio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-trinket-dish-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-bread-loaf-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-shaving-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-canister-vacuum: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-floating-vanity-double-walnut: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-high-cistern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chest-lingerie: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-mattress-pillow-top: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-korean-yo-single: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-macrame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-vintage-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-thermos-bottles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-wax-seal-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-postcard-easel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-stand-round-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fridge-column-builtin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-alcove-tub-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-walk-in-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-bathrobe-hook: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-open-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desktop-ups: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-open-air-test-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-buffet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-curtains: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-dining-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-firewood-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-basketball-hoop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ponytail-palm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-acoustic-screen-mobile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-terracotta (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cosmetic-bag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-wall-split-premium: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dehumidifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-urinal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-towel-ring: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-clothes-rail-open: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-chair-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-side-table-tulip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-mesh-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-black (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-steam-shower-cabin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-vessel-basin-rect-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-stone-tub-concrete: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-channel-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-jewellery-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-49-super-ultrawide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-e-reader-cover: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-aquarium-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-spider-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-grass-trough: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-raised-floor-ramp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cookie-jar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-egg-basket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cutting-mat-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-pedestal-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-stone-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bandaji: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-tower-server: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desk-subwoofer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-nas-2-bay: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-ceiling-access-point: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-wreath: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-dreamcatcher: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-hide-rug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-throw-blanket-boucle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-plant-stand-tiered: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-ball-fountain: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cactus-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints steel-white (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-salt-pepper-mills: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-linear-slot-diffuser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-panel-radiator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-party-speaker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-laundry-basket-open: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-grab-bars: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-mop-bucket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-mirror-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vanity-wall-floating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-pen-tablet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-floor-vase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-hutch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-date-stamp-ink-pad: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-water-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-makeup-brush-cup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-nutcracker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-fan-coil-ceiling: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wine-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fan-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-stand-mixer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-bread-maker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-slow-juicer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-hinoki-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-ceiling-rain-shower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-hook-rail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-towel-stack-grey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-square-sliding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-bottles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-wingback: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chest-campaign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-loft-sofa: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-rest-pillow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-triple-monitor-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-vertical-mouse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-docking-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-aluminium-laptop-riser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-shag-rug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-upright-piano: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-mesh-pen-cup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bamboo-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-stepping-stones: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-zz-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-apothecary-jars: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-pencil-cup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-stapler-tape: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-drip-coffee-maker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-close-coupled: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-wall-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-corner-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-tall-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shower-booth: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-integrated-nightstands: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-murphy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-korean-yo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-headboard-wall-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-tv-lift-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-34-ultrawide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-crossback: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bookcase-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-parlour-palm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-conf-square-8: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-mason-jars-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-hair-dryer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-panel-column: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-close-coupled-bidet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-adjustable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-pipe-industrial: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-canopy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-storage-drawers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-ottoman: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-luggage-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-13-ultrabook: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-16-pro: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-rugged-laptop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-wireless-earbuds-case: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-candlesticks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-glass-bottles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-gateleg: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-curved-deep: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ottoman: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-mug-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-garden-bridge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-money-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kentia-palm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-bath-salts-jars: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-subwoofer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wine-cooler-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-corner-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-teak-shower-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-vanity-accessory-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-vanity-washer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dresser-with-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wardrobe-3door-drawers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vanity-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-office-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-compact-desktop-square: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-cable-modem-ont: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-pos-receipt-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-retro-crt-monitor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-floppy-disk-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-guitar-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-runner-rug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vase-stems-pampas-amphora: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-concrete: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-compact-kitchenette: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-semi-flush-ceiling-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-typewriter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-office-coat-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-dog-kennel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-geranium-trough-pink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-topiary-ball-double: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aloe-vera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pothos-wall-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-boardroom-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-charging-dock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-gift-box-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-countertop-dishwasher: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-stereo-amplifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-air-conditioner-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-wall-hung-square: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-glass-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-towel-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-14-business: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-memory-card-reader: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-surge-protector-strip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-photo-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-flatbed-scanner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-handheld-gaming-pc: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-digital-oscilloscope: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-bench-power-supply: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-digital-multimeter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-retro-beige-desktop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-easel-canvas: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-globe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-sunburst-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-gallery-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-moon-jar-large-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-bentwood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-rug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-gel-wrist-rest-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-fingerprint-card-terminal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-soap-dish-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-bath-bomb-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-projector-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-water-purifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-electric-kettle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-laundry-tower-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-teak-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-bath-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-utility-sink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vanity-stool-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-usking-slat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-button-tufted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-mid-century: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-underbed-drawers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-vanity-trifold: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-garment-steamer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-workstation-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-dual-monitor-arm-setup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-light-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-letter-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-set-4-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-ride-on-car: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-island-hood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-yew-column: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-electric-fireplace-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-paper-trimmer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-deck-steps: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-dieffenbachia: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-agave: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-ficus-benjamina: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-yucca: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-fingerprint-attendance-terminal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-headphones-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-water-pitcher-glasses: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-refrigerator-side-by-side-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-toaster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-blender: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-robot-dock-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-walk-in-grid-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-roll-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-scale: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-towel-ladder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-four-poster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-divan-skirt: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-metal-two-tier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-jewellery-armoire: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-pallet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-chest-gentlemans: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-wardrobe-fabric: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laptop-17-gaming: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-tablet-keyboard-cover: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-keyboard-low-profile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-mouse-travel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-poe-injector: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-large-format-plotter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-smartphone-dock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-document-holder-copyholder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-roman-blind: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vase-stems-tulips: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-pedal-bin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-lawson: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-organiser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-wall-hutch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-iron-fence: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-monstera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-ten-print-livescan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-bathroom-scale: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-pet-carrier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-rowing-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-wall-mounted-washer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-espresso-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kimchi-refrigerator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dishwasher: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-tatami-platform: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wardrobe-corner-l: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chest-graduated: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-highboy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-mouse-office: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-webcam-monitor-clip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-soundbar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-nas-4-bay: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-runner-rug-blue: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-stool-counter-back: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-mat-puzzle-pastel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-scissors: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-cash-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-folding-step-ladder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-rocking-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-patio-heater: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-play-slide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-jangdokdae: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-geranium-trough: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-areca-palm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-boston-fern-hanging: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-rubber-plant-burgundy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-3d-face-terminal-turnstile-mount: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-reader-rfid-mullion: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-tennis-racket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-pet-bed-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-buchae-fan-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fan-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-av-receiver: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-island-hood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-washing-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-step-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-squat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-iron-spindle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chest-blanket-trunk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-armoire-classic: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wardrobe-mirror-sliding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-single-oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-chest-on-chest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-mini-pc-nuc: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-portable-ssd: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-3in1-charging-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-book-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-alarm-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-tapestry: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-venetian-blind-wood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ceiling-fan-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-paper-lantern-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-curved: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-magazine-file-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-rattan-sofa: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-shade-sail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-topiary-cone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-bonsai-juniper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-push-to-exit-button: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-filing-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-mortar-pestle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-hand-mirror-comb: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-litter-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-window-unit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-outdoor-vrf-top: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-erv-ventilation-unit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-humidifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-speakers-bookshelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-twin-washer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dryer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-mirror-pivot-oval: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bathtub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-cane: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedding-stack-folded: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-mirror-cheval: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-laundry-hamper-woven: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-white-tower-glass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-27-gaming-240: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-game-console-vertical: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-candlesticks-black-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-art: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-filing-cabinet-lateral: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-copier-office: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-paper-shredder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-desk-converter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-framed-certificates: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-slat-fence: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-tiki-torch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-garden-pond: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-topiary-ball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-rubber-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-succulent-pink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-cube: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-fingerprint-reader-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-ups: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-clothes-drying-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-massage-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-robot-vacuum: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-soundbar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-over-toilet-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-bathtub-caddy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-floating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand-floating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dresser-tallboy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dresser-wide-6: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wardrobe-sliding-oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-channel-tall-velvet-king: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-bed-folding-guest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-chest-mirrored: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-jangnong: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-closet-island: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-24-office: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-video-conference-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-macro-key-controller: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-colour-laser-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-retro-mini-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-telescope-tripod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-hurricane: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-chiavari: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-shaped-garden-pine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-irregular-flagstones: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-torchiere-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-barrel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-midcentury: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-desk-gaming: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-staple-remover: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-name-plate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-punch-time-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-paper-cup-dispenser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-arbour-arch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-pizza-oven: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-rope-lounge-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-lemon-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-saguaro-cactus: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lucky-bamboo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-monstera-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-iris-face-terminal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-elevator-corner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-folding-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-visitor-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-pedestal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-lectern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-rubber-ducks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-desk-calendar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-snowman-figure: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-leash-hooks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-norigae-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-oil-heater: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-smart-speaker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sewing-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-double-vanity-classic: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-arched-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-medicine-cabinet-vintage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-tall-cabinet-oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-washstand-jug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-footstool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dressing-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-split-ergonomic-keyboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-smart-display-speaker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-external-hdd-desktop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-nas-8-bay: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desktop-kvm-switch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-resin-3d-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-bird-figurine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-sunburst-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-venetian-blind: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-double-pedestal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-drip-coffee-maker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-planner-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-craft-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-led-task-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-lockable-notice-case: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-desk-phone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-gabion-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-patio-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-pampas-vase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-phalaenopsis-orchid: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lavender-pot: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-water-leak-detection: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-reception: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-nail-polish-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-violin-case: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-hahoe-mask: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-two-in-one-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-outdoor-unit-single: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-washer-dryer-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-steam-oven-compact: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-whirlpool-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-quadrant-enclosure-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-mat-oval: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-vanity-washstand-legs: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-shower-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-bookcase-headboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-aio-27-pro: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-gaming-headset-on-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-usb-hub-aluminium: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-wifi-router-antennas: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-laser-mfp-office: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-candles-five-honey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-roller-blind-blackout: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-ghost: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-topiary-tiered-poms: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-expanding-file: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-calendar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-shelf-riser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-egg-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-urn-plinth: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-chicken-coop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-calathea: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-staghorn-fern-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-phalaenopsis-orchid-pink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bird-of-paradise-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-face-recognition-speed-gate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-ptz: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-signature-pad: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-folding-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-smart-lockers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-puzzle-cubes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-washing-machine-top-load: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kimchi-refrigerator-steel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-range-cooker-wide-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-induction-hob: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-microwave: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-oven-builtin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-towel-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-counter-organiser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-sleigh: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-rug-bedside: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-overbed-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wardrobe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-gaming-tower-rgb: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-32-pro: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-portrait-pivot: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-bud-vases: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-set-8: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-glass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sideboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-coffee-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-backsplash-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-range-hood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-stone-steps: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-cube-bookcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-business-card-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-reception-bell: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-tripod-projector-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-eye-wash-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-keyboard-mouse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-sectional-corner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-swing-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-moss-pole-philodendron: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dracaena-marginata: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-peace-lily: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-herb-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bamboo-planter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-hydrangea-pink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-storage2u-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-floor-tile-solid: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-tissue-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cat-scratching-post: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-fish-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-broom-dustpan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-incense-burner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-cassette-1way: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-cassette-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-speaker-floorstanding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wifi-router: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-velvet-king: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-nightstand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dresser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-portable-monitor-folio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-keyboard-full: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-mesh-wifi-nodes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-vr-headset-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-bookends-marble: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-wood-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-roller-blind: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-clock-walnut-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-set-round-4: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cage-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-folding-screen-rattan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sun-lounger: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bird-of-paradise: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-viewer-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-sign-cctv: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dcim-monitoring-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-skateboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-game-controllers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-heat-pump-indoor-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-exercise-bike: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-mini-fridge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-heated-clothes-airer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-washer-dryer-stack-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ottoman-storage-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-trunk-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-mouse-gaming-rgb: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-mantel-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-set-4: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-bar-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-booth-velvet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-trestle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-windsor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-electric-kettle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-rice-cooker-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-bell-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-string-lights-globe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-armchair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-copy-paper-reams: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-acrylic-sneeze-guard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-office-waste-bin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-document-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-fire-pit-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bar-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-cold-frame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-climbing-frame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-festoon-poles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-alocasia: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-moss-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-hanging-plant-long: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-public-view-monitor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-mesh-chair-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-pet-bowls-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-yut-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-concealed-duct: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-outdoor-wall-bracket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-air-curtain: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ironing-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tv-55: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-heat-pump-outdoor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-shower-tray-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-washbasin-vanity: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-towel-rail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vanity-hollywood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-valet-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-blanket-ladder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-itx-cube: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-22-basic: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-vertical-laptop-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-hourglass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-reed-diffuser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-blanket-basket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-set-6: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-bench-backrest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-pedestal-wood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-stool-gaslift: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-kotatsu: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-ball-pit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-mobile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-climbing-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-canister-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-zelkova: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-slipper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-tuxedo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-midcentury-split: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-pegboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-stapler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-label-maker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-leather-desk-pad: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-under-desk-cable-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-power-module: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-privacy-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-queue-ticket-dispenser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-monitor-memo-boards: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-water-bottle-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-capsule-coffee-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-birdhouse-pole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-beehive: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-offset-smoker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-jade-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-echeveria-planter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-hydrangea: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-cherry-branches: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-tulips-vase-yellow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fiddle-leaf-fig: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-window-contact: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-drafting-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-football: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-vr-headset: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-advent-wreath: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-birthday-cake: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-remote-wall-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-shoe-care-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-clothes-care-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-air-conditioner-cassette: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-refrigerator-top-freezer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-mat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-hair-dryer-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bedroom-vanity-mirror-tabletop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-tablet-on-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-chess-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sculpture: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-wine-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-stool-saddle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-metal-cafe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-horseshoe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-trolley-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-double-sink-counter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-scale: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-bread-bin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-frying-pan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sputnik-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-neon-sign-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-side-table-drum: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-curved: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-camelback: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-skirted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-modular: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-phone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-envelope-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-wet-floor-sign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-mail-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-hammock-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-face-recognition-pedestal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-parking-barrier-gate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-floor-tile-grate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-tufted-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-tambour: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-nap-pod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-pouf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-pumpkin-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-wall-split-square: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-ceiling-suspended: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fridge-retro: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-apx-chimney-hood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bed-daybed-trundle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-keyboard-60-percent: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tray-round-marble: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-counter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-buffet-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-x-base: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-monobloc: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-bench-pew: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-cloud-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-appliance-garage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wine-rack-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-coil-led-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-bulkhead-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-wall-washer-recessed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-folding-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-recliner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-rattan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-desk-trestle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-floor-globe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-file-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-glass-trestle-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-flatbed-scanner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-gaming-pc: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-heavy-duty-stapler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-vertical-file-sorter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-clipboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-recycling-bins-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-award-plaques-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-fire-hose-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-monitor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-compost-bays: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-fire-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bench-cast-iron: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-birds-nest-fern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-calathea-pink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-face-recognition-tablet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-emergency-door-release: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-l-3x2-left: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-l-4x2-left: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-key-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-conf-boat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-shelf-divider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-basketball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-tabletop-christmas-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-wall-split-slim: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-stand-column-fins: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-cassette-2way: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chest-freezer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tv-wall-85: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-closet-walk-in-module: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-27-4k: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-desktop-gigabit-switch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-hotas-flight-stick: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-booth: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-parsons: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-folding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-growth-chart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-mat-puzzle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-rocking-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-stroller: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wall-wine-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-blender: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-crape-myrtle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-dry-stream-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-natural-pond-with-edge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-spider-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-lantern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-media-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-tv-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-drafting-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pc-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-roll-top-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desktop-calculator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-suggestion-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-drawer-organiser-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-electric-kettle-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-fire-alarm-call-point: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-office-safe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-laptop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-wheelbarrow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fiddle-leaf-fig-small: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-snake-plant-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-bullet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-doorbell: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-lock-finger: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-razor-wire-fence: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-alarm-horn-strobe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-glass-partition-door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-ukulele: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-baduk-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-floor-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-through-wall-ptac: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-portable-dual-hose: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-monitor-hood-colour-grading: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cmp-keyboard-tkl-mechanical: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-canvas: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-folding-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-farmhouse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-oval-pedestal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-live-edge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-book-display: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-couch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-puppet-theatre: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-basketball-hoop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-cherry-blossom: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-flat-seat-stone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-dol-hareubang: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-scarecrow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-staked-young-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-rattan-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-night-light-plug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-string-lights-globe-long: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-orb-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-bar-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-travertine-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-club: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-sofabed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-conference-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-whiteboard-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-phone-booth-pod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-campaign-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-tape-dispenser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-aed-wall-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-pergola: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-terrarium: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-areca-palm-small: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-turret-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-reader-qr: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-pinhole-atm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-nvr-rack-4u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-pedestal-cushion: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-acoustic-panels: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-bokjumeoni: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-cassette-4way: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-evaporative-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bath-toilet-brush: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-floor-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-china-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-wingback: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-set-benches: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-house-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-montessori-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-baby-play-gym: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-peninsula: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-rice-cooker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-stepping-stones-concrete-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-sleeper-steps: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-rock-waterfall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-bamboo-water-spout: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-stone-pagoda-three-story: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-bird-feeder-pole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-signpost: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-wood-beam-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-led-tube-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-sconce-cone-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-linear-candle-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-french: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-modular-velvet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-desk-hutch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-guest-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-safe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-hole-punch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-paper-guillotine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-trophy-trio: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-wall-whiteboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-mobile-double-whiteboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-gooseneck-conference-mic: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-acrylic-sign-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-trampoline: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-string-of-pearls: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-monstera-small: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-peace-lily-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-turret: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-security-cage-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-data-media-safe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-lounge-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-waiting-sofa: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-watercolour-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-cleaning-caddy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-wall-thermostat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-fridge-french-door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-jute-rug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-candles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-picture-frames: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-s: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-parsons: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-leather-sling: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-car-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bin-organizer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-wardrobe-house: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bed-l-bunk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-changing-table-open: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bunk-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-step-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-boxwood-hedge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-hosta-clump: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-jeongja-pavilion: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-stone-wall-with-roof-tiles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-gallery-track-rail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-cylinder-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-pouf-knitted-charcoal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-club-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-tuxedo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-midcentury: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-recliner-open: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-modern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-chair-headrest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-chair-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-balance-ball-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-captain-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-letter-tray-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-sticky-note-cube: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-printing-calculator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-comb-binding-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-electric-pencil-sharpener: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-a-frame-sign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-glass-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-world-time-clocks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-conference-speakerphone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-tabletop-flipchart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-first-aid-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-l: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-cantilever-parasol: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bistro-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-kokedama: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-snake-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-olive-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-finger-vein-reader: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-palm-vein-face-terminal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-retina-scanner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-explosion-proof: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-tyre-killer-spikes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-open-frame-4-post: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-cable-spool-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-module-end: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-highback-sofa: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-whiteboard-mobile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-fairy-light-jar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-acc-ornament-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-stand-slim-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-cassette-mini: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-ceiling-diffuser-square: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-appl-treadmill: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-stick-vacuum-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-refrigerator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-floating-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-shag-rug-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-place-setting: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bed-mid-sleeper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-art-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wok: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-japanese-maple: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-olive: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-italian-cypress: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-fountain-grass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-white-pebble-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-stepping-timber-rounds: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bubble-branch-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-uplighter-column-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-pinhole-spot: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-mushroom-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-under-cabinet-pucks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-floor-lamp-arc-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-track-light-long-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-fluted-sideboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-hanging-egg-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-side-table-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-scandi: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-recliner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-reading-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-basket-shredder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-belt-stanchion-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-emergency-exit-sign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-visitor-badge-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bird-bath: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-picnic-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-barrel-cactus: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-ladder-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-olive-tree-small: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-face-recognition-terminal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-nvr-recorder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-iris-enrolment-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-reader-keypad: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-lock-push-pull: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-guard-tour-checkpoint: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-fibre-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-l-3x3-right: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-u-2x3x2: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa5-chaise-right: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-campaign-chest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-slat-divider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-modular-lounge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-conf-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-beam-seating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-lockers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-video-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-bench-6-walnut: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-aca-rooftop-package-unit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-air-purifier-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-mirror-floor-arched: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-tulip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-drop-leaf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-rattan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-barrel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-tea-trolley: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-loft-bed-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-kitchen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-tent-a-frame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-pikler-triangle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bed-canopy-princess: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-tricycle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-apple: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-camellia: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-boulder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-lantern-post: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-robot-lawn-mower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-led-panel-1200: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-half-moon-wall-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-high-bay: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-three-arm-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-pharmacy-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-wall-shelves: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-record-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-scandi: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-rattan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-boxy: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-curved: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-lounge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-legal-pad-pen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-rubber-stamp-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-fire-extinguisher-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-umbrella-stand-office: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-usb-desk-fan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-garden-shed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-kamado-grill: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-swing-aframe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-security-revolving-door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-magnetic-door-lock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-lock-face: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-vandal-dome: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-video-wall-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-portable-spot-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-power-distribution-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-electrical-panelboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-u-1x2x1: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-chaise-left: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-theater-recliner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa6-serpentine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-key-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-flipchart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-network-cabinet-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-production-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-partition-corner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-conf-6: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-partition-low: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-range-cooker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sculpture-pebbles: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-swivel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-paper-cord: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-wine-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bassinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bean-bag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-dollhouse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-vanity: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-kick-scooter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-floating-shelf-mugs: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-espresso-machine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-stock-pot: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-bamboo-grove: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-sedum-ground-cover: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-edging-steel-curve: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-stone-mortar-basin: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-millstone-ornament: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-enamel-factory-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-slim-led-wall-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-arc-led-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-crystal-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-led-desk-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pendant-light-cone-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-schoolhouse-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-portable-lantern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-egg-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-display-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-fireplace-screen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-barrel-boucle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-scroll: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-lawson: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-loveseat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-writing: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-chair-executive: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kneeling-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pinboard-cork: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-letter-tray-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-printer-laser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-monitor-arm-dual: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-footrest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-partners-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-windsor-desk-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-revolving-bookcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-organizer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-metal-bookends: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-brochure-floor-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-gazebo-hex: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-mailbox: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bench-slatted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-raised-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bollard-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-face-temperature-kiosk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-pole-dual: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-ir-illuminator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-pir-motion-detector: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-wall-cabinet-9u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-grounding-busbar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-l-3x3-left: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-laundry-tilt: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-vase-stems: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-throw-pillow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-extendable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-lazy-susan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-cake-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-teepee: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-building-blocks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-climbing-arch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-sensory-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-spice-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-cutting-boards: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-dish-drainer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-island-oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-weeping-willow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-azalea-mound: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-boulder-cluster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-brick-path-herringbone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-edging-scalloped-concrete: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-compost-tumbler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-cone-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-studio-spot-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ceiling-flush-large: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-candlestick-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-downlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-tv-floor-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-rattan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-english: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-futon: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-english: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-curved-terracotta: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-gaming-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-name-tent-cards: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-desk-air-purifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-bike-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-hanging-plant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-iris-scanner-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-wireless-battery-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-xray-baggage-scanner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-storage4u-4u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-wall-cabinet-12u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa6-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-wire-shelving: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-locker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-room-booking-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-cluster-4: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-high-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-lateral-filing: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-conf-10-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-bowl-oranges: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-armchair-tub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-trundle-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-infant-car-seat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-island-waterfall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-corner-wall-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-pullout-pantry: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-toaster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-stand-mixer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-knife-block: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-lavender-row: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-rose-bush: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-lawn-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-bark-mulch-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-flower-bed-bordered: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-watering-can: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-push-lawn-mower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-insect-hotel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-clamp-desk-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-ufo-high-bay: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-canopy-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-reading-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bankers-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lava-lamp-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-candle-wall-sconce: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-led-corner-pole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-office-floor-uplight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-tree-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ceiling-flush: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-tea-table-korean: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-footstool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-tuxedo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-channel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-side-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-library-ladder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-standing-white: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-console-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-magazine-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-lever-arch-file: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-archive-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-paper-shredder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-hand-tally-counter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-key-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-garden-gate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-succulent: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-bullet-thermal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-security-guard-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-glass-break-detector: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-patch-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-telecom-mdf-frame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-emergency-power-off: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-ptz-dome-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-esd-workbench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa5-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-tote-cubbies: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-speed-gate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-video-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-phone-booth: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-planter-divider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-medallion: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-wall-fold: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-wall-bar-ledge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-bench-storage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-bakers-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-corner-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-tea-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bar-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-toy-chest-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-baby-swing: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-picnic-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-toy-piano: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-pantry-glass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-open-wall-shelves: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-soap-dispenser-sponge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-tall-cabinet-fridge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-range-hood-slim: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-sink-counter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-jeju-basalt-rock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-deck-boardwalk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-gnome: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-armillary-sphere: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-led-ring-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-square-ceiling-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-portable-cordless-table-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-gooseneck-bedside-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-globe-table-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-swing-arm-wall-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-troffer-louvre: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-floor-lamp-tripod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-table-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-nesting-tables: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-floor-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-magazine-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-log-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-chesterfield: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-channel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-lawson-skirted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-monitor-riser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-standing: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-wood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-monitor-ultrawide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-corner-bookcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-3d-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-rotary-trimmer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-paper-carton: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-cork-notice-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-office-wall-clock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-canopy-daybed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-plant-tulips-vase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-dual: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-palm-vein-reader: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-guard-master-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-bullet-varifocal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-multisensor-panoramic: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-intruder-alarm-control-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-cablemgr-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-pdu-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-nas-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-web: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-crac-downflow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-fire-suppression-cylinders: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-aspirating-smoke-detector: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa6-modular: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-magazine-files: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-tiered-seating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-lobby-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-cluster-3: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-water-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-tulip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-square: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bunk-bed-stairs: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-art-easel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-teddy-bear: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-dresser-colour: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-crib-co-sleeper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-learning-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-indoor-swing-frame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-tunnel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-balance-bike: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wine-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-base-cabinet-sink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-electric-kettle-copper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-island: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-birch-clump: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-palm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-privet-hedge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-topiary-cone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-edging-brick-dogtooth: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-spike-spotlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-trimless-downlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-led-panel-640: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-emergency-bulkhead: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-moroccan-lantern: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-table-lamp-brass-empire: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-linear-pendant-brass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-emergency-twin-spot: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-recliner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-wingback-tartan: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-floor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-chesterfield: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-floor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-desk-corner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-desk-floating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-cupboard-sliding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bookcase-cabinet-oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-filing-cabinet-vertical: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-cane-desk-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-nas: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-binder-row: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-mail-sorter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-air-plants-driftwood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-video-wallpad: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-bullet-analog: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-lpr-pole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-ptz-speed-dome-pole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-monitor-wall-arm: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-security-bollard-row: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-patch-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-blank-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-ups-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-kvm-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-row: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-fibre-raceway: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-restricted-area-sign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa5-chesterfield: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-desk-screen-clamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-fire-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-stacking-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-vending-drink: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-plotter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-coat-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-logo-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-decor-kilim-rug: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-throw-pillow-lumbar-mustard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-books-row: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-crib-oval: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-changing-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-train-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-crib-convertible-natural: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bed-triple-bunk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-safety-gate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-soft-play-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-sling-bookshelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-mini-trampoline: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-drum-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-crib: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-utensil-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-tall-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-persimmon: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-metasequoia: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-boxwood-ball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-pampas-grass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-gravel-path-steel-edge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-stone-lantern-seokdeung: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pleated-table-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-vapour-proof-batten: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-bathroom-ip44-ceiling: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-under-shelf-light-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-backlit-round-mirror: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-track-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pendant-light-globe-opal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pendant-cluster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-floor-lamp-arc: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-led-strip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-sofa-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-window-seat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-side-table-c-marble: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-midcentury: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-plan-chest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-floating-ledges: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-laminator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-floor-directory-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-fence-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-floodlight-camera: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-dvr-16ch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-sliding-security-gate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-guard-booth: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-electronic-key-management: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-router-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-backup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-wall-cabinet-6u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-ladder-cable-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-l-3x2-right: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-module-chaise: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-open-frame-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-desk-operator: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-manager-l: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair-slat-back: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-crib-convertible: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-toy-cubbies: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-rocking-horse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-table-stools-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-busy-board: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-end-shelf-unit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-pot-rail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-fruit-bowl: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-tall-cabinet-pantry: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-toaster-four: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wall-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cooktop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-magnolia: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-fern-clump: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-edging-stone-kerb: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-edging-timber-sleeper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-wall-fountain-lion: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-popup-sprinkler-heads: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-tool-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-wash-cylinder-sconce: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-rod-cluster-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-paper-column-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sphere-floor-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-mushroom-table-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-linear-suspended: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-step-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-surface-cylinder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-arched-bookcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-rocking-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-corner-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-recliner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-boxy-wide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-scandi: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-study-desk-ladder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-l-left-oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-wall-fold-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-room-name-sign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-gate-wide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-photoelectric-beam-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-deposit-drop-safe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-server2u-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-fan-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-blade: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-network-tool-kit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-covered-cable-trunking: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-transfer-switch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-biometric-door-reader: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-server-lift: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-module-armless: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-pullout-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa2-recliner-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-under-stairs: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-shoe-bench-cubby: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-divider-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-booth-seating: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-recycling-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-printer-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-partition-high: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-sawhorse: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-cradle-rocking: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-house-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-slide: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-night-lamp-cloud: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-high-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-push-walker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-baby-walker-seated: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-potty: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-dress-up-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-toy-box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wall-cabinet-flap: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-magnetic-knife-strip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-dogwood: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-hydrangea-bush: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wagon-wheel-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-led-panel-round: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pendant-light-bell-copper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-exit-sign: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pendant-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wall-sconce: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-pouf-knitted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-oval: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-chaise-longue: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-bean-bag-mustard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-floor-mirror-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-chesterfield: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-coffee-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bookcase-glass-doors: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-pc-all-in-one: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-office-chair-executive-cognac: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-low-bookcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-inkjet-printer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-filing-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-dome: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-electric-strike: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-lobby-entrance-phone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-panic-button-under-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-switch1u-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-switch-core-14u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-brush-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-db: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-in-row-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-overhead-cooling-module: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-floor-tile-perforated: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-overhead-busway: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-cable-waterfall-drop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-modular-ups-frame: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa5-track: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-slope-leather: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-u-chaise: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-chaise-left: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-apothecary: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-pegboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-rolling-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-meeting-pod-4: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-server-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-mini-sofa: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-baby-bouncer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-play-shop: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-tool-workbench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-football-goal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wall-drop-leaf-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wall-cabinet-glass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-cooktop-gas: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-sink-counter-long: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-ginkgo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-standard-ball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-granite-slab-path: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-paver-path: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-in-ground-uplight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-tap-post: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-gimbal-downlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-opal-globe-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-square-downlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-hanji-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-travertine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-ladder-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-game-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-display-cabinet-black: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-executive: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-tablet-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-ip-camera-fisheye: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-reader-touch: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-gate-swing: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-gate-flap: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-bullet-long-range: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-server1u-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-ups-3u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-hpc: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-cold-aisle-pod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-crac-upflow-ducted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-floor-tile-lifter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-temperature-humidity-sensor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-security-cage-door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-aisle-sliding-door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-noc-console-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-led-linear-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa-module-corner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-umbrella-stand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-utility-cupboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-hook-rail: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-glass-whiteboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-pantry-island: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-vending-snack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-conf-10: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-coffee-point: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-table-tripod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-study-desk-adjustable: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-rice-dispenser: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-oil-vinegar-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-base-cabinet-drawers: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-wall-cabinet-single: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-stand-mixer-cream: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-retaining-wall-blocks: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-jangseung-pair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-garden-wall-brick-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-sundial-pedestal: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-plant-label-stakes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-glass-dome-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-square-multi-head: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-deep-anti-glare-downlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-led-panel-600: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-virtual-sky-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-rectangle-frame-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-up-down-wall-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-swing-reading-wall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-console-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-midcentury: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-tuxedo: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bookshelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-bookcase-barrister: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-divider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofx-ladder-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-voice-recognition-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-long-range-uhf-reader: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-gate-tripod: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-controller-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-door-lock-rim: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-outdoor-siren-strobe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-walk-through-metal-detector: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-radio-multi-charger: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-sign-restricted: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-storage: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-security: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-open-frame-2-post: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-wall-precision-ac: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-steel-fire-door: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-outdoor-chiller: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-industrial-dehumidifier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-battery-string-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-security-mantrap: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa4-chaise-right: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-basket-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-garment-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-ottoman: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-supply-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-coffee-bean-to-cup: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-glass-door-fridge: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-partition-glass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-training-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-task-chair-red: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-throw-blanket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-stovetop-kettle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-base-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-artificial-turf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-granite-slab-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-solar-stake-lights: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-oscillating-sprinkler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-hose-reel-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-wall-trellis-climber: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-gabion-planter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-recessed-linear-profile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-glow-cube-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-stair-recessed-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ring-chandelier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-magnetic-track: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-bean-bag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-lift: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-desk-secretary: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-out-deck-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-full-height-turnstile: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-mini-dome: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-ptz-joystick-keyboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-sign-checkpoint: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-blade-10u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-cablemgr-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-patch-cord-hanger: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-bin-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-hall-tree: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-corner-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpx-signage-kiosk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-saddle-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-nesting-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-ups-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-mail-sorter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-table-chairs-set: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-playpen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-oven-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-larder-cupboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-plate-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-tree-spruce: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-asymmetric-wall-washer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-dome-ceiling-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-crystal-flush-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-cove-led-strip: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-surface-spotlight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-marble: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-meeting-table: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ofp-wall-planner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-alarm-keypad: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-firewall-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-network: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-fibre-splice-enclosure: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-floor-tile-cutout: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-vertical-cable-manager: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-spare-parts-shelving: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-floor-modular: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-sliding-wardrobe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-ladder-shelf: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-sled-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-wobble-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-tambour: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-soban: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-toddler-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-step-stool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-teepee-grey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-standard-rose: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-gravel-bed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-kinetic-wind-spinner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-suspended-up-down-linear: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-hanji-square-ceiling: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tiffany-table-lamp: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-side-table-c: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-piano-bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa3-chesterfield-leather: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-meeting-table-oval: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-cctv-housing-wiper: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-gpu4u-4u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-mixed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-half-rack-24u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-rear-door-cooler: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-floor-tile-glass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-step-bookcase: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-garage-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-tool-chest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-queue-posts: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-bean-bag-mustard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-seesaw: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-corner-base-cabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-wildflower-meadow: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-gooseneck-reading-wall-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-ltx-alabaster-sconce: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-wingback: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-shelf-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-console-1u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-empty-42u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-wall-cabinet-18u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-hot-aisle-chimney: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-seismic-base: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-fire-alarm-control-panel: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sectional-l-4x2-right: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-steamer-trunk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-vitrine: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-boot-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wpy-microwave-station: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-lockers-tall: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kids-growing-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-kitchen-paper-towel-holder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-path-light-mushroom: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-wall-grazer-bar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-linear-pendant: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-chandelier-grand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-pouf-leather: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-brass: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-reception-desk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-body-camera-dock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sec-hydraulic-road-blocker: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-battery-2u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-rack-gpu: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-wire-basket-tray: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-open-wardrobe: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-bookcase-doors: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lgx-plate-wall-light: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-living-coffee-table-two-tier: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-tv-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-dev-tape-4u: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-suppression-nozzle: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-kvm-crash-cart: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-wall-cubes: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-drawer-tower: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-entry-console: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-lsc-climbing-obelisk: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-sofa1-egg: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-srv-anti-static-floor-mat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-blanket-chest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-crate-stack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-shoe-rack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-dining-chair: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-storage-floating-shelves: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sb-wp-credenza: parts are valid and fit its box | view3d | 0.0 ms |

</details>

<details open><summary><b>Furniture library</b> · 가구 라이브러리 — 9 tests, 1 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ❌ | the thumbnail sprite has a picture of every item (npm run build:furniture) | library | 3.7 ms |
| ✅ | a model entry carries its model; placing it puts the model and a copy of the entry in the project | library | 2.4 ms |
| ✅ | one item: its size, colour and turn kept, centred | library | 1.7 ms |
| ✅ | at least 500 items over every category, each with a Korean name | library | 0.9 ms |
| ✅ | older kinds are all still there with their sizes | library | 0.5 ms |
| ✅ | library files: written, read back, merged without duplicates | library | 0.5 ms |
| ✅ | several items: kept relative to each other, placed as one group | library | 0.3 ms |
| ✅ | normalizeEntry drops broken entries and unknown kinds | library | 0.2 ms |
| ✅ | every category, and favourites / my library / recent, has its own icon | library | 0.1 ms |

</details>

<details><summary><b>Materials & asset library</b> · 재료·에셋 라이브러리 — 12 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | first install: everything downloaded with progress; a second run has nothing to do | assetlib | 3.7 ms |
| ✅ | patterns are valid and fit a texture | presets | 3.1 ms |
| ✅ | only what is missing is downloaded; Reinstall (force) downloads all | assetlib | 2.7 ms |
| ✅ | failures: reported (file and reason), not retried; the rest is still installed; a short file is refused | assetlib | 2.7 ms |
| ✅ | made of every texture set's maps (1k JPEG) and every HDRI (1k, 2k for the main ones) | assetlib | 1.9 ms |
| ✅ | all of MySketchBook's presets join the library, ids unique, building library unchanged | presets | 1.7 ms |
| ✅ | 3D: physical materials where the preset asks (sheen, clearcoat, glass), plain otherwise | presets | 1.3 ms |
| ✅ | every preset has a Korean name | presets | 0.7 ms |
| ✅ | textures that arrive later reach the material and the depth-ranked copies made of it (floors) | presets | 0.7 ms |
| ✅ | texture sets: each preset's set is in the shipped metadata and in the library's download list | presets | 0.6 ms |
| ✅ | the plan: one API request per asset, a file the API lacks is reported | assetlib | 0.3 ms |
| ✅ | an edited colour (project materials) reaches the preset's material; textures are tinted to it | presets | 0.2 ms |

</details>

<details><summary><b>SketchUp modelling</b> · 스케치업 모델링 — 77 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | IFC: a mesh mass (with a hole in a face) is a faceted Brep and comes back exactly | sketchup | 15 ms |
| ✅ | DXF export of a project with mesh masses, components and terrain works | sketchup | 8.2 ms |
| ✅ | union, subtract (cutter goes), trim (cutter stays), intersect and split | sketchup | 7.9 ms |
| ✅ | a courtyard block: walls around the courtyard too, the slab has a hole | massing | 5.8 ms |
| ✅ | offset a loop into the top face, then pull it up and push it in (recess) and through (hole) | mesh | 5.1 ms |
| ✅ | a box becomes walls, slabs, a room and windows per level, a door and a flat roof; the mass is gone | massing | 4.6 ms |
| ✅ | an old project (no SketchUp data) loads with every new list and the default style | sketchup | 3.6 ms |
| ✅ | subtract a cylinder right through: a hole in the top face | mesh | 3.5 ms |
| ✅ | a 9.5 m box over 3 m levels takes three levels (new ones added); 10 m takes four | massing | 3.5 ms |
| ✅ | terrain from contour lines in the plan, then smoove a hill | sketchup | 2.4 ms |
| ✅ | a stepped mass (a podium and a tower) gives smaller floors higher up | massing | 2.3 ms |
| ✅ | pushing a face of a mass in carves a recess; a line across a face splits it | sketchup | 2.2 ms |
| ✅ | a mass with a mesh takes its footprint, base and height from the mesh; bad meshes are dropped | sketchup | 1.9 ms |
| ✅ | intersect faces imprints the edges on both masses | sketchup | 1.5 ms |
| ✅ | union of overlapping boxes | mesh | 1.5 ms |
| ✅ | a rectangle drawn on top of a mass becomes a face that pulls up into a tower | sketchup | 1.4 ms |
| ✅ | everything survives save and load | sketchup | 1.4 ms |
| ✅ | split gives the three parts | mesh | 1.3 ms |
| ✅ | an open surface is refused by the solid tools | sketchup | 1.3 ms |
| ✅ | an open line is kept as loose edges; follow me sweeps a face along them | sketchup | 1.1 ms |
| ✅ | the footprint of an L-shaped mass is the L (not its hull) | mesh | 1.1 ms |
| ✅ | explode, replace and the furniture definitions (same kind = same definition) | sketchup | 1.1 ms |
| ✅ | terrain from contours lies between the contour heights | mesh | 1.1 ms |
| ✅ | copy and paste carry the definition along to another drawing | sketchup | 1.0 ms |
| ✅ | solids on an upper level keep their height (meshes are stored from the level floor) | sketchup | 1.0 ms |
| ✅ | a terrain grid, its height and smoove | mesh | 1.0 ms |
| ✅ | components, materials, sections and notes are cleaned; one active section; lost definitions fall back | sketchup | 1.0 ms |
| ✅ | subtract with coplanar faces: a slot cut from the top | mesh | 0.9 ms |
| ✅ | editing the definition updates every instance; make unique splits one off | sketchup | 0.9 ms |
| ✅ | lines drawn in 3D that close together work too; lines that do not close do not | massing | 0.9 ms |
| ✅ | move lifts masses (and their meshes) and furniture | sketchup | 0.8 ms |
| ✅ | a prism mesh is closed, faces outwards and has the right volume; taper 0 is a pyramid | mesh | 0.8 ms |
| ✅ | a box cut at mid-height gives its footprint | massing | 0.8 ms |
| ✅ | a face drawn on the ground becomes as many levels as asked for | massing | 0.8 ms |
| ✅ | a vertical path: a column from a circle | mesh | 0.8 ms |
| ✅ | plan move / rotate / mirror / scale keep a mesh mass closed and in step with its footprint | sketchup | 0.8 ms |
| ✅ | normalizeMesh drops broken loops and indices; weld joins duplicate vertices | mesh | 0.7 ms |
| ✅ | rotate about a vertical axis (polar array), and tip a mass about a horizontal axis | sketchup | 0.7 ms |
| ✅ | a square with a square hole: the triangles cover exactly the ring | mesh | 0.7 ms |
| ✅ | a cutting component glues into a wall as an opening | sketchup | 0.7 ms |
| ✅ | imprint (intersect faces) adds edges but keeps the solid | mesh | 0.7 ms |
| ✅ | follow me around the top face of a mass (a cornice) | sketchup | 0.7 ms |
| ✅ | pulling a drawn rectangle makes a closed box, either way | mesh | 0.6 ms |
| ✅ | make a component from masses: one definition, one instance in their place | sketchup | 0.6 ms |
| ✅ | materials of both solids survive a union | mesh | 0.6 ms |
| ✅ | a square profile along an L path: closed, volume = area × centre-line length | mesh | 0.5 ms |
| ✅ | union of boxes sharing a face merges the coplanar faces (one box) | mesh | 0.5 ms |
| ✅ | a side face of a box stretches too | mesh | 0.5 ms |
| ✅ | scale masses about a point, non-uniformly, and furniture by its own axes | sketchup | 0.5 ms |
| ✅ | a line across a face splits it in two; pulling one half up keeps the solid closed | mesh | 0.5 ms |
| ✅ | the top of a box stretches (same faces, new height) and cannot collapse | mesh | 0.5 ms |
| ✅ | a rectangle drawn inside a face becomes its own face (and a hole in the old one) | mesh | 0.4 ms |
| ✅ | a rectangle drawn on the ground is a face; pulled up it is a closed box | sketchup | 0.4 ms |
| ✅ | copy arrays: ×4 at the distance, /4 between | sketchup | 0.4 ms |
| ✅ | intersect of overlapping boxes and of touching boxes | mesh | 0.4 ms |
| ✅ | transform, mirror and rotate keep a closed mesh closed and outwards | mesh | 0.4 ms |
| ✅ | subtract / intersect of disjoint solids | mesh | 0.4 ms |
| ✅ | union of identical boxes is the box | mesh | 0.4 ms |
| ✅ | a profile with a hole sweeps into a hollow tube | mesh | 0.3 ms |
| ✅ | a project's own materials are looked up before the library (and can edit a library material) | sketchup | 0.3 ms |
| ✅ | existing levels are used with their own heights | massing | 0.3 ms |
| ✅ | around a closed rectangle (a cornice): closed ring without caps | mesh | 0.3 ms |
| ✅ | offset that would turn the loop inside out is refused | mesh | 0.3 ms |
| ✅ | guides, 3D dimensions and text are erased like any item | sketchup | 0.3 ms |
| ✅ | keep the mass: it stays, hidden | massing | 0.3 ms |
| ✅ | a loop inside another is its courtyard; slivers are dropped | massing | 0.3 ms |
| ✅ | insideFace knows the outer loop and the holes | mesh | 0.3 ms |
| ✅ | collinear path points are skipped; a path that doubles back is refused | mesh | 0.3 ms |
| ✅ | section planes: one active at a time, flip and move | sketchup | 0.2 ms |
| ✅ | a concave L and collinear points triangulate without gaps | mesh | 0.2 ms |
| ✅ | a vertical surface still has a usable plan footprint | mesh | 0.2 ms |
| ✅ | a stretch is only offered when every touching face is perpendicular | mesh | 0.2 ms |
| ✅ | Ctrl push/pull always starts a new extrusion | mesh | 0.2 ms |
| ✅ | isSolid knows open and inside-out meshes | mesh | 0.2 ms |
| ✅ | the plane above or below the mass cuts nothing | massing | 0.1 ms |
| ✅ | meshFromPolygons merges split triangles of one face back into one face | mesh | 0.1 ms |
| ✅ | segments chain into a closed loop whatever their direction | massing | 0.1 ms |

</details>

<details><summary><b>CAD exchange (DXF, DWG, SVG, plan pictures)</b> · CAD 교환 (DXF, DWG, SVG, 평면도 그림) — 116 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | apt104-furniture-lines-en.png | planpicture | 1.31 s |
| ✅ | villa-interior.png | planpicture | 1.06 s |
| ✅ | apt74-furniture-lines.png | planpicture | 1.04 s |
| ✅ | apt59-interior.png | planpicture | 881 ms |
| ✅ | apt74-brochure.png | planpicture | 798 ms |
| ✅ | apt104-blueprint.png | planpicture | 683 ms |
| ✅ | loft-furniture-lines.png | planpicture | 657 ms |
| ✅ | apt84-cad-print.png | planpicture | 618 ms |
| ✅ | apt74-tower-cad.png | planpicture | 508 ms |
| ✅ | cafe-blueprint.png | planpicture | 363 ms |
| ✅ | a picture drawn here: the walls, the door and both rooms where the underlay is | planpicture | 263 ms |
| ✅ | a tilted picture is straightened, the underlay turned with it | planpicture | 213 ms |
| ✅ | Large drawings: object map pages and long objects | dwgwrite | 71 ms |
| ✅ | A binary DXF (2-byte group codes) imports exactly like its ASCII twin | dxfbin | 41 ms |
| ✅ | A project exported as DWG imports like its DXF export (R2000 DXF path) | dwgwrite | 26 ms |
| ✅ | Exporting a project and importing it back keeps every semantic layer | dxf | 13 ms |
| ✅ | AutoCAD 2000+ exports import back like the R12 file (same drawing, same texts) | dxfbin | 8.8 ms |
| ✅ | The R12 DXF export converts to the same DWG content | dwgwrite | 6.0 ms |
| ✅ | Every supported entity type of a hand-written DXF survives the DWG | dwgwrite | 5.8 ms |
| ✅ | Lineweights, layer descriptions, true colour and text encoding by version | dxfbin | 5.7 ms |
| ✅ | A truncated binary DXF fails with a clear message; binary text without bytes is refused | dxfbin | 5.6 ms |
| ✅ | a small R2000 drawing imports exactly like the same drawing as DXF | dwg | 5.5 ms |
| ✅ | R12 binary DXF with 1-byte group codes and the 255 escape for 1000+ | dxfbin | 5.1 ms |
| ✅ | The file is structurally complete: CRCs, sentinels, object map, handle seed | dwgwrite | 4.2 ms |
| ✅ | DWG: RAY, XLINE, MLINE and a SAT 3DSOLID read like their DXF | cadextra | 3.6 ms |
| ✅ | Binary round trip of an AutoCAD 2018 export (2-byte codes, handles and xdata) | dxfbin | 3.3 ms |
| ✅ | AutoCAD 2000 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 3.2 ms |
| ✅ | Korean room names survive the round trip as \U+ escapes in pure ASCII | dxf | 3.1 ms |
| ✅ | AutoCAD 2007 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 3.0 ms |
| ✅ | AutoCAD 2018 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 2.8 ms |
| ✅ | AutoCAD 2004 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 2.7 ms |
| ✅ | rays and construction lines are clipped to twice the drawing extents | cadextra | 2.7 ms |
| ✅ | AutoCAD 2010 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 2.6 ms |
| ✅ | AutoCAD 2013 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 2.3 ms |
| ✅ | The exported file is R12 with header, tables, entities and EOF | dxf | 2.1 ms |
| ✅ | Arcs keep their orientation through export and import | dxf | 1.9 ms |
| ✅ | An embedded image becomes a tracing underlay placed by the SVG transforms | svgimport | 1.9 ms |
| ✅ | Furniture becomes one block per kind and size, inserted once per piece | dxfbin | 1.9 ms |
| ✅ | Image headers: PNG, GIF, JPEG, BMP, WebP and SVG sizes; data URIs | svgimport | 1.7 ms |
| ✅ | Imported wall outlines span the wall extents within one millimetre | dxf | 1.7 ms |
| ✅ | errors: not a DWG, too old, truncated | dwg | 1.6 ms |
| ✅ | SVG paths with curves and arcs keep exact segment end points | dxf | 1.6 ms |
| ✅ | Percent signs and multi-line texts survive the round trip | dxf | 1.6 ms |
| ✅ | SVG viewBox and millimetre width scale user units to millimetres | dxf | 1.5 ms |
| ✅ | Texts come back at the same top-left anchor, size and rotation | dxf | 1.5 ms |
| ✅ | Typed walls get one layer boundary line per inner layer and piece on A-WALL-PATT | dxf | 1.5 ms |
| ✅ | multileaders draw their leader, arrowhead, dogleg and text | cadextra | 1.3 ms |
| ✅ | bit reader: bit codes (B, BB, BS, BL, BD, DD, RC across byte edges, H, MS-free text) | dwg | 1.3 ms |
| ✅ | ACIS (SAT text): straight and elliptical edges become lines and arcs | cadextra | 1.3 ms |
| ✅ | layouts: listed in tab order; a layout shows its entities and the model through its viewports | cadextra | 1.3 ms |
| ✅ | Only the requested level is exported | dxf | 1.2 ms |
| ✅ | Project drawing layers keep their name, colour and visibility | dxf | 1.2 ms |
| ✅ | Text on a path comes in straight along the start of the path | svgimport | 1.1 ms |
| ✅ | The door swing arc ends at the open leaf tip and the closed position | dxf | 1.1 ms |
| ✅ | Mass models export their outline and height on A-MASS | dxf | 1.1 ms |
| ✅ | tables show their anonymous block, or a grid built from their rows and columns | cadextra | 1.0 ms |
| ✅ | Wall and opening phases select the existing and demolition layers | dxf | 1.0 ms |
| ✅ | DXF versions on offer: R12 first, then AutoCAD 2000 … 2018 | dxfbin | 0.9 ms |
| ✅ | underlay placement: corner, scale and turn | planpicture | 0.8 ms |
| ✅ | Text in the drawing code page: ANSI_1252 bytes, \U+XXXX for the rest | dwgwrite | 0.8 ms |
| ✅ | Structural grids export a centre line with labelled bubbles on every level | dxf | 0.8 ms |
| ✅ | entities without a reader are drawn from their proxy graphics | cadextra | 0.7 ms |
| ✅ | Images linked by a relative path are read next to the SVG (desktop) | svgimport | 0.7 ms |
| ✅ | Binary values: doubles, 16/32/64-bit integers, booleans, binary chunks and strings | dxfbin | 0.6 ms |
| ✅ | wipeouts become their boundary, images their frame and an underlay request | cadextra | 0.6 ms |
| ✅ | SVG rect, circle, ellipse and polygon become CAD geometry | dxf | 0.6 ms |
| ✅ | A SPLINE is evaluated from its control points and knots | dxf | 0.6 ms |
| ✅ | ACIS 1.x SAT (R13/R14: no header lines, numeric sense) and SAB binary read alike | cadextra | 0.5 ms |
| ✅ | SVG text and tspan lines become texts with size, anchor and colour | dxf | 0.5 ms |
| ✅ | fitted splines: interpolation passes through every fit point | dwg | 0.5 ms |
| ✅ | external references are drawn from the given drawing on XREF\|layer layers, or reported | cadextra | 0.5 ms |
| ✅ | unreadable objects are skipped and counted | dwg | 0.5 ms |
| ✅ | <use> of a <symbol>, and clip paths ignored with a note | svgimport | 0.5 ms |
| ✅ | An INSERT rotated 90 degrees and scaled 2 maps block geometry through its base point | dxf | 0.5 ms |
| ✅ | SVG stroke colours come from attributes, style and CSS classes | dxf | 0.5 ms |
| ✅ | HATCH boundary paths become closed polylines | dxf | 0.4 ms |
| ✅ | SVG group transforms are inherited and composed | dxf | 0.4 ms |
| ✅ | R2007 LZ77: shuffled literal runs and back-references | dwg | 0.4 ms |
| ✅ | The units option overrides the header and unitless drawings are guessed from their extent | dxf | 0.4 ms |
| ✅ | multilines draw one line per element, offset along the miters | cadextra | 0.4 ms |
| ✅ | multi-line attributes (embedded MTEXT) keep their line breaks | cadextra | 0.4 ms |
| ✅ | SVG hidden content, defs, use references and unsupported elements are handled | dxf | 0.4 ms |
| ✅ | MTEXT formatting codes are stripped and paragraphs become new lines | dxf | 0.4 ms |
| ✅ | Mirrored, arrayed and nested INSERTs are expanded | dxf | 0.4 ms |
| ✅ | Binary and non-DXF input is rejected with a clear error | dxf | 0.3 ms |
| ✅ | Binary DXF before 2007 decodes texts per $DWGCODEPAGE | dxfbin | 0.3 ms |
| ✅ | An LWPOLYLINE bulge of 1 becomes a semicircle through the expected midpoint | dxf | 0.3 ms |
| ✅ | Layer colours, frozen and off layers and entity colours are imported | dxf | 0.3 ms |
| ✅ | A full ELLIPSE is a closed polyline and a partial one starts and ends on its parameters | dxf | 0.3 ms |
| ✅ | DXF bytes in a legacy code page are decoded from $DWGCODEPAGE | dxf | 0.3 ms |
| ✅ | An extrusion direction of (0,0,-1) mirrors entities in x | dxf | 0.2 ms |
| ✅ | R2004 LZ77: literal runs, short and long back-references, end marker | dwg | 0.2 ms |
| ✅ | checksums: CRC-16 (DWG seed) and CRC-32 match the standard check values | dwg | 0.2 ms |
| ✅ | Mirrored and unreadable images are noted | svgimport | 0.2 ms |
| ✅ | R2013+ ACIS data storage: blobs are found by entity handle | cadextra | 0.2 ms |
| ✅ | A DIMENSION draws its anonymous block | dxf | 0.2 ms |
| ✅ | SVG arc flags may be written without separators | dxf | 0.2 ms |
| ✅ | bit reader: BLL, object type (OT) and Unicode text (TU) | dwg | 0.2 ms |
| ✅ | version detection | dwg | 0.2 ms |
| ✅ | the recogniser's openings in this app's terms | planpicture | 0.2 ms |
| ✅ | Paper space entities are skipped | dxf | 0.2 ms |
| ✅ | A closed LWPOLYLINE keeps its closed flag without repeating the first vertex | dxf | 0.1 ms |
| ✅ | An old-style POLYLINE with VERTEX records and a bulge is read | dxf | 0.1 ms |
| ✅ | Unknown entities are counted with one warning per type | dxf | 0.1 ms |
| ✅ | MTEXT attachment points place the text block | dxf | 0.1 ms |
| ✅ | A HATCH arc edge is flattened along the right side | dxf | 0.1 ms |
| ✅ | $INSUNITS 5 scales centimetres to millimetres | dxf | 0.1 ms |
| ✅ | clipping keeps the parts of a polyline inside a rectangle | cadextra | 0.1 ms |
| ✅ | A DXF ARC maps to a1 = -start, a2 = -end, ccw = true and keeps its points | dxf | 0.1 ms |
| ✅ | TEXT baseline insertion becomes the top anchor and DXF rotation is negated | dxf | 0.1 ms |
| ✅ | SOLID and 3DFACE become outlines and POINT is only counted | dxf | 0.1 ms |
| ✅ | An arc that wraps through 0 degrees keeps its short sweep | dxf | 0.1 ms |
| ⏭️ | corpus: every DWG reads | dwg | 0.0 ms |
| ⏭️ | corpus: R2000 file header and object map CRCs are valid | dwg | 0.0 ms |
| ⏭️ | corpus: multileaders, tables, wipeouts, rays, multilines and ACIS solids in every release | cadextra | 0.0 ms |
| ⏭️ | corpus: layouts of a DWG read like those of its DXF | cadextra | 0.0 ms |

</details>

<details><summary><b>Printing & PDF</b> · 인쇄·PDF — 11 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | PDF structure: header, xref offsets, trailer, page tree and page sizes | pdf | 25 ms |
| ✅ | A real plan sheet (SvgContext + drawPlan) becomes one compressed vector page | pdf | 10 ms |
| ✅ | the list: PNG first, AVIF only where the canvas writes it, every id unique | imageformats | 1.4 ms |
| ✅ | Images: JPEG as DCTDecode, PNG through the predictor, others left out with a note | pdf | 1.0 ms |
| ✅ | Texts: Helvetica for Latin, the Korean CID font for Hangul, anchors and baselines | pdf | 0.9 ms |
| ✅ | Drawing operators: page CTM, clip, paths, dashes, opacity, fills and strokes | pdf | 0.7 ms |
| ✅ | Empty input is refused | pdf | 0.4 ms |
| ✅ | PDF: one page the size of the picture, the JPEG stored as it is, a correct cross-reference table | imageformats | 0.3 ms |
| ✅ | TIFF: little-endian baseline file whose tags lead to the pixels | imageformats | 0.2 ms |
| ✅ | BMP: 24-bit, rows bottom-up and padded to 4 bytes | imageformats | 0.2 ms |
| ✅ | TGA: uncompressed true colour, top-left origin, alpha when asked | imageformats | 0.1 ms |

</details>

<details><summary><b>BIM exchange (IFC, ifcXML)</b> · BIM 교환 (IFC, ifcXML) — 25 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every sample survives IFC → ifcXML → IFC with the same elements (both schemas) | ifcxml | 146 ms |
| ✅ | .ifczip holding .ifc or .ifcxml is deflated and reads like the plain file | ifcxml | 86 ms |
| ✅ | IFC4: our IFC export as ifcXML reads back to the same entity graph and project | ifcxml | 70 ms |
| ✅ | IFC2X3: our IFC export as ifcXML reads back to the same entity graph and project | ifcxml | 52 ms |
| ✅ | the exported IFC4 file is valid STEP with resolvable references and unique GlobalIds | ifc | 18 ms |
| ✅ | a project survives a round trip through IFC4 | ifc | 12 ms |
| ✅ | special characters survive in names and property values | ifcxml | 10 ms |
| ✅ | IFC4 ifcXML: attributes, xsi:type references and nested inverse relationships | ifcxml | 8.8 ms |
| ✅ | attribute order and inheritance come from the EXPRESS schemas | ifcxml | 6.9 ms |
| ✅ | IFC4: the owner pointers the XSD leaves out go through inverse elements | ifcxml | 5.3 ms |
| ✅ | the exported IFC2X3 file is valid STEP with resolvable references and unique GlobalIds | ifc | 4.7 ms |
| ✅ | IFC4 proxies from other programs: plain extrusions become solids, other bodies are skipped | ifc | 4.6 ms |
| ✅ | a project survives a round trip through IFC2X3 | ifc | 4.5 ms |
| ✅ | IFC2X3 proxies from other programs: plain extrusions become solids, other bodies are skipped | ifc | 3.7 ms |
| ✅ | the IFC4 export carries the BIM data in standard IFC entities | ifc | 3.4 ms |
| ✅ | IFC2x3 ifcXML: iso_10303_28 / uos, element values, wrapper lists, metres | ifcxml | 3.4 ms |
| ✅ | IFC4 mass solids are an extrusion or a closed faceted Brep, and groups are IfcGroups | ifc | 2.6 ms |
| ✅ | the IFC2X3 export carries the BIM data in standard IFC entities | ifc | 2.2 ms |
| ✅ | IFC2X3 mass solids are an extrusion or a closed faceted Brep, and groups are IfcGroups | ifc | 1.9 ms |
| ✅ | UTF-16 with a byte order mark, and a file that is not ifcXML | ifcxml | 1.8 ms |
| ✅ | an old project without BIM data still exports to IFC4 and reads back untyped | ifc | 1.5 ms |
| ✅ | .ifcxml and ifcXML in a .xml are recognised | ifcxml | 1.0 ms |
| ✅ | an old project without BIM data still exports to IFC2X3 and reads back untyped | ifc | 1.0 ms |
| ✅ | a hand-written IFC2X3 file in metres with a rotated wall placement imports in millimetres | ifc | 0.6 ms |
| ✅ | STEP strings decode '' escapes, backslashes and \X2\ Unicode | ifc | 0.1 ms |

</details>

<details><summary><b>Other BIM (SH3D, gbXML)</b> · 다른 BIM (SH3D, gbXML) — 114 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | 37-u-shaped-apartments.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.35 s |
| ✅ | 29-hotel.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 930 ms |
| ✅ | 32-residential-complex.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 458 ms |
| ✅ | 34-general-hospital.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 454 ms |
| ✅ | 35-courtyard-school.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 341 ms |
| ✅ | 11-mixed-use.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 164 ms |
| ✅ | 33-atrium-office.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 125 ms |
| ✅ | 10-office-tower.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 122 ms |
| ✅ | 30-university-library.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 73 ms |
| ✅ | 36-terraced-office.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 60 ms |
| ✅ | re-imported, the home comes back | sh3d | 58 ms |
| ✅ | the project is sound: normalized, no model-check errors, builds in 3D | interop | 39 ms |
| ✅ | 12-hospital.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 36 ms |
| ✅ | 15-sketchup-complex.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 35 ms |
| ✅ | model furniture is written from its GLB: geometry, colours and textures | sh3d | 31 ms |
| ✅ | 13-school.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 29 ms |
| ✅ | 08-apartment-block.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 21 ms |
| ✅ | 19-duplex.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 17 ms |
| ✅ | 38-museum.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 15 ms |
| ✅ | is unzipped and read like .ifc | interop | 14 ms |
| ✅ | 17-townhouse.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 13 ms |
| ✅ | 03-two-storey-house.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 12 ms |
| ✅ | 31-sports-centre.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 12 ms |
| ✅ | 23-bridges.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 9.8 ms |
| ✅ | 16-modern-villa.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 9.8 ms |
| ✅ | 18-modern-farmhouse.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 7.8 ms |
| ✅ | 14-courtyard-house.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 7.6 ms |
| ✅ | reads back through our importer: levels, walls, openings, rooms, the gable roof, north | gbxml | 6.1 ms |
| ✅ | an .sh3d with only the serialized Home imports like a Home.xml one | sh3d | 6.0 ms |
| ✅ | a ZIP with Home.xml and an OBJ model folder per shape | sh3d | 5.7 ms |
| ✅ | 02-two-bedroom.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 5.6 ms |
| ✅ | 40-penthouse.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 5.3 ms |
| ✅ | an .sh3d without Home.xml (saved before 5.3) gets a clear error | interop | 5.3 ms |
| ✅ | 01-studio.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 4.6 ms |
| ✅ | demolished elements are left out; mass models become shading | gbxml | 4.4 ms |
| ✅ | reads deflated and stored entries, UTF-8 names | interop | 4.3 ms |
| ✅ | catalog shapes on request: roofs become roofs of ours, no assets | sh3d | 4.2 ms |
| ✅ | 39-cafe-bistro.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 4.0 ms |
| ✅ | 06-renovation-bim.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.9 ms |
| ✅ | 21-interior-design.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.8 ms |
| ✅ | 04-small-office.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.5 ms |
| ✅ | 05-wooden-cabin.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.5 ms |
| ✅ | 20-compact-house.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.5 ms |
| ✅ | 09-cad-tracing.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.3 ms |
| ✅ | 22-lattice-towers.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.1 ms |
| ✅ | a bare Home.xml reads the same; .xml files are told apart by their root | interop | 3.0 ms |
| ✅ | 07-massing-study.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 2.9 ms |
| ✅ | the project is sound: normalized, no model-check errors, builds in 3D | interop | 2.8 ms |
| ✅ | faces that are no gable, hip or shed become a mass solid of those faces | gbxml | 2.7 ms |
| ✅ | the project normalizes, survives save / load and builds in 3D | sh3d | 1.9 ms |
| ✅ | gbXML 6.01 on request | gbxml | 1.9 ms |
| ✅ | 24-deck-arch-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.7 ms |
| ✅ | a Sweet Home 3D Home object maps onto the Home.xml element tree | sh3d | 1.7 ms |
| ✅ | 25-haunched-girder-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.6 ms |
| ✅ | 27-extradosed-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.5 ms |
| ✅ | 26-harp-cable-stayed-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.5 ms |
| ✅ | UTF-16 files (as Revit writes them) and sniffing .xml | interop | 1.5 ms |
| ✅ | length units: feet | interop | 1.4 ms |
| ✅ | 28-stress-ribbon-footbridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.3 ms |
| ✅ | no storeys: levels from the floor heights; not gbXML is refused | interop | 1.2 ms |
| ✅ | strings, boxed numbers, collections, arrays, enums, back references, reset | sh3d | 1.1 ms |
| ✅ | a gbXML file: one roof split per space, a mansard-like roof kept as faces, flat pieces joined | gbxml | 0.9 ms |
| ✅ | header, site, building, storeys and spaces | gbxml | 0.9 ms |
| ✅ | pieces with a packed model become model furniture of their size; shared models are one asset | sh3d | 0.9 ms |
| ✅ | every polygon is counter-clockwise from outside its first space | gbxml | 0.8 ms |
| ✅ | a floor in pieces is joined, gable walls stop at the eaves, a survey datum is moved to 0 | interop | 0.7 ms |
| ✅ | gable at 0° | gbxml | 0.6 ms |
| ✅ | loadModelFile: pre-rotation and fitting to a size | sh3d | 0.6 ms |
| ✅ | recolorModel paints a whole model or one material, leaving the shared asset alone | sh3d | 0.6 ms |
| ✅ | furniture names and catalog ids (several languages) | interop | 0.6 ms |
| ✅ | Home.xml follows the DTD: element order, attribute lists, required attributes, ids | sh3d | 0.5 ms |
| ✅ | a home without levels is one level at the home's wall height | interop | 0.5 ms |
| ✅ | separate roofs that only meet at their eaves stay separate | gbxml | 0.3 ms |
| ✅ | rejects data that is not a ZIP | interop | 0.3 ms |
| ✅ | surface types and the spaces on either side | gbxml | 0.3 ms |
| ✅ | modified UTF-8 and errors | sh3d | 0.3 ms |
| ✅ | constructions, layers and materials from the wall types | gbxml | 0.3 ms |
| ✅ | gable at 30° | gbxml | 0.2 ms |
| ✅ | storeys become levels with heights up to the next one | interop | 0.2 ms |
| ✅ | closed shells face outwards (positive volume by the divergence theorem) | gbxml | 0.2 ms |
| ✅ | levels: elevations ×10, floor-to-floor heights, layers at one elevation merged | interop | 0.2 ms |
| ✅ | doors and windows are openings in their wall surface, in its plane | gbxml | 0.2 ms |
| ✅ | walls in millimetres; full-height walls follow the level; sloping and round walls | interop | 0.2 ms |
| ✅ | hip at 90° | gbxml | 0.2 ms |
| ✅ | gable at 217° | gbxml | 0.2 ms |
| ✅ | furniture matched to the catalog by name in any language, else a box | interop | 0.2 ms |
| ✅ | wall and floor textures become project materials with their image; colours stay colours | sh3d | 0.2 ms |
| ✅ | gable at 90° | gbxml | 0.2 ms |
| ✅ | what makes pieces share a model, and their colour overrides | sh3d | 0.2 ms |
| ✅ | Java 3D default materials fill in OBJ files without an MTL | sh3d | 0.2 ms |
| ✅ | the model rotation is baked: a turned wedge gets its own asset with a turned outline | sh3d | 0.2 ms |
| ✅ | overlapping walls are merged or shortened, stacked openings joined | interop | 0.2 ms |
| ✅ | hip at 217° | gbxml | 0.1 ms |
| ✅ | single-file model entries are recognised by their first bytes | sh3d | 0.1 ms |
| ✅ | hip at 30° | gbxml | 0.1 ms |
| ✅ | hip at 0° | gbxml | 0.1 ms |
| ✅ | openings: windows, doors (also from RectangularGeometry) and air openings | interop | 0.1 ms |
| ✅ | dimensions, labels, polylines and the compass | interop | 0.1 ms |
| ✅ | shed at 217° | gbxml | 0.1 ms |
| ✅ | doors and windows become openings in their walls | interop | 0.1 ms |
| ✅ | shed at 30° | gbxml | 0.1 ms |
| ✅ | vertical wall surfaces become walls; both faces of one wall merge; a two-storey wall splits | interop | 0.1 ms |
| ✅ | arcPoints follows the Sweet Home 3D bulge direction | interop | 0.1 ms |
| ✅ | shed at 0° | gbxml | 0.1 ms |
| ✅ | units and angles: centimetres and radians; walls joined at their corners | sh3d | 0.1 ms |
| ✅ | shed at 90° | gbxml | 0.1 ms |
| ✅ | colours | interop | 0.1 ms |
| ✅ | rooms with names and floor materials | interop | 0.1 ms |
| ✅ | roofs are models on their level | sh3d | 0.1 ms |
| ✅ | staircases become stairs | interop | 0.1 ms |
| ✅ | an empty model (a light source) is skipped; a missing one falls back to a catalog shape | sh3d | 0.1 ms |
| ✅ | wall textures map to our materials by name | sh3d | 0.1 ms |
| ✅ | spaces become rooms (shell bottom, planar geometry, storey by height) | interop | 0.1 ms |
| ✅ | a flat roof surface becomes a flat roof on the storey below it; floors and shading are not elements | interop | 0.0 ms |

</details>

<details><summary><b>3D exchange</b> · 3D 교환 — 34 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | 3dm model: units, layers, colours, blocks; hidden layer left out | rhino3dm | 67 ms |
| ✅ | My library: a model's folder names its category | modelformats | 63 ms |
| ✅ | 3dm through loadModelFile: furniture asset in millimetres from the file's centimetres | rhino3dm | 48 ms |
| ✅ | import GLB / glTF round trip through GLTFExporter (glb: true) | export3d | 35 ms |
| ✅ | COLLADA: three's ColladaLoader reads the export back (needs xmldom) | export3d | 34 ms |
| ✅ | import VRML: backdrop dropped, Phong replaced, metres guessed | export3d | 23 ms |
| ✅ | KMZ: the COLLADA model inside a zip (as SketchUp's 3D Warehouse gives it) | modelformats | 22 ms |
| ✅ | 3dm plan drawing: top view on CAD layers (closed outlines, circle, blocks, point, text) | rhino3dm | 17 ms |
| ✅ | 3MF: three's ThreeMFLoader reads the export back; import restores Y-up metres (needs xmldom) | export3d | 11 ms |
| ✅ | USD text and USDZ: the mesh at its size, the stage's metres per unit | modelformats | 9.8 ms |
| ✅ | 3dm: curved faces without render mesh are tessellated on the surface | rhino3dm | 6.2 ms |
| ✅ | OBJ/MTL: counts, world positions, materials | export3d | 3.6 ms |
| ✅ | LightWave: the loader is there; a broken file gives a message, not a crash | modelformats | 3.6 ms |
| ✅ | import OBJ: centimetres guessed, normalised, outline, MTL applied | export3d | 3.3 ms |
| ✅ | VTK legacy poly data: polygons in, size right; a points-only file is refused | modelformats | 3.2 ms |
| ✅ | rhino3dm is vendored: pinned version, MIT licence, module + wasm | rhino3dm | 3.1 ms |
| ✅ | OFF: a box comes in at its size (m → mm), quads fanned into triangles | modelformats | 2.9 ms |
| ✅ | base64 helpers | export3d | 2.7 ms |
| ✅ | 3dm plan: arcs keep their direction (Rhino counter-clockwise → canvas anticlockwise in plan y-down) | rhino3dm | 2.7 ms |
| ✅ | COLLADA: well-formed 1.4.1 with geometry, materials and world positions | export3d | 2.6 ms |
| ✅ | import PLY (ASCII) | export3d | 2.0 ms |
| ✅ | import STL (ASCII): Z-up converted to Y-up, millimetres guessed | export3d | 1.6 ms |
| ✅ | 3MF: package parts, millimetres, Z up, merged vertices, outward triangles | export3d | 1.4 ms |
| ✅ | import OBJ: missing MTL warns, unit override, Z-up override | export3d | 1.2 ms |
| ✅ | import: errors | export3d | 1.0 ms |
| ✅ | import STL (binary) and up-axis override | export3d | 0.6 ms |
| ✅ | OBJ: non-indexed geometry and mirrored transforms | export3d | 0.6 ms |
| ✅ | 3MF: mirrored mesh stays outward, other units | export3d | 0.6 ms |
| ✅ | OBJ: scale 1000 writes millimetres | export3d | 0.5 ms |
| ✅ | COLLADA: scale declares the matching unit | export3d | 0.5 ms |
| ✅ | the new formats are listed (file dialogs and My library use this list) | modelformats | 0.4 ms |
| ✅ | not a 3dm file is refused | rhino3dm | 0.4 ms |
| ✅ | polyline joining helpers | rhino3dm | 0.1 ms |
| ⏭️ | 3dm corpus (MYARCH_3DM_CORPUS) reads in both modes | rhino3dm | 0.1 ms |

</details>

<details><summary><b>Samples</b> · 예제 — 363 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every element kind the samples build in 3D has a depth class | samples | 775 ms |
| ✅ | the model check finds no errors and no warnings | samples | 190 ms |
| ✅ | the 3D model builds with every element tagged | samples | 169 ms |
| ✅ | the model check finds no errors and no warnings | samples | 139 ms |
| ✅ | the 3D model builds with every element tagged | samples | 117 ms |
| ✅ | the model check finds no errors and no warnings | samples | 105 ms |
| ✅ | the 3D model builds with every element tagged | samples | 98 ms |
| ✅ | the 3D model builds with every element tagged | samples | 95 ms |
| ✅ | the model check finds no errors and no warnings | samples | 94 ms |
| ✅ | the 3D model builds with every element tagged | samples | 83 ms |
| ✅ | the model check finds no errors and no warnings | samples | 78 ms |
| ✅ | the 3D model builds with every element tagged | samples | 73 ms |
| ✅ | the 3D model builds with every element tagged | samples | 67 ms |
| ✅ | the 3D model builds with every element tagged | samples | 64 ms |
| ✅ | the 3D model builds with every element tagged | samples | 63 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 43 ms |
| ✅ | the 3D model builds with every element tagged | samples | 40 ms |
| ✅ | the 3D model builds with every element tagged | samples | 38 ms |
| ✅ | the 3D model builds with every element tagged | samples | 37 ms |
| ✅ | the model check finds no errors and no warnings | samples | 36 ms |
| ✅ | the 3D model builds with every element tagged | samples | 36 ms |
| ✅ | the 3D model builds with every element tagged | samples | 35 ms |
| ✅ | the 3D model builds with every element tagged | samples | 33 ms |
| ✅ | the 3D model builds with every element tagged | samples | 32 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 30 ms |
| ✅ | the 3D model builds with every element tagged | samples | 29 ms |
| ✅ | the model check finds no errors and no warnings | samples | 27 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 24 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 24 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 23 ms |
| ✅ | the 3D model builds with every element tagged | samples | 22 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 22 ms |
| ✅ | the 3D model builds with every element tagged | samples | 21 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 20 ms |
| ✅ | levelSummary is consistent with the project | samples | 18 ms |
| ✅ | levelSummary is consistent with the project | samples | 18 ms |
| ✅ | the 3D model builds with every element tagged | samples | 18 ms |
| ✅ | the model check finds no errors and no warnings | samples | 18 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 17 ms |
| ✅ | the 3D model builds with every element tagged | samples | 16 ms |
| ✅ | the 3D model builds with every element tagged | samples | 15 ms |
| ✅ | the 3D model builds with every element tagged | samples | 14 ms |
| ✅ | the model check finds no errors and no warnings | samples | 14 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 14 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 13 ms |
| ✅ | the 3D model builds with every element tagged | samples | 13 ms |
| ✅ | the 3D model builds with every element tagged | samples | 12 ms |
| ✅ | the 3D model builds with every element tagged | samples | 11 ms |
| ✅ | the 3D model builds with every element tagged | samples | 11 ms |
| ✅ | the 3D model builds with every element tagged | samples | 11 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 11 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 10 ms |
| ✅ | the model check finds no errors and no warnings | samples | 10 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 10 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 10 ms |
| ✅ | levelSummary is consistent with the project | samples | 8.8 ms |
| ✅ | the 3D model builds with every element tagged | samples | 8.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 7.8 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 7.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 7.3 ms |
| ✅ | the 3D model builds with every element tagged | samples | 7.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 7.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 7.0 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 6.1 ms |
| ✅ | index.json lists unique, existing sample files with titles in two languages | samples | 5.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 5.7 ms |
| ✅ | the model check finds no errors and no warnings | samples | 5.5 ms |
| ✅ | openings have unique tags | samples | 5.4 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 5.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 5.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 4.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 4.6 ms |
| ✅ | the 3D model builds with every element tagged | samples | 4.6 ms |
| ✅ | openings have unique tags | samples | 4.6 ms |
| ✅ | the 3D model builds with every element tagged | samples | 4.5 ms |
| ✅ | the model check finds no errors and no warnings | samples | 4.2 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 4.1 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.8 ms |
| ✅ | levelSummary is consistent with the project | samples | 3.3 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.3 ms |
| ✅ | the 3D model builds with every element tagged | samples | 3.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 3.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 3.1 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.9 ms |
| ✅ | openings have unique tags | samples | 2.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.8 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.7 ms |
| ✅ | the 3D model builds with every element tagged | samples | 2.7 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 2.7 ms |
| ✅ | the 3D model builds with every element tagged | samples | 2.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 2.6 ms |
| ✅ | levelSummary is consistent with the project | samples | 2.6 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 2.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.5 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.5 ms |
| ✅ | the 3D model builds with every element tagged | samples | 2.4 ms |
| ✅ | the 3D model builds with every element tagged | samples | 2.4 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.4 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 2.3 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.3 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.3 ms |
| ✅ | the model check finds no errors and no warnings | samples | 2.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 2.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 2.1 ms |
| ✅ | the 3D model builds with every element tagged | samples | 2.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 2.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 2.0 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 2.0 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.9 ms |
| ✅ | openings have unique tags | samples | 1.9 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.9 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.8 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.8 ms |
| ✅ | openings have unique tags | samples | 1.8 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.7 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.7 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.7 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 1.6 ms |
| ✅ | the 3D model builds with every element tagged | samples | 1.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.5 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.5 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.5 ms |
| ✅ | openings have unique tags | samples | 1.5 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.5 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.4 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.3 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.2 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.0 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.0 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.9 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.9 ms |
| ✅ | openings have unique tags | samples | 0.9 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.8 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.8 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.7 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.7 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.7 ms |
| ✅ | every .myarch file in sample/ is listed in the index | samples | 0.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.6 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.6 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.6 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.6 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.6 ms |
| ✅ | openings have unique tags | samples | 0.6 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.6 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.6 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.5 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.5 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.5 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.4 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.4 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.4 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.4 ms |
| ✅ | openings have unique tags | samples | 0.4 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.4 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.4 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.4 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.4 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.4 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | openings have unique tags | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | the 3D model builds with every element tagged | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.3 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.3 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.0 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.0 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.0 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.0 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.0 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |

</details>

<details><summary><b>User interface (icons, widgets)</b> · 사용자 인터페이스 (아이콘, 위젯) — 3 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | common button labels get a fitting icon in both languages | autoicon | 4.3 ms |
| ✅ | tabs get their own icon, also when two keys share a Korean word | autoicon | 3.0 ms |
| ✅ | every icon the rules can pick exists | autoicon | 0.9 ms |

</details>

<details><summary><b>Start page & tutorial</b> · 시작 화면·튜토리얼 — 21 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every background kind draws on a canvas (and none hides its own drawing method) | startlayout | 154 ms |
| ✅ | presets: storeys stacked at their heights, ground floor current, walls as tall as a storey | templates | 4.6 ms |
| ✅ | 새로 시작: every sample tile names a sample in sample/index.json, and every sample has a tile | templates | 3.3 ms |
| ✅ | presets: save and open again unchanged; an unknown preset is the plain blank project | templates | 2.1 ms |
| ✅ | default layout: full-width cards in reading order, quick start beside recent, themes beside the background | startlayout | 1.6 ms |
| ✅ | presets: the structural grid has a line per bay edge, numbered across and lettered down | templates | 1.5 ms |
| ✅ | 새로 시작: at least six groups, every group with the same number of tiles (eight or more) | templates | 0.7 ms |
| ✅ | 새로 시작: every command tile is a registered command | templates | 0.6 ms |
| ✅ | the samples grid keeps every row full | startlayout | 0.4 ms |
| ✅ | one card per row by default: samples right under 새로 시작, theme and background at the bottom | startlayout | 0.3 ms |
| ✅ | the program card is pinned: a card dropped or swapped above it goes below it, its size stays | startlayout | 0.2 ms |
| ✅ | auto arrange packs every card without overlaps; saved layouts round-trip | startlayout | 0.2 ms |
| ✅ | a dropped card keeps its cell and the ones it covers move down without overlapping | startlayout | 0.2 ms |
| ✅ | 새로 시작: group ids and tiles are unique, every tile has a known kind, icon, name and line | templates | 0.2 ms |
| ✅ | 새로 시작: the translatable strings list covers every title, name and line | templates | 0.2 ms |
| ✅ | pixel boxes, cells and spans agree with each other | startlayout | 0.2 ms |
| ✅ | Alt+↑ / Alt+↓ swap with the neighbour above / below | startlayout | 0.1 ms |
| ✅ | 새로 시작: every preset tile is a preset of the same name, and every preset has a tile | templates | 0.1 ms |
| ✅ | a card added in a later version goes below the saved ones | startlayout | 0.1 ms |
| ✅ | resizing a card wider pushes its neighbour down; fit is turned off | startlayout | 0.1 ms |
| ✅ | compaction floats cards up in their own columns | startlayout | 0.1 ms |

</details>

<details><summary><b>Localization</b> · 다국어 — 5 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every UI key has a Korean translation | i18n | 112 ms |
| ✅ | translations keep the same placeholders | i18n | 3.9 ms |
| ✅ | translations keep HTML tags | i18n | 2.7 ms |
| ✅ | translations are non-empty strings | i18n | 1.6 ms |
| ✅ | menu and undo/redo labels are translated | i18n | 0.1 ms |

</details>

<details><summary><b>Build & maintenance scripts</b> · 빌드·정리 스크립트 — 4 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | clean removes build, test and benchmark output; keeps sources, samples, library, manuals, video and node_modules | clean | 163 ms |
| ✅ | --dry-run lists what would go and deletes nothing | clean | 106 ms |
| ✅ | clean:all (--all) also removes node_modules | clean | 104 ms |
| ✅ | package.json has both commands | clean | 0.4 ms |

</details>

<details><summary><b>Desktop shell (Rust)</b> · 데스크톱 셸 (Rust) — 21 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | files › payload decodes text and base64 | rust | 344 ms |
| ✅ | files › sample index takes both shapes | rust | 344 ms |
| ✅ | files › sample names stay in the sample folder | rust | 344 ms |
| ✅ | library › library paths stay inside | rust | 344 ms |
| ✅ | print › copies are kept in range | rust | 344 ms |
| ✅ | print › page size reads both shapes | rust | 344 ms |
| ✅ | print › page sizes follow the page | rust | 344 ms |
| ✅ | print › paper sizes are portrait inches | rust | 344 ms |
| ✅ | print › the default printer is marked | rust | 344 ms |
| ✅ | app urls stay inside | rust | 344 ms |
| ✅ | dialog labels carry their depth | rust | 344 ms |
| ✅ | hex colours parse | rust | 344 ms |
| ✅ | only web and mail links leave for the browser | rust | 344 ms |
| ✅ | platform names match node | rust | 344 ms |
| ✅ | titles drop the patch zero | rust | 344 ms |
| ✅ | files › binary reads come back as base64 | rust | 344 ms |
| ✅ | files › only existing supported files open from the command line | rust | 344 ms |
| ✅ | files › read text survives invalid utf8 | rust | 344 ms |
| ✅ | files › atomic write replaces the file | rust | 344 ms |
| ✅ | settings read survives a broken file | rust | 344 ms |
| ✅ | library › library write list serve clear | rust | 344 ms |

</details>

<details><summary><b>Other</b> · 기타 — 107 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every sample: pieces with a back stand with their back, not their front, against a wall | plan3d | 113 ms |
| ✅ | sample 37-u-shaped-apartments.myarch: headroom over every stair | plan3d | 106 ms |
| ✅ | sample 29-hotel.myarch: headroom over every stair | plan3d | 66 ms |
| ✅ | sample 32-residential-complex.myarch: headroom over every stair | plan3d | 65 ms |
| ✅ | sample 10-office-tower.myarch: headroom over every stair | plan3d | 62 ms |
| ✅ | sample 33-atrium-office.myarch: headroom over every stair | plan3d | 59 ms |
| ✅ | sample 34-general-hospital.myarch: headroom over every stair | plan3d | 57 ms |
| ✅ | the walls stand on their plan lines, as high as the level | plan3d | 26 ms |
| ✅ | sample 30-university-library.myarch: headroom over every stair | plan3d | 26 ms |
| ✅ | sample 35-courtyard-school.myarch: headroom over every stair | plan3d | 25 ms |
| ✅ | apartment-59.dxf: walls, doors and windows, closed rooms | plansamples | 17 ms |
| ✅ | sample 11-mixed-use.myarch: headroom over every stair | plan3d | 14 ms |
| ✅ | sample 36-terraced-office.myarch: headroom over every stair | plan3d | 12 ms |
| ✅ | every hinged door of the samples carries its swing data | plan3d | 8.1 ms |
| ✅ | 40 or more examples, each with its file, thumbnail and Korean / English title | plansamples | 7.8 ms |
| ✅ | spiral stair: headroom over every tread — no floor, slab or ceiling above it | plan3d | 7.5 ms |
| ✅ | sample 08-apartment-block.myarch: headroom over every stair | plan3d | 6.5 ms |
| ✅ | sample 13-school.myarch: headroom over every stair | plan3d | 6.4 ms |
| ✅ | sample 17-townhouse.myarch: headroom over every stair | plan3d | 6.1 ms |
| ✅ | sample 12-hospital.myarch: headroom over every stair | plan3d | 5.8 ms |
| ✅ | apartment-84.dxf: walls, doors and windows, closed rooms | plansamples | 5.3 ms |
| ✅ | an item turned 0° on the plan has its back the same way in 3D | plan3d | 5.1 ms |
| ✅ | living-curved.dxf: walls, doors and windows, closed rooms | plansamples | 4.8 ms |
| ✅ | sample 16-modern-villa.myarch: headroom over every stair | plan3d | 4.1 ms |
| ✅ | small-office.svg: walls, doors and windows, closed rooms | plansamples | 3.9 ms |
| ✅ | sample 31-sports-centre.myarch: headroom over every stair | plan3d | 3.6 ms |
| ✅ | sample 19-duplex.myarch: headroom over every stair | plan3d | 3.4 ms |
| ✅ | sample 18-modern-farmhouse.myarch: headroom over every stair | plan3d | 3.3 ms |
| ✅ | doors-variety.dxf: walls, doors and windows, closed rooms | plansamples | 3.1 ms |
| ✅ | sample 03-two-storey-house.myarch: headroom over every stair | plan3d | 3.1 ms |
| ✅ | sample 38-museum.myarch: headroom over every stair | plan3d | 3.0 ms |
| ✅ | a piece dropped on another moves next to it, clear of both | placement | 2.5 ms |
| ✅ | straight stair: headroom over every tread — no floor, slab or ceiling above it | plan3d | 2.5 ms |
| ✅ | house-2room.dxf: walls, doors and windows, closed rooms | plansamples | 2.5 ms |
| ✅ | the window and the door are holes the eye can look through; the wall beside them is solid | plan3d | 2.4 ms |
| ✅ | hinged at the end door: turning its leaves by their swing data matches the model built open | plan3d | 2.3 ms |
| ✅ | sample 37-u-shaped-apartments.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 2.3 ms |
| ✅ | L stair: headroom over every tread — no floor, slab or ceiling above it | plan3d | 1.9 ms |
| ✅ | a free spot stays where it is | placement | 1.7 ms |
| ✅ | a piece dropped into a wall comes out into the room | placement | 1.6 ms |
| ✅ | sample 08-apartment-block.myarch: living rooms and bedrooms are dressed | plan3d | 1.6 ms |
| ✅ | sample 34-general-hospital.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 1.5 ms |
| ✅ | sample 01-studio.myarch: living rooms and bedrooms are dressed | plan3d | 1.4 ms |
| ✅ | U stair: headroom over every tread — no floor, slab or ceiling above it | plan3d | 1.4 ms |
| ✅ | sample 19-duplex.myarch: living rooms and bedrooms are dressed | plan3d | 1.4 ms |
| ✅ | moving a stair rebuilds the floor above (the per-level cache keys it) | plan3d | 1.3 ms |
| ✅ | sample 16-modern-villa.myarch: living rooms and bedrooms are dressed | plan3d | 1.3 ms |
| ✅ | sample 17-townhouse.myarch: living rooms and bedrooms are dressed | plan3d | 1.3 ms |
| ✅ | the floor is the room's polygon at the level's floor | plan3d | 1.2 ms |
| ✅ | sample 18-modern-farmhouse.myarch: living rooms and bedrooms are dressed | plan3d | 1.2 ms |
| ✅ | a piece dragged through a wall stays in the room it came from | placement | 1.2 ms |
| ✅ | sample 03-two-storey-house.myarch: living rooms and bedrooms are dressed | plan3d | 1.2 ms |
| ✅ | sample 02-two-bedroom.myarch: living rooms and bedrooms are dressed | plan3d | 1.2 ms |
| ✅ | sample 21-interior-design.myarch: living rooms and bedrooms are dressed | plan3d | 1.2 ms |
| ✅ | sample 40-penthouse.myarch: living rooms and bedrooms are dressed | plan3d | 1.1 ms |
| ✅ | sample 20-compact-house.myarch: living rooms and bedrooms are dressed | plan3d | 1.1 ms |
| ✅ | sample 14-courtyard-house.myarch: living rooms and bedrooms are dressed | plan3d | 1.1 ms |
| ✅ | sample 32-residential-complex.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 1.1 ms |
| ✅ | sample 06-renovation-bim.myarch: living rooms and bedrooms are dressed | plan3d | 1.0 ms |
| ✅ | sample 05-wooden-cabin.myarch: living rooms and bedrooms are dressed | plan3d | 1.0 ms |
| ✅ | furniture stands at its plan point and covers its plan outline | plan3d | 1.0 ms |
| ✅ | sample 29-hotel.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 1.0 ms |
| ✅ | minusConvex cuts a convex hole, a corner and an L, and leaves a polygon it misses alone | plan3d | 0.9 ms |
| ✅ | single door: turning its leaves by their swing data matches the model built open | plan3d | 0.9 ms |
| ✅ | straight stair: its well covers its plan outline and only the floor it climbs to gets it | plan3d | 0.8 ms |
| ✅ | the upper floor loses exactly the stair's footprint, the lower floor nothing | plan3d | 0.8 ms |
| ✅ | a room that lies wholly inside a stair well keeps an (empty) floor mesh | plan3d | 0.7 ms |
| ✅ | swinging the other way door: turning its leaves by their swing data matches the model built open | plan3d | 0.5 ms |
| ✅ | a sliding door's moving panel slides along the wall by its slide data | plan3d | 0.5 ms |
| ✅ | a stair on the top level cuts nothing (there is no floor above) | plan3d | 0.5 ms |
| ✅ | spiral stair: its well covers its plan outline and only the floor it climbs to gets it | plan3d | 0.5 ms |
| ✅ | double door: turning its leaves by their swing data matches the model built open | plan3d | 0.5 ms |
| ✅ | an item turned 90° on the plan has its back the same way in 3D | plan3d | 0.5 ms |
| ✅ | sample 35-courtyard-school.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.4 ms |
| ✅ | every door knows its centre (metres) for the walker's reach; windows and garage doors have no leaves to swing | plan3d | 0.4 ms |
| ✅ | L stair: its well covers its plan outline and only the floor it climbs to gets it | plan3d | 0.4 ms |
| ✅ | an item turned 180° on the plan has its back the same way in 3D | plan3d | 0.3 ms |
| ✅ | an item turned 270° on the plan has its back the same way in 3D | plan3d | 0.3 ms |
| ✅ | sample 11-mixed-use.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.3 ms |
| ✅ | U stair: its well covers its plan outline and only the floor it climbs to gets it | plan3d | 0.3 ms |
| ✅ | touching is fine: a cabinet against a wall face, a chair beside a table | placement | 0.2 ms |
| ✅ | pieces at other heights do not collide (a wall cabinet over a console, a ceiling lamp over a bed) | placement | 0.2 ms |
| ✅ | sample 01-studio.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.2 ms |
| ✅ | every picture knows its real width (the walls come out at the real size) | plansamples | 0.2 ms |
| ✅ | sample 30-university-library.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.2 ms |
| ✅ | sample 33-atrium-office.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 10-office-tower.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 38-museum.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 36-terraced-office.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 12-hospital.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 13-school.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 03-two-storey-house.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.1 ms |
| ✅ | sample 19-duplex.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 31-sports-centre.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 02-two-bedroom.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 08-apartment-block.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 18-modern-farmhouse.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 17-townhouse.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 21-interior-design.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 04-small-office.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 14-courtyard-house.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 16-modern-villa.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 06-renovation-bim.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 40-penthouse.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 39-cafe-bistro.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 05-wooden-cabin.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |
| ✅ | sample 20-compact-house.myarch: wall-mounted items hang on a wall, facing the room | plan3d | 0.0 ms |

</details>
