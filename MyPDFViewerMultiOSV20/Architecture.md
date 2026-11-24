# MyPDFViewer — 구조 설명

하나의 화면 코드로 **웹 브라우저와 데스크톱(Tauri 2)** 을 모두 지원하는 PDF 뷰어입니다.
이 문서는 코드가 어떻게 나뉘어 있고, 왜 그렇게 되어 있는지를 설명합니다.

---

## 1. 전체 구성

```
                    ┌───────────────────────── 렌더러 (React) ──────────────────────────┐
                    │                                                                   │
   사용자 입력 ───▶ │  App.jsx  ── 상태 소유: 문서 · 설정 · 작업내용(undo/redo) · 대화상자 │
                    │     │                                                              │
                    │     ├─ components/  Toolbar · TabBar · Sidebar · FolderTree · PdfView · StatusBar · 대화상자
                    │     │                                                              │
                    │     ├─ lib/pdf.js      pdf.js 래퍼 (렌더 · 텍스트 · 이미지 · 주석 읽기 · 검색) │
                    │     ├─ lib/pdf-write.js 주석·책갈피·첨부를 PDF에 쓰기 (pdf-lib)     │
                    │     ├─ lib/comments.js PDF/작업 주석 정규화                         │
                    │     ├─ lib/image.js    PNG/JPEG/WebP/GIF/BMP 인코딩                │
                    │     ├─ lib/history.js  스냅샷 실행취소                              │
                    │     ├─ lib/workspace.js .pdfvw 직렬화                               │
                    │     ├─ lib/tabs.js     문서 탭 식별 · 이웃 · 넘침                   │
                    │     ├─ lib/folders.js  폴더 트리 항목 (확장자 pdf 만)               │
                    │     ├─ lib/settings.js 설정 기본값 · 정규화 · 최근 파일             │
                    │     ├─ lib/platform.js ◀── 런타임 차이를 흡수하는 유일한 지점       │
                    │     └─ lib/desktop-bridge.js  window.desktopAPI (Tauri 창에서만)    │
                    └───────────────┬───────────────────────────────────────────────────┘
                                    │ invoke(명령) · listen(이벤트) — @tauri-apps/api
                    ┌───────────────▼───────────────────────────────────────────────────┐
                    │  src-tauri/src/lib.rs — 창 · 네이티브 대화상자 · 파일 입출력(진행률) │
                    │                         다운로드 · 클립보드 · 글꼴 · 설정 저장 ·     │
                    │                         단일 실행 · 파일 연결 · 테마 팝업 창          │
                    │  src-tauri/src/files.rs — 폴더 목록 · 드라이브 · 실행 인자 해석      │
                    └───────────────────────────────────────────────────────────────────┘
```

핵심 원칙은 **런타임 분기를 `lib/platform.js` 한 곳에 가둔다**는 것입니다.
컴포넌트는 "파일을 저장한다"만 알면 되고, 그것이 네이티브 대화상자인지 브라우저 다운로드인지는
알 필요가 없습니다.

---

## 2. 데스크톱 호스트 — Tauri 2

데스크톱 앱은 **운영체제의 웹뷰**(Windows WebView2 · macOS WKWebView · Linux WebKitGTK)에
`dist/` 를 띄우고, 파일·대화상자·클립보드처럼 웹이 못 하는 일은 Rust 명령이 맡습니다.
설치본은 `tauri://localhost`(Windows 는 `http://tauri.localhost`)라는 진짜 오리진에서 돌기 때문에,
pdf.js의 **모듈 워커**와 cmap·글꼴 **fetch** 가 웹 배포와 똑같이 동작합니다.
개발 중(`npm start` = `tauri dev`)에는 같은 창이 Vite 개발 서버(5179)를 띄웁니다.

* **브리지** — [desktop-bridge.js](src/lib/desktop-bridge.js) 가 Rust 명령과 이벤트를
  예전 preload 와 같은 모양의 `window.desktopAPI` 로 묶습니다. 화면 코드는 `platform.js` 의
  `isDesktop` / `api` 만 보며, 브리지는 `main.jsx` 가 가장 먼저 불러옵니다(`platform.js` 가 평가될 때 한 번 읽음).
* **큰 파일** — PDF 바이트는 JSON 숫자 배열로 오가지 않습니다. 읽기는 `ipc::Response`(원시 바이트),
  쓰기는 요청 본문이 파일 자체이고 경로는 `x-path` 헤더로 갑니다. URL 다운로드는
  `[u32 길이][JSON 머리][본문]` 으로 이름과 바이트를 한 번에 돌려줍니다.
* **진행률** — 1MB 단위로 읽고 쓰며 60ms 간격으로 `task-progress` 이벤트를 보냅니다.
* **창** — 프레임 없는 창을 숨긴 채 만들고, 첫 화면을 그린 뒤 페이지가 `window_ready` 를 부르면 보입니다
  (빈 창이 먼저 보이지 않게). 닫기는 `CloseRequested` 를 막고 `close-request` 를 보내 렌더러가
  저장 여부를 묻게 하며, `win_force_close` 만 실제로 닫습니다.
* **권한** — capability 는 이벤트 듣기(`core:event:default`)만 엽니다. 파일·창·대화상자는 모두
  앱 자체 명령이라 플러그인 권한이 필요 없습니다.
* **파일 끌어 놓기** — 탐색기에서 끌어 온 파일은 웹뷰보다 호스트가 먼저 받아 **실제 경로**를
  `file-drop` 으로 넘깁니다. 그래서 끌어 놓은 PDF도 Ctrl+S 로 제자리에 저장됩니다.
* **글꼴** — `queryLocalFonts()` 대신 Rust `fontdb` 가 시스템 글꼴 이름을 읽습니다(권한 창 없음).
* **단일 실행** — `tauri-plugin-single-instance` 가 두 번째 실행의 인자를 첫 창으로 넘기고,
  macOS 의 파일 열기는 `RunEvent::Opened` 로 받습니다. 페이지가 준비되기 전에 온 경로는
  호스트(`take_pending_open`)와 브리지(버퍼)가 보관했다가 전달합니다.

---

## 3. pdf.js 계층 — `src/lib/pdf.js`

