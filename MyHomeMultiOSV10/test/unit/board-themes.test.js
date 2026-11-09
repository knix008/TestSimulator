// The bulletin board block, the 40 site designs and the user's own designs ("my themes").
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardCategories, renderBlock } from '../../src/domain/blocks.js';
import * as S from '../../src/domain/site.js';
import { pageHtml } from '../../src/domain/render.js';
import { printableHtml } from '../../src/print/layout.js';
import {
  customAsDesign, customFromSiteDesign, DESIGN_KEYS, DESIGNS, effectiveDesign, isCustomDesignId, newCustomDesignId, normalizeCustomDesign,
  normalizeCustomDesigns, siteDesignFromCustom, siteDesignName, CUSTOM_DESIGNS_MAX,
} from '../../src/domain/designs.js';
import { defaultSettings, loadSettings, resetForNewInstall, STORAGE_KEY } from '../../src/domain/settings.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const boardSite = (L = 'ko') => {
  const site = S.createSite({ L });
  const block = S.createBlock('board', { L, design: site.design });
  site.pages[0].blocks.push(block);
  return { site, block };
};

test('board: categories from the comma list', () => {
  assert.deepEqual(boardCategories({ categories: ' 공지, 자유 ,,질문 ' }), ['공지', '자유', '질문']);
  assert.deepEqual(boardCategories({ categories: '' }), []);
});

test('board: notices first, the others numbered from the newest; every post has its own anchor and the write form', () => {
  const { site, block } = boardSite();
  const html = pageHtml(site, site.pages[0], { css: null });
  const rows = [...html.matchAll(/<tr data-post="(\d+)"[^>]*class="([^"]*)"><td class="no">(.*?)<\/td>/g)].map((m) => [Number(m[1]), m[2], m[3]]);
  assert.equal(rows.length, block.props.items.length);
  assert.equal(rows[0][1], 'notice');
  assert.match(rows[0][2], /hm-board-badge/);
  assert.deepEqual(rows.slice(1).map((r) => r[2]), ['4', '3', '2', '1']);
  assert.deepEqual(rows.slice(1).map((r) => r[0]), [4, 3, 2, 1]);
  for (let i = 0; i < block.props.items.length; i += 1) assert.ok(html.includes(`id="post-${block.id}-${i}"`), `post ${i}`);
  assert.ok(html.includes(`id="board-${block.id}-write"`));
  assert.match(html, /action="mailto:hello@example.com"/);
  assert.match(html, /<script>\(function\(b\)/);
  assert.match(html, /data-board-cat="질문"/);
  assert.match(html, /data-per-page="10"/);
});

test('board: in the editor no script, no post pages and no form; text stays escaped; options turn parts off', () => {
  const { site, block } = boardSite('en');
  block.props.items[0].title = '<img src=x onerror=alert(1)>';
  block.props.items[0].body = '**bold** <script>x</script>';
  const editor = renderBlock(block, { editor: true, site, page: site.pages[0], pages: site.pages, L: 'en' });
  assert.ok(!editor.includes('<script>'));
  assert.ok(!editor.includes('hm-post'));
  assert.ok(editor.includes('data-edit="items.0.title"'));
  assert.ok(editor.includes('&lt;img src=x'));
  const published = renderBlock(block, { editor: false, site, page: site.pages[0], pages: site.pages, L: 'en' });
  assert.ok(published.includes('<strong>bold</strong>'));
  assert.ok(!published.includes('<script>x</script>'));
  Object.assign(block.props, { search: false, write: false, views: false, categories: '', endpoint: 'https://formspree.io/f/abc', perPage: 5 });
  const plain = renderBlock(block, { editor: false, site, page: site.pages[0], pages: site.pages, L: 'en' });
  assert.ok(!plain.includes('class="hm-board-search"'));
  assert.ok(!plain.includes('-write"'));
  assert.ok(!plain.includes('<th class="views">'));
  assert.ok(!plain.includes('data-board-cat="'));
  assert.match(plain, /data-per-page="5"/);
  // Printing leaves the script out.
  assert.ok(!printableHtml(pageHtml(site, site.pages[0], { css: null })).includes('(function(b)'));
});

test('designs: 40 (26 light, 14 dark), unique ids, readable text on the main colour', () => {
  assert.equal(DESIGNS.length, 40);
  assert.equal(DESIGNS.filter((d) => d.dark).length, 14);
  assert.equal(new Set(DESIGNS.map((d) => d.id)).size, 40);
  const luminance = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const d of DESIGNS.slice(-6)) {
    assert.ok(ratio(d.text, d.bg) >= 7, `${d.id} text`);
    assert.ok(ratio(d.primaryText, d.primary) >= 3, `${d.id} button`);
  }
});

