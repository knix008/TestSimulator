# FTPServerWinV10

C# WinForms 기반의 Windows용 FTP/FTPS 서버 관리자

## 주요 기능

| 기능 | 설명 |
|---|---|
| 다중 공유 폴더 | 여러 물리적 폴더를 가상 FTP 경로(`/이름`)로 각각 매핑 |
| FTP / FTPS | 평문 FTP(포트 21), SSL/TLS FTPS(포트 990) 동시 지원 |
| 자체 서명 인증서 | 앱 내에서 PFX 인증서 직접 생성 (RSA 2048, SHA-256) |
| 인증 설정 | 익명 접속 허용 또는 사용자 ID/비밀번호 인증 선택 |
| 프로파일 관리 | 설정을 이름으로 저장·불러오기·삭제 |
| 자동 저장 | 앱 종료 시 현재 설정 자동 저장, 재시작 시 자동 복원 |
| 서버 상태 표시 | 헤더의 상태 표시(● 실행 중 / ● 중지됨)로 실시간 확인 |
| 전송 통계 | 업로드·다운로드 파일 수 및 누적 용량 표시 |
| 실시간 로그 | 화면 표시 및 `ftpserver.log` 파일 동시 기록 |
| 버퍼 / 스레드 | 버퍼 크기(KB) 및 최대 동시 스레드 수 조절 |

## 요구 사항

- **개발 환경**: .NET 8 SDK, Visual Studio 2022 / 2026
- **런타임**: Windows 10/11, .NET 8 Runtime (framework-dependent 배포 시)
- **MSI 빌드**: WiX Toolset **v7.0.0** — Visual Studio 2026에서는 [HeatWave for VS](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17) 설치 권장 (Setup 프로젝트 로드·IntelliSense용). CLI/`dotnet build`는 HeatWave 없이 동작합니다. WiX v7은 [OSMF EULA](https://docs.firegiant.com/wix/osmf/) 수락이 필요하며, `.wixproj`에 `AcceptEula`가 설정되어 있습니다.

## 빌드

```bash
# 앱만 빌드 (Debug)
dotnet build FTPServerWinV10/FTPServerWinV10.csproj

# MSI 인스톨러 생성 (Release, WiX 필요)
dotnet build FTPServerWinV10Setup/FTPServerWinV10Setup.wixproj -c Release
```

Visual Studio 2026에서 **Release|Any CPU**로 빌드하면 MSI가 자동 생성됩니다.

- **솔루션 빌드**(Ctrl+Shift+B) 또는 **시작 프로젝트(FTPServerWinV10)만 빌드** 모두 MSI 생성
- Setup 프로젝트는 **x64** 플랫폼으로 빌드됩니다 (TerminalWinV10 / MDMakerWinV10과 동일 패턴)

**MSI 출력 경로**:

`FTPServerWinV10Setup\bin\Release\FTPServerWinV10_Setup.msi`

Debug 구성에서는 MSI가 생성되지 않습니다.

### Visual Studio에서 MSI가 안 나올 때

1. 구성이 **Release|Any CPU**인지 확인
2. 출력 창에서 `Building MSI installer` / `MSI created:` 메시지 확인
3. Setup 프로젝트가 **로드 안 됨**이어도, 메인 프로젝트 Release 빌드 시 MSI는 생성됩니다
4. HeatWave 미설치 시에도 CLI `dotnet build`로 MSI 생성 가능

## 프로젝트 구조

```
FTPServerWinV10/
  FTPServerWinV10/          ← 메인 앱 (WinForms, .NET 8)
    Server/
      FtpServerManager.cs   ← FTP 세션 처리 (PASV, LIST, RETR, STOR …)
      FtpsServerManager.cs  ← SSL 스트림 래퍼
      VirtualFileSystem.cs  ← 가상 경로 → 물리 경로 매핑
      ServerSettings.cs     ← JSON 설정 저장/불러오기
      CertificateGenerator.cs ← 자체 서명 PFX 생성
    MainForm.cs / .Designer.cs
    GenerateCertDialog.cs
  FTPServerWinV10Setup/     ← WiX v7 MSI 인스톨러
    Package.wxs              ← 설치 정의 (기능·바로가기·아이콘)
    FTPServerWinV10Setup.wixproj
  global.json               ← WiX SDK 버전 고정 (7.0.0)
```

## 설치 프로그램 (MSI)

Release 빌드 시 생성되는 `FTPServerWinV10_Setup.msi`는:

- 설치 경로 선택 가능
- **바탕화면 바로가기** 생성 (선택)
- **시작 메뉴 바로가기** 생성 (선택)
- 바로가기 및 프로그램 추가/제거 아이콘: `daemon_hammer.ico`

## 설정 파일

| 파일 | 내용 |
|---|---|
| `server_settings.json` | 기본 설정 (앱 종료 시 자동 저장) |
| `profiles/*.json` | 이름으로 저장한 프로파일 |
| `ftpserver.log` | 서버 로그 (실행 파일과 같은 폴더) |

## 키보드 단축키

| 키 | 동작 |
|---|---|
| `F5` | 현재 설정 저장 |
| `F6` | 저장된 설정 불러오기 |

## 라이선스

MIT License
