# MyCAD 구조

## 층

```
┌ src/app.js (주 창) ── src/popup.js (팝업 창: 설정·인쇄·부품·솔리드·대응표 …)
│     │ commands {id → icon, label, key, enabled, checked, run}  ← 메뉴·툴바·패널·단축키가 모두 이것을 씀
├ src/view/     renderer.js (2D 캔버스) · tools.js (그리기 도구) · view3d.js (three.js, 지연 로드)
├ src/domain/   플랫폼 무관 · DOM 없음 · Node 테스트 대상
└ src/platform/ native.js (Tauri invoke / 웹 대체) · popups.js (OS 창 / iframe)
src-tauri/      Rust: 파일 읽기/쓰기(진행률) · 팝업 창 · 창 위치 · 글꼴 · 클립보드 · 패닉 기록
```

## 도면 모델

- 도면 = `{ title, layers, entities, sheet, grid, … }` JSON (.mcad). 객체는 평범한 데이터이고 `normalizeEntity` 가 파일에서 읽은 값을 고칩니다.
- 2D 객체는 모두 *primitives*(line · poly · circle · arc · text · fill)로 펼쳐져 그리기, 선택, 스냅, SVG/DXF, 인쇄, STL 이 이것만 다룹니다.
- 실행 취소는 도면 스냅샷(`history.js`), 모든 변경은 `change(label, mutate)` 한 곳을 지납니다.

## 3D 솔리드 (`solids.js`)

- 객체 `type: 'solid'`: `kind` + `params` + `shape` + 배치(x, y, z, rx → ry → rz, scale, flip).
  - 프리미티브 10종 (FreeCAD Part 와 같은 매개변수 이름·원점: Box 는 모서리, Cylinder/Cone 은 밑면 중심, Torus 는 중심…)
  - `pad · revolution · loft · sweep` 은 2D 윤곽에서 (`featureFrom`), `boolean` 은 `{ op, parts }` 트리, `mesh` 는 가져온 삼각형.
- `solidMesh(entity)` → 바깥을 향한 닫힌 삼각형. 객체별 캐시, 불리언은 트리 문자열 키 LRU 캐시(옮겨도 다시 계산하지 않음).
- 2D 도면에는 위에서 본 외곽(`solidFootprint`)이 보여 선택·스냅·인쇄가 그대로 됩니다.
- 측정: 정확한 공식(`exactVolume`)이 있으면 그 값, 없으면 메시 부피 · 겉넓이.

## CSG (`csg.js` + `meshtools.js`)

1. BSP 트리 불리언 (csg.js 방식). 쪼갠 다각형마다 평면을 따로 복사 — 공유하면 뒤집기가 형제에 번져 메시가 열립니다.
2. `conform` — T-접점(이웃 모서리 위 꼭짓점)을 넣어 닫힌 껍질로.
3. `collapseShortEdges` — 0.1 µm 보다 짧은 모서리 합치기.
4. `simplifyMesh` — 같은 평면 영역을 경계에서 다시 삼각분할 (조각 수 1/8 수준, 실패한 영역만 원래대로).

## 투상 · 단면 (`solids.js`, `views.js`)

- `projectEdges`: 날카로운 모서리 + 매끄러운 윤곽선(보간 법선이 시선과 직각이 되는 곳 → 곡면도 매끄러운 외곽) + 숨은선 판정
  (화면 격자에 삼각형, 깊이 비교, 선분을 잘게 나눠 판정; 윤곽선 근처 자기 면은 제외; 보이는 선과 겹치는 숨은선은 생략).
- `drawingViews`: 3각법 배치(평면도 위, 우측면도 오른쪽, 등각도 오른쪽 위), 숨은선은 `hidden` 레이어.
- `sectionAt` + `joinSegments`: 평면 Z = h 단면 → 닫힌 폴리선.

## 3D 파일 (`exchange3d.js`, `zip.js`, `xml.js`)

| 형식 | 쓰기 | 읽기 |
| --- | --- | --- |
| FCStd | Document.xml 에 Part::Box/Cylinder/…/Wedge(회전 보정)/Prism/Ellipsoid, Part::Extrusion·Revolution·Loft(스케치), Part::Sweep(Helix·Polygon+Circle), Part::Cut/MultiFuse/MultiCommon, Part::Mirroring, Mesh::Feature(.bms), 2D 는 Sketch | 같은 객체들을 매개변수 그대로, Mesh::Feature, 자유 스케치 → 2D |
| STEP | 면 분할 B-rep (같은 평면 삼각형은 한 면으로 합침, FACE_SURFACE+PLANE) | FACETED_BREP, 그리고 평면·원통·원뿔·구·토러스 ADVANCED_FACE (매개변수 공간에서 5° 셀로 잘라 삼각분할) |
| STL · OBJ · PLY · OFF · AMF · 3MF | 공유 꼭짓점, 3MF 는 deflate ZIP | 이진/ASCII STL, 다각형 OBJ, 이진/ASCII PLY, 단위(AMF inch 등), 3MF 구성품·변환 |

FreeCAD 문서에서 알아낸 규칙 (FreeCAD 1.1 로 확인):
- 스케치의 배치는 저장된 모양(.brp)에서 복원됩니다 → 스케치마다 위치만 담은 빈 compound BREP 를 함께 씁니다.
- 곁 파일(.brp, .bms, Nodes)은 **Document.xml 이 참조하는 순서대로** ZIP 에 들어 있어야 합니다 (어긋나면 뒤 파일을 건너뜀).
- 점 목록(PropertyVectorList)은 곁 파일: uint32 개수 + float64 x,y,z.
- FreeCAD 는 AMF 를 읽지 못합니다 (3D 프린터용으로만 씀).

## 팝업 · 메뉴

팝업과 메뉴는 Tauri 의 소유(owned) OS 창(`popup-<kind>`, 고정 크기, 주 창과 함께 닫힘), 웹에서는 iframe. 인자는 `localStorage` 의 `mycad.popup.<kind>` 로 넘기고 결과는 이벤트로 돌아옵니다.
새 팝업은 `src/platform/popups.js`(크기)와 `src-tauri/src/lib.rs` 의 `POPUP_KINDS` 에 함께 등록합니다.

## 테스트

`scripts/test.mjs` 가 분류(js · freecad · package · rust · web · desktop · installer)별로 실행하고 Summary 표를 보여 줍니다.
- `test/freecad`: FreeCADCmd + `scripts/freecad/check.py` 로 MyCAD 가 쓴 파일과 samples/exports 를 열어 비교.
- `scripts/freecad/generate.py`: FreeCAD 가 직접 만든 샘플(samples/freecad)과 그 부피 → 단위 테스트가 MyCAD 의 읽기를 비교.
- E2E: `test/e2e/desktop.suite.mjs`(실제 앱, `window.__mycad` 훅), `web.suite.mjs`(헤드리스 Edge).
