# MyCAD 구조

## 층

```
┌ src/app.js (주 창) ── src/popup.js (팝업 창: 설정·인쇄·부품·솔리드·대응표 …)
│     │ commands {id → icon, label, key, enabled, checked, run}  ← 메뉴·툴바·패널·단축키가 모두 이것을 씀
├ src/view/     renderer.js (2D 캔버스) · tools.js (그리기 도구) · view3d.js (three.js, 지연 로드)
├ src/domain/   플랫폼 무관 · DOM 없음 · Node 테스트 대상
└ src/platform/ native.js (Tauri invoke / 웹 대체) · popups.js (OS 창 / iframe)
src-tauri/      Rust: 파일 읽기/쓰기(진행률) · 팝업 창 · 창 위치 · 글꼴 · 클립보드 · 패닉 기록
```

## 도면 모델

- 도면 = `{ title, layers, entities, sheet, grid, … }` JSON (.mcad). 객체는 평범한 데이터이고 `normalizeEntity` 가 파일에서 읽은 값을 고칩니다.
- 2D 객체는 모두 *primitives*(line · poly · circle · arc · text · fill)로 펼쳐져 그리기, 선택, 스냅, SVG/DXF, 인쇄, STL 이 이것만 다룹니다.
- 실행 취소는 도면 스냅샷(`history.js`), 모든 변경은 `change(label, mutate)` 한 곳을 지납니다.

## 3D 솔리드 (`solids.js`)

- 객체 `type: 'solid'`: `kind` + `params` + `shape` + 배치(x, y, z, rx → ry → rz, scale, flip).
  - 프리미티브 10종 (FreeCAD Part 와 같은 매개변수 이름·원점: Box 는 모서리, Cylinder/Cone 은 밑면 중심, Torus 는 중심…)
  - `pad · revolution · loft · sweep` 은 2D 윤곽에서 (`featureFrom`), `boolean` 은 `{ op, parts }` 트리, `mesh` 는 가져온 삼각형.
  - 덧붙임(dress-up) `fillet · chamfer · thickness · offset3d` (`dressup.js`): `shape.base` 에 원래 솔리드(배치 0)를 두고 배치는 덧붙임이 가진다. 밑솔리드를 프로필(바깥 윤곽 + 구멍) + 높이로 보고(`profileOf`: box · pad · prism · cylinder 360° · tube) 높이 방향으로 층을 쌓아(`levels`) 층마다 윤곽을 안/밖으로 옮기고 모서리를 둥글게(`offsetLoop`, `roundCorners`) 이어 붙인다. 세로 모서리를 둥글게 할 때 층 안쪽 이동은 0.97r 까지만 — 그래야 윤곽 꼭짓점 수가 같아 메시가 닫힌다. 분해 = `partInParent(base)`. FCStd 에는 메시로 저장.
