# Architecture — MyMeeting

## 개요

하나의 React 앱을 두 런타임에서 실행합니다.

- **Web** — 순수 브라우저. 파일 열기는 `<input type="file">`, 저장은 Blob 다운로드, PDF 는 인쇄 대화상자.
- **Electron** — 동일한 `dist/` 를 `file://` 로 로드하고, 파일시스템·대화상자·PDF(printToPDF)·시스템 폰트 권한을 IPC(preload)로 노출.

플랫폼 차이는 [src/lib/platform.js](src/lib/platform.js) 한 곳에서 흡수하여, UI 컴포넌트는 런타임을 신경 쓰지 않습니다.

**핵심 설계**: 편집기는 구조화된 `meeting` 객체 하나만 관리하고, 미리보기와 모든 내보내기(md/html/pdf/word)는 이 객체를 **Markdown 으로 직렬화**한 결과 위에서 동작합니다. 덕분에 검증된 Markdown 렌더·내보내기 엔진([lib/markdown.js](src/lib/markdown.js) / [lib/export.js](src/lib/export.js))을 그대로 재사용합니다. 텍스트(.txt) 는 별도의 평문 직렬화를 사용합니다.

```
┌─────────────────────────── Renderer (React) ───────────────────────────┐
│  App.jsx  — meeting 상태 오케스트레이션, 실시간 직렬화·미리보기          │
│   ├─ TitleBar / Toolbar(New·Sample·Open·Save·Export·글꼴/크기) / Status │
│   ├─ Details(회의 정보 폼: 제목·날짜(달력+직접)·참석자·안건 …)          │
│   ├─ OutlineTree(문서 구조) · 크기 조절 splitter                        │
│   ├─ RichEditor(WYSIWYG 편집) / Markdown 소스 탭(원본 편집)             │
│   └─ SettingsPage · AboutPage · ContextMenu · ErrorDialog · Tooltip     │
│                                                                          │
│  lib/meeting.js  — meeting ↔ Markdown/평문 직렬화 + 섹션 번호 매기기     │
│  lib/markdown.js — render · outline · toStandaloneHtml(표지/목차)       │
│  lib/export.js   — md · html · pdf · word (+PDF 머리글/바닥글 템플릿)    │
│  lib/media.js    — 이미지/동영상/오디오 → base64 내장(+이미지 축소)     │
│  lib/fonts.js    — queryLocalFonts (system fonts)                       │
│  lib/platform.js — isElectron / saveText / openTextFile / exportPdf     │
└───────────────▲───────────────────────────────────────▲────────────────┘
                │ (Electron: window.electronAPI)          │ (Web: DOM APIs)
        ┌───────┴────────┐                                │
        │ electron/preload.js  (contextBridge)            │
        │ electron/main.js     (dialogs, fs, printToPDF,  │
        │                       local-fonts permission)   │
        └────────────────┘
```

## 디렉토리 구조

