# MyTrainer 구조

코드를 고치거나 기능을 더하려는 개발자를 위한 문서입니다. 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 한눈에

```
┌──────────────────────── 메인 창 (label "main") ─────────────────────────┐
│ src/app.js  메뉴 막대 · 툴바 · 팔레트 · 작업 탭 · 속성 · 아래 패널 · 상태   │
│   ├ domain/*        프로젝트 · 그래프 · 층 · 데이터 · 전처리 · 코드 생성    │
│   ├ ui/graphview    층 그래프 편집기 (SVG)                                │
│   ├ ui/neuronview   뉴런 보기 (canvas)        ui/inspector  속성 패널     │
│   ├ ui/dataview · trainview · testview · codeview(CodeMirror 6)           │
│   └ engine/engines  TfEngine ──► engine/worker.js (Web Worker, TF.js)     │
│                     TorchEngine ─► Rust py_run ─► python train.py         │
└──────────────┬─────────────────────────────────────────┬────────────────┘
               │ invoke / emit (Tauri IPC)                │ localStorage + 메시지
┌──────────────▼───────────────────────┐   ┌──────────────▼────────────────┐
│ src-tauri/src (Rust)                  │   │ 팝업 창 (label "popup-<kind>") │
│  lib.rs     명령 · 창 · 팝업 · 패닉 훅 │   │ src/popup.js                   │
│  python.rs  Python 찾기 · PyTorch 설치 │   │ settings about confirm error   │
│             · 학습 실행 (stdin/stdout) │   │ progress pyenv samples prompt  │
│  files.rs · window_state.rs · fonts.rs │   │ shortcuts                      │
└───────────────────────────────────────┘   └────────────────────────────────┘
```

