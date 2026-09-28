# Command Center — 내부 구조

## 1. 한눈에 보기

```
                 ┌──────────────────────── src/ (React UI, Vite) ───────────────────────────┐
                 │ 메인 창  App.jsx ── FilePanel ×2 ── FolderTree · ContextMenu · Chrome(메뉴/툴바/펑션키) │
                 │           BottomDock(로그 탭 + 터미널 탭 ×N)  ·  lib/history.js(실행 취소)     │
                 │           Dialogs(프롬프트·확인·충돌·진행률·압축·정보·파일 정보·오류 — 앱 내 모달)│
                 │ 도구 창  ToolWindow.jsx (?win=viewer|editor|preview|info|multiRename|search|settings|about)│
                 │           ToolDialogs(ImageView) · InfoDialog · SearchDialog · SettingsDialog 를 창 전체에 렌더│
                 │           lib/images.js · dicom.js · exif.js  ←  이미지 디코딩은 렌더러에서 (두 호스트 동일)│
                 │           lib/print.js · PrintDialog  ←  인쇄 창 (데스크톱: PDF 미리보기·프린터, 웹: iframe)│
                 │           lib/backend.js  ←  유일한 호스트 분기점 (+ 창 열기 · 창 간 메시지 버스)│
                 └──────────────┬─────────────────────────────────┬─────────────────────────┘
                     IPC (preload)                            fetch('/api/…') + 폴링
                 ┌──────────────▼──────────────┐     ┌───────────▼──────────────────────┐
                 │ electron/ main.js ipc.js     │     │ server/server.js (node:http 만)   │
                 │ BrowserWindow ×(1 + 도구 창) │     │ dist/ 정적 제공 + POST /api/<name> │
                 │ openPath(+셸 폴백)/trashItem │     │ 도구 창 = window.open 팝업        │
                 │ printHtml/printPreview/printers│     │ 인쇄 = iframe, 저장 = 다운로드     │
                 └──────────────┬──────────────┘     └───────────┬──────────────────────┘
                                └────────────► core/api.js ◄──────┘
                                  fsops(readFile/writeText/writeBytes/fileInfo/hashFile/renameMany …) · archive · jobs · session · terminal
```

같은 `core/` 가 두 호스트에서 그대로 실행되므로 데스크톱과 웹의 동작이 항상 같습니다.
UI 는 `window.commandCenter`(preload 가 노출) 유무로 전송 방식만 고릅니다.

## 2. core/ — 플랫폼 무관 코어 (CommonJS, Node 만 사용)

| 파일 | 역할 |
|---|---|
| `api.js` | 메서드 이름 → 함수 표. `createApi(host)` 가 호스트 전용 기능(열기·휴지통·클립보드·OS 인쇄 `printPath`)을 주입받습니다(`app.info.capabilities` 로 UI 에 알림; `fs.print` 는 `printPath` 가 없으면 `PRINT_UNSUPPORTED`). 긴 작업은 즉시 **잡 스냅샷**을 돌려줍니다. `term.*`/`git.status` 는 `terminal.js` 로, `shutdown()` 은 호스트 종료 시 셸 정리. `serializeError` 가 code/path/syscall/stack 을 UI 로 넘깁니다. |
| `fsops.js` | `MEDIA_TYPES`/`mediaKind`(동영상·오디오 확장자 → MIME; `readFile` 은 이런 파일을 읽지 않고 `{kind:'media', media, mime, size}` 만 — `.ts` 는 텍스트 probe 로 TypeScript 와 구분), 목록(권한 문자열, 날짜, 확장자), 루트 목록(홈·드라이브·/tmp·마운트), 드라이브 목록(`listDrives`: Windows 는 Win32_LogicalDisk 를 PowerShell 로 읽어 이름·종류·용량, 60초 캐시), 속성(폴더 합계), mkdir/새 파일/이름 바꾸기, **`renameMany`**(다중 이름 바꾸기 — 임시 이름을 거치는 2단계, 중복/기존 파일 사전 검사, 실패 시 롤백, 적용된 `{from,to}` 반환), **`readFile`**(뷰어/편집기 — 이미지(`IMAGE_TYPES`: png·jpg·gif·webp·bmp·svg·ico·avif·apng·**heic/heif/hif·dcm/dicom·tif/tiff**)는 base64, 텍스트는 BOM·UTF-16·Latin-1 감지, 이진은 16진수용 앞부분; 8/24 MB 제한), `writeText`(UTF-8), `writeBytes`(base64 → 파일; 이미지 변환 저장), **`fileInfo`**(statPath + MIME·디스크 사용·만든/접근/변경 시각·8진 모드·읽기 전용/숨김·하드 링크·(POSIX) 소유자/inode·링크 대상 존재 여부), **`hashFile`**(MD5·SHA-1·SHA-256 스트리밍), 항목 수 세기, **복사/이동**(충돌 질문, 폴더 병합, 자기 자신 안으로 이동 금지, EXDEV 시 복사+삭제; 결과에 항목별 `{src,dest,existed}` — 실행 취소용), 삭제, 휴지통(호스트 함수 없으면 freedesktop/macOS 휴지통 폴더), `openWithDefaultApp`(PowerShell `Invoke-Item` / `open` / `xdg-open`), `openWithApp`(지정 프로그램을 detached 로 실행), `printWithDefaultApp`(앱이 직접 그릴 수 없는 파일의 인쇄 — Windows 는 PowerShell `Start-Process -Verb Print`, 그 외 `lp`), **검색**(`nameMatcher`: contains(기본, 와일드카드 없으면 `*이름*`) · exact · regex, `caseSensitive` 는 이름과 내용 모두; 내용 검색은 파일만, 64 MB 제한; 결과 `{path, name, isDir, size, mtime, perm, date, ext}`). |
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
  - cmd 는 코드 페이지 65001 + 파이프에서 멀티바이트 입력을 읽으면 종료되는 버그가 있어 배치 파일 `call` 이 유일한 방법이며, `%CD%` 는 줄 파싱 시점에 확장되므로 마커를 배치 파일 안에 둡니다. 단 **마커는 명령이 든 파일이 아니라 그 파일을 `call` 하는 래퍼 파일**(`wrapFile`, `…-run.cmd`)에 둡니다: 배치 파일에서 다른 배치 파일(`npm`·`npx`·`yarn`·`gradlew` …)을 `call` 없이 부르면 그 자리에서 원래 파일이 끝나 뒤 줄이 영영 실행되지 않고(`exit /b` 도 같음) 프롬프트가 돌아오지 않기 때문입니다. 종료 코드는 `%__CCRC%` 로 옮깁니다 — 명령 파일이 명령 직후 `set __CCRC=%ERRORLEVEL%`(`rcLine`) 로 잡고(`call` 은 9009 같은 코드를 1 로 뭉개므로), 그 줄까지 못 간 배치 명령은 래퍼가 `call` 의 코드로 채웁니다. cmd 가 읽기 전마다 찍는 프롬프트는 `PROMPT=__CC_P__` 로 바꿔 걷어냅니다.
  - **셸이 죽으면**(`shellExited`) 둘 중 하나입니다. **부탁받은 죽음**(`exit`·`logout` 한 줄 = `EXIT_LINE`, 또는 탭을 닫아 `kill`)이면 세션이 끝나고 렌더러가 탭을 닫습니다(`onTermExit` — 터미널은 곧 그 셸이므로). PowerShell 은 닷소스 안의 `exit` 가 스크립트만 끝내므로 이 줄만 스크립트 파일을 거치지 않고 stdin 으로 직접 보냅니다(`rawLine`). **그 밖의 죽음**은 같은 디렉터리(`realCwd` — Git Bash 는 `%TEMP%` 를 `/tmp/…` 로 보고하므로 마지막으로 실존이 확인된 경로)에서 셸을 다시 띄웁니다(`MAX_RESTARTS` 5 회). 기록에는 쓰지 않습니다 — 터미널 화면은 셸이 찍은 것만 보여야 하므로, 스냅샷의 `restarts`(단조 증가)가 올라가면 렌더러가 `onTermRestart` 로 **로그 탭에 한 줄**만 남깁니다(`term_restarted`). 이유는 **Cygwin 프로그램**입니다: 물려받은 핸들을 종료할 때 닫아 버려(`C:\Cygwin64\bin` 의 `ls`·`cat`·`grep` …) 셸의 stdin 이 사라지고 cmd·PowerShell 이 EOF 로 조용히 끝나기 때문에 — `ls` 한 번에 터미널을 잃지 않도록. 죽는 순간 보낸 명령은 다시 실행하지 않습니다(출력을 남기지 않는 `del`·`copy` 를 두 번 돌릴 위험).
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

