# DeskSearch

Windows용 상시 표시 파일·폴더 검색 위젯 (.NET 8 / WPF)

화면 상단에 항상 떠 있는 검색창에서 PC 전체의 **파일과 폴더**를 빠르게 찾고, 탐색기에서 바로 열 수 있습니다. **작업 표시줄에는 아이콘이 없고** 시스템 트레이에만 상주합니다.

## 기능

| 기능 | 설명 |
|------|------|
| 전체 시스템 인덱싱 | 모든 준비된 드라이브·디렉터리·파일을 백그라운드 스캔 (관리자 권한, 배치 병합, 드라이브별 병렬 스캔) |
| 인덱싱 중 검색 | 인덱싱이 끝나기 전에도 검색 가능; 인덱스가 늘어나면 결과 자동 갱신; SQLite 트라이그램(trigram) FTS5 인덱스로 즉시 응답 |
| 인덱싱 중 시스템 영향 최소화 | Windows 백그라운드 모드(CPU·디스크 I/O·메모리 우선순위 하향)로 인덱싱이 GUI·시스템 반응성을 거의 침범하지 않음 |
| 끊김 없는 재검색 | 기존 색인이 있는 상태의 재검색(전체 재구축)은 별도의 임시 DB에서 진행되어, 완료 전까지 기존 검색 결과를 그대로 사용 가능 (그림자 DB 방식) |
| 인덱싱 중단 후 자동 재개 | 재검색이 끝나기 전에 프로그램이 종료되면, 다음 실행 시 자동으로 재검색을 다시 시도 |
| 파일·폴더 검색 | 파일·폴더 **이름** 기준 실시간 자동완성 (경로는 검색 대상 아님, 최대 12건, 배치 검색) |
| 정규식 검색 | 설정에서 켜면 .NET 정규식으로 파일·폴더 이름 검색 |
| 검색 제외 | 설정에서 드라이브·디렉터리를 인덱싱·검색 대상에서 제외; 디렉터리는 찾아보기에서 여러 개 동시 선택해 바로 추가 |
| 다국어 파일명 검색 | UI는 한국어/English만 지원; 파일·폴더 이름은 모든 언어(Unicode NFC)로 검색 |
| 실시간 갱신 | 모든 드라이브 FileSystemWatcher + 4시간 주기 전체 재동기화 |
| 드래그·크기 조절 | ≡ 핸들로 이동, 좌·우 가장자리로 너비 조절 |
| 창 레이아웃 저장 | 위치·너비·높이를 `%AppData%\DeskSearch\settings.json`에 자동 저장 |
| 설정 | 배경/테두리/글자색, 불투명도, 대소문자 구분, 정규식, 검색 제외, 항상 위 |
| 인덱싱 진행률 | 설정 창에서 진행률(%)·항목 수 확인 및 **재검색** |
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
│   ├── Models/                       # AppSettings, FileEntry, SearchSession 등
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

## 설정 파일

사용자 설정은 아래 경로에 저장됩니다 (Git에 포함하지 않음).

```
%AppData%\DeskSearch\settings.json
```

저장 항목: 창 위치·크기, 색상, 불투명도, 언어, 항상 위, 대소문자 구분, 정규식 사용, 검색 제외 드라이브·디렉터리, Windows 시작 시 자동 실행 등
