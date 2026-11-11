// The Problems panel's list: every check with the place it points at, the texts that are checked,
// stable keys, filters and groups, and fixing a word in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countProblems, filterProblems, groupProblems, occurrenceIndex, replaceRange, siteChecks, siteProblems, textFields } from '../../src/domain/problems.js';
import { buildTemplate } from '../../src/domain/templates.js';
import { createBlock, createPage } from '../../src/domain/site.js';
import { SpellChecker } from '../../src/domain/spell.js';

const site = () => buildTemplate('business', 'en');
const codes = (s) => siteChecks(s).map((c) => c.code);

test('a template has no errors', () => {
  assert.deepEqual(siteChecks(site()).filter((c) => c.severity === 'error'), []);
});

for (const [name, setup, code, severity, where] of [
  ['no site title', (s) => { s.meta.title = ''; }, 'check.noTitle', 'warning', { scope: 'site', path: 'meta.title' }],
  ['a long site title', (s) => { s.meta.title = 'x'.repeat(70); }, 'check.longTitle', 'warning', { scope: 'site', path: 'meta.title' }],
  ['no site description', (s) => { s.meta.description = ''; }, 'check.noDescription', 'warning', { scope: 'site', path: 'meta.description' }],
  ['a long description', (s) => { s.meta.description = 'y'.repeat(200); }, 'check.longDescription', 'warning', { scope: 'site', path: 'meta.description' }],
  ['an empty page', (s) => { s.pages[1].blocks = []; }, 'check.emptyPage', 'warning', { scope: 'page' }],
  ['a page with every block hidden', (s) => { for (const b of s.pages[1].blocks) b.style.hidden = true; }, 'check.allHidden', 'warning', { scope: 'page' }],
  ['a page without a name', (s) => { s.pages[1].name = ' '; }, 'check.noPageName', 'error', { scope: 'page', path: 'name' }],
  ['two pages with one file name', (s) => { s.pages[2].slug = s.pages[1].slug; }, 'check.sameSlugPage', 'error', { scope: 'page', path: 'slug' }],
  ['a picture without alt text', (s) => { const b = createBlock('image', { L: 'en' }); b.props.src = 'pic.png'; b.props.alt = ''; s.pages[0].blocks.push(b); }, 'check.noAlt', 'warning', { scope: 'block', path: 'alt' }],
  ['a picture block without a picture', (s) => { const b = createBlock('image', { L: 'en' }); b.props.src = ''; s.pages[0].blocks.push(b); }, 'check.noImage', 'warning', { scope: 'block', path: 'src' }],
  ['a form with nowhere to send', (s) => { const b = createBlock('contact', { L: 'en' }); Object.assign(b.props, { form: true, endpoint: '', email: '' }); s.pages[0].blocks.push(b); }, 'check.noFormTarget', 'error', { scope: 'block', path: 'endpoint' }],
  ['a video that is not YouTube or Vimeo', (s) => { const b = createBlock('video', { L: 'en' }); b.props.url = 'https://example.com/movie.mp4'; s.pages[0].blocks.push(b); }, 'check.videoUrl', 'warning', { scope: 'block', path: 'url' }],
  ['a link to a page that does not exist', (s) => { s.pages[0].blocks[0].props.url1 = 'nowhere.html'; }, 'check.brokenLink', 'error', { scope: 'block', path: 'url1' }],
  ['a javascript: link', (s) => { s.layout.header.props.ctaUrl = 'javascript:alert(1)'; }, 'check.unsafeLink', 'error', { scope: 'block', path: 'ctaUrl' }],
]) {
  test(`check: ${name}`, () => {
    const s = site();
    setup(s);
    const found = siteChecks(s).find((c) => c.code === code);
    assert.ok(found, `${code} not in ${codes(s)}`);
    assert.equal(found.severity, severity);
    for (const [key, value] of Object.entries(where)) assert.equal(found[key], value, key);
    if (found.scope !== 'site') assert.ok(found.pageId, 'pageId');
    if (found.scope === 'block') assert.ok(found.blockId, 'blockId');
  });
}

