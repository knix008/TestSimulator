# MyUMLMaker 구조

이 문서는 코드를 고치거나 기능을 더하려는 개발자를 위한 것입니다. 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 한눈에

```
┌──────────────────────────── 메인 창 (label "main") ──────────────────────────────┐
│ src/app.js  메뉴 막대 · 툴바 · 다이어그램 탭 · 도구 상자 · 다이어그램 편집기 ·        │
│             모델 탐색기 · 편집기(속성·스타일·설명·태그) · 상태 표시줄                 │
│   ├ domain/document.js  ProjectDocument: 프로젝트 + 실행 취소 + 보기 상태 (하나만)    │
│   ├ domain/model.js · meta.js  모델 트리(StarUML .mdj 구조)와 메타모델              │
│   ├ render/notation.js  화면·내보내기·인쇄·썸네일·문서가 함께 쓰는 SVG 렌더러         │
│   ├ views/diagram.js · ui/explorer.js · ui/editors.js · ui/startpage.js · tutorial │
│   └ platform/popups.js  PopupHost: 팝업을 열고 결과·액션을 받음                     │
└──────────────┬────────────────────────────────────────────────┬──────────────────┘
               │ invoke (Tauri IPC) / emit · listen              │ localStorage + 메시지
┌──────────────▼──────────────────┐         ┌───────────────────▼────────────────────┐
│ src-tauri/src (Rust)            │         │ 팝업 창 (label "popup-<kind>")           │
│  lib.rs    명령 · 창 · 패닉 훅   │         │ src/popup.js (23종)                      │
│  instance.rs  여러 실행 판별     │         │ settings about confirm error progress    │
│  files.rs  파일 입출력·진행률    │         │ recent print menu theme welcome image    │
│  db.rs     DB 저장(sqlx Any)     │         │ database find validation codegen         │
│  fonts.rs  window_state.rs       │         │ textimport color prompt requirements     │
│  i18n.rs   (tr! 한/영 메시지)    │         │ tracematrix document baselines compare   │
└─────────────────────────────────┘         └──────────────────────────────────────────┘
```

