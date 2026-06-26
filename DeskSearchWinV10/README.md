# DeskSearch

Windows용 상시 표시 파일·폴더 검색 위젯 (.NET 8 / WPF)

화면 상단에 항상 떠 있는 검색창에서 PC 전체의 **파일과 폴더**를 빠르게 찾고, 탐색기에서 바로 열 수 있습니다. **작업 표시줄에는 아이콘이 없고** 시스템 트레이에만 상주합니다.

## 기능

| 기능 | 설명 |
|------|------|
| 전체 시스템 인덱싱 | 모든 준비된 드라이브·디렉터리·파일을 백그라운드 스캔 (관리자 권한, 배치 병합, 드라이브별 병렬 스캔) |
| 인덱싱 중 검색 | 인덱싱이 끝나기 전에도 검색 가능; 인덱스가 늘어나면 결과 자동 갱신; SQLite 트라이그램(trigram) FTS5 인덱스로 즉시 응답 |
| 인덱싱 중 시스템 영향 최소화 | Windows 백그라운드 모드(CPU·디스크 I/O·메모리 우선순위 하향)로 인덱싱이 GUI·시스템 반응성을 거의 침범하지 않음 |
| 이중 DB 인덱싱 | **첫 인덱싱**은 `index.db`에 직접 기록(인덱싱 중에도 검색 가능). **이후 전체 재인덱싱**부터는 `index.building.db`에 별도 구축하고, 검색은 완료 전까지 기존 `index.db`만 사용 |
| 끊김 없는 재검색 | 재인덱싱 완료 시 새 DB로 교체하고 **기존 `index.db` 파일은 삭제**. 재검색 중에도 검색·GUI는 기존 인덱스로 정상 동작 |
| 인덱싱 진행 단계 표시 | 설정 창에서 **스캔 → 분석 → 인덱스 적용** 단계와 진행률(%)·항목 수 표시 (재검색 시 0%부터, 검색은 기존 인덱스 사용 안내) |
| 인덱싱 중단 후 자동 재개 | 재검색이 끝나기 전에 프로그램이 종료되면, 다음 실행 시 자동으로 재검색을 다시 시도 |
| 파일·폴더 검색 | 파일·폴더 **이름** 기준 실시간 자동완성 (경로는 검색 대상 아님, 최대 12건, 배치 검색); `x`(AND)·`+(OR) 연산자 지원 |
| 정규식 검색 | 설정에서 켜면 .NET 정규식으로 파일·폴더 이름 검색; 연산자·와일드카드와 조합 가능 (아래 [검색 문법](#검색-문법) 참고) |
| 검색 제외 | 설정에서 드라이브·디렉터리를 인덱싱·검색 대상에서 제외; 디렉터리는 찾아보기에서 여러 개 동시 선택해 바로 추가 |
| 다국어 파일명 검색 | UI는 한국어/English만 지원; 파일·폴더 이름은 모든 언어(Unicode NFC)로 검색 |
| 실시간 갱신 | 모든 드라이브 FileSystemWatcher + 4시간 주기 전체 재동기화 |
| 드래그·크기 조절 | ≡ 핸들로 이동, 좌·우 가장자리로 너비 조절 |
| 창 레이아웃 저장 | 위치·너비·높이를 `%AppData%\DeskSearch\settings.json`에 자동 저장 |
| 설정 | 배경/테두리/글자색, 불투명도, 대소문자 구분, 정규식, 검색 제외, 항상 위 |
| 인덱싱 진행률 | 설정 창에서 단계(스캔·분석·인덱스 적용), 진행률(%)·항목 수 확인 및 **재검색** |
| 검색 인덱스 업그레이드 | 검색 구조 개선이 필요하면 진행 여부를 확인 후 진행률(%)을 표시 (최초 1회, 백그라운드 가능) |
| Windows 시작 시 실행 | 작업 스케줄러(로그온, 최고 권한)로 자동 시작 |
| 단일 인스턴스 | 이미 실행 중이면 새 창 대신 기존 검색창 표시 |
| 다크 테마 | 어두운 배경 선택 시 글자·테두리·아이콘 색 자동 조정 |
| 다국어 UI | 한국어 / English |
| 시스템 트레이 | 작업 표시줄 미표시, 트레이에서 표시·숨기기·설정·종료 |
| MSI 설치 | Release 빌드 시 WiX 기반 설치 패키지 (한국어·영어 UI, 바로가기 선택) |

## 빌드 및 실행

```bash
dotnet build DeskSearchWinV10.slnx
dotnet run --project DeskSearch/DeskSearch.csproj
```

**요구사항:** .NET 8 SDK, Windows 10 이상

> 실행 시 **관리자 권한(UAC)** 이 필요합니다. 전체 디스크를 인덱싱하기 위해 `app.manifest`에 `requireAdministrator` 및 `longPathAware`가 설정되어 있습니다.

## MSI 설치 패키지 생성

Release 구성에서만 MSI가 빌드됩니다.

```bash
dotnet build DeskSearchWinV10.slnx -c Release
```

| 출력 | 설명 |
|------|------|
| `DeskSearch.Installer/bin/Release/DeskSearchSetup.msi` | 설치 패키지 (설치 UI: 한국어) |
| `DeskSearch.Installer/bin/Release/DeskSearchSetup.en-US.msi` | 설치 패키지 (설치 UI: English) |
| `DeskSearch/bin/Release/net8.0-windows/win-x64/publish/` | self-contained 배포 파일 (~60MB) |

**요구사항:** .NET 8 SDK, [WiX Toolset](https://wixtoolset.org/) MSBuild SDK (`WixToolset.Sdk` — NuGet 복원)

설치 마법사(`WixUI_FeatureTree`)에서 **바탕화면 바로가기**와 **시작 메뉴 바로가기**를 각각 선택할 수 있습니다.

**사용자 데이터 처리**

| 상황 | 동작 |
|------|------|
| 업그레이드·변경·복구 | 사용자 데이터 삭제 여부를 선택할 수 있음 |
| 제거 | `%AppData%\DeskSearch\settings.json`이 **있을 때만** 삭제 여부를 질문 |

> Debug 구성에서는 WiX 프로젝트가 MSI 빌드를 건너뜁니다. MSI만 따로 빌드하지 않으려면 `-p:SkipInstaller=true`를 사용하세요.

## 아이콘 재생성

`Assets/CreateIcon.ps1`로 `app.png`, `app.ico`를 다시 생성할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File DeskSearch/Assets/CreateIcon.ps1
```

