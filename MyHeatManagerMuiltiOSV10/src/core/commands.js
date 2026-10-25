// Every command the app offers: its icon, its name in both languages and a
// tooltip. Menus, the toolbar, the tool panel and the context menu all list
// command ids from here, so a command reads the same wherever it appears.

/** id → [icon, ko, en, tip ko, tip en] */
const C = {
  // File
  new: ['✚', '새 모델', 'New model', '빈 모델을 새 탭에 만듭니다', 'Create an empty model in a new tab'],
  newFromSample: ['🗂', '예제에서 새로 만들기…', 'New from sample…', '예제 모델 갤러리에서 고릅니다', 'Pick a model from the sample gallery'],
  open: ['📂', '열기…', 'Open…', '.myheat 모델 파일을 엽니다', 'Open a .myheat model file'],
  save: ['💾', '저장', 'Save', '모델을 저장합니다', 'Save the model'],
  saveAs: ['📝', '다른 이름으로 저장…', 'Save as…', '모델을 새 파일로 저장합니다', 'Save the model to a new file'],
  exportCsv: ['⊞', 'CSV 내보내기…', 'Export CSV…', '현재 결과 필드를 셀별 CSV로 저장합니다', 'Save the shown result field as per-cell CSV'],
  exportPng: ['🖼', '그림 내보내기 (PNG)…', 'Export image (PNG)…', '뷰포트를 PNG로 저장합니다', 'Save the viewport as PNG'],
  exportVtk: ['⧈', 'VTK 내보내기…', 'Export VTK…', 'ParaView 등에서 여는 VTK 파일로 결과를 저장합니다', 'Save the results as a VTK file for ParaView and others'],
  exportReport: ['📄', '해석 보고서…', 'Study report…', '모델·결과 요약 보고서를 봅니다 (HTML 저장)', 'Show the model and result report (save as HTML)'],
  print: ['🖨️', '인쇄…', 'Print…', '뷰포트와 보고서를 인쇄합니다', 'Print the viewport and the report'],
  closeTab: ['✕', '탭 닫기', 'Close tab', '현재 모델 탭을 닫습니다', 'Close the current model tab'],
  quit: ['⏻', '끝내기', 'Quit', '프로그램을 끝냅니다', 'Quit the program'],
  // Edit
  undo: ['↩', '실행 취소', 'Undo', '마지막 변경을 되돌립니다', 'Undo the last change'],
  redo: ['↪', '다시 실행', 'Redo', '되돌린 변경을 다시 적용합니다', 'Redo the undone change'],
  copy: ['⧉', '복사', 'Copy', '선택한 물체를 복사합니다', 'Copy the selected bodies'],
  paste: ['📋', '붙여넣기', 'Paste', '복사한 물체를 붙여넣습니다', 'Paste the copied bodies'],
  duplicate: ['↦', '복제', 'Duplicate', '선택한 물체를 옆에 복제합니다', 'Duplicate the selected bodies'],
  delete: ['🗑', '삭제', 'Delete', '선택한 항목을 삭제합니다', 'Delete the selected items'],
  selectAll: ['≭', '모두 선택', 'Select all', '모든 물체를 선택합니다', 'Select every body'],
  bringFront: ['⇡', '맨 앞으로', 'Bring to front', '물체를 맨 위(나중에 칠함)로 올립니다 — 겹친 곳은 위 물체의 재료가 됩니다', 'Move the body on top — overlapping cells take the top body\'s material'],
  sendBack: ['⇣', '맨 뒤로', 'Send to back', '물체를 맨 아래로 내립니다', 'Move the body to the bottom'],
  // View
  fit: ['⤢', '화면에 맞춤', 'Fit view', '모델 전체가 보이게 합니다', 'Show the whole model'],
  zoomIn: ['＋', '확대', 'Zoom in', '확대합니다', 'Zoom in'],
  zoomOut: ['－', '축소', 'Zoom out', '축소합니다', 'Zoom out'],
  zoomReset: ['⌖', '원위치', 'Reset view', '모델을 정중앙에 두고 원본 비율(100%)로 봅니다', 'Centre the model at its original scale (100%)'],
  view2d: ['▭', '2D 보기', '2D view', '평면 편집기·결과 보기', 'Plane editor and result view'],
  view3d: ['◇', '3D 보기', '3D view', '3D 모델·결과 보기 (회전: 드래그)', '3D model and result view (drag to rotate)'],
  showGrid: ['▦', '격자', 'Grid', 'mm 눈금 도면 격자를 켜고 끕니다 (확대하면 간격이 촘촘해짐)', 'Turn the millimetre drawing grid on or off (finer as you zoom in)'],
  showAxes: ['⊹', '좌표축', 'Axes', '3D 보기의 x · y · z 좌표축과 눈금을 켜고 끕니다', 'Turn the x, y, z axes and their ticks in the 3D view on or off'],
  showMesh: ['#', '계산 격자', 'Mesh', '해석에 쓰는 계산 셀의 경계를 켜고 끕니다', 'Turn the computational cell boundaries on or off'],
  showRulers: ['📏', '눈금자', 'Rulers', '눈금자를 표시합니다', 'Show the rulers'],
  showLabels: ['🏷', '이름표', 'Labels', '물체·탐침 이름을 표시합니다', 'Show body and probe names'],
  toolPanel: ['◧', '도구 패널', 'Tool panel', '왼쪽 도구·모델 트리 패널', 'Left tool and model tree panel'],
  propertyPanel: ['◨', '속성 패널', 'Property panel', '오른쪽 속성 패널', 'Right property panel'],
  chartPanel: ['📈', '그래프 패널', 'Chart panel', '아래쪽 탐침·단면 그래프 패널', 'Bottom probe and line-cut chart panel'],
  fullscreen: ['⛶', '전체 화면', 'Full screen', '전체 화면으로 전환합니다 (Esc: 해제)', 'Toggle full screen (Esc leaves)'],
  // Geometry
  select: ['⌖', '선택', 'Select', '물체를 선택·이동합니다 (손잡이로 크기 조절)', 'Select and move bodies (handles resize)'],
  rect: ['▭', '사각형', 'Rectangle', '사각형 물체를 그립니다 (3D: 상자)', 'Draw a rectangular body (3D: a box)'],
  circle: ['◯', '원', 'Circle', '원형 물체를 그립니다 (3D: 원기둥)', 'Draw a circular body (3D: a cylinder)'],
  polygon: ['⬠', '다각형', 'Polygon', '점을 찍어 다각형을 그립니다 (더블클릭/Enter: 끝)', 'Click points to draw a polygon (double-click/Enter ends)'],
  probe: ['⊕', '탐침', 'Probe', '온도를 기록할 점을 놓습니다', 'Place a point that records the temperature'],
  domain: ['⬚', '해석 영역·격자…', 'Domain & mesh…', '해석 영역 크기, 차원(2D/3D), 격자 수, 배경 재료', 'Domain size, dimension (2D/3D), cell counts, background material'],
  // Materials
  materials: ['🧱', '재료 라이브러리…', 'Material library…', '재료를 고르고 편집합니다 (금속·세라믹·PCB·유체·PCM·다공성)', 'Pick and edit materials (metals, ceramics, PCB, fluids, PCM, porous)'],
  assignMaterial: ['🎨', '재료 지정', 'Assign material', '선택한 물체에 현재 재료를 지정합니다', 'Give the selected bodies the current material'],
  newMaterial: ['✚', '새 재료', 'New material', '모델에 새 재료를 추가합니다', 'Add a new material to the model'],
  // Loads and boundaries
  heatSource: ['🔥', '열원 (W)', 'Heat source (W)', '선택한 물체의 발열량을 정합니다', 'Set the heat generated in the selected body'],
  bcTemperature: ['🌡', '고정 온도', 'Fixed temperature', '면의 온도를 고정합니다', 'Hold a face at a temperature'],
  bcFlux: ['⇶', '열유속', 'Heat flux', '면으로 들어오는 열유속 (W/m²)', 'Heat flux into a face (W/m²)'],
  bcConvection: ['≋', '대류', 'Convection', '대류 열전달 계수 h 와 유체 온도', 'Convection coefficient h and fluid temperature'],
  bcRadiation: ['☀', '복사', 'Radiation', '방사율과 주위 온도로 복사 열전달', 'Radiation with emissivity and surroundings temperature'],
  bcAdiabatic: ['⊘', '단열', 'Adiabatic', '열이 통하지 않는 면', 'No heat crosses the face'],
  bcInlet: ['⇥', '유입구', 'Inlet', '유체가 들어오는 면 (속도·온도)', 'Fluid enters here (velocity, temperature)'],
  bcOutlet: ['⇤', '유출구', 'Outlet', '유체가 나가는 면', 'Fluid leaves here'],
  bcOpen: ['◌', '개방', 'Opening', '압력 0의 열린 면 (자연 대류)', 'Open face at zero pressure (natural convection)'],
  bcFixed: ['⚓', '구조 고정', 'Fixed support', '열응력 해석의 고정 지지', 'Fixed support for thermal stress'],
  bcThinLayer: ['▤', '박막층', 'Thin layer', '물체 표면의 얇은 층(두께 · 열전도율): 저항형 또는 면내 전도형', 'A thin layer on a body surface (thickness, conductivity): resistive or conductive along the layer'],
  bcContact: ['⫴', '접촉 열저항', 'Contact resistance', '물체와 이웃 재료 사이의 접촉 열저항 (m²K/W)', 'Thermal contact resistance between a body and its neighbours (m²K/W)'],
  bcVoltage: ['⚡', '전압', 'Voltage', '전위를 정합니다 (줄 발열 해석)', 'Hold a face at an electric potential (Joule heating)'],
  bcGround: ['⏚', '접지', 'Ground', '전위 0 V', 'Electric potential 0 V'],
  bcCurrent: ['⇢', '전류 유입', 'Current in', '면으로 들어오는 전체 전류 (A)', 'Total current into the face (A)'],
  bcPressure: ['⤓', '압력 하중', 'Pressure load', '면에 수직으로 누르는 압력 (Pa)', 'Pressure pushing normal to the face (Pa)'],
  bcForce: ['➘', '힘 하중', 'Force load', '면에 나눠 걸리는 힘 (N)', 'A force spread over the face (N)'],
  // Study
  steady: ['⏸', '정상 상태', 'Steady state', '시간에 따라 변하지 않는 평형 온도', 'Equilibrium temperature that no longer changes'],
  transient: ['⏱', '과도 상태', 'Transient', '시간에 따른 온도 변화', 'Temperature over time'],
  toggleFlow: ['🌊', '유동 (CHT)', 'Flow (CHT)', '유체 영역의 유동과 연성 열전달 (2D · 3D)', 'Fluid flow and conjugate heat transfer (2D and 3D)'],
  bcInternalFan: ['🌀', '내부 팬', 'Internal fan', '유동 안에 놓는 팬: 영역(또는 물체)의 한 단면에 팬 곡선의 압력 상승을 줍니다 (Icepak 방식)', 'A fan inside the flow: the pressure rise of its curve across one plane of a region (or body), Icepak-style'],
  toggleNatural: ['♨', '자연 대류', 'Natural convection', '부력(부시네스크)에 의한 유동', 'Buoyancy-driven flow (Boussinesq)'],
  toggleStress: ['⚖', '열응력', 'Thermal stress', '온도 분포에 의한 응력·변형', 'Stress and deformation from the temperature'],
  toggleTurbulence: ['🌀', '난류 (k-ω SST)', 'Turbulence (k-ω SST)', '유동에 k-ω SST 난류 모델을 씁니다', 'Use the k-ω SST turbulence model for the flow'],
  toggleElectric: ['⚡', '줄 발열 (전기)', 'Joule heating (electric)', '전위장을 풀어 전류에 의한 발열을 더합니다', 'Solve the electric potential and add the heat of the current'],
  toggleModal: ['〜', '고유 진동수', 'Natural frequencies', '모드 해석: 고유 진동수와 모드 형상', 'Modal analysis: natural frequencies and mode shapes'],
  parametric: ['📊', '매개변수 연구…', 'Parameter study…', '값 하나를 바꿔 가며 여러 번 풀어 결과를 비교합니다', 'Solve again and again with one value varied and compare the results'],
  autoMesh: ['⊞', '격자 자동 설정', 'Auto mesh', '가장 얇은 물체가 셀 두 개 이상이 되도록 셀 수를 정합니다', 'Choose cell counts so the thinnest body spans at least two cells'],
  solverSettings: ['⚙', '해석 설정…', 'Study settings…', '시간 간격, 종료 시간, 허용 오차, 반복 수', 'Time step, end time, tolerance, iterations'],
  validate: ['✔', '모델 검사', 'Check model', '해석 전에 모델의 문제를 찾습니다', 'Find problems in the model before solving'],
  run: ['▶', '해석 실행', 'Run study', '해석을 실행합니다 (F5)', 'Run the study (F5)'],
  stop: ['■', '중지', 'Stop', '실행 중인 해석을 멈춥니다', 'Stop the running study'],
  // Results
  fieldT: ['🌡', '온도', 'Temperature', '온도 분포', 'Temperature distribution'],
  fieldFlux: ['⇶', '열유속', 'Heat flux', '열유속 크기 |q|', 'Heat flux magnitude |q|'],
  fieldVelocity: ['🌊', '속도', 'Velocity', '유속 크기', 'Flow speed'],
  fieldPressure: ['◍', '압력', 'Pressure', '압력 분포', 'Pressure distribution'],
  fieldStress: ['⚖', '폰 미세스 응력', 'Von Mises stress', '등가 응력', 'Equivalent stress'],
  fieldDisp: ['⇲', '변위', 'Displacement', '열팽창 변위 크기', 'Thermal displacement magnitude'],
  fieldLiquid: ['💧', '액상률', 'Liquid fraction', '상변화 재료의 녹은 비율', 'Molten share of phase-change material'],
  fieldTurbulence: ['🌀', '난류 점성', 'Turbulent viscosity', '와점성 νt', 'Eddy viscosity νt'],
  fieldVoltage: ['⚡', '전위', 'Electric potential', '전위 V', 'Electric potential V'],
  fieldCurrent: ['⇢', '전류 밀도', 'Current density', '|J| (A/m²)', '|J| (A/m²)'],
  fieldMode: ['〜', '모드 형상', 'Mode shape', '고유 진동 모드 (모드 번호는 뷰포트 위에서 고름)', 'Natural vibration mode (pick the mode above the viewport)'],
  fieldComfort: ['🧍', '열 쾌적성 (PMV)', 'Thermal comfort (PMV)', '예상 온열감 PMV (ISO 7730)', 'Predicted mean vote (ISO 7730)'],
  fieldPPD: ['🙁', '불만족률 (PPD)', 'Dissatisfied (PPD)', '불만족할 사람의 비율 PPD % (ISO 7730)', 'Predicted percentage dissatisfied, PPD % (ISO 7730)'],
  streamlines: ['➰', '유선', 'Streamlines', '속도장을 따라가는 선', 'Lines that follow the velocity field'],
  isotherms: ['〰', '등온선', 'Isotherms', '등고선을 그립니다', 'Draw contour lines'],
  vectors: ['➶', '벡터', 'Vectors', '열유속·속도 화살표', 'Heat-flux / velocity arrows'],
  deformed: ['⤨', '변형 형상', 'Deformed shape', '변위를 과장해 보여 줍니다', 'Show the exaggerated displacement'],
  animate: ['⏯', '애니메이션', 'Animate', '과도 결과를 시간 순서로 재생합니다', 'Play the transient frames'],
  lineCut: ['╱', '단면선', 'Line cut', '두 점을 찍어 그 선을 따라 값을 그래프로 봅니다', 'Click two points to plot values along the line'],
  lineCut3d: ['⟋', '3D 단면선…', '3D line cut…', '3D 결과에서 두 점(x, y, z)을 입력해 그 선을 따라 값을 봅니다', 'Type two points (x, y, z) to plot a 3D result along the line between them'],
  probeChart: ['📈', '탐침 그래프', 'Probe chart', '탐침 온도의 시간 변화', 'Probe temperatures over time'],
  calculator: ['🧮', '계산기 · 히스토그램…', 'Calculator · histogram…', '결과 필드로 식을 계산해 새 필드로 보고, 값의 분포(부피 비율)를 히스토그램으로 봅니다 (ParaView 방식)', 'Compute an expression of the result fields as a new field and see the distribution of its values (volume fraction) as a histogram (ParaView-style)'],
  fieldCalc: ['🧮', '계산 필드', 'Calculated field', '계산기에서 만든 필드', 'The field made in the calculator'],
  clearResults: ['⌫', '결과 지우기', 'Clear results', '결과를 지우고 편집으로 돌아갑니다', 'Drop the results and go back to editing'],
  // Reliability (Sherlock-style)
  compactModel: ['🔲', 'JEDEC 2저항 패키지…', 'JEDEC two-resistor package…', 'Rjc · Rjb · 전력으로 칩 패키지를 3층 물체로 만듭니다 (Icepak 콤팩트 모델)', 'Build a chip package from Rjc, Rjb and power as three layered bodies (Icepak compact model)'],
  heatSink: ['▥', '방열판 만들기…', 'Heat sink generator…', '베이스와 판형 핀으로 된 방열판을 만듭니다', 'Build a heat sink from a base and plate fins'],
  pcbStackup: ['🧱', 'PCB 적층 계산기…', 'PCB stack-up calculator…', '구리 · 절연층 적층으로 면내 · 두께 방향 유효 열전도율을 구해 재료로 넣습니다', 'Effective in-plane and through-plane conductivity of a copper / dielectric stack-up, added as a material'],
  powerMap: ['🔥', '발열 지도 가져오기…', 'Import power map…', 'x, y, W 표(CSV)를 작은 열원 물체들로 바꿉니다', 'Turn an x, y, W table (CSV) into small heat-source bodies'],
  solderFatigue: ['🔩', '솔더 피로 · 수명 분석…', 'Solder fatigue and life…', '레인플로 · 마이너 · Engelmaier · Norris–Landzberg · Weibull · Steinberg 진동 피로 (Sherlock 방식)', 'Rainflow, Miner, Engelmaier, Norris–Landzberg, Weibull and Steinberg vibration fatigue (Sherlock-style)'],
  harmonic: ['〰', '조화 응답…', 'Harmonic response…', '고유 진동수 결과로 모드 중첩 주파수 응답을 그립니다', 'Frequency response by modal superposition from a modal result'],
  heatmapCompare: ['🗺', '히트맵 비교 (차이 · 포락선)…', 'Compare heat maps (delta, envelope)…', '여러 절점 데이터의 차이(B − A)나 최댓값 포락선을 그립니다', 'Difference (B − A) or maximum envelope of several node data sets'],
  reliability: ['🛡', '신뢰성 해석…', 'Reliability…', '아레니우스 수명·코핀-맨슨 솔더 피로', 'Arrhenius life and Coffin–Manson solder fatigue'],
  uFactor: ['🏠', 'U-값 (건물 외피)…', 'U-factor (envelope)…', '창호·벽 단면의 열관류율 (THERM 방식)', 'Thermal transmittance of a window/wall section (THERM-style)'],
  // Heat map (HAM-style)
  heatmapImport: ['⇪', '절점 데이터 가져오기…', 'Import node data…', 'Thermal Desktop 등의 절점 온도 CSV로 히트맵을 만듭니다', 'Build a heat map from node temperature CSV (Thermal Desktop and others)'],
  heatmapView: ['🗺', '히트맵', 'Heat map', '가져온 데이터의 히트맵', 'Heat map of the imported data'],
  heatmapStats: ['Σ', '데이터 통계', 'Data statistics', '최소·최대·평균·분위수·한계 초과 절점', 'Min, max, mean, percentiles, nodes over a limit'],
  heatmapExport: ['⇩', '히트맵 내보내기', 'Export heat map', '히트맵을 PNG·CSV로 저장합니다', 'Save the heat map as PNG/CSV'],
  thermalAnalysis: ['🔬', '열분석 (DSC/TGA)…', 'Thermal analysis (DSC/TGA)…', 'DSC·TGA 곡선에서 잠열·녹는점·분해 온도를 구하고 재료를 만듭니다', 'Enthalpy, melting and decomposition temperatures from DSC/TGA curves; make a material'],
  exportCalculix: ['⧉', 'CalculiX 내보내기 (.inp)…', 'Export CalculiX (.inp)…', '격자·재료·경계 조건을 CalculiX 입력 파일로 저장합니다 (FreeCAD·Gmsh·ParaView 워크플로)', 'Save the grid, materials and boundaries as a CalculiX input deck (FreeCAD / Gmsh / ParaView workflow)'],
  exportNastran: ['🛰', 'Nastran 내보내기 (.bdf)…', 'Export Nastran (.bdf)…', 'Simcenter·NX Nastran 정상 열해석(SOL 153) 입력 파일로 저장합니다', 'Save a Simcenter / NX Nastran steady heat (SOL 153) bulk data deck'],
  exportAnsys: ['🅰', 'Ansys 내보내기 (.cdb)…', 'Export Ansys (.cdb)…', 'Ansys Mechanical APDL 입력(.cdb: NBLOCK·EBLOCK·하중)으로 저장합니다', 'Save an Ansys Mechanical APDL input (.cdb: NBLOCK, EBLOCK, loads)'],
  exportComsol: ['🅲', 'COMSOL 메시 내보내기 (.mphtxt)…', 'Export COMSOL mesh (.mphtxt)…', 'COMSOL 텍스트 메시(영역 = 재료, 경계 = 경계 조건)로 저장합니다', 'Save a COMSOL text mesh (domains = materials, boundaries = boundary conditions)'],
  exportGmsh: ['🕸', 'Gmsh 메시 내보내기 (.msh)…', 'Export Gmsh mesh (.msh)…', 'Gmsh MSH 2.2 (재료·경계별 물리 그룹)으로 저장합니다', 'Save a Gmsh MSH 2.2 mesh (physical groups per material and boundary)'],
  exportVtu: ['⧈', 'VTU 내보내기 (ParaView)…', 'Export VTU (ParaView)…', '결과를 VTK XML 비정렬 격자(.vtu)로 저장합니다', 'Save the results as a VTK XML unstructured grid (.vtu)'],
  exportStl: ['🧊', 'STL 내보내기…', 'Export STL…', '물체를 STL 솔리드로 저장합니다 (SOLIDWORKS · FreeCAD · SimScale)', 'Save the bodies as STL solids (SOLIDWORKS, FreeCAD, SimScale)'],
  exportDxf: ['📐', 'DXF 내보내기…', 'Export DXF…', '물체 외곽선을 DXF(R12) 도면으로 저장합니다', 'Save the body outlines as a DXF (R12) drawing'],
  exportTherm: ['🪟', 'THERM 내보내기 (.thmx)…', 'Export THERM (.thmx)…', '2D 단면을 LBNL THERM 형식으로 저장합니다', 'Save the 2D section in the LBNL THERM format'],
  importModel: ['📥', '가져오기 (THERM · Gmsh · 해석기 · IDF)…', 'Import (THERM, Gmsh, decks, IDF)…', 'THERM .thmx · Gmsh .msh · DXF · Nastran .bdf · Ansys .cdb · CalculiX .inp · COMSOL .mphtxt · IDF .emn 파일을 새 모델로 엽니다', 'Open a THERM .thmx, Gmsh .msh, DXF, Nastran .bdf, Ansys .cdb, CalculiX .inp, COMSOL .mphtxt or IDF .emn file as a new model'],
  fileFormats: ['🗂', '지원 파일 형식…', 'Supported file formats…', '열고 저장할 수 있는 파일 형식과 지원하지 않는 형식', 'The file formats that can be opened and saved, and those that cannot'],
  importDxf: ['📐', 'DXF 가져오기…', 'Import DXF…', 'DXF 도면의 닫힌 폴리라인과 원을 물체로 가져옵니다', 'Bring in the closed polylines and circles of a DXF drawing as bodies'],
  batchHelp: ['⌨', '배치 실행 (API)…', 'Batch run (API)…', '명령줄에서 모델을 일괄 실행하는 방법', 'How to run models from the command line'],
  // Context menus
  textCut: ['✂', '잘라내기', 'Cut', '선택한 글자를 잘라냅니다', 'Cut the selected text'],
  textCopy: ['⧉', '복사', 'Copy', '선택한 글자를 복사합니다', 'Copy the selected text'],
  textPaste: ['📋', '붙여넣기', 'Paste', '클립보드의 글자를 붙여넣습니다', 'Paste text from the clipboard'],
  textSelectAll: ['≭', '모두 선택', 'Select all', '칸의 글자를 모두 선택합니다', 'Select all the text in the field'],
  closeOthers: ['⊗', '다른 탭 닫기', 'Close other tabs', '이 탭만 남기고 닫습니다', 'Close every tab but this one'],
  toggleHide: ['◌', '숨기기 / 보이기', 'Hide / show', '선택한 물체를 숨기거나 다시 보입니다 (숨긴 물체는 해석에서 빠짐)', 'Hide or show the selected bodies (hidden bodies are left out of the study)'],
  exportProbesCsv: ['🧾', '탐침 값 CSV 저장…', 'Save probe values (CSV)…', '탐침마다 시간에 따른 값을 CSV 로 저장합니다', 'Save every probe\'s values over time as CSV'],
  exportLineCsv: ['📏', '단면선 값 CSV 저장…', 'Save line values (CSV)…', '단면선을 따라 잰 값을 CSV 로 저장합니다', 'Save the values along the line cut as CSV'],
  exportChart: ['🖼', '그래프 그림 저장…', 'Save chart image…', '아래 그래프를 PNG 로 저장합니다', 'Save the chart below as PNG'],
  // Tools / Help
  settings: ['⚙', '환경 설정…', 'Settings…', '언어·테마·글꼴·단위·색 지도', 'Language, theme, font, units, colour map'],
  home: ['🏠', '시작 화면', 'Start page', '시작 화면을 엽니다 (새로 만들기 · 최근 파일 · 예제 · 튜토리얼)', 'Open the start page (new, recent files, samples, tutorial)'],
  tutorial: ['🎓', '튜토리얼', 'Tutorial', '실제 화면을 따라가며 기능을 하나씩 배웁니다', 'Learn the features one by one on the real screen'],
  tutorialDoc: ['📘', '튜토리얼 문서', 'Tutorial document', '화면 그림이 있는 튜토리얼 문서를 엽니다', 'Open the tutorial document with screenshots'],
  usage: ['📖', '사용 설명서', 'User\'s guide', '사용 설명서를 엽니다', 'Open the user\'s guide'],
  shortcuts: ['⌨', '단축키', 'Keyboard shortcuts', '단축키 목록', 'List of keyboard shortcuts'],
  about: ['ℹ️', '정보', 'About', '프로그램 정보', 'About the program'],
  language: ['⚑', '언어', 'Language', '한국어 / English', 'Korean / English'],
  theme: ['◐', '테마', 'Theme', '색 테마', 'Colour theme'],
  recent: ['🕘', '최근 파일', 'Recent files', '', ''],
  clearRecent: ['✖', '최근 목록 지우기', 'Clear recent list', '최근 파일 목록을 비웁니다', 'Empty the recent file list'],
};

