const assert = require('node:assert/strict');
const { describe, it, before } = require('../lib/framework');
const srv = require('../lib/server');
const pkg = require('../../package.json');

describe('Web server, static files and app info', () => {
  before(async () => { await srv.startTestServer(); });

  it('serves the single-page app at /', async () => {
    const res = await srv.client().raw('GET', '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.body, /<script src="js\/app\.js"><\/script>/);
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await srv.client().raw('GET', '/some/client/route');
    assert.equal(res.status, 200);
    assert.match(res.body, /<html/i);
  });

  it('serves renderer scripts, styles and theme images', async () => {
    for (const [url, type] of [
      ['/js/lang.js', /javascript/],
      ['/css/style.css', /text\/css/],
      ['/css/login-pattern-light.svg', /image\/svg\+xml/],
      ['/css/login-pattern-dark.svg', /image\/svg\+xml/],
    ]) {
      const res = await srv.client().raw('GET', url);
      assert.equal(res.status, 200, url);
      assert.match(res.headers.get('content-type'), type, url);
    }
  });

  it('serves the sample project', async () => {
    const res = await srv.client().raw('GET', '/sample/sample.kprj');
    assert.equal(res.status, 200);
  });

  it('returns application info without authentication', async () => {
    const res = await srv.client().get('/app-info');
    assert.equal(res.status, 200);
    assert.equal(res.body.version, pkg.version);
    assert.equal(res.body.name, pkg.build.productName);
  });

  it('serves protected APIs as the local user without login', async () => {
    const c = srv.client();
    for (const p of ['/boards', '/users/active', '/settings/db-config', '/auth/me']) {
      assert.equal((await c.get(p)).status, 200, p);
    }
    assert.equal((await c.get('/auth/me')).body.username, 'admin');
  });

  it('accepts large JSON bodies (up to 50 MB)', async () => {
    const admin = await srv.adminClient();
    const board = await srv.createBoard(admin);
    const description = 'x'.repeat(2 * 1024 * 1024);
    const res = await admin.post(`/boards/${board.id}/cards`, { columnId: board.columns[0].id, title: 'Big', description });
    assert.equal(res.status, 200);
  });
});
