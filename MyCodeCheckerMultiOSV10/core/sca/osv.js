'use strict';

// OSV advisory database: load bundled records, import user-downloaded OSV
// dumps (folder of *.json, osv "all.zip" archives, or in-memory lists), match
// dependencies against affected ranges, pick the minimal safe upgrade, and an
// explicit-only online lookup through https://api.osv.dev/v1/querybatch.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { normalizeName, baseEcosystem } = require('./util');
const { compare, sortVersions } = require('./versions');
const { osvSeverity } = require('./cvss');

const BUNDLED_DIR = path.join(__dirname, 'advisories');

function createAdvisoryDb() {
  const index = new Map(); // "eco|name" -> [osv]
  const byId = new Map();
  const db = {
    size: 0,
    add(record) {
      if (!record || typeof record !== 'object' || !record.id || !Array.isArray(record.affected)) return false;
      if (record.withdrawn) return false;
      const prev = byId.get(record.id);
      if (prev) {
        if (String(prev.modified || '') >= String(record.modified || '')) return false;
        db.remove(record.id);
      }
      byId.set(record.id, record);
      const keys = new Set();
      for (const aff of record.affected) {
        if (!aff || !aff.package) continue;
        const eco = baseEcosystem(aff.package.ecosystem);
        keys.add(`${eco}|${normalizeName(eco, aff.package.name)}`);
      }
      for (const k of keys) {
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(record);
      }
      db.size = byId.size;
      return true;
    },
    remove(id) {
      const rec = byId.get(id);
      if (!rec) return;
      byId.delete(id);
      for (const [k, list] of index) {
        const next = list.filter((r) => r.id !== id);
        if (next.length) index.set(k, next); else index.delete(k);
      }
      db.size = byId.size;
    },
    addAll(list) {
      let n = 0;
      for (const r of list || []) if (db.add(r)) n++;
      return n;
    },
    forPackage(ecosystem, name) {
      const eco = baseEcosystem(ecosystem);
      return index.get(`${eco}|${normalizeName(eco, name)}`) || [];
    },
    get(id) { return byId.get(id) || null; },
    all() { return [...byId.values()]; },
    ecosystems() {
      const out = {};
      for (const k of index.keys()) { const e = k.split('|')[0]; out[e] = (out[e] || 0) + 1; }
      return out;
    },
  };
  return db;
}

function recordsFromJson(value) {
  if (Array.isArray(value)) return value.flatMap(recordsFromJson);
  if (value && typeof value === 'object') {
    if (Array.isArray(value.vulns)) return value.vulns;
    if (Array.isArray(value.results)) return value.results.flatMap((r) => r.vulns || []);
    if (value.id && value.affected) return [value];
  }
  return [];
}

let bundled = null;
function bundledRecords() {
  if (bundled) return bundled;
  bundled = [];
  let names = [];
  try { names = fs.readdirSync(BUNDLED_DIR).filter((n) => n.endsWith('.json')).sort(); } catch { names = []; }
  for (const n of names) {
    try { bundled.push(...recordsFromJson(JSON.parse(fs.readFileSync(path.join(BUNDLED_DIR, n), 'utf8')))); } catch { /* skip broken file */ }
  }
  return bundled;
}

function defaultDb() {
  const db = createAdvisoryDb();
  db.addAll(bundledRecords());
  return db;
}

// ------------------------------------------------------------- zip ------