하나의 번들(`index.html` + `src/main.js`)이 모든 창을 맡습니다. `main.js`는 창 라벨(데스크톱) 또는 `?popup=<kind>`(웹·튜토리얼 프레임)를 보고 `app.js` 또는 `popup.js`를 불러옵니다. 첫 그리기 전에 설치 후 초기화(`resetForNewInstall`), 언어, 테마와 글꼴을 적용해 창이 잘못된 색으로 깜빡이지 않습니다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/domain/` | UI와 무관한 순수 로직 (Node에서 단위 테스트) |
| `├ meta.js` | 메타모델: 요소 타입 299개(`TYPES`, UML 2와 ERD · 순서도 · DFD · SysML · BPMN · C4 · 마인드맵 · 와이어프레임 · 클라우드 · 간트·WBS·타임라인 · ArchiMate · 네트워크 · JSON·YAML·EBNF·정규식), 다이어그램 38종(`DIAGRAM_TYPES`, `DIAGRAM_FAMILIES` 14계열), 요구사항 속성 값(`REQUIREMENT_KINDS` · `REQUIREMENT_STATUSES` · `REQUIREMENT_PRIORITIES` · `VERIFY_METHODS`), 타입별 필드(속성 패널을 만듦), 자식이 들어갈 컬렉션(`collectionFor`), 모델 없는 주석 뷰(`VIEW_ONLY`), 뷰의 `shape` |
| `├ model.js` | 프로젝트 트리와 모든 모델 편집: id(`newId`), `$ref` 참조, 색인(`buildIndex`), 요소·다이어그램 추가/삭제/이동, 관계 끝, 뷰 생성(`createNodeView`/`createEdgeView`), 찾기, 통계, 복제(`cloneWithNewIds`) |
| `├ edit.js` | 모델과 뷰를 함께 바꾸는 편집: 도구로 요소+뷰 만들기(알맞은 소유자 찾기), 두 뷰 사이 관계 그리기, 기존 요소 보이기, 관련 클래스 빠른 추가(`RELATED`), 이동·맞춤·분배·같은 크기·순서, 패키지에 놓으면 소유자 바꾸기 |
| `├ toolbox.js` | 다이어그램 종류별 도구 상자(`TOOLBOX`, 38종): 노드·간선·주석 도구. `DIAGRAM_TABS`(다이어그램 종류 탭의 묶음 14개 — UML 구조 · UML 행위 · ER · 순서도 · 데이터 흐름 · SysML · BPMN · C4 · 마인드맵 · 와이어프레임 · 클라우드 · 프로젝트 · ArchiMate · 데이터 — 와 그 종류, 모든 종류가 정확히 한 묶음에)와 `diagramTabOf(type)` |
| `├ labels.js` | UML 표기 문자열(`+ name: Type [0..*] = 1`, 오퍼레이션 서명, «스테레오타입», 메시지·전이 레이블)과 그 역(빠른 편집 입력 → 필드: `parseAttribute`, `parseOperation`) |
| `├ layout.js` | 자동 레이아웃(층 배치, 방향 `TB`/`BT`/`LR`/`RL`, 일반화는 위로)과 시퀀스 다이어그램 정리 |
| `├ validate.js` | 모델 검증 규칙 34개(`RULES`, 오류/경고, 한/영 메시지 — 날짜·기간·데이터 문법, 요구사항 충족·검증·ID 중복, ERD 중복 열·엔터티·열 타입·외래 키 타입·관계의 외래 키 포함)와 `validate`(앱의 색인을 받아 다시 만들지 않음), `summarize`, `sqlTypeKey` |
| `├ problems.js` | 문제 패널: 검증 결과를 고칠 자리(경로·종류·보여 주는 다이어그램과 뷰)가 담긴 줄로 바꾸기(`problemRows`), 정렬·묶기·필터(심각도·현재 다이어그램·글자)·개수, 다이어그램 표시(`problemsByView`), 두 번 누를 때 갈 필드(`problemField`) |
| `├ planning.js` | 간트 차트·타임라인의 날짜 계산: 날짜 ↔ 일 번호, 쉬는 요일·날짜, 작업일 기간, 일정(`schedule`: 자기 시작일 → 선행 작업이 끝나는 날 → 프로젝트 시작) |
| `├ archimate.js` | ArchiMate 3 계층별 요소(`ARCHIMATE_LAYERS`, `ARCHIMATE_ELEMENTS`, `kind` = "<계층>-<이름>", PlantUML 스프라이트 이름)와 색·모양, 관계 11종(`ARCHIMATE_RELATIONS`) |
| `├ datatext.js` | 데이터 다이어그램의 글: JSON·YAML 파싱과 나무 표 행(`parseData`, `dataRows`), EBNF 규칙·정규식 → 철도 다이어그램 나무(`railroadOf`) |
| `├ trace.js` | 요구사항 관리와 추적: 요구사항 목록(`requirementRows`, 충족·검증·파생 수), 충족 범위(`coverage`)와 검증 문제(`coverageProblems`, 승인·구현·검증됨이고 하위 요구사항 없는 것만), 관계 매트릭스(`matrix`)와 칸 편집(`toggleRelation`), CSV/TSV. 요구사항 ID 자동 번호는 `model.js`의 `nextRequirementId`(`REQ-001` …) |
| `├ baseline.js`, `diff.js` | 기준선: `project.baselines`에 `{ _id, name, note, date, scopeId, scopeName, elements, snapshot }`(snapshot은 기준선을 뺀 모델의 JSON 글이라 id가 현재 모델과 부딪히지 않음), 만들기·삭제·`.myuml`로 내보내기·요소 복원(`restoreElement`). `diff.js`는 두 모델을 id로 맞춰 추가·삭제·변경(필드·관계 끝·다이어그램 뷰)을 구하고 `diffTree`로 소유자를 포함한 들여쓴 행을 만듦 |
| `├ report.js` | 문서 생성: 템플릿 5종(`REPORT_TEMPLATES`: full · requirements · design · usecase · data)과 구성 항목(`REPORT_SECTIONS`)으로 표지·목차·제목·문단·표·그림·쪽 나눔 블록 목록을 만듦(한/영). `export/docx.js` · `export/report-pdf.js` · HTML 작성기가 파일로 바꿈 |
| `├ docs.js` | 모델 문서: HTML 한 페이지(탐색 트리, 요구사항 표, 요소별 절, 인라인 SVG 다이어그램, 검색)와 Markdown |
| `├ codegen/` | 코드 생성: `index.js`(`generateCode`, 공통 컨텍스트, `CODE_LANGUAGES`, `DEFAULT_CODEGEN_OPTIONS`)와 `java.js` · `csharp.js` · `cpp.js` · `python.js` · `typescript.js` · `kotlin.js` · `php.js` · `sql.js`(ERD → DDL, 방언 5가지) |
| `├ reverse/` | 역공학: `index.js`(`reverseEngineer`, 중립 기술 → 모델)와 파서 `java.js`(C 계열 공용 토크나이저·커서 포함) · `csharp.js` · `cpp.js` · `python.js` · `typescript.js` · `sql.js`(DDL → ERDDataModel) |
| `├ interop/` | `staruml.js`(`.mdj` 프로젝트·`.mfj` 조각 읽기/쓰기), `mermaid.js`(Mermaid ↔ 모델, 공용 중간 표현과 층 배치), `plantuml.js`(PlantUML ↔ 모델: 모든 UML 다이어그램과 마인드맵, 전처리기 `preprocessPlantUml`), `plantuml-more.js`(`@startgantt` · `@startwbs` · `@startchronology` · ArchiMate · `@startnwdiag` · `@startjson` · `@startyaml` · `@startebnf` · `@startregex` · `@startsalt`, `plantuml.js`가 먼저 물어봄), `xmi.js`(XMI 2.x 읽기·쓰기), `xml.js`(작은 XML 파서·작성기) |
| `├ format.js` | `.myuml`/`.mumlt` 직렬화·파싱·복구(`normalizeProject`, 예전 `.muml`도 프로젝트 파일로 읽음), 파일 이름 판별(`isStarUmlFileName`, `isXmiFileName`, `isFragmentFileName`, `isSourceFileName` …). 기준선은 `.myuml`에만 저장(템플릿에서는 뺌) |
| `├ document.js`, `history.js` | 열린 프로젝트 하나(한 번에 하나만 열림): 경로, 변경 여부, 색인 캐시, 최근에 연 다이어그램 순서(`view.open`)와 다이어그램별 확대·스크롤, 스냅샷 실행 취소 |
| `├ templates.js`, `templates-more.js` | 새 프로젝트 템플릿 21종(`TEMPLATES`)과 예제 "Online Shop"(다이어그램 38개, 한/영, 일반 편집 함수로 빌드, `SAMPLE_FILES`). `templates-more.js`는 간트 · WBS · 타임라인 · ArchiMate · 네트워크 · JSON · YAML · EBNF · 정규식 예제와 그 템플릿 |
| `├ cloud.js` | AWS · Azure · Google Cloud 서비스 목록과 그룹 종류(타일 색만, 공급자 그림 없음) |
| `├ settings.js`, `recent.js` | 설정 기본값·검증·저장(localStorage), DB 연결 설정, 설치 후 초기화, 최근 파일·폴더 10개 |
| `src/render/` | `notation.js`(뷰 상자, 시퀀스 기하, 선 경로와 UML 장식, SVG, `renderDiagramSvg`, `diagramThumbnail`, 다이어그램 색 구성 `DIAGRAM_THEMES`), `shapes.js`(`SHAPES`: `shape`마다 `size`/`draw`/`clip`, 135종 — `shapes-more.js`의 간트 막대·WBS·타임라인·ArchiMate·네트워크·JSON/YAML 나무 표·철도 다이어그램을 합침. 날짜를 따르는 뷰는 `place`가 위치를 정함), `text.js`(이스케이프, 폭 추정, 줄바꿈) |
| `src/views/diagram.js` | `DiagramView`: 다이어그램 편집기(마우스 조작 전부, 제자리 편집, 빠른 버튼, 확대·이동, 눈금자·격자, 다이어그램 종류 탭 `renderTypeTabs`) |
| `src/ui/` | `explorer.js`(`ModelExplorer`), `editors.js`(속성·스타일·설명·태그와 제약 패널), `startpage.js`, `tutorial.js`(`CHAPTERS` · `STEPS`), `background.js`(움직이는 배경 20종), `dom.js` |
| `src/print/render.js` | 인쇄용 SVG 용지(맞춤·실제 크기·배율 나눠 찍기, 머리글·바닥글, 테마와 무관한 흰 바탕) |
| `src/export/` | `image-encode.js`(BMP·TIFF 인코더, 그림 크기 제한), `files.js`(ZIP 작성기, base64, JPEG 쪽 → PDF), `docx.js`(Word 작성기: 스타일, 열 때 갱신되는 목차 필드, 표, PNG 그림, 쪽 번호), `report-pdf.js`(문서 블록 → A4 SVG 쪽, 앱이 JPEG로 그려 PDF로 묶음) |
| `src/platform/native.js`, `idb.js` | 플랫폼 경계: 데스크톱은 Rust 명령, 웹은 브라우저 API(File System Access · 내려받기 · IndexedDB) |
| `src/platform/popups.js` | 팝업 열기/닫기/메시지, 팝업 크기 표(`POPUPS`) |
| `src/app.js` | 메인 창: 명령 표(`commands`), `MENUS`, `SUBMENUS`, `TOOLBAR`, 오른쪽 클릭 메뉴, `SHORTCUTS`, 다이어그램 탭 줄(`renderTabs`), 프로젝트 바꾸기 전 확인(`confirmReplace`), 파일·가져오기·내보내기·코드 생성·역공학·DB 처리 |
| `src/popup.js` | 모든 팝업 창(요구사항 목록 · 추적 매트릭스 · 문서 생성 · 기준선 · 비교 포함)과 `SHORTCUT_LIST` |
| `src/i18n/ko.js`, `en.js`, `i18n.js` | UI 문자열(키는 두 파일이 같음) |
| `src/themes.js`, `icons.js`, `icons-uml.js`, `flags.js`, `stepper.js` | 테마(라이트 20·다크 20·시스템·사용자 정의), SVG 아이콘(모델 요소·다이어그램 아이콘은 `icons-uml.js`), 국기, `[−] 값 [+]` 숫자 입력 |
| `src-tauri/` | Rust 백엔드, `tauri.conf.json`(번들·파일 연결·리소스), `windows/hooks.nsh`, `linux/`(MIME·postinst·postrm), `Info.plist` |
| `scripts/` | `test.mjs`(테스트 러너), `build.mjs`(설치 파일), `start.mjs`, `build-docs.mjs`(문서 HTML), `render-icons.mjs`, `make-samples.mjs`, `tutorial-capture.mjs` |
| `.gitignore` | 의존성, 빌드·설치 결과, 튜토리얼 동영상, 테스트 결과, 로컬 DB 접속 정보를 저장소에서 뺌 (`package-lock.json` · `Cargo.lock`은 커밋) |
| `test/` | `unit/`(도메인·렌더링·내보내기), `conformance/`(StarUML · Enterprise Architect · PlantUML 기능 점검표), `static/`(패키징·문서), `e2e/`(`cdp.mjs`, `harness.mjs`, `web.harness.mjs`, 스위트, `align-check.mjs`, `clip-check.mjs`, `dialogs.ps1`), `db_integration.rs` |
| `docs/` | 생성된 HTML 설명서와 `tutorial/`(튜토리얼 문서·그림) — `npm run build:docs` / `tutorial:docs`가 만듦 |
| `samples/` | 예제(`online-shop.*.myuml`, `online-shop.*.mdj`, `shop-domain.*.mfj`, `class-model.*.mumlt`, `staruml-sample.mdj`) — 설치 파일에 포함 |

## 모델링 엔진

좌표는 모두 **다이어그램 픽셀**(y는 아래로)입니다. 노드 뷰는 `left` · `top` · `width` · `height`, 선 뷰는 꺾임점 `points`를 가집니다.

### 1. 모델과 뷰

프로젝트는 StarUML `.mdj`와 같은 요소 트리입니다.

```
{ _type: 'Project', _id, name, ownedElements: [ { _type: 'UMLModel', _id, _parent: { $ref }, name, ownedElements: [ … ] } ] }
```

| 종류 | 필드 |
|---|---|
| 요소 | `{ _type, _id, _parent: { $ref }, name, … }`. 자식은 타입별 컬렉션(`ownedElements`, `attributes`, `operations`, `literals`, `participants`, `messages`, `regions`, `vertices`, `nodes`, `edges`, `columns` …, `meta.js`의 `collectionFor`) |
| 참조 | `{ $ref: id }` (`ref` / `refId`). 타입 필드는 문자열이거나 분류자를 가리키는 참조 |
| 관계 | 엣지 타입(`TYPES[type].edge`): `source`/`target` 또는 연관 끝 `end1`/`end2`(`UMLAssociationEnd`, `ERDRelationshipEnd`) |
| 다이어그램 | 요소이기도 함. `ownedViews`에 뷰를 가짐 |
| 노드 뷰 | `{ _type: '<모델 타입>View', _id, model: { $ref }, left, top, width, height, fillColor, lineColor, … }` |
| 선 뷰 | `{ _type, _id, model, tail: { $ref }, head: { $ref }, points, lineStyle }`. 끝은 노드 뷰 또는 다른 선 뷰 |
| 주석 뷰 | 모델이 없는 뷰(`VIEW_ONLY`: 메모·메모 연결·텍스트·프레임·사각형·타원·하이퍼링크·그림·자유선·마인드맵 가지) |

뷰는 `model`로 요소를 가리키므로 한 요소를 여러 다이어그램에 보일 수 있습니다(모델 ≠ 뷰). **다이어그램에서 삭제**는 뷰만, **모델에서 삭제**(`removeElements`)는 요소와 모든 다이어그램의 뷰, 그 요소가 필요한 관계까지 지웁니다. 새 요소의 이름은 타입별 기본 이름에 번호를 붙여 형제 사이에서 겹치지 않게 합니다(`uniqueName`). 시퀀스 · 커뮤니케이션 · 타이밍 다이어그램은 인터랙션, 상태 머신은 영역, 액티비티 다이어그램은 액티비티처럼 다이어그램마다 정해진 소유자(`DIAGRAM_TYPES[…].owner`) 안에 요소가 들어갑니다(`ownerForNew`).

### 2. 메타모델 (`meta.js`)

타입은 `T(type, ko, en, { group, icon, shape, fields, edge, ends, container, namespace, … })`로 정의하고, 다이어그램은 `Dg(type, ko, en, family, icon, { owner })`입니다. 필드는 `F(key, type, extra)`(`string`, `bool`, `enum`, 참조 …)이고 속성 패널(`ui/editors.js`)이 이 정의로 그려지므로 새 타입은 항목 하나로 끝납니다. 타입·필드 이름은 StarUML을 따라 `.mdj` 파일을 번역 없이 엽니다.

### 3. 렌더러 (`render/notation.js`, `shapes.js`)

`createRenderContext`가 프로젝트·다이어그램·글꼴·선 모양·다이어그램 색 구성을 묶고, 렌더러는 그 컨텍스트로 다음을 합니다.

- **상자**: 노드는 내용(이름, 구획, 스테레오타입)에 맞춘 크기(`fittedSize`)와 사용자가 정한 크기 중 큰 쪽. 컨테이너·막대·와이어프레임 위젯처럼 사용자 크기가 이기는 모양이 있음(`FREE`). 컨테이너 모양(`CONTAINER_SHAPES`)은 다른 노드 뒤에 그리고, 옮기면 안의 뷰가 따라감.
- **시퀀스 기하**: 라이프라인 길이, 생성·소멸된 라이프라인, 실행 막대, 메시지 선과 번호(`y` 순서, `MESSAGE_GAP` 40px).
- **선 경로**(`edgeRoute`, 캐시): 직각(`rectilinear`, 꺾임점이 있으면 직각으로 맞춤) · 사선 · 둥근 직각 · 곡선, 자기 자신으로 가는 고리, 끝은 모양 윤곽(`clip`: rect · ellipse · diamond · circle)에서 자름. 마인드맵 가지와 곡선 타입은 곡선이 기본.
- **장식**(`endMark`): 삼각형, 마름모, 화살표, 까마귀발, 역할 이름과 다중성.
- **스타일**(`styleOf`): 뷰 자신의 값 → 다이어그램 색 구성(`classic` · `pastel` · `blueprint` · `dark`, 요소 그룹별 채우기) 순서.

다이어그램 편집기, 그림·SVG·PDF 내보내기, 인쇄, 썸네일, HTML 문서가 모두 같은 함수로 그리므로 화면과 결과물이 같습니다. 텍스트 폭은 넘겨받은 `measure`(앱: 캔버스 `canvasMeasure`, Node: `estimateMeasure`)로 재므로 순수 함수이고 Node에서도 돕니다.

### 4. 다이어그램 편집기 (`views/diagram.js`)

`DiagramView`는 끝없는 캔버스와 눈금을 그리고, 선택(클릭, Shift/Ctrl+클릭, 영역), 이동(눈금 맞춤, 컨테이너는 안의 뷰와 함께, 패키지에 놓으면 요소 소유자 변경), 크기 조절, 꺾임점(점 끌기, 선분 가운데를 끌어 추가, 두 번 클릭해 삭제), 선 끝 다시 붙이기, 시퀀스 메시지 위아래 이동, 도구(클릭·끌기로 노드, 뷰에서 뷰로 끌어 선), 제자리 편집(이름, 메모, 클래스의 빠른 편집: 이름·속성·오퍼레이션을 텍스트로), 선택한 클래스 아래 빠른 버튼(+속성, +오퍼레이션, 관련 클래스 …), 확대·이동, 다이어그램 종류 탭을 처리합니다. 끄는 동안은 뷰를 바로 바꾸고(`moveViewsLive`) 놓을 때 `commitViews`로 실행 취소 한 단계를 만듭니다.

- **격자**(`drawGrid`): 격자 간격(`gridSize`, 5–40)은 **화면 픽셀**입니다. `gridStep()`이 확대 비율에 맞는 다이어그램 좌표 간격(정수)을 골라 화면에서 늘 같은 간격으로 보이게 하고, 확대하면 더 촘촘하게·축소하면 더 성기게 다시 그립니다. SVG 패턴 하나에 가는 선(간격마다, 화면에서 5px 이상 떨어질 때만)과 진한 선(5칸마다, 5×5)을 그리며 색은 다이어그램 색 구성(`grid`, `gridMajor`)을 따릅니다. 격자 맞추기(`snap`)와 방향키 이동도 같은 `gridStep()`을 쓰므로, 10px 격자는 200%에서 5, 50%에서 20 단위로 맞춰집니다.
- **눈금자**(`drawRulers`): 위쪽·왼쪽 가장자리에 다이어그램 좌표를 그립니다. 눈금은 격자선에, 숫자는 진한 격자선에(붐비면 2·4…칸마다) 붙고, 포인터 위치(`onHover`)를 표시합니다. 설정 `showRulers`(보기 › 표시 › 눈금자, 설정 › 다이어그램).
- **다이어그램 종류 탭**(`renderTypeTabs`): `DIAGRAM_TABS`의 묶음 줄과 고른 묶음의 종류 줄(종류마다 다이어그램 수 배지), 끝에 지금 종류를 하나 더 만드는 **+**. 종류를 누르면 `app.openDiagramType(type)`이 `view.open`에서 마지막으로 연 그 종류의 다이어그램 → 첫 다이어그램 → 새 다이어그램 순으로 엽니다. 다이어그램 탭 자체는 `app.js`의 `renderTabs`가 그립니다([문서와 실행 취소](#문서와-실행-취소) 참고).

### 5. 모델 탐색기와 편집기 (`ui/explorer.js`, `ui/editors.js`)

모델 탐색기는 프로젝트를 트리로 보입니다(영역은 펼쳐 보이고 연관 끝·태그는 숨김). 클릭은 요소와 현재 다이어그램의 뷰를 선택하고, 두 번 클릭은 다이어그램을 열거나 이름을 바꾸며, 행을 다른 행에 끌면 요소가 옮겨지고 캔버스에 끌면 다이어그램에 보입니다. 오른쪽 편집기는 **속성**(메타모델 필드 전부와 멤버 목록: 속성·오퍼레이션·매개변수·리터럴·열·피연산자 …), **스타일**(선택한 뷰의 색·글꼴·선 모양·표시 옵션), **설명**, **태그와 제약** 탭이고, 편집은 `data-*` 속성으로 앱에 보내 하나씩 실행 취소 단계가 됩니다.

### 6. 레이아웃·검증

- **자동 레이아웃**(`layout.js`): 순환을 끊고 최장 경로로 층을 나눈 뒤 무게중심으로 정렬합니다. 일반화·실현·확장·포함 관계는 위를 향해 부모가 자식 위에 놓입니다. 컨테이너·메모·텍스트·선은 제자리, 옮긴 선은 꺾임점을 잃습니다. 시퀀스 다이어그램은 라이프라인 간격과 메시지 간격을 고르게 맞춥니다. 노드 크기는 렌더러가 줍니다.
- **검증**(`validate.js`): 이름 없음·중복, 일반화 순환, 인터페이스가 아닌 실현 대상, 잘못된 다중성, 리터럴 없는 열거형, 시작 의사 상태 없는 영역, 잘못된 날짜·뒤집힌 기간, JSON·YAML·EBNF·정규식 문법, 충족·검증되지 않은 요구사항(`trace.js`의 `coverageProblems`), 중복 요구사항 ID 같은 규칙으로 프로젝트를 훑습니다. **설정**의 자동 검증이 켜져 있으면 편집 뒤 0.8초에 다시 검사해 상태 표시줄에 오류·경고 수를 보입니다.

### 7. 코드 생성과 역공학

- **코드 생성**(`codegen/index.js`): 고른 요소(클래스, 패키지, 모델 전체 …) 아래의 분류자마다 파일 하나(C++는 `.h` + `.cpp`)를 만들고 패키지는 폴더와 package/namespace 선언이 됩니다. 언어 모듈은 텍스트만 만들고, 모델에 대해 알아야 할 것(해석된 타입 이름, 상속·실현, 필드가 되는 연관 끝, 반환 매개변수 …)은 공통 컨텍스트가 줍니다. `sql`은 ER 데이터 모델을 DDL로(MySQL/MariaDB · PostgreSQL · SQLite · SQL Server · Oracle, 참조되는 테이블 먼저, 순환 외래 키는 `ALTER TABLE`). 결과는 코드 생성 팝업에서 미리 보고 ZIP으로 저장합니다.
- **역공학**(`reverse/index.js`, 언어 표 `REVERSE_LANGUAGES`): Java · C# · C++ · Python · TypeScript · SQL(DDL) 소스를 관대한 수제 파서로 읽어 중립 기술(`newDecl`)로 바꾸고, 여기서 패키지·분류자·멤버·일반화·실현을 만듭니다. 파싱한 클래스 타입의 필드는 방향 연관이 됩니다(`associations: false`면 속성으로 남김). 데스크톱은 `list_files`로 폴더 아래 소스를 모읍니다(빌드 폴더 건너뜀, 최대 5000개).
- **C++**(`reverse/cpp.js`, `.h .hpp .hh .hxx .cpp .cc .cxx`): 전처리 줄은 같은 길이의 공백으로 지우고(`#include` 대상은 남김) `java.js`의 토크나이저·커서로 읽습니다. 네임스페이스(중첩, `a::b`) → 패키지, `template<…>` 머리, class · struct · union · enum(`enum class`), 접근 구역(`public:` · `protected:` · `private:`, class 기본 private · struct 기본 public), 필드(static, const/constexpr → 읽기 전용, `=`·`{}` 기본값), 메서드(virtual, 순수 가상 `= 0` → 추상, static, const, 기본값 있는 매개변수), 생성자, `/** */`·`///` 문서 주석을 읽고 소멸자·연산자·friend·클래스 밖 메서드 본문은 건너뜁니다. 기반 목록(`bases`)은 일반화·실체화가 되고, 필드 없이 순수 가상 메서드만 있는 클래스는 인터페이스가 됩니다(StarUML C++ 가져오기와 같음). 타입은 `std::vector`·`std::list` 등 컬렉션 → 다중성 `*`(`std::array<T, N>` 포함), 포인터 → `0..1`, `unique_ptr`·`shared_ptr` 같은 스마트 포인터 → 대상 타입 하나로 풉니다.

