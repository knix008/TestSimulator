# My3DMaker 구조

개발자를 위한 문서입니다. 사용법은 [doc/UsersGuide.md](doc/UsersGuide.md)를 보세요.

## 1. 전체 그림

```
crates/sim-core/      Rust 해석기 (의존성: serde, serde_json) — 데스크톱과 웹이 같은 코드를 씀
crates/sim-wasm/      sim-core → WebAssembly (wasm-bindgen) → src/sim/pkg/ (npm run build:wasm)
src-tauri/            Tauri 2 백엔드: 파일·창·팝업·인쇄 + sim.rs (run_simulation / cancel_simulation / solver_info)
src/                  화면 (Vite, three.js)
  main.js             창 이름으로 app.js / popup.js / viewer.js 중 하나를 불러옴
  app.js              주 창: 상태, 명령 표, 메뉴·도구 모음·리본, 작업 탭, 파일, 해석 실행, 설계 탐색, 시작 화면
  app-model.js        모델 탭의 3D 보기: 설정용 메시(면 고르기·조건 색), 결과 표시(등고선·변형·애니메이션·단면·유선·표면)
  view/simview.js     three.js 보기: 메시, 면 색, 등고선과 색 막대, 변형, 단면 텍스처, 유선, 표면, 라벨, 좌표축
  ui/simpanels.js     개요·세부 정보·도구 상자·도식·엔지니어링 데이터·설계 탐색 HTML
  ui/charts.js        SVG 그래프(선·막대·로그 축)와 반응 지도
  sim/                화면 쪽 모델: catalog(시스템·조건·결과 표), project(데이터·작업 JSON), shapes(템플릿·STL),
                      materials, units, samples(예제 31개), results(결과 항목·표시·그래프), report(보고서), engine(실행), decode
  popup.js, popups-cad.js  설정·정보·메뉴·진행률·인쇄 팝업 (설정의 "해석" 탭)
```

## 2. 해석 작업의 흐름

1. `sim/project.js buildJob()`이 프로젝트와 시스템에서 **작업 JSON**을 만듭니다: 바디(형상 트리), 재질(SI), 메시 설정, 공기 영역, 조건(면 서명), 접촉, 설정, 탐침.
2. `sim/engine.js runJob()` — 데스크톱: Tauri 명령 `run_simulation`(작업 스레드, `sim-progress` 이벤트로 진행률, `cancel_simulation`으로 중지). 웹: Web Worker(`sim/worker.js`)가 WebAssembly의 `run_job`을 부르고 `globalThis.__simProgress`로 진행률을 보냅니다(중지는 워커 교체).
3. `sim_core::run_job_json`이 모델(형상 → 메시)을 만들고 해석기를 부릅니다.
4. 결과는 **SIM1 컨테이너**(`out.rs`): `"SIM1"` · JSON 길이 · JSON · 이진 배열. 큰 배열은 JSON 안에 `{"$f32": 위치, "n": 개수}`로 들어가고 `sim/decode.js`가 Float32Array/Uint32Array 뷰로 바꿉니다(복사 없음).

## 3. 형상과 메시 (sim-core)

- `geom.rs` — 부호 거리 함수(음수 = 안쪽) 형상: 상자·원기둥·관·구·원뿔·토러스·돌출·회전·STL, 합·차·교집합, 배치(위치 + X→Y→Z 회전). `patch()`는 점이 어느 기본 도형의 어느 면에 가까운지 알려 줍니다(면 묶기에 씀).
- `mesh.rs` — 직교 격자(축에 나란한 면의 평면을 격자선에 포함, 국부 크기 구간은 촘촘히) → 격자 칸을 Kuhn 사면체 6개로 → 중심이 든 바디의 영역 → 경계 절점을 표면으로(1단계: 0.2h 이내 격자점, 2단계: 유효성 검사와 함께, 평평해진 경계 요소 제거) → 내부 절점 평활화 → 경계 삼각형을 기본 도형 면별로 묶기(STL은 각도) → 2차 요소는 모서리마다 중간 절점, 곡면이면 표면으로 옮기되 야코비안이 나빠지면 직선으로 되돌림. 접촉 쌍(결합 제외)은 경계면 절점을 나눠 `contact_nodes`로 짝을 지음.
- `model.rs` — 작업 JSON, 재질, 면 서명 찾기(`find_face`: 중심·법선·면적 점수), 면 절점 가중치.
- 길이는 모델 단위(mm)로 메시하고 `Model.x`에 m 좌표를 둡니다. 해석기 안은 모두 SI입니다.

