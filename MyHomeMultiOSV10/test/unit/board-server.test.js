// The board server written with a published site: generated files, then the real server on SQLite3 (node:sqlite) —
// the site's pages, the posts it starts with, a post written through the API, views, and what it refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as S from '../../src/domain/site.js';
import { siteFiles } from '../../src/domain/publish.js';
import { boardServerFiles, databaseBoards, normalizeApi } from '../../src/export/board-server.js';
import { renderBlock } from '../../src/domain/blocks.js';

function boardSite(storage = 'database') {
  const site = S.createSite({ L: 'ko' });
  const block = S.createBlock('board', { L: 'ko', design: site.design });
  block.props.storage = storage;
  site.pages[0].blocks.push(block);
  return { site, block };
}

test('only boards that keep their posts in a database get a server; the password is never written', () => {
  assert.deepEqual(boardServerFiles(boardSite('site').site, { kind: 'sqlite' }), []);
  const { site, block } = boardSite();
  const files = boardServerFiles(site, { kind: 'mysql', host: 'db.example', port: 3307, database: 'shop', user: 'web', password: 'secret-pw' });
  assert.deepEqual(files.map((f) => f.path), ['server/server.js', 'server/package.json', 'server/config.json', 'server/README.md']);
  const all = files.map((f) => f.data).join('\n');
  assert.ok(!all.includes('secret-pw'));
  const config = JSON.parse(files.find((f) => f.path === 'server/config.json').data);
  assert.deepEqual(config.database, { kind: 'mysql', host: 'db.example', port: 3307, database: 'shop', user: 'web' });
  assert.equal(config.boards[block.id].seed.length, block.props.items.length);
  assert.deepEqual(JSON.parse(files.find((f) => f.path === 'server/package.json').data).dependencies, { mysql2: '^3.11.0' });
  assert.deepEqual(JSON.parse(boardServerFiles(site, { kind: 'postgres' })[1].data).dependencies, { pg: '^8.13.0' });
  assert.deepEqual(JSON.parse(boardServerFiles(site, { kind: 'mssql' })[1].data).dependencies, { mssql: '^11.0.1' });
  assert.deepEqual(JSON.parse(boardServerFiles(site, { kind: 'sqlite' })[1].data).dependencies, {});
  assert.equal(normalizeApi(' api//posts/ '), '/api/posts');
  assert.equal(normalizeApi('../x'), '/x');
  assert.equal(normalizeApi(''), '/api/board');
  assert.equal(databaseBoards(site)[0].posts[0].id, 'p00001');
});

test('a database board on the published page asks the server; in the editor it does not', () => {
  const { site, block } = boardSite();
  const ctx = (editor) => ({ editor, site, page: site.pages[0], pages: site.pages, L: 'ko' });
  const page = renderBlock(block, ctx(false));
  assert.match(page, new RegExp(`data-api="/api/board" data-board="${block.id}"`));
  assert.match(page, /class="hm-post hm-card hm-post-db"/);
  assert.match(page, /action="\/api\/board\/posts"/);
  assert.ok(!page.includes('enctype="text/plain"'));
  const editor = renderBlock(block, ctx(true));
  assert.ok(!editor.includes('data-api=') && !editor.includes('<script'));
});

const hasSqlite = await import('node:sqlite').then(() => true, () => false);

test('the board server runs on SQLite3: pages, starting posts, writing, views, refusals', { skip: !hasSqlite && 'node:sqlite is not available in this Node' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-board-'));
  const { site, block } = boardSite();
  for (const file of [...siteFiles(site), ...boardServerFiles(site, { kind: 'sqlite' })]) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
  const server = await import(`${pathToFileURL(path.join(dir, 'server', 'server.js')).href}?t=${Date.now()}`);
  const running = await server.start({ port: 0, quiet: true });
  const base = `http://127.0.0.1:${running.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), new RegExp(`data-board="${block.id}"`));
    assert.equal((await fetch(`${base}/server/config.json`)).status, 404, "the server's own folder is not served");
    assert.ok([403, 404].includes((await fetch(`${base}/..%2F..%2Fwindows/win.ini`)).status));

    const list = await (await fetch(`${base}/api/board/posts?board=${block.id}`)).json();
    assert.deepEqual(list.map((p) => p.title), block.props.items.map((p) => p.title), 'the board starts with the posts of the site');
    assert.equal((await fetch(`${base}/api/board/posts?board=nope`)).status, 404);

    const sent = await fetch(`${base}/api/board/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: block.id, title: '처음 글 <b>', name: '김하늘', category: '질문', message: '안녕하세요\n반갑습니다' }) });
    assert.equal(sent.status, 201);
    const { id } = await sent.json();
    assert.equal((await fetch(`${base}/api/board/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: block.id, title: '', name: 'x', message: 'y' }) })).status, 400);
    assert.equal((await fetch(`${base}/api/board/posts`, { method: 'POST', body: '{bad' })).status, 400);

    const after = await (await fetch(`${base}/api/board/posts?board=${block.id}`)).json();
    assert.equal(after.length, list.length + 1);
    assert.deepEqual({ ...after.at(-1), date: '' }, { id, title: '처음 글 <b>', category: '질문', author: '김하늘', date: '', views: 0, notice: false, body: '안녕하세요\n반갑습니다' });
    const read = await (await fetch(`${base}/api/board/posts/${id}?board=${block.id}`)).json();
    assert.equal(read.views, 1);
    assert.equal((await (await fetch(`${base}/api/board/posts/${id}?board=${block.id}`)).json()).views, 2);
  } finally {
    await running.close();
  }
  // A second start keeps what was written (the starting posts are only for an empty board).
  const again = await server.start({ port: 0, quiet: true });
  try {
    const list = await (await fetch(`http://127.0.0.1:${again.port}/api/board/posts?board=${block.id}`)).json();
    assert.equal(list.length, block.props.items.length + 1);
  } finally {
    await again.close();
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
