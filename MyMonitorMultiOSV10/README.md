# MyMonitor MultiOS v10

Electron 모니터와 C 원격 에이전트로 CPU, RAM, Disk, Load, Network를 실시간 그래프와 로그로 봅니다.
Serial / Ethernet을 지원하고, RTOS도 같은 MMON 프레임으로 붙일 수 있습니다.

작성자: **SHKWON(knix008@naver.com)**

## 문서

| 문서 | 내용 |
|---|---|
| [UsersGuide.md](UsersGuide.md) | 설치, 화면, 연결, 에이전트, 웹 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 프로세스, 디렉터리, 프로토콜, 빌드 |
| [docs/protocol.md](docs/protocol.md) | MMON v1 프레임 · metric ID |
| [agent/windows/README.md](agent/windows/README.md) | Windows 에이전트 · 서비스 |
| [agent/rtos/README.md](agent/rtos/README.md) | RTOS 포트 |
| [test/README.md](test/README.md) | 테스트 실행 |

## 구성

```
대상 시스템 (Linux / Windows / macOS / RTOS)
        │  TCP :9510  또는  UART
        ▼
  C Agent  (agent/)          ← 원격, RTOS 포트 가능
        │
        ▼
  Electron 모니터 (app/)     ← 로컬 수집 + 원격 연결 + 그래프 + 로그
        │
        ▼
  Web UI (web/dist) / Linux / macOS / Windows
```

- **로컬 Agent**: 모니터가 떠 있는 머신 자원을 수집합니다.
- **원격 Agent**: C 에이전트가 대상에서 측정값을 밀어줍니다.
- **시뮬레이터**: RTOS/서버 샘플을 앱 안에서 재생합니다.

## 빠른 시작

필요: Node.js 18+

```bash
cd app
npm install
cd ..
npm start
```

웹:

```bash
npm run web
```

브라우저에서 `http://127.0.0.1:9520/` 이 열립니다.

Windows 에이전트:

```bash
npm run build:agent
npm run agent
```

## 루트 명령

| 명령 | 동작 |
|---|---|
| `npm start` | Electron 모니터 |
| `npm run web` / `npm run start:web` | 웹 빌드 후 `:9520` 실행 |
| `npm run web:serve` | 이미 만든 `web/dist` 실행 |
| `npm run agent` | Windows 에이전트 수신 (`:9510`) |
| `npm run build` / `npm run build:agent` | C 에이전트 Release |
| `npm run build:agent:debug` | C 에이전트 Debug |
| `npm run build:app` / `npm run dist` | 현재 OS 설치 파일. 루트에 **하나만** 복사 |
| `npm run build:win` / `npm run dist:win` | Windows NSIS |
| `npm run build:mac` / `npm run dist:mac` | macOS DMG |
| `npm run build:linux` / `npm run dist:linux` | Linux AppImage |
| `npm run build:web` / `npm run dist:web` | 웹 정적 파일 (`web/dist`) |
| `npm run copy:installer` | `app/release`에서 설치 파일 하나만 루트로 복사 |
| `npm run rebuild` | 산출물 삭제 후 설치 파일 다시 빌드 |
| `npm run clean` | `agent/build`, `app/release`, `web/dist`, `test/.tmp`, 루트 설치 파일 |
| `npm test` / `npm run test:unit` | `test/*.test.js` |
| `npm run test:protocol` | MMON 셀프테스트 |
| `npm run test:watch` | 테스트 감시 |

Windows에서 Serial native 모듈 빌드가 실패해도 TCP/로컬/시뮬레이터는 동작합니다.
웹에서는 Serial/TCP 직접 연결 대신 로컬·시뮬레이터·HTTP를 쓰세요.

타이틀 바: `MyMonitor MultiOS v10.0.0`. 메뉴바에는 프로그램 아이콘과 이름을 넣지 않습니다.
