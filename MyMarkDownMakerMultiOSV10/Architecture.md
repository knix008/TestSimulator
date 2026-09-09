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
│   ├─ Editor + FigureList / Preview(표지·목차·그림목차·본문)              │
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
| `renumberHeadings(md)` | strip → apply. 병합 직후와 편집이 멈춘 뒤 자동으로 호출됨(수동 동작 없음). 줄 단위로 제자리 치환이라 헤딩 이외의 글자는 손대지 않음 |
| `getOutline(md)` | **본문** 헤딩 트리 `{level,text,line,index}` 추출. `index` 가 `h-N` 앵커 |
| `getDocumentOutline(md, labels)` | 구조 탭이 보는 문서 — 표지/목차/그림목차 페이지(`{section,line,text}`) + `getOutline`. 이 페이지들은 헤딩이 아니므로 번호·앵커·목차에서 계속 제외되고, `section` id 로만 이동합니다 |
| `getFigures(md)` | 그림 목록 `{index,line,start,length,alt,src,width,caption}` 추출(`![](…)` + `<img>`, 펜스 건너뜀) |
| `renderHtml(md,opts)` | `mmm-img:N` → data URI 확장 + marked 렌더 + `id="h-N"`/`id="fig-N"` 부여 + `figureCaptions` 시 단독 이미지를 `<figure>`+`그림 N.` 캡션으로 감쌈 + DOMPurify 살균 |
| `setFigureWidth(md,fig,pct)` | 그림 표시 폭(`"w=60%"` 힌트)을 원문에 기록 / 해제 |
| `stripFigureNumberPrefix(text)` | 캡션에 이미 있는 그림 번호(`그림 3-1`, `[그림 5]`, `Figure 2.`, `1-1.`) 제거 — 문서가 번호를 새로 매기므로 중복 방지. 단독 숫자 + 공백(`2024 매출 그래프`)은 남김 |
| `renderCoverHtml(coverMd,opts)` | 표지 블록 Markdown → 표지 페이지(앵커 부여 안 함). 제목 글꼴/크기/정렬과 버전·작성자·날짜 정렬을 **인라인 style 로** 넣음 — Word 는 클래스 규칙을 무시하므로 인라인이어야 미리보기·PDF·doc 이 같아짐 |
| `renderIndexHtml(blockMd,opts)` | 목차/그림목차 블록(`- [제목](#h-0)` 목록) → 3셀 테이블(제목/여백/우측 페이지번호). 들여쓰기=깊이, 앵커로 `pageMap` 조회, 최상위 굵게 |
| `fitCodeBlocks(html,basePx)` | 넓은 코드블록/ASCII 도형의 글꼴을 줄여 페이지 폭(`PAGE_CONTENT_PX`)에 맞춤. 줄바꿈은 박스 그림을 깨므로 금지. 한글 등 East Asian Wide 글자는 두 칸으로 계산 |
| `fitContentTables(html)` | 본문 표에 `<colgroup>`+인라인 고정 레이아웃 주입(Word·PDF에서 페이지 폭에 맞춤) |
| `toStandaloneHtml(md,title,settings)` | 내보내기용 단독 HTML(글꼴·크기·줄간격·표지·목차·그림목차·@page 머리글/바닥글/페이지번호, 인쇄 시 body 리셋). `forWord` 면 `WordSection1` 로 감싸고 Word 전용 머리글/바닥글 블록을 붙임 |
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
| `refreshFrontMatter(md, s)` | 본문은 그대로 두고 표지/목차/그림목차만 재생성 (설정 변경 시) |
| `firstHeadingText(md)` | 블록의 첫 헤딩 글자 — 표지 제목을 읽어 내보내기 기본 이름으로 씀 |
| `refreshGenerated(md, s, {renumber})` | (`renumber:false` 가 편집 중 자동 패스, `true` 가 번호 다시 매기기 버튼)  **앱이 만들어 주는 것만 제자리에서 갱신** — 헤딩 번호와 목차/그림목차 줄. 표지·본문·빈 줄은 한 글자도 건드리지 않음 (편집 중 자동 갱신용). 목차/그림목차 블록이 **아예 없고** 설정이 켜져 있으면 그때만 새로 끼워 넣음 — 헤딩 없이 병합된 문서(목차 블록이 안 생김)에 나중에 헤딩을 쓰면 목차가 나타나야 하기 때문 |
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

