# 배포 가이드

## 1. 프로젝트 빌드

### 디버그 빌드
```powershell
dotnet build -c Debug
```

### 릴리즈 빌드
```powershell
dotnet build -c Release
```

## 2. 배포판 생성

### 자체 포함 배포 (Self-Contained Deployment)
.NET 런타임 포함, 대상 PC에 .NET 설치 불필요

```powershell
# 단일 실행 파일로 배포
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:PublishTrimmed=false

# 일반 배포
dotnet publish -c Release -r win-x64 --self-contained true
```

### 프레임워크 종속 배포 (Framework-Dependent Deployment)
.NET 런타임 미포함, 대상 PC에 .NET 10.0 설치 필요

```powershell
dotnet publish -c Release -r win-x64 --self-contained false
```

## 3. MSI 설치 프로그램 생성

### 방법 1: WiX Toolset 사용

1. WiX Toolset 설치
```powershell
dotnet tool install --global wix
```

2. WiX 프로젝트 추가 (별도 작업 필요)

### 방법 2: Inno Setup 사용 (권장)

1. Inno Setup 다운로드 및 설치
   - https://jrsoftware.org/isinfo.php

2. setup.iss 파일을 Inno Setup으로 열기

3. 컴파일하여 설치 프로그램 생성
   - Build → Compile
   - 또는 명령줄에서:
   ```powershell
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss
   ```

4. 생성된 설치 파일 확인
   - `Installer\RTSPServer-Setup-1.0.0.exe`

### 방법 3: ClickOnce 배포

```powershell
# 프로젝트 파일에 추가 설정 필요
dotnet publish -c Release -p:PublishProtocol=ClickOnce
```

### 방법 4: MSIX 패키지

```powershell
# Windows 10/11 앱 스토어 배포용
# Visual Studio에서 MSIX 패키징 프로젝트 추가 필요
```

## 4. 배포 후 확인 사항

### 테스트 체크리스트
- [ ] 프로그램 정상 실행
- [ ] 비디오 파일 로드 기능
- [ ] 비디오 재생/일시정지/정지 기능
- [ ] RTSP 서버 시작/중지 기능
- [ ] 관리자 권한 요청 (포트 554 사용시)
- [ ] 설치/제거 프로그램 동작 확인

### 필요한 파일
```
RTSPServer/
├── RTSPServer.exe          # 실행 파일
├── RTSPServer.dll          # 애플리케이션 DLL
├── RTSPServer.deps.json    # 종속성 정보
├── RTSPServer.runtimeconfig.json
└── README.md               # 사용 설명서
```

## 5. 배포 시 주의사항

### 관리자 권한
- 포트 554 사용시 관리자 권한 필요
- 설치 프로그램도 관리자 권한으로 실행 권장

### 방화벽 설정
- Windows 방화벽에서 RTSPServer.exe 허용 필요
- 인바운드 규칙에서 포트 554 (또는 사용 포트) 허용

### 코덱 지원
- Windows Media Player 코덱 설치 권장
- K-Lite Codec Pack 등 설치 안내

## 6. 자동 배포 스크립트

### PowerShell 스크립트 (Deploy.ps1)
```powershell
# 빌드 및 배포
$version = "1.0.0"
$outputPath = ".\Publish\RTSPServer-$version"

# Clean
Remove-Item -Path ".\bin" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\obj" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $outputPath -Recurse -Force -ErrorAction SilentlyContinue

# Build
dotnet restore
dotnet build -c Release

# Publish
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $outputPath

# Create installer (Inno Setup 필요)
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss

Write-Host "배포 완료: $outputPath"
```

## 7. 디지털 서명 (선택사항)

### 인증서로 서명
```powershell
# signtool 사용 (Windows SDK 필요)
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com RTSPServer.exe
```

## 8. 버전 관리

### 버전 번호 업데이트
1. `RTSPServer.csproj` 파일의 `<Version>` 태그
2. `setup.iss` 파일의 `MyAppVersion` 정의
3. `README.md` 파일의 버전 정보

## 9. 배포 플랫폼

### 다양한 플랫폼 지원
```powershell
# Windows x64
dotnet publish -c Release -r win-x64 --self-contained true

# Windows x86
dotnet publish -c Release -r win-x86 --self-contained true

# Windows ARM64
dotnet publish -c Release -r win-arm64 --self-contained true
```

## 10. 문제 해결

### 실행 파일이 너무 큰 경우
```powershell
# Trimming 사용 (일부 기능이 제거될 수 있음)
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishTrimmed=true
```

### 네이티브 라이브러리 오류
```powershell
# 네이티브 라이브러리를 별도로 추출
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```
