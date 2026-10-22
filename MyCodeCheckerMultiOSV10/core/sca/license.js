'use strict';

// License compliance: SPDX id normalisation, SPDX expression parsing
// (AND / OR / WITH, parentheses, "+" and LicenseRef-*), license text
// detection for LICENSE files, categories and a policy model.

const CATEGORIES = ['permissive', 'weak-copyleft', 'strong-copyleft', 'network-copyleft', 'proprietary', 'unknown'];

// SPDX id -> category. Ids are the canonical SPDX spelling.
const SPDX = {
  // permissive (and public-domain-like)
  '0BSD': 'permissive', 'AFL-3.0': 'permissive', 'Apache-1.1': 'permissive', 'Apache-2.0': 'permissive',
  'Artistic-2.0': 'permissive', 'BlueOak-1.0.0': 'permissive', 'BSD-1-Clause': 'permissive',
  'BSD-2-Clause': 'permissive', 'BSD-2-Clause-Patent': 'permissive', 'BSD-3-Clause': 'permissive',
  'BSD-3-Clause-Clear': 'permissive', 'BSD-4-Clause': 'permissive', 'BSL-1.0': 'permissive',
  'CC-BY-3.0': 'permissive', 'CC-BY-4.0': 'permissive', 'CC0-1.0': 'permissive', 'ECL-2.0': 'permissive',
  'ISC': 'permissive', 'MIT': 'permissive', 'MIT-0': 'permissive', 'MIT-CMU': 'permissive', 'MulanPSL-2.0': 'permissive',
  'NCSA': 'permissive', 'OpenSSL': 'permissive', 'PHP-3.0': 'permissive', 'PHP-3.01': 'permissive',
  'PostgreSQL': 'permissive', 'PSF-2.0': 'permissive', 'Python-2.0': 'permissive', 'Ruby': 'permissive',
  'Unicode-DFS-2016': 'permissive', 'Unicode-3.0': 'permissive', 'Unlicense': 'permissive', 'UPL-1.0': 'permissive',
  'W3C': 'permissive', 'WTFPL': 'permissive', 'X11': 'permissive', 'Zlib': 'permissive', 'zlib-acknowledgement': 'permissive',
  'ZPL-2.1': 'permissive', 'curl': 'permissive', 'HPND': 'permissive', 'JSON': 'permissive', 'Beerware': 'permissive',
  // weak copyleft
  'CDDL-1.0': 'weak-copyleft', 'CDDL-1.1': 'weak-copyleft', 'CPL-1.0': 'weak-copyleft', 'EPL-1.0': 'weak-copyleft',
  'EPL-2.0': 'weak-copyleft', 'EUPL-1.1': 'weak-copyleft', 'EUPL-1.2': 'weak-copyleft',
  'LGPL-2.0-only': 'weak-copyleft', 'LGPL-2.0-or-later': 'weak-copyleft', 'LGPL-2.1-only': 'weak-copyleft',
  'LGPL-2.1-or-later': 'weak-copyleft', 'LGPL-3.0-only': 'weak-copyleft', 'LGPL-3.0-or-later': 'weak-copyleft',
  'MPL-1.1': 'weak-copyleft', 'MPL-2.0': 'weak-copyleft', 'MPL-2.0-no-copyleft-exception': 'weak-copyleft',
  'MS-RL': 'weak-copyleft', 'OSL-3.0': 'weak-copyleft', 'CC-BY-SA-4.0': 'weak-copyleft', 'CC-BY-SA-3.0': 'weak-copyleft',
  'APSL-2.0': 'weak-copyleft', 'Artistic-1.0': 'weak-copyleft', 'LGPL-2.0': 'weak-copyleft',
  'MS-PL': 'permissive',
  // strong copyleft
  'GPL-1.0-only': 'strong-copyleft', 'GPL-1.0-or-later': 'strong-copyleft', 'GPL-2.0-only': 'strong-copyleft',
  'GPL-2.0-or-later': 'strong-copyleft', 'GPL-3.0-only': 'strong-copyleft', 'GPL-3.0-or-later': 'strong-copyleft',
  'Sleepycat': 'strong-copyleft', 'CECILL-2.1': 'strong-copyleft', 'QPL-1.0': 'strong-copyleft',
  // network copyleft
  'AGPL-1.0-only': 'network-copyleft', 'AGPL-1.0-or-later': 'network-copyleft', 'AGPL-3.0-only': 'network-copyleft',
  'AGPL-3.0-or-later': 'network-copyleft', 'SSPL-1.0': 'network-copyleft', 'RPL-1.5': 'network-copyleft', 'OSL-3.0-network': 'network-copyleft',
  // source-available / proprietary-like
  'BUSL-1.1': 'proprietary', 'Elastic-2.0': 'proprietary', 'CC-BY-NC-4.0': 'proprietary', 'CC-BY-NC-SA-4.0': 'proprietary',
  'CC-BY-ND-4.0': 'proprietary', 'Commons-Clause': 'proprietary', 'PolyForm-Noncommercial-1.0.0': 'proprietary',
};

