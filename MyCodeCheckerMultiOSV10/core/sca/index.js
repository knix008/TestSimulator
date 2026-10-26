'use strict';

// Software Composition Analysis engine.
//
//   scanDependencies(rootOrFiles, options) -> { dependencies, graph, vulnerabilities, licenses, findings, manifests, errors }
//   toCycloneDx(result, opts) / toSpdx(result, opts) / toSpdxTagValue(result, opts)
//   importSbom(text, file) / importOsvDatabase(source, opts) / queryOsv(packages, opts)
//   catalog() / analyze(files, ctx)  (ENGINE_CONTRACT)
//
// Offline by default: only bundled or imported OSV data is used. queryOsv is
// the one network entry point and runs only when a caller invokes it.

const fs = require('fs');
const path = require('path');
const { parseFile, isManifest, parserFor } = require('./parsers');
const { buildGraph } = require('./graph');
const { defaultDb, createAdvisoryDb, importOsvDatabase, matchDependencies, queryOsv, recordsFromJson } = require('./osv');
const { evaluateLicense, mergePolicy, detectLicenseText, isLicenseFile, licenseFromMetadata, normalizeExpression, categoryOf, parseExpression, licenseIds } = require('./license');
const { analyzeSpec, satisfies, compare } = require('./versions');
const { toIssueSeverity } = require('./cvss');
const { toCycloneDx, toSpdx, toSpdxTagValue, importSbom } = require('./sbom');
const { catalog, RULES } = require('./rules');
const { tryJson, basename, dirname, joinPath, normalizeName } = require('./util');
const { parseToml } = require('./toml');
const reach = require('./reachability');
const snippets = require('./snippets');
const binary = require('./binary');
const { licenseObligations, compatibilityHints } = require('./license');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'vendor', 'target', 'dist', 'build', 'out', '.venv', 'venv', 'env',
  '__pycache__', '.gradle', '.idea', '.vscode', 'bin', 'obj', 'Pods', '.dart_tool', '.next', '.nuxt', 'coverage',
  '.tox', '.mypy_cache', '.pytest_cache', 'bower_components', 'jspm_packages', '.terraform', '.cargo', '.m2', 'site-packages',
]);

let dataCache = null;
function bundledData() {
  if (dataCache) return dataCache;
  const read = (n) => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', n), 'utf8')).packages || []; } catch { return []; }
  };
  dataCache = { malicious: read('malicious.json'), deprecated: read('deprecated.json') };
  return dataCache;
}

// ------------------------------------------------------------ discovery --

function discoverFiles(root, options = {}) {
  const out = [];
  const maxFiles = options.maxManifestFiles || 2000;
  const maxDepth = options.maxDepth || 12;
  const skip = new Set([...SKIP_DIRS, ...(options.skipDirs || [])]);
  const walk = (dir, rel, depth) => {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (skip.has(e.name) || (e.name.startsWith('.') && e.name !== '.github')) continue;
        walk(path.join(dir, e.name), r, depth + 1);
      } else if (e.isFile() && isManifest(r)) out.push(r);
    }
  };
  walk(root, '', 0);
  return out.sort();
}

function makeReader(root, fileMap) {
  return (rel) => {
    const key = String(rel).replace(/\\/g, '/');
    if (fileMap && fileMap.has(key)) return fileMap.get(key);
    if (!root) return null;
    try {
      const abs = path.join(root, key);
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > 50 * 1024 * 1024) return null;
      return fs.readFileSync(abs, 'utf8');
    } catch { return null; }
  };
}

function normalizeInput(input, options) {
  let root = options.root ? path.resolve(options.root) : null;
  let files = [];
  if (typeof input === 'string') {
    root = path.resolve(input);
    const st = fs.existsSync(root) ? fs.statSync(root) : null;
    if (st && st.isFile()) {
      files = [{ path: basename(root), text: fs.readFileSync(root, 'utf8') }];
      root = path.dirname(root);
    } else if (st && st.isDirectory()) {
      files = discoverFiles(root, options).map((p) => ({ path: p, text: null }));
    } else {
      const err = new Error(`Path not found: ${root}`);
      err.code = 'NOT_FOUND';
      throw err;
    }
  } else if (Array.isArray(input)) {
    for (const f of input) {
      if (typeof f === 'string') {
        if (root && !path.isAbsolute(f)) files.push({ path: f.replace(/\\/g, '/'), text: null });
        else {
          const abs = path.resolve(f);
          const rel = root ? path.relative(root, abs).replace(/\\/g, '/') : basename(abs);
          files.push({ path: rel, text: null, abs });
        }
      } else if (f && f.path) files.push({ path: String(f.path).replace(/\\/g, '/'), text: f.text != null ? String(f.text) : null });
    }
  }
  return { root, files };
}

// --------------------------------------------------------- license data --

