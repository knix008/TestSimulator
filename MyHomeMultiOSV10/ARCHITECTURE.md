# MyHomeMaker 구조

블록을 끌어다 놓아 홈페이지를 만드는 그래픽 웹사이트 제작 도구의 내부 구조입니다. 사용법은 [USERSGUIDE.md](USERSGUIDE.md)(요약)와 앱 안의 사용 설명서([doc/UsersGuide.md](doc/UsersGuide.md))에 있습니다.

## 한눈에

```
┌──────────────── Tauri 2 (Rust, src-tauri/) ────────────────┐
│ 창·팝업 창·문서 창 · 파일 읽기/쓰기 · 사이트 쓰기·미리 보기  │
│ 인쇄(WebView2) · 데이터베이스(sqlx, tiberius) · 글꼴 · 설치 훅 │
└───────────────▲─────────────────────────────▲──────────────┘
                │ invoke / 이벤트              │
┌───────────────┴──────── 웹 페이지 (src/, Vite) ─────────────┐
│ main.js ─ 창 이름(label)에 따라 하나를 불러옴                 │
│   app.js     메인 창: 메뉴·툴바·캔버스·패널·명령              │
│   popup.js   팝업 창: 설정·디자인·새 사이트·게시·인쇄·패키지 … │
│   viewer.js  문서 창: 사용 설명서·튜토리얼 문서·동영상          │
│   code.js    코드 편집기 창                                   │
│ domain/  사이트 모델·블록·HTML/CSS·디자인·예제 (DOM 없음)     │
└─────────────────────────────────────────────────────────────┘
```

- 같은 번들(`dist/`)이 모든 창을 그립니다. 데스크톱에서는 창마다 OS 창, 웹 버전에서는 팝업이 페이지 안의 iframe(`index.html?popup=<kind>`), 문서 창과 코드 편집기는 새 탭(`?viewer=<kind>`)입니다.
- `src/domain/` 은 DOM 을 쓰지 않습니다. 그래서 단위 테스트가 Node 에서 그대로 불러 씁니다.
- 사이트는 JSON 하나(`.myhome`)이고, 캔버스와 게시는 같은 HTML 을 만듭니다(편집용 `data-*` 표시만 다름).

## 디렉터리

