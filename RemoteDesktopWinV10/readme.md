# RemoteDesktopWinV10

Windows용 **RDP**와 **VNC**를 한 앱에서 연결하는 .NET 8 WinForms 클라이언트입니다.

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
| **RDP** | Windows `mstscax`에서 생성한 COM interop(`RdpInterop\*.dll`)과 `AxMsRdpClient10NotSafeForScripting` 사용 |
| **VNC** | [Lemutec.RemoteViewing.Windows.Forms](https://www.nuget.org/packages/Lemutec.RemoteViewing.Windows.Forms) |
| **프로필** | `%LocalAppData%\RemoteDesktopWinV10\profiles.json` — 선택 시 암호는 DPAPI(CurrentUser)로 저장 가능 |
| **최근 연결** | `%LocalAppData%\RemoteDesktopWinV10\history.json` |
| **메뉴·UI 표시** | `%LocalAppData%\RemoteDesktopWinV10\ui.json` — 아래 [UI 설정](#ui-설정) 참고 |
| **메뉴 구조** | **파일** / **프로필**(관리) / **보기** / **설정**(메뉴 표시 옵션); 상단 **도구 모음**에서 프로필 관리·앱 설정 바로가기 |
| **전체 화면** | F11 또는 메뉴 **보기 → 전체 화면**(메뉴를 숨겨도 F11은 동작) |
| **RDP 옵션** | CredSSP, NLA, 인증서 완화(위험), 클립보드/드라이브/프린터 리다이렉션 |

## UI 설정

**설정 → 메뉴 및 데이터 폴더 표시…**에서 다음을 켜거나 끌 수 있습니다.

- **보기** 메뉴(전체 화면 항목) 표시 여부
- **파일** 메뉴의 **데이터 폴더 열기** 항목 표시 여부

**프로필**은 **프로필 관리** 창에서 추가·편집·삭제합니다. **파일**의 **종료**는 항상 표시됩니다.

설정은 `ui.json`에 camelCase 속성으로 저장됩니다.

| 속성 | 기본값 | 의미 |
|------|--------|------|
| `showViewMenu` | `true` | **보기** 메뉴 표시 |
| `showOpenDataFolderMenuItem` | `false` | **파일 → 데이터 폴더 열기** 표시 |

예시:

```json
{
  "showViewMenu": true,
  "showOpenDataFolderMenuItem": false
}
```

직접 편집한 뒤에는 앱을 다시 시작하거나, 설정 창에서 **확인**을 눌러 메뉴를 다시 적용하세요.

## WinForms 디자이너

메인 폼과 설정 폼은 코드와 디자이너 파일이 분리되어 있습니다.

- `MainForm.cs` / `MainForm.Designer.cs`
- `AppSettingsForm.cs` / `AppSettingsForm.Designer.cs`
- `ProfileManagerForm.cs` / `ProfileManagerForm.Designer.cs`
- `ProfileEditForm.cs` / `ProfileEditForm.Designer.cs`

Visual Studio에서 해당 `.cs` 파일을 연 뒤 디자인 보기로 레이아웃·컨트롤을 편집할 수 있습니다.

## 상대 측 준비

- **RDP로 Linux**: `xrdp` 등 RDP 서버 필요  
- **VNC**: TigerVNC 등 VNC 서버 및 포트·암호 설정

## RDP interop DLL 재생성

`RdpInterop`의 `AxMSTSCLib.dll`, `MSTSCLib.dll`은 Windows SDK의 **aximp**로 `mstscax.dll`에서 생성한 것입니다. OS 업그레이드 후 문제가 있으면 빈 폴더에서 다음을 실행한 뒤 생성물을 `RdpInterop`에 덮어쓰면 됩니다.

```powershell
& "${env:ProgramFiles(x86)}\Microsoft SDKs\Windows\v10.0A\bin\NETFX 4.8 Tools\aximp.exe" "$env:WINDIR\System32\mstscax.dll"
```

## 라이선스·주의

- **인증서 완화** 옵션은 보안이 약해질 수 있으므로 신뢰할 수 있는 네트워크에서만 사용하세요.
- RDP ActiveX·interop은 Microsoft Windows 구성 요소에 따릅니다.
- VNC 라이브러리는 NuGet 패키지 라이선스(BSD 2-Clause 등)를 따릅니다.

## 솔루션 구조

```
RemoteDesktopWinV10.sln
RemoteDesktopWinV10.App/
  Program.cs
  MainForm.cs
  MainForm.Designer.cs
  AppSettingsForm.cs
  AppSettingsForm.Designer.cs
  ProfileManagerForm.cs
  ProfileManagerForm.Designer.cs
  ProfileEditForm.cs
  ProfileEditForm.Designer.cs
  UiSettings.cs
  UiSettingsStore.cs
  ConnectionProfile*.cs
  ConnectionHistory*.cs
  RdpInterop/          # aximp로 생성한 RDP interop DLL
```
