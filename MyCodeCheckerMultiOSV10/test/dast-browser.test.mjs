import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { http, listen, close, html } from './dast-helpers.mjs';

const require = createRequire(import.meta.url);
const dast = require('../core/dast/index.js');

// Page whose only link to /spa-route is added by JavaScript after load.
function spaServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') {
      return html(res, 200, `<!doctype html><html><body><div id="app"></div>
        <script>setTimeout(function(){var a=document.createElement('a');
        a.href='/spa-' + 'route';a.textContent='go';document.getElementById('app').appendChild(a);},50);</script>
        </body></html>`);
    }
    if (u.pathname === '/spa-route') return html(res, 200, '<!doctype html><html><body>route</body></html>');
    return html(res, 404, 'not found');
  });
}

test('findBrowser honours an explicit missing path with search disabled', () => {
  assert.equal(dast.findBrowser({ browserPath: 'Z:/missing/browser.exe', search: false }), null);
});

test('browser crawl falls back to the static crawler with a warning when no browser exists', async () => {
  const server = spaServer();
  const base = await listen(server);
  try {
    const result = await dast.createScan({
      target: base, rateLimit: 1000, maxRequests: 100,
      browser: { browserPath: 'Z:/missing/browser.exe', search: false },
    }).start();
    assert.ok(result.warnings.some((w) => /No Chromium-family browser/.test(w)));
    assert.ok(result.pages.some((p) => p.url === base + '/'));
    assert.ok(!result.pages.some((p) => p.url.includes('/spa-route')));
  } finally {
    await close(server);
  }
});

test('browser crawl discovers JS-added links when a browser is installed, else falls back', async () => {
  const found = dast.findBrowser({});
  const server = spaServer();
  const base = await listen(server);
  try {
    const result = await dast.createScan({ target: base, rateLimit: 1000, maxRequests: 100, browser: true }).start();
    if (found) {
      assert.ok(!result.warnings.some((w) => /No Chromium-family browser/.test(w)));
      assert.ok(result.pages.some((p) => p.url.includes('/spa-route')), 'route found via browser');
    } else {
      assert.ok(result.warnings.some((w) => /No Chromium-family browser/.test(w)));
    }
  } finally {
    await close(server);
  }
});
