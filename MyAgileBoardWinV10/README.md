# MyAgileBoard

Windows용 칸반 보드 데스크톱 애플리케이션입니다. 컬럼·카드 기반으로 작업을 관리하고, 요약 차트·Burn Down·완료 이력을 제공합니다.

**사용자 가이드**: 상세 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 실행 환경

- Windows 10/11
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2022/2026 이상 (또는 `dotnet` CLI)

## 빌드 및 실행

```bash
cd MyAgileBoardWinV10
dotnet run
```

또는 솔루션 파일(`MyAgileBoardWinV10.sln`)을 Visual Studio에서 열고 F5로 실행합니다.

```bash
dotnet build MyAgileBoardWinV10/MyAgileBoardWinV10.csproj -c Release
```

### MSI 설치 패키지 (Release)

Visual Studio 2026에서 **Release** 구성으로 빌드하면 WiX 기반 MSI가 자동 생성됩니다. **Debug** 구성에서는 MSI가 만들어지지 않습니다.

```bash
dotnet build MyAgileBoardWinV10/MyAgileBoardWinV10.csproj -c Release
```

**MSI 출력 경로**: `bin/Release/installer/MyAgileBoard_Setup.msi`

설치 UI(**기능 선택** 단계)에서 **바탕화면 바로가기**·**시작 메뉴 바로가기** 설치 여부를 각각 선택할 수 있습니다(기본값: 모두 설치).

`Assets/MyAgileBoard.ico`가 다음에 표시됩니다.

- 설치 마법사 UI
- 바탕화면·시작 메뉴 바로가기
- Windows **설정 → 앱 → 설치된 앱**(프로그램 추가/제거)
- 설치된 `MyAgileBoardWinV10.exe` 파일 아이콘

MSI 빌드: [WiX Toolset v7](https://wixtoolset.org/) (`global.json`에 SDK 고정). Visual Studio에서는 [HeatWave for VS](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17) 설치를 권장합니다.

## 화면 구성

```
┌──────────────────────────────────────────────────────────────────┐
│  메뉴 (파일 | 편집 | 프로젝트 | 보기 | 도움말)                    │
├──────────────────────────────────────────────────────────────────┤
│  툴바 (새로 만들기, 열기, 저장, 실행 취소/다시 실행, 보기 …)      │
├──────────────────────────────────────────────────────────────────┤
│  [Backlog] [To Do] [In Progress] [Review] [Done] [+ 컬럼]        │
│   카드      카드      카드           카드      카드               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  상태 표시줄 (전체 / 완료 / 진행중 카드 수)                       │
└──────────────────────────────────────────────────────────────────┘
```

## 주요 기능

### 프로젝트 파일

| 형식 | 확장자 | 설명 |
|------|--------|------|
| **MyAgileBoard** | `.mab` | JSON 형식(UTF-8), 기본 저장 형식 |

- 저장/열기, 변경 사항 추적(제목 표시줄 `*`)
- 실제 편집이 없으면 종료·새 프로젝트 시 저장 확인을 하지 않습니다
- 마지막으로 사용한 폴더 기억 (`%LocalAppData%\MyAgileBoard\settings.json`)
- 샘플 프로젝트: `Samples/Sample.mab`

### 칸반 보드

- 컬럼 추가·삭제·이름·색상·완료 컬럼 설정
- 컬럼 헤더 드래그로 순서 변경
- 카드 추가·편집·삭제·드래그 이동
- 완료 컬럼으로 이동 시 자동 완료 처리
- 완료 컬럼에서 삭제한 카드는 아카이브에 보관

### 카드 속성

- 제목, 설명, 담당자, 우선순위, 스토리 포인트, 마감일, 태그, 카드 색상

### 보기

| 메뉴 | 설명 |
|------|------|
| **Summary / 차트** | 컬럼·우선순위 통계, 파이/막대 차트 |
| **완료된 항목 보기** | 아카이브된 카드를 주/월/년별로 조회 |
| **Burn Down 차트** | 기간별 완료 포인트 추이 |

### 편집

- 실행 취소 / 다시 실행 (Ctrl+Z / Ctrl+Y)

## 단축키

| 키 | 동작 |
|----|------|
| `Ctrl+N` | 새 프로젝트 |
| `Ctrl+O` | 열기 |
| `Ctrl+S` | 저장 |
| `Ctrl+Shift+S` | 다른 이름으로 저장 |
| `Ctrl+Z` | 실행 취소 |
| `Ctrl+Y` | 다시 실행 |
| `Ctrl+T` | Summary / 차트 |
| `F1` | 프로그램 정보 |

## 프로젝트 구조

```
MyAgileBoardWinV10/
├── Assets/                     앱 아이콘 (MyAgileBoard.ico)
├── Samples/
│   └── Sample.mab              샘플 프로젝트
├── MyAgileBoardWinV10/
│   ├── Controls/
│   │   ├── KanbanColumnControl.cs
│   │   └── KanbanCardControl.cs
│   ├── Forms/
│   │   ├── MyAgileForm.cs      메인 창
│   │   ├── CardEditForm.cs
│   │   ├── ColumnSettingsForm.cs
│   │   ├── SummaryForm.cs
│   │   ├── BurndownChartForm.cs
│   │   └── CompletedHistoryForm.cs
│   ├── Models/
│   │   ├── KanbanProject.cs
│   │   ├── KanbanColumn.cs
│   │   ├── KanbanCard.cs
│   │   └── ArchivedCard.cs
│   ├── Services/
│   │   ├── ProjectService.cs   .mab 저장/불러오기
│   │   └── AppSettings.cs      최근 폴더 등 앱 설정
│   └── Utils/
│       └── IconFactory.cs
└── MyAgileBoardWinV10.sln
```

## 라이선스

이 저장소의 라이선스 정책은 상위 프로젝트(TestSimulator) 규정을 따릅니다.
