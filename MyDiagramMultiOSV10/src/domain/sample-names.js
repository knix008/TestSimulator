// The names of the sample drawings in samples/, by group: the start page lists
// them with these names, icons and one-line descriptions, and each drawing takes
// its title from here. Data only, so the start page does not pull the drawing
// builders (samples.js) into the app.
// A file in samples/ is named <item id>.<ko|en>.<mdg|mdgt|vsdx>.
// Every group and every sample has an icon of its own (test/unit/startpage-images.test.js).

import { EXTRA_ITEMS } from './sample-names-extra.js';

const item = (id, icon, ko, en, koDesc, enDesc) => ({ id, icon, name: { ko, en }, desc: { ko: koDesc, en: enDesc } });

export const SAMPLE_GROUPS = [
  { id: 'flow', icon: 'tplFlowchart', name: { ko: '순서도', en: 'Flowcharts' }, items: [
    item('online-shop', 'stBusiness', '온라인 쇼핑몰 운영', 'Online Shop Operations', '여러 페이지와 배경 페이지', 'Several pages and a background page'),
    item('order-flowchart', 'stFlowchart', '주문 처리 순서도', 'Order Flowchart', '재고 확인과 배송', 'Stock check and shipping'),
    item('login-flow', 'key', '로그인 순서도', 'Login Flow', '실패 횟수와 2단계 인증', 'Failed tries and two-factor'),
    item('atm-withdrawal', 'money', 'ATM 출금', 'ATM Withdrawal', 'PIN 확인부터 명세표까지', 'From PIN to receipt'),
    item('bug-triage', 'bug', '버그 처리 절차', 'Bug Triage', '재현·분류·수정', 'Reproduce, sort, fix'),
    item('hiring-process', 'user', '채용 프로세스', 'Hiring Process', '서류부터 입사까지', 'From CV to first day'),
    item('incident-response', 'warning', '장애 대응', 'Incident Response', '감지·조치·회고', 'Detect, fix, review'),
    item('password-reset', 'lock', '비밀번호 재설정', 'Password Reset', '메일 링크와 만료 확인', 'E-mail link and expiry'),
  ] },
  { id: 'bpmn', icon: 'stBpmn', name: { ko: 'BPMN', en: 'BPMN' }, items: [
    item('purchase-approval', 'check', '구매 승인', 'Purchase Approval', '병렬 게이트웨이와 수영 레인', 'Parallel gateway and lanes'),
    item('support-ticket', 'comment', '고객 문의 처리', 'Support Ticket', '메시지·타이머 이벤트', 'Message and timer events'),
    item('leave-request', 'calendar', '휴가 신청', 'Leave Request', '직원·팀장·인사팀', 'Employee, lead, HR'),
  ] },
  { id: 'uml', icon: 'tplUml', name: { ko: 'UML', en: 'UML' }, items: [
    item('library-class', 'stUml', '도서관 클래스', 'Library Classes', '클래스와 인터페이스', 'Classes and an interface'),
    item('atm-usecase', 'pointer', 'ATM 유스케이스', 'ATM Use Cases', '액터와 include', 'Actors and include'),
    item('login-sequence', 'list', '로그인 시퀀스', 'Login Sequence', '생명선 사이의 메시지', 'Messages between lifelines'),
    item('order-state', 'flag', '주문 상태', 'Order States', '상태와 전이', 'States and transitions'),
    item('checkout-activity', 'play', '결제 활동', 'Checkout Activity', '분기와 병렬 처리', 'Decision and fork'),
    item('web-deployment', 'server', '웹 서비스 배치', 'Web Deployment', '노드와 컴포넌트', 'Nodes and components'),
  ] },
  { id: 'db', icon: 'tplErd', name: { ko: '데이터베이스', en: 'Databases' }, items: [
    item('shop-database', 'database', '쇼핑몰 데이터베이스', 'Shop Database', '테이블과 관계', 'Tables and relations'),
    item('school-er', 'stErd', '학교 E-R 모델', 'School E-R Model', '개체·관계·속성', 'Entities, relations, attributes'),
    item('blog-database', 'notes', '블로그 데이터베이스', 'Blog Database', '까마귀 발 표기', 'Crow\'s foot notation'),
  ] },
  { id: 'network', icon: 'tplNetwork', name: { ko: '네트워크·IT', en: 'Network & IT' }, items: [
    item('office-network', 'stNetwork', '사무실 네트워크', 'Office Network', '서버·방화벽·스위치', 'Servers, firewall, switches'),
    item('home-network', 'home', '가정 네트워크', 'Home Network', '유선·무선 기기와 IP', 'Wired, wireless and IPs'),
    item('cloud-3tier', 'layers', '3계층 클라우드', 'Three-Tier Cloud', '웹·앱·데이터 계층', 'Web, app and data tiers'),
    item('branch-vpn', 'link', '본사·지사 VPN', 'Head Office & Branch VPN', '여러 거점 연결', 'Linking several sites'),
    item('cicd-pipeline', 'refresh', 'CI/CD 파이프라인', 'CI/CD Pipeline', '빌드·시험·배포', 'Build, test, deploy'),
  ] },
  { id: 'cloud', icon: 'stIcons', name: { ko: '클라우드·보안', en: 'Cloud & Security' }, items: [
    item('serverless-api', 'stCloud', '서버리스 API', 'Serverless API', '함수·큐·저장소', 'Functions, queue, storage'),
    item('zero-trust', 'stSecurity', '제로 트러스트 보안', 'Zero Trust Security', '인증·검사·보호 구역', 'Identity, checks, zones'),
  ] },
  { id: 'software', icon: 'diagram', name: { ko: '소프트웨어 구조', en: 'Software Architecture' }, items: [
    item('c4-context', 'stC4', 'C4 시스템 컨텍스트', 'C4 System Context', '사용자와 외부 시스템', 'People and outside systems'),
    item('order-dfd', 'stDfd', '주문 데이터 흐름도', 'Order Data Flow', '프로세스·저장소·외부 개체', 'Processes, stores, externals'),
  ] },
  { id: 'wireframe', icon: 'viewDrawing', name: { ko: '화면 설계', en: 'Wireframes' }, items: [
    item('login-wireframe', 'stWireframe', '로그인 화면', 'Login Screen', '웹 화면 와이어프레임', 'A web page wireframe'),
    item('mobile-shop-app', 'picture', '모바일 쇼핑 앱', 'Mobile Shop App', '화면 세 개와 이동', 'Three screens and the flow'),
  ] },
  { id: 'agile', icon: 'tplSwimlane', name: { ko: '애자일', en: 'Agile' }, items: [
    item('sprint-board', 'stAgile', '스프린트 보드', 'Sprint Board', '할 일·진행·완료', 'To do, doing, done'),
    item('scrum-cycle', 'tag', '스크럼 진행 과정', 'Scrum Cycle', '백로그부터 회고까지', 'From backlog to retro'),
  ] },
  { id: 'org', icon: 'tplOrg', name: { ko: '조직도', en: 'Org Charts' }, items: [
    item('company-org', 'stOrg', '회사 조직도', 'Company Organization', '부서와 직책', 'Departments and roles'),
    item('project-team', 'group', '프로젝트 팀', 'Project Team', '리더·팀원·공석', 'Leads, members, vacancy'),
  ] },
  { id: 'mind', icon: 'stMind', name: { ko: '마인드맵·전략', en: 'Mind Maps & Strategy' }, items: [
    item('brainstorm-template', 'bulb', '브레인스토밍', 'Brainstorming', '새 드로잉을 만드는 서식', 'A template for new drawings'),
    item('study-plan', 'stEducation', '학습 계획', 'Study Plan', '방사형 마인드맵', 'A radial mind map'),
    item('travel-plan', 'globe', '여행 계획', 'Travel Plan', '주제와 하위 주제', 'Topics and subtopics'),
    item('swot', 'stStrategy', 'SWOT 분석', 'SWOT Analysis', '강점·약점·기회·위협', 'Strengths to threats'),
    item('customer-journey', 'star', '고객 여정 지도', 'Customer Journey Map', '단계별 행동과 감정', 'Actions and feelings by stage'),
  ] },
  { id: 'floor', icon: 'tplFloor', name: { ko: '평면도', en: 'Floor Plans' }, items: [
    item('studio-apartment', 'stFloor', '원룸', 'Studio Apartment', '가구와 창문', 'Furniture and windows'),
    item('cafe-layout', 'stInterior', '카페 배치', 'Cafe Layout', '가구·메모 레이어', 'Furniture and note layers'),
    item('classroom', 'grid', '교실', 'Classroom', '책상 16개 배치', 'Sixteen desks'),
    item('small-office', 'container', '소규모 사무실', 'Small Office', '업무 공간과 회의실', 'Desks and a meeting room'),
  ] },
  { id: 'timeline', icon: 'tplTimeline', name: { ko: '타임라인', en: 'Timelines' }, items: [
    item('product-roadmap', 'stTimeline', '제품 로드맵', 'Product Roadmap', '분기별 이정표', 'Milestones by quarter'),
    item('event-schedule', 'clock', '행사 일정', 'Event Schedule', '시간대별 장소', 'Rooms by the hour'),
    item('project-gantt', 'hourglass', '프로젝트 간트 차트', 'Project Gantt Chart', '작업 기간과 오늘 표시', 'Task bars and today'),
  ] },
  { id: 'blocks', icon: 'tplBlock', name: { ko: '블록 다이어그램', en: 'Block Diagrams' }, items: [
    item('sales-funnel', 'filter', '판매 깔때기', 'Sales Funnel', '단계별 전환율', 'Conversion by stage'),
    item('pdca-cycle', 'stBlocks', 'PDCA 순환', 'PDCA Cycle', '계획·실행·평가·개선', 'Plan, do, check, act'),
  ] },
  { id: 'charts', icon: 'viewReports', name: { ko: '차트·대시보드', en: 'Charts & Dashboards' }, items: [
    item('sales-dashboard', 'stCharts', '매출 대시보드', 'Sales Dashboard', '지표·막대·원 차트', 'KPIs, bars and a pie'),
    item('survey-results', 'percent', '설문 결과', 'Survey Results', '응답 비율과 만족도', 'Answers and satisfaction'),
  ] },
  { id: 'electrical', icon: 'connectionPoints', name: { ko: '전기·논리 회로', en: 'Electrical & Logic' }, items: [
    item('lamp-circuit', 'stElectrical', '램프 회로', 'Lamp Circuit', '전지·스위치·램프', 'Battery, switch, lamp'),
    item('rc-filter', 'speed', 'RC 필터', 'RC Filter', '저역 통과 필터', 'A low-pass filter'),
    item('transistor-switch', 'plug', '트랜지스터 스위치', 'Transistor Switch', 'NPN으로 부하 켜기', 'Switching a load with NPN'),
    item('half-adder', 'stLogic', '반가산기', 'Half Adder', 'XOR·AND 게이트', 'XOR and AND gates'),
  ] },
  { id: 'industry', icon: 'position', name: { ko: '공정·제조', en: 'Process & Manufacturing' }, items: [
    item('water-treatment', 'drop', '정수 처리 공정', 'Water Treatment', 'P&ID 탱크·펌프·밸브', 'P&ID tanks, pumps, valves'),
    item('assembly-line', 'stFactory', '조립 라인', 'Assembly Line', '로봇·컨베이어·검사', 'Robots, conveyor, inspection'),
  ] },
  { id: 'life', icon: 'eye', name: { ko: '생활·의료·교육', en: 'Life, Health & Education' }, items: [
    item('family-tree', 'stGenogram', '가계도', 'Family Tree', '세 세대 가계도', 'Three generations'),
    item('hospital-admission', 'stMedical', '입원 절차', 'Hospital Admission', '접수부터 퇴원까지', 'From check-in to discharge'),
    item('course-curriculum', 'docText', '교육 과정', 'Course Curriculum', '학기별 과목과 선수 과목', 'Courses and prerequisites'),
  ] },
  { id: 'maps', icon: 'goTo', name: { ko: '지도·물류', en: 'Maps & Logistics' }, items: [
    item('delivery-route', 'stTransport', '배송 경로', 'Delivery Route', '물류 센터와 배송지', 'Depot and drop-offs'),
    item('campus-map', 'stMaps', '캠퍼스 지도', 'Campus Map', '건물·도로·주차장', 'Buildings, roads, parking'),
  ] },
];