| 경로 | 내용 |
|---|---|
| `src/main.js` | 진입점. 창 이름(`main`, `popup-*`, `doc-*`, `doc-code`)으로 `app.js` · `popup.js` · `viewer.js` · `code.js` 중 하나를 불러옴 |
| `src/app.js` | 메인 창 전체: 상태(`state`), 명령 표(`commands`), 메뉴·툴바, 패널, 시작 화면, 파일, 게시, 인쇄 작업, 패키지, DB, 코드 편집기 연결, 디자인 미리 적용 |
| `src/popup.js` | 모든 팝업 창의 그리기와 입력 (설정 탭 11개, 디자인·내 테마 편집기, 새 사이트, 게시, 인쇄 미리 보기, 패키지, 메뉴 …) |
| `src/viewer.js` | 문서 창: `public/docs/*.html` 을 iframe 으로, 장 이동·찾기·인쇄·언어(국기) 전환, 튜토리얼 동영상 |
| `src/code.js` | 코드 편집기 창: 탭, 구문 색, 찾기/바꾸기, 정리·검사, HTML 미리 보기, 사이트 코드 |
| `src/views/canvas.js` | 편집 캔버스: 사이트를 iframe 에 `document.write` 로 그리고, 선택·끌어 놓기·글 고치기 겹침층 |
| `src/ui/` | 시작 화면(카드 보드), 튜토리얼, 편집기(inspector), 문제점 패널, 드롭다운, 툴팁, 움직이는 배경, 디자인 카드 |
| `src/domain/site.js` | 사이트 모델: 만들기·정규화·찾기·주소(slug), `site.code`(사이트 CSS/JS/head) |
| `src/domain/blocks.js` | 블록 35종(+머리글·바닥글): 기본값(한·영), 편집 필드, HTML. 게시판 블록과 그 스크립트 포함 |
| `src/domain/render.js` | 디자인 → CSS(`siteCss`), 사이트 CSS 덧붙이기(`siteStyles`), 페이지 HTML(`pageHtml`) |
| `src/domain/designs.js` | 디자인 40개, 글꼴, 값 검사(`effectiveDesign`), 내 테마(`customDesigns`) |
| `src/domain/templates.js` · `samples.js` · `sample-boards.js` | 템플릿 12개, 예제 40개(홈 구성 8가지 × 5), 예제 게시판 글 |
| `src/domain/publish.js` | 게시 파일 목록: 페이지별 HTML, `style.css`, `script.js`, 그림을 `assets/` 로 |
| `src/domain/problems.js` · `spell.js` · `spell-extra.js` | 사이트 점검, 영어·한국어 맞춤법(조사·어미 분석), 기본 사전 보충 |
| `src/domain/highlight.js` · `codetools.js` · `codebus.js` | 코드 편집기의 구문 색·찾기·주석, 정리/검사, 창 사이 메시지 큐 |
| `src/domain/packages.js` | 받아 쓰는 패키지 목록(Prettier, JSHint, HTMLHint): 주소·크기·SHA-256 |
| `src/domain/settings.js` | 설정 기본값·정규화·저장, DB 연결 설정(`dbConfig`) |
| `src/domain/document.js` · `history.js` | 열린 사이트 한 개, 스냅숏 실행 취소 |
| `src/print/` | 인쇄 배치(`layout.js`, 순수 계산)와 인쇄 창의 그리기(`window.js`) |
| `src/export/` | ZIP·PDF 만들기(`files.js`), 게시판 서버(`board-server.js`) |
| `src/platform/` | Tauri 경계(`native.js`), 팝업 관리(`popups.js`), IndexedDB(`idb.js`), 패키지 받기(`packages.js`) |
| `src/i18n/ko.js` · `en.js` | 화면 문구(키가 같아야 함 — 단위 테스트가 확인) |
| `src-tauri/src/` | `lib.rs`(명령·창), `files.rs`, `db.rs`, `printing.rs`, `fonts.rs`, `instance.rs`, `window_state.rs`, `i18n.rs` |
| `doc/` | 사용 설명서·튜토리얼(한·영 Markdown)과 그림 → `npm run build:docs` 로 `public/docs/` |
| `scripts/` | 빌드, 문서, 그림 찍기, 튜토리얼 캡처·동영상, 사전 만들기, 테스트 실행 |
| `test/` | 단위(`unit/`), 웹·데스크톱 GUI(`e2e/`), 결과 표(`report.mjs`) |

## 사이트 모델

```js
{
  format: 'myhomemaker', version: 1, id, name,
  meta:   { title, description, language: 'ko'|'en', author, keywords, favicon },
  design: { id: '<디자인>', overrides: { primary: '#…', radius: 12, … }, name?: '<내 테마 이름>' },
  code:   { css, js, head },                 // 코드 편집기의 사이트 코드
  layout: { header: <navbar 블록>, footer: <footer 블록> },
  pages:  [{ id, name, slug, title, description, nav, blocks: [{ id, type, props, style }] }],
}
```

- 블록 종류마다 `blocks.js` 의 `add(type, group, icon, ko, en, { defaults, fields, render })` 하나가 기본값·편집 필드·HTML 을 모두 정합니다. 편집기(`ui/inspector.js`)는 `fields` 만 보고 칸을 그립니다(text, textarea, md, code, image, url, number, toggle, select, color, items, actions).
- `render` 는 `ctx.editor` 에 따라 편집용 표시(`data-edit`, `data-edit-image` …)를 넣거나 뺍니다. 게시 HTML 에는 편집 흔적이 없습니다.
- `normalizeSite` 가 열 때마다 값을 검사합니다(모르는 디자인 → ocean, 빠진 머리글·바닥글 → 새로, 주소 중복 → 고침). 예전 파일에 `code` 가 없어도 빈 값으로 채웁니다.

## 실행 취소와 저장