test('my themes: kept valid, at most 60, applied as values inside the site with their name', () => {
  assert.ok(isCustomDesignId(newCustomDesignId()));
  assert.equal(isCustomDesignId('ocean'), false);
  assert.equal(normalizeCustomDesign({ id: 'ocean', name: 'x' }), null);
  assert.equal(normalizeCustomDesign({ id: 'my-a', name: '  ' }), null);
  const mine = normalizeCustomDesign({ id: 'my-a', name: ' Red ', base: 'nope', values: { primary: '#CC2244', radius: 99, headingFont: 'bad', bodyFont: 'serif' } });
  assert.equal(mine.name, 'Red');
  assert.equal(mine.base, 'ocean');
  assert.equal(mine.values.primary, '#cc2244');
  assert.equal(mine.values.radius, 40);
  assert.equal(mine.values.headingFont, effectiveDesign({ id: 'ocean' }).headingFont);
  assert.equal(mine.values.bodyFont, 'serif');
  assert.deepEqual(Object.keys(mine.values).sort(), [...DESIGN_KEYS].sort());
  const many = normalizeCustomDesigns(Array.from({ length: 70 }, (_, i) => ({ id: `my-${i}`, name: `T${i}` })).concat([{ id: 'my-1', name: 'dup' }]));
  assert.equal(many.length, CUSTOM_DESIGNS_MAX);
  assert.equal(customAsDesign(mine).ko, 'Red');
  // Applied to a site: the site keeps every value, and the theme's name.
  const site = S.createSite({ L: 'ko' });
  site.design = siteDesignFromCustom(mine);
  const again = S.parseSite(S.serializeSite(site));
  assert.equal(again.design.name, 'Red');
  assert.equal(effectiveDesign(again.design).primary, '#cc2244');
  assert.equal(siteDesignName(again.design, 'en'), 'Red');
  assert.equal(siteDesignName({ id: 'forest', overrides: {} }, 'ko'), '포레스트');
  assert.ok(pageHtml(again, again.pages[0], { css: null }).includes('--primary:#cc2244'));
  // From a site's design as it is.
  const from = customFromSiteDesign({ id: 'forest', overrides: { accent: '#010203' } }, 'Green');
  assert.equal(from.base, 'forest');
  assert.equal(from.values.accent, '#010203');
  assert.equal(from.values.primary, effectiveDesign({ id: 'forest' }).primary);
});

test('my themes live in the settings and survive a new installation', () => {
  assert.deepEqual(defaultSettings('ko').customDesigns, []);
  const storage = new MemoryStorage();
  const theme = { id: 'my-x1', name: 'Mine', base: 'rose', values: { primary: '#112233' } };
  storage.setItem(STORAGE_KEY, JSON.stringify({ customDesigns: [theme, { id: 'bad' }], theme: 'dark' }));
  const loaded = loadSettings(storage);
  assert.equal(loaded.customDesigns.length, 1);
  assert.equal(loaded.customDesigns[0].values.primary, '#112233');
  resetForNewInstall(storage, 'token-1');
  assert.equal(loadSettings(storage).customDesigns[0]?.name, 'Mine');
});
