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
│   ├─ TitleBar / Toolbar(New·Sample·Open·Save·Export dropdown) / Status  │
│   ├─ Details(회의 정보 폼: 제목·날짜(달력+직접)·참석자·안건 …)          │
│   ├─ OutlineTree(문서 구조)                                             │
│   ├─ Editor(본문 직접 입력) / Preview(완성 회의록 렌더)                 │
│   └─ SettingsPage · AboutPage · ContextMenu · ErrorDialog · Tooltip     │
│                                                                          │
│  lib/meeting.js  — meeting ↔ Markdown/평문 직렬화 + 섹션 번호 매기기     │
│  lib/markdown.js — render · outline · toStandaloneHtml(표지/목차)       │
│  lib/export.js   — md · html · pdf · word (+PDF 머리글/바닥글 템플릿)    │
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
│   ├── main.js            # BrowserWindow, IPC, printToPDF, local-fonts 권한, 창 제어
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
│   │   ├── meeting.js     # meeting 모델 + Markdown/평문 직렬화 + numberSections
│   │   ├── markdown.js    # 렌더/구조/표지·목차 HTML/파일명 (재사용 엔진)
│   │   ├── export.js      # 포맷별 내보내기(md/html/pdf/word) + PDF 폴백 템플릿
│   │   ├── fonts.js       # 시스템 폰트 열거 (queryLocalFonts + 폴백)
│   │   ├── themes.js      # 테마 목록(THEMES)
│   │   ├── platform.js    # 웹/Electron 추상화 (저장/열기/PDF)
│   │   └── ico.js         # ICO/ICNS 인코더 (아이콘 생성 공유)
│   └── components/
│       ├── TitleBar.jsx    OutlineTree.jsx   AboutPage.jsx
│       ├── SettingsPage.jsx  SettingsForm.jsx  (별도 설정 창)
│       ├── ExportResultDialog.jsx  ExportProgressDialog.jsx
│       ├── ErrorDialog.jsx  (복사 가능한 상세 오류 팝업)
│       ├── ContextMenu.jsx   Toasts.jsx   Tooltip.jsx   Icons.jsx
├── assets/icon.svg        # 앱 아이콘 원본 (회의록 + 참석자 테마)
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
- **편집 방식** — 회의 정보(제목·날짜·참석자 등)는 좌측 "회의 정보" 폼에서, 회의 내용 본문은 메인 창의 "편집" 탭에서 **직접 입력**합니다. "미리보기" 탭에서 완성된 회의록을 확인합니다(기본은 편집 탭).
- **날짜 입력** — 자유 텍스트 입력과 달력 선택을 함께 지원합니다. 달력 버튼은 네이티브 `<input type="date">.showPicker()` 를 열어 선택값(YYYY-MM-DD)을 텍스트 칸에 채웁니다.
- **내보내기 옵션** — `buildExportOpts()` 는 `{...기본값, ...localStorage, ...라이브상태}` 순으로 병합해 설정창에서 바꾼 폰트·크기·줄간격이 항상 내보내기·미리보기에 반영되도록 합니다. 표지 날짜 기본값은 회의 날짜(비면 오늘).
- **영속화** — 작성 중 회의록(`mtg-doc`), 테마(`mtg-theme`), 언어(`mtg-lang`), 내보내기 서식(`mtg-export`) 은 localStorage 에 저장(Electron 은 userData JSON 미러도 유지). 재실행 시 마지막 회의록이 복원됩니다.
- **오류 처리** — 내보내기/열기/저장 오류와 전역 `error`/`unhandledrejection` 은 [ErrorDialog](src/components/ErrorDialog.jsx) 로 표시되며, 상세 내용을 선택·**복사**할 수 있습니다.

## 내보내기 파이프라인 ([src/lib/export.js](src/lib/export.js))

| 포맷 | 방식 |
|------|------|
| Markdown | `buildMergedMarkdownDocument`(표지 + 목차 + 본문) |
| HTML | `toStandaloneHtml`(표지/목차/@page CSS) → 저장. Electron 은 `export:paginate` 로 목차 페이지 번호를 미리 계산해 baking |
| PDF | Electron: **paged.js** 로 페이지네이션 후 `printToPDF`. 목차 셀을 실제 페이지 번호로 채우고, 머리글/바닥글/페이지번호는 @page 마진박스. paged.js 없으면 `printToPDF` 템플릿으로 폴백. Web: 인쇄 창(`Save as PDF`) |
| Word | **MHT(multipart/related)** `.doc` — `toStandaloneHtml({forWord:true})` + Office 네임스페이스/ProgId, base64 이미지는 별도 MIME 파트 |
| 텍스트 | `meetingToPlainText` → `.txt` 저장 |

- **표지(Cover)**: 제목은 `coverTitle` 설정(비우면 회의 제목), 버전/작성자/날짜 포함. **목차(Index)**: 본문 앞 별도 페이지, 각 항목 오른쪽에 실제 페이지 번호(H1 굵게).

### paged.js 페이지네이션 (메인 프로세스, `electron/main.js`)

목차 페이지 번호는 **문서를 실제로 페이지네이션해서 각 헤딩(`h-N`)이 놓인 페이지를 읽어와** 채웁니다. 세 가지가 핵심입니다:

1. **폴리필은 `webContents.executeJavaScript(polyfill)` 로 주입** — 인라인 `<script>` 로 넣으면 HTML 파싱이 깨져 로드되지 않습니다.
2. **오프스크린이지만 *보이는* 창** (`show:true`, 화면 밖 `x/y:-32000`, `opacity:0`, `backgroundThrottling:false`) — 숨김 창은 렌더가 throttle 되어 ~40× 느립니다.
3. **`PagedConfig={auto:false}` + `new Paged.Previewer().preview()` 를 명시적으로 await**.

## 설정 창 (별도 창)

설정은 `#settings` 라우트로 렌더되는 **별도의 이동 가능한 창**입니다([main.jsx](src/main.jsx)가 해시로 분기 → [SettingsPage](src/components/SettingsPage.jsx) + [SettingsForm](src/components/SettingsForm.jsx)). 언어·테마·시스템 폰트·크기·줄 간격·표지/목차/머리글·바닥글·페이지 번호를 설정합니다. `localStorage` + `storage` 이벤트로 메인 창과 양방향 동기화됩니다. 테마 목록은 [src/lib/themes.js](src/lib/themes.js).

## IPC 표면 (Electron)

`app:getInfo`, `dialog:openTextFile`(.mtg 열기), `dialog:saveText`, `dialog:saveBinary`,
`export:pdf`(paged.js), `export:paginate`(목차 페이지맵),
`settings:open`/`settings:load`/`settings:save`, `about:open`, `shell:showItem`,
`win:*`(minimize/toggleMaximize/close/isMaximized).
메인 프로세스는 `session.setPermissionRequestHandler` 로 `local-fonts` 권한을 허용해 `queryLocalFonts()` 를 지원합니다.
메인 창을 닫으면 `win.on('closed')` 에서 나머지 모든 창(설정/정보)을 destroy 하고 앱을 종료합니다.

## 빌드 파이프라인

`prebuild:<os>` → 아이콘 + build-info 생성 → `vite build` → `electron-builder --<os>` → `postbuild:<os>` → 설치 파일을 루트로 복사.
`prestart`/`predev`/`preweb` 는 `build-info.json` 을 먼저 생성해 About 대화상자가 항상 정보를 표시하도록 합니다.
