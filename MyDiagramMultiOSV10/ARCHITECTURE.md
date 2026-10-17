# MyDiagram 구조

이 문서는 코드를 고치거나 기능을 더하려는 개발자를 위한 것입니다. 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 한눈에

```
┌──────────────────────────── 메인 창 (label "main") ─────────────────────────────┐
│ src/app.js  메뉴 막대 · 툴바 · 탭 · 도형 패널 · 보기(src/views) · 속성 · 상태 표시줄 │
│   ├ domain/document.js  DiagramDocument: 드로잉 + 실행 취소 + 페이지별 연결선 경로  │
│   ├ render/svg.js  화면·내보내기·인쇄·썸네일이 함께 쓰는 SVG 렌더러               │
│   ├ ui/startpage.js · ui/tutorial.js · ui/background.js                          │
│   └ platform/popups.js  PopupHost: 팝업을 열고 결과·액션을 받음                    │
└──────────────┬───────────────────────────────────────────────┬──────────────────┘
               │ invoke (Tauri IPC) / emit · listen             │ localStorage + 메시지
┌──────────────▼──────────────────┐        ┌───────────────────▼────────────────────┐
│ src-tauri/src (Rust)            │        │ 팝업 창 (label "popup-<kind>")           │
│  lib.rs    명령 · 창 · 패닉 훅   │        │ src/popup.js (25종)                      │
│  instance.rs  단일 실행 잠금     │        │ settings about confirm error progress    │
│  files.rs  파일 입출력·진행률    │        │ recent print menu theme welcome image    │
│  db.rs     DB 저장(sqlx Any)     │        │ database shape data page layers find     │
│  fonts.rs  window_state.rs       │        │ document layout hyperlink design import  │
│  i18n.rs   (tr! 한/영 메시지)    │        │ stencil color prompt                     │
└─────────────────────────────────┘        └──────────────────────────────────────────┘
```

