# Command Center — 내부 구조

## 1. 한눈에 보기

```
                 ┌──────────────────────── src/ (React UI, Vite) ───────────────────────────┐
                 │ 메인 창  App.jsx ── FilePanel ×2 ── FolderTree · ContextMenu · Chrome(메뉴/툴바/펑션키) │
                 │           BottomDock(로그 탭 + 터미널 탭 ×N)  ·  lib/history.js(실행 취소)     │
                 │           Dialogs(프롬프트·확인·충돌·진행률·압축·정보·속성·오류 — 앱 내 모달)   │
                 │ 도구 창  ToolWindow.jsx (?win=viewer|editor|multiRename|search|settings)      │
                 │           ToolDialogs · SearchDialog · SettingsDialog 를 창 전체에 렌더        │
                 │           lib/backend.js  ←  유일한 호스트 분기점 (+ 창 열기 · 창 간 메시지 버스)│
                 └──────────────┬─────────────────────────────────┬─────────────────────────┘
                     IPC (preload)                            fetch('/api/…') + 폴링
                 ┌──────────────▼──────────────┐     ┌───────────▼──────────────────────┐
                 │ electron/ main.js ipc.js     │     │ server/server.js (node:http 만)   │
                 │ BrowserWindow ×(1 + 도구 창) │     │ dist/ 정적 제공 + POST /api/<name> │
                 │ openPath(+셸 폴백)/trashItem │     │ 도구 창 = window.open 팝업        │
                 └──────────────┬──────────────┘     └───────────┬──────────────────────┘
                                └────────────► core/api.js ◄──────┘
                                  fsops(readFile/writeText/renameMany 포함) · archive · jobs · session · terminal
```

같은 `core/` 가 두 호스트에서 그대로 실행되므로 데스크톱과 웹의 동작이 항상 같습니다.
UI 는 `window.commandCenter`(preload 가 노출) 유무로 전송 방식만 고릅니다.

## 2. core/ — 플랫폼 무관 코어 (CommonJS, Node 만 사용)

| 파일 | 역할 |
|---|---|
| `api.js` | 메서드 이름 → 함수 표. `createApi(host)` 가 호스트 전용 기능(열기·휴지통·클립보드)을 주입받습니다. 긴 작업은 즉시 **잡 스냅샷**을 돌려줍니다. `term.*`/`git.status` 는 `terminal.js` 로, `shutdown()` 은 호스트 종료 시 셸 정리. `serializeError` 가 code/path/syscall/stack 을 UI 로 넘깁니다. |
| `fsops.js` | 목록(권한 문자열, 날짜, 확장자), 루트 목록(홈·드라이브·/tmp·마운트), 드라이브 목록(`listDrives`: Windows 는 Win32_LogicalDisk 를 PowerShell 로 읽어 이름·종류·용량, 60초 캐시), 속성(폴더 합계), mkdir/새 파일/이름 바꾸기, **`renameMany`**(다중 이름 바꾸기 — 임시 이름을 거치는 2단계, 중복/기존 파일 사전 검사, 실패 시 롤백, 적용된 `{from,to}` 반환), **`readFile`**(뷰어/편집기 — 이미지는 base64, 텍스트는 BOM·UTF-16·Latin-1 감지, 이진은 16진수용 앞부분; 8/24 MB 제한), `writeText`(UTF-8), 항목 수 세기, **복사/이동**(충돌 질문, 폴더 병합, 자기 자신 안으로 이동 금지, EXDEV 시 복사+삭제; 결과에 항목별 `{src,dest,existed}` — 실행 취소용), 삭제, 휴지통(호스트 함수 없으면 freedesktop/macOS 휴지통 폴더), `openWithDefaultApp`(PowerShell `Invoke-Item` / `open` / `xdg-open`), `openWithApp`(지정 프로그램을 detached 로 실행), **검색**(글롭으로 폴더·파일, 내용 검색은 파일만, 64 MB 제한; 결과 `{path, isDir, size}`). |
| `archive.js` | tar.gz / tar.bz2 / zip 생성·해제, 분할(`splitFile`)·결합(`joinParts`), 형식 감지(`describe`, `splitDetect`), 매직 바이트 스니핑, zip-slip 방지, ZIP 파일명 인코딩(UTF-8 플래그 → Info-ZIP 유니코드 필드 → EUC-KR → latin1). |
| `tar.js` | 자체 스트리밍 tar 라이터/리더(ustar + pax `path`/`linkpath`/`mtime`, GNU `L`/`K` 읽기, base-256 크기). 긴 이름과 비ASCII 이름은 pax 로 기록해 libarchive/GNU tar/bsdtar 와 호환됩니다. |
| `bzip2-worker.js` | `compressjs` 의 동기 bzip2 를 **worker_threads** 에서 실행(메인 프로세스 정지 방지). 1 MB 버퍼로 파일을 스트리밍하고 진행률을 postMessage. 취소는 `worker.terminate()`. 패키징 시 `asarUnpack` 대상. |
| `jobs.js` | `Job`(진행률·취소·충돌 질문·결과·오류 상세)과 `JobRegistry`(`run`, 스냅샷, 60초 뒤 정리). 업데이트는 33 ms 로 병합. |
| `session.js` | `session.json`(좌/우 경로, 패널 탭 `leftTabs/rightTabs`(`[{path}]`)와 활성 탭 `leftTab/rightTab`, 분할, 정렬, 창 위치 `windowBounds`, 도구 창별 `toolBounds`, 하단 패널 표시/높이, 즐겨찾기 `hotlist`, 마지막 선택 패턴, 그리고 `src/lib/settings.js` 의 모든 설정 키). 존재하지 않는 폴더는 홈으로 대체. |
| `terminal.js` | 터미널 세션(MyEditor 의 `core/terminal.js` 와 같은 설계): 탭마다 셸 프로세스 하나(`spawn`, **파이프 stdio** — pty 없음), 출력은 seq 번호가 붙은 청크로 버퍼링(`read({since})`, 4000개 유지), `run`(명령 실행 또는 실행 중 프로그램에 입력), `complete`(Tab 자동 완성), `git`(프롬프트용 상태), `kill`/`shutdown`. 자세한 흐름은 아래. |

