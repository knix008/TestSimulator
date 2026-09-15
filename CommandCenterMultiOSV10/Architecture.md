# Command Center — 내부 구조

## 1. 한눈에 보기

```
                 ┌──────────────────────── src/ (React UI, Vite) ───────────────────────┐
                 │ App.jsx ── FilePanel ×2 ── FolderTree · ContextMenu · Chrome(메뉴/툴바) │
                 │           BottomDock(로그 탭 + 터미널 탭 ×N, oh-my-posh 프롬프트)       │
                 │           Dialogs(프롬프트·확인·충돌·진행률·압축·정보·속성·오류) · Search │
                 │           lib/backend.js  ←  유일한 호스트 분기점                        │
                 └──────────────┬───────────────────────────────┬──────────────────────┘
                     IPC (preload)                          fetch('/api/…') + 폴링
                 ┌──────────────▼──────────────┐   ┌───────────▼──────────────────────┐
                 │ electron/ main.js ipc.js     │   │ server/server.js (node:http 만)   │
                 │ shell.openPath / trashItem   │   │ dist/ 정적 제공 + POST /api/<name> │
                 └──────────────┬──────────────┘   └───────────┬──────────────────────┘
                                └────────────► core/api.js ◄────┘
                                        fsops · archive(tar/zip/bz2) · jobs · session · terminal
```

같은 `core/` 가 두 호스트에서 그대로 실행되므로 데스크톱과 웹의 동작이 항상 같습니다.
UI 는 `window.commandCenter`(preload 가 노출) 유무로 전송 방식만 고릅니다.

## 2. core/ — 플랫폼 무관 코어 (CommonJS, Node 만 사용)

| 파일 | 역할 |
|---|---|
| `api.js` | 메서드 이름 → 함수 표. `createApi(host)` 가 호스트 전용 기능(열기·휴지통·클립보드)을 주입받습니다. 긴 작업은 즉시 **잡 스냅샷**을 돌려줍니다. `term.*`/`git.status` 는 `terminal.js` 로, `shutdown()` 은 호스트 종료 시 셸 정리. `serializeError` 가 code/path/syscall/stack 을 UI 로 넘깁니다. |
| `fsops.js` | 목록(권한 문자열, 날짜, 확장자), 루트 목록(홈·드라이브·/tmp·마운트), 드라이브 목록(`listDrives`: Windows 는 Win32_LogicalDisk 를 PowerShell 로 읽어 이름·종류·용량, 60초 캐시), 속성(폴더 합계), mkdir/새 파일/이름 바꾸기, 항목 수 세기, **복사/이동**(충돌 질문, 폴더 병합, 자기 자신 안으로 이동 금지, EXDEV 시 복사+삭제), 삭제, 휴지통(호스트 함수 없으면 freedesktop/macOS 휴지통 폴더), **검색**(글롭 + 내용, 64 MB 제한). |
| `archive.js` | tar.gz / tar.bz2 / zip 생성·해제, 분할(`splitFile`)·결합(`joinParts`), 형식 감지(`describe`, `splitDetect`), 매직 바이트 스니핑, zip-slip 방지, ZIP 파일명 인코딩(UTF-8 플래그 → Info-ZIP 유니코드 필드 → EUC-KR → latin1). |
| `tar.js` | 자체 스트리밍 tar 라이터/리더(ustar + pax `path`/`linkpath`/`mtime`, GNU `L`/`K` 읽기, base-256 크기). 긴 이름과 비ASCII 이름은 pax 로 기록해 libarchive/GNU tar/bsdtar 와 호환됩니다. |
| `bzip2-worker.js` | `compressjs` 의 동기 bzip2 를 **worker_threads** 에서 실행(메인 프로세스 정지 방지). 1 MB 버퍼로 파일을 스트리밍하고 진행률을 postMessage. 취소는 `worker.terminate()`. 패키징 시 `asarUnpack` 대상. |
| `jobs.js` | `Job`(진행률·취소·충돌 질문·결과·오류 상세)과 `JobRegistry`(`run`, 스냅샷, 60초 뒤 정리). 업데이트는 33 ms 로 병합. |
| `session.js` | `session.json`(좌/우 경로, 분할, 언어, 테마, 정렬, 창 위치, 하단 패널 표시/높이, 터미널 기본 셸·시작 디렉터리). 존재하지 않는 폴더는 홈으로 대체. |
| `terminal.js` | 터미널 세션(MyEditor 의 `core/terminal.js` 와 같은 설계): 탭마다 셸 프로세스 하나(`spawn`, **파이프 stdio** — pty 없음), 출력은 seq 번호가 붙은 청크로 버퍼링(`read({since})`, 4000개 유지), `run`(명령 실행 또는 실행 중 프로그램에 입력), `complete`(Tab 자동 완성), `git`(프롬프트용 상태), `kill`/`shutdown`. 자세한 흐름은 아래. |

