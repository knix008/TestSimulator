# My FTP Client — 아키텍처

`FTPClientWinV10`(C# WinForms, FluentFTP + SSH.NET) 을 하나의 JavaScript 코드베이스로 옮겨 Windows·macOS·Linux 데스크톱(Electron)과 웹(브라우저 + Node 서버)에서 같은 UI 를 실행합니다.

```
┌──────────────── UI (src/, React) ────────────────┐
│ App.jsx  ── ConnectionBar · RemotePanel · LocalTree │
│           · TransferBar · LogPanel · StatusBar     │
│           · Dialogs(prompt/confirm/error/conflict) │
│ lib/backend.js  ← 호스트 판별: window.myFtpClient? │
└───────────┬──────────────────────────┬────────────┘
   IPC (invoke + push)          fetch POST /api/<name> + 폴링
┌───────────▼─────────┐        ┌───────▼──────────────┐
│ electron/           │        │ server/server.js     │
│  main.js · ipc.js   │        │  node:http, 정적 dist │
│  preload.js         │        │  --host/--port/--token│
└───────────┬─────────┘        └───────┬──────────────┘
            └────────────┬─────────────┘
                 ┌───────▼────────┐
                 │ core/api.js    │  하나의 메서드 표 (JSON in/out)
                 ├────────────────┤
                 │ remote.js      │  FTP/FTPS(basic-ftp) · SFTP(ssh2) 를 같은 인터페이스로
                 │ transfer.js    │  폴더 재귀 전송, 바이트 진행률, 충돌 질문
                 │ connections.js │  연결 레지스트리 (id → client)
                 │ local.js       │  드라이브/폴더 나열, mkdir/rename/delete, walk
                 │ jobs.js        │  진행률·취소·충돌 대기 잡
                 │ profiles.js    │  profiles.json
                 │ session.js     │  session.json
                 └────────────────┘
```

## 1. 계층

### core/ — 플랫폼 무관, Node 전용
Electron 을 전혀 참조하지 않으므로 Electron 메인 프로세스와 웹 서버가 **같은 객체**를 씁니다.

| 파일 | 역할 |
|------|------|
| `api.js` | `createApi(host)` → `{ call(name, args) }`. `app.*`, `local.*`, `remote.*`, `transfer.*`, `profiles.*`, `jobs.*`, `session.*`. 호스트는 `openPath / revealPath / clipboard` 같은 네이티브 기능만 주입. `serializeError` 로 오류를 `{code, message, path, stack}` 으로 직렬화 |
| `remote.js` | `createClient({protocol, host, port, user, password})` → `FtpClient` 또는 `SftpClient`. 공통 메서드: `connect(signal)`, `close()`, `list(dir)`, `exists(p)`, `mkdir`, `ensureDir`, `rename`, `removeFile`, `removeEmptyDir`, `download(remote, local, onBytes, signal)`, `upload(local, remote, onBytes, signal)`. 원격 경로는 항상 절대 POSIX 경로 |
| `transfer.js` | `download(client, items, localDir, job)`, `upload(client, items, remoteDir, job)`, `removeRemote`. 1) 계획(트리 순회 → 파일 수·바이트 합) 2) 파일별 전송. 대상 존재 시 `job.askConflict()` |
| `connections.js` | 연결을 id 로 관리. `connect(opts, job)` 은 잡 안에서 실행되어 UI 가 "연결 중…" 과 취소를 보여 줌 |
| `local.js` | 드라이브 목록(Windows: PowerShell `Win32_LogicalDisk` 로 볼륨 이름, 60초 캐시), 폴더 나열(폴더 먼저·이름순), mkdir/rename/delete, `walk` |
| `jobs.js` | `Job`: `current/total`(파일 수), `bytes/bytesTotal`, `speed`(3초 이동 창), `detail`, `conflict`, `notes`(파일마다 `note({type:'file', dir, src, dest, size, ms, skipped})` — 스냅샷에 실려 UI 가 seq 로 못 본 것만 로그), `onCancel` 훅, `askConflict → 'overwrite'|'skip'|'cancel'` + apply-all. 33ms 로 업데이트 병합. `JobRegistry` 는 끝난 잡을 60초 보관(늦은 폴링 대비) |
| `profiles.js` | `[{name, protocol, host, port, user, password}]`. 비밀번호는 `b64:` 접두 base64 (난독화이지 암호화 아님) |
| `history.js` | `history.json`: 연결 성공마다 `remote.connect` 잡이 `history.add(info)` — `{protocol, host, port, user, lastAt, count}` 최신순 20개, 같은 서버는 한 항목으로 합침, 비밀번호 없음 |
| `session.js` | `lastLocalPath, lastProfile, language, theme, themeBg, fontSize, serverWidth, logHeight, confirmDelete, restoreLocalPath, sounds, showConnectedDialog, windowBounds` |

