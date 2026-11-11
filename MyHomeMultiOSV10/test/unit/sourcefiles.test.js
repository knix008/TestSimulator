// The site's own files (page HTML, style.css, script.js): what the editor stores, what is
// published, and what the canvas shows. An unchanged file is not stored, so the blocks keep writing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/domain/site.js';
import { SiteDocument } from '../../src/domain/document.js';
import { inlineScript, pageFile, pageHtml, siteStyles } from '../../src/domain/render.js';
import { siteFiles, singlePageHtml } from '../../src/domain/publish.js';
import { assignCssFile, assignPageSource, cssFileText, cssHasSource, customPageView, generatedCss, inlineSiteFiles, jsFileText, pageFileText, pageHasSource, publishedPageHtml } from '../../src/domain/sourcefiles.js';

const homeHtml = (body) => `<!doctype html><html><head><link rel="stylesheet" href="style.css" /></head><body>${body}<script src="script.js"></script></body></html>`;

test('an unedited page and style.css are what the blocks and the design write', () => {
  const site = S.createSite({ L: 'ko' });
  const page = site.pages[0];
  assert.equal(pageHasSource(page), false);
  assert.equal(cssHasSource(site), false);
  assert.equal(jsFileText(site), '');
  assert.equal(pageFileText(site, page), pageHtml(site, page, { css: 'style.css' }));
  assert.equal(cssFileText(site), siteStyles(site));
  assignPageSource(site, page, pageFileText(site, page));
  assignCssFile(site, cssFileText(site));
  assert.equal(page.source, undefined);
  assert.equal(site.files.css, '');
});

test('a saved page is published as that file; one page inlines style.css and script.js', () => {
  const site = S.createSite({ L: 'en' });
  const page = site.pages[0];
  site.code = { css: 'h1{color:red}', js: 'console.log("</script>")', head: '' };
  const other = S.addPage(site, { name: 'About', L: 'en' });
  assignPageSource(site, page, homeHtml('<h1>Edited</h1>'));
  const files = siteFiles(site);
  assert.match(files.find((f) => f.path === 'index.html').data, /Edited/);
  assert.match(files.find((f) => f.path === pageFile(other)).data, /<link rel="stylesheet" href="style.css" \/>/);
  assert.equal(files.find((f) => f.path === 'script.js').data, `${site.code.js}\n`);
  const single = singlePageHtml(site, page);
  assert.match(single, /<style>[\s\S]*h1\{color:red\}/);
  assert.match(single, /<script>\nconsole\.log\("<\\\/script>"\)\n<\/script>/);
  assert.equal(single.includes('log("</script>")'), false);
  assert.equal(publishedPageHtml(site, page), `${homeHtml('<h1>Edited</h1>')}\n`);
  assert.equal(publishedPageHtml(site, page, { css: null }), `${inlineSiteFiles(homeHtml('<h1>Edited</h1>'), site)}\n`);
});

test('style.css replaces the design sheet until it is the design sheet again', () => {
  const site = S.createSite({ L: 'ko' });
  site.code.css = 'h1{color:red}';
  assert.match(cssFileText(site), /h1\{color:red\}/);
  assert.match(generatedCss(site), /--primary/);
  assignCssFile(site, 'body{color:pink}\n');
  assert.equal(cssHasSource(site), true);
  assert.equal(siteStyles(site).includes('h1{color:red}'), false);
  assert.equal(siteStyles(site).includes('--primary'), false);
  assert.match(siteFiles(site).find((f) => f.path === 'style.css').data, /^body\{color:pink\}/);
  assignCssFile(site, generatedCss(site));
  assert.equal(site.files.css, '');
  assert.match(siteStyles(site), /h1\{color:red\}/);
  delete site.files;
  assignCssFile(site, 'a{color:blue}');
  assert.equal(site.files.css, 'a{color:blue}');
});

test('quotes, a fragment, a head style and a trailing newline', () => {
  const site = S.createSite({ L: 'ko' });
  site.code.js = 'var n = 1';
  const quoted = `<link href='style.css'>\n<script src='script.js'></script>`;
  const inlined = inlineSiteFiles(quoted, site);
  assert.match(inlined, /<style>[\s\S]*--primary/);
  assert.match(inlined, new RegExp(inlineScript(site.code.js)));
  assert.equal(inlined.includes("src='script.js'"), false);
  const view = customPageView(`<html><head><style>h1{color:blue}</style><link rel="stylesheet" href="style.css"></head><body><p>조각</p><script>alert(1)</script></body></html>`, site);
  assert.match(view.body, /<p>조각<\/p>/);
  assert.equal(/<script/.test(view.body), false);
  assert.match(view.css, /h1\{color:blue\}/);
  assert.match(view.css, /--primary/);
  const fragment = customPageView('<div>only</div>', site);
  assert.equal(fragment.body, '<div>only</div>');
  assert.equal(fragment.css, '');
  const page = site.pages[0];
  assignPageSource(site, page, '<html>y</html>\n');
  assert.equal(publishedPageHtml(site, page), '<html>y</html>\n');
  assignPageSource(site, page, '<html>z</html>');
  assert.equal(publishedPageHtml(site, page), '<html>z</html>\n');
});

test('a saved page is kept, copied, undone, and pictures in it become files', () => {
  const site = S.createSite({ L: 'ko' });
  const page = site.pages[0];
  const html = `<html><body><img src="data:image/png;base64,iVBORw0KGgo=" alt=""></body></html>`;
  const doc = new SiteDocument(site);
  doc.apply('page', (value) => assignPageSource(value, value.pages[0], html));
  assert.equal(doc.page.source, html);
  assert.equal(doc.dirty, true);
  const files = siteFiles(doc.site);
  assert.equal(files.find((f) => f.path === 'index.html').data.includes('data:image'), false);
  assert.ok(files.some((f) => f.path.startsWith('assets/img-') && f.path.endsWith('.png')));
  const copy = S.duplicatePage(doc.site, page.id, 'ko');
  assert.equal(copy.source, html);
  assert.equal(doc.undo(), 'page');
  assert.equal(pageHasSource(doc.page), false);
  const raw = JSON.parse(S.serializeSite(S.createSite({ L: 'en' })));
  delete raw.files;
  raw.pages[0].source = '';
  raw.pages.push({ name: 'Next', source: 5, blocks: [] });
  const opened = S.normalizeSite(raw);
  assert.equal(opened.files.css, '');
  assert.equal(opened.pages[0].source, undefined);
  assert.equal(opened.pages[1].source, undefined);
});
