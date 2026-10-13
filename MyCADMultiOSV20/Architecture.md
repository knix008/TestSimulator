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

## 2D 파일 형식 (`import2d.js`, `iges.js`, `gerber.js`, `formats2d.js`, `svgparse.js`, `dxf2000.js`)

`importDrawingBytes(name, bytes)` 가 내용(먼저)과 확장자로 형식을 고릅니다. 글은 UTF-8/16 또는 DXF 의 `$DWGCODEPAGE`(ANSI_949 → euc-kr …)로 풀고, 바이너리 DXF(`AutoCAD Binary DXF` 표지, R12 1바이트·R13+ 2바이트 그룹 코드)는 텍스트 DXF 와 같은 그룹 쌍으로 바꿔 `importDxf` 에 넘깁니다. 읽은 레코드는 `normalizeEntity` 로 다듬습니다.
- IGES: 고정 80열 S/G/D/P/T 구역, Hollerith 문자열, 124 변환 행렬 연쇄, 매개변수 공간 곡선(141/142)과 부분도 정의(308) 제외, 314 색. 쓰기는 110/100/104+124/106/116/126/212 + 314 색 + 레벨=레이어.
- Gerber: `%…%` 확장 명령과 `*` 워드, FS/MO, 조리개 C·R·O·P, G01/02/03 · G74/75, D01/02/03, G36/37 영역(→ 채움 해칭). Excellon: METRIC/INCH, LZ/TZ, 공구 지름, G85 장공.
- 다른 프로그램의 파일로 시험합니다: FreeCAD(`scripts/freecad/drawings2d.py`), ezdxf(`scripts/ezdxf/make_samples.py`), 규격 예제(samples/drawings). MyCAD 가 쓴 IGES · SVG · DXF 2000 은 FreeCAD 가 다시 열어 길이를 비교합니다.

## 시작 페이지 · 튜토리얼 · 문서

- `src/view/startpage.js`: 시작 페이지 HTML(할 일 `START_TASKS` ↔ 레슨 · 샘플). `#start-page` = 고정된 `.start-bg`(3D 배경) + 위로 스크롤되는 `.start-scroll`(내용). 메뉴 줄의 `.menubar-home` 과 탭 줄의 집 탭이 `startPage` 명령입니다.
- `src/view/startbg.js`: 배경의 three.js 장면(지연 로드). `app.js` 의 `gearPairMeshes()` 가 기어 부품 윤곽을 돌출해 z24/z16 기어와 축을 만들고, 기어마다 축(pivot)과 각속도(잇수비로 반대 방향)를 줍니다. 시작 페이지가 숨거나 창이 백그라운드면 멈추고, 'reduced motion' 이면 시점 회전만 멈춥니다. 샘플 목록은 `samples/index.json`(`create-samples.mjs` 가 씀), 개발 서버는 프로젝트 폴더를, 빌드는 `vite.config.js` 의 복사 단계가 dist/samples 를 줍니다. 썸네일은 실행 중에 만듭니다(솔리드는 음영 등각, 2D 는 렌더러). 도면 검사는 `src/domain/check.js`(DOM 없음): 객체별 검사, 기하 키로 겹친 객체, 끝점 격자(칸 = 허용 틈)로 맞닿지 않은 끝점을 찾고 `{ code, severity, ids, at, params }` 를 돌려줍니다 — 솔리드는 메시를 만들지 않고 배치점만 씁니다(큰 불리언도 수 ms). `app.js` 의 문제 패널이 변경 250 ms 뒤 다시 검사합니다. 튜토리얼 패널은 데스크톱에서 `popup-tutorial` 창이고(플레이어는 주 창에서 실제 화면을 조작), 패널 HTML 을 그 창에 보내고 단추는 'tutorial' 동작으로 돌아옵니다; 웹에서는 페이지 안에 뜹니다. 샘플 모델은 `scripts/models3d.mjs`(기본 3D)와 `scripts/models-complex.mjs`(건축 평면도 · 3D 주택 · 사무소, 감속기 · 축 제작도 · 바이스 · 철골)에 있고, 주택은 평면도와 3D 모델이 같은 `HOUSE` 데이터(벽 중심선 · 두께 · 개구부)에서 나옵니다. 건물을 담도록 솔리드 치수 상한은 100 m(반지름 50 m)입니다.
- `src/tutorial/player.js`: 떠 있는 패널, 보기(가짜 커서 · 강조 고리 · 키 풍선)와 직접 하기(검사 함수를 300 ms 마다 · 클릭할 곳 표시). `app.js` 의 `tutorialApi()` 가 실제 캔버스 포인터 이벤트 · 명령 · 대화상자 대신 동작을 빌려 줍니다. 튜토리얼 동안 설정은 기준값(mm · 5 mm 격자 스냅 …)으로 두었다가 닫으면 돌려놓습니다.
- `src/tutorial/lessons.js`: 16레슨. 단계 = `{ title, text, run(ctx), practice: { todo, check, targets } }`. `runAll()` · `verifyPractice()` 를 E2E 가 실행합니다.
- `scripts/docs-shots.mjs` → `doc/images/<언어>/*.webp`(단계마다 실제 앱 화면 + `DOC_DIALOGS` 의 창), `scripts/build-docs.mjs` → `doc/Tutorial(.en).md/.html`(레슨 데이터에서 생성하므로 앱과 문서가 같습니다). Rust `open_document` 가 HTML 을 브라우저로 엽니다(설치본은 리소스 doc/).
- `scripts/record-tutorial.mjs`: 보기 모드로 전 레슨을 재생하며 ffmpeg(gdigrab/x11grab)로 창 영역을 녹화 → `MyCAD-Tutorial.mp4`.

