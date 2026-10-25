# MySimulator

여러 상용 툴을 오가지 않고 **신호 처리 · 동역학과 제어(Simulink 형 블록) · 회로(LTspice·Proteus 형) · 유한요소(Ansys·COMSOL 형) · 로봇(Gazebo·Webots 형) · CAD 질량 특성(SolidWorks 형) · 이산 사건(AnyLogic·FlexSim 형) · 통계와 머신러닝 · 몬테카를로와 최적화**를 하나의 노드 파이프라인으로 묶어 실행하는 통합 시뮬레이션 도구입니다. 웹과 Windows · macOS · Linux 에서 같은 화면(MyCAD 스타일, MyHeatManager 와 같은 구성)으로 동작합니다 — **Tauri 2 + JavaScript** 화면, **Rust 엔진**(데스크톱은 네이티브, 웹은 WebAssembly). 설치본은 Node.js 없이 실행됩니다.

- **3층 구조** — 코어 엔진(Rust `sim-core`: 수치 연산, 신호 분석, ODE, 최적화, 신경망) · 연동 층(CSV/JSON 파일, Python 스크립트, 명령줄 도구, 배치 CLI) · GUI(노드 편집기, 대시보드, 보고서).
- **노드 52종**
  - 소스: 신호 발생기(정현·구형·처프·펄스·잡음 …), CSV 데이터 표, 파일 데이터(Excel · WAV · STL · MATLAB .mat · PNG), 난수 표본(분포 10종), 함수 표본
  - 데이터: 계산 열(수식), 행 거르기, 열 선택·정렬, 표 합치기, 재표본화, 미분·적분
  - 신호 처리: FFT(주 주파수·THD), Welch PSD, 필터(버터워스 IIR 영위상 · FIR · 이동 평균 · 중앙값 · 지수), 스펙트로그램, 피크(감쇠비), 상관, 힐베르트 포락선
  - 동역학·제어: 식으로 쓰는 ODE(RK45/RK4/오일러, 프리셋 10종), 전달함수 응답(상승·오버슈트·정착), 보드·나이퀴스트(이득·위상 여유, 지글러-니콜스), 디지털 PID 루프(포화·와인드업 방지·외란·잡음), 상태공간(고유값·가제어/가관측), Simulink 형 블록 다이어그램(적분기·전달함수·PID·지연·영차 유지·릴레이·포화·룩업 …, 대수 루프 검출, **그래픽 블록 편집기**)
  - 회로·물리: SPICE 회로 해석(.op · .dc · .ac · .tran, BJT · MOSFET · 부회로 · B 전원 · .model · .param, LTspice · MyCircuit 넷리스트), 디지털 논리(게이트 지연·플립플롭·카운터·타이밍도·진리표·글리치)와 **마이크로컨트롤러 펌웨어**(8비트 CPU, 어셈블리), 2D 유한요소(열전도 정상·과도, 정전기장, 평면 응력), **3D 유한요소**(CAD 부품의 탄성·열전도)
  - 로봇·다물체: **3D 강체 물리 엔진**(구·상자·캡슐 충돌, 마찰·반발, 볼·힌지 모터·거리 조인트, 스프링, 3D 장면 재생), 이동 로봇(라이다·범퍼·오도메트리·식 제어기·경유점), 로봇 팔 동역학(자유 운동·PID·역기구학)
  - CAD: 부품 특징 트리(더하기·빼기·패턴·대칭)와 질량 특성(부피·질량·무게중심·관성 텐서), STL 메시
  - 통계·ML: 기술 통계, 히스토그램(정규 맞춤·KS), 회귀(다항·지수·거듭제곱·로그·다중), 상관 행렬, k-평균(실루엣), PCA, 신경망 MLP(회귀/분류, Adam, 예측 지도·혼동 행렬)
  - 몬테카를로·최적화: 몬테카를로(무작위/LHS, 민감도, 조건 확률), 확률 과정(GBM · 랜덤 워크 · OU · 점프), 최적화(넬더-미드 · 차분 진화 · BFGS, 제약), 비선형 곡선 맞춤(레벤버그-마쿼트), 매개변수 스윕(1·2차원), 이산 사건 공정(대기열·작업장·경로)
  - 연동: Python 스크립트(NumPy · SciPy · pandas · PyTorch 사용 가능), 외부 프로그램({in}/{out} CSV), 파일 읽기(CSV · JSON · Excel · WAV · STL · MAT · PNG)·쓰기, MyHeatManager 해석 엔진 내장(.myheat 모델을 그대로), MyCircuit 프로젝트 열기
  - 출력: 차트(선·산점·막대·면적·계단·열 지도·위상·표), KPI 값(경보 범위)
- **파이프라인 자동화** — "데이터 입력 → 전처리 → 시뮬레이션 → 결과 리포트" 를 ▶ 한 번이나 `MySimulator --batch pipeline.mysim --set 노드.매개변수=값` 한 줄로 실행합니다. 결과는 요약 JSON · 노드별 CSV · 격자 PNG.
- **보기** — 노드 그래프(미리보기 그래프가 든 노드, 끌어 연결, 빈 곳 끌어 이동, Shift+끌어 상자 선택, 5×5 격자·눈금자, 자동 정렬), 대시보드(차트·KPI 타일), 데이터 보기(차트 + 값 + 표), 3D 궤적·점 구름(three.js, 확대에 맞춰 간격이 바뀌는 바닥 격자와 축), 아래 결과 패널(차트 · 표 · 값 · 실행 기록), 보고서(HTML 저장·인쇄).
- **예제 29종**(한국어/영어: Simulink·LTspice·MyCircuit·Proteus·Ansys/COMSOL·SolidWorks·Gazebo/Webots·AnyLogic·MyHeatManager 형 예제 먼저), 노드 라이브러리, 튜토리얼 36단계, 시작 화면 배경 20종, 라이트 20 · 다크 20 테마, 한국어 / English.