export const COMMAND_IDS = Object.keys(C);

export function commandIcon(id) {
  return C[id]?.[0] ?? '•';
}

export function commandName(id, language) {
  const entry = C[id];
  if (!entry) return id;
  return language === 'en' ? entry[2] : entry[1];
}

export function commandTip(id, language) {
  const entry = C[id];
  if (!entry) return id;
  const tip = language === 'en' ? entry[4] : entry[3];
  return tip ? `${language === 'en' ? entry[2] : entry[1]} — ${tip}` : (language === 'en' ? entry[2] : entry[1]);
}

/** Menu bar: id, icon, ko, en, items (`|` = separator). */
export const MENUS = [
  { id: 'file', icon: '📁', ko: '파일', en: 'File', items: ['new', 'newFromSample', 'open', 'importModel', 'importDxf', '|', 'save', 'saveAs', '|', 'exportCsv', 'exportPng', 'exportVtk', 'exportVtu', '|', 'exportCalculix', 'exportNastran', 'exportAnsys', 'exportComsol', 'exportGmsh', 'exportTherm', 'exportStl', 'exportDxf', 'fileFormats', '|', 'exportReport', 'print', '|', 'closeTab', 'quit'] },
  { id: 'edit', icon: '✎', ko: '편집', en: 'Edit', items: ['undo', 'redo', '|', 'copy', 'paste', 'duplicate', 'delete', 'selectAll', '|', 'bringFront', 'sendBack'] },
  { id: 'view', icon: '👁', ko: '보기', en: 'View', items: ['fit', 'zoomReset', 'zoomIn', 'zoomOut', '|', 'view2d', 'view3d', '|', 'showGrid', 'showMesh', 'showAxes', 'showRulers', 'showLabels', '|', 'toolPanel', 'propertyPanel', 'chartPanel', 'fullscreen'] },
  { id: 'model', icon: '⬚', ko: '모델', en: 'Model', items: ['select', 'rect', 'circle', 'polygon', 'probe', '|', 'domain', 'autoMesh', 'materials', 'assignMaterial', '|', 'heatSource', 'bcTemperature', 'bcFlux', 'bcConvection', 'bcRadiation', 'bcAdiabatic', 'bcContact', 'bcThinLayer', '|', 'bcInlet', 'bcOutlet', 'bcOpen', 'bcInternalFan', '|', 'bcVoltage', 'bcGround', 'bcCurrent', '|', 'bcFixed', 'bcPressure', 'bcForce'] },
  { id: 'simulate', icon: '▶', ko: '해석', en: 'Simulate', items: ['steady', 'transient', '|', 'toggleFlow', 'toggleNatural', 'toggleTurbulence', 'toggleElectric', 'toggleStress', 'toggleModal', '|', 'solverSettings', 'validate', 'parametric', '|', 'run', 'stop'] },
  { id: 'results', icon: '🌡', ko: '결과', en: 'Results', items: ['fieldT', 'fieldFlux', 'fieldVelocity', 'fieldPressure', 'fieldTurbulence', 'fieldStress', 'fieldDisp', 'fieldMode', 'fieldLiquid', 'fieldVoltage', 'fieldCurrent', 'fieldComfort', 'fieldPPD', 'fieldCalc', '|', 'isotherms', 'vectors', 'streamlines', 'deformed', 'animate', '|', 'lineCut', 'lineCut3d', 'probeChart', 'calculator', '|', 'reliability', 'uFactor', 'parametric', 'exportReport', 'clearResults'] },
  { id: 'tools', icon: '🛠', ko: '도구', en: 'Tools', items: ['compactModel', 'heatSink', 'pcbStackup', 'powerMap', '|', 'solderFatigue', 'harmonic', '|', 'heatmapImport', 'heatmapView', 'heatmapStats', 'heatmapExport', 'heatmapCompare', '|', 'thermalAnalysis', '|', 'batchHelp', '|', 'materials', 'settings'] },
  { id: 'help', icon: '❓', ko: '도움말', en: 'Help', items: ['home', 'tutorial', 'tutorialDoc', '|', 'usage', 'shortcuts', '|', 'about'] },
];

