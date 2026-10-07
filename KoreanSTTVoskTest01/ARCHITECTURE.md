# 설계 문서

이 프로그램을 고치거나 다른 플랫폼·다른 GUI 로 옮기려는 개발자를 위한 문서입니다.

- 설치는 [INSTALL.md](INSTALL.md)
- 사용법은 [USERSGUIDE.md](USERSGUIDE.md)

---

## 1. 설계 목표

1. **STT 와 GUI 의 완전한 분리.** 인식 엔진은 GUI 를 전혀 모르고, GUI 는 인식
   방법을 전혀 모른다.
2. **OS별로 갈라지는 것은 두 군데뿐** — 오디오 입력과 GUI. 그 밖의 코드는 세 OS
   에서 똑같이 쓰인다.
3. **빌드가 분리를 강제한다.** 말로만 분리된 것이 아니라, 경계를 어기면 링크가
   깨지도록 타깃을 쪼갰다.

---

## 2. 전체 그림

```
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │ kstt-gui-    │  │ kstt-gui-    │  │  kstt-cli    │  │  kstt-tests  │
      │   native     │  │   gtk4       │  │   (콘솔)     │  │  (단위시험)  │
      │ Win32/Cocoa  │  │   GTK4       │  │              │  │              │
      └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
             │                 │                 │                 │
             └────────┬────────┴────────┬────────┘                 │
                      │                 │                          │
          kstt::platform::createMicrophone()      kstt::SttEngine · AudioSource
                      │                 │                          │
             ┌────────▼────────┐        └──────────┬───────────────┘
             │   kstt_audio    │                   │
             │ waveIn / ALSA / │                   │
             │   CoreAudio     │───── AudioSource 구현 ──┐
             └─────────────────┘                   │     │
                                          ┌────────▼─────▼────────┐
                                          │       kstt_core       │
                                          │  SttEngine (워커 스레드)│
                                          │  AudioSource (인터페이스)│
                                          │  WavFileSource         │
                                          │  JSON 파서 · 경로 탐색 │
                                          │  VoskLibrary (동적 적재)│
                                          └───────────┬───────────┘
                                                      │ dlopen / LoadLibrary
                                               ┌──────▼──────┐
                                               │  libvosk    │
                                               │ (.dll/.so/  │
                                               │  .dylib)    │
                                               └─────────────┘
```

### 타깃이 분리를 강제하는 방식

| 타깃 | 링크하는 것 | 링크하지 **않는** 것 |
|---|---|---|
| `kstt_core` | 표준 라이브러리, 스레드, `dl` | GTK, Win32 GUI, Cocoa, 오디오 API, **libvosk 조차** |
| `kstt_audio` | `kstt_core` + winmm / ALSA / AudioToolbox | GUI 전부 |
| `kstt-gui-native` | core + audio + (comctl32 / Cocoa) | GTK |
| `kstt-gui-gtk4` | core + audio + gtk4 | Win32 GUI, Cocoa |
| `kstt-cli` | core + audio | GUI 전부 |
| `kstt-tests` | **`kstt_core` 만** | 오디오, GUI 전부 |

마지막 줄이 핵심이다. 코어가 어느 날 슬그머니 GUI 나 마이크 코드에 기대면
`kstt-tests` 가 **링크 단계에서 깨진다**. 분리가 지켜지는지 사람이 눈으로
확인할 필요가 없다.

---

## 3. 디렉터리

