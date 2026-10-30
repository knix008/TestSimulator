# My FTP Client — 아키텍처

`FTPClientWinV10`(C# WinForms, FluentFTP + SSH.NET) 을 하나의 JavaScript 코드베이스로 옮겨 Windows·macOS·Linux 데스크톱(Tauri 2)과 웹(브라우저 + Node 서버)에서 같은 UI 를 실행합니다. 두 호스트 모두 같은 Node 코어를 같은 HTTP API 로 부릅니다.

```
UI (src/, React)                                   doc/ (사용 설명서, 별도 창)
  App.jsx · Toolbar · ConnectionBar                  index.html · manual.css/js · img/
  RemotePanel · TransferBar · LocalTree
  LogPanel(+터미널) · StatusBar
  Dialogs / DialogWindow (분리 창)
  lib/backend.js  ← 호스트 판별 (__TAURI_INTERNALS__)
     │                                   │
     │ invoke: 코어 주소, 창 버튼,        │ fetch POST /api/<name> + 폴링
     │ 대화상자·설명서 창, 클립보드,      │ (데스크톱: 루프백 빈 포트 + 토큰,
     │ 폴더 선택                          │  웹: 같은 출처)
     ▼                                   ▼
  src-tauri/ (Rust, Tauri 2)  ──spawn──▶ server/server.js (node:http)
    main.rs      창 · 위치 저장             정적 dist/ · --host/--port/--token
    nodecore.rs  코어 실행·종료             CORS (tauri.localhost) · app.shutdown
    dialogs.rs   대화상자 · 설명서 창            │
                                                 ▼
                 ┌────────────────┐
                 │ core/api.js    │  하나의 메서드 표 (JSON in/out)
                 ├────────────────┤
                 │ remote.js      │  FTP/FTPS(basic-ftp) · SFTP(ssh2)
                 │ transfer.js    │  폴더 재귀 전송, 동시성, 충돌
                 │ connections.js │  연결 레지스트리
                 │ local.js       │  드라이브/폴더, mkdir/rename/delete
                 │ jobs.js        │  진행률·취소·충돌 대기
                 │ terminal.js    │  로컬 셸 세션 · 원격 SSH PTY
                 │ shells.js      │  설치된 셸 목록 · one-shot spawn
                 │ complete.js    │  Tab 자동완성 (명령·경로)
                 │ prompts.js     │  셸별 프롬프트 템플릿
                 │ term-color.js  │  목록/출력 ANSI 색
                 │ fonts.js       │  시스템 글꼴 목록
                 │ encoding.js    │  콘솔 한글 디코드 · CLIXML 제거
                 │ profiles.js    │  profiles.json
                 │ session.js     │  session.json
                 │ history.js     │  history.json
                 │ shell.js       │  열기 · 탐색기에서 보기 (데스크톱)
                 └────────────────┘
```

## 1. 계층

### core/ — 플랫폼 무관, Node 전용
UI 프레임워크를 전혀 참조하지 않습니다. 웹 서버와 데스크톱(같은 서버를 Tauri 가 띄움)이 **같은 코드**를 씁니다.

| 파일 | 역할 |
|------|------|
| `api.js` | `createApi(host)` → `{ call(name, args) }`. `app.*`, `local.*`, `remote.*`, `transfer.*`, `profiles.*`, `jobs.*`, `session.*`, `terminal.*`. 호스트는 `openPath / revealPath / pickFolderInUi / detachedDialogs` 같은 네이티브 기능 여부만 주입. `serializeError` 로 오류를 `{code, message, path, stack}` 으로 직렬화 |
| `remote.js` | `createClient({protocol, host, port, user, password})` → `FtpClient` 또는 `SftpClient`. 공통 메서드: `connect(signal)`, `close()`, `list(dir)`, `exists(p)`, `mkdir`, `ensureDir`, `rename`, `removeFile`, `removeEmptyDir`, `download`, `upload`. 원격 경로는 항상 절대 POSIX 경로 |
| `transfer.js` | `download` / `upload` / `removeRemote`. 1) 계획 2) 동일 파일 건너뛰기 3) 연결 풀(1–4)로 파일 전송. 대상 존재 시 `job.askConflict()` |
| `connections.js` | 연결을 id 로 관리. `connect(opts, job)` 은 잡 안에서 실행되어 UI 가 "연결 중…" 과 취소를 보여 줌 |
| `local.js` | 드라이브 목록(Windows: PowerShell `Win32_LogicalDisk` 로 볼륨 이름, 60초 캐시), 폴더 나열, mkdir/rename/delete, `walk` |
| `jobs.js` | `Job`: 진행률·속도·충돌·파일별 `notes`. 33ms 로 업데이트 병합. 끝난 잡은 60초 보관 |
| `terminal.js` | `LocalSession`(앱이 프롬프트·에코·줄 편집을 소유, 한 줄마다 `cmd /c` · `powershell -Command` · `bash -c`)와 `RemoteSession`(SFTP 연결의 ssh2 PTY). 최대 8 세션 |
| `shells.js` | 설치된 셸 검색(Windows: cmd, PowerShell, pwsh, Git Bash, MSYS2, Cygwin, WSL, fish, nu). `buildShellSpawn` 이 one-shot argv 를 만듦 |
| `complete.js` | Tab: 첫 토큰은 명령, 이후는 경로. 최장 공통 접두사 → 두 번째 Tab 에서 후보 목록 |
| `prompts.js` | 셸별 기본 프롬프트와 `{path}` `{folder}` `{shell}` `{user}` `{host}` `{name}` 치환. 경로 스타일: windows / msys `/d/` / cygdrive / wsl `/mnt/` |
| `term-color.js` | 파이프에는 TTY 가 없으므로 `FORCE_COLOR` + `dir`/`ls`/`gci` 가로채기 + 줄 단위 색칠. 셸마다 팔레트가 다름 |
| `fonts.js` | Windows `InstalledFontCollection`(레지스트리 폴백). `sanitizeFontName`, `clampFontSize` |
| `encoding.js` | 콘솔 바이트 → UTF-8 / CP949. PowerShell `#< CLIXML` 제거 |
| `profiles.js` | `[{name, protocol, host, port, user, password}]`. 비밀번호는 `b64:` 접두 base64 (난독화이지 암호화 아님) |
| `history.js` | `history.json`: 연결 성공마다 `{protocol, host, port, user, lastAt, count}` 최신순 20개, 비밀번호 없음 |
| `shell.js` | 데스크톱 전용: 기본 앱으로 열기, 파일을 선택한 채 폴더 보기 (Windows `explorer /select,`, macOS `open -R`, Linux `xdg-open`) |
| `session.js` | `lastLocalPath, lastProfile, language, theme, fontSize, terminalFont, terminalFontSize, terminalStartDir, shellPrompts, terminalMaxLines, transferConcurrency, skipUnchanged, windowBounds, …` |

