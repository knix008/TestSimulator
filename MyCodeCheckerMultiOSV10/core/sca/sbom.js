'use strict';

// SBOM export (CycloneDX 1.5 JSON with a vulnerabilities section, SPDX 2.3
// JSON and SPDX 2.3 tag-value) and import (CycloneDX JSON / XML, SPDX JSON /
// tag-value) as a dependency list.

const { toPurl, parsePurl, uuidFrom, tryJson, lineOf, normalizeName } = require('./util');
const { parseXml, walk, childText, child, children } = require('./xml');
const { parseExpression, licenseIds, normalizeExpression } = require('./license');

const TOOL = { vendor: 'MyCodeChecker', name: 'MyCodeChecker SCA', version: '1.0.0' };

function uniqueComponents(result) {
  const map = new Map();
  for (const d of result.dependencies || []) {
    const key = d.purl;
    const prev = map.get(key);
    if (!prev) map.set(key, { ...d, refs: [d.id], dependencyIds: new Set(d.dependencies) });
    else {
      prev.refs.push(d.id);
      for (const x of d.dependencies) prev.dependencyIds.add(x);
      if (d.direct) prev.direct = true;
      if (d.scope === 'prod') prev.scope = 'prod';
    }
  }
  return map;
}

function idToPurl(result) {
  const m = new Map();
  for (const d of result.dependencies || []) m.set(d.id, d.purl);
  return m;
}

function cdxLicenses(expr) {
  if (!expr) return undefined;
  const ast = parseExpression(expr);
  if (!ast) return undefined;
  if (ast.type === 'license' && ast.known && !/^LicenseRef-/.test(ast.id)) return [{ license: { id: ast.id } }];
  if (ast.type === 'license') return [{ license: { name: ast.id } }];
  return [{ expression: normalizeExpression(expr) }];
}

function cdxRatingMethod(v) {
  return { '3.1': 'CVSSv31', '3.0': 'CVSSv3', '4.0': 'CVSSv4', '2.0': 'CVSSv2' }[v] || 'other';
}

