# ScreenCamWin V10

Windows Forms 기반 **화면 녹화** 데스크톱 앱입니다. 전체 화면(데스크톱) 또는 지정한 창을 캡처해 AVI/MP4로 저장합니다.

## 요구 사항

- Windows 10/11 (x64)
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (또는 SDK로 빌드)
- Visual Studio 2022 이상 / Visual Studio 2026 (`ScreenCamWin.sln`)
- MSI 빌드: WiX는 NuGet [`WixToolset.Sdk`](https://wixtoolset.org/) 로 복원됩니다 (별도 WiX 확장 설치 불필요)

## 주요 기능

| 기능 | 설명 |
|------|------|
| 녹화 대상 | **전체 화면(Desktop)** 또는 실행 중인 **특정 창** |
| 코덱 | MJPEG (AVI), **H.264** (Windows Media Foundation, MP4), 무압축 RGB (AVI) |
| 설정 | FPS, 품질, 저장 경로, 마우스 커서 포함 여부 |
| 미리보기 | 녹화 전 대상 화면 미리보기 |
| 전체 화면 녹화 | 녹화 시작 시 **메인 창 자동 숨김** → 작업 표시줄 **트레이 아이콘**에서 중지 |
| 설치 패키지 | Release 빌드 시 **MSI** 생성, 설치 시 바탕화면/시작 메뉴 바로가기 **선택 가능** |

## 빌드 및 실행

### Visual Studio

1. `ScreenCamWin.sln` 열기
2. 구성 **Release** (또는 Debug)
3. 시작 프로젝트 **ScreenCamWin** → `F5` 실행

### CLI

```powershell
dotnet restore
dotnet build ScreenCamWin.csproj -c Release
dotnet run --project ScreenCamWin.csproj -c Release
```

실행 파일: `bin\Release\net8.0-windows\ScreenCamWin.exe`

## MSI 설치 패키지

Release로 **솔루션** 또는 **ScreenCamWin** 프로젝트를 빌드하면 MSI가 함께 생성됩니다 (`GenerateMsiOnBuild`).

```powershell
dotnet build ScreenCamWin.sln -c Release
```

**출력 위치**

```
ScreenCamWinV10.Installer\bin\x64\Release\ScreenCamWinV10Setup.msi
```

설치 마법사 **「사용자 지정」** 단계에서 다음을 각각 선택할 수 있습니다.

- 바탕화면 바로가기
- 시작 메뉴 바로가기

바로가기 아이콘은 `daemon_hammer.ico` 를 사용합니다. 기본 설치 경로: `Program Files\ScreenCamWin V10\`

> H.264 녹화는 출력 파일 확장자가 **`.mp4`** 여야 합니다.

## 전체 화면 녹화 시 중지 방법

메인 창이 숨겨진 상태에서는 작업 표시줄 **알림 영역(트레이)** 의 ScreenCamWin 아이콘을 사용합니다.

- **더블 클릭** → 녹화 중지
- **우클릭** → **「녹화 중지」**

녹화가 끝나면 메인 창이 다시 표시됩니다.

## 프로젝트 구조

```
ScreenCamWinV10/
├── ScreenCamWin.sln
├── ScreenCamWin.csproj          # 메인 앱 (.NET 8 WinForms, x64)
├── Program.cs / MainForm.*      # UI
├── Core/                        # 캡처, 녹화, AVI, H.264(MF), 코덱
├── Models/                      # 설정·창 목록
├── Native/                      # Win32 P/Invoke
├── UI/                          # 테마, 오류 대화상자
├── ScreenCamWinV10.Installer/   # WiX MSI (Package.wxs)
└── daemon_hammer.ico            # 앱·설치·바로가기 아이콘
```

## 기술 스택

- .NET 8 (`net8.0-windows`), Windows Forms, **x64**
- [Vortice.MediaFoundation](https://www.nuget.org/packages/Vortice.MediaFoundation) — H.264 MP4 인코딩
- GDI+ 화면 캡처, AVI 컨테이너(MJPEG / 무압축)
- WiX Toolset 5 — `ScreenCamWinV10Setup.msi`

## 라이선스

저장소에 별도 LICENSE 파일이 없으면 프로젝트 소유자에게 문의하세요. 서드파티(Vortice, WiX 등)는 각 패키지 라이선스를 따릅니다.