```
core/include/kstt/      공개 헤더 — 프런트엔드가 보는 전부
  types.h               Transcript, Word, EngineState, EngineConfig, AudioDevice
  audio_source.h        오디오 입력 추상 인터페이스
  stt_engine.h          엔진 공개 API
  wav_file.h            WAV 읽기·쓰기 + WavFileSource
  text_width.h          UTF-8 보이는 폭(한글 2칸) — 콘솔 표 정렬용
core/src/               구현 (내부 전용 헤더 포함)
  stt_engine.cpp        워커 스레드, 결과 해석, 상태 기계
  vosk_bind.{h,cpp}     libvosk 런타임 적재 + 함수 포인터
  json_light.{h,cpp}    최소 JSON 파서 (의존성 0)
  paths.{h,cpp}         실행 파일 위치, 모델·라이브러리 자동 탐색
  wav_file.cpp          RIFF 파싱, 모노 다운믹스, 선형 리샘플
  word_filter.{h,cpp}   발화 구간 검출·신뢰도 거르기·안정 접두사·어휘 거르기
  vocabulary.cpp        받을 말 목록·문법 JSON (공개 헤더 kstt/vocabulary.h)
  decoy_words.inc       문법에 함께 넣는 미끼 낱말 (8장)
  text_width.cpp
platform/include/kstt/platform/
  audio_input.h         createMicrophone() / inputDevices() 팩토리
platform/windows/       waveIn (winmm)
platform/linux/         ALSA (libasound)
platform/macos/         CoreAudio AudioQueue
app/cli/                콘솔 프런트엔드
app/gui/windows/        Win32 + 공용 컨트롤 (+ 매니페스트)
app/gui/macos/          Cocoa (Objective-C++)
app/gui/gtk4/           GTK4 (세 OS 공통)
tests/                  코어 단위·종단 시험
scripts/                시험 음원 생성기
```

빌드·실행 스크립트(`fetch_deps` · `build` · `run` · `test` · `clean`, `.sh`/`.ps1`)는
루트에 있다. 빌드 결과인 실행 파일도 루트에 놓이고(`CMAKE_RUNTIME_OUTPUT_DIRECTORY`),
중간 산출물만 `build/` 에 남는다. 그래서 `clean` 은 `build/` 뿐 아니라 루트의
실행 파일·런타임 DLL 도 지운다 — 다만 루트에서 지우는 일이므로 와일드카드로
쓸어내지 않고 **알려진 이름만** 확인해 지운다.

---

## 4. 핵심 추상 두 개

### 4-1. `AudioSource` — 입력을 당겨 오는 쪽

```cpp
class AudioSource {
public:
    virtual bool open(int sampleRate, std::string* err) = 0;
    virtual void close() = 0;
    virtual int  read(int16_t* dst, int maxSamples) = 0;  // >0 표본 수, 0 끝, <0 오류
    virtual void cancel() {}                               // 블로킹 read 를 깨운다
    virtual std::string name() const = 0;
    virtual bool isLive() const = 0;
};
```

**당기기(pull) 모델**을 고른 이유: 엔진이 자기 속도로 읽으면 되므로 코어에 링
버퍼나 생산자-소비자 큐가 필요 없다. 밀어 주는(push) API 인 CoreAudio 쪽만
자기 안에서 큐를 두어 당기기로 바꿔 준다.

구현체는 셋:

| 구현 | 위치 | 비고 |
|---|---|---|
| `WavFileSource` | core | 파일. 테스트가 마이크 없이 엔진 전체를 돌릴 수 있는 이유 |
| `WaveInSource` | platform/windows | `waveInOpen(CALLBACK_EVENT)` + 8×100ms 버퍼 |
| `AlsaSource` | platform/linux | `snd_pcm_wait` 100ms 타임아웃으로 취소를 받는다 |
| `CoreAudioSource` | platform/macos | AudioQueue 콜백 → 뮤텍스 큐 → `read()` |

마이크 구현은 밖에서 직접 쓰지 않고 팩토리로만 꺼낸다. 그래서 프런트엔드
코드는 OS 가 바뀌어도 한 글자도 달라지지 않는다.

```cpp
std::vector<AudioDevice> kstt::platform::inputDevices();
std::shared_ptr<AudioSource> kstt::platform::createMicrophone(int deviceId = -1);
const char* kstt::platform::backendName();
```

### 4-2. `SttEngine` — 인식하는 쪽

```cpp
engine.onPartial([](const std::string& text) { ... });   // 말하는 중
engine.onFinal  ([](const Transcript& r)   { ... });     // 문장 확정
engine.onLevel  ([](float rms)             { ... });     // 입력 레벨 0..1
engine.onState  ([](EngineState s, const std::string& msg) { ... });

engine.loadModel(config, &err);                 // 블로킹 (수 초)
engine.start(platform::createMicrophone(), &err);
engine.stop();                                  // 워커 합류 + 마지막 문장 flush
```