## 문서와 실행 취소

- 편집은 모두 `app.js`의 `change(labelKey, mutate)` → `ProjectDocument.apply(label, change)`를 거칩니다. 바꾸기 전 프로젝트를 JSON 스냅샷으로 `History`에 넣고(최대 200), 바뀐 것이 없으면 기록하지 않습니다. 실행 취소/다시 실행은 스냅샷을 맞바꿉니다. 실행 취소 항목의 이름은 툴팁과 상태 표시줄에 쓰입니다.
- 끄는 중처럼 `apply` 밖에서 프로젝트를 바꾸면 `touch()`가 JSON·변경 여부·색인 캐시를 버립니다.
- `dirty`는 저장 시점 스냅샷과 비교합니다. 템플릿이나 가져오기(StarUML `.mdj`)로 연 프로젝트(`fromTemplate`)와 예전 `.muml` 파일은 **저장**할 때 새 `.myuml` 이름을 묻습니다.
- **한 번에 프로젝트 하나**: `addTab`은 `state.docs`를 새 문서 하나로 바꿉니다. 사용자가 시작한 새 프로젝트·템플릿·예제·열기·최근 파일·끌어다 놓기·DB 열기는 먼저 `confirmReplace()`(**저장** · **저장 안 함** · **취소**, `confirm.replaceTitle` / `confirm.replaceMessage`)를 거치고, 끝낼 때는 `confirmExit()`가 묻습니다. 열기 창에서 여러 파일을 고르면 첫 파일만 엽니다. 튜토리얼만 자기 예제 문서를 따로 넣었다가 끝나면 닫고 원래 문서로 돌아갑니다.
- **다이어그램 탭 줄**(`renderTabs`, `#tabs`): 프로젝트 이름(변경 시 ●) 뒤에 프로젝트의 모든 다이어그램(모델 순서)마다 탭 하나, **+**(다이어그램 추가 메뉴), 넘칠 때만 보이는 ‹ › 스크롤 버튼(`updateTabNav`). 누르면 열기, 두 번 누르면 이름 바꾸기, 오른쪽 클릭은 `diagramTab` 메뉴(이름 바꾸기 · 모델 탐색기에서 선택 · 이전/다음 다이어그램 · 내보내기). `Ctrl+Tab`/`Ctrl+Shift+Tab`(`cycleTab`)과 `Ctrl+PageUp/PageDown`이 다음·이전 다이어그램으로 갑니다. 다이어그램 닫기(`Ctrl+F4`)·모든 탭 닫기·모두 저장 메뉴는 없어졌고 `Ctrl+W`는 **프로젝트 닫기**입니다(`Ctrl+Alt+S`는 그대로).
- 문서는 보기 상태(`view`: 현재 다이어그램, 최근에 연 다이어그램 순서, 다이어그램별 확대·스크롤, 펼친 트리 노드)를 가집니다. 파일로 저장된 열린 프로젝트의 경로는 세션(`myumlmaker.session.v1`)에 남아 다음 실행에 다시 열립니다.