| 함수 | 하는 일 |
| --- | --- |
| `loadDocument` | 바이트 배열로 문서를 엽니다. 진행률·암호 콜백을 받습니다 |
| `renderPage` | 페이지를 캔버스에 그립니다. 화면 DPI(devicePixelRatio)를 반영해 선명하게 그립니다 |
| `renderTextLayer` | 캔버스 위에 **투명한 실제 텍스트**를 덮어 선택·복사가 가능하게 합니다. 컨테이너에 `--scale-factor` 를 반드시 설정합니다 (아래 참고) |
| `getPageText` / `searchDocument` | 텍스트 추출과 전체 검색 |
| `extractPageImages` | 연산자 목록에서 이미지 객체를 찾아 PNG로 만듭니다 |
| `getPageImageRegions` | **각 그림이 페이지의 어디에 있는지** 좌표를 계산합니다 |
| `getImageDataUrl` | 이름으로 그림 하나를 원본 해상도로 꺼냅니다 |
| `cropCanvas` | 렌더된 캔버스에서 사각형을 잘라냅니다 |
| `getOutline` / `destToPage` | 목차를 **계층 구조 그대로** 돌려주고, 각 목적지를 실제 쪽 번호로 변환 |
| `getPageComments` / `getDocumentComments` | PDF 네이티브 주석(형광펜·메모·첨부 등)을 페이지 좌표로 읽습니다 |

### 그림 위치 계산 (`getPageImageRegions`)

pdf.js는 이미지를 "단위 정사각형을 변환해서 그리는" 방식으로 표현합니다.
따라서 연산자 목록을 훑으면서 `save`/`restore`/`transform` 으로 **현재 변환행렬(CTM)** 을 따라가면,
아무것도 그리지 않고도 각 그림의 화면 사각형을 얻을 수 있습니다.
이 좌표가 있어서 "그림을 클릭하면 그 그림이 선택되는" 동작과 점선 테두리 표시가 가능합니다.

### 텍스트 레이어의 `--scale-factor`

pdf.js는 각 글자 조각의 크기를 `font-size: calc(var(--scale-factor) * Npx)` 로 **인라인**에 씁니다.
그래서 컨테이너에 이 변수를 넣어 주지 않으면 계산식이 무효가 되어 모든 조각이 상속된 14px로 주저앉고,
글자는 캔버스에 제대로 그려지는데 **선택 영역만 글자와 어긋나** 보입니다.
(pdf.js 5.x는 같은 값을 `--total-scale-factor` 로 부르므로 두 이름을 모두 설정합니다.)

### pdfjs-dist 버전 고정

`pdfjs-dist@4.8.69` 의 **legacy 빌드**로 고정되어 있습니다. 4.9 이상은 워커에서 네이티브
`Promise.try` 를 호출하는데, 데스크톱 앱이 쓰는 시스템 웹뷰는 운영체제마다 버전이 제각각이라
(특히 오래된 macOS 의 WKWebView, 배포판의 WebKitGTK) 그 API가 없을 수 있습니다.

CJK 문서를 위해 `cmaps` 와 `standard_fonts` 를 `public/pdfjs/` 로 복사합니다
([scripts/copy-pdfjs-assets.mjs](scripts/copy-pdfjs-assets.mjs)).

---

## 4. 페이지 표시 — `src/components/PdfView.jsx`

* **가상화** — 화면 근처(±900px)의 페이지만 실제로 래스터화하고, 나머지는 정확한 크기의 빈 자리로 둡니다.
  419쪽 문서에서도 동시에 그려지는 페이지는 5개 안팎입니다.
* **배율 계산** — 컨테이너 크기를 `ResizeObserver` 로 재서 *화면 맞춤 / 폭 맞춤 / 높이 맞춤 / 원본 크기 / 자유 배율* 을 계산합니다 (`computeScale`).
* **보기 맞춤** — 문서를 열 때마다(새 탭, 실행 인자, 끌어 놓기, 최근 파일) `OPEN_ZOOM_MODE` = `fit-page` 로 시작합니다.
  프로그램을 다시 켜도 지난번 배율이 아니라 화면 맞춤으로 엽니다. 작업 파일(`.pdfvw`)을 열 때만 저장된 보기를 되살립니다.
  툴바의 `VIEW_FIT_BUTTONS` 네 개(화면 · 원본 · 폭 · 높이)가 같은 `zoomMode` 를 바꾸고, 지금 방식이 눌린 상태로 보입니다.
  두 쪽 보기에서는 항상 쪽 전체를 맞추므로 화면 맞춤 외의 버튼은 꺼집니다(`fitButtonDisabled`).
* **위치 유지** — 스크롤할 때마다 "화면 맨 위에 있는 페이지 + 그 안에서의 비율"을 기억해 두었다가,
  배율이나 회전이 바뀐 직후 `useLayoutEffect` 에서 그 위치로 되돌립니다.
  덕분에 확대·축소해도 보던 자리가 유지됩니다.
* **Ctrl + 휠 확대** — React의 합성 `onWheel` 은 passive라 `preventDefault()` 가 통하지 않습니다.
  네이티브 리스너를 `{ passive: false }` 로 직접 등록해 브라우저 자체 확대를 막고 문서 배율을 바꿉니다.
* **선택 표시** — 브라우저 기본 선택은 텍스트 조각(span)마다 칠해져 얼룩덜룩해 보입니다.
  선택 영역의 사각형들을 **줄 단위로 병합**해 직접 그리고, 기본 선택 색은 투명하게 만듭니다.
* **도구** — `text`(I 빔, 텍스트 선택) · `image`(손가락, 그림 클릭 선택) · `region`(십자, 사각형 드래그)
  세 가지가 서로 배타적입니다. 텍스트 도구일 때만 텍스트 레이어가 마우스를 받고,
  나머지 두 도구에서는 `pointer-events: none` 이라 드래그가 글자 선택으로 새지 않습니다.

> 페이지 이동에 `scrollIntoView` 를 쓰지 않습니다. 그 API는 **모든 상위 스크롤 컨테이너**를 함께 스크롤해서
> 툴바가 화면 밖으로 밀려나는 문제가 있었습니다. 컨테이너의 `scrollTop` 을 직접 계산해 옮깁니다.

---

## 5. 이미지 인코딩 — `src/lib/image.js`

캔버스는 PNG·JPEG·WebP만 만들 수 있습니다. 나머지는 직접 구현했습니다
(프로젝트가 ICO/ICNS를 직접 만드는 것과 같은 방식).

| 형식 | 방법 |
| --- | --- |
| PNG / JPEG / WebP | `canvas.toBlob()` — 품질 인자는 JPEG·WebP에만 적용 |
| **GIF** | 15비트로 축약한 히스토그램 → **median cut** 으로 최대 256색 팔레트 → **LZW** 압축 → GIF89a 조립 |
| **BMP** | 24비트 bottom-up 비트맵. 각 행을 4바이트 경계에 맞춰 채웁니다 |

