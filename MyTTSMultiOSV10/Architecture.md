# Architecture — MyTTS

버전 0.1.0 · Tauri 2 + Node.js 호스트 · 실모델 ONNX / sherpa-onnx 추론

---

## 1. 개요

화면(WebView)은 하나의 Tauri 명령 `tts`로 Rust 프로그램과 통신합니다. Rust는 창·파일 대화 상자·클립보드·메시지 상자를 직접 처리하고, 나머지 채널은 **Node.js 호스트**(`src/host/host.mjs`)로 넘깁니다. 호스트는 Electron 시절 메인 프로세스 코드를 그대로 실행합니다 (onnxruntime-node · sherpa-onnx-node 네이티브 모듈 때문에 Node가 필요).  
채널 이름은 Electron IPC 이름을 그대로 써서 `src/web/main.js`는 바뀌지 않았습니다. UI는 데스크톱과 웹에서 공유하지만, **다운로드·추론·WAV/MP3 저장은 데스크톱 전용**입니다.

네이티브 모듈이 호스트를 죽이면 Rust가 화면에 알리고 호스트를 다시 시작합니다(최대 5회). 새 호스트는 `appLog`의 크래시 표시를 읽어 「모델 삭제 후 다시 받기」를 제안합니다.

---

## 2. 레이어 구조

```
[Renderer]
  index.html
  src/web/main.js          TTS 화면 로직: 읽기 · 다운로드 · 파형 · Web Audio 재생 · 저장 · 모든 화자
  src/web/styles.css       MyUMLMaker 룩 (테마 변수만 사용)
  src/web/ui/shell.js      메뉴 막대 · 툴바 · 시작 화면 · 테마/시작 화면 설정 · 단축키 · 우클릭 메뉴
  src/web/ui/doctabs.js    텍스트 탭 (textarea 하나를 탭마다 바꿔 끼움, 탭마다 소리 · 파형 · 화자별 결과)
  src/web/ui/speakerpanel.js  화자별 결과 목록
  src/web/ui/contextmenu.js   편집기 · 탭 우클릭 메뉴 (컬러 아이콘)
  src/web/ui/themes.js · icons.js · icon-tones.js · startboard.js · startlayout.js · background.js · tooltip.js
                           (MyUMLMaker 에서 가져온 모듈)

[Guide window]
  guide.html + src/web/guide.js   doc/*.md 를 그려 보여 주는 사용 설명서 · 튜토리얼 창
  src/web/ui/markdown.js           Markdown → HTML (GitHub 식 제목 id, 표, 목록, 그림 …)

[Bridge] (initialization_script)
  src/web/tauri-bridge.js  window.ttsBridge → invoke('tts', { ch, a }), 이벤트 tts:event

[Tauri / Rust]  src-tauri/
  src/lib.rs               프레임 없는 창, 대화 상자·클립보드, 호스트 시작·재시작, 최소 크기 유지
  src/host.rs              Node 호스트와 stdin/stdout JSON 줄 프로토콜

[Node 호스트]  src/host/
  host.mjs                 채널 처리 (옛 electron/main.js 의 ipcMain.handle)
  rpc.mjs                  줄 프로토콜 (MyTerminal 과 같은 형식)
  audio.mjs                PCM ↔ base64 (JSON 숫자 배열 대신)

[TTS 엔진]  src/core/  (변경 없음)
  src/core/ttsService.js   모델별 합성·워밍업
  src/core/modelStore.js   HuggingFace 다운로드·캐시
  src/core/modelCatalog.js 모델 메타데이터
  src/core/wav.js          WAV 인코딩
  src/core/mp3.js          MP3 인코딩
```

---

## 3. IPC 채널

`→Rust`는 Rust가 직접, `→host`는 Node 호스트가 처리합니다.

