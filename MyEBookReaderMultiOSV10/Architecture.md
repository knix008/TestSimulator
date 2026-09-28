# MyEBookReader — 구조 설명

하나의 화면 코드로 **웹 브라우저와 데스크톱(Electron)** 을 모두 지원하는 전자책 리더입니다.
이 문서는 코드가 어떻게 나뉘어 있고, 왜 그렇게 되어 있는지를 설명합니다.

---

## 1. 전체 구성

```
        ┌─────────────────────────── 렌더러 (React) ────────────────────────────┐
        │  App.jsx ── 상태 소유: 책 · 위치 · 표시(undo/redo) · 설정 · 탭 · 대화상자 │
        │     │                                                                  │
        │     ├─ components/  TitleBar · Toolbar · TabBar · LeftPanel · BookView  │
        │     │               · RightPanel · StatusBar · MenuList · dialogs       │
        │     │               · MenuHost(팝업 창) · DialogHost(팝업 창)            │
        │     │                                                                  │
        │     ├─ lib/book.js      형식 판별 + 통일된 책 인터페이스                  │
        │     │   ├─ epub.js  ZIP·OPF·NCX/NAV                                    │
        │     │   ├─ mobi.js  PalmDB·PalmDOC·EXTH                                │
        │     │   ├─ fb2.js   FictionBook XML → HTML                             │
        │     │   ├─ cbz.js   만화(ZIP 안의 그림)                                  │
        │     │   ├─ plaintext.js  txt · md · html                               │
        │     │   ├─ imagebook.js  그림 한 장 = 한 쪽                              │
        │     │   │   ├─ tiff.js   TIFF 디코더                                     │
        │     │   │   └─ dicom.js  DICOM 파서·윈도 레벨                            │
        │     │   └─ pdfbook.js → pdf.js 래퍼                                     │
        │     ├─ lib/zip.js · inflate.js   자체 ZIP · DEFLATE                      │
        │     ├─ lib/html.js · markdown.js 본문 정화 · 마크다운 렌더               │
        │     ├─ lib/library.js  .ebkr 독서 파일 · 표시 편집                        │
        │     ├─ lib/search.js · print.js · view.js · settings.js · menus.js      │
        │     └─ lib/platform.js  런타임 경계 (웹 ↔ Electron)                      │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        │ preload.js (contextBridge, 좁은 IPC)
        ┌───────────────────────────────┴──────────────────────────────────────┐
        │  electron/main.js         창 · 파일 · 대화상자 · 인쇄 · 설정 저장         │
        │  electron/childwindows.js 메뉴 창 · 대화상자 창 (풀링 · 배치 · 크기)      │
        │  electron/folder-list.js  서재 폴더 목록                                │
        │  electron/smoke.js        실제 창에서 도는 GUI 스모크 테스트              │
        └──────────────────────────────────────────────────────────────────────┘
```

---

## 2. 통일된 책 인터페이스

형식마다 파일 구조가 전혀 다르지만, 화면은 한 가지 모양만 알면 되도록
`lib/book.js` 가 모든 해석기를 같은 모양으로 감쌉니다.

```js
{
  format, formatLabel, reflowable,     // 'epub' · 'EPUB' · true
  meta,                                 // 제목 · 지은이 · 펴낸곳 · 언어 …
  sections, sectionCount,               // 장(또는 쪽) 목록
  toc,                                  // 목차 트리 [{ label, section, anchor, children }]
  loadSection(i),                       // { kind: 'html'|'image'|'pdf', html, src, page … }
  readSectionText(i),                   // 검색 · 내보내기용 평문
  resourceUrl(path), cover(), destroy()
}
```

* **reflowable** (EPUB · MOBI · FB2 · MD · HTML · TXT) — 정화된 HTML을 본문 폭·글꼴
  설정에 맞춰 흘려 보여 줍니다. 한 쪽씩 보기는 CSS 단 나눔으로 구현합니다.
* **fixed** (PDF · CBZ · 그림) — 쪽을 캔버스나 그림으로 그립니다. 확대·회전과
  **한 장/두 장씩(펼침)** 이 여기 적용되고, 펼침에서는 한 번에 두 쪽씩 넘어갑니다.