검증: 240×160 시험 이미지로 인코딩 후 다시 디코딩해 원본과 픽셀을 비교하면
PNG·BMP는 **오차 0(무손실)**, GIF는 평균 3.7 / 최대 7(5비트 양자화 폭과 일치),
JPEG·WebP는 품질 0.9에서 평균 1.8 수준입니다. GIF는 libvips(sharp)로도 정상 판독됩니다.

저장 흐름은 **두 단계**입니다. 먼저 경로만 고르고(`dialog_save_path`),
**사용자가 고른 확장자를 보고 인코더를 정한 뒤** 인코딩해서 씁니다(`fs_write_binary`).
그래서 저장 창에 `그림.webp` 라고 직접 입력해도 그 형식으로 저장됩니다.

---

## 5.5 목차 트리와 이미지 선택 — `src/components/Sidebar.jsx`, `PdfView.jsx`

* **너비 조절** — 패널과 페이지 사이의 `.side-splitter` 를 끌어 `clampSidebarWidth()` 범위 안에서
  `settings.sidebarWidth` 를 바꿉니다. 기본값은 220px (`SIDEBAR_WIDTH_DEFAULT`).
* **제목 줄 동작** — 폴더 열기 · 목차 모두 펼치기/접기 · 이미지 추출 · 주석/첨부는
  `.side-head-actions` 의 아이콘 버튼입니다. 본문 안에 텍스트 버튼을 두지 않습니다.
* **폴더 트리** — 데스크톱만. `fs_read_dir` → [src-tauri/src/files.rs](src-tauri/src/files.rs) 의 `read_level` 이
  `metadata()` 로 한 단계를 읽고, [src/lib/folders.js](src/lib/folders.js) 의 `toFolderEntries()` 가
  **마지막 확장자가 정확히 `pdf` 인 파일**만 남깁니다 (`.pdfvw`, `mypdf.txt` 는 제외).
  [FolderTree.jsx](src/components/FolderTree.jsx) 는 하위 폴더를 한 단계 미리 읽고,
  PDF가 있는 폴더는 펼쳐서 파일이 보이게 합니다. 빈 폴더에 “없다”는 문구는 내지 않습니다.
* **목차 트리** — `getOutline()` 이 자식을 품은 노드 배열을 돌려주고, `OutlineTree` 가 재귀로 그립니다.
  접힘 상태는 노드 id 집합 하나로 관리합니다. 현재 쪽의 강조는
  `outlineActiveId()` 가 고른 **한 항목만** (`selectedId`) 칠합니다.
  부모–자식 연결선은 CSS만으로 그립니다:
  중첩된 `li` 마다 왼쪽에 세로 줄기(`::before`)와 행으로 들어가는 짧은 가로선(`::after`)을 두고,
  **마지막 자식의 줄기는 가로선 높이에서 끊어** 가지가 깔끔하게 닫히게 합니다.
  선 색은 `--muted` 를 연하게 섞어 글보다 눈에 덜 띄게 합니다.

* **이미지 선택** — 그림을 클릭하면 *선택만* 되고 클립보드는 건드리지 않습니다.
  복사·저장·클립 보관은 오른쪽 클릭 메뉴가 제공합니다. 메뉴는 클릭 지점의 그림을 함께 받아
  (`onContextMenu(e, { page, imageHit })`), 선택되어 있지 않은 그림 위에서 바로 오른쪽 클릭해도
  그 그림에 대해 동작합니다.

---

## 5.6 문서 탭 — `src/lib/tabs.js`, `src/components/TabBar.jsx`

열린 PDF마다 탭과 `sessionsRef` 스냅샷을 둡니다. 같은 경로를 다시 열면 그 탭으로 포커스하고,
PDF 저장 후 다시 열 때만 탭을 교체합니다.

* `documentKey` / `findTabByFile` 이 경로 또는 `이름+크기` 로 탭을 찾습니다.
* `TabBar` 는 `<main className="viewer">` 안에 있어 **좌측 패널 위가 아니라 문서 위**에만 놓입니다.
* 탭이 막대를 넘치면 오른쪽 `<` `>` (`tabScrollOverflow`) 로 `scrollLeft` 를 옮깁니다.
* `Ctrl+W` 는 현재 탭, `Ctrl+Tab` / `Ctrl+Shift+Tab` 은 `nextTabId` 로 이웃 탭입니다.
  더러운 탭을 닫거나 창을 닫을 때는 기존 `UnsavedDialog` 경로를 탑니다.

페이지 뷰어(`.pageview`)는 `min-width/min-height: 0` 과 `overflow: auto` 로,
확대 후 내용이 뷰어보다 크면 스크롤바가 나타납니다.

---

## 5.7 인쇄 — `src/lib/print.js`, `src/lib/print-layout.js`, `src/components/PrintDialog.jsx`

인쇄는 **양쪽 런타임 모두 pdf.js가 그린 이미지**를 보냅니다. 웹뷰에 원본 PDF를 띄워
인쇄하는 방법은 쓰지 않습니다 — 시스템 웹뷰마다 내장 PDF 표시 여부가 다르고, 표시하지 못하면 백지가 인쇄됩니다.
보내는 단위는 쪽이 아니라 **용지 한 장(sheet)** 입니다. 미리보기와 인쇄가 같은 함수로 같은 그림을 만들므로
화면에서 본 것이 그대로 나옵니다.

* **범위** — `parsePageList()` 가 `1-5, 8, 11-13` 을 쪽 번호 목록으로 바꾸고, 빈 값·형식 오류·문서 범위 초과를
  각각 다른 메시지로 구분합니다.
* **페이지 설정** — [print-layout.js](src/lib/print-layout.js) 는 DOM 없는 순수 계산(mm 단위)입니다.
  `normalizePrintOptions()` 가 저장된 값(`settings.printOptions` — 용지 · 여백 · 한 장에 n쪽 · 배율 모드 · 비율 · 홀짝 · 색)을
  안전한 값으로 맞추고, `printPlan()` 이 홀짝을 거른 쪽 목록을 장(`planSheets`)으로 나누고 용지 방향을 정합니다.
  방향 *자동* 은 `resolveOrientation()` 이 세로 · 가로 중 **쪽이 더 크게 들어가는 쪽**을 고릅니다(그래서 세로 쪽 2개는 가로 용지).
  `gridFor()` 는 n쪽을 나누는 열 × 행 가운데 쪽이 가장 크게 들어가는 것을 고르고, `placePage()` 는 칸 안에
  맞춤 · 실제 크기 · 사용자 % 로 가운데 놓되 칸 밖은 잘라냅니다(clip).
