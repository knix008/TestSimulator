// The Online Shop sample diagrams of the PlantUML / Enterprise Architect kinds:
// the launch schedule (Gantt chart), its work breakdown (WBS) and the year's
// milestones (timeline), the order handling layered view (ArchiMate 3), the
// shop network (nwdiag style), the order API messages (JSON), the deployment
// configuration (YAML), the order number grammar (EBNF) and the input checks
// (regular expressions), and the shop's user story map and customer journey. Built with the normal editing functions, Korean and
// English. Used by buildSample (templates.js).
import { addDiagram, addElement, showElement } from './model.js';
import { createEdge, createNode } from './edit.js';
import { toolById } from './toolbox.js';
import { TYPES, VIEW_ONLY } from './meta.js';

/** A small drawing helper: nodes and lines by key. */
function painter(project, diagram, language) {
  const views = new Map();
  const tool = (id) => toolById(diagram._type, id) ?? { id, type: id, kind: TYPES[id]?.edge || VIEW_ONLY[id]?.edge ? 'edge' : 'node', attrs: {} };
  return {
    node(key, toolId, x, y, attrs = {}, size = {}, viewProps = null) {
      const t = tool(toolId);
      const { element, view } = createNode(project, diagram, { ...t, attrs: { ...t.attrs, ...attrs } }, { x, y, w: size.w ?? 0, h: size.h ?? 0 }, { language });
      if (viewProps) Object.assign(view, viewProps);
      views.set(key, { element, view });
      return element;
    },
    show(key, element, x, y, size = {}) { const view = showElement(project, diagram, element._id, { x, y }, size); views.set(key, { element, view }); return view; },
    edge(toolId, a, b, attrs = {}, extra = {}) {
      const t = tool(toolId);
      const { element, view } = createEdge(project, diagram, { ...t, attrs: { ...t.attrs, ...attrs } }, views.get(a).view, views.get(b).view, { language });
      if (extra.points) view.points = extra.points;
      if (extra.style) view.lineStyle = extra.style;
      return element;
    },
    note(text, x, y, w = 0, h = 0) { const { view } = createNode(project, diagram, tool('UMLNoteView'), { x, y, w, h }, { language }); view.text = text; return view; },
  };
}

// ───────────────────────── project planning

function buildGantt(s, plan) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, plan._id, 'GanttDiagram', { language, name: T('쇼핑몰 오픈 일정', 'Shop Launch Schedule') });
  const p = painter(project, diagram, language);
  p.node('cal', 'GanttCalendar', 20, 20, { name: T('2026년 하반기', 'Second half of 2026'), start: '2026-09-01', dayWidth: 18, closedDays: 'saturday,sunday', closedDates: '2026-09-24 to 2026-09-25, 2026-10-09' });
  const row = (i) => 64 + i * 28;
  const rows = [
    ['sep1', 'GanttSeparator', { name: T('기획', 'Planning') }],
    ['req', 'GanttTask', { name: T('요구사항 정리', 'Requirements'), start: '2026-09-01', duration: 5, completion: 100, resources: 'PM' }],
    ['ux', 'GanttTask', { name: T('화면 설계', 'UX design'), duration: 6, completion: 100, resources: T('디자이너', 'Designer') }],
    ['signoff', 'GanttMilestone', { name: T('설계 승인', 'Design sign-off') }],
    ['sep2', 'GanttSeparator', { name: T('개발', 'Build') }],
    ['api', 'GanttTask', { name: T('주문 API', 'Order API'), duration: 10, completion: 60, resources: 'Alice, Bob:50%' }],
    ['web', 'GanttTask', { name: T('웹 화면', 'Web front end'), duration: 9, completion: 40, resources: 'Carol' }],
    ['pay', 'GanttTask', { name: T('결제 연동', 'Payment integration'), duration: 4, resources: 'Bob' }],
    ['sep3', 'GanttSeparator', { name: T('출시', 'Launch') }],
    ['test', 'GanttTask', { name: T('통합 테스트', 'Integration test'), duration: 5, resources: 'QA' }],
    ['live', 'GanttMilestone', { name: T('정식 오픈', 'Go live') }],
  ];
  rows.forEach(([key, toolId, attrs], i) => p.node(key, toolId, 230, row(i), attrs));
  for (const [a, b] of [['req', 'ux'], ['ux', 'signoff'], ['signoff', 'api'], ['signoff', 'web'], ['api', 'pay'], ['pay', 'test'], ['web', 'test'], ['test', 'live']]) p.edge('GanttDependency', a, b);
}

