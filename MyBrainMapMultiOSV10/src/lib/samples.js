// Sample maps (Help › 예제 맵, samples/): finished maps on real subjects, in
// Korean and English, each showing a different layout, style and features —
// notes, icons, tags, task dates, links, relationships, boundaries, callouts,
// floating topics. Pure (no React); scripts/make-samples.mjs writes them out.
import { newMap, normalizeMap, uid, makeTopic } from './model.js';
import { build, day } from './templates.js';

// relationship helper: find topics by their text once the map is built
function rel(root, floating, a, b, label = '', extra = {}) {
  const all = [];
  const walk = (t) => { all.push(t); (t.children || []).forEach(walk); (t.callouts || []).forEach(walk); };
  walk(root); floating.forEach(walk);
  const f = all.find((t) => t.text === a), g = all.find((t) => t.text === b);
  return f && g ? { from: f.id, to: g.id, label, ...extra } : null;
}

export const SAMPLES = [
  {
    id: 'app-launch', icon: 'calendar', label: ['모바일 앱 출시 계획', 'Mobile app launch plan'], desc: ['일정·담당·마일스톤 — 간트 차트로 보기', 'Dates, owners, milestones — try the Gantt chart'],
    make: (lang, today) => {
      const { T, L } = build(lang);
      const tk = (s, e, p, who, pr) => ({ task: { start: day(today, s), due: day(today, e), progress: p, resources: L(who), ...(pr ? { priority: pr } : {}) } });
      const root = T(['가계부 앱 "머니노트" 출시', 'Budget app "MoneyNote" launch'], [
        T(['기획', 'Planning'], [
          T(['사용자 인터뷰 20명', '20 user interviews'], [], { ...tk(-14, -7, 100, ['김기획', 'Kim (PM)'], 1), notes: ['대학생·사회초년생 위주. 가장 큰 불편: 영수증 입력이 귀찮다.', 'Mostly students and new workers. Biggest pain: typing receipts.'] }),
          T(['핵심 기능 정의', 'Core features'], [T(['영수증 사진 인식', 'Receipt photo scan'], [], { icons: ['star'] }), T(['월 예산 알림', 'Monthly budget alerts']), T(['가족 공유', 'Family sharing'], [], { tags: [['2차', 'phase 2']] })], tk(-7, -2, 100, ['김기획', 'Kim (PM)'], 1)),
          T(['기획 승인', 'Plan approved'], [], { task: { due: day(today, -1), milestone: true, progress: 100 } }),
        ]),
        T(['디자인', 'Design'], [
          T(['와이어프레임', 'Wireframes'], [], tk(0, 6, 60, ['박디자', 'Park (UX)'])),
          T(['디자인 시스템', 'Design system'], [], tk(4, 12, 20, ['박디자', 'Park (UX)'])),
          T(['사용성 테스트', 'Usability test'], [], tk(13, 16, 0, ['박디자', 'Park (UX)'], 2)),
        ]),
        T(['개발', 'Development'], [
          T(['앱 (iOS · Android)', 'App (iOS, Android)'], [], tk(7, 35, 0, ['모바일팀', 'Mobile team'], 1)),
          T(['서버 API', 'Server API'], [], tk(5, 30, 10, ['백엔드팀', 'Backend team'], 1)),
          T(['영수증 인식 모델', 'Receipt OCR model'], [], { ...tk(5, 28, 15, ['AI팀', 'AI team'], 1), icons: ['warning'], notes: ['정확도 95% 이상이 목표. 손글씨 영수증은 1차에서 제외.', 'Target: 95% accuracy. Handwritten receipts are out of scope for v1.'] }),
          T(['베타 테스트', 'Beta test'], [], tk(36, 45, 0, ['QA팀', 'QA team'], 2)),
        ]),
        T(['마케팅', 'Marketing'], [
          T(['랜딩 페이지', 'Landing page'], [], { ...tk(20, 27, 0, ['이마케', 'Lee (Mkt)']), link: { url: 'https://example.com/moneynote' } }),
          T(['인플루언서 협업', 'Influencer deals'], [], tk(30, 50, 0, ['이마케', 'Lee (Mkt)'], 3)),
          T(['출시', 'Launch'], [], { task: { due: day(today, 52), milestone: true, priority: 1, progress: 0 }, icons: ['rocket'] }),
        ]),
      ], { notes: ['목표: 출시 3개월 안에 가입자 5만 명.\n\n보기 › **간트 차트**에서 일정을 막대로 보고, 막대를 끌어 일정을 바꿀 수 있습니다.', 'Goal: 50,000 sign-ups within three months of launch.\n\nOpen View › **Gantt chart** to see the dates as bars and drag them.'] });
      const map = { layout: 'right', style: 'business', root };
      map.relationships = [rel(root, [], L(['영수증 인식 모델', 'Receipt OCR model']), L(['베타 테스트', 'Beta test']), L(['먼저 완료', 'must finish first']))].filter(Boolean);
      return map;
    },
  },
  {
    id: 'marketing-4p', icon: 'target', label: ['마케팅 전략 (4P)', 'Marketing strategy (4P)'], desc: ['제품·가격·유통·홍보, 무지개 스타일', 'Product, price, place, promotion'],
    make: (lang) => {
      const { T } = build(lang);
      const root = T(['수제 그래놀라 브랜드 마케팅', 'Craft granola brand marketing'], [
        T(['제품 (Product)', 'Product'], [T(['무설탕 3종', 'Three sugar-free kinds'], [], { icons: ['star'] }), T(['재활용 파우치', 'Recyclable pouch']), T(['정기 구독', 'Subscription'], [], { tags: [['신규', 'new']] })], { side: 'right' }),
        T(['가격 (Price)', 'Price'], [T(['개당 8,900원', '$7.90 a pack']), T(['구독 15% 할인', '15% off when subscribed']), T(['경쟁사보다 10% 높게', '10% above competitors'], [], { icons: ['question'], notes: ['프리미엄 이미지를 지키되 첫 구매 쿠폰으로 진입 장벽을 낮춘다.', 'Keep the premium image; a first-order coupon lowers the barrier.'] })], { side: 'right' }),
        T(['유통 (Place)', 'Place'], [T(['자사몰', 'Own web shop']), T(['동네 카페 입점', 'Local cafés']), T(['마켓컬리', 'Online grocery'], [], { icons: ['flag-orange'] })], { side: 'left' }),
        T(['홍보 (Promotion)', 'Promotion'], [T(['인스타그램 레시피', 'Instagram recipes'], [], { icons: ['heart'] }), T(['체험단 100명', '100 testers']), T(['요가 스튜디오 제휴', 'Yoga studio partnership'])], { side: 'left' }),
      ], { notes: ['타깃: 25~39세, 건강한 아침을 원하는 직장인.', 'Target: office workers aged 25–39 who want a healthy breakfast.'] });
      return { layout: 'map', style: 'rainbow', root };
    },
  },
  {
    id: 'churn-fishbone', icon: 'fishbone', label: ['고객 이탈 원인 분석', 'Why customers leave'], desc: ['피시본 레이아웃으로 원인 찾기', 'Root causes on a fishbone'],
    make: (lang) => {
      const { T } = build(lang);
      const c = (n, list, extra) => T(n, list.map((x) => (Array.isArray(x[0]) ? T(x[0], [], x[1]) : T(x))), extra);
      const root = T(['구독 해지율 증가 (월 8%)', 'Subscription churn up (8%/month)'], [
        c(['제품', 'Product'], [[['느린 앱 속도', 'Slow app'], { icons: ['exclamation'] }], ['기능이 너무 많음', 'Too many features']]),
        c(['가격', 'Price'], [[['가격 인상 공지 부족', 'Price rise poorly announced'], { task: { priority: 1 } }], ['연간 요금제 없음', 'No yearly plan']]),
        c(['고객 지원', 'Support'], [['답변 48시간 이상', 'Replies take 48 h+'], ['FAQ 부족', 'Thin FAQ']]),
        c(['온보딩', 'Onboarding'], [[['첫 주 사용률 낮음', 'Low first-week use'], { icons: ['warning'] }], ['튜토리얼 건너뜀', 'Tutorial skipped']]),
        c(['경쟁', 'Competition'], [['무료 대안 등장', 'Free alternative']]),
        c(['결제', 'Billing'], [['카드 만료 실패', 'Expired card failures']]),
      ], { style: { fill: '#c62828', color: '#ffffff' } });
      return { layout: 'fishbone', style: 'classic', root };
    },
  },
  {
    id: 'company-org', icon: 'org', label: ['회사 조직도', 'Company org chart'], desc: ['3단계 조직도, 비즈니스 스타일', 'Three levels, business style'],
    make: (lang) => {
      const { T } = build(lang);
      const p = (role, name) => T([`${role[0]}\n${name[0]}`, `${role[1]}\n${name[1]}`], [], { icons: ['person'] });
      const root = T(['대표이사\n정하늘', 'CEO\nRiley Chen'], [
        T(['경영지원본부', 'Operations'], [p(['인사팀장', 'HR lead'], ['오민지', 'Ava Brown']), p(['재무팀장', 'Finance lead'], ['한도윤', 'Leo Park'])]),
        T(['기술본부 (CTO)', 'Engineering (CTO)'], [p(['플랫폼팀', 'Platform'], ['서지훈', 'Max Ito']), p(['모바일팀', 'Mobile'], ['윤서아', 'Mia Novak']), p(['데이터팀', 'Data'], ['강하준', 'Sam Diaz'])], { boundary: { shape: 'rounded', label: ['채용 중', 'Hiring'] } }),
        T(['사업본부', 'Business'], [p(['영업팀', 'Sales'], ['임채원', 'Zoe Kim']), p(['마케팅팀', 'Marketing'], ['조은우', 'Ian Ross'])]),
      ]);
      return { layout: 'orgDown', style: 'business', root };
    },
  },
  {
    id: 'product-roadmap', icon: 'timeline', label: ['제품 로드맵 2027', 'Product roadmap 2027'], desc: ['분기별 타임라인, 바다 스타일', 'Quarterly timeline, ocean style'],
    make: (lang) => {
      const { T } = build(lang);
      const root = T(['스마트 홈 허브 로드맵', 'Smart home hub roadmap'], [
        T(['1분기', 'Q1'], [T(['음성 명령 한국어 지원', 'Korean voice commands'], [], { task: { progress: 100 } }), T(['앱 다크 모드', 'App dark mode'], [], { task: { progress: 100 } })]),
        T(['2분기', 'Q2'], [T(['Matter 표준 지원', 'Matter support'], [], { icons: ['star'], task: { progress: 50 } }), T(['에너지 사용량 리포트', 'Energy reports'], [], { task: { progress: 25 } })]),
        T(['3분기', 'Q3'], [T(['자동화 레시피 공유', 'Shared automation recipes']), T(['카메라 연동', 'Camera support'], [], { icons: ['question'] })]),
        T(['4분기', 'Q4'], [T(['2세대 하드웨어', 'Hub gen 2'], [], { icons: ['rocket'] }), T(['해외 출시 (일본)', 'Launch in Japan'])]),
      ]);
      return { layout: 'timeline', style: 'ocean', root };
    },
  },
  {
    id: 'exam-study', icon: 'book', label: ['기말고사 공부 계획', 'Final exam study plan'], desc: ['트리 레이아웃, 진행률과 마감일', 'Tree layout with progress and dates'],
    make: (lang, today) => {
      const { T } = build(lang);
      const tk = (d, p) => ({ task: { due: day(today, d), progress: p } });
      const root = T(['2학기 기말고사', 'Fall finals'], [
        T(['미적분학', 'Calculus'], [T(['적분 기법 정리', 'Integration techniques'], [], tk(3, 75)), T(['기출 2개년', 'Two past papers'], [], tk(8, 25)), T(['오답 노트', 'Error log'], [], tk(12, 0))], { task: { priority: 1 } }),
        T(['자료구조', 'Data structures'], [T(['트리·그래프 복습', 'Trees and graphs'], [], tk(5, 50)), T(['코딩 문제 30개', '30 coding problems'], [], tk(10, 10))], { task: { priority: 2 } }),
        T(['경제학원론', 'Economics'], [T(['5~9장 요약', 'Summaries ch. 5–9'], [], tk(6, 100)), T(['그래프 문제', 'Graph questions'], [], tk(9, 0))]),
        T(['영어 회화', 'English'], [T(['발표 준비', 'Presentation'], [], { ...tk(4, 50), icons: ['people'] })]),
        T(['컨디션', 'Wellbeing'], [T(['하루 7시간 수면', 'Sleep 7 hours'], [], { icons: ['smiley-happy'] }), T(['산책 30분', '30-minute walk'])], { icons: ['heart'] }),
      ]);
      return { layout: 'treeRight', style: 'candy', root };
    },
  },
  {
    id: 'japan-trip', icon: 'pin', label: ['도쿄 4박 5일 여행', '5 days in Tokyo'], desc: ['일정·예산·준비물, 설명선과 링크', 'Itinerary, budget, packing; callouts and links'],
    make: (lang) => {
      const { T, L } = build(lang);
      const root = T(['도쿄 4박 5일', '5 days in Tokyo'], [
        T(['1일차 · 신주쿠', 'Day 1 · Shinjuku'], [T(['숙소 체크인', 'Hotel check-in']), T(['도쿄도청 전망대', 'City hall observatory'], [], { link: { url: 'https://www.yokoso.metro.tokyo.lg.jp/' } }), T(['오모이데 요코초', 'Omoide Yokocho'], [], { icons: ['fire'] })], { side: 'right' }),
        T(['2일차 · 아사쿠사', 'Day 2 · Asakusa'], [T(['센소지', 'Sensō-ji']), T(['스미다 강 유람선', 'Sumida river cruise']), T(['스카이트리', 'Skytree'], [], { icons: ['star'] })], { side: 'right' }),
        T(['3일차 · 하코네 당일치기', 'Day 3 · Hakone day trip'], [T(['로망스카', 'Romancecar']), T(['온천', 'Hot spring'], [], { icons: ['heart'] })], { side: 'right', callouts: [makeTopic(L(['패스 미리 구매!', 'Buy the pass in advance!']))] }),
        T(['예산 (1인)', 'Budget (per person)'], [T(['항공 35만원', 'Flights $260']), T(['숙박 40만원', 'Hotel $300']), T(['식비·교통 30만원', 'Food & travel $220'])], { side: 'left', icons: ['money'] }),
        T(['준비물', 'Packing'], [T(['여권', 'Passport'], [], { icons: ['check'] }), T(['교통카드 (Suica)', 'Suica card'], [], { icons: ['check'] }), T(['110V 어댑터', 'Power adapter'])], { side: 'left' }),
        T(['맛집 리스트', 'Food list'], [T(['스시 오마카세', 'Omakase sushi']), T(['라멘', 'Ramen']), T(['몬자야키', 'Monjayaki'])], { side: 'left', icons: ['bookmark'] }),
      ]);
      return { layout: 'map', style: 'sunset', root };
    },
  },
  {
    id: 'website-sitemap', icon: 'mapView', label: ['웹사이트 사이트맵', 'Website sitemap'], desc: ['조직도로 그린 페이지 구조, 청사진 스타일', 'Pages as an org chart, blueprint style'],
    make: (lang) => {
      const { T } = build(lang);
      const root = T(['홈', 'Home'], [
        T(['회사 소개', 'About'], [T(['비전', 'Vision']), T(['연혁', 'History']), T(['오시는 길', 'Location'])]),
        T(['제품', 'Products'], [T(['스마트 조명', 'Smart lights']), T(['센서', 'Sensors']), T(['비교하기', 'Compare'], [], { tags: [['신규', 'new']] })]),
        T(['고객 지원', 'Support'], [T(['FAQ', 'FAQ']), T(['문의하기', 'Contact']), T(['매뉴얼 다운로드', 'Manuals'])]),
        T(['블로그', 'Blog'], [T(['공지', 'News']), T(['사용 팁', 'Tips'])]),
        T(['쇼핑몰', 'Shop'], [T(['장바구니', 'Cart']), T(['결제', 'Checkout'], [], { icons: ['lock'] })]),
      ]);
      return { layout: 'orgDown', style: 'blueprint', root };
    },
  },
  {
    id: 'blog-plan', icon: 'notes', label: ['블로그 글 기획', 'Blog post outline'], desc: ['메모가 많은 글 개요, 종이 스타일', 'An outline with notes, paper style'],
    make: (lang) => {
      const { T } = build(lang);
      const root = T(['재택근무 1년, 배운 것들', 'A year of remote work'], [
        T(['들어가며', 'Intro'], [T(['처음의 기대와 걱정', 'Hopes and worries'])], { notes: ['짧은 일화로 시작: 첫날 잠옷 차림으로 화상회의에 들어간 이야기.', 'Open with an anecdote: the first video call in pyjamas.'] }),
        T(['좋았던 점', 'The good'], [T(['출퇴근 시간 0분', 'No commute'], [], { icons: ['smiley-happy'] }), T(['집중 시간 확보', 'Time to focus'])]),
        T(['힘들었던 점', 'The hard'], [T(['일과 생활의 경계', 'Work–life blur'], [], { icons: ['smiley-sad'] }), T(['외로움', 'Loneliness'])]),
        T(['나만의 규칙 5가지', 'My five rules'], [T(['출근 의식 만들기', 'A start-of-day ritual']), T(['책상은 일만', 'A desk only for work']), T(['점심은 밖에서', 'Lunch outside']), T(['알림 끄는 시간', 'Notification-free hours']), T(['금요일 회고', 'Friday review'])], { icons: ['idea'], notes: ['각 규칙마다 사진 한 장과 3~4문장.', 'One photo and 3–4 sentences per rule.'] }),
        T(['마치며', 'Closing'], [T(['독자에게 질문 던지기', 'Ask readers a question'])]),
      ], { notes: ['분량 2,000자 · 발행 목표 금요일 · 태그: 재택, 생산성', 'About 1,200 words · publish on Friday · tags: remote, productivity'] });
      return { layout: 'right', style: 'paper', root };
    },
  },
  {
    id: 'yearly-goals', icon: 'target', label: ['나의 2027 목표', 'My goals for 2027'], desc: ['영역별 목표와 진행률, 숲 스타일', 'Goals by area with progress, forest style'],
    make: (lang) => {
      const { T } = build(lang);
      const g = (n, p) => T(n, [], { task: { progress: p } });
      const root = T(['2027년의 나', 'Me in 2027'], [
        T(['건강', 'Health'], [g(['하프 마라톤 완주', 'Run a half marathon'], 25), g(['주 3회 근력 운동', 'Strength training 3×/week'], 50)], { icons: ['heart'] }),
        T(['배움', 'Learning'], [g(['일본어 JLPT N3', 'JLPT N3 Japanese'], 25), g(['책 24권', '24 books'], 50)], { icons: ['book'] }),
        T(['일', 'Work'], [g(['팀 리드 역할', 'Lead a team'], 0), g(['사이드 프로젝트 출시', 'Ship a side project'], 75)], { icons: ['rocket'] }),
        T(['돈', 'Money'], [g(['비상금 6개월치', 'Six months of savings'], 50), g(['연금 계좌 시작', 'Start a pension plan'], 100)], { icons: ['money'] }),
        T(['관계', 'People'], [g(['매달 부모님 방문', 'Visit my parents monthly'], 75), g(['친구들과 여행', 'A trip with friends'], 0)], { icons: ['people'] }),
      ]);
      return { layout: 'map', style: 'forest', root };
    },
  },
  {
    id: 'event-checklist', icon: 'checkSquare', label: ['행사 준비 체크리스트', 'Event checklist'], desc: ['D-day 별 할 일, 파스텔 스타일', 'To-dos by countdown, pastel style'],
    make: (lang, today) => {
      const { T } = build(lang);
      const tk = (d, p, who) => ({ task: { due: day(today, d), progress: p, resources: who } });
      const root = T(['사내 송년회 (80명)', 'Company year-end party (80)'], [
        T(['D-30', 'D-30'], [T(['장소 예약', 'Book the venue'], [], tk(-2, 100, 'HR')), T(['예산 승인', 'Budget approval'], [], tk(0, 100, 'HR'))]),
        T(['D-14', 'D-14'], [T(['초대장 발송', 'Send invitations'], [], tk(14, 50, 'HR')), T(['케이터링 계약', 'Catering contract'], [], tk(16, 25, 'GA'))]),
        T(['D-7', 'D-7'], [T(['경품 구매', 'Buy prizes'], [], tk(23, 0, 'GA')), T(['진행 대본', 'Host script'], [], tk(24, 0, 'HR'))]),
        T(['D-day', 'D-day'], [T(['음향 점검', 'Sound check'], [], tk(30, 0, 'IT')), T(['사진 촬영', 'Photos'], [], { ...tk(30, 0, 'PR'), icons: ['star'] })], { icons: ['flag-red'] }),
      ]);
      return { layout: 'treeRight', style: 'pastel', root };
    },
  },
  {
    id: 'software-arch', icon: 'settings', label: ['서비스 아키텍처', 'Service architecture'], desc: ['구성 요소와 관계선, 미드나이트 스타일', 'Components and relationships, midnight style'],
    make: (lang) => {
      const { T, L } = build(lang);
      const root = T(['쇼핑몰 서비스', 'Shop service'], [
        T(['프론트엔드', 'Frontend'], [T(['웹 (React)', 'Web (React)']), T(['모바일 앱', 'Mobile app'])], { side: 'left' }),
        T(['API 게이트웨이', 'API gateway'], [T(['인증 (OAuth)', 'Auth (OAuth)'], [], { icons: ['lock'] }), T(['요청 제한', 'Rate limiting'])], { side: 'left' }),
        T(['백엔드 서비스', 'Backend services'], [T(['주문', 'Orders']), T(['결제', 'Payments'], [], { icons: ['money'] }), T(['재고', 'Inventory']), T(['알림', 'Notifications'])], { side: 'right', boundary: { shape: 'rect', label: ['쿠버네티스', 'Kubernetes'] } }),
        T(['데이터', 'Data'], [T(['PostgreSQL', 'PostgreSQL']), T(['Redis 캐시', 'Redis cache']), T(['이벤트 큐 (Kafka)', 'Event queue (Kafka)'])], { side: 'right' }),
        T(['운영', 'Operations'], [T(['모니터링', 'Monitoring'], [], { icons: ['chart'] }), T(['로그 수집', 'Logging'])], { side: 'right' }),
      ]);
      const map = { layout: 'map', style: 'midnight', root };
      const k = (x) => L(x);
      map.relationships = [
        rel(root, [], k(['웹 (React)', 'Web (React)']), k(['인증 (OAuth)', 'Auth (OAuth)']), 'HTTPS'),
        rel(root, [], k(['주문', 'Orders']), k(['이벤트 큐 (Kafka)', 'Event queue (Kafka)']), k(['주문 이벤트', 'order events'])),
        rel(root, [], k(['결제', 'Payments']), k(['PostgreSQL', 'PostgreSQL'])),
      ].filter(Boolean);
      return map;
    },
  },
  {
    id: 'book-summary', icon: 'bookOpen', label: ['책 요약: 습관의 힘', 'Book summary: habits'], desc: ['독서 토론용 요약, 스케치 스타일', 'Book club notes, sketch style'],
    make: (lang) => {
      const { T } = build(lang);
      const root = T(['작은 습관이 만드는 큰 변화', 'Small habits, big change'], [
        T(['핵심 개념', 'Key ideas'], [T(['1%씩 나아지기', 'Get 1% better']), T(['정체성 중심 습관', 'Identity-based habits'], [], { icons: ['idea'] })]),
        T(['습관의 4단계', 'Four steps of a habit'], [T(['신호', 'Cue']), T(['욕구', 'Craving']), T(['반응', 'Response']), T(['보상', 'Reward'])]),
        T(['실천 방법', 'How to apply'], [T(['분명하게 만들기', 'Make it obvious']), T(['매력적으로', 'Make it attractive']), T(['쉽게', 'Make it easy']), T(['만족스럽게', 'Make it satisfying'])], { icons: ['check'] }),
        T(['인상 깊은 문장', 'Quotes'], [T(['"목표가 아니라 시스템이다"', '"Systems, not goals"'], [], { icons: ['bookmark'] })]),
        T(['토론 질문', 'Questions'], [T(['내가 없애고 싶은 습관은?', 'Which habit would I drop?'], [], { icons: ['question'] }), T(['2분 규칙을 적용해 본다면?', 'Where could the 2-minute rule help?'], [], { icons: ['question'] })]),
      ]);
      return { layout: 'map', style: 'sketch', root };
    },
  },
  {
    id: 'lean-canvas', icon: 'idea', label: ['창업 아이디어 (린 캔버스)', 'Startup idea (lean canvas)'], desc: ['9칸 린 캔버스, 네온 스타일', 'The nine boxes, neon style'],
    make: (lang) => {
      const { T } = build(lang);
      const root = T(['반려견 산책 매칭 앱', 'Dog-walking match app'], [
        T(['문제', 'Problem'], [T(['야근 때 산책 못 함', 'No walks on late workdays']), T(['믿을 만한 산책인 찾기 어려움', 'Hard to find trusted walkers'])], { side: 'right' }),
        T(['고객', 'Customers'], [T(['1인 가구 견주', 'Single dog owners'])], { side: 'right' }),
        T(['가치 제안', 'Value'], [T(['검증된 이웃이 30분 산책', '30-minute walks by vetted neighbours'], [], { icons: ['star'] })], { side: 'right' }),
        T(['해결책', 'Solution'], [T(['실시간 위치 공유', 'Live location']), T(['산책 사진 리포트', 'Photo reports'])], { side: 'right' }),
        T(['채널', 'Channels'], [T(['동물병원 제휴', 'Vet partnerships'])], { side: 'right' }),
        T(['수익', 'Revenue'], [T(['산책 1회 15,000원', '$12 a walk']), T(['수수료 20%', '20% fee'])], { side: 'left', icons: ['money'] }),
        T(['비용', 'Costs'], [T(['보험', 'Insurance']), T(['광고', 'Ads'])], { side: 'left' }),
        T(['핵심 지표', 'Key metrics'], [T(['재이용률', 'Repeat rate'], [], { icons: ['chart'] })], { side: 'left' }),
        T(['경쟁 우위', 'Unfair advantage'], [T(['동네 커뮤니티', 'Neighbourhood community'])], { side: 'left' }),
      ]);
      return { layout: 'map', style: 'neon', root };
    },
  },
  {
    id: 'risk-register', icon: 'warning', label: ['프로젝트 위험 관리', 'Project risk register'], desc: ['우선순위·깃발·대응책, 그래파이트 스타일', 'Priorities, flags, mitigations, graphite style'],
    make: (lang) => {
      const { T } = build(lang);
      const r = (n, pr, flag, fix) => T(n, [T(fix, [], { icons: ['check'] })], { task: { priority: pr }, icons: [flag] });
      const root = T(['ERP 교체 프로젝트 위험', 'ERP migration risks'], [
        T(['높음', 'High'], [r(['데이터 이전 오류', 'Data migration errors'], 1, 'flag-red', ['3회 리허설', 'Three dry runs']), r(['핵심 인력 이탈', 'Key people leaving'], 1, 'flag-red', ['문서화·백업 담당', 'Docs and backups'])], { style: { fill: '#c62828', color: '#ffffff' } }),
        T(['중간', 'Medium'], [r(['일정 2주 지연', 'Two-week slip'], 2, 'flag-orange', ['버퍼 기간 확보', 'Schedule buffer']), r(['현업 교육 부족', 'Too little training'], 3, 'flag-orange', ['부서별 챔피언', 'Department champions'])], { style: { fill: '#ef6c00', color: '#ffffff' } }),
        T(['낮음', 'Low'], [r(['라이선스 비용 증가', 'Licence cost rise'], 5, 'flag-green', ['3년 계약 협상', 'Negotiate 3 years'])], { style: { fill: '#2e7d32', color: '#ffffff' } }),
      ], { notes: ['매주 월요일 위험 검토 회의에서 갱신.', 'Reviewed every Monday at the risk meeting.'] });
      return { layout: 'right', style: 'graphite', root };
    },
  },
  {
    id: 'brainstorm-names', icon: 'idea', label: ['카페 이름 브레인스토밍', 'Café name brainstorm'], desc: ['플로팅 토픽과 관계선, 앱 테마 스타일', 'Floating topics and links, app theme style'],
    make: (lang) => {
      const { T, L } = build(lang);
      const root = T(['새 카페 이름', 'A name for the new café'], [
        T(['분위기', 'Mood'], [T(['아늑함', 'Cosy']), T(['책', 'Books']), T(['햇살', 'Sunlight'])]),
        T(['후보', 'Candidates'], [T(['햇살서재', 'Sunny Shelf'], [], { icons: ['star'], task: { priority: 1 } }), T(['느린오후', 'Slow Afternoon'], [], { task: { priority: 2 } }), T(['한모금', 'One Sip'])]),
        T(['기준', 'Criteria'], [T(['부르기 쉬움', 'Easy to say']), T(['도메인 가능', 'Domain free'], [], { icons: ['question'] }), T(['간판에 어울림', 'Works on a sign'])]),
      ]);
      const floating = [{ ...T(['손님 투표로 결정!', 'Let customers vote!'], [], { icons: ['people'] }), x: -230, y: 125 }];
      const map = { layout: 'map', style: 'auto', root, floating };
      map.relationships = [rel(root, floating, L(['책', 'Books']), L(['햇살서재', 'Sunny Shelf']), L(['영감', 'inspired'])), rel(root, floating, L(['손님 투표로 결정!', 'Let customers vote!']), L(['후보', 'Candidates']))].filter(Boolean);
      return map;
    },
  },
];

export function mapFromSample(id, lang = 'ko', { today = new Date() } = {}) {
  const s = SAMPLES.find((x) => x.id === id) || SAMPLES[0];
  const def = s.make(lang, today);
  const map = newMap({ title: '', layout: def.layout || 'map', style: def.style || 'auto' });
  map.root = def.root;
  map.floating = def.floating || [];
  map.relationships = (def.relationships || []).map((r) => ({ id: uid(), ...r }));
  return normalizeMap(map);
}
