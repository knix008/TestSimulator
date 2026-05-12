# STT Korean – 한국어 실시간 음성 인식 (GTK3)

C/C++로 작성한 GTK3 기반 한국어 Speech-to-Text 데스크탑 애플리케이션입니다.  
마이크 실시간 입력과 동영상·오디오 파일 재생 중 동시 STT를 지원합니다.

## 기술 스택

| 역할 | 라이브러리 |
|------|-----------|
| STT 엔진 | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (정적 링크) |
| 오디오 캡처 | PortAudio |
| 동영상·오디오 재생 | GStreamer 1.0 |
| GUI | GTK3 |
| 모델 다운로드 | libcurl |
| Linux 오디오 장치 | PulseAudio/PipeWire (`pactl`) |

whisper.cpp · ggml 라이브러리는 정적 링크되어 실행 파일 하나로 배포됩니다.

## 파일 구조

```
STTGTKV10/
├── main.c                GTK·GStreamer 초기화 및 메인 루프
├── app_ui.h / .c         GTK UI (마이크·파일 입력, 비디오 영역, 버튼)
├── audio_capture.h / .c  PortAudio 마이크 캡처
├── stt_core.h / .cpp     whisper.cpp 래퍼 + VAD 기반 실시간 스트림
├── model_manager.h / .c  모델 다운로드 및 경로 관리
├── video_player.h / .c   GStreamer 동영상/오디오 플레이어
├── Makefile
└── test/
    ├── test_stt.c          STT 정확도 CLI 테스트
    ├── test_filter.cpp     필터 단위 테스트
    ├── run_tests.sh        전체 테스트 자동화 스크립트
    └── *.wav               한국어 테스트 오디오 (경비·출퇴근·문장 등)
```

GTK 의존 코드(`app_ui`, `main`, `video_player`)와 핵심 로직(`audio_capture`, `stt_core`, `model_manager`)이 분리되어 있습니다.

## 빌드 및 실행

```bash
# 의존성 설치 + whisper.cpp 빌드 + 앱 컴파일 (한 번에)
make

# 실행
make run
```

`make` 한 번으로 의존성 확인·설치, whisper.cpp 클론·빌드(정적), 앱 컴파일이 순서대로 진행됩니다.

### 의존성 개별 관리

```bash
make deps-check    # 현재 설치 상태 확인 (GStreamer 플러그인 포함)
make deps-install  # 전체 재설치
make clean         # 오브젝트 파일 및 바이너리 제거
make clean-all     # third_party/ 포함 전체 제거 (whisper.cpp 재빌드 필요)
```

### 의존성 목록

**Linux (Ubuntu/Debian)**
```
build-essential  g++  cmake  git  pkg-config  ca-certificates
libgtk-3-dev  portaudio19-dev  libcurl4-openssl-dev  pulseaudio-utils
libgstreamer1.0-dev  libgstreamer-plugins-base1.0-dev
gstreamer1.0-plugins-base  gstreamer1.0-plugins-good  gstreamer1.0-plugins-bad
gstreamer1.0-gtk3  gstreamer1.0-libav  gstreamer1.0-tools
```

**macOS (Homebrew)**
```
cmake  git  pkg-config  gtk+3  portaudio  curl
gstreamer  gst-plugins-base  gst-plugins-good  gst-plugins-bad  gst-libav
```

## 기능

### 마이크 실시간 STT
- VAD(음성 활동 감지) 기반 — 무음 700 ms 후 세그먼트 전송
- PulseAudio/PipeWire 소스 자동 열거 및 전환
- 프리롤 버퍼(~192 ms)로 단어 시작부 손실 방지

### 동영상 / 오디오 파일 STT
- MP4, MKV, AVI, MOV, WebM, MP3, WAV, AAC, OGG, FLAC 등 지원
- GStreamer 파이프라인으로 영상과 STT를 동시 처리
- 재생 제어: 일시정지 / 재생 (STT 동기 중단·재개)
- 시크바 드래그로 임의 위치 이동 — seek 시 이전 오디오 버퍼 자동 폐기 후 재시작
- 일시정지·재생 시 화면 중앙에 ▶ / ⏸ 아이콘 오버레이 표시
- 오디오 전용 파일은 파형 영역에 "오디오 재생 중" 안내 표시

