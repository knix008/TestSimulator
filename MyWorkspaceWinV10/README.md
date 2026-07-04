# MyWorkspace

Notion 스타일의 Windows 데스크톱 Workspace·Page 관리 애플리케이션입니다. 계층형 Workspace, WYSIWYG Markdown Page 편집, **Page 탭**, Page 댓글, 제목 표시줄 Page 검색, 버전 이력, Page/Workspace 내보내기, 다중 DB 지원, 사용자·관리자 권한, Workspace 즐겨찾기, 밝기/어두운 테마·파스텔 색상·글꼴 크기, **사용자별 UI 상태 기억**(마지막 Page, Workspace 패널 접힘·너비), 선택적 이메일 알림을 제공합니다.

**사용자 가이드**: 상세 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 실행 환경

- Windows 10/11 (x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2026 / 2022 (WinForms 디자이너 권장) 또는 `dotnet` CLI
- MSI 빌드: [WiX Toolset v4+](https://wixtoolset.org/) (`installer` 프로젝트)
- WebView2 Runtime (Markdown WYSIWYG 편집기, Windows 11에는 기본 포함)

## 빌드 / 실행

### Visual Studio

1. `MyWorkspaceWinV10.slnx` 열기
2. `MyWorkspace.Win` 프로젝트를 시작 프로젝트로 설정
3. 실행 (F5)

### dotnet CLI

```bash
dotnet build MyWorkspaceWinV10.slnx -c Debug
dotnet run --project src/MyWorkspace.Win/MyWorkspace.Win.csproj -c Debug
```

### 단위 테스트

```bash
dotnet test tests/MyWorkspace.MultiImage.Tests/MyWorkspace.MultiImage.Tests.csproj -c Debug
```

Markdown 이미지·`page-asset` 참조, 중복 파일명, 저장 후 복원 시나리오 등을 검증합니다.

로컬 출력 폴더로 빌드하려면:

```bash
dotnet build src/MyWorkspace.Win/MyWorkspace.Win.csproj -o .build-out
```

### Release + MSI

```bash
dotnet build src/MyWorkspace.Win/MyWorkspace.Win.csproj -c Release
```

또는 MSI만 직접 빌드:

```bash
dotnet build installer/MyWorkspaceWinV10.Installer.wixproj -c Release -p:Platform=x64 -p:BuildMsiPackage=true
```

Release 빌드 시 WiX MSI가 자동 생성됩니다. MSI만 건너뛰려면:

```bash
dotnet build src/MyWorkspace.Win/MyWorkspace.Win.csproj -c Release -p:SkipInstaller=true
```

- MSI 경로: `installer/bin/Release/MyWorkspaceWinV10Setup.msi` (로컬화 빌드: `installer/bin/Release/ko-kr/MyWorkspaceWinV10Setup.msi`)
- MSI 설치 시 `.wsp` 확장자와 `wsp.ico` 아이콘이 Windows에 등록되며, `.wsp` 파일 더블 클릭으로 프로젝트를 열 수 있습니다.

### 아이콘 재생성

UI·프로그램 아이콘(`Assets/app.ico`, `Assets/Icons/**/*.png`)을 수정·재생성하려면:

```bash
dotnet run --project tools/IconGenerator/IconGenerator.csproj -c Release
```

`Assets` 파일이 없으면 Win 프로젝트 빌드 시 위 도구가 자동 실행됩니다 (`GenerateIconsIfMissing` MSBuild 타깃).

## 주요 기능

| 영역 | 설명 |
|------|------|
| **Workspace** | 계층 구조, Page와 하위 Workspace 공존, 드래그 앤 드롭 이동, 멤버 관리 |
| **Page** | WebView2 기반 WYSIWYG Markdown 편집, DB 자동 저장(2초), 저장 지연 시 진행 대화상자 |
| **Page 탭** | 여러 Page를 탭으로 동시에 열기, 탭 전환 시 **변경 시에만** 저장, ×로 닫기(미저장 시 확인) |
| **빠른 Page 작성** | Workspace 선택 후 **제목** 또는 **본문** 입력 시 즉시 Page 생성 (제목 없으면 `제목없음`) |
| **문서 구조** | H1~H6 제목 Outline, 편집 위치 연동 (내비·보기·툴바). 전용 아이콘 `document_structure` |
| **Page 댓글** | Page별 댓글 스레드, Markdown·이미지·파일 첨부, 본문 인용, 패널 접기·닫기. 전용 아이콘 `comments` |
| **Workspace 패널** | 좌측 트리 패널 접기·펼치기, 너비 조절, **사용자별** 접힘·너비를 로그인 시 복원 |
| **Page 검색** | 제목 표시줄 검색창에서 Page 제목·본문 검색 후 바로 이동 |
| **내보내기** | Page·Workspace를 Markdown(.md), Word(.docx), PDF(.pdf)로 내보내기 (Workspace 트리 우클릭). 편집 중 Page는 툴바에서도 내보내기 가능 |
| **프로젝트 (.wsp)** | Workspace 전체를 로컬 `.wsp` 파일로 저장·열기 (파일 메뉴, 마지막 폴더 기억) |
| **버전 이력** | Page당 최대 50개 스냅샷, 복원 |
| **인증** | 관리자 / 일반 사용자, DB 기반 계정, 로그아웃 확인 |
| **DB** | MariaDB, MySQL, PostgreSQL, SQL Server, SQLite 3 |
| **즐겨찾기** | 등록된 Workspace 즐겨찾기 (DB 저장) |
| **테마** | 밝게 / 어둡게, 20종 파스텔 강조색·사용자 선택색, UI 글꼴 크기 5단계 (환경 설정) |
| **알림** | SMTP 설정 시 Page·Workspace 변경 이메일 (선택) |

### 내보내기 형식 요약

| 형식 | Page | Workspace | 첨부·이미지 처리 |
|------|------|-----------|------------------|
| **Markdown** | 단일 `.md` + `{파일명}_assets/` | 하위 폴더 구조 유지, Page별 `.md` + assets | 이미지·파일을 assets 폴더에 복사 |
| **Word** | 단일 `.docx` | Page별 `.docx` | 이미지·첨부 파일을 문서에 포함(OLE) |
| **PDF** | 단일 `.pdf` | Page별 `.pdf` | 이미지는 본문에 표시, 기타 파일은 `_assets` + 파일명 링크 |

## 데이터베이스

- 스키마 참고: [`database/schema.sql`](database/schema.sql)
- 최초 실행: **로그인 화면** → 기본 관리자 `admin` / `admin` 로그인 → DB 연결 실패 시 **제목 표시줄 `|||` → DB 연결 설정...** (관리자) → 이후 **관리 → 사용자 관리** 또는 **프로필 → 비밀번호 변경**에서 변경
- 사용자·관리자 계정은 **DB `users` 테이블**에서 관리 (파일/하드코딩 아님). DB에 사용자가 없을 때만 `admin` / `admin` 자동 생성
- 연결 설정 저장: `%LocalAppData%\MyWorkspaceWinV10\appsettings.local.json`

지원 DB 및 기본 포트:

| Provider | 기본 포트 |
|----------|-----------|
| MariaDB / MySQL | 3306 |
| PostgreSQL | 5432 |
| SQL Server | 1433 |
| SQLite 3 | (파일 경로) |

## 프로젝트 구조

```
MyWorkspaceWinV10/
├── src/
│   ├── MyWorkspace.Core/     # 엔티티, enum, 서비스 인터페이스, 모델
│   ├── MyWorkspace.Data/     # EF Core, DbContext, 서비스 구현, DbInitializer
│   └── MyWorkspace.Win/      # WinForms UI, appsettings.json, Page 템플릿
│       ├── Assets/           # app.ico, wsp.ico, Icons/s16·s20·s28 PNG (임베드 리소스)
│       ├── CommentHtmlBuilder.cs
│       ├── EditorHtmlBuilder.cs
│       ├── PageCommentsPanel.cs
│       ├── PageTabBar.cs
│       ├── PageExportService.cs
│       ├── WorkspaceExportService.cs
│       ├── MarkdownDocxExporter.cs
│       ├── WebViewEditorController.cs
│       └── Forms/
│           ├── MainForm.PageTabs.cs
│           ├── MainForm.WorkspacePanel.cs
│           └── SaveProgressDialog.cs
├── tests/
│   └── MyWorkspace.MultiImage.Tests/  # Markdown·page-asset 시나리오 테스트
├── tools/
│   └── IconGenerator/        # PNG·ICO 아이콘 생성 도구
├── database/
│   └── schema.sql            # MariaDB DDL 참고 (실제 스키마는 DbInitializer가 보강)
├── installer/                # WiX MSI
├── README.md
├── UsersGuide.md
└── .gitignore
```

## 설정 파일

| 파일 | 용도 |
|------|------|
| `src/MyWorkspace.Win/appsettings.json` | 기본 DB·Email 설정 (저장소에 포함) |
| `%LocalAppData%\MyWorkspaceWinV10\appsettings.local.json` | 사용자 DB·SMTP·테마·색상·글꼴·언어·Page 검색창·최근 프로젝트·**마지막 Page(사용자별)**·**Workspace 패널 접힘·너비(사용자별)** (로컬, git 제외) |
| `%LocalAppData%\MyWorkspaceWinV10\Templates\Pages\` | 사용자 Page 템플릿 |
| `%LocalAppData%\MyWorkspaceWinV10\PageAssets\` | Page별 이미지·첨부 캐시 (로컬, git 제외) |

## 의존성 (NuGet)

| 패키지 | 프로젝트 | 용도 |
|--------|----------|------|
| Entity Framework Core 10 | Data | ORM |
| Pomelo.EntityFrameworkCore.MySql | Data | MariaDB / MySQL |
| Npgsql.EntityFrameworkCore.PostgreSQL | Data | PostgreSQL |
| Microsoft.EntityFrameworkCore.SqlServer | Data | SQL Server |
| Microsoft.EntityFrameworkCore.Sqlite | Data | SQLite |
| Markdig | Win | Markdown → HTML |
| DocumentFormat.OpenXml | Win | Word(.docx) 내보내기 |
| Svg.Skia | Win | SVG → Word/PDF용 래스터 변환 |
| ReverseMarkdown | Win | HTML → Markdown (저장·붙여넣기) |
| Microsoft.Web.WebView2 | Win | WYSIWYG 편집기, PDF 인쇄 |
| Microsoft.Extensions.Configuration.Json | Win | 설정 로드 |

## 아키텍처 메모

- **Core / Data / Win** 3계층 분리 — 향후 웹 버전 재사용을 고려
- WinForms: 로직은 `Form.cs`, 레이아웃은 `Form.Designer.cs` (Visual Studio 디자이너 편집 가능)
- 좌측 **VerticalNavRail**: 파일·Workspace·보기(문서 구조)·댓글·관리 메뉴 및 하단 **프로필 / 설정 / 로그아웃** (문서 구조·댓글은 전용 아이콘)
- **PageTabBar**: 편집기 상단에 열린 Page 탭 표시, 단일 WebView2 편집기 공유
- `AppServices`가 Data 계층 서비스를 수동 조립 (`AppConfig`에서 로드)
- UI 테마: `AppTheme`, `PastelThemePaletteBuilder`, `PastelColorThemePicker` — 밝기/어두움·강조색·글꼴 크기·Dialog 버튼 스타일 일괄 적용
- 편집기: `WebViewEditorController` + `EditorHtmlBuilder` (contenteditable HTML ↔ Markdown, 이미지 드래그·표 내 이동, 파일 대화상자 전 **삽입 위치 마커** 저장)
- 저장: `SaveProgressScope` — **3초** 이상 걸리면 진행 대화상자 표시 (편집기 준비 → 내용 읽기 → DB → 프로젝트 파일)
- 댓글: `PageCommentsPanel` + `CommentHtmlBuilder`, DB `page_comments` (첨부는 `page_assets`와 연동)
- Page 검색: `TitleBarPageSearchBox` — Workspace 트리 범위에서 제목·본문 검색
- 내보내기: Workspace 트리 컨텍스트 메뉴 + 편집 툴바; `PageMarkdownNormalizer`가 assets 폴더·PDF 링크·손상된 page-asset 링크 복구 처리
- 아이콘: `IconAssets`가 `Assets` 임베드 리소스 로드, `IconGenerator`로 일괄 생성 (`document_structure`, `comments` 등)

## 라이선스

Copyright © 2026 SHKWON(knix008@naver.com)
