// Model documents from templates (Tools › Generate document…): the report
// blocks per template and section switches, the Word (.docx) package, the
// HTML page and the PDF sheets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildReport, defaultReportOptions, REPORT_TEMPLATE_IDS, REPORT_TEMPLATES } from '../../src/domain/report.js';
import { reportHtml } from '../../src/domain/docs.js';
import { reportDocx, unzipStored } from '../../src/export/docx.js';
import { reportPdfPages } from '../../src/export/report-pdf.js';
import { pdfFromJpegs } from '../../src/export/files.js';
import { parseProject } from '../../src/domain/format.js';
import * as M from '../../src/domain/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = () => parseProject(fs.readFileSync(path.join(root, 'samples', 'online-shop.en.myuml'), 'utf8')).project;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const text = (bytes) => new TextDecoder().decode(bytes);
const kinds = (report) => new Set(report.blocks.map((b) => b.kind));
const h1 = (report) => report.blocks.filter((b) => b.kind === 'heading' && b.level === 1).map((b) => b.text);
const h3 = (report) => new Set(report.blocks.filter((b) => b.kind === 'heading' && b.level === 3).map((b) => b.text));

test('docx: a valid package with headings, tables, pictures and a TOC field', () => {
  const project = sample();
  const report = buildReport(project, { template: 'full', language: 'en', author: 'Kim', version: '2.0', date: '2026-10-18' });
  const pictures = [];
  const bytes = reportDocx(report, { image: (d) => { pictures.push(d.name); return { png: PNG, width: 800, height: 400 }; } });
  assert.equal(text(bytes.subarray(0, 2)), 'PK');
  const files = unzipStored(bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'docProps/core.xml']) assert.ok(files.has(name), name);
  const types = text(files.get('[Content_Types].xml'));
  assert.match(types, /<Default Extension="png" ContentType="image\/png"\/>/);
  assert.match(types, /PartName="\/word\/document.xml" ContentType="application\/vnd.openxmlformats-officedocument.wordprocessingml.document.main\+xml"/);
  assert.match(text(files.get('_rels/.rels')), /Target="word\/document.xml"/);
  const doc = text(files.get('word/document.xml'));
  assert.match(doc, /^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n<w:document /);
  assert.match(doc, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Online Shop<\/w:t>/);
  assert.match(doc, /Author: <\/w:t><\/w:r><w:r><w:t xml:space="preserve">Kim</);
  assert.match(doc, /<w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u <\/w:instrText>/);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(doc, /<w:pStyle w:val="Heading2"\/>(<w:pageBreakBefore w:val="0"\/>)?<\/w:pPr><w:r><w:t xml:space="preserve">Customer<\/w:t>/);
  assert.match(doc, /<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"\/>/);
  assert.match(doc, /<w:tblHeader\/>/);
  assert.match(doc, /<w:br w:type="page"\/>/);
  // Every diagram picture is in the package and referenced from the document.
  assert.ok(pictures.length >= 5, String(pictures.length));
  const rels = text(files.get('word/_rels/document.xml.rels'));
  for (let i = 1; i <= pictures.length; i++) {
    assert.ok(files.has(`word/media/image${i}.png`), `image ${i}`);
    assert.match(rels, new RegExp(`Id="rIdImg${i}" Type="[^"]+/image" Target="media/image${i}.png"`));
    assert.match(doc, new RegExp(`<a:blip r:embed="rIdImg${i}"/>`));
  }
  assert.deepEqual([...files.get('word/media/image1.png')], [...PNG]);
  // Pictures wider than the text are scaled down to it (6.27 in).
  const cx = Number(/<wp:extent cx="(\d+)"/.exec(doc)[1]);
  assert.ok(cx <= 5731510 && cx > 5000000, String(cx));
  // XML is well formed enough: every opened paragraph and table is closed.
  assert.equal((doc.match(/<w:p>|<w:p /g) ?? []).length, (doc.match(/<\/w:p>/g) ?? []).length);
  assert.equal((doc.match(/<w:tbl>/g) ?? []).length, (doc.match(/<\/w:tbl>/g) ?? []).length);
  assert.doesNotMatch(doc, /[\u0000-\u0008]/);
  assert.match(text(files.get('docProps/core.xml')), /<dc:title>Online Shop<\/dc:title><dc:subject>Full model report<\/dc:subject><dc:creator>Kim<\/dc:creator>/);
});