function toCycloneDx(result, options = {}) {
  const components = uniqueComponents(result);
  const purlOf = idToPurl(result);
  const timestamp = options.timestamp || new Date().toISOString();
  const roots = (result.graph && result.graph.roots) || [];
  const appName = options.name || (roots[0] && roots[0].name) || 'application';
  const appRef = `app:${appName}`;
  const bom = {
    $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${options.serialNumber || uuidFrom(`${appName}|${timestamp}|${components.size}`)}`,
    version: 1,
    metadata: {
      timestamp,
      tools: { components: [{ type: 'application', author: TOOL.vendor, name: TOOL.name, version: TOOL.version }] },
      component: { type: 'application', 'bom-ref': appRef, name: appName, ...(options.version ? { version: options.version } : {}) },
    },
    components: [],
    dependencies: [],
  };
  for (const c of components.values()) {
    const p = parsePurl(c.purl) || {};
    const comp = {
      type: 'library',
      'bom-ref': c.purl,
      name: p.name || c.name,
      ...(p.namespace && c.ecosystem !== 'vcpkg' ? { group: p.namespace } : {}),
      ...(c.version ? { version: c.version } : {}),
      scope: c.scope === 'optional' ? 'optional' : c.scope === 'dev' || c.scope === 'test' ? 'excluded' : 'required',
      purl: c.purl,
    };
    const lic = cdxLicenses(c.license);
    if (lic) comp.licenses = lic;
    if (c.integrity && /^sha(256|384|512)-/.test(c.integrity)) {
      const [alg, b64] = c.integrity.split('-');
      comp.hashes = [{ alg: alg.replace('sha', 'SHA-'), content: Buffer.from(b64, 'base64').toString('hex') }];
    }
    comp.properties = [
      { name: 'mcc:ecosystem', value: c.ecosystem },
      { name: 'mcc:direct', value: String(!!c.direct) },
      { name: 'mcc:scope', value: c.scope || 'prod' },
      { name: 'mcc:declaredIn', value: `${c.manifestFile || c.file}:${c.manifestLine || c.line}` },
    ];
    if (c.versionSpec && c.versionSpec !== c.version) comp.properties.push({ name: 'mcc:versionSpec', value: c.versionSpec });
    bom.components.push(comp);
  }
  const directRefs = new Set();
  for (const r of roots) for (const id of r.dependencies) directRefs.add(purlOf.get(id) || id);
  bom.dependencies.push({ ref: appRef, dependsOn: [...directRefs] });
  for (const c of components.values()) {
    bom.dependencies.push({ ref: c.purl, dependsOn: [...new Set([...c.dependencyIds].map((x) => purlOf.get(x) || x))].filter((x) => x !== c.purl) });
  }
  const vulns = new Map();
  for (const v of result.vulnerabilities || []) {
    let entry = vulns.get(v.id);
    if (!entry) {
      entry = {
        'bom-ref': `vuln:${v.id}`,
        id: v.id,
        source: sourceFor(v.id),
        references: (v.aliases || []).map((a) => ({ id: a, source: sourceFor(a) })),
        ratings: v.score != null || v.severity ? [{
          ...(v.score != null ? { score: v.score } : {}),
          severity: String(v.severity || 'unknown').toLowerCase(),
          method: v.vector ? cdxRatingMethod(v.cvssVersion) : 'other',
          ...(v.vector ? { vector: v.vector } : {}),
        }] : [],
        cwes: (v.cwes || []).map((c) => Number(String(c).replace(/^CWE-/, ''))).filter((n) => Number.isFinite(n)),
        description: v.summary,
        ...(v.suggestedUpgrade ? { recommendation: `Upgrade ${v.package} to ${v.suggestedUpgrade} or later.` } : { recommendation: 'No fixed version is known; consider replacing the component.' }),
        advisories: (v.references || []).slice(0, 5).map((url) => ({ url })),
        affects: [],
      };
      vulns.set(v.id, entry);
    }
    if (!entry.affects.some((a) => a.ref === v.purl)) entry.affects.push({ ref: v.purl, versions: [{ version: v.version, status: 'affected' }] });
  }
  if (vulns.size) bom.vulnerabilities = [...vulns.values()];
  return bom;
}

function sourceFor(id) {
  if (/^GHSA-/.test(id)) return { name: 'GitHub Advisories', url: `https://github.com/advisories/${id}` };
  if (/^CVE-/.test(id)) return { name: 'NVD', url: `https://nvd.nist.gov/vuln/detail/${id}` };
  if (/^RUSTSEC-/.test(id)) return { name: 'RustSec', url: `https://rustsec.org/advisories/${id}.html` };
  if (/^GO-/.test(id)) return { name: 'Go Vulnerability Database', url: `https://pkg.go.dev/vuln/${id}` };
  return { name: 'OSV', url: `https://osv.dev/vulnerability/${id}` };
}

function spdxId(s) {
  return `SPDXRef-${String(s).replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200)}`;
}

function spdxLicense(expr) {
  if (!expr) return 'NOASSERTION';
  const ast = parseExpression(expr);
  if (!ast) return 'NOASSERTION';
  const ids = licenseIds(ast);
  if (ids.some((x) => /\s/.test(x))) return 'NOASSERTION';
  return normalizeExpression(expr);
}

function toSpdx(result, options = {}) {
  const components = uniqueComponents(result);
  const purlOf = idToPurl(result);
  const created = options.timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const roots = (result.graph && result.graph.roots) || [];
  const name = options.name || (roots[0] && roots[0].name) || 'application';
  const ns = options.namespace || `https://mycodechecker.local/spdx/${encodeURIComponent(name)}-${uuidFrom(`${name}|${created}`)}`;
  const rootId = spdxId(`Root-${name}`);
  const used = new Set([rootId]);
  const idFor = new Map();
  for (const c of components.values()) {
    let id = spdxId(`Package-${c.ecosystem}-${c.name}-${c.version || 'unversioned'}`);
    let k = 2;
    while (used.has(id)) id = `${spdxId(`Package-${c.ecosystem}-${c.name}-${c.version || 'unversioned'}`)}-${k++}`;
    used.add(id);
    idFor.set(c.purl, id);
  }
  const doc = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name,
    documentNamespace: ns,
    creationInfo: { created, creators: [`Tool: ${TOOL.name.replace(/\s+/g, '-')}-${TOOL.version}`, `Organization: ${TOOL.vendor}`] },
    packages: [{
      name, SPDXID: rootId, versionInfo: options.version || (roots[0] && roots[0].version) || undefined,
      downloadLocation: 'NOASSERTION', filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION', licenseDeclared: spdxLicense(roots[0] && roots[0].license), copyrightText: 'NOASSERTION',
      primaryPackagePurpose: 'APPLICATION',
    }],
    relationships: [{ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: rootId }],
  };
  if (!doc.packages[0].versionInfo) delete doc.packages[0].versionInfo;
  for (const c of components.values()) {
    const pkg = {
      name: c.name, SPDXID: idFor.get(c.purl),
      ...(c.version ? { versionInfo: c.version } : {}),
      downloadLocation: c.registry && /^https?:/.test(c.registry) ? c.registry : 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: spdxLicense(c.license),
      copyrightText: 'NOASSERTION',
      primaryPackagePurpose: 'LIBRARY',
      externalRefs: [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: c.purl }],
    };
    if (c.integrity && /^sha(256|512|384|1)-/.test(c.integrity)) {
      const [alg, b64] = c.integrity.split('-');
      pkg.checksums = [{ algorithm: alg.toUpperCase().replace('SHA', 'SHA'), checksumValue: Buffer.from(b64, 'base64').toString('hex') }];
    }
    const vs = (result.vulnerabilities || []).filter((v) => v.purl === c.purl);
    for (const v of vs) {
      pkg.externalRefs.push({ referenceCategory: 'SECURITY', referenceType: 'advisory', referenceLocator: sourceFor(v.id).url });
    }
    doc.packages.push(pkg);
  }
  for (const r of roots) {
    for (const id of r.dependencies) {
      const p = purlOf.get(id);
      const comp = p && components.get(p);
      if (!comp) continue;
      const devish = comp.scope === 'dev' || comp.scope === 'test';
      doc.relationships.push(devish
        ? { spdxElementId: idFor.get(p), relationshipType: comp.scope === 'test' ? 'TEST_DEPENDENCY_OF' : 'DEV_DEPENDENCY_OF', relatedSpdxElement: rootId }
        : { spdxElementId: rootId, relationshipType: 'DEPENDS_ON', relatedSpdxElement: idFor.get(p) });
    }
  }
  const seen = new Set();
  for (const c of components.values()) {
    for (const x of c.dependencyIds) {
      const p = purlOf.get(x);
      if (!p || p === c.purl || !idFor.has(p)) continue;
      const key = `${c.purl}>${p}`;
      if (seen.has(key)) continue;
      seen.add(key);
      doc.relationships.push({ spdxElementId: idFor.get(c.purl), relationshipType: 'DEPENDS_ON', relatedSpdxElement: idFor.get(p) });
    }
  }
  return doc;
}

