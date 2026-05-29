# FTPServerWinV10

Windows용 **FTP / FTPS / SFTP** 서버 관리 프로그램 (C# WinForms, .NET 8)

자세한 사용 방법은 **[UserGuide.md](UserGuide.md)** 를 참고하세요.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 다중 공유 폴더 | 여러 물리 폴더를 가상 경로(`/이름`)로 매핑 |
| FTP | 평문 FTP (기본 포트 **21**) |
| FTPS | Implicit SSL/TLS (기본 포트 **990**, PFX 필요) |
| SFTP | SSH SFTP v3 (기본 포트 **22**, FxSsh `dev` 브랜치) |
| 동시 프로토콜 | UI에서 FTP / FTPS / SFTP를 각각 켜고 **동시 실행** 가능 |
| 자체 서명 인증서 | 앱 내 PFX 생성 (RSA 2048, SHA-256) |
| 인증 | 익명 허용 또는 사용자 ID/비밀번호 |
| 프로파일 | 설정을 이름으로 저장·불러오기·삭제 |
| 자동 저장 | 종료 시 `server_settings.json` 저장, 재시작 시 복원 |
| 오류 안내 | 설정·실행 오류 시 **상세 팝업** (전체 복사, 예외 스택 포함) |
| 통계·로그 | 업/다운로드 통계, 화면 로그 + `ftpserver.log` |

## 요구 사항

| 구분 | 내용 |
|------|------|
| OS | Windows 10/11 (x64) |
| 런타임 | [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) |
| 개발 | .NET 8 SDK, Visual Studio 2022 / 2026 |
| SFTP 빌드 | FxSsh `dev` 소스 — 최초 1회 `setup-fxssh.ps1` 실행 |
| MSI 빌드 | WiX Toolset **v7.0.0** (`global.json`에 SDK 고정) |

WiX v7은 [OSMF EULA](https://docs.firegiant.com/wix/osmf/) 수락이 필요합니다. `.wixproj`에 `AcceptEula`가 설정되어 있습니다. Visual Studio에서는 [HeatWave for VS](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17) 설치를 권장합니다(Setup 프로젝트 로드·IntelliSense). CLI `dotnet build`는 HeatWave 없이 동작합니다.

## 빠른 시작 (개발자)

```powershell
cd FTPServerWinV10

# SFTP 지원 빌드용 FxSsh 클론 (최초 1회)
.\setup-fxssh.ps1

# 앱 빌드
dotnet build FTPServerWinV10\FTPServerWinV10.csproj

# Release + MSI
dotnet build FTPServerWinV10\FTPServerWinV10.sln -c Release
```

**MSI 출력**: `FTPServerWinV10Setup\bin\Release\FTPServerWinV10_Setup.msi`

Visual Studio에서 **Release**로 메인 프로젝트 또는 솔루션을 빌드해도 MSI가 생성됩니다. Debug 구성에서는 MSI가 만들어지지 않습니다.

### MSI가 생성되지 않을 때

1. 구성이 **Release**인지 확인
2. 출력 창에서 `Building MSI installer` / `MSI created:` 메시지 확인
3. `_fxssh_src`가 없으면 `setup-fxssh.ps1` 실행 후 다시 빌드
4. Setup 프로젝트가 VS에서 로드되지 않아도, 메인 프로젝트 Release 빌드로 MSI 생성 가능

## 프로젝트 구조

```
FTPServerWinV10/
  FTPServerWinV10/              메인 WinForms 앱
    Server/
      FtpServerManager.cs       FTP (PASV, LIST, RETR, STOR …)
      FtpsServerManager.cs      Implicit FTPS (SSL 제어 채널)
      SftpServerManager.cs      SFTP (FxSsh)
      SftpFxService.cs          SFTP v3 프로토콜
      VirtualFileSystem.cs      가상 경로 → 물리 경로
      ServerSettings.cs         JSON 설정·프로파일
      ProtocolSettings.cs       프로토콜별 포트·활성화
      CertificateGenerator.cs   자체 서명 PFX
    ErrorDialog.cs              상세·복사 가능 오류 팝업
    MainForm.cs
    GenerateCertDialog.cs
  FTPServerWinV10Setup/         WiX v7 MSI
  setup-fxssh.ps1               FxSsh dev 클론 스크립트
  global.json                   WiX SDK 7.0.0 고정
  UserGuide.md                  사용자 가이드
```

## 설정 파일 (런타임)

실행 파일과 같은 폴더에 생성됩니다 (`.gitignore` 대상).

| 파일 | 설명 |
|------|------|
| `server_settings.json` | 기본 설정 (종료 시 자동 저장) |
| `profiles/*.json` | 이름별 프로파일 |
| `ftpserver.log` | 서버 로그 |

SFTP 호스트 키: `%LocalAppData%\FTPServerWinV10\ssh_host_rsa.pem` (자동 생성)

## 키보드 단축키

| 키 | 동작 |
|----|------|
| F5 | 현재 설정 저장 |
| F6 | 저장된 설정 불러오기 |

## 알려진 제한

- **FTPS**: Implicit SSL(990)만 지원. 데이터 채널은 암호화되지 않을 수 있음 (`PROT P` 미구현).
- **SFTP**: 공유 폴더가 여러 개일 때 junction(`mklink /J`) 사용 — 관리자 권한이 필요할 수 있음.
- **Explicit FTPS** (포트 21 + `AUTH TLS`)는 지원하지 않음.

## 문서

- [UserGuide.md](UserGuide.md) — 설치, UI, 프로토콜, 인증, 프로파일, 문제 해결

## 라이선스

MIT License
