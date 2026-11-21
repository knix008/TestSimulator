# MyMechanics 구조

개발자를 위한 문서입니다. 사용법은 [doc/UsersGuide.md](doc/UsersGuide.md)를 보세요.

## 1. 전체 그림

```
index.html → src/main.js (창 이름으로 고름)
   ├─ 주 창        src/app.js        상태 · 명령 표 · 메뉴/툴바/CommandManager · 패널 · 편집 흐름 · 파일
   ├─ 팝업         src/popup.js      설정 · 정보 · 메뉴 · 확인 · 진행률 · 테마 (+ src/popups-cad.js: 모델링 설정, 질량 특성, 간섭)
   └─ 문서 창      src/viewer.js     사용 설명서 · 튜토리얼 (public/doc/*.html, 그림은 public/doc/images/<ko|en>/)

src/cad/        DOM 없음 — Node에서 그대로 테스트
   kernel.js     OpenCASCADE(WebAssembly) 한 번 불러오기 → replicad API
   solver.js     Levenberg–Marquardt 최소제곱, 가우스 소거, 영공간(자유도)
   sketch.js     스케치 요소·구속·치수 방정식, 풀기, 정의 상태, 닫힌 영역(평면 그래프 면 순회 + 포함 관계)
   features.js   피처 정의와 기본값, 다시 만들기(regenerate), 평면 프레임, 도구 솔리드, 패턴·대칭
   advanced.js   스윕·로프트·구배·리브·돔·나선·나사산·랩·곡면·두껍게·바디 이동/축척/분할·부품 삽입(캐비티)·판금(펼치기)·용접 구조 부재
   params.js     수식(식 파서)·전역 변수·컨피규레이션·디자인 테이블(CSV) → effectiveFeatures()가 다시 만들기 전에 적용
   sketchtools.js 스플라인·타원, 스케치 필렛/모따기, 오프셋, 대칭 복사, 스케치 패턴, 교차점 자르기, 연장
   fea.js        선형 정적 해석: 메시 복셀화 → 8절점 육면체 요소, 행렬 없는 PCG, von Mises·변위·안전율
   refs.js       면·모서리 서명과 다시 찾기(위상 이름 문제를 기하로 해결)
   assembly.js   쿼터니언, 메이트 방정식, 전체 메이트 풀기, 간섭 검사
   drawing.js    HLR 투영, 뷰 배치(제3/제1각), 척도, SVG(표제란·치수), DXF
   document.js   프로젝트(.mymech JSON), 부품/어셈블리/도면, 스냅샷 실행 취소
   materials.js  재질 16종(밀도·탄성계수·항복강도·표시 색)
   samples.js    예제 75개(그룹마다 15개)(실제 피처 트리로 생성)

src/view/
   viewport.js   three.js 그래픽 영역: 카메라(직교/원근, 회전·이동·확대), 표준 보기 전환 애니메이션, 표시 스타일,
                 단면, 면·모서리·평면 고르기와 강조, 미리보기, 선(스케치) 그리기, HTML 라벨, 방향 축
   sketcher.js   스케치 편집기: 도구, 끝점 맞춤과 구속 자동 추가, 끌기 풀기, 지능형 치수, 상태 색

src/ui/          tree.js (FeatureManager) · propertymanager.js (PropertyManager, 구멍 크기 표) · startpage.js
                 startboard.js · background.js · dropdown.js · tooltip.js (MySketchBook 셸)
src/platform/    native.js (Tauri ↔ 웹 경계) · popups.js (OS 팝업 창 / 웹 프레임)
src-tauri/       Rust 백엔드 (파일 입출력·진행률, 팝업 창, 글꼴, 인쇄, 창 위치, 여러 실행, 파일 연결 .mymech)
```

## 2. 데이터

```js
project = { format: 'mymechanics', version: 1, name, units, parts: [part], assemblies: [assembly], drawings: [drawing], active: { kind, id }, camera, thumbnail }
part = { id, name, material, color, partNo, description, features: [feature], rollback: null | index }
feature = { id, type, name, suppressed?, ...매개변수 }          // FEATURE_DEFAULTS (features.js)
sketch = { ...feature, plane: planeRef, entities: [point | line | circle | arc], constraints: [...] }
planeRef = { kind: 'std', name: 'front'|'top'|'right' } | { kind: 'ref', id } | { kind: 'face', sig, origin, xDir }
assembly = { id, name, components: [{ id, part, name, position, rotation (quaternion), fixed }], mates: [{ id, type, a, b, value, aligned }] }
drawing = { id, name, source: { kind, id }, sheet, scale, autoScale, projection, views: [{ id, type, x?, y? }], showHidden, showDims, title }
```

