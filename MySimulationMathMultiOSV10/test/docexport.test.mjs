// 문서로 내보내기 (src/print/docexport.js): HTML, Markdown and Word from a print spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentOf, toHtml, toMarkdown, toDocx } from '../src/print/docexport.js';
import { zipRead } from '../core/lib/io/archive.js';
import { highlightM } from '../src/print/highlight.js';

// a 2×1 PNG (signature + IHDR is all pngSize reads)
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIAP//AwUBAQDY8u0AAAAASUVORK5CYII=';
const model = { kind: 'image', title: 'ex_mass_spring', images: [{ dataUrl: png, caption: 'ex_mass_spring', role: 'diagram' }, { dataUrl: png, caption: 'ex_mass_spring/Scope', role: 'scope' }] };
const code = { kind: 'code', title: 'demo.m', text: "% the plot\nx = linspace(0, 1);\nplot(x, x.^2, 'r')\n", language: 'm' };

test('document: blocks of images (scopes optional) and code; margins and padding from the setup', () => {
  const d = documentOf(model, { margin: 'wide', imagePad: 'large' }, '2026-10-30 12:00');
  assert.deepEqual(d.blocks.map((b) => b.type), ['image', 'image']);
  assert.equal(d.pad, 18);
  assert.equal(d.margins.left, 25);
  assert.equal(documentOf(model, { scopes: false }).blocks.length, 1);
  const c = documentOf({ ...code, runs: highlightM(code.text) }, {});
  assert.equal(c.blocks[0].type, 'code');
  assert.equal(c.blocks[0].language, 'octave');
  assert.equal(c.blocks[0].lines.length, 3);
});

test('document: HTML is one file with the title, date, embedded images, captions and coloured code', () => {
  const h = toHtml(documentOf(model, {}, '2026-10-30 12:00'));
  assert.match(h, /^<!doctype html>/);
  assert.match(h, /<h1>ex_mass_spring<\/h1>/);
  assert.match(h, /<p class="meta">2026-10-30 12:00<\/p>/);
  assert.equal((h.match(/<img src="data:image\/png;base64,/g) || []).length, 2);
  assert.match(h, /<figcaption>ex_mass_spring\/Scope<\/figcaption>/);
  assert.match(h, /figure \{[^}]*padding: 10mm/);
  const hc = toHtml(documentOf({ ...code, runs: highlightM(code.text) }, {}));
  assert.match(hc, /<pre class="code"><span class="tk-c">% the plot<\/span>/);
});

test('document: Markdown links the image files and fences the code', () => {
  const md = toMarkdown(documentOf(model, {}, 'today'), (i) => `ex mass_${i + 1}.png`);
  assert.match(md, /^# ex_mass_spring\n\n\*today\*\n/);
  assert.match(md, /!\[ex_mass_spring\]\(ex%20mass_1\.png\)/);
  assert.match(md, /\*ex_mass_spring\/Scope\*/);
  const mc = toMarkdown(documentOf(code, {}));
  assert.match(mc, /```octave\n% the plot\nx = linspace\(0, 1\);\nplot\(x, x\.\^2, 'r'\)\n```/);
});

test('document: Word (.docx) is a valid package with the images, captions, coloured code and the margins', () => {
  const bytes = toDocx(documentOf(model, { margin: 'narrow' }, 'today'));
  const files = Object.fromEntries(zipRead(bytes).map((e) => [e.name, e.data]));
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png', 'word/media/image2.png']) assert.ok(files[p], p);
  const doc = new TextDecoder().decode(files['word/document.xml']);
  assert.match(doc, /<w:t xml:space="preserve">ex_mass_spring<\/w:t>/);
  assert.equal((doc.match(/<a:blip r:embed="rIdImg\d"\/>/g) || []).length, 2);
  assert.match(doc, /ex_mass_spring\/Scope/);
  assert.match(doc, /<w:pgMar w:top="454"/, 'narrow margins = 8 mm');
  const rels = new TextDecoder().decode(files['word/_rels/document.xml.rels']);
  assert.match(rels, /Target="media\/image2\.png"/);
  const cdoc = new TextDecoder().decode(Object.fromEntries(zipRead(toDocx(documentOf({ ...code, runs: highlightM(code.text) }, {}))).map((e) => [e.name, e.data]))['word/document.xml']);
  assert.match(cdoc, /<w:color w:val="6A737D"\/>.*% the plot/, 'comments keep their colour');
  assert.match(cdoc, /w:ascii="Consolas"/);
});
