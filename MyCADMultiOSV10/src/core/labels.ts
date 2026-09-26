// Labels and icons for the FreeCAD / CATIA / SketchUp commands added on top of
// the original menu set. Kept apart from i18n.ts so the typed MessageKey union
// stays small while these stay easy to extend.
import type { Lang } from './settings'

export interface CommandLabel {
  ko: string
  en: string
  icon: string
}

export const COMMAND_LABELS: Record<string, CommandLabel> = {
  // ── FreeCAD Part: primitives and shape operations ──────────────────────────
  wedge: { ko: '웨지', en: 'Wedge', icon: '◭' },
  prism: { ko: '프리즘', en: 'Prism', icon: '⬡' },
  ellipsoid: { ko: '타원체', en: 'Ellipsoid', icon: '⬭' },
  tubePrim: { ko: '튜브', en: 'Tube', icon: '⇢' },
  spiralPrim: { ko: '스파이럴', en: 'Spiral', icon: '⇦' },
  ringPrim: { ko: '링', en: 'Ring', icon: '○' },
  pyramid: { ko: '피라미드', en: 'Pyramid', icon: '↞' },
  xor: { ko: '배타적 합집합', en: 'Boolean XOR', icon: '⊻' },
  booleanFragments: { ko: '불리언 조각', en: 'Boolean fragments', icon: '↟' },
  thickness: { ko: '두께 주기', en: 'Thickness', icon: '↠' },
  offset3d: { ko: '3D 오프셋', en: '3D offset', icon: '⊞' },
  ruled: { ko: '룰드 서피스', en: 'Ruled surface', icon: '▤' },
  crossSections: { ko: '단면 시리즈', en: 'Cross-sections', icon: '↣' },
  compound: { ko: '컴파운드', en: 'Compound', icon: '↤' },
  partArea: { ko: '표면적', en: 'Surface area', icon: '⇉' },

  // ── FreeCAD Draft ─────────────────────────────────────────────────────────
  draftLine: { ko: '선', en: 'Line', icon: '└' },
  draftWire: { ko: '폴리라인', en: 'Polyline', icon: '┘' },
  draftRect: { ko: '사각형 와이어', en: 'Rectangle wire', icon: '├' },
  draftPolygonWire: { ko: '다각형 와이어', en: 'Polygon wire', icon: '┌' },
  draftCircleWire: { ko: '원 와이어', en: 'Circle wire', icon: '┤' },
  draftEllipseWire: { ko: '타원 와이어', en: 'Ellipse wire', icon: '┐' },
  draftArcWire: { ko: '호', en: 'Arc', icon: '┬' },
  draftBSplineWire: { ko: 'B-스플라인', en: 'B-spline', icon: '┴' },
  draftBezierWire: { ko: '베지어 곡선', en: 'Bezier curve', icon: '┼' },
  draftFillet: { ko: '와이어 필렛', en: 'Wire fillet', icon: '╭' },
  draftOffset: { ko: '와이어 오프셋', en: 'Wire offset', icon: '⊂' },
  draftTrimex: { ko: '트림/연장', en: 'Trim / extend', icon: '⇥' },
  draftJoin: { ko: '와이어 결합', en: 'Join wires', icon: '╮' },
  draftSplit: { ko: '와이어 분할', en: 'Split wire', icon: '⋔' },
  draftUpgrade: { ko: '업그레이드', en: 'Upgrade', icon: '⇧' },
  draftDowngrade: { ko: '다운그레이드', en: 'Downgrade', icon: '⇩' },
  draftMove: { ko: '와이어 이동', en: 'Move wire', icon: '⤳' },
  draftRotate: { ko: '와이어 회전', en: 'Rotate wire', icon: '╯' },
  draftScale: { ko: '와이어 스케일', en: 'Scale wire', icon: '╰' },
  draftMirror: { ko: '와이어 대칭', en: 'Mirror wire', icon: '╲' },
  draftStretch: { ko: '스트레치', en: 'Stretch', icon: '╳' },
  orthoArray: { ko: '직교 배열', en: 'Ortho array', icon: '⇋' },
  polarArray: { ko: '극 배열', en: 'Polar array', icon: '✺' },
  circularArray: { ko: '원형 배열', en: 'Circular array', icon: '⇤' },
  pathArray: { ko: '경로 배열', en: 'Path array', icon: '⇎' },
  pointArray: { ko: '점 배열', en: 'Point array', icon: '∴' },
  shapeStringCmd: { ko: '문자 도형', en: 'Shape string', icon: '⇛' },
  draftDimension: { ko: '치수', en: 'Dimension', icon: '▁' },
  draftText: { ko: '텍스트', en: 'Text', icon: '▔' },
  wireToFace: { ko: '와이어 → 면', en: 'Wire to face', icon: '⇜' },

  // ── FreeCAD Sketcher ──────────────────────────────────────────────────────
  sketchSolve2d: { ko: '2D 구속 해석', en: 'Solve 2D sketch', icon: '⊥' },
  sketchRectConstrained: { ko: '구속 사각형', en: 'Constrained rectangle', icon: '⇑' },
  sketchConstraintCheck: { ko: '구속 검사', en: 'Check constraints', icon: '⇞' },
  sketchDof: { ko: '자유도', en: 'Degrees of freedom', icon: '∇' },

  // ── FreeCAD Mesh / Points / Reverse engineering ───────────────────────────
  meshEvaluate: { ko: '메쉬 평가', en: 'Evaluate mesh', icon: '⋱' },
  meshDecimate: { ko: '메쉬 감축', en: 'Decimate mesh', icon: '▽' },
  meshRefine: { ko: '메쉬 세분', en: 'Refine mesh', icon: '⋮' },
  meshHarmonize: { ko: '법선 정리', en: 'Harmonize normals', icon: '⇈' },
  meshFlip: { ko: '법선 반전', en: 'Flip normals', icon: '⇅' },
  meshScale: { ko: '메쉬 스케일', en: 'Scale mesh', icon: '⋰' },
  meshSmooth: { ko: '메쉬 스무딩', en: 'Smooth mesh', icon: '⁙' },
  meshFillHoles: { ko: '구멍 채우기', en: 'Fill holes', icon: '⬤' },
  meshSectionCmd: { ko: '메쉬 단면', en: 'Mesh section', icon: '⁚' },
  pointsDownsample: { ko: '점 간솎기', en: 'Downsample points', icon: '∵' },
  fitPlaneCmd: { ko: '평면 근사', en: 'Fit plane', icon: '⇝' },
  fitSphereCmd: { ko: '구 근사', en: 'Fit sphere', icon: '∍' },
  approxSurface: { ko: '곡면 근사', en: 'Approximate surface', icon: '∄' },

  // ── FreeCAD TechDraw / CATIA Drafting ─────────────────────────────────────
  techdrawPage: { ko: '도면 페이지', en: 'Drawing page', icon: '❏' },
  techdrawSection: { ko: '단면도', en: 'Section view', icon: '❒' },
  techdrawDetail: { ko: '상세도', en: 'Detail view', icon: '🔍' },
  techdrawDim: { ko: '도면 치수', en: 'Drawing dimension', icon: '❑' },
  techdrawHatch: { ko: '해치', en: 'Hatch', icon: '▨' },
  techdrawBom: { ko: '부품표', en: 'Bill of materials', icon: '❐' },
  exportPageSvg: { ko: '도면 SVG 내보내기', en: 'Export page SVG', icon: '⊁' },
  exportPageDxf: { ko: '도면 DXF 내보내기', en: 'Export page DXF', icon: '⊄' },

  // ── FreeCAD Spreadsheet ───────────────────────────────────────────────────
  sheetFill: { ko: '샘플 시트 채우기', en: 'Fill sample sheet', icon: '▧' },
  sheetRecompute: { ko: '시트 재계산', en: 'Recompute sheet', icon: '▥' },
  sheetExportCsv: { ko: 'CSV 내보내기', en: 'Export CSV', icon: '⊟' },
  sheetBindParams: { ko: '별칭 → 파라미터', en: 'Aliases to parameters', icon: '⊈' },

  // ── FreeCAD FEM ───────────────────────────────────────────────────────────
  femMesh: { ko: 'FEM 메쉬', en: 'FEM mesh', icon: '⊧' },
  femMaterial: { ko: 'FEM 재질', en: 'FEM material', icon: '⛭' },
  femConstraintFixed: { ko: '고정 구속', en: 'Fixed constraint', icon: '⊦' },
  femConstraintForce: { ko: '하중 구속', en: 'Force constraint', icon: '↓' },
  femSolve: { ko: 'FEM 해석 실행', en: 'Run FEM analysis', icon: '⊩' },
  femBeamCmd: { ko: '보 해석', en: 'Beam analysis', icon: '⊤' },
  femTruss: { ko: '트러스 해석', en: 'Truss analysis', icon: '⊨' },
  femFrequency: { ko: '고유진동수', en: 'Frequency', icon: '⊢' },
  femThermal: { ko: '열 해석', en: 'Thermal analysis', icon: '🌡' },

  // ── FreeCAD CAM ───────────────────────────────────────────────────────────
  camProfile: { ko: '윤곽 가공', en: 'Profile operation', icon: '⌔' },
  camPocketOp: { ko: '포켓 가공', en: 'Pocket operation', icon: '⌓' },
  camDrill: { ko: '드릴 가공', en: 'Drilling', icon: '⌜' },
  camSurface: { ko: '3D 표면 가공', en: 'Surface operation', icon: '⌙' },
  camHelix: { ko: '헬리컬 가공', en: 'Helix operation', icon: '⌑' },
  camEngrave: { ko: '인그레이빙', en: 'Engrave', icon: '⌝' },
  camAdaptive: { ko: '어댑티브 가공', en: 'Adaptive clearing', icon: '⌘' },
  camPost: { ko: '포스트 프로세스', en: 'Post process', icon: '⌁' },
  camStats: { ko: '가공 시간 추정', en: 'Job statistics', icon: '⏱' },

  // ── FreeCAD BIM / Arch ────────────────────────────────────────────────────
  bimWall: { ko: '벽', en: 'Wall', icon: '▮' },
  bimColumn: { ko: '기둥', en: 'Column', icon: '▯' },
  bimBeam: { ko: '보', en: 'Beam', icon: '▐' },
  bimSlab: { ko: '슬래브', en: 'Slab', icon: '▌' },
  bimRoof: { ko: '지붕', en: 'Roof', icon: '◺' },
  bimWindow: { ko: '창', en: 'Window', icon: '▀' },
  bimDoor: { ko: '문', en: 'Door', icon: '🚪' },
  bimStairs: { ko: '계단', en: 'Stairs', icon: '▚' },
  bimSpace: { ko: '공간', en: 'Space', icon: '⬚' },
  bimRailing: { ko: '난간', en: 'Railing', icon: '⌗' },
  bimLevels: { ko: '층 생성', en: 'Create levels', icon: '≡' },
  bimSchedule: { ko: '수량 산출', en: 'Schedule', icon: '▄' },
  bimExportIfc: { ko: 'IFC4 내보내기', en: 'Export IFC4', icon: '░' },
  bimFootprint: { ko: '건축 면적', en: 'Footprint area', icon: '█' },

  // ── FreeCAD Material / Measure / Macro ────────────────────────────────────
  materialAssign: { ko: '재질 지정', en: 'Assign material', icon: '⊉' },
  massProps: { ko: '질량 특성', en: 'Mass properties', icon: '≧' },
  materialLibrary: { ko: '재질 목록', en: 'Material library', icon: '↡' },
  measureDistanceCmd: { ko: '거리 측정', en: 'Measure distance', icon: '∟' },
  measureAngleCmd: { ko: '각도 측정', en: 'Measure angle', icon: '≪' },
  measureAreaCmd: { ko: '면적 측정', en: 'Measure area', icon: '∡' },
  measureVolumeCmd: { ko: '부피 측정', en: 'Measure volume', icon: '≫' },
  measureBoxCmd: { ko: '바운딩 박스', en: 'Bounding box', icon: '∢' },
  expressionEval: { ko: '수식 계산', en: 'Evaluate expression', icon: '∁' },
  runMacro: { ko: '매크로 실행', en: 'Run macro', icon: '⊋' },

  // ── CATIA Generative Shape Design ─────────────────────────────────────────
  gsdExtrude: { ko: '서피스 돌출', en: 'Extrude surface', icon: '≊' },
  gsdRevolve: { ko: '서피스 회전', en: 'Revolve surface', icon: '≋' },
  gsdSweep: { ko: '스윕', en: 'Sweep', icon: '≀' },
  gsdMultiSection: { ko: '멀티섹션 서피스', en: 'Multi-section surface', icon: '≃' },
  gsdFill: { ko: '필 서피스', en: 'Fill surface', icon: '≂' },
  gsdBlend: { ko: '블렌드', en: 'Blend', icon: '◠' },
  gsdOffsetSurf: { ko: '서피스 오프셋', en: 'Offset surface', icon: '∽' },
  gsdJoin: { ko: '서피스 조인', en: 'Join surfaces', icon: '⋈' },
  gsdSplit: { ko: '서피스 분할', en: 'Split surface', icon: '≈' },
  gsdBoundary: { ko: '경계 추출', en: 'Extract boundary', icon: '≁' },
  gsdHeal: { ko: '힐링 검사', en: 'Healing check', icon: '⚕' },
  gsdIso: { ko: '등매개 곡선', en: 'Isoparametric curve', icon: '∿' },
  gsdHelixCurve: { ko: '나선 곡선', en: 'Helix curve', icon: '∼' },
  gsdSpline: { ko: '3D 스플라인', en: '3D spline', icon: '∾' },
  gsdConic: { ko: '코닉 곡선', en: 'Conic curve', icon: '◡' },

  // ── CATIA Sheet Metal ─────────────────────────────────────────────────────
  smWall: { ko: '시트메탈 월', en: 'Sheet metal wall', icon: '▰' },
  smFlange: { ko: '플랜지', en: 'Flange', icon: '⌐' },
  smHem: { ko: '헴', en: 'Hem', icon: '⊒' },
  smUnfold: { ko: '전개도', en: 'Unfold', icon: '⬓' },
  smCheck: { ko: '성형성 검사', en: 'Formability check', icon: '⚠' },
  smExportDxf: { ko: '전개도 DXF', en: 'Flat pattern DXF', icon: '⊐' },
  smFolded: { ko: '접힌 형상 생성', en: 'Build folded part', icon: '⊏' },

  // ── CATIA DMU Kinematics ──────────────────────────────────────────────────
  dmuRevolute: { ko: '회전 조인트', en: 'Revolute joint', icon: '⋉' },
  dmuPrismatic: { ko: '직선 조인트', en: 'Prismatic joint', icon: '⋊' },
  dmuSimulate: { ko: '메커니즘 시뮬레이션', en: 'Simulate mechanism', icon: '⋌' },
  dmuDof: { ko: '자유도 확인', en: 'Check DOF', icon: 'ƒ' },
  dmuClash: { ko: '간섭 검사', en: 'Clash detection', icon: '⋋' },
  dmuEnvelope: { ko: '동작 영역', en: 'Swept envelope', icon: '⋍' },

  // ── CATIA Knowledgeware ───────────────────────────────────────────────────
  kwFormula: { ko: '수식 파라미터', en: 'Formula parameter', icon: '≕' },
  kwRule: { ko: '규칙 추가', en: 'Add rule', icon: '⚖' },
  kwCheck: { ko: '체크 추가', en: 'Add check', icon: '☑' },
  kwDesignTable: { ko: '디자인 테이블', en: 'Design table', icon: '≔' },
  kwApplyTable: { ko: '구성 적용', en: 'Apply configuration', icon: '⇄' },
  kwTree: { ko: '관계 트리', en: 'Relations tree', icon: '⌥' },

  // ── CATIA Assembly Design ─────────────────────────────────────────────────
  asmProduct: { ko: '제품 구조', en: 'Product structure', icon: '⊝' },
  asmCoincident: { ko: '일치 구속', en: 'Coincident constraint', icon: '⊠' },
  asmOffset: { ko: '오프셋 구속', en: 'Offset constraint', icon: '⊘' },
  asmAngle: { ko: '각도 구속', en: 'Angle constraint', icon: '∠' },
  asmContact: { ko: '접촉 구속', en: 'Contact constraint', icon: '⊣' },
  asmSolve: { ko: '구속 해석', en: 'Solve constraints', icon: '⊙' },
  asmExplode: { ko: '분해도', en: 'Exploded view', icon: '⊡' },
  asmBom: { ko: '부품 목록', en: 'Bill of material', icon: '⊗' },
  asmInertia: { ko: '관성 행렬', en: 'Inertia matrix', icon: '⊚' },
  asmMeasure: { ko: '부품 간 측정', en: 'Measure between', icon: '⊛' },
  asmTree: { ko: '어셈블리 트리', en: 'Assembly tree', icon: '⊜' },

  // ── SketchUp ──────────────────────────────────────────────────────────────
  suPushPull: { ko: '푸시/풀', en: 'Push/Pull', icon: '✶' },
  suFollowMe: { ko: '폴로미', en: 'Follow Me', icon: '✩' },
  suOffsetFace: { ko: '오프셋', en: 'Offset', icon: '✮' },
  suIntersect: { ko: '교차 면', en: 'Intersect faces', icon: '✾' },
  suSoften: { ko: '엣지 부드럽게', en: 'Soften edges', icon: '✲' },
  suMakeGroup: { ko: '그룹 만들기', en: 'Make group', icon: '✹' },
  suExplode: { ko: '그룹 해제', en: 'Explode', icon: '✳' },
  suMakeComponent: { ko: '컴포넌트 만들기', en: 'Make component', icon: '◆' },
  suPlaceInstance: { ko: '컴포넌트 배치', en: 'Place instance', icon: '✿' },
  suTagAssign: { ko: '태그 지정', en: 'Assign tag', icon: '🏷' },
  suTagToggle: { ko: '태그 표시 전환', en: 'Toggle tag', icon: '❀' },
  suScene: { ko: '장면 저장', en: 'Save scene', icon: '🎬' },
  suApplyScene: { ko: '장면 적용', en: 'Apply scene', icon: '✷' },
  suStyle: { ko: '스타일 전환', en: 'Cycle style', icon: '❁' },
  suShadows: { ko: '그림자 설정', en: 'Shadow settings', icon: '☀' },
  suSection: { ko: '단면 평면', en: 'Section plane', icon: '✵' },
  suSectionCut: { ko: '단면 외곽선', en: 'Section cut outline', icon: '❂' },
  suPaint: { ko: '페인트 통', en: 'Paint bucket', icon: '🪣' },
  suTape: { ko: '줄자', en: 'Tape measure', icon: '✻' },
  suProtractor: { ko: '각도기', en: 'Protractor', icon: '✼' },
  suFaceInfo: { ko: '면 정보', en: 'Entity info', icon: 'ℹ' },
  suText3d: { ko: '3D 텍스트', en: '3D text', icon: 'T' },
  suMoveCopies: { ko: '이동 복사', en: 'Move copies', icon: '⋯' },
  suRotateCopies: { ko: '회전 복사', en: 'Rotate copies', icon: '✰' },
  suSolidUnion: { ko: '솔리드 합집합', en: 'Solid union', icon: '❃' },
  suSolidSubtract: { ko: '솔리드 차집합', en: 'Solid subtract', icon: '❄' },
  suSolidTrim: { ko: '솔리드 트림', en: 'Solid trim', icon: '⊖' },
  suSolidSplit: { ko: '솔리드 분리', en: 'Solid split', icon: '⧈' },
  suSolidIntersect: { ko: '솔리드 교집합', en: 'Solid intersect', icon: '❅' },
  suOuterShell: { ko: '아웃터 쉘', en: 'Outer shell', icon: '❆' },
  suTerrain: { ko: '지형 생성', en: 'Terrain from scratch', icon: '⛰' },
  suContours: { ko: '등고선 지형', en: 'Terrain from contours', icon: '〰' },
  suSmoove: { ko: '스무브', en: 'Smoove', icon: '✱' },
  suZoomExtents: { ko: '전체 보기', en: 'Zoom extents', icon: '✯' },
  suWalk: { ko: '걷기', en: 'Walk', icon: '🚶' },
  suOutliner: { ko: '아웃라이너', en: 'Outliner', icon: '✽' },
  suRectangleTool: { ko: '사각형 도구', en: 'Rectangle tool', icon: '✫' },
  suCircleTool: { ko: '원 도구', en: 'Circle tool', icon: '✬' },
  suPolygonTool: { ko: '다각형 도구', en: 'Polygon tool', icon: '✧' },
  suArcTool: { ko: '호 도구', en: 'Arc tool', icon: '✭' },
  suFreehand: { ko: '자유 곡선', en: 'Freehand', icon: '✸' },

  // ── Kernel: B-rep, NURBS, volume FEM, Python, addons ──────────────────────
  brepInfo: { ko: 'B-rep 정보', en: 'B-rep info', icon: '◱' },
  brepChamfer: { ko: 'B-rep 챔퍼', en: 'B-rep chamfer', icon: '◲' },
  brepFillet: { ko: 'B-rep 필렛', en: 'B-rep fillet', icon: '◜' },
  brepEdgesCmd: { ko: '엣지 분석', en: 'Edge analysis', icon: '◰' },
  nurbsCurveCmd: { ko: 'NURBS 곡선', en: 'NURBS curve', icon: '∰' },
  nurbsCircleCmd: { ko: 'NURBS 원', en: 'NURBS circle', icon: '∮' },
  nurbsArcCmd: { ko: 'NURBS 호', en: 'NURBS arc', icon: '∯' },
  nurbsSurfaceCmd: { ko: 'NURBS 회전 곡면', en: 'NURBS revolve', icon: '∬' },
  nurbsExtrudeCmd: { ko: 'NURBS 돌출 곡면', en: 'NURBS extrude', icon: '∫' },
  feaMeshCmd: { ko: '볼륨 메쉬', en: 'Volume mesh', icon: '⊬' },
  feaSolveCmd: { ko: '볼륨 FEM 해석', en: 'Volume FEM solve', icon: '⊭' },
  pythonRunCmd: { ko: 'Python 매크로 실행', en: 'Run Python macro', icon: '🐍' },
  addonListCmd: { ko: '애드온 목록', en: 'Addon list', icon: '🧩' },
  addonInstallCmd: { ko: '애드온 설치', en: 'Install addon', icon: '⌸' },
  addonToggleCmd: { ko: '애드온 사용 전환', en: 'Toggle addon', icon: '≮' },
  addonUninstallCmd: { ko: '애드온 제거', en: 'Uninstall addon', icon: '⌹' },
  addonRunCmd: { ko: '애드온 명령 실행', en: 'Run addon command', icon: '⊌' },
  kernelMenu: { ko: '커널', en: 'Kernel', icon: '≽' },
  kernelWb: { ko: '커널(B-rep/NURBS)', en: 'Kernel (B-rep/NURBS)', icon: '≾' },
  addonsWb: { ko: '애드온', en: 'Addons', icon: '⌶' },
  pythonWb: { ko: 'Python', en: 'Python', icon: '≿' },

  // ── Workbench names ───────────────────────────────────────────────────────
  materialWb: { ko: '재질', en: 'Material', icon: '⊊' },
  reverseWb: { ko: '역설계', en: 'Reverse engineering', icon: '⌺' },
  measureWb: { ko: '측정', en: 'Measure', icon: '≩' },
  gsdWb: { ko: 'GSD(형상 설계)', en: 'Generative Shape Design', icon: '≅' },
  sheetMetalWb: { ko: '시트메탈', en: 'Sheet Metal', icon: '▩' },
  kinematicsWb: { ko: 'DMU 키네매틱스', en: 'DMU Kinematics', icon: '⥀' },
  knowledgeWb: { ko: '지식공학', en: 'Knowledgeware', icon: '∂' },
  draftingWb: { ko: '드래프팅', en: 'Drafting', icon: '▕' },
  sketchupWb: { ko: '스케치업', en: 'SketchUp', icon: '≣' },
  sandboxWb: { ko: '샌드박스', en: 'Sandbox', icon: '≼' },
  macroWb: { ko: '매크로', en: 'Macro', icon: '⊍' },

  // ── Menu titles / misc ────────────────────────────────────────────────────
  sketchMenu: { ko: '스케치', en: 'Sketch', icon: '⊎' },
  surfaceMenu: { ko: '서피스', en: 'Surface', icon: '✴' },
  assemblyMenu: { ko: '어셈블리', en: 'Assembly', icon: '≰' },
  annotateMenu: { ko: '도면', en: 'Drawing', icon: '📄' },
  analyzeMenu: { ko: '해석', en: 'Analyze', icon: '≨' },
  manufactureMenu: { ko: '제조', en: 'Manufacture', icon: '≤' },
  bimMenu: { ko: '건축', en: 'Architecture', icon: '⌂' },
  sketchupMenu: { ko: '스케치업', en: 'SketchUp', icon: '≢' },
  reportTitle: { ko: '결과', en: 'Report', icon: '≶' },

  // ── settings and printing ─────────────────────────────────────────────────
  theme: { ko: '테마', en: 'Theme', icon: '🎨' },
  resetView: { ko: '뷰 초기화', en: 'Reset view', icon: '⟲' },
  drawStyle: { ko: '표시 방식', en: 'Draw style', icon: '⌻' },
  asIs: { ko: '원래대로', en: 'As is', icon: '≻' },
  flatLines: { ko: '평면 + 외곽선', en: 'Flat lines', icon: '◧' },
  points: { ko: '점', en: 'Points', icon: '⁘' },
  hiddenLine: { ko: '은선 제거', en: 'Hidden line', icon: '◫' },
  noShading: { ko: '음영 없음', en: 'No shading', icon: '⊀' },
  projection: { ko: '투영', en: 'Projection', icon: '↨' },
  perspective: { ko: '원근 투영', en: 'Perspective', icon: '⇠' },
  orthographic: { ko: '정투영', en: 'Orthographic', icon: '▱' },
  navigation: { ko: '마우스 조작 방식', en: 'Navigation', icon: '🖱' },
  units: { ko: '단위계', en: 'Units', icon: '⊅' },
  clipping: { ko: '단면 평면', en: 'Clipping planes', icon: '∊' },
  shortcuts: { ko: '키보드 단축키', en: 'Keyboard shortcuts', icon: '⌨' },
  license: { ko: '라이선스', en: 'License', icon: '≦' },
  homepage: { ko: '홈페이지', en: 'Homepage', icon: '🌐' },
  toolPanel: { ko: '도구 패널', en: 'Tool panel', icon: '▛' },
  propertyPanel: { ko: '속성 패널', en: 'Property panel', icon: '▜' },
  lightRig: { ko: '조명', en: 'Light', icon: '≴' },
  lightKind: { ko: '광원 종류', en: 'Light source', icon: '💡' },
  lightColor: { ko: '광원 색', en: 'Light colour', icon: '≳' },
  lightDirectional: { ko: '평행광', en: 'Directional', icon: '⟹' },
  lightPoint: { ko: '점광원', en: 'Point', icon: '⚬' },
  lightSpot: { ko: '스포트라이트', en: 'Spot', icon: '🔦' },
  lightHemisphere: { ko: '하늘광', en: 'Hemisphere', icon: '◐' },
  lightThreePoint: { ko: '3점 조명', en: 'Three point', icon: '✦' },
  lightAmbientOnly: { ko: '환경광만', en: 'Ambient only', icon: '🌫' },
  export: { ko: '내보내기', en: 'Export', icon: '⤓' },
  exportFormat: { ko: '형식', en: 'Format', icon: '↢' },
  options: { ko: '옵션', en: 'Options', icon: '⌽' },
  customTheme: { ko: '사용자 정의 테마', en: 'Custom theme', icon: '🖌' },
  themePreset: { ko: '색 프리셋 (다크 20 · 라이트 20)', en: 'Colour presets (20 dark + 20 light)', icon: '⬜' },
  'font-dec': { ko: '글자 작게', en: 'Smaller text', icon: '−' },
  'font-value': { ko: '글자 크기 기본값', en: 'Reset text size', icon: 'A' },
  'font-inc': { ko: '글자 크게', en: 'Larger text', icon: '⌾' },
  'zoom-out': { ko: '축소', en: 'Zoom out', icon: '≸' },
  'zoom-in': { ko: '확대', en: 'Zoom in', icon: '+' },
  'zoom-value': { ko: '배율 100%로', en: 'Reset zoom', icon: '⌕' },
  printTab: { ko: '인쇄 기본값', en: 'Print defaults', icon: '🖨' },
  showAxes: { ko: '좌표축 표시', en: 'Show axes', icon: '✛' },
  autoScaleAxes: { ko: '축·그리드 자동 확대', en: 'Auto-scale axes', icon: '⇘' },
  print_pages: { ko: '페이지', en: 'Pages', icon: '❜' },
  print_layout: { ko: '용지', en: 'Layout', icon: '❘' },
  print_texts: { ko: '머리글/바닥글', en: 'Texts', icon: '❛' },
  printTitle: { ko: '제목', en: 'Title', icon: '❚' },
  showTitle: { ko: '제목 표시', en: 'Show title', icon: '≯' },
  header: { ko: '머리글', en: 'Header', icon: '↥' },
  footer: { ko: '바닥글', en: 'Footer', icon: '↧' },
  pageNumbers: { ko: '페이지 번호', en: 'Page numbers', icon: '#' },
  printDate: { ko: '날짜 표시', en: 'Show date', icon: '📅' },
  printView: { ko: '투영 방향', en: 'View', icon: '≲' },
  printScale: { ko: '축척(%)', en: 'Scale (%)', icon: '❙' },
  fitToPage: { ko: '용지에 맞춤', en: 'Fit to page', icon: '⇗' },
  showBorder: { ko: '테두리', en: 'Border', icon: '⇒' },
  copies: { ko: '매수', en: 'Copies', icon: '⇆' },
  reportCopy: { ko: '결과 복사', en: 'Copy report', icon: '⇇' }
}

