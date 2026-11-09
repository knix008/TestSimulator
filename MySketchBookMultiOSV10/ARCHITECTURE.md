# MySketchBook 구조

개발자를 위한 문서입니다. 무엇이 어디에 있고, 데이터가 어떻게 흐르고, 3D 화면이 왜 빠른지를 설명합니다. 모듈 사이의 약속(단위·축·카탈로그 항목·문서 형식)은 [CONTRACT.md](CONTRACT.md), 모델링 커널의 API와 규칙은 [src/modeling/README.md](src/modeling/README.md)에 있습니다. 사용법은 [doc/UsersGuide.md](doc/UsersGuide.md)를 보세요.

## 1. 전체 그림

```
                         index.html  (하나의 번들이 모든 창을 맡음: src/main.js)
                               │
        ┌──────────────────────┼─────────────────────────────┐
        │ 주 창 (src/app.js)    │ 팝업 (src/popup.js)          │ 문서 창 (src/viewer.js)
        │                      │  + popups-3d.js              │  사용 설명서 · 튜토리얼 문서 · 동영상
        ▼                      ▼                              ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ app.js: 상태 · 명령 표(commands) · MENUS/SUBMENUS · TOOLBAR · 단축키 · 패널 렌더링 │
 │         파일(.msk) · 가져오기/내보내기 · 렌더링 · 장면/층 · 문제 검사 · 튜토리얼      │
 └──────┬───────────────┬──────────────────┬──────────────────┬────────────────┘
        │ change()/commit()                │ toolApi           │ panelApi
        ▼               ▼                  ▼                   ▼
 engine/document.js  engine/builder.js   tools/tools.js       ui/panels.js · startpage.js
 (프로젝트 JSON,     (문서 → three.js,    tools/modeling.js    (HTML 문자열)
  History 실행 취소)   증분 동기화)          tools/snap.js
        │               │                  │
        │               ▼                  ▼
        │        engine/viewport.js ◄── engine/overlay.js (미리보기·추론 표시)
        │        (렌더러·카메라·조작·피킹·스타일·단면·평면도·캡처)
        │               ▲
        │               │ 템플릿 복제, 공유 재질
        ▼               │
 engine/walls.js    library/catalog.js ── parametric/*.js (매개변수 가구 125)
 engine/checks.js        │             └─ assets.js (Poly Haven GLB 122, 텍스처 훅)
 engine/templates.js     │                environments.js (HDRI 8)
 engine/samples.js   engine/materials.js (재질 105, 공유 인스턴스)
 engine/fileformat.js
 engine/photo.js (경로 추적)          modeling/ (GeoMesh 커널, 추론, manifold-3d 솔리드)
 io/import.js · export.js · formats.js (3D 파일)
        │
        ▼
 platform/native.js ── 데스크톱: Tauri invoke (src-tauri/src/*.rs) / 웹: 브라우저 API, IndexedDB
 platform/popups.js ── 데스크톱: OS 창 "popup-<kind>" / 웹·튜토리얼: 페이지 안 프레임
```

화면 코드는 vanilla JavaScript(프레임워크 없음)와 three.js입니다. 패널은 HTML 문자열을 만들고 `data-*` 속성으로 이벤트를 받는 방식이라 다시 그리기가 단순하고, 3D 화면은 그 밖에서 독립적으로 그립니다.

## 2. 진입점과 창

`index.html` 하나가 모든 창의 페이지입니다. `src/main.js`가 창 이름(또는 URL 매개변수)으로 무엇을 띄울지 고릅니다.

| 창 | 조건 | 모듈 |
|---|---|---|
| 주 창 | 데스크톱 창 `main`, 웹의 기본 페이지 | `src/app.js` |
| 팝업 | 데스크톱 창 `popup-<kind>`, 웹·튜토리얼에서는 `index.html?popup=<kind>` 프레임 | `src/popup.js` (+ `src/popups-3d.js`) |
| 문서 창 | 데스크톱 창 `doc-<kind>`, 웹에서는 `index.html?viewer=<kind>` 탭 | `src/viewer.js` |

main.js는 첫 그리기 전에 설정을 읽어 언어·테마·글꼴을 적용하고(창이 잘못된 색으로 깜빡이지 않도록), 설치 직후 첫 실행이면 설치 언어를 적용하고 환경 설정을 초기화합니다(사용자 데이터는 유지).

## 3. 모듈

### 3.1 주 창 — `src/app.js`

