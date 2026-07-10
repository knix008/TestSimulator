# MyWorkspace Web V10

`MyWorkspaceWinV10`과 같은 Workspace·Page 관리 기능을 **Electron + JavaScript**로 멀티 플랫폼(Windows / macOS / Linux)에서 실행하기 위한 프로젝트입니다.

일상적인 사용 방법은 **[UsersGuide.md](UsersGuide.md)** 를 참고하세요.

## 실행 환경

- **Node.js 22** (`.nvmrc` 참고, npm 10+)
- (아이콘 동기화) .NET SDK — WinV10 `IconGenerator` 실행용

```bash
nvm use    # nvm 사용 시
npm install
npm start
```

`npm install` 시 WinV10 편집기 HTML 추출, vendor 복사, WinV10 PNG 아이콘·템플릿·빌드 자산 동기화가 자동 실행됩니다.

## 최초 로그인

- 사용자 ID: `admin`
- 비밀번호: `admin`

DB에 사용자가 없으면 최초 연결 시 위 기본 관리자 계정이 자동 등록됩니다. 설치 직후 **프로필 → 비밀번호 변경**을 권장합니다.

## 데이터 저장 위치

Electron `userData` 아래 `MyWorkspaceWebV10/` 폴더에 로컬 설정·SQLite·첨부 캐시가 저장됩니다.

| OS | `userData` 기준 경로 |
|----|----------------------|
| Windows | `%APPDATA%\myworkspace-web-v10\MyWorkspaceWebV10\` |
| macOS | `~/Library/Application Support/myworkspace-web-v10/MyWorkspaceWebV10/` |
| Linux | `~/.config/myworkspace-web-v10/MyWorkspaceWebV10/` |

| 항목 | 파일/폴더 |
|------|-----------|
| 로컬 설정 | `appsettings.local.json` |
| SQLite DB (기본) | `myworkspace.db` |
| Page 첨부 캐시 | `PageAssets/` |
| 사용자 Page 템플릿 | `Templates/Pages/` |

## 구현 현황 (v0.1.0)

| 영역 | 상태 |
|------|------|
| WinV10 UI 셸 (Nav Rail, 세로 툴바, 메뉴, 패널, 타이틀/상태바) | ✅ |
| WinV10 `EditorHtmlBuilder` 편집기 이식 | ✅ |
| `.wsp` 프로젝트 저장/열기/새 프로젝트 | ✅ |
| Page/Workspace Markdown·Word·PDF 보내기 | ✅ |
| 보내기 형식 대화상자·완료/실패 결과(저장 경로 표시) | ✅ |
| 편집기 이미지 크기 조절·보내기 시 크기 유지 (MD/Word/PDF) | ✅ |
| Page 다중 탭·탭별 미저장 스냅샷·DB 동기화 | ✅ |
| Page 버전 이력 조회·복원 | ✅ |
| Workspace/Page 생성·이름 변경·삭제 | ✅ |
| Workspace/Page 잠금·잠금 해제 | ✅ |
| Page 댓글 패널 (등록/수정/삭제) | ✅ |
| Page asset (이미지·파일 첨부, `page-asset://` 프로토콜) | ✅ |
| 사용자 관리 / 프로필 / 비밀번호 / 알림 설정 | ✅ |
| 환경 설정 (밝기·20종 파스텔 색상·글꼴·언어, 즉시 미리보기) | ✅ |
| DB 연결 (SQLite / MariaDB / MySQL / PostgreSQL / SQL Server) | ✅ |
| SMTP 이메일 서버 설정 (연결 테스트) | ✅ |
| 제목 표시줄 `|||` — DB·이메일·환경 설정·Page 검색 | ✅ |
| Workspace 패널 Markdown 파일 드래그 앤 드롭 → Page 가져오기 | ✅ |
| WinV10 PNG 아이콘 (`IconGenerator`) | ✅ |

## 배포 (Windows / macOS / Linux)

Electron Builder로 각 OS용 설치 패키지를 만들 수 있습니다. **네이티브 모듈(`better-sqlite3`)** 때문에 빌드는 해당 OS에서 실행하는 것이 가장 안정적입니다.

모든 빌드 산출물(설치 패키지·unpacked)은 **프로젝트 루트**에 생성됩니다. Git에 올라가지 않도록 `.gitignore`에 패턴이 등록되어 있습니다.

### 설치 패키지 (프로젝트 루트)

| OS | 명령 | 산출물 (예: v0.1.0) |
|----|------|---------------------|
| Windows | `npm run dist:win` | `MyWorkspace-Setup-0.1.0.exe` (NSIS), `MyWorkspace-Portable-0.1.0.exe` |
| macOS | `npm run dist:mac` | `MyWorkspace-0.1.0-mac-universal.dmg`, `.zip` |
| Linux | `npm run dist:linux` | `MyWorkspace-0.1.0-linux-x64.AppImage`, `.deb`, `.tar.gz` |
| Linux (tar.gz만) | `npm run dist:linux:portable` | `MyWorkspace-0.1.0-linux-x64.tar.gz` |

Windows에서 여러 설치 파일을 한 번에 빌드:

```powershell
.\scripts\build-installers.ps1
```

여러 OS 설치 패키지 일괄 빌드 (각 OS 호스트 또는 CI 필요):

```bash
npm run dist:installers   # win + mac + linux tar.gz
npm run dist:all          # win + mac + linux 전체
```

