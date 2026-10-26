import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sca = require('../core/sca/index.js');
const versions = require('../core/sca/versions.js');
const cvss = require('../core/sca/cvss.js');
const license = require('../core/sca/license.js');
const osv = require('../core/sca/osv.js');
const { parseToml } = require('../core/sca/toml.js');
const { parseYaml } = require('../core/sca/yaml.js');
const util = require('../core/sca/util.js');
const npmParsers = require('../core/sca/parsers/npm.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, 'fixtures', 'sca');
const scan = (dir, opts) => sca.scanDependencies(path.join(FIX, dir), opts);
const dep = (r, name, version) => r.dependencies.find((d) => d.name === name && (version === undefined || d.version === version));
const rules = (r, rule) => r.findings.filter((f) => f.rule === rule);
const vulnIds = (r, name) => r.vulnerabilities.filter((v) => v.package === name).map((v) => v.id).sort();

// ------------------------------------------------------------- contract --

test('catalog follows the engine contract', () => {
  const cat = sca.catalog();
  const keys = cat.map((r) => r.key);
  for (const k of ['sca:vulnerable-dependency', 'sca:license-denied', 'sca:license-unknown', 'sca:unpinned', 'sca:malicious', 'sca:deprecated', 'sca:duplicate', 'sca:dependency-confusion', 'sca:license-review', 'sca:outdated']) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
  assert.equal(new Set(keys).size, keys.length);
  for (const r of cat) {
    assert.match(r.key, /^sca:[a-z-]+$/);
    assert.deepEqual(r.langs, ['*']);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type));
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity));
    for (const f of ['name', 'why', 'fix']) { assert.ok(r[f].en && r[f].ko, `${r.key}.${f}`); }
    assert.ok(r.tags.every((t) => t === t.toLowerCase()));
  }
});

test('analyze() takes contract files plus ctx.root, honours inactive rules and never goes online', () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network must not be used'); };
  try {
    const root = path.join(FIX, 'npm');
    const files = [{ path: 'package.json', text: fs.readFileSync(path.join(root, 'package.json'), 'utf8'), lang: 'json' }];
    const all = sca.analyze(files, { inactive: new Set(), root, options: {} });
    assert.ok(all.some((f) => f.rule === 'sca:vulnerable-dependency'));
    assert.ok(all.every((f) => f.file && f.line >= 1 && f.message.en && f.message.ko));
    const fewer = sca.analyze(files, { inactive: new Set(['sca:vulnerable-dependency']), root, options: {} });
    assert.ok(!fewer.some((f) => f.rule === 'sca:vulnerable-dependency'));
    assert.ok(fewer.some((f) => f.rule === 'sca:malicious'));
    // Without a root only the given manifests are used (no lockfile -> lower bound of ranges).
    const noRoot = sca.analyze(files, { inactive: new Set(), root: null, options: {} });
    const lodash = noRoot.find((f) => f.rule === 'sca:vulnerable-dependency' && /lodash/.test(f.message.en));
    assert.match(lodash.message.en, /version not locked/);
    assert.deepEqual(sca.analyze([{ path: 'src/a.c', text: 'int x;' }], { inactive: new Set(), root: null, options: {} }), []);
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(calls, 0);
});

// ------------------------------------------------------------ npm family --

test('npm package-lock v3: graph, scopes, nested duplicates, malicious and licenses', () => {
  const r = scan('npm');
  assert.equal(r.errors.length, 0);
  const lodash = dep(r, 'lodash');
  assert.equal(lodash.version, '4.17.11');
  assert.equal(lodash.direct, true);
  assert.equal(lodash.manifestFile, 'package.json');
  assert.equal(lodash.manifestLine, 6);
  assert.equal(lodash.lockFile, 'package-lock.json');
  assert.equal(lodash.purl, 'pkg:npm/lodash@4.17.11');
  assert.equal(lodash.license, 'MIT');
  assert.equal(dep(r, 'jest').scope, 'dev');
  assert.equal(dep(r, 'left-pad').scope, 'dev');
  const nestedQs = dep(r, 'qs', '6.5.2');
  assert.equal(nestedQs.direct, false);
  assert.equal(nestedQs.scope, 'prod');
  assert.deepEqual(nestedQs.path.map((id) => r.dependencies.find((d) => d.id === id).name), ['express', 'body-parser', 'qs']);
  assert.ok(dep(r, 'body-parser').dependencies.includes(nestedQs.id));
  assert.ok(dep(r, 'express').dependencies.includes(dep(r, 'qs', '6.7.0').id));

  assert.deepEqual(vulnIds(r, 'lodash'), ['GHSA-35jh-r3h4-6jhm', 'GHSA-jf85-cpcp-j695', 'GHSA-p6mc-m468-83gw']);
  const lodashFinding = rules(r, 'sca:vulnerable-dependency').find((f) => /CVE-2019-10744/.test(f.message.en));
  assert.equal(lodashFinding.file, 'package.json');
  assert.equal(lodashFinding.line, 6);
  assert.equal(lodashFinding.severity, 'BLOCKER');
  assert.match(lodashFinding.message.en, /GHSA-jf85-cpcp-j695 \(CVE-2019-10744\), CVSS 9\.1 critical/);
  assert.match(lodashFinding.message.en, /Fixed in 4\.17\.12\. Upgrade to 4\.17\.21/);
  assert.match(lodashFinding.message.ko, /4\.17\.21 로 올리세요/);

  const qs = rules(r, 'sca:vulnerable-dependency').filter((f) => /qs@/.test(f.message.en));
  assert.equal(qs.length, 2);
  assert.ok(qs.every((f) => f.file === 'package.json' && f.line === 7), 'transitive findings point at the direct ancestor');
  assert.ok(qs.some((f) => /Upgrade to 6\.5\.3/.test(f.message.en) && /Transitive via express@4\.17\.1 > body-parser@1\.19\.0 > qs@6\.5\.2/.test(f.message.en)));
  assert.ok(qs.every((f) => f.events.some((e) => e.file === 'package-lock.json' && e.tag === 'source')));

  const dup = rules(r, 'sca:duplicate');
  assert.equal(dup.length, 1);
  assert.match(dup[0].message.en, /qs is resolved in 2 versions: 6\.5\.2, 6\.7\.0/);

  const mal = rules(r, 'sca:malicious').map((f) => f.message.en);
  assert.ok(mal.some((m) => /^event-stream@3\.3\.6/.test(m)));
  assert.ok(mal.some((m) => /^flatmap-stream@0\.1\.1.*Pulled in via event-stream@3\.3\.6 > flatmap-stream@0\.1\.1/.test(m)));

  const denied = rules(r, 'sca:license-denied').map((f) => f.message.en);
  assert.ok(denied.some((m) => /agpl-widget@2\.0\.0 .*AGPL-3\.0-only \(network-copyleft\)/.test(m)));
  assert.ok(denied.some((m) => /acme-logger@1\.0\.3 .*proprietary/.test(m)));
  // dev-only WTFPL left-pad is ignored by the default policy (ignoreDev).
  assert.ok(!r.findings.some((f) => f.rule.startsWith('sca:license') && /left-pad/.test(f.message.en)));

  const unpinned = rules(r, 'sca:unpinned').map((f) => f.message.en);
  assert.ok(unpinned.some((m) => /minimist uses the wildcard version "\*" \(currently locked to 1\.2\.5\)/.test(m)));
  assert.ok(unpinned.some((m) => /left-pad uses the open-ended range ">=1\.0\.0"/.test(m)));
  assert.ok(rules(r, 'sca:deprecated').some((f) => /^request@2\.88\.2 is deprecated/.test(f.message.en)));
});

test('npm package-lock v1 resolves nested requires and dev flags', () => {
  const r = scan('npm-v1');
  assert.equal(dep(r, 'node-fetch').version, '2.6.0');
  assert.equal(dep(r, 'node-fetch').direct, true);
  const mini = dep(r, 'minimist');
  assert.equal(mini.direct, false);
  assert.equal(mini.scope, 'dev');
  assert.ok(dep(r, 'mocha').dependencies.includes(mini.id));
  assert.deepEqual(vulnIds(r, 'node-fetch'), ['GHSA-r683-j2x4-v87g', 'GHSA-w7rc-rwvf-8q5r']);
  const low = r.vulnerabilities.find((v) => v.id === 'GHSA-w7rc-rwvf-8q5r');
  assert.equal(low.severity, 'LOW');
  assert.equal(low.score, null);
  assert.equal(r.vulnerabilities.find((v) => v.id === 'GHSA-r683-j2x4-v87g').suggestedUpgrade, '2.6.7');
});

test('yarn.lock classic: multi-descriptor headers and edges', () => {
  const r = scan('yarn-classic');
  const cf = dep(r, '@babel/code-frame');
  assert.equal(cf.version, '7.12.11');
  assert.equal(cf.purl, 'pkg:npm/%40babel/code-frame@7.12.11');
  assert.equal(cf.lockLine, 5);
  assert.ok(cf.dependencies.includes(dep(r, '@babel/highlight').id));
  assert.equal(dep(r, 'follow-redirects').direct, false);
  assert.deepEqual(vulnIds(r, 'axios'), ['GHSA-cph5-m8f7-6c5x', 'GHSA-wf5p-g6vw-rhxx']);
  assert.equal(r.vulnerabilities.find((v) => v.id === 'GHSA-wf5p-g6vw-rhxx').suggestedUpgrade, '0.28.0');
});

