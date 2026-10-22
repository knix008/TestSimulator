'use strict';

// Maven ecosystem: pom.xml (properties, ${...} interpolation,
// dependencyManagement, parent POM resolution when the parent is among the
// scanned files, BOM-less), build.gradle / build.gradle.kts (string and map
// notations, version catalogs-lite via variables and ext {}), gradle.lockfile.

const { parseXml, child, children, childText } = require('../xml');
const { joinPath, dirname } = require('../util');

const SCOPE_MAP = { compile: 'prod', runtime: 'prod', provided: 'prod', system: 'prod', test: 'test', import: 'prod' };

function interpolate(value, props, depth = 0) {
  if (value == null) return value;
  return String(value).replace(/\$\{([^}]+)\}/g, (m, key) => {
    if (depth > 8) return m;
    const v = props[key];
    return v == null ? m : interpolate(v, props, depth + 1);
  });
}

function readPom(text) {
  const doc = parseXml(text);
  const project = child(doc, 'project');
  if (!project) return null;
  const parentEl = child(project, 'parent');
  const parent = parentEl ? {
    groupId: childText(parentEl, 'groupId'), artifactId: childText(parentEl, 'artifactId'),
    version: childText(parentEl, 'version'), relativePath: childText(parentEl, 'relativePath') || '../pom.xml',
  } : null;
  const props = {};
  const propsEl = child(project, 'properties');
  if (propsEl) for (const p of propsEl.children) props[p.local] = p.text.trim();
  const groupId = childText(project, 'groupId') || (parent && parent.groupId) || '';
  const artifactId = childText(project, 'artifactId');
  const version = childText(project, 'version') || (parent && parent.version) || '';
  const readDeps = (container) => children(child(container, 'dependencies'), 'dependency').map((d) => ({
    groupId: childText(d, 'groupId'), artifactId: childText(d, 'artifactId'), version: childText(d, 'version'),
    scope: childText(d, 'scope'), optional: childText(d, 'optional') === 'true', type: childText(d, 'type'),
    classifier: childText(d, 'classifier'), line: d.line,
  }));
  const deps = readDeps(project);
  const mgmt = readDeps(child(project, 'dependencyManagement'));
  const licenses = children(child(project, 'licenses'), 'license').map((l) => childText(l, 'name') || childText(l, 'url')).filter(Boolean);
  // Profiles that are active by default also contribute dependencies.
  for (const prof of children(child(project, 'profiles'), 'profile')) {
    const act = child(child(prof, 'activation'), 'activeByDefault');
    if (act && act.text.trim() === 'true') deps.push(...readDeps(prof));
  }
  return { groupId, artifactId, version, parent, props, deps, mgmt, licenses, line: project.line, name: childText(project, 'name') };
}

