import assert from 'node:assert/strict';
import test from 'node:test';
import { AttachmentStore, attachmentIcon, attachmentIds, mimeFor, splitDataUrl, toDataUrl } from '../../src/domain/attachments.js';
import * as B from '../../src/domain/board.js';
import { parseFile, serialize } from '../../src/domain/format.js';
import { fromPlain, sanitize, toPlain } from '../../src/domain/markup.js';
import { monthGrid, parseDate } from '../../src/calendar.js';
import {
  createProject, dbConfig, isProjectFileName, normalizeStorage, parseProject, resolveFile, serializeProject, storageProblems, withProjectExtension,
} from '../../src/domain/project.js';

const boardWith = (title, cards = 2) => {
  const board = B.createBoard({ title, columns: ['A', 'B'] });
  for (let i = 0; i < cards; i++) B.addCard(board, board.columns[0].id, { title: `${title} ${i}` });
  return board;
};

test('local project: boards and attachments live inside the .mkproj file', () => {
  const project = createProject({ name: '로컬 프로젝트' });
  const boards = [boardWith('one'), boardWith('two', 5)];
  const store = new AttachmentStore();
  const id = store.add(toDataUrl('text/plain', btoa('hello')));
  B.updateCard(boards[0], boards[0].columns[0].cards[0].id, { attachments: [{ id, name: 'a.txt', size: 5, type: 'text/plain' }] });
  const text = serializeProject(project, boards, store.collect(...boards));
  const back = parseProject(text);
  assert.equal(back.project.name, '로컬 프로젝트');
  assert.equal(back.project.id, project.id);
  assert.deepEqual(back.project.boards.map((b) => b.title), ['one', 'two']);
  assert.deepEqual(back.boards, boards);
  assert.equal(back.attachments[id], store.get(id));
});

test('database project: only the board list and settings go into the file; password only when saved', () => {
  const project = createProject({ name: 'DB', storage: { kind: 'mariadb', host: 'db', database: 'kanban', user: 'me', password: 'secret', savePassword: false } });
  const text = serializeProject(project, [boardWith('x')], { a: 'data:text/plain;base64,eA==' });
  assert.ok(!text.includes('secret'), 'password not written');
  assert.ok(!text.includes('"columns"'), 'boards are not embedded');
  assert.ok(!text.includes('"attachments"'), 'attachments are not embedded');
  const back = parseProject(text);
  assert.equal(back.project.storage.kind, 'mariadb');
  assert.equal(back.project.storage.port, 3306, 'default port');
  assert.deepEqual(back.boards, []);
  project.storage.savePassword = true;
  assert.ok(serializeProject(project, []).includes('secret'), 'saved when asked');
});

test('parseProject rejects other files', () => {
  assert.throws(() => parseProject('{x'), /format.invalidJson/);
  assert.throws(() => parseProject('{"format":"mykanbanboard","board":{"columns":[]}}'), /project.notProject/);
  assert.throws(() => parseProject('{"format":"mykanbanboard-project","version":9,"project":{}}'), /format.newerVersion/);
});

test('storage settings are validated and repaired', () => {
  assert.deepEqual(storageProblems(normalizeStorage({ kind: 'local' })), []);
  assert.deepEqual(storageProblems(normalizeStorage({ kind: 'sqlite' })), ['project.needFile']);
  assert.deepEqual(storageProblems({ ...normalizeStorage({ kind: 'postgres' }), database: 'bad name;' }), ['project.badDatabase']);
  assert.deepEqual(storageProblems({ ...normalizeStorage({ kind: 'mysql' }), host: ' ', database: '' }), ['project.needHost', 'project.needDatabase']);
  const s = normalizeStorage({ kind: 'oracle', port: 99999 });
  assert.equal(s.kind, 'local');
  assert.equal(normalizeStorage({ kind: 'postgres' }).port, 5432);
});

test('SQLite paths are relative to the project file', () => {
  assert.equal(resolveFile('data.db', 'C:\\work\\plan.mkproj'), 'C:\\work\\data.db');
  assert.equal(resolveFile('db/x.db', '/home/u/p.mkproj'), '/home/u/db/x.db');
  assert.equal(resolveFile('D:\\abs.db', 'C:\\work\\plan.mkproj'), 'D:\\abs.db');
  const config = dbConfig({ ...normalizeStorage({ kind: 'sqlite' }), file: 'k.db' }, { projectPath: 'C:\\p\\a.mkproj' });
  assert.equal(config.file, 'C:\\p\\k.db');
  assert.equal(dbConfig(normalizeStorage({ kind: 'mysql' }), { password: 'pw' }).password, 'pw');
  assert.ok(isProjectFileName('x.MKPROJ') && !isProjectFileName('x.mkanban'));
  assert.equal(withProjectExtension('C:/a/p'), 'C:/a/p.mkproj');
});