- **입력 반응 속도** — 편집 탭에서 한 글자마다 App 이 다시 렌더됩니다. 세 가지로 막습니다.
  1. **편집기는 uncontrolled 입니다.** `value` 대신 `defaultValue` 를 쓰고, 타이핑 중에는 textarea 가 자기 글을 직접 소유합니다 — React 가 키 입력 경로에서 완전히 빠지고, controlled value 가 매 자모마다 끊어 놓던 **IME 조합**도 건드리지 않습니다. `merged` 는 `EDITOR_SYNC_MS`(150ms) 디바운스로 따라오고, 반대로 **키보드가 아닌 곳에서** 문서가 바뀌면(병합·undo·자동 번호·설정) effect 가 그 글을 편집기에 밀어 넣습니다(선택 영역·스크롤 유지, 조합 중이면 건드리지 않음).
     - **`value` 도 `defaultValue` 도 주지 않습니다.** 둘 중 하나라도 있으면 App 이 리렌더될 때마다 React 가 textarea 의 텍스트를 다시 쓰는데, 큰 문서에서는 그것만으로 렌더 한 번이 문서 전체 DOM 쓰기가 됩니다. 글을 넣는 곳은 push-back effect **한 군데뿐**입니다. `onSelect`/`onKeyUp` 도 붙이지 않습니다 — 둘 다 글자마다 발생합니다.
     - **textarea 에 쓰는 주체는 언제나 하나여야 합니다.** 자동 번호 패스와 표지 재생성은 push-back effect 에 맡기지 않고 **자기가 직접** `el.value` 를 쓰고 캐럿까지 놓습니다. 둘이 경합하면 `value` 대입이 캐럿을 문서 끝으로 보내 놓고 누가 마지막에 되돌리느냐에 따라 **가끔** 캐럿이 끝으로 튀었습니다(rAF 와 passive effect 의 순서는 보장되지 않습니다).
     - 그래서 **최신 글이 필요한 곳은 `merged` 가 아니라 `currentText()` / `flushEditor()` 로 읽어야 합니다**(저장·인쇄·내보내기·undo·그림 크기). 툴바 액션이 글을 바꿀 때는 `putEditorText()` 로 textarea 에 직접 써서 캐럿 위치까지 정확히 잡습니다.
  2. **파생 계산은 "한 줄이 끝난 뒤"에만** 돕니다. 키 입력은 상태를 전혀 건드리지 않고 타이머만 재설정하며(`onEditorInput`), 편집기 글이 `merged` 가 되는 시점(`settleNow`)은 **Enter/방향키/Home·End/Tab, 마우스 클릭, 포커스 아웃, 탭 전환, 그리고 완전히 멈춘 뒤**(`SETTLE_IDLE_MS`)뿐입니다. 그래서 `merged` 자체가 "안정된 문서"이고 구조 트리·그림 목록·통계는 그것만 보면 됩니다(`useDeferredValue`·디바운스 모두 매 키 입력마다 계산이 남아 부족했습니다).