- `main.js`: **`cc-media://`**(`registerSchemesAsPrivileged` + `protocol.handle`: `?p=<경로>` 의 동영상·오디오·이미지 파일을 `fs.createReadStream` 으로 스트리밍, `Range` → 206/`content-range`, 416, 415/404 — 페이지가 dev 는 http, 배포는 file 이라 임의 file: URL 은 못 쓰므로 별도 scheme), **단일 인스턴스**(`requestSingleInstanceLock({ replace: isDev })`) — 배포판은 두 번째 실행이 열린 창을 앞으로 가져오지만, **개발 모드에서는 새 실행이 인계받습니다**: `npm start` 는 새 코드를 보려고 치는 명령인데 예전에는 0.3 초 만에 아무 말 없이 끝났기 때문입니다. 락을 쥔 개발 인스턴스는 `second-instance` 의 `replace` 를 보고 스스로 종료하고(창 위치는 평소대로 저장), 새 프로세스는 종료 코드 `3` 으로 빠진 뒤 `start-electron.mjs` 가 락이 풀릴 때까지 250 ms 간격으로 20 번 다시 시도합니다(배포판이 락을 쥐고 있으면 안 비키므로 안내하고 중단), 창 크기/위치 복원(`session.windowBounds` — **최소 1149×713 — 시작 크기이기도 함(저장된 크기는 복원하지 않고 위치만 복원)**(툴바의 모든 버튼이 두 언어에서 보이는 폭; 이 상수는 첫 프레임용일 뿐 — 렌더러가 실제로 그려진 툴바를 재서 `win:minwidth` 로 알려주면 그 값이 최소 폭이 되고, 이미 더 좁으면 창을 넓힙니다(src/lib/minwidth.js). Electron 은 저장된 bounds 를 min 으로 clamp 하지 않으므로 직접 clamp; CSS `.app{min-width:var(--chrome-min-w,1149px)}` 가 같은 값을 웹에서 보장), `will-quit` 에서 `api.shutdown()`(터미널 셸 정리), 테마 배경색(`session.themeBg`)으로 첫 프레임 깜빡임 방지, **제목 표시줄은 페이지가 그림**(`titleBarStyle:'hidden'`+`titleBarOverlay` — Windows 는 창 조절 단추를 테마 색으로, macOS 는 `hiddenInset`, Linux 는 기본 프레임 유지; 테마가 바뀌면 렌더러가 `win:titlebar` 로 색과 `nativeTheme.themeSource` 를 갱신 — src/lib/titlebar.js, `session.titleBg`/`titleFg`), macOS 만 애플리케이션 메뉴(Cmd+Q/C/V). **도구 창** `openToolWindow({kind})`: 같은 페이지를 `?win=<kind>&id=<BrowserWindow.id>` 로 여는 독립 `BrowserWindow`(부모 창 없음 → 자유롭게 이동·크기 조절; 종류별 기본 크기, 닫을 때 `session.toolBounds[kind]` 저장). **종류마다 하나**(`SINGLETON`; `preview`·`info` 포함 — **조용한 창** `QUIET`(`preview`)은 목록 클릭으로 열리므로 `showInactive()` 로 표시하고 재요청 시 포커스하지 않으며, 메인 창의 `parent` 로 두어 항상 그 위에 머뭅니다): 이미 열려 있으면 포커스하고 ipc 가 새 인자를 `win:args` 에 넣은 뒤 그 창에만 `replaceArgs` 메시지 → ToolWindow 가 다시 로드(편집기는 dirty 면 확인). 설정 창은 `FIXED_SIZE`(resizable false, 폭 1040 · 높이는 SettingsDialog 가 탭을 재서 맞춤, 위치만 기억). 타이틀바 아이콘은 `assets/tool-icons/<kind>.png`(`scripts/generate-tool-icons.mjs` 가 Icons.jsx 의 경로로 생성). 메인 창이 닫히면(`closed`) 열려 있는 도구 창을 모두 닫습니다. `openPath` 는 `shell.openPath` 가 실패 문자열을 돌려주면(Windows 11 스토어 앱 연결·연결 없음) `fsops.openWithDefaultApp` 으로 다시 시도. `--smoke-shot=<png>` `--smoke-script=<js>` `--smoke-tool-script=<js>`(도구 창 안에서 실행, 창이 닫히면 race 로 종료) `--smoke-probe=<js>` `--smoke-url=<http>` 는 smoke 테스트용 — 도구 창은 `<shot>-<kind>.png` 로 함께 캡처.
- `main.js` 의 **인쇄** `withPrintWindow`: 렌더러가 만든 자체 완결 HTML(페이지 크기·방향·여백은 문서의 `@page`, 배율은 `zoom` — 그래서 미리보기와 종이가 같음)을 임시 파일(`<temp>/command-center-print/`)로 써서 숨은 `BrowserWindow`(sandbox)에 로드. `printHtml({html, title, options})` 는 `webContents.print`(`deviceName` 이 있으면 `silent:true` 로 그 프린터에 바로 — 매수·`pageRanges`·`pageSize`·`landscape`·`color`, 여백은 `marginType:'none'` 으로 문서에 맡김; 없으면 시스템 대화상자) — 결과 `{ok}` / `{ok:false, cancelled}` / `{ok:false, error}`; `printPreview` 는 같은 문서를 `printToPDF({preferCSSPageSize:true, margins:0})` 로 PDF(base64)+쪽 수(`/Type /Page` 세기); `printers` 는 `getPrintersAsync`. 창은 끝나면 파괴, 임시 파일 삭제. 호스트 함수 `printPath`(= `fsops.printWithDefaultApp`, OS 인쇄) · `clipboard.writeImage`(`nativeImage.createFromDataURL`) · 대화상자 `saveFile`(`showSaveDialog`, 이미지 변환 저장) 도 여기서 주입. `TOOL_SIZES` 에 `preview`(720×560) · `info`(660×720, 이후 내용에 맞춰 `win:fit`).
- `ipc.js`: `ipcMain.handle('api')` → `api.call`(터미널 롱폴링 `term.read` 도 이 경로); `job:update` 는 **모든 창**에 푸시(검색 창이 자기 잡을 따라가야 하므로); `fs.watch` 기반 `watch:start/stop` → `dir:changed`; `ipcMain.handle('dialog')` → 네이티브 대화상자(`openFolder`, `openFile` — 요청한 창을 부모로); 도구 창: `win:open`(창 생성 + 인자 보관) · `win:args`(창이 자기 인자를 가져감) · `win:close` · `win:message`(모든 창에 릴레이 — 창 간 메시지 버스); `print:html` → `main.js printHtml`.
- `preload.js`: `window.commandCenter` (call / onJobUpdate / watchDir / onDirChanged / dialog / printHtml / quit / openWindow / windowArgs / closeWindow / postMessage / onMessage). `call` 은 `{ok,…}` 객체를 그대로 돌려주고 UI 가 Error 를 만듭니다 — contextBridge 를 넘는 Error 는 message 외의 속성을 잃기 때문입니다.

## 4. server/ — 웹 호스트

`node:http` 만 사용합니다. `GET` 은 `dist/` 정적 파일(SPA 폴백 — `/?win=viewer&id=…` 도 같은 `index.html`), `POST /api/<name>` 은 JSON 본문을 `api.call` 로 넘깁니다.
`GET /api/media?path=`(`streamMedia`: `MEDIA_TYPES`/`IMAGE_TYPES` 파일만, Range → 206·HEAD·416·415; 뷰어의 `<video>`/`<audio>`/스트리밍 이미지). `--host` `--port` `--token`(Bearer / `?token=`) 옵션, 기본 루프백 바인딩. 브라우저 세션 저장은 `session.js` 의 XDG/AppData 경로.
도구 창은 브라우저 팝업(`window.open`)이며 인자는 `localStorage`(`cc-win:<id>`), 창 간 메시지는 `BroadcastChannel('command-center')`; 메인 페이지가 닫히면(`beforeunload`) 자기가 연 팝업을 닫습니다.

## 5. src/ — UI

| 파일 | 역할 |
|---|---|
| `App.jsx` | 세션 로드/저장(`saveSession` 은 테마·사용자 테마·언어·글꼴 변경을 도구 창에 브로드캐스트; 활성 패널·패널 배치 `layout` 도 저장), 우측 하단 `ResizeGrip`(IPC `win:size/win:resize`), 활성 패널, 모든 액션(`runAction` — TC 액션 포함: view/edit/multiRename/compareDirs/swapPanels/targetLeft·Right/select*/dirHistory/hotlist/drives/parent/root), 진행률+충돌을 묶는 `runWithProgress`, **패널 탭**(`tabsOf/tabIndexOf/setTabs` — `session[side]` 는 항상 활성 탭의 경로라 나머지 코드는 그대로 `pathOf(side)`; `navigate` 는 활성 탭의 경로를 바꾸고, `newTab/closeTab/selectTab/cycleTab`, 패널 바꾸기는 탭 배열도 교환), **전역 단축키 표 한 곳**(F-키·Alt·Ctrl 조합), 분할선, 전역 오류 핸들러, smoke 훅 `window.__cc`. **실행 취소**: `history`(lib/history.js)에 create/rename/renameMany/copy/move/compress/extract 엔트리를 기록하고 `applyHistory` 가 되돌리기/다시 실행을 해석(삭제류는 `removeProduced` → 확인 후 삭제 잡). **도구 창**: `useWindows()`(설정 `separateWindows` ∧ 호스트 지원)이면 `openWindow(kind, args)`, 아니면 앱 내 대화상자; 도구 창에서 오는 메시지는 `busRef`(refresh · renamed → history+선택 · navigate · openFile · clipCopy · copyTo · settings → `applySettings`)가 처리. `openEntry` 는 텍스트 파일(설정 `textExts`)을 `textOpen` 설정대로(app/viewer/editor/custom) 엽니다. 하단 패널 상태: `log`, `terms`, `dockTab`, `session.dockVisible/dockHeight`. |
| `components/FilePanel.jsx` | 목록 로드·정렬·선택(Ctrl/Shift/키보드)·컨텍스트 메뉴·폴더 감시(`watchDir`, 250 ms 디바운스, 작업 중 일시 정지)·패널 상태줄. **TC 키**: Insert/Space 토글(Space 는 `fs.stat` 으로 폴더 크기 → `dirSizes`), Num+/−/* 패턴 선택·반전(`globToRegExp`), Alt+Num+ 같은 확장자, 글자 입력 **빠른 검색**(`quick` 버퍼, 1.2 s), Alt+Enter 속성. 패널 상단의 **탭 줄**(`tabs/tabIndex` props + onTabSelect/New/Close/CloseOthers/ToOther — 클릭·가운데 클릭·우클릭 메뉴·빈 곳 더블클릭·`+`), 경로 표시줄의 🕘 폴더 기록·★ 즐겨찾기 메뉴(App 이 `history`/`hotlist` props 로 공급). 열 표시는 `columns` prop. App 은 `ref`(refresh/getSelectedEntries/getCursorEntry/selectPaths — **커서도 함께 이동**/selectByPattern/invertSelection/openHistory/openHotlist/openDrives/goUp…)와 `onAction(id)` 로만 상호작용. |
| `components/FolderTree.jsx` | 목록 옆의 **폴더 트리 패널**(`session.leftTree/rightTree`, 폭 `leftTreeWidth/rightTreeWidth` — App 이 FilePanel 에 `treeOpen/onTreeToggle/treeWidth/onTreeWidth` 로 전달; 보기 메뉴 `treeLeft/treeRight`, 경로 표시줄 `.tree-btn` 아이콘 버튼). 루트(`fs.roots`) + 지연 로딩(`fs.subdirs`), `expandTo` 가 현재 경로까지 펼치고 `currentPath` 가 바뀌면 따라감(이미 로드된 가지는 재사용). FilePanel 의 `.panel-main`(트리 · `.tree-resize` 드래그 · 목록) — 목록은 `min-width` 로 가로 스크롤. |
| `components/Chrome.jsx` | 메뉴바(파일/편집/선택/보기/압축 — 모든 항목에 아이콘·단축키, 선택 상태로 활성/비활성), **아이콘 전용 툴바**(`[action, icon, label, tooltip, disabled?, toggled?]` 표; 툴팁이 설명·단축키, `aria-label` 이 이름) + 우측: 테마 분할 버튼(툴팁에 현재/다음 테마) · 국기 언어 토글 · 설정 · 정보, **`FnBar`**(F3~F8·Alt+F4 펑션 키 바). |
| `components/Prompt.jsx` | `renderPrompt` 결과를 그림: 파워라인 = clip-path 화살표(앞 세그먼트 색이 다음 위로 겹침, Nerd Font 불필요), 다이아몬드 = 둥근 캡슐, 일반 = 색 글자; `[[icon:name]]` → SVG 아이콘; 테마색(`--accent/--fg/--bg`)은 렌더마다 읽음. |
| `components/BottomDock.jsx` | 하단 패널(항상 마운트, `visible` 로 display 만 전환해 검색 결과·터미널 상태 유지; **빠른 검색 탭** = `SearchDialog docked` — App 의 `dockSearch {root}`): 탭 줄(로그 + 터미널 ×N, `+`/`+ ▾` 셸 선택, 가운데 클릭 닫기, 높이 조절 스플리터). `LogView` 는 시각·수준·메시지 줄(맨 아래 고정 스크롤, 복사/지우기). `TerminalView` 는 MyEditor 의 `TerminalPanel` 과 같은 콘솔 — 아래 "터미널 UI" 참고. |
| `components/ContextMenu.jsx` | 위치 보정 팝업 메뉴(메뉴바 드롭다운·컨텍스트 메뉴·테마 목록 공용, 체크/스와치 지원). **삭제 가능한 항목**(+ `MenuPopup.jsx`): 항목의 `remove`: 오른쪽 끝 ✕ 가 그 id 를 `keep` 픽으로 보냄(메뉴는 열린 채, 팝업 창은 `menu:pick {keep}` → main 이 숨기지 않고 `menu:picked {id, keep}` — 파일 › 최근 폴더의 항목 삭제). App: `session.recentDirs`(최대 `RECENT_DIRS_MAX`=10, 패널이 이동할 때마다 앞에 삽입) · 액션 `recent:<path>` / `recentRemove:<path>` / `recentClear`. 데스크톱의 팝업 창은 `showInactive()` 로 떠서 포커스를 가져가지 않지만, 항목을 **클릭하면** 그 창이 OS 포커스를 받습니다(`ccHadFocus`) — 그래서 픽으로 창을 숨길 때 `main.js` 가 소유 창에 포커스를 돌려줍니다(그러지 않으면 새 터미널 프롬프트에 커서만 보이고 입력이 안 들어갑니다). blur 로 닫힐 때는 사용자가 다른 창으로 간 것이므로 되찾지 않습니다. |
| `dialogs/Dialogs.jsx` | `useDialogs()` — 프라미스 기반 스택(`prompt/confirm/error/conflict/compress/about/properties/settings/viewer/editor/multiRename/print`, `open()` 은 진행률처럼 갱신형). `DialogFrame` 의 **`windowed`** 모드: 배경·제목줄 없이 창 전체를 채우고 제목은 `document.title` 로 — 도구 창에서 같은 컴포넌트를 재사용. `describeError` 가 Error → 메시지+상세. |
| `dialogs/ToolDialogs.jsx` | **뷰어**(텍스트 `<pre>` 줄 바꿈/16진수 덤프, 이미지 맞춤/원본, F3·Ctrl+W·Ctrl+H, Ctrl+P·인쇄 버튼 — 보이는 내용을 `lib/print.js` 로), **편집기**(textarea, Tab 유지, Ctrl+S → `spec.onSave`, Ctrl+P 는 편집 중인 텍스트 인쇄, 닫을 때 `spec.confirmDiscard`), **다중 이름 바꾸기**(`computeRenames`: `[N]` `[N2-5]` `[N3-]` `[E]` `[C]` `[P]` 마스크 → 찾기/바꾸기(정규식·대소문자 무시) → 대소문자 규칙; 미리보기와 중복/무효 표시). 모두 `spec.prefs`(글꼴·줄 바꿈·탭)와 `spec.windowed` 를 받습니다. |
| `ToolWindow.jsx` | `?win=<kind>` 페이지(viewer · editor · preview · info · multiRename · search · settings · about): `app.info`·`session.load` 로 테마·언어·글꼴을 맞추고 `windowArgs()` 로 인자를 받아 도구 하나를 창 전체에 렌더 — `preview` 는 `ViewerDialog`(spec.preview) 로 그림만, `info` 는 `fs.info` 를 읽어 `InfoDialog`. 설정·정보 창을 뺀 모든 창에 `ResizeGrip`. 결과는 `postToApp` 으로 메인 창에 전달(편집기 저장 → refresh, 다중 이름 바꾸기 → `fs.renameMany` 후 renamed, 검색 → navigate/openFile/clipCopy/copyTo, 설정 → settings(변경마다 `live`, 확인/취소 시 최종값)). 메인 창의 `session` 메시지로 테마·언어·글꼴을 따라갑니다. |
| `dialogs/SearchDialog.jsx` | 검색 창(비모달, 제목줄 드래그) / 별도 창(`windowed`) / 하단 패널 탭(`docked`) 공용. 폼은 두 줄 — 이름 + 검색 시작/결과 지우기(폼 안에 submit 버튼이 있어 Enter 로 제출), 내용 입력 + 아이콘 토글(내용·완전 일치·정규식·대소문자) + 복사 버튼: `search.start` 잡(진행 중 개수), 결과 `{path,isDir,size}` 목록에 패널과 같은 선택(클릭/Ctrl/Shift/방향키/Ctrl+A). Enter·더블클릭 → 폴더 `onOpenDir`(App: 왼쪽 패널로 이동) / 파일 `onOpenFile`(`fs.open`); Ctrl+C·복사 버튼 → `onClipCopy`(패널의 클립보드 복사와 같은 `file://` 목록 + 앱 내부 클립보드 → 패널 Ctrl+V); 왼쪽/오른쪽 패널로 복사 버튼·우클릭 메뉴 → `onCopyTo`(App `copyPathsTo`: 진행률·충돌 처리하는 `ops.transfer`). |
| `dialogs/PromptEditor.jsx` | 설정 › 프롬프트 — 스크롤 없이 한 화면: (1) 3가지 상태 미리보기(`SAMPLE_STATES`) (2) 프리셋 버튼(실제 렌더러로 그린 미니 미리보기, 클릭 = 적용, `config.preset` 으로 현재/수정됨 표시) (3) 간단 설정 — 세그먼트 종류별 켜기/끄기(`enabled` 플래그: 지우지 않고 숨김, 없던 종류는 QUICK 순서·색으로 추가), 모양 일괄 변경, 경로 스타일, 두 줄(❯ 블록 추가/병합) (4) 고급 편집 — 마스터·디테일(왼쪽 세그먼트 목록 + 블록, 오른쪽 선택 세그먼트의 필드) + oh-my-posh JSON 가져오기(붙여넣기 / `pickFile`+`fs.readFile`)·내보내기(클립보드). 값은 `session.prompt`. |
| `dialogs/SettingsDialog.jsx` | 설정 4개 탭(일반[+패널·창·터미널 섹션] · 테마[카드 30개 + 사용자 정의] · 파일 열기·편집 · 프롬프트). 키와 기본값은 `lib/settings.js` 의 `SETTINGS_DEFAULTS`/`SETTINGS_KEYS` 한 곳. **즉시 적용**: 값이 바뀔 때마다 `spec.onChange(values)` → App `applySettings(quiet)`(도구 창이면 `live` 메시지); 확인은 최종값, 취소는 원래 값으로 한 번 더 적용. 찾아보기는 `pickFolder`/`pickFile`(IPC `dialog`). |
| `lib/backend.js` | 전송 분기: `call`, `runJob/followJob`(푸시 vs 폴링), `watchDir`(fs.watch vs mtime 폴링), 클립보드, `pickFolder/pickFile`, `unwrap`(오류 객체 → Error, 스택 결합). **도구 창**: `windowKind/windowId`(URL), `openWindow(kind, args)`(Electron IPC `win:open` / 브라우저 `window.open` + localStorage 인자), `windowArgs()`, `closeWindow()`, `postToApp(msg)`/`onAppMessage(cb)`(IPC 릴레이 / `BroadcastChannel`). |
| `lib/history.js` | 실행 취소/다시 실행 스택(데이터 엔트리만 보관 — 해석은 App). `push`(redo 비움, `max` 까지 유지) · `mark`(되돌릴 수 없는 작업 후 redo 만 비움) · `commitUndo/commitRedo` · `drop`(실패한 엔트리 제거) · 구독. |
| `lib/settings.js` | 설정 기본값·키 목록, `isTextFile(name, exts)`. |
| `lib/images.js` | **이미지**: `IMAGE_EXTS`/`isImageName`(core `IMAGE_TYPES` 와 같은 목록), `decodeImage(readFile 결과, name)` → `{source(<img>|<canvas>), width, height, url, note, details}` — 브라우저가 못 그리는 형식은 렌더러에서 디코딩(동적 import 로 청크 분리): **HEIC/HEIF** `libheif-js/wasm-bundle`(HeifDecoder → ImageData), **DICOM** → `lib/dicom.js`, **TIFF** `utif`(가장 큰 IFD). `renderImage(decoded, rot)` 회전 캔버스, `encodeImage(canvas, png|jpeg|webp|bmp)`(BMP 는 자체 24비트 인코더, JPEG 는 흰 배경 합성), `withExt`. `details` 는 파일 정보 창의 행(i18n 키). |
| `lib/dicom.js` | **DICOM**: `decodeDicom(bytes)` → `{canvas, note, details, dicom}`. `dicom-parser` 로 태그; 픽셀은 전송 구문별 코덱(동적 import, 첫 사용 시 로드·조용히): 비압축 LE/BE(`unpack` 1/8/16/32비트), RLE(자체), JPEG baseline/확장(`@cornerstonejs/codec-libjpeg-turbo-8bit`/`-12bit`, 실패 시 서로 교대), JPEG 무손실(`jpeg-lossless-decoder-js`), JPEG-LS(`@cornerstonejs/codec-charls`), JPEG 2000·HTJ2K(`@cornerstonejs/codec-openjpeg`). 프레임 찾기: Basic Offset Table → 프레임당 fragment 하나 → JPEG 계열은 `createJPEGBasicOffsetTable`. 프레임 샘플은 typed array 로 캐시. `dicom.show({frame, wc, ww, invert})` 가 창(리스케일 → 윈도우 → 0..255, MONOCHROME1 반전)·RGB/YBR·팔레트로 캔버스를 다시 그림; `fileWindows`(여러 창 + 설명), `range`, `presets`(CT 프리셋) 를 UI 에 제공. |
| `lib/exif.js` | JPEG APP1 EXIF 리더(IFD0·Exif IFD·GPS IFD; 카메라·렌즈·노출·촬영 일시·방향·GPS) → `exifRows`. |
| `lib/fileinfo.js` | `describeContent(fs.info 결과)` → 파일 정보 창 "내용" 행: `archive.describe`, `fs.readFile` 한 번으로 이미지(`decodeImage` + EXIF/DICOM/TIFF details)·텍스트(인코딩·줄/단어/글자·줄 끝·가장 긴 줄)·이진(앞 16바이트 시그니처). |
| `components/MediaView.jsx` | 동영상·오디오 창: `<video>`/`<audio>`(브라우저 컨트롤, autoplay) `src = mediaUrl(path)`(`lib/media.js`: 데스크톱 `cc-media://file/?p=`, 웹 `/api/media?path=&token=`), `loadedmetadata` → 해상도·길이·크기·MIME 을 footer 로(`onInfo`), `error.code 4` → "지원되지 않음" 표시, Space/←/→/M. `ViewerDialog` 가 `data.kind === 'media'` 면 렌더(줄 바꿈·16진수·인쇄·편집 버튼 없음); `kind === 'pdf'`(core `DOC_TYPES`) 는 `<iframe class="pdf-frame" src={mediaUrl(path)}>` — 호스트의 PDF 뷰어(cc-media:// / /api/media 가 `application/pdf` 로 스트리밍). |
| `components/ImageView.jsx` | 뷰어(F3)와 미리 보기 창의 그림 창: 확대/축소(Ctrl+휠 커서 기준·단계 표·맞춤은 실제 배율로 계산(ResizeObserver)·확대 안 함)·드래그 이동·회전·인쇄(회전 반영 PNG → `lib/print.js`)·클립보드 복사(`clipboard.writeImage` / `navigator.clipboard`)·다른 형식 저장(`encodeImage` → 데스크톱 `dialog saveFile` + `fs.writeBytes`, 웹 다운로드)·우클릭 ContextMenu. DICOM 이면 두 번째 막대(프레임 ◀▶/슬라이더/←→, 윈도우 프리셋 select·C/W 입력·반전·초기화, Ctrl/가운데 드래그 = 창 조절) — `applyDicom` 은 한 번에 하나만 그리고 그 사이 요청은 합쳐 마지막 것만 적용. `ref.print()` 로 호스트가 Ctrl+P 를 넘김. |
| `components/ResizeGrip.jsx` | 우측 하단 크기 변경 마커(`win:size`/`win:resize`): 메인 창 상태줄과 모든 크기 조절 가능한 도구 창(ToolWindow; 설정·정보 창 제외). |
| `dialogs/InfoDialog.jsx` | **파일 정보**(Alt+Enter, 우클릭 › 파일 정보 보기): `fs.info` + `describeContent` + `fs.hash`(버튼) 를 섹션(일반·시간·권한/속성·내용·해시)으로. 별도 창(`?win=info`)일 때 내용을 잰 뒤 `fitWindow` 로 창 높이를 맞춰 **스크롤 바 없음**(내용·해시가 바뀔 때마다). |
| `lib/printdoc.js` | **인쇄 문서**(순수 함수, `test/print.test.mjs`): `PAPERS`(mm) · `MARGIN_PRESETS` · `PRINT_SETUP_DEFAULTS` · `normalizeSetup`(여백 프리셋/직접 mm, 배율 25~200 clamp) · `contentSizeMm`(인쇄 영역) · `parsePageRanges("1-3, 5, 8-")` → `[{from,to}]`(0 기반) · `canPrintData` · `buildPrintHtml({title, kind, text|base64, wrap, fontSize, tabSize, meta, setup})` — 앱 테마와 무관한 자체 완결 HTML: `@page { size: <용지> <방향>; margin: <mm> }` + `body { zoom }` + 선택적 머리글 + 흑백 필터. |
| `lib/print.js` | printdoc 재수출 + 호스트 경로: `printDocument({html, title, options})` — 데스크톱은 `commandCenter.printHtml`(`options.deviceName` 이 있으면 조용히 그 프린터로, 없으면 시스템 대화상자), 웹은 숨은 `<iframe srcdoc>` 의 `window.print()`; `printPreviewPdf` → `{pdf, pages}`(데스크톱만, 웹은 null); `listPrinters`. 그 밖의 파일은 App 이 확인 후 `fs.print`(OS 인쇄)로 넘깁니다. |
| `dialogs/PrintDialog.jsx` | **인쇄 창**(`dialogs.print({doc, setup, onError})`; 뷰어·편집기·그림 창은 자기 안에 직접 렌더): 왼쪽 페이지 설정(프린터·용지·방향·여백·배율·글꼴·줄 바꿈·머리글·흑백·매수·페이지 범위), 오른쪽 미리보기 — 설정이 바뀌면 250 ms 뒤 `buildPrintHtml` → 데스크톱은 `printPreviewPdf` 의 PDF 를 blob URL 로 `<iframe>`(Chromium PDF 뷰어, `#toolbar=0`), 웹(또는 PDF 실패)은 같은 HTML 을 인쇄 영역 폭의 `<iframe srcdoc>` 에 넣고 `scrollHeight` 로 쪽 수를 세어 쪽 경계를 그림(용지 폭에 맞춰 `transform: scale`). 인쇄 = `printDocument` 에 같은 HTML + `{deviceName, copies, pageRanges, paper, landscape, color}`; 설정은 `session.printSetup`(+ `printFontSize`)에 저장. |
| `lib/prompt.js` | **프롬프트 테마 모델(oh-my-posh 호환)**: 설정 형식은 oh-my-posh JSON 과 같은 `blocks[].segments[]`(type · style · foreground/background(+`_templates`) · template · properties · palette). Go 템플릿 부분집합 엔진(`renderTemplate`: 필드, if/else if/else, gt/lt/eq/ne/and/or/not, 파이프 date/upper/lower/default/trunc), `formatPath`(oh-my-posh 경로 스타일 전부), `segmentContext`(종류별 변수 — git 은 `.HEAD .BranchStatus .Working .Staging .StashCount …`), `renderPrompt(config, state, theme)` → 블록/세그먼트(텍스트·색), `importOmp`/`exportOmp`, 프리셋 16종, 미리보기용 `SAMPLE_STATES`. 순수 모듈이라 `test/prompt.test.mjs` 가 node 로 직접 검사. |
| `lib/i18n.js` | ko/en 사전 + `t()` + `useLanguage()`(useSyncExternalStore). |
| `lib/ansi.jsx` | ANSI SGR → 스타일 런(`parseAnsi`)과 `AnsiText`(MyEditor 와 동일): 16/256/24-bit 색, 굵게·흐리게·기울임·밑줄·반전·취소선. |
| `lib/format.js` | 크기/종류 표시, 경로 분리자(백엔드에서 받음), breadcrumb 분해, `globToRegExp`(`*.txt;*.md`). |
| `themes.js` | 30 테마(다크 15 · 라이트 15) + **사용자 정의 테마**(`setCustomThemes(session.customThemes)` 로 등록 → `allThemes()/themeById/nextThemeId` 가 함께 봄; `baseColorsOf` 로 기존 테마의 기본 색을 복제) 토큰 → `:root` CSS 변수(`applyTheme`), 순환(`nextThemeId`). |
| `styles.css` | 변수 기반 스타일(기본값 = 미드나이트). |

### 터미널 UI (`BottomDock.jsx` 의 `TerminalView`)

- 기록(`<pre>`)은 `cmd`(그 순간의 cwd·git + 입력한 줄) / `out`(셸 출력) 항목 배열로, 10,000줄을 넘으면 앞에서 잘라냅니다. 탭 객체(`term.buffer/seq/git/idle`)에 보관하므로 탭 전환·패널 숨김 후에도 그대로입니다.
- 기록 끝에 **프롬프트**(`TermPrompt` → `components/Prompt.jsx`, 테마는 `session.prompt`): 기본 프리셋은 경로 세그먼트(`--accent`) + git 세그먼트(배경 `auto` = 상태색: conflict `#D62828` > staged `#FFD700` > modified `#FF5C5C` > ahead `#FFD700` > behind `#7cc4ff` > uptodate `#7CFC8B`; 추적 안 함은 색에 영향 없음, 기호 ↑ ↓ + ~ ? !). 프롬프트 상태에는 cwd · git · `rc`(마지막 명령 종료 코드, 마커에서) · `ms`(명령 전송 → idle 복귀 시간) · 사용자/호스트/OS(`app.info`) · 셸이 들어가며, 기록의 `cmd` 항목은 그 순간의 값을 보관해 같은 모양으로 다시 그립니다. 개수는 툴팁에.
- 프롬프트 바로 뒤에 `inline-grid` 로 값 너비만큼 늘어나는 `<input>`(`::after` 가 값을 거울처럼 그려 폭을 정함) — 네이티브 캐럿과 IME 를 그대로 씁니다. 출력을 클릭하면(선택 중이 아닐 때) 입력으로 포커스.
- 탭이 보일 때만 읽습니다: `term.read` 롱폴링 루프(`wait` 1.5 s) — 출력·idle 변화·종료가 생기는 즉시 답이 옵니다. `idle` 이 아니면 프롬프트를 숨기고 Enter 는 실행 중 프로그램의 stdin 으로 갑니다(백엔드가 판단). git 상태는 명령이 끝났을 때(idle 복귀, `cmdSentRef`)와 cwd 가 바뀔 때 `git.status` 로 다시 읽습니다 — MyEditor 와 같이, 폴더의 첫 조회만 프롬프트를 기다리게 하고(`gitReady`; 그동안 `.term-live.pending` 의 `opacity:0` 으로 숨김 — `visibility:hidden` 은 포커스를 빼앗으므로 쓰지 않음), 이후엔 마지막 상태로 즉시 그린 뒤(`stale`) 새 상태가 다르면 색만 바뀝니다; 늦게 온 옛 조회는 seq 로 버립니다. 명령이 끝나면 포커스가 비어 있을 때 입력으로 되돌립니다. 기록(`transcript`)은 `useMemo` 로 묶어 키 입력마다 다시 그리지 않고, 출력은 `AnsiText` 로 ANSI 색을 살려 그립니다.
- Tab → `term.complete`: 후보가 하나면 삽입(파일·명령 뒤엔 공백, 폴더 뒤엔 없음), 여럿이면 공통 접두사, 더 없으면 패널 폭에 맞춰 열로 나열. ↑↓ 기록(편집 중이던 줄 보존), Ctrl+L / `clear` / `cls`, Esc, 여러 줄 붙여넣기(줄마다 실행), 선택이 있을 때 Ctrl+C 는 복사.

## 6. 빌드·패키징

- `vite build` → `dist/` (`base: './'` 로 file:// 와 임의 경로 서빙 모두 지원). 이미지 디코더는 `import()` 로만 참조되어 **별도 청크**로 나옵니다 — `wasm-bundle`(libheif, ~2 MB) · `openjpegjs_decode`(~550 KB) · `charlsjs_decode` · `libjpegturbojs_decode` · `libjpegturbo12js` · `lossless` · `dicomParser` · `UTIF` · `dicom` — 앱 본체(~430 KB)는 그대로이고, 해당 형식을 처음 열 때만 내려받습니다(빌드의 chunk-size 경고는 이 청크들 때문이며 의도된 것).
- electron-builder: `files` 에 `core/`·`electron/`·`dist/`·`build/icons/`; `asarUnpack` 에 `core/bzip2-worker.js` 와 `compressjs`(워커는 asar 밖에서만 로드 가능). `extraResources` 로 `build-info.json`.
- Windows NSIS: `build/installer.nsh` — 바로가기 선택 페이지, 이전 설치 완전 삭제, 남은 데이터 삭제 여부 질문. 설치/제거 프로그램 아이콘도 앱과 같은 `icon.ico`.
- Linux deb: `after-install.sh` (desktop DB·아이콘 캐시 갱신, chrome-sandbox setuid).
- `scripts/generate-icons.mjs`: sharp 로 SVG → PNG(16~1024), `ico.mjs` 로 ICO/ICNS 컨테이너 생성. `scripts/generate-tool-icons.mjs`: 도구 창 제목줄 아이콘(Icons.jsx 의 경로를 64px PNG 로, `assets/tool-icons/`, 커밋 대상).
- `package.json` 의 `prestart`/`predev`/`prebuild*` 는 `npm run …` 을 겹쳐 부르지 않고 `node scripts/…` 를 바로 이어 붙입니다(npm 프로세스 하나가 ~250 ms — 세 번이면 그만큼 `npm start` 가 늦어집니다). `free-port.mjs` 는 먼저 그 포트에 붙어 보고, 아무도 안 듣고 있으면 — 거의 매번 그렇습니다 — 머신의 모든 연결을 훑는 `netstat -ano`/`lsof` 를 아예 건너뜁니다(Vite 는 `::1`, 다른 서버는 `127.0.0.1` 에 붙으므로 둘 다 시도).
- `scripts/start-electron.mjs`: `ELECTRON_RUN_AS_NODE` 를 지우고 Electron 실행. 개발 모드(`ELECTRON_DEV=1`, `npm start`)에서는 `core/`·`electron/` 을 감시해 파일이 바뀌면 Electron 을 다시 띄웁니다 — Vite 는 렌더러만 갱신하고 메인 프로세스(터미널 백엔드·IPC·preload)는 재시작해야 반영되기 때문.

## 7. 테스트

- `test/archive.test.mjs`: 세 형식 왕복(한글·긴 이름·심볼릭 링크 포함), 분할/결합, 취소 시 잔여 파일 없음, 확장자 헬퍼.
- `test/fsops.test.mjs`: 목록 메타데이터, 충돌(건너뛰기/덮어쓰기/모두 적용), 이동·자기 자신 안으로 이동 금지, 취소, mkdir/생성/이름 바꾸기/삭제, 검색, API 디스패치·세션.
- `test/terminal.test.mjs`: 셸 목록, 세션 왕복(한글 echo, `cd` 후 cwd·`idle` 갱신, 마커 누출 없음, 실행 중 프로그램에 입력, 변수 유지, Tab 완성(파일/명령), 증분 읽기, kill), git 상태(저장소/비저장소), `term.*`/`git.status` 디스패치, 롱폴링(타임아웃까지 대기 / 명령에 즉시 깨어남)과 `shutdown`.
- `test/fsops.test.mjs` 에 추가: `renameMany`(맞바꾸기, 기존 파일/중복 거부, 롤백 후 임시 파일 없음), `readFile`(BOM·UTF-16·이진·이미지)/`writeText`, `transfer` 의 항목별 결과.
- `scripts/smoke.mjs`: 실제 Electron 을 별도 프로필로 띄워 스크린샷(`--scenario context|compress|search|about|light_en|delete|themes|error|theme_*|terminal|log|settings_terminal|menu_*|viewer|multirename|compare|undo|preview|fileinfo`), `--script <js> --name <n>` 으로 임의 시나리오, `--tool-script <js>` 로 시나리오가 연 도구 창 안에서 실행(창은 `<name>-<kind>.png` 로 캡처), `--probe <js>` 로 마지막에 메인 창 상태를 출력, `--web` 이면 웹 서버를 띄우고 preload 없는 창으로 브라우저 모드를 캡처. 실행 취소·다중 이름 바꾸기·별도 창·즉시 적용 설정은 이 조합으로 검증했습니다(`undo` 시나리오: 새 폴더 → 이름 바꾸기 → 되돌리기 ×2 → 다시 실행).

- `test/print.test.mjs`: 인쇄 문서(페이지 설정 정규화·인쇄 영역·페이지 범위·`@page`/zoom/머리글/흑백 HTML).
- `test/samples.test.mjs` + **`samples/`**(커밋됨, `scripts/generate-samples.mjs` 가 생성: sharp 로 PNG·JPEG·WebP·TIFF·AVIF, 자체 인코더로 애니메이션 GIF(LZW)·BMP·ICO·WAV, Electron MediaRecorder 로 WebM 동영상/Opus 오디오; HEIC(nokiatech C003)·MP4·DICOM(pydicom: CT·JPEG 2000·RGB·10 프레임 MR·30 프레임 YBR)은 그대로 커밋): 모든 샘플의 `readFile` 분류(image/media, media 는 읽지 않음), DICOM 파싱·프레임 수, sharp 디코딩 크기·GIF 6 프레임, 파일 시그니처, 그리고 웹 서버를 띄워 `/api/media` 의 200/206(Range)/HEAD/416/415/404 와 MIME.
- **샘플 렌더링 확인**: `npm run smoke -- --scenario samples` — samples/ 의 모든 파일을 앱 내 뷰어로 차례로 열어 이미지는 `<img>` 크기, DICOM 은 프레임 막대와 ⊞ 시트의 셀 수, 동영상·오디오는 `readyState`·길이·재생 여부를 파일별로 출력(마지막에 10 프레임 DICOM 시트를 캡처). 그 밖의 DICOM 전송 구문(RLE·JPEG-LS·12비트 …)은 `.smoke/images/`(gitignore)에 pydicom 파일을 두고 `npm run smoke -- --left <그 폴더> --script <클릭 스크립트> --tool-script <창 안 스크립트>` 로 미리 보기 창(프레임 이동·프리셋 선택)과 파일 정보 창(해시 계산·스크롤 없음)을 캡처해 확인했습니다. 네이티브 인쇄 대화상자는 자동화할 수 없어 `webContents.print` 호출까지만 smoke 로 확인합니다(대화상자가 열리면 `app.quit` 이 막혀 smoke 는 타임아웃으로 끝남).

## 8. 설계 메모

- **왜 자체 tar 인가**: 네이티브 의존성 없이 Electron/서버에서 동일하게 동작하고, GTK 판(libarchive)과 서로 읽을 수 있어야 하기 때문.
- **왜 bzip2 는 워커인가**: `compressjs` 는 동기·바이트 단위라 메인 프로세스에서 돌리면 IPC 가 멈춤.
- **왜 분할 첫 조각이 `.zip`/`.tgz` 인가**: GTK 판의 규칙을 그대로 따라 두 프로그램이 서로의 분할 파일을 해제할 수 있게 함(7-Zip 순서와 다름 — README 의 `cat` 안내 참고).
- **왜 짧은 대화상자는 앱 내부 모달이고 도구는 별도 창인가**: 프롬프트·확인·충돌·진행률·오류는 순간적이라 앱 안 모달이 가장 빠르고 웹에서도 같습니다. 반면 뷰어·편집기·다중 이름 바꾸기·검색·설정은 오래 열어 두고 옮기거나 여러 개 띄우는 도구라 **독립 창**으로 만들었습니다(요구 사항: 앱에 종속되지 않고 위치·크기를 바꿀 수 있되 앱과 함께 종료). 같은 번들을 `?win=` 으로 띄우고 창 간 메시지 버스로 메인 창의 상태(패널 새로고침·실행 취소 기록·설정)를 맞추므로, 데스크톱(BrowserWindow)과 웹(팝업) 모두 같은 코드입니다. 설정에서 끄면 예전 방식(앱 내 대화상자)으로 돌아갑니다.
- **왜 이미지 디코딩은 렌더러에서 하는가**: 코어는 파일을 base64 로 넘기기만 하고 HEIC·DICOM·TIFF 는 브라우저 쪽 WebAssembly/JS 코덱이 풉니다. 그래야 데스크톱과 웹이 같은 코드로 같은 그림을 보이고, 코어에 네이티브 의존성(sharp 의 HEIF 는 특허 문제로 prebuilt 에 없음)이 붙지 않습니다. 코덱은 `import()` 로 첫 사용 때만 로드해 앱 본체 크기를 지킵니다.
- **왜 미리 보기 창은 QUIET(비활성 표시·부모 창)인가**: 목록 클릭마다 열리는 창이 포커스를 가져가면 키보드 탐색이 끊깁니다. `showInactive()` 로 띄우고 재요청 때 `focus()` 하지 않되, 그러면 다음 클릭에서 메인 창 뒤로 숨으므로 메인 창의 자식(`parent`)으로 두어 항상 위에 머물게 합니다.
- **왜 파일 정보 창은 스크롤 대신 `fitWindow` 인가**: 내용(이미지 태그·해시)에 따라 높이가 달라지므로 고정 크기면 스크롤이 생기거나 빈 공간이 남습니다. 설정 창과 같은 방식으로 내용을 재고 창 높이를 맞추면(화면 안에서) 항상 스크롤 없이 전부 보입니다.
- **왜 DICOM 은 창(window)을 다시 그리는 함수로 돌려주는가**: 윈도우/레벨 조절과 프레임 이동은 픽셀 디코딩과 무관하므로, 프레임 샘플을 typed array 로 캐시해 두고 `show()` 로 0..255 변환만 다시 합니다. 드래그 중에는 한 번에 하나만 그리고 그 사이 요청을 합쳐 마지막 것만 적용해 밀리지 않습니다.
- **왜 실행 취소 엔트리는 데이터인가**: 클로저를 저장하면 오래된 React 상태를 붙잡습니다. `{kind, paths…}` 만 저장하고 실행 시점의 App 함수가 해석하며, `fsops.transfer` 가 항목별 `existed` 를 돌려주므로 덮어쓰기/병합된 항목은 애초에 기록하지 않습니다.
- **왜 설정이 즉시 적용되는가**: 사용자 요구. `SettingsDialog` 가 변경마다 `onChange` 를 부르고 App 이 조용히 적용·저장, 취소 시 원래 값으로 재적용. 도구 창에서는 같은 흐름이 메시지 버스를 탑니다.
- **왜 터미널이 pty 가 아닌가**: `node-pty` 는 네이티브 모듈이라 세 OS × Electron/Node ABI 마다 빌드가 필요하고 웹 서버 쪽도 무거워집니다. 파일 관리자에서 필요한 것은 `git`·`npm`·`dir` 같은 줄 단위 명령이므로 파이프 stdio 로 충분하고, 대신 전체 화면 프로그램과 Ctrl+C 중단은 포기했습니다. 프롬프트·입력·Tab 완성은 MyEditor 의 터미널 패널과 같은 방식이며, 명령을 스크립트 파일로 source 해 stdin 을 비워 두므로 실행 중 프로그램과의 줄 단위 대화도 됩니다. 한글 입력은 Windows 셸마다 다른 우회(2장 "터미널 흐름")로 해결.
- **오류 전달**: 백엔드 → `serializeError`(code/path/syscall/stack) → `unwrap` 이 렌더러 Error 로 재구성(스택 두 프로세스 결합) → `describeError` → 팝업 + 복사.