- **state** — 설정, 최근 파일, 열린 문서(`Doc`: 프로젝트, History, 경로·웹 파일 핸들, 가져온 모델의 바이트 `assets: Map`), 선택, 도구, 패널 탭, 측정값 상자, 문제 목록, 메시지 기록.
- **commands** — 모든 명령이 한 표에 있습니다: `{ icon, label(i18n 키), key(단축키), enabled(), checked(), run(context) }`. 메뉴(`MENUS`, `SUBMENUS`), 툴바(`TOOLBAR`, `TOOLBAR_RIGHT`), 도구 모음(`ui/panels.js TOOL_GROUPS`), 오른쪽 클릭 메뉴가 모두 이 표의 id를 가리킵니다. 사용 가능 여부와 체크 표시, 툴팁(이름 + 단축키 + `tip.*` 설명)이 표에서 나옵니다.
- **단축키** — `SHORTCUTS`(Ctrl 조합)와 `LETTERS`(명령의 `key`가 한 글자인 것: SketchUp 단축키)를 `onKeyDown`이 처리합니다. 순서: 튜토리얼 Esc → Ctrl 조합 → F1/F4/F9/F11 → (입력 칸이면 중단) → 지금 도구의 `key()` → Delete · Esc · PageUp/Down → 숫자·길이 문자는 측정값 상자로 → 한 글자 도구. Settings › Shortcuts 목록은 `src/popup.js`의 `SHORTCUT_LIST`입니다.
- **change(labelKey, mutate, touch)** / **commit(labelKey, touch)** — 모든 편집은 프로젝트 JSON을 직접 바꾼 뒤 한 번 기록합니다. 기록 후 `afterChange()`가 문제 검사 예약 → 선택 정리 → 장면 동기화 → 선택 상자 → 제목·탭·오른쪽 패널·상태 표시줄·툴바를 갱신합니다. 끌기 중 미리보기는 `live()`(동기화만, 기록 없음).
- **패널** — `renderLeft`(라이브러리/재질), `renderRight`(개요 + 편집 탭), `renderBottom`(문제·메시지·정보), `renderStatus`, `renderTabs`(장면 탭·층 칩·3D/2D), `renderPalette`, `renderStartPage`. 입력 중인 칸이 있으면 오른쪽 패널은 다시 그리기를 미룹니다.
- **파일** — `openPath`/`openContent`(데스크톱 경로/웹 바이트), `saveDoc`(데스크톱 `write_base64_file`, 웹 `saveFileWeb`), 최근 파일·폴더, 세션 복원, 끌어다 놓기(데스크톱 `onDragDropEvent`, 웹 `drop`).
- **가져오기/내보내기/렌더링** — `importModelFiles`, `exportModel`, `exportImage`, `exportPlanImage`, `renderPhoto`. 오래 걸리는 일은 `withProgress()`로 감싸 지연 후 진행률 팝업을 띄우고 취소 신호를 넘깁니다.
- **테스트 훅** — `window.__mysketchbook`(state, commands, run, popups, menus, api, viewport, builder, actions, domain, tutorial). E2E와 튜토리얼 캡처가 이것으로 앱을 움직입니다.

### 3.2 엔진 — `src/engine/`

| 파일 | 역할 |
|---|---|
| `document.js` | 프로젝트 생성·정규화(`createProject`, `normalizeProject`), id(`newId`), 인덱스(`buildIndex`: id → { kind, entity }), 삭제(`removeEntities`, 벽을 지우면 그 문·창도), 층 조회, 길이·면적 형식(`formatLength`, `parseLength`, `formatArea`), **History**(실행 취소) |
| `walls.js` | 벽 기하(순수 수학): 방향·법선·길이, 끝끼리 마이터·옆면에 맞댐 이음, 문·창 구멍을 뚫은 벽 메시, 벽 중심선에서 방 찾기(`detectRoom`), 가까운 벽(`nearestWall`), 벽 나누기 |
| `builder.js` | `SceneBuilder`: 문서 → three.js 객체 (5장) |
| `viewport.js` | `Viewport`: 렌더러, 원근/평행 카메라, SketchUp식 조작(궤도·이동·확대·걷기), 표준 보기, BVH 피킹, 면 스타일, 그림자·해, 환경, 단면·평면도 자르기, 선택 상자, 화면 캡처 (5장) |
| `overlay.js` | 도구의 보조 표시: 고무줄 선, 다각형 미리보기, 추론 점·점선, 각도기, HTML 레이블(길이·"끝점" 등) |
| `materials.js` | 재질 프리셋 105개와 분류 15개, `getMaterial(id, overrides)` 공유 인스턴스 캐시, 사용자 재질, 텍스처 훅(`setTextureHook`) |
| `checks.js` | 문제 검사(순수): 짧은 벽, 넓은·벗어난·높은·겹친 문·창, 라이브러리에 없는 항목, 방 밖 가구, 떠 있는 가구, 겹친 가구, 방 없는 층 |
| `templates.js` | 새 프로젝트 템플릿 11개(벽·문·창·방) |
| `samples.js` | 예제 프로젝트 7개(템플릿 + 가구 배치, 한국어/영어 방 이름). `npm run samples`가 `samples/*.msk`로도 씀 |
| `fileformat.js` | `.msk` 읽기/쓰기 (4장) |
| `sun.js` | 날짜·시각·위도·경도·북쪽 각도 → 해 방향 |
| `photo.js` | 사실적 렌더링 (6장) |

