'use strict';

// PyPI ecosystem: requirements*.txt (with -r / -c includes, hashes, markers,
// editable and URL requirements), Pipfile, Pipfile.lock, poetry.lock,
// pyproject.toml (PEP 621 [project] and [tool.poetry]), uv.lock.

const { parseJson, lineOf, basename } = require('../util');
const { parseToml } = require('../toml');
const { licenseFromMetadata } = require('../license');

// "requests[socks]>=2.0,<3 ; python_version>'3'" -> { name, extras, spec, marker }
function parseRequirementString(s) {
  const str = String(s).trim();
  const url = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*@\s*(\S+)/.exec(str);
  if (url) return { name: url[1], extras: url[2] || '', spec: url[3], url: true, marker: '' };
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(\(?\s*[^;]*?\)?)\s*(?:;\s*(.*))?$/.exec(str);
  if (!m) return null;
  return { name: m[1], extras: m[2] || '', spec: m[3].replace(/^\(|\)$/g, '').replace(/\s+/g, ''), marker: m[4] || '' };
}

function scopeFromFileName(file) {
  const b = basename(file).toLowerCase();
  if (/test/.test(b)) return 'test';
  if (/dev|lint|doc|ci|build/.test(b)) return 'dev';
  return 'prod';
}

function parseRequirements(text, file, ctx = {}) {
  const deps = [];
  const includes = [];
  let extraIndex = false;
  let indexUrl = null;
  const scope = scopeFromFileName(file);
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    let raw = lines[n];
    const startLine = n + 1;
    while (/\\\s*$/.test(raw) && n + 1 < lines.length) raw = raw.replace(/\\\s*$/, ' ') + lines[++n];
    let line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    if (/^(-r|--requirement|-c|--constraint)\s*/.test(line)) {
      includes.push({ file: line.replace(/^(-r|--requirement|-c|--constraint)\s*=?\s*/, ''), constraint: /^(-c|--constraint)/.test(line), line: startLine });
      continue;
    }
    if (/^--extra-index-url\b/.test(line)) { extraIndex = true; continue; }
    if (/^(-i|--index-url)\b/.test(line)) { indexUrl = line.split(/[\s=]+/)[1] || null; continue; }
    if (/^-e\s+|^--editable\s+/.test(line)) {
      const target = line.replace(/^(-e|--editable)\s+/, '');
      const egg = /#egg=([A-Za-z0-9._-]+)/.exec(target);
      if (egg) deps.push({ name: egg[1], spec: target, scope, line: startLine, direct: true, editable: true });
      continue;
    }
    if (/^-/.test(line)) continue;
    line = line.replace(/\s--hash[=\s]\S+/g, '').trim();
    if (/^(https?:|git\+|file:|hg\+|svn\+|bzr\+)/.test(line)) {
      const egg = /#egg=([A-Za-z0-9._-]+)/.exec(line);
      if (egg) deps.push({ name: egg[1], spec: line, scope, line: startLine, direct: true });
      continue;
    }
    const req = parseRequirementString(line);
    if (!req) continue;
    const pinned = /^===?[^,*]+$/.test(req.spec);
    deps.push({
      name: req.name, spec: req.spec, version: pinned ? req.spec.replace(/^===?/, '') : null,
      scope, line: startLine, direct: true, marker: req.marker || undefined, extras: req.extras || undefined,
    });
  }
  void ctx;
  return { ecosystem: 'PyPI', kind: 'manifest', file, deps, includes, extraIndex, indexUrl, requirementsTxt: true };
}

function parsePipfileLock(text, file) {
  const lock = parseJson(text);
  const deps = [];
  for (const [section, scope] of [['default', 'prod'], ['develop', 'dev']]) {
    const block = lock[section] || {};
    for (const [name, info] of Object.entries(block)) {
      const version = info && info.version ? String(info.version).replace(/^===?/, '') : null;
      deps.push({ name, version, scope, line: lineOf(block, name), spec: info && info.version, markers: info && info.markers });
    }
  }
  const sources = ((lock._meta || {}).sources || []).map((s) => s.url);
  return { ecosystem: 'PyPI', kind: 'lock', file, deps, extraIndex: sources.length > 1 };
}

function pipfileSpec(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v.version || (v.git ? `git+${v.git}${v.ref ? '#' + v.ref : ''}` : v.path ? `path:${v.path}` : '*');
  return '*';
}

function parsePipfile(text, file) {
  const doc = parseToml(text);
  const deps = [];
  for (const [section, scope] of [['packages', 'prod'], ['dev-packages', 'dev']]) {
    const block = doc[section] || {};
    for (const [name, v] of Object.entries(block)) {
      deps.push({ name, spec: pipfileSpec(v), scope, line: lineOf(block, name), direct: true });
    }
  }
  const sources = Array.isArray(doc.source) ? doc.source : [];
  return { ecosystem: 'PyPI', kind: 'manifest', file, deps, extraIndex: sources.length > 1 };
}

