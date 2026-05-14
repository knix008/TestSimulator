# TTS Simulator

GTK3 기반 Text-to-Speech 시뮬레이터 (C11)  
Sherpa-ONNX VITS 모델을 직접 로드하는 임베디드 친화적 구조.

## 주요 기능

- **Sherpa-ONNX** — ONNX Runtime C API 직접 사용, 외부 바이너리 불필요
- **eSpeak-NG** — 폴백 엔진, 항상 사용 가능
- **▶ 재생 버튼** — 합성과 재생을 한 번에 처리 (파라미터 변경 시 자동 재합성)
- **실시간 파형** — 재생 중 파형이 왼쪽으로 스크롤, 재생 위치 고정 표시
- **파라미터 조정** — 속도 배율(×0.25–×4.0), 피치 배율(×0.5–×2.0)
- **파일 저장** — WAV / MP3 형식으로 내보내기
- **ARM 크로스컴파일** — aarch64 / armhf 대상 빌드 지원

## 빠른 시작

```bash
# 처음 설치 (호스트 x86_64)
make setup           # 의존성 + Sherpa 라이브러리 + 한국어 모델 + 빌드

# 실행
make run
```

## Makefile 타겟

```
make                  — 의존성 검사 + 빌드 (기본)
make setup            — 전체 설치 (deps + sherpa-lib + sherpa-model + build)
make deps             — 시스템 패키지 설치 (Linux: apt, macOS: brew)
make check-deps       — 필수 라이브러리 확인
make build            — 소스 컴파일
make sherpa-lib       — 사전 빌드 Sherpa-ONNX 라이브러리 다운로드 → deps/sherpa-onnx/
make sherpa-from-src  — Sherpa-ONNX 소스 클론 후 직접 빌드
make sherpa-model     — 한국어 VITS 모델 다운로드 → models/
make cross-deps       — ARM 크로스컴파일러 설치 (Linux)
make install          — 바이너리 설치 (기본: /usr/local/bin)
make run              — 한국어 로케일로 실행
make clean            — 빌드 결과물 삭제
make distclean        — 빌드 + 모델 + 라이브러리 + 소스 전체 삭제
```

오버라이드 옵션:

```bash
make setup ARCH=aarch64              # ARM64 전체 빌드
make setup ARCH=armhf                # ARM32 전체 빌드
make sherpa-from-src ARCH=aarch64    # ARM64용 소스 빌드
make build ARCH=aarch64 SYSROOT=/path/to/sysroot
make install PREFIX=/usr
```

### 수동 설치 (Linux)

```bash
sudo apt install -y \
    build-essential cmake git pkg-config \
    libgtk-3-dev libespeak-ng-dev \
    libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
    libsndfile1-dev libmp3lame-dev \
    gstreamer1.0-plugins-good gstreamer1.0-pulseaudio

make sherpa-lib sherpa-model build
./gtktts
```

### macOS (Homebrew)

```bash
brew install pkg-config cmake git gtk+3 espeak-ng \
    gstreamer gst-plugins-base gst-plugins-good \
    libsndfile lame

make sherpa-lib sherpa-model build
./gtktts
```

### Sherpa-ONNX 소스 빌드

사전 빌드 바이너리 대신 직접 컴파일할 경우:

```bash
make deps              # cmake, git 포함 설치
make sherpa-from-src   # 소스 클론 + 빌드 (수 분 소요)
make sherpa-model
make build
```

## ARM 크로스컴파일

```bash
# 크로스컴파일러 설치
make cross-deps

# ARM64 (aarch64) 빌드
make setup ARCH=aarch64

# ARM32 (armhf) 빌드
make setup ARCH=armhf

# sysroot 지정 (선택)
make build ARCH=aarch64 SYSROOT=/opt/sysroot-aarch64
```

| ARCH | 크로스컴파일러 | Sherpa 사전 빌드 태그 |
|------|--------------|----------------------|
| `native` (기본) | 호스트 cc | `linux-x64-shared-lib` |
| `aarch64` | `aarch64-linux-gnu-cc` | `linux-aarch64-shared` |
| `armhf` | `arm-linux-gnueabihf-cc` | `linux-arm-gnueabihf-shared` |

## 사용법

1. **엔진 선택** — Sherpa-ONNX (기본) 또는 eSpeak-NG
2. **텍스트 입력** — 텍스트 영역에 입력하거나 파일 불러오기
3. **파라미터 설정** — 속도·피치 슬라이더 조정 (변경 즉시 다음 재생에 적용)
4. **▶ 재생** — 합성 후 자동 재생. 텍스트/파라미터 변경 시 자동 재합성
5. **파형 확인** — 재생 중 파형이 왼쪽으로 스크롤, 재생 위치 붉은 선으로 표시
6. **저장** — WAV 또는 MP3로 내보내기