### 터미널 흐름

```
UI  term.create {cwd, shell}         core/terminal.js
    term.run {id, line}  ──────────►  idle ? 스크립트 파일에 line 저장 → stdin 에 `. "file"; echo __CC_CWD__:$PWD` 한 줄
                                          : stdin 에 line 그대로 (실행 중 프로그램의 입력)
    term.read {id, since} (150 ms) ◄──  {chunks, cwd, idle, exited}   마커는 걷어내고 cwd 갱신 + idle=true
    git.status {cwd}       ◄──────────  git status --porcelain=v2 --branch --show-stash → 브랜치·ahead/behind·+~?! 수
    term.complete {id, line, cursor} ◄─ 첫 단어: 셸 내장 명령 + PATH 실행 파일(1회 스캔) / 그 밖: 그 단어가 가리키는 디렉터리의 파일
```

- 명령을 **스크립트 파일로 source** 하는 이유: stdin 에는 짧은 한 줄만 흐르므로, 명령이 띄운 프로그램이 stdin 을 읽어도(Read-Host, python, npm init …) 다음 명령이나 마커를 먹지 않고 사용자가 이어서 치는 줄을 받습니다. source 이므로 `cd`·변수·함수는 셸에 남습니다.
- **마커**(`__CC_CWD__:<dir>`)가 오면 셸이 idle 로 돌아오고 프롬프트가 다시 그려집니다. 마커와 그 개행이 청크 경계에서 갈리는 경우(Write-Host)도 처리합니다.
- **Windows** (cmd.exe / Windows PowerShell 5.1 에서 실측):
  - PowerShell 은 리다이렉트된 stdin 을 콘솔 코드 페이지로 읽으므로 `cmd /C chcp 65001 & powershell -ExecutionPolicy Bypass -Command -` 로 띄웁니다(pty 없이 UTF-8 입력을 받는 유일한 방법). 스크립트 파일은 BOM 을 붙여 저장(5.1 은 BOM 없으면 ANSI), 구문 오류여도 마커가 실행되도록 마커는 stdin 줄 쪽에 둡니다.
  - cmd 는 코드 페이지 65001 + 파이프에서 멀티바이트 입력을 읽으면 종료되는 버그가 있어 배치 파일 `call` 이 유일한 방법이며, `%CD%` 는 줄 파싱 시점에 확장되므로 마커를 배치 파일 안에 둡니다. cmd 가 읽기 전마다 찍는 프롬프트는 `PROMPT=__CC_P__` 로 바꿔 걷어냅니다.
  - 종료는 `taskkill /T`(래퍼 cmd 의 자식 PowerShell 까지).
- **git**: 폴더가 저장소 안이 아니면 `{repo:false}`; 분리된 HEAD 는 `@<짧은 해시>`.

### 잡(job) 흐름

```
UI runJob('ops.transfer', …)            core: jobs.run(kind, meta, fn)
   ├─ 첫 스냅샷 {id, status:'running'}   ├─ job.setTotal(countItems)
   ├─ followJob(id)                      ├─ job.progress(path) …
   │    Electron: 'job:update' push      ├─ 충돌: await job.askConflict(info)  → 스냅샷에 conflict
   │    Web: 150 ms 폴링 jobs.get        │      UI 가 ConflictDialog → jobs.resolveConflict(id, answer, applyAll)
   └─ status !== 'running' → 완료        └─ finish(result) | fail(err) (errorDetail 포함)
```

