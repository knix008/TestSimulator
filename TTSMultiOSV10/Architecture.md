# Architecture — TTS Multi OS

버전 0.1.0 · Electron 31 · 실모델 ONNX / sherpa-onnx 추론

---

## 1. 개요

렌더러(UI)와 메인 프로세스가 IPC로 통신하고, **실제 TTS 합성은 Worker Thread**에서 수행합니다.  
UI는 Electron과 웹에서 공유하지만, **다운로드·추론·WAV 저장은 Electron 전용**입니다.

---

## 2. 레이어 구조

```
[Renderer]
  index.html
  src/web/main.js          UI, 읽기/다운로드, 파형·Web Audio 재생
  src/web/styles.css

[Preload Bridge]
  electron/preload.js      contextBridge → window.ttsBridge

[Main Process]
  electron/main.js         BrowserWindow, dialog, IPC 라우팅
  electron/ttsWorkerHost.js  Worker 기동·메시지 중계

[Worker Thread]
  src/core/ttsWorker.js    speak / warm / voices
  src/core/ttsService.js   모델별 합성·워밍업
  src/core/modelStore.js   HuggingFace 다운로드·캐시
  src/core/modelCatalog.js 모델 메타데이터
  src/core/wav.js          WAV 인코딩
```

---

## 3. IPC 채널

| 채널 | 방향 | 설명 |
|------|------|------|
| `app:getModelCatalog` | renderer→main | 카탈로그 |
| `app:getCachedModels` | renderer→main | 설치 여부 |
| `app:getCacheDirectory` | renderer→main | 캐시 루트 경로 |
| `app:selectWavPath` | renderer→main | 저장 대화상자 |
| `app:openTextFile` | renderer→main | 텍스트 파일 열기 |
| `app:downloadAndPrepareModel` | renderer→main | HF 다운로드 |
| `app:modelDownloadProgress` | main→renderer | 진행률 push |
| `app:speak` | renderer→main→**worker** | 텍스트 합성 → `{ audioBuffer, sampleRate }` |
| `app:warmModel` | renderer→main→**worker** | ONNX/음소화/sherpa 사전 로드 |
| `app:listModelVoices` | renderer→main→**worker** | 모델별 보이스 목록 |
| `app:exportWav` | renderer→main | PCM → WAV 파일 |

---

## 4. 음성 합성 흐름 (Electron)

```
▶ 읽기
  │
  ├─ UI: 상태 "합성 중" + placeholder 파형 표시 (rAF로 페인트 보장)
  │
  ├─ IPC app:speak { text, modelId, voiceId, speed, language }
  │     └─ ttsWorkerHost → Worker
  │           └─ ttsService.synthesizeText()
  │                 ├─ Piper     → G2P → onnxruntime
  │                 ├─ Supertonic→ sherpa-onnx OfflineTts
  │                 ├─ MMS       → 로마자화 → onnxruntime
  │                 └─ Kokoro    → phonemizer → onnxruntime
  │
  ├─ 결과: Float32 PCM + sampleRate
  │
  └─ Renderer: drawWaveform(실PCM) → playAudioBuffer (볼륨/속도/피치)
```

**파형·재생·WAV는 모두 모델이 만든 PCM**을 사용합니다.  
OS Web Speech API는 더 이상 주 경로가 아닙니다.

### 워밍업

모델 선택·부팅·다운로드 완료 후 `app:warmModel` 호출:

- ONNX 세션 생성
- (Kokoro) phonemizer / voice bin 캐시
- (Piper) G2P 로드
- (Supertonic) sherpa `OfflineTts` 생성

첫 클릭 직전의 긴 정지 감을 줄이기 위함입니다. Worker에서 수행하므로 UI 이벤트 루프는 유지됩니다.

---

## 5. 모델 · 엔진 매핑 (상세)

카탈로그: `src/core/modelCatalog.js`

### 5.1 Piper KSS

| | |
|--|--|
| ID | `ko-piper-kss` |
| runtime | `piper-onnx` |
| Engine | `onnxruntime-node` |
| G2P | **goruut** (local HTTP) + `@piper-plus/g2p` `Encoder` only |
| Source | `neurlang/piper-onnx-kss-korean` (`phoneme_type: pygoruut`) |
| I/O | `input`, `input_lengths`, `scales` → `output` |
| SR | 22050 |

텍스트 → goruut IPA → map에 있는 글자만 토큰화 → `phoneme_id_map` ID 시퀀스(BOS/PAD/EOS) → VITS계 ONNX.  
`@piper-plus/g2p`의 `KoreanG2P`는 이 가중치와 호환되지 않음(잘못된 IPA → 비한국어 발화).

