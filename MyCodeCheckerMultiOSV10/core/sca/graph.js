'use strict';

// Combine parsed manifests and lockfiles of one folder + ecosystem into a
// dependency graph: direct vs transitive, scope propagation, edges and the
// shortest path from a direct dependency to every transitive one.

const { toPurl, normalizeName, dirname } = require('./util');
const { analyzeSpec, satisfies, compare } = require('./versions');
const { normalizeExpression } = require('./license');

const SCOPE_ORDER = ['prod', 'optional', 'dev', 'test'];

function groupKey(parsed) {
  if (parsed.kind === 'sbom') return `sbom|${parsed.file}`;
  return `${dirname(parsed.file)}|${parsed.ecosystem}`;
}

function buildGroup(parsedList) {
  const eco = parsedList[0].ecosystem;
  const dir = dirname(parsedList[0].file);
  const manifests = parsedList.filter((p) => p.kind === 'manifest' || p.kind === 'sbom');
  const locks = parsedList.filter((p) => p.kind === 'lock').sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const strongLock = locks.find((l) => !l.weakLock) || null;
  const weakLocks = locks.filter((l) => l.weakLock);
  const norm = (n) => normalizeName(eco, n);

  const directInfo = new Map();
  for (const m of manifests) {
    for (const d of m.deps) {
      const k = d.sbom ? norm(d.name) + '@' + d.version : norm(d.name);
      const prev = directInfo.get(k);
      if (!prev) directInfo.set(k, { ...d, file: m.file });
      else if (SCOPE_ORDER.indexOf(d.scope) < SCOPE_ORDER.indexOf(prev.scope)) prev.scope = d.scope;
    }
  }

  const nodes = new Map(); // local id (purl) -> node
  const keyToId = new Map();
  const project = (manifests.find((m) => m.project && m.project.name) || strongLock || manifests[0] || locks[0] || {}).project || {};
  const rootFile = (manifests[0] || strongLock || locks[0]).file;
  const rootId = `project:${rootFile}`;

  function addNode(d, from, source) {
    const version = d.version ? String(d.version) : null;
    const purl = toPurl(eco, eco === 'PyPI' ? norm(d.name) : d.name, version);
    let node = nodes.get(purl);
    if (!node) {
      const spec = analyzeSpec(eco, d.spec != null ? d.spec : version);
      node = {
        id: purl, purl, ecosystem: eco, name: d.name, version,
        versionSpec: d.spec != null ? String(d.spec) : null,
        matchVersion: version || spec.lower || null,
        direct: false, scope: d.scope || null, scopeFromLock: !!(source === 'lock' && d.scope),
        licenses: d.license ? [d.license] : [], license: null,
        file: from.file, line: d.line || 1,
        lockFile: source === 'lock' ? from.file : null, lockLine: source === 'lock' ? d.line || 1 : null,
        manifestFile: null, manifestLine: null,
        resolved: source === 'lock' || !!version, source,
        dependencies: [], dependents: [], project: rootId,
        registry: d.resolved || null, integrity: d.integrity || null, deprecatedNote: d.deprecated || null,
        rawScope: d.rawScope || null, extraIndex: !!from.extraIndex,
      };
      nodes.set(purl, node);
    }
    keyToId.set(d.key || (d.name + '@' + d.version), purl);
    return node;
  }

  if (strongLock) {
    const lockDirect = strongLock.directFromLock ? new Set(strongLock.directFromLock.map(norm)) : null;
    for (const d of strongLock.deps) {
      if (!d.name) continue;
      const node = addNode(d, strongLock, 'lock');
      const k = norm(d.name);
      let isDirect;
      if (d.direct === true) isDirect = true;
      else if (d.direct === false) isDirect = false;
      else if (directInfo.size) isDirect = directInfo.has(k);
      else if (lockDirect) isDirect = lockDirect.has(k);
      if (isDirect !== undefined) node.direct = node.direct || isDirect;
      else node.directUnknown = true;
    }
    // edges
    for (const d of strongLock.deps) {
      if (!d.name) continue;
      const fromId = keyToId.get(d.key || (d.name + '@' + d.version));
      const node = nodes.get(fromId);
      if (!node) continue;
      const targets = [];
      if (Array.isArray(d.edges)) for (const k of d.edges) { const id = keyToId.get(k); if (id) targets.push(id); }
      else if (Array.isArray(d.requires)) {
        for (const r of d.requires) {
          const cands = [...nodes.values()].filter((n) => norm(n.name) === norm(r.name));
          if (!cands.length) continue;
          let pick = cands.find((c) => r.version && c.version === r.version)
            || cands.find((c) => r.spec && c.version && safeSatisfies(eco, c.version, r.spec))
            || cands.sort((a, b) => compare(eco, b.version || '0', a.version || '0'))[0];
          targets.push(pick.id);
        }
      }
      for (const t of targets) if (t !== node.id && !node.dependencies.includes(t)) node.dependencies.push(t);
    }
  }

  // Manifest entries: annotate lock nodes or create unresolved nodes.
  for (const [k, d] of directInfo) {
    const matches = [...nodes.values()].filter((n) => norm(n.name) === k);
    const directMatches = matches.filter((n) => n.direct);
    if (strongLock && matches.length) {
      const chosen = directMatches.length ? directMatches
        : matches.filter((n) => d.spec && n.version && safeSatisfies(eco, n.version, d.spec)).slice(0, 1);
      for (const n of (chosen.length ? chosen : matches.slice(0, 1))) {
        n.direct = true;
        n.manifestFile = d.file;
        n.manifestLine = d.line || 1;
        if (d.spec != null) n.versionSpec = String(d.spec);
        if (!n.scopeFromLock && d.scope) n.scope = d.scope;
        if (d.license && !n.licenses.length) n.licenses.push(d.license);
      }
      continue;
    }
    const node = addNode(d, { file: d.file, extraIndex: manifests.find((m) => m.file === d.file)?.extraIndex }, d.sbom ? 'sbom' : 'manifest');
    node.direct = d.direct !== false;
    node.manifestFile = d.file;
    node.manifestLine = d.line || 1;
    // Version pinned by a lock elsewhere (a Cargo workspace root's Cargo.lock).
    if (d.lockFile && d.version) { node.lockFile = d.lockFile; node.lockLine = d.lockLine || 1; node.resolved = true; }
    node.scope = d.scope || node.scope;
    if (d.edges && d.sbom) node.sbomEdges = d.edges;
  }

  // SBOM edges are purl/bom-ref based.
  for (const n of nodes.values()) {
    if (!n.sbomEdges) continue;
    for (const ref of n.sbomEdges) if (nodes.has(ref) && !n.dependencies.includes(ref)) n.dependencies.push(ref);
    delete n.sbomEdges;
  }

  // Weak locks (go.sum) contribute modules the manifest does not list.
  for (const wl of weakLocks) {
    for (const d of wl.deps) {
      const k = norm(d.name);
      if ([...nodes.values()].some((n) => norm(n.name) === k)) continue;
      const node = addNode(d, wl, 'lock');
      node.direct = false;
      node.fromWeakLock = true;
    }
  }

  // dependents + roots
  for (const n of nodes.values()) for (const t of n.dependencies) { const c = nodes.get(t); if (c && !c.dependents.includes(n.id)) c.dependents.push(n.id); }
  for (const n of nodes.values()) {
    if (n.directUnknown) { n.direct = n.dependents.length === 0; delete n.directUnknown; }
  }

  // scope propagation + shortest path from a direct dependency
  const assigned = new Map();
  const parent = new Map();
  for (const scope of SCOPE_ORDER) {
    const queue = [...nodes.values()].filter((n) => n.direct && (n.scope || 'prod') === scope).map((n) => n.id);
    for (const id of queue) if (!assigned.has(id)) { assigned.set(id, scope); parent.set(id, null); }
    while (queue.length) {
      const id = queue.shift();
      const n = nodes.get(id);
      for (const t of n.dependencies) {
        if (assigned.has(t)) continue;
        assigned.set(t, scope === 'optional' ? 'optional' : scope);
        parent.set(t, id);
        queue.push(t);
      }
    }
  }
  for (const n of nodes.values()) {
    if (!n.scopeFromLock) n.scope = assigned.get(n.id) || n.scope || 'prod';
    if (n.scope === 'peer') n.scope = 'optional';
    const path = [];
    let cur = n.id;
    let guard = 0;
    while (cur && guard++ < 200) { path.unshift(cur); cur = parent.get(cur); }
    n.path = parent.has(n.id) ? path : [n.id];
    n.directAncestor = n.path[0];
    const lic = n.licenses.find(Boolean);
    n.license = lic ? normalizeExpression(lic) : null;
  }
  const root = {
    id: rootId, name: project.name || dir || '.', version: project.version || null, license: project.license ? normalizeExpression(project.license) : null,
    ecosystem: eco, file: rootFile, dir, dependencies: [...nodes.values()].filter((n) => n.direct).map((n) => n.id),
    lockFile: strongLock ? strongLock.file : null, manifests: manifests.map((m) => m.file), locks: locks.map((l) => l.file),
  };
  return { root, nodes: [...nodes.values()] };
}

