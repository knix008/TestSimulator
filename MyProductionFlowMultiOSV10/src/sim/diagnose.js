// Diagnosis: reads a run's results (and the model) and lists the problems it
// finds — the bottleneck, blocked or starved stations, breakdowns, growing
// queues, long waits, lost or reneging customers, overloaded or idle
// resources, full storage, rejects, unbalanced lines, waiting-dominated cycle
// times, full or empty tanks — each with its evidence, its likely cause and
// concrete fixes. A fix can carry an action the app applies with one click
// (change a property of a block); the user then runs the model again.
//
// Pure: no DOM. Texts are i18n keys ("diag.<id>.title|cause", "fix.<id>") with params.
import { baseOf, BLOCK_TYPES } from './blocks.js';
import { distMean } from './random.js';

const pct = (v) => `${(v * 100).toFixed(0)}%`;
const r2 = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

/** Blocks linked straight downstream / upstream of a block (flow links). */
function neighbours(model, id, dir) {
  return model.links.filter((l) => l.kind === 'flow' && (dir === 'down' ? l.from.block === id : l.to.block === id))
    .map((l) => model.blocks.find((b) => b.id === (dir === 'down' ? l.to.block : l.from.block))).filter(Boolean);
}

/** A copy of a distribution with its mean scaled by f (a "make it faster" fix). */
export function scaleDist(d, f) {
  if (!d || typeof d !== 'object') return d;
  const out = { ...d };
  for (const k of ['value', 'min', 'mode', 'max', 'mean', 'sd', 'scale']) if (typeof out[k] === 'number') out[k] = +(out[k] * f).toFixed(4);
  if (out.type === 'expression' && out.expr) out.expr = `(${out.expr}) * ${f}`;
  return out;
}

/**
 * Problems of a run: [{ id, severity: 'error'|'warning'|'info', block?, params, evidence: [[key, value]],
 * fixes: [{ key, params, action?: { block, prop, value } }] }], the most serious first.
 */
