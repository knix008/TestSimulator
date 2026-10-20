// Import / export: every format round-trips the outline (text, levels,
// notes) and the parts it supports; the ZIP container reads what it wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { allTopics, findTopic } from '../src/lib/model.js';
import { mapFromTemplate } from '../src/lib/templates.js';
import { importOpml, exportOpml, importMarkdown, exportMarkdown, importTextOutline, exportTextOutline, exportHtml, exportCsv } from '../src/lib/formats/outline.js';
import { importFreeMind, exportFreeMind } from '../src/lib/formats/freemind.js';
import { importXmind, exportXmind } from '../src/lib/formats/xmind.js';
import { importMmap } from '../src/lib/formats/mmap.js';
import { exportDocx } from '../src/lib/formats/docx.js';
import { buildPdf } from '../src/lib/formats/pdf.js';
import { parseXml } from '../src/lib/formats/xml.js';

const require = createRequire(import.meta.url);
const { readZip, writeZip } = require('../core/zip.js');

const shape = (map) => {
  const out = [];
  const walk = (t, d) => { out.push(`${d}:${t.text}`); (t.children || []).forEach((c) => walk(c, d + 1)); };
  walk(map.root, 0);
  return out;
};

const source = () => {
  const map = mapFromTemplate('project', 'ko');
  // a note and a multi-word topic to carry through
  const first = map.root.children[0];
  return { ...map, root: { ...map.root, notes: '메모 첫 줄\n둘째 줄', children: [{ ...first, notes: 'phase note' }, ...map.root.children.slice(1)] } };
};

test('OPML round trip', () => {
  const map = source();
  const back = importOpml(exportOpml(map));
  assert.deepEqual(shape(back), shape(map));
  assert.equal(back.root.notes, map.root.notes);
});

test('Markdown round trip (headings and lists)', () => {
  const map = source();
  const md = exportMarkdown(map);
  assert.ok(md.startsWith('# 신제품 출시 프로젝트'));
  const back = importMarkdown(md);
  assert.deepEqual(shape(back), shape(map));
  assert.equal(back.root.children[0].notes.split('\n').pop(), 'phase note');
  const nested = importMarkdown('# R\n## A\n- a1\n  - a11\n- a2\n## B\ntext under B');
  assert.deepEqual(shape(nested), ['0:R', '1:A', '2:a1', '3:a11', '2:a2', '1:B']);
  assert.equal(nested.root.children[1].notes, 'text under B');
});

test('text outline round trip', () => {
  const map = source();
  assert.deepEqual(shape(importTextOutline(exportTextOutline(map))), shape(map));
});

test('FreeMind round trip with icons, notes, folding and arrows', () => {
  const map = source();
  map.relationships = [{ id: 'r1', from: map.root.children[0].id, to: map.root.children[1].id, label: 'needs' }];
  map.root.children[1] = { ...map.root.children[1], collapsed: true };
  const xml = exportFreeMind(map);
  parseXml(xml);
  const back = importFreeMind(xml);
  assert.deepEqual(shape(back), shape(map));
  assert.equal(back.root.children[1].collapsed, true);
  assert.equal(back.relationships.length, 1);
  assert.equal(back.relationships[0].label, 'needs');
  const pr = allTopics(back).find((t) => t.task && t.task.priority === 1);
  assert.ok(pr, 'priorities survive as full-N icons');
});

test('XMind round trip through a real ZIP', () => {
  const map = source();
  map.relationships = [{ id: 'r1', from: map.root.children[0].id, to: map.root.children[2].id, label: 'x' }];
  const files = exportXmind(map);
  const zip = writeZip(files.map((f) => ({ name: f.name, data: f.text })));
  const entries = readZip(zip).map((e) => ({ name: e.name, text: e.data.toString('utf8') }));
  const back = importXmind(entries);
  assert.deepEqual(shape(back), shape(map));
  assert.equal(back.relationships.length, 1);
  const done = allTopics(back).filter((t) => t.task && t.task.progress === 100);
  assert.ok(done.length >= 1, 'progress survives as task markers');
});