### 공통
- 모델 선택 및 자동 다운로드 (Hugging Face, 진행률 표시)
- 결과 텍스트 클립보드 복사
- 정상 종료 시 백그라운드 스레드(STT 워커·GStreamer 파이프라인) 안전 정리

## UI 레이아웃

```
┌──────────────────────────────────────────┐
│  설정 (마이크, 모델, 다운로드)             │
├──────────────────────────────────────────┤  ← 구분선 드래그로 크기 조절 가능
│ ┌── 동영상 ──────────────────────────┐   │
│ │   (파일 미선택 시 안내 화면)         │   │
│ │   또는 실제 동영상 재생 영역         │   │
│ │                                    │   │
│ │  ⏸ 일시정지  [시크바──────]  0:00/5:23│ │
│ └────────────────────────────────────┘   │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ ┌── STT 결과 ─────────────────────────┐  │
│ │  실시간 인식된 텍스트...             │  │
│ └─────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  [▶ STT 시작]  [📂 파일 열기]  [지우기]  [복사] │
└──────────────────────────────────────────┘
```

## STT 처리 모드

STT 스트림은 입력 소스에 따라 두 가지 모드로 동작합니다.

| 파라미터 | 마이크 명령어 모드 | 파일 전사 모드 |
|----------|-----------------|--------------|
| `vad_thresh` | 0.015 | 0.030 |
| `min_speech_frames` | 8 (256 ms) | 12 (384 ms) |
| `no_speech_thold` | 0.35 | 0.85 |
| `logprob_thold` | −1.20 | −1.00 |
| `rms_normalize` 상한 | 8× | 3× |
| `initial_prompt` | 한국어 프롬프트 사용 | 사용 안 함 |

파일 모드에서 `initial_prompt`를 제거하고 `no_speech_thold`를 높인 이유:  
프롬프트가 있으면 Whisper가 무음·배경음에서도 한국어를 억지로 생성하여 환각이 발생합니다.

## 출력 필터 규칙

텍스트 세그먼트는 아래 조건을 모두 통과해야 출력됩니다.

| 규칙 | 예시 |
|------|------|
| `[...]` / `(...)` 시작 거부 | `[음악]`, `(박수)`, `[BLANK]` |
| `-` / `–` / `—` 시작 거부 | `-너는 안 돼.` (음악 환각 패턴) |
| 공백·탭만 거부 | |
| 한글 음절 또는 ASCII 영숫자 필수 | `…`, `♪`, `。` 등 단독 기호 거부 |
| Whisper 한국어 환각 패턴 거부 | `MBC 뉴스`, `KBS 뉴스`, `구독과 좋아요` 등 |
| 연속 중복 억제 | 직전 결과와 앞 10바이트 동일 시 차단 |

## 지원 모델

| 이름 | 크기 | 특징 |
|------|------|------|
| Tiny | ~75 MB | 가장 빠름 |
| Base | ~142 MB | 속도/정확도 균형 |
| Small | ~466 MB | **권장** – 한국어 최적 |
| Medium | ~1.5 GB | 고정확도 |
| Large-v3-Turbo | ~1.6 GB | 빠른 대형 모델 |
| Large-v3 | ~3.1 GB | 최고 정확도 |

모델 저장 위치:
- Linux: `~/.local/share/sttgtk/models/`
- macOS: `~/Library/Application Support/sttgtk/models/`

## 테스트

```bash
cd test

make test           # 빌드 + 전체 테스트 실행 (tiny 모델)
./run_tests.sh base # 특정 모델로 실행
```

`run_tests.sh`는 tiny · base · small 세 모델을 순차 실행하며, 필터 단위 테스트와 STT 통합 테스트(경비·출퇴근·문장·짧은 명령어 등 24개 케이스)를 자동화합니다.

### 테스트 결과 (Ubuntu 24.04, CPU 전용)

```
  필터      ✓  35 / 35
  ──────────────────────────
  tiny      ✓  24 / 24
  base      ✓  24 / 24
  small     ✓  24 / 24
  ──────────────────────────
  전체      ✓  73 / 73
```

각 케이스에는 소요 시간이 함께 표시됩니다.

| 모델 | 평균 소요 시간 |
|------|--------------|
| tiny | 0.3 – 1.4 s |
| base | 0.5 – 1.3 s |
| small | 1.4 – 2.3 s |
