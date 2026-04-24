# RTSP Server with GTK GUI

GTK 기반 GUI를 갖춘 크로스 플랫폼 RTSP 스트리밍 서버 및 비디오 플레이어입니다.

## 주요 기능

### 🎬 RTSP 스트리밍 서버
- **파일 스트리밍**: 비디오 파일(MP4, AVI, MKV 등)을 RTSP로 스트리밍
- **웹캠 스트리밍**: 시스템 웹캠을 실시간 스트리밍
- **테스트 패턴**: 테스트용 컬러 바 패턴 스트리밍
- **비디오 코덱**: H.264 (2000kbps, low latency)
- **오디오 코덱**: Opus (128kbps, high quality)

### 🎥 내장 비디오 플레이어
- **로컬 재생**: GTK 윈도우에 embedded된 비디오 플레이어
- **완전한 제어**: 재생/일시정지/정지/탐색/볼륨 조절
- **실시간 정보**: 재생 시간, 진행 상태 표시
- **독립 실행**: RTSP 스트리밍과 독립적으로 동작

### 🛠️ 개발 편의성
- **자동 설치**: MSYS2 및 모든 의존성 자동 설치 (Windows)
- **크로스 플랫폼**: Windows, Linux, macOS 지원
- **간편한 빌드**: 원클릭 빌드 및 실행 스크립트
- **모듈화**: GTK 의존성 분리된 깔끔한 아키텍처

## 시스템 요구사항

### Windows
- Windows 10 이상
- MSYS2 (자동 설치 스크립트 제공)

### Linux
- Ubuntu 20.04+ / Fedora 33+ / Debian 11+
- GCC, pkg-config

### macOS
- macOS 11+ (Big Sur 이상)
- Homebrew

## 설치 방법

### Windows

#### 방법 1: 원클릭 설정 및 실행 (권장)
```batch
setup_and_run.bat
```
이 스크립트는 다음을 자동으로 수행합니다:
1. MSYS2 설치 확인 및 자동 설치 (winget 사용)
2. 모든 의존성 패키지 설치
3. 프로젝트 빌드
4. 프로그램 실행

#### 방법 2: 단계별 설치
```batch
# 1. MSYS2 설치
install_msys2_windows.bat

# 2. 의존성 설치
install_dependencies_windows.bat

# 3. 빌드
build_windows.bat

# 4. 실행
run.bat
```

### Linux (Ubuntu/Debian)
```bash
# 의존성 설치
chmod +x install_dependencies_ubuntu.sh
./install_dependencies_ubuntu.sh

# 빌드
make

# 실행
./run.sh
```

### Linux (Fedora/RHEL)
```bash
# 의존성 설치
chmod +x install_dependencies_fedora.sh
./install_dependencies_fedora.sh

# 빌드
make

# 실행
./run.sh
```

### macOS
```bash
# 의존성 설치
chmod +x install_dependencies_macos.sh
./install_dependencies_macos.sh

# 빌드
make

# 실행
./run.sh
```

## 빌드 명령어

### 빌드
```bash
# Windows
build_windows.bat

# Linux/macOS
make
```

### 클린
```bash
# Windows
clean_windows.bat

# Linux/macOS
make clean
```

### 디버그 모드 실행
```bash
# Windows
run_debug.bat

# Linux/macOS
GST_DEBUG=3 ./rtsp-server 2>&1 | tee debug.log
```

## 사용 방법

### 로컬 비디오 재생

1. **비디오 플레이어** 섹션에서 파일 선택 버튼 클릭
2. 재생할 비디오 파일 선택 (MP4, AVI, MKV 등)
3. **▶ 재생** 버튼 클릭
4. 슬라이더로 탐색, 볼륨 조절

### RTSP 스트리밍 서버

#### 파일 스트리밍
1. **RTSP 서버** 섹션에서 **파일 스트리밍** 라디오 버튼 선택
2. 파일 선택 버튼으로 비디오 파일 선택
3. 포트 (기본값: 8554) 및 경로 (기본값: stream) 확인
4. **▶ RTSP 서버 시작** 버튼 클릭
5. VLC 등 클라이언트에서 연결:
   ```
   rtsp://localhost:8554/stream
   ```

#### 웹캠 스트리밍
1. **웹캠 스트리밍** 라디오 버튼 선택
2. **▶ RTSP 서버 시작** 버튼 클릭
3. 클라이언트에서 연결

### RTSP 스트림 시청

#### VLC Media Player
1. **Media** → **Open Network Stream**
2. URL 입력: `rtsp://localhost:8554/stream`
3. **Play** 클릭

#### ffplay (FFmpeg)
```bash
ffplay rtsp://localhost:8554/stream
```

#### GStreamer
```bash
gst-launch-1.0 playbin uri=rtsp://localhost:8554/stream
```

## 프로젝트 구조

