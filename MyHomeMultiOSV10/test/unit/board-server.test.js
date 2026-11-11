// The board server written with a published site: generated files, then the real server on SQLite3 (node:sqlite) —
// the site's pages, the posts it starts with, a post written through the API, views, and what it refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
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

test('Go and Rust board servers share the config and never write the password', () => {
  const { site, block } = boardSite();
  const db = { kind: 'mysql', host: 'db.example', port: 3307, database: 'shop', user: 'web', password: 'secret-pw' };
  const node = boardServerFiles(site, db);
  const go = boardServerFiles(site, db, { language: 'go' });
  const rust = boardServerFiles(site, db, { language: 'rust' });
  assert.deepEqual(go.map((f) => f.path), ['server/main.go', 'server/go.mod', 'server/config.json', 'server/README.md']);
  assert.deepEqual(rust.map((f) => f.path), ['server/Cargo.toml', 'server/src/main.rs', 'server/config.json', 'server/README.md']);
  assert.equal(go.find((f) => f.path === 'server/config.json').data, node.find((f) => f.path === 'server/config.json').data);
  assert.equal(rust.find((f) => f.path === 'server/config.json').data, node.find((f) => f.path === 'server/config.json').data);
  for (const files of [go, rust]) assert.ok(!files.map((f) => f.data).join('\n').includes('secret-pw'));
  assert.match(go.find((f) => f.path === 'server/go.mod').data, /github.com\/go-sql-driver\/mysql/);
  assert.match(go.find((f) => f.path === 'server/main.go').data, /myhomemaker_board_posts/);
  assert.match(go.find((f) => f.path === 'server/README.md').data, /go run \./);
  assert.match(rust.find((f) => f.path === 'server/Cargo.toml').data, /mysql = /);
  assert.match(rust.find((f) => f.path === 'server/src/main.rs').data, /myhomemaker_board_posts/);
  assert.match(rust.find((f) => f.path === 'server/README.md').data, /cargo run --release/);
  assert.match(boardServerFiles(site, { kind: 'sqlite' }, { language: 'go' }).find((f) => f.path === 'server/go.mod').data, /modernc.org\/sqlite/);
  assert.match(boardServerFiles(site, { kind: 'postgres' }, { language: 'go' }).find((f) => f.path === 'server/go.mod').data, /github.com\/lib\/pq/);
  assert.match(boardServerFiles(site, { kind: 'mssql' }, { language: 'go' }).find((f) => f.path === 'server/go.mod').data, /go-mssqldb/);
  assert.match(boardServerFiles(site, { kind: 'sqlite' }, { language: 'rust' }).find((f) => f.path === 'server/Cargo.toml').data, /rusqlite/);
  assert.match(boardServerFiles(site, { kind: 'postgres' }, { language: 'rust' }).find((f) => f.path === 'server/Cargo.toml').data, /postgres/);
  assert.match(boardServerFiles(site, { kind: 'mariadb' }, { language: 'rust' }).find((f) => f.path === 'server/Cargo.toml').data, /mysql/);
  assert.match(boardServerFiles(site, { kind: 'mssql' }, { language: 'rust' }).find((f) => f.path === 'server/Cargo.toml').data, /tiberius/);
  const python = boardServerFiles(site, db, { language: 'python' });
  assert.deepEqual(python.map((f) => f.path), ['server/server.py', 'server/requirements.txt', 'server/config.json', 'server/README.md']);
  assert.equal(python.find((f) => f.path === 'server/config.json').data, node.find((f) => f.path === 'server/config.json').data);
  assert.ok(!python.map((f) => f.data).join('\n').includes('secret-pw'));
  assert.match(python.find((f) => f.path === 'server/server.py').data, /myhomemaker_board_posts/);
  assert.match(python.find((f) => f.path === 'server/server.py').data, /DB_PASSWORD/);
  assert.match(python.find((f) => f.path === 'server/requirements.txt').data, /pymysql/);
  assert.match(python.find((f) => f.path === 'server/README.md').data, /python server\.py/);
  assert.match(boardServerFiles(site, { kind: 'sqlite' }, { language: 'python' }).find((f) => f.path === 'server/requirements.txt').data, /standard library/);
  assert.match(boardServerFiles(site, { kind: 'postgres' }, { language: 'python' }).find((f) => f.path === 'server/requirements.txt').data, /psycopg/);
  assert.match(boardServerFiles(site, { kind: 'mssql' }, { language: 'python' }).find((f) => f.path === 'server/requirements.txt').data, /pymssql/);
  assert.equal(boardServerFiles(site, { kind: 'sqlite' }, { language: 'nope' })[0].path, 'server/server.js');
  assert.ok(JSON.parse(node.find((f) => f.path === 'server/config.json').data).boards[block.id]);
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
const execFileAsync = promisify(execFile);

function hasTool(command) {
  return execFileAsync(command, ['version'], { windowsHide: true }).then(() => true, () => false);
}

const [hasGo, hasCargo, hasPython] = await Promise.all([hasTool('go'), hasTool('cargo'), hasTool('python')]);

function writePublished(dir, site, language) {
  for (const file of [...siteFiles(site), ...boardServerFiles(site, { kind: 'sqlite' }, { language })]) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
}

/** The same checks the Node server answers: pages, seed posts, a written post, views, refusals. */
async function exerciseBoard(base, block) {
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
  return block.props.items.length + 1;
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 11) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function listenProcess(command, args, cwd) {
  const child = spawn(command, args, { cwd, env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let settled = false;
  const port = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { settled = true; reject(new Error(`no LISTENING from ${command}\n${out}`)); }, 20000);
    const take = (chunk) => {
      out += chunk;
      const found = out.match(/LISTENING (\d+)/);
      if (!found || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Number(found[1]));
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.on('exit', (code) => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`${command} exited ${code}\n${out}`)); } });
  });
  return {
    port,
    close() {
      child.kill();
      return new Promise((resolve) => child.on('exit', () => resolve()));
    },
  };
}

