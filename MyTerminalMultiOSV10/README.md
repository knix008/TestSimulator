# MyTerminal

Windows, Linux, macOS, Web를 지원하는 크로스플랫폼 터미널입니다.  
Electron + xterm.js 기반으로 동작하며, 자체 구현 셸(**MyShell**)과 SSH 원격 세션을 제공합니다.

**Author:** SHKWON (`knix008@naver.com`)  
**Version:** 1.0.0  
**License:** MIT

## 주요 기능

- 프레임리스 창 + 항상 보이는 툴바(아이콘·툴팁)
- 자체 셸(MyShell) — `ls`/`dir`, `cd`, `cat`, `prompt`, `run` 등. `exit`로 탭 종료, 마지막 탭이면 앱 종료
- **명령 셸 선택** — 내장 명령이 아닌 줄을 실행할 셸: Windows는 Command Prompt(기본)·PowerShell·PowerShell 7·Git Bash·WSL, macOS는 zsh(기본)·bash·fish…, Linux는 bash(기본)·zsh·fish…, 또는 직접 지정
- **프롬프트 테마** — 세그먼트 기반(경로·git·사용자·셸·OS·시각·종료 코드·실행 시간), 파워라인/일반/다이아몬드 모양, 20개 프리셋, git 상태색, 사용자 정의 프롬프트 저장, 고급 세그먼트 편집기
- **고정 크기 설정 창** — 일반·터미널·글꼴·테마·색상·배경·SSH·프롬프트·프롬프트 편집 탭, 내부 스크롤 없음
- **다크 20 · 라이트 20 테마**(모두 다른 색조) + 테마별 색 수정(초기화는 현재 테마만), **터미널 프로필**(열×행·글꼴·스크롤백·셸, 창 크기 자동 맞춤, 기본 120×25), **SSH 호스트 프로필**(추가/개별 삭제, 연결 창에서 선택), 탭 바 `+ ▾`로 셸을 골라 새 터미널, 툴바 언어 배지 버튼(한/EN 즉시 전환), 복사 가능한 **오류 창**
- 멀티 세션 탭, 탭을 창 밖으로 드래그하여 분리 / 다른 창으로 합치기
- 아이콘이 함께 표시되는 우클릭 컨텍스트 메뉴(복사·붙여넣기·전체 복사·글꼴·스크롤 등)
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

- Node.js 18+ 권장
- npm 9+
- 데스크톱 실행: Electron (개발 의존성으로 설치)

## 설치

```bash
npm install
```

## 실행

```bash
# 데스크톱(Electron) — 렌더러 번들 후 기동
npm start

# Web 모드 (브라우저)
npm run web

# 단위 테스트 (node:test) / 설정 창 스모크 테스트 (Electron 기동, 스크린샷 저장)
npm test
npm run smoke -- <스크린샷 폴더>
```

## 빌드

```bash
# 렌더러만 번들
npm run build:renderer

# 아이콘 준비
npm run icons

# 플랫폼별 설치 파일 (icons + renderer 자동 선행)
npm run build:win      # Windows — NSIS 설치본 + portable → dist/ (재설치 시 기존 완전 삭제)
npm run build:mac      # macOS — dmg + zip → dist/
npm run build:linux    # Linux — AppImage + deb → dist/
npm run build:all      # Windows + macOS + Linux

# Web 정적 산출물
npm run build:web
```

| 명령 | 주요 산출물 (`dist/`) |
|------|------------------------|
| `build:win` | `dist/MyTerminal-Setup-*.exe`, portable + 루트에 Setup 복사 |
| `build:mac` | `.dmg`, `.zip` |
| `build:linux` | `.AppImage`, `.deb` |

> macOS/Linux 패키지는 해당 OS(또는 적합한 CI)에서 빌드하는 것이 가장 안정적입니다.  
> 호환용으로 `dist:win` / `dist:mac` / `dist:linux` / `dist:all`도 동일하게 동작합니다.  
> Windows 빌드는 Visual Studio 없이 동작하도록 네이티브 모듈 재빌드(`npmRebuild`)를 끕니다. (`ssh2`의 `cpu-features`는 선택 의존성)

## 프로젝트 구조 (요약)

```
MyTerminalMultiOSV10/
├── src/
│   ├── main/          # Electron 메인, MyShell, SSH, 세션
│   ├── preload/       # contextBridge API
│   ├── renderer/      # UI, xterm, 설정/테마/i18n
│   └── shared/        # 공유 테마·i18n(일부)
├── scripts/           # 번들·아이콘·웹 서버
├── assets/icons/      # 앱 아이콘
├── build/             # electron-builder 리소스
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## 개발 메모

- 렌더러 엔트리: `src/renderer/js/app.js`(+ 팝업 `popup-app.js`) → esbuild → `app.bundle.js` / `popup.bundle.js`
- `npm start` 시 `prestart`로 렌더러가 자동 빌드됩니다.
- 설정은 앱 사용자 데이터(`settings.json`)에 저장되며, 변경 즉시 반영·저장됩니다.
- 배경 이미지는 Electron에서 `userData/backgrounds/`에 원본 보관하고, 표시용 데이터 URL은 긴 변(2560px) 기준으로 자동 축소합니다.
- 창 투명도는 Electron `win.setOpacity()`로 창 전체에 적용됩니다.
- 단일 인스턴스 잠금(`requestSingleInstanceLock`)으로 중복 실행을 막습니다.

## 라이선스

MIT © SHKWON