function detectInstalledLicense(dep, root, readFile, cache) {
  const dir = dirname(dep.file);
  const candidates = [];
  if (dep.ecosystem === 'npm') candidates.push(joinPath(dir, 'node_modules', dep.name));
  if (dep.ecosystem === 'Go') candidates.push(joinPath(dir, 'vendor', dep.name));
  if (dep.ecosystem === 'Packagist') candidates.push(joinPath(dir, 'vendor', dep.name));
  if (dep.ecosystem === 'crates.io') candidates.push(joinPath(dir, 'vendor', dep.name), joinPath(dir, 'vendor', `${dep.name}-${dep.version}`));
  if (dep.ecosystem === 'ConanCenter' || dep.ecosystem === 'vcpkg') candidates.push(joinPath(dir, 'third_party', dep.name), joinPath(dir, 'external', dep.name), joinPath(dir, 'vendor', dep.name));
  if (dep.ecosystem === 'RubyGems') candidates.push(joinPath(dir, 'vendor', 'bundle', dep.name));
  for (const c of candidates) {
    if (cache.has(c)) { const v = cache.get(c); if (v) return v; continue; }
    let found = null;
    const meta = { npm: 'package.json', Packagist: 'composer.json', 'crates.io': 'Cargo.toml' }[dep.ecosystem];
    if (meta) {
      const text = readFile(`${c}/${meta}`);
      if (text) {
        if (meta === 'Cargo.toml') { try { const t = parseToml(text); found = t.package && typeof t.package.license === 'string' ? { license: t.package.license, source: `${c}/${meta}` } : null; } catch { /* ignore */ } }
        else { const j = tryJson(text); const l = j && licenseFromMetadata(j.license || j.licenses); if (l) found = { license: l, source: `${c}/${meta}` }; }
      }
    }
    if (!found && root) {
      let names = [];
      try { names = fs.readdirSync(path.join(root, c)); } catch { names = []; }
      for (const n of names.filter(isLicenseFile).sort()) {
        const text = readFile(`${c}/${n}`);
        const id = detectLicenseText(text);
        if (id) { found = { license: id, source: `${c}/${n}` }; break; }
      }
    }
    cache.set(c, found);
    if (found) return found;
  }
  return null;
}

// -------------------------------------------------------------- helpers --

