# 구조

My Document Converter V1.0 은 Pandoc 방식의 문서 변환기입니다. 같은 React 앱이 브라우저(Vite)에서도, 데스크톱 껍데기(Electron) 안에서도 그대로 돕니다.

## 기술 스택

| 층 | 기술 |
| --- | --- |
| UI | React 19 + TypeScript |
| 번들러 | Vite 8 |
| 데스크톱 | Electron 43, electron-builder 로 포장 (NSIS / dmg / AppImage·deb·rpm) |
| 아이콘 | lucide-react (UI), `@resvg/resvg-js` + `png-to-ico` (앱·파일 아이콘 생성) |
| DOCX | 쓰기 `docx`, 읽기 `mammoth` (브라우저 번들) |
| ODT / EPUB / 일괄 변환 ZIP | `jszip` |
| 그 외 모든 형식 | 자체 구현 (의존성 없음) |

## 변환 엔진 — `src/lib/doc/`

```
readers/*  ──►  Doc (AST)  ──►  writers/*
```

모든 변환은 **읽기 → 공통 문서 모델 → 쓰기** 입니다. 형식을 하나 더하는 일은 reader 하나, writer 하나를 더하는 일이지, 다른 모든 형식과의 쌍을 만드는 일이 아닙니다.

- `ast.ts` — 문서 모델. `Doc = { meta, blocks }`, 블록(문단·제목·코드·인용·목록·정의 목록·표·구분선·raw·div·행 블록)과 인라인(문자열·공백·강조·굵게·취소선·밑줄·위/아래 첨자·코드·수식·링크·이미지·각주·raw). Pandoc 의 모델을 작게 옮긴 것으로, 형식에 대한 지식이 전혀 없습니다.
- `formats.ts` — Pandoc 3 과 같은 형식 목록(읽기 45 · 쓰기 60여 종). 각 형식은 `group`(markdown / markup / wiki / man / office / ebook / slides / xml / biblio / data)을 가지며, 드롭다운의 optgroup 과 메뉴의 하위 메뉴가 이 그룹을 그대로 씁니다.
- `readers/markdown.ts` — CommonMark + 확장(파이프 표, 작업 목록, 취소선, 각주, YAML 메타데이터, 수식, 위/아래 첨자, 정의 목록, fenced div, raw HTML). `MARKDOWN_DIALECTS` 로 확장 집합을 켜고 꺼서 pandoc / strict / PHP Extra / MultiMarkdown / GFM / CommonMark(+x) 를 한 파서로 읽습니다.
- `readers/html.ts` + `htmlParse.ts` — 자체 HTML/XML 파서. 브라우저의 DOMParser 대신 쓰는 이유는 Node 에서 도는 테스트와, DOCX/ODT/EPUB 안의 XHTML 처리가 **같은 코드**를 쓰게 하기 위해서입니다. `readers/xml.ts`(DocBook, JATS/BITS, OPML, FB2)도 이 파서 위에 있습니다.
- `readers/markup.ts` — reStructuredText, Org, Textile, MediaWiki, AsciiDoc, LaTeX. `readers/wiki.ts` — DokuWiki, TikiWiki, TWiki, Creole, Vimwiki, Jira, Muse. `readers/misc.ts` — Djot, Typst, Haddock, txt2tags, POD. `readers/roff.ts` — man, mdoc. 각 형식은 줄 단위 블록 스캐너이고 인라인은 `inlineRules.ts` 의 규칙 기반 파서를 공유합니다(구분자 + 내용 + 구분자 모양이 모두 같기 때문).
- `readers/text.ts` — 일반 텍스트, CSV/TSV, JSON, Jupyter. `readers/rtf.ts` — RTF 토크나이저. `readers/binary.ts` — DOCX(mammoth → HTML → reader), ODT(content.xml), EPUB(spine 순서의 XHTML). `biblio.ts` — BibTeX/BibLaTeX, CSL JSON, RIS, EndNote XML(참고문헌은 `Doc.references` 로 들어가고 본문에는 참고문헌 블록으로 나타납니다).
- `writers/postscript.ts` + `readers/postscript.ts` + `ttf.ts` — PostScript. writer 는 작은 조판기(단어/한글 글자 단위 줄바꿈, 페이지 나눔, 목차 2-pass, 표·코드 상자·목록 표식)이고, `ttf.ts` 가 TrueType 의 cmap/hmtx/loca/glyf 를 읽어 **쓰인 글리프만 번호를 다시 매긴 부분 집합**을 만들어 Type 42 CIDFont(`sfnts`, Identity-H)로 내장합니다. 글꼴은 `public/fonts/`(나눔, OFL)에서 `ConvertEnv.loadFont` 로 받습니다(앱은 `fetch('./fonts/…')`, 테스트는 fs). 없으면 Helvetica/Courier 로 대체합니다. 각 블록의 AST 를 `%%mdcv-block:` 주석으로 남겨 reader 가 무손실로 되읽고, 남의 PS 는 토크나이저로 `show` 계열의 문자열과 위치를 모아 줄·문단·제목을 복원합니다. 검증은 devDependency `@jspawn/ghostscript-wasm`(Ghostscript WASM)으로 실제 해석·렌더링해서 합니다.
- `pandocAst.ts` — Pandoc JSON(API 1.23) 과 native(Haskell) 표기 사이의 다리. 이 덕분에 Pandoc 이 만든 AST 를 그대로 읽고 쓸 수 있습니다.
- `writers/render.ts` — 텍스트 writer 들이 공유하는 렌더러 골격. `writers/markdown.ts`(모든 Markdown 방언 + Markua), `writers/html.ts`, `writers/markup.ts`(plain, LaTeX, RST, Org, Textile, MediaWiki, AsciiDoc, RTF, JSON, CSV, ipynb), `writers/wiki.ts`, `writers/xml.ts`(DocBook 4/5, JATS 3종, TEI, OPML, FB2, ICML), `writers/typesetting.ts`(ConTeXt, Texinfo, man, ms, Beamer), `writers/slides.ts`(reveal.js, Slidy, Slideous, S5, DZSlides, PPTX), `writers/misc.ts`(Djot, Typst, Haddock, ANSI, AsciiDoc 변종, HTML4, 분할 HTML, EPUB 2), `writers/docx.ts`, `writers/odt.ts`(ODT + flat ODT), `writers/epub.ts`. `sections.ts` 는 슬라이드/분할 HTML 을 위해 제목 단위로 문서를 나눕니다.
- `options.ts` — writer 옵션(`standalone`, `toc`, 줄 바꿈, 메타데이터, Markdown 종류, HTML 스타일, 용지, 글꼴, LaTeX)과 기본값. 속성 패널·설정 창·프로젝트 파일이 같은 타입을 씁니다.
- `formats.ts` — 형식 목록: 이름(ko/en), 확장자, MIME, 읽기/쓰기 가능 여부, Pandoc 이름.
- `convert.ts` — 파이프라인. 플랫폼 의존은 단 하나, **HTML → PDF 렌더링**뿐이며 `env.renderPdf` 로 주입됩니다(데스크톱은 Chromium `printToPDF`, 브라우저는 인쇄 대화상자 안내).

