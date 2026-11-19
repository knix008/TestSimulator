import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { exampleWorkspace } from '../../src/domain/examples.js';
import { exportDocument, jpegSize, toMarkdown, toPdf, toXlsx } from '../../src/domain/export/docexport.js';
import { encodeGif } from '../../src/domain/export/images.js';
import { exportFor, fileBase } from '../../src/domain/export/views.js';

const NOW = Date.parse('2026-11-19T09:00:00Z');
const text = (bytes) => new TextDecoder('latin1').decode(bytes);
const ctx = (id, view, ui = {}) => {
  const ws = exampleWorkspace(id, NOW, 'en');
  return { ws, project: ws.projects[0], ui: { view, ...ui }, user: ws.users[0], now: NOW, lang: 'en' };
};
// The smallest valid JPEG header with a SOF0 marker: 2×3 pixels.
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x02, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);

describe('Exporting screens', () => {
  test('the schedule exports its task table and a Gantt picture', () => {
    const spec = exportFor(ctx('site', 'schedule'));
    assert.match(spec.title, /Construction site — Schedule/);
    assert.equal(spec.blocks[1].rows.length, 24);
    assert.match(spec.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(spec.svg, /Excavation/);
  });

  test('Kanban and Scrum boards, the backlog with sprints, the planner, issues and the trace', () => {
    const kanban = exportFor(ctx('school', 'board', { boardId: 'board-kanban' }));
    assert.ok(kanban.blocks.some((b) => b.type === 'h' && /To Do/.test(b.text)));
    assert.match(kanban.svg, /SCHL-/);
    const car = ctx('car', 'board');
    car.ui.boardId = car.project.boards.find((board) => board.type === 'scrum').id;
    const scrum = exportFor(car);
    assert.match(scrum.subtitle, /Sprint 2/);
    const backlog = exportFor(ctx('car', 'backlog'));
    assert.ok(backlog.blocks.some((b) => b.type === 'h' && /Sprint 3/.test(b.text)));
    const planner = exportFor(ctx('car', 'planner', { planner: { date: '2026-11-19', scope: 'project' } }));
    assert.match(planner.title, /2026\.11/);
    assert.ok(planner.blocks[0].rows.length > 5);
    assert.match(planner.svg, /CARX-/);
    assert.equal(exportFor(ctx('car', 'issues')).svg, null);
    assert.ok(exportFor(ctx('device', 'trace')).blocks[0].rows.length === 9);
    assert.equal(fileBase('Construction site — Schedule'), 'Construction_site-Schedule');
  });

  test('every document format is written', () => {
    const spec = exportFor(ctx('car', 'backlog'));
    const doc = { title: spec.title, blocks: spec.blocks };
    assert.match(exportDocument(doc, 'html'), /<table>/);
    assert.match(exportDocument(doc, 'markdown'), /\| Key \| Summary/);
    for (const format of ['pdf', 'docx', 'xlsx']) assert.ok(exportDocument(doc, format) instanceof Uint8Array, format);
  });

  test('Markdown embeds a picture or links it by file name', () => {
    const embedded = toMarkdown({ title: 'T', blocks: [{ type: 'image', caption: 'Gantt', dataUrl: 'data:image/png;base64,AAAA' }] });
    assert.match(embedded, /!\[Gantt\]\(data:image\/png;base64,AAAA\)/);
    const linked = toMarkdown({ title: 'T', blocks: [{ type: 'image', caption: 'Gantt', dataUrl: 'data:image/png;base64,AAAA', href: 'Plan.webp' }] });
    assert.match(linked, /!\[Gantt\]\(Plan\.webp\)/);
  });

  test('Excel: one sheet per table, named by its heading, header frozen', () => {
    const bytes = toXlsx({ title: 'Plan', blocks: [{ type: 'h', text: 'Sprint 1' }, { type: 'table', columns: [{ label: 'Key' }, { label: 'Points', num: true }], rows: [{ cells: ['A-1', '5'] }] }, { type: 'h', text: 'Sprint 2' }, { type: 'table', columns: [{ label: 'Key' }], rows: [] }] });
    const body = text(bytes);
    assert.equal(body.slice(0, 2), 'PK');
    assert.match(body, /<sheet name="Sprint 1" sheetId="1"/);
    assert.match(body, /<sheet name="Sprint 2" sheetId="2"/);
    assert.match(body, /state="frozen"/);
    assert.match(body, /<c r="B2"><v>5<\/v><\/c>/);
  });

  test('PDF puts a JPEG picture on its own page before the text', () => {
    assert.deepEqual(jpegSize(JPEG), [2, 3]);
    const url = `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`;
    const pdf = text(toPdf({ title: 'Plan', blocks: [{ type: 'image', jpeg: url, caption: 'Gantt' }, { type: 'p', text: 'Hello' }] }));
    assert.match(pdf, /^%PDF-1\.4/);
    assert.match(pdf, /\/Subtype \/Image \/Width 2 \/Height 3/);
    assert.match(pdf, /\/Count 2/);
    assert.match(pdf, /%%EOF\n$/);
  });

  test('GIF pictures are written here (the canvas cannot)', () => {
    const rgba = new Uint8Array(4 * 4 * 4).fill(200);
    const gif = encodeGif(4, 4, rgba);
    assert.equal(text(gif.slice(0, 6)), 'GIF89a');
  });
});