하나의 번들(`index.html` + `src/main.js`)이 모든 창을 맡습니다. `main.js`는 창 라벨(데스크톱) 또는 `?popup=<kind>`(웹·튜토리얼 프레임)를 보고 `app.js` 또는 `popup.js`를 불러옵니다. 첫 그리기 전에 설치 후 초기화(`resetForNewInstall`), 테마와 글꼴을 적용해 창이 잘못된 색으로 깜빡이지 않습니다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/domain/` | UI와 무관한 순수 로직 (Node에서 단위 테스트) |
| `├ diagram.js` | 문서 모델과 모든 편집: 페이지·레이어·안내선, 도형 추가·삭제·이동·크기·회전·대칭, 그룹, 맞춤·분배·순서, 스타일, 도형 데이터, 복사/붙여넣기, 찾기·바꾸기, 통계, 단위 변환 |
| `├ stencils.js` | 스텐실 15종(`CATEGORIES`)과 도형 마스터 210개(`MASTERS`): 모양 함수, 연결점, 텍스트 상자, 조절 핸들, 기본 스타일 |
| `├ designs.js` | 디자인 16가지 × 변형 4가지, 빠른 스타일, 스타일 키·화살촉·선 패턴 목록, `resolveShapeStyle` / `resolveConnectorStyle` |
| `├ routing.js` | 연결선 끝 결정(점 고정·동적 연결), 직각 경로(A*), 직선·곡선, 선 건너뛰기, 붙일 대상 찾기(`glueTarget`) |
| `├ layout.js` | 자동 레이아웃 7가지(순서도 TB/LR, 계층 TB/LR, 방사형, 원형, 격자) |
| `├ interop.js` | Visio `.vsdx` 읽기/쓰기(자체 ZIP·XML), HTML 내보내기, 도형 데이터 CSV, 데이터 연결, 데이터로 조직도, 목록으로 도형 |
| `├ format.js` | `.mdg`/`.mdgt` 직렬화·파싱·복구(`normalizeDocument`), 파일 이름 판별 |
| `├ document.js`, `history.js` | 열린 드로잉(탭) 하나: 경로, 변경 여부, 보기 상태, 경로 캐시, 스냅샷 실행 취소 |
| `├ templates.js` | 템플릿 13종과 예제·튜토리얼 드로잉(한/영, 일반 편집 함수로 빌드) |
| `├ geometry.js`, `path.js` | 평면 기하(회전, 경계 상자, 선분 교차, 경로 문자열), SVG 경로 파싱·변환(호 → 베지어) |
| `├ xml.js`, `csv.js` | DOM 없는 XML 읽기(Visio·SVG), RFC 4180 CSV/TSV |
| `├ fields.js` | 도형 시트·도형 데이터 표의 열(읽기·표시·쓰기) |
| `├ settings.js`, `recent.js` | 설정 기본값·검증·저장(localStorage), DB 연결 설정, 설치 후 초기화, 최근 파일·폴더 10개 |
| `src/render/svg.js` | 도형·텍스트(줄바꿈·필드·구획)·연결선(화살촉·건너뛰기·레이블)·배경 페이지를 SVG로, `renderPageSvg`, 마스터 아이콘 |
| `src/views/` | `canvas.js`(드로잉 보기), `pages.js`(페이지 개요), `sheets.js`(도형 시트·도형 데이터), `reports.js`(도형 보고서와 `reportModel`) |
| `src/ui/` | `grid.js`(가상 스크롤 편집 표), `startpage.js`, `tutorial.js`(CHAPTERS · STEPS), `background.js`(움직이는 배경 20종), `axes.js`(차트 눈금), `dom.js` |
| `src/print/render.js` | 인쇄용 SVG 용지(맞춤·실제 크기·배율 나눠 찍기, 머리글·바닥글, 테마와 무관한 흰 바탕) |
| `src/export/` | `image-encode.js`(BMP·TIFF 인코더, 그림 크기), `report-export.js`(보고서 HTML·Markdown·Word, ZIP 작성기), `report-pdf.js`(JPEG 쪽 → PDF) |
| `src/platform/native.js`, `idb.js` | 플랫폼 경계: 데스크톱은 Rust 명령, 웹은 브라우저 API(File System Access·내려받기·IndexedDB) |
| `src/platform/popups.js` | 팝업 열기/닫기/메시지, 팝업 크기 표(`POPUPS`) |
| `src/app.js` | 메인 창: 명령 표(`commands`), `MENUS`, `SUBMENUS`, `TOOLBAR`, 오른쪽 클릭 메뉴, `SHORTCUTS`, 파일·내보내기·DB 처리 |
| `src/popup.js` | 모든 팝업 창과 `SHORTCUT_LIST` |
| `src/i18n/ko.js`, `en.js`, `i18n.js` | UI 문자열(키는 두 파일이 같음) |
| `src/themes.js`, `icons.js`, `flags.js`, `stepper.js` | 테마(다크 20·라이트 20·시스템·사용자 정의), SVG 아이콘, 국기, `[−] 값 [+]` 숫자 입력 |
| `src-tauri/` | Rust 백엔드, `tauri.conf.json`(번들·파일 연결·리소스), `windows/hooks.nsh`, `linux/`(MIME·postinst), `Info.plist` |
| `scripts/` | `test.mjs`(테스트 러너), `build.mjs`(설치 파일), `start.mjs`, `build-docs.mjs`(문서 HTML), `render-icons.mjs`, `make-samples.mjs`, `tutorial-capture.mjs` |
| `test/` | `unit/`(도메인·내보내기), `static/`(패키징·문서), `e2e/`(`cdp.mjs`, `harness.mjs`, `web.harness.mjs`, 스위트), `db_integration.rs` |
| `docs/` | 생성된 HTML 설명서, `tutorial/`(튜토리얼 문서·그림) |
| `samples/` | 예제 드로잉(`*.ko.mdg`, `*.en.mdg`, `online-shop.*.vsdx`, `brainstorm-template.*.mdgt`) — 설치 파일에 포함 |

## 드로잉 엔진

좌표는 모두 **페이지 픽셀**(96 dpi, y는 아래로, 각도는 시계 방향 도)입니다. 표시 단위(mm · cm · in · pt · px)는 `toUnit`/`fromUnit`/`formatLength`로 바꿀 뿐 저장값은 픽셀입니다.

### 1. 문서 모델

문서는 `pages`를 갖고, 페이지는 `layers` · `guides` · `shapes`(z 순서, 앞쪽이 뒤)를 갖습니다.

| 종류 | 필드 |
|---|---|
| 2-D 도형 | `{ type: 'shape', master, x, y, w, h, angle, flipH, flipV, text, style, qs, params, data, layers, locked, hyperlink, comments, groupId }` |
| 그룹 | `{ type: 'group', x, y, w, h, … }` — 구성원은 `groupId`를 가짐, 상자는 `refreshGroups`가 다시 계산 |
| 연결선 | `{ type: 'connector', from, to, route, waypoints, textPos, text, style }`. 끝은 붙음(`{ id, pt }`: `pt` = 연결점 번호 또는 `'auto'`) 또는 자유(`{ x, y }`) |

페이지는 크기·용지·방향·`autoSize`·색·눈금과 `background`(배경 페이지 여부)·`backgroundId`(깔리는 배경 페이지)를 가집니다. 문서는 디자인(`design`, `variant`), 단위, 속성(제목·작성자·회사…), `options`(선 건너뛰기 · 도형 피하기 · 눈금/도형/안내선에 맞추기 · 붙이기 · 데이터 그래픽 · 기본 연결선 종류), 열린 스텐실 목록을 가집니다. `diagram.js`의 함수는 문서를 제자리에서 바꾸고, 앱은 각 편집을 `apply`로 감싸 실행 취소 한 단계로 만듭니다.

### 2. 도형 마스터 (`stencils.js`)

마스터는 `m(id, cat, w, h, ko, en, geometry, extra)`로 정의합니다.

| 항목 | 뜻 |
|---|---|
| `geometry(w, h, params, rounding)` | 도형 좌표의 부품 `[{ d, fill }]`. `fill`: `main`(채우기+선), `none`(선만), `dark`/`light`(채우기 음영), `stroke`(선 색으로 채움) |
| `points` | 연결점, 상자 기준 정규화 `[x, y]` (기본: 네 변의 가운데) |
| `text` | 텍스트 상자 `[왼, 위, 오른, 아래]` (도형 밖도 가능), `compartments`면 `---` 줄로 머리글+구획(UML 클래스, 엔터티) |
| `params` | 노란 조절 핸들 `{ key: { def, handle(w,h,v), from(w,h,x,y) } }` |
| `style`, `qs`, `aspect`, `kind` | 기본 스타일·빠른 스타일 변형, 비율 고정, `container` · `text` · `lineShape` · `annotation` 같은 성격(경로 탐색·레이아웃에서 제외) |

Visio에서 가져온 도형과 자유형은 자기 윤곽(`points`, 경로)을 직접 가집니다.

### 3. 디자인과 빠른 스타일 (`designs.js`)

스타일은 **디자인 → 빠른 스타일 → 마스터 기본값 → 도형 자신의 값** 순서로 합쳐집니다(`resolveShapeStyle`). 도형은 사용자가 직접 바꾼 값만 `style`에 가지므로, 디자인이나 변형을 바꾸면 손대지 않은 도형이 모두 따라갑니다. 빠른 스타일(`qs`)은 강조색 1~6과 변형(`fill` · `subtle` · `outline` · `intense` · `gradient` · `none`)입니다. 연결선은 디자인의 연결선 색·두께와 끝 화살표를 기본으로 씁니다. 청사진 · 자정 · 칠판은 어두운 페이지 디자인입니다.

### 4. 연결선 경로 (`routing.js`)

- **끝**: 연결점에 붙은 끝은 그 점이 있는 변에서 곧게 나갑니다(회전 포함). 동적 연결(`'auto'`)은 서로 마주 보는 점 쌍을 고르고, 양 끝이 동적이면 한 번 더 맞춥니다.
- **직각**: 양 끝에서 16px 나간 점 사이를, 장애물(붙은 도형, `avoidShapes`면 근처 다른 도형; 12px 여유) 모서리로 만든 성긴 격자 위에서 **A***로 찾습니다. 상태는 (격자점, 들어온 방향)이고 꺾일 때마다 벌점 30을 더합니다. 길이 없으면 단순한 ㄱ자. 컨테이너·텍스트·선 도형과 숨은 레이어는 장애물이 아닙니다.
- **꺾임점**(`waypoints`)이 있으면 자동 경로 대신 점마다 직각으로 잇고, 곡선은 Catmull-Rom → 베지어, 직선은 그대로 잇습니다.
- **선 건너뛰기**: `routePage`가 z 순서대로 경로를 만들며, 먼저 그린 연결선과의 교차점(끝에서 6px 이상)을 `jumps`로 남깁니다. 경로는 `DiagramDocument.routes(page)`에 캐시되고 편집마다 지워집니다.

### 5. 자동 레이아웃 (`layout.js`)

최상위 도형(그룹은 한 덩어리)만 옮기고 컨테이너·텍스트·선 도형은 그대로 둡니다. 순서도는 순환을 끊고(DFS 역방향 간선 뒤집기) 최장 경로로 층을 나눈 뒤 무게중심으로 정렬합니다. 계층은 트리, 그 밖에 방사형·원형·격자. 옮긴 도형에 붙은 연결선은 꺾임점을 지워 다시 경로를 찾고, 계층 레이아웃은 끝을 동적 연결로 바꿉니다.

### 6. SVG 렌더러 (`render/svg.js`)

드로잉 보기, SVG·그림·PDF·HTML 내보내기, 인쇄, 페이지 썸네일, 스텐실 아이콘이 모두 같은 함수로 그리므로 화면과 결과물이 같습니다. `pageBody`는 배경 페이지를 먼저 그리고, 보이는(인쇄 시 인쇄하는) 레이어의 도형과 연결선을 그립니다. 텍스트는 넘겨받은 `measure`(앱: 캔버스, Node: 추정)로 줄을 나누고, `{page}` · `{pages}` · `{pageName}` · `{title}` · `{date}` · `{data:키}` 같은 필드를 펼칩니다. 순수 함수라 Node에서도 돕니다.

### 7. 드로잉 보기 (`views/canvas.js`)

`CanvasView`는 페이지·눈금·자·안내선·페이지 나누기와 선택 손잡이를 그리고, 마우스 조작(선택·영역 선택, 이동과 맞추기, 크기·회전, 조절 핸들, 연결선 끝 붙이기·꺾임점, 그리기 도구, 자동 연결 화살표, 제자리 텍스트 편집, 확대·이동, 이동 및 확대/축소 창, 페이지 탭)을 처리합니다. 끄는 동안은 문서를 바로 바꾸고(`setBoxLive` 등) 놓을 때 `commitShapes`로 실행 취소 한 단계를 만듭니다.

### 8. 내보내기·인쇄·보고서

- **그림**: `renderPageSvg`(페이지·내용·선택 영역) → 캔버스 → PNG/JPEG/WebP, BMP·TIFF는 `image-encode.js`가 직접 인코딩, SVG는 그대로. 한 변 16 000px 제한.
- **PDF**: 인쇄 레이아웃(`renderPrintSheets`)의 각 용지를 150 dpi JPEG로 그려 `pdfFromJpegs`로 묶습니다(한국어 글꼴 내장 불필요).
- **보고서**: `reportModel`이 순수 데이터(kpi · 막대 · 도넛 · 표 · 메모 블록)를 만들고, 보기와 HTML·Markdown·Word·PDF 내보내기가 같은 모델을 씁니다.

## 문서와 실행 취소

- 편집은 모두 `app.js`의 `change(labelKey, mutate)` → `DiagramDocument.apply(label, change)`를 거칩니다. 바꾸기 전 문서를 JSON 스냅샷으로 `History`에 넣고(최대 200), 바뀐 것이 없으면 기록하지 않습니다. 실행 취소/다시 실행은 스냅샷을 맞바꿉니다. 실행 취소 항목의 이름(`op.*`)은 툴팁과 상태 표시줄에 쓰입니다.
- `dirty`는 저장 시점 스냅샷과 비교합니다. 템플릿에서 연 탭(`fromTemplate`)은 **저장**할 때 새 이름을 묻습니다.
- 탭마다 보기 상태(`view`: 보기 id, 현재 페이지, 확대, 스크롤, 보고서, 필터, 맞춤)를 따로 가집니다.
- 연결선 경로는 페이지별로 한 번 계산해 캐시하고, 끄는 중처럼 문서 밖에서 바뀌면 `invalidateRoutes`로 버립니다.

## 파일 형식

| 형식 | 구현 | 내용 |
|---|---|---|
| `.mdg` | `format.js` | `{ format: "mydiagram", version: 1, kind: "drawing", saved, document }` |
| `.mdgt` | `format.js` | 같은 형식, `kind: "template"`. 내용은 그대로(시작점) |
| Visio `.vsdx` | `interop.js` | 쓰기: 페이지, 도형(모양은 상대 베지어 행), 텍스트, 채우기·선, 회전·대칭, 도형 데이터(Property), 하이퍼링크, 레이어, 그림(ForeignData), 연결선과 Connects. 읽기: 같은 것에 마스터·스타일 시트·그룹·고전 형상 행(호·타원 …). `.vstx`는 템플릿으로 열림. ZIP은 `DecompressionStream`으로 풂 |
| HTML | `interop.js` | 모든 페이지를 인라인 SVG로 담은 웹 페이지 하나 |
| CSV | `interop.js`, `csv.js` | 내보내기: 도형 데이터, UTF-8 BOM, CRLF. 가져오기: 구분자 자동 감지, RFC 4180, ID·이름·텍스트로 도형 찾기, 조직도(이름·직함·상사) |
| 클립보드 | `diagram.js`, `app.js` | 앱 안 복사는 `mydiagram/shapes` 표시가 붙은 도형 묶음(메모리, 사이 연결선 유지), OS 클립보드에는 도형 텍스트. 다른 프로그램의 텍스트는 줄마다 도형 |

읽기는 고칠 수 있는 것을 고치고(빠진 필드 기본값, 모르는 마스터는 사각형, 없는 도형에 붙은 연결선 끝은 자유 끝, 없는 그룹의 구성원은 풀기, 빈 그룹·중복 id 정리) 드로잉이 아닌 것은 `FormatError`(`format.notJson`, `format.notDiagram`, `format.newer`)로 거절합니다. 오류 코드는 UI에서 번역됩니다.

## 팝업

- **데스크톱**: 팝업은 `open_popup`으로 만드는 OS 창(label `popup-<kind>`, `POPUP_KINDS`에 있는 것만)이며 메인 창에 소유됩니다. 메인 창 밖에 둘 수 있고, 메인 창이 없어지면(`Destroyed` → `app.exit(0)`) 함께 닫힙니다. 각 팝업은 `POPUPS` 표의 고정 크기이고 내용이 스크롤 없이 들어갑니다(긴 내용은 탭이나 쪽으로 나눔). 그린 뒤 `popup_ready`/`place_popup`으로 보여 빈 창이 깜빡이지 않습니다.
- **웹과 튜토리얼 중**: 같은 페이지를 `index.html?popup=<kind>` 프레임으로 메인 창 안에 띄우고 `postMessage`를 씁니다(`PopupHost.useFrames`). 튜토리얼은 화면 녹화에 팝업이 찍히도록 데스크톱에서도 프레임을 씁니다.
- 매개변수는 모든 창이 공유하는 `localStorage`의 `mydiagram.popup.<kind>`로 넘기고, 팝업은 `result`(닫으며 결과) · `action`(열린 채로 메인 창에 요청: 찾기, 배경 고르기, 최근 파일 열기, DB 시험 …) · `ready` · `place` · `close` · `hide` · `drag` 메시지로 답합니다.
- **메뉴**는 `menu` 팝업 하나를 재사용합니다. 시작 후 미리 만들어 두고(prewarm), 내용을 그린 뒤 크기를 재서 모니터 작업 영역 안에 놓습니다(아래 공간이 없으면 위로). 숨겼다가 다시 씁니다(`hide_popup`). 색 고르기(`color`)와 테마 목록(`theme`)도 포커스를 잃으면 닫히는 드롭다운 팝업입니다.
- 설정 팝업이 설정을 바꾸면 `localStorage`의 `storage` 이벤트로 메인 창이 다시 적용합니다.
- 도형 서식·페이지 설정·레이어·도형 데이터·디자인 같은 편집 팝업은 받은 데이터의 사본(draft)을 고치고 **확인**할 때 한 번에 돌려주므로 실행 취소 한 단계가 됩니다.

## 플랫폼 경계

`src/platform/native.js`만 플랫폼을 압니다.

| 기능 | 데스크톱 (Rust 명령) | 웹 |
|---|---|---|
| 파일 열기/저장 | `read_text_file`, `write_text_file`, `read_base64_file`, `write_base64_file` (청크 단위 진행률 `io-progress`, 임시 파일에 쓰고 rename), `paths_exist` | File System Access(핸들은 IndexedDB에 보관), 없으면 `<input>`·내려받기 |
| 대화 상자 | `tauri-plugin-dialog` | 브라우저 파일 선택 |
| 배경 이미지 | `import_background`로 데이터 폴더에 복사, asset 프로토콜로 표시(`allow_background`, `remove_background`) | IndexedDB |
| 글꼴 목록 | `list_fonts`(fontdb) | `queryLocalFonts`(허락될 때) |
| 클립보드 | `clipboard_write`, `clipboard_read`(arboard) | `navigator.clipboard` |
| 문서·링크 열기 | `open_document`(설치 폴더 `docs/`), `open_external` | `window.open('./docs/…')` |
| 예제·시작 파일 | `sample_files`, `startup_files`(명령줄의 .mdg/.mdgt/.vsdx/.vstx) | 내장 예제 |
| 데이터베이스 | `db_test`, `db_save`, `db_load`, `db_list`, `db_delete` | — (메뉴에 없음) |
| 인쇄 | `print_window`(팝업 창의 OS 인쇄) | `window.print` |
| 언어 | `set_language`(백엔드 메시지 `tr!`) | — |

Rust 쪽 메시지는 모두 `tr!("한국어", "English")`로 두 언어를 가집니다. WebView2는 같은 프로필의 모든 웹뷰가 같은 인자를 써야 하므로 `BROWSER_ARGS` 상수 하나를 쓰고, 창을 만드는 명령은 async여야 합니다(동기 명령은 Windows에서 교착).

### 창

메인 창은 처음엔 숨겨 두었다가 첫 화면을 그린 뒤 보입니다. 제목은 `MyDiagram v<버전>`, 기본 크기 1480×900, 최소 크기는 1000×600이며, 툴바가 다 보이는 폭보다 좁아지지 않게 `setMinimumSize`를 갱신합니다. 위치·크기·최대화는 `window_state.rs`가 설정 폴더의 JSON에 저장합니다(쓰고 rename, 보이지 않는 모니터 위치는 버림).

### 심각한 오류

Rust 패닉 훅이 메시지·위치·스레드·백트레이스를 데이터 폴더의 `crash.log`에 덧붙이고 `fatal-error` 이벤트로 메인 창에 보내면, 오류 팝업(**심각한 오류 (백엔드)**)이 전부 표시하고 복사할 수 있게 합니다. JS 쪽 오류는 `showError`가 같은 오류 팝업으로 보냅니다(명령 실행, 팝업 렌더링 오류는 `report-error` 액션).

## 데이터베이스

`db.rs`: sqlx `Any` 드라이버로 SQLite · MariaDB · MySQL · PostgreSQL에 저장합니다. 테이블은 하나(`mydiagram_drawings (id, title, data, updated)`, 처음 쓸 때 생성)이고 `data`는 `.mdg` 파일 내용 그대로라 DB에서 읽은 드로잉은 파일처럼 열립니다. 저장은 한 트랜잭션으로 행을 바꿉니다. PostgreSQL은 자리표시자를 `$1…`로 바꿉니다. 연결 설정은 **설정 › 데이터베이스**(`settings.js`의 `dbConfig`/`dbProblems`)에 있고, 비밀번호는 저장을 고르지 않으면 이번 실행에만 기억합니다. DB가 설정되어 있으면 **저장**이 파일과 DB에 함께 씁니다. 오류 문구에는 비밀번호를 넣지 않습니다.

## 단일 실행 잠금

`instance.rs`: 시작할 때 임시 폴더의 `mydiagram-<사용자>.lock`에 OS 파일 잠금(`try_lock`)을 겁니다. 이미 잠겨 있으면 시스템 언어로 "이미 실행 중" 오류 상자(`rfd`)를 보이고 종료 코드 3으로 끝납니다. 잠금은 프로세스가 끝나면(비정상 종료 포함) OS가 풀어 주므로 낡은 잠금 파일이 다음 실행을 막지 않습니다. 두 번째 실행에 넘긴 파일은 열리지 않습니다(전달 없음).

## 설치 프로그램 훅

`src-tauri/windows/hooks.nsh` (UTF-8 BOM 유지 — 아니면 NSIS가 한국어를 ANSI로 읽음):

| 훅 | 하는 일 |
|---|---|
| `NSIS_HOOK_PREINSTALL` | 이전 설치의 `uninstall.exe /S`를 기다려 실행하고, 폴더 이름이 제품 이름이면 폴더째 삭제 |
| `NSIS_HOOK_POSTINSTALL` | `%APPDATA%\com.shkwon.mydiagram\install-reset`에 토큰을 쓰고 `window-state.json`을 지움 → 다음 실행에 `window_state.rs`가 토큰을 넘기고 `resetForNewInstall`이 설정만 기본값으로(최근 파일·폴더, 세션, 내 도형, DB 연결, 배경 이미지, 튜토리얼 기록은 유지). `MyDiagram.Drawing` / `MyDiagram.Template`의 `DefaultIcon`을 `drawing.ico` / `template.ico`로, 시작 메뉴에 `MyDiagram User's Guide.lnk`(→ `docs\UsersGuide.html`), 셸에 연결 변경 알림 |
| `NSIS_HOOK_POSTUNINSTALL` | 설명서 바로 가기 삭제 |