/** Workbenches (the selector at the right of the menu bar): the tool panel groups each one shows. */
export const WORKBENCHES = [
  { id: 'geometry', icon: '⬚', ko: '형상', en: 'Geometry', groups: [
    { id: 'draw', icon: '✎', ko: '그리기', en: 'Draw', tools: ['select', 'rect', 'circle', 'polygon', 'probe', 'domain', 'importDxf', 'autoMesh'] },
    { id: 'arrange', icon: '⇅', ko: '정리', en: 'Arrange', tools: ['duplicate', 'delete', 'bringFront', 'sendBack', 'copy', 'paste'] },
  ] },
  { id: 'materials', icon: '🧱', ko: '재료', en: 'Materials', groups: [
    { id: 'library', icon: '🧱', ko: '라이브러리', en: 'Library', tools: ['materials', 'assignMaterial', 'newMaterial', 'thermalAnalysis'] },
  ] },
  { id: 'loads', icon: '🔥', ko: '열원·경계', en: 'Loads & BCs', groups: [
    { id: 'thermal', icon: '🌡', ko: '열 경계', en: 'Thermal', tools: ['heatSource', 'bcTemperature', 'bcFlux', 'bcConvection', 'bcRadiation', 'bcAdiabatic', 'bcContact', 'bcThinLayer'] },
    { id: 'flow', icon: '🌊', ko: '유동 경계', en: 'Flow', tools: ['bcInlet', 'bcOutlet', 'bcOpen', 'bcInternalFan'] },
    { id: 'electric', icon: '⚡', ko: '전기', en: 'Electric', tools: ['bcVoltage', 'bcGround', 'bcCurrent'] },
    { id: 'structure', icon: '⚖', ko: '구조', en: 'Structure', tools: ['bcFixed', 'bcPressure', 'bcForce'] },
  ] },
  { id: 'study', icon: '▶', ko: '해석', en: 'Study', groups: [
    { id: 'type', icon: '⏱', ko: '해석 종류', en: 'Study type', tools: ['steady', 'transient', 'toggleFlow', 'toggleNatural', 'toggleTurbulence', 'toggleElectric', 'toggleStress', 'toggleModal'] },
    { id: 'solve', icon: '▶', ko: '실행', en: 'Solve', tools: ['domain', 'autoMesh', 'solverSettings', 'validate', 'parametric', 'run', 'stop'] },
  ] },
  { id: 'results', icon: '🌡', ko: '결과', en: 'Results', groups: [
    { id: 'fields', icon: '🌡', ko: '필드', en: 'Fields', tools: ['fieldT', 'fieldFlux', 'fieldVelocity', 'fieldPressure', 'fieldTurbulence', 'fieldStress', 'fieldDisp', 'fieldMode', 'fieldLiquid', 'fieldVoltage', 'fieldCurrent', 'fieldComfort', 'fieldPPD', 'fieldCalc'] },
    { id: 'display', icon: '👁', ko: '표시', en: 'Display', tools: ['isotherms', 'vectors', 'streamlines', 'deformed', 'animate', 'lineCut', 'lineCut3d', 'probeChart', 'calculator'] },
    { id: 'output', icon: '⇩', ko: '출력', en: 'Output', tools: ['exportReport', 'exportCsv', 'exportPng', 'exportVtk', 'exportVtu', 'exportCalculix', 'exportNastran', 'exportAnsys', 'exportComsol', 'exportGmsh', 'exportTherm', 'exportStl', 'exportDxf', 'importModel', 'fileFormats', 'clearResults'] },
  ] },
  { id: 'reliability', icon: '🛡', ko: '신뢰성', en: 'Reliability', groups: [
    { id: 'life', icon: '🛡', ko: '수명', en: 'Life', tools: ['reliability', 'solderFatigue', 'harmonic', 'uFactor', 'parametric', 'exportReport'] },
    { id: 'electronics', icon: '🔲', ko: '전자 냉각', en: 'Electronics', tools: ['compactModel', 'heatSink', 'pcbStackup', 'powerMap'] },
  ] },
  { id: 'heatmap', icon: '🗺', ko: '히트맵 (HAM)', en: 'Heat map (HAM)', groups: [
    { id: 'data', icon: '⇪', ko: '데이터', en: 'Data', tools: ['heatmapImport', 'heatmapView', 'heatmapStats', 'heatmapExport', 'heatmapCompare', 'thermalAnalysis', 'batchHelp'] },
  ] },
];