### 브라우저가 못 읽는 그림

TIFF와 DICOM은 Chromium이 디코딩하지 못합니다. `lib/tiff.js` 는 baseline TIFF를
(무압축 · PackBits · LZW · Deflate, 8/16비트, 흑백 · 팔레트 · RGB(A)) 풀고,
`lib/dicom.js` 는 DICOM 요소를 훑어 크기 · 비트수 · 광도 해석 · 윈도 레벨을 읽어
화면에 맞는 밝기로 바꿉니다. 둘 다 **바이트 → RGBA** 의 순수 함수라 캔버스 없이
단위 시험할 수 있고, 캔버스는 결과를 그릴 때만 쓰입니다. 압축 DICOM 중 JPEG 프레임은
브라우저에 그대로 넘기고, JPEG 2000 · JPEG-LS · RLE 은 추측하지 않고 그렇다고 알립니다.

`detectFormat()` 은 **확장자보다 내용을 먼저** 믿습니다. 잘못된 이름으로 저장된
책(`.epub` 인데 PDF)이 흔하기 때문이고, 확장자는 ZIP처럼 내용만으로 가를 수 없는
경우(EPUB ↔ CBZ)에만 결정에 쓰입니다.

### 왜 ZIP·DEFLATE를 직접 구현했는가

EPUB과 CBZ는 ZIP입니다. 브라우저의 `DecompressionStream` 은 비동기 스트림이라
"필요한 장만 즉시 꺼내 쓰는" 구조와 맞지 않고, 런타임에 따라 없을 수도 있습니다.
`lib/inflate.js` (RFC 1951)와 `lib/zip.js` 는 순수 함수라 **단위 테스트가 쉽고**,
중앙 디렉터리만 읽어 두었다가 **요청받은 항목만** 풀기 때문에 500 MB 만화책도
첫 장을 여는 속도가 작은 책과 같습니다. 테스트는 Node의 zlib이 압축한 데이터를
풀어 보며 검증합니다 — 우리 코드끼리 서로 옳다고 우기지 않도록.

---

## 3. 본문 정화 (lib/html.js)

책의 본문은 **믿을 수 없는 파일에서 온 HTML**이고, 그것을 앱 자신의 문서 안에
그립니다. 그래서 `sanitizeChapter()` 가

* `<script>` `<iframe>` `<object>` `<form>` … 을 제거하고
* `on*` 이벤트 속성과 `style` · `class` 를 지우고 (앱이 직접 만든 `fb2-*` 클래스만 예외)
* `javascript:` URL을 막고
* 그림은 **책 안의 자원**으로 다시 연결하고 (blob: URL)
* 링크는 `href` 대신 `data-section` / `data-external` 로 바꿉니다

작성자 CSS를 버리는 것은 보안 때문만이 아닙니다. 글꼴 · 크기 · 줄 간격 · 폭 · 테마는
**독자의 설정**이고, 책의 스타일시트는 그 설정과 싸웁니다.

---

## 4. 표시와 독서 파일

원본 책은 절대 고쳐 쓰지 않습니다. 책갈피 · 형광펜 · 메모 · 읽던 위치는
`lib/library.js` 가 **`.ebkr`(JSON)** 로 저장합니다. 이것이 설치 프로그램이 전용
아이콘과 함께 등록하는 이 앱의 **문서 형식**입니다.

형광펜은 좌표가 아니라 **글자 자체**에 붙습니다. 흘러가는 본문은 글자 크기만 바꿔도
같은 문장이 다른 자리로 가기 때문입니다. `BookView.paintMarks()` 가 그리기 직전에
해당 문장을 찾아 감쌉니다.

실행 취소는 `lib/history.js` 의 **스냅샷 방식**입니다. 표시 상태는 작은 평범한
객체이므로, do/undo 쌍을 짝지어 관리하는 것보다 통째로 보관하는 편이 단순하고
"실행 취소: 형광펜" 같은 이름표가 공짜로 따라옵니다.

---

## 5. 메뉴와 대화상자는 진짜 창이다

`electron/childwindows.js` 가 **메뉴 창 1개 + 대화상자 창 풀**을 관리합니다.