function globToRegex(glob) {
  const s = String(glob).trim();
  if (/^\/.*\/[a-z]*$/.test(s)) { const k = s.lastIndexOf('/'); return new RegExp(s.slice(1, k), s.slice(k + 1)); }
  return new RegExp(`^${s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
}

function location(dep, byId) {
  if (dep.manifestFile) return { file: dep.manifestFile, line: dep.manifestLine || 1 };
  const anc = dep.directAncestor && byId.get(dep.directAncestor);
  if (anc && anc !== dep && anc.manifestFile) return { file: anc.manifestFile, line: anc.manifestLine || 1, viaAncestor: true };
  return { file: dep.file, line: dep.line || 1 };
}

function pathText(dep, byId) {
  return (dep.path || [dep.id]).map((id) => { const n = byId.get(id); return n ? `${n.name}@${n.version || n.versionSpec || '?'}` : id; }).join(' > ');
}

function label(dep) {
  return `${dep.name}@${dep.version || dep.versionSpec || dep.matchVersion || '?'}`;
}

function eventsFor(dep, byId, mainText) {
  const events = [];
  if (dep.lockFile) events.push({ file: dep.lockFile, line: dep.lockLine || 1, tag: 'source', text: { en: `Resolved ${label(dep)} in ${dep.lockFile}`, ko: `${dep.lockFile} 에서 ${label(dep)} 로 해석됨` }, main: false });
  if (!dep.direct && dep.path && dep.path.length > 1) {
    const via = pathText(dep, byId);
    events.push({ file: location(dep, byId).file, line: location(dep, byId).line, tag: 'path', text: { en: `Dependency path: ${via}`, ko: `의존 경로: ${via}` }, main: false });
  }
  if (mainText) events.push({ ...location(dep, byId), tag: 'sink', text: mainText, main: true });
  return events.map((e) => { const o = { ...e }; delete o.viaAncestor; return o; });
}

function scopeIncluded(dep, options) {
  if (options.includeDev === false && (dep.scope === 'dev' || dep.scope === 'test')) return false;
  return true;
}

// ----------------------------------------------------------- findings ----

function vulnerabilityFindings(vulns, byId, options) {
  const out = [];
  for (const v of vulns) {
    const dep = byId.get(v.dependency);
    if (!dep || !scopeIncluded(dep, options)) continue;
    const loc = location(dep, byId);
    const ids = [v.id, ...v.aliases.filter((a) => a !== v.id)];
    const idText = ids.length > 1 ? `${ids[0]} (${ids.slice(1).join(', ')})` : ids[0];
    const score = v.score != null ? `CVSS ${v.score.toFixed(1)} ${v.severity.toLowerCase()}` : `${v.severity.toLowerCase()} severity`;
    const fixEn = v.fixedIn ? ` Fixed in ${v.fixedIn}.` : ' No fixed version is known.';
    const fixKo = v.fixedIn ? ` ${v.fixedIn} 에서 수정되었습니다.` : ' 수정된 버전이 알려지지 않았습니다.';
    const upEn = v.suggestedUpgrade ? ` Upgrade to ${v.suggestedUpgrade} (minimal version without known vulnerabilities).` : v.fixedIn ? '' : ' Replace or remove the component.';
    const upKo = v.suggestedUpgrade ? ` 알려진 취약점이 없는 최소 버전 ${v.suggestedUpgrade} 로 올리세요.` : v.fixedIn ? '' : ' 구성 요소를 바꾸거나 제거하세요.';
    const viaEn = dep.direct ? '' : ` Transitive via ${pathText(dep, byId)}.`;
    const viaKo = dep.direct ? '' : ` 간접 의존: ${pathText(dep, byId)}.`;
    const rangeEn = dep.version ? '' : ` (version not locked; checked the lowest version allowed by "${dep.versionSpec}")`;
    const rangeKo = dep.version ? '' : ` (버전이 잠기지 않아 "${dep.versionSpec}" 가 허용하는 최저 버전으로 확인)`;
    const binEn = dep.source === 'binary' ? ` Identified in binary ${dep.file}${dep.binaryInner ? ` (${dep.binaryInner})` : ''} from ${dep.binaryEvidence}.` : '';
    const binKo = dep.source === 'binary' ? ` 바이너리 ${dep.file}${dep.binaryInner ? ` (${dep.binaryInner})` : ''} 에서 ${dep.binaryEvidence} 로 식별했습니다.` : '';
    const rt = reachabilityText(v);
    const message = {
      en: `${label(dep)}${rangeEn} is affected by ${idText}, ${score}: ${v.summary}.${fixEn}${upEn}${viaEn}${binEn}${rt.en}`,
      ko: `${label(dep)}${rangeKo} 에 ${idText} 취약점이 있습니다(${score}): ${v.summary}.${fixKo}${upKo}${viaKo}${binKo}${rt.ko}`,
    };
    const originalSeverity = toIssueSeverity(v.severity === 'UNKNOWN' ? 'HIGH' : v.severity);
    const lowered = v.reachability === 'not-imported' && options.reachabilitySeverity !== false;
    const severity = lowered ? lowerSeverity(originalSeverity) : originalSeverity;
    const events = eventsFor(dep, byId, { en: `${label(dep)} is vulnerable (${v.id})`, ko: `${label(dep)} 취약 (${v.id})` });
    for (const e of v.reachabilityEvidence || []) {
      const tag = e.kind === 'use' ? 'call' : 'import';
      events.push({ file: e.file, line: e.line, tag, text: tag === 'call' ? { en: `Affected code used: ${e.text}`, ko: `영향받는 코드 사용: ${e.text}` } : { en: `Package used: ${e.text}`, ko: `패키지 사용: ${e.text}` }, main: false });
    }
    const sca = { advisory: v.id, aliases: v.aliases, cve: v.cve, ghsa: v.ghsa, score: v.score, vector: v.vector, severity: v.severity, fixedIn: v.fixedIn, suggestedUpgrade: v.suggestedUpgrade, purl: dep.purl, direct: dep.direct, cwes: v.cwes };
    if (v.reachability) {
      Object.assign(sca, { reachability: v.reachability, reachabilityReason: v.reachabilityReason, reachabilityEvidence: v.reachabilityEvidence, reachabilitySymbols: v.reachabilitySymbols });
      if (lowered) sca.originalSeverity = originalSeverity;
    }
    if (dep.source === 'binary') sca.source = 'binary';
    const finding = { rule: 'sca:vulnerable-dependency', file: loc.file, line: loc.line, message, severity, events, function: dep.name, sca };
    if (lowered) finding.originalSeverity = originalSeverity;
    out.push(finding);
  }
  return out;
}

const SEVERITY_ORDER = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
function lowerSeverity(sev) {
  const k = SEVERITY_ORDER.indexOf(sev);
  return k > 0 ? SEVERITY_ORDER[k - 1] : sev;
}

function reachabilityText(v) {
  const ev = (v.reachabilityEvidence || [])[0];
  const at = ev ? ` (${ev.file}:${ev.line})` : '';
  switch (v.reachability) {
    case 'reachable': {
      const call = (v.reachabilityEvidence || []).find((e) => e.kind === 'use') || ev;
      const where = call ? ` (${call.file}:${call.line})` : '';
      return { en: ` Reachable: the project code uses an affected symbol${where}.`, ko: ` 도달 가능: 프로젝트 코드가 영향받는 심볼을 씁니다${where}.` };
    }
    case 'imported':
      return v.reachabilityReason === 'no-symbol-data'
        ? { en: ` The project code imports the package${at}.`, ko: ` 프로젝트 코드가 이 패키지를 가져옵니다${at}.` }
        : { en: ` The project code imports the package${at}, but no affected symbol is referenced.`, ko: ` 프로젝트 코드가 패키지를 가져오지만${at} 영향받는 심볼은 쓰지 않습니다.` };
    case 'not-imported':
      return { en: ' The project code does not import the package (lower priority).', ko: ' 프로젝트 코드가 이 패키지를 가져오지 않습니다(우선순위 낮음).' };
    default: return { en: '', ko: '' };
  }
}

function licenseReport(deps, policyIn, options) {
  const policy = mergePolicy(policyIn);
  const licenses = [];
  const findings = [];
  const hints = [];
  const projectLicenses = options.projectLicenses || new Map();
  for (const dep of deps) {
    const raw = (dep.licenses && dep.licenses.find(Boolean)) || dep.license || null;
    const ev = evaluateLicense(raw, policy);
    const ids = ev.expression ? licenseIds(parseExpression(ev.expression)) : [];
    const unknownIds = ids.filter((id) => categoryOf(id) === 'unknown' && !/^LicenseRef-/.test(id));
    const entry = {
      dependency: dep.id, name: dep.name, version: dep.version, ecosystem: dep.ecosystem, declared: raw, expression: ev.expression,
      category: ev.category, verdict: ev.verdict, source: dep.licenseSource || (raw ? 'manifest' : null), scope: dep.scope,
    };
    if (ev.expression) entry.obligations = licenseObligations(ev.expression).map((o) => o.id);
    const projLic = options.projectLicense || projectLicenses.get(dep.project) || null;
    const devOnly = dep.scope === 'dev' || dep.scope === 'test';
    const compat = ev.expression && !devOnly && options.licenseCompatibility !== false ? compatibilityHints(projLic, ev.expression, { policy }) : [];
    if (compat.length) {
      entry.compatibility = compat;
      for (const h of compat) hints.push({ dependency: dep.id, name: dep.name, version: dep.version, license: ev.expression, projectLicense: projLic, ...h });
    }
    licenses.push(entry);
    for (const h of compat) {
      if (h.level !== 'conflict' || h.assumed) continue;
      const l = location(dep, options.byId);
      findings.push({
        rule: 'sca:license-incompatible', file: l.file, line: l.line, function: dep.name,
        message: { en: `${label(dep)}: ${h.message.en}`, ko: `${label(dep)}: ${h.message.ko}` },
        events: eventsFor(dep, options.byId, null), sca: { license: ev.expression, projectLicense: projLic, code: h.code, purl: dep.purl },
      });
    }
    if (policy.ignoreDev && (dep.scope === 'dev' || dep.scope === 'test')) continue;
    if (options.includeDev === false && (dep.scope === 'dev' || dep.scope === 'test')) continue;
    const byId = options.byId;
    const loc = location(dep, byId);
    const lic = ev.expression || raw;
    if (ev.verdict === 'denied') {
      findings.push({
        rule: 'sca:license-denied', file: loc.file, line: loc.line, function: dep.name,
        message: { en: `${label(dep)} is licensed under ${lic} (${ev.category}), which the license policy denies.`, ko: `${label(dep)} 의 라이선스 ${lic}(${ev.category}) 는 라이선스 정책에서 금지되어 있습니다.` },
        events: eventsFor(dep, byId, null), sca: { license: lic, category: ev.category, purl: dep.purl },
      });
    } else if (ev.verdict === 'review') {
      findings.push({
        rule: 'sca:license-review', file: loc.file, line: loc.line, function: dep.name,
        message: { en: `${label(dep)} uses ${lic} (${ev.category}); review the distribution obligations.`, ko: `${label(dep)} 는 ${lic}(${ev.category}) 라이선스입니다. 배포 의무를 검토하세요.` },
        events: eventsFor(dep, byId, null), sca: { license: lic, category: ev.category, purl: dep.purl },
      });
    } else if (ev.verdict === 'unknown' && (raw || policy.reportMissing)) {
      findings.push({
        rule: 'sca:license-unknown', file: loc.file, line: loc.line, function: dep.name,
        message: raw
          ? { en: `${label(dep)} declares the license "${raw}", which is not a recognised SPDX license${unknownIds.length ? ` (${unknownIds.join(', ')})` : ''}.`, ko: `${label(dep)} 가 선언한 라이선스 "${raw}" 는 인식되는 SPDX 라이선스가 아닙니다.` }
          : { en: `${label(dep)} has no license information.`, ko: `${label(dep)} 에 라이선스 정보가 없습니다.` },
        events: eventsFor(dep, byId, null), sca: { license: raw, purl: dep.purl },
      });
    }
  }
  const summary = {};
  for (const l of licenses) summary[l.category] = (summary[l.category] || 0) + 1;
  return { licenses, findings, summary, hints };
}

function hygieneFindings(deps, byId, roots, options) {
  const out = [];
  const data = bundledData();
  const internal = (options.internalPatterns || []).map(globToRegex);
  // unpinned
  for (const dep of deps) {
    if (!dep.direct || !dep.manifestFile || dep.versionSpec == null || dep.source === 'sbom') continue;
    if (dep.ecosystem === 'Go') continue;
    const s = analyzeSpec(dep.ecosystem, dep.versionSpec);
    const locked = dep.lockFile ? dep.version : null;
    let reasonEn = null;
    let reasonKo = null;
    if (s.wildcard) { reasonEn = `uses the wildcard version "${dep.versionSpec || '*'}"`; reasonKo = `와일드카드 버전 "${dep.versionSpec || '*'}" 를 씁니다`; }
    else if (s.dynamic) { reasonEn = `uses the dynamic version "${dep.versionSpec}"`; reasonKo = `동적 버전 "${dep.versionSpec}" 를 씁니다`; }
    else if (s.unbounded) { reasonEn = `uses the open-ended range "${dep.versionSpec}" with no upper bound`; reasonKo = `상한 없는 범위 "${dep.versionSpec}" 를 씁니다`; }
    else if (s.url && !s.pinned && !/^(path:|file:|link:|workspace:)/.test(dep.versionSpec)) { reasonEn = `is fetched from "${dep.versionSpec}" without a pinned commit`; reasonKo = `커밋 고정 없이 "${dep.versionSpec}" 에서 받아옵니다`; }
    else if (options.requirePinned && !s.pinned && !dep.lockFile) { reasonEn = `uses the range "${dep.versionSpec}" and no lockfile pins it`; reasonKo = `범위 "${dep.versionSpec}" 를 쓰고 lockfile 로 고정되지 않았습니다`; }
    if (!reasonEn) continue;
    out.push({
      rule: 'sca:unpinned', file: dep.manifestFile, line: dep.manifestLine || 1, function: dep.name,
      message: {
        en: `${dep.name} ${reasonEn}${locked ? ` (currently locked to ${locked})` : ''}; pin an exact or bounded version.`,
        ko: `${dep.name} 는 ${reasonKo}${locked ? ` (현재 ${locked} 로 잠김)` : ''}. 정확하거나 상한이 있는 버전으로 고정하세요.`,
      },
    });
  }
  // malicious
  for (const dep of deps) {
    const v = dep.version || dep.matchVersion;
    const hit = data.malicious.find((m) => m.ecosystem === dep.ecosystem && normalizeName(dep.ecosystem, m.name) === normalizeName(dep.ecosystem, dep.name)
      && (m.versions === '*' || (Array.isArray(m.versions) && v && m.versions.some((x) => compare(dep.ecosystem, x, v) === 0))));
    if (!hit) continue;
    const loc = location(dep, byId);
    out.push({
      rule: 'sca:malicious', file: loc.file, line: loc.line, function: dep.name, severity: 'BLOCKER',
      message: {
        en: `${label(dep)} is a known ${hit.kind} package: ${hit.note}.${hit.target ? ` Did you mean "${hit.target}"?` : ''}${dep.direct ? '' : ` Pulled in via ${pathText(dep, byId)}.`}`,
        ko: `${label(dep)} 는 알려진 악성 패키지(${hit.kind})입니다: ${hit.note}.${hit.target ? ` "${hit.target}" 를 의도했나요?` : ''}${dep.direct ? '' : ` 경로: ${pathText(dep, byId)}.`}`,
      },
      events: eventsFor(dep, byId, null),
    });
  }
  // deprecated
  for (const dep of deps) {
    const v = dep.version || dep.matchVersion;
    let hit = data.deprecated.find((m) => m.ecosystem === dep.ecosystem && normalizeName(dep.ecosystem, m.name) === normalizeName(dep.ecosystem, dep.name)
      && (!m.range || (v && safeSatisfies(dep.ecosystem, v, m.range))));
    if (!hit && dep.deprecatedNote) hit = { note: String(dep.deprecatedNote), replacement: null };
    if (!hit) continue;
    const loc = location(dep, byId);
    out.push({
      rule: 'sca:deprecated', file: loc.file, line: loc.line, function: dep.name,
      message: {
        en: `${label(dep)} is deprecated: ${hit.note}.${hit.replacement ? ` Use ${hit.replacement} instead.` : ''}`,
        ko: `${label(dep)} 는 지원 중단되었습니다: ${hit.note}.${hit.replacement ? ` 대신 ${hit.replacement} 를 쓰세요.` : ''}`,
      },
    });
  }
  // outdated (user-supplied latest versions: { "npm:lodash": "4.17.21" } or { lodash: "4.17.21" })
  const latest = options.latest || {};
  for (const dep of deps) {
    const want = latest[`${dep.ecosystem}:${dep.name}`] || latest[dep.name];
    const v = dep.version || dep.matchVersion;
    if (!want || !v) continue;
    const major = (x) => Number(String(x).replace(/^v/, '').split(/[.-]/)[0]);
    if (compare(dep.ecosystem, v, want) >= 0 || !(major(want) > major(v))) continue;
    const loc = location(dep, byId);
    out.push({ rule: 'sca:outdated', file: loc.file, line: loc.line, function: dep.name, message: { en: `${label(dep)} is ${major(want) - major(v)} major version(s) behind the latest ${want}.`, ko: `${label(dep)} 는 최신 ${want} 보다 메이저 버전이 ${major(want) - major(v)} 단계 뒤처졌습니다.` } });
  }
  // duplicates per project
  const byRoot = new Map();
  for (const dep of deps) {
    if (!dep.version) continue;
    const k = `${dep.project}|${normalizeName(dep.ecosystem, dep.name)}`;
    if (!byRoot.has(k)) byRoot.set(k, []);
    byRoot.get(k).push(dep);
  }
  for (const list of byRoot.values()) {
    const versions = [...new Set(list.map((d) => d.version))];
    if (versions.length < 2) continue;
    const first = list.find((d) => d.direct) || list[0];
    const loc = location(first, byId);
    out.push({
      rule: 'sca:duplicate', file: loc.file, line: loc.line, function: first.name,
      message: { en: `${first.name} is resolved in ${versions.length} versions: ${versions.join(', ')}.`, ko: `${first.name} 가 ${versions.length} 개 버전으로 해석됩니다: ${versions.join(', ')}.` },
      events: list.filter((d) => d.lockFile).map((d) => ({ file: d.lockFile, line: d.lockLine || 1, tag: 'path', text: { en: `${label(d)} via ${pathText(d, byId)}`, ko: `${label(d)} 경로 ${pathText(d, byId)}` }, main: false })),
    });
  }
  // dependency confusion
  if (internal.length) {
    for (const dep of deps) {
      if (!internal.some((re) => re.test(dep.name))) continue;
      let why = null;
      if (dep.ecosystem === 'npm' && !dep.name.startsWith('@')) why = { en: 'is unscoped, so the public npm registry can serve a package with the same name', ko: 'scope 가 없어 공개 npm 레지스트리가 같은 이름의 패키지를 줄 수 있습니다' };
      else if (dep.registry && /registry\.npmjs\.org|registry\.yarnpkg\.com|pypi\.org|files\.pythonhosted\.org|repo1?\.maven|api\.nuget\.org|rubygems\.org|crates\.io|proxy\.golang\.org|packagist\.org/.test(dep.registry)) why = { en: `was resolved from the public registry (${dep.registry.split('/').slice(0, 3).join('/')})`, ko: `공개 레지스트리(${dep.registry.split('/').slice(0, 3).join('/')})에서 해석되었습니다` };
      else if (dep.extraIndex) why = { en: 'is installed with an extra package index, so a public package of the same name can win', ko: 'extra index 로 설치되어 같은 이름의 공개 패키지가 선택될 수 있습니다' };
      else if (dep.ecosystem !== 'npm') why = { en: 'matches an internal name pattern; make sure only the private registry can serve it', ko: '내부 이름 패턴과 일치합니다. 사설 레지스트리만 제공하도록 하세요' };
      if (!why) continue;
      const loc = location(dep, byId);
      out.push({ rule: 'sca:dependency-confusion', file: loc.file, line: loc.line, function: dep.name, message: { en: `Internal package ${dep.name} ${why.en}.`, ko: `내부 패키지 ${dep.name} 는 ${why.ko}.` } });
    }
  }
  void roots;
  return out;
}

function safeSatisfies(eco, v, spec) {
  try { return satisfies(eco, v, spec); } catch { return false; }
}

// ---------------------------------------------------------------- scan ---

function resolveDb(options) {
  let db = options.advisoryDb || null;
  if (!db) db = options.bundled === false ? createAdvisoryDb() : defaultDb();
  if (options.advisories) {
    const extra = createAdvisoryDb();
    for (const r of db.all()) extra.add(r);
    extra.addAll(recordsFromJson(options.advisories));
    db = extra;
  }
  return db;
}

function scanDependencies(input, options = {}) {
  const { root, files } = normalizeInput(input, options);
  const fileMap = new Map();
  for (const f of files) if (f.text != null) fileMap.set(f.path, f.text);
  const readFile = makeReader(root, fileMap);
  const errors = [];
  const manifests = [];
  const parsed = [];
  const findings = [];

  // NuGet central package management: Directory.Packages.props in ancestor dirs.
  const central = new Map();
  for (const f of files) {
    if (!/Directory\.Packages\.props$/i.test(f.path)) continue;
    const text = f.text != null ? f.text : (f.abs ? safeRead(f.abs) : readFile(f.path));
    try { const p = parseFile(f.path, text, {}); if (p && p.centralVersions) central.set(dirname(f.path), p.centralVersions); } catch { /* reported below */ }
  }
  const centralFor = (file) => {
    let d = dirname(file);
    for (;;) {
      if (central.has(d)) return central.get(d);
      if (!d) return {};
      d = dirname(d);
    }
  };

  for (const f of files) {
    if (!parserFor(f.path)) continue;
    const text = f.text != null ? f.text : (f.abs ? safeRead(f.abs) : readFile(f.path));
    if (text == null) { errors.push({ file: f.path, error: 'unreadable' }); continue; }
    try {
      const p = parseFile(f.path, text, { readFile, centralVersions: centralFor(f.path) });
      if (!p) continue;
      parsed.push(p);
      manifests.push({ file: f.path, ecosystem: p.ecosystem, kind: p.kind, format: p.format || p.lockVersion || null, count: p.deps.length });
    } catch (err) {
      errors.push({ file: f.path, error: err.message });
      findings.push({
        rule: 'sca:manifest-error', file: f.path, line: err.line || 1,
        message: { en: `Could not parse ${basename(f.path)}: ${err.message}`, ko: `${basename(f.path)} 를 해석하지 못했습니다: ${err.message}` },
      });
    }
  }

  // Directory.Packages.props has only versions; do not treat it as a project.
  const projects = parsed.filter((p) => !(p.centralVersions && !p.deps.length));
  const { dependencies, graph } = buildGraph(projects);
  // Components identified inside binaries (jar, wheel, nupkg, PE, ELF, Mach-O).
  const binaries = [];
  if (options.binaries !== false && (root || options.binaryFiles)) {
    try {
      const scanned = binary.scanBinaries(options.binaryFiles || root, options);
      binaries.push(...scanned.binaries);
      addBinaryComponents(scanned.components, dependencies, graph, options);
    } catch (err) { errors.push({ file: '(binaries)', error: err.message }); }
  }
  const byId = new Map(dependencies.map((d) => [d.id, d]));

  // Installed license metadata (node_modules, vendor, third_party).
  if (options.detectLicenses !== false) {
    const cache = new Map();
    for (const dep of dependencies) {
      if (dep.source === 'binary') continue;
      if (dep.license) { dep.licenseSource = dep.lockFile && dep.licenses.length && !dep.manifestFile ? 'lockfile' : 'manifest'; continue; }
      const found = detectInstalledLicense(dep, root, readFile, cache);
      if (found) { dep.licenses.push(found.license); dep.license = normalizeExpression(found.license); dep.licenseSource = found.source; }
    }
  }

  const db = resolveDb(options);
  const vulnerabilities = matchDependencies(dependencies, db);

  // Source files for reachability and snippet matching.
  const wantReach = options.reachability !== false && vulnerabilities.length > 0;
  const wantSnippets = options.snippets !== false;
  let sourceList = [];
  if (wantReach || wantSnippets) {
    if (Array.isArray(options.sourceFiles)) sourceList = options.sourceFiles.filter((x) => x && x.path && x.text != null && reach.isSourceFile(x.path));
    else if (root) sourceList = reach.collectSources(root, options);
    else sourceList = files.filter((x) => x.text != null && reach.isSourceFile(x.path));
  }
  let reachSummary = null;
  if (wantReach) {
    const topLevel = reach.pythonTopLevelFromRoot(root);
    for (const d of dependencies) if (d.binaryTopLevel && d.binaryTopLevel.length) topLevel.set(normalizeName('PyPI', d.name), d.binaryTopLevel);
    reachSummary = reach.annotateReachability(vulnerabilities, { sources: reach.prepareSources(sourceList), byId, db, readFile, options, pythonTopLevel: topLevel });
  }
  findings.push(...vulnerabilityFindings(vulnerabilities, byId, options));
  let snippetMatches = [];
  if (wantSnippets && sourceList.length) {
    const indexes = [];
    if (options.bundledSnippets !== false) indexes.push(snippets.bundledSnippetIndex());
    for (const src of [].concat(options.snippetIndex || [])) {
      try { indexes.push(snippets.loadSnippetIndex(src)); } catch (err) { errors.push({ file: typeof src === 'string' ? src : '(snippet index)', error: err.message }); }
    }
    snippetMatches = snippets.matchSnippets(sourceList, indexes, { threshold: options.snippetThreshold, minMatches: options.snippetMinMatches });
    findings.push(...snippetFindings(snippetMatches));
  }
  const projectLicenses = new Map(graph.roots.map((r) => [r.id, r.license || null]));
  const lic = licenseReport(dependencies, options.licensePolicy, { ...options, byId, projectLicenses });
  findings.push(...lic.findings);
  findings.push(...hygieneFindings(dependencies, byId, graph.roots, options));

  const inactive = new Set(options.inactive || []);
  const kept = findings.filter((f) => !inactive.has(f.rule));
  kept.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.rule < b.rule ? -1 : 1)));
  const summary = {
    dependencies: dependencies.length,
    direct: dependencies.filter((d) => d.direct).length,
    transitive: dependencies.filter((d) => !d.direct).length,
    vulnerable: new Set(vulnerabilities.map((v) => v.dependency)).size,
    vulnerabilities: vulnerabilities.length,
    bySeverity: vulnerabilities.reduce((acc, v) => { acc[v.severity] = (acc[v.severity] || 0) + 1; return acc; }, {}),
    ecosystems: [...new Set(dependencies.map((d) => d.ecosystem))].sort(),
    licenses: lic.summary,
    advisoryCount: db.size,
  };
  if (reachSummary) summary.reachability = reachSummary;
  summary.snippets = snippetMatches.length;
  summary.binaries = binaries.length;
  return { dependencies, graph, vulnerabilities, licenses: lic.licenses, findings: kept, manifests, errors, summary, snippets: snippetMatches, binaries, licenseHints: lic.hints };
}

const LIC_SEVERITY = { permissive: 'INFO', 'weak-copyleft': 'MINOR', 'strong-copyleft': 'MAJOR', 'network-copyleft': 'MAJOR', proprietary: 'MAJOR', unknown: 'MINOR' };

function snippetFindings(matches) {
  return matches.map((m) => {
    const lic = m.license ? normalizeExpression(m.license) : null;
    const cat = lic ? evaluateLicense(lic).category : 'unknown';
    const ranges = m.ranges.map((r) => (r.start === r.end ? String(r.start) : `${r.start}-${r.end}`)).join(', ');
    const comp = `${m.component}${m.version ? `@${m.version}` : ''}`;
    const first = m.ranges[0] || { start: 1, end: 1 };
    const last = m.ranges[m.ranges.length - 1] || first;
    return {
      rule: 'sca:snippet-match', file: m.file, line: first.start, endLine: last.end, function: m.component, severity: LIC_SEVERITY[cat] || 'MINOR',
      message: {
        en: `Lines ${ranges} match ${comp} (${m.componentFile}, license ${lic || 'unknown'}) with ${m.similarity}% similarity; declare the component and keep its license obligations.`,
        ko: `${ranges} 행이 ${comp}(${m.componentFile}, 라이선스 ${lic || '알 수 없음'})와 ${m.similarity}% 일치합니다. 구성 요소를 선언하고 라이선스 의무를 지키세요.`,
      },
      events: m.ranges.map((r, k) => ({
        file: m.file, line: r.start, tag: 'path', main: k === 0,
        text: { en: `Lines ${r.start}-${r.end} match ${m.componentFile}`, ko: `${r.start}-${r.end} 행이 ${m.componentFile} 와 일치합니다` },
      })),
      sca: {
        component: m.component, version: m.version, license: lic, category: cat, purl: m.purl, similarity: m.similarity, fileCoverage: m.fileCoverage,
        ranges: m.ranges, componentFile: m.componentFile, componentRanges: m.componentRanges, origin: m.origin,
        obligations: lic ? licenseObligations(lic).map((o) => o.id) : [],
      },
    };
  });
}

// Binary components become dependency nodes (source: 'binary') unless the
// same package version is already declared by a manifest.
function addBinaryComponents(components, dependencies, graph, options) {
  const declared = new Set(dependencies.map((d) => `${d.ecosystem}|${normalizeName(d.ecosystem, d.name)}|${d.version || ''}`));
  const seen = new Set();
  const ids = [];
  const taken = new Set(dependencies.map((d) => d.id));
  for (const c of components) {
    const key = `${c.ecosystem}|${normalizeName(c.ecosystem, c.name)}|${c.version || ''}`;
    if (declared.has(key) && options.binaryDuplicates !== true) continue;
    const fileKey = `${key}|${c.file}`;
    if (seen.has(fileKey)) continue;
    seen.add(fileKey);
    let id = c.purl;
    if (taken.has(id)) id = `${c.purl}#${c.file}`;
    let k = 2;
    while (taken.has(id)) id = `${c.purl}#${c.file}#${k++}`;
    taken.add(id);
    const lic = c.license ? normalizeExpression(c.license) : null;
    dependencies.push({
      id, purl: c.purl, ecosystem: c.ecosystem, name: c.name, version: c.version, versionSpec: null, matchVersion: c.version,
      direct: true, scope: 'prod', licenses: lic ? [lic] : [], license: lic,
      file: c.file, line: 1, lockFile: null, lockLine: null, manifestFile: c.file, manifestLine: 1, resolved: true, source: 'binary',
      dependencies: [], dependents: [], project: 'project:binaries', registry: null, integrity: null, deprecatedNote: null, rawScope: null, extraIndex: false,
      path: [id], directAncestor: id, binaryFormat: c.format, binaryEvidence: c.evidence || c.format, binaryInner: c.inner || null, binaryTopLevel: c.topLevel || null,
      ...(lic ? { licenseSource: `${c.file}${c.inner ? `!/${c.inner}` : ''}` } : {}),
    });
    ids.push(id);
  }
  if (!ids.length) return;
  graph.roots.push({ id: 'project:binaries', name: 'binaries', version: null, license: null, ecosystem: 'binary', file: components[0].file, dir: '', dependencies: ids, lockFile: null, manifests: [...new Set(components.map((c) => c.file))], locks: [] });
  for (const id of ids) { graph.nodes.push(id); graph.edges.push({ from: 'project:binaries', to: id, kind: 'direct' }); }
}

