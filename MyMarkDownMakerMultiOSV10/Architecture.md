# Architecture — MyMarkDownMaker

## 개요

하나의 React 앱을 두 런타임에서 실행합니다.

- **Web** — 순수 브라우저. 파일 접근은 `<input type="file" webkitdirectory>` 와 Blob 다운로드, PDF 는 인쇄 대화상자.
- **Electron** — 동일한 `dist/` 를 `file://` 로 로드하고, 파일시스템·대화상자·PDF(printToPDF)·시스템 폰트 권한을 IPC(preload)로 노출.

플랫폼 차이는 [src/lib/platform.js](src/lib/platform.js) 한 곳에서 흡수하여, UI 컴포넌트는 런타임을 신경 쓰지 않습니다.

```
┌─────────────────────────── Renderer (React) ───────────────────────────┐
│  App.jsx  — 상태·동작 오케스트레이션, 자동 병합(live preview)            │
│   ├─ TitleBar / Toolbar(내보내기 + 빠른설정) / Options / StatusBar     │
│   ├─ FileList(선택·정렬·순서)   OutlineTree(전체 구조)                   │
│   ├─ Preview(표지·목차·그림목차·본문) / Editor + FigureList              │
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
│   │   ├── markdown.js    # 병합/번호/구조/그림/렌더/표지·목차·그림목차 HTML/파일명
│   │   ├── images.js      # 로컬 이미지 인라인 + `mmm-img:N` 이미지 스토어
│   │   ├── export.js      # 포맷별 내보내기(md/html/pdf/word) + PDF 폴백 템플릿
│   │   ├── fonts.js       # 시스템 폰트 열거 (queryLocalFonts + 폴백)
│   │   ├── themes.js      # 테마 목록(THEMES)
│   │   ├── platform.js    # 웹/Electron 추상화 (저장/다운로드/PDF)
│   │   └── ico.js         # ICO/ICNS 인코더 (아이콘 생성 공유)
│   └── components/
│       ├── TitleBar.jsx    FileList.jsx    OutlineTree.jsx   FigureList.jsx
│       ├── ConfirmCloseDialog.jsx (종료 시 저장 확인)
│       ├── AboutDialog.jsx
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
| `mergeFilesAsync(files, opts, onProgress)` | 청크 단위 비동기 병합(대용량 진행률 팝업용, 이벤트 루프 양보) |
| `applyHeadingNumbering(md)` | 헤딩에 계층 번호(1, 1.1 …) 부여. 펜스 코드블록은 건너뜀 |
| `stripHeadingNumbers(md)` | 누적된 기존 번호 제거 |
| `renumberHeadings(md)` | strip → apply. "번호 다시 매기기" 동작 |
| `getOutline(md)` | 헤딩 트리 `{level,text,line,index}` 추출 (구조 보기용) |
| `getFigures(md)` | 그림 목록 `{index,line,start,length,alt,src,width,caption}` 추출(`![](…)` + `<img>`, 펜스 건너뜀) |
| `renderHtml(md,opts)` | `mmm-img:N` → data URI 확장 + marked 렌더 + `id="h-N"`/`id="fig-N"` 부여 + `figureCaptions` 시 단독 이미지를 `<figure>`+`그림 N.` 캡션으로 감쌈 + DOMPurify 살균 |
| `setFigureWidth(md,fig,pct)` | 그림 표시 폭(`"w=60%"` 힌트)을 원문에 기록 / 해제 |
| `stripFigureNumberPrefix(text)` | 캡션에 이미 있는 그림 번호(`그림 3-1`, `[그림 5]`, `Figure 2.`, `1-1.`) 제거 — 문서가 번호를 새로 매기므로 중복 방지. 단독 숫자 + 공백(`2024 매출 그래프`)은 남김 |
| `renderCoverHtml(coverMd,opts)` | 표지 블록 Markdown → 표지 페이지(앵커 부여 안 함). 제목 글꼴/크기/정렬과 버전·작성자·날짜 정렬을 **인라인 style 로** 넣음 — Word 는 클래스 규칙을 무시하므로 인라인이어야 미리보기·PDF·doc 이 같아짐 |
| `renderIndexHtml(blockMd,opts)` | 목차/그림목차 블록(`- [제목](#h-0)` 목록) → 3셀 테이블(제목/여백/우측 페이지번호). 들여쓰기=깊이, 앵커로 `pageMap` 조회, 최상위 굵게 |
| `fitCodeBlocks(html,basePx)` | 넓은 코드블록/ASCII 도형의 글꼴을 줄여 페이지 폭(`PAGE_CONTENT_PX`)에 맞춤. 줄바꿈은 박스 그림을 깨므로 금지. 한글 등 East Asian Wide 글자는 두 칸으로 계산 |
| `fitContentTables(html)` | 본문 표에 `<colgroup>`+인라인 고정 레이아웃 주입(Word·PDF에서 페이지 폭에 맞춤) |
| `toStandaloneHtml(md,title,settings)` | 내보내기용 단독 HTML(글꼴·크기·줄간격·표지·목차·그림목차·@page 머리글/바닥글/페이지번호, 인쇄 시 body 리셋) |
| `buildMergedMarkdownDocument(md)` | Markdown 내보내기 — 이미지 참조를 data URI 로 확장하고 크기 지정 이미지를 `<img width>` 로 변환 |
| `renderPreviewHtml(md,settings)` | 미리보기 조각 — 표지 + 목차 + 그림목차 + 본문(페이지 번호 없음) |
| `sanitizeExportName(name)` / `sortFiles` | 파일명 정리 / 정렬 |

번호 매기기 정규식과 계층 카운터 로직은 Windows 원본(`MDMakerWinV10/MarkdownConverter.cs`)의 동작을 그대로 이식했습니다.

### 넘버링 규칙
- 카운터 배열 `counters[0..5]`(H1~H6). 헤딩을 만나면 해당 레벨 카운터를 증가시키고 하위 레벨을 0으로 리셋.
- 상위 레벨이 0인 구간은 접두사에서 생략 → 문서가 H2로 시작해도 `1`, `1.1` 로 자연스럽게 번호가 붙음.
- 적용 전 기존 번호 토큰(`1`, `1.2`, `1)`, `(1)`, `1.` 등)을 제거하여 중복 방지.
- 코드 펜스(```` ``` ````, `~~~`) 내부의 `#` 은 헤딩으로 오인하지 않음.

## 문서 구조 — 표지/목차/그림목차를 원문에 담기

병합 결과(`merged`)는 **본문만**이 아니라 **문서 전체**입니다. 표지·목차·그림 목차가 HTML 주석 표시로 감싸인 Markdown 블록으로 들어 있어, 미리보기가 보여 주는 것과 편집 탭이 고치는 것과 내보내지는 것이 모두 같은 하나의 텍스트입니다.

```
<!-- mmm:cover -->      # 제목 / 부제 / 버전·작성자·날짜
<!-- mmm:toc -->        ## 목차 + `- [1 개요](#h-0)` 목록
<!-- mmm:figures -->    ## 그림 목차 + `- [그림 1. …](#fig-0)` 목록
(마커 밖의 나머지)       본문
```

| 함수 | 역할 |
|------|------|
| `splitDocument(md)` | `{ cover, toc, figures, body }` 로 분해 |
| `composeDocument(parts)` | 마커를 붙여 다시 합침 |
| `buildDocument(body, s)` | 본문 + 설정 → 문서 전체 생성(설정이 각 블록의 유무를 결정) |
| `refreshFrontMatter(md, s)` | 본문은 그대로 두고 표지/목차/그림목차만 재생성 |
| `renderPreviewHtml(md, s)` | 미리보기용 조각(표지 + 목차 + 그림목차 + 본문) |

핵심 규칙:

- `getOutline` / `getFigures` / 헤딩 번호 매기기는 **마커 안의 줄을 건너뜁니다**(`scanSections` 의 `inSection` 플래그). 그래서 표지 제목에 번호가 붙거나 `## 목차` 가 구조 트리에 나타나는 일이 없고, `h-N` / `fig-N` 인덱스는 언제나 본문 기준입니다. 다만 `getFigures` 의 `start` 오프셋은 건너뛴 줄까지 세어 **문서 전체 기준 절대 위치**를 유지합니다(편집기가 이 값으로 선택).
- 목차 항목의 `(#h-N)` 앵커가 페이지 번호 조회 키입니다. 제목 글자를 사용자가 고쳐도 앵커만 남아 있으면 번호가 정상적으로 채워지고, 앵커가 없는 항목은 번호 없이 렌더됩니다.
- 내보내기는 `s.tocPage` 같은 설정이 아니라 **문서에 그 블록이 있는지**로 판단합니다. 설정은 블록을 *만들 때*(`buildDocument`)만 쓰입니다.
- 목차 항목은 **한 줄에 하나**입니다. `.toc-c-title` 은 반드시 `white-space:nowrap` 이어야 합니다 — 옆의 `.toc-c-dots` 가 `width:100%` 라서, 제목 셀에 줄바꿈을 허용하면 셀 폭이 0 으로 눌려 글자가 세로로 한 자씩 쌓입니다(Word 는 이 CSS 를 무시해 정상으로 보이므로 PDF/HTML 에서만 드러남).

## 이미지 처리 ([src/lib/images.js](src/lib/images.js))

병합 문서는 자기완결적이어야 하므로(미리보기·HTML·PDF·Word 어디서나 그림이 보여야 함) 로컬 이미지는 가져올 때 Base64 data URI 로 읽어들입니다. 다만 그 data URI 를 **본문 텍스트에 그대로 넣으면 편집 탭이 수 MB 짜리 base64 로 뒤덮여 사실상 편집이 불가능**해집니다. 그래서 두 단계로 나눕니다.

1. **가져오기** — `embedImages(content, resolveSrc)` 가 로컬 `src` 를 찾고, `resolveSrc` 가 data URI 를 만들면 `registerImage(uri, 파일명)` 이 모듈 수준 스토어에 넣고 **짧은 참조 `mmm-img:N`** 을 돌려줍니다. 본문에는 이 참조만 남습니다(동일 이미지는 내용 키로 중복 제거). Electron 은 `fs:embedImage` IPC, 웹 폴더 업로드는 `readFileDataURL` 로 원본을 읽습니다.
2. **펼치기** — `expandImageRefs(text)` 가 참조를 원래 data URI 로 되돌립니다. `renderHtml`(미리보기·HTML·PDF·Word)과 `buildMergedMarkdownDocument`(.md) 내부에서 자동으로 호출되므로, **호출자는 항상 참조 형태의 Markdown 만 다루면 됩니다.**

썸네일 표시는 `imageDisplaySrc(src)`(참조 → data URI, 원격 URL 은 그대로)를 씁니다. `clearImages()` 는 "비우기" 에서 스토어를 정리합니다.

**그림 크기**는 Markdown 이미지 제목 자리에 `w=<퍼센트>%` 힌트로 적습니다(`![설명](mmm-img:1 "w=60%")`). Markdown 에 크기 문법이 없어서 고른 방식으로, 편집 탭에서 눈에 보이고 다른 렌더러는 그냥 무시합니다. `setFigureWidth(md, figure, pct)` 가 원문을 고쳐 쓰고, `applyFigureSizes(html)` 가 렌더 단계에서 `width="60%" style="width:60%"`(Word 는 속성, Chromium/paged.js 는 스타일)로 바꿉니다. Markdown 내보내기는 크기가 지정된 이미지만 `<img … width>` 태그로 바꿔 앱 밖에서도 크기가 유지되게 합니다.

## 상태·데이터 흐름 (App.jsx)

- **자동 병합(live preview)** — `files`(체크/순서), `insertFileHeaders`, `numberHeadings` 가 바뀌면 `useEffect` 가 `mergeFilesAsync` 로 병합을 다시 수행해 `merged` 를 갱신. 미리보기·구조·상태바가 즉시 반영됩니다. 별도 병합/번호 버튼은 없으며, 병합이 300ms 이상 걸리면 진행률 팝업(`MergeProgressDialog`)이 뜹니다. `seq` 가드로 중복/역순 실행을 방지합니다. (편집 탭의 수동 수정은 다음 선택 변경 시 소스 기준으로 덮어써짐)
- **파생값** — `outline`(구조), `figures`(그림 목록), `previewHtml`(렌더), `stats`(단어/글자), `firstCheckedName`(내보내기 기본 파일명) 은 `useMemo` 로 계산.
- **그림 보기** — 사이드바 **그림** 탭과 편집 탭 우측 패널이 같은 `FigureList` 를 씁니다. 항목 클릭은 `gotoFigure()` — 미리보기면 `#fig-N` 으로 스크롤, 편집 중이면 `start/length` 로 원문의 이미지 링크를 선택. 반대로 편집기 커서 위치는 `syncFigureToCaret()` 이 `activeFigure` 로 되돌려 강조합니다.
- **내보내기 옵션** — `buildExportOpts()` 는 `{...기본값, ...localStorage, ...라이브상태}` 순으로 병합해 설정창에서 바꾼 폰트·크기·줄간격이 항상 내보내기에 반영되도록 합니다(미리보기와 일치).
- **영속화** — 테마(`mmm-theme`), 언어(`mmm-lang`), 내보내기 서식(`mmm-export`) 은 localStorage 에 저장(Electron 은 userData JSON 미러도 유지).
- **툴바 빠른 설정** — 표지/목차/그림목차/페이지번호 토글과 글꼴 크기 ± 는 `exportSettings` 를 직접 고칩니다(`toggleExportSetting` / `bumpFontSize`). 설정 창과 같은 상태·같은 저장소를 쓰므로 별도 동기화 코드가 없고, 표지·목차 토글은 `frontKey` 를 바꿔 문서 앞부분을 다시 만들게 합니다.
- **화면 확대/축소** — `zoom`(50~300%, `mmm-zoom` 에 저장)은 **표시 전용**입니다. 미리보기는 CSS `zoom`, 편집기는 글꼴 크기로 적용하며 `merged` 나 내보내기에는 전혀 관여하지 않습니다. Ctrl +/−/0 과 Ctrl+휠 은 window 리스너로 받습니다.
- **표지/목차 재생성** — 표지·목차 관련 설정과 파일 이름·언어를 묶은 `frontKey` 가 바뀌면 `refreshFrontMatter` 로 앞부분만 다시 만들고 본문은 그대로 둡니다(값이 같으면 `setMerged` 를 건너뛰어 루프를 막습니다).
- **종료 시 저장 확인** — `merged` 가 마지막으로 성공한 내보내기 내용(`savedTextRef`)과 다르면 "변경됨" 입니다. Electron 은 메인 프로세스가 `win.on('close')` 를 붙잡아 `app:requestClose` 를 보내고, 렌더러가 저장/버림을 정한 뒤 `win:confirmClose` 로 실제 종료를 요청합니다(취소 = 아무 것도 안 보냄). 웹은 `beforeunload` 로 브라우저 기본 경고를 씁니다. "저장" 은 Markdown 내보내기이며, 저장 대화상자를 취소하면 종료도 취소됩니다.

## 내보내기 파이프라인 ([src/lib/export.js](src/lib/export.js))

| 포맷 | 방식 |
|------|------|
| Markdown | `buildMergedMarkdownDocument` — 문서가 이미 표지/목차를 품고 있으므로 이미지 참조만 data URI 로 펼치고 크기 지정 이미지를 `<img width>` 로 변환 |
| (공통) | `measureImages` → `fitImages` — 모든 그림의 실제 픽셀 크기를 재어 A4 본문 상자(673×886px @96dpi)에 맞는 `width`/`height` 속성으로 못박음. **Word 는 `img{max-width:100%}` 를 무시하고 원본 크기로 인쇄**하고, Chromium/paged.js 는 폭은 맞춰도 **세로로 긴 그림은 줄이지 못하므로** 두 경우 다 이 단계가 필요합니다. `"w=60%"` 힌트도 여기서 페이지 폭 기준 픽셀로 환산되며, 페이지네이션 측정도 같은 fitted HTML 로 해야 페이지 번호가 맞습니다 |
| HTML | `toStandaloneHtml`(표지/목차/@page CSS) → 저장. Electron 은 `export:paginate` 로 목차 페이지 번호를 미리 계산해 baking |
| PDF | Electron: **paged.js** 로 페이지네이션 후 `printToPDF`. 목차 `.toc-c-pg` 셀을 실제 페이지 번호로 채우고, 머리글/바닥글/페이지번호는 @page 마진박스. paged.js 없으면 `printToPDF` 템플릿으로 폴백. Web: 인쇄 창(`Save as PDF`) |
| Word | **MHT(multipart/related)** `.doc` — `toStandaloneHtml({forWord:true})` + Office 네임스페이스/ProgId, base64 이미지는 별도 MIME 파트. 목차 페이지 번호는 `export:paginate` 로 미리 계산해 baking |

- **표지(Cover)**: 제목은 `coverTitle` 설정(비우면 문서 제목), 부제=머리글 문구, 버전/작성자/날짜 포함. **목차(Index)**: 본문 앞 별도 페이지, 각 항목 오른쪽에 실제 페이지 번호(H1 굵게).
- **그림 목차(List of Figures)**: 목차 다음의 별도 페이지(`figurePage`, 기본 켬). 항목은 `그림 N. 설명` → `#fig-N` 앵커, 오른쪽에 실제 페이지 번호. **문서에 그림이 하나도 없으면 페이지 자체를 만들지 않습니다**(빈 목차 방지) — `figureIndexHtml` 이 `''` 을 반환하고 본문 캡션도 붙지 않습니다.
- 파일 이름은 첫 병합 파일 이름을 기본값으로 하며 내보내기 드롭다운에서 수정할 수 있습니다.

### paged.js 페이지네이션 (메인 프로세스, `electron/main.js`)

목차/그림 목차 페이지 번호는 **문서를 실제로 페이지네이션해서 각 헤딩(`h-N`)과 그림(`fig-N`)이 놓인 페이지를 읽어와** 채웁니다. 두 목차 모두 같은 한 번의 페이지네이션 결과(`export:paginate` 가 반환하는 하나의 맵)를 씁니다. 다음 세 가지가 핵심입니다(모두 디버깅으로 확정된 함정 회피):

1. **폴리필은 `webContents.executeJavaScript(polyfill)` 로 주입** — 인라인 `<script>` 로 넣으면 HTML 파싱이 깨져 SyntaxError 로 로드되지 않습니다.
2. **오프스크린이지만 *보이는* 창** (`show:true`, 화면 밖 `x/y:-32000`, `opacity:0`, `skipTaskbar`, `backgroundThrottling:false`) — `show:false` 숨김 창은 렌더가 throttle 되어 ~40× 느려집니다.
3. **`PagedConfig={auto:false}` + `new Paged.Previewer().preview()` 를 명시적으로 await** — auto-run `after` 훅은 이 환경에서 신뢰할 수 없습니다.

헬퍼: `createRenderWindow()` / `injectPagedConfig()` / `pagedDriver(polyfill, tailJs)`. `export:paginate` 는 `h-N`/`fig-N → 페이지번호` 맵을 반환하고(Word/HTML 용), `export:pdf` 는 같은 방식으로 페이지네이션 후 목차 셀을 채워 `printToPDF(preferCSSPageSize, margins 0)`.

- **인쇄 시 body 리셋** — `@media print{body{margin:0;padding:0;max-width:none}}` 로 body 패딩/최대폭이 paged.js A4 페이지를 밀어 빈 페이지가 생기는 것을 방지. 표지 상단 여백은 `vh` 대신 `em` 고정.
- **표 폭 맞춤** — `fitContentTables` 가 본문 표에 `<colgroup>` + 인라인 `table-layout:fixed`(+`mso-table-layout-alt`)를 주입해 Word·PDF 모두 페이지 폭 안에서 줄바꿈.
- **주의**: Word 는 열 때 자체적으로 다시 페이지를 나누므로 목차 번호는 A4 기준 근사값입니다.

## 설정 창 (별도 창)

설정 창(1240×585)과 정보 창(520×400)은 모두 **고정 크기(resizable:false)** 입니다. 폼을 `columns: 3` 으로 배치해 한국어·영어 모두 스크롤 없이 한 화면에 들어가며(Electron 으로 실측 확인), `.settings-page-body` 는 `overflow:hidden` 입니다. 항목을 더 넣을 때는 이 두 가지를 함께 확인해야 합니다.

설정은 `#settings` 라우트로 렌더되는 **별도의 이동 가능한 창**입니다([main.jsx](src/main.jsx)가 해시로 분기 → [SettingsPage](src/components/SettingsPage.jsx) + [SettingsForm](src/components/SettingsForm.jsx)). Electron은 프레임리스 `BrowserWindow`(커스텀 타이틀바=드래그 영역), 웹은 `window.open`. 설정/테마/언어는 `localStorage` + `storage` 이벤트로 메인 창과 양방향 동기화됩니다. 테마 목록은 [src/lib/themes.js](src/lib/themes.js).

## IPC 표면 (Electron)

`app:getInfo`, `fs:home`, `dialog:pickDirectory`, `fs:scanMarkdown`, `fs:readFile(s)`, `fs:embedImage`, `dialog:openFiles`,
`dialog:saveText`, `dialog:saveBinary`, `export:pdf`(paged.js), `export:paginate`(목차·그림목차 페이지맵),
`win:confirmClose`(저장 확인 후 실제 종료) + `app:requestClose`(메인→렌더러 알림),
`settings:open`/`settings:load`/`settings:save`, `about:open`, `shell:showItem`,
`win:*`(minimize/toggleMaximize/close/isMaximized).
메인 프로세스는 `session.setPermissionRequestHandler` 로 `local-fonts` 권한을 허용해 `queryLocalFonts()` 를 지원합니다.
메인 창을 닫으면 `win.on('closed')` 에서 나머지 모든 창(설정/정보)을 destroy 하고 앱을 종료합니다.

## 빌드 파이프라인

`prebuild:<os>` → 아이콘 + build-info 생성 → `vite build` → `electron-builder --<os>` → `postbuild:<os>` → 설치 파일을 루트로 복사.
`prestart`/`predev`/`preweb` 는 `build-info.json` 을 먼저 생성해 About 대화상자가 항상 정보를 표시하도록 합니다.