> Windows 호스트에서 Linux **AppImage/deb** 빌드 시 symlink 권한 문제가 날 수 있습니다. 이 경우 `dist:linux:portable`로 tar.gz만 생성하거나 GitHub Actions CI를 사용하세요.

### 로컬 실행용 unpacked (프로젝트 루트)

설치 없이 빌드 결과만 확인할 때는 `pack` 스크립트를 사용합니다. `dist:*` 빌드 시에도 함께 `win-unpacked/` 등이 루트에 생성될 수 있습니다.

```bash
npm run pack          # 현재 OS용 unpacked
npm run pack:win      # Windows → win-unpacked/
npm run pack:mac      # macOS → mac/ (macOS 호스트 필요)
npm run pack:linux    # Linux → linux-unpacked/
```

빌드 산출물은 `.gitignore`에 등록되어 Git에 포함되지 않습니다.

빌드 전 아이콘·`.wsp` 연동 파일 동기화:

```bash
npm run sync:build-assets
```

WinV10 `Assets/app.ico`, `Assets/wsp.ico`가 `build/`로 복사됩니다. CI에서 WinV10 없이 빌드하려면 `build/icon.ico`, `build/icon.png`, `build/wsp.ico`를 저장소에 포함하세요.

### Windows 코드 서명 (선택)

`scripts/embed-win-exe-icon.js`(`afterPack`)가 **실행 파일(.exe)에 앱 아이콘·메타데이터를 임베드**합니다. 바탕 화면·시작 메뉴 바로가기는 실행 파일 아이콘을 그대로 사용하므로, 설치 후 아이콘이 Electron 기본 아이콘으로 보이면 `npm run sync:build-assets` 후 다시 `npm run dist:win`으로 빌드하세요.

Authenticode **서명**이 필요하면 `win.signAndEditExecutable: true`와 `CSC_LINK`, `CSC_KEY_PASSWORD`를 설정하세요(Windows 개발자 모드 또는 관리자 권한이 없으면 winCodeSign 추출이 실패할 수 있음).

### CI 배포

GitHub Actions (`.github/workflows/release.yml`)에서 태그 `v*` 푸시 시 Windows / macOS / Linux 빌드를 병렬 실행하고 프로젝트 루트의 설치 패키지를 Artifact로 업로드합니다.

```bash
git tag v0.1.0
git push origin v0.1.0
```

### macOS 서명 (선택)

App Store 외 배포 시 Gatekeeper 경고를 줄이려면 Apple Developer ID와 환경 변수 `CSC_LINK`, `CSC_KEY_PASSWORD`를 CI에 설정하세요. 미설정 시에도 `.dmg`는 생성되며, 사용자가 보안 설정에서 허용해야 할 수 있습니다.

## WinV10 연동 스크립트

| 스크립트 | 설명 |
|----------|------|
| `node scripts/extract-win-editor.js` | WinV10 `EditorHtmlBuilder.cs` → `win-editor-template.html` |
| `node scripts/sync-icons.js` | WinV10 IconGenerator 실행 + PNG 복사 |
| `node scripts/copy-vendor.js` | marked/turndown ESM 복사 |
| `node scripts/sync-page-templates.js` | WinV10 Page 양식(`ko`/`en`) 복사 |
| `node scripts/sync-build-assets.js` | WinV10 `app.ico`/`wsp.ico` → `build/` |
| `node scripts/verify-editor-undo-redo.js` | 편집기 Undo/Redo 동작 검증 (개발용) |
| `node scripts/test-export-size.cjs` | 보내기 HTML 이미지 크기 반영 검증 (개발용) |

## 프로젝트 구조

```
MyWorkspaceWebV10/
├── electron/           # main.js, preload.js
├── src/
│   ├── main/           # DB, services, IPC, export (MD/Word/PDF)
│   └── renderer/
│       ├── editor/     # WinV10 editor template
│       ├── css/
│       ├── js/         # app, editorBridge, dialogs, ui, i18n
│       ├── templates/pages/{ko,en}/
│       └── vendor/     # marked, turndown (ESM)
├── scripts/            # 빌드·동기화·검증 스크립트
├── config/             # appsettings.json, build-info.json (생성)
├── build/              # electron-builder 리소스 (아이콘 등)
├── database/           # schema.sql
├── .github/workflows/  # release.yml (태그 CI)
├── README.md
└── UsersGuide.md
```

## 보내기(Export) 파이프라인

Page 보내기 시 렌더러가 편집기의 최신 Markdown·HTML을 읽어 main 프로세스로 전달합니다. PDF·Word 생성 전에 편집기 HTML의 이미지 크기(`data-editor-width` 등)를 Markdown에 병합하고, `page-asset://` 참조를 data URI 또는 `_assets/` 폴더로 치환합니다.

| 형식 | 구현 |
|------|------|
| Markdown | `src/main/export/markdownMaterializer.js` |
| Word | `html-to-docx` (`src/main/export/docxExporter.js`) |
| PDF | 숨김 `BrowserWindow` + `printToPDF` (`src/main/export/pdfExporter.js`) |

## WinV10과의 관계

- 편집기 HTML/JS는 WinV10 `EditorHtmlBuilder`에서 추출합니다.
- `.wsp` 포맷은 WinV10 `WorkspaceArchiveFileIO`와 호환됩니다.
- 아이콘은 WinV10 `IconGenerator` 출력을 그대로 사용합니다.

## 라이선스

Copyright © 2026 SHKWON(knix008@naver.com)