- `SiteDocument.apply(label, change)` 가 바꾸기 전의 JSON 을 쌓습니다. 실행 취소는 스냅숏을 바꿔 끼웁니다(`history.js`).
- 모든 변경은 `app.js` 의 `change(labelKey, mutate)` 를 거칩니다. 그 뒤 `afterChange` 가 캔버스·패널·상태 표시줄·문제점을 다시 그리고, 코드 편집기 창에 사이트 코드를 알립니다.
- **디자인 미리 적용**: 디자인 카드(왼쪽 패널, 디자인 창)를 누르면 `tryDesign` 이 기록 없이 바로 바꿔 보여 주고 원래 디자인을 기억합니다. *적용*은 원래 → 마지막 디자인을 실행 취소 한 단계로 남기고, *취소*는 원래대로 돌립니다. 다른 변경·실행 취소·저장·사이트 전환 전에는 자동으로 적용됩니다.
- 세션(열린 사이트)은 localStorage 에 남겨 다음 실행 때 다시 엽니다.

## 창

| 창 | 이름(label) | 내용 |
|---|---|---|
| 메인 | `main` | 프레임 없는 창. 메뉴 막대 줄이 제목 표시줄(아이콘·이름·버전 → 시작 → 메뉴 → 사이트 이름 → 창 단추) |
| 팝업 | `popup-<kind>` | 메인 창에 딸린 OS 창. 크기 고정(`platform/popups.js` 의 `POPUPS`), 매개변수는 localStorage, 답은 이벤트(`popup-message`) |
| 문서 | `doc-guide`, `doc-tutorial` | 시스템 제목 표시줄이 있는 독립 창. 자리·크기 기억 |
| 코드 편집기 | `doc-code` | 독립 창. 메인 창과는 localStorage 큐(`myhomemaker.code.inbox/outbox/site`)로 대화 |

웹 버전에서는 팝업이 iframe(`postMessage`), 문서 창과 코드 편집기가 새 탭입니다. 튜토리얼이 도는 동안에는 데스크톱에서도 팝업을 iframe 으로 열어 화면 녹화에 함께 담깁니다.

## 게시

- `siteFiles(site)` → 페이지마다 `<slug>.html`, `style.css`(디자인 CSS + 사이트 CSS), 사이트 JS 가 있으면 `script.js`, 그림은 `assets/img-<hash>.<ext>`.
- 게시 HTML 은 자바스크립트 없이 동작합니다(휴대폰 메뉴는 체크박스, 질문은 `<details>`, 게시판 글은 `:target`). 게시판의 분류·검색·쪽 나누기는 그 위에 얹는 작은 인라인 스크립트입니다.
- 폴더는 Rust(`write_site_files`)가 쓰고, ZIP 은 `export/files.js` 가 만듭니다. 브라우저 미리 보기는 임시 폴더에 쓰고 엽니다(`preview_site`).

## 게시판과 데이터베이스

```
편집기 ──(Tauri: db_board_load / db_board_save)──► db.rs ──► SQLite3 · MySQL · MariaDB · PostgreSQL · MSSQL
                                                              ▲
게시한 사이트 ──fetch /api/board──► server/ (Node · Go · Rust · Python) ──┘   (같은 표 myhomemaker_board_posts)
```

- 게시판 블록의 *글 저장 위치*가 `site`(기본)이면 글은 사이트 파일 안에 있고, `database` 이면 DB 에 둡니다.
- `src-tauri/src/db.rs`: sqlx(Any 드라이버)로 SQLite·MySQL/MariaDB·PostgreSQL, tiberius 로 MSSQL. 표는 처음 쓸 때 만듭니다(`board_id, post_id` 기본 키, 한국어는 utf8mb4 / NVARCHAR). 저장은 게시판 단위로 한 트랜잭션에서 지우고 다시 넣습니다. 오류 문구에 비밀번호는 넣지 않습니다.
- SQLite3 파일을 비워 두면 앱 데이터 폴더의 `board.db` 를 씁니다(`db_default_file`).
- 연결 설정은 설정(localStorage)에 있고, 비밀번호는 사용자가 켤 때만 저장합니다(아니면 실행하는 동안만 메인 창이 기억).
- 게시할 때 DB 게시판이 있으면 `export/board-server.js` 가 `server/` 를 함께 씁니다. 언어는 설정의 `boardBackend`(기본 `node`): Node 는 server.js · package.json, Go 는 main.go · go.mod(`export/board-go.js`), Rust 는 Cargo.toml · src/main.rs(`export/board-rust.js`), Python 은 server.py · requirements.txt(`export/board-python.js`). config.json 과 README.md 는 같습니다. SQLite3 · MySQL · MariaDB · PostgreSQL · MSSQL 중 고른 DB 의 드라이버만 들어갑니다. 비밀번호는 쓰지 않고 `DB_PASSWORD` 환경 변수에서 읽습니다. 표가 비어 있으면 페이지에 있던 글로 시작합니다. SQLite3 이면 지금 DB 파일도 `server/board.db` 로 함께 갑니다. Node.js · Go · Rust · Python 은 프로그램에 포함되지 않습니다. 데스크톱은 `toolchains.rs` 가 PATH 를 보고, 없으면 winget 으로 설치를 시작합니다.

