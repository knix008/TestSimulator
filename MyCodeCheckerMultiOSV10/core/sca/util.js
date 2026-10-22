'use strict';

// Shared helpers for the SCA engine: a line-aware JSON parser, purl build /
// parse, package-name normalisation per ecosystem and small text helpers.
//
// Every structured parser in this folder (JSON, TOML, YAML, XML) records the
// 1-based source line of each object key in a non-enumerable `LINES` map so
// findings can point at the exact manifest line.

const LINES = Symbol.for('mcc.sca.lines');

function setLine(obj, key, line) {
  if (!obj || typeof obj !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(obj, LINES)) {
    Object.defineProperty(obj, LINES, { value: Object.create(null), enumerable: false });
  }
  obj[LINES][key] = line;
}

function lineOf(obj, key, fallback = 1) {
  if (obj && obj[LINES] && obj[LINES][key] != null) return obj[LINES][key];
  return fallback;
}

// ---------------------------------------------------------------- JSON -----

function parseJson(text) {
  let i = 0;
  let line = 1;
  const s = String(text).replace(/^﻿/, '');
  const err = (msg) => {
    const e = new Error(`JSON parse error at line ${line}: ${msg}`);
    e.line = line;
    return e;
  };
  function ws() {
    for (;;) {
      const c = s[i];
      if (c === '\n') { line++; i++; } else if (c === ' ' || c === '\t' || c === '\r') i++;
      else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
      else if (c === '/' && s[i + 1] === '*') {
        i += 2;
        while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') line++; i++; }
        i += 2;
      } else break;
    }
  }
  function str() {
    i++;
    let out = '';
    for (;;) {
      if (i >= s.length) throw err('unterminated string');
      const c = s[i++];
      if (c === '"') return out;
      if (c === '\\') {
        const e = s[i++];
        if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4; }
        else out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })[e] || e;
      } else {
        if (c === '\n') line++;
        out += c;
      }
    }
  }
  function value() {
    ws();
    const c = s[i];
    if (c === '{') {
      i++;
      const obj = {};
      ws();
      if (s[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        if (s[i] !== '"') throw err('expected key');
        const keyLine = line;
        const key = str();
        ws();
        if (s[i] !== ':') throw err('expected :');
        i++;
        obj[key] = value();
        setLine(obj, key, keyLine);
        ws();
        if (s[i] === ',') { i++; ws(); if (s[i] === '}') { i++; return obj; } continue; }
        if (s[i] === '}') { i++; return obj; }
        throw err('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      ws();
      if (s[i] === ']') { i++; return arr; }
      for (;;) {
        const itemLine = line;
        ws();
        const startLine = line;
        arr.push(value());
        setLine(arr, arr.length - 1, startLine || itemLine);
        ws();
        if (s[i] === ',') { i++; ws(); if (s[i] === ']') { i++; return arr; } continue; }
        if (s[i] === ']') { i++; return arr; }
        throw err('expected , or ]');
      }
    }
    if (c === '"') return str();
    const m = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i, i + 64));
    if (!m) throw err(`unexpected ${JSON.stringify(c)}`);
    i += m[0].length;
    if (m[0] === 'true') return true;
    if (m[0] === 'false') return false;
    if (m[0] === 'null') return null;
    return Number(m[0]);
  }
  const v = value();
  ws();
  return v;
}

function tryJson(text) {
  try { return parseJson(text); } catch { return null; }
}

// ---------------------------------------------------------------- purl -----

const PURL_TYPE = {
  npm: 'npm', PyPI: 'pypi', Maven: 'maven', Go: 'golang', 'crates.io': 'cargo',
  RubyGems: 'gem', Packagist: 'composer', NuGet: 'nuget', ConanCenter: 'conan',
  vcpkg: 'generic', SwiftURL: 'swift', Pub: 'pub', Hex: 'hex', GitHubActions: 'github',
};
const ECO_FROM_PURL = {
  npm: 'npm', pypi: 'PyPI', maven: 'Maven', golang: 'Go', cargo: 'crates.io', gem: 'RubyGems',
  composer: 'Packagist', nuget: 'NuGet', conan: 'ConanCenter', swift: 'SwiftURL', pub: 'Pub', hex: 'Hex',
};

function enc(s) {
  return encodeURIComponent(s).replace(/%3A/gi, ':');
}

