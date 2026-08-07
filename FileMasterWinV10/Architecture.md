# Command Center — 아키텍처

이 문서는 Command Center(FileMasterWinV10)의 내부 구조와 핵심 설계 결정을 설명합니다.

## 1. 기술 스택

| 항목 | 값 |
|------|-----|
| 런타임 | .NET 8 (`net8.0-windows`) |
| UI | Windows Forms |
| 언어 | C# (`Nullable` enable, `ImplicitUsings` enable) |
| 루트 네임스페이스 | `FileMasterWinV10` |
| 실행 파일 | `CommandCenter.exe` (x64) |

## 2. 레이어 개요

```
┌───────────────────────────────────────────────┐
│ MainForm (셸)                                   │
│  - MenuStrip / ToolStrip(검색 포함) / StatusStrip │
│  - mainSplit (상: 파일영역 / 하: 미리보기)        │
│     └ leftRightSplit (좌 FilePanel | 우 FilePanel)│
│        └ 가운데 버튼 막대(복사/이동, 도킹)         │
└───────────────────────────────────────────────┘
        │ 사용            │ 사용
        ▼                 ▼
   Controls          Helpers (서비스/유틸)
 FilePanel 등     SearchIndexService, FileOperations,
                  UiTheme, LocalizationService, ...
                        │
                        ▼
                     Models (FileEntry ...)
```

- **MainForm**: 애플리케이션 셸. 메뉴·툴바·상태표시줄·스플리터를 구성하고 두 `FilePanel`을 조율한다. 메뉴/툴바는 **런타임에 코드로 생성**된다(언어/테마 전환 시 `RebuildChrome()`으로 재생성해야 하므로 디자이너가 아닌 코드로 관리).
- **Controls**: 재사용 UI 컴포넌트. 디자이너에서 편집 가능한 정적 레이아웃은 `*.Designer.cs`에 선언.
- **Helpers**: 상태를 가진 서비스와 무상태 유틸리티.
- **Models**: 순수 데이터(예: `FileEntry`).

## 3. 핵심 컴포넌트

### 3.1 MainForm
- **레이아웃**: `mainSplit`(수평 스플리터, Panel1=파일 영역, Panel2=미리보기 — 기본 접힘). Panel1 안에 `leftRightSplit`(수직 스플리터)로 좌/우 `FilePanel` 배치. 좌·우측 여백은 `mainSplit.Panel1/Panel2`의 Padding으로 부여.
- **가운데 버튼 막대(`BuildCenterBar`)**: 오른쪽 패널의 왼쪽 가장자리에 폭 40px 패널을 **도킹**하고 복사/이동 버튼 4개를 수직·수평 중앙 정렬. 스플리터 위에 오버레이하지 않는 이유는 넓은 색상 스플리터 오버레이가 드래그 시 세로 잔상을 유발하기 때문(도킹 방식은 잔상 없음).
- **툴바 검색(`CreateSearchToolItems` / `RunInlineSearch`)**: `ToolStripLabel`(아이콘+"검색") + `ToolStripComboBox`(입력, 편집 가능) + `ToolStripButton`(Indexing↔멈춤 토글). 툴바 인스턴스는 한 번만 만들고 이벤트를 건 뒤, `BuildToolbar`에서 매번 다시 add(언어/테마 재생성에도 이벤트 유지).
- **활성 패널 표시(`SetActivePanel`)**: 포커스된 패널을 강조 테두리로 표시. 두 패널 모두 상시 옅은 테두리, 활성은 강조색으로 더 두껍게(`FilePanel.SetActive`).

### 3.2 FilePanel (Controls/FilePanel)
한쪽 파일 목록 전체를 담당하는 UserControl.
- **상단 경로 표시줄(`pathBar`)**: `[드라이브 드롭다운][디렉토리 박스(경로 + ▾)]`. 디렉토리 박스를 누르면 `FolderTreeDropdownPanel`이 펼쳐진다.
- **드라이브 드롭다운**: `DriveInfo.GetDrives()`로 런타임에 채움. 현재 경로의 드라이브를 자동 선택.
- **목록**: `ListView`(Details). `FileEntry`를 Tag로 보관, 아이콘은 `IconHelper`.
- **드래그 앤 드롭**: `OnItemDrag`(패널→외부), `OnDragEnter/Over/Drop`(외부→패널). Shift = 이동, 그 외 = 복사. 같은 폴더 드롭은 무시.
- **RevealFile**: 검색 결과 선택 시 파일이 있는 폴더로 이동한 뒤(`_pendingSelectPath`) 로드 완료 시 해당 항목을 선택·포커스.
- **자동 새로고침**: `DirectoryChangeWatcher` + `FileOperationRunner.OperationCompleted`로 변경 감지 후 목록 갱신.