"
  "     - 자동 번호 패스는 `editorRef.current.value !== merged` 면 **건너뜁니다** — 그 사이 사용자가 다시 타이핑했다는 뜻이고, 그때 textarea 를 다시 쓰면 입력과 싸웁니다.
  3. `previewHtml` 은 **미리보기 탭일 때만** 만들고, 탭 전환(`showTab`)이 먼저 `settleNow()` 를 부르므로 들어가는 순간의 최신 내용으로 한 번만 만들어집니다 — 문서 전체를 marked + DOMPurify(+ 이미지 data URI 펼치기)에 매 타이핑마다 통과시키던 것이 가장 큰 비용이었고, 편집 중에는 아무도 그 결과를 보지 않습니다.
  4. `FileList` / `OutlineTree` / `FigureList` 는 `React.memo` 이고, 넘기는 핸들러는 전부 `useEvent()` 로 **identity 가 고정**됩니다(항상 최신 클로저를 호출하는 ref 래퍼). 이게 없으면 memo 가 무력화되어 수백 줄짜리 목록이 키 입력마다 다시 렌더됩니다.
  - 대신 `figures` 는 한 글자 뒤처질 수 있으므로, **오프셋으로 원문을 잘라 쓰는 곳**(`resizeFigure`, `gotoFigure`)은 반드시 현재 텍스트에서 `getFigures` 를 다시 돌려 위치를 잡습니다. 이걸 빼먹으면 엉뚱한 위치를 덮어써서 본문이 깨집니다.
- **자동 병합(live preview)** — `files`(체크/순서), `insertFileHeaders`, `numberHeadings` 가 바뀌면 `useEffect` 가 `mergeFilesAsync` 로 병합을 다시 수행해 `merged` 를 갱신. **단, `editedRef.current` 가 서면 멈춥니다** — 손댄 병합 문서는 그 자체로 하나의 문서이므로 체크 하나 바꿨다고 원본에서 다시 만들어 덮어쓰지 않고, `mergeStale` 로 툴바의 다시 병합 버튼을 밝혀 사용자가 고르게 합니다. 그 버튼(`remerge()`)만이 편집된 문서를 새 병합으로 바꿉니다. 미리보기·구조·상태바가 즉시 반영됩니다. 별도 병합/번호 버튼은 없으며, 병합이 300ms 이상 걸리면 진행률 팝업(`MergeProgressDialog`)이 뜹니다. `seq` 가드로 중복/역순 실행을 방지합니다. (편집 탭의 수동 수정은 다음 선택 변경 시 소스 기준으로 덮어써짐)
- **파생값** — `outline`(구조), `figures`(그림 목록), `previewHtml`(렌더), `stats`(단어/글자), `firstCheckedName`(내보내기 기본 파일명) 은 `useMemo` 로 계산.
- **탭 안에서 이동** — 구조 트리(`scrollToHeading`)와 그림 목록(`gotoFigure`)은 **보고 있는 탭을 바꾸지 않습니다.** 어느 쪽으로 갈지는 `rightTab` 상태가 아니라 **`editorOnScreen()`(편집기 DOM 노드가 붙어 있는지)** 로 판단합니다 — 상태는 한 렌더 뒤처질 수 있지만 노드의 존재는 그렇지 않습니다. 편집 중이면 `selectInEditor()` 가 해당 줄/이미지 링크를 선택하고 거기로 스크롤하며, 미리보기면 `#h-N` / `#fig-N` 앵커로 스크롤합니다.
  - textarea 는 선택이 바뀌어도 스스로 스크롤하지 않고, 편집기는 **소프트 랩** 이라 `
` 개수로 줄 위치를 셀 수도 없습니다. 그래서 `selectInEditor()` 는 편집기와 같은 글꼴·줄간격·본문 폭을 가진 **미러 div** 에 그 지점까지의 텍스트를 넣어 높이를 재고, 그 픽셀 값으로 `scrollTop` 을 잡습니다(blur/focus 트릭은 브라우저마다 달라 쓰지 않습니다).
- **그림 보기** — 사이드바 **그림** 탭과 편집 탭 우측 패널이 같은 `FigureList` 를 씁니다. 항목 클릭은 `gotoFigure()` — 미리보기면 `#fig-N` 으로 스크롤, 편집 중이면 `start/length` 로 원문의 이미지 링크를 선택. 반대로 편집기 커서 위치는 `syncFigureToCaret()` 이 `activeFigure` 로 되돌려 강조합니다.
- **내보내기 옵션** — `buildExportOpts()` 는 `{...기본값, ...localStorage, ...라이브상태}` 순으로 병합해 설정창에서 바꾼 폰트·크기·줄간격이 항상 내보내기에 반영되도록 합니다(미리보기와 일치).
- **영속화** — 테마(`mmm-theme`), 언어(`mmm-lang`), 확대(`mmm-zoom`), **그리고 그 밖의 모든 설정**(`mmm-export`)이 localStorage 에 저장됩니다(Electron 은 userData JSON 미러도 유지).
  - `DEFAULT_EXPORT_SETTINGS` 는 이제 내보내기 서식만이 아니라 **병합 옵션(`sortOrder` / `recursive` / `insertFileHeaders` / `numberHeadings`)도** 담습니다. 예전에는 App 의 `useState` 라 창을 닫으면 사라졌고 설정 창에서 손댈 수도 없었습니다. 한 저장소로 합쳐 두니 툴바·설정 창·다음 실행이 자동으로 일치하고, 툴바 토글은 그대로 `toggleExportSetting()` 을 씁니다.
  - 정렬은 `onSortChange` 가 아니라 **설정 값을 보는 effect** 가 목록을 다시 정렬합니다 — 설정 창에서 바뀐 경우에도 반영되어야 하기 때문입니다.
