# MyAgileBoard

Windows용 칸반 보드 데스크톱 애플리케이션입니다. 컬럼·카드 기반으로 작업을 관리하고, 자유 배치 캔버스·요약 차트·Burn Down·리포트 내보내기·완료 이력을 제공합니다.

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
│  메뉴 (파일 | 편집 | 프로젝트 | 보내기 | 보기 | 도움말)           │
├──────────────────────────────────────────────────────────────────┤
│  툴바 (새로 만들기, 열기, 저장, 실행 취소/다시 실행, 보내기 …)   │
├──────────────────────────────────────────────────────────────────┤
│  [Backlog] [To Do] [In Progress] [Review] [Done] [+ 컬럼]        │
│   카드(자유 배치)   카드              카드           카드          │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  상태 표시줄 (전체 / 완료 / 진행중 카드 수)                       │
└──────────────────────────────────────────────────────────────────┘
```

## 주요 기능

### 프로젝트 파일 (.mab)

| 형식 | 확장자 | 설명 |
|------|--------|------|
| **MyAgileBoard** | `.mab` | JSON 형식(UTF-8), 기본 저장 형식 |

저장 시 다음이 프로젝트 파일에 포함됩니다.

- 프로젝트 이름, 생성일, 창 위치·크기
- 컬럼·카드 전체 설정(색상, 글꼴, 너비, 캔버스 배치 등)
- 카드 크기·회전·접힘·Z 순서
- 아카이브된 완료 카드
- Burn Down 차트 색상
- 배경 눈금(그리드) 표시 여부

- 저장/열기, 변경 사항 추적(제목 표시줄 `*`)
- 실제 편집이 없으면 종료·새 프로젝트 시 저장 확인을 하지 않습니다
- 마지막으로 사용한 폴더 기억 (`%LocalAppData%\MyAgileBoard\settings.json`)
- **샘플 프로젝트**: `Samples/Sample.mab` — 4개 컬럼, 10장 카드, 모든 카드에 접힘·크기 그립 적용

### 칸반 보드

- 컬럼 추가·삭제·순서 변경·설정(헤더/캔버스/제목 색·글꼴·너비)
- 컬럼 캔버스 위 카드 **자유 배치**(드래그), **크기 조절**, **회전**, **앞/뒤 순서**
- 완료 컬럼 지정, 완료 시각 자동 기록
- 배경 눈금(그리드) 표시/숨기기

### 카드

- 제목·설명(RTF 서식), 담당자, 우선순위, 스토리 포인트, 마감일, 태그, 카드 색상
- 메모 크기 프리셋(자동/작음/중간/큼/넓음/사용자 지정)
- 우측 상단 **접힘(도그이어)** 표시 on/off
- 편집 대화상자 **실시간 미리보기**(취소 시 원래 상태 복원)

### 보기

| 메뉴 | 설명 |
|------|------|
| **Summary / 차트** | 컬럼·우선순위 통계, 파이/막대 차트 |
| **완료된 항목 보기** | 아카이브된 카드를 주/월/년별로 조회 |
| **Burn Down 차트** | 기간별 완료 포인트 추이, 차트 색상 설정 |

### 보내기

| 항목 | 설명 |
|------|------|
| **Report — Markdown / Word / PDF** | 프로젝트 요약·차트 포함 리포트 |
| **Report 인쇄** | 인쇄 미리보기 |
| **컬럼 카드 이미지** | 컬럼별 카드 보드를 PNG 등으로 내보내기 |

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
| `Ctrl+Shift+M` | Report — Markdown |
| `Ctrl+Shift+W` | Report — Word |
| `Ctrl+Shift+P` | Report — PDF |
| `Ctrl+P` | Report 인쇄 |
| `Ctrl+[` / `Ctrl+]` | 선택 카드 회전(±15°) |
| `Ctrl+0` | 선택 카드 회전 초기화 |
| `F1` | 프로그램 정보 |

## 샘플 프로젝트 재생성

`Samples/Sample.mab`는 `SampleProjectFactory`로 생성됩니다. 내용을 바꾼 뒤 아래 명령으로 다시 만들 수 있습니다.

```bash
dotnet run --project Tools/GenerateSample/GenerateSample.csproj -c Release
```

## 프로젝트 구조

```
MyAgileBoardWinV10/
├── Assets/                         앱 아이콘 (MyAgileBoard.ico)
├── Samples/
│   └── Sample.mab                  샘플 프로젝트
├── Tools/
│   └── GenerateSample/             Sample.mab 생성 도구
├── installer/                      WiX MSI 설치 프로젝트
├── MyAgileBoardWinV10/
│   ├── Controls/
│   │   ├── KanbanColumnControl.cs  컬럼·캔버스
│   │   ├── KanbanCardControl.cs    카드 UI·드래그·크기·회전
│   │   ├── CardResizeGripPanel.cs  크기 조절 그립
│   │   └── CardFoldCornerPanel.cs  접힘 오버레이
│   ├── Forms/
│   │   ├── MyAgileForm.cs          메인 창
│   │   ├── CardEditForm.cs         카드 편집
│   │   ├── ColumnSettingsForm.cs   컬럼 설정
│   │   ├── SummaryForm.cs
│   │   ├── BurndownChartForm.cs
│   │   ├── BurndownChartColorForm.cs
│   │   ├── CompletedHistoryForm.cs
│   │   └── ExportImageFormatDialog.cs
│   ├── Models/
│   │   ├── KanbanProject.cs
│   │   ├── KanbanColumn.cs
│   │   ├── KanbanCard.cs
│   │   ├── ArchivedCard.cs
│   │   └── BurndownChartColorSettings.cs
│   ├── Services/
│   │   ├── ProjectService.cs       .mab 저장/불러오기
│   │   ├── ProjectBoardSync.cs     보드 ↔ 모델 동기화
│   │   ├── SampleProjectFactory.cs 샘플 프로젝트 정의
│   │   ├── AppSettings.cs          최근 폴더 등 앱 설정
│   │   ├── MarkdownReportExporter.cs
│   │   ├── WordReportExporter.cs
│   │   ├── PdfReportExporter.cs
│   │   └── ColumnCardImageExporter.cs
│   └── Utils/
│       ├── CardFoldEffect.cs
│       ├── CardResizeGripPainter.cs
│       └── IconFactory.cs
└── MyAgileBoardWinV10.sln
```

## 의존성

- [DocumentFormat.OpenXml](https://www.nuget.org/packages/DocumentFormat.OpenXml) — Word 리포트
- [QuestPDF](https://www.nuget.org/packages/QuestPDF) — PDF 리포트

## 라이선스

이 저장소의 라이선스 정책은 상위 프로젝트(TestSimulator) 규정을 따릅니다.