test('docx: escaping and a missing picture', () => {
  const project = sample();
  M.walk(project, (e) => { if (e.name === 'Customer') e.documentation = 'a < b & "c"\nnext line'; });
  const report = buildReport(project, { template: 'design', language: 'ko' });
  const doc = text(unzipStored(reportDocx(report, { image: () => null, noPicture: '(그림 없음)' })).get('word/document.xml'));
  assert.match(doc, /a &lt; b &amp; &quot;c&quot;<\/w:t><\/w:r><w:r><w:br\/><\/w:r><w:r><w:t xml:space="preserve">next line/);
  assert.match(doc, /\(그림 없음\)/);
  assert.match(doc, /설계 문서/);
  assert.doesNotMatch(doc, /<a:blip/);
});

test('templates: each one picks its elements, diagrams and sections', () => {
  const project = sample();
  const full = buildReport(project, { template: 'full', language: 'en' });
  assert.ok(kinds(full).has('cover') && kinds(full).has('toc') && kinds(full).has('image') && kinds(full).has('table'));
  assert.ok(h1(full).includes('Diagrams') && h1(full).includes('Requirements'));
  for (const name of ['Attributes', 'Operations', 'Relationships']) assert.ok(h3(full).has(name), name);

  const req = buildReport(project, { template: 'requirements', language: 'en' });
  const reqTable = req.blocks[req.blocks.findIndex((b) => b.kind === 'heading' && b.text === 'Requirements') + 1];
  assert.equal(reqTable.kind, 'table');
  assert.deepEqual(reqTable.head.slice(0, 3), ['ID', 'Name', 'Text']);
  assert.ok(reqTable.rows.length >= 5);
  assert.ok(!h3(req).has('Attributes') && !h3(req).has('Operations'));
  const reqNames = req.blocks.filter((b) => b.kind === 'heading' && b.level === 2).map((b) => b.id);
  const index = M.buildIndex(project);
  for (const id of reqNames) assert.ok(['SysMLRequirement', 'SysMLRequirementDiagram'].includes(index.get(id)._type), index.get(id)._type);

  const design = buildReport(project, { template: 'design', language: 'en' });
  assert.ok(h3(design).has('Attributes') && h3(design).has('Operations'));
  assert.ok(!h1(design).includes('Requirements'));
  const designTypes = new Set(design.blocks.filter((b) => b.kind === 'heading' && b.level === 2).map((b) => index.get(b.id)._type));
  assert.ok(designTypes.has('UMLClass') && designTypes.has('UMLClassDiagram'));
  assert.ok(!designTypes.has('UMLUseCase') && !designTypes.has('ERDEntity'));

  const usecase = buildReport(project, { template: 'usecase', language: 'en' });
  const ucTypes = new Set(usecase.blocks.filter((b) => b.kind === 'heading' && b.level === 2).map((b) => index.get(b.id)._type));
  assert.deepEqual([...ucTypes].sort(), ['UMLActor', 'UMLUseCase', 'UMLUseCaseDiagram'].filter((t) => ucTypes.has(t)).sort());
  assert.ok(ucTypes.has('UMLUseCase') && ucTypes.has('UMLUseCaseDiagram'));
  assert.ok(!h3(usecase).has('Operations'));

  const data = buildReport(project, { template: 'data', language: 'en' });
  const dataTypes = new Set(data.blocks.filter((b) => b.kind === 'heading' && b.level === 2).map((b) => index.get(b.id)._type));
  assert.deepEqual([...dataTypes].sort(), ['ERDDiagram', 'ERDEntity']);
  assert.ok(h3(data).has('Columns'));

  // Section switches override the template.
  const bare = buildReport(project, { template: 'full', language: 'en', sections: { cover: false, toc: false, diagrams: false, attributes: false } });
  assert.ok(!kinds(bare).has('cover') && !kinds(bare).has('toc') && !kinds(bare).has('image'));
  assert.ok(!h3(bare).has('Attributes') && h3(bare).has('Operations'));
  for (const id of REPORT_TEMPLATE_IDS) {
    const options = defaultReportOptions(id, 'en');
    assert.deepEqual(Object.keys(options.sections).filter((s) => options.sections[s]), REPORT_TEMPLATES[id].sections);
  }
});