- 풍선 · 기하 공차 틀 · 데이텀은 `leader` 객체의 `style`(note · balloon · gdt · datum)이고 머리는 `annotate.js` 가 선 · 원 · 호 · 채움 · 글자로만 그린다(기호 14종도 벡터) — 그래서 캔버스 · SVG · DXF(스타일 있는 지시선은 LEADER 대신 기본 도형) · 인쇄가 같다. 종류마다 필드만 남긴다(normalize).
- 보조선: `entity.construction`. `isOutput` · 내보내기(DXF · SVG · IGES · HP-GL · 인쇄) · `collectLoops` · `frameFrom` · PNG(`settings.output`)에서 빠진다. 투상도의 숨은선: 날카로운 모서리는 자기 두 면만, 매끄러운 윤곽선은 둘레 두 고리의 면까지 가리지 않는다 — 거리 기준이었을 때는 키 큰 면(관의 옆면)이 안쪽 구멍을 가리지 못했다.
- 스케치 구속(`constraints.js`): `drawing.constraints = [{ id, type, refs: [{ id, at }], value }]`(선 · 원 · 호 · 점; at = p1 · p2 · c · start · end · p). 잔차 함수 + 수치 야코비안, 가중 최소 노름 가우스-뉴턴 스텝 dx = −W⁻¹Jᵀ(JW⁻¹Jᵀ+εI)⁻¹r. `DrawingDocument.apply` 가 바뀐 구속 객체를 `moved` 로 넘기면 먼저 그것들을 상수로 두고 풀고(끌기), 안 되면 무게만 크게. 상태는 야코비안 계수로 자유도 = 변수 − 계수, 식 > 계수 → 중복, 잔차 → 충돌. 풀이 결과는 새 객체로 바꿔 넣는다(뷰 캐시가 객체 열쇠).
- FEM(`fem.js`, DOM 없음): `frameFrom`(선 · 폴리선 → 절점(끝 병합) · 부재), `analyzeFrame` = 직접 강성법(절점당 ux · uy · rz, 부재 강성 6×6 을 Tᵀ k T 로 조립, 등분포는 고정단력, 지지 자유도 제거 후 가우스 소거; 특이 → 불안정). 부재 힘 = k·u − 고정단력, 모멘트 M(x) = −M1 + V1·x + p·x²/2(포물선 꼭대기 포함). 변형은 끝 변위 · 회전의 에르미트 3차 + 부재 하중의 처짐 p·x²(L−x)²/24EI — 이게 없으면 한 부재 보의 중앙 처짐이 0 이 된다. 최대 변위도 부재를 따라 잰다. 교과서 값(PL³/3EI, 5qL⁴/384EI, qL²/8, PL/EA)으로 단위 시험. 조건은 `drawing.fem`.
- 스크립트 콘솔(`app.js` 의 `scriptApi` · `runScript`): 코드는 `AsyncFunction('cad', 'print', …)` 로 먼저 식(`return (code)`)으로, 안 되면 문으로 돈다 — 식이면 값을 출력. `cad` 의 고치는 함수는 각각 `change()` 한 번(실행 취소 한 단계). 매크로 기록은 `run(id)` 에서 명령을, `change()` 앞뒤 객체 id 차이로 새 객체를 `cad.add(type, data)` 로 적는다(스크립트가 도는 동안은 적지 않음). 매크로는 `settings.macros = [{ name, code }]`.
- CAM(`cam.js`, DOM 없음): `camSource`(stl.js 의 `collectLoops` 로 닫힌 윤곽 · 열린 사슬 · 원) → `camPaths`(공구 반지름만큼 `offsetOutline` — 공구가 도는 모서리는 호, 반대쪽은 연귀; 안쪽 오프셋은 모든 점이 반지름 이상 떨어졌는지로 뒤집힘을 거름; 포켓은 오프셋 경계 안 지그재그) → `toGcode`(G0 안전 높이 · G1 내려가기/절삭, 드릴은 G98 G83/G81 고정 사이클) · `parseGcode`(되읽기 검사용) · `camStats`. 창은 `popup-cam`.
- 클론(`clones.js`): `entity.clone = { of, cx, cy, dx, dy, angle, scale, flip }` — 원본 모양에 x′ = s·R(θ)·Fᶠ·(x − c) + c + d. `transformEntities` 는 클론이면 모양 대신 이 변환을 합성(`composeClone`)하고, `DrawingDocument.apply` 가 매 변경 뒤 `syncDrawingClones` 로 원본에서 다시 만든다(클론의 클론은 원본부터, 원본이 없으면 보통 객체). 클론은 손잡이(grips)가 없다.
- 작업 평면(`workplane.js`): `drawing.workPlane = { x, y, angle, z }`(전체 좌표면 없음). `parseCoordinate` · `snapToGrid` · `applyOrtho` 가 `wp` 를 받고, 렌더러는 평면 좌표로 격자를 그려 화면으로 옮긴다. z 는 새 솔리드 창의 기본 높이와 돌출 결과의 z 에 더해진다.
- 2D 자르기 · 연장 · 모깎기 · 모따기는 `edit2d.js`(DOM 없음): 객체를 곡선(선분 · 원 · 호 · 폴리선 매개변수)으로 보고 다른 객체와의 교점 매개변수로 자른다/늘린다. 도구는 `view/tools.js` 의 `TrimTool · ExtendTool · CornerTool`.
- `features.js`(DOM 없음): `loftSectionsMesh`(단면을 호 길이로 같은 점 수로 맞춰 시작점을 x+y 최소 꼭짓점에 정렬, 매끄럽게는 단면 사이를 Catmull–Rom 8 단계), `sweepSectionMesh`(평행 이동 틀, 꺾인 곳은 이등분 평면이 되도록 꺾인 방향으로 1/cos 늘림), `taperedExtrude`(같은 점 수 연귀 오프셋 — FreeCAD 처럼 모든 선이 자기 안쪽으로; 변 방향이 뒤집히면 없음), `holeProfile`/`holeVolume`(Pappus), `decimateMesh`(이차 오차 모서리 붕괴, 링크 조건 · 면 뒤집힘 검사로 닫힘 유지). 포켓 · 그루브 · 구멍은 `app.js` 의 `cutFeature` 가 도구 솔리드를 만들어 빼기 트리로. FCStd 는 TaperAngle(부호 반대) · 여러 단면 Part::Loft 로 쓰고 FreeCAD 로 부피 검증. 형상 검사의 안팎 판정은 껍질 포함 관계(광선 홀짝)로 — 속 빈 솔리드의 안쪽 껍질(빈 공간)은 안을 향하는 게 맞다.
- BIM 추가(`arch.js`): `sectionOf`/`sectionOutline`(규격 목록 `STEEL_PRESETS`, 웨브 · 플랜지 0 이면 예전 H형 비율 — 예전 도면 그대로), 단면 보는 `mitredSweep`(부재마다 닫힌 블록, 끝은 이등분 면), 계단 `stairsMesh`(ㄱ · ㄷ자는 일자 계단 두 개 + 참, 나선은 30° 부채꼴 디딤판 + 기둥), 난간 채움, `radialAxisPlan`, `filletPath`(배관 엘보 · 모양 철근 굽힘), `sweepRect`(사각 덕트, 꺾인 곳 연귀). 패널 재단은 `nesting.js`(선반 배치, 90° 돌림). 블록 표시(mark)는 꼭짓점을 옮긴 뒤에 붙여야 한다 — map 이 새 배열을 만들어 표시가 사라진다.
- 형상 검사 · 메시 수리는 `meshcheck.js`: `analyzeMesh`(용접 후 모서리 지도 → 열린 · 비다양체 · 방향 어긋남, 껍질별 부호 부피 → 안팎, x 축 스윕 + 선분-삼각형 교차 → 자기 교차, 2만 삼각형까지), `checkSolid`(BIM 은 `solidBlocks` 블록마다), `repairMesh`(퇴화 · 중복 제거 → 넓이 0 조각은 긴 변 건너편 면을 그 점에서 나눠 없앰 → 방향 BFS → 틈(T 접점)은 경계 꼭짓점으로 맞은편 경계 변을 나눠 닫음 → 남은 구멍은 중심 부채꼴 → 음의 부피 껍질 뒤집기). 불리언 결과(`booleanMesh`)도 `repairMesh` 를 거쳐 내보내기가 물샐틈없다. 수리한 객체는 `updateEntity` 로 새 객체가 되어야 한다 — `solidMesh` 캐시가 객체(WeakMap) 열쇠라 제자리 수정은 옛 메시를 돌려준다.
- `solidMesh(entity)` → 바깥을 향한 닫힌 삼각형. 객체별 캐시, 불리언은 트리 문자열 키 LRU 캐시(옮겨도 다시 계산하지 않음).
- 2D 도면에는 위에서 본 외곽(`solidFootprint`)이 보여 선택·스냅·인쇄가 그대로 됩니다.
- 측정: 정확한 공식(`exactVolume`)이 있으면 그 값, 없으면 메시 부피 · 겉넓이.

