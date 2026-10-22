# DAST module (`core/dast/`)

Dynamic application security testing for **your own** web applications. The
scanner drives a running app over HTTP/HTTPS, discovers its surface, runs
passive checks on every response, and (optionally) a set of **non-destructive**
active probes. It is pure CommonJS on Node built-ins (`http`, `https`, `net`,
`tls`, `url`, global `fetch` not required) with **zero npm dependencies**.

> Only point this at applications you own or are explicitly authorized to test.

## Safety model (enforced, not advisory)

- **Scope allowlist.** The scanner only ever contacts the origins you configure
  (`target` / `scope.origins`), with an optional `scope.pathPrefix`. Every
  request is scope-checked in `client.request()` before it is sent; an
  out-of-scope URL throws `OUT_OF_SCOPE` and is recorded in
  `result.outOfScopeSkipped`. Links and redirects that leave scope are **never**
  followed.
- **Rate limit.** Token-bucket limiter, default **5 req/s** (`rateLimit`).
- **Request budget.** Hard cap, default **500** (`maxRequests`); when hit, the
  scan stops cleanly.
- **Two modes.** `passive` (observe only — no payloads are ever sent; verified
  by a test) and `active` (adds safe probes).
- **Non-destructive probes only.** GET/POST (and OPTIONS/TRACE for method
  checks) exclusively — **no** DELETE/PUT/PATCH, no data-modifying payloads, no
  brute force, no DoS payloads, **no timing/sleep** command-injection tests
  (echo-marker reflection only).
- **Clear identity.** Every request sends `User-Agent: MyCodeChecker-DAST`.
- **Cancel handle.** `scan.cancel()` stops promptly between requests.
- **Authentication.** Cookie / header / bearer / login-form recipe (below) for
  authenticated scans.

## API

```js
const dast = require('./core/dast');

const scan = dast.createScan({
  target: 'https://app.example',      // string or array; sets the scope allowlist
  // scope: { origins: ['https://app.example'], pathPrefix: '/shop' },
  mode: 'active',                     // 'passive' (default) | 'active'
  rateLimit: 5,                       // requests per second
  maxRequests: 500,                   // hard request cap
  maxPages: 100,                      // crawl page cap
  maxDepth: 5,                        // crawl depth cap
  timeoutMs: 8000,
  seeds: ['https://app.example/hidden'],
  openapi: openApiDocOrUrl,           // Swagger 2 / OpenAPI 3 JSON (object or in-scope URL)
  auth: {
    cookie: 'sid=…', bearer: '…', headers: { 'x-api-key': '…' },
    login: { url: 'https://app.example/login', method: 'POST', fields: { user: 'u', pass: 'p' } },
  },
});

scan.on('progress', (p) => console.log(p.phase, p.requests, p.pages, p.findings));
const result = await scan.start();   // Promise<result>
// scan.cancel();                     // stop early

const sarif = dast.toSarif(result);  // SARIF 2.1.0 string
const html  = dast.toHtml(result, 'en' | 'ko');  // self-contained HTML report
const rules = dast.catalog();        // RuleMeta[] (keys 'dast:*', langs ['*'])
```

### Result shape

```js
{
  target: ['https://app.example'],
  mode: 'active',
  startedAt, finishedAt,            // ISO strings
  requests,                         // total requests sent
  pages: [{ url, status, contentType, depth, forms }],
  findings: [{
    rule, url, method, param, evidence,
    request, response,              // truncated strings
    severity, type,                 // VULNERABILITY | SECURITY_HOTSPOT
    cwe, owasp2021: [...],
    message: { en, ko },
  }],
  stats: { total, bySeverity, byRule, byType },
  scope: { origins, pathPrefix },
  cancelled, outOfScopeSkipped: [...],
}
```

## What it finds

**Crawler** — tolerant HTML tokenizer (`html.js`) extracting links / forms /
scripts / `src`; `robots.txt` + `sitemap.xml` (and nested indexes) for
discovery; JS-referenced URL/endpoint extraction by regex; OpenAPI/Swagger
import to seed endpoints and parameters; depth/page limits; dedupe by normalized
URL+params.

**Passive checks** — security headers (CSP with `unsafe-inline`/`unsafe-eval`/
wildcard analysis, HSTS, X-Content-Type-Options, X-Frame-Options/`frame-ancestors`,
Referrer-Policy, Permissions-Policy); cookie flags (Secure, HttpOnly, SameSite);
CORS misconfig (reflected origin + credentials, wildcard + credentials, null
origin); information disclosure (server/x-powered-by versions, stack traces,
internal IPs, source maps, directory listing, `.git`/`.env` via known safe GETs);
mixed content; insecure (http) form action; password-field autocomplete;
cache-control on authenticated responses; clickjacking; TLS cert
expiry/self-signed/hostname mismatch and protocol version (`tls.connect`);
HTTP→HTTPS redirect; open-redirect parameter patterns; JWT / sensitive data in
URL; outdated JS libraries (small bundled table: jQuery, AngularJS, Bootstrap,
lodash, moment).

**Active safe probes** — reflected XSS with a unique harmless marker + context
analysis; error-based and boolean-based SQL injection (DB error signatures for
MySQL/Postgres/MSSQL/Oracle/SQLite); path traversal (benign known-file signature
only); open redirect to a marker domain (detected via `Location`, never
followed); SSTI via an arithmetic marker; OS command injection via echo-marker
reflection (no timing); CRLF/header injection via marker; HTTP method checks
(OPTIONS/TRACE).

## Files

| File | Role |
|------|------|
| `index.js` | `createScan`, orchestration, CORS/TLS/known-path probes, `catalog`, `toSarif`, `toHtml` |
| `scope.js` | origin allowlist, in-scope test, URL normalization/dedupe |
| `client.js` | rate-limited, scope-gated, budgeted HTTP(S) client + `tls.connect` inspection; `User-Agent` |
| `html.js` | tolerant HTML tokenizer + link/form/script extraction |
| `crawler.js` | frontier/crawl, `sitemap.xml`, `robots.txt`, JS URL regex, OpenAPI import |
| `passive.js` | all passive checks + DB-error / library tables |
| `active.js` | injection-point derivation + safe active probes |
| `rules.js` | `dast:*` rule catalog (CWE / OWASP 2021, `{en,ko}` text) |
| `report.js` | SARIF 2.1.0 and self-contained HTML |

Tests: `test/dast.test.mjs` (`node --test`) — spins up a deliberately
vulnerable server and a hardened server on `127.0.0.1:0`, asserts findings on
the former and their absence on the latter, and verifies scope enforcement, rate
limit, request cap, cancel, passive-mode payload-freedom, the User-Agent,
authenticated cookies, and TLS self-signed detection. Tests never touch the
internet.

## Limitations

- Boolean-based SQLi uses a response-length/status heuristic; very dynamic pages
  can cause false negatives (error-based is preferred and conclusive).
- CRLF injection cannot be demonstrated through Node's own `Location` header
  (Node rejects CR/LF), so that probe is exercised against servers that place
  the value elsewhere; the check is present for non-Node targets.
- TLS expiry/hostname-mismatch rules are implemented from the live certificate
  but only the self-signed path is unit-tested (generating an expired cert at
  test time is out of scope); the logic runs against real endpoints.
- Library version detection reads banners/filenames only; bundled/minified libs
  without a version string are not detected. The vulnerability table is a small
  offline subset, not a full SCA feed.
- No headless browser: DOM-XSS and client-rendered SPA routes beyond what static
  HTML/JS regex discovery finds are out of scope.
