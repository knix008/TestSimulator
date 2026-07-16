# TTS Multi OS

Electron 31 기반 멀티 플랫폼 TTS(Text-to-Speech) 애플리케이션.  
설치한 **ONNX / sherpa-onnx 모델 고유 추론**으로 음성을 합성하고, 동일 PCM으로 파형을 표시·WAV로 저장합니다.

**개발자**: SHKWON (knix008@naver.com)  
**버전**: 0.1.0

---

## 주요 기능

- 한국어 / 영어 모델 카탈로그 (HuggingFace 공개 레포 다운로드)
- 모델별 실제 추론 (OS Web Speech 폴백 없음 — Electron 모드)
- 모델 보이스 선택 (Kokoro 보이스 파일, Supertonic Speaker ID 등)
- 합성 PCM 기반 파형 시각화 + 재생
- WAV 내보내기
- 다크 / 라이트 테마
- Worker Thread에서 합성 (UI 멈춤 완화) + 모델 워밍업

> 웹 모드(`npm run web`)는 UI 미리보기용입니다. **실제 모델 합성은 Electron(`npm start`)에서만** 지원합니다.

---

## 지원 모델 · 엔진

| 모델 ID | UI 이름 | 언어 | 런타임 키 | 추론 엔진 | HuggingFace 레포 | 대략 크기 |
|---------|---------|------|-----------|-----------|------------------|-----------|
| `ko-piper-kss` | Piper KSS | ko-KR | `piper-onnx` | **onnxruntime-node** + **goruut/pygoruut** IPA + `@piper-plus/g2p` Encoder | [neurlang/piper-onnx-kss-korean](https://huggingface.co/neurlang/piper-onnx-kss-korean) | ~64 MB (+ goruut ~96 MB) |
| `ko-supertonic-int8` | Supertonic 3 INT8 | ko-KR (+31언어) | `sherpa-onnx` | **sherpa-onnx-node** (`OfflineTts` · Supertonic 3) | [csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11](https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11) | ~140 MB |
| `ko-mms-tts` | MMS TTS | ko-KR | `transformers-js` | **onnxruntime-node** + 한글 로마자화(uroman 스타일) | [Xenova/mms-tts-kor](https://huggingface.co/Xenova/mms-tts-kor) | ~140 MB |
| `en-kokoro` | Kokoro 82M | en-US | `onnx` | **onnxruntime-node** + `phonemizer`(eSpeak-NG) | [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | ~82 MB (`model_q8f16` + `af_heart`) |

### 엔진 역할 요약

| 엔진 / 라이브러리 | 역할 |
|-------------------|------|
| `onnxruntime-node` | Piper / MMS / Kokoro ONNX 세션 추론 |
| `sherpa-onnx-node` (+ `sherpa-onnx-win-x64` 등) | Supertonic TTS (duration / encoder / vocoder 파이프라인) |
| `@piper-plus/g2p` | Piper phoneme ID `Encoder` (IPA 인코딩만; KSS는 goruut IPA 사용) |
| goruut (neurlang) | Piper KSS용 pygoruut 한국어 음소화 (로컬 HTTP) |
| `phonemizer` | Kokoro용 영어 IPA (eSpeak-NG) |
| Worker (`src/core/ttsWorker.js`) | 합성·워밍업을 메인 프로세스 밖에서 실행 |

상세 파이프라인은 [Architecture.md](./Architecture.md), 사용법은 [UsersGuide.md](./UsersGuide.md)를 참고하세요.

---

## 실행

```bash
# 의존성
npm install

# 데스크톱 앱 (권장 — 모델 합성)
npm start

# 웹 UI 미리보기만
npm run web
```

모델 캐시 위치:

- Windows: `%APPDATA%\TTSMultiOSV10\models\`
- macOS / Linux: `~/TTSMultiOSV10/models/` (또는 `$HOME`)

---

## 빌드

```bash
npm run build:win    # Windows NSIS (.exe)
npm run build:mac    # macOS DMG
npm run build:linux  # AppImage + .deb
npm run build        # 현재 플랫폼
```

결과물: `dist/`  
네이티브 모듈(`onnxruntime-node`, `sherpa-onnx-*`)은 `asarUnpack`으로 패키징됩니다.

---

## 폴더 구조

```
TTSMultiOSV10/
├── electron/
│   ├── main.js              # BrowserWindow, IPC
│   ├── preload.js           # window.ttsBridge
│   └── ttsWorkerHost.js     # Worker 브리지
├── src/
│   ├── core/
│   │   ├── modelCatalog.js  # 모델 메타데이터
│   │   ├── modelStore.js    # HF 다운로드·캐시
│   │   ├── ttsService.js    # 모델별 synthesize / warm
│   │   ├── ttsWorker.js     # Worker 엔트리
│   │   ├── wav.js
│   │   └── errorDialog.js
│   └── web/                 # 렌더러 UI
├── assets/
├── samples/
├── index.html
├── server.js
├── Architecture.md
├── UsersGuide.md
└── README.md
```

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| Piper / Supertonic / MMS / Kokoro 실추론 | 구현됨 (Electron) |
| 모델 PCM → 파형 / 재생 / WAV | 구현됨 |
| 모델 보이스 UI | 구현됨 |
| Worker 합성 + 워밍업 | 구현됨 |
| 웹 모드 실추론 | 미지원 (미리보기만) |

---

## 문서

- [사용자 가이드](./UsersGuide.md)
- [아키텍처](./Architecture.md)

## 연락처

- **개발자**: SHKWON  
- **이메일**: knix008@naver.com  
- **버전**: 0.1.0
