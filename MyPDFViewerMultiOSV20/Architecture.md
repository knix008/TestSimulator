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

## 5.7 인쇄 — `src/lib/print.js`

인쇄는 **양쪽 런타임 모두 pdf.js가 그린 페이지 이미지**를 보냅니다. 웹뷰에 원본 PDF를 띄워
인쇄하는 방법은 쓰지 않습니다 — 시스템 웹뷰마다 내장 PDF 표시 여부가 다르고, 표시하지 못하면 백지가 인쇄됩니다.

* `parsePageList()` 가 `1-5, 8, 11-13` 을 쪽 번호 목록으로 바꾸고, 빈 값·형식 오류·문서 범위 초과를
  각각 다른 메시지로 구분합니다. 대화상자는 그 결과로 인쇄될 쪽 수를 미리 보여 줍니다.
* `renderPagesForPrint()` 는 150 DPI로 한 쪽씩 그려 JPEG로 인코딩하고 **캔버스를 즉시 반납**합니다.
  긴 문서를 인쇄해도 모든 쪽이 메모리에 남지 않습니다.
* 데스크톱은 이미지들을 blob URL 로 만들어 같은 HTML을 **숨은 iframe** 에 넣고, 그 프레임의
  `print()` 로 시스템 인쇄 창을 엽니다(브리지의 `printPages`). 이미지는 `decode()` 가 끝난 뒤에
  인쇄해 빈 페이지가 섞이지 않게 하고, 프레임은 `afterprint` 뒤에 치웁니다.
* 웹은 같은 HTML을 새 창에 띄우고 `window.print()` 를 호출합니다.

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
* 암호가 걸린 PDF에 쓰는 것은 지원하지 않습니다.

창을 닫을 때 저장하지 않은 주석이 있으면 `close-request` 이벤트 → `UnsavedDialog` 가
PDF 저장을 권합니다 (`win_force_close` 로만 실제로 닫힙니다).

---

## 7.55 갤러리 · 서재 · 형광펜 목록 · 직접 인쇄

* **갤러리** — [src/lib/gallery.js](src/lib/gallery.js) 의 순수 함수가 `settings.gallery`(`{ path, name, dir, size, addedAt, openedAt?, favorite? }`)를
  다룹니다. 문서를 열면 `registerOpened`, 손으로 넣으면 `addPaths`, 빼면 `removeFromGallery`. 경로는 대소문자·구분자를
  가리지 않고 같은 파일로 봅니다. 예전 설정 파일에 갤러리가 없으면 최근 파일로 시작합니다(`seedGallery`).
  **첫 쪽 그림**은 설정이 아니라 [thumb-store.js](src/lib/thumb-store.js)(IndexedDB + 메모리)에 둡니다 — 수백 장이면
  localStorage 에 들어가지 않습니다. 열 때 `renderThumb` 로 다시 그리므로 저장한 형광펜도 그림에 보이고,
  열지 않고 등록한 파일은 카드가 화면에 들어올 때 앱이 하나씩 읽어 그립니다.
  [Gallery.jsx](src/components/Gallery.jsx) 는 문서 영역을 덮는 화면입니다(타일 · 자세히, 크기 `galleryTileSize`).
* **서재** — 갤러리 항목의 `favorite` 표시입니다. [Library.jsx](src/components/Library.jsx) 는 책장 · 표지 · 목록 · 자세히 보기이고,
  책장 한 칸에 몇 권 들어가는지는 `booksPerShelf` / `shelvesOf`, 책 사이 간격은 `shelfGap(크기)` 로 CSS 의
  `calc(var(--book) * 0.12 + 8px)` 와 같습니다. 제목은 한 줄(`text-overflow: ellipsis`) — 두 줄 제목이 표지를 위로 밀어 줄이 들쭉날쭉했습니다.
* **겹쳐 보이는 화면** — 시작 화면 · 갤러리 · 서재는 App 의 `overlay` 상태 하나로 고릅니다(`setShowGallery` / `setShowLibrary` 는
  그 위의 얇은 래퍼). 둘을 따로 두고 한쪽 updater 안에서 다른 쪽 setState 를 부르면 툴바 버튼이 가끔 듣지 않았습니다.
  셋 다 `.workarea` 끝에 절대 위치로 그려 **좌측 패널까지** 덮습니다. 문서를 열면 `overlay` 와 홈 화면이 닫힙니다.
* **기록 패널의 최근 연 파일**은 갤러리 중 `openedAt` 이 있는 것입니다. 지우기는 `forgetOpened` — `openedAt` 만 지워
  갤러리 카드는 남깁니다. 편집 기록 지우기는 `history.reset(현재 상태)` 입니다.
