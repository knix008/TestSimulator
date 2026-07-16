# 사용자 가이드 — TTS Multi OS

버전 0.1.0 · 개발자 SHKWON (knix008@naver.com)

---

## 1. 시작하기

### 데스크톱 앱 (권장)

실제 모델 음성을 들으려면 Electron으로 실행합니다.

```bash
npm install
npm start
```

첫 실행 후 사용할 모델을 **↓ 다운로드**로 설치해야 합니다.

### 웹 미리보기

```bash
npm run web
```

브라우저 UI만 확인할 수 있습니다. **모델 다운로드·실추론은 Electron 전용**입니다.

---

## 2. 기본 사용법

### 텍스트 읽기

1. 왼쪽 입력란에 텍스트를 입력합니다. (`samples/` 예제 사용 가능)
2. 오른쪽에서 **언어**를 선택합니다 (한국어 / English).
3. **모델**을 선택합니다. 설치됨이면 `✓ 설치됨`이 표시됩니다.
4. **목소리 (모델)**에서 보이스/스피커를 고릅니다 (모델에 따라 다름).
5. 필요하면 **볼륨 / 속도 / 피치**를 조절합니다.
6. 상단 **▶ 읽기**를 누릅니다.
7. 하단 **파형**에 모델이 만든 PCM이 그려지고 재생됩니다.

모델 선택 시 **엔진 준비 중…**이 잠시 보일 수 있습니다.  
Kokoro처럼 무거운 모델은 ONNX·음소화를 미리 올려 두어, 이후 읽기 지연을 줄입니다.

### 파일 열기

- 툴바 또는 편집기 옆 **📂 파일 열기** → `.txt` / `.md` 로드  
- 예제: `samples/` 폴더

| 파일 | 내용 |
|------|------|
| `korean_greeting.txt` | 한국어 인사 |
| `korean_news.txt` | 뉴스 스타일 |
| `korean_story.txt` | 이야기 |
| `english_greeting.txt` | English greeting |
| `english_story.txt` | English story |
| `english_tech.txt` | English tech |

### WAV 저장

1. 한 번 읽기(합성)를 수행합니다.
2. **📄 WAV 저장** → 경로 선택  
3. **직전에 합성된 모델 PCM**이 WAV로 저장됩니다. (가짜 파형 아님)

---

## 3. 모델 관리

### 다운로드

1. **모델** 드롭다운에서 항목 선택  
2. **↓ 다운로드**  
3. 상태 카드에서 진행률 확인  
4. 완료 후 `✓ 설치됨`

저장 경로:

| OS | 경로 |
|----|------|
| Windows | `%APPDATA%\TTSMultiOSV10\models\<model-id>\` |
| macOS / Linux | `~/TTSMultiOSV10/models/<model-id>/` |

예: `...\models\ko-piper-kss\`, `...\models\en-kokoro\`

인터넷으로 HuggingFace에서 받습니다. 용량이 크므로 여유 공간을 확인하세요.

---

## 4. 모델 · 엔진 · 목소리 (상세)

앱은 OS TTS(Microsoft 등)를 쓰지 않고, **선택한 모델 파일로 직접 합성**합니다.

### 4.1 Piper KSS (`ko-piper-kss`)

| 항목 | 내용 |
|------|------|
| 언어 | 한국어 |
| 엔진 | `onnxruntime-node` (CPU) |
| 전처리 | **goruut / pygoruut** IPA → Piper phoneme ID (`phoneme_type: pygoruut`) |
| HF | `neurlang/piper-onnx-kss-korean` |
| 주요 파일 | `piper-kss-korean.onnx`, `piper-kss-korean.onnx.json` |
| 부가 바이너리 | 최초 사용 시 `%APPDATA%\TTSMultiOSV10\goruut-bin\`에 goruut(~96 MB) 다운로드 |
| 샘플레이트 | 22050 Hz |
| 목소리 UI | 기본 1개 (단일 스피커) |
| 특징 | 경량·빠름. 잘못된 G2P를 쓰면 한국어로 들리지 않음 |

권장 입력: 한국어 문장. (영문만 넣으면 한국어 모델 특성상 어색할 수 있음)

### 4.2 Supertonic 3 INT8 (`ko-supertonic-int8`)

| 항목 | 내용 |
|------|------|
| 언어 | 한국어 중심, sherpa `lang`으로 31개 언어 가능 |
| 엔진 | **sherpa-onnx** (`sherpa-onnx-node` + 플랫폼 네이티브 바이너리) |
| 모델 타입 | **Supertonic 3** (INT8 양자화) |
| HF | `csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11` |
| 주요 파일 | `duration_predictor.int8.onnx`, `text_encoder.int8.onnx`, `vector_estimator.int8.onnx`, `vocoder.int8.onnx`, `tts.json`, `unicode_indexer.bin`, `voice.bin` |
| 샘플레이트 | 44100 Hz (엔진 보고값) |
| 목소리 UI | **Speaker 0–9** (스피커 ID) |
| 특징 | v2 대비 외래어·한자어 등 일부 단어 skip이 개선됨 |

권장 입력: 한국어 문장. 앱을 켠 뒤 모델이 “미설치”로 보이면 **다운로드**로 v3를 받으세요 (기존 v2 캐시는 자동 교체).

> **Supertonic = 모델**, **sherpa-onnx = 실행 엔진**입니다.

### 4.3 MMS TTS (`ko-mms-tts`)

| 항목 | 내용 |
|------|------|
| 언어 | 한국어 (Meta MMS-TTS kor) |
| 엔진 | `onnxruntime-node` |
| 전처리 | 한글 → 로마자 → MMS VITS 문자 토큰 (blank `u` 삽입) |
| HF | `Xenova/mms-tts-kor` (원본 계열: facebook/mms-tts-kor) |
| 주요 파일 | `onnx/model.onnx`(또는 quantized), `tokenizer.json` / `vocab.json` |
| 샘플레이트 | 16000 Hz |
| 목소리 UI | 기본 1개 |
| 특징 | Meta MMS 계열, 어휘는 로마자 기반 |

권장 입력: 한국어.

### 4.4 Kokoro 82M (`en-kokoro`)

| 항목 | 내용 |
|------|------|
| 언어 | **영어 (권장)** |
| 엔진 | `onnxruntime-node` (Windows: DirectML GPU 우선 → CPU 다중 스레드; node 실패 시 WASM 폴백) |
| 전처리 | `phonemizer` (eSpeak-NG) → Kokoro tokenizer; 한글이 섞이면 로마자화 후 en-us 처리 |
| HF | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| 주요 파일 | `onnx/model_q8f16.onnx` (~82MB), `voices/af_heart.bin`, `tokenizer.json` |
| 샘플레이트 | 24000 Hz |
| 목소리 UI | `voices/`의 **다수 보이스** (예: `af_heart`, `af_bella`, `bm_george` …) |
| 특징 | 고품질 영어; 첫 준비(워밍업)에 시간이 조금 걸릴 수 있음 |

권장 입력: 영어. 한글만 넣으면 로마자 발음으로 읽혀 부자연스러울 수 있습니다.  
영어 모델을 쓰려면 **언어를 English**로 맞추고 영어 샘플을 쓰는 것을 권장합니다.

---

## 5. 음성 파라미터

| 슬라이더 | 범위 | 설명 |
|----------|------|------|
| 볼륨 | 0%–200% | 재생 게인 |
| 속도 | 0.25×–4.0× | 재생 속도 (모델에 따라 합성 시에도 반영) |
| 피치 | −12 ~ +12 반음 | 재생 시 유효 샘플레이트 조절 |

---

## 6. 테마 · 단축키 · 오류

- **🌙 / ☀️**: 다크/라이트 (로컬에 저장)
- **F12**: 개발자 도구 (Electron)
- 오류 대화상자 **⧉ 복사**로 로그 전달 가능

터미널에 한글이 깨져 보일 수 있으나(Windows 콘솔 인코딩), 앱 동작과는 무관합니다.

---

## 7. 문제 해결

| 증상 | 확인 |
|------|------|
| 「Electron에서만 지원」 | `npm start`로 실행했는지 |
| 「모델이 설치되어 있지 않습니다」 | 해당 모델 다운로드 |
| Kokoro 첫 읽기가 느림 | 모델 선택 후 「엔진 준비 중」 완료를 기다린 뒤 읽기 |
| Kokoro 합성이 계속 느림 | 콘솔에 `ORT backend: onnxruntime-node`인지 확인; 아니면 `npm run rebuild:native` 후 재시작 |
| Kokoro + 한글 문장 | 영어 입력 권장; 한글은 로마자 경로로 처리됨 |
| Supertonic 무음/실패 | 모델 폴더 7개 파일 존재 여부, 앱 재시작 |
| 네이티브 모듈 오류 | `npm install` 후 재실행; Windows는 `sherpa-onnx-win-x64` 필요 |

---

## 8. 빌드 (설치 파일)

```bash
npm run build:win    # NSIS
npm run build:mac
npm run build:linux
```

출력: `dist/`  
Windows 설치 시 경로·바로가기 옵션 선택 가능합니다.

---

## 9. 연락처

- **개발자**: SHKWON  
- **이메일**: knix008@naver.com  
- **버전**: 0.1.0  

아키텍처·IPC·합성 흐름: [Architecture.md](./Architecture.md)