const DEPRECATED = {
  'GPL-1.0': 'GPL-1.0-only', 'GPL-1.0+': 'GPL-1.0-or-later', 'GPL-2.0': 'GPL-2.0-only', 'GPL-2.0+': 'GPL-2.0-or-later',
  'GPL-3.0': 'GPL-3.0-only', 'GPL-3.0+': 'GPL-3.0-or-later', 'LGPL-2.1': 'LGPL-2.1-only', 'LGPL-2.1+': 'LGPL-2.1-or-later',
  'LGPL-3.0': 'LGPL-3.0-only', 'LGPL-3.0+': 'LGPL-3.0-or-later', 'LGPL-2.0+': 'LGPL-2.0-or-later', 'AGPL-3.0': 'AGPL-3.0-only',
  'AGPL-3.0+': 'AGPL-3.0-or-later', 'AGPL-1.0': 'AGPL-1.0-only', 'GPL-2.0-with-classpath-exception': 'GPL-2.0-only WITH Classpath-exception-2.0',
  'eCos-2.0': 'GPL-2.0-or-later WITH eCos-exception-2.0', 'StandardML-NJ': 'SMLNJ', 'wxWindows': 'GPL-2.0-or-later WITH WxWindows-exception-3.1',
  'LGPL-2.0': 'LGPL-2.0-only',
};

const EXCEPTIONS = {
  'Classpath-exception-2.0': 'weak-copyleft', 'LLVM-exception': 'permissive', 'GCC-exception-3.1': 'weak-copyleft',
  'GCC-exception-2.0': 'weak-copyleft', 'Autoconf-exception-3.0': 'permissive', 'Bison-exception-2.2': 'permissive',
  'Font-exception-2.0': 'weak-copyleft', 'OpenJDK-assembly-exception-1.0': 'weak-copyleft', 'Qt-LGPL-exception-1.1': 'weak-copyleft',
  'Linux-syscall-note': 'weak-copyleft', 'WxWindows-exception-3.1': 'weak-copyleft', 'eCos-exception-2.0': 'weak-copyleft',
  'Universal-FOSS-exception-1.0': 'weak-copyleft', 'openvpn-openssl-exception': 'strong-copyleft',
};

const LOWER = new Map();
for (const id of Object.keys(SPDX)) LOWER.set(id.toLowerCase(), id);
for (const id of Object.keys(DEPRECATED)) LOWER.set(id.toLowerCase(), DEPRECATED[id]);
const EXC_LOWER = new Map(Object.keys(EXCEPTIONS).map((k) => [k.toLowerCase(), k]));