## 오류 보고

- JS: `window` 의 error · unhandledrejection, 모든 실패 경로가 `showError()` → 오류 팝업(자세한 내용 · 복사). 팝업을 열 수 없으면 `inlineError()` 가 주 창 안에 같은 보고를 그립니다. 팝업 창의 오류는 `report-error` 로 주 창에 모입니다.
- Rust: `install_panic_hook` 이 모든 패닉을 데이터 폴더의 `crash.log` 에 쓰고 `fatal-error` 이벤트로 팝업에 보냅니다. 주 스레드 패닉(프로세스가 끝남)은 먼저 OS 메시지 상자(`native_alert`, Windows `MessageBoxW`)로 보여 줍니다.
- 실행 표지: 시작할 때 데이터 폴더에 `running.lock`(시작 시각)을 쓰고, 정상 종료(`quit_app`, `RunEvent::Exit`)에서 지웁니다. 시작할 때 남아 있으면 지난 실행이 비정상 종료 → `previous_run` 명령이 그 실행 동안의 `crash.log` 항목과 함께 넘기고 UI 가 오류 팝업으로 보고합니다. E2E 의 `restart()` 는 표지를 지우고(`{ reportCrash: true }` 면 남김) 다시 실행합니다.

## 버전

`package.json` 의 version(= `src-tauri/Cargo.toml`, `tauri.conf.json` 은 package.json 을 가리킴) 하나만 고칩니다. 화면에는 주.부 번호만 `V1.0` 으로: Rust `app_title()`(모든 창 제목), `app.js`·`popup.js` 의 `displayVersion()`(문서 제목 · 프로그램 정보 · 시작 페이지).

## 팝업 · 메뉴

팝업과 메뉴는 Tauri 의 소유(owned) OS 창(`popup-<kind>`, 고정 크기, 주 창과 함께 닫힘), 웹에서는 iframe. 인자는 `localStorage` 의 `mycad.popup.<kind>` 로 넘기고 결과는 이벤트로 돌아옵니다.
새 팝업은 `src/platform/popups.js`(크기)와 `src-tauri/src/lib.rs` 의 `POPUP_KINDS` 에 함께 등록합니다.

## 테스트

`scripts/test.mjs` 가 분류(js · freecad · package · rust · web · desktop · installer)별로 실행하고 Summary 표를 보여 줍니다.
- `test/freecad`: FreeCADCmd + `scripts/freecad/check.py` 로 MyCAD 가 쓴 파일과 samples/exports 를 열어 비교.
- `scripts/freecad/generate.py`: FreeCAD 가 직접 만든 샘플(samples/freecad)과 그 부피 → 단위 테스트가 MyCAD 의 읽기를 비교.
- E2E: `test/e2e/desktop.suite.mjs`(실제 앱, `window.__mycad` 훅), `web.suite.mjs`(헤드리스 Edge).