function safeRead(abs) {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

// ------------------------------------------------------------- contract --

function analyze(files, ctx = {}) {
  const options = { ...((ctx.options && (ctx.options.sca || ctx.options)) || {}) };
  const inactive = ctx.inactive instanceof Set ? [...ctx.inactive] : (ctx.inactive || []);
  const list = (files || []).filter((f) => f && f.path && isManifest(f.path)).map((f) => ({ path: f.path, text: f.text }));
  const seen = new Set(list.map((f) => f.path));
  if (ctx.root && options.discover !== false) {
    try {
      for (const p of discoverFiles(ctx.root, options)) if (!seen.has(p)) { list.push({ path: p, text: null }); seen.add(p); }
    } catch { /* root not readable: use the given files only */ }
  }
  const sourceFiles = (files || []).filter((f) => f && f.path && f.text != null && reach.isSourceFile(f.path)).map((f) => ({ path: f.path, text: f.text }));
  if (!list.length && !sourceFiles.length && !ctx.root) return [];
  const scanOptions = { ...options, root: ctx.root || options.root || null, inactive };
  if (sourceFiles.length || !ctx.root) scanOptions.sourceFiles = sourceFiles;
  const result = scanDependencies(list, scanOptions);
  return result.findings;
}

module.exports = {
  catalog, analyze, scanDependencies, discoverFiles,
  toCycloneDx, toSpdx, toSpdxTagValue, importSbom,
  importOsvDatabase, queryOsv, createAdvisoryDb, defaultDb,
  RULES,
};
