# MyProductionFlow 구조

개발자를 위한 문서입니다. 무엇이 어디에 있고 데이터가 어떻게 흐르는지 설명합니다. 사용법은 [doc/UsersGuide.md](doc/UsersGuide.md)를 보세요.

## 1. 전체 그림

```
index.html → src/main.js (하나의 번들이 모든 창을 맡음)
   ├─ 주 창        src/app.js        상태 · 명령 · 메뉴/툴바 · 패널 · 실행 루프 · 실험 · 보고서 · 파일
   ├─ 팝업 창      src/popup.js      설정 · 정보 · 확인 · 오류 · 진행 · 메뉴 · 테마 …
   │                 + popups-sim.js  설정 › 시뮬레이션 탭, 실험, 보고서
   └─ 문서 창      src/viewer.js     사용 설명서 · 튜토리얼 문서

app.js ──change()/commit()──► sim/model.js (모델 JSON, History)
   │                             ▲
   ├─ editor/canvas2d.js ────────┘  2D 편집기 + 2D 애니메이션 (api로 app에 알림)
   ├─ view3d/view3d.js              3D 장면 (blocks3d.js 정적, dynamic.js 움직이는 것, kit.js 공통)
   ├─ ui/panels.js · charts.js      라이브러리 · 탐색기 · 속성 · 하단 패널 (HTML 문자열)
   └─ sim/engine.js  Simulation     이산 사건 + SD + 에이전트 (DOM 없음)
          ├─ sim/blocks.js  블록 종류 · 포트 · 속성 정의
          ├─ sim/expr.js    식 언어 (안전한 파서)
          ├─ sim/random.js  시드 난수 · 분포 13종
          └─ sim/samples.js 템플릿 7 · 예제 21

src-tauri/ (Rust): 창(프레임 없음) · 팝업 OS 창 · 파일 읽기/쓰기(진행) · 인쇄 · 파일 연결 · 여러 실행 · 패닉 로그
```

## 2. 모델 (sim/model.js)

`{ format, version, name, description, settings, blocks[], links[], charts[] }`

- **block**: `{ id, type, name, x, y, rot, w?, h?, points?, props }`. 위치는 미터, 2D에서 x 오른쪽 · y 아래(3D에서는 y → z). 경로 블록(컨베이어·도로·벽)은 `points`가 (x, y) 기준 상대 좌표.
- **link**: `{ id, kind: 'flow'|'influence', from: { block, port }, to: { block, port }, points[] }`. port −1은 블록 몸체(SD 저량, 영향 화살표). `points`는 꺾은 점(월드 좌표).
- **settings**: 시간 단위(s/min/h/day — 엔진은 단위 변환 없이 모델 단위로 계산), 실행 길이, 워밍업, 시드, SD·에이전트 시간 간격, 적분 방법, 차트 기록 간격, 바닥 크기, 완성품당 비용.
- 이름은 모델 안에서 유일. SD 이름은 식별자. `renameBlock()`이 식·자원 풀·차트까지 함께 바꿉니다.
- `checkModel()`은 i18n 키(`check.*`)로 문제를 돌려줍니다. `History`는 모델 전체 JSON 스냅샷(200단계).

## 3. 엔진 (sim/engine.js)

- **사건 목록**: 이진 힙(시간, 순번). `at(t, fn)` / `after(dt, fn)`, 취소는 `ev.cancelled`.
- **노드**: 블록마다 런타임 클래스(Source, Sink, Queue, Process(=delay·robot·dock), Pool, Seize, Release, Select, Assign, Gate(=signal), Combine, Batch, Unbatch, Conveyor(=road), Transporter, Store(=rack·parking), Population).
- **흐름 규칙(역압)**: 블록은 `canAccept(e, port)`가 참일 때만 받습니다. `sim.findTarget()`이 출구의 연결(여럿이면 차례로)에서 받을 곳을 찾고 `deliver()`로 넘깁니다. 자리가 난 블록은 `notifyUp()` → `requestRetry(upstream)` → 사건 처리 뒤 `flushRetries()`가 위쪽 블록의 `retry()`를 부릅니다(재귀 없음). 통과형 블록(분기·게이트·확보·반납·지정)은 다음 블록이 받을 때만 받습니다.
- **컨베이어**: 항목마다 (s0, t0) 기준으로 위치 = min(s0 + v·Δt, 앞 항목 − 간격). 앞이 막히면 뒤가 쌓이고, 앞이 나가면 다시 기준을 잡습니다(reanchor). 도로는 차로마다 같은 계산.
- **SD**: `sdDt`마다(k·dt로 시각 누적 오차 없음) 오일러/RK4. 변수·흐름은 필요할 때 재귀 계산(순환 감지).
- **에이전트**: `agentDt`마다 이동(무작위 목적지), 격자 해시로 접촉 수, 비율·시간·접촉·조건 전이.
- **통계**: `TimeStat`(시간 가중 평균), `Tally`(관측값). 워밍업 시점에 모두 초기화. 시계열은 `sampleInterval`마다 기록(가동률은 구간 평균).
- **보기용**: `entityViews()`, `vehicleViews()`, `workerViews()`, `agentViews()`, `blockState(id)` — 2D와 3D가 같은 값을 그립니다.
- `runModel()` / `resultValue()` — 실험과 테스트가 화면 없이 사용.