| 채널 | 방향 | 설명 |
|------|------|------|
| `win:control` / `win:state` | page→Rust | 최소화·최대화·닫기 (메뉴 막대 창 단추) |
| `app:readTextFile` | page→Rust | 최근 파일 다시 열기 (텍스트만) |
| `app:copyText` | page→Rust | 클립보드 쓰기 |
| `app:readClipboard` | page→Rust | 클립보드 읽기 (편집기 우클릭 「붙여넣기」) |
| `app:openGuide` | page→Rust | 사용 설명서 창 `guide` 를 열거나 앞으로 (문서: guide 또는 tutorial, 언어: ko · en) |
| `app:takeRedownload` | page→host | 크래시 복구 뒤 다시 받을 모델 |
| `app:getModelCatalog` | renderer→main | 카탈로그 |
| `app:getCachedModels` | renderer→main | 설치 여부 |
| `app:getCacheDirectory` | renderer→main | 캐시 루트 경로 |
| `app:selectAudioPath` | page→Rust | 통합 저장 대화상자 (WAV/MP3) |
| `app:selectWavPath` | page→Rust | 저장 대화상자 |
| `app:selectMp3Path` | page→Rust | 저장 대화상자 |
| `app:openTextFile` | page→Rust | 텍스트 파일 열기 |
| `app:downloadAndPrepareModel` | page→host | HF 다운로드 |
| `app:modelDownloadProgress` | host→page | 진행률 push |
| `app:speak` | page→host | 텍스트 합성 → `{ audioBase64, sampleRate }` (브리지가 Float32Array로 풀어 `audioBuffer`로 돌려줌) |
| `app:warmModel` | page→host | ONNX/음소화/sherpa 사전 로드 |
| `app:listModelVoices` | page→host | 모델별 보이스 목록 |
| `app:exportWav` | page→host | PCM → WAV 파일 |
| `app:exportMp3` | page→host | PCM → MP3 파일 |

---

## 4. 음성 합성 흐름 (데스크톱)