function safeSatisfies(eco, v, spec) {
  try { return satisfies(eco, v, spec); } catch { return false; }
}

function buildGraph(parsedFiles) {
  const groups = new Map();
  for (const p of parsedFiles) {
    if (!p || !p.deps) continue;
    if (p.kind === 'sbom') {
      // SBOM components may span ecosystems: one group per ecosystem.
      const byEco = new Map();
      for (const d of p.deps) {
        if (!byEco.has(d.ecosystem)) byEco.set(d.ecosystem, []);
        byEco.get(d.ecosystem).push({ ...d, sbom: true });
      }
      for (const [eco, deps] of byEco) groups.set(`sbom|${p.file}|${eco}`, [{ ...p, ecosystem: eco, deps }]);
      continue;
    }
    const k = groupKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const roots = [];
  const all = [];
  for (const list of groups.values()) {
    if (!list.some((p) => p.deps.length) && !list.some((p) => p.kind === 'manifest')) continue;
    const { root, nodes } = buildGroup(list);
    roots.push(root);
    all.push({ root, nodes });
  }
  // Make ids globally unique when the same purl appears in several projects.
  const count = new Map();
  for (const g of all) for (const n of g.nodes) count.set(n.id, (count.get(n.id) || 0) + 1);
  const dependencies = [];
  for (const g of all) {
    const remap = new Map();
    for (const n of g.nodes) remap.set(n.id, count.get(n.id) > 1 ? `${n.id}#${g.root.file}` : n.id);
    for (const n of g.nodes) {
      n.id = remap.get(n.id);
      n.dependencies = n.dependencies.map((x) => remap.get(x) || x);
      n.dependents = n.dependents.map((x) => remap.get(x) || x);
      n.path = n.path.map((x) => remap.get(x) || x);
      n.directAncestor = remap.get(n.directAncestor) || n.directAncestor;
      dependencies.push(n);
    }
    g.root.dependencies = g.root.dependencies.map((x) => remap.get(x) || x);
  }
  const edges = [];
  for (const r of roots) for (const t of r.dependencies) edges.push({ from: r.id, to: t, kind: 'direct' });
  for (const n of dependencies) for (const t of n.dependencies) edges.push({ from: n.id, to: t, kind: 'transitive' });
  return { dependencies, graph: { roots, nodes: dependencies.map((n) => n.id), edges } };
}

module.exports = { buildGraph };