## 사용자 가이드

일반 사용자용 설명은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 검색 문법

검색 대상은 **파일·폴더 이름**뿐입니다 (전체 경로는 검색하지 않음). UI 언어와 무관하게 Unicode(NFC)로 비교합니다.

### 기본 검색

| 검색어 | 설명 |
|--------|------|
| `report` | 이름에 `report`가 **포함**된 항목 |
| `Report` | 기본은 대소문자 무시 (`report`와 동일). 설정에서 **대소문자 구분**을 켜면 구분 |

공백만 있는 검색어는 무시됩니다. 연산자 없이 입력한 문자열은 **하나의 검색어**로 처리됩니다 (`my file.txt`).

### AND / OR 연산자

연산자는 **앞뒤에 공백**이 있어야 합니다. 붙여 쓰면(`foo+bar`, `tax`) 일반 문자로 처리됩니다.

| 연산자 | 의미 | 예시 | 매칭 예 |
|--------|------|------|---------|
| `x` (대소문자 무관) | **AND** — 모두 포함 | `report x 2024` | `report-2024.pdf`, `2024-annual-report.docx` |
| `+` | **OR** — 하나라도 포함 | `doc + pdf` | `notes.doc`, `readme.pdf` |

혼합 시 `+`로 OR 그룹을 나눈 뒤, 각 그룹 안에서 `x`로 AND를 적용합니다.

| 검색어 | 의미 |
|--------|------|
| `budget x 2024 + draft` | (`budget` **그리고** `2024`) **또는** `draft` |
| `a x b + c x d` | (`a` **그리고** `b`) **또는** (`c` **그리고** `d`) |

### 와일드카드 (정규식 **끔**)