## BIM (`arch.js`, `ifc.js`)

- 건축 객체는 솔리드 종류(kind: wall · curtainwall · column · beam · slab · stairs · roof · space · railing · equipment · axis)라서 3D 보기 · 내보내기 · 단면 · 투상을 그대로 탄다. 모양 데이터는 상대 좌표(경로 `path` 또는 윤곽 `outer/holes`), 배치는 x · y · z · rz.
- 창 · 문은 벽의 `shape.openings` 에 산다(FreeCAD 의 hosted window). 그래서 벽 메시 캐시가 다른 객체에 의존하지 않는다.
- `archGroups` = 재질별 삼각형(main · glass · wood · metal · space), 3D 보기는 `solidMeshGroups` 로 재질 색을 쓴다(레이어 색은 평면 선 색일 뿐). 블록들은 **겹치지 않고 맞닿기만** 하게 만든다 → 부피는 합, STEP 은 블록마다 따로 닫힌 셸(`solidBlocks`).
- 2D 는 `archPlan` (`PLAN_CUT` = 객체 바닥에서 1 m): 잘린 벽/기둥은 해칭, 절단면에 걸린 창만 열린다. `placePrimitives` 로 배치.
- IFC 4: 벽 몸체는 **안 뚫린 벽** + `IfcOpeningElement`(벽면보다 20 mm 씩 두껍게) — 뚫린 몸체를 쓰면 FreeCAD(ifcopenshell)가 겹친 면을 빼다 부피가 틀린다. FreeCAD 의 IfcWall 형상에는 끼운 창·문이 포함된다. 각 요소에 `MyCAD` 속성 집합(원래 객체 JSON)을 붙여 다시 열면 매개변수 객체로 복원.

