# MyArchitecture — Test report / 테스트 결과 보고서

- **Result / 결과**: ✅ ALL TESTS PASSED (모두 통과)
- **Run at / 실행 시각**: 2026-11-08 05:42:31 UTC
- **Duration / 소요 시간**: 33.21 s
- **Tests / 테스트**: 2173 — 2168 passed, 0 failed, 5 skipped
- **Files / 파일**: 40/40 passed · **Categories / 분류**: 17/17 passed
- **Environment / 환경**: node v22.18.0, win32 x64

## Summary / 요약

| # | Category | 분류 | Files | Tests | Pass | Fail | Skip | Time | Result |
|--:|:--|:--|--:|--:|--:|--:|--:|--:|:-:|
| 1 | Core model & geometry | 핵심 모델·기하 | 4 | 295 | 295 | 0 | 0 | 1.06 s | ✅ |
| 2 | Plan editing | 평면 편집 | 3 | 131 | 131 | 0 | 0 | 4.11 s | ✅ |
| 3 | Checks & schedules | 검사·집계 | 2 | 94 | 94 | 0 | 0 | 408 ms | ✅ |
| 4 | Views, sheets & annotation | 뷰·시트·주석 | 1 | 36 | 36 | 0 | 0 | 2.23 s | ✅ |
| 5 | 3D model | 3D 모델 | 6 | 848 | 848 | 0 | 0 | 7.01 s | ✅ |
| 6 | Furniture library | 가구 라이브러리 | 1 | 9 | 9 | 0 | 0 | 188 ms | ✅ |
| 7 | SketchUp modelling | 스케치업 모델링 | 3 | 77 | 77 | 0 | 0 | 660 ms | ✅ |
| 8 | CAD exchange (DXF, DWG, SVG) | CAD 교환 (DXF, DWG, SVG) | 6 | 102 | 98 | 0 | 4 | 1.43 s | ✅ |
| 9 | Printing & PDF | 인쇄·PDF | 1 | 6 | 6 | 0 | 0 | 207 ms | ✅ |
| 10 | BIM exchange (IFC, ifcXML) | BIM 교환 (IFC, ifcXML) | 2 | 25 | 25 | 0 | 0 | 1.17 s | ✅ |
| 11 | Other BIM (SH3D, gbXML) | 다른 BIM (SH3D, gbXML) | 3 | 114 | 114 | 0 | 0 | 7.65 s | ✅ |
| 12 | 3D exchange | 3D 교환 | 2 | 27 | 26 | 0 | 1 | 706 ms | ✅ |
| 13 | Samples | 예제 | 1 | 363 | 363 | 0 | 0 | 4.68 s | ✅ |
| 14 | User interface (icons, widgets) | 사용자 인터페이스 (아이콘, 위젯) | 1 | 3 | 3 | 0 | 0 | 167 ms | ✅ |
| 15 | Start page & tutorial | 시작 화면·튜토리얼 | 2 | 19 | 19 | 0 | 0 | 557 ms | ✅ |
| 16 | Localization | 다국어 | 1 | 5 | 5 | 0 | 0 | 215 ms | ✅ |
| 17 | Desktop shell (Rust) | 데스크톱 셸 (Rust) | 1 | 19 | 19 | 0 | 0 | 745 ms | ✅ |
| | **Total** | **합계** | **40** | **2173** | **2168** | **0** | **5** | **33.21 s** | ✅ |

## Files / 파일별 결과

| Category / 분류 | File | Tests | Pass | Fail | Skip | Time | Result |
|:--|:--|--:|--:|--:|--:|--:|:-:|
| Core model & geometry | `core.test.mjs` | 171 | 171 | 0 | 0 | 291 ms | ✅ |
| Core model & geometry | `elements.test.mjs` | 26 | 26 | 0 | 0 | 402 ms | ✅ |
| Core model & geometry | `rooms.test.mjs` | 47 | 47 | 0 | 0 | 188 ms | ✅ |
| Core model & geometry | `walls.test.mjs` | 51 | 51 | 0 | 0 | 184 ms | ✅ |
| Plan editing | `docs.test.mjs` | 9 | 9 | 0 | 0 | 162 ms | ✅ |
| Plan editing | `plan.test.mjs` | 116 | 116 | 0 | 0 | 3.78 s | ✅ |
| Plan editing | `store.test.mjs` | 6 | 6 | 0 | 0 | 161 ms | ✅ |
| Checks & schedules | `check.test.mjs` | 69 | 69 | 0 | 0 | 221 ms | ✅ |
| Checks & schedules | `schedule.test.mjs` | 25 | 25 | 0 | 0 | 187 ms | ✅ |
| Views, sheets & annotation | `views.test.mjs` | 36 | 36 | 0 | 0 | 2.23 s | ✅ |
| 3D model | `interior.test.mjs` | 13 | 13 | 0 | 0 | 223 ms | ✅ |
| 3D model | `lights.test.mjs` | 17 | 17 | 0 | 0 | 280 ms | ✅ |
| 3D model | `members.test.mjs` | 17 | 17 | 0 | 0 | 220 ms | ✅ |
| 3D model | `perf3d.test.mjs` | 15 | 15 | 0 | 0 | 1.34 s | ✅ |
| 3D model | `structures.test.mjs` | 17 | 17 | 0 | 0 | 432 ms | ✅ |
| 3D model | `view3d.test.mjs` | 769 | 769 | 0 | 0 | 4.52 s | ✅ |
| Furniture library | `library.test.mjs` | 9 | 9 | 0 | 0 | 188 ms | ✅ |
| SketchUp modelling | `massing.test.mjs` | 12 | 12 | 0 | 0 | 200 ms | ✅ |
| SketchUp modelling | `mesh.test.mjs` | 36 | 36 | 0 | 0 | 192 ms | ✅ |
| SketchUp modelling | `sketchup.test.mjs` | 29 | 29 | 0 | 0 | 268 ms | ✅ |
| CAD exchange (DXF, DWG, SVG) | `cadextra.test.mjs` | 16 | 14 | 0 | 2 | 198 ms | ✅ |
| CAD exchange (DXF, DWG, SVG) | `dwg.test.mjs` | 12 | 10 | 0 | 2 | 190 ms | ✅ |
| CAD exchange (DXF, DWG, SVG) | `dwgwrite.test.mjs` | 6 | 6 | 0 | 0 | 383 ms | ✅ |
| CAD exchange (DXF, DWG, SVG) | `dxf.test.mjs` | 46 | 46 | 0 | 0 | 243 ms | ✅ |
| CAD exchange (DXF, DWG, SVG) | `dxfbin.test.mjs` | 16 | 16 | 0 | 0 | 293 ms | ✅ |
| CAD exchange (DXF, DWG, SVG) | `svgimport.test.mjs` | 6 | 6 | 0 | 0 | 125 ms | ✅ |
| Printing & PDF | `pdf.test.mjs` | 6 | 6 | 0 | 0 | 207 ms | ✅ |
| BIM exchange (IFC, ifcXML) | `ifc.test.mjs` | 14 | 14 | 0 | 0 | 309 ms | ✅ |
| BIM exchange (IFC, ifcXML) | `ifcxml.test.mjs` | 11 | 11 | 0 | 0 | 865 ms | ✅ |
| Other BIM (SH3D, gbXML) | `gbxml.test.mjs` | 64 | 64 | 0 | 0 | 6.63 s | ✅ |
| Other BIM (SH3D, gbXML) | `interop.test.mjs` | 28 | 28 | 0 | 0 | 379 ms | ✅ |
| Other BIM (SH3D, gbXML) | `sh3d.test.mjs` | 22 | 22 | 0 | 0 | 639 ms | ✅ |
| 3D exchange | `export3d.test.mjs` | 18 | 18 | 0 | 0 | 349 ms | ✅ |
| 3D exchange | `rhino3dm.test.mjs` | 9 | 8 | 0 | 1 | 357 ms | ✅ |
| Samples | `samples.test.mjs` | 363 | 363 | 0 | 0 | 4.68 s | ✅ |
| User interface (icons, widgets) | `autoicon.test.mjs` | 3 | 3 | 0 | 0 | 167 ms | ✅ |
| Start page & tutorial | `startlayout.test.mjs` | 10 | 10 | 0 | 0 | 368 ms | ✅ |
| Start page & tutorial | `templates.test.mjs` | 9 | 9 | 0 | 0 | 189 ms | ✅ |
| Localization | `i18n.test.mjs` | 5 | 5 | 0 | 0 | 215 ms | ✅ |
| Desktop shell (Rust) | `src-tauri (cargo test)` | 19 | 19 | 0 | 0 | 745 ms | ✅ |

## Tests / 테스트 목록

Slowest first within each category. / 분류마다 오래 걸린 순서입니다.