`*`·`?`는 파일 시스템식 와일드카드로 해석됩니다. `\`로 이스케이프할 수 있습니다.

| 검색어 | 의미 |
|--------|------|
| `*.pdf` | 확장자가 `.pdf`인 이름 |
| `report*` | `report`로 **시작**하는 이름 |
| `*backup*` | `backup`을 **포함**하는 이름 |
| `file?.txt` | `file` + 한 글자 + `.txt` (예: `file1.txt`) |
| `*.doc + *.pdf` | `.doc` **또는** `.pdf` |

### 정규식 검색 (설정 → **정규식 사용**)

켜면 각 검색 조각을 [.NET 정규식](https://learn.microsoft.com/dotnet/standard/base-types/regular-expressions)으로 컴파일합니다.

- **대상:** 파일·폴더 **이름**만 (경로 아님)
- **엔진:** .NET `Regex`, 타임아웃 2초
- **대소문자:** 설정의 **대소문자 구분**을 따름 (끄면 `RegexOptions.IgnoreCase`)
- **성능:** 정규식·와일드카드는 전체 인덱스를 순회합니다. 단순 문자열은 SQLite FTS로 더 빠릅니다.
- **오류:** 잘못된 정규식이면 결과가 없습니다 (오류 창 없음)

| 검색어 | 설명 |
|--------|------|
| `\.pdf$` | 이름이 `.pdf`로 **끝나는** 항목 |
| `^2024` | 이름이 `2024`로 **시작** |
| `^report.*\.pdf$` | `report`로 시작하고 `.pdf`로 끝남 |
| `\d{4}-\d{2}` | `2024-01` 형태의 숫자·하이픈 패턴 |
| `(draft\|final)` | `draft` 또는 `final` 포함 (정규식 OR — 검색 연산자 `+`와 다름) |
| `invoice_\d+` | `invoice_` 뒤에 숫자 1개 이상 |

정규식 모드에서도 **검색 연산자** `x` / `+` (공백 포함)는 그대로 동작합니다. 각 조각이 별도의 정규식입니다.

| 검색어 | 의미 |
|--------|------|
| `^report x 2024` | 이름이 `^report` 패턴 **그리고** `2024` 패턴에 모두 맞음 |
| `\.doc$ + \.pdf$` | `.doc`로 끝나거나 `.pdf`로 끝남 |

> **참고:** 정규식 모드에서 `*.pdf`의 `*`는 와일드카드가 아니라 정규식 수량자입니다. 확장자 검색은 `.*\.pdf$`를 쓰거나, 정규식을 끄고 `*.pdf` 와일드카드를 사용하세요.

### 정규식 vs 검색 연산자 vs 와일드카드

| 기호 | 정규식 끔 | 정규식 켬 |
|------|-----------|-----------|
| `*` | 0글자 이상 (`*report` → `report`로 끝) | 정규식 수량자 (앞 문자 반복) |
| `?` | 정확히 한 글자 | 0 또는 1회 |
| `+` (공백 없음) | 일반 문자 `+` | 정규식 수량자 |
| `+` (공백 있음) | **OR** 연산자 | **OR** 연산자 |
| `x` (공백 있음) | **AND** 연산자 | **AND** 연산자 |
| `\|` | 일반 문자 | 정규식 **OR** (그룹 안에서) |

### 빠른 예제 모음

```
report                          # 이름에 report 포함
budget x 2024                   # budget AND 2024
photo + image                   # photo OR image
*.pdf                           # 와일드카드: .pdf로 끝
*.doc + *.pdf                   # 와일드카드 OR
^report.*\.pdf$                 # 정규식 (설정에서 정규식 켜기)
\d{4}-\d{2}-\d{2}               # 날짜 형식 YYYY-MM-DD
\.doc$ + \.xlsx$                # 정규식 OR: Word 또는 Excel 확장자
readme x \d+\.\d+               # readme AND 버전 숫자 패턴
```

## 프로젝트 구조

```
DeskSearchWinV10/
├── DeskSearch/                       # WPF 메인 앱
│   ├── MainWindow.xaml(.cs)          # 검색 UI
│   ├── MainWindow.Settings.cs        # 설정·창 레이아웃
│   ├── MainWindow.Settings.Progress.cs # 설정 창 인덱싱 진행률
│   ├── MainWindow.Tray.cs            # 트레이·숨기기·종료
│   ├── MainWindow.Search.cs          # 라이브 검색·배치 검색
│   ├── MainWindow.Resize.cs          # 창 너비 조절
│   ├── MainWindow.Localization.cs    # UI 다국어 갱신
│   ├── SettingsWindow.xaml(.cs)      # 설정 창 (검색 제외 포함)
│   ├── SettingsColorPalette.cs       # 색상 프리셋
│   ├── MigrationProgressDialog.xaml(.cs) # 검색 인덱스 업그레이드 진행률 창
│   ├── Helpers/
│   │   ├── ColorHelper.cs            # 색상·다크 배경 감지
│   │   ├── SearchTextHelper.cs       # 검색어 NFC·정규식
│   │   ├── MultiFolderBrowserDialog.cs # 다중 선택 폴더 찾아보기 (IFileOpenDialog)
│   │   └── WindowTaskbarHelper.cs    # 작업 표시줄 제외
│   ├── Models/                       # AppSettings, FileEntry, SearchSession, IndexProgressPhase 등
│   ├── Services/
│   │   ├── SystemIndexService.cs     # 전체 드라이브 인덱싱 (배치 병합, 병렬 스캔, 그림자 DB 재검색)
│   │   ├── SystemWatcherService.cs   # 모든 드라이브 변경 감시
│   │   ├── FileSearchService.cs      # 검색·점수·배치
│   │   ├── IndexStore.cs / IndexStore.Search.cs # SQLite 저장소 (트라이그램 FTS5 인덱스)
│   │   ├── IndexExclusionPolicy.cs   # 검색 제외 경로 판별
│   │   ├── BackgroundThreadMode.cs   # Windows 백그라운드 스레드 모드 (CPU·I/O·메모리 우선순위)
│   │   ├── SettingsService.cs        # 설정 JSON 저장
│   │   ├── StartupService.cs         # 로그온 시 자동 실행 (HKCU Run 레지스트리)
│   │   ├── SingleInstanceService.cs  # 단일 인스턴스
│   │   ├── TrayIconService.cs        # NotifyIcon
│   │   ├── LocalizationService.cs    # ko / en
│   │   └── IndexResourcePolicy.cs / IndexStoragePolicy.cs # 스캔·감시·DB 정책
│   ├── Resources/                    # LocStrings.resx (다국어)
│   ├── Assets/                       # app.ico, app.png, CreateIcon.ps1
│   └── app.manifest                  # requireAdministrator, longPathAware
└── DeskSearch.Installer/             # WiX MSI 프로젝트
    ├── Package.wxs                   # 패키지·사용자 데이터 제거 CA
    ├── UserDataDlg.wxs               # 사용자 데이터 선택 대화상자
    ├── WixUI_FeatureTree_Custom.wxs  # 설치 UI 흐름
    ├── UiStrings.wxl                 # 설치 UI 문자열 (ko-kr)
    ├── UiStrings.en-us.wxl           # 설치 UI 문자열 (en-us)
    └── DeskSearch.Installer.wixproj
