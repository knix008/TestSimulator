# 한국어 명령어 인식 학습

임베디드 장치에서 쓸 수 있도록, 10개 이하의 짧은 한국어 명령만 구분하는 작은 음성 모델을 직접 학습하는 프로그램입니다. 녹음, 학습, 마이크 테스트, ONNX 저장, C++ 추론 예제가 한 프로젝트에 있습니다.

문장 전체를 받아쓰는 엔진이 아닙니다. 등록한 명령과 무음만 구분합니다.

| 문서 | 내용 |
| --- | --- |
| [UsersGuide.md](UsersGuide.md) | 녹음, 학습, 인식, 내보내기를 각각 실행하는 방법 |
| [Architecture.md](Architecture.md) | 모델 구조, 파일 크기, 실행 메모리, CPU 클록 |

## 실행

각 단계는 프로젝트 루트의 스크립트로 실행합니다. 처음 실행하면 Python 3.13 가상환경을 만들고 패키지를 설치합니다. Python 3.12 또는 3.13을 사용합니다.

| 스크립트 | 하는 일 |
| --- | --- |
| `run.bat`, `run_gui.bat` | 녹음, 학습, 마이크 테스트, 내보내기 화면 |
| `run_record.bat 출근 5` | 해당 명령을 마이크에서 녹음. `무음`도 같은 방식 |
| `run_train.bat` | 합성 데이터(있으면)와 내 녹음으로 학습하고 ONNX 저장. `--epochs 40`처럼 옵션을 붙일 수 있음 |
| `run_train.bat --arch bcresnet1 --out bcresnet1` | BC-ResNet-1 구조로 학습 |
| `run_train.bat --finetune models\latest` | 기존 결과에서 이어서 내 녹음으로 추가 학습. 기반 결과의 구조를 그대로 쓰고 `models/speaker`에 저장 |
| `run_export.bat` | 학습된 가중치를 ONNX로 다시 저장. `--no-int8`이면 실수형만 저장 |
| `run_test.bat 파일.wav 0.70` | WAV 하나를 Python으로 판정 |
| `run_eval.bat [폴더]` | 폴더의 WAV를 한꺼번에 판정해 명령별 인식률, 혼동표, 임계값별 오수락률, 틀린 파일 목록 출력. `--csv 결과.csv`로 저장 |
| `run_selftest.bat` | 특징, 학습, ONNX, C++ 특징 일치 검사 |
| `run_tests.bat` | `test` 폴더의 전체 테스트 실행 (GUI, CLI, 스크립트, C++, 문서 포함) |
| `run_synth_test.bat` | 출근·퇴근·경비·해제를 여러 높낮이로 합성해 학습 후 다른 음원으로 평가 |
| `build_cpp.bat` | C++ 특징 검사 프로그램 빌드 |
| `build_cpp.bat download` | 공식 ONNX Runtime 패키지를 `third_party/onnxruntime`에 받고 `kws_infer`까지 빌드 |
| `build_cpp.bat C:\path\to\onnxruntime` | 이미 있는 ONNX Runtime으로 `kws_infer`까지 빌드 |
| `run_cpp.bat 파일.wav 0.70` | C++로 WAV 판정 |

## 사용 순서

1. 데이터 탭의 명령은 출근, 퇴근, 경비, 해제입니다. 무음은 명령이 아닌 소리를 거절하려고 함께 학습합니다.
2. 학습 탭에서 모델 구조(DS-CNN v2 또는 BC-ResNet-1)를 고르고, 처음부터 학습으로 학습 시작을 누릅니다. BC-ResNet-1은 파라미터가 9,001개로 DS-CNN v2(17,637개)의 절반쯤이고, 결과는 `models/bcresnet1`에 저장됩니다. 기본으로 Supertonic 2 합성 데이터(`data/synth/train`, 남녀 같은 수)를 쓰고, 없으면 먼저 만듭니다. 결과는 `models/latest`입니다.
3. 실제 사용할 사람의 발음에 맞추려면 데이터 탭에서 명령 녹음과 무음 녹음으로 내 목소리를 녹음합니다(명령마다 4–10개). 녹음은 `data/audio`에 따로 저장됩니다.
4. 학습 탭에서 추가 학습을 고르고 학습 시작을 누릅니다. 위에서 고른 결과(예: latest)에서 이어서, 내 녹음을 합성 데이터와 섞어 짧게 더 학습합니다. 결과는 `models/speaker`입니다.
5. 학습이 끝나면 로그에 출처별 검증 정확도, 추가 학습 전 정확도, 학습에 쓰지 않은 음성으로 채점한 결과가 나옵니다. 자세한 해석은 [UsersGuide.md](UsersGuide.md)에 있습니다.
6. 실시간 테스트 탭에서 인식만 할 수 있습니다. 화면 위의 학습 결과 목록에서 이미 있는 결과(예를 들어 synth_eval)를 고르면 다시 학습하지 않습니다. 무음이거나 확률이 임계값보다 낮으면 대기로 표시합니다.
7. 평가 탭에서 점수를 냅니다. 마이크 시험은 화면에 나온 명령을 말하면 바로 채점하고, 폴더 평가와 합성 평가 음원은 WAV를 한꺼번에 판정합니다. 명령별 인식률, 놓침·오인식·오수락, 혼동표, 임계값별 결과와 추천 임계값이 나옵니다.
8. `models/latest/command_kws.onnx`가 만들어집니다.