### 3.3 도구 — `src/tools/`

- `tools.js` — 실내 도구와 공통 도구: Select · Place(라이브러리 항목·문·창) · Wall · Room · Move · Rotate · Scale · Eraser · Paint · Tape · Dimension · Text · Section · Walk · Nav(궤도·이동·확대를 왼쪽 버튼으로).
- `modeling.js` — 면과 모서리에 쓰는 SketchUp 도구: Line · Rectangle · Circle/Polygon · Arc · Freehand · PushPull · Offset · FollowMe · Protractor · LookAround, 그리고 앱이 부르는 명령(그룹 만들기·편집·분해, 솔리드 도구, 면 교차, 모서리 부드럽게, 면 칠하기, 지우개). `createTool('axes')`는 아직 `null`(준비 중)입니다.
- `snap.js` — 평면(바닥) 스냅: 벽 끝점 · 중점 · 벽 위 · 마지막 점에서의 축 방향(±3.5°) · 다른 점과의 정렬 · 격자. 벽·방·배치·이동 도구가 씁니다.

**도구 API.** 도구는 `Tool`을 상속하고 다음을 구현합니다(모두 선택).

```js
class MyTool extends Tool {
  id = 'my';
  get cursor() { return 'crosshair'; }
  activate() {} deactivate() {}          // 도구를 고를 때 / 바꿀 때 (overlay.reset())
  down(e) {} move(e) {} up(e) {} dblclick(e) {}   // 3D 화면의 왼쪽 버튼 포인터 이벤트 (move는 프레임당 한 번)
  key(e) { return false; }               // true면 앱이 그 키를 더 처리하지 않음 (화살표 고정, Esc …)
  keyUp(e) {}
  vcb(text) { return false; }            // 측정값 상자 Enter, false면 "이해할 수 없습니다"
  vcbLabel() { return 'vcb.length'; }    // 측정값 상자의 이름
  hint() { return 'hint.my'; }           // 상태 표시줄 도움말 키
}
```

도구는 앱을 `toolApi`(app.js)로만 봅니다: `viewport`, `overlay`, `builder`, `project()`, `level()`, `units()`, `settings()`, `t`, `notify`, `change`/`commit`/`live`, `select`/`selection`/`isLocked`/`kindOf`, `moveEntities`/`rotateEntities`/`scaleEntities`/`duplicateEntities`/`deleteEntities`, `paintHit`, `setTool`, `setVcb`, `groundPoint`(작업 층 바닥 위의 점), `entitiesInRect`, `prompt` 등. 끌기 중에는 프로젝트를 직접 바꾸고 `live()`, 끝날 때 `commit()` 한 번 — 그래서 끌기 하나가 실행 취소 한 단계입니다. 새 도구는 `makeTool()`(app.js)이나 `createTool()`(modeling.js)에 등록하고, 명령 표에 `toolCommand(id, icon, key)`로 넣고, i18n에 `tool.<id>` · `hint.<id>` · `tip.tool.<id>`를 더합니다.

### 3.4 모델링 커널 — `src/modeling/`

SketchUp의 "붙는 형상"을 순수 JS로 구현했습니다(DOM 없음, Node 테스트). 자세한 내용은 [src/modeling/README.md](src/modeling/README.md).

- `GeoMesh`(`mesh.js`): 정점·모서리·면·곡선이 한 id 공간을 씁니다. `addEdge`가 겹침·교차·T자 이음에서 모서리를 나누고 새 모서리 주변에서만 면을 찾습니다(닫힌 고리 → 면, 면을 가로지르는 선 → 면 나누기, 면 안의 고리 → 구멍). 밀기/당기기(늘이기·뽑기·관통), 이동/복사/변형, 오프셋, 경로 따라가기, 면 교차, 지우기(같은 평면 면 합치기), 부드럽게, 면별 재질과 UV, JSON 직렬화, 변경 추적(`takeChanges`), 삼각형 버퍼(면별 캐시, 재질 그룹, `faceOfTriangle`).
- `inference.js`: SketchUp 우선순위(끝점 > 중점 > 중심 > 안내점 > 교차 > 모서리 위 > 안내선 위 > 축 > 평행 > 수직 > 면 위 > 바닥), 축·방향·평면 고정.
- `solids.js`: manifold-3d(WASM, 처음 쓸 때 불러옴)로 합치기·빼기·교집합·자르기·나누기. 결과를 다각형 면으로 되돌리고 같은 평면 면을 합칩니다.
- 공간 해시 격자로 큰 모델에서도 빠릅니다(40 000면 격자 ≈ 1초 생성, 면 하나 밀기 ≈ 0.7 ms).

