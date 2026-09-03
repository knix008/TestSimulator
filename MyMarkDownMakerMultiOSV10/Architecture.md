# Architecture — MyMarkDownMaker

## 개요

하나의 React 앱을 두 런타임에서 실행합니다.

- **Web** — 순수 브라우저. 파일 접근은 `<input type="file" webkitdirectory>` 와 Blob 다운로드, PDF 는 인쇄 대화상자.
- **Electron** — 동일한 `dist/` 를 `file://` 로 로드하고, 파일시스템·대화상자·PDF(printToPDF)·시스템 폰트 권한을 IPC(preload)로 노출.

플랫폼 차이는 [src/lib/platform.js](src/lib/platform.js) 한 곳에서 흡수하여, UI 컴포넌트는 런타임을 신경 쓰지 않습니다.

```
┌─────────────────────────── Renderer (React) ───────────────────────────┐
│  App.jsx  — 상태·동작 오케스트레이션, 자동 병합(live preview)            │
│   ├─ TitleBar / Toolbar(+Export dropdown) / Options / StatusBar         │
│   ├─ FileList(선택·정렬·순서)   OutlineTree(전체 구조)                   │
│   ├─ Preview(markdown-body) / Editor                                     │
│   └─ SettingsDialog · AboutDialog · ContextMenu · Tooltip               │
│                                                                          │
│  lib/markdown.js — merge · renumber · outline · render · toStandaloneHtml│
│  lib/export.js   — md · html · pdf · word (+PDF header/footer templates) │
│  lib/fonts.js    — queryLocalFonts (system fonts)                        │
│  lib/platform.js — isElectron / saveText / saveBlob / exportPdf         │
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
MyMarkDownMakerMultiOSV10/
├── electron/
│   ├── main.js            # BrowserWindow, IPC, printToPDF, local-fonts 권한, 창 제어
│   └── preload.js         # contextBridge 로 electronAPI 노출
├── scripts/
│   ├── start-electron.mjs # ELECTRON_RUN_AS_NODE 제거 후 Electron 실행
│   ├── generate-icons.mjs # SVG → ico/icns/png
│   ├── generate-build-info.mjs  # src/build-info.json (About 정보)
│   └── copy-installer.js  # release/ 산출물을 루트로 복사
├── src/
│   ├── App.jsx            # 상태·동작 오케스트레이션
│   ├── i18n.js            # ko/en 리소스
│   ├── build-info.json    # 빌드 메타(생성물, gitignore)
│   ├── lib/
│   │   ├── markdown.js    # 병합/번호/구조/렌더/표지·목차 HTML/파일명
│   │   ├── export.js      # 포맷별 내보내기(md/html/pdf/word) + PDF 폴백 템플릿
│   │   ├── fonts.js       # 시스템 폰트 열거 (queryLocalFonts + 폴백)
│   │   ├── themes.js      # 테마 목록(THEMES)
│   │   ├── platform.js    # 웹/Electron 추상화 (저장/다운로드/PDF)
│   │   └── ico.js         # ICO/ICNS 인코더 (아이콘 생성 공유)
│   └── components/
│       ├── TitleBar.jsx    FileList.jsx    OutlineTree.jsx   AboutDialog.jsx
│       ├── SettingsPage.jsx  SettingsForm.jsx  (별도 설정 창)
│       ├── ContextMenu.jsx   Tooltip.jsx     Icons.jsx
├── assets/icon.svg        # 앱 아이콘 원본 (Markdown 문서 병합 테마)
├── public/icon.svg        # UI(<img>)에서 로드하는 사본
├── build/
│   ├── installer.nsh      # NSIS 커스텀 (바로가기 선택 페이지)
│   └── icons/             # 생성된 아이콘 (빌드시 자동 생성)
├── vite.config.js         # base:'./' (file:// 로드 대응), 포트 5178
└── package.json           # scripts + electron-builder 설정 + allowScripts
```

## 핵심 로직 ([src/lib/markdown.js](src/lib/markdown.js))

| 함수 | 역할 |
|------|------|
| `mergeFiles(files, opts)` | 선택 파일을 `---` 로 병합, 옵션 시 `## 상대경로` 헤더 삽입 |
| `applyHeadingNumbering(md)` | 헤딩에 계층 번호(1, 1.1 …) 부여. 펜스 코드블록은 건너뜀 |
| `stripHeadingNumbers(md)` | 누적된 기존 번호 제거 |
| `renumberHeadings(md)` | strip → apply. "번호 새로 매기기" 동작 |
| `getOutline(md)` | 헤딩 트리 `{level,text,line,index}` 추출 (구조 보기용) |
| `renderHtml(md)` | marked 렌더 + 헤딩에 `id="h-N"` 부여 + DOMPurify 살균 |
| `toStandaloneHtml(md,title,settings)` | 내보내기용 단독 HTML(글꼴·크기·@page 머리글/바닥글/페이지번호) |
| `sanitizeExportName(name)` | 사용자 지정 파일명 정리 |
| `sortFiles` / `isExcluded` | 정렬 / 와일드카드 제외 |

