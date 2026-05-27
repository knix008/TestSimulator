# TerminalWinV10

C# WinForms 기반의 시리얼/TCP 터미널 프로그램입니다.

## 주요 기능

- **시리얼(Serial) 연결**: COM 포트 및 baudrate 선택
- **TCP/IP 연결**: IP 주소와 포트 입력, SSL/TLS 옵션 지원
- **Local 연결**: Windows 기본 CLI(COMSPEC/cmd.exe) 또는 사용자 지정 실행 파일
- **탭 터미널**: 탭마다 **닫기**, 마지막 **터미널 추가 +** 탭으로 새 세션 추가
- **Local (ConPTY)**: Windows 콘솔과 동일한 프롬프트·입력 처리 (Win10 1809+)
- **연결 프로필 관리**: 자주 사용하는 연결 설정을 저장/불러오기/삭제
- **실시간 수신**: 수신 데이터를 터미널 화면에 실시간 출력

## 요구 사항

- Windows 10/11
- [.NET 8 Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 이상 (개발 시)

## 빌드 및 실행

```bash
dotnet build
dotnet run --project TerminalWinV10
```

## MSI 설치 패키지 (Release)

Visual Studio 2026에서 **Release** 구성으로 빌드하면 WiX 기반 MSI가 자동 생성됩니다.

**사전 요구 사항**

- [WiX Toolset](https://wixtoolset.org/) (Visual Studio용 HeatWave / WiX 확장 권장)

**Visual Studio**

1. `TerminalWinV10.sln`을 엽니다.
2. 구성: **Release**, 플랫폼: **Any CPU** (또는 **x64**로 Installer만 빌드).
3. 솔루션 또는 `TerminalWinV10` 프로젝트를 빌드합니다.
4. MSI 출력 경로: `bin\Release\installer\TerminalWinV10_Setup.msi`

설치 마법사의 **기능 선택** 화면에서 **바탕화면 바로가기**와 **시작 메뉴 바로가기**를 각각 켜거나 끌 수 있습니다. Windows 설정의 앱 목록에는 `daemon_hammer.ico` 아이콘이 표시됩니다.

**명령줄**

```bash
dotnet build -c Release TerminalWinV10/TerminalWinV10.csproj
```

Installer 프로젝트만 따로 빌드할 때:

```bash
dotnet build -c Release installer/TerminalWinV10.Installer.wixproj
```

## 사용법

1. **터미널 추가 +** 탭을 클릭해 새 터미널을 추가합니다. 각 탭의 **닫기**로 탭을 닫습니다.
2. 연결 방식(**Local** / **Serial** / **TCP/IP**)을 선택합니다. 기본값은 **Local**입니다.
3. **Local**: CLI 경로를 비우면 `COMSPEC`(보통 `cmd.exe`)이 실행됩니다. PowerShell 등은 전체 경로를 입력합니다.
4. **Serial**: COM 포트와 baudrate를 선택합니다.
5. **TCP/IP**: IP 주소(로컬 기본 `127.0.0.1`), 포트(예: `8443`), SSL/TLS 필요 시 체크합니다.
6. **Connect**로 연결, **Disconnect**로 해제합니다. 연결 후 터미널 창에서 키 입력·Enter·붙여넣기(Ctrl+V)가 가능합니다.
7. **Save**로 프로필 저장, 드롭다운에서 불러올 수 있습니다.

## 프로젝트 구조

```
TerminalWinV10/
├── MainForm.cs                  # 탭·툴바·프로필 UI
├── TerminalPanel.cs             # 탭별 터미널 화면·키 입력
├── TerminalSession.cs           # Serial / TCP / Local 세션
├── TerminalConnectionSettings.cs
├── LocalShellResolver.cs        # COMSPEC/cmd.exe 해석
├── ProfileManager.cs            # profiles.json
└── Program.cs
```

프로필은 실행 파일과 같은 경로의 `profiles.json`에 저장됩니다.