test('yarn.lock berry: YAML descriptors, workspace entry and edges', () => {
  const r = scan('yarn-berry');
  assert.equal(r.manifests.find((m) => m.file === 'yarn.lock').format, 'yarn-berry');
  assert.equal(dep(r, 'semver').version, '7.3.5');
  assert.equal(dep(r, 'json5').scope, 'dev');
  assert.equal(dep(r, 'lru-cache').direct, false);
  assert.ok(dep(r, 'semver').dependencies.includes(dep(r, 'lru-cache').id));
  assert.ok(dep(r, 'lru-cache').dependencies.includes(dep(r, 'yallist').id));
  assert.ok(!r.dependencies.some((d) => d.name === 'yb'), 'the workspace itself is not a dependency');
  assert.deepEqual(vulnIds(r, 'json5'), ['GHSA-9c47-m6qq-7p4h']);
});

test('pnpm-lock.yaml v9 (importers + snapshots) and v5 (path keys)', () => {
  const r9 = scan('pnpm');
  assert.equal(dep(r9, 'ws').version, '8.16.0');
  assert.equal(dep(r9, 'ws').direct, true);
  assert.equal(dep(r9, '@types/node').scope, 'dev');
  assert.equal(dep(r9, 'undici-types').direct, false);
  assert.equal(dep(r9, 'undici-types').scope, 'dev');
  assert.equal(r9.vulnerabilities[0].suggestedUpgrade, '8.17.1');
  const r5 = scan('pnpm-v5');
  assert.equal(dep(r5, 'lodash').version, '4.17.15');
  assert.equal(dep(r5, 'lodash').direct, true);
  assert.equal(dep(r5, 'semver').scope, 'dev');
  assert.ok(dep(r5, 'semver').dependencies.includes(dep(r5, 'lru-cache').id));
  assert.deepEqual(npmParsers.parsePnpmKey('/@babel/core/7.0.0'), { name: '@babel/core', version: '7.0.0' });
  assert.deepEqual(npmParsers.parsePnpmKey('/foo/1.0.0_bar@2.0.0'), { name: 'foo', version: '1.0.0' });
  assert.deepEqual(npmParsers.parsePnpmKey('react-dom@18.2.0(react@18.2.0)'), { name: 'react-dom', version: '18.2.0' });
});

// --------------------------------------------------------------- Python --

test('requirements.txt: pins, ranges, includes, continuation lines, markers and URLs', () => {
  const r = scan('python-req');
  const django = dep(r, 'Django');
  assert.equal(django.version, '3.2.10');
  assert.equal(django.purl, 'pkg:pypi/django@3.2.10');
  assert.equal(django.line, 3);
  assert.equal(dep(r, 'PyYAML').version, '5.3');
  assert.equal(dep(r, 'urllib3').version, '1.26.4');
  assert.equal(dep(r, 'requests').version, null);
  assert.equal(dep(r, 'requests').matchVersion, '2.20');
  assert.equal(dep(r, 'Jinja2').scope, 'dev');
  assert.equal(dep(r, 'tool').versionSpec, 'git+https://github.com/example/tool.git#egg=tool');
  assert.deepEqual(vulnIds(r, 'PyYAML'), ['GHSA-6757-jp84-gxfx', 'GHSA-8q59-q68h-6hv4']);
  assert.equal(r.vulnerabilities.find((v) => v.package === 'PyYAML').suggestedUpgrade, '5.4');
  assert.equal(r.vulnerabilities.find((v) => v.package === 'Django').fixedIn, '3.2.14');
  const unp = rules(r, 'sca:unpinned').map((f) => f.message.en);
  assert.ok(unp.some((m) => /^flask uses the wildcard/.test(m)));
  assert.ok(unp.some((m) => /^tool is fetched from .* without a pinned commit/.test(m)));
  assert.ok(unp.some((m) => /^requests uses the open-ended range ">=2\.20"/.test(m)));
});

test('Pipfile + Pipfile.lock and poetry.lock + pyproject.toml', () => {
  const p = scan('pipenv');
  assert.equal(dep(p, 'requests').version, '2.25.0');
  assert.equal(dep(p, 'requests').manifestLine, 7);
  assert.equal(dep(p, 'urllib3').direct, false);
  assert.equal(dep(p, 'pytest').scope, 'dev');
  assert.deepEqual(vulnIds(p, 'pillow'), ['GHSA-3f63-hfp8-52jq']);

  const r = scan('poetry');
  assert.equal(dep(r, 'django').version, '4.0.5');
  assert.equal(dep(r, 'django').manifestLine, 9);
  assert.equal(dep(r, 'PyYAML').direct, true, 'PyYAML matches pyyaml after PEP 503 normalisation');
  assert.equal(dep(r, 'sqlparse').direct, false);
  assert.equal(dep(r, 'pytest').scope, 'dev');
  assert.ok(dep(r, 'django').dependencies.includes(dep(r, 'asgiref').id));
  assert.deepEqual(vulnIds(r, 'django'), ['GHSA-p64x-8rxx-wf6q']);
  assert.equal(rules(r, 'sca:unpinned').length, 0, 'caret and tilde Poetry ranges are bounded');
  assert.ok(!dep(r, 'python'), 'the python constraint is not a dependency');

  const pep = scan('pep621');
  assert.equal(dep(pep, 'requests').versionSpec, '>=2.28,<3');
  assert.equal(dep(pep, 'pytest').scope, 'test');
  assert.ok(rules(pep, 'sca:unpinned').some((f) => /jinja2/.test(f.message.en)));
  assert.ok(!rules(pep, 'sca:unpinned').some((f) => /requests/.test(f.message.en)));
});

// ------------------------------------------------------------------ JVM --

test('Maven pom.xml: properties, parent dependencyManagement and ranges', () => {
  const r = scan('maven');
  const log4j = dep(r, 'org.apache.logging.log4j:log4j-core');
  assert.equal(log4j.version, '2.14.1');
  assert.equal(log4j.purl, 'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1');
  assert.equal(log4j.line, 17);
  const jackson = dep(r, 'com.fasterxml.jackson.core:jackson-databind');
  assert.equal(jackson.version, '2.13.1', 'version comes from the parent dependencyManagement + parent property');
  assert.equal(dep(r, 'junit:junit').scope, 'test');
  assert.deepEqual(vulnIds(r, 'org.apache.logging.log4j:log4j-core'), ['GHSA-7rjr-3q55-vv33', 'GHSA-jfh8-c2jp-5v3q']);
  const log4shell = r.vulnerabilities.find((v) => v.id === 'GHSA-jfh8-c2jp-5v3q');
  assert.equal(log4shell.score, 10);
  assert.equal(log4shell.fixedIn, '2.15.0');
  assert.equal(log4shell.suggestedUpgrade, '2.16.0');
  assert.deepEqual(log4shell.cve, ['CVE-2021-44228']);
  assert.equal(r.vulnerabilities.find((v) => v.package === 'com.fasterxml.jackson.core:jackson-databind').suggestedUpgrade, '2.13.2.1');
  assert.equal(r.vulnerabilities.find((v) => v.package === 'org.springframework:spring-beans').suggestedUpgrade, '5.3.18');
  assert.ok(rules(r, 'sca:unpinned').some((f) => f.line === 37 && /commons-text uses the open-ended range "\[1\.9,\)"/.test(f.message.en)));
  assert.equal(r.graph.roots.find((x) => x.file === 'pom.xml').name, 'com.acme:orders');
});

test('Gradle build.gradle(.kts) with variables, map notation and gradle.lockfile', () => {
  const r = scan('gradle');
  const jackson = dep(r, 'com.fasterxml.jackson.core:jackson-databind');
  assert.equal(jackson.version, '2.12.5');
  assert.equal(jackson.manifestLine, 8);
  assert.equal(dep(r, 'org.yaml:snakeyaml').manifestLine, 9);
  assert.equal(dep(r, 'com.fasterxml.jackson.core:jackson-core').direct, false);
  assert.equal(dep(r, 'org.junit.jupiter:junit-jupiter').scope, 'test');
  assert.equal(r.vulnerabilities.filter((v) => v.package === 'org.apache.logging.log4j:log4j-core').length, 0, 'log4j 2.16.0 is fixed for both log4j CVEs');
  assert.ok(rules(r, 'sca:unpinned').some((f) => /guava uses the dynamic version "31\.\+" \(currently locked to 31\.1-jre\)/.test(f.message.en)));
  const kts = scan('gradle-kts');
  assert.equal(dep(kts, 'org.apache.commons:commons-text').version, '1.9');
  assert.equal(dep(kts, 'io.mockk:mockk').scope, 'test');
  assert.deepEqual(vulnIds(kts, 'org.apache.commons:commons-text'), ['GHSA-599f-7c49-w659']);
});

// ------------------------------------------------------- Go / Rust / ... --