앱 쪽에서 모델은 `project.models[]`의 항목이고 각자 `mesh`(GeoMesh JSON)를 가집니다. 그룹 밖에서 그린 것은 층마다 하나인 `loose: true` 모델에 들어가 서로 붙고, 그룹은 다른 모델이라 붙지 않습니다. `tools/modeling.js`의 `meshOf(model)`은 JSON 객체가 같으면 살아 있는 GeoMesh를 재사용하고(실행 취소로 JSON이 바뀌면 다시 만듦), 연산 뒤 `store()`가 JSON을 갱신하고 커밋합니다.

### 3.5 라이브러리 — `src/library/`

| 파일 | 역할 |
|---|---|
| `categories.js` | 분류 17개(16 + 내 객체) |
| `catalog.js` | 카탈로그: 매개변수 항목 + 내려받은 모델(매니페스트) + 사용자 항목(`registerUserItem`). `searchItems`(분류·한국어/영어 이름·태그), `itemParams`(기본값 채우기), 변경 알림 |
| `parametric/*.js` | 매개변수 가구 125개 (분류별 파일, `helpers.js` 공통 형상: 둥근 상자·다리·쿠션 …). 계약: `build(params, ctx) → THREE.Group`, 원점은 바닥 가운데, 앞은 +Z, UV는 미터, `ctx.material(id)`로만 재질 요청 |
| `assets.js` | `library/models/manifest.json` → 카탈로그 항목(`kind: 'asset'`, 놓는 곳 추측: 천장·벽·윗면·바닥). GLB를 한 번만 읽고(meshopt 해제) 배치마다 형상·재질을 공유하는 복제. **텍스처 훅**: 재질 프리셋의 `textures` 세트(색·법선·거칠기·AO)를 불러와 공유 재질에 붙이고, 다 읽히면 화면을 다시 그리게 함 |
| `environments.js` | HDRI 8개(PMREM으로 반사·주변광, 원본은 배경과 경로 추적용), 라이브러리 기준 URL(`setLibraryBase`, `libraryUrl`) |

라이브러리 파일(`library/`, 약 300 MB)은 `npm run assets`(`scripts/fetch-assets.mjs`)가 Poly Haven API에서 받습니다: 모델은 1k glTF를 GLB 하나로 묶고 원점을 바닥 가운데로 맞추고 텍스처를 1024 px로 줄이며, 썸네일·매니페스트·`LICENSES.md`를 씁니다. 다운로드 캐시는 `node_modules/.cache/polyhaven`.

### 3.6 3D 파일 — `src/io/`

- `formats.js` — 가져오기/내보내기 형식 표, 지원하지 않는 형식(.skp)의 설명, 단위 배율.
- `import.js` — 형식 판별(내용 확인 포함) → three 로더(GLTF, OBJ+MTL, FBX, Collada, STL, 3DS, PLY, 3MF, USDZ, VRML) → 재질을 MeshStandardMaterial로 변환 → 부품이 64개를 넘으면 재질별로 합치기 → 단위 추측(실내 물건 크기 기준)·위쪽 축·바닥 가운데로 맞춤 → 통계와 경고. 순수 단계는 따로 내보내 Node에서 시험합니다.
- `export.js` — 원본을 건드리지 않고 복제(형상·재질 공유)에 단위·축 변환을 씌워 GLB · glTF · OBJ(+MTL zip 선택) · STL · PLY · USDZ로 씁니다.

앱은 가져온 모델을 GLB로 다시 내보내 문서의 `assets`에 보관하고(`project.assets[id] = { name, ext, size, triangles, source }`), 카탈로그에 `user:<id>` 항목으로 등록합니다.

### 3.7 UI — `src/ui/`, `src/popup.js`, `src/viewer.js`

- `panels.js` — 도구 모음, 라이브러리·재질, 개요, 속성(벽·방·문·창·가구·모델·주석), 스타일·그림자·태그·장면·층 탭의 HTML.
- `startpage.js` · `startboard.js` · `startlayout.js` — 시작 화면 카드와 끌어 옮기기·크기 조절·자동 정렬. `background.js` — 움직이는 배경 20종(캔버스 2D).
- `thumbnails.js` — 매개변수 가구와 재질 견본 썸네일: 작은 오프스크린 렌더러로 화면에 보이는 카드만, 한 프레임에 하나씩, 메모리와 IndexedDB에 캐시.
- `tutorial.js` — 튜토리얼 `CHAPTERS`(8)와 `STEPS`(30): 단계마다 강조할 대상과 앱 상태를 만드는 `run()`. 자기 프로젝트(84㎡ 템플릿)를 쓰고 끝나면 사용자의 문서와 설정을 되돌립니다. 도는 동안 팝업은 프레임으로 엽니다(`popups.inline`).
- `rulers.js` — 2D 평면도의 눈금자. `dropdown.js` · `tooltip.js` — 모든 창의 펼침 목록(아이콘)과 즉시 툴팁. `dom.js` — 작은 DOM 도우미.
- `popup.js` — 팝업 페이지: 메뉴, 설정(일반 · 시작 화면 · 테마 · 글꼴 · 배경 · 3D 보기 · 최근 기록 · 단축키), 확인, 오류, 진행률, 최근 파일, 테마 고르기, 시작 안내, 정보, 입력. `popups-3d.js`는 3D 보기 설정 탭과 가져오기 · 그림 크기 · 렌더링 옵션 · 렌더링 결과 · 새 재질 팝업입니다.
- `viewer.js` — 문서 창: `doc/<UsersGuide|Tutorial>[.en].html`을 iframe으로 열고 앱 테마 색을 입히며, 장 목록(h2/h3), 언어 전환, 찾기, 인쇄, 브라우저로 열기를 제공합니다. 동영상 창은 `doc/video/MySketchBook-Tutorial.mp4`와 장 정보 JSON을 씁니다. 순수 도우미는 `src/domain/helpdocs.js`.

