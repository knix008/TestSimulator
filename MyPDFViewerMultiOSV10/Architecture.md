# MyPDFViewer — 구조 설명

하나의 화면 코드로 **웹 브라우저와 데스크톱(Electron)** 을 모두 지원하는 PDF 뷰어입니다.
이 문서는 코드가 어떻게 나뉘어 있고, 왜 그렇게 되어 있는지를 설명합니다.

---

## 1. 전체 구성

```
                    ┌───────────────────────── 렌더러 (React) ──────────────────────────┐
                    │                                                                   │
   사용자 입력 ───▶ │  App.jsx  ── 상태 소유: 문서 · 설정 · 작업내용(undo/redo) · 대화상자 │
                    │     │                                                              │
                    │     ├─ components/  Toolbar · Sidebar · PdfView · StatusBar · 대화상자
                    │     │                                                              │
                    │     ├─ lib/pdf.js      pdf.js 래퍼 (렌더 · 텍스트 · 이미지 · 검색)  │
                    │     ├─ lib/image.js    PNG/JPEG/WebP/GIF/BMP 인코딩                │
                    │     ├─ lib/history.js  스냅샷 실행취소                              │
                    │     ├─ lib/workspace.js .pdfvw 직렬화                               │
                    │     ├─ lib/settings.js 설정 기본값 · 정규화 · 최근 파일             │
                    │     └─ lib/platform.js ◀── 런타임 차이를 흡수하는 유일한 지점       │
                    └───────────────┬───────────────────────────────────────────────────┘
                                    │ contextBridge (preload.js)
                    ┌───────────────▼───────────────────────────────────────────────────┐
                    │  electron/main.js — 창 · app:// 프로토콜 · 네이티브 대화상자 ·      │
                    │                     파일 입출력(진행률) · 다운로드 · 클립보드 ·      │
                    │                     설정 저장 · 파일 연결 처리                       │
                    └───────────────────────────────────────────────────────────────────┘
```

핵심 원칙은 **런타임 분기를 `lib/platform.js` 한 곳에 가둔다**는 것입니다.
컴포넌트는 "파일을 저장한다"만 알면 되고, 그것이 네이티브 대화상자인지 브라우저 다운로드인지는
알 필요가 없습니다.

---

## 2. 왜 `app://` 프로토콜인가

패키징된 앱에서 `dist/index.html` 을 `file://` 로 열면 pdf.js가 동작하지 않습니다.
pdf.js는 **모듈 워커**를 띄우고 cmap·글꼴 데이터를 **fetch** 로 읽는데, `file://` 오리진에서는 둘 다 막힙니다.

그래서 [electron/main.js](electron/main.js)는 `app` 스킴을 *standard · secure · fetch 지원* 으로 등록하고
`app://bundle/index.html` 을 띄웁니다. 웹에 배포할 때와 완전히 같은 조건이 되므로
"개발에서는 되는데 설치본에서는 안 되는" 부류의 문제가 사라집니다.

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

`pdfjs-dist@4.8.69` 로 고정되어 있습니다. **4.9 이상(5.x·6.x 포함, legacy 빌드도 동일)** 은
워커에서 네이티브 `Promise.try` 를 호출하는데, Electron 31이 쓰는 Chromium 126에는 그 API가 없어
PDF가 아예 열리지 않습니다. 올리려면 Electron도 Chromium 128 이상(Electron 32+)으로 함께 올려야 합니다.

CJK 문서를 위해 `cmaps` 와 `standard_fonts` 를 `public/pdfjs/` 로 복사합니다
([scripts/copy-pdfjs-assets.mjs](scripts/copy-pdfjs-assets.mjs)).

---

## 4. 페이지 표시 — `src/components/PdfView.jsx`

* **가상화** — 화면 근처(±900px)의 페이지만 실제로 래스터화하고, 나머지는 정확한 크기의 빈 자리로 둡니다.
  419쪽 문서에서도 동시에 그려지는 페이지는 5개 안팎입니다.
* **배율 계산** — 컨테이너 크기를 `ResizeObserver` 로 재서 *너비 맞춤 / 페이지 맞춤 / 실제 크기 / 자유 배율* 을 계산합니다.
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