## 3. electron/ — 데스크톱 호스트

- `main.js`: 단일 인스턴스, 창 크기/위치 복원(`session.windowBounds`), `will-quit` 에서 `api.shutdown()`(터미널 셸 정리), 테마 배경색(`session.themeBg`)으로 첫 프레임 깜빡임 방지, macOS 만 애플리케이션 메뉴(Cmd+Q/C/V). `--smoke-shot=<png>` `--smoke-script=<js>` `--smoke-probe=<js>` `--smoke-url=<http>` 는 smoke 테스트용.
- `ipc.js`: `ipcMain.handle('api')` → `api.call`; `job:update` 푸시; `fs.watch` 기반 `watch:start/stop` → `dir:changed`; `ipcMain.handle('dialog')` → 네이티브 대화상자(현재는 `openFolder` 만, 설정의 시작 디렉터리 찾아보기).
- `preload.js`: `window.commandCenter` (call / onJobUpdate / watchDir / onDirChanged / dialog / quit). `call` 은 `{ok,…}` 객체를 그대로 돌려주고 UI 가 Error 를 만듭니다 — contextBridge 를 넘는 Error 는 message 외의 속성을 잃기 때문입니다.

## 4. server/ — 웹 호스트

`node:http` 만 사용합니다. `GET` 은 `dist/` 정적 파일(SPA 폴백), `POST /api/<name>` 은 JSON 본문을 `api.call` 로 넘깁니다.
`--host` `--port` `--token`(Bearer / `?token=`) 옵션, 기본 루프백 바인딩. 브라우저 세션 저장은 `session.js` 의 XDG/AppData 경로.

## 5. src/ — UI

| 파일 | 역할 |
|---|---|
| `App.jsx` | 세션 로드/저장, 활성 패널, 모든 액션(`runAction`), 진행률+충돌을 묶는 `runWithProgress`, F-키 단축키, 분할선, 전역 오류 핸들러(`error`/`unhandledrejection` → 오류 팝업), smoke 훅 `window.__cc`. 하단 패널 상태: `log`(`setStatus` 와 `dialogs.error` 를 감싸 모든 상태 메시지·오류를 기록, 2000줄), `terms`(탭 목록 — 세션은 호스트에 있고 여기엔 id·제목·기록만), `dockTab`, `session.dockVisible/dockHeight`. |
| `components/FilePanel.jsx` | 목록 로드·정렬·선택(Ctrl/Shift/키보드)·컨텍스트 메뉴·폴더 감시(`watchDir`, 250 ms 디바운스, 작업 중 일시 정지)·패널 상태줄. App 은 `ref`(refresh/getSelectedEntries/selectPaths…)와 `onAction(id)` 로만 상호작용. |
| `components/FolderTree.jsx` | 루트(`fs.roots`) + 지연 로딩(`fs.subdirs`), 현재 경로까지 자동 확장. |
| `components/Chrome.jsx` | 메뉴바(파일/편집/보기/압축), 툴바(작업 버튼 · 터미널 + 우측: 테마 분할 버튼 · 국기 언어 토글 · 설정 · 정보). |
| `components/BottomDock.jsx` | 하단 패널: 탭 줄(로그 + 터미널 ×N, `+`/`+ ▾` 셸 선택, 가운데 클릭 닫기, 높이 조절 스플리터). `LogView` 는 시각·수준·메시지 줄(맨 아래 고정 스크롤, 복사/지우기). `TerminalView` 는 MyEditor 의 `TerminalPanel` 과 같은 콘솔 — 아래 "터미널 UI" 참고. |
| `components/ContextMenu.jsx` | 위치 보정 팝업 메뉴(메뉴바 드롭다운·컨텍스트 메뉴·테마 목록 공용, 체크/스와치 지원). |
| `dialogs/Dialogs.jsx` | `useDialogs()` — 프라미스 기반 스택(`prompt/confirm/error/conflict/compress/about/properties`, `open()` 은 진행률처럼 갱신형). `describeError` 가 Error → 메시지+상세. 오류 팝업에는 **자세한 내용 복사** 버튼. |
| `dialogs/SearchDialog.jsx` | 비모달 검색 창(`search.start` 잡, 진행 중 개수, 결과 더블클릭). |
| `dialogs/SettingsDialog.jsx` | 설정 — 일반 탭(언어·테마·글꼴 크기·분할 기본 크기·숨김·삭제 확인·폴더 복원·자동 새로고침)과 터미널 탭(기본 셸 `termShell` — `term.shells` 목록, 시작 디렉터리 `termCwd` — 데스크톱은 `pickFolder`(IPC `dialog` → `dialog.showOpenDialog`)로 찾아보기). 값은 세션에 저장되고 App 이 적용(`applyTheme`, `--fs`, `suspendWatch`; 새 터미널은 `termCwd`(없으면 활성 패널 폴더)·`termShell`). |
| `lib/backend.js` | 전송 분기: `call`, `runJob/followJob`(푸시 vs 폴링), `watchDir`(fs.watch vs mtime 폴링), 클립보드, `unwrap`(오류 객체 → Error, 스택 결합). |
| `lib/i18n.js` | ko/en 사전 + `t()` + `useLanguage()`(useSyncExternalStore). |
| `lib/format.js` | 크기/종류 표시, 경로 분리자(백엔드에서 받음), breadcrumb 분해. |
| `themes.js` | 16 테마 토큰 → `:root` CSS 변수(`applyTheme`), 순환(`nextThemeId`). |
| `styles.css` | 변수 기반 스타일(기본값 = 미드나이트). |

