# MyTerminal

Windows, Linux, macOS, Web를 지원하는 크로스플랫폼 터미널입니다.  
**Tauri 2** + xterm.js 기반으로 동작하며, 자체 구현 셸(**MyShell**)과 SSH 원격 세션을 제공합니다.

**Author:** SHKWON (`knix008@naver.com`)  
**Version:** 1.0.0  
**License:** MIT

## 주요 기능

- 프레임리스 창 + 항상 보이는 툴바(아이콘·툴팁)
- 자체 셸(MyShell) — `ls`/`dir`, `cd`, `cat`, `prompt`, `run` 등. `exit`로 탭 종료, 마지막 탭이면 앱 종료
- **명령 셸 선택** — 내장 명령이 아닌 줄을 실행할 셸: Windows는 Command Prompt(기본)·PowerShell·PowerShell 7·Git Bash·WSL, macOS는 zsh(기본)·bash·fish…, Linux는 bash(기본)·zsh·fish…, 또는 직접 지정
- **가상 터미널에서 실행되는 외부 프로그램** — Windows ConPTY / macOS·Linux pty: `git`, PowerShell, `npm` 등의 **컬러 출력**이 그대로 보이고, 실행 중인 프로그램에 키 입력(`Read-Host`, 대화형 REPL)이 전달됩니다
- **프롬프트 테마** — 세그먼트 기반(경로·git·사용자·셸·OS·시각·종료 코드·실행 시간), 파워라인/일반/다이아몬드 모양, 20개 프리셋, git 상태색, 사용자 정의 프롬프트 저장, 고급 세그먼트 편집기
- **고정 크기 설정 창** — 일반·터미널·글꼴·테마·색상·배경·SSH·프롬프트·프롬프트 편집 탭, 내부 스크롤 없음
- **다크 20 · 라이트 20 테마**(모두 다른 색조) + 테마별 색 수정(초기화는 현재 테마만) + **사용자 정의 테마**(현재 색으로 새 테마 만들기·이름 바꾸기·삭제, 툴바 테마 메뉴에서 바로 만들기·테마 설정), **터미널 프로필**(열×행·글꼴·스크롤백·셸, 창 크기 자동 맞춤, 기본 120×25), **SSH 호스트 프로필**(추가/개별 삭제, 연결 창에서 선택), 탭 바 `+ ▾`로 셸을 골라 새 터미널, 툴바 언어 배지 버튼(한/EN 즉시 전환), 복사 가능한 **오류 창**
- 멀티 세션 탭, 탭을 창 밖으로 드래그하여 분리 / 다른 창으로 합치기
- 아이콘이 함께 표시되는 우클릭 컨텍스트 메뉴(복사·붙여넣기·전체 복사·지우기·글꼴·스크롤 등) — 지우기·복사·붙여넣기는 툴바 대신 이 메뉴와 단축키로
- SSH 원격 연결 (`ssh2`)
- 테마 / 언어(KO·EN) / 글꼴·크기
- 스크롤백 줄 수(기본 10,000), 상태바 On/Off, 시스템 트레이 아이콘(설치/설정)
- **창 전체 투명도** 슬라이더(바탕화면이 비치는 터미널)
- 터미널 배경색·배경 이미지·표시 방식(가득채움/맞춤/늘이기/가운데/패턴)
  - 다양한 포맷 지원: PNG·JPG·JPEG·JFIF·GIF·WebP·AVIF·TIFF·BMP·SVG·ICO
  - 이미지 **크기 제한 없음**(대용량은 표시용으로 자동 축소)
- 단일 인스턴스 실행(중복 실행 시 기존 창 포커스)
- Windows / macOS / Linux 설치 패키지 및 Web 모드

## 문서

| 문서 | 설명 |
|------|------|
| [Architecture.md](./Architecture.md) | 구조·모듈·데이터 흐름 |
| [UsersGuide.md](./UsersGuide.md) | 사용 방법·설정·셸 명령 |

## 요구 사항

- Node.js 18+ (개발·빌드용. 설치본에는 Node.js 런타임이 함께 들어갑니다)
- npm 9+
- Rust 1.77+ 와 Tauri 2 빌드 환경 (Windows: WebView2 · MSVC 빌드 도구, Linux: `libwebkit2gtk-4.1-dev` 등)

## 설치

```bash
npm install
```

## 실행

```bash
# 데스크톱(Tauri) — 렌더러 번들 후 기동
npm start

# Web 모드 (브라우저)
npm run web

# 단위 테스트 (node:test + cargo test)
npm test

# 데스크톱 스모크 테스트 (Windows: 디버그 빌드를 CDP로 조작, 15개 항목)
npm run build:debug
npm run smoke
```

## 빌드

```bash
# 렌더러만 번들
npm run build:renderer

# 아이콘 준비 (assets/icons/icon.png → src-tauri/icons)
npm run icons

# 플랫폼별 설치 파일
npm run build:win      # Windows — NSIS 설치본 (재설치 시 기존 완전 삭제)
npm run build:mac      # macOS — .app + .dmg
npm run build:linux    # Linux — AppImage + .deb
npm run build:all      # 이 운영체제에서 만들 수 있는 전부

# Web 정적 산출물
npm run build:web
```

| 명령 | 주요 산출물 (프로젝트 루트로 복사) |
|------|------------------------|
| `build:win` | `MyTerminal_1.0.0_x64-setup.exe` |
| `build:mac` | `.dmg` |
| `build:linux` | `.AppImage`, `.deb` |

> Tauri는 실행 중인 운영체제의 설치 파일만 만듭니다. macOS/Linux 패키지는 해당 OS(또는 CI)에서 빌드하세요.  
> 원본 산출물은 `src-tauri/target/release/bundle/`에 있습니다.

## 프로젝트 구조 (요약)

```
MyTerminalMultiOSV20/
├── src/
│   ├── host/          # Node 호스트: MyShell, SSH, 세션, 설정, 배경 이미지
│   ├── renderer/      # UI, xterm, 설정/테마/i18n, tauri-bridge.js
│   └── shared/        # 프롬프트 엔진·오류 형식(공용)
├── src-tauri/         # Tauri 프로그램(Rust): 창·팝업·트레이·대화상자·가상 터미널
├── scripts/           # 번들·빌드·스모크·웹 서버
├── assets/icons/      # 앱 아이콘
├── build/             # 라이선스 문서
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## 개발 메모

- 렌더러 엔트리: `src/renderer/js/app.js`(+ 팝업 `popup-app.js`) → esbuild → `app.bundle.js` / `popup.bundle.js`
- `npm start`(`tauri dev`)와 빌드는 `scripts/build-tauri-web.js`로 페이지를 `dist/web`, Node 호스트를 `dist/sidecar`에 준비합니다.
- 설정은 사용자 데이터 폴더(`%APPDATA%\MyTerminal` 등, Electron 판과 같은 곳)의 `settings.json`에 저장되며, 변경 즉시 반영·저장됩니다.
- 배경 이미지는 사용자 데이터 폴더의 `backgrounds/`에 원본 보관하고, 표시용 데이터 URL은 긴 변(2560px) 기준으로 자동 축소합니다.
- 창 투명도는 투명 창 위에서 페이지 전체의 불투명도로 적용됩니다.
- 단일 인스턴스(`tauri-plugin-single-instance`)로 중복 실행을 막습니다. `MYTERMINAL_CONFIG_DIR`을 지정하면 별도 데이터 폴더로, 잠금 없이 실행됩니다(테스트용).

## 라이선스

MIT © SHKWON