/** Toolbar groups (left part); the right edge has language, theme, settings and about. */
export const TOOLBAR_GROUPS = [
  ['new', 'open', 'save', 'print'],
  ['undo', 'redo'],
  ['select', 'rect', 'circle', 'polygon', 'probe'],
  ['fit', 'view2d', 'view3d', 'showGrid', 'showMesh', 'showAxes', 'showRulers'],
  ['run', 'stop'],
  ['fieldT', 'fieldFlux', 'fieldVelocity', 'fieldStress', 'isotherms', 'vectors', 'streamlines', 'animate'],
  ['parametric'],
];

export const CONTEXT_ITEMS = ['copy', 'paste', 'duplicate', 'delete', '|', 'bringFront', 'sendBack', '|', 'assignMaterial', 'heatSource', 'bcConvection', 'bcTemperature', '|', 'fit'];

/** Right-click menus by what was clicked (every item carries its command icon). */
export const CONTEXT_MENUS = {
  canvas: { icon: '⬚', items: CONTEXT_ITEMS },
  view3d: { icon: '◇', items: ['fit', 'view2d', '|', 'fieldT', 'fieldFlux', 'fieldStress', '|', 'exportPng'] },
  body: { icon: '▣', items: ['duplicate', 'delete', 'toggleHide', '|', 'bringFront', 'sendBack', '|', 'assignMaterial', 'heatSource', 'bcConvection', 'bcTemperature', 'bcFlux', '|', 'copy', 'paste'] },
  bodies: { icon: '▣', items: ['rect', 'circle', 'polygon', '|', 'selectAll', 'paste'] },
  boundary: { icon: '≋', items: ['bcTemperature', 'bcFlux', 'bcConvection', 'bcRadiation', 'bcAdiabatic', '|', 'delete'] },
  boundaries: { icon: '≋', items: ['bcTemperature', 'bcFlux', 'bcConvection', 'bcRadiation', 'bcAdiabatic', 'bcContact', '|', 'bcInlet', 'bcOutlet', 'bcOpen', '|', 'bcVoltage', 'bcGround', '|', 'bcFixed', 'bcPressure', 'bcForce'] },
  probe: { icon: '⊕', items: ['probeChart', '|', 'delete'] },
  probes: { icon: '⊕', items: ['probe', 'probeChart'] },
  material: { icon: '🧱', items: ['assignMaterial', 'materials', '|', 'delete'] },
  materials: { icon: '🧱', items: ['materials', 'newMaterial'] },
  study: { icon: '⚙', items: ['steady', 'transient', '|', 'toggleFlow', 'toggleNatural', 'toggleTurbulence', 'toggleElectric', 'toggleStress', 'toggleModal', '|', 'solverSettings', 'validate', 'parametric', 'run'] },
  domain: { icon: '⬚', items: ['domain', 'showMesh', 'fit'] },
  results: { icon: '🌡', items: ['fieldT', 'fieldFlux', 'fieldVelocity', 'fieldStress', 'fieldMode', '|', 'isotherms', 'vectors', 'streamlines', 'animate', '|', 'parametric', 'exportReport', 'exportCsv', 'clearResults'] },
  tab: { icon: '🗂', items: ['save', 'saveAs', '|', 'closeTab', 'closeOthers', '|', 'new', 'newFromSample'] },
  chart: { icon: '📈', items: ['probeChart', 'lineCut', 'lineCut3d', 'exportChart', 'exportProbesCsv', 'exportLineCsv', '|', 'chartPanel'] },
  text: { icon: '✎', items: ['textCut', 'textCopy', 'textPaste', '|', 'textSelectAll'] },
  general: { icon: '☰', items: ['home', '|', 'toolPanel', 'propertyPanel', 'chartPanel', '|', 'showGrid', 'showMesh', 'showRulers', '|', 'settings', 'about'] },
};

export const SHORTCUTS = {
  new: 'Ctrl+N', open: 'Ctrl+O', save: 'Ctrl+S', saveAs: 'Ctrl+Shift+S', print: 'Ctrl+P', closeTab: 'Ctrl+W',
  undo: 'Ctrl+Z', redo: 'Ctrl+Y', copy: 'Ctrl+C', paste: 'Ctrl+V', duplicate: 'Ctrl+D', delete: 'Delete', selectAll: 'Ctrl+A',
  select: 'V', rect: 'R', circle: 'C', polygon: 'P', probe: 'T', fit: 'F', zoomReset: 'Ctrl+0', zoomIn: '+', zoomOut: '-',
  view2d: '2', view3d: '3', showGrid: 'G', showMesh: 'M', run: 'F5', stop: 'Shift+F5', animate: 'Space', fullscreen: 'F11', usage: 'F1',
};