### electron/
- `main.js` — **프레임리스 창**(`frame: false`; 첫 프레임 흰 테두리 방지로 setOpacity(0)→show→50ms 후 1), 단일 인스턴스, 창 위치 저장, `MFC_USER_DATA` 로 별도 프로필, `createApi` 에 `shell.openPath / showItemInFolder / clipboard` 주입, 스모크 훅(`--smoke-shot/--smoke-script/--smoke-probe/--smoke-url`).
- `ipc.js` — `ipcMain.handle('api')` 로 `api.call` 을 노출하고 `job:update` 를 렌더러로 푸시. 창 제어: `win:control`(minimize/maximize/close), `win:isMaximized`, `win:getSize`/`win:setSize`(상태바 크기 조절 마커).
- `preload.js` — `contextBridge` 로 `window.myFtpClient = { call, onJobUpdate, windowControl, isMaximized, onMaximized, getWindowSize, setWindowSize, quit }`. 브리지를 넘는 `Error` 는 message 만 남으므로 `{ok, error}` 객체를 그대로 넘기고 렌더러(`backend.js unwrap`)가 `Error` 를 재구성합니다.

### server/server.js
`node:http` 만 사용. `POST /api/<name>` (JSON) 과 `dist/` 정적 파일. 기본 127.0.0.1:5188, `--host 0.0.0.0` 이면 `--token` 권장(Bearer 또는 `?token=`). 잡은 클라이언트가 `jobs.get` 을 150ms(충돌 대기 중 400ms) 로 폴링.

### src/ — React UI
| 파일 | 역할 |
|------|------|
| `App.jsx` | 상태·액션의 중심. 연결/해제, 서버 목록, 전송(진행률·충돌), 프로파일, 서버·로컬 폴더 작업, 컨텍스트 메뉴, 분할 바 드래그, 설정/테마/언어. `window.__mfc` 자동화 훅 |
| `components/Toolbar.jsx` | 타이틀바 대체(`-webkit-app-region: drag`, 컨트롤은 no-drag, 더블클릭 = 최대화 토글): 앱 이름·연결 배지·**프로파일 콤보/저장/삭제**·테마·언어·설정·정보·**창 버튼**(Electron 에서만). 창 최소 크기 1120×760(= 기본 크기)에서 모든 항목이 보이도록 폭을 맞춤; 연결 배지만 말줄임 가능 |
| `components/ConnectionBar.jsx` | 접속 폼 한 줄 + 🕘 히스토리 버튼. 프로토콜을 바꾸면 기본 포트가 따라감(사용자가 바꾼 포트는 유지). Host 에 URL 을 넣으면 `parseHostInput`(format.js) 이 분해 — core 의 `normalizeHost` 도 같은 규칙으로 방어 |
| `components/StatusBar.jsx` | 상태 + 진행률 + 취소 + 우측 하단 **SizeGrip**(pointer capture 로 드래그 → `setWindowSize`) |
| `components/RemotePanel.jsx` | 서버 평면 목록 + `[..]`, 다중 선택, 키보드 탐색 |
| `components/LocalTree.jsx` | 지연 로딩 트리. `expandTo(path)` 로 시작 폴더 복원, `refresh(path)` 로 부분 갱신. `forwardRef` 로 App 이 제어 |
| `components/TransferBar.jsx` | ←/→ 버튼 + 드래그 리사이즈 |
| `components/LogPanel.jsx`, `StatusBar.jsx` | 로그(자동 스크롤, 복사/지우기), 상태 + 진행률 + 취소 |
| `dialogs/Dialogs.jsx` | 스택형 Promise 기반 대화상자: prompt · confirm · message/error(자세한 내용 + 복사) · conflict · profileDelete · about · settings |
| `lib/backend.js` | 전송 스위치: Electron IPC ↔ fetch/폴링. `runJob(name, args, onUpdate)` 는 최종 스냅샷을 resolve |
| `lib/i18n.js` | `t(key, params)`, `useLanguage()` (useSyncExternalStore) |
| `lib/format.js` | 크기/속도/날짜, 경로 헬퍼(구분자는 `app.info.sep`), 확장자 → 아이콘 |
| `lib/sound.js` | Web Audio 로 성공/오류 알림음 (원본의 `Console.Beep`) |
| `themes.js` | 16개 테마 → CSS 변수 |

## 2. 전송 흐름

```
UI download(items)
  └ runTransfer('transfer.download') ── api ── jobs.run('download')
        │                                        └ transfer.download(client, items, localDir, job)
        │  job:update (IPC push / 폴링)                ├ 계획: client.list 재귀 → files[], dirs[]  → job.setTotal(n, bytes)
        ├ 상태 표시줄: bytes/bytesTotal, speed          ├ mkdir 로컬 폴더들
        ├ snap.conflict → dialogs.conflict()            └ 파일마다: local.exists? → job.askConflict() ─(대기)─
        │      └ resolveConflict(id, answer, applyAll) ──────────────────────────────────────────────┘
        └ 최종 snapshot: done | cancelled | error        client.download(remote, local, onBytes, signal)
```

