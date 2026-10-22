'use strict';

// Version ordering and range matching per ecosystem.
//
//   semver   npm, crates.io, Pub, SwiftURL, Hex (SemVer 2.0.0 precedence)
//   go       Go modules: semver with a "v" prefix; pseudo-versions
//            (v0.0.0-20210101000000-abcdef123456, vX.Y.Z-0.ts-hash) order as
//            pre-releases, "+incompatible" is build metadata
//   pep440   PyPI (epoch, release, a/b/rc, post, dev, local)
//   maven    Maven ComparableVersion (qualifiers alpha < beta < milestone <
//            rc < snapshot < release < sp, digit/letter transitions)
//   ruby     RubyGems Gem::Version (letters make a pre-release)
//   composer Packagist (dev < alpha < beta < RC < stable < patch)
//   nuget    NuGet SemVer 2 with an optional 4th part, case-insensitive
//   loose    everything else (Conan, vcpkg, unknown)

// ------------------------------------------------------------- semver -----

function parseSemver(v, { parts = 3 } = {}) {
  const s = String(v == null ? '' : v).trim().replace(/^[=v]+/i, '').replace(/^\s+/, '');
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(s);
  if (!m) return null;
  if (m[4] !== undefined && parts < 4) return null;
  return {
    nums: [m[1], m[2] || '0', m[3] || '0', m[4] || '0'].map(Number),
    pre: m[5] ? m[5].split('.') : [],
    build: m[6] || '',
    given: [m[1], m[2], m[3], m[4]].filter((x) => x !== undefined).length,
  };
}

function cmpIdent(a, b, ci) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Math.sign(Number(a) - Number(b));
  if (na) return -1;
  if (nb) return 1;
  const x = ci ? a.toLowerCase() : a;
  const y = ci ? b.toLowerCase() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}

function cmpParsedSemver(a, b, ci = false) {
  for (let k = 0; k < 4; k++) if (a.nums[k] !== b.nums[k]) return Math.sign(a.nums[k] - b.nums[k]);
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  const n = Math.max(a.pre.length, b.pre.length);
  for (let k = 0; k < n; k++) {
    if (a.pre[k] === undefined) return -1;
    if (b.pre[k] === undefined) return 1;
    const c = cmpIdent(a.pre[k], b.pre[k], ci);
    if (c) return c;
  }
  return 0;
}

// ------------------------------------------------------------- PEP 440 ----

