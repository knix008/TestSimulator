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
  const t = identifyLicenseText(head);
  return t ? t.id : null;
}

// ------------------------------------------------- template matching -----
// Normalised key-phrase fingerprints (our own selection of short, distinctive
// phrases). Text is lower-cased and every run of non-alphanumerics becomes one
// space, so line wrapping, punctuation and comment markers do not matter.
// A template scores matched / total phrases; "required" phrases must all be
// present and any "exclude" phrase disqualifies it. Notice templates match
// the short headers projects put at the top of source files.

const TEMPLATES = [
  { id: 'MIT', phrases: ['permission is hereby granted free of charge to any person obtaining a copy', 'the above copyright notice and this permission notice shall be included', 'the software is provided as is without warranty of any kind', 'to deal in the software without restriction'] },
  { id: 'ISC', phrases: ['permission to use copy modify and or distribute this software for any purpose with or without fee is hereby granted', 'provided that the above copyright notice and this permission notice appear in all copies', 'the author disclaims all warranties with regard to this software'], required: ['provided that the above copyright notice and this permission notice appear in all copies'] },
  { id: 'BSD-3-Clause', phrases: ['redistribution and use in source and binary forms with or without modification are permitted', 'redistributions of source code must retain the above copyright notice', 'redistributions in binary form must reproduce the above copyright notice', 'may be used to endorse or promote products derived from this software'], required: ['may be used to endorse or promote products derived from this software'], exclude: ['all advertising materials mentioning features'] },
  { id: 'BSD-2-Clause', phrases: ['redistribution and use in source and binary forms with or without modification are permitted', 'redistributions of source code must retain the above copyright notice', 'redistributions in binary form must reproduce the above copyright notice', 'this software is provided by the copyright holders and contributors as is'], exclude: ['may be used to endorse or promote products derived', 'all advertising materials mentioning features'] },
  { id: 'Apache-2.0', phrases: ['apache license version 2 0', 'terms and conditions for use reproduction and distribution', 'grant of patent license', 'you must give any other recipients of the work or derivative works a copy of this license', 'the contents of the notice file are for informational purposes only'] },
  { id: 'Apache-2.0', notice: true, phrases: ['licensed under the apache license version 2 0', 'you may not use this file except in compliance with the license', 'www apache org licenses license 2 0'] },
  { id: 'GPL-3.0', phrases: ['gnu general public license', 'version 3 29 june 2007', 'the gnu general public license is a free copyleft license for software and other kinds of works', 'conveying verbatim copies', 'the precise terms and conditions for copying distribution and modification follow'], exclude: ['lesser general public license', 'affero general public license'] },
  { id: 'GPL-2.0', phrases: ['gnu general public license', 'version 2 june 1991', 'everyone is permitted to copy and distribute verbatim copies', 'the licenses for most software are designed to take away your freedom to share and change it', 'this general public license applies to most of the free software foundation s software'], exclude: ['lesser general public license', 'library general public license', 'affero general public license'] },
  { id: 'GPL-3.0', notice: true, phrases: ['this program is free software you can redistribute it and or modify it under the terms of the gnu general public license', 'either version 3 of the license', 'without even the implied warranty of merchantability or fitness for a particular purpose'], required: ['either version 3 of the license'], exclude: ['lesser general public license', 'affero general public license'] },
  { id: 'GPL-2.0', notice: true, phrases: ['this program is free software you can redistribute it and or modify it under the terms of the gnu general public license', 'either version 2 of the license', 'without even the implied warranty of merchantability or fitness for a particular purpose'], required: ['either version 2 of the license'], exclude: ['lesser general public license', 'library general public license', 'affero general public license'] },
  { id: 'LGPL-2.1', phrases: ['gnu lesser general public license', 'version 2 1 february 1999', 'this license the lesser general public license applies to some specially designated software packages', 'the precise terms and conditions for copying distribution and modification follow'] },
  { id: 'LGPL-3.0', phrases: ['gnu lesser general public license', 'version 3 29 june 2007', 'this version of the gnu lesser general public license incorporates the terms and conditions of version 3 of the gnu general public license', 'combined works'] },
  { id: 'LGPL-2.1', notice: true, phrases: ['you can redistribute it and or modify it under the terms of the gnu lesser general public license', 'either version 2 1 of the license'], required: ['either version 2 1 of the license'] },
  { id: 'LGPL-3.0', notice: true, phrases: ['you can redistribute it and or modify it under the terms of the gnu lesser general public license', 'either version 3 of the license'], required: ['either version 3 of the license'] },
  { id: 'AGPL-3.0', phrases: ['gnu affero general public license', 'version 3 19 november 2007', 'remote network interaction', 'the gnu affero general public license is a free copyleft license'] },
  { id: 'AGPL-3.0', notice: true, phrases: ['under the terms of the gnu affero general public license', 'either version 3 of the license'], required: ['gnu affero general public license'] },
  { id: 'MPL-2.0', phrases: ['mozilla public license version 2 0', 'covered software', 'larger work', 'executable form', 'incompatible with secondary licenses'] },
  { id: 'MPL-2.0', notice: true, phrases: ['this source code form is subject to the terms of the mozilla public license v 2 0', 'if a copy of the mpl was not distributed with this file'] },
  { id: 'EPL-2.0', phrases: ['eclipse public license v 2 0', 'the accompanying program is provided under the terms of this eclipse public license', 'secondary license', 'commercial distribution'], required: ['eclipse public license v 2 0'] },
  { id: 'EPL-1.0', phrases: ['eclipse public license v 1 0', 'the accompanying program is provided under the terms of this eclipse public license', 'commercial distribution', 'contributor'], required: ['eclipse public license v 1 0'] },
];