/**
 * One-line explanation of what a command does, shown in the parameter dialog
 * and in the button tooltips.
 */
export const COMMAND_HELP: Record<string, { ko: string; en: string }> = {
  sketchRect: { ko: '작업 평면에 사각형 스케치를 만듭니다. 너비·높이를 입력하세요.', en: 'Draws a rectangular sketch on the work plane.' },
  sketchCircle: { ko: '작업 평면에 원 스케치를 만듭니다. 지름은 너비 값을 씁니다.', en: 'Draws a circular sketch; the width is the diameter.' },
  sketchPolygon: { ko: '정다각형 스케치를 만듭니다. 변 수와 외접원 지름을 입력하세요.', en: 'Draws a regular polygon from its side count and size.' },
  pad: { ko: '마지막 스케치를 길이만큼 돌출시켜 솔리드를 만듭니다.', en: 'Extrudes the last sketch by the given length.' },
  pocket: { ko: '선택한 솔리드에서 스케치 모양만큼 파냅니다.', en: 'Cuts the sketch shape out of the selected solid.' },
  revolve: { ko: '스케치를 축 둘레로 회전시켜 회전체를 만듭니다.', en: 'Revolves the sketch around an axis.' },
  loft: { ko: '두 스케치 단면을 이어 로프트 솔리드를 만듭니다.', en: 'Lofts a solid between two sketch sections.' },
  pipe: { ko: '스케치를 경로를 따라 쓸어 파이프를 만듭니다.', en: 'Sweeps the sketch along a path into a pipe.' },
  helix: { ko: '반지름·피치·회전 수로 나선을 만듭니다.', en: 'Creates a helix from radius, pitch and turns.' },
  fillet: { ko: '모서리를 반지름만큼 둥글립니다.', en: 'Rounds the edges by the given radius.' },
  chamfer: { ko: '모서리를 거리만큼 비스듬히 깎습니다.', en: 'Bevels the edges by the given distance.' },
  shell: { ko: '솔리드 속을 비워 지정한 두께의 껍질만 남깁니다.', en: 'Hollows the solid, leaving a wall of the given thickness.' },
  draft: { ko: '면에 구배 각도를 줍니다(사출·주조용).', en: 'Adds a draft angle to the faces.' },
  thickness: { ko: '면을 지정한 두께의 벽으로 바꿉니다.', en: 'Turns the solid into a wall of the given thickness.' },
  mirror: { ko: '선택한 형상을 기준 평면에 대칭 복사합니다.', en: 'Mirrors the selection across a plane.' },
  linearPattern: { ko: '선택한 형상을 축 방향으로 일정 간격 복제합니다.', en: 'Repeats the selection along an axis.' },
  polarPattern: { ko: '선택한 형상을 원형으로 복제합니다.', en: 'Repeats the selection around a circle.' },
  rectPattern: { ko: '두 방향으로 격자 배열을 만듭니다.', en: 'Repeats the selection on a grid.' },
  hole: { ko: '지름과 깊이로 구멍을 뚫습니다.', en: 'Drills a hole of the given diameter and depth.' },
  counterbore: { ko: '볼트 머리가 들어가는 단차 구멍을 만듭니다.', en: 'Adds a counterbored hole for a bolt head.' },
  countersink: { ko: '접시머리 나사용 원뿔 구멍을 만듭니다.', en: 'Adds a countersunk hole for a flat head screw.' },
  shaft: { ko: '스케치를 회전시켜 축 형상을 만듭니다(CATIA 샤프트).', en: 'Revolves the sketch into a shaft.' },
  groove: { ko: '회전 절삭으로 홈을 팝니다(CATIA 그루브).', en: 'Cuts a revolved groove.' },
  translate: { ko: '선택한 형상을 축 방향으로 이동합니다.', en: 'Moves the selection along an axis.' },
  rotateBody: { ko: '선택한 형상을 각도만큼 회전합니다.', en: 'Rotates the selection by an angle.' },
  scaleBody: { ko: '선택한 형상의 크기를 배율로 바꿉니다.', en: 'Scales the selection by a factor.' },
  refPlane: { ko: '기준 평면에서 떨어진 참조 평면을 만듭니다.', en: 'Creates a reference plane at an offset.' },
  parameter: { ko: '이름과 수식을 가진 설계 파라미터를 추가합니다.', en: 'Adds a named design parameter.' },
  offsetMate: { ko: '두 부품 사이에 거리 구속을 겁니다.', en: 'Constrains two parts at a distance.' }
}