```
MyMeetingMultiOSV10/
├── electron/
│   ├── main.js            # BrowserWindow, IPC, printToPDF/print, local-fonts 권한, 창 제어
│   └── preload.js         # contextBridge 로 electronAPI 노출
├── scripts/
│   ├── start-electron.mjs # ELECTRON_RUN_AS_NODE 제거 후 Electron 실행
│   ├── generate-icons.mjs # SVG → ico/icns/png
│   ├── generate-build-info.mjs  # src/build-info.json (About 정보)
│   └── copy-installer.js  # release/ 산출물을 루트로 복사
├── src/
│   ├── App.jsx            # meeting 상태·동작 오케스트레이션
│   ├── i18n.js            # ko/en 리소스
│   ├── build-info.json    # 빌드 메타(생성물, gitignore)
│   ├── lib/
│   │   ├── meeting.js     # meeting 모델 + Markdown/평문 직렬화 + numberSections + buildStructure
│   │   ├── markdown.js    # 렌더/구조/표지·목차 HTML/파일명 (재사용 엔진)
│   │   ├── export.js      # 포맷별 내보내기(md/html/pdf/word) + PDF 폴백 템플릿
│   │   ├── media.js       # 이미지/동영상/오디오 파일 → base64 data URL(+이미지 축소)
│   │   ├── fonts.js       # 시스템 폰트 열거 (queryLocalFonts + 폴백)
│   │   ├── themes.js      # 테마 목록(THEMES)
│   │   ├── platform.js    # 웹/Electron 추상화 (저장/열기/PDF/인쇄 + 웹 페이지네이션)
│   │   └── ico.js         # ICO/ICNS 인코더 (아이콘 생성 공유)
│   └── components/
│       ├── RichEditor.jsx  # WYSIWYG(contentEditable) ↔ Markdown 직렬화 + 미디어/리사이즈
│       ├── TitleBar.jsx    OutlineTree.jsx   TimeCombo.jsx   AboutPage.jsx
│       ├── SettingsPage.jsx  SettingsForm.jsx  (별도 설정 창)
│       ├── ExportResultDialog.jsx  ExportProgressDialog.jsx  PrintDialog.jsx
│       ├── ErrorDialog.jsx  (복사 가능한 상세 오류 팝업)
│       ├── ContextMenu.jsx   Toasts.jsx   Tooltip.jsx   Icons.jsx
├── assets/icon.svg        # 앱 아이콘 원본 (회의록 + 참석자 테마)
├── assets/file-icon.svg   # .mtg 문서 아이콘 원본 (인디고 페이지 — 작은 크기에서도 구분되게)
├── public/icon.svg        # UI(<img>)에서 로드하는 사본
├── build/
│   ├── installer.nsh      # NSIS 커스텀 (바로가기 선택 페이지)
│   └── icons/             # 생성된 아이콘 (빌드시 자동 생성)
├── vite.config.js         # base:'./' (file:// 로드 대응), 포트 5179
└── package.json           # scripts + electron-builder 설정 + allowScripts
```

## 회의록 모델 & 직렬화 ([src/lib/meeting.js](src/lib/meeting.js))

`meeting` 객체 필드: `title, date, startTime, endTime, location, organizer, recorder, attendees, agenda, body, decisions, actionItems`. 여러 줄 필드(참석자·안건·결정·실행 항목)는 **한 줄에 하나씩** 입력하며 직렬화 시 목록으로 변환됩니다.

| 함수 | 역할 |
|------|------|
| `createEmptyMeeting()` / `createSampleMeeting(lang)` | 빈/예시 회의록 |
| `meetingToMarkdown(m, labels)` | 제목(H1) + 정보 표 + 번호가 붙은 섹션(안건·회의 내용·결정·실행) Markdown 생성 |
| `meetingToPlainText(m, labels)` | 평문(.txt) 직렬화 |
| `demoteHeadings(md, minLevel)` | 본문(사용자 작성) 헤딩을 한 단계 낮춰 "회의 내용" 섹션 하위로 편입 |
| `numberSections(md)` | H2 이하 섹션에 계층 번호(1, 2, 2.1 …) 부여. **H1 제목/정보 표는 번호 없음** |
| `isMeetingEmpty(m)` / `meetingBaseName(m)` | 빈 상태 판정 / 기본 파일명(회의 제목) |

