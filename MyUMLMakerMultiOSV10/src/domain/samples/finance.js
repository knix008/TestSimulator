// Sample projects: finance, and web and mobile services.
import { sample } from './entry.js';

export const FINANCE = [
  sample('banking', 'finance', 'dgSequence', '인터넷 뱅킹|Online Banking', '계좌와 이체를 클래스·시퀀스·상태로|Accounts and transfers: classes, a sequence and states', (k) => {
    const bank = k.pkg('bank', '계좌와 이체|Accounts and transfers');
    k.classes('계좌 모델|Account Model', bank, [
      ['Customer', 'customerNo:String,name:String', 'accounts():Account'],
      ['*Account', 'number:String,balance:Money', 'deposit(amount:Money),withdraw(amount:Money):boolean'],
      ['Checking', 'overdraftLimit:Money', 'withdraw(amount:Money):boolean'],
      ['Savings', 'interestRate:double', 'addInterest()'],
      ['Transfer', 'amount:Money,at:DateTime', 'execute():boolean'],
      ['%TransferState', 'REQUESTED,DONE,FAILED', ''],
    ], [
      ['assoc', 'Customer', 'Account', '1', '1..*', 'accounts'],
      ['gen', 'Checking', 'Account'], ['gen', 'Savings', 'Account'],
      ['dir', 'Transfer', 'Account', '0..*', '1', 'from'],
      ['dep', 'Transfer', 'TransferState'],
    ], { main: true, grid: { Customer: [0, 0], Account: [1, 0], Transfer: [2, 0], Checking: [0, 1], Savings: [1, 1], TransferState: [2, 1] } });
    k.sequence('계좌 이체|Transfer Money', ['@고객|Customer', 'webBank', 'transferService', 'fromAccount', 'toAccount'], [
      [0, 1, 'transfer(from, to, amount)'], [1, 2, 'execute(from, to, amount)'], [2, 3, 'withdraw(amount)'], [3, 2, 'true', 'r'], [2, 4, 'deposit(amount)'], [2, 1, '완료|done', 'r'], [2, 1, '잔액 부족|insufficient funds', 'r'], [1, 0, '이체 결과|result', 'r'],
    ], [['alt', 3, 6, '잔액 충분|enough balance', 6]]);
    k.states('계좌 상태|Account States', [['*i'], ['open', '개설됨|Open'], ['dormant', '휴면|Dormant'], ['frozen', '지급 정지|Frozen', { entry: 'notifyOwner()' }], ['closed', '해지됨|Closed', { do: 'archive()' }], ['!f']],
      [['*i', 'open'], ['open', 'dormant', 'noActivity'], ['dormant', 'open', 'deposit'], ['open', 'frozen', 'freeze'], ['frozen', 'open', 'release'], ['open', 'closed', 'close'], ['closed', '!f']], { owner: bank });
  }),

  sample('card-payment', 'finance', 'dgCommunication', '신용카드 결제 승인|Card Payment', '승인 흐름을 시퀀스·커뮤니케이션·데이터 흐름도로|The authorization flow: sequence, communication and data flow', (k) => {
    k.sequence('결제 승인|Authorize a Payment', ['@고객|Cardholder', 'terminal', 'gateway', 'network', 'issuer'], [
      [0, 1, 'insert(card)'], [1, 2, 'authorize(amount)'], [2, 3, 'route(request)'], [3, 4, 'authorize(request)'], [4, 4, 'checkLimit()'], [4, 3, 'approved', 'r'], [3, 2, 'approved', 'r'], [2, 1, 'approved', 'r'], [1, 0, '영수증|receipt', 'r'],
    ]);
    k.communication('결제 승인 (커뮤니케이션)|Authorize (Communication)', [['@고객|Cardholder', 80, 40], ['terminal', 40, 280], ['gateway', 420, 280], ['network', 800, 280], ['issuer', 800, 520], ['fraudCheck', 420, 520]],
      [[0, 1, ['insert(card)']], [1, 2, ['authorize(amount)']], [2, 3, ['route(request)']], [3, 4, ['authorize(request)']], [2, 5, ['score(request)']]]);
    k.dfd('결제 데이터 흐름|Payment Data Flow', [
      ['merchant', 'DFDExternalEntity', '가맹점|Merchant'], ['p1', 'DFDProcess', { name: '승인 처리|Authorize', id: '1.0' }], ['issuer', 'DFDExternalEntity', '카드사|Issuer'], ['d1', 'DFDDataStore', { name: '거래 원장|Ledger', id: 'D1' }], ['p2', 'DFDProcess', { name: '정산|Settle', id: '2.0' }], ['bank', 'DFDExternalEntity', '은행|Bank'],
    ], [['merchant', 'p1', '승인 요청|auth request'], ['p1', 'issuer', '한도 확인|limit check'], ['p1', 'd1', '승인 기록|approved sale'], ['d1', 'p2', '당일 거래|daily sales'], ['p2', 'bank', '정산 파일|settlement file']]);
  }),

  sample('stock-trading', 'finance', 'dgTiming', '주식 거래|Stock Trading', '주문 모델, 주문 상태, 체결 타이밍|Order model, order states and execution timing', (k) => {
    k.classes('주문 모델|Order Model', k.pkg('trading', '주식 주문|Share orders'), [
      ['Investor', 'accountNo:String,cash:Money', 'place(order:Order)'],
      ['*Order', 'quantity:int,placedAt:DateTime', 'cancel()'],
      ['LimitOrder', 'limitPrice:Money', ''],
      ['MarketOrder', '', ''],
      ['Stock', 'ticker:String,lastPrice:Money', ''],
      ['Execution', 'price:Money,quantity:int', ''],
    ], [
      ['assoc', 'Investor', 'Order', '1', '0..*', 'orders'],
      ['gen', 'LimitOrder', 'Order'], ['gen', 'MarketOrder', 'Order'],
      ['dir', 'Order', 'Stock', '0..*', '1', 'stock'],
      ['comp', 'Order', 'Execution', '1', '0..*', 'fills'],
    ], { main: true, grid: { Investor: [1, 0], Execution: [0, 1], Order: [1, 1], Stock: [2, 1], LimitOrder: [0, 2], MarketOrder: [1, 2] } });
    k.states('주문 상태|Order States', [['*i'], ['open', '접수|Open'], ['part', '일부 체결|Partly Filled', { do: 'matchOrders()' }], ['filled', '전량 체결|Filled', { entry: 'settle()' }], ['cancelled', '취소|Cancelled'], ['!f']],
      [['*i', 'open'], ['open', 'part', 'fill'], ['part', 'filled', 'fill', 'rest = 0'], ['open', 'cancelled', 'cancel'], ['part', 'cancelled', 'cancel'], ['filled', '!f'], ['cancelled', '!f']], { grid: { '*i': [0, 1], open: [1, 1], part: [2, 0], filled: [3, 1], cancelled: [2, 2], '!f': [3, 2] } });
    k.timing('주문 체결 타이밍|Execution Timing', [
      ['order', 'Open,Partial,Filled', [['Open', 3], ['Partial', 4], ['Filled', 3]]],
      ['matcher', 'Idle,Matching', [['Idle', 2], ['Matching', 2], ['Idle', 1], ['Matching', 2], ['Idle', 3]]],
    ], { ticks: [0, 3, 7, 10], unit: 'ms' });
  }),

  sample('insurance', 'finance', 'dgBpmn', '보험금 청구|Insurance Claims', '청구 심사를 유스케이스·BPMN·ER로|Handling claims: use cases, BPMN and ER', (k) => {
    k.useCases('보험금 청구 유스케이스|Claim Use Cases', '보험 시스템|Insurance System', ['가입자|Policyholder', '심사원|Adjuster'],
      ['보험금 청구|File Claim', '서류 제출|Upload Documents', '청구 상태 조회|Track Claim', '청구 심사|Assess Claim', '보험금 지급|Pay Claim', '현장 조사|Field Survey'], ['은행|Bank'],
      [[0, 0], [0, 2], [1, 3], [1, 5], [2, 4]], [['inc', 0, 1], ['inc', 3, 4], ['ext', 5, 3]]);
    k.bpmn('청구 심사 절차|Claim Assessment', '보험사|Insurer', ['접수팀|Intake', '심사팀|Assessment', '재무팀|Finance'], [
      ['s', 0, 'BPMNStartEvent:message', '청구 접수|Claim received'], ['check', 0, 'task:user', '서류 확인|Check papers'], ['assess', 1, 'task:user', '보상 심사|Assess damage'],
      ['g', 1, 'BPMNExclusiveGateway', '지급 대상?|Covered?'], ['pay', 2, 'task:service', '보험금 지급|Pay claim'], ['deny', 1, 'task:send', '거절 통지|Send refusal'],
      ['e', 2, 'BPMNEndEvent', '지급 완료|Paid'], ['e2', 1, 'BPMNEndEvent', '청구 거절|Refused'],
    ], [['s', 'check'], ['check', 'assess'], ['assess', 'g'], ['g', 'pay', '예|yes'], ['g', 'deny', '아니오|no'], ['pay', 'e'], ['deny', 'e2']]);
    k.erd('보험 데이터베이스|Insurance Database', [
      ['policyholder', 'name:VARCHAR(100),phone:VARCHAR(20)'],
      ['policy', 'policyholder_id:INTEGER>policyholder,policy_no:VARCHAR(20)!,premium:DECIMAL(12)'],
      ['claim', 'policy_id:INTEGER>policy,filed_on:DATE,status:VARCHAR(10)'],
      ['claim_document', 'claim_id:INTEGER>claim,file_name:VARCHAR(200)'],
      ['payment', 'claim_id:INTEGER>claim,amount:DECIMAL(12),paid_on:DATE'],
    ], [['1:1..*', 'policyholder', 'policy'], ['1:0..*', 'policy', 'claim'], ['1:0..*', 'claim', 'claim_document'], ['1:0..1', 'claim', 'payment']]);
  }),

  sample('wallet', 'finance', 'dgC4', '전자 지갑|Mobile Wallet', '컨테이너(C4), QR 결제 시퀀스, 입력 검증 정규식|C4 containers, a QR payment sequence and input patterns', (k) => {
    k.c4('전자 지갑 컨테이너|Wallet Containers', [
      ['user', 'C4Person', { name: '사용자|User', description: '휴대폰으로 결제한다|Pays with a phone' }],
      ['app', 'C4Container', { name: '모바일 앱|Mobile App', technology: 'Flutter', description: 'QR 결제와 잔액|QR payment and balance' }],
      ['api', 'C4Container', { name: 'API 서버|API Server', technology: 'Go', description: '지갑과 결제 규칙|Wallet and payment rules' }],
      ['db', 'C4ContainerDatabase', { name: '원장 DB|Ledger DB', technology: 'PostgreSQL', description: '잔액과 거래 내역|Balances and history' }],
      ['bank', 'externalSystem', { name: '오픈 뱅킹|Open Banking', description: '계좌에서 충전|Top-up from an account' }],
    ], [['user', 'app', '사용한다|Uses'], ['app', 'api', '호출한다|Calls', 'HTTPS'], ['api', 'db', '읽고 쓴다|Reads and writes', 'SQL'], ['api', 'bank', '충전을 요청한다|Requests top-up', 'REST']],
    { groups: [['wallet', 'C4Boundary', { name: '전자 지갑|Mobile Wallet', boundaryKind: 'system' }, ['app', 'api', 'db']]], grid: { user: [0, 0], app: [0, 1], api: [0, 2], db: [0, 3], bank: [1, 2] }, gapX: 200, gapY: 130, x: 80 });
    k.sequence('QR 결제|Pay by QR', ['@사용자|User', 'walletApp', 'walletApi', 'ledger', 'merchantPos'], [
      [0, 1, 'scan(qr)'], [1, 2, 'pay(merchant, amount)'], [2, 3, 'debit(user, amount)'], [3, 2, 'txId', 'r'], [2, 4, 'notifyPaid(txId)', 'a'], [2, 1, 'receipt', 'r'], [1, 0, '결제 완료|paid', 'r'],
    ]);
    k.regex('입력 검증|Input Checks', [['pin', '결제 PIN|Payment PIN', '^\\d{6}$'], ['phone', '휴대폰 번호|Mobile number', '^01[016789]-\\d{3,4}-\\d{4}$'], ['qr', 'QR 코드|QR code', '^WLT-[A-Z0-9]{8}(-[A-Z])?$']]);
  }),
];