하나의 번들(`index.html` + `src/main.js`)이 모든 창을 맡습니다. `main.js` 는 창 라벨(데스크톱) 또는 `?popup=<kind>`(웹 프레임)을 보고 `app.js` 나 `popup.js` 를 불러옵니다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/domain/layers.js` | 층 카탈로그: 종류별 매개변수, 모양 추론(배치 축 없이, 채널이 마지막), 매개변수 수, 팔레트 묶음, 블록, 활성화 함수 식 |
| `src/domain/graph.js` | 모델 그래프(노드 = 층, 간선 = 텐서): 추가 · 연결(순환 금지) · 끼우기 · 삭제(이어 붙임) · 바꾸기 · 복제 · 잔차 · 블록 · 위상 정렬 · 모양 · 검증 · 자동 배치 · 파일 복구 |
| `src/domain/datasets.js` | 씨앗이 있는 내장 데이터 생성기 18종(획 래스터화로 만든 숫자·도형 그림 포함), CSV 파서와 표 → 데이터, 그림 → 데이터, 통계 |
| `src/domain/preprocess.js` | 층화 분할, 전처리 단계(학습 데이터로 맞추고 셋 모두 적용, 증강은 학습 데이터만), 정답 원-핫, `transformInput`(직접 입력에 같은 전처리) |
| `src/domain/project.js` | `.mytrain` 형식(직렬화 · 파싱 · 복구), 학습 설정, `effectiveTask`(이진 분류 출력 1개/2개), 손실 선택, 학습률 일정 |
| `src/domain/samples.js` | 샘플 23종(`graphOf` 로 층 목록 → 그래프) |
| `src/domain/codegen.js` | 그래프 → PyTorch 스크립트. 텐서마다 배치(layout: flat · nhwc · nchw · nlc · ncl)를 추적해 필요한 `permute`/`transpose` 를 넣고, same 패딩(보폭 > 1)은 `ZeroPad2d`, Keras BN 모멘텀은 `1 − m` |
| `src/domain/pydict.js` | Python · PyTorch 사전(편집기 완성 · 설명 · 사전 패널) |
| `src/domain/metrics.js` | 혼동 행렬, 정밀도 · 재현율 · F1, MAE · RMSE · R² |
| `src/domain/settings.js` | 설정 · 최근 파일 · 실행 취소 기록(`History`) · 설치 후 초기화 |
| `src/engine/tfbuild.js` | 그래프 → TF.js 함수형 모델(+ 모든 노드를 출력하는 probeModel), 가중치 이름 정규화 |
| `src/engine/trainer-core.js` | TF.js 학습기: build · data · train(일시정지 · 한 배치 · 정지 · 조기 종료 · 학습률 일정) · snapshot(모든 노드 활성값, 가중치, 통계, 기울기) · 결정 경계/곡선 · 평가 · 예측 · 가중치 내보내기/가져오기 |
| `src/engine/worker.js` | Web Worker: 백엔드 선택(WebGPU → WebGL → CPU), 메시지를 하나씩 처리(제어 메시지는 즉시) |
| `src/engine/engines.js` | `TfEngine`(Worker) · `TorchEngine`(Rust 실행 + 브리지 메시지) — 같은 이벤트를 냄 |
| `src/engine/internals.js` | **뉴런 설명**: 스냅샷으로 유닛 하나의 계산을 다시 함(완전연결 · 합성곱 1D/2D · 풀링 · BN · 임베딩 · Add/Concat · RNN/LSTM/GRU 게이트 펼치기 — GRU 는 TF.js 의 reset-before 와 PyTorch 의 reset-after 모두) |
| `src/ui/*` | 화면: 그래프 편집기, 뉴런 보기, 속성, 데이터 · 학습 · 테스트 · 코드 탭, 차트, 시작 화면, 배경 20종 |
| `src/platform/native.js` | 플랫폼 경계(데스크톱: Rust 명령, 웹: 브라우저 API) · `popups.js` 팝업 호스트 |
| `src/i18n/ko.js`, `en.js` | UI 문자열(키가 같음 — 테스트가 확인) |
| `python/mytrainer_bridge.py` | PyTorch 스크립트의 `mt` 모듈: 데이터 로드, 배치(명령 처리), trace · watch, 보고, 스냅샷(가중치를 TF.js 와 같은 이름·배치로 변환: Linear 전치, Conv 커널 축 순서, GRU 게이트 순서 r,z,n → z,r,h), 평가, serve |
| `python/env_probe.py` | Python 하나를 검사(버전, torch, CUDA/MPS, numpy, pip, venv) |
| `src-tauri/src/python.rs` | 후보 경로(환경 변수, 전용 환경, venv, conda, PATH, py 실행기, 설치 폴더, pyenv) → 병렬 검사 → 선택(CUDA > MPS > 전용 > 최신 torch), 설치(venv + pip, 취소 가능, 줄마다 이벤트), 실행(run 폴더, stdout 의 `@@MT ` 줄 = 브리지 메시지, stdin = 명령) |
| `scripts/` | `start.mjs`(빈 포트), `build.mjs`(설치 파일), `test.mjs`(전체 테스트), `build-docs.mjs`, `render-icons.mjs`, `make-samples.mjs`, `port.mjs` |
| `test/unit` | node:test — 도메인, 학습기, 뉴런 설명 일치(TF.js · PyTorch), 샘플 전체 PyTorch 학습 |
| `test/e2e` | `web.suite.mjs`(헤드리스 Edge), `desktop.suite.mjs`(실제 프로그램 + WebView2 DevTools), 개발용 스크린샷 도구 |

## 엔진 메시지

두 엔진이 같은 메시지를 냅니다: `ready` · `built` · `status`(training · paused · serving · idle) · `batch` · `epoch` · `snapshot` · `boundary` · `curve` · `evaluation` · `prediction` · `done` · `error` · `log`, PyTorch 는 `output`(print) · `exit` 도.

`snapshot.nodes[nodeId] = { act: { shape, data }, weights: { kernel, bias, … }, stats: { … }, grads: { kernel: { meanAbs, data } } }` — 모양은 채널이 마지막, 가중치 이름과 배치는 Keras 기준. PyTorch 브리지는 층 이름으로 보내고 `TorchEngine` 이 노드 id 로 바꿉니다.

## 규칙

- 모든 변경은 `commit()` 을 거칩니다: 실행 취소 기록, 변경 표시, 모양·문제 재계산, 생성 코드 갱신, 세션 저장.
- 학습 중에는 TF.js 모델을 다시 만들지 않습니다(편집은 다음 실행에 반영).
- 스냅샷의 기울기 계산은 BN 이동 통계를 바꾸지 않도록 저장했다가 되돌립니다(TF.js · PyTorch 모두).
- PyTorch 실행은 Python 이 찾은 그대로 씁니다. 설치는 사용자가 누를 때만, MyTrainer 전용 가상 환경에만 합니다.