- 층 · 재료: `drawing.bim` = { site, building, levels [{ id, name, elevation, height, visible }], activeLevel, planLevel, materials }. 객체는 `level` 로 층을 가리키고 z 에 표고가 들어 있다 (표고를 바꾸면 `applyBim` 이 z 를 옮김). `isVisible` = 2D(평면도 층), `isVisible3d` = 3D · 3D 내보내기. 재료는 객체 안에 복사본(`entity.material`, 벽 `shape.layers[].material`)으로 들어가 `arch.js` 가 도면 없이 그린다; 재료를 바꾸면 id 로 찾아 갈아 끼운다.
- 지붕: `skeleton.js` 가중 직선 골격 (변마다 속도 cot(경사), 90° = 0). 처마는 바깥 오프셋 윤곽, 모든 처마 높이 같음 → 면이 정확히 맞물린다. 외쪽 지붕만 상자 평면.
- 철근: 숙주(기둥·보·슬래브)의 모양을 복사해 두고 `rebarBars` 가 철근 경로를 만든다; `tubeAlong` = 꺾임을 반각 평면으로 자른 관 (평행 이송 틀, 배관도 같음).
- 블록은 `mark()` 로 tri.block 을 달아 STEP 이 블록마다 닫힌 셸을 쓴다.

## CSG (`csg.js` + `meshtools.js`)

1. BSP 트리 불리언 (csg.js 방식). 쪼갠 다각형마다 평면을 따로 복사 — 공유하면 뒤집기가 형제에 번져 메시가 열립니다.
2. `conform` — T-접점(이웃 모서리 위 꼭짓점)을 넣어 닫힌 껍질로.
3. `collapseShortEdges` — 0.1 µm 보다 짧은 모서리 합치기.
4. `simplifyMesh` — 같은 평면 영역을 경계에서 다시 삼각분할 (조각 수 1/8 수준, 실패한 영역만 원래대로).

## 투상 · 단면 (`solids.js`, `views.js`)

- `projectEdges`: 날카로운 모서리 + 매끄러운 윤곽선(보간 법선이 시선과 직각이 되는 곳 → 곡면도 매끄러운 외곽) + 숨은선 판정
  (화면 격자에 삼각형, 깊이 비교, 선분을 잘게 나눠 판정; 윤곽선 근처 자기 면은 제외; 보이는 선과 겹치는 숨은선은 생략).
- `drawingViews`: 3각법 배치(평면도 위, 우측면도 오른쪽, 등각도 오른쪽 위), 숨은선은 `hidden` 레이어.
- `sectionAt` + `joinSegments`: 평면 Z = h 단면 → 닫힌 폴리선.

## 3D 파일 (`exchange3d.js`, `zip.js`, `xml.js`)