### src-tauri/ — 데스크톱 셸 (Rust, Tauri 2)
- `main.rs` — **프레임리스 창**(`decorations: false`, 최소 1200×720). 창을 만들기 전에 `session.json` 의 `themeBg`·`windowBounds` 를 창 설정에 넣어 흰 화면·위치 점프가 없습니다. 이동/크기 변경을 추적하고, 닫을 때 코어의 `session.save` 로 위치를 저장합니다(최대화 상태면 직전 일반 크기). 단일 인스턴스(두 번째 실행은 기존 창 포커스). `MFC_CONFIG_DIR` 이면 별도 프로필 + 별도 WebView2 데이터, 단일 인스턴스 해제(테스트).
- `nodecore.rs` — 코어를 **첫 순간 별도 스레드**에서 띄웁니다: `node server/server.js --port <빈 포트> --token <난수> --parent-pid <셸 pid> --config <설정 폴더>`, `MFC_HOST_NAME=tauri`. `app.info` 가 응답할 때까지 기다린 뒤 `host_config` 명령이 `{origin, token}` 을 페이지에 줍니다. 디버그 빌드는 소스 트리(`server/`)를, 릴리스는 `resources/runtime/`(번들된 `node.exe` + esbuild 한 파일 `server.js`)를 실행합니다. Tauri 의 리소스 경로는 `\\?\C:\…` 형태라 Node 가 못 읽으므로 `plain_path` 로 바꿉니다. 종료 시 `app.shutdown` 후 프로세스를 정리하고, 셸이 비정상 종료되면 코어가 `--parent-pid` 감시로 스스로 끝납니다.
- `dialogs.rs` — 팝업을 **별도 웹뷰 창**으로 엽니다(같은 `index.html`, `window.__MFC_DIALOG__` 로 대화상자 이름 전달). 여는 창이 `parent`(같이 닫힘)지만 모달은 아니어서 메인 창 밖·다른 모니터로 이동 가능. 모두 `resizable(false)`·`decorations(false)`. 설정은 `fit: false`(540×520 고정), 나머지는 `dialog_set_size` 로 내용에 맞춤. 결과는 여는 창에 `dialog:result` 이벤트로, 닫힘은 `dialog:closed`. 테마 변경은 `broadcast_appearance` → 모든 창에 `dialog:appearance`. `manual_open` 은 **사용 설명서**(`doc/index.html`)를 parent 없는 독립 창(크기 조절 가능)으로 엽니다.
- `windows/hooks.nsh` — NSIS 설치 훅: 언어 선택 후 기존 설치(Electron 판 uninstall 키 `98cf3d3c-…` 또는 Tauri 판) 감지 → 삭제 후 설치 확인, 이전 데이터 삭제 여부, 바로가기 페이지.
- `capabilities/default.json` — 창 제어, 이벤트, `dialog:allow-open`(폴더 선택), 클립보드 읽기/쓰기.

