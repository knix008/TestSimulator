// Every design, template, sample and built-in picture, one test each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGNS, FONT_IDS, effectiveDesign } from '../../src/domain/designs.js';
import { siteCss } from '../../src/domain/render.js';
import { TEMPLATES, buildTemplate } from '../../src/domain/templates.js';
import { SAMPLES, buildSample } from '../../src/domain/samples.js';
import { siteFiles, publishChecks } from '../../src/domain/publish.js';
import { ART_KINDS, art, artSvg } from '../../src/domain/art.js';
import { decodeDataUrl } from '../../src/domain/publish.js';
import * as S from '../../src/domain/site.js';

const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const d of DESIGNS) {
  test(`design ${d.id} (${d.en})`, () => {
    for (const key of ['primary', 'primaryText', 'accent', 'bg', 'surface', 'text', 'muted', 'border', 'headerBg', 'headerText', 'footerBg', 'footerText']) assert.match(d[key], /^#[0-9a-f]{6}$/, key);
    assert.ok(FONT_IDS.includes(d.headingFont) && FONT_IDS.includes(d.bodyFont), 'fonts');
    assert.ok(contrast(d.text, d.bg) >= 4.5, `text on background ${contrast(d.text, d.bg).toFixed(2)}`);
    assert.ok(contrast(d.primaryText, d.primary) >= 3, `button text ${contrast(d.primaryText, d.primary).toFixed(2)}`);
    assert.ok(contrast(d.headerText, d.headerBg) >= 4.5, 'header text');
    assert.ok(contrast(d.footerText, d.footerBg) >= 4.5, 'footer text');
    const css = siteCss({ id: d.id });
    assert.ok(css.includes(`--primary:${d.primary}`) && css.includes(`color-scheme:${d.dark ? 'dark' : 'light'}`));
    assert.equal(effectiveDesign({ id: d.id, overrides: { accent: '#010203' } }).accent, '#010203');
  });
}

for (const [id] of TEMPLATES) {
  test(`template ${id}`, () => {
    for (const L of ['ko', 'en']) {
      const site = buildTemplate(id, L);
      assert.equal(site.pages[0].slug, 'index');
      assert.ok(site.pages.every((p) => p.blocks.length && /^[a-z0-9-]+$/.test(p.slug)), 'pages');
      assert.equal(new Set(site.pages.map((p) => p.slug)).size, site.pages.length, 'unique file names');
      const back = S.parseSite(S.serializeSite(site));
      assert.equal(back.pages.length, site.pages.length, 'saves and reads back');
      const files = siteFiles(site);
      for (const page of site.pages) assert.ok(files.some((f) => f.path === (page.slug === 'index' ? 'index.html' : `${page.slug}.html`)), page.slug);
    }
  });
}

for (const sample of SAMPLES) {
  test(`sample ${sample.id} (${sample.en[0]})`, () => {
    for (const L of ['ko', 'en']) {
      const site = buildSample(sample.id, L);
      assert.equal(site.meta.title, sample[L][0]);
      assert.equal(site.design.id, sample.design);
      assert.ok(site.pages.length >= 3 && site.pages.length <= 5, 'three to five pages');
      assert.equal(site.pages[0].slug, 'index');
      assert.equal(site.pages.at(-1).slug, 'contact');
      if (sample.board) assert.ok(site.pages.some((p) => p.slug === 'board' && p.blocks.some((b) => b.type === 'board' && b.props.items.length >= 4)), 'a board page');
      const files = siteFiles(site);
      for (const file of files.filter((f) => f.path.endsWith('.html'))) {
        for (const [, href] of file.data.matchAll(/href="([a-z0-9-]+\.html)"/g)) assert.ok(files.some((f) => f.path === href), `${file.path} links to missing ${href}`);
      }
      assert.ok(!publishChecks(site).some((c) => c.key === 'check.emptyPage' || c.key === 'check.sameSlug'));
    }
  });
}

for (const kind of ART_KINDS) {
  test(`built-in picture ${kind}`, () => {
    const svg = artSvg(kind, '#2266aa', '#ee8800', 9);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 800 500"/);
    assert.ok(!/NaN|undefined/.test(svg));
    assert.equal(artSvg(kind, '#2266aa', '#ee8800', 9), svg, 'the same seed draws the same picture');
    assert.equal(decodeDataUrl(art(kind, '#2266aa', '#ee8800', 9)).data, svg, 'the data URL decodes back');
  });
}

test('samples are built in different ways: eight home arrangements, five samples each, many page sets', async () => {
  const { RECIPES } = await import('../../src/domain/samples.js');
  const ids = Object.values(RECIPES).flat();
  assert.equal(new Set(ids).size, SAMPLES.length, 'every sample has exactly one arrangement');
  for (const [name, list] of Object.entries(RECIPES)) assert.equal(list.length, 5, name);
  const homes = new Set();
  const sets = new Set();
  for (const sample of SAMPLES) {
    const site = buildSample(sample.id, 'ko');
    homes.add(site.pages[0].blocks.map((b) => b.type).join('+'));
    sets.add(site.pages.map((p) => p.slug).join(','));
  }
  assert.ok(homes.size >= 8, `home pages: ${homes.size}`);
  assert.ok(sets.size >= 6, `page sets: ${sets.size}`);
});