function normalizeLicenseTextForMatch(text) {
  return ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

// -> { id, score, method: 'template'|'notice', matched, candidates } | null
function identifyLicenseText(text, options = {}) {
  if (!text) return null;
  const norm = normalizeLicenseTextForMatch(String(text).slice(0, options.maxChars || 60000));
  const min = options.minScore != null ? options.minScore : 0.6;
  const scored = [];
  for (const tpl of TEMPLATES) {
    if ((tpl.exclude || []).some((p) => norm.includes(` ${p} `))) continue;
    if ((tpl.required || []).some((p) => !norm.includes(` ${p} `))) continue;
    const matched = tpl.phrases.filter((p) => norm.includes(` ${p} `));
    const score = matched.length / tpl.phrases.length;
    if (!matched.length) continue;
    let id = tpl.id;
    if (/^(L|A)?GPL-/.test(id)) {
      const later = / (or at your option any later version|or any later version) /.test(norm);
      id = `${id}-${later ? 'or-later' : 'only'}`;
    }
    scored.push({ id, score: Math.round(score * 100) / 100, method: tpl.notice ? 'notice' : 'template', matched, weight: matched.length });
  }
  scored.sort((a, b) => b.score - a.score || b.weight - a.weight);
  const best = scored[0];
  if (!best || best.score < min) return null;
  return { id: best.id, score: best.score, method: best.method, matched: best.matched, candidates: scored.slice(0, 5).map((s) => ({ id: s.id, score: s.score })) };
}

// --------------------------------------------------------- obligations ---

const OBLIGATION_TEXT = {
  'include-license': { en: 'Ship the license text with every copy', ko: '모든 복사본에 라이선스 전문을 함께 배포해야 합니다' },
  'include-copyright': { en: 'Keep the copyright notices', ko: '저작권 고지를 유지해야 합니다' },
  'include-notice': { en: 'Pass on the NOTICE file contents', ko: 'NOTICE 파일 내용을 함께 배포해야 합니다' },
  'state-changes': { en: 'Mark modified files as changed', ko: '수정한 파일에 변경 사실을 표시해야 합니다' },
  'disclose-source': { en: 'Provide (or offer) the complete corresponding source with distributed binaries', ko: '배포하는 바이너리와 함께 대응 소스 전체를 제공하거나 제공을 약속해야 합니다' },
  'same-license': { en: 'License derivative works under the same license', ko: '파생 저작물도 같은 라이선스로 배포해야 합니다' },
  'network-use-disclose': { en: 'Offer the source to users who interact with the software over a network', ko: '네트워크로 사용하는 사용자에게도 소스를 제공해야 합니다' },
  'library-relinking': { en: 'Let users relink or replace the library (dynamic linking is the usual way)', ko: '사용자가 라이브러리를 다시 링크하거나 교체할 수 있게 해야 합니다(보통 동적 링크)' },
  'file-level-copyleft': { en: 'Keep modified files of the component under its license and publish their source', ko: '구성 요소의 수정한 파일은 같은 라이선스로 두고 소스를 공개해야 합니다' },
  'no-endorsement': { en: "Do not use the authors' names to promote products", ko: '저작자 이름을 제품 홍보에 쓰면 안 됩니다' },
  'patent-grant': { en: 'Includes a patent license that ends if you start patent litigation', ko: '특허 소송을 제기하면 끝나는 특허 허락이 포함되어 있습니다' },
  'no-trademark': { en: 'Grants no trademark rights', ko: '상표권은 허락되지 않습니다' },
  'non-commercial': { en: 'Commercial use is not permitted', ko: '상업적 사용이 허용되지 않습니다' },
  'use-restrictions': { en: 'Use is restricted (for example no competing hosted service); read the terms', ko: '사용이 제한됩니다(예: 경쟁 호스팅 서비스 금지). 조건을 확인하세요' },
};

const OBLIGATION_RULES = [
  [/^(MIT|ISC|X11|MIT-CMU|BSD-2-Clause|BSD-2-Clause-Patent|NCSA|PostgreSQL|JSON|curl|HPND|W3C|BSD-1-Clause|UPL-1.0|MulanPSL-2.0|Python-2.0|PSF-2.0|Ruby|PHP-3.0|PHP-3.01|BlueOak-1.0.0|OpenSSL|Unicode-DFS-2016|Unicode-3.0|AFL-3.0|Artistic-2.0|ZPL-2.1|MS-PL|Beerware)$/, ['include-copyright', 'include-license']],
  [/^BSD-3-Clause(-Clear)?$|^BSD-4-Clause$/, ['include-copyright', 'include-license', 'no-endorsement']],
  [/^Apache-2\.0$|^ECL-2\.0$/, ['include-copyright', 'include-license', 'include-notice', 'state-changes', 'patent-grant', 'no-trademark']],
  [/^Apache-1\.1$/, ['include-copyright', 'include-license', 'no-endorsement']],
  [/^(Zlib|zlib-acknowledgement)$/, ['state-changes', 'include-license']],
  [/^BSL-1\.0$/, ['include-license']],
  [/^(Unlicense|CC0-1\.0|0BSD|MIT-0|WTFPL)$/, []],
  [/^CC-BY-(3|4)\.0$/, ['include-copyright', 'state-changes']],
  [/^(MPL-1\.1|MPL-2\.0(-no-copyleft-exception)?|CDDL-1\.[01]|EPL-[12]\.0|CPL-1\.0|MS-RL|APSL-2\.0|EUPL-1\.[12]|OSL-3\.0|CC-BY-SA-[34]\.0|Artistic-1\.0)$/, ['include-license', 'include-copyright', 'file-level-copyleft', 'patent-grant']],
  [/^LGPL-/, ['include-license', 'include-copyright', 'state-changes', 'library-relinking', 'disclose-source']],
  [/^GPL-|^(Sleepycat|CECILL-2\.1|QPL-1\.0)$/, ['include-license', 'include-copyright', 'state-changes', 'disclose-source', 'same-license']],
  [/^(AGPL-|SSPL-1\.0|RPL-1\.5)/, ['include-license', 'include-copyright', 'state-changes', 'disclose-source', 'same-license', 'network-use-disclose']],
  [/^CC-BY-NC|^PolyForm-Noncommercial/, ['non-commercial', 'include-copyright']],
  [/^(BUSL-1\.1|Elastic-2\.0|Commons-Clause)$|^LicenseRef-Proprietary/i, ['use-restrictions']],
];

function obligationsForId(id) {
  const clean = String(id || '').replace(/\+$/, '');
  for (const [re, list] of OBLIGATION_RULES) if (re.test(clean)) return list;
  return null;
}

function obligationsOfNode(node) {
  if (!node) return null;
  if (node.type === 'license') return obligationsForId(node.id);
  if (node.type === 'with') return obligationsOfNode(node.license);
  const l = obligationsOfNode(node.left);
  const r = obligationsOfNode(node.right);
  if (node.type === 'or') {
    // The licensee may choose: take the option with fewer obligations.
    if (!l) return r;
    if (!r) return l;
    return l.length <= r.length ? l : r;
  }
  if (!l && !r) return null;
  return [...new Set([...(l || []), ...(r || [])])];
}

// licenseObligations('MIT AND Apache-2.0') -> [{ id, text: { en, ko } }]
function licenseObligations(expression) {
  const ast = typeof expression === 'string' || expression == null ? parseExpression(expression) : expression;
  const ids = obligationsOfNode(ast) || [];
  return ids.map((id) => ({ id, text: OBLIGATION_TEXT[id] }));
}

// ------------------------------------------------------- compatibility ---

function familyOf(id) {
  return String(id || '').replace(/\+$/, '').replace(/-(only|or-later)$/, '');
}

// Hints for one dependency license in a project license context.
//   projectLicense: SPDX expression, 'proprietary', or null (assumed proprietary).
// -> [{ level: 'conflict'|'warning'|'info', code, message: { en, ko }, assumed }]
function compatibilityHints(projectLicense, depLicense, options = {}) {
  const out = [];
  if (!depLicense) return out;
  const depEval = evaluateLicense(depLicense, options.policy);
  const depCat = depEval.category;
  const depIds = depEval.ids || [];
  const assumed = !projectLicense;
  const projExpr = projectLicense && !/^proprietary$/i.test(projectLicense) ? normalizeExpression(projectLicense) : null;
  const projCat = projExpr ? evaluateLicense(projExpr).category : 'proprietary';
  const projIds = projExpr ? licenseIds(parseExpression(projExpr)) : [];
  const push = (level, code, en, ko) => out.push({ level, code, message: { en, ko }, assumed });
  if (projCat === 'proprietary' || projCat === 'unknown') {
    const who = assumed ? 'the project (no license declared, assumed proprietary)' : 'a proprietary project';
    const whoKo = assumed ? '라이선스를 선언하지 않아 독점으로 가정한 프로젝트' : '독점 프로젝트';
    if (depCat === 'network-copyleft') push(assumed ? 'warning' : 'conflict', 'network-copyleft-in-proprietary', `${depLicense} requires offering the source even to network users; it cannot be combined with ${who} without releasing its source.`, `${depLicense} 는 네트워크 사용자에게도 소스 제공을 요구해 ${whoKo} 와 함께 쓰려면 소스를 공개해야 합니다.`);
    else if (depCat === 'strong-copyleft') push(assumed ? 'warning' : 'conflict', 'copyleft-in-proprietary', `${depLicense} is strong copyleft: distributing it inside ${who} requires releasing the combined work under ${depLicense}.`, `${depLicense} 는 강한 카피레프트라 ${whoKo} 에 넣어 배포하면 결합 저작물 전체를 ${depLicense} 로 공개해야 합니다.`);
    else if (depCat === 'weak-copyleft') push('warning', 'weak-copyleft-conditions', `${depLicense} is weak copyleft: keep the component separable (dynamic linking / unmodified files) and publish changes to it.`, `${depLicense} 는 약한 카피레프트입니다. 구성 요소를 분리 가능하게(동적 링크·미수정 파일) 두고 수정 사항은 공개하세요.`);
    return out;
  }
  const projFamilies = projIds.map(familyOf);
  const depFamilies = depIds.map(familyOf);
  if ((depCat === 'strong-copyleft' || depCat === 'network-copyleft') && (projCat === 'permissive' || projCat === 'weak-copyleft')) {
    push('warning', 'copyleft-relicenses-project', `${depLicense} is copyleft: a distributed combination with this ${projExpr} project must be offered under ${depLicense}.`, `${depLicense} 는 카피레프트라 ${projExpr} 프로젝트와 결합해 배포하면 ${depLicense} 조건으로 제공해야 합니다.`);
  }
  if (depIds.includes('GPL-2.0-only') && projFamilies.includes('Apache-2.0')) push('conflict', 'apache-gpl2-incompatible', 'GPL-2.0-only is incompatible with Apache-2.0 (patent and indemnity terms); the two cannot be combined in one work.', 'GPL-2.0-only 는 Apache-2.0 과 호환되지 않아(특허·면책 조항) 한 저작물로 결합할 수 없습니다.');
  if (depFamilies.includes('Apache-2.0') && projIds.includes('GPL-2.0-only')) push('conflict', 'apache-gpl2-incompatible', 'Apache-2.0 code cannot be included in a GPL-2.0-only project.', 'Apache-2.0 코드는 GPL-2.0-only 프로젝트에 넣을 수 없습니다.');
  if (projIds.includes('GPL-2.0-only') && depFamilies.includes('GPL-3.0')) push('conflict', 'gpl2-gpl3-incompatible', 'GPL-3.0 code cannot be combined with a GPL-2.0-only project.', 'GPL-3.0 코드는 GPL-2.0-only 프로젝트와 결합할 수 없습니다.');
  if (projIds.includes('GPL-2.0-only') && depFamilies.includes('AGPL-3.0')) push('conflict', 'gpl2-agpl3-incompatible', 'AGPL-3.0 code cannot be combined with a GPL-2.0-only project.', 'AGPL-3.0 코드는 GPL-2.0-only 프로젝트와 결합할 수 없습니다.');
  if (depCat === 'proprietary') push('conflict', 'proprietary-in-open-source', `${depLicense} is not an open-source license and cannot be redistributed under ${projExpr}.`, `${depLicense} 는 오픈소스 라이선스가 아니어서 ${projExpr} 로 재배포할 수 없습니다.`);
  return out;
}

const LICENSE_FILE_RE = /^(licen[cs]e|copying|unlicense|notice)(\.(md|txt|rst|markdown|mit|apache|bsd))?(-[a-z0-9.-]+)?$/i;

function isLicenseFile(name) {
  return LICENSE_FILE_RE.test(name);
}

module.exports = {
  CATEGORIES, SPDX_CATEGORY: SPDX, EXCEPTIONS, DEFAULT_POLICY,
  normalizeLicenseId, parseExpression, normalizeExpression, expressionToString, licenseIds, categoryOf,
  evaluateLicense, mergePolicy, licenseFromMetadata, detectLicenseText, isLicenseFile,
  identifyLicenseText, licenseObligations, compatibilityHints, OBLIGATION_TEXT,
};
