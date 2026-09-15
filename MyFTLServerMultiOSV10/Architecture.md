# My FTP Server — 아키텍처

`FTPServerWinV10`(C# WinForms, 자체 FTP 구현 + FxSsh) 을 하나의 JavaScript 코드베이스로 옮겨 Windows·macOS·Linux 데스크톱(Electron)과 웹(브라우저 + Node 서버)에서 같은 UI 로 같은 서버 코어를 제어합니다. 의존성은 `ssh2`(SFTP) 하나이며 FTP/FTPS·인증서 생성·호스트 키는 Node 표준 모듈만 씁니다.

```
┌──────────────────── UI (src/, React) ─────────────────────┐
│ App.jsx ── Toolbar · ControlBar · [Shares|Users / Security|Network] │
│           · LogPanel · StatusBar · Dialogs(share/user/cert/…)  │
│ lib/backend.js  ← 호스트 판별: window.myFtpServer ?           │
└───────────┬───────────────────────────────┬────────────────┘
   IPC invoke + push(server:log/update)   fetch POST /api/<name> + server.poll 폴링
┌───────────▼─────────┐             ┌───────▼──────────────┐
│ electron/           │             │ server/server.js     │
│  main.js · ipc.js   │             │  node:http, 정적 dist │
│  preload.js         │             │  --host/--port/--token│
└───────────┬─────────┘             └───────┬──────────────┘
            └──────────────┬────────────────┘
                   ┌───────▼────────┐
                   │ core/api.js    │  하나의 메서드 표 (JSON in/out)
                   ├────────────────┤
                   │ manager.js     │  검증 → 리스너 일괄 시작/중지, 통계, 'update'
                   │ ftp-server.js  │  FTP + FTPS (net/tls), 세션당 명령 직렬화
                   │ sftp-server.js │  SFTP (ssh2 Server, sftp 하위 시스템만)
                   │ vfs.js         │  가상 경로 ↔ 실제 폴더 (모든 프로토콜 공용)
                   │ auth.js        │  익명 / 사용자, 읽기·쓰기 권한
                   │ x509.js        │  자체 서명 인증서(DER 인코더), PEM/PFX 로드
                   │ hostkey.js     │  RSA 호스트 키 생성·OpenSSH 지문
                   │ settings.js    │  server_settings.json · profiles/*.json
                   │ session.js     │  session.json (UI 환경설정)
                   │ log.js         │  링 버퍼(3000) + ftpserver.log, messages.js 한/영
                   │ local.js       │  웹용 폴더/파일 선택기의 파일 시스템
                   └────────────────┘
```

## 1. 계층

### core/ — 플랫폼 무관, Node 전용
Electron 을 전혀 참조하지 않으므로 Electron 메인 프로세스와 웹 서버가 **같은 객체**를 씁니다. 테스트도 이 계층만으로 실제 포트를 열어 검증합니다.

| 파일 | 역할 |
|------|------|
| `api.js` | `createApi(host)` → `{ call(name, args), log, manager, settings, session, shutdown }`. 메서드 군: `app.*`(info·setLanguage·addresses), `settings.*`(get·save·reload·validate), `profiles.*`, `server.*`(state·start·stop·poll), `log.*`(lines·clear·text·save), `cert.*`(generate·inspect), `hostkey.*`(info·generate), `local.*`(roots·list·mkdir·stat), `host.*`(pickFolder·pickFile·saveFile·reveal·open — 호스트가 주입한 것만, 없으면 `UNSUPPORTED`), `clipboard.write`, `session.*`. `serializeError` 가 오류를 `{code, message, path, detail, stack}` 으로 직렬화 |
| `manager.js` | `ServerManager`. `validate(s)` → 공유 없음 / 프로토콜 없음 / 인증서 없음·못 찾음 / 포트 충돌을 UI 의 「설정 오류」 팝업용 `{ok, code, message, detail}` 로. `start(s)` 는 VFS·인증 정보를 만들고 FTP → FTPS → SFTP 순으로 리스너를 띄우며, **하나라도 실패하면 이미 뜬 것을 모두 닫고** 예외를 던집니다(트랜잭션). 각 서버의 `clients` / `transfer` 이벤트를 모아 `stats` 를 갱신하고 40ms 로 묶어 `'update'` 를 냅니다. `snapshot()` = `{ state: {running, starting, startedAt, protocols[{proto, port, clients, total}], bind}, stats }` |
| `ftp-server.js` | `FtpServer({ proto:'FTP'|'FTPS', port, host, vfs, auth, tls, implicit, explicit, bufferSizeKb, pasvPortMin/Max, pasvAddress, maxConnections, log, lang })`. `implicit` 이면 `tls.createServer`, 아니면 `net.createServer`; `explicit` 이면 `AUTH TLS` 로 소켓을 `TLSSocket` 으로 감싸 재부착. `FtpSession` 은 제어 연결 하나 — 명령은 `busy` 프라미스 체인으로 **직렬 실행**(전송 중 다음 명령 대기), 경로는 `absolute()` → `vfs.resolve()`, 권한은 `needRead/needWrite`. 데이터 연결: `openPasv()`(범위 내 임의 포트, 20회 재시도, 15초 대기) / `PORT·EPRT`(능동 접속), `PROT P` 면 `TLSSocket` 으로 감쌈. `pasvHost()` 는 사설망 피어에게는 로컬 주소, 그 외엔 `pasvAddress` 를 알림. 유휴 10분 → 421 |
| `sftp-server.js` | `SftpServer({ port, host, vfs, auth, hostKey(PEM), maxConnections, … })`. ssh2 `Server` 로 `authentication`(`none` = 익명 허용 시 anonymous, `password` = auth.js), `session` 에서 `shell/exec/pty/subsystem(sftp 외)` 거부, `sftp` 만 `SftpSession` 으로. 핸들 표(`fd` 파일 / `entries` 디렉터리)로 OPEN·READ·WRITE·FSTAT·FSETSTAT·CLOSE, OPENDIR·READDIR(48개씩), REALPATH·STAT·LSTAT·SETSTAT, REMOVE·MKDIR·RMDIR·RENAME, READLINK/SYMLINK 는 `OP_UNSUPPORTED`. CLOSE 때 읽기/쓰기 바이트를 세어 `transfer` 이벤트 |
| `vfs.js` | `VirtualFileSystem(shares)`: 가상 이름(대소문자 무시) → 실제 루트. `/` 는 가상 이름 목록(합성 폴더), `/name/a/b` → `<root>/a/b`, `path.resolve` 후 `isUnderRoot` 로 탈출 차단(`..` 는 루트에서 잘림). 공유가 하나면 `/a/b` 도 그 공유로. `list/stat/directoryExists/isRoot/mountOf` — 폴더 먼저·자연수 정렬 |
| `auth.js` | `authenticate(user, pw, {allowAnonymous, users})` → `{canRead, canWrite, anonymous, user}` 또는 `null`. anonymous 는 읽기 전용·암호 무시, 사용자는 이름 대소문자 무시·암호 정확 일치, 읽기·쓰기 둘 다 없으면 거부 |
| `x509.js` | `generateSelfSigned({commonName, validityYears, bits})` — DER 인코더로 X.509 v3(basicConstraints·keyUsage·extKeyUsage serverAuth·subjectAltName DNS/IP)를 직접 조립해 RSA-SHA256 서명. `writeSelfSigned(certFile)` 은 `<name>.pem` + `<name>_key.pem`(0600). `loadCertificate({certPath, keyPath, password})` 는 PEM(키 포함/별도/옆의 `_key.pem`·`.key`) 또는 `.pfx/.p12` 를 읽어 `tls.createSecureContext` 로 **시작 시점에 검증**하고 주체·만료를 요약 |
| `hostkey.js` | `ensureKey(file)` 없으면 RSA 2048 PKCS#1 PEM 생성(비동기 — UI 프로세스 정지 방지). `inspectKey` 는 ssh2 `parseKey` 로 공개키 SSH 와이어 형식을 얻어 `SHA256:<base64 no pad>` (OpenSSH·FileZilla·WinSCP 표기) 와 MD5 지문, 비트 수 |
| `settings.js` | `normalize(raw)` 가 모든 입력의 관문: PascalCase(원본) → camelCase, 옛 `userId/userPassword` → `users[]`, `maxThreads` → `maxConnections`, 포트·정수 범위 클램프, `b64:` 비밀 해독. `toFile` 은 비밀을 다시 난독화. `Settings` 는 `server_settings.json` 과 `profiles/<name>.json`(이름은 파일명 안전 문자만) |
| `session.js` | `language, theme, themeBg, fontSize, logHeight, lastProfile, confirmStop, autoStart, minimizeToTray, sounds, windowBounds` |
| `log.js` | `Log(file)`: `info/ok/warn/error(key, params)` 는 `messages.js` 의 한/영 템플릿을 렌더해 `{seq, time, level, text}` 로 보관(최근 3000줄)·`'line'` 이벤트·파일 큐 기록. `trace(text)` 는 프로토콜 대화 — 화면에만(파일은 `verbose` 일 때). `after(seq)` 로 웹 폴링 |
| `local.js` | `listRoots`(Windows 드라이브 / `/`·홈), `listDirectory(path, {filesToo, extensions})`, `makeDirectory`, `statPath` — 웹 버전의 「찾기」 |

### electron/
- `main.js` — **프레임리스 창**(`frame: false`, 기본 1180×800, 바닥 최소 1100×720 = `window-size.js`; 렌더러가 `win:setMinSize` 로 실제 필요한 최소 크기를 올림, 창 위치 저장), 단일 인스턴스, `MFS_USER_DATA` 로 별도 프로필(스모크·병렬 실행), `createApi` 에 `dialog.showOpenDialog/showSaveDialog`, `shell.showItemInFolder/openPath`, `clipboard` 주입. **트레이**: `minimizeToTray` 이고 서버가 실행 중이면 닫기 → 숨김, 트레이 메뉴에서 표시/종료. `autoStart` 면 준비 직후 `server.start`. 종료 시 `api.shutdown()` 으로 리스너 정리. 스모크 훅 `--smoke-shot / --smoke-script / --smoke-settle / --smoke-delay / --smoke-url`(웹 UI 를 preload 없이 로드).
- `ipc.js` — `ipcMain.handle('api')` → `api.call` 을 `{ok, data} | {ok:false, error}` 로 감싸고, `api.log 'line'` → `server:log`, `api.manager 'update'` → `server:update` 를 렌더러에 푸시. 창 제어 `win:control`(minimize/maximize/close), `win:isMaximized`, `win:getSize/setSize`(상태바 크기 조절 마커), **`win:setMinSize`**(렌더러가 잰 최소 크기 — 바닥값 이상으로만, 현재 창이 더 작으면 키움), `win:maximized` 푸시, `app:quit`.
- `preload.js` — `contextBridge` 로 `window.myFtpServer = { call, onLog, onUpdate, windowControl, isMaximized, getWindowSize, setWindowSize, setMinWindowSize, onMaximized, quit }`. 브리지를 넘는 `Error` 는 message 만 남으므로 `{ok, error}` 를 그대로 넘기고 렌더러(`backend.js unwrap`)가 `Error` 를 재구성합니다.

### server/server.js
`node:http` 만 사용. `POST /api/<name>`(JSON, 8MB 제한) 과 `dist/` 정적 파일(경로 탈출 차단, SPA 폴백). 기본 127.0.0.1:5190, `--host 0.0.0.0` 이면 `--token` 권장(`Authorization: Bearer` 또는 `?token=`; 없으면 경고 출력). `--config` 로 설정 폴더, `--autostart` 로 즉시 시작, `--no-open` 으로 브라우저 자동 열기 생략. 환경 변수 `MFS_PORT/HOST/TOKEN/CONFIG/NO_OPEN/AUTOSTART` 도 같은 뜻. 종료 시그널에서 `api.shutdown()`.

### src/ — React UI
| 파일 | 역할 |
|------|------|
| `App.jsx` | 상태·액션의 중심. 부팅(info → session → settings → profiles → server.state → log → subscribe), **설정 초안**(`updateSettings` 가 500ms 뒤 `settings.save quiet`, 시작 전 `flushSettings`), 시작/중지(검증 팝업·접속자 확인), 공유/사용자 CRUD, 인증서·호스트 키 생성, 로그 복사/저장, 프로파일, 테마/언어/설정, 로그 분할 바, F5/F6. **한 줄 보장**: `ResizeObserver` 로 툴바·제어 바의 필요 폭과 (고정 줄 + 표 최소 136px + 보안/네트워크 자연 높이 + 로그 80px) 의 필요 높이를 재서 `setMinWindowSize` 와 `--app-min-width`(브라우저는 가로 스크롤)로 적용하고, 로그 분할 바의 상한을 그에 맞춰 잠급니다. `window.__mfs` 자동화 훅 |
| `components/Toolbar.jsx` | 타이틀바 대체(드래그 영역, 더블클릭 = 최대화 토글): 앱 이름·**프로파일 콤보/저장/삭제**·테마 분할 버튼·언어 국기·설정·정보·**창 버튼**(Electron 만). 서버 상태는 ▶/■ 버튼과 상태 표시줄이 보여 주므로 여기엔 없음 |
| `components/ControlBar.jsx` | ▶ 시작/■ 중지, 프로토콜 스위치(체크하면 표준 포트 채움)·포트·실행 중 접속 수, AUTH TLS 스위치, 통계 3종 |
| `components/SharesPanel.jsx` `UsersPanel.jsx` | 표 + 추가/편집/제거, 더블클릭·Enter·Delete·↑↓, 폴더 없음 표시 / 익명 스위치·권한 태그 |
| `components/SecurityPanel.jsx` | FTPS 블록(인증서·개인키·암호·찾기·생성·요약 줄)과 SFTP 블록(키 경로·생성·폴더·지문 복사). 해당 프로토콜이 꺼지면 `.off` |
| `components/NetworkPanel.jsx` | 버퍼·최대 접속·PASV 범위/외부 주소·바인드, `app.info.addresses` × 켜진 프로토콜로 만든 접속 URL + 복사 |
| `components/LogPanel.jsx`, `StatusBar.jsx` | 로그(자동 스크롤, trace 토글, 복사/저장/지우기, 분할 바) / **● 실행 중·○ 중지됨·시작 중…** 상태(일시 메시지에 덮이지 않음) + 상태 메시지 + 가동 시간 + SizeGrip |
| `dialogs/Dialogs.jsx` | 스택형 Promise 대화상자: prompt · confirm · message/error(자세한 내용 + 복사) · share · user · cert · path · settings · about |
| `dialogs/PathPicker.jsx` | 웹 버전의 폴더/파일/저장 선택기 — `local.roots/list/mkdir` 로 서버 쪽 파일 시스템 탐색 |
| `lib/backend.js` | 전송 스위치: Electron IPC(푸시) ↔ fetch + `server.poll` 폴링(700ms, 접속자가 있으면 250ms). `subscribe({onLog, onUpdate}, fromSeq)`, `writeClipboardText`(호스트 → navigator.clipboard 폴백), `downloadText`(웹 로그 저장) |
| `lib/i18n.js` `format.js` `sound.js` `settings.js` | `t(key, params)`·`useLanguage()` / 크기·시간·경로 헬퍼 / Web Audio 알림음 / UI 쪽 기본값·기본 포트 |
| `themes.js` `styles.css` | 16개 테마 → CSS 변수. `.main` 은 **2×2 그리드**(1행 공유·인증 표 `minmax(136px,1fr)`, 2행 보안·네트워크 `auto`) — 두 행을 공유하므로 보안/네트워크 상단이 항상 일치. `.control-bar`/`.cb-group` 은 `nowrap`, `.stat` 의 숫자 칸은 최소 폭을 가져 자릿수가 늘어도 흔들리지 않음 |

## 2. 시작 흐름

```
UI ▶ 시작
  ├ flushSettings()                      초안 → server_settings.json
  ├ settings.validate                    { ok:false } → 「설정 오류」 팝업 (message + detail)
  └ server.start { settings }
        └ manager.start(s)
             ├ validate(s)               (같은 검사, 코드 있는 Error)
             ├ new VirtualFileSystem     없는 폴더는 share_skipped 경고
             ├ loadCertificate           FTPS 필수 / FTP+explicit 는 실패 시 경고만
             ├ FtpServer('FTP').start()  ─┐ 하나라도 reject 되면
             ├ FtpServer('FTPS').start() ─┤ 이미 뜬 리스너 stop() 후 throw
             ├ ensureKey → SftpServer    ─┘ (EADDRINUSE → listen_in_use 메시지)
             └ running=true, 'update'    UI: 배지·접속 수·통계, 로그 server_started
   실패 → 「서버 시작 오류」 팝업: message + startDetails(프로토콜·포트·인증서·키·공유 목록) + 스택
```

## 3. 데이터 연결과 전송 (FTP)

```
LIST/RETR/STOR …
  └ session.transfer(fn)
       ├ 150 → dataSocket()
       │     ├ PASV/EPSV: openPasv() 가 미리 열어 둔 리스너의 첫 연결 (15초 내)
       │     ├ PORT/EPRT: 클라이언트 주소로 접속
       │     └ PROT P:    TLSSocket(isServer, 공유 SecureContext)
       ├ fn(sock): pipeline(fs stream ↔ counter ↔ sock)   REST 오프셋 = createReadStream start / 'r+' 쓰기
       ├ 226 / 425(데이터 연결 실패) / 451(전송 중 오류)
       └ 'transfer' { dir, bytes } → manager.stats, 로그 upload_done / download_done
```

- 제어 연결의 명령은 세션당 하나씩 순서대로 처리되므로 전송 중 도착한 `QUIT` 은 전송이 끝난 뒤 실행됩니다(`ABOR` 는 PASV 리스너만 닫음).
- 최대 접속은 `accept` 단계에서 프로토콜별로 검사해 `421` 후 즉시 닫습니다(원본의 「최대 스레드」를 실제로 적용).

## 4. 오류 처리
모든 실패는 같은 팝업으로 끝납니다: 메시지 + 자세한 내용(코드·경로·detail·발생 프로세스의 스택) + **자세한 내용 복사**. 코어는 `err.code` 와 `err.detail` 을 붙여 던지고(`no_shares`, `cert_not_found`, `EADDRINUSE` …), 두 호스트 모두 `serializeError` 로 `{ok:false, error}` 를 돌려주며 `backend.js unwrap` 이 렌더러에서 `Error` 로 되살립니다. 리스너 오류는 `messages.js` 의 한/영 문장(`listen_in_use`, `listen_denied`)으로 바뀌어 사용자에게 조치를 안내합니다.

## 5. 테스트

| 명령 | 내용 |
|------|------|
| `npm test` (41) | `node --test test/*.test.mjs` — 코어 계층만으로 임시 폴더와 포트 0(임의 포트)을 써서 실제 클라이언트(basic-ftp · ssh2 · 직접 소켓)와 왕복합니다. API 를 거치는 시험은 `normalize` 가 포트 0 을 기본 포트로 바꾸므로 빈 포트를 골라 씁니다 |
| `test/core.test.mjs` (19) | `normalizePath`, VFS 매핑·탈출 차단·단일 공유의 bare 경로·파일 목록·건너뛴 공유, `authenticate`(익명 읽기 전용·대소문자·권한 없음 거부), `normalize`(기본값·PascalCase·`b64:`·범위 클램프·빈 항목 제거), `Settings` 저장/불러오기/프로파일, `Session`, `messages` 한/영, `Log`(링 버퍼 3000·seq 폴링·파일에는 trace 제외), `local`(루트·폴더 우선·확장자 필터·mkdir·stat), `manager.validate`(no_shares·cert_not_found·port_clash 코드/메시지), x509(TLS 로 실제 동작, SAN·유효 기간, 별도 키 파일, 키 없음 EKEY, PEM 아님), 호스트 키 생성·지문 형식·손상 키, `createApi`(info·settings·validate·poll·오류 직렬화·언어·log.*·profiles 왕복·hostkey/cert·UNSUPPORTED) |
| `test/ftp.test.mjs` (12) | basic-ftp 로 목록/업·다운로드/이름 변경/삭제/mkdir, `REST` 이어받기, 익명 읽기 전용·잘못된 암호·미등록 사용자 거부, 다중 공유에서 `..` 클램프·루트 쓰기 거부·공유 루트 삭제 거부, 접속 제한(421)과 접속 수 카운터, **Explicit AUTH TLS + PROT P** 와 **Implicit TLS**(자체 서명 인증서 생성 후), 사용 중인 포트의 오류 메시지. 직접 제어 연결(`rawSession`)로 **명령별 응답 코드 40여 개**(로그인 전 530, SYST/FEAT/OPTS/TYPE/MODE/STRU/STAT/MLST/SIZE/MDTM, 503/504/501/502/500/553/425), **능동 모드 PORT/EPRT**, NLST, **REST+STOR 이어 올리기**, APPE, PASV 포트 범위·LAN 피어에는 로컬 주소, UTF-8 파일·폴더 이름, 쓰기 전용 사용자, 로그 이벤트 키, `stop()` 이 세션을 끊는지, 바인드 주소 |
| `test/sftp.test.mjs` (10) | ssh2 클라이언트로 realpath/readdir/전송/mkdir/rename/unlink/rmdir, 익명(암호 없음) 읽기 전용·잘못된 암호 거부, shell/exec 거부, 읽기 전용·쓰기 전용 사용자, 익명 업로드 거부·익명 비허용, 가상 루트·`..` 탈출·공유 루트 보호·폴더를 파일로 열기·READLINK/SYMLINK 미지원, 120개 항목 READDIR 페이징, setstat mtime, UTF-8 이름, 접속 제한·카운터·`stop()`, **매니저**: API 를 통해 FTP+FTPS+SFTP 동시 실행·상태·통계·중지, 포트가 막힌 리스너 하나 때문에 전체가 롤백되는지, 설정 오류 코드(no_shares·no_protocol·port_clash), 손상된 인증서는 FTPS 시작 거부·FTP 는 경고만 |
| `npm run smoke` | 실제 Electron 창(별도 프로필 `.smoke/profile` — 자체 서명 인증서 포함, 공유 `.smoke/share`·`docs`)을 `window.__mfs` 로 조작해 FTP+FTPS+SFTP 를 시작 → 실제 클라이언트로 **FTP**(트리 업로드·2MB 다운로드), **FTPS**(AUTH TLS 업로드, implicit 다운로드, 읽기 전용 삭제 거부), **SFTP**(readdir·put/get·unlink) → 통계 증가 확인, 스크린샷 `.smoke/*.png`. 이어서 웹 서버를 띄워 HTTP API 로 같은 왕복을 하고 preload 없는 창으로 브라우저 모드도 검사 |
| `npm run smoke -- --scenario <name> [--web]` | `main running transfer share_dialog user_dialog cert_dialog cert_generated error port_error about settings themes light_en theme_nord picker all` |

## 6. 빌드·패키징
- `scripts/generate-icons.mjs`: `assets/icon.svg` → `build/icons/icon.{ico,icns,png}` + Linux PNG 세트 (sharp + 자체 ICO/ICNS 인코더 `scripts/ico.mjs`).
- `scripts/generate-build-info.mjs` → `src/build-info.json`(빌드 시각·커밋) 을 정보 대화상자에 표시; `sync-public-svgs.mjs` 가 아이콘을 `public/` 에 복사.
- electron-builder: NSIS(`build/installer.nsh` — 기존 설치 감지·삭제 확인, 바로가기 선택, 이전 데이터 삭제 여부), DMG(x64+arm64), AppImage + deb(`build/linux/after-*.sh`). `postbuild:*` 가 설치 파일을 프로젝트 루트로 복사.
- `ssh2` 의 선택 의존성 `cpu-features` 는 네이티브 모듈이지만 없어도 순수 JS 로 동작합니다(`allowScripts` 에 electron/sharp/esbuild 만 허용).
- `scripts/start-electron.mjs` 는 `ELECTRON_RUN_AS_NODE` 를 지운 환경으로 Electron 을 띄웁니다(이 변수가 있으면 Electron 이 Node 처럼 동작). `free-port.mjs` 가 Vite 포트 5189 를 비웁니다.

## 7. 원본(WinForms) 대비 달라진 점
| 원본 | 이 구현 |
|------|---------|
| Implicit FTPS 만, `PROT P` 미구현 | Implicit + **Explicit AUTH TLS**, **PROT P** 데이터 채널 암호화 |
| `.pfx` 인증서 생성(.NET `CertificateRequest`) | 의존성 없는 DER 인코더로 **PEM** 생성, `.pem` / `.pfx` 모두 로드, 시작 시점에 검증 |
| 지문 = SPKI 해시 | **OpenSSH 방식** 지문 — 클라이언트가 보여 주는 값과 일치 |
| PASV 만, 스레드당 세션 | PASV / EPSV / PORT / EPRT, REST, RNFR/RNTO, MDTM, MLST; 이벤트 루프 + 세션당 명령 직렬화 |
| 통계는 FTP 만 | SFTP 전송도 집계, 프로토콜별 접속 수 |
| 최대 스레드(미사용) | **최대 접속 수** 실제 적용 (421) |
| 설정 파일이 exe 옆 | OS 별 설정 폴더, 원본 PascalCase JSON 도 읽음 |
| Windows 전용, 고정 창 | Windows · macOS · Linux · 웹, 프레임리스 창, 16 테마, 한/영, 트레이, 자동 시작 |
