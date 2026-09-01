# VixReader Test — 아키텍처

원본 `VixReaderTest`(C# WinForms, raw TLS 소켓 + AT 명령)를 하나의 JavaScript 코드베이스로
**Windows·macOS·Linux 데스크톱 + 웹 브라우저**에서 동작하도록 재설계한 문서입니다.

---

## 1. 설계 목표와 결정

| 요구 | 결정 |
|------|------|
| JavaScript 기반, 멀티 OS + 웹 | **Electron + 순수 ESM JS 프론트엔드**. 같은 `src/` 를 렌더러와 브라우저에서 재사용, 빌드 단계 없음 |
| Ethernet 기반 통신, 웹 지원 | **HTTPS POST** 로 AT 명령 전송(브라우저는 raw TCP 불가). 원본 TLS 소켓을 HTTPS로 대체 |
| 버튼 변경 가능 | 버튼·명령을 **`buttons.json`** 으로 정의(데이터 주도). 설치 후엔 userData 사본 우선 |
| 고정 창, 스크롤바 없음 | Electron `resizable:false` + CSS `overflow:hidden` / 스크롤바 숨김 |
| 설치 파일 | **electron-builder** (NSIS / dmg / AppImage·deb) |
| 3D처럼 보이는 아이콘 | 원본 Intellivix 로고 재사용(요구 변경에 따라 생성 대신 재활용) |

---

## 2. 실행 형태(2가지 런타임)

```
                    ┌──────────────────── 공용 프론트엔드 (src/) ────────────────────┐
                    │  index.html · styles.css · app.js · core/*.js · config/*.json  │
                    └───────────────────────────────────────────────────────────────┘
                               ▲                                   ▲
             preload로 window.vixapi 주입                    표준 브라우저 API만 사용
                               │                                   │
        ┌──────────────────────┴───────────┐         ┌─────────────┴──────────────┐
        │  Electron (데스크톱)              │         │  Web (브라우저)             │
        │  main.js  ── IPC ──▶ node https  │         │  fetch() ──▶ 장치 HTTPS     │
        │  자체서명 허용/파일/CSV/설정      │         │  localStorage / Blob 다운로드│
        └──────────────────────────────────┘         └─────────────────────────────┘
```

- **환경 감지**: `deviceClient.js` 의 `isElectron = !!window.vixapi`.
  - Electron: 통신·파일·CSV·설정을 **메인 프로세스 IPC**로 위임(자체 서명 인증서 허용, CORS 무관).
  - Web: `fetch` 직접 사용, 저장은 `localStorage`, CSV는 Blob 다운로드.

---

## 3. 컴포넌트

### 프론트엔드 `src/`
| 파일 | 역할 |
|------|------|
| `index.html` | 고정 레이아웃 셸(상단 연결/명령 영역/결과/로그/보고서 모달) |
| `styles.css` | 다크 테마, 고정 창 맞춤, 스크롤바 숨김 |
| `app.js` | UI 컨트롤러: 설정 로드 → 버튼 렌더 → 명령 실행 → 결과/로그/CSV |
| `core/deviceClient.js` | **전송 추상화**(HTTPS) + 응답 해석(`interpretResponse`) + LED 색상 매핑 |
| `core/store.js` | 결과 세션 저장(파일/localStorage) + CSV 생성/내보내기 |
| `config/buttons.json` | 앱 메타·연결 기본값·버튼/그룹·LED 색상·결과 열 정의 |
| `assets/` | 아이콘(원본 로고 재사용): `icon.png`, `logo-source.ico` |

### Electron `electron/`
| 파일 | 역할 |
|------|------|
| `main.js` | 창 생성(고정 크기) + IPC 핸들러 |
| `preload.js` | `contextBridge` 로 `window.vixapi` 안전 노출 |

IPC 채널:
| 채널 | 처리 |
|------|------|
| `device:send` | node `https.request`(`rejectUnauthorized:false`)로 AT 명령 POST → `{ok,status,body}` |
| `config:read` | userData/`buttons.json` 우선, 없으면 번들 설정 반환 |
| `sessions:load` / `sessions:save` | userData `sessions.json` 읽기/쓰기 |
| `csv:save` | 저장 대화상자 → UTF-8 BOM 으로 CSV 파일 저장 |

### 서버 `server/`
| 파일 | 역할 |
|------|------|
| `mockDevice.mjs` | 하드웨어 없이 테스트하는 **HTTPS 가짜 장치**(AT→OK/FAIL/데이터, CORS 포함, `FAIL_RATE` 지원) |
| `webServer.mjs` | 웹 빌드용 무의존성 정적 서버 |
| `certs/` | mock 자체 서명 인증서(openssl 생성) |

### 스크립트 `scripts/`
| 파일 | 역할 |
|------|------|
| `smoke.mjs` | mock 인프로세스 기동 → AT 명령 E2E 검증(하드웨어/Electron 불필요) |
| `make-icons.mjs` | 원본 로고에서 설치용 아이콘 재생성 |

---

## 4. 데이터 흐름 — 명령 1회

```
사용자 클릭
  └▶ app.js: runCommand(btn)
       ├─ kind=="write" 면 값 입력받아 {value} 치환
       ├─ client.send(command)                    ── deviceClient
       │     ├─ Electron: window.vixapi.sendCommand → IPC → node https → 장치
       │     └─ Web:      fetch(https://ip:port/path, POST body=command) → 장치
       ├─ interpretResponse(kind, resp) → {ok, value, verdict}
       │     read → data/fail,  test/write → pass/fail/unknown
       ├─ store.record(ip, column, value)         ── 세션에 기록 후 영속화
       │     (읽은 시리얼이 바뀌면 store.onSerial 이 새 세션 생성)
       └─ 결과 박스 색/텍스트 + 로그 갱신
```

연결 핸드셰이크: `client.connect(["AT","AT+TEST=BEGIN"])` 를 순차 전송, `FAIL` 없으면 연결됨.

---

## 5. 장치 HTTPS 프로토콜

- 요청: `POST https://<ip>:<port><path>`  (기본 `path=/at`), **본문 = AT 명령 문자열**.
- 응답: 본문 텍스트 — `OK` / `FAIL` / 데이터(시리얼·MAC·버전 등).
- 실제 장치 규격이 다르면 **두 곳만 맞추면 됩니다**:
  - `src/core/deviceClient.js` 의 `send()` (요청 형식)
  - `server/mockDevice.mjs` 의 `respond()` (mock 동작)

원본 대비 변경점: 원본은 raw TLS 소켓으로 `AT...\r\n` 을 주고받았으나, 웹 호환을 위해
**HTTPS 요청/응답**으로 감쌌습니다. 명령 문자열과 OK/FAIL 판정 규칙은 동일합니다.

---

## 6. 설정 `buttons.json`

```jsonc
{
  "app":        { "title", "subtitle", "version", "footer" },
  "connection": {
    "defaultIp", "defaultPort", "path", "timeoutMs",
    "handshake": ["AT", "AT+TEST=BEGIN"],      // 연결 시 순차 전송
    "deviceTypes": [ { "value":"M", "label":"..." } ]
  },
  "groups": [                                   // 명령 버튼 그룹(순서/개수 자유)
    { "id", "title", "buttons": [
      { "id", "label", "command", "kind", "column",
        "prompt?" }                             // kind=="write" 일 때 입력창 문구
    ]}
  ],
  "ledColor": {                                 // 채널 조합 → 명령 매핑
    "channels": [ { "id":"red", "label", "color" }, ... ],
    "commandMap": { "110": "AT+TEST=LED_YELLOW", ... }  // R G B 비트 순서
  },
  "resultColumns": [ "SERIAL", "MAC", ... ]     // 저장/CSV 열
}
```

- `kind`: `read`(데이터 응답) · `test`(OK/FAIL) · `write`(값 입력 후 전송, `{value}` 치환).
- `command` 에 `{value}` 가 있으면 `write` 로 취급되어 입력값이 채워집니다.
- 버튼 추가/삭제/이름변경은 이 파일만 수정하면 됩니다(코드 변경 불필요).

---

## 7. 저장 모델

원본 SQLite `TestResults` 스키마를 무의존성으로 대체:

- **세션 = 한 행**. 자동 증가 `ID`, `CREATE_DATE`, `IP_ADDRESS`, 각 명령 `column`, `ERROR_MESSAGE`.
- 시리얼 변경 감지 시 새 세션 생성(`store.onSerial`).
- 저장소: 데스크톱=userData `sessions.json`, 웹=`localStorage`.
- CSV: 헤더 + 날짜 범위 필터, 콤마/따옴표/개행 이스케이프, UTF-8 BOM(Excel 호환).

---

## 8. UI 제약 — 고정 창 / 무스크롤

- Electron: `width:1280, height:820, resizable:false, maximizable:false, useContentSize:true`.
- CSS: `html,body{overflow:hidden}` + `body` flex 컬럼(상단/본문 flex:1/로그 고정).
  스크롤바는 `scrollbar-width:none` 및 `::-webkit-scrollbar{display:none}` 로 숨김
  (로그는 휠로 스크롤되지만 막대는 보이지 않음).

---

## 9. 아이콘 & 빌드 파이프라인

- 아이콘: **원본 Intellivix 로고 재사용**. `src/assets/logo-source.ico`(원본) →
  `build/icon.ico`(Windows, 원본 그대로) + `build/icon.png`(1024, macOS/Linux, electron-builder가 `.icns` 변환).
  `npm run icons` 로 재생성.
- 설치 파일: `electron-builder`(package.json `build`).
  - Windows: NSIS(설치 경로 선택 가능, 바탕화면/시작메뉴 바로가기)
  - macOS: dmg + zip
  - Linux: AppImage + deb
  - 각 OS 산출물은 해당 OS(또는 CI)에서 빌드 권장.

---

## 10. 확장 포인트

| 하고 싶은 것 | 방법 |
|--------------|------|
| 버튼/명령 추가·변경 | `src/config/buttons.json` 편집 |
| 실제 장치 프로토콜 반영 | `deviceClient.send()` 와 `mockDevice.respond()` 수정 |
| 다른 전송 방식(예: WebSocket) | `deviceClient.js` 에 전략 추가(`isElectron` 분기와 동일 패턴) |
| 저장소 교체(DB 등) | `store.js` 의 `persist()`/`load()` 와 관련 IPC 교체 |
| 창 크기 변경 | `electron/main.js` 창 옵션 + CSS 레이아웃 함께 조정 |

---

## 11. 검증

- `npm run smoke` — mock 기동 후 `AT`, `AT+SERIAL?`, `AT+TEST=NFC` 등 9개 케이스 E2E(하드웨어 불필요).
- Electron 실물 구동 확인: 렌더러 → IPC → node https → mock 경로로 연결/시리얼읽기/NFC 성공까지 확인됨.