* 프레임 없는 BrowserWindow는 자기 HTML을 잘라 냅니다. 그래서 목록이 긴 메뉴
  (최근 파일이 들어간 파일 메뉴, 40개 테마)는 **본체 밖으로 펼쳐질 수 없습니다.**
  메뉴를 별도 창으로 띄우면 화면 어디로든 넘어갈 수 있고, 한 열로 길게 늘어놓아도
  스크롤이 필요 없습니다. 그래도 화면보다 긴 메뉴는 있습니다 — 테마 40종. 이때는
  `MenuHost` 가 잰 높이가 화면을 넘으면 **단을 하나씩 늘려** 다시 재고(최대 4단),
  `MenuList` 가 행 수를 그리드 행 수로 넘겨 위에서 아래로 채운 뒤 다음 단으로
  넘어갑니다. 잘라 내거나 스크롤을 붙이지 않는다는 원칙은 그대로입니다.
* 대화상자도 같은 이유와, "팝업은 본체와 독립적이되 본체가 닫히면 함께 닫혀야 한다"는
  요구 때문에 **`setParentWindow(main)` 를 건 별도 창**입니다. 크기는 고정이고
  내부 스크롤이 없으며, 내용에 맞춰 창 높이를 스스로 보고합니다(`dialog:size`).
* 창을 매번 새로 만들면 그때마다 렌더러가 부팅되어 느립니다. 그래서 팝업 창은
  **이름 없는 경로**(`?popup=dialog`)로 미리 띄워 두고, 어떤 대화상자인지는 IPC로
  건네며, 닫힌 창은 파괴하지 않고 **풀에 되돌립니다.**

웹 빌드에는 두 번째 창이 없으므로 같은 본문(`components/dialogs.jsx`)을 인페이지
모달로 그립니다. 대화상자 본문은 스스로 닫거나 설정을 쓰지 않고 `onResult({action})`
로만 보고하기 때문에, 두 host가 서로 바꿔 끼워집니다.

---

## 6. 런타임 경계 (lib/platform.js)

렌더러 코드에는 `if (Electron)` 이 거의 없습니다. 파일 열기 · 저장 · 내려받기 ·
클립보드 · 인쇄 · 창 제어가 모두 이 한 파일 뒤에 있고,

| | Electron | 웹 |
| --- | --- | --- |
| 열기 | 네이티브 대화상자 + 경로 읽기(진행률) | `<input type="file">` |
| 저장 | 네이티브 저장 대화상자 | Blob 내려받기 |
| 인쇄 | 오프스크린 창 → 시스템 인쇄 | 새 창 → 브라우저 인쇄 |
| 클립보드 | `clipboard` 모듈 | 비동기 Clipboard API |
| 설정 | localStorage + `userData/settings.json` | localStorage |

오래 걸리는 작업은 모두 진행률을 보고하므로, UI가 진행 창을 띄울 수 있습니다.

---

## 7. 창 크기와 쪽 넘김

툴바가 필요로 하는 폭은 **언어 · 글꼴 · 이름 표시 여부**에 따라 달라지므로 상수로
정할 수 없습니다. `Toolbar` 가 배치된 실제 너비를 재서 `win:setMinWidth` 로 알려
주고, 메인 프로세스가 그 값을 창의 최소 폭으로 씁니다 — 버튼이 가려지는 일이
없습니다.

**좌·우 패널도 같은 방식**입니다(`components/panelWidth.js`). 탭 이름은 언어와
글꼴에 따라 길이가 변하므로 `usePanelMinWidth` 가 한 프레임 동안 탭의 `flex` 를
풀어 각자 제 너비를 갖게 한 뒤 재고, 그 값을 패널의 최소 폭으로 삼습니다. 여기서
중요한 것은 **합이 아니라 가장 넓은 탭 × 탭 수**라는 점입니다 — 탭이 `flex: 1` 로
똑같이 나눠 갖기 때문이고, 합으로 계산했더니 239px 가 나와 242px 에서 "책갈피"가
잘렸습니다. 끌어서 줄일 때도 이 값 아래로는 내려가지 않습니다.

