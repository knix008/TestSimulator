# TTS Simulator

GTK3 기반 Text-to-Speech 시뮬레이터 (C11)

## 주요 기능

- **다중 TTS 엔진 선택** — eSpeak-NG (기본), Festival (설치 시 자동 감지)
- **텍스트 입력** — 직접 입력 또는 `.txt` 파일 불러오기
- **파라미터 조정** — 속도(WPM), 피치
- **실시간 파형 표시** — 합성 결과를 Cairo로 렌더링, 재생 위치 커서
- **볼륨 제어** — 슬라이더로 실시간 조절
- **파일 저장** — WAV / MP3 형식으로 내보내기
- **백그라운드 합성** — UI 블로킹 없이 별도 스레드에서 합성

## 아키텍처

GTK 의존 코드와 비즈니스 로직을 명확히 분리합니다.

```
src/
├── main.c              # 진입점 (GTK/GStreamer 초기화만)
│
├── app.h / app.c       # GTK 없음 — 엔진 관리, 합성 스레드, 재생 오케스트레이션
├── tts_engine.h / .c   # GTK 없음 — AudioData 구조체 및 엔진 인터페이스 정의
├── tts_espeak.h / .c   # GTK 없음 — eSpeak-NG C 라이브러리 엔진
├── tts_festival.h / .c # GTK 없음 — Festival (text2wave CLI 기반)
├── audio_player.h / .c # GTK 없음 — GStreamer appsrc 파이프라인, 볼륨, 위치 추적
├── file_saver.h / .c   # GTK 없음 — WAV (libsndfile), MP3 (LAME) 저장
│
├── ui.h / ui.c         # GTK 전용 — 모든 위젯 생성 및 시그널 핸들러
└── waveform_widget.h/c # GTK 전용 — Cairo 파형 그리기 위젯
```

새 TTS 엔진을 추가할 때는 `tts_*.h/.c` 파일만 작성하고 `app.c`의 `app_new()`에 등록하면 됩니다. GTK 코드를 건드릴 필요가 없습니다.

## 빌드

### 1. 의존성 설치

```bash
./install_deps.sh
```

수동으로 설치하려면:

```bash
sudo apt install -y \
    build-essential cmake pkg-config \
    libgtk-3-dev \
    libespeak-ng-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libsndfile1-dev \
    libmp3lame-dev \
    gstreamer1.0-plugins-good \
    gstreamer1.0-pulseaudio
```

Festival을 추가로 지원하려면:

```bash
sudo apt install festival festvox-kallpc16k
```

### Piper TTS 설치 (한국어 고품질)

```bash
./download_ko_model.sh
```

이 스크립트가 자동으로 처리합니다:
1. `pip install piper-tts` 로 piper 바이너리 설치
2. `~/.local/share/piper/` 에 한국어 모델 다운로드

수동으로 설치하려면:
```bash
pip install piper-tts
mkdir -p ~/.local/share/piper

# medium 품질 (권장, ~63 MB)
wget -P ~/.local/share/piper \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx.json
```

### 2. 빌드

```bash
./build.sh
```

또는 직접:

```bash
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

### 3. 실행

```bash
./build/tts_simulator
```

## 사용법

1. **엔진 선택** — 드롭다운에서 TTS 엔진을 선택합니다.
2. **음성 선택** — 선택한 엔진에서 사용 가능한 음성 목록이 자동으로 채워집니다.
3. **텍스트 입력** — 텍스트 영역에 직접 입력하거나 `파일에서 텍스트 불러오기`로 `.txt` 파일을 엽니다.
4. **합성** — `합성 (Synthesize)` 버튼을 누릅니다. 백그라운드에서 실행되며 완료 후 파형이 표시됩니다.
5. **재생** — `▶ 재생` 버튼으로 재생합니다. 볼륨 슬라이더로 조절할 수 있습니다.
6. **저장** — `WAV 저장` 또는 `MP3 저장` 버튼으로 파일을 내보냅니다.

## 의존 라이브러리

| 라이브러리 | 용도 |
|-----------|------|
| GTK 3 | GUI 프레임워크, Cairo 파형 렌더링 |
| GStreamer (gstreamer-1.0, gstreamer-app-1.0) | 오디오 재생 파이프라인 |
| eSpeak-NG (libespeak-ng-dev) | 기본 TTS 합성 엔진 |
| libsndfile | WAV 파일 저장 |
| LAME (libmp3lame-dev) | MP3 인코딩 |
| Festival / text2wave | 선택적 TTS 엔진 |
| Piper TTS (`piper-tts`) | 선택적 고품질 신경망 TTS 엔진 (한국어 지원) |

## 새 TTS 엔진 추가 방법

1. `src/tts_myengine.h/.c` 파일을 작성하고 `TTSEngine` 인터페이스를 구현합니다:

```c
// tts_engine.h 의 인터페이스
struct TTSEngine {
    const char   *name;
    bool  (*init)       (TTSEngine *self);
    bool  (*synthesize) (TTSEngine *self, const char *text, const char *voice,
                         int speed, int pitch, AudioData **out);
    const char **(*get_voices) (TTSEngine *self, int *count);
    void  (*cleanup)    (TTSEngine *self);
    void  *priv;
};
```

2. `src/app.c`의 `app_new()` 함수에 등록합니다:

```c
TTSEngine *myengine = tts_myengine_new();
if (myengine->init(myengine))
    app->engines[app->engine_count++] = myengine;
else
    myengine->cleanup(myengine);
```

3. `CMakeLists.txt`의 `SOURCES`에 `src/tts_myengine.c`를 추가합니다.
