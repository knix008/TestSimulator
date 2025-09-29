# TLS 상호 인증 시스템

이 프로젝트는 CA(Certificate Authority) 서버를 구축하고, 클라이언트와 서버가 상호 인증하는 방식으로 TLS를 이용해 통신하는 프로그램입니다.

## 시스템 구성

- **CA 서버**: Python으로 구현된 인증서 발급 및 검증 서버
- **TLS 서버**: C# WinForms GUI를 포함한 TLS 서버
- **TLS 클라이언트**: C# WinForms GUI를 포함한 TLS 클라이언트

## 기능

- ✅ CA 루트 인증서 자동 생성
- ✅ 서버/클라이언트 인증서 발급
- ✅ TLS 상호 인증 (Mutual TLS)
- ✅ 실시간 메시지 통신
- ✅ GUI 기반 사용자 인터페이스

## 설치 및 실행

### 1. Python 환경 설정

```bash
# Python 패키지 설치
pip install -r requirements.txt
```

### 2. CA 서버 실행

```bash
# CA 서버 시작
python ca_server.py
```

CA 서버가 시작되면 `certificates/` 폴더에 CA 루트 인증서가 생성됩니다.

### 3. 인증서 발급

```bash
# 서버 및 클라이언트 인증서 발급
python test_certificates.py
```

### 4. C# 애플리케이션 빌드 및 실행

#### TLS 서버 실행

```bash
cd TLSServer
dotnet build
dotnet run
```

#### TLS 클라이언트 실행

```bash
cd TLSClient
dotnet build
dotnet run
```

## 사용 방법

### 1. CA 서버 실행

- `python ca_server.py` 명령으로 CA 서버를 시작합니다.
- CA 루트 인증서가 자동으로 생성됩니다.

### 2. 인증서 발급

- `python test_certificates.py` 명령으로 서버와 클라이언트 인증서를 발급받습니다.
- 또는 클라이언트 GUI에서 "인증서 요청" 버튼을 사용할 수 있습니다.

### 3. TLS 서버 실행

- TLS 서버 애플리케이션을 실행합니다.
- 포트를 설정하고 "서버 시작" 버튼을 클릭합니다.
- 기본 포트: 8443

### 4. TLS 클라이언트 실행

- TLS 클라이언트 애플리케이션을 실행합니다.
- 서버 IP와 포트를 입력하고 "연결" 버튼을 클릭합니다.
- 상호 인증이 성공하면 TLS 연결이 설정됩니다.

### 5. 메시지 통신

- 양쪽 애플리케이션에서 메시지를 입력하고 전송할 수 있습니다.
- 모든 통신은 TLS로 암호화됩니다.

## 보안 특징

- **상호 인증**: 서버와 클라이언트 모두 인증서를 검증합니다.
- **CA 서명**: 모든 인증서는 CA에 의해 서명됩니다.
- **TLS 1.2**: 최신 TLS 프로토콜을 사용합니다.
- **인증서 검증**: 연결 시 인증서 유효성을 검증합니다.

## 파일 구조

```
├── ca_server.py              # CA 서버 (Python)
├── test_certificates.py      # 인증서 발급 테스트 스크립트
├── requirements.txt          # Python 의존성
├── certificates/             # 인증서 저장 폴더
│   ├── ca.crt               # CA 루트 인증서
│   ├── ca.key               # CA 개인키
│   ├── server.crt           # 서버 인증서
│   ├── server.key           # 서버 개인키
│   ├── client.crt           # 클라이언트 인증서
│   └── client.key           # 클라이언트 개인키
├── TLSServer/               # C# TLS 서버
│   ├── TLSServer.csproj
│   ├── Program.cs
│   └── ServerForm.cs
└── TLSClient/               # C# TLS 클라이언트
    ├── TLSClient.csproj
    ├── Program.cs
    └── ClientForm.cs
```

## 문제 해결

### 인증서 오류

- CA 서버가 실행 중인지 확인하세요.
- 인증서 파일이 올바른 위치에 있는지 확인하세요.

### 연결 오류

- 방화벽 설정을 확인하세요.
- 포트가 다른 애플리케이션에서 사용 중이지 않은지 확인하세요.

### TLS 핸드셰이크 오류

- 인증서가 올바르게 발급되었는지 확인하세요.
- CA 인증서가 양쪽 모두에 있는지 확인하세요.

## 개발 환경

- Python 3.8+
- .NET 6.0
- Windows 10/11
- Visual Studio 2022 또는 VS Code

## 라이선스

이 프로젝트는 교육 및 테스트 목적으로 제작되었습니다.
