# My FTP Client — 아키텍처

`FTPClientWinV10`(C# WinForms, FluentFTP + SSH.NET) 을 하나의 JavaScript 코드베이스로 옮겨 Windows·macOS·Linux 데스크톱(Electron)과 웹(브라우저 + Node 서버)에서 같은 UI 를 실행합니다.

```
┌──────────────── UI (src/, React) ────────────────┐
│ App.jsx  ── ConnectionBar · RemotePanel · LocalTree │
│           · TransferBar · LogPanel(+터미널 탭)     │
│           · Toolbar · StatusBar                     │
│           · Dialogs / DialogWindow (분리된 OS 창)  │
│ lib/backend.js  ← 호스트 판별: window.myFtpClient? │
└───────────┬──────────────────────────┬────────────┘
   IPC (invoke + push)          fetch POST /api/<name> + 폴링
┌───────────▼─────────┐        ┌───────▼──────────────┐
│ electron/           │        │ server/server.js     │
│  main.js · ipc.js   │        │  node:http, 정적 dist │
│  preload.js         │        │  --host/--port/--token│
│  dialogs.js         │        └───────┬──────────────┘
└───────────┬─────────┘                │
            └────────────┬─────────────┘
                 ┌───────▼────────┐
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
                 └────────────────┘
```

## 1. 계층

### core/ — 플랫폼 무관, Node 전용
Electron 을 전혀 참조하지 않으므로 Electron 메인 프로세스와 웹 서버가 **같은 객체**를 씁니다.

| 파일 | 역할 |
|------|------|
| `api.js` | `createApi(host)` → `{ call(name, args) }`. `app.*`, `local.*`, `remote.*`, `transfer.*`, `profiles.*`, `jobs.*`, `session.*`, `terminal.*`. 호스트는 `openPath / revealPath / clipboard` 같은 네이티브 기능만 주입. `serializeError` 로 오류를 `{code, message, path, stack}` 으로 직렬화 |
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
| `session.js` | `lastLocalPath, lastProfile, language, theme, fontSize, terminalFont, terminalFontSize, terminalStartDir, shellPrompts, terminalMaxLines, transferConcurrency, skipUnchanged, windowBounds, …` |

### electron/
- `main.js` — **프레임리스 창**(`frame: false`; 첫 프레임 흰 테두리 방지로 setOpacity(0)→show→50ms 후 1), 단일 인스턴스, 창 위치 저장, `MFC_USER_DATA` 로 별도 프로필, `createApi` 에 `shell.openPath / showItemInFolder / clipboard` 주입, 스모크 훅.
- `ipc.js` — `ipcMain.handle('api')` 로 `api.call` 을 노출하고 `job:update` · `terminal:data` 를 렌더러로 푸시. 창 제어: `win:control`, `win:isMaximized`, `win:getSize`/`win:setSize`.
- `preload.js` — `window.myFtpClient = { call, onJobUpdate, onTerminalData, openDialog, … }`. 브리지를 넘는 `Error` 는 `{ok, error}` 로 넘기고 렌더러가 재구성합니다. 함수는 구조화 복제에서 빠지므로 설정 미리보기 콜백은 IPC 로 보내지 않습니다.
- `dialogs.js` — 팝업을 **별도 BrowserWindow** 로 엽니다(`parent` 있으나 `modal: false`, 다른 모니터로 이동 가능). 모든 팝업 `resizable: false`. 설정은 `fit: false`(540×520 고정). 나머지는 내용 높이에 맞춘 뒤 min=max 로 잠급니다.

### server/server.js
`node:http` 만 사용. `POST /api/<name>` (JSON) 과 `dist/` 정적 파일. 기본 127.0.0.1:5188, `--host 0.0.0.0` 이면 `--token` 권장(Bearer 또는 `?token=`). 잡은 클라이언트가 `jobs.get` 을 150ms(충돌 대기 중 400ms) 로 폴링.

### src/ — React UI
| 파일 | 역할 |
|------|------|
| `App.jsx` | 상태·액션의 중심. 연결/해제, 전송, 프로파일, 설정/테마/언어, 터미널 글꼴 스테퍼. `window.__mfc` 자동화 훅 |
| `DialogWindow.jsx` | `#dialog=<name>` 해시에서 같은 대화상자 컴포넌트를 분리 창에 그림. 설정은 창을 채우고, 나머지는 `dialogSetSize` 로 맞춤 |
| `components/Toolbar.jsx` | 타이틀바 대체: 프로파일 · **터미널 보기** · **글꼴 − / Npx / +** · 테마 · 언어 · 설정 · 정보 · 창 버튼. 창 최소 크기 1120×760 |
| `components/ConnectionBar.jsx` | 접속 폼 + 🕘 히스토리. Host URL 은 `parseHostInput` 이 분해 |
| `components/StatusBar.jsx` | 상태 + 진행률 + 취소 + SizeGrip |
| `components/RemotePanel.jsx` | 서버 평면 목록 + `[..]`, 다중 선택, 키보드 탐색 |
| `components/LocalTree.jsx` | 지연 로딩 트리. `expandTo(path)` 로 시작 폴더 복원 |
| `components/TransferBar.jsx` | ←/→ 버튼 + 드래그 리사이즈 |
| `components/LogPanel.jsx` | 로그 탭 + 터미널 탭(+ 셸 고르기, 탭 좌우 이동). 터미널 보기일 때만 `+` |
| `components/TerminalView.jsx` | xterm.js + FitAddon. `onData` → `terminal.write`. 수평 스크롤 숨김 |
| `dialogs/Dialogs.jsx` | Promise 기반: prompt · confirm · message/error · conflict · profileDelete · about · settings. 데스크톱은 `openDetachedDialog` |
| `dialogs/SettingsDialog.jsx` | 일반 / 터미널 / 전송 탭. 셸 드롭다운 + 프롬프트 한 줄. `fill` 로 고정 창을 채움 |
| `lib/backend.js` | Electron IPC ↔ fetch/폴링. `runJob(name, args, onUpdate)` |
| `lib/dialogWindows.js` | 분리 창 대기열. `serializablePayload` 가 함수를 제거해 IPC 복제가 되게 함 |
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
        │  job:update (IPC push / 폴링)                ├ 계획: client.list 재귀 → files[]
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
  → terminal:data 푸시 → TerminalView.write
```

원격(SFTP) 세션은 바이트를 ssh2 PTY 에 그대로 넘깁니다. Tab 완성은 원격 셸이 담당합니다.

## 4. 오류 처리
모든 실패는 같은 팝업으로 끝납니다: 짧은 설명 + 필드(코드·경로·서버 응답) + 접을 수 있는 기술 정보 + **자세한 내용 복사**. 잡 실패는 `snapshot.error / errorDetail` 로, 즉시 호출 실패는 `{ok:false, error}` → `Error` 로 전달됩니다. 연결 시간 초과는 별도 메시지(30초 안내)로 구분합니다.

팝업은 스크롤바 없이 내용 높이에 맞춰 연 뒤 크기를 잠급니다. 기술 정보를 펼치면 창이 다시 맞춰집니다.

## 5. 테스트

| 명령 | 내용 |
|------|------|
| `npm test` | `test/*.test.mjs` 를 사용자 정의 reporter(`test/reporter.mjs`)로 실행. 파일별 표와 전체 summary. 범위: 프로파일·세션·히스토리·로컬 FS, **FTP/FTPS/SFTP** 왕복, 잡, 오류 문구, 셸 목록, 프롬프트, 색, 글꼴, **Tab 완성**, 터미널(cmd/PowerShell/Git Bash/WSL 등 설치된 셸), 설정·테마·i18n·고정 팝업 |
| `npm run smoke` | 실제 Electron 창(별도 프로필 `.smoke/profile`)에서 `window.__mfc` 로 접속·전송을 확인하고 스크린샷 `.smoke/*.png`. 이어서 웹 서버를 5199 포트에 띄워 HTTP API + 브라우저 모드 UI 도 캡처 |
| `npm run smoke -- --scenario <name> [--web]` | `main connected transfer conflict error context local_context profile_delete history about settings themes light_en theme_nord all` |

내장 테스트 서버: `test/ftp-server.mjs`(`tls: true` 면 explicit FTPS, 자체 서명 인증서 `test/certs/`), `test/sftp-server.mjs`(ssh2 Server API + RSA 임시 호스트 키).

## 6. 빌드·패키징
- `scripts/generate-icons.mjs`: `assets/icon.svg` → `build/icons/icon.{ico,icns,png}` + Linux PNG 세트 (sharp + 자체 ICO/ICNS 인코더).
- electron-builder: NSIS(`build/installer.nsh` — 바로가기 선택 페이지, 이전 설치 정리, 이전 데이터 삭제 여부 질문), DMG(x64+arm64), AppImage + deb(`build/linux/after-*.sh`).
- `ssh2` 의 선택 의존성 `cpu-features` 는 네이티브 모듈이지만 없어도 순수 JS 로 동작합니다(npm 12 는 install 스크립트를 차단하므로 `allowScripts` 에 electron/sharp/esbuild 만 허용).
- `scripts/start-electron.mjs` 는 `ELECTRON_RUN_AS_NODE` 를 지운 환경으로 Electron 을 띄웁니다.

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
| Windows 전용 | Windows · macOS · Linux · 웹, 16 테마, 한/영 |