### 터미널 UI (`BottomDock.jsx` 의 `TerminalView`)

- 기록(`<pre>`)은 `cmd`(그 순간의 cwd·git + 입력한 줄) / `out`(셸 출력) 항목 배열로, 3000줄을 넘으면 앞에서 잘라냅니다. 탭 객체(`term.buffer/seq/git/idle`)에 보관하므로 탭 전환·패널 숨김 후에도 그대로입니다.
- 기록 끝에 **oh-my-posh 식 프롬프트**(`Prompt`): 경로 세그먼트 + git 세그먼트. 각 세그먼트는 CSS `clip-path` 로 오른쪽이 뾰족한 블록이고 다음 세그먼트가 그 아래로 겹쳐 파워라인 화살표가 되므로 특수 폰트가 필요 없습니다. git 세그먼트 색: clean=`--ok`, dirty=`--folder`, conflict=`--danger`.
- 프롬프트 바로 뒤에 `inline-grid` 로 값 너비만큼 늘어나는 `<input>`(`::after` 가 값을 거울처럼 그려 폭을 정함) — 네이티브 캐럿과 IME 를 그대로 씁니다. 출력을 클릭하면(선택 중이 아닐 때) 입력으로 포커스.
- 탭이 보일 때만 `term.read` 를 150 ms 폴링. `idle` 이 아니면 프롬프트를 숨기고 Enter 는 실행 중 프로그램의 stdin 으로 갑니다(백엔드가 판단). 마커가 오면 idle 로 돌아오며 git 상태를 다시 읽습니다. `git.status` 는 명령 완료·cwd 변경·탭 활성화 시 갱신하되 이미 떠난 폴더의 결과는 버립니다.
- Tab → `term.complete`: 후보가 하나면 삽입(파일·명령 뒤엔 공백, 폴더 뒤엔 없음), 여럿이면 공통 접두사, 더 없으면 패널 폭에 맞춰 열로 나열. ↑↓ 기록(편집 중이던 줄 보존), Ctrl+L / `clear` / `cls`, Esc, 여러 줄 붙여넣기(줄마다 실행), 선택이 있을 때 Ctrl+C 는 복사.

## 6. 빌드·패키징

