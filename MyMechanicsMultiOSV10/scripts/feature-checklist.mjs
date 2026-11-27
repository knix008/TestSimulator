// The feature checklist against the reference mechanical CAD product and OpenSCAD: every function they offer,
// marked done (complete, the reference's options included), partial (there, but with options or behaviour
// missing — `gap` says what), missing, or excluded (decided not to do — `gap` says why).
//
//   node scripts/feature-checklist.mjs              summary per area
//   node scripts/feature-checklist.mjs --open       every partial / missing item with its gap
//   node scripts/feature-checklist.mjs --area sk    one area in full
//
// Keep it current: when an item is finished, set it to 'done' (and name its command / feature in `ref`).

export const AREAS = [
  ['sk', '스케치'],
  ['pf', '부품 피처 (기본)'],
  ['rg', '참조 형상'],
  ['pt', '패턴·대칭'],
  ['sf', '곡면'],
  ['sm', '판금'],
  ['wd', '용접 구조물'],
  ['md', '금형 도구'],
  ['fs', '체결·플라스틱 피처'],
  ['pm', '부품 관리 (수식·컨피그·재질·다중 바디)'],
  ['ev', '평가 도구'],
  ['as', '어셈블리'],
  ['dr', '도면'],
  ['si', '구조 해석'],
  ['fl', '유동 해석'],
  ['pl', '사출 해석'],
  ['el', '전기·라우팅'],
  ['cm', 'CAM'],
  ['dm', '데이터 관리·협업'],
  ['vz', '표시·렌더링'],
  ['io', '파일 입출력'],
  ['au', '자동화·사용자 정의'],
  ['os', 'OpenSCAD'],
];

const D = 'done', P = 'partial', M = 'missing', X = 'excluded';
const i = (area, ko, status, gap = '', ref = '') => ({ area, ko, status, gap, ref });