export function diagnose(model, results) {
  const out = [];
  if (!results) return out;
  const byName = new Map(model.blocks.map((b) => [b.name, b]));
  const blocks = Object.entries(results.blocks);
  const u = model.settings.timeUnit;
  const add = (issue) => out.push(issue);
  const k = results.kpi;
  const stations = blocks.filter(([, r]) => ['process', 'robot', 'dock', 'combine'].includes(r.base ?? r.type) && r.utilization != null && r.capacity !== Infinity);

  // ── bottleneck
  if (k.bottleneck && k.bottleneck.utilization > 0.85) {
    const b = byName.get(k.bottleneck.name); const r = results.blocks[k.bottleneck.name];
    const base = baseOf(b?.type);
    const ups = b ? neighbours(model, b.id, 'up').filter((x) => baseOf(x.type) === 'queue') : [];
    const q = ups[0] ? results.blocks[ups[0].name] : null;
    const fixes = [];
    if (base === 'process' || base === 'dock') {
      const capKey = base === 'dock' ? 'doors' : 'capacity';
      fixes.push({ key: 'addCapacity', params: { name: b.name, from: b.props[capKey], to: b.props[capKey] + 1 }, action: { block: b.name, prop: capKey, value: b.props[capKey] + 1 } });
      if (b.props.time) fixes.push({ key: 'fasterProcess', params: { name: b.name, mean: r2(distMean(b.props.time)), to: r2(distMean(b.props.time) * 0.85) }, action: { block: b.name, prop: 'time', value: scaleDist(b.props.time, 0.85) } });
      if (Number(b.props.setup) > 0) fixes.push({ key: 'reduceSetup', params: { name: b.name, setup: b.props.setup }, action: { block: b.name, prop: 'setup', value: +(b.props.setup / 2).toFixed(3) } });
    }
    if (base === 'resourcePool') fixes.push({ key: 'addUnit', params: { name: b.name, from: b.props.capacity, to: b.props.capacity + 1 }, action: { block: b.name, prop: 'capacity', value: b.props.capacity + 1 } });
    if (base === 'transporter') fixes.push({ key: 'addVehicle', params: { name: b.name, from: b.props.fleet, to: b.props.fleet + 1 }, action: { block: b.name, prop: 'fleet', value: b.props.fleet + 1 } });
    if (b?.props?.pool) fixes.push({ key: 'morePool', params: { pool: b.props.pool } });
    if (base !== 'resourcePool' && base !== 'transporter') fixes.push({ key: 'parallelLine', params: { name: k.bottleneck.name } });
    add({ id: 'bottleneck', severity: k.bottleneck.utilization > 0.95 ? 'error' : 'warning', block: k.bottleneck.name, params: { name: k.bottleneck.name, u: pct(k.bottleneck.utilization) },
      evidence: [['utilization', pct(k.bottleneck.utilization)], ...(q ? [['queueBefore', `${ups[0].name}: ${r2(q.lengthMean)} (max ${q.lengthMax})`], ['waitBefore', `${r2(q.waitMean)} ${u}`]] : []), ['throughput', `${r2(k.throughput)}/${u}`]], fixes });
  }

  for (const [name, r] of blocks) {
    const b = byName.get(name);
    if (!b) continue;
    const base = r.base ?? baseOf(r.type);
    // ── blocked: the next step does not take the output
    if (r.blockedShare > 0.1) {
      const downs = neighbours(model, b.id, 'down');
      const q = downs.find((x) => baseOf(x.type) === 'queue');
      const fixes = [];
      if (q) { const cap = Number(q.props.capacity) || 0; if (cap > 0) fixes.push({ key: 'biggerBuffer', params: { name: q.name, from: cap, to: Math.ceil(cap * 1.5) + 2 }, action: { block: q.name, prop: 'capacity', value: Math.ceil(cap * 1.5) + 2 } }); }
      else if (downs[0]) fixes.push({ key: 'addBuffer', params: { name, next: downs[0].name } });
      if (downs[0]) fixes.push({ key: 'speedNext', params: { next: downs[0].name } });
      add({ id: 'blocked', severity: r.blockedShare > 0.25 ? 'warning' : 'info', block: name, params: { name, u: pct(r.blockedShare), next: downs.map((x) => x.name).join(', ') || '—' }, evidence: [['blocked', pct(r.blockedShare)], ['utilization', pct(r.utilization ?? 0)]], fixes });
    }
    // ── breakdowns
    if (r.downShare > 0.05) {
      const fixes = [];
      if (b.props.mttr) fixes.push({ key: 'fasterRepair', params: { name, mean: r2(distMean(b.props.mttr)), to: r2(distMean(b.props.mttr) / 2) }, action: { block: name, prop: 'mttr', value: scaleDist(b.props.mttr, 0.5) } });
      if (b.props.mtbf) fixes.push({ key: 'betterMaintenance', params: { name, mean: r2(distMean(b.props.mtbf)), to: r2(distMean(b.props.mtbf) * 2) }, action: { block: name, prop: 'mtbf', value: scaleDist(b.props.mtbf, 2) } });
      fixes.push({ key: 'bufferAroundFailures', params: { name } });
      add({ id: 'breakdowns', severity: r.downShare > 0.15 ? 'warning' : 'info', block: name, params: { name, u: pct(r.downShare) }, evidence: [['down', pct(r.downShare)], ['failures', String(r.failures ?? 0)]], fixes });
    }
    // ── rejects
    if (r.out > 0 && r.rejects > 0 && r.rejects / (r.in || 1) > 0.04) {
      add({ id: 'rejects', severity: 'info', block: name, params: { name, share: pct(r.rejects / (r.in || 1)) }, evidence: [['rejects', `${r.rejects} / ${r.in}`]],
        fixes: [{ key: 'lowerDefects', params: { name, from: pct(b.props.defectRate ?? 0), to: pct((b.props.defectRate ?? 0) / 2) }, action: { block: name, prop: 'defectRate', value: +((b.props.defectRate ?? 0) / 2).toFixed(4) } }, { key: 'inspectEarly', params: { name } }] });
    }
    // ── queues: growing, long waits, reneging
    if (base === 'queue') {
      const series = r.lengthMax;
      const growing = r.lengthMax >= 30 && r.lengthMean > r.lengthMax * 0.4;
      const next = neighbours(model, b.id, 'down')[0];
      const nextR = next ? results.blocks[next.name] : null;
      if (growing) {
        const fixes = [];
        if (next && ['process', 'dock'].includes(baseOf(next.type))) { const capKey = baseOf(next.type) === 'dock' ? 'doors' : 'capacity'; fixes.push({ key: 'addCapacity', params: { name: next.name, from: next.props[capKey], to: next.props[capKey] + 1 }, action: { block: next.name, prop: capKey, value: next.props[capKey] + 1 } }); }
        fixes.push({ key: 'limitWip', params: { name } });
        fixes.push({ key: 'slowerArrivals', params: {} });
        add({ id: 'queueGrowth', severity: 'warning', block: name, params: { name, max: series, mean: r2(r.lengthMean) }, evidence: [['lengthMean', r2(r.lengthMean)], ['lengthMax', String(r.lengthMax)], ...(nextR?.utilization != null ? [['nextUtil', `${next.name} ${pct(nextR.utilization)}`]] : [])], fixes });
      }
      const nextMean = next?.props?.time ? distMean(next.props.time) : 0;
      if (!growing && nextMean > 0 && r.waitMean > Math.max(3 * nextMean, 1e-9) && r.out > 10) {
        add({ id: 'longWait', severity: 'info', block: name, params: { name, wait: r2(r.waitMean), u, proc: r2(nextMean) }, evidence: [['waitMean', `${r2(r.waitMean)} ${u}`], ['waitMax', `${r2(r.waitMax)} ${u}`]],
          fixes: [{ key: 'addCapacity', params: { name: next.name, from: next.props.capacity, to: (next.props.capacity ?? 1) + 1 }, ...(baseOf(next.type) === 'process' ? { action: { block: next.name, prop: 'capacity', value: (next.props.capacity ?? 1) + 1 } } : {}) }, { key: 'priorityRule', params: { name } }] });
      }
      if (r.reneged > 0) {
        add({ id: 'reneging', severity: r.reneged > r.out * 0.1 ? 'warning' : 'info', block: name, params: { name, n: r.reneged }, evidence: [['reneged', `${r.reneged} / ${r.reneged + r.out}`]],
          fixes: [{ key: 'longerPatience', params: { name, from: b.props.timeout, to: +(b.props.timeout * 1.5).toFixed(2) }, action: { block: name, prop: 'timeout', value: +(b.props.timeout * 1.5).toFixed(2) } }, ...(next ? [{ key: 'serveFaster', params: { next: next.name } }] : [])] });
      }
    }
    // ── sources losing arrivals
    if (base === 'source' && r.lost > 0) {
      add({ id: 'lost', severity: 'warning', block: name, params: { name, n: r.lost }, evidence: [['lost', `${r.lost} / ${r.arrivals}`]],
        fixes: [{ key: 'waitInstead', params: { name }, action: { block: name, prop: 'onBlocked', value: 'wait' } }, { key: 'addBuffer', params: { name, next: neighbours(model, b.id, 'down')[0]?.name ?? '—' } }] });
    }
    // ── resource pools
    if (base === 'resourcePool') {
      if (r.utilization > 0.9) add({ id: 'poolOverload', severity: 'warning', block: name, params: { name, u: pct(r.utilization) }, evidence: [['utilization', pct(r.utilization)], ['capacity', String(r.capacity)]], fixes: [{ key: 'addUnit', params: { name, from: b.props.capacity, to: b.props.capacity + 1 }, action: { block: name, prop: 'capacity', value: b.props.capacity + 1 } }, { key: 'shiftPlan', params: { name } }] });
      else if (r.utilization < 0.3 && b.props.capacity > 1) add({ id: 'poolIdle', severity: 'info', block: name, params: { name, u: pct(r.utilization) }, evidence: [['utilization', pct(r.utilization)], ['capacity', String(r.capacity)]], fixes: [{ key: 'removeUnit', params: { name, from: b.props.capacity, to: b.props.capacity - 1 }, action: { block: name, prop: 'capacity', value: b.props.capacity - 1 } }] });
    }
    // ── transport fleets
    if (base === 'transporter' && r.utilization > 0.85) {
      add({ id: 'fleetOverload', severity: 'warning', block: name, params: { name, u: pct(r.utilization) }, evidence: [['utilization', pct(r.utilization)], ['fleet', String(r.fleet)], ['distance', `${r2(r.distance)} m`]],
        fixes: [{ key: 'addVehicle', params: { name, from: b.props.fleet, to: b.props.fleet + 1 }, action: { block: name, prop: 'fleet', value: b.props.fleet + 1 } }, { key: 'fasterVehicles', params: { name, from: b.props.speed, to: Math.round(b.props.speed * 1.25) }, action: { block: name, prop: 'speed', value: Math.round(b.props.speed * 1.25) } }, { key: 'shorterRoutes', params: { name } }] });
    }
    // ── storage full
    if (['rack', 'parking'].includes(base) && r.fillMean > 0.9) {
      const key = base === 'parking' ? 'spaces' : 'bays';
      add({ id: 'storageFull', severity: 'warning', block: name, params: { name, u: pct(r.fillMean) }, evidence: [['fill', pct(r.fillMean)], ['capacity', String(r.capacity)]],
        fixes: [{ key: 'moreStorage', params: { name, from: b.props[key], to: Math.ceil(b.props[key] * 1.3) }, action: { block: name, prop: key, value: Math.ceil(b.props[key] * 1.3) } }, ...(b.props.dwell ? [{ key: 'shorterDwell', params: { name }, action: { block: name, prop: 'dwell', value: scaleDist(b.props.dwell, 0.8) } }] : [])] });
    }
    // ── idle stations (over capacity)
    if (['process', 'robot', 'dock'].includes(base) && r.utilization != null && r.utilization < 0.2 && r.in > 0 && r.capacity > 1 && r.capacity !== Infinity) {
      add({ id: 'idleStation', severity: 'info', block: name, params: { name, u: pct(r.utilization) }, evidence: [['utilization', pct(r.utilization)], ['capacity', String(r.capacity)]],
        fixes: [{ key: 'removeCapacity', params: { name, from: b.props.capacity, to: b.props.capacity - 1 }, action: { block: name, prop: 'capacity', value: b.props.capacity - 1 } }] });
    }
  }

  // ── line balance
  if (stations.length >= 3) {
    const us = stations.map(([, r]) => r.utilization);
    const hi = Math.max(...us); const lo = Math.min(...us);
    if (hi > 0.5 && lo > 0 && hi / lo > 2.5) {
      const hiName = stations[us.indexOf(hi)][0]; const loName = stations[us.indexOf(lo)][0];
      add({ id: 'imbalance', severity: 'info', params: { hi: hiName, lo: loName, uh: pct(hi), ul: pct(lo) }, evidence: stations.map(([n, r]) => [n, pct(r.utilization)]).slice(0, 8), fixes: [{ key: 'rebalance', params: { hi: hiName, lo: loName } }] });
    }
  }
  // ── flow efficiency: most of the cycle time is waiting
  if (k.completed > 10 && k.cycleMean > 0) {
    const work = stations.reduce((s, [n]) => { const b = byName.get(n); return s + (b?.props?.time ? distMean(b.props.time) : 0); }, 0);
    if (work > 0 && work / k.cycleMean < 0.3) add({ id: 'waitingDominates', severity: 'info', params: { eff: pct(work / k.cycleMean), cycle: r2(k.cycleMean), u }, evidence: [['cycle', `${r2(k.cycleMean)} ${u}`], ['work', `${r2(work)} ${u}`]], fixes: [{ key: 'reduceWip', params: {} }, { key: 'pullSystem', params: {} }] });
  }
  // ── work piling up in the system
  if (k.created > 50 && k.completed < k.created * 0.8 && k.wipNow > 20) {
    add({ id: 'wipBuildup', severity: 'warning', params: { created: k.created, completed: k.completed, wip: k.wipNow }, evidence: [['created', String(k.created)], ['completed', String(k.completed)], ['wipNow', String(k.wipNow)]], fixes: [{ key: 'raiseCapacity', params: {} }, { key: 'slowerArrivals', params: {} }] });
  }
  // ── tanks full / empty (fluids, SD stocks with a capacity)
  for (const [name, v] of Object.entries(results.sd)) {
    const b = byName.get(name);
    if (!b || v.kind !== 'stock') continue;
    const cap = Number(b.props.capacity) || 0;
    if (cap > 0 && v.value >= cap * 0.999) add({ id: 'tankFull', severity: 'warning', block: name, params: { name, cap }, evidence: [['level', `${r2(v.value)} / ${cap}`]], fixes: [{ key: 'biggerTank', params: { name, from: cap, to: Math.ceil(cap * 1.5) }, action: { block: name, prop: 'capacity', value: Math.ceil(cap * 1.5) } }, { key: 'moreOutflow', params: { name } }] });
    else if (b.props.nonNegative !== false && v.value <= 1e-6 && BLOCK_TYPES[b.type].cat === 'fluid') add({ id: 'tankEmpty', severity: 'info', block: name, params: { name }, evidence: [['level', '0']], fixes: [{ key: 'moreInflow', params: { name } }] });
  }

  const rank = { error: 0, warning: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  if (!out.length) out.push({ id: 'healthy', severity: 'success', params: { throughput: r2(k.throughput), u }, evidence: k.completed > 0 ? [['throughput', `${r2(k.throughput)}/${u}`], ['cycle', `${r2(k.cycleMean)} ${u}`]] : [], fixes: [] });
  return out;
}

/** Fixes for problems found by the model check (before running). */
export function checkFixes(problem) {
  switch (problem.key) {
    case 'noOutput': return [{ key: 'connectOutput', params: problem.params }];
    case 'noInput': return [{ key: 'connectInput', params: problem.params }];
    case 'noPool': case 'seizeNoPool': return [{ key: 'createPool', params: problem.params }];
    case 'unknownRef': case 'expr': return [{ key: 'fixExpression', params: problem.params }];
    case 'quantities': case 'weights': return [{ key: 'matchCounts', params: problem.params }];
    case 'noRef': return [{ key: 'pickRef', params: problem.params }];
    case 'speed': return [{ key: 'setSpeed', params: problem.params }];
    default: return [];
  }
}
