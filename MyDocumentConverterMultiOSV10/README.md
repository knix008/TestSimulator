# My Document Converter V1.0

Pandoc 방식의 문서 변환기입니다. Markdown, HTML, DOCX, ODT, EPUB, PDF, LaTeX, reStructuredText, Org, AsciiDoc, Textile, MediaWiki, RTF, JSON, CSV/TSV, Jupyter 노트북을 서로 변환합니다. 같은 코드가 **웹 브라우저**, **Windows**, **macOS**, **Linux**에서 동작하며, 각 플랫폼용 설치 파일을 만들 수 있습니다.

제작자: **SHKWON (knix008@naver.com)**

![메인 화면](test-results/smoke/01-main.png)

## 주요 기능

- **내장 변환 엔진** — 문서를 공통 모델(AST)로 읽어 들인 뒤 원하는 형식으로 씁니다. 외부 프로그램(Pandoc 등) 없이 모든 플랫폼에서 같은 결과를 냅니다.
- **Pandoc 과 같은 형식 집합** — 읽기 45종 / 쓰기 60여 종, 모두 자체 엔진으로 처리합니다 (PDF는 쓰기 전용, 데스크톱 판에서 생성).
  - Markdown 계열: pandoc, GFM, CommonMark(+x), strict, PHP Extra, MultiMarkdown, Markua, Djot
  - 마크업: HTML(4/5/chunked), LaTeX, ConTeXt, Texinfo, reStructuredText, Org, Textile, AsciiDoc(3종), Typst, Haddock, Muse, txt2tags, POD, plain, ANSI
  - 위키: MediaWiki, DokuWiki, TikiWiki, TWiki, Vimwiki, Creole, XWiki, Zim, Jira
  - 매뉴얼 페이지: man, mdoc, ms · 오피스: DOCX, ODT, OpenDocument(fodt), RTF, ICML, **PostScript**(Pandoc 에는 없음) · 전자책: EPUB 2/3, FB2
  - 슬라이드: reveal.js, Slidy, Slideous, S5, DZSlides, Beamer, PPTX
  - XML: DocBook 4/5, JATS(3종), BITS, TEI, OPML · 참고문헌: BibTeX, BibLaTeX, CSL JSON, RIS, EndNote XML · 데이터: CSV, TSV, ipynb, Pandoc JSON/native
  - 전체 목록은 [samples/README.md](samples/README.md)와 앱의 **변환 › 지원 형식** 창에 있습니다.
- **PostScript 입출력** — 자체 조판기가 문서를 페이지로 배치하고, 함께 설치되는 나눔 글꼴(OFL, `public/fonts/`)을 Type 42 CID 글꼴로 **파일 안에 내장**하므로 한글 문서도 어떤 PostScript 뷰어·프린터에서든 그대로 나옵니다(쓰는 글리프만 부분 집합으로 넣어 파일이 작습니다). 읽기는 이 프로그램이 만든 PS 는 구조 그대로, 다른 프로그램의 PS 는 본문 텍스트를 추출합니다.
- **큰 문서** — 4만 6천 줄(1만 4천 블록) Markdown 을 0.1 초에 읽고 대부분의 형식으로 1 초 안에 변환합니다(DOCX 1.5 초, PostScript 824쪽 0.7 초). 단위 테스트와 GUI 테스트가 이 크기로 시간 예산을 검사합니다.
- **실시간 미리보기** — 원본을 입력하면 오른쪽에 변환 결과가 바로 나타납니다(원본 / 원본+결과 / 결과만 보기).
- **변환 옵션** — 목차, 절 번호, 줄 바꿈, 메타데이터, Markdown 종류, HTML 스타일시트, 용지·여백, 문서 글꼴, LaTeX 클래스 등을 우측 속성 패널에서 조정합니다.
- **프로젝트 파일(.mdcv)** — 원본·형식·옵션을 한 파일로 저장하며, 설치 시 시스템에 고유 아이콘으로 등록됩니다.
- **일괄 변환**, **URL에서 열기**, **인쇄(미리보기·페이지 설정·범위 지정)**, **Undo/Redo**, **최근 파일 10개**, **20가지 테마**, **한국어/영어**, **시스템 글꼴 선택**, **배경 이미지**, **Drag & Drop**, **Ctrl+휠 확대/축소**.
- 모든 팝업(메뉴, 대화상자)은 **독립된 창**으로 열리며 메인 창을 닫으면 함께 닫힙니다. 긴 메뉴(입력/출력 형식)는 종류별 하위 메뉴로 나뉘고, 설정 창은 크기가 고정된 탭 구성입니다.

