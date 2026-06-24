# DeskSearch

Windows용 상시 표시 파일·폴더 검색 위젯 (.NET 8 / WPF)

화면 상단에 항상 떠 있는 검색창에서 PC 전체의 **파일과 폴더**를 빠르게 찾고, 탐색기에서 바로 열 수 있습니다.

## 기능

| 기능 | 설명 |
|------|------|
| 전체 시스템 인덱싱 | 고정·이동·네트워크 드라이브를 백그라운드 스캔 |
| 파일·폴더 검색 | 이름 기준 실시간 자동완성 (최대 12건) |
| 실시간 갱신 | 우선 폴더 FileSystemWatcher + 4시간 주기 재동기화 |
| 드래그 이동 | ≡ 핸들 또는 빈 검색 영역 드래그로 창 위치 변경 |
| 창 위치 저장 | `%AppData%\DeskSearch\settings.json`에 자동 저장 |
| 설정 | 배경/테두리/글자색, 불투명도, 항상 위 표시 |
| 다국어 | 한국어 / English |
| 시스템 트레이 | 닫기 시 트레이로 숨김, 트레이 메뉴에서 표시·설정·종료 |
| MSI 설치 | Release 빌드 시 WiX 기반 설치 패키지 생성 |

## 빌드 및 실행

```bash
dotnet build DeskSearchWinV10.sln
dotnet run --project DeskSearch/DeskSearch.csproj
```

**요구사항:** .NET 8 SDK, Windows 10 이상

## MSI 설치 패키지 생성

Release 구성에서만 MSI가 빌드됩니다.

```bash
dotnet build DeskSearchWinV10.sln -c Release
```

| 출력 | 설명 |
|------|------|
| `DeskSearch.Installer/bin/Release/DeskSearchSetup.msi` | 설치 패키지 |
| `DeskSearch/bin/Release/net8.0-windows/win-x64/publish/` | self-contained 배포 파일 (~60MB) |

**요구사항:** .NET 8 SDK, [WiX Toolset](https://wixtoolset.org/) MSBuild SDK (`WixToolset.Sdk` — NuGet 복원)

> Debug 구성에서는 WiX 프로젝트가 MSI 빌드를 건너뜁니다.

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
├── DeskSearch/                     # WPF 메인 앱
│   ├── MainWindow.xaml(.cs)        # 검색 UI
│   ├── MainWindow.Settings.cs      # 설정·창 위치
│   ├── MainWindow.Tray.cs          # 트레이·종료
│   ├── MainWindow.Localization.cs  # UI 다국어 갱신
│   ├── SettingsWindow.xaml(.cs)    # 설정 창
│   ├── Models/                     # AppSettings, FileEntry 등
│   ├── Services/
│   │   ├── SystemIndexService.cs   # 전체 드라이브 인덱싱
│   │   ├── SystemWatcherService.cs # 파일·폴더 변경 감시
│   │   ├── FileSearchService.cs    # 검색·점수
│   │   ├── SettingsService.cs      # 설정 JSON 저장
│   │   ├── TrayIconService.cs      # NotifyIcon
│   │   ├── LocalizationService.cs  # ko / en
│   │   └── IndexResourcePolicy.cs  # 스캔·감시 리소스 정책
│   ├── Resources/                  # LocStrings.resx (다국어)
│   └── Assets/                     # app.ico, app.png
└── DeskSearch.Installer/           # WiX MSI 프로젝트
    └── Package.wxs
```

## 설정 파일

사용자 설정은 아래 경로에 저장됩니다 (Git에 포함하지 않음).

```
%AppData%\DeskSearch\settings.json
```