<details><summary><b>Core model & geometry</b> · 핵심 모델·기하 — 295 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | IFC: exported as their IFC classes and read back exactly (IFC4 and IFC2X3) | elements | 71 ms |
| ✅ | the undo history is capped at 200 steps | core | 42 ms |
| ✅ | every element builds 3D meshes without NaN | elements | 39 ms |
| ✅ | schedules, U-values and the cost estimate include the elements | elements | 9.6 ms |
| ✅ | roofBase is the top of the level's walls plus the roof offset | rooms | 5.2 ms |
| ✅ | plan drawing runs for every element and extends the bounds | elements | 5.0 ms |
| ✅ | DXF puts every element on its layer | elements | 3.9 ms |
| ✅ | a T made of three wall ends after splitting the through wall stays closed | walls | 3.9 ms |
| ✅ | a missing or non-object input becomes a fresh project | core | 3.3 ms |
| ✅ | normalize is idempotent and survives a save round trip | elements | 3.1 ms |
| ✅ | an old file without any element fields loads unchanged in its old parts | elements | 2.5 ms |
| ✅ | model check rules see the elements | elements | 2.3 ms |
| ✅ | new collections exist and are level collections | elements | 2.1 ms |
| ✅ | hit test, box select, move, rotate, copy / paste | elements | 2.1 ms |
| ✅ | IFC: a foreign floor slab becomes a slab element | elements | 2.1 ms |
| ✅ | solar noon in Seoul is about half an hour after 12:00 and the sun is due south | core | 2.1 ms |
| ✅ | uid makes distinct ids with the requested prefix | core | 1.9 ms |
| ✅ | linear and radial arrays copy the selection | elements | 1.9 ms |
| ✅ | wall profiles: sloped top and a top attached to the roof | elements | 1.8 ms |
| ✅ | the southern hemisphere mirrors the northern one | core | 1.6 ms |
| ✅ | wallFrame gives the length, the unit direction and the left normal | walls | 1.5 ms |
| ✅ | newProject has the expected shape | core | 1.4 ms |
| ✅ | the equinox noon altitude is the co-latitude | core | 1.3 ms |
| ✅ | stairs by type: every riser equal, landing between the flights, rails | elements | 1.3 ms |
| ✅ | a closed rectangle has four nodes and four edges (eight half-edges) | rooms | 1.3 ms |
| ✅ | openingSpans only lists the openings of that wall | walls | 1.2 ms |
| ✅ | uiTokens has every token for every theme | core | 1.1 ms |
| ✅ | a T splits the through walls: six nodes, seven edges | rooms | 1.0 ms |
| ✅ | serialize → parse round-trips a project unchanged | core | 1.0 ms |
| ✅ | slabs: area without the openings and shafts, sloped tops | elements | 1.0 ms |
| ✅ | a new edit clears the redo stack | core | 1.0 ms |
| ✅ | daylight in Seoul: long days in June, short days in December | core | 0.9 ms |
| ✅ | type parameters are copied onto their instances; a missing type unlinks | elements | 0.9 ms |
| ✅ | edit records a step that undo and redo replay | core | 0.9 ms |
| ✅ | walls are clamped and get the default thickness | core | 0.9 ms |
| ✅ | there are 40 themes, 20 dark and 20 light, with unique ids and valid colours | core | 0.9 ms |
| ✅ | only the active option is shown, built and checked | elements | 0.9 ms |
| ✅ | Seoul at the summer solstice: noon altitude ≈ 75.9° | core | 0.8 ms |
| ✅ | openingSpans drops openings entirely past the wall end | walls | 0.8 ms |
| ✅ | minArea filters out small spaces | rooms | 0.8 ms |
| ✅ | railings: posts at corners, balusters between | elements | 0.8 ms |
| ✅ | 3D model assets are kept out of the undo snapshots | core | 0.8 ms |
| ✅ | beams: ends, profiles, systems | elements | 0.8 ms |
| ✅ | history lists undo labels oldest first and redo labels next first | core | 0.7 ms |
| ✅ | revision counts every change, preview and load | core | 0.7 ms |
| ✅ | daylight near the pole: midnight sun in June and polar night in December | core | 0.7 ms |
| ✅ | begin twice keeps the first snapshot and label | core | 0.7 ms |
| ✅ | bad values are clamped or dropped | elements | 0.7 ms |
| ✅ | normalizeProject is idempotent | core | 0.7 ms |
| ✅ | a free wall is a rectangle with square ends | walls | 0.7 ms |
| ✅ | canvasColors gives a plan palette for every theme | core | 0.7 ms |
| ✅ | ramps rise along their path | elements | 0.7 ms |
| ✅ | an empty object gets every collection and default | core | 0.6 ms |
| ✅ | one rectangle makes one room bounded by the inner wall faces | rooms | 0.6 ms |
| ✅ | dist, clamp, snap, deg, rad and normAngle behave like their maths | core | 0.6 ms |
| ✅ | openingSpans clamps to the wall and sorts by position | walls | 0.6 ms |
| ✅ | per-edge roofs: gables on flat edges, hips on sloped ones, openings | elements | 0.6 ms |
| ✅ | roomAtPoint picks the smallest room containing the point | rooms | 0.6 ms |
| ✅ | roomArea, roomPerimeter and roomLabelPoint | rooms | 0.6 ms |
| ✅ | load replaces the project and clears history and dirty | core | 0.6 ms |
| ✅ | openingTags number doors and windows in plan order per level | core | 0.6 ms |
| ✅ | Seoul at the winter solstice: noon altitude ≈ 29° | core | 0.6 ms |
| ✅ | a gable roof: overhang outline, ridge height, eaves and two gables | rooms | 0.6 ms |
| ✅ | a flat roof follows the polygon grown by the overhang | rooms | 0.6 ms |
| ✅ | rotPt with a zero or missing angle returns the point unchanged | core | 0.5 ms |
| ✅ | begin and commit make one drag one undo step | core | 0.5 ms |
| ✅ | an L corner is mitred to the exact outer and inner corners | walls | 0.5 ms |
| ✅ | dirty is set by edits and undo and cleared by markSaved | core | 0.5 ms |
| ✅ | curtain wall grid: equal cells no wider than the spacing | elements | 0.5 ms |
| ✅ | serialize writes the current project | core | 0.5 ms |
| ✅ | items on a missing level move to the first (lowest) level | core | 0.5 ms |
| ✅ | cancel restores the snapshot taken by begin | core | 0.5 ms |
| ✅ | a room on a slab keeps only its finish | elements | 0.5 ms |
| ✅ | ceilings default to 300 mm under the next floor | elements | 0.5 ms |
| ✅ | findItem finds items of every collection, including grids | core | 0.4 ms |
| ✅ | levels are cleaned, clamped and sorted by elevation | core | 0.4 ms |
| ✅ | rooms and roofs with fewer than three points are dropped; points are cleaned | core | 0.4 ms |
| ✅ | onLevel, wallById, openingsOf, wallLength and levelOfItem | core | 0.4 ms |
| ✅ | unknown fields on the project and on items survive | core | 0.4 ms |
| ✅ | wallPieces: no opening gives one piece | walls | 0.4 ms |
| ✅ | randomTheme never returns the current theme | core | 0.4 ms |
| ✅ | openingTags keeps a tag the user typed | core | 0.4 ms |
| ✅ | mass-model solids are cleaned and clamped | core | 0.4 ms |
| ✅ | wallPieces: one opening gives two pieces with a gap of its width | walls | 0.4 ms |
| ✅ | mergeCollinear joins two walls end to end and re-bases the openings | walls | 0.4 ms |
| ✅ | splitWall cuts a wall in two and moves later openings to the new part | walls | 0.4 ms |
| ✅ | buildingOutlines ignores inner walls and handles several blocks | rooms | 0.4 ms |
| ✅ | levelById, levelIndex and levelAbove | core | 0.4 ms |
| ✅ | wallPieces: an opening at the very end leaves one solid piece | walls | 0.4 ms |
| ✅ | listeners can unsubscribe and a throwing listener does not stop the others | core | 0.4 ms |
| ✅ | a new store holds a normalized empty project and no history | core | 0.4 ms |
| ✅ | parseProject rejects text that is not JSON | core | 0.4 ms |
| ✅ | a dividing wall (T) makes two rooms | rooms | 0.4 ms |
| ✅ | openings of missing walls are dropped and the rest are cleaned | core | 0.3 ms |
| ✅ | the mitre does not depend on the drawing direction of the walls | walls | 0.3 ms |
| ✅ | a slanted free wall keeps its thickness | walls | 0.3 ms |
| ✅ | graphFaces of a rectangle: one bounded face (positive) and the outer face (negative) | rooms | 0.3 ms |
| ✅ | a T junction is trimmed to the face of the through wall (3D, draw: false) | walls | 0.3 ms |
| ✅ | buildingOutlines gives the outside faces of each block | rooms | 0.3 ms |
| ✅ | typed walls take their thickness from the layers and unknown types are removed | core | 0.3 ms |
| ✅ | wallPieces: two openings give three pieces | walls | 0.3 ms |
| ✅ | triangulate covers the convex square exactly with n − 2 triangles | core | 0.3 ms |
| ✅ | mergeCollinear does not merge walls of different thickness or height | walls | 0.3 ms |
| ✅ | furniture, stairs, columns and texts are clamped | core | 0.3 ms |
| ✅ | items without ids get ids from their collection letter | core | 0.3 ms |
| ✅ | cleanup drops repeated and collinear points and rounds to 0.1 mm | rooms | 0.3 ms |
| ✅ | edits during a pending drag fold into the drag step | core | 0.3 ms |
| ✅ | parseProject accepts a file with only walls or only levels | core | 0.3 ms |
| ✅ | two separate buildings make separate rooms | rooms | 0.3 ms |
| ✅ | commit without a change records nothing | core | 0.3 ms |
| ✅ | mergeCollinear merges a chain of three walls into one | walls | 0.3 ms |
| ✅ | mergeCollinear does not merge walls at an angle or running back | walls | 0.3 ms |
| ✅ | polygonArea is positive counter-clockwise and negative clockwise | core | 0.3 ms |
| ✅ | contrast and mix follow the WCAG and linear-blend formulas | core | 0.3 ms |
| ✅ | defaults are merged over the built-in ones | core | 0.3 ms |
| ✅ | room polygons are cleaned: no repeated or collinear corners | rooms | 0.3 ms |
| ✅ | an edit function returning false vetoes the step | core | 0.3 ms |
| ✅ | wallPieces: an opening at the very start leaves one solid piece | walls | 0.3 ms |
| ✅ | orientedRect fits an axis-aligned rectangle | core | 0.3 ms |
| ✅ | wallHeight uses the wall's own height, else its level's | core | 0.3 ms |
| ✅ | splitWall on a slanted wall puts the cut point on the centre line | walls | 0.3 ms |
| ✅ | phases default to new and keep valid values | core | 0.3 ms |
| ✅ | wallPieces: overlapping openings make one gap | walls | 0.3 ms |
| ✅ | labelPoint finds a point inside a U-shaped polygon whose centroid is in the notch | core | 0.3 ms |
| ✅ | wallPoint and wallUV round-trip on a slanted wall | walls | 0.2 ms |
| ✅ | an L-shaped house makes one six-cornered room | rooms | 0.2 ms |
| ✅ | clipHalfPlane keeps the part on the positive side | core | 0.2 ms |
| ✅ | graphFaces of a T: two bounded faces and one outer face | rooms | 0.2 ms |
| ✅ | wallPieces: the solid area is right even when an opening reaches the end | walls | 0.2 ms |
| ✅ | offsetPolygon insets a counter-clockwise square by one distance | core | 0.2 ms |
| ✅ | wallTypeThickness and wallTypeOf | core | 0.2 ms |
| ✅ | wallSnapPoints lists both ends and the middle of every wall | walls | 0.2 ms |
| ✅ | rot 180 keeps the ridge direction | rooms | 0.2 ms |
| ✅ | buildingOutlines of an L follows the re-entrant corner | rooms | 0.2 ms |
| ✅ | room areas follow walls of different thickness exactly | rooms | 0.2 ms |
| ✅ | slicePoly cuts the outline between two positions along the wall | walls | 0.2 ms |
| ✅ | costs, grids and wall types get defaults | core | 0.2 ms |
| ✅ | an edit returning undefined still counts | core | 0.2 ms |
| ✅ | closestOnSegment clamps to the start before the segment | core | 0.2 ms |
| ✅ | rotPt turns a point counter-clockwise in maths axes | core | 0.2 ms |
| ✅ | custom themes are registered, looked up and reset | core | 0.2 ms |
| ✅ | a cross splits every wall at the centre: nine nodes, twelve edges | rooms | 0.2 ms |
| ✅ | group, props and classification on elements survive normalization | core | 0.2 ms |
| ✅ | drawings on unknown layers create those layers | core | 0.2 ms |
| ✅ | wall types are cleaned: empty layers become concrete 200, thin layers 1 mm | core | 0.2 ms |
| ✅ | a merged wall still makes a clean outline | walls | 0.2 ms |
| ✅ | a hip roof: four faces, ridge length = length − width | rooms | 0.2 ms |
| ✅ | splitWall refuses a cut at or near either end | walls | 0.2 ms |
| ✅ | pitched roofs on a rotated box follow the box | rooms | 0.2 ms |
| ✅ | closestOnSegment clamps to the end past the segment | core | 0.2 ms |
| ✅ | mergeCollinear does not merge across a T | walls | 0.2 ms |
| ✅ | a shaft that ends at the top floor leaves the roof whole; one that goes on above cuts it | elements | 0.2 ms |
| ✅ | rot 90 swaps the ridge to the short side | rooms | 0.2 ms |
| ✅ | a three-way joint leaves no hole between the three outlines | walls | 0.2 ms |
| ✅ | graphFaces of an open chain has no bounded face | rooms | 0.2 ms |
| ✅ | toWorld of an item without rot only translates | core | 0.2 ms |
| ✅ | the half-edges around a node are sorted by angle | rooms | 0.2 ms |
| ✅ | convexHull drops interior and collinear points and runs counter-clockwise | core | 0.2 ms |
| ✅ | a cross makes four rooms | rooms | 0.2 ms |
| ✅ | polygonCentroid of a rectangle, a triangle and an L | core | 0.2 ms |
| ✅ | cleanup keeps a triangle and real corners | rooms | 0.2 ms |
| ✅ | endsAt finds every wall end at a point | walls | 0.2 ms |
| ✅ | toWorld and toLocal are inverse to each other | core | 0.2 ms |
| ✅ | buildingOutlines drops lone walls (less than 1 m² enclosed) | rooms | 0.2 ms |
| ✅ | bounds and unionBounds | core | 0.2 ms |
| ✅ | toWorld applies a quarter turn about the item origin | core | 0.2 ms |
| ✅ | orientedRect of nothing is an empty rectangle | core | 0.2 ms |
| ✅ | mergeCollinear only looks at the requested level | walls | 0.2 ms |
| ✅ | roomAtPoint finds small rooms below the normal minimum area | rooms | 0.2 ms |
| ✅ | wallAt returns the nearest wall under the point with its position | walls | 0.2 ms |
| ✅ | a gable roof surface passes through the wall line at the base height | rooms | 0.2 ms |
| ✅ | roomAtPoint picks the right room of a T | rooms | 0.2 ms |
| ✅ | newLevel has an id, a name, an elevation, a height and a slab | core | 0.2 ms |
| ✅ | a three-way joint mitres the two corners, keeps the straight face and reaches the joint point | walls | 0.2 ms |
| ✅ | a shed roof: one sloped face rising across the width | rooms | 0.2 ms |
| ✅ | labelPoint returns the centroid when it lies inside | core | 0.2 ms |
| ✅ | triangulate covers the concave L exactly with n − 2 triangles | core | 0.2 ms |
| ✅ | offsetPolygon insets a clockwise square into the polygon too | core | 0.2 ms |
| ✅ | constants describe the format and the collections | core | 0.2 ms |
| ✅ | the sun is below the horizon at midnight and azimuths stay in 0…360 | core | 0.2 ms |
| ✅ | orientedRect fits a rotated rectangle and reports its angle | core | 0.2 ms |
| ✅ | a T junction reaches the centre line of the through wall (plan, draw: true) | walls | 0.1 ms |
| ✅ | wallFrame of a zero-length wall does not divide by zero | walls | 0.1 ms |
| ✅ | a four-way joint meets in a square of the wall thickness | walls | 0.1 ms |
| ✅ | suggestRoomName goes by size | rooms | 0.1 ms |
| ✅ | wallUV measures along the wall and to its left | walls | 0.1 ms |
| ✅ | clipHalfPlane keeps everything or nothing when the line misses | core | 0.1 ms |
| ✅ | convexHull does not modify its input | core | 0.1 ms |
| ✅ | triangulate covers the convex hexagon exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | a closed rectangle of walls tiles the exact frame area | walls | 0.1 ms |
| ✅ | snapAngle rounds to the nearest step | core | 0.1 ms |
| ✅ | parseProject rejects JSON that is not a project | core | 0.1 ms |
| ✅ | the default dark and light themes exist | core | 0.1 ms |
| ✅ | slicePoly works on a slanted wall | walls | 0.1 ms |
| ✅ | two new projects do not share wall types or levels | core | 0.1 ms |
| ✅ | a wall end 1 mm short of another wall still connects | rooms | 0.1 ms |
| ✅ | a very sharp angle falls back to square ends instead of a long spike | walls | 0.1 ms |
| ✅ | a hip roof on a square comes to a point | rooms | 0.1 ms |
| ✅ | a T from a slanted through wall ends on that wall's face | walls | 0.1 ms |
| ✅ | a T at the end of the stem is trimmed too | walls | 0.1 ms |
| ✅ | fmtLen in feet and inches | core | 0.1 ms |
| ✅ | walls of different thickness meet at the corner of both faces | walls | 0.1 ms |
| ✅ | cleanup removes a point in the middle of a straight edge | rooms | 0.1 ms |
| ✅ | the drawing direction of the walls does not matter | rooms | 0.1 ms |
| ✅ | a four-way joint leaves no hole in the crossing square | walls | 0.1 ms |
| ✅ | labelPoint stays inside a C-shaped polygon opening to the side | core | 0.1 ms |
| ✅ | two walls crossing without ends at the crossing are split there | rooms | 0.1 ms |
| ✅ | rotPt keeps the distance from the origin | core | 0.1 ms |
| ✅ | a roof without overhang or pitch fields still builds | rooms | 0.1 ms |
| ✅ | suggestRoomName passes the name through the translator | rooms | 0.1 ms |
| ✅ | ends within the 2 mm joint tolerance are joined | walls | 0.1 ms |
| ✅ | a flat roof keeps the polygon's own orientation (clockwise input) | rooms | 0.1 ms |
| ✅ | every wall gets an outline and the map is keyed by id | walls | 0.1 ms |
| ✅ | a pitched roof with zero pitch is flat | rooms | 0.1 ms |
| ✅ | the default wall types are as thick as their layers say | core | 0.1 ms |
| ✅ | the morning sun is in the east and the afternoon sun in the west | core | 0.1 ms |
| ✅ | closestOnSegment projects onto the middle of the segment | core | 0.1 ms |
| ✅ | uiTokens picks white accent text on dark accents and dark text on light accents | core | 0.1 ms |
| ✅ | polygonPerimeter of closed and open outlines | core | 0.1 ms |
| ✅ | a flat roof's top follows its own thickness, 200 mm by default | rooms | 0.1 ms |
| ✅ | two walls crossing in the middle stay full rectangles | walls | 0.1 ms |
| ✅ | offsetPolygon applies per-edge distances (clockwise) | core | 0.1 ms |
| ✅ | segIntersect reports a proper crossing with both parameters | core | 0.1 ms |
| ✅ | theme graphite: body text is readable on the background (contrast ≥ 4.5) | core | 0.1 ms |
| ✅ | fmtLen in millimetres rounds to whole millimetres | core | 0.1 ms |
| ✅ | walls that do not close make no room | rooms | 0.1 ms |
| ✅ | triangulate covers the concave U exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | orientedRect swaps length and width so the long side wins | core | 0.1 ms |
| ✅ | a gap larger than the tolerance keeps the outline open | rooms | 0.1 ms |
| ✅ | offsetPolygon applies per-edge distances (counter-clockwise) | core | 0.1 ms |
| ✅ | theme midnight: body text is readable on the background (contrast ≥ 4.5) | core | 0.1 ms |
| ✅ | a collinear continuation is cut square at the shared point | walls | 0.1 ms |
| ✅ | fitOpening keeps an opening inside its wall | walls | 0.1 ms |
| ✅ | sunPosition accepts a timestamp as well as a Date | core | 0.1 ms |
| ✅ | lineIntersect finds the crossing of two infinite lines | core | 0.1 ms |
| ✅ | offsetPolygon leaves fewer than three points alone | core | 0.1 ms |
| ✅ | offsetPolygon bevels a very sharp corner instead of spiking | core | 0.1 ms |
| ✅ | offsetPolygon with a negative distance grows the polygon | core | 0.1 ms |
| ✅ | wallAt honours the thickness and the margin | walls | 0.1 ms |
| ✅ | pointInPolygon distinguishes inside, outside and the notch | core | 0.1 ms |
| ✅ | polygonCentroid of a degenerate polygon falls back to the vertex average | core | 0.1 ms |
| ✅ | convexHull of fewer than three points returns them sorted | core | 0.1 ms |
| ✅ | fmtArea in square metres and square feet | core | 0.1 ms |
| ✅ | pointSegDist is the distance part of closestOnSegment | core | 0.1 ms |
| ✅ | triangulate of a triangle is that triangle | core | 0.1 ms |
| ✅ | segIntersect reports touching segments (T and shared end) | core | 0.1 ms |
| ✅ | triangulate of fewer than three points is empty | core | 0.1 ms |
| ✅ | triangulate covers the clockwise U exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | closestOnSegment of a degenerate segment returns its single point | core | 0.1 ms |
| ✅ | fmtLen in centimetres and metres | core | 0.1 ms |
| ✅ | offsetPolygon of an L keeps the re-entrant corner exact | core | 0.1 ms |
| ✅ | fmtLen in feet never shows 12 inches | core | 0.1 ms |
| ✅ | triangulate covers the clockwise L exactly with n − 2 triangles | core | 0.1 ms |
| ✅ | snapAngle leaves an angle alone outside the tolerance | core | 0.1 ms |
| ✅ | fmtLen of a non-finite value is a dash | core | 0.1 ms |
| ✅ | segIntersect returns null when segments miss or are parallel | core | 0.0 ms |
| ✅ | lineIntersect returns null for parallel and coincident lines | core | 0.0 ms |
| ✅ | theme lavender: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme peach: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme nord: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme ivory: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme dracula: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme mocha: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme oceanic: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme tokyo-night: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme github-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme solarized-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme gruvbox-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme monokai: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme forest: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme rose: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme hc-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme cyberpunk: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme espresso: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme one-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme sky: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme lime: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme arctic: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme crimson: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme latte: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme slate: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme amethyst: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme daylight: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme deep-sea: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme hc-dark: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme gruvbox-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme sakura: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme cobalt-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme sand: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme paper: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme nord-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme mint: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme stone: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme solarized-light: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |
| ✅ | theme aurora: body text is readable on the background (contrast ≥ 4.5) | core | 0.0 ms |

</details>