| 형식 | 쓰기 | 읽기 |
| --- | --- | --- |
| FCStd | Document.xml 에 Part::Box/Cylinder/…/Wedge(회전 보정)/Prism/Ellipsoid, Part::Extrusion·Revolution·Loft(스케치), Part::Sweep(Helix·Polygon+Circle), Part::Cut/MultiFuse/MultiCommon, Part::Mirroring, Mesh::Feature(.bms), 2D 는 Sketch | 같은 객체들을 매개변수 그대로, Mesh::Feature, 자유 스케치 → 2D |
| STEP | 면 분할 B-rep (같은 평면 삼각형은 한 면으로 합침, FACE_SURFACE+PLANE) | FACETED_BREP, 그리고 평면·원통·원뿔·구·토러스 ADVANCED_FACE (매개변수 공간에서 5° 셀로 잘라 삼각분할) |
| STL · OBJ · PLY · OFF · AMF · 3MF | 공유 꼭짓점, 3MF 는 deflate ZIP | 이진/ASCII STL, 다각형 OBJ, 이진/ASCII PLY, 단위(AMF inch 등), 3MF 구성품·변환 |
| BREP (`brep.js`) | 솔리드마다 닫힌 껍질: 삼각형 = 평면 면, 꼭짓점 · 모서리는 열쇠로 공유(이웃 면은 같은 모서리를 반대 방향으로). TShapes 는 자식 먼저 쓰고 번호는 목록 끝에서부터(#번호 표시를 마지막에 바꿈 — 좌표 줄의 음수를 건드리지 않도록) | 위치(합성 위치 포함), 선 · 원 · 타원 곡선, 평면 · 원기둥 · 원뿔 · 구 · 토러스 면(곡면은 STEP 의 `curvedFace`), 모서리는 파일 순서가 아니라 끝점으로 이어 고리를 만듦, 읽은 뒤 `repairMesh` 로 면 사이 틈을 닫음 |
| OpenSCAD (`scad.js`) | FreeCAD 가 읽는 엄격한 .csg 꼴: 변환은 multmatrix, 키워드 인수, 둥근 것은 $fn 72, 같은 모양이면 cube · cylinder · sphere · linear_extrude · rotate_extrude · 불리언, 나머지는 polyhedron(OpenSCAD 는 시계방향 면) | 토큰 → 구문 트리 → 해석: 변수 · 식 · 벡터 · 범위 · for/if · 수정자(*·% 는 뺌) · 2D(square · circle · polygon, 2D 변환 · difference) → 돌출 · 회전, 3D 변환 · 불리언(BSP) |
| VRML 2.0 · COLLADA 1.4 (`scene3d.js`) | 물체마다 Shape/geometry + 색, DAE 는 mm 단위 · Z_UP | VRML: 작은 노드 파서(DEF/USE, Transform 중첩, ccw FALSE, 다각형 부채꼴), DAE: triangles/polylist/polygons, node 의 matrix/translate/rotate/scale, unit meter · up_axis. FreeCAD 는 VRML 을 쓰기만 하고 DAE 는 BIM 의 importDAE(pycollada)로 읽음 |

FreeCAD 문서에서 알아낸 규칙 (FreeCAD 1.1 로 확인):
- 스케치의 배치는 저장된 모양(.brp)에서 복원됩니다 → 스케치마다 위치만 담은 빈 compound BREP 를 함께 씁니다.
- 곁 파일(.brp, .bms, Nodes)은 **Document.xml 이 참조하는 순서대로** ZIP 에 들어 있어야 합니다 (어긋나면 뒤 파일을 건너뜀).
- 점 목록(PropertyVectorList)은 곁 파일: uint32 개수 + float64 x,y,z.
- FreeCAD 는 AMF 를 읽지 못합니다 (3D 프린터용으로만 씀).

## 2D 파일 형식 (`import2d.js`, `iges.js`, `gerber.js`, `formats2d.js`, `svgparse.js`, `dxf2000.js`)

`importDrawingBytes(name, bytes)` 가 내용(먼저)과 확장자로 형식을 고릅니다. 글은 UTF-8/16 또는 DXF 의 `$DWGCODEPAGE`(ANSI_949 → euc-kr …)로 풀고, 바이너리 DXF(`AutoCAD Binary DXF` 표지, R12 1바이트·R13+ 2바이트 그룹 코드)는 텍스트 DXF 와 같은 그룹 쌍으로 바꿔 `importDxf` 에 넘깁니다. 읽은 레코드는 `normalizeEntity` 로 다듬습니다.
- IGES: 고정 80열 S/G/D/P/T 구역, Hollerith 문자열, 124 변환 행렬 연쇄, 매개변수 공간 곡선(141/142)과 부분도 정의(308) 제외, 314 색. 쓰기는 110/100/104+124/106/116/126/212 + 314 색 + 레벨=레이어.
- Gerber: `%…%` 확장 명령과 `*` 워드, FS/MO, 조리개 C·R·O·P, G01/02/03 · G74/75, D01/02/03, G36/37 영역(→ 채움 해칭). Excellon: METRIC/INCH, LZ/TZ, 공구 지름, G85 장공.
- 다른 프로그램의 파일로 시험합니다: FreeCAD(`scripts/freecad/drawings2d.py`), ezdxf(`scripts/ezdxf/make_samples.py`), 규격 예제(samples/drawings). MyCAD 가 쓴 IGES · SVG · DXF 2000 은 FreeCAD 가 다시 열어 길이를 비교합니다.

## 시작 페이지 · 튜토리얼 · 문서

- `src/view/startpage.js`: 시작 페이지 HTML(할 일 `START_TASKS` ↔ 레슨 · 샘플). `#start-page` = 고정된 `.start-bg`(3D 배경) + 위로 스크롤되는 `.start-scroll`(내용). 메뉴 줄의 `.menubar-home` 과 탭 줄의 집 탭이 `startPage` 명령입니다.
- `src/view/startbg.js`: 배경의 three.js 장면(지연 로드). `app.js` 의 `gearPairMeshes()` 가 기어 부품 윤곽을 돌출해 z24/z16 기어와 축을 만들고, 기어마다 축(pivot)과 각속도(잇수비로 반대 방향)를 줍니다. 시작 페이지가 숨거나 창이 백그라운드면 멈추고, 'reduced motion' 이면 시점 회전만 멈춥니다. 샘플 목록은 `samples/index.json`(`create-samples.mjs` 가 씀), 개발 서버는 프로젝트 폴더를, 빌드는 `vite.config.js` 의 복사 단계가 dist/samples 를 줍니다. 썸네일은 실행 중에 만듭니다(솔리드는 음영 등각, 2D 는 렌더러). 도면 검사는 `src/domain/check.js`(DOM 없음): 객체별 검사, 기하 키로 겹친 객체, 끝점 격자(칸 = 허용 틈)로 맞닿지 않은 끝점을 찾고 `{ code, severity, ids, at, params }` 를 돌려줍니다 — 솔리드는 메시를 만들지 않고 배치점만 씁니다(큰 불리언도 수 ms). `app.js` 의 문제 패널이 변경 250 ms 뒤 다시 검사합니다. 튜토리얼 패널은 데스크톱에서 `popup-tutorial` 창이고(플레이어는 주 창에서 실제 화면을 조작), 패널 HTML 을 그 창에 보내고 단추는 'tutorial' 동작으로 돌아옵니다; 웹에서는 페이지 안에 뜹니다. 샘플 모델은 `scripts/models3d.mjs`(기본 3D)와 `scripts/models-complex.mjs`(건축 평면도 · 3D 주택 · 사무소, 감속기 · 축 제작도 · 바이스 · 철골)에 있고, 주택은 평면도와 3D 모델이 같은 `HOUSE` 데이터(벽 중심선 · 두께 · 개구부)에서 나옵니다. 건물을 담도록 솔리드 치수 상한은 100 m(반지름 50 m)입니다.
- `src/tutorial/player.js`: 떠 있는 패널, 보기(가짜 커서 · 강조 고리 · 키 풍선)와 직접 하기(검사 함수를 300 ms 마다 · 클릭할 곳 표시). `app.js` 의 `tutorialApi()` 가 실제 캔버스 포인터 이벤트 · 명령 · 대화상자 대신 동작을 빌려 줍니다. 튜토리얼 동안 설정은 기준값(mm · 5 mm 격자 스냅 …)으로 두었다가 닫으면 돌려놓습니다.
- `src/tutorial/lessons.js`: 16레슨. 단계 = `{ title, text, run(ctx), practice: { todo, check, targets } }`. `runAll()` · `verifyPractice()` 를 E2E 가 실행합니다.
- `scripts/docs-shots.mjs` → `doc/images/<언어>/*.webp`(단계마다 실제 앱 화면 + `DOC_DIALOGS` 의 창), `scripts/build-docs.mjs` → `doc/Tutorial(.en).md/.html`(레슨 데이터에서 생성하므로 앱과 문서가 같습니다). Rust `open_document` 가 HTML 을 브라우저로 엽니다(설치본은 리소스 doc/).
- `scripts/record-tutorial.mjs`: 보기 모드로 전 레슨을 재생하며 ffmpeg(gdigrab/x11grab)로 창 영역을 녹화 → `MyCAD-Tutorial.mp4`.

## 오류 보고

- JS: `window` 의 error · unhandledrejection, 모든 실패 경로가 `showError()` → 오류 팝업(자세한 내용 · 복사). 팝업을 열 수 없으면 `inlineError()` 가 주 창 안에 같은 보고를 그립니다. 팝업 창의 오류는 `report-error` 로 주 창에 모입니다.
- Rust: `install_panic_hook` 이 모든 패닉을 데이터 폴더의 `crash.log` 에 쓰고 `fatal-error` 이벤트로 팝업에 보냅니다. 주 스레드 패닉(프로세스가 끝남)은 먼저 OS 메시지 상자(`native_alert`, Windows `MessageBoxW`)로 보여 줍니다.
- 실행 표지: 시작할 때 데이터 폴더에 `running.lock`(시작 시각)을 쓰고, 정상 종료(`quit_app`, `RunEvent::Exit`)에서 지웁니다. 시작할 때 남아 있으면 지난 실행이 비정상 종료 → `previous_run` 명령이 그 실행 동안의 `crash.log` 항목과 함께 넘기고 UI 가 오류 팝업으로 보고합니다. E2E 의 `restart()` 는 표지를 지우고(`{ reportCrash: true }` 면 남김) 다시 실행합니다.

## 버전

`package.json` 의 version(= `src-tauri/Cargo.toml`, `tauri.conf.json` 은 package.json 을 가리킴) 하나만 고칩니다. 화면에는 주.부 번호만 `V1.0` 으로: Rust `app_title()`(모든 창 제목), `app.js`·`popup.js` 의 `displayVersion()`(문서 제목 · 프로그램 정보 · 시작 페이지).

## 팝업 · 메뉴

팝업과 메뉴는 Tauri 의 소유(owned) OS 창(`popup-<kind>`, 고정 크기, 주 창과 함께 닫힘), 웹에서는 iframe. 인자는 `localStorage` 의 `mycad.popup.<kind>` 로 넘기고 결과는 이벤트로 돌아옵니다.
새 팝업은 `src/platform/popups.js`(크기)와 `src-tauri/src/lib.rs` 의 `POPUP_KINDS` 에 함께 등록합니다.

## 테스트

`scripts/test.mjs` 가 분류(js · freecad · package · rust · web · desktop · installer)별로 실행하고 Summary 표를 보여 줍니다.
- `test/freecad`: FreeCADCmd + `scripts/freecad/check.py` 로 MyCAD 가 쓴 파일과 samples/exports 를 열어 비교.
- `scripts/freecad/generate.py`: FreeCAD 가 직접 만든 샘플(samples/freecad)과 그 부피 → 단위 테스트가 MyCAD 의 읽기를 비교.
- E2E: `test/e2e/desktop.suite.mjs`(실제 앱, `window.__mycad` 훅), `web.suite.mjs`(헤드리스 Edge).
