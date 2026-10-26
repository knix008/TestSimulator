'use strict';

const { Client, CancelError, USER_AGENT } = require('./client');
const { createScope, resolveUrl } = require('./scope');
const { Crawler, parseSitemap, parseRobots, parseOpenApi } = require('./crawler');
const { passiveChecks } = require('./passive');
const active = require('./active');
const { catalog, rule } = require('./rules');
const report = require('./report');
const browser = require('./browser');
const auth = require('./auth');
const policiesMod = require('./policies');
const apiscan = require('./apiscan');
const extra = require('./extra');

// Known safe paths checked with a single GET each (never brute force): if one
// returns a recognizable signature it indicates an exposed VCS/config file.
const SENSITIVE_PATHS = [
  { path: '/.git/HEAD', sig: /ref:\s*refs\// },
  { path: '/.git/config', sig: /\[core\]/ },
  { path: '/.env', sig: /^[A-Z0-9_]+\s*=/m },
  { path: '/.svn/entries', sig: /^\d+\s*$|svn:/m },
  { path: '/.DS_Store', sig: /Bud1|\x00\x00\x00\x01Bud1/ },
  { path: '/backup.zip', sig: /^PK\x03\x04/ },
  { path: '/backup.sql', sig: /(CREATE TABLE|INSERT INTO|-- MySQL dump)/i },
  { path: '/.env.bak', sig: /^[A-Z0-9_]+\s*=/m },
  { path: '/config.php.bak', sig: /<\?php/i },
  { path: '/web.config.bak', sig: /<configuration/i },
];

function createScan(config = {}) {
  const listeners = { progress: [], finding: [], error: [] };
  const scope = createScope(config);
  if (scope.origins.size === 0) {
    throw new Error('DAST scope is empty: configure target/scope.origins (an allowlist of origins).');
  }
  const mode = config.mode === 'active' ? 'active' : 'passive';
  const policy = policiesMod.resolvePolicy(config.policy);
  const warnings = [];
  const client = new Client({
    scope,
    rateLimit: config.rateLimit != null ? config.rateLimit : 5,
    maxRequests: config.maxRequests != null ? config.maxRequests : 500,
    timeoutMs: config.timeoutMs,
    auth: config.auth || null,
  });

  // Authentication variables carried between login steps / re-logins.
  let authVars = { ...(config.auth && config.auth.vars ? config.auth.vars : {}) };
  let reloginCount = 0;
  const maxRelogins = 3;

  const emit = (event, payload) => {
    for (const fn of listeners[event] || []) {
      try { fn(payload); } catch { /* listener errors are ignored */ }
    }
  };

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return api;
  }

  function addWarning(message) {
    warnings.push(message);
    emit('progress', { phase: 'warning', requests: client.requests, pages: 0, findings: 0, warning: message });
  }

  // --- Authentication ------------------------------------------------------

  async function performLogin() {
    const a = config.auth;
    if (!a) return;
    if (Array.isArray(a.sequence) && a.sequence.length) {
      const res = await auth.runHttpSequence(client, scope, a.sequence, { ...authVars, __bearerVar: a.bearerVar }, emit);
      authVars = res.vars;
      return;
    }
    // Simple single-step login form (legacy).
    const login = a.login;
    if (login && login.url && scope.inScope(login.url)) {
      try {
        const body = new URLSearchParams(login.fields || {}).toString();
        const res = await client.request(login.url, {
          method: (login.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
          body: (login.method || 'POST').toUpperCase() === 'GET' ? undefined : body,
        });
        auth.captureCookies(client, res);
      } catch (err) {
        if (err.code === 'CANCELLED') throw err;
        emit('error', { phase: 'login', message: String(err.message || err) });
      }
    }
  }

  async function reloginIfNeeded(res) {
    const a = config.auth;
    if (!a) return;
    if (!auth.sessionLost(res, a)) return;
    if (reloginCount >= maxRelogins) return;
    reloginCount += 1;
    emit('progress', { phase: 'relogin', requests: client.requests, pages: 0, findings: 0 });
    try {
      if (a.tokenEndpoint) await auth.refreshBearer(client, scope, a.tokenEndpoint, authVars, emit);
      await performLogin();
    } catch (err) {
      if (err.code === 'CANCELLED') throw err;
      emit('error', { phase: 'relogin', message: String(err.message || err) });
    }
  }

  // --- Browser discovery ---------------------------------------------------

  function browserOptions() {
    const b = config.browser;
    if (!b) return null;
    return b === true ? {} : b;
  }

  async function browserDiscover(crawler, extraInjectionPoints) {
    const bo = browserOptions();
    if (!bo) return;
    const browserPath = browser.findBrowser(bo);
    if (!browserPath) {
      addWarning('No Chromium-family browser was found; falling back to the static crawler.');
      return;
    }
    emit('progress', { phase: 'browser', requests: client.requests, pages: 0, findings: 0 });
    const seeds = [];
    for (const origin of scope.list()) seeds.push(origin + (scope.pathPrefix || '/'));
    for (const s of [].concat(config.seeds || [])) seeds.push(s);

    const a = config.auth;
    const onReady = (a && Array.isArray(a.script) && a.script.length)
      ? (session) => auth.runBrowserLogin(session, client, scope, a.script, emit)
      : null;

    let crawlResult;
    try {
      crawlResult = await browser.browserCrawl({
        browserPath,
        scope,
        seeds,
        maxPages: bo.maxPages != null ? bo.maxPages : Math.min(config.maxPages || 100, 20),
        maxClicks: bo.maxClicks != null ? bo.maxClicks : 8,
        waitIdleMs: bo.waitIdleMs != null ? bo.waitIdleMs : 5000,
        timeoutMs: bo.timeoutMs != null ? bo.timeoutMs : 15000,
        isCancelled: () => client.cancelled,
        onReady,
      });
    } catch (err) {
      addWarning(`Browser crawl failed (${String(err.message || err)}); using the static crawler.`);
      return;
    }
    if (crawlResult.error) {
      addWarning(`Browser crawl error (${crawlResult.error}); using the static crawler.`);
    }
    // Feed discovered URLs into the scope-gated crawler frontier.
    for (const link of crawlResult.links) {
      let abs;
      try { abs = new URL(link, scope.list()[0]).href; } catch { continue; }
      crawler.enqueue(abs);
    }
    for (const req of crawlResult.requests) crawler.enqueue(req.url);
    // Derive injection points from browser-discovered forms (active mode).
    for (const form of crawlResult.forms) {
      let actionUrl;
      try { actionUrl = new URL(form.action || scope.list()[0], scope.list()[0]).href; } catch { continue; }
      if (!scope.inScope(actionUrl)) continue;
      const synthetic = { url: actionUrl, forms: [form] };
      for (const pt of active.deriveInjectionPoints(synthetic)) extraInjectionPoints.push(pt);
    }
    emit('progress', { phase: 'browser', requests: client.requests, pages: crawlResult.pagesVisited, findings: 0 });
  }

  // --- Static discovery (robots / sitemap / OpenAPI / Postman) -------------

  async function discover(crawler, postmanPoints) {
    const seeds = [].concat(config.seeds || []);
    for (const origin of scope.list()) {
      crawler.enqueue(origin + (scope.pathPrefix || '/'));
    }
    for (const s of seeds) crawler.enqueue(s);

    for (const origin of scope.list()) {
      try {
        const rob = await client.request(origin + '/robots.txt', { method: 'GET' });
        if ((rob.status < 400 && /text\/plain|robots/i.test(rob.headers['content-type'] || '')) || (rob.status < 400 && rob.body)) {
          const parsed = parseRobots(rob.body);
          for (const p of parsed.paths) crawler.enqueue(origin + p);
          for (const sm of parsed.sitemaps) {
            const abs = resolveUrl(origin, sm);
            if (abs && scope.inScope(abs)) await loadSitemap(abs, crawler);
          }
        }
      } catch (err) { if (err.code === 'CANCELLED') throw err; }
      try {
        await loadSitemap(origin + '/sitemap.xml', crawler);
      } catch (err) { if (err.code === 'CANCELLED') throw err; }
    }

    // OpenAPI / Swagger import.
    if (config.openapi) {
      let doc = config.openapi;
      if (typeof doc === 'string' && /^https?:\/\//i.test(doc)) {
        if (scope.inScope(doc)) {
          try {
            const r = await client.request(doc, { method: 'GET' });
            doc = JSON.parse(r.body);
          } catch { doc = null; }
        } else doc = null;
      }
      const base = scope.list()[0];
      const endpoints = parseOpenApi(doc, base);
      for (const ep of endpoints) {
        if (ep.method === 'GET') {
          const u = new URL(ep.url);
          for (const p of ep.params) if (p.in === 'query') u.searchParams.set(p.name, '1');
          crawler.enqueue(u.href);
        }
      }
    }

    // Postman collection v2.1 import → seeds (and POST injection points).
    if (config.postman) {
      const seedsP = apiscan.parsePostman(config.postman, scope.list()[0]);
      for (const s of seedsP) {
        if (!scope.inScope(s.url)) continue;
        crawler.enqueue(s.url);
        if (s.method === 'POST' && s.body && /^[^={]+=.+/.test(s.body)) {
          // urlencoded body → injection points per field.
          try {
            const params = {};
            for (const [k, v] of new URLSearchParams(s.body)) params[k] = v;
            const u = new URL(s.url);
            for (const name of Object.keys(params)) {
              postmanPoints.push({
                method: 'POST',
                url: `${u.protocol}//${u.host}${u.pathname}`,
                params: { ...params },
                param: name,
                isBody: true,
                baseValue: params[name] || '1',
              });
            }
          } catch { /* ignore */ }
        }
      }
    }
  }

  async function loadSitemap(url, crawler) {
    if (!scope.inScope(url)) return;
    const res = await client.request(url, { method: 'GET' });
    if (res.status >= 400) return;
    if (!/xml/i.test(res.headers['content-type'] || '') && !/<urlset|<sitemapindex|<loc>/i.test(res.body)) return;
    for (const loc of parseSitemap(res.body)) {
      if (/\.xml(\?|$)/i.test(loc) && scope.inScope(loc)) {
        try { await loadSitemap(loc, crawler); } catch { /* ignore nested */ }
      } else {
        crawler.enqueue(loc);
      }
    }
  }

  async function scanSensitivePaths(findings) {
    for (const origin of scope.list()) {
      for (const sp of SENSITIVE_PATHS) {
        if (client.cancelled || client.requests >= client.maxRequests) return;
        try {
          const res = await client.request(origin + sp.path, { method: 'GET' });
          const ctype = String(res.headers['content-type'] || '');
          if (res.status === 200 && !/html/i.test(ctype) && sp.sig.test(res.body || '')) {
            findings.push({
              rule: 'dast:sensitive-file',
              url: res.url,
              method: 'GET',
              param: null,
              evidence: `Exposed ${sp.path} (signature matched)`,
              request: `GET ${res.url}`,
              response: `HTTP ${res.status}\n` + String(res.body || '').slice(0, 300),
            });
          }
        } catch (err) { if (err.code === 'CANCELLED') throw err; }
      }
    }
  }

  async function checkTlsAndRedirect(findings) {
    for (const origin of scope.list()) {
      const u = new URL(origin);
      if (u.protocol === 'https:') {
        let info;
        try { info = await client.inspectTls(origin); } catch { info = null; }
        if (info && !info.error) {
          const now = Date.now();
          const to = Date.parse(info.cert.valid_to);
          const from = Date.parse(info.cert.valid_from);
          if ((to && to < now) || (from && from > now)) {
            findings.push(tlsFinding('dast:tls-cert-expired', origin, `valid_from=${info.cert.valid_from} valid_to=${info.cert.valid_to}`));
          }
          if (!info.authorized) {
            const err = (info.authorizationError || '').toUpperCase();
            if (/HOSTNAME|ALTNAME|CN|MISMATCH/.test(err)) {
              findings.push(tlsFinding('dast:tls-hostname-mismatch', origin, info.authorizationError));
            } else if (/SELF.?SIGNED|UNABLE_TO_(GET|VERIFY)|DEPTH_ZERO|UNTRUSTED|CERT_UNTRUSTED/.test(err)) {
              findings.push(tlsFinding('dast:tls-self-signed', origin, info.authorizationError));
            } else if (!/EXPIRED|NOT_YET_VALID/.test(err)) {
              findings.push(tlsFinding('dast:tls-self-signed', origin, info.authorizationError || 'certificate not authorized'));
            }
          }
          if (info.protocol && /TLSv1(\.0|\.1)?$|SSLv3/.test(info.protocol) && info.protocol !== 'TLSv1.2' && info.protocol !== 'TLSv1.3') {
            findings.push(tlsFinding('dast:tls-weak-protocol', origin, `protocol=${info.protocol}`));
          }
        }
      } else {
        try {
          const res = await client.request(origin + '/', { method: 'GET' });
          const loc = res.location || '';
          const toHttps = res.status >= 300 && res.status < 400 && /^https:/i.test(loc);
          if (!toHttps) {
            findings.push({
              rule: 'dast:no-https-redirect', url: origin + '/', method: 'GET', param: null,
              evidence: `HTTP ${res.status}${loc ? ' Location: ' + loc : ' (no redirect to HTTPS)'}`,
              request: `GET ${origin}/`, response: `HTTP ${res.status}`,
            });
          }
        } catch (err) { if (err.code === 'CANCELLED') throw err; }
      }
    }
  }

  async function checkCors(findings, urls) {
    const probeOrigin = 'https://dast-probe.example';
    const seen = new Set();
    for (const url of urls) {
      if (client.cancelled || client.requests >= client.maxRequests) return;
      let key;
      try { const u = new URL(url); key = `${u.protocol}//${u.host}${u.pathname}`; } catch { continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const res = await client.request(url, { method: 'GET', headers: { origin: probeOrigin } });
        const acao = res.headers['access-control-allow-origin'] || '';
        const creds = String(res.headers['access-control-allow-credentials'] || '').toLowerCase() === 'true';
        if (acao === probeOrigin && creds) {
          findings.push(corsFinding('dast:cors-reflected-origin', url, `Access-Control-Allow-Origin reflects ${probeOrigin} with credentials`));
        } else if (acao === '*' && creds) {
          findings.push(corsFinding('dast:cors-wildcard-credentials', url, 'Access-Control-Allow-Origin: * with credentials'));
        }
      } catch (err) { if (err.code === 'CANCELLED') throw err; if (err.code === 'BUDGET') return; }
      if (client.cancelled || client.requests >= client.maxRequests) return;
      try {
        const res = await client.request(url, { method: 'GET', headers: { origin: 'null' } });
        if ((res.headers['access-control-allow-origin'] || '') === 'null') {
          findings.push(corsFinding('dast:cors-null-origin', url, "Access-Control-Allow-Origin: null"));
        }
      } catch (err) { if (err.code === 'CANCELLED') throw err; if (err.code === 'BUDGET') return; }
    }
  }

  function corsFinding(ruleKey, url, evidence) {
    return { rule: ruleKey, url, method: 'GET', param: 'Origin', evidence, request: `GET ${url} (Origin probe)`, response: evidence };
  }

  function tlsFinding(ruleKey, origin, evidence) {
    return { rule: ruleKey, url: origin, method: 'TLS', param: null, evidence, request: `TLS handshake ${origin}`, response: evidence };
  }

  // Analyze any bearer JWT we hold for algorithm weaknesses.
  function checkJwt(findings) {
    const tokens = new Set();
    if (config.auth && config.auth.bearer) tokens.add(config.auth.bearer);
    if (client.auth && client.auth.bearer) tokens.add(client.auth.bearer);
    for (const t of tokens) {
      for (const fnd of extra.analyzeJwt(t, 'Authorization bearer', scope.list()[0] + '/')) findings.push(fnd);
    }
  }

  function finalize(rawFindings, startedAt, pages) {
    const findings = [];
    const dedupe = new Set();
    for (const fnd of rawFindings) {
      const meta = rule(fnd.rule) || {};
      // Policy filter: drop findings whose rule is disabled for its phase.
      const isActive = policiesMod.ACTIVE_KEYS.includes(fnd.rule);
      if (isActive ? !policy.activeEnabled(fnd.rule) : !policy.passiveEnabled(fnd.rule)) continue;
      const key = `${fnd.rule}|${fnd.url}|${fnd.param || ''}|${fnd.method || ''}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      const std = meta.standards || {};
      findings.push({
        rule: fnd.rule,
        url: fnd.url,
        method: fnd.method || 'GET',
        param: fnd.param || null,
        evidence: fnd.evidence || '',
        request: fnd.request || '',
        response: fnd.response || '',
        severity: fnd.severity || meta.severity || 'INFO',
        type: fnd.type || meta.type || 'SECURITY_HOTSPOT',
        cwe: meta.cwe || (std.cwe && std.cwe[0]) || '',
        owasp2021: std.owasp2021 || [],
        message: fnd.message || meta.why || meta.name || { en: fnd.rule, ko: fnd.rule },
      });
    }
    const stats = { total: findings.length, bySeverity: {}, byRule: {}, byType: {} };
    for (const fnd of findings) {
      stats.bySeverity[fnd.severity] = (stats.bySeverity[fnd.severity] || 0) + 1;
      stats.byRule[fnd.rule] = (stats.byRule[fnd.rule] || 0) + 1;
      stats.byType[fnd.type] = (stats.byType[fnd.type] || 0) + 1;
    }
    return {
      target: scope.list(),
      mode,
      policy: { id: policy.id, name: policy.name, strength: policy.strength, threshold: policy.threshold },
      thresholdBreached: policiesMod.thresholdBreached(findings, policy.threshold),
      warnings: warnings.slice(),
      startedAt,
      finishedAt: new Date().toISOString(),
      requests: client.requests,
      pages: pages.map((p) => ({ url: p.url, status: p.status, contentType: p.contentType, depth: p.depth, forms: (p.forms || []).length })),
      findings,
      stats,
      scope: { origins: scope.list(), pathPrefix: scope.pathPrefix },
      outOfScopeSkipped: undefined,
    };
  }

  async function start() {
    const startedAt = new Date().toISOString();
    const rawFindings = [];
    const a = config.auth;
    const authed = !!(a && (a.cookie || a.bearer || a.headers || a.login || (a.sequence && a.sequence.length) || (a.script && a.script.length)));
    const extraInjectionPoints = [];
    const postmanPoints = [];
    const crawler = new Crawler({
      client,
      scope,
      maxDepth: config.maxDepth != null ? config.maxDepth : 5,
      maxPages: config.maxPages != null ? config.maxPages : 100,
    });
    // SSRF callback listener (active mode only, when SSRF rule is enabled).
    let ssrfCallback = null;
    const ssrfOn = mode === 'active' && config.ssrf !== false && policy.activeEnabled('dast:ssrf');
    try {
      await performLogin();
      emit('progress', { phase: 'discover', requests: client.requests, pages: 0, findings: 0 });
      await browserDiscover(crawler, extraInjectionPoints);
      await discover(crawler, postmanPoints);

      const injectionPoints = [];
      await crawler.run(async (res, page) => {
        const { findings: pf } = passiveChecks(res, page, { authed });
        for (const fnd of pf) { rawFindings.push(fnd); emit('finding', fnd); }
        if (mode === 'active') injectionPoints.push(...active.deriveInjectionPoints(page));
        await reloginIfNeeded(res);
        emit('progress', { phase: 'crawl', requests: client.requests, pages: crawler.pages.length, findings: rawFindings.length });
      });
      injectionPoints.push(...extraInjectionPoints, ...postmanPoints);

      await scanSensitivePaths(rawFindings);
      await checkTlsAndRedirect(rawFindings);
      checkJwt(rawFindings);
      const corsUrls = [...scope.list().map((o) => o + '/'), ...crawler.pages.filter((p) => !p.error).map((p) => p.url)].slice(0, 20);
      await checkCors(rawFindings, corsUrls);

      if (mode === 'active' && policy.activeOn) {
        if (ssrfOn) {
          ssrfCallback = new extra.SsrfCallback();
          try { await ssrfCallback.start(); } catch { ssrfCallback = null; }
        }
        emit('progress', { phase: 'active', requests: client.requests, pages: crawler.pages.length, findings: rawFindings.length });

        // API scanning: GraphQL, SOAP.
        await runApiScans(rawFindings);

        const probeOpts = {
          enabled: (k) => policy.activeEnabled(k),
          payloadCount: policy.payloadCount,
          ssrfCallback,
        };
        const seenMethodUrls = new Set();
        const seenPoints = new Set();
        for (const point of injectionPoints) {
          if (client.cancelled || client.requests >= client.maxRequests) break;
          const pkey = `${point.method} ${point.url}?${Object.keys(point.params).sort().join(',')}#${point.param}`;
          if (seenPoints.has(pkey)) continue;
          seenPoints.add(pkey);
          let baseline = null;
          try {
            baseline = await active.makeSender(client, point)(point.baseValue);
          } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') break; }
          try {
            const pf = await active.probePoint(client, point, baseline, probeOpts);
            for (const fnd of pf) { rawFindings.push(fnd); emit('finding', fnd); }
          } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') break; }
          if (!seenMethodUrls.has(point.url)) {
            seenMethodUrls.add(point.url);
            try {
              const mf = await active.methodChecks(client, point.url);
              for (const fnd of mf) { rawFindings.push(fnd); emit('finding', fnd); }
            } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') break; }
          }
          emit('progress', { phase: 'active', requests: client.requests, pages: crawler.pages.length, findings: rawFindings.length });
        }
        for (const origin of scope.list()) {
          if (client.cancelled || client.requests >= client.maxRequests) break;
          if (seenMethodUrls.has(origin + '/')) continue;
          try {
            const mf = await active.methodChecks(client, origin + '/');
            for (const fnd of mf) { rawFindings.push(fnd); emit('finding', fnd); }
          } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') break; }
        }

        // Login rate-limit absence (uses deliberately wrong credentials).
        if (policy.activeEnabled('dast:rate-limit-missing')) {
          const loginUrl = a && a.login && a.login.url;
          const rlCfg = config.rateLimitLogin;
          const url = loginUrl || (rlCfg && rlCfg.url);
          const fields = (a && a.login && a.login.fields) || (rlCfg && rlCfg.fields) || { username: 'mcc_probe', password: 'mcc_wrong' };
          if (url && scope.inScope(url) && !client.cancelled && client.requests < client.maxRequests) {
            try {
              const rf = await extra.rateLimitLoginCheck(client, scope, url, fields, rlCfg && rlCfg.attempts);
              for (const fnd of rf) { rawFindings.push(fnd); emit('finding', fnd); }
            } catch (err) { if (err.code !== 'CANCELLED' && err.code !== 'BUDGET') { /* non-fatal */ } }
          }
        }
      }
    } catch (err) {
      if (!(err instanceof CancelError) && err.code !== 'CANCELLED') {
        emit('error', { phase: 'scan', message: String(err.message || err) });
      }
    } finally {
      if (ssrfCallback) { try { await ssrfCallback.stop(); } catch { /* ignore */ } }
    }

    const result = finalize(rawFindings, startedAt, crawler.pages);
    result.cancelled = client.cancelled;
    result.outOfScopeSkipped = crawler.outOfScopeSkipped.slice(0, 50);
    emit('progress', { phase: 'done', requests: client.requests, pages: result.pages.length, findings: result.findings.length });
    return result;
  }

  async function runApiScans(rawFindings) {
    const enabled = (k) => policy.activeEnabled(k);
    // GraphQL
    if (config.graphql) {
      let gurl = config.graphql === true ? scope.list()[0] + '/graphql' : config.graphql;
      if (typeof gurl === 'string' && scope.inScope(gurl) && !client.cancelled && client.requests < client.maxRequests) {
        try {
          const gf = await apiscan.graphqlScan(client, gurl, { payloadCount: policy.payloadCount, enabled });
          for (const fnd of gf) { rawFindings.push(fnd); emit('finding', fnd); }
        } catch (err) { if (err.code !== 'CANCELLED' && err.code !== 'BUDGET') { /* non-fatal */ } }
      }
    }
    // SOAP / WSDL
    if (config.soap && !client.cancelled && client.requests < client.maxRequests) {
      try {
        const sf = await apiscan.soapScan(client, scope, config.soap, { payloadCount: policy.payloadCount, enabled });
        for (const fnd of sf) { rawFindings.push(fnd); emit('finding', fnd); }
      } catch (err) { if (err.code !== 'CANCELLED' && err.code !== 'BUDGET') { /* non-fatal */ } }
    }
  }

  const api = {
    start,
    cancel: () => client.cancel(),
    on,
    get requests() { return client.requests; },
  };
  return api;
}

function toSarif(result) { return report.toSarif(result); }
function toHtml(result, lang) { return report.toHtml(result, lang); }
function policies() { return policiesMod.policies(); }

module.exports = {
  createScan,
  catalog,
  policies,
  toSarif,
  toHtml,
  USER_AGENT,
  findBrowser: browser.findBrowser,
  parsePostman: apiscan.parsePostman,
  parseWsdl: apiscan.parseWsdl,
  parseIntrospection: apiscan.parseIntrospection,
};
