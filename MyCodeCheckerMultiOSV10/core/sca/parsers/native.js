'use strict';

// Go (go.mod, go.sum), Rust (Cargo.toml, Cargo.lock), Ruby (Gemfile,
// Gemfile.lock), PHP (composer.json, composer.lock).

const { parseJson, lineOf } = require('../util');
const { parseToml } = require('../toml');
const { licenseFromMetadata } = require('../license');
const { compare } = require('../versions');

// ------------------------------------------------------------------ Go ----

function parseGoMod(text, file) {
  const deps = [];
  const replaces = [];
  let moduleName = null;
  let goVersion = null;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let block = null;
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const indirect = /\/\/\s*indirect\b/.test(raw);
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (block) {
      if (line === ')') { block = null; continue; }
      handle(block, line, n + 1, indirect);
      continue;
    }
    const m = /^(module|go|require|replace|exclude|retract|toolchain)\s*(\(?)\s*(.*)$/.exec(line);
    if (!m) continue;
    if (m[2] === '(') { block = m[1]; continue; }
    handle(m[1], m[3], n + 1, indirect);
  }
  function handle(kind, rest, lineNo, indirect) {
    const parts = rest.trim().split(/\s+/);
    if (kind === 'module') moduleName = parts[0].replace(/"/g, '');
    else if (kind === 'go') goVersion = parts[0];
    else if (kind === 'require' && parts.length >= 2) deps.push({ name: parts[0].replace(/"/g, ''), version: parts[1], spec: parts[1], scope: 'prod', line: lineNo, direct: !indirect });
    else if (kind === 'replace') {
      const arrow = rest.split('=>').map((s) => s.trim().split(/\s+/));
      if (arrow.length === 2) replaces.push({ old: arrow[0][0], oldVersion: arrow[0][1] || null, new: arrow[1][0], newVersion: arrow[1][1] || null, line: lineNo });
    }
  }
  for (const r of replaces) {
    for (const d of deps) {
      if (d.name !== r.old || (r.oldVersion && r.oldVersion !== d.version)) continue;
      if (!r.newVersion) { d.replacedBy = r.new; d.localReplace = true; continue; }
      d.replacedFrom = `${d.name}@${d.version}`;
      d.name = r.new;
      d.version = r.newVersion;
    }
  }
  return { ecosystem: 'Go', kind: 'manifest', file, deps: deps.filter((d) => !d.localReplace), project: { name: moduleName, version: null, goVersion } };
}

function parseGoSum(text, file) {
  const best = new Map();
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const m = /^(\S+)\s+(\S+?)(\/go\.mod)?\s+h1:/.exec(lines[n].trim());
    if (!m || m[3]) continue;
    const prev = best.get(m[1]);
    if (!prev || compare('Go', m[2], prev.version) > 0) best.set(m[1], { name: m[1], version: m[2], line: n + 1 });
  }
  return { ecosystem: 'Go', kind: 'lock', file, deps: [...best.values()].map((d) => ({ ...d, key: `${d.name}@${d.version}` })), weakLock: true };
}

// ---------------------------------------------------------------- Rust ----

function cargoSpec(v) {
  if (typeof v === 'string') return { spec: v };
  if (v && typeof v === 'object') {
    if (v.workspace === true) return { spec: null, workspace: true, optional: v.optional, pkg: v.package };
    return { spec: v.version || (v.git ? `git+${v.git}${v.rev ? '#' + v.rev : ''}` : v.path ? `path:${v.path}` : '*'), optional: v.optional, pkg: v.package, path: v.path };
  }
  return { spec: '*' };
}

function parseCargoToml(text, file) {
  const doc = parseToml(text);
  const deps = [];
  const wsDeps = (doc.workspace && doc.workspace.dependencies) || {};
  const sections = [[doc.dependencies, 'prod'], [doc['dev-dependencies'], 'dev'], [doc['build-dependencies'], 'dev']];
  for (const t of Object.values(doc.target || {})) {
    if (!t || typeof t !== 'object') continue;
    sections.push([t.dependencies, 'prod'], [t['dev-dependencies'], 'dev'], [t['build-dependencies'], 'dev']);
  }
  if (!doc.package && doc.workspace) sections.push([wsDeps, 'prod']);
  for (const [block, scope] of sections) {
    if (!block) continue;
    for (const [alias, v] of Object.entries(block)) {
      const s = cargoSpec(v);
      const name = s.pkg || alias;
      let spec = s.spec;
      if (s.workspace) spec = cargoSpec(wsDeps[name]).spec;
      if (s.path && !(v && v.version)) continue; // local path crate
      deps.push({ name, spec, scope: s.optional && scope === 'prod' ? 'optional' : scope, line: lineOf(block, alias), direct: true });
    }
  }
  const pkg = doc.package || {};
  const lic = typeof pkg.license === 'object' ? null : pkg.license;
  return { ecosystem: 'crates.io', kind: 'manifest', file, deps, project: { name: pkg.name || null, version: typeof pkg.version === 'string' ? pkg.version : null, license: lic || null } };
}

function parseCargoLock(text, file) {
  const doc = parseToml(text);
  const pkgs = Array.isArray(doc.package) ? doc.package : [];
  const deps = [];
  const roots = [];
  const byName = new Map();
  for (let k = 0; k < pkgs.length; k++) {
    const p = pkgs[k];
    const entry = { key: `${p.name}@${p.version}`, name: p.name, version: String(p.version), line: lineOf(pkgs, k), source: p.source || null, checksum: p.checksum || null, rawDeps: p.dependencies || [] };
    if (!p.source) { roots.push(entry); continue; }
    deps.push(entry);
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(entry);
  }
  const resolve = (s) => {
    const [n, v] = String(s).split(' ');
    const list = byName.get(n) || [];
    if (!list.length) return null;
    if (v) return (list.find((e) => e.version === v) || list[0]).key;
    return list[0].key;
  };
  for (const d of deps) d.edges = d.rawDeps.map(resolve).filter(Boolean);
  const direct = new Set();
  for (const r of roots) for (const s of r.rawDeps) { const k = resolve(s); if (k) direct.add(k); }
  for (const d of deps) { d.direct = roots.length ? direct.has(d.key) : undefined; delete d.rawDeps; }
  return { ecosystem: 'crates.io', kind: 'lock', file, deps, project: roots[0] ? { name: roots[0].name, version: roots[0].version } : null };
}

// ---------------------------------------------------------------- Ruby ----

function stripPlatform(v) {
  // "1.13.3-x86_64-linux" -> "1.13.3", "1.0.0-java" -> "1.0.0"
  return String(v).replace(/-(x86|x64|universal|java|arm|aarch64|mingw|mswin|darwin|linux|i386|i686|x86_64)[\w-]*$/, '');
}

function parseGemfileLock(text, file) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const deps = [];
  const directNames = new Map();
  let section = null;
  let inSpecs = false;
  let cur = null;
  let remote = null;
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    if (!raw.trim()) { inSpecs = false; continue; }
    if (/^[A-Z]/.test(raw)) { section = raw.trim(); inSpecs = false; cur = null; continue; }
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();
    if (section === 'GEM' || section === 'GIT' || section === 'PATH' || section === 'PLUGIN SOURCE') {
      if (indent === 2 && content.startsWith('remote:')) { remote = content.slice(7).trim(); continue; }
      if (indent === 2 && content === 'specs:') { inSpecs = true; continue; }
      if (!inSpecs) continue;
      const m = /^([^\s(]+)(?:\s+\(([^)]+)\))?/.exec(content);
      if (!m) continue;
      if (indent === 4) {
        cur = { key: `${m[1]}@${stripPlatform(m[2] || '')}`, name: m[1], version: stripPlatform(m[2] || ''), line: n + 1, requires: [], source: section, remote };
        if (!deps.some((d) => d.key === cur.key)) deps.push(cur);
      } else if (indent === 6 && cur) cur.requires.push({ name: m[1], spec: m[2] || '' });
    } else if (section === 'DEPENDENCIES' && indent === 2) {
      const m = /^([^\s(!]+)!?(?:\s+\(([^)]+)\))?/.exec(content);
      if (m) directNames.set(m[1], { spec: m[2] || '', line: n + 1 });
    }
  }
  const byName = new Map(deps.map((d) => [d.name, d.key]));
  for (const d of deps) {
    d.edges = d.requires.map((r) => byName.get(r.name)).filter(Boolean);
    d.direct = directNames.has(d.name);
    if (d.direct) d.spec = directNames.get(d.name).spec || undefined;
  }
  return { ecosystem: 'RubyGems', kind: 'lock', file, deps, directFromLock: [...directNames.keys()] };
}

function parseGemfile(text, file) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const deps = [];
  const groupStack = [];
  let extraSources = 0;
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n].replace(/#.*$/, '').trim();
    if (!l) continue;
    const g = /^group\s+(.+?)\s+do\b/.exec(l);
    if (g) { groupStack.push(g[1]); continue; }
    if (/^(source|platforms|install_if|path|git)\b.*\bdo\b/.test(l)) { groupStack.push(''); if (/^source/.test(l)) extraSources++; continue; }
    if (/^source\b/.test(l)) { extraSources++; continue; }
    if (/^end\b/.test(l)) { groupStack.pop(); continue; }
    const m = /^gem\s+["']([^"']+)["']((?:\s*,\s*["'][^"']+["'])*)(.*)$/.exec(l);
    if (!m) continue;
    const specs = (m[2].match(/["']([^"']+)["']/g) || []).map((s) => s.slice(1, -1));
    const inline = /group(?:s)?:\s*(\[[^\]]*\]|:\w+)/.exec(m[3]);
    const groups = [...groupStack, inline ? inline[1] : ''].join(' ');
    const scope = /:test\b/.test(groups) && !/:development\b/.test(groups) ? 'test' : /:(development|test)\b/.test(groups) ? 'dev' : 'prod';
    deps.push({ name: m[1], spec: specs.join(', ') || '', scope, line: n + 1, direct: true });
  }
  return { ecosystem: 'RubyGems', kind: 'manifest', file, deps, extraIndex: extraSources > 1 };
}