저장 흐름은 **두 단계**입니다. 먼저 경로만 고르고(`dialog:pickSavePath`),
**사용자가 고른 확장자를 보고 인코더를 정한 뒤** 인코딩해서 씁니다(`fs:writeBinary`).
그래서 저장 창에 `그림.webp` 라고 직접 입력해도 그 형식으로 저장됩니다.

---

## 5.5 목차 트리와 이미지 선택 — `src/components/Sidebar.jsx`, `PdfView.jsx`

* **목차 트리** — `getOutline()` 이 자식을 품은 노드 배열을 돌려주고, `OutlineTree` 가 재귀로 그립니다.
  접힘 상태는 노드 id 집합 하나로 관리합니다. 부모–자식 연결선은 CSS만으로 그립니다:
  중첩된 `li` 마다 왼쪽에 세로 줄기(`::before`)와 행으로 들어가는 짧은 가로선(`::after`)을 두고,
  **마지막 자식의 줄기는 가로선 높이에서 끊어** 가지가 깔끔하게 닫히게 합니다.

* **이미지 선택** — 그림을 클릭하면 *선택만* 되고 클립보드는 건드리지 않습니다.
  복사·저장·클립 보관은 오른쪽 클릭 메뉴가 제공합니다. 메뉴는 클릭 지점의 그림을 함께 받아
  (`onContextMenu(e, { page, imageHit })`), 선택되어 있지 않은 그림 위에서 바로 오른쪽 클릭해도
  그 그림에 대해 동작합니다.

---

## 5.7 인쇄 — `src/lib/print.js`

인쇄는 **양쪽 런타임 모두 pdf.js가 그린 페이지 이미지**를 보냅니다. 데스크톱에서 원본 PDF를
창에 띄워 인쇄하는 방법이 더 좋아 보이지만, Electron 31의 창은 PDF를 **빈 화면으로** 그립니다
(확인: 로드는 성공하고 캡처 색상은 1개 = 백지). 그대로 인쇄하면 백지가 나오므로 쓰지 않습니다.

* `parsePageList()` 가 `1-5, 8, 11-13` 을 쪽 번호 목록으로 바꾸고, 빈 값·형식 오류·문서 범위 초과를
  각각 다른 메시지로 구분합니다. 대화상자는 그 결과로 인쇄될 쪽 수를 미리 보여 줍니다.
* `renderPagesForPrint()` 는 150 DPI로 한 쪽씩 그려 JPEG로 인코딩하고 **캔버스를 즉시 반납**합니다.
  긴 문서를 인쇄해도 모든 쪽이 메모리에 남지 않습니다.
* 데스크톱은 이미지들을 IPC로 넘겨(`print:pages`) 임시 폴더에 파일로 쓰고, 그 파일들을 참조하는
  HTML을 오프스크린 창에 띄운 뒤 `webContents.print({ silent: false })` 로 시스템 인쇄 창을 엽니다.
  이미지는 `decode()` 가 끝난 뒤에 인쇄해 빈 페이지가 섞이지 않게 합니다.
* 웹은 같은 HTML을 새 창에 띄우고 `window.print()` 를 호출합니다.

---

## 6. 실행 취소 / 다시 실행 — `src/lib/history.js`