### 5.2 Supertonic INT8

| | |
|--|--|
| ID | `ko-supertonic-int8` |
| runtime | `sherpa-onnx` |
| Engine | `sherpa-onnx-node` (`OfflineTts` + `GenerationConfig`) |
| Model family | **Supertonic** (모델) / **sherpa-onnx** (런타임) |
| Source | `csukuangfj2/sherpa-onnx-supertonic-tts-int8-2026-03-06` |
| Config keys | `durationPredictor`, `textEncoder`, `vectorEstimator`, `vocoder`, `ttsJson`, `unicodeIndexer`, `voiceStyle` |
| SR | ~44100 |
| Speakers | `sid` 0…N-1 (UI: Speaker n) |

Electron에서는 `enableExternalBuffer: false`로 외부 ArrayBuffer 제한을 회피합니다.  
플랫폼별 네이티브: `sherpa-onnx-win-x64` 등 (`addon.js`가 로드).

### 5.3 MMS TTS (Korean)

| | |
|--|--|
| ID | `ko-mms-tts` |
| runtime | `transformers-js` (카탈로그 표기; 실제 추론은 ORT 직접) |
| Engine | `onnxruntime-node` |
| Source | `Xenova/mms-tts-kor` |
| Prep | Hangul → Revised Romanization 스타일 → lowercase/필터 → blank `u` 삽입 → char IDs (vocab size 25) |
| I/O | `input_ids`, `attention_mask` → `waveform` |
| SR | 16000 |

### 5.4 Kokoro 82M

| | |
|--|--|
| ID | `en-kokoro` |
| runtime | `onnx` |
| Engine | `onnxruntime-node` |
| G2P | `phonemizer` (`en-us`, eSpeak-NG); 한글은 로마자화 후 처리 |
| Source | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| Prefer file | `onnx/model_quantized.onnx` (없으면 q8f16 / fp32) |
| Style | `voices/<id>.bin` → length에 맞는 256-d style 벡터 |
| I/O | `input_ids`, `style`, `speed` → `waveform` |
| SR | 24000 |

---

## 6. 모델 다운로드 흐름

```
↓ 다운로드
  → app:downloadAndPrepareModel(modelId)
  → modelStore.ensureModelAvailable()
       → .download-manifest.json 있으면 스킵
       → HF API 파일 목록
       → 이미지/샘플 오디오 등 skip
       → 청크 다운로드 + app:modelDownloadProgress
       → 매니페스트 기록
  → UI refresh + warmModel
```

캐시 루트: `%APPDATA%\TTSMultiOSV10\models` (Windows) / `~/TTSMultiOSV10/models`.

---

## 7. 의존성 (런타임)

| 패키지 | 용도 |
|--------|------|
| `electron` ^31 | 데스크톱 셸 |
| `onnxruntime-node` | Piper / MMS / Kokoro |
| `sherpa-onnx-node` | Supertonic API |
| `sherpa-onnx-win-x64` (및 타 OS) | sherpa 네이티브 |
| `@piper-plus/g2p` | Piper `Encoder` (KSS는 goruut IPA만 사용) |
| goruut | Piper KSS pygoruut 음소화 (`goruutPhonemizer.js`) |
| `phonemizer` | Kokoro 영어 IPA |
| `@huggingface/transformers` | (예약/호환; MMS는 ORT 직접 경로) |
| `electron-builder` | 배포 패키징 |

빌드 시 `asarUnpack`으로 네이티브 모듈을 asar 밖으로 풉니다.

---

## 8. 웹 모드

`server.js`가 정적 파일을 제공합니다.  
렌더러의 `ttsBridge`가 없으면 UI는 동작하지만 합성 요청은 Electron 필요 오류를 냅니다.

---

## 9. 빌드 산출물

| 플랫폼 | 형식 |
|--------|------|
| Windows | NSIS `.exe` (`oneClick: false`) |
| macOS | DMG |
| Linux | AppImage + `.deb` |

아이콘: `assets/icon.png`

---

## 10. 설계 포인트 / 제한

| 항목 | 내용 |
|------|------|
| UI 동결 완화 | 합성을 Worker로 분리 + 모델 워밍업 |
| 파형 진실성 | placeholder는 대기용, 완료 후 실 PCM으로 교체 |
| Kokoro + 한글 | ko_dict 없음 → 로마자 경로; 품질은 영어 입력이 적합 |
| 웹 추론 | 미구현 |
| GPU | 현재 CPU EP |

---

## 관련 문서

- [README.md](./README.md) — 개요·실행  
- [UsersGuide.md](./UsersGuide.md) — 사용법·모델별 안내
