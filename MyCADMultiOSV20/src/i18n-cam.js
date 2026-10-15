// Words of the CAM job commands (src/commands/camjob.js) in Korean and English.
const OPS_KO = {
  profile: '윤곽', pocket: '포켓', drill: '드릴', engrave: '각인', rough3d: '3D 황삭', finish3d: '3D 정삭', adaptive: '적응형 가공', area: '영역 가공', areaWorkplane: '작업 평면 영역 가공',
  millFace: '면 가공', helix: '나선 보링', threadMilling: '나사 밀링', tapping: '탭핑', slot: '슬롯', deburr: '모따기 (버 제거)', vcarve: 'V 조각', shape: '형상 따라 가공', shapeTC: '형상 따라 가공 (공구 지정)',
  probe: '프로빙', custom: '사용자 G 코드', comment: '주석', stop: '정지', array: '작업 배열', compound: '작업 묶음', copy: '고정 사본',
};
const OPS_EN = {
  profile: 'Profile', pocket: 'Pocket', drill: 'Drilling', engrave: 'Engrave', rough3d: '3D roughing', finish3d: '3D finishing', adaptive: 'Adaptive', area: 'Area', areaWorkplane: 'Area (working plane)',
  millFace: 'Face', helix: 'Helix', threadMilling: 'Thread milling', tapping: 'Tapping', slot: 'Slot', deburr: 'Deburr', vcarve: 'V-carve', shape: 'From shape', shapeTC: 'From shape (tool controller)',
  probe: 'Probe', custom: 'Custom G-code', comment: 'Comment', stop: 'Stop', array: 'Array', compound: 'Compound', copy: 'Simple copy',
};
const prefix = (o, p) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}${k}`, v]));

const KO = {
  ...prefix(OPS_KO, 'camjob.op.'),
  'menuGroup.cam': 'CAM (가공)', 'menuGroup.camOps': 'CAM 작업', 'menuGroup.camJob': 'CAM 잡', 'menuGroup.camDressups': 'CAM 드레스업', 'menuGroup.camTools': 'CAM 공구',
  'cam.top': '시작 높이', 'tool.camStart': '시작점', 'prompt.camStart.0': '작업이 시작할 곳을 클릭하세요',
  'camjob.op.add': 'CAM 작업', 'camjob.op.job': 'CAM 잡', 'camjob.op.bag': '속성 묶음', 'camjob.op.controller': '공구 컨트롤러', 'camjob.op.dressup': '드레스업', 'camjob.op.fixture': '고정구',
  'camjob.op.start': '시작점', 'camjob.op.toggle': '작업 켜기/끄기', 'camjob.op.tool': '공구',
  'camjob.simpleCopy': '고정 사본', 'camjob.operationCopy': '작업 복사', 'camjob.toggleActive': '작업 켜기/끄기…', 'camjob.fixture': '고정구 (G54…)…', 'camjob.propertyBag': '속성 묶음…',
  'camjob.inspect': 'G 코드 보기', 'camjob.sanity': '점검 (Sanity)', 'camjob.exportTemplate': '잡 템플릿 내보내기…', 'camjob.post': '잡 G 코드 내보내기…', 'camjob.selectLoop': '루프 고르기 마치기',
  'camjob.startPoint': '시작점 정하기…', 'camjob.toolCreate': '새 공구…', 'camjob.toolDock': '공구 넣기…', 'camjob.toolLibrary': '공구 라이브러리…', 'camjob.toolLoad': '공구 불러오기…',
  'camjob.toolSave': '공구 저장…', 'camjob.toolSaveAs': '공구 다른 이름으로 저장…', 'camjob.controllerNew': '공구 컨트롤러…',
  'camjob.dress.array': '배열', 'camjob.dress.axisMap': '축 매핑 (Y → A)', 'camjob.dress.dogbone': '도그본', 'camjob.dress.dragKnife': '드래그 나이프', 'camjob.dress.leadInOut': '진입/진출',
  'camjob.dress.boundary': '경계', 'camjob.dress.rampEntry': '경사 진입', 'camjob.dress.tag': '홀딩 탭', 'camjob.dress.zCorrect': 'Z 깊이 보정',
  'camjob.f.workplaneZ': '작업 평면 높이', 'camjob.f.extra': '바깥 여유', 'camjob.f.pitch': '피치', 'camjob.f.majorDiameter': '나사 바깥지름 (0: 구멍 크기)', 'camjob.f.extend': '끝 연장',
  'camjob.f.width': '모따기 폭', 'camjob.f.extraDepth': '더 깊이', 'camjob.f.step': '단계 간격', 'camjob.f.maxDepth': '최대 깊이', 'camjob.f.nx': 'X 점 수', 'camjob.f.ny': 'Y 점 수', 'camjob.f.probeDepth': '프로브 깊이',
  'camjob.f.gcode': 'G 코드', 'camjob.f.text': '주석', 'camjob.f.optional': '선택 정지 (M1)', 'camjob.f.mode': '배열 방식', 'camjob.f.dx': 'X 간격', 'camjob.f.dy': 'Y 간격', 'camjob.f.count': '개수',
  'camjob.f.radius': '반지름', 'camjob.f.side': '쪽', 'camjob.f.offset': '날 오프셋', 'camjob.f.filterAngle': '돌림 최소 각도', 'camjob.f.angle': '각도', 'camjob.f.height': '높이',
  'camjob.f.a': '보정 a (상수)', 'camjob.f.b': '보정 b (x 기울기)', 'camjob.f.c': '보정 c (y 기울기)', 'camjob.f.segment': '나누는 길이',
  'camjob.side.left': '왼쪽', 'camjob.side.right': '오른쪽', 'camjob.linear': '직선', 'camjob.polar': '원형',
  'camjob.kind.endmill': '평 엔드밀', 'camjob.kind.ballend': '볼 엔드밀', 'camjob.kind.vbit': 'V 비트', 'camjob.kind.drill': '드릴', 'camjob.kind.chamfer': '모따기 공구', 'camjob.kind.threadmill': '나사 밀', 'camjob.kind.tap': '탭', 'camjob.kind.probe': '프로브',
  'camjob.issue.noOps': '작업이 없습니다', 'camjob.issue.tcNoTool': '공구가 없는 공구 컨트롤러', 'camjob.issue.noSpindle': '주축 회전수가 0', 'camjob.issue.opNoController': '공구 컨트롤러가 없는 작업',
  'camjob.issue.opNoGeometry': '가공할 형상이 없는 작업', 'camjob.issue.tooSmall': '공구보다 작은 윤곽', 'camjob.issue.holeSmaller': '공구보다 작은 구멍', 'camjob.issue.noModel': '3D 작업에 솔리드가 없음',
  'camjob.defaultTool': '6 mm 엔드밀', 'camjob.opName': '이름', 'camjob.controller': '공구 컨트롤러', 'camjob.commentText': '여기서 공작물을 돌려 놓으세요', 'camjob.opAdded': '"{name}" 을(를) 넣었습니다 (경로 {count}개)',
  'camjob.noOps': 'CAM 잡에 작업이 없습니다', 'camjob.operation': '작업', 'camjob.inactive': '꺼짐', 'camjob.copied': '고정', 'camjob.pickBoundary': '경계로 쓸 닫힌 윤곽을 먼저 고르세요',
  'camjob.dressed': '"{name}" 에 {type} 을(를) 더했습니다', 'camjob.bagHint': '이름 = 값 (한 줄에 하나)', 'camjob.program': 'G 코드 ({lines}줄)', 'camjob.sanityFound': '확인할 것이 {count}개 있습니다',
  'camjob.sanityOk': '문제가 없습니다', 'camjob.loopSelected': '{count}개를 골랐습니다', 'camjob.pickEdge': '3D 모서리를 고르거나 2D 선을 선택하세요', 'camjob.startSet': '시작점을 정했습니다',
  'camjob.toolName': '공구 이름', 'camjob.toolKind': '종류', 'camjob.diameter': '지름', 'camjob.toolAngle': '날 각도', 'camjob.flutes': '날 수', 'camjob.toolLength': '길이',
  'camjob.toolAdded': '"{name}" 을(를) 넣었습니다', 'camjob.libraryEmpty': '공구 라이브러리가 비어 있습니다 (새 공구를 먼저 만드세요)', 'camjob.tool': '공구', 'camjob.badTool': '"{name}" 은(는) 공구 파일이 아닙니다', 'camjob.toolNumber': '공구 번호 (T)',
};

const EN = {
  ...prefix(OPS_EN, 'camjob.op.'),
  'menuGroup.cam': 'CAM', 'menuGroup.camOps': 'CAM operations', 'menuGroup.camJob': 'CAM job', 'menuGroup.camDressups': 'CAM dress-ups', 'menuGroup.camTools': 'CAM tools',
  'cam.top': 'Start height', 'tool.camStart': 'Start point', 'prompt.camStart.0': 'Click where the operation should start',
  'camjob.op.add': 'CAM operation', 'camjob.op.job': 'CAM job', 'camjob.op.bag': 'Property bag', 'camjob.op.controller': 'Tool controller', 'camjob.op.dressup': 'Dress-up', 'camjob.op.fixture': 'Fixture',
  'camjob.op.start': 'Start point', 'camjob.op.toggle': 'Toggle operations', 'camjob.op.tool': 'Tool',
  'camjob.simpleCopy': 'Simple copy', 'camjob.operationCopy': 'Copy operation', 'camjob.toggleActive': 'Toggle operations…', 'camjob.fixture': 'Fixtures (G54…)…', 'camjob.propertyBag': 'Property bag…',
  'camjob.inspect': 'Inspect G-code', 'camjob.sanity': 'Sanity check', 'camjob.exportTemplate': 'Export job template…', 'camjob.post': 'Post the job…', 'camjob.selectLoop': 'Finish selecting loop',
  'camjob.startPoint': 'Start point…', 'camjob.toolCreate': 'New tool bit…', 'camjob.toolDock': 'Add tool bit…', 'camjob.toolLibrary': 'Tool bit library…', 'camjob.toolLoad': 'Load tool…',
  'camjob.toolSave': 'Save tool…', 'camjob.toolSaveAs': 'Save tool as…', 'camjob.controllerNew': 'Tool controller…',
  'camjob.dress.array': 'Array', 'camjob.dress.axisMap': 'Axis map (Y → A)', 'camjob.dress.dogbone': 'Dogbone', 'camjob.dress.dragKnife': 'Drag knife', 'camjob.dress.leadInOut': 'Lead in/out',
  'camjob.dress.boundary': 'Boundary', 'camjob.dress.rampEntry': 'Ramp entry', 'camjob.dress.tag': 'Holding tags', 'camjob.dress.zCorrect': 'Z depth correction',
  'camjob.f.workplaneZ': 'Working plane height', 'camjob.f.extra': 'Extra outside', 'camjob.f.pitch': 'Pitch', 'camjob.f.majorDiameter': 'Major diameter (0: the hole)', 'camjob.f.extend': 'End extension',
  'camjob.f.width': 'Chamfer width', 'camjob.f.extraDepth': 'Extra depth', 'camjob.f.step': 'Step', 'camjob.f.maxDepth': 'Max depth', 'camjob.f.nx': 'Points in X', 'camjob.f.ny': 'Points in Y', 'camjob.f.probeDepth': 'Probe depth',
  'camjob.f.gcode': 'G-code', 'camjob.f.text': 'Comment', 'camjob.f.optional': 'Optional stop (M1)', 'camjob.f.mode': 'Array', 'camjob.f.dx': 'X step', 'camjob.f.dy': 'Y step', 'camjob.f.count': 'Count',
  'camjob.f.radius': 'Radius', 'camjob.f.side': 'Side', 'camjob.f.offset': 'Blade offset', 'camjob.f.filterAngle': 'Smallest swivel angle', 'camjob.f.angle': 'Angle', 'camjob.f.height': 'Height',
  'camjob.f.a': 'Correction a (constant)', 'camjob.f.b': 'Correction b (x slope)', 'camjob.f.c': 'Correction c (y slope)', 'camjob.f.segment': 'Segment length',
  'camjob.side.left': 'Left', 'camjob.side.right': 'Right', 'camjob.linear': 'Linear', 'camjob.polar': 'Polar',
  'camjob.kind.endmill': 'End mill', 'camjob.kind.ballend': 'Ball end mill', 'camjob.kind.vbit': 'V-bit', 'camjob.kind.drill': 'Drill', 'camjob.kind.chamfer': 'Chamfer mill', 'camjob.kind.threadmill': 'Thread mill', 'camjob.kind.tap': 'Tap', 'camjob.kind.probe': 'Probe',
  'camjob.issue.noOps': 'There are no operations', 'camjob.issue.tcNoTool': 'A tool controller without its tool', 'camjob.issue.noSpindle': 'Spindle speed is 0', 'camjob.issue.opNoController': 'An operation without a tool controller',
  'camjob.issue.opNoGeometry': 'An operation with nothing to machine', 'camjob.issue.tooSmall': 'An outline smaller than the tool', 'camjob.issue.holeSmaller': 'A hole smaller than the tool', 'camjob.issue.noModel': 'A 3D operation without a solid',
  'camjob.defaultTool': '6 mm end mill', 'camjob.opName': 'Name', 'camjob.controller': 'Tool controller', 'camjob.commentText': 'Turn the workpiece over here', 'camjob.opAdded': 'Added "{name}" ({count} paths)',
  'camjob.noOps': 'The CAM job has no operations', 'camjob.operation': 'Operation', 'camjob.inactive': 'off', 'camjob.copied': 'frozen', 'camjob.pickBoundary': 'Select a closed outline to use as the boundary first',
  'camjob.dressed': 'Added {type} to "{name}"', 'camjob.bagHint': 'name = value (one per line)', 'camjob.program': 'G-code ({lines} lines)', 'camjob.sanityFound': '{count} things to check',
  'camjob.sanityOk': 'No problems found', 'camjob.loopSelected': 'Selected {count}', 'camjob.pickEdge': 'Pick a 3D edge or select a 2D line', 'camjob.startSet': 'Start point set',
  'camjob.toolName': 'Tool name', 'camjob.toolKind': 'Kind', 'camjob.diameter': 'Diameter', 'camjob.toolAngle': 'Cutting angle', 'camjob.flutes': 'Flutes', 'camjob.toolLength': 'Length',
  'camjob.toolAdded': 'Added "{name}"', 'camjob.libraryEmpty': 'The tool bit library is empty (make a new tool bit first)', 'camjob.tool': 'Tool', 'camjob.badTool': '"{name}" is not a tool bit file', 'camjob.toolNumber': 'Tool number (T)',
};

export { KO as CAM_KO, EN as CAM_EN };
