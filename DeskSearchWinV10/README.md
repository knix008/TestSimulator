# DeskSearch

Windows용 상시 표시 파일·폴더 검색 위젯 (.NET 8 / WPF)

화면 상단에 항상 떠 있는 검색창에서 PC 전체의 **파일과 폴더**를 빠르게 찾고, 탐색기에서 바로 열 수 있습니다. **작업 표시줄에는 아이콘이 없고** 시스템 트레이에만 상주합니다.

## 기능

| 기능 | 설명 |
|------|------|
| 전체 시스템 인덱싱 | 모든 준비된 드라이브·디렉터리·파일을 백그라운드 스캔 (관리자 권한, 배치 병합, 드라이브별 병렬 스캔) |
| 인덱싱 중 검색 | 인덱싱이 끝나기 전에도 검색 가능; 인덱스가 늘어나면 결과 자동 갱신; SQLite 트라이그램(trigram) FTS5 인덱스로 즉시 응답 |
| 인덱싱 중 시스템 영향 최소화 | Windows 백그라운드 모드(CPU·디스크 I/O·메모리 우선순위 하향)로 인덱싱이 GUI·시스템 반응성을 거의 침범하지 않음 |
| 이중 DB 인덱싱 | **모든 전체 인덱싱**은 `index.building.db`에 구축. 완료 시 `index.db`로 교체. `index.db`가 있으면 **항상 검색 가능** (재인덱싱 중에도 기존 DB 사용) |
| 끊김 없는 재인덱싱 | 재인덱싱 완료 시 새 DB로 교체. 재인덱싱 중 검색·GUI는 **기존 `index.db`** 로 정상 동작 |
| 인덱싱 제어 | **멈춤**: 일시 중지(building DB 보존). **인덱싱**: building 삭제 후 처음부터. **초기화**: 모든 DB 삭제 |
| 종료·재시작 | 인덱싱 중 종료 시 building DB는 디스크에 남김. **다음 실행 시 building은 삭제**되고, 중단되었으면 **자동으로 전체 재스캔** 시작 |
| 실패 루트 재시도 | 드라이브·경로 스캔·DB 병합 실패 시 해당 루트를 완료 처리하지 않음. 패스 내 최대 3회 재시도 후, 필요 시 8초 간격 전체 재시도 |
| 파일·폴더 검색 | 파일·폴더 **이름**에 검색어가 **연속으로 포함**된 항목 (경로 제외, 최대 2,000건); 결과 창은 1~10개 높이 자동 조절·스크롤; `*`(AND)·`+(OR) 연산자·와일드카드 지원; **검색 결과 정렬** 설정 가능 |
| 검색 결과 없음 | 일치 항목이 없으면 결과 창에 안내 메시지 표시 |
| 정규식 검색 | 설정에서 켜면 .NET 정규식으로 파일·폴더 이름 검색; 연산자·와일드카드와 조합 가능 (아래 [검색 문법](#검색-문법) 참고) |
| 검색 제외 | 설정에서 드라이브·디렉터리를 인덱싱·검색 대상에서 제외; 디렉터리는 찾아보기에서 여러 개 동시 선택해 바로 추가 |
| 다국어 파일명 검색 | UI는 한국어/English만 지원; 파일·폴더 이름은 모든 언어(Unicode NFC)로 검색 |
| 실시간 갱신 | 모든 드라이브 FileSystemWatcher + 설정 가능한 주기적 전체 재동기화 (기본 8시간, 사용 안 함 가능) |
| 드래그·크기 조절 | ≡ 핸들로 이동, 좌·우 가장자리로 너비 조절 |
| 창 레이아웃 저장 | 위치·너비·높이를 `%AppData%\DeskSearch\settings.json`에 자동 저장 |
| 설정 | 배경/테두리/글자색, 불투명도, 대소문자 구분, 정규식, **검색 결과 정렬**, 검색 제외, 항상 위 |
| 인덱싱 진행률 | 설정 창에서 단계(스캔·분석·인덱스 적용), 진행률(%)·항목 수 확인; **인덱싱** / **멈춤** / **초기화** / **데이터 폴더** |
| 검색 인덱스 업그레이드 | 검색 구조 개선이 필요하면 확인 대화상자 후 진행률(%) 표시 (최초 1회, 건너뛰기 가능) |
| Windows 시작 시 실행 | HKCU `Run` 레지스트리로 로그온 시 자동 시작 (레거시 예약 작업 자동 제거) |
| 단일 인스턴스 | 이미 실행 중이면 새 창 대신 기존 검색창 표시 |
| 다크 테마 | 어두운 배경 선택 시 글자·테두리·아이콘 색 자동 조정 |
| 다국어 UI | 한국어 / English; 설정에서 **언어 변경 시 즉시 반영** (취소 시 복원) |
| 시스템 트레이 | 작업 표시줄 미표시, 트레이에서 표시·숨기기·설정·종료 |
| MSI 설치 | Release 빌드 시 WiX 기반 설치 패키지 (~52MB, self-contained, per-machine·관리자 권한, 한국어·영어 UI) |

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
| `DeskSearch.Installer/bin/Release/DeskSearchSetup.msi` | 설치 패키지 (설치 UI: 한국어, ~52MB) |
| `DeskSearch.Installer/bin/Release/DeskSearchSetup.en-US.msi` | 설치 패키지 (설치 UI: English) |
| `DeskSearch/bin/Release/net8.0-windows/win-x64/publish/` | self-contained 배포 파일 (~141MB, 디버그·HTTP3 등 불필요 런타임 파일 제외 후) |

Release publish 시 `PruneUnnecessaryPublishFiles` 대상으로 디버그/덤프용 파일(`createdump`, `mscordaccore*`, `mscordbi`, `msquic` 등)을 제거합니다. WiX `Package.wxs`에서도 동일 항목을 MSI에 포함하지 않습니다.

**요구사항:** .NET 8 SDK, [WiX Toolset](https://wixtoolset.org/) MSBuild SDK (`WixToolset.Sdk` — NuGet 복원)

설치 마법사(`WixUI_FeatureTree`)에서 **바탕화면 바로가기**와 **시작 메뉴 바로가기**를 각각 선택할 수 있습니다.

**사용자 데이터 처리**

| 상황 | 동작 |
|------|------|
| 업그레이드·재설치 | 기존 프로그램 파일을 **완전히 제거**한 뒤 새로 설치. **사용자 데이터 삭제 여부**를 선택할 수 있음 |
| 제거 | 프로그램 파일 **완전 제거**. **사용자 데이터 삭제 여부**를 항상 선택할 수 있음 |

삭제 대상(선택 시): `%AppData%\DeskSearch\` (`settings.json`, `index.db` 등). 체크하지 않으면 사용자 데이터는 유지됩니다.

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

입력한 문자열 전체가 파일·폴더 **이름** 안에 **연속으로** 포함되어야 합니다 (접두어일 필요 없음).

| 검색어 | 설명 | 매칭 예 |
|--------|------|---------|
| `report` | 이름에 `report`가 **연속으로 포함** | `my-report.pdf` ✅, `repo.txt` ❌ |
| `권수호` | 이름에 `권수호`가 **연속으로 포함** | `xxx-권수호.txt` ✅ |
| `Report` | 기본은 대소문자 무시. 설정에서 **대소문자 구분**을 켜면 구분 | |

공백만 있는 검색어는 무시됩니다. 연산자 없이 입력한 문자열은 **하나의 검색어**로 처리됩니다 (`my file.txt`).

### AND / OR 연산자

연산자는 **앞뒤에 공백**이 있어야 합니다. 붙여 쓰면(`foo+bar`, `tax`) 일반 문자로 처리됩니다.

| 연산자 | 의미 | 예시 | 매칭 예 |
|--------|------|------|---------|
| `*` (앞뒤 공백) | **AND** — 모두 포함 | `report * 2024` | `report-2024.pdf`, `2024-annual-report.docx` |
| `+` | **OR** — 하나라도 포함 | `doc + pdf` | `notes.doc`, `readme.pdf` |

혼합 시 `+`로 OR 그룹을 나눈 뒤, 각 그룹 안에서 `*`(공백 포함)로 AND를 적용합니다.

| 검색어 | 의미 |
|--------|------|
| `budget * 2024 + draft` | (`budget` **그리고** `2024`) **또는** `draft` |
| `a * b + c * d` | (`a` **그리고** `b`) **또는** (`c` **그리고** `d`) |
| `doc * *.pdf` | `doc` **그리고** `.pdf` 확장자(와일드카드) |

### 와일드카드 (정규식 **끔**)

`*`·`?`는 파일 시스템식 와일드카드로 해석됩니다. `\`로 이스케이프할 수 있습니다. AND 연산자 `*`는 **앞뒤 공백**이 있을 때만 적용됩니다.

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

정규식 모드에서도 **검색 연산자** `*` / `+` (공백 포함)는 그대로 동작합니다. 각 조각이 별도의 정규식입니다.

| 검색어 | 의미 |
|--------|------|
| `^report * 2024` | 이름이 `^report` 패턴 **그리고** `2024` 패턴에 모두 맞음 |
| `\.doc$ + \.pdf$` | `.doc`로 끝나거나 `.pdf`로 끝남 |

> **참고:** 정규식 모드에서 `*.pdf`의 `*`는 와일드카드가 아니라 정규식 수량자입니다. 확장자 검색은 `.*\.pdf$`를 쓰거나, 정규식을 끄고 `*.pdf` 와일드카드를 사용하세요.

### 정규식 vs 검색 연산자 vs 와일드카드

| 기호 | 정규식 끔 | 정규식 켬 |
|------|-----------|-----------|
| `*` | 0글자 이상 (`*report` → `report`로 끝) | 정규식 수량자 (앞 문자 반복) |
| `?` | 정확히 한 글자 | 0 또는 1회 |
| `+` (공백 없음) | 일반 문자 `+` | 정규식 수량자 |
| `+` (공백 있음) | **OR** 연산자 | **OR** 연산자 |
| `*` (공백 있음) | **AND** 연산자 | **AND** 연산자 |
| `\|` | 일반 문자 | 정규식 **OR** (그룹 안에서) |

### 빠른 예제 모음

```
report                          # 이름에 report 포함
budget * 2024                   # budget AND 2024
photo + image                   # photo OR image
*.pdf                           # 와일드카드: .pdf로 끝
*.doc + *.pdf                   # 와일드카드 OR
^report.*\.pdf$                 # 정규식 (설정에서 정규식 켜기)
\d{4}-\d{2}-\d{2}               # 날짜 형식 YYYY-MM-DD
\.doc$ + \.xlsx$                # 정규식 OR: Word 또는 Excel 확장자
readme * \d+\.\d+               # readme AND 버전 숫자 패턴
```

### 검색 결과 정렬

설정 → **검색 결과 정렬**에서 결과 목록의 표시 순서를 선택합니다. 저장 후 같은 검색어로 결과가 다시 정렬됩니다.

| 옵션 | 설명 |
|------|------|
| **일치도** (기본) | 완전 일치 → 접두어 일치 → 포함 순, 같으면 이름순 |
| **이름 (가→하 / 하→가)** | 파일·폴더 이름 기준 오름차순·내림차순 |
| **경로 (가→하 / 하→가)** | 전체 경로 기준 오름차순·내림차순 |
| **폴더 먼저** | 폴더를 위에, 그다음 이름순 |
| **파일 먼저** | 파일을 위에, 그다음 이름순 |

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
│   ├── MigrationConfirmDialog.xaml(.cs) # 검색 인덱스 업그레이드 확인
│   ├── MigrationProgressDialog.xaml(.cs) # 검색 인덱스 업그레이드 진행률
│   ├── ErrorDialog.xaml(.cs)             # 오류 상세 대화상자
│   ├── Helpers/
│   │   ├── ColorHelper.cs            # 색상·다크 배경 감지
│   │   ├── SearchTextHelper.cs       # 검색어 NFC·연산자·와일드카드·정규식
│   │   ├── MenuGlyphIcons.cs         # 컨텍스트·트레이 메뉴 MDL2 아이콘
│   │   ├── MultiFolderBrowserDialog.cs # 다중 선택 폴더 찾아보기 (IFileOpenDialog)
│   │   └── WindowTaskbarHelper.cs    # 작업 표시줄 제외
│   ├── Models/                       # AppSettings, FileEntry, SearchSession, SearchResultSortOrder, IndexProgressPhase 등
│   ├── Services/
│   │   ├── SystemIndexService.cs     # 전체 드라이브 인덱싱 (배치 병합, 병렬 스캔, 이중 DB 재인덱싱)
│   │   ├── SystemWatcherService.cs   # 모든 드라이브 변경 감시
│   │   ├── FileSearchService.cs      # 검색·점수·배치·결과 정렬
│   │   ├── SearchResultSortPolicy.cs # 검색 결과 정렬 (SQL·메모리)
│   │   ├── IndexStore.cs / IndexStore.Search.cs # SQLite 저장소 (트라이그램 FTS5 인덱스)
│   │   ├── IndexExclusionPolicy.cs   # 검색 제외 경로 판별
│   │   ├── BackgroundThreadMode.cs   # Windows 백그라운드 스레드 모드 (CPU·I/O·메모리 우선순위)
│   │   ├── AppStoragePaths.cs        # %AppData%\DeskSearch 경로
│   │   ├── SettingsService.cs        # settings.json 저장
│   │   ├── StartupService.cs         # 로그온 시 자동 실행 (HKCU Run)
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
| `settings.json` | 창 위치·크기, 색상, 불투명도, 언어, 항상 위, 대소문자 구분, 정규식, **검색 결과 정렬**, 검색 제외, Windows 시작 시 자동 실행 등 |
| `index.db` | **완료된 검색용** 인덱스 (SQLite, FTS5 트라이그램). 전체 인덱싱 성공 후에만 생성·교체됨 |
| `index.building.db` | **인덱싱 중** 임시 빌드 DB. 완료 시 `index.db`로 교체 후 삭제 |

### 인덱싱 DB 동작

```
[첫 실행·초기화 후]  기존 DB 삭제 → 스캔 ──► index.building.db ──► 검색(구축 중 DB 또는 index.db)
                완료 ──► building → index.db 교체

[재인덱싱]      스캔 ──► index.building.db
                검색 ──► index.db (기존 완료 DB, 변경 없음)
                완료 ──► building → index.db 교체

[멈춤]          스캔 중단, index.building.db 보존 (같은 세션)

[인덱싱 버튼]   building 삭제 → 처음부터 전체 스캔

[종료(인덱싱 중)] building 유지 → 다음 실행 시 building 삭제 후 자동 전체 재스캔
                (index.db가 있으면 그동안 검색 계속 가능)
```

재인덱싱·주기적 전체 재동기화·누락 드라이브 보완·검색 제외 변경 후 재구축·**초기화** 후 **인덱싱** 등 **전체 스캔**은 위 규칙을 따릅니다. **초기화**는 `index.db`·`index.building.db`를 모두 삭제합니다. 스캔 중 일부 드라이브·경로가 실패하면 해당 루트만 미완료로 남기고 패스 내 최대 3회 재시도합니다. 인덱싱 중에는 파일 감시 증분 갱신이 일시 중단됩니다(완료 후 재개).
