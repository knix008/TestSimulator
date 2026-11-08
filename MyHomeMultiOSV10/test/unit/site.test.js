// The site model, blocks, rendering, templates, samples and publishing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_TYPES, BLOCKS, PAGE_BLOCK_TYPES, blockDef, embedUrl, md, renderBlock, safeUrl } from '../../src/domain/blocks.js';
import { DESIGNS, effectiveDesign } from '../../src/domain/designs.js';
import * as S from '../../src/domain/site.js';
import { pageHtml, siteCss } from '../../src/domain/render.js';
import { decodeDataUrl, publishChecks, siteFiles } from '../../src/domain/publish.js';
import { TEMPLATE_IDS, buildTemplate } from '../../src/domain/templates.js';
import { SAMPLES, SAMPLE_IDS, buildSample } from '../../src/domain/samples.js';
import { ART_KINDS, art } from '../../src/domain/art.js';

test('every block kind has fields, defaults in both languages and renders', () => {
  assert.ok(BLOCK_TYPES.length >= 34);
  const site = S.createSite({ L: 'ko' });
  for (const type of BLOCK_TYPES) {
    const def = blockDef(type);
    assert.ok(def.ko && def.en && def.icon && def.group, type);
    for (const L of ['ko', 'en']) {
      const block = S.createBlock(type, { L });
      for (const field of def.fields) assert.ok(field.key in block.props, `${type}.${field.key}`);
      const html = renderBlock(block, { editor: true, site, page: site.pages[0], pages: site.pages, L });
      assert.match(html, new RegExp(`data-block-id="${block.id}"`), type);
      assert.ok(!/undefined|NaN|\[object/.test(html), `${type} renders junk`);
      const clean = renderBlock(block, { editor: false, site, page: site.pages[0], pages: site.pages, L });
      assert.ok(!/data-edit|data-block-id/.test(clean), `${type} leaks editor hooks`);
    }
    for (const field of def.fields.filter((x) => x.kind === 'items')) assert.equal(typeof field.add, 'function', `${type} items.add`);
  }
  assert.ok(PAGE_BLOCK_TYPES.includes('hero') && !PAGE_BLOCK_TYPES.includes('navbar'));
});

test('text is escaped and links are made safe', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('https://a.b/c'), 'https://a.b/c');
  assert.equal(safeUrl('about.html'), 'about.html');
  assert.equal(md('**a** <b>x</b>'), '<p><strong>a</strong> &lt;b&gt;x&lt;/b&gt;</p>');
  assert.equal(md('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.match(md('[x](javascript:evil)'), /href="#"/);
  assert.equal(embedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(embedUrl('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456');
  const site = S.createSite({ L: 'en' });
  const block = S.createBlock('heading', { L: 'en', props: { title: '<script>x</script>' } });
  assert.ok(!renderBlock(block, { site, page: site.pages[0], pages: site.pages }).includes('<script>'));
});

test('designs have every colour and overrides are checked', () => {
  assert.equal(DESIGNS.length, 36);
  for (const d of DESIGNS) for (const key of ['primary', 'bg', 'text', 'surface', 'border']) assert.match(d[key], /^#[0-9a-f]{6}$/, `${d.id}.${key}`);
  const e = effectiveDesign({ id: 'forest', overrides: { primary: '#123456', radius: 99, bodyFont: 'nope', width: 10 } });
  assert.equal(e.primary, '#123456');
  assert.equal(e.radius, 40);
  assert.equal(e.bodyFont, 'sans');
  assert.equal(e.width, 720);
  assert.match(siteCss({ id: 'neon' }), /--primary:#00e5a0/);
});

test('pages, slugs and block moves', () => {
  const site = S.createSite({ L: 'ko' });
  assert.equal(site.pages[0].slug, 'index');
  const about = S.addPage(site, { name: '회사 소개' });
  assert.equal(about.slug, 'about');
  const again = S.addPage(site, { name: 'About' });
  assert.equal(again.slug, 'about-2');
  const home = site.pages[0];
  const [a, b, c] = ['hero', 'text', 'cta'].map((type) => S.createBlock(type));
  S.insertBlocks(home, [a, b, c]);
  assert.ok(S.moveBlock(site, c.id, -1));
  assert.deepEqual(home.blocks.map((x) => x.type), ['hero', 'cta', 'text']);
  assert.ok(!S.moveBlock(site, a.id, -1));
  S.moveBlockTo(site, a.id, about, 0);
  assert.equal(about.blocks[0].id, a.id);
  assert.equal(S.findBlock(site, a.id).page, about);
  assert.equal(S.findBlock(site, site.layout.header.id).slot, 'header');
  assert.ok(S.removePage(site, home.id));
  assert.equal(site.pages[0].slug, 'index');
  const copy = S.duplicatePage(site, about.id);
  assert.notEqual(copy.blocks[0].id, about.blocks[0].id);
  S.setPath(about.blocks[0].props, 'items.0.title', 'x');
  assert.equal(S.getPath(about.blocks[0].props, 'items.0.title'), 'x');
  assert.equal(S.removeBlocks(site, [a.id]), 1);
});

test('a saved site reads back the same, and broken files are refused', () => {
  const site = buildTemplate('business', 'en');
  const back = S.parseSite(S.serializeSite(site));
  assert.deepEqual(back.pages.map((p) => [p.name, p.slug, p.blocks.length]), site.pages.map((p) => [p.name, p.slug, p.blocks.length]));
  assert.equal(back.layout.header.props.brand, site.layout.header.props.brand);
  assert.throws(() => S.parseSite('{"format":"other"}'));
  assert.throws(() => S.parseSite('not json'));
  const repaired = S.normalizeSite({ format: 'myhomemaker', pages: [{ name: 'A', blocks: [{ type: 'nope' }, { type: 'text', props: { body: 'x' } }] }] });
  assert.equal(repaired.pages[0].blocks.length, 1);
  assert.equal(repaired.pages[0].slug, 'index');
  assert.ok(repaired.layout.header && repaired.layout.footer);
});

test('every template and sample builds in both languages and publishes', () => {
  assert.equal(TEMPLATE_IDS.length, 12);
  assert.equal(SAMPLES.length, 36);
  for (const g of ['business', 'food', 'people', 'community']) assert.equal(SAMPLES.filter((s) => s.group === g).length, 9, g);
  for (const L of ['ko', 'en']) {
    for (const [kind, ids, build] of [['template', TEMPLATE_IDS, buildTemplate], ['sample', SAMPLE_IDS, buildSample]]) {
      for (const id of ids) {
        const site = build(id, L);
        assert.equal(site.meta.language, L, `${kind} ${id}`);
        assert.ok(site.pages.length >= 1 && site.pages.every((p) => p.blocks.length), `${kind} ${id} pages`);
        assert.ok(site.pages.every((p) => /^[a-z0-9-]+$/.test(p.slug)), `${kind} ${id} slugs ${site.pages.map((p) => p.slug)}`);
        const files = siteFiles(site);
        assert.ok(files.some((file) => file.path === 'index.html') && files.some((file) => file.path === 'style.css'), `${kind} ${id}`);
        for (const file of files.filter((x) => x.path.endsWith('.html'))) {
          assert.ok(!/data:image/.test(file.data), `${kind} ${id} ${file.path} keeps data URLs`);
          assert.ok(!/undefined|NaN/.test(file.data), `${kind} ${id} ${file.path} junk`);
          for (const [, ref] of file.data.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) assert.ok(files.some((x) => x.path === ref), `${kind} ${id} missing ${ref}`);
        }
      }
    }
  }
});

test('pictures: every kind draws, data URLs decode', () => {
  for (const kind of ART_KINDS) {
    const url = art(kind, '#336699', '#ff9900', 3);
    const file = decodeDataUrl(url);
    assert.equal(file.ext, 'svg');
    assert.match(file.data, /^<svg[^>]+viewBox="0 0 800 500"/);
    assert.ok(!/NaN|undefined/.test(file.data), kind);
  }
  const png = decodeDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(png.ext, 'png');
  assert.equal(png.data[1], 0x50);
});

test('published pages have a title, a description and a link to the style sheet', () => {
  const site = buildSample('bakery', 'ko');
  const html = pageHtml(site, site.pages[0]);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<title>밀과 버터<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="style.css" \/>/);
  const inline = pageHtml(site, site.pages[1], { css: null });
  assert.match(inline, /<style>:root\{--primary/);
  assert.match(inline, /<title>메뉴 \| 밀과 버터<\/title>/);
  const empty = S.createSite({ L: 'ko' });
  empty.meta.description = '';
  assert.ok(publishChecks(empty).some((x) => x.key === 'check.emptyPage'));
});

test('the block catalogue uses known groups', async () => {
  const { BLOCK_GROUPS } = await import('../../src/domain/blocks.js');
  const groups = new Set(BLOCK_GROUPS.map((g) => g.id));
  for (const def of Object.values(BLOCKS)) assert.ok(groups.has(def.group), def.type);
});
