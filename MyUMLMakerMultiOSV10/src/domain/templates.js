// New-project templates (one per kind of diagram) and the sample project
// "Online Shop" — one finished diagram of each of the 38 kinds (UML structure
// and behaviour, ER, flowchart, data flow, SysML, BPMN, C4, mind map,
// wireframe, AWS/Azure/GCP, and in templates-more.js Gantt, WBS, timeline,
// ArchiMate, network, JSON, YAML, EBNF, regex) — in Korean and English. Everything is built with
// the normal editing functions, so the samples are exactly what a user could draw.
import { addDiagram, addElement, allDiagrams, createProject, findById, ref, refId, showElement } from './model.js';
import { addCommunicationMessage, createEdge, createNode, dropElement } from './edit.js';
import { toolById } from './toolbox.js';
import { TYPES } from './meta.js';
import { buildMoreSamples, buildMoreTemplate } from './templates-more.js';

/** id, diagram type, icon */
export const TEMPLATES = [
  ['blank', 'UMLClassDiagram', 'fileNew'], ['classModel', 'UMLClassDiagram', 'dgClass'], ['useCase', 'UMLUseCaseDiagram', 'dgUseCase'], ['sequence', 'UMLSequenceDiagram', 'dgSequence'],
  ['stateMachine', 'UMLStatechartDiagram', 'dgState'], ['activity', 'UMLActivityDiagram', 'dgActivity'], ['component', 'UMLComponentDiagram', 'dgComponent'], ['deployment', 'UMLDeploymentDiagram', 'dgDeployment'],
  ['erd', 'ERDDiagram', 'dgErd'], ['flowchart', 'FCFlowchartDiagram', 'dgFlowchart'], ['dfd', 'DFDDiagram', 'dgDfd'], ['sysml', 'SysMLRequirementDiagram', 'dgRequirement'],
  ['bpmn', 'BPMNDiagram', 'dgBpmn'], ['c4', 'C4Diagram', 'dgC4'], ['mindmap', 'MMMindmapDiagram', 'dgMindmap'], ['wireframe', 'WFWireframeDiagram', 'dgWireframe'], ['aws', 'AWSDiagram', 'dgAws'],
  ['gantt', 'GanttDiagram', 'dgGantt'], ['wbs', 'WBSDiagram', 'dgWbs'], ['archimate', 'ArchiMateDiagram', 'dgArchimate'], ['network', 'NetworkDiagram', 'dgNetwork'],
];

const L = (language, ko, en) => (language === 'ko' ? ko : en);

/** A small drawing helper bound to one diagram. */
function painter(project, diagram, language) {
  const views = new Map();
  const tool = (id) => { const found = toolById(diagram._type, id) ?? (TYPES[id] || id.endsWith('View') ? { id, type: id, kind: TYPES[id]?.edge ? 'edge' : 'node', attrs: {} } : null); if (!found) throw new Error(`unknown tool ${id}`); return found; };
  // Boxes of views drawn without a size are tiny here, so that a later node is never taken as dropped inside them.
  const record = (key, element, view, x, y, size) => views.set(key, { element, view, box: { x, y, w: size.w || 1, h: size.h || 1 } });
  return {
    views,
    /** A node from a toolbox tool; `viewProps` go onto its view (suppressAttributes …). */
    node(key, toolId, x, y, attrs = {}, size = {}, viewProps = null) {
      const t = tool(toolId);
      const { element, view } = createNode(project, diagram, { ...t, attrs: { ...t.attrs, ...attrs } }, { x, y, w: size.w ?? 0, h: size.h ?? 0 }, { language, boxes: boxesOf(views) });
      if (viewProps) Object.assign(view, viewProps);
      record(key, element, view, x, y, size);
      return element;
    },
    /** A line from a toolbox tool. extra: { y (message), points (bends), style (line style) }. */
    edge(toolId, a, b, attrs = {}, extra = {}) {
      const t = tool(toolId);
      const merged = { ...t.attrs, ...attrs };
      for (const end of ['end1', 'end2']) if (t.attrs?.[end] && attrs[end]) merged[end] = { ...t.attrs[end], ...attrs[end] };
      const { element, view } = createEdge(project, diagram, { ...t, attrs: merged }, views.get(a).view, views.get(b).view, { language, y: extra.y ?? null });
      if (extra.points) view.points = extra.points;
      if (extra.style) view.lineStyle = extra.style;
      return element;
    },
    /** An existing element shown on the diagram (Model Explorer drag). */
    show(key, element, x, y, size = {}, viewProps = null) {
      const view = showElement(project, diagram, element._id, { x, y }, size);
      if (viewProps) Object.assign(view, viewProps);
      record(key, element, view, x, y, size);
      return view;
    },
    /** An existing element dropped from the Model Explorer (a role becomes a lifeline). */
    drop(key, element, x, y) {
      const view = dropElement(project, diagram, element._id, { x, y }, { language });
      record(key, findById(project, refId(view.model)), view, x, y, {});
      return views.get(key).element;
    },
    view: (key) => views.get(key).view,
    note(text, x, y, w = 0, h = 0) { return createNode(project, diagram, tool('UMLNoteView'), { x, y, w, h }, { language }).view.text = text; },
    /** An annotation view (frame, text …) with a text. */
    annotation(key, toolId, x, y, text, size = {}) { const { view } = createNode(project, diagram, tool(toolId), { x, y, w: size.w ?? 0, h: size.h ?? 0 }, { language }); view.text = text; record(key, null, view, x, y, size); return view; },
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
    default: buildMoreTemplate(id, project, diagram, language); break;
  }
  project.name = name;
  return project;
}

/**
 * The sample project "Online Shop": one finished example of every kind of
 * diagram the program draws (38), all about the same shop and sharing its
 * model elements (the classes of the class diagram are the objects' classes,
 * the lifelines' types, the parts of the composite structure …).
 */
export function buildSample(language = 'ko') {
  const T = (ko, en) => L(language, ko, en);
  const project = createProject({ name: T('온라인 쇼핑몰', 'Online Shop'), language, diagram: null, author: 'MyUMLMaker' });
  project.documentation = T('온라인 쇼핑몰의 요구사항, 구조, 행위와 데이터를 UML과 여러 표기법으로 그린 예제 프로젝트입니다. 프로그램이 그리는 모든 종류의 다이어그램이 하나씩 들어 있습니다.', 'A sample project that models an online shop: requirements, structure, behaviour and data in UML and other notations. It has one diagram of every kind the program draws.');
  const model = project.ownedElements[0];
  model.name = T('쇼핑몰 모델', 'Shop Model');
  const pkg = (name, documentation) => addElement(project, model._id, 'UMLPackage', { name, documentation });
  const s = { project, language, T, model };
  s.domain = pkg('domain', T('업무 개념: 고객, 주문, 상품', 'Business concepts: customers, orders and products'));
  s.service = pkg('service', T('주문과 결제를 처리하는 서비스', 'Services that take orders and payments'));
  s.web = pkg('web', T('웹 요청을 받는 컨트롤러', 'Controllers that answer web requests'));
  s.persistence = pkg('persistence', T('주문과 상품을 저장하는 저장소', 'Repositories that store orders and products'));
  buildProfileElements(s);
  buildClasses(s);
  buildObjects(s);
  buildStates(s);
  buildUseCases(s); // its actors are the actor lifelines' types
  buildInteractions(s);
  buildActivity(s);
  buildPackages(s);
  buildComponents(s);
  buildCompositeStructure(s);
  buildDeployment(s);
  buildInformationFlow(s);
  buildProfileDiagram(s);
  buildErd(s);
  buildFlowchart(s);
  buildDfd(s);
  buildSysml(s);
  buildBpmn(s);
  buildC4(s);
  buildMindmap(s);
  buildWireframe(s);
  buildCloud(s);
  buildMoreSamples(s); // Gantt, WBS, timeline, ArchiMate, network, JSON, YAML, EBNF, regex
  return project;
}

/** Classes of web/service/persistence with their stereotypes from the profile. */
function serviceClasses(s) {
  const { project, T } = s;
  const cls = (owner, type, name, stereotype, documentation) => addElement(project, owner._id, type, { name, stereotype: ref(stereotype), documentation });
  s.orderController = cls(s.web, 'UMLClass', 'OrderController', s.st.controller, T('주문 화면의 요청을 받는다', 'Answers the order pages'));
  op(project, s.orderController, 'checkout', [['cart', 'Cart']], 'Order');
  s.cartController = cls(s.web, 'UMLClass', 'CartController', s.st.controller, T('장바구니 화면의 요청을 받는다', 'Answers the cart pages'));
  op(project, s.cartController, 'addItem', [['productId', 'long'], ['quantity', 'int']]);
  s.orderService = cls(s.service, 'UMLClass', 'OrderService', s.st.service, T('주문을 만들고 취소한다', 'Places and cancels orders'));
  op(project, s.orderService, 'placeOrder', [['cart', 'Cart']], 'Order');
  op(project, s.orderService, 'cancel', [['orderId', 'long']]);
  s.paymentService = cls(s.service, 'UMLClass', 'PaymentService', s.st.service, T('결제 대행사에 결제를 요청한다', 'Charges through the payment provider'));
  op(project, s.paymentService, 'charge', [['amount', 'Money']], 'boolean');
  op(project, s.paymentService, 'refund', [['paymentId', 'long']]);
  s.orderRepository = cls(s.persistence, 'UMLInterface', 'OrderRepository', s.st.repository, T('주문을 저장하고 찾는다', 'Stores and finds orders'));
  op(project, s.orderRepository, 'save', [['order', 'Order']], '', { isAbstract: true });
  op(project, s.orderRepository, 'findById', [['id', 'long']], 'Order', { isAbstract: true, isQuery: true });
  s.productRepository = cls(s.persistence, 'UMLInterface', 'ProductRepository', s.st.repository, T('상품 목록을 읽는다', 'Reads the catalogue'));
  op(project, s.productRepository, 'findAll', [], 'Product', { isAbstract: true, isQuery: true });
}

// ───────────────────────── UML structure

