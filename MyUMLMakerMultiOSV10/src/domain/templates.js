// New-project templates (one per kind of diagram) and the sample project
// "Online Shop" (class, use case, sequence, communication, state machine,
// activity, component, deployment, package, object, ER, flowchart, BPMN, C4,
// mind map diagrams) in Korean and English. Everything is built with the
// normal editing functions, so the samples are exactly what a user could draw.
import { addDiagram, addElement, allDiagrams, createProject, ref, showElement } from './model.js';
import { createEdge, createNode } from './edit.js';
import { toolById } from './toolbox.js';
import { TYPES } from './meta.js';

/** id, diagram type, icon */
export const TEMPLATES = [
  ['blank', 'UMLClassDiagram', 'fileNew'], ['classModel', 'UMLClassDiagram', 'dgClass'], ['useCase', 'UMLUseCaseDiagram', 'dgUseCase'], ['sequence', 'UMLSequenceDiagram', 'dgSequence'],
  ['stateMachine', 'UMLStatechartDiagram', 'dgState'], ['activity', 'UMLActivityDiagram', 'dgActivity'], ['component', 'UMLComponentDiagram', 'dgComponent'], ['deployment', 'UMLDeploymentDiagram', 'dgDeployment'],
  ['erd', 'ERDDiagram', 'dgErd'], ['flowchart', 'FCFlowchartDiagram', 'dgFlowchart'], ['dfd', 'DFDDiagram', 'dgDfd'], ['sysml', 'SysMLRequirementDiagram', 'dgRequirement'],
  ['bpmn', 'BPMNDiagram', 'dgBpmn'], ['c4', 'C4Diagram', 'dgC4'], ['mindmap', 'MMMindmapDiagram', 'dgMindmap'], ['wireframe', 'WFWireframeDiagram', 'dgWireframe'], ['aws', 'AWSDiagram', 'dgAws'],
];

const L = (language, ko, en) => (language === 'ko' ? ko : en);

/** A small drawing helper bound to one diagram. */
function painter(project, diagram, language) {
  const views = new Map();
  const tool = (id) => { const found = toolById(diagram._type, id) ?? (TYPES[id] || id.endsWith('View') ? { id, type: id, kind: TYPES[id]?.edge ? 'edge' : 'node', attrs: {} } : null); if (!found) throw new Error(`unknown tool ${id}`); return found; };
  return {
    views,
    node(key, toolId, x, y, attrs = {}, size = {}) {
      const t = tool(toolId);
      const { element, view } = createNode(project, diagram, { ...t, attrs: { ...t.attrs, ...attrs } }, { x, y, w: size.w ?? 0, h: size.h ?? 0 }, { language, boxes: boxesOf(views) });
      views.set(key, { element, view, box: { x, y, w: size.w ?? 160, h: size.h ?? 80 } });
      return element;
    },
    edge(toolId, a, b, attrs = {}, extra = {}) {
      const t = tool(toolId);
      const { element, view } = createEdge(project, diagram, { ...t, attrs: { ...t.attrs, ...attrs } }, views.get(a).view, views.get(b).view, { language, y: extra.y ?? null });
      if (extra.points) view.points = extra.points;
      return element;
    },
    show(key, element, x, y) { const view = showElement(project, diagram, element._id, { x, y }); views.set(key, { element, view, box: { x, y, w: 120, h: 40 } }); return view; },
    note(text, x, y, w = 0, h = 0) { return createNode(project, diagram, tool('UMLNoteView'), { x, y, w, h }, { language }).view.text = text; },
  };
}
function boxesOf(views) { return new Map([...views.values()].map(({ view, box }) => [view._id, box])); }
const member = (project, owner, type, attrs) => addElement(project, owner._id, type, attrs);
const op = (project, owner, name, params = [], ret = '', extra = {}) => {
  const o = member(project, owner, 'UMLOperation', { name, ...extra });
  for (const [n, type] of params) member(project, o, 'UMLParameter', { name: n, type });
  if (ret) member(project, o, 'UMLParameter', { name: '', type: ret, direction: 'return' });
  return o;
};

