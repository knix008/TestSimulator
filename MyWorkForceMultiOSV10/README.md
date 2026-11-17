# MyWorkForce

프로젝트, 이슈, 스크럼·칸반 보드, 백로그, 스프린트, 로드맵, 대시보드, 보고서, 서비스 대기열을 한 작업 공간에서 다룹니다. 웹과 Windows, macOS, Linux 데스크톱에서 같은 화면을 씁니다.

작업 공간은 `.mwf` 파일입니다. 내용은 JSON이며, 웹에서는 브라우저에 자동으로 남고 데스크톱에서는 앱 데이터 폴더에도 남습니다. 한 회사의 사람은 각자 로그인해서 같은 작업 공간을 씁니다. 기본 저장소는 이 컴퓨터의 SQLite이고, MySQL, MariaDB, SQL Server, PostgreSQL에도 연결할 수 있습니다. 데이터 서비스는 회사 네트워크의 `1481` 포트에서 받고, 로그인 세션이 있어야 작업 공간을 읽고 씁니다. MyWorkForce Talk은 같은 설치에 함께 들어가며, 같은 계정으로 대화하고 파일을 주고받습니다. 작업 알림도 Talk의 알림 방으로 갑니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:1480` 을 엽니다.

데스크톱 창은 다음으로 띄웁니다. Rust와 플랫폼별 웹뷰가 필요합니다.

```bash
npm start
```

| 명령 | 하는 일 |
| --- | --- |
| `npm test` | 기능별 영어 결과. 각 항목의 시간과 색으로 맞춘 요약 |
| `npm run server` | 데이터 서비스. 개발 서버가 같이 띄웁니다 |
| `npm run build:web` | `dist/` 정적 파일 |
| `npm run build:icons` | 앱 아이콘 |
| `npm run build:win` | Windows 설치 파일 `MyWorkForce-Setup-<버전>.exe` 를 만들어 프로젝트 루트와 `release/` 에 복사합니다 |
| `npm run build:mac` | macOS 설치 파일 `MyWorkForce-<버전>-<arch>.dmg` (루트와 `release/`) |
| `npm run build:linux` | Linux 패키지 `.deb`, `.rpm`, `.AppImage` (루트와 `release/`) |
| `npm run stage` | 설치본에 넣을 데이터 서비스와 Node를 `src-tauri/runtime/`에 준비하고, 빈 폴더에서 한 번 띄워 확인합니다. 빌드가 먼저 실행합니다 |
| `npm run clean` | 빌드 결과, 설치 파일, 준비한 데이터 서비스, 테스트 결과, 캐시를 지웁니다. `-- --dry-run` 은 지울 목록만 보여 줍니다 |
| `npm run clean:all` | `clean` 에 더해 `node_modules/` 도 지웁니다. 다음에는 `npm install` 부터 합니다 |

## 화면

메뉴 막대가 창 제목입니다. 왼쪽은 작업, 살펴보기, 관리이고 오른쪽은 고른 이슈입니다. 언어는 KO / EN, 색은 라이트 20종과 다크 20종, 시스템, 사용자 정의입니다.

처음 실행하면 시작 화면에서 튜토리얼, 사용 설명서, 작업 질의, 스무 개가 넘는 예제 중 하나를 고릅니다. 예제에는 쇼핑몰과 고객 지원도 들어 있습니다. 홈에서 빈 작업 공간으로 바꿀 수 있습니다.

같은 작업 공간을 여러 프로세스가 동시에 고치면 자동 저장이 서로 덮어씁니다. 한 복사본만 열어 두세요.

자세한 사용은 `UsersGuide.md`, 질의는 `docs/WQL.md` 입니다. 구조는 `ARCHITECTURE.md` 입니다.