### 3.3 SearchIndexService (Helpers/SearchIndexService.cs)
싱글턴. 빠른 파일 검색을 위한 이름 색인.
- **범위**: 모든 **고정(Fixed) 드라이브** 전체.
- **영속화**: `%LocalAppData%\CommandCenter\search-index.bin`(바이너리). 시작 시 로드, 없으면 백그라운드 재색인. 변경분은 주기적(120초) 자동 저장 + 종료 시 저장.
- **증분 갱신**: 드라이브별 `FileSystemWatcher`로 생성/삭제/이름변경/변경 반영. 버퍼 오버플로 시 전체 재색인.
- **검색**: `Search(pattern, options, root, ct)` — `root=null`이면 전 드라이브, 값이 있으면 해당 하위로 제한. 매칭·점수·정렬은 `DesktopSearchHelper`.
- **상태**: `NotBuilt / Building / Ready`, `StatusChanged` 이벤트로 UI(상태표시줄·Indexing 버튼) 갱신.

### 3.4 FileOperations (Helpers/FileOperations.cs)
무상태 파일 작업 유틸.
- `CopyFiles` / `MoveFiles`: 폴더 재귀 처리 + 진행률 보고.
- `DeleteFiles`: **휴지통으로 이동**(`Microsoft.VisualBasic.FileIO.FileSystem` + `RecycleOption.SendToRecycleBin`). 영구 삭제가 아님.
- `SearchFilesAsync`: 인덱스가 준비되지 않았을 때의 파일시스템 직접 검색 대체 경로.

### 3.5 DesktopSearchHelper
검색어 파싱(OR `+`, AND `*`, 와일드카드/정규식), 이름 점수화(`ScoreName`: 완전일치 100 / 접두 80 / 포함 60), 정렬(`SortMatches`).

### 3.6 UiTheme / LocalizationService
- **UiTheme**: 라이트/다크 색상 팔레트와 컨트롤 스타일 헬퍼(`StyleListView`, `StyleComboBox`, `StyleSecondaryButton`, `StyleMenuAndToolStrip` 등), 이중 버퍼링 헬퍼.
- **LocalizationService**: `T(key)`로 현재 언어 문자열 반환. 언어/테마 변경 시 `RebuildChrome()`이 메뉴·툴바를 재생성하고 각 패널의 `ApplyLocalization()`/`ApplyCurrentTheme()`을 호출.

## 4. 주요 설계 결정

1. **메뉴/툴바는 코드 생성** — 런타임 다국어·테마 전환을 위해 `RebuildChrome`에서 통째로 재생성. 새로 추가한 정적 UI(드라이브/디렉토리 드롭다운, 검색 항목)는 디자이너 친화적으로 유지하되, 툴바 검색 항목은 재생성에도 살아남도록 필드로 보관 후 재-add.
2. **가운데 버튼 막대는 오버레이가 아닌 도킹** — SplitContainer 스플리터 위 오버레이는 드래그 잔상 문제가 있어, 오른쪽 패널 왼쪽에 도킹.
3. **삭제 기본값은 휴지통** — 실수 복구가 가능하도록 영구 삭제 대신 휴지통 이동을 기본으로.
4. **색인은 전 드라이브 + 영속화** — 앱을 껐다 켜도 즉시 검색 가능하고, 감시로 최신 상태 유지.
5. **UI 스레드 마샬링** — 백그라운드(색인·파일작업)에서의 상태 변경은 `BeginInvoke`로 UI 스레드에 전달.

## 5. 데이터 흐름 예시 — 툴바 검색

```
사용자 입력 + Enter
   → RunInlineSearch()
      → index.Ready 이면  SearchIndexService.Search(term, root=null)   (전 드라이브)
        아니면           FileOperations.SearchFilesAsync(현재 폴더)     (대체)
      → 결과를 검색 콤보 Items에 채우고 드롭다운 펼침
   → 항목 선택(SelectionChangeCommitted)
      → OpenSearchHit → 폴더면 Navigate, 파일이면 FilePanel.RevealFile(폴더 이동 + 선택)
```

## 6. 배포

Release 빌드 시 `csproj`의 `BuildInstallerMsi` 타깃이 WiX 프로젝트(`CommandCenter.Installer`, `CommandCenter.Bootstrapper`)를 빌드해 MSI + 설치 부트스트래퍼 `.exe`를 생성한다. 빌드 시각은 `BuildTimestamp`로 어셈블리 메타데이터에 주입되어 정보 화면에 표시된다.
