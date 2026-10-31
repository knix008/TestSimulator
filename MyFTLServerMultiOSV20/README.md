# My FTP Server

Windows · macOS · Linux · 웹에서 실행되는 **FTP / FTPS / SFTP 서버** — `FTPServerWinV10`(C# WinForms) 의 JavaScript 리라이트입니다. 하나의 코드베이스로 데스크톱 앱(**Tauri 2** 창 + Node 서버 호스트)과 웹 버전(브라우저 + Node 서버)을 제공합니다.

사용 방법은 **[UsersGuide.md](UsersGuide.md)**, 내부 구조는 **[Architecture.md](Architecture.md)** 를 참고하세요.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 다중 공유 폴더 | 여러 실제 폴더를 가상 경로(`/이름`)로 매핑 — FTP·FTPS·SFTP 동일 경로 |
| FTP | 평문 FTP (기본 포트 **21**), LIST/NLST/MLSD/MLST, PASV/EPSV/PORT/EPRT, REST(이어받기), RNFR/RNTO |
| FTPS | **Implicit** TLS (기본 포트 **990**) + FTP 포트의 **Explicit** `AUTH TLS` / `PROT P` (데이터 채널 암호화) |
| SFTP | SSH SFTP v3 (기본 포트 **22**, `ssh2`), 셸·exec 거부 |
| 동시 실행 | FTP / FTPS / SFTP 를 각각 켜고 **동시 실행**, 프로토콜별 접속 수 |
| 인증서 | 자체 서명 **SSL 인증서** 생성(PEM, RSA 2048/4096, SAN 포함) · 기존 `.pem` / `.pfx` 사용 |
| 호스트 키 | RSA **PEM** 자동 생성·재생성, OpenSSH 방식 **SHA256 지문** (FileZilla·WinSCP 와 동일 표기) |
| 인증 | 익명(읽기 전용) 또는 사용자 ID/비밀번호, **읽기·쓰기** 권한 |
| 폴더 트리 | 왼쪽 사이드바: 가상 루트 `/` → 공유 폴더 → 실제 폴더·파일(크기)을 연결선이 있는 트리로 지연 로드. 접기/펼치기(툴바의 사이드바 버튼, 완전히 숨김), 폭 조절, 더블클릭 = 탐색기에서 열기, 키보드 이동 |
| 네트워크 | 바인드 주소, PASV 포트 범위·외부 주소(NAT), 최대 접속 수, 버퍼 크기 — 숫자 필드는 좌우 −/+ 버튼. 클라이언트가 쓸 **접속 주소**는 로그 옆 「접속 주소」 탭(프로토콜 × 인터페이스 표, 행 복사·전체 복사·행/전체 삭제·복원) |
| 프로파일 | 설정을 이름으로 저장·불러오기·삭제, 원본(PascalCase JSON) 파일도 읽음 |
| 자동 저장 | 변경 즉시 `server_settings.json` 저장, F5/F6 단축키 |
| 통계·로그 | 현재/총 접속, 업·다운로드 수·용량, 실시간 로그(프로토콜 상세 토글), **전체 복사·로그 저장**, `ftpserver.log` |
| 오류 안내 | 설정·시작 오류 시 **상세 팝업** (코드·경로·스택, 전체 복사) |
| 시작 페이지 | 움직이는 배경(21종) 위에 서버 시작/중지·상태·빠른 작업·공유 폴더·접속 주소·프로파일·도움말 카드 — 카드는 끌어서 옮기고 크기 조절, 배치는 저장 |
| UI | 프레임리스 창(툴바에 최소/최대/닫기, 우측 하단 크기 조절 그립), 제어 바·툴바가 **항상 한 줄**(창 최소 크기 자동 계산), 40 테마(어두운 20 · 밝은 20) + **사용자 정의 테마**(15색 편집), 한국어/English, 트레이 최소화, 자동 시작, 하나만 실행. 테마 목록 · 설정 · 정보는 **별도 창**이라 메인 창 밖으로도 나옵니다 |
| 사용법 | 시작 페이지의 「사용법」 → 그림이 있는 사용 설명서 창(`doc/`, 한국어/English, 글꼴 크기 − 13px +) |

## 요구 사항

| 구분 | 내용 |
|------|------|
| 개발 | Node.js 20+ (Node 24 에서 개발), npm, **Rust**(stable, 1.77+) + [Tauri 사전 요구 사항](https://tauri.app/start/prerequisites/) (Windows: WebView2 · MSVC 빌드 도구, Linux: webkit2gtk 4.1) |
| 데스크톱 | Windows 10/11 x64 · macOS 10.15+ · Linux x64 (AppImage / deb). 설치본은 Node 런타임을 함께 담으므로 따로 설치할 필요 없음 |
| 웹 | 최신 Chrome / Edge / Firefox / Safari, 서버는 Node.js 20+ |
| 1024 미만 포트 | Linux/macOS 에서는 관리자 권한(`sudo`) 또는 `setcap` 필요 — 개발 중엔 2121/2990/2222 권장 |

## 빠른 시작

```bash
npm install
npm start            # 데스크톱 개발 모드: Vite(5189, 사용 중이면 다음 빈 포트) + tauri dev
npm run web          # 빌드 후 웹 버전 http://127.0.0.1:5190
npm test             # 코어·FTP·FTPS·SFTP·매니저·Node 호스트·시작 페이지·패키징 자동 테스트 (84개, 파일·스위트별 표 + 요약: test/reporter.mjs)
npm run test:rust    # Tauri 셸(src-tauri)의 cargo test
npm run build:debug && npm run smoke   # 실제 Tauri 창을 CDP 로 조작해 FTP·FTPS·SFTP 클라이언트 왕복, 웹 버전도 검사, 스크린샷 .smoke/*.png
```

### 설치 파일 만들기

```bash
npm run build:win     # NSIS 설치 파일 → 프로젝트 루트 (My FTP Server_1.0.1_x64-setup.exe)
npm run build:mac     # .app + DMG — macOS 에서 실행
npm run build:linux   # AppImage + deb — Linux 에서 실행
npm run build:all     # 이 OS 에서 만들 수 있는 것 모두
```

빌드는 `src-tauri/sidecar/` 에 esbuild 로 묶은 Node 호스트(`host.js` 한 파일 — `core/` 와 `ssh2` 포함)와 Node 실행 파일을 준비한 뒤 Tauri 번들에 넣습니다(`scripts/prepare-tauri.mjs`). 결과물은 `src-tauri/target/release/bundle/` 에 생기고 프로젝트 루트로 복사되며, 루트에 남아 있던 이전 버전 설치 파일은 지워집니다. Tauri 는 실행 중인 OS 의 설치 파일만 만듭니다.

Windows 설치 프로그램은 언어(한국어/English)를 고른 뒤, **이미 설치된 My FTP Server(이전 Electron 판 포함)를 완전히 삭제하고** 설치하며(실행 중이면 닫음), 이전 데이터(설정·프로파일·인증서·호스트 키·로그)가 있으면 지울지 묻습니다. 앱·설치·제거 프로그램 아이콘은 모두 `assets/icon.svg` 에서 생성됩니다(`npm run generate:icons`). `npm run clean` 은 빌드 산출물을, `npm run clean:all` 은 `node_modules`·`src-tauri/target` 까지 지웁니다.

### 웹 버전 (헤드리스 서버)

```bash
node server/server.js                               # 127.0.0.1:5190, 브라우저 자동 열기
node server/server.js --host 0.0.0.0 --port 8080 --token secret --no-open --autostart
node server/server.js --config /srv/myftp           # 설정 폴더 지정
```

FTP/FTPS/SFTP 리스너는 **이 Node 프로세스 안에서** 실행되고, 브라우저는 원격 제어판 역할을 합니다(NAS·리눅스 박스에 두고 다른 PC 에서 관리). 루프백이 아닌 인터페이스에 바인드할 때는 `--token` 을 함께 쓰세요 (`Authorization: Bearer …` 또는 `?token=`).

## 프로젝트 구조

```
MyFTLServerMultiOSV20/
  core/                     플랫폼 무관 서버 코어 (데스크톱 셸을 참조하지 않음)
    api.js                  UI 가 호출하는 메서드 표 (데스크톱·웹 공용 HTTP API)
    manager.js              프로토콜 서버들의 시작·중지·통계
    ftp-server.js           FTP + FTPS (implicit / explicit AUTH TLS, PROT P)
    sftp-server.js          SFTP (ssh2 Server API, sftp subsystem 만)
    vfs.js                  가상 경로 → 실제 폴더
    auth.js                 익명·사용자 인증, 읽기/쓰기 권한
    x509.js                 자체 서명 인증서 생성(node:crypto, 의존성 없음) · PEM/PFX 로드
    hostkey.js              SSH 호스트 키 생성·지문
    settings.js / session.js  서버 설정·프로파일 / UI 환경설정
    log.js / messages.js    링 버퍼 + ftpserver.log, 한/영 로그 메시지
    local.js                웹용 폴더·파일 선택기의 파일 시스템
  host/host.js              데스크톱 앱의 Node 호스트: core/api.js 를 127.0.0.1·임의 포트·토큰으로 제공
  src-tauri/                Tauri 2 셸 (Rust)
    src/lib.rs              프레임리스 창·창 위치 저장·최소 크기·트레이·하나만 실행·플러그인(대화상자·열기·클립보드)
    src/host.rs             Node 호스트 실행·준비 줄 읽기·종료
    windows/hooks.nsh       NSIS 설치 프로그램 훅 (기존 설치 삭제, 데이터 삭제 질문)
    capabilities/ · tauri.conf.json · icons/(생성) · sidecar/(빌드 때 생성)
  server/                   웹 호스트: server.js (node:http, 정적 dist/) · http-api.js (POST /api/*, 데스크톱 호스트와 공용)
  src/                      React UI (components/ · dialogs/ · lib/ · themes.js · styles.css)
    components/             Toolbar · ControlBar · TreePanel(폴더 트리) · SharesPanel · UsersPanel · SecurityPanel
                            · NetworkPanel · NumberField(−/+ 숫자 칸) · LogPanel(로그 / 접속 주소 탭) · AddressesPanel · StatusBar
                            · StartPage(시작 페이지)
    dialogs/                SettingsDialog(고정 크기·탭) · Share/User/Cert 대화상자 · PathPicker
  test/                     node:test — core / ftp / sftp / desktop 스위트 + reporter.mjs(요약 표)
  scripts/                  start.mjs · dev.mjs · build.mjs · prepare-tauri.mjs · smoke.mjs · generate-icons.mjs …
  doc/                      사용 설명서 (index.html · manual.css · manual.js · img/) — 빌드 때 dist/doc 로 복사
  assets/icon.svg           앱·설치 파일 아이콘 원본
```

## 설정·런타임 파일

설정 폴더(정보 대화상자에 표시): Windows `%APPDATA%\My FTP Server`, macOS `~/Library/Application Support/My FTP Server`, Linux `~/.config/My FTP Server` (웹: `--config`). 이전 Electron 판과 같은 폴더이므로 업데이트해도 설정이 이어집니다. 창 위치·크기는 Tauri 앱 데이터 폴더(`com.shkwon.myftpserver`)의 `window-state.json` 에 따로 저장됩니다.

| 파일 | 설명 |
|------|------|
| `server_settings.json` | 서버 설정 (변경 시 자동 저장, 비밀번호는 `b64:` 난독화) |
| `profiles/*.json` | 이름별 프로파일 |
| `session.json` | 언어·테마·글꼴·창 위치, 로그 높이, 폴더 트리 접힘/폭, 지운 접속 주소 등 UI 환경설정 |
| `ftpserver.log` | 서버 로그 (자동 기록) |
| `server_cert.pem` / `server_cert_key.pem` | 생성한 FTPS 인증서·개인키 (기본 경로) |
| `ssh_host_rsa.pem` | SFTP 호스트 키 (없으면 시작 시 자동 생성) |

## 키보드 단축키

| 키 | 동작 |
|----|------|
| F5 | 현재 설정을 `server_settings.json` 에 저장 |
| F6 | `server_settings.json` 다시 불러오기 |
| Esc | 대화상자 닫기 |
| Delete / Enter | 목록에서 선택 항목 제거 / 편집 |

## 원본(FTPServerWinV10) 대비 달라진 점

| 원본 | 이 구현 |
|------|---------|
| Implicit FTPS 만, `PROT P` 미구현 | Implicit + **Explicit AUTH TLS**, **PROT P** 데이터 채널 암호화 |
| `.pfx` 인증서 생성 | **PEM** 생성(인증서 + 별도 키), `.pem` / `.pfx` 모두 로드 |
| 지문 = SPKI 해시 | **OpenSSH 방식** 지문 — 클라이언트가 보여 주는 값과 일치 |
| PASV 만 | PASV / EPSV / PORT / EPRT, REST 이어받기, RNFR/RNTO, MDTM, MLST |
| 통계는 FTP 만 | SFTP 전송도 집계 |
| 최대 스레드(미사용) | **최대 접속 수** 실제 적용 (421 응답) |
| Windows 전용 | Windows · macOS · Linux · 웹, 40 테마 + 사용자 정의 테마, 한/영, 트레이 |

## 알려진 제한

- SFTP 공개키 인증 미지원 (비밀번호·익명). 심볼릭 링크 관련 요청(READLINK/SYMLINK) 미지원.
- FTP `SITE` 명령, ASCII 모드 변환(TYPE A 는 바이너리로 처리) 미지원.
- 웹 버전의 「키 폴더」·「탐색기에서 열기」는 경로만 안내합니다.

## 라이선스

MIT License — SHKWON (knix008@naver.com)