### 3.8 플랫폼 — `src/platform/`, `src-tauri/`

- `native.js` — 데스크톱/웹 경계. 파일 대화상자, 파일 읽기/쓰기(진행률 이벤트 `io-progress`), 클립보드, 글꼴 목록, 외부 열기, 창 크기 등. 웹에서는 File System Access API(없으면 `<input>`과 내려받기), 최근 파일 핸들은 IndexedDB(`idb.js`).
- `popups.js` — `PopupHost`: 팝업마다 정해진 크기, 열기 매개변수는 localStorage로 전달, 결과는 메시지로. 데스크톱은 주 창이 소유한 OS 창(메뉴 창은 미리 띄워 둠), 웹·튜토리얼은 프레임.
- `src-tauri/src/` — `lib.rs`(명령: 앱 정보, 파일 입출력과 진행률, 경로 확인, 배경 그림, 글꼴, 클립보드, 팝업·문서 창 열기/배치/닫기, 창 끌기, 인쇄, 종료), `files.rs`, `fonts.rs`, `window_state.rs`(창 위치 기억), `instance.rs`(여러 실행, 시작 파일), `i18n.rs`(백엔드 문구), `printing.rs`. 설치 훅은 `src-tauri/windows/hooks.nsh`(기존 설치 완전 제거, 사용자 데이터 삭제 질문, 설치 언어 전달).

### 3.9 i18n — `src/i18n.js`, `src/i18n/`

`t(key, params, fallback)`. 사전은 `ko.js`/`en.js`(공통 셸), 그 위에 `ko3d.js`/`en3d.js`(3D·인테리어 화면, 같은 키), `extra3d.js`(모델링·하단 패널·튜토리얼 문구, 한 줄에 두 언어)를 덮어 `DICTIONARIES`를 만듭니다. 한국어에 없는 키는 영어, 둘 다 없으면 키 자체가 보입니다. 문서 빌드와 문서 테스트도 이 사전을 그대로 읽습니다.

## 4. 데이터 모델

### 4.1 프로젝트

`CONTRACT.md`의 형식이 기준입니다. 요약:

```js
{
  format: 'mysketchbook', version: 1, name, units: 'mm' | 'cm' | 'm' | 'in' | 'ft',
  levels:   [{ id, name, elevation, height, visible }],          activeLevel,
  walls:    [{ id, level, a: [x, z], b: [x, z], thickness, height | null, material: { left, right, top }, tag }],
  openings: [{ id, wall, item, offset, width, height, sill, side, flip, params }],   // offset = 벽 시작점에서 중심까지
  rooms:    [{ id, level, name, points: [[x, z] …], floor, ceiling, showCeiling }],
  objects:  [{ id, level, item, params, position, rotation, scale, materials: { 원래 프리셋: 바꾼 프리셋 }, tag, name, locked, hidden }],
  models:   [{ id, level, name, mesh /* GeoMesh JSON */, position, rotation, scale, tag, loose?, component? }],
  tags, scenes: [{ id, name, camera, style, tags: { tagId: visible }, plan }], activeScene,
  sun: { date: 'MM-DD', time: 'HH:MM', latitude, longitude, north, utcOffset },
  style: { mode, edges, lightsOn, background, environment, exposure },
  guides, dimensions, texts, sections: [{ id, point, normal, active }],
  materials: [사용자 재질], camera, assets: { id: { name, ext, size, triangles, source } },
}
```

가구의 위치 `position[1]`은 층 바닥에서의 높이이고, 장면 구성 때 층의 `elevation`이 더해집니다. 벽의 `height: null`은 층 높이를 따른다는 뜻입니다.

### 4.2 단위와 축

