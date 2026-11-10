# MyPhotoCut

사진 한 장을 40가지 화풍의 캐리커처로 한 번에 바꾸는 프로그램입니다. Windows · macOS · Linux 데스크톱(Tauri 2)과 웹 브라우저에서 같은 코드로 실행됩니다. GUI는 MyUMLMakerMultiOSV10의 셸(제목 표시줄 겸 메뉴 막대, 아이콘+이름 툴바, OS 창 팝업, 테마 40종, 움직이는 배경의 시작 화면, 상태 표시줄)을 이어받았습니다.

## 기능

- **얼굴 자동 인식**: MediaPipe 얼굴 모델(478점)과 인물 분리 모델을 프로그램에 넣어 인터넷 없이 동작. 모델을 쓸 수 없으면 피부색 기반 자체 검출로 대신합니다. 특징점은 끌어서 고칠 수 있습니다.
- **과장 변형**: 머리·눈·코·입·턱 길이·턱 너비·이마·볼을 매끄럽게 확대/축소(접힘 없는 역방향 워프).
- **40가지 스타일**을 사진마다 한 장씩 동시에 그림(웹 워커 여러 개, 화면용 480px 기준 40장 약 3초).
- **효과 20종**: 색 조정, 배경 바꾸기, 인물 테두리, 비네팅, 필름 입자, 세피아, 흑백, 듀오톤, 반전, 흐림, 선명하게, 글로우, 엠보스, 포스터화, 망점, 모자이크 + 액자, 문구, 말풍선, 스티커.
- **보기 방식 5종**(격자·큰 격자·작은 타일·목록·가로 띠), 원본 비교, 확대/축소, 실행 취소/다시 실행.
- **입력 형식**: JPEG·PNG·WebP·AVIF·GIF·BMP·ICO·SVG + TIFF·TGA·PSD·QOI·PPM/PGM/PBM(자체 해독), 카메라, 클립보드.
- **저장 형식**: PNG·JPEG·WebP·AVIF·GIF·BMP·TIFF·TGA·PPM·QOI·ICO·PDF·SVG, 전체 ZIP, 모음 시트, `.mypcut` 프로젝트.
- 한국어/영어, 다크·라이트 테마, 창 위치·크기 기억.

## 실행

```bash
npm install          # 의존성 + 얼굴 모델(public/mediapipe) 준비
npm start            # 데스크톱 앱 (빈 포트를 골라 Vite + tauri dev)
npm run dev          # 웹 버전 (브라우저)
```

## 빌드

```bash
npm run build:win    # Windows 설치 파일 → release/, 프로젝트 루트
npm run build:mac    # macOS (.app, .dmg)
npm run build:linux  # Linux (.deb, .rpm, .AppImage)
npm run build:web    # 웹 배포본 → dist/
```

## 테스트

```bash
npm test             # 단위 테스트(JS) + Rust + 웹 GUI 확인 (헤드리스 Edge)
npm run test:unit    # JS + Rust
npm run test:gui     # 웹 GUI만
```

## 기타 스크립트

| 명령 | 내용 |
|---|---|
| `npm run assets` | 얼굴 모델·WASM 다시 받기 |
| `npm run samples` | 예제 사진(퍼블릭 도메인) 다시 받기 |
| `npm run build:icons` | 앱·문서 아이콘, 설치 화면 그림 생성 |
| `npm run build:docs` | 사용 설명서 HTML 생성 |
| `npm run i18n` | 번역 사전(src/i18n) 생성 |

## 문서

- [UsersGuide.md](UsersGuide.md) — 사용 설명서 (영문: [UsersGuide.en.md](UsersGuide.en.md))
- [ARCHITECTURE.md](ARCHITECTURE.md) — 구조와 설계

## 라이선스 정보

- 얼굴 모델: MediaPipe Face Landmarker, Selfie Segmenter (Google, Apache-2.0)
- 예제 사진: Wikimedia Commons 퍼블릭 도메인 (public/samples/CREDITS.md)

© SHKWON (knix008@naver.com)