// The samples built from specs (samples-extra.js) join their groups: at least 10 in every group.
for (const group of SAMPLE_GROUPS) group.items.push(...(EXTRA_ITEMS[group.id] ?? []));

/** The group and item of a sample file's stem, or null when it is not a known sample. */
export function sampleInfo(stem) {
  for (const group of SAMPLE_GROUPS) {
    const found = group.items.find((entry) => entry.id === stem);
    if (found) return { group, item: found };
  }
  return null;
}

// The web version has no installed files: its sample list uses these names, and the file is made
// when one is opened (the same names and contents as scripts/make-samples.mjs writes).
const WEB_PREFIX = 'web-sample:';
export const isWebSample = (path) => String(path ?? '').startsWith(WEB_PREFIX);

/** The sample "files" of both languages, as the desktop app lists them. */
export function webSamplePaths() {
  const stems = SAMPLE_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  const out = [];
  for (const language of ['ko', 'en']) {
    for (const stem of stems) out.push(`${WEB_PREFIX}${stem}.${language}.${stem === 'brainstorm-template' ? 'mdgt' : 'mdg'}`);
    out.push(`${WEB_PREFIX}online-shop.${language}.vsdx`);
  }
  return out.sort();
}

/** The content of a sample file, from its name. */
export function makeSampleFile(name, { SAMPLE_FILES }, { serialize, buildTemplate, exportVsdx }) {
  const [, stem, language, ext] = /^(.+)\.(ko|en)\.(mdg|mdgt|vsdx)$/.exec(name) ?? [];
  if (!stem) throw new Error(`Unknown sample: ${name}`);
  if (ext === 'mdgt') return serialize(buildTemplate('mindmap', { language }), { template: true });
  if (ext === 'vsdx') return exportVsdx(SAMPLE_FILES[stem](language));
  return serialize(SAMPLE_FILES[stem](language));
}