### server/server.js
`node:http` 만 사용. `POST /api/<name>` (JSON) 과 `dist/` 정적 파일. 기본 127.0.0.1:5188, `--host 0.0.0.0` 이면 `--token` 권장(Bearer 또는 `?token=`). 잡과 터미널 출력은 클라이언트가 폴링(`jobs.get` 150ms, 충돌 대기 중 400ms). 데스크톱 호스트(`MFC_HOST_NAME=tauri`)일 때는 `core/shell.js` 의 열기/보기를 켜고, 페이지(`http://tauri.localhost`, 루프백 개발 서버)가 다른 출처에서 부르므로 그 출처에만 **CORS** 를 허락합니다. `app.shutdown` 은 응답 후 연결을 정리하고 종료합니다.

### doc/ — 사용 설명서
`index.html`(한/영 본문, `section` 마다 `h2`·`h3`), `manual.css`, `manual.js`, `img/*.png`(smoke 가 실제 창에서 찍은 그림). Vite 가 개발 중에는 `/doc/` 로 제공하고 빌드 때 `dist/doc` 로 복사합니다. CSP 때문에 스크립트·스타일은 별도 파일입니다. `manual.js` 가 왼쪽 목차(현재 언어의 제목으로 구성, 스크롤 위치 표시), 언어 버튼, 글자 크기 − / Npx / +(가운데 정렬, 10–24px, 기억), 데스크톱 창 버튼·드래그·크기 조절을 맡습니다. 테마는 앱의 CSS 변수 그대로: 데스크톱은 `window.__MFC_DOC__`(초기)와 `dialog:appearance` 이벤트, 브라우저는 `localStorage['mfc-doc-appearance']` 와 `storage` 이벤트.

### src/ — React UI
| 파일 | 역할 |
|------|------|
| `App.jsx` | 상태·액션의 중심. 연결/해제, 전송, 프로파일, 설정/테마/언어, 터미널 글꼴 스테퍼. `window.__mfc` 자동화 훅 |
| `DialogWindow.jsx` | `window.__MFC_DIALOG__`(또는 `#dialog=<name>`)의 대화상자 컴포넌트를 분리 창에 그림. 설정은 창을 채우고(첫 페인트 전에 `dialog-fixed`), 나머지는 `dialog_set_size` 로 맞춤 |
| `components/Toolbar.jsx` | 타이틀바 대체: 프로파일 · **터미널 보기** · **글꼴 − / Npx / +** · 테마 · 언어 · 설정 · **설명서** · 정보 · 창 버튼(`.tb-main` 밖에 고정). 창 최소 크기 1200×720 |
| `components/ConnectionBar.jsx` | 접속 폼 + 🕘 히스토리. Host URL 은 `parseHostInput` 이 분해 |
| `components/StatusBar.jsx` | 상태 + 진행률 + 취소 + SizeGrip(누르면 `startResizeDragging`) |
| `components/RemotePanel.jsx` | 서버 평면 목록 + `[..]`, 다중 선택, 키보드 탐색 |
| `components/LocalTree.jsx` | 지연 로딩 트리. `expandTo(path)` 로 시작 폴더 복원 |
| `components/TransferBar.jsx` | ←/→ 버튼 + 드래그 리사이즈 |
| `components/LogPanel.jsx` | 로그 탭 + 터미널 탭(+ 셸 고르기, 탭 좌우 이동). 터미널 보기일 때만 `+` |
| `components/TerminalView.jsx` | xterm.js + FitAddon. `onData` → `terminal.write`. 수평 스크롤 숨김 |
| `dialogs/Dialogs.jsx` | Promise 기반: prompt · confirm · message/error · conflict · profileDelete · about · settings. 데스크톱은 `openDetachedDialog` |
| `dialogs/SettingsDialog.jsx` | 일반 / 터미널 / 전송 탭. 셸 드롭다운 + 프롬프트 한 줄. `fill` 로 고정 창을 채움 |
| `lib/backend.js` | 호스트 스위치. Tauri: `host_config` 로 코어 주소·토큰을 받아 fetch, 창 버튼·툴바 드래그(`installWindowDrag`)·크기 조절·폴더 선택(dialog 플러그인)·클립보드(clipboard-manager)·설명서 창. 웹: 같은 출처 fetch. `runJob(name, args, onUpdate)` |
| `lib/dialogWindows.js` | 분리 창 대기열. `serializablePayload` 가 함수를 제거해 직렬화되게 하고, 현재 외관(`appearance.js`)을 함께 보냄 |
| `lib/appearance.js` | 창끼리 공유하는 외관 `{theme, language, fontSize, bg, mode, vars}` |
| `lib/settings.js` | 설정 기본값 · `pickSettingsValues` · `terminalFontStack` |
| `lib/errors.js` | `describeError` / `formatErrorCopy` — 짧은 설명 + 필드 + 기술 정보 |
| `lib/i18n.js` | `t(key, params)`, `useLanguage()` |
| `lib/format.js` | 크기/속도/날짜, 경로 헬퍼, 확장자 → 아이콘 |
| `lib/sound.js` | Web Audio 성공/오류 알림음 |
| `themes.js` | 16개 테마 → CSS 변수 |