function buildWbs(s, plan) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, plan._id, 'WBSDiagram', { language, name: T('쇼핑몰 작업 분해', 'Shop Work Breakdown') });
  const p = painter(project, diagram, language);
  const root = p.node('root', 'WBSNode', 345, 20, { name: T('온라인 쇼핑몰 구축', 'Online Shop Build') }, { w: 200, h: 40 });
  const tree = [
    [T('기획', 'Planning'), [T('요구사항', 'Requirements'), T('일정과 예산', 'Schedule & budget')]],
    [T('설계', 'Design'), [T('화면 설계', 'UX design'), T('데이터 모델', 'Data model'), T('아키텍처', 'Architecture')]],
    [T('개발', 'Build'), [T('웹 화면', 'Web front end'), T('주문 API', 'Order API'), T('결제 연동', 'Payments')]],
    [T('출시', 'Launch'), [T('통합 테스트', 'Testing'), T('마케팅', 'Marketing'), T('정식 오픈', 'Go live')]],
  ];
  const colW = 230; const levelW = 160; const leafW = 150;
  tree.forEach(([name, leaves], i) => {
    const x = 20 + i * colW;
    const item = addElement(project, root._id, 'WBSNode', { name, code: `${i + 1}` });
    p.show(`l${i}`, item, x, 110, { w: levelW, h: 34 });
    p.edge('wbsBranch', 'root', `l${i}`, {}, { points: [{ x: 445, y: 85 }, { x: x + levelW / 2, y: 85 }] });
    leaves.forEach((leaf, j) => {
      const y = 175 + j * 50;
      const child = addElement(project, item._id, 'WBSNode', { name: leaf, code: `${i + 1}.${j + 1}` });
      p.show(`l${i}_${j}`, child, x + 26, y, { w: leafW, h: 30 });
      p.edge('wbsBranch', `l${i}`, `l${i}_${j}`, {}, { points: [{ x: x + 12, y: y + 15 }] });
    });
  });
  void root;
}

function buildTimeline(s, plan) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, plan._id, 'TimelineDiagram', { language, name: T('2026년 쇼핑몰 연혁', 'Shop Year 2026') });
  const p = painter(project, diagram, language);
  p.node('axis', 'TLTimeline', 20, 40, { name: '2026', start: '2026-01-01', end: '2026-12-31', dayWidth: 3 });
  const row = (i) => 84 + i * 34;
  // The events in date order on top (their links step down to the right), the periods below.
  const items = [
    ['kick', 'TLEvent', { name: T('킥오프', 'Kick-off'), date: '2026-01-05' }],
    ['seed', 'TLEvent', { name: T('투자 유치', 'Seed funding'), date: '2026-02-16' }],
    ['beta', 'TLEvent', { name: T('베타 오픈', 'Beta launch'), date: '2026-09-01' }],
    ['open', 'TLEvent', { name: T('그랜드 오픈', 'Grand opening'), date: '2026-11-02' }],
    ['bf', 'TLEvent', { name: T('블랙 프라이데이', 'Black Friday'), date: '2026-11-27' }],
    ['planning', 'TLPeriod', { name: T('기획 기간', 'Planning phase'), start: '2026-01-05', end: '2026-02-27' }],
    ['dev', 'TLPeriod', { name: T('개발 기간', 'Development'), start: '2026-03-02', end: '2026-08-28' }],
    ['betaRun', 'TLPeriod', { name: T('베타 운영', 'Beta'), start: '2026-09-01', end: '2026-10-30' }],
    ['marketing', 'TLPeriod', { name: T('오픈 마케팅', 'Launch marketing'), start: '2026-10-15', end: '2026-12-31' }],
  ];
  items.forEach(([key, toolId, attrs], i) => p.node(key, toolId, 20, row(i), attrs));
  for (const [a, b] of [['kick', 'seed'], ['seed', 'beta'], ['beta', 'open'], ['open', 'bf']]) p.edge('TLLink', a, b);
}

// ───────────────────────── ArchiMate