* **형광펜 목록** — [highlights.js](src/lib/highlights.js) 가 작업 공간 형광펜과 PDF에 저장된 형광펜(pdf.js 주석 id `12R`)을 합칩니다.
  저장 전 것은 작업 공간에서 빼고(실행 취소 가능), 저장된 것은 `removePdfAnnotations()` 가 각 쪽 `/Annots` 에서 그 객체 참조를
  빼낸 바이트로 문서를 **제자리에서 다시 열고** 변경됨으로 표시합니다 — 캔버스가 그리는 외형까지 바로 사라지고, Ctrl+S 로 파일에 반영됩니다.
* **오른쪽 클릭** — 페이지 · 좌측 패널 행 · 갤러리 카드가 같은 `ContextMenu` 를 씁니다. 메뉴가 없는 곳에서는 데스크톱 웹뷰의
  브라우저 메뉴(뒤로 · 새로 고침 · 검사)를 막습니다(입력란은 제외).
* **직접 인쇄** — 인쇄 창이 `print_list_printers` 로 프린터 목록을 받고, [인쇄] 는 pdf.js 가 그린 JPEG 들을
  `print_pages` 로 보냅니다(본문 `[u32 쪽수][u32 길이…][JPEG…]`, 프린터 · 매수 · 방향 · 제목은 헤더).
  [print.rs](src-tauri/src/print.rs) 가 Windows 에서는 GDI(`CreateDCW` + 프린터 DEVMODE 에 방향만 덮어쓰기, 쪽마다
  `StretchDIBits` 로 인쇄 가능 영역에 맞춰 가운데), macOS · Linux 에서는 CUPS `lp` 로 보냅니다. 매수는 묶음(collated)으로
  반복합니다 — dmCopies 를 무시하는 드라이버가 있어서입니다. 드라이버가 스스로 띄운 창(Print to PDF 의 파일 이름)을
  취소하면 `PRINT_CANCELLED` 로 돌아와 오류 없이 "인쇄 취소" 로 끝납니다.

## 7.57 시작 화면과 프로그램 설명서

* [StartScreen.jsx](src/components/StartScreen.jsx) — 제목 카드 · 시작하기(최근 파일) · 내 서재 · 배경 고르기 카드. 처음 표시 조건은
  `!doc && settings.showStartPage`, 툴바 홈 버튼은 `homeOpen` 으로 문서가 있어도 엽니다.
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

---

## 7.6 테마 목록이 창 밖으로 나가는 이유

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
| `npm run test:rust` | `cargo test` — 폴더 목록 · 실행 인자 · 다운로드 이름 · 헤더/데이터 URL 해석 · 최소 폭 |
| `npm run web` | 브라우저용 개발 서버 |
| `npm run build` | 웹 배포용 정적 파일 → `dist/` (Tauri 빌드가 이것을 먼저 실행) |
| `npm run build:win` / `:mac` / `:linux` / `:all` | `tauri build` → `src-tauri/target/release/bundle/` (그리고 프로젝트 최상위로 복사). Windows 는 NSIS 설치 파일만 만듭니다 |
| `npm run clean` / `clean:all` | 빌드 생성물 삭제 → `dist/` · `src-tauri/target/` · `src-tauri/gen/` · `public/pdfjs/` · `src/build-info.json` · 최상위 설치 파일 · Vite/Vitest 캐시. `clean:all` 은 `node_modules/` 까지 (`--dry-run` 으로 미리 확인) |

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
src-tauri/         Tauri 호스트 — src/lib.rs · src/files.rs · tauri.conf.json · capabilities/ ·
                   icons/ (생성된 ico · icns · png) · windows/hooks.nsh (NSIS 사용자 정의)
public/pdfjs/      pdf.js 런타임 데이터(cmaps · standard_fonts) — 생성물
scripts/           아이콘 · 빌드정보 · pdf.js 자산 · 포트 정리 · 설치파일 복사 · 정리
src/components/    Toolbar · TabBar · Sidebar · FolderTree · PdfView · StatusBar · TitleBar ·
                   ThemePopup · Gallery · Modal · Dialogs · CaptureDialog · SettingsDialog ·
                   AboutDialog · PrintDialog · ContextMenu · Tooltip · Toasts · Icons
src/lib/           pdf · pdf-write · comments · tabs · folders · image · history · workspace ·
                   settings · platform · desktop-bridge · gallery · thumb-store · highlights ·
                   view · text-select · search · nav ·
                   print · themes · fonts
src/i18n.js        한국어 · 영어 문자열
test/              Vitest 스위트 · fixtures · reporters/summary.mjs
```