## 파일 형식

| 형식 | 구현 | 내용 |
|---|---|---|
| `.myuml` (예전 `.muml`) | `format.js` | `{ format: "myumlmaker", version: 1, kind: "project", saved, project }` (UTF-8 JSON) |
| `.mumlt` | `format.js` | 같은 형식, `kind: "template"`. 내용은 그대로(시작점) |
| StarUML `.mdj` | `interop/staruml.js` | 모델 부분은 같은 타입·필드 이름이라 그대로 둠. 뷰는 다름: StarUML은 구획·레이블을 `subViews`에 중첩하고, 점을 `"x:y;x:y"`, 선 모양과 글꼴을 숫자·문자열로 쓰고, 시퀀스·커뮤니케이션용 뷰 타입이 따로 있음(`VIEW_TYPE_MAP`). 읽기는 우리 뷰로 펴고, 쓰기는 StarUML이 그리는 데 필요한 최소 하위 뷰를 다시 만듦. 맨 `{ "_type": "Project" }` JSON도 `parseProject`가 알아봄 |
| `.mfj` | `interop/staruml.js` | StarUML 모델 조각: 요소 하나와 그 소유물. 읽으면 새 id로 바꿔(조각 안 참조도 다시 연결) 고른 소유자에 넣음 |
| Mermaid | `interop/mermaid.js` | 읽기: classDiagram · sequenceDiagram · flowchart/graph · erDiagram · stateDiagram → 소유자 요소 하나와 배치된 다이어그램 하나. 쓰기: 클래스 · 시퀀스 · 순서도 · ER · 상태 · 유스케이스 · 액티비티(뒤 둘은 flowchart) |
| PlantUML | `interop/plantuml.js`, `plantuml-more.js` | 읽기·쓰기: 모든 UML 다이어그램(클래스 · 객체 · 패키지 · 프로파일 · 유스케이스 · 컴포넌트 · 배치 · 복합 구조 · 정보 흐름 · 시퀀스 · 액티비티 새/옛 문법 · 상태 · 타이밍 · ER IE 표기), `@startmindmap`, 그리고 `plantuml-more.js`의 간트 · WBS · chronology · ArchiMate · nwdiag · JSON · YAML · EBNF · regex · Salt(와이어프레임). 쓰기에서 커뮤니케이션은 시퀀스로, 인터랙션 개요는 옛 문법 액티비티로, 프로파일은 클래스로. 읽기 전 전처리(주석, `!define`·`!$var` 치환, `!if`/`!ifdef`; `!include`·skinparam·스타일·범례·머리글은 경고와 함께 버림). 결과는 Mermaid와 같은 `{ owner, diagram, kind, warnings }`이고 경고는 앱이 목록 창으로 보임 |
| XMI 2.x | `interop/xmi.js` | 쓰기(`exportXmi`): UML 부분을 XMI 2.5.1로 — 패키지, 분류자와 속성·오퍼레이션·매개변수·리터럴, 관계, 상태 머신·액티비티·인터랙션, 인스턴스, 주석, 스테레오타입 적용. `flavor: 'ea'`(기본)는 Enterprise Architect `xmi:Extension`에 다이어그램 위치(`Left=..;Top=..`)를 더하고 `'plain'`은 모델만. UML이 아닌 표기는 뺌. 읽기(`readXmi`): EA 2.1/2.5(확장의 다이어그램, EAStub, 태그 값, 메모), MagicDraw · Papyrus(UML DI·GMF 모양). 다이어그램 정보가 없으면 패키지마다 클래스 다이어그램을 만들어 배치. 모르는 것은 경고로 건너뛰고 예외를 던지지 않음 |
| 기준선 | `baseline.js` | `.myuml`의 `project.baselines`(기준선마다 모델 JSON 글 `snapshot`). StarUML `.mdj` 쓰기와 템플릿에서는 뺌 |
| Word / PDF / HTML 문서 | `report.js`, `export/docx.js`, `export/report-pdf.js` | 문서 블록 → `.docx`(Office Open XML, ZIP), PDF(쪽마다 JPEG, 한국어 글꼴 내장 불필요), HTML(SVG 그림) |
| HTML / Markdown | `docs.js` | 모델 문서. Markdown은 다이어그램을 `images/<이름>.svg` 링크로 두고 ZIP으로 묶음 |
| 그림 · SVG · PDF | `render/notation.js`, `export/` | PNG/JPEG/WebP는 캔버스, BMP·TIFF는 `image-encode.js`, SVG는 그대로(한 변 16 000px 제한). 모든 다이어그램 그림은 ZIP. PDF는 인쇄 레이아웃의 각 용지를 JPEG로 그려 `pdfFromJpegs`로 묶음(한국어 글꼴 내장 불필요) |
| 클립보드 | `app.js` | 앱 안 복사는 메모리의 뷰·요소 묶음(`state.clipboard`), OS 클립보드에는 요소 이름 |