### 터미널 흐름

```
UI  term.create {cwd, shell}         core/terminal.js
    term.run {id, line}  ──────────►  idle ? 스크립트 파일에 line 저장 → stdin 에 `. "file"; echo __CC_CWD__:$PWD` 한 줄
                                          : stdin 에 line 그대로 (실행 중 프로그램의 입력)
    term.read {id, since, idle, wait} ◄  {chunks, cwd, idle, exited} — 롱폴링: 새 출력·idle 변화·종료가 없으면 wait(≤5 s) 동안 답을 미룸(wake), 생기면 즉시
    git.status {cwd}       ◄──────────  명령이 끝났을 때(idle 복귀 + 보낸 명령 있음)와 cwd 가 바뀔 때 UI 가 읽음; 단일 git 프로세스: status --porcelain=v2 --branch --show-stash --no-optional-locks --ignore-submodules=dirty
    term.complete {id, line, cursor} ◄─ 첫 단어: 셸 내장 명령 + PATH 실행 파일(1회 스캔) / 그 밖: 그 단어가 가리키는 디렉터리의 파일
```

- 명령을 **스크립트 파일로 source** 하는 이유: stdin 에는 짧은 한 줄만 흐르므로, 명령이 띄운 프로그램이 stdin 을 읽어도(Read-Host, python, npm init …) 다음 명령이나 마커를 먹지 않고 사용자가 이어서 치는 줄을 받습니다. source 이므로 `cd`·변수·함수는 셸에 남습니다.
- **마커**(`__CC_CWD__:<dir>;<종료 코드>`)가 오면 셸이 idle 로 돌아오고(종료 코드는 `rc` 로 스냅샷에 실려 프롬프트의 status 세그먼트가 씀 — bash `$?`, cmd `%ERRORLEVEL%`, PowerShell 은 스크립트 파일 끝의 `rcLine` 이 `$?`/`$LASTEXITCODE` 를 읽음: 닷소스 뒤의 `$?` 는 소싱 성공 여부만 말하므로) 롱폴링 중인 `read` 가 깨어납니다(Git Bash 의 `/d/…` 는 `D:/…` 로 정규화). 마커와 그 개행이 청크 경계에서 갈리는 경우(Write-Host)도 처리합니다.
- **지연**: 롱폴링이라 두 호스트 모두 출력 ~20 ms, 프롬프트 복귀 ~25 ms(같은 폴더면 마지막 git 상태로 즉시 그리고 새 상태가 다르면 색만 갱신 — MyEditor 방식). `git status` 는 `--ignore-submodules=dirty` 로 서브모듈 내부의 변경은 세지 않습니다(그렇지 않으면 빌드 산출물이 있는 서브모듈 때문에 저장소가 영영 '수정됨').
- **ANSI 색**: 백엔드는 SGR(`\x1b[…m`)만 남기고 다른 이스케이프를 걷어내며, UI 의 `lib/ansi.jsx`(`AnsiText`, MyEditor 와 동일)가 16/256/24-bit 색과 굵게·기울임·밑줄 등을 그립니다.
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