function buildClasses(s) {
  const { project, language, T } = s;
  const classes = addDiagram(project, s.domain._id, 'UMLClassDiagram', { language, name: T('도메인 클래스', 'Domain Classes'), defaultDiagram: true });
  const c = painter(project, classes, language);
  const customer = c.node('customer', 'UMLClass', 40, 40, { name: 'Customer', documentation: T('쇼핑몰에 가입한 고객', 'A registered shop customer') });
  member(project, customer, 'UMLAttribute', { name: 'id', type: 'long', visibility: 'private', isID: true });
  member(project, customer, 'UMLAttribute', { name: 'name', type: 'String', visibility: 'private' });
  member(project, customer, 'UMLAttribute', { name: 'email', type: 'String', visibility: 'private' });
  op(project, customer, 'placeOrder', [['cart', 'Cart']], 'Order');
  const order = c.node('order', 'UMLClass', 380, 40, { name: 'Order', documentation: T('고객이 한 번에 주문한 내용', 'What a customer ordered at one time') });
  member(project, order, 'UMLAttribute', { name: 'id', type: 'long', visibility: 'private' });
  member(project, order, 'UMLAttribute', { name: 'orderedAt', type: 'DateTime', visibility: 'private' });
  const status = c.node('status', 'UMLEnumeration', 720, 40, { name: 'OrderStatus' });
  for (const lit of ['NEW', 'PAID', 'SHIPPED', 'CANCELLED']) member(project, status, 'UMLEnumerationLiteral', { name: lit });
  member(project, order, 'UMLAttribute', { name: 'status', type: ref(status), visibility: 'private', defaultValue: 'NEW' });
  op(project, order, 'total', [], 'Money', { isQuery: true });
  op(project, order, 'pay');
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
  const payable = c.node('payable', 'UMLInterface', 40, 300, { name: 'Payable' });
  op(project, payable, 'pay', [['amount', 'Money']], 'boolean', { isAbstract: true });
  c.edge('UMLAssociation', 'customer', 'order', { end1: { multiplicity: '1' }, end2: { multiplicity: '0..*', name: 'orders', navigable: 'navigable' } });
  c.edge('composition', 'order', 'line', { end1: { multiplicity: '1' }, end2: { multiplicity: '1..*', name: 'lines' } });
  c.edge('directedAssociation', 'line', 'product', { end2: { multiplicity: '1', name: 'product' } });
  c.edge('UMLGeneralization', 'book', 'product');
  c.edge('UMLGeneralization', 'food', 'product');
  c.edge('UMLInterfaceRealization', 'order', 'payable', {}, { points: [{ x: 420, y: 150 }, { x: 300, y: 150 }, { x: 300, y: 340 }] });
  c.edge('UMLDependency', 'order', 'status');
  c.note(T('주문 합계는 주문 줄의\n소계를 더한 값이다.', 'The order total is the sum\nof its line subtotals.'), 40, 520);
  Object.assign(s, { customer, order, status, line, product, book, food, payable });
  serviceClasses(s);
}

function buildObjects(s) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, s.domain._id, 'UMLObjectDiagram', { language, name: T('주문 1001의 객체', 'Objects of Order 1001') });
  const p = painter(project, diagram, language);
  const attr = (cls, name) => cls.attributes.find((a) => a.name === name);
  const object = (key, name, cls, x, y, slots) => {
    const o = p.node(key, 'UMLObject', x, y, { name, classifier: ref(cls) });
    for (const [owner, feature, value] of slots) member(project, o, 'UMLSlot', { definingFeature: ref(attr(owner, feature)), value });
    return o;
  };
  object('kim', 'kim', s.customer, 40, 40, [[s.customer, 'id', '7'], [s.customer, 'name', T('"김민수"', '"Kim Minsu"')], [s.customer, 'email', '"kim@example.com"']]);
  object('o', 'order1001', s.order, 380, 40, [[s.order, 'id', '1001'], [s.order, 'orderedAt', '2026-10-18 10:30'], [s.order, 'status', 'PAID']]);
  object('l1', 'line1', s.line, 280, 260, [[s.line, 'quantity', '2']]);
  object('l2', 'line2', s.line, 560, 260, [[s.line, 'quantity', '1']]);
  object('b', 'umlBook', s.book, 200, 430, [[s.product, 'name', T('"UML 입문"', '"UML Distilled"')], [s.product, 'price', '25000'], [s.book, 'isbn', '"978-0321193681"']]);
  object('f', 'coffee', s.food, 540, 430, [[s.product, 'name', T('"커피 원두 1kg"', '"Coffee beans 1kg"')], [s.product, 'price', '18000'], [s.food, 'expiresOn', '2027-03-01']]);
  p.edge('UMLLink', 'kim', 'o', { end2: { name: 'orders' } });
  p.edge('UMLLink', 'o', 'l1', { end2: { name: 'lines' } });
  p.edge('UMLLink', 'o', 'l2', { end2: { name: 'lines' } });
  p.edge('UMLLink', 'l1', 'b', { end2: { name: 'product' } });
  p.edge('UMLLink', 'l2', 'f', { end2: { name: 'product' } });
  p.note(T('주문 1001: 책 2권과 커피 원두 1봉지,\n합계 68,000원', 'Order 1001: two books and one bag\nof coffee, total 68,000'), 40, 230);
}

function buildPackages(s) {
  const { project, language, T } = s;
  const packages = addDiagram(project, s.model._id, 'UMLPackageDiagram', { language, name: T('패키지 구조', 'Package Structure') });
  const pk = painter(project, packages, language);
  const compact = { suppressAttributes: true, suppressOperations: true };
  pk.show('web', s.web, 240, 40, { w: 340, h: 130 });
  pk.show('oc', s.orderController, 262, 90, {}, compact);
  pk.show('cc', s.cartController, 422, 90, {}, compact);
  pk.show('service', s.service, 240, 230, { w: 340, h: 130 });
  pk.show('os', s.orderService, 262, 280, {}, compact);
  pk.show('ps', s.paymentService, 422, 280, {}, compact);
  pk.show('persistence', s.persistence, 40, 420, { w: 360, h: 130 });
  pk.show('or', s.orderRepository, 60, 470, {}, compact);
  pk.show('pr', s.productRepository, 220, 470, {}, compact);
  pk.show('domain', s.domain, 460, 420, { w: 400, h: 130 });
  pk.show('cu', s.customer, 480, 480, {}, compact);
  pk.show('or2', s.order, 610, 480, {}, compact);
  pk.show('pd', s.product, 720, 480, {}, compact);
  pk.edge('import', 'web', 'service');
  pk.edge('import', 'service', 'persistence');
  pk.edge('import', 'service', 'domain');
  pk.edge('import', 'persistence', 'domain');
  pk.note(T('위 계층은 아래 계층만 사용한다.', 'A layer uses only the layers below it.'), 640, 60);
}

function buildComponents(s) {
  const { project, language, T } = s;
  const comp = addDiagram(project, s.model._id, 'UMLComponentDiagram', { language, name: T('컴포넌트', 'Components') });
  const k = painter(project, comp, language);
  k.node('web', 'UMLComponent', 40, 120, { name: 'WebFrontend' });
  k.node('api', 'interfaceIcon', 290, 130, { name: 'OrderAPI' });
  const system = k.node('sys', 'UMLComponent', 420, 40, { name: 'OrderingSystem', stereotype: 'subsystem' }, { w: 480, h: 230 });
  const port = member(project, system, 'UMLPort', { name: 'api', type: 'OrderAPI' });
  k.show('port', port, 412, 135);
  k.node('ord', 'UMLComponent', 470, 120, { name: 'OrderService' });
  k.node('inv', 'UMLComponent', 700, 120, { name: 'InventoryService' });
  k.node('pay', 'interfaceIcon', 560, 420, { name: 'PaymentAPI' });
  k.node('pgw', 'UMLComponent', 720, 410, { name: 'PaymentAdapter' });
  k.node('jar', 'UMLArtifact', 40, 240, { name: 'ordering.jar' });
  k.edge('UMLUsage', 'web', 'api');
  k.edge('UMLInterfaceRealization', 'port', 'api');
  k.edge('delegation', 'port', 'ord');
  k.edge('UMLConnector', 'ord', 'inv', { name: 'stock' });
  k.edge('UMLUsage', 'ord', 'pay');
  k.edge('UMLInterfaceRealization', 'pgw', 'pay');
  k.edge('UMLManifestation', 'jar', 'sys');
  s.orderingSystem = system;
}

function buildCompositeStructure(s) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, s.service._id, 'UMLCompositeStructureDiagram', { language, name: T('주문 처리기 내부 구조', 'Order Processor Structure') });
  const p = painter(project, diagram, language);
  const app = p.node('app', 'UMLClass', 140, 40, { name: 'OrderProcessor', documentation: T('주문을 받아 결제까지 처리하는 실행 단위', 'Takes an order through to payment') }, { w: 620, h: 300 }, { suppressAttributes: true, suppressOperations: true });
  p.node('ctl', 'UMLPart', 190, 120, { name: 'controller', type: ref(s.orderController) });
  p.node('ord', 'UMLPart', 430, 120, { name: 'orders', type: ref(s.orderService) });
  p.node('pay', 'UMLPart', 430, 250, { name: 'payments', type: ref(s.paymentService) });
  p.node('repo', 'UMLPart', 190, 250, { name: 'repository', type: ref(s.orderRepository), multiplicity: '1' });
  const http = member(project, app, 'UMLPort', { name: 'http', type: 'HTTP' });
  const pg = member(project, app, 'UMLPort', { name: 'pg', type: 'PaymentGateway' });
  p.show('http', http, 132, 132);
  p.show('pg', pg, 752, 262);
  p.node('shopApi', 'UMLInterface', 30, 220, { name: 'ShopAPI' }, {}, { stereotypeDisplay: 'icon' });
  p.node('gw', 'UMLInterface', 840, 200, { name: 'PaymentGateway' }, {}, { stereotypeDisplay: 'icon' });
  p.edge('UMLConnector', 'http', 'ctl');
  p.edge('UMLConnector', 'ctl', 'ord');
  p.edge('UMLConnector', 'ord', 'pay');
  p.edge('UMLConnector', 'ctl', 'repo');
  p.edge('UMLConnector', 'pay', 'pg');
  p.edge('UMLRealization', 'http', 'shopApi');
  p.edge('UMLUsage', 'pg', 'gw');
}

function buildDeployment(s) {
  const { project, language, T } = s;
  const dep = addDiagram(project, s.model._id, 'UMLDeploymentDiagram', { language, name: T('배치', 'Deployment') });
  const d = painter(project, dep, language);
  d.node('pc', 'UMLDevice', 40, 60, { name: T('고객 PC', 'Customer PC') }, { w: 200, h: 170 });
  d.node('browser', 'UMLExecutionEnvironment', 60, 120, { name: T('웹 브라우저', 'Web Browser') }, { w: 160, h: 90 });
  d.node('app', 'UMLNode', 330, 40, { name: 'app-server-01' }, { w: 290, h: 220 });
  d.node('tomcat', 'UMLExecutionEnvironment', 350, 100, { name: 'Tomcat 10' }, { w: 250, h: 140 });
  d.node('war', 'UMLArtifact', 400, 160, { name: 'shop.war' });
  d.node('db', 'UMLNode', 780, 40, { name: 'db-server-01' }, { w: 260, h: 220 });
  d.node('pgsql', 'UMLExecutionEnvironment', 800, 100, { name: 'PostgreSQL 16' }, { w: 220, h: 140 });
  d.node('schema', 'UMLArtifact', 830, 160, { name: 'shop-schema.sql' });
  d.node('adapter', 'UMLArtifact', 330, 360, { name: 'payment-adapter.jar' });
  d.show('sys', s.orderingSystem, 720, 360);
  d.edge('UMLCommunicationPath', 'pc', 'app', { name: 'HTTPS' });
  d.edge('UMLCommunicationPath', 'app', 'db', { name: 'JDBC / TCP 5432' });
  d.edge('UMLDeployment', 'adapter', 'app');
  d.edge('UMLManifestation', 'war', 'sys', {}, { points: [{ x: 560, y: 300 }, { x: 790, y: 300 }] });
}

