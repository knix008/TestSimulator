// Words of the FEM analysis commands (src/commands/femx.js) in Korean and English.
const pre = (o, p) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}${k}`, v]));

const C_KO = {
  displacement: '변위 경계조건', pressure: '압력 하중', centrif: '원심 하중', spring: '스프링 경계조건', rigidBody: '강체 구속', planeRotation: '평면 다점 구속', bearing: '베어링 구속', gear: '기어 구속',
  pulley: '풀리 구속', contact: '접촉 구속', tie: '타이 구속', transform: '국부 좌표계', sectionPrint: '단면력 출력', temperature: '온도 경계조건', heatflux: '열유속 하중', bodyHeatSource: '체적 발열',
  initialTemperature: '초기 온도', electrostaticPotential: '정전 전위 경계조건', electricChargeDensity: '전하 밀도', currentDensity: '전류 밀도 경계조건', magnetization: '자화 경계조건',
  flowVelocity: '유속 경계조건', initialFlowVelocity: '초기 유속', initialPressure: '초기 압력', fluidBoundary: '유체 경계조건',
};
const C_EN = {
  displacement: 'Displacement boundary condition', pressure: 'Pressure load', centrif: 'Centrifugal load', spring: 'Spring boundary condition', rigidBody: 'Rigid body constraint', planeRotation: 'Plane multi-point constraint', bearing: 'Bearing constraint', gear: 'Gear constraint',
  pulley: 'Pulley constraint', contact: 'Contact constraint', tie: 'Tie constraint', transform: 'Local coordinate system', sectionPrint: 'Section print', temperature: 'Temperature boundary condition', heatflux: 'Heat flux load', bodyHeatSource: 'Body heat source',
  initialTemperature: 'Initial temperature', electrostaticPotential: 'Electrostatic potential', electricChargeDensity: 'Electric charge density', currentDensity: 'Current density boundary condition', magnetization: 'Magnetization boundary condition',
  flowVelocity: 'Flow velocity boundary condition', initialFlowVelocity: 'Initial flow velocity', initialPressure: 'Initial pressure', fluidBoundary: 'Fluid boundary condition',
};
const EQ_KO = { elasticity: '탄성 방정식', deformation: '변형 방정식 (비선형)', heat: '열 방정식', electrostatic: '정전기 방정식', electricforce: '전기력 방정식', staticCurrent: '정전류 방정식', flow: '유동 방정식 (포텐셜 유동)', flux: '플럭스 방정식', magnetodynamic: '자기 동역학 방정식', magnetodynamic2D: '자기 동역학 2D 방정식' };
const EQ_EN = { elasticity: 'Elasticity equation', deformation: 'Deformation equation (non-linear)', heat: 'Heat equation', electrostatic: 'Electrostatic equation', electricforce: 'Electric force equation', staticCurrent: 'Static current equation', flow: 'Flow equation (potential flow)', flux: 'Flux equation', magnetodynamic: 'Magnetodynamic equation', magnetodynamic2D: 'Magnetodynamic 2D equation' };
const F_KO = { temperature: '온도', heatFlux: '열유속', potential: '전위', electricField: '전기장', currentPotential: '전류 전위', currentDensity: '전류 밀도', velocity: '속도', pressure: '압력', magneticPotential: '자기 벡터 포텐셜', magneticFlux: '자속 밀도', flux: '전속 밀도', displacement: '변위', vm: '폰 미제스 응력', sxx: '응력 σxx', syy: '응력 σyy', szz: '응력 σzz', calculated: '계산 값' };
const F_EN = { temperature: 'Temperature', heatFlux: 'Heat flux', potential: 'Potential', electricField: 'Electric field', currentPotential: 'Current potential', currentDensity: 'Current density', velocity: 'Velocity', pressure: 'Pressure', magneticPotential: 'Magnetic vector potential', magneticFlux: 'Magnetic flux density', flux: 'Electric flux density', displacement: 'Displacement', vm: 'von Mises stress', sxx: 'Stress σxx', syy: 'Stress σyy', szz: 'Stress σzz', calculated: 'Calculated' };
const M_KO = { name: '이름', E: '탄성 계수 (MPa)', nu: '푸아송 비', density: '밀도 (kg/m³)', alpha: '열팽창 계수 (1/K)', k: '열전도율 (W/m·K)', cp: '비열 (J/kg·K)', eps: '비유전율', sigma: '전기 전도도 (S/m)', mu: '비투자율', yield: '항복 응력 (MPa)', hardening: '경화 계수 (MPa)', steelRatio: '철근 비', steelE: '철근 탄성 계수 (MPa)', viscosity: '점도 (Pa·s)' };
const M_EN = { name: 'Name', E: "Young's modulus (MPa)", nu: "Poisson's ratio", density: 'Density (kg/m³)', alpha: 'Thermal expansion (1/K)', k: 'Thermal conductivity (W/m·K)', cp: 'Specific heat (J/kg·K)', eps: 'Relative permittivity', sigma: 'Electric conductivity (S/m)', mu: 'Relative permeability', yield: 'Yield stress (MPa)', hardening: 'Hardening modulus (MPa)', steelRatio: 'Reinforcement ratio', steelE: 'Steel modulus (MPa)', viscosity: 'Viscosity (Pa·s)' };
const P_KO = {
  ux: 'X 변위 (빈칸: 자유)', uy: 'Y 변위 (빈칸: 자유)', uz: 'Z 변위 (빈칸: 자유)', pressure: '압력', rpm: '회전 속도', px: '축 위의 점 X', py: '축 위의 점 Y', pz: '축 위의 점 Z', ax: '축 방향 X', ay: '축 방향 Y', az: '축 방향 Z',
  normal: '법선 강성', tangential: '접선 강성', axialFixed: '축 방향도 고정', force: '힘', angle: '압력각', dx: '힘 방향 X', dy: '힘 방향 Y', dz: '힘 방향 Z', rx: '회전 X / 반경 방향 X', ry: '회전 Y / 반경 방향 Y', rz: '회전 Z / 반경 방향 Z',
  force1: '벨트 장력 1', force2: '벨트 장력 2', stiffness: '접촉 강성', tolerance: '찾는 거리', offset: '단면까지 거리', value: '값', mode: '방식', 'mode.flux': '열유속', 'mode.convection': '대류 (막 계수)', flux: '유속 (밀도)', film: '막 계수', ambient: '주변 온도',
  jx: '체적 전류 X', jy: '체적 전류 Y', jz: '체적 전류 Z', mx: '자화 X', my: '자화 Y', mz: '자화 Z', velocity: '속도', potential: '퍼텐셜',
};
const P_EN = {
  ux: 'X displacement (blank: free)', uy: 'Y displacement (blank: free)', uz: 'Z displacement (blank: free)', pressure: 'Pressure', rpm: 'Speed', px: 'Axis point X', py: 'Axis point Y', pz: 'Axis point Z', ax: 'Axis direction X', ay: 'Axis direction Y', az: 'Axis direction Z',
  normal: 'Normal stiffness', tangential: 'Tangential stiffness', axialFixed: 'Fix the axial direction too', force: 'Force', angle: 'Pressure angle', dx: 'Force direction X', dy: 'Force direction Y', dz: 'Force direction Z', rx: 'Rotation X / radial X', ry: 'Rotation Y / radial Y', rz: 'Rotation Z / radial Z',
  force1: 'Belt tension 1', force2: 'Belt tension 2', stiffness: 'Contact stiffness', tolerance: 'Search distance', offset: 'Distance to the section', value: 'Value', mode: 'Mode', 'mode.flux': 'Heat flux', 'mode.convection': 'Convection (film coefficient)', flux: 'Flux (density)', film: 'Film coefficient', ambient: 'Ambient temperature',
  jx: 'Body current X', jy: 'Body current Y', jz: 'Body current Z', mx: 'Magnetization X', my: 'Magnetization Y', mz: 'Magnetization Z', velocity: 'Velocity', potential: 'Potential',
};

const KO = {
  ...pre(C_KO, 'femx.c.'), ...pre(EQ_KO, 'femx.eq.'), ...pre(F_KO, 'femx.f.'), ...pre(M_KO, 'femx.m.'), ...pre(P_KO, 'femx.p.'),
  'menuGroup.femTools': 'FEM 해석 도구', 'menuGroup.femConstraints': '구조 구속 · 하중', 'menuGroup.femPhysics': '열 · 전기 · 자기 · 유동 조건', 'menuGroup.femEquations': '방정식', 'menuGroup.femMaterials': '재료 · 1D 요소',
  'menuGroup.femMesh': 'FEM 메시', 'menuGroup.femSolve': '솔버', 'menuGroup.femResults': '결과 · 후처리',
  'femx.fn.plane': '평면', 'femx.fn.sphere': '구', 'femx.fn.box': '상자', 'femx.fn.cylinder': '원기둥', 'femx.ex.cantilever': '외팔보 (구조)', 'femx.ex.thermal': '막대 열전달 (대류)', 'femx.ex.capacitor': '평판 커패시터 (정전기)',
  'femx.solver.internal': 'MyCAD 내장 솔버', 'femx.solver.calculix': 'CalculiX 입력 (.inp)', 'femx.solver.elmer': 'Elmer 입력 (.sif + 메시)', 'femx.solver.mystran': 'MYSTRAN 입력 (.bdf)', 'femx.solver.z88': 'Z88 입력 파일',
  'femx.ax': '시작점 X', 'femx.ay': '시작점 Y', 'femx.az': '시작점 Z', 'femx.bx': '끝점 X', 'femx.by': '끝점 Y', 'femx.bz': '끝점 Z',
  'femx.eps0': '진공 유전율', 'femx.materialEditor': '재료 편집…', 'femx.material.fluid': '유체 재료…', 'femx.material.nonlinear': '비선형 재료…', 'femx.material.reinforced': '철근 콘크리트 재료…',
  'femx.mesher.netgen': 'Netgen 메시…', 'femx.mesher.gmsh': 'Gmsh 메시…', 'femx.meshRegion': '메시 세분화 영역…', 'femx.meshLayer': '경계층 메시…', 'femx.meshGroup': '메시 그룹…', 'femx.meshClear': 'FEM 메시 지우기',
  'femx.meshInfo': '메시 정보', 'femx.mesh2mesh': 'FEM 메시 → 메시', 'femx.nodesSet': '절점 집합…', 'femx.nodesByPolygon': '다각형으로 절점 집합', 'femx.elementsByPolygon': '다각형으로 요소 집합', 'femx.eraseElements': '다각형으로 요소 지우기',
  'femx.fluid1D': '1D 유체 단면 (관로)…', 'femx.rotation1D': '보 회전…', 'femx.solverControl': '솔버 실행…', 'femx.pipeline': '결과 보기 (파이프라인)…', 'femx.apply': '파이프라인 다시 적용',
  'femx.filter.branch': '파이프라인 가지', 'femx.functions': '필터 함수…', 'femx.filter.calculator': '계산기 필터…', 'femx.filter.clipRegion': '영역 자르기 필터…', 'femx.filter.clipScalar': '값 자르기 필터…',
  'femx.filter.contours': '등고면 필터…', 'femx.filter.cutFunction': '함수 단면 필터…', 'femx.filter.dataAlongLine': '선 위 데이터…', 'femx.filter.dataAtPoint': '점의 데이터…', 'femx.filter.glyph': '화살표 필터…',
  'femx.filter.linearizedStresses': '응력 선형화…', 'femx.filter.warp': '변형 필터…', 'femx.histogram': '히스토그램…', 'femx.lineplot': '선 그래프…', 'femx.table': '표…', 'femx.purge': '결과 지우기',
  'femx.clipAdd': '면에 자르기 평면', 'femx.clipRemove': '자르기 평면 모두 없애기', 'femx.examples': 'FEM 예제…',
  'femx.op.analysis': 'FEM 해석', 'femx.op.chart': '그래프', 'femx.op.constraint': 'FEM 구속', 'femx.op.equation': '방정식', 'femx.op.erase': '요소 지우기', 'femx.op.fluid1D': '관로 유동', 'femx.op.function': '필터 함수',
  'femx.op.material': 'FEM 재료', 'femx.op.mesh': 'FEM 메시', 'femx.op.mesh2mesh': 'FEM 메시 → 메시', 'femx.op.pipeline': '파이프라인', 'femx.op.purge': '결과 지우기', 'femx.op.result': 'FEM 결과', 'femx.op.rotation': '보 회전',
  'femx.op.set': '집합', 'femx.op.solver': '솔버', 'femx.op.table': '표',
  'femx.pickSolid': '해석할 솔리드를 먼저 고르세요', 'femx.face': '면 (3D 에서 고르지 않았을 때)', 'femx.face2': '상대 면', 'femx.onPicked': '고른 면 {count}개에 적용합니다', 'femx.added': '{name} 을(를) 더했습니다',
  'femx.equationOn': '{name} 을(를) 켰습니다', 'femx.equationOff': '{name} 을(를) 껐습니다', 'femx.elementSize': '요소 크기', 'femx.meshed': '절점 {nodes}개 · 요소 {elements}개',
  'femx.layers': '층 수', 'femx.layerThickness': '경계층 두께', 'femx.groupName': '이름', 'femx.groupN': '그룹 {n}', 'femx.nodeSet': '절점 집합', 'femx.elementSet': '요소 집합',
  'femx.erased': '요소 {count}개를 지웠습니다', 'femx.setMade': '{count}개로 집합을 만들었습니다', 'femx.resultsGroup': 'FEM 결과', 'femx.nothingToShow': '보일 것이 없습니다',
  'femx.range': '{name}: {lo} … {hi}', 'femx.field': '결과 값', 'femx.noVectors': '벡터 결과가 없습니다', 'femx.warpFactor': '변형 배율', 'femx.threshold': '경계 값', 'femx.keepAbove': '경계 값 이상만 남기기',
  'femx.noFunctions': '필터 함수가 없습니다 (먼저 "필터 함수")', 'femx.function': '필터 함수', 'femx.keepOutside': '함수 밖을 남기기', 'femx.levels': '등고면 수', 'femx.glyphScale': '화살표 길이',
  'femx.samples': '점 수', 'femx.outside': '메시 밖입니다', 'femx.needStresses': '응력 결과가 없습니다 (탄성 방정식을 켜세요)', 'femx.membrane': '막 응력', 'femx.bending': '굽힘 응력', 'femx.total': '합 응력',
  'femx.linearizedDone': '막 {m} MPa · 굽힘 {b} MPa', 'femx.expression': '식', 'femx.fieldsAre': '쓸 수 있는 값', 'femx.functionType': '종류', 'femx.dirX': '방향 X', 'femx.dirY': '방향 Y', 'femx.dirZ': '방향 Z',
  'femx.radiusSize': '반지름 / 크기', 'femx.applied': '필터 {count}개를 다시 적용했습니다', 'femx.bins': '구간 수', 'femx.node': '절점', 'femx.element': '요소', 'femx.tableMade': '{count}줄 표를 만들었습니다',
  'femx.solver': '솔버', 'femx.solverIntro': '방정식: {equations}', 'femx.writeInput': '입력 파일 쓰기', 'femx.run': '풀기', 'femx.pickLines': '관로로 쓸 선을 고르세요', 'femx.pipeDiameter': '관 지름',
  'femx.pressureIn': '입구 압력', 'femx.pressureOut': '출구 압력', 'femx.flowDone': '첫 관의 유량 {q} L/s', 'femx.beamRotation': '단면 회전', 'femx.example': '예제', 'femx.femMesh': 'FEM 메시',
  'femx.branchMade': '파이프라인 가지를 만들었습니다', 'femx.purged': '결과를 지웠습니다', 'femx.nodes': '절점', 'femx.elements': '요소', 'femx.faces': '바깥 면',
};

const EN = {
  ...pre(C_EN, 'femx.c.'), ...pre(EQ_EN, 'femx.eq.'), ...pre(F_EN, 'femx.f.'), ...pre(M_EN, 'femx.m.'), ...pre(P_EN, 'femx.p.'),
  'menuGroup.femTools': 'FEM analysis tools', 'menuGroup.femConstraints': 'Structural constraints and loads', 'menuGroup.femPhysics': 'Thermal, electric, magnetic, flow conditions', 'menuGroup.femEquations': 'Equations', 'menuGroup.femMaterials': 'Materials and 1D elements',
  'menuGroup.femMesh': 'FEM mesh', 'menuGroup.femSolve': 'Solvers', 'menuGroup.femResults': 'Results and post-processing',
  'femx.fn.plane': 'Plane', 'femx.fn.sphere': 'Sphere', 'femx.fn.box': 'Box', 'femx.fn.cylinder': 'Cylinder', 'femx.ex.cantilever': 'Cantilever (structural)', 'femx.ex.thermal': 'Bar heat transfer (convection)', 'femx.ex.capacitor': 'Plate capacitor (electrostatic)',
  'femx.solver.internal': 'MyCAD built-in solver', 'femx.solver.calculix': 'CalculiX input (.inp)', 'femx.solver.elmer': 'Elmer input (.sif + mesh)', 'femx.solver.mystran': 'MYSTRAN input (.bdf)', 'femx.solver.z88': 'Z88 input files',
  'femx.ax': 'Start X', 'femx.ay': 'Start Y', 'femx.az': 'Start Z', 'femx.bx': 'End X', 'femx.by': 'End Y', 'femx.bz': 'End Z',
  'femx.eps0': 'Vacuum permittivity', 'femx.materialEditor': 'Material editor…', 'femx.material.fluid': 'Fluid material…', 'femx.material.nonlinear': 'Non-linear material…', 'femx.material.reinforced': 'Reinforced concrete material…',
  'femx.mesher.netgen': 'Netgen mesh…', 'femx.mesher.gmsh': 'Gmsh mesh…', 'femx.meshRegion': 'Mesh refinement…', 'femx.meshLayer': 'Boundary layer…', 'femx.meshGroup': 'Mesh group…', 'femx.meshClear': 'Clear FEM mesh',
  'femx.meshInfo': 'Mesh info', 'femx.mesh2mesh': 'FEM mesh to mesh', 'femx.nodesSet': 'Nodes set…', 'femx.nodesByPolygon': 'Node set by polygon', 'femx.elementsByPolygon': 'Element set by polygon', 'femx.eraseElements': 'Erase elements by polygon',
  'femx.fluid1D': 'Fluid section for 1D flow…', 'femx.rotation1D': 'Beam rotation…', 'femx.solverControl': 'Solver job control…', 'femx.pipeline': 'Show results (pipeline)…', 'femx.apply': 'Apply changes to pipeline',
  'femx.filter.branch': 'Pipeline branch', 'femx.functions': 'Filter functions…', 'femx.filter.calculator': 'Calculator filter…', 'femx.filter.clipRegion': 'Region clip filter…', 'femx.filter.clipScalar': 'Scalar clip filter…',
  'femx.filter.contours': 'Contours filter…', 'femx.filter.cutFunction': 'Function cut filter…', 'femx.filter.dataAlongLine': 'Data along line…', 'femx.filter.dataAtPoint': 'Data at point…', 'femx.filter.glyph': 'Glyph filter…',
  'femx.filter.linearizedStresses': 'Stress linearization…', 'femx.filter.warp': 'Warp filter…', 'femx.histogram': 'Histogram…', 'femx.lineplot': 'Line plot…', 'femx.table': 'Table…', 'femx.purge': 'Purge results',
  'femx.clipAdd': 'Clipping plane on face', 'femx.clipRemove': 'Remove all clipping planes', 'femx.examples': 'FEM examples…',
  'femx.op.analysis': 'FEM analysis', 'femx.op.chart': 'Chart', 'femx.op.constraint': 'FEM constraint', 'femx.op.equation': 'Equation', 'femx.op.erase': 'Erase elements', 'femx.op.fluid1D': 'Pipe flow', 'femx.op.function': 'Filter function',
  'femx.op.material': 'FEM material', 'femx.op.mesh': 'FEM mesh', 'femx.op.mesh2mesh': 'FEM mesh to mesh', 'femx.op.pipeline': 'Pipeline', 'femx.op.purge': 'Purge results', 'femx.op.result': 'FEM result', 'femx.op.rotation': 'Beam rotation',
  'femx.op.set': 'Set', 'femx.op.solver': 'Solver', 'femx.op.table': 'Table',
  'femx.pickSolid': 'Select the solid to analyse first', 'femx.face': 'Face (when none is picked in 3D)', 'femx.face2': 'Other face', 'femx.onPicked': 'For the {count} picked faces', 'femx.added': 'Added {name}',
  'femx.equationOn': '{name} on', 'femx.equationOff': '{name} off', 'femx.elementSize': 'Element size', 'femx.meshed': '{nodes} nodes · {elements} elements',
  'femx.layers': 'Layers', 'femx.layerThickness': 'Layer thickness', 'femx.groupName': 'Name', 'femx.groupN': 'Group {n}', 'femx.nodeSet': 'Node set', 'femx.elementSet': 'Element set',
  'femx.erased': 'Erased {count} elements', 'femx.setMade': 'Made a set of {count}', 'femx.resultsGroup': 'FEM results', 'femx.nothingToShow': 'There is nothing to show',
  'femx.range': '{name}: {lo} … {hi}', 'femx.field': 'Result', 'femx.noVectors': 'There are no vector results', 'femx.warpFactor': 'Warp factor', 'femx.threshold': 'Threshold', 'femx.keepAbove': 'Keep what is at or above it',
  'femx.noFunctions': 'There are no filter functions (make one with "Filter functions")', 'femx.function': 'Filter function', 'femx.keepOutside': 'Keep the outside', 'femx.levels': 'Levels', 'femx.glyphScale': 'Arrow length',
  'femx.samples': 'Samples', 'femx.outside': 'Outside the mesh', 'femx.needStresses': 'No stresses (turn the elasticity equation on)', 'femx.membrane': 'Membrane', 'femx.bending': 'Bending', 'femx.total': 'Membrane + bending',
  'femx.linearizedDone': 'Membrane {m} MPa · bending {b} MPa', 'femx.expression': 'Expression', 'femx.fieldsAre': 'Results you can use', 'femx.functionType': 'Kind', 'femx.dirX': 'Direction X', 'femx.dirY': 'Direction Y', 'femx.dirZ': 'Direction Z',
  'femx.radiusSize': 'Radius / size', 'femx.applied': 'Applied {count} filters again', 'femx.bins': 'Bins', 'femx.node': 'Node', 'femx.element': 'Element', 'femx.tableMade': 'Made a table of {count} rows',
  'femx.solver': 'Solver', 'femx.solverIntro': 'Equations: {equations}', 'femx.writeInput': 'Write input', 'femx.run': 'Solve', 'femx.pickLines': 'Select the lines that are the pipes', 'femx.pipeDiameter': 'Pipe diameter',
  'femx.pressureIn': 'Inlet pressure', 'femx.pressureOut': 'Outlet pressure', 'femx.flowDone': 'Flow in the first pipe: {q} L/s', 'femx.beamRotation': 'Section rotation', 'femx.example': 'Example', 'femx.femMesh': 'FEM mesh',
  'femx.branchMade': 'Made a pipeline branch', 'femx.purged': 'Purged the results', 'femx.nodes': 'Nodes', 'femx.elements': 'Elements', 'femx.faces': 'Outer faces',
};

export { KO as FEM_KO, EN as FEM_EN };