이미 녹음해 둔 WAV가 있으면 명령을 고른 뒤 WAV 가져오기로 넣습니다. 16 kHz가 아니면 가져올 때 맞춥니다.

## 모델

입력은 16 kHz 모노 로그멜 스펙트럼 40 x 98입니다. 네트워크는 이 프로젝트에서 정의한 depthwise separable CNN이고, 공개 음성 모델의 가중치를 가져오지 않습니다. 출근, 퇴근, 경비, 해제와 무음(5클래스)은 파라미터 17,637개입니다.

2026-10-14에 `models/synth_eval`을 측정한 값입니다. 계산과 측정 조건은 [Architecture.md](Architecture.md)에 있습니다.

| 항목 | 값 |
| --- | --- |
| 실수형 ONNX | 95,242바이트 (93.0 KiB) |
| 장치에 복사할 프론트엔드 포함 | 138,549바이트 (135.3 KiB) |
| 인식 작업 메모리 | ONNX Runtime 세션 약 7 MB. 공식 `onnxruntime.dll` 18.4 MB를 포함하면 약 32 MB |
| CPU 클록 | 한 코어가 이 PC의 P-core와 비슷한 처리량일 때, 0.2초마다 판정하려면 약 110 MHz. 50 ms 안에 끝내려면 약 450 MHz |

출력은 소프트맥스 이전의 로짓입니다. 사용 쪽에서 소프트맥스를 계산합니다. 1등이 무음이거나 최대 확률이 임계값(기본 0.70)보다 낮으면 명령을 받아들이지 않습니다.

학습이 끝나면 `models/latest`에 다음 파일이 있습니다.

- `command_kws.onnx`: C++에서 사용할 실수형 모델
- `command_kws.int8.onnx`: 더 작은 정수 가중치. 로그의 일치율이 충분할 때만 사용
- `model.pt`: PyTorch 가중치
- `labels.txt`, `frontend.txt`
- `mel_filters.bin`, `window.bin`, `norm.bin`
- `meta.json`: 검증 정확도와 입력 크기

## C++

특징 계산은 `cpp/logmel.hpp`에 있고 Python과 같은 순서를 따릅니다. ONNX Runtime으로 추론하는 예제는 `cpp/main.cpp`입니다.

`build_cpp.bat download`는 [ONNX Runtime 릴리스](https://github.com/microsoft/onnxruntime/releases)의 Windows x64 패키지(Python 패키지와 같은 1.31.0)를 `third_party/onnxruntime`에 받고, C++ 도구가 있는 정식 Visual Studio(미리보기 판 제외)를 `vswhere`로 찾아 `cpp/build/msvc`에 빌드한 뒤 `onnxruntime.dll`을 exe 옆에 복사합니다. `third_party/onnxruntime`이 있으면 `build_cpp.bat`만으로도 빌드합니다. 직접 빌드할 때는 `include`와 `lib`가 있는 폴더를 지정합니다.

```bat
cmake -S cpp -B cpp/build -DONNXRUNTIME_ROOT=C:\path\to\onnxruntime
cmake --build cpp/build --config Release
cpp\build\Release\kws_infer.exe models\latest 녹음.wav 0.70
```

`onnxruntime.dll`을 exe와 같은 폴더에 둡니다. 공식 Windows 패키지는 MSVC로 빌드되어 있으므로 `kws_infer`도 MSVC로 빌드합니다. 마이크 없이 특징만 비교하는 `test_logmel`은 ONNX Runtime 없이 빌드됩니다.

WAV는 16 kHz, 16-bit PCM 또는 32-bit float입니다. 학습 프로그램이 저장하는 파일이 이 형식입니다.

## 특징 계산 순서

Python `kws/features.py`와 C++ `cpp/logmel.hpp`가 같은 순서를 사용합니다.

1. 1초보다 길면 에너지가 가장 큰 1초를 고르고, 짧으면 가운데를 0으로 채웁니다.
2. DC를 제거합니다.
3. pre-emphasis 0.97을 적용합니다.
4. 피크가 0.01 이상이면 0.9로 맞춥니다.
5. [-1, 1]로 자릅니다.
6. 25 ms 해닝 창, 10 ms 간격, 512-point FFT로 파워를 구합니다.
7. 저장된 멜 필터를 곱하고 자연로그를 취합니다.
8. 학습 때 저장한 멜 빈 평균과 표준편차로 나눕니다.

시간 이동, 소음, SpecAugment는 학습에만 쓰입니다. 추론 코드에는 넣지 않습니다. 멜 필터와 창, 평균, 표준편차는 바이너리로 저장하므로 C++이 필터를 다시 만들지 않습니다.

## 한계

이 모델은 녹음한 사람의 목소리와 그 마이크에 맞춰집니다. 다른 사람이나 다른 마이크에서 쓰려면 그 환경의 녹음을 추가해 다시 학습하는 것이 맞습니다. 임베디드 리눅스에서 ONNX Runtime으로 실행하는 구성을 기준으로 하며, MCU로 옮길 때는 같은 특징 계산을 유지한 채 양자화하면 됩니다.