- `main.js`: 단일 인스턴스, 창 크기/위치 복원(`session.windowBounds` — **최소 1040×600**(툴바의 모든 버튼이 두 언어에서 보이는 폭, 툴바 실측 ~1000 px; Electron 은 저장된 bounds 를 min 으로 clamp 하지 않으므로 직접 clamp; CSS `.app{min-width:1020px}` 가 같은 값을 웹에서 보장), `will-quit` 에서 `api.shutdown()`(터미널 셸 정리), 테마 배경색(`session.themeBg`)으로 첫 프레임 깜빡임 방지, macOS 만 애플리케이션 메뉴(Cmd+Q/C/V). **도구 창** `openToolWindow({kind})`: 같은 페이지를 `?win=<kind>&id=<BrowserWindow.id>` 로 여는 독립 `BrowserWindow`(부모 창 없음 → 자유롭게 이동·크기 조절; 종류별 기본 크기, 닫을 때 `session.toolBounds[kind]` 저장). **종류마다 하나**(`SINGLETON`): 이미 열려 있으면 포커스하고 ipc 가 새 인자를 `win:args` 에 넣은 뒤 그 창에만 `replaceArgs` 메시지 → ToolWindow 가 다시 로드(편집기는 dirty 면 확인). 설정 창은 `FIXED_SIZE`(resizable false, 920×990, 위치만 기억). 타이틀바 아이콘은 `assets/tool-icons/<kind>.png`(`scripts/generate-tool-icons.mjs` 가 Icons.jsx 의 경로로 생성). 메인 창이 닫히면(`closed`) 열려 있는 도구 창을 모두 닫습니다. `openPath` 는 `shell.openPath` 가 실패 문자열을 돌려주면(Windows 11 스토어 앱 연결·연결 없음) `fsops.openWithDefaultApp` 으로 다시 시도. `--smoke-shot=<png>` `--smoke-script=<js>` `--smoke-tool-script=<js>`(도구 창 안에서 실행, 창이 닫히면 race 로 종료) `--smoke-probe=<js>` `--smoke-url=<http>` 는 smoke 테스트용 — 도구 창은 `<shot>-<kind>.png` 로 함께 캡처.
- `ipc.js`: `ipcMain.handle('api')` → `api.call`(터미널 롱폴링 `term.read` 도 이 경로); `job:update` 는 **모든 창**에 푸시(검색 창이 자기 잡을 따라가야 하므로); `fs.watch` 기반 `watch:start/stop` → `dir:changed`; `ipcMain.handle('dialog')` → 네이티브 대화상자(`openFolder`, `openFile` — 요청한 창을 부모로); 도구 창: `win:open`(창 생성 + 인자 보관) · `win:args`(창이 자기 인자를 가져감) · `win:close` · `win:message`(모든 창에 릴레이 — 창 간 메시지 버스).
- `preload.js`: `window.commandCenter` (call / onJobUpdate / watchDir / onDirChanged / dialog / quit / openWindow / windowArgs / closeWindow / postMessage / onMessage). `call` 은 `{ok,…}` 객체를 그대로 돌려주고 UI 가 Error 를 만듭니다 — contextBridge 를 넘는 Error 는 message 외의 속성을 잃기 때문입니다.

## 4. server/ — 웹 호스트

`node:http` 만 사용합니다. `GET` 은 `dist/` 정적 파일(SPA 폴백 — `/?win=viewer&id=…` 도 같은 `index.html`), `POST /api/<name>` 은 JSON 본문을 `api.call` 로 넘깁니다.
`--host` `--port` `--token`(Bearer / `?token=`) 옵션, 기본 루프백 바인딩. 브라우저 세션 저장은 `session.js` 의 XDG/AppData 경로.
도구 창은 브라우저 팝업(`window.open`)이며 인자는 `localStorage`(`cc-win:<id>`), 창 간 메시지는 `BroadcastChannel('command-center')`; 메인 페이지가 닫히면(`beforeunload`) 자기가 연 팝업을 닫습니다.

## 5. src/ — UI

| 파일 | 역할 |
|---|---|
| `App.jsx` | 세션 로드/저장(`saveSession` 은 테마·언어·글꼴 변경을 도구 창에 브로드캐스트), 활성 패널, 모든 액션(`runAction` — TC 액션 포함: view/edit/multiRename/compareDirs/swapPanels/targetLeft·Right/select*/dirHistory/hotlist/drives/parent/root), 진행률+충돌을 묶는 `runWithProgress`, **패널 탭**(`tabsOf/tabIndexOf/setTabs` — `session[side]` 는 항상 활성 탭의 경로라 나머지 코드는 그대로 `pathOf(side)`; `navigate` 는 활성 탭의 경로를 바꾸고, `newTab/closeTab/selectTab/cycleTab`, 패널 바꾸기는 탭 배열도 교환), **전역 단축키 표 한 곳**(F-키·Alt·Ctrl 조합), 분할선, 전역 오류 핸들러, smoke 훅 `window.__cc`. **실행 취소**: `history`(lib/history.js)에 create/rename/renameMany/copy/move/compress/extract 엔트리를 기록하고 `applyHistory` 가 되돌리기/다시 실행을 해석(삭제류는 `removeProduced` → 확인 후 삭제 잡). **도구 창**: `useWindows()`(설정 `separateWindows` ∧ 호스트 지원)이면 `openWindow(kind, args)`, 아니면 앱 내 대화상자; 도구 창에서 오는 메시지는 `busRef`(refresh · renamed → history+선택 · navigate · openFile · clipCopy · copyTo · settings → `applySettings`)가 처리. `openEntry` 는 텍스트 파일(설정 `textExts`)을 `textOpen` 설정대로(app/viewer/editor/custom) 엽니다. 하단 패널 상태: `log`, `terms`, `dockTab`, `session.dockVisible/dockHeight`. |
| `components/FilePanel.jsx` | 목록 로드·정렬·선택(Ctrl/Shift/키보드)·컨텍스트 메뉴·폴더 감시(`watchDir`, 250 ms 디바운스, 작업 중 일시 정지)·패널 상태줄. **TC 키**: Insert/Space 토글(Space 는 `fs.stat` 으로 폴더 크기 → `dirSizes`), Num+/−/* 패턴 선택·반전(`globToRegExp`), Alt+Num+ 같은 확장자, 글자 입력 **빠른 검색**(`quick` 버퍼, 1.2 s), Alt+Enter 속성. 패널 상단의 **탭 줄**(`tabs/tabIndex` props + onTabSelect/New/Close/CloseOthers/ToOther — 클릭·가운데 클릭·우클릭 메뉴·빈 곳 더블클릭·`+`), 경로 표시줄의 🕘 폴더 기록·★ 즐겨찾기 메뉴(App 이 `history`/`hotlist` props 로 공급). 열 표시는 `columns` prop. App 은 `ref`(refresh/getSelectedEntries/getCursorEntry/selectPaths — **커서도 함께 이동**/selectByPattern/invertSelection/openHistory/openHotlist/openDrives/goUp…)와 `onAction(id)` 로만 상호작용. |
| `components/FolderTree.jsx` | 루트(`fs.roots`) + 지연 로딩(`fs.subdirs`), 현재 경로까지 자동 확장. |
| `components/Chrome.jsx` | 메뉴바(파일/편집/선택/보기/압축 — 모든 항목에 아이콘·단축키, 선택 상태로 활성/비활성), **아이콘 전용 툴바**(`[action, icon, label, tooltip, disabled?, toggled?]` 표; 툴팁이 설명·단축키, `aria-label` 이 이름) + 우측: 테마 분할 버튼(툴팁에 현재/다음 테마) · 국기 언어 토글 · 설정 · 정보, **`FnBar`**(F3~F8·Alt+F4 펑션 키 바). |
| `components/Prompt.jsx` | `renderPrompt` 결과를 그림: 파워라인 = clip-path 화살표(앞 세그먼트 색이 다음 위로 겹침, Nerd Font 불필요), 다이아몬드 = 둥근 캡슐, 일반 = 색 글자; `[[icon:name]]` → SVG 아이콘; 테마색(`--accent/--fg/--bg`)은 렌더마다 읽음. |
| `components/BottomDock.jsx` | 하단 패널: 탭 줄(로그 + 터미널 ×N, `+`/`+ ▾` 셸 선택, 가운데 클릭 닫기, 높이 조절 스플리터). `LogView` 는 시각·수준·메시지 줄(맨 아래 고정 스크롤, 복사/지우기). `TerminalView` 는 MyEditor 의 `TerminalPanel` 과 같은 콘솔 — 아래 "터미널 UI" 참고. |
| `components/ContextMenu.jsx` | 위치 보정 팝업 메뉴(메뉴바 드롭다운·컨텍스트 메뉴·테마 목록 공용, 체크/스와치 지원). |
| `dialogs/Dialogs.jsx` | `useDialogs()` — 프라미스 기반 스택(`prompt/confirm/error/conflict/compress/about/properties/settings/viewer/editor/multiRename`, `open()` 은 진행률처럼 갱신형). `DialogFrame` 의 **`windowed`** 모드: 배경·제목줄 없이 창 전체를 채우고 제목은 `document.title` 로 — 도구 창에서 같은 컴포넌트를 재사용. `describeError` 가 Error → 메시지+상세. |
| `dialogs/ToolDialogs.jsx` | **뷰어**(텍스트 `<pre>` 줄 바꿈/16진수 덤프, 이미지 맞춤/원본, F3·Ctrl+W·Ctrl+H), **편집기**(textarea, Tab 유지, Ctrl+S → `spec.onSave`, 닫을 때 `spec.confirmDiscard`), **다중 이름 바꾸기**(`computeRenames`: `[N]` `[N2-5]` `[N3-]` `[E]` `[C]` `[P]` 마스크 → 찾기/바꾸기(정규식·대소문자 무시) → 대소문자 규칙; 미리보기와 중복/무효 표시). 모두 `spec.prefs`(글꼴·줄 바꿈·탭)와 `spec.windowed` 를 받습니다. |
| `ToolWindow.jsx` | `?win=<kind>` 페이지: `app.info`·`session.load` 로 테마·언어·글꼴을 맞추고 `windowArgs()` 로 인자를 받아 도구 하나를 창 전체에 렌더. 결과는 `postToApp` 으로 메인 창에 전달(편집기 저장 → refresh, 다중 이름 바꾸기 → `fs.renameMany` 후 renamed, 검색 → navigate/openFile/clipCopy/copyTo, 설정 → settings(변경마다 `live`, 확인/취소 시 최종값)). 메인 창의 `session` 메시지로 테마·언어·글꼴을 따라갑니다. |
| `dialogs/SearchDialog.jsx` | 비모달 검색 창(제목줄 드래그): `search.start` 잡(진행 중 개수), 결과 `{path,isDir,size}` 목록에 패널과 같은 선택(클릭/Ctrl/Shift/방향키/Ctrl+A). Enter·더블클릭 → 폴더 `onOpenDir`(App: 왼쪽 패널로 이동) / 파일 `onOpenFile`(`fs.open`); Ctrl+C·복사 버튼 → `onClipCopy`(패널의 클립보드 복사와 같은 `file://` 목록 + 앱 내부 클립보드 → 패널 Ctrl+V); 왼쪽/오른쪽 패널로 복사 버튼·우클릭 메뉴 → `onCopyTo`(App `copyPathsTo`: 진행률·충돌 처리하는 `ops.transfer`). |
| `dialogs/PromptEditor.jsx` | 설정 › 프롬프트 — 스크롤 없이 한 화면: (1) 3가지 상태 미리보기(`SAMPLE_STATES`) (2) 프리셋 버튼(실제 렌더러로 그린 미니 미리보기, 클릭 = 적용, `config.preset` 으로 현재/수정됨 표시) (3) 간단 설정 — 세그먼트 종류별 켜기/끄기(`enabled` 플래그: 지우지 않고 숨김, 없던 종류는 QUICK 순서·색으로 추가), 모양 일괄 변경, 경로 스타일, 두 줄(❯ 블록 추가/병합) (4) 고급 편집 — 마스터·디테일(왼쪽 세그먼트 목록 + 블록, 오른쪽 선택 세그먼트의 필드) + oh-my-posh JSON 가져오기(붙여넣기 / `pickFile`+`fs.readFile`)·내보내기(클립보드). 값은 `session.prompt`. |
| `dialogs/SettingsDialog.jsx` | 설정 4개 탭(일반[+패널·창·터미널 섹션] · 테마[카드 20개 + 사용자 정의] · 파일 열기·편집 · 프롬프트). 키와 기본값은 `lib/settings.js` 의 `SETTINGS_DEFAULTS`/`SETTINGS_KEYS` 한 곳. **즉시 적용**: 값이 바뀔 때마다 `spec.onChange(values)` → App `applySettings(quiet)`(도구 창이면 `live` 메시지); 확인은 최종값, 취소는 원래 값으로 한 번 더 적용. 찾아보기는 `pickFolder`/`pickFile`(IPC `dialog`). |
| `lib/backend.js` | 전송 분기: `call`, `runJob/followJob`(푸시 vs 폴링), `watchDir`(fs.watch vs mtime 폴링), 클립보드, `pickFolder/pickFile`, `unwrap`(오류 객체 → Error, 스택 결합). **도구 창**: `windowKind/windowId`(URL), `openWindow(kind, args)`(Electron IPC `win:open` / 브라우저 `window.open` + localStorage 인자), `windowArgs()`, `closeWindow()`, `postToApp(msg)`/`onAppMessage(cb)`(IPC 릴레이 / `BroadcastChannel`). |
| `lib/history.js` | 실행 취소/다시 실행 스택(데이터 엔트리만 보관 — 해석은 App). `push`(redo 비움, `max` 까지 유지) · `mark`(되돌릴 수 없는 작업 후 redo 만 비움) · `commitUndo/commitRedo` · `drop`(실패한 엔트리 제거) · 구독. |
| `lib/settings.js` | 설정 기본값·키 목록, `isTextFile(name, exts)`. |
| `lib/prompt.js` | **프롬프트 테마 모델(oh-my-posh 호환)**: 설정 형식은 oh-my-posh JSON 과 같은 `blocks[].segments[]`(type · style · foreground/background(+`_templates`) · template · properties · palette). Go 템플릿 부분집합 엔진(`renderTemplate`: 필드, if/else if/else, gt/lt/eq/ne/and/or/not, 파이프 date/upper/lower/default/trunc), `formatPath`(oh-my-posh 경로 스타일 전부), `segmentContext`(종류별 변수 — git 은 `.HEAD .BranchStatus .Working .Staging .StashCount …`), `renderPrompt(config, state, theme)` → 블록/세그먼트(텍스트·색), `importOmp`/`exportOmp`, 프리셋 16종, 미리보기용 `SAMPLE_STATES`. 순수 모듈이라 `test/prompt.test.mjs` 가 node 로 직접 검사. |
| `lib/i18n.js` | ko/en 사전 + `t()` + `useLanguage()`(useSyncExternalStore). |
| `lib/ansi.jsx` | ANSI SGR → 스타일 런(`parseAnsi`)과 `AnsiText`(MyEditor 와 동일): 16/256/24-bit 색, 굵게·흐리게·기울임·밑줄·반전·취소선. |
| `lib/format.js` | 크기/종류 표시, 경로 분리자(백엔드에서 받음), breadcrumb 분해, `globToRegExp`(`*.txt;*.md`). |
| `themes.js` | 20 테마(다크 12 · 라이트 8) + **사용자 정의 테마**(`setCustomThemes(session.customThemes)` 로 등록 → `allThemes()/themeById/nextThemeId` 가 함께 봄; `baseColorsOf` 로 기존 테마의 기본 색을 복제) 토큰 → `:root` CSS 변수(`applyTheme`), 순환(`nextThemeId`). |
| `styles.css` | 변수 기반 스타일(기본값 = 미드나이트). |

