# MyWorkspace

Notion 스타일의 Windows 데스크톱 Workspace·Page 관리 애플리케이션입니다. 계층형 Workspace, Markdown Page 편집·미리보기, 버전 이력, 다중 DB 지원, 사용자·관리자 권한, Workspace 즐겨찾기, 밝기/어두운 테마, 선택적 이메일 알림을 제공합니다.

**사용자 가이드**: 상세 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 실행 환경

- Windows 10/11 (x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2026 / 2022 (WinForms 디자이너 권장) 또는 `dotnet` CLI
- MSI 빌드: [WiX Toolset v4+](https://wixtoolset.org/) (`installer` 프로젝트)
- WebView2 Runtime (Markdown 미리보기, Windows 11에는 기본 포함)

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

### Release + MSI

```bash
dotnet build src/MyWorkspace.Win/MyWorkspace.Win.csproj -c Release
```

Release 빌드 시 WiX MSI가 자동 생성됩니다. MSI만 건너뛰려면:

```bash
dotnet build src/MyWorkspace.Win/MyWorkspace.Win.csproj -c Release -p:SkipInstaller=true
```

- MSI 경로: `installer/bin/Release/ko-kr/MyWorkspaceWinV10Setup.msi`

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
| **Page** | Markdown 편집, WebView2 실시간 미리보기, 자동 저장(2초) |
| **빠른 Page 작성** | Workspace 선택 후 바로 편집하면 `제목 없음` Page 자동 생성 |
| **템플릿** | 내장·사용자 Page 템플릿 (`.mdtemplate`) |
| **버전 이력** | Page당 최대 50개 스냅샷, 복원 |
| **인증** | 관리자 / 일반 사용자, DB 기반 계정 |
| **DB** | MariaDB, MySQL, PostgreSQL, SQL Server, SQLite 3 |
| **즐겨찾기** | 등록된 Workspace 즐겨찾기 (DB 저장) |
| **테마** | 밝게 / 어둡게 (환경 설정), 다크 모드 Markdown 툴바 아이콘 자동 보정 |
| **알림** | SMTP 설정 시 Page·Workspace 변경 이메일 (선택) |

## 데이터베이스

- 스키마 참고: [`database/schema.sql`](database/schema.sql)
- 최초 실행: **로그인 화면** 표시 → MariaDB(`appsettings.json` 기본값) 연결 → `admin` / `admin` 로그인 → 필요 시 **관리 → DB 연결 설정...**
- 사용자·관리자 계정은 **DB `users` 테이블**에서 관리 (파일/하드코딩 아님)
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
│   ├── MyWorkspace.Data/     # EF Core, DbContext, 서비스 구현
│   └── MyWorkspace.Win/      # WinForms UI, appsettings.json, Page 템플릿
│       └── Assets/           # app.ico, Icons/s16·s20 PNG (임베드 리소스)
├── tools/
│   └── IconGenerator/        # PNG·ICO 아이콘 생성 도구
├── database/
│   └── schema.sql            # MariaDB DDL 참고
├── installer/                # WiX MSI
├── README.md
├── UsersGuide.md
└── .gitignore
```

## 설정 파일

| 파일 | 용도 |
|------|------|
| `src/MyWorkspace.Win/appsettings.json` | 기본 DB·Email 설정 (저장소에 포함) |
| `%LocalAppData%\MyWorkspaceWinV10\appsettings.local.json` | 사용자 DB·SMTP·테마·언어 오버라이드 (로컬, git 제외) |
| `%LocalAppData%\MyWorkspaceWinV10\Templates\Pages\` | 사용자 Page 템플릿 |

## 의존성 (NuGet)

| 패키지 | 프로젝트 | 용도 |
|--------|----------|------|
| Entity Framework Core 10 | Data | ORM |
| Pomelo.EntityFrameworkCore.MySql | Data | MariaDB / MySQL |
| Npgsql.EntityFrameworkCore.PostgreSQL | Data | PostgreSQL |
| Microsoft.EntityFrameworkCore.SqlServer | Data | SQL Server |
| Microsoft.EntityFrameworkCore.Sqlite | Data | SQLite |
| Markdig | Win | Markdown → HTML |
| Microsoft.Web.WebView2 | Win | 미리보기 |
| Microsoft.Extensions.Configuration.Json | Win | 설정 로드 |
| ReverseMarkdown | Win | HTML → Markdown (붙여넣기 등) |

## 아키텍처 메모

- **Core / Data / Win** 3계층 분리 — 향후 웹 버전 재사용을 고려
- WinForms: 로직은 `Form.cs`, 레이아웃은 `Form.Designer.cs` (Visual Studio 디자이너 편집 가능)
- `AppServices`가 Data 계층 서비스를 수동 조립 (`AppConfig`에서 로드)
- UI 테마: `AppTheme`, `ThemePalette`, `ThemedTreeView` — 트리 연결선·선택 하이라이트·다크 모드 일괄 적용
- 아이콘: `IconAssets`가 `Assets` 임베드 리소스 로드, `IconGenerator`로 일괄 생성

## 라이선스

Copyright © 2026 SHKWON(knix008@naver.com)