test('XMind 8 content.xml is read', () => {
  const xml = `<?xml version="1.0"?><xmap-content><sheet id="s"><topic id="r"><title>Root</title><children><topics type="attached"><topic id="a"><title>A</title><marker-refs><marker-ref marker-id="priority-2"/></marker-refs><notes><plain>note A</plain></notes></topic><topic id="b"><title>B &amp; C</title></topic></topics></children></topic><relationships><relationship end1="a" end2="b"><title>link</title></relationship></relationships></sheet></xmap-content>`;
  const map = importXmind([{ name: 'content.xml', text: xml }]);
  assert.deepEqual(shape(map), ['0:Root', '1:A', '1:B & C']);
  assert.equal(map.root.children[0].task.priority, 2);
  assert.equal(map.root.children[0].notes, 'note A');
  assert.equal(map.relationships[0].label, 'link');
});

test('MindManager Document.xml is read', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<ap:OneTopic><ap:Topic OId="R"><ap:SubTopics>
  <ap:Topic OId="A"><ap:Text PlainText="Plan"/><ap:Task TaskPriority="urn:mindjet:Prio2" TaskPercentage="50" StartDate="2026-01-05T08:00:00" DueDate="2026-01-09T17:00:00" Resources="Kim;Lee"/>
    <ap:IconsGroup><ap:Icons><ap:Icon xsi:type="ap:StockIcon" IconType="urn:mindjet:FlagRed"/></ap:Icons></ap:IconsGroup>
    <ap:NotesGroup><ap:NotesXhtmlData PreviewPlainText="Plan notes"/></ap:NotesGroup>
    <ap:TextLabels><ap:TextLabel TextLabelName="Q1"/></ap:TextLabels>
    <ap:SubTopics><ap:Topic OId="A1"><ap:Text PlainText="Step"/></ap:Topic></ap:SubTopics></ap:Topic>
  <ap:Topic OId="B"><ap:Text PlainText="Do"/><ap:Hyperlink Url="https://example.com"/></ap:Topic>
</ap:SubTopics><ap:Text PlainText="Central"/></ap:Topic></ap:OneTopic>
<ap:Relationships><ap:Relationship><ap:ConnectionGroup Index="0"><ap:Connection><ap:ObjectReference OIdRef="A1"/></ap:Connection></ap:ConnectionGroup><ap:ConnectionGroup Index="1"><ap:Connection><ap:ObjectReference OIdRef="B"/></ap:Connection></ap:ConnectionGroup></ap:Relationship></ap:Relationships>
</ap:Map>`;
  const map = importMmap([{ name: 'Document.xml', text: xml }]);
  assert.deepEqual(shape(map), ['0:Central', '1:Plan', '2:Step', '1:Do']);
  const plan = map.root.children[0];
  assert.deepEqual(plan.task, { priority: 2, progress: 50, start: '2026-01-05', due: '2026-01-09', resources: 'Kim, Lee' });
  assert.deepEqual(plan.icons, ['flag-red']);
  assert.deepEqual(plan.tags, ['Q1']);
  assert.equal(plan.notes, 'Plan notes');
  assert.equal(map.root.children[1].link.url, 'https://example.com');
  assert.equal(map.relationships.length, 1);
});

test('HTML, CSV, Word and PDF exports are well formed', () => {
  const map = source();
  const html = exportHtml(map, { svg: '<svg></svg>' });
  assert.ok(html.includes('<details') && html.includes('신제품'));
  const csv = exportCsv(map);
  assert.equal(csv.split('\r\n').length, allTopics(map).length + 2);
  const files = exportDocx(map, { image: { base64: 'iVBORw0KGgo=', width: 800, height: 400 } });
  const doc = files.find((f) => f.name === 'word/document.xml');
  parseXml(doc.text);
  assert.ok(doc.text.includes('Heading1'));
  const zip = writeZip(files.map((f) => ({ name: f.name, data: f.base64 ? Buffer.from(f.base64, 'base64') : f.text })));
  assert.equal(readZip(zip).length, files.length);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = Buffer.from(buildPdf([{ jpeg, width: 100, height: 50 }], { title: '맵' })).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
  const xref = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.equal(pdf.slice(xref, xref + 4), 'xref');
  assert.ok(findTopic(map, map.root.id));
});
