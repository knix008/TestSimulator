// The names of the sample drawings in samples/, by group: the start page lists
// them with these names, and each drawing takes its title from here. Data only,
// so the start page does not pull the drawing builders (samples.js) into the app.
// A file in samples/ is named <item id>.<ko|en>.<mdg|mdgt|vsdx>.

const item = (id, ko, en) => ({ id, name: { ko, en } });

export const SAMPLE_GROUPS = [
  { id: 'flow', name: { ko: '순서도', en: 'Flowcharts' }, items: [
    item('online-shop', '온라인 쇼핑몰 운영', 'Online Shop Operations'),
    item('order-flowchart', '주문 처리 순서도', 'Order Flowchart'),
    item('login-flow', '로그인 순서도', 'Login Flow'),
    item('atm-withdrawal', 'ATM 출금', 'ATM Withdrawal'),
    item('bug-triage', '버그 처리 절차', 'Bug Triage'),
    item('hiring-process', '채용 프로세스', 'Hiring Process'),
    item('incident-response', '장애 대응', 'Incident Response'),
  ] },
  { id: 'bpmn', name: { ko: 'BPMN', en: 'BPMN' }, items: [
    item('purchase-approval', '구매 승인', 'Purchase Approval'),
    item('support-ticket', '고객 문의 처리', 'Support Ticket'),
  ] },
  { id: 'uml', name: { ko: 'UML', en: 'UML' }, items: [
    item('library-class', '도서관 클래스', 'Library Classes'),
    item('atm-usecase', 'ATM 유스케이스', 'ATM Use Cases'),
    item('login-sequence', '로그인 시퀀스', 'Login Sequence'),
    item('order-state', '주문 상태', 'Order States'),
    item('checkout-activity', '결제 활동', 'Checkout Activity'),
    item('web-deployment', '웹 서비스 배치', 'Web Deployment'),
  ] },
  { id: 'db', name: { ko: '데이터베이스', en: 'Databases' }, items: [
    item('shop-database', '쇼핑몰 데이터베이스', 'Shop Database'),
    item('school-er', '학교 E-R 모델', 'School E-R Model'),
    item('blog-database', '블로그 데이터베이스', 'Blog Database'),
  ] },
  { id: 'network', name: { ko: '네트워크·IT', en: 'Network & IT' }, items: [
    item('office-network', '사무실 네트워크', 'Office Network'),
    item('home-network', '가정 네트워크', 'Home Network'),
    item('cloud-3tier', '3계층 클라우드', 'Three-Tier Cloud'),
    item('branch-vpn', '본사·지사 VPN', 'Head Office & Branch VPN'),
    item('cicd-pipeline', 'CI/CD 파이프라인', 'CI/CD Pipeline'),
  ] },
  { id: 'org', name: { ko: '조직도', en: 'Org Charts' }, items: [
    item('company-org', '회사 조직도', 'Company Organization'),
    item('project-team', '프로젝트 팀', 'Project Team'),
  ] },
  { id: 'mind', name: { ko: '마인드맵·전략', en: 'Mind Maps & Strategy' }, items: [
    item('brainstorm-template', '브레인스토밍', 'Brainstorming'),
    item('study-plan', '학습 계획', 'Study Plan'),
    item('travel-plan', '여행 계획', 'Travel Plan'),
    item('swot', 'SWOT 분석', 'SWOT Analysis'),
  ] },
  { id: 'floor', name: { ko: '평면도', en: 'Floor Plans' }, items: [
    item('studio-apartment', '원룸', 'Studio Apartment'),
    item('cafe-layout', '카페 배치', 'Cafe Layout'),
    item('classroom', '교실', 'Classroom'),
  ] },
  { id: 'timeline', name: { ko: '타임라인', en: 'Timelines' }, items: [
    item('product-roadmap', '제품 로드맵', 'Product Roadmap'),
    item('event-schedule', '행사 일정', 'Event Schedule'),
  ] },
  { id: 'blocks', name: { ko: '블록 다이어그램', en: 'Block Diagrams' }, items: [
    item('sales-funnel', '판매 깔때기', 'Sales Funnel'),
    item('pdca-cycle', 'PDCA 순환', 'PDCA Cycle'),
  ] },
  { id: 'electrical', name: { ko: '전기 회로', en: 'Electrical' }, items: [
    item('lamp-circuit', '램프 회로', 'Lamp Circuit'),
    item('rc-filter', 'RC 필터', 'RC Filter'),
    item('transistor-switch', '트랜지스터 스위치', 'Transistor Switch'),
  ] },
];

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
