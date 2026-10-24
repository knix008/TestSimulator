# MyHeatManager

장치의 열을 시뮬레이션하는 프로그램입니다. 2D 단면이나 3D 적층 모델을 그리고 재료·열원·경계 조건을 정하면 온도·열유속·유속·응력과 수명, 히트맵을 계산합니다. 웹과 Windows · macOS · Linux 에서 같은 화면(MyCAD 스타일)으로 동작합니다 — **Tauri 2 + JavaScript** 화면, **Rust 해석 엔진**(데스크톱은 네이티브, 웹은 WebAssembly). 설치본은 Node.js 없이 실행됩니다.

- **열전도** — 정상·과도, 2D·3D, 이방성·온도 의존 열전도율, 대류·복사(심우주 포함)·열유속·고정 온도·단열·접촉 열저항 경계 (Ansys Workbench, SOLIDWORKS Simulation)
- **상변화** — 겉보기 열용량법, 액상률 (COMSOL)
- **유동 + 연성 열전달(CHT)** — 2D 비압축성 유동, 강제·자연 대류, k-ω SST 난류, 팬 곡선 운전점, 다공성 매체(다르시-브링크만), 미세 유체 (SimScale, Icepak, STAR-CCM+, COMSOL)
- **줄 발열 · 생체 열전달** — 전위장(전압·접지·전류 유입), 온도 의존 전기 저항, Pennes 식(관류·대사열) (COMSOL)
- **열응력 · 정적 구조 · 모드** — 2D 평면 응력/변형률, 3D, 압력·힘 하중, 자중, 고유 진동수 (Ansys, Simcenter 3D)
- **배터리** — 전류 시간표 I²R 줄 발열, 주행 사이클 과도 해석 (Simcenter)
- **열 쾌적성 · 매개변수 연구** — ISO 7730 PMV/PPD, 값 하나를 바꿔 가며 결과 비교 (SimScale)
- **열분석** — DSC 잠열·녹는점(표준 물질 보정, 상변화 재료 만들기), TGA 분해 온도
- **신뢰성** — 아레니우스 MTTF·FIT, 코핀-맨슨 솔더 피로, 직렬 시스템 수명 (Ansys Sherlock)
- **U-값** — 창호·벽체 단면 열관류율, L2D, 결로·곰팡이 위험(fRsi, 이슬점) (THERM)
- **히트맵·배치 API** — 절점 온도 CSV 히트맵·통계, `--batch` 명령줄 일괄 실행 → JSON·CSV·PNG (NASA HAM)
- **주고받기** — CSV · PNG · VTK · CalculiX `.inp` 내보내기, DXF 가져오기, 해석 보고서(HTML)
- **인쇄 창** — 용지·방향·여백·인쇄할 내용·머리글/바닥글을 고르며 여러 쪽 미리보기
- **화면** — 시스템 제목 표시줄 없는 제목 줄(모델 이름 · 홈 · 창 단추), 테마 목록(어두운/밝은 두 열 + 사용자 정의), 접히는 좌우·아래 패널, 3D 보기의 무한 격자·눈금 좌표축, 탭 환경 설정(실시간 미리 보기). 데스크톱에서는 대화 상자와 펼침 메뉴가 **각자의 창**으로 열려 주 창 밖까지 펼쳐집니다
- **시작 화면** — 분야별 새로 만들기 템플릿 · 최근 파일 · 도움말 · 예제, 옮기고 크기를 바꿀 수 있는 카드, 움직이는 배경 20종(투명도·속도)
- **튜토리얼** — 실제 화면을 움직이는 12장 72단계 가이드 투어(자동 재생 · 장 목록), 화면 그림이 들어간 [튜토리얼 문서](Tutorial.md) · [Tutorial](Tutorial.en.md), 녹화 영상
- 예제 36종(튜토리얼 예제 포함), 재료 라이브러리 48종, 테마 40종(MyCAD 와 같음) + 사용자 정의, 한국어 / English

