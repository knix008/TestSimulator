'use strict';

// npm ecosystem: package.json, package-lock.json / npm-shrinkwrap.json
// (lockfileVersion 1, 2, 3), yarn.lock (classic v1 and berry v2+),
// pnpm-lock.yaml (v5, v6, v9).

const { parseJson, lineOf } = require('../util');
const { parseYaml } = require('../yaml');
const { licenseFromMetadata } = require('../license');

const SECTIONS = [
  ['dependencies', 'prod'],
  ['devDependencies', 'dev'],
  ['optionalDependencies', 'optional'],
  ['peerDependencies', 'peer'],
];

function parsePackageJson(text, file) {
  const pkg = parseJson(text);
  const deps = [];
  const seen = new Map();
  for (const [section, scope] of SECTIONS) {
    const block = pkg[section];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block)) {
      if (scope === 'peer' && seen.has(name)) continue;
      const entry = { name, spec: String(spec), scope: scope === 'peer' ? 'optional' : scope, line: lineOf(block, name), direct: true, peer: scope === 'peer' || undefined };
      if (seen.has(name)) {
        // optionalDependencies override dependencies in npm
        if (scope === 'optional') Object.assign(seen.get(name), { scope: 'optional' });
        continue;
      }
      seen.set(name, entry);
      deps.push(entry);
    }
  }
  return {
    ecosystem: 'npm', kind: 'manifest', file,
    project: { name: pkg.name || null, version: pkg.version || null, license: licenseFromMetadata(pkg.license || pkg.licenses), line: lineOf(pkg, 'name') },
    deps,
    private: !!pkg.private,
    publishConfig: pkg.publishConfig || null,
  };
}

function nameFromLockPath(p) {
  const k = p.lastIndexOf('node_modules/');
  return k >= 0 ? p.slice(k + 'node_modules/'.length) : p;
}

function parsePackageLock(text, file) {
  const lock = parseJson(text);
  const deps = [];
  const version = lock.lockfileVersion || 1;
  if (lock.packages && version >= 2) {
    const root = lock.packages[''] || {};
    const directNames = new Set([
      ...Object.keys(root.dependencies || {}), ...Object.keys(root.devDependencies || {}),
      ...Object.keys(root.optionalDependencies || {}), ...Object.keys(root.peerDependencies || {}),
    ]);
    for (const [p, info] of Object.entries(lock.packages)) {
      if (p === '' || !info || info.link) continue;
      if (!p.includes('node_modules/')) continue; // workspace sources
      const name = info.name || nameFromLockPath(p);
      const topLevel = p.split('node_modules/').length === 2 && p.startsWith('node_modules/');
      const requires = [];
      for (const sec of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [n, spec] of Object.entries(info[sec] || {})) requires.push({ name: n, spec, optional: sec !== 'dependencies' });
      }
      deps.push({
        key: p, name, version: info.version, line: lineOf(lock.packages, p),
        scope: info.dev ? 'dev' : info.devOptional ? 'dev' : info.optional ? 'optional' : 'prod',
        direct: topLevel && directNames.has(name),
        license: licenseFromMetadata(info.license),
        resolved: info.resolved || null, integrity: info.integrity || null,
        requires, deprecated: info.deprecated || null,
      });
    }
    // Resolve requires to concrete keys with the node_modules lookup algorithm.
    const keys = new Set(deps.map((d) => d.key));
    for (const d of deps) {
      d.edges = [];
      for (const r of d.requires) {
        let base = d.key;
        for (;;) {
          const candidate = `${base}/node_modules/${r.name}`;
          if (keys.has(candidate)) { d.edges.push(candidate); break; }
          const k = base.lastIndexOf('/node_modules/');
          if (k < 0) { if (keys.has(`node_modules/${r.name}`)) d.edges.push(`node_modules/${r.name}`); break; }
          base = base.slice(0, k);
        }
      }
    }
    return { ecosystem: 'npm', kind: 'lock', file, lockVersion: version, deps, project: { name: lock.name || root.name || null, version: lock.version || root.version || null, license: licenseFromMetadata(root.license) } };
  }
  // v1: nested "dependencies" tree.
  const rootReq = new Set(Object.keys(lock.dependencies || {}));
  function walkV1(block, parentKey, depth) {
    for (const [name, info] of Object.entries(block || {})) {
      if (!info || typeof info !== 'object') continue;
      const key = parentKey ? `${parentKey}/node_modules/${name}` : `node_modules/${name}`;
      const requires = Object.entries(info.requires || {}).map(([n, spec]) => ({ name: n, spec }));
      deps.push({
        key, name, version: info.version, line: lineOf(block, name),
        scope: info.dev ? 'dev' : info.optional ? 'optional' : 'prod',
        direct: depth === 0 ? undefined : false,
        resolved: info.resolved || null, integrity: info.integrity || null, requires,
        bundled: !!info.bundled,
      });
      if (info.dependencies) walkV1(info.dependencies, key, depth + 1);
    }
  }
  walkV1(lock.dependencies, '', 0);
  const keys = new Set(deps.map((d) => d.key));
  for (const d of deps) {
    d.edges = [];
    for (const r of d.requires) {
      let base = d.key;
      for (;;) {
        const candidate = `${base}/node_modules/${r.name}`;
        if (keys.has(candidate)) { d.edges.push(candidate); break; }
        const k = base.lastIndexOf('/node_modules/');
        if (k < 0) { if (keys.has(`node_modules/${r.name}`)) d.edges.push(`node_modules/${r.name}`); break; }
        base = base.slice(0, k);
      }
    }
  }
  void rootReq;
  return { ecosystem: 'npm', kind: 'lock', file, lockVersion: 1, deps, project: { name: lock.name || null, version: lock.version || null } };
}

