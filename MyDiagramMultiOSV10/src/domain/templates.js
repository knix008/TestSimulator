// Templates (File › New, start page) and the sample drawings. Each template
// opens the stencils that fit it in the Shapes panel and starts with a small
// example drawing (except the blank one). The samples (samples/*.mdg and the
// tutorial's drawing) are built here too, in Korean and English, with the same
// edit functions the app uses.
import { addLayer, addPage, addShape, createConnector, createDocument, createShape, groupShapes, normalizeData } from './diagram.js';
import { layoutPage } from './layout.js';

const L = (lang, ko, en) => (lang === 'en' ? en : ko);

/** A tiny drawing builder: add(master, x, y, text, extra) → shape; link(a, b, extra) → connector. */
function builder(page) {
  return {
    page,
    add(master, x, y, text = '', extra = {}) { return addShape(page, createShape(master, { x, y, text, ...extra })); },
    link(a, b, extra = {}) {
      const { fromPt = 'auto', toPt = 'auto', ...rest } = extra;
      return addShape(page, createConnector({ id: a.id, pt: fromPt }, { id: b.id, pt: toPt }, rest));
    },
  };
}

const data = (pairs) => normalizeData(Object.entries(pairs).map(([key, value]) => ({ key, label: key, value: String(value), type: typeof value === 'number' ? 'number' : 'text' })));

function newDoc(lang, title, design = 'office', paper = null) {
  const doc = createDocument({ title, language: lang, design, paper });
  return { doc, page: doc.pages[0], b: builder(doc.pages[0]) };
}

// ───────────────────────── template drawings

function basic(lang) {
  const { doc, b } = newDoc(lang, L(lang, '기본 다이어그램', 'Basic Diagram'));
  const a = b.add('roundRect', 120, 140, L(lang, '아이디어', 'Idea'), { qs: { color: 1 } });
  const c = b.add('ellipse', 380, 140, L(lang, '검토', 'Review'), { qs: { color: 2 } });
  const d = b.add('diamond', 640, 135, L(lang, '결정', 'Decide'), { qs: { color: 4 } });
  const e = b.add('star5', 880, 130, L(lang, '완성', 'Done'), { qs: { color: 6 } });
  b.link(a, c); b.link(c, d); b.link(d, e);
  b.add('title', 120, 40, L(lang, '기본 도형으로 그리기', 'Drawing with basic shapes'));
  b.add('note', 120, 300, L(lang, '왼쪽 도형 패널에서 도형을 끌어다 놓으세요.', 'Drag shapes from the Shapes panel on the left.'));
  return doc;
}

function flowchart(lang) {
  const { doc, b } = newDoc(lang, L(lang, '기본 순서도', 'Basic Flowchart'), 'linear');
  const start = b.add('terminator', 470, 40, L(lang, '시작', 'Start'), { qs: { color: 6 } });
  const input = b.add('data', 460, 140, L(lang, '주문 입력', 'Enter order'));
  const check = b.add('decision', 460, 250, L(lang, '재고 있음?', 'In stock?'), { qs: { color: 4 } });
  const ship = b.add('process', 460, 390, L(lang, '배송', 'Ship'));
  const order = b.add('process', 700, 260, L(lang, '재고 주문', 'Reorder stock'), { qs: { color: 2 } });
  const end = b.add('terminator', 470, 500, L(lang, '끝', 'End'), { qs: { color: 6 } });
  b.link(start, input); b.link(input, check);
  b.link(check, ship, { text: L(lang, '예', 'Yes'), fromPt: 2 });
  b.link(check, order, { text: L(lang, '아니요', 'No'), fromPt: 1 });
  b.link(order, input, { fromPt: 0, toPt: 1 });
  b.link(ship, end);
  return doc;
}