## 2. 전송 흐름

```
UI download(items)
  └ runTransfer('transfer.download') ── api ── jobs.run('download')
        │                                        └ transfer.download(client, items, localDir, job)
        │  jobs.get 폴링                                ├ 계획: client.list 재귀 → files[]
        ├ 상태 표시줄: bytes/bytesTotal, speed          ├ skipUnchanged 이면 같은 크기·날짜 건너뜀
        ├ snap.conflict → dialogs.conflict()            ├ 연결 풀(concurrency 1–4)
        │      └ resolveConflict(id, answer, applyAll)  └ 파일마다 download / upload
        └ 최종 snapshot: done | cancelled | error
```

- **FTP** 전송은 basic-ftp 의 `downloadTo / uploadFrom` + `trackProgress`(500ms). 취소는 제어 연결을 닫는 방법뿐이므로 `signal` 이 abort 되면 `close()` 후 **같은 자격으로 다시 접속**합니다. 동시 전송은 파일마다 추가 로그인을 엽니다. basic-ftp 한 연결은 한 명령만 처리하므로 `FtpClient._run` 이 큐로 직렬화합니다.
- **SFTP** 전송은 ssh2 의 `fastGet/fastPut` 대신 자체 파이프라인(`_pump`: 64KB × 32 동시 요청 ≈ 2MB 창)을 씁니다. 취소 가능, 바이트 단위 진행률, 빈 파일 처리.
- 업로드의 존재 검사는 원격 폴더당 한 번의 `list` 를 캐시해 파일마다 LIST 를 보내지 않습니다.

## 3. 터미널 흐름

```
키 입력 (xterm onData)
  → terminal.write
  → LocalSession.write  (에코, 히스토리, Tab → complete.js)
        Enter → _runLine
          ├ cd / cls / dir·ls·gci (가로채서 색칠)
          └ spawn(buildShellSpawn) 한 줄 one-shot
        실행 중에 친 키(Enter·Backspace 포함)는 _typeahead 에 모았다가 다음 프롬프트에서 그대로 재생
  → terminal.read 폴링 → TerminalView.write
```

원격(SFTP) 세션은 바이트를 ssh2 PTY 에 그대로 넘깁니다. Tab 완성은 원격 셸이 담당합니다.

## 4. 오류 처리
모든 실패는 같은 팝업으로 끝납니다: 짧은 설명 + 필드(코드·경로·서버 응답) + 접을 수 있는 기술 정보 + **자세한 내용 복사**. 잡 실패는 `snapshot.error / errorDetail` 로, 즉시 호출 실패는 `{ok:false, error}` → `Error` 로 전달됩니다. 연결 시간 초과는 별도 메시지(30초 안내)로 구분합니다.

팝업은 스크롤바 없이 내용 높이에 맞춰 연 뒤 크기를 잠급니다. 기술 정보를 펼치면 창이 다시 맞춰집니다.

## 5. 테스트