```

## 설정·인덱스 파일

사용자 데이터는 `%AppData%\DeskSearch\`에 저장됩니다 (Git에 포함하지 않음).

| 파일 | 용도 |
|------|------|
| `settings.json` | 창 위치·크기, 색상, 불투명도, 언어, 항상 위, 대소문자 구분, 정규식, 검색 제외, Windows 시작 시 자동 실행 등 |
| `index.db` | **검색용** live 인덱스 (SQLite, FTS5 트라이그램) |
| `index.building.db` | **재인덱싱 중**에만 사용하는 임시 빌드 DB. 완료 시 `index.db`로 교체 후 삭제 |

### 인덱싱 DB 동작

```
[첫 인덱싱]     스캔 ──► index.db ──► 검색(점진적 사용)

[재인덱싱]      스캔 ──► index.building.db
                검색 ──► index.db (변경 없음, 읽기 전용)
                완료 ──► building → index.db 교체, 기존 index.db 삭제
```

재인덱싱·주기적 전체 재동기화·누락 드라이브 보완·검색 제외 변경 후 재구축 등 **전체 스캔**은 위 이중 DB 규칙을 따릅니다. 재인덱싱 중에는 live DB에 쓰지 않으며, 파일 감시로 인한 증분 갱신도 일시 중단됩니다(완료 후 재개).