export const ITEMS = [
  // ── sketch
  i('sk', '선·중심선·사각형(모서리·중심·3점)·평행사변형', D, '', 'sk:line sk:rect sk:centerRect sk:rect3 sk:parallelogram'),
  i('sk', '원(중심·3점)·호(중심·3점·접선)', D, '', 'sk:circle sk:circle3 sk:centerArc sk:arc3 sk:tangentArc'),
  i('sk', '다각형', D, '', 'sk:polygon'),
  i('sk', '슬롯', D, '', 'sk:slot sk:slotCenter sk:slotArc3 sk:slotArcCenter'),
  i('sk', '타원·부분 타원·포물선·원뿔 곡선·수식 곡선', D, '', 'sk:ellipse sk:partialEllipse sk:parabola sk:conic sk:equation'),
  i('sk', '스플라인', D, '', 'sk:spline sk:styleSpline surfaceSpline'),
  i('sk', '점·텍스트', D, '', 'sk:point sk:text'),
  i('sk', '스케치 필렛·모따기', D, '', 'sk:fillet sk:chamfer'),
  i('sk', '자르기·연장·분할·늘이기', D, '', 'sk:trim sk:extend sk:split sk:stretch'),
  i('sk', '요소 오프셋', D, '', 'sk:offset'),
  i('sk', '요소 변환·교차 곡선', D, '', 'sk:convert sk:intersect'),
  i('sk', '실루엣 요소', D, '', 'sk:silhouette sk:silhouetteInternal'),
  i('sk', '대칭·동적 대칭·선형/원형 스케치 패턴', D, '', 'sk:mirror sk:dynamicMirror sk:linPattern sk:cirPattern'),
  i('sk', '이동·복사·회전·축척', D, '', 'sk:move sk:copy sk:rotate sk:scale'),
  i('sk', '블록 만들기·넣기·분해', D, '', 'sk:makeBlock sk:insertBlock sk:explodeBlock'),
  i('sk', '스케치 그림·자동 추적', D, '', 'sk:picture sk:autotrace'),
  i('sk', '구속(일치·수평·수직·평행·직각·접선·동일·동심·중간점·선 위 점·원 위 점·고정·대칭·동일선·동일 반경 동심·병합·동일 곡률·매끄러움)', D, '', 'RELATIONS'),
  i('sk', '치수(거리·수평/수직 거리·각도·반경·지름·호 길이·원 최소/최대·기준선·종속)', D, '', 'sk:dimension sk:baselineDim'),
  i('sk', '완전 정의·과다 정의 표시', D, '', 'sk:fullyDefine'),
  i('sk', '3D 스케치', D, '', 'sketch3d'),
  i('sk', '스케치 진단·수리', D, '', 'sk:repair'),
  i('sk', '레이아웃 스케치(블록 기반 위에서 아래로 설계)', D, '', 'newLayout makePartFromBlock updateLayout'),

  // ── part features
  i('pf', '돌출 보스·컷', D, '', 'extrude (끝 조건 9종·시작 조건 4종·방향 벡터·구배·얇은 피처·선택 윤곽·자르기 방향 반대로)'),
  i('pf', '회전 보스·컷', D, '', 'revolve (블라인드·중간 평면·두 방향·꼭짓점/면까지·면에서 오프셋·얇은 피처·선택 윤곽)'),
  i('pf', '스윕 보스·컷', D, '비틀기, 안내 곡선 하나(크기 법칙)·여러 개(모든 곡선을 지나는 단면 변형), 시작 접선(경로에 수직), 원형 단면, 얇은 피처, 솔리드 스윕(회전체 공구, 축 유지; 수직 평면 경로·직선 경사·수직 진입 정확, 곡선 경사는 직선 분할)', 'sweep'),
  i('pf', '로프트 보스·컷', D, '안내 곡선(여러 개)·중심선·시작/끝 단면 수직·면에 접선·면에 곡률 연속(단면 점마다 옆면 법선·법곡률)·커넥터(시작 꼭짓점·방향)·닫힌 로프트·얇은 피처', 'loft'),
  i('pf', '경계 보스·컷', D, '방향 2 곡선, 시작/끝 조건(단면 수직·면에 접선·면에 곡률)과 영향 길이, 열린 곡선 패치의 면 접선(G1)·곡률(G2)', 'boundary'),
  i('pf', '필렛', D, '모서리마다 반경·현 폭·면/피처 항목·접선 전파·원뿔(rho)·곡률 연속(모든 모서리)·셋백(꼭짓점 블렌드)·피처 유지·넘침 처리(기본/모서리 유지/곡면 유지, 평면 사이 직선 모서리는 커널이 못 할 때도 평면에서 직접)', 'fillet variableFillet faceFillet fullRoundFillet'),
  i('pf', '모따기', D, '', 'chamfer'),
  i('pf', '셸', D, '', 'shell'),
  i('pf', '구배', D, '중립 평면·분할선·단계 구배, 면마다 각도, 반대쪽 면, 곡선 분할선(분할 곡선에서 구배 각의 선직 곡면으로 면 교체)', 'draft'),
  i('pf', '구멍 가공 마법사', D, '', 'hole advancedHole'),
  i('pf', '고급 구멍', D, '', 'advancedHole'),
  i('pf', '나사산(모델 나사산)', D, '', 'thread'),
  i('pf', '외장 나사산(코스메틱)', D, '', 'thread cosmetic'),
  i('pf', '보강대(리브)', D, '', 'rib (직선·호·스플라인, 평행/수직, 한쪽·양쪽·반대쪽 두께, 선형 연장, 구배, 바디에 닿는 곳까지)'),
  i('pf', '돔', D, '', 'dome'),
  i('pf', '감싸기(랩)', D, '양각·음각·스크라이브: 평면·원통(호 길이), 원뿔·스플라인 등 모든 곡면(줄마다 호 길이로 얹음)', 'wrap'),
  i('pf', '두껍게 하기', D, '', 'thicken'),
  i('pf', '나선/와선', D, '', 'helix (일정·테이퍼·가변 피치 표·평면 와선, 왼나사)'),
  i('pf', '바디 이동/복사·축척·분할·결합·삭제/유지', D, '', 'moveBody scaleBody split combine deleteBody'),
  i('pf', '들여쓰기·굽힘(Flex)·변형', D, '들여쓰기, 굽힘·비틀기·테이퍼·늘이기, 변형: 점·곡선에서 곡선·표면 밀기', 'indent flex deform'),
  i('pf', '교차', D, '', 'intersect'),
  i('pf', '바디 저장·부품 삽입', D, '', 'saveBodies insertPart'),
  i('pf', '면 삭제·면 바꾸기·면 이동', D, '', 'deleteFace replaceFace moveFace'),
  i('pf', '자유형(Freeform) 면 변형', D, '조절점 격자를 법선 방향으로 끌어 면 변형(접촉/접선 연속), 정확한 B-스플라인 면 또는 메시', 'freeform'),
  i('pf', '라이브러리 피처', D, '저장·넣기, 넣을 때 크기 매개변수(스케치 치수 변경 후 풀기)·위치(누른 곳/면 중심, X·Y 이동, 면 안 회전)', 'libSave libInsert'),

  // ── reference geometry
  i('rg', '참조 평면', D, '', 'refPlane (오프셋·각도·세 점·점 지나는 평행·곡선에 수직·중간·원통에 접함·선과 점)'),
  i('rg', '참조 축', D, '', 'refAxis'),
  i('rg', '참조 점', D, '', 'refPoint'),
  i('rg', '좌표계', D, '', 'coordSys'),
  i('rg', '질량 중심 점·경계 상자', D, '', 'refPoint boundingBox'),
  i('rg', '메이트 참조', D, '', 'mateReference'),
  i('rg', '곡선: 투영·분할선·복합·XYZ 점 곡선', D, '분할선: 투영·실루엣(원통·구·원뿔 정확, 일반 곡면은 계산한 실루엣)·교차(평면·곡면 바디·면)', 'projectedCurve splitLine compositeCurve curveXYZ'),

  // ── patterns
  i('pt', '선형 패턴', D, '건너뛸 인스턴스, 참조까지, 방향 2 시드만, 형상 패턴 켜기/끄기(끄면 인스턴스마다 다시 만들어 끝 조건 재계산), 스케치 변형(방향 1·2 치수 증가량)', 'linearPattern'),
  i('pt', '원형 패턴', D, '건너뛸 인스턴스, 방향 2(반대쪽), 형상 패턴 켜기/끄기(끄면 인스턴스마다 다시 만듦)', 'circularPattern'),
  i('pt', '대칭 복사', D, '피처/면/바디 대칭, 형상 패턴 켜기/끄기(끄면 대칭 쪽에서 다시 만듦, 호·타원 방향 반전), 바디 대칭 결과 병합/새 바디', 'mirror'),
  i('pt', '곡선·스케치·테이블·채우기·가변 패턴', D, '', 'curvePattern sketchPattern tablePattern fillPattern variablePattern'),

  // ── surfaces
  i('sf', '곡면 돌출·회전·스윕·로프트·평면·오프셋', D, '곡면 스윕·로프트도 솔리드와 같은 안내 곡선(여러 개, 열린 단면 포함)·접선/면 조건·커넥터·비틀기를 쓰고 끝 면 없는 시트로 만듦', 'surfaceExtrude surfaceRevolve surfaceSweep surfaceLoft surfacePlanar surfaceOffset'),
  i('sf', '경계 곡면·채우기 곡면', D, '경계 곡면(방향 2, 끝 조건, 패치 G1/G2), 채우기 곡면(접촉·접선·곡률 연속, 구속 곡선)', 'boundary fillSurface'),
  i('sf', '룰드 곡면·방사 곡면·중간 곡면·곡면 펼치기', D, '', 'ruledSurface radiateSurface midSurface flattenSurface'),
  i('sf', '니트·자르기·트림 해제·연장·구멍 지우기·곡면으로 자르기', D, '', 'knit trimSurface untrimSurface extendSurface deleteHole cutWithSurface'),
  i('sf', '곡면 필렛', D, '두 곡면 바디를 서로 잘라 남길 쪽을 고르고 반지름으로 둥글게 이음', 'surfaceFillet'),
  i('sf', '면 바꾸기·면 삭제(패치)', D, '', 'replaceFace deleteFace'),

  // ── sheet metal
  i('sm', '베이스 플랜지·모서리 플랜지·마이터 플랜지·헴·조그·스케치 굽힘·로프트 굽힘', D, '모서리 플랜지 위치(굽힘 바깥/재질 바깥/재질 안/가상 꼭짓점)·길이 기준(접선/바깥·안쪽 가상 꼭짓점)·폭(양 끝 띄우기)·플랜지 윤곽 편집(꼭짓점 다각형, 전개도 포함)·게이지/굽힘 표', 'baseFlange edgeFlange miterFlange hem jog sketchedBend loftedBend'),
  i('sm', '판금으로 변환·굽힘 삽입·찢기·펼치기/접기·교차 굽힘·용접 모서리·탭과 슬롯', D, '', 'convertSheet insertBends rip unfold fold crossBreak weldedCorner tabSlot'),
  i('sm', '닫힌 모서리·모서리 릴리프·성형 도구·통풍구·전개도', D, '내장 성형 도구(딤플·엠보스·루버·랜스)와 사용자 성형 도구(프로젝트 부품을 펀치로, 정지 면·뚫을 면)', 'closedCorner cornerRelief formTool flatten vent'),
  i('sm', '판금 게이지 표·굽힘 표(굽힘 여유/공제)', D, '강판·아연도·스테인리스·알루미늄·미터 게이지 표와 사용자 표(두께·반경·K), 굽힘 계산: K-계수·r/t별 K 표·DIN 6935·굽힘 여유 표·굽힘 공제 표(각도·반경 보간)', 'baseFlange convertSheet'),
  i('sm', '판금 전개도 내보내기(DXF, 굽힘선 층)', D, '부품에서 바로 전개도 DXF/DWG: 외곽·구멍(OUTLINE), 굽힘선(BEND_UP/BEND_DOWN), 굽힘마다 각도·반경·여유 메모(BEND_NOTES); 도면 전개도 뷰·DXF도 있음', 'exportFlatDxf exportFlatDwg flatPatternView'),
  i('sm', '구멍·컷이 굽힘을 가로지르는 법선 컷', D, '돌출 컷의 "법선 컷": 들어오는 쪽 판 면(평면·굽힘 원통)에 놓인 단면을 판 두께만큼 면 법선(굽힘은 반지름) 방향으로 잘라냄', 'extrude'),

  // ── weldments
  i('wd', '구조 부재(표준 단면)', D, '내장 단면 + 스케치 사용자 단면(라이브러리 저장·삽입으로 재사용), 코너 처리(겹침·마이터·끝 맞춤 1/2)', 'structural'),
  i('wd', '자르기/연장·끝 막기·거싯·용접 비드', D, '', 'trimExtend endCap gusset weldBead'),
  i('wd', '절단 목록(cut list) 표·속성', D, '절단 목록 창과 도면 절단 목록 표, 부재마다 절단 길이·양 끝 절단 각', 'cutList cutListTable'),
  i('wd', '용접 기호·용접 표(도면)', D, '용접 기호, 용접 표(도면 기호 + 부품 용접 비드·어셈블리 용접: 크기·길이·수량·용착량)', 'drwWeld weldTable'),

  // ── mold
  i('md', '분할선·차단 곡면·분할 곡면·금형 분할·코어/캐비티', D, '', 'partingLine shutOff partingSurface toolingSplit cavity'),
  i('md', '언더컷 분석·구배 분석·수축', D, '', 'eval_undercut draftAnalysis shrink'),
  i('md', '코어(사이드 코어/리프터) 추출', D, '스케치 윤곽 돌출(관통/깊이·구배)로 코어·캐비티에서 사이드 코어 바디를 떼어 냄', 'sideCore'),

  // ── fastening / plastics features
  i('fs', '마운팅 보스·스냅 훅·스냅 훅 홈·통풍구·립/홈', D, '', 'mountingBoss snapHook snapHookGroove vent lipGroove'),

  // ── part management
  i('pm', '수식·전역 변수·컨피규레이션·디자인 테이블', D, '', 'equations configurations designTable'),
  i('pm', '재질·질량 특성', D, '', 'material massProps'),
  i('pm', '사용자 정의 속성', D, '', 'customProps'),
  i('pm', '다중 바디 관리(바디 폴더·결과 병합)', D, '', 'combine deleteBody'),
  i('pm', '롤백·억제·피처 재정렬', D, '', 'rollbackHere suppress newFolder'),
  i('pm', '외관(색·질감·데칼)', D, '', 'appearance decals'),
  i('pm', '파생 부품(대칭 부품·부품 삽입)', D, '', 'insertPart mirrorPart'),
  i('pm', '형상 단순화(Defeature)', D, '', 'defeature'),

  // ── evaluate
  i('ev', '측정·질량 특성·간섭·곡률·얼룩말·두께·구배·언더컷·대칭·편차·형상 검사·비교', D, '', 'measure massProps interference curvature zebraStripes thicknessAnalysis draftAnalysis eval_undercut eval_symmetry eval_deviation eval_geometry eval_compare'),
  i('ev', '원가·지속 가능성', D, '', 'eval_costing eval_sustain'),
  i('ev', '설계 검사기', D, '', 'designCheck'),
  i('ev', '단면 특성(단면의 면적·관성)', D, '', 'sectionProperties'),

  // ── assembly
  i('as', '표준 메이트(일치·동심·거리·평행·직각·각도·잠금)', D, '', 'mate'),
  i('as', '고급 메이트(폭·대칭·거리/각도 제한·선형 커플러·윤곽 중심·경로)', D, '', 'mate'),
  i('as', '기계 메이트(기어·랙피니언·나사·힌지·캠·슬롯·유니버설 조인트)', D, '', 'mate'),
  i('as', '스마트 메이트·메이트 참조로 자동 메이트', D, '', 'smartMate mateReference'),
  i('as', '자석 메이트(연결점 스냅)', D, '', 'connectionPoint magneticSnap (연결점 피처·스냅 거리·마주 봄·축 회전 자유)'),
  i('as', '부품 이동·회전(자유도 안에서 끌기)', D, '', 'moveComponent rotateComponent'),
  i('as', '부품 패턴(선형·원형·피처·스케치·곡선·체인)·대칭', D, '', 'linearComponentPattern circularComponentPattern featureDrivenComponentPattern sketchDrivenComponentPattern curveDrivenComponentPattern chainComponentPattern mirrorComponents'),
  i('as', '서브 어셈블리', D, '', 'sub-assembly flexibleComponent (상위에서 내부 자유도 풀이·모션 구동)'),
  i('as', '어셈블리 컨피규레이션', D, '', 'configurations (부품 억제·숨김·인스턴스별 부품 컨피규레이션·메이트 사용/값)'),
  i('as', '간섭 검사·구멍 정렬·여유 검사', D, '', 'interference holeAlignment clearanceCheck (최소 여유·선택 대 나머지·닿음 제외)'),
  i('as', '분해도', D, '', 'explode explodeEditor explodeAnimate (일반·회전·방사형 단계, 분해 선, 분해/조립 애니메이션, 자동 분해)'),
  i('as', '모션 스터디(애니메이션·기본 모션·모션 해석)', D, '', 'motion: 모터·키프레임 애니메이션·강체 동역학(질량·관성·중력·스프링·감쇠·접촉·반발), 반력·모터 토크·변위·속도·가속도 그래프'),
  i('as', '어셈블리 피처(컷·구멍)·용접 비드', D, '', 'asmCut asmHole asmWeldBead (모서리-면 필렛 비드, 직선·원, 용접 목록)'),
  i('as', '부품 교체·메이트 포함 복사·엔벨로프', D, '', 'replaceComponent copyWithMates envelopeComponent'),
  i('as', '대형 어셈블리 모드·경량 부품·단순화 표현', D, '', 'largeAssemblyMode simplifyOuter simplifyBox simplifyFull'),
  i('as', '벨트/체인', D, '', 'beltChain'),
  i('as', '표준 부품 라이브러리·스마트 패스너', D, '', 'stdLibrary smartFastener'),
  i('as', '위에서 아래로 설계(어셈블리 안에서 부품 편집, 외부 참조)', D, '', 'editInContext newPartInContext exitInContext updateExternalRefs externalRefs (잠금·끊기)'),
  i('as', '어셈블리 시각화(질량·부피별 색 정렬)', D, '', 'assemblyVisualization (질량·부피·면적·밀도·개수, 색 척도, 정렬)'),

  // ── drawings
  i('dr', '표준 3면도·모델 뷰·투상 뷰·보조 뷰', D, '', 'std3View addView auxView'),
  i('dr', '단면·정렬 단면·상세·끊기·자르기·부분 단면', D, '', 'sectionView alignedSection detailView breakView cropView brokenOutSection'),
  i('dr', '제거 단면·상대 뷰·3D 도면 뷰', D, '', 'removedSection relativeView view3dDrawing'),
  i('dr', '전개도 뷰·대체 위치 뷰', D, '', 'flatPatternView alternatePositionView'),
  i('dr', '스마트 치수·모델 항목·자동 치수', D, '세로좌표·기준선(층층이 쌓임)·체인(한 줄 연결) 묶음 치수, 모따기·호 길이 치수 모두 있음', 'drwSmartDim drwModelItems autoDims'),
  i('dr', '주석: 노트·풍선·GD&T·데이텀·표면 거칠기·중심 표시·구름·데이텀 대상·해치', D, '', 'ann:note ann:balloon ann:gdt ann:datum ann:surface ann:centermark ann:cloud ann:datumTarget ann:hatch'),
  i('dr', '중심선·구멍 설명(hole callout)·자동 풍선', D, '', 'drwCenterMarks drwHoleCallout drwAutoBalloon'),
  i('dr', '표: BOM·구멍 표·개정 표·굽힘 표·일반 표', D, '', 'bom holeTable revisionTable bendTable drwTable'),
  i('dr', '용접 표·절단 목록 표', D, '', 'weldTable cutListTable'),
  i('dr', '시트·시트 형식·표제란·층', D, '', 'addSheet drwSheetFormat drwTitleBlock drwLayers'),
  i('dr', '도면 내보내기(DXF·DWG·SVG·PDF·인쇄)', D, '', 'exportDxf exportDwg exportSvg print'),

  // ── structural simulation
  i('si', '정적 해석(사면체 2차 요소)', D, '', 'simulation'),
  i('si', '셸 요소(판금·얇은 부품)', D, '중간면(벽 한쪽 면 → 두께/2 안쪽, 두께 자동 측정) + DKT·CST 삼각형 셸, 최장변 세분, 고정·하중 이전, 정적 해석'),
  i('si', '빔 요소(용접 구조물)', D, '3D 오일러-베르누이 골조(6자유도 접합점), 단면 성질(Bredt·Σbt³/3), 부재 분할·면 접합 강체 연결, 지지·하중·자중, 응력 색·변형·반력·CSV, fem/beam.js·단위(해석해)·E2E', 'frameStudy'),
  i('si', '커넥터(볼트·핀·스프링·베어링·강체·스폿 용접·모서리 용접)', D, '볼트(생크 강성·예하중·축력/전단 출력)·스프링·핀·강체·스폿 용접·베어링, 면 평균 이동/회전 결속, fem/connectors.js·단위·E2E (모서리 용접은 용접 비드 형상+결합 접촉으로)'),
  i('si', '접촉(결합·접촉·마찰)', D, '결합·마찰 없는/쿨롱 마찰 접촉(증강 라그랑주, 모르타르), 강체 벽 마찰, 억지 끼워 맞춤(초기 겹침만으로 하중, 2차 면 곡면 투영으로 Lamé 2.4 % 안), fem-loads-more 시험'),
  i('si', '하중(힘·압력·토크·중력)', D, '힘·압력·토크·중력 + 베어링(cos 분포, 합력 정확)·원격 하중/모멘트(강체 연결 분포, 정확)·원격/분포 질량·원심력(ω·α)·강제 변위·온도(열응력) 하중, fem-loads-more 단위·E2E'),
  i('si', '구속(고정·롤러/대칭·탄성 지지)', D, '고정·롤러/대칭·탄성 지지 + 고정 힌지·원통면(반경/원주/축)·강제 변위·순환 대칭(섹터 각도 회전 결속), 원통 축은 CAD 면 삼각형으로 맞춤'),
  i('si', '메쉬 제어·품질', D, '면 국부 세분화, h 적응(ZZ), p 적응(1→2차·에너지 변화, 이후 hp), 혼합 메쉬(솔리드+셸+빔, RBE2 결속; 어셈블리 해석)'),
  i('si', '모드·좌굴·열·피로·동적(조화·과도·랜덤)·낙하·비선형·하중 조합', D, '', 'simulation dynamicStudy dropTest nonlinearStudy loadCombination'),
  i('si', '위상 최적화·설계 스터디', D, '', 'topologyStudy designStudy'),
  i('si', '응력 선형화(압력 용기)', D, '', 'simulation'),
  i('si', '하위 모델링(submodeling)', D, '절단 경계 변위법: P1 중심 영역을 잘라 촘촘히, 하중·고정 이전, 절단면 응력 일치 검사'),
  i('si', '해석 보고서', D, '', 'simulation'),

  // ── flow
  i('fl', '내부·외부 유동(격자 볼츠만, 국부 블록 세분화)', D, '난류 LES·혼합 길이 RANS·층류, 비뉴턴(멱법칙·Carreau), 다공성(Darcy–Forchheimer), 압축성(오일러 HLL/MUSCL, 충격파); 해상도는 브라우저 계산 한도', 'flowStudy'),
  i('fl', '열 전달·복사·전자 부품 냉각·회전 영역·자유 표면', D, '', 'flowStudy electronicsCooling freeSurface'),
  i('fl', '입자 추적·유선 애니메이션', D, '유선·경로선, 입자 연구(Schiller–Naumann 항력·중력·부력, 벽 반발, Finnie 침식, 궤적·충돌·침식 위치·운명)'),
  i('fl', '목표(goals)·매개변수 스터디', D, '전역·면·영역 목표, 목표 수렴(창 평균) 판정과 목표 기준 정지, 입구 속도·온도·회전 속도·전역 변수 매개변수 스윕(표·그래프·CSV), cfd/goals.js·단위·E2E'),

  // ── plastics
  i('pl', '충전·압력·온도·웰드 라인·에어 트랩·싱크·냉각·섬유 배향·휨·게이트 제안·보고서', D, '', 'plasticsStudy'),
  i('pl', '러너·다중 캐비티·패밀리 금형', D, '원형 러너(하겐–푸아죄유)+캐비티 한 그래프 충전, 2열 배치, 패밀리 부품, 불균형·스크랩, 분기 지름 자동 균형'),
  i('pl', '보압(packing) 단계·가스 보조·인서트 성형', D, '보압(Tait 압축성, 게이트 고화까지), 가스 보조(쇼트·두께 우선 침투·코어/스킨·블로스루·미성형), 인서트(면별 벽 온도)'),

  // ── electrical / routing
  i('el', '배관·튜브·케이블·하니스 경로·하니스 도면·회로도', D, '', 'pipeRoute tubeRoute cableRoute harnessRoute harnessDrawing schematic'),
  i('el', '라우팅 부품 라이브러리(엘보·티·플랜지·커넥터, 연결점)', D, '내장 피팅 + 사용자 라우팅 부품(연결점에 배관 종류·규격·CPoint/RPoint), 어셈블리 경로가 연결점에서 시작·끝(규격·방향 직관)·경로점 경유'),
  i('el', '배관 스풀·배관 도면(ISO 배관도)', D, '현장 용접·최대 길이로 스풀 분할, 공장 용접·정척 이음·무게, 등각 ISO(피팅·FW·치수·EL·북쪽), 스풀·BOM·용접 표, 경로 연동', 'pipeIso'),
  i('el', 'PCB 연동(보드 외곽·부품 배치 가져오기, IDF/ProStep)', D, 'IDF 2.0·3.0 가져오기(보드 외곽·호·컷아웃·구멍·두께, 패키지 외곽·높이, 윗/아랫면 배치·회전·장착 높이, mm·THOU)와 IDF 3.0 내보내기(.emn·.emp), cad/idf.js·idf-export.js, idf 단위·E2E 시험', 'importIdf exportIdf'),

  // ── CAM
  i('cm', '밀링 2.5축(페이스·포켓·적응형·윤곽·슬롯·나선·스폿·드릴·펙·탭)', D, '', 'camFacing camPocket camAdaptive camContour camSlot camHelix camSpot camDrill camPeck camTap'),
  i('cm', '밀링 3축(Z 레벨·평행·스캘럽·워터라인)', D, '', 'camZLevel camParallel camScallop camWaterline'),
  i('cm', '선반(페이스·황삭·정삭·보링·홈·나사)', D, '', 'camTurnFace camTurnRough camTurnFinish camTurnBore camTurnGroove camTurnThread'),
  i('cm', '피처 인식·가공 계획·시뮬레이션·포스트·셋업 시트', D, '', 'camRecognize camPlan camSimulate camPost camSetupSheet'),
  i('cm', '4·5축 동시 가공·밀턴', D, '4축 회전 정삭(A), 5축 동시 정삭(법선·리드·최대 기울기, G43.4 A/C), 밀턴 정면·측면 드릴(C축 G83/G87); 소재 시뮬레이션: 4축은 A축 따라 기울어진 공구로 삼중 덱셀을 사방에서 깎고, 밀턴은 선반 단면을 3D 덱셀로 옮겨 라이브 공구 구멍을 뚫음(과삭 검사·전체 소재 표시 포함)', 'camRotary4 camMulti5 camMillTurnAxial camMillTurnRadial'),
  i('cm', '공구 경로 편집(링크·진입/후퇴 수정)', D, '작업별 편집 층(다시 생성해도 유지): 호/직선 진입·후퇴, 링크(여유·최소·머무름), 가까운 순서, 반전, 이송 배율, 창 자르기, 패스별 삭제·반전·이송, cam-edit.js·단위·E2E'),

  // ── data management
  i('dm', '보관소(체크인·체크아웃·버전·사용처·Pack and Go)', D, '', 'vaultExplorer vaultCheckIn vaultCheckOut whereUsed vaultPackAndGo versionHistory'),
  i('dm', '수명 주기 상태·승인 워크플로·변경 요청', D, '작업 중→승인 대기→릴리스→폐기 전이(역할·4-eyes·데이터 카드·참조 릴리스 조건), ECR→ECO(복수 승인자), 리비전 규칙, 내 처리 대기 목록, vault 시험'),
  i('dm', '마크업·리뷰', D, '', 'markup markupReport'),
  i('dm', '검사 보고서(풍선·표·CMM 결과 가져오기)', D, '', 'inspBalloon inspTable inspImport inspReport'),
  i('dm', '기술 일러스트레이션(분해 장면·애니메이션)', D, '', 'illustration'),
  i('dm', '작업 스케줄러', D, '', 'taskScheduler'),
  i('dm', '여러 사람 동시 작업(클라우드 공유)', D, '공유/클라우드 동기화 폴더 보관소(로그인·파일/색인 잠금), 주기 감시로 남의 작업 알림·활동 피드·체크아웃 현황·파일/변경 토론, pdm-team E2E'),

  // ── visualization
  i('vz', '표시 스타일·단면 보기·투시도·보기 방향', D, '', 'styleMenu section perspective viewsMenu'),
  i('vz', '렌더링(경로 추적)', D, '', 'renderView'),
  i('vz', '조명·배경·장면', D, '주변광·카메라 조명·방향/점/스포트 조명·햇빛(위도·경도·날짜·시각·시간대·북쪽, NOAA 태양 위치)·렌더 환경', 'lights'),
  i('vz', '카메라·워크스루·애니메이션 영상 저장', D, '워크스루(1인칭 걷기·중력·충돌·달리기·비행), 영상 녹화 MP4/WebM(턴테이블·모션 스터디·실시간 화면, fps·720p/1080p), app-walk.js·walk-video E2E·walk 단위 시험'),
  i('vz', 'MBD(3D PMI·모델 주석)', D, '', 'mbdAnnotations mbdAutoDimension insertModelAnnotations'),
  i('vz', '3D PDF', X, '사용자 결정으로 범위에서 뺌(U3D/PRC 작성기 필요)'),

  // ── file I/O
  i('io', 'STEP·IGES 읽기/쓰기', D, '', 'importStep exportStep exportIges'),
  i('io', 'Parasolid(x_t/x_b) 읽기/쓰기', D, '형식 문서의 수식으로 검증·왕복 일치; 독립 리더 parasolid-kit(상용 CAD 파일에서 얻은 스키마 프로필)가 예제 12종의 x_t·x_b 를 완전·유효 위상·진단 0 으로 읽음(npm run verify:xt)', 'exportXt exportXb'),
  i('io', 'DXF·DWG 읽기/쓰기', D, 'DWG 읽기·저장 R2000·R2004·R2007·R2010·R2013·R2018(설정에서 선택, 기본 R2004); R2007은 리드-솔로몬·CRC-64 컨테이너(AutoCAD 파일로 알고리즘 확인); 저장 파일은 모든 객체가 끝 비트까지 정확히 읽히고 LibreDWG가 엶(npm run verify:dwg)', 'exportDxf exportDwg'),
  i('io', '메시(STL·OBJ·PLY·glTF/GLB·3MF·VRML·USDZ)', D, '', 'exportMesh:glb exportStl'),
  i('io', '다른 CAD 고유 형식 직접 열기', X, '공개되지 않은 고유 형식은 구현하지 않음(사용자 결정 2026-11-25); 중립 형식(STEP·IGES·Parasolid·DXF/DWG·STL·3MF·OBJ·IDF)으로 교환'),
  i('io', '스캔 데이터(메시)를 솔리드로', D, '평면·원통·구 영역 분할·최소제곱 맞춤, 정점 스냅(교선·교점), 한 바퀴 원통은 정확한 원통면(구멍 빼기·보스 더하기), 새 부품으로', 'scanToSolid'),
  i('io', '가져온 형상 피처 인식', D, '2.5D 각기둥: 축 방향 단 → 기준 평면·스케치(정확한 직선·원호)·보스 돌출, 원통 구멍 → 자르기, 부피 검증 후 트리 교체(가져오기 억제); CAM 피처 인식 별도', 'recognizeFeatures'),
  i('io', 'PDF·이미지 내보내기', D, '', 'exportImage print'),

  // ── automation
  i('au', '매크로 녹화·실행·편집·API', D, '', 'macroRecord macroRun macroEditor'),
  i('au', '사용자 정의(단축키·도구 모음·메뉴·마우스 제스처)', D, '도구 › 사용자 정의: 단축키 녹화·바꾸기·끄기, 내 도구 탭·도구 모음 묶음·탭 숨기기, 8방향 오른쪽 끌기 제스처(안내 원), app-custom.js·customize E2E', 'shortcuts customize'),
  i('au', '설계 라이브러리·템플릿', D, '라이브러리 피처 + 부품·어셈블리·도면 템플릿(저장·새로 만들기·기본 템플릿·내보내기/가져오기 .mymechtpl)', 'libSave templates'),

  // ── OpenSCAD
  i('os', '언어 전체(모듈·함수·let·each·리스트 컴프리헨션·assert·echo·include/use)', D, '', 'openscad'),
  i('os', '기본 도형·변환·불리언·hull·minkowski·offset·projection·돌출·surface·import·text·resize·color·render', D, '', 'openscad'),
  i('os', '내장 함수(수학·문자열·search·lookup·rands·norm·cross·object·textmetrics·fontmetrics 등)', D, '', 'openscad'),
  i('os', 'roof()', D, '', 'openscad'),
  i('os', 'Customizer(매개변수 화면·저장 세트)', D, '', 'openscad'),
  i('os', '애니메이션($t, FPS·단계, 프레임 내보내기)', D, '', 'scadAnimPlay'),
  i('os', '내보내기(STL·OFF·AMF·3MF·DXF·SVG·CSG·PDF)', D, '', 'scadExport'),
  i('os', '편집기(구문 강조·자동 완성·오류 위치·콘솔)', D, '', 'openscad'),
];

