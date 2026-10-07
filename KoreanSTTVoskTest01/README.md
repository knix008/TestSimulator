# 한국어 음성 인식 (Vosk · C++)

Vosk 로 한국어 음성을 받아쓰는 C++ 프로그램입니다. 인식은 전부 내 컴퓨터에서
이루어지고, 인터넷은 설치할 때만 씁니다.

기본 설정은 **"출근"과 "퇴근"만** 받아쓰고, 그 둘을 각각 따로 세는 출퇴근 기록용
입니다. 받을 말은 창에서 바꿀 수 있고, 비우면 들리는 대로 모두 받아쓰는 일반
받아쓰기가 됩니다.

**GUI 와 인식 엔진이 완전히 분리**되어 있고, GUI 는 OS별로 갈라져 있습니다.
Windows · Linux · macOS 를 같은 소스에서 빌드합니다.

| 문서 | 내용 |
|---|---|
| [INSTALL.md](INSTALL.md) | 설치 — OS별 준비물, 빌드, 막힐 때 |
| [USERSGUIDE.md](USERSGUIDE.md) | 사용법 — GUI·CLI, 최소 권장 하드웨어, 인식 속도 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 설계 — 계층 구조, 스레드 모델, 늘리는 방법 |

---

## 빠른 시작

```powershell
# Windows
.\fetch_deps.ps1 -InstallSystemDeps
.\build.ps1
.\run.ps1
```

```bash
# Linux / macOS
./fetch_deps.sh --system-deps
./build.sh
./run.sh
```

---

## 구조

```
      kstt-gui-native     kstt-gui-gtk4      kstt-cli        kstt-tests
      Win32 / Cocoa          GTK4            (콘솔)          (코어만)
            └───────┬───────────┴───────┬────────┘                │
                    │                   │                         │
         createMicrophone()      SttEngine · AudioSource ──────────┘
                    │                   │
            ┌───────▼──────┐    ┌───────▼────────────────────────┐
            │  kstt_audio  │    │          kstt_core             │
            │ waveIn/ALSA/ │───▶│ 워커 스레드 · 결과 콜백         │
            │  CoreAudio   │    │ WAV · JSON · libvosk 동적 적재  │
            └──────────────┘    └───────────────┬────────────────┘
                                        dlopen / LoadLibrary
                                                │
                                        libvosk (.dll/.so/.dylib)
```

분리는 말이 아니라 빌드로 강제됩니다.

- `kstt_core` 는 GTK 도, 오디오 API 도, **libvosk 조차** 링크하지 않습니다
  (런타임에 동적 적재).
- `kstt-tests` 는 **코어만** 링크합니다. 코어가 GUI 나 마이크 코드에 기대면
  시험이 링크 단계에서 깨집니다.
- GUI 파일에는 인식 로직이 한 줄도 없고, 코어에는 위젯 코드가 한 줄도 없습니다.

OS별로 갈라지는 것은 두 군데뿐입니다.

| | Windows | Linux | macOS |
|---|---|---|---|
| 마이크 | waveIn | ALSA | CoreAudio |
| 네이티브 GUI | Win32 + 공용 컨트롤 | (GTK4 가 네이티브) | Cocoa |
| 이식 GUI | GTK4 | GTK4 | GTK4 |

---

## 빌드 선택지

```bash
./build.sh                 # 그 OS 의 네이티브 GUI (기본)
./build.sh --gui gtk4      # GTK4 판
./build.sh --gui all       # 둘 다
./build.sh --no-gui        # 코어 + CLI + 시험만
./build.sh --debug --clean

./clean.sh                 # 산출물 지우기
./clean.sh --deps          # 내려받은 libvosk·모델까지 (완전 초기화)
./clean.sh --dry-run       # 무엇을 지울지 보여만 준다
```

Windows 는 `.ps1` 쪽도 같습니다: `.\build.ps1 -Gui all`, `.\clean.ps1 -Deps`

실행 파일은 **프로젝트 루트**에 놓이고(`kstt-gui`, `kstt-cli`, `kstt-tests` 와
그 옆의 `libvosk`), 중간 산출물만 `build/` 안에 남습니다.

---

## 코어를 직접 쓰기

새 프런트엔드를 붙일 때 필요한 것은 이것뿐입니다.

```cpp
#include "kstt/stt_engine.h"
#include "kstt/platform/audio_input.h"

kstt::SttEngine engine;
engine.onPartial([](const std::string& text)        { /* 진행 중 */ });
engine.onFinal  ([](const kstt::Transcript& result) { /* 확정 문장 */ });

kstt::EngineConfig config;
config.modelPath = "models/vosk-model-small-ko-0.22";

std::string err;
if (engine.loadModel(config, &err) &&
    engine.start(kstt::platform::createMicrophone(), &err)) {
    // ... 인식 중 ...
    engine.stop();
}
```

콜백은 **엔진 워커 스레드**에서 불립니다. GUI 라면 자기 주 루프로 넘겨서 위젯을
만져야 합니다 — 자세한 내용은 [ARCHITECTURE.md](ARCHITECTURE.md) 5장.

---

## 받을 말 한정

```bash
./run.sh cli                              # 기본 — 출근 / 퇴근만
./run.sh cli --vocab "출근,퇴근,외출,복귀"   # 받을 말을 직접 지정
./run.sh cli --free                       # 한정 없이 자유 받아쓰기
```

왜 한정하는가: 자유 받아쓰기로는 작은 모델이 "출근"을 **"체육 은"** 으로 흘립니다.
받을 말을 정해 주면 인식기가 그 말들만 후보로 두어 정확히 잡습니다. 자세한 원리와
주의할 점은 [ARCHITECTURE.md](ARCHITECTURE.md) 8장.

---

## 시험

```bash
./test.sh        # Windows: .\test.ps1
```

JSON 파서(한글 UTF-8·`\uXXXX`), WAV 읽기·쓰기·표본율 변환, `AudioSource` 흐름과
취소, 엔진 오류 처리를 확인하고, 모델이 있으면 한국어 음원을 실제로 인식합니다.

---

## 알아 둘 점

- Windows 빌드는 MSYS2 **MINGW64**(MSVCRT 계열) g++ 를 씁니다. Vosk 공식 DLL 과
  런타임 계열을 맞추기 위해서입니다 — 이유는 [INSTALL.md](INSTALL.md) 1-1 과
  [ARCHITECTURE.md](ARCHITECTURE.md) 6장.
- `libvosk` 와 한국어 모델은 저장소에 포함되지 않습니다. `fetch_deps` 가
  [alphacep/vosk-api](https://github.com/alphacep/vosk-api) 와
  [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models) 에서 받아 옵니다.
  Vosk 는 Apache-2.0 입니다.
- macOS·Linux 코드는 작성되어 있으나, 개발 장비가 Windows 라 그 두 OS 에서의
  빌드·실행은 아직 확인되지 않았습니다.
