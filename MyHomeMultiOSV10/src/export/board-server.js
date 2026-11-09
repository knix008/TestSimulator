// The board server written next to a published site whose bulletin boards keep their posts in a
// database (board block "Posts are kept: Database"): server/server.js serves the site and the
// board API (/api/board by default) on the database chosen in Settings › Database — SQLite3
// through Node's own node:sqlite, MySQL/MariaDB (mysql2), PostgreSQL (pg) or MSSQL (mssql).
// The table is the one the editor reads and writes (src-tauri/src/db.rs), so posts written on the
// website appear in the editor (Load posts from the database) and the other way round.
// The password is never written: the server reads it from the DB_PASSWORD environment variable.

/** The boards of a site that use a database: [{ id, page, api, posts }]. */
export function databaseBoards(site) {
  const out = [];
  for (const page of site?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      if (block.type === 'board' && block.props?.storage === 'database') {
        out.push({ id: block.id, page: page.slug, api: normalizeApi(block.props.api), posts: (block.props.items ?? []).map((it, i) => ({ id: String(it.id ?? '') || `p${String(i + 1).padStart(5, '0')}`, title: String(it.title ?? ''), category: String(it.category ?? ''), author: String(it.author ?? ''), date: String(it.date ?? ''), views: Math.max(0, Math.round(Number(it.views) || 0)), notice: Boolean(it.notice), body: String(it.body ?? '') })) });
      }
    }
  }
  return out;
}

/** "/api/board" form: starts with one slash, no slash at the end, no dots or odd characters. */
export function normalizeApi(value) {
  const clean = String(value ?? '').trim().replace(/[^A-Za-z0-9/_-]/g, '').replace(/\/+/g, '/').replace(/\/$/, '');
  return clean && clean !== '/' ? (clean.startsWith('/') ? clean : `/${clean}`) : '/api/board';
}

const DRIVERS = { mysql: { name: 'mysql2', version: '^3.11.0' }, mariadb: { name: 'mysql2', version: '^3.11.0' }, postgres: { name: 'pg', version: '^8.13.0' }, mssql: { name: 'mssql', version: '^11.0.1' } };

/**
 * The files of the board server (paths under server/), or [] when no board uses a database.
 * db: the connection settings (settings.js dbConfig shape; the password is left out on purpose).
 */
export function boardServerFiles(site, db, { L = site?.meta?.language === 'en' ? 'en' : 'ko', sqliteFile = 'board.db' } = {}) {
  const boards = databaseBoards(site);
  if (!boards.length) return [];
  const kind = ['sqlite', 'mysql', 'mariadb', 'postgres', 'mssql'].includes(db?.kind) ? db.kind : 'sqlite';
  const apis = [...new Set(boards.map((b) => b.api))];
  const config = {
    port: 8080,
    api: apis[0],
    siteDir: '..',
    database: kind === 'sqlite'
      ? { kind, file: sqliteFile }
      : { kind, host: db?.host || 'localhost', port: db?.port ?? null, database: db?.database || 'myhomemaker', user: db?.user || '' },
    boards: Object.fromEntries(boards.map((b) => [b.id, { page: `${b.page === 'index' ? 'index' : b.page}.html`, seed: b.posts }])),
  };
  const driver = DRIVERS[kind];
  const pkg = {
    name: 'myhomemaker-board-server',
    private: true,
    version: '1.0.0',
    description: 'Board server for a site made with MyHomeMaker',
    type: 'module',
    main: 'server.js',
    engines: { node: kind === 'sqlite' ? '>=22.13' : '>=18' },
    scripts: { start: 'node server.js' },
    dependencies: driver ? { [driver.name]: driver.version } : {},
  };
  return [
    { path: 'server/server.js', data: SERVER_JS },
    { path: 'server/package.json', data: `${JSON.stringify(pkg, null, 2)}\n` },
    { path: 'server/config.json', data: `${JSON.stringify(config, null, 2)}\n` },
    { path: 'server/README.md', data: readme(kind, config, L) },
  ];
}

