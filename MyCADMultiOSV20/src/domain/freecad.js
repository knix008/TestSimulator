// What MyCAD covers of FreeCAD (https://www.freecad.org), workbench by
// workbench: full = works like FreeCAD, partial = a simpler form, none = not
// in MyCAD. Every full/partial item names the MyCAD commands that provide it;
// the tests check that those commands exist and that the 3D formats really
// round-trip through FreeCAD itself (test/freecad).
const item = (status, ko, en, commands = [], noteKo = '', noteEn = '') => ({ status, ko, en, commands, noteKo, noteEn });
const PRIMS = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'tube', 'wedge', 'prism', 'ellipsoid', 'helix'].map((kind) => `solid:${kind}`);

export const FREECAD_COVERAGE = [
  {
    id: 'part', ko: 'Part (파트)', en: 'Part', icon: 'solidBox',
    items: [
      item('full', '기본 도형: 상자·원기둥·구·원뿔·토러스·튜브·쐐기·각기둥·타원체·나선', 'Primitives: box, cylinder, sphere, cone, torus, tube, wedge, prism, ellipsoid, helix', PRIMS),
      item('full', '돌출 (Extrude)', 'Extrude', ['solid:pad']),
      item('full', '회전 (Revolve) — 축 4종, 각도', 'Revolve — four axes, any angle', ['solid:revolution']),
      item('full', '로프트 (Loft) — 여러 단면, 직선 · 매끄럽게', 'Loft — several sections, ruled or smooth', ['solid:loft']),
      item('full', '스윕 (Sweep) — 원형 또는 아무 닫힌 단면', 'Sweep — round or any closed section', ['solid:sweep']),
      item('partial', '불리언: 합치기·빼기·교차 (Fuse·Cut·Common)', 'Booleans: Fuse, Cut, Common', ['bool:union', 'bool:cut', 'bool:common'], '결과는 메시 솔리드 (BSP)', 'The result is a mesh solid (BSP)'),
      item('full', '단면 (Section)', 'Section', ['solidSection']),
      item('full', '대칭·이동·회전·크기 (Mirror, Placement)', 'Mirror, placement', ['tool:mirror', 'tool:move', 'tool:rotate', 'tool:scale', 'editSolid']),
      item('full', '배치 (위치 X·Y·Z, 회전 X·Y·Z)', 'Placement (position X·Y·Z, rotation X·Y·Z)', ['editSolid']),
      item('partial', '모깎기·모따기 (Fillet, Chamfer)', 'Fillet, Chamfer', ['dress:fillet', 'dress:chamfer'], '상자·돌출·각기둥·원기둥·튜브의 모서리 묶음(모두·윗면·세로·밑면), 결과는 메시', 'Edge sets (all, top, vertical, bottom) of boxes, extrusions, prisms, cylinders and tubes; the result is a mesh'),
      item('full', '3D 오프셋·두께 (Offset, Thickness) — 열린 면 위 · 아래 · 둘 다 · 닫힘', '3D offset, Thickness — open top, bottom, both or closed', ['dress:offset3d', 'dress:thickness']),
      item('full', '형상 검사 (Check geometry)', 'Check geometry', ['checkGeometry']),
    ],
  },
  {
    id: 'partdesign', ko: 'Part Design (파트 디자인)', en: 'Part Design', icon: 'solidExtrude',
    items: [
      item('full', '패드 (Pad)', 'Pad', ['solid:pad']),
      item('full', '포켓 (Pocket) — 깊이 · 관통', 'Pocket — dimension, through all', ['solid:pocket']),
      item('full', '회전체 (Revolution)', 'Revolution', ['solid:revolution']),
      item('full', '그루브 (Groove)', 'Groove', ['solid:groove']),
      item('partial', '부가/제거 프리미티브', 'Additive / subtractive primitives', [...PRIMS, 'bool:union', 'bool:cut'], '도형 + 합치기/빼기', 'Primitive + Fuse/Cut'),
      item('full', '부가 로프트·파이프·나선', 'Additive loft, pipe, helix', ['solid:loft', 'solid:sweep', 'solid:helix']),
      item('full', '구멍 (Hole) — 카운터보어 · 카운터싱크 · 드릴 끝', 'Hole — counterbore, countersink, drill point', ['solid:hole', 'part:hole']),
      item('full', '선형·원형 패턴, 대칭', 'Linear / polar pattern, mirror', ['array', 'tool:mirror']),
      item('partial', '모깎기·모따기·두께·구배', 'Fillet, chamfer, thickness, draft', ['dress:fillet', 'dress:chamfer', 'dress:thickness', 'solid:pad'], '모서리 묶음 단위; 구배는 돌출의 구배 각도', 'By edge sets; draft as the pad taper angle'),
    ],
  },
  {
    id: 'sketcher', ko: 'Sketcher (스케치)', en: 'Sketcher', icon: 'polyline',
    items: [
      item('full', '선·폴리선·사각형·원·호·타원·정다각형·중심선', 'Line, polyline, rectangle, circle, arc, ellipse, polygon, centre line', ['tool:line', 'tool:polyline', 'tool:rect', 'tool:circle', 'tool:arc', 'tool:ellipse', 'tool:polygon', 'tool:centerline']),
      item('full', '장공 (Slot)', 'Slot', ['part:slot']),
      item('full', '보조선 (Construction geometry)', 'Construction geometry', ['construction']),
      item('partial', '좌표 입력·스냅·직교', 'Typed coordinates, snaps, ortho', ['snap', 'ortho'], '구속 조건 대신', 'Instead of constraints'),
      item('partial', '기하·치수 구속 조건 풀이 (Constraint solver)', 'Geometric / dimensional constraint solver', ['constrain:coincident', 'constrain:horizontal', 'constrain:distance', 'constrain:angle'], '선 · 원 · 호 · 점에 17가지 구속(대칭 · 가로/세로 거리 포함), 자유도 · 중복 · 충돌 표시; B 스플라인 구속 없음', '17 constraints on lines, circles, arcs and points (symmetric, horizontal/vertical distance included) with DOF, redundancy and conflict status; no B-spline constraints'),
      item('full', '자르기·연장·모깎기·모따기 (Trim, Extend, Fillet, Chamfer)', 'Trim, extend, fillet, chamfer', ['tool:trim', 'tool:extend', 'tool:fillet', 'tool:chamfer']),
    ],
  },
  {
    id: 'techdraw', ko: 'TechDraw (도면)', en: 'TechDraw', icon: 'pageSetup',
    items: [
      item('full', '투상도: 정면·평면·우측면·등각 — 숨은선 제거(정투상은 점선, 등각은 없앰)', 'Projected views: front, top, right, isometric — hidden lines removed (dashed in orthographic views, left out of the isometric)', ['solidProject']),
      item('full', '단면 윤곽', 'Section outline', ['solidSection']),
      item('full', '치수: 선형·정렬·반지름·지름·각도', 'Dimensions: linear, aligned, radius, diameter, angle', ['tool:dimLinear', 'tool:dimAligned', 'tool:dimRadius', 'tool:dimDiameter', 'tool:dimAngle']),
      item('full', '표제란·용지·축척·인쇄·미리보기', 'Title block, paper, scale, print and preview', ['print']),
      item('full', 'SVG·PNG·DXF 내보내기', 'SVG, PNG, DXF export', ['exportSvg', 'exportPng', 'exportDxf']),
      item('full', '풍선·기하 공차(GD&T)·데이텀·해칭', 'Balloons, GD&T frames, datums, hatching', ['tool:balloon', 'tool:gdt', 'tool:datum', 'tool:hatch']),
    ],
  },
  {
    id: 'draft', ko: 'Draft (2D 제도)', en: 'Draft', icon: 'line',
    items: [
      item('full', '그리기 도구·문자', 'Drawing tools, text', ['tool:line', 'tool:text']),
      item('full', '이동·복사·회전·대칭·크기·간격 띄우기', 'Move, copy, rotate, mirror, scale, offset', ['tool:move', 'tool:copy', 'tool:rotate', 'tool:mirror', 'tool:scale', 'tool:offset']),
      item('full', '배열 (사각·원형)', 'Arrays (rectangular, polar)', ['array']),
      item('full', '스냅·격자·직교', 'Snaps, grid, ortho', ['snap', 'grid', 'ortho']),
      item('full', '레이어', 'Layers', ['addLayer']),
      item('full', '분해 (Downgrade)', 'Downgrade (explode)', ['explode']),
      item('full', '자르기·연장·모깎기·모따기 (Trimex, Fillet, Chamfer)', 'Trimex, fillet, chamfer', ['tool:trim', 'tool:extend', 'tool:fillet', 'tool:chamfer']),
      item('full', '클론 (Clone) — 원본을 따르는 복사본, 독립시키기', 'Clone — copies that follow their source, make independent', ['clone', 'unlinkClone']),
      item('partial', '작업 평면 (Working plane)', 'Working plane', ['tool:workPlane', 'workPlaneReset'], '평면도 위 원점·회전 + 새 솔리드 높이 Z; 3D 면 위 평면 없음', 'Origin and rotation on the plan + elevation Z for new solids; no planes on 3D faces'),
    ],
  },
  {
    id: 'parts', ko: '부품 라이브러리 (Fasteners·Gears 애드온)', en: 'Part libraries (Fasteners, Gears add-ons)', icon: 'part',
    items: [
      item('full', '볼트·나사·너트·와셔·구멍 (ISO)', 'Bolts, screws, nuts, washers, holes (ISO)', ['partCategory:fasteners']),
      item('full', '핀·키·멈춤링·O-링', 'Pins, keys, circlips, O-rings', ['partCategory:pins']),
      item('full', '기어·랙·스프로킷·풀리·웜', 'Gears, racks, sprockets, pulleys, worms', ['partCategory:gears']),
      item('full', '베어링·부시·축·플랜지', 'Bearings, bushings, shafts, flanges', ['partCategory:bearings']),
      item('full', '스프링 3종', 'Three kinds of springs', ['partCategory:springs']),
      item('full', '형강·알루미늄 프로파일·파이프', 'Steel sections, aluminium extrusions, tubes', ['partCategory:profiles']),
    ],
  },
  {
    id: 'bim', ko: 'BIM (건축)', en: 'BIM', icon: 'archRoof',
    items: [
      item('full', '벽 (Wall) — 선·폴리선·사각형에서, 폭·높이·정렬, 모서리 맞춤', 'Wall — from lines, polylines, rectangles; width, height, alignment, mitred corners', ['arch:wall']),
      item('full', '창·문 (Window, Door) — 벽에 끼우면 벽이 뚫림, 나눔 칸(가로×세로), 문·양개문·미닫이·개구부, 스케치로 만드는 창', 'Window, Door — hosted by a wall, which is cut; pane grids, doors, double and sliding doors, openings, windows from a sketch', ['arch:window', 'arch:door', 'arch:customWindow']),
      item('full', '커튼월 (Curtain wall) — 멀리언·트랜섬·유리', 'Curtain wall — mullions, transoms, glass', ['arch:curtainwall']),
      item('full', '구조체 (Structure) — 기둥·보·슬래브, 형강 단면(H · ㄷ · ㄱ · T · 각관 · 원형관)과 규격 목록(IPE · HEA · HEB · UPN · L · RHS · CHS)', 'Structure — columns, beams, slabs; steel sections (H, U, L, T, RHS, CHS) and a preset library (IPE, HEA, HEB, UPN, L, RHS, CHS)', ['arch:column', 'arch:beam', 'arch:slab']),
      item('full', '계단 (Stairs) — 일자 · ㄱ자 · ㄷ자(참) · 나선', 'Stairs — straight, L and U (landings), spiral', ['arch:stairs']),
      item('full', '지붕 (Roof) — 아무 평면, 변마다 경사(90° = 박공), 처마 (직선 골격)', 'Roof — any outline, a slope per edge (90° = gable), overhang (straight skeleton)', ['arch:roof']),
      item('full', '공간 (Space) — 실 이름·바닥 면적·체적, 평면도 표기', 'Space — room name, floor area, volume, plan label', ['arch:space']),
      item('full', '난간·울타리 (Railing, Fence) — 기둥 · 손스침 · 하부 레일, 난간 살 · 유리 채움', 'Railing, Fence — posts, handrail, bottom rail; baluster or glass infill', ['arch:railing']),
      item('partial', '설비·가구 (Equipment)', 'Equipment', ['arch:equipment'], '가구·위생기구·자동차 12종', '12 kinds of furniture, fixtures and a car'),
      item('full', '통심선 (Axis, Axis system) — 직교 격자 · 방사형', 'Axis, Axis system — orthogonal grids and radial axes', ['arch:axis']),
      item('full', '단면 평면·평면도 (Section plane, TechDraw Arch view) — 1 m 높이 절단, 벽 해칭, 문 열림, 계단 끊김선', 'Section plane / floor plan — cut at 1 m, hatched walls, door swings, broken stairs', ['arch:wall', 'solidSection', 'solidProject']),
      item('full', '물량표 (Schedule) — 도면 위 표, CSV(스프레드시트)로', 'Schedule — a table on the drawing, CSV for spreadsheets', ['archSchedule', 'scheduleCsv']),
      item('full', 'IFC 4 내보내기 — IfcWall·IfcWindow·IfcDoor·IfcSlab·IfcSpace…, 개구부, 물량 (FreeCAD로 확인)', 'IFC 4 export — IfcWall, IfcWindow, IfcDoor, IfcSlab, IfcSpace…, openings, quantities (checked with FreeCAD)', ['export3d:ifc']),
      item('partial', 'IFC 가져오기', 'IFC import', ['open', 'import3d'], 'MyCAD IFC는 매개변수 객체 그대로, 다른 IFC는 메시 (개구부는 빼기)', 'MyCAD IFC returns parametric objects, other IFC as meshes (openings subtracted)'),
      item('full', '층·건물 트리 (Site › Building › Level) — 층별 평면도, 보이기, 표고 바꾸면 함께 이동, IFC 층', 'Levels and building tree (Site › Building › Level) — a plan per level, visibility, elevation moves its objects, IFC storeys', ['bimManager']),
      item('full', '재료·다층 벽 (Material, MultiMaterial) — 색·해칭, 벽의 재료 층, IFC 재료', 'Materials and multi-layer walls (Material, MultiMaterial) — colour, hatch, wall layers, IFC materials', ['bimManager', 'editSolid']),
      item('full', '철근 (Rebar) — 기둥 · 보 · 슬래브 배근, 그린 선을 따른 모양 철근(굽힘 2.5d)', 'Rebar — column, beam and slab bars; custom-shaped bars along drawn lines (2.5 d bends)', ['arch:rebar']),
      item('full', '트러스 (Truss) — 프랫·하우·워렌', 'Truss — Pratt, Howe, Warren', ['arch:truss']),
      item('full', '패널 (Panel) — 평판·골판', 'Panel — flat and corrugated', ['arch:panel']),
      item('full', '배관 (Pipe) — 지름 · 두께, 꺾임 맞춤 또는 굽힘(엘보), 전선 · 사각 덕트', 'Pipe — diameter, wall, mitred or bent (elbows), cables and rectangular ducts', ['arch:pipe']),
      item('full', '패널 재단 (Panel sheet, nesting) — 판에 배치 · 사용률', 'Panel sheets (nesting) — packed on stock sheets with usage', ['panelNest']),
    ],
  },
  {
    id: 'mesh', ko: 'Mesh (메시)', en: 'Mesh', icon: 'polygon',
    items: [
      item('full', '가져오기: STL·OBJ·PLY·OFF·AMF·3MF', 'Import: STL, OBJ, PLY, OFF, AMF, 3MF', ['import3d']),
      item('full', '내보내기: STL·OBJ·PLY·OFF·AMF·3MF', 'Export: STL, OBJ, PLY, OFF, AMF, 3MF', ['exportStl', 'export3d:obj', 'export3d:ply', 'export3d:off', 'export3d:amf', 'export3d:3mf']),
      item('full', '메시 불리언', 'Mesh booleans', ['bool:union', 'bool:cut', 'bool:common']),
      item('full', '부피·겉넓이·크기 측정', 'Volume, surface area, size', ['properties']),
      item('full', '메시 분석·수리·단순화', 'Mesh analysis, repair, decimation', ['checkGeometry', 'meshRepair', 'meshDecimate']),
    ],
  },
  {
    id: 'files', ko: '파일 형식', en: 'File formats', icon: 'file',
    items: [
      item('partial', 'FreeCAD 문서 (.FCStd) 읽기·쓰기', 'FreeCAD documents (.FCStd) read & write', ['open', 'export3d:fcstd'], '프리미티브·돌출·회전·로프트·스윕·불리언·메시·스케치', 'Primitives, extrusions, revolutions, lofts, sweeps, booleans, meshes, sketches'),
      item('partial', 'STEP (.step/.stp) 읽기·쓰기', 'STEP (.step/.stp) read & write', ['open', 'export3d:step'], '평면·원통·원뿔·구·토러스 면 읽기, 면 분할 B-rep 쓰기', 'Reads plane/cylinder/cone/sphere/torus faces, writes faceted B-rep'),
      item('full', 'DXF 읽기·쓰기 (R12–2018, 바이너리, ANSI 코드 페이지)', 'DXF read & write (R12–2018, binary, ANSI code pages)', ['open', 'importDxf', 'exportDxf', 'exportDxf2000']),
      item('full', 'SVG 읽기·쓰기, PNG 쓰기', 'SVG read & write, PNG write', ['open', 'exportSvg', 'exportPng']),
      item('partial', 'IGES (.igs) 읽기·쓰기', 'IGES (.igs) read & write', ['open', 'exportIges'], '2D·와이어프레임 곡선과 주석 (곡면은 모서리만)', '2D / wireframe curves and notes (surfaces as their edges)'),
      item('full', 'HP-GL/2 플로터 파일 (.plt) 읽기·쓰기', 'HP-GL/2 plot files (.plt) read & write', ['open', 'exportHpgl']),
      item('full', 'PCB: Gerber RS-274X·Excellon 드릴 읽기', 'PCB: Gerber RS-274X and Excellon drill read', ['open']),
      item('full', '3D 프린팅 (STL·3MF·AMF)', '3D printing (STL, 3MF, AMF)', ['exportStl', 'export3d:3mf', 'export3d:amf']),
      item('partial', 'IFC 4 (BIM) 읽기·쓰기', 'IFC 4 (BIM) read & write', ['open', 'export3d:ifc'], '다른 프로그램의 IFC는 메시로 읽음', 'IFC from other programs is read as meshes'),
      item('full', 'VRML 2.0 · COLLADA (DAE) 읽기/쓰기', 'VRML 2.0 and COLLADA (DAE) read and write', ['export3d:wrl', 'export3d:dae']),
      item('full', 'BREP (OpenCASCADE 원본 형식) 읽기/쓰기 — 평면 · 원기둥 · 원뿔 · 구 · 토러스 면', 'BREP (OpenCASCADE native) read and write — plane, cylinder, cone, sphere and torus faces', ['export3d:brep', 'import3d']),
    ],
  },
  {
    id: 'general', ko: '공통 기능', en: 'General', icon: 'gear',
    items: [
      item('full', '3D 보기 (회전·확대·조명·축 눈금·와이어프레임)', '3D view (orbit, zoom, light, graduated axes, wireframe)', ['view3d']),
      item('full', '그리기 스타일 (Draw style) — 그대로·음영·조명 없음·숨은선·와이어프레임·점 + X-Ray·스케치·점토·메시', 'Draw styles — as is, shaded, no shading, hidden line, wireframe, points + X-ray, sketch, clay, mesh', ['view3dStyleMenu']),
      item('full', '실행 취소·다시 실행', 'Undo / redo', ['undo', 'redo']),
      item('full', '여러 문서 (탭)', 'Several documents (tabs)', ['new', 'nextTab']),
      item('full', '속성 편집기', 'Property editor', ['properties']),
      item('full', '수식 입력 (Expressions) — 숫자 칸의 계산식, =식 으로 스프레드시트 별칭에 묶기', 'Expressions — formulas in number fields, =expressions bound to spreadsheet aliases', ['spreadsheet']),
      item('full', '측정 (거리·각도·부피)', 'Measure (distance, angle, volume)', ['tool:measure']),
      item('partial', '스크립트 콘솔 · 매크로 (기록 · 저장 · 실행)', 'Script console, macros (record, save, run)', ['console'], 'Python 대신 JavaScript(cad 객체); 애드온 관리자 없음', 'JavaScript (the cad object) instead of Python; no Addon Manager'),
    ],
  },
  {
    id: 'other', ko: '기타 워크벤치', en: 'Other workbenches', icon: 'info',
    items: [
      item('partial', 'Assembly (조립)', 'Assembly', ['editSolid'], '부품 배치만, 조인트 없음', 'Placement only, no joints'),
      item('full', 'OpenSCAD (CSG) — .scad / .csg 읽기/쓰기 (FreeCAD OpenSCAD 워크벤치로 확인)', 'OpenSCAD (CSG) — .scad / .csg read and write (checked with FreeCAD\'s OpenSCAD workbench)', ['export3d:scad', 'import3d', 'bool:union', 'bool:cut', 'bool:common']),
      item('partial', 'FEM (유한요소 해석)', 'FEM (finite elements)', ['fem'], '2D 골조 보 요소 선형 정적 해석(지지 · 하중 · 단면 · 변위 · 모멘트 · 응력); 3D 솔리드 요소 · CalculiX 없음', '2D frames of beam elements, linear static (supports, loads, sections, displacements, moments, stresses); no 3D solid elements or CalculiX'),
      item('partial', 'CAM (G 코드 가공 경로)', 'CAM (G-code tool paths)', ['cam'], '2.5D: 윤곽(안/밖) · 포켓 · 드릴(G83) · 각인, 공구 하나; 3D 표면 가공 · 시뮬레이터 없음', '2.5D: profile (in/out), pocket, drilling (G83), engrave, one tool; no 3D surfacing or simulator'),
      item('full', 'Spreadsheet — 셀 · 수식 · 별칭, 속성 값을 수식으로 묶기, CSV', 'Spreadsheet — cells, formulas, aliases, property values bound to expressions, CSV', ['spreadsheet']),
      item('full', 'Points — 점 구름 읽기/쓰기 (.xyz · .asc · .pts · ASCII .pcd), 3D 점 표시', 'Points — point clouds in and out (.xyz, .asc, .pts, ASCII .pcd), shown as dots', ['import3d', 'export3d:xyz']),
      item('full', 'Reverse Engineering — 평면 · 구 · 원기둥 맞추기(최소 제곱, RMS), 점으로 메시', 'Reverse Engineering — fit plane, sphere, cylinder (least squares, RMS), mesh from points', ['re:plane', 're:sphere', 're:cylinder', 're:mesh']),
      item('full', 'Surface — 단면 곡면(직선 · 매끄럽게), 채움(막처럼 부풂), 선 돌출 면, 두께로 껍질 솔리드', 'Surface — through sections (ruled or smooth), filling (membrane bulge), extruded curves, thickness to a shell solid', ['solid:surfRuled', 'solid:surfFill', 'solid:surfExtrude']),
      item('full', 'Robot — 6축 로봇(DH), 관절 편집, 역기구학으로 점 이동, 경로 궤적 3D 재생과 KUKA KRL 내보내기', 'Robot — 6-axis robot (DH), joint editing, inverse kinematics to a point, path trajectory played in 3D and exported as KUKA KRL', ['robot:add', 'robot:moveTo', 'robot:path']),
      item('none', 'Python 인터프리터 · 애드온 관리자', 'Python interpreter, Addon Manager'),
      item('none', 'OpenCASCADE 정확한 B-rep 커널 (곡면 위 불리언 · 위상 이름)', 'OpenCASCADE exact B-rep kernel (booleans on curved faces, topological naming)'),
      item('none', 'CalculiX · 3D 솔리드 요소 FEM', 'CalculiX, FEM with 3D solid elements'),
    ],
  },
];

/** Counts of full / partial / none items. */
export function coverageSummary(list = FREECAD_COVERAGE) {
  const all = list.flatMap((group) => group.items);
  const count = (status) => all.filter((entry) => entry.status === status).length;
  return { total: all.length, full: count('full'), partial: count('partial'), none: count('none') };
}

/** Every command id the coverage table refers to. */
export const coverageCommands = (list = FREECAD_COVERAGE) => [...new Set(list.flatMap((group) => group.items.flatMap((entry) => entry.commands)))];
