// Sample projects: business systems, and public services, education and health care.
import { sample } from './entry.js';

export const BUSINESS = [
  sample('inventory', 'business', 'dgClass', '재고·창고 관리|Warehouse Inventory', '입고, 출고, 재고 실사를 클래스·유스케이스·ER·상태로|Receiving, picking and stock counts: classes, use cases, ER and states', (k) => {
    const domain = k.pkg('domain', '창고 업무 개념|Warehouse concepts');
    k.classes('재고 모델|Stock Model', domain, [
      ['Warehouse', 'code:String,name:String', 'locate(sku:String):Location'],
      ['Location', 'aisle:String,shelf:int', ''],
      ['StockItem', 'quantity:int,lot:String', 'reserve(count:int):boolean,release(count:int)'],
      ['Product', 'sku:String,name:String,reorderPoint:int', 'needsReorder():boolean'],
      ['*Movement', 'at:DateTime,quantity:int', 'apply()'],
      ['Receipt', 'supplier:String', 'apply()'],
      ['Shipment', 'orderNo:String', 'apply()'],
      ['%MovementState', 'DRAFT,CONFIRMED,POSTED,CANCELLED', ''],
    ], [
      ['comp', 'Warehouse', 'Location', '1', '1..*', 'locations'],
      ['assoc', 'Location', 'StockItem', '1', '0..*', 'items'],
      ['dir', 'StockItem', 'Product', '0..*', '1', 'product'],
      ['gen', 'Receipt', 'Movement'], ['gen', 'Shipment', 'Movement'],
      ['dir', 'Movement', 'StockItem', '0..*', '1', 'target'],
      ['dep', 'Movement', 'MovementState'],
    ], { main: true, grid: { MovementState: [1, 0], Receipt: [0, 1], Movement: [1, 1], Shipment: [2, 1], StockItem: [1, 2], Product: [2, 2], Location: [1, 3], Warehouse: [0, 3] } });
    k.useCases('창고 유스케이스|Warehouse Use Cases', '창고 관리 시스템|Warehouse System',
      ['작업자|Picker', '창고장|Manager'], ['상품 입고|Receive Goods', '주문 출고|Pick Orders', '재고 실사|Count Stock', '바코드 스캔|Scan Barcode', '재주문 승인|Approve Reorder', '재고 보고서|Stock Report'], ['구매 시스템|Purchasing System'],
      [[0, 0], [0, 1], [0, 2], [1, 4], [1, 5], [2, 4]], [['inc', 0, 3], ['inc', 1, 3]]);
    k.erd('재고 데이터베이스|Stock Database', [
      ['warehouse', 'code:VARCHAR(10)!,name:VARCHAR(100)'],
      ['location', 'warehouse_id:INTEGER>warehouse,aisle:VARCHAR(5),shelf:INTEGER'],
      ['product', 'sku:VARCHAR(30)!,name:VARCHAR(200),reorder_point:INTEGER'],
      ['stock_item', 'location_id:INTEGER>location,product_id:INTEGER>product,quantity:INTEGER'],
      ['movement', 'stock_item_id:INTEGER>stock_item,kind:VARCHAR(10),quantity:INTEGER,moved_at:TIMESTAMP'],
    ], [['1:1..*', 'warehouse', 'location'], ['1:0..*', 'location', 'stock_item'], ['1:0..*', 'product', 'stock_item'], ['1:0..*', 'stock_item', 'movement']],
    { grid: { warehouse: [0, 0], location: [1, 0], stock_item: [2, 0], movement: [3, 0], product: [2, 1] } });
    k.states('입출고 전표 상태|Movement States', [['*i'], ['draft', '작성 중|Draft'], ['confirmed', '확인됨|Confirmed', { entry: 'reserveStock()' }], ['posted', '반영됨|Posted', { do: 'updateStock()' }], ['cancelled', '취소됨|Cancelled'], ['!f']],
      [['*i', 'draft'], ['draft', 'confirmed', 'confirm'], ['confirmed', 'posted', 'post'], ['draft', 'cancelled', 'cancel'], ['confirmed', 'cancelled', 'cancel'], ['posted', '!f'], ['cancelled', '!f']], { owner: domain, grid: { '*i': [0, 0], draft: [1, 0], confirmed: [2, 0], posted: [3, 0], cancelled: [2, 1], '!f': [3, 1] } });
  }),

  sample('payroll', 'business', 'dgActivity', '인사·급여|HR and Payroll', '사원과 급여 계산, 휴가 승인 흐름, 인사 데이터베이스|Employees and pay, the leave approval flow and the HR database', (k) => {
    k.classes('인사 모델|HR Model', k.pkg('hr', '인사와 급여|People and pay'), [
      ['Department', 'code:String,name:String', 'headcount():int'],
      ['*Employee', 'empNo:String,name:String,hiredOn:Date', 'monthlyPay():Money'],
      ['Salaried', 'annualSalary:Money', 'monthlyPay():Money'],
      ['Hourly', 'hourlyRate:Money,hours:int', 'monthlyPay():Money'],
      ['LeaveRequest', 'from:Date,to:Date,reason:String', 'approve(),reject()'],
      ['Payslip', 'month:String,gross:Money,tax:Money', 'net():Money'],
    ], [
      ['agg', 'Department', 'Employee', '1', '0..*', 'members'],
      ['gen', 'Salaried', 'Employee'], ['gen', 'Hourly', 'Employee'],
      ['assoc', 'Employee', 'LeaveRequest', '1', '0..*', 'requests'],
      ['comp', 'Employee', 'Payslip', '1', '0..*', 'payslips'],
    ], { main: true, grid: { Department: [0, 0], Employee: [1, 0], LeaveRequest: [2, 0], Salaried: [0, 1], Hourly: [1, 1], Payslip: [2, 1] } });
    k.activity('휴가 승인|Leave Approval', ['사원|Employee', '팀장|Team Lead', '인사팀|HR'], [
      ['i', 0, 0, 'UMLInitialNode'], ['submit', 0, 1, 'UMLAction', '휴가 신청|Submit Request'], ['review', 1, 1, 'UMLAction', '일정 검토|Review Dates'],
      ['d', 1, 2, 'UMLDecisionNode'], ['record', 2, 3, 'UMLAction', '휴가 등록|Record Leave'], ['fix', 0, 3, 'UMLAction', '신청 수정|Revise Request'],
      ['notify', 2, 4, 'action:sendSignal', '승인 알림|Notify Approval'], ['ff', 0, 4, 'UMLFlowFinalNode'], ['f', 2, 5, 'UMLActivityFinalNode'],
    ], [['i', 'submit'], ['submit', 'review'], ['review', 'd'], ['d', 'record', '승인|approved'], ['d', 'fix', '반려|rejected'], ['fix', 'ff'], ['record', 'notify'], ['notify', 'f']]);
    k.erd('인사 데이터베이스|HR Database', [
      ['department', 'code:VARCHAR(10)!,name:VARCHAR(100)'],
      ['employee', 'emp_no:VARCHAR(10)!,name:VARCHAR(100),department_id:INTEGER>department,hired_on:DATE'],
      ['leave_request', 'employee_id:INTEGER>employee,from_date:DATE,to_date:DATE,status:VARCHAR(10)'],
      ['payslip', 'employee_id:INTEGER>employee,pay_month:CHAR(7),gross:DECIMAL(12),tax:DECIMAL(12)'],
    ], [['1:0..*', 'department', 'employee'], ['1:0..*', 'employee', 'leave_request'], ['1:0..*', 'employee', 'payslip']]);
  }),

  sample('helpdesk', 'business', 'dgBpmn', '고객 지원 헬프데스크|Support Helpdesk', '문의 접수부터 해결까지 BPMN·상태·유스케이스로|From ticket to resolution: BPMN, states and use cases', (k) => {
    k.useCases('헬프데스크 유스케이스|Helpdesk Use Cases', '헬프데스크|Helpdesk', ['고객|Customer', '상담원|Agent'],
      ['문의 등록|Open Ticket', '진행 상황 보기|Track Ticket', '문의 답변|Answer Ticket', '상위 전달|Escalate', '만족도 평가|Rate Support', 'FAQ 검색|Search FAQ'], ['전문가|Specialist'],
      [[0, 0], [0, 1], [0, 4], [0, 5], [1, 2], [1, 3], [2, 3]], [['ext', 3, 2]]);
    k.bpmn('문의 처리|Ticket Handling', '고객 지원|Customer Support', ['상담원|Agent', '전문가|Specialist'], [
      ['s', 0, 'BPMNStartEvent:message', '문의 접수|Ticket received'], ['triage', 0, 'task:user', '분류|Triage'], ['g', 0, 'BPMNExclusiveGateway', '바로 해결?|Solve now?'],
      ['answer', 0, 'task:user', '답변 작성|Write answer'], ['dig', 1, 'task:manual', '원인 분석|Investigate'], ['fix', 1, 'task:user', '해결책 작성|Write fix'],
      ['close', 0, 'task:send', '결과 안내|Notify customer'], ['e', 0, 'BPMNEndEvent', '종료|Closed'],
    ], [['s', 'triage'], ['triage', 'g'], ['g', 'answer', '예|yes'], ['g', 'dig', '아니오|no'], ['dig', 'fix'], ['answer', 'close'], ['fix', 'close'], ['close', 'e']]);
    k.states('문의 상태|Ticket States', [['*i'], ['new', '접수|New'], ['open', '처리 중|In Progress', { do: 'work()' }], ['wait', '고객 답변 대기|Waiting'], ['solved', '해결됨|Solved', { entry: 'askRating()' }], ['!f']],
      [['*i', 'new'], ['new', 'open', 'assign'], ['open', 'wait', 'askCustomer'], ['wait', 'open', 'reply'], ['open', 'solved', 'solve'], ['solved', '!f', 'close']]);
  }),

  sample('crm', 'business', 'dgJourney', '영업 CRM|Sales CRM', '영업 기회 모델, 견적 시퀀스, 고객 여정 지도|Sales pipeline model, quote sequence and a customer journey map', (k) => {
    k.classes('CRM 모델|CRM Model', k.pkg('crm', '고객과 영업 기회|Customers and deals'), [
      ['Account', 'name:String,industry:String', 'openDeals():int'],
      ['Contact', 'name:String,email:String', ''],
      ['Deal', 'title:String,amount:Money,closeDate:Date', 'advance(),lose(reason:String)'],
      ['%DealStage', 'LEAD,QUALIFIED,PROPOSAL,WON,LOST', ''],
      ['Quote', 'number:String,total:Money', 'send()'],
      ['SalesRep', 'name:String,quota:Money', 'attainment():double'],
    ], [
      ['comp', 'Account', 'Contact', '1', '1..*', 'contacts'],
      ['assoc', 'Account', 'Deal', '1', '0..*', 'deals'],
      ['dep', 'Deal', 'DealStage'],
      ['comp', 'Deal', 'Quote', '1', '0..*', 'quotes'],
      ['assoc', 'SalesRep', 'Deal', '1', '0..*', 'owns'],
    ], { main: true });
    k.sequence('견적 발송|Send a Quote', ['@영업 담당|Sales Rep', 'crm', 'pricing', 'mail'], [
      [0, 1, 'createQuote(deal)'], [1, 2, 'priceOf(items)'], [2, 1, 'total', 'r'], [1, 1, 'applyDiscount()'], [1, 3, 'send(quote)', 'a'], [1, 0, '견적 번호|quote number', 'r'],
    ], [['opt', 3, 3, '할인 승인됨|discount approved']]);
    k.journey('B2B 구매 여정|B2B Buying Journey', { name: '박서준|Sam Park', role: '구매 담당자|Purchasing lead', goals: '합리적인 가격과 안정적 공급|Fair price, reliable supply', frustrations: '답이 늦은 영업 담당|Slow replies' }, [
      ['인지|Awareness', '문제를 알아챔|Spots a need', '전시회에서 제품을 봄|Sees the product at a fair', ['event', '전시회|Trade fair'], ['neutral', '관심|Interested'], '정보가 흩어져 있음|Scattered information', '제품 소개 자료 묶음|One-stop brochure'],
      ['검토|Evaluation', '후보를 비교함|Compares vendors', '시연을 요청함|Asks for a demo', ['web', '웹사이트|Website'], ['positive', '기대|Hopeful'], '시연 일정이 멂|Demo is weeks away', '온라인 즉시 시연|Instant online demo'],
      ['협상|Negotiation', '조건을 맞춤|Agrees terms', '견적을 받음|Receives a quote', ['email', '이메일|E-mail'], ['negative', '답답함|Frustrated'], '견적 수정이 느림|Slow quote changes', '자동 견적|Automated quotes'],
      ['계약|Contract', '서명함|Signs', '계약서에 서명함|Signs the contract', ['web', '전자 서명|e-Sign'], ['veryPositive', '안심|Relieved'], '', '전자 서명 확대|More e-signing'],
    ]);
  }),
];

