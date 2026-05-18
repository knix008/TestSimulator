# RemoteDesktopWinV10

Windows용 **VNC** 원격 데스크톱 .NET 8 WinForms 클라이언트입니다.

## 요구 사항

- Windows 10 이상
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

## 빌드 및 실행

```powershell
cd RemoteDesktopWinV10
dotnet restore
dotnet build RemoteDesktopWinV10.sln -c Release
dotnet run --project RemoteDesktopWinV10.App
```

Visual Studio에서는 `RemoteDesktopWinV10.sln`을 열고 시작(F5)하면 됩니다.

## MSI 설치 파일 빌드

프로젝트는 WiX Toolset v5를 사용하여 MSI 설치 파일을 생성할 수 있습니다.

```powershell
# Release|x64 플랫폼 선택 시 MSI 자동 생성
dotnet build RemoteDesktopWinV10.sln -c Release -p:Platform=x64
```

MSI 파일은 `RemoteDesktopWinV10.Installer\bin\Release\x64\RemoteDesktopWinV10Setup.msi`에 생성됩니다.

## 기능 요약

| 구분 | 설명 |
|------|------|
| **VNC** | [Lemutec.RemoteViewing.Windows.Forms](https://www.nuget.org/packages/Lemutec.RemoteViewing.Windows.Forms) |
| **프로필** | `%LocalAppData%\RemoteDesktopWinV10\profiles.json` — 암호는 DPAPI(CurrentUser)로 저장 |
| **최근 연결** | `%LocalAppData%\RemoteDesktopWinV10\history.json` |
| **메뉴·UI 표시** | `%LocalAppData%\RemoteDesktopWinV10\ui.json` |
| **전체 화면** | F11 또는 메뉴 **보기 → 전체 화면** |
| **VNC 옵션** | 뷰 온리, 클립보드, 화면 맞춤, FPS, TLS·인증서 무시 |
| **녹화** | VNC 세션을 H.264 MP4로 실시간 저장 — 툴바 **녹화** 버튼 또는 **보기 → 녹화** |

## 녹화

연결된 상태에서 툴바의 **녹화** 버튼을 누르면 세션이 MP4 파일로 저장됩니다.

- **저장 위치**: `%USERPROFILE%\Videos\RemoteDesktopWinV10\VNC_<호스트>_<날짜시각>.mp4`
- **코덱**: H.264 (Windows 내장 Media Foundation 인코더)
- **중지**: **멈춤** 버튼을 누르면 진행 다이얼로그가 표시되고, 마무리가 끝나면 자동으로 닫힙니다
- **자동 중지**: VNC 연결이 끊기거나 앱을 종료하면 녹화가 자동 중지됩니다

> **요구 사항**: Windows 10 이상(H.264 MF 인코더 기본 내장).

## UI 설정

**설정 → 메뉴 및 데이터 폴더 표시…**에서 다음을 켜거나 끌 수 있습니다.

- **보기** 메뉴(전체 화면 항목) 표시 여부
- **파일** 메뉴의 **데이터 폴더 열기** 항목 표시 여부

## 상대 측 준비

- **VNC**: TigerVNC, TightVNC, UltraVNC 등 VNC 서버 및 포트·암호 설정
- 같은 PC에서 접속 시 서버의 **루프백(loopback) 연결 허용** 옵션 확인
  - 허용 설정이 어려우면 LAN IP로 연결하면 우회 가능

## 라이선스·주의

- VNC 라이브러리는 NuGet 패키지 라이선스(BSD 2-Clause 등)를 따릅니다.
- TLS **인증서 오류 무시** 옵션은 신뢰할 수 있는 네트워크에서만 사용하세요.

## 솔루션 구조

```
RemoteDesktopWinV10.sln
RemoteDesktopWinV10.App/
  Program.cs                            # 진입점
  MainForm.cs / .Designer.cs            # 메인 창
  AppSettingsForm.cs / .Designer.cs     # 앱 설정 창
  ConnectionDialog.cs / .Designer.cs    # 연결 대화상자
  SaveProfileDialog.cs                  # 프로필 저장 대화상자
  ErrorDialog.cs                        # 오류 대화상자
  ProfileManagerForm.cs / .Designer.cs  # 프로필 관리 창
  ProfileEditForm.cs / .Designer.cs     # 프로필 편집 창
  ConnectionProfile.cs                  # 프로필 모델
  ConnectionProfileStore.cs             # 프로필 저장소 (DPAPI 암호화 포함)
  ConnectionHistoryEntry.cs             # 최근 연결 항목 모델
  ConnectionHistoryStore.cs             # 최근 연결 저장소
  VncConnectionDefaults.cs              # VNC 설정 기본값 및 적용 헬퍼
  VncFailureReasonUserHints.cs          # VNC 실패 원인 사용자 힌트
  VncAdvancedSettingsDialog.cs / .Designer.cs  # VNC 고급 설정 창
  VncLoopbackHelper.cs                  # 루프백 접속 감지 및 LAN IP 우회
  ExceptionMessageFormatter.cs          # 예외 메시지 포맷터
  UiSettings.cs                         # UI 설정 모델
  UiSettingsStore.cs                    # UI 설정 저장소
  UiTheme.cs                            # UI 테마 정의
  Recording/
    VncSessionRecorder.cs               # 녹화 세션 관리 (캡처 루프, 시작·중지)
    VncFramebufferCapture.cs            # VNC 프레임버퍼 → RGB32 변환
    H264Mp4Recorder.cs                  # MF SinkWriter 기반 H.264 MP4 인코더
    MediaFoundationRuntime.cs           # MF 초기화·해제 관리
    MediaFoundationGuids.cs             # MF 미디어 형식 GUID 상수
    RecordingFinalizeDialog.cs          # 저장 완료 대기 진행 다이얼로그
  RdpInterop/                           # aximp로 생성한 RDP interop DLL (참조용)
    AxMSTSCLib.dll
    MSTSCLib.dll
RemoteDesktopWinV10.Installer/
  RemoteDesktopWinV10.Installer.wixproj
  Product.wxs                           # WiX 설치 정의 파일
daemon_hammer.ico                       # 애플리케이션 및 바로가기 아이콘
```