외부 Pandoc 연동은 없습니다. 목표가 "Pandoc 엔진 없이 Pandoc 과 같은 기능"이므로 모든 변환은 이 엔진이 맡고, `formats.ts` 의 `pandoc` 필드는 Pandoc 이 쓰는 형식 이름을 참고용으로 기록할 뿐입니다.

## 프로세스 / 창 구성

창 상단은 **제목 표시줄**(프로그램 이름·버전·문서 이름, 창 단추), **메뉴 막대**, **아이콘 툴바** 세 줄입니다. 툴바 오른쪽 끝에는 언어(국기)·테마 전환·테마 선택·설정·정보 버튼이 우측 정렬되어 있습니다. 툴바는 절대 줄바꿈하지 않으므로 앱이 툴바 폭을 재어 **창 최소 폭**을 주기적으로 알려 줍니다(`window:min-width`).

팝업은 앱 창 안에서 그려지지 않습니다. 메뉴 드롭다운 하나하나, 대화상자 하나하나가 같은 번들을 해시 경로(`#menu=` / `#dialog=`)로 불러오는 자식 `BrowserWindow` 입니다. 테두리 없는 창은 자기 HTML 을 잘라 버리기 때문에 긴 메뉴가 창을 넘어 한 줄로 펼쳐지려면 이 방법뿐입니다. `electron/childwindows.cjs` 가 이들을 관리합니다.

