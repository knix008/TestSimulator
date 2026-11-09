// Blocks: the parts a page is built from (a hero, a feature grid, a price table, a contact form …).
// Each kind says where it sits in the Blocks panel, what it starts with (in Korean or English),
// which fields the Content tab edits, and how it is written as HTML. The editor canvas and the
// exported site use the same HTML (render.js), so what the user sees is what gets published.
import { art } from './art.js';

const tx = (L, ko, en) => (L === 'en' ? en : ko);

/** Groups of the Blocks panel. */
export const BLOCK_GROUPS = [
  { id: 'hero', icon: 'blkHero', ko: '첫 화면·배너', en: 'Heroes & banners' },
  { id: 'basic', icon: 'blkText', ko: '기본 요소', en: 'Basic elements' },
  { id: 'content', icon: 'blkFeatures', ko: '내용 구성', en: 'Content' },
  { id: 'showcase', icon: 'blkGallery', ko: '소개·전시', en: 'Showcase' },
  { id: 'contact', icon: 'blkContact', ko: '연락·소셜', en: 'Contact & social' },
  { id: 'site', icon: 'blkNavbar', ko: '머리글·바닥글', en: 'Header & footer' },
];

// ───────────────────────── HTML helpers

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Plain text with its line breaks. */
export const nl = (value) => esc(value).replace(/\r?\n/g, '<br>');

/** Addresses a link may have: web, mail, phone, anchors, relative pages and data pictures. Anything else (javascript: …) becomes "#". */
export function safeUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '#';
  if (/^(https?:|mailto:|tel:|#|\.{0,2}\/|data:image\/)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '#';
  return url;
}

/** Inline Markdown-lite: **bold**, *italic*, `code`, [text](url). Input is escaped first. */
function inlineMd(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => `<a href="${esc(safeUrl(href.replace(/&amp;/g, '&')))}">${label}</a>`);
}

