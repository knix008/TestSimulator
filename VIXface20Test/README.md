# VixReader Test (Multi-OS / Web)

**VixReaderTest**(C# WinForms) 하드웨어 리더 펌웨어 테스트 프로그램을 JavaScript로 다시 만든
크로스플랫폼 버전입니다. **Windows / macOS / Linux 데스크톱**과 **웹 브라우저**에서 동일한
코드로 동작합니다.

- 통신: **Ethernet 기반 HTTPS** (기본). 장치에 AT 명령을 HTTPS POST로 보내고
  `OK` / `FAIL` / 데이터 문자열 응답을 받습니다.
- 버튼: **`src/config/buttons.json` 파일로 정의** — 코드 수정 없이 버튼/명령을 추가·변경 가능.
- UI: **고정 창(1280×820), 스크롤바 없음.**
- 아이콘: **원본 Intellivix 로고 재사용** (`src/assets/logo-source.ico`).
- 설치 파일: electron-builder로 Windows(NSIS `.exe`), macOS(`.dmg`), Linux(`AppImage`,`.deb`) 생성.

## 문서

- **[사용자 가이드 (UsersGuide.md)](UsersGuide.md)** — 설치·연결·버튼별 기능·보고서·문제 해결 (최종 사용자용)
- **[아키텍처 (Architecture.md)](Architecture.md)** — 구조·데이터 흐름·전송 추상화·설정 스키마·확장 방법 (개발자용)

---

## 빠른 시작

```bash
npm install          # 의존성 설치 (electron 포함)
npm run mock         # (터미널 1) 테스트용 가짜 장치 HTTPS 서버 실행 (https://0.0.0.0:8443/at)
npm start            # (터미널 2) 데스크톱 앱 실행
```

앱에서 IP를 `127.0.0.1`, 포트 `8443`으로 두고 **연결...** 을 누르면 mock 장치와 통신합니다.

> Windows에서 `npm start` 시 `ELECTRON_RUN_AS_NODE`가 설정돼 있으면 Electron이 순수 Node로
> 실행되어 창이 뜨지 않습니다. 그 경우 `set ELECTRON_RUN_AS_NODE=` (PowerShell: `$env:ELECTRON_RUN_AS_NODE=""`)
> 로 해제 후 실행하세요.

### 웹으로 실행

```bash
npm run web          # http://localhost:5173 에서 src/ 정적 서빙
```

브라우저는 raw TCP 소켓을 열 수 없으므로 웹 빌드는 **HTTPS**로만 통신합니다. 장치(또는 mock)가
**자체 서명 인증서를 브라우저가 신뢰**하고 **CORS 헤더**를 보내야 합니다(mock 서버는 CORS 포함).

---

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm start` | Electron 데스크톱 앱 실행 |
| `npm run mock` | HTTPS 가짜 장치 서버 (`PORT`, `FAIL_RATE` 환경변수 지원) |
| `npm run web` | 웹 빌드 정적 서버 |
| `npm run smoke` | 하드웨어 없이 프로토콜 E2E 검증 |
| `npm run icons` | 원본 로고에서 설치용 아이콘 재생성 |
| `npm run build:win` / `build:mac` / `build:linux` | 설치 파일 빌드 |

---

## 설치 파일 만들기

```bash
npm run build:win     # dist/ 에 NSIS 설치 exe
npm run build:mac     # dist/ 에 .dmg / .zip  (macOS에서 실행해야 함)
npm run build:linux   # dist/ 에 .AppImage / .deb
npm run build:all     # 한 번에 mac+win+linux (해당 도구/OS 필요)
```

> 각 OS 설치본은 해당 OS(또는 CI)에서 빌드하는 것이 안전합니다. macOS `.dmg`는 macOS에서만
> 만들 수 있습니다. 아이콘은 `build/icon.ico`(Windows)와 `build/icon.png`(1024, macOS/Linux)를
> 사용하며 `npm run icons`로 원본 로고에서 다시 생성합니다.

---

## 버튼 바꾸기

`src/config/buttons.json` 을 편집합니다. 각 버튼:

```json
{ "id": "nfcTest", "label": "NFC 테스트 실행", "command": "AT+TEST=NFC", "kind": "test", "column": "NFC" }
```

- `kind`: `read`(데이터 응답), `test`(OK/FAIL), `write`(값 입력 후 전송, `{value}` 치환)
- `column`: 결과 저장/CSV 열 이름
- `connection.handshake`: 연결 시 순서대로 보낼 명령 (기본 `["AT","AT+TEST=BEGIN"]`)

**설치 후 재빌드 없이 변경**하려면 데스크톱 사용자 데이터 폴더에 `buttons.json` 을 두면 됩니다.
앱이 그 파일을 우선 읽습니다.

- Windows: `%APPDATA%/VixReader Test/buttons.json`
- macOS: `~/Library/Application Support/VixReader Test/buttons.json`
- Linux: `~/.config/VixReader Test/buttons.json`

---

## 프로젝트 구조

```
electron/          Electron 메인/프리로드 (HTTPS IPC, 설정/세션/CSV 파일 처리)
src/               공용 프론트엔드 (데스크톱 렌더러 + 웹에서 동일하게 동작)
  index.html
  styles.css
  app.js           UI 컨트롤러 (버튼 렌더링, 명령 실행, 결과/CSV)
  core/
    deviceClient.js  HTTPS 전송 추상화 + 응답 해석
    store.js         결과 저장(파일/localStorage) + CSV 내보내기
  config/buttons.json  버튼·명령 정의
  assets/            아이콘 (원본 Intellivix 로고 재사용)
server/
  mockDevice.mjs   테스트용 HTTPS 가짜 장치
  webServer.mjs    웹 정적 서버
  certs/           mock 서버 자체 서명 인증서
scripts/
  make-icons.mjs   원본 로고 → 설치용 아이콘
  smoke.mjs        프로토콜 E2E 검증
build/             설치 아이콘 (icon.ico, icon.png)
```

## 장치 HTTPS 프로토콜

앱은 `POST https://<ip>:<port><path>` 로 요청하며 **본문 = AT 명령 문자열**, 응답 본문은
`OK` / `FAIL` / 데이터(예: 시리얼, MAC) 텍스트입니다. 실제 장치의 HTTPS 규격이 다르면
`src/core/deviceClient.js` 의 `send()` 와 `server/mockDevice.mjs` 를 맞추면 됩니다.