// ----------------------------------------------------------------- PHP ----

function isPlatformPackage(name) {
  return name === 'php' || /^(ext|lib|composer)-/.test(name) || name === 'composer-plugin-api' || name === 'composer-runtime-api' || !name.includes('/');
}

function parseComposerJson(text, file) {
  const doc = parseJson(text);
  const deps = [];
  for (const [section, scope] of [['require', 'prod'], ['require-dev', 'dev']]) {
    const block = doc[section] || {};
    for (const [name, spec] of Object.entries(block)) {
      if (isPlatformPackage(name)) continue;
      deps.push({ name: name.toLowerCase(), spec: String(spec), scope, line: lineOf(block, name), direct: true });
    }
  }
  const repos = Array.isArray(doc.repositories) ? doc.repositories : Object.values(doc.repositories || {});
  return {
    ecosystem: 'Packagist', kind: 'manifest', file, deps,
    project: { name: doc.name || null, version: doc.version || null, license: licenseFromMetadata(doc.license) },
    extraIndex: repos.some((r) => r && r.type === 'composer' && r.canonical === false),
  };
}

function parseComposerLock(text, file) {
  const doc = parseJson(text);
  const deps = [];
  for (const [section, scope] of [['packages', 'prod'], ['packages-dev', 'dev']]) {
    const list = doc[section] || [];
    for (let k = 0; k < list.length; k++) {
      const p = list[k];
      if (!p || !p.name) continue;
      const requires = Object.entries(p.require || {}).filter(([n]) => !isPlatformPackage(n)).map(([n, spec]) => ({ name: n.toLowerCase(), spec }));
      deps.push({
        key: p.name.toLowerCase(), name: p.name.toLowerCase(), version: String(p.version).replace(/^v(?=\d)/, ''), scope, line: lineOf(list, k),
        license: licenseFromMetadata(p.license), requires, abandoned: p.abandoned || undefined,
        resolved: p.dist && p.dist.url || null,
      });
    }
  }
  const keys = new Set(deps.map((d) => d.key));
  for (const d of deps) d.edges = d.requires.map((r) => r.name).filter((n) => keys.has(n));
  return { ecosystem: 'Packagist', kind: 'lock', file, deps };
}

module.exports = {
  parseGoMod, parseGoSum, parseCargoToml, parseCargoLock, parseGemfileLock, parseGemfile,
  parseComposerJson, parseComposerLock, stripPlatform,
};
