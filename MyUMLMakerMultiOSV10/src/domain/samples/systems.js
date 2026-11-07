// Sample projects: embedded systems and IoT, and cloud and infrastructure.
import { sample } from './entry.js';

export const EMBEDDED = [
  sample('smart-home', 'embedded', 'dgRequirement', '스마트 홈|Smart Home', 'SysML 요구사항과 블록, 온도 조절기 상태|SysML requirements and blocks, and thermostat states', (k) => {
    const { p: reqs } = k.requirements('스마트 홈 요구사항|Smart Home Requirements', [
      ['r0', 'REQ-1', '원격 제어|Remote Control', '밖에서 집안 기기를 제어한다|Control home devices when away'],
      ['r1', 'REQ-1.1', '안전한 연결|Secure Link', '통신은 암호화한다|All traffic is encrypted'],
      ['r2', 'REQ-1.2', '빠른 응답|Fast Response', '명령은 1초 안에 실행된다|Commands run within 1 second'],
      ['r3', 'REQ-2', '에너지 절약|Energy Saving', '집이 비면 난방을 줄인다|Lowers heating when nobody is home'],
    ], [['hub', 'SysMLBlock', 'HomeHub'], ['thermo', 'SysMLBlock', 'Thermostat'], ['test', 'UMLUseCase', { name: '응답 시간 시험|Response Test', stereotype: 'testCase' }]],
    [['UMLContainment', 'r1', 'r0'], ['UMLContainment', 'r2', 'r0'], ['SysMLSatisfy', 'hub', 'r1'], ['SysMLVerify', 'test', 'r2'], ['SysMLSatisfy', 'thermo', 'r3']],
    { grid: { r0: [1, 0], r3: [3, 0], r1: [0, 1], r2: [1, 1], thermo: [3, 1], hub: [0, 2], test: [1, 2] }, gapX: 50, gapY: 90 });
    const sys = k.ownerOf('UMLModel', '시스템 모델 (SysML)|System Model (SysML)');
    k.graph('SysMLBlockDefinitionDiagram', sys, '스마트 홈 블록|Smart Home Blocks', [
      ['home', 'SysMLBlock', 'SmartHome'], ['hub', reqs.views.get('hub').element], ['thermo', reqs.views.get('thermo').element], ['light', 'SysMLBlock', 'SmartLight'], ['sensor', 'SysMLBlock', 'MotionSensor'], ['dev', 'SysMLInterfaceBlock', 'IDevice'],
    ], [['composition', 'home', 'hub', { end2: { multiplicity: '1', name: 'hub' } }], ['composition', 'home', 'thermo', { end2: { multiplicity: '1..*', name: 'thermostats' } }], ['composition', 'home', 'light', { end2: { multiplicity: '0..*', name: 'lights' } }], ['composition', 'home', 'sensor', { end2: { multiplicity: '0..*', name: 'sensors' } }], ['UMLInterfaceRealization', 'thermo', 'dev']],
    { grid: { home: [0, 1], hub: [1, 0], thermo: [1, 1], light: [1, 2], sensor: [1, 3], dev: [2, 1] }, gapX: 190, gapY: 40 });
    k.states('온도 조절기 상태|Thermostat States', [['*i'], ['off', '꺼짐|Off'], ['idle', '대기|Idle', { do: 'readSensor()' }], ['heat', '난방|Heating', { entry: 'boilerOn()', exit: 'boilerOff()' }], ['away', '외출|Away', { entry: 'setTarget(16)' }]],
      [['*i', 'off'], ['off', 'idle', 'powerOn'], ['idle', 'heat', 'tick', 'temp < target'], ['heat', 'idle', 'tick', 'temp >= target'], ['idle', 'away', 'allLeft'], ['away', 'idle', 'someoneHome']]);
  }),

  sample('elevator', 'embedded', 'dgState', '엘리베이터 제어|Elevator Control', '제어기 클래스, 복합 상태, 문 타이밍|Controller classes, a composite state and door timing', (k) => {
    k.classes('제어기 모델|Controller Model', k.pkg('control', '엘리베이터 제어|Elevator control'), [
      ['Controller', 'mode:String', 'handle(request:Request),nextFloor():int'],
      ['Car', 'floor:int,direction:Direction', 'moveTo(floor:int),stop()'],
      ['Door', 'open:boolean', 'open(),close()'],
      ['Request', 'floor:int,fromCabin:boolean', ''],
      ['%Direction', 'UP,DOWN,IDLE', ''],
      ['Sensor', 'name:String', 'read():double'],
    ], [
      ['assoc', 'Controller', 'Car', '1', '1..*', 'cars'],
      ['comp', 'Car', 'Door', '1', '1', 'door'],
      ['agg', 'Controller', 'Request', '1', '0..*', 'queue'],
      ['dep', 'Car', 'Direction'],
      ['assoc', 'Car', 'Sensor', '1', '1..*', 'sensors'],
    ], { main: true, grid: { Request: [0, 0], Controller: [1, 0], Car: [2, 0], Direction: [3, 0], Door: [2, 1], Sensor: [3, 1] } });
    const machine = k.addElement(k.model, 'UMLStateMachine', { name: k.tr('엘리베이터|Elevator') });
    k.place('UMLStatechartDiagram', machine, '엘리베이터 상태|Elevator States', [
      ['i', 'pseudo:initial', 40, 122],
      ['idle', 'UMLState', 110, 100, { name: '대기|Idle' }],
      ['moving', 'compositeState', 340, 30, { name: '운행|Moving' }, { w: 400, h: 200 }],
      ['i2', 'pseudo:initial', 360, 122],
      ['up', 'UMLState', 430, 75, { name: '상승|Going Up' }],
      ['down', 'UMLState', 430, 155, { name: '하강|Going Down' }],
      ['door', 'UMLState', 110, 290, { name: '문 열림|Door Open', entryActivity: 'openDoor()', exitActivity: 'closeDoor()' }],
      ['stop', 'UMLState', 500, 290, { name: '비상 정지|Emergency Stop', doActivity: 'ringAlarm()' }],
      ['f', 'UMLFinalState', 780, 300],
    ], [
      ['UMLTransition', 'i', 'idle'], ['UMLTransition', 'idle', 'moving', { triggers: 'request' }], ['UMLTransition', 'i2', 'up'], ['UMLTransition', 'up', 'down', { triggers: 'reverse' }],
      ['UMLTransition', 'moving', 'door', { triggers: 'arrived' }], ['UMLTransition', 'door', 'idle', { triggers: 'timeout' }], ['UMLTransition', 'moving', 'stop', { triggers: 'emergency' }], ['UMLTransition', 'stop', 'f', { triggers: 'reset' }],
    ]);
    k.timing('문 열림 타이밍|Door Timing', [
      ['door', 'Closed,Moving,Open', [['Closed', 2], ['Moving', 1], ['Open', 3], ['Moving', 1], ['Closed', 3]]],
      ['car', 'Stopped,Moving', [['Moving', 2], ['Stopped', 5], ['Moving', 3]]],
    ], { ticks: [0, 2, 3, 6, 7, 10] });
  }),

  sample('vending', 'embedded', 'dgFlowchart', '자판기|Vending Machine', '상태, 구매 활동, 거스름돈 순서도|States, the purchase activity and a change flowchart', (k) => {
    k.states('자판기 상태|Machine States', [['*i'], ['idle', '대기|Idle'], ['coins', '동전 받는 중|Taking Coins', { do: 'countCoins()' }], ['vend', '상품 내보내기|Dispensing', { entry: 'dropItem()' }], ['change', '거스름돈|Giving Change', { do: 'payOut()' }], ['out', '품절|Sold Out']],
      [['*i', 'idle'], ['idle', 'coins', 'insertCoin'], ['coins', 'vend', 'select', 'paid >= price'], ['coins', 'idle', 'cancel', '', 'refund'], ['vend', 'change', 'dropped'], ['change', 'idle', 'done'], ['vend', 'out', 'empty'], ['out', 'idle', 'refill']], { grid: { out: [2, 0], '*i': [0, 1], idle: [1, 1], coins: [2, 1], vend: [3, 1], change: [2, 2] } });
    k.activity('음료 구매|Buy a Drink', ['손님|Customer', '자판기|Machine'], [
      ['i', 0, 0, 'UMLInitialNode'], ['coin', 0, 1, 'UMLAction', '동전 넣기|Insert Coins'], ['pick', 0, 2, 'UMLAction', '음료 고르기|Choose Drink'], ['check', 1, 2, 'UMLAction', '금액 확인|Check Amount'],
      ['d', 1, 3, 'UMLDecisionNode'], ['drop', 1, 4, 'UMLAction', '음료 내보내기|Drop Drink'], ['msg', 0, 3, 'UMLAction', '금액 부족 표시|Shows Short'], ['take', 0, 5, 'UMLAction', '음료 꺼내기|Take Drink'], ['f', 0, 6, 'UMLActivityFinalNode'],
    ], [['i', 'coin'], ['coin', 'pick'], ['pick', 'check'], ['check', 'd'], ['d', 'drop', '충분|enough'], ['d', 'msg', '부족|short'], ['drop', 'take'], ['take', 'f']]);
    k.flowchart('거스름돈 계산|Making Change', [
      ['s', 'FCTerminator', '시작|Start'], ['read', 'FCData', '받은 금액 읽기|Read amount'], ['calc', 'FCProcess', '거스름돈 = 받은 금액 - 가격|change = paid - price'], ['d', 'FCDecision', '거스름돈 > 0?|change > 0?'], ['pay', 'FCProcess', '가장 큰 동전 지급|Pay largest coin'], ['show', 'FCDisplay', '완료 표시|Show done'], ['e', 'FCTerminator', '끝|End'],
    ], [['s', 'read'], ['read', 'calc'], ['calc', 'd'], ['d', 'show', '아니오|no'], ['d', 'pay', '예|yes'], ['pay', 'd'], ['show', 'e']],
    { grid: { s: [0, 0], read: [0, 1], calc: [0, 2], d: [0, 3], show: [0, 4], e: [0, 5], pay: [1, 3] }, gapX: 120, gapY: 44 });
  }),

  sample('cruise-control', 'embedded', 'dgIbd', '자동차 크루즈 컨트롤|Car Cruise Control', 'SysML 요구사항·내부 블록·매개변수|SysML requirements, internal blocks and parametrics', (k) => {
    const sys = k.ownerOf('UMLModel', '시스템 모델 (SysML)|System Model (SysML)');
    const { p: reqs } = k.requirements('크루즈 컨트롤 요구사항|Cruise Control Requirements', [
      ['r0', 'REQ-1', '속도 유지|Hold Speed', '설정 속도를 ±2km/h로 유지한다|Holds the set speed within 2 km/h'],
      ['r1', 'REQ-2', '브레이크 해제|Brake Cancels', '브레이크를 밟으면 즉시 꺼진다|Braking switches it off at once'],
      ['r2', 'REQ-1.1', '오르막 대응|Hill Handling', '오르막에서도 속도를 유지한다|Holds speed on slopes'],
    ], [['ctrl', 'SysMLBlock', 'CruiseController'], ['test', 'UMLUseCase', { name: '주행 시험|Road Test', stereotype: 'testCase' }]],
    [['SysMLDeriveReqt', 'r2', 'r0'], ['SysMLSatisfy', 'ctrl', 'r0'], ['SysMLSatisfy', 'ctrl', 'r1'], ['SysMLVerify', 'test', 'r2']],
    { grid: { r0: [1, 0], r1: [2, 1], r2: [0, 0], ctrl: [1, 1], test: [0, 1] }, gapX: 100, gapY: 90 });

    // Blocks first: the internal block and parametric diagrams show their parts.
    const types = ['SpeedSensor', 'ThrottleActuator', 'BrakeSwitch'].map((name) => k.addElement(sys, 'SysMLBlock', { name }));
    const controller = reqs.views.get('ctrl').element;
    const car = k.addElement(sys, 'SysMLBlock', { name: 'CruiseSystem' });
    const { p: ibd } = k.place('SysMLInternalBlockDiagram', sys, '크루즈 컨트롤 내부 블록|Cruise Control Internals', []);
    ibd.annotation('frame', 'UMLFrameView', 40, 30, 'ibd [Block] CruiseSystem', { w: 900, h: 320 });
    const part = (key, name, type, x, y) => { const element = k.addElement(car, 'SysMLPart', { name, type: k.ref(type) }); ibd.show(key, element, x, y, { w: 170, h: 70 }); return element; };
    part('speed', 'speed', types[0], 90, 110);
    part('ctrl', 'controller', controller, 370, 180);
    part('throttle', 'throttle', types[1], 720, 180);
    part('brake', 'brake', types[2], 90, 260);
    ibd.edge('SysMLConnector', 'speed', 'ctrl', 'km/h');
    ibd.edge('SysMLConnector', 'brake', 'ctrl', '해제 신호|cancel');
    ibd.edge('SysMLItemFlow', 'ctrl', 'throttle', { name: 'command: Percent', itemProperty: 'command' });

    const equation = k.addElement(sys, 'SysMLConstraintBlock', { name: 'ThrottleLaw', constraint: 'u = Kp * (target - speed)' });
    const value = k.addElement(sys, 'SysMLValueType', { name: 'Speed', unit: 'km/h' });
    const params = ['target', 'speed', 'u'].map((name) => k.addElement(equation, 'SysMLConstraintParameter', { name, type: k.ref(value) }));
    const pricing = k.addElement(sys, 'SysMLBlock', { name: 'CruiseValues' });
    const values = ['targetSpeed', 'actualSpeed', 'throttleCommand'].map((name) => k.addElement(pricing, 'SysMLPart', { name, type: k.ref(value) }));
    const { p: par } = k.place('SysMLParametricDiagram', sys, '제어 법칙|Control Law', []);
    par.annotation('frame', 'UMLFrameView', 20, 20, 'par [Block] CruiseValues', { w: 820, h: 270 });
    par.node('law', 'SysMLConstraintProperty', 340, 100, { name: 'law', type: k.ref(equation) }, { w: 220, h: 130 });
    par.show('target', values[0], 60, 90, { w: 170, h: 44 });
    par.show('actual', values[1], 60, 190, { w: 170, h: 44 });
    par.show('out', values[2], 630, 140, { w: 170, h: 44 });
    par.show('pT', params[0], 332, 104);
    par.show('pS', params[1], 332, 204);
    par.show('pU', params[2], 552, 154);
    par.edge('SysMLConnector', 'target', 'pT', {}, { points: [{ x: 280, y: 112 }] });
    par.edge('SysMLConnector', 'actual', 'pS', {}, { points: [{ x: 280, y: 212 }] });
    par.edge('SysMLConnector', 'pU', 'out');
  }),

  sample('drone', 'embedded', 'dgBlock', '배송 드론|Delivery Drone', '블록 정의, 복합 구조, 비행 명령 시퀀스|Block definitions, composite structure and the flight sequence', (k) => {
    const sys = k.ownerOf('UMLModel', '시스템 모델 (SysML)|System Model (SysML)');
    k.graph('SysMLBlockDefinitionDiagram', sys, '드론 블록|Drone Blocks', [
      ['drone', 'SysMLBlock', 'DeliveryDrone'], ['fc', 'SysMLBlock', 'FlightController'], ['motor', 'SysMLBlock', 'Motor'], ['gps', 'SysMLBlock', 'GpsReceiver'], ['battery', 'SysMLBlock', 'Battery'], ['kg', 'SysMLValueType', { name: 'Kilogram', unit: 'kg' }],
    ], [['composition', 'drone', 'fc', { end2: { multiplicity: '1', name: 'fc' } }], ['composition', 'drone', 'motor', { end2: { multiplicity: '4', name: 'motors' } }], ['composition', 'drone', 'gps', { end2: { multiplicity: '1', name: 'gps' } }], ['composition', 'drone', 'battery', { end2: { multiplicity: '1..2', name: 'batteries' } }], ['UMLDependency', 'battery', 'kg']],
    { grid: { drone: [0, 1], fc: [1, 0], motor: [1, 1], gps: [1, 2], battery: [1, 3], kg: [2, 3] }, gapX: 190, gapY: 40 });
    const flight = k.pkg('flight', '비행 소프트웨어|Flight software');
    const { p } = k.place('UMLCompositeStructureDiagram', flight, '비행 소프트웨어 내부|Flight Software Structure', [
      ['app', 'UMLClass', 140, 40, 'FlightSoftware', { w: 640, h: 290 }, { suppressAttributes: true, suppressOperations: true }],
      ['nav', 'UMLPart', 200, 120, 'navigator'],
      ['stab', 'UMLPart', 460, 120, 'stabilizer'],
      ['mix', 'UMLPart', 460, 240, 'motorMixer'],
      ['log', 'UMLPart', 200, 240, 'flightLog'],
      ['api', 'UMLInterface', 20, 160, 'GroundLink', {}, { stereotypeDisplay: 'icon' }],
      ['esc', 'UMLInterface', 850, 240, 'MotorBus', {}, { stereotypeDisplay: 'icon' }],
    ], [['UMLConnector', 'nav', 'stab'], ['UMLConnector', 'stab', 'mix'], ['UMLConnector', 'nav', 'log']]);
    const app = p.views.get('app').element;
    p.show('pIn', k.addElement(app, 'UMLPort', { name: 'link', type: 'GroundLink' }), 132, 170);
    p.show('pOut', k.addElement(app, 'UMLPort', { name: 'bus', type: 'MotorBus' }), 772, 262);
    p.edge('UMLConnector', 'pIn', 'nav');
    p.edge('UMLConnector', 'mix', 'pOut');
    p.edge('UMLRealization', 'pIn', 'api');
    p.edge('UMLUsage', 'pOut', 'esc');
    k.sequence('배송 비행|Delivery Flight', ['@관제사|Operator', 'groundStation', 'navigator', 'stabilizer', 'gripper'], [
      [0, 1, 'dispatch(route)'], [1, 2, 'upload(route)'], [2, 3, 'takeOff()'], [2, 2, 'nextWaypoint()'], [2, 3, 'goTo(waypoint)'], [3, 2, 'reached', 'r'], [2, 4, 'release()'], [4, 2, 'released', 'r'], [2, 1, 'delivered', 'a'], [1, 0, '배송 완료|delivered', 'r'],
    ], [['loop', 3, 5, '경유지마다|each waypoint']]);
  }),
];

