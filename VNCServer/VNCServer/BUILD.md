# VNC Server 빌드 및 배포 가이드

## 개발 환경 설정

### 필수 요구사항
- .NET SDK 8.0 이상
- Windows OS
- Visual Studio 2022 또는 VS Code (선택사항)

### 의존성 확인
```powershell
dotnet --version  # 8.0.300 이상이어야 함
```

## 빌드 옵션

### Debug 빌드
개발 및 테스트용:
```powershell
dotnet build -c Debug
```

### Release 빌드
배포용 (최적화됨):
```powershell
dotnet build -c Release
```

### 단일 실행 파일 생성
모든 의존성을 포함한 단일 .exe 파일:
```powershell
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

생성 위치: `bin\Release\net8.0-windows\win-x64\publish\VNCServer.exe`

### 프레임워크 의존 빌드
.NET 런타임이 이미 설치된 시스템용:
```powershell
dotnet publish -c Release -r win-x64 --self-contained false
```

## 실행 방법

### 개발 모드
```powershell
dotnet run
```

### 빌드된 실행 파일
```powershell
# Debug
.\bin\Debug\net8.0-windows\VNCServer.exe

# Release
.\bin\Release\net8.0-windows\VNCServer.exe

# 배포판
.\bin\Release\net8.0-windows\win-x64\publish\VNCServer.exe
```

## 디버깅

### Visual Studio Code
1. `.vscode/launch.json` 자동 생성:
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": ".NET Core Launch (console)",
            "type": "coreclr",
            "request": "launch",
            "preLaunchTask": "build",
            "program": "${workspaceFolder}/bin/Debug/net8.0-windows/VNCServer.exe",
            "args": [],
            "cwd": "${workspaceFolder}",
            "console": "internalConsole",
            "stopAtEntry": false
        }
    ]
}
```

2. F5 키로 디버깅 시작

### Visual Studio 2022
1. VNCServer.csproj를 열기
2. F5 키로 디버깅 시작

## 배포

### 1. 간단한 배포 (프레임워크 의존)
사용자가 .NET 8.0 런타임을 설치해야 함:
```powershell
dotnet publish -c Release
```

### 2. 완전 독립 배포
.NET 런타임 포함:
```powershell
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

### 3. 설치 프로그램 생성 (선택사항)
- Inno Setup
- WiX Toolset
- Advanced Installer

## 성능 최적화

### 릴리스 빌드 최적화
```powershell
dotnet publish -c Release -r win-x64 --self-contained true ^
    -p:PublishSingleFile=true ^
    -p:PublishTrimmed=true ^
    -p:TrimMode=link ^
    -p:EnableCompressionInSingleFile=true
```

⚠️ 주의: `PublishTrimmed`는 리플렉션 사용 시 문제가 될 수 있습니다.

## 트러블슈팅

### 빌드 오류
1. **CS0103**: 이름을 찾을 수 없음
   - using 문 확인
   - 네임스페이스 확인

2. **CS0111**: 멤버 중복 정의
   - partial class 파일들 확인
   - Designer.cs와 코드 파일의 충돌 확인

3. **포트 이미 사용 중**
   - 다른 VNC 서버나 프로그램이 포트를 사용 중
   - 작업 관리자에서 확인 후 종료

### 실행 오류
1. **권한 오류**
   - 관리자 권한으로 실행 시도

2. **방화벽 차단**
   - Windows 방화벽 설정 확인
   - 인바운드 규칙에 VNCServer 추가

## 테스트

### 로컬 테스트
1. VNC Server 실행
2. VNC Viewer로 `localhost:5900` 접속
3. 비밀번호 입력
4. 화면 공유 확인

### 네트워크 테스트
1. 서버의 IP 주소 확인: `ipconfig`
2. 같은 네트워크의 다른 컴퓨터에서 접속
3. VNC Viewer로 `서버IP:5900` 접속

## 로그 확인

### 애플리케이션 로그
- 프로그램 내 로그 화면 확인

### 디버그 로그
```csharp
System.Diagnostics.Debug.WriteLine("로그 메시지");
```
- Visual Studio Output 창에서 확인
- DebugView 도구 사용

## 성능 모니터링

### CPU/메모리 사용량
```powershell
Get-Process VNCServer | Select-Object CPU, WorkingSet
```

### 네트워크 트래픽
- 작업 관리자 > 성능 > 이더넷
- Resource Monitor (resmon.exe)

## 추가 리소스
- [.NET Documentation](https://docs.microsoft.com/dotnet/)
- [RFB Protocol Specification](https://github.com/rfbproto/rfbproto)
- [Windows Forms Documentation](https://docs.microsoft.com/dotnet/desktop/winforms/)
