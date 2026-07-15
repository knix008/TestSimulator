# Architecture — TTS Multi OS

## 개요

Electron 31 기반 TTS 애플리케이션. 렌더러(UI)와 메인 프로세스(파일/네트워크)가 IPC로 통신.
동일한 UI 코드가 Electron과 웹 브라우저 양쪽에서 동작하도록 설계됨.

---

## 레이어 구조

```
[Renderer / Browser]
  src/web/main.js        ← UI 로직, 이벤트 핸들러
  src/web/styles.css     ← 테마 토큰 (dark/light), 레이아웃
  index.html             ← DOM 구조

[Electron Bridge]
  electron/preload.js    ← contextBridge 노출 (ttsBridge)
  window.ttsBridge       ← 렌더러에서 사용하는 API 객체

[Main Process]
  electron/main.js       ← BrowserWindow, ipcMain.handle, dialog
  src/core/
    modelCatalog.js      ← 모델 메타데이터 목록
    modelStore.js        ← 다운로드, 캐시 관리, 매니페스트
    ttsService.js        ← synthesizeText (현재: 파형 생성 fallback)
    wav.js               ← WAV 파일 내보내기
    errorDialog.js       ← 오류 포맷터
```

---

## IPC 채널 목록

| 채널 | 방향 | 설명 |
|------|------|------|
| `app:getModelCatalog` | renderer→main | 모델 목록 반환 |
| `app:getCachedModels` | renderer→main | 설치된 모델 목록 |
| `app:getCacheDirectory` | renderer→main | 캐시 경로 반환 |
| `app:selectWavPath` | renderer→main | 저장 경로 선택 대화상자 |
| `app:openTextFile` | renderer→main | 텍스트 파일 열기 대화상자 |
| `app:downloadAndPrepareModel` | renderer→main | 모델 다운로드 시작 |
| `app:speak` | renderer→main | 텍스트 합성 (현재 fallback wave) |
| `app:exportWav` | renderer→main | WAV 파일 저장 |
| `app:modelDownloadProgress` | main→renderer | 다운로드 진행률 push 이벤트 |

---

## 음성 합성 흐름

```
사용자 클릭 "읽기"
  │
  ├─ [Web Speech API] window.speechSynthesis.speak(utterance)
  │    ├─ lang: languageSelect.value
  │    ├─ voice: getVoicesForModel(modelId, lang)  ← 모델별 다른 OS 음성
  │    ├─ rate/volume/pitch: 슬라이더 값
  │    └─ onboundary → 파형 playhead 동기화
  │
  └─ [파형 시각화] generateSpeechLikeWaveform(text)
       ├─ 텍스트 구조 분석 (단어/문장/쉼표)
       ├─ charSampleMap: 문자 인덱스 → 샘플 위치 매핑
       └─ canvas에 파형 렌더링 + 재생 헤드 애니메이션
```

---

## 모델 다운로드 흐름

```
"↓ 다운로드" 클릭
  │
  ├─ IPC: app:downloadAndPrepareModel(modelId)
  │
  ├─ modelStore.ensureModelAvailable()
  │    ├─ 매니페스트 존재 확인 (.download-manifest.json)
  │    ├─ HuggingFace API로 파일 목록 조회
  │    ├─ HEAD 요청으로 파일 크기 조회
  │    ├─ 파일 다운로드 (청크 단위, 진행률 이벤트 발생)
  │    └─ 매니페스트 저장
  │
  └─ IPC push: app:modelDownloadProgress → 렌더러 progress 업데이트
```

---

## 빌드 설정

`electron-builder`를 사용. `package.json`의 `"build"` 필드에 정의.

| 플랫폼 | 형식 | 아이콘 |
|--------|------|--------|
| Windows | NSIS (.exe) | assets/icon.png (→ .ico 자동 변환) |
| macOS | DMG | assets/icon.png (→ .icns 자동 변환) |
| Linux | AppImage + .deb | assets/icon.png |

Windows NSIS: `oneClick: false`로 사용자가 설치 옵션 선택 가능.

---

## 향후 개선 사항

- ONNX Runtime 통합으로 다운로드된 모델 실제 추론
- onnxruntime-node 또는 sherpa-onnx Node.js 바인딩 사용
- 한국어: Piper KSS / Supertonic ONNX 추론
- 영어: Kokoro 82M ONNX 추론