## 디자인과 내 테마

- 디자인 40개(밝은 26 · 어두운 14)는 색 12개, 제목·본문 글꼴, 모서리, 내용 폭, 글자 크기입니다. 사이트는 디자인 id 와 바꾼 값(`overrides`)만 가집니다.
- 내 테마는 설정의 `customDesigns`(최대 60개, 재설치에도 유지). 적용하면 사이트에는 `{ id: 바탕 디자인, overrides: 모든 값, name }` 이 들어가 테마를 지우거나 다른 컴퓨터에서 열어도 모양이 같습니다.
- 디자인 카드 그림은 `ui/designcard.js` 하나로 왼쪽 패널과 디자인 창이 함께 씁니다.

## 코드 편집기

- `code.js`: 텍스트 영역 위에 색칠한 `<pre>` 를 겹쳐 그립니다. 줄은 블록으로 나누고(줄 바꿈을 넘는 색 구간은 닫았다 다시 엶), 줄 번호 열은 세로 스크롤만 따라갑니다. 편집은 `execCommand('insertText')` 로 해서 Ctrl+Z 가 그대로 됩니다.
- `domain/highlight.js`: HTML(안의 `<style>`·`<script>` 포함)·CSS·JavaScript·JSON 토크나이저. 색을 입혀도 글자는 그대로라는 것을 단위 테스트가 확인합니다.
- 사이트 코드 탭(사이트 CSS/JS/head)은 입력이 멈추면 메인 창으로 보내 실행 취소 한 단계로 적용됩니다.

## 패키지

- `domain/packages.js` 의 목록(jsDelivr, 안 되면 unpkg)을 `platform/packages.js` 의 `PackageManager` 가 메인 창에서 받습니다: 스트림으로 진행률, 30초 동안 아무것도 안 오면 실패, SHA-256 이 맞을 때만 IndexedDB 에 보관, 취소·다시 받기.
- 진행 상태는 localStorage(`myhomemaker.packages.v1`)에 있어 팝업(패키지 창, 설정 › 패키지)이 같은 진행률을 그립니다. 코드 편집기 창은 IndexedDB 에서 파일을 꺼내 전역 범위로 실행합니다(`loadPackage`).

## 인쇄

- 메인 창이 페이지 HTML 을 IndexedDB(`print-job`)에 넣고 인쇄 창을 엽니다(그림이 커서 localStorage 로는 부족).
- 인쇄 창은 숨은 iframe 으로 페이지 높이를 재고(`measurePages`), 용지마다 잘라 보이는 상자 안에 iframe 을 축소·이동해 둡니다. 같은 용지 묶음이 화면에서는 미리 보기, 인쇄에서는 유일한 내용입니다.
- Windows 에서는 `printing.rs` 가 WebView2 로 프린터를 골라 대화 상자 없이 인쇄합니다(`print_direct`). 프린터 목록이 없으면 시스템 인쇄 창. 테스트는 `print_pages_to_pdf` 로 PDF 를 확인합니다.

## 맞춤법과 문제점

- 사전은 `npm run build:dict` 가 `public/dict/{en,ko}.txt` 로 만듭니다. 한국어 사전은 NFD(자모)로 저장돼 있어 NFC 로 정규화하고, `spell.js` 가 조사·어미를 떼어 기본형을 찾습니다.
- 내장 콘텐츠(템플릿·예제·블록 기본값·튜토리얼)는 맞춤법 문제가 0 개여야 합니다. 새 글이 걸리면 `spell-extra.js` 에 단어를 더합니다(단위 테스트가 잡음).
- 캔버스 밑줄은 CSS Custom Highlight API(`hm-spell`, `hm-problem`)입니다. 파일 편집의 HTML·CSS·JavaScript 오류는 줄 번호와 그 줄에 표시되고, 문제점 목록(`kind: code`)에도 들어갑니다. 그 줄을 두 번 누르면 편집창의 그 위치로 갑니다.