/** The profile (its elements first: the classes below use its stereotypes). */
function buildProfileElements(s) {
  const { project, T } = s;
  const profile = addElement(project, project._id, 'UMLProfile', { name: 'ShopProfile', documentation: T('쇼핑몰 코드의 계층을 나타내는 스테레오타입', 'Stereotypes for the layers of the shop code') });
  const add = (type, name, documentation) => addElement(project, profile._id, type, { name, documentation });
  const attr = (owner, name, type, defaultValue = '') => member(project, owner, 'UMLAttribute', { name, type, defaultValue });
  const st = {
    metaClass: add('UMLMetaClass', 'Class'),
    metaProperty: add('UMLMetaClass', 'Property'),
    scope: add('UMLEnumeration', 'Scope', T('서비스 객체의 수명', 'Lifetime of a service object')),
    controller: add('UMLStereotype', 'Controller', T('웹 요청을 받는 클래스', 'A class that answers web requests')),
    service: add('UMLStereotype', 'Service', T('업무 규칙을 처리하는 클래스', 'A class that runs business rules')),
    repository: add('UMLStereotype', 'Repository', T('데이터를 저장하고 찾는 인터페이스', 'An interface that stores and finds data')),
    entity: add('UMLStereotype', 'Entity', T('표 하나에 저장되는 클래스', 'A class stored in one table')),
    id: add('UMLStereotype', 'Id', T('기본 키 속성', 'A primary-key attribute')),
    root: add('UMLStereotype', 'AggregateRoot', T('집합체의 루트 엔터티', 'The root entity of an aggregate')),
  };
  for (const lit of ['singleton', 'request', 'session']) member(project, st.scope, 'UMLEnumerationLiteral', { name: lit });
  attr(st.controller, 'path', 'String', '"/"');
  attr(st.service, 'transactional', 'Boolean', 'true');
  attr(st.service, 'scope', ref(st.scope), 'singleton');
  attr(st.entity, 'tableName', 'String');
  attr(st.id, 'generated', 'Boolean', 'true');
  s.profile = profile;
  s.st = st;
}

function buildProfileDiagram(s) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, s.profile._id, 'UMLProfileDiagram', { language, name: T('쇼핑몰 프로파일', 'Shop Profile') });
  const p = painter(project, diagram, language);
  p.show('profile', s.profile, 20, 20, { w: 940, h: 470 });
  const st = s.st;
  p.show('class', st.metaClass, 330, 70);
  p.show('property', st.metaProperty, 760, 70);
  p.show('controller', st.controller, 40, 220);
  p.show('service', st.service, 240, 220);
  p.show('repository', st.repository, 470, 220);
  p.show('entity', st.entity, 640, 220);
  p.show('id', st.id, 800, 220);
  p.show('scope', st.scope, 240, 370);
  p.show('root', st.root, 640, 370);
  const bus = (key, x) => p.edge('UMLExtension', key, 'class', { isRequired: false }, { points: [{ x, y: 180 }, { x: 375, y: 180 }] });
  bus('controller', 110); bus('service', 320); bus('repository', 540); bus('entity', 700);
  p.edge('UMLExtension', 'id', 'property');
  p.edge('UMLGeneralization', 'root', 'entity');
  p.edge('UMLDependency', 'service', 'scope');
}

// ───────────────────────── UML behaviour

function buildStates(s) {
  const { project, language, T } = s;
  const machine = addElement(project, s.domain._id, 'UMLStateMachine', { name: T('주문 생명주기', 'Order Lifecycle') });
  const sm = addDiagram(project, machine._id, 'UMLStatechartDiagram', { language, name: T('주문 상태', 'Order States') });
  const st = painter(project, sm, language);
  st.node('i', 'pseudo:initial', 40, 112);
  st.node('new', 'UMLState', 100, 90, { name: 'NEW', entryActivity: 'notifyCustomer()' });
  st.node('paid', 'UMLState', 400, 90, { name: 'PAID', entryActivity: 'reserveStock()' });
  st.node('shipped', 'compositeState', 620, 30, { name: 'SHIPPED' }, { w: 360, h: 210 });
  st.node('i2', 'pseudo:initial', 640, 112);
  st.node('packing', 'UMLState', 690, 95, { name: T('포장 중', 'Packing') });
  st.node('transit', 'UMLState', 850, 95, { name: T('배송 중', 'In Transit') });
  st.node('delivered', 'UMLState', 850, 180, { name: T('배송 완료', 'Delivered') });
  st.node('f2', 'UMLFinalState', 730, 185);
  st.node('cancel', 'UMLState', 400, 290, { name: 'CANCELLED', doActivity: 'refund()' });
  st.node('f', 'UMLFinalState', 1070, 122);
  st.node('f3', 'UMLFinalState', 630, 307);
  st.edge('UMLTransition', 'i', 'new');
  st.edge('UMLTransition', 'new', 'paid', { triggers: 'pay', guard: 'amount > 0' });
  st.edge('UMLTransition', 'paid', 'shipped', { triggers: 'ship' });
  st.edge('UMLTransition', 'i2', 'packing');
  st.edge('UMLTransition', 'packing', 'transit', { triggers: 'dispatch' });
  st.edge('UMLTransition', 'transit', 'delivered', { triggers: 'deliver' });
  st.edge('UMLTransition', 'delivered', 'f2');
  st.edge('UMLTransition', 'shipped', 'f');
  st.edge('UMLTransition', 'new', 'cancel', { triggers: 'cancel' }, { points: [{ x: 160, y: 310 }] });
  st.edge('UMLTransition', 'paid', 'cancel', { triggers: 'cancel', effect: 'refund' });
  st.edge('UMLTransition', 'cancel', 'f3');
}

/** Lifeline helper: the role a lifeline represents gets a type. */
const typeRole = (project, lifeline, type) => { const role = findById(project, refId(lifeline.represent)); if (role && type) role.type = ref(type); return role; };

