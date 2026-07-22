# UML Editor (MyUML Multi OS)

Windows, macOS, Linux에서 동작하는 **standalone UML 다이어그램 편집기**입니다.  
제품 표시 이름은 **UML Editor**, 내부 패키지 이름은 `my-uml-multi-os`입니다.

Java / Eclipse RCP / Papyrus 런타임은 포함하지 않습니다. 현재 기본 저장 형식은 JSON 기반 **`.umlprj`** 입니다. Papyrus의 `.uml` / `.notation` / `.di` 호환은 장기 목표이며, Papyrus 소스는 분석용 참고로만 사용합니다.

## 주요 기능

- UML 2.5.1 계열 **13종 다이어그램** 편집
- 멀티 다이어그램 프로젝트 (`.umlprj`)
- 컴포넌트 **연결(Interface Pair)**: provided/required 인터페이스 쌍, 포트 스냅, 방향 바꾸기
- 직선 / 직교 / 곡선 라우팅, 직교 장애물 회피, 교차 브리지(jump)
- 한국어 / 영어 UI, Light / Dark 테마
- 실행 취소·다시 실행, 확대·축소, 이미지보내기(PNG/GIF 등)
- Windows: `.umlprj` 파일 연결 + 프로젝트 전용 아이콘

## 요구 사항

- Node.js **20** 이상
- npm

## 빠른 시작

```powershell
npm install
npm start
```

`npm start`는 웹 번들을 빌드한 뒤 Electron 데스크톱 앱으로 실행합니다.

브라우저만 쓰려면:

```powershell
npm run dev
```

주소: `http://127.0.0.1:5173/`

## npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm start` / `npm run run:win` | 빌드 후 Electron 실행 |
| `npm run dev` | Vite 개발 서버 |
| `npm run build` / `build:web` | 웹 번들 (`dist/app`) |
| `npm run build:win` | Windows NSIS 설치 파일 |
| `npm run build:linux` | AppImage / deb |
| `npm run build:mac` | dmg (macOS 호스트 권장) |
| `npm run build:all` | win + linux + mac |
| `npm run icons` | `app-icon` / `project-icon` ICO 재생성 |
| `npm test` | Vitest |
| `npm run check` | 빌드 + 테스트 |

## 설치 파일 (Windows)

```powershell
npm run build:win
```

- 산출물: `release/UML-Editor-Setup-<version>.exe`
- 프로젝트 루트로도 복사됩니다 (`scripts/copy-installers.cjs`)
- 설치 위치 선택, 바탕화면·시작 메뉴 바로가기 지원
- 재설치 시 기존 설치본과 앱 데이터를 정리한 뒤 설치 (`build/installer.nsh`)

설치 파일·`release/` 폴더는 git에 올리지 않습니다 (`.gitignore`).

## 프로젝트 파일

- 확장자: **`.umlprj`**
- 형식: `format: "my-uml-multi-os-project"`, `version: 1`
- 시스템 등록 이름: **MyUML Project**
- 파일 아이콘: `assets/project-icon.ico` (앱 아이콘과 별도)

샘플: [`samples/`](samples/) (`01-class` … `13-timing`).  
재생성: `node --experimental-strip-types scripts/generate-samples.mjs`

## 아이콘

| 파일 | 용도 |
|------|------|
| `assets/app-icon.svg` / `.ico` | 앱, 설치 파일, 창 아이콘 |
| `assets/project-icon.svg` / `.ico` | `.umlprj` 파일 연결 |

```powershell
npm run icons
```

## 문서

- [Architecture.md](Architecture.md) — 런타임·모듈 구조
- [UsersGuide.md](UsersGuide.md) — 사용자 가이드

## Papyrus 참고 (선택)

호환성 분석용으로 Papyrus Desktop 소스를 받을 수 있습니다. 제품에는 포함되지 않습니다.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\clone-papyrus.ps1
```

## 라이선스 / 제약

- Papyrus Desktop은 EPL 2.0입니다. 소스 분석·코드 재사용 범위에 따라 라이선스 검토가 필요합니다.
- 이 제품은 Papyrus 플러그인을 실행하지 않으며, 기능을 TypeScript로 자체 구현합니다.