## 4. 선형 대수

- `sparse.rs` — 요소 연결에서 만든 CSR 패턴, 경계 조건 적용(대칭 유지), PCG, IC(0), **2단계 전처리기**(절점 묶음의 강체 운동 6개(스칼라는 상수 1개)를 조대 공간으로 하는 곱셈형 보정 + IC(0) 평활), COCG(복소 대칭).
- `eigen.rs` — LOBPCG(SVQB 직교화, 매 반복 행렬 곱 재계산, 고유값 정체 시 종료).
- `dense.rs` — 야코비 고유값, 가우스 소거, 최소 제곱, 극분해.

## 5. 해석기

| 파일 | 내용 |
|---|---|
| `fem.rs` | TET4/TET10 형상 함수, 적분(1·4·11점), 탄성 강성·질량·기하 강성, 열 행렬, 경계 삼각형 적분 |
| `structural.rs` | 조립(열 변형률, 체적력, 지지 스프링, 접촉 스프링), 정적·모달·좌굴·조화·과도·스펙트럼·랜덤·피로, 결과 필드·반력 |
| `nonlinear.rs` | 뉴턴-랩슨, J2 반경 복귀(연속체 접선), 전체 라그랑지(그린 변형률·기하 강성), 접촉(마찰 없음·쿨롱 마찰·분리 없음·거침), 단계 이분 |
| `explicit.rs` | 집중 질량 중앙 차분, 공회전 TET4(극분해), 소성·요소 제거, 강체 벽(벌칙·마찰), 질량 스케일링 |
| `fields.rs` | 정상·과도 열(대류·복사 반복), 정전기장(정전 용량), 직류 전류(저항, 줄 발열 → 열 연성), 음향 모달·조화(COCG) |
| `magnetic.rs` | Whitney 에지 요소, 코일 전류 밀도(원형·직선), 영구 자석, 질량 항 게이지, 에너지·인덕턴스, 공기층 맥스웰 응력으로 힘 |
| `cfd.rs` | MAC 격자, 반라그랑지 대류 + 명시적 확산, 압력 푸아송(PCG), Smagorinsky 와점성, 부스네스크 부력, 고체 포함 온도(공액), 힘·유량·유선·표면 값 |
| `topo.rs` | 복셀 HEX8 SIMP, 민감도 필터, OC 갱신, 마칭 사면체 등치면 |
| `doe.rs` | 실험 계획, 2차 반응 표면, 민감도, 최적 후보 탐색 |
| `slice.rs` | 사면체 위치 찾기, 중앙 단면 표본(공기 포함 필드) |
| `report.rs` | 화면용 메시 정보(표면, 면, 특징 모서리, 품질) |

## 6. 화면 쪽 데이터

```js
project = { format: 'my3dmaker', version: 1, name, units,
  bodies: [{ id, name, template, params, material, position, rotation, suppressed, meshSize, hidden?, stl? }],
  materials: [재질 사본], systems: [{ id, type, name, settings, bcs, contacts, mesh, enclosure, probes, status, result? }],
  links: [{ from, to }], parameters: [{ id, path, label, kind, model, min, max, levels }],
  study: { method, samples, objective, goal, rows, fit }, active }
bc = { id, type, faces: [{ body, other, c, n, a }], bodies: [id], suppressed, ...필드(SI) }
```

결과(`system.result`)는 파일에 저장하지 않습니다. 매개변수의 `path`는 id로 배열 항목을 고르는 점 경로입니다(`bodies.<id>.params.width`).

## 7. 시험

| 범주 | 내용 |
|---|---|
| rust | `crates/sim-core` 단위 시험: 형상, 메시(상자 부피·원기둥 면·공기 영역), 희소 행렬, 고유값, 요소, 외팔보(처짐·진동수·좌굴), 열전도, 저항, 음향 공명, 솔레노이드, 소성, 낙하, 유동(항력·질량 보존·가열), 위상 최적화, DOE |
| backend | `src-tauri` 단위 시험(네이티브 해석 실행 포함) |
| js | 결과 디코더, 단위, 프로젝트, 카탈로그, 예제 31개를 WebAssembly 해석기로 풀기 |
| static | 패키지·이름·아이콘·문서·번역(한/영 키 일치), 금지어 검사 |
| web | 헤드리스 Edge에서 웹 판을 직접 조작: 예제 열기·해석·결과·탭·저장 |
