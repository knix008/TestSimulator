# 한국어 음성 인식 (Vosk · C++)

Vosk 로 한국어 음성을 받아쓰는 C++ 프로그램입니다. 인식은 전부 내 컴퓨터에서
이루어지고, 인터넷은 설치할 때만 씁니다.

인식은 두 갈래입니다.

- **Vosk 문법.** 기본으로 **출근, 퇴근, 경비, 해제**만 받아쓰고 각각 따로 셉니다.
  받을 말은 창에서 바꿀 수 있고, 비우면 들리는 대로 모두 받아쓰는 일반
  받아쓰기가 됩니다. 모델이 모르는 말은 후보에 넣을 수 없습니다.
- **키워드 모델.** 창에서 말을 녹음해 학습하면 한 파일(`.kmodel`)이 됩니다.
  Vosk 음향 모델(약 253MB)을 쓰지 않고, 그 파일만 다른 장치로 복사해 다시
  씁니다. 목록에 없는 말도 녹음하면 넣을 수 있습니다.

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
            │ waveIn/ALSA/ │───▶│ SttEngine (Vosk) · KeywordModel │
            │  CoreAudio   │    │ WAV · JSON · libvosk 동적 적재  │
            └──────────────┘    └───────────────┬────────────────┘
                                        dlopen / LoadLibrary
                                                │
                                        libvosk (.dll/.so/.dylib)
                                 (키워드 모델 경로는 libvosk 를 열지 않음)
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

Windows 는 `.ps1` 쪽도 같습니다.

```powershell
.\build.ps1                 # Win32 네이티브 GUI (기본)
.\build.ps1 -Gui all
.\build.ps1 -Debug -Clean   # clean.ps1 과 같은 범위를 지우고 다시 빌드
.\clean.ps1                 # build\ + 루트의 실행 파일·런타임 DLL
.\clean.ps1 -DryRun         # 지울 항목만 표시
.\clean.ps1 -Deps           # 위에 더해 third_party\ 와 models\
```

`clean` 은 녹음이 들어 있는 `keyword-workspace\` 와 `.kmodel` 파일은 지우지
않습니다. 실행 파일은 **프로젝트 루트**에 놓이고(`kstt-gui`, `kstt-cli`,
`kstt-tests` 와 그 옆의 `libvosk`), 중간 산출물만 `build/` 안에 남습니다.

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

## 받을 말 한정 (Vosk)

```bash
./run.sh cli                                 # 기본 — 출근, 퇴근, 경비, 해제
./run.sh cli --vocab "출근,퇴근,외출,복귀"      # 받을 말을 직접 지정
./run.sh cli --free                          # 한정 없이 자유 받아쓰기
```

왜 한정하는가: 자유 받아쓰기로는 작은 모델이 "출근"을 **"체육 은"** 으로 흘립니다.
받을 말을 정해 주면 인식기가 그 말들만 후보로 두어 정확히 잡습니다. 모델 사전에
없는 말은 이 경로로 넣을 수 없습니다. 자세한 원리와 주의할 점은
[ARCHITECTURE.md](ARCHITECTURE.md) 8장.

## 키워드 모델

창의 **키워드** 칸에서 말을 추가하고, 말마다 **녹음**한 뒤 **학습**을 누릅니다.
끝나면 저장 경로와 파일 크기가 적힌 완료 창이 뜹니다. 결과 파일
`keyword-workspace/model.kmodel` 만 복사해도 되고, **장치에 저장…** 으로 원하는
곳에 둘 수 있습니다. 학습이 끝나면 이 프로그램의 인식도 그 파일을 사용하고,
Vosk 모델은 메모리에서 내려갑니다. **초기화** 는 말 목록을 남기고 녹음과
`model.kmodel` 만 지웁니다.

```bash
./run.sh cli --keywords keywords.kmodel
./run.sh cli --keywords keywords.kmodel --wav 녹음.wav
```

학습용 파이썬이나 별도 설치 스크립트는 없습니다. 설계는
[ARCHITECTURE.md](ARCHITECTURE.md) 9장, 화면 순서는
[USERSGUIDE.md](USERSGUIDE.md) 7장.

---

## 시험

```bash
./test.sh        # Windows: .\test.ps1
```

JSON 파서(한글 UTF-8·`\uXXXX`), WAV 읽기·쓰기·표본율 변환, `AudioSource` 흐름과
취소, 엔진 오류 처리, 키워드 모델의 학습·저장·다시 읽기를 확인하고, Vosk 모델이
있으면 한국어 음원을 실제로 인식합니다.

---

## 알아 둘 점

- Windows 빌드는 MSYS2 **MINGW64**(MSVCRT 계열) g++ 를 씁니다. Vosk 공식 DLL 과
  런타임 계열을 맞추기 위해서입니다 — 이유는 [INSTALL.md](INSTALL.md) 1-1 과
  [ARCHITECTURE.md](ARCHITECTURE.md) 6장.
- `libvosk` 와 한국어 모델은 저장소에 포함되지 않습니다. `fetch_deps` 가
  [alphacep/vosk-api](https://github.com/alphacep/vosk-api) 와
  [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models) 에서 받아 옵니다.
  Vosk 는 Apache-2.0 입니다.
- 키워드 학습 화면은 Windows 네이티브 창과 GTK4 창에 있습니다. macOS Cocoa 창에는
  아직 없고, 콘솔의 `--keywords` 는 코어에 있어 그 빌드에서도 파일을 엽니다.
- macOS·Linux 코드는 작성되어 있으나, 개발 장비가 Windows 라 그 두 OS 에서의
  빌드·실행은 아직 확인되지 않았습니다.