function tv(v) {
  const s = String(v);
  return /\n/.test(s) ? `<text>${s}</text>` : s;
}

function toSpdxTagValue(result, options = {}) {
  const doc = toSpdx(result, options);
  const out = [
    `SPDXVersion: ${doc.spdxVersion}`,
    `DataLicense: ${doc.dataLicense}`,
    `SPDXID: ${doc.SPDXID}`,
    `DocumentName: ${tv(doc.name)}`,
    `DocumentNamespace: ${doc.documentNamespace}`,
    ...doc.creationInfo.creators.map((c) => `Creator: ${c}`),
    `Created: ${doc.creationInfo.created}`,
    '',
  ];
  for (const p of doc.packages) {
    out.push(`PackageName: ${tv(p.name)}`, `SPDXID: ${p.SPDXID}`);
    if (p.versionInfo) out.push(`PackageVersion: ${tv(p.versionInfo)}`);
    out.push(`PackageDownloadLocation: ${p.downloadLocation}`, `FilesAnalyzed: ${p.filesAnalyzed}`);
    if (p.primaryPackagePurpose) out.push(`PrimaryPackagePurpose: ${p.primaryPackagePurpose}`);
    for (const c of p.checksums || []) out.push(`PackageChecksum: ${c.algorithm}: ${c.checksumValue}`);
    out.push(`PackageLicenseConcluded: ${p.licenseConcluded}`, `PackageLicenseDeclared: ${p.licenseDeclared}`, `PackageCopyrightText: ${p.copyrightText}`);
    for (const r of p.externalRefs || []) out.push(`ExternalRef: ${r.referenceCategory} ${r.referenceType} ${r.referenceLocator}`);
    out.push('');
  }
  for (const r of doc.relationships) out.push(`Relationship: ${r.spdxElementId} ${r.relationshipType} ${r.relatedSpdxElement}`);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- import --

function depFromPurl(purl, extra = {}) {
  const p = parsePurl(purl);
  if (!p) return null;
  return { ecosystem: p.ecosystem, name: p.fullName, version: p.version, spec: p.version, scope: 'prod', direct: true, purl: toPurl(p.ecosystem, p.fullName, p.version), ...extra };
}

function parseCycloneDxJson(doc, file) {
  const deps = [];
  const refToPurl = new Map();
  const list = [];
  const collect = (arr, owner) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((c, k) => {
      list.push({ c, line: lineOf(arr, k) });
      if (c && c.components) collect(c.components, c);
    });
    void owner;
  };
  collect(doc.components);
  for (const { c, line } of list) {
    if (!c || !c.purl) continue;
    const lic = (c.licenses || []).map((l) => l.expression || (l.license && (l.license.id || l.license.name))).filter(Boolean);
    const d = depFromPurl(c.purl, { line, license: lic.length ? lic.join(' AND ') : undefined, scope: c.scope === 'optional' ? 'optional' : c.scope === 'excluded' ? 'dev' : 'prod' });
    if (!d) continue;
    refToPurl.set(c['bom-ref'] || c.purl, d.purl);
    deps.push(d);
  }
  const app = doc.metadata && doc.metadata.component && doc.metadata.component['bom-ref'];
  const directRefs = new Set();
  let hasGraph = false;
  for (const dep of doc.dependencies || []) {
    hasGraph = true;
    const from = refToPurl.get(dep.ref);
    const to = (dep.dependsOn || []).map((r) => refToPurl.get(r)).filter(Boolean);
    if (dep.ref === app) for (const t of to) directRefs.add(t);
    const d = deps.find((x) => x.purl === from);
    if (d) d.edges = to;
  }
  if (hasGraph && app) for (const d of deps) d.direct = directRefs.has(d.purl);
  return { ecosystem: 'sbom', kind: 'sbom', file, deps, format: `CycloneDX ${doc.specVersion || ''}`.trim(), project: { name: doc.metadata && doc.metadata.component && doc.metadata.component.name } };
}

