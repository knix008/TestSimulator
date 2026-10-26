'use strict';

// Architecture / dependency rules (contract: core/ENGINE_CONTRACT.md).
//
//   arch:cycle                  cycles between modules / packages (always on)
//   arch:layer-violation        ctx.options.arch.layers = [{ name, pattern }] top -> bottom,
//                               ctx.options.arch.forbidden = [{ from, to, message }]
//   arch:unstable-dependency    ctx.options.arch.unstableDependency = true | { margin }
//   arch:too-many-dependencies  ctx.options.arch.maxDependencies = N (fan-out limit)
//
// Without configuration only arch:cycle runs. dependencyGraph(files, options)
// returns { nodes, edges } for a graph view (see graph.js for node identities).

const { buildGraph } = require('./graph');

const LANGS = ['js', 'ts', 'py', 'java', 'kt', 'cs', 'go', 'php', 'rb', 'c', 'cpp'];

const RULES = [
  {
    key: 'arch:cycle', severity: 'MAJOR', debtMin: 60, tags: ['architecture', 'design', 'cycle'],
    name: { en: 'Modules and packages should not depend on each other in a cycle', ko: '모듈과 패키지는 서로 순환 의존하면 안 됩니다' },
    why: { en: 'A dependency cycle ties all its modules together: none can be understood, tested, built or released alone, and changes ripple around the cycle.', ko: '의존 순환은 그 안의 모듈을 하나로 묶습니다. 어느 모듈도 따로 이해하고 테스트하고 빌드하고 배포할 수 없으며 변경이 순환을 따라 퍼집니다.' },
    fix: { en: 'Break the cycle: move the shared part into a lower module, or invert one dependency through an interface.', ko: '공통 부분을 아래 모듈로 옮기거나 인터페이스로 의존 하나를 뒤집어 순환을 끊습니다.' },
  },
  {
    key: 'arch:layer-violation', severity: 'MAJOR', debtMin: 30, tags: ['architecture', 'design', 'layers'],
    name: { en: 'Dependencies should follow the configured layers and rules', ko: '의존 관계는 설정한 계층과 규칙을 따라야 합니다' },
    why: { en: 'A lower layer that depends on a higher one, or a dependency the architecture forbids, erodes the intended structure and couples parts that should change independently.', ko: '아래 계층이 위 계층에 의존하거나 아키텍처가 금지한 의존이 생기면 의도한 구조가 무너지고 따로 바뀌어야 할 부분이 묶입니다.' },
    fix: { en: 'Move the code to the right layer, or invert the dependency through an interface owned by the lower layer.', ko: '코드를 맞는 계층으로 옮기거나 아래 계층이 가진 인터페이스로 의존을 뒤집습니다.' },
  },
  {
    key: 'arch:unstable-dependency', severity: 'MINOR', debtMin: 30, tags: ['architecture', 'design', 'stability'],
    name: { en: 'Modules should depend on more stable modules', ko: '모듈은 더 안정적인 모듈에 의존해야 합니다' },
    why: { en: 'By the Stable Dependencies Principle a module should only depend on modules that are more stable (lower instability I = Ce / (Ca + Ce)) than itself; otherwise frequent changes in the dependency hit a module that many others rely on.', ko: '안정 의존 원칙에 따르면 모듈은 자신보다 더 안정적인(불안정도 I = Ce / (Ca + Ce)가 낮은) 모듈에만 의존해야 합니다. 그렇지 않으면 자주 바뀌는 의존 대상이 많은 모듈이 기대는 모듈에 영향을 줍니다.' },
    fix: { en: 'Depend on an abstraction in a stable module, or reduce the outgoing dependencies of the target.', ko: '안정적인 모듈의 추상화에 의존하거나 대상 모듈의 외부 의존을 줄입니다.' },
  },
  {
    key: 'arch:too-many-dependencies', severity: 'MINOR', debtMin: 30, tags: ['architecture', 'design', 'coupling'],
    name: { en: 'Modules should not depend on too many other modules', ko: '모듈이 너무 많은 다른 모듈에 의존하면 안 됩니다' },
    why: { en: 'A high fan-out (efferent coupling Ce) means the module breaks whenever any of its many dependencies changes and is hard to reuse or test.', ko: '팬아웃(원심 결합도 Ce)이 크면 많은 의존 대상 중 하나만 바뀌어도 모듈이 깨지기 쉽고 재사용과 테스트가 어렵습니다.' },
    fix: { en: 'Split the module by responsibility or put a facade in front of related dependencies.', ko: '책임별로 모듈을 나누거나 관련 의존 앞에 퍼사드를 둡니다.' },
  },
];

function catalog() {
  return RULES.map((r) => ({
    key: r.key, langs: LANGS.slice(), type: 'CODE_SMELL', severity: r.severity, debtMin: r.debtMin,
    tags: r.tags, name: r.name, why: r.why, fix: r.fix, category: 'Architecture', checker: r.key.slice(5).toUpperCase().replace(/-/g, '_'), cwe: '',
  }));
}

// ---------------------------------------------------------------- globs