// ── CLI
const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`;
if (isMain) {
  const args = process.argv.slice(2);
  const only = args.includes('--area') ? args[args.indexOf('--area') + 1] : null;
  const open = args.includes('--open');
  const label = { [D]: '완료', [P]: '부분', [M]: '없음', [X]: '제외' };
  const total = { [D]: 0, [P]: 0, [M]: 0, [X]: 0 };
  for (const [id, name] of AREAS) {
    if (only && id !== only) continue;
    const list = ITEMS.filter((x) => x.area === id);
    const n = { [D]: 0, [P]: 0, [M]: 0, [X]: 0 };
    for (const x of list) { n[x.status]++; total[x.status]++; }
    console.log(`${name.padEnd(28)} 완료 ${String(n[D]).padStart(3)}  부분 ${String(n[P]).padStart(3)}  없음 ${String(n[M]).padStart(3)}  제외 ${String(n[X]).padStart(2)}`);
    if (open || only) for (const x of list) if (only || x.status === P || x.status === M) console.log(`   [${label[x.status]}] ${x.ko}${x.gap ? ` — ${x.gap}` : ''}`);
  }
  console.log(`${'합계'.padEnd(28)} 완료 ${String(total[D]).padStart(3)}  부분 ${String(total[P]).padStart(3)}  없음 ${String(total[M]).padStart(3)}  제외 ${String(total[X]).padStart(2)}  (항목 ${ITEMS.length})`);
}
