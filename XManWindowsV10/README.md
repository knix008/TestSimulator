# XManWindowsV10 - X Window Server for Windows

Windows 환경에서 동작하는 X11 Window Server 구현체입니다. 원격 Linux/Unix 시스템의 X 애플리케이션을 Windows에서 실행하고 표시할 수 있습니다.

## 주요 기능

- X11 프로토콜 지원
- DirectX 기반 고성능 렌더링
- TCP/IP 네트워크 지원
- 윈도우 관리 및 이벤트 처리
- 키보드/마우스 입력 지원

## 빠른 시작

### 3분 안에 시작하기

```powershell
# 1. 빌드
mkdir build
cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release

# 2. 실행
cd bin\Release
.\XManWindowsV10.exe 0

# 3. WSL에서 테스트
# (다른 터미널에서)
wsl
export DISPLAY=localhost:0
xclock
```

## 기술 스택

- **언어**: C++17
- **렌더링**: DirectX 11
- **네트워크**: Winsock2 (TCP/IP)
- **빌드 시스템**: CMake
- **X11 프로토콜**: 직접 구현 (libxcb 비의존적)

## 프로젝트 구조

```
XManWindowsV10/
├── src/                      # 소스 파일
│   ├── main.cpp             # 프로그램 진입점
│   ├── XManServer.cpp       # 메인 서버
│   ├── X11Protocol.cpp      # X11 프로토콜 처리
│   ├── NetworkServer.cpp    # TCP/IP 네트워크 서버
│   ├── WindowManager.cpp    # 윈도우 관리
│   ├── DirectXRenderer.cpp  # DirectX 렌더링
│   └── CMakeLists.txt       # 빌드 설정
├── include/                  # 헤더 파일
│   ├── XManTypes.h          # 기본 타입 정의
│   ├── XManServer.h         # 서버 인터페이스
│   ├── X11Protocol.h        # X11 프로토콜
│   ├── NetworkServer.h      # 네트워크 인터페이스
│   ├── WindowManager.h      # 윈도우 관리 인터페이스
│   └── DirectXRenderer.h    # 렌더링 인터페이스
├── tests/                    # 테스트
│   ├── test_basic.cpp       # 기본 테스트
│   └── CMakeLists.txt       # 테스트 빌드 설정
├── docs/                     # 문서
│   ├── BUILD.md             # 빌드 가이드
│   ├── DEVELOPMENT.md       # 개발 가이드
│   └── X11_PROTOCOL.md      # X11 프로토콜 참고
├── .vscode/                  # VS Code 설정
├── CMakeLists.txt           # 메인 빌드 설정
├── README.md                # 이 파일
├── LICENSE                  # MIT 라이선스
├── CONTRIBUTING.md          # 기여 가이드
└── .gitignore              # Git 무시 파일
```

## 필수 요구사항

### 소프트웨어

- **Windows 10/11** (64-bit)
- **Visual Studio 2019 이상** (Community 버전 가능)
  - "C++를 사용한 데스크톱 개발" 워크로드 설치 필요
  - Windows 10 SDK 포함
