// Templates: what a new site starts from (File › New from template, the start page). Each is a
// design and a set of pages made of blocks in their starting content, in Korean or English.
import { createBlock, createSite, newId, uniqueSlug } from './site.js';
import { art } from './art.js';
import { effectiveDesign } from './designs.js';

const tx = (L, ko, en) => (L === 'en' ? en : ko);

/** Helpers for building sites from blocks (also used by the samples). */
export function kit(site, L) {
  const design = site.design;
  const c = effectiveDesign(design);
  return {
    L, c,
    tx: (ko, en) => tx(L, ko, en),
    art: (kind, seed) => art(kind, c.primary, c.accent, seed),
    b: (type, props = {}, style = {}) => createBlock(type, { L, design, props, style }),
    page(name, blocks, extra = {}) {
      const page = { id: newId('p'), name, slug: '', title: '', description: '', nav: true, blocks, ...extra };
      page.slug = site.pages.length ? uniqueSlug(site, extra.slug ?? name) : 'index';
      site.pages.push(page);
      return page;
    },
  };
}

/** A new site with the given pages (built by `pages(k)`), its header and footer filled in. */
export function buildSite({ name, L, designId, header = {}, footer = {}, description = '' }, pages) {
  const site = createSite({ name, L, designId });
  site.pages = [];
  site.meta.description = description;
  const k = kit(site, L);
  pages(k);
  Object.assign(site.layout.header.props, { brand: name, ...header });
  Object.assign(site.layout.footer.props, footer);
  return site;
}

/** [id, design, icon, Korean name, English name]: the templates offered. */
export const TEMPLATES = [
  ['blank', 'ocean', 'tplBlank'],
  ['business', 'corporate', 'tplBusiness'],
  ['landing', 'midnight', 'tplLanding'],
  ['portfolio', 'minimal', 'tplPortfolio'],
  ['restaurant', 'wood', 'tplRestaurant'],
  ['cafe', 'coffee', 'tplCafe'],
  ['shop', 'candy', 'tplShop'],
  ['blog', 'paper', 'tplBlog'],
  ['event', 'galaxy', 'tplEvent'],
  ['resume', 'slate', 'tplResume'],
  ['academy', 'fresh', 'tplAcademy'],
  ['clinic', 'mint', 'tplClinic'],
];
export const TEMPLATE_IDS = TEMPLATES.map(([id]) => id);

