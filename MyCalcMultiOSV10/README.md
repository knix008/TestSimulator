# MyCalc 10.0

기본, 공학용, 프로그래머, 2D/3D 그래프, 환율 변환, 단위 변환을 갖춘 계산기입니다. 같은 화면을 브라우저와 Electron 데스크톱 앱에서 사용합니다.

- 사용 방법: [USERSGUIDE.md](USERSGUIDE.md)
- 코드 구조: [ARCHITECTURE.md](ARCHITECTURE.md)

## 준비

Node.js와 npm이 필요합니다.

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

케이스는 열다섯 묶음입니다. 식 계산, 프로그래머, 화면과 모드, 공학용과 메모리, 그래프, 환율, 테마와 설정, 제품 기능에 더해 함수 전수 검사, 키패드 배치, 단위 변환, 프로그래머 전수 검사, 그래프 색과 축, 변환 키패드, 그래프 창 크기를 확인합니다.

## 빌드

| 명령 | 산출물 |
| --- | --- |
| `npm run build:web` | `dist/web` 정적 사이트 |
| `npm run build:win` | `release/MyCalc-10.0.0-windows-x64-setup.exe` (사본을 프로젝트 루트에도 둡니다) |
| `npm run build:win:arm64` | Windows ARM64 설치 파일 |
| `npm run build:win:ia32` | Windows 32비트 설치 파일 |
| `npm run build:linux` | `release/MyCalc-10.0.0-linux-x64.tar.gz`, `.zip` |
| `npm run build:linux:arm64` | Linux ARM64 아카이브 |
| `npm run build:macos` | `release/MyCalc-10.0.0-macos-x64.zip` (`MyCalc.app`) |
| `npm run build:macos:arm64` | macOS Apple Silicon zip |
| `npm run build` | Web, Windows, Linux, macOS x64를 순서대로 빌드 |

Windows 설치 마법사에서는 설치 폴더를 바꿀 수 있고, 바탕 화면 바로 가기를 선택할 수 있습니다. 시작 메뉴에는 MyCalc 10.0 바로 가기가 만들어집니다.

Linux 아카이브를 풀면 `MyCalc` 실행 파일이 있습니다. macOS zip을 풀면 `MyCalc.app`이 있습니다. macOS 패키지는 서명되어 있지 않습니다.
