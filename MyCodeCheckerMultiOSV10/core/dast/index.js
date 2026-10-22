'use strict';

const { Client, CancelError, USER_AGENT } = require('./client');
const { createScope, resolveUrl } = require('./scope');
const { Crawler, parseSitemap, parseRobots, parseOpenApi } = require('./crawler');
const { passiveChecks } = require('./passive');
const active = require('./active');
const { catalog, rule } = require('./rules');
const report = require('./report');

// Known safe paths checked with a single GET each (never brute force): if one
// returns a recognizable signature it indicates an exposed VCS/config file.
const SENSITIVE_PATHS = [
  { path: '/.git/HEAD', sig: /ref:\s*refs\// },
  { path: '/.git/config', sig: /\[core\]/ },
  { path: '/.env', sig: /^[A-Z0-9_]+\s*=/m },
  { path: '/.svn/entries', sig: /^\d+\s*$|svn:/m },
];

function createScan(config = {}) {
  const listeners = { progress: [], finding: [], error: [] };
  const scope = createScope(config);
  if (scope.origins.size === 0) {
    throw new Error('DAST scope is empty: configure target/scope.origins (an allowlist of origins).');
  }
  const mode = config.mode === 'active' ? 'active' : 'passive';
  const client = new Client({
    scope,
    rateLimit: config.rateLimit != null ? config.rateLimit : 5,
    maxRequests: config.maxRequests != null ? config.maxRequests : 500,
    timeoutMs: config.timeoutMs,
    auth: config.auth || null,
  });

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

  async function loginIfConfigured() {
    const login = config.auth && config.auth.login;
    if (!login || !login.url) return;
    if (!scope.inScope(login.url)) return;
    try {
      const body = new URLSearchParams(login.fields || {}).toString();
      const res = await client.request(login.url, {
        method: (login.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
        body: (login.method || 'POST').toUpperCase() === 'GET' ? undefined : body,
      });
      for (const sc of res.setCookie || []) {
        const first = sc.split(';')[0];
        const eq = first.indexOf('=');
        if (eq > 0) client._cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    } catch (err) {
      if (err.code === 'CANCELLED') throw err;
      emit('error', { phase: 'login', message: String(err.message || err) });
    }
  }

  async function discover(crawler) {
    const seeds = [].concat(config.seeds || []);
    // Roots of each in-scope origin + optional path prefix.
    for (const origin of scope.list()) {
      crawler.enqueue(origin + (scope.pathPrefix || '/'));
    }
    for (const s of seeds) crawler.enqueue(s);

    // robots.txt + sitemap.xml for discovery (in scope only).
    for (const origin of scope.list()) {
      try {
        const rob = await client.request(origin + '/robots.txt', { method: 'GET' });
        if (rob.status < 400 && /text\/plain|robots/i.test(rob.headers['content-type'] || '') || (rob.status < 400 && rob.body)) {
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
      return endpoints;
    }
    return [];
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
        // HTTP origin: check whether it redirects to HTTPS.
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

  // CORS misconfiguration probe: send a crafted Origin (and a null Origin) and
  // inspect the reflected Access-Control-Allow-* headers. Safe GETs only.
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

  function finalize(rawFindings, startedAt, pages) {
    const findings = [];
    const dedupe = new Set();
    for (const fnd of rawFindings) {
      const meta = rule(fnd.rule) || {};
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
    const authed = !!(config.auth && (config.auth.cookie || config.auth.bearer || config.auth.headers || config.auth.login));
    const crawler = new Crawler({
      client,
      scope,
      maxDepth: config.maxDepth != null ? config.maxDepth : 5,
      maxPages: config.maxPages != null ? config.maxPages : 100,
    });
    try {
      await loginIfConfigured();
      emit('progress', { phase: 'discover', requests: client.requests, pages: 0, findings: 0 });
      await discover(crawler);

      const injectionPoints = [];
      await crawler.run(async (res, page) => {
        const { findings: pf } = passiveChecks(res, page, { authed });
        for (const fnd of pf) { rawFindings.push(fnd); emit('finding', fnd); }
        if (mode === 'active') injectionPoints.push(...active.deriveInjectionPoints(page));
        emit('progress', { phase: 'crawl', requests: client.requests, pages: crawler.pages.length, findings: rawFindings.length });
      });

      await scanSensitivePaths(rawFindings);
      await checkTlsAndRedirect(rawFindings);
      const corsUrls = [...scope.list().map((o) => o + '/'), ...crawler.pages.filter((p) => !p.error).map((p) => p.url)].slice(0, 20);
      await checkCors(rawFindings, corsUrls);

      if (mode === 'active') {
        emit('progress', { phase: 'active', requests: client.requests, pages: crawler.pages.length, findings: rawFindings.length });
        // Method checks once per distinct origin+path.
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
            const pf = await active.probePoint(client, point, baseline);
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
        // At least one method check on each origin root.
        for (const origin of scope.list()) {
          if (client.cancelled || client.requests >= client.maxRequests) break;
          if (seenMethodUrls.has(origin + '/')) continue;
          try {
            const mf = await active.methodChecks(client, origin + '/');
            for (const fnd of mf) { rawFindings.push(fnd); emit('finding', fnd); }
          } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') break; }
        }
      }
    } catch (err) {
      if (!(err instanceof CancelError) && err.code !== 'CANCELLED') {
        emit('error', { phase: 'scan', message: String(err.message || err) });
      }
    }

    const result = finalize(rawFindings, startedAt, crawler.pages);
    result.cancelled = client.cancelled;
    result.outOfScopeSkipped = crawler.outOfScopeSkipped.slice(0, 50);
    emit('progress', { phase: 'done', requests: client.requests, pages: result.pages.length, findings: result.findings.length });
    return result;
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

module.exports = { createScan, catalog, toSarif, toHtml, USER_AGENT };
