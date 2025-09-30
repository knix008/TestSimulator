# Firmware Updater

Network를 통해 펌웨어를 업데이트하는 C# 애플리케이션입니다. TLS/HTTPS를 사용하여 안전한 통신을 지원하며, RESTful API를 통해 장치와 통신합니다.

## 프로젝트 구성

### FirmwareUpdaterApp
- **타입**: WinForms GUI 애플리케이션
- **기능**:
  - 펌웨어 바이너리 파일 선택
  - TLS/HTTPS 통신
  - 업로드 진행 상황 표시
  - 실시간 로그 출력
  - RESTful API 호출

### DeviceSimulator
- **타입**: ASP.NET Core 웹 서버
- **기능**:
  - HTTPS 서버 (포트 5001)
  - 자체 서명 인증서 자동 생성
  - RESTful API 엔드포인트 제공
  - 펌웨어 파일 수신 및 저장 (최대 200MB)
  - 콘솔 로그 출력
  - 대용량 파일 업로드 지원

## API 명세

### 펌웨어 업데이트
- **Endpoint**: `POST /api/v1.0/updatefirmware`
- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `firmware`: 펌웨어 바이너리 파일
- **Max File Size**: 200MB
- **Response**:
  ```json
  {
    "success": true,
    "message": "Firmware updated successfully",
    "filename": "firmware.bin",
    "size": 138194900,
    "savedPath": "D:\\DeviceSimulator\\uploads\\20250930_234136_firmware.bin",
    "timestamp": "2025-09-30T23:41:36"
  }
  ```

## 빌드 및 실행

### 요구사항
- .NET 8.0 SDK
- Windows (WinForms GUI용)

### 빌드
```bash
# 전체 솔루션 빌드
dotnet build FirmwareUpdater.sln

# 개별 프로젝트 빌드
dotnet build DeviceSimulator/DeviceSimulator.csproj
dotnet build FirmwareUpdaterApp/FirmwareUpdaterApp.csproj
```

### 실행

#### 1. 디바이스 시뮬레이터 실행
```bash
dotnet run --project DeviceSimulator
```
- HTTPS 서버가 `https://localhost:5001`에서 시작됩니다
- 자체 서명 인증서가 자동으로 생성됩니다 (`devcert.pfx`)

#### 2. 펌웨어 업데이터 GUI 실행
```bash
dotnet run --project FirmwareUpdaterApp
```

### 사용 방법
1. DeviceSimulator를 먼저 실행
2. FirmwareUpdaterApp GUI 실행
3. GUI에서:
   - Device URL 확인 (기본값: `https://localhost:5001`)
   - "Browse..." 버튼으로 펌웨어 파일(.bin) 선택
   - "Upload Firmware" 버튼 클릭
4. DeviceSimulator 콘솔에서 업로드 로그 확인
5. 업로드된 파일은 `DeviceSimulator/uploads/` 폴더에 저장됨

## 보안

- **TLS 1.3**: 모든 통신은 HTTPS를 통해 암호화됩니다
- **자체 서명 인증서**: 개발 환경용 인증서가 자동 생성됩니다 (RSA 2048-bit)
- **인증서 검증 우회**: 개발/테스트 목적으로 클라이언트에서 인증서 검증을 우회합니다
- **대용량 파일 처리**: 최대 200MB 펌웨어 파일 업로드 지원

⚠️ **프로덕션 환경에서는 신뢰할 수 있는 CA에서 발급한 인증서를 사용하세요.**

## 기술 사양

### 서버 (DeviceSimulator)
- **프레임워크**: ASP.NET Core 8.0
- **프로토콜**: HTTPS (TLS 1.3)
- **포트**: 5001
- **최대 요청 크기**: 200MB
  - `MaxRequestBodySize`: 200MB
  - `MultipartBodyLengthLimit`: 200MB
- **인증서**: 자체 서명 X.509 (개발용)
- **업로드 폴더**: `DeviceSimulator/uploads/`

### 클라이언트 (FirmwareUpdaterApp)
- **프레임워크**: .NET 8.0 WinForms
- **HTTP 클라이언트**: HttpClient
- **인증서 검증**: 비활성화 (개발용)
- **지원 파일 형식**: .bin (바이너리 펌웨어 파일)

## 프로젝트 구조
```
FirmwareUpdater01/
├── FirmwareUpdaterApp/          # GUI 클라이언트
│   ├── Form1.cs                 # 메인 폼 로직
│   ├── Form1.Designer.cs        # UI 디자인
│   └── FirmwareUpdaterApp.csproj
├── DeviceSimulator/             # 디바이스 시뮬레이터
│   ├── Program.cs               # 서버 로직
│   ├── DeviceSimulator.csproj
│   └── uploads/                 # 업로드된 펌웨어 저장 (자동 생성)
├── FirmwareUpdater.sln
├── .gitignore
└── README.md
```

## 라이선스
이 프로젝트는 테스트 및 개발 목적으로 작성되었습니다.