// Sample projects: architecture and processes, and projects, UX and data.
import { sample } from './entry.js';

export const ENTERPRISE = [
  sample('enterprise-arch', 'enterprise', 'dgArchimate', '전사 아키텍처|Company Architecture', 'ArchiMate 계층 뷰와 동기·전략 뷰|ArchiMate layered view, and motivation and strategy', (k) => {
    k.archimate('보험 계약 계층 뷰|Policy Layered View', [
      ['customer', 'business-actor', '고객|Customer'], ['service', 'business-service', '계약 서비스|Policy Service'], ['process', 'business-process', '계약 처리|Handle Policy'], ['contract', 'business-object', '계약|Policy'],
      ['appService', 'application-service', '계약 API|Policy API'], ['app', 'application-component', '계약 시스템|Policy System'], ['data', 'application-data-object', '계약 데이터|Policy Data'],
      ['server', 'technology-node', '앱 서버|App Server'], ['db', 'technology-system-software', 'PostgreSQL'],
    ], [
      ['ArchiMateServing', 'service', 'customer'], ['ArchiMateRealization', 'process', 'service'], ['ArchiMateAccess', 'process', 'contract', { accessType: 'write' }],
      ['ArchiMateServing', 'appService', 'process'], ['ArchiMateRealization', 'app', 'appService'], ['ArchiMateAccess', 'app', 'data', { accessType: 'readwrite' }],
      ['ArchiMateServing', 'server', 'app'], ['ArchiMateComposition', 'server', 'db'],
    ], { grid: { customer: [1, 0], service: [1, 1], process: [1, 2], contract: [2, 2], appService: [1, 3], app: [1, 4], data: [2, 4], server: [1, 5], db: [2, 5] }, gapX: 60, gapY: 50 });
    k.archimate('동기와 전략|Motivation and Strategy', [
      ['board', 'motivation-stakeholder', '경영진|Board'], ['driver', 'motivation-driver', '비용 압박|Cost Pressure'], ['assess', 'motivation-assessment', '오래된 시스템|Old Systems'], ['goal', 'motivation-goal', '운영비 20% 절감|Cut Costs 20%'], ['principle', 'motivation-principle', '클라우드 우선|Cloud First'],
      ['capability', 'strategy-capability', '디지털 계약|Digital Policies'], ['course', 'strategy-course-of-action', '단계적 이전|Phased Migration'], ['pkg', 'implementation-work-package', '이전 프로젝트|Migration Project'], ['plateau', 'implementation-plateau', '목표 아키텍처|Target Architecture'],
    ], [
      ['ArchiMateAssociation', 'board', 'driver'], ['ArchiMateAssociation', 'driver', 'assess'], ['ArchiMateInfluence', 'assess', 'goal', { strength: '+' }], ['ArchiMateRealization', 'principle', 'goal'],
      ['ArchiMateRealization', 'course', 'capability'], ['ArchiMateInfluence', 'capability', 'goal', { strength: '++' }], ['ArchiMateRealization', 'pkg', 'plateau'], ['ArchiMateRealization', 'plateau', 'course'],
    ], { grid: { board: [0, 0], driver: [1, 0], assess: [2, 0], goal: [3, 0], principle: [3, 1], capability: [2, 1], course: [1, 1], plateau: [0, 1], pkg: [0, 2] }, gapX: 60, gapY: 70 });
  }),

  sample('purchase', 'enterprise', 'dgBpmn', '구매 승인|Purchase Approval', 'BPMN, 활동, 부서 간 정보 흐름|BPMN, an activity and information flows between departments', (k) => {
    k.bpmn('구매 승인 절차|Approval Procedure', '회사|Company', ['요청자|Requester', '팀장|Manager', '구매팀|Purchasing'], [
      ['s', 0, 'BPMNStartEvent', '필요 발생|Need arises'], ['form', 0, 'task:user', '구매 요청 작성|Fill request'], ['check', 1, 'task:user', '요청 검토|Review'], ['g', 1, 'BPMNExclusiveGateway', '승인?|Approve?'],
      ['quote', 2, 'task:user', '견적 비교|Compare quotes'], ['po', 2, 'task:send', '발주|Send order'], ['t', 2, 'BPMNIntermediateEvent:timer', '납품 대기|Wait for goods'], ['recv', 2, 'task:manual', '검수|Inspect'], ['e', 2, 'BPMNEndEvent', '구매 완료|Done'],
      ['deny', 1, 'task:send', '반려 통보|Notify refusal'], ['e2', 1, 'BPMNEndEvent', '반려|Refused'],
    ], [['s', 'form'], ['form', 'check'], ['check', 'g'], ['g', 'quote', '예|yes'], ['g', 'deny', '아니오|no'], ['deny', 'e2'], ['quote', 'po'], ['po', 't'], ['t', 'recv'], ['recv', 'e']]);
    k.activity('견적 비교|Compare Quotes', ['구매 담당|Buyer', '공급사|Vendors'], [
      ['i', 0, 0, 'UMLInitialNode'], ['ask', 0, 1, 'action:sendSignal', '견적 요청|Request Quotes'], ['reply', 1, 1, 'UMLAction', '견적 작성|Prepare Quote'], ['recv', 0, 2, 'action:acceptSignal', '견적 받기|Receive Quotes'], ['cmp', 0, 3, 'UMLAction', '가격 비교|Compare Prices'], ['d', 0, 4, 'UMLDecisionNode'], ['pick', 0, 5, 'UMLAction', '공급사 선정|Pick Vendor'], ['f', 0, 6, 'UMLActivityFinalNode'], ['again', 1, 4, 'UMLAction', '재견적 요청|Ask Again'], ['ff', 1, 5, 'UMLFlowFinalNode'],
    ], [['i', 'ask'], ['ask', 'reply'], ['reply', 'recv'], ['recv', 'cmp'], ['cmp', 'd'], ['d', 'pick', '예산 안|within budget'], ['d', 'again', '초과|over budget'], ['again', 'ff'], ['pick', 'f']]);
    k.graph('UMLInformationFlowDiagram', k.model, '부서 간 정보 흐름|Flows Between Departments', [
      ['req', 'UMLActor', '요청 부서|Requester'], ['buy', 'UMLComponent', 'PurchasingSystem'], ['vendor', 'UMLActor', '공급사|Vendor'], ['acc', 'UMLActor', '회계팀|Accounting'],
      ['i1', 'UMLInformationItem', 'PurchaseRequest'], ['i2', 'UMLInformationItem', 'PurchaseOrder'], ['i3', 'UMLInformationItem', 'Invoice'],
    ], [['UMLInformationFlow', 'req', 'buy', { conveyed: 'PurchaseRequest' }], ['UMLInformationFlow', 'buy', 'vendor', { conveyed: 'PurchaseOrder' }], ['UMLInformationFlow', 'vendor', 'acc', { conveyed: 'Invoice' }]],
    { grid: { req: [0, 0], buy: [1, 0], vendor: [2, 0], acc: [2, 1], i1: [0, 2], i2: [1, 2], i3: [2, 2] }, gapX: 170, gapY: 80 });
  }),

  sample('onboarding', 'enterprise', 'dgFlowchart', '신입 사원 입사|Employee Onboarding', 'BPMN, 계정 발급 순서도, 입사 준비 일정|BPMN, the account flowchart and a preparation schedule', (k) => {
    k.bpmn('입사 절차|Onboarding Procedure', '회사|Company', ['인사팀|HR', 'IT 지원|IT Support', '소속 팀|Team'], [
      ['s', 0, 'BPMNStartEvent:message', '합격 통보|Offer accepted'], ['docs', 0, 'task:user', '서류 받기|Collect papers'], ['split', 0, 'BPMNParallelGateway'], ['pc', 1, 'task:manual', 'PC 준비|Prepare PC'], ['acct', 1, 'task:service', '계정 발급|Create accounts'], ['buddy', 2, 'task:user', '멘토 지정|Pick mentor'],
      ['join', 2, 'BPMNParallelGateway'], ['day1', 2, 'task:user', '첫날 안내|First day tour'], ['e', 2, 'BPMNEndEvent', '입사 완료|Onboarded'],
    ], [['s', 'docs'], ['docs', 'split'], ['split', 'pc', '', 'v'], ['pc', 'acct'], ['split', 'buddy', '', 'v'], ['acct', 'join'], ['buddy', 'join'], ['join', 'day1'], ['day1', 'e']]);
    k.flowchart('계정 발급|Create an Account', [
      ['s', 'FCTerminator', '시작|Start'], ['in', 'FCManualInput', '사번 입력|Enter ID'], ['d', 'FCDecision', '이미 있음?|Exists?'], ['make', 'FCPredefinedProcess', '계정 생성|Create account'], ['db', 'FCDatabase', '계정 DB|Directory'], ['mail', 'FCDocument', '안내 메일|Welcome mail'], ['e', 'FCTerminator', '끝|End'],
    ], [['s', 'in'], ['in', 'd'], ['d', 'make', '아니오|no'], ['d', 'mail', '예|yes'], ['make', 'db'], ['make', 'mail'], ['mail', 'e']],
    { grid: { s: [0, 0], in: [0, 1], d: [0, 2], make: [0, 3], db: [0, 4], mail: [1, 2], e: [2, 2] }, gapX: 90, gapY: 44 });
    k.gantt('입사 준비 일정|Preparation Schedule', '입사 준비|Onboarding Plan', '2027-01-04', [
      ['docs', '서류 받기|Collect papers', 3, 100, 'HR'], ['pc', 'PC 준비|Prepare PC', 2, 50, 'IT'], ['acct', '계정 발급|Create accounts', 1, 0, 'IT'], ['buddy', '멘토 지정|Pick mentor', 1, 0, '팀장|Lead'], ['day1', '첫 출근|First day'],
    ], [['docs', 'pc'], ['pc', 'acct'], ['docs', 'buddy'], ['acct', 'day1'], ['buddy', 'day1']]);
  }),

  sample('design-profile', 'enterprise', 'dgProfile', '설계 규칙 프로파일|Design Rule Profile', '프로파일, 패키지 규칙, 적용한 클래스|A profile, package rules and classes that use it', (k) => {
    const profile = k.addElement(k.project, 'UMLProfile', { name: 'DddProfile', documentation: k.tr('도메인 주도 설계 스테레오타입|Stereotypes of domain-driven design') });
    const add = (type, name, doc) => k.addElement(profile, type, { name, documentation: k.tr(doc) });
    const meta = add('UMLMetaClass', 'Class', '');
    const aggregate = add('UMLStereotype', 'AggregateRoot', '집합체의 루트|The root of an aggregate');
    const entity = add('UMLStereotype', 'Entity', '식별자가 있는 객체|An object with an identity');
    const value = add('UMLStereotype', 'ValueObject', '값으로만 비교하는 객체|An object compared by value');
    const service = add('UMLStereotype', 'DomainService', '여러 객체에 걸친 규칙|A rule across objects');
    const diagramProfile = k.newDiagram(profile, 'UMLProfileDiagram', 'DDD 프로파일|DDD Profile');
    const p = k.draw(diagramProfile);
    p.show('profile', profile, 20, 20, { w: 800, h: 340 });
    p.show('meta', meta, 340, 80);
    [['a', aggregate, 40], ['e', entity, 240], ['v', value, 420], ['s', service, 620]].forEach(([key, element, x]) => {
      p.show(key, element, x, 240);
      p.edge('UMLExtension', key, 'meta', { isRequired: false }, { style: 'oblique' });
    });
    k.place('UMLPackageDiagram', k.model, '패키지 규칙|Package Rules', [
      ['app', 'UMLPackage', 240, 40, 'application', { w: 300, h: 100 }],
      ['dom', 'UMLPackage', 40, 220, 'domain', { w: 300, h: 100 }],
      ['infra', 'UMLPackage', 440, 220, 'infrastructure', { w: 300, h: 100 }],
    ], [['import', 'app', 'dom'], ['import', 'infra', 'dom'], ['UMLDependency', 'app', 'infra', '사용 금지|forbidden']]);
    const made = k.classes('적용 예: 주문|Applied: Orders', k.pkg('orders', 'DDD로 그린 주문|Orders drawn with DDD'), [
      ['Order', 'number:String', 'addLine(line:OrderLine)'],
      ['OrderLine', 'quantity:int', ''],
      ['Money', 'amount:long,currency:String', 'plus(other:Money):Money'],
      ['PricingService', '', 'price(order:Order):Money'],
    ], [['comp', 'Order', 'OrderLine', '1', '1..*', 'lines'], ['dir', 'OrderLine', 'Money', '', '1', 'price'], ['dep', 'PricingService', 'Order']],
    { main: true, grid: { PricingService: [0, 0], Order: [1, 0], OrderLine: [2, 0], Money: [2, 1] } });
    made.Order.stereotype = k.ref(aggregate);
    made.OrderLine.stereotype = k.ref(entity);
    made.Money.stereotype = k.ref(value);
    made.PricingService.stereotype = k.ref(service);
  }),

  sample('layered', 'enterprise', 'dgPackage', '계층형 아키텍처|Layered Architecture', '패키지 계층, 컴포넌트, 요청 커뮤니케이션|Package layers, components and a request communication', (k) => {
    const compact = { suppressAttributes: true, suppressOperations: true };
    k.place('UMLPackageDiagram', k.model, '계층|Layers', [
      ['ui', 'UMLPackage', 220, 40, 'presentation', { w: 360, h: 110 }],
      ['Ctl', 'UMLClass', 290, 90, 'UserController', {}, compact],
      ['app', 'UMLPackage', 220, 210, 'application', { w: 360, h: 110 }],
      ['Svc', 'UMLClass', 290, 260, 'UserService', {}, compact],
      ['dom', 'UMLPackage', 40, 380, 'domain', { w: 340, h: 110 }],
      ['User', 'UMLClass', 130, 430, 'User', {}, compact],
      ['infra', 'UMLPackage', 440, 380, 'infrastructure', { w: 340, h: 110 }],
      ['Repo', 'UMLClass', 500, 430, 'UserRepositoryImpl', {}, compact],
    ], [['import', 'ui', 'app'], ['import', 'app', 'dom'], ['import', 'infra', 'dom'], ['UMLDependency', 'app', 'infra']]);
    k.graph('UMLComponentDiagram', k.model, '계층 컴포넌트|Layer Components', [
      ['web', 'UMLComponent', 'WebLayer'], ['api', 'interfaceIcon', 'UserAPI'], ['svc', 'UMLComponent', 'ServiceLayer'], ['repoApi', 'interfaceIcon', 'UserRepository'], ['db', 'UMLComponent', 'DataLayer'], ['jar', 'UMLArtifact', 'app.jar'],
    ], [['UMLUsage', 'web', 'api'], ['UMLInterfaceRealization', 'svc', 'api'], ['UMLUsage', 'svc', 'repoApi'], ['UMLInterfaceRealization', 'db', 'repoApi'], ['UMLManifestation', 'jar', 'svc']],
    { grid: { web: [0, 0], api: [1, 0], svc: [2, 0], repoApi: [3, 0], db: [4, 0], jar: [2, 1] }, gapX: 70, gapY: 80 });
    k.communication('사용자 조회|Find a User', [['@사용자|Client', 70, 30], ['controller', 20, 260], ['service', 400, 260], ['repository', 780, 260], ['database', 780, 500]],
      [[0, 1, ['GET /users/1']], [1, 2, ['find(1)']], [2, 3, ['findById(1)']], [3, 4, ['SELECT']]]);
  }),
];