function readZipEntries(buf) {
  let eocd = -1;
  for (let k = buf.length - 22; k >= Math.max(0, buf.length - 65557); k--) {
    if (buf.readUInt32LE(k) === 0x06054b50) { eocd = k; break; }
  }
  if (eocd < 0) throw new Error('Not a zip archive');
  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  // ZIP64
  if ((count === 0xffff || cdOffset === 0xffffffff) && eocd >= 20 && buf.readUInt32LE(eocd - 20) === 0x07064b50) {
    const z64 = Number(buf.readBigUInt64LE(eocd - 20 + 8));
    if (buf.readUInt32LE(z64) === 0x06064b50) {
      count = Number(buf.readBigUInt64LE(z64 + 32));
      cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    let compSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = buf.readUInt16LE(e);
      const len = buf.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (compSize === 0xffffffff) { compSize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (localOffset === 0xffffffff) { localOffset = Number(buf.readBigUInt64LE(q)); q += 8; }
      }
      e += 4 + len;
    }
    entries.push({ name, method, compSize, size, localOffset });
    p = extraEnd + commentLen;
  }
  return entries.map((en) => ({
    name: en.name,
    read() {
      const lp = en.localOffset;
      if (buf.readUInt32LE(lp) !== 0x04034b50) throw new Error(`Bad local header for ${en.name}`);
      const start = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
      const data = buf.subarray(start, start + en.compSize);
      if (en.method === 0) return data;
      if (en.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported zip method ${en.method}`);
    },
  }));
}

// importOsvDatabase(source, { db, includeBundled = true })
//   source: folder path (recursive *.json and *.zip), a .zip path, a .json
//   path, an array of OSV objects / JSON strings / paths, or one OSV object.
function importOsvDatabase(source, options = {}) {
  const db = options.db || (options.includeBundled === false ? createAdvisoryDb() : defaultDb());
  const stats = { files: 0, records: 0, added: 0, errors: [] };
  const addText = (text, label) => {
    try {
      const recs = recordsFromJson(JSON.parse(text));
      stats.records += recs.length;
      stats.added += db.addAll(recs);
    } catch (err) { stats.errors.push(`${label}: ${err.message}`); }
  };
  const addZip = (file) => {
    try {
      for (const entry of readZipEntries(fs.readFileSync(file))) {
        if (!entry.name.endsWith('.json')) continue;
        stats.files++;
        addText(entry.read().toString('utf8'), `${file}!${entry.name}`);
      }
    } catch (err) { stats.errors.push(`${file}: ${err.message}`); }
  };
  const addPath = (p) => {
    let st;
    try { st = fs.statSync(p); } catch (err) { stats.errors.push(`${p}: ${err.message}`); return; }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p).sort()) addPath(path.join(p, name));
    } else if (/\.zip$/i.test(p)) addZip(p);
    else if (/\.json$/i.test(p)) { stats.files++; addText(fs.readFileSync(p, 'utf8'), p); }
  };
  const visit = (item) => {
    if (item == null) return;
    if (Array.isArray(item)) { for (const x of item) visit(x); return; }
    if (typeof item === 'object') { const recs = recordsFromJson(item); stats.records += recs.length; stats.added += db.addAll(recs); return; }
    const s = String(item);
    if (/^\s*[[{]/.test(s)) addText(s, 'inline');
    else addPath(s);
  };
  visit(source);
  db.importStats = stats;
  return db;
}

// --------------------------------------------------------- matching -----

function rangeAffects(ecosystem, version, range) {
  if (!range || !Array.isArray(range.events)) return false;
  if (range.type === 'GIT') return false;
  const eco = range.type === 'SEMVER' && ecosystem !== 'Go' ? 'npm' : ecosystem;
  const events = range.events.map((e) => {
    const [kind, v] = Object.entries(e)[0] || [];
    return { kind, v: String(v) };
  }).filter((e) => e.kind);
  const sorted = [...events].sort((a, b) => {
    if (a.v === '0' && b.v !== '0') return -1;
    if (b.v === '0' && a.v !== '0') return 1;
    const c = compare(eco, a.v, b.v);
    if (c) return c;
    const order = { introduced: 0, fixed: 1, last_affected: 2, limit: 3 };
    return order[a.kind] - order[b.kind];
  });
  let affected = false;
  for (const e of sorted) {
    if (e.kind === 'introduced') {
      if (e.v === '0' || compare(eco, version, e.v) >= 0) affected = true;
    } else if (e.kind === 'fixed') {
      if (compare(eco, version, e.v) >= 0) affected = false;
    } else if (e.kind === 'last_affected') {
      if (compare(eco, version, e.v) > 0) affected = false;
    } else if (e.kind === 'limit') {
      if (compare(eco, version, e.v) >= 0) return affected && false;
    }
  }
  return affected;
}

function affectedEntries(osv, ecosystem, name) {
  const eco = baseEcosystem(ecosystem);
  const n = normalizeName(eco, name);
  return (osv.affected || []).filter((a) => a.package && baseEcosystem(a.package.ecosystem) === eco && normalizeName(eco, a.package.name) === n);
}

function isAffected(osv, ecosystem, name, version) {
  if (!version) return false;
  for (const aff of affectedEntries(osv, ecosystem, name)) {
    const v = String(version);
    if (Array.isArray(aff.versions) && aff.versions.some((x) => String(x) === v || compare(ecosystem, x, v) === 0)) return true;
    for (const r of aff.ranges || []) if (rangeAffects(ecosystem, v, r)) return true;
  }
  return false;
}

function fixedVersions(osv, ecosystem, name) {
  const out = [];
  for (const aff of affectedEntries(osv, ecosystem, name)) {
    for (const r of aff.ranges || []) for (const e of r.events || []) if (e.fixed) out.push(String(e.fixed));
  }
  return sortVersions(ecosystem, [...new Set(out)]);
}

// Fixed version relevant to the installed one: the first fix above it.
function fixFor(osv, ecosystem, name, version) {
  return fixedVersions(osv, ecosystem, name).find((f) => compare(ecosystem, f, version) > 0) || null;
}

// Minimal version >= current that no known advisory of the package affects.
function suggestUpgrade(advisories, ecosystem, name, version) {
  const candidates = new Set();
  for (const osv of advisories) for (const f of fixedVersions(osv, ecosystem, name)) if (compare(ecosystem, f, version) > 0) candidates.add(f);
  for (const c of sortVersions(ecosystem, [...candidates])) {
    if (!advisories.some((osv) => isAffected(osv, ecosystem, name, c))) return c;
  }
  return null;
}

function idsOf(osv) {
  const all = [osv.id, ...(osv.aliases || [])];
  return {
    cve: all.filter((x) => /^CVE-/.test(x)),
    ghsa: all.filter((x) => /^GHSA-/.test(x)),
    other: all.filter((x) => !/^(CVE|GHSA)-/.test(x)),
  };
}

function cwesOf(osv) {
  const ds = osv.database_specific || {};
  return [...new Set([...(ds.cwe_ids || []), ...(ds.cwes || []).map((c) => (typeof c === 'string' ? c : c.cweId))].filter(Boolean))];
}

function matchDependencies(dependencies, db) {
  const out = [];
  for (const dep of dependencies) {
    const version = dep.matchVersion;
    if (!version) continue;
    const advisories = db.forPackage(dep.ecosystem, dep.name);
    if (!advisories.length) continue;
    const hits = advisories.filter((osv) => isAffected(osv, dep.ecosystem, dep.name, version));
    if (!hits.length) continue;
    const upgrade = suggestUpgrade(advisories, dep.ecosystem, dep.name, version);
    for (const osv of hits) {
      const ids = idsOf(osv);
      const sev = osvSeverity(osv);
      out.push({
        id: osv.id,
        aliases: osv.aliases || [],
        cve: ids.cve, ghsa: ids.ghsa,
        summary: osv.summary || (osv.details || '').split('\n')[0].slice(0, 200),
        details: osv.details || '',
        severity: sev.severity, score: sev.score, vector: sev.vector, cvssVersion: sev.version, approximateScore: sev.approximate,
        cwes: cwesOf(osv),
        fixedVersions: fixedVersions(osv, dep.ecosystem, dep.name),
        fixedIn: fixFor(osv, dep.ecosystem, dep.name, version),
        suggestedUpgrade: upgrade,
        dependency: dep.id, purl: dep.purl, ecosystem: dep.ecosystem, package: dep.name, version,
        versionResolved: !!dep.version,
        references: (osv.references || []).map((r) => r.url).filter(Boolean),
        published: osv.published || null, modified: osv.modified || null,
      });
    }
  }
  return out;
}

// ----------------------------------------------------------- online -----
// queryOsv(packages, { timeoutMs, fetch, details, endpoint }) -> Promise<{ ok, vulns, results, error }>
// packages: [{ ecosystem, name, version } | { purl }] or dependency nodes.
// Never called by scanDependencies/analyze; callers opt in explicitly.

async function queryOsv(packages, options = {}) {
  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { ok: false, vulns: [], results: [], error: 'fetch is not available in this runtime' };
  const endpoint = options.endpoint || 'https://api.osv.dev';
  const timeoutMs = options.timeoutMs || 15000;
  const queries = [];
  for (const p of packages || []) {
    if (!p) continue;
    const eco = p.ecosystem;
    const version = p.version || p.matchVersion;
    if (p.purl && !version && /@/.test(p.purl)) queries.push({ package: { purl: p.purl } });
    else if (p.name && eco && version && eco !== 'vcpkg') queries.push({ package: { name: p.name, ecosystem: eco }, version: String(version) });
  }
  if (!queries.length) return { ok: true, vulns: [], results: [] };
  const withTimeout = async (url, init) => {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  };
  try {
    const results = [];
    for (let k = 0; k < queries.length; k += 1000) {
      const chunk = queries.slice(k, k + 1000);
      const body = await withTimeout(`${endpoint}/v1/querybatch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries: chunk }) });
      (body.results || []).forEach((r, n) => results.push({ query: chunk[n], ids: (r.vulns || []).map((v) => v.id) }));
    }
    const ids = [...new Set(results.flatMap((r) => r.ids))];
    const vulns = [];
    if (options.details !== false) {
      for (const id of ids.slice(0, options.maxDetails || 500)) {
        try { vulns.push(await withTimeout(`${endpoint}/v1/vulns/${encodeURIComponent(id)}`, { method: 'GET' })); } catch { /* keep the id-only result */ }
      }
    }
    return { ok: true, vulns, results, ids };
  } catch (err) {
    return { ok: false, vulns: [], results: [], error: err && err.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : String(err && err.message || err) };
  }
}

module.exports = {
  createAdvisoryDb, defaultDb, bundledRecords, importOsvDatabase, readZipEntries,
  rangeAffects, isAffected, fixedVersions, fixFor, suggestUpgrade, matchDependencies, queryOsv, recordsFromJson,
};
