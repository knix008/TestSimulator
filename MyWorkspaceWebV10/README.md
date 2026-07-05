# MyWorkspace Web V10

`MyWorkspaceWinV10`과 같은 Workspace·Page 관리 기능을 **Electron + JavaScript**로 멀티 플랫폼(Windows / macOS / Linux)에서 실행하기 위한 프로젝트입니다.

## 실행 환경

- Node.js 20+
- npm 10+
- (아이콘 동기화) .NET SDK — WinV10 `IconGenerator` 실행용

## 설치 / 실행

```bash
npm install
npm start
```

`npm install` 시 WinV10 편집기 HTML 추출, vendor 복사, WinV10 PNG 아이콘 동기화가 자동 실행됩니다.

개발자 도구:

```bash
npm run dev
```

## 최초 로그인

- 사용자 ID: `admin`
- 비밀번호: `admin`

## 데이터 저장 위치

| 항목 | 경로 |
|------|------|
| 로컬 설정 | `%APPDATA%/MyWorkspaceWebV10/appsettings.local.json` |
| SQLite DB | `%APPDATA%/MyWorkspaceWebV10/myworkspace.db` |
| Page 첨부 캐시 | `%APPDATA%/MyWorkspaceWebV10/PageAssets/` |
| 최근 프로젝트 | `%APPDATA%/MyWorkspaceWebV10/recent-projects.json` |

## 구현 현황 (v0.5)

| 영역 | 상태 |
|------|------|
| WinV10 UI 셸 (Nav Rail, 세로 툴바, 메뉴, 패널, 타이틀/상태바) | ✅ |
| WinV10 `EditorHtmlBuilder` 편집기 이식 | ✅ |
| `.wsp` 프로젝트 저장/열기/새 프로젝트 | ✅ |
| Page/Workspace Markdown 내보내기 | ✅ |
| Page 버전 이력 조회·복원 | ✅ |
| Workspace/Page 생성·이름 변경·삭제 (입력/확인 대화상자) | ✅ |
| WinV10 스타일 오류 상세 대화상자 (요약 + 상세 + 복사) | ✅ |
| Page 댓글 패널 (등록/수정/삭제) | ✅ |
| Page asset (이미지·파일 첨부, 드롭, `page-asset://` 프로토콜) | ✅ |
| 사용자 관리 / 프로필 / 비밀번호 / 알림 설정 | ✅ |
| 환경 설정 / 프로그램 정보 / DB 설정(안내) 대화상자 | ✅ |
| WinV10 PNG 아이콘 (`IconGenerator`) | ✅ |
| Word/PDF 내보내기 | ✅ |
| Workspace 멤버 관리 | ✅ |
| SMTP 이메일 서버 설정 (연결 테스트) | ✅ |
| MariaDB/PostgreSQL 외부 DB 연결 | 🔜 |

## WinV10 연동 스크립트

| 스크립트 | 설명 |
|----------|------|
| `node scripts/extract-win-editor.js` | WinV10 `EditorHtmlBuilder.cs` → `win-editor-template.html` |
| `node scripts/sync-icons.js` | WinV10 IconGenerator 실행 + PNG 복사 |
| `node scripts/copy-vendor.js` | marked/turndown ESM 복사 |

## 프로젝트 구조

```
MyWorkspaceWebV10/
├── electron/
├── src/
│   ├── main/           # SQLite, services, IPC
│   └── renderer/
│       ├── editor/     # WinV10 editor template
│       ├── assets/icons/
│       ├── js/dialogs/
│       └── js/ui/
├── scripts/
└── config/
```

## WinV10과의 관계

- 편집기 HTML/JS는 WinV10 `EditorHtmlBuilder`에서 추출합니다.
- `.wsp` 포맷은 WinV10 `WorkspaceArchiveFileIO`와 호환됩니다.
- 아이콘은 WinV10 `IconGenerator` 출력을 그대로 사용합니다.

## 배포

```bash
npm run dist
```

## 라이선스

Copyright © 2026 SHKWON(knix008@naver.com)
