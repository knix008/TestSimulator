# My3DMaker

부품과 조립품의 3D 공학 해석 프로그램입니다. Windows · macOS · Linux 데스크톱(Tauri 2)과 웹 브라우저에서 같은 기능으로 실행됩니다. 해석기는 모두 **Rust**(`crates/sim-core`)로 작성되어, 데스크톱에서는 Tauri 백엔드가 네이티브로 실행하고 웹에서는 WebAssembly(`crates/sim-wasm`)로 실행합니다. 시작 화면·팝업 창·설정·프로그램 정보·인쇄·테마의 스타일은 MyMechanics와 같습니다.

![시작 화면](doc/images/ko/start.png)

## 기능

| 분야 | 해석 시스템 |
|---|---|
| 구조 | 정적 구조, 피로(응력-수명, 평균 응력 보정), 비선형 정적(소성·대변형·접촉), 선형 좌굴, 위상 최적화 |
| 동역학 | 모달, 조화 응답, 과도 구조, 응답 스펙트럼, 랜덤 진동, 외연적 동역학(충돌·낙하) |
| 열 | 정상 열전달(전도·대류·복사·발열), 과도 열전달, 열-응력 |
| 유동 | 비압축성 유동(외부·내부, 층류·난류), 열전달·부력·공액 열전달, 항력·양력, 유선 |
| 전자기 | 정전기장(정전 용량), 직류 전류(저항·줄 발열 온도), 정자기장(코일·영구 자석, 인덕턴스, 힘) |
| 음향 | 음향 모달, 음향 조화(음압 레벨, 흡음 경계) |
| 설계 탐색 | 매개변수, 실험 계획(중심 합성·완전 요인·라틴 하이퍼큐브), 2차 반응 표면, 민감도, 최적 후보 |

- **프로젝트 도식**: 해석 시스템 블록(엔지니어링 데이터 → 형상 → 모델 → 설정 → 해 → 결과)과 연결(정적 → 좌굴 등)
- **형상**: 매개변수 템플릿 22종(기본 도형, 브래킷, 형강, 플랜지, 축, 방열판, 날개, 코일 …), STL 가져오기
- **메시**: 4·10절점 사면체 자동 생성, 국부 크기, 품질 통계
- **하중·지지**: 33종, 3D 보기에서 면을 클릭해 지정, 접촉 5종
- **결과**: 등고선, 변형, 애니메이션, 단면, 유선, 탐침, 그래프, 표, CSV·PNG·STL·HTML 보고서, A4 인쇄·PDF
- **엔지니어링 데이터**: 재질 21종, 프로젝트별 편집
- **예제** 31개, 한국어/English, 테마 40여 종, 사용 설명서와 튜토리얼

## 실행

```bash
npm install
npm start            # 데스크톱 (tauri dev, 빈 포트를 찾아 Vite를 띄움)
npm run dev          # 웹 (http://127.0.0.1:5584)
```

웹 판은 해석기 WebAssembly 패키지(`src/sim/pkg/`)가 필요합니다. `npm start`·`npm run dev`는 없거나 낡았으면 `npm run build:wasm`으로 만듭니다. 필요한 도구: Rust, `rustup target add wasm32-unknown-unknown`, `cargo install wasm-bindgen-cli --version 0.2.128`.

## 빌드

```bash
npm run build:wasm   # Rust 해석기 → WebAssembly (src/sim/pkg)
npm run build:web    # 웹 (dist/)
npm run build:win    # Windows 설치 파일 (NSIS)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (deb · rpm · AppImage)
```

## 시험

```bash
npm test                 # Rust 해석기 · Tauri 백엔드 · JS 단위 · 정적 검사 · 웹(헤드리스 Edge)
npm test -- --quick      # 브라우저와 긴 예제 해석 없이
npm test -- --only rust  # 범주 하나 (rust, backend, js, static, web)
```

해석기 시험은 보 이론(외팔보 처짐·진동수·좌굴), 1차원 열전도·저항, 관의 음향 공명, 솔레노이드 자속, 소성 항복, 유동 질량 보존 등과 결과를 비교합니다.

## 정리

```bash
npm run clean        # 빌드 결과, 설치 파일, 시험 결과, 캐시
npm run clean:all    # 위 + node_modules/ 와 src/sim/pkg/ (다음: npm install && npm run build:wasm)
npm run clean -- --dry-run
```

## 문서

- [사용 설명서](doc/UsersGuide.md) · [User's Guide](doc/UsersGuide.en.md) · [튜토리얼](doc/Tutorial.md) · [Tutorial](doc/Tutorial.en.md) — `npm run build:docs`로 도움말 창용 HTML을 만듭니다. 그림은 `npm run guide:images`.
- [구조](ARCHITECTURE.md) — 모듈, 데이터, 해석기.

© SHKWON (knix008@naver.com). 제3자 라이선스는 `licenses/`.