### 터미널 UI (`BottomDock.jsx` 의 `TerminalView`)

- 기록(`<pre>`)은 `cmd`(그 순간의 cwd·git + 입력한 줄) / `out`(셸 출력) 항목 배열로, 10,000줄을 넘으면 앞에서 잘라냅니다. 탭 객체(`term.buffer/seq/git/idle`)에 보관하므로 탭 전환·패널 숨김 후에도 그대로입니다.
- 기록 끝에 **프롬프트**(`TermPrompt` → `components/Prompt.jsx`, 테마는 `session.prompt`): 기본 프리셋은 경로 세그먼트(`--accent`) + git 세그먼트(배경 `auto` = 상태색: conflict `#D62828` > staged `#FFD700` > modified `#FF5C5C` > ahead `#FFD700` > behind `#7cc4ff` > uptodate `#7CFC8B`; 추적 안 함은 색에 영향 없음, 기호 ↑ ↓ + ~ ? !). 프롬프트 상태에는 cwd · git · `rc`(마지막 명령 종료 코드, 마커에서) · `ms`(명령 전송 → idle 복귀 시간) · 사용자/호스트/OS(`app.info`) · 셸이 들어가며, 기록의 `cmd` 항목은 그 순간의 값을 보관해 같은 모양으로 다시 그립니다. 개수는 툴팁에.
- 프롬프트 바로 뒤에 `inline-grid` 로 값 너비만큼 늘어나는 `<input>`(`::after` 가 값을 거울처럼 그려 폭을 정함) — 네이티브 캐럿과 IME 를 그대로 씁니다. 출력을 클릭하면(선택 중이 아닐 때) 입력으로 포커스.
- 탭이 보일 때만 읽습니다: `term.read` 롱폴링 루프(`wait` 1.5 s) — 출력·idle 변화·종료가 생기는 즉시 답이 옵니다. `idle` 이 아니면 프롬프트를 숨기고 Enter 는 실행 중 프로그램의 stdin 으로 갑니다(백엔드가 판단). git 상태는 명령이 끝났을 때(idle 복귀, `cmdSentRef`)와 cwd 가 바뀔 때 `git.status` 로 다시 읽습니다 — MyEditor 와 같이, 폴더의 첫 조회만 프롬프트를 기다리게 하고(`gitReady`; 그동안 `.term-live.pending` 의 `opacity:0` 으로 숨김 — `visibility:hidden` 은 포커스를 빼앗으므로 쓰지 않음), 이후엔 마지막 상태로 즉시 그린 뒤(`stale`) 새 상태가 다르면 색만 바뀝니다; 늦게 온 옛 조회는 seq 로 버립니다. 명령이 끝나면 포커스가 비어 있을 때 입력으로 되돌립니다. 기록(`transcript`)은 `useMemo` 로 묶어 키 입력마다 다시 그리지 않고, 출력은 `AnsiText` 로 ANSI 색을 살려 그립니다.
- Tab → `term.complete`: 후보가 하나면 삽입(파일·명령 뒤엔 공백, 폴더 뒤엔 없음), 여럿이면 공통 접두사, 더 없으면 패널 폭에 맞춰 열로 나열. ↑↓ 기록(편집 중이던 줄 보존), Ctrl+L / `clear` / `cls`, Esc, 여러 줄 붙여넣기(줄마다 실행), 선택이 있을 때 Ctrl+C 는 복사.