- **툴바** — 병합 옵션(정렬/하위폴더/파일명헤더/번호매기기/다시병합)과 저장·내보내기 옵션이 모두 한 줄에 있습니다. `.toolbar` 는 `flex-wrap: nowrap`.
  - **최소 창 폭은 이제 상수가 아닙니다.** 렌더러가 실제로 그려진 툴바(스페이서 제외 자식 폭 + gap + padding + 창 크롬)를 재서 `win:setMinWidth` 로 메인에 알리고, 메인이 `setMinimumSize` 를 겁니다(디스플레이 작업영역으로 클램프). 언어가 바뀌면 다시 잽니다. **버튼을 더 넣어도 손으로 다시 잴 일이 없습니다** — `createWindow` 의 `minWidth: 900` 은 측정 전 출발점일 뿐입니다.
  - 폴더/파일 추가는 아이콘 전용, 정렬 드롭다운 앞에는 `.toolbar-label` 이 붙습니다.
- **번호 매기기는 자동이 아닙니다** — 번호를 다시 매기는 것은 **사용자가 쓰고 있는 줄을 앱이 고쳐 쓰는 일**이라 손이 올라가 있는 동안 하면 안 됩니다. 그래서 툴바의 `renumberNow()` 버튼(과 병합 시 `numberHeadings` 옵션)만이 헤딩 줄을 건드립니다.
  - 자동 패스(`merged` 가 바뀌고 600ms 조용할 때)는 `refreshGenerated(..., { renumber: false })` 로 **목차/그림목차 줄만** 갱신합니다. 생성된 목록이 헤딩과 어긋나 있으면 없느니만 못하기 때문입니다. 멱등이라 결과가 같으면 `setMerged` 를 건너뜁니다.
  - 여기서 `buildDocument` 로 **문서 전체를 다시 만들면 안 됩니다.** 그러면 표지가 설정 값으로 되돌아가고 사용자가 넣은 빈 줄이 잘려, 편집 탭에서 고친 내용이 600ms 뒤에 사라집니다. 문서 전체 재생성은 재병합(소스가 바뀜)과 `frontKey` 변경(설정이 바뀜) — 사용자가 명시적으로 그렇게 요청한 두 경우 — 에만 씁니다.