* **그리기** — `renderSheet()` 가 흰 용지에 각 쪽을 제자리에 그리고, 흑백이면 휘도로 바꿉니다.
  쪽은 **늘 이 페이지 document 의 캔버스**에 그린 뒤 옮겨 그립니다: pdf.js 는 PDF 글꼴을 이 document 의 `FontFace` 로
  등록하므로, 인쇄 창(다른 document)의 캔버스에 직접 그리면 글자가 대체 글꼴로 깨졌습니다.
  `renderSheetsForPrint()` 는 150 DPI로 한 장씩 JPEG 로 만들고 캔버스를 즉시 반납합니다.
  `renderPreviewSheet()` 는 미리보기 칸에 맞추되 **최소 2.5배 화소**(`PREVIEW_DETAIL`)로 그려 축소해 보여 줍니다 —
  작은 글자도 알아볼 수 있고, 돋보기(`LENS`, 2.5배)는 같은 캔버스의 화소를 그대로 확대합니다.
* **인쇄 창** — [PrintDialog.jsx](src/components/PrintDialog.jsx) 는 `Modal` 의 `windowName="print"` 로 **별도 창**에 뜨고
  (아래 7.58), `fixedSize`(기본 1180 × 860, 작은 화면은 `printWindowSize()` 로 줄여 고정)라 내용이 바뀌어도 창이 커지거나 줄지 않습니다.
  쓰지 않는 입력칸(사용자 범위 · 비율)은 사라지지 않고 꺼지기만 하며, 안내 · 오류 줄은 높이가 정해져 있어 스크롤바가 생길 일이 없습니다.
* **보내기** — 데스크톱은 [인쇄] 가 곧바로 `print_pages` 로 갑니다(7.55). 시스템 인쇄 창 경로는 없습니다.
  웹은 장 이미지를 `@page { size: <용지 mm>; margin: 0 }` 인 HTML 로 새 창에 띄우고 `window.print()` 를 부릅니다
  (프린터 · 매수는 브라우저 창에서 고릅니다).

---

## 6. 실행 취소 / 다시 실행 — `src/lib/history.js`

되돌릴 대상(형광펜 · 코멘트 · 책갈피 · 첨부 · 클립 · 회전)은 작은 평범한 객체이므로,
명령 쌍(do/undo)을 만드는 대신 **스냅샷을 통째로 쌓는 방식**을 씁니다.
구현이 단순해 버그가 적고, "실행 취소: 책갈피 추가" 같은 라벨이 자연히 따라옵니다. 최대 100단계입니다.

---

## 7. 작업 파일 `.pdfvw` — `src/lib/workspace.js`

```jsonc
{
  "format": "mypdfviewer-workspace",
  "version": 1,
  "pdf":  { "path": "C:/…/문서.pdf", "name": "문서.pdf", "size": 123456 },
  "view": { "page": 3, "zoomMode": "fit-width", "rotation": 0, "pageLayout": "continuous" },
  "workspace": { "annotations": [...], "bookmarks": [...], "clips": [...], "attachments": [...] }
}
```

PDF 자체는 넣지 않고 **경로만 가리킵니다.** 형식이 다르거나 버전이 높으면
그 사실을 그대로 알려 주는 오류 메시지를 던지고, 그 문장이 오류 팝업에 그대로 표시됩니다.

설치 프로그램이 `.pdfvw` 를 **전용 아이콘**과 함께 시스템에 등록하고,
`.pdf` 는 *연결 프로그램* 목록에 추가합니다. 설치 화면에서 **기본 뷰어로 설정**을 고르면
`Software\Classes\.pdf` 와 *기본 프로그램*(`RegisteredApplications` + `Capabilities`) 등록까지
이루어집니다. 실제 기본값이 저장되는 `FileExts\.pdf\UserChoice` 는 해시로 보호되어 설치
프로그램이 쓸 수 없으므로, 이미 다른 기본값이 있으면 Windows [기본 앱] 설정 창을 열어
사용자가 확인하도록 합니다 ([src-tauri/windows/hooks.nsh](src-tauri/windows/hooks.nsh)).

설치 훅은 Tauri NSIS 템플릿보다 먼저 읽히므로 바로 가기·PDF 기본 뷰어 페이지가 환영 페이지 앞에 옵니다.
예전 **Electron 판**(electron-builder 제거 키 `ff66f4e8-…`, appId 의 UUIDv5)이 있으면 그 제거 프로그램을
`--updated` 로 조용히 돌려 프로그램만 지우고, 남은 Chromium 캐시는 정리한 뒤,
설정·최근 파일(`%APPDATA%\MyPDFViewer`)을 지울지 묻습니다. 훅 파일은 한글 때문에 UTF-8 BOM 으로 둡니다.

---

## 7.5 PDF에 다시 쓰기 — `src/lib/pdf-write.js`

작업 내용(형광펜 · 코멘트 · 책갈피 · 파일 첨부)을 **원본 바이트에 더해** 새 PDF를 만듭니다.
`pdf-lib` 가 주석 사전 · Outline · EmbeddedFiles 를 추가하고, 이미 PDF에 들어 있던 내용은 그대로 둡니다.

* 좌표는 작업 공간의 0..1 위-왼쪽 사각형을 PDF 포인트(아래-왼쪽)로 바꿉니다.
* **Ctrl+S / PDF로 저장** 은 열린 파일에 **바로 씁니다**(변경 내용 저장). 경로가 디스크에 있을 때만
  그렇고(`pdfSaveTarget()` = `overwrite`), URL로 연 문서나 웹에서는 저장 창을 엽니다.
* **PDF 다른 이름으로 저장** 은 항상 저장 창을 열며, 기본 이름은 `suggestedPdfCopyName()` 이 만든
  `문서이름-annotated.pdf` 입니다.
* 저장에 성공하면 그 파일을 다시 열어, 방금 쓴 주석이 PDF 네이티브 주석으로 보이게 합니다.
* 형광펜은 `/Subtype /Highlight` 에 `QuadPoints` · 색 `C` · 불투명도 `CA` 와 함께 **외형 스트림(`/AP /N`)** 을
  씁니다 — 줄마다 곱하기(Multiply) 혼합 사각형이라 글자가 그대로 읽힙니다. 외형이 있으므로
  스스로 외형을 만들지 않는 프로그램(일부 인쇄 경로·오래된 뷰어)에서도 보입니다.
* 다시 연 형광펜은 **페이지 캔버스가 외형대로 그립니다.** 주석 레이어는 같은 자리를 다시 칠하지 않고
  (`commentMarkFill` — 겹쳐 칠하면 색이 진해졌습니다), 메모 카드는 주석 패널에서 고른 것만 펼칩니다
  (`showsCommentCard` — 형광펜 메모는 대개 칠한 글자 자체라, 늘 펼치면 아래 줄을 가렸습니다).