test('go.mod + go.sum: indirect, +incompatible, no-fix advisory and go.sum-only modules', () => {
  const r = scan('go');
  assert.equal(dep(r, 'golang.org/x/net').direct, false);
  assert.equal(dep(r, 'golang.org/x/net').manifestLine, 7);
  assert.equal(dep(r, 'github.com/gin-gonic/gin').direct, true);
  assert.equal(dep(r, 'golang.org/x/crypto').version, 'v0.14.0', 'highest go.sum version wins');
  assert.equal(dep(r, 'golang.org/x/crypto').purl, 'pkg:golang/golang.org/x/crypto@v0.14.0');
  const jwt = r.vulnerabilities.find((v) => v.id === 'GO-2020-0017');
  assert.equal(jwt.fixedIn, null);
  assert.equal(jwt.suggestedUpgrade, null);
  assert.match(rules(r, 'sca:vulnerable-dependency').find((f) => /GO-2020-0017/.test(f.message.en)).message.en, /No fixed version is known\. Replace or remove the component\./);
  assert.equal(r.vulnerabilities.find((v) => v.id === 'GO-2023-2102').suggestedUpgrade, '0.17.0');
  assert.equal(rules(r, 'sca:unpinned').length, 0);
});

test('Cargo.toml + Cargo.lock: root package edges, dev and target dependencies, path crates', () => {
  const r = scan('rust');
  assert.equal(dep(r, 'regex').direct, true);
  assert.equal(dep(r, 'regex').manifestLine, 8);
  assert.equal(dep(r, 'aho-corasick').direct, false);
  assert.ok(dep(r, 'regex').dependencies.includes(dep(r, 'memchr').id));
  assert.equal(dep(r, 'tempdir').scope, 'dev');
  assert.ok(!dep(r, 'local-helper'));
  assert.deepEqual(vulnIds(r, 'smallvec'), ['RUSTSEC-2021-0003']);
  assert.equal(r.vulnerabilities.find((v) => v.id === 'RUSTSEC-2022-0013').suggestedUpgrade, '1.5.5');
  assert.ok(rules(r, 'sca:unpinned').some((f) => /^winapi uses the wildcard/.test(f.message.en)));
  assert.ok(!rules(r, 'sca:unpinned').some((f) => /regex|serde/.test(f.message.en)), 'bare Cargo versions are caret ranges');
  assert.ok(rules(r, 'sca:deprecated').some((f) => /tempdir/.test(f.message.en)));
  assert.equal(r.graph.roots[0].license, 'MIT OR Apache-2.0');
});

test('Gemfile + Gemfile.lock: platform suffixes, groups and four-part versions', () => {
  const r = scan('ruby');
  assert.equal(dep(r, 'nokogiri').version, '1.10.1');
  assert.equal(dep(r, 'rails').direct, true);
  assert.equal(dep(r, 'actionpack').direct, false);
  assert.equal(dep(r, 'rspec-rails').scope, 'dev');
  const ap = r.vulnerabilities.find((v) => v.package === 'actionpack');
  assert.equal(ap.fixedIn, '5.2.2.1');
  const f = rules(r, 'sca:vulnerable-dependency').find((x) => /actionpack/.test(x.message.en));
  assert.equal(f.file, 'Gemfile');
  assert.equal(f.line, 3);
  assert.match(f.message.en, /Transitive via rails@5\.2\.2 > actionpack@5\.2\.2/);
});

test('composer.json + composer.lock: platform packages skipped, v-prefixed versions, licenses', () => {
  const r = scan('php');
  assert.ok(!dep(r, 'php') && !dep(r, 'ext-json'));
  assert.equal(dep(r, 'phpmailer/phpmailer').version, '5.2.16');
  assert.equal(dep(r, 'guzzlehttp/psr7').direct, false);
  assert.equal(dep(r, 'phpunit/phpunit').scope, 'dev');
  assert.equal(r.vulnerabilities.find((v) => v.package === 'guzzlehttp/guzzle').suggestedUpgrade, '7.4.3');
  assert.ok(rules(r, 'sca:license-review').some((x) => /phpmailer.*LGPL-2\.1-only \(weak-copyleft\)/.test(x.message.en)));
});

// The NuGet lock file lives here, not in fixtures/: an IDE that restores the
// fixture project (C# Dev Kit) rewrites packages.lock.json on disk.
const DOTNET_LOCK = {
  version: 1,
  dependencies: {
    'net6.0': {
      'Newtonsoft.Json': { type: 'Direct', requested: '[12.0.3, )', resolved: '12.0.3', contentHash: 'x' },
      Serilog: { type: 'Direct', requested: '[2.10.0, )', resolved: '2.10.0', contentHash: 'y' },
      'System.Text.Encodings.Web': { type: 'Direct', requested: '[4.7.1, )', resolved: '4.7.1', contentHash: 'z', dependencies: { 'System.Memory': '4.5.4' } },
      'System.Memory': { type: 'Transitive', resolved: '4.5.4', contentHash: 'w' },
    },
  },
};
function scanDotnet() {
  const base = path.join(FIX, 'dotnet');
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['bin', 'obj'].includes(e.name)) walk(full); continue; }
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (rel !== 'App/packages.lock.json') files.push({ path: rel, text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(base);
  files.push({ path: 'App/packages.lock.json', text: JSON.stringify(DOTNET_LOCK, null, 2) + '\n' });
  return sca.scanDependencies(files);
}

test('NuGet: SDK csproj with central versions + packages.lock.json, packages.config and nuspec', () => {
  const r = scanDotnet();
  const nj = dep(r, 'Newtonsoft.Json');
  assert.equal(nj.version, '12.0.3');
  assert.equal(nj.versionSpec, '12.0.3', 'MSBuild property interpolated');
  assert.equal(nj.manifestFile, 'App/App.csproj');
  assert.equal(dep(r, 'Serilog').versionSpec, '2.10.0', 'version from Directory.Packages.props');
  assert.equal(dep(r, 'System.Memory').direct, false);
  assert.equal(dep(r, 'StyleCop.Analyzers').scope, 'dev');
  assert.equal(dep(r, 'xunit').scope, 'test');
  assert.equal(r.vulnerabilities.find((v) => v.package === 'System.Text.Encodings.Web').suggestedUpgrade, '4.7.2');
  assert.ok(rules(r, 'sca:unpinned').some((f) => /xunit uses the dynamic version "2\.4\.\*"/.test(f.message.en)));
  assert.equal(rules(r, 'sca:unpinned').length, 1);
  const legacy = scan('dotnet-legacy');
  assert.equal(dep(legacy, 'NUnit').scope, 'dev');
  assert.equal(dep(legacy, 'Polly').versionSpec, '[7.2.3, 8.0.0)');
  assert.ok(rules(legacy, 'sca:deprecated').some((f) => /WindowsAzure\.Storage/.test(f.message.en)));
  assert.equal(legacy.vulnerabilities.find((v) => v.package === 'Newtonsoft.Json').suggestedUpgrade, '13.0.1');
});

test('C/C++: conanfile.txt + conan.lock, vcpkg.json overrides and vendored LICENSE detection', () => {
  const r = scan('cpp-conan');
  assert.equal(dep(r, 'zlib').version, '1.2.11');
  assert.equal(dep(r, 'zlib').license, 'Zlib');
  assert.equal(dep(r, 'zlib').licenseSource, 'third_party/zlib/LICENSE');
  assert.equal(dep(r, 'openssl').version, '3.0.8');
  assert.equal(dep(r, 'cmake').scope, 'dev');
  assert.equal(dep(r, 'boost').version, '1.83.0');
  assert.equal(r.vulnerabilities[0].id, 'CVE-2022-37434');
  assert.equal(r.vulnerabilities[0].suggestedUpgrade, '1.2.13');
  const v = scan('cpp-vcpkg');
  assert.equal(dep(v, 'zlib').version, '1.2.12');
  assert.equal(dep(v, 'zlib').purl, 'pkg:generic/vcpkg/zlib@1.2.12');
  assert.equal(dep(v, 'gtest').scope, 'dev');
  assert.equal(v.vulnerabilities.length, 1);
});

test('Swift Package.resolved v1/v2 with Package.swift, and Dart pubspec.lock + pubspec.yaml', () => {
  const s = scan('swift');
  const nio = dep(s, 'github.com/apple/swift-nio');
  assert.equal(nio.version, '2.42.0');
  assert.equal(nio.direct, true);
  assert.equal(nio.purl, 'pkg:swift/github.com/apple/swift-nio@2.42.0');
  assert.equal(dep(s, 'github.com/apple/swift-atomics').direct, false);
  const s1 = scan('swift-v1');
  assert.equal(dep(s1, 'github.com/onevcat/kingfisher').version, '7.0.0');
  const d = scan('dart');
  assert.equal(dep(d, 'http').version, '0.13.5');
  assert.equal(dep(d, 'http').manifestLine, 8);
  assert.equal(dep(d, 'flutter_lints').scope, 'dev');
  assert.equal(dep(d, 'http_parser').direct, false);
  assert.ok(!dep(d, 'flutter'), 'SDK packages are skipped');
  assert.equal(dep(d, 'http').purl, 'pkg:pub/http@0.13.5');
});

test('every ecosystem fixture parses without errors', () => {
  for (const dir of fs.readdirSync(FIX)) {
    const r = scan(dir);
    assert.deepEqual(r.errors, [], dir);
    assert.ok(r.dependencies.length > 0, dir);
    assert.ok(r.dependencies.every((x) => x.purl.startsWith('pkg:') && x.file && x.line >= 1), dir);
  }
});

test('broken manifests produce a manifest-error finding instead of throwing', () => {
  const r = sca.scanDependencies([{ path: 'package.json', text: '{ "dependencies": { "a": ' }, { path: 'Cargo.toml', text: '[package\nname = 1' }]);
  assert.equal(r.errors.length, 2);
  assert.equal(rules(r, 'sca:manifest-error').length, 2);
});

// ------------------------------------------------------------- versions --

test('version ordering edge cases per ecosystem', () => {
  const lt = (eco, a, b) => assert.ok(versions.compare(eco, a, b) < 0, `${eco}: ${a} < ${b}`);
  const eq = (eco, a, b) => assert.equal(versions.compare(eco, a, b), 0, `${eco}: ${a} == ${b}`);
  // SemVer 2.0.0 precedence example chain
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let k = 0; k + 1 < chain.length; k++) lt('npm', chain[k], chain[k + 1]);
  eq('npm', '1.0.0+build.1', '1.0.0');
  lt('crates.io', '1.5.4', '1.5.10');
  // Go pseudo-versions and +incompatible
  lt('Go', 'v0.0.0-20210101000000-abcdefabcdef', 'v0.0.1');
  lt('Go', 'v1.2.3', 'v1.2.4-0.20220101000000-abcdefabcdef');
  lt('Go', 'v1.2.4-0.20220101000000-abcdefabcdef', 'v1.2.4');
  eq('Go', 'v3.2.0+incompatible', '3.2.0');
  assert.ok(versions.isPseudoVersion('v0.0.0-20191109021931-daa7c04131f5'));
  assert.ok(versions.isPseudoVersion('v1.2.4-0.20220101000000-abcdefabcdef'));
  assert.ok(!versions.isPseudoVersion('v1.2.4'));
  // PEP 440
  const pep = ['1.0.dev0', '1.0a1', '1.0a2.dev1', '1.0a2', '1.0b1', '1.0rc1', '1.0', '1.0+local.1', '1.0.post1.dev0', '1.0.post1', '1.1'];
  for (let k = 0; k + 1 < pep.length; k++) lt('PyPI', pep[k], pep[k + 1]);
  eq('PyPI', '1.0', '1.0.0');
  eq('PyPI', '1.0.0-RC1', '1.0rc1');
  lt('PyPI', '2023.1', '1!0.1');
  lt('PyPI', '5.3', '5.4');
  lt('PyPI', '5.3.1', '5.4');
  // Maven ComparableVersion
  lt('Maven', '2.0-beta9', '2.0');
  lt('Maven', '2.0-beta9', '2.3.1');
  lt('Maven', '1.0-alpha1', '1.0-beta1');
  lt('Maven', '1.0-rc1', '1.0-SNAPSHOT');
  lt('Maven', '1.0-SNAPSHOT', '1.0');
  lt('Maven', '1.0', '1.0-sp1');
  lt('Maven', '1.0', '1.0.1');
  lt('Maven', '2.12.6', '2.12.6.1');
  lt('Maven', '2.12.6.1', '2.13.0');
  lt('Maven', '5.3.0.RC1', '5.3.18');
  eq('Maven', '1.0.0.RELEASE', '1.0.0');
  eq('Maven', '1.0-final', '1');
  eq('Maven', '2.15', '2.15.0');
  // RubyGems
  lt('RubyGems', '1.0.a', '1.0');
  lt('RubyGems', '1.0.0.rc1', '1.0.0');
  lt('RubyGems', '5.2.2', '5.2.2.1');
  lt('RubyGems', '4.2.11', '4.2.11.1');
  // Composer
  const comp = ['1.0.0-dev', '1.0.0-alpha1', '1.0.0-beta2', '1.0.0-RC1', '1.0.0', '1.0.0-p1'];
  for (let k = 0; k + 1 < comp.length; k++) lt('Packagist', comp[k], comp[k + 1]);
  eq('Packagist', 'v5.2.16', '5.2.16');
  // NuGet
  lt('NuGet', '1.0.0', '1.0.0.1');
  eq('NuGet', '1.0', '1.0.0.0');
  eq('NuGet', '1.0.0-Beta', '1.0.0-beta');
  lt('NuGet', '4.7.1', '4.7.2');
});

