// Sample sites (the start page's Samples card, File › Open sample): sixteen finished websites
// in four groups, each in Korean and English, to look at, take apart and start from. Every
// sample is a short description (spec) turned into pages by compose().
import { buildSite } from './templates.js';

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
];

const pick = (pair, L) => (Array.isArray(pair) ? pair[L === 'en' ? 1 : 0] : pair);

/** The sample list for the start page: { id, group, icon, ko: [name, tip], en: [...] }. */
export const SAMPLES = S.map((s) => ({ id: s.id, group: s.group, icon: s.icon, design: s.design, ko: [s.name[0], s.tip[0]], en: [s.name[1], s.tip[1]] }));
export const SAMPLE_IDS = SAMPLES.map((s) => s.id);

function compose(s, L) {
  const tx = (ko, en) => (L === 'en' ? en : ko);
  const name = pick(s.name, L);
  return buildSite({ name, L, designId: s.design, description: pick(s.tip, L), header: { ctaLabel: tx('문의하기', 'Contact'), ctaUrl: 'contact.html' }, footer: { phone: s.phone || '', about: pick(s.lead, L) } }, (k) => {
    const features = s.features.map(([icon, title, text]) => ({ icon, title: pick(title, L), text: pick(text, L) }));
    const heroImage = k.art(s.art, 1);
    const home = [
      s.group === 'people' && s.id !== 'wedding'
        ? k.b('heroSplit', { eyebrow: pick(s.tip, L), title: pick(s.hero, L), text: pick(s.lead, L), button1: tx('작품 보기', 'See my work'), url1: 'work.html', image: k.art(s.id === 'developer' ? 'tech' : 'portrait', 3) })
        : k.b('hero', { eyebrow: pick(s.tip, L), title: pick(s.hero, L), subtitle: pick(s.lead, L), button1: tx('자세히 보기', 'Learn more'), url1: s.offer === 'menu' ? 'menu.html' : 'work.html', button2: tx('문의하기', 'Contact'), url2: 'contact.html', image: heroImage }),
      k.b('features', { title: tx(`${name}의 약속`, `Why ${name}`), subtitle: '', items: features }),
      k.b('mediaText', { title: tx('우리 이야기', 'Our story'), image: k.art(s.art, 2) }),
      s.offer === 'events' ? k.b('events', { title: tx('일정 안내', 'Schedule'), items: s.items.map(([ko, en, when]) => ({ date: when ?? '', time: '', title: pick([ko, en], L), place: '' })) }) : k.b('testimonials'),
      k.b('cta', { title: tx('지금 연락해 보세요', 'Get in touch today'), url: 'contact.html' }),
    ];
    k.page(tx('홈', 'Home'), home);
    const offerPage = {
      services: () => [k.b('heading', { title: tx('서비스', 'Services'), subtitle: pick(s.lead, L) }, { padTop: 72 }), k.b('services', { title: '', subtitle: '', items: s.items.map(([ko, en], i) => ({ image: k.art(s.art, 10 + i), title: pick([ko, en], L), text: tx('전문가가 처음부터 끝까지 함께합니다.', 'Experts with you from start to finish.'), link: tx('문의', 'Ask'), url: 'contact.html' })) }, { bg: '' }), k.b('steps')],
      pricing: () => [k.b('heading', { title: tx('요금 안내', 'Pricing'), subtitle: '' }, { padTop: 72 }), k.b('pricing', { title: '', subtitle: '', items: k.b('pricing').props.items.map((plan, i) => ({ ...plan, name: pick(s.items[i] ?? [plan.name, plan.name], L) })) }), k.b('faq')],
      gallery: () => [k.b('heading', { title: tx('작업', 'Work'), subtitle: pick(s.lead, L) }, { padTop: 72 }), k.b('gallery', { title: '', items: [s.art, 'landscape', 'city', 'nature', 'abstract', 'pattern'].map((kind, i) => ({ image: k.art(kind, 20 + i), caption: pick(s.items[i % s.items.length], L) })) }), k.b('logos')],
      menu: () => [k.b('heading', { title: tx('메뉴', 'Menu'), subtitle: '' }, { padTop: 72 }), k.b('menu', { title: '', items: s.items.map(([ko, en, price]) => ({ name: pick([ko, en], L), desc: '', price: price ?? '' })) }), k.b('gallery', { title: tx('사진', 'Photos'), items: ['food', 'cafe', s.art].map((kind, i) => ({ image: k.art(kind, 30 + i), caption: '' })) })],
      shop: () => [k.b('heading', { title: tx('상품', 'Shop'), subtitle: '' }, { padTop: 72 }), k.b('services', { title: '', subtitle: '', items: s.items.map(([ko, en, price], i) => ({ image: k.art(i % 2 ? 'product' : s.art, 40 + i), title: pick([ko, en], L), text: price ? tx(`${price}원`, `$${Math.max(1, Math.round(Number(String(price).replace(/,/g, '')) / 1300))}`) : '', link: tx('주문하기', 'Order'), url: 'contact.html' })) }, { bg: '' }), k.b('faq')],
      events: () => [k.b('heading', { title: tx('안내', 'Details'), subtitle: pick(s.lead, L) }, { padTop: 72 }), k.b('gallery', { title: tx('사진', 'Photos'), items: [s.art, 'nature', 'landscape'].map((kind, i) => ({ image: k.art(kind, 50 + i), caption: '' })) }), k.b('faq')],
    }[s.offer]();
    k.page(s.offer === 'menu' ? tx('메뉴', 'Menu') : tx('소개', 'Work'), offerPage, { slug: s.offer === 'menu' ? 'menu' : 'work' });
    k.page(tx('문의', 'Contact'), [k.b('contact', { phone: s.phone || '', map: s.group === 'people' ? '' : tx('서울시청', 'City Hall') }), k.b('social')], { slug: 'contact' });
  });
}

/** A sample site (a new project to look at and change). */
export function buildSample(id, L = 'ko') {
  const spec = S.find((s) => s.id === id) ?? S[0];
  return compose(spec, L === 'en' ? 'en' : 'ko');
}
