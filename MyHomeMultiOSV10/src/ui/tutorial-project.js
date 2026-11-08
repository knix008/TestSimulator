// The site the tutorial builds: "FlowNote" (플로우노트), the homepage of an AI note app, made of four
// pages — Home, Pricing, About, Contact — the way websites are made today: one bold message at the
// top, a bento grid of features, social proof (logos, numbers, reviews), a clear next step on every
// page, dark mode, checked on a phone, with a description for search engines and no misspelt words.
//
// Each tutorial step that builds something has an operation here. A step starts from the site as
// it is after all the steps before it (stageSite), so the tour can jump to any step and always
// shows the same thing; then it plays its own operation in the app.
import { createBlock, createPage, createSite } from '../domain/site.js';
import { art } from '../domain/art.js';
import { effectiveDesign } from '../domain/designs.js';

const T = (L, ko, en) => (L === 'en' ? en : ko);

/** Words the tutorial teaches with: a typo to fix and a word to add to the dictionary. */
export const TUTORIAL_WORDS = {
  typo: { ko: '함니다', en: 'meetting' },
  fixed: { ko: '합니다', en: 'meeting' },
  newWord: { ko: '플로우노트', en: 'teamspace' },
};

export const PROJECT_DESIGN = 'ocean';
export const PROJECT_DARK = 'aurora';
export const PROJECT_ACCENT = '#f472b6';

const home = (site) => site.pages[0];
const pageBySlug = (site, slug) => site.pages.find((p) => p.slug === slug);
const colors = (site) => effectiveDesign(site.design);
const block = (site, L, type, props = {}, style = {}) => createBlock(type, { L, design: site.design, props, style });

/** The empty site of "New site": a name, the light design, one empty home page. */
export function projectSite(L) {
  const site = createSite({ name: T(L, '플로우노트', 'FlowNote'), L, designId: PROJECT_DESIGN });
  site.meta.description = '';
  return site;
}