export const PUBLIC = [
  sample('library', 'public', 'dgUseCase', '도서관 관리|Library Management', '대출과 예약을 클래스·유스케이스·시퀀스·상태로|Loans and holds: classes, use cases, a sequence and states', (k) => {
    const lib = k.pkg('library', '도서관 업무 개념|Library concepts');
    k.classes('도서 모델|Book Model', lib, [
      ['Member', 'cardNo:String,name:String', 'canBorrow():boolean'],
      ['Loan', 'borrowedOn:Date,dueOn:Date', 'renew(),isOverdue():boolean'],
      ['Copy', 'barcode:String,shelf:String', 'isAvailable():boolean'],
      ['Book', 'isbn:String,title:String,author:String', 'availableCopies():int'],
      ['Hold', 'placedOn:Date', 'cancel()'],
      ['Fine', 'amount:Money,paid:boolean', 'pay()'],
    ], [
      ['assoc', 'Member', 'Loan', '1', '0..5', 'loans'],
      ['dir', 'Loan', 'Copy', '0..*', '1', 'copy'],
      ['comp', 'Book', 'Copy', '1', '1..*', 'copies'],
      ['assoc', 'Member', 'Hold', '1', '0..*', 'holds'],
      ['dir', 'Hold', 'Book', '0..*', '1', 'book'],
      ['comp', 'Loan', 'Fine', '1', '0..1', 'fine'],
    ], { main: true });
    k.useCases('도서관 유스케이스|Library Use Cases', '도서관 시스템|Library System', ['회원|Member', '사서|Librarian'],
      ['책 검색|Search Books', '책 대출|Borrow Book', '예약|Place Hold', '책 반납|Return Book', '연체료 납부|Pay Fine', '장서 관리|Manage Catalogue', '회원 인증|Identify Member', '회원 등록|Register Member'], [],
      [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 7]], [['inc', 1, 6], ['ext', 4, 3]]);
    k.sequence('책 대출|Borrow a Book', ['@회원|Member', 'kiosk', 'loanService', 'copy', 'member'], [
      [0, 1, 'scan(card, barcode)'], [1, 2, 'borrow(cardNo, barcode)'], [2, 4, 'canBorrow()'], [4, 2, 'true', 'r'], [2, 3, 'isAvailable()'], [3, 2, 'true', 'r'], [2, 2, 'createLoan()'], [2, 1, 'dueDate', 'r'], [2, 1, '대출 불가|refused', 'r'], [1, 0, '반납일 안내|due date', 'r'],
    ], [['alt', 2, 8, '대출 가능|can borrow', 8]]);
    k.states('책 사본 상태|Copy States', [['*i'], ['shelf', '서가에 있음|On Shelf'], ['held', '예약 보관|On Hold', { entry: 'notifyMember()' }], ['loaned', '대출 중|On Loan'], ['lost', '분실|Lost'], ['!f']],
      [['*i', 'shelf'], ['shelf', 'loaned', 'borrow'], ['loaned', 'shelf', 'return', 'no hold'], ['loaned', 'held', 'return', 'has hold'], ['held', 'loaned', 'borrow'], ['loaned', 'lost', 'reportLost'], ['lost', '!f']], { owner: lib });
  }),

  sample('university', 'public', 'dgSequence', '대학 수강 신청|University Enrolment', '학생·강좌 모델, 수강 신청 시퀀스, 학사 데이터베이스|Students and courses, the enrolment sequence and the database', (k) => {
    k.classes('학사 모델|Academic Model', k.pkg('academic', '학사 개념|Academic concepts'), [
      ['Student', 'studentNo:String,name:String,credits:int', 'enrol(section:Section):Enrolment'],
      ['Professor', 'name:String,office:String', ''],
      ['Course', 'code:String,title:String,credits:int', ''],
      ['Section', 'term:String,capacity:int,room:String', 'hasSeat():boolean'],
      ['Enrolment', 'grade:String', 'drop()'],
    ], [
      ['assoc', 'Student', 'Enrolment', '1', '0..*', 'enrolments'],
      ['assoc', 'Section', 'Enrolment', '1', '0..*', 'roster'],
      ['comp', 'Course', 'Section', '1', '1..*', 'sections'],
      ['assoc', 'Professor', 'Section', '1', '0..*', 'teaches'],
    ], { main: true, grid: { Student: [0, 0], Enrolment: [1, 0], Section: [2, 0], Course: [3, 0], Professor: [2, 1] } });
    k.sequence('수강 신청|Enrol in a Course', ['@학생|Student', 'portal', 'registrar', 'section'], [
      [0, 1, 'enrol(code)'], [1, 2, 'requestSeat(student, code)'], [2, 3, 'hasSeat()'], [3, 2, 'seat', 'r'], [2, 3, 'addStudent(student)'], [2, 1, 'enrolment', 'r'], [2, 1, '대기 명단|waitlisted', 'r'], [1, 0, '결과|result', 'r'],
    ], [['alt', 4, 6, '자리 있음|seat free', 6]]);
    k.erd('학사 데이터베이스|Academic Database', [
      ['student', 'student_no:VARCHAR(10)!,name:VARCHAR(100)'],
      ['professor', 'name:VARCHAR(100),office:VARCHAR(20)?'],
      ['course', 'code:VARCHAR(10)!,title:VARCHAR(200),credits:INTEGER'],
      ['section', 'course_id:INTEGER>course,professor_id:INTEGER>professor,term:CHAR(6),capacity:INTEGER'],
      ['enrolment', 'student_id:INTEGER>student,section_id:INTEGER>section,grade:CHAR(2)?'],
    ], [['1:0..*', 'student', 'enrolment'], ['1:0..*', 'section', 'enrolment'], ['1:1..*', 'course', 'section'], ['1:0..*', 'professor', 'section']],
    { grid: { student: [0, 0], enrolment: [1, 0], section: [2, 0], course: [3, 0], professor: [2, 1] } });
  }),

  sample('hospital', 'public', 'dgErd', '병원 진료 예약|Hospital Appointments', '예약 유스케이스, 내원 활동, 진료 데이터베이스|Booking use cases, the visit activity and the clinic database', (k) => {
    k.useCases('진료 예약 유스케이스|Appointment Use Cases', '병원 예약 시스템|Clinic System', ['환자|Patient', '접수 담당|Receptionist'],
      ['진료 예약|Book Appointment', '예약 변경|Change Appointment', '진료 접수|Check In', '진료 기록 작성|Write Chart', '처방전 발행|Issue Prescription', '보험 확인|Check Insurance'], ['의사|Doctor'],
      [[0, 0], [0, 1], [1, 2], [2, 3], [2, 4]], [['inc', 2, 5], ['ext', 4, 3]]);
    k.activity('내원 과정|Clinic Visit', ['환자|Patient', '접수|Reception', '의사|Doctor'], [
      ['i', 0, 0, 'UMLInitialNode'], ['arrive', 0, 1, 'UMLAction', '병원 도착|Arrive'], ['check', 1, 1, 'UMLAction', '접수와 보험 확인|Check In'], ['fork', 1, 2, 'UMLForkNode'],
      ['wait', 0, 3, 'UMLAction', '대기|Wait'], ['chart', 2, 3, 'UMLAction', '기록 열람|Open Chart'], ['join', 2, 4, 'UMLJoinNode'], ['treat', 2, 5, 'UMLAction', '진료|Treat'],
      ['pay', 1, 6, 'UMLAction', '수납|Pay'], ['f', 1, 7, 'UMLActivityFinalNode'],
    ], [['i', 'arrive'], ['arrive', 'check'], ['check', 'fork'], ['fork', 'wait'], ['fork', 'chart'], ['wait', 'join'], ['chart', 'join'], ['join', 'treat'], ['treat', 'pay'], ['pay', 'f']]);
    k.erd('진료 데이터베이스|Clinic Database', [
      ['patient', 'name:VARCHAR(100),birth_date:DATE,phone:VARCHAR(20)'],
      ['doctor', 'name:VARCHAR(100),speciality:VARCHAR(50)'],
      ['appointment', 'patient_id:INTEGER>patient,doctor_id:INTEGER>doctor,starts_at:TIMESTAMP,status:VARCHAR(10)'],
      ['chart_note', 'appointment_id:INTEGER>appointment,note:TEXT'],
      ['prescription', 'chart_note_id:INTEGER>chart_note,drug:VARCHAR(100),dose:VARCHAR(50)'],
    ], [['1:0..*', 'patient', 'appointment'], ['1:0..*', 'doctor', 'appointment'], ['1:0..1', 'appointment', 'chart_note'], ['1:0..*', 'chart_note', 'prescription']]);
  }),

  sample('elearning', 'public', 'dgStoryMap', '온라인 강의 플랫폼|E-Learning Platform', '강의 모델, 시스템 컨텍스트(C4), 사용자 스토리 맵|Course model, a C4 system context and a user story map', (k) => {
    k.classes('강의 모델|Course Model', k.pkg('learning', '강의 개념|Learning concepts'), [
      ['Course', 'title:String,price:Money', 'publish()'],
      ['Lesson', 'title:String,minutes:int', ''],
      ['Quiz', 'passMark:int', 'grade(answers:String):int'],
      ['Learner', 'name:String,email:String', 'progressIn(course:Course):double'],
      ['Enrolment', 'startedOn:Date,completed:boolean', 'issueCertificate()'],
      ['Instructor', 'name:String,bio:String', ''],
    ], [
      ['comp', 'Course', 'Lesson', '1', '1..*', 'lessons'],
      ['comp', 'Lesson', 'Quiz', '1', '0..1', 'quiz'],
      ['assoc', 'Learner', 'Enrolment', '1', '0..*', 'enrolments'],
      ['dir', 'Enrolment', 'Course', '0..*', '1', 'course'],
      ['assoc', 'Instructor', 'Course', '1', '0..*', 'teaches'],
    ], { main: true, grid: { Learner: [0, 0], Enrolment: [1, 0], Course: [2, 0], Lesson: [3, 0], Instructor: [2, 1], Quiz: [3, 1] } });
    k.c4('시스템 컨텍스트|System Context', [
      ['learner', 'C4Person', { name: '수강생|Learner', description: '강의를 듣는다|Takes courses' }],
      ['teacher', 'C4Person', { name: '강사|Instructor', description: '강의를 올린다|Publishes courses' }],
      ['lms', 'C4SoftwareSystem', { name: '강의 플랫폼|E-Learning Platform', description: '강의, 퀴즈, 수료증|Courses, quizzes, certificates' }],
      ['pay', 'externalSystem', { name: '결제 대행사|Payment Provider', description: '수강료 결제|Takes course fees' }],
      ['video', 'externalSystem', { name: '동영상 서비스|Video Service', description: '강의 영상 재생|Plays lesson videos' }],
    ], [['learner', 'lms', '수강한다|Takes courses', 'HTTPS'], ['teacher', 'lms', '강의를 올린다|Publishes', 'HTTPS'], ['lms', 'pay', '결제를 요청한다|Charges', 'REST'], ['lms', 'video', '영상을 스트리밍한다|Streams', 'HLS']]);
    k.storyMap('수강생 스토리 맵|Learner Story Map', [['찾기|Discover', 2], ['배우기|Learn', 2], ['인정받기|Get credit', 1]],
      ['강의 검색|Search', '결제|Pay', '강의 시청|Watch', '퀴즈 풀기|Quiz', '수료증|Certificate'],
      [['MVP|MVP', '2027-03-02', '첫 강의 판매|First course sold'], ['릴리스 2|Release 2', '2027-06-01', '학습 지속|Keep learners going']], [
        [0, 0, '제목으로 검색|Search by title', 'must', 2, 'done'], [0, 1, '카드 결제|Pay by card', 'must', 3, 'doing'], [0, 2, '영상 재생|Play video', 'must', 5, 'doing'], [0, 3, '객관식 퀴즈|Multiple choice', 'should', 3, 'todo'], [0, 4, 'PDF 수료증|PDF certificate', 'should', 2, 'todo'],
        [1, 0, '추천 강의|Recommendations', 'could', 5, 'todo'], [1, 2, '이어 보기|Resume watching', 'should', 2, 'todo'], [1, 3, '오답 노트|Review mistakes', 'could', 3, 'todo'],
      ]);
  }),

  sample('civil', 'public', 'dgDfd', '민원 처리|Citizen Requests', '민원 접수와 처리를 BPMN·데이터 흐름도·상태로|Handling citizen requests: BPMN, data flow and states', (k) => {
    k.bpmn('민원 처리 절차|Request Procedure', '구청|District Office', ['민원실|Front Desk', '담당 부서|Department'], [
      ['s', 0, 'BPMNStartEvent', '민원 접수|Request filed'], ['check', 0, 'task:user', '서류 확인|Check papers'], ['g', 0, 'BPMNExclusiveGateway', '서류 완비?|Complete?'],
      ['back', 0, 'task:send', '보완 요청|Ask for more'], ['route', 0, 'task:service', '담당 지정|Assign dept'], ['e2', 0, 'BPMNEndEvent', '보완 대기|Awaiting papers'],
      ['review', 1, 'task:user', '내용 검토|Review'], ['decide', 1, 'BPMNExclusiveGateway', '승인?|Approve?'], ['ok', 1, 'task:user', '결정문 작성|Write decision'], ['no', 1, 'task:user', '거절 사유 작성|Write refusal'],
      ['tell', 1, 'task:send', '결과 통보|Notify citizen'], ['e', 1, 'BPMNEndEvent', '처리 완료|Done'],
    ], [['s', 'check'], ['check', 'g'], ['g', 'route', '예|yes'], ['g', 'back', '아니오|no'], ['back', 'e2'], ['route', 'review'], ['review', 'decide'], ['decide', 'ok', '예|yes'], ['decide', 'no', '아니오|no'], ['ok', 'tell'], ['no', 'tell'], ['tell', 'e']]);
    k.dfd('민원 데이터 흐름|Request Data Flow', [
      ['citizen', 'DFDExternalEntity', '민원인|Citizen'], ['p1', 'DFDProcess', { name: '민원 접수|File Request', id: '1.0' }], ['d1', 'DFDDataStore', { name: '민원 대장|Request Log', id: 'D1' }], ['p2', 'DFDProcess', { name: '민원 심사|Review Request', id: '2.0' }], ['dept', 'DFDExternalEntity', '담당 부서|Department'],
    ], [['citizen', 'p1', '민원 서류|request form'], ['p1', 'd1', '접수 기록|filed request'], ['d1', 'p2', '심사 대상|pending requests'], ['p2', 'dept', '검토 의뢰|review order'], ['p2', 'citizen', '처리 결과|decision']],
    { grid: { citizen: [0, 1], p1: [1, 0], d1: [2, 0], p2: [1, 2], dept: [2, 2] }, gapX: 150, gapY: 60 });
    k.states('민원 상태|Request States', [['*i'], ['filed', '접수됨|Filed'], ['more', '보완 중|Needs Papers'], ['review', '심사 중|Under Review', { do: 'review()' }], ['done', '처리 완료|Decided', { entry: 'notifyCitizen()' }], ['!f']],
      [['*i', 'filed'], ['filed', 'more', 'incomplete'], ['more', 'filed', 'resubmit'], ['filed', 'review', 'accept'], ['review', 'done', 'decide'], ['done', '!f']]);
  }),
];
