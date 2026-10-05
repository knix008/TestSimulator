# MyMerge 10.0

Git 충돌을 기준, 로컬, 원격 세 칸으로 맞추고 결과를 고르는 머지 도구입니다. 같은 화면을 브라우저와 Windows, Linux, macOS 설치본에서 사용합니다.

- 사용 방법: [USERSGUIDE.md](USERSGUIDE.md)
- 구조: [ARCHITECTURE.md](ARCHITECTURE.md)

## 준비

Node.js 18 이상이 필요합니다.

```bash
npm install
npm run icons
```

## 실행

```bash
npm start
```

브라우저에서는 `index.html`을 열거나 프로젝트 폴더를 정적 서버로 제공합니다.

Git mergetool로 등록할 때는 설치본 실행 파일에 네 경로를 넘깁니다.

```bash
git config --global mergetool.mymerge.cmd "\"C:/Program Files/MyMerge/MyMerge.exe\" \"$BASE\" \"$LOCAL\" \"$REMOTE\" \"$MERGED\""
git config --global mergetool.mymerge.trustExitCode true
git config --global merge.tool mymerge
```

개발 중 Electron에서는 `--` 뒤에 같은 순서로 경로를 붙입니다.

## 테스트

```bash
npm test
```

헤드리스 Edge 또는 Chrome이 테스트 페이지를 실행합니다. 결과는 기능 종류별로 나열되고 마지막에 Summary가 나옵니다. 실패한 항목이 있으면 종료 코드는 1입니다.

## 빌드

| 명령 | 산출물 |
| --- | --- |
| `npm run build:web` | `dist/web` |
| `npm run build:win` | Windows NSIS 설치 파일 |
| `npm run build:linux` | deb, AppImage, tar.gz |
| `npm run build:macos` | dmg, pkg, zip |
| `npm run build` | 웹과 세 데스크톱 패키지 |

Windows 설치 마법사는 한국어와 영어를 고를 수 있습니다. 이미 설치된 프로그램이 있으면 프로그램 파일을 지운 뒤 다시 설치하고, 저장된 데이터가 있으면 삭제 여부를 물어 봅니다. `.mmerge` 세션 파일은 문서 아이콘으로 등록됩니다.

제작자는 SHKWON(knix008@naver.com)입니다.