// Free-text aliases seen in package metadata (npm, PyPI classifiers, Maven
// <licenses>, NuGet, Cargo). Keys are compared after lower-casing and
// squeezing punctuation.
const ALIASES = [
  [/^(the )?mit( license)?( \(mit\))?$|^expat$|^mit\/x11$/, 'MIT'],
  [/^(the )?apache( software)?( license)?,? ?(version )?(v ?)?2(\.0)?( license)?$|^asl ?2(\.0)?$|^apache2$|^apl ?2(\.0)?$|^apache-2$/, 'Apache-2.0'],
  [/^(the )?apache( software)?( license)?,? ?(version )?(v ?)?1\.1$/, 'Apache-1.1'],
  [/^(new |modified |revised )?bsd( 3[- ]clause)?( license)?$|^bsd-3$|^3-clause bsd( license)?$|^bsd 3$|^the bsd license$|^bsd license 3$/, 'BSD-3-Clause'],
  [/^(simplified |freebsd )?bsd 2[- ]clause( license)?$|^2-clause bsd( license)?$|^bsd-2$|^simplified bsd( license)?$|^freebsd$/, 'BSD-2-Clause'],
  [/^isc( license)?( \(iscl\))?$|^iscl$/, 'ISC'],
  [/^(gnu )?(general public license|gpl) ?v?2( only)?( \(gplv2\))?$|^gplv2$|^gnu gpl v2$/, 'GPL-2.0-only'],
  [/^(gnu )?(general public license|gpl) ?v?2\+$|^gplv2\+$|^(gnu )?gpl v?2 or later$|^gplv2 or later$/, 'GPL-2.0-or-later'],
  [/^(gnu )?(general public license|gpl) ?v?3( only)?( \(gplv3\))?$|^gplv3$|^gnu gpl v3$/, 'GPL-3.0-only'],
  [/^(gnu )?(general public license|gpl) ?v?3\+$|^gplv3\+$|^(gnu )?gpl v?3 or later$|^gplv3 or later$/, 'GPL-3.0-or-later'],
  [/^(gnu )?(lesser|library) (general public license|gpl) ?v?2(\.1)?( \(lgpl\))?$|^lgplv2(\.1)?$|^lgpl ?v?2\.1$/, 'LGPL-2.1-only'],
  [/^(gnu )?(lesser|library) (general public license|gpl) ?v?2(\.1)?\+$|^lgplv2(\.1)?\+$|^lgpl ?v?2\.1\+$/, 'LGPL-2.1-or-later'],
  [/^(gnu )?lesser (general public license|gpl) ?v?3( \(lgplv3\))?$|^lgplv3$|^lgpl ?v?3$/, 'LGPL-3.0-only'],
  [/^(gnu )?lesser (general public license|gpl) ?v?3\+$|^lgplv3\+$|^lgpl ?v?3\+$/, 'LGPL-3.0-or-later'],
  [/^(gnu )?affero (general public license|gpl) ?v?3( \(agpl-?3\.0\))?$|^agplv3$|^agpl ?v?3$/, 'AGPL-3.0-only'],
  [/^(gnu )?affero (general public license|gpl) ?v?3\+$|^agplv3\+$/, 'AGPL-3.0-or-later'],
  [/^mozilla public license,? ?(version )?2(\.0)?( \(mpl 2\.0\))?$|^mpl ?v?2(\.0)?$/, 'MPL-2.0'],
  [/^mozilla public license,? ?(version )?1\.1$|^mpl ?v?1\.1$/, 'MPL-1.1'],
  [/^eclipse public license,? ?(- )?(version |v ?)?1(\.0)?$|^epl ?v?1(\.0)?$/, 'EPL-1.0'],
  [/^eclipse public license,? ?(- )?(version |v ?)?2(\.0)?$|^epl ?v?2(\.0)?$/, 'EPL-2.0'],
  [/^(common development and distribution license|cddl),? ?(\(cddl\) )?(version |v ?)?1(\.0)?$/, 'CDDL-1.0'],
  [/^(common development and distribution license|cddl),? ?(version |v ?)?1\.1$/, 'CDDL-1.1'],
  [/^(the )?unlicense$|^public domain \(unlicense\)$/, 'Unlicense'],
  [/^cc0( 1\.0)?( universal)?$|^cc0-1$|^creative commons zero/, 'CC0-1.0'],
  [/^boost software license,? ?(version )?1(\.0)?$|^boost$|^bsl ?1(\.0)?$/, 'BSL-1.0'],
  [/^python software foundation license$|^psf( license)?$|^psfl$/, 'PSF-2.0'],
  [/^zlib( license)?$|^zlib\/libpng$/, 'Zlib'],
  [/^wtfpl$|^do what the f\*?\w* you want/, 'WTFPL'],
  [/^(server side public license|sspl)( v?1)?$/, 'SSPL-1.0'],
  [/^(business source license|bsl) 1\.1$/, 'BUSL-1.1'],
  [/^elastic license( 2\.0| v2)?$/, 'Elastic-2.0'],
  [/^ruby( license)?$/, 'Ruby'],
  [/^php license( 3\.01)?$/, 'PHP-3.01'],
  [/^(eupl|european union public licen[cs]e) ?(v ?)?1\.2$/, 'EUPL-1.2'],
  [/^microsoft public license$|^ms-pl$/, 'MS-PL'],
  [/^universal permissive license/, 'UPL-1.0'],
  [/^postgresql( license)?$/, 'PostgreSQL'],
];