const PEP_RE = /^\s*v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(a|alpha|b|beta|c|rc|pre|preview)[-_.]?(\d*))?(?:-(\d+)|[-_.]?(post|rev|r)[-_.]?(\d*))?(?:[-_.]?(dev)[-_.]?(\d*))?(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?\s*$/i;

function parsePep440(v) {
  const m = PEP_RE.exec(String(v == null ? '' : v));
  if (!m) return null;
  const release = m[2].split('.').map(Number);
  while (release.length > 1 && release[release.length - 1] === 0) release.pop();
  let pre = null;
  if (m[3]) {
    const ph = m[3].toLowerCase();
    const rank = ph === 'a' || ph === 'alpha' ? 0 : ph === 'b' || ph === 'beta' ? 1 : 2;
    pre = [rank, Number(m[4] || 0)];
  }
  let post = null;
  if (m[5] !== undefined) post = Number(m[5]);
  else if (m[6]) post = Number(m[7] || 0);
  const dev = m[8] ? Number(m[9] || 0) : null;
  const local = m[10] ? m[10].toLowerCase().split(/[-_.]/) : null;
  return { epoch: Number(m[1] || 0), release, pre, post, dev, local };
}

function cmpPep440(a, b) {
  if (a.epoch !== b.epoch) return Math.sign(a.epoch - b.epoch);
  const n = Math.max(a.release.length, b.release.length);
  for (let k = 0; k < n; k++) {
    const x = a.release[k] || 0;
    const y = b.release[k] || 0;
    if (x !== y) return Math.sign(x - y);
  }
  // Pre-release key: a dev release with no pre/post sorts before any pre-release.
  const preKey = (v) => {
    if (!v.pre && v.post === null && v.dev !== null) return [-Infinity, 0];
    if (!v.pre) return [Infinity, 0];
    return v.pre;
  };
  const pa = preKey(a);
  const pb = preKey(b);
  if (pa[0] !== pb[0]) return pa[0] < pb[0] ? -1 : 1;
  if (pa[1] !== pb[1]) return Math.sign(pa[1] - pb[1]);
  const posta = a.post === null ? -Infinity : a.post;
  const postb = b.post === null ? -Infinity : b.post;
  if (posta !== postb) return posta < postb ? -1 : 1;
  const deva = a.dev === null ? Infinity : a.dev;
  const devb = b.dev === null ? Infinity : b.dev;
  if (deva !== devb) return deva < devb ? -1 : 1;
  if (!a.local && !b.local) return 0;
  if (!a.local) return -1;
  if (!b.local) return 1;
  const ln = Math.max(a.local.length, b.local.length);
  for (let k = 0; k < ln; k++) {
    if (a.local[k] === undefined) return -1;
    if (b.local[k] === undefined) return 1;
    const c = cmpIdent(a.local[k], b.local[k], true);
    if (c) return c;
  }
  return 0;
}

// --------------------------------------------------------------- Maven ----

const MAVEN_QUAL = { alpha: 0, a: 0, beta: 1, b: 1, milestone: 2, m: 2, rc: 3, cr: 3, preview: 3, snapshot: 4, '': 5, ga: 5, final: 5, release: 5, sp: 6 };

function mavenTokens(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  const out = [];
  let k = 0;
  while (k < s.length) {
    const c = s[k];
    if (c === '.' || c === '-' || c === '_' || c === '+') { k++; continue; }
    if (/\d/.test(c)) {
      let e = k;
      while (e < s.length && /\d/.test(s[e])) e++;
      out.push(Number(s.slice(k, e)));
      k = e;
    } else {
      let e = k;
      while (e < s.length && !/[\d.\-_+]/.test(s[e])) e++;
      let word = s.slice(k, e);
      // "a1" / "b2" / "m3" directly followed by a digit are alpha / beta / milestone.
      if ((word === 'a' || word === 'b' || word === 'm') && !/\d/.test(s[e] || '')) word = word + '_';
      out.push(word);
      k = e;
    }
  }
  return out;
}

function mavenQualRank(q) {
  if (Object.prototype.hasOwnProperty.call(MAVEN_QUAL, q)) return [MAVEN_QUAL[q], ''];
  return [7, q];
}

function cmpMaven(a, b) {
  const x = mavenTokens(a);
  const y = mavenTokens(b);
  const n = Math.max(x.length, y.length);
  for (let k = 0; k < n; k++) {
    let p = x[k];
    let q = y[k];
    if (p === undefined) p = typeof q === 'number' ? 0 : '';
    if (q === undefined) q = typeof p === 'number' ? 0 : '';
    if (typeof p === 'number' && typeof q === 'number') { if (p !== q) return Math.sign(p - q); continue; }
    if (typeof p === 'number') {
      // number vs qualifier: a release qualifier ('' / ga / final) equals 0
      const r = mavenQualRank(q);
      if (r[0] === 5 && p === 0) continue;
      return 1;
    }
    if (typeof q === 'number') {
      const r = mavenQualRank(p);
      if (r[0] === 5 && q === 0) continue;
      return -1;
    }
    const rp = mavenQualRank(p);
    const rq = mavenQualRank(q);
    if (rp[0] !== rq[0]) return Math.sign(rp[0] - rq[0]);
    if (rp[1] !== rq[1]) return rp[1] < rq[1] ? -1 : 1;
  }
  return 0;
}

// ------------------------------------------------------------ RubyGems ----

function rubySegments(v) {
  const s = String(v == null ? '' : v).trim().replace(/-/g, '.pre.');
  return (s.match(/[0-9]+|[a-z]+/gi) || []).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
}

function cmpRuby(a, b) {
  const x = rubySegments(a);
  const y = rubySegments(b);
  const n = Math.max(x.length, y.length);
  for (let k = 0; k < n; k++) {
    const p = x[k] === undefined ? 0 : x[k];
    const q = y[k] === undefined ? 0 : y[k];
    if (p === q) continue;
    if (typeof p === 'string' && typeof q === 'number') return -1;
    if (typeof p === 'number' && typeof q === 'string') return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// ------------------------------------------------------------ Composer ----

const COMPOSER_STAB = { dev: 0, alpha: 1, a: 1, beta: 2, b: 2, rc: 3, stable: 4, patch: 5, pl: 5, p: 5 };

function parseComposer(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/^v/, '');
  if (/^dev-/.test(s)) return null;
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[._-]?(stable|beta|b|rc|alpha|a|patch|pl|p|dev)(?:[._-]?(\d+))?)?(?:[.-]?dev)?$/.exec(s);
  if (!m) return null;
  const dev = /[.-]dev$/.test(s) && m[5] !== 'dev';
  return {
    nums: [m[1], m[2] || 0, m[3] || 0, m[4] || 0].map(Number),
    stab: m[5] ? COMPOSER_STAB[m[5]] : 4,
    stabN: Number(m[6] || 0),
    dev,
  };
}

function cmpComposer(a, b) {
  for (let k = 0; k < 4; k++) if (a.nums[k] !== b.nums[k]) return Math.sign(a.nums[k] - b.nums[k]);
  if (a.stab !== b.stab) return Math.sign(a.stab - b.stab);
  if (a.stabN !== b.stabN) return Math.sign(a.stabN - b.stabN);
  if (a.dev !== b.dev) return a.dev ? -1 : 1;
  return 0;
}

// --------------------------------------------------------------- loose ----

function cmpLoose(a, b) {
  return cmpMaven(String(a).replace(/^v/i, ''), String(b).replace(/^v/i, ''));
}

// ------------------------------------------------------------ dispatch ----

function family(ecosystem) {
  switch (ecosystem) {
    case 'npm': case 'crates.io': case 'Pub': case 'SwiftURL': case 'Hex': case 'GitHubActions': return 'semver';
    case 'Go': return 'go';
    case 'PyPI': return 'pep440';
    case 'Maven': return 'maven';
    case 'RubyGems': return 'ruby';
    case 'Packagist': return 'composer';
    case 'NuGet': return 'nuget';
    default: return 'loose';
  }
}

function compare(ecosystem, a, b) {
  if (a === b) return 0;
  switch (family(ecosystem)) {
    case 'semver': case 'go': {
      const x = parseSemver(a);
      const y = parseSemver(b);
      if (x && y) return cmpParsedSemver(x, y);
      return cmpLoose(a, b);
    }
    case 'nuget': {
      const x = parseSemver(a, { parts: 4 });
      const y = parseSemver(b, { parts: 4 });
      if (x && y) return cmpParsedSemver(x, y, true);
      return cmpLoose(a, b);
    }
    case 'pep440': {
      const x = parsePep440(a);
      const y = parsePep440(b);
      if (x && y) return cmpPep440(x, y);
      return cmpLoose(a, b);
    }
    case 'maven': return cmpMaven(a, b);
    case 'ruby': return cmpRuby(a, b);
    case 'composer': {
      const x = parseComposer(a);
      const y = parseComposer(b);
      if (x && y) return cmpComposer(x, y);
      return cmpLoose(a, b);
    }
    default: return cmpLoose(a, b);
  }
}

function isValid(ecosystem, v) {
  if (v == null || v === '') return false;
  switch (family(ecosystem)) {
    case 'semver': case 'go': return !!parseSemver(v);
    case 'nuget': return !!parseSemver(v, { parts: 4 });
    case 'pep440': return !!parsePep440(v);
    case 'composer': return !!parseComposer(v);
    default: return /\d/.test(String(v));
  }
}

function isPrerelease(ecosystem, v) {
  switch (family(ecosystem)) {
    case 'semver': case 'go': case 'nuget': { const p = parseSemver(v, { parts: 4 }); return !!(p && p.pre.length); }
    case 'pep440': { const p = parsePep440(v); return !!(p && (p.pre || p.dev !== null)); }
    case 'ruby': return /[a-z]/i.test(String(v));
    case 'maven': return mavenTokens(v).some((x) => typeof x === 'string' && mavenQualRank(x)[0] < 5);
    case 'composer': { const p = parseComposer(v); return !!(p && p.stab < 4); }
    default: return /(alpha|beta|rc|pre|snapshot|dev)/i.test(String(v));
  }
}

// Go pseudo-version: vX.Y.Z-[0.]yyyymmddhhmmss-abcdefabcdef
function isPseudoVersion(v) {
  return /^v?\d+\.\d+\.\d+-(?:[0-9A-Za-z.]+\.)?(?:0\.)?\d{14}-[0-9a-f]{12}(?:\+incompatible)?$/.test(String(v));
}

function sortVersions(ecosystem, list) {
  return [...list].sort((a, b) => compare(ecosystem, a, b));
}

// ----------------------------------------------------- range expressions --
// satisfies(ecosystem, version, spec) understands the native spec language
// of each ecosystem: npm / Cargo / Composer / Pub ranges, PEP 440 specifier
// sets, Maven and NuGet interval notation, RubyGems requirements.

function bump(ecosystem, v, part) {
  const nums = String(v).replace(/^[v=]/i, '').split(/[.+-]/).slice(0, 3).map((x) => Number(x) || 0);
  while (nums.length < 3) nums.push(0);
  if (part === 0) return `${nums[0] + 1}.0.0`;
  if (part === 1) return `${nums[0]}.${nums[1] + 1}.0`;
  return `${nums[0]}.${nums[1]}.${nums[2] + 1}`;
}

// Expand one npm-style comparator token into [op, version] pairs.
function expandComparator(ecosystem, token, cargoBare) {
  const m = /^(\^|~>|~=|~|>=|<=|>|<|==|=|!=)?\s*v?(.*)$/.exec(token.trim());
  if (!m) return [];
  let op = m[1] || '';
  const ver = m[2].trim();
  if (ver === '' || ver === '*' || /^[xX]$/.test(ver)) return [['*']];
  const parts = ver.split(/[-+]/)[0].split('.');
  const xIdx = parts.findIndex((p) => /^[xX*]$/.test(p));
  const given = xIdx >= 0 ? xIdx : parts.length;
  const base = parts.slice(0, given).concat(['0', '0', '0']).slice(0, Math.max(3, given)).join('.');
  const fullVer = xIdx >= 0 ? base : ver;
  if (op === '' && cargoBare) op = '^';
  if (xIdx >= 0 || (op === '' || op === '=') && given < 3 && family(ecosystem) === 'semver' && !/[-+]/.test(ver)) {
    // x-range / partial version: 1.x, 1.2.*, 1, 1.2
    if (op === '' || op === '=' || op === '==') {
      if (given === 0) return [['*']];
      return [['>=', base], ['<', bump(ecosystem, base, given - 1)]];
    }
  }
  switch (op) {
    case '^': {
      const n = fullVer.split(/[-+]/)[0].split('.').map(Number);
      while (n.length < 3) n.push(0);
      let upper;
      if (n[0] > 0 || given === 1) upper = bump(ecosystem, fullVer, 0);
      else if (n[1] > 0 || given === 2) upper = bump(ecosystem, fullVer, 1);
      else upper = bump(ecosystem, fullVer, 2);
      return [['>=', fullVer], ['<', upper]];
    }
    case '~': {
      if (ecosystem === 'Packagist') {
        // Composer: ~1.2 means >=1.2 <2.0 ; ~1.2.3 means >=1.2.3 <1.3.0
        const upper = bump(ecosystem, fullVer, Math.max(0, given - 2));
        return [['>=', fullVer], ['<', upper]];
      }
      return [['>=', fullVer], ['<', bump(ecosystem, fullVer, given === 1 ? 0 : 1)]];
    }
    case '~>': case '~=': {
      const upper = bump(ecosystem, fullVer, Math.max(0, given - 2));
      return [['>=', fullVer], ['<', upper]];
    }
    case '': case '=': case '==': return [['=', fullVer]];
    default: return [[op, fullVer]];
  }
}

function testOps(ecosystem, version, ops) {
  for (const [op, v] of ops) {
    if (op === '*') continue;
    const c = compare(ecosystem, version, v);
    if (op === '>=' && c < 0) return false;
    if (op === '>' && c <= 0) return false;
    if (op === '<=' && c > 0) return false;
    if (op === '<' && c >= 0) return false;
    if (op === '=' && c !== 0) return false;
    if (op === '!=' && c === 0) return false;
  }
  return true;
}

function npmStyleSatisfies(ecosystem, version, spec) {
  const cargo = ecosystem === 'crates.io' || ecosystem === 'Pub';
  const alternatives = String(spec).split(/\s*\|\|?\s*/);
  return alternatives.some((alt) => {
    const a = alt.trim();
    if (a === '' || a === '*' || a === 'latest') return true;
    const hy = /^(\S+)\s+-\s+(\S+)$/.exec(a);
    if (hy) {
      const hi = hy[2].split('.');
      const upper = hi.length < 3 ? [['<', bump(ecosystem, hy[2], hi.length - 1)]] : [['<=', hy[2]]];
      return testOps(ecosystem, version, [['>=', hy[1]], ...upper]);
    }
    const tokens = a.replace(/(\^|~>|~=|~|>=|<=|>|<|==|=|!=)\s+/g, '$1').split(/[\s,]+/).filter(Boolean);
    const ops = tokens.flatMap((tok) => expandComparator(ecosystem, tok, cargo));
    return testOps(ecosystem, version, ops);
  });
}

function pep440Satisfies(version, spec) {
  const clauses = String(spec).split(',').map((s) => s.trim()).filter(Boolean);
  return clauses.every((cl) => {
    const m = /^(===|==|!=|~=|<=|>=|<|>)\s*(.+)$/.exec(cl);
    if (!m) return compare('PyPI', version, cl) === 0;
    const [, op, v] = m;
    if (op === '===') return String(version) === v;
    if ((op === '==' || op === '!=') && v.endsWith('.*')) {
      const prefix = parsePep440(v.slice(0, -2));
      const pv = parsePep440(version);
      if (!prefix || !pv) return false;
      const want = v.slice(0, -2).replace(/^\s*v?(\d+!)?/i, '').split('.').map(Number);
      const match = want.every((x, k) => (pv.release[k] || 0) === x) && pv.epoch === prefix.epoch;
      return op === '==' ? match : !match;
    }
    if (op === '~=') {
      const parts = v.split('.');
      const upper = bump('PyPI', v, Math.max(0, parts.length - 2));
      return compare('PyPI', version, v) >= 0 && compare('PyPI', version, upper) < 0;
    }
    return testOps('PyPI', version, [[op === '==' ? '=' : op, v]]);
  });
}

function intervalSatisfies(ecosystem, version, spec) {
  const s = String(spec).trim();
  if (!/^[[(]/.test(s)) {
    // NuGet bare version = minimum; Maven bare version = soft requirement (exact).
    if (ecosystem === 'NuGet') return compare(ecosystem, version, s) >= 0;
    return compare(ecosystem, version, s) === 0;
  }
  const re = /([[(])\s*([^,\])]*)\s*(?:,\s*([^\])]*))?\s*([\])])/g;
  let m;
  let any = false;
  while ((m = re.exec(s))) {
    any = true;
    const [, open, lo, hi, close] = m;
    const single = m[0].indexOf(',') < 0;
    if (single) { if (compare(ecosystem, version, lo) === 0) return true; continue; }
    let ok = true;
    if (lo) { const c = compare(ecosystem, version, lo); ok = open === '[' ? c >= 0 : c > 0; }
    if (ok && hi) { const c = compare(ecosystem, version, hi); ok = close === ']' ? c <= 0 : c < 0; }
    if (ok) return true;
  }
  return !any;
}