### 섹션 번호 규칙
- 제목(H1)과 정보 표(날짜·작성자 등)에는 번호를 붙이지 않습니다.
- 안건·회의 내용·결정·실행 항목 등 각 섹션(H2)은 `1, 2, 3 …`, 본문의 하위 헤딩은 `2.1, 2.2 …` 로 자동 번호가 매겨집니다.
- 본문에 사용자가 직접 쓴 헤딩은 `demoteHeadings` 로 한 단계 낮춰 "회의 내용" 섹션 하위로 편입한 뒤 번호를 매깁니다.
- 코드 펜스(```` ``` ````, `~~~`) 내부의 `#` 은 헤딩으로 오인하지 않습니다.

## 상태·데이터 흐름 (App.jsx)

- **실시간 직렬화** — `meeting` 이 바뀌면 `fullMarkdown = meetingToMarkdown(meeting, docLabels)` 를 `useMemo` 로 재계산하고, `previewHtml`(렌더)·`outline`(구조)·`stats` 가 즉시 갱신됩니다.
- **편집 방식** — 회의 정보(제목·날짜·참석자 등)는 좌측 "회의 정보" 폼에서, 회의 내용 본문은 메인 창에서 편집합니다. 본문 편집기는 두 탭을 제공합니다: **"편집"(RichEditor, WYSIWYG)** 은 Markdown 을 서식으로 렌더한 contentEditable 에서 직접 편집하고 매 입력마다 `htmlToMarkdown()` 으로 다시 Markdown 화합니다. **"Markdown"** 탭은 원본 소스를 그대로 편집하는 textarea 로, 두 탭은 같은 `meeting.body` 를 공유해 탭 전환 시 서로 반영됩니다.
- **탭 왕복 무손실** — RichEditor 는 *실제로 편집된 경우에만* 직렬화합니다(`dirtyRef`). 손대지 않은 문서에서 blur/탭 전환이 `htmlToMarkdown()` 을 돌리면, 렌더러는 이해하지만 직렬화기가 다르게 적는 표기(setext 제목, 참조 링크, `_강조_` 등)가 조용히 바뀝니다. 편집한 경우에도 직렬화기는 블록을 감싼 `<div>` 안으로 내려가고(그러지 않으면 제목·목록·표가 평문 한 줄로 뭉개짐) `<br>` 을 마크다운 하드 브레이크로 보존합니다.
- **구조 트리** — `buildStructure(meeting, labels, outline)`([meeting.js](src/lib/meeting.js))가 헤딩 아웃라인에 상세 패널의 값을 끼워 넣어 트리 노드를 만듭니다. 헤딩 노드는 `index` 를 유지해 편집기 위치로 이동하고, 나머지 노드는 `field`(+ 목록이면 `lineIndex`)를 들고 있어 클릭하면 해당 입력칸으로 이동/선택합니다.
- **미디어 내장** — 이미지·동영상·오디오는 드래그 앤 드롭 / 붙여넣기 / 파일 열기로 넣으면 [lib/media.js](src/lib/media.js) 가 base64 `data:` URL 로 읽어(큰 이미지는 canvas 로 축소) 본문에 `<img>/<video>/<audio>` HTML 로 내장합니다. 크기가 지정된 미디어는 `width` 속성으로 직렬화되어 리사이즈가 왕복 보존되고, DOMPurify 가 `data:` 미디어·`<video>/<audio>` 태그를 허용해 미리보기·내보내기까지 이어집니다.
- **글꼴·크기** — 툴바의 글꼴/크기 선택은 내보내기 설정(`fontFamily`/`fontSizePt`)을 갱신해 편집기 표시·미리보기·모든 내보내기에 동일 적용됩니다(설정 창과 `localStorage` 로 양방향 동기화).
- **컨텍스트 메뉴** — Electron 은 `menu:popup` IPC 로 **OS 네이티브 메뉴**를 띄워 창 경계에 잘리지 않으며, 실패(`shown:false`)하거나 웹이면 앱 내 [ContextMenu](src/components/ContextMenu.jsx) 로 폴백합니다(뷰포트 클램프 + 스크롤).
- **날짜 입력** — 자유 텍스트 입력과 달력 선택을 함께 지원합니다. 달력 버튼은 네이티브 `<input type="date">.showPicker()` 를 열어 선택값(YYYY-MM-DD)을 텍스트 칸에 채웁니다.
- **내보내기 옵션** — `buildExportOpts()` 는 `{...기본값, ...localStorage, ...라이브상태}` 순으로 병합해 설정창에서 바꾼 폰트·크기·줄간격이 항상 내보내기·미리보기에 반영되도록 합니다. 표지 날짜 기본값은 회의 날짜(비면 오늘).
- **저장 대상 파일** — `docPath` 가 지금 편집 중인 파일의 경로입니다. 열기·다른 이름으로 저장이 이 값을 채우고 새로 만들기·양식 불러오기가 비웁니다. **저장(Ctrl+S)** 은 `docPath` 가 있으면 `fs:writeText` 로 대화상자 없이 덮어쓰고, 없으면 **다른 이름으로 저장(Ctrl+Shift+S)** 으로 넘어갑니다. 자동 저장된 초안과 함께 `mtg-doc-path` 로 보관되므로 **재시작 후에도 같은 파일에 그대로 저장**되며, 파일/폴더가 사라져 쓰기가 실패하면 다른 이름으로 저장으로 넘어갑니다.
- **영속화** — 작성 중 회의록(`mtg-doc`), 테마(`mtg-theme`), 언어(`mtg-lang`), 내보내기 서식(`mtg-export`), 인쇄 옵션(`mtg-print`), 좌측 패널 폭(`mtg-sidebar-w2`) 은 localStorage 에 저장(Electron 은 userData JSON 미러도 유지). 재실행 시 마지막 회의록이 복원됩니다.
- **오류 처리** — 내보내기/열기/저장 오류와 전역 `error`/`unhandledrejection` 은 [ErrorDialog](src/components/ErrorDialog.jsx) 로 표시되며, 상세 내용을 선택·**복사**할 수 있습니다.

## 내보내기 파이프라인 ([src/lib/export.js](src/lib/export.js))

| 포맷 | 방식 |
|------|------|
| Markdown | `buildMergedMarkdownDocument`(표지 + 목차 + 본문) |
| HTML | `toStandaloneHtml`(표지/목차/@page CSS) → 저장. Electron 은 `export:paginate` 로 목차 페이지 번호를 미리 계산해 baking |
| PDF | Electron: **paged.js** 로 페이지네이션 후 `printToPDF`. 목차 셀을 실제 페이지 번호로 채우고, 머리글/바닥글/페이지번호는 @page 마진박스. paged.js 없으면 `printToPDF` 템플릿으로 폴백. Web: 인쇄 창(`Save as PDF`) |
| Word | **MHT(multipart/related)** `.doc` — `toStandaloneHtml({forWord:true})` + Office 네임스페이스/ProgId, base64 이미지·오디오·동영상은 별도 MIME 파트 |
| 텍스트 | `meetingToPlainText` → `.txt` 저장 |

- **표지(Cover)**: 제목은 `coverTitle` 설정(비우면 회의 제목), 버전/작성자/날짜 포함. **목차(Index)**: 본문 앞 별도 페이지, 각 항목 오른쪽에 실제 페이지 번호(H1 굵게).

### paged.js 페이지네이션 (메인 프로세스, `electron/main.js`)

목차 페이지 번호는 **문서를 실제로 페이지네이션해서 각 헤딩(`h-N`)이 놓인 페이지를 읽어와** 채웁니다. 세 가지가 핵심입니다:

1. **폴리필은 `webContents.executeJavaScript(polyfill)` 로 주입** — 인라인 `<script>` 로 넣으면 HTML 파싱이 깨져 로드되지 않습니다.
2. **오프스크린이지만 *보이는* 창** (`show:true`, 화면 밖 `x/y:-32000`, `opacity:0`, `backgroundThrottling:false`) — 숨김 창은 렌더가 throttle 되어 ~40× 느립니다.
3. **`PagedConfig={auto:false}` + `new Paged.Previewer().preview()` 를 명시적으로 await**.

## 인쇄 파이프라인

인쇄물은 **PDF 내보내기와 같은 문서**(`toStandaloneHtml`)를 사용합니다 — 화면에 보이는 것이 아니라 내보내기 레이아웃을 인쇄하므로, 표지·목차·머리글/바닥글·페이지 번호가 PDF 와 동일합니다.

1. **준비** — [`preparePrint()`](src/lib/export.js) 가 문서 HTML 을 만들고 한 번 페이지네이션해 `{ html, pages, map }` 을 돌려줍니다. `map` 은 `h-N → 페이지 번호` 이며, "현재 페이지"는 편집기 커서 위에 있는 헤딩을 아웃라인에서 찾아 이 맵으로 변환합니다(헤딩이 없으면 본문 섹션 헤딩으로 대체).
2. **페이지 선택** — 1-based 페이지 번호 배열. 선택된 페이지만 남기고 나머지 `.pagedjs_page` 를 **DOM 에서 제거**합니다. 프린터 드라이버의 범위 기능에 의존하지 않아 비연속 선택(`1,3`)도 정확합니다.
3. **페이지 번호 고정** — paged.js 는 페이지 번호를 `content: … counter(page)` 로 그리므로, 페이지를 지우면 번호가 1부터 다시 매겨집니다. 제거 **전에** counter 를 쓰는 마진 박스를 찾아 `content` 안의 `counter(page)` 만 문자열 리터럴로 바꾼 규칙을 주입해, 원래 번호가 유지되게 합니다.
4. **출력**
   - **Electron** — `print:document` 가 오프스크린 렌더 창에서 위 과정을 수행한 뒤 `webContents.print(options)`. 옵션: `deviceName`(프린터), `copies`, `collate`, `color`, `duplexMode`, `landscape`, `scaleFactor`, `pagesPerSheet`, `silent`. 프린터 목록은 `print:printers`(`getPrintersAsync`).
   - **Web** — 같은 과정을 **화면 밖 iframe**에서 수행합니다. paged.js 폴리필은 에셋 URL(`?url`)로 주입하고, `<body>` 가 생긴 뒤에야 부모에서 `new Paged.Previewer().preview()` 를 호출합니다(헤드 스크립트에서 바로 실행하면 `document.body` 가 없어 실패). 이후 `iframe.contentWindow.print()`. iframe 뷰포트는 일부러 낮게(640px) 잡습니다 — 표지의 `min-height: calc(100vh - 96px)` 가 한 페이지보다 커지면 paged.js 가 페이지를 나누지 못해 멈춥니다. 페이지네이션에는 20초 상한이 걸려 있어 실패해도 UI 가 멈추지 않습니다.

## 설정 창 (별도 창)

설정은 `#settings` 라우트로 렌더되는 **별도의 이동 가능한 창**입니다([main.jsx](src/main.jsx)가 해시로 분기 → [SettingsPage](src/components/SettingsPage.jsx) + [SettingsForm](src/components/SettingsForm.jsx)). 언어·테마·시스템 폰트·크기·줄 간격·표지/목차/머리글·바닥글·페이지 번호를 설정합니다. `localStorage` + `storage` 이벤트로 메인 창과 양방향 동기화됩니다. 테마 목록은 [src/lib/themes.js](src/lib/themes.js).

## IPC 표면 (Electron)

`app:getInfo`, `dialog:openTextFile`(.mtg 열기), `dialog:saveText`, `dialog:saveBinary`,
`fs:writeText`(대화상자 없이 기존 경로에 덮어쓰기 — Ctrl+S),
`export:pdf`(paged.js), `export:paginate`(목차 페이지맵),
`print:info`(총 페이지 + 헤딩 페이지맵), `print:document`(페이지 선택 + 인쇄 옵션), `print:printers`,
`menu:popup`(네이티브 컨텍스트 메뉴 — `{shown,id}` 반환),
`settings:open`/`settings:load`/`settings:save`, `about:open`, `shell:showItem`,
`win:*`(minimize/toggleMaximize/close/isMaximized).
메인 프로세스는 `setPermissionRequestHandler` **와 `setPermissionCheckHandler`** 로 `local-fonts` 권한을 허용해 `queryLocalFonts()` 를 지원합니다. 체크 핸들러가 없으면 보조 창(설정 창)이 권한을 거부당해 내장 폴백 목록(30여 개)만 보게 됩니다. 열거에 성공한 목록은 `mtg-fonts` 로 공유되고, 폰트 선택기는 현재 선택된 글꼴이 목록에 없더라도 항목으로 함께 표시합니다(그렇지 않으면 `<select>` 가 조용히 "시스템 기본"으로 보이고, 한 번의 클릭으로 사용자의 선택이 지워집니다).
메인 창을 닫으면 `win.on('closed')` 에서 나머지 모든 창(설정/정보)을 destroy 하고 앱을 종료합니다.

## 빌드 파이프라인

`prebuild:<os>` → 아이콘 + build-info 생성 → `vite build` → `electron-builder --<os>` → `postbuild:<os>` → 설치 파일을 루트로 복사.
`prestart`/`predev`/`preweb` 는 `build-info.json` 을 먼저 생성해 About 대화상자가 항상 정보를 표시하도록 합니다.