const PROPRIETARY_HINTS = /^(unlicensed|proprietary|commercial|private|all rights reserved|see license in|closed|other\/proprietary license)/i;

function squeeze(s) {
  return String(s).toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').replace(/[,;]+$/, '').trim();
}

// Normalise one license id or free-text name. Returns the SPDX id, a
// LicenseRef-*, or null when not recognised.
function normalizeLicenseId(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/^\(|\)$/g, '').trim();
  if (!s) return null;
  if (/^(LicenseRef|DocumentRef)-[A-Za-z0-9.:-]+$/.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return licenseFromUrl(s);
  const direct = LOWER.get(s.toLowerCase());
  if (direct) return direct;
  let plus = false;
  if (s.endsWith('+')) {
    const base = LOWER.get(s.slice(0, -1).toLowerCase());
    if (base) return orLater(base);
    plus = true;
  }
  const sq = squeeze(s.replace(/^license ?:? ?/i, '').replace(/^OSI Approved :: /i, '').replace(/ License$/i, (m) => m));
  for (const [re, id] of ALIASES) if (re.test(sq)) return plus ? orLater(id) : id;
  const noVersionSuffix = sq.replace(/ license$/, '');
  for (const [re, id] of ALIASES) if (re.test(noVersionSuffix)) return id;
  if (PROPRIETARY_HINTS.test(s)) return 'LicenseRef-Proprietary';
  return null;
}

function orLater(id) {
  if (/-only$/.test(id)) return id.replace(/-only$/, '-or-later');
  if (/-or-later$/.test(id)) return id;
  return `${id}+`;
}

function licenseFromUrl(url) {
  const u = url.toLowerCase();
  if (/apache\.org\/licenses\/license-2\.0/.test(u)) return 'Apache-2.0';
  if (/opensource\.org\/licenses\/mit/.test(u)) return 'MIT';
  if (/opensource\.org\/licenses\/bsd-3/.test(u)) return 'BSD-3-Clause';
  if (/opensource\.org\/licenses\/bsd-2/.test(u)) return 'BSD-2-Clause';
  if (/gnu\.org\/licenses\/gpl-3/.test(u) || /gpl-3\.0/.test(u)) return 'GPL-3.0-only';
  if (/gnu\.org\/licenses\/(old-licenses\/)?gpl-2/.test(u)) return 'GPL-2.0-only';
  if (/lgpl-2\.1/.test(u)) return 'LGPL-2.1-only';
  if (/lgpl-3/.test(u) || /lgpl\.html/.test(u)) return 'LGPL-3.0-only';
  if (/agpl/.test(u)) return 'AGPL-3.0-only';
  if (/mozilla\.org\/(en-us\/)?mpl\/2\.0/.test(u)) return 'MPL-2.0';
  if (/eclipse\.org\/legal\/epl-2\.0/.test(u) || /epl-2\.0/.test(u)) return 'EPL-2.0';
  if (/epl-v10|epl-1\.0/.test(u)) return 'EPL-1.0';
  const m = /spdx\.org\/licenses\/([A-Za-z0-9.+-]+?)(\.html)?$/.exec(url);
  if (m) return normalizeLicenseId(m[1]);
  const n = /licenses\/([A-Za-z0-9.+-]+)$/.exec(url);
  if (n) return normalizeLicenseId(n[1]);
  return null;
}