| 명령 | 내용 |
|------|------|
| `npm test` | `test/*.test.mjs` 를 사용자 정의 reporter(`test/reporter.mjs`)로 실행. 파일별 표와 전체 summary. 범위: 프로파일·세션·히스토리·로컬 FS, **FTP/FTPS/SFTP** 왕복, 잡, 오류 문구, 셸 목록, 프롬프트, 색, 글꼴, **Tab 완성**, 터미널(cmd/PowerShell/Git Bash/WSL 등 설치된 셸, 미리 입력), 설정·테마·i18n·고정 팝업, **데스크톱 호스트**(토큰·CORS·`app.shutdown`·`--parent-pid`·창 위치 저장), 열기/보기 명령, 외관 공유, 설명서 구조·그림, Electron 잔재 없음, 설치 훅, `cargo test`(src-tauri) |
| `npm run smoke` | `tauri build --debug --no-bundle` 로 현재 프런트엔드를 넣은 디버그 exe 를 만들고, 별도 프로필(`MFC_CONFIG_DIR=.smoke/profile`)과 WebView2 디버깅 포트로 실행해 CDP(`scripts/cdp.mjs`)로 `window.__mfc` 를 조작: 접속·전송 후 파일 확인, **설정 창**(분리 창, 540×520 을 채우는지), **설명서 창**(메인 테마·언어를 따르는지, 그림이 모두 로드되는지, 목차가 현재 언어만인지). 이어서 웹 서버 + 헤드리스 Edge |
| `npm run smoke -- --scenario <name>` | `main connected transfer conflict error context local_context profile_delete history drives terminal about settings themes light_en theme_nord all` |
| `npm run smoke -- --docs` | 모든 시나리오를 찍어 설명서 그림 `doc/img/*.png` 를 갱신 → 다시 빌드 → 설명서 창 검증 |

내장 테스트 서버: `test/ftp-server.mjs`(`tls: true` 면 explicit FTPS, 자체 서명 인증서 `test/certs/`), `test/sftp-server.mjs`(ssh2 Server API + RSA 임시 호스트 키).

## 6. 빌드·패키징
- `scripts/generate-icons.mjs`: `assets/icon.svg` → `src-tauri/icons/`(32·128·256·512 PNG, `icon.ico`, `icon.icns`; sharp + 자체 ICO/ICNS 인코더).
- `scripts/dev.mjs`: `npm start` = `tauri dev`, Vite 포트는 127.0.0.1·::1 모두 비어 있는 포트(다른 프로젝트의 서버를 재사용하지 않음, `scripts/free-port.mjs`). `npm run dev` = 웹 개발(API 서버 + Vite 프록시).
- `scripts/tauri-before-build.mjs`: 자산 → `scripts/stage-runtime.mjs`(현재 Node 실행 파일 복사 + esbuild 로 `server/server.js`·`core/`·npm 의존성을 한 파일로; ssh2 의 네이티브 선택 모듈 `cpu-features`·`*.node` 는 제외 → 순수 JS 암호화로 동작) → `vite build`(`dist/doc` 포함).
- `tauri build --bundles nsis`: 설치 훅 `src-tauri/windows/hooks.nsh`, 사용자별 설치, 한국어/English. `scripts/copy-installer.mjs` 가 설치 파일을 루트로 복사. macOS DMG, Linux AppImage + deb 도 같은 설정.

## 7. 원본(WinForms) 대비 달라진 점
| 원본 | 이 구현 |
|------|---------|
| 셸 아이콘(`SHGetFileInfo`) | 확장자별 SVG 아이콘 (모든 OS 동일) |
| `Console.Beep` | Web Audio 알림음 (설정에서 끔) |
| 단일 선택 TreeView | 다중 선택(Ctrl/Shift), 키보드 탐색 |
| 덮어쓰기 고정 | 충돌 시 질문(덮어쓰기/건너뛰기/취소 + 전체 적용), 동일 파일 건너뛰기 |
| 진행률 = 상태 표시줄 | 동일 + 속도·바이트·취소, 동시 전송 1–4 |
| 서버/로컬 새 폴더·삭제 없음 | 양쪽 새 폴더·이름 바꾸기·삭제 추가 |
| 터미널 없음 | 설치된 셸 탭, 원격 SSH, Tab 완성, 셸별 색·프롬프트 |
| 모달 대화상자 | 분리된 고정 크기 팝업(웹은 오버레이) |
| 도움말 없음 | 그림이 있는 한/영 사용 설명서(독립 창, 목차·글자 크기·언어) |
| Windows 전용 | Windows · macOS · Linux · 웹, 16 테마, 한/영 |