- **FTP** 전송은 basic-ftp 의 `downloadTo / uploadFrom` + `trackProgress`(500ms). 취소는 제어 연결을 닫는 방법뿐이므로(ABOR 미지원) `signal` 이 abort 되면 `close()` 후 **같은 자격으로 다시 접속**해 세션을 유지합니다. basic-ftp 는 동시에 한 명령만 처리하므로 `FtpClient._run` 이 큐로 직렬화합니다.
- **SFTP** 전송은 ssh2 의 `fastGet/fastPut` 대신 자체 파이프라인(`_pump`: 64KB × 32 동시 요청 ≈ 2MB 창)을 씁니다. 이유: 취소 가능(더 이상 요청을 내지 않고 핸들을 닫음), 바이트 단위 진행률, 빈 파일 처리. 청크는 각자의 오프셋에 쓰므로 순서가 바뀌어도 안전합니다.
- 업로드의 존재 검사는 원격 폴더당 한 번의 `list` 를 캐시해 파일마다 LIST 를 보내지 않습니다.

## 3. 오류 처리
모든 실패는 같은 팝업으로 끝납니다: 메시지 + 자세한 내용(코드·경로·발생 프로세스의 스택) + **자세한 내용 복사**. 잡 실패는 `snapshot.error / errorDetail` 로, 즉시 호출 실패는 `{ok:false, error}` → `Error` 로 전달됩니다. 연결 시간 초과는 별도 메시지(30초 안내)로 구분합니다.

## 4. 테스트

| 명령 | 내용 |
|------|------|
| `npm test` (22) | `test/core.test.mjs`: 프로파일·세션·히스토리·로컬 FS + **FTP** 왕복(연결, 잘못된 비밀번호, 폴더 트리 업/다운로드, 충돌 3종, mkdir/rename/delete, 전송 중 취소 후 세션 유지, 해제). `test/ftps.test.mjs`: **FTPS** — 호스트 URL 정규화, TLS 없는 서버의 거부, AUTH TLS + PROT P 로 목록/트리 전송/충돌/취소 재접속/삭제. `test/sftp.test.mjs`: **SFTP** 왕복(5MB 파이프라인 전송 바이트 일치, 빈 파일, 취소, 삭제). 내장 테스트 서버: `test/ftp-server.mjs`(`tls: true` 면 explicit FTPS, 자체 서명 인증서 `test/certs/`), `test/sftp-server.mjs`(ssh2 Server API + RSA 임시 호스트 키) |
| `npm run smoke` | 실제 Electron 창(별도 프로필 `.smoke/profile`)에서 `window.__mfc` 로 접속·다운로드·업로드를 수행하고 파일이 실제로 이동했는지 확인, 스크린샷 `.smoke/*.png`. 이어서 웹 서버를 5199 포트에 띄워 HTTP API + 정적 파일 + 잡 왕복을 검사하고, preload 없는 창으로 브라우저 모드 UI 도 캡처 |
| `npm run smoke -- --scenario <name> [--web]` | `main connected transfer conflict error context local_context profile_delete history about settings themes light_en theme_nord all` |

## 5. 빌드·패키징
- `scripts/generate-icons.mjs`: `assets/icon.svg` → `build/icons/icon.{ico,icns,png}` + Linux PNG 세트 (sharp + 자체 ICO/ICNS 인코더).
- electron-builder: NSIS(`build/installer.nsh` — 바로가기 선택 페이지, 이전 설치 정리, 이전 데이터 삭제 여부 질문), DMG(x64+arm64), AppImage + deb(`build/linux/after-*.sh`).
- `ssh2` 의 선택 의존성 `cpu-features` 는 네이티브 모듈이지만 없어도 순수 JS 로 동작합니다(npm 12 는 install 스크립트를 차단하므로 `allowScripts` 에 electron/sharp/esbuild 만 허용).
- `scripts/start-electron.mjs` 는 `ELECTRON_RUN_AS_NODE` 를 지운 환경으로 Electron 을 띄웁니다(이 변수가 있으면 Electron 이 Node 처럼 동작).

## 6. 원본(WinForms) 대비 달라진 점
| 원본 | 이 구현 |
|------|---------|
| 셸 아이콘(`SHGetFileInfo`) | 확장자별 SVG 아이콘 (모든 OS 동일) |
| `Console.Beep` | Web Audio 알림음 (설정에서 끔) |
| 단일 선택 TreeView | 다중 선택(Ctrl/Shift), 키보드 탐색 |
| 덮어쓰기 고정 | 충돌 시 질문(덮어쓰기/건너뛰기/취소 + 전체 적용) |
| 진행률 = 상태 표시줄 | 동일 + 속도·바이트·취소 버튼 |
| 서버/로컬 새 폴더·삭제 없음 | 양쪽 새 폴더·이름 바꾸기·삭제 추가 |
| Windows 전용 | Windows · macOS · Linux · 웹, 16 테마, 한/영 |