- 내부 단위는 **미터**, **Y가 위**, 바닥은 XZ 평면(0층 바닥 y = 0). 평면도의 "x"는 월드 x, "y"는 월드 z(화면 아래쪽으로 증가).
- 물체의 앞은 **+Z**, Y축 회전은 라디안(위에서 보아 반시계).
- 프로젝트 `units`는 표시와 입력에만 쓰입니다(`formatLength`/`parseLength`). 저장되는 값은 늘 미터입니다.
- 추론 이름은 API를 따라 `axisY`가 수직(SketchUp의 파란 축)입니다.

### 4.3 .msk 파일 — `engine/fileformat.js`

fflate로 만든 ZIP입니다.

```
project.json        프로젝트 JSON (+ modified 시각), 압축 수준 6
thumbnail.png       320 × 200 미리보기 (최근 파일·탐색기용), 저장만
assets/<id>.glb     가져온 모델 (이미 압축된 GLB라 저장만)
```

읽을 때 ZIP이 아니고 `{`로 시작하면 맨 JSON도 받습니다. `normalizeProject`가 빠진 필드를 채워 예전 파일도 열립니다.

### 4.4 실행 취소 — `History`

- 단계마다 **컬렉션별 JSON 문자열 스냅숏**을 저장합니다. `commit(label, touch)`의 `touch`(바뀐 컬렉션 목록: `['objects']`, `['walls', 'openings']` …)에 들지 않은 컬렉션은 이전 단계의 **문자열을 그대로 재사용**하므로, 큰 집에서 의자 하나를 옮겨도 의자 컬렉션만 다시 직렬화합니다. `touch = null`이면 전부.
- 최대 100단계. 되돌리기는 해당 컬렉션만 `JSON.parse`해 프로젝트에 다시 넣고, 장면 동기화가 바뀐 것만 다시 만듭니다.
- 스타일·해·카메라 같은 보기 상태는 문서의 `revision`만 올리고 실행 취소 단계로 남기지 않습니다(장면 갱신 등은 단계로 남음).

## 5. 렌더링과 성능

3D 화면의 속도가 가장 중요한 요구 사항입니다. 설계 규칙:

1. **필요할 때만 그리기** — `viewport.requestRender()`가 `dirty`를 세우고, `requestAnimationFrame` 루프는 `dirty`일 때만 그립니다(설정의 최대 프레임으로 간격 제한). 가만히 있는 모델은 GPU 시간을 쓰지 않습니다.
2. **상호작용 프레임과 최종 프레임** — 카메라를 움직이는 동안(`touchInteraction`)은 GTAO(구석 음영) 패스를 끄고 그림자 맵도 그대로 씁니다. 180 ms 동안 움직임이 없으면 최고 품질 프레임을 한 번 그립니다.
3. **그림자 맵은 바뀔 때만** — `shadowMap.autoUpdate = false`. 장면 동기화나 해 변경이 `shadowsDirty`를 세울 때만 다시 그리고, 그림자 카메라는 내용 상자에 맞춥니다.
4. **BVH 피킹** — three-mesh-bvh의 `acceleratedRaycast`. 모든 형상에 경계 트리를 만들어 100만 삼각형 모델 위에서도 커서 추적·스냅이 즉시 됩니다. 걷기의 충돌 검사도 같은 레이캐스트입니다.
5. **템플릿 복제와 공유 형상** — 매개변수 항목은 `(항목, 매개변수, 품질)`마다 한 번 만들어 템플릿으로 캐시하고(최대 600개), 배치마다 `cloneShared`로 형상·BVH·재질을 공유하는 복제를 씁니다. 고품질 GLB도 한 번 읽어 공유합니다. 같은 소파 20개는 GPU 업로드 한 번입니다.
6. **항목당 모서리 선 하나** — 한 가구의 모든 메시의 특징 모서리(30°)를 그 가구 좌표에서 `LineSegments` 하나로 합치고 형상별로 캐시합니다. 가구가 많은 집에서도 그리기 호출이 늘지 않습니다.
7. **재질 공유** — `getMaterial(id, overrides)`는 같은 인자에 같은 인스턴스를 돌려줘 셰이더 프로그램과 상태 전환이 최소입니다. 텍스처 세트도 공유합니다.
8. **해상도 적응** — 상호작용 중 프레임이 28 ms를 넘는 일이 6번 이어지면 해상도를 0.25씩(최소 0.5) 낮추고, 멈추면 원래대로 돌립니다.
9. **품질 프리셋** — 빠르게(AO 없음, 그림자 1024, MSAA 0) · 균형(AO, 2048, 4×) · 고품질(AO, 4096, 8×), 그 위에 사용자 설정(AO, 계단 현상 제거, 그림자 해상도, 해상도 배율, 최대 프레임).
10. **썸네일** — 화면에 보이는 카드만, 한 프레임에 하나, IndexedDB 캐시.
11. **모델링 커널** — 면별 삼각형·UV 캐시로 바뀐 면만 다시 삼각화하고, 공간 해시로 교차·병합을 찾습니다.