function readme(kind, config, L) {
  const names = { sqlite: 'SQLite3', mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', mssql: 'MSSQL' };
  const install = kind === 'sqlite' ? '' : 'npm install\n';
  const password = kind === 'sqlite' ? '' : L === 'en' ? 'set DB_PASSWORD=your-password      (macOS/Linux: export DB_PASSWORD=your-password)\n' : 'set DB_PASSWORD=비밀번호      (macOS/Linux: export DB_PASSWORD=비밀번호)\n';
  if (L === 'en') {
    return `# Board server

The bulletin boards of this site keep their posts in a database (${names[kind]}). This small server shows the site and answers the boards (\`${config.api}\`).

## Run it

Node.js ${kind === 'sqlite' ? '22.13 or later' : '18 or later'} is needed. In this folder:

\`\`\`
${install}${password}npm start
\`\`\`

Then open http://localhost:${config.port}/ (another port: \`set PORT=3000\`).

- \`config.json\` holds the connection (no password: it is read from \`DB_PASSWORD\`) and, for each board, the posts it starts with when its table is still empty.
- The table \`myhomemaker_board_posts\` is made on the first start. MyHomeMaker reads and writes the same table (board › *Load posts from the database* / *Save posts to the database*).
- Posts written on the website go straight to the database. Check them from time to time, and delete what does not belong there in MyHomeMaker.
- Opening the HTML files without this server still works: the boards then show the posts written into the pages.
`;
  }
  return `# 게시판 서버

이 사이트의 게시판은 글을 데이터베이스(${names[kind]})에 둡니다. 이 작은 서버가 사이트를 보여 주고 게시판 요청(\`${config.api}\`)에 답합니다.

## 실행

Node.js ${kind === 'sqlite' ? '22.13 이상' : '18 이상'}이 필요합니다. 이 폴더에서:

\`\`\`
${install}${password}npm start
\`\`\`

그다음 http://localhost:${config.port}/ 을 엽니다(다른 포트: \`set PORT=3000\`).

- \`config.json\` 에는 연결 정보(비밀번호는 없음 — \`DB_PASSWORD\` 환경 변수에서 읽음)와, 게시판마다 표가 비어 있을 때 처음 넣을 글이 들어 있습니다.
- \`myhomemaker_board_posts\` 표는 처음 실행할 때 만들어집니다. MyHomeMaker 도 같은 표를 읽고 씁니다(게시판 › *DB에서 글 가져오기* / *DB로 글 저장*).
- 웹사이트에서 쓴 글은 바로 데이터베이스에 들어갑니다. 가끔 확인하고, 맞지 않는 글은 MyHomeMaker 에서 지우세요.
- 이 서버 없이 HTML 파일을 열어도 됩니다. 그때 게시판은 페이지에 들어 있는 글을 보여 줍니다.
`;
}

/** server/server.js (no build step; ES module). */
export const SERVER_JS = `// MyHomeMaker board server: the site in config.siteDir and the board API (GET posts, GET a post, POST a post).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const siteDir = path.resolve(here, config.siteDir ?? '..');
const API = String(config.api ?? '/api/board').replace(/\\/+$/, '');
const TABLE = 'myhomemaker_board_posts';
const BOARDS = config.boards ?? {};
const LIMITS = { title: 500, category: 100, author: 200, body: 20000 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

// ── the database: run(sql, params) and all(sql, params) with "?" placeholders, for every kind

async function openDatabase(db) {
  const password = process.env.DB_PASSWORD ?? '';
  const kind = db.kind;
  if (kind === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const file = path.resolve(here, db.file || 'board.db');
    const conn = new DatabaseSync(file);
    return { kind, all: async (sql, params = []) => conn.prepare(sql).all(...params), run: async (sql, params = []) => { conn.prepare(sql).run(...params); }, close: async () => conn.close() };
  }
  if (kind === 'mysql' || kind === 'mariadb') {
    const mysql = await import('mysql2/promise');
    const pool = mysql.createPool({ host: db.host, port: db.port || 3306, database: db.database, user: db.user, password, charset: 'utf8mb4', connectionLimit: 5 });
    return { kind, all: async (sql, params = []) => (await pool.execute(sql, params))[0], run: async (sql, params = []) => { await pool.execute(sql, params); }, close: () => pool.end() };
  }
  if (kind === 'postgres') {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ host: db.host, port: db.port || 5432, database: db.database, user: db.user, password, max: 5 });
    const numbered = (sql) => { let n = 0; return sql.replace(/\\?/g, () => \`$\${++n}\`); };
    return { kind, all: async (sql, params = []) => (await pool.query(numbered(sql), params)).rows, run: async (sql, params = []) => { await pool.query(numbered(sql), params); }, close: () => pool.end() };
  }
  if (kind === 'mssql') {
    const { default: mssql } = await import('mssql');
    const pool = await mssql.connect({ server: db.host, port: db.port || 1433, database: db.database, user: db.user, password, options: { encrypt: true, trustServerCertificate: true } });
    const request = (sql, params) => { const r = pool.request(); let n = 0; const text = sql.replace(/\\?/g, () => { n += 1; return \`@p\${n}\`; }); params.forEach((value, i) => r.input(\`p\${i + 1}\`, value)); return r.query(text); };
    return { kind, all: async (sql, params = []) => (await request(sql, params)).recordset, run: async (sql, params = []) => { await request(sql, params); }, close: () => pool.close() };
  }
  throw new Error(\`unknown database kind: \${kind}\`);
}

function schema(kind) {
  if (kind === 'mssql') return \`IF OBJECT_ID(N'\${TABLE}', N'U') IS NULL CREATE TABLE \${TABLE} (board_id NVARCHAR(80) NOT NULL, post_id NVARCHAR(80) NOT NULL, title NVARCHAR(500) NOT NULL, category NVARCHAR(100) NOT NULL, author NVARCHAR(200) NOT NULL, post_date NVARCHAR(40) NOT NULL, views BIGINT NOT NULL, notice BIGINT NOT NULL, body NVARCHAR(MAX) NOT NULL, created NVARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))\`;
  const [text, int, suffix] = kind === 'mysql' || kind === 'mariadb' ? ['LONGTEXT', 'BIGINT', ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'] : kind === 'sqlite' ? ['TEXT', 'INTEGER', ''] : ['TEXT', 'BIGINT', ''];
  return \`CREATE TABLE IF NOT EXISTS \${TABLE} (board_id VARCHAR(80) NOT NULL, post_id VARCHAR(80) NOT NULL, title VARCHAR(500) NOT NULL, category VARCHAR(100) NOT NULL, author VARCHAR(200) NOT NULL, post_date VARCHAR(40) NOT NULL, views \${int} NOT NULL, notice \${int} NOT NULL, body \${text} NOT NULL, created VARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))\${suffix}\`;
}

const row = (r) => ({ id: String(r.post_id), title: String(r.title), category: String(r.category), author: String(r.author), date: String(r.post_date), views: Number(r.views) || 0, notice: Number(r.notice) !== 0, body: String(r.body) });
const COLUMNS = 'post_id, title, category, author, post_date, views, notice, body';

/** A board whose table has no posts yet starts with the posts written into the site. */
async function seed(db) {
  for (const [board, info] of Object.entries(BOARDS)) {
    const [{ n }] = await db.all(\`SELECT COUNT(*) AS n FROM \${TABLE} WHERE board_id = ?\`, [board]);
    if (Number(n) > 0) continue;
    let i = 0;
    for (const p of info.seed ?? []) {
      i += 1;
      await db.run(\`INSERT INTO \${TABLE} (board_id, \${COLUMNS}, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`, [board, String(p.id || \`p\${String(i).padStart(5, '0')}\`).slice(0, 80), cut(p.title, LIMITS.title), cut(p.category, LIMITS.category), cut(p.author, LIMITS.author), cut(p.date, 40), Number(p.views) || 0, p.notice ? 1 : 0, cut(p.body, LIMITS.body), String(i).padStart(6, '0')]);
    }
  }
}

const cut = (value, max) => [...String(value ?? '')].slice(0, max).join('');

// ── HTTP

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => { size += chunk.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
    req.on('error', reject);
  });
}

async function api(db, req, res, url) {
  const rest = url.pathname.slice(API.length);
  const board = url.searchParams.get('board') ?? '';
  if (req.method === 'GET' && rest === '/posts') {
    if (!BOARDS[board]) return send(res, 404, { error: 'unknown board' });
    return send(res, 200, (await db.all(\`SELECT \${COLUMNS} FROM \${TABLE} WHERE board_id = ? ORDER BY created, post_id\`, [board])).map(row));
  }
  const one = /^\\/posts\\/([^/]{1,80})$/.exec(rest);
  if (req.method === 'GET' && one) {
    if (!BOARDS[board]) return send(res, 404, { error: 'unknown board' });
    const id = decodeURIComponent(one[1]);
    await db.run(\`UPDATE \${TABLE} SET views = views + 1 WHERE board_id = ? AND post_id = ?\`, [board, id]);
    const [found] = await db.all(\`SELECT \${COLUMNS} FROM \${TABLE} WHERE board_id = ? AND post_id = ?\`, [board, id]);
    return found ? send(res, 200, row(found)) : send(res, 404, { error: 'no such post' });
  }
  if (req.method === 'POST' && rest === '/posts') {
    const data = await readJson(req);
    const target = String(data.board ?? '');
    if (!BOARDS[target]) return send(res, 404, { error: 'unknown board' });
    const title = cut(String(data.title ?? '').trim(), LIMITS.title);
    const body = cut(String(data.message ?? data.body ?? '').trim(), LIMITS.body);
    const author = cut(String(data.name ?? data.author ?? '').trim(), LIMITS.author);
    if (!title || !body || !author) return send(res, 400, { error: 'title, name and text are needed' });
    const now = new Date();
    const id = \`w\${now.getTime().toString(36)}\${Math.random().toString(36).slice(2, 6)}\`;
    await db.run(\`INSERT INTO \${TABLE} (board_id, \${COLUMNS}, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`, [target, id, title, cut(String(data.category ?? '').trim(), LIMITS.category), author, now.toISOString().slice(0, 10), 0, 0, body, now.toISOString()]);
    return send(res, 201, { id });
  }
  return send(res, 405, { error: 'not here' });
}

function serveFile(req, res, url) {
  let name = decodeURIComponent(url.pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(siteDir, \`.\${name}\`);
  // Only the site: nothing above it, and not this server's own folder.
  if (!file.startsWith(siteDir + path.sep) && file !== siteDir) return send(res, 403, 'forbidden', 'text/plain');
  if (file.startsWith(here + path.sep) || file === here) return send(res, 404, 'not found', 'text/plain');
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    return send(res, 200, data, TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  });
}

export async function start({ port = Number(process.env.PORT) || config.port || 8080, quiet = false } = {}) {
  const db = await openDatabase(config.database);
  await db.run(schema(config.database.kind));
  await seed(db);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === API || url.pathname.startsWith(\`\${API}/\`)) return await api(db, req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
      return serveFile(req, res, url);
    } catch (error) {
      return send(res, error.status ?? 500, { error: error.status ? error.message : 'server error' });
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  if (!quiet) console.log(\`MyHomeMaker board server: http://localhost:\${server.address().port}/  (\${config.database.kind})\`);
  return { server, db, port: server.address().port, close: async () => { await new Promise((r) => server.close(r)); await db.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
`;