상태는 `Unloaded → Loading → Ready → Running → Ready` 로 돌고, 어느 지점에서든
`Error` 로 빠질 수 있다. `lastError()` 에 사유가 남는다.

---

## 5. 스레드 모델

```
 UI 스레드                     워커 스레드 (SttEngine 내부)
 ─────────                     ──────────────────────────
 start()  ──────────────────▶  source->read()  (블로킹)
                                     │
                                     ├─ onLevel(rms)
                                     ├─ vosk_recognizer_accept_waveform_s()
                                     │    ├─ 확정 → onFinal(Transcript)
                                     │    └─ 진행 → onPartial(text)
                                     │
 stop() ─ source->cancel() ──▶  read() 가 0 을 돌려줌
        ─ join() ───────────▶  final_result flush → onFinal → onState(Ready)
```

**규칙: 콜백은 전부 워커 스레드에서 불린다.** GUI 는 반드시 자기 주 루프로
넘겨서 위젯을 만져야 한다. 세 GUI 가 각자 그 방식대로 처리한다.

| GUI | 넘기는 방법 | 수명 안전장치 |
|---|---|---|
| GTK4 | `g_idle_add_full` + 힙에 담은 `std::function` | `shared_ptr<atomic<bool>> alive_` 를 같이 넘겨, 창이 죽었으면 실행하지 않는다 |
| Win32 | `PostMessage(WM_APP+n, …, new std::wstring*)` | `accepting_` 를 내리고 `stop()` 한 뒤, 남은 메시지를 `PeekMessage` 로 비워 누수를 막는다 |
| Cocoa | `dispatch_async(dispatch_get_main_queue(), …)` | `__weak` 참조 |

`stop()` 은 `cancel()` → `join()` 순서라서, 돌아왔을 때는 콜백이 더 오지 않는다고
보장된다. 소멸자도 같은 순서를 지킨다.

---

## 6. libvosk 를 링크하지 않고 적재하는 이유

`core/src/vosk_bind.cpp` 가 `LoadLibraryExW`/`dlopen` 으로 올리고 심볼을
함수 포인터에 담는다. 링크 시점 의존성이 없어서 생기는 이득:

- libvosk 가 없어도 **프로그램은 뜬다.** GUI 가 "라이브러리를 못 찾았습니다" 와
  함께 어디를 뒤졌는지 보여 줄 수 있다(`--paths` 도 같은 목록을 쓴다).
- `.dll` / `.so` / `.dylib` 를 같은 코드로 다룬다.
- 사용자가 다른 빌드의 libvosk 로 바꿔 끼울 수 있다 (`KSTT_VOSK_LIB`).

탐색 순서는 `KSTT_VOSK_LIB` → 실행 파일 폴더와 그 위 3단계 → `third_party/*` →
시스템 기본 경로. 모델도 비슷하게 `models/` 아래에서 `am/`·`conf/`·`graph/` 가
있는 디렉터리를 찾고, 이름에 `-ko` 가 든 것을 먼저 고른다.

### Windows 런타임 함정 (반드시 알아야 할 것)

Vosk 공식 `libvosk.dll` 은 **MSVCRT 계열 MinGW** 로 빌드되어 있고
`libstdc++-6.dll`·`libgcc_s_seh-1.dll`·`libwinpthread-1.dll` 을 가져다 쓴다.

- **UCRT64 로 빌드하면 안 된다.** GTK 가 끌어오는 UCRT 판 `libstdc++-6.dll` 과
  Vosk 가 기대하는 MSVCRT 판이 한 프로세스에서 충돌해 적재가 실패한다.
  Windows 빌드는 MSYS2 **MINGW64**(`C:\msys64\mingw64`) g++ 로 고정한다.
- **Vosk 꾸러미에 든 런타임 DLL 을 실행 파일 옆에 복사하면 안 된다.** 2022년판
  이라 지금 g++ 로 만든 바이너리를 망가뜨린다(조용히 종료 코드 127).
  CMake 는 `libvosk` 만 복사하고, 런타임 3개는 **컴파일러 폴더**에서 가져온다.