function buildArchimate(s) {
  const { project, language, T } = s;
  const model = addElement(project, project._id, 'ArchiMateModel', { name: T('엔터프라이즈 아키텍처', 'Enterprise Architecture') });
  const diagram = addDiagram(project, model._id, 'ArchiMateDiagram', { language, name: T('주문 처리 계층 뷰', 'Order Handling Layered View') });
  const p = painter(project, diagram, language);
  const el = (key, kind, x, y, ko, en) => p.node(key, `archimate:${kind}`, x, y, { name: T(ko, en) }, { w: 150, h: 60 });
  // Motivation, strategy, implementation
  el('driver', 'motivation-driver', 40, 20, '고객 편의', 'Customer convenience');
  el('goal', 'motivation-goal', 240, 20, '온라인 매출 증대', 'Grow online sales');
  el('capability', 'strategy-capability', 440, 20, '온라인 판매', 'Online sales');
  el('project', 'implementation-work-package', 640, 20, '쇼핑몰 오픈 프로젝트', 'Shop launch project');
  // Business layer
  p.node('business', 'ArchiMateGrouping', 20, 110, { name: T('비즈니스', 'Business') }, { w: 820, h: 215 });
  el('customer', 'business-actor', 40, 150, '고객', 'Customer');
  el('service', 'business-service', 240, 150, '주문 서비스', 'Ordering service');
  el('product', 'business-product', 440, 150, '쇼핑 상품', 'Shopping offer');
  el('received', 'business-event', 40, 235, '주문 접수', 'Order received');
  el('process', 'business-process', 240, 235, '주문 처리', 'Order handling');
  el('clerk', 'business-role', 440, 235, '주문 담당자', 'Order clerk');
  el('order', 'business-object', 640, 235, '주문', 'Order');
  // Application layer
  el('webshop', 'application-component', 40, 350, '웹 쇼핑몰', 'Web shop');
  el('oms', 'application-component', 240, 350, '주문 관리', 'Order management');
  el('api', 'application-service', 440, 350, '주문 API', 'Order API');
  el('mobile', 'application-component', 40, 440, '모바일 앱', 'Mobile app');
  el('data', 'application-data-object', 640, 440, '주문 데이터', 'Order data');
  // Technology layer
  el('phone', 'technology-device', 40, 530, '고객 휴대폰', 'Customer phone');
  el('server', 'technology-node', 240, 530, '앱 서버', 'App server');
  el('lan', 'technology-communication-network', 440, 530, '데이터센터 망', 'Data centre LAN');
  el('db', 'technology-system-software', 240, 620, 'PostgreSQL', 'PostgreSQL');
  const r = (type, a, b, attrs = {}, points = null) => { const rel = p.edge(type, a, b, attrs, points ? { points } : {}); return rel; };
  r('ArchiMateInfluence', 'driver', 'goal', { strength: '+' });
  r('ArchiMateRealization', 'capability', 'goal');
  r('ArchiMateRealization', 'project', 'capability');
  r('ArchiMateServing', 'service', 'customer');
  r('ArchiMateAssignment', 'clerk', 'process');
  r('ArchiMateTriggering', 'received', 'process');
  r('ArchiMateRealization', 'process', 'service');
  r('ArchiMateAggregation', 'product', 'service');
  r('ArchiMateAccess', 'process', 'order', { accessType: 'write' }, [{ x: 270, y: 312 }, { x: 612, y: 312 }, { x: 612, y: 265 }]);
  r('ArchiMateServing', 'api', 'process');
  r('ArchiMateRealization', 'oms', 'api');
  r('ArchiMateFlow', 'webshop', 'oms', { name: T('주문', 'orders') });
  r('ArchiMateSpecialization', 'mobile', 'webshop');
  r('ArchiMateAccess', 'oms', 'data', { accessType: 'readwrite' }, [{ x: 330, y: 470 }]);
  r('ArchiMateRealization', 'data', 'order');
  r('ArchiMateServing', 'server', 'oms');
  r('ArchiMateComposition', 'server', 'db');
  r('ArchiMateAssociation', 'lan', 'server');
  r('ArchiMateServing', 'phone', 'mobile');
}

// ───────────────────────── network