## 4. 2D 편집기 (editor/canvas2d.js)

캔버스 하나에 월드(미터) → 화면 변환(`view = { cx, cy, scale }`). 모델을 직접 바꾸지 않고 `api.live()`(끄는 동안)·`api.commit()`(놓을 때)·`api.change()`·`api.connect()`·`api.placeBlock()`을 부릅니다. 히트 테스트 순서: 핸들(경로 점·꺾은 점·크기) → 출구 포트 → 블록(영역 블록은 마지막) → 연결선 → 빈 곳(사각형 선택). 블록 아이콘은 SVG 아이콘을 색칠한 Image로 캐시해 그립니다.

## 5. 3D (view3d/)

`View3D(host, { onSelect, onMove, onHover, canEdit })` · `setModel` (60 ms 디바운스로 다시 짓기) · `update(sim)` + `render()` (app의 rAF 루프) · `setView` · `fit` · `screenshot`. 정적 메시는 재질별로 합치고, 움직이는 것은 모양별 InstancedMesh. 바닥은 원점 중심(설정 크기, 모델을 덮도록 확장).

## 6. 화면 셸

MySketchBook과 같은 셸: 메뉴는 팝업 OS 창(웹은 iframe), 설정·테마·배경·시작 화면 카드(`ui/startboard.js`), 진행 창, 튜토리얼(`ui/tutorial.js` STEPS가 실제 앱을 조작), 문서 창. 문구는 `src/i18n/ko.js`·`en.js`(공통) 위에 `src/i18n/flow.js`가 덮습니다 — `npm run i18n:check`와 단위 테스트가 빠진 키를 찾습니다.

## 7. 테스트

| 묶음 | 내용 |
|---|---|
| unit | 엔진(M/M/1·M/M/2·역압·RK4·SIR·시드 재현), 블록 136종 전부 실행, 새 동작(복제·짝·제한 구역·보전·탱크·밸브·조회·평활·셀 격자), 진단, 모델·식·분포, 템플릿·예제 40개씩 실행, 문구 |
| static | 아이콘, .mpf 등록(Windows·macOS·Linux), 설치 리소스, 팝업 종류, 명령, 예제 파일 |
| web | 헤드리스 Edge에서 실제 앱: 클릭 배치·자동 연결·포트 끌기 연결·경로 그리기·이동/실행 취소·속성·실행·예제 21개 끝까지·3D 선택·검사·실험·몬테카를로·보고서·저장/열기·영어·튜토리얼 전체 |
| desktop | 디버그 exe 창에서 web 묶음 일부 (격리된 프로필·데이터 폴더) |

## 8. 블록 확장과 진단

- **기반 동작(base)**: `sim/blocks.js`의 프리셋은 `preset(base, …)`으로 만든 블록입니다(예: CNC 가공기 = 공정 + CNC 모양 + 기본값). 엔진(`NODE_CLASSES[baseOf(type)]`), 2D 그리기, 3D 모델(`BUILDERS[type] ?? BUILDERS[base]`), 모델 검사, 통계 표가 모두 `baseOf()`로 같은 동작을 찾습니다. 새 설비는 프리셋 한 줄과 아이콘·문구만 더하면 됩니다.
- **새 동작**: 복제(Split) · 짝 맞추기(Match) · 제한 구역(CONWIP) · 시간 측정 · 정기 보전(`ProcessNode.forceDown`) · 합류 · 셀 격자(CellGridNode, 동기 갱신) · SD 조회 테이블(선형 보간)·평활(1차 지연) · 탱크 용량(적분 뒤 자르기)·밸브(열림/닫힘 주기).
- **진단** (`sim/diagnose.js`): `diagnose(model, results)` → 문제 카드 `{ id, severity, block, params, evidence, fixes: [{ key, params, action?: { block, prop, value } }] }`. 문구는 `diag.<id>.title|cause`, `fix.<key>`, `ev.<key>`. 앱은 실행이 끝나면 분석·개선 탭을 열고, **적용**은 `action`을 한 번의 실행 취소 단계로 모델에 넣습니다. `checkFixes(problem)`은 모델 검사 문제의 해결 방법입니다.