test('scope: one package only; Korean headings', () => {
  const project = sample();
  const index = M.buildIndex(project);
  let pkg = null;
  M.walk(project, (e) => { if (!pkg && e._type === 'ERDDataModel') pkg = e; });
  const report = buildReport(project, { template: 'full', scopeId: pkg._id, language: 'ko' });
  assert.equal(report.title, pkg.name);
  for (const b of report.blocks.filter((x) => x.kind === 'heading' && x.level === 2)) assert.ok(M.isWithin(project, b.id, pkg._id, index), b.text);
  assert.ok(h1(report).includes('다이어그램'));
  assert.equal(report.blocks[0].rows[0][0], '작성자');
});

test('html: one page with cover, contents links and inline diagrams', () => {
  const report = buildReport(sample(), { template: 'design', language: 'en' });
  const html = reportHtml(report, { renderDiagram: (d) => `<svg data-d="${d.name}"></svg>` });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<section class="cover"><h1>Online Shop<\/h1><div class="sub">Design document \(classes \+ diagrams\)<\/div>/);
  assert.match(html, /<nav class="toc"><strong>Contents<\/strong>/);
  assert.match(html, /<svg data-d="[^"]+"><\/svg><\/div><figcaption>Figure 1\./);
  const targets = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(targets.has(href), href);
  assert.match(reportHtml(report, { renderDiagram: () => { throw new Error('x'); } }), /\(no picture\)/);
});

test('pdf: sheets with contents page numbers, then a PDF file', () => {
  const report = buildReport(sample(), { template: 'full', language: 'en' });
  const pages = reportPdfPages(report, { diagramSvg: () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="10" height="10"/></svg>', width: 1200, height: 900 }) });
  assert.ok(pages.length > 5, String(pages.length));
  for (const p of pages) { assert.match(p.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="794" height="1123"/); assert.doesNotMatch(p.svg, /NaN|undefined/); }
  assert.match(pages[0].svg, />Online Shop</);
  assert.match(pages[1].svg, />Contents</);
  assert.match(pages[1].svg, />Diagrams</);
  assert.match(pages.at(-1).svg, new RegExp(`>${pages.length} / ${pages.length}<`));
  // A diagram is drawn inside the text width.
  const nested = /<svg [^>]*viewBox="0 0 1200 900" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(pages.map((p) => p.svg).join(''));
  assert.ok(nested && Number(nested[1]) <= 794 - 2 * 68, nested?.[0]);
  // The contents page number of "Diagrams" is the sheet that has the heading.
  const number = Number(new RegExp('>Diagrams</text>.*?text-anchor="end">(\\d+)<').exec(pages[1].svg)[1]);
  assert.match(pages[number - 1].svg, /font-weight="700" fill="#1f3864">Diagrams</);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = pdfFromJpegs(pages.map(() => ({ jpeg, width: 10, height: 14 })), { title: report.title });
  assert.equal(text(pdf.subarray(0, 8)), '%PDF-1.4');
  assert.match(text(pdf), new RegExp(`/Count ${pages.length} `));
});
