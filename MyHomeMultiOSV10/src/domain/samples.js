// Sample sites (the start page's Samples card, File › Open sample): forty finished websites
// in four groups (ten each), each in Korean and English, to look at, take apart and start from. Every
// sample is a short description (spec) turned into pages by compose().
import { buildSite } from './templates.js';
import { SAMPLE_BOARDS } from './sample-boards.js';

export const SAMPLE_GROUPS = [
  { id: 'business', icon: 'smpBusiness', ko: '회사·전문 서비스', en: 'Business & services' },
  { id: 'food', icon: 'smpFood', ko: '음식·가게', en: 'Food & shops' },
  { id: 'people', icon: 'smpPeople', ko: '개인·작품', en: 'Personal & portfolio' },
  { id: 'community', icon: 'smpCommunity', ko: '모임·행사·교육', en: 'Community, events & learning' },
];

// [ko, en] pairs; compose() picks one.
const S = [
  {
    id: 'law', group: 'business', icon: 'smpLaw', design: 'classic', art: 'office', offer: 'services',
    name: ['정의 법률사무소', 'Justice Law Office'], tip: ['신뢰를 주는 법률 사무소', 'A trustworthy law firm'],
    hero: ['당신 편에 서는\n든든한 법률 파트너', 'A legal partner\non your side'], lead: ['20년 경력 변호사들이 사건 하나하나를 끝까지 책임집니다.', 'Lawyers with 20 years of experience see every case through.'],
    features: [['⚖️', ['민사·형사', 'Civil & criminal'], ['폭넓은 사건 경험', 'Wide case experience']], ['🏢', ['기업 법무', 'Corporate law'], ['계약부터 분쟁까지', 'From contracts to disputes']], ['🤝', ['무료 상담', 'Free consultation'], ['첫 상담 30분 무료', 'First 30 minutes free']]],
    items: [['소송 대리', 'Litigation'], ['계약 검토', 'Contract review'], ['노무 자문', 'Labour advice']], phone: '02-555-0101',
  },
  {
    id: 'startup', group: 'business', icon: 'smpStartup', design: 'midnight', art: 'tech', offer: 'pricing',
    name: ['클라우드노트', 'CloudNote'], tip: ['소프트웨어 서비스 소개', 'A software product page'],
    hero: ['팀의 모든 기록을\n한곳에', "All your team's notes\nin one place"], lead: ['회의록, 문서, 할 일을 실시간으로 함께 씁니다.', 'Write meeting notes, docs and tasks together, live.'],
    features: [['⚡', ['실시간 협업', 'Live collaboration'], ['동시에 함께 편집', 'Edit together at once']], ['🔒', ['안전한 보관', 'Secure'], ['모든 데이터 암호화', 'Everything encrypted']], ['📱', ['어디서나', 'Everywhere'], ['PC·휴대폰·태블릿', 'Desktop, phone, tablet']]],
    items: [['무료', 'Free'], ['팀', 'Team'], ['기업', 'Enterprise']], phone: '1588-0000',
  },
  {
    id: 'interior', group: 'business', icon: 'smpInterior', design: 'earth', art: 'city', offer: 'gallery',
    name: ['온담 인테리어', 'Ondam Interiors'], tip: ['인테리어 시공 회사', 'An interior design studio'],
    hero: ['머물고 싶은 공간을\n만듭니다', 'Spaces you want\nto stay in'], lead: ['상담부터 시공, 사후 관리까지 한 팀이 맡습니다.', 'One team from first talk to finishing touches.'],
    features: [['📐', ['맞춤 설계', 'Custom design'], ['생활에 맞춘 공간', 'Made for how you live']], ['🧱', ['정직한 자재', 'Honest materials'], ['친환경 자재 사용', 'Eco-friendly materials']], ['🛠️', ['2년 보증', '2-year warranty'], ['책임 있는 관리', 'Care after the work']]],
    items: [['아파트 리모델링', 'Apartment remodel'], ['상업 공간', 'Shops & offices'], ['부분 시공', 'Partial works']], phone: '031-777-2020',
  },
  {
    id: 'realestate', group: 'business', icon: 'smpRealestate', design: 'teal', art: 'city', offer: 'services',
    name: ['햇살 부동산', 'Sunny Homes'], tip: ['동네 부동산 중개', 'A local real-estate agent'],
    hero: ['좋은 집,\n좋은 이웃을 찾아 드립니다', 'Find a good home\nand good neighbours'], lead: ['동네를 가장 잘 아는 중개사가 함께 다닙니다.', 'An agent who knows the area walks with you.'],
    features: [['🏠', ['매매·전월세', 'Buy & rent'], ['다양한 매물', 'Many listings']], ['🔍', ['꼼꼼한 확인', 'Careful checks'], ['권리 관계 확인', 'Title checks']], ['🚗', ['함께 방문', 'Viewings'], ['원하는 시간에', 'At your time']]],
    items: [['아파트', 'Apartments'], ['오피스텔', 'Studios'], ['상가', 'Shops']], phone: '02-321-7788',
  },
  {
    id: 'bakery', group: 'food', icon: 'smpBakery', design: 'peach', art: 'cafe', offer: 'menu',
    name: ['밀과 버터', 'Flour & Butter'], tip: ['동네 빵집', 'A neighbourhood bakery'],
    hero: ['매일 새벽에 굽는\n따뜻한 빵', 'Warm bread\nbaked every dawn'], lead: ['좋은 밀가루와 버터만 씁니다.', 'Only good flour and real butter.'],
    features: [['🥐', ['매일 굽기', 'Baked daily'], ['새벽 5시부터', 'From 5 am']], ['🌾', ['국산 밀', 'Local wheat'], ['믿을 수 있는 재료', 'Ingredients you trust']], ['🎂', ['주문 케이크', 'Custom cakes'], ['3일 전 예약', 'Order 3 days ahead']]],
    items: [['크루아상', 'Croissant', '3,800'], ['식빵', 'Sandwich loaf', '5,500'], ['딸기 케이크', 'Strawberry cake', '32,000'], ['소금빵', 'Salt roll', '3,200']], phone: '02-345-6789',
  },
  {
    id: 'bistro', group: 'food', icon: 'smpBistro', design: 'wine', art: 'food', offer: 'menu',
    name: ['비스트로 루나', 'Bistro Luna'], tip: ['분위기 있는 레스토랑', 'An evening bistro'],
    hero: ['달빛 아래\n특별한 저녁', 'A special evening\nunder the moon'], lead: ['계절 재료로 만드는 코스 요리와 와인.', 'Seasonal tasting menus and wine.'],
    features: [['🍷', ['와인 페어링', 'Wine pairing'], ['소믈리에 추천', 'Picked by our sommelier']], ['🕯️', ['조용한 공간', 'Quiet room'], ['기념일에 좋아요', 'Perfect for occasions']], ['🍽️', ['코스 요리', 'Tasting menu'], ['5가지 코스', 'Five courses']]],
    items: [['런치 코스', 'Lunch course', '45,000'], ['디너 코스', 'Dinner course', '89,000'], ['와인 페어링', 'Wine pairing', '55,000']], phone: '02-987-6543',
  },
  {
    id: 'flower', group: 'food', icon: 'smpFlower', design: 'rose', art: 'nature', offer: 'shop',
    name: ['꽃다발 공방', 'Bloom Studio'], tip: ['꽃집과 꽃 배달', 'A florist with delivery'],
    hero: ['마음을 전하는\n가장 예쁜 방법', 'The prettiest way\nto say it'], lead: ['당일 꽃 배달, 정기 구독, 꽃꽂이 수업.', 'Same-day delivery, subscriptions and classes.'],
    features: [['💐', ['당일 배달', 'Same-day'], ['오후 2시 주문까지', 'Order by 2 pm']], ['📦', ['정기 구독', 'Subscription'], ['2주마다 새 꽃', 'Fresh flowers every 2 weeks']], ['🌷', ['원데이 클래스', 'Classes'], ['주말 수업', 'Weekend lessons']]],
    items: [['장미 꽃다발', 'Rose bouquet', '45,000'], ['계절 꽃바구니', 'Seasonal basket', '60,000'], ['꽃 구독', 'Subscription', '39,000']], phone: '02-111-2233',
  },
  {
    id: 'farm', group: 'food', icon: 'smpFarm', design: 'olive', art: 'landscape', offer: 'shop',
    name: ['초록 농장', 'Green Acre Farm'], tip: ['농산물 직거래', 'Farm-to-table produce'],
    hero: ['땅이 키운\n정직한 먹거리', 'Honest food\ngrown by the land'], lead: ['농약 없이 기른 채소와 과일을 집 앞까지.', 'Vegetables and fruit grown without pesticides, to your door.'],
    features: [['🥬', ['무농약', 'Pesticide-free'], ['인증 받은 농장', 'Certified farm']], ['🚚', ['산지 직송', 'Direct from farm'], ['수확 당일 발송', 'Shipped on harvest day']], ['👨‍🌾', ['농장 체험', 'Farm visits'], ['가족 체험 프로그램', 'Family programs']]],
    items: [['채소 꾸러미', 'Veggie box', '29,000'], ['제철 과일', 'Seasonal fruit', '35,000'], ['체험 예약', 'Farm visit', '15,000']], phone: '033-444-5566',
  },
  {
    id: 'photographer', group: 'people', icon: 'smpPhoto', design: 'carbon', art: 'landscape', offer: 'gallery',
    name: ['한결 사진', 'Hangyeol Photo'], tip: ['사진작가 포트폴리오', "A photographer's portfolio"],
    hero: ['빛과 순간을\n기록합니다', 'Capturing light\nand moments'], lead: ['웨딩, 프로필, 여행 사진을 찍습니다.', 'Weddings, portraits and travel photography.'],
    features: [['📷', ['웨딩 촬영', 'Weddings'], ['자연스러운 순간', 'Natural moments']], ['🙂', ['프로필', 'Portraits'], ['나다운 모습', 'The real you']], ['✈️', ['여행 스냅', 'Travel'], ['국내외 출장', 'Anywhere']]],
    items: [['웨딩', 'Wedding'], ['프로필', 'Portrait'], ['가족', 'Family']], phone: '010-1234-5678',
  },
  {
    id: 'illustrator', group: 'people', icon: 'smpArt', design: 'lavender', art: 'abstract', offer: 'gallery',
    name: ['그림 그리는 하루', 'Drawing Days'], tip: ['일러스트레이터 작품집', "An illustrator's work"],
    hero: ['따뜻한 그림으로\n이야기를 전합니다', 'Telling stories\nwith warm pictures'], lead: ['책 표지, 캐릭터, 광고 그림을 그립니다.', 'Book covers, characters and ad illustrations.'],
    features: [['🎨', ['일러스트', 'Illustration'], ['책·잡지·광고', 'Books, magazines, ads']], ['🐻', ['캐릭터', 'Characters'], ['브랜드 캐릭터 개발', 'Brand mascots']], ['🖼️', ['전시', 'Exhibitions'], ['개인전 5회', 'Five solo shows']]],
    items: [['표지 그림', 'Covers'], ['캐릭터', 'Characters'], ['포스터', 'Posters']], phone: '010-9876-5432',
  },
  {
    id: 'developer', group: 'people', icon: 'smpDev', design: 'terminal', art: 'tech', offer: 'services',
    name: ['dev.minho', 'dev.alex'], tip: ['개발자 개인 사이트', "A developer's homepage"],
    hero: ['코드로\n문제를 풉니다', 'I solve problems\nwith code'], lead: ['백엔드와 클라우드를 다루는 10년 차 개발자입니다.', 'A backend and cloud engineer with ten years of experience.'],
    features: [['🦀', ['Rust · Go', 'Rust · Go'], ['빠르고 안전한 서버', 'Fast, safe servers']], ['☁️', ['클라우드', 'Cloud'], ['AWS · Kubernetes', 'AWS · Kubernetes']], ['📝', ['기술 블로그', 'Tech blog'], ['매주 한 편', 'One post a week']]],
    items: [['오픈소스', 'Open source'], ['강연', 'Talks'], ['컨설팅', 'Consulting']], phone: '',
  },
  {
    id: 'wedding', group: 'people', icon: 'smpWedding', design: 'wedding', art: 'nature', offer: 'events',
    name: ['민준 ♥ 서연', 'James ♥ Sophie'], tip: ['모바일 청첩장', 'A wedding invitation'],
    hero: ['저희 두 사람,\n결혼합니다', 'We are\ngetting married'], lead: ['2026년 5월 16일 토요일 오후 1시', 'Saturday, May 16, 2026, 1 pm'],
    features: [['💍', ['예식', 'Ceremony'], ['오후 1시', '1 pm']], ['🍽️', ['피로연', 'Reception'], ['오후 2시', '2 pm']], ['🚌', ['셔틀 버스', 'Shuttle'], ['역 앞에서 출발', 'From the station']]],
    items: [['예식', 'Ceremony', '13:00'], ['식사', 'Lunch', '14:00'], ['사진 촬영', 'Photos', '15:00']], phone: '',
  },
  {
    id: 'church', group: 'community', icon: 'smpChurch', design: 'royal', art: 'landscape', offer: 'events',
    name: ['사랑의 교회', 'Grace Community Church'], tip: ['교회·종교 단체', 'A church community'],
    hero: ['누구나 환영하는\n따뜻한 공동체', 'A warm community\nwhere all are welcome'], lead: ['주일 예배 오전 11시', 'Sunday service at 11 am'],
    features: [['🙏', ['예배', 'Worship'], ['주일·수요 예배', 'Sunday & Wednesday']], ['👨‍👩‍👧', ['가족 모임', 'Families'], ['어린이·청년부', 'Kids & youth']], ['❤️', ['나눔', 'Outreach'], ['지역 봉사', 'Serving our town']]],
    items: [['주일 예배', 'Sunday service', '11:00'], ['청년부 모임', 'Youth group', '14:00'], ['수요 예배', 'Wednesday service', '19:30']], phone: '02-700-1004',
  },
  {
    id: 'school', group: 'community', icon: 'smpSchool', design: 'sky', art: 'book', offer: 'pricing',
    name: ['코딩 놀이터', 'Code Playground'], tip: ['어린이 코딩 교실', 'A coding class for kids'],
    hero: ['놀면서 배우는\n어린이 코딩', 'Kids learn to code\nby playing'], lead: ['초등학생을 위한 블록 코딩과 로봇 수업.', 'Block coding and robots for primary school kids.'],
    features: [['🧩', ['블록 코딩', 'Block coding'], ['쉽고 재미있게', 'Easy and fun']], ['🤖', ['로봇', 'Robots'], ['직접 만들어 움직이기', 'Build and move']], ['🏆', ['대회 준비', 'Contests'], ['수상 경험 다수', 'Many awards']]],
    items: [['입문반', 'Starter'], ['정규반', 'Regular'], ['대회반', 'Contest']], phone: '031-222-3344',
  },
  {
    id: 'gym', group: 'community', icon: 'smpGym', design: 'ember', art: 'abstract', offer: 'pricing',
    name: ['파워 짐', 'Power Gym'], tip: ['헬스장·운동 센터', 'A fitness centre'],
    hero: ['오늘이\n가장 젊은 날', 'Today is\nthe youngest you'], lead: ['1:1 PT와 그룹 수업으로 목표를 이루세요.', 'Reach your goals with personal training and classes.'],
    features: [['🏋️', ['최신 기구', 'New equipment'], ['200평 넓은 공간', 'A large floor']], ['🧘', ['그룹 수업', 'Classes'], ['요가·필라테스', 'Yoga, pilates']], ['🥗', ['식단 관리', 'Nutrition'], ['맞춤 식단 상담', 'Personal meal plans']]],
    items: [['1개월', '1 month'], ['3개월', '3 months'], ['PT 10회', '10 PT sessions']], phone: '02-888-9090',
  },
  {
    id: 'club', group: 'community', icon: 'smpClub', design: 'forest', art: 'mountain', offer: 'events',
    name: ['주말 산악회', 'Weekend Hikers'], tip: ['동호회·모임', 'A hobby club'],
    hero: ['함께 걸으면\n더 멀리 갑니다', 'Walk together,\ngo further'], lead: ['매달 둘째·넷째 토요일, 가까운 산으로 떠납니다.', 'Every 2nd and 4th Saturday, to a hill near you.'],
    features: [['⛰️', ['정기 산행', 'Regular hikes'], ['한 달에 두 번', 'Twice a month']], ['🧭', ['초보 환영', 'Beginners welcome'], ['쉬운 코스부터', 'Easy trails first']], ['📸', ['추억 기록', 'Memories'], ['산행 사진 공유', 'Shared photos']]],
    items: [['북한산 둘레길', 'River trail', '11.14'], ['관악산', 'Pine ridge', '11.28'], ['송년 산행', 'Year-end hike', '12.12']], phone: '010-2468-1357',
  },
  {
    id: 'aistudio', group: 'business', icon: 'smpAi', design: 'galaxy', art: 'tech', offer: 'pricing',
    name: ['루멘 AI', 'Lumen AI'], tip: ['AI 자동화 서비스', 'An AI automation service'],
    hero: ['반복 업무는 AI에게,\n팀은 더 중요한 일에', 'Let AI do the busywork,\nyour team does the rest'], lead: ['문서 요약, 고객 응대, 보고서 작성을 몇 분 만에 끝냅니다.', 'Summaries, customer replies and reports done in minutes.'],
    features: [['🤖', ['AI 비서', 'AI assistant'], ['24시간 고객 응대', 'Answers customers 24/7']], ['📊', ['자동 보고서', 'Auto reports'], ['매일 아침 정리된 숫자', 'Fresh numbers every morning']], ['🔐', ['안전한 데이터', 'Private data'], ['국내 서버 보관', 'Stored on local servers']]],
    items: [['스타터', 'Starter'], ['프로', 'Pro'], ['엔터프라이즈', 'Enterprise']], phone: '1600-2026',
  },
  {
    id: 'agency', group: 'business', icon: 'smpAgency', design: 'neon', art: 'abstract', offer: 'gallery',
    name: ['스튜디오 픽셀', 'Studio Pixel'], tip: ['브랜드·웹 디자인 에이전시', 'A brand and web design agency'],
    hero: ['브랜드에\n선명한 첫인상을', 'Give your brand\na bold first look'], lead: ['로고부터 웹사이트, 영상까지 한 팀이 만듭니다.', 'One team for your logo, website and video.'],
    features: [['✏️', ['브랜딩', 'Branding'], ['로고와 브랜드 규칙', 'Logos and brand rules']], ['💻', ['웹 디자인', 'Web design'], ['반응형 웹사이트', 'Responsive websites']], ['🎬', ['모션', 'Motion'], ['짧은 홍보 영상', 'Short promo videos']]],
    items: [['브랜드 리뉴얼', 'Rebranding'], ['쇼핑몰 디자인', 'Online store'], ['앱 화면', 'App screens']], phone: '02-6000-7000',
  },
  {
    id: 'clinic', group: 'business', icon: 'smpClinic', design: 'mint', art: 'nature', offer: 'services',
    name: ['미소 치과', 'Smile Dental'], tip: ['동네 치과 의원', 'A family dental clinic'],
    hero: ['아프지 않게,\n꼼꼼하게', 'Gentle care,\ncareful hands'], lead: ['평일 저녁 8시, 토요일 오후 3시까지 진료합니다.', 'Open until 8 pm on weekdays and 3 pm on Saturdays.'],
    features: [['🦷', ['정기 검진', 'Check-ups'], ['6개월마다 관리', 'Every six months']], ['😁', ['교정', 'Braces'], ['투명 교정 상담', 'Clear aligners']], ['👶', ['어린이 진료', 'Children'], ['무섭지 않은 치과', 'A friendly first visit']]],
    items: [['스케일링', 'Cleaning'], ['충치 치료', 'Fillings'], ['임플란트', 'Implants']], phone: '02-555-2875',
  },
  {
    id: 'accounting', group: 'business', icon: 'smpAccount', design: 'corporate', art: 'office', offer: 'services',
    name: ['바른 세무회계', 'Clear Books Accounting'], tip: ['세무·회계 사무소', 'An accounting firm'],
    hero: ['세금 걱정은 덜고\n사업에 집중하세요', 'Worry less about tax,\nfocus on your business'], lead: ['개인 사업자와 작은 회사의 장부를 정확하게 관리합니다.', 'Accurate books for sole traders and small companies.'],
    features: [['🧾', ['기장 대행', 'Bookkeeping'], ['매달 정리하는 장부', 'Monthly books']], ['📅', ['신고 대행', 'Tax returns'], ['기한 놓치지 않게', 'Never miss a deadline']], ['💬', ['상담', 'Advice'], ['절세 방법 안내', 'Ways to pay less tax']]],
    items: [['부가세 신고', 'Sales tax returns'], ['종합소득세', 'Income tax'], ['법인 결산', 'Year-end accounts']], phone: '02-3456-7800',
  },
  {
    id: 'coworking', group: 'business', icon: 'smpCowork', design: 'slate', art: 'city', offer: 'pricing',
    name: ['오픈데스크', 'Open Desk'], tip: ['공유 오피스', 'A coworking space'],
    hero: ['일이 잘되는 자리,\n오늘부터 내 자리', 'A place where work flows,\nyours from today'], lead: ['역에서 3분, 24시간 열려 있는 공유 오피스입니다.', 'Three minutes from the station and open around the clock.'],
    features: [['🪑', ['자유석', 'Hot desks'], ['원하는 자리에', 'Sit anywhere']], ['🚪', ['회의실', 'Meeting rooms'], ['시간 단위 예약', 'Book by the hour']], ['☕', ['라운지', 'Lounge'], ['커피와 간식 무료', 'Free coffee and snacks']]],
    items: [['하루 이용', 'Day pass'], ['자유석 월 이용', 'Monthly desk'], ['전용 사무실', 'Private office']], phone: '02-2020-3030',
  },
  {
    id: 'roastery', group: 'food', icon: 'smpCoffee', design: 'coffee', art: 'cafe', offer: 'menu',
    name: ['오늘의 원두', 'Daily Roast'], tip: ['스페셜티 커피 로스터리', 'A specialty coffee roastery'],
    hero: ['매주 볶은\n신선한 원두', 'Fresh beans\nroasted every week'], lead: ['산지에서 직접 고른 원두로 한 잔씩 내립니다.', 'Beans we pick from the farms, brewed one cup at a time.'],
    features: [['🫘', ['직접 로스팅', 'Roasted here'], ['매주 화요일', 'Every Tuesday']], ['☕', ['핸드 드립', 'Pour-over'], ['한 잔씩 정성껏', 'One cup at a time']], ['📦', ['원두 구독', 'Bean subscription'], ['2주마다 배송', 'Delivered every two weeks']]],
    items: [['에티오피아 드립', 'Ethiopia pour-over', '6,500'], ['카페 라테', 'Caffe latte', '5,500'], ['원두 200g', 'Beans 200 g', '18,000'], ['오늘의 디저트', "Today's dessert", '4,800']], phone: '02-765-4321',
  },
  {
    id: 'vegan', group: 'food', icon: 'smpVegan', design: 'fresh', art: 'food', offer: 'menu',
    name: ['그린 보울', 'Green Bowl'], tip: ['비건 샐러드 식당', 'A plant-based salad bar'],
    hero: ['채소로 채우는\n든든한 한 끼', 'A hearty meal\nmade of plants'], lead: ['고기 없이도 배부르고 맛있는 한 그릇을 만듭니다.', 'Filling, tasty bowls without any meat.'],
    features: [['🥗', ['매일 새 채소', 'Fresh every day'], ['아침에 들어온 재료', 'Delivered each morning']], ['🌱', ['100% 식물성', '100% plants'], ['우유·달걀도 없이', 'No milk, no eggs']], ['♻️', ['다회용 용기', 'Reusable bowls'], ['포장 쓰레기 줄이기', 'Less packaging waste']]],
    items: [['두부 포케', 'Tofu poke', '11,000'], ['병아리콩 커리', 'Chickpea curry', '12,000'], ['그린 스무디', 'Green smoothie', '6,000']], phone: '02-321-0909',
  },
  {
    id: 'brewery', group: 'food', icon: 'smpBeer', design: 'wood', art: 'food', offer: 'menu',
    name: ['한강 브루어리', 'Riverside Brewery'], tip: ['수제 맥주 양조장', 'A craft beer brewery'],
    hero: ['직접 빚은 맥주와\n긴 저녁', 'Beer we brew\nand long evenings'], lead: ['양조장에서 바로 따르는 신선한 생맥주.', 'Fresh draught poured straight from our tanks.'],
    features: [['🍺', ['신선한 생맥주', 'Fresh draught'], ['매주 새 맥주', 'A new beer every week']], ['🏭', ['양조장 견학', 'Brewery tours'], ['토요일 오후', 'Saturday afternoons']], ['🎵', ['라이브 음악', 'Live music'], ['금요일 밤', 'Friday nights']]],
    items: [['페일 에일', 'Pale ale', '8,000'], ['흑맥주', 'Stout', '8,500'], ['맛보기 4잔', 'Tasting flight', '15,000']], phone: '02-444-8282',
  },
  {
    id: 'dessert', group: 'food', icon: 'smpDessert', design: 'candy', art: 'cafe', offer: 'shop',
    name: ['달콤 상자', 'Sweet Box'], tip: ['디저트 가게와 온라인 주문', 'A dessert shop with online orders'],
    hero: ['기념일을\n더 달콤하게', 'Make the day\na little sweeter'], lead: ['케이크, 마카롱, 쿠키를 주문하면 다음 날 받아 볼 수 있습니다.', 'Order cakes, macarons and cookies today, get them tomorrow.'],
    features: [['🎂', ['주문 케이크', 'Custom cakes'], ['원하는 글씨를 넣어', 'With your own message']], ['🍪', ['선물 상자', 'Gift boxes'], ['예쁜 포장', 'Beautifully wrapped']], ['🚚', ['다음 날 배송', 'Next-day delivery'], ['오후 3시 주문까지', 'Order by 3 pm']]],
    items: [['마카롱 6개', 'Six macarons', '15,000'], ['생일 케이크', 'Birthday cake', '38,000'], ['쿠키 선물 상자', 'Cookie gift box', '22,000']], phone: '02-987-1212',
  },
  {
    id: 'mealkit', group: 'food', icon: 'smpMealkit', design: 'lemon', art: 'food', offer: 'shop',
    name: ['오늘 저녁', 'Dinner Tonight'], tip: ['밀키트 정기 배송', 'A meal kit delivery service'],
    hero: ['장보기 없이\n20분 만에 저녁', 'Dinner in 20 minutes,\nno shopping'], lead: ['손질한 재료와 쉬운 조리법을 문 앞까지 보내 드립니다.', 'Prepared ingredients and easy recipes, sent to your door.'],
    features: [['🥕', ['손질된 재료', 'Ready to cook'], ['씻고 썰어서', 'Washed and cut']], ['📖', ['쉬운 조리법', 'Easy recipes'], ['사진으로 따라 하기', 'Follow the photos']], ['🗓️', ['원하는 요일에', 'Your delivery day'], ['언제든 쉬어 가기', 'Skip any week']]],
    items: [['2인 3끼', '3 meals for 2', '39,000'], ['4인 3끼', '3 meals for 4', '69,000'], ['한 끼 맛보기', 'Try one meal', '14,000']], phone: '1588-2020',
  },
  {
    id: 'designer', group: 'people', icon: 'smpUx', design: 'minimal', art: 'abstract', offer: 'gallery',
    name: ['김하늘 디자인', 'Mia Kim Design'], tip: ['UX 디자이너 포트폴리오', "A UX designer's portfolio"],
    hero: ['쓰기 쉬운 화면을\n설계합니다', 'I design screens\nthat are easy to use'], lead: ['앱과 웹 서비스의 사용자 경험을 연구하고 디자인합니다.', 'I research and design the experience of apps and web services.'],
    features: [['🔍', ['사용자 조사', 'User research'], ['인터뷰와 관찰', 'Interviews and observation']], ['🧭', ['화면 설계', 'Wireframes'], ['흐름부터 차근차근', 'Flows first']], ['🎨', ['디자인 시스템', 'Design systems'], ['색·글꼴·버튼 규칙', 'Colours, type and buttons']]],
    items: [['은행 앱', 'Banking app'], ['예약 서비스', 'Booking service'], ['학습 앱', 'Learning app']], phone: '',
  },
  {
    id: 'musician', group: 'people', icon: 'smpMusic', design: 'aurora', art: 'waves', offer: 'events',
    name: ['밴드 새벽', 'The Daybreak'], tip: ['인디 밴드 공식 사이트', 'An indie band'],
    hero: ['새벽을 닮은\n노래를 부릅니다', 'Songs that sound\nlike daybreak'], lead: ['새 앨범 발매 기념 전국 공연을 시작합니다.', 'Our tour for the new album starts this month.'],
    features: [['🎤', ['공연', 'Live shows'], ['전국 다섯 도시', 'Five cities']], ['💿', ['새 앨범', 'New album'], ['열 곡 수록', 'Ten songs']], ['🎧', ['음원', 'Streaming'], ['모든 음원 사이트에서', 'On every music service']]],
    items: [['서울 공연', 'London', '11.21'], ['부산 공연', 'Manchester', '11.28'], ['대구 공연', 'Glasgow', '12.05']], phone: '',
  },
  {
    id: 'coach', group: 'people', icon: 'smpCoach', design: 'sunset', art: 'mountain', offer: 'pricing',
    name: ['이준호 코칭', 'Liam Choi Coaching'], tip: ['커리어·라이프 코치', 'A career and life coach'],
    hero: ['다음 걸음을\n함께 정합니다', "Let's choose\nyour next step together"], lead: ['이직, 창업, 새 출발을 준비하는 분과 함께 길을 찾습니다.', 'For people getting ready for a new job, a business or a fresh start.'],
    features: [['🎯', ['목표 정하기', 'Clear goals'], ['나에게 맞는 방향', 'The right direction for you']], ['🗣️', ['1:1 대화', 'One-to-one'], ['매주 한 시간', 'An hour every week']], ['📈', ['실행 계획', 'Action plan'], ['작게, 꾸준히', 'Small steps, every week']]],
    items: [['첫 상담', 'First session'], ['4주 과정', '4-week plan'], ['3개월 과정', '3-month plan']], phone: '010-3030-4040',
  },
  {
    id: 'writer', group: 'people', icon: 'smpWriter', design: 'paper', art: 'book', offer: 'services',
    name: ['박서연의 서재', "Olivia's Bookshelf"], tip: ['작가 개인 사이트', "An author's homepage"],
    hero: ['작은 이야기가\n큰 위로가 되기를', 'Small stories,\nbig comfort'], lead: ['에세이와 동화를 쓰고, 글쓰기 수업을 엽니다.', 'I write essays and stories for children, and teach writing.'],
    features: [['📚', ['책', 'Books'], ['에세이 세 권', 'Three essay books']], ['✍️', ['글쓰기 수업', 'Writing classes'], ['한 달 과정', 'A one-month course']], ['📰', ['연재', 'Columns'], ['매주 신문 칼럼', 'A weekly newspaper column']]],
    items: [['새 책 소개', 'The new book'], ['강연 요청', 'Talks'], ['글쓰기 수업', 'Writing class']], phone: '',
  },
  {
    id: 'creator', group: 'people', icon: 'smpCreator', design: 'berry', art: 'travel', offer: 'services',
    name: ['여행하는 지우', 'Travels with Jamie'], tip: ['여행 크리에이터', 'A travel creator'],
    hero: ['가볍게 떠나는\n특별한 여행', 'Light bags,\nspecial trips'], lead: ['유튜브와 블로그로 숨은 여행지를 소개합니다.', 'Hidden places to visit, shared on YouTube and my blog.'],
    features: [['🎥', ['여행 영상', 'Travel videos'], ['매주 새 영상', 'A new video every week']], ['🗺️', ['여행 지도', 'Trip maps'], ['코스 그대로 따라가기', 'Follow the same route']], ['🤝', ['협업', 'Partnerships'], ['숙소·브랜드 소개', 'Hotels and brands']]],
    items: [['제주 3일', 'Three days by the sea'], ['교토 산책', 'A walk in Kyoto'], ['캠핑 여행', 'Camping trips']], phone: '',
  },
  {
    id: 'conference', group: 'community', icon: 'smpConference', design: 'deepsea', art: 'tech', offer: 'events',
    name: ['웹 내일 2026', 'WebNext 2026'], tip: ['개발자 컨퍼런스', 'A developer conference'],
    hero: ['웹의 내일을\n함께 만듭니다', "Let's build\nthe web of tomorrow"], lead: ['11월 20일 하루, 연사 30명과 함께하는 개발자 축제.', 'One day on November 20 with thirty speakers.'],
    features: [['🎙️', ['발표 30개', '30 talks'], ['프런트엔드부터 AI까지', 'From front end to AI']], ['🛠️', ['실습', 'Workshops'], ['직접 만들어 보기', 'Build it yourself']], ['🤝', ['네트워킹', 'Networking'], ['저녁 모임', 'An evening meetup']]],
    items: [['개막 발표', 'Opening keynote', '10:00'], ['실습 세션', 'Workshops', '13:00'], ['저녁 모임', 'Evening meetup', '18:30']], phone: '',
  },
  {
    id: 'yoga', group: 'community', icon: 'smpYoga', design: 'rose', art: 'nature', offer: 'pricing',
    name: ['숨 요가', 'Breathe Yoga'], tip: ['요가·명상 스튜디오', 'A yoga and meditation studio'],
    hero: ['천천히 숨 쉬고\n나에게 돌아오기', 'Breathe slowly,\ncome back to yourself'], lead: ['처음 오시는 분도 편하게 따라 할 수 있는 작은 수업.', 'Small classes anyone can follow, even on day one.'],
    features: [['🧘', ['초보 수업', 'Beginners'], ['기초부터 천천히', 'Slowly from the basics']], ['🌙', ['저녁 명상', 'Evening meditation'], ['하루를 정리하는 시간', 'Unwind after work']], ['🌿', ['작은 수업', 'Small classes'], ['한 반 8명까지', 'Up to eight people']]],
    items: [['한 번 수업', 'Drop-in class'], ['주 2회 한 달', 'Twice a week'], ['무제한 한 달', 'Unlimited month']], phone: '02-345-9876',
  },
  {
    id: 'bookclub', group: 'community', icon: 'smpBookclub', design: 'earth', art: 'book', offer: 'events',
    name: ['한 권의 밤', 'One Book Night'], tip: ['동네 독서 모임', 'A neighbourhood book club'],
    hero: ['한 달에 한 권,\n같이 읽어요', 'One book a month,\nread together'], lead: ['매달 마지막 금요일 저녁, 동네 책방에서 만납니다.', 'We meet at the local bookshop on the last Friday evening of each month.'],
    features: [['📖', ['함께 읽기', 'Read together'], ['한 달에 한 권', 'One book a month']], ['☕', ['책방 모임', 'Bookshop evenings'], ['차와 함께', 'With tea']], ['✍️', ['짧은 글', 'Short notes'], ['읽고 한 줄 남기기', 'Write a line about it']]],
    items: [['11월 모임', 'November meeting', '11.28'], ['12월 모임', 'December meeting', '12.26'], ['신년 모임', 'New year meeting', '01.30']], phone: '',
  },
  {
    id: 'volunteer', group: 'community', icon: 'smpVolunteer', design: 'teal', art: 'nature', offer: 'events',
    name: ['같이 걷는 손', 'Helping Hands'], tip: ['봉사 단체', 'A volunteer group'],
    hero: ['작은 손길이 모여\n동네가 바뀝니다', 'Small hands together\nchange a town'], lead: ['한 달에 두 번, 이웃을 돕는 봉사에 함께해 주세요.', 'Join us twice a month to help our neighbours.'],
    features: [['🤲', ['이웃 돕기', 'Helping neighbours'], ['도시락과 말벗', 'Meals and company']], ['🌳', ['환경 정화', 'Clean-ups'], ['공원과 하천', 'Parks and rivers']], ['🎁', ['나눔 장터', 'Charity market'], ['수익은 모두 기부', 'All proceeds donated']]],
    items: [['도시락 나눔', 'Meal delivery', '11.15'], ['하천 정화', 'River clean-up', '11.22'], ['나눔 장터', 'Charity market', '12.13']], phone: '02-1004-1004',
  },
  {
    id: 'academy', group: 'community', icon: 'smpAcademy', design: 'royal', art: 'book', offer: 'pricing',
    name: ['말하는 영어 학원', 'Speak Up English'], tip: ['영어 회화 학원', 'An English speaking school'],
    hero: ['듣고, 따라 하고,\n말하는 영어', 'Listen, repeat\nand speak'], lead: ['원어민 선생님과 작은 반에서 매일 말하는 연습을 합니다.', 'Small classes with native teachers and speaking practice every day.'],
    features: [['🗣️', ['말하기 중심', 'Speaking first'], ['수업의 70%가 대화', '70% of class is talking']], ['👥', ['작은 반', 'Small classes'], ['한 반 6명', 'Six students a class']], ['📱', ['앱 복습', 'App practice'], ['수업 후 10분 복습', 'Ten minutes after class']]],
    items: [['기초반', 'Basic'], ['회화반', 'Conversation'], ['비즈니스반', 'Business']], phone: '02-555-6677',
  },
  {
    id: 'support', group: 'business', icon: 'smpSupport', design: 'nordic', art: 'tech', offer: 'board',
    name: ['헬프데스크 플러스', 'HelpDesk Plus'], tip: ['고객 지원 포럼', 'A customer support forum'],
    hero: ['궁금한 점은\n포럼에 물어보세요', 'Ask the forum,\nget an answer'], lead: ['사용자와 담당자가 함께 답을 찾는 고객 지원 게시판입니다.', 'A support board where users and our team find answers together.'],
    features: [['💬', ['빠른 답변', 'Quick answers'], ['평일 하루 안에', 'Within a working day']], ['🐞', ['오류 신고', 'Bug reports'], ['바로 확인합니다', 'We look at once']], ['💡', ['제안', 'Ideas'], ['다음 버전에 반영', 'Shaping the next version']]],
    items: [['질문', 'Questions'], ['오류 신고', 'Bug reports'], ['제안', 'Ideas']], phone: '1588-2400',
  },
  {
    id: 'market', group: 'food', icon: 'smpMarket', design: 'sakura', art: 'food', offer: 'board',
    name: ['우리 동네 장터', 'Village Market'], tip: ['동네 농산물 장터', 'A farmers market'],
    hero: ['토요일 아침,\n동네 장터에서 만나요', 'Saturday morning\nat the village market'], lead: ['농부들이 직접 기른 채소와 과일을 팝니다.', 'Farmers sell the vegetables and fruit they grow.'],
    features: [['🥕', ['제철 채소', 'Seasonal vegetables'], ['오늘 아침 수확', 'Picked this morning']], ['🍎', ['과일', 'Fruit'], ['맛보고 사세요', 'Taste before you buy']], ['🧺', ['장바구니', 'Bring a bag'], ['비닐 없는 장터', 'A plastic-free market']]],
    items: [['채소', 'Vegetables'], ['과일', 'Fruit'], ['잼과 꿀', 'Jam and honey']], phone: '031-600-7070',
  },
  {
    id: 'fanclub', group: 'people', icon: 'smpFan', design: 'cyberpunk', art: 'waves', offer: 'board',
    name: ['별빛 팬클럽', 'Starlight Fan Club'], tip: ['밴드 팬 카페', 'A band fan club'],
    hero: ['우리가 함께하면\n무대는 더 빛나요', 'Together we make\nthe stage shine'], lead: ['공연 소식, 응원 글, 사진을 나누는 팬들의 공간입니다.', 'A place for fans to share show news, messages and photos.'],
    features: [['🎤', ['공연 소식', 'Show news'], ['예매 일정 안내', 'Ticket dates']], ['💌', ['응원 글', 'Messages'], ['밴드에게 전해요', 'Sent to the band']], ['📷', ['사진', 'Photos'], ['함께 보는 추억', 'Shared memories']]],
    items: [['연말 공연', 'Year-end show', '12.24'], ['팬 모임', 'Fan meetup', '12.24'], ['새해 공연', 'New year show', '01.10']], phone: '',
  },
  {
    id: 'apartment', group: 'community', icon: 'smpApartment', design: 'navy', art: 'city', offer: 'board',
    name: ['푸른숲 아파트', 'Greenwood Apartments'], tip: ['아파트 입주민 모임', 'A residents community'],
    hero: ['이웃과 함께\n더 살기 좋은 우리 단지', 'A better home\nwith our neighbours'], lead: ['관리 사무소 공지와 이웃 소식을 한곳에서 봅니다.', 'Notices from the office and news from neighbours in one place.'],
    features: [['📢', ['공지', 'Notices'], ['점검과 행사 안내', 'Works and events']], ['🤝', ['나눔', 'Sharing'], ['필요한 이웃에게', 'For neighbours in need']], ['🌳', ['쾌적한 단지', 'A pleasant place'], ['함께 가꿔요', 'We look after it together']]],
    items: [['관리 사무소', 'Office'], ['커뮤니티 센터', 'Community centre'], ['놀이터', 'Playground']], phone: '031-900-1200',
  },
];