<details><summary><b>Plan editing</b> · 평면 편집 — 131 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | draws every level of 37-u-shaped-apartments.myarch in every wall style and phase filter | plan | 565 ms |
| ✅ | draws every level of 29-hotel.myarch in every wall style and phase filter | plan | 508 ms |
| ✅ | draws every level of 32-residential-complex.myarch in every wall style and phase filter | plan | 368 ms |
| ✅ | draws every level of 10-office-tower.myarch in every wall style and phase filter | plan | 320 ms |
| ✅ | draws every level of 35-courtyard-school.myarch in every wall style and phase filter | plan | 312 ms |
| ✅ | draws every level of 34-general-hospital.myarch in every wall style and phase filter | plan | 221 ms |
| ✅ | draws every level of 11-mixed-use.myarch in every wall style and phase filter | plan | 191 ms |
| ✅ | draws every level of 33-atrium-office.myarch in every wall style and phase filter | plan | 150 ms |
| ✅ | draws every level of 36-terraced-office.myarch in every wall style and phase filter | plan | 141 ms |
| ✅ | draws every level of 13-school.myarch in every wall style and phase filter | plan | 80 ms |
| ✅ | draws every level of 30-university-library.myarch in every wall style and phase filter | plan | 66 ms |
| ✅ | draws every level of 01-studio.myarch in every wall style and phase filter | plan | 51 ms |
| ✅ | draws every level of 12-hospital.myarch in every wall style and phase filter | plan | 40 ms |
| ✅ | draws every level of 02-two-bedroom.myarch in every wall style and phase filter | plan | 38 ms |
| ✅ | draws every level of 23-bridges.myarch in every wall style and phase filter | plan | 36 ms |
| ✅ | draws every level of 03-two-storey-house.myarch in every wall style and phase filter | plan | 35 ms |
| ✅ | draws every level of 08-apartment-block.myarch in every wall style and phase filter | plan | 34 ms |
| ✅ | draws every level of 16-modern-villa.myarch in every wall style and phase filter | plan | 27 ms |
| ✅ | draws every level of 31-sports-centre.myarch in every wall style and phase filter | plan | 26 ms |
| ✅ | draws every level of 14-courtyard-house.myarch in every wall style and phase filter | plan | 24 ms |
| ✅ | draws every level of 17-townhouse.myarch in every wall style and phase filter | plan | 23 ms |
| ✅ | draws every level of 15-sketchup-complex.myarch in every wall style and phase filter | plan | 22 ms |
| ✅ | draws every level of 40-penthouse.myarch in every wall style and phase filter | plan | 22 ms |
| ✅ | draws every level of 38-museum.myarch in every wall style and phase filter | plan | 19 ms |
| ✅ | a sample plan renders to well-formed SVG through SvgContext | plan | 19 ms |
| ✅ | draws every level of 19-duplex.myarch in every wall style and phase filter | plan | 18 ms |
| ✅ | draws every level of 04-small-office.myarch in every wall style and phase filter | plan | 16 ms |
| ✅ | draws every level of 18-modern-farmhouse.myarch in every wall style and phase filter | plan | 16 ms |
| ✅ | draws every level of 21-interior-design.myarch in every wall style and phase filter | plan | 16 ms |
| ✅ | draws every level of 06-renovation-bim.myarch in every wall style and phase filter | plan | 15 ms |
| ✅ | draws every level of 39-cafe-bistro.myarch in every wall style and phase filter | plan | 12 ms |
| ✅ | draws every level of 22-lattice-towers.myarch in every wall style and phase filter | plan | 10 ms |
| ✅ | an opening wins over the wall it sits in | plan | 7.5 ms |
| ✅ | draws every level of 07-massing-study.myarch in every wall style and phase filter | plan | 7.2 ms |
| ✅ | draws every level of 05-wooden-cabin.myarch in every wall style and phase filter | plan | 6.5 ms |
| ✅ | draws every level of 27-extradosed-bridge.myarch in every wall style and phase filter | plan | 5.9 ms |
| ✅ | tracing images are pooled: snapshots hold a short reference, undo restores the picture | store | 5.8 ms |
| ✅ | draws every level of 20-compact-house.myarch in every wall style and phase filter | plan | 5.7 ms |
| ✅ | draws every level of 25-haunched-girder-bridge.myarch in every wall style and phase filter | plan | 4.9 ms |
| ✅ | undo and redo restore the project and name the step | store | 4.8 ms |
| ✅ | draws every level of 26-harp-cable-stayed-bridge.myarch in every wall style and phase filter | plan | 4.7 ms |
| ✅ | starts with one untouched tab | docs | 4.2 ms |
| ✅ | each tab keeps its own project, undo stack and dirty flag | docs | 3.8 ms |
| ✅ | draws every level of 09-cad-tracing.myarch in every wall style and phase filter | plan | 3.7 ms |
| ✅ | draws every level of 28-stress-ribbon-footbridge.myarch in every wall style and phase filter | plan | 3.2 ms |
| ✅ | draws every level of 24-deck-arch-bridge.myarch in every wall style and phase filter | plan | 3.1 ms |
| ✅ | furniture wins over the room it stands in; the smaller room wins over the bigger | plan | 2.1 ms |
| ✅ | mass models: hit, selected, moved, scaled and drawn with their taper | plan | 2.0 ms |
| ✅ | planBounds covers a level, every level, or nothing | plan | 1.9 ms |
| ✅ | closing: the active tab hands over to its right, then left neighbour; the last leaves a blank tab | docs | 1.6 ms |
| ✅ | selectionCentre is the middle of the selection's bounding box | plan | 1.5 ms |
| ✅ | change events fire for edits, undo and redo; revision increases | store | 1.4 ms |
| ✅ | pasting gives new ids, the target level and the offset | plan | 1.3 ms |
| ✅ | drawPlan draws every kind of item of the test scene | plan | 1.3 ms |
| ✅ | an edit marks only the active tab dirty | docs | 1.2 ms |
| ✅ | grid bubbles and grid lines are hit on every level | plan | 1.2 ms |
| ✅ | copying a wall brings its openings and the selection centre | plan | 1.1 ms |
| ✅ | drawings: arcs only along their sweep, circles on the rim, polylines on their segments | plan | 1.1 ms |
| ✅ | moving a wall stretches the walls joined to it | plan | 1.0 ms |
| ✅ | a wall is hit within half its thickness plus the tolerance | plan | 1.0 ms |
| ✅ | pasting dimensions, texts, drawings and labels moves every point | plan | 1.0 ms |
| ✅ | a drag (begin / preview / commit) is one undo step | store | 1.0 ms |
| ✅ | new tabs open right after the active one | docs | 1.0 ms |
| ✅ | groupMembers selects a whole group with the openings of its walls | plan | 0.9 ms |
| ✅ | rotating nothing does nothing | plan | 0.9 ms |
| ✅ | the revision only grows across switches | docs | 0.9 ms |
| ✅ | moving a wall does not drag walls on other levels | plan | 0.9 ms |
| ✅ | opening another document empties the image pool | store | 0.8 ms |
| ✅ | openings on a stretched wall are kept inside it | plan | 0.8 ms |
| ✅ | move, neighbour (wrapping) and find by path | docs | 0.8 ms |
| ✅ | a window selects only what is fully inside | plan | 0.8 ms |
| ✅ | wall ends attract the cursor first | plan | 0.8 ms |
| ✅ | rotateItems turns furniture, columns, stairs, texts, arcs and underlays | plan | 0.8 ms |
| ✅ | rotateItems turns walls about the selection centre | plan | 0.7 ms |
| ✅ | closing an inactive tab leaves the store alone | docs | 0.7 ms |
| ✅ | a new edit clears the redo stack | store | 0.7 ms |
| ✅ | every kind of item moves by the offset | plan | 0.7 ms |
| ✅ | mirroring a wall flips its door to the same physical side | plan | 0.7 ms |
| ✅ | scaleItems scales positions and sizes about the centre | plan | 0.7 ms |
| ✅ | mirroring keeps rooms counter-clockwise and flips dimensions and arcs | plan | 0.7 ms |
| ✅ | deleting a wall deletes its openings; grids can be deleted | plan | 0.7 ms |
| ✅ | mirroring furniture flips its rotation | plan | 0.6 ms |
| ✅ | the nearest target wins and excluded items are skipped | plan | 0.6 ms |
| ✅ | handles of selected rooms, roofs and dimensions | plan | 0.6 ms |
| ✅ | grids are drawn on every level and can be hidden | plan | 0.6 ms |
| ✅ | text notes are hit inside their text box | plan | 0.6 ms |
| ✅ | plain numbers are millimetres | plan | 0.6 ms |
| ✅ | mirroring about y moves points across the horizontal centre line | plan | 0.6 ms |
| ✅ | columns and stairs are hit inside their outline | plan | 0.6 ms |
| ✅ | circles and arcs are tested by their bounding square | plan | 0.6 ms |
| ✅ | handles of a selected wall come first | plan | 0.6 ms |
| ✅ | drawWalls returns the outlines and the solid pieces | plan | 0.6 ms |
| ✅ | moveWallEnd moves every wall end joined at that point | plan | 0.6 ms |
| ✅ | an opening moved on its own slides along its wall, clamped | plan | 0.6 ms |
| ✅ | a counter-clockwise arc covers the other part of the circle | plan | 0.6 ms |
| ✅ | with stretch off (Alt) joined walls stay | plan | 0.6 ms |
| ✅ | drawing from a point constrains to 45° steps and grid lengths | plan | 0.6 ms |
| ✅ | an opening copied without its wall is not pasted | plan | 0.5 ms |
| ✅ | copying nothing gives an empty clipboard centred at the origin | plan | 0.5 ms |
| ✅ | underlays and roof overhangs are hit last | plan | 0.5 ms |
| ✅ | deleting only an opening keeps its wall | plan | 0.5 ms |
| ✅ | a dimension is hit on its offset line | plan | 0.5 ms |
| ✅ | moveWallEnd keeps openings inside the shortened wall | plan | 0.5 ms |
| ✅ | room vertices and column centres are snap targets | plan | 0.4 ms |
| ✅ | a crossing box selects what it touches | plan | 0.4 ms |
| ✅ | drawings on hidden layers are not hit | plan | 0.4 ms |
| ✅ | with endpoints off the cursor projects onto the wall, on the grid | plan | 0.4 ms |
| ✅ | ortho is off without a start point or with ortho: false | plan | 0.4 ms |
| ✅ | planBounds includes circles by their radius and ignores non-finite points | plan | 0.4 ms |
| ✅ | items on other levels are ignored and empty space hits nothing | plan | 0.4 ms |
| ✅ | an opening moved with its wall keeps its position on the wall | plan | 0.4 ms |
| ✅ | rotateItems about a given centre, snapped to the grid | plan | 0.4 ms |
| ✅ | a big window selects every kind of item on the level | plan | 0.4 ms |
| ✅ | image pools are per tab (loading one tab does not clear another's) | docs | 0.4 ms |
| ✅ | away from everything the cursor snaps to the grid | plan | 0.3 ms |
| ✅ | a ray that meets a wall centre line ends exactly on it | plan | 0.3 ms |
| ✅ | SvgContext escapes text and keeps the transform stack | plan | 0.3 ms |
| ✅ | ortho never runs backwards past the start point | plan | 0.3 ms |
| ✅ | ortho lines up with another wall's end and returns the guide | plan | 0.3 ms |
| ✅ | stairGeometry gives the outline of a rotated stair | plan | 0.3 ms |
| ✅ | on-wall snapping is clamped to the wall's length | plan | 0.2 ms |
| ✅ | the dark and light plan themes define the same colours | plan | 0.2 ms |
| ✅ | phaseVisible for every filter | plan | 0.2 ms |
| ✅ | pointAtLength walks from a point towards another | plan | 0.2 ms |
| ✅ | metres, centimetres and a decimal comma | plan | 0.2 ms |
| ✅ | feet and inches | plan | 0.2 ms |
| ✅ | roomColor uses the room's colour, else its floor material | plan | 0.2 ms |
| ✅ | dimensionGeometry offsets the line along its left normal | plan | 0.2 ms |
| ✅ | bad input gives null | plan | 0.1 ms |
| ✅ | a length with an angle | plan | 0.1 ms |
| ✅ | gridBubble sits beyond each end of the grid line | plan | 0.1 ms |

</details>

<details><summary><b>Checks & schedules</b> · 검사·집계 — 94 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | lists every opening with its tag, sorted by tag | schedule | 9.2 ms |
| ✅ | lists each room with level, area and perimeter | schedule | 5.4 ms |
| ✅ | an empty project has no issues | check | 5.2 ms |
| ✅ | wall-short: the trigger fixture raises it and the near miss does not | check | 2.5 ms |
| ✅ | goes level by level and fills missing names and floors with empty strings | schedule | 1.9 ms |
| ✅ | stair-riser: the trigger fixture raises it and the near miss does not | check | 1.9 ms |
| ✅ | room-no-door: the trigger fixture raises it and the near miss does not | check | 1.4 ms |
| ✅ | wall-duplicate: the trigger fixture raises it and the near miss does not | check | 1.3 ms |
| ✅ | door-blocked: the trigger fixture raises it and the near miss does not | check | 1.2 ms |
| ✅ | slab-overlap: the trigger fixture raises it and the near miss does not | check | 1.1 ms |
| ✅ | the box building's numbers | schedule | 1.0 ms |
| ✅ | sliding and garage doors, rugs and low furniture never block a swing | check | 0.9 ms |
| ✅ | ramp-steep: the trigger fixture raises it and the near miss does not | check | 0.9 ms |
| ✅ | furniture-wall: the trigger fixture raises it and the near miss does not | check | 0.9 ms |
| ✅ | opening-outside: the trigger fixture raises it and the near miss does not | check | 0.8 ms |
| ✅ | CHECKS lists unique codes with descriptions | check | 0.8 ms |
| ✅ | opening-overlap: the trigger fixture raises it and the near miss does not | check | 0.8 ms |
| ✅ | openings past the wall end only remove the part on the wall | schedule | 0.8 ms |
| ✅ | prices walls, floors, doors and windows of the box | schedule | 0.7 ms |
| ✅ | two levels and projectTotals | schedule | 0.7 ms |
| ✅ | room-small: the trigger fixture raises it and the near miss does not | check | 0.7 ms |
| ✅ | door-blocked follows the hinge side | check | 0.7 ms |
| ✅ | wall-short scales with the thickness (75 %) and has a 50 mm floor | check | 0.7 ms |
| ✅ | room-overlap names both rooms at the second room's centre | check | 0.7 ms |
| ✅ | beam-short: the trigger fixture raises it and the near miss does not | check | 0.7 ms |
| ✅ | a stair on the upper of two levels leads nowhere either | check | 0.6 ms |
| ✅ | slab-hole: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | clash-stair: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | shaft-empty: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | rugs, high furniture and furniture in an opening are not in a wall | check | 0.6 ms |
| ✅ | clash-column: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | groups typed walls by type and untyped walls by thickness | schedule | 0.6 ms |
| ✅ | room-small stops at 1.5 m² | check | 0.6 ms |
| ✅ | opening-tall: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | railing-low: the trigger fixture raises it and the near miss does not | check | 0.6 ms |
| ✅ | a user tag sorts with the others | schedule | 0.6 ms |
| ✅ | roofs by plan area, stairs, columns and openings per piece | schedule | 0.5 ms |
| ✅ | stair-top: the trigger fixture raises it and the near miss does not | check | 0.5 ms |
| ✅ | an empty project has no rows | schedule | 0.5 ms |
| ✅ | room-overlap: the trigger fixture raises it and the near miss does not | check | 0.5 ms |
| ✅ | walls with their own height count that height | schedule | 0.5 ms |
| ✅ | chairs tucked under a table are not a clash | check | 0.5 ms |
| ✅ | furniture at different heights, rugs and low items do not clash | check | 0.5 ms |
| ✅ | every issue has the documented fields | check | 0.5 ms |
| ✅ | furniture uses each item's own price, else the unit price | schedule | 0.5 ms |
| ✅ | an opening whose wall is gone shows no level and no thickness | schedule | 0.5 ms |
| ✅ | wall-short is a warning with the length, at the wall's middle | check | 0.4 ms |
| ✅ | room-no-door names the room | check | 0.4 ms |
| ✅ | room-small reports the name and the area in m² | check | 0.4 ms |
| ✅ | a window is not a way in, but an opening is | check | 0.4 ms |
| ✅ | a window above the wall top only removes the part inside the wall | schedule | 0.4 ms |
| ✅ | opening-outside names the opening by its tag | check | 0.4 ms |
| ✅ | wall-duplicate ignores parallel walls apart and short overlaps | check | 0.4 ms |
| ✅ | door-blocked names the door and points at the furniture | check | 0.4 ms |
| ✅ | runCheck does not change the project | check | 0.4 ms |
| ✅ | a full room schedule exports one row per room | schedule | 0.4 ms |
| ✅ | clash-furniture: the trigger fixture raises it and the near miss does not | check | 0.4 ms |
| ✅ | furniture in a wall is reported once even across several walls | check | 0.4 ms |
| ✅ | opening-tall uses the wall's own height | check | 0.4 ms |
| ✅ | rotated furniture is tested by its rotated footprint | check | 0.4 ms |
| ✅ | opening-outside at the far end and within the 1 mm slack | check | 0.4 ms |
| ✅ | rows are sorted by area, largest first | schedule | 0.4 ms |
| ✅ | clash-column names the blocked opening | check | 0.4 ms |
| ✅ | clash-stair is an error naming the stair and the wall | check | 0.4 ms |
| ✅ | furniture-wall is a warning with the furniture and the wall | check | 0.4 ms |
| ✅ | clash-stair follows the stair's rotation | check | 0.4 ms |
| ✅ | opening-overlap names both openings | check | 0.3 ms |
| ✅ | stair-top is a warning on the top level | check | 0.3 ms |
| ✅ | clash-furniture is a warning at the midpoint of the two pieces | check | 0.3 ms |
| ✅ | opening-tall reports the head height and the wall height | check | 0.3 ms |
| ✅ | demolished items are left out and existing ones cost nothing | schedule | 0.3 ms |
| ✅ | wall-duplicate is an error with the overlap length at its middle | check | 0.3 ms |
| ✅ | a stair inside the room is a way in | check | 0.3 ms |
| ✅ | room-overlap finds a room inside another | check | 0.3 ms |
| ✅ | custom unit prices and currency, and a project without costs | schedule | 0.3 ms |
| ✅ | issues are reported per level | check | 0.3 ms |
| ✅ | walls on different levels never overlap each other | check | 0.3 ms |
| ✅ | a door far from the room does not count | check | 0.3 ms |
| ✅ | starts with a UTF-8 BOM and ends every line with CRLF | schedule | 0.3 ms |
| ✅ | rooms on different levels do not overlap | check | 0.2 ms |
| ✅ | door-blocked follows the swing side | check | 0.2 ms |
| ✅ | a column in a window is a clash too | check | 0.2 ms |
| ✅ | opening-overlap between a door and a window, in any order | check | 0.2 ms |
| ✅ | furniture touching a wall face is fine | check | 0.2 ms |
| ✅ | openings that just touch do not overlap | check | 0.2 ms |
| ✅ | an empty project sums to zero | schedule | 0.2 ms |
| ✅ | wall-duplicate also finds walls drawn the other way | check | 0.2 ms |
| ✅ | an unnamed room is called — | check | 0.2 ms |
| ✅ | room-no-door needs walls on the level | check | 0.2 ms |
| ✅ | every check code has a test fixture | check | 0.2 ms |
| ✅ | missing values become empty fields and Korean text is kept | schedule | 0.1 ms |
| ✅ | quotes fields with commas, quotes, semicolons and line breaks | schedule | 0.1 ms |
| ✅ | numbers: integers as they are, others with two decimals | schedule | 0.1 ms |
| ✅ | headers are escaped too and no rows gives just the header | schedule | 0.1 ms |

</details>

<details><summary><b>Views, sheets & annotation</b> · 뷰·시트·주석 — 36 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every sample generates a section and an elevation without errors | views | 1.78 s |
| ✅ | an elevation sees the wall face and hides the column behind it | views | 38 ms |
| ✅ | the sheet renders to SVG with its title block and the generated section | views | 27 ms |
| ✅ | DXF of the section view and of the sheet | views | 13 ms |
| ✅ | layer boundaries are lines between different materials | views | 12 ms |
| ✅ | fine: one strip per layer, exact widths and materials | views | 9.2 ms |
| ✅ | medium: the wall reads as its structure layer, one polygon | views | 8.6 ms |
| ✅ | sorting, filters, grouping with subtotals, totals | views | 8.4 ms |
| ✅ | a ceiling plan cuts the walls at the cut height (plan orientation) | views | 7.6 ms |
| ✅ | a crop clips the poché | views | 6.9 ms |
| ✅ | the far clip drops what lies beyond it | views | 6.6 ms |
| ✅ | flipping looks the other way (the column is behind the viewer) | views | 5.9 ms |
| ✅ | old files get the implicit level views and one sheet per level with its plan | views | 1.5 ms |
| ✅ | the frame looks to the left of the drawn line | views | 1.3 ms |
| ✅ | room tags show name and area | views | 1.1 ms |
| ✅ | hit testing and moving | views | 0.7 ms |
| ✅ | every tool, command label and category name has a Korean translation | views | 0.7 ms |
| ✅ | calculated values and formulas | views | 0.6 ms |
| ✅ | editable cells write back to the model; CSV exports | views | 0.6 ms |
| ✅ | sections show as markers on plans and are hit by their heads | views | 0.5 ms |
| ✅ | plan views hide categories and windows above the cut | views | 0.5 ms |
| ✅ | a viewport is the view's crop at its scale, centred on its point | views | 0.5 ms |
| ✅ | door tags show the mark, size fields read through | views | 0.4 ms |
| ✅ | sheet numbering, detail numbers, placement and drawing list | views | 0.4 ms |
| ✅ | dangling references are dropped | views | 0.4 ms |
| ✅ | hatch lines stay inside the polygon | views | 0.4 ms |
| ✅ | the cut wall is one exact rectangle (poché) | views | 0.3 ms |
| ✅ | chaining and merging helpers | views | 0.3 ms |
| ✅ | the cut outline is drawn heavy and complete | views | 0.3 ms |
| ✅ | free placement does not overlap existing viewports | views | 0.3 ms |
| ✅ | the column beyond is projected exactly, with no triangulation diagonals | views | 0.3 ms |
| ✅ | ensureView stores an implicit view; templates apply | views | 0.3 ms |
| ✅ | wall tags show the type or thickness | views | 0.3 ms |
| ✅ | tags can find the elements in the view | views | 0.2 ms |
| ✅ | templates leave unknown fields blank; missing targets show ? | views | 0.2 ms |
| ✅ | revisions on a sheet: listed and from clouds in its views | views | 0.1 ms |

</details>

<details><summary><b>3D model</b> · 3D 모델 — 848 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every catalogue item builds one mesh per surface (and one per glowing part), inside its box | view3d | 765 ms |
| ✅ | moving furniture rebuilds only its level, and the result equals a fresh build | perf3d | 444 ms |
| ✅ | the sample 37-u-shaped-apartments.myarch builds with one tagged mesh per item | view3d | 375 ms |
| ✅ | the sample 10-office-tower.myarch builds with one tagged mesh per item | view3d | 362 ms |
| ✅ | furniture parts, frames and door leaves share a handful of geometries | perf3d | 321 ms |
| ✅ | the sample 35-courtyard-school.myarch builds with one tagged mesh per item | view3d | 310 ms |
| ✅ | the sample 29-hotel.myarch builds with one tagged mesh per item | view3d | 270 ms |
| ✅ | the sample 32-residential-complex.myarch builds with one tagged mesh per item | view3d | 233 ms |
| ✅ | the sample 33-atrium-office.myarch builds with one tagged mesh per item | view3d | 216 ms |
| ✅ | the sample 34-general-hospital.myarch builds with one tagged mesh per item | view3d | 179 ms |
| ✅ | the sample 36-terraced-office.myarch builds with one tagged mesh per item | view3d | 174 ms |
| ✅ | repeated meshes become instances: far fewer draw calls | perf3d | 165 ms |
| ✅ | the sample 11-mixed-use.myarch builds with one tagged mesh per item | view3d | 146 ms |
| ✅ | the sample 30-university-library.myarch builds with one tagged mesh per item | view3d | 108 ms |
| ✅ | IFC: members export as their classes and come back with their bridge | structures | 85 ms |
| ✅ | the sample 13-school.myarch builds with one tagged mesh per item | view3d | 83 ms |
| ✅ | the sample 23-bridges.myarch builds with one tagged mesh per item | view3d | 73 ms |
| ✅ | IFC4.3: a bridge is an IfcBridge holding its members, and reads back | structures | 67 ms |
| ✅ | the sample 12-hospital.myarch builds with one tagged mesh per item | view3d | 58 ms |
| ✅ | an unchanged project reuses every level group | perf3d | 55 ms |
| ✅ | drawFurniturePlan draws one filled and stroked shape per part | view3d | 49 ms |
| ✅ | the sample 15-sketchup-complex.myarch builds with one tagged mesh per item | view3d | 48 ms |
| ✅ | glowing lamp parts and see-through parts are never batched | perf3d | 42 ms |
| ✅ | the sample 08-apartment-block.myarch builds with one tagged mesh per item | view3d | 40 ms |
| ✅ | 3D: a tower builds with a handful of geometries and few draw calls | structures | 34 ms |
| ✅ | the sample 31-sports-centre.myarch builds with one tagged mesh per item | view3d | 32 ms |
| ✅ | every lamp gets one anchor at its bulb; lit lamps glow, switched-off lamps do not | lights | 31 ms |
| ✅ | the instances sit exactly where the meshes were | perf3d | 31 ms |
| ✅ | the sample 14-courtyard-house.myarch builds with one tagged mesh per item | view3d | 30 ms |
| ✅ | the sample 02-two-bedroom.myarch builds with one tagged mesh per item | view3d | 28 ms |
| ✅ | the sample 38-museum.myarch builds with one tagged mesh per item | view3d | 28 ms |
| ✅ | unit primitives are one per kind and flagged as shared | perf3d | 24 ms |
| ✅ | the sample 17-townhouse.myarch builds with one tagged mesh per item | view3d | 22 ms |
| ✅ | the sample 16-modern-villa.myarch builds with one tagged mesh per item | view3d | 21 ms |
| ✅ | the sample 21-interior-design.myarch builds with one tagged mesh per item | view3d | 20 ms |
| ✅ | the sample 19-duplex.myarch builds with one tagged mesh per item | view3d | 20 ms |
| ✅ | the sample 22-lattice-towers.myarch builds with one tagged mesh per item | view3d | 20 ms |
| ✅ | the sample 40-penthouse.myarch builds with one tagged mesh per item | view3d | 20 ms |
| ✅ | the sample 03-two-storey-house.myarch builds with one tagged mesh per item | view3d | 19 ms |
| ✅ | the sample 18-modern-farmhouse.myarch builds with one tagged mesh per item | view3d | 19 ms |
| ✅ | the sample 01-studio.myarch builds with one tagged mesh per item | view3d | 14 ms |
| ✅ | the sample 39-cafe-bistro.myarch builds with one tagged mesh per item | view3d | 14 ms |
| ✅ | the sample 27-extradosed-bridge.myarch builds with one tagged mesh per item | view3d | 14 ms |
| ✅ | DXF: members on S-MEMB | structures | 13 ms |
| ✅ | sheets, views and annotations do not touch the 3D | perf3d | 13 ms |
| ✅ | the sample 06-renovation-bim.myarch builds with one tagged mesh per item | view3d | 12 ms |
| ✅ | every type makes valid members | structures | 11 ms |
| ✅ | a plain wall stays one mesh in its own material | interior | 10 ms |
| ✅ | the sample 25-haunched-girder-bridge.myarch builds with one tagged mesh per item | view3d | 9.3 ms |
| ✅ | a wall without openings is a closed box of L × T × H | view3d | 9.2 ms |
| ✅ | the sample 26-harp-cable-stayed-bridge.myarch builds with one tagged mesh per item | view3d | 9.0 ms |
| ✅ | a horizontal member spans its axis at its height, its section around it | members | 8.3 ms |
| ✅ | the sample 24-deck-arch-bridge.myarch builds with one tagged mesh per item | view3d | 8.2 ms |
| ✅ | an imported model replaces its placeholder once loaded | view3d | 8.1 ms |
| ✅ | the sample 04-small-office.myarch builds with one tagged mesh per item | view3d | 8.1 ms |
| ✅ | the sample 20-compact-house.myarch builds with one tagged mesh per item | view3d | 7.2 ms |
| ✅ | the sample 28-stress-ribbon-footbridge.myarch builds with one tagged mesh per item | view3d | 7.1 ms |
| ✅ | identical members share one geometry and batch into one draw call | members | 6.9 ms |
| ✅ | the raycaster still picks batched meshes | perf3d | 6.8 ms |
| ✅ | paintPattern paints venetian-plaster (noise) deterministically | view3d | 5.8 ms |
| ✅ | the sample 05-wooden-cabin.myarch builds with one tagged mesh per item | view3d | 5.3 ms |
| ✅ | openings keep their reveals in the wall material | interior | 5.2 ms |
| ✅ | a build made without keys can be followed by a keyed one | perf3d | 5.1 ms |
| ✅ | the sample 07-massing-study.myarch builds with one tagged mesh per item | view3d | 4.7 ms |
| ✅ | a window cuts a hole of width × height through the wall | view3d | 4.5 ms |
| ✅ | a hidden level is carried over but stays hidden | perf3d | 4.5 ms |
| ✅ | ceiling lamps and wall lights do not raise model-check warnings | lights | 4.5 ms |
| ✅ | add, edit (members made again) and remove a structure | structures | 4.2 ms |
| ✅ | pickLamps: only lit lamps, nearest first, capped per type | lights | 3.8 ms |
| ✅ | normalizeProject fills in lamps, clamps values and drops stray light data | lights | 3.8 ms |
| ✅ | stops at a door but runs under a window | interior | 3.7 ms |
| ✅ | batched meshes move to the hidden layer and come back on release | perf3d | 3.7 ms |
| ✅ | paintPattern paints asphalt (asphalt) deterministically | view3d | 3.6 ms |
| ✅ | a door cuts down to the floor; a full-height opening leaves no head | view3d | 3.3 ms |
| ✅ | every lamp has a glowing part and its bulb inside its box | lights | 3.1 ms |
| ✅ | furniture groups are placed, turned and tagged | view3d | 3.1 ms |
| ✅ | paintPattern paints vinyl-grey (noise) deterministically | view3d | 3.1 ms |
| ✅ | a gable roof peaks at base + (wid / 2)·tan(pitch), with gable walls | view3d | 3.0 ms |
| ✅ | mass models are tagged prisms; a taper of 0 makes a pyramid | view3d | 3.0 ms |
| ✅ | the plan hit test prefers a lamp over the table under it | lights | 2.9 ms |
| ✅ | paintPattern paints concrete (noise) deterministically | view3d | 2.9 ms |
| ✅ | slender round members (cables, rods) get a centre-line wire; angles and heavy members do not | members | 2.8 ms |
| ✅ | paintPattern paints corten (noise) deterministically | view3d | 2.8 ms |
| ✅ | wall finishes show as bands in their colour along the faces | interior | 2.8 ms |
| ✅ | show(ids) draws an item by its own meshes and hides its instances | perf3d | 2.8 ms |
| ✅ | a spot points down (and the spotlight tilts forward with the item's rotation) | lights | 2.7 ms |
| ✅ | paintPattern paints galvanised (noise) deterministically | view3d | 2.6 ms |
| ✅ | the catalogue has unique kinds, categories and sensible sizes | view3d | 2.5 ms |
| ✅ | the sample 09-cad-tracing.myarch builds with one tagged mesh per item | view3d | 2.5 ms |
| ✅ | catalogue item sofa2Navy: parts are valid and fit its box | view3d | 2.4 ms |
| ✅ | catalogue item shelving: parts are valid and fit its box | view3d | 2.4 ms |
| ✅ | a post stands from the floor to its top; a brace climbs | members | 2.3 ms |
| ✅ | finishR / finishL paint one face each; the rest keeps the wall material | interior | 2.2 ms |
| ✅ | windows of every type stay inside their hole | view3d | 2.2 ms |
| ✅ | the lamp rig: a fixed pool, switches change intensities only | lights | 2.2 ms |
| ✅ | big buildings get the lighter furniture detail, small ones the full one | view3d | 2.1 ms |
| ✅ | 3D: every part type makes a closed, outward geometry inside its bounds | view3d | 2.1 ms |
| ✅ | a pasted structure is a new one | structures | 2.0 ms |
| ✅ | double, sliding and garage doors build their own leaves | view3d | 2.0 ms |
| ✅ | a room's wall finish covers every wall face that looks into it | interior | 2.0 ms |
| ✅ | saved and read back; a structure without members is dropped | structures | 1.9 ms |
| ✅ | openDoors swings the leaf into the room on its side | view3d | 1.9 ms |
| ✅ | paintPattern paints carpet-wool (weave) deterministically | view3d | 1.9 ms |
| ✅ | catalogue item conferenceSet: parts are valid and fit its box | view3d | 1.8 ms |
| ✅ | paintPattern paints lime-plaster (noise) deterministically | view3d | 1.7 ms |
| ✅ | a suspension bridge: two towers, two main cables, hangers between them | structures | 1.7 ms |
| ✅ | switchLamps flips the chosen lamps in one undo step; undo brings them back | lights | 1.7 ms |
| ✅ | paintPattern paints carpet-blue (weave) deterministically | view3d | 1.7 ms |
| ✅ | every profile has a closed section with a positive area | members | 1.6 ms |
| ✅ | paintPattern paints rubber-black (noise) deterministically | view3d | 1.6 ms |
| ✅ | runs round the room at its height, inside the room | interior | 1.6 ms |
| ✅ | catalogue item plantPalm: parts are valid and fit its box | view3d | 1.6 ms |
| ✅ | paintPattern paints marble (noise) deterministically | view3d | 1.6 ms |
| ✅ | a section cut keeps the lamps of the levels below it (a ceiling lamp above the cut still lights its room) | lights | 1.5 ms |
| ✅ | paintPattern paints linen (weave) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints carpet (noise) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints concrete-polished (noise) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints screed (noise) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints insulation (noise) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints grass (noise) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints fabric-panel (weave) deterministically | view3d | 1.5 ms |
| ✅ | paintPattern paints concrete-dark (noise) deterministically | view3d | 1.5 ms |
| ✅ | flat, hip and shed roofs build; opts.roofs: false leaves them out | view3d | 1.4 ms |
| ✅ | paintPattern paints marble-black (noise) deterministically | view3d | 1.4 ms |
| ✅ | catalogue item tulips: parts are valid and fit its box | view3d | 1.4 ms |
| ✅ | mitred corners: the walls of a closed box hold the frame volume | view3d | 1.4 ms |
| ✅ | an opening follows its wall's level | perf3d | 1.4 ms |
| ✅ | project-wide parts (levels, roofs, materials, options) rebuild every level | perf3d | 1.4 ms |
| ✅ | catalogue item chessBoard: parts are valid and fit its box | view3d | 1.4 ms |
| ✅ | catalogue item consoleTable: parts are valid and fit its box | view3d | 1.4 ms |
| ✅ | moving a bridge moves its parameters, so an edit rebuilds it in place | structures | 1.3 ms |
| ✅ | legs, ring struts, X bracing on every face, platforms and a mast | structures | 1.3 ms |
| ✅ | catalogue item plant: parts are valid and fit its box | view3d | 1.3 ms |
| ✅ | the mesh carries its id, kind and level | view3d | 1.3 ms |
| ✅ | a polyline member is one mesh per segment, tagged | members | 1.3 ms |
| ✅ | paintPattern paints gravel (gravel) deterministically | view3d | 1.3 ms |
| ✅ | demolished walls: hidden by the new-phase filter, red and translucent in the full view | view3d | 1.2 ms |
| ✅ | two openings remove both holes | view3d | 1.2 ms |
| ✅ | normalize fills sizes, profile, role and material | members | 1.1 ms |
| ✅ | paintPattern paints soil (noise) deterministically | view3d | 1.1 ms |
| ✅ | paintPattern paints sand (noise) deterministically | view3d | 1.1 ms |
| ✅ | the wall's own finish wins over the room's | interior | 1.1 ms |
| ✅ | on/off, brightness, colour and beam survive save and load | lights | 1.1 ms |
| ✅ | a stair has one prism per step and climbs to the level above | view3d | 1.0 ms |
| ✅ | catalogue item crib: parts are valid and fit its box | view3d | 1.0 ms |
| ✅ | members count in the model extent and the level keys | members | 1.0 ms |
| ✅ | moving, turning and pasting keep the heights | members | 1.0 ms |
| ✅ | a stair on the top level climbs the level height; rotation turns it | view3d | 1.0 ms |
| ✅ | modelExtent covers walls, rooms, roofs and furniture (plan millimetres) and the top | view3d | 1.0 ms |
| ✅ | paintPattern paints roof-green (noise) deterministically | view3d | 1.0 ms |
| ✅ | catalogue item flowerBed: parts are valid and fit its box | view3d | 1.0 ms |
| ✅ | a room floor is a slab under the level, as thick as the slab | view3d | 0.9 ms |
| ✅ | no skirting unless the room asks for it | interior | 0.9 ms |
| ✅ | piers stand at the inner stations, down to the ground | structures | 0.9 ms |
| ✅ | catalogue item meetingSet: parts are valid and fit its box | view3d | 0.9 ms |
| ✅ | paintPattern paints granite (terrazzo) deterministically | view3d | 0.9 ms |
| ✅ | catalogue item dryer: parts are valid and fit its box | view3d | 0.9 ms |
| ✅ | doors and windows become tagged groups with frames | view3d | 0.9 ms |
| ✅ | catalogue item espresso: parts are valid and fit its box | view3d | 0.9 ms |
| ✅ | catalogue item stove: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | catalogue item tableLampSage: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | paintPattern paints concrete-board (boards) deterministically | view3d | 0.8 ms |
| ✅ | catalogue item buffet: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | catalogue item kettlebells: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | catalogue item zzPlant: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | a Lighting category with ceiling, pendant, recessed, spot, track, wall and table lights | lights | 0.8 ms |
| ✅ | material ids are unique and colours are valid | view3d | 0.8 ms |
| ✅ | catalogue item candles: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | catalogue item standMixer: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | catalogue item kidsBookcase: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | wall materials: the wall's own, else the type's outer layer, else plaster | view3d | 0.8 ms |
| ✅ | hit test and box select find a member | members | 0.8 ms |
| ✅ | cable-stayed stays stay on the deck | structures | 0.8 ms |
| ✅ | catalogue item bbqKettle: parts are valid and fit its box | view3d | 0.8 ms |
| ✅ | one group per level, named and tagged; opts.levels hides the others | view3d | 0.7 ms |
| ✅ | catalogue item mirrorSunburst: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | a wall's own height and the level elevation place the wall | view3d | 0.7 ms |
| ✅ | catalogue item sofa3: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | catalogue item herbPots: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | paintPattern paints terrazzo (terrazzo) deterministically | view3d | 0.7 ms |
| ✅ | catalogue item tableSetFour: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | openings of demolished phase are hidden by the new filter | view3d | 0.7 ms |
| ✅ | catalogue item wallShelving: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | catalogue item libraryShelf: parts are valid and fit its box | view3d | 0.7 ms |
| ✅ | an L-shaped floor keeps its exact area | view3d | 0.7 ms |
| ✅ | columns: square prisms with rotation and round cylinders | view3d | 0.7 ms |
| ✅ | catalogue item vaseTall: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item succulents: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | depth ranks: roofs over walls over slabs over masses over the ground; copies are shared | members | 0.6 ms |
| ✅ | catalogue item bus: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item terrarium: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item barSet: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item wineRack: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item chandelierCrystal: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item utensilHolder: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | catalogue item plantSmall: parts are valid and fit its box | view3d | 0.6 ms |
| ✅ | paintPattern draws each pattern with its own strokes | view3d | 0.6 ms |
| ✅ | makeFurniture: lamps come on, ceiling lamps hang under the ceiling, wall lights at their height | lights | 0.6 ms |
| ✅ | a switch reaches an open 3D view straight away | lights | 0.6 ms |
| ✅ | catalogue item highTop: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plantFiddleSmall: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | opts.furniture: false leaves furniture out; imported models get a placeholder | view3d | 0.5 ms |
| ✅ | catalogue item chandelier: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | paintPattern paints brick (brick) deterministically | view3d | 0.5 ms |
| ✅ | catalogue item plantRubber: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item vasePampas: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plantFiddle: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item chandelierBlack: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item kitchenLine: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item flowerPotOutdoor: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item plantStand: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item spiceRack: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item chesterfield: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | a flat roof slab holds its plan area times thickness | view3d | 0.5 ms |
| ✅ | catalogue item verticalGarden: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item diningSetRound: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item vanity2Grey: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item diningSet6: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | paintPattern paints oak-herringbone (herringbone) deterministically | view3d | 0.5 ms |
| ✅ | catalogue item rangeGas: parts are valid and fit its box | view3d | 0.5 ms |
| ✅ | catalogue item peaceLily: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item patioSet: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item kitchenShelves: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | a plain opening has no frame | view3d | 0.4 ms |
| ✅ | catalogue item cafeSet: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | a wire runs inside the material: in an angle's heel and a channel's web, not the empty middle | members | 0.4 ms |
| ✅ | catalogue item washTower: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item playTable: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item bookshelfWide: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item diningSet4: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item vanity2: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item dumbbellRack: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item grassTuft: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item flowerVase: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item plantMonstera: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | normalize keeps the finishes and clamps the skirting height | interior | 0.4 ms |
| ✅ | the plan symbol: a circle with a cross, with rays when on | lights | 0.4 ms |
| ✅ | surface materials are cached per id and fall back to a colour | view3d | 0.4 ms |
| ✅ | catalogue item sofaVelvet: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item shrubFlowering: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item vaseSet: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item bedWing: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item snakePlant: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | catalogue item bedWingBlush: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | the item colour replaces the main colour only | view3d | 0.4 ms |
| ✅ | catalogue item plantBathroom: parts are valid and fit its box | view3d | 0.4 ms |
| ✅ | paintPattern paints metal-mesh (mesh) deterministically | view3d | 0.3 ms |
| ✅ | catalogue item queenBed: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item deskOffice: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item fanPedestal: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item pendantCluster: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item queenBedSage: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item wineCooler: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item queenBedGrey: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item breakfastSet: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | colour, glass, frame and door materials | view3d | 0.3 ms |
| ✅ | catalogue item vending: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | depth fixes: edge and wire lines move towards the camera; the ground disc gives way | members | 0.3 ms |
| ✅ | catalogue item hangingPlant: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item personWoman: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | paintPattern paints tile-hex (hex) deterministically | view3d | 0.3 ms |
| ✅ | paintPattern paints roof-metal (seams) deterministically | view3d | 0.3 ms |
| ✅ | catalogue item curtain: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item orchid: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item dishRack: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item sideboard: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item bambooGrove: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item stoveSteel: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item kingBed: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item wallShelf: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item officeChair: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | K and single-diagonal bracing | structures | 0.3 ms |
| ✅ | catalogue item range: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item pouf: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | the legs taper from the base width to the top width and reach the height | structures | 0.3 ms |
| ✅ | paintPattern paints plaster (plain) deterministically | view3d | 0.3 ms |
| ✅ | catalogue item dressingTable: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item hobInduction: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item teaSet: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item oliveTree: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item bathFreestanding: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | frames: level u across, v up, t along; a vertical member has u on plan x | members | 0.3 ms |
| ✅ | catalogue item privacyCurtain: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | parts scale with the item size | view3d | 0.3 ms |
| ✅ | catalogue item fruitBowl: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item piano: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item treeLarge: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item ceilingFan: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item hobGas: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item washbasin: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item waterHeater: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item pothosShelf: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | catalogue item toiletCubicle: parts are valid and fit its box | view3d | 0.3 ms |
| ✅ | drawFurniturePlan uses rect when roundRect is missing | view3d | 0.3 ms |
| ✅ | furnitureCorners follows position and rotation | view3d | 0.2 ms |
| ✅ | catalogue item curtainSheer: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item poufMustard: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item wineGlasses: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item armchair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | modelExtent's top includes tall furniture such as trees | view3d | 0.2 ms |
| ✅ | a straight alignment climbs with the grade; a crest rises in the middle | structures | 0.2 ms |
| ✅ | catalogue item personMan: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item saladBowl: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personBusiness: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item car: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item officeBookcase: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | the washing machine's door stays within its depth | view3d | 0.2 ms |
| ✅ | catalogue item toyTrain: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bookshelfWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item carBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item planter: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | an empty project builds an empty level group | view3d | 0.2 ms |
| ✅ | catalogue item carWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bookshelf: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personSkirt: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item wheelchair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item hourglass: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item carHatch: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item carSilver: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treePalm: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstand: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item tree: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item vanity: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item carSUV: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item carSUVWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treeBlossom: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personChild: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sideboardWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item poolTable: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treeAutumn: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item shrub: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treeSmall: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item washer: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item carHatchRed: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | length and weight | members | 0.2 ms |
| ✅ | part outlines seen from above | view3d | 0.2 ms |
| ✅ | catalogue item van: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item curtainCharcoal: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item curtainLinen: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item personSkin2: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bathBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item mannequin: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bonsai: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item vanityWalnut: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | modelExtent of an empty project is a default 10 m box | view3d | 0.2 ms |
| ✅ | catalogue item medCabinet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstandWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ovenTower: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pergola: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item vanityWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item kidsDesk: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cooktopIsland: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item nightstandWalnut: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cactus: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item heaterOil: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sectional: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item curtainVelvet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | materials: every colour key has a surface class | view3d | 0.2 ms |
| ✅ | catalogue item closetOpen: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | materialsFor filters by use | view3d | 0.2 ms |
| ✅ | catalogue item officeChairBlue: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item treeBirch: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints tile-mosaic (mosaic) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item executiveChair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pedestal: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item officeChairMesh: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cakeStand: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints pavers-clay (herringbone) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item bicycle: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints wallpaper-stripes (stripes) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item desktopPC: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sofaTerracotta: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item upperCabinetOak: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item grandPiano: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | fitParts squeezes parts into the item's box and leaves fitting parts alone | view3d | 0.2 ms |
| ✅ | catalogue item officeChairGrey: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item patioUmbrella: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item oilBottles: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ottoman: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item armchairMustard: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ottomanGrey: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item toilet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item motorbike: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bookends: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sectionalCream: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item dresser: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item fireplaceLinear: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item teddyBear: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item hedge: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bicycleBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counter: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item desk: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item consoleTableOak: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item readingTable: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints steel-red (plain) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item treeConiferTall: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item subwoofer: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item dresserWalnut: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item barStool: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item dresserWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counterOak: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pendantLamp: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item barStoolBlack: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bathtub: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counterCharcoal: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bollard: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item cafeTable: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item bbqGas: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item patioUmbrellaSage: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item rockingChair: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counterSage: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item fittingRoom: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item counterNavy: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item soapSet: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item ivPole: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item placeSetting: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item tableLamp: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item drumKit: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item islandWaterfall: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item airPurifier: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | every material used by the default wall types exists | view3d | 0.2 ms |
| ✅ | catalogue item speakersBookshelf: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item trampoline: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item shrubSmall: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item fireplace: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item monitorDual: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints tile-checker (checker) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item kettle: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item workstation: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sectionalGrey: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item executiveDesk: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item raisedBed: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sofaSage: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item tallboy: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pendantLampWhite: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | part bounds follow the part's turn | view3d | 0.2 ms |
| ✅ | catalogue item coffeeMugs: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | paintPattern paints wood-slats (slats) deterministically | view3d | 0.2 ms |
| ✅ | catalogue item wallLantern: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item pendantRattan: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item lantern: parts are valid and fit its box | view3d | 0.2 ms |
| ✅ | catalogue item sofa2: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lockers: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cashCounter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sinkDouble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floatingShelves: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item kettleBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantLampBrass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallClock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item shoppingCart: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item benchDesk4: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofa2Cream: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints concrete-block (subway) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item rockingHorse: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bidet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toyKitchen: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | areas: box = outer − inner, tube = annulus | members | 0.1 ms |
| ✅ | catalogue item jarSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item riceCooker: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item highChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item canopyBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sculpture: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item urinal: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item booth: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item microwave: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item macrame: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item nightstandFloat: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item vacuumStick: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints wood-cladding (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item router: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedSlatted: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item robotVacuum: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sinkCounterOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sinkCounter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item galleryWall: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item trackLight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | a curved alignment keeps its radius | structures | 0.1 ms |
| ✅ | catalogue item bowlDeco: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item firePit: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item standMixerRed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item roundTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item arcLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints stone (stone) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item potsPans: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugJute: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedBench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeOval: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item displayCase: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sideTableWood: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | surface physics reach the 3D materials | interior | 0.1 ms |
| ✅ | catalogue item wineBottle: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item speakerFloor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvUnit: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cubeShelf: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item treeConifer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item extinguisher: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item islandNavy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item waterCooler: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item roundMarble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item globe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item weightBench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item armchairVelvet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item singleBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item singleBedOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | furnitureDef and furnitureParts for known and unknown kinds | view3d | 0.1 ms |
| ✅ | catalogue item ceilingLight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item roundTableWhite: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeMachine: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeStorage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningOval: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item ovenBuiltIn: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item hammock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wingChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item armchairLinen: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints roof-tiles (rooftiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item mediaWall: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item headphones: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeCapsule: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints pavers (pavers) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item chair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallPlates: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item hospitalBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeTableWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | a kind change into or out of a lamp fixes the light data | lights | 0.1 ms |
| ✅ | catalogue item streetLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chaiseLongue: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item cuttingBoard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counterStool: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvUnitOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | makeFurniture fills in the catalogue defaults | view3d | 0.1 ms |
| ✅ | catalogue item shower: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugRound: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wingChairGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item island: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeTableBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeMarble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item printer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tableLampBrass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item vanityStool: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sideTableMarble: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mirrorRound: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item changingTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item acOutdoor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item venetianBlind: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item clothesRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedPlatform: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairShell: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item filing: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item loftBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sculptureBust: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coatStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item counterStoolWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item highChairRestaurant: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints stainless (plain) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item chairShellSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lockersSchool: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item smartSpeaker: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bunkBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fireExtinguisher: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | enough choice for interiors, structures and landscape | interior | 0.1 ms |
| ✅ | catalogue item teacherDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | near plane: half the free space in front of the camera, within its limits | members | 0.1 ms |
| ✅ | catalogue item officeDeskWhite: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item towelRadiator: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item scooter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantGlobe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningTable4: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairShellMustard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item buffetCounter: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item examTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairShellBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item officeDeskWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaModular: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item keyboardMouse: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantLinear: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pendantGlobeSmoke: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item upperCabinetNavy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item spotlight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sideTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item islandOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints roof-slate (rooftiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item tvCurved: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints wallpaper-green (stripes) deterministically | view3d | 0.1 ms |
| ✅ | brightness: more lumens, more light; a narrow spot is brighter on axis | lights | 0.1 ms |
| ✅ | catalogue item upperCabinet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairSlat: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairUpholstered: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rocks: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskOrganizer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints plywood (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item diningBench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rug: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toyBlocks: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallSwingArm: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item teepee: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mailboxes: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item multiGym: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item eggChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item laundryBasket: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item serverRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item studentSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningTable4Walnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairVelvet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item guitarStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item dentalChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item umbrellaCantilever: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item diningTable4White: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item flushDrum: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaLeatherTan: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item spinBike: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item daybed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item blender: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item recycleBins: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item printerHome: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | wallFinishes is null when nothing is finished | interior | 0.1 ms |
| ✅ | catalogue item bathCaddy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item projector: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairUpholsteredGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item phoneBooth: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairUpholsteredBlush: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item adirondack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorLamp: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints walnut (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item bikeRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item umbrellaStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item showerWalkIn: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item patientMonitor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wheelieBin: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item robotDock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvOLED: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item punchingBag: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorUplight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item checkout: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item deskClock: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugGrey: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints copper (seams) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item wardrobe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rangeHood: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item upperGlass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item beanBag: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item towelRing: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tvStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rower: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sofaLeather: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallArt: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toiletWallHung: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorLampBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item outdoorSofa: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridgeFrench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints zinc (seams) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item shoeRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item reception: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item camera: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item displayTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item swingSet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item loungeChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-green (subway) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints ash (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item radiator: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints oak (planks) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints travertine (stone) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item deskDual: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints brick-white (brick) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item recordPlayer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallSconce: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-white (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item basket: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item standingDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item meetingTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wardrobeWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item clubChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item sunLounger: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item trashCan: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item waitingChairs: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints brass (plain) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints teak-deck (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item fanTower: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints timber (planks) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item beanBagBlue: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item auditoriumSeats: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item treadmill: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-subway (subway) deterministically | view3d | 0.1 ms |
| ✅ | materialById and materialColor | view3d | 0.1 ms |
| ✅ | catalogue item whiteboard: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item blinds: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coffeeGlass: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item nestingTables: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toyStorage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fenceWood: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints concrete-precast (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item monitor: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugRoundNavy: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item laptop: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item violin: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mirrorArch: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item visitorChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item parkBench: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints roof-shingles (rooftiles) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints brick-dark (brick) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item cushionRound: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lectern: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item lDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wasteBasket: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item magazineRack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item clubChairBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item prepTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item studentChair: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item towelLadder: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item safe: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item downlight: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item picnicTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item studentDesk: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridgeSideBySide: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item waterPurifier: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item bedPlatformWalnut: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wardrobeWhite: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item doubleBed: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item loungeChairSage: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints bamboo (planks) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints limestone (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item bookStack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugPattern: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pantryOak: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chairCantilever: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mirror: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints aluminium (plain) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item tv65: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item electricalPanel: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item highTable: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item binders: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item paperTray: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridge: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item pantry: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | the default materials exist with the right use | view3d | 0.1 ms |
| ✅ | paintPattern paints acoustic-tile (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item fridgeSteel: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item tableTennis: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item dishwasher: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item dollhouse: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints glass (plain) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item acStand: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item clothesStyler: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-grey (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item pallet: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item loungeOffice: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item toiletRollHolder: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item atm: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item wallTV: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item chestFreezer: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints paint-teal (plain) deterministically | view3d | 0.1 ms |
| ✅ | paintPattern paints air (plain) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item diningTable6: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item coatHooks: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item glassDining: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | paintPattern paints tile-terracotta (tiles) deterministically | view3d | 0.1 ms |
| ✅ | catalogue item liftCar: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item dehumidifier: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item towelStack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item romanBlind: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item rugTerracotta: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item fridgeBlack: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item floorMirror: parts are valid and fit its box | view3d | 0.1 ms |
| ✅ | catalogue item mirrorCabinet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item diningTable8: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item gardenShed: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item plotter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item barCounter: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item gameConsole: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bench: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item coldRoom: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints steel-grey (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item benchBlack: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item breadBox: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item hairDryer: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item yogaMat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item frameStanding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item diningTable6Oak: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item acIndoor: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item toyChest: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item sphere: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints wood-panel (slats) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints slate-floor (tiles) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-white (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item crate: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item runner: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item rugShag: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints gypsum (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item cookbookStand: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item ball: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item hotTub: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item cashRegister: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item toaster: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item wardrobeSliding: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item towelStackGrey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item chalkboard: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item knifeBlock: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item parkingSpace: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item bathScale: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item mailbox: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item throwPillows: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item projectorScreen: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item cylinder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item toasterCream: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item cone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-sage (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item soundbar: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item deskPhone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints steel (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item bathMat: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item throwBlanket: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints water (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item pool: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item signExit: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item shredder: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item tablet: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-navy (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints roof-membrane (seams) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-greige (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item throwPillowsBlue: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-warm-grey (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item roomDivider: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-sky (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-terracotta (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item panelLight: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | catalogue item smartphone: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-black (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-blush (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-cream (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-forest (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints cable (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-charcoal (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-mustard (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item throwBlanketGrey: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints paint-olive (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints steel-white (plain) deterministically | view3d | 0.0 ms |
| ✅ | catalogue item box: parts are valid and fit its box | view3d | 0.0 ms |
| ✅ | paintPattern paints glass-tinted (plain) deterministically | view3d | 0.0 ms |
| ✅ | paintPattern paints glass-frosted (plain) deterministically | view3d | 0.0 ms |

</details>

<details><summary><b>Furniture library</b> · 가구 라이브러리 — 9 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | a model entry carries its model; placing it puts the model and a copy of the entry in the project | library | 3.5 ms |
| ✅ | one item: its size, colour and turn kept, centred | library | 1.5 ms |
| ✅ | older kinds are all still there with their sizes | library | 0.7 ms |
| ✅ | the thumbnail sprite has a picture of every item (npm run build:furniture) | library | 0.6 ms |
| ✅ | at least 500 items over every category, each with a Korean name | library | 0.6 ms |
| ✅ | library files: written, read back, merged without duplicates | library | 0.6 ms |
| ✅ | several items: kept relative to each other, placed as one group | library | 0.4 ms |
| ✅ | normalizeEntry drops broken entries and unknown kinds | library | 0.3 ms |
| ✅ | every category, and favourites / my library / recent, has its own icon | library | 0.1 ms |

</details>

<details><summary><b>SketchUp modelling</b> · 스케치업 모델링 — 77 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | IFC: a mesh mass (with a hole in a face) is a faceted Brep and comes back exactly | sketchup | 23 ms |
| ✅ | union, subtract (cutter goes), trim (cutter stays), intersect and split | sketchup | 11 ms |
| ✅ | DXF export of a project with mesh masses, components and terrain works | sketchup | 9.1 ms |
| ✅ | offset a loop into the top face, then pull it up and push it in (recess) and through (hole) | mesh | 8.3 ms |
| ✅ | a courtyard block: walls around the courtyard too, the slab has a hole | massing | 7.3 ms |
| ✅ | a box becomes walls, slabs, a room and windows per level, a door and a flat roof; the mass is gone | massing | 6.2 ms |
| ✅ | subtract a cylinder right through: a hole in the top face | mesh | 5.3 ms |
| ✅ | a 9.5 m box over 3 m levels takes three levels (new ones added); 10 m takes four | massing | 5.3 ms |
| ✅ | an old project (no SketchUp data) loads with every new list and the default style | sketchup | 4.8 ms |
| ✅ | a stepped mass (a podium and a tower) gives smaller floors higher up | massing | 3.8 ms |
| ✅ | terrain from contour lines in the plan, then smoove a hill | sketchup | 3.0 ms |
| ✅ | a mass with a mesh takes its footprint, base and height from the mesh; bad meshes are dropped | sketchup | 3.0 ms |
| ✅ | pushing a face of a mass in carves a recess; a line across a face splits it | sketchup | 2.9 ms |
| ✅ | intersect faces imprints the edges on both masses | sketchup | 2.7 ms |
| ✅ | union of overlapping boxes | mesh | 2.6 ms |
| ✅ | a rectangle drawn on top of a mass becomes a face that pulls up into a tower | sketchup | 2.4 ms |
| ✅ | everything survives save and load | sketchup | 2.3 ms |
| ✅ | split gives the three parts | mesh | 2.1 ms |
| ✅ | subtract with coplanar faces: a slot cut from the top | mesh | 2.1 ms |
| ✅ | an open line is kept as loose edges; follow me sweeps a face along them | sketchup | 2.0 ms |
| ✅ | components, materials, sections and notes are cleaned; one active section; lost definitions fall back | sketchup | 1.9 ms |
| ✅ | the footprint of an L-shaped mass is the L (not its hull) | mesh | 1.8 ms |
| ✅ | a terrain grid, its height and smoove | mesh | 1.7 ms |
| ✅ | editing the definition updates every instance; make unique splits one off | sketchup | 1.6 ms |
| ✅ | a prism mesh is closed, faces outwards and has the right volume; taper 0 is a pyramid | mesh | 1.5 ms |
| ✅ | normalizeMesh drops broken loops and indices; weld joins duplicate vertices | mesh | 1.5 ms |
| ✅ | solids on an upper level keep their height (meshes are stored from the level floor) | sketchup | 1.5 ms |
| ✅ | a box cut at mid-height gives its footprint | massing | 1.5 ms |
| ✅ | copy and paste carry the definition along to another drawing | sketchup | 1.4 ms |
| ✅ | terrain from contours lies between the contour heights | mesh | 1.4 ms |
| ✅ | materials of both solids survive a union | mesh | 1.3 ms |
| ✅ | a square profile along an L path: closed, volume = area × centre-line length | mesh | 1.3 ms |
| ✅ | lines drawn in 3D that close together work too; lines that do not close do not | massing | 1.3 ms |
| ✅ | explode, replace and the furniture definitions (same kind = same definition) | sketchup | 1.2 ms |
| ✅ | an open surface is refused by the solid tools | sketchup | 1.2 ms |
| ✅ | make a component from masses: one definition, one instance in their place | sketchup | 1.2 ms |
| ✅ | follow me around the top face of a mass (a cornice) | sketchup | 1.2 ms |
| ✅ | plan move / rotate / mirror / scale keep a mesh mass closed and in step with its footprint | sketchup | 1.2 ms |
| ✅ | a vertical path: a column from a circle | mesh | 1.2 ms |
| ✅ | a square with a square hole: the triangles cover exactly the ring | mesh | 1.1 ms |
| ✅ | a face drawn on the ground becomes as many levels as asked for | massing | 1.1 ms |
| ✅ | move lifts masses (and their meshes) and furniture | sketchup | 1.1 ms |
| ✅ | union of boxes sharing a face merges the coplanar faces (one box) | mesh | 1.1 ms |
| ✅ | union of identical boxes is the box | mesh | 1.0 ms |
| ✅ | intersect of overlapping boxes and of touching boxes | mesh | 0.9 ms |
| ✅ | imprint (intersect faces) adds edges but keeps the solid | mesh | 0.9 ms |
| ✅ | a line across a face splits it in two; pulling one half up keeps the solid closed | mesh | 0.9 ms |
| ✅ | rotate about a vertical axis (polar array), and tip a mass about a horizontal axis | sketchup | 0.9 ms |
| ✅ | a cutting component glues into a wall as an opening | sketchup | 0.9 ms |
| ✅ | subtract / intersect of disjoint solids | mesh | 0.9 ms |
| ✅ | around a closed rectangle (a cornice): closed ring without caps | mesh | 0.8 ms |
| ✅ | copy arrays: ×4 at the distance, /4 between | sketchup | 0.8 ms |
| ✅ | the top of a box stretches (same faces, new height) and cannot collapse | mesh | 0.8 ms |
| ✅ | pulling a drawn rectangle makes a closed box, either way | mesh | 0.8 ms |
| ✅ | a project's own materials are looked up before the library (and can edit a library material) | sketchup | 0.7 ms |
| ✅ | a rectangle drawn on the ground is a face; pulled up it is a closed box | sketchup | 0.6 ms |
| ✅ | scale masses about a point, non-uniformly, and furniture by its own axes | sketchup | 0.6 ms |
| ✅ | a rectangle drawn inside a face becomes its own face (and a hole in the old one) | mesh | 0.6 ms |
| ✅ | a profile with a hole sweeps into a hollow tube | mesh | 0.6 ms |
| ✅ | Ctrl push/pull always starts a new extrusion | mesh | 0.6 ms |
| ✅ | transform, mirror and rotate keep a closed mesh closed and outwards | mesh | 0.5 ms |
| ✅ | a loop inside another is its courtyard; slivers are dropped | massing | 0.5 ms |
| ✅ | collinear path points are skipped; a path that doubles back is refused | mesh | 0.5 ms |
| ✅ | existing levels are used with their own heights | massing | 0.5 ms |
| ✅ | isSolid knows open and inside-out meshes | mesh | 0.5 ms |
| ✅ | section planes: one active at a time, flip and move | sketchup | 0.4 ms |
| ✅ | guides, 3D dimensions and text are erased like any item | sketchup | 0.4 ms |
| ✅ | offset that would turn the loop inside out is refused | mesh | 0.4 ms |
| ✅ | a stretch is only offered when every touching face is perpendicular | mesh | 0.4 ms |
| ✅ | insideFace knows the outer loop and the holes | mesh | 0.4 ms |
| ✅ | a concave L and collinear points triangulate without gaps | mesh | 0.4 ms |
| ✅ | keep the mass: it stays, hidden | massing | 0.4 ms |
| ✅ | a side face of a box stretches too | mesh | 0.3 ms |
| ✅ | a vertical surface still has a usable plan footprint | mesh | 0.3 ms |
| ✅ | meshFromPolygons merges split triangles of one face back into one face | mesh | 0.2 ms |
| ✅ | the plane above or below the mass cuts nothing | massing | 0.2 ms |
| ✅ | segments chain into a closed loop whatever their direction | massing | 0.1 ms |

</details>

<details><summary><b>CAD exchange (DXF, DWG, SVG)</b> · CAD 교환 (DXF, DWG, SVG) — 102 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | Large drawings: object map pages and long objects | dwgwrite | 136 ms |
| ✅ | A binary DXF (2-byte group codes) imports exactly like its ASCII twin | dxfbin | 55 ms |
| ✅ | A project exported as DWG imports like its DXF export (R2000 DXF path) | dwgwrite | 41 ms |
| ✅ | Exporting a project and importing it back keeps every semantic layer | dxf | 19 ms |
| ✅ | AutoCAD 2000+ exports import back like the R12 file (same drawing, same texts) | dxfbin | 13 ms |
| ✅ | Lineweights, layer descriptions, true colour and text encoding by version | dxfbin | 11 ms |
| ✅ | Every supported entity type of a hand-written DXF survives the DWG | dwgwrite | 10 ms |
| ✅ | a small R2000 drawing imports exactly like the same drawing as DXF | dwg | 9.3 ms |
| ✅ | The R12 DXF export converts to the same DWG content | dwgwrite | 9.1 ms |
| ✅ | The file is structurally complete: CRCs, sentinels, object map, handle seed | dwgwrite | 7.3 ms |
| ✅ | R12 binary DXF with 1-byte group codes and the 255 escape for 1000+ | dxfbin | 6.9 ms |
| ✅ | DWG: RAY, XLINE, MLINE and a SAT 3DSOLID read like their DXF | cadextra | 6.3 ms |
| ✅ | AutoCAD 2000 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 5.5 ms |
| ✅ | A truncated binary DXF fails with a clear message; binary text without bytes is refused | dxfbin | 4.9 ms |
| ✅ | Binary round trip of an AutoCAD 2018 export (2-byte codes, handles and xdata) | dxfbin | 4.6 ms |
| ✅ | AutoCAD 2013 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 4.3 ms |
| ✅ | rays and construction lines are clipped to twice the drawing extents | cadextra | 4.3 ms |
| ✅ | AutoCAD 2007 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 4.0 ms |
| ✅ | AutoCAD 2010 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 3.9 ms |
| ✅ | AutoCAD 2004 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 3.3 ms |
| ✅ | AutoCAD 2018 export: a consistent drawing database (handles, owners, tables, objects) | dxfbin | 3.1 ms |
| ✅ | Imported wall outlines span the wall extents within one millimetre | dxf | 3.1 ms |
| ✅ | The exported file is R12 with header, tables, entities and EOF | dxf | 3.1 ms |
| ✅ | Korean room names survive the round trip as \U+ escapes in pure ASCII | dxf | 3.1 ms |
| ✅ | Texts come back at the same top-left anchor, size and rotation | dxf | 3.0 ms |
| ✅ | SVG viewBox and millimetre width scale user units to millimetres | dxf | 2.9 ms |
| ✅ | Furniture becomes one block per kind and size, inserted once per piece | dxfbin | 2.8 ms |
| ✅ | errors: not a DWG, too old, truncated | dwg | 2.7 ms |
| ✅ | The door swing arc ends at the open leaf tip and the closed position | dxf | 2.7 ms |
| ✅ | An embedded image becomes a tracing underlay placed by the SVG transforms | svgimport | 2.6 ms |
| ✅ | Percent signs and multi-line texts survive the round trip | dxf | 2.5 ms |
| ✅ | Arcs keep their orientation through export and import | dxf | 2.3 ms |
| ✅ | ACIS (SAT text): straight and elliptical edges become lines and arcs | cadextra | 2.2 ms |
| ✅ | Typed walls get one layer boundary line per inner layer and piece on A-WALL-PATT | dxf | 2.2 ms |
| ✅ | multileaders draw their leader, arrowhead, dogleg and text | cadextra | 2.2 ms |
| ✅ | bit reader: bit codes (B, BB, BS, BL, BD, DD, RC across byte edges, H, MS-free text) | dwg | 2.1 ms |
| ✅ | tables show their anonymous block, or a grid built from their rows and columns | cadextra | 2.1 ms |
| ✅ | Image headers: PNG, GIF, JPEG, BMP, WebP and SVG sizes; data URIs | svgimport | 2.0 ms |
| ✅ | layouts: listed in tab order; a layout shows its entities and the model through its viewports | cadextra | 2.0 ms |
| ✅ | Only the requested level is exported | dxf | 1.8 ms |
| ✅ | DXF versions on offer: R12 first, then AutoCAD 2000 … 2018 | dxfbin | 1.7 ms |
| ✅ | SVG paths with curves and arcs keep exact segment end points | dxf | 1.7 ms |
| ✅ | Images linked by a relative path are read next to the SVG (desktop) | svgimport | 1.6 ms |
| ✅ | Wall and opening phases select the existing and demolition layers | dxf | 1.5 ms |
| ✅ | unreadable objects are skipped and counted | dwg | 1.5 ms |
| ✅ | Project drawing layers keep their name, colour and visibility | dxf | 1.4 ms |
| ✅ | entities without a reader are drawn from their proxy graphics | cadextra | 1.3 ms |
| ✅ | Text on a path comes in straight along the start of the path | svgimport | 1.2 ms |
| ✅ | Text in the drawing code page: ANSI_1252 bytes, \U+XXXX for the rest | dwgwrite | 1.1 ms |
| ✅ | Mass models export their outline and height on A-MASS | dxf | 1.0 ms |
| ✅ | SVG rect, circle, ellipse and polygon become CAD geometry | dxf | 1.0 ms |
| ✅ | Structural grids export a centre line with labelled bubbles on every level | dxf | 1.0 ms |
| ✅ | wipeouts become their boundary, images their frame and an underlay request | cadextra | 0.9 ms |
| ✅ | A SPLINE is evaluated from its control points and knots | dxf | 0.9 ms |
| ✅ | R2007 LZ77: shuffled literal runs and back-references | dwg | 0.9 ms |
| ✅ | ACIS 1.x SAT (R13/R14: no header lines, numeric sense) and SAB binary read alike | cadextra | 0.9 ms |
| ✅ | Binary values: doubles, 16/32/64-bit integers, booleans, binary chunks and strings | dxfbin | 0.8 ms |
| ✅ | Mirrored, arrayed and nested INSERTs are expanded | dxf | 0.8 ms |
| ✅ | multi-line attributes (embedded MTEXT) keep their line breaks | cadextra | 0.8 ms |
| ✅ | SVG text and tspan lines become texts with size, anchor and colour | dxf | 0.8 ms |
| ✅ | external references are drawn from the given drawing on XREF\|layer layers, or reported | cadextra | 0.7 ms |
| ✅ | fitted splines: interpolation passes through every fit point | dwg | 0.7 ms |
| ✅ | <use> of a <symbol>, and clip paths ignored with a note | svgimport | 0.7 ms |
| ✅ | An INSERT rotated 90 degrees and scaled 2 maps block geometry through its base point | dxf | 0.7 ms |
| ✅ | SVG group transforms are inherited and composed | dxf | 0.7 ms |
| ✅ | multilines draw one line per element, offset along the miters | cadextra | 0.6 ms |
| ✅ | HATCH boundary paths become closed polylines | dxf | 0.6 ms |
| ✅ | The units option overrides the header and unitless drawings are guessed from their extent | dxf | 0.6 ms |
| ✅ | SVG stroke colours come from attributes, style and CSS classes | dxf | 0.6 ms |
| ✅ | DXF bytes in a legacy code page are decoded from $DWGCODEPAGE | dxf | 0.6 ms |
| ✅ | An extrusion direction of (0,0,-1) mirrors entities in x | dxf | 0.6 ms |
| ✅ | MTEXT formatting codes are stripped and paragraphs become new lines | dxf | 0.5 ms |
| ✅ | SVG hidden content, defs, use references and unsupported elements are handled | dxf | 0.5 ms |
| ✅ | Binary and non-DXF input is rejected with a clear error | dxf | 0.4 ms |
| ✅ | Layer colours, frozen and off layers and entity colours are imported | dxf | 0.4 ms |
| ✅ | An LWPOLYLINE bulge of 1 becomes a semicircle through the expected midpoint | dxf | 0.4 ms |
| ✅ | Binary DXF before 2007 decodes texts per $DWGCODEPAGE | dxfbin | 0.4 ms |
| ✅ | An old-style POLYLINE with VERTEX records and a bulge is read | dxf | 0.4 ms |
| ✅ | A full ELLIPSE is a closed polyline and a partial one starts and ends on its parameters | dxf | 0.4 ms |
| ✅ | R2004 LZ77: literal runs, short and long back-references, end marker | dwg | 0.4 ms |
| ✅ | checksums: CRC-16 (DWG seed) and CRC-32 match the standard check values | dwg | 0.3 ms |
| ✅ | Mirrored and unreadable images are noted | svgimport | 0.3 ms |
| ✅ | R2013+ ACIS data storage: blobs are found by entity handle | cadextra | 0.3 ms |
| ✅ | SVG arc flags may be written without separators | dxf | 0.3 ms |
| ✅ | bit reader: BLL, object type (OT) and Unicode text (TU) | dwg | 0.3 ms |
| ✅ | A HATCH arc edge is flattened along the right side | dxf | 0.3 ms |
| ✅ | version detection | dwg | 0.3 ms |
| ✅ | A DIMENSION draws its anonymous block | dxf | 0.3 ms |
| ✅ | clipping keeps the parts of a polyline inside a rectangle | cadextra | 0.2 ms |
| ✅ | $INSUNITS 5 scales centimetres to millimetres | dxf | 0.2 ms |
| ✅ | A closed LWPOLYLINE keeps its closed flag without repeating the first vertex | dxf | 0.2 ms |
| ✅ | Paper space entities are skipped | dxf | 0.2 ms |
| ✅ | Unknown entities are counted with one warning per type | dxf | 0.2 ms |
| ✅ | MTEXT attachment points place the text block | dxf | 0.2 ms |
| ✅ | SOLID and 3DFACE become outlines and POINT is only counted | dxf | 0.2 ms |
| ✅ | TEXT baseline insertion becomes the top anchor and DXF rotation is negated | dxf | 0.2 ms |
| ✅ | A DXF ARC maps to a1 = -start, a2 = -end, ccw = true and keeps its points | dxf | 0.2 ms |
| ✅ | An arc that wraps through 0 degrees keeps its short sweep | dxf | 0.1 ms |
| ⏭️ | corpus: every DWG reads | dwg | 0.1 ms |
| ⏭️ | corpus: R2000 file header and object map CRCs are valid | dwg | 0.0 ms |
| ⏭️ | corpus: layouts of a DWG read like those of its DXF | cadextra | 0.0 ms |
| ⏭️ | corpus: multileaders, tables, wipeouts, rays, multilines and ACIS solids in every release | cadextra | 0.0 ms |

</details>

<details><summary><b>Printing & PDF</b> · 인쇄·PDF — 6 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | PDF structure: header, xref offsets, trailer, page tree and page sizes | pdf | 28 ms |
| ✅ | A real plan sheet (SvgContext + drawPlan) becomes one compressed vector page | pdf | 19 ms |
| ✅ | Images: JPEG as DCTDecode, PNG through the predictor, others left out with a note | pdf | 1.8 ms |
| ✅ | Texts: Helvetica for Latin, the Korean CID font for Hangul, anchors and baselines | pdf | 1.4 ms |
| ✅ | Drawing operators: page CTM, clip, paths, dashes, opacity, fills and strokes | pdf | 0.8 ms |
| ✅ | Empty input is refused | pdf | 0.5 ms |

</details>

<details><summary><b>BIM exchange (IFC, ifcXML)</b> · BIM 교환 (IFC, ifcXML) — 25 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every sample survives IFC → ifcXML → IFC with the same elements (both schemas) | ifcxml | 231 ms |
| ✅ | IFC4: our IFC export as ifcXML reads back to the same entity graph and project | ifcxml | 163 ms |
| ✅ | .ifczip holding .ifc or .ifcxml is deflated and reads like the plain file | ifcxml | 95 ms |
| ✅ | IFC2X3: our IFC export as ifcXML reads back to the same entity graph and project | ifcxml | 74 ms |
| ✅ | the exported IFC4 file is valid STEP with resolvable references and unique GlobalIds | ifc | 31 ms |
| ✅ | a project survives a round trip through IFC4 | ifc | 22 ms |
| ✅ | IFC4 ifcXML: attributes, xsi:type references and nested inverse relationships | ifcxml | 17 ms |
| ✅ | special characters survive in names and property values | ifcxml | 14 ms |
| ✅ | attribute order and inheritance come from the EXPRESS schemas | ifcxml | 12 ms |
| ✅ | IFC4 proxies from other programs: plain extrusions become solids, other bodies are skipped | ifc | 10 ms |
| ✅ | the exported IFC2X3 file is valid STEP with resolvable references and unique GlobalIds | ifc | 10 ms |
| ✅ | IFC2X3 proxies from other programs: plain extrusions become solids, other bodies are skipped | ifc | 9.4 ms |
| ✅ | a project survives a round trip through IFC2X3 | ifc | 6.5 ms |
| ✅ | the IFC4 export carries the BIM data in standard IFC entities | ifc | 6.0 ms |
| ✅ | IFC4: the owner pointers the XSD leaves out go through inverse elements | ifcxml | 5.5 ms |
| ✅ | IFC2x3 ifcXML: iso_10303_28 / uos, element values, wrapper lists, metres | ifcxml | 5.1 ms |
| ✅ | UTF-16 with a byte order mark, and a file that is not ifcXML | ifcxml | 4.8 ms |
| ✅ | the IFC2X3 export carries the BIM data in standard IFC entities | ifc | 4.5 ms |
| ✅ | IFC4 mass solids are an extrusion or a closed faceted Brep, and groups are IfcGroups | ifc | 4.2 ms |
| ✅ | IFC2X3 mass solids are an extrusion or a closed faceted Brep, and groups are IfcGroups | ifc | 3.5 ms |
| ✅ | an old project without BIM data still exports to IFC4 and reads back untyped | ifc | 3.4 ms |
| ✅ | an old project without BIM data still exports to IFC2X3 and reads back untyped | ifc | 2.2 ms |
| ✅ | .ifcxml and ifcXML in a .xml are recognised | ifcxml | 1.7 ms |
| ✅ | a hand-written IFC2X3 file in metres with a rotated wall placement imports in millimetres | ifc | 1.3 ms |
| ✅ | STEP strings decode '' escapes, backslashes and \X2\ Unicode | ifc | 0.3 ms |

</details>

<details><summary><b>Other BIM (SH3D, gbXML)</b> · 다른 BIM (SH3D, gbXML) — 114 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | 37-u-shaped-apartments.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.71 s |
| ✅ | 29-hotel.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 1.33 s |
| ✅ | 34-general-hospital.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 697 ms |
| ✅ | 32-residential-complex.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 653 ms |
| ✅ | 35-courtyard-school.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 541 ms |
| ✅ | 11-mixed-use.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 247 ms |
| ✅ | 10-office-tower.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 203 ms |
| ✅ | 33-atrium-office.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 179 ms |
| ✅ | 30-university-library.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 141 ms |
| ✅ | 36-terraced-office.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 129 ms |
| ✅ | re-imported, the home comes back | sh3d | 101 ms |
| ✅ | model furniture is written from its GLB: geometry, colours and textures | sh3d | 75 ms |
| ✅ | the project is sound: normalized, no model-check errors, builds in 3D | interop | 69 ms |
| ✅ | 15-sketchup-complex.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 59 ms |
| ✅ | 12-hospital.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 51 ms |
| ✅ | 13-school.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 40 ms |
| ✅ | 08-apartment-block.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 38 ms |
| ✅ | 17-townhouse.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 33 ms |
| ✅ | 19-duplex.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 27 ms |
| ✅ | 38-museum.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 26 ms |
| ✅ | is unzipped and read like .ifc | interop | 23 ms |
| ✅ | 31-sports-centre.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 19 ms |
| ✅ | 18-modern-farmhouse.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 18 ms |
| ✅ | 16-modern-villa.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 15 ms |
| ✅ | 03-two-storey-house.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 15 ms |
| ✅ | 14-courtyard-house.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 13 ms |
| ✅ | reads back through our importer: levels, walls, openings, rooms, the gable roof, north | gbxml | 12 ms |
| ✅ | an .sh3d with only the serialized Home imports like a Home.xml one | sh3d | 12 ms |
| ✅ | 23-bridges.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 9.7 ms |
| ✅ | catalog shapes on request: roofs become roofs of ours, no assets | sh3d | 9.6 ms |
| ✅ | 01-studio.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 8.1 ms |
| ✅ | a ZIP with Home.xml and an OBJ model folder per shape | sh3d | 7.7 ms |
| ✅ | 02-two-bedroom.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 7.6 ms |
| ✅ | demolished elements are left out; mass models become shading | gbxml | 7.5 ms |
| ✅ | 21-interior-design.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 7.4 ms |
| ✅ | 09-cad-tracing.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 6.9 ms |
| ✅ | an .sh3d without Home.xml (saved before 5.3) gets a clear error | interop | 6.8 ms |
| ✅ | 20-compact-house.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 6.1 ms |
| ✅ | 06-renovation-bim.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 5.8 ms |
| ✅ | faces that are no gable, hip or shed become a mass solid of those faces | gbxml | 5.8 ms |
| ✅ | reads deflated and stored entries, UTF-8 names | interop | 5.5 ms |
| ✅ | 40-penthouse.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 5.5 ms |
| ✅ | 04-small-office.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 5.1 ms |
| ✅ | 05-wooden-cabin.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 5.0 ms |
| ✅ | 39-cafe-bistro.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 4.9 ms |
| ✅ | a bare Home.xml reads the same; .xml files are told apart by their root | interop | 4.5 ms |
| ✅ | 22-lattice-towers.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 4.3 ms |
| ✅ | gbXML 6.01 on request | gbxml | 4.0 ms |
| ✅ | the project normalizes, survives save / load and builds in 3D | sh3d | 4.0 ms |
| ✅ | 07-massing-study.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.9 ms |
| ✅ | the project is sound: normalized, no model-check errors, builds in 3D | interop | 3.8 ms |
| ✅ | 28-stress-ribbon-footbridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 3.1 ms |
| ✅ | length units: feet | interop | 2.8 ms |
| ✅ | 24-deck-arch-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 2.8 ms |
| ✅ | a Sweet Home 3D Home object maps onto the Home.xml element tree | sh3d | 2.6 ms |
| ✅ | UTF-16 files (as Revit writes them) and sniffing .xml | interop | 2.6 ms |
| ✅ | 27-extradosed-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 2.5 ms |
| ✅ | 25-haunched-girder-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 2.4 ms |
| ✅ | 26-harp-cable-stayed-bridge.myarch: walls, openings, rooms and levels survive the round trip | gbxml | 2.3 ms |
| ✅ | strings, boxed numbers, collections, arrays, enums, back references, reset | sh3d | 2.1 ms |
| ✅ | no storeys: levels from the floor heights; not gbXML is refused | interop | 2.0 ms |
| ✅ | a floor in pieces is joined, gable walls stop at the eaves, a survey datum is moved to 0 | interop | 1.7 ms |
| ✅ | header, site, building, storeys and spaces | gbxml | 1.4 ms |
| ✅ | every polygon is counter-clockwise from outside its first space | gbxml | 1.3 ms |
| ✅ | pieces with a packed model become model furniture of their size; shared models are one asset | sh3d | 1.3 ms |
| ✅ | a gbXML file: one roof split per space, a mansard-like roof kept as faces, flat pieces joined | gbxml | 1.3 ms |
| ✅ | loadModelFile: pre-rotation and fitting to a size | sh3d | 1.2 ms |
| ✅ | recolorModel paints a whole model or one material, leaving the shared asset alone | sh3d | 1.1 ms |
| ✅ | hip at 0° | gbxml | 1.0 ms |
| ✅ | shed at 0° | gbxml | 0.9 ms |
| ✅ | furniture names and catalog ids (several languages) | interop | 0.9 ms |
| ✅ | gable at 0° | gbxml | 0.7 ms |
| ✅ | Home.xml follows the DTD: element order, attribute lists, required attributes, ids | sh3d | 0.7 ms |
| ✅ | a home without levels is one level at the home's wall height | interop | 0.6 ms |
| ✅ | constructions, layers and materials from the wall types | gbxml | 0.5 ms |
| ✅ | separate roofs that only meet at their eaves stay separate | gbxml | 0.5 ms |
| ✅ | surface types and the spaces on either side | gbxml | 0.5 ms |
| ✅ | what makes pieces share a model, and their colour overrides | sh3d | 0.5 ms |
| ✅ | overlapping walls are merged or shortened, stacked openings joined | interop | 0.4 ms |
| ✅ | single-file model entries are recognised by their first bytes | sh3d | 0.4 ms |
| ✅ | furniture matched to the catalog by name in any language, else a box | interop | 0.4 ms |
| ✅ | closed shells face outwards (positive volume by the divergence theorem) | gbxml | 0.4 ms |
| ✅ | modified UTF-8 and errors | sh3d | 0.4 ms |
| ✅ | rejects data that is not a ZIP | interop | 0.4 ms |
| ✅ | wall and floor textures become project materials with their image; colours stay colours | sh3d | 0.4 ms |
| ✅ | gable at 90° | gbxml | 0.4 ms |
| ✅ | dimensions, labels, polylines and the compass | interop | 0.4 ms |
| ✅ | levels: elevations ×10, floor-to-floor heights, layers at one elevation merged | interop | 0.4 ms |
| ✅ | Java 3D default materials fill in OBJ files without an MTL | sh3d | 0.3 ms |
| ✅ | the model rotation is baked: a turned wedge gets its own asset with a turned outline | sh3d | 0.3 ms |
| ✅ | openings: windows, doors (also from RectangularGeometry) and air openings | interop | 0.3 ms |
| ✅ | shed at 90° | gbxml | 0.3 ms |
| ✅ | storeys become levels with heights up to the next one | interop | 0.3 ms |
| ✅ | gable at 30° | gbxml | 0.3 ms |
| ✅ | doors and windows are openings in their wall surface, in its plane | gbxml | 0.3 ms |
| ✅ | doors and windows become openings in their walls | interop | 0.3 ms |
| ✅ | rooms with names and floor materials | interop | 0.3 ms |
| ✅ | gable at 217° | gbxml | 0.3 ms |
| ✅ | walls in millimetres; full-height walls follow the level; sloping and round walls | interop | 0.3 ms |
| ✅ | vertical wall surfaces become walls; both faces of one wall merge; a two-storey wall splits | interop | 0.3 ms |
| ✅ | shed at 217° | gbxml | 0.2 ms |
| ✅ | hip at 30° | gbxml | 0.2 ms |
| ✅ | hip at 90° | gbxml | 0.2 ms |
| ✅ | hip at 217° | gbxml | 0.2 ms |
| ✅ | shed at 30° | gbxml | 0.2 ms |
| ✅ | arcPoints follows the Sweet Home 3D bulge direction | interop | 0.2 ms |
| ✅ | staircases become stairs | interop | 0.2 ms |
| ✅ | colours | interop | 0.2 ms |
| ✅ | wall textures map to our materials by name | sh3d | 0.2 ms |
| ✅ | roofs are models on their level | sh3d | 0.2 ms |
| ✅ | spaces become rooms (shell bottom, planar geometry, storey by height) | interop | 0.1 ms |
| ✅ | units and angles: centimetres and radians; walls joined at their corners | sh3d | 0.1 ms |
| ✅ | an empty model (a light source) is skipped; a missing one falls back to a catalog shape | sh3d | 0.1 ms |
| ✅ | a flat roof surface becomes a flat roof on the storey below it; floors and shading are not elements | interop | 0.1 ms |

</details>

<details><summary><b>3D exchange</b> · 3D 교환 — 27 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | 3dm model: units, layers, colours, blocks; hidden layer left out | rhino3dm | 87 ms |
| ✅ | 3dm through loadModelFile: furniture asset in millimetres from the file's centimetres | rhino3dm | 66 ms |
| ✅ | import GLB / glTF round trip through GLTFExporter (glb: true) | export3d | 43 ms |
| ✅ | import VRML: backdrop dropped, Phong replaced, metres guessed | export3d | 38 ms |
| ✅ | COLLADA: three's ColladaLoader reads the export back (needs xmldom) | export3d | 36 ms |
| ✅ | 3dm plan drawing: top view on CAD layers (closed outlines, circle, blocks, point, text) | rhino3dm | 27 ms |
| ✅ | 3MF: three's ThreeMFLoader reads the export back; import restores Y-up metres (needs xmldom) | export3d | 18 ms |
| ✅ | 3dm: curved faces without render mesh are tessellated on the surface | rhino3dm | 11 ms |
| ✅ | import OBJ: centimetres guessed, normalised, outline, MTL applied | export3d | 10.0 ms |
| ✅ | OBJ/MTL: counts, world positions, materials | export3d | 5.9 ms |
| ✅ | base64 helpers | export3d | 5.1 ms |
| ✅ | import STL (ASCII): Z-up converted to Y-up, millimetres guessed | export3d | 4.7 ms |
| ✅ | import PLY (ASCII) | export3d | 4.7 ms |
| ✅ | COLLADA: well-formed 1.4.1 with geometry, materials and world positions | export3d | 4.4 ms |
| ✅ | 3dm plan: arcs keep their direction (Rhino counter-clockwise → canvas anticlockwise in plan y-down) | rhino3dm | 4.2 ms |
| ✅ | rhino3dm is vendored: pinned version, MIT licence, module + wasm | rhino3dm | 3.7 ms |
| ✅ | 3MF: package parts, millimetres, Z up, merged vertices, outward triangles | export3d | 3.1 ms |
| ✅ | import OBJ: missing MTL warns, unit override, Z-up override | export3d | 2.9 ms |
| ✅ | import: errors | export3d | 1.4 ms |
| ✅ | import STL (binary) and up-axis override | export3d | 1.1 ms |
| ✅ | 3MF: mirrored mesh stays outward, other units | export3d | 1.1 ms |
| ✅ | not a 3dm file is refused | rhino3dm | 1.0 ms |
| ✅ | OBJ: scale 1000 writes millimetres | export3d | 1.0 ms |
| ✅ | OBJ: non-indexed geometry and mirrored transforms | export3d | 0.9 ms |
| ✅ | COLLADA: scale declares the matching unit | export3d | 0.6 ms |
| ⏭️ | 3dm corpus (MYARCH_3DM_CORPUS) reads in both modes | rhino3dm | 0.3 ms |
| ✅ | polyline joining helpers | rhino3dm | 0.3 ms |

</details>

<details><summary><b>Samples</b> · 예제 — 363 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every element kind the samples build in 3D has a depth class | samples | 1.04 s |
| ✅ | the 3D model builds with every element tagged | samples | 220 ms |
| ✅ | the model check finds no errors and no warnings | samples | 191 ms |
| ✅ | the 3D model builds with every element tagged | samples | 142 ms |
| ✅ | the 3D model builds with every element tagged | samples | 125 ms |
| ✅ | the model check finds no errors and no warnings | samples | 120 ms |
| ✅ | the 3D model builds with every element tagged | samples | 118 ms |
| ✅ | the 3D model builds with every element tagged | samples | 114 ms |
| ✅ | the 3D model builds with every element tagged | samples | 109 ms |
| ✅ | the 3D model builds with every element tagged | samples | 103 ms |
| ✅ | the 3D model builds with every element tagged | samples | 93 ms |
| ✅ | the 3D model builds with every element tagged | samples | 91 ms |
| ✅ | the model check finds no errors and no warnings | samples | 82 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 65 ms |
| ✅ | the 3D model builds with every element tagged | samples | 60 ms |
| ✅ | the model check finds no errors and no warnings | samples | 54 ms |
| ✅ | the model check finds no errors and no warnings | samples | 54 ms |
| ✅ | the model check finds no errors and no warnings | samples | 50 ms |
| ✅ | the 3D model builds with every element tagged | samples | 49 ms |
| ✅ | the 3D model builds with every element tagged | samples | 46 ms |
| ✅ | the 3D model builds with every element tagged | samples | 45 ms |
| ✅ | the 3D model builds with every element tagged | samples | 43 ms |
| ✅ | the 3D model builds with every element tagged | samples | 42 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 42 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 40 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 37 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 37 ms |
| ✅ | the 3D model builds with every element tagged | samples | 36 ms |
| ✅ | the 3D model builds with every element tagged | samples | 33 ms |
| ✅ | the 3D model builds with every element tagged | samples | 33 ms |
| ✅ | the model check finds no errors and no warnings | samples | 30 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 28 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 28 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 27 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 23 ms |
| ✅ | the model check finds no errors and no warnings | samples | 23 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 22 ms |
| ✅ | levelSummary is consistent with the project | samples | 22 ms |
| ✅ | levelSummary is consistent with the project | samples | 22 ms |
| ✅ | the 3D model builds with every element tagged | samples | 21 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 20 ms |
| ✅ | the 3D model builds with every element tagged | samples | 19 ms |
| ✅ | the 3D model builds with every element tagged | samples | 19 ms |
| ✅ | the model check finds no errors and no warnings | samples | 19 ms |
| ✅ | the 3D model builds with every element tagged | samples | 18 ms |
| ✅ | the 3D model builds with every element tagged | samples | 17 ms |
| ✅ | the 3D model builds with every element tagged | samples | 15 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 14 ms |
| ✅ | the 3D model builds with every element tagged | samples | 13 ms |
| ✅ | the 3D model builds with every element tagged | samples | 13 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 13 ms |
| ✅ | the model check finds no errors and no warnings | samples | 13 ms |
| ✅ | the 3D model builds with every element tagged | samples | 12 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 11 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 11 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 11 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 10 ms |
| ✅ | the model check finds no errors and no warnings | samples | 10 ms |
| ✅ | the 3D model builds with every element tagged | samples | 9.6 ms |
| ✅ | levelSummary is consistent with the project | samples | 9.6 ms |
| ✅ | the 3D model builds with every element tagged | samples | 9.4 ms |
| ✅ | levelSummary is consistent with the project | samples | 9.3 ms |
| ✅ | the 3D model builds with every element tagged | samples | 8.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 8.1 ms |
| ✅ | the 3D model builds with every element tagged | samples | 8.1 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 8.0 ms |
| ✅ | openings have unique tags | samples | 7.8 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 7.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 6.2 ms |
| ✅ | the 3D model builds with every element tagged | samples | 6.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 6.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 6.0 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 5.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 5.8 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 5.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 5.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 5.4 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 5.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 5.2 ms |
| ✅ | the 3D model builds with every element tagged | samples | 5.1 ms |
| ✅ | openings have unique tags | samples | 4.9 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 4.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 4.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 4.5 ms |
| ✅ | the 3D model builds with every element tagged | samples | 4.3 ms |
| ✅ | openings have unique tags | samples | 4.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 4.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 4.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 4.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 4.2 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 4.2 ms |
| ✅ | the 3D model builds with every element tagged | samples | 4.1 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 4.0 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 3.8 ms |
| ✅ | the 3D model builds with every element tagged | samples | 3.8 ms |
| ✅ | the 3D model builds with every element tagged | samples | 3.7 ms |
| ✅ | the model check finds no errors and no warnings | samples | 3.6 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 3.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.4 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 3.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 3.3 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 3.2 ms |
| ✅ | the 3D model builds with every element tagged | samples | 3.1 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 3.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 3.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 3.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 2.9 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.9 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.8 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.8 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.7 ms |
| ✅ | levelSummary is consistent with the project | samples | 2.6 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.6 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.6 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 2.4 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 2.3 ms |
| ✅ | the 3D model builds with every element tagged | samples | 2.2 ms |
| ✅ | openings have unique tags | samples | 2.2 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 2.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 2.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 2.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 2.0 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.9 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.9 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 1.9 ms |
| ✅ | openings have unique tags | samples | 1.9 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.8 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.8 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.7 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.7 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.6 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.6 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.6 ms |
| ✅ | index.json lists unique, existing sample files with titles in two languages | samples | 1.5 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.5 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 1.5 ms |
| ✅ | parses as a MyArchitecture project and round-trips | samples | 1.4 ms |
| ✅ | openings have unique tags | samples | 1.4 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.4 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 1.4 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.4 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.3 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.3 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.1 ms |
| ✅ | openings have unique tags | samples | 1.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 1.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.0 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.0 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 1.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 1.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 1.0 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 1.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.9 ms |
| ✅ | openings have unique tags | samples | 0.9 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.9 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.8 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.8 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.8 ms |
| ✅ | every .myarch file in sample/ is listed in the index | samples | 0.8 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.8 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.7 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.7 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.7 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.7 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.6 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.6 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.6 ms |
| ✅ | the 3D model builds with every element tagged | samples | 0.6 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.6 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.6 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.6 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.6 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.5 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.5 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.5 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.5 ms |
| ✅ | openings have unique tags | samples | 0.5 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.5 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.4 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.4 ms |
| ✅ | openings have unique tags | samples | 0.4 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.4 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.4 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.4 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.4 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.4 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.4 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.4 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.4 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.3 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | openings have unique tags | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.3 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.3 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | openings have unique tags | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.2 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.2 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.2 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.2 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | walls make closed outlines and the plan has bounds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | references are consistent: levels, walls, wall types, materials, furniture kinds | samples | 0.1 ms |
| ✅ | openings have unique tags | samples | 0.1 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.1 ms |
| ✅ | the cost estimate is the sum of its lines (positive when there are walls) | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | the model check finds no errors and no warnings | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | levelSummary is consistent with the project | samples | 0.0 ms |
| ✅ | has a building: walls or mass models, and named rooms when it has rooms | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |
| ✅ | openings have unique tags | samples | 0.0 ms |

</details>

<details><summary><b>User interface (icons, widgets)</b> · 사용자 인터페이스 (아이콘, 위젯) — 3 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | common button labels get a fitting icon in both languages | autoicon | 4.6 ms |
| ✅ | tabs get their own icon, also when two keys share a Korean word | autoicon | 1.7 ms |
| ✅ | every icon the rules can pick exists | autoicon | 1.2 ms |

</details>

<details><summary><b>Start page & tutorial</b> · 시작 화면·튜토리얼 — 19 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every background kind draws on a canvas (and none hides its own drawing method) | startlayout | 250 ms |
| ✅ | presets: storeys stacked at their heights, ground floor current, walls as tall as a storey | templates | 7.8 ms |
| ✅ | presets: save and open again unchanged; an unknown preset is the plain blank project | templates | 4.0 ms |
| ✅ | default layout: full-width cards in reading order, quick start beside recent, themes beside the background | startlayout | 2.4 ms |
| ✅ | presets: the structural grid has a line per bay edge, numbered across and lettered down | templates | 1.9 ms |
| ✅ | 새로 시작: at least six groups, every group with the same number of tiles (eight or more) | templates | 1.4 ms |
| ✅ | 새로 시작: every sample tile names a sample in sample/index.json, and every sample has a tile | templates | 1.3 ms |
| ✅ | 새로 시작: every command tile is a registered command | templates | 0.8 ms |
| ✅ | the samples grid keeps every row full | startlayout | 0.5 ms |
| ✅ | 새로 시작: the translatable strings list covers every title, name and line | templates | 0.4 ms |
| ✅ | auto arrange packs every card without overlaps; saved layouts round-trip | startlayout | 0.4 ms |
| ✅ | 새로 시작: group ids and tiles are unique, every tile has a known kind, icon, name and line | templates | 0.4 ms |
| ✅ | 새로 시작: every preset tile is a preset of the same name, and every preset has a tile | templates | 0.3 ms |
| ✅ | a dropped card keeps its cell and the ones it covers move down without overlapping | startlayout | 0.3 ms |
| ✅ | Alt+↑ / Alt+↓ swap with the neighbour above / below | startlayout | 0.2 ms |
| ✅ | pixel boxes, cells and spans agree with each other | startlayout | 0.2 ms |
| ✅ | a card added in a later version goes below the saved ones | startlayout | 0.2 ms |
| ✅ | compaction floats cards up in their own columns | startlayout | 0.2 ms |
| ✅ | resizing a card wider pushes its neighbour down; fit is turned off | startlayout | 0.1 ms |

</details>

<details><summary><b>Localization</b> · 다국어 — 5 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | every UI key has a Korean translation | i18n | 69 ms |
| ✅ | translations keep the same placeholders | i18n | 2.8 ms |
| ✅ | translations keep HTML tags | i18n | 2.7 ms |
| ✅ | translations are non-empty strings | i18n | 1.2 ms |
| ✅ | menu and undo/redo labels are translated | i18n | 0.2 ms |

</details>

<details><summary><b>Desktop shell (Rust)</b> · 데스크톱 셸 (Rust) — 19 tests, 0 failed</summary>

| | Test | File | Time |
|:-:|:--|:--|--:|
| ✅ | print › copies are kept in range | rust | 39 ms |
| ✅ | print › the default printer is marked | rust | 39 ms |
| ✅ | only web and mail links leave for the browser | rust | 39 ms |
| ✅ | dialog labels carry their depth | rust | 39 ms |
| ✅ | files › sample names stay in the sample folder | rust | 39 ms |
| ✅ | print › page size reads both shapes | rust | 39 ms |
| ✅ | print › page sizes follow the page | rust | 39 ms |
| ✅ | print › paper sizes are portrait inches | rust | 39 ms |
| ✅ | app urls stay inside | rust | 39 ms |
| ✅ | files › payload decodes text and base64 | rust | 39 ms |
| ✅ | hex colours parse | rust | 39 ms |
| ✅ | files › sample index takes both shapes | rust | 39 ms |
| ✅ | titles drop the patch zero | rust | 39 ms |
| ✅ | platform names match node | rust | 39 ms |
| ✅ | files › read text survives invalid utf8 | rust | 39 ms |
| ✅ | files › binary reads come back as base64 | rust | 39 ms |
| ✅ | files › only existing supported files open from the command line | rust | 39 ms |
| ✅ | files › atomic write replaces the file | rust | 39 ms |
| ✅ | settings read survives a broken file | rust | 39 ms |

</details>
