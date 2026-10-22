'use strict';

// NuGet (*.csproj / *.fsproj / *.vbproj PackageReference, Directory.Packages.props,
// packages.config, packages.lock.json, *.nuspec), C/C++ (conanfile.txt,
// conanfile.py requires, conan.lock v0.4 / v0.5, vcpkg.json), Swift
// (Package.resolved v1-v3, Package.swift), Dart (pubspec.yaml, pubspec.lock).

const { parseJson, lineOf } = require('../util');
const { parseXml, walk, attr, childText } = require('../xml');
const { parseYaml } = require('../yaml');

// ---------------------------------------------------------------- NuGet ---

function parseMsbuild(text, file, ctx = {}) {
  const doc = parseXml(text);
  const deps = [];
  const central = ctx.centralVersions || {};
  const props = {};
  walk(doc, (el) => {
    if (el.local === 'PropertyGroup') for (const c of el.children) props[c.local] = c.text.trim();
  });
  const interp = (s) => (s == null ? s : String(s).replace(/\$\(([^)]+)\)/g, (m, k) => (props[k] != null ? props[k] : m)));
  const centralHere = {};
  walk(doc, (el) => {
    if (el.local === 'PackageVersion') {
      const id = attr(el, 'Include') || attr(el, 'Update');
      if (id) centralHere[id.toLowerCase()] = { version: interp(attr(el, 'Version') || childText(el, 'Version')), line: el.line };
    }
  });
  walk(doc, (el) => {
    if (el.local !== 'PackageReference' && el.local !== 'GlobalPackageReference') return;
    const id = attr(el, 'Include') || attr(el, 'Update');
    if (!id) return;
    let spec = interp(attr(el, 'Version') || childText(el, 'Version') || attr(el, 'VersionOverride'));
    const c = centralHere[id.toLowerCase()] || central[id.toLowerCase()];
    if (!spec && c) spec = c.version;
    const priv = String(attr(el, 'PrivateAssets') || childText(el, 'PrivateAssets') || '').toLowerCase();
    const dev = priv === 'all' || /analyzers|test\.sdk|xunit\.runner|coverlet|stylecop/i.test(id);
    const testy = /^(xunit|nunit|mstest|moq|fluentassertions|nsubstitute|microsoft\.net\.test\.sdk)/i.test(id);
    const pinned = spec && /^\[?[^,[\]()*]+\]?$/.test(spec);
    deps.push({ name: id, spec: spec || null, version: pinned ? spec.replace(/[[\]]/g, '') : null, scope: testy ? 'test' : dev ? 'dev' : 'prod', line: el.line, direct: true });
  });
  const isProps = /\.props$/i.test(file);
  return { ecosystem: 'NuGet', kind: 'manifest', file, deps, centralVersions: isProps ? centralHere : undefined, project: { name: props.PackageId || props.AssemblyName || null, version: props.Version || null, license: props.PackageLicenseExpression || null } };
}

function parsePackagesConfig(text, file) {
  const doc = parseXml(text);
  const deps = [];
  walk(doc, (el) => {
    if (el.local !== 'package') return;
    const id = attr(el, 'id');
    const version = attr(el, 'version');
    if (!id) return;
    deps.push({ name: id, version, spec: version, scope: attr(el, 'developmentDependency') === 'true' ? 'dev' : 'prod', line: el.line, direct: true });
  });
  return { ecosystem: 'NuGet', kind: 'manifest', file, deps };
}

function parseNuspec(text, file) {
  const doc = parseXml(text);
  const deps = [];
  let meta = {};
  walk(doc, (el) => {
    if (el.local === 'metadata') meta = { id: childText(el, 'id'), version: childText(el, 'version'), license: childText(el, 'license') };
    if (el.local !== 'dependency') return;
    const id = attr(el, 'id');
    if (id && !deps.some((d) => d.name === id)) deps.push({ name: id, spec: attr(el, 'version') || null, scope: 'prod', line: el.line, direct: true });
  });
  return { ecosystem: 'NuGet', kind: 'manifest', file, deps, project: { name: meta.id || null, version: meta.version || null, license: meta.license || null } };
}

function parseNugetLock(text, file) {
  const doc = parseJson(text);
  const deps = [];
  const seen = new Map();
  for (const [, block] of Object.entries(doc.dependencies || {})) {
    for (const [name, info] of Object.entries(block || {})) {
      if (!info || info.type === 'Project') continue;
      const key = `${name.toLowerCase()}@${info.resolved}`;
      const existing = seen.get(key);
      const requires = Object.entries(info.dependencies || {}).map(([n, spec]) => ({ name: n, spec }));
      if (existing) { if (info.type === 'Direct') existing.direct = true; continue; }
      const d = { key, name, version: info.resolved, spec: info.requested || undefined, line: lineOf(block, name), direct: info.type === 'Direct', requires };
      seen.set(key, d);
      deps.push(d);
    }
  }
  const byName = new Map(deps.map((d) => [d.name.toLowerCase(), d.key]));
  for (const d of deps) d.edges = d.requires.map((r) => byName.get(r.name.toLowerCase())).filter(Boolean);
  return { ecosystem: 'NuGet', kind: 'lock', file, deps };
}