function crossFunctional(lang) {
  const { doc, b } = newDoc(lang, L(lang, '교차 기능 순서도', 'Cross-Functional Flowchart'), 'facet');
  const lanes = [L(lang, '고객', 'Customer'), L(lang, '영업', 'Sales'), L(lang, '물류', 'Warehouse')];
  lanes.forEach((name, i) => b.add('swimlane', 40, 40 + i * 160, name, { w: 960, h: 160, qs: { color: i + 1 } }));
  const s1 = b.add('terminator', 110, 85, L(lang, '주문', 'Order'));
  const s2 = b.add('process', 300, 245, L(lang, '주문 확인', 'Confirm order'));
  const s3 = b.add('decision', 520, 235, L(lang, '결제됨?', 'Paid?'));
  const s4 = b.add('process', 720, 405, L(lang, '포장·발송', 'Pack & ship'));
  const s5 = b.add('terminator', 760, 85, L(lang, '수령', 'Received'));
  b.link(s1, s2); b.link(s2, s3); b.link(s3, s4, { text: L(lang, '예', 'Yes') }); b.link(s4, s5);
  b.link(s3, s1, { text: L(lang, '아니요', 'No'), fromPt: 0 });
  return doc;
}

function orgChart(lang) {
  const { doc, page, b } = newDoc(lang, L(lang, '조직도', 'Organization Chart'), 'ion');
  const ceo = b.add('orgExecutive', 0, 0, L(lang, '김민준\n대표이사', 'Alex Kim\nCEO'), { data: data({ [L(lang, '부서', 'Department')]: L(lang, '경영', 'Management') }) });
  const heads = [[L(lang, '이서연\n개발 이사', 'Sara Lee\nCTO')], [L(lang, '박지훈\n영업 이사', 'James Park\nSales Director')], [L(lang, '최유나\n재무 이사', 'Yuna Choi\nCFO')]];
  const teams = [
    [L(lang, '정하은\n프론트엔드', 'Hana Jung\nFront-end'), L(lang, '강도윤\n백엔드', 'Daniel Kang\nBack-end')],
    [L(lang, '윤서준\n국내 영업', 'Sean Yoon\nDomestic'), L(lang, '임지아\n해외 영업', 'Jia Lim\nOverseas')],
    [L(lang, '한예린\n회계', 'Erin Han\nAccounting')],
  ];
  heads.forEach(([text], i) => {
    const head = b.add('orgManager', 0, 0, text);
    b.link(ceo, head, { style: { endArrow: 'none' } });
    for (const member of teams[i]) b.link(head, b.add('orgPosition', 0, 0, member), { style: { endArrow: 'none' } });
  });
  b.link(ceo, b.add('orgAssistant', 0, 0, L(lang, '비서실', 'Assistant')), { style: { endArrow: 'none' } });
  layoutPage(page, { kind: 'treeTB', spacing: 36, origin: { x: 60, y: 60 } });
  return doc;
}

function network(lang) {
  const { doc, b } = newDoc(lang, L(lang, '기본 네트워크 다이어그램', 'Basic Network Diagram'), 'slice');
  const internet = b.add('cloudNet', 470, 30, L(lang, '인터넷', 'Internet'));
  const fw = b.add('firewall', 490, 170, L(lang, '방화벽', 'Firewall'));
  const router = b.add('router', 490, 300, L(lang, '라우터', 'Router'));
  const sw = b.add('switch', 480, 420, L(lang, '코어 스위치', 'Core switch'));
  const servers = [L(lang, '웹 서버', 'Web server'), L(lang, '메일 서버', 'Mail server'), L(lang, 'DB 서버', 'DB server')];
  servers.forEach((name, i) => b.link(sw, b.add(i === 2 ? 'dbServer' : 'server', 140 + i * 130, 560, name, { data: data({ IP: `10.0.0.${10 + i}` }) }), { style: { endArrow: 'none' } }));
  const clients = [['desktop', L(lang, '사무실 PC', 'Office PC')], ['laptop', L(lang, '노트북', 'Laptop')], ['printer', L(lang, '프린터', 'Printer')]];
  clients.forEach(([m, name], i) => b.link(sw, b.add(m, 620 + i * 140, 560, name), { style: { endArrow: 'none' } }));
  b.link(internet, fw, { style: { endArrow: 'none' } }); b.link(fw, router, { style: { endArrow: 'none' } }); b.link(router, sw, { style: { endArrow: 'none' } });
  return doc;
}