test('the board server runs on SQLite3: pages, starting posts, writing, views, refusals', { skip: !hasSqlite && 'node:sqlite is not available in this Node' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-board-'));
  const { site, block } = boardSite();
  writePublished(dir, site, 'node');
  const server = await import(`${pathToFileURL(path.join(dir, 'server', 'server.js')).href}?t=${Date.now()}`);
  const running = await server.start({ port: 0, quiet: true });
  let kept = 0;
  try {
    kept = await exerciseBoard(`http://127.0.0.1:${running.port}`, block);
  } finally {
    await running.close();
  }
  // A second start keeps what was written (the starting posts are only for an empty board).
  const again = await server.start({ port: 0, quiet: true });
  try {
    const list = await (await fetch(`http://127.0.0.1:${again.port}/api/board/posts?board=${block.id}`)).json();
    assert.equal(list.length, kept);
  } finally {
    await again.close();
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the Go board server runs on SQLite3', { skip: !hasGo && 'Go is not installed', timeout: 360000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-board-go-'));
  const { site, block } = boardSite();
  writePublished(dir, site, 'go');
  const serverDir = path.join(dir, 'server');
  const exe = process.platform === 'win32' ? 'board-server.exe' : 'board-server';
  await execFileAsync('go', ['mod', 'tidy'], { cwd: serverDir, windowsHide: true, timeout: 180000 });
  await execFileAsync('go', ['build', '-o', exe, '.'], { cwd: serverDir, windowsHide: true, timeout: 180000 });
  const running = listenProcess(path.join(serverDir, exe), [], serverDir);
  let kept = 0;
  try {
    kept = await exerciseBoard(`http://127.0.0.1:${await running.port}`, block);
  } finally {
    await running.close();
  }
  const again = listenProcess(path.join(serverDir, exe), [], serverDir);
  try {
    const list = await (await fetch(`http://127.0.0.1:${await again.port}/api/board/posts?board=${block.id}`)).json();
    assert.equal(list.length, kept);
  } finally {
    await again.close();
  }
  await removeDir(dir);
});

test('the Rust board server runs on SQLite3', { skip: !hasCargo && 'Rust is not installed', timeout: 360000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-board-rust-'));
  const { site, block } = boardSite();
  writePublished(dir, site, 'rust');
  const serverDir = path.join(dir, 'server');
  await execFileAsync('cargo', ['build'], { cwd: serverDir, windowsHide: true, timeout: 300000 });
  const targetDir = process.env.CARGO_TARGET_DIR || path.join(serverDir, 'target');
  const exe = path.join(targetDir, 'debug', process.platform === 'win32' ? 'myhomemaker-board-server.exe' : 'myhomemaker-board-server');
  const running = listenProcess(exe, [], serverDir);
  let kept = 0;
  try {
    kept = await exerciseBoard(`http://127.0.0.1:${await running.port}`, block);
  } finally {
    await running.close();
  }
  const again = listenProcess(exe, [], serverDir);
  try {
    const list = await (await fetch(`http://127.0.0.1:${await again.port}/api/board/posts?board=${block.id}`)).json();
    assert.equal(list.length, kept);
  } finally {
    await again.close();
  }
  await removeDir(dir);
});

test('the Python board server runs on SQLite3', { skip: !hasPython && 'Python is not installed', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-board-py-'));
  const { site, block } = boardSite();
  writePublished(dir, site, 'python');
  const serverDir = path.join(dir, 'server');
  const running = listenProcess('python', ['server.py'], serverDir);
  let kept = 0;
  try {
    kept = await exerciseBoard(`http://127.0.0.1:${await running.port}`, block);
  } finally {
    await running.close();
  }
  const again = listenProcess('python', ['server.py'], serverDir);
  try {
    const list = await (await fetch(`http://127.0.0.1:${await again.port}/api/board/posts?board=${block.id}`)).json();
    assert.equal(list.length, kept);
  } finally {
    await again.close();
  }
  await removeDir(dir);
});