```
RTSPServerV10/
├── main.c                              # 애플리케이션 진입점
├── rtsp_server.h/c                     # RTSP 서버 구현 (GTK 독립)
├── gui.h/c                             # GTK GUI 구현
├── app_resource.rc                     # Windows 리소스 파일
├── daemon_hammer.ico                   # 애플리케이션 아이콘
├── Makefile                            # 크로스 플랫폼 빌드 시스템
│
├── build_windows.bat                   # Windows 빌드 스크립트
├── clean_windows.bat                   # Windows 클린 스크립트
├── run.bat / run.sh                    # 실행 스크립트
├── run_debug.bat                       # 디버그 모드 실행 (Windows)
├── setup_and_run.bat                   # 원클릭 설정 및 실행 (Windows)
│
├── install_msys2_windows.bat           # MSYS2 자동 설치
├── install_dependencies_windows.bat    # Windows 의존성 설치
├── install_dependencies_ubuntu.sh      # Ubuntu/Debian 의존성 설치
├── install_dependencies_fedora.sh      # Fedora/RHEL 의존성 설치
├── install_dependencies_macos.sh       # macOS 의존성 설치
│
├── test_video.bat / test_video.sh      # 테스트 비디오 생성 스크립트
└── .gitignore                          # Git 제외 파일 목록
```

## 기술 스택

### 핵심 라이브러리
- **GTK+ 3.0**: GUI 프레임워크
- **GStreamer 1.0**: 멀티미디어 프레임워크
  - gstreamer-rtsp-server-1.0: RTSP 서버 기능
  - gstreamer-video-1.0: 비디오 오버레이
- **C Language**: C99 표준

### 빌드 도구
- **GCC**: 컴파일러
- **Make**: 빌드 시스템
- **pkg-config**: 라이브러리 플래그 관리

### GStreamer 플러그인
- **base**: 기본 플러그인
- **good**: 고품질 플러그인
- **bad**: 실험적 플러그인
- **ugly**: 특허/라이선스 제한 플러그인
- **libav**: FFmpeg 기반 코덱

### 비디오/오디오 코덱
- **비디오**: H.264 (x264enc)
- **오디오**: Opus (opusenc)
- **RTP**: rtph264pay, rtpopuspay

## 아키텍처

### 모듈 분리
프로젝트는 GTK 의존성이 분리된 모듈화된 구조를 가지고 있습니다:

```
main.c
  ├── rtsp_server (GTK 독립)
  │   ├── GstRTSPServer
  │   ├── GstRTSPMediaFactory
  │   └── GstRTSPMountPoints
  │
  └── gui (GTK 의존)
      ├── 비디오 플레이어 (GstVideoOverlay)
      ├── RTSP 서버 제어 UI
      └── 상태 표시
```

### 플랫폼별 비디오 싱크
- **Windows**: d3dvideosink (DirectX) / directdrawsink
- **Linux**: xvimagesink (X11) / ximagesink
- **macOS**: glimagesink (OpenGL)

## 트러블슈팅

### Windows: "MSYS2가 설치되지 않았습니다"
```batch
# MSYS2 자동 설치
install_msys2_windows.bat
```
또는 수동 설치: https://www.msys2.org/

### Linux: "pkg-config를 찾을 수 없습니다"
```bash
# Ubuntu/Debian
sudo apt-get install pkg-config

# Fedora/RHEL
sudo dnf install pkg-config
```

### "GStreamer 플러그인을 찾을 수 없습니다"
의존성 설치 스크립트를 다시 실행하세요:
```bash
# Windows
install_dependencies_windows.bat

# Linux/macOS
./install_dependencies_[platform].sh
```

### RTSP 연결 실패
1. **방화벽 확인**: 포트 8554가 열려있는지 확인
2. **파일 경로**: 비디오 파일 경로에 한글이나 특수문자가 없는지 확인
3. **파일 형식**: 지원되는 비디오 포맷인지 확인 (MP4, AVI, MKV 권장)
4. **디버그 모드**: `run_debug.bat`로 실행하여 오류 메시지 확인

### 오디오가 재생되지 않음
1. **파일 확인**: 비디오 파일에 오디오 트랙이 있는지 확인
2. **VLC 오디오 트랙**: VLC에서 **오디오 → 오디오 트랙** 메뉴 확인
3. **로컬 재생 테스트**: 로컬 플레이어로 재생하여 파일 자체에 오디오가 있는지 확인

### 비디오가 검은 화면으로 표시됨
1. **GStreamer 플러그인**: gst-plugins-bad, gst-plugins-ugly 설치 확인
2. **코덱 지원**: 파일 형식이 지원되는지 확인
3. **하드웨어 가속**: 다른 비디오 싱크 시도 (설정 필요)

## 성능 최적화

### RTSP 스트리밍 설정
- **Bitrate**: 기본값 2000kbps (네트워크 상황에 따라 조절 가능)
- **Latency**: zerolatency 튜닝으로 저지연 최적화
- **Keyframe**: 30프레임마다 키프레임 생성

### 로컬 재생 설정
- **버퍼 크기**: 1MB (buffer-size: 1048576)
- **버퍼 시간**: 2초 (buffer-duration: 2000000000ns)

## 기여하기

버그 리포트, 기능 제안, 풀 리퀘스트를 환영합니다!

## 라이선스

이 프로젝트는 사용된 라이브러리의 라이선스를 따릅니다:
- GTK+: LGPL 2.1+
- GStreamer: LGPL 2.1+

## 버전 히스토리

### v1.0.0 (2026-04-24)
- ✅ RTSP 파일/웹캠 스트리밍
- ✅ 내장 비디오 플레이어
- ✅ H.264 + Opus 코덱
- ✅ 크로스 플랫폼 지원
- ✅ 자동 설치 스크립트
- ✅ 모듈화된 아키텍처

## 참고 자료

- [GStreamer Documentation](https://gstreamer.freedesktop.org/documentation/)
- [GTK Documentation](https://docs.gtk.org/gtk3/)
- [RTSP RFC 2326](https://datatracker.ietf.org/doc/html/rfc2326)
