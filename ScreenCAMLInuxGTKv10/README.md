# ScreenCAM — Linux GTK3 Screen Recorder

GTK3 기반의 Linux 화면 녹화 프로그램입니다.  
Wayland(Portal/PipeWire)와 X11(ximagesrc) 환경을 모두 지원합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **화면 캡처** | Wayland: XDG Desktop Portal + PipeWire · X11: ximagesrc |
| **창 캡처** | Wayland: Portal 대화상자에서 선택 · X11: 창 선택기 |
| **비디오 코덱** | H.265 / HEVC (기본, 고효율) · H.264 / AVC (호환성) |
| **오디오 녹음** | PulseAudio/PipeWire 마이크 입력, 음량 조절 |
| **저장 형식** | MKV (Opus 오디오) · MP4 (AAC 오디오) |
| **FPS 슬라이더** | 5 ~ 30 fps, 5 단위 눈금 + 직접 입력 |
| **해상도 비율** | 10 ~ 100%, 10 단위 눈금 + 직접 입력 |
| **녹화 중 GUI** | 설정만 비활성화, 로그·상태·중지 버튼은 항상 사용 가능 |
| **완료/오류 팝업** | 텍스트 복사 가능한 결과 다이얼로그 |

---

## 빌드

### 의존성 설치 (Debian / Ubuntu)

```bash
make deps
```

설치되는 패키지:

```
build-essential  pkg-config  libgtk-3-dev  libx11-dev  libglib2.0-dev
gstreamer1.0-tools  gstreamer1.0-plugins-base  gstreamer1.0-plugins-good
gstreamer1.0-plugins-bad  gstreamer1.0-plugins-ugly  gstreamer1.0-pipewire
libgstreamer1.0-dev  libgstreamer-plugins-base1.0-dev
```

### 빌드 및 실행

```bash
make          # 빌드 → ./screencam
make run      # 빌드 후 실행
make clean    # 빌드 산출물 삭제
```

---

## 파일 구조

```
ScreenCAMLInuxGTKv10/
├── Makefile
├── include/
│   ├── audio.h          # PulseAudio 장치 열거
│   ├── capture.h        # XDG Portal / PipeWire 획득
│   ├── gui_gtk.h        # GTK 앱 진입점
│   ├── gui_utils.h      # GTK 위젯 유틸리티 (CSS, 팝업 등)
│   ├── recorder.h       # GStreamer 녹화 파이프라인
│   └── window_picker.h  # X11 창 선택 다이얼로그
└── src/
    ├── main.cpp
    ├── gui_gtk.cpp      # GTK3 UI (앱 로직)
    ├── gui_utils.cpp    # CSS, make_frame, 결과 팝업
    ├── audio.cpp        # pactl 기반 마이크 목록
    ├── capture.cpp      # Portal DBus 세션 관리
    ├── recorder.cpp     # 파이프라인 후보 시도·녹화
    └── window_picker.cpp
```

---

## GStreamer 파이프라인

### Wayland (Portal + PipeWire)

여러 파이프라인 후보를 순서대로 시도하여 첫 번째로 동작하는 것을 사용합니다.

```
pipewiresrc fd=X path=Y autoconnect=true
  ! videoconvert ! video/x-raw,format=BGRx
  ! queue max-size-buffers=8
  ! videorate ! videoscale
  ! video/x-raw,format=I420,framerate=30/1
  ! x265enc speed-preset=ultrafast tune=zerolatency
  ! matroskamux ! filesink location="output.mkv"
```

### X11

```
ximagesrc use-damage=false
  ! videoconvert ! video/x-raw,format=I420
  ! queue max-size-buffers=8
  ! videorate ! videoscale
  ! video/x-raw,format=I420,framerate=30/1
  ! x265enc ... ! matroskamux ! filesink
```

### 오디오 추가 시 (MKV)

```
matroskamux name=mux ! filesink ...
  video_branch ! queue ! mux.
  pulsesrc ! audioconvert ! audioresample
    ! audio/x-raw,rate=48000,channels=2
    ! volume ! opusenc ! queue ! mux.
```

---

## 라이선스

MIT