## 파라미터

| 슬라이더 | 범위 | 기본값 | 설명 |
|---------|------|--------|------|
| 속도 (×) | ×0.25 – ×4.0 | **×1.00** | 1.0 = 정상 속도. Sherpa: `gen.speed` + 리샘플링 후처리. eSpeak: 175 WPM 기준 |
| 피치 (×) | ×0.5 – ×2.0 | **×1.00** | 1.0 = 원음. Sherpa: 선형 보간 리샘플링. eSpeak: `espeakPITCH` (50 기준) |

> 속도·피치 모두 슬라이더 변경 후 다음 ▶ 재생 클릭 시 자동 재합성됩니다.

## 아키텍처

```
src/
├── main.c              # 진입점
├── app.c / app.h       # 엔진 관리, 합성 스레드
├── tts_engine.h        # TTSEngine 인터페이스
├── tts_sherpa.c/h      # Sherpa-ONNX VITS (주 엔진)
├── tts_espeak.c/h      # eSpeak-NG (폴백)
├── tts_engine.c        # AudioData 헬퍼
├── audio_player.c/h    # GStreamer 재생
├── file_saver.c/h      # WAV/MP3 저장
├── ui.c/h              # GTK 위젯
└── waveform_widget.c/h # Cairo 파형 (스크롤링)

deps/sherpa-onnx/       # Sherpa-ONNX 라이브러리 (make sherpa-lib 또는 sherpa-from-src)
deps/sherpa-onnx-src/   # Sherpa-ONNX 소스 (make sherpa-from-src 시 생성)
models/                 # ONNX 모델 파일 (make sherpa-model)
```

## 새 엔진 추가

1. `src/tts_myengine.h/.c`에 `TTSEngine` 인터페이스 구현
2. `src/app.c`의 `app_new()`에 등록
3. `Makefile`의 `SRCS`에 `src/tts_myengine.c` 추가

## 의존 라이브러리

| 라이브러리 | 용도 |
|-----------|------|
| Sherpa-ONNX | VITS ONNX 추론 엔진 (C API) |
| ONNX Runtime | Sherpa-ONNX 내장 |
| GTK 3 | GUI, Cairo 파형 렌더링 |
| GStreamer | 오디오 재생 파이프라인 |
| eSpeak-NG | 폴백 TTS 엔진 |
| libsndfile | WAV 파일 저장 |
| LAME | MP3 인코딩 |

## 라이선스

### 이 프로젝트 소스 코드

MIT License — 자유롭게 사용, 수정, 배포 가능합니다.

### 사용 모델 (`vits-mimic3-ko_KO-kss_low`)

| 구성 요소 | 라이선스 | 참고 |
|-----------|----------|------|
| **KSS 데이터셋** (학습 데이터) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Kyungmin Lee 제작; 출처 표기 시 상업적 사용 가능 |
| **VITS 모델 아키텍처** | [MIT License](https://github.com/jaywalnut310/vits/blob/main/LICENSE) | jaywalnut310/vits |
| **Mimic3 학습 코드** | [Apache 2.0](https://github.com/MycroftAI/mimic3/blob/master/LICENSE) | MycroftAI/mimic3 |
| **ONNX 변환 및 배포** | [Apache 2.0](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE) | k2-fsa/sherpa-onnx |

모델 원본: [MycroftAI/mimic3-voices — ko_KO/kss_low](https://github.com/MycroftAI/mimic3-voices/tree/master/voices/ko_KO/kss_low)

### 의존 라이브러리 라이선스

| 라이브러리 | 라이선스 |
|-----------|----------|
| eSpeak-NG | **GPL v3** — 링크 시 소스 공개 의무 발생 가능 |
| GTK 3 | LGPL v2.1 |
| GStreamer | LGPL v2.0 |
| ONNX Runtime | MIT |
| libsndfile | LGPL v2.1 |
| LAME (MP3) | LGPL v2 |

> **배포 시 주의:** eSpeak-NG는 GPL v3 라이선스입니다. 이 앱을 바이너리 형태로 배포할 경우
> GPL 조건에 따라 전체 소스 코드를 공개해야 할 수 있습니다. 임베디드 폐쇄 환경에서는
> eSpeak-NG를 제외하고 Sherpa-ONNX 단독 사용을 고려하세요.