function buildInteractions(s) {
  const { project, language, T } = s;
  const collab = addElement(project, s.service._id, 'UMLCollaboration', { name: T('주문 협력', 'Ordering') });
  const interaction = (name, documentation) => addElement(project, collab._id, 'UMLInteraction', { name, documentation });
  const logIn = interaction(T('로그인', 'Log In'), T('고객이 이메일과 비밀번호로 로그인한다', 'The customer signs in with e-mail and password'));
  const browse = interaction(T('상품 둘러보기', 'Browse Products'), T('고객이 상품 목록을 검색하고 본다', 'The customer searches and views the catalogue'));
  const track = interaction(T('배송 조회', 'Track Shipment'), T('고객이 배송 상태를 확인한다', 'The customer checks the delivery status'));
  const placeOrder = interaction(T('주문 처리', 'Place Order'));

  // Sequence diagram
  const seq = addDiagram(project, placeOrder._id, 'UMLSequenceDiagram', { language, name: T('주문 시퀀스', 'Place Order Sequence') });
  const q = painter(project, seq, language);
  q.node('c', 'actorLifeline', 40, 30, { name: T('고객', 'Customer') });
  typeRole(project, q.node('ui', 'UMLLifeline', 190, 30, { name: 'ui' }), s.orderController);
  typeRole(project, q.node('os', 'UMLLifeline', 430, 30, { name: 'orderService' }), s.orderService);
  typeRole(project, q.node('ord', 'UMLLifeline', 680, 30, { name: 'order' }), s.order);
  typeRole(project, q.node('pg', 'UMLLifeline', 850, 30, { name: 'payment' }), s.paymentService);
  q.node('ref', 'UMLInteractionUse', 20, 110, { name: logIn.name, refersTo: ref(logIn) }, { w: 320, h: 50 });
  const msg = (from, to, sort, name, y) => { const m = q.edge(`message:${sort}`, from, to, {}, { y }); m.name = name; return m; };
  msg('c', 'ui', 'synchCall', 'checkout(cart)', 195);
  msg('ui', 'os', 'synchCall', 'placeOrder(cart)', 225);
  msg('os', 'os', 'synchCall', 'validate(cart)', 255);
  msg('os', 'ord', 'createMessage', 'create(cart)', 315);
  const frag = q.node('alt', 'fragment:alt', 380, 355, {}, { w: 620, h: 190 });
  frag.operands[0].guard = T('결제 성공', 'payment ok');
  q.view('alt').operandRatios = [0.62, 0.38];
  msg('os', 'pg', 'synchCall', 'charge(amount)', 395);
  msg('pg', 'os', 'reply', 'ok', 425);
  msg('os', 'ord', 'synchCall', 'pay()', 465);
  msg('os', 'ord', 'synchCall', 'cancel()', 515);
  msg('os', 'ui', 'reply', 'order', 575);
  msg('ui', 'c', 'reply', T('주문 확인', 'confirmation'), 605);
  const roles = Object.fromEntries((collab.attributes ?? []).map((a) => [a.name, a]));

  // Communication diagram: the same roles in another interaction
  const commInteraction = interaction(T('주문 처리 (커뮤니케이션)', 'Place Order (Communication)'));
  const comm = addDiagram(project, commInteraction._id, 'UMLCommunicationDiagram', { language, name: T('주문 커뮤니케이션', 'Place Order Communication') });
  const k = painter(project, comm, language);
  const repoRole = member(project, collab, 'UMLAttribute', { name: 'orderRepository', type: ref(s.orderRepository) });
  k.drop('c', roles[T('고객', 'Customer')], 65, 30);
  k.drop('ui', roles.ui, 20, 260);
  k.drop('os', roles.orderService, 480, 260);
  k.drop('pg', roles.payment, 480, 480);
  k.drop('ord', roles.order, 980, 260);
  k.drop('repo', repoRole, 900, 480);
  const link = (a, b) => k.edge('UMLConnector', a, b, {}, { style: 'oblique' });
  const say = (connector, name, { forward = true, sort = 'synchCall' } = {}) => { addCommunicationMessage(project, connector, { forward, sort, language }).name = name; };
  const cUi = link('c', 'ui'); const uiOs = link('ui', 'os'); const osOrd = link('os', 'ord'); const osPg = link('os', 'pg'); const osRepo = link('os', 'repo');
  say(cUi, 'checkout(cart)');
  say(uiOs, 'placeOrder(cart)');
  say(osOrd, 'create(cart)', { sort: 'createMessage' });
  say(osPg, 'charge(amount)');
  say(osOrd, 'pay()');
  say(osRepo, 'save(order)');

  // Timing diagram
  const timingInteraction = interaction(T('결제 타이밍', 'Payment Timing'));
  const timing = addDiagram(project, timingInteraction._id, 'UMLTimingDiagram', { language, name: T('결제 타이밍', 'Payment Timing') });
  const t = painter(project, timing, language);
  const adopt = (lifeline, role) => { const made = findById(project, refId(lifeline.represent)); collab.attributes = collab.attributes.filter((a) => a !== made); lifeline.represent = ref(role); };
  // The waveforms start after the name and state columns, whose widths follow the texts:
  // the order lifeline is moved so that both time axes line up (x0 … x0 + span).
  const payLine = t.node('pay', 'UMLTimingLifeline', 40, 70, { name: 'payment', states: 'Idle,Authorizing,Captured' }, { w: 760, h: 170 });
  adopt(payLine, roles.payment);
  const orderLine = t.node('ord', 'UMLTimingLifeline', 63, 290, { name: 'order', states: 'NEW,PAID,SHIPPED' }, { w: 737, h: 170 });
  adopt(orderLine, roles.order);
  for (const [state, duration] of [['Idle', 2], ['Authorizing', 3], ['Captured', 2], ['Idle', 3]]) member(project, payLine, 'UMLTimeSegment', { state, duration });
  for (const [state, duration] of [['NEW', 5], ['PAID', 2], ['SHIPPED', 3]]) member(project, orderLine, 'UMLTimeSegment', { state, duration });
  const x0 = 188; const span = 606;
  const at = (time) => Math.round(x0 + (span * time) / 10);
  for (const time of [0, 2, 5, 7, 10]) t.node(`tick${time}`, 'UMLTimeTick', at(time) - 5, 470, { name: `${time}s` });
  const paid = t.edge('message:synchCall', 'pay', 'ord', {}, { points: [{ x: at(5), y: 200 }, { x: at(5), y: 320 }], style: 'oblique' });
  paid.name = 'paid()';
  t.node('dur', 'UMLDurationConstraint', at(2) + 20, 14, { name: 'authorizationLimit', specification: 'd <= 3s' });
  t.node('time', 'UMLTimeConstraint', at(7) + 10, 14, { name: 'dispatchTime', specification: T('t = 7s: 출고 시작', 't = 7s: dispatch starts') });

  // Interaction overview: an activity whose nodes refer to the interactions
  const overview = addElement(project, s.service._id, 'UMLActivity', { name: T('쇼핑 개요', 'Shopping Overview') });
  const iod = addDiagram(project, overview._id, 'UMLInteractionOverviewDiagram', { language, name: T('쇼핑 인터랙션 개요', 'Shopping Interaction Overview') });
  const o = painter(project, iod, language);
  const use = (key, target, x, y) => o.node(key, 'UMLInteractionUse', x, y, { name: target.name, refersTo: ref(target) }, { w: 220, h: 60 });
  o.node('i', 'UMLInitialNode', 230, 20);
  use('browse', browse, 130, 70);
  o.node('d1', 'UMLDecisionNode', 225, 170, { name: '' });
  use('login', logIn, 130, 230);
  o.node('m', 'UMLMergeNode', 225, 330);
  use('order', placeOrder, 130, 400);
  o.node('d2', 'UMLDecisionNode', 225, 500);
  use('track', track, 130, 570);
  o.node('f', 'UMLActivityFinalNode', 227, 670);
  o.node('f2', 'UMLActivityFinalNode', 470, 172);
  o.edge('UMLControlFlow', 'i', 'browse');
  o.edge('UMLControlFlow', 'browse', 'd1');
  o.edge('UMLControlFlow', 'd1', 'login', { guard: T('구매', 'buy') });
  o.edge('UMLControlFlow', 'd1', 'f2', { guard: T('떠남', 'leave') });
  o.edge('UMLControlFlow', 'login', 'm');
  o.edge('UMLControlFlow', 'm', 'order');
  o.edge('UMLControlFlow', 'order', 'd2');
  o.edge('UMLControlFlow', 'd2', 'track', { guard: T('결제됨', 'paid') });
  o.edge('UMLControlFlow', 'd2', 'm', { guard: T('결제 실패', 'payment failed') }, { points: [{ x: 440, y: 515 }, { x: 440, y: 345 }] });
  o.edge('UMLControlFlow', 'track', 'f');
  s.collab = collab;
  s.placeOrder = placeOrder;
}

function buildActivity(s) {
  const { project, language, T } = s;
  const activity = addElement(project, s.service._id, 'UMLActivity', { name: T('주문 처리', 'Order Fulfilment') });
  const act = addDiagram(project, activity._id, 'UMLActivityDiagram', { language, name: T('주문 처리 흐름', 'Order Fulfilment') });
  const a = painter(project, act, language);
  a.node('lane1', 'UMLActivityPartition', 20, 20, { name: T('고객', 'Customer') }, { w: 230, h: 620 });
  a.node('lane2', 'UMLActivityPartition', 250, 20, { name: T('쇼핑몰', 'Shop') }, { w: 270, h: 620 });
  a.node('lane3', 'UMLActivityPartition', 520, 20, { name: T('창고', 'Warehouse') }, { w: 230, h: 620 });
  a.node('i', 'UMLInitialNode', 125, 70);
  a.node('a1', 'UMLAction', 75, 120, { name: T('주문 제출', 'Submit Order') });
  a.node('obj', 'UMLObjectNode', 310, 112, { name: 'order', type: ref(s.order), inState: 'NEW' });
  a.node('a2', 'UMLAction', 320, 200, { name: T('재고 확인', 'Check Stock') });
  a.node('d', 'UMLDecisionNode', 365, 280);
  a.node('a5', 'UMLAction', 75, 270, { name: T('품절 안내', 'Out of Stock') });
  a.node('ff', 'UMLFlowFinalNode', 123, 360);
  a.node('fork', 'UMLForkNode', 300, 350, {}, { w: 340, h: 6 });
  a.node('a3', 'UMLAction', 290, 390, { name: T('결제', 'Charge') });
  a.node('a4', 'UMLAction', 560, 390, { name: T('상품 포장', 'Pack Items') });
  a.node('join', 'UMLJoinNode', 300, 470, {}, { w: 340, h: 6 });
  a.node('a7', 'action:sendSignal', 315, 505, { name: T('배송 알림', 'Notify Shipping') });
  a.node('f', 'UMLActivityFinalNode', 367, 590);
  a.node('a6', 'action:acceptSignal', 60, 505, { name: T('배송 알림 받기', 'Receive Notice') });
  a.node('ff2', 'UMLFlowFinalNode', 123, 590);
  a.edge('UMLControlFlow', 'i', 'a1');
  a.edge('UMLObjectFlow', 'a1', 'obj');
  a.edge('UMLObjectFlow', 'obj', 'a2');
  a.edge('UMLControlFlow', 'a2', 'd');
  a.edge('UMLControlFlow', 'd', 'fork', { guard: T('있음', 'in stock') });
  a.edge('UMLControlFlow', 'd', 'a5', { guard: T('없음', 'none') });
  a.edge('UMLControlFlow', 'a5', 'ff');
  a.edge('UMLControlFlow', 'fork', 'a3');
  a.edge('UMLControlFlow', 'fork', 'a4');
  a.edge('UMLControlFlow', 'a3', 'join');
  a.edge('UMLControlFlow', 'a4', 'join');
  a.edge('UMLControlFlow', 'join', 'a7');
  a.edge('UMLControlFlow', 'a7', 'f');
  a.edge('UMLControlFlow', 'a6', 'ff2');
}

function buildUseCases(s) {
  const { project, language, T } = s;
  const ucd = addDiagram(project, s.model._id, 'UMLUseCaseDiagram', { language, name: T('유스케이스', 'Use Cases') });
  const u = painter(project, ucd, language);
  u.node('sys', 'UMLUseCaseSubject', 230, 30, { name: T('온라인 쇼핑몰', 'Online Shop') }, { w: 420, h: 500 });
  s.actorCustomer = u.node('cust', 'UMLActor', 80, 170, { name: T('고객', 'Customer') });
  u.node('vip', 'UMLActor', 80, 400, { name: T('VIP 고객', 'VIP Customer') });
  u.node('admin', 'UMLActor', 740, 100, { name: T('관리자', 'Administrator') });
  s.actorPayment = u.node('pay', 'UMLActor', 740, 360, { name: T('결제 대행사', 'Payment Provider') });
  u.node('browse', 'UMLUseCase', 270, 70, { name: T('상품 둘러보기', 'Browse Products') });
  u.node('manage', 'UMLUseCase', 470, 90, { name: T('상품 관리', 'Manage Products') });
  const order = u.node('order', 'UMLUseCase', 270, 190, { name: T('주문하기', 'Place Order') });
  member(project, order, 'UMLExtensionPoint', { name: T('할인', 'discount') });
  u.node('login', 'UMLUseCase', 480, 200, { name: T('로그인', 'Log In') });
  u.node('coupon', 'UMLUseCase', 490, 320,{ name: T('쿠폰 적용', 'Apply Coupon') });
  u.node('payuc', 'UMLUseCase', 270, 340, { name: T('결제하기', 'Pay') });
  u.node('track', 'UMLUseCase', 270, 450, { name: T('배송 조회', 'Track Shipment') });
  const line = (tool, a, b, attrs = {}) => u.edge(tool, a, b, attrs, { style: 'oblique' });
  line('UMLAssociation', 'cust', 'browse'); line('UMLAssociation', 'cust', 'order'); line('UMLAssociation', 'cust', 'track');
  line('UMLAssociation', 'admin', 'manage'); line('UMLAssociation', 'pay', 'payuc');
  line('UMLGeneralization', 'vip', 'cust');
  line('UMLInclude', 'order', 'payuc'); line('UMLInclude', 'order', 'login');
  line('UMLExtend', 'coupon', 'order', { condition: T('쿠폰이 있음', 'has a coupon'), extensionLocations: T('할인', 'discount') });
  s.ucOrder = order;
}