function uml(lang) {
  const { doc, b } = newDoc(lang, L(lang, 'UML 클래스 다이어그램', 'UML Class Diagram'), 'integral');
  const person = b.add('umlClass', 380, 40, 'Person\n---\n- name: String\n- email: String\n---\n+ getName(): String', { w: 200, h: 140 });
  const student = b.add('umlClass', 180, 280, 'Student\n---\n- studentId: int\n---\n+ enroll(c: Course)', { w: 200, h: 130 });
  const teacher = b.add('umlClass', 580, 280, 'Teacher\n---\n- salary: double\n---\n+ teach(c: Course)', { w: 200, h: 130 });
  const course = b.add('umlClass', 380, 500, 'Course\n---\n- title: String\n- credits: int\n---\n+ open()', { w: 200, h: 140 });
  b.link(student, person, { style: { endArrow: 'triangleOpen' }, fromPt: 0, toPt: 2 });
  b.link(teacher, person, { style: { endArrow: 'triangleOpen' }, fromPt: 0, toPt: 2 });
  b.link(student, course, { text: '*', style: { endArrow: 'open' } });
  b.link(teacher, course, { text: '1..*', style: { endArrow: 'open' } });
  return doc;
}

function erd(lang) {
  const { doc, b } = newDoc(lang, L(lang, '데이터베이스 모델(ERD)', 'Database Model (ERD)'), 'sequence');
  const customer = b.add('entity', 80, 80, L(lang, '고객\n---\nPK 고객ID\n이름\n이메일', 'Customer\n---\nPK CustomerID\nName\nEmail'), { w: 190, h: 140 });
  const order = b.add('entity', 420, 80, L(lang, '주문\n---\nPK 주문ID\nFK 고객ID\n주문일', 'Order\n---\nPK OrderID\nFK CustomerID\nOrderDate'), { w: 190, h: 140 });
  const item = b.add('entity', 420, 330, L(lang, '주문 항목\n---\nPK 항목ID\nFK 주문ID\nFK 상품ID\n수량', 'Order Item\n---\nPK ItemID\nFK OrderID\nFK ProductID\nQuantity'), { w: 190, h: 160 });
  const product = b.add('entity', 760, 330, L(lang, '상품\n---\nPK 상품ID\n상품명\n가격', 'Product\n---\nPK ProductID\nName\nPrice'), { w: 190, h: 140 });
  b.link(customer, order, { style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } });
  b.link(order, item, { style: { startArrow: 'oneOnly', endArrow: 'oneMany' } });
  b.link(product, item, { style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } });
  return doc;
}

function bpmn(lang) {
  const { doc, b } = newDoc(lang, L(lang, 'BPMN 다이어그램', 'BPMN Diagram'), 'whisp');
  b.add('pool', 40, 60, L(lang, '휴가 신청', 'Leave request'), { w: 1000, h: 300 });
  const s = b.add('bpmnStart', 110, 120, L(lang, '신청', 'Request'));
  const t1 = b.add('bpmnTask', 200, 100, L(lang, '신청서 작성', 'Fill in form'));
  const g = b.add('gatewayExclusive', 400, 112, L(lang, '승인?', 'Approved?'));
  const t2 = b.add('bpmnTask', 520, 100, L(lang, '일정 반영', 'Update calendar'));
  const t3 = b.add('bpmnTask', 520, 240, L(lang, '반려 통보', 'Notify rejection'));
  const e = b.add('bpmnEnd', 740, 120, L(lang, '완료', 'Done'));
  b.link(s, t1); b.link(t1, g); b.link(g, t2, { text: L(lang, '예', 'Yes') }); b.link(g, t3, { text: L(lang, '아니요', 'No'), fromPt: 2 }); b.link(t2, e); b.link(t3, e);
  return doc;
}