test('declared range semantics: npm, Cargo, Composer, PEP 440, Maven, NuGet, RubyGems', () => {
  const yes = (eco, v, spec) => assert.ok(versions.satisfies(eco, v, spec), `${eco} ${v} satisfies ${spec}`);
  const no = (eco, v, spec) => assert.ok(!versions.satisfies(eco, v, spec), `${eco} ${v} does not satisfy ${spec}`);
  yes('npm', '1.9.9', '^1.2.3'); no('npm', '2.0.0', '^1.2.3');
  yes('npm', '0.2.9', '^0.2.3'); no('npm', '0.3.0', '^0.2.3');
  yes('npm', '0.0.3', '^0.0.3'); no('npm', '0.0.4', '^0.0.3');
  yes('npm', '1.2.9', '~1.2'); no('npm', '1.3.0', '~1.2');
  yes('npm', '1.9.0', '1.x'); no('npm', '2.0.0', '1.x');
  yes('npm', '2.3.0', '1.2.3 - 2.3'); no('npm', '2.4.0', '1.2.3 - 2.3');
  yes('npm', '3.1.0', '<2.0.0 || >=3.0.0'); no('npm', '2.5.0', '<2.0.0 || >=3.0.0');
  yes('npm', '1.5.0', '>= 1.2 < 2');
  yes('crates.io', '1.9.0', '1.5'); no('crates.io', '2.0.0', '1.5');
  yes('crates.io', '1.6.0', '=1.6.0'); no('crates.io', '1.6.1', '=1.6.0');
  yes('Packagist', '1.9.0', '~1.2'); no('Packagist', '2.0.0', '~1.2');
  yes('Packagist', '1.2.9', '~1.2.3'); no('Packagist', '1.3.0', '~1.2.3');
  yes('Packagist', '7.4.2', '^6.5 || ^7.0');
  yes('PyPI', '2.2.5', '~=2.2'); no('PyPI', '3.0', '~=2.2');
  yes('PyPI', '1.4.9', '~=1.4.5'); no('PyPI', '1.5.0', '~=1.4.5');
  yes('PyPI', '1.0.7', '==1.0.*'); no('PyPI', '1.1.0', '==1.0.*');
  no('PyPI', '2.1', '>=2.0,!=2.1,<3'); yes('PyPI', '2.2', '>=2.0,!=2.1,<3');
  yes('Maven', '1.5', '[1.0,2.0)'); no('Maven', '2.0', '[1.0,2.0)');
  yes('Maven', '0.9', '(,1.0]'); yes('Maven', '3.0', '(,1.0],[1.2,)'); no('Maven', '1.1', '(,1.0],[1.2,)');
  yes('Maven', '1.0', '[1.0]'); no('Maven', '1.0.1', '[1.0]');
  yes('NuGet', '13.0.1', '12.0.3'); no('NuGet', '12.0.2', '12.0.3');
  yes('NuGet', '7.9.0', '[7.2.3, 8.0.0)'); no('NuGet', '8.0.0', '[7.2.3, 8.0.0)');
  yes('RubyGems', '3.9.1', '~> 3.8'); no('RubyGems', '4.0', '~> 3.8');
  yes('RubyGems', '2.4.9', '~> 2.4.0'); no('RubyGems', '2.5.0', '~> 2.4.0');
  yes('RubyGems', '1.11', '>= 1.10, < 2');
});

test('analyzeSpec classifies pinned, wildcard, open-ended and dynamic specs', () => {
  const a = (eco, s) => versions.analyzeSpec(eco, s);
  assert.equal(a('npm', '4.17.21').pinned, true);
  assert.equal(a('npm', '^4.17.21').pinned, false);
  assert.equal(a('npm', '^4.17.21').lower, '4.17.21');
  assert.equal(a('npm', '*').wildcard, true);
  assert.equal(a('npm', 'latest').wildcard, true);
  assert.equal(a('npm', '>=1.0.0').unbounded, true);
  assert.equal(a('npm', '>=1.0.0 <2').unbounded, false);
  assert.equal(a('npm', 'github:user/repo#a1b2c3d4').pinned, true);
  assert.equal(a('npm', 'git+https://github.com/u/r.git').pinned, false);
  assert.equal(a('PyPI', '==2.0').pinned, true);
  assert.equal(a('PyPI', '>=2.0').unbounded, true);
  assert.equal(a('PyPI', '^5.1').wildcard, false);
  assert.equal(a('PyPI', '').wildcard, true);
  assert.equal(a('Maven', '2.14.1').pinned, true);
  assert.equal(a('Maven', '[1.9,)').unbounded, true);
  assert.equal(a('Maven', 'LATEST').wildcard, true);
  assert.equal(a('Maven', '31.+').dynamic, true);
  assert.equal(a('Maven', 'latest.release').wildcard, true);
  assert.equal(a('NuGet', '2.4.*').dynamic, true);
  assert.equal(a('NuGet', '[13.0.1]').pinned, true);
  assert.equal(a('RubyGems', '>= 1.10').unbounded, true);
  assert.equal(a('RubyGems', '~> 3.8').unbounded, false);
  assert.equal(a('crates.io', '1.0').unbounded, false);
  assert.equal(a('crates.io', '=1.6.0').pinned, true);
});

// --------------------------------------------------------- OSV matching --