읽기는 고칠 수 있는 것을 고치고(빠진 id·컬렉션, 중복 id, `_parent` 다시 연결, 없는 요소를 가리키는 뷰와 끝이 사라진 선 삭제, 빠진 연관 끝 만들기) 프로젝트가 아닌 것은 `FormatError`(`format.notJson`, `format.notProject`, `format.newer`)로 거절합니다. StarUML·Mermaid·PlantUML·코드 생성·역공학 오류도 `code`를 가진 오류(`interop.*`, `reverse.*` …)이고 UI에서 번역됩니다.

## 팝업

- **데스크톱**: 팝업은 `open_popup`으로 만드는 OS 창(label `popup-<kind>`, `POPUP_KINDS`에 있는 것만)이며 메인 창에 소유됩니다. 메인 창 밖에 둘 수 있고, 메인 창이 없어지면(`Destroyed` → `exit(0)`) 함께 닫힙니다. 각 팝업은 `POPUPS` 표의 고정 크기이고 내용이 스크롤 없이 들어갑니다(긴 내용은 탭이나 쪽으로 나눔). 그린 뒤 `popup_ready`/`place_popup`으로 보여 빈 창이 깜빡이지 않습니다.
- **웹과 튜토리얼 중**: 같은 페이지를 `index.html?popup=<kind>` 프레임으로 메인 창 안에 띄우고 메시지를 씁니다(`PopupHost.useFrames`). 튜토리얼은 화면 녹화에 팝업이 찍히도록 데스크톱에서도 프레임을 씁니다(`popups.inline`).
- 매개변수는 모든 창이 공유하는 `localStorage`의 `myumlmaker.popup.<kind>`로 넘기고, 팝업은 `result`(닫으며 결과) · `action`(열린 채로 메인 창에 요청: 찾기, 최근 파일 열기, 코드 생성 미리 보기, DB 시험·목록 …) · `ready` · `place` · `close` · `hide` · `drag` 메시지로 답합니다.
- **메뉴**는 `menu` 팝업 하나를 재사용합니다. 시작 후 미리 만들어 두고(prewarm), 내용을 그린 뒤 크기를 재서 모니터 작업 영역 안에 놓습니다(아래 공간이 없으면 위로). 숨겼다가 다시 씁니다(`hide_popup`). 테마 목록(`theme`)과 색 고르기(`color`)는 포커스를 잃으면 닫히는 드롭다운 팝업입니다.
- 설정 팝업이 설정을 바꾸면 `localStorage`의 `storage` 이벤트로 메인 창이 다시 적용합니다.