---

## 7. 말하지 않은 것을 걸러내는 길목

인식기는 입력이 잡음이어도 가장 그럴듯한 낱말을 내놓는다. 그래서 결과를 그대로
흘리지 않고 `core/src/word_filter.{h,cpp}` 를 거친다. 네 프런트엔드가 같은 동작을
갖도록 **전부 코어 안에서** 처리한다.

| 도구 | 하는 일 |
|---|---|
| `SpeechGate` | 덩어리마다 RMS 와 **영교차율**을 받아 "지금 사람이 말하고 있는가"를 판정. 잡음 바닥을 내려갈 때 빠르게·올라갈 때 아주 느리게(0.10 / 0.002) 좇아 마이크 감도에 둔감하다. 문턱은 `max(0.006, 잡음바닥 × 3)`, 영교차율이 0.35 를 넘으면(쉭쉭거리는 잡음) 크기와 무관하게 거른다 |
| `filterByConfidence` | 신뢰도가 `minConfidence` 미만인 낱말을 빼고 text 를 다시 만든다. 그래서 워커는 사용자가 `withWords` 를 꺼도 Vosk 의 낱말 정보를 **내부적으로 켜 둔다** |
| `stableCommonPrefix` | 직전 추측과 지금 추측의 공통 낱말 앞부분만 남긴다. 확정 전 글자가 요동치는 것을 막는다 |
| `keepOnlyVocabulary` | 받을 말 목록에 없는 낱말을 전부 떨어낸다 (8장) |
| 발화 비율 검사 | 인식된 낱말의 시각 `[start, end]` 구간에서 유성음 덩어리가 차지한 비율이 `minVoicedFraction`(0.6) 미만이면 버린다. 짧은 소음이 긴 낱말로 둔갑하는 것을 막는 가장 효과적인 장치 |

워커 루프에서의 흐름:

```
덩어리 읽기 → RMS·영교차율 계산 → SpeechGate.feed()
                            ├─ 유성음이면 voicedMillis += 덩어리 길이
                            └─ voicedChunks 에 덩어리별 판정을 적어 둔다

Vosk 가 문장 확정을 알리면
    ├─ voicedMillis < minSpeechMillis  → 결과를 버린다 (말한 적이 없다)
    ├─ filterByConfidence 로 낱말 솎기
    ├─ keepOnlyVocabulary 로 받을 말만 남기기
    ├─ 낱말마다: 길이 ≤ maxWordSeconds 이고
    │            [start,end] 의 유성음 비율 ≥ minVoicedFraction 일 때만 내보낸다
    └─ voicedMillis = 0 (다음 구간 시작)

아직 확정 전이면 (partialMode)
    ├─ Off    → 아무것도 내보내지 않는다
    ├─ Stable → stableCommonPrefix(직전, 지금) 만 내보낸다
    └─ Raw    → 인식기가 준 그대로
```

`partialMode` 만은 인식 중에도 바꿀 수 있어야 해서(GUI 체크박스) `EngineConfig` 가
아니라 `Impl` 의 `std::atomic<int>` 에 둔다 — `setPartialMode()` 가 그것을 쓴다.
나머지 기본값은 `EngineConfig` 에 있다: `gateSilence=true`,
`silenceThreshold=0`(자동), `minSpeechMillis=200`, `minConfidence=0.4`,
`maxZeroCrossingRate=0.35`,
`minVoicedFraction=0.6`, `maxWordSeconds=2.0`, `partialMode=Stable`,
`vocabulary={"출근","퇴근"}`(프런트엔드가 `defaultVocabulary()` 로 넣는다).

**잡음 바닥 초기화의 함정**: 처음에는 바닥을 `min(첫 RMS, 0.02)` 로 잡는다. 말을
시작한 뒤에 인식을 켜면 첫 덩어리가 이미 말소리라, 그 크기를 바닥으로 삼으면 문턱이
말소리보다 높아져 그 뒤로 **아무것도 통과하지 못한다**. 단위시험이 이 경우를 지킨다.