/** Step id → what it adds or changes (site, L). In tutorial order. */
export const OPS = {
  hero: (s, L) => home(s).blocks.push(block(s, L, 'hero')),
  heroText: (s, L) => Object.assign(home(s).blocks.find((b) => b.type === 'hero').props, {
    eyebrow: T(L, 'AI 노트 앱', 'The AI note app'),
    title: T(L, '생각은 적기만 하세요\n정리는 AI가 함니다', 'Just write it down.\nAI tidies every meetting.'),
    subtitle: T(L, '회의록, 할 일, 아이디어를 한곳에. 플로우노트가 요약하고 서로 연결합니다.', 'Meeting notes, tasks and ideas in one place. FlowNote sums them up and links them together.'),
  }),
  heroButtons: (s, L) => Object.assign(home(s).blocks.find((b) => b.type === 'hero').props, {
    button1: T(L, '무료로 시작하기', 'Start for free'), url1: 'pricing.html', button2: T(L, '기능 보기', 'See features'), url2: '#features', image: art('abstract', '#7c3aed', '#06b6d4', 7), overlay: 35,
  }),
  logos: (s, L) => home(s).blocks.push(block(s, L, 'logos', { title: T(L, '1,200개 팀이 함께 씁니다', 'Used by 1,200 teams') })),
  bento: (s, L) => home(s).blocks.push(block(s, L, 'features', {
    title: T(L, '일이 흐르는 네 가지 방법', 'Four ways your work flows'), subtitle: T(L, '쓰는 순간 정리되는 노트', 'Notes that sort themselves as you write'), columns: 2,
    items: [
      { icon: '🧠', title: T(L, 'AI 요약', 'AI summaries'), text: T(L, '한 시간 회의도 다섯 줄로 정리합니다.', 'An hour-long meeting in five lines.') },
      { icon: '✅', title: T(L, '할 일 뽑기', 'Tasks found for you'), text: T(L, '노트 속 할 일을 찾아 담당자에게 보냅니다.', 'Tasks in your notes go to the right person.') },
      { icon: '🔗', title: T(L, '자동 연결', 'Linked automatically'), text: T(L, '비슷한 노트끼리 저절로 이어집니다.', 'Related notes find each other.') },
      { icon: '🔒', title: T(L, '팀 전용 공간', 'A teamspace of your own'), text: T(L, '팀 노트는 팀만 봅니다. 모든 데이터는 암호화됩니다.', 'Only your team sees its notes. Everything is encrypted.') },
    ],
  }, { padTop: 88, padBottom: 88, anchor: 'features' })),
  stats: (s, L) => home(s).blocks.push(block(s, L, 'stats', { items: [
    { value: T(L, '3분', '3 min'), label: T(L, '회의록 정리', 'to tidy a meeting') }, { value: '1,200+', label: T(L, '사용하는 팀', 'teams') },
    { value: '99.9%', label: T(L, '가동률', 'uptime') }, { value: '4.9', label: T(L, '앱 평점', 'app rating') },
  ] })),
  testimonials: (s, L) => home(s).blocks.push(block(s, L, 'testimonials', { title: T(L, '먼저 써 본 팀들의 이야기', 'What teams say') })),
  cta: (s, L) => home(s).blocks.push(block(s, L, 'cta', { title: T(L, '오늘 회의부터 바꿔 보세요', 'Change your next meeting'), text: T(L, '14일 동안 모든 기능을 무료로 써 볼 수 있습니다.', 'Try every feature free for 14 days.'), button: T(L, '무료로 시작하기', 'Start for free'), url: 'pricing.html' })),
  reorder: () => {},
  header: (s, L) => Object.assign(s.layout.header.props, { brand: T(L, '플로우노트', 'FlowNote'), ctaLabel: T(L, '무료로 시작', 'Start free'), ctaUrl: 'pricing.html', sticky: true }),
  footer: (s, L) => Object.assign(s.layout.footer.props, {
    about: T(L, '플로우노트는 기록하는 시간을 줄이고 생각하는 시간을 늘립니다.', 'FlowNote gives you less time writing things down and more time thinking.'),
    copyright: T(L, '© 2026 플로우노트. All rights reserved.', '© 2026 FlowNote. All rights reserved.'), email: 'hello@flownote.app',
  }),
  addPage: (s, L) => s.pages.push(createPage(s, { name: T(L, '요금제', 'Pricing'), slug: 'pricing' })),
  pricing: (s, L) => pageBySlug(s, 'pricing').blocks.push(
    block(s, L, 'heading', { title: T(L, '팀에 맞는 요금제', 'A plan for every team'), subtitle: T(L, '언제든 바꾸거나 해지할 수 있습니다.', 'Change or cancel at any time.'), level: 'h1' }, { padTop: 88 }),
    block(s, L, 'pricing', { title: '', subtitle: '' }),
    block(s, L, 'faq', { title: T(L, '자주 묻는 질문', 'Questions') }),
  ),
  about: (s, L) => {
    const page = createPage(s, { name: T(L, '소개', 'About'), slug: 'about' });
    page.blocks.push(
      block(s, L, 'heading', { title: T(L, '기록은 짧게, 생각은 깊게', 'Write less, think more'), subtitle: T(L, '2023년, 회의가 너무 많던 세 사람이 만들었습니다.', 'Started in 2023 by three people with too many meetings.'), level: 'h1' }, { padTop: 88 }),
      block(s, L, 'mediaText', { title: T(L, '우리 이야기', 'Our story'), body: T(L, '회의가 끝나면 정리는 늘 누군가의 몫이었습니다. 그 일을 AI에게 맡기기로 했습니다.\n\n- 쓰는 사람을 먼저 생각합니다\n- 데이터는 사용자의 것입니다\n- 작게 만들고 자주 고칩니다', 'After every meeting, someone had to write it all up. We decided to give that job to AI.\n\n- People who write come first\n- Your data is yours\n- Ship small, improve often'), image: art('office', colors(s).primary, colors(s).accent, 12), button: '', url: '' }),
      block(s, L, 'team', { title: T(L, '함께 만드는 사람들', 'The team') }),
      block(s, L, 'timeline', { title: T(L, '걸어온 길', 'Our journey') }),
    );
    s.pages.push(page);
  },
  contact: (s, L) => {
    const page = createPage(s, { name: T(L, '문의', 'Contact'), slug: 'contact' });
    page.blocks.push(
      block(s, L, 'contact', { title: T(L, '무엇이든 물어보세요', 'Ask us anything'), text: T(L, '하루 안에 답장을 드립니다.', 'We answer within a day.'), email: 'hello@flownote.app', form: true, map: '' }),
      block(s, L, 'newsletter', { title: T(L, '새 기능 소식 받기', 'Get product news'), text: T(L, '한 달에 한 번, 꼭 필요한 소식만 보냅니다.', 'Once a month, only what matters.') }),
      block(s, L, 'social'),
    );
    s.pages.push(page);
  },
  darkMode: (s) => { s.design = { id: PROJECT_DARK, overrides: {} }; },
  accent: (s) => { s.design.overrides = { ...s.design.overrides, accent: PROJECT_ACCENT, radius: 18 }; },
  sectionStyle: (s) => { const f = home(s).blocks.find((b) => b.type === 'features'); if (f) f.style = { ...f.style, bg: 'surface' }; },
  spelling: (s, L) => { const hero = home(s).blocks.find((b) => b.type === 'hero'); hero.props.title = hero.props.title.replace(TUTORIAL_WORDS.typo[L], TUTORIAL_WORDS.fixed[L]); },
  seo: (s, L) => {
    s.meta.description = T(L, '회의록과 할 일을 AI가 정리해 주는 노트 앱, 플로우노트. 14일 무료 체험.', 'FlowNote, the note app where AI tidies up your meeting notes and tasks. Free for 14 days.');
    s.meta.keywords = T(L, 'AI 노트, 회의록, 할 일', 'AI notes, meeting notes, tasks');
  },
};

/** The site as it is when step `upTo` starts (the operations of every earlier step, in order). */
export function stageSite(L, stepIds, upTo) {
  const site = projectSite(L);
  for (const id of stepIds.slice(0, Math.max(0, upTo))) OPS[id]?.(site, L);
  return site;
}