## 6. 빌드·패키징

- `vite build` → `dist/` (`base: './'` 로 file:// 와 임의 경로 서빙 모두 지원).
- electron-builder: `files` 에 `core/`·`electron/`·`dist/`·`build/icons/`; `asarUnpack` 에 `core/bzip2-worker.js` 와 `compressjs`(워커는 asar 밖에서만 로드 가능). `extraResources` 로 `build-info.json`.
- Windows NSIS: `build/installer.nsh` — 바로가기 선택 페이지, 이전 설치 완전 삭제, 남은 데이터 삭제 여부 질문. 설치/제거 프로그램 아이콘도 앱과 같은 `icon.ico`.
- Linux deb: `after-install.sh` (desktop DB·아이콘 캐시 갱신, chrome-sandbox setuid).
- `scripts/generate-icons.mjs`: sharp 로 SVG → PNG(16~1024), `ico.mjs` 로 ICO/ICNS 컨테이너 생성.
- `scripts/start-electron.mjs`: `ELECTRON_RUN_AS_NODE` 를 지우고 Electron 실행. 개발 모드(`ELECTRON_DEV=1`, `npm start`)에서는 `core/`·`electron/` 을 감시해 파일이 바뀌면 Electron 을 다시 띄웁니다 — Vite 는 렌더러만 갱신하고 메인 프로세스(터미널 백엔드·IPC·preload)는 재시작해야 반영되기 때문.

## 7. 테스트

- `test/archive.test.mjs`: 세 형식 왕복(한글·긴 이름·심볼릭 링크 포함), 분할/결합, 취소 시 잔여 파일 없음, 확장자 헬퍼.
- `test/fsops.test.mjs`: 목록 메타데이터, 충돌(건너뛰기/덮어쓰기/모두 적용), 이동·자기 자신 안으로 이동 금지, 취소, mkdir/생성/이름 바꾸기/삭제, 검색, API 디스패치·세션.
- `test/terminal.test.mjs`: 셸 목록, 세션 왕복(한글 echo, `cd` 후 cwd·`idle` 갱신, 마커 누출 없음, 실행 중 프로그램에 입력, 변수 유지, Tab 완성(파일/명령), 증분 읽기, kill), git 상태(저장소/비저장소), `term.*`/`git.status` 디스패치, 롱폴링(타임아웃까지 대기 / 명령에 즉시 깨어남)과 `shutdown`.
- `test/fsops.test.mjs` 에 추가: `renameMany`(맞바꾸기, 기존 파일/중복 거부, 롤백 후 임시 파일 없음), `readFile`(BOM·UTF-16·이진·이미지)/`writeText`, `transfer` 의 항목별 결과.
- `scripts/smoke.mjs`: 실제 Electron 을 별도 프로필로 띄워 스크린샷(`--scenario context|compress|search|about|light_en|delete|themes|error|theme_*|terminal|log|settings_terminal|menu_*|viewer|multirename|compare|undo`), `--script <js> --name <n>` 으로 임의 시나리오, `--tool-script <js>` 로 시나리오가 연 도구 창 안에서 실행(창은 `<name>-<kind>.png` 로 캡처), `--probe <js>` 로 마지막에 메인 창 상태를 출력, `--web` 이면 웹 서버를 띄우고 preload 없는 창으로 브라우저 모드를 캡처. 실행 취소·다중 이름 바꾸기·별도 창·즉시 적용 설정은 이 조합으로 검증했습니다(`undo` 시나리오: 새 폴더 → 이름 바꾸기 → 되돌리기 ×2 → 다시 실행).

## 8. 설계 메모

- **왜 자체 tar 인가**: 네이티브 의존성 없이 Electron/서버에서 동일하게 동작하고, GTK 판(libarchive)과 서로 읽을 수 있어야 하기 때문.
- **왜 bzip2 는 워커인가**: `compressjs` 는 동기·바이트 단위라 메인 프로세스에서 돌리면 IPC 가 멈춤.
- **왜 분할 첫 조각이 `.zip`/`.tgz` 인가**: GTK 판의 규칙을 그대로 따라 두 프로그램이 서로의 분할 파일을 해제할 수 있게 함(7-Zip 순서와 다름 — README 의 `cat` 안내 참고).
- **왜 짧은 대화상자는 앱 내부 모달이고 도구는 별도 창인가**: 프롬프트·확인·충돌·진행률·오류는 순간적이라 앱 안 모달이 가장 빠르고 웹에서도 같습니다. 반면 뷰어·편집기·다중 이름 바꾸기·검색·설정은 오래 열어 두고 옮기거나 여러 개 띄우는 도구라 **독립 창**으로 만들었습니다(요구 사항: 앱에 종속되지 않고 위치·크기를 바꿀 수 있되 앱과 함께 종료). 같은 번들을 `?win=` 으로 띄우고 창 간 메시지 버스로 메인 창의 상태(패널 새로고침·실행 취소 기록·설정)를 맞추므로, 데스크톱(BrowserWindow)과 웹(팝업) 모두 같은 코드입니다. 설정에서 끄면 예전 방식(앱 내 대화상자)으로 돌아갑니다.
- **왜 실행 취소 엔트리는 데이터인가**: 클로저를 저장하면 오래된 React 상태를 붙잡습니다. `{kind, paths…}` 만 저장하고 실행 시점의 App 함수가 해석하며, `fsops.transfer` 가 항목별 `existed` 를 돌려주므로 덮어쓰기/병합된 항목은 애초에 기록하지 않습니다.
- **왜 설정이 즉시 적용되는가**: 사용자 요구. `SettingsDialog` 가 변경마다 `onChange` 를 부르고 App 이 조용히 적용·저장, 취소 시 원래 값으로 재적용. 도구 창에서는 같은 흐름이 메시지 버스를 탑니다.
- **왜 터미널이 pty 가 아닌가**: `node-pty` 는 네이티브 모듈이라 세 OS × Electron/Node ABI 마다 빌드가 필요하고 웹 서버 쪽도 무거워집니다. 파일 관리자에서 필요한 것은 `git`·`npm`·`dir` 같은 줄 단위 명령이므로 파이프 stdio 로 충분하고, 대신 전체 화면 프로그램과 Ctrl+C 중단은 포기했습니다. 프롬프트·입력·Tab 완성은 MyEditor 의 터미널 패널과 같은 방식이며, 명령을 스크립트 파일로 source 해 stdin 을 비워 두므로 실행 중 프로그램과의 줄 단위 대화도 됩니다. 한글 입력은 Windows 셸마다 다른 우회(2장 "터미널 흐름")로 해결.
- **오류 전달**: 백엔드 → `serializeError`(code/path/syscall/stack) → `unwrap` 이 렌더러 Error 로 재구성(스택 두 프로세스 결합) → `describeError` → 팝업 + 복사.
