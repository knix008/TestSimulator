# My Git Master 구조

브라우저와 데스크톱(Windows, macOS, Linux)이 같은 React 화면을 씁니다. Git 명령은 그 컴퓨터에서만 동작하는 Node 코어가 실행합니다. 데스크톱 앱은 Tauri 2 셸이 이 코어를 띄우고, 창은 코어가 제공하는 화면을 엽니다.

사용 방법은 [UsersGuide.md](UsersGuide.md), 빌드 방법은 [README.md](../README.md)를 참고하세요.

```
Tauri 셸 (src-tauri/)                     브라우저
  │ 1. node desktop.cjs --port 0 실행         │
  │ 2. "MGM_READY <port>" 를 기다림            │
  │ 3. 창을 http://127.0.0.1:<port> 로 엶      │
  ▼                                           ▼
React UI (src/) ── /api, /api/terminal(WebSocket) ──►  Node 코어 (server/ + core/)
  │ window.mgm (src/tauriBridge.ts)                      │ spawn
  │  창 조작, 폴더/프로그램 대화상자, 도구 창             ▼
  ▼                                                     git, 셸(node-pty)
Tauri 명령 (src-tauri/src/main.rs)                       │
                                                         ├── settings.json  (OS 사용자 폴더)
                                                         └── remote-cache   (Browse Remote bare clone)
```

코어와 개발 서버는 `127.0.0.1`에만 바인딩됩니다. 다른 컴퓨터에서 이 API로 저장소를 열 수 없습니다.

## 폴더

| 경로 | 역할 |
|------|------|
| `core/` | Git, 설정, 테마, diff·merge 계산, 보고서, 터미널. 플랫폼과 무관한 TypeScript |
| `server/` | Express 라우트(`index.ts`), 웹 서버 진입점(`cli.ts`), 데스크톱 코어 진입점(`desktop.ts`) |
| `src/` | React 화면과 데스크톱 브리지(`tauriBridge.ts`) |
| `src-tauri/` | Tauri 셸(Rust), 설치 마법사 훅, 권한 |
| `scripts/` | 개발 실행, 번들, 런타임 준비, 아이콘, 설치본 복사, 테스트 |
| `test/` | 기능 테스트와 보고서 |
| `assets/` | 아이콘. `icon.ico`가 원본이고 나머지는 `npm run icons`가 만듭니다 |
| `doc/` | 이 문서와 사용자 가이드 |

## 실행 형태

| 명령 | 화면 | 코어 |
|------|------|------|
| `npm start` | Tauri 창이 Vite 개발 서버를 엽니다. 화면 수정이 바로 반영됩니다. | 셸이 `tsx server/desktop.ts`로 소스에서 실행하고, Vite가 `/api`를 그쪽으로 프록시합니다. |
| `npm run dev:web` | 브라우저가 Vite를 엽니다. | `tsx server/cli.ts` |
| `npm run serve` | `dist/`를 코어가 함께 제공합니다. | `dist-server/cli.cjs`, `PORT` 또는 4730 |
| 설치본 | 창이 코어의 주소를 엽니다. | 설치 폴더 `runtime/`의 `node.exe desktop.cjs` |

`scripts/dev.mjs`는 IPv4와 IPv6에서 모두 비어 있는 포트를 고릅니다(`free-port.mjs`). 다른 프로그램의 서버를 재사용하거나 멈추지 않습니다.

### 설치본에 들어가는 것

`tauri build`는 먼저 `scripts/tauri-before-build.mjs`를 실행합니다.

1. `vite build` → `dist/`
2. `scripts/bundle-server.mjs` → `dist-server/index.cjs`, `desktop.cjs`, `cli.cjs`. 모두 CommonJS입니다. express 4가 `require("path")`를 런타임에 호출하기 때문에 ESM으로 묶으면 실행되지 않습니다.
3. `scripts/stage-runtime.mjs` → `src-tauri/runtime/`에 Node 실행 파일, `desktop.cjs`, `dist/`, 현재 플랫폼용 `node-pty`를 복사합니다.

`runtime/`은 리소스로 설치됩니다. 그래서 설치한 컴퓨터에는 Node.js나 npm이 필요 없습니다. `node-pty`는 N-API 모듈이라 함께 넣은 Node 버전과 상관없이 로드됩니다.

## Tauri 셸