const globCache = new Map();
function globToRegExp(glob) {
  const g = String(glob);
  if (globCache.has(g)) return globCache.get(g);
  let re = '';
  let i = 0;
  let inGroup = false;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i += 2;
        if (g[i] === '/') { re += '(?:.*/)?'; i++; } else re += '.*';
        continue;
      }
      re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { re += '(?:'; inGroup = true; } else if (c === '}' && inGroup) { re += ')'; inGroup = false; } else if (c === ',' && inGroup) re += '|';
    else if ('\\^$+.()|[]'.includes(c)) re += `\\${c}`;
    else re += c;
    i++;
  }
  const out = new RegExp(`^${re}$`);
  globCache.set(g, out);
  return out;
}

function globMatch(glob, value) {
  if (glob == null || value == null) return false;
  try { return globToRegExp(glob).test(String(value)); } catch (_) { return false; }
}

// ---------------------------------------------------------------- helpers

function archOptions(options) {
  return (options && options.arch) || {};
}

function graphFor(files, options) {
  const a = archOptions(options);
  const cfam = (options && options.cfamily) || {};
  return buildGraph(files, { includeDirs: a.includeDirs || (options && options.includeDirs) || cfam.includeDirs || [], goModule: a.goModule || (options && options.goModule) });
}

// Tarjan's strongly connected components, iterative.
function sccs(nodeIds, adj) {
  let index = 0;
  const idx = new Map(); const low = new Map(); const on = new Set(); const st = []; const out = [];
  for (const start of nodeIds) {
    if (idx.has(start)) continue;
    const work = [{ v: start, it: 0, succ: [...(adj.get(start) || [])] }];
    idx.set(start, index); low.set(start, index); index++; st.push(start); on.add(start);
    while (work.length) {
      const top = work[work.length - 1];
      if (top.it < top.succ.length) {
        const w = top.succ[top.it++];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++; st.push(w); on.add(w);
          work.push({ v: w, it: 0, succ: [...(adj.get(w) || [])] });
        } else if (on.has(w)) low.set(top.v, Math.min(low.get(top.v), idx.get(w)));
        continue;
      }
      work.pop();
      if (work.length) { const p = work[work.length - 1].v; low.set(p, Math.min(low.get(p), low.get(top.v))); }
      if (low.get(top.v) === idx.get(top.v)) {
        const comp = [];
        let w;
        do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== top.v);
        out.push(comp);
      }
    }
  }
  return out;
}

// Shortest cycle through `start` inside the component.
function cycleThrough(start, members, adj) {
  const prev = new Map();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const v = queue.shift();
    for (const w of [...(adj.get(v) || [])].sort()) {
      if (!members.has(w)) continue;
      if (w === start) {
        const path = [v];
        let p = v;
        while (p !== start) { p = prev.get(p); path.push(p); }
        path.reverse();
        path.push(start);
        return path;
      }
      if (!seen.has(w)) { seen.add(w); prev.set(w, v); queue.push(w); }
    }
  }
  return [start, start];
}

function layerIndex(layers, values) {
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l || !l.pattern) continue;
    const pats = Array.isArray(l.pattern) ? l.pattern : [l.pattern];
    if (values.some((v) => pats.some((p) => globMatch(p, v)))) return i;
  }
  return -1;
}

function text(msg, fallbackEn, fallbackKo) {
  if (msg && typeof msg === 'object') return { en: msg.en || msg.ko || fallbackEn, ko: msg.ko || msg.en || fallbackKo };
  if (typeof msg === 'string' && msg) return { en: msg, ko: msg };
  return { en: fallbackEn, ko: fallbackKo };
}

// ---------------------------------------------------------------- analysis