* 암호가 걸린 PDF도 씁니다 — 아래 7.6 참고. 결과는 늘 복호화된 바이트이고,
  `applyPdfProtection` 이 사용자가 고른 대로 다시 암호를 겁니다 (`buildPdfForSave` 가 둘을 묶습니다).

## 7.6 PDF 암호 — `src/lib/pdf-crypt.js` · `pdf-crypto-core.js` · `pdf-password.js`

pdf.js 는 암호 PDF를 *읽기만* 하고, pdf-lib 은 암호화·복호화를 전혀 못 합니다. 그래서 표준 보안 처리기
(ISO 32000-2 §7.6.4)를 직접 구현했습니다.

| 모듈 | 하는 일 |
| --- | --- |
| `pdf-crypto-core.js` | MD5 · RC4 · AES-128/256-CBC · SHA-256/384/512 (동기, 순수 JS). WebCrypto 는 비동기 전용이고 http 웹 배포에 없으며 MD5/RC4·패딩 없는 AES 가 없어서입니다. SHA-2 상수는 BigInt 제곱/세제곱근으로 계산합니다 |
| `pdf-crypt.js` | `loadPdfForEditing(bytes, { password })` → 모든 문자열·스트림을 복호화하고 `/Encrypt` 를 뺀 pdf-lib 문서 + 원래 보호 정보. `encryptPdfBytes` → AES-256(R6, 기본) · AES-128 · RC4-128 · RC4-40 으로 암호화 |
| `pdf-password.js` | `awaitPdfPassword(task, { ask, knownPassword, pause, resume })` — pdf.js 로딩 작업의 암호 대기 |

* **열기가 멈추던 문제**: pdf.js 는 `onPassword` 뒤 `retry` 가 올 때까지 끝없이 기다립니다. 진행률 창이
  암호 창 위를 덮고 있었고(같은 backdrop, 뒤에 렌더), 취소해도 작업이 끝나지 않았습니다.
  지금은 묻는 동안 진행률 창을 숨기고(`pause`/`resume`), 취소하면 `task.destroy()` 로 끝냅니다.
* **개체 스트림**: pdf-lib 파서는 `/ObjStm` 을 읽는 즉시 풀어 버리므로, 파서 인스턴스의
  `parseIndirectObject`/`parseIndirectObjectHeader`/`parseObject` 를 감싸 *최상위 개체를 읽은 직후* 개체 번호로
  복호화합니다. `/Encrypt` 위치는 트레일러에서만 알 수 있어 두 번 파싱합니다(1차: 개체 스트림 건너뜀).
* 암호화해 쓸 때는 개체 스트림 없이(`useObjectStreams: false`) 씁니다. 개체 스트림 안의 문자열은 따로
  암호화하지 않는 규칙이라, 클래식 xref 가 단순하고 안전합니다.
* XRef 스트림, `EncryptMetadata false` 인 Metadata, 서명 사전의 `/Contents` 는 암호화 대상이 아닙니다.
* 파일 객체(`file`)에 `password`(이 바이트를 여는 암호) · `encrypted` · `security` · `protection`
  (`{ mode: 'keep' | 'none' | 'set', password }`)을 둡니다. 저장 후 다시 열 때는 새 암호를 `knownPassword` 로 넘겨
  다시 묻지 않습니다. 작업 파일(`.pdfvw`)에는 암호를 쓰지 않습니다.
* 테스트: `test/pdf-crypt.test.js` (qpdf 로 만든 `test/fixtures/encrypted/*.pdf` 복호화, 우리가 만든 파일을
  pdf.js 로 검증), `test/pdf-password.test.js`, `test/security-dialog.test.jsx`, 데스크톱 smoke 의
  *Password-protected PDF* 묶음.

창을 닫을 때 저장하지 않은 주석이 있으면 `close-request` 이벤트 → `UnsavedDialog` 가
PDF 저장을 권합니다 (`win_force_close` 로만 실제로 닫힙니다).

---

## 7.55 열어 본 파일 · 서재 · 형광펜 목록 · 직접 인쇄

* **열어 본 파일**(코드 이름 gallery) — [src/lib/gallery.js](src/lib/gallery.js) 의 순수 함수가 `settings.gallery`(`{ path, name, dir, size, addedAt, openedAt?, favorite? }`)를
  다룹니다. 문서를 열면 `registerOpened`, 빼면 `removeFromGallery`. 손으로 넣는 길은 서재의 [추가](`addPaths` + `setFavorite`)뿐입니다 — 열지 않은 파일을 이 목록에 넣는 버튼 · 오른쪽 클릭 메뉴는 열어 본 목록에 맞지 않아 뺐습니다. 경로는 대소문자·구분자를
  가리지 않고 같은 파일로 봅니다. 예전 설정 파일에 이 목록이 없으면 최근 파일로 시작합니다(`seedGallery`).
  **첫 쪽 그림**은 설정이 아니라 [thumb-store.js](src/lib/thumb-store.js)(IndexedDB + 메모리)에 둡니다 — 수백 장이면
  localStorage 에 들어가지 않습니다. 열 때 `renderThumb` 로 다시 그리므로 저장한 형광펜도 그림에 보이고,
  서재에 바로 추가한 파일은 카드가 화면에 들어올 때 앱이 하나씩 읽어 그립니다.
  [Gallery.jsx](src/components/Gallery.jsx) 는 문서 영역을 덮는 화면입니다(타일 · 자세히, 크기 `galleryTileSize`).
* **서재** — 열어 본 파일 항목의 `favorite` 표시입니다. [Library.jsx](src/components/Library.jsx) 는 책장 · 표지 · 목록 · 자세히 보기이고,
  책장 한 칸에 몇 권 들어가는지는 `booksPerShelf` / `shelvesOf`, 책 사이 간격은 `shelfGap(크기)` 로 CSS 의
  `calc(var(--book) * 0.12 + 8px)` 와 같습니다. 제목은 한 줄(`text-overflow: ellipsis`) — 두 줄 제목이 표지를 위로 밀어 줄이 들쭉날쭉했습니다.
* **겹쳐 보이는 화면** — 시작 화면 · 열어 본 파일 · 서재는 App 의 `overlay` 상태 하나로 고릅니다(`setShowGallery` / `setShowLibrary` 는
  그 위의 얇은 래퍼). 둘을 따로 두고 한쪽 updater 안에서 다른 쪽 setState 를 부르면 툴바 버튼이 가끔 듣지 않았습니다.
  셋 다 `.workarea` 끝에 절대 위치로 그려 **좌측 패널까지** 덮습니다. 문서를 열면 `overlay` 와 홈 화면이 닫힙니다.
