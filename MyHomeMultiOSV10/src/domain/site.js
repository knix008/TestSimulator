// The website being made: its pages, each a list of blocks, plus one header and one footer that
// every page shows, the site's information (title, description, language) and its design.
// A project file (.myhome) is this object as JSON.
import { BLOCK_TYPES, blockDef, normalizeStyle } from './blocks.js';
import { DESIGN_IDS, DESIGNS, designById, effectiveDesign } from './designs.js';

export const FORMAT = 'myhomemaker';
export const VERSION = 1;

let counter = 0;
/** A short unique id ("b-lq3k9-2"). */
export const newId = (prefix = 'b') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-${(counter += 1).toString(36)}`;

const clone = (value) => JSON.parse(JSON.stringify(value));

/** A new block of a kind, filled with its starting content in the given language and design. */
export function createBlock(type, { L = 'ko', design = null, props = {}, style = {} } = {}) {
  const def = blockDef(type);
  if (!def) throw new Error(`unknown block ${type}`);
  const colors = effectiveDesign(design ?? { id: DESIGNS[0].id });
  return { id: newId(type === 'navbar' ? 'h' : type === 'footer' ? 'f' : 'b'), type, props: { ...def.defaults(L, colors), ...props }, style: normalizeStyle({ ...def.style, ...style }, def) };
}

/** Common Korean page names and the file names they get (a web address is safest in plain letters). */
const KOREAN_SLUGS = {
  홈: 'index', 메인: 'index', '회사 소개': 'about', 소개: 'about', '우리 이야기': 'about', 글쓴이: 'about', 서비스: 'services', 상품: 'shop', 쇼핑: 'shop',
  문의: 'contact', 연락: 'contact', 연락처: 'contact', 메뉴: 'menu', 작업: 'work', 작품: 'work', 포트폴리오: 'portfolio', '오시는 길': 'visit', 이야기: 'story',
  블로그: 'blog', 소식: 'news', 공지: 'notice', 강사진: 'teachers', 수강료: 'fees', '진료 안내': 'visit', 일정: 'schedule', 갤러리: 'gallery', 사진: 'photos',
  요금: 'pricing', 가격: 'pricing', 자주묻는질문: 'faq', '자주 묻는 질문': 'faq', 팀: 'team', 채용: 'careers', 예약: 'booking',
};

/** "About us" → "about-us"; a known Korean name → its English file name; other letters are dropped. Never empty. */
export function slugify(text, fallback = 'page') {
  const raw = String(text ?? '').trim();
  if (KOREAN_SLUGS[raw]) return KOREAN_SLUGS[raw];
  const slug = raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
}

/** A slug no other page uses ("about", "about-2" …); the first page is always "index". */
export function uniqueSlug(site, wanted, exceptId = null) {
  const taken = new Set(site.pages.filter((p) => p.id !== exceptId).map((p) => p.slug));
  let slug = slugify(wanted);
  if (slug === 'index' && site.pages[0]?.id !== exceptId && site.pages.length) slug = 'home';
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n += 1) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

export function createPage(site, { name = 'Page', slug = null, blocks = [], title = '', description = '' } = {}) {
  return { id: newId('p'), name, slug: slug ?? uniqueSlug(site, name), title, description, nav: true, blocks };
}

/** The site's own code, written in the code editor: CSS after the design's style sheet, JavaScript at the end of every page, HTML in every <head>. */
export const CODE_FIELDS = ['css', 'js', 'head'];
export const emptyCode = () => ({ css: '', js: '', head: '' });
export function normalizeCode(raw) {
  const code = emptyCode();
  for (const key of CODE_FIELDS) if (typeof raw?.[key] === 'string') code[key] = raw[key];
  return code;
}

/** An empty site: header, one home page with no blocks, footer. */
export function createSite({ name = '', L = 'ko', designId = 'ocean' } = {}) {
  const design = { id: DESIGN_IDS.includes(designId) ? designId : 'ocean', overrides: {} };
  const title = name || (L === 'en' ? 'My Website' : '나의 홈페이지');
  const site = {
    format: FORMAT, version: VERSION, id: newId('s'), name: title,
    meta: { title, description: '', language: L, author: '', keywords: '', favicon: '' },
    design,
    code: emptyCode(),
    layout: { header: createBlock('navbar', { L, design, props: { brand: title } }), footer: createBlock('footer', { L, design }) },
    pages: [],
  };
  site.pages.push({ id: newId('p'), name: L === 'en' ? 'Home' : '홈', slug: 'index', title: '', description: '', nav: true, blocks: [] });
  return site;
}

// ───────────────────────── reading a project

const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object' || !BLOCK_TYPES.includes(raw.type)) return null;
  const def = blockDef(raw.type);
  const props = raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props) ? clone(raw.props) : def.defaults('ko');
  return { id: str(raw.id) || newId(), type: raw.type, props, style: normalizeStyle(raw.style, def) };
}

/** Checks a parsed project and fills what is missing. Throws on something that is not a MyHomeMaker site. */
export function normalizeSite(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT || !Array.isArray(raw.pages)) throw new Error('not a MyHomeMaker site');
  const L = raw.meta?.language === 'en' ? 'en' : 'ko';
  const site = {
    format: FORMAT, version: VERSION, id: str(raw.id) || newId('s'), name: str(raw.name, 'Site'),
    meta: { title: str(raw.meta?.title, str(raw.name, 'Site')), description: str(raw.meta?.description), language: L, author: str(raw.meta?.author), keywords: str(raw.meta?.keywords), favicon: str(raw.meta?.favicon) },
    design: { id: DESIGN_IDS.includes(raw.design?.id) ? raw.design.id : 'ocean', overrides: raw.design?.overrides && typeof raw.design.overrides === 'object' ? { ...raw.design.overrides } : {}, ...(typeof raw.design?.name === 'string' && raw.design.name.trim() ? { name: raw.design.name.trim().slice(0, 40) } : {}) },
    code: normalizeCode(raw.code),
    layout: { header: null, footer: null },
    pages: [],
  };
  const header = normalizeBlock(raw.layout?.header);
  const footer = normalizeBlock(raw.layout?.footer);
  site.layout.header = header?.type === 'navbar' ? header : createBlock('navbar', { L, design: site.design, props: { brand: site.meta.title } });
  site.layout.footer = footer?.type === 'footer' ? footer : createBlock('footer', { L, design: site.design });
  const ids = new Set();
  for (const page of raw.pages) {
    if (!page || typeof page !== 'object') continue;
    const blocks = (Array.isArray(page.blocks) ? page.blocks : []).map(normalizeBlock).filter((b) => b && !blockDef(b.type).global);
    for (const b of blocks) { if (ids.has(b.id)) b.id = newId(); ids.add(b.id); }
    const entry = { id: str(page.id) || newId('p'), name: str(page.name, 'Page') || 'Page', slug: '', title: str(page.title), description: str(page.description), nav: page.nav !== false, blocks };
    site.pages.push(entry);
    entry.slug = site.pages.length === 1 ? 'index' : uniqueSlug(site, str(page.slug) || entry.name, entry.id);
  }
  if (!site.pages.length) site.pages.push({ id: newId('p'), name: L === 'en' ? 'Home' : '홈', slug: 'index', title: '', description: '', nav: true, blocks: [] });
  return site;
}

export function parseSite(text) {
  let raw;
  try { raw = JSON.parse(String(text).replace(/^﻿/, '')); } catch (error) { throw new Error(`JSON: ${error.message}`); }
  return normalizeSite(raw);
}

export const serializeSite = (site) => JSON.stringify(site, null, 1);

// ───────────────────────── finding and changing

export const pageById = (site, id) => site.pages.find((p) => p.id === id) ?? null;

/** { block, page (null for the header/footer), index, list } for a block id. */
export function findBlock(site, id) {
  if (site.layout.header?.id === id) return { block: site.layout.header, page: null, index: -1, list: null, slot: 'header' };
  if (site.layout.footer?.id === id) return { block: site.layout.footer, page: null, index: -1, list: null, slot: 'footer' };
  for (const page of site.pages) {
    const index = page.blocks.findIndex((b) => b.id === id);
    if (index >= 0) return { block: page.blocks[index], page, index, list: page.blocks, slot: null };
  }
  return null;
}

/** Inserts blocks into a page at `index` (end when null). Returns the inserted blocks. */
export function insertBlocks(page, blocks, index = null) {
  const at = index == null ? page.blocks.length : Math.max(0, Math.min(page.blocks.length, index));
  page.blocks.splice(at, 0, ...blocks);
  return blocks;
}

/** A copy of a block with new ids (for duplicate / paste). */
export const copyBlock = (block) => ({ ...clone(block), id: newId() });

export function removeBlocks(site, ids) {
  const gone = new Set(ids);
  let count = 0;
  for (const page of site.pages) {
    const before = page.blocks.length;
    page.blocks = page.blocks.filter((b) => !gone.has(b.id));
    count += before - page.blocks.length;
  }
  return count;
}

/** Moves a block up (-1) or down (+1) in its page; returns whether it moved. */
export function moveBlock(site, id, direction) {
  const found = findBlock(site, id);
  if (!found?.list) return false;
  const to = found.index + direction;
  if (to < 0 || to >= found.list.length) return false;
  const [block] = found.list.splice(found.index, 1);
  found.list.splice(to, 0, block);
  return true;
}

/** Moves a block to `index` of a page (drag and drop; the index counts the list without the block). */
export function moveBlockTo(site, id, page, index) {
  const found = findBlock(site, id);
  if (!found?.list) return false;
  const [block] = found.list.splice(found.index, 1);
  const at = Math.max(0, Math.min(page.blocks.length, index));
  page.blocks.splice(at, 0, block);
  return true;
}

/** Reads a value at a dotted path ("items.2.title"). */
export function getPath(object, path) {
  return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/** Sets a value at a dotted path; missing objects are created. Returns whether it changed. */
export function setPath(object, path, value) {
  const keys = String(path).split('.');
  let target = object;
  for (const key of keys.slice(0, -1)) {
    if (target[key] == null || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  const last = keys.at(-1);
  if (target[last] === value) return false;
  target[last] = value;
  return true;
}

export function addPage(site, { name, L = 'ko', blocks = [] } = {}) {
  const page = createPage(site, { name: name || (L === 'en' ? `Page ${site.pages.length + 1}` : `페이지 ${site.pages.length + 1}`), blocks });
  site.pages.push(page);
  return page;
}

export function duplicatePage(site, id, L = 'ko') {
  const page = pageById(site, id);
  if (!page) return null;
  const copy = { ...clone(page), id: newId('p'), name: `${page.name} ${L === 'en' ? 'copy' : '사본'}`, blocks: page.blocks.map(copyBlock) };
  copy.slug = uniqueSlug(site, copy.name);
  site.pages.splice(site.pages.indexOf(page) + 1, 0, copy);
  return copy;
}

/** Removes a page (never the last one); the new first page becomes "index". */
export function removePage(site, id) {
  if (site.pages.length <= 1) return false;
  const index = site.pages.findIndex((p) => p.id === id);
  if (index < 0) return false;
  site.pages.splice(index, 1);
  fixSlugs(site);
  return true;
}

export function movePage(site, id, direction) {
  const index = site.pages.findIndex((p) => p.id === id);
  const to = index + direction;
  if (index < 0 || to < 0 || to >= site.pages.length) return false;
  const [page] = site.pages.splice(index, 1);
  site.pages.splice(to, 0, page);
  fixSlugs(site);
  return true;
}

/** The first page is the home page (index.html); no other page may be called "index". */
export function fixSlugs(site) {
  site.pages.forEach((page, i) => {
    if (i === 0) page.slug = 'index';
    else if (page.slug === 'index' || !page.slug) page.slug = uniqueSlug(site, page.name === site.pages[0].name ? 'home' : page.name, page.id);
  });
}

/** Counts for the status bar and the statistics. */
export function siteStats(site) {
  const blocks = site.pages.reduce((n, p) => n + p.blocks.length, 0);
  const images = JSON.stringify(site).match(/data:image\//g)?.length ?? 0;
  return { pages: site.pages.length, blocks, images };
}

export { designById };