`tauri.conf.json`: 현재 사용자 설치, 언어 선택(Korean/English), `.mdg`/`.mdgt` 파일 연결, 리소스로 문서 아이콘·`docs/`(HTML 설명서·튜토리얼·그림·`UsersGuide.md`·`README.md`)·`samples/`. Linux deb/rpm은 `linux/mydiagram.xml` MIME과 문서 아이콘을 설치합니다.

## 문서 생성

- `scripts/build-docs.mjs`: 의존성 없는 Markdown → HTML 변환기. `UsersGuide.md` · `UsersGuide.en.md` · `docs/tutorial/README*.md`를 `docs/*.html`로 만들고(목차, 밝은/어두운 색, 표·코드·그림), 그림 경로를 `docs/` 기준으로 고친 뒤 `public/docs/`에 복사합니다(웹 빌드가 `./docs/`로 제공).
- 튜토리얼 캡처(`npm run tutorial:docs` / `tutorial:video`)는 `STEPS`(src/ui/tutorial.js) 순서대로 `docs/tutorial/images/NN-<id>.jpg`를 만들고, 사용 설명서는 그 이름으로 그림을 참조합니다. 단계를 더하거나 빼면 번호가 바뀌므로 설명서의 그림 참조도 함께 고칩니다.
- `scripts/make-samples.mjs`는 `templates.js`의 `SAMPLE_FILES`로 `samples/`를 다시 만들고(옛 예제는 먼저 지움), `scripts/render-icons.mjs`는 `assets/*.svg`를 헤드리스 Edge/Chrome으로 그려 앱·문서 아이콘과 설치 프로그램 그림을 만듭니다.