function mindmap(lang) {
  const { doc, page, b } = newDoc(lang, L(lang, '마인드맵', 'Mind Map'), 'bubble');
  const center = b.add('centralTopic', 0, 0, L(lang, '신제품 출시', 'Product launch'));
  const topics = [[L(lang, '시장 조사', 'Research'), [L(lang, '경쟁사', 'Competitors'), L(lang, '고객 인터뷰', 'Interviews')]], [L(lang, '디자인', 'Design'), [L(lang, '시안', 'Mockups'), L(lang, '테스트', 'Testing')]], [L(lang, '마케팅', 'Marketing'), [L(lang, 'SNS', 'Social'), L(lang, '광고', 'Ads')]], [L(lang, '판매', 'Sales'), [L(lang, '온라인', 'Online'), L(lang, '매장', 'Stores')]]];
  topics.forEach(([name, subs], i) => {
    const topic = b.add('mainTopic', 0, 0, name, { qs: { color: i + 1 } });
    b.link(center, topic, { route: 'curved', style: { endArrow: 'none', lineWidth: 3 } });
    for (const sub of subs) b.link(topic, b.add('subTopic', 0, 0, sub, { qs: { color: i + 1, variant: 'subtle' } }), { route: 'curved', style: { endArrow: 'none' } });
  });
  layoutPage(page, { kind: 'radial', spacing: 30, origin: { x: 60, y: 40 } });
  return doc;
}

function floorplan(lang) {
  const { doc, b } = newDoc(lang, L(lang, '사무실 평면도', 'Office Floor Plan'), 'monochrome');
  b.add('room', 60, 60, '', { w: 900, h: 560 });
  b.add('wall', 480, 60, '', { w: 12, h: 300 });
  b.add('door', 500, 280, '', { w: 70, h: 70 });
  b.add('window', 160, 54, '', { w: 160, h: 12 });
  b.add('window', 660, 54, '', { w: 160, h: 12 });
  b.add('tableRect', 140, 170, L(lang, '회의 테이블', 'Meeting table'), { w: 220, h: 100 });
  for (let i = 0; i < 3; i++) { b.add('chair', 150 + i * 75, 120, ''); b.add('chair', 150 + i * 75, 290, '', { angle: 180 }); }
  for (let i = 0; i < 4; i++) b.add('desk', 560 + (i % 2) * 190, 140 + Math.floor(i / 2) * 140, L(lang, `책상 ${i + 1}`, `Desk ${i + 1}`));
  b.add('sofa', 120, 480, L(lang, '라운지', 'Lounge'));
  b.add('plant', 860, 520, '');
  b.add('title', 60, 10, L(lang, '3층 사무실', 'Third floor office'), { w: 400 });
  return doc;
}

function timeline(lang) {
  const { doc, b } = newDoc(lang, L(lang, '프로젝트 타임라인', 'Project Timeline'), 'radiance');
  b.add('timelineBar', 80, 260, L(lang, '2026년', '2026'), { w: 880 });
  const marks = [[L(lang, '착수', 'Kick-off'), 120], [L(lang, '설계 완료', 'Design done'), 330], [L(lang, '베타', 'Beta'), 560], [L(lang, '출시', 'Launch'), 820]];
  marks.forEach(([name, x], i) => b.add('milestoneMarker', x, i % 2 ? 280 : 180, name, { h: 80 }));
  b.add('intervalBlock', 140, 330, L(lang, '요구 분석', 'Analysis'), { w: 190 });
  b.add('intervalBlock', 350, 330, L(lang, '개발', 'Development'), { w: 300 });
  b.add('intervalBlock', 670, 330, L(lang, '테스트', 'Testing'), { w: 150 });
  return doc;
}

function blockDiagram(lang) {
  const { doc, b } = newDoc(lang, L(lang, '블록 다이어그램', 'Block Diagram'), 'retrospect');
  const input = b.add('block3d', 80, 200, L(lang, '입력', 'Input'));
  const proc = b.add('block3d', 330, 200, L(lang, '처리', 'Processing'), { qs: { color: 2 } });
  const store = b.add('layers', 330, 380, L(lang, '저장', 'Storage'), { qs: { color: 3 } });
  const out = b.add('block3d', 580, 200, L(lang, '출력', 'Output'), { qs: { color: 4 } });
  b.link(input, proc, { route: 'straight', style: { lineWidth: 3 } }); b.link(proc, out, { route: 'straight', style: { lineWidth: 3 } }); b.link(proc, store, { style: { startArrow: 'arrow' } });
  return doc;
}