function rubySatisfies(version, spec) {
  return String(spec).split(',').map((s) => s.trim()).filter(Boolean).every((cl) => {
    const m = /^(~>|>=|<=|!=|=|>|<)?\s*(.+)$/.exec(cl);
    const op = m[1] || '=';
    const v = m[2];
    if (op === '~>') {
      const segs = v.split('.');
      const keep = segs.slice(0, Math.max(1, segs.length - 1)).map(Number);
      keep[keep.length - 1] += 1;
      return compare('RubyGems', version, v) >= 0 && compare('RubyGems', version, keep.join('.')) < 0;
    }
    return testOps('RubyGems', version, [[op, v]]);
  });
}

function satisfies(ecosystem, version, spec) {
  if (spec == null || spec === '' || spec === '*') return true;
  switch (ecosystem) {
    case 'PyPI': return pep440Satisfies(version, spec);
    case 'Maven': case 'NuGet': return intervalSatisfies(ecosystem, version, spec);
    case 'RubyGems': return rubySatisfies(version, spec);
    case 'Go': return compare('Go', version, spec) === 0;
    default: return npmStyleSatisfies(ecosystem, version, spec);
  }
}

// --------------------------------------------------- declared spec info ---
// analyzeSpec tells whether a declared version spec pins one version, is a
// wildcard, has no upper bound, and what its lowest acceptable version is.