test('OSV ranges: multiple introduced/fixed pairs, last_affected, explicit versions and limits', () => {
  const rec = {
    id: 'TEST-1', modified: '2026-01-01T00:00:00Z',
    affected: [{
      package: { ecosystem: 'npm', name: 'pkg' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.6' }, { introduced: '2.0.0' }, { fixed: '2.1.1' }, { introduced: '3.0.0' }, { last_affected: '3.4.0' }] }],
      versions: ['9.9.9'],
    }],
  };
  const hit = (v) => osv.isAffected(rec, 'npm', 'pkg', v);
  assert.equal(hit('1.2.5'), true);
  assert.equal(hit('1.2.6'), false);
  assert.equal(hit('1.9.0'), false);
  assert.equal(hit('2.0.0'), true);
  assert.equal(hit('2.1.0'), true);
  assert.equal(hit('2.1.1'), false);
  assert.equal(hit('3.4.0'), true);
  assert.equal(hit('3.4.1'), false);
  assert.equal(hit('9.9.9'), true);
  assert.equal(hit('2.0.0-beta.1'), false, 'pre-release of 2.0.0 sorts before the introduced event');
  assert.deepEqual(osv.fixedVersions(rec, 'npm', 'pkg'), ['1.2.6', '2.1.1']);
  assert.equal(osv.fixFor(rec, 'npm', 'pkg', '2.0.5'), '2.1.1');
  const maven = { id: 'TEST-2', modified: 'x', affected: [{ package: { ecosystem: 'Maven', name: 'g:a' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '2.0-beta9' }, { fixed: '2.3.1' }, { introduced: '2.4' }, { fixed: '2.12.2' }] }] }] };
  assert.equal(osv.isAffected(maven, 'Maven', 'g:a', '2.0-beta8'), false);
  assert.equal(osv.isAffected(maven, 'Maven', 'g:a', '2.0'), true);
  assert.equal(osv.isAffected(maven, 'Maven', 'g:a', '2.3.1'), false);
  assert.equal(osv.isAffected(maven, 'Maven', 'g:a', '2.3.2'), false);
  assert.equal(osv.isAffected(maven, 'Maven', 'g:a', '2.12.1'), true);
  const py = { id: 'TEST-3', modified: 'x', affected: [{ package: { ecosystem: 'PyPI', name: 'Some_Pkg' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '2.0rc1' }] }] }] };
  assert.equal(osv.isAffected(py, 'PyPI', 'some-pkg', '2.0b3'), true, 'names are PEP 503 normalised');
  assert.equal(osv.isAffected(py, 'PyPI', 'some.pkg', '2.0'), false);
});

test('suggested upgrade is the minimal version that clears every advisory', () => {
  const db = osv.defaultDb();
  const adv = db.forPackage('npm', 'lodash');
  assert.equal(osv.suggestUpgrade(adv, 'npm', 'lodash', '4.17.11'), '4.17.21');
  assert.equal(osv.suggestUpgrade(adv, 'npm', 'lodash', '4.17.20'), '4.17.21');
  const log4j = db.forPackage('Maven', 'org.apache.logging.log4j:log4j-core');
  assert.equal(osv.suggestUpgrade(log4j, 'Maven', 'org.apache.logging.log4j:log4j-core', '2.11.0'), '2.12.2');
  assert.equal(osv.suggestUpgrade(log4j, 'Maven', 'org.apache.logging.log4j:log4j-core', '2.14.1'), '2.16.0');
  const qs = db.forPackage('npm', 'qs');
  assert.equal(osv.suggestUpgrade(qs, 'npm', 'qs', '6.9.1'), '6.9.7');
});

test('bundled advisory DB is valid OSV with real identifiers', () => {
  const recs = osv.bundledRecords();
  assert.ok(recs.length >= 40, `bundled ${recs.length}`);
  const ids = new Set();
  for (const r of recs) {
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
    assert.ok(r.modified && r.summary && Array.isArray(r.affected) && r.affected.length);
    assert.match(r.id, /^(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|CVE-\d{4}-\d{4,}|RUSTSEC-\d{4}-\d{4}|GO-\d{4}-\d{4})$/);
    for (const a of r.aliases) assert.match(a, /^(GHSA-|CVE-)/);
    for (const s of r.severity || []) assert.notEqual(cvss.cvssScore(s.score).score, null, `${r.id} vector`);
  }
  const lodash = recs.find((r) => r.id === 'GHSA-jf85-cpcp-j695');
  assert.deepEqual(lodash.aliases, ['CVE-2019-10744']);
  assert.ok(recs.find((r) => r.aliases.includes('CVE-2021-44228')));
  const db = osv.defaultDb();
  for (const eco of ['npm', 'Maven', 'PyPI', 'crates.io', 'Go', 'RubyGems', 'Packagist', 'NuGet', 'ConanCenter', 'vcpkg']) assert.ok(db.ecosystems()[eco] > 0, eco);
});

// Minimal zip writer for the importer test (deflate entries).
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  for (const [name, text] of entries) {
    const data = Buffer.from(text);
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('importOsvDatabase loads folders, zip dumps and in-memory lists; newer records win', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-osv-'));
  try {
    const rec = (id, fixed, modified = '2026-01-01T00:00:00Z') => ({ id, modified, summary: `test ${id}`, affected: [{ package: { ecosystem: 'npm', name: 'left-pad' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed }] }] }] });
    fs.mkdirSync(path.join(tmp, 'dump', 'npm'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'dump', 'npm', 'MAL-1.json'), JSON.stringify(rec('MAL-2026-1', '1.1.0')));
    fs.writeFileSync(path.join(tmp, 'dump', 'npm', 'notes.txt'), 'ignored');
    const zipPath = path.join(tmp, 'all.zip');
    fs.writeFileSync(zipPath, makeZip([['GHSA-test-0001-0001.json', JSON.stringify(rec('GHSA-test-0001-0001', '1.2.0'))], ['readme.md', 'x']]));
    const db = sca.importOsvDatabase([path.join(tmp, 'dump'), zipPath, rec('INLINE-1', '1.0.5'), JSON.stringify([rec('INLINE-2', '1.0.1')])]);
    assert.equal(db.importStats.errors.length, 0);
    assert.equal(db.importStats.added, 4);
    assert.deepEqual(db.forPackage('npm', 'left-pad').map((r) => r.id).sort(), ['GHSA-test-0001-0001', 'INLINE-1', 'INLINE-2', 'MAL-2026-1']);
    assert.ok(db.get('GHSA-jf85-cpcp-j695'), 'bundled records are kept by default');
    db.add(rec('INLINE-1', '1.0.9', '2027-01-01T00:00:00Z'));
    assert.deepEqual(osv.fixedVersions(db.get('INLINE-1'), 'npm', 'left-pad'), ['1.0.9']);
    assert.equal(db.add(rec('INLINE-1', '0.0.1', '2020-01-01T00:00:00Z')), false, 'older record is ignored');
    const only = sca.importOsvDatabase(zipPath, { includeBundled: false });
    assert.equal(only.size, 1);
    const r = sca.scanDependencies([{ path: 'package.json', text: JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } }) }], { advisoryDb: only });
    assert.equal(r.vulnerabilities.length, 1);
    assert.equal(r.vulnerabilities[0].suggestedUpgrade, '1.2.0');
    const bad = sca.importOsvDatabase(path.join(tmp, 'missing'), { includeBundled: false });
    assert.equal(bad.importStats.errors.length, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('queryOsv batches queries, fetches details, and fails gracefully', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith('/v1/querybatch')) {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ results: body.queries.map((q) => ({ vulns: q.package.name === 'lodash' ? [{ id: 'GHSA-jf85-cpcp-j695' }] : [] })) }) };
    }
    return { ok: true, json: async () => ({ id: decodeURIComponent(url.split('/').pop()), modified: 'x', affected: [] }) };
  };
  const res = await sca.queryOsv([{ ecosystem: 'npm', name: 'lodash', version: '4.17.11' }, { ecosystem: 'npm', name: 'left-pad', version: '1.3.0' }, { ecosystem: 'vcpkg', name: 'zlib', version: '1' }], { fetch: fakeFetch });
  assert.equal(res.ok, true);
  assert.deepEqual(res.ids, ['GHSA-jf85-cpcp-j695']);
  assert.equal(res.vulns[0].id, 'GHSA-jf85-cpcp-j695');
  assert.equal(seen[0].url, 'https://api.osv.dev/v1/querybatch');
  assert.equal(JSON.parse(seen[0].init.body).queries.length, 2, 'vcpkg is not an OSV ecosystem');
  const down = await sca.queryOsv([{ ecosystem: 'npm', name: 'a', version: '1.0.0' }], { fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual([down.ok, down.error], [false, 'offline']);
  const http = await sca.queryOsv([{ ecosystem: 'npm', name: 'a', version: '1.0.0' }], { fetch: async () => ({ ok: false, status: 503 }) });
  assert.deepEqual([http.ok, http.error], [false, 'HTTP 503']);
  const slow = await sca.queryOsv([{ ecosystem: 'npm', name: 'a', version: '1.0.0' }], {
    timeoutMs: 20,
    fetch: (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }); }),
  });
  assert.equal(slow.ok, false);
  assert.match(slow.error, /timed out after 20 ms/);
  assert.deepEqual(await sca.queryOsv([], { fetch: fakeFetch }), { ok: true, vulns: [], results: [] });
});