* **기록 패널의 최근 연 파일**은 열어 본 파일 중 `openedAt` 이 있는 것입니다. 지우기는 `forgetOpened` — `openedAt` 만 지워
  [열어 본 파일] 카드는 남깁니다. 편집 기록 지우기는 `history.reset(현재 상태)` 입니다.
* **형광펜 목록** — [highlights.js](src/lib/highlights.js) 가 작업 공간 형광펜과 PDF에 저장된 형광펜(pdf.js 주석 id `12R`)을 합칩니다.
  저장 전 것은 작업 공간에서 빼고(실행 취소 가능), 저장된 것은 `removePdfAnnotations()` 가 각 쪽 `/Annots` 에서 그 객체 참조를
  빼낸 바이트로 문서를 **제자리에서 다시 열고** 변경됨으로 표시합니다 — 캔버스가 그리는 외형까지 바로 사라지고, Ctrl+S 로 파일에 반영됩니다.
* **오른쪽 클릭** — 페이지 · 좌측 패널 행 · 열어 본 파일 · 서재 카드가 같은 `ContextMenu` 를 씁니다. 메뉴가 없는 곳에서는 데스크톱 웹뷰의
  브라우저 메뉴(뒤로 · 새로 고침 · 검사)를 막습니다(입력란은 제외).
* **직접 인쇄** — 인쇄 창이 `print_list_printers` 로 프린터 목록을 받고, [인쇄] 는 장(sheet) JPEG 들을
  `print_pages` 로 보냅니다(본문 `[u32 장수][u32 길이…][JPEG…]`, 프린터 · 매수 · 방향 · 용지(`x-paper`) · 제목은 헤더).
  [print.rs](src-tauri/src/print.rs) 가 Windows 에서는 GDI(`CreateDCW` + 프린터 DEVMODE 에 방향과 용지 `dmPaperSize` 를 덮어쓰기),
  장 이미지는 이미 여백까지 그려진 용지 한 장이므로 `sheet_rect()` 로 **물리 용지 전체**(`PHYSICALWIDTH/HEIGHT`)에 맞추고
  인쇄 가능 영역의 원점(`PHYSICALOFFSETX/Y`)만큼 당겨 `StretchDIBits` 합니다. macOS · Linux 는 CUPS `lp -o media=…` 입니다. 매수는 묶음(collated)으로
  반복합니다 — dmCopies 를 무시하는 드라이버가 있어서입니다. 드라이버가 스스로 띄운 창(Print to PDF 의 파일 이름)을
  취소하면 `PRINT_CANCELLED` 로 돌아와 오류 없이 "인쇄 취소" 로 끝납니다.

## 7.57 시작 화면과 프로그램 설명서

* [StartScreen.jsx](src/components/StartScreen.jsx) — 고정된 제목 카드와 그 아래 **카드 보드**(시작하기 · 최근 연 파일 · 내 서재 ·
  시작 화면 배경 · 사용 팁). 처음 표시 조건은 `!doc && settings.showStartPage`, 타이틀 바의 홈 버튼은 `homeOpen` 으로 문서가 있어도 엽니다.
  보드는 MyUMLMaker 의 것을 옮긴 [startboard.js](src/lib/startboard.js)(DOM: 20px 행 격자에 카드 배치, 손잡이로 옮기기 —
  반투명 사본이 따라옴, 점 삼각형 모서리로 크기 조절, 두 번 누르면 내용에 맞춤)와 [startlayout.js](src/lib/startlayout.js)(순수 배치 계산)입니다.
  기본은 모든 카드가 3열을 다 차지해 **한 줄씩 위아래**로 놓이고, 배치는 `settings.startLayout` 에 남습니다. 보드는
  `useLayoutEffect` 에서 시작해야 첫 프레임에 배치 전 카드가 보이지 않습니다. 오른쪽 위 **자동 정렬**이 기본 배치로 되돌립니다.
  배경 카드의 투명도 · 움직임 속도는 한 줄에 놓고 슬라이더 양옆에 − / + (`StepSlider`)를 둡니다.
* [startbg.js](src/lib/startbg.js) — 배경 21가지. 장면마다 `{ init(w, h, rand), draw(ctx, state, { t, dt, w, h, c }) }` 이고,
  3D 는 WebGL 없이 `project(x, y, z)` 원근 투영 + Canvas 2D 입니다(셰이더 컴파일 지연이 없고 가볍습니다).
  `depthAlpha` 는 멀리서뿐 아니라 **카메라 바로 앞**에서도 흐려져, 가까이 온 물체가 화면을 덮지 않습니다.
  [StartBackground.jsx](src/components/StartBackground.jsx) 가 30fps 로 그리고, 창이 숨으면 멈추며, 테마 색(`--accent`, `--text`)을
  30프레임마다 다시 읽습니다. 설정은 `startBg` · `startBgOpacity`(0.1~1) · `startBgSpeed`(0.1~3) · `startBgRandom` · `startBgInterval`(0/15/30/60/120/300초).
  [BackgroundPicker.jsx](src/components/BackgroundPicker.jsx) 를 시작 화면과 설정 → 시작 화면이 같이 씁니다.
* **설명서** — `doc/Guide.html`(한국어) · `doc/Guide.en.html`(영어)와 `doc/images/`. [scripts/sync-doc.mjs](scripts/sync-doc.mjs) 가
  `postinstall` · `prepare:assets` 때 `public/doc` 으로 복사해(git 에서는 무시) 빌드에 들어갑니다.
  데스크톱은 `win_open_guide(page)` 가 `doc-guide` 라벨의 창을 `WebviewUrl::App("doc/…")` 로 만들고(있으면 주소만 바꿔 앞으로),
  `guide_page` 로 두 파일 이름만 허용합니다. 설명서 안의 외부 링크는 기본 브라우저로 엽니다.
  웹 판은 `window.open("./doc/…")` 입니다. 툴바 도움말 · F1 · 시작 화면 [프로그램 설명] 이 모두 `openGuide` 하나를 부릅니다.

## 7.58 별도 창 대화상자 — `src/lib/popout.js`, `src-tauri/src/popout.rs`

인쇄 창은 MyEBookReader V20 에서 옮겨 온 **팝아웃** 방식입니다.

* 페이지가 `window.open("about:blank#dialog-print")` 를 부르면, 본 창의 `on_new_window` 가 [popout.rs](src-tauri/src/popout.rs) 로
  **테두리 없는 소유 창**(`parent(main)`, 숨김 상태)을 만들어 돌려줍니다. 라벨은 `dialog-` 로 시작하는 조각만 허용합니다.
