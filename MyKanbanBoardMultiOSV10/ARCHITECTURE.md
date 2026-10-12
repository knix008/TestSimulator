# MyKanbanBoard 구조

이 문서는 코드를 고치거나 기능을 더하려는 개발자를 위한 것입니다.

## 한눈에

```
┌──────────────────────── 메인 창 (label "main") ────────────────────────┐
│ src/app.js  메뉴 막대 · 툴바 · 탭 · 도구 패널 · 보드 · 속성 패널 · 상태 표시줄 │
│   └ platform/popups.js  PopupHost: 팝업을 열고 결과를 받음                │
└───────────────┬─────────────────────────────────────────────┬─────────┘
                │ invoke (Tauri IPC)                           │ emit / listen
┌───────────────▼───────────────┐            ┌─────────────────▼──────────────┐
│ src-tauri/src (Rust)          │            │ 팝업 창 (label "popup-<kind>")  │
│  lib.rs   명령·창 관리         │            │ src/popup.js                   │
│  files.rs 파일·진행률          │            │ settings about confirm error   │
│  db.rs    SQLite/MySQL/PG      │            │ progress recent print project  │
│  fonts.rs window_state.rs      │            │ image menu                     │
└───────────────────────────────┘            └────────────────────────────────┘
```

하나의 번들(`index.html` + `src/main.js`)이 모든 창을 맡습니다. `main.js`는 창 라벨(데스크톱) 또는 `?popup=<kind>`(웹)를 보고 `app.js` 또는 `popup.js`를 불러옵니다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/domain/` | UI와 무관한 순수 로직 (Node에서 단위 테스트) |
| `├ board.js` | 보드·열·카드 모델과 조작(추가·이동·정렬·필터·통계) |
| `├ document.js`, `history.js` | 열린 보드(탭) 하나: 경로, 변경 여부, 실행 취소 기록(스냅샷) |
| `├ format.js` | `.mkanban` 직렬화·파싱·복구 |
| `├ project.js` | `.mkproj` 직렬화·파싱, 저장소 설정 검증, DB 접속 정보 |
| `├ attachments.js` | 첨부 내용 저장소(AttachmentStore), MIME |
| `├ print.js` | 인쇄 범위 선택과 페이지 나누기 |
| `├ settings.js`, `recent.js`, `clipboard.js` | 설정, 최근 파일(10개), 클립보드 형식 |
| `src/platform/native.js` | 플랫폼 경계: 데스크톱은 Rust 명령, 웹은 브라우저 API |
| `src/platform/popups.js` | 팝업 열기/닫기/메시지 (데스크톱 = OS 창, 웹 = 페이지 안 프레임) |
| `src/app.js` | 메인 창 UI와 명령 표(`commands`) |
| `src/popup.js` | 모든 팝업 창 |
| `src/i18n.js`, `themes.js`, `icons.js` | 한국어/영어 문자열, 테마 12종, SVG 아이콘 |
| `src-tauri/` | Rust 백엔드, 설치 설정(`tauri.conf.json`), NSIS 훅, Linux MIME, macOS Info.plist |
| `scripts/` | `test.mjs`(테스트 러너), `build.mjs`(설치 파일), `render-icons.mjs`, `start.mjs` |
| `test/` | `unit/`, `static/`, `e2e/`(cdp·harness·suite), `db_integration.rs` |

## 창과 팝업

- **메인 창**은 OS 타이틀 바를 쓰고 제목은 `MyKanbanBoard v<버전>`입니다. 처음엔 숨겨 두었다가 첫 화면을 그린 뒤 보입니다.
- **팝업**(`open_popup`)은 테두리 없는 OS 창이며 `parent(main)`으로 메인 창에 소유됩니다. 그래서 메인 창 위에 머물고, 메인 창이 없어지면 함께 닫힙니다(`Destroyed` → `app.exit(0)`). `resizable(false)`로 크기가 고정이고, 각 팝업은 내용이 스크롤 없이 들어가는 크기입니다(긴 설정은 탭으로 나눔).
- 팝업의 매개변수는 `localStorage`의 `mykanban.popup.<kind>`로 전달되고, 결과는 `popup-message` 이벤트(`result` / `action`)로 돌아옵니다. 웹에서는 같은 페이지를 `<iframe>`으로 띄우고 `postMessage`를 씁니다.
- **메뉴**는 `menu` 팝업 하나를 재사용합니다(시작 직후 미리 만들어 둠). 내용을 그린 뒤 크기를 재고 `place_popup`이 모니터 작업 영역 안에 놓습니다(아래 공간이 없으면 위로). 그래서 메인 창 크기와 상관없이 메뉴 전체가 보입니다. 포커스를 잃으면 숨깁니다.
- 각 팝업의 OS 창 제목은 `<팝업 제목> — MyKanbanBoard v<버전>`입니다.
- WebView2는 같은 프로필의 모든 웹뷰가 같은 `additional_browser_args`를 써야 하므로 `BROWSER_ARGS` 상수 하나를 씁니다. 창을 만드는 명령은 async여야 합니다(동기 명령은 Windows에서 교착).

## 데이터 모델

```
board  { id, title, description, created, updated, columns[] }
column { id, title, color, wip, cards[] }
card   { id, title, description, color, priority, tags[], assignee, due, checklist[], attachments[], created, updated }
attachment (메타데이터) { id, name, size, type, thumb, width, height, added }
```

- 보드 조작은 `BoardDocument.apply(label, change)`로 감쌉니다. 바꾸기 전 보드를 JSON 스냅샷으로 기록하고, 실행 취소는 스냅샷을 되돌립니다.
- **첨부 내용**(data URL)은 카드가 아니라 `AttachmentStore`에 id로 보관합니다. 내용은 바뀌지 않으므로 실행 취소 스냅샷이 커지지 않고, 복제·붙여넣기한 카드가 같은 내용을 공유합니다. 저장할 때 그 보드가 쓰는 첨부만 모아 함께 씁니다(`attachments` 항목).
- 썸네일(최대 320 px, WebP/JPEG)은 첨부할 때 canvas로 만들어 메타데이터에 넣습니다.

## 저장소

| 종류 | 보드가 있는 곳 | `.mkproj`에 들어가는 것 |
|---|---|---|
| 로컬 파일 (DB 설정 없음) | `.mkproj` 안 | 프로젝트 정보 + 보드 + 첨부 |
| SQLite / MariaDB / MySQL / PostgreSQL | DB 테이블 | 프로젝트 정보 + 보드 목록 + 접속 설정 (비밀번호는 "저장"을 켰을 때만) |

DB 테이블(처음 쓸 때 자동 생성):

```sql
mykanban_projects (id VARCHAR(80) PK, name VARCHAR(500), data TEXT, updated VARCHAR(40))
mykanban_boards   (project_id, id, title, position BIGINT, data TEXT, updated, PK(project_id, id))
```

- `db.rs`는 sqlx의 Any 드라이버로 세 종류를 한 코드로 다룹니다. PostgreSQL은 자리표시자를 `$1…`로 바꿉니다. MySQL/MariaDB는 `LONGTEXT`·`utf8mb4`, 그리고 Any 드라이버가 LONGTEXT를 BLOB으로 돌려주므로 바이트로도 받아 UTF-8로 바꿉니다.
- 저장은 한 트랜잭션에서 그 프로젝트의 행을 모두 지우고 다시 넣습니다(항상 완전한 사본).
- SQLite URL은 `sqlite:<경로>?mode=rwc`입니다(`sqlite://C:/…`는 드라이브 문자가 URL 호스트가 되어 깨짐). 상대 경로는 `.mkproj` 폴더 기준입니다.
- 오류 메시지에는 접속 대상(종류·사용자·호스트·포트·DB)은 넣되 비밀번호는 넣지 않습니다.

