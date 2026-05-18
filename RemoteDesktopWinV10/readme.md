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

## 기능 요약

| 구분 | 설명 |
|------|------|
| **VNC** | [Lemutec.RemoteViewing.Windows.Forms](https://www.nuget.org/packages/Lemutec.RemoteViewing.Windows.Forms) |
| **프로필** | `%LocalAppData%\RemoteDesktopWinV10\profiles.json` — 선택 시 암호는 DPAPI(CurrentUser)로 저장 가능 |
| **최근 연결** | `%LocalAppData%\RemoteDesktopWinV10\history.json` |
| **메뉴·UI 표시** | `%LocalAppData%\RemoteDesktopWinV10\ui.json` — 아래 [UI 설정](#ui-설정) 참고 |
| **전체 화면** | F11 또는 메뉴 **보기 → 전체 화면** |
| **VNC 옵션** | 뷰 온리, 클립보드, 화면 맞춤, FPS, TLS·인증서 무시 등 |

## UI 설정

**설정 → 메뉴 및 데이터 폴더 표시…**에서 다음을 켜거나 끌 수 있습니다.

- **보기** 메뉴(전체 화면 항목) 표시 여부
- **파일** 메뉴의 **데이터 폴더 열기** 항목 표시 여부

## WinForms 디자이너

- `MainForm.cs` / `MainForm.Designer.cs`
- `ConnectionDialog.cs` / `ConnectionDialog.Designer.cs`
- `ProfileEditForm.cs` / `ProfileEditForm.Designer.cs`
- `ProfileManagerForm.cs` / `ProfileManagerForm.Designer.cs`

## 상대 측 준비

- **VNC**: TigerVNC, TightVNC, UltraVNC 등 VNC 서버 및 포트·암호 설정
- 같은 PC에서 접속 시 서버의 **loopback(루프백) 연결 허용** 옵션 확인

## 라이선스·주의

- VNC 라이브러리는 NuGet 패키지 라이선스(BSD 2-Clause 등)를 따릅니다.
- TLS **인증서 오류 무시** 옵션은 신뢰할 수 있는 네트워크에서만 사용하세요.

## 솔루션 구조

```
RemoteDesktopWinV10.sln
RemoteDesktopWinV10.App/
  Program.cs
  MainForm.cs
  ConnectionDialog.cs
  VncConnectionDefaults.cs
  VncFailureReasonUserHints.cs
  ConnectionProfile*.cs
  ConnectionHistory*.cs
RemoteDesktopWinV10.Installer/   # WiX MSI (선택)
```