- 메뉴 창은 **하나**뿐이며 어느 메뉴를 보여 줄지 IPC 로 전달받습니다. 클릭할 때마다 렌더러를 새로 띄우면 느리기 때문입니다.
- 대화상자 창은 **풀**에서 꺼내 쓰고, 닫으면 숨겨서 풀로 돌려보냅니다. 앱이 뜬 뒤 1.2 초에 뒤에서 미리 채워 두므로 첫 클릭부터 빠릅니다.
- 대화상자는 자기 내용을 재어 창 크기를 요청합니다(`dialog:size`). 그래서 팝업에는 스크롤바가 없고, 화면보다 클 때만 스크롤합니다.
- 모든 팝업은 메인 창의 자식이라 메인 창과 함께 닫히고, 메뉴 창은 `alwaysOnTop` 이라 앱 창 밖으로 나갈 수 있습니다.
- 브라우저 빌드는 같은 컴포넌트를 페이지 안 오버레이로 그립니다(`App.tsx` 의 `MenuDrop` 과 `.dialog-overlay`).

```
index.html
 └─ src/main.tsx            → 해시로 경로를 나눔: <App/> | <MenuHost/> | <DialogHost/>
     └─ src/App.tsx         → 창 구조, 문서 탭, 변환 실행, 명령 처리, 자동화 훅
        ├─ src/commands.ts    → 메뉴/툴바/컨텍스트 메뉴 명령 카탈로그
        ├─ src/i18n.ts        → 한국어/영어 표
        ├─ src/themes.ts      → 20 가지 테마의 색상 토큰
        ├─ src/dialogs.tsx    → 팝업 본문 (설정·정보·오류·저장 확인·진행·인쇄·최근·URL·단축키·형식·메타데이터·통계·Pandoc·일괄 변환)
        ├─ src/dialogMeta.ts  → 팝업 이름·아이콘·제목·payload 타입
        ├─ src/optionsForm.tsx → writer 옵션 폼 (속성 패널과 설정 창이 공유)
        ├─ src/controls.tsx   → Field/Check/Select/NumberField/Slider
        ├─ src/flags.tsx      → 언어 버튼의 국기
        └─ src/lib/*          → settings, history(undo/redo), project(.mdcv), platform(파일 IO 추상화), fonts, store(IndexedDB), errors
electron/main.cjs           → 창, 파일, URL 내려받기, Pandoc, 글꼴 목록, 인쇄/PDF, 최소 폭, OS 가 넘겨준 파일
electron/childwindows.cjs   → 메뉴 팝업과 대화상자를 별도 창으로
electron/preload.cjs        → contextBridge 로 노출하는 API
electron/smoke.cjs          → GUI 자동 테스트 하네스 (MDCV_SMOKE=1 일 때만 로드)
```

## 상태와 저장

- **문서(`DocState`)** — 원본 텍스트(또는 이진 원본 바이트), 입력/출력 형식, 옵션, 변환 결과, undo/redo 스택, 커서. 문서 목록은 `docsRef` 에 **동기적으로** 반영됩니다(`mutateDocs`). 형식을 바꾼 직후 시작하는 변환, 자동화 훅, 메뉴 명령이 모두 ref 를 읽는데, 렌더 뒤에야 갱신되는 ref 는 이전 문서를 건네 주었기 때문입니다.
- **Undo/Redo** — 스냅샷은 원본·형식·옵션 전체(`EditState`). 700 ms 안의 연속 입력은 한 단계로 합쳐집니다(`lib/history.ts`).
- **설정** — `localStorage` 의 JSON 하나. 데스크톱은 프로필 폴더(`%APPDATA%\My Document Converter V1.0`)에, 웹은 브라우저 저장소에 남습니다. 열기/저장/내보내기/일괄 변환 폴더, 최근 파일 10 개, 테마·언어·글꼴·확대·패널·배경, writer 기본값, 세션(열린 탭)이 여기 있습니다.
- **배경 이미지** — 크기 제한이 없으므로 `localStorage` 가 아닌 IndexedDB(`lib/store.ts`)에 Blob 으로 저장하고, 시작 시 object URL 로 CSS 변수에 넣습니다.
- **프로젝트 파일(.mdcv)** — JSON: 원본(이진이면 base64), 형식, 옵션. 설치 프로그램이 확장자와 아이콘을 등록하고 더블클릭하면 앱이 열립니다(`files:open-paths`).