// ------------------------------------------------------------------ CVSS --

test('CVSS v3.1 / v3.0 / v2 base scores match the reference calculator', () => {
  const cases = [
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8, 'CRITICAL'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0, 'CRITICAL'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H', 9.1, 'CRITICAL'],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H', 9.0, 'CRITICAL'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H', 8.8, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H', 8.1, 'HIGH'],
    ['CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 7.8, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 7.5, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:H', 7.4, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H', 7.2, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:L/A:H', 7.1, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N', 6.5, 'MEDIUM'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1, 'MEDIUM'],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:N/A:N', 6.1, 'MEDIUM'],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N', 5.9, 'MEDIUM'],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:L', 5.6, 'MEDIUM'],
    ['CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N', 5.4, 'MEDIUM'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L', 5.3, 'MEDIUM'],
    ['CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N', 1.8, 'LOW'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0, 'NONE'],
    ['CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8, 'CRITICAL'],
    ['AV:N/AC:L/Au:N/C:P/I:P/A:P', 7.5, 'HIGH'],
    ['AV:N/AC:M/Au:N/C:N/I:P/A:N', 4.3, 'MEDIUM'],
    ['AV:N/AC:L/Au:N/C:C/I:C/A:C', 10.0, 'HIGH'],
  ];
  for (const [vector, score, sev] of cases) {
    const r = cvss.cvssScore(vector);
    assert.equal(r.score, score, vector);
    assert.equal(r.severity, sev === 'HIGH' && score === 10 ? 'CRITICAL' : sev, vector);
  }
  assert.equal(cvss.roundup31(4.000000000000001), 4.0);
  assert.equal(cvss.roundup31(4.02), 4.1);
  assert.equal(cvss.cvssScore('CVSS:3.1/AV:N/AC:L').score, null);
  assert.equal(cvss.cvssScore('garbage').severity, 'UNKNOWN');
});