설정·최근 파일·세션은 WebView2 프로필의 `localStorage`(데스크톱: `%LOCALAPPDATA%\com.shkwon.mykanbanboard`)에, 창 위치와 배경 이미지 사본은 `%APPDATA%\com.shkwon.mykanbanboard`에 있습니다. 설치 프로그램이 지울지 묻는 "데이터"가 이 두 폴더입니다.

## 파일 작업과 진행률

`read_text_file`, `write_text_file`, `import_background`, `read_file_base64`, `write_base64_file`은 1 MB 단위로 읽고 쓰며 `io-progress` 이벤트(초당 최대 20번)를 보냅니다. UI(`withProgress`)는 작업이 250 ms를 넘으면 진행 팝업을 띄웁니다. 쓰기는 임시 파일에 쓴 뒤 바꿔치기(원자적)합니다. 테스트용 `MYKANBAN_IO_DELAY_MS`는 덩어리마다 지연을 넣어 진행 팝업을 확인하게 합니다.

## 설치 프로그램 (Windows NSIS)

`src-tauri/windows/hooks.nsh` (UTF-8 BOM 필수):

1. `NSIS_HOOK_PREINSTALL` — 이전 데이터가 있으면 한국어/영어로 삭제 여부 질문. 이전 설치가 있으면 그 제거 프로그램을 `/S`로 실행하고 폴더를 지움(폴더 이름이 제품 이름일 때만 통째로).
2. `NSIS_HOOK_POSTINSTALL` — Tauri가 앱 아이콘으로 등록한 `.mkanban` / `.mkproj` 연결의 `DefaultIcon`을 `board.ico` / `project.ico`로 바꿈.