| 파일 | 역할 |
|------|------|
| `src-tauri/src/main.rs` | 창, 명령, 창 위치 저장, 단일 인스턴스 |
| `src-tauri/src/core.rs` | 코어 실행과 `MGM_READY` 대기. 디버그 빌드는 소스(tsx), 릴리스는 `runtime/` |
| `src-tauri/build.rs` | 명령 목록. 각 명령에 `allow-…` 권한을 만듭니다 |
| `src-tauri/capabilities/default.json` | 그 권한을 `http://127.0.0.1:*`에서 연 창에 허용합니다 |
| `src-tauri/windows/hooks.nsh` | 제거할 때 사용자 데이터를 지울지 묻습니다(UTF-8 BOM 필수) |
| `src-tauri/boot/index.html` | Tauri가 요구하는 빈 페이지. 표시되지 않습니다 |

창은 코어의 주소(원격 출처)에서 열리므로, 화면이 부르는 Tauri 명령은 `build.rs`와 `capabilities/default.json` 양쪽에 있어야 합니다. `cargo test`와 `test/cases.ts`의 Build 항목이 세 목록(명령 정의, 권한, 브리지 호출)이 맞는지 확인합니다.

| 명령 | 화면에서 |
|------|----------|
| `window_minimize`, `window_toggle_maximize`, `window_close`, `window_is_maximized` | 메뉴 줄 오른쪽 창 단추 |
| `window_ready` | 테마를 적용한 뒤 창을 보입니다. 창은 숨긴 채 저장된 테마 배경색으로 열립니다 |
| `window_start_drag` | 메뉴 줄 드래그. Tauri 웹뷰는 CSS `-webkit-app-region`을 읽지 않아 브리지가 대신 처리합니다 |
| `pick_directory` | 저장소 열기, Clone 대상, 내보내기 폴더(`create`) |
| `pick_program` | 외부 diff·merge 프로그램 |
| `tool_open` | 내장 Diff / Diff & Merge 창. 종류별로 하나이고, 다시 열면 그 창이 새 주소로 이동합니다 |

메인 창을 닫으면 도구 창을 닫고, 창 위치·크기·최대화 상태를 `settings.json`의 `window`에 쓰고, 코어를 멈춥니다. 코어는 셸 프로세스가 사라지면 스스로 끝납니다(`--parent-pid`).

테마별 창 배경색은 `core/themeBackgrounds.json`에 있고 Rust가 `include_str!`로 읽습니다. 테스트가 이 표와 `core/themes.ts`의 `--bg`가 같은지 확인합니다.

## 화면

| 경로 | 역할 |
|------|------|
| `src/main.tsx` | 브리지 설치, 테마 적용, `App` 또는 `ToolWindow` |
| `src/tauriBridge.ts` | `window.mgm`. 브라우저에서는 설치하지 않습니다 |
| `src/App.tsx` | 메뉴, 도구 모음, Files / Repository, 히스토리, diff, 대화상자 |
| `src/CommitHistory.tsx` | 커밋 목록과 그래프 렌더링 |
| `src/DiffView.tsx` | unified diff |
| `src/BuiltinTools.tsx` | 내장 Diff(좌우 비교)와 내장 Diff & Merge(3-way 충돌 선택) |
| `src/ToolWindow.tsx` | 도구 창의 껍데기. 주소의 `#tool`을 읽어 Diff 또는 Merge를 그립니다 |
| `src/toolLaunch.ts` | `#tool` 주소를 만들고 해석합니다. 데스크톱은 `openTool`, 웹은 `window.open` |
| `src/TerminalPane.tsx` | xterm.js. `/api/terminal` WebSocket |
| `src/PrintPreview.tsx`, `src/exportReport.ts` | 요약 인쇄와 내보내기 |
| `src/graph.ts` | 레인 계산. 경로 필터는 평탄한 그래프 |
| `src/icons.tsx`, `src/appIcon.ts` | SVG 아이콘과 프로그램 아이콘 |
| `src/i18n.ts` | 한국어(기본)와 English. Git 명령 이름은 영어 |
| `src/api.ts` | `/api` 호출. 실패 시 메서드, URL, HTTP 상태, 코드, 서버 상세를 묶습니다 |

## 코어