* 그 창의 document 는 본 페이지와 같은 출처 · 같은 렌더러라, [popout.js](src/lib/popout.js) 가 빈 문서에 `<base>` 와
  스타일시트 · `<html>` 속성(테마 변수)을 복사하고 `MutationObserver` 로 계속 따라가게 한 뒤 React `createPortal` 로 그립니다.
  상태 · 이벤트 처리기는 모두 본 페이지에 그대로 있습니다.
* [Modal.jsx](src/components/Modal.jsx) 의 `windowName` 이 이 경로를 씁니다. 창 크기는 `fitPopoutTo()` 가 `popout_show` 로 정하고
  실제 `innerWidth/Height` 와 비교해 차이만큼 다시 요청합니다(프레임 없는 창은 요청과 뷰포트가 어긋나고, 막 만든 창은 잠깐 0×0 이라 그때는 보정하지 않습니다).
  모달이므로 열려 있는 동안 본 창은 `set_enabled(false)`, 창이 사라지면(`Destroyed`, Alt+F4 포함) 다시 켜고 `popout-closed` 를 보내
  페이지가 대화상자 상태를 닫습니다. 닫기는 `popout_close`(창 `destroy`) — 페이지의 `window.close()` 로는 Tauri 창이 남습니다.
* 제목 줄은 CSS `app-region: drag` 로 창을 옮깁니다(WebView2 비클라이언트 영역).
* **웹** 판은 같은 코드가 브라우저 팝업(`popup=yes`)을 열고 `resizeBy` 로 뷰포트를 맞춥니다. 팝업이 막히거나 jsdom(테스트)이면
  `openPopout()` 이 `null` 을 돌려 같은 대화상자가 페이지 안에 뜹니다.

## 7.59 색 아이콘 · 닫기 버튼 · 창 손잡이

* [Icons.jsx](src/components/Icons.jsx) 의 모든 아이콘은 `hue` (`ICON_HUES` 10가지 색 계열)를 `data-hue` 로 달고,
  [App.css](src/App.css) 가 `--ic-<색>` 변수로 칠합니다. 변수는 `:root` (어두운 테마)와 `:root[data-theme-kind='light']` 두 벌이며,
  `applyTheme()` 가 `data-theme-kind` 를 붙입니다. 켜진 툴바 버튼 · 기본 버튼처럼 **강조색 바탕** 위에서는 글자색으로 돌아갑니다.
  창 버튼(─ □) · 화살표 · 더보기는 색을 넣지 않고, 국기는 원래 색입니다.
* 모든 팝업의 닫기(`.modal-x`, 전체 화면 [열어 본 파일] · 서재의 `.close-x`)는 마우스를 올리면 `#e81123` 빨강입니다.
* 창 오른쪽 아래 크기 조절 손잡이(`StatusBar` 의 `ResizeGrip`)와 시작 화면 카드의 크기 모서리는 같은 **점 6개 삼각형**입니다.

---

## 7.6 테마 목록이 창 밖으로 나가는 이유

(목록 맨 위 **[사용자 정의 테마 설정…]** 은 `ThemeMenu` 의 `onCustomize`. 떨어진 팝업 창에서는 테마 id 대신
`CUSTOM_THEME_ACTION`(`__custom-theme__`)을 `win_pick_theme` 으로 보내고, 본 창의 Toolbar 가 그것을 받아 `onCustomTheme` —
App 이 설정 창을 `initialTab="theme"` 으로 엽니다. 설정의 **테마** 탭은 왼쪽 기본 테마 40개, 오른쪽 `CustomThemeEditor` 입니다.)


웹 내용은 창 밖으로 그릴 수 없습니다. 40개 테마를 스크롤 없이 보여 주려면
호스트가 **프레임 없는 자식 창**(`win_open_theme_popup`, 라벨 `theme-popup`)을 화면 좌표에 띄웁니다.
초기화 스크립트가 `window.__MYPDF_POPUP__ = { kind: 'theme', current }` 를 넣어
[ThemePopup.jsx](src/components/ThemePopup.jsx) 만 그리게 하고, 팝업이 잰 크기(`win_set_popup_size`)로
창을 맞춰 작업 영역 안에 놓은 뒤 보입니다. 고른 테마는 `theme-picked` 로 메인 창에 돌아옵니다.
포인터가 팝업과 버튼을 벗어나거나 팝업이 포커스를 잃으면 닫힙니다 — 단, 숨긴 채 만들어진 직후의
포커스 잃음은 무시합니다(그 때문에 열리자마자 닫혔습니다). 웹 빌드에서는 페이지 안 드롭다운이 열립니다.

---

## 8. 설정과 상태 유지 — `src/lib/settings.js`

* 모든 설정은 **하나의 평범한 객체**이고, 바뀔 때마다 localStorage에 쓰고
  데스크톱에서는 `%APPDATA%\MyPDFViewer\settings.json`(macOS·Linux 는 같은 이름의 설정 폴더)으로도 복사합니다.
  Electron 판과 같은 위치라 판을 바꿔도 설정·최근 파일이 그대로 이어집니다. 시험할 때는
  `MYPDFVIEWER_CONFIG_DIR` 로 다른 폴더를 가리킬 수 있습니다.
* 읽을 때는 `normalize()` 가 기본값 위에 덮어쓰면서 **모르는 키를 버리고 타입·범위를 강제**합니다.
  오래된 설정 파일이 앱에 이상한 값을 주입할 수 없습니다.
* 최근 파일 10개 · 최근 폴더 10개, 마지막 폴더(`folderRoot`), 마지막으로 본 쪽을 함께 보관합니다.
* 테마는 [src/lib/themes.js](src/lib/themes.js) 의 40개 id 와 `App.css` 의 `:root[data-theme]` 블록이 한 쌍입니다.
* 선택 후 자동 복사 플래그(`autoCopyText` / `autoCopyImage` / `autoCopyRegion`)도 여기에 있습니다.

---

## 9. 오류 처리

렌더러의 모든 실패는 `App.jsx` 의 `fail(err, context)` 한 곳으로 모입니다.
Rust 명령은 오류를 사람이 읽을 문장(`File not found: …`, `HTTP 404 Not Found — …`)으로 돌려주고,
그 문장을 본문에 보여 주며 원문과 스택은 *자세히 보기* 에 남깁니다. 예전 호스트가 붙이던
`"Error invoking remote method '…': Error: …"` 접두사는 `stripRemoteError()` 가 여전히 벗깁니다.
전체 내용은 한 번의 클릭으로 복사할 수 있습니다.