```
▶ 읽기
  │
  ├─ UI: 상태 "합성 중" + placeholder 파형 표시 (rAF로 페인트 보장)
  │
  ├─ invoke tts(app:speak, { text, modelId, voiceId, speed, language })
  │     └─ Rust → Node 호스트 (stdin 한 줄)
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

**파형·재생·WAV/MP3는 모두 모델이 만든 PCM**을 사용합니다. MP3 인코딩 비트레이트는 UI에서 선택 가능합니다.  
OS Web Speech API는 더 이상 주 경로가 아닙니다.

### 워밍업

모델 선택·부팅·다운로드 완료 후 `app:warmModel` 호출:

- ONNX 세션 생성
- (Kokoro) phonemizer / voice bin 캐시
- (Piper) G2P 로드
- (Supertonic) sherpa `OfflineTts` 생성

첫 클릭 직전의 긴 정지 감을 줄이기 위함입니다. 별도 Node 프로세스에서 수행하므로 화면은 멈추지 않습니다.

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

### 5.2 Supertonic 3 INT8

| | |
|--|--|
| ID | `ko-supertonic-int8` |
| runtime | `sherpa-onnx` |
| Engine | `sherpa-onnx-node` (`OfflineTts` + `GenerationConfig`) |
| Model family | **Supertonic 3** (모델) / **sherpa-onnx** (런타임) |
| Source | `csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11` |
| Config keys | `durationPredictor`, `textEncoder`, `vectorEstimator`, `vocoder`, `ttsJson`, `unicodeIndexer`, `voiceStyle` |
| SR | ~44100 |
| Speakers | `sid` 0…N-1 (UI: Speaker n) |

Supertonic 2 대비 단어 반복/건너뛰기(skip) 실패가 줄어든다.  
카탈로그 `repoId`가 바뀌면 캐시 매니페스트를 비교해 자동으로 재다운로드한다.

`enableExternalBuffer: false`로 외부 ArrayBuffer 제한을 회피합니다 (Electron 시절부터 유지).  
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
| Prefer file | 임베디드 패키지: `onnx/model_q8f16.onnx` (~82MB) + `voices/af_heart.bin` |
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
| Tauri 2 (`src-tauri`) | 데스크톱 셸: 창·대화 상자·클립보드 (`tauri-plugin-dialog`, `-clipboard-manager`) |
| Node.js (설치본에 포함) | 엔진 호스트 런타임 |
| `onnxruntime-node` | Piper / MMS / Kokoro |
| `sherpa-onnx-node` | Supertonic API |
| `sherpa-onnx-win-x64` (및 타 OS) | sherpa 네이티브 |
| `@piper-plus/g2p` | Piper `Encoder` (KSS는 goruut IPA만 사용) |
| goruut | Piper KSS pygoruut 음소화 (`goruutPhonemizer.js`) |
| `phonemizer` | Kokoro 영어 IPA |
| `@huggingface/transformers` | (예약/호환; MMS는 ORT 직접 경로) |
| `@tauri-apps/cli` | 빌드·패키징 (개발 의존성) |

`scripts/build-tauri-web.mjs --release`가 `dist/sidecar/`에 호스트·엔진 소스, `npm ls --omit=dev`로 고른 운영용 `node_modules`(다른 OS용 onnxruntime 바이너리 제외), Node 런타임을 모읍니다. Tauri가 이것을 설치본의 `sidecar/`로 묶습니다.

---

## 8. 웹 모드

`server.js`가 정적 파일을 제공합니다.  
화면의 `ttsBridge`가 없으면 UI는 동작하지만 합성 요청은 데스크톱 앱 필요 오류를 냅니다.

---

## 9. 빌드 산출물

| 플랫폼 | 형식 |
|--------|------|
| Windows | NSIS `.exe` (사용자별 설치, 관리자 권한 불필요; `windows/hooks.nsh`) |
| macOS | `.app` + DMG |
| Linux | AppImage + `.deb` |

아이콘: `src-tauri/icons/` (`npm run icons`가 `assets/icon.png`에서 생성)

---

## 10. 설계 포인트 / 제한

| 항목 | 내용 |
|------|------|
| UI 동결 없음 | 합성은 화면과 다른 프로세스(Node 호스트)에서 수행 |
| 엔진 장애 격리 | 네이티브 크래시는 호스트만 죽임 → Rust가 재시작, 프로그램·창은 유지 |
| 오디오 전송 | Float32 PCM을 base64로 (JSON 숫자 배열은 수 배 커서 긴 문장에서 화면 메모리 부족 위험) |
| 파형 진실성 | placeholder는 대기용, 완료 후 실 PCM으로 교체 |
| Kokoro + 한글 | ko_dict 없음 → 로마자 경로; 품질은 영어 입력이 적합 |
| 웹 추론 | 미구현 |
| GPU / ORT | ORT 추론은 호스트가 띄운 Node 자식 프로세스(`ortChildWorker.mjs`)에서 (sherpa와 onnxruntime DLL 충돌 회피); 설치본에서는 함께 묶인 node.exe 사용 |

---

## 11. 사용 설명서 (doc/)

`doc/UsersGuide.md` · `UsersGuide.en.md` · `Tutorial.md` · `Tutorial.en.md` 와 `doc/images/ko/*.png`.

- 그림은 `npm run guide:images` (`scripts/guide-shots.mjs`)가 실제 디버그 프로그램을 CDP 로 조작해 찍습니다 (모델 복사본으로 실제 합성).
- `scripts/build-tauri-web.mjs` 가 `guide.html` 과 `doc/` 를 `dist/web` 에 넣어 설치본에 포함됩니다.
- 사용 설명서 창은 Rust 가 만드는 두 번째 창 `guide` (데스크톱) 또는 새 탭(웹)입니다. 테마는 main 창과 같은 localStorage 를 읽어 따릅니다.
  main 창이 닫히면 프로그램이 끝납니다 (guide 창이 열려 있어도).

## 12. 시험 (npm test)

`scripts/test.mjs` 가 네 분류를 차례로 돌리고, `scripts/lib/reporter.mjs` 가 영어 · 색 · 열 맞춤으로 결과를 씁니다
(번호 · PASS/FAIL/SKIP · 분류 · 이름 · 시간, 실행 중 줄은 경과 시간과 함께 갱신, 마지막에 분류별 요약 표).

| 분류 | 파일 | 내용 |
|------|------|------|
| unit | `test/unit.mjs` | Node 호스트 줄 프로토콜(카탈로그 · 오류 · WAV · MP3 · 크래시 복구), 실제 합성(모델 복사본), 오디오 base64, 테마 40+2, 시작 보드 배치, 아이콘 · 색, Markdown, 문서 그림 · 링크 · 메뉴 이름, 예제, 설정 일치 |
| rust | `src-tauri/src/lib.rs` tests | 저장 경로 · 파일 이름 · 텍스트 파일 판정 |
| web | `test/web.mjs` | 헤드리스 Edge + server.js: 시작 화면(카드 끌기 · 크기), 테마 42, 메뉴 · 툴바 · 툴팁 · 컬러 아이콘, 탭, 우클릭 메뉴, 음성 설정 저장, 대화 상자, 사용 설명서 페이지 |
| desktop | `test/desktop.mjs` | 실제 Tauri 프로그램(CDP): 합성 · 재생 · 모든 화자 · 탭별 소리 · WAV/MP3 · 파일 · 클립보드 · 창 단추 · 최소 크기 · 사용 설명서 창 · 엔진 재시작 · 종료 |

격리: 데스크톱은 `TTS_CONFIG_DIR` 임시 폴더(모델 복사본 · 로그 · WebView 저장소), 실제 `%APPDATA%\TTSMultiOSV10` 은 모델을 복사할 때 읽기만 합니다 (`scripts/lib/testdata.mjs`).

---

## 관련 문서

- [README.md](./README.md) — 개요 · 실행 · 빌드 · 시험
- [doc/UsersGuide.md](./doc/UsersGuide.md) — 사용 설명서 ([English](./doc/UsersGuide.en.md))
- [doc/Tutorial.md](./doc/Tutorial.md) — 튜토리얼 ([English](./doc/Tutorial.en.md))
