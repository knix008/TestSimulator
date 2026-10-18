# MyCalc 10.0

기본, 공학용, 프로그래머, 2D/3D 그래프, 환율 변환, 단위 변환, 날짜 계산을 갖춘 계산기입니다. 같은 화면을 브라우저와 Tauri 데스크톱 앱에서 사용합니다.

- 사용 방법: [USERSGUIDE.md](USERSGUIDE.md)
- 코드 구조: [ARCHITECTURE.md](ARCHITECTURE.md)

## 준비

Node.js, npm, Rust(rustc, cargo)가 필요합니다. Windows에서는 WebView2, Linux에서는 WebKitGTK, macOS에서는 시스템 WebKit을 사용합니다.

```bash
npm install
```

## 실행

```bash
npm start
```

브라우저에서 보려면 `index.html`을 열거나 프로젝트 루트를 정적 서버로 제공합니다. 기능 테스트 페이지는 `test/index.html`입니다.

## 테스트

```bash
npm test
```

헤드리스 Edge 또는 Chrome으로 테스트 페이지를 실행하고, 실행한 케이스 이름과 통과 여부, 시간을 출력합니다. 모두 통과해야 종료 코드가 0입니다.

케이스는 `test/cases.js`에 묶음으로 들어 있습니다. 식 계산, 프로그래머, 화면과 모드, 공학용과 메모리, 그래프, 환율, 단위, 날짜, 테마와 설정, 키패드, 메모장, Windows 설치 스크립트를 확인합니다. 실행할 때마다 묶음 이름과 케이스 이름, 통과 여부, 시간이 출력됩니다.

## 빌드

패키지는 지금 이 컴퓨터의 운영체제용으로 만들어집니다. Windows에서 Linux나 macOS 패키지를 만들지는 않습니다.

| 명령 | 산출물 |
| --- | --- |
| `npm run build:web` | `dist/web` 정적 사이트 |
| `npm run build:win` | `src-tauri/target/release/bundle/nsis/` 의 NSIS 설치 파일. 사본을 프로젝트 루트에도 둡니다 |
| `npm run build:linux` | `src-tauri/target/release/bundle/` 의 deb, AppImage |
| `npm run build:macos` | `src-tauri/target/release/bundle/` 의 `MyCalc.app`, dmg |
| `npm run build` | 지금 운영체제에 맞는 기본 패키지 |

Windows 설치 마법사는 한국어와 영어를 고를 수 있고, 현재 사용자용과 모든 사용자용 가운데 설치 대상을 고릅니다. 설치 폴더는 바꿀 수 있습니다. 이미 깔려 있으면 프로그램을 지운 뒤 다시 깔고, 언어·테마·그래프 식·환율표는 지울지 물은 뒤에만 지웁니다. 조용히 설치하면(`/S`) 그 설정은 남깁니다. 시작 메뉴 바로 가기 이름은 MyCalc입니다. 설치를 마칠 때 같은 이름의 바탕 화면 바로 가기를 만들 수 있습니다.

Linux 패키지를 설치하면 `mycalc` 실행 파일이 있습니다. macOS 패키지는 `MyCalc.app`이며 서명되어 있지 않습니다.