function buildNetwork(s) {
  const { project, language, T } = s;
  const model = addElement(project, project._id, 'NWModel', { name: T('네트워크', 'Network') });
  const diagram = addDiagram(project, model._id, 'NetworkDiagram', { language, name: T('쇼핑몰 네트워크', 'Shop Network') });
  const p = painter(project, diagram, language);
  p.node('web', 'NWGroup', 210, 185, { name: T('웹 서버', 'Web servers'), description: T('부하 분산', 'load balanced') }, { w: 330, h: 108 });
  p.node('internet', 'nwnode:cloud', 60, 20, { name: T('인터넷', 'Internet') });
  p.node('fw', 'nwnode:firewall', 340, 20, { name: 'fw01', description: T('방화벽', 'Firewall') });
  p.node('dmz', 'NWNetwork', 40, 120, { name: 'dmz', address: '210.10.0.0/24' }, { w: 760 });
  p.node('web01', 'NWNode', 230, 228, { name: 'web01', description: 'nginx + shop' });
  p.node('web02', 'NWNode', 400, 228, { name: 'web02', description: 'nginx + shop' });
  p.node('mail', 'NWNode', 600, 228, { name: 'mail01', description: T('메일 발송', 'Mailer') });
  p.node('internal', 'NWNetwork', 40, 340, { name: 'internal', address: '172.16.0.0/24' }, { w: 760 });
  p.node('db', 'nwnode:database', 130, 420, { name: 'db01', description: 'PostgreSQL' });
  p.node('cache', 'nwnode:storage', 290, 420, { name: 'cache01', description: 'Redis' });
  p.node('batch', 'NWNode', 450, 420, { name: 'batch01', description: T('정산 배치', 'Settlement') });
  p.node('admin', 'nwnode:laptop', 610, 420, { name: 'admin', description: T('운영자 PC', 'Operator') });
  const c = (a, b, address) => p.edge('NWConnection', a, b, { address });
  c('internet', 'fw', '');
  c('fw', 'dmz', '210.10.0.1');
  c('web01', 'dmz', '210.10.0.11');
  c('web02', 'dmz', '210.10.0.12');
  c('mail', 'dmz', '210.10.0.25');
  c('web01', 'internal', '172.16.0.11');
  c('web02', 'internal', '172.16.0.12');
  c('db', 'internal', '172.16.0.50');
  c('cache', 'internal', '172.16.0.60');
  c('batch', 'internal', '172.16.0.70');
  c('admin', 'internal', '172.16.0.200');
}

// ───────────────────────── agile & UX (Visual Paradigm): user story map, customer journey map

const STORY_COL = 170;
const STORY_X = 160;

/** The shop's story map: activities and steps across the top, stories in release bands below. */
function buildStoryMap(s, model) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, model._id, 'UserStoryMapDiagram', { language, name: T('쇼핑몰 사용자 스토리 맵', 'Shop User Story Map') });
  const p = painter(project, diagram, language);
  const releases = [[T('MVP (1차 오픈)', 'MVP (first launch)'), '2026-11-02', T('주문부터 배송 조회까지', 'Order to delivery tracking')], [T('릴리스 2', 'Release 2'), '2027-02-01', T('편의 기능', 'Convenience')]];
  releases.forEach(([name, date, goal], i) => p.node(`rel${i}`, 'USRelease', 20, 180 + i * 130, { name, date, goal }, { w: STORY_X - 20 + 5 * STORY_COL + 10, h: 120 }));
  const activities = [[T('상품 찾기', 'Find products'), 0, 2], [T('주문하기', 'Order'), 2, 2], [T('받기', 'Receive'), 4, 1]];
  activities.forEach(([name, col, span], i) => p.node(`act${i}`, 'USActivity', STORY_X + col * STORY_COL, 20, { name }, { w: span * STORY_COL - 20, h: 64 }));
  const steps = [T('검색', 'Search'), T('상품 보기', 'View product'), T('장바구니', 'Cart'), T('결제', 'Pay'), T('배송 조회', 'Track delivery')];
  steps.forEach((name, i) => p.node(`step${i}`, 'USStep', STORY_X + i * STORY_COL, 100, { name }, { w: STORY_COL - 20, h: 56 }));
  const stories = [
    [0, 0, T('키워드로 상품 검색', 'Search by keyword'), 'must', 3, 'done'], [0, 1, T('상품 상세 보기', 'See product details'), 'must', 2, 'done'],
    [0, 2, T('장바구니에 담기', 'Add to cart'), 'must', 3, 'doing'], [0, 3, T('카드로 결제', 'Pay by card'), 'must', 5, 'todo'],
    [0, 4, T('주문 상태 보기', 'See order status'), 'should', 2, 'todo'],
    [1, 0, T('필터와 정렬', 'Filter and sort'), 'should', 3, 'todo'], [1, 1, T('구매 후기 보기', 'Read reviews'), 'could', 3, 'todo'],
    [1, 3, T('간편 결제', 'One-click payment'), 'should', 5, 'todo'], [1, 4, T('배송 알림 받기', 'Delivery notifications'), 'could', 2, 'todo'],
  ];
  stories.forEach(([release, col, name, priority, storyPoints, status], i) => p.node(`story${i}`, 'USStory', STORY_X + col * STORY_COL, 194 + release * 130, {
    name, priority, storyPoints, status, asA: T('고객', 'a customer'), iWant: name,
  }, { w: STORY_COL - 20, h: 92 }));
  p.edge('USDependency', 'story3', 'story2', { name: T('필요', 'needs') });
}