- **설정 창 크기** — 폼은 `columns: 3` 이라 창 높이가 모자라면 내용이 **네 번째 칸으로 넘어가 잘립니다**(예전에는 `overflow: hidden` 이라 조용히 사라졌습니다). 이제 `.settings-page-body` 는 `overflow: auto` 이고, 창이 열리면 렌더러가 **가장 높은 칸의 바닥**(각 `.form-section` 의 rect bottom 최댓값 — `scrollHeight` 는 칸이 넘친 뒤에는 의미가 없습니다)을 재서 `settings:resize` 로 알리고, 메인이 min/max/size 를 함께 그 값으로 맞춥니다. `SETTINGS_H` 는 측정 전 출발점일 뿐이며 넉넉하게 잡아 둡니다 — **섹션을 추가해도 상수를 다시 잴 일이 없습니다.**
- **오류 표시** — 실패는 전부 `reportError(무엇을, err)` 한 곳으로 모여 `ExportResultDialog` 에 뜹니다: 하던 일 · 메시지 · 스택, 그리고 **내용 복사** 버튼. `window` 의 `error` / `unhandledrejection` 도 여기로 보내므로 try/catch 를 빠져나간 오류가 콘솔에서 조용히 사라지지 않습니다.
- **마지막 폴더** — 메인 프로세스가 `userData/last-dir.json` 에 따로 저장합니다(렌더러가 `settings.json` 을 통째로 덮어쓰기 때문에 같은 파일을 쓸 수 없음). 열기 대화상자의 `defaultPath` 로 쓰입니다.
- **툴바 빠른 설정** — 표지/목차/그림목차/페이지번호 토글과 글꼴 크기 ± 는 `exportSettings` 를 직접 고칩니다(`toggleExportSetting` / `bumpFontSize`). 설정 창과 같은 상태·같은 저장소를 쓰므로 별도 동기화 코드가 없고, 표지·목차 토글은 `frontKey` 를 바꿔 문서 앞부분을 다시 만들게 합니다.
- **실행 취소/다시 실행** — 문서 자체의 편집 기록(`histRef`: `past`/`future`/`current`). undo/redo 는 **보고 있는 위치를 바꾸지 않습니다** — 텍스트를 직접 쓰고(`value` 대입은 스크롤을 위로 보냅니다) 스크롤과 캐럿을 원래대로 되돌립니다. 텍스트를 통째로 갈아 끼우는 모든 자리(`putEditorText`·자동 패스·표지 재생성)가 같은 규칙을 지킵니다. **브라우저 기본 undo 스택은 못 씁니다** — 편집기는 controlled textarea 인데 앱이 번호/목차 때문에 `node.value` 를 계속 다시 써서 그때마다 스택이 날아갑니다. `merged` 를 보는 effect 하나가 기록을 남기며, 두 가지 예외가 있습니다: `apply`(undo/redo 자신이 만든 변경 — 기록 안 함), `fold`(자동 정리 패스 — 앞 단계에 붙이고 **redo 가지를 지우지 않음**; undo 직후에도 이 패스가 돌기 때문에 이걸 빼먹으면 redo 가 사라집니다). 연속 입력은 `HISTORY_COALESCE_MS` 안이면 한 단계로 묶이고, 새 병합/비우기는 `resetHistory()` 로 초기화합니다.
- **인쇄** — `printDocument()` (export.js) 는 **PDF 내보내기와 똑같은 HTML** 을 만들어 `doc:print` 로 넘깁니다. 메인은 그것을 오프스크린 창(`createRenderWindow` — Windows 에서는 `show:false` 창을 인쇄할 수 없어 화면 밖 + opacity 0)에 띄워 paged.js 로 페이지네이션하고 목차 페이지 번호를 채운 뒤 `webContents.print({ silent:false })` 로 시스템 대화상자를 엽니다. 웹은 `printHtml()` 로 브라우저 인쇄 창.
- **저장** — `saveDocument()`. 첫 저장은 `exportMarkdown()`(다이얼로그)으로 경로를 받아 `docPath` 에 기억하고, 이후에는 `saveMarkdownTo()` → `fs:writeText` 로 **다이얼로그 없이 그 파일에 덮어씁니다.** 내용은 Markdown 내보내기와 완전히 동일(`buildMergedMarkdownDocument`). `savedTextRef` 를 갱신하므로 종료 확인의 dirty 판정도 같이 풀립니다. 웹은 경로에 쓸 수 없어 매번 다운로드(`canWriteInPlace === false`).
  - Ctrl S / Ctrl Shift S 는 window 리스너 하나로 받는데, 이 리스너는 한 번만 설치되므로 `saveRef` 를 통해 최신 `saveDocument` 를 호출합니다 — 캡처했다면 낡은 문서를 저장하게 됩니다.