좌표는 mm, Y가 위(일반적인 기계 CAD 기본). 정면 = XY(법선 +Z), 윗면 = XZ(법선 +Y, 스케치 y → −Z), 우측면 = YZ(법선 +X, 스케치 x → −Z).

## 3. 다시 만들기

`regenerate(part, { upTo })`는 피처를 순서대로 실행합니다. 각 피처는 `{ body, tool, frame }`을 돌려주고, 실패하면 `{ ok: false, error: code }`로 표시만 하고 다음 피처로 갑니다. 컷·보스·구멍은 **도구 솔리드**를 남겨 패턴과 대칭 복사가 그것을 옮겨 다시 적용합니다. 앱은 피처 목록 JSON을 키로 결과와 테셀레이션을 캐시합니다(`buildPart`): 편집 미리보기는 `preview` 슬롯, 스케치 편집은 `sketch` 슬롯(그 스케치 앞까지).

필렛·모따기·쉘의 모서리/면, 면 위 스케치 평면, 메이트 면은 **서명**(중심·방향·길이/면적·종류·원통 반지름)으로 저장하고 다시 만들 때 가장 가까운 것을 찾습니다(`refs.js`). 앞의 치수가 바뀌어도 같은 모서리를 찾는 이유입니다.

## 4. 스케치 솔버

미지수는 고정되지 않은 점의 x, y와 원의 반지름입니다. 구속마다 잔차를 정의하고(`constraintResiduals`), 각도류 잔차는 스케치 크기에 비례한 고정 길이를 곱해 거리 잔차와 무게를 맞춥니다(선 길이를 곱하면 솔버가 선을 줄여 버립니다). 야코비안은 중앙 차분, 끌기는 끌리는 점의 감쇠를 키워 포인터를 따르게 합니다. 정의 상태는 야코비안의 RREF에서 영공간 기저를 구해, 어떤 미지수도 움직일 수 없는 요소를 "완전 정의"로 봅니다.

닫힌 영역: 끝점을 위치로 병합한 그래프에서 한쪽만 이어진 모서리를 반복 제거한 뒤, 반모서리를 각도순으로 정렬해 "왼쪽 면" 순회로 면을 찾고(양의 넓이 = 유계 면), 원은 따로 넣습니다. 내부 점 포함 관계로 깊이를 정해 짝수 깊이 = 영역, 그 바로 안 = 구멍.

## 5. 어셈블리

자유 부품마다 6개 미지수(이동 3 + 회전 벡터 3)를 두고 모든 메이트를 함께 풉니다. 평면 일치는 법선 반대 정렬(3) + 평면 거리(1), 동심은 축 평행(3) + 축 사이 거리(3) 같은 식입니다. 메이트 참조는 부품 좌표의 면 서명과 기하(평면: 점·법선, 원통: 축)이며, 부품이 바뀌면 서명으로 다시 읽습니다.

## 6. 화면

viewport.js는 바디마다 메시(면 그룹 → 면 번호)와 모서리 선분(→ 모서리 번호)을 만들고, 고르기는 레이캐스트(면) + 화면 거리 6px(모서리) + 깊이 비교(시선 방향 깊이; 직교 카메라의 레이는 픽셀에서 시작하므로 카메라 거리로 비교하면 안 됨)로 합니다. 표준 보기 전환은 쿼터니언 보간입니다(`Matrix4.lookAt(eye, target)`의 +Z는 eye − target).

## 7. 테스트

| 묶음 | 내용 |
|---|---|
| `test/unit/sketch.test.js` | 구속·치수 풀기, 자유도, 과잉 정의, 끌기, 닫힌 영역(구멍·호·홈) |
| `test/unit/features.test.js` | 모든 피처를 커널로 만들고 부피를 확인, 모서리 재탐색, 실패 격리, 롤백 |
| `test/unit/samples.test.js` | 예제 75개(그룹마다 15개): 모든 피처 성공, 메이트 만족, 간섭 없음, 도면 SVG/DXF, 저장/열기 |
| `test/unit/document.test.js` | 프로젝트·실행 취소, 쿼터니언, 메이트 풀이, 솔버, 도면 배치, 재질 |
| `test/static/package.test.js` | 이름·식별자, `.mymech` 등록, 아이콘·리소스, 팝업 크기, 문서, 번역 |
| `test/e2e/web.steps.json` | 헤드리스 Edge에서 실제 마우스로 스케치 → 치수 → 돌출 → 필렛(모서리 클릭) → 구멍 → 편집 → 실행 취소 → 롤백 → 도면 → 예제 → 언어 |
