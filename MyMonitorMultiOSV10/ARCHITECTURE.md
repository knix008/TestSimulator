# MyMonitor MultiOS — 설계

코드를 처음 읽는 사람을 위한 내부 구조 안내입니다.
사용자 조작은 [UsersGuide.md](UsersGuide.md), 프레임 스펙은 [docs/protocol.md](docs/protocol.md)를 보세요.

작성자: SHKWON(knix008@naver.com)

## 1. 한눈에 보기

```
대상 (Linux / Windows / macOS / RTOS)
        │  TCP :9510  또는  UART
        ▼
  C Agent  (agent/)                 원격 수집, RTOS는 정적 버퍼 포트
        │  MMON v1 프레임
        ▼
  ConnectionManager                 로컬 · TCP · Serial · 시뮬레이터
        │
   ┌────┴────┐
   ▼         ▼
 Electron   Web
 app/       web/dist + web-bridge
 그래프 · 로그 · 설정 · 20테마 · ko/en
```

같은 렌더러(`app/renderer`)를 데스크톱과 웹이 씁니다.
데스크톱은 preload IPC로 `window.monitor`를 넣고, 웹은 `web-bridge.js`가 같은 API를 브라우저에서 구현합니다.

## 2. 디렉터리

| 경로 | 역할 |
|---|---|
| `app/main.js` | Electron 메인. 창, IPC, 설정, 로그 저장 |
| `app/preload.js` | `window.monitor` 브리지 (`contextIsolation`) |
| `app/lib/connection-manager.js` | 대상 연결 수명주기 |
| `app/lib/collector.js` | 로컬 CPU/RAM/Disk는 OS 즉시 샘플. Net만 `systeminformation`을 백그라운드로 |
| `app/lib/background-sampler.js` | 로컬·시뮬레이터 수집을 `worker_threads`에서 돌림 |
| `app/lib/http-client.js` | HTTP/HTTPS GET 폴링 |
| `app/lib/protocol.js` | MMON 코덱, Decoder, JSONL/KV 폴백 |
| `app/lib/logger.js` | 링 버퍼 + 일별 파일 로그 |
| `app/renderer/` | UI (메뉴바, 툴바, 대시보드, 다이얼로그) |
| `app/renderer/web-bridge.js` | 웹용 `window.monitor` (Electron이면 설치하지 않음) |
| `agent/src/` | C 에이전트 (POSIX / Windows / 서비스) |
| `agent/rtos/` | malloc 없는 세션 코어 |
| `agent/include/mmon.h` | 프레임·metric ID 공유 헤더 |
| `scripts/` | 에이전트/앱/웹 빌드, 설치 파일 1개 복사, 테스트 러너 |
| `test/` | `node:test` 유닛·프로토콜·에이전트·웹 테스트 |
| `docs/protocol.md` | MMON v1 스펙 |
| `web/dist/` | `npm run build:web` 산출물 |

## 3. 데스크톱 호스트 (Electron)

렌더러에는 Node가 없습니다. `contextIsolation: true`, `nodeIntegration: false`.
파일·소켓·시리얼은 메인 프로세스만 다룹니다.

```
renderer  -- invoke -->  preload  -- IPC -->  main.js
          <-- event ---           <-- send --
```

| IPC | 방향 | 의미 |
|---|---|---|
| `monitor:start/stop/list` | invoke | 대상 연결 |
| `monitor:serial-ports` | invoke | COM 목록 |
| `monitor:logs` / `export-logs` | invoke | 로그 읽기·저장 |
| `monitor:set-interval` | invoke | 200–10000 ms 구독 주기 |
| `settings:get/set` | invoke | `%AppData%` `settings.json` |
| `settings:open/close` | invoke | 독립 설정 창 열기/닫기 |
| `settings:changed` | event | 설정 창·메인 창 동기화 |
| `app:info` / `app:quit` | invoke | 버전·작성자, 종료 |
| `monitor:targets/metrics/log` | event | 스냅샷·샘플·로그 푸시 |

창 제목은 `MyMonitor MultiOS v${app.getVersion()}` 입니다.
커스텀 메뉴바에 프로그램 아이콘/이름은 두지 않습니다. 네이티브 메뉴는 숨깁니다.

## 4. 웹 호스트

`scripts/build-web.js`가 `app/renderer`와 `app/assets`를 `web/dist`로 복사하고
`../assets/` 경로를 `assets/`로 고칩니다.

`scripts/serve-web.js`는 `web/dist`를 `http://127.0.0.1:9520/`에 올립니다.
없으면 먼저 웹 빌드를 합니다.

웹 브리지는 시뮬레이터, 브라우저 로컬 수집, HTTP JSON 폴링을 제공합니다.
브라우저에서 raw TCP/Serial은 열 수 없어 해당 `start()`는 안내 오류를 던집니다.
설정은 `localStorage`, 로그 보내기는 파일 다운로드입니다.

## 5. ConnectionManager

대상(`target`)은 `id`로 구분합니다. 종류:

| kind | 동작 |
|---|---|
| `local` | `BackgroundSampler` 워커에서 `collectLocal()` (웹은 `setTimeout`으로 UI에 양보) |
| `simulator` | 같은 워커에서 `simMode`: `rtos` 또는 `server` |
| `http` | `GET`으로 JSON(또는 JSONL/MMON) 폴링. 기본 `http://host:9511/metrics` |
| `tcp-client` | 에이전트 `--listen`에 접속 |
| `tcp-server` | 에이전트 `--connect`를 받음 |
| `serial` | UART/COM, `serialport`가 있을 때만 |

