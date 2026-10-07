# 마이 캘린더 (My Calendar)

바탕화면에 두는 투명 캘린더입니다. Web, Linux, macOS, Windows에서 같은 화면을 사용합니다.

- 사용 방법: [USERSGUIDE.md](USERSGUIDE.md)
- 구조와 개발 안내: [ARCHITECTURE.md](ARCHITECTURE.md)

## 기능

- **투명한 창:** 제목 표시줄 없이 툴바로 달을 이동하고, 창을 끌어 옮깁니다. 배경 투명도는 0%에서 100%까지 정할 수 있고, 글자는 읽을 수 있게 유지됩니다.
- **테마:** 라이트 20종, 다크 20종.
- **배경 이미지:** 캘린더, 일정 관리, 인쇄 미리 보기, 알림 창에 그림을 깔고 그림의 투명도를 정할 수 있습니다. 설정 창과 프로그램 정보는 그대로 둡니다.
- **언어:** 한국어와 English. 트레이 메뉴에서 바로 바꿀 수 있습니다.
- **공휴일:** 약 200개 나라를 지원합니다.
  - [Nager.Date](https://date.nager.at)에서 인터넷으로 확인합니다.
  - 연결할 수 없으면 마지막으로 확인한 내용을 보여 줍니다.
  - 그것도 없으면 내장 규칙([date-holidays](https://github.com/commenthol/date-holidays))으로 계산합니다.
- **음력과 24절기:** 날짜 아래에 작게 표시합니다.
- **일정:**
  - 종일 또는 시간 지정 일정을 만들 수 있습니다.
  - 날짜는 양력과 음력 중에 골라 넣습니다. 기본은 양력이고, 음력으로 넣으면 양력 날짜를 바로 보여 줍니다.
  - 매주, 매월, 매년 반복하고, 간격과 종료일을 정할 수 있습니다. 음력 일정은 매월·매년 반복할 때 음력 날짜를 따라갑니다.
  - 색상을 고르고, 반복 일정은 하루만 따로 삭제할 수 있습니다.
- **알림:** 캘린더가 실행 중이면 정한 시간에 화면 오른쪽 아래에 팝업이 뜹니다. 5분 뒤 다시 알리거나 확인할 수 있습니다.
- **창:** 설정, 일정 관리, 인쇄 미리 보기는 데스크톱에서 별도 창으로 열립니다.
- **우클릭 메뉴:** 날짜 칸, 타이틀 바, 빈 곳을 우클릭하면 아이콘이 붙은 메뉴가 열립니다.
- **인쇄 미리 보기 (Ctrl+P):** 시작 달, 개월 수, 용지, 방향, 여백, 인쇄할 내용을 정합니다. 확대·축소하며 확인한 뒤 인쇄합니다.
- **날짜 글꼴:** 크기 비율, 글꼴, 굵기, 기울임꼴을 정합니다. 창과 전체 화면의 글꼴은 따로 기억됩니다.
- **전체 화면 (배경화면 모드):**
  - 최대화하면 캘린더가 모든 창 아래로 내려가 배경화면처럼 보입니다.
  - ESC를 누르면 원래 크기로 돌아옵니다.
- **창 크기 기억:** 데스크톱 창 크기는 저장되어 다음 실행 때 같은 크기로 열립니다.
- **시스템 트레이:**
  - 데스크톱에서는 작업 표시줄 대신 트레이에만 표시됩니다.
  - 창을 닫으면 트레이로 숨고, 종료는 트레이 메뉴에서 합니다.
- **자동 실행:** 시스템 시작 시 자동 실행을 설정할 수 있습니다.

## 설치 언어

처음 실행할 때 한국어 또는 English를 고릅니다. 설치 프로그램에서 이미 고른 경우에는 그 언어로 바로 열립니다.

- **Windows:** NSIS 설치 파일이 설치 전에 언어 선택 창을 띄웁니다. 선택한 언어는 앱 폴더의 `install-language.txt`에 저장됩니다.
- **Linux:** `installer/linux/install.sh`
- **macOS:** `installer/macos/install.command`
- **Web:** 첫 화면에서 고릅니다.

## 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
npm test           # 단위·화면 테스트
npm start          # 데스크톱 앱 실행 (tauri dev)
npm run start:web  # 브라우저에서 실행
```

브라우저 주소는 `http://localhost:1420`입니다. 페이지 배경은 투명도를 보여 주려고 깔아 둔 예시이고, 데스크톱 앱에서는 실제 바탕화면이 비칩니다.

## 데스크톱 빌드

[Tauri 사전 요구 사항](https://tauri.app/start/prerequisites/)이 필요합니다. Rust 외에 운영체제별로 다음이 필요합니다.

- Windows: WebView2
- Linux: WebKitGTK
- macOS: Xcode 명령줄 도구

```bash
npm run icon         # 앱 아이콘과 트레이·창 아이콘 다시 만들기
npm run build:win    # Windows NSIS 설치 파일
npm run build:linux  # deb, rpm, AppImage
npm run build:mac    # dmg
npm run build:web    # dist/ 웹 배포 파일
```

각 명령은 해당 운영체제에서 실행합니다. 설치 파일은 `src-tauri/target/release/bundle/` 아래에 만들어집니다. Windows 파일은 `nsis/`에 있습니다.

빌드가 끝나면 설치 파일 하나가 프로젝트 루트로 복사됩니다(예: `My Calendar_1.0.0_x64-setup.exe`). 이전 빌드에서 복사된 설치 파일은 지워지므로 루트에는 항상 최신 파일 하나만 남습니다. Linux에서는 AppImage를 복사합니다. 이미 빌드한 결과만 다시 복사하려면 `npm run copy:installer`를 실행합니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `src/domain/` | 달력 계산, 공휴일, 음력, 일정, 알림, 설정, 인쇄, 번역 문구 |
| `src/ui/` | React 화면과 컴포넌트 |
| `src/platform/desktop.ts` | Tauri API를 감싼 데스크톱 기능 (웹에서는 아무 일도 하지 않음) |
| `src-tauri/` | Rust 앱, 트레이, 창 관리, 설치 설정 |
| `assets/` | 프로그램 아이콘(`app.ico`, `app.png`)과 설치 파일 아이콘(`installer.ico`) |
| `scripts/` | 아이콘 생성, 설치 파일 복사 스크립트 |
| `installer/` | Linux, macOS 설치 스크립트 |
| `test/` | Vitest 테스트 |

자세한 구조는 [ARCHITECTURE.md](ARCHITECTURE.md)에 있습니다.