번호 매기기 정규식과 계층 카운터 로직은 Windows 원본(`MDMakerWinV10/MarkdownConverter.cs`)의 동작을 그대로 이식했습니다.

### 넘버링 규칙
- 카운터 배열 `counters[0..5]`(H1~H6). 헤딩을 만나면 해당 레벨 카운터를 증가시키고 하위 레벨을 0으로 리셋.
- 상위 레벨이 0인 구간은 접두사에서 생략 → 문서가 H2로 시작해도 `1`, `1.1` 로 자연스럽게 번호가 붙음.
- 적용 전 기존 번호 토큰(`1`, `1.2`, `1)`, `(1)`, `1.` 등)을 제거하여 중복 방지.
- 코드 펜스(```` ``` ````, `~~~`) 내부의 `#` 은 헤딩으로 오인하지 않음.

## 상태·데이터 흐름 (App.jsx)

- **자동 병합(live preview)** — `files`(체크/순서), `insertFileHeaders`, `numberHeadings` 가 바뀌면 `useEffect` 가 병합을 다시 수행해 `merged` 를 갱신. 미리보기·구조·상태바가 즉시 반영됩니다. (편집 탭의 수동 수정은 다음 선택 변경 시 소스 기준으로 덮어써짐)
- **파생값** — `outline`(구조), `previewHtml`(렌더), `stats`(단어/글자), `firstCheckedName`(내보내기 기본 파일명) 은 `useMemo` 로 계산.
- **영속화** — 테마(`mmm-theme`), 언어(`mmm-lang`), 내보내기 서식(`mmm-export`) 은 localStorage 에 저장.

## 내보내기 파이프라인 ([src/lib/export.js](src/lib/export.js))

| 포맷 | 방식 |
|------|------|
| Markdown | `buildMergedMarkdownDocument`(표지 + 목차 + 본문, `---` 구분) |
| HTML | `toStandaloneHtml`(표지/목차/@page CSS) → 저장 |
| PDF | Electron: **paged.js**로 페이지네이션 후 `printToPDF`(목차 페이지 번호=`target-counter`, 머리글/바닥글/페이지번호=@page 마진박스). paged.js 실패 시 `printToPDF` 템플릿으로 폴백. Web: 인쇄 창(`Save as PDF`) |
| Word | `html-docx-js-typescript.asBlob(html)` → `.docx` (지연 로드로 초기 번들에서 분리) |

- **표지(Cover)**: 제목은 `coverTitle` 설정(비우면 문서 제목), 부제=머리글 문구, 날짜 포함. **목차(Index)**: 본문 앞 별도 페이지, PDF는 실제 페이지 번호 표시.
- 파일 이름은 첫 병합 파일 이름을 기본값으로 하며 내보내기 드롭다운에서 수정할 수 있습니다.
- **paged.js**는 렌더러가 아닌 **메인 프로세스**에서 `paged.polyfill.js`를 임시 HTML에 인라인 주입 → 숨김 창에서 `window.__pagedReady` 대기 → `printToPDF(preferCSSPageSize, margins 0)`.

## 설정 창 (별도 창)

설정은 `#settings` 라우트로 렌더되는 **별도의 이동 가능한 창**입니다([main.jsx](src/main.jsx)가 해시로 분기 → [SettingsPage](src/components/SettingsPage.jsx) + [SettingsForm](src/components/SettingsForm.jsx)). Electron은 프레임리스 `BrowserWindow`(커스텀 타이틀바=드래그 영역), 웹은 `window.open`. 설정/테마/언어는 `localStorage` + `storage` 이벤트로 메인 창과 양방향 동기화됩니다. 테마 목록은 [src/lib/themes.js](src/lib/themes.js).

## IPC 표면 (Electron)

`app:getInfo`, `dialog:pickDirectory`, `fs:scanMarkdown`, `fs:readFile(s)`, `dialog:openFiles`,
`dialog:saveText`, `dialog:saveBinary`, `export:pdf`(paged.js), `settings:open`(별도 설정 창),
`shell:showItem`, `win:*`(minimize/toggleMaximize/close/isMaximized).
메인 프로세스는 `session.setPermissionRequestHandler` 로 `local-fonts` 권한을 허용해 `queryLocalFonts()` 를 지원합니다.

## 빌드 파이프라인

`prebuild:<os>` → 아이콘 + build-info 생성 → `vite build` → `electron-builder --<os>` → `postbuild:<os>` → 설치 파일을 루트로 복사.
`prestart`/`predev`/`preweb` 는 `build-info.json` 을 먼저 생성해 About 대화상자가 항상 정보를 표시하도록 합니다.
