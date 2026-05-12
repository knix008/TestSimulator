# STT Korean – 한국어 실시간 음성 인식 (GTK3)

C/C++로 작성한 GTK3 기반 한국어 실시간 Speech-to-Text 데스크탑 애플리케이션입니다.

## 기술 스택

| 역할 | 라이브러리 |
|------|-----------|
| STT 엔진 | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (OpenAI Whisper C++ 구현체) |
| 오디오 캡처 | PortAudio (Linux/macOS 공통) |
| GUI | GTK3 |
| 모델 다운로드 | libcurl |
| Linux 오디오 장치 | PulseAudio/PipeWire (`pactl`) |

## 파일 구조

```
SttGTKV10/
├── main.c              GTK 초기화 및 메인 루프
├── app_ui.h / .c       GTK UI (마이크·모델 선택, 버튼, 텍스트창)
├── audio_capture.h/.c  PortAudio 마이크 캡처 (GTK 비의존)
├── stt_core.h / .cpp   whisper.cpp 래퍼 + 실시간 스트림 (GTK 비의존)
├── model_manager.h/.c  모델 다운로드 및 경로 관리 (GTK 비의존)
├── Makefile
└── test/
    ├── test_stt.c        STT 정확도 CLI 테스트
    ├── test_filter.cpp   필터 단위 테스트
    └── *.wav             한국어 테스트 오디오
```

> GTK 의존 코드(`app_ui`, `main`)와 핵심 로직(`audio_capture`, `stt_core`, `model_manager`)이 완전히 분리되어 있습니다.

## 빌드 및 실행

```bash
# 의존성 설치 + whisper.cpp 빌드 + 앱 컴파일 (한 번에)
make

# 실행
make run
```

`make` 한 번으로 의존성 확인·설치, whisper.cpp 클론·빌드, 앱 컴파일이 순서대로 진행됩니다.

### 의존성 개별 관리

```bash
make deps-check    # 현재 설치 상태 확인
make deps-install  # 전체 재설치
```

### 의존성 목록

**Linux (Ubuntu/Debian)**
```
build-essential  g++  cmake  git  pkg-config  ca-certificates
libgtk-3-dev  portaudio19-dev  libcurl4-openssl-dev  pulseaudio-utils
```

**macOS**
```
cmake  git  pkg-config  gtk+3  portaudio  curl
```

### 빌드 단계별 메시지 예시

```
━━━ [1/3] 의존성 확인 및 설치 ━━━━━
  모든 의존성이 이미 설치되어 있습니다.

━━━ [2/3] whisper.cpp 라이브러리 빌드 ━━━
  whisper.cpp 라이브러리가 이미 빌드되어 있습니다.

━━━ [3/3] 애플리케이션 빌드 ━━━━━━━━
  [컴파일]  main.c
  [컴파일]  app_ui.c
  [링크]    sttgtk
  [완료]    ./sttgtk
```

## 기능

- **실시간 STT**: 말이 끝나면 즉시 인식 (VAD 기반, 무음 700 ms 후 처리)
- **마이크 선택**: PulseAudio/PipeWire 소스 자동 열거 및 전환
- **모델 선택 및 자동 다운로드**: Hugging Face에서 진행률 표시와 함께 백그라운드 다운로드
- **한국어 고정**: `params.language = "ko"`, 한국어 initial prompt 항상 적용
- **결과 필터**: 무음·메타데이터(`[음악]`, `♪`, `…` 등) 자동 제거
- **클립보드 복사**: "복사" 버튼

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

## 한국어 최적화

| 최적화 | 내용 |
|--------|------|
| Beam Search | `beam_size=5` (greedy 대비 정확도 향상) |
| Pre-emphasis | `y[n] = x[n] − 0.97·x[n−1]` (자음 명료도 향상) |
| RMS 정규화 | 마이크 게인 차이 보정 |
| Korean Prompt | `"다음은 한국어 음성입니다."` 항상 prepend |
| no_speech_thold | 0.60 → 0.35 (짧은 명령어 인식 개선) |
| 무음 패딩 | 1초 미만 오디오 자동 패딩 |

## 출력 필터 규칙

텍스트 세그먼트는 아래 조건을 모두 통과해야 출력됩니다.

1. `[...]` / `(...)` 형태로 시작하지 않을 것
2. 공백·탭만으로 이루어지지 않을 것
3. **한글 음절(U+AC00–D7A3) 또는 ASCII 영숫자가 하나 이상** 포함될 것

이 규칙으로 `[음악]`, `(박수)`, `…`, `♪`, `♫`, `。`, 공백 전용 등이 자동으로 걸러집니다.

---

## 테스트 결과

테스트 환경: Ubuntu 24.04 LTS, CPU only (GPU 없음)

### 필터 단위 테스트 (`test/test_filter.cpp`)

```
  입력              기대    결과    판정
  ─────────────────────────────────────────────
  [음악]            REJECT  REJECT  ✓
  [BLANK]           REJECT  REJECT  ✓
  [무음]            REJECT  REJECT  ✓
  (박수)            REJECT  REJECT  ✓
  (noise)           REJECT  REJECT  ✓
  ...               REJECT  REJECT  ✓
  … (U+2026)        REJECT  REJECT  ✓
  ♪ (U+266A)        REJECT  REJECT  ✓
  ♫ (U+266B)        REJECT  REJECT  ✓
  。 (CJK 마침표)   REJECT  REJECT  ✓
  · (가운뎃점)      REJECT  REJECT  ✓
  (공백)            REJECT  REJECT  ✓
  출근합니다.       PASS    PASS    ✓
  경비를 해제합니다. PASS   PASS    ✓
  3번 출구          PASS    PASS    ✓
  OK 확인           PASS    PASS    ✓
  ... (총 35개)
  결과: 35 / 35 통과
```

### STT 정확도 테스트 (`test/test_stt.c`)

테스트 케이스 21개 (출근·퇴근·경비·해제 어휘 + 짧은 단어 + 문장)

| 모델 | 정확도 | 비고 |
|------|--------|------|
| Tiny (~75 MB) | **21/21 (100%)** | 단음절 "네", "예" 포함 |
| Base (~142 MB) | **21/21 (100%)** | |
| Small (~466 MB) | **21/21 (100%)** | |

### 대표 인식 결과 (Small 모델)

| 입력 음성 | 인식 결과 |
|-----------|----------|
| 출근합니다. | 출근합니다. |
| 퇴근 처리를 해주세요. | 퇴근 처리를 해주세요. |
| 경비를 해제합니다. | 경비를 해제합니다. |
| 경비 설정입니다. | 경비 설정입니다. |
| 출근 (단어) | 출근 |
| 퇴근 (단어) | 퇴근 |
| 해제 (단어) | 해제 |
| 경비 (단어) | 경비 |
| 네 (단어) | 네. |
| 예 (단어) | 예. |
| 지금 출근 처리해 주세요. | 지금 출근 처리해주세요. |
| 경비 해제 후 출입문을 열어 주세요. | 경비, 해제 후, 출입문을 열어주세요. |

---

## 기타

```bash
# 오브젝트 파일 및 바이너리 제거
make clean

# third_party/ 포함 전체 제거 (whisper.cpp 재빌드 필요)
make clean-all
```
