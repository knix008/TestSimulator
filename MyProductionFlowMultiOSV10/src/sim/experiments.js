// Experiments beyond one-parameter variation (no DOM; the app runs the models):
//   sensitivity analysis — each parameter low/high by ±percent around its value: the swing of the objective (tornado),
//   multi-parameter optimization — a pattern search with restarts over a grid of several parameters (OptQuest-like),
//   scenario comparison — KPIs of saved runs side by side.

/** Low and high values of each parameter (±percent, integers rounded and kept ≥ min, and different from the base). */
export function sensitivityPlan(params, percent = 20) {
  const f = Math.max(0.01, Number(percent) || 20) / 100;
  return params.map((p) => {
    const v = Number(p.value);
    let low = v * (1 - f); let high = v * (1 + f);
    if (p.integer) { low = Math.round(low); high = Math.round(high); if (low === v) low = v - 1; if (high === v) high = v + 1; }
    if (p.min != null) low = Math.max(p.min, low);
    if (!(v !== 0)) { low = p.integer ? 0 : -f; high = p.integer ? 1 : f; }
    return { key: p.key, label: p.label, base: v, low: +low.toFixed(6), high: +high.toFixed(6) };
  });
}

/** Tornado rows from evaluated plan rows ({ …, lowValue, highValue }), biggest swing first. */
export function tornadoRows(rows, baseValue) {
  return rows
    .map((r) => ({ ...r, swing: Math.abs(r.highValue - r.lowValue), effectLow: r.lowValue - baseValue, effectHigh: r.highValue - baseValue }))
    .sort((a, b) => b.swing - a.swing);
}

/** The values a parameter can take: from, from + step, … ≤ to (at most 500). */
export function gridValues({ from, to, step }) {
  const a = Number(from); const b = Number(to); const s = Math.max(1e-9, Math.abs(Number(step)) || 1);
  const out = [];
  for (let i = 0; a + i * s <= b + 1e-9 && out.length < 500; i++) out.push(+(a + i * s).toFixed(6));
  return out.length ? out : [a];
}

/**
 * Pattern search on the grid of several parameters. `evaluate(values[])` → number (async); `goal` 'maximize' |
 * 'minimize'; at most `budget` evaluations (each distinct point once). Starts at `start` (indices, default the
 * middle), moves along one axis at a time by `stride` grid steps, halves the stride when no move helps, and
 * restarts from a random unvisited point when the stride reaches 1 without improving. Returns
 * { best: { values, value }, history: [{ values, value, best }], evaluations }.
 */
export async function patternSearch({ axes, evaluate, goal = 'maximize', budget = 40, start = null, random = Math.random, onProgress = null, cancelled = () => false }) {
  const better = (a, b) => (goal === 'minimize' ? a < b : a > b);
  const cache = new Map();
  const history = [];
  let best = null;
  const valuesOf = (idx) => idx.map((i, k) => axes[k][i]);
  const total = axes.reduce((n, a) => n * a.length, 1);
  const limit = Math.min(budget, total);
  const evalAt = async (idx) => {
    const key = idx.join(',');
    if (cache.has(key)) return cache.get(key);
    if (cache.size >= limit || cancelled()) return null;
    const values = valuesOf(idx);
    const value = Number(await evaluate(values));
    cache.set(key, value);
    if (Number.isFinite(value) && (!best || better(value, best.value))) best = { values, value, idx: [...idx] };
    history.push({ values, value, best: best?.value ?? value });
    onProgress?.(cache.size, limit);
    return value;
  };
  let cur = start ?? axes.map((a) => Math.floor((a.length - 1) / 2));
  let curValue = await evalAt(cur);
  let stride = Math.max(1, ...axes.map((a) => Math.floor(a.length / 4)));
  while (cache.size < limit && !cancelled()) {
    let moved = false;
    for (let k = 0; k < axes.length && !moved; k++) {
      for (const dir of [1, -1]) {
        const next = [...cur]; next[k] = Math.max(0, Math.min(axes[k].length - 1, next[k] + dir * stride));
        if (next[k] === cur[k]) continue;
        const v = await evalAt(next);
        if (v == null) break;
        if (Number.isFinite(v) && (curValue == null || !Number.isFinite(curValue) || better(v, curValue))) { cur = next; curValue = v; moved = true; break; }
      }
    }
    if (moved) continue;
    if (stride > 1) { stride = Math.max(1, Math.floor(stride / 2)); continue; }
    // A local best: restart from a random point not tried yet (or stop when every point was tried).
    if (cache.size >= total) break;
    let tries = 0; let idx;
    do { idx = axes.map((a) => Math.floor(random() * a.length)); tries += 1; } while (cache.has(idx.join(',')) && tries < 200);
    if (cache.has(idx.join(','))) break;
    cur = idx; curValue = await evalAt(cur);
    stride = Math.max(1, ...axes.map((a) => Math.floor(a.length / 4)));
  }
  return { best: best ? { values: best.values, value: best.value } : null, history, evaluations: cache.size, space: total };
}

/** The KPIs a saved scenario keeps, with whether more is better. */
export const SCENARIO_KPIS = [
  ['throughput', 1], ['completed', 1], ['cycleMean', -1], ['wipMean', -1], ['cost', -1], ['lost', -1], ['bottleneckUtil', 0],
];

/** A scenario from a finished run: name, KPI values and the parameter values that differ from `baseModel`. */
export function scenarioFrom(name, results, model) {
  const k = results?.kpi ?? {};
  return {
    name,
    at: new Date().toISOString(),
    values: {
      throughput: k.throughput, completed: k.completed, cycleMean: k.cycleMean, wipMean: k.wipMean, cost: k.cost, lost: k.lost,
      bottleneckUtil: k.bottleneck?.utilization ?? null,
    },
    bottleneck: k.bottleneck?.name ?? '',
    model: JSON.stringify(model.blocks.map((b) => [b.name, b.props])),
  };
}

/** For each KPI row: the index of the best scenario (or -1). */
export function bestScenarioIndex(scenarios, key) {
  const dir = SCENARIO_KPIS.find(([k]) => k === key)?.[1] ?? 0;
  if (!dir || scenarios.length < 2) return -1;
  let best = -1;
  scenarios.forEach((s, i) => { const v = Number(s.values[key]); if (!Number.isFinite(v)) return; if (best < 0 || (dir > 0 ? v > scenarios[best].values[key] : v < scenarios[best].values[key])) best = i; });
  return best;
}

/** Properties that differ between two scenarios' models: ["Block.prop: a → b", …]. */
export function scenarioDiff(a, b) {
  const pa = new Map(JSON.parse(a.model)); const pb = new Map(JSON.parse(b.model));
  const out = [];
  for (const [name, props] of pb) {
    const old = pa.get(name);
    if (!old) { out.push(`+ ${name}`); continue; }
    for (const [key, v] of Object.entries(props)) if (JSON.stringify(v) !== JSON.stringify(old[key])) out.push(`${name}.${key}: ${short(old[key])} → ${short(v)}`);
  }
  for (const name of pa.keys()) if (!pb.has(name)) out.push(`− ${name}`);
  return out;
}
const short = (v) => { if (v && typeof v === 'object') return v.type ? `${v.type}(${Object.entries(v).filter(([k]) => k !== 'type').map(([, x]) => x).join(', ')})` : JSON.stringify(v).slice(0, 30); return String(v); };