## 테스트

`npm test`(`scripts/test.mjs`)가 분류별로 실행하고 결과를 표로 정리해 `test-results/results.json`에 씁니다.

| 분류 | 내용 |
|---|---|
| JS 단위 | `test/unit/*.test.js` — 문서·편집 연산, 파일 형식과 복구, 설정·최근 기록, 번역 키, 테마, 아이콘, 축, 그림 인코딩, 보고서 내보내기 |
| 패키징/아이콘 | `test/static/` — 설치 설정·훅·파일 연결·아이콘, 문서(`docs.test.js`: HTML·링크·그림·README 빌드 명령·단축키 표) |
| Rust 단위 | `cargo test --lib` — 파일 입출력·진행률, 글꼴, 창 위치, 단일 실행 잠금, DB URL·SQLite |
| DB 통합 | `cargo test --test db_integration` — `test/db.local.json`의 MariaDB/MySQL(없으면 건너뜀), 임시 PostgreSQL 서버 |
| E2E 웹 | 웹 빌드를 헤드리스 Edge/Chrome으로 조작 (`test/e2e/web.harness.mjs`, `web.suite.mjs`, CDP) |
| E2E 데스크톱 GUI | 실제 앱을 띄워 메뉴·툴바·팝업·파일·인쇄·오류 팝업을 조작 (`test/e2e/harness.mjs`, `desktop.suite.mjs`, WebView2 CDP + Win32) |
| 튜토리얼 | 모든 단계가 오류 없이 대상 요소를 그리는지 |
| 설치 프로그램 | `--installer`일 때 `npm run build:win` 후 NSIS 설치 파일 검사 |