function buildInformationFlow(s) {
  const { project, language, T } = s;
  const diagram = addDiagram(project, s.model._id, 'UMLInformationFlowDiagram', { language, name: T('정보 흐름', 'Information Flows') });
  const p = painter(project, diagram, language);
  p.show('cust', s.actorCustomer, 40, 200);
  p.show('sys', s.orderingSystem, 300, 210);
  p.show('pay', s.actorPayment, 760, 40);
  p.node('wh', 'UMLActor', 760, 380, { name: T('물류 센터', 'Warehouse') });
  const item = (key, name, x) => p.node(key, 'UMLInformationItem', x, 560, { name });
  item('i1', 'OrderInfo', 40); item('i2', 'PaymentRequest', 220); item('i3', 'PaymentResult', 420); item('i4', 'ShippingRequest', 610); item('i5', 'DeliveryNotice', 800);
  const flow = (a, b, conveyed, points) => p.edge('UMLInformationFlow', a, b, { conveyed }, { points, style: 'oblique' });
  flow('cust', 'sys', 'OrderInfo');
  flow('sys', 'pay', 'PaymentRequest');
  flow('pay', 'sys', 'PaymentResult', [{ x: 650, y: 236 }]);
  flow('sys', 'wh', 'ShippingRequest');
  flow('wh', 'cust', 'DeliveryNotice', [{ x: 680, y: 500 }, { x: 15, y: 500 }, { x: 15, y: 240 }]);
}

// ───────────────────────── other notations

function buildErd(s) {
  const { project, language, T } = s;
  const dataModel = addElement(project, project._id, 'ERDDataModel', { name: T('데이터 모델', 'Data Model') });
  const erd = addDiagram(project, dataModel._id, 'ERDDiagram', { language, name: T('쇼핑몰 데이터베이스', 'Shop Database') });
  const e = painter(project, erd, language);
  const col = (entity, name, type, extra = {}) => member(project, entity, 'ERDColumn', { name, type, ...extra });
  const ec = e.node('c', 'ERDEntity', 40, 40, { name: 'customer' });
  col(ec, 'email', 'VARCHAR', { length: '200', unique: true });
  col(ec, 'name', 'VARCHAR', { length: '100' });
  const eo = e.node('o', 'ERDEntity', 340, 40, { name: 'orders' });
  col(eo, 'customer_id', 'INTEGER', { foreignKey: true, referenceTo: ref(ec.columns[0]) });
  col(eo, 'ordered_at', 'TIMESTAMP');
  col(eo, 'status', 'VARCHAR', { length: '20' });
  const epay = e.node('pay', 'ERDEntity', 660, 40, { name: 'payment' });
  col(epay, 'order_id', 'INTEGER', { foreignKey: true, unique: true, referenceTo: ref(eo.columns[0]) });
  col(epay, 'amount', 'DECIMAL', { length: '10,2' });
  col(epay, 'paid_at', 'TIMESTAMP', { nullable: true });
  const el = e.node('l', 'ERDEntity', 340, 260, { name: 'order_line' });
  col(el, 'order_id', 'INTEGER', { foreignKey: true, referenceTo: ref(eo.columns[0]) });
  col(el, 'product_id', 'INTEGER', { foreignKey: true });
  col(el, 'quantity', 'INTEGER');
  const ep = e.node('p', 'ERDEntity', 660, 260, { name: 'product' });
  col(ep, 'category_id', 'INTEGER', { foreignKey: true });
  col(ep, 'name', 'VARCHAR', { length: '200' });
  col(ep, 'price', 'DECIMAL', { length: '10,2' });
  const ek = e.node('k', 'ERDEntity', 980, 260, { name: 'category' });
  col(ek, 'name', 'VARCHAR', { length: '50', unique: true });
  el.columns[2].referenceTo = ref(ep.columns[0]);
  ep.columns[1].referenceTo = ref(ek.columns[0]);
  e.edge('erd:1:0..*', 'c', 'o');
  e.edge('erd:1:0..1', 'o', 'pay');
  e.edge('erd:1:0..*', 'o', 'l', { end2: { cardinality: '1..*' } });
  e.edge('erd:1:0..*', 'p', 'l');
  e.edge('erd:1:0..*:n', 'k', 'p');
}

function buildFlowchart(s) {
  const { project, language, T } = s;
  const fcModel = addElement(project, project._id, 'FCFlowchart', { name: T('순서도', 'Flowcharts') });
  const fc = addDiagram(project, fcModel._id, 'FCFlowchartDiagram', { language, name: T('결제 순서도', 'Payment Flow') });
  const f = painter(project, fc, language);
  // Main column centred on x = 330.
  f.node('s', 'FCTerminator', 280, 20, { name: T('시작', 'Start') }, { w: 100, h: 40 });
  f.node('prep', 'FCPreparation', 260, 95, { name: T('시도 횟수 = 0', 'tries = 0') }, { w: 140, h: 50 });
  f.node('in', 'FCManualInput', 260, 180, { name: T('카드 정보 입력', 'Enter Card') }, { w: 140, h: 56 });
  f.node('call', 'FCPredefinedProcess', 260, 270, { name: T('승인 요청', 'Authorize') }, { w: 140, h: 50 });
  f.node('d', 'FCDecision', 260, 355, { name: T('승인?', 'Approved?') }, { w: 140, h: 76 });
  f.node('ok', 'FCProcess', 260, 470, { name: T('영수증 발행', 'Issue Receipt') }, { w: 140, h: 50 });
  f.node('e', 'FCTerminator', 280, 570, { name: T('끝', 'End') }, { w: 100, h: 40 });
  f.node('db', 'FCDatabase', 60, 260, { name: T('결제 기록', 'Payments') }, { w: 110, h: 70 });
  f.node('doc', 'FCDocument', 60, 465, { name: T('영수증', 'Receipt') }, { w: 110, h: 60 });
  f.node('d2', 'FCDecision', 480, 355, { name: T('3회 미만?', 'tries < 3?') }, { w: 150, h: 76 });
  f.node('fail', 'FCDisplay', 680, 365, { name: T('실패 안내', 'Show Failure') }, { w: 140, h: 56 });
  f.edge('FCFlow', 's', 'prep'); f.edge('FCFlow', 'prep', 'in'); f.edge('FCFlow', 'in', 'call'); f.edge('FCFlow', 'call', 'd');
  f.edge('FCFlow', 'call', 'db');
  f.edge('FCFlow', 'd', 'ok', { name: T('예', 'Yes') }); f.edge('FCFlow', 'ok', 'doc'); f.edge('FCFlow', 'ok', 'e');
  f.edge('FCFlow', 'd', 'd2', { name: T('아니오', 'No') });
  f.edge('FCFlow', 'd2', 'in', { name: T('예', 'Yes') }, { points: [{ x: 555, y: 208 }] });
  f.edge('FCFlow', 'd2', 'fail', { name: T('아니오', 'No') });
  f.edge('FCFlow', 'fail', 'e', {}, { points: [{ x: 750, y: 590 }] });
}

function buildDfd(s) {
  const { project, language, T } = s;
  const dfdModel = addElement(project, project._id, 'DFDDataFlowModel', { name: T('데이터 흐름', 'Data Flows') });
  const diagram = addDiagram(project, dfdModel._id, 'DFDDiagram', { language, name: T('주문 처리 DFD (레벨 1)', 'Order Processing DFD (Level 1)') });
  const d = painter(project, diagram, language);
  d.node('cust', 'DFDExternalEntity', 40, 260, { name: T('고객', 'Customer') });
  d.node('p1', 'DFDProcess', 300, 40, { name: T('상품 검색', 'Search Products'), id: '1.0' });
  d.node('p2', 'DFDProcess', 300, 270, { name: T('주문 접수', 'Take Order'), id: '2.0' });
  d.node('p3', 'DFDProcess', 600, 270, { name: T('결제 처리', 'Process Payment'), id: '3.0' });
  d.node('p4', 'DFDProcess', 300, 490, { name: T('배송 처리', 'Ship Order'), id: '4.0' });
  d.node('d1', 'DFDDataStore', 600, 70, { name: T('상품', 'Products'), id: 'D1' });
  d.node('d2', 'DFDDataStore', 600, 500, { name: T('주문', 'Orders'), id: 'D2' });
  d.node('pg', 'DFDExternalEntity', 880, 290, { name: T('결제 대행사', 'Payment Provider') });
  d.node('wh', 'DFDExternalEntity', 40, 520, { name: T('물류 센터', 'Warehouse') });
  const flow = (a, b, ko, en, points) => d.edge('DFDDataFlow', a, b, { name: T(ko, en) }, { style: 'oblique', points });
  flow('cust', 'p1', '검색어', 'search terms', [{ x: 140, y: 90 }]);
  flow('p1', 'cust', '상품 목록', 'product list', [{ x: 230, y: 200 }]);
  flow('d1', 'p1', '상품 정보', 'product data');
  flow('cust', 'p2', '주문 내용', 'order details');
  flow('p2', 'p3', '결제 요청', 'payment request');
  flow('p3', 'pg', '카드 승인 요청', 'card authorization');
  flow('pg', 'p3', '승인 결과', 'approval', [{ x: 820, y: 380 }]);
  flow('p3', 'd2', '결제된 주문', 'paid order');
  flow('d2', 'p4', '출고할 주문', 'orders to ship');
  flow('p4', 'wh', '출고 지시', 'shipping order');
  flow('p4', 'cust', '배송 알림', 'delivery notice', [{ x: 200, y: 450 }]);
}