function parseCycloneDxXml(text, file) {
  const doc = parseXml(text);
  const deps = [];
  walk(doc, (el) => {
    if (el.local !== 'component') return;
    const purl = childText(el, 'purl');
    if (!purl) return;
    const lic = children(child(el, 'licenses'), 'license').map((l) => childText(l, 'id') || childText(l, 'name')).filter(Boolean);
    const exp = childText(child(el, 'licenses'), 'expression');
    const d = depFromPurl(purl, { line: el.line, license: exp || (lic.length ? lic.join(' AND ') : undefined) });
    if (d) deps.push(d);
  });
  return { ecosystem: 'sbom', kind: 'sbom', file, deps, format: 'CycloneDX XML' };
}

function parseSpdxJson(doc, file) {
  const deps = [];
  const idToPurlMap = new Map();
  const described = new Set((doc.documentDescribes || []).concat((doc.relationships || []).filter((r) => r.relationshipType === 'DESCRIBES').map((r) => r.relatedSpdxElement)));
  (doc.packages || []).forEach((p, k) => {
    if (described.has(p.SPDXID)) return;
    const ref = (p.externalRefs || []).find((r) => r.referenceType === 'purl');
    const lic = p.licenseDeclared && p.licenseDeclared !== 'NOASSERTION' && p.licenseDeclared !== 'NONE' ? p.licenseDeclared : (p.licenseConcluded && !/^(NOASSERTION|NONE)$/.test(p.licenseConcluded) ? p.licenseConcluded : undefined);
    const d = ref ? depFromPurl(ref.referenceLocator, { line: lineOf(doc.packages, k), license: lic }) : null;
    if (!d) return;
    idToPurlMap.set(p.SPDXID, d.purl);
    deps.push(d);
  });
  applySpdxRelationships(deps, idToPurlMap, described, doc.relationships || []);
  return { ecosystem: 'sbom', kind: 'sbom', file, deps, format: doc.spdxVersion || 'SPDX', project: { name: doc.name } };
}