- **창 크기 조절 손잡이** — `frame: false` 라 OS 손잡이가 없어서 상태바 오른쪽 아래가 `.resize-grip` 을 그리고 직접 리사이즈합니다: pointerdown 에서 `win:getSize` 로 시작 크기를 받고, 포인터의 **화면 좌표** 이동량을 더해 `win:setSize`. `setPointerCapture` 로 창 밖으로 나가도 따라옵니다.
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
| Word | **MHT(multipart/related)** `.doc` — `toStandaloneHtml({forWord:true})` + Office 네임스페이스/ProgId, base64 이미지는 별도 MIME 파트. 목차 페이지 번호는 `export:paginate` 로 미리 계산해 baking. 머리글/바닥글/쪽 번호는 **@page 마진박스가 아니라** 이름 붙은 `@page WordSection1` + `mso-header`/`mso-footer` 블록 + `PAGE` 필드 |

- **머리글/바닥글 스위치**: `showHeader` / `showFooter` (툴바 토글). 모든 렌더러가 `runningHeaderText(s)` / `runningFooterText(s)` 한 곳으로만 물어보므로 PDF·Word·인쇄 CSS 가 같은 답을 냅니다. 머리글 문구는 표지 부제이기도 해서 `showHeader` 는 `frontKey` 에도 들어갑니다.
- **표지(Cover)**: 제목은 `coverTitle` 설정(비우면 본문 첫 헤딩), 부제=머리글 문구(`showHeader` 켬), 버전/작성자/날짜 포함. 정렬(`coverTitleAlign` / `coverMetaAlign`)은 표지 안의 **모든 블록에 인라인 style 로** 붙습니다(Word 는 클래스도 상속도 못 믿음).
  - 표지 각 줄은 평문이지만 문서에는 **Markdown 으로** 들어갑니다. 한국어 날짜 `2026. 9. 9.` 는 그대로 두면 번호 목록 문법이라 중첩 `<ol>` 로 파싱돼 **Word 에서 여러 줄로 쪼개지고**, `<p>` 가 아니게 되어 **정렬 style 이 닿지 않았습니다.** `escapeBlockMarkdown()` 이 줄 첫머리의 블록 마커(`1.` `1)` `-` `*` `+` `>` `#`)만 백슬래시로 이스케이프합니다 — 편집 탭에는 `2026\. 9. 9.` 로 보이고 렌더 결과는 원래 글자 그대로입니다.
- **목차(Index)**: 본문 앞 별도 페이지, 각 항목 오른쪽에 실제 페이지 번호(H1 굵게).
- **그림 목차(List of Figures)**: 목차 다음의 별도 페이지(`figurePage`, 기본 켬). 항목은 `그림 N. 설명` → `#fig-N` 앵커, 오른쪽에 실제 페이지 번호. **문서에 그림이 하나도 없으면 페이지 자체를 만들지 않습니다**(빈 목차 방지) — `figureIndexHtml` 이 `''` 을 반환하고 본문 캡션도 붙지 않습니다.
- 파일 이름의 기본값은 **표지 제목**입니다(`documentTitle` — `coverTitle` 설정, 없으면 표지 블록의 H1). 표지가 없는 문서만 첫 병합 파일 이름으로 떨어지며, 내보내기 드롭다운에서 직접 고치면 그 이름이 우선합니다.
  - 반대 방향(내보내기 이름 → 표지 제목)은 **일부러 끊어 두었습니다.** 양쪽이 서로를 따라가면 이름이 바뀔 때마다 `frontKey` 가 흔들려 표지를 다시 만들고, 편집 탭에서 손댄 표지가 사라집니다. 그래서 `documentOpts()` 는 `title` 을 넘기지 않고 `frontKey` 에도 `exportName` 이 없습니다.

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