// ---------------------------------------------------------------- C/C++ ---

// "openssl/3.0.8@user/channel#rrev%ts" -> { name, version }
function parseConanRef(ref) {
  const m = /^([^/\s]+)\/([^@#\s%]+)/.exec(String(ref).trim());
  if (!m) return null;
  return { name: m[1], version: m[2].replace(/^\[|\]$/g, '') };
}

function parseConanfileTxt(text, file) {
  const deps = [];
  let section = null;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n].replace(/#.*$/, '').trim();
    if (!l) continue;
    const s = /^\[(\w+)\]$/.exec(l);
    if (s) { section = s[1]; continue; }
    if (!['requires', 'tool_requires', 'build_requires', 'test_requires'].includes(section)) continue;
    const ref = parseConanRef(l);
    if (!ref) continue;
    const range = /^\[.*\]$/.test(l.split('/')[1] || '') || /[<>~^]/.test(ref.version);
    deps.push({ name: ref.name, spec: ref.version, version: range ? null : ref.version, scope: section === 'requires' ? 'prod' : section === 'test_requires' ? 'test' : 'dev', line: n + 1, direct: true });
  }
  return { ecosystem: 'ConanCenter', kind: 'manifest', file, deps };
}

function parseConanfilePy(text, file) {
  const deps = [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n];
    const re = /(self\.(requires|tool_requires|build_requires|test_requires)\(|^\s*(requires|tool_requires|build_requires)\s*=.*?)["']([\w.+-]+\/[^"'@#\s]+)/g;
    let m;
    while ((m = re.exec(l))) {
      const ref = parseConanRef(m[4]);
      const kind = m[2] || m[3];
      if (ref) deps.push({ name: ref.name, spec: ref.version, version: /[[<>~^]/.test(ref.version) ? null : ref.version, scope: kind === 'requires' ? 'prod' : kind === 'test_requires' ? 'test' : 'dev', line: n + 1, direct: true });
    }
  }
  return { ecosystem: 'ConanCenter', kind: 'manifest', file, deps };
}

function parseConanLock(text, file) {
  const doc = parseJson(text);
  const deps = [];
  if (doc.graph_lock && doc.graph_lock.nodes) {
    const nodes = doc.graph_lock.nodes;
    const keyOf = {};
    for (const [id, node] of Object.entries(nodes)) {
      if (!node.ref) continue;
      const ref = parseConanRef(node.ref);
      if (!ref) continue;
      keyOf[id] = `${ref.name}@${ref.version}`;
      deps.push({ key: keyOf[id], name: ref.name, version: ref.version, line: lineOf(nodes, id), nodeId: id, rawReq: [...(node.requires || []), ...(node.build_requires || [])], build: !!(node.context === 'build') });
    }
    const rootReq = new Set(((nodes['0'] || {}).requires) || []);
    for (const d of deps) { d.edges = d.rawReq.map((r) => keyOf[r]).filter(Boolean); d.direct = rootReq.has(d.nodeId); delete d.rawReq; }
    return { ecosystem: 'ConanCenter', kind: 'lock', file, deps };
  }
  for (const [section, scope] of [['requires', 'prod'], ['build_requires', 'dev'], ['python_requires', 'dev']]) {
    const list = doc[section] || [];
    for (let k = 0; k < list.length; k++) {
      const ref = parseConanRef(list[k]);
      if (ref) deps.push({ key: `${ref.name}@${ref.version}`, name: ref.name, version: ref.version, scope, line: lineOf(list, k) });
    }
  }
  return { ecosystem: 'ConanCenter', kind: 'lock', file, deps };
}

function parseVcpkgJson(text, file) {
  const doc = parseJson(text);
  const deps = [];
  const overrides = {};
  for (const o of doc.overrides || []) if (o && o.name) overrides[o.name] = o.version || o['version-string'] || o['version-semver'] || o['version-date'];
  const list = doc.dependencies || [];
  for (let k = 0; k < list.length; k++) {
    const d = list[k];
    const name = typeof d === 'string' ? d : d && d.name;
    if (!name) continue;
    const min = typeof d === 'object' ? d['version>='] : null;
    const pinned = overrides[name];
    deps.push({ name, spec: pinned ? `=${pinned}` : min ? `>=${min}` : '', version: pinned || null, scope: typeof d === 'object' && d.host ? 'dev' : 'prod', line: lineOf(list, k), direct: true, baseline: doc['builtin-baseline'] || null });
  }
  return { ecosystem: 'vcpkg', kind: 'manifest', file, deps, project: { name: doc.name || null, version: doc.version || doc['version-string'] || null, license: doc.license || null }, baseline: doc['builtin-baseline'] || null };
}

// ---------------------------------------------------------------- Swift ---

function swiftName(url) {
  return String(url || '').toLowerCase().replace(/^(https?:\/\/|git@|ssh:\/\/git@)/, '').replace(/:/, '/').replace(/\.git$/, '').replace(/\/$/, '');
}

function parsePackageResolved(text, file) {
  const doc = parseJson(text);
  const pins = (doc.object && doc.object.pins) || doc.pins || [];
  const deps = [];
  for (let k = 0; k < pins.length; k++) {
    const p = pins[k];
    const url = p.repositoryURL || p.location;
    const state = p.state || {};
    deps.push({ key: swiftName(url), name: swiftName(url), version: state.version || null, revision: state.revision || null, branch: state.branch || null, line: lineOf(pins, k), identity: p.identity || p.package });
  }
  return { ecosystem: 'SwiftURL', kind: 'lock', file, deps };
}

function parsePackageSwift(text, file) {
  const deps = [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const m = /\.package\(\s*(?:name:\s*"[^"]*",\s*)?url:\s*"([^"]+)"\s*,\s*(.*)$/.exec(lines[n]);
    if (!m) continue;
    const rest = m[2];
    let spec = '';
    let v;
    if ((v = /from:\s*"([^"]+)"/.exec(rest))) spec = `^${v[1]}`;
    else if ((v = /exact:\s*"([^"]+)"/.exec(rest)) || (v = /\.exact\("([^"]+)"\)/.exec(rest))) spec = v[1];
    else if ((v = /"([^"]+)"\s*\.\.<\s*"([^"]+)"/.exec(rest))) spec = `>=${v[1]} <${v[2]}`;
    else if ((v = /upToNextMinor\(from:\s*"([^"]+)"\)/.exec(rest))) spec = `~${v[1]}`;
    else if ((v = /upToNextMajor\(from:\s*"([^"]+)"\)/.exec(rest))) spec = `^${v[1]}`;
    else if (/branch:/.test(rest)) spec = 'branch';
    else if (/revision:/.test(rest)) spec = 'revision';
    deps.push({ name: swiftName(m[1]), spec, scope: 'prod', line: n + 1, direct: true });
  }
  return { ecosystem: 'SwiftURL', kind: 'manifest', file, deps };
}

// ----------------------------------------------------------------- Dart ---

function parsePubspecLock(text, file) {
  const doc = parseYaml(text);
  const deps = [];
  const pkgs = doc.packages || {};
  for (const [name, info] of Object.entries(pkgs)) {
    if (!info || info.source === 'sdk' || info.source === 'path') continue;
    const kind = String(info.dependency || 'transitive');
    deps.push({
      key: `${name}@${info.version}`, name, version: info.version ? String(info.version) : null, line: lineOf(pkgs, name),
      direct: /^direct/.test(kind), scope: /dev/.test(kind) ? 'dev' : /^direct/.test(kind) ? 'prod' : undefined, source: info.source,
    });
  }
  return { ecosystem: 'Pub', kind: 'lock', file, deps };
}

function parsePubspecYaml(text, file) {
  const doc = parseYaml(text);
  const deps = [];
  for (const [section, scope] of [['dependencies', 'prod'], ['dev_dependencies', 'dev']]) {
    const block = doc[section] || {};
    for (const [name, v] of Object.entries(block)) {
      if (v && typeof v === 'object' && (v.sdk || v.path)) continue;
      const spec = typeof v === 'string' ? v : v && typeof v === 'object' ? v.version || (v.git ? 'git' : '') : '';
      deps.push({ name, spec: spec == null ? '' : String(spec), scope, line: lineOf(block, name), direct: true });
    }
  }
  return { ecosystem: 'Pub', kind: 'manifest', file, deps, project: { name: doc.name || null, version: doc.version || null } };
}

module.exports = {
  parseMsbuild, parsePackagesConfig, parseNuspec, parseNugetLock,
  parseConanfileTxt, parseConanfilePy, parseConanLock, parseConanRef, parseVcpkgJson,
  parsePackageResolved, parsePackageSwift, swiftName, parsePubspecLock, parsePubspecYaml,
};