export const PLAN = [
  sample('app-launch', 'plan', 'dgGantt', '앱 출시 프로젝트|App Launch Project', '간트 차트, 작업 분해(WBS), 일 년 타임라인|Gantt chart, work breakdown and the year on a timeline', (k) => {
    const PLAN_NAME = '출시 계획|Launch Plan';
    k.gantt('출시 일정|Launch Schedule', PLAN_NAME, '2027-03-01', [
      '기획|Planning', ['req', '요구사항 정리|Requirements', 5, 100, 'PM'], ['ux', '화면 설계|UX design', 6, 80, '디자이너|Designer'], ['ok', '설계 승인|Design sign-off'],
      '개발|Build', ['api', '서버 API|Server API', 10, 30, 'Alex'], ['app', '모바일 앱|Mobile app', 12, 20, 'Blair'],
      '출시|Launch', ['qa', '통합 시험|Integration test', 5, 0, 'QA'], ['store', '스토어 심사|Store review', 3, 0, 'PM'], ['live', '정식 출시|Go live'],
    ], [['req', 'ux'], ['ux', 'ok'], ['ok', 'api'], ['ok', 'app'], ['api', 'qa'], ['app', 'qa'], ['qa', 'store'], ['store', 'live']]);
    k.wbs('작업 분해|Work Breakdown', PLAN_NAME, '2027-03-01', '모바일 앱 출시|Mobile App Launch', [
      ['기획|Planning', ['요구사항|Requirements', '일정과 예산|Schedule & budget']],
      ['설계|Design', ['화면|Screens', '데이터|Data', '아키텍처|Architecture']],
      ['개발|Build', ['서버 API|Server API', '모바일 앱|Mobile app', '결제|Payments']],
      ['출시|Launch', ['시험|Testing', '마케팅|Marketing', '스토어 등록|Store listing']],
    ]);
    k.timeline('2027년 타임라인|Timeline 2027', PLAN_NAME, ['2027-01-01', '2027-12-31', '2027'], [
      ['킥오프|Kick-off', '2027-01-11'], ['설계 완료|Design done', '2027-03-15'], ['베타|Beta', '2027-06-01'], ['공개 출시|Public launch', '2027-08-02'], ['첫 업데이트|First update', '2027-10-04'],
    ], [['기획 기간|Planning phase', '2027-01-11', '2027-03-12'], ['개발 기간|Build phase', '2027-03-15', '2027-07-30'], ['운영|Operate', '2027-08-02', '2027-12-31']]);
  }),

  sample('mobile-ux', 'plan', 'dgWireframe', '모바일 앱 UX|Mobile App UX', '고객 여정, 스토리 맵, 화면 와이어프레임|Customer journey, story map and screen wireframes', (k) => {
    k.journey('운동 앱 고객 여정|Fitness App Journey', { name: '이하늘|Haneul Lee', role: '퇴근 후 운동하는 직장인|Exercises after work', goals: '운동을 꾸준히 하기|Keep a steady habit', frustrations: '복잡한 설정|Complicated setup' }, [
      ['발견|Discover', '앱을 알게 됨|Finds the app', '스토어에서 검색|Searches the store', ['mobile', '앱 스토어|App store'], ['neutral', '기대 반 의심 반|Unsure'], '비슷한 앱이 많음|Too many lookalikes', '후기 강조|Highlight reviews'],
      ['첫 설정|Setup', '시작함|Gets started', '목표를 입력|Sets a goal', ['mobile', '설정 화면|Setup screen'], ['negative', '입력이 많음|Too many questions'], '설문이 길다|Long survey', '세 문항으로 축소|Three questions only'],
      ['첫 운동|First workout', '따라함|Follows along', '영상을 따라 운동|Follows a video', ['mobile', '운동 화면|Workout screen'], ['positive', '재미있음|Fun'], '', '난이도 자동 조정|Auto difficulty'],
      ['습관|Habit', '꾸준히 함|Keeps going', '주간 기록을 봄|Checks weekly stats', ['push', '푸시 알림|Push'], ['veryPositive', '뿌듯함|Proud'], '알림이 잦음|Too many alerts', '알림 시간 고르기|Choose alert time'],
    ]);
    k.storyMap('운동 앱 스토리 맵|Fitness App Story Map', [['시작하기|Start', 2], ['운동하기|Work out', 2]], ['가입|Sign up', '목표 설정|Set a goal', '운동 고르기|Pick workout', '기록 보기|See stats'],
      [['MVP|MVP', '2027-05-03', '첫 운동 완료|First workout done'], ['릴리스 2|Release 2', '2027-08-02', '습관 만들기|Build the habit']], [
        [0, 0, '이메일 가입|E-mail sign-up', 'must', 2, 'done'], [0, 1, '세 문항 설문|Three questions', 'must', 2, 'doing'], [0, 2, '오늘의 운동|Workout of the day', 'must', 5, 'todo'], [0, 3, '이번 주 기록|This week', 'should', 3, 'todo'],
        [1, 0, '소셜 로그인|Social login', 'could', 3, 'todo'], [1, 2, '난이도 조정|Adjust difficulty', 'should', 5, 'todo'], [1, 3, '달성 배지|Badges', 'could', 2, 'todo'],
      ]);
    k.wireframe('운동 앱 화면|Fitness App Screens', [
      ['WFMobileFrame', '오늘|Today', 280, [
        ['WFText', '오늘의 운동|Workout of the day'], ['WFImage', '', {}, 120], ['WFProgress', ''], ['WFButton', '시작하기|Start', {}, 36],
        ['WFTabList', '', { items: '오늘,기록,설정|Today,Stats,Settings' }],
      ]],
      ['WFMobileFrame', '가입|Sign up', 280, [
        ['WFText', '목표를 알려 주세요|Tell us your goal'], ['WFRadio', '체중 감량|Lose weight', { checked: true }], ['WFRadio', '근력 향상|Build strength'], ['WFDropdown', '주 3회|3 times a week', { items: '주 2회,주 3회,주 5회|2 a week,3 a week,5 a week' }], ['WFSwitch', '알림 받기|Reminders', { checked: true }], ['WFButton', '다음|Next', {}, 36],
      ]],
    ]);
  }),

  sample('marketing-plan', 'plan', 'dgMindmap', '마케팅 캠페인 기획|Marketing Campaign', '마인드맵, 캠페인 타임라인, 랜딩 페이지 와이어프레임|A mind map, campaign timeline and a landing page wireframe', (k) => {
    k.mindmap('캠페인 아이디어|Campaign Ideas', '봄맞이 캠페인|Spring Campaign', [
      ['목표|Goals', ['신규 가입 5천 명|5,000 sign-ups', '재구매 20% 증가|20% more repeat buys']],
      ['고객|Audience', ['20~30대 직장인|Young professionals', '기존 회원|Existing members', '소개 받은 친구|Referred friends']],
      ['채널|Channels', ['SNS 광고|Social ads', '메일 소식지|Newsletter', '앱 푸시|App push']],
      ['콘텐츠|Content', ['후기 영상|Review videos', '블로그 글|Blog posts']],
      ['혜택|Offers', ['첫 구매 쿠폰|First-buy coupon', '친구 초대 포인트|Referral points']],
      ['측정|Measures', ['클릭률|Click-through rate', '전환율|Conversion rate']],
    ]);
    k.timeline('캠페인 일정|Campaign Timeline', '봄맞이 캠페인|Spring Campaign', ['2027-02-01', '2027-05-31', '2027'], [
      ['티저 공개|Teaser', '2027-02-15'], ['정식 시작|Launch', '2027-03-02'], ['중간 점검|Midpoint review', '2027-04-01'], ['종료|Closing', '2027-05-14'],
    ], [['준비|Preparation', '2027-02-01', '2027-02-26'], ['광고 집행|Ads running', '2027-03-02', '2027-05-14']]);
    k.wireframe('랜딩 페이지|Landing Page', [
      ['WFWebFrame', 'https://example.com/spring', 620, [
        [['WFIcon', 'logo', {}, 24], ['WFLink', '로그인|Sign in', {}, 24]],
        ['WFText', '봄맞이 첫 구매 20% 할인|Spring: 20% off your first order'], ['WFImage', '', {}, 150], ['WFDivider', '', {}, 10],
        [['WFInput', '이메일|E-mail'], ['WFButton', '쿠폰 받기|Get the coupon']],
        ['WFCheckbox', '소식 메일 받기|Send me news', { checked: true }],
      ]],
    ]);
  }),

  sample('rest-api', 'plan', 'dgJson', 'REST API 명세|REST API Specification', 'JSON 메시지, YAML 명세, 입력 정규식, 식별자 문법|JSON messages, a YAML spec, input patterns and an ID grammar', (k) => {
    k.documents('JSONDiagram', '회원 API 메시지|Member API Messages', [
      ['create', '회원 가입 요청|Sign-up request', JSON.stringify({ email: 'mina@example.com', name: 'Mina', marketing: true }, null, 2)],
      ['member', '회원 응답|Member response', JSON.stringify({ id: 'M-00042', email: 'mina@example.com', name: 'Mina', roles: ['user'], createdAt: '2026-11-01T09:00:00Z' }, null, 2)],
      ['error', '오류 응답|Error response', JSON.stringify({ status: 422, code: 'INVALID_EMAIL', message: 'Invalid e-mail', fields: ['email'] }, null, 2)],
    ], [['member', 'create', '만든다|creates']]);
    k.documents('YAMLDiagram', 'OpenAPI 명세|OpenAPI Spec', [
      ['api', 'openapi.yaml', 'openapi: 3.0.3\ninfo:\n  title: Member API\n  version: 1.0.0\npaths:\n  /members:\n    post:\n      summary: Sign up\n      responses:\n        "201":\n          description: Created\n        "422":\n          description: Invalid input'],
      ['gw', 'gateway.yaml', 'routes:\n  - path: /members\n    upstream: member-service:8080\n    rateLimit:\n      perMinute: 120\n    auth: bearer'],
    ], [['gw', 'api', '따른다|follows']]);
    k.regex('입력 검증|Input Checks', [['email', '이메일|E-mail', '^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$'], ['id', '회원 번호|Member ID', '^M-\\d{5}$'], ['date', '날짜|Date', '^\\d{4}-\\d{2}-\\d{2}$']]);
    k.ebnf('회원 번호 문법|Member ID Grammar', [['id', 'member id', '"M", "-", digit, digit, digit, digit, digit'], ['digit', 'digit', '"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"']], [['id', 'digit']]);
  }),

  sample('calc-language', 'plan', 'dgEbnf', '계산기 언어|Calculator Language', 'EBNF 문법, 토큰 정규식, 계산 순서도|EBNF grammar, token patterns and an evaluation flowchart', (k) => {
    k.ebnf('수식 문법|Expression Grammar', [
      ['expr', 'expression', 'term, { ( "+" | "-" ), term }'], ['term', 'term', 'factor, { ( "*" | "/" ), factor }'], ['factor', 'factor', 'number | "(", expression, ")"'], ['number', 'number', 'digit, { digit }, [ ".", digit, { digit } ]'], ['digit', 'digit', '"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"'],
    ], [['expr', 'term'], ['term', 'factor'], ['factor', 'number'], ['number', 'digit']]);
    k.regex('토큰|Tokens', [['number', '숫자|Number', '^\\d+(\\.\\d+)?$'], ['op', '연산자|Operator', '^[-+*/]$'], ['space', '공백|White space', '^\\s+$']]);
    k.flowchart('수식 계산|Evaluate an Expression', [
      ['s', 'FCTerminator', '시작|Start'], ['read', 'FCManualInput', '수식 입력|Enter expression'], ['tok', 'FCProcess', '토큰으로 나누기|Split into tokens'], ['d', 'FCDecision', '문법 맞음?|Valid?'], ['eval', 'FCPredefinedProcess', '값 계산|Evaluate'], ['show', 'FCDisplay', '결과 표시|Show result'], ['err', 'FCDisplay', '오류 표시|Show error'], ['e', 'FCTerminator', '끝|End'],
    ], [['s', 'read'], ['read', 'tok'], ['tok', 'd'], ['d', 'eval', '예|yes'], ['d', 'err', '아니오|no'], ['eval', 'show'], ['show', 'e'], ['err', 'e']],
    { grid: { s: [0, 0], read: [0, 1], tok: [0, 2], d: [0, 3], eval: [0, 4], show: [0, 5], e: [1, 6], err: [1, 3] }, gapX: 110, gapY: 40 });
  }),
];