function splitName(ecosystem, name) {
  if (ecosystem === 'npm' && name.startsWith('@') && name.includes('/')) {
    const k = name.indexOf('/');
    return [name.slice(0, k), name.slice(k + 1)];
  }
  if (ecosystem === 'Maven') {
    const k = name.indexOf(':');
    return k > 0 ? [name.slice(0, k), name.slice(k + 1)] : ['', name];
  }
  if (ecosystem === 'Packagist' || ecosystem === 'Go' || ecosystem === 'SwiftURL') {
    const k = name.lastIndexOf('/');
    return k > 0 ? [name.slice(0, k), name.slice(k + 1)] : ['', name];
  }
  if (ecosystem === 'vcpkg') return ['vcpkg', name];
  return ['', name];
}

function toPurl(ecosystem, name, version) {
  const type = PURL_TYPE[ecosystem] || 'generic';
  const [ns, n] = splitName(ecosystem, name);
  let nsPart = '';
  if (ns) nsPart = ns.split('/').map(enc).join('/') + '/';
  let base = `pkg:${type}/${nsPart}${enc(n)}`;
  if (version) base += '@' + enc(String(version));
  return base;
}

function parsePurl(purl) {
  const m = /^pkg:([a-zA-Z.+-]+)\/(.+)$/.exec(String(purl || '').trim());
  if (!m) return null;
  let rest = m[2];
  let subpath = '';
  let qualifiers = {};
  const hash = rest.indexOf('#');
  if (hash >= 0) { subpath = rest.slice(hash + 1); rest = rest.slice(0, hash); }
  const q = rest.indexOf('?');
  if (q >= 0) {
    for (const pair of rest.slice(q + 1).split('&')) {
      const [k, v] = pair.split('=');
      if (k) qualifiers[k.toLowerCase()] = decodeURIComponent(v || '');
    }
    rest = rest.slice(0, q);
  }
  let version = null;
  const at = rest.lastIndexOf('@');
  if (at > 0) { version = decodeURIComponent(rest.slice(at + 1)); rest = rest.slice(0, at); }
  const parts = rest.split('/').map(decodeURIComponent);
  const name = parts.pop();
  const namespace = parts.join('/');
  const type = m[1].toLowerCase();
  const ecosystem = ECO_FROM_PURL[type] || (type === 'generic' && namespace === 'vcpkg' ? 'vcpkg' : type);
  let full = name;
  if (namespace) {
    if (ecosystem === 'Maven') full = `${namespace}:${name}`;
    else if (ecosystem === 'vcpkg') full = name;
    else full = `${namespace}/${name}`;
  }
  return { type, namespace, name, version, qualifiers, subpath, ecosystem, fullName: full };
}

// ------------------------------------------------------- name normalising --

function normalizeName(ecosystem, name) {
  const n = String(name || '').trim();
  switch (ecosystem) {
    case 'PyPI': return n.toLowerCase().replace(/[-_.]+/g, '-');
    case 'NuGet': case 'Packagist': case 'ConanCenter': case 'vcpkg': return n.toLowerCase();
    case 'crates.io': return n.replace(/_/g, '-');
    case 'SwiftURL': return n.toLowerCase().replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    default: return n;
  }
}

// OSV ecosystem names can carry suffixes ("Debian:11", "Ubuntu:22.04:LTS").
function baseEcosystem(eco) {
  const e = String(eco || '').split(':')[0];
  const lower = e.toLowerCase();
  const known = {
    npm: 'npm', pypi: 'PyPI', maven: 'Maven', go: 'Go', 'crates.io': 'crates.io', cargo: 'crates.io',
    rubygems: 'RubyGems', packagist: 'Packagist', nuget: 'NuGet', conancenter: 'ConanCenter', conan: 'ConanCenter',
    swifturl: 'SwiftURL', pub: 'Pub', hex: 'Hex', vcpkg: 'vcpkg', githubactions: 'GitHubActions',
  };
  return known[lower] || e;
}

// --------------------------------------------------------------- misc -----

function lineAt(text, index) {
  let n = 1;
  for (let k = 0; k < index && k < text.length; k++) if (text.charCodeAt(k) === 10) n++;
  return n;
}

function lineIndex(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) starts.push(k + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

function basename(p) {
  return String(p).split(/[/\\]/).pop();
}

function dirname(p) {
  const parts = String(p).replace(/\\/g, '/').split('/');
  parts.pop();
  return parts.join('/');
}

function joinPath(...parts) {
  const out = [];
  for (const part of parts.join('/').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}

function t(en, ko) {
  return { en, ko };
}

function uuidFrom(seed) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha1').update(String(seed)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

module.exports = {
  LINES, setLine, lineOf, parseJson, tryJson,
  toPurl, parsePurl, PURL_TYPE, normalizeName, baseEcosystem,
  lineAt, lineIndex, basename, dirname, joinPath, t, uuidFrom,
};