// "@scope/pkg@^1.0.0" -> ["@scope/pkg", "^1.0.0"]
function splitDescriptor(desc) {
  const d = desc.trim().replace(/^"|"$/g, '');
  const at = d.indexOf('@', 1);
  if (at < 0) return [d, ''];
  return [d.slice(0, at), d.slice(at + 1)];
}

function parseYarnClassic(text, file) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const entries = [];
  let cur = null;
  let inDeps = null;
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();
    if (indent === 0) {
      const header = content.replace(/:$/, '');
      const descriptors = header.split(/,\s*/).map((s) => s.trim().replace(/^"|"$/g, ''));
      cur = { descriptors, line: n + 1, fields: {}, dependencies: {}, optionalDependencies: {} };
      entries.push(cur);
      inDeps = null;
      continue;
    }
    if (!cur) continue;
    if (indent === 2) {
      if (content.endsWith(':')) { inDeps = content.slice(0, -1); continue; }
      inDeps = null;
      const m = /^("?[^"\s]+"?)\s+(.*)$/.exec(content);
      if (m) cur.fields[m[1].replace(/"/g, '')] = m[2].replace(/^"|"$/g, '');
      continue;
    }
    if (indent >= 4 && inDeps) {
      const m = /^("[^"]+"|\S+)\s+(.*)$/.exec(content);
      if (m && cur[inDeps]) cur[inDeps][m[1].replace(/"/g, '')] = m[2].replace(/^"|"$/g, '');
    }
  }
  const deps = [];
  const byDescriptor = new Map();
  for (const e of entries) {
    const [name] = splitDescriptor(e.descriptors[0]);
    const key = `${name}@${e.fields.version}`;
    const requires = [
      ...Object.entries(e.dependencies).map(([n, spec]) => ({ name: n, spec })),
      ...Object.entries(e.optionalDependencies).map(([n, spec]) => ({ name: n, spec, optional: true })),
    ];
    const dep = { key, name, version: e.fields.version, line: e.line, resolved: e.fields.resolved || null, integrity: e.fields.integrity || null, requires, specs: e.descriptors.map((d) => splitDescriptor(d)[1]) };
    deps.push(dep);
    for (const d of e.descriptors) byDescriptor.set(d, key);
  }
  for (const d of deps) {
    d.edges = d.requires.map((r) => byDescriptor.get(`${r.name}@${r.spec}`)).filter(Boolean);
  }
  return { ecosystem: 'npm', kind: 'lock', file, lockVersion: 'yarn-v1', deps };
}

function berryRange(spec) {
  return String(spec || '').replace(/^npm:/, '');
}

function parseYarnBerry(text, file) {
  const doc = parseYaml(text);
  const deps = [];
  const byDescriptor = new Map();
  let workspaceDeps = null;
  for (const [header, info] of Object.entries(doc)) {
    if (header === '__metadata' || !info || typeof info !== 'object') continue;
    const descriptors = header.split(/,\s*/).map((s) => s.trim());
    const [name, range] = splitDescriptor(descriptors[0]);
    const line = lineOf(doc, header);
    if (/^workspace:/.test(range) || /@workspace:/.test(String(info.resolution || ''))) {
      if (range === 'workspace:.' || !workspaceDeps) workspaceDeps = { name, deps: info.dependencies || {}, line };
      for (const d of descriptors) byDescriptor.set(d, null);
      continue;
    }
    const version = String(info.version);
    const key = `${name}@${version}`;
    const requires = Object.entries(info.dependencies || {}).map(([n, spec]) => ({ name: n, spec: String(spec) }));
    for (const d of descriptors) byDescriptor.set(d, key);
    const linkType = info.linkType;
    if (linkType === 'soft') continue;
    deps.push({ key, name, version, line, requires, resolved: info.resolution || null, integrity: info.checksum || null, specs: descriptors.map((d) => berryRange(splitDescriptor(d)[1])) });
  }
  for (const d of deps) {
    d.edges = d.requires.map((r) => {
      const spec = /^(npm|workspace|patch|portal|link|file|git|https?):/.test(r.spec) ? r.spec : `npm:${r.spec}`;
      return byDescriptor.get(`${r.name}@${spec}`) || byDescriptor.get(`${r.name}@${r.spec}`);
    }).filter(Boolean);
  }
  return { ecosystem: 'npm', kind: 'lock', file, lockVersion: 'yarn-berry', deps, directFromLock: workspaceDeps ? Object.keys(workspaceDeps.deps) : null };
}

function parseYarnLock(text, file) {
  if (/^__metadata:/m.test(text)) return parseYarnBerry(text, file);
  return parseYarnClassic(text, file);
}

// pnpm keys: "/lodash/4.17.21", "/@babel/core/7.0.0", "/lodash@4.17.21",
// "lodash@4.17.21", "/foo/1.0.0_bar@2.0.0", "foo@1.0.0(react@18.2.0)".
function parsePnpmKey(key) {
  let k = key.replace(/^\//, '').replace(/\(.*$/, '');
  const at = k.indexOf('@', 1);
  if (at > 0 && !/^[^@]*\/\d/.test(k.slice(0, at).replace(/^@[^/]+\//, ''))) {
    const name = k.slice(0, at);
    const version = k.slice(at + 1).replace(/_.*$/, '');
    if (/^\d/.test(version)) return { name, version };
  }
  // v5 style: name/version
  const parts = k.split('/');
  const version = parts.pop().replace(/_.*$/, '');
  return { name: parts.join('/'), version };
}

function pnpmVersion(v) {
  if (v && typeof v === 'object') return pnpmVersion(v.version);
  return v == null ? null : String(v).replace(/\(.*$/, '').replace(/_.*$/, '');
}

function parsePnpmLock(text, file) {
  const doc = parseYaml(text);
  const lockVersion = String(doc.lockfileVersion || '');
  const importers = doc.importers || { '.': { dependencies: doc.dependencies, devDependencies: doc.devDependencies, optionalDependencies: doc.optionalDependencies, specifiers: doc.specifiers } };
  const direct = new Map();
  for (const imp of Object.values(importers)) {
    if (!imp) continue;
    for (const [sec, scope] of [['dependencies', 'prod'], ['devDependencies', 'dev'], ['optionalDependencies', 'optional']]) {
      for (const [name, v] of Object.entries(imp[sec] || {})) {
        const version = pnpmVersion(v);
        if (!version || /^link:/.test(version)) continue;
        const spec = (v && typeof v === 'object' && v.specifier) || (imp.specifiers && imp.specifiers[name]) || null;
        let id = `${name}@${version}`;
        if (/^\//.test(version) || version.includes('@')) { const p = parsePnpmKey(version); id = `${p.name}@${p.version}`; }
        direct.set(id, { scope, spec, name, version });
      }
    }
  }
  const packages = doc.packages || {};
  const snapshots = doc.snapshots || null;
  const deps = [];
  const keyFor = new Map();
  const source = snapshots ? Object.keys(snapshots) : Object.keys(packages);
  for (const key of source) {
    const info = (snapshots ? snapshots[key] : packages[key]) || {};
    const pkgInfo = snapshots ? packages[key.replace(/\(.*$/, '')] || {} : info;
    const { name, version } = parsePnpmKey(key);
    const versionStr = pkgInfo.version ? String(pkgInfo.version) : version;
    const id = `${name}@${versionStr}`;
    if (keyFor.has(id)) continue;
    keyFor.set(id, id);
    const requires = [];
    for (const sec of ['dependencies', 'optionalDependencies']) {
      for (const [n, v] of Object.entries(info[sec] || {})) requires.push({ name: n, version: pnpmVersion(v) });
    }
    const d = direct.get(id);
    deps.push({
      key: id, name, version: versionStr,
      line: snapshots ? lineOf(packages, key.replace(/\(.*$/, ''), lineOf(snapshots, key)) : lineOf(packages, key),
      scope: pkgInfo.dev === true ? 'dev' : pkgInfo.optional === true ? 'optional' : pkgInfo.dev === false ? 'prod' : (d ? d.scope : undefined),
      direct: !!d, spec: d ? d.spec : undefined, requires,
      resolved: pkgInfo.resolution && pkgInfo.resolution.tarball || null,
      integrity: pkgInfo.resolution && pkgInfo.resolution.integrity || null,
      deprecated: pkgInfo.deprecated || null,
    });
  }
  for (const d of deps) {
    d.edges = d.requires.map((r) => {
      const v = String(r.version || '');
      if (/^\//.test(v) || v.includes('@')) { const p = parsePnpmKey(v); return `${p.name}@${p.version}`; }
      return `${r.name}@${v}`;
    }).filter((k) => keyFor.has(k));
  }
  return { ecosystem: 'npm', kind: 'lock', file, lockVersion: `pnpm-${lockVersion}`, deps };
}

module.exports = { parsePackageJson, parsePackageLock, parseYarnLock, parsePnpmLock, parsePnpmKey, splitDescriptor };