되돌릴 대상(형광펜 · 책갈피 · 클립 · 회전)은 작은 평범한 객체이므로,
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
  "workspace": { "annotations": [...], "bookmarks": [...], "clips": [...] }
}
```

PDF 자체는 넣지 않고 **경로만 가리킵니다.** 형식이 다르거나 버전이 높으면
그 사실을 그대로 알려 주는 오류 메시지를 던지고, 그 문장이 오류 팝업에 그대로 표시됩니다.

설치 프로그램이 `.pdfvw` 를 **전용 아이콘**과 함께 시스템에 등록하고,
`.pdf` 는 *연결 프로그램* 목록에 추가합니다. 설치 화면에서 **기본 뷰어로 설정**을 고르면
`Software\Classes\.pdf` 와 *기본 프로그램*(`RegisteredApplications` + `Capabilities`) 등록까지
이루어집니다. 실제 기본값이 저장되는 `FileExts\.pdf\UserChoice` 는 해시로 보호되어 설치
프로그램이 쓸 수 없으므로, 이미 다른 기본값이 있으면 Windows [기본 앱] 설정 창을 열어
사용자가 확인하도록 합니다 ([build/installer.nsh](build/installer.nsh)).

---

## 8. 설정과 상태 유지 — `src/lib/settings.js`

* 모든 설정은 **하나의 평범한 객체**이고, 바뀔 때마다 localStorage에 쓰고
  데스크톱에서는 `userData/settings.json` 으로도 복사합니다.
* 읽을 때는 `normalize()` 가 기본값 위에 덮어쓰면서 **모르는 키를 버리고 타입·범위를 강제**합니다.
  오래된 설정 파일이 앱에 이상한 값을 주입할 수 없습니다.
* 최근 파일 10개 · 최근 폴더 10개, 마지막 폴더, 마지막으로 본 쪽을 함께 보관합니다.

---

## 9. 오류 처리

렌더러의 모든 실패는 `App.jsx` 의 `fail(err, context)` 한 곳으로 모입니다.
여기서 Electron이 감싸는 `"Error invoking remote method 'fs:readBinary': Error: …"` 접두사를 벗겨
사람이 읽을 문장만 본문에 보여 주고, 원문과 스택은 *자세히 보기* 에 남깁니다.
전체 내용은 한 번의 클릭으로 복사할 수 있습니다.

오래 걸리는 작업은 `withProgress()` 로 감싸고, **180ms 이상 걸릴 때만** 진행률 창을 띄웁니다.
작은 파일을 열 때 창이 깜빡이지 않게 하기 위해서입니다.

---

## 10. 빌드와 배포

| 명령 | 결과 |
| --- | --- |
| `npm start` | Vite 개발 서버 + Electron (소스 수정이 즉시 반영). 시작 전에 `scripts/free-port.mjs` 가 5179 포트를 잡고 있는 이전 프로세스를 정리하므로, 비정상 종료 뒤에도 바로 다시 실행됩니다 |
| `npm run web` | 브라우저용 개발 서버 |
| `npm run build` | 웹 배포용 정적 파일 → `dist/` |
| `npm run build:win` / `:mac` / `:linux` | 설치 파일 → `release/` (그리고 프로젝트 최상위로 복사) |

* 아이콘은 `assets/icon.svg`(프로그램)와 `assets/file-icon.svg`(문서)에서
  `scripts/generate-icons.mjs` 가 ico/icns/png 전체를 생성합니다. 설치 파일도 같은 아이콘을 씁니다.
* 화면 코드는 Vite가 번들하므로 **`node_modules` 는 패키지에 넣지 않습니다**
  (`files` 에 `!node_modules/**/*`). app.asar 5.5MB, 설치 파일 78MB 수준입니다.
* `src/build-info.json` 은 빌드할 때마다 생성되어 버전·빌드 시각·커밋·브랜치를 담고,
  타이틀 바의 버전 표시와 *프로그램 정보* 창이 이 값을 씁니다.

---

## 11. 디렉터리

```
assets/            icon.svg · file-icon.svg (원본 아이콘)
build/icons/       생성된 ico · icns · png
build/installer.nsh NSIS 사용자 정의(바로가기 선택, 파일 형식 등록)
electron/          main.js · preload.js
public/pdfjs/      pdf.js 런타임 데이터(cmaps · standard_fonts) — 생성물
scripts/           아이콘 · 빌드정보 · pdf.js 자산 · 실행 · 설치파일 복사
src/components/    Toolbar · Sidebar · PdfView · StatusBar · TitleBar ·
                   Modal · Dialogs · CaptureDialog · SettingsDialog · AboutDialog ·
                   ContextMenu · Tooltip · Toasts · Icons
src/lib/           pdf · image · history · workspace · settings · platform · themes · fonts · ico
src/i18n.js        한국어 · 영어 문자열
```