- `vite build` → `dist/` (`base: './'` 로 file:// 와 임의 경로 서빙 모두 지원).
- electron-builder: `files` 에 `core/`·`electron/`·`dist/`·`build/icons/`; `asarUnpack` 에 `core/bzip2-worker.js` 와 `compressjs`(워커는 asar 밖에서만 로드 가능). `extraResources` 로 `build-info.json`.
- Windows NSIS: `build/installer.nsh` — 바로가기 선택 페이지, 이전 설치 완전 삭제, 남은 데이터 삭제 여부 질문. 설치/제거 프로그램 아이콘도 앱과 같은 `icon.ico`.
- Linux deb: `after-install.sh` (desktop DB·아이콘 캐시 갱신, chrome-sandbox setuid).
- `scripts/generate-icons.mjs`: sharp 로 SVG → PNG(16~1024), `ico.mjs` 로 ICO/ICNS 컨테이너 생성.

## 7. 테스트

- `test/archive.test.mjs`: 세 형식 왕복(한글·긴 이름·심볼릭 링크 포함), 분할/결합, 취소 시 잔여 파일 없음, 확장자 헬퍼.
- `test/fsops.test.mjs`: 목록 메타데이터, 충돌(건너뛰기/덮어쓰기/모두 적용), 이동·자기 자신 안으로 이동 금지, 취소, mkdir/생성/이름 바꾸기/삭제, 검색, API 디스패치·세션.
- `test/terminal.test.mjs`: 셸 목록, 세션 왕복(한글 echo, `cd` 후 cwd·`idle` 갱신, 마커 누출 없음, 실행 중 프로그램에 입력, 변수 유지, Tab 완성(파일/명령), 증분 읽기, kill), git 상태(저장소/비저장소), `term.*`/`git.status` 디스패치와 `shutdown`.
- `scripts/smoke.mjs`: 실제 Electron 을 별도 프로필로 띄워 스크린샷(`--scenario context|compress|search|about|light_en|delete|themes|error|theme_*|terminal|log|settings_terminal`), `--web` 이면 웹 서버를 띄우고 preload 없는 창으로 브라우저 모드를 캡처, `--probe <js>` 로 DOM 상태를 출력.

## 8. 설계 메모

- **왜 자체 tar 인가**: 네이티브 의존성 없이 Electron/서버에서 동일하게 동작하고, GTK 판(libarchive)과 서로 읽을 수 있어야 하기 때문.
- **왜 bzip2 는 워커인가**: `compressjs` 는 동기·바이트 단위라 메인 프로세스에서 돌리면 IPC 가 멈춤.
- **왜 분할 첫 조각이 `.zip`/`.tgz` 인가**: GTK 판의 규칙을 그대로 따라 두 프로그램이 서로의 분할 파일을 해제할 수 있게 함(7-Zip 순서와 다름 — README 의 `cat` 안내 참고).
- **왜 대화상자가 앱 내부 모달인가**: 웹 버전에서도 같은 코드를 쓰기 위함. 충돌 질문은 진행률 창 위에 스택으로 쌓임.
- **왜 터미널이 pty 가 아닌가**: `node-pty` 는 네이티브 모듈이라 세 OS × Electron/Node ABI 마다 빌드가 필요하고 웹 서버 쪽도 무거워집니다. 파일 관리자에서 필요한 것은 `git`·`npm`·`dir` 같은 줄 단위 명령이므로 파이프 stdio 로 충분하고, 대신 전체 화면 프로그램과 Ctrl+C 중단은 포기했습니다. 프롬프트·입력·Tab 완성은 MyEditor 의 터미널 패널과 같은 방식이며, 명령을 스크립트 파일로 source 해 stdin 을 비워 두므로 실행 중 프로그램과의 줄 단위 대화도 됩니다. 한글 입력은 Windows 셸마다 다른 우회(2장 "터미널 흐름")로 해결.
- **오류 전달**: 백엔드 → `serializeError`(code/path/syscall/stack) → `unwrap` 이 렌더러 Error 로 재구성(스택 두 프로세스 결합) → `describeError` → 팝업 + 복사.