const JOURNEY_COL = 230;
const JOURNEY_X = 240;
/** A row's name: what its kind is called. */
const laneName = (T, kind) => ({ actions: T('고객 행동', 'Actions'), touchpoints: T('터치포인트', 'Touchpoints'), thoughts: T('생각', 'Thoughts'), emotions: T('감정', 'Emotions'), painPoints: T('고통 지점', 'Pain points'), opportunities: T('기회', 'Opportunities') })[kind];
const JOURNEY_LANES = [['actions', 150, 90], ['touchpoints', 250, 70], ['emotions', 330, 110], ['painPoints', 450, 90], ['opportunities', 550, 90]];

/** The shop's customer journey: a persona, five stages, and the rows of what happens in each. */
function buildJourney(s, model) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, model._id, 'CustomerJourneyDiagram', { language, name: T('쇼핑몰 고객 여정 지도', 'Shop Customer Journey Map') });
  const p = painter(project, diagram, language);
  const stages = [[T('인지', 'Awareness'), T('광고를 봄', 'Sees an ad')], [T('탐색', 'Consideration'), T('비교해 봄', 'Compares')], [T('구매', 'Purchase'), T('주문함', 'Orders')], [T('배송', 'Delivery'), T('기다림', 'Waits')], [T('재구매', 'Loyalty'), T('다시 찾음', 'Comes back')]];
  const width = JOURNEY_X - 20 + stages.length * JOURNEY_COL;
  stages.forEach(([name, goal], i) => p.node(`stage${i}`, 'CJStage', JOURNEY_X + i * JOURNEY_COL, 10, { name, goal }, { w: JOURNEY_COL - 10, h: 640 }));
  JOURNEY_LANES.forEach(([laneKind, y, h]) => p.node(`lane-${laneKind}`, 'CJLane', 20, y, { laneKind, name: laneName(T, laneKind) }, { w: width, h }));
  p.node('persona', 'CJPersona', 20, 10, { name: T('김지은', 'Jamie Kim'), role: T('30대 직장인, 모바일 쇼핑', 'Office worker, shops on mobile'), goals: T('빠르고 믿을 수 있는 쇼핑', 'Quick, trustworthy shopping'), frustrations: T('긴 결제 과정', 'Long checkout') }, { w: 200, h: 130 });
  const x = (i) => JOURNEY_X + i * JOURNEY_COL + 30;
  const actions = [T('SNS 광고를 봄', 'Sees a social ad'), T('상품과 후기를 비교', 'Compares products and reviews'), T('장바구니에서 결제', 'Checks out from the cart'), T('배송 상태를 확인', 'Checks the delivery'), T('쿠폰으로 다시 주문', 'Orders again with a coupon')];
  actions.forEach((name, i) => p.node(`a${i}`, 'CJCard', x(i), 165, { name, cardKind: 'action' }, { w: 160, h: 60 }));
  const touch = [['social', 'Instagram'], ['web', T('쇼핑몰 웹', 'Shop website')], ['mobile', T('모바일 앱', 'Mobile app')], ['email', T('배송 메일', 'Delivery email')], ['mobile', T('앱 푸시', 'App push')]];
  touch.forEach(([channel, name], i) => p.node(`t${i}`, 'CJTouchpoint', x(i), 265, { name, channel }, { w: 160, h: 40 }));
  const feelings = [['positive', T('호기심', 'Curious')], ['neutral', T('고민', 'Unsure')], ['negative', T('결제가 길다', 'Checkout is long')], ['veryPositive', T('빨리 옴!', 'Fast!')], ['positive', T('만족', 'Satisfied')]];
  feelings.forEach(([score, name], i) => p.node(`e${i}`, 'CJEmotion', x(i) + 63, 368 - { veryNegative: -2, negative: -1, neutral: 0, positive: 1, veryPositive: 2 }[score] * 20, { name, score }, { w: 34, h: 34 }));
  for (let i = 0; i < feelings.length - 1; i++) p.edge('CJEmotionLink', `e${i}`, `e${i + 1}`);
  const pains = [T('광고가 너무 많음', 'Too many ads'), T('후기를 믿기 어려움', 'Hard to trust reviews'), T('입력할 것이 많음', 'Too many fields'), '', T('쿠폰 찾기 어려움', 'Coupons are hard to find')];
  pains.forEach((name, i) => { if (name) p.node(`p${i}`, 'cjcard:painPoint', x(i), 465, { name }, { w: 160, h: 60 }); });
  const ideas = [T('관심사 맞춤 광고', 'Targeted ads'), T('구매 인증 후기', 'Verified reviews'), T('간편 결제 도입', 'Offer one-click payment'), T('실시간 배송 지도', 'Live delivery map'), T('재구매 쿠폰 자동 적용', 'Auto-applied coupons')];
  ideas.forEach((name, i) => p.node(`o${i}`, 'cjcard:opportunity', x(i), 565, { name }, { w: 160, h: 60 }));
}