## 플랫폼 경계와 저장 위치

| 무엇 | 어디 |
|---|---|
| 설정, 최근 파일·폴더, 세션, 내 테마, DB 연결, 패키지 상태 | WebView2 프로필의 localStorage (`myhomemaker.*`) |
| 패키지 파일, 인쇄 작업, 웹 버전의 파일 핸들·배경 그림 | IndexedDB (`myhomemaker`) |
| 창 자리·크기, 배경 그림, crash.log, 기본 SQLite 파일(`board.db`) | 앱 데이터 폴더(`%APPDATA%\com.shkwon.myhomemaker`) |

웹 버전은 같은 코드를 쓰되 파일은 File System Access API(없으면 내려받기)로, DB 연결과 바로 인쇄는 쓸 수 없습니다(설정 화면이 그렇게 알려 줌).

## 여러 실행과 설치

- 프로그램은 여러 개 동시에 실행할 수 있습니다. `instance.rs` 가 실행 중인 개수만 세어 첫 번째만 지난 세션을 복원하고, 다음 창은 조금 비켜 엽니다.
- 설치 프로그램(`src-tauri/windows/hooks.nsh`)은 설치를 하나만 둡니다: 이전 설치가 있으면 완전히 지우고 다시 설치할지 묻고, 사용자 데이터를 지울지 따로 묻습니다. 데이터를 남기면 다음 실행 때 환경 설정만 기본값으로 돌아갑니다(내 사전·내 테마·최근 기록 등은 유지).

## 문서 생성

- `doc/*.md` → `npm run build:docs` → `public/docs/*.html`(목차·장 링크, 한·영 국기 전환). 그림은 `npm run guide:images`(실제 웹 빌드에서 찍음), 튜토리얼 문서·동영상은 `npm run tutorial:docs` · `npm run tutorial:video`.

## 테스트

| 명령 | 내용 |
|---|---|
| `npm test` | 아래 네 가지 전부, 한 줄에 하나씩 번호·결과·분류·이름·시간 |
| `npm test -- --quick` | 단위(js) + Rust |
| 단위(js) | `test/unit/*.test.js`: 모델, 블록, 디자인·내 테마, 템플릿·예제(구성 다양성 포함), 게시, 맞춤법, 문제점, 인쇄 배치, 패키지(가짜 서버로 받기·취소·체크섬), 코드 편집기, 게시판 서버(실제로 SQLite3 로 띄움), 문서, 번역 키 |
| Rust | `cargo test`: 파일, 글꼴, 실행 개수, 인쇄 값, 창 자리, DB(주소, 표, SQLite 저장·읽기, 비밀번호가 오류에 안 나오는지) |
| 웹 | `test/e2e/web.smoke.mjs <dist 절대 경로>`: 헤드리스 Edge 로 한국어·영어 각각 모든 기능(약 970개). `TEST_GROUPS=problems,print` 로 일부만 |
| 데스크톱 | `test/e2e/desktop.smoke.mjs [exe]`: 실제 앱을 격리 폴더로 띄워 CDP 로 조작 |

데스크톱 테스트용 환경 변수: `MYHOMEMAKER_CONFIG_DIR`, `MYHOMEMAKER_DATA_DIR`(앱 데이터·`board.db`), `MYHOMEMAKER_MULTI`, `MYHOMEMAKER_LOCK_DIR`, `MYHOMEMAKER_OPEN_LOG`·`MYHOMEMAKER_NO_OPEN`(외부 프로그램을 띄우지 않고 기록), `MYHOMEMAKER_IO_DELAY_MS`(진행률 창 확인), `MYHOMEMAKER_TEST_COMMANDS`, `MYHOMEMAKER_TUTORIAL_VIDEO`, `WEBVIEW2_USER_DATA_FOLDER`·`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`(CDP 포트).

`tauri dev` 가 떠 있으면 `src-tauri/target/debug` 의 실행 파일이 잠기므로, 시험용 빌드는 `CARGO_TARGET_DIR=src-tauri/target-test` 로 따로 만듭니다(.gitignore 에 있음).