test('attachments: contents stay out of undo snapshots and travel with the board file', () => {
  const store = new AttachmentStore();
  const board = boardWith('b', 1);
  const card = board.columns[0].cards[0];
  const big = toDataUrl('image/png', 'A'.repeat(100_000));
  const id = store.add(big);
  B.updateCard(board, card.id, { attachments: [{ id, name: 'p.png', size: 75_000, type: 'image/png', thumb: 'data:image/webp;base64,xx', width: 10, height: 20 }] });
  assert.ok(JSON.stringify(board).length < 5000, 'the board holds only metadata');
  assert.deepEqual(attachmentIds(board), [id]);
  const text = serialize(board, store.collect(board));
  const { board: back, attachments } = parseFile(text);
  assert.equal(back.columns[0].cards[0].attachments[0].name, 'p.png');
  assert.equal(attachments[id], big);
  const other = new AttachmentStore();
  other.merge({ ...attachments, junk: 'not a data url' });
  assert.ok(other.has(id) && !other.has('junk'));
  // Copies share the contents.
  const [copy] = B.duplicateCards(back, [back.columns[0].cards[0].id]);
  assert.equal(copy.attachments[0].id, id);
});

test('attachment helpers', () => {
  assert.deepEqual(splitDataUrl('data:image/png;base64,QUJD'), { type: 'image/png', base64: 'QUJD' });
  assert.equal(splitDataUrl('nope'), null);
  assert.equal(mimeFor('사진.JPG'), 'image/jpeg');
  assert.equal(mimeFor('x.unknown'), 'application/octet-stream');
  assert.equal(attachmentIcon('image/png'), 'image');
  assert.equal(attachmentIcon('application/zip'), 'paperclip');
  const card = B.createCard({ attachments: [{ id: 'a', name: 'x', thumb: 'javascript:alert(1)' }, { name: 'no id' }] });
  assert.equal(card.attachments.length, 1);
  assert.equal(card.attachments[0].thumb, '', 'only image data URLs are kept as thumbnails');
  assert.ok(B.matchesFilter(B.createCard({ title: 't', attachments: [{ id: 'z', name: 'report.pdf' }] }), { text: 'report' }), 'search finds attachment names');
});

test('formatted descriptions: only font styles survive, scripts are dropped', () => {
  const dirty = '<p onclick="x()">a<span style="font-size: 18px; color: red; font-weight: 700" class="k">b</span><script>alert(1)</script><img src=x onerror=y><b>c</b></p><a href="javascript:z">d</a>';
  assert.equal(sanitize(dirty), '<p>a<span style="font-size: 18px; font-weight: 700">b</span><b>c</b></p>d');
  assert.equal(sanitize('<span style="font-family: expression(alert(1))">x</span>'), '<span>x</span>');
  assert.equal(sanitize('<b>open'), '<b>open</b>', 'unclosed tags are closed');
  assert.equal(toPlain('a<br>b<div>c</div>'), 'a\nb\nc');
  assert.equal(fromPlain('x < y\nz'), 'x &lt; y<br>z');
});

test('cards keep formatted and plain descriptions in step', () => {
  const board = B.createBoard({ columns: ['A'] });
  const card = B.addCard(board, board.columns[0].id, { title: 't', descriptionHtml: '<b>bold</b> text<script>x</script>' });
  assert.equal(card.descriptionHtml, '<b>bold</b> text');
  assert.equal(card.description, 'bold text');
  B.updateCard(board, card.id, { descriptionHtml: '<span style="font-size: 20px">big</span>' });
  assert.equal(card.description, 'big');
  B.updateCard(board, card.id, { description: 'plain only' });
  assert.equal(card.descriptionHtml, '', 'plain edits drop the old formatting');
  assert.ok(B.matchesFilter(B.createCard({ descriptionHtml: '<i>needle</i>' }), { text: 'needle' }));
});

test('calendar: date parsing and month grid', () => {
  assert.equal(parseDate('2026-2-3'), '2026-02-03');
  assert.equal(parseDate('2026.12.31'), '2026-12-31');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('soon'), null);
  const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(grid.length, 42);
  assert.equal(grid[0].iso, '2026-09-28', 'weeks start on Monday');
  assert.equal(grid.filter((cell) => !cell.outside).length, 31);
  assert.ok(grid.find((cell) => cell.iso === '2026-10-04').weekend);
});