/** Paragraphs (blank line), lists ("- " / "1. "), headings ("## "), and inline marks. */
export function md(text) {
  const blocks = String(text ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) return '';
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) return `<ul>${lines.map((line) => `<li>${inlineMd(line.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) return `<ol>${lines.map((line) => `<li>${inlineMd(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    const heading = /^(#{2,4})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) return `<h${heading[1].length + 1}>${inlineMd(heading[2])}</h${heading[1].length + 1}>`;
    return `<p>${lines.map(inlineMd).join('<br>')}</p>`;
  }).join('');
}

/** YouTube / Vimeo page → its embed address; null for anything else. */
export function embedUrl(value) {
  const url = String(value ?? '').trim();
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(url);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(url);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

export const mapUrl = (query) => `https://maps.google.com/maps?q=${encodeURIComponent(String(query ?? ''))}&z=15&output=embed`;

// ───────────────────────── fields

const f = (key, kind, ko, en, extra = {}) => ({ key, kind, ko, en, ...extra });
const opt = (value, ko, en) => ({ value, ko, en });
const COLS = [opt(2, '2열', '2 columns'), opt(3, '3열', '3 columns'), opt(4, '4열', '4 columns')];
const BUTTON_STYLES = [opt('primary', '채움', 'Filled'), opt('outline', '테두리', 'Outline'), opt('link', '링크', 'Link')];

// ───────────────────────── render helpers (ctx: { editor, site, page, design, pages, L })

/** data-edit attribute for inline editing (editor only). */
const E = (ctx, path) => (ctx.editor ? ` data-edit="${esc(path)}"` : '');
/** Text that is edited in the Content tab (several lines with marks): a double click opens that field. */
const EM = (ctx, path) => (ctx.editor ? ` data-edit-field="${esc(path)}"` : '');
const img = (ctx, src, alt, path, cls = '') => (src ? `<img class="${cls}" src="${esc(safeUrl(src))}" alt="${esc(alt ?? '')}" loading="lazy"${ctx.editor ? ` data-edit-image="${esc(path)}"` : ''} />` : `<div class="hm-img-empty ${cls}"${ctx.editor ? ` data-edit-image="${esc(path)}"` : ''}>🖼</div>`);
/** What a block is drawing now: in the editor or not, and its properties (the looks of its buttons, hidden items). Set by renderBlock. */
let RENDER = { editor: false, props: {} };

export const BUTTON_VARIANTS = ['primary', 'outline', 'link', 'light'];
export const BUTTON_SIZES = ['small', 'large'];
export const BUTTON_SHAPES = ['square', 'round', 'pill'];
const HEX = /^#[0-9a-f]{6}$/i;

/** A button's own settings (Content tab › button properties), only the valid ones. */
export function buttonLook(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    variant: BUTTON_VARIANTS.includes(o.variant) ? o.variant : '',
    size: BUTTON_SIZES.includes(o.size) ? o.size : '',
    shape: BUTTON_SHAPES.includes(o.shape) ? o.shape : '',
    bg: HEX.test(o.bg ?? '') ? o.bg : '',
    color: HEX.test(o.color ?? '') ? o.color : '',
    icon: String(o.icon ?? '').slice(0, 8),
    full: Boolean(o.full),
    newTab: Boolean(o.newTab),
  };
}

/** A link drawn as a button: the block's default style, changed by the button's own settings. */
const btn = (ctx, label, url, style, path) => {
  if (!label) return '';
  const o = buttonLook(RENDER.props?.buttons?.[path]);
  const variant = o.variant || style || 'primary';
  const cls = ['hm-btn', `hm-btn-${esc(variant)}`, o.size ? `hm-btn-${o.size}` : '', o.shape ? `hm-btn-${o.shape}` : '', o.full ? 'hm-btn-full' : ''].filter(Boolean).join(' ');
  const css = [o.bg ? `background:${o.bg};border-color:${o.bg}` : '', o.color ? `color:${o.color}` : ''].filter(Boolean).join(';');
  return `<a class="${cls}" href="${esc(safeUrl(url))}"${o.newTab ? ' target="_blank" rel="noopener"' : ''}${css ? ` style="${css}"` : ''}>${o.icon ? `<span class="hm-btn-icon" aria-hidden="true">${esc(o.icon)}</span>` : ''}<span${E(ctx, path)}>${esc(label)}</span></a>`;
};

/** An item's own settings (Content tab › item properties): hidden, highlighted, its colours. */
const IT = (it, i) => {
  const css = [HEX.test(it?._bg ?? '') ? `background:${it._bg}` : '', HEX.test(it?._color ?? '') ? `color:${it._color}` : ''].filter(Boolean).join(';');
  return `${RENDER.editor ? ` data-item="${i}"${it?._hidden ? ' data-item-hidden' : ''}` : ''}${it?._accent ? ' data-item-accent' : ''}${css ? ` style="${css}"` : ''}`;
};
const head = (ctx, p, { title = 'title', subtitle = 'subtitle' } = {}) => {
  const t = p[title] ? `<h2 class="hm-title"${E(ctx, title)}>${nl(p[title])}</h2>` : '';
  const s = p[subtitle] ? `<p class="hm-subtitle"${E(ctx, subtitle)}>${nl(p[subtitle])}</p>` : '';
  return t || s ? `<div class="hm-head">${t}${s}</div>` : '';
};
const items = (p) => (Array.isArray(p.items) ? p.items : []).filter((it) => RENDER.editor || !it?._hidden);
const cols = (n) => Math.min(4, Math.max(1, Number(n) || 3));

/** The page file a link goes to ("index.html", "about.html"). */
export const pageFile = (page) => `${page.slug === 'index' || !page.slug ? 'index' : page.slug}.html`;

// ───────────────────────── the block kinds

const DEF = {};
const add = (type, group, icon, ko, en, def) => { DEF[type] = { type, group, icon, ko, en, ...def }; };

// ── header & footer (one each per site: they appear on every page)

add('navbar', 'site', 'blkNavbar', '머리글(메뉴)', 'Header (menu)', {
  global: true,
  style: { padTop: 14, padBottom: 14, bg: '' },
  defaults: (L) => ({ brand: tx(L, '나의 홈페이지', 'My Website'), logo: '', ctaLabel: tx(L, '문의하기', 'Contact us'), ctaUrl: '#contact', sticky: true, layout: 'left' }),
  fields: [f('brand', 'text', '사이트 이름', 'Site name'), f('logo', 'image', '로고', 'Logo'), f('ctaLabel', 'text', '오른쪽 버튼', 'Button'), f('ctaUrl', 'url', '버튼 주소', 'Button link'),
    f('layout', 'select', '배치', 'Layout', { options: [opt('left', '로고 왼쪽', 'Logo left'), opt('center', '가운데', 'Centered')] }), f('sticky', 'toggle', '위에 고정', 'Stick to the top')],
  render: (b, p, ctx) => {
    const links = ctx.pages.filter((page) => page.nav !== false).map((page) => `<a href="${esc(pageFile(page))}" class="${page.id === ctx.page?.id ? 'active' : ''}"${ctx.editor ? ` data-page-link="${esc(page.id)}"` : ''}>${esc(page.name)}</a>`).join('');
    const logo = p.logo ? `<img class="hm-logo" src="${esc(safeUrl(p.logo))}" alt=""${ctx.editor ? ' data-edit-image="logo"' : ''} />` : '';
    return { tag: 'header', cls: `${p.sticky ? 'hm-sticky' : ''} hm-nav-${esc(p.layout || 'left')}`, inner: `<div class="hm-nav">
      <a class="hm-brand" href="index.html">${logo}<span${E(ctx, 'brand')}>${esc(p.brand)}</span></a>
      <input type="checkbox" id="hm-nav-toggle-${esc(b.id)}" class="hm-nav-toggle" aria-label="menu" />
      <label for="hm-nav-toggle-${esc(b.id)}" class="hm-burger" aria-hidden="true"><i></i><i></i><i></i></label>
      <nav class="hm-links">${links}${btn(ctx, p.ctaLabel, p.ctaUrl, 'primary', 'ctaLabel')}</nav></div>` };
  },
});

add('footer', 'site', 'blkFooter', '바닥글', 'Footer', {
  global: true,
  style: { padTop: 48, padBottom: 32, bg: 'footer' },
  defaults: (L) => ({
    about: tx(L, '정성을 다해 만든 우리의 이야기를 들려 드립니다.', 'We tell our story with care.'),
    address: tx(L, '서울특별시 중구 세종대로 110', '110 Main Street, Springfield'), phone: '02-123-4567', email: 'hello@example.com',
    copyright: tx(L, '© 2026 나의 홈페이지. All rights reserved.', '© 2026 My Website. All rights reserved.'),
    items: [{ label: 'Instagram', url: 'https://instagram.com' }, { label: 'YouTube', url: 'https://youtube.com' }, { label: 'Blog', url: '#' }],
  }),
  fields: [f('about', 'textarea', '소개', 'About'), f('address', 'text', '주소', 'Address'), f('phone', 'text', '전화', 'Phone'), f('email', 'text', '이메일', 'E-mail'), f('copyright', 'text', '저작권 문구', 'Copyright'),
    f('items', 'items', '링크', 'Links', { item: [f('label', 'text', '이름', 'Name'), f('url', 'url', '주소', 'Link')], add: () => ({ label: 'Link', url: '#' }) })],
  render: (b, p, ctx) => {
    const brand = ctx.site?.layout?.header?.props?.brand ?? ctx.site?.meta?.title ?? '';
    const pages = ctx.pages.filter((page) => page.nav !== false).map((page) => `<a href="${esc(pageFile(page))}">${esc(page.name)}</a>`).join('');
    return { tag: 'footer', inner: `<div class="hm-footer-grid">
      <div><b class="hm-footer-brand">${esc(brand)}</b><p${E(ctx, 'about')}>${nl(p.about)}</p></div>
      <div class="hm-footer-links">${pages}</div>
      <div class="hm-footer-contact">${p.address ? `<p${E(ctx, 'address')}>${esc(p.address)}</p>` : ''}${p.phone ? `<p><a href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ''))}"${E(ctx, 'phone')}>${esc(p.phone)}</a></p>` : ''}${p.email ? `<p><a href="mailto:${esc(p.email)}"${E(ctx, 'email')}>${esc(p.email)}</a></p>` : ''}
        <div class="hm-social">${items(p).map((it, i) => `<a${IT(it, i)} href="${esc(safeUrl(it.url))}"${E(ctx, `items.${i}.label`)}>${esc(it.label)}</a>`).join('')}</div></div>
      </div><p class="hm-copy"${E(ctx, 'copyright')}>${esc(p.copyright)}</p>` };
  },
});

// ── heroes & banners

add('hero', 'hero', 'blkHero', '대표 배너', 'Hero banner', {
  style: { padTop: 120, padBottom: 120, align: 'center', bg: 'primary' },
  defaults: (L, c) => ({ eyebrow: tx(L, '환영합니다', 'Welcome'), title: tx(L, '당신의 이야기를\n세상에 보여 주세요', 'Show your story\nto the world'), subtitle: tx(L, '몇 번의 클릭으로 멋진 홈페이지를 만들 수 있습니다.', 'Make a beautiful website in a few clicks.'),
    button1: tx(L, '시작하기', 'Get started'), url1: '#', button2: tx(L, '더 알아보기', 'Learn more'), url2: '#', image: art('abstract', c?.primary, c?.accent, 7), overlay: 45 }),
  fields: [f('eyebrow', 'text', '작은 제목', 'Eyebrow'), f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '설명', 'Subtitle'), f('button1', 'text', '버튼 1', 'Button 1'), f('url1', 'url', '버튼 1 주소', 'Button 1 link'),
    f('button2', 'text', '버튼 2', 'Button 2'), f('url2', 'url', '버튼 2 주소', 'Button 2 link'), f('image', 'image', '배경 그림', 'Background picture'), f('overlay', 'number', '그림 어둡게(%)', 'Darken picture (%)', { min: 0, max: 90, step: 5 })],
  render: (b, p, ctx) => ({
    bgImage: p.image, overlay: p.overlay,
    inner: `<div class="hm-hero-inner">${p.eyebrow ? `<p class="hm-eyebrow"${E(ctx, 'eyebrow')}>${esc(p.eyebrow)}</p>` : ''}<h1${E(ctx, 'title')}>${nl(p.title)}</h1>${p.subtitle ? `<p class="hm-lead"${E(ctx, 'subtitle')}>${nl(p.subtitle)}</p>` : ''}
      <div class="hm-actions">${btn(ctx, p.button1, p.url1, 'primary', 'button1')}${btn(ctx, p.button2, p.url2, 'outline', 'button2')}</div></div>`,
  }),
});

add('heroSplit', 'hero', 'blkHeroSplit', '그림 옆 배너', 'Split hero', {
  style: { padTop: 96, padBottom: 96 },
  defaults: (L, c) => ({ eyebrow: tx(L, '새로운 시작', 'A new start'), title: tx(L, '생각을 현실로 만드는 곳', 'Where ideas come true'), text: tx(L, '전문가와 함께 더 빠르고 쉽게 목표를 이루세요. 처음부터 끝까지 함께합니다.', 'Reach your goals faster with experts at your side, from start to finish.'),
    button1: tx(L, '상담 신청', 'Book a call'), url1: '#contact', image: art('office', c?.primary, c?.accent, 3), reverse: false }),
  fields: [f('eyebrow', 'text', '작은 제목', 'Eyebrow'), f('title', 'textarea', '제목', 'Title'), f('text', 'textarea', '설명', 'Text'), f('button1', 'text', '버튼', 'Button'), f('url1', 'url', '버튼 주소', 'Button link'), f('image', 'image', '그림', 'Picture'), f('reverse', 'toggle', '그림을 왼쪽에', 'Picture on the left')],
  render: (b, p, ctx) => ({ inner: `<div class="hm-split ${p.reverse ? 'reverse' : ''}"><div class="hm-split-text">${p.eyebrow ? `<p class="hm-eyebrow"${E(ctx, 'eyebrow')}>${esc(p.eyebrow)}</p>` : ''}<h1${E(ctx, 'title')}>${nl(p.title)}</h1><p class="hm-lead"${E(ctx, 'text')}>${nl(p.text)}</p><div class="hm-actions">${btn(ctx, p.button1, p.url1, 'primary', 'button1')}</div></div>
    <div class="hm-split-media">${img(ctx, p.image, p.title, 'image', 'hm-rounded hm-shadow')}</div></div>` }),
});

add('cta', 'hero', 'blkCta', '행동 유도', 'Call to action', {
  style: { padTop: 72, padBottom: 72, align: 'center', bg: 'primary' },
  defaults: (L) => ({ title: tx(L, '지금 바로 시작해 보세요', 'Start today'), text: tx(L, '첫 상담은 무료입니다. 부담 없이 연락 주세요.', 'The first consultation is free. Just get in touch.'), button: tx(L, '무료 상담 받기', 'Get a free consultation'), url: '#contact' }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('text', 'textarea', '설명', 'Text'), f('button', 'text', '버튼', 'Button'), f('url', 'url', '버튼 주소', 'Button link')],
  render: (b, p, ctx) => ({ inner: `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2><p class="hm-lead"${E(ctx, 'text')}>${nl(p.text)}</p><div class="hm-actions">${btn(ctx, p.button, p.url, 'light', 'button')}</div>` }),
});

add('newsletter', 'hero', 'blkNewsletter', '소식 받기', 'Newsletter', {
  style: { padTop: 64, padBottom: 64, align: 'center', bg: 'surface' },
  defaults: (L) => ({ title: tx(L, '새 소식을 받아 보세요', 'Get our news'), text: tx(L, '한 달에 한 번, 꼭 필요한 소식만 보내 드립니다.', 'Once a month, only what matters.'), placeholder: tx(L, '이메일 주소', 'E-mail address'), button: tx(L, '구독하기', 'Subscribe'), endpoint: '' }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('text', 'textarea', '설명', 'Text'), f('placeholder', 'text', '입력 칸 안내', 'Placeholder'), f('button', 'text', '버튼', 'Button'), f('endpoint', 'url', '보낼 주소(폼 서비스)', 'Form endpoint (form service)')],
  render: (b, p, ctx) => ({ inner: `${head(ctx, { title: p.title, subtitle: p.text }, { subtitle: 'text' })}<form class="hm-inline-form" method="post" action="${esc(safeUrl(p.endpoint || '#'))}"><input type="email" name="email" required placeholder="${esc(p.placeholder)}" /><button class="hm-btn hm-btn-primary" type="submit"${E(ctx, 'button')}>${esc(p.button)}</button></form>` }),
});

add('notice', 'hero', 'blkNotice', '알림 띠', 'Notice bar', {
  style: { padTop: 12, padBottom: 12, align: 'center', bg: 'accent' },
  defaults: (L) => ({ text: tx(L, '🎉 신규 회원 첫 달 50% 할인 중!', '🎉 50% off the first month for new members!'), link: tx(L, '자세히 보기', 'Details'), url: '#' }),
  fields: [f('text', 'text', '알림 내용', 'Notice'), f('link', 'text', '링크 글자', 'Link text'), f('url', 'url', '링크 주소', 'Link')],
  render: (b, p, ctx) => ({ inner: `<p class="hm-notice"><span${E(ctx, 'text')}>${esc(p.text)}</span>${p.link ? ` <a href="${esc(safeUrl(p.url))}"${E(ctx, 'link')}>${esc(p.link)} →</a>` : ''}</p>` }),
});

// ── basic elements

add('heading', 'basic', 'blkHeading', '제목', 'Heading', {
  style: { padTop: 48, padBottom: 16, align: 'center' },
  defaults: (L) => ({ title: tx(L, '섹션 제목', 'Section title'), subtitle: tx(L, '이 부분을 설명하는 짧은 문장', 'A short line about this part'), level: 'h2' }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '부제목', 'Subtitle'), f('level', 'select', '크기', 'Size', { options: [opt('h1', '아주 크게', 'Largest'), opt('h2', '크게', 'Large'), opt('h3', '보통', 'Medium')] })],
  render: (b, p, ctx) => {
    const level = ['h1', 'h2', 'h3'].includes(p.level) ? p.level : 'h2';
    return { inner: `<div class="hm-head"><${level} class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</${level}>${p.subtitle ? `<p class="hm-subtitle"${E(ctx, 'subtitle')}>${nl(p.subtitle)}</p>` : ''}</div>` };
  },
});

add('text', 'basic', 'blkText', '글', 'Text', {
  style: { padTop: 24, padBottom: 24, width: 'narrow' },
  defaults: (L) => ({ body: tx(L, '여기에 글을 쓰세요. **굵게**, *기울임*, [링크](https://example.com)를 쓸 수 있습니다.\n\n빈 줄을 넣으면 새 문단이 됩니다.\n\n- 목록은 줄 앞에 - 를 붙입니다\n- 두 번째 항목', 'Write your text here. You can use **bold**, *italic* and [links](https://example.com).\n\nA blank line starts a new paragraph.\n\n- Start a line with - for a list\n- Second item') }),
  fields: [f('body', 'md', '글', 'Text')],
  render: (b, p, ctx) => ({ inner: `<div class="hm-prose"${EM(ctx, 'body')}>${md(p.body)}</div>` }),
});

add('image', 'basic', 'blkImage', '그림', 'Picture', {
  style: { padTop: 24, padBottom: 24, align: 'center' },
  defaults: (L, c) => ({ src: art('landscape', c?.primary, c?.accent, 5), alt: tx(L, '풍경', 'Landscape'), caption: tx(L, '그림 설명을 쓰세요', 'Write a caption'), maxWidth: 960, rounded: true, url: '' }),
  fields: [f('src', 'image', '그림', 'Picture'), f('alt', 'text', '대체 글(접근성)', 'Alt text'), f('caption', 'text', '설명', 'Caption'), f('maxWidth', 'number', '최대 폭(px)', 'Max width (px)', { min: 120, max: 1600, step: 20 }), f('rounded', 'toggle', '둥근 모서리', 'Rounded corners'), f('url', 'url', '누르면 갈 주소', 'Link')],
  render: (b, p, ctx) => {
    const picture = img(ctx, p.src, p.alt, 'src', p.rounded ? 'hm-rounded' : '');
    return { inner: `<figure class="hm-figure" style="max-width:${Math.max(120, Number(p.maxWidth) || 960)}px">${p.url ? `<a href="${esc(safeUrl(p.url))}">${picture}</a>` : picture}${p.caption ? `<figcaption${E(ctx, 'caption')}>${esc(p.caption)}</figcaption>` : ''}</figure>` };
  },
});

add('button', 'basic', 'blkButton', '버튼', 'Button', {
  style: { padTop: 16, padBottom: 16, align: 'center' },
  defaults: (L) => ({ label: tx(L, '자세히 보기', 'Learn more'), url: '#', variant: 'primary', large: false }),
  fields: [f('label', 'text', '버튼 글자', 'Label'), f('url', 'url', '주소', 'Link'), f('variant', 'select', '모양', 'Style', { options: BUTTON_STYLES }), f('large', 'toggle', '크게', 'Large')],
  render: (b, p, ctx) => ({ inner: `<div class="hm-actions ${p.large ? 'large' : ''}">${btn(ctx, p.label, p.url, p.variant, 'label')}</div>` }),
});

add('divider', 'basic', 'blkDivider', '구분선', 'Divider', {
  style: { padTop: 16, padBottom: 16 },
  defaults: () => ({ variant: 'line' }),
  fields: [f('variant', 'select', '모양', 'Style', { options: [opt('line', '선', 'Line'), opt('dots', '점', 'Dots'), opt('short', '짧은 선', 'Short line')] })],
  render: (b, p) => ({ inner: `<hr class="hm-divider hm-divider-${esc(p.variant || 'line')}" />` }),
});

add('spacer', 'basic', 'blkSpacer', '여백', 'Spacer', {
  style: { padTop: 0, padBottom: 0 },
  defaults: () => ({ height: 64 }),
  fields: [f('height', 'number', '높이(px)', 'Height (px)', { min: 8, max: 400, step: 8 })],
  render: (b, p) => ({ inner: `<div class="hm-spacer" style="height:${Math.max(8, Number(p.height) || 64)}px"></div>` }),
});

add('columns', 'basic', 'blkColumns', '여러 단 글', 'Text columns', {
  style: { padTop: 48, padBottom: 48 },
  defaults: (L) => ({ columns: 3, items: [1, 2, 3].map((n) => ({ title: tx(L, `제목 ${n}`, `Title ${n}`), body: tx(L, '짧은 설명을 쓰세요. **굵게** 쓸 수도 있습니다.', 'Write a short text. **Bold** works too.') })) }),
  fields: [f('columns', 'select', '단 수', 'Columns', { options: COLS }), f('items', 'items', '단', 'Columns', { item: [f('title', 'text', '제목', 'Title'), f('body', 'md', '글', 'Text')], add: () => ({ title: 'Title', body: 'Text' }) })],
  render: (b, p, ctx) => ({ inner: `<div class="hm-grid cols-${cols(p.columns)}">${items(p).map((it, i) => `<div${IT(it, i)} class="hm-col">${it.title ? `<h3${E(ctx, `items.${i}.title`)}>${esc(it.title)}</h3>` : ''}<div class="hm-prose"${EM(ctx, `items.${i}.body`)}>${md(it.body)}</div></div>`).join('')}</div>` }),
});

add('quote', 'basic', 'blkQuote', '인용', 'Quote', {
  style: { padTop: 56, padBottom: 56, align: 'center', bg: 'surface' },
  defaults: (L) => ({ text: tx(L, '단순함은 궁극의 정교함이다.', 'Simplicity is the ultimate sophistication.'), author: tx(L, '레오나르도 다빈치', 'Leonardo da Vinci'), role: '' }),
  fields: [f('text', 'textarea', '인용문', 'Quote'), f('author', 'text', '말한 사람', 'Author'), f('role', 'text', '직함', 'Role')],
  render: (b, p, ctx) => ({ inner: `<blockquote class="hm-quote"><p${E(ctx, 'text')}>${nl(p.text)}</p><cite><b${E(ctx, 'author')}>${esc(p.author)}</b>${p.role ? ` · <span${E(ctx, 'role')}>${esc(p.role)}</span>` : ''}</cite></blockquote>` }),
});

add('checklist', 'basic', 'blkList', '확인 목록', 'Check list', {
  style: { padTop: 40, padBottom: 40, width: 'narrow' },
  defaults: (L) => ({ title: tx(L, '이런 점이 좋습니다', 'Why people like it'), mark: '✔', items: [tx(L, '누구나 쉽게 쓸 수 있습니다', 'Anyone can use it'), tx(L, '휴대폰에서도 잘 보입니다', 'Looks great on phones'), tx(L, '언제든 고칠 수 있습니다', 'Change it any time')].map((text) => ({ text })) }),
  fields: [f('title', 'text', '제목', 'Title'), f('mark', 'text', '표시 기호', 'Marker'), f('items', 'items', '항목', 'Items', { item: [f('text', 'text', '내용', 'Text')], add: () => ({ text: '…' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${esc(p.title)}</h2>` : ''}<ul class="hm-check">${items(p).map((it, i) => `<li${IT(it, i)}><span class="hm-mark">${esc(p.mark || '✔')}</span><span${E(ctx, `items.${i}.text`)}>${esc(it.text)}</span></li>`).join('')}</ul>` }),
});

add('video', 'basic', 'blkVideo', '동영상', 'Video', {
  style: { padTop: 40, padBottom: 40, width: 'narrow', align: 'center' },
  defaults: (L) => ({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: tx(L, '동영상 설명', 'About this video') }),
  fields: [f('url', 'url', '동영상 주소(YouTube, Vimeo, mp4)', 'Video address (YouTube, Vimeo, mp4)'), f('caption', 'text', '설명', 'Caption')],
  render: (b, p, ctx) => {
    const embed = embedUrl(p.url);
    const player = embed ? `<iframe src="${esc(embed)}" title="video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>` : p.url ? `<video controls src="${esc(safeUrl(p.url))}"></video>` : '<div class="hm-img-empty">▶</div>';
    return { inner: `<div class="hm-video">${player}</div>${p.caption ? `<p class="hm-caption"${E(ctx, 'caption')}>${esc(p.caption)}</p>` : ''}` };
  },
});