function analyzeSpec(ecosystem, spec) {
  const raw = spec == null ? '' : String(spec).trim();
  const out = { raw, pinned: false, wildcard: false, unbounded: false, url: false, lower: null };
  if (raw === '' || raw === '*' || /^latest$/i.test(raw) || /^[xX]$/.test(raw) || raw === 'LATEST' || raw === 'RELEASE' || raw === '+' || raw === 'next' || /^latest\.\w+$/i.test(raw)) {
    out.wildcard = true;
    return out;
  }
  if (/^(git\+|git:|https?:|file:|link:|github:|[\w.-]+\/[\w.-]+#)/.test(raw) || /\.git(#|$)/.test(raw)) {
    out.url = true;
    out.pinned = /#[0-9a-f]{7,40}$/i.test(raw);
    return out;
  }
  if (/^(workspace:|path:|portal:|patch:)/.test(raw)) { out.url = true; out.pinned = true; return out; }
  const s = raw.replace(/^npm:[^@]+@/, '');
  if (/\.\+$/.test(s) || (/\.\*$/.test(s) && ecosystem === 'NuGet')) { out.dynamic = true; out.lower = s.replace(/\.[+*]$/, ''); return out; }
  const verRe = /v?(\d+(?:\.[\dxX*]+)*(?:[-+.]?[0-9A-Za-z][0-9A-Za-z.+-]*)?)/;
  const lowerMatch = /(?:\^|~>|~=|~|>=|==|=|\[|^)\s*v?(\d[0-9A-Za-z.+-]*)/.exec(s) || verRe.exec(s);
  if (lowerMatch) out.lower = lowerMatch[1].replace(/[.][xX*].*$/, '').replace(/,.*$/, '');
  const hasUpper = /(<|\^|~|\]|\)|\.\*|\.[xX]\b)/.test(s) || (/^\(/.test(s));
  const hasLower = />/.test(s);
  switch (ecosystem) {
    case 'npm': case 'Pub': case 'SwiftURL':
      out.pinned = /^=?v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(s);
      break;
    case 'crates.io':
      out.pinned = /^=\s*\d+\.\d+\.\d+/.test(s);
      if (!out.pinned && /^\d/.test(s)) { out.unbounded = false; return out; }
      break;
    case 'PyPI':
      out.pinned = /^===?\s*[^,*]+$/.test(s) && !/\*/.test(s);
      if (!/[<>=~!^]/.test(s) && !/^\d/.test(s)) out.wildcard = true;
      if (/^\d[\w.]*$/.test(s)) out.pinned = true; // Poetry bare version means ==
      break;
    case 'Maven':
      out.pinned = !/[[(,]/.test(s) || /^\[[^,]+\]$/.test(s);
      if (/^\[[^,]+,\s*\)$/.test(s)) out.unbounded = true;
      return out;
    case 'NuGet':
      out.pinned = /^\[?[^,[\]()]+\]?$/.test(s) && !/\*/.test(s);
      if (/\*/.test(s)) out.wildcard = /^\*$/.test(s);
      if (/^\[[^,]+,\s*\)$/.test(s) || /^\d[^,]*\*/.test(s)) out.unbounded = /^\[[^,]+,\s*\)$/.test(s);
      return out;
    case 'RubyGems':
      out.pinned = /^=?\s*\d[^,<>~]*$/.test(s);
      break;
    case 'Packagist':
      out.pinned = /^v?\d+\.\d+\.\d+(\.\d+)?(-[0-9A-Za-z.]+)?$/.test(s);
      break;
    case 'Go':
      out.pinned = true;
      return out;
    default:
      out.pinned = /^=?v?\d[\w.+-]*$/.test(s);
  }
  if (!out.pinned && hasLower && !hasUpper) out.unbounded = true;
  return out;
}

module.exports = {
  compare, satisfies, analyzeSpec, isValid, isPrerelease, isPseudoVersion, sortVersions, family,
  parseSemver, parsePep440, mavenTokens, cmpMaven, cmpRuby, parseComposer,
};
