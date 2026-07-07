# MyProject Multi-OS

Windows · macOS · Linux · Web를 지원하는 **MyProject** 일정 관리 애플리케이션입니다.

| 플랫폼 | 프로젝트 | 설명 |
|--------|----------|------|
| **Windows / macOS / Linux** | `MyProjectMultiOSV10` (이 저장소) | Electron 데스크톱 — `.myprj` 파일 기반 |
| **Web (브라우저)** | [`MyProjectWebV10`](../MyProjectWebV10) | React + Node.js API — DB(MariaDB 등) 기반 |

[`MyProjectWinV10`](../MyProjectWinV10)과 동일한 `.myprj` 파일 형식·일정 계산(CPM, 근무일)을 사용하며, UI는 [`MyProjectWebV10`](../MyProjectWebV10) 클라이언트를 `@web` alias로 재사용합니다.

**사용 방법은 [UsersGuide.md](./UsersGuide.md)를 참고하세요.**

---

## 사전 요구사항

| 항목 | 데스크톱 (Electron) | Web |
|------|---------------------|-----|
| Node.js | 20 LTS 이상 | 20 LTS 이상 |
| OS | Windows 10/11, macOS 12+, Ubuntu 20.04+ 등 | 브라우저 + DB 서버 |
| DB | 불필요 (로컬 `.myprj`) | MariaDB 10.6+ (기본) |

---

## 빠른 시작 (데스크톱)

```bash
cd MyProjectMultiOSV10
npm install
npm run dev
```

Vite 개발 서버(5174)와 Electron이 동시에 실행됩니다.

---

## 빌드 개요

### Windows / macOS / Linux (Electron)

| 명령 | 설명 |
|------|------|
| `npm run build` | 아이콘 생성, 빌드 정보 기록, Electron main + renderer 프로덕션 빌드 |
| `npm run start` | 빌드 결과로 Electron 실행 |
| `npm run pack` | 설치 없이 실행 가능한 폴더 생성 (`release/`) |
| `npm run dist` | **현재 OS**용 설치 패키지 생성 |
| `npm run dist:win` | Windows 설치 패키지 (NSIS `.exe`) |
| `npm run dist:mac` | macOS 패키지 (`.dmg`, `.zip`) |
| `npm run dist:linux` | Linux 패키지 (`.AppImage`, `.deb`) |
| `npm run dist:all` | Windows + macOS + Linux 일괄 빌드 |

빌드 시 `scripts/write-build-info.mjs`가 `config/build-info.json`(버전, 빌드 일시, Git 커밋 등)을 생성합니다. **도움말 → MyProject 정보** 다이얼로그에 이 정보가 표시됩니다.

`dist:*` 실행 후 설치 파일(`.exe`, `.dmg`, `.AppImage`, `.deb` 등)은 `scripts/move-installer-to-root.mjs`에 의해 **프로젝트 루트**(`MyProjectMultiOSV10/`)로 자동 이동합니다. `release/`에는 압축 해제 폴더·`.blockmap` 등 보조 파일만 남습니다.

#### OS별 빌드 예시

**Windows (PowerShell)**

```powershell
cd MyProjectMultiOSV10
npm install
npm run dist:win
# → MyProject-0.1.0-win-x64.exe (프로젝트 루트)
```

Windows NSIS 설치 프로그램은 설치 경로 선택 후 **바로 가기 옵션** 페이지에서 바탕화면·시작 메뉴 바로 가기 생성 여부를 선택할 수 있습니다 (`build/installer.nsh`).

**macOS (Terminal)**

```bash
cd MyProjectMultiOSV10
npm install
npm run dist:mac
# → MyProject-0.1.0-mac-arm64.dmg (Apple Silicon, 프로젝트 루트)
# → MyProject-0.1.0-mac-x64.dmg     (Intel, 프로젝트 루트)
```

**Linux (bash)**

```bash
cd MyProjectMultiOSV10
npm install
npm run dist:linux
# → MyProject-0.1.0-linux-x64.AppImage (프로젝트 루트)
# → MyProject-0.1.0-linux-amd64.deb     (프로젝트 루트)
```

> **크로스 컴파일 참고**
>
> - macOS `.dmg`는 **macOS에서** 빌드하는 것이 가장 안정적입니다 (코드 서명·公証).
> - Windows `.exe`는 Windows 또는 Wine/CI 환경에서 빌드합니다.
> - Linux `.AppImage`/`.deb`는 Linux 또는 Docker CI에서 빌드합니다.
> - CI에서 `-mwl` 일괄 빌드 시 각 OS runner에서 matrix 빌드를 권장합니다.

### Web (브라우저)

데스크톱(Electron)과 별도로, **브라우저용 Web 앱**은 [`MyProjectWebV10`](../MyProjectWebV10)에서 빌드합니다.

| 명령 (MultiOS 루트) | 설명 |
|---------------------|------|
| `npm run dev:web` | Web API + UI 개발 서버 실행 |
| `npm run build:web` | Web 서버·클라이언트 프로덕션 빌드 |
| `npm run preview:web` | Web 클라이언트 정적 미리보기 |