test('links to existing pages and anchors are fine', () => {
  const s = site();
  s.pages[0].blocks[0].props.url1 = `${s.pages[1].slug}.html#top`;
  s.layout.header.props.ctaUrl = '#contact';
  assert.ok(!codes(s).includes('check.brokenLink'));
});

test('the texts that are checked: site, pages, header and footer once, block fields and items', () => {
  const s = site();
  const fields = [...textFields(s)];
  assert.ok(fields.some((f) => f.scope === 'site' && f.path === 'meta.description'));
  assert.ok(fields.some((f) => f.scope === 'page' && f.path === 'name'));
  assert.equal(fields.filter((f) => f.blockId === s.layout.footer.id && f.path === 'about').length, 1);
  assert.ok(fields.some((f) => /^items\.\d+\.\w+$/.test(f.path)));
  assert.ok(!fields.some((f) => ['phone', 'email', 'address', 'icon', 'url1', 'ctaUrl'].includes(f.path.split('.').at(-1))), 'not words');
});

test('rows: stable keys, counts, filters, groups', () => {
  const s = site();
  s.meta.description = '';
  s.pages[0].blocks[0].props.url1 = 'nowhere.html';
  s.pages[0].blocks[0].props.title = 'Teh websiet teh';
  s.pages.push(createPage(s, { name: 'Extra', blocks: [createBlock('text', { L: 'en', props: { body: 'Anothr' } })] }));
  const checker = new SpellChecker({ en: ['the', 'website', 'another', 'extra'], ko: [] });
  const rows = siteProblems(s, { checker });
  const again = siteProblems(s, { checker });
  assert.deepEqual(rows.map((r) => r.key), again.map((r) => r.key));
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, 'unique keys');
  const c = countProblems(rows);
  assert.ok(c.error >= 1 && c.warning >= 1 && c.spelling >= 4, JSON.stringify(c));
  assert.equal(c.total, c.error + c.warning + c.spelling);
  assert.equal(filterProblems(rows, { severity: 'spelling' }).length, c.spelling);
  const home = filterProblems(rows, { pageId: s.pages[0].id });
  assert.ok(home.every((r) => r.pageId === s.pages[0].id || r.scope === 'site'));
  assert.ok(!home.some((r) => r.word === 'Anothr'));
  assert.equal(filterProblems(rows, { query: 'anothr', text: (r) => r.word ?? '' }).length, 1);
  assert.deepEqual(groupProblems(rows).map((g) => g.severity), ['error', 'warning', 'spelling'].filter((k) => c[k]));
  assert.equal(siteProblems(s, { checker, spelling: false }).filter((r) => r.kind === 'spelling').length, 0);
});

test('a saved style sheet and a page file report the broken line', () => {
  const s = site();
  const page = s.pages[0];
  assert.equal(siteProblems(s, { page, spelling: false }).filter((r) => r.kind === 'code').length, 0, 'a generated page is not listed until it is edited');
  s.files = { ...(s.files ?? {}), css: 'h1 { color: red' };
  page.source = '<div><p>열린 태그';
  const rows = siteProblems(s, { page, spelling: false }).filter((r) => r.kind === 'code');
  assert.ok(rows.some((r) => r.path === 'css' && r.severity === 'error' && r.line >= 1));
  assert.ok(rows.some((r) => r.path === 'page' && r.params.file.endsWith('.html')));
  s.code = { ...(s.code ?? {}), js: 'function (' };
  const js = siteProblems(s, { page, spelling: false }).find((r) => r.path === 'js');
  assert.equal(js?.severity, 'error');
});

test('fixing a word: the range is replaced, the n-th occurrence is found again', () => {
  const text = 'Teh websiet teh';
  assert.equal(replaceRange(text, 4, 11, 'website'), 'Teh website teh');
  assert.equal(occurrenceIndex('ab ab ab', 'ab', 6), 2);
  assert.equal(occurrenceIndex('ab ab ab', 'ab', 0), 0);
});