// ------------------------------------------------------ expressions ------

function tokenize(expr) {
  const out = [];
  const re = /\s*(\(|\)|[^\s()]+)/g;
  let m;
  while ((m = re.exec(expr))) out.push(m[1]);
  return out;
}

// Parse an SPDX license expression into an AST:
//   { type: 'license', id, known, plus } | { type: 'with', license, exception }
//   | { type: 'and'|'or', left, right }
// Legacy forms are accepted: "MIT/Apache-2.0" (Cargo, = OR), "MIT or Apache"
// (lower-case operators), comma lists, and free-text single names.
function parseExpression(input) {
  if (input == null) return null;
  let expr = String(input).trim();
  if (!expr) return null;
  // A whole-string free-text name first ("Apache License, Version 2.0").
  if (!/\b(AND|OR|WITH)\b|[()]/i.test(expr) && !expr.includes('/') || /^https?:/i.test(expr)) {
    const id = normalizeLicenseId(expr);
    if (id || !/[,;]| \| /.test(expr)) return leaf(id || expr, !!id);
  }
  if (!/\b(AND|OR|WITH)\b/.test(expr)) {
    expr = expr.replace(/\s+(and|or|with)\s+/gi, (m, op) => ` ${op.toUpperCase()} `);
  }
  if (expr.includes('/') && !/https?:/.test(expr)) expr = expr.replace(/\s*\/\s*/g, ' OR ');
  if (/[,;]|\s\|\s/.test(expr) && !/\b(AND|OR)\b/.test(expr)) expr = expr.split(/\s*[,;|]\s*/).filter(Boolean).join(' OR ');
  const tokens = tokenize(expr);
  let k = 0;
  function primary() {
    const tok = tokens[k++];
    if (tok === undefined) return null;
    if (tok === '(') {
      const e = orExpr();
      if (tokens[k] === ')') k++;
      return e;
    }
    // Multi-word licence names between operators ("Apache License 2.0 OR MIT").
    const words = [tok];
    while (k < tokens.length && !['AND', 'OR', 'WITH', '(', ')'].includes(tokens[k])) words.push(tokens[k++]);
    const raw = words.join(' ');
    const id = normalizeLicenseId(raw);
    let node = leaf(id || raw, !!id);
    if (tokens[k] === 'WITH') {
      k++;
      const exc = tokens[k++] || '';
      const canonical = EXC_LOWER.get(exc.toLowerCase()) || exc;
      node = { type: 'with', license: node, exception: canonical, knownException: EXC_LOWER.has(exc.toLowerCase()) };
    }
    return node;
  }
  function andExpr() {
    let left = primary();
    while (tokens[k] === 'AND') { k++; left = { type: 'and', left, right: primary() }; }
    return left;
  }
  function orExpr() {
    let left = andExpr();
    while (tokens[k] === 'OR') { k++; left = { type: 'or', left, right: andExpr() }; }
    return left;
  }
  return orExpr();
}

function leaf(id, known) {
  // A deprecated id may expand to an expression (GPL-2.0-with-classpath-exception).
  if (known && /\sWITH\s/.test(id)) {
    const [lic, exc] = id.split(/\s+WITH\s+/);
    return { type: 'with', license: { type: 'license', id: lic, known: true }, exception: exc, knownException: true };
  }
  return { type: 'license', id, known: known || /^(LicenseRef|DocumentRef)-/.test(id) };
}

function expressionToString(node, parentOp) {
  if (!node) return 'NOASSERTION';
  if (node.type === 'license') return /\s/.test(node.id) && !node.known ? `LicenseRef-${node.id.replace(/[^A-Za-z0-9.-]+/g, '-')}` : node.id;
  if (node.type === 'with') return `${expressionToString(node.license)} WITH ${node.exception}`;
  const op = node.type.toUpperCase();
  const s = `${expressionToString(node.left, op)} ${op} ${expressionToString(node.right, op)}`;
  return parentOp && parentOp !== op ? `(${s})` : s;
}