수신 데이터는 먼저 MMON Decoder로 조립합니다. 매직 `MN`이 없으면 JSON Lines 또는 `key=value` 한 줄로 폴백합니다.

## 6. C 에이전트와 RTOS

| 파일 | 역할 |
|---|---|
| `mmon_protocol.c` | 프레임 인코드/디코드, CRC-16/CCITT-FALSE |
| `platform_posix.c` / `platform_win.c` | OS별 수집 |
| `win_service.c` | Windows 서비스 `MyMonitorAgent` |
| `rtos/mmon_rtos.c` | 정적 버퍼 세션. 보드가 send/now/collect만 연결 |

기본 포트는 **9510**. 모드:

- `--listen [host:]port` — 모니터가 클라이언트로 붙음
- `--connect host:port` — 에이전트가 모니터 수신 포트로 붙음
- `--http [host:]port` — JSON `GET /metrics` 서버 (기본 9511). CORS 허용.
- `--service install|uninstall|run` — Windows 서비스

Windows Release 실행 파일은 `agent/dist/windows/mmon-agent.exe`입니다.

## 7. MMON v1

리틀엔디안, 최대 1024바이트.

```
MN | ver=1 | type | seq | length | payload | CRC16
```

메시지: HELLO, HELLO_ACK, HEARTBEAT, METRICS, LOG, SUBSCRIBE, ERROR, DISCONNECT.
OS 타입: 1 linux, 2 windows, 3 macos, 4 rtos, 5 electron/web local.

필드와 metric ID는 `docs/protocol.md`와 `agent/include/mmon.h`, `app/lib/protocol.js`가 같아야 합니다. `test/constants.test.js`가 이를 검사합니다.

## 8. UI

- 커스텀 메뉴바: 파일 · 연결 · 보기. 설정과 도움말(프로그램 정보)은 오른쪽. 메뉴와 항목마다 아이콘.
- 상태바: 메시지, 대상 수, 선택, 주기, 그래프 구간, 언어, 테마, 시각. 우측 하단에 크기 변경 마커.
- 툴바 오른쪽: 설정, 프로그램 정보, 국기.
- 툴바: 연결/로컬/RTOS/서버/종료, 로그 보내기, 주기(ms) 좌우 버튼+직접 입력, 그래프 시간 창(초) 좌우 버튼+직접 입력, 설정, 전환 국기(태극기/유니언잭).
- 왼쪽 대상 목록, 가운데 카드+실시간 그래프(`charts.js`). 그래프는 `{t,v}` 샘플을 시간에 누적하고, 툴바 구간(10–600초)만큼만 그립니다. 메트릭 카드 반영과 그래프 그리기는 `requestAnimationFrame`으로 한 프레임에 모읍니다.
- 설정은 `settings.html` 독립 창입니다. 모달이 아니며 드래그로 옮길 수 있고, 메인 창과 같이 씁니다.
- 팝업(연결·프로그램 정보)과 설정 창 제목에는 앱 아이콘이 있습니다.
- 테마 20개: Dark 10 + Light 10 (`themes.css`, `i18n.js`의 `THEMES`).
- 문자열은 `I18N.ko` / `I18N.en`.

메인 창은 `overflow: hidden`으로 창 스크롤바를 두지 않습니다. 대시보드와 로그는 남은 높이에 맞춰 배치됩니다.

## 9. 빌드

루트 `package.json`이 진입점입니다.

| 스크립트 | 결과 |
|---|---|
| `build:agent` | CMake → `mmon-agent` |
| `build:win` / `mac` / `linux` | electron-builder. 대상당 설치 형식 하나(NSIS / DMG / AppImage) |
| `copy:installer` | `app/release`에서 **설치 파일 하나만** 저장소 루트로 복사. `.blockmap`, `latest.yml`은 남김 |
| `build:web` | `web/dist` 정적 사이트 |

Windows 서명은 없습니다(`CSC_IDENTITY_AUTO_DISCOVERY=false`, `skip-win-sign.js`).
앱 아이콘(`app/assets/icon.png`)은 테두리가 투명한 3D 타일이고, 안쪽은 사용량 그래프와 막대로 자원 모니터를 나타냅니다. ICO는 `scripts/ensure-ico.js`가 만듭니다.
메뉴·툴바 아이콘도 테두리 없이 입체 배경 위에 올립니다.

## 10. 테스트

`node:test` + `scripts/run-tests.js` (`--test-force-exit`, 60s 타임아웃).
프로토콜 라운드트립, Decoder 재조립, 수집기, ConnectionManager, 에이전트 CLI/라이브, i18n/테마, 다이얼로그, 설치 파일 1개 복사, 웹 브리지·빌드·서브를 나눕니다.

로컬·시뮬레이터 수집은 `worker_threads` 백그라운드에서 돕니다. 주기가 200 ms여도 메인/렌더러 클릭이 막히지 않습니다. 네트워크 SI 호출도 워커 안입니다. ConnectionManager는 `afterEach`에서 워커와 타이머를 지워 프로세스가 남치 않게 합니다.