**독립 설치·실행** — 설치 파일 하나에 프로그램, 해석 엔진(MyHeatManager 엔진·MyCircuit 넷리스트 생성기 포함), 예제, 설명서가 모두 들어 있습니다. 다른 프로그램을 설치할 필요가 없고(Python 노드만 PC 의 Python 을 씁니다), 사용자 데이터는 자기 폴더(`%APPDATA%\com.shkwon.mysimulator`)에만 둡니다. 웹 판도 같은 엔진(WebAssembly)으로 서버 없이 동작합니다.

사용법: [사용 설명서](UsersGuide.md) · [User's guide](UsersGuide.en.md) · 튜토리얼: [Tutorial.md](Tutorial.md) · 구조: [ARCHITECTURE.md](ARCHITECTURE.md)

> **English summary** — MySimulator is a unified simulation workbench: signal processing, dynamics and
> control (Simulink-style blocks), circuits (SPICE, digital logic), 2D finite elements, robots, CAD mass
> properties, discrete-event processes, statistics and machine learning, Monte Carlo and optimisation run as one node pipeline on one
> screen, with Python and command-line tool integration, dashboards, reports and batch automation. Tauri 2
> + JavaScript UI, Rust engine (native on the desktop, WebAssembly in the browser).

## 실행과 빌드

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev, 네이티브 엔진)
npm run dev          # 웹 (Vite, http://localhost:1510, WebAssembly 엔진)
npm run build:web    # 웹 배포본 → dist/
npm test             # 전체 시험 (js · engine · rust · wasm · web · desktop)
npm run build:win    # Windows 설치 파일 (NSIS) → release/ 와 프로젝트 폴더
npm run build:mac    # macOS (.dmg) — macOS 에서
npm run build:linux  # Linux (.deb · .rpm · .AppImage) — Linux 에서
```

필요한 것: Node.js 20+, Rust(stable, `wasm32-unknown-unknown` 타깃), Tauri 2 의 플랫폼별 준비물(Windows: WebView2, Linux: webkit2gtk-4.1). Python 노드는 Python 3 이 설치돼 있을 때 씁니다(없으면 그 노드만 오류).

| 명령 | 하는 일 |
| --- | --- |
| `npm run build:wasm` | `engine/sim-wasm` → `public/sim.wasm` |
| `npm run samples` | `samples/*.mysim` (한국어), `samples/en/*.mysim` (영어) 다시 쓰기 |
| `npm run check:samples` | 모든 예제를 WebAssembly 엔진으로 실행해 확인 |
| `npm run docs:capture` | 설명서·튜토리얼 그림을 실제 화면에서 찍고 HTML 문서 만들기 |
| `npm run build:docs` | `UsersGuide*.md`, `Tutorial*.md` → `docs/*.html`, `public/docs/` |
| `npm run build:icons` | `assets/icon.svg` → 모든 아이콘과 설치 프로그램 그림 |
| `node scripts/vendor-mycircuit.mjs` | MyCircuit 의 넷리스트 생성기를 `src/vendor/mycircuit` 로 다시 복사 (MyCircuit 이 바뀐 뒤) |
| `node scripts/vendor-heat-core.mjs` | MyHeatManager 의 해석 엔진을 `engine/heat-core` 로 다시 복사 (MyHeatManager 가 바뀐 뒤) |

## 시험

`npm test` 는 분류마다 결과를 보이고 끝에 요약 표를 냅니다 (`test-results/summary.json`).

- **js** — 카탈로그와 엔진의 노드 종류 일치, 모델·연결·검사, 결과 디코딩, 번역 완전성, 명령·메뉴
- **engine** — `sim-core` 단위 시험과 노드 50종의 해석해 비교(FFT 주파수, 버터워스 −3 dB, 2차계 오버슈트, 보드 여유, M/M/1 대기, RC·RLC·다이오드·BJT·MOSFET, 전가산기·카운터, 유한요소 전도·커패시턴스·외팔보·Kirsch, 진자 주기·에너지 보존, 부피·관성, 회귀 계수, 몬테카를로 분포, 최적점 …), scipy·PIL·zipfile 로 만든 파일(WAV · MAT · PNG · XLSX · STL) 읽기, MyCircuit 넷리스트를 MyCircuit 자체 결과와 비교, 내장 MyHeatManager 엔진의 에너지 수지, 3D 물리(자유 낙하·반발·포물선·마찰·탄성 충돌·진자·스프링·상자 쌓기·모터), 3D 유한요소(인장 봉·외팔보·열전도), 마이크로컨트롤러 펌웨어
- **rust** — 데스크톱 셸(파일, 외부 프로그램 시간 제한, Python 왕복, 배치 `--set`)
- **wasm** — `sim.wasm` 빌드, ABI 스모크, 모든 예제 실행
- **web** — 헤드리스 Edge/Chrome 으로 실제 화면 조작(마우스로 노드 이동·연결·상자 선택·팔레트에서 끌어 놓기, 대화상자, 대시보드, 3D, 튜토리얼)
- **desktop** — 디버그 빌드 프로그램을 WebView2 CDP 로 조작(네이티브 엔진, Python 노드 허락 질문, 파일 노드, 팝아웃 창)과 `--batch`
