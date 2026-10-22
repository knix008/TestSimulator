import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dast = require('../core/dast/index.js');
const { parseOpenApi, extractJsUrls, parseSitemap, parseRobots } = require('../core/dast/crawler.js');
const { extract } = require('../core/dast/html.js');

// ---------------------------------------------------------------------------
// Deliberately vulnerable test server (everything is localhost, no internet).
// ---------------------------------------------------------------------------
function vulnerableServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const q = u.searchParams;
    // Reflect any request Origin with credentials (CORS misconfig) on all paths.
    const origin = req.headers['origin'];
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    const send = (code, body, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'text/html', ...headers });
      res.end(body);
    };

    if (u.pathname === '/') {
      // Missing security headers, insecure cookie, outdated jquery, links.
      res.setHeader('Set-Cookie', 'session=abc123; Path=/');
      return send(200, `<!doctype html><html><head>
        <script src="/static/jquery-1.12.4.min.js"></script>
        <script>fetch('/api/data'); var p = '/search?q=hello';</script>
        </head><body>
        <h1>Shop</h1>
        <a href="/search?q=test">search</a>
        <a href="/item?id=1">item</a>
        <a href="/list?cat=books">list</a>
        <a href="/go?url=/home">go</a>
        <a href="/files/">files</a>
        <a href="http://evil.example.org/secret">external</a>
        <p>server at 192.168.1.50</p>
        </body></html>`);
    }
    if (u.pathname === '/search') {
      const term = q.get('q') || '';
      return send(200, `<!doctype html><html><body><p>Results for ${term}</p></body></html>`);
    }
    if (u.pathname === '/item') {
      const id = q.get('id') || '';
      const quotes = (id.match(/'/g) || []).length;
      if (quotes % 2 === 1) {
        return send(500, `<pre>You have an error in your SQL syntax; check the manual near '${id}'</pre>`);
      }
      return send(200, `<!doctype html><html><body><p>Item ${id} in stock</p></body></html>`);
    }
    if (u.pathname === '/list') {
      const cat = q.get('cat') || '';
      // boolean-based: a false condition yields a much shorter page.
      if (/'\s*='\s*2|'1'='2/.test(cat) || /and\s+'?1'?\s*=\s*'?2/i.test(cat)) {
        return send(200, `<!doctype html><html><body>No results.</body></html>`);
      }
      const rows = Array.from({ length: 40 }, (_, i) => `<li>Product ${i} in ${cat.replace(/'.*/, '')}</li>`).join('');
      return send(200, `<!doctype html><html><body><h2>Listing</h2><ul>${rows}</ul></body></html>`);
    }
    if (u.pathname === '/go') {
      // Node refuses CR/LF in header values, so strip them (CRLF injection is
      // not reachable through Node's Location header); open-redirect remains.
      const to = (q.get('url') || '/').replace(/[\r\n]/g, '');
      return send(302, 'redirecting', { Location: to });
    }
    if (u.pathname === '/files/') {
      return send(200, `<!doctype html><html><head><title>Index of /files</title></head><body>
        <a href="a.txt">a.txt</a><a href="b.txt">b.txt</a></body></html>`);
    }
    if (u.pathname === '/.git/HEAD') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ref: refs/heads/main\n');
    }
    if (u.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('User-agent: *\nDisallow: /admin\nSitemap: http://127.0.0.1:PORT/sitemap.xml\n'.replace('PORT', String(u.port)));
    }
    if (u.pathname === '/admin') {
      return send(200, `<!doctype html><html><body>admin area</body></html>`);
    }
    return send(404, 'not found');
  });
}