### E2E 훅

| 훅 | 쓰임 |
|---|---|
| `window.__mydiagram` | 메인 창: `state`, `t`, `commands`, `run(id)`, `popups`, `api`, `debug()`, `actions`(newDrawing · openPath · saveDoc · select · change · undo/redo · dropMaster · connectShapes · switchView · layoutPage · exportAs · findNext …), `domain`(D · TEMPLATES · MASTERS · CATEGORIES · LAYOUTS …), `tutorial()` |
| `window.__mydiagramPopup` | 팝업 창: `kind`, `state`, `render`, `close`, `errorReport`, `printLayout`, `refresh`, `applyFormat` / `applyPageSetup` |
| `window.__mydiagramPrintHook` | 있으면 OS 인쇄 대신 인쇄 레이아웃을 넘겨받음 |
| `globalThis.__MYDIAGRAM_NO_WELCOME`, URL `?nowelcome` | 첫 실행 환영 창 생략 |

### 환경 변수 (Rust)

| 변수 | 효과 |
|---|---|
| `MYDIAGRAM_MULTI` | 단일 실행 잠금을 건너뜀(여러 복사본 동시 실행, `npm start`도 씀) |
| `MYDIAGRAM_LOCK_DIR` | 잠금 파일 폴더(기본: 임시 폴더) |
| `MYDIAGRAM_ALREADY_RUNNING_FILE` | "이미 실행 중" 문구를 메시지 상자 대신 이 파일에 씀 |
| `MYDIAGRAM_CONFIG_DIR` | 창 위치 파일 폴더(사용자 것을 건드리지 않게) |
| `MYDIAGRAM_DATA_DIR` | 데이터 폴더(배경 이미지, crash.log) |
| `MYDIAGRAM_IO_DELAY_MS` | 파일 청크마다 지연 — 진행 팝업 확인용 |
| `MYDIAGRAM_TEST_COMMANDS` | `raise_test_panic` 명령 허용(심각한 오류 팝업 확인) |
| `MYDIAGRAM_OPEN_LOG` | 문서·링크를 여는 대신 경로를 이 파일에 기록 |
| `MYDIAGRAM_NO_OPEN` | 문서·링크를 열지 않음 |
| `MYDIAGRAM_TEST_MYSQL_URL`, `MYDIAGRAM_TEST_POSTGRES_URL` | DB 통합 테스트 서버(`test/db.local.json` 대신) |

WebView2의 CDP 포트와 사용자 데이터 폴더는 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, `WEBVIEW2_USER_DATA_FOLDER`로 테스트마다 따로 잡아 사용자의 설정·최근 기록을 건드리지 않습니다.