function normalizeExpression(input) {
  const ast = parseExpression(input);
  return ast ? expressionToString(ast) : null;
}

function licenseIds(node, out = []) {
  if (!node) return out;
  if (node.type === 'license') out.push(node.id);
  else if (node.type === 'with') licenseIds(node.license, out);
  else { licenseIds(node.left, out); licenseIds(node.right, out); }
  return out;
}

function categoryOf(id) {
  if (!id) return 'unknown';
  if (/^LicenseRef-Proprietary/i.test(id)) return 'proprietary';
  const clean = String(id).replace(/\+$/, '');
  return SPDX[clean] || SPDX[DEPRECATED[clean]] || 'unknown';
}

// ----------------------------------------------------------- policy -------

const DEFAULT_POLICY = {
  allowed: [],            // SPDX ids always allowed
  denied: [],             // SPDX ids always denied
  review: [],             // SPDX ids that need a review
  categories: {
    permissive: 'allowed',
    'weak-copyleft': 'review',
    'strong-copyleft': 'review',
    'network-copyleft': 'denied',
    proprietary: 'denied',
    unknown: 'unknown',
  },
  reportMissing: false,   // flag dependencies without any license information
  ignoreDev: true,        // dev/test-only dependencies are not distributed
};

const VERDICT_RANK = { allowed: 0, review: 1, unknown: 2, denied: 3 };

function mergePolicy(policy) {
  const p = policy || {};
  return {
    ...DEFAULT_POLICY,
    ...p,
    categories: { ...DEFAULT_POLICY.categories, ...(p.categories || {}) },
    allowed: (p.allowed || []).map((x) => normalizeLicenseId(x) || x),
    denied: (p.denied || []).map((x) => normalizeLicenseId(x) || x),
    review: (p.review || []).map((x) => normalizeLicenseId(x) || x),
  };
}

function evaluateNode(node, policy) {
  if (!node) return { verdict: 'unknown', category: 'unknown', ids: [] };
  if (node.type === 'license') {
    const id = node.id;
    const category = node.known ? categoryOf(id) : 'unknown';
    let verdict;
    if (policy.denied.includes(id)) verdict = 'denied';
    else if (policy.allowed.includes(id)) verdict = 'allowed';
    else if (policy.review.includes(id)) verdict = 'review';
    else verdict = policy.categories[category] || 'unknown';
    return { verdict, category, ids: [id] };
  }
  if (node.type === 'with') {
    const base = evaluateNode(node.license, policy);
    const excCat = EXCEPTIONS[node.exception];
    if (excCat && policy.categories[excCat] && !policy.denied.includes(node.license.id)) {
      const rankCat = CATEGORIES.indexOf(excCat) < CATEGORIES.indexOf(base.category) ? excCat : base.category;
      return { verdict: policy.categories[rankCat] || base.verdict, category: rankCat, ids: base.ids, exception: node.exception };
    }
    return { ...base, exception: node.exception };
  }
  const l = evaluateNode(node.left, policy);
  const r = evaluateNode(node.right, policy);
  if (node.type === 'or') {
    // Choice: the licensee may pick the most favourable option.
    return VERDICT_RANK[l.verdict] <= VERDICT_RANK[r.verdict] ? { ...l, chosen: true } : { ...r, chosen: true };
  }
  // Conjunction: every license applies, so the strictest wins.
  const worst = VERDICT_RANK[l.verdict] >= VERDICT_RANK[r.verdict] ? l : r;
  return { verdict: worst.verdict, category: worst.category, ids: [...l.ids, ...r.ids] };
}

function evaluateLicense(expression, policy) {
  const p = mergePolicy(policy);
  const ast = typeof expression === 'string' || expression == null ? parseExpression(expression) : expression;
  if (!ast) return { verdict: p.reportMissing ? 'unknown' : 'missing', category: 'unknown', ids: [], expression: null };
  const r = evaluateNode(ast, p);
  return { ...r, expression: expressionToString(ast) };
}