const pick = (pair, L) => (Array.isArray(pair) ? pair[L === 'en' ? 1 : 0] : pair);

/** The sample list for the start page: { id, group, icon, ko: [name, tip], en: [...] }. */
const ORDER = ['business', 'food', 'people', 'community'];
S.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
export const SAMPLES = S.map((s) => ({ id: s.id, group: s.group, icon: s.icon, design: s.design, board: Boolean(SAMPLE_BOARDS[s.id]), ko: [s.name[0], s.tip[0]], en: [s.name[1], s.tip[1]] }));
export const SAMPLE_IDS = SAMPLES.map((s) => s.id);

/** A board block from a sample's board (sample-boards.js). */
function boardBlock(k, board, L, extra = {}) {
  return k.b('board', {
    title: pick(board.title, L), subtitle: pick(board.text, L),
    categories: board.cats.map((c) => pick(c, L)).join(', '),
    items: board.posts.map(([title, cat, author, date, views, notice, body]) => ({ title: pick(title, L), category: pick(board.cats[cat], L), author: pick(author, L), date, views, notice, body: pick(body, L) })),
    ...extra,
  });
}

/**
 * Home page arrangements: each sample has one, so the samples differ in their structure, not only in
 * words and colours. Five samples each:
 *   classic   hero · features · story · reviews or schedule · call to action
 *   split     side hero · numbers · features · reviews · newsletter        (+ an "Our story" page)
 *   story     hero · quote · story · timeline · schedule or news · call    (+ a News page)
 *   showcase  side hero · gallery · logos · reviews · call
 *   numbers   hero · numbers · steps · features · FAQ · call               (+ an FAQ page)
 *   people    side hero · features · team · reviews or schedule · newsletter (+ an "Our story" page)
 *   notice    notice bar · hero · columns · checklist · call               (+ a News page)
 *   shop      side hero · products · photos · reviews · newsletter         (+ an FAQ page)
 */