## 요구 사항

- Node.js 20 이상 (개발: Node 24 / npm 12에서 확인)
- Windows 설치 파일 빌드: 별도 도구 불필요 (electron-builder가 NSIS를 내려받음)
- macOS 설치 파일: macOS에서 빌드해야 합니다. Linux: AppImage/deb/rpm은 Linux에서 빌드합니다.

## 시작하기

```bash
npm install
npm start            # 데스크톱(Electron) 개발 실행 (Vite 개발 서버 + Electron)
npm run dev          # 웹 브라우저에서 실행: http://127.0.0.1:5174
```

## 빌드와 설치 파일

```bash
npm run build        # 웹 번들 (dist/)
npm run dist:win     # Windows 설치 파일 (release/*.exe, 프로젝트 루트에 복사)
npm run dist:mac     # macOS dmg/zip
npm run dist:linux   # Linux AppImage/deb/rpm
```

설치 파일, 실행 파일, 실행 중인 창, 바로가기는 모두 `public/app-icon.svg`에서 생성된 같은 아이콘을 씁니다. `.mdcv` 프로젝트 파일은 `public/file-icon.svg`의 별도 아이콘으로 등록됩니다.

Windows 설치 프로그램은 이미 설치된 이전 버전을 **완전히 제거한 뒤** 다시 설치하며, 이전 설치가 남긴 데이터(설정·최근 파일·배경 이미지)가 있으면 **삭제 여부를 묻습니다**.

## 테스트

```bash
npm test             # 단위 테스트 + 빌드 + GUI 자동 테스트, 종류별 결과와 Summary 출력
npm run test:unit    # 단위 테스트만 (엔진·Pandoc 형식 집합·PostScript(Ghostscript WASM 렌더링 검증)·큰 문서·앱·패키징)
npm run test:gui     # GUI 자동 테스트만 (Electron으로 앱을 띄워 메뉴·대화상자·명령·변환을 실제로 실행)
```

결과는 `test-results/`에 로그와 `summary.json`, GUI 테스트의 스크린샷(`test-results/smoke/*.png`)으로 남습니다.

## 샘플 문서

`samples/` 폴더에 지원하는 모든 형식의 샘플이 종류별로 들어 있습니다. 출력 형식은 `samples/reference.md` 를 프로그램의 writer 로 변환한 결과이고, 입력 전용 형식은 손으로 쓴 문서입니다. `npm run samples` 로 다시 만듭니다. `npm run samples:convert`(그리고 `npm test` 의 samples 테스트)는 모든 샘플을 모든 출력 형식으로 실제 변환해 대표 12개 형식의 결과를 `samples/output/<종류>/<샘플>/` 에 저장하고 `samples/output/REPORT.md` 에 샘플×형식 표를 남깁니다.

## 문서

- [ARCHITECTURE.md](ARCHITECTURE.md) — 구조와 설계 결정
- [UsersGuide.md](UsersGuide.md) — 사용자 안내서
- [samples/README.md](samples/README.md) — 형식별 샘플 목록

## 프로젝트 구조

| 경로 | 설명 |
| --- | --- |
| `src/lib/doc/` | 변환 엔진: AST, 읽기(readers), 쓰기(writers), 형식 목록, 옵션 |
| `src/App.tsx` | 메인 창(제목 표시줄·메뉴·툴바·패널·탭·상태 표시줄) |
| `src/dialogs.tsx` | 모든 팝업 창의 내용 |
| `src/MenuHost.tsx`, `src/DialogHost.tsx` | 별도 창으로 열리는 메뉴/대화상자의 진입점 |
| `electron/` | 데스크톱 셸: 창·파일·인쇄·PDF·Pandoc·글꼴, 팝업 창 관리, GUI 테스트 하네스 |
| `build/` | 설치 스크립트(NSIS, Linux)와 생성된 아이콘 |
| `scripts/` | 아이콘 생성, 빌드 정보, 실행, 패키징, 테스트 실행기, 샘플 생성 |
| `samples/` | 형식별 샘플 문서 |
| `test/` | 단위 테스트와 리포터 |