function poetrySpec(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(poetrySpec).join(' || ');
  if (v && typeof v === 'object') return v.version || (v.git ? `git+${v.git}` : v.path ? `path:${v.path}` : v.url || '*');
  return '*';
}

function parsePoetryLock(text, file) {
  const doc = parseToml(text);
  const deps = [];
  const pkgs = Array.isArray(doc.package) ? doc.package : [];
  for (let k = 0; k < pkgs.length; k++) {
    const p = pkgs[k];
    const requires = Object.entries(p.dependencies || {}).map(([name, v]) => ({ name, spec: poetrySpec(v) }));
    let scope;
    if (p.category) scope = p.category === 'dev' ? 'dev' : 'prod';
    else if (Array.isArray(p.groups)) scope = p.groups.includes('main') ? 'prod' : p.groups.some((g) => /test/.test(g)) ? 'test' : 'dev';
    deps.push({ key: `${p.name}@${p.version}`, name: p.name, version: String(p.version), scope, line: lineOf(pkgs, k), requires, optional: p.optional || undefined });
  }
  return { ecosystem: 'PyPI', kind: 'lock', file, deps };
}

function parseUvLock(text, file) {
  const doc = parseToml(text);
  const deps = [];
  const pkgs = Array.isArray(doc.package) ? doc.package : [];
  let rootDirect = null;
  for (let k = 0; k < pkgs.length; k++) {
    const p = pkgs[k];
    const src = p.source || {};
    const requires = (p.dependencies || []).map((d) => ({ name: d.name }));
    if (src.editable === '.' || src.virtual === '.') {
      rootDirect = requires.map((r) => r.name);
      const dev = p['dev-dependencies'] || {};
      for (const list of Object.values(dev)) for (const d of list || []) rootDirect.push(d.name);
      continue;
    }
    deps.push({ key: `${p.name}@${p.version}`, name: p.name, version: String(p.version), line: lineOf(pkgs, k), requires });
  }
  return { ecosystem: 'PyPI', kind: 'lock', file, deps, directFromLock: rootDirect };
}

function parsePyproject(text, file) {
  const doc = parseToml(text);
  const deps = [];
  const project = doc.project || {};
  const poetry = (doc.tool && doc.tool.poetry) || {};
  const list = Array.isArray(project.dependencies) ? project.dependencies : [];
  for (let k = 0; k < list.length; k++) {
    const req = parseRequirementString(list[k]);
    if (req) deps.push({ name: req.name, spec: req.spec, scope: 'prod', line: lineOf(list, k), direct: true, marker: req.marker || undefined });
  }
  const opt = project['optional-dependencies'] || {};
  for (const [group, arr] of Object.entries(opt)) {
    if (!Array.isArray(arr)) continue;
    const scope = /test/i.test(group) ? 'test' : /dev|lint|doc/i.test(group) ? 'dev' : 'optional';
    for (let k = 0; k < arr.length; k++) {
      const req = parseRequirementString(arr[k]);
      if (req) deps.push({ name: req.name, spec: req.spec, scope, line: lineOf(arr, k), direct: true, group });
    }
  }
  const groups = doc['dependency-groups'] || {};
  for (const [group, arr] of Object.entries(groups)) {
    if (!Array.isArray(arr)) continue;
    for (let k = 0; k < arr.length; k++) {
      if (typeof arr[k] !== 'string') continue;
      const req = parseRequirementString(arr[k]);
      if (req) deps.push({ name: req.name, spec: req.spec, scope: /test/i.test(group) ? 'test' : 'dev', line: lineOf(arr, k), direct: true, group });
    }
  }
  const poetrySections = [[poetry.dependencies, 'prod'], [poetry['dev-dependencies'], 'dev']];
  for (const [group, g] of Object.entries(poetry.group || {})) poetrySections.push([g && g.dependencies, /test/i.test(group) ? 'test' : 'dev']);
  for (const [block, scope] of poetrySections) {
    if (!block) continue;
    for (const [name, v] of Object.entries(block)) {
      if (name.toLowerCase() === 'python') continue;
      const optional = v && typeof v === 'object' && v.optional;
      deps.push({ name, spec: poetrySpec(v), scope: optional && scope === 'prod' ? 'optional' : scope, line: lineOf(block, name), direct: true });
    }
  }
  let license = project.license;
  if (license && typeof license === 'object') license = license.text || license.file || null;
  if (!license && poetry.license) license = poetry.license;
  return {
    ecosystem: 'PyPI', kind: 'manifest', file, deps,
    project: { name: project.name || poetry.name || null, version: project.version || poetry.version || null, license: licenseFromMetadata(license) },
    extraIndex: Array.isArray(poetry.source) && poetry.source.length > 0 && poetry.source.some((s) => s.priority !== 'explicit' && s.priority !== 'primary'),
  };
}

module.exports = { parseRequirements, parseRequirementString, parsePipfile, parsePipfileLock, parsePoetryLock, parsePyproject, parseUvLock };
