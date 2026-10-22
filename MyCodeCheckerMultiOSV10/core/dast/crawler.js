'use strict';

const { extract } = require('./html');
const { resolveUrl, normalizeForDedupe } = require('./scope');

// Extract URLs/endpoints referenced from JavaScript by regex. Tolerant and
// conservative: only string literals that look like paths or same-origin URLs.
function extractJsUrls(js) {
  const found = new Set();
  if (!js) return [];
  // fetch('...'), axios.get('...'), url: '...', "/api/..." string literals
  const strRe = /['"`]((?:https?:)?\/\/[^'"`\s]+|\/[A-Za-z0-9_\-./]+(?:\?[^'"`\s]*)?)['"`]/g;
  let m;
  while ((m = strRe.exec(js))) {
    const v = m[1];
    if (v.length > 1 && !v.startsWith('//')) found.add(v);
    else if (v.startsWith('//')) found.add(v);
  }
  // template path fragments like `/api/users/${id}` -> /api/users/
  const tplRe = /['"`](\/[A-Za-z0-9_\-./]+)\$\{/g;
  while ((m = tplRe.exec(js))) found.add(m[1]);
  return [...found];
}

// Parse sitemap.xml (urlset or sitemapindex). Pure string scan, no XML dep.
function parseSitemap(xml) {
  const urls = [];
  if (!xml) return urls;
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) urls.push(decodeXml(m[1].trim()));
  return urls;
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Parse robots.txt for discovery only (Sitemap: lines and Allow/Disallow
// paths). We use it to *find* paths, and we deliberately do not treat it as a
// licence to crawl anything out of scope.
function parseRobots(txt) {
  const sitemaps = [];
  const paths = new Set();
  if (!txt) return { sitemaps, paths: [] };
  for (const line of txt.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const colon = l.indexOf(':');
    if (colon === -1) continue;
    const key = l.slice(0, colon).trim().toLowerCase();
    const val = l.slice(colon + 1).trim();
    if (key === 'sitemap') sitemaps.push(val);
    else if ((key === 'allow' || key === 'disallow') && val && val !== '/') {
      const clean = val.replace(/\*.*$/, '').replace(/\$$/, '');
      if (clean.startsWith('/') && clean.length > 1) paths.add(clean);
    }
  }
  return { sitemaps, paths: [...paths] };
}

// Import OpenAPI/Swagger 2.0 or 3.x JSON to seed endpoints + parameters.
function parseOpenApi(doc, baseUrl) {
  const out = [];
  if (!doc || typeof doc !== 'object' || !doc.paths) return out;
  let base = baseUrl || '';
  if (doc.servers && doc.servers[0] && doc.servers[0].url) {
    base = resolveUrl(baseUrl || 'http://localhost', doc.servers[0].url) || base;
  } else if (doc.host) {
    const scheme = (doc.schemes && doc.schemes[0]) || 'https';
    base = `${scheme}://${doc.host}${doc.basePath || ''}`;
  }
  for (const [p, item] of Object.entries(doc.paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of ['get', 'post']) {
      const op = item[method];
      if (!op) continue;
      const params = [];
      const all = [].concat(item.parameters || [], op.parameters || []);
      for (const pr of all) {
        if (!pr || !pr.name) continue;
        params.push({ name: pr.name, in: pr.in || 'query', required: !!pr.required });
      }
      const full = joinUrl(base, p);
      out.push({ url: full, method: method.toUpperCase(), params, path: p });
    }
  }
  return out;
}

function joinUrl(base, p) {
  if (/^https?:\/\//i.test(p)) return p;
  if (!base) return p;
  return base.replace(/\/+$/, '') + '/' + String(p).replace(/^\/+/, '');
}

// Crawler: manages a frontier of in-scope URLs, respects depth/page limits and
// dedupes by normalized URL. It never enqueues an out-of-scope URL and never
// follows redirects (index.js handles that). Each fetched page is handed to a
// visitor callback for passive/active analysis.
class Crawler {
  constructor({ client, scope, maxDepth = 5, maxPages = 100 }) {
    this.client = client;
    this.scope = scope;
    this.maxDepth = maxDepth;
    this.maxPages = maxPages;
    this.seen = new Set();
    this.queue = [];
    this.pages = [];
    this.outOfScopeSkipped = [];
  }

  enqueue(url, depth = 0) {
    if (url == null) return false;
    const abs = /^https?:\/\//i.test(url) ? url : null;
    if (!abs) return false;
    if (!this.scope.inScope(abs)) {
      this.outOfScopeSkipped.push(abs);
      return false;
    }
    const key = normalizeForDedupe(abs);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.queue.push({ url: abs, depth });
    return true;
  }

  // Resolve a possibly-relative discovered reference against the page URL,
  // then enqueue only if in scope.
  discover(baseUrl, ref, depth) {
    const abs = resolveUrl(baseUrl, ref);
    if (!abs) return;
    this.enqueue(abs, depth);
  }

  async run(visit) {
    while (this.queue.length && this.pages.length < this.maxPages) {
      if (this.client.cancelled) break;
      const { url, depth } = this.queue.shift();
      let res;
      try {
        res = await this.client.request(url, { method: 'GET' });
      } catch (err) {
        if (err.code === 'CANCELLED' || err.code === 'BUDGET') break;
        this.pages.push({ url, error: String(err.message || err) });
        continue;
      }
      const ctype = String(res.headers['content-type'] || '');
      const page = {
        url,
        status: res.status,
        contentType: ctype,
        depth,
        links: [],
        forms: [],
        scripts: [],
      };

      // Follow redirects only if the Location is in scope (never outside).
      if (res.status >= 300 && res.status < 400 && res.location) {
        const target = resolveUrl(url, res.location);
        if (target && depth < this.maxDepth) this.enqueue(target, depth + 1);
        page.redirectTo = res.location;
      }

      if (/html/i.test(ctype) || (!ctype && /</.test(res.body))) {
        const ex = extract(res.body);
        page.links = ex.links;
        page.forms = ex.forms;
        page.scripts = ex.scripts;
        if (depth < this.maxDepth) {
          for (const href of ex.links) this.discover(url, href, depth + 1);
          for (const src of ex.scripts) this.discover(url, src, depth + 1);
          for (const form of ex.forms) {
            const act = resolveUrl(url, form.action || url);
            if (act) this.enqueue(act, depth + 1);
          }
          // JS-referenced endpoints from inline scripts
          for (const inline of ex.inlineScripts) {
            for (const ref of extractJsUrls(inline)) this.discover(url, ref, depth + 1);
          }
        }
      } else if (/javascript|ecmascript/i.test(ctype)) {
        if (depth < this.maxDepth) {
          for (const ref of extractJsUrls(res.body)) this.discover(url, ref, depth + 1);
        }
      }

      this.pages.push(page);
      if (visit) await visit(res, page);
    }
    return this.pages;
  }
}

module.exports = {
  Crawler,
  extractJsUrls,
  parseSitemap,
  parseRobots,
  parseOpenApi,
};