통계(그리기 호출·삼각형·프레임 시간·FPS)는 장면 패스와 오버레이를 합친 한 프레임 기준이며 상태 표시줄과 정보 탭에 나옵니다.

### 5.1 증분 장면 동기화 — `SceneBuilder.sync(project)`

- 그룹: `walls` · `rooms` · `openings` · `objects` · `models` · `cuts`(평면도 단면 채움) · `lights`.
- 엔터티마다 **만든 근거 JSON(key)**을 기억합니다(`built: id → { key, object }`). `sync()`는 key가 달라진 엔터티만 다시 만들고, 없어진 것은 치웁니다(템플릿 공유 형상은 해제하지 않음).
- 벽은 서로의 이음에 영향을 주므로 **층 단위로 함께** 다시 만들지만, 그 층의 벽이나 문·창이 바뀐 경우에만 합니다(`wallKeys`).
- 숨김·태그·층 보이기, 사용자 재질 덮어쓰기(`materials`)는 객체에 직접 반영합니다. 조명 켜기는 `updateLights`가 램프의 `userData.light` 자리에 실제 광원을 둡니다.
- 텍스처가 늦게 도착하면 `onAsync`/텍스처 콜백이 화면만 다시 그리게 합니다.

### 5.2 사실적 렌더링 — `engine/photo.js`

three-gpu-pathtracer의 `WebGLPathTracer`를 **별도 WebGL 컨텍스트**(요청한 크기의 캔버스)에서 돌립니다. 보조 표시를 숨기고, 환경은 고른 HDRI(없으면 지금 하늘색으로 만든 그라데이션 환경), 바운스 6(투과 8), 타일 분할. 한 프레임에 샘플 하나씩 그려 UI와 진행률 창이 살아 있고, 남은 시간을 알리며, 취소 신호를 프레임마다 확인합니다. 대화형 화면은 그동안 그대로 동작합니다.

### 5.3 평면도와 단면

`setPlanMode(true)`는 지금 카메라를 저장하고 평행 투영 위 보기로 바꾼 뒤 작업 층 바닥 + 1.2 m에 자르기 평면을 둡니다. 잘린 벽의 단면은 builder의 `cuts` 그룹(작업 층 것만 보임)이 채웁니다. 단면 평면은 `renderer.clippingPlanes`(`localClippingEnabled`)로 처리하며 평면도 자르기와 함께 씁니다.

## 6. 추론(스냅)

- **평면 도구**(벽·방·배치·이동·줄자·치수): `tools/snap.js`가 바닥 평면에서 벽 끝점 > 중점 > 벽 위 > 축 방향 > 정렬 > 격자 순으로 고르고, 픽셀 크기로 허용 거리를 정합니다. 화살표 키·Shift로 방향을 고정합니다.
- **모델링 도구**: `tools/modeling.js`의 `snap()`이 커서 근처(화면 40 px 안) 모델 모서리(모델당 최대 400개), 벽 모서리의 위·아래 점, 안내선, 커서 아래 면을 후보로 모아 `modeling/inference.js`의 `infer()`에 넘깁니다. 화살표 키는 축 고정(→ X, ← Z, ↑↓ Y), Shift는 지금 방향 고정, 사각형·원은 첫 클릭 평면 고정.
- 결과는 `overlay.js`의 `showInference()`가 점·점선·툴팁(`inf.*`)으로 보여 줍니다.

## 7. 라이브러리 경로: 데스크톱과 웹

| 상황 | 라이브러리 위치 | 방법 |
|---|---|---|
| `npm run dev`, `npm start` | `library/` | Vite 플러그인(`vite.config.js` `assetLibrary`)이 `/library/…`를 직접 응답 |
| 웹 빌드 | `dist/library/` | 같은 플러그인의 `closeBundle`이 복사 (Tauri 빌드 중에는 복사하지 않음) |
| 설치한 데스크톱 앱 | 설치 폴더의 `library/` 리소스 | `tauri.conf.json` `bundle.resources`, 시작 시 `resolveResource('library')` → `convertFileSrc` → `setLibraryBase(...)`. 에셋 프로토콜 범위 `$RESOURCE/library/**` |

`public/`에 넣지 않는 이유: Tauri가 `frontendDist`를 실행 파일 안에 넣기 때문입니다(300 MB 실행 파일 방지). 문서(`doc/`)와 예제(`samples/`)도 설치 리소스로 들어가고, 문서는 `public/doc/` 복사본으로 웹 빌드에도 들어갑니다.

## 8. 팝업과 문서 창