function applySpdxRelationships(deps, idMap, described, rels) {
  const byPurl = new Map(deps.map((d) => [d.purl, d]));
  const direct = new Set();
  let any = false;
  for (const r of rels) {
    const type = r.relationshipType;
    let from = r.spdxElementId;
    let to = r.relatedSpdxElement;
    if (/^(DEPENDENCY_OF|DEV_DEPENDENCY_OF|TEST_DEPENDENCY_OF|OPTIONAL_DEPENDENCY_OF|BUILD_DEPENDENCY_OF|RUNTIME_DEPENDENCY_OF)$/.test(type)) [from, to] = [to, from];
    else if (!/^(DEPENDS_ON|CONTAINS)$/.test(type)) continue;
    any = true;
    const toPurlV = idMap.get(to);
    if (!toPurlV) continue;
    if (described.has(from)) {
      direct.add(toPurlV);
      const d = byPurl.get(toPurlV);
      if (d && /DEV_/.test(type)) d.scope = 'dev';
      if (d && /TEST_/.test(type)) d.scope = 'test';
      continue;
    }
    const d = byPurl.get(idMap.get(from));
    if (d) (d.edges = d.edges || []).push(toPurlV);
  }
  if (any && direct.size) for (const d of deps) d.direct = direct.has(d.purl);
}

function parseSpdxTagValue(text, file) {
  const deps = [];
  const idMap = new Map();
  const described = new Set();
  const rels = [];
  let cur = null;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const flush = () => {
    if (cur && cur.purl) {
      const d = depFromPurl(cur.purl, { line: cur.line, license: cur.license });
      if (d) { idMap.set(cur.id, d.purl); deps.push(d); }
    }
    cur = null;
  };
  for (let n = 0; n < lines.length; n++) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(lines[n]);
    if (!m) continue;
    const [, tag, value] = m;
    if (tag === 'PackageName') { flush(); cur = { line: n + 1 }; }
    else if (tag === 'SPDXID' && cur) cur.id = value.trim();
    else if (tag === 'PackageLicenseDeclared' && cur && !/^(NOASSERTION|NONE)$/.test(value.trim())) cur.license = value.trim();
    else if (tag === 'ExternalRef' && cur) {
      const parts = value.trim().split(/\s+/);
      if (parts[1] === 'purl') cur.purl = parts[2];
    } else if (tag === 'Relationship') {
      const [a, type, b] = value.trim().split(/\s+/);
      if (type === 'DESCRIBES') described.add(b);
      rels.push({ spdxElementId: a, relationshipType: type, relatedSpdxElement: b });
    }
  }
  flush();
  for (const id of described) {
    const p = idMap.get(id);
    if (p) { const k = deps.findIndex((d) => d.purl === p); if (k >= 0) deps.splice(k, 1); }
  }
  applySpdxRelationships(deps, idMap, described, rels);
  return { ecosystem: 'sbom', kind: 'sbom', file, deps, format: 'SPDX tag-value' };
}

function parseSbomFile(text, file) {
  const s = String(text).replace(/^﻿/, '');
  if (/^\s*</.test(s)) {
    if (/cyclonedx/i.test(s.slice(0, 2000))) return parseCycloneDxXml(s, file);
    return null;
  }
  if (/^\s*SPDXVersion:/m.test(s.slice(0, 4000))) return parseSpdxTagValue(s, file);
  const doc = tryJson(s);
  if (!doc || typeof doc !== 'object') return null;
  if (doc.bomFormat === 'CycloneDX') return parseCycloneDxJson(doc, file);
  if (doc.spdxVersion) return parseSpdxJson(doc, file);
  return null;
}

// Public import helper: returns the dependency list of an SBOM text.
function importSbom(text, file = 'sbom.json') {
  const parsed = parseSbomFile(text, file);
  if (!parsed) throw new Error('Unrecognised SBOM format (expected CycloneDX JSON/XML or SPDX JSON/tag-value)');
  return parsed;
}

module.exports = { toCycloneDx, toSpdx, toSpdxTagValue, parseSbomFile, importSbom, normalizeName };