오래 걸리는 작업은 `withProgress()` 로 감싸고, **180ms 이상 걸릴 때만** 진행률 창을 띄웁니다.
작은 파일을 열 때 창이 깜빡이지 않게 하기 위해서입니다.

---

## 10. 빌드와 배포

| 명령 | 결과 |
| --- | --- |
| `npm start` | `tauri dev` — Vite 개발 서버 + Rust 호스트 (화면 코드 수정은 즉시, Rust 수정은 다시 빌드). Vite 를 띄우기 전에 `scripts/free-port.mjs` 가 5179 포트를 잡고 있는 이전 프로세스를 정리하므로, 비정상 종료 뒤에도 바로 다시 실행됩니다 |
| `npm test` | `test:js` + `test:rust` |
| `npm run test:js` | Vitest. [test/reporters/summary.mjs](test/reporters/summary.mjs) 만 사용합니다. 분류(파일/스위트)는 녹색, 각 항목은 무색 제목 + 초록/빨강 표시이며 진행 점(`…`)은 없습니다. [desktop-contract.test.js](test/desktop-contract.test.js) 가 브리지 ↔ Rust 명령·이벤트 · tauri.conf.json · 설치 훅이 서로 맞는지 봅니다 |
| `npm run test:rust` | `cargo test` — 폴더 목록 · 실행 인자 · 다운로드 이름 · 헤더/데이터 URL 해석 · 최소 폭 · 인쇄 용지 · 팝아웃 창 라벨/배치 |
| `npm run smoke:desktop` | 실제 데스크톱 앱 GUI 점검 [scripts/smoke-desktop.mjs](scripts/smoke-desktop.mjs). 식별자가 다른 시험용 사본(`com.shkwon.mypdfviewer.smoketest`)을 `src-tauri/target-smoke` 에 빌드하고, 임시 폴더의 설정 · WebView2 프로필과 CDP 포트로 띄워 시작 화면 · 타이틀 바 · 툴바 · 패널 · 오른쪽 클릭 메뉴 · **인쇄 창(별도 창 · 고정 크기 · 스크롤바 없음 · 미리보기 · 돋보기 · 페이지 설정)** · 열어 본 파일 · 서재 · 정보 · 테마 · 언어를 실제 마우스 · 키 입력으로 확인합니다(36개). 스스로 만든 6쪽 PDF 만 열고 **[인쇄] 는 누르지 않습니다**. `-- --no-build` 로 다시 돌립니다 |
| `npm run web` | 브라우저용 개발 서버 |
| `npm run build` | 웹 배포용 정적 파일 → `dist/` (Tauri 빌드가 이것을 먼저 실행) |
| `npm run build:win` / `:mac` / `:linux` / `:all` | `tauri build` → `src-tauri/target/release/bundle/` (그리고 프로젝트 최상위로 복사). Windows 는 NSIS 설치 파일만 만듭니다 |
| `npm run clean` / `clean:all` | 빌드 생성물 삭제 → `dist/` · `src-tauri/target/` · `src-tauri/target-smoke/` · `src-tauri/gen/` · `public/pdfjs/` · `src/build-info.json` · 최상위 설치 파일 · Vite/Vitest 캐시. `clean:all` 은 `node_modules/` 까지 (`--dry-run` 으로 미리 확인) |

* 모든 진입점(`prebuild:*`, `prepare:assets`, `pretest`, `prestart`)은
  [scripts/ensure-deps.mjs](scripts/ensure-deps.mjs) 를 먼저 실행합니다. `package.json` 에 적힌 패키지가
  하나라도 없으면 `npm install` 을 돌리므로, 막 clone 한 저장소에서도 `npm run build:win` 하나로 끝납니다.
  Node 기본 모듈만 쓰며(그 시점에 `node_modules/` 가 없을 수 있으므로), 이미 갖춰져 있으면 아무 것도 하지 않습니다.
* [scripts/clean.mjs](scripts/clean.mjs) 는 생성물만 지웁니다. `public/icon.svg` · `public/file-icon.svg` 는
  `assets/` 의 복사본이지만 일부러 커밋되어 있어(빌드 전에도 환영 화면이 보여야 합니다) 지우지 않습니다.
* 아이콘은 `assets/icon.svg`(프로그램)와 `assets/file-icon.svg`(문서)에서
  `scripts/generate-icons.mjs` 가 `src-tauri/icons/` 에 ico/icns/png 를 생성합니다. `tauri-build` 가
  컴파일할 때 icon.ico 를 실행 파일에 넣으므로 이 폴더는 커밋해 둡니다. 설치 파일도 같은 아이콘을 쓰고,
  `.pdfvw` 문서 아이콘(file.ico)은 설치 폴더에 함께 들어가 훅이 레지스트리에 연결합니다.
* 화면 코드는 Vite가 번들해 실행 파일 안에 들어갑니다. 브라우저 엔진을 싣지 않으므로 설치 파일이
  약 4.7MB 입니다 (Electron 판은 78MB).
* `src/build-info.json` 은 빌드할 때마다 생성되어 버전·빌드 시각·커밋·브랜치를 담고,
  타이틀 바의 버전 표시와 *프로그램 정보* 창이 이 값을 씁니다.

---

## 11. 디렉터리

```
assets/            icon.svg · file-icon.svg (원본 아이콘)
src-tauri/         Tauri 호스트 — src/lib.rs · src/files.rs · src/popout.rs · src/print.rs · tauri.conf.json · capabilities/ ·
                   icons/ (생성된 ico · icns · png) · windows/hooks.nsh (NSIS 사용자 정의)
public/pdfjs/      pdf.js 런타임 데이터(cmaps · standard_fonts) — 생성물
scripts/           아이콘 · 빌드정보 · pdf.js 자산 · 포트 정리 · 설치파일 복사 · 정리 · smoke-desktop(GUI 점검)
src/components/    Toolbar · TabBar · Sidebar · FolderTree · PdfView · StatusBar · TitleBar ·
                   ThemePopup · Gallery · Modal · Dialogs · CaptureDialog · SettingsDialog ·
                   AboutDialog · PrintDialog · ContextMenu · Tooltip · Toasts · Icons
src/lib/           pdf · pdf-write · comments · tabs · folders · image · history · workspace ·
                   settings · platform · desktop-bridge · gallery · thumb-store · highlights ·
                   view · text-select · search · nav ·
                   print · print-layout · popout · startboard · startlayout · themes · fonts
src/i18n.js        한국어 · 영어 문자열
test/              Vitest 스위트 · fixtures · reporters/summary.mjs
```