export const RECIPES = {
  classic: ['law', 'bakery', 'fanclub', 'yoga', 'accounting'],
  split: ['startup', 'aistudio', 'developer', 'gym', 'mealkit'],
  story: ['farm', 'wedding', 'writer', 'church', 'bookclub'],
  showcase: ['interior', 'agency', 'photographer', 'illustrator', 'designer'],
  numbers: ['realestate', 'clinic', 'coach', 'school', 'academy'],
  people: ['brewery', 'musician', 'conference', 'volunteer', 'club'],
  notice: ['coworking', 'market', 'apartment', 'creator', 'support'],
  shop: ['flower', 'dessert', 'vegan', 'roastery', 'bistro'],
};
export const recipeOf = (id) => Object.entries(RECIPES).find(([, ids]) => ids.includes(id))?.[0] ?? 'classic';

/** The name and file of each kind of second page. */
const OFFER_PAGES = { services: ['서비스', 'Services', 'work'], pricing: ['요금 안내', 'Pricing', 'work'], gallery: ['작업', 'Work', 'work'], menu: ['메뉴', 'Menu', 'menu'], shop: ['상품', 'Shop', 'work'], events: ['안내', 'Details', 'work'] };

function compose(s, L) {
  const tx = (ko, en) => (L === 'en' ? en : ko);
  const name = pick(s.name, L);
  const board = SAMPLE_BOARDS[s.id] ?? null;
  const recipe = recipeOf(s.id);
  return buildSite({ name, L, designId: s.design, description: pick(s.tip, L), header: { ctaLabel: tx('문의하기', 'Contact'), ctaUrl: 'contact.html' }, footer: { phone: s.phone || '', about: pick(s.lead, L) } }, (k) => {
    const features = s.features.map(([icon, title, text]) => ({ icon, title: pick(title, L), text: pick(text, L) }));
    const offerUrl = s.offer === 'menu' ? 'menu.html' : s.offer === 'board' ? 'board.html' : 'work.html';
    const offerLabel = s.offer === 'board' ? tx('게시판 보기', 'See the board') : s.offer === 'menu' ? tx('메뉴 보기', 'See the menu') : s.offer === 'shop' ? tx('상품 보기', 'See the shop') : tx('자세히 보기', 'Learn more');
    const hero = () => k.b('hero', { eyebrow: pick(s.tip, L), title: pick(s.hero, L), subtitle: pick(s.lead, L), button1: offerLabel, url1: offerUrl, button2: tx('문의하기', 'Contact'), url2: 'contact.html', image: k.art(s.art, 1) });
    const heroSplit = () => k.b('heroSplit', { eyebrow: pick(s.tip, L), title: pick(s.hero, L), text: pick(s.lead, L), button1: offerLabel, url1: offerUrl, image: k.art(s.group === 'people' ? (s.id === 'developer' ? 'tech' : 'portrait') : s.art, 3) });
    const featuresBlock = () => k.b('features', { title: tx(`${name}의 약속`, `Why ${name}`), subtitle: '', items: features });
    const story = () => k.b('mediaText', { title: tx('우리 이야기', 'Our story'), image: k.art(s.art, 2) });
    const schedule = () => k.b('events', { title: tx('일정 안내', 'Schedule'), items: s.items.map(([ko, en, when]) => ({ date: when ?? '', time: '', title: pick([ko, en], L), place: '' })) });
    const reviewsOrSchedule = () => (s.offer === 'events' ? schedule() : k.b('testimonials'));
    const call = () => k.b('cta', { title: tx('지금 연락해 보세요', 'Get in touch today'), url: 'contact.html' });
    const gallery = (seed, title = '') => k.b('gallery', { title, items: [s.art, 'landscape', 'city', 'nature', 'abstract', 'pattern'].map((kind, i) => ({ image: k.art(kind, seed + i), caption: pick(s.items[i % s.items.length], L) })) });
    const products = () => k.b('services', { title: tx('대표 상품', 'Favourites'), subtitle: '', items: s.items.map(([ko, en, price], i) => ({ image: k.art(i % 2 ? 'product' : s.art, 60 + i), title: pick([ko, en], L), text: price ? tx(`${price}원`, `$${Math.max(1, Math.round(Number(String(price).replace(/,/g, '')) / 1300))}`) : '', link: tx('주문하기', 'Order'), url: 'contact.html' })) });
    const homes = {
      classic: () => [hero(), featuresBlock(), story(), reviewsOrSchedule(), call()],
      split: () => [heroSplit(), k.b('stats'), featuresBlock(), k.b('testimonials'), k.b('newsletter')],
      story: () => [hero(), k.b('quote', { text: pick(s.lead, L), author: name, role: pick(s.tip, L) }), story(), k.b('timeline'), s.offer === 'events' ? schedule() : k.b('blog'), call()],
      showcase: () => [heroSplit(), gallery(70, tx('작업 모음', 'Selected work')), k.b('logos'), k.b('testimonials'), call()],
      numbers: () => [hero(), k.b('stats'), k.b('steps'), featuresBlock(), k.b('faq'), call()],
      people: () => [heroSplit(), featuresBlock(), k.b('team'), reviewsOrSchedule(), k.b('newsletter')],
      notice: () => [k.b('notice', { text: pick(s.tip, L), link: offerLabel, url: offerUrl }), hero(), k.b('columns'), k.b('checklist'), call()],
      shop: () => [heroSplit(), products(), gallery(80, tx('사진', 'Photos')), k.b('testimonials'), k.b('newsletter')],
    };
    k.page(tx('홈', 'Home'), homes[recipe]());
    const offerPage = {
      services: () => [k.b('heading', { title: tx('서비스', 'Services'), subtitle: pick(s.lead, L) }, { padTop: 72 }), k.b('services', { title: '', subtitle: '', items: s.items.map(([ko, en], i) => ({ image: k.art(s.art, 10 + i), title: pick([ko, en], L), text: tx('전문가가 처음부터 끝까지 함께합니다.', 'Experts with you from start to finish.'), link: tx('문의', 'Ask'), url: 'contact.html' })) }, { bg: '' }), k.b('steps')],
      pricing: () => [k.b('heading', { title: tx('요금 안내', 'Pricing'), subtitle: '' }, { padTop: 72 }), k.b('pricing', { title: '', subtitle: '', items: k.b('pricing').props.items.map((plan, i) => ({ ...plan, name: pick(s.items[i] ?? [plan.name, plan.name], L) })) }), k.b('faq')],
      gallery: () => [k.b('heading', { title: tx('작업', 'Work'), subtitle: pick(s.lead, L) }, { padTop: 72 }), gallery(20), k.b('logos')],
      menu: () => [k.b('heading', { title: tx('메뉴', 'Menu'), subtitle: '' }, { padTop: 72 }), k.b('menu', { title: '', items: s.items.map(([ko, en, price]) => ({ name: pick([ko, en], L), desc: '', price: price ?? '' })) }), k.b('gallery', { title: tx('사진', 'Photos'), items: ['food', 'cafe', s.art].map((kind, i) => ({ image: k.art(kind, 30 + i), caption: '' })) })],
      shop: () => [k.b('heading', { title: tx('상품', 'Shop'), subtitle: '' }, { padTop: 72 }), k.b('services', { title: '', subtitle: '', items: s.items.map(([ko, en, price], i) => ({ image: k.art(i % 2 ? 'product' : s.art, 40 + i), title: pick([ko, en], L), text: price ? tx(`${price}원`, `$${Math.max(1, Math.round(Number(String(price).replace(/,/g, '')) / 1300))}`) : '', link: tx('주문하기', 'Order'), url: 'contact.html' })) }, { bg: '' }), k.b('faq')],
      events: () => [k.b('heading', { title: tx('안내', 'Details'), subtitle: pick(s.lead, L) }, { padTop: 72 }), k.b('gallery', { title: tx('사진', 'Photos'), items: [s.art, 'nature', 'landscape'].map((kind, i) => ({ image: k.art(kind, 50 + i), caption: '' })) }), k.b('faq')],
      board: () => [boardBlock(k, board, L, { perPage: 5 })],
    }[s.offer]();
    if (s.offer === 'board') k.page(pick(board.page, L), offerPage, { slug: 'board' });
    else { const [ko, en, slug] = OFFER_PAGES[s.offer]; k.page(tx(ko, en), offerPage, { slug }); }
    // A third page that depends on the arrangement: the story with the people, news, or questions.
    const extra = {
      split: () => [tx('우리 이야기', 'Our story'), 'about', [k.b('heading', { title: tx('우리 이야기', 'Our story'), subtitle: pick(s.lead, L) }, { padTop: 72 }), story(), k.b('team')]],
      people: () => [tx('우리 이야기', 'Our story'), 'about', [k.b('heading', { title: tx('우리 이야기', 'Our story'), subtitle: pick(s.lead, L) }, { padTop: 72 }), story(), k.b('timeline')]],
      story: () => [tx('소식', 'News'), 'news', [k.b('heading', { title: tx('소식', 'News'), subtitle: '' }, { padTop: 72 }), k.b('blog', { title: '' }), k.b('newsletter')]],
      notice: () => (board ? null : [tx('소식', 'News'), 'news', [k.b('heading', { title: tx('소식', 'News'), subtitle: '' }, { padTop: 72 }), k.b('blog', { title: '' })]]),
      numbers: () => [tx('자주 묻는 질문', 'FAQ'), 'faq', [k.b('heading', { title: tx('자주 묻는 질문', 'FAQ'), subtitle: '' }, { padTop: 72 }), k.b('faq', { title: '' }), k.b('checklist')]],
      shop: () => [tx('자주 묻는 질문', 'FAQ'), 'faq', [k.b('heading', { title: tx('자주 묻는 질문', 'FAQ'), subtitle: '' }, { padTop: 72 }), k.b('faq', { title: '' }), k.b('map', {})]],
    }[recipe]?.();
    if (extra) k.page(extra[0], extra[2], { slug: extra[1] });
    // A board of its own (community samples, the clinic, the coworking space): a page before Contact.
    if (board && s.offer !== 'board') k.page(pick(board.page, L), [boardBlock(k, board, L)], { slug: 'board' });
    const map = s.group === 'people' || recipe === 'shop' ? '' : tx('서울시청', 'City Hall');
    k.page(tx('문의', 'Contact'), [k.b('contact', { phone: s.phone || '', map }), recipe === 'notice' || recipe === 'numbers' ? k.b('faq') : k.b('social')], { slug: 'contact' });
  });
}

/** A sample site (a new project to look at and change). */
export function buildSample(id, L = 'ko') {
  const spec = S.find((s) => s.id === id) ?? S[0];
  return compose(spec, L === 'en' ? 'en' : 'ko');
}