// npm / Maven / NuGet metadata to one expression string.
function licenseFromMetadata(meta) {
  if (meta == null) return null;
  if (typeof meta === 'string') return meta;
  if (Array.isArray(meta)) {
    const parts = meta.map(licenseFromMetadata).filter(Boolean);
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : parts.map((x) => (/\s/.test(x) ? `(${x})` : x)).join(' OR ');
  }
  if (typeof meta === 'object') return meta.type || meta.name || meta.id || meta.expression || meta.spdx || meta.url || null;
  return null;
}

// --------------------------------------------------------- detection -----

const TEXT_RULES = [
  ['AGPL-3.0-only', (t) => /GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t) && /Version 3/i.test(t)],
  ['LGPL-3.0-only', (t) => /GNU LESSER GENERAL PUBLIC LICENSE/i.test(t) && /Version 3/i.test(t)],
  ['LGPL-2.1-only', (t) => /GNU LESSER GENERAL PUBLIC LICENSE/i.test(t) && /Version 2\.1/i.test(t)],
  ['LGPL-2.0-only', (t) => /GNU LIBRARY GENERAL PUBLIC LICENSE/i.test(t)],
  ['GPL-3.0-only', (t) => /GNU GENERAL PUBLIC LICENSE/i.test(t) && /Version 3/i.test(t)],
  ['GPL-2.0-only', (t) => /GNU GENERAL PUBLIC LICENSE/i.test(t) && /Version 2/i.test(t)],
  ['MPL-2.0', (t) => /Mozilla Public License,? (Version|v\.?) ?2\.0/i.test(t)],
  ['EPL-2.0', (t) => /Eclipse Public License - v 2\.0/i.test(t)],
  ['EPL-1.0', (t) => /Eclipse Public License - v 1\.0/i.test(t)],
  ['Apache-2.0', (t) => /Apache License/i.test(t) && /Version 2\.0/i.test(t)],
  ['BSL-1.0', (t) => /Boost Software License - Version 1\.0/i.test(t)],
  ['Unlicense', (t) => /This is free and unencumbered software released into the public domain/i.test(t)],
  ['CC0-1.0', (t) => /CC0 1\.0 Universal/i.test(t)],
  ['ISC', (t) => /Permission to use, copy, modify, and(\/or)? distribute this software for any purpose with or without fee/i.test(t)],
  ['0BSD', (t) => /Permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(t) && !/copyright notice and this permission notice appear/i.test(t)],
  ['MIT', (t) => /Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(t)],
  ['BSD-3-Clause', (t) => /Redistribution and use in source and binary forms/i.test(t) && /(Neither the name|names of its contributors may be used)/i.test(t)],
  ['BSD-2-Clause', (t) => /Redistribution and use in source and binary forms/i.test(t)],
  ['Zlib', (t) => /This software is provided 'as-is', without any express or implied/i.test(t) && /altered source versions must be plainly marked/i.test(t)],
  ['WTFPL', (t) => /DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE/i.test(t)],
  ['PSF-2.0', (t) => /PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2/i.test(t)],
  ['SSPL-1.0', (t) => /Server Side Public License/i.test(t)],
  ['BUSL-1.1', (t) => /Business Source License 1\.1/i.test(t)],
];

function detectLicenseText(text) {
  if (!text) return null;
  const head = String(text).slice(0, 20000);
  const spdx = /SPDX-License-Identifier:\s*([^\n*]+)/.exec(head);
  if (spdx) return normalizeExpression(spdx[1].trim());
  for (const [id, test] of TEXT_RULES) if (test(head)) return id;
  return null;
}

const LICENSE_FILE_RE = /^(licen[cs]e|copying|unlicense|notice)(\.(md|txt|rst|markdown|mit|apache|bsd))?(-[a-z0-9.-]+)?$/i;

function isLicenseFile(name) {
  return LICENSE_FILE_RE.test(name);
}

module.exports = {
  CATEGORIES, SPDX_CATEGORY: SPDX, EXCEPTIONS, DEFAULT_POLICY,
  normalizeLicenseId, parseExpression, normalizeExpression, expressionToString, licenseIds, categoryOf,
  evaluateLicense, mergePolicy, licenseFromMetadata, detectLicenseText, isLicenseFile,
};
