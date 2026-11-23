import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { inline, renderMarkdown, slugify } from '../src/markdown.js';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const GUIDES = ['UserGuide.md', 'UserGuide.en.md'];

test('headings get GitHub-style anchors', () => {
  assert.equal(slugify('1. 시작하기'), '1-시작하기');
  assert.equal(slugify('Saving and exporting'), 'saving-and-exporting');
  const { html, headings } = renderMarkdown('## A b\n\n### A b\n');
  assert.deepEqual(headings.map((h) => h.id), ['a-b', 'a-b-1']);
  assert.match(html, /<h2 id="a-b">A b<\/h2>/);
});

test('markdown never passes raw html through', () => {
  const { html } = renderMarkdown('<script>alert(1)</script> **bold** `<b>`\n\n[x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>&lt;b&gt;<\/code>/);
  assert.match(html, /<a href="#">x<\/a>/);
});

test('tables, lists, code blocks and pictures render', () => {
  const { html } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n\n1. first\n\n```\nx < y\n```\n\n![cap](doc/p.png)\n', {
    resolveImage: (src) => `/assets/${src.split('/').pop()}`,
  });
  assert.match(html, /<table><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><\/ol>/);
  assert.match(html, /<pre><code>x &lt; y<\/code><\/pre>/);
  assert.match(html, /<figure><img src="\/assets\/p.png" alt="cap" loading="lazy" \/><figcaption>cap<\/figcaption><\/figure>/);
  assert.equal(inline('*a* and **b**'), '<em>a</em> and <strong>b</strong>');
});

for (const name of GUIDES) {
  test(`${name}: every contents link points at a heading`, () => {
    const source = read(name);
    const { headings } = renderMarkdown(source);
    const ids = new Set(headings.map((h) => h.id));
    const links = [...source.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(links.length >= 9);
    for (const link of links) assert.ok(ids.has(link), `${name} → #${link}`);
  });

  test(`${name}: every picture exists in doc/images`, () => {
    const pictures = [...read(name).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(pictures.length >= 9, 'the guide has pictures');
    for (const src of pictures) {
      assert.match(src, /^doc\/images\//);
      assert.ok(existsSync(new URL(`../${src}`, import.meta.url)), `${name}: ${src}`);
    }
  });
}

test('both guides have the same chapters and pictures', () => {
  const [ko, en] = GUIDES.map((name) => read(name));
  const chapters = (text) => (text.match(/^## /gm) ?? []).length;
  assert.ok(chapters(ko) >= 12, 'the guide has its chapters');
  assert.equal(chapters(ko), chapters(en));
  const pics = (text, lang) => [...text.matchAll(/\(doc\/images\/(?:ko|en)-([^)]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(pics(ko), pics(en));
});