쪽 넘김 효과는 `BookView` 가 지금 보고 있는 자리(`장:단`)의 변화에서 방향을 계산해
한 번만 도는 클래스를 붙이는 것으로 끝납니다. 움직임 자체는 CSS에만 있고
(`turn-slide` · `turn-flip`), `prefers-reduced-motion` 에서는 아무것도 움직이지
않으며, 효과를 "없음"으로 두면 클래스가 아예 붙지 않습니다.

---

## 7.5 갤러리

`lib/gallery.js` 는 **읽은 책의 서가**입니다. 최근 파일 목록(10개, 파일 메뉴용)과는
다른 물건으로, 더 많은 책을 표지 · 지은이 · 형식 · 진행 · 마지막 읽음과 함께 들고
있습니다. 설정 파일에 함께 저장되므로 의도적으로 작게 유지합니다 — 개수 상한
(`MAX_GALLERY`)과, 표지를 카드 한 장 크기로 줄여 담는 `makeThumbnail`.

표지는 책이 가진 표지(`book.cover()`)를, 없으면 **지금 그려진 쪽**을 씁니다. 그래서
PDF · 만화 · 그림도 서가에서 알아볼 수 있습니다. 한 번 담은 표지는 다시 만들지
않고, 책을 다시 열어도 서가가 이미 아는 것(표지 · 읽던 자리)을 잃지 않습니다.

보기는 **큰 아이콘**과 **자세히** 두 가지이고 어느 쪽인지는 설정에 남습니다.
`Gallery` 컴포넌트 자체는 순수합니다 — 받은 목록을 그리고 "이 책을 열어라 · 이
책을 빼라 · 이렇게 정렬하라"를 보고할 뿐, 무엇도 스스로 바꾸지 않습니다.

그림 복사는 `BookView.pageImage()` 가 답합니다: 오른쪽 클릭한 그림, 없으면 쪽
그림, 없으면 PDF 캔버스. 캔버스가 오염되어 읽을 수 없으면 원본이 data URL 일 때만
그것을 돌려주고, 아니면 null 입니다 — 던지지 않습니다.

---

## 8. 테스트

```
test/
  inflate · zip · html · markdown · search · library · view · print   핵심 엔진
  epub · mobi · fb2 · cbz · plaintext · book · image                   책 형식
  settings · themes · menus · folders · platform                       설정·상태
  components · bookview · panels · dialogs · menuhost · app            GUI 동작
  i18n                                                                 언어
  package · electron-contract · icon-assets · reporter                 빌드·패키징
```

* **샘플 책**(`scripts/make-samples.mjs`)은 형식마다 진짜 파일을 만들어 둡니다.
  해석기는 그 파일들을 상대로 시험합니다 — 해석기의 가정에 맞춰 쓴 고정물이 아니라.
* **GUI**는 실제 컴포넌트를 렌더링해 버튼 · 메뉴 · 패널 · 대화상자 · 단축키 ·
  끌어다 놓기까지 눌러 봅니다. `app.test.jsx` 는 진짜 EPUB을 열어 읽고 표시하고
  찾고 인쇄합니다.
* **electron-contract** 는 preload가 노출하는 호출과 메인 프로세스가 처리하는
  채널이 정확히 맞는지 검사합니다. 여기는 타입 검사기가 없는 경계입니다.
* **팝업 레이아웃**은 `npm run shoot:dialog -- settings out.png` 로 그 창만 찍어
  눈으로 확인합니다 — 설정 창이 내용 없이 납작해졌던 것도 이렇게 찾았습니다
  (팝업 문서에 높이가 없어 flex 열이 무너진 것이 원인이었습니다).
* `npm run smoke` 는 같은 확인을 **진짜 Electron 창**에서 합니다: 메뉴가 별도
  창으로 떴는지, 최소 폭이 OS에 적용됐는지, 투명도가 실제 창에 걸렸는지.
* 결과는 분류별로 묶여 출력되고, 마지막에 **칸이 맞는 요약 표**가 붙습니다
  (`test/reporters/summary.mjs`). 한글은 터미널에서 두 칸을 차지하므로
  `String.length` 가 아니라 표시 폭으로 자리를 맞춥니다.