function parsePom(text, file, ctx = {}) {
  const pom = readPom(text);
  if (!pom) return { ecosystem: 'Maven', kind: 'manifest', file, deps: [] };
  // Parent chain (best effort): only parents present in the scanned files.
  const chain = [];
  let cur = pom;
  let curFile = file;
  const seen = new Set([file]);
  while (cur.parent && ctx.readFile) {
    const parentPath = joinPath(dirname(curFile), cur.parent.relativePath.endsWith('.xml') ? cur.parent.relativePath : `${cur.parent.relativePath}/pom.xml`);
    if (seen.has(parentPath)) break;
    seen.add(parentPath);
    const t = ctx.readFile(parentPath);
    if (!t) break;
    const parsed = readPom(t);
    if (!parsed) break;
    if (cur.parent.artifactId && parsed.artifactId && parsed.artifactId !== cur.parent.artifactId) break;
    chain.push(parsed);
    cur = parsed;
    curFile = parentPath;
  }
  const props = {};
  for (const p of [...chain].reverse()) Object.assign(props, p.props);
  Object.assign(props, pom.props);
  const builtins = {
    'project.groupId': pom.groupId, 'project.artifactId': pom.artifactId, 'project.version': pom.version,
    'pom.version': pom.version, version: pom.version,
    'project.parent.version': pom.parent && pom.parent.version, 'parent.version': pom.parent && pom.parent.version,
    'project.parent.groupId': pom.parent && pom.parent.groupId,
  };
  for (const [k, v] of Object.entries(builtins)) if (v && props[k] == null) props[k] = v;
  const managed = new Map();
  for (const p of [...chain].reverse().concat([pom])) {
    for (const m of p.mgmt) {
      const g = interpolate(m.groupId, props);
      const a = interpolate(m.artifactId, props);
      managed.set(`${g}:${a}`, { version: interpolate(m.version, props), scope: m.scope });
    }
  }
  const all = [];
  const seenDeps = new Set();
  for (const p of [pom, ...chain]) {
    for (const d of p.deps) {
      const g = interpolate(d.groupId, props);
      const a = interpolate(d.artifactId, props);
      const name = `${g}:${a}`;
      if (seenDeps.has(name)) continue;
      seenDeps.add(name);
      const m = managed.get(name);
      const rawVersion = d.version || (m && m.version) || '';
      const spec = interpolate(rawVersion, props);
      const scopeRaw = d.scope || (m && m.scope) || 'compile';
      const unresolvedProp = /\$\{/.test(spec);
      all.push({
        name, spec: unresolvedProp ? null : spec || null, version: !unresolvedProp && spec && !/[[(,]/.test(spec) ? spec : null,
        scope: d.optional ? 'optional' : SCOPE_MAP[scopeRaw] || 'prod', rawScope: scopeRaw,
        line: p === pom ? d.line : pom.line, direct: true, inherited: p !== pom || undefined,
        managed: !d.version && !!m, unresolvedProperty: unresolvedProp ? rawVersion : undefined,
      });
    }
  }
  return {
    ecosystem: 'Maven', kind: 'manifest', file, deps: all,
    project: { name: `${pom.groupId}:${pom.artifactId}`, version: interpolate(pom.version, props), license: pom.licenses.join(' OR ') || null, line: pom.line },
  };
}

const GRADLE_CONFIGS = [
  'implementation', 'api', 'compile', 'runtime', 'runtimeOnly', 'compileOnly', 'compileOnlyApi',
  'testImplementation', 'testCompile', 'testRuntimeOnly', 'testCompileOnly', 'testRuntime',
  'androidTestImplementation', 'debugImplementation', 'releaseImplementation', 'kapt', 'ksp',
  'annotationProcessor', 'testAnnotationProcessor', 'classpath', 'developmentOnly', 'integrationTestImplementation',
];

function gradleScope(config) {
  if (/test/i.test(config)) return 'test';
  if (/^(kapt|ksp|annotationProcessor|developmentOnly|debugImplementation|classpath|compileOnly)$/.test(config)) return 'dev';
  return 'prod';
}

function parseGradle(text, file) {
  const vars = {};
  const src = String(text).replace(/\r\n?/g, '\n');
  // variables: def x = '1.0', val x = "1.0", ext.x = '1.0', ext { x = '1.0' }, set("x", "1.0")
  const varRe = /(?:\b(?:def|val|var|String)\s+|\bext\.|\bproject\.ext\.)([A-Za-z_][\w]*)\s*=\s*["']([^"'$]+)["']/g;
  let m;
  while ((m = varRe.exec(src))) vars[m[1]] = m[2];
  const extBlock = /\bext\s*\{([\s\S]*?)\n\s*\}/g;
  while ((m = extBlock.exec(src))) {
    const re = /([A-Za-z_][\w]*)\s*=\s*["']([^"'$]+)["']/g;
    let k;
    while ((k = re.exec(m[1]))) vars[k[1]] = k[2];
  }
  const setRe = /\bset\(\s*["']([\w.]+)["']\s*,\s*["']([^"']+)["']\s*\)/g;
  while ((m = setRe.exec(src))) vars[m[1]] = m[2];
  const resolve = (s) => String(s).replace(/\$\{?([A-Za-z_][\w.]*)\}?/g, (all, key) => (vars[key] != null ? vars[key] : all));
  const deps = [];
  const lines = src.split('\n');
  const cfg = GRADLE_CONFIGS.join('|');
  const stringNotation = new RegExp(`^\\s*(${cfg})\\s*\\(?\\s*(?:platform\\()?\\s*["']([^"':]+):([^"':]+)(?::([^"'@:]+))?(?::[^"'@]+)?(?:@\\w+)?["']`);
  const mapNotation = new RegExp(`^\\s*(${cfg})\\s*\\(?\\s*group\\s*[:=]\\s*["']([^"']+)["']\\s*,\\s*name\\s*[:=]\\s*["']([^"']+)["'](?:\\s*,\\s*version\\s*[:=]\\s*["']([^"']+)["'])?`);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/\/\/.*$/, '');
    const hit = stringNotation.exec(line) || mapNotation.exec(line);
    if (!hit) continue;
    const [, config, g, a, v] = hit;
    const spec = v ? resolve(v) : null;
    const unresolved = spec && /\$/.test(spec);
    deps.push({
      name: `${resolve(g)}:${resolve(a)}`, spec: unresolved ? null : spec,
      version: spec && !unresolved && !/[+[(,]|latest/.test(spec) ? spec : null,
      scope: gradleScope(config), rawScope: config, line: n + 1, direct: true,
    });
  }
  return { ecosystem: 'Maven', kind: 'manifest', file, deps, gradle: true };
}

function parseGradleLockfile(text, file) {
  const deps = [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n].trim();
    if (!l || l.startsWith('#') || l.startsWith('empty=')) continue;
    const m = /^([^:=\s]+):([^:=\s]+):([^=\s]+)=(.*)$/.exec(l);
    if (!m) continue;
    const configs = m[4].split(',').map((s) => s.trim()).filter(Boolean);
    const prod = configs.some((c) => !/test/i.test(c) && /(compile|runtime)Classpath$/i.test(c));
    deps.push({ key: `${m[1]}:${m[2]}@${m[3]}`, name: `${m[1]}:${m[2]}`, version: m[3], scope: prod ? 'prod' : configs.every((c) => /test/i.test(c)) ? 'test' : 'dev', line: n + 1, configurations: configs });
  }
  return { ecosystem: 'Maven', kind: 'lock', file, deps };
}

module.exports = { parsePom, parseGradle, parseGradleLockfile, interpolate };
