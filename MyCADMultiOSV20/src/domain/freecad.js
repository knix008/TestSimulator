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
      item('partial', '로프트 (Loft)', 'Loft', ['solid:loft'], '두 윤곽 사이의 직선(ruled) 로프트', 'Ruled loft between two outlines'),
      item('partial', '스윕 (Sweep)', 'Sweep', ['solid:sweep'], '원형 단면만', 'Round section only'),
      item('partial', '불리언: 합치기·빼기·교차 (Fuse·Cut·Common)', 'Booleans: Fuse, Cut, Common', ['bool:union', 'bool:cut', 'bool:common'], '결과는 메시 솔리드 (BSP)', 'The result is a mesh solid (BSP)'),
      item('full', '단면 (Section)', 'Section', ['solidSection']),
      item('full', '대칭·이동·회전·크기 (Mirror, Placement)', 'Mirror, placement', ['tool:mirror', 'tool:move', 'tool:rotate', 'tool:scale', 'editSolid']),
      item('full', '배치 (위치 X·Y·Z, 회전 X·Y·Z)', 'Placement (position X·Y·Z, rotation X·Y·Z)', ['editSolid']),
      item('none', '모깎기·모따기 (Fillet, Chamfer)', 'Fillet, Chamfer'),
      item('none', '3D 오프셋·두께 (Offset, Thickness)', '3D offset, Thickness'),
      item('none', '형상 검사 (Check geometry)', 'Check geometry'),
    ],
  },
  {
    id: 'partdesign', ko: 'Part Design (파트 디자인)', en: 'Part Design', icon: 'solidExtrude',
    items: [
      item('full', '패드 (Pad)', 'Pad', ['solid:pad']),
      item('partial', '포켓 (Pocket)', 'Pocket', ['solid:pad', 'bool:cut'], '패드 + 빼기', 'Pad + Cut'),
      item('full', '회전체 (Revolution)', 'Revolution', ['solid:revolution']),
      item('partial', '그루브 (Groove)', 'Groove', ['solid:revolution', 'bool:cut'], '회전 + 빼기', 'Revolution + Cut'),
      item('partial', '부가/제거 프리미티브', 'Additive / subtractive primitives', [...PRIMS, 'bool:union', 'bool:cut'], '도형 + 합치기/빼기', 'Primitive + Fuse/Cut'),
      item('partial', '부가 로프트·파이프·나선', 'Additive loft, pipe, helix', ['solid:loft', 'solid:sweep', 'solid:helix'], '직선 로프트, 원형 단면 파이프', 'Ruled loft, round-section pipe'),
      item('partial', '구멍 (Hole)', 'Hole', ['part:hole', 'bool:cut'], '규격 구멍 도면 + 원기둥 빼기', 'Standard hole drawing + cylinder cut'),
      item('full', '선형·원형 패턴, 대칭', 'Linear / polar pattern, mirror', ['array', 'tool:mirror']),
      item('none', '모깎기·모따기·구배·두께', 'Fillet, chamfer, draft, thickness'),
    ],
  },
  {
    id: 'sketcher', ko: 'Sketcher (스케치)', en: 'Sketcher', icon: 'polyline',
    items: [
      item('full', '선·폴리선·사각형·원·호·타원·정다각형·중심선', 'Line, polyline, rectangle, circle, arc, ellipse, polygon, centre line', ['tool:line', 'tool:polyline', 'tool:rect', 'tool:circle', 'tool:arc', 'tool:ellipse', 'tool:polygon', 'tool:centerline']),
      item('full', '장공 (Slot)', 'Slot', ['part:slot']),
      item('partial', '보조선 (Construction geometry)', 'Construction geometry', ['tool:centerline'], '중심선·숨은선 선종류', 'Centre / hidden line types'),
      item('partial', '좌표 입력·스냅·직교', 'Typed coordinates, snaps, ortho', ['snap', 'ortho'], '구속 조건 대신', 'Instead of constraints'),
      item('none', '기하·치수 구속 조건 풀이 (Constraint solver)', 'Geometric / dimensional constraint solver'),
      item('none', '자르기·연장 (Trim, Extend)', 'Trim, Extend'),
    ],
  },
  {
    id: 'techdraw', ko: 'TechDraw (도면)', en: 'TechDraw', icon: 'pageSetup',
    items: [
      item('partial', '투상도: 정면·평면·우측면·등각', 'Projected views: front, top, right, isometric', ['solidProject'], '숨은선 제거 없음', 'No hidden-line removal'),
      item('full', '단면 윤곽', 'Section outline', ['solidSection']),
      item('full', '치수: 선형·정렬·반지름·지름·각도', 'Dimensions: linear, aligned, radius, diameter, angle', ['tool:dimLinear', 'tool:dimAligned', 'tool:dimRadius', 'tool:dimDiameter', 'tool:dimAngle']),
      item('full', '표제란·용지·축척·인쇄·미리보기', 'Title block, paper, scale, print and preview', ['print']),
      item('full', 'SVG·PNG·DXF 내보내기', 'SVG, PNG, DXF export', ['exportSvg', 'exportPng', 'exportDxf']),
      item('none', '풍선·해칭·기하 공차', 'Balloons, hatching, GD&T'),
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
      item('none', '작업 평면·클론', 'Working plane, clones'),
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
    id: 'mesh', ko: 'Mesh (메시)', en: 'Mesh', icon: 'polygon',
    items: [
      item('full', '가져오기: STL·OBJ·PLY·OFF·AMF·3MF', 'Import: STL, OBJ, PLY, OFF, AMF, 3MF', ['import3d']),
      item('full', '내보내기: STL·OBJ·PLY·OFF·AMF·3MF', 'Export: STL, OBJ, PLY, OFF, AMF, 3MF', ['exportStl', 'export3d:obj', 'export3d:ply', 'export3d:off', 'export3d:amf', 'export3d:3mf']),
      item('full', '메시 불리언', 'Mesh booleans', ['bool:union', 'bool:cut', 'bool:common']),
      item('full', '부피·겉넓이·크기 측정', 'Volume, surface area, size', ['properties']),
      item('none', '메시 분석·수리·단순화', 'Mesh analysis, repair, decimation'),
    ],
  },
  {
    id: 'files', ko: '파일 형식', en: 'File formats', icon: 'file',
    items: [
      item('partial', 'FreeCAD 문서 (.FCStd) 읽기·쓰기', 'FreeCAD documents (.FCStd) read & write', ['open', 'export3d:fcstd'], '프리미티브·돌출·회전·로프트·스윕·불리언·메시·스케치', 'Primitives, extrusions, revolutions, lofts, sweeps, booleans, meshes, sketches'),
      item('partial', 'STEP (.step/.stp) 읽기·쓰기', 'STEP (.step/.stp) read & write', ['open', 'export3d:step'], '평면·원통·원뿔·구·토러스 면 읽기, 면 분할 B-rep 쓰기', 'Reads plane/cylinder/cone/sphere/torus faces, writes faceted B-rep'),
      item('full', 'DXF 읽기·쓰기, SVG·PNG 쓰기', 'DXF read & write, SVG and PNG write', ['open', 'exportDxf', 'exportSvg', 'exportPng']),
      item('full', '3D 프린팅 (STL·3MF·AMF)', '3D printing (STL, 3MF, AMF)', ['exportStl', 'export3d:3mf', 'export3d:amf']),
      item('none', 'IGES·BREP·IFC·DAE·VRML', 'IGES, BREP, IFC, DAE, VRML'),
    ],
  },
  {
    id: 'general', ko: '공통 기능', en: 'General', icon: 'gear',
    items: [
      item('full', '3D 보기 (회전·확대·조명·축 눈금·와이어프레임)', '3D view (orbit, zoom, light, graduated axes, wireframe)', ['view3d']),
      item('full', '실행 취소·다시 실행', 'Undo / redo', ['undo', 'redo']),
      item('full', '여러 문서 (탭)', 'Several documents (tabs)', ['new', 'nextTab']),
      item('full', '속성 편집기', 'Property editor', ['properties']),
      item('partial', '수식 입력 (Expressions)', 'Expressions', ['properties'], '숫자 칸에 계산식', 'Formulas in number fields'),
      item('full', '측정 (거리·각도·부피)', 'Measure (distance, angle, volume)', ['tool:measure']),
      item('none', 'Python 콘솔·매크로·애드온 관리자', 'Python console, macros, Addon Manager'),
    ],
  },
  {
    id: 'other', ko: '기타 워크벤치', en: 'Other workbenches', icon: 'info',
    items: [
      item('partial', 'Assembly (조립)', 'Assembly', ['editSolid'], '부품 배치만, 조인트 없음', 'Placement only, no joints'),
      item('partial', 'OpenSCAD (CSG)', 'OpenSCAD (CSG)', ['bool:union', 'bool:cut', 'bool:common'], 'CSG 연산만, .scad 없음', 'CSG operations, no .scad files'),
      item('none', 'FEM (유한요소 해석)', 'FEM (finite elements)'),
      item('none', 'CAM (G-code 가공 경로)', 'CAM (G-code tool paths)'),
      item('none', 'BIM / Arch (건축)', 'BIM / Arch'),
      item('none', 'Surface·Points·Reverse Engineering·Robot·Spreadsheet', 'Surface, Points, Reverse Engineering, Robot, Spreadsheet'),
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