function analyze(files, ctx = {}) {
  const inactive = (ctx && ctx.inactive) || new Set();
  const options = (ctx && ctx.options) || {};
  const a = archOptions(options);
  const on = (k) => !inactive.has(k);
  const layers = Array.isArray(a.layers) ? a.layers.filter((l) => l && l.pattern) : [];
  const forbidden = Array.isArray(a.forbidden) ? a.forbidden.filter((r) => r && r.from && r.to) : [];
  const wantCycle = on('arch:cycle');
  const wantLayer = on('arch:layer-violation') && (layers.length > 0 || forbidden.length > 0);
  const unstableCfg = a.unstableDependency;
  const wantUnstable = on('arch:unstable-dependency') && !!unstableCfg;
  const maxDeps = Number(a.maxDependencies != null ? a.maxDependencies : a.maxFanOut);
  const wantTooMany = on('arch:too-many-dependencies') && Number.isFinite(maxDeps) && maxDeps >= 0 && (a.maxDependencies != null || a.maxFanOut != null);
  if (!wantCycle && !wantLayer && !wantUnstable && !wantTooMany) return [];
  let g;
  try {
    g = graphFor(files, options);
  } catch (err) {
    if (ctx && ctx.warnings) ctx.warnings.push({ rule: 'arch', message: String(err && err.message) });
    return [];
  }
  const findings = [];
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
  const edgeOf = new Map(g.edges.map((e) => [`${e.from}\u0000${e.to}`, e]));
  const adj = new Map();
  for (const e of g.edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from).add(e.to);
  }

  if (wantCycle) {
    for (const comp of sccs(g.nodes.map((n) => n.id), adj)) {
      if (comp.length < 2) continue;
      const members = new Set(comp);
      const start = comp.slice().sort((x, y) => {
        const fx = nodeById.get(x).file; const fy = nodeById.get(y).file;
        return fx < fy ? -1 : fx > fy ? 1 : x < y ? -1 : x > y ? 1 : 0;
      })[0];
      const path = cycleThrough(start, members, adj);
      const steps = [];
      for (let i = 0; i + 1 < path.length; i++) steps.push(edgeOf.get(`${path[i]}\u0000${path[i + 1]}`));
      const first = steps[0];
      if (!first) continue;
      const chain = path.join(' -> ');
      const more = comp.length > path.length - 1 ? comp.length : 0;
      findings.push({
        rule: 'arch:cycle', file: first.file, line: first.line,
        message: {
          en: `Dependency cycle: ${chain}${more ? ` (${more} modules are in this cycle group)` : ''}.`,
          ko: `의존 순환이 있습니다: ${chain}${more ? ` (이 순환 묶음에 모듈 ${more}개가 있습니다)` : ''}.`,
        },
        events: steps.map((e, i) => ({
          line: e.line, file: e.file, tag: 'path', main: i === 0,
          text: { en: `'${e.from}' depends on '${e.to}'`, ko: `'${e.from}'이(가) '${e.to}'에 의존합니다` },
        })),
      });
    }
  }

  if (wantLayer) {
    const seen = new Set();
    for (const e of g.edgesAll) {
      const target = nodeById.get(e.to);
      const source = nodeById.get(e.from);
      if (!target || !source) continue;
      const toValues = [target.id, ...target.files];
      const fromValues = [e.file, source.id];
      if (layers.length) {
        const fi = layerIndex(layers, fromValues);
        const ti = layerIndex(layers, toValues);
        const k = `L|${e.file}|${e.to}`;
        if (fi >= 0 && ti >= 0 && fi > ti && !seen.has(k)) {
          seen.add(k);
          const lf = layers[fi].name || `#${fi + 1}`; const lt = layers[ti].name || `#${ti + 1}`;
          findings.push({
            rule: 'arch:layer-violation', file: e.file, line: e.line,
            message: {
              en: `Layer '${lf}' must not depend on the higher layer '${lt}': '${e.from}' depends on '${e.to}'.`,
              ko: `'${lf}' 계층은 위 계층 '${lt}'에 의존하면 안 됩니다. '${e.from}'이(가) '${e.to}'에 의존합니다.`,
            },
          });
        }
      }
      forbidden.forEach((r, ri) => {
        const k = `F${ri}|${e.file}|${e.to}`;
        if (seen.has(k)) return;
        if (!fromValues.some((v) => globMatch(r.from, v)) || !toValues.some((v) => globMatch(r.to, v))) return;
        seen.add(k);
        const why = text(r.message, '', '');
        findings.push({
          rule: 'arch:layer-violation', file: e.file, line: e.line,
          message: {
            en: `Forbidden dependency: '${e.from}' depends on '${e.to}'${why.en ? ` (${why.en})` : ''}.`,
            ko: `금지된 의존입니다: '${e.from}'이(가) '${e.to}'에 의존합니다${why.ko ? ` (${why.ko})` : ''}.`,
          },
        });
      });
    }
  }

  if (wantUnstable) {
    const margin = Number(unstableCfg && typeof unstableCfg === 'object' ? unstableCfg.margin : 0) || 0;
    for (const e of g.edges) {
      const s = nodeById.get(e.from); const t = nodeById.get(e.to);
      if (!s || !t || !(t.instability > s.instability + margin)) continue;
      findings.push({
        rule: 'arch:unstable-dependency', file: e.file, line: e.line,
        message: {
          en: `'${e.from}' (instability ${s.instability}) depends on the less stable '${e.to}' (instability ${t.instability}).`,
          ko: `'${e.from}'(불안정도 ${s.instability})이(가) 덜 안정적인 '${e.to}'(불안정도 ${t.instability})에 의존합니다.`,
        },
      });
    }
  }

  if (wantTooMany) {
    for (const n of g.nodes) {
      if (n.ce <= maxDeps) continue;
      const out = g.edges.filter((e) => e.from === n.id);
      const first = out.slice().sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line))[0];
      findings.push({
        rule: 'arch:too-many-dependencies', file: first ? first.file : n.file, line: first ? first.line : 1,
        message: {
          en: `'${n.id}' depends on ${n.ce} modules (limit ${maxDeps}).`,
          ko: `'${n.id}'이(가) 모듈 ${n.ce}개에 의존합니다(기준 ${maxDeps}).`,
        },
      });
    }
  }
  return findings;
}

function dependencyGraph(files, options = {}) {
  try {
    const g = graphFor(files, options);
    return { nodes: g.nodes, edges: g.edges };
  } catch (_) {
    return { nodes: [], edges: [] };
  }
}

module.exports = { catalog, analyze, dependencyGraph, globMatch };