export const SERVICE = [
  sample('blog', 'service', 'dgComponent', '블로그 CMS|Blog CMS', '글과 댓글 모델, 컴포넌트, 데이터베이스|Posts and comments, components and the database', (k) => {
    k.classes('글 모델|Content Model', k.pkg('content', '글과 댓글|Posts and comments'), [
      ['Author', 'name:String,email:String', ''],
      ['Post', 'title:String,body:Text,publishedAt:DateTime', 'publish(),slug():String'],
      ['Comment', 'body:Text,at:DateTime', 'approve()'],
      ['Tag', 'name:String', ''],
      ['Category', 'name:String', ''],
    ], [
      ['assoc', 'Author', 'Post', '1', '0..*', 'posts'],
      ['comp', 'Post', 'Comment', '1', '0..*', 'comments'],
      ['assoc', 'Post', 'Tag', '0..*', '0..*', 'tags'],
      ['dir', 'Post', 'Category', '0..*', '1', 'category'],
    ], { main: true, grid: { Author: [0, 0], Post: [1, 0], Comment: [2, 0], Tag: [1, 1], Category: [2, 1] } });
    k.graph('UMLComponentDiagram', k.model, '블로그 컴포넌트|Blog Components', [
      ['web', 'UMLComponent', 'WebFrontend'], ['api', 'interfaceIcon', 'ContentAPI'], ['cms', 'UMLComponent', 'ContentService'], ['search', 'UMLComponent', 'SearchIndexer'], ['store', 'interfaceIcon', 'Storage'], ['db', 'UMLComponent', 'PostgresAdapter'],
    ], [['UMLUsage', 'web', 'api'], ['UMLInterfaceRealization', 'cms', 'api'], ['UMLDependency', 'search', 'cms'], ['UMLUsage', 'cms', 'store'], ['UMLInterfaceRealization', 'db', 'store']],
    { grid: { web: [0, 0], api: [1, 0], cms: [2, 0], store: [3, 0], db: [4, 0], search: [2, 1] }, gapX: 80, gapY: 90 });
    k.erd('블로그 데이터베이스|Blog Database', [
      ['author', 'name:VARCHAR(100),email:VARCHAR(200)!'],
      ['category', 'name:VARCHAR(50)!'],
      ['post', 'author_id:INTEGER>author,category_id:INTEGER>category,title:VARCHAR(200),published_at:TIMESTAMP?'],
      ['comment', 'post_id:INTEGER>post,body:TEXT'],
      ['tag', 'name:VARCHAR(50)!'],
      ['post_tag', 'post_id:INTEGER>post,tag_id:INTEGER>tag'],
    ], [['1:0..*', 'author', 'post'], ['1:0..*', 'category', 'post'], ['1:0..*', 'post', 'comment'], ['1:0..*', 'post', 'post_tag'], ['1:0..*', 'tag', 'post_tag']],
    { grid: { author: [0, 0], category: [0, 1], post: [1, 0], comment: [2, 0], post_tag: [1, 1], tag: [2, 1] } });
  }),

  sample('chat', 'service', 'dgDeployment', '채팅 앱|Chat App', '메시지 시퀀스, 서버 배치, 컴포넌트|The message sequence, deployment and components', (k) => {
    k.sequence('메시지 보내기|Send a Message', ['@보낸 사람|Sender', 'chatClient', 'gateway', 'messageService', 'pushService', '@받는 사람|Receiver'], [
      [0, 1, 'send(text)'], [1, 2, 'publish(room, text)', 'a'], [2, 3, 'store(message)'], [3, 2, 'id', 'r'], [2, 4, 'fanOut(message)', 'a'], [4, 5, '알림|notification', 'a'], [2, 1, 'ack(id)', 'r'],
    ], [['par', 4, 5, '접속 중이 아닌 사람|offline members']]);
    k.place('UMLDeploymentDiagram', k.model, '채팅 서버 배치|Chat Deployment', [
      ['phone', 'UMLDevice', 40, 80, '휴대폰|Phone', { w: 190, h: 150 }],
      ['app', 'UMLArtifact', 70, 145, 'chat-app.apk'],
      ['gw', 'UMLNode', 310, 40, 'gateway-01', { w: 250, h: 220 }],
      ['node', 'UMLExecutionEnvironment', 330, 95, 'Node.js 22', { w: 210, h: 140 }],
      ['ws', 'UMLArtifact', 365, 160, 'ws-gateway.js'],
      ['svc', 'UMLNode', 650, 40, 'message-01', { w: 250, h: 220 }],
      ['jvm', 'UMLExecutionEnvironment', 670, 95, 'JVM 21', { w: 210, h: 140 }],
      ['jar', 'UMLArtifact', 695, 160, 'message-service.jar'],
      ['db', 'UMLNode', 650, 340, 'cassandra-01', { w: 250, h: 130 }],
      ['mq', 'UMLNode', 310, 340, 'kafka-01', { w: 250, h: 130 }],
    ], [['UMLCommunicationPath', 'phone', 'gw', 'WebSocket'], ['UMLCommunicationPath', 'gw', 'svc', 'gRPC'], ['UMLCommunicationPath', 'svc', 'db', 'CQL'], ['UMLCommunicationPath', 'gw', 'mq', 'Kafka']]);
    k.graph('UMLComponentDiagram', k.model, '채팅 컴포넌트|Chat Components', [
      ['client', 'UMLComponent', 'ChatClient'], ['gwApi', 'interfaceIcon', 'RealtimeAPI'], ['gateway', 'UMLComponent', 'Gateway'], ['msgApi', 'interfaceIcon', 'MessageAPI'], ['msg', 'UMLComponent', 'MessageService'], ['push', 'UMLComponent', 'PushService'],
    ], [['UMLUsage', 'client', 'gwApi'], ['UMLInterfaceRealization', 'gateway', 'gwApi'], ['UMLUsage', 'gateway', 'msgApi'], ['UMLInterfaceRealization', 'msg', 'msgApi'], ['UMLDependency', 'msg', 'push']],
    { grid: { client: [0, 0], gwApi: [1, 0], gateway: [2, 0], msgApi: [3, 0], msg: [4, 0], push: [4, 1] }, gapX: 70, gapY: 90 });
  }),

  sample('food-delivery', 'service', 'dgOverview', '음식 배달|Food Delivery', '유스케이스, 주문 상태, 인터랙션 개요|Use cases, order states and an interaction overview', (k) => {
    k.useCases('음식 배달 유스케이스|Delivery Use Cases', '배달 앱|Delivery App', ['손님|Diner', '식당|Restaurant'],
      ['메뉴 고르기|Browse Menus', '주문하기|Place Order', '배달 추적|Track Delivery', '주문 수락|Accept Order', '메뉴 관리|Manage Menu', '배달 수락|Accept Trip', '위치 전송|Share Location'], ['배달원|Courier'],
      [[0, 0], [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]]);
    k.states('배달 주문 상태|Delivery Order States', [['*i'], ['placed', '주문됨|Placed'], ['cooking', '조리 중|Cooking', { do: 'cook()' }], ['ready', '픽업 대기|Ready'], ['onWay', '배달 중|On the Way', { do: 'shareLocation()' }], ['done', '배달 완료|Delivered', { entry: 'askReview()' }], ['refused', '거절됨|Refused'], ['!f']],
      [['*i', 'placed'], ['placed', 'cooking', 'accept'], ['placed', 'refused', 'decline'], ['cooking', 'ready', 'cooked'], ['ready', 'onWay', 'pickUp'], ['onWay', 'done', 'dropOff'], ['done', '!f'], ['refused', '!f']], { grid: { '*i': [0, 0], placed: [1, 0], cooking: [2, 0], ready: [3, 0], onWay: [4, 0], done: [5, 0], refused: [1, 1], '!f': [5, 1] } });
    const browse = k.interaction('메뉴 보기|Browse Menu');
    const order = k.interaction('주문하기|Place Order');
    const track = k.interaction('배달 추적|Track Delivery');
    const use = (element) => ({ name: element.name, refersTo: k.ref(element) });
    const overview = k.addElement(k.model, 'UMLActivity', { name: k.tr('배달 앱 개요|Delivery App Overview') });
    k.graph('UMLInteractionOverviewDiagram', overview, '배달 앱 인터랙션 개요|Delivery Interaction Overview', [
      ['i', 'UMLInitialNode'], ['browse', 'UMLInteractionUse', use(browse), { w: 220, h: 60 }], ['d', 'UMLDecisionNode'], ['order', 'UMLInteractionUse', use(order), { w: 220, h: 60 }], ['track', 'UMLInteractionUse', use(track), { w: 220, h: 60 }], ['f', 'UMLActivityFinalNode'], ['f2', 'UMLActivityFinalNode'],
    ], [['UMLControlFlow', 'i', 'browse'], ['UMLControlFlow', 'browse', 'd'], ['UMLControlFlow', 'd', 'order', { guard: '주문|order' }], ['UMLControlFlow', 'd', 'f2', { guard: '떠남|leave' }], ['UMLControlFlow', 'order', 'track'], ['UMLControlFlow', 'track', 'f']],
    { grid: { i: [0, 0], browse: [0, 1], d: [0, 2], order: [0, 3], track: [0, 4], f: [0, 5], f2: [1, 2] }, gapX: 110, gapY: 50 });
  }),

  sample('ride-share', 'service', 'dgObject', '승차 공유|Ride Sharing', '배차 모델, 어느 순간의 객체, 배차 시퀀스|Dispatch model, objects at one moment and the dispatch sequence', (k) => {
    const made = k.classes('배차 모델|Dispatch Model', k.pkg('ride', '승차와 배차|Rides and dispatch'), [
      ['Rider', 'name:String,rating:double', 'request(from:Place;to:Place):Trip'],
      ['Driver', 'name:String,licenseNo:String', 'accept(trip:Trip)'],
      ['Vehicle', 'plate:String,seats:int', ''],
      ['Trip', 'fare:Money,distanceKm:double', 'start(),finish()'],
      ['Place', 'lat:double,lng:double', ''],
    ], [
      ['assoc', 'Rider', 'Trip', '1', '0..*', 'trips'],
      ['assoc', 'Driver', 'Trip', '0..1', '0..*', 'drives'],
      ['assoc', 'Driver', 'Vehicle', '1', '1', 'vehicle'],
      ['dir', 'Trip', 'Place', '0..*', '2', 'stops'],
    ], { main: true, grid: { Rider: [0, 0], Trip: [1, 0], Place: [2, 0], Driver: [1, 1], Vehicle: [2, 1] } });
    k.objects('운행 중인 객체|Objects During a Trip', k.model, [
      ['r', 'mina', made.Rider, 'name="민아|Mina",rating=4.9', 0, 0],
      ['t', 'trip42', made.Trip, 'fare=14500,distanceKm=7.2', 1, 0],
      ['d', 'jun', made.Driver, 'name="준|Jun",licenseNo="11-22-333"', 1, 1],
      ['v', 'taxi7', made.Vehicle, 'plate="12가3456|12A3456",seats=4', 2, 1],
      ['p', 'gangnam', made.Place, 'lat=37.49,lng=127.02', 2, 0],
    ], [['r', 't', 'trips'], ['d', 't', 'drives'], ['d', 'v', 'vehicle'], ['t', 'p', 'stops']]);
    k.sequence('배차|Dispatch a Ride', ['@승객|Rider', 'riderApp', 'dispatcher', 'driverApp', '@기사|Driver'], [
      [0, 1, 'request(from, to)'], [1, 2, 'findDriver(from)'], [2, 2, 'nearestDrivers()'], [2, 3, 'offer(trip)', 'a'], [3, 4, '요청 표시|show offer', 'a'], [4, 3, '수락|accept'], [3, 2, 'accepted', 'r'], [2, 1, 'driver, eta', 'r'], [1, 0, '기사 안내|driver details', 'r'],
    ], [['loop', 3, 6, '수락할 때까지|until accepted']]);
  }),

  sample('streaming', 'service', 'dgAws', '동영상 스트리밍|Video Streaming', 'C4 컨테이너, AWS 배치, 패키지 구조|C4 containers, an AWS deployment and packages', (k) => {
    k.c4('스트리밍 컨테이너|Streaming Containers', [
      ['viewer', 'C4Person', { name: '시청자|Viewer', description: '영상을 본다|Watches videos' }],
      ['web', 'C4Container', { name: '웹 플레이어|Web Player', technology: 'React', description: '재생 화면|Playback page' }],
      ['api', 'C4Container', { name: '카탈로그 API|Catalog API', technology: 'Kotlin', description: '영상 목록과 추천|Videos and suggestions' }],
      ['enc', 'C4Container', { name: '인코더|Encoder', technology: 'FFmpeg', description: '화질별로 변환|Transcodes renditions' }],
      ['db', 'C4ContainerDatabase', { name: '메타데이터 DB|Metadata DB', technology: 'MySQL', description: '영상 정보|Video information' }],
      ['cdn', 'externalSystem', { name: 'CDN|CDN', description: '영상 조각 전달|Delivers segments' }],
    ], [['viewer', 'web', '시청한다|Watches'], ['web', 'api', '목록을 읽는다|Reads catalog', 'HTTPS'], ['api', 'db', '읽고 쓴다|Reads and writes', 'SQL'], ['web', 'cdn', '영상을 받는다|Fetches video', 'HLS'], ['enc', 'cdn', '올린다|Uploads', 'S3']],
    { grid: { viewer: [0, 0], web: [0, 1], api: [0, 2], db: [0, 3], cdn: [1, 1], enc: [1, 2] }, gapX: 220, gapY: 120, x: 80 });
    k.cloud('AWSDiagram', '스트리밍 AWS 배치|Streaming on AWS', [
      ['user', 'User', '시청자|Viewers'], ['cdn', 'CloudFront'], ['s3', 'S3', '영상 저장소|Video store'], ['lambda', 'Lambda', '변환 작업|Transcode job'], ['alb', 'Elastic Load Balancing', 'ALB'], ['ecs', 'ECS', '카탈로그 API|Catalog API'], ['rds', 'Aurora', '메타데이터|Metadata'],
    ], [['user', 'cdn'], ['cdn', 's3'], ['s3', 'lambda'], ['cdn', 'alb'], ['alb', 'ecs'], ['ecs', 'rds']], [['group:vpc', 'VPC', ['alb', 'ecs', 'rds']]],
    { grid: { user: [0, 1], cdn: [1, 1], s3: [2, 0], lambda: [3, 0], alb: [2, 1], ecs: [3, 1], rds: [4, 1] }, gapX: 110, gapY: 120 });
    k.place('UMLPackageDiagram', k.model, '패키지 구조|Package Structure', [
      ['web', 'UMLPackage', 240, 40, 'player', { w: 340, h: 110 }],
      ['Player', 'UMLClass', 300, 90, 'PlayerPage', {}, { suppressAttributes: true, suppressOperations: true }],
      ['catalog', 'UMLPackage', 40, 220, 'catalog', { w: 340, h: 110 }],
      ['Video', 'UMLClass', 100, 270, 'VideoCatalog', {}, { suppressAttributes: true, suppressOperations: true }],
      ['media', 'UMLPackage', 440, 220, 'media', { w: 340, h: 110 }],
      ['Enc', 'UMLClass', 500, 270, 'Transcoder', {}, { suppressAttributes: true, suppressOperations: true }],
      ['common', 'UMLPackage', 240, 400, 'common', { w: 340, h: 110 }],
      ['Log', 'UMLClass', 300, 450, 'EventLog', {}, { suppressAttributes: true, suppressOperations: true }],
    ], [['import', 'web', 'catalog'], ['import', 'web', 'media'], ['import', 'catalog', 'common'], ['import', 'media', 'common']]);
  }),
];