## 파일 IO — `src/lib/platform.ts`

Electron 에서는 모든 파일 작업이 메인 프로세스로 갑니다. 브라우저에서는 File System Access API(Chromium)가 있으면 그것을, 없으면 `<input type=file>` 과 다운로드 링크를 씁니다. 앱 코드는 둘을 구분하지 않습니다.

## 오류

무엇이 던져지든 `lib/errors.ts` 가 사용자에게 보여 줄 보고서(제목·메시지·전체 상세: 버전, 시각, 동작, 문서, 스택, 환경)로 만들고 오류 팝업이 이를 표시합니다. 팝업에는 **복사** 버튼이 있고 상세 내용은 선택 가능한 textarea 입니다. 팝업 창은 자기 렌더러에서 나는 오류를 메인 창으로 전달합니다(`dialog:error`).

## 진행 표시

오래 걸릴 수 있는 작업(파일 열기/저장, URL 내려받기, 인쇄 준비, 일괄 변환)은 `withProgress` 로 감쌉니다. 350 ms 안에 끝나면 아무것도 보이지 않고, 넘기면 진행 팝업이 뜹니다. URL 내려받기는 바이트 진행률과 취소를 지원합니다.

## 설치

- Windows(NSIS, `build/installer.nsh`): `customInit` 에서 이전 설치의 언인스톨러를 조용히 실행하고 남은 폴더·바로가기를 지웁니다. `customInstall` 에서 이전 데이터(`%APPDATA%`, `%LOCALAPPDATA%`)가 있으면 삭제 여부를 묻고(무인 설치는 보존), `.mdcv` 를 `file-icon.ico` 로 등록합니다.
- Linux(`build/linux/after-install.sh`): MIME 타입과 아이콘을 등록합니다.
- macOS: `fileAssociations` 로 등록합니다.
- 아이콘: `scripts/create-icons.cjs` 가 `public/app-icon.svg` 하나에서 ico/png/여러 크기를 만들므로 설치 파일·실행 파일·창·바로가기가 어긋날 수 없습니다.

## 테스트

- `test/*.test.mjs` — `node --test`. `postscript.test.mjs` 는 Ghostscript WASM 으로 출력이 오류 없이 해석되고 잉크가 찍히는지까지 확인하고, `large.test.mjs` 는 4만 6천 줄 문서의 읽기·변환·왕복 시간 예산을 검사합니다(DOCX writer 는 순서 목록이 300 개를 넘으면 번호를 글자로 써서 docx 라이브러리의 O(n²) 번호 치환을 피합니다). 카테고리는 테스트 이름의 `category › name` 접두어이고 `test/helpers/reporter.mjs` 가 카테고리별로 묶어 Summary 를 냅니다. Node 가 TypeScript 를 직접 실행하며(`--import ./test/helpers/setup.mjs` 가 확장자 없는 import 를 `.ts` 로 해석) 엔진·앱·패키징을 검사합니다.
- `electron/smoke.cjs` + `scripts/smoke.mjs` — GUI 자동 테스트. 빌드된 앱을 Electron 으로 띄우고 `window.__mdcv` 훅으로 실제 코드 경로를 실행합니다: 제목 표시줄, 툴바 툴팁, 최소 폭, 6 개 메뉴와 컨텍스트 메뉴(형식 메뉴의 종류별 하위 메뉴 포함)(별도 창·한 열·아이콘+레이블·창 밖 표시), 14 개 대화상자(독립 창·크기 조절 불가·스크롤 없음: 설정/지원 형식/인쇄/일괄 변환은 고정 크기, 나머지는 열 때 내용 크기에 맞춤·메인 창 소유), 편집/undo/redo/클립보드, 모든 출력 형식 변환, 미리보기, 옵션 반영, 보기 모드·패널·확대·20 테마·언어, 탭 넘침 버튼, 저장 확인, 프로젝트/DOCX 왕복, 종료 시 팝업 정리. 스크린샷을 `test-results/smoke/` 에 남깁니다.
- `scripts/test-all.mjs` — `npm test`. 단위 → 빌드 → GUI 를 차례로 돌리고 종류별 표와 총합 Summary 를 출력합니다.
