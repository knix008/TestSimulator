# ScreenCamWin V10

Windows Forms 기반 **화면 녹화** 데스크톱 앱입니다. 전체 화면(데스크톱) 또는 지정한 창을 캡처해 AVI/MP4로 저장합니다. 마이크를 켜면 오디오와 영상이 단일 파일에 동시 기록됩니다.

## 요구 사항

- Windows 10/11 (x64)
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (또는 SDK로 빌드)
- Visual Studio 2022 이상 (`ScreenCamWin.sln`)
- MSI 빌드: WiX는 NuGet [`WixToolset.Sdk`](https://wixtoolset.org/) 로 복원됩니다 (별도 WiX 확장 설치 불필요)

## 주요 기능

| 기능 | 설명 |
|------|------|
| 녹화 대상 | **전체 화면(Desktop)** 또는 실행 중인 **특정 창** |
| 코덱 | MJPEG (AVI), **H.264** (Windows Media Foundation, MP4), 무압축 RGB (AVI) |
| 마이크 녹음 | WASAPI 캡처 → 영상과 **동시 기록** (단일 파일 출력, 별도 합치기 없음) |
| 설정 | FPS, 품질, 저장 경로, 마우스 커서 포함 여부, 마이크 게인 |
| 미리보기 | 녹화 전 대상 화면 실시간 미리보기 |
| 전체 화면 녹화 | 녹화 시작 시 **메인 창 자동 숨김** → 작업 표시줄 **트레이 아이콘**에서 중지 |
| 설치 패키지 | Release 빌드 시 **MSI** 생성, 설치 시 바탕화면/시작 메뉴 바로가기 **선택 가능** |

## 오디오 녹음 동작 방식

마이크가 켜진 상태에서 녹화를 시작하면 각 비디오 프레임마다 대응하는 PCM 샘플을 즉시 인터리브해 단일 파일로 저장합니다.

- **AVI (MJPEG / 무압축)**: 오디오 스트림이 비디오 프레임 사이에 인터리브됩니다.
- **MP4 (H.264)**: Windows Media Foundation `IMFSinkWriter`에 H.264 + AAC 스트림을 동시 기록합니다.
- WASAPI가 준비되기 전의 초반 프레임은 자동으로 무음(silence)으로 채워집니다.

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

Release로 솔루션을 빌드하면 MSI가 함께 생성됩니다 (`GenerateMsiOnBuild`).

```powershell
dotnet build ScreenCamWin.sln -c Release
```

**출력 위치**

```
ScreenCamWinV10.Installer\bin\x64\Release\ScreenCamWinV10Setup.msi
```

설치 마법사 **「사용자 지정」** 단계에서 바탕화면 / 시작 메뉴 바로가기를 각각 선택할 수 있습니다.

기본 설치 경로: `Program Files\ScreenCamWin V10\`

## 전체 화면 녹화 시 중지 방법

메인 창이 숨겨진 상태에서는 작업 표시줄 **알림 영역(트레이)** 의 ScreenCamWin 아이콘을 사용합니다.

- **더블 클릭** → 녹화 중지
- **우클릭** → **「녹화 중지」**

녹화가 끝나면 메인 창이 다시 표시됩니다.

## 프로젝트 구조

```
ScreenCamWinV10/
├── ScreenCamWin.sln
├── ScreenCamWin.csproj              # 메인 앱 (.NET 8 WinForms, x64)
├── Program.cs / MainForm.*          # UI
├── Core/
│   ├── ScreenRecorder.cs            # 녹화 루프 (오디오+영상 동시 기록)
│   ├── MicrophoneCapture.cs         # WASAPI 마이크 캡처
│   ├── AviContainer.cs              # AVI RIFF 파일 직접 쓰기
│   ├── MfH264Writer.cs              # H.264 + AAC MP4 (Media Foundation)
│   ├── ScreenCapture.cs             # GDI+ 화면 캡처
│   ├── CodecManager.cs
│   └── RecordingPathHelper.cs
├── Models/                          # 설정·창 목록·결과
├── Native/                          # Win32 P/Invoke
├── UI/                              # 테마, VU 미터, 오류 대화상자
├── ScreenCamWinV10.Installer/       # WiX MSI (Package.wxs)
└── daemon_hammer.ico                # 앱·설치·바로가기 아이콘
```

## 기술 스택

- .NET 8 (`net8.0-windows`), Windows Forms, **x64**
- [NAudio](https://www.nuget.org/packages/NAudio) — WASAPI 마이크 캡처 및 PCM 변환
- [Vortice.MediaFoundation](https://www.nuget.org/packages/Vortice.MediaFoundation) — H.264 + AAC MP4 인코딩
- GDI+ 화면 캡처, AVI 컨테이너 직접 구현 (MJPEG / 무압축)
- WiX Toolset 5 — `ScreenCamWinV10Setup.msi`

## 라이선스

저장소에 별도 LICENSE 파일이 없으면 프로젝트 소유자에게 문의하세요. 서드파티(NAudio, Vortice, WiX 등)는 각 패키지 라이선스를 따릅니다.