/** The agile & UX samples of the Online Shop. */
function buildAgile(s) {
  const model = addElement(s.project, s.project._id, 'UXModel', { name: s.T('애자일·UX', 'Agile & UX') });
  buildStoryMap(s, model);
  buildJourney(s, model);
}

// ───────────────────────── data views

const ORDER_JSON = (T) => JSON.stringify({
  orderId: 'ORD-20260901-0042', customer: { id: 7, name: T('김민지', 'Minji Kim'), vip: true },
  items: [{ sku: 'BK-UML', title: T('UML 입문', 'UML Distilled'), qty: 2, price: 24000 }, { sku: 'CF-DRIP', title: T('커피 원두', 'Coffee beans'), qty: 1, price: 20000 }],
  shipping: { method: 'express', address: T('서울시 강남구 테헤란로 1', '1 Main Street, Seoul') }, coupon: null, total: 68000,
}, null, 2);
const PAYMENT_JSON = JSON.stringify({ paymentId: 'PAY-88123', orderId: 'ORD-20260901-0042', amount: 68000, currency: 'KRW', method: 'card', approved: true, approvedAt: '2026-09-01T10:42:00+09:00' }, null, 2);
const SHIPPING_JSON = JSON.stringify({ event: 'shipment.dispatched', orderId: 'ORD-20260901-0042', carrier: 'CJ', trackingNo: '6409-2210-7731', parcels: [{ weightKg: 1.2, items: ['BK-UML', 'BK-UML'] }, { weightKg: 0.5, items: ['CF-DRIP'] }] }, null, 2);