Web 상세 설치·배포는 [MyProjectWebV10/README.md](../MyProjectWebV10/README.md)를 참고하세요.

---

## 주요 기능

| 기능 | 상태 |
|------|------|
| `.myprj` 새 프로젝트 / 열기 / 저장 / 다른 이름으로 저장 | ✅ |
| Win `.myprj` 파일 호환 | ✅ |
| 작업 그리드 + Gantt 차트 (동기 스크롤) | ✅ |
| 3분할 UI (그리드 \| Gantt \| 우측 속성 패널) | ✅ |
| 작업 유형 (일반 / 마일스톤 / 요약) 드롭다운 | ✅ |
| 의존 관계 (FS/FF/SS/SF), 미리보기 아이콘 선택 | ✅ |
| 의존선 끝 스타일 (화살표·점 등) | ✅ |
| 속성 패널에서 선행 작업별 연결 유형 편집 | ✅ |
| 주요 경로(CPM) — 작업·의존선 강조(빨간색) | ✅ |
| 막대/진행 색 — 프리셋 팔레트 + 사용자 지정 | ✅ |
| 실행 취소 / 다시 실행 | ✅ |
| Gantt 메모 | ✅ |
| 아이콘 메뉴바·툴바 (Win 유사), 도움말 메뉴 우측 정렬 | ✅ |
| 도움말 → MyProject 정보 (빌드 버전 표시) | ✅ |
| 과제 설정, 환경 설정(언어) | ✅ |
| 보고서 (Excel, HTML, Word, PDF, Markdown, Gantt 이미지) | ✅ |
| Microsoft Project 내보내기 (XML/MPX) | ✅ |
| MS Project 가져오기 (XML, MPX; MPP/MPT 제한적) | ✅ |
| 캘린더 보기, 최근 파일, 상태 표시줄 | ✅ |
| Windows 설치 시 바로 가기 옵션 선택 | ✅ |
| 인쇄 | ✅ |

---

## 프로젝트 구조

```
MyProjectMultiOSV10/
├── electron/              # Main process (파일 I/O, 보고서, IPC, 빌드 정보)
│   ├── main.ts
│   ├── preload.ts
│   ├── buildInfo.ts
│   ├── projectFileService.ts
│   ├── reports/           # HTML/Excel/PDF/Word/Markdown
│   └── msProjectService.ts
├── renderer/              # Desktop 전용 React UI
│   └── src/
│       ├── components/    # DesktopProjectView, MenuBar, Toolbar …
│       └── projectDocument.ts
├── build/
│   └── installer.nsh      # Windows NSIS 바로 가기 옵션 페이지
├── scripts/
│   ├── generate-icons.mjs
│   ├── write-build-info.mjs
│   └── move-installer-to-root.mjs
├── config/
│   └── build-info.json    # 빌드 시 생성 (gitignore)
├── assets/                # 앱 아이콘
├── template/              # 기본 템플릿 .myprj
├── vite.config.ts         # @web → ../MyProjectWebV10/client/src
├── README.md              # 개발·빌드 안내 (이 문서)
├── UsersGuide.md          # 사용자 가이드
└── package.json
```

공유 UI·유틸은 [`MyProjectWebV10/client/src`](../MyProjectWebV10/client/src) (`@web` alias)에 있습니다.

---

## Win / Web 버전과의 관계

| 항목 | Multi-OS (데스크톱) | WinV10 | WebV10 |
|------|---------------------|--------|--------|
| 저장 | `.myprj` 로컬 파일 | `.myprj` 로컬 파일 | MariaDB `mp_*` |
| MS Project `.mpp` | Java+MPXJ 없으면 XML 권장 | MPXJ.Net (전체) | — |
| DB 공유 | — | DBTools 연동 가능 | 동일 DB 공유 |
| UI 공통 코드 | `@web` alias | WinForms | React client |

Win에서 만든 `.myprj`를 **File → Open**으로 열고 편집·저장할 수 있습니다.

---

## npm 스크립트 요약

| 명령 | 대상 | 설명 |
|------|------|------|
| `npm run dev` | Desktop | Electron + Vite 개발 |
| `npm run build` | Desktop | 프로덕션 빌드 + build-info 생성 |
| `npm run write-build-info` | Desktop | `config/build-info.json`만 갱신 |
| `npm run dist:win` | Windows | NSIS 설치 프로그램 → 루트로 이동 |
| `npm run dist:mac` | macOS | DMG / ZIP → 루트로 이동 |
| `npm run dist:linux` | Linux | AppImage / deb → 루트로 이동 |
| `npm run dev:web` | Web | WebV10 개발 서버 |
| `npm run build:web` | Web | WebV10 프로덕션 빌드 |

---

## 문서

- [UsersGuide.md](./UsersGuide.md) — 메뉴, Gantt 편집, 속성·의존성, 보고서, MS Project 연동, 단축키
- [MyProjectWebV10/UsersGuide.md](../MyProjectWebV10/UsersGuide.md) — Web 버전 사용자 가이드
- [MyProjectWinV10/UsersGuide.md](../MyProjectWinV10/UsersGuide.md) — Windows 버전 사용자 가이드

---

## 라이선스

Copyright © 2026 MyProject