/** A new project from a template. */
export function buildTemplate(id, { language = 'ko' } = {}) {
  const entry = TEMPLATES.find(([key]) => key === id) ?? TEMPLATES[0];
  const name = L(language, '새 프로젝트', 'New Project');
  if (id === 'blank') return createProject({ name, language });
  const project = createProject({ name, language, diagram: null });
  const model = project.ownedElements[0];
  const diagram = addDiagram(project, model._id, entry[1], { language, defaultDiagram: true });
  const p = painter(project, diagram, language);
  switch (id) {
    case 'classModel': {
      const person = p.node('person', 'UMLClass', 60, 60, { name: L(language, '사람', 'Person'), isAbstract: true });
      member(project, person, 'UMLAttribute', { name: 'name', type: 'String', visibility: 'private' });
      op(project, person, 'getName', [], 'String');
      const student = p.node('student', 'UMLClass', 60, 260, { name: L(language, '학생', 'Student') });
      member(project, student, 'UMLAttribute', { name: 'studentId', type: 'int', visibility: 'private' });
      const course = p.node('course', 'UMLClass', 360, 260, { name: L(language, '과목', 'Course') });
      member(project, course, 'UMLAttribute', { name: 'title', type: 'String', visibility: 'private' });
      p.edge('UMLGeneralization', 'student', 'person');
      p.edge('UMLAssociation', 'student', 'course', { end1: { multiplicity: '0..*' }, end2: { multiplicity: '1..*', name: 'courses' } });
      break;
    }
    case 'useCase': {
      p.node('subject', 'UMLUseCaseSubject', 240, 40, { name: L(language, '시스템', 'System') }, { w: 280, h: 300 });
      p.node('actor', 'UMLActor', 60, 150, { name: L(language, '사용자', 'User') });
      p.node('uc1', 'UMLUseCase', 290, 90, { name: L(language, '로그인', 'Log in') });
      p.node('uc2', 'UMLUseCase', 290, 220, { name: L(language, '정보 조회', 'View Info') });
      p.edge('UMLAssociation', 'actor', 'uc1');
      p.edge('UMLAssociation', 'actor', 'uc2');
      p.edge('UMLInclude', 'uc2', 'uc1');
      break;
    }
    case 'sequence': {
      p.node('a', 'UMLLifeline', 40, 30, { name: L(language, '클라이언트', 'client') });
      p.node('b', 'UMLLifeline', 260, 30, { name: L(language, '서버', 'server') });
      const m1 = p.edge('message:synchCall', 'a', 'b', {}, { y: 110 }); m1.name = 'request';
      p.edge('message:reply', 'b', 'a', {}, { y: 160 }).name = 'response';
      break;
    }
    case 'stateMachine': {
      p.node('i', 'pseudo:initial', 60, 90);
      p.node('s1', 'UMLState', 140, 70, { name: L(language, '대기', 'Idle') });
      p.node('s2', 'UMLState', 340, 70, { name: L(language, '실행 중', 'Running'), doActivity: 'work()' });
      p.node('f', 'UMLFinalState', 540, 87);
      p.edge('UMLTransition', 'i', 's1');
      p.edge('UMLTransition', 's1', 's2', { triggers: 'start' });
      p.edge('UMLTransition', 's2', 's1', { triggers: 'stop' }, { points: [{ x: 290, y: 160 }] });
      p.edge('UMLTransition', 's2', 'f', { triggers: 'quit' });
      break;
    }
    case 'activity': {
      p.node('i', 'UMLInitialNode', 150, 30);
      p.node('a1', 'UMLAction', 100, 90, { name: L(language, '주문 받기', 'Receive Order') });
      p.node('d', 'UMLDecisionNode', 145, 180);
      p.node('a2', 'UMLAction', 20, 260, { name: L(language, '주문 처리', 'Process Order') });
      p.node('a3', 'UMLAction', 200, 260, { name: L(language, '주문 거절', 'Reject Order') });
      p.node('f', 'UMLActivityFinalNode', 147, 360);
      p.edge('UMLControlFlow', 'i', 'a1'); p.edge('UMLControlFlow', 'a1', 'd');
      p.edge('UMLControlFlow', 'd', 'a2', { guard: L(language, '승인', 'accepted') }); p.edge('UMLControlFlow', 'd', 'a3', { guard: L(language, '거절', 'rejected') });
      p.edge('UMLControlFlow', 'a2', 'f'); p.edge('UMLControlFlow', 'a3', 'f');
      break;
    }
    case 'component': {
      p.node('web', 'UMLComponent', 60, 60, { name: 'WebApp' });
      p.node('api', 'UMLInterface', 330, 70, { name: 'IOrderService' });
      p.node('svc', 'UMLComponent', 300, 200, { name: 'OrderService' });
      p.edge('UMLUsage', 'web', 'api'); p.edge('UMLInterfaceRealization', 'svc', 'api');
      break;
    }
    case 'deployment': {
      p.node('client', 'UMLDevice', 40, 60, { name: 'PC' }, { w: 160, h: 100 });
      p.node('server', 'UMLNode', 300, 40, { name: L(language, '앱 서버', 'App Server') }, { w: 220, h: 140 });
      p.node('war', 'UMLArtifact', 330, 90, { name: 'shop.war' });
      p.edge('UMLCommunicationPath', 'client', 'server', { name: 'HTTPS' });
      break;
    }
    case 'erd': {
      const customer = p.node('c', 'ERDEntity', 60, 60, { name: 'customer' });
      member(project, customer, 'ERDColumn', { name: 'name', type: 'VARCHAR', length: '100' });
      const order = p.node('o', 'ERDEntity', 360, 60, { name: 'orders' });
      member(project, order, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', foreignKey: true, referenceTo: ref(customer.columns[0]) });
      member(project, order, 'ERDColumn', { name: 'ordered_at', type: 'TIMESTAMP' });
      p.edge('erd:1:0..*', 'c', 'o');
      break;
    }
    case 'flowchart': {
      p.node('s', 'FCTerminator', 100, 30, { name: L(language, '시작', 'Start') });
      p.node('p', 'FCProcess', 100, 120, { name: L(language, '입력 읽기', 'Read Input') });
      p.node('d', 'FCDecision', 95, 210, { name: L(language, '올바른가?', 'Valid?') });
      p.node('e', 'FCTerminator', 100, 330, { name: L(language, '끝', 'End') });
      p.edge('FCFlow', 's', 'p'); p.edge('FCFlow', 'p', 'd'); p.edge('FCFlow', 'd', 'e', { name: L(language, '예', 'Yes') });
      p.edge('FCFlow', 'd', 'p', { name: L(language, '아니오', 'No') }, { points: [{ x: 280, y: 242 }, { x: 280, y: 145 }] });
      break;
    }
    case 'dfd': {
      p.node('u', 'DFDExternalEntity', 40, 80, { name: L(language, '고객', 'Customer') });
      p.node('p', 'DFDProcess', 260, 60, { name: L(language, '주문 처리', 'Process Order'), id: '1.0' });
      p.node('s', 'DFDDataStore', 460, 90, { name: L(language, '주문', 'Orders'), id: 'D1' });
      p.edge('DFDDataFlow', 'u', 'p', { name: L(language, '주문 정보', 'order') }); p.edge('DFDDataFlow', 'p', 's', { name: L(language, '저장', 'save') });
      break;
    }
    case 'sysml': {
      p.node('r1', 'SysMLRequirement', 60, 60, { name: L(language, '성능', 'Performance'), id: 'REQ-1', text: L(language, '1초 안에 응답해야 한다', 'Respond within 1 second') });
      p.node('r2', 'SysMLRequirement', 360, 60, { name: L(language, '캐시', 'Caching'), id: 'REQ-1.1', text: L(language, '결과를 캐시한다', 'Cache results') });
      p.node('b', 'SysMLBlock', 360, 260, { name: 'CacheServer' });
      p.edge('SysMLDeriveReqt', 'r2', 'r1'); p.edge('SysMLSatisfy', 'b', 'r2');
      break;
    }
    case 'bpmn': {
      p.node('pool', 'BPMNParticipant', 20, 20, { name: L(language, '주문 처리', 'Order Handling') }, { w: 720, h: 200 });
      p.node('s', 'BPMNStartEvent', 80, 100);
      p.node('t1', 'task:user', 160, 86, { name: L(language, '주문 확인', 'Check Order') });
      p.node('g', 'BPMNExclusiveGateway', 320, 97);
      p.node('t2', 'task:service', 420, 50, { name: L(language, '결제', 'Charge') });
      p.node('t3', 'task:send', 420, 130, { name: L(language, '거절 알림', 'Notify Reject') });
      p.node('e', 'BPMNEndEvent', 600, 100);
      p.edge('BPMNSequenceFlow', 's', 't1'); p.edge('BPMNSequenceFlow', 't1', 'g'); p.edge('BPMNSequenceFlow', 'g', 't2'); p.edge('BPMNSequenceFlow', 'g', 't3');
      p.edge('BPMNSequenceFlow', 't2', 'e'); p.edge('BPMNSequenceFlow', 't3', 'e');
      break;
    }
    case 'c4': {
      p.node('u', 'C4Person', 60, 40, { name: L(language, '고객', 'Customer'), description: L(language, '물건을 사는 사람', 'Buys products') });
      p.node('s', 'C4SoftwareSystem', 340, 60, { name: L(language, '쇼핑몰', 'Online Shop'), description: L(language, '상품 주문을 받는다', 'Takes orders') });
      p.node('m', 'externalSystem', 340, 260, { name: L(language, '결제 시스템', 'Payment System') });
      p.edge('C4Relationship', 'u', 's', { name: L(language, '주문한다', 'Places orders'), technology: 'HTTPS' }); p.edge('C4Relationship', 's', 'm', { name: L(language, '결제를 요청한다', 'Charges'), technology: 'REST' });
      break;
    }
    case 'mindmap': {
      const root = p.node('r', 'MMNode', 260, 160, { name: L(language, '프로젝트', 'Project') });
      ['a', 'b', 'c', 'd'].forEach((k, i) => {
        const child = addElement(project, root._id, 'MMNode', { name: L(language, ['목표', '일정', '팀', '위험'][i], ['Goals', 'Schedule', 'Team', 'Risks'][i]) });
        const at = [[500, 80], [500, 240], [40, 80], [40, 240]][i];
        p.show(k, child, at[0], at[1]);
        p.edge('branch', 'r', k);
      });
      break;
    }
    case 'wireframe': {
      p.node('f', 'WFWebFrame', 40, 40, { name: 'https://shop.example.com' }, { w: 480, h: 320 });
      p.node('t', 'WFText', 70, 90, { name: L(language, '쇼핑몰에 로그인', 'Sign in to the shop') });
      p.node('i1', 'WFInput', 70, 130, { name: L(language, '이메일', 'Email') }, { w: 260, h: 30 });
      p.node('i2', 'WFInput', 70, 175, { name: L(language, '비밀번호', 'Password') }, { w: 260, h: 30 });
      p.node('c', 'WFCheckbox', 70, 220, { name: L(language, '로그인 유지', 'Keep me signed in'), checked: true });
      p.node('b', 'WFButton', 70, 260, { name: L(language, '로그인', 'Sign in') });
      break;
    }
    case 'aws': {
      p.node('cloud', 'group:cloud', 40, 40, {}, { w: 560, h: 300 });
      p.node('vpc', 'group:vpc', 70, 90, {}, { w: 500, h: 220 });
      p.node('u', 'service:User', -80, 160);
      p.node('elb', 'service:Elastic Load Balancing', 110, 160);
      p.node('ec2', 'service:EC2', 270, 160);
      p.node('rds', 'service:RDS', 440, 160);
      p.edge('CloudConnection', 'u', 'elb'); p.edge('CloudConnection', 'elb', 'ec2'); p.edge('CloudConnection', 'ec2', 'rds');
      break;
    }
    default: break;
  }
  project.name = name;
  return project;
}

/** The sample project "Online Shop". */
export function buildSample(language = 'ko') {
  const project = createProject({ name: L(language, '온라인 쇼핑몰', 'Online Shop'), language, diagram: null, author: 'MyUMLMaker' });
  project.documentation = L(language, '온라인 쇼핑몰의 요구사항, 구조, 행위와 데이터를 UML과 여러 표기법으로 그린 예제 프로젝트입니다.', 'A sample project that models an online shop: requirements, structure, behaviour and data in UML and other notations.');
  const model = project.ownedElements[0];
  model.name = L(language, '쇼핑몰 모델', 'Shop Model');
  const domain = addElement(project, model._id, 'UMLPackage', { name: 'domain' });
  const service = addElement(project, model._id, 'UMLPackage', { name: 'service' });

  // Class diagram
  const classes = addDiagram(project, domain._id, 'UMLClassDiagram', { language, name: L(language, '도메인 클래스', 'Domain Classes'), defaultDiagram: true });
  const c = painter(project, classes, language);
  const customer = c.node('customer', 'UMLClass', 40, 40, { name: 'Customer', documentation: L(language, '쇼핑몰에 가입한 고객', 'A registered shop customer') });
  member(project, customer, 'UMLAttribute', { name: 'id', type: 'long', visibility: 'private', isID: true });
  member(project, customer, 'UMLAttribute', { name: 'name', type: 'String', visibility: 'private' });
  member(project, customer, 'UMLAttribute', { name: 'email', type: 'String', visibility: 'private' });
  op(project, customer, 'placeOrder', [['cart', 'Cart']], 'Order');
  const order = c.node('order', 'UMLClass', 380, 40, { name: 'Order' });
  member(project, order, 'UMLAttribute', { name: 'id', type: 'long', visibility: 'private' });
  member(project, order, 'UMLAttribute', { name: 'orderedAt', type: 'DateTime', visibility: 'private' });
  const status = c.node('status', 'UMLEnumeration', 720, 40, { name: 'OrderStatus' });
  for (const lit of ['NEW', 'PAID', 'SHIPPED', 'CANCELLED']) member(project, status, 'UMLEnumerationLiteral', { name: lit });
  member(project, order, 'UMLAttribute', { name: 'status', type: ref(status), visibility: 'private', defaultValue: 'NEW' });
  op(project, order, 'total', [], 'Money', { isQuery: true });
  op(project, order, 'cancel');
  const line = c.node('line', 'UMLClass', 380, 300, { name: 'OrderLine' });
  member(project, line, 'UMLAttribute', { name: 'quantity', type: 'int', visibility: 'private' });
  op(project, line, 'subtotal', [], 'Money', { isQuery: true });
  const product = c.node('product', 'UMLClass', 720, 300, { name: 'Product', isAbstract: true });
  member(project, product, 'UMLAttribute', { name: 'name', type: 'String', visibility: 'protected' });
  member(project, product, 'UMLAttribute', { name: 'price', type: 'Money', visibility: 'protected' });
  op(project, product, 'describe', [], 'String', { isAbstract: true });
  const book = c.node('book', 'UMLClass', 620, 520, { name: 'Book' });
  member(project, book, 'UMLAttribute', { name: 'isbn', type: 'String', visibility: 'private' });
  op(project, book, 'describe', [], 'String');
  const food = c.node('food', 'UMLClass', 840, 520, { name: 'Food' });
  member(project, food, 'UMLAttribute', { name: 'expiresOn', type: 'Date', visibility: 'private' });
  op(project, food, 'describe', [], 'String');
  const payable = c.node('payable', 'UMLInterface', 40, 320, { name: 'Payable' });
  op(project, payable, 'pay', [['amount', 'Money']], 'boolean', { isAbstract: true });
  c.edge('UMLAssociation', 'customer', 'order', { end1: { multiplicity: '1' }, end2: { multiplicity: '0..*', name: 'orders', navigable: 'navigable' } });
  c.edge('composition', 'order', 'line', { end1: { multiplicity: '1' }, end2: { multiplicity: '1..*', name: 'lines' } });
  c.edge('directedAssociation', 'line', 'product', { end2: { multiplicity: '1', name: 'product' } });
  c.edge('UMLGeneralization', 'book', 'product');
  c.edge('UMLGeneralization', 'food', 'product');
  c.edge('UMLInterfaceRealization', 'order', 'payable', {}, { points: [{ x: 300, y: 200 }, { x: 300, y: 360 }] });
  c.edge('UMLDependency', 'order', 'status');
  c.note(L(language, '주문 합계는 주문 줄의\n소계를 더한 값이다.', 'The order total is the sum\nof its line subtotals.'), 40, 520);

  // Package diagram
  const packages = addDiagram(project, model._id, 'UMLPackageDiagram', { language, name: L(language, '패키지', 'Packages') });
  const pk = painter(project, packages, language);
  pk.show('domain', domain, 300, 60);
  pk.show('service', service, 40, 60);
  pk.edge('UMLDependency', 'service', 'domain', { stereotype: 'import' });

  // Use cases
  const ucd = addDiagram(project, model._id, 'UMLUseCaseDiagram', { language, name: L(language, '유스케이스', 'Use Cases') });
  const u = painter(project, ucd, language);
  u.node('sys', 'UMLUseCaseSubject', 220, 30, { name: L(language, '온라인 쇼핑몰', 'Online Shop') }, { w: 340, h: 420 });
  u.node('cust', 'UMLActor', 60, 120, { name: L(language, '고객', 'Customer') });
  u.node('admin', 'UMLActor', 640, 120, { name: L(language, '관리자', 'Administrator') });
  u.node('pay', 'UMLActor', 640, 330, { name: L(language, '결제 대행사', 'Payment Gateway') });
  u.node('browse', 'UMLUseCase', 290, 80, { name: L(language, '상품 둘러보기', 'Browse Products') });
  u.node('order', 'UMLUseCase', 290, 180, { name: L(language, '주문하기', 'Place Order') });
  u.node('payuc', 'UMLUseCase', 290, 290, { name: L(language, '결제하기', 'Pay') });
  u.node('login', 'UMLUseCase', 290, 380, { name: L(language, '로그인', 'Log In') });
  u.node('manage', 'UMLUseCase', 440, 130, { name: L(language, '상품 관리', 'Manage Products') });
  u.edge('UMLAssociation', 'cust', 'browse'); u.edge('UMLAssociation', 'cust', 'order'); u.edge('UMLAssociation', 'admin', 'manage'); u.edge('UMLAssociation', 'pay', 'payuc');
  u.edge('UMLInclude', 'order', 'payuc'); u.edge('UMLInclude', 'order', 'login');

  // Sequence
  const collab = addElement(project, service._id, 'UMLCollaboration', { name: L(language, '주문 협력', 'Ordering') });
  const interaction = addElement(project, collab._id, 'UMLInteraction', { name: L(language, '주문 처리', 'Place Order') });
  const seq = addDiagram(project, interaction._id, 'UMLSequenceDiagram', { language, name: L(language, '주문 시퀀스', 'Place Order Sequence') });
  const s = painter(project, seq, language);
  s.node('c', 'actorLifeline', 40, 30, { name: L(language, '고객', 'customer') });
  s.node('ui', 'UMLLifeline', 220, 30, { name: 'ui' });
  s.node('os', 'UMLLifeline', 400, 30, { name: 'orderService' });
  s.node('pg', 'UMLLifeline', 600, 30, { name: 'payment' });
  const msg = (from, to, sort, name, y) => { const m = s.edge(`message:${sort}`, from, to, {}, { y }); m.name = name; return m; };
  msg('c', 'ui', 'synchCall', 'checkout()', 110);
  msg('ui', 'os', 'synchCall', 'placeOrder(cart)', 140);
  msg('os', 'os', 'synchCall', 'validate()', 170);
  const frag = s.node('alt', 'fragment:alt', 380, 220, {}, { w: 390, h: 150 });
  frag.operands[0].guard = L(language, '결제 성공', 'payment ok');
  msg('os', 'pg', 'synchCall', 'charge(amount)', 250);
  msg('pg', 'os', 'reply', 'ok', 280);
  msg('os', 'pg', 'asynchCall', 'refund()', 335);
  msg('os', 'ui', 'reply', 'order', 400);
  msg('ui', 'c', 'reply', '', 430);

  // State machine
  const sm = addDiagram(project, domain._id, 'UMLStatechartDiagram', { language, name: L(language, '주문 상태', 'Order States') });
  const st = painter(project, sm, language);
  st.node('i', 'pseudo:initial', 40, 100);
  st.node('new', 'UMLState', 110, 80, { name: 'NEW', entryActivity: 'notify()' });
  st.node('paid', 'UMLState', 300, 80, { name: 'PAID' });
  st.node('shipped', 'UMLState', 490, 80, { name: 'SHIPPED' });
  st.node('cancel', 'UMLState', 300, 230, { name: 'CANCELLED', doActivity: 'refund()' });
  st.node('f', 'UMLFinalState', 680, 97);
  st.edge('UMLTransition', 'i', 'new'); st.edge('UMLTransition', 'new', 'paid', { triggers: 'pay', guard: 'amount > 0' }); st.edge('UMLTransition', 'paid', 'shipped', { triggers: 'ship' });
  st.edge('UMLTransition', 'new', 'cancel', { triggers: 'cancel' }); st.edge('UMLTransition', 'paid', 'cancel', { triggers: 'cancel', effect: 'refund' }); st.edge('UMLTransition', 'shipped', 'f');

  // Activity
  const act = addDiagram(project, service._id, 'UMLActivityDiagram', { language, name: L(language, '주문 처리 흐름', 'Order Fulfilment') });
  const a = painter(project, act, language);
  a.node('lane1', 'UMLActivityPartition', 20, 20, { name: L(language, '고객', 'Customer') }, { w: 230, h: 480 });
  a.node('lane2', 'UMLActivityPartition', 250, 20, { name: L(language, '쇼핑몰', 'Shop') }, { w: 260, h: 480 });
  a.node('i', 'UMLInitialNode', 125, 70);
  a.node('a1', 'UMLAction', 75, 120, { name: L(language, '주문 제출', 'Submit Order') });
  a.node('a2', 'UMLAction', 320, 120, { name: L(language, '재고 확인', 'Check Stock') });
  a.node('d', 'UMLDecisionNode', 365, 210);
  a.node('fork', 'UMLForkNode', 300, 290, {}, { w: 150, h: 6 });
  a.node('a3', 'UMLAction', 270, 330, { name: L(language, '결제', 'Charge') });
  a.node('a4', 'action:sendSignal', 385, 330, { name: L(language, '배송 요청', 'Ship') });
  a.node('join', 'UMLJoinNode', 300, 410, {}, { w: 150, h: 6 });
  a.node('a5', 'UMLAction', 75, 220, { name: L(language, '품절 안내', 'Out of Stock') });
  a.node('f', 'UMLActivityFinalNode', 362, 450);
  a.node('ff', 'UMLFlowFinalNode', 123, 320);
  a.edge('UMLControlFlow', 'i', 'a1'); a.edge('UMLControlFlow', 'a1', 'a2'); a.edge('UMLControlFlow', 'a2', 'd'); a.edge('UMLControlFlow', 'd', 'fork', { guard: L(language, '있음', 'in stock') });
  a.edge('UMLControlFlow', 'd', 'a5', { guard: L(language, '없음', 'none') }); a.edge('UMLControlFlow', 'a5', 'ff'); a.edge('UMLControlFlow', 'fork', 'a3'); a.edge('UMLControlFlow', 'fork', 'a4');
  a.edge('UMLControlFlow', 'a3', 'join'); a.edge('UMLControlFlow', 'a4', 'join'); a.edge('UMLControlFlow', 'join', 'f');

  // Components and deployment
  const comp = addDiagram(project, model._id, 'UMLComponentDiagram', { language, name: L(language, '컴포넌트', 'Components') });
  const k = painter(project, comp, language);
  k.node('web', 'UMLComponent', 40, 60, { name: 'WebFrontend' });
  k.node('api', 'UMLInterface', 300, 70, { name: 'OrderAPI' });
  k.node('ord', 'UMLComponent', 260, 200, { name: 'OrderService' });
  k.node('pay', 'UMLInterface', 520, 210, { name: 'PaymentAPI' });
  k.node('pgw', 'UMLComponent', 480, 330, { name: 'PaymentAdapter' });
  k.node('db', 'UMLArtifact', 40, 330, { name: 'shop.sql' });
  k.edge('UMLUsage', 'web', 'api'); k.edge('UMLInterfaceRealization', 'ord', 'api'); k.edge('UMLUsage', 'ord', 'pay'); k.edge('UMLInterfaceRealization', 'pgw', 'pay'); k.edge('UMLDependency', 'ord', 'db');
  const dep = addDiagram(project, model._id, 'UMLDeploymentDiagram', { language, name: L(language, '배치', 'Deployment') });
  const d = painter(project, dep, language);
  d.node('browser', 'UMLDevice', 40, 80, { name: L(language, '사용자 브라우저', 'Browser') }, { w: 160, h: 100 });
  d.node('app', 'UMLNode', 300, 40, { name: 'app-01' }, { w: 240, h: 170 });
  d.node('war', 'UMLArtifact', 330, 110, { name: 'shop.war' });
  d.node('dbs', 'UMLExecutionEnvironment', 640, 60, { name: 'PostgreSQL' }, { w: 200, h: 120 });
  d.edge('UMLCommunicationPath', 'browser', 'app', { name: 'HTTPS' }); d.edge('UMLCommunicationPath', 'app', 'dbs', { name: 'JDBC' });

  // ER diagram
  const dataModel = addElement(project, project._id, 'ERDDataModel', { name: L(language, '데이터 모델', 'Data Model') });
  const erd = addDiagram(project, dataModel._id, 'ERDDiagram', { language, name: L(language, '쇼핑몰 데이터베이스', 'Shop Database') });
  const e = painter(project, erd, language);
  const ec = e.node('c', 'ERDEntity', 40, 40, { name: 'customer' });
  member(project, ec, 'ERDColumn', { name: 'email', type: 'VARCHAR', length: '200', unique: true });
  member(project, ec, 'ERDColumn', { name: 'name', type: 'VARCHAR', length: '100' });
  const eo = e.node('o', 'ERDEntity', 340, 40, { name: 'orders' });
  member(project, eo, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', foreignKey: true, referenceTo: ref(ec.columns[0]) });
  member(project, eo, 'ERDColumn', { name: 'status', type: 'VARCHAR', length: '20' });
  const el = e.node('l', 'ERDEntity', 340, 240, { name: 'order_line' });
  member(project, el, 'ERDColumn', { name: 'order_id', type: 'INTEGER', foreignKey: true, referenceTo: ref(eo.columns[0]) });
  member(project, el, 'ERDColumn', { name: 'product_id', type: 'INTEGER', foreignKey: true });
  member(project, el, 'ERDColumn', { name: 'quantity', type: 'INTEGER' });
  const ep = e.node('p', 'ERDEntity', 640, 240, { name: 'product' });
  member(project, ep, 'ERDColumn', { name: 'name', type: 'VARCHAR', length: '200' });
  member(project, ep, 'ERDColumn', { name: 'price', type: 'DECIMAL', length: '10,2' });
  el.columns[2].referenceTo = ref(ep.columns[0]);
  e.edge('erd:1:0..*', 'c', 'o'); e.edge('erd:1:0..*', 'o', 'l', { end2: { cardinality: '1..*' } }); e.edge('erd:1:0..*', 'p', 'l');

  // Flowchart, BPMN, C4, mind map
  const fcModel = addElement(project, project._id, 'FCFlowchart', { name: L(language, '순서도', 'Flowcharts') });
  const fc = addDiagram(project, fcModel._id, 'FCFlowchartDiagram', { language, name: L(language, '결제 순서도', 'Payment Flow') });
  const f = painter(project, fc, language);
  f.node('s', 'FCTerminator', 120, 20, { name: L(language, '시작', 'Start') });
  f.node('in', 'FCData', 105, 100, { name: L(language, '카드 정보 입력', 'Enter Card') });
  f.node('d', 'FCDecision', 110, 190, { name: L(language, '승인?', 'Approved?') });
  f.node('ok', 'FCProcess', 120, 310, { name: L(language, '영수증 발행', 'Issue Receipt') });
  f.node('db', 'FCDatabase', 330, 300, { name: L(language, '결제 기록', 'Payments') });
  f.node('e', 'FCTerminator', 120, 410, { name: L(language, '끝', 'End') });
  f.edge('FCFlow', 's', 'in'); f.edge('FCFlow', 'in', 'd'); f.edge('FCFlow', 'd', 'ok', { name: L(language, '예', 'Yes') }); f.edge('FCFlow', 'ok', 'db'); f.edge('FCFlow', 'ok', 'e');
  f.edge('FCFlow', 'd', 'in', { name: L(language, '아니오', 'No') }, { points: [{ x: 300, y: 222 }, { x: 300, y: 125 }] });
  buildC4(project, language);
  return project;
}

function buildC4(project, language) {
  const c4 = addElement(project, project._id, 'C4Model', { name: 'C4' });
  const diagram = addDiagram(project, c4._id, 'C4Diagram', { language, name: L(language, '시스템 컨텍스트', 'System Context') });
  const p = painter(project, diagram, language);
  p.node('cust', 'C4Person', 60, 40, { name: L(language, '고객', 'Customer'), description: L(language, '상품을 주문한다', 'Orders products') });
  p.node('shop', 'C4SoftwareSystem', 360, 60, { name: L(language, '온라인 쇼핑몰', 'Online Shop'), description: L(language, '상품 목록과 주문', 'Catalogue and orders') });
  p.node('pay', 'externalSystem', 660, 60, { name: L(language, '결제 대행사', 'Payment Provider') });
  p.node('mail', 'externalSystem', 360, 280, { name: L(language, '메일 서비스', 'E-mail Service') });
  p.edge('C4Relationship', 'cust', 'shop', { name: L(language, '주문한다', 'Places orders'), technology: 'HTTPS' });
  p.edge('C4Relationship', 'shop', 'pay', { name: L(language, '결제를 요청한다', 'Charges'), technology: 'REST' });
  p.edge('C4Relationship', 'shop', 'mail', { name: L(language, '메일을 보낸다', 'Sends e-mail'), technology: 'SMTP' });
}

/** Files written to samples/ by scripts/make-samples.mjs. */
export const SAMPLE_FILES = [['online-shop.ko.muml', () => buildSample('ko')], ['online-shop.en.muml', () => buildSample('en')]];

export { allDiagrams };