function buildSysml(s) {
  const { project, language, T } = s;
  const sysml = addElement(project, project._id, 'UMLModel', { name: T('시스템 모델 (SysML)', 'System Model (SysML)'), documentation: T('쇼핑몰 시스템의 요구사항과 블록', 'Requirements and blocks of the shop system') });
  // Requirement diagram
  const reqd = addDiagram(project, sysml._id, 'SysMLRequirementDiagram', { language, name: T('쇼핑몰 요구사항', 'Shop Requirements') });
  const r = painter(project, reqd, language);
  const req = (key, x, y, id, ko, en, textKo, textEn, extra = {}) => r.node(key, 'SysMLRequirement', x, y, { name: T(ko, en), id, text: T(textKo, textEn), ...extra });
  req('r0', 330, 30, 'REQ-0', '쇼핑몰', 'Online Shop', '고객이 상품을 주문하고 결제한다', 'Customers order and pay online');
  req('r1', 40, 230, 'REQ-1', '응답 시간', 'Response Time', '주문은 2초 안에 끝난다', 'An order completes within 2 s', { risk: 'medium', verifyMethod: 'test' });
  req('r2', 340, 230, 'REQ-2', '안전한 결제', 'Secure Payment', '카드 정보를 보호한다', 'Card data is protected', { risk: 'high', verifyMethod: 'inspection' });
  req('r3', 640, 230, 'REQ-3', '가용성', 'Availability', '월 99.9% 이상 운영한다', 'Up 99.9% of each month', { risk: 'medium', verifyMethod: 'analysis' });
  req('r21', 340, 430, 'REQ-2.1', '카드 정보 비저장', 'No Stored Card Data', '카드 번호를 저장하지 않는다', 'Card numbers are never stored', { risk: 'high', verifyMethod: 'inspection' });
  r.node('test', 'UMLUseCase', 40, 450, { name: T('부하 시험', 'Load Test'), stereotype: 'testCase' });
  r.show('uc', s.ucOrder, 60, 70);
  r.node('pgw', 'SysMLBlock', 660, 450, { name: 'PaymentGatewayAdapter' });
  // Containment lines meet in one crosshair under the parent.
  r.edge('UMLContainment', 'r1', 'r0', {}, { points: [{ x: 140, y: 190 }, { x: 460, y: 190 }] });
  r.edge('UMLContainment', 'r2', 'r0', {}, { points: [{ x: 460, y: 190 }] });
  r.edge('UMLContainment', 'r3', 'r0', {}, { points: [{ x: 735, y: 190 }, { x: 460, y: 190 }] });
  r.edge('SysMLDeriveReqt', 'r21', 'r2');
  r.edge('SysMLVerify', 'test', 'r1');
  r.edge('SysMLRefine', 'uc', 'r1');
  r.edge('SysMLSatisfy', 'pgw', 'r21');
  r.edge('SysMLTrace', 'pgw', 'r3', {}, { points: [{ x: 760, y: 400 }] });

  // Block definition diagram
  const bdd = addDiagram(project, sysml._id, 'SysMLBlockDefinitionDiagram', { language, name: T('쇼핑몰 블록 정의', 'Shop Block Definition') });
  const b = painter(project, bdd, language);
  const money = b.node('money', 'SysMLValueType', 40, 520, { name: 'Money', unit: 'KRW' });
  member(project, money, 'UMLAttribute', { name: 'amount', type: 'Real' });
  const percent = b.node('pct', 'SysMLValueType', 180, 520, { name: 'Percentage', unit: '%' });
  member(project, percent, 'UMLAttribute', { name: 'value', type: 'Real' });
  const kg = b.node('kg', 'SysMLValueType', 340, 520, { name: 'Kilogram', unit: 'kg' });
  member(project, kg, 'UMLAttribute', { name: 'value', type: 'Real' });
  const ipay = b.node('ipay', 'SysMLInterfaceBlock', 520, 520, { name: 'IPayment' });
  op(project, ipay, 'charge', [['amount', 'Money']], 'Boolean', { isAbstract: true });
  const block = (key, name, x, y) => b.node(key, 'SysMLBlock', x, y, { name });
  const system = block('sys', 'OnlineShopSystem', 340, 30);
  const web = block('web', 'WebFrontend', 40, 300);
  const orders = block('ord', 'OrderEngine', 250, 300);
  const payments = block('pay', 'PaymentUnit', 520, 300);
  const db = block('db', 'Database', 720, 300);
  member(project, system, 'SysMLValue', { name: 'availability', type: ref(percent) });
  member(project, orders, 'SysMLValue', { name: 'responseTime', type: 'Real' });
  op(project, orders, 'placeOrder', [['cart', 'Cart']], 'Order');
  member(project, db, 'SysMLValue', { name: 'capacity', type: 'Integer' });
  const port = (owner, name, type) => member(project, owner, 'SysMLPort', { name, type });
  s.ports = {
    sysHttp: port(system, 'http', 'HTTPS'),
    webIn: port(web, 'in', 'HTTPS'), webApi: port(web, 'api', 'REST'),
    ordApi: port(orders, 'api', 'REST'), ordPay: port(orders, 'pay', ref(ipay)), ordData: port(orders, 'data', 'SQL'),
    payIn: port(payments, 'in', ref(ipay)), dbSql: port(db, 'sql', 'SQL'),
  };
  s.parts = {
    web: member(project, system, 'SysMLPart', { name: 'web', type: ref(web) }),
    orders: member(project, system, 'SysMLPart', { name: 'orders', type: ref(orders) }),
    payments: member(project, system, 'SysMLPart', { name: 'payments', type: ref(payments) }),
    db: member(project, system, 'SysMLPart', { name: 'db', type: ref(db) }),
  };
  const part = (key, name) => b.edge('composition', 'sys', key, { end2: { multiplicity: '1', name } }, { style: 'oblique' });
  part('web', 'web'); part('ord', 'orders'); part('pay', 'payments'); part('db', 'db');
  b.edge('UMLInterfaceRealization', 'pay', 'ipay');
  const priceEq = b.node('tp', 'SysMLConstraintBlock', 40, 660, { name: 'TotalPriceEq', constraint: 'total = subtotal - discount + shippingFee' });
  const feeEq = b.node('sf', 'SysMLConstraintBlock', 440, 660, { name: 'ShippingFeeEq', constraint: 'fee = if (weight > 5) 5000 else 3000' });
  const param = (owner, name, type) => member(project, owner, 'SysMLConstraintParameter', { name, type });
  s.params = {
    subtotal: param(priceEq, 'subtotal', ref(money)), discount: param(priceEq, 'discount', ref(money)), shippingFee: param(priceEq, 'shippingFee', ref(money)), total: param(priceEq, 'total', ref(money)),
    weight: param(feeEq, 'weight', ref(kg)), fee: param(feeEq, 'fee', ref(money)),
  };
  b.show('cust', s.actorCustomer, 100, 60);
  b.edge('UMLAssociation', 'cust', 'sys');
  Object.assign(s, { sysml, system, money, kg, priceEq, feeEq });

  // Internal block diagram
  const ibd = addDiagram(project, sysml._id, 'SysMLInternalBlockDiagram', { language, name: T('쇼핑몰 내부 블록', 'Shop Internal Blocks') });
  const i = painter(project, ibd, language);
  i.annotation('frame', 'UMLFrameView', 140, 30, 'ibd [Block] OnlineShopSystem', { w: 820, h: 380 });
  i.show('cust', s.actorCustomer, 30, 155);
  i.show('web', s.parts.web, 220, 150, { w: 150, h: 90 });
  i.show('ord', s.parts.orders, 460, 150, { w: 150, h: 90 });
  i.show('pay', s.parts.payments, 760, 90, { w: 150, h: 70 });
  i.show('db', s.parts.db, 760, 280, { w: 150, h: 70 });
  const ps = s.ports;
  i.show('sysHttp', ps.sysHttp, 132, 187);
  i.show('webIn', ps.webIn, 212, 187);
  i.show('webApi', ps.webApi, 362, 187);
  i.show('ordApi', ps.ordApi, 452, 187);
  i.show('ordPay', ps.ordPay, 602, 158);
  i.show('ordData', ps.ordData, 602, 212);
  i.show('payIn', ps.payIn, 752, 117);
  i.show('dbSql', ps.dbSql, 752, 307);
  const conn = (a, b2, points) => i.edge('SysMLConnector', a, b2, {}, { points });
  conn('cust', 'sysHttp'); conn('sysHttp', 'webIn'); conn('webApi', 'ordApi');
  conn('ordPay', 'payIn', [{ x: 680, y: 166 }, { x: 680, y: 125 }]);
  conn('ordData', 'dbSql', [{ x: 680, y: 220 }, { x: 680, y: 315 }]);
  i.edge('SysMLItemFlow', 'web', 'ord', { name: 'order: Order', itemProperty: 'order' }, { points: [{ x: 295, y: 290 }, { x: 535, y: 290 }] });

  // Parametric diagram
  const par = addDiagram(project, sysml._id, 'SysMLParametricDiagram', { language, name: T('주문 금액 계산', 'Order Price Calculation') });
  const m = painter(project, par, language);
  const pricing = addElement(project, sysml._id, 'SysMLBlock', { name: 'OrderPricing', documentation: T('주문 금액을 계산하는 값들', 'The values an order price is computed from') });
  const value = (name, type) => member(project, pricing, 'SysMLPart', { name, type: ref(type) });
  const v = { subtotal: value('subtotal', money), discount: value('discount', money), weight: value('weight', kg), shippingFee: value('shippingFee', money), total: value('total', money) };
  m.annotation('frame', 'UMLFrameView', 20, 20, 'par [Block] OrderPricing', { w: 860, h: 420 });
  m.node('tp', 'SysMLConstraintProperty', 380, 80, { name: 'tp', type: ref(priceEq) }, { w: 220, h: 120 });
  m.node('sf', 'SysMLConstraintProperty', 380, 290, { name: 'sf', type: ref(feeEq) }, { w: 220, h: 90 });
  m.show('subtotal', v.subtotal, 60, 70, { w: 170, h: 44 });
  m.show('discount', v.discount, 60, 150, { w: 170, h: 44 });
  m.show('weight', v.weight, 60, 310, { w: 170, h: 44 });
  m.show('fee', v.shippingFee, 680, 300, { w: 170, h: 44 });
  m.show('total', v.total, 680, 118, { w: 170, h: 44 });
  const pp = s.params;
  m.show('pSubtotal', pp.subtotal, 372, 84);
  m.show('pDiscount', pp.discount, 372, 164);
  m.show('pTotal', pp.total, 592, 132);
  m.show('pFee', pp.shippingFee, 470, 192);
  m.show('pWeight', pp.weight, 372, 324);
  m.show('pOut', pp.fee, 592, 314);
  const bind = (a, b2, points) => m.edge('SysMLConnector', a, b2, {}, { points });
  bind('subtotal', 'pSubtotal', [{ x: 300, y: 92 }]); bind('discount', 'pDiscount', [{ x: 300, y: 172 }]); bind('pTotal', 'total');
  bind('weight', 'pWeight'); bind('pOut', 'fee');
  bind('fee', 'pFee', [{ x: 765, y: 250 }, { x: 478, y: 250 }]);
}