- 팝업 종류: menu · settings · about · confirm · error · progress · recent · theme · welcome · prompt · importmodel · snapshot · render · renderresult · material. 크기는 `platform/popups.js`의 `POPUPS`에 고정되어 있고, 확인·정보·시작 안내·입력은 내용 높이에 맞춥니다.
- 메뉴는 항목 목록(`id, label, icon, shortcut, disabled, checked, children`)을 받아 그리고 고른 id를 돌려줍니다. 하위 메뉴는 같은 창에서 다시 엽니다.
- 진행률 팝업은 `withProgress`가 지연(기본 250 ms) 뒤에만 띄우므로 빠른 일에는 깜빡이지 않습니다. 취소는 `cancel:<op>` 액션 → `signal.cancelled`.
- 문서 창: 데스크톱은 Rust `open_doc_window`가 `doc-<kind>` 창을 만들고, 웹은 새 탭, 튜토리얼 중에는 페이지 안 프레임입니다.

## 9. 문서와 튜토리얼 산출물

- `scripts/build-docs.mjs` (`npm run build:docs`) — 의존성 없는 Markdown 변환기로 `doc/UsersGuide.md` → `doc/UsersGuide.html`, `doc/UsersGuide.en.md` → `doc/UsersGuide.en.html`을 만들고, 튜토리얼 문서 `doc/Tutorial.html`/`Tutorial.en.html`은 `src/ui/tutorial.js`의 `CHAPTERS`/`STEPS`와 i18n의 `tutorial.*` 문구, 단계 그림으로 직접 만듭니다. 결과를 `public/doc/`에 복사합니다(`--with-video`면 동영상도).
- `scripts/tutorial-capture.mjs` — Vite 개발 서버(127.0.0.1과 ::1 모두 비어 있는 포트, `scripts/dev-port.mjs`)와 헤드리스 Edge/Chrome(실제 GPU, 새 프로필)으로 튜토리얼을 돌려 단계마다 화면을 찍습니다: `doc/tutorial/images/NN-<step>.jpg`(한국어), `doc/tutorial/images/en/NN-<step>.jpg`(영어). `docs`(찍고 문서 빌드) · `check`(오류만 확인) · `video`(자동 재생 녹화, ffmpeg) 모드. 다른 프로그램의 서버를 쓰거나 끄지 않습니다.
- 튜토리얼 단계를 바꾸면 `npm run tutorial:docs`로 그림과 문서를 다시 만들고, 설명서의 그림 번호(`NN-<step>`)를 맞춥니다(문서 테스트가 확인).

## 10. 테스트

| 위치 | 내용 | 실행 |
|---|---|---|
| `test/unit/` | 모델링 커널(그리기·밀기/당기기·오프셋·경로 따라가기·교차·솔리드·추론·성능), 벽 이음과 방 찾기, 라이브러리 계약(모든 매개변수 항목을 Node에서 만들어 보기), 에셋 매니페스트, 3D 입출력 | `node --test test/unit/*.test.js` |
| `test/static/` | 문서(`docs.test.js`: HTML 문서와 복사본, 링크·그림, 두 설명서의 장 구성, 단축키 표, 튜토리얼 단계 수와 그림), 패키지 설정(`package.test.js`) | `node --test test/static/*.test.js` |
| `test/e2e/` | 웹(헤드리스 Edge/Chrome + `dist/`)과 데스크톱(디버그 exe + WebView2 CDP) 시나리오, 대화상자 | `npm run test:e2e` |
| `test/installer/` | NSIS 설치 훅 시나리오 | `npm test -- --installer` |
| `src-tauri` | Rust 단위 테스트 | `cargo test --lib` (또는 `npm run test:unit`) |

`npm test`(`scripts/test.mjs`)는 범주별로 모두 실행하고 진행 상황과 요약 표를 보여 주며 결과를 `test-results/results.json`에 씁니다. E2E는 앱을 `window.__mysketchbook` 훅으로 움직이고, 실제 마우스 입력은 쓰지 않습니다.

## 11. 새 기능을 더할 때

- **명령** — `commands`에 항목을 더하고(`label`은 i18n 키), 필요하면 `MENUS`/`SUBMENUS`/`TOOLBAR`/오른쪽 클릭 메뉴에 id를 넣습니다. 단축키는 `key` 또는 `SHORTCUTS`, 그리고 `src/popup.js`의 `SHORTCUT_LIST`와 두 사용 설명서의 단축키 표(문서 테스트가 확인).
- **라이브러리 항목** — `src/library/parametric/<분류>.js`에 CONTRACT.md 형식으로. `test/unit/library.test.js`가 계약을 확인합니다.
- **재질** — `MATERIAL_PRESETS`에 추가하고, 텍스처가 필요하면 `textures`에 Poly Haven 세트 id를 적고 `npm run assets -- --only textures`.
- **문제 검사** — `engine/checks.js`에 `push(severity, code, entity, params)`, i18n에 `check.<code>`, 사용 설명서 15장 표.
- **문서 형식** — `normalizeProject`에서 기본값을 채워 예전 파일이 열리게 하고, CONTRACT.md를 갱신합니다.
