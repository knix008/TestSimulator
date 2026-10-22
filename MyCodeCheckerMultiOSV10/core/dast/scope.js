'use strict';

// Scope is the safety core: the scanner only ever contacts origins the user
// explicitly configures, and never follows anything outside the allowlist.

function normalizeOrigin(input) {
  let u;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  const port = u.port || (u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : '');
  return `${u.protocol}//${u.hostname.toLowerCase()}${port ? ':' + port : ''}`;
}

// Build a scope from config. origins: explicit allowlist; if absent, derive
// from target(s). pathPrefix: optional, limits crawling to a subtree.
function createScope(config) {
  const targets = []
    .concat(config.target || [])
    .concat(config.targets || [])
    .filter(Boolean);
  const rawOrigins = (config.scope && config.scope.origins) || targets;
  const origins = new Set();
  for (const o of [].concat(rawOrigins)) {
    const norm = normalizeOrigin(o);
    if (norm) origins.add(norm);
  }
  const pathPrefix = (config.scope && config.scope.pathPrefix) || '';
  return {
    origins,
    pathPrefix,
    inScope(url) {
      let u;
      try {
        u = new URL(url);
      } catch {
        return false;
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const norm = normalizeOrigin(url);
      if (!norm || !origins.has(norm)) return false;
      if (pathPrefix && !u.pathname.startsWith(pathPrefix)) return false;
      return true;
    },
    list() {
      return [...origins];
    },
  };
}

// Normalize a URL for dedupe: lowercase host, sort query keys, drop fragment.
// Keeps path case (paths can be case-sensitive) but sorts params so that the
// same endpoint with reordered params counts once.
function normalizeForDedupe(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  u.hash = '';
  const params = [...u.searchParams.entries()].sort((a, b) =>
    a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1,
  );
  u.search = '';
  const sp = new URLSearchParams();
  for (const [k, v] of params) sp.append(k, v);
  const qs = sp.toString();
  const host = u.hostname.toLowerCase();
  const port = u.port ? ':' + u.port : '';
  return `${u.protocol}//${host}${port}${u.pathname}${qs ? '?' + qs : ''}`;
}

// Dedupe key ignoring param *values* (same endpoint + same param names).
function endpointKey(url, method = 'GET') {
  let u;
  try {
    u = new URL(url);
  } catch {
    return `${method} ${url}`;
  }
  const names = [...u.searchParams.keys()].sort().join(',');
  return `${method} ${u.protocol}//${u.hostname.toLowerCase()}${u.port ? ':' + u.port : ''}${u.pathname}?${names}`;
}

function resolveUrl(base, ref) {
  try {
    return new URL(ref, base).href;
  } catch {
    return null;
  }
}

module.exports = {
  normalizeOrigin,
  createScope,
  normalizeForDedupe,
  endpointKey,
  resolveUrl,
};
