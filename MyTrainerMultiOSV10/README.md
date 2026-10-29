# MyTrainer

신경망을 **그려서** 만들고, 데이터를 전처리하고, 학습시키면서 **층과 뉴런 하나하나가 하는 일**을 눈으로 보고, 학습된 모델을 바로 시험하는 프로그램입니다. 웹과 Windows · macOS · Linux 에서 같은 화면으로 동작합니다(Tauri 2 + JavaScript).

- **시각적 모델 편집** — 팔레트에서 층을 끌어다 놓고, 포트를 끌어 연결하고, 빠른 단추(끼우기 · ±뉴런 · 바꾸기 · 잔차 연결)와 블록으로 코딩 없이 모델을 고칩니다. 모양과 매개변수 수가 자동으로 계산되고 문제는 바로 표시됩니다.
- **데이터 전처리** — 내장 데이터(점 · 함수 · 표 · 그림 · 문자 · 음성 · 영상 · 시퀀스 · 텍스트), **한국어 키워드 음성**(Supertonic TTS 화자 120명, 5520개), CSV, 그림 폴더, 음성 폴더. 표준화 · 정규화 · 다항 특성 · 증강 단계, 층화 분할.
- **학습 시각화** — 손실 · 정확도 곡선, 결정 경계, 기울기 흐름, 층별 가중치 분포, 그리고 **뉴런 보기**: 뉴런 · 특징 맵 · 시간 걸음을 누르면 그 값의 계산(입력 × 가중치 + 편향 → 활성화, 합성곱 수용 영역, LSTM/GRU 게이트)을 엔진이 계산한 값과 비교해 보여 줍니다.
- **테스트** — 테스트 샘플, 직접 그린 숫자, 평면의 점, 입력한 문장 · 값으로 예측. 혼동 행렬 · 클래스별 지표 · 틀린 샘플 · 회귀 그림 · 오토인코더의 **복원 오차가 큰 샘플**(이상 후보).
- **두 엔진** — 앱 안의 **TensorFlow**(TensorFlow.js — WebGPU · WebGL · CPU), 그리고 데스크톱의 **PyTorch**: 이미 PyTorch 가 설치된 Python(conda · venv · PATH …)을 찾아 쓰고, 없을 때만 전용 가상 환경에 자동 설치합니다.
- **PyTorch 코드** — 모델에서 만든 읽기 쉬운 PyTorch 스크립트를 보고 고쳐서 실행. Python 문법 강조 · 자동 완성 · 설명, Python/PyTorch **사전**(문법, 딕셔너리 메서드, torch · nn · optim …).
- **샘플 54종** — 퍼셉트론 · MLP · 다항 회귀 · **비교 예제**(활성화 함수 · 과적합과 정규화 · 기울기 소실 · RNN/GRU/LSTM) · CNN(VGG · Inception · DenseNet · MobileNet) · 오토인코더(잡음 제거 · 이상 탐지) · Conv1D · CNN + LSTM · 트랜스포머(감성 · 시계열 · 미니 GPT) · 임베딩 · 잔차 · 와이드 & 딥 · OCR · 음성/키워드 인식(한국어 2종, ResNet CNN · DS-CNN · BC-ResNet · 실시간용 BC-ResNet+) · 영상.
- **시작 안내 창 · 튜토리얼** — 시작할 때 안내 창(다음부터 보이기 선택), 화면을 짚어 가는 19단계 튜토리얼과 그 문서 · 영상. 사용 설명서 창은 언어 · 글자 크기 · 글꼴을 바꾸고 앱 테마를 따릅니다.
- 시작 화면의 **인공지능 테마 배경 20종**, 라이트 20 · 다크 20 테마, 한국어 / English.

사용법: [사용 설명서](UsersGuide.md) · [User's guide](UsersGuide.en.md) · [튜토리얼](Tutorial.md) · [Tutorial](Tutorial.en.md) · 구조: [ARCHITECTURE.md](ARCHITECTURE.md)

## 실행

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev, 빈 포트를 골라 Vite 실행)
npm run dev          # 웹판 (브라우저에서 http://localhost:1470, 쓰는 중이면 다른 포트)
```

필요한 것: Node.js 20 이상, Rust(데스크톱), Windows 는 WebView2(설치 파일에 부트스트래퍼가 들어 있어 없으면 자동 설치). PyTorch 엔진은 선택 사항입니다.

## 빌드

```bash
npm run build:win    # MyTrainer-Setup-<버전>.exe (NSIS)
npm run build:mac    # .dmg  (macOS 에서)
npm run build:linux  # .deb / .rpm / .AppImage  (Linux 에서)
npm run build:web    # dist/ — 정적 웹판
npm run build:docs   # docs/UsersGuide*.html, docs/Tutorial*.html
npm run tutorial:capture  # 튜토리얼 단계마다 화면 캡처 → Tutorial.md · Tutorial.en.md (+ build:docs)
npm run tutorial:video    # 튜토리얼 자동 재생 녹화 → docs/video/MyTrainer-Tutorial.mp4 (무음, ffmpeg 필요)
npm run build:icons  # assets/icon.svg → 모든 아이콘
npm run samples      # samples/ (.mytrain 예제, CSV 예제)
npm run data         # data/ (가져오기 · 예측용 예제 파일)
npm run data:kws     # 한국어 키워드 음성 (Supertonic, .venv-tts 자동 생성, 오래 걸림) → public/datasets/kws-ko.bin
npm run data:kws-attend  # 출근·퇴근·외출·복귀 음성 → public/datasets/kws-ko-attend.bin
```

## 테스트

```bash
npm test             # 단위(JS · Rust) + 웹 E2E + 데스크톱 E2E, 끝에 요약
npm run test:unit    # JS + Rust 만
```

- JS: 도메인(층 · 그래프 · 데이터 · 전처리 · 프로젝트 · 코드 생성 · 지표 · 사전), TensorFlow.js 학습기, **뉴런 설명이 엔진 값과 같은지**(TF.js · PyTorch 둘 다), 모든 샘플의 PyTorch 학습.
- PyTorch 테스트는 PyTorch 가 있는 Python 을 자동으로 찾습니다(`MYTRAINER_PYTHON` 으로 지정 가능).
- 데스크톱 E2E 는 `tauri build --debug --no-bundle` 로 만든 실제 프로그램을 WebView2 DevTools 로 조작합니다(소스가 바뀌면 자동으로 다시 빌드).

© SHKWON (knix008@naver.com)
