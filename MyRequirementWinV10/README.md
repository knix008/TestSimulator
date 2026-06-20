# ReqTrace

Windows용 **요구사항 추적(Requirements Traceability)** 관리 프로그램입니다. Excel에서 요구사항을 가져오고, 테스트 케이스·실행 결과를 연결하여 추적성을 유지하며, Excel·Word·Markdown·PDF 보고서로 내보낼 수 있습니다. MySQL·MariaDB·PostgreSQL·SQLite3·MS SQL Server에 직접 연결해 프로젝트를 저장/불러올 수도 있습니다.

**사용자 가이드**: 상세 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

**웹 애플리케이션**: 데스크톱 앱과 독립적으로 동작하는 브라우저용 클라이언트는 [Webapp/README.md](Webapp/README.md)를 참고하세요.

## 실행 환경

- Windows 10/11 (64비트)
- **배포용 설치**: MSI 설치 프로그램 사용 시 .NET 별도 설치 불필요 (self-contained)
- **개발 빌드**: [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 / 2026 (권장) 또는 `dotnet` CLI

## 설치 (MSI)

Release 빌드로 생성된 MSI를 실행합니다.

- 출력 파일: `Installer/Output/ReqTraceSetup-1.0.0.msi`
- 설치 중 **시작 메뉴 바로 가기**, **바탕 화면 바로 가기**, **`.reqtproj` 파일 연결**을 각각 선택할 수 있습니다.
- `.reqtproj` 파일을 더블 클릭하면 ReqTrace가 실행되어 해당 프로젝트를 엽니다.

## 빌드 / 실행

### Visual Studio

1. `ReqTrace.slnx` 열기
2. `ReqTrace` 프로젝트를 시작 프로젝트로 설정
3. Debug 구성에서 F5로 실행

**MSI 생성 (Release)**

1. 솔루션 구성: **Release** (플랫폼 **Any CPU** 또는 **x64** 모두 가능)
2. **솔루션 빌드** (ReqTrace만 빌드하면 MSI는 생성되지 않음 — Installer 프로젝트 포함 필요)
3. WiX 프로젝트 빌드를 위해 [HeatWave for VS](https://www.firegiant.com/heatwave/) 확장 설치 권장
4. 출력: `Installer/Output/ReqTraceSetup-1.0.0.msi`

> Visual Studio 기본 구성 **Release | Any CPU**에서도 Installer 프로젝트는 자동으로 **x64**로 빌드됩니다. 이전에는 플랫폼 불일치(ICE80)로 MSI가 생성되지 않을 수 있었습니다.

### dotnet CLI

```bash
cd ReqTrace
dotnet build ReqTrace.csproj -c Debug
dotnet run --project ReqTrace.csproj -c Debug
```

**MSI 빌드**

```powershell
cd Installer
.\build-installer.ps1
```

### 샘플 프로젝트

| 파일 | 설명 |
|------|------|
| `Sample/Sample.reqtproj` | 영문 샘플 |
| `Sample/Sample.xlsx` | 영문 Excel import 샘플 |
| `Sample/SampleKo.reqtproj` | 한글 샘플 |
| `Sample/SampleKo.xlsx` | 한글 Excel import 샘플 |

Excel 가져오기 시 **테스트 케이스 자동 생성** 문구는 UI 언어(기본: 한국어)에 맞게 생성됩니다. 우선순위·상태 열은 한글/영문 값 모두 인식합니다.

실행 파일이 다른 프로세스에 의해 잠겨 빌드가 실패하면, 실행 중인 ReqTrace를 종료한 뒤 다시 빌드하세요.

## 화면 구성

| 영역 | 설명 |
|------|------|
| **좌측** | 요구사항 목록 (코드, 제목, 설명, 카테고리, 우선순위, 상태, 테스트 상태, 출처, 상위) |
| **우측 상단** | 선택한 요구사항 **상세 패널** (인라인 편집·자동 저장) |
| **우측 하단** | 해당 요구사항에 연결된 테스트 케이스 그리드 |

좌·우 및 상·하 분할선을 드래그하여 패널 크기를 조절할 수 있습니다. 각 패널에는 여백과 테두리가 적용되어 있습니다.

## 주요 기능

### 프로젝트 파일

| 형식 | 확장자 | 설명 |
|------|--------|------|
| **ReqTrace 프로젝트** | `.reqtproj` | JSON 형식(UTF-8), 기본 저장 형식 |

- 새 프로젝트, 열기, 저장, 다른 이름으로 저장
- **마지막 작업 프로젝트**를 다음 실행 시 자동으로 열기
- 변경 사항 추적(상태 표시줄 `*`), 최근 프로젝트 목록
- 변경 없이 종료 시 저장 확인 없음
- 앱 설정: `%AppData%\ReqTrace\settings.json`

### Excel 가져오기

- `.xlsx` 파일에서 요구사항 일괄 import
- 시트·헤더 행·열 매핑 지정 (한글/영문 헤더 자동 추론)
- 코드 자동 생성, ParentCode 기반 계층, 테스트 케이스 자동 생성 옵션

### 요구사항 / 테스트 관리

- 요구사항 CRUD, 상위 요구사항(Parent) 지정
- **상세 패널**에서 코드·제목·카테고리·설명·우선순위·상태 **인라인 편집** (자동 저장)
- 목록 **더블 클릭** → 요구사항 편집 대화상자
- 테스트 케이스 추가·편집·삭제 (단계 포함), 그리드 **더블 클릭** 편집
- 테스트 실행 기록 (통과/실패/차단/미실행)
- 목록 **9개 열** 헤더 클릭 정렬, 카테고리/계층 보기

### 보고서 내보내기

| 형식 | 확장자 |
|------|--------|
| Excel | `.xlsx` |
| Word | `.docx` |
| Markdown | `.md` |
| PDF | `.pdf` |

전체 요구사항 또는 테스트가 있는 요구사항만, 실행 이력 포함 여부 선택 가능.

### 다국어

- **한국어** (기본), **English** 지원
- **파일 → 언어 설정**에서 변경 (즉시 반영, 설정 저장)

### 데이터베이스 연결

- **데이터베이스** 메뉴에서 **MySQL, MariaDB, PostgreSQL, SQLite3, MS SQL Server** 중 하나에 연결
- 처음 연결 시 대상 데이터베이스와 테이블(Requirements/TestCases/TestSteps/TestRuns)이 없으면 자동으로 생성
- **데이터베이스에 저장 / 불러오기**로 현재 프로젝트를 DB와 동기화 (파일 기반 `.reqtproj`와는 별도 경로)
- 연결 정보(비밀번호 포함)는 디스크에 저장되지 않고 실행 중에만 메모리에 유지

### 프로그램 정보

- 툴바 **우측**의 정보 아이콘 버튼 또는 **도움말 → 정보**에서 버전·사용 라이브러리 확인

## 프로젝트 구조

```
MyRequirementWinV10/
├── ReqTrace.slnx
├── README.md
├── UsersGuide.md
├── Installer/              # WiX MSI 설치 프로젝트
│   ├── ReqTrace.Installer.wixproj
│   ├── Package.wxs
│   ├── Files.wxs
│   ├── Shortcuts.wxs
│   ├── build-installer.ps1
│   └── Output/             # 생성된 MSI (gitignore)
├── Sample/
│   ├── Sample.reqtproj     # 샘플 프로젝트 (영문)
│   ├── Sample.xlsx         # Excel import 샘플 (영문)
│   ├── SampleKo.reqtproj   # 샘플 프로젝트 (한글)
│   └── SampleKo.xlsx       # Excel import 샘플 (한글)
├── Webapp/                 # 데스크톱 앱과 독립적인 브라우저용 웹앱 (Node.js + React)
│   ├── server/             # Express + TypeScript REST API (Knex, 5개 DB 종류 지원)
│   └── client/             # React + Vite + TypeScript 프론트엔드
└── ReqTrace/
    ├── Assets/             # 앱·프로젝트 아이콘 (PNG/ICO)
    ├── Forms/              # WinForms UI (DatabaseConnectionForm 포함)
    ├── Importing/          # Excel import, 열 매핑
    ├── Localization/       # 다국어 문자열
    ├── Models/             # 도메인 모델
    ├── Persistence/        # .reqtproj·설정 저장, Database/ (DB 연결·스키마 초기화)
    ├── Reporting/          # 보고서 export
    ├── Resources/          # AppAssets, IconFactory
    ├── Services/           # 비즈니스 로직
    ├── Theme/              # UI 테마
    └── Tools/IconConverter/  # 아이콘 생성 유틸
```

## 사용 라이브러리

| 패키지 | 용도 |
|--------|------|
| [ClosedXML](https://github.com/ClosedXML/ClosedXML) | Excel 읽기/쓰기 |
| [DocumentFormat.OpenXml](https://github.com/dotnet/Open-XML-SDK) | Word 보고서 |
| [QuestPDF](https://www.questpdf.com/) | PDF 보고서 (Community license) |
| [WixToolset.Sdk](https://wixtoolset.org/) | MSI 설치 프로그램 (Installer 프로젝트) |
| [MySqlConnector](https://mysqlconnector.net/) | MySQL / MariaDB 연결 |
| [Npgsql](https://www.npgsql.org/) | PostgreSQL 연결 |
| [Microsoft.Data.Sqlite](https://learn.microsoft.com/dotnet/standard/data/sqlite/) | SQLite3 연결 |
| [Microsoft.Data.SqlClient](https://github.com/dotnet/SqlClient) | MS SQL Server 연결 |

`Webapp/` 디렉터리는 독립적인 Node.js/React 프로젝트로, 사용 라이브러리는 [Webapp/README.md](Webapp/README.md)에 별도로 정리되어 있습니다 (Express, Knex, mysql2, pg, better-sqlite3, mssql, React, Vite 등).

## 라이선스

이 저장소의 ReqTrace 애플리케이션 코드 라이선스는 저장소 루트 정책을 따릅니다. QuestPDF는 Community license 조건을 준수합니다.