test('CVSS v4 is scored best-effort and flagged approximate', () => {
  const hi = cvss.cvssScore('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
  assert.equal(hi.version, '4.0');
  assert.equal(hi.approximate, true);
  assert.equal(hi.severity, 'CRITICAL');
  assert.ok(Math.abs(hi.score - 9.3) <= 0.3, `v4 approx ${hi.score}`);
  const lo = cvss.cvssScore('CVSS:4.0/AV:L/AC:H/AT:P/PR:H/UI:A/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N');
  assert.ok(lo.score > 0 && lo.score < 4, `low v4 ${lo.score}`);
  assert.equal(cvss.cvssScore('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N').score, 0);
  assert.equal(cvss.osvSeverity({ severity: [{ type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N' }, { type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }] }).version, '3.1', 'v3.1 is preferred over the approximate v4 score');
  assert.equal(cvss.osvSeverity({ database_specific: { severity: 'MODERATE' } }).severity, 'MEDIUM');
  assert.equal(cvss.toIssueSeverity('CRITICAL'), 'BLOCKER');
  assert.equal(cvss.toIssueSeverity('LOW'), 'MINOR');
});

// -------------------------------------------------------------- licenses --

test('SPDX id normalisation handles aliases, deprecated ids, URLs and free text', () => {
  const n = license.normalizeLicenseId;
  assert.equal(n('mit'), 'MIT');
  assert.equal(n('The MIT License'), 'MIT');
  assert.equal(n('Apache License, Version 2.0'), 'Apache-2.0');
  assert.equal(n('Apache 2.0'), 'Apache-2.0');
  assert.equal(n('ASL 2.0'), 'Apache-2.0');
  assert.equal(n('GPL-2.0'), 'GPL-2.0-only');
  assert.equal(n('GPL-3.0+'), 'GPL-3.0-or-later');
  assert.equal(n('GPLv3'), 'GPL-3.0-only');
  assert.equal(n('LGPL-2.1+'), 'LGPL-2.1-or-later');
  assert.equal(n('BSD'), 'BSD-3-Clause');
  assert.equal(n('Simplified BSD License'), 'BSD-2-Clause');
  assert.equal(n('MPL 2.0'), 'MPL-2.0');
  assert.equal(n('Eclipse Public License - v 2.0'), 'EPL-2.0');
  assert.equal(n('https://www.apache.org/licenses/LICENSE-2.0.txt'), 'Apache-2.0');
  assert.equal(n('http://opensource.org/licenses/MIT'), 'MIT');
  assert.equal(n('Python Software Foundation License'), 'PSF-2.0');
  assert.equal(n('UNLICENSED'), 'LicenseRef-Proprietary');
  assert.equal(n('LicenseRef-Acme-1'), 'LicenseRef-Acme-1');
  assert.equal(n('Some Custom Terms v1'), null);
});

test('SPDX expressions: AND / OR / WITH precedence, parentheses and legacy forms', () => {
  const e = license.normalizeExpression;
  assert.equal(e('MIT OR Apache-2.0'), 'MIT OR Apache-2.0');
  assert.equal(e('(MIT OR Apache-2.0) AND BSD-3-Clause'), '(MIT OR Apache-2.0) AND BSD-3-Clause');
  assert.equal(e('MIT AND BSD-3-Clause OR GPL-2.0'), '(MIT AND BSD-3-Clause) OR GPL-2.0-only', 'AND binds tighter than OR');
  assert.equal(e('GPL-2.0-only WITH Classpath-exception-2.0'), 'GPL-2.0-only WITH Classpath-exception-2.0');
  assert.equal(e('GPL-2.0-with-classpath-exception'), 'GPL-2.0-only WITH Classpath-exception-2.0');
  assert.equal(e('MIT/Apache-2.0'), 'MIT OR Apache-2.0');
  assert.equal(e('mit or apache-2.0'), 'MIT OR Apache-2.0');
  assert.equal(e('Apache-2.0 WITH LLVM-exception'), 'Apache-2.0 WITH LLVM-exception');
  const ast = license.parseExpression('MIT AND (LGPL-2.1-or-later OR BSD-3-Clause)');
  assert.equal(ast.type, 'and');
  assert.equal(ast.right.type, 'or');
  assert.deepEqual(license.licenseIds(ast), ['MIT', 'LGPL-2.1-or-later', 'BSD-3-Clause']);
  assert.equal(license.licenseFromMetadata([{ type: 'MIT' }, { type: 'Apache-2.0' }]), 'MIT OR Apache-2.0');
});

test('license policy: categories, OR picks the best option, AND the worst, WITH exceptions', () => {
  const ev = (x, p) => license.evaluateLicense(x, p);
  assert.equal(ev('MIT').verdict, 'allowed');
  assert.equal(ev('MIT').category, 'permissive');
  assert.equal(ev('LGPL-3.0-only').category, 'weak-copyleft');
  assert.equal(ev('LGPL-3.0-only').verdict, 'review');
  assert.equal(ev('GPL-3.0-only').category, 'strong-copyleft');
  assert.equal(ev('AGPL-3.0').verdict, 'denied');
  assert.equal(ev('AGPL-3.0').category, 'network-copyleft');
  assert.equal(ev('SSPL-1.0').category, 'network-copyleft');
  assert.equal(ev('BUSL-1.1').category, 'proprietary');
  assert.equal(ev('MIT OR GPL-3.0-only').verdict, 'allowed');
  assert.equal(ev('MIT AND AGPL-3.0-only').verdict, 'denied');
  assert.equal(ev('GPL-2.0-only WITH Classpath-exception-2.0').category, 'weak-copyleft');
  assert.equal(ev('Whatever License 9').verdict, 'unknown');
  assert.equal(ev(null).verdict, 'missing');
  assert.equal(ev(null, { reportMissing: true }).verdict, 'unknown');
  const strict = { denied: ['GPL-3.0-only'], allowed: ['LGPL-3.0'], categories: { 'strong-copyleft': 'denied' } };
  assert.equal(ev('GPL-3.0', strict).verdict, 'denied');
  assert.equal(ev('LGPL-3.0-only', strict).verdict, 'allowed');
  assert.equal(ev('GPL-2.0-or-later', strict).verdict, 'denied');
});

test('license text detection and node_modules lookup', () => {
  assert.equal(license.detectLicenseText('Permission is hereby granted, free of charge, to any person obtaining a copy of this software'), 'MIT');
  assert.equal(license.detectLicenseText('Apache License\n Version 2.0, January 2004'), 'Apache-2.0');
  assert.equal(license.detectLicenseText('GNU LESSER GENERAL PUBLIC LICENSE\nVersion 2.1, February 1999'), 'LGPL-2.1-only');
  assert.equal(license.detectLicenseText('Redistribution and use in source and binary forms ... Neither the name of the copyright holder'), 'BSD-3-Clause');
  assert.equal(license.detectLicenseText('// SPDX-License-Identifier: MIT OR Apache-2.0\n'), 'MIT OR Apache-2.0');
  assert.equal(license.detectLicenseText('random text'), null);
  assert.ok(license.isLicenseFile('LICENSE.md') && license.isLicenseFile('COPYING') && !license.isLicenseFile('index.js'));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-lic-'));
  try {
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
    w('package.json', JSON.stringify({ name: 'lic', dependencies: { 'mit-lib': '1.0.0', 'gpl-lib': '1.0.0', 'mystery-lib': '1.0.0', 'bare-lib': '1.0.0' } }, null, 2));
    w('node_modules/mit-lib/package.json', JSON.stringify({ name: 'mit-lib', license: 'MIT' }));
    w('node_modules/gpl-lib/package.json', JSON.stringify({ name: 'gpl-lib' }));
    w('node_modules/gpl-lib/LICENSE', '                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n');
    w('node_modules/mystery-lib/package.json', JSON.stringify({ name: 'mystery-lib', license: 'Some Custom Terms v1' }));
    const r = sca.scanDependencies(tmp, { licensePolicy: { reportMissing: true } });
    assert.equal(dep(r, 'mit-lib').license, 'MIT');
    assert.equal(dep(r, 'mit-lib').licenseSource, 'node_modules/mit-lib/package.json');
    assert.equal(dep(r, 'gpl-lib').license, 'GPL-3.0-only');
    assert.equal(dep(r, 'gpl-lib').licenseSource, 'node_modules/gpl-lib/LICENSE');
    assert.ok(rules(r, 'sca:license-review').some((f) => /gpl-lib/.test(f.message.en) && f.line === 5));
    const unknown = rules(r, 'sca:license-unknown').map((f) => f.message.en);
    assert.ok(unknown.some((m) => /mystery-lib@1\.0\.0 declares the license "Some Custom Terms v1"/.test(m)));
    assert.ok(unknown.some((m) => /bare-lib@1\.0\.0 has no license information/.test(m)));
    const lic = r.licenses.find((l) => l.name === 'gpl-lib');
    assert.deepEqual([lic.category, lic.verdict], ['strong-copyleft', 'review']);
    const quiet = sca.scanDependencies(tmp, { detectLicenses: false });
    assert.equal(rules(quiet, 'sca:license-unknown').length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- SBOM ----

const FIXED = { timestamp: '2026-10-22T00:00:00Z', serialNumber: '3e671687-395b-41f5-a30f-a58921a69b79', namespace: 'https://example.test/spdx/shop-web' };

test('CycloneDX 1.5 JSON export: components, dependency graph and vulnerabilities', () => {
  const r = scan('npm');
  const bom = sca.toCycloneDx(r, FIXED);
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.specVersion, '1.5');
  assert.equal(bom.serialNumber, `urn:uuid:${FIXED.serialNumber}`);
  assert.equal(bom.version, 1);
  assert.equal(bom.metadata.timestamp, FIXED.timestamp);
  assert.equal(bom.metadata.component.name, 'shop-web');
  assert.ok(Array.isArray(bom.metadata.tools.components));
  const refs = new Set(bom.components.map((c) => c['bom-ref']));
  assert.equal(refs.size, bom.components.length);
  const lodash = bom.components.find((c) => c.name === 'lodash');
  assert.deepEqual(lodash.licenses, [{ license: { id: 'MIT' } }]);
  assert.equal(lodash.purl, 'pkg:npm/lodash@4.17.11');
  assert.equal(lodash.scope, 'required');
  assert.equal(lodash.hashes[0].alg, 'SHA-512');
  assert.match(lodash.hashes[0].content, /^[0-9a-f]{128}$/);
  assert.equal(bom.components.find((c) => c.name === 'jest').scope, 'excluded');
  const root = bom.dependencies.find((d) => d.ref === bom.metadata.component['bom-ref']);
  assert.ok(root.dependsOn.includes('pkg:npm/lodash@4.17.11'));
  for (const d of bom.dependencies) for (const x of d.dependsOn) assert.ok(refs.has(x), `dangling ${x}`);
  const log = bom.vulnerabilities.find((v) => v.id === 'GHSA-jf85-cpcp-j695');
  assert.equal(log.source.name, 'GitHub Advisories');
  assert.deepEqual(log.references, [{ id: 'CVE-2019-10744', source: { name: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2019-10744' } }]);
  assert.deepEqual(log.ratings[0], { score: 9.1, severity: 'critical', method: 'CVSSv31', vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H' });
  assert.deepEqual(log.affects, [{ ref: 'pkg:npm/lodash@4.17.11', versions: [{ version: '4.17.11', status: 'affected' }] }]);
  assert.ok(log.cwes.includes(1321));
  assert.match(log.recommendation, /4\.17\.21/);
  const qs = bom.vulnerabilities.find((v) => v.id === 'GHSA-hrpp-h998-j3pp');
  assert.equal(qs.affects.length, 2);
  assert.equal(JSON.stringify(sca.toCycloneDx(r, FIXED)), JSON.stringify(bom), 'deterministic with fixed options');
});

test('SPDX 2.3 JSON and tag-value export', () => {
  const r = scan('rust');
  const doc = sca.toSpdx(r, FIXED);
  assert.equal(doc.spdxVersion, 'SPDX-2.3');
  assert.equal(doc.dataLicense, 'CC0-1.0');
  assert.equal(doc.SPDXID, 'SPDXRef-DOCUMENT');
  assert.equal(doc.documentNamespace, FIXED.namespace);
  assert.equal(doc.creationInfo.created, FIXED.timestamp);
  assert.ok(doc.creationInfo.creators.every((c) => /^(Tool|Organization|Person): /.test(c)));
  const ids = new Set(doc.packages.map((p) => p.SPDXID));
  assert.equal(ids.size, doc.packages.length);
  for (const p of doc.packages) {
    assert.match(p.SPDXID, /^SPDXRef-[A-Za-z0-9.-]+$/);
    assert.ok(p.downloadLocation && p.licenseDeclared && p.copyrightText);
    assert.equal(p.filesAnalyzed, false);
  }
  const root = doc.packages[0];
  assert.equal(root.licenseDeclared, 'MIT OR Apache-2.0');
  const regex = doc.packages.find((p) => p.name === 'regex');
  assert.equal(regex.versionInfo, '1.5.4');
  assert.deepEqual(regex.externalRefs[0], { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: 'pkg:cargo/regex@1.5.4' });
  assert.ok(regex.externalRefs.some((x) => x.referenceCategory === 'SECURITY' && /RUSTSEC-2022-0013/.test(x.referenceLocator)));
  assert.ok(doc.relationships.some((x) => x.relationshipType === 'DESCRIBES' && x.relatedSpdxElement === root.SPDXID));
  assert.ok(doc.relationships.some((x) => x.spdxElementId === root.SPDXID && x.relationshipType === 'DEPENDS_ON' && x.relatedSpdxElement === regex.SPDXID));
  assert.ok(doc.relationships.some((x) => x.relationshipType === 'DEV_DEPENDENCY_OF' && x.relatedSpdxElement === root.SPDXID));
  assert.ok(doc.relationships.some((x) => x.spdxElementId === regex.SPDXID && x.relationshipType === 'DEPENDS_ON'));
  for (const rel of doc.relationships) {
    if (rel.spdxElementId !== 'SPDXRef-DOCUMENT') assert.ok(ids.has(rel.spdxElementId));
    assert.ok(ids.has(rel.relatedSpdxElement));
  }
  const tv = sca.toSpdxTagValue(r, FIXED);
  assert.match(tv, /^SPDXVersion: SPDX-2\.3\nDataLicense: CC0-1\.0\nSPDXID: SPDXRef-DOCUMENT\n/);
  assert.match(tv, /\nPackageName: regex\nSPDXID: SPDXRef-[^\n]+\nPackageVersion: 1\.5\.4\n/);
  assert.match(tv, /\nExternalRef: PACKAGE-MANAGER purl pkg:cargo\/regex@1\.5\.4\n/);
  assert.match(tv, /\nRelationship: SPDXRef-DOCUMENT DESCRIBES SPDXRef-Root-crawler\n/);
});

test('SBOM import: CycloneDX fixture, and round trips through CycloneDX, SPDX JSON and tag-value', () => {
  const r = scan('sbom');
  assert.equal(dep(r, 'lodash').version, '4.17.15');
  assert.equal(dep(r, 'org.apache.logging.log4j:log4j-core').license, 'Apache-2.0');
  assert.equal(dep(r, 'pyyaml').direct, false);
  assert.ok(r.vulnerabilities.some((v) => v.id === 'GHSA-jfh8-c2jp-5v3q'));
  const src = scan('php');
  const expected = src.dependencies.map((d) => d.purl).sort();
  const cdx = sca.importSbom(JSON.stringify(sca.toCycloneDx(src, FIXED)), 'bom.json');
  assert.deepEqual(cdx.deps.map((d) => d.purl).sort(), expected);
  assert.equal(cdx.deps.find((d) => d.name === 'guzzlehttp/psr7').direct, false);
  assert.equal(cdx.deps.find((d) => d.name === 'phpunit/phpunit').scope, 'dev');
  const spdx = sca.importSbom(JSON.stringify(sca.toSpdx(src, FIXED)), 'app.spdx.json');
  assert.deepEqual(spdx.deps.map((d) => d.purl).sort(), expected);
  assert.equal(spdx.deps.find((d) => d.name === 'phpunit/phpunit').scope, 'dev');
  assert.equal(spdx.deps.find((d) => d.name === 'guzzlehttp/psr7').direct, false);
  const tv = sca.importSbom(sca.toSpdxTagValue(src, FIXED), 'app.spdx');
  assert.deepEqual(tv.deps.map((d) => d.purl).sort(), expected);
  assert.equal(tv.deps.find((d) => d.name === 'phpmailer/phpmailer').license, 'LGPL-2.1-only');
  const xml = sca.importSbom('<?xml version="1.0"?><bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components><component type="library"><name>x</name><version>1.0</version><purl>pkg:nuget/Newtonsoft.Json@12.0.1</purl><licenses><license><id>MIT</id></license></licenses></component></components></bom>', 'bom.xml');
  assert.deepEqual(xml.deps.map((d) => [d.ecosystem, d.name, d.version, d.license]), [['NuGet', 'Newtonsoft.Json', '12.0.1', 'MIT']]);
  assert.throws(() => sca.importSbom('{"hello":1}'), /Unrecognised SBOM/);
});

test('purl build and parse round trip', () => {
  const cases = [
    ['npm', '@babel/core', '7.0.0', 'pkg:npm/%40babel/core@7.0.0'],
    ['Maven', 'org.apache.logging.log4j:log4j-core', '2.14.1', 'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1'],
    ['Go', 'golang.org/x/net', 'v0.10.0', 'pkg:golang/golang.org/x/net@v0.10.0'],
    ['Packagist', 'guzzlehttp/guzzle', '7.4.2', 'pkg:composer/guzzlehttp/guzzle@7.4.2'],
    ['PyPI', 'django', '3.2.10', 'pkg:pypi/django@3.2.10'],
    ['NuGet', 'Newtonsoft.Json', '13.0.1', 'pkg:nuget/Newtonsoft.Json@13.0.1'],
  ];
  for (const [eco, name, v, purl] of cases) {
    assert.equal(util.toPurl(eco, name, v), purl);
    const p = util.parsePurl(purl);
    assert.deepEqual([p.ecosystem, p.fullName, p.version], [eco, name, v]);
  }
  assert.deepEqual(util.parsePurl('pkg:deb/debian/curl@7.50.3-1?arch=i386#sub').qualifiers, { arch: 'i386' });
});

// ------------------------------------------------------- other findings --

test('dependency confusion hints for configured internal name patterns', () => {
  const r = scan('npm', { internalPatterns: ['acme-*', '@acme/*'] });
  const dc = rules(r, 'sca:dependency-confusion');
  assert.equal(dc.length, 1);
  assert.equal(dc[0].line, 10);
  assert.match(dc[0].message.en, /Internal package acme-logger is unscoped/);
  const py = scan('python-req', { internalPatterns: ['/^acme[-_]/i'] });
  const p = rules(py, 'sca:dependency-confusion');
  assert.equal(p.length, 1);
  assert.match(p[0].message.en, /acme_internal_lib is installed with an extra package index/);
  const scoped = sca.scanDependencies([
    { path: 'package.json', text: JSON.stringify({ dependencies: { '@acme/core': '1.0.0' } }) },
    { path: 'package-lock.json', text: JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { '@acme/core': '1.0.0' } }, 'node_modules/@acme/core': { version: '1.0.0', resolved: 'https://registry.npmjs.org/@acme/core/-/core-1.0.0.tgz' } } }) },
  ], { internalPatterns: ['@acme/*'] });
  assert.match(rules(scoped, 'sca:dependency-confusion')[0].message.en, /resolved from the public registry \(https:\/\/registry\.npmjs\.org\)/);
  assert.equal(rules(scan('npm'), 'sca:dependency-confusion').length, 0, 'no hints without configuration');
});

test('outdated, requirePinned and includeDev options', () => {
  const r = scan('npm', { latest: { 'npm:express': '5.1.0', lodash: '4.17.21' } });
  const out = rules(r, 'sca:outdated');
  assert.equal(out.length, 1);
  assert.match(out[0].message.en, /express@4\.17\.1 is 1 major version\(s\) behind the latest 5\.1\.0/);
  const pinned = scan('pep621', { requirePinned: true });
  assert.ok(rules(pinned, 'sca:unpinned').some((f) => /requests uses the range ">=2\.28,<3" and no lockfile pins it/.test(f.message.en)));
  const prodOnly = scan('npm-v1', { includeDev: false });
  assert.ok(!rules(prodOnly, 'sca:vulnerable-dependency').some((f) => /minimist/.test(f.message.en)));
  assert.ok(rules(scan('npm-v1'), 'sca:vulnerable-dependency').some((f) => /minimist/.test(f.message.en)));
});

test('result shape: dependencies, graph, vulnerabilities, licenses, summary', () => {
  const r = scan('npm');
  assert.deepEqual(Object.keys(r).sort(), ['binaries', 'dependencies', 'errors', 'findings', 'graph', 'licenseHints', 'licenses', 'manifests', 'snippets', 'summary', 'vulnerabilities']);
  assert.equal(r.graph.roots.length, 1);
  assert.equal(r.graph.roots[0].lockFile, 'package-lock.json');
  assert.equal(r.graph.nodes.length, r.dependencies.length);
  assert.ok(r.graph.edges.some((e) => e.kind === 'direct' && e.from === r.graph.roots[0].id));
  assert.equal(r.summary.direct + r.summary.transitive, r.summary.dependencies);
  assert.equal(r.summary.bySeverity.CRITICAL, 2);
  assert.equal(r.licenses.length, r.dependencies.length);
  const v = r.vulnerabilities[0];
  for (const k of ['id', 'aliases', 'cve', 'ghsa', 'summary', 'severity', 'score', 'fixedIn', 'suggestedUpgrade', 'dependency', 'purl', 'package', 'version']) assert.ok(k in v, k);
  // Same purl in two projects keeps distinct ids.
  const two = sca.scanDependencies([
    { path: 'a/package.json', text: JSON.stringify({ dependencies: { lodash: '4.17.21' } }) },
    { path: 'b/package.json', text: JSON.stringify({ dependencies: { lodash: '4.17.21' } }) },
  ]);
  assert.equal(two.dependencies.length, 2);
  assert.notEqual(two.dependencies[0].id, two.dependencies[1].id);
  assert.equal(two.graph.roots.length, 2);
  assert.equal(sca.toCycloneDx(two, FIXED).components.length, 1, 'SBOM merges identical components');
});

// -------------------------------------------------------- parser details --

test('TOML subset parser', () => {
  const t = parseToml([
    'title = "x" # comment',
    'num = 1_000',
    'flt = 3.5',
    'date = 1979-05-27T07:32:00Z',
    "lit = 'C:\\path'",
    'multi = """',
    'line1',
    'line2"""',
    'arr = [',
    '  1,',
    '  2, # trailing',
    ']',
    'inline = { a = 1, b.c = "d" }',
    '"quoted key" = true',
    '[a.b]',
    'k = "v"',
    '[[pkg]]',
    'name = "one"',
    '[pkg.deps]',
    'x = "1"',
    '[[pkg]]',
    'name = "two"',
  ].join('\n'));
  assert.equal(t.title, 'x');
  assert.equal(t.num, 1000);
  assert.equal(t.flt, 3.5);
  assert.equal(t.date, '1979-05-27T07:32:00Z');
  assert.equal(t.lit, 'C:\\path');
  assert.equal(t.multi, 'line1\nline2');
  assert.deepEqual(t.arr, [1, 2]);
  assert.deepEqual(t.inline, { a: 1, b: { c: 'd' } });
  assert.equal(t['quoted key'], true);
  assert.equal(t.a.b.k, 'v');
  assert.deepEqual(t.pkg.map((p) => p.name), ['one', 'two']);
  assert.equal(t.pkg[0].deps.x, '1');
  assert.equal(util.lineOf(t.pkg, 1), 21);
  assert.equal(util.lineOf(t.a.b, 'k'), 16);
  assert.throws(() => parseToml('a = '), /TOML parse error/);
});

test('YAML subset parser', () => {
  const y = parseYaml([
    '# comment',
    'name: app',
    'version: 1.10',
    "quoted: 'it''s'",
    'dq: "a\\tb"',
    'flag: true',
    'empty:',
    'flow: {integrity: sha512-abc==, tarball: "https://x/y.tgz"}',
    'list:',
    '  - a',
    '  - key: v',
    '    other: w',
    'seq:',
    '- one',
    '- two',
    'block: |',
    '  line 1',
    '  line 2',
    'nested:',
    '  deeper:',
    "    '@scope/pkg@1.0.0': {}",
  ].join('\n'));
  assert.equal(y.name, 'app');
  assert.equal(y.version, '1.10', 'plain scalars stay strings');
  assert.equal(y.quoted, "it's");
  assert.equal(y.dq, 'a\tb');
  assert.equal(y.flag, true);
  assert.equal(y.empty, null);
  assert.deepEqual(y.flow, { integrity: 'sha512-abc==', tarball: 'https://x/y.tgz' });
  assert.deepEqual(y.list, ['a', { key: 'v', other: 'w' }]);
  assert.deepEqual(y.seq, ['one', 'two']);
  assert.equal(y.block, 'line 1\nline 2\n');
  assert.deepEqual(y.nested.deeper['@scope/pkg@1.0.0'], {});
  assert.equal(util.lineOf(y.nested.deeper, '@scope/pkg@1.0.0'), 21);
});

test('JSON parser keeps key lines and tolerates comments (tsconfig-style)', () => {
  const j = util.parseJson('{\n  // c\n  "a": 1,\n  "b": {\n    "c": [1, 2]\n  }\n}');
  assert.equal(util.lineOf(j, 'a'), 3);
  assert.equal(util.lineOf(j.b, 'c'), 5);
  assert.throws(() => util.parseJson('{"a":'), /JSON parse error/);
});
