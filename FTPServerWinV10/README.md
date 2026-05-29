# FTPServerWinV10

Windows용 **FTP / FTPS / SFTP** 서버 관리 프로그램 (C# WinForms, .NET 8)

자세한 사용 방법은 **[UserGuide.md](UserGuide.md)** 를 참고하세요.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 다중 공유 폴더 | 여러 물리 폴더를 가상 경로(`/이름`)로 매핑 — FTP·SFTP 동일 경로 |
| FTP | 평문 FTP (기본 포트 **21**), LIST/MLSD, PASV, 업·다운로드 |
| FTPS | Implicit SSL/TLS (기본 포트 **990**, **SSL 인증서**) |
| SFTP | SSH SFTP v3 (기본 포트 **22**, **SSH 호스트 키** PEM) |
| 동시 프로토콜 | UI에서 FTP / FTPS / SFTP를 각각 켜고 **동시 실행** |
| FTPS 인증서 | 자체 서명 **SSL 인증서** 생성·선택 (`.pfx`, RSA 2048) |
| SFTP 호스트 키 | RSA **PEM** 생성·지문(SHA256) 표시 — X.509 인증서와 별도 |
| 인증 | 익명(읽기 전용) 또는 사용자 ID/비밀번호, **읽기·쓰기** 권한 |
| 프로파일 | 설정을 이름으로 저장·불러오기·삭제 |
| 자동 저장 | 종료 시 `server_settings.json` 저장, 재시작 시 복원 |
| 오류 안내 | 설정·실행 오류 시 **상세 팝업** (전체 복사, 예외 스택) |
| 통계·로그 | 현재/총 접속 수, 업·다운로드 통계, 화면 로그·**로그 저장·복사**, `ftpserver.log` |

## FTPS 인증서 vs SFTP 호스트 키

| | **FTPS** | **SFTP** |
|---|----------|----------|
| 용도 | SSL/TLS 채널 암호화 | SSH 서버 신원 확인 |
| 파일 형식 | `.pfx` (SSL/TLS 인증서) | `.pem` (SSH 호스트 키) |
| UI 위치 | 서버 설정 → **FTPS — SSL 인증서** | 서버 설정 → **SFTP — 호스트 키** |
| 기본 경로 | 사용자 지정 (예: `server_cert.pfx`) | `%LocalAppData%\FTPServerWinV10\ssh_host_rsa.pem` |

SFTP에는 FTPS용 SSL 인증서가 필요하지 않습니다. 반대로 FTPS에는 SFTP 호스트 키가 사용되지 않습니다.

## 요구 사항

| 구분 | 내용 |
|------|------|
| OS | Windows 10/11 (x64) |
| 런타임 | [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) |
| 개발 | .NET 8 SDK, Visual Studio 2022 / 2026 |
| SFTP 빌드 | FxSsh `dev` 소스 — 최초 1회 `setup-fxssh.ps1` 실행 |
| MSI 빌드 | WiX Toolset **v7.0.0** (`global.json`에 SDK 고정) |

WiX v7은 [OSMF EULA](https://docs.firegiant.com/wix/osmf/) 수락이 필요합니다. `.wixproj`에 `AcceptEula`가 설정되어 있습니다. Visual Studio에서는 [HeatWave for VS](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17) 설치를 권장합니다. CLI `dotnet build`는 HeatWave 없이 동작합니다.

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

Visual Studio에서 **Release**로 솔루션을 빌드해도 MSI가 생성됩니다. **Debug** 구성에서는 MSI가 만들어지지 않습니다.

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
      FtpServerManager.cs       FTP (PASV, LIST/MLSD, RETR, STOR …)
      FtpsServerManager.cs      Implicit FTPS (SSL 제어 채널)
      SftpServerManager.cs      SFTP (FxSsh, SSH subsystem)
      SftpFxService.cs          SFTP v3 프로토콜
      SftpHostKeyManager.cs     SSH 호스트 RSA 키 (PEM)
      VirtualFileSystem.cs      가상 경로 → 물리 경로
      ServerSettings.cs         JSON 설정·프로파일
      ProtocolSettings.cs       프로토콜별 포트·활성화
      CertificateGenerator.cs   FTPS 자체 서명 SSL 인증서
      UserAuthHelper.cs         인증·세션 권한
      SessionPermissions.cs
      LogManager.cs
    ErrorDialog.cs              상세·복사 가능 오류 팝업
    MainForm.cs
    GenerateCertDialog.cs       FTPS SSL 인증서 생성 대화상자
  FTPServerWinV10Setup/         WiX v7 MSI
  setup-fxssh.ps1               FxSsh dev 클론 스크립트
  global.json                   WiX SDK 7.0.0 고정
  UserGuide.md                  사용자 가이드
```

## 설정·런타임 파일

실행 파일과 같은 폴더(또는 `bin` 하위)에 생성됩니다. **`.gitignore` 대상**이므로 커밋하지 마세요.

| 파일 | 설명 |
|------|------|
| `server_settings.json` | 기본 설정 (종료 시 자동 저장, `SftpHostKeyPath` 등 포함) |
| `profiles/*.json` | 이름별 프로파일 |
| `ftpserver.log` | 서버 로그 (자동 기록, UI에서 저장·복사 가능) |
| `server_cert.pfx` | FTPS용 인증서 (생성 시, 경로는 설정에 따름) |

| 경로 | 설명 |
|------|------|
| `%LocalAppData%\FTPServerWinV10\ssh_host_rsa.pem` | SFTP SSH 호스트 키 (없으면 자동 생성) |

## 키보드 단축키

| 키 | 동작 |
|----|------|
| F5 | 현재 설정 저장 |
| F6 | 저장된 설정 불러오기 |

## 알려진 제한

- **FTPS**: Implicit SSL(990)만 지원. Explicit FTPS(21 + `AUTH TLS`) 미지원.
- **FTPS**: 데이터 채널 암호화(`PROT P`) 미구현 — 제어 채널만 SSL일 수 있음.
- **SFTP**: 공개키 인증은 미지원(비밀번호·익명). 셸/`exec` 채널 미지원.
- **SFTP**: 호스트 키는 RSA PEM 자체 생성·관리(공인 CA SSH 인증서 아님).

## 문제 해결 (요약)

| 증상 | 확인 |
|------|------|
| SFTP `did not receive FXP_VERSION` | 서버 재시작, 로그에 `FXP_INIT -> FXP_VERSION` 여부 확인 |
| SFTP 목록 실패 | 공유 폴더 등록·읽기 권한, 로그의 `SFTP: OPENDIR` 메시지 |
| FTPS 연결 실패 | FTPS 체크, 인증서 경로·암호, 포트 990 방화벽 |
| 호스트 키 변경 경고 | SFTP **키 생성** 후 클라이언트에서 새 지문 신뢰 |

상세 내용은 [UserGuide.md](UserGuide.md) §13 문제 해결을 참고하세요.

## 문서

- [UserGuide.md](UserGuide.md) — 설치, UI, 프로토콜, FTPS SSL 인증서 / SFTP 호스트 키, 인증, 프로파일, 문제 해결

## 라이선스

MIT License