export const TEMPLATES = [
  { id: 'blank', icon: 'tplBlank', stencils: ['basic', 'arrows', 'callouts'], name: { ko: '빈 드로잉', en: 'Blank Drawing' }, description: { ko: '빈 페이지에서 시작합니다', en: 'Start from an empty page' }, build: (lang) => createDocument({ title: L(lang, '드로잉', 'Drawing'), language: lang }) },
  { id: 'basic', icon: 'tplBasic', stencils: ['basic', 'arrows', 'callouts'], name: { ko: '기본 다이어그램', en: 'Basic Diagram' }, description: { ko: '도형·화살표·설명선', en: 'Shapes, arrows, callouts' }, build: basic },
  { id: 'flowchart', icon: 'tplFlowchart', stencils: ['flowchart', 'arrows', 'callouts'], name: { ko: '기본 순서도', en: 'Basic Flowchart' }, description: { ko: '프로세스·판단·문서', en: 'Processes, decisions, documents' }, build: flowchart },
  { id: 'crossFunctional', icon: 'tplSwimlane', stencils: ['containers', 'flowchart'], name: { ko: '교차 기능 순서도', en: 'Cross-Functional Flowchart' }, description: { ko: '부서별 스윔레인', en: 'Swimlanes per department' }, build: crossFunctional },
  { id: 'orgChart', icon: 'tplOrg', stencils: ['org', 'basic'], name: { ko: '조직도', en: 'Organization Chart' }, description: { ko: '직위와 보고 관계', en: 'Positions and reporting lines' }, build: orgChart },
  { id: 'network', icon: 'tplNetwork', stencils: ['network', 'basic'], name: { ko: '네트워크 다이어그램', en: 'Network Diagram' }, description: { ko: '서버·라우터·PC', en: 'Servers, routers, PCs' }, build: network },
  { id: 'uml', icon: 'tplUml', stencils: ['uml', 'callouts'], name: { ko: 'UML 클래스', en: 'UML Class' }, description: { ko: '클래스·상속·연관', en: 'Classes, inheritance, associations' }, build: uml },
  { id: 'erd', icon: 'tplErd', stencils: ['erd', 'callouts'], name: { ko: '데이터베이스 모델', en: 'Database Model' }, description: { ko: '엔터티와 관계(ERD)', en: 'Entities and relationships (ERD)' }, build: erd },
  { id: 'bpmn', icon: 'tplBpmn', stencils: ['bpmn', 'containers'], name: { ko: 'BPMN 다이어그램', en: 'BPMN Diagram' }, description: { ko: '이벤트·작업·게이트웨이', en: 'Events, tasks, gateways' }, build: bpmn },
  { id: 'mindmap', icon: 'tplMind', stencils: ['mind', 'basic'], name: { ko: '마인드맵', en: 'Mind Map' }, description: { ko: '아이디어 정리·브레인스토밍', en: 'Ideas and brainstorming' }, build: mindmap },
  { id: 'floorplan', icon: 'tplFloor', stencils: ['floor', 'basic'], name: { ko: '평면도', en: 'Floor Plan' }, description: { ko: '벽·문·가구 배치', en: 'Walls, doors, furniture' }, build: floorplan },
  { id: 'timeline', icon: 'tplTimeline', stencils: ['timeline', 'callouts'], name: { ko: '타임라인', en: 'Timeline' }, description: { ko: '마일스톤과 기간', en: 'Milestones and intervals' }, build: timeline },
  { id: 'blockDiagram', icon: 'tplBlock', stencils: ['blocks', 'arrows'], name: { ko: '블록 다이어그램', en: 'Block Diagram' }, description: { ko: '시스템 구성 블록', en: 'System building blocks' }, build: blockDiagram },
];

export const templateById = (id) => TEMPLATES.find((tpl) => tpl.id === id) ?? TEMPLATES[0];

