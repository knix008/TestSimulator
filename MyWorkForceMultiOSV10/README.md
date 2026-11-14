# MyWorkForce

프로젝트, 이슈, 스크럼·칸반 보드, 백로그, 스프린트, 로드맵, 대시보드, 보고서, 서비스 대기열을 한 작업 공간에서 다룹니다. 웹과 Windows, macOS, Linux 데스크톱에서 같은 화면을 씁니다.

작업 공간은 `.mwf` 파일입니다. 내용은 JSON이며, 웹에서는 브라우저에 자동으로 남고 데스크톱에서는 앱 데이터 폴더에도 남습니다.

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
| `npm run build:web` | `dist/` 정적 파일 |
| `npm run build:icons` | 앱 아이콘 |
| `npm run build:win` | Windows 설치 파일 |
| `npm run build:mac` | macOS 설치 파일 |
| `npm run build:linux` | Linux 패키지 |

## 화면

메뉴 막대가 창 제목입니다. 왼쪽은 작업, 살펴보기, 관리이고 오른쪽은 고른 이슈입니다. 언어는 KO / EN, 색은 라이트 20종과 다크 20종, 시스템, 사용자 정의입니다.

처음 실행하면 쇼핑몰 프로젝트와 고객 지원 프로젝트가 들어 있는 예제가 열립니다. 홈에서 빈 작업 공간으로 바꿀 수 있습니다.

같은 작업 공간을 여러 프로세스가 동시에 고치면 자동 저장이 서로 덮어씁니다. 한 복사본만 열어 두세요.

자세한 사용은 `UsersGuide.md`, 질의는 `docs/WQL.md` 입니다. 구조는 `ARCHITECTURE.md` 입니다.