- **CMake 3.15 이상**
  - [cmake.org](https://cmake.org/download/)에서 다운로드

### 하드웨어

- DirectX 11을 지원하는 그래픽 카드

## 빌드 방법

### 1. 소스 코드 준비

```powershell
cd d:\Home\Projects\TestSimulator\XManWindowsV10
```

### 2. 빌드 디렉토리 생성

```powershell
mkdir build
cd build
```

### 3. CMake 구성

**Visual Studio 2022 사용:**

```powershell
cmake .. -G "Visual Studio 17 2022" -A x64
```

**Visual Studio 2019 사용:**

```powershell
cmake .. -G "Visual Studio 16 2019" -A x64
```

### 4. 빌드 실행

**릴리스 버전 (권장):**

```powershell
cmake --build . --config Release
```

**디버그 버전:**

```powershell
cmake --build . --config Debug
```

### 5. 빌드 결과 확인

실행 파일 위치: `build\bin\Release\XManWindowsV10.exe`

## 실행 방법

### 기본 실행

```powershell
cd build\bin\Release
.\XManWindowsV10.exe
```

기본적으로 display :0 (포트 6000)에서 실행됩니다.

### 디스플레이 번호 지정

다른 디스플레이 번호를 사용하려면:

```powershell
.\XManWindowsV10.exe 1
```

이렇게 하면 display :1 (포트 6001)에서 실행됩니다.

### 실행 확인

서버가 정상적으로 시작되면 다음과 같은 메시지가 표시됩니다:

```
XManWindowsV10 - X Window Server for Windows
=============================================
WindowManager initialized
Network server listening on port 6000
XMan Server started on display :0
Listening on port 6000

Server is running. Press Ctrl+C to stop.
```

## 사용 방법

### 로컬 테스트 (WSL 사용)

1. **Windows에서 서버 시작:**

   ```powershell
   .\XManWindowsV10.exe 0
   ```

2. **WSL 터미널에서 DISPLAY 설정:**

   ```bash
   export DISPLAY=localhost:0
   ```

3. **X 애플리케이션 실행:**

   ```bash
   # 간단한 시계 애플리케이션
   xclock

   # 터미널
   xterm

   # 눈 애니메이션
   xeyes
   ```

### 원격 테스트 (다른 Linux 머신)

1. **Windows에서 서버 시작:**

   ```powershell
   .\XManWindowsV10.exe 0
   ```

2. **Windows 방화벽 설정:**
   - Windows Defender 방화벽 열기
   - 인바운드 규칙 > 새 규칙
   - 포트 6000 허용

3. **Windows IP 주소 확인:**

   ```powershell
   ipconfig
   ```

   예: `192.168.1.100`

4. **Linux 머신에서 연결:**
   ```bash
   export DISPLAY=192.168.1.100:0
   xclock
   ```

### Docker 컨테이너에서 사용

```bash
docker run -e DISPLAY=host.docker.internal:0 myimage
```

## 테스트

### 단위 테스트 실행

```powershell
cd build
ctest -C Release
```

### 수동 테스트

서버 실행 후 WSL이나 Linux에서:

```bash
# 그래픽 애플리케이션 실행
xterm &
xclock &
xeyes &

# GUI 애플리케이션 실행
firefox &
gedit &
```

## 문제 해결

### 포트가 이미 사용 중입니다

**오류:** `Bind failed`

**해결책:**

1. 다른 디스플레이 번호 사용:

   ```powershell
   .\XManWindowsV10.exe 1
   ```

2. 또는 기존 프로세스 종료:
   ```powershell
   netstat -ano | findstr :6000
   taskkill /PID <프로세스ID> /F
   ```

### DirectX 초기화 실패

**오류:** `Failed to create D3D11 device`

**해결책:**

- 그래픽 드라이버 업데이트
- DirectX 런타임 설치: [Microsoft DirectX End-User Runtime](https://www.microsoft.com/download/details.aspx?id=35)

### 연결 거부됨

**오류:** Linux에서 `Can't open display`

**해결책:**

1. Windows 방화벽 확인
2. 서버가 실행 중인지 확인
3. IP 주소와 포트 번호 확인
4. WSL의 경우 `localhost` 사용

### 애플리케이션이 표시되지 않음

**현재 상태:** 이 프로젝트는 초기 개발 단계입니다.

완전히 구현되지 않은 기능:

- 실제 윈도우 렌더링
- 그래픽 명령 실행
- 키보드/마우스 이벤트

로그에서 연결 및 요청 처리 메시지는 확인할 수 있습니다.

## 로그 확인

서버는 콘솔에 자세한 로그를 출력합니다:

```
New client connected from 127.0.0.1
Connection setup request:
  Byte order: l
  Protocol: 11.0
Sending connection setup response
Processing X11 request: opcode=1, length=8
CreateWindow: wid=12345678, parent=0, x=0, y=0, width=800, height=600
```

## 추가 문서

- [BUILD.md](docs/BUILD.md) - 상세한 빌드 가이드
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - 개발 가이드
- [X11_PROTOCOL.md](docs/X11_PROTOCOL.md) - X11 프로토콜 참고
- [CONTRIBUTING.md](CONTRIBUTING.md) - 기여 가이드

## 개발 상태

🚧 **초기 개발 단계** - 프로토타입 버전

### 구현 완료 ✅

- 프로젝트 구조 및 아키텍처
- CMake 빌드 시스템
- TCP/IP 네트워크 서버 (포트 6000+)
- X11 연결 설정 (Connection Setup)
- 기본 X11 요청 파싱
- DirectX 11 초기화
- Win32 윈도우 관리 기본 구조

### 구현 진행 중 🔨

- X11 프로토콜 완전 구현
  - CreateWindow, MapWindow 등
  - 그래픽 컨텍스트 (GC)
  - 이벤트 시스템
- DirectX 렌더링 엔진
  - 기본 도형 그리기
  - 텍스트 렌더링
  - 이미지 처리

### 향후 계획 📋

- X11 확장 프로토콜 (XFixes, XRender 등)
- 클립보드 공유
- 성능 최적화
- 멀티 디스플레이 지원

### 기여하기

이 프로젝트는 오픈소스이며 기여를 환영합니다! [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

## 연락처 및 지원

- 이슈 리포트: GitHub Issues
- 기능 제안: GitHub Discussions
- 문서: [docs/](docs/) 디렉토리

## 관련 프로젝트

- [VcXsrv](https://sourceforge.net/projects/vcxsrv/) - 기존 Windows X Server
- [Xming](http://www.straightrunning.com/XmingNotes/) - 또 다른 Windows X Server
- [X.Org](https://www.x.org/) - 공식 X Window System 프로젝트