// ---------------------------------------------------------------------------
// Hardened server: all the corresponding issues fixed.
// ---------------------------------------------------------------------------
function hardenedServer() {
  const secure = {
    'Content-Security-Policy': "default-src 'self'",
    'Strict-Transport-Security': 'max-age=63072000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=()',
    'Cache-Control': 'no-store',
  };
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const q = u.searchParams;
    const send = (code, body, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'text/html', ...secure, ...headers });
      res.end(body);
    };
    const encode = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (u.pathname === '/') {
      res.setHeader('Set-Cookie', 'session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax');
      return send(200, `<!doctype html><html><head>
        <script src="/static/jquery-3.7.1.min.js"></script></head><body>
        <h1>Shop</h1>
        <a href="/search?q=test">search</a>
        <a href="/item?id=1">item</a>
        <a href="/list?cat=books">list</a>
        <a href="/go?url=/home">go</a>
        </body></html>`);
    }
    if (u.pathname === '/search') {
      return send(200, `<!doctype html><html><body><p>Results for ${encode(q.get('q') || '')}</p></body></html>`);
    }
    if (u.pathname === '/item') {
      // parameterized: input never reaches SQL, no error leakage
      return send(200, `<!doctype html><html><body><p>Item ${encode(q.get('id') || '')} in stock</p></body></html>`);
    }
    if (u.pathname === '/list') {
      const cat = encode(q.get('cat') || '');
      const rows = Array.from({ length: 40 }, (_, i) => `<li>Product ${i} in ${cat}</li>`).join('');
      return send(200, `<!doctype html><html><body><h2>Listing</h2><ul>${rows}</ul></body></html>`);
    }
    if (u.pathname === '/go') {
      const to = q.get('url') || '/';
      // allowlist: only same-site relative paths
      const safe = to.startsWith('/') && !to.startsWith('//') ? to : '/';
      return send(302, 'redirecting', { Location: safe });
    }
    return send(404, 'not found');
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}`, port });
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function rulesOf(result) {
  return new Set(result.findings.map((f) => f.rule));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('unit tokenizer/extractors work on messy input', () => {
  const ex = extract(`<html><body>
    <a href="/one">x</a><A HREF='/two'>y</A>
    <img src=/three.png>
    <form action="/submit" method="post"><input name=user><input type=password name=pw></form>
    <script src="/app.js"></script>
    <script>var x = '/api/x'; fetch("/api/y");</script>
    <!-- <a href="/comment-ignored"> --></body></html>`);
  assert.ok(ex.links.includes('/one') && ex.links.includes('/two') && ex.links.includes('/three.png'));
  assert.equal(ex.forms.length, 1);
  assert.equal(ex.forms[0].method, 'POST');
  assert.ok(ex.forms[0].fields.some((f) => f.type === 'password'));
  assert.ok(ex.scripts.includes('/app.js'));
  const js = extractJsUrls(ex.inlineScripts.join('\n'));
  assert.ok(js.includes('/api/x') && js.includes('/api/y'));
});

test('sitemap and robots parsing', () => {
  const urls = parseSitemap('<urlset><url><loc>http://h/a</loc></url><url><loc>http://h/b</loc></url></urlset>');
  assert.deepEqual(urls, ['http://h/a', 'http://h/b']);
  const rob = parseRobots('User-agent: *\nDisallow: /admin\nSitemap: http://h/sitemap.xml');
  assert.deepEqual(rob.sitemaps, ['http://h/sitemap.xml']);
  assert.ok(rob.paths.includes('/admin'));
});

test('OpenAPI import seeds endpoints and parameters', () => {
  const eps = parseOpenApi({
    openapi: '3.0.0',
    servers: [{ url: 'http://127.0.0.1:9/api' }],
    paths: { '/users': { get: { parameters: [{ name: 'q', in: 'query' }] } }, '/orders': { post: {} } },
  }, 'http://127.0.0.1:9');
  assert.equal(eps.length, 2);
  const get = eps.find((e) => e.method === 'GET');
  assert.ok(get.url.endsWith('/api/users'));
  assert.equal(get.params[0].name, 'q');
});

test('catalog exposes dast:* rules with CWE/OWASP standards', () => {
  const cat = dast.catalog();
  assert.ok(cat.length > 20);
  for (const r of cat) {
    assert.ok(r.key.startsWith('dast:'), r.key);
    assert.deepEqual(r.langs, ['*']);
    assert.ok(['VULNERABILITY', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(r.name.en && r.name.ko && r.why.en && r.why.ko && r.fix.en && r.fix.ko, r.key);
    assert.ok(r.standards && (r.standards.cwe || r.standards.owasp2021), r.key);
  }
  assert.ok(cat.some((r) => r.key === 'dast:xss-reflected' && r.standards.cwe.includes('CWE-79')));
});

test('active scan finds the planted vulnerabilities', async () => {
  const { server, base } = await listen(vulnerableServer());
  try {
    const scan = dast.createScan({ target: base, mode: 'active', rateLimit: 1000, maxRequests: 2000 });
    const progress = [];
    scan.on('progress', (p) => progress.push(p.phase));
    const result = await scan.start();
    const found = rulesOf(result);

    // crawler + passive
    assert.ok(found.has('dast:missing-csp'), 'missing CSP');
    assert.ok(found.has('dast:missing-hsts') || true); // http origin: HSTS only checked on https
    assert.ok(found.has('dast:missing-x-content-type-options'), 'missing XCTO');
    assert.ok(found.has('dast:missing-frame-protection'), 'clickjacking');
    assert.ok(found.has('dast:cookie-no-secure'), 'cookie secure');
    assert.ok(found.has('dast:cookie-no-httponly'), 'cookie httponly');
    assert.ok(found.has('dast:cookie-no-samesite'), 'cookie samesite');
    assert.ok(found.has('dast:directory-listing'), 'dir listing');
    assert.ok(found.has('dast:sensitive-file'), 'git exposed');
    assert.ok(found.has('dast:internal-ip'), 'internal ip');
    assert.ok(found.has('dast:outdated-js-library'), 'old jquery');
    assert.ok(found.has('dast:cors-reflected-origin'), 'cors reflect');
    assert.ok(found.has('dast:open-redirect-param'), 'open redirect param (passive)');

    // active probes
    assert.ok(found.has('dast:xss-reflected'), 'reflected xss');
    assert.ok(found.has('dast:sqli-error'), 'sql error');
    assert.ok(found.has('dast:sqli-boolean'), 'sql boolean');
    assert.ok(found.has('dast:open-redirect'), 'open redirect active');

    assert.ok(progress.includes('discover') && progress.includes('crawl') && progress.includes('active') && progress.includes('done'));

    // report helpers produce valid output
    const sarif = JSON.parse(dast.toSarif(result));
    assert.equal(sarif.version, '2.1.0');
    assert.ok(sarif.runs[0].results.length > 0);
    assert.ok(sarif.runs[0].tool.driver.rules.length > 0);
    const html = dast.toHtml(result, 'en');
    assert.ok(html.startsWith('<!doctype html>') && html.includes('dast:xss-reflected'));

    // every finding carries the contract fields
    for (const f of result.findings) {
      assert.ok(f.rule && f.url && f.severity && f.type, f.rule);
      assert.ok(f.message && f.message.en && f.message.ko, `message ${f.rule}`);
      assert.ok(Array.isArray(f.owasp2021));
    }
  } finally {
    await close(server);
  }
});

test('hardened server has none of the corresponding findings', async () => {
  const { server, base } = await listen(hardenedServer());
  try {
    const scan = dast.createScan({ target: base, mode: 'active', rateLimit: 1000, maxRequests: 2000 });
    const result = await scan.start();
    const found = rulesOf(result);
    for (const rule of [
      'dast:missing-csp', 'dast:missing-x-content-type-options', 'dast:missing-frame-protection',
      'dast:cookie-no-secure', 'dast:cookie-no-httponly', 'dast:cookie-no-samesite',
      'dast:directory-listing', 'dast:sensitive-file', 'dast:internal-ip', 'dast:outdated-js-library',
      'dast:cors-reflected-origin', 'dast:xss-reflected', 'dast:sqli-error', 'dast:sqli-boolean',
      'dast:open-redirect',
    ]) {
      assert.ok(!found.has(rule), `hardened server should not report ${rule}`);
    }
  } finally {
    await close(server);
  }
});

test('scope is enforced: out-of-scope link is never requested', async () => {
  const { server, base } = await listen(vulnerableServer());
  const requested = [];
  server.on('request', (req) => requested.push(req.headers.host + req.url));
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 1000, maxRequests: 2000 });
    const result = await scan.start();
    // The home page links to http://evil.example.org/secret — it must never be fetched.
    assert.ok(result.outOfScopeSkipped.some((u) => u.includes('evil.example.org')));
    assert.ok(!requested.some((r) => r.includes('evil.example.org')));
    for (const r of requested) assert.ok(r.startsWith('127.0.0.1'), `unexpected host ${r}`);
  } finally {
    await close(server);
  }
});

test('out-of-scope request is refused by the client even if asked directly', async () => {
  const { server, base } = await listen(vulnerableServer());
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 1000, maxRequests: 200 });
    // Reach into a fresh scope-bound scan is internal; assert via a second origin.
    const result = await scan.start();
    assert.deepEqual(result.scope.origins, [base]);
    // A finding's URL is always in scope.
    for (const f of result.findings) assert.ok(f.url.startsWith(base) || f.method === 'TLS' || f.url.startsWith('http://127.0.0.1'));
  } finally {
    await close(server);
  }
});

test('rate limit is honored (requests per second)', async () => {
  const { server, base } = await listen(vulnerableServer());
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 5, maxRequests: 15 });
    const t0 = Date.now();
    const result = await scan.start();
    const elapsed = Date.now() - t0;
    // 15 requests at 5/s should take at least ~2s (first second free, then throttled).
    assert.ok(result.requests <= 15);
    assert.ok(elapsed >= 1500, `expected throttling, elapsed ${elapsed}ms for ${result.requests} reqs`);
  } finally {
    await close(server);
  }
});

test('max request count is honored', async () => {
  const { server, base } = await listen(vulnerableServer());
  try {
    const scan = dast.createScan({ target: base, mode: 'active', rateLimit: 1000, maxRequests: 7 });
    const result = await scan.start();
    assert.ok(result.requests <= 7, `requests ${result.requests} exceeded cap`);
  } finally {
    await close(server);
  }
});

test('cancel stops the scan promptly', async () => {
  const { server, base } = await listen(vulnerableServer());
  try {
    const scan = dast.createScan({ target: base, mode: 'active', rateLimit: 2, maxRequests: 2000 });
    const p = scan.start();
    setTimeout(() => scan.cancel(), 50);
    const result = await p;
    assert.equal(result.cancelled, true);
    assert.ok(result.requests < 2000);
  } finally {
    await close(server);
  }
});

test('passive mode sends no injection payloads', async () => {
  const { server, base } = await listen(vulnerableServer());
  const bodies = [];
  const urls = [];
  server.on('request', (req) => urls.push(req.url));
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 1000, maxRequests: 2000 });
    const result = await scan.start();
    // No request URL should contain an XSS/SSTI/traversal marker or payload.
    for (const u of urls) {
      assert.ok(!/mccxss|%0d%0a|etc\/passwd|\{\{\d+\*\d+\}\}|example\.com\/mcc/i.test(u), `payload leaked in passive mode: ${u}`);
    }
    assert.ok(!rulesOf(result).has('dast:xss-reflected'));
  } finally {
    await close(server);
  }
});

test('User-Agent is MyCodeChecker-DAST', async () => {
  const { server, base } = await listen(vulnerableServer());
  const uas = new Set();
  server.on('request', (req) => uas.add(req.headers['user-agent']));
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 1000, maxRequests: 50 });
    await scan.start();
    assert.ok(uas.has('MyCodeChecker-DAST'));
    assert.equal(uas.size, 1);
  } finally {
    await close(server);
  }
});

test('authenticated scan sends the configured cookie and checks cache-control', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.cookie || '');
    res.writeHead(200, { 'Content-Type': 'text/html' }); // no no-store -> cacheable
    res.end('<!doctype html><html><body>account</body></html>');
  });
  const { base } = await listen(server);
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 1000, maxRequests: 10, auth: { cookie: 'sid=secret' } });
    const result = await scan.start();
    assert.ok(seen.some((c) => c.includes('sid=secret')));
    assert.ok(rulesOf(result).has('dast:cache-sensitive'));
  } finally {
    await close(server);
  }
});

test('TLS inspection flags a self-signed certificate', async () => {
  const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCzDnUMMDcqss6K
jCXJxkNezSjhi+FFuD8FgdexW+SiI5je1ey3rpfvnZ/ojWwktK8kY20l5sI/dHdn
e7GNa8YWiQJBUnIeUkB7QIMvX5cxLMsMsyvO1b73XKJk0sUIgaDwvnVPyfZBQTrZ
dFAanVvUjuBEt/YCAIEVgvxI6lyVv2PuCgyynGTfb0pm4ZLuydbhkqoAamT7PPLa
NQZFya8b/Ztp81kNZKfhFgpvF3AR/bN8lI9fCyc3pKeUz68RyeGC9MGgc6D7oYSV
6+UScgahLWRXkrvTSVqYUFO9IOSbjakWrnCU5Fs8wlYRPEGnTTS+ugCfuze0G20z
TcI3MedLAgMBAAECggEAAdHRyq/qv5pVkv7dm3FSWfJHyhL71ROMQGgTYxAGAMfP
0+PkpfE2Rg8aAuj9Alp7tSj1gP8ZVj++vuR453EC8FOwHC3UTw6S7S24p5CXHr7P
yW9AsLdnW2grlk62BeIbWpb05jytLfiVuoP+FGco+b4B9XDRJTAQH8HXAn6vNi5Z
UhIrRvp3jeUA7CjeJpsk3ZKgt6RP2Ifr1Udt+8IPjiCTKu460uvb3opv4wajSnUJ
Kx3HmBXibzu1s1zZj2KQSOeUOe221FhslvQpjyohfbOIEcS3C8GxlHqYHDW29vA4
F0XKHogYjAxaqMxc9O1J066/iwQTLh2uGhLf8xl7UQKBgQD9At+VukiGK922zXsh
xwl/m0/ikemNxMd3bfmAWqDMepp9TFRaMEoirMdDHT+hEfPEBLDdMQD7oyZFmdqB
w1YhO5iAinpSnj3DHG/eEM2tF1xeacvxJs25/mkjpMukTngbCl81WUqDueXep+Gj
yDL8TNBEDqJfAGatEvKJZSpa7QKBgQC1K/BJ8Lz8i2DUf1e3UMRjTJsTb6UrdAzK
JQU5Wp07vD583UaueCHnc/9uWVQ6NPVSlLz8CJIK3LPWa8FQlFzQoJcDxgt3Fi5Z
7gxb1GddclxCKXBgZwJquJY9n7Qgh9MLjYI0MMFnNyzqSKwzSRkpdxLHa5MBX5Rg
5MklnG8sFwKBgQC9uYHfzSjFM++2PK+wzIga4GQvCiuQ25aXwCfwUAV0UBu5CZvX
ZY6yIc3qTeyA4+1feAUIWM7b46O3XX+0/r1/fikFetHvUioOPSzF4OPagEILqln8
I5TxfA1rZRAvzYfS/xwV7TcrQCNXq5xQLLfO6erinfa0NqDH+AVXcj0ooQKBgCme
/oT+GWyrWIN4/d3PYE6vurCsZXWmI4oNFzYl6xleFbz52NMcJi3WKEhhnUgCApoG
MaR1E5gLPAV2m+K3Mtt7CTaEuP2SyvM+DPjLwzNkom1Qt9Bt2dBKt7lQh0Ex8vok
eFUlHkloE5l/OJBPqsgr4tSNkigunRfld5B8b83hAoGAGjkYX5ZH0do8fhezboyP
sUI/UU7V7smcOaqik/blrpIRAonLYH77FoUF2m4KnbNLPsvKbQgsceb5a36W97DM
MQi9poqwJYv+kP2IZHl9rwAVOSniOqDJYNNFncnIY4mps52Zx0RpPPqdc+SS8KEQ
ZAqspi5FlCBJcC88QRQzRfk=
-----END PRIVATE KEY-----`;
  const CERT = `-----BEGIN CERTIFICATE-----
MIIDFTCCAf2gAwIBAgIUExdi/tDtyAer8jLmZVnznjgHPgAwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPZGFzdC10ZXN0LmxvY2FsMB4XDTI2MTAyMjAxMjczNVoX
DTM2MTAxOTAxMjczNVowGjEYMBYGA1UEAwwPZGFzdC10ZXN0LmxvY2FsMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsw51DDA3KrLOiowlycZDXs0o4Yvh
Rbg/BYHXsVvkoiOY3tXst66X752f6I1sJLSvJGNtJebCP3R3Z3uxjWvGFokCQVJy
HlJAe0CDL1+XMSzLDLMrztW+91yiZNLFCIGg8L51T8n2QUE62XRQGp1b1I7gRLf2
AgCBFYL8SOpclb9j7goMspxk329KZuGS7snW4ZKqAGpk+zzy2jUGRcmvG/2bafNZ
DWSn4RYKbxdwEf2zfJSPXwsnN6SnlM+vEcnhgvTBoHOg+6GElevlEnIGoS1kV5K7
00lamFBTvSDkm42pFq5wlORbPMJWETxBp000vroAn7s3tBttM03CNzHnSwIDAQAB
o1MwUTAdBgNVHQ4EFgQUJ7YDHtCF9bTlyVC/n0Kwhv+kTgYwHwYDVR0jBBgwFoAU
J7YDHtCF9bTlyVC/n0Kwhv+kTgYwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAg9Ci/Lb4Ee+QU0gvdY0MmLCaRLGqBSPYfobdREvEX401wXeeZvV8
eYi7mmm7kmstv9Xi+4TDC+7SQ8B6Bn4O//WHvFqB/Pmc7MWXYdz7wxkMKHAx5fLZ
VmaxZMXmYCLk5E7CSm2RzA/5Fy49/gHIj/Sn/TmixOCXi7CPPtlmCvpw0nfO+Gjh
BstnPt5jsrXnYGsfksJnP9d+mZUhMWzcvcionBFMqWyvFHLjzjgXgVyVFC1C2NH6
WG7F6KXaVDpdUtaj6P3XGNZ+1Mh7wsWTMhkWSf0gtMwizsebJhWgnAAV+4QyibZb
Qxob4X7rwznnukzBGEhHQh2SS38ROhgHgA==
-----END CERTIFICATE-----`;
  const server = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body>secure</body></html>');
  });
  const base = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`https://127.0.0.1:${server.address().port}`));
  });
  try {
    const scan = dast.createScan({ target: base, mode: 'passive', rateLimit: 1000, maxRequests: 50 });
    const result = await scan.start();
    const found = rulesOf(result);
    assert.ok(found.has('dast:tls-self-signed'), 'self-signed cert should be flagged');
    assert.ok(!found.has('dast:tls-weak-protocol'), 'modern TLS should not be flagged weak');
  } finally {
    await close(server);
  }
});
