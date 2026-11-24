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
  i('sk', '슬롯', P, '직선 슬롯만 있음. 3점 호 슬롯, 중심점 호 슬롯, 중심점 직선 슬롯이 없음', 'sk:slot'),
  i('sk', '타원·부분 타원·포물선·원뿔 곡선·수식 곡선', D, '', 'sk:ellipse sk:partialEllipse sk:parabola sk:conic sk:equation'),
  i('sk', '스플라인', P, '점 보간 스플라인만 있음. 접선·곡률 핸들 편집, 스타일 스플라인(베지어 제어 다각형), 곡면 위 스플라인, 곡률 콤 표시가 없음', 'sk:spline'),
  i('sk', '점·텍스트', D, '', 'sk:point sk:text'),
  i('sk', '스케치 필렛·모따기', P, '모따기에 각도-거리, 거리-거리(비대칭) 옵션이 없음', 'sk:fillet sk:chamfer'),
  i('sk', '자르기·연장·분할·늘이기', D, '', 'sk:trim sk:extend sk:split sk:stretch'),
  i('sk', '요소 오프셋', P, '양방향, 끝 막기(호·선), 체인 선택, 구성선으로 원본 바꾸기 옵션 확인·보강 필요', 'sk:offset'),
  i('sk', '요소 변환·교차 곡선', D, '', 'sk:convert sk:intersect'),
  i('sk', '실루엣 요소', M, '모델의 실루엣 가장자리를 스케치로 투영하는 도구가 없음'),
  i('sk', '대칭·동적 대칭·선형/원형 스케치 패턴', P, '동적 대칭(그리면서 대칭)이 없음', 'sk:mirror sk:linPattern sk:cirPattern'),
  i('sk', '이동·복사·회전·축척', D, '', 'sk:move sk:copy sk:rotate sk:scale'),
  i('sk', '블록 만들기·넣기·분해', D, '', 'sk:makeBlock sk:insertBlock sk:explodeBlock'),
  i('sk', '스케치 그림·자동 추적', P, '그림 넣기는 있음. 그림 윤곽을 스케치로 자동 추적하는 기능이 없음', 'sk:picture'),
  i('sk', '구속(일치·수평·수직·평행·직각·접선·동일·동심·중간점·선 위 점·원 위 점·고정·대칭·동일선)', P, '동일 곡률, 동일 반경 호, 병합, 관통(pierce), 수평/수직 점 정렬, 매끄러움(G2), 스플라인 접선 구속이 없음', 'RELATIONS'),
  i('sk', '치수(거리·각도·반경·지름)', P, '호 길이, 수평/수직 거리, 원 간 최소/최대 거리, 기준선 치수, 종속(참조) 치수 구분이 부족함'),
  i('sk', '완전 정의·과다 정의 표시', P, '완전 정의 도구는 있음. 과다 정의·풀 수 없음 진단(충돌 구속 목록) 확인 필요', 'sk:fullyDefine'),
  i('sk', '3D 스케치', P, '점·선·스플라인만. 3D 스케치 평면 전환, 3D 구속(축에 평행 등), 3D 치수가 없음', 'sketch3d'),
  i('sk', '스케치 진단·수리', M, '열린 윤곽·겹친 선·작은 틈을 찾아 고치는 스케치 수리가 없음'),
  i('sk', '레이아웃 스케치(블록 기반 위에서 아래로 설계)', M, '어셈블리 레이아웃 스케치에서 부품을 만드는 흐름이 없음'),

  // ── part features
  i('pf', '돌출 보스·컷', P, '끝 조건이 블라인드·관통·양방향 관통·중간 평면뿐. 다음까지, 꼭짓점까지, 면까지, 면에서 오프셋, 바디까지가 없음. 시작 조건(곡면·꼭짓점·오프셋), 돌출 중 구배, 방향 벡터, 얇은 피처, 선택 윤곽(일부 영역만), 컷의 반대쪽 자르기가 없음', 'extrude'),
  i('pf', '회전 보스·컷', P, '한 방향 각도만. 중간 평면·두 방향·면까지 끝 조건, 얇은 피처, 선택 윤곽이 없음', 'revolve'),
  i('pf', '스윕 보스·컷', P, '안내 곡선, 비틀기(각도·회전 수), 시작/끝 접선 조건, 솔리드 본체 스윕(공구 스윕), 원형 단면 스윕(프로파일 없이 지름)이 없음', 'sweep'),
  i('pf', '로프트 보스·컷', P, '안내 곡선, 중심선, 시작/끝 구속(법선·접선·곡률), 연결점(커넥터) 조정, 닫힌 로프트, 얇은 피처가 없음; 직선(룰드)만 옵션', 'loft'),
  i('pf', '경계 보스·컷', P, '경계 곡면으로 만듦. 방향별 접선/곡률 조건·영향 비율 옵션 확인 필요', 'boundary'),
  i('pf', '필렛', P, '일정 반경 하나만. 여러 반경(모서리마다), 원뿔(rho) 단면, 곡률 연속, 셋백(꼭짓점) 필렛, 접선 전파 끄기, 형상 유지/곡면 유지 옵션이 없음. 변수·면·전체 둥근 필렛은 별도 피처로 있음', 'fillet variableFillet faceFillet fullRoundFillet'),
  i('pf', '모따기', P, '거리 하나(대칭)만. 각도-거리, 거리-거리, 꼭짓점 모따기, 오프셋 면, 면-면 모따기가 없음', 'chamfer'),
  i('pf', '셸', P, '두께 하나, 안쪽만. 바깥쪽 셸, 면별 다른 두께, 제거 면 없는 속 빈 셸 옵션 확인 필요', 'shell'),
  i('pf', '구배', P, '중립 평면 구배만. 분할선 구배, 단계 구배, 면별 다른 각도, 구배 분석과 연동한 자동 선택이 없음', 'draft'),
  i('pf', '구멍 가공 마법사', P, '단순·카운터보어·카운터싱크·탭(ISO 미터)만. 규격(ANSI 인치, JIS, DIN, GB 등)별 표, 테이퍼 파이프 탭, 구멍 슬롯, 끝 조건(다음까지·면까지), 근/원측 카운터싱크(고급 구멍으로 따로 있음), 위치 지정 3D 스케치가 없음', 'hole advancedHole'),
  i('pf', '고급 구멍', D, '', 'advancedHole'),
  i('pf', '나사산(모델 나사산)', P, 'ISO·V형 형상만. 규격 표(UN·사다리꼴·관용), 다중 줄 나사, 끝 다듬기(시작 오프셋·트림) 확인 필요', 'thread'),
  i('pf', '외장 나사산(코스메틱)', D, '', 'thread cosmetic'),
  i('pf', '보강대(리브)', P, '평행/법선 방향 선택, 구배, 양쪽/한쪽 두께, 선형/자연 연장 옵션이 없음', 'rib'),
  i('pf', '돔', P, '타원형 돔, 연속 돔, 방향 벡터 옵션 확인 필요', 'dome'),
  i('pf', '감싸기(랩)', P, '양각·음각만. 스크라이브(곡면 분할), 곡면이 아닌 일반 곡면(스플라인 면)에 감싸기 확인 필요', 'wrap'),
  i('pf', '두껍게 하기', D, '', 'thicken'),
  i('pf', '나선/와선', P, '나선만. 와선(평면 나선), 가변 피치, 테이퍼 나선이 없음', 'helix'),
  i('pf', '바디 이동/복사·축척·분할·결합·삭제/유지', D, '', 'moveBody scaleBody split combine deleteBody'),
  i('pf', '들여쓰기·굽힘(Flex)·변형', P, '변형은 점 변형만. 곡선-곡선 변형, 표면 밀기 변형이 없음', 'indent flex deform'),
  i('pf', '교차', D, '', 'intersect'),
  i('pf', '바디 저장·부품 삽입', D, '', 'saveBodies insertPart'),
  i('pf', '면 삭제·면 바꾸기·면 이동', P, '면 이동(오프셋·이동·회전) 피처가 없음', 'deleteFace replaceFace'),
  i('pf', '자유형(Freeform) 면 변형', M, '제어 곡선·점으로 면을 끌어 모양을 바꾸는 피처가 없음'),
  i('pf', '라이브러리 피처', P, '저장·넣기는 있음. 참조(위치 맞춤) 지정, 크기 매개변수 대화 확인 필요', 'libSave libInsert'),

  // ── reference geometry
  i('rg', '참조 평면', P, '평면에서 오프셋만. 각도, 세 점, 점과 평행, 곡선에 법선, 두 평면 중간, 면에 접선, 실린더 축을 지나는 평면이 없음', 'refPlane'),
  i('rg', '참조 축', D, '', 'refAxis'),
  i('rg', '참조 점', D, '', 'refPoint'),
  i('rg', '좌표계', D, '', 'coordSys'),
  i('rg', '질량 중심 점·경계 상자', D, '', 'refPoint boundingBox'),
  i('rg', '메이트 참조', D, '', 'mateReference'),
  i('rg', '곡선: 투영·분할선·복합·XYZ 점 곡선', P, '분할선은 스케치 투영만. 실루엣 분할선, 교차 분할선이 없음', 'projectedCurve splitLine compositeCurve curveXYZ'),

  // ── patterns
  i('pt', '선형 패턴', P, '인스턴스 건너뛰기, 참조까지(끝 기준), 스케치 변형(인스턴스마다 치수 변화), 두 번째 방향에서 시드만 패턴, 형상 패턴(빠른 패턴) 옵션이 없음', 'linearPattern'),
  i('pt', '원형 패턴', P, '인스턴스 건너뛰기, 두 번째 방향(대칭), 형상 패턴 옵션이 없음', 'circularPattern'),
  i('pt', '대칭 복사', P, '면/바디 대칭 외에 "형상 패턴", 결과 병합/새 바디 선택 확인 필요', 'mirror'),
  i('pt', '곡선·스케치·테이블·채우기·가변 패턴', D, '', 'curvePattern sketchPattern tablePattern fillPattern variablePattern'),

  // ── surfaces
  i('sf', '곡면 돌출·회전·스윕·로프트·평면·오프셋', P, '로프트·스윕의 안내 곡선·접선 조건이 없음(솔리드와 같은 한계)', 'surfaceExtrude surfaceRevolve surfaceSweep surfaceLoft surfacePlanar surfaceOffset'),
  i('sf', '경계 곡면·채우기 곡면', P, '채우기 곡면의 구속 곡선(내부 통과 곡선), 곡률 연속 조건 확인 필요', 'boundary fillSurface'),
  i('sf', '룰드 곡면·방사 곡면·중간 곡면·곡면 펼치기', D, '', 'ruledSurface radiateSurface midSurface flattenSurface'),
  i('sf', '니트·자르기·트림 해제·연장·구멍 지우기·곡면으로 자르기', D, '', 'knit trimSurface untrimSurface extendSurface deleteHole cutWithSurface'),
  i('sf', '곡면 필렛', M, '두 곡면 사이 필렛(곡면 바디 필렛)이 없음'),
  i('sf', '면 바꾸기·면 삭제(패치)', D, '', 'replaceFace deleteFace'),

  // ── sheet metal
  i('sm', '베이스 플랜지·모서리 플랜지·마이터 플랜지·헴·조그·스케치 굽힘·로프트 굽힘', P, '모서리 플랜지의 플랜지 위치(재질 안/밖/굽힘 바깥), 사용자 정의 윤곽 편집, 굽힘 여유 표·굽힘 공제 표가 없음(K 계수만)', 'baseFlange edgeFlange miterFlange hem jog sketchedBend loftedBend'),
  i('sm', '판금으로 변환·굽힘 삽입·찢기·펼치기/접기·교차 굽힘·용접 모서리·탭과 슬롯', D, '', 'convertSheet insertBends rip unfold fold crossBreak weldedCorner tabSlot'),
  i('sm', '닫힌 모서리·모서리 릴리프·성형 도구·통풍구·전개도', P, '성형 도구는 내장 모양만(사용자 성형 도구 만들기가 없음), 게이지 표(재질·두께별) 확인 필요', 'closedCorner cornerRelief formTool flatten vent'),
  i('sm', '판금 게이지 표·굽힘 표(굽힘 여유/공제)', M, '두께·반경·K를 표에서 고르는 게이지 표와 굽힘 계산 표가 없음'),
  i('sm', '판금 전개도 내보내기(DXF, 굽힘선 층)', P, '도면 전개도 뷰·DXF는 있음. 부품에서 바로 전개도 DXF로 내보내기 확인 필요'),
  i('sm', '구멍·컷이 굽힘을 가로지르는 법선 컷', M, '굽힘을 지나는 컷을 판에 수직으로 만드는 옵션이 없음'),

  // ── weldments
  i('wd', '구조 부재(표준 단면)', P, '내장 단면만. 사용자 단면 라이브러리 추가, 그룹별 코너 처리(끝 맞춤·마이터) 옵션 확인 필요', 'structural'),
  i('wd', '자르기/연장·끝 막기·거싯·용접 비드', D, '', 'trimExtend endCap gusset weldBead'),
  i('wd', '절단 목록(cut list) 표·속성', P, '절단 목록은 있음. 도면의 용접 절단 목록 표, 각도 절단 길이 계산 확인 필요', 'cutList'),
  i('wd', '용접 기호·용접 표(도면)', P, '용접 기호는 있음. 용접 표가 없음', 'drwWeld'),

  // ── mold
  i('md', '분할선·차단 곡면·분할 곡면·금형 분할·코어/캐비티', D, '', 'partingLine shutOff partingSurface toolingSplit cavity'),
  i('md', '언더컷 분석·구배 분석·수축', D, '', 'eval_undercut draftAnalysis shrink'),
  i('md', '코어(사이드 코어/리프터) 추출', M, '언더컷을 사이드 코어로 떼어 내는 코어 피처가 없음'),

  // ── fastening / plastics features
  i('fs', '마운팅 보스·스냅 훅·스냅 훅 홈·통풍구·립/홈', D, '', 'mountingBoss snapHook snapHookGroove vent lipGroove'),

  // ── part management
  i('pm', '수식·전역 변수·컨피규레이션·디자인 테이블', D, '', 'equations configurations designTable'),
  i('pm', '재질·질량 특성', D, '', 'material massProps'),
  i('pm', '사용자 정의 속성', D, '', 'customProps'),
  i('pm', '다중 바디 관리(바디 폴더·결과 병합)', D, '', 'combine deleteBody'),
  i('pm', '롤백·억제·피처 재정렬', P, '롤백·억제는 있음. 피처 트리에서 끌어 순서 바꾸기, 피처 폴더 확인 필요', 'rollbackHere suppress'),
  i('pm', '외관(색·질감·데칼)', P, '데칼(이미지 붙이기)이 없음'),
  i('pm', '파생 부품(대칭 부품·부품 삽입)', P, '부품 삽입은 있음. 대칭 부품 만들기(반대쪽 파일)가 없음', 'insertPart'),
  i('pm', '형상 단순화(Defeature)', D, '', 'defeature'),

  // ── evaluate
  i('ev', '측정·질량 특성·간섭·곡률·얼룩말·두께·구배·언더컷·대칭·편차·형상 검사·비교', D, '', 'measure massProps interference curvature zebraStripes thicknessAnalysis draftAnalysis eval_undercut eval_symmetry eval_deviation eval_geometry eval_compare'),
  i('ev', '원가·지속 가능성', D, '', 'eval_costing eval_sustain'),
  i('ev', '설계 검사기', D, '', 'designCheck'),
  i('ev', '단면 특성(단면의 면적·관성)', M, '단면 평면의 면적·관성 모멘트를 계산하는 도구가 없음'),

  // ── assembly
  i('as', '표준 메이트(일치·동심·거리·평행·직각·각도·잠금)', D, '', 'mate'),
  i('as', '고급 메이트(폭·대칭·거리/각도 제한)', P, '경로 메이트, 선형/선형 커플러, 윤곽 중심 메이트가 없음', 'mate'),
  i('as', '기계 메이트(기어·랙피니언·나사·힌지·캠)', P, '슬롯 메이트, 유니버설 조인트 메이트가 없음', 'mate'),
  i('as', '스마트 메이트·메이트 참조로 자동 메이트', D, '', 'smartMate mateReference'),
  i('as', '자석 메이트(연결점 스냅)', M, ''),
  i('as', '부품 이동·회전(자유도 안에서 끌기)', D, '', 'moveComponent rotateComponent'),
  i('as', '부품 패턴(선형·원형·피처·스케치·곡선·체인)·대칭', D, '', 'linearComponentPattern circularComponentPattern featureDrivenComponentPattern sketchDrivenComponentPattern curveDrivenComponentPattern chainComponentPattern mirrorComponents'),
  i('as', '서브 어셈블리', P, '강체 서브 어셈블리만. 유연(flexible) 서브 어셈블리로 상위에서 내부 자유도를 푸는 기능이 없음'),
  i('as', '어셈블리 컨피규레이션', M, '부품 표시·억제·메이트 값을 컨피규레이션별로 바꾸는 기능이 없음(부품 컨피규레이션만 있음)'),
  i('as', '간섭 검사·구멍 정렬·여유 검사', P, '여유(clearance) 검사가 없음', 'interference holeAlignment'),
  i('as', '분해도', P, '분해 선(경로 선) 스케치, 방사형 분해, 분해 애니메이션 저장 확인 필요', 'explode'),
  i('as', '모션 스터디(애니메이션·기본 모션)', P, '모터(등속·왕복)와 메이트 구동만. 키프레임 애니메이션, 스프링·감쇠·중력·접촉의 동역학(물리) 모션, 힘·토크 결과 그래프가 없음', 'motion'),
  i('as', '어셈블리 피처(컷·구멍)·용접 비드', P, '어셈블리 용접 비드 확인 필요', 'asmCut asmHole'),
  i('as', '부품 교체·메이트 포함 복사·엔벨로프', D, '', 'replaceComponent copyWithMates envelopeComponent'),
  i('as', '대형 어셈블리 모드·경량 부품·단순화 표현', P, '대형 어셈블리 모드는 있음. 단순화 표현(외곽만 남긴 서브 어셈블리 대체)이 없음', 'largeAssemblyMode'),
  i('as', '벨트/체인', D, '', 'beltChain'),
  i('as', '표준 부품 라이브러리·스마트 패스너', D, '', 'stdLibrary smartFastener'),
  i('as', '위에서 아래로 설계(어셈블리 안에서 부품 편집, 외부 참조)', P, '어셈블리 문맥에서 부품을 편집하고 다른 부품 면을 참조하는 외부 참조 관리 확인 필요'),
  i('as', '어셈블리 시각화(질량·부피별 색 정렬)', M, ''),

  // ── drawings
  i('dr', '표준 3면도·모델 뷰·투상 뷰·보조 뷰', D, '', 'std3View addView auxView'),
  i('dr', '단면·정렬 단면·상세·끊기·자르기·부분 단면', D, '', 'sectionView alignedSection detailView breakView cropView brokenOutSection'),
  i('dr', '제거 단면·상대 뷰·3D 도면 뷰', M, ''),
  i('dr', '전개도 뷰·대체 위치 뷰', D, '', 'flatPatternView alternatePositionView'),
  i('dr', '스마트 치수·모델 항목·자동 치수', P, '세로 좌표(ordinate) 치수는 있음. 기준선 치수, 체인 치수, 모따기 치수, 호 길이 치수 확인 필요', 'drwSmartDim drwModelItems autoDims'),
  i('dr', '주석: 노트·풍선·GD&T·데이텀·표면 거칠기·중심 표시·구름·데이텀 대상·해치', D, '', 'ann:note ann:balloon ann:gdt ann:datum ann:surface ann:centermark ann:cloud ann:datumTarget ann:hatch'),
  i('dr', '중심선·구멍 설명(hole callout)·자동 풍선', M, '중심선 주석, 구멍 사양을 읽는 구멍 설명, 자동 풍선이 없음'),
  i('dr', '표: BOM·구멍 표·개정 표·굽힘 표·일반 표', D, '', 'bom holeTable revisionTable bendTable drwTable'),
  i('dr', '용접 표·절단 목록 표', M, ''),
  i('dr', '시트·시트 형식·표제란·층', D, '', 'addSheet drwSheetFormat drwTitleBlock drwLayers'),
  i('dr', '도면 내보내기(DXF·DWG·SVG·PDF·인쇄)', D, '', 'exportDxf exportDwg exportSvg print'),

  // ── structural simulation
  i('si', '정적 해석(사면체 2차 요소)', D, '', 'simulation'),
  i('si', '셸 요소(판금·얇은 부품)', M, '얇은 부품을 중간면 셸로 해석하는 요소가 없음(모두 솔리드 사면체)'),
  i('si', '빔 요소(용접 구조물)', M, '구조 부재를 빔·트러스로 해석하는 요소와 조인트가 없음'),
  i('si', '커넥터(볼트·핀·스프링·베어링·강체·스폿 용접·모서리 용접)', M, '볼트 예하중 등 커넥터가 없음'),
  i('si', '접촉(결합·접촉·마찰)', P, '결합·마찰 없는 접촉만. 마찰 접촉, 억지 끼워 맞춤(shrink fit), 가상 벽 마찰이 없음'),
  i('si', '하중(힘·압력·토크·중력)', P, '원격 하중/질량, 베어링 하중, 원심력, 강제 변위, 분포 질량, 온도(열 응력) 하중이 없음'),
  i('si', '구속(고정·롤러/대칭·탄성 지지)', P, '힌지(고정 힌지), 원통면 구속(반경·원주·축 방향), 순환 대칭이 없음'),
  i('si', '메쉬 제어·품질', P, '면 국부 세분화는 있음. 적응형(h/p) 메쉬, 혼합 메쉬(솔리드+셸+빔)가 없음'),
  i('si', '모드·좌굴·열·피로·동적(조화·과도·랜덤)·낙하·비선형·하중 조합', D, '', 'simulation dynamicStudy dropTest nonlinearStudy loadCombination'),
  i('si', '위상 최적화·설계 스터디', D, '', 'topologyStudy designStudy'),
  i('si', '응력 선형화(압력 용기)', D, '', 'simulation'),
  i('si', '하위 모델링(submodeling)', M, ''),
  i('si', '해석 보고서', D, '', 'simulation'),

  // ── flow
  i('fl', '내부·외부 유동(격자 볼츠만, 국부 블록 세분화)', P, '난류 모델은 LES(Smagorinsky)만이며 해상도가 브라우저 계산에 묶임. 다공성 매질, 압축성 유동, 비뉴턴 유체가 없음', 'flowStudy'),
  i('fl', '열 전달·복사·전자 부품 냉각·회전 영역·자유 표면', D, '', 'flowStudy electronicsCooling freeSurface'),
  i('fl', '입자 추적·유선 애니메이션', P, '유선은 있음. 입자 연구(입자 궤적·침식)가 없음'),
  i('fl', '목표(goals)·매개변수 스터디', M, '표면/부피 목표값을 정의하고 수렴과 매개변수 스윕을 하는 기능이 없음'),

  // ── plastics
  i('pl', '충전·압력·온도·웰드 라인·에어 트랩·싱크·냉각·섬유 배향·휨·게이트 제안·보고서', D, '', 'plasticsStudy'),
  i('pl', '러너·다중 캐비티·패밀리 금형', M, '러너 시스템과 여러 캐비티를 함께 해석하는 기능이 없음'),
  i('pl', '보압(packing) 단계·가스 보조·인서트 성형', P, '보압 해석 범위 확인 필요, 가스 보조·인서트 성형이 없음'),

  // ── electrical / routing
  i('el', '배관·튜브·케이블·하니스 경로·하니스 도면·회로도', D, '', 'pipeRoute tubeRoute cableRoute harnessRoute harnessDrawing schematic'),
  i('el', '라우팅 부품 라이브러리(엘보·티·플랜지·커넥터, 연결점)', P, '내장 부품만. 사용자 라우팅 부품 만들기(연결점·경로점 지정)가 없음'),
  i('el', '배관 스풀·배관 도면(ISO 배관도)', M, ''),
  i('el', 'PCB 연동(보드 외곽·부품 배치 가져오기, IDF/ProStep)', M, ''),

  // ── CAM
  i('cm', '밀링 2.5축(페이스·포켓·적응형·윤곽·슬롯·나선·스폿·드릴·펙·탭)', D, '', 'camFacing camPocket camAdaptive camContour camSlot camHelix camSpot camDrill camPeck camTap'),
  i('cm', '밀링 3축(Z 레벨·평행·스캘럽·워터라인)', D, '', 'camZLevel camParallel camScallop camWaterline'),
  i('cm', '선반(페이스·황삭·정삭·보링·홈·나사)', D, '', 'camTurnFace camTurnRough camTurnFinish camTurnBore camTurnGroove camTurnThread'),
  i('cm', '피처 인식·가공 계획·시뮬레이션·포스트·셋업 시트', D, '', 'camRecognize camPlan camSimulate camPost camSetupSheet'),
  i('cm', '4·5축 동시 가공·밀턴', M, ''),
  i('cm', '공구 경로 편집(링크·진입/후퇴 수정)', M, ''),

  // ── data management
  i('dm', '보관소(체크인·체크아웃·버전·사용처·Pack and Go)', D, '', 'vaultExplorer vaultCheckIn vaultCheckOut whereUsed vaultPackAndGo versionHistory'),
  i('dm', '수명 주기 상태·승인 워크플로·변경 요청', P, '버전·체크인은 있음. 상태 전이(작업 중→검토→승인)·승인자·변경 요청(ECR/ECO)이 없음'),
  i('dm', '마크업·리뷰', D, '', 'markup markupReport'),
  i('dm', '검사 보고서(풍선·표·CMM 결과 가져오기)', D, '', 'inspBalloon inspTable inspImport inspReport'),
  i('dm', '기술 일러스트레이션(분해 장면·애니메이션)', D, '', 'illustration'),
  i('dm', '작업 스케줄러', D, '', 'taskScheduler'),
  i('dm', '여러 사람 동시 작업(클라우드 공유)', M, ''),

  // ── visualization
  i('vz', '표시 스타일·단면 보기·투시도·보기 방향', D, '', 'styleMenu section perspective viewsMenu'),
  i('vz', '렌더링(경로 추적)', D, '', 'renderView'),
  i('vz', '조명·배경·장면', P, '햇빛(위치·시간) 조명 확인 필요', 'lights'),
  i('vz', '카메라·워크스루·애니메이션 영상 저장', P, '애니메이션 영상 저장 확인 필요, 워크스루(1인칭 걷기)가 없음'),
  i('vz', 'MBD(3D PMI·모델 주석)', D, '', 'mbdAnnotations mbdAutoDimension insertModelAnnotations'),
  i('vz', '3D PDF', X, '사용자 결정으로 범위에서 뺌(U3D/PRC 작성기 필요)'),

  // ── file I/O
  i('io', 'STEP·IGES 읽기/쓰기', D, '', 'importStep exportStep exportIges'),
  i('io', 'Parasolid(x_t/x_b) 읽기/쓰기', P, '외부 Parasolid 기반 프로그램에서 열리는지 확인하지 못함', 'exportXt exportXb'),
  i('io', 'DXF·DWG 읽기/쓰기', P, 'DWG는 R2000으로만 저장함', 'exportDxf exportDwg'),
  i('io', '메시(STL·OBJ·PLY·glTF/GLB·3MF·VRML·USDZ)', D, '', 'exportMesh:glb exportStl'),
  i('io', '다른 CAD 고유 형식 직접 열기', M, '다른 CAD 제품의 고유 부품/어셈블리 파일을 직접 여는 기능이 없음'),
  i('io', '스캔 데이터(메시)를 솔리드로', M, '메시를 면 맞춤으로 곡면/솔리드화하는 기능이 없음(메시 바디 표시만)'),
  i('io', '가져온 형상 피처 인식', P, 'CAM용 피처 인식은 있음. 가져온 바디를 돌출·구멍 등 편집 가능한 피처 트리로 바꾸는 기능이 없음'),
  i('io', 'PDF·이미지 내보내기', D, '', 'exportImage print'),

  // ── automation
  i('au', '매크로 녹화·실행·편집·API', D, '', 'macroRecord macroRun macroEditor'),
  i('au', '사용자 정의(단축키·도구 모음·메뉴·마우스 제스처)', P, '단축키 보기는 있음. 단축키 바꾸기, 도구 모음 편집, 마우스 제스처 확인 필요', 'shortcuts'),
  i('au', '설계 라이브러리·템플릿', P, '라이브러리 피처는 있음. 부품/도면 템플릿 관리 확인 필요', 'libSave'),

  // ── OpenSCAD
  i('os', '언어 전체(모듈·함수·let·each·리스트 컴프리헨션·assert·echo·include/use)', D, '', 'openscad'),
  i('os', '기본 도형·변환·불리언·hull·minkowski·offset·projection·돌출·surface·import·text·resize·color·render', D, '', 'openscad'),
  i('os', '내장 함수(수학·문자열·search·lookup·rands·norm·cross 등)', P, 'is_object·object()(새 객체 문법), textmetrics/fontmetrics, ord/chr의 범위 처리 등 최신 판 기능 확인 필요'),
  i('os', 'roof()', M, '최신 판의 실험 기능 roof가 없음'),
  i('os', 'Customizer(매개변수 화면·저장 세트)', D, '', 'openscad'),
  i('os', '애니메이션($t, FPS·단계, 프레임 내보내기)', M, '$t 값은 0으로 고정. 애니메이션 재생·프레임 이미지 저장이 없음'),
  i('os', '내보내기(STL·OFF·AMF·3MF·DXF·SVG·CSG·PDF)', P, 'SCAD(다면체) 내보내기와 일반 메시 형식은 있음. OFF·AMF·CSG 트리 내보내기, 2D 결과의 PDF가 없음', 'exportScad'),
  i('os', '편집기(구문 강조·오류 위치·콘솔)', P, '코드 칸·콘솔·오류 표시는 있음. 구문 강조, 자동 완성, 오류 줄로 이동 확인 필요'),
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