---

## 8. 받을 말 한정 (출근 · 퇴근)

`EngineConfig::vocabulary` 가 비어 있지 않으면, 엔진은 Vosk 의 **문법 인식기**
(`vosk_recognizer_new_grm`)로 만든다. 문법을 주면 인식기가 그 낱말들만 후보로
두므로 짧은 낱말 정확도가 크게 오른다. 측정값:

| 입력 | 자유 받아쓰기 | 문법 한정 |
|---|---|---|
| "출근" | 체육 은 ✗ | 출근 ✓ |
| "퇴근" | 퇴근 ✓ | 퇴근 ✓ |
| "안녕하세요 오늘 날씨가…" | 문장 그대로 | (아무것도 없음) ✓ |

### 미끼 낱말이 왜 필요한가

Vosk 문법에는 보통 `"[unk]"`(이 중 어느 것도 아님)를 함께 넣는다. 그런데 **한국어
소형 모델은 `[unk]` 를 모른다** — 넣으면 `Ignoring word missing in vocabulary` 경고와
함께 무시된다. 그러면 인식기에 빠져나갈 곳이 없어져 **모든 소리를 출근/퇴근 중
하나로 억지로 맞춘다.** 실제로 관계없는 문장을 넣었더니
`출근 퇴근 출근 퇴근 출근 출근 출근` 이 나왔고, 신뢰도는 전부 1.00 이라 신뢰도로는
거를 수 없었다.

그래서 `core/src/decoy_words.inc` 에 흔한 한국어 낱말 180여 개를 두고 문법에 함께
넣는다. 인식기가 그쪽으로 빠지면 `keepOnlyVocabulary` 가 결과에서 떨어낸다.

**주의**: 미끼에 받을 말과 소리가 비슷한 낱말(출발·출장·체육 …)을 넣으면 안 된다.
넣어 보니 진짜 "출근" 을 "체육" 이 가로채 인식이 아예 되지 않았다. 미끼는 흔한 말을
넓게 덮는 역할이지, 받을 말의 경쟁자가 되어서는 안 된다.

적재할 때 `vosk_model_find_word` 로 모델이 아는 낱말만 추려 두므로(`usableDecoys`),
모르는 낱말이 목록에 섞여 있어도 경고가 나지 않는다. 받을 말 중 모델이 모르는 것은
`unknownWords()` 로 알려 준다.

### 낱말 하나 = 사건 하나

받을 말을 한정했을 때는 `onFinal` 이 **낱말마다 한 번씩** 불린다. "출근. 퇴근.
출근." 을 들으면 세 번 불리고 각각 자기 시각을 갖는다. 출퇴근 기록처럼 "언제
무엇이 들렸는지" 를 세어야 하는 쪽에서 쪼개는 수고를 하지 않도록 코어가 맡는다.
자유 받아쓰기일 때는 문장 단위를 그대로 둔다.

---

## 9. 결과 해석

Vosk 는 JSON 한 줄을 돌려준다.

```json
{"text": "안녕하세요", "result": [{"word":"안녕하세요","start":0.06,"end":1.14,"conf":1.0}]}
{"partial": "오늘 날씨가"}
```

외부 JSON 라이브러리를 들이지 않으려고 `core/src/json_light.{h,cpp}` 에 최소
파서를 두었다(약 300줄, 재귀 하강). 한글은 UTF-8 로 그대로 오지만 `\uXXXX`
이스케이프와 서러게이트 쌍도 처리한다 — 단위시험이 둘 다 확인한다.

`max_alternatives` 를 켜면 `{"alternatives":[{...}]}` 로 모양이 바뀌므로
`parseResult()` 가 그 경우도 본다.

---

## 10. 시험

`tests/test_core.cpp` 하나이고 `kstt_core` 만 링크한다.

