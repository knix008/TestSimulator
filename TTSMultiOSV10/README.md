# TTS Multi OS

Electron 31 + Web 기반 멀티 플랫폼 TTS(Text-to-Speech) 애플리케이션.
한국어/영어 지원, 모델 다운로드, 파형 시각화, WAV 내보내기 기능 포함.

**개발자**: SHKWON (knix008@naver.com)  
**버전**: 0.1.0

---

## 지원 모델

| 모델 | 언어 | 런타임 | 크기 |
|------|------|--------|------|
| Piper KSS | 한국어 (ko-KR) | piper-onnx | 64 MB |
| Supertonic INT8 | 한국어 (ko-KR) | sherpa-onnx | ~200 MB |
| MMS TTS | 한국어 (ko-KR) | transformers-js | 140 MB |
| Kokoro 82M | English (en-US) | onnx | ~310 MB |

---

## 실행

```bash
# 데스크톱 앱 (Electron)
npm start

# 웹 브라우저 미리보기
npm run web
```

## 빌드

```bash
# Windows 설치 파일 (.exe NSIS 인스톨러)
npm run build:win

# macOS 디스크 이미지 (.dmg)
npm run build:mac

# Linux (AppImage + .deb)
npm run build:linux

# 현재 플랫폼으로 빌드
npm run build
```

빌드 결과물은 `dist/` 디렉토리에 생성됩니다.

### Windows 설치 옵션
NSIS 인스톨러 실행 시 사용자가 선택 가능:
- 설치 디렉토리 변경
- 바탕화면 바로가기 생성 여부
- 시작 메뉴 바로가기 자동 생성

---

## 폴더 구조

```
TTSMultiOSV10/
├── electron/           # Electron 메인 프로세스 + preload
│   ├── main.js         # IPC 핸들러, 창 생성
│   └── preload.js      # contextBridge 노출
├── src/
│   ├── core/           # 모델 카탈로그, 다운로드, TTS 서비스
│   └── web/            # 렌더러 UI (main.js, styles.css)
├── assets/             # 아이콘 (icon.png, icon.svg)
├── samples/            # 예제 텍스트 파일
├── index.html          # 메인 HTML
└── server.js           # 웹 모드 서버
```

---

## 현재 상태

- **음성 출력**: OS 내장 TTS(Web Speech API) 사용 — ONNX 모델 추론은 향후 구현 예정
- **모델 다운로드**: HuggingFace에서 ONNX 파일 다운로드 완료
- **WAV 내보내기**: 파형 데이터를 WAV 파일로 저장
- **파형 시각화**: 텍스트 구조 기반 파형 생성 및 재생 동기화