add('map', 'basic', 'blkMap', '지도', 'Map', {
  style: { padTop: 24, padBottom: 24 },
  defaults: (L) => ({ query: tx(L, '서울시청', 'Eiffel Tower, Paris'), height: 380 }),
  fields: [f('query', 'text', '장소(주소나 이름)', 'Place (address or name)'), f('height', 'number', '높이(px)', 'Height (px)', { min: 160, max: 900, step: 20 })],
  render: (b, p) => ({ inner: `<div class="hm-map" style="height:${Math.max(160, Number(p.height) || 380)}px"><iframe src="${esc(mapUrl(p.query))}" title="map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>` }),
});

add('html', 'basic', 'blkHtml', 'HTML 코드', 'HTML code', {
  style: { padTop: 24, padBottom: 24 },
  defaults: (L) => ({ code: `<div style="padding:24px;border:2px dashed currentColor;border-radius:12px;text-align:center">${tx(L, '직접 쓴 HTML 이 여기에 들어갑니다', 'Your own HTML goes here')}</div>` }),
  fields: [f('code', 'code', 'HTML', 'HTML')],
  render: (b, p, ctx) => ({ inner: `<div class="hm-html"${EM(ctx, 'code')}>${ctx.editor ? String(p.code ?? '').replace(/<script\b[\s\S]*?<\/script>/gi, '') : String(p.code ?? '')}</div>` }),
});

