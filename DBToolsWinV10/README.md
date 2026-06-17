# DBToolsWinV10

Windows용 ER 다이어그램 및 데이터베이스 스키마 설계 도구입니다. 테이블·컬럼·관계를 시각적으로 편집하고, 정규화 검사·보고서 작성·SQL/JSON보내기를 지원합니다. SQLite, PostgreSQL, MySQL, MariaDB, SQL Server, FAISS(Vector DB) 형식의 DDL 생성과 DB 파일 가져오기를 제공합니다.

## 실행 환경

- Windows 10/11 (x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download) (프로젝트 `global.json` 기준)
- Visual Studio 2022 (권장) 또는 `dotnet` CLI

### 선택 사항

| 기능 | 요구 사항 |
|------|-----------|
| Release MSI 설치 패키지 빌드 | [WiX Toolset](https://wixtoolset.org/) 6.x (`WixToolset.Sdk` NuGet으로 자동 복원) |
| SQL Server `.mdf` Sample / 가져오기 | SQL Server LocalDB |
| Access `.accdb` Sample / 가져오기 | Microsoft Access Database Engine (ACE OLEDB) |

## 빌드 / 실행

### Visual Studio

1. `DBToolsWinV10.sln` 열기
2. `DBToolsWinV10` 프로젝트를 시작 프로젝트로 설정
3. **Debug**: F5로 실행
4. **Release**: 빌드 시 MSI 설치 패키지가 자동 생성됩니다

### dotnet CLI

```bash
dotnet build .\DBToolsWinV10.csproj -c Debug
dotnet run --project .\DBToolsWinV10.csproj -c Debug
```

명령줄에서 프로젝트 파일을 바로 열 수 있습니다.

```bash
dotnet run --project .\DBToolsWinV10.csproj -- "C:\path\to\schema.mdprj"
```

## 설치 패키지 (MSI)

**Release** 구성으로 빌드하면 WiX 설치 프로젝트가 함께 실행되어 MSI가 생성됩니다.

| 항목 | 내용 |
|------|------|
| 출력 경로 | `installer\bin\Release\ko-kr\DBToolsWinV10Setup.msi` |
| 설치 위치 | `C:\Program Files\DBToolsWinV10\` |
| 바로 가기 | 설치 시 바탕 화면·시작 메뉴 생성 여부 선택 |
| 파일 연결 | `.mdprj` 프로젝트 파일을 DBTools와 연결 |
| 업그레이드 | 기존 설치가 있으면 제거 후 재설치 동의 확인 |
| 제거 옵션 | 작업 데이터(`%AppData%\DBToolsWinV10`) 삭제 여부 선택 |

MSI만 별도로 빌드하려면:

```bash
dotnet build .\installer\DBToolsWinV10.Installer.wixproj -c Release -p:Platform=x64
```

설치 패키지 빌드만 건너뛰려면 `-p:SkipInstaller=true`를 지정합니다.

## 주요 기능

- **ER 다이어그램 편집**: 테이블 배치, 1:1 / 1:N / N:M 관계, 컬럼 속성 편집
- **캔버스 조작**: 빈 영역 드래그로 이동(팬), 확대/축소, 전체 맞춤, 배율 100% 복원
- **DB 파일 가져오기**: SQLite, SQLCipher, Vector Index(Faiss/hnswlib), SQL DDL, SQL Server (`.mdf`), Access (`.mdb` / `.accdb`)
- **프로젝트 저장**: `.mdprj` (JSON, UTF-8)
- **보내기**: 대상 DB별 SQL DDL, JSON
- **정규화 검사**: 1NF / 2NF / 3NF 분석, 우측 탭에 결과·심각도·문제 컬럼 표시
- **보고서**: Markdown 형식 스키마 보고서
- **Sample 생성**: DB별 OnlineShop 예제 스키마·파일 생성
- **오류 표시**: 예외 유형·메시지·발생 위치·스택 트레이스를 상세 대화상자로 표시

## 화면 구성

- **좌측**: 도구 패널 (선택, 테이블, 관계, 확대/축소/맞춤)
- **가운데**: ER 다이어그램 캔버스 (눈금자 포함)
- **우측**: 구조 트리 · 정규화 분석 · 속성 패널 (분류별/사전순 정렬)

## Template 파일

`Template/` 폴더에 DB별 OnlineShop 예제 파일이 모여 있습니다. 빌드 시 실행 파일 옆 `Template/`에도 복사됩니다.

| 파일 | 설명 |
|------|------|
| `OnlineShop.mdprj` | 프로젝트 파일 |
| `OnlineShop_sqlite.db`, `OnlineShop.db` | SQLite 데이터베이스 |
| `OnlineShop_postgres.sql` | PostgreSQL DDL |
| `OnlineShop_mysql.sql` | MySQL DDL |
| `OnlineShop_mariadb.sql` | MariaDB DDL |
| `OnlineShop_sqlserver.sql` | SQL Server DDL |
| `OnlineShop_sqlserver.mdf` | SQL Server 데이터 파일 (LocalDB로 생성) |
| `OnlineShop_access.accdb` | Access 데이터베이스 |
| `OnlineShop_report.md` | 스키마 보고서 |

UI에서 **파일 → Sample 생성** 또는 툴바 **Sample** 버튼으로 `Template/`에 재생성할 수 있습니다. 콘솔에서 전체 생성:

```bash
dotnet run --project .\Sample\Sample.csproj
```

## 문서

- [UsersGuide.md](UsersGuide.md) — 기능별 상세 사용 설명

## 프로젝트 구조

```
DBToolsWinV10/
├── App/            # 설정, 테마, 아이콘, 최근 파일, 오류 표시
├── Analysis/       # 정규화 분석, 보고서
├── Controls/       # 다이어그램 캔버스, 속성 그리드
├── Dialogs/        # 편집·오류 대화상자
├── Export/         # SQL DDL보내기
├── Import/         # DB 파일 가져오기
├── installer/      # WiX MSI 설치 패키지 (Release 빌드)
├── Models/         # 스키마 모델
├── Sample/         # Sample 생성기 (콘솔 도구)
├── Template/       # DB별 OnlineShop 예제 파일
├── Serialization/  # .mdprj 직렬화
├── MainForm.cs     # 메인 UI
└── Program.cs      # 진입점
```

## 라이선스

저장소 루트 또는 본 프로젝트의 라이선스 정책을 따릅니다.