export const CLOUD = [
  sample('aws-web', 'cloud', 'dgAws', 'AWS 3계층 웹앱|Three-Tier Web App on AWS', 'AWS 구성, 네트워크, 서버 배치|AWS layout, the network and the deployment', (k) => {
    k.cloud('AWSDiagram', 'AWS 3계층 구성|AWS Three Tiers', [
      ['user', 'User', '사용자|Users'], ['dns', 'Route 53'], ['cdn', 'CloudFront'], ['s3', 'S3', '정적 파일|Static files'], ['alb', 'Elastic Load Balancing', 'ALB'], ['ec2', 'EC2', '앱 서버|App server'], ['rds', 'RDS', '데이터베이스|Database'], ['cache', 'ElastiCache', '캐시|Cache'],
    ], [['user', 'dns'], ['dns', 'cdn'], ['cdn', 's3'], ['cdn', 'alb'], ['alb', 'ec2'], ['ec2', 'rds'], ['ec2', 'cache']], [['group:vpc', 'VPC', ['alb', 'ec2', 'rds', 'cache']]],
    { grid: { user: [0, 1], dns: [1, 1], cdn: [2, 1], s3: [2, 2], alb: [3, 1], ec2: [4, 1], rds: [5, 0], cache: [5, 1] }, gapX: 110, gapY: 90 });
    k.network('운영 네트워크|Production Network', [['public', '10.0.1.0/24'], ['private', '10.0.2.0/24']], [
      ['alb', 'NWNode', 'alb', '부하 분산기|Load balancer', 0, '10.0.1.10'], ['nat', 'nwnode:router', 'nat', 'NAT', 0, '10.0.1.20'],
      ['app1', 'NWNode', 'app-1', '앱 서버|App server', 1, '10.0.2.11'], ['app2', 'NWNode', 'app-2', '앱 서버|App server', 1, '10.0.2.12'], ['db', 'nwnode:database', 'db-1', 'MySQL', 1, '10.0.2.50'],
    ], [['net', 'nwnode:cloud', '인터넷|Internet', '', [['net0', '']]]]);
    k.place('UMLDeploymentDiagram', k.model, '서버 배치|Server Deployment', [
      ['browser', 'UMLDevice', 40, 70, '브라우저|Browser', { w: 170, h: 110 }],
      ['ec2', 'UMLNode', 300, 40, 'EC2', { w: 270, h: 200 }],
      ['jvm', 'UMLExecutionEnvironment', 320, 95, 'Tomcat 10', { w: 230, h: 125 }],
      ['war', 'UMLArtifact', 365, 150, 'webapp.war'],
      ['rds', 'UMLNode', 660, 40, 'RDS', { w: 240, h: 200 }],
      ['mysql', 'UMLExecutionEnvironment', 680, 95, 'MySQL 8', { w: 200, h: 125 }],
      ['schema', 'UMLArtifact', 700, 150, 'schema.sql'],
    ], [['UMLCommunicationPath', 'browser', 'ec2', 'HTTPS'], ['UMLCommunicationPath', 'ec2', 'rds', 'JDBC']]);
  }),

  sample('azure-data', 'cloud', 'dgAzure', 'Azure 데이터 파이프라인|Azure Data Pipeline', 'Azure 구성, 데이터 흐름도, YAML 파이프라인|Azure layout, data flow and a YAML pipeline', (k) => {
    k.cloud('AzureDiagram', 'Azure 구성|Azure Layout', [
      ['device', 'User', '장치|Devices'], ['hub', 'Event Hubs', '수집|Ingest'], ['adf', 'Data Factory', '변환|Transform'], ['blob', 'Blob Storage', '원본 저장|Raw store'], ['synapse', 'Synapse', '분석|Analytics'], ['dbx', 'Databricks', '모델 학습|Training'], ['mon', 'Monitor'],
    ], [['device', 'hub'], ['hub', 'blob'], ['blob', 'adf'], ['adf', 'synapse'], ['adf', 'dbx'], ['synapse', 'mon']], [['group:resourceGroup', 'rg-data', ['hub', 'blob', 'adf', 'synapse', 'dbx', 'mon']]]);
    k.dfd('데이터 가공 흐름|Data Refinery', [
      ['device', 'DFDExternalEntity', '장치|Devices'], ['p1', 'DFDProcess', { name: '수집|Ingest', id: '1.0' }], ['d1', 'DFDDataStore', { name: '원본|Raw', id: 'D1' }], ['p2', 'DFDProcess', { name: '정제|Clean', id: '2.0' }], ['d2', 'DFDDataStore', { name: '분석 테이블|Curated', id: 'D2' }], ['bi', 'DFDExternalEntity', '분석가|Analyst'],
    ], [['device', 'p1', '측정값|readings'], ['p1', 'd1', '원본 이벤트|raw events'], ['d1', 'p2', '일일 묶음|daily batch'], ['p2', 'd2', '정제 데이터|clean data'], ['d2', 'bi', '보고서|reports']]);
    k.documents('YAMLDiagram', '파이프라인 설정|Pipeline Definition', [
      ['ci', 'azure-pipelines.yml', 'trigger:\n  - main\npool:\n  vmImage: ubuntu-latest\nsteps:\n  - script: pytest tests\n  - task: AzureCLI@2\n    inputs:\n      scriptType: bash\n      inlineScript: az datafactory pipeline create-run'],
      ['job', 'adf-trigger.yml', 'name: daily-batch\nschedule:\n  frequency: Day\n  time: "02:00"\nactivities:\n  - copy-raw\n  - clean\n  - load-curated'],
    ], [['ci', 'job', '배포한다|deploys']]);
  }),

  sample('gcp-serverless', 'cloud', 'dgGcp', 'GCP 서버리스 API|Serverless API on GCP', 'GCP 구성, 컨테이너, JSON 메시지|GCP layout, containers and JSON messages', (k) => {
    k.cloud('GCPDiagram', 'GCP 서버리스 구성|GCP Serverless', [
      ['user', 'User', '클라이언트|Clients'], ['lb', 'Cloud Load Balancing', 'HTTPS LB'], ['api', 'API Gateway'], ['run', 'Cloud Run', '주문 API|Orders API'], ['fs', 'Firestore', '문서 DB|Documents'], ['ps', 'Pub/Sub', '이벤트|Events'], ['fn', 'Cloud Functions', '메일 발송|Mailer'], ['bq', 'BigQuery', '분석|Analytics'],
    ], [['user', 'lb'], ['lb', 'api'], ['api', 'run'], ['run', 'fs'], ['run', 'ps'], ['ps', 'fn'], ['ps', 'bq']], [['group:project', 'orders-prod', ['api', 'run', 'fs', 'ps', 'fn', 'bq']]]);
    k.c4('주문 API 컨테이너|Orders API Containers', [
      ['client', 'externalSystem', { name: '쇼핑 앱|Shop App', description: 'API를 호출한다|Calls the API' }],
      ['api', 'C4Container', { name: '주문 API|Orders API', technology: 'Python, FastAPI', description: '주문을 받는다|Takes orders' }],
      ['fn', 'C4Container', { name: '메일 함수|Mailer Function', technology: 'Node.js', description: '확인 메일|Confirmation mail' }],
      ['db', 'C4ContainerDatabase', { name: 'Firestore|Firestore', technology: 'NoSQL', description: '주문 문서|Order documents' }],
    ], [['client', 'api', '주문한다|Orders', 'HTTPS'], ['api', 'db', '저장한다|Stores', 'gRPC'], ['api', 'fn', '이벤트를 보낸다|Publishes', 'Pub/Sub']],
    { grid: { client: [0, 0], api: [0, 1], db: [0, 2], fn: [1, 1] }, gapX: 220, gapY: 120 });
    k.documents('JSONDiagram', '주문 API 메시지|Orders API Messages', [
      ['req', '주문 요청|Order request', JSON.stringify({ customerId: 'C-1001', items: [{ sku: 'A-1', qty: 2 }, { sku: 'B-7', qty: 1 }], coupon: null }, null, 2)],
      ['res', '주문 응답|Order response', JSON.stringify({ orderId: 'O-5001', status: 'ACCEPTED', total: 42000, currency: 'KRW' }, null, 2)],
      ['evt', '주문 이벤트|Order event', JSON.stringify({ type: 'order.accepted', orderId: 'O-5001', at: '2026-11-01T09:00:00Z' }, null, 2)],
    ], [['res', 'req', 'orderId'], ['evt', 'res', 'orderId']]);
  }),

  sample('microservices', 'cloud', 'dgC4', '마이크로서비스|Microservices', '컴포넌트, C4 컨테이너, 서비스 간 시퀀스|Components, C4 containers and calls between services', (k) => {
    k.graph('UMLComponentDiagram', k.model, '서비스 컴포넌트|Service Components', [
      ['gw', 'UMLComponent', 'ApiGateway'], ['orderApi', 'interfaceIcon', 'OrderAPI'], ['order', 'UMLComponent', 'OrderService'], ['stockApi', 'interfaceIcon', 'StockAPI'], ['stock', 'UMLComponent', 'StockService'], ['bus', 'UMLComponent', 'EventBus'], ['notify', 'UMLComponent', 'NotificationService'],
    ], [['UMLUsage', 'gw', 'orderApi'], ['UMLInterfaceRealization', 'order', 'orderApi'], ['UMLUsage', 'order', 'stockApi'], ['UMLInterfaceRealization', 'stock', 'stockApi'], ['UMLDependency', 'order', 'bus'], ['UMLDependency', 'notify', 'bus']],
    { grid: { gw: [0, 0], orderApi: [1, 0], order: [2, 0], stockApi: [3, 0], stock: [4, 0], bus: [2, 1], notify: [3, 1] }, gapX: 70, gapY: 90 });
    k.c4('서비스 컨테이너|Service Containers', [
      ['user', 'C4Person', { name: '고객|Customer', description: '주문한다|Places orders' }],
      ['gw', 'C4Container', { name: 'API 게이트웨이|API Gateway', technology: 'Envoy', description: '인증과 경로 지정|Auth and routing' }],
      ['order', 'C4Container', { name: '주문 서비스|Order Service', technology: 'Java', description: '주문 규칙|Order rules' }],
      ['stock', 'C4Container', { name: '재고 서비스|Stock Service', technology: 'Go', description: '재고 예약|Reserves stock' }],
      ['orderDb', 'C4ContainerDatabase', { name: '주문 DB|Orders DB', technology: 'PostgreSQL', description: '주문|Orders' }],
      ['stockDb', 'C4ContainerDatabase', { name: '재고 DB|Stock DB', technology: 'Redis', description: '재고 수량|Stock levels' }],
    ], [['user', 'gw', '호출한다|Calls', 'HTTPS'], ['gw', 'order', '전달한다|Routes', 'gRPC'], ['order', 'stock', '재고를 예약한다|Reserves', 'gRPC'], ['order', 'orderDb', '저장한다|Stores', 'SQL'], ['stock', 'stockDb', '갱신한다|Updates', 'RESP']],
    { grid: { user: [0, 0], gw: [0, 1], order: [0, 2], stock: [1, 2], orderDb: [0, 3], stockDb: [1, 3] }, gapX: 180, gapY: 120 });
    k.sequence('사가로 주문 처리|Order Saga', ['gateway', 'orderService', 'stockService', 'paymentService'], [
      [0, 1, 'createOrder()'], [1, 2, 'reserve(items)'], [2, 1, 'reserved', 'r'], [1, 3, 'charge(amount)'], [3, 1, 'charged', 'r'], [1, 3, 'charge(amount)'], [3, 1, 'declined', 'r'], [1, 2, 'release(items)'], [1, 0, 'orderResult', 'r'],
    ], [['alt', 3, 7, '결제 성공|payment ok', 5]]);
  }),

  sample('office-network', 'cloud', 'dgNetwork', '사내 네트워크|Office Network', '네트워크, 지점 배치, 구축 계획 마인드맵|The network, branch deployment and a rollout mind map', (k) => {
    k.network('사내 네트워크|Office Network', [['office', '192.168.10.0/24'], ['server', '192.168.20.0/24']], [
      ['pc1', 'nwnode:pc', 'pc-01', '개발팀|Developers', 0, '192.168.10.11'], ['pc2', 'nwnode:laptop', 'note-02', '영업팀|Sales', 0, '192.168.10.12'], ['print', 'nwnode:printer', 'printer', '복합기|Printer', 0, '192.168.10.40'],
      ['file', 'nwnode:storage', 'nas', '파일 서버|File server', 1, '192.168.20.10'], ['ad', 'NWNode', 'dc01', '계정 서버|Directory', 1, '192.168.20.20'], ['erp', 'nwnode:database', 'erp', 'ERP DB', 1, '192.168.20.30'],
    ], [['isp', 'nwnode:cloud', '인터넷|Internet', '', [['fw', '']]], ['fw', 'nwnode:firewall', 'fw01', '방화벽|Firewall', [['net0', '192.168.10.1'], ['net1', '192.168.20.1']]]]);
    k.place('UMLDeploymentDiagram', k.model, '지점 서버 배치|Branch Deployment', [
      ['router', 'UMLDevice', 40, 60, '지점 라우터|Branch Router', { w: 190, h: 110 }],
      ['server', 'UMLNode', 320, 40, '지점 서버|Branch Server', { w: 290, h: 200 }],
      ['vm', 'UMLExecutionEnvironment', 340, 95, 'Hyper-V', { w: 250, h: 125 }],
      ['backup', 'UMLArtifact', 390, 150, 'backup-agent.exe'],
      ['hq', 'UMLNode', 700, 40, '본사 데이터센터|Head Office DC', { w: 240, h: 200 }],
    ], [['UMLCommunicationPath', 'router', 'server', 'LAN'], ['UMLCommunicationPath', 'server', 'hq', 'VPN']]);
    k.mindmap('네트워크 구축 계획|Network Rollout Plan', '네트워크 구축|Network Rollout', [
      ['장비|Hardware', ['방화벽 교체|New firewall', '스위치 증설|More switches', 'NAS 구매|Buy a NAS']],
      ['보안|Security', ['VPN 정책|VPN policy', '접근 통제|Access control']],
      ['일정|Schedule', ['1단계: 본사|Phase 1: head office', '2단계: 지점|Phase 2: branches']],
      ['교육|Training', ['사용자 안내문|User guide', '관리자 교육|Admin training']],
    ]);
  }),
];