// English button labels are kept short; the full wording lives in the help.
export const SHORT_LABEL_HELP: Record<string, { ko: string; en: string }> = {
  linearPattern: { ko: '선형 패턴', en: 'Linear pattern' },
  polarPattern: { ko: '원형 패턴', en: 'Polar pattern' },
  rectPattern: { ko: '직사각 패턴', en: 'Rectangular pattern' },
  sketchRect: { ko: '사각형 스케치', en: 'Rectangle sketch' },
  sketchCircle: { ko: '원 스케치', en: 'Circle sketch' },
  sketchPolygon: { ko: '다각형 스케치', en: 'Polygon sketch' }
}

export function commandHelp(lang: Lang, id: string): string | undefined {
  const short = SHORT_LABEL_HELP[id]
  const help = COMMAND_HELP[id]?.[lang]
  if (short && help) return `${short[lang]} · ${help}`
  if (short) return short[lang]
  return help
}

export function commandHelpRaw(lang: Lang, id: string): string | undefined {
  return COMMAND_HELP[id]?.[lang]
}

export function commandLabel(lang: Lang, id: string): string | undefined {
  const entry = COMMAND_LABELS[id]
  return entry ? entry[lang] : undefined
}

export function commandIcon(id: string): string | undefined {
  return COMMAND_LABELS[id]?.icon
}

/** Message key for a light kind, e.g. `point` becomes `lightPoint`. */
export function lightKindKey(kind: string): string {
  return `light${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
}