function buildBpmn(s) {
  const { project, language, T } = s;
  const process = addElement(project, project._id, 'BPMNProcess', { name: T('주문 처리 프로세스', 'Order Process'), isExecutable: true });
  const diagram = addDiagram(project, process._id, 'BPMNDiagram', { language, name: T('주문 처리 (BPMN)', 'Order Handling (BPMN)') });
  const b = painter(project, diagram, language);
  b.node('cust', 'BPMNParticipant', 20, 20, { name: T('고객', 'Customer') }, { w: 1240, h: 70 });
  b.node('shop', 'BPMNParticipant', 20, 130, { name: T('온라인 쇼핑몰', 'Online Shop') }, { w: 1240, h: 460 });
  b.node('sales', 'BPMNLane', 52, 130, { name: T('영업', 'Sales') }, { w: 1208, h: 250 });
  b.node('wh', 'BPMNLane', 52, 380, { name: T('창고', 'Warehouse') }, { w: 1208, h: 210 });
  // Sales: the main path runs along y = 260, exceptions above (out of stock) and below (payment failure).
  b.node('start', 'BPMNStartEvent:message', 100, 242, { name: T('주문 받음', 'Order received') });
  b.node('check', 'task:user', 170, 228, { name: T('주문 확인', 'Check order') });
  b.node('data', 'BPMNDataObject', 205, 314, { name: T('주문서', 'Order form') });
  b.node('stock', 'BPMNExclusiveGateway', 320, 239, { name: T('재고 있음?', 'In stock?') });
  b.node('sorry', 'task:send', 400, 140, { name: T('품절 안내', 'Notify out of stock') });
  b.node('end2', 'BPMNEndEvent', 590, 154,{ name: T('주문 취소', 'Cancelled') });
  const charge = b.node('charge', 'task:service', 410, 228, { name: T('카드 결제', 'Charge card') });
  b.node('err', 'BPMNBoundaryEvent', 442, 274, { name: '', eventKind: 'error', attachedToRef: ref(charge) });
  b.node('failMsg', 'task:send', 380, 312, { name: T('결제 실패 안내', 'Notify payment failure') });
  b.node('end3', 'BPMNEndEvent:error', 300, 326, { name: '' });
  b.node('note', 'BPMNTextAnnotation', 680, 140, { text: T('결제는 신용카드만 받는다', 'Credit cards only') }, { w: 210, h: 36 });
  b.node('split', 'BPMNParallelGateway', 600, 239);
  b.node('invoice', 'task:send', 700, 228, { name: T('영수증 발송', 'Send receipt') });
  // Warehouse: y = 470.
  b.node('pack', 'task:manual', 700, 438, { name: T('상품 포장', 'Pack items') });
  b.node('join', 'BPMNParallelGateway', 860, 449);
  b.node('wait', 'BPMNIntermediateEvent:timer', 950, 452, { name: T('택배 수거 대기', 'Wait for courier') });
  b.node('ship', 'BPMNTask', 1030, 438, { name: T('출고', 'Ship order') });
  b.node('end', 'BPMNEndEvent:message', 1190, 452, { name: T('배송 시작 알림', 'Shipment notice') });
  b.node('store', 'BPMNDataStore', 1058, 520, { name: T('주문 DB', 'Orders DB') });
  const seq = (a, c, attrs = {}, points) => b.edge('BPMNSequenceFlow', a, c, attrs, { points });
  seq('start', 'check'); seq('check', 'stock');
  seq('stock', 'charge', { name: T('예', 'yes') });
  seq('stock', 'sorry', { name: T('아니오', 'no') }, [{ x: 341, y: 172 }]);
  seq('sorry', 'end2');
  seq('charge', 'split');
  seq('err', 'failMsg', {}, [{ x: 460, y: 344 }]);
  seq('failMsg', 'end3');
  seq('split', 'invoice');
  seq('split', 'pack', {}, [{ x: 621, y: 470 }]);
  seq('invoice', 'join', {}, [{ x: 881, y: 260 }]);
  seq('pack', 'join'); seq('join', 'wait'); seq('wait', 'ship'); seq('ship', 'end');
  b.edge('BPMNMessageFlow', 'cust', 'start', { name: T('주문', 'order') }, { points: [{ x: 118, y: 90 }] });
  b.edge('BPMNMessageFlow', 'end', 'cust', { name: T('배송 알림', 'notice') }, { points: [{ x: 1208, y: 90 }] });
  b.edge('BPMNDataAssociation', 'check', 'data');
  b.edge('BPMNDataAssociation', 'ship', 'store');
  b.edge('BPMNAssociation', 'note', 'charge', {}, { style: 'oblique' });
}

function buildC4(s) {
  const { project, language, T } = s;
  const c4 = addElement(project, project._id, 'C4Model', { name: 'C4' });
  const diagram = addDiagram(project, c4._id, 'C4Diagram', { language, name: T('시스템 컨텍스트', 'System Context') });
  const p = painter(project, diagram, language);
  p.node('cust', 'C4Person', 40, 30, { name: T('고객', 'Customer'), description: T('상품을 주문한다', 'Orders products') });
  p.node('admin', 'C4Person', 40, 360, { name: T('관리자', 'Administrator'), description: T('상품과 주문을 관리한다', 'Manages products and orders') });
  p.node('boundary', 'C4Boundary', 380, 160, { name: T('쇼핑몰 회사', 'Shop Company'), boundaryKind: 'enterprise' }, { w: 260, h: 230 });
  p.node('shop', 'C4SoftwareSystem', 420, 190, { name: T('온라인 쇼핑몰', 'Online Shop'), description: T('상품 목록과 주문', 'Catalogue and orders') });
  p.node('pay', 'externalSystem', 840, 20, { name: T('결제 대행사', 'Payment Provider'), description: T('카드 결제를 승인한다', 'Authorizes card payments') });
  p.node('mail', 'externalSystem', 840, 220, { name: T('메일 서비스', 'E-mail Service'), description: T('주문 메일을 보낸다', 'Sends order e-mails') });
  p.node('wh', 'externalSystem', 840, 420, { name: T('물류 시스템', 'Logistics System'), description: T('상품을 배송한다', 'Delivers parcels') });
  const rel = (a, b, ko, en, technology) => p.edge('C4Relationship', a, b, { name: T(ko, en), technology }, { style: 'oblique' });
  rel('cust', 'shop', '주문한다', 'Places orders', 'HTTPS');
  rel('admin', 'shop', '관리한다', 'Manages', 'HTTPS');
  rel('shop', 'pay', '결제를 요청한다', 'Charges', 'REST');
  rel('shop', 'mail', '메일을 보낸다', 'Sends e-mail', 'SMTP');
  rel('shop', 'wh', '배송을 요청한다', 'Requests delivery', 'REST');
}

function buildMindmap(s) {
  const { project, language, T } = s;
  const map = addElement(project, project._id, 'MMMindmap', { name: T('마인드맵', 'Mind Maps') });
  const diagram = addDiagram(project, map._id, 'MMMindmapDiagram', { language, name: T('쇼핑몰 오픈 계획', 'Shop Launch Plan') });
  const p = painter(project, diagram, language);
  const root = p.node('root', 'MMNode', 420, 270, { name: T('쇼핑몰 오픈', 'Shop Launch') });
  const branch = (key, parentKey, parent, name, x, y) => { const child = addElement(project, parent._id, 'MMNode', { name }); p.show(key, child, x, y); p.edge('branch', parentKey, key); return child; };
  const plan = [
    [T('상품', 'Products'), 700, 60, [[T('카탈로그 구성', 'Catalogue'), 900, 20], [T('가격 정책', 'Pricing'), 900, 70], [T('사진 촬영', 'Photos'), 900, 120]]],
    [T('기술', 'Technology'), 700, 300, [[T('웹 앱', 'Web app'), 900, 220], [T('결제 연동', 'Payments'), 900, 270], [T('클라우드 배치', 'Cloud hosting'), 900, 320], [T('보안 점검', 'Security review'), 900, 370]]],
    [T('운영', 'Operations'), 700, 480, [[T('물류 계약', 'Logistics contract'), 900, 460], [T('고객 센터', 'Customer service'), 900, 510]]],
    [T('마케팅', 'Marketing'), 200, 110, [[T('SNS 광고', 'Social ads'), 20, 50], [T('오픈 쿠폰', 'Launch coupons'), 20, 100], [T('블로그', 'Blog'), 20, 150]]],
    [T('일정', 'Schedule'), 200, 300, [[T('베타 (9월)', 'Beta (Sep)'), 20, 270], [T('정식 오픈 (11월)', 'Launch (Nov)'), 20, 320]]],
    [T('위험', 'Risks'), 200, 470, [[T('결제 장애', 'Payment outage'), 20, 440], [T('재고 부족', 'Stock shortage'), 20, 490]]],
  ];
  plan.forEach(([name, x, y, children], i) => {
    const child = branch(`b${i}`, 'root', root, name, x, y);
    children.forEach(([leaf, lx, ly], j) => branch(`b${i}_${j}`, `b${i}`, child, leaf, lx, ly));
  });
}

function buildWireframe(s) {
  const { project, language, T } = s;
  const wireframes = addElement(project, project._id, 'WFWireframe', { name: T('화면 설계', 'Screens') });
  const diagram = addDiagram(project, wireframes._id, 'WFWireframeDiagram', { language, name: T('주문서 화면', 'Checkout Screen') });
  const w = painter(project, diagram, language);
  w.node('page', 'WFWebFrame', 20, 20, { name: 'https://shop.example.com/checkout' }, { w: 640, h: 560 });
  w.node('logo', 'WFIcon', 44, 62, { name: 'logo' });
  w.node('title', 'WFText', 76, 62, { name: T('온라인 쇼핑몰', 'Online Shop') });
  w.node('home', 'WFLink', 470, 64, { name: T('장바구니로', 'Back to cart') });
  w.node('avatar', 'WFAvatar', 600, 52, { name: 'user' }, { w: 32, h: 32 });
  w.node('div', 'WFDivider', 40, 92, { name: '' }, { w: 600, h: 10 });
  w.node('steps', 'WFProgress', 44, 112, { name: '' }, { w: 592, h: 10 });
  w.node('h1', 'WFText', 44, 134, { name: T('배송 정보', 'Shipping details') }, {}, { bold: true });
  w.node('name', 'WFInput', 44, 162, { name: T('받는 사람', 'Recipient') }, { w: 280, h: 30 });
  w.node('phone', 'WFInput', 336, 162, { name: T('전화번호', 'Phone') }, { w: 280, h: 30 });
  w.node('addr', 'WFTextArea', 44, 204, { name: T('주소', 'Address') }, { w: 572, h: 60 });
  w.node('ship', 'WFDropdown', 44, 276, { name: T('일반 배송 (3,000원)', 'Standard (3,000)'), items: T('일반 배송,빠른 배송', 'Standard,Express') }, { w: 280, h: 30 });
  w.node('h2', 'WFText', 44, 322, { name: T('결제 수단', 'Payment') }, {}, { bold: true });
  w.node('card', 'WFRadio', 44, 348, { name: T('신용카드', 'Credit card'), checked: true });
  w.node('bank', 'WFRadio', 180, 348, { name: T('계좌 이체', 'Bank transfer') });
  w.node('summary', 'WFPanel', 336, 276, { name: T('주문 요약', 'Order summary') }, { w: 280, h: 130 });
  w.node('img', 'WFImage', 348, 310, { name: '' }, { w: 70, h: 56 });
  w.node('items', 'WFList', 428, 310, { name: '', items: T('UML 입문 × 2,커피 원두 × 1,합계 68000원', 'UML Distilled × 2,Coffee beans × 1,Total 68000') }, { w: 176, h: 84 });
  w.node('table', 'WFTable', 44, 420, { name: '', items: T('상품,수량,금액', 'Product,Qty,Price') }, { w: 572, h: 84 });
  w.node('agree', 'WFCheckbox', 44, 520, { name: T('주문 내용에 동의합니다', 'I agree to the terms'), checked: true });
  w.node('pay', 'WFButton', 496, 512, { name: T('68,000원 결제', 'Pay 68,000') }, { w: 120, h: 34 });
  w.node('phoneFrame', 'WFMobileFrame', 720, 20, { name: T('모바일', 'Mobile') }, { w: 240, h: 480 });
  w.node('mTitle', 'WFText', 744, 70, { name: T('주문서', 'Checkout') }, {}, { bold: true });
  w.node('mTabs', 'WFTabList', 740, 100, { name: '', items: T('배송,결제,확인', 'Ship,Pay,Done') }, { w: 200, h: 30 });
  w.node('mName', 'WFInput', 740, 144, { name: T('이름', 'Name') }, { w: 200, h: 30 });
  w.node('mAddr', 'WFInput', 740, 186, { name: T('배송지', 'Delivery address') }, { w: 200, h: 30 });
  w.node('mFast', 'WFSwitch', 740, 230, { name: T('빠른 배송', 'Express'), checked: false });
  w.node('mQty', 'WFSlider', 740, 270, { name: '' }, { w: 200, h: 24 });
  w.node('mTotal', 'WFText', 744, 310, { name: T('합계 68,000원', 'Total 68,000') }, {}, { bold: true });
  w.node('mAgree', 'WFCheckbox', 744, 350, { name: T('주문 내용에 동의', 'I agree'), checked: true });
  w.node('mBack', 'WFLink', 744, 390, { name: T('쇼핑 계속하기', 'Continue shopping') });
  w.node('mPay', 'WFButton', 740, 430, { name: T('결제하기', 'Pay now') }, { w: 200, h: 36 });
}