// ── content

add('features', 'content', 'blkFeatures', '특징 소개', 'Features', {
  style: { padTop: 80, padBottom: 80, align: 'center' },
  defaults: (L) => ({ title: tx(L, '왜 우리를 선택할까요?', 'Why choose us?'), subtitle: tx(L, '고객이 만족하는 세 가지 이유', 'Three reasons our customers are happy'), columns: 3,
    items: [['⚡', tx(L, '빠른 속도', 'Fast'), tx(L, '기다림 없이 바로 결과를 확인하세요.', 'See results at once, no waiting.')], ['🛡️', tx(L, '믿을 수 있는', 'Reliable'), tx(L, '10년 넘게 쌓아 온 경험이 있습니다.', 'Over ten years of experience.')], ['💬', tx(L, '친절한 상담', 'Friendly support'), tx(L, '언제든 편하게 물어보세요.', 'Ask us anything, any time.')]].map(([icon, title, text]) => ({ icon, title, text })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '부제목', 'Subtitle'), f('columns', 'select', '단 수', 'Columns', { options: COLS }),
    f('items', 'items', '특징', 'Features', { item: [f('icon', 'text', '아이콘(이모지)', 'Icon (emoji)'), f('title', 'text', '제목', 'Title'), f('text', 'textarea', '설명', 'Text')], add: () => ({ icon: '⭐', title: 'Feature', text: '…' }) })],
  render: (b, p, ctx) => ({ inner: `${head(ctx, p)}<div class="hm-grid cols-${cols(p.columns)}">${items(p).map((it, i) => `<div${IT(it, i)} class="hm-card hm-feature"><div class="hm-icon"${E(ctx, `items.${i}.icon`)}>${esc(it.icon)}</div><h3${E(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${E(ctx, `items.${i}.text`)}>${nl(it.text)}</p></div>`).join('')}</div>` }),
});

add('services', 'content', 'blkServices', '서비스 카드', 'Service cards', {
  style: { padTop: 80, padBottom: 80, bg: 'surface' },
  defaults: (L, c) => ({ title: tx(L, '우리의 서비스', 'Our services'), subtitle: tx(L, '필요한 것을 골라 보세요', 'Pick what you need'), columns: 3,
    items: [[tx(L, '기획', 'Planning'), 'office'], [tx(L, '디자인', 'Design'), 'abstract'], [tx(L, '운영', 'Operations'), 'tech']].map(([title, kind], i) => ({ image: art(kind, c?.primary, c?.accent, 11 + i), title, text: tx(L, '전문가가 처음부터 끝까지 꼼꼼하게 챙깁니다.', 'Experts take care of every detail.'), link: tx(L, '자세히', 'More'), url: '#' })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '부제목', 'Subtitle'), f('columns', 'select', '단 수', 'Columns', { options: COLS }),
    f('items', 'items', '카드', 'Cards', { item: [f('image', 'image', '그림', 'Picture'), f('title', 'text', '제목', 'Title'), f('text', 'textarea', '설명', 'Text'), f('link', 'text', '링크 글자', 'Link text'), f('url', 'url', '링크 주소', 'Link')], add: () => ({ image: '', title: 'Service', text: '…', link: '', url: '#' }) })],
  render: (b, p, ctx) => ({ inner: `${head(ctx, p)}<div class="hm-grid cols-${cols(p.columns)}">${items(p).map((it, i) => `<article${IT(it, i)} class="hm-card hm-media-card">${img(ctx, it.image, it.title, `items.${i}.image`, 'hm-card-img')}<div class="hm-card-body"><h3${E(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${E(ctx, `items.${i}.text`)}>${nl(it.text)}</p>${it.link ? `<a class="hm-more" href="${esc(safeUrl(it.url))}"${E(ctx, `items.${i}.link`)}>${esc(it.link)} →</a>` : ''}</div></article>`).join('')}</div>` }),
});

add('mediaText', 'content', 'blkMediaText', '그림과 글', 'Picture & text', {
  style: { padTop: 80, padBottom: 80 },
  defaults: (L, c) => ({ title: tx(L, '우리를 소개합니다', 'About us'), body: tx(L, '2010년에 작은 공방에서 시작해 지금은 많은 분들이 찾는 곳이 되었습니다.\n\n- 정직한 재료\n- 꼼꼼한 손길\n- 오래가는 품질', 'We started in a small workshop in 2010 and are now loved by many.\n\n- Honest materials\n- Careful hands\n- Lasting quality'),
    image: art('nature', c?.primary, c?.accent, 21), button: tx(L, '이야기 더 보기', 'Read our story'), url: '#', reverse: false }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('body', 'md', '글', 'Text'), f('image', 'image', '그림', 'Picture'), f('button', 'text', '버튼', 'Button'), f('url', 'url', '버튼 주소', 'Button link'), f('reverse', 'toggle', '그림을 오른쪽에', 'Picture on the right')],
  render: (b, p, ctx) => ({ inner: `<div class="hm-split ${p.reverse ? '' : 'reverse'}"><div class="hm-split-text"><h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2><div class="hm-prose"${EM(ctx, 'body')}>${md(p.body)}</div><div class="hm-actions">${btn(ctx, p.button, p.url, 'outline', 'button')}</div></div><div class="hm-split-media">${img(ctx, p.image, p.title, 'image', 'hm-rounded')}</div></div>` }),
});

add('steps', 'content', 'blkSteps', '진행 단계', 'Steps', {
  style: { padTop: 72, padBottom: 72, align: 'center' },
  defaults: (L) => ({ title: tx(L, '이렇게 진행됩니다', 'How it works'), subtitle: '', items: [[tx(L, '상담', 'Talk'), tx(L, '원하시는 것을 듣습니다.', 'We listen to what you need.')], [tx(L, '제안', 'Plan'), tx(L, '맞춤 계획을 드립니다.', 'We propose a plan.')], [tx(L, '완성', 'Deliver'), tx(L, '약속한 날에 전해 드립니다.', 'We deliver on time.')]].map(([title, text]) => ({ title, text })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '부제목', 'Subtitle'), f('items', 'items', '단계', 'Steps', { item: [f('title', 'text', '제목', 'Title'), f('text', 'textarea', '설명', 'Text')], add: () => ({ title: 'Step', text: '…' }) })],
  render: (b, p, ctx) => ({ inner: `${head(ctx, p)}<ol class="hm-steps">${items(p).map((it, i) => `<li${IT(it, i)}><span class="hm-step-no">${i + 1}</span><h3${E(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${E(ctx, `items.${i}.text`)}>${nl(it.text)}</p></li>`).join('')}</ol>` }),
});

add('timeline', 'content', 'blkTimeline', '연혁', 'Timeline', {
  style: { padTop: 72, padBottom: 72, width: 'narrow' },
  defaults: (L) => ({ title: tx(L, '걸어온 길', 'Our journey'), items: [['2018', tx(L, '창업', 'Founded'), tx(L, '세 명이 작은 사무실에서 시작했습니다.', 'Three people in a small office.')], ['2021', tx(L, '첫 해외 진출', 'First overseas office'), tx(L, '도쿄에 지사를 열었습니다.', 'We opened in Tokyo.')], ['2026', tx(L, '고객 1만 명', '10,000 customers'), tx(L, '많은 분들께 감사드립니다.', 'Thank you all.')]].map(([date, title, text]) => ({ date, title, text })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('items', 'items', '항목', 'Entries', { item: [f('date', 'text', '날짜', 'Date'), f('title', 'text', '제목', 'Title'), f('text', 'textarea', '설명', 'Text')], add: () => ({ date: '2026', title: 'Event', text: '…' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<ul class="hm-timeline">${items(p).map((it, i) => `<li${IT(it, i)}><span class="hm-date"${E(ctx, `items.${i}.date`)}>${esc(it.date)}</span><div><h3${E(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${E(ctx, `items.${i}.text`)}>${nl(it.text)}</p></div></li>`).join('')}</ul>` }),
});

add('stats', 'content', 'blkStats', '숫자로 보기', 'Numbers', {
  style: { padTop: 56, padBottom: 56, align: 'center', bg: 'dark' },
  defaults: (L) => ({ items: [['12+', tx(L, '년의 경험', 'years')], ['3,400', tx(L, '만족한 고객', 'happy customers')], ['98%', tx(L, '재방문율', 'return rate')], ['24/7', tx(L, '상담 가능', 'support')]].map(([value, label]) => ({ value, label })) }),
  fields: [f('items', 'items', '숫자', 'Numbers', { item: [f('value', 'text', '숫자', 'Number'), f('label', 'text', '설명', 'Label')], add: () => ({ value: '100', label: '…' }) })],
  render: (b, p, ctx) => ({ inner: `<div class="hm-stats">${items(p).map((it, i) => `<div${IT(it, i)}><b${E(ctx, `items.${i}.value`)}>${esc(it.value)}</b><span${E(ctx, `items.${i}.label`)}>${esc(it.label)}</span></div>`).join('')}</div>` }),
});

add('faq', 'content', 'blkFaq', '자주 묻는 질문', 'FAQ', {
  style: { padTop: 72, padBottom: 72, width: 'narrow' },
  defaults: (L) => ({ title: tx(L, '자주 묻는 질문', 'Frequently asked questions'), items: [[tx(L, '예약은 어떻게 하나요?', 'How do I book?'), tx(L, '전화나 아래 문의 양식으로 예약하실 수 있습니다.', 'Call us or use the contact form below.')], [tx(L, '주차할 수 있나요?', 'Is there parking?'), tx(L, '건물 지하에 무료 주차장이 있습니다.', 'Yes, free parking under the building.')], [tx(L, '환불이 되나요?', 'Can I get a refund?'), tx(L, '7일 안에는 전액 환불해 드립니다.', 'Full refund within 7 days.')]].map(([q, a]) => ({ q, a })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('items', 'items', '질문', 'Questions', { item: [f('q', 'text', '질문', 'Question'), f('a', 'textarea', '답', 'Answer')], add: () => ({ q: '?', a: '…' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<div class="hm-faq">${items(p).map((it, i) => `<details${IT(it, i)}${ctx.editor || i === 0 ? ' open' : ''}><summary${E(ctx, `items.${i}.q`)}>${esc(it.q)}</summary><p${E(ctx, `items.${i}.a`)}>${nl(it.a)}</p></details>`).join('')}</div>` }),
});

// ── bulletin board: a list of posts (notices first), each post's page, categories, search, pages, and a form to write

/** The categories of a board ("공지, 자유, 질문" → ['공지', '자유', '질문']). */
export const boardCategories = (p) => String(p?.categories ?? '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
/** The anchor of a post's own page, and of the board's list. */
const postAnchor = (b, i) => `post-${b.id}-${i}`;
const boardAnchor = (b) => `board-${b.id}`;

/**
 * The board's script on the published site: categories, search and pages over the rows. Without it (no
 * JavaScript, the editor) every row shows and every post still opens by its anchor (CSS :target).
 */
const BOARD_SCRIPT = `(function(b){if(!b)return;var per=+b.getAttribute('data-per-page')||10,page=1,cat='',q='',api=b.getAttribute('data-api'),bid=b.getAttribute('data-board')||'';
var tbody=b.querySelector('tbody'),rows=[].slice.call(b.querySelectorAll('tbody tr[data-post]'));var nav=b.querySelector('.hm-board-pages'),empty=b.querySelector('.hm-board-empty'),search=b.querySelector('.hm-board-search');
var T=JSON.parse(b.getAttribute('data-text')||'{}');function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function draw(){var shown=rows.filter(function(r){return(!cat||r.getAttribute('data-cat')===cat||r.classList.contains('notice'))&&(!q||r.textContent.toLowerCase().indexOf(q)>=0);});var plain=shown.filter(function(r){return!r.classList.contains('notice');});var pages=Math.max(1,Math.ceil(plain.length/per));if(page>pages)page=pages;var on=plain.slice((page-1)*per,page*per);
rows.forEach(function(r){r.hidden=r.classList.contains('notice')?shown.indexOf(r)<0:on.indexOf(r)<0;});if(empty)empty.hidden=shown.length>0;
var h='';for(var i=1;i<=pages;i++)h+='<button type="button" data-board-page="'+i+'"'+(i===page?' aria-current="page"':'')+'>'+i+'</button>';nav.innerHTML=pages>1?h:'';
[].forEach.call(b.querySelectorAll('[data-board-cat]'),function(x){x.setAttribute('aria-pressed',String(x.getAttribute('data-board-cat')===cat));});}
function load(){if(!api)return;fetch(api+'/posts?board='+encodeURIComponent(bid),{headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw r;return r.json();}).then(function(list){var views=!!b.querySelector('th.views');var n=list.filter(function(p){return!p.notice;}).length;
list=list.slice().reverse().sort(function(x,y){return(y.notice?1:0)-(x.notice?1:0);});tbody.innerHTML=list.map(function(p){var no=p.notice?'<span class="hm-board-badge">'+e(T.notice)+'</span>':String(n--);return'<tr data-post="db" data-id="'+e(p.id)+'" data-cat="'+e(p.category)+'" class="'+(p.notice?'notice':'')+'"><td class="no">'+no+'</td><td class="cat">'+e(p.category)+'</td><td class="subject"><a href="#'+b.id+'-db">'+e(p.title)+'</a></td><td class="author">'+e(p.author)+'</td><td class="date">'+e(p.date)+'</td>'+(views?'<td class="views">'+(+p.views||0)+'</td>':'')+'</tr>';}).join('');
rows=[].slice.call(tbody.querySelectorAll('tr[data-post]'));b.setAttribute('data-live','1');draw();}).catch(function(){});}
function open(id){var box=b.querySelector('.hm-post-db');if(!box)return;fetch(api+'/posts/'+encodeURIComponent(id)+'?board='+encodeURIComponent(bid)).then(function(r){if(!r.ok)throw r;return r.json();}).then(function(p){box.innerHTML='<header><span class="hm-board-badge">'+e(p.notice?T.notice:p.category)+'</span><h3>'+e(p.title)+'</h3><p class="hm-post-meta">'+e(p.author)+' · '+e(p.date)+' · '+e(T.views)+' '+(+p.views||0)+'</p></header><div class="hm-post-body">'+e(p.body).replace(/\\n/g,'<br>')+'</div><footer><a class="hm-btn hm-btn-outline" href="#'+b.id+'">'+e(T.back)+'</a></footer>';location.hash=b.id+'-db';}).catch(function(){});}
b.addEventListener('click',function(ev){var t=ev.target.closest('[data-board-page],[data-board-cat],tr[data-id] a');if(!t)return;if(t.hasAttribute('data-board-page'))page=+t.getAttribute('data-board-page');else if(t.hasAttribute('data-board-cat')){cat=t.getAttribute('data-board-cat');page=1;}else{ev.preventDefault();open(t.closest('tr').getAttribute('data-id'));return;}draw();});
var form=b.querySelector('.hm-board-write');if(api&&form)form.addEventListener('submit',function(ev){ev.preventDefault();var d={board:bid};[].forEach.call(form.elements,function(x){if(x.name)d[x.name]=x.value;});var note=form.querySelector('.hm-board-note');
fetch(api+'/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){if(!r.ok)throw r;form.reset();if(note)note.textContent=T.sent;load();location.hash=b.id;}).catch(function(){if(note)note.textContent=T.failed;});});
if(search)search.addEventListener('input',function(){q=search.value.trim().toLowerCase();page=1;draw();});draw();load();})(document.currentScript&&document.currentScript.closest('.hm-board'));`;

add('board', 'content', 'blkBoard', '게시판', 'Bulletin board', {
  style: { padTop: 64, padBottom: 64 },
  defaults: (L) => ({
    title: tx(L, '게시판', 'Board'), subtitle: tx(L, '소식과 질문을 나누는 곳입니다.', 'News and questions, shared.'),
    categories: tx(L, '공지, 자유, 질문', 'Notice, General, Question'), perPage: 10, search: true, views: true,
    storage: 'site', api: '/api/board', write: true, writeLabel: tx(L, '글쓰기', 'Write'), endpoint: '', email: 'hello@example.com',
    items: [
      [tx(L, '게시판 이용 안내', 'How to use the board'), tx(L, '공지', 'Notice'), tx(L, '관리자', 'Admin'), '2026-11-01', 128, true, tx(L, '서로 존중하는 글을 남겨 주세요.\n광고와 비방 글은 알리지 않고 지웁니다.', 'Please be kind to each other.\nAds and abuse are removed without notice.')],
      [tx(L, '새 홈페이지를 열었습니다', 'Our new website is open'), tx(L, '공지', 'Notice'), tx(L, '관리자', 'Admin'), '2026-11-05', 96, false, tx(L, '새 홈페이지에서 소식과 자료를 더 쉽게 찾을 수 있습니다.', 'News and files are easier to find on the new website.')],
      [tx(L, '주말에도 문의할 수 있나요?', 'Can I ask at the weekend?'), tx(L, '질문', 'Question'), tx(L, '김하늘', 'Emma'), '2026-11-06', 42, false, tx(L, '토요일에도 답을 받을 수 있는지 궁금합니다.', 'I wonder whether questions are answered on Saturdays.')],
      [tx(L, '모임 사진을 올립니다', 'Photos from our meetup'), tx(L, '자유', 'General'), tx(L, '이준호', 'Liam'), '2026-11-07', 57, false, tx(L, '함께해 주신 모든 분께 감사드립니다.', 'Thank you all for coming.')],
      [tx(L, '자료실은 어디에 있나요?', 'Where are the downloads?'), tx(L, '질문', 'Question'), tx(L, '박서연', 'Olivia'), '2026-11-08', 23, false, tx(L, '지난 발표 자료를 받고 싶습니다.', 'I would like the slides of the last talk.')],
    ].map(([title, category, author, date, views, notice, body]) => ({ title, category, author, date, views, notice, body })),
  }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '설명', 'Text'), f('categories', 'text', '분류(쉼표로 나눔)', 'Categories (comma separated)'),
    f('perPage', 'select', '한 쪽에 보일 글', 'Posts per page', { options: [opt(5, '5개', '5'), opt(10, '10개', '10'), opt(15, '15개', '15'), opt(20, '20개', '20')] }),
    f('search', 'toggle', '검색 상자', 'Search box'), f('views', 'toggle', '조회 수 보이기', 'Show views'),
    f('storage', 'select', '글 저장 위치', 'Posts are kept', { options: [opt('site', '사이트 안(정적)', 'In the site (static)'), opt('database', '데이터베이스(게시판 서버)', 'Database (board server)')] }),
    f('api', 'url', '게시판 서버 주소', 'Board server address'),
    f('db', 'actions', '데이터베이스', 'Database', { buttons: [{ command: 'boardDbLoad', icon: 'dbOpen', label: 'action.boardDbLoad' }, { command: 'boardDbSave', icon: 'dbSave', label: 'action.boardDbSave' }, { command: 'dbSettings', icon: 'database', label: 'action.dbSettings' }] }),
    f('write', 'toggle', '글쓰기 버튼', 'Write button'), f('writeLabel', 'text', '글쓰기 버튼 이름', 'Write button label'),
    f('endpoint', 'url', '글 보낼 주소(비우면 메일)', 'Form endpoint (empty: e-mail)'), f('email', 'text', '받을 이메일', 'E-mail'),
    f('items', 'items', '글', 'Posts', { item: [f('title', 'text', '제목', 'Title'), f('category', 'text', '분류', 'Category'), f('author', 'text', '글쓴이', 'Author'), f('date', 'text', '날짜', 'Date'),
      f('views', 'number', '조회 수', 'Views', { min: 0, max: 9999999 }), f('notice', 'toggle', '공지(맨 위에 고정)', 'Notice (pinned)'), f('body', 'md', '내용', 'Text')],
    add: () => ({ title: '…', category: '', author: '', date: new Date().toISOString().slice(0, 10), views: 0, notice: false, body: '' }) })],
  render: (b, p, ctx) => {
    const L = ctx.L;
    const list = items(p);
    const cats = boardCategories(p);
    // Notices first; the others numbered from the newest (last added) down.
    const order = [...list.keys()].sort((a, c) => Number(Boolean(list[c].notice)) - Number(Boolean(list[a].notice)) || c - a);
    let number = list.filter((it) => !it.notice).length;
    const views = p.views !== false;
    const rows = order.map((i) => {
      const it = list[i];
      const no = it.notice ? `<span class="hm-board-badge">${esc(tx(L, '공지', 'Notice'))}</span>` : String(number--);
      return `<tr data-post="${i}" data-cat="${esc(String(it.category ?? '').trim())}" class="${it.notice ? 'notice' : ''}"><td class="no">${no}</td><td class="cat"${E(ctx, `items.${i}.category`)}>${esc(it.category)}</td><td class="subject"><a href="#${postAnchor(b, i)}"${E(ctx, `items.${i}.title`)}>${esc(it.title)}</a></td><td class="author"${E(ctx, `items.${i}.author`)}>${esc(it.author)}</td><td class="date"${E(ctx, `items.${i}.date`)}>${esc(it.date)}</td>${views ? `<td class="views">${esc(Number(it.views) || 0)}</td>` : ''}</tr>`;
    }).join('');
    const tools = `<div class="hm-board-bar">${cats.length ? `<div class="hm-board-cats"><button type="button" data-board-cat="" aria-pressed="true">${esc(tx(L, '전체', 'All'))}</button>${cats.map((c) => `<button type="button" data-board-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>` : '<span></span>'}
      <div class="hm-board-tools">${p.search !== false ? `<input type="search" class="hm-board-search" placeholder="${esc(tx(L, '제목·내용 검색', 'Search posts'))}" aria-label="${esc(tx(L, '검색', 'Search'))}" />` : ''}${p.write !== false ? `<a class="hm-btn hm-btn-primary" href="#${boardAnchor(b)}-write"${E(ctx, 'writeLabel')}>${esc(p.writeLabel || tx(L, '글쓰기', 'Write'))}</a>` : ''}</div></div>`;
    const table = `<table class="hm-board-table"><thead><tr><th class="no">${esc(tx(L, '번호', 'No.'))}</th><th class="cat">${esc(tx(L, '분류', 'Category'))}</th><th class="subject">${esc(tx(L, '제목', 'Title'))}</th><th class="author">${esc(tx(L, '글쓴이', 'Author'))}</th><th class="date">${esc(tx(L, '날짜', 'Date'))}</th>${views ? `<th class="views">${esc(tx(L, '조회', 'Views'))}</th>` : ''}</tr></thead>
      <tbody>${rows}</tbody></table><p class="hm-board-empty" hidden>${esc(tx(L, '글이 없습니다.', 'No posts.'))}</p><nav class="hm-board-pages" aria-label="${esc(tx(L, '쪽', 'Pages'))}"></nav>`;
    const back = `<a class="hm-btn hm-btn-outline" href="#${boardAnchor(b)}">${esc(tx(L, '목록으로', 'Back to the list'))}</a>`;
    const posts = ctx.editor ? '' : list.map((it, i) => `<article class="hm-post hm-card" id="${postAnchor(b, i)}"><header><span class="hm-board-badge">${esc(it.notice ? tx(L, '공지', 'Notice') : it.category)}</span><h3>${esc(it.title)}</h3><p class="hm-post-meta">${esc(it.author)} · ${esc(it.date)}${views ? ` · ${esc(tx(L, '조회', 'Views'))} ${esc(Number(it.views) || 0)}` : ''}</p></header><div class="hm-post-body">${md(it.body)}</div><footer>${back}</footer></article>`).join('');
    const live = p.storage === 'database';
    const action = live ? `${safeUrl(p.api || '/api/board')}/posts` : p.endpoint ? safeUrl(p.endpoint) : `mailto:${p.email ?? ''}`;
    const write = p.write !== false && !ctx.editor ? `<form class="hm-post hm-card hm-form hm-board-write" id="${boardAnchor(b)}-write" method="post" action="${esc(action)}"${p.endpoint || live ? '' : ' enctype="text/plain"'}>
      <h3>${esc(p.writeLabel || tx(L, '글쓰기', 'Write'))}</h3><p class="hm-post-meta">${esc(tx(L, '보내 주신 글은 확인한 뒤 게시판에 올립니다.', 'Posts are published after they are checked.'))}</p>
      ${cats.length ? `<label>${esc(tx(L, '분류', 'Category'))}<select name="category">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>` : ''}
      <label>${esc(tx(L, '제목', 'Title'))}<input name="title" required /></label><label>${esc(tx(L, '이름', 'Name'))}<input name="name" required /></label><label>${esc(tx(L, '이메일', 'E-mail'))}<input type="email" name="email" /></label>
      <label>${esc(tx(L, '내용', 'Text'))}<textarea name="message" rows="6" required></textarea></label>
      <p class="hm-board-note" aria-live="polite"></p><div class="hm-board-actions"><button class="hm-btn hm-btn-primary" type="submit">${esc(tx(L, '보내기', 'Send'))}</button>${back}</div></form>` : '';
    const script = ctx.editor ? '' : `<script>${BOARD_SCRIPT}</script>`;
    const liveBox = live && !ctx.editor ? `<article class="hm-post hm-card hm-post-db" id="${boardAnchor(b)}-db"></article>` : '';
    const texts = esc(JSON.stringify({ notice: tx(L, '공지', 'Notice'), views: tx(L, '조회', 'Views'), back: tx(L, '목록으로', 'Back to the list'), sent: tx(L, '글을 올렸습니다.', 'Your post is up.'), failed: tx(L, '글을 보내지 못했습니다. 잠시 뒤 다시 해 보세요.', 'The post could not be sent. Please try again later.') }));
    const liveAttrs = live && !ctx.editor ? ` data-api="${esc(safeUrl(p.api || '/api/board').replace(/\/+$/, ''))}" data-board="${esc(b.id)}"` : '';
    return { inner: `<div class="hm-board" id="${boardAnchor(b)}" data-per-page="${esc(Number(p.perPage) || 10)}" data-text="${texts}"${liveAttrs}>${head(ctx, p)}${tools}${table}${posts}${liveBox}${write}${script}</div>` };
  },
});

// ── showcase

add('gallery', 'showcase', 'blkGallery', '사진첩', 'Gallery', {
  style: { padTop: 72, padBottom: 72 },
  defaults: (L, c) => ({ title: tx(L, '사진첩', 'Gallery'), columns: 3, items: ['landscape', 'city', 'sea', 'nature', 'abstract', 'pattern'].map((kind, i) => ({ image: art(kind, c?.primary, c?.accent, 31 + i), caption: '' })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('columns', 'select', '단 수', 'Columns', { options: COLS }), f('items', 'items', '사진', 'Pictures', { item: [f('image', 'image', '그림', 'Picture'), f('caption', 'text', '설명', 'Caption')], add: () => ({ image: '', caption: '' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title hm-center"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<div class="hm-gallery cols-${cols(p.columns)}">${items(p).map((it, i) => `<figure${IT(it, i)}>${img(ctx, it.image, it.caption, `items.${i}.image`)}${it.caption ? `<figcaption${E(ctx, `items.${i}.caption`)}>${esc(it.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` }),
});

add('testimonials', 'showcase', 'blkTestimonials', '고객 후기', 'Testimonials', {
  style: { padTop: 80, padBottom: 80, bg: 'surface', align: 'center' },
  defaults: (L, c) => ({ title: tx(L, '고객들의 이야기', 'What people say'), items: [[tx(L, '정말 친절하고 꼼꼼했어요. 다음에도 꼭 다시 올게요!', 'So kind and careful. I will definitely come back!'), tx(L, '김하늘', 'Emma Stone'), tx(L, '회사원', 'Designer')], [tx(L, '기대 이상의 결과에 놀랐습니다.', 'The result was beyond my expectations.'), tx(L, '이준호', 'Liam Park'), tx(L, '대표', 'CEO')], [tx(L, '주변에 벌써 세 명이나 소개했어요.', 'I already told three friends about it.'), tx(L, '박서연', 'Olivia Kim'), tx(L, '학생', 'Student')]].map(([quote, name, role], i) => ({ quote, name, role, image: art('portrait', c?.primary, c?.accent, 41 + i) })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('items', 'items', '후기', 'Reviews', { item: [f('quote', 'textarea', '후기', 'Review'), f('name', 'text', '이름', 'Name'), f('role', 'text', '직업', 'Role'), f('image', 'image', '사진', 'Photo')], add: () => ({ quote: '…', name: 'Name', role: '', image: '' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<div class="hm-grid cols-${cols(Math.min(3, items(p).length || 3))}">${items(p).map((it, i) => `<figure${IT(it, i)} class="hm-card hm-testimonial"><blockquote${E(ctx, `items.${i}.quote`)}>“${nl(it.quote)}”</blockquote><figcaption>${img(ctx, it.image, it.name, `items.${i}.image`, 'hm-avatar')}<span><b${E(ctx, `items.${i}.name`)}>${esc(it.name)}</b><small${E(ctx, `items.${i}.role`)}>${esc(it.role)}</small></span></figcaption></figure>`).join('')}</div>` }),
});

add('team', 'showcase', 'blkTeam', '팀 소개', 'Team', {
  style: { padTop: 80, padBottom: 80, align: 'center' },
  defaults: (L, c) => ({ title: tx(L, '함께하는 사람들', 'Meet the team'), columns: 4, items: [[tx(L, '최민수', 'Noah Lee'), tx(L, '대표', 'Founder')], [tx(L, '정유진', 'Ava Choi'), tx(L, '디자이너', 'Designer')], [tx(L, '한지호', 'Mason Han'), tx(L, '개발자', 'Developer')], [tx(L, '윤가은', 'Mia Yoon'), tx(L, '매니저', 'Manager')]].map(([name, role], i) => ({ name, role, text: '', image: art('portrait', c?.primary, c?.accent, 51 + i) })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('columns', 'select', '단 수', 'Columns', { options: COLS }), f('items', 'items', '사람', 'People', { item: [f('image', 'image', '사진', 'Photo'), f('name', 'text', '이름', 'Name'), f('role', 'text', '역할', 'Role'), f('text', 'textarea', '소개', 'About')], add: () => ({ image: '', name: 'Name', role: '', text: '' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<div class="hm-grid cols-${cols(p.columns)}">${items(p).map((it, i) => `<div${IT(it, i)} class="hm-person">${img(ctx, it.image, it.name, `items.${i}.image`, 'hm-avatar big')}<h3${E(ctx, `items.${i}.name`)}>${esc(it.name)}</h3><p class="hm-role"${E(ctx, `items.${i}.role`)}>${esc(it.role)}</p>${it.text ? `<p${E(ctx, `items.${i}.text`)}>${nl(it.text)}</p>` : ''}</div>`).join('')}</div>` }),
});

add('logos', 'showcase', 'blkLogos', '함께하는 곳', 'Logos', {
  style: { padTop: 40, padBottom: 40, align: 'center' },
  defaults: (L) => ({ title: tx(L, '함께하는 기업', 'Trusted by'), items: ['NORTHWIND', 'CONTOSO', 'FABRIKAM', 'ADVENTURE', 'LITWARE'].map((name) => ({ name, image: '' })) }),
  fields: [f('title', 'text', '제목', 'Title'), f('items', 'items', '로고', 'Logos', { item: [f('name', 'text', '이름', 'Name'), f('image', 'image', '로고 그림(없으면 이름)', 'Logo picture (else the name)')], add: () => ({ name: 'BRAND', image: '' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<p class="hm-eyebrow"${E(ctx, 'title')}>${esc(p.title)}</p>` : ''}<div class="hm-logos">${items(p).map((it, i) => (it.image ? `<img src="${esc(safeUrl(it.image))}" alt="${esc(it.name)}"${ctx.editor ? ` data-edit-image="items.${i}.image"` : ''} />` : `<span${E(ctx, `items.${i}.name`)}>${esc(it.name)}</span>`)).join('')}</div>` }),
});

add('pricing', 'showcase', 'blkPricing', '가격표', 'Pricing', {
  style: { padTop: 80, padBottom: 80, align: 'center' },
  defaults: (L) => ({ title: tx(L, '요금 안내', 'Pricing'), subtitle: tx(L, '필요에 맞게 고르세요', 'Choose what fits you'), items: [
    { name: tx(L, '기본', 'Basic'), price: tx(L, '9,900원', '$9'), period: tx(L, '/월', '/mo'), features: tx(L, '기본 기능\n이메일 지원', 'Core features\nE-mail support'), button: tx(L, '선택', 'Choose'), url: '#', featured: false },
    { name: tx(L, '프로', 'Pro'), price: tx(L, '19,900원', '$19'), period: tx(L, '/월', '/mo'), features: tx(L, '모든 기능\n우선 지원\n통계 보고서', 'Everything\nPriority support\nReports'), button: tx(L, '가장 인기', 'Most popular'), url: '#', featured: true },
    { name: tx(L, '기업', 'Business'), price: tx(L, '문의', 'Ask'), period: '', features: tx(L, '맞춤 기능\n전담 매니저', 'Custom features\nDedicated manager'), button: tx(L, '상담', 'Contact'), url: '#contact', featured: false },
  ] }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('subtitle', 'textarea', '부제목', 'Subtitle'), f('items', 'items', '요금제', 'Plans', { item: [f('name', 'text', '이름', 'Name'), f('price', 'text', '가격', 'Price'), f('period', 'text', '기간', 'Period'), f('features', 'textarea', '포함(한 줄에 하나)', 'Includes (one per line)'), f('button', 'text', '버튼', 'Button'), f('url', 'url', '버튼 주소', 'Button link'), f('featured', 'toggle', '강조', 'Highlight')], add: () => ({ name: 'Plan', price: '0', period: '', features: '', button: 'Choose', url: '#', featured: false }) })],
  render: (b, p, ctx) => ({ inner: `${head(ctx, p)}<div class="hm-grid cols-${cols(items(p).length || 3)}">${items(p).map((it, i) => `<div${IT(it, i)} class="hm-card hm-plan ${it.featured ? 'featured' : ''}"><h3${E(ctx, `items.${i}.name`)}>${esc(it.name)}</h3><p class="hm-price"><b${E(ctx, `items.${i}.price`)}>${esc(it.price)}</b><span${E(ctx, `items.${i}.period`)}>${esc(it.period)}</span></p><ul>${String(it.features ?? '').split(/\r?\n/).filter((x) => x.trim()).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${btn(ctx, it.button, it.url, it.featured ? 'primary' : 'outline', `items.${i}.button`)}</div>`).join('')}</div>` }),
});

add('menu', 'showcase', 'blkMenu', '메뉴판', 'Menu', {
  style: { padTop: 72, padBottom: 72, width: 'narrow' },
  defaults: (L) => ({ title: tx(L, '메뉴', 'Menu'), items: [[tx(L, '아메리카노', 'Americano'), tx(L, '깊고 고소한 맛', 'Deep and nutty'), '4,500'], [tx(L, '카페 라테', 'Café latte'), tx(L, '부드러운 우유 거품', 'Silky milk foam'), '5,000'], [tx(L, '수제 케이크', 'House cake'), tx(L, '매일 아침 굽습니다', 'Baked every morning'), '6,500'], [tx(L, '샌드위치', 'Sandwich'), tx(L, '신선한 채소와 햄', 'Fresh greens and ham'), '7,800']].map(([name, desc, price]) => ({ name, desc, price })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('items', 'items', '메뉴', 'Dishes', { item: [f('name', 'text', '이름', 'Name'), f('desc', 'text', '설명', 'Description'), f('price', 'text', '가격', 'Price')], add: () => ({ name: 'Dish', desc: '', price: '0' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title hm-center"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<ul class="hm-menu">${items(p).map((it, i) => `<li${IT(it, i)}><div><b${E(ctx, `items.${i}.name`)}>${esc(it.name)}</b><small${E(ctx, `items.${i}.desc`)}>${esc(it.desc)}</small></div><span class="hm-dots"></span><span class="hm-menu-price"${E(ctx, `items.${i}.price`)}>${esc(it.price)}</span></li>`).join('')}</ul>` }),
});

add('events', 'showcase', 'blkEvents', '일정', 'Events', {
  style: { padTop: 72, padBottom: 72, width: 'narrow' },
  defaults: (L) => ({ title: tx(L, '다가오는 일정', 'Upcoming events'), items: [['11.21', '19:00', tx(L, '가을 음악회', 'Autumn concert'), tx(L, '시민회관 대강당', 'City hall')], ['12.05', '14:00', tx(L, '작품 전시회', 'Art exhibition'), tx(L, '2층 갤러리', 'Gallery, 2F')], ['12.24', '18:30', tx(L, '성탄 축제', 'Christmas festival'), tx(L, '중앙 광장', 'Central square')]].map(([date, time, title, place]) => ({ date, time, title, place })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('items', 'items', '일정', 'Events', { item: [f('date', 'text', '날짜', 'Date'), f('time', 'text', '시간', 'Time'), f('title', 'text', '제목', 'Title'), f('place', 'text', '장소', 'Place')], add: () => ({ date: '1.1', time: '', title: 'Event', place: '' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<ul class="hm-events">${items(p).map((it, i) => `<li${IT(it, i)}><span class="hm-event-date"><b${E(ctx, `items.${i}.date`)}>${esc(it.date)}</b><small${E(ctx, `items.${i}.time`)}>${esc(it.time)}</small></span><span><h3${E(ctx, `items.${i}.title`)}>${esc(it.title)}</h3><p${E(ctx, `items.${i}.place`)}>${esc(it.place)}</p></span></li>`).join('')}</ul>` }),
});

add('blog', 'showcase', 'blkBlog', '글 목록', 'Posts', {
  style: { padTop: 72, padBottom: 72 },
  defaults: (L, c) => ({ title: tx(L, '최근 소식', 'Latest news'), columns: 3, items: [[tx(L, '새 매장을 열었습니다', 'We opened a new store'), '2026.10.02', 'city'], [tx(L, '가을 신메뉴 소개', 'New autumn menu'), '2026.09.18', 'food'], [tx(L, '봉사 활동 이야기', 'A day of volunteering'), '2026.08.30', 'nature']].map(([title, date, kind], i) => ({ image: art(kind, c?.primary, c?.accent, 61 + i), date, title, text: tx(L, '자세한 이야기를 지금 읽어 보세요.', 'Read the whole story now.'), url: '#' })) }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('columns', 'select', '단 수', 'Columns', { options: COLS }), f('items', 'items', '글', 'Posts', { item: [f('image', 'image', '그림', 'Picture'), f('date', 'text', '날짜', 'Date'), f('title', 'text', '제목', 'Title'), f('text', 'textarea', '요약', 'Summary'), f('url', 'url', '주소', 'Link')], add: () => ({ image: '', date: '', title: 'Post', text: '', url: '#' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${nl(p.title)}</h2>` : ''}<div class="hm-grid cols-${cols(p.columns)}">${items(p).map((it, i) => `<article${IT(it, i)} class="hm-card hm-media-card">${img(ctx, it.image, it.title, `items.${i}.image`, 'hm-card-img')}<div class="hm-card-body"><small class="hm-date"${E(ctx, `items.${i}.date`)}>${esc(it.date)}</small><h3><a href="${esc(safeUrl(it.url))}"${E(ctx, `items.${i}.title`)}>${esc(it.title)}</a></h3><p${E(ctx, `items.${i}.text`)}>${nl(it.text)}</p></div></article>`).join('')}</div>` }),
});

// ── contact & social

add('contact', 'contact', 'blkContact', '문의·연락처', 'Contact', {
  style: { padTop: 80, padBottom: 80, bg: 'surface' },
  defaults: (L) => ({ title: tx(L, '문의하기', 'Contact us'), text: tx(L, '궁금한 점을 남겨 주시면 하루 안에 답해 드립니다.', 'Leave a message and we will answer within a day.'),
    address: tx(L, '서울특별시 중구 세종대로 110', '110 Main Street, Springfield'), phone: '02-123-4567', email: 'hello@example.com', hours: tx(L, '평일 09:00 – 18:00', 'Mon–Fri 9am – 6pm'),
    form: true, endpoint: '', button: tx(L, '보내기', 'Send'), map: '' }),
  fields: [f('title', 'textarea', '제목', 'Title'), f('text', 'textarea', '설명', 'Text'), f('address', 'text', '주소', 'Address'), f('phone', 'text', '전화', 'Phone'), f('email', 'text', '이메일', 'E-mail'), f('hours', 'text', '운영 시간', 'Opening hours'),
    f('form', 'toggle', '문의 양식 보이기', 'Show the form'), f('endpoint', 'url', '양식 보낼 주소(비우면 메일)', 'Form endpoint (empty: e-mail)'), f('button', 'text', '보내기 버튼', 'Send button'), f('map', 'text', '지도 장소(비우면 없음)', 'Map place (empty: none)')],
  render: (b, p, ctx) => {
    const action = p.endpoint ? safeUrl(p.endpoint) : `mailto:${p.email ?? ''}`;
    const L = ctx.L;
    const info = `<div class="hm-contact-info">${head(ctx, { title: p.title, subtitle: p.text }, { subtitle: 'text' })}<ul>${p.address ? `<li><span>📍</span><span${E(ctx, 'address')}>${esc(p.address)}</span></li>` : ''}${p.phone ? `<li><span>📞</span><a href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ''))}"${E(ctx, 'phone')}>${esc(p.phone)}</a></li>` : ''}${p.email ? `<li><span>✉️</span><a href="mailto:${esc(p.email)}"${E(ctx, 'email')}>${esc(p.email)}</a></li>` : ''}${p.hours ? `<li><span>🕘</span><span${E(ctx, 'hours')}>${esc(p.hours)}</span></li>` : ''}</ul>${p.map ? `<div class="hm-map small"><iframe src="${esc(mapUrl(p.map))}" title="map" loading="lazy"></iframe></div>` : ''}</div>`;
    const form = p.form ? `<form class="hm-card hm-form" method="post" action="${esc(action)}"${p.endpoint ? '' : ' enctype="text/plain"'}><label>${esc(tx(L, '이름', 'Name'))}<input name="name" required /></label><label>${esc(tx(L, '이메일', 'E-mail'))}<input type="email" name="email" required /></label><label>${esc(tx(L, '내용', 'Message'))}<textarea name="message" rows="5" required></textarea></label><button class="hm-btn hm-btn-primary" type="submit"${E(ctx, 'button')}>${esc(p.button)}</button></form>` : '';
    return { inner: `<div class="hm-split ${p.form ? '' : 'single'}">${info}${form}</div>` };
  },
});

add('social', 'contact', 'blkSocial', '소셜 링크', 'Social links', {
  style: { padTop: 40, padBottom: 40, align: 'center' },
  defaults: (L) => ({ title: tx(L, '우리를 팔로우하세요', 'Follow us'), items: [['Instagram', 'https://instagram.com'], ['YouTube', 'https://youtube.com'], ['Facebook', 'https://facebook.com'], ['X', 'https://x.com']].map(([label, url]) => ({ label, url })) }),
  fields: [f('title', 'text', '제목', 'Title'), f('items', 'items', '링크', 'Links', { item: [f('label', 'text', '이름', 'Name'), f('url', 'url', '주소', 'Link')], add: () => ({ label: 'Link', url: 'https://' }) })],
  render: (b, p, ctx) => ({ inner: `${p.title ? `<h2 class="hm-title"${E(ctx, 'title')}>${esc(p.title)}</h2>` : ''}<div class="hm-social-pills">${items(p).map((it, i) => `<a${IT(it, i)} href="${esc(safeUrl(it.url))}"${E(ctx, `items.${i}.label`)}>${esc(it.label)}</a>`).join('')}</div>` }),
});

/** Every block kind (navbar and footer included). */
export const BLOCKS = DEF;
export const BLOCK_TYPES = Object.keys(DEF);
/** The kinds the Blocks panel offers for a page (the header and footer belong to the site). */
export const PAGE_BLOCK_TYPES = BLOCK_TYPES.filter((type) => !DEF[type].global);
export const blockDef = (type) => DEF[type] ?? null;
export const blockLabel = (type, L) => (DEF[type] ? (L === 'en' ? DEF[type].en : DEF[type].ko) : type);
export const fieldLabel = (field, L) => (L === 'en' ? field.en : field.ko);

// ───────────────────────── block style (the Style tab)

export const STYLE_BACKGROUNDS = ['', 'surface', 'primary', 'accent', 'dark', 'footer', 'custom'];
export const STYLE_ALIGNS = ['left', 'center', 'right'];
export const STYLE_WIDTHS = ['narrow', 'normal', 'wide', 'full'];

export const defaultStyle = () => ({ bg: '', bgColor: '', color: '', bgImage: '', overlay: 0, padTop: 64, padBottom: 64, align: 'left', width: 'normal', anchor: '', hidden: false, hideMobile: false, radius: false });

/** A block's style with every value in range. */
export function normalizeStyle(style = {}, def = null) {
  const s = { ...defaultStyle(), ...(def?.style ?? {}), ...(style && typeof style === 'object' ? style : {}) };
  const num = (v, min, max, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fb; };
  s.bg = STYLE_BACKGROUNDS.includes(s.bg) ? s.bg : '';
  s.bgColor = /^#[0-9a-f]{6}$/i.test(String(s.bgColor)) ? s.bgColor : '';
  s.color = /^#[0-9a-f]{6}$/i.test(String(s.color)) ? s.color : '';
  s.bgImage = typeof s.bgImage === 'string' ? s.bgImage : '';
  s.overlay = num(s.overlay, 0, 90, 0);
  s.padTop = num(s.padTop, 0, 320, 64);
  s.padBottom = num(s.padBottom, 0, 320, 64);
  s.align = STYLE_ALIGNS.includes(s.align) ? s.align : 'left';
  s.width = STYLE_WIDTHS.includes(s.width) ? s.width : 'normal';
  s.anchor = String(s.anchor ?? '').replace(/[^\w-]/g, '').slice(0, 40);
  s.hidden = s.hidden === true;
  s.hideMobile = s.hideMobile === true;
  s.radius = s.radius === true;
  return s;
}

/** The block as HTML. ctx: { editor, site, page, pages, L, selected }. */
export function renderBlock(block, ctx) {
  const def = blockDef(block.type);
  if (!def) return '';
  const s = normalizeStyle(block.style, def);
  if (s.hidden && !ctx.editor) return '';
  const previous = RENDER;
  RENDER = { editor: Boolean(ctx.editor), props: block.props ?? {} };
  let out;
  try { out = def.render(block, block.props ?? {}, ctx) ?? {}; } finally { RENDER = previous; }
  const tag = out.tag ?? 'section';
  const bg = s.bg === 'custom' && s.bgColor ? '' : s.bg;
  const classes = ['hm-block', `hm-${block.type}`, bg ? `tone-${bg}` : '', `align-${s.align}`, `w-${s.width}`, s.hideMobile ? 'hm-hide-mobile' : '', s.hidden ? 'hm-hidden' : '', s.radius ? 'hm-round-block' : '', out.cls ?? ''].filter(Boolean).join(' ');
  const styles = [`--pt:${s.padTop}px`, `--pb:${s.padBottom}px`];
  if (s.bg === 'custom' && s.bgColor) styles.push(`background-color:${s.bgColor}`);
  if (s.color) styles.push(`color:${s.color}`);
  const image = s.bgImage || out.bgImage;
  if (image) {
    const shade = (s.bgImage ? s.overlay : Number(out.overlay ?? s.overlay)) / 100;
    styles.push(`background-image:${shade > 0 ? `linear-gradient(rgba(0,0,0,${shade}),rgba(0,0,0,${shade})),` : ''}url("${String(safeUrl(image)).replace(/"/g, '%22')}")`, 'background-size:cover', 'background-position:center');
  }
  const id = s.anchor || (block.type === 'contact' ? 'contact' : '');
  const attrs = `${id ? ` id="${esc(id)}"` : ''} class="${esc(classes)}${image ? ' has-image' : ''}" style="${esc(styles.join(';'))}"${ctx.editor ? ` data-block-id="${esc(block.id)}" data-block-type="${esc(block.type)}"` : ''}`;
  return `<${tag}${attrs}><div class="hm-wrap">${out.inner ?? ''}</div></${tag}>`;
}

/** The text fields that are button labels: the Content tab shows their button properties. */
const BUTTON_FIELDS = { navbar: ['ctaLabel'], hero: ['button1', 'button2'], heroSplit: ['button1'], cta: ['button'], button: ['label'], mediaText: ['button'], pricing: ['items/button'] };
for (const [type, keys] of Object.entries(BUTTON_FIELDS)) {
  for (const key of keys) {
    const [a, b] = key.split('/');
    const top = DEF[type]?.fields.find((x) => x.key === a);
    const field = b ? top?.item?.find((x) => x.key === b) : top;
    if (field) field.button = true;
  }
}