macOS는 `Info.plist`의 `CFBundleDocumentTypes`/`UTExportedTypeDeclarations`, Linux는 `linux/mykanbanboard.xml`(MIME) + hicolor 아이콘 + `postinst.sh`로 같은 일을 합니다.

## 테스트

| 분류 | 위치 | 내용 |
|---|---|---|
| JS 단위 | `test/unit/*.test.js` | 도메인 로직, 번역 키·자리표시자, 아이콘 이름, 테마 |
| 패키징 | `test/static/package.test.js` | PNG를 직접 풀어 아이콘의 투명 테두리·좌상단 빛·그림자 검사, ICO 크기, 파일 연결·설치 언어·훅 |
| Rust 단위 | `src-tauri/src/*.rs` `#[cfg(test)]` | 파일·진행률·원자적 쓰기, 글꼴, 창 위치, SQLite 왕복, URL 인코딩 |
| DB 통합 | `test/db_integration.rs` | 실제 MariaDB/MySQL·PostgreSQL에 임시 DB를 만들어 왕복 |
| E2E 웹 | `test/e2e/web.*.mjs` | `vite preview` + 헤드리스 Edge, CDP |
| E2E 데스크톱 | `test/e2e/harness.mjs`, `desktop.suite.mjs` | 디버그 exe를 임시 프로필·설정 폴더로 띄우고 WebView2 CDP(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`)로 조작, Win32로 OS 창 제목·소유자·스타일 확인 |
| 설치 프로그램 | `scripts/test.mjs --installer` | `build:win` 후 생성된 NSIS 스크립트·설치 파일 검사 |

앱은 E2E용으로 `window.__mykanban`(상태·명령·동작)과 팝업의 `window.__mykanbanPopup`을 노출합니다. E2E는 `MYKANBAN_MULTI=1`(단일 실행 잠금 해제), `MYKANBAN_CONFIG_DIR`/`MYKANBAN_DATA_DIR`(사용자 데이터와 분리), `MYKANBAN_NO_OPEN=1`(첨부를 외부 프로그램으로 열지 않음)으로 실행합니다.