/** A new drawing from a template (the stencils to open are on doc.stencils for the Shapes panel). */
export function buildTemplate(id, { language = 'ko' } = {}) {
  const tpl = templateById(id);
  const doc = tpl.build(language);
  doc.stencils = [...tpl.stencils];
  return doc;
}

// ───────────────────────── the sample drawing (tutorial, start page)

/**
 * A drawing with several pages that uses most features: a cross-functional
 * flowchart with data, an org chart, a network, a background page with a
 * title block and fields, layers, comments, hyperlinks and a group.
 */
export function buildSample(lang = 'ko') {
  const doc = createDocument({ title: L(lang, '온라인 쇼핑몰 운영', 'Online shop operations'), language: lang, design: 'office' });
  doc.author = 'SHKWON';
  doc.company = 'MyDiagram';
  doc.subject = L(lang, 'MyDiagram 예제 드로잉', 'MyDiagram sample drawing');
  doc.stencils = ['flowchart', 'containers', 'org', 'network', 'basic', 'callouts'];
  const process = doc.pages[0];
  process.name = L(lang, '주문 처리', 'Order process');
  // Background page with a title block.
  const bg = addPage(doc, { name: L(lang, '배경', 'Background'), background: true });
  const bb = builder(bg);
  bb.add('rect', 20, 20, '', { w: process.width - 40, h: process.height - 40, style: { fill: 'none', line: '#94a3b8', lineWidth: 1 } });
  bb.add('rect', process.width - 360, process.height - 90, `{title}\n{pageName} · {page}/{pages} · {date}`, { w: 340, h: 70, style: { fill: '#f8fafc', line: '#94a3b8', fontSize: 11, textColor: '#334155' } });
  process.backgroundId = bg.id;
  // Page 1: cross-functional flowchart with data.
  const b = builder(process);
  const lanes = [L(lang, '고객', 'Customer'), L(lang, '쇼핑몰', 'Shop'), L(lang, '물류 센터', 'Warehouse')];
  lanes.forEach((name, i) => b.add('swimlane', 40, 70 + i * 165, name, { w: 1020, h: 165, qs: { color: [1, 5, 6][i] } }));
  b.add('title', 40, 18, L(lang, '주문 처리 흐름', 'Order handling flow'), { w: 420 });
  const order = b.add('terminator', 110, 120, L(lang, '주문하기', 'Place order'), { data: data({ [L(lang, '담당', 'Owner')]: L(lang, '고객', 'Customer') }) });
  const pay = b.add('data', 290, 115, L(lang, '결제 정보', 'Payment details'));
  const check = b.add('decision', 300, 270, L(lang, '결제 승인?', 'Payment OK?'), { qs: { color: 4 }, data: data({ [L(lang, '시간(분)', 'Minutes')]: 2 }) });
  const confirm = b.add('process', 530, 280, L(lang, '주문 확정', 'Confirm order'), { data: data({ [L(lang, '시간(분)', 'Minutes')]: 5, [L(lang, '비용', 'Cost')]: 1200 }) });
  const notify = b.add('document', 760, 275, L(lang, '확인 메일', 'Confirmation e-mail'));
  const pick = b.add('process', 530, 440, L(lang, '상품 포장', 'Pick & pack'), { data: data({ [L(lang, '시간(분)', 'Minutes')]: 30, [L(lang, '비용', 'Cost')]: 3500 }) });
  const ship = b.add('process', 760, 440, L(lang, '택배 발송', 'Ship parcel'), { data: data({ [L(lang, '시간(분)', 'Minutes')]: 15, [L(lang, '비용', 'Cost')]: 3000 }) });
  const done = b.add('terminator', 900, 120, L(lang, '수령', 'Delivered'));
  b.link(order, pay); b.link(pay, check);
  b.link(check, confirm, { text: L(lang, '예', 'Yes') });
  b.link(check, order, { text: L(lang, '아니요', 'No'), fromPt: 3, toPt: 2 });
  b.link(confirm, notify); b.link(confirm, pick); b.link(pick, ship); b.link(ship, done);
  b.link(notify, done, { style: { dash: 'dash', endArrow: 'open' } });
  confirm.comments = [{ id: 'cmt-sample', author: 'SHKWON', text: L(lang, '재고 확인 단계를 추가할지 검토', 'Consider adding a stock check here'), at: new Date().toISOString(), done: false }];
  confirm.hyperlink = 'https://www.example.com/orders';
  const notes = addLayer(process, L(lang, '메모', 'Notes'));
  const tip = b.add('note', 880, 520, L(lang, '배송은 평균 1~2일', 'Delivery takes 1–2 days'), { w: 170, h: 90, layers: [notes.id] });
  void tip;
  // Page 2: org chart.
  const org = addPage(doc, { name: L(lang, '조직도', 'Organization') });
  org.backgroundId = bg.id;
  const ob = builder(org);
  const ceo = ob.add('orgExecutive', 0, 0, L(lang, '김민준\n대표', 'Alex Kim\nCEO'));
  const groups = [[L(lang, '이서연\n운영 팀장', 'Sara Lee\nOperations'), [L(lang, '정하은\nCS 담당', 'Hana Jung\nSupport'), L(lang, '강도윤\n물류 담당', 'Daniel Kang\nLogistics')]], [L(lang, '박지훈\n마케팅 팀장', 'James Park\nMarketing'), [L(lang, '윤서준\n콘텐츠', 'Sean Yoon\nContent'), L(lang, '임지아\n광고', 'Jia Lim\nAds')]], [L(lang, '최유나\n개발 팀장', 'Yuna Choi\nDevelopment'), [L(lang, '한예린\n웹 개발', 'Erin Han\nWeb')]]];
  for (const [head, members] of groups) {
    const h = ob.add('orgManager', 0, 0, head);
    ob.link(ceo, h, { style: { endArrow: 'none' } });
    for (const m of members) ob.link(h, ob.add('orgPosition', 0, 0, m), { style: { endArrow: 'none' } });
  }
  layoutPage(org, { kind: 'treeTB', spacing: 34, origin: { x: 80, y: 80 } });
  // Page 3: network with a group.
  const net = addPage(doc, { name: L(lang, '서버 구성', 'Servers') });
  net.backgroundId = bg.id;
  const nb = builder(net);
  const cloud = nb.add('cloudNet', 470, 60, L(lang, '인터넷', 'Internet'));
  const fw = nb.add('firewall', 490, 200, L(lang, '방화벽', 'Firewall'));
  const lb = nb.add('router', 490, 320, L(lang, '부하 분산기', 'Load balancer'));
  const web1 = nb.add('server', 330, 450, L(lang, '웹 1', 'Web 1'), { data: data({ IP: '10.0.1.11' }) });
  const web2 = nb.add('server', 440, 450, L(lang, '웹 2', 'Web 2'), { data: data({ IP: '10.0.1.12' }) });
  const db = nb.add('dbServer', 640, 450, L(lang, '데이터베이스', 'Database'), { data: data({ IP: '10.0.2.20' }) });
  nb.link(cloud, fw, { style: { endArrow: 'none' } }); nb.link(fw, lb, { style: { endArrow: 'none' } });
  nb.link(lb, web1, { style: { endArrow: 'none' } }); nb.link(lb, web2, { style: { endArrow: 'none' } });
  nb.link(web1, db, { style: { dash: 'dash' } }); nb.link(web2, db, { style: { dash: 'dash' } });
  groupShapes(net, [web1.id, web2.id]);
  // Keep the background page last.
  doc.pages = [process, org, net, bg];
  return doc;
}

/** The samples written to samples/ (scripts/make-samples.mjs): file name stem → builder. */
export const SAMPLE_FILES = {
  'online-shop': (lang) => buildSample(lang),
  'order-flowchart': (lang) => buildTemplate('flowchart', { language: lang }),
  'company-org': (lang) => buildTemplate('orgChart', { language: lang }),
  'office-network': (lang) => buildTemplate('network', { language: lang }),
  'shop-database': (lang) => buildTemplate('erd', { language: lang }),
};