사용법: [튜토리얼](Tutorial.md) · [사용 설명서](UsersGuide.md) · [User's guide](UsersGuide.en.md) · 구조: [ARCHITECTURE.md](ARCHITECTURE.md)

## 실행

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev)
npm run dev          # 웹판 (http://localhost:1490) — heat.wasm 을 먼저 빌드함
```

필요한 것: Node.js 20 이상(개발용), Rust 와 `wasm32-unknown-unknown` 타깃(`rustup target add wasm32-unknown-unknown`), Windows 는 WebView2(설치 파일에 부트스트래퍼 포함).

## 빌드

```bash
npm run build:win    # MyHeatManager-Setup-<버전>.exe (NSIS)  — Windows 에서
npm run build:mac    # .dmg                                    — macOS 에서
npm run build:linux  # .deb / .rpm / .AppImage                 — Linux 에서
npm run build:all    # 이 OS 에서 만들 수 있는 것 전부
npm run build:web    # dist/ — 정적 웹판 (heat.wasm 포함, 아무 웹 서버에나 올리면 됨)
npm run build:wasm   # public/heat.wasm 만
npm run build:docs   # docs/UsersGuide*.html · docs/Tutorial*.html
npm run build:icons  # assets/icon.svg → 모든 아이콘
npm run samples      # samples/*.myheat
npm run tutorial:capture  # 튜토리얼 각 단계를 실제 화면에서 캡처 → Tutorial.md · Tutorial.en.md · docs/Tutorial*.html
npm run tutorial:video    # 튜토리얼 자동 재생 녹화 → MyHeatManager-Tutorial.mp4 (프로젝트 루트, ffmpeg 필요)
```

설치 파일은 `release/` 와 프로젝트 루트에 복사됩니다. Tauri 는 교차 빌드를 하지 않으므로 각 OS 의 설치 파일은 그 OS 에서 만듭니다. Windows 설치 프로그램은 설치 언어(한국어 / English)를 고르고, 이전 설치를 완전히 지운 뒤 다시 설치하며, 사용자 데이터를 지울지 묻습니다.

## 명령줄 (배치)

```bash
MyHeatManager --batch model.myheat [more.myheat …] [--out 폴더] [--field T|vonMises|u|…] [--frame n|last] [--quiet]
```

## 테스트

```bash
npm test                     # 전부: js · engine · rust · wasm · web · desktop
npm test -- --only js,engine # 고른 것만
npm test -- --skip web       # 그것만 빼고
npm run test:js              # JS 단위 테스트만
npm run test:rust            # Rust 데스크톱 셸만
npm run test:e2e             # web · desktop
```

- **js**: 모델·재료·예제·번역·명령·테마·신뢰성·히트맵·결과 디코딩·색 지도·설정·열 쾌적성
- **engine**: Rust 해석 엔진 — 해석해와 비교(1D 평판, 내부 발열, 대류, 복사 평형, 집중 용량 냉각, 상변화, 푸아죄유 유동, 다르시, 자유·구속 열팽창), 난류·전기·생체 열전달·팬·접촉·구조 하중·모드, 에너지 수지, 경계 우선순위, 결과 인코딩
- **rust**: 데스크톱 셸 — 파일 입출력, 창 위치, 여러 실행, 대화 상자·메뉴 창, 배치 PNG
- **wasm**: heat.wasm 을 빌드해 Node 에서 실행
- **web**: 웹판을 헤드리스 Edge/Chrome 으로 조작 — 시작 화면, 모든 메뉴·도구·대화 상자, 그리기, 모든 예제 해석(WASM), 결과 보기, 인쇄 창, 튜토리얼 전 단계
- **desktop**: `tauri build --debug --no-bundle` 로 만든 실제 프로그램을 WebView2 DevTools 로 조작 — 네이티브 엔진 해석, 파일 명령, `--batch` 출력

결과는 `test-results/summary.json` 에도 남습니다.

© SHKWON (knix008@naver.com)