const BUILDERS = {
  blank: (L) => buildSite({ name: tx(L, '나의 홈페이지', 'My Website'), L, designId: 'ocean' }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('hero', { eyebrow: '', title: tx(L, '여기에 제목을 쓰세요', 'Write your title here'), subtitle: tx(L, '왼쪽 블록 상자에서 블록을 끌어다 놓아 페이지를 만드세요.', 'Drag blocks from the Blocks panel on the left to build the page.'), button2: '' })]);
  }),
  business: (L) => buildSite({ name: tx(L, '한빛 컨설팅', 'Brightway Consulting'), L, designId: 'corporate', description: tx(L, '성장을 돕는 경영 컨설팅', 'Management consulting for growth') }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('heroSplit', { image: k.art('office', 2) }), k.b('logos'), k.b('features'), k.b('stats'), k.b('testimonials'), k.b('cta')]);
    k.page(tx(L, '회사 소개', 'About'), [k.b('heading', { title: tx(L, '회사 소개', 'About us'), subtitle: tx(L, '고객과 함께 성장해 온 이야기', 'Growing together with our clients') }, { padTop: 72 }), k.b('mediaText'), k.b('timeline'), k.b('team')]);
    k.page(tx(L, '서비스', 'Services'), [k.b('heading', { title: tx(L, '서비스', 'Services'), subtitle: '' }, { padTop: 72 }), k.b('services', { title: '', subtitle: '' }, { bg: '' }), k.b('steps'), k.b('pricing')]);
    k.page(tx(L, '문의', 'Contact'), [k.b('contact', { map: tx(L, '서울시청', 'City Hall') }), k.b('faq')]);
  }),
  landing: (L) => buildSite({ name: tx(L, '포커스', 'Focus'), L, designId: 'midnight', header: { ctaLabel: tx(L, '무료 체험', 'Free trial') } }, (k) => {
    k.page(tx(L, '홈', 'Home'), [
      k.b('notice'),
      k.b('hero', { eyebrow: tx(L, '집중력 향상 앱', 'Focus app'), title: tx(L, '하루 25분,\n몰입이 달라집니다', '25 minutes a day\nchanges your focus'), button1: tx(L, '무료로 시작', 'Start free'), button2: tx(L, '소개 영상', 'Watch video'), image: k.art('tech', 4) }),
      k.b('features', { columns: 3 }), k.b('mediaText', { image: k.art('product', 8) }), k.b('stats'), k.b('pricing'), k.b('faq'), k.b('newsletter'),
    ]);
  }),
  portfolio: (L) => buildSite({ name: tx(L, '김지우 포트폴리오', 'Jamie Park — Portfolio'), L, designId: 'minimal', header: { ctaLabel: tx(L, '연락하기', 'Say hello') } }, (k) => {
    k.page(tx(L, '작업', 'Work'), [k.b('heading', { title: tx(L, '안녕하세요,\n그래픽 디자이너 김지우입니다', "Hi, I'm Jamie,\na graphic designer"), subtitle: tx(L, '브랜드와 사람을 잇는 디자인을 합니다.', 'I design what connects brands and people.'), level: 'h1' }, { padTop: 96, align: 'left' }), k.b('gallery', { title: '', columns: 3 }), k.b('logos', { title: tx(L, '함께한 브랜드', 'Brands I worked with') })]);
    k.page(tx(L, '소개', 'About'), [k.b('mediaText', { title: tx(L, '저에 대해', 'About me'), image: k.art('portrait', 3), button: tx(L, '이력서 받기', 'Download CV') }), k.b('timeline', { title: tx(L, '경력', 'Experience') })]);
    k.page(tx(L, '연락', 'Contact'), [k.b('contact', { title: tx(L, '함께 일해요', "Let's work together"), address: '', hours: '' }), k.b('social')]);
  }),
  restaurant: (L) => buildSite({ name: tx(L, '정원 식당', 'Garden Table'), L, designId: 'wood', header: { ctaLabel: tx(L, '예약하기', 'Book a table') } }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('hero', { eyebrow: tx(L, '제철 재료로 만드는 한 끼', 'Seasonal cooking'), title: tx(L, '정성으로 차린\n오늘의 식탁', "Today's table,\nmade with care"), button1: tx(L, '메뉴 보기', 'See the menu'), button2: tx(L, '예약하기', 'Book a table'), image: k.art('food', 5) }), k.b('features', { title: tx(L, '정원 식당의 약속', 'Our promise') }), k.b('gallery', { title: tx(L, '오늘의 요리', "Today's dishes"), items: ['food', 'cafe', 'nature'].map((kind, i) => ({ image: k.art(kind, 70 + i), caption: '' })) }), k.b('testimonials')]);
    k.page(tx(L, '메뉴', 'Menu'), [k.b('menu', { title: tx(L, '대표 메뉴', 'Signature dishes'), items: [[tx(L, '들기름 막국수', 'Buckwheat noodles'), tx(L, '고소한 들기름과 김', 'Perilla oil and laver'), '11,000'], [tx(L, '수육 정식', 'Braised pork set'), tx(L, '부드러운 수육과 반찬', 'Tender pork with sides'), '16,000'], [tx(L, '계절 솥밥', 'Seasonal pot rice'), tx(L, '매달 바뀌는 재료', 'Changes every month'), '14,000']].map(([name, desc, price]) => ({ name, desc, price })) }), k.b('menu', { title: tx(L, '음료', 'Drinks') }, { bg: 'surface' })]);
    k.page(tx(L, '오시는 길', 'Visit'), [k.b('contact', { title: tx(L, '예약·오시는 길', 'Booking & directions'), map: tx(L, '서울 종로구', 'Main Street') })]);
  }),
  cafe: (L) => buildSite({ name: tx(L, '모닝 브루', 'Morning Brew'), L, designId: 'coffee' }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('heroSplit', { eyebrow: tx(L, '동네 작은 카페', 'Your corner café'), title: tx(L, '오늘도 향긋한\n하루를 시작하세요', 'Start your day\nwith a good cup'), image: k.art('cafe', 2), button1: tx(L, '메뉴 보기', 'See the menu'), url1: 'menu.html' }), k.b('menu'), k.b('gallery', { title: tx(L, '카페 풍경', 'Our place'), items: ['cafe', 'book', 'nature'].map((kind, i) => ({ image: k.art(kind, 80 + i), caption: '' })) }), k.b('contact', { map: tx(L, '서울 마포구', 'Main Street') })]);
  }),
  shop: (L) => buildSite({ name: tx(L, '포근 공방', 'Cozy Craft'), L, designId: 'candy', header: { ctaLabel: tx(L, '구매하기', 'Shop now') } }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('notice', { text: tx(L, '🚚 3만 원 이상 무료 배송', '🚚 Free shipping over $30') }), k.b('hero', { title: tx(L, '손으로 만든\n따뜻한 물건들', 'Warm things,\nmade by hand'), image: k.art('product', 6) }), k.b('services', { title: tx(L, '인기 상품', 'Best sellers'), columns: 3, items: [[tx(L, '뜨개 머플러', 'Knit scarf'), '35,000'], [tx(L, '도자기 컵', 'Ceramic cup'), '18,000'], [tx(L, '향초 세트', 'Candle set'), '24,000']].map(([title, price], i) => ({ image: k.art('product', 90 + i), title, text: tx(L, `${price}원`, `$${Math.round(Number(price.replace(',', '')) / 1300)}`), link: tx(L, '구매', 'Buy'), url: '#' })) }), k.b('testimonials'), k.b('newsletter')]);
    k.page(tx(L, '이야기', 'Story'), [k.b('mediaText'), k.b('steps', { title: tx(L, '만드는 과정', 'How we make it') })]);
    k.page(tx(L, '문의', 'Contact'), [k.b('faq'), k.b('contact')]);
  }),
  blog: (L) => buildSite({ name: tx(L, '느린 하루', 'Slow Days'), L, designId: 'paper' }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('heading', { title: tx(L, '느린 하루', 'Slow Days'), subtitle: tx(L, '여행과 책, 그리고 소소한 일상의 기록', 'Notes on travel, books and small things'), level: 'h1' }, { padTop: 80 }), k.b('blog', { title: '' }), k.b('newsletter')]);
    k.page(tx(L, '글쓴이', 'About'), [k.b('mediaText', { title: tx(L, '글쓴이 소개', 'About the author'), image: k.art('book', 7) }), k.b('social')]);
  }),
  event: (L) => buildSite({ name: tx(L, '빛의 축제 2026', 'Festival of Light 2026'), L, designId: 'galaxy', header: { ctaLabel: tx(L, '참가 신청', 'Register') } }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('hero', { eyebrow: tx(L, '2026년 12월 20일 – 24일', 'December 20 – 24, 2026'), title: tx(L, '도시가 빛으로\n물드는 닷새', 'Five days of light\nin the city'), button1: tx(L, '참가 신청', 'Register'), image: k.art('city', 9) }), k.b('stats', { items: [['5', tx(L, '일', 'days')], ['40+', tx(L, '공연', 'shows')], ['120', tx(L, '작가', 'artists')], ['무료', tx(L, '입장', 'admission')]].map(([value, label]) => ({ value: L === 'en' && value === '무료' ? 'Free' : value, label })) }), k.b('events', { title: tx(L, '주요 일정', 'Program') }), k.b('team', { title: tx(L, '출연진', 'Line-up') }), k.b('faq'), k.b('cta', { title: tx(L, '지금 신청하세요', 'Register now'), button: tx(L, '참가 신청', 'Register') })]);
  }),
  resume: (L) => buildSite({ name: tx(L, '이서준', 'Alex Morgan'), L, designId: 'slate', header: { ctaLabel: tx(L, '연락하기', 'Contact') } }, (k) => {
    k.page(tx(L, '소개', 'Profile'), [
      k.b('heroSplit', { eyebrow: tx(L, '프런트엔드 개발자', 'Front-end developer'), title: tx(L, '사람을 위한\n웹을 만듭니다', 'I build the web\nfor people'), text: tx(L, '8년 동안 빠르고 쉬운 웹 서비스를 만들어 왔습니다.', 'Eight years of making fast, friendly web services.'), button1: tx(L, '이력서 받기', 'Download CV'), image: k.art('portrait', 5) }),
      k.b('checklist', { title: tx(L, '할 수 있는 일', 'What I do'), items: [tx(L, '웹 앱 설계와 개발', 'Web app design and development'), tx(L, '디자인 시스템 구축', 'Design systems'), tx(L, '성능 개선', 'Performance tuning')].map((text) => ({ text })) }),
      k.b('timeline', { title: tx(L, '경력', 'Experience') }), k.b('testimonials', { title: tx(L, '함께 일한 분들의 말', 'Kind words') }), k.b('contact', { title: tx(L, '연락하기', 'Get in touch'), address: '', hours: '' }),
    ]);
  }),
  academy: (L) => buildSite({ name: tx(L, '새싹 아카데미', 'Sprout Academy'), L, designId: 'fresh', header: { ctaLabel: tx(L, '수강 신청', 'Enroll') } }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('hero', { title: tx(L, '배움이 즐거운\n새싹 아카데미', 'Learning made joyful\nat Sprout Academy'), image: k.art('book', 3) }), k.b('features', { title: tx(L, '우리 학원의 특징', 'Why Sprout') }), k.b('services', { title: tx(L, '강좌 안내', 'Courses') }), k.b('testimonials', { title: tx(L, '학부모 후기', 'From parents') })]);
    k.page(tx(L, '강사진', 'Teachers'), [k.b('team', { title: tx(L, '강사진', 'Our teachers') }), k.b('stats')]);
    k.page(tx(L, '수강료', 'Fees'), [k.b('pricing', { title: tx(L, '수강료', 'Fees') }), k.b('faq'), k.b('contact')]);
  }),
  clinic: (L) => buildSite({ name: tx(L, '푸른 치과', 'Bluebell Dental'), L, designId: 'mint', header: { ctaLabel: tx(L, '진료 예약', 'Book a visit') } }, (k) => {
    k.page(tx(L, '홈', 'Home'), [k.b('heroSplit', { eyebrow: tx(L, '편안한 진료', 'Gentle care'), title: tx(L, '아프지 않은 치과,\n푸른 치과', 'A dentist that\ndoes not hurt'), image: k.art('office', 6), button1: tx(L, '진료 예약', 'Book a visit') }), k.b('features', { title: tx(L, '진료 과목', 'Treatments'), items: [['🦷', tx(L, '일반 진료', 'General care'), tx(L, '충치, 스케일링', 'Fillings, cleaning')], ['✨', tx(L, '미백', 'Whitening'), tx(L, '밝은 미소를 위해', 'For a brighter smile')], ['🧒', tx(L, '어린이 치과', 'Kids dentistry'), tx(L, '아이도 편안하게', 'Kind to kids')]].map(([icon, title, text]) => ({ icon, title, text })) }), k.b('steps', { title: tx(L, '진료 순서', 'Your visit') }), k.b('team', { title: tx(L, '의료진', 'Our doctors'), columns: 3, items: k.b('team').props.items.slice(0, 3) })]);
    k.page(tx(L, '진료 안내', 'Visit'), [k.b('contact', { title: tx(L, '진료 시간·오시는 길', 'Hours & directions'), hours: tx(L, '평일 09:30 – 19:00 · 토 09:30 – 14:00', 'Mon–Fri 9:30–19:00 · Sat 9:30–14:00'), map: tx(L, '서울 강남구', 'Main Street') }), k.b('faq')]);
  }),
};

/** A new site from a template, in the given language. */
export function buildTemplate(id = 'blank', L = 'ko') {
  const build = BUILDERS[id] ?? BUILDERS.blank;
  return build(L === 'en' ? 'en' : 'ko');
}