## 플랫폼 경계

`src/platform/native.js`만 플랫폼을 압니다.

| 기능 | 데스크톱 (Rust 명령) | 웹 |
|---|---|---|
| 파일 열기/저장 | `read_text_file`, `write_text_file`, `read_base64_file`, `write_base64_file` (1 MiB 청크 단위 진행률 `io-progress`, 임시 파일에 쓰고 rename), `paths_exist` | File System Access(핸들은 IndexedDB에 보관), 없으면 `<input>`·내려받기 |
| 대화 상자 | `tauri-plugin-dialog` | 브라우저 파일 선택 |
| 역공학 소스 폴더 | `list_files` | 파일 여러 개 선택 |
| 배경 이미지 | `import_background`로 데이터 폴더에 복사, asset 프로토콜로 표시(`allow_background`, `remove_background`) | IndexedDB |
| 글꼴 목록 | `list_fonts`(fontdb) | `queryLocalFonts`(허락될 때), 아니면 후보 글꼴 검사 |
| 클립보드 | `clipboard_write`, `clipboard_read`(arboard) | `navigator.clipboard` |
| 문서·링크 열기 | `open_document`(설치 폴더 `docs/`), `open_external` | `window.open('./docs/…')` |
| 예제·시작 파일 | `sample_files`, `startup_files`(명령줄의 .myuml/.mumlt/.muml/.mdj/.mfj/.json) | 내장 예제 |
| 데이터베이스 | `db_test`, `db_save`, `db_load`, `db_list`, `db_delete` | — (메뉴에 없음) |
| 인쇄 | `print_window`(팝업 창의 OS 인쇄) | `window.print` |
| 종료 | `quit_app`(저장 안 한 변경을 UI가 처리한 뒤) | — |
| 언어 · 정보 | `set_language`(백엔드 메시지 `tr!`), `app_info`(버전·커밋·빌드 정보) | 빌드 상수 |

Rust 쪽 메시지는 모두 `tr!("한국어", "English")`로 두 언어를 가집니다. WebView2는 같은 프로필의 모든 웹뷰가 같은 인자를 써야 하므로 `BROWSER_ARGS` 상수 하나를 쓰고, 창을 만드는 명령은 async여야 합니다(동기 명령은 Windows에서 교착).

### 창

메인 창은 처음엔 숨겨 두었다가 첫 화면을 그린 뒤 보입니다. 제목은 `MyUMLMaker v<버전>`, 기본 크기 1480×900, 최소 크기는 1000×600이며, 툴바가 다 보이는 폭보다 좁아지지 않게 `setMinimumSize`를 갱신합니다. 위치·크기·최대화는 `window_state.rs`가 설정 폴더의 `window-state.json`에 저장합니다(마지막 변경 0.5초 뒤, 프로세스·호출마다 다른 임시 파일 `window-state.json.<pid>-<n>.tmp`에 쓰고 rename — 여러 복사본이 함께 써도 파일이 깨지지 않고 마지막으로 닫은 창의 값이 남음, 연결된 모니터에 보이지 않는 위치는 버림).

### 심각한 오류

Rust 패닉 훅이 메시지·위치·스레드·백트레이스를 데이터 폴더의 `crash.log`에 덧붙이고 `fatal-error` 이벤트로 메인 창에 보내면, 오류 팝업이 전부 표시하고 복사할 수 있게 합니다. JS 쪽 오류는 `showError`가 같은 오류 팝업으로 보냅니다.

## 데이터베이스

`db.rs`: sqlx `Any` 드라이버로 SQLite · MariaDB · MySQL · PostgreSQL에 저장합니다. 테이블은 하나(`myumlmaker_projects (id, title, data, updated)`, 처음 쓸 때 생성)이고 `data`는 `.myuml` 파일 내용 그대로라 DB에서 읽은 프로젝트는 파일처럼 열립니다. 저장은 한 트랜잭션으로 행을 바꿉니다. PostgreSQL은 자리표시자를 `$1…`로 바꿉니다. 연결 설정은 **설정 › 데이터베이스**(`settings.js`의 `dbConfig`/`dbProblems`)에 있고, 비밀번호는 저장을 고르지 않으면 이번 실행에만 기억합니다. DB가 설정되어 있으면 **저장**이 파일과 DB에 함께 씁니다. 오류 문구에는 비밀번호를 넣지 않습니다.

## 여러 실행