function buildCloud(s) {
  const { project, language, T } = s;
  // One cloud model per provider (each has its own "Customers", "Orders DB" …).
  const cloudModel = (name) => addElement(project, project._id, 'CloudModel', { name });
  const svc = (p, key, service, x, y, name = service) => p.node(key, `service:${service}`, x, y, { name });
  // Lines leave and enter the tiles by their sides or tops: the names are written below the tiles.
  const link = (p, a, b, points) => p.edge('CloudConnection', a, b, {}, { points });

  // AWS
  const aws = addDiagram(project, cloudModel('AWS')._id, 'AWSDiagram', { language, name: T('AWS 배치', 'AWS Deployment') });
  const a = painter(project, aws, language);
  a.node('cloud', 'group:cloud', 130, 10, {}, { w: 1010, h: 590 });
  a.node('region', 'group:region', 300, 70, { name: 'ap-northeast-2' }, { w: 600, h: 520 });
  a.node('vpc', 'group:vpc', 330, 110, {}, { w: 540, h: 450 });
  a.node('pub', 'group:publicSubnet', 360, 150, {}, { w: 140, h: 380 });
  a.node('asg', 'group:autoScaling', 530, 150, {}, { w: 160, h: 380 });
  a.node('priv', 'group:privateSubnet', 720, 150, {}, { w: 130, h: 380 });
  svc(a, 'user', 'User', 40, 300, T('고객', 'Customers'));
  svc(a, 'dns', 'Route 53', 150, 100);
  svc(a, 'cdn', 'CloudFront', 180, 300);
  svc(a, 'alb', 'Elastic Load Balancing', 406, 300, 'ALB');
  svc(a, 'ec2a', 'EC2', 586, 220, T('웹 서버 1', 'Web server 1'));
  svc(a, 'ec2b', 'EC2', 586, 400, T('웹 서버 2', 'Web server 2'));
  svc(a, 'rds', 'Aurora', 761, 220, T('주문 DB', 'Orders DB'));
  svc(a, 'cache', 'ElastiCache', 761, 400, T('세션 캐시', 'Sessions'));
  svc(a, 's3', 'S3', 960, 110, T('상품 이미지', 'Images'));
  svc(a, 'sqs', 'SQS', 960, 300, T('주문 큐', 'Order queue'));
  svc(a, 'lambda', 'Lambda', 1060, 300, T('메일 발송', 'Mailer'));
  svc(a, 'cw', 'CloudWatch', 1060, 470);
  link(a, 'user', 'dns', [{ x: 64, y: 124 }]);
  link(a, 'user', 'cdn');
  link(a, 'cdn', 's3', [{ x: 214, y: 46 }, { x: 984, y: 46 }]);
  link(a, 'cdn', 'alb');
  link(a, 'alb', 'ec2a', [{ x: 510, y: 324 }, { x: 510, y: 244 }]);
  link(a, 'alb', 'ec2b', [{ x: 510, y: 324 }, { x: 510, y: 424 }]);
  link(a, 'ec2a', 'rds');
  link(a, 'ec2b', 'cache');
  link(a, 'ec2a', 'sqs', [{ x: 626, y: 190 }, { x: 984, y: 190 }]);
  link(a, 'sqs', 'lambda');

  // Azure
  const az = addDiagram(project, cloudModel('Azure')._id, 'AzureDiagram', { language, name: T('Azure 배치', 'Azure Deployment') });
  const z = painter(project, az, language);
  z.node('sub', 'group:subscription', 130, 10, { name: T('구독: 쇼핑몰 운영', 'Subscription: Shop Production') }, { w: 1010, h: 590 });
  z.node('rg', 'group:resourceGroup', 160, 50, { name: 'rg-shop-prod' }, { w: 950, h: 530 });
  z.node('vnet', 'group:vnet', 290, 100, { name: 'vnet-shop' }, { w: 560, h: 460 });
  z.node('app', 'group:subnet', 320, 140, { name: 'snet-app' }, { w: 240, h: 400 });
  z.node('data', 'group:subnet', 590, 140, { name: 'snet-data' }, { w: 240, h: 400 });
  svc(z, 'user', 'User', 40, 300, T('고객', 'Customers'));
  svc(z, 'id', 'Entra ID', 190, 100, T('로그인', 'Sign-in'));
  svc(z, 'fd', 'Front Door', 190, 300);
  svc(z, 'web', 'App Service', 410, 220, T('웹 앱', 'Web app'));
  svc(z, 'fn', 'Functions', 410, 400, T('주문 처리', 'Order worker'));
  svc(z, 'redis', 'Cache for Redis', 680, 220, T('세션 캐시', 'Sessions'));
  svc(z, 'sql', 'SQL Database', 680, 400, T('주문 DB', 'Orders DB'));
  svc(z, 'blob', 'Blob Storage', 910, 110, T('상품 이미지', 'Images'));
  svc(z, 'bus', 'Service Bus', 910, 300, T('주문 큐', 'Order queue'));
  svc(z, 'kv', 'Key Vault', 1010, 300, T('비밀 키', 'Secrets'));
  svc(z, 'mon', 'Monitor', 1010, 470);
  link(z, 'user', 'id', [{ x: 64, y: 124 }]);
  link(z, 'user', 'fd');
  link(z, 'fd', 'web', [{ x: 300, y: 324 }, { x: 300, y: 244 }]);
  link(z, 'web', 'redis');
  link(z, 'web', 'sql', [{ x: 620, y: 244 }, { x: 620, y: 350 }, { x: 704, y: 350 }]);
  link(z, 'fn', 'sql');
  link(z, 'web', 'blob', [{ x: 420, y: 134 }]);
  link(z, 'web', 'bus', [{ x: 450, y: 180 }, { x: 934, y: 180 }]);
  link(z, 'bus', 'fn', [{ x: 880, y: 324 }, { x: 880, y: 520 }, { x: 370, y: 520 }, { x: 370, y: 424 }]);

  // Google Cloud
  const gcp = addDiagram(project, cloudModel('Google Cloud')._id, 'GCPDiagram', { language, name: T('GCP 배치', 'GCP Deployment') });
  const g = painter(project, gcp, language);
  g.node('proj', 'group:project', 130, 10, { name: 'shop-prod' }, { w: 1010, h: 590 });
  g.node('region', 'group:region', 360, 60, { name: 'asia-northeast3' }, { w: 560, h: 520 });
  g.node('vpc', 'group:vpc', 390, 100, { name: 'shop-vpc' }, { w: 500, h: 460 });
  svc(g, 'user', 'User', 40, 300, T('고객', 'Customers'));
  svc(g, 'dns', 'Cloud DNS', 170, 100);
  svc(g, 'armor', 'Cloud Armor', 170, 300, 'WAF');
  svc(g, 'lb', 'Cloud Load Balancing', 270, 300, 'HTTPS LB');
  svc(g, 'run', 'Cloud Run', 450, 220, T('웹 앱', 'Web app'));
  svc(g, 'fn', 'Cloud Functions', 450, 400, T('메일 발송', 'Mailer'));
  svc(g, 'sql', 'Cloud SQL', 700, 220, T('주문 DB', 'Orders DB'));
  svc(g, 'mem', 'Memorystore', 700, 400, T('세션 캐시', 'Sessions'));
  svc(g, 'gcs', 'Cloud Storage', 960, 110, T('상품 이미지', 'Images'));
  svc(g, 'ps', 'Pub/Sub', 960, 300, T('주문 이벤트', 'Order events'));
  svc(g, 'bq', 'BigQuery', 1060, 300, T('매출 분석', 'Sales analytics'));
  svc(g, 'log', 'Cloud Logging', 1060, 470);
  link(g, 'user', 'dns', [{ x: 64, y: 124 }]);
  link(g, 'user', 'armor');
  link(g, 'armor', 'lb');
  link(g, 'lb', 'run', [{ x: 380, y: 324 }, { x: 380, y: 244 }]);
  link(g, 'run', 'sql');
  link(g, 'run', 'mem', [{ x: 600, y: 244 }, { x: 600, y: 350 }, { x: 724, y: 350 }]);
  link(g, 'run', 'gcs', [{ x: 460, y: 134 }]);
  link(g, 'run', 'ps', [{ x: 490, y: 180 }, { x: 984, y: 180 }]);
  link(g, 'ps', 'fn', [{ x: 940, y: 324 }, { x: 940, y: 520 }, { x: 410, y: 520 }, { x: 410, y: 424 }]);
  link(g, 'ps', 'bq');
}

/** Files written to samples/ by scripts/make-samples.mjs. */
export const SAMPLE_FILES = [['online-shop.ko.myuml', () => buildSample('ko')], ['online-shop.en.myuml', () => buildSample('en')]];

export { allDiagrams };