| 경로 | 역할 |
|------|------|
| `core/gitApp.ts` | open, clone, browse, status, log, diff, commit, fetch, pull, push, stash, export |
| `core/gitProcess.ts` | `git` 프로세스. `GIT_TERMINAL_PROMPT=0` |
| `core/status.ts` | porcelain 배지 U D R T ! ± X P |
| `core/settings.ts` | 설정, 최근 목록, AES-256-GCM 토큰, 예전 `MyGitJS` 폴더에서 한 번 옮겨 오기 |
| `core/themes.ts`, `core/themeBackgrounds.json` | Light 20, Dark 20 |
| `core/lineDiff.ts`, `core/threeWayMerge.ts` | 줄 정렬과 단어 강조, 3-way 덩어리 |
| `core/diffTools.ts`, `core/mergeTool.ts` | 외부 도구 탐색과 인수, 내장 merge 식별자 `mygit:builtin` |
| `core/shells.ts`, `core/terminalSession.ts` | 설치된 셸 목록과 node-pty 세션 |
| `core/report.ts`, `core/reportPdf.ts`, `core/printLayout.ts` | CSV·Markdown·Word·Excel·PDF 요약과 인쇄 배치 |
| `core/fsBrowse.ts`, `core/errors.ts` | 드라이브·폴더 목록, `ApiError`와 자격 증명 가리기 |

### 요청이 처리되는 방식

1. 화면이 `src/api.ts`로 `/api/...`를 호출합니다.
2. `server/index.ts`가 인자만 검사하고 `GitApp`에 넘깁니다.
3. `GitApp`은 `git`을 실행하고, 실패하면 `ApiError`를 던집니다. 인증이 필요하면 `AUTH_REQUIRED`이고, git 출력이 `detail`에 남습니다.
4. 저장소가 아니면 `NOT_A_REPO`입니다. Files의 **폴더 열기**는 이 경우 그 폴더를 파일 목록으로 보여 줍니다.
5. 성공한 open / clone / browse는 마지막 세션과 최근 목록을 설정 파일에 기록합니다.

### Diff와 Merge 도구

| 설정 | 기본값 | 열리는 곳 |
|------|--------|-----------|
| `externalDiffToolPath` | 빈 값 | 지정했을 때만 우클릭 **외부 Diff 도구**가 그 프로그램을 실행합니다. 내장 Diff는 따로 엽니다. |
| `externalMergeToolPath` | `mygit:builtin` | 내장 Diff & Merge 창. 외부 도구 경로를 고르면 그 프로그램을 실행합니다. |

내장 Diff & Merge는 `/api/merge-sources`로 `:1:` `:2:` `:3:` 스테이지를 읽고, `/api/merge-save`가 작업 트리에 쓰고 `git add`까지 합니다. Clone과 Browse Remote는 자격 증명을 URL에 남기지 않습니다.

### 설정과 캐시

| OS | 설정 | 캐시 |
|----|------|------|
| Windows | `%AppData%\MyGitMaster\` | `%LocalAppData%\MyGitMaster\remote-cache\` |
| macOS | `~/Library/Application Support/MyGitMaster/` | `~/Library/Caches/MyGitMaster/remote-cache/` |
| Linux | `$XDG_CONFIG_HOME/MyGitMaster/` | `$XDG_CACHE_HOME/MyGitMaster/remote-cache/` |

`MGM_SETTINGS_DIR`와 `MGM_CACHE_DIR`는 이 경로를 바꿉니다. 셸에 `MGM_SETTINGS_DIR`가 있으면 웹뷰 데이터도 그 아래에 두고 단일 인스턴스 잠금을 쓰지 않으므로, 설치된 앱과 따로 실행됩니다.

작업 트리는 `fs.watch`로 감시합니다. 변경이 있으면 약 400ms 뒤에 세대 번호가 올라가고, 화면은 `/api/tick`으로 확인해 다시 읽습니다.

## 테스트

`npm test`(`scripts/test-all.mjs`)는 두 부분을 실행하고 마지막에 하나의 Summary를 보여 줍니다.

| 부분 | 내용 |
|------|------|
| unit (`test/run.ts`) | 임시 폴더의 저장소와 로컬 `file://` bare 저장소로 Git 작업, HTTP API, 터미널, 설정, 테마, 빌드 구성(번들, Tauri 명령·권한·브리지, 아이콘, 설정 폴더 이름, 설치 훅), 데스크톱 코어의 `MGM_READY` |
| shell (`cargo test`) | 테마 배경색, 도구 창 주소 검사, 모든 명령의 권한, 경로 처리 |

결과는 `test-results/`(`index.html`, `unit.log`, `shell.log`, `summary.json`)에 남습니다. 사용자 설정 파일과 이 저장소의 Git 이력은 건드리지 않습니다.