여러 복사본이 함께 실행됩니다. 실행할 때마다 자기 메인 창을 엽니다(탐색기에서 `.myuml`을 두 번 누르면 새 복사본이 그 파일을 엶). `instance.rs`는 다른 복사본이 돌고 있는지만 알려 줍니다: 복사본마다 사용자별 폴더(임시 폴더의 `myumlmaker-<사용자>\`)의 `<pid>.lock`에 OS 파일 잠금을 걸고 쥐고 있습니다. 시작할 때 `startup.lock`을 잡은 채(동시에 시작한 두 복사본이 서로 첫째라고 여기지 않게) 다른 `*.lock`을 잠가 보아, 잠기지 않는 것(살아 있는 복사본)을 세고 잠기는 것(끝난 복사본, 비정상 종료 포함 — OS가 잠금을 풂)은 지웁니다.

- 첫 복사본(`others == 0`)만 지난 세션을 되살리고(`app.js` `restoreSession`) 세션을 저장합니다(`persistSession`). 나중 복사본은 시작 페이지(또는 명령줄 파일)로 열리고 첫 복사본의 세션을 덮어쓰지 않습니다. 페이지는 `instance_info` 명령(`{ first, others }`)으로 묻습니다.
- 나중 복사본의 창은 저장된 자리 그대로가 아니라 `instance::cascade`로 복사본 수 × 32 논리 px만큼 오른쪽 아래로 비켜, 모니터 작업 영역 안에 열립니다(넘치면 작업 영역 왼쪽 위로). 저장된 상태가 최대화여도 나중 복사본은 최대화하지 않습니다.
- WebView2: 모든 복사본이 같은 사용자 데이터 폴더(`%LOCALAPPDATA%\com.shkwon.myumlmaker`)를 쓰고, 모든 웹뷰가 같은 `BROWSER_ARGS`를 써서 WebView2가 브라우저 프로세스 하나를 함께 씁니다(인자가 다르면 두 번째 환경이 만들어지지 않음). 그래서 localStorage(설정, 최근 파일·폴더, 세션, DB 연결)가 공유되고 `storage` 이벤트로 다른 창에 바로 반영됩니다. 최근 파일·폴더는 추가하기 전에 저장소에서 다시 읽어, 다른 창이 그사이 더한 항목을 지우지 않습니다.
- 메인 창이 닫히면 그 프로세스만 끝납니다(`app.exit`) — 다른 복사본은 그대로입니다.

## 설치 프로그램 훅

`src-tauri/windows/hooks.nsh` (UTF-8 BOM 유지 — 아니면 NSIS가 한국어를 ANSI로 읽음):

| 훅 | 하는 일 |
|---|---|
| `MUI_CUSTOMFUNCTION_GUIINIT` → `MumGuiInit` | 첫 페이지 전(MUI `.onGUIInit`, `/S`에서는 안 돎). 이전 설치(HKCU·HKLM의 `Uninstall\MyUMLMaker` `UninstallString`, 없으면 `Software\SHKWON\MyUMLMaker` 기본값)나 사용자 데이터(`%APPDATA%\com.shkwon.myumlmaker` 또는 `%LOCALAPPDATA%\com.shkwon.myumlmaker`에 무엇이든 있음)가 있으면 설치 언어(`LangString` 1042/1033)로 "이전에 사용하던 사용자 데이터(…)를 삭제할까요?" — 예/아니오(기본)/취소(`Quit`, 아무것도 안 바뀜). 그다음 Restart Manager(`RmGetList`)로 이전 설치·`$INSTDIR`의 `MyUMLMaker.exe`를 쓰는 프로세스를 세어(몇 개든) 확인/취소를 묻고 `RmShutdown`으로 모두 닫은 뒤 `MumRemoveOld`. 여기서 지워 두면 Tauri의 "이미 설치됨" 페이지는 스스로 건너뜀. `/P`는 묻지 않음 |
| `MumRemoveOld` | 현재 사용자 설치: `uninstall.exe /S /UPDATE _?=<폴더>`(제자리 실행·기다림, `/UPDATE`라 데이터는 안 지움) 후 폴더 이름이 `MyUMLMaker`면 폴더째, 아니면 우리 파일만 삭제하고 등록 키 삭제. 컴퓨터 전체 설치: 관리자 권한으로(`ExecShellWait runas`) 같은 제거와 폴더 삭제. 파일이 없는 낡은 HKCU 등록은 지움 |
| `NSIS_HOOK_PREINSTALL` | 조용한 설치(`/S`)처럼 `MumGuiInit`이 안 돈 경우 묻지 않고 `MumFindOld` + `MumRemoveOld`(데이터 유지). 그다음 템플릿의 `CheckIfAppIsRunning`이 `$INSTDIR`의 실행 중인 복사본을 모두 닫음 |
| `NSIS_HOOK_POSTINSTALL` | **예**를 골랐으면(`$MumWipe`) `MumWipeData`로 두 데이터 폴더를 지움(표시 파일 없음). 아니면 `%APPDATA%\com.shkwon.myumlmaker\install-reset`에 토큰을 쓰고 `window-state.json`을 지움 → 다음 실행에 `window_state.rs`가 토큰을 넘기고 `resetForNewInstall`이 설정만 기본값으로(최근 파일·폴더, 세션, DB 연결, 배경 이미지, 튜토리얼 기록은 유지). `MyUMLMaker.Project` / `MyUMLMaker.Template`의 `DefaultIcon`을 `project.ico`("MYUML" 문서 아이콘) / `template.ico`로, 시작 메뉴에 `MyUMLMaker User's Guide.lnk`(→ `docs\UsersGuide.html`), 셸에 연결 변경 알림 |
| `NSIS_HOOK_POSTUNINSTALL` | 설명서 바로 가기 삭제 |

훅 파일은 `installer.nsi` 맨 위(템플릿의 `Var PassiveMode/UpdateMode`, `DeleteAppDataCheckboxState`, `!define BUNDLEID` 따위보다 앞)에서 `!include`되므로, 그 안의 `Function`은 자기 `!define /IfNDef MUM_*`(경로·키)와 자기 `Var`만 씁니다. 훅 매크로는 Section 안에서 펼쳐지므로 템플릿 것을 써도 됩니다. `MUM_*` 정의는 미리 바꿀 수 있어, `test/installer/hooks-test.nsi`가 가짜 설치본·가짜 데이터 폴더·`HKCU\Software\MyUMLMakerHookTest`로 같은 함수를 조용히 돌리고 질문의 답은 `MessageBox /SD`(`MUM_SD_ASK`, `MUM_SD_RUNNING`)로 줍니다(`test/installer/hooks-cases.mjs`, `npm test -- --installer`). 실제 설치 프로그램은 개발 기계에서 돌리지 않습니다.

`tauri.conf.json`: 현재 사용자 설치, 언어 선택(Korean/English), `.myuml`/`.mumlt` 파일 연결, 리소스로 문서 아이콘·`docs/`(HTML 설명서·튜토리얼·그림·`UsersGuide.md`·`README.md`)·`samples/`. Linux deb/rpm은 `linux/myumlmaker.xml` MIME과 문서 아이콘을 설치하고 `postinst.sh`/`postrm.sh`가 MIME·아이콘 캐시를 갱신합니다. macOS는 `Info.plist`가 문서 타입과 아이콘을 등록합니다.

## 문서 생성

- `scripts/build-docs.mjs`: 의존성 없는 Markdown → HTML 변환기. `UsersGuide.md` · `UsersGuide.en.md` · `docs/tutorial/README*.md`를 `docs/UsersGuide*.html` · `docs/Tutorial*.html`로 만들고(목차, 밝은/어두운 색, 표·코드·그림), `public/docs/`에 복사합니다(웹 빌드가 `./docs/`로 제공).
- 튜토리얼 캡처(`npm run tutorial:docs` / `tutorial:video`)는 `STEPS`(src/ui/tutorial.js) 순서대로 `docs/tutorial/images/NN-<id>.jpg`를 만들고, 설명서는 그 이름으로 그림을 참조합니다. 단계를 더하거나 빼면 번호가 바뀌므로 설명서의 그림 참조도 함께 고칩니다.
- `scripts/make-samples.mjs`는 `templates.js`의 `SAMPLE_FILES`와 `buildTemplate`으로 `samples/`를 다시 만들고(`.myuml`, StarUML 사본 `.mdj`, 도메인 패키지 조각 `.mfj`, 클래스 모델 템플릿 `.mumlt`; 상호 운용 테스트용 `staruml-sample.mdj`는 그대로), `scripts/render-icons.mjs`는 `assets/*.svg`를 헤드리스 Edge/Chrome으로 그려 앱·문서 아이콘과 설치 프로그램 그림을 만듭니다.

## 저장소

`.gitignore`가 아래를 커밋에서 뺍니다. 잠금 파일(`package-lock.json`, `src-tauri/Cargo.lock`)은 커밋합니다.

| 경로 | 이유 |
|---|---|
| `node_modules/` | `npm install` |
| `dist/` | 웹 빌드 (`npm run build:web`, Tauri `frontendDist`) |
| `src-tauri/target/`, `src-tauri/gen/` | Cargo 산출물, Tauri가 다시 만드는 스키마 |
| `release/`, 루트의 `MyUMLMaker-*.exe` · `.msi` · `.dmg` · `.deb` · `.rpm` · `.AppImage` | `scripts/build.mjs`가 모아 두는 설치 파일 |
| `*.mp4` | `npm run tutorial:video` → `MyUMLMaker-Tutorial.mp4` |
| `test-results/`, `*.log` | `npm test`가 쓰는 `results.json`, 실행 기록 |
| `test/db.local.json` | DB 통합 테스트 접속 정보(환경 변수로 대신 줄 수 있음) |

저장은 `.<이름>.<pid>.tmp`에 쓴 뒤 이름을 바꾸므로 임시 파일이 남지 않습니다.

## 테스트

`npm test`(`scripts/test.mjs`)가 분류별로 실행하고 결과를 표로 정리해 `test-results/results.json`에 씁니다. `--quick`은 js · conformance · package · rust만, `--only` / `--skip`으로 분류를 고르고, `--installer`는 설치 프로그램 분류를 더합니다.

| 분류 | 내용 |
|---|---|
| JS 단위 (`js`) | `test/unit/*.test.js` — 메타모델·모델/뷰 편집, 도구 상자, 렌더링, 레이아웃, 파일 형식과 복구, StarUML/Mermaid/PlantUML/XMI, 새 다이어그램 종류, 요구사항·추적, 기준선·비교, 문서 생성, 코드 생성, 역공학(C++ 포함), 검증, 문서, 설정, 번역 키, 테마, 아이콘, 그림 인코딩 |
| 기능 비교 (`conformance`) | `test/conformance/*.test.js` — 기능 하나가 테스트 하나인 점검표. `staruml.test.js`: StarUML의 모든 다이어그램 종류와 도구 상자, 모든 도구 그리기·잇기·렌더링, 다이어그램마다 `createNode`/`createEdge`로 그린 작은 다이어그램의 SVG 표기 검사(`canvas.js`: 뷰별 SVG, 글자, 끝 표시 판별), 빠른 편집 파서, 모델 탐색기 조작, 서식 옵션, 자동 레이아웃, 모델 조각, 언어별 코드 생성·역공학, 문서, 검증. `enterprise-architect.test.js`: 구현한 EA 기능 점검표(UML 2.5 · SysML · BPMN · ArchiMate 3 · 데이터 모델링 · 간트/WBS/타임라인 · 네트워크, 요구사항·관계 매트릭스, 기준선·비교·복원, 문서 템플릿·docx·PDF·HTML, XMI(EA · MagicDraw · Papyrus), 코드 엔지니어링, DB 저장, 검색); 없는 기능은 `{ todo }`. `plantuml.test.js`: PlantUML 언어 점검표(종류별 문법, 전처리기, skinparam/테마, 제목 — 가져오기 · 렌더링 · 내보내기 · 다시 가져오기). `npm test -- --only conformance`; `todo`는 결과에 "건너뜀 — TODO: 이유"로 나옴 |
| 패키징 · 아이콘 · 문서 (`package`) | `test/static/` — 아이콘, 파일 형식 등록, 설치 언어·훅·재설치, 설정 초기화, 문서(`docs.test.js`: HTML·링크·그림·README 빌드 명령·한/영 장 구성·단축키 표·튜토리얼 단계 수와 그림 번호) |
| Rust 단위 (`rust`) | `cargo test --lib` — 파일 입출력·진행률, 글꼴, 창 위치(여러 복사본이 함께 써도 깨지지 않음), 여러 실행(복사본 세기·창 비켜 열기), DB URL·SQLite |
| DB 통합 (`db`) | `cargo test --test db_integration` — `test/db.local.json`의 MariaDB/MySQL(없으면 건너뜀), 임시 PostgreSQL 서버 |
| E2E 웹 (`web`) | 웹 빌드를 헤드리스 Edge/Chrome으로 조작 (`test/e2e/web.harness.mjs`, `web.suite.mjs`, CDP 실제 포인터 이벤트) |
| E2E 데스크톱 GUI (`desktop`) | 실제 앱을 띄워 메뉴·툴바·팝업·다이어그램·모델 탐색기·파일·인쇄·설정을 조작 (`test/e2e/harness.mjs`, `desktop.suite.mjs`, WebView2 CDP + Win32 `dialogs.ps1`; 팝업 정렬·잘림은 `align-check.mjs`·`clip-check.mjs`) |
| 튜토리얼 (`tutorial`) | 모든 단계가 오류 없이 대상 요소를 표시하는지, 끝나면 설정·화면이 돌아오는지 |
| 설치 프로그램 (`installer`) | `--installer`일 때 `npm run build:win` 후 NSIS 설치 파일 검사, 생성된 `installer.nsi`를 makensis로 다시 컴파일해 hooks.nsh 경고 확인, 설치 훅을 가짜 설치본에 실행(묻기·예/아니오/취소·조용한 설치·낡은 등록·실행 중인 복사본 두 개 닫기) |

### E2E 훅

| 훅 | 쓰임 |
|---|---|
| `window.__myumlmaker` | 메인 창: `state`, `t`, `commands`, `run(id)`, `popups`, `api`, `debug()`, `actions`(newProject · openPath · saveDoc · select · change · undo/redo · createNodeAt · createEdgeBetween · addDiagram · runLayout · runValidation · openCodegen · reverseFiles · openTextImport · exportAs …), `domain`(M · E · TYPES · DIAGRAM_TYPES · TEMPLATES · toolboxFor · buildSample · renderDiagramSvg …), `tutorial()` |
| `window.__myumlmakerPopup` | 팝업 창: `kind`, `state`, `render`, `close`, `errorReport`, `printLayout`, `refresh` |
| `window.__myumlmakerPrintHook` | 있으면 OS 인쇄 대신 인쇄 레이아웃을 넘겨받음 |
| `globalThis.__MYUMLMAKER_NO_WELCOME`, URL `?nowelcome` | 첫 실행 환영 창 생략 |

### 환경 변수 (Rust)

| 변수 | 효과 |
|---|---|
| `MYUMLMAKER_MULTI` | 다른 복사본을 세지 않음: 언제나 첫 복사본처럼(세션 복원, 저장된 창 자리) — E2E 하네스와 `npm start`가 씀 |
| `MYUMLMAKER_LOCK_DIR` | 복사본 잠금 파일 폴더(기본: 임시 폴더의 `myumlmaker-<사용자>`) |
| `MYUMLMAKER_CONFIG_DIR` | 창 위치 파일 폴더(사용자 것을 건드리지 않게) |
| `MYUMLMAKER_DATA_DIR` | 데이터 폴더(배경 이미지, crash.log) |
| `MYUMLMAKER_IO_DELAY_MS` | 파일 청크마다 지연 — 진행 팝업 확인용 |
| `MYUMLMAKER_TEST_COMMANDS` | `raise_test_panic` 명령 허용(심각한 오류 팝업 확인) |
| `MYUMLMAKER_OPEN_LOG` | 문서·링크를 여는 대신 경로를 이 파일에 기록 |
| `MYUMLMAKER_NO_OPEN` | 문서·링크를 열지 않음 |
| `MYUMLMAKER_TEST_MYSQL_URL`, `MYUMLMAKER_TEST_POSTGRES_URL` | DB 통합 테스트 서버(`test/db.local.json` 대신) |

WebView2의 CDP 포트와 사용자 데이터 폴더는 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, `WEBVIEW2_USER_DATA_FOLDER`로 테스트마다 따로 잡아 사용자의 설정·최근 기록을 건드리지 않습니다.