| 묶음 | 확인하는 것 |
|---|---|
| JSON | 객체·배열·숫자, 한글 UTF-8, `\uXXXX` 디코딩, 깨진 입력 거부 |
| WAV | 쓰기→읽기 왕복, 8k→16k 변환 길이, WAV 아닌 파일의 오류 메시지 |
| AudioSource | 전량 전달 후 EOF, `cancel()` 즉시 종료 |
| 걸러내기 | 안정 접두사, 신뢰도 거르기, 잡음 바닥 추적 게이트, 영교차율 판별 |
| 한정 | 목록 적기·문법 JSON·미끼 분리, 목록 밖 낱말 거르기 |
| 엔진 | 없는 모델 거부, 모델 없이 `start()` 거부, 탐색 경로 |
| 종단 | 한국어 음원을 **실제로 인식**, 잡음 음원은 **아무것도 받아쓰지 않음**, 받을 말을 한정하면 **"출근"→출근 / "퇴근"→퇴근 / 관계없는 문장→없음** (모델·libvosk 없으면 건너뜀) |

종단 시험이 쓰는 `tests/data/sample-ko.wav` 는 OS 의 음성 합성기로 만든다
(`scripts/make_sample_wav.sh` / `.ps1` — Windows SAPI, macOS `say`, Linux
espeak-ng). 저장소에 들어 있으므로 보통은 다시 만들 필요가 없다.

GUI 쪽은 `KSTT_SMOKE_WAV` 환경변수로 점검한다. 값이 있으면 모델 적재 직후 그
WAV 를 자동으로 인식하므로, 손으로 단추를 누르지 않고도 창이 결과를 그리는
경로 전체를 확인할 수 있다.

---

## 11. 늘리는 방법

### 새 OS 의 마이크를 붙이려면

1. `platform/<os>/` 에 `AudioSource` 를 구현한다.
2. 같은 파일에 `kstt::platform::inputDevices()`, `createMicrophone()`,
   `backendName()` 을 정의한다.
3. `CMakeLists.txt` 의 `KSTT_AUDIO_SOURCES` 분기에 한 줄 추가.

코어와 GUI 는 건드리지 않는다.

### 새 GUI 를 만들려면

`app/gui/<이름>/` 을 만들고 `kstt_core` + `kstt_audio` 에 링크한다. 필요한 API 는
이것뿐이다.

```cpp
#include "kstt/stt_engine.h"
#include "kstt/platform/audio_input.h"

kstt::SttEngine engine;
engine.onPartial(...); engine.onFinal(...); engine.onLevel(...); engine.onState(...);
engine.loadModel(config, &err);                        // 별도 스레드에서
engine.start(kstt::platform::createMicrophone(id), &err);
engine.stop();
```

잊지 말 것: **콜백을 그 툴킷의 주 스레드로 넘길 것.**

### 다른 인식 엔진으로 바꾸려면

`SttEngine` 의 공개 헤더는 Vosk 를 전혀 드러내지 않는다(`VoskModel` 같은 타입이
공개 API 에 없다). `core/src/stt_engine.cpp` 와 `vosk_bind.*` 만 갈아 끼우면
프런트엔드 셋과 시험은 그대로 쓸 수 있다.

---

## 12. 알려진 한계

- 파일 받아쓰기는 WAV 전체를 메모리에 올린다. 아주 긴 파일은 스트리밍 파서로
  바꾸는 편이 낫다.
- 리샘플러는 선형 보간이다. 8kHz→16kHz 같은 변환에서 품질이 최고는 아니지만,
  원래 그 대역에 없는 정보를 되살릴 수는 없으므로 실용적으로는 충분하다.
- 화자 분리, 문장부호 복원, 사용자 사전은 들어 있지 않다.
- 받을 말로 쓸 수 있는 것은 **모델이 아는 낱말**뿐이다. 새 낱말을 넣으려면 모델을
  바꾸거나 발음 사전을 손봐야 한다.
- 미끼 낱말은 손으로 고른 목록이다. 받을 말을 크게 바꾸면(예: 품목명 수십 개)
  미끼도 다시 살펴야 한다.
- macOS·Linux 코드는 작성되어 있으나 Windows 장비에서 개발되어 **해당 OS 에서의
  빌드·실행은 아직 확인되지 않았다.**
