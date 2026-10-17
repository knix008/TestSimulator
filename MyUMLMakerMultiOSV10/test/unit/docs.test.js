// Documentation export: one self-contained HTML page (navigation tree, a
// section per element, inline diagram SVG, search, light/dark) and one
// Markdown document (tables, image links), with Korean or English headings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { htmlDocs, markdownDocs } from '../../src/domain/docs.js';
import { importMdj } from '../../src/domain/interop/staruml.js';
import * as M from '../../src/domain/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = () => {
  const project = importMdj(fs.readFileSync(path.join(root, 'samples', 'staruml-sample.mdj'), 'utf8'));
  project.author = 'Kim <dev>';
  M.findById(project, 'AAAAAAGJ1aJ0w4KaYlE=').documentation = 'A person who buys.\n<b>not html</b>';
  return project;
};

test('htmlDocs: one page with navigation, sections, members and diagrams', () => {
  const rendered = [];
  const html = htmlDocs(sample(), { language: 'en', renderDiagram: (d) => { rendered.push(d.name); return `<svg data-diagram="${d.name}"></svg>`; } });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<link |<script src=/, 'self-contained');
  assert.match(html, /<title>Shop<\/title>/);
  assert.match(html, /<nav><input id="q" type="search"/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.deepEqual(rendered, ['Main', 'Checkout']);
  assert.match(html, /<svg data-diagram="Main"><\/svg>/);
  const customer = /<section id="(e-[^"]+)">\n<h2>Customer<\/h2>[\s\S]*?<\/section>/.exec(html)[0];
  assert.match(customer, /Type: Class · Qualified name: <code>Model::Customer<\/code>/);
  assert.match(customer, /A person who buys\.\n&lt;b&gt;not html&lt;\/b&gt;/, 'documentation escaped');
  assert.match(customer, /<h3>Attributes<\/h3><table>.*<td>-<\/td><td>name<\/td><td>String<\/td>/);
  assert.match(customer, /<h3>Operations<\/h3>.*<td>placeOrder<\/td><td><\/td><td>Order<\/td>/);
  assert.match(customer, /<h3>Relationships<\/h3>.*places.*Customer.*→.*Order/);
  assert.match(customer, /<h3>Appears in diagrams<\/h3><ul><li><a href="#e-[^"]+">Main<\/a>/);
  assert.match(html, /Author: Kim &lt;dev&gt;/);
  // Every in-page link has a target.
  const targets = new Set([...html.matchAll(/ id="(e-[^"]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(targets.has(href), href);
  // The navigation is a tree: the interaction sits inside the collaboration.
  assert.match(html, /Collaboration1<\/a><span class="t">Collaboration<\/span><ul><li><a [^>]+>Checkout<\/a><span class="t">Interaction/);
});

test('htmlDocs: Korean headings, failing renderer, no renderer', () => {
  const ko = htmlDocs(sample(), { language: 'ko', renderDiagram: () => { throw new Error('boom'); } });
  assert.match(ko, /<html lang="ko">/);
  assert.match(ko, /<h3>속성<\/h3>/);
  assert.match(ko, /<h3>오퍼레이션<\/h3>/);
  assert.match(ko, /placeholder="검색…"/);
  assert.match(ko, /\(그림 없음\)/);
  assert.match(htmlDocs(sample(), { language: 'en' }), /\(no picture\)/);
});

test('markdownDocs: one document with tables and image links', () => {
  const text = markdownDocs(sample(), { language: 'en', imageLink: (d) => `images/${d.name} 1.png` });
  assert.match(text, /^# Shop\n/);
  assert.match(text, /## Contents\n/);
  assert.match(text, /\n### Customer\n\n- Type: Class\n- Qualified name: `Model::Customer`\n/);
  assert.match(text, /\| Visibility \| Name \| Type \| Multiplicity \| Default \|\n\| --- \| --- \| --- \| --- \| --- \|\n\| - \| name \| String \|/);
  assert.match(text, /!\[Main\]\(images\/Main%201\.png\)/);
  assert.match(text, /!\[Checkout\]\(images\/Checkout%201\.png\)/);
  const anchors = new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
  for (const [, href] of text.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(anchors.has(href), href);
  const ko = markdownDocs(sample(), { language: 'ko' });
  assert.match(ko, /## 목차/);
  assert.match(ko, /- 종류: 클래스/);
  assert.doesNotMatch(ko, /!\[/, 'no image links without imageLink');
});