function buildData(s) {
  const { project, language, T } = s;
  const spec = addElement(project, project._id, 'DSSpecification', { name: T('데이터 명세', 'Data Specifications') });
  // JSON
  const json = addDiagram(project, spec._id, 'JSONDiagram', { language, name: T('주문 API 메시지', 'Order API Messages') });
  const j = painter(project, json, language);
  j.node('order', 'jsonDocument', 20, 20, { name: T('주문 요청 (POST /orders)', 'Order request (POST /orders)'), text: ORDER_JSON(T) });
  j.node('payment', 'jsonDocument', 440, 20, { name: T('결제 응답', 'Payment response'), text: PAYMENT_JSON });
  j.node('shipping', 'jsonDocument', 440, 260, { name: T('배송 이벤트', 'Shipping event'), text: SHIPPING_JSON });
  j.edge('DSReference', 'order', 'payment', { name: 'orderId' });
  j.edge('DSReference', 'shipping', 'order', { name: 'orderId' });
  // YAML
  const yaml = addDiagram(project, spec._id, 'YAMLDiagram', { language, name: T('배포 설정', 'Deployment Configuration') });
  const y = painter(project, yaml, language);
  y.node('app', 'yamlDocument', 20, 20, { name: 'application.yaml', text: 'server:\n  port: 8080\nspring:\n  datasource:\n    url: jdbc:postgresql://db01:5432/shop\n    username: shop\n  cache:\n    type: redis\nshop:\n  currency: KRW\n  free-shipping-over: 50000\n  payment:\n    provider: toss\n    timeout-seconds: 30' });
  y.node('deploy', 'yamlDocument', 500, 20, { name: 'deployment.yaml', text: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: shop-web\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n        - name: shop\n          image: registry.example.com/shop:1.4.2\n          ports:\n            - containerPort: 8080\n          envFrom:\n            - configMapRef:\n                name: shop-config' });
  y.node('ci', 'yamlDocument', 20, 360, { name: '.github/workflows/deploy.yaml', text: 'name: deploy\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ./gradlew test bootJar\n      - run: kubectl apply -f deployment.yaml' });
  y.edge('DSReference', 'deploy', 'app', { name: T('설정으로 읽는다', 'mounts as config') });
  y.edge('DSReference', 'ci', 'deploy', { name: T('배포한다', 'applies') });
  // EBNF
  const ebnf = addDiagram(project, spec._id, 'EBNFDiagram', { language, name: T('주문 번호 문법', 'Order Number Grammar') });
  const e = painter(project, ebnf, language);
  e.node('id', 'EBNFRule', 20, 20, { name: 'order id', expression: '"ORD", "-", date, "-", serial, [ "-", check letter ]' });
  e.node('date', 'EBNFRule', 20, 150, { name: 'date', expression: '4 * digit, month, day' });
  e.node('serial', 'EBNFRule', 560, 150, { name: 'serial', expression: 'digit, digit, digit, digit, { digit }' });
  e.node('check', 'EBNFRule', 380, 150, { name: 'check letter', expression: '"A" | "B" | "C" | "X"' });
  e.node('digit', 'EBNFRule', 560, 300, { name: 'digit', expression: '"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"' });
  for (const [a, b] of [['id', 'date'], ['id', 'serial'], ['id', 'check'], ['serial', 'digit']]) e.edge('DSReference', a, b, { name: T('사용', 'uses') });
  e.edge('DSReference', 'date', 'digit', { name: T('사용', 'uses') }, { points: [{ x: 150, y: 470 }] });
  // Regular expressions
  const regex = addDiagram(project, spec._id, 'RegexDiagram', { language, name: T('입력 검증 정규식', 'Input Validation') });
  const x = painter(project, regex, language);
  x.node('email', 'RegexPattern', 20, 20, { name: T('이메일', 'E-mail'), pattern: '^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$' });
  x.node('domain', 'RegexPattern', 20, 190, { name: T('도메인', 'Domain'), pattern: '[\\w-]+(\\.[\\w-]+)+' });
  x.node('phone', 'RegexPattern', 760, 20, { name: T('휴대폰 번호', 'Mobile number'), pattern: '^01[016789]-\\d{3,4}-\\d{4}$' });
  x.node('coupon', 'RegexPattern', 760, 190, { name: T('쿠폰 코드', 'Coupon code'), pattern: '^[A-Z]{3}-\\d{4}(-[A-Z])?$' });
  x.node('zip', 'RegexPattern', 760, 360, { name: T('우편번호', 'Postal code'), pattern: '^\\d{5}$' });
  x.edge('DSReference', 'email', 'domain', { name: T('도메인 부분', 'domain part') });
}

/** Adds the sample diagrams of these kinds to the Online Shop project. */
export function buildMoreSamples(s) {
  const { project, T } = s;
  const plan = addElement(project, project._id, 'PMPlan', { name: T('쇼핑몰 오픈 프로젝트', 'Shop Launch Project'), start: '2026-09-01' });
  buildGantt(s, plan);
  buildWbs(s, plan);
  buildTimeline(s, plan);
  buildArchimate(s);
  buildNetwork(s);
  buildData(s);
  buildAgile(s);
}

/** The small new-project templates of these kinds (buildTemplate in templates.js). */
export function buildMoreTemplate(id, project, diagram, language) {
  const T = (ko, en) => (language === 'ko' ? ko : en);
  const p = painter(project, diagram, language);
  switch (id) {
    case 'gantt': {
      p.node('cal', 'GanttCalendar', 20, 20, { name: T('일정', 'Schedule'), start: '2026-03-02', dayWidth: 22 });
      p.node('a', 'GanttTask', 230, 64, { name: T('설계', 'Design'), duration: 5, completion: 100 });
      p.node('b', 'GanttTask', 230, 92, { name: T('구현', 'Build'), duration: 8, completion: 30, resources: T('개발팀', 'Developers') });
      p.node('c', 'GanttTask', 230, 120, { name: T('시험', 'Test'), duration: 4 });
      p.node('m', 'GanttMilestone', 230, 148, { name: T('출시', 'Release') });
      for (const [a, b] of [['a', 'b'], ['b', 'c'], ['c', 'm']]) p.edge('GanttDependency', a, b);
      break;
    }
    case 'wbs': {
      const root = p.node('root', 'WBSNode', 205, 20, { name: T('프로젝트', 'Project') }, { w: 200, h: 40 });
      [T('계획', 'Plan'), T('구현', 'Build'), T('출시', 'Release')].forEach((name, i) => {
        const x = 20 + i * 200;
        p.show(`c${i}`, addElement(project, root._id, 'WBSNode', { name, code: `${i + 1}` }), x, 110, { w: 160, h: 34 });
        p.edge('wbsBranch', 'root', `c${i}`, {}, { points: [{ x: 305, y: 85 }, { x: x + 80, y: 85 }] });
      });
      break;
    }
    case 'archimate': {
      const el = (key, kind, x, y, ko, en) => p.node(key, `archimate:${kind}`, x, y, { name: T(ko, en) }, { w: 150, h: 60 });
      el('actor', 'business-actor', 20, 20, '고객', 'Customer');
      el('service', 'business-service', 220, 20, '서비스', 'Service');
      el('process', 'business-process', 220, 120, '업무 처리', 'Process');
      el('app', 'application-component', 220, 220, '애플리케이션', 'Application');
      p.edge('ArchiMateServing', 'service', 'actor');
      p.edge('ArchiMateRealization', 'process', 'service');
      p.edge('ArchiMateServing', 'app', 'process');
      break;
    }
    case 'network': {
      p.node('net', 'NWNetwork', 20, 100, { name: 'lan', address: '192.168.0.0/24' }, { w: 460 });
      p.node('web', 'NWNode', 60, 20, { name: 'web01' });
      p.node('db', 'nwnode:database', 260, 180, { name: 'db01' });
      p.edge('NWConnection', 'web', 'net', { address: '192.168.0.10' });
      p.edge('NWConnection', 'db', 'net', { address: '192.168.0.20' });
      break;
    }
    case 'storymap': {
      p.node('rel', 'USRelease', 20, 170, { name: 'MVP', goal: T('첫 출시', 'First release') }, { w: 670, h: 120 });
      p.node('act', 'USActivity', 160, 20, { name: T('주문하기', 'Order') }, { w: 320, h: 64 });
      p.node('s1', 'USStep', 160, 96, { name: T('장바구니', 'Cart') }, { w: 150, h: 56 });
      p.node('s2', 'USStep', 330, 96, { name: T('결제', 'Pay') }, { w: 150, h: 56 });
      p.node('st1', 'USStory', 160, 184, { name: T('장바구니에 담기', 'Add to cart'), priority: 'must', storyPoints: 3 }, { w: 150, h: 92 });
      p.node('st2', 'USStory', 330, 184, { name: T('카드로 결제', 'Pay by card'), priority: 'must', storyPoints: 5 }, { w: 150, h: 92 });
      p.node('st3', 'USStory', 500, 184, { name: T('주문 확인 메일', 'Order email'), priority: 'should', storyPoints: 2 }, { w: 150, h: 92 });
      break;
    }
    case 'journey': {
      [[T('탐색', 'Explore'), 0], [T('구매', 'Buy'), 1], [T('사용', 'Use'), 2]].forEach(([name, i]) => p.node(`s${i}`, 'CJStage', 160 + i * 220, 10, { name }, { w: 210, h: 360 }));
      [['actions', 60, 90], ['emotions', 160, 100], ['painPoints', 270, 90]].forEach(([laneKind, y, h]) => p.node(laneKind, 'CJLane', 20, y, { laneKind, name: laneName(T, laneKind) }, { w: 800, h }));
      [T('상품을 비교', 'Compares'), T('주문함', 'Orders'), T('상품을 씀', 'Uses it')].forEach((name, i) => p.node(`a${i}`, 'CJCard', 190 + i * 220, 75, { name, cardKind: 'action' }, { w: 150, h: 60 }));
      [['neutral', 0, T('고민', 'Unsure')], ['negative', 1, T('불편', 'Annoyed')], ['positive', 2, T('만족', 'Happy')]].forEach(([score, i, name]) => p.node(`e${i}`, 'CJEmotion', 248 + i * 220, 193 - { negative: -1, neutral: 0, positive: 1 }[score] * 20, { score, name }, { w: 34, h: 34 }));
      p.edge('CJEmotionLink', 'e0', 'e1'); p.edge('CJEmotionLink', 'e1', 'e2');
      p.node('pain', 'cjcard:painPoint', 410, 285, { name: T('결제가 복잡함', 'Checkout is complex') }, { w: 150, h: 60 });
      p.node('persona', 'CJPersona', 20, 380, { name: T('고객', 'Customer'), role: T('처음 방문', 'First visit') }, { w: 200, h: 90 });
      break;
    }
    default: break;
  }
}
