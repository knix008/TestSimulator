// Design study: the part's global variables varied, its sensors measured (mass, volume, size … and simulation results),
// either for a table of scenarios ("what if") or to find the best design ("optimisation").
//   variables    [{ name, kind: 'range', min, max, step } | { name, kind: 'discrete', values: [..] }]
//   goal         { sensor, sense: 'min' | 'max' | 'target', value } (optimisation)
//   constraints  [{ sensor, op: '<=' | '>=', value }]
//   method       'whatif' (scenarios: [{ name, values: { V: x } }]), 'grid' (every combination, up to a limit) or
//                'optimise' (a pattern search over the allowed values: from the start point, every variable one step up
//                and down, the best feasible move taken, the step halved on a range variable when no move helps;
//                infeasible designs pay a penalty by how far they miss)
// The evaluation (rebuild + measurements) is the caller's: evaluate(values) → Promise<{ ok, sensors: { name: value } }>.
// No DOM, no kernel.

/** The values a variable may take (a range snapped to its step; a discrete list as given). */
export function allowedValues(v) {
  if (v.kind === 'discrete') return (v.values ?? []).map(Number).filter(Number.isFinite);
  const min = Number(v.min), max = Number(v.max), step = Math.abs(Number(v.step)) || (max - min) / 4 || 1;
  const out = [];
  for (let x = min; x <= max + 1e-9 * Math.max(1, Math.abs(max)); x += step) out.push(+x.toPrecision(12));
  if (out.length && Math.abs(out.at(-1) - max) > 1e-9 * Math.max(1, Math.abs(max))) out.push(max);
  return out;
}

/** Every combination of the variables' values (row-major), or null when there are more than `limit`. */
export function gridOf(variables, limit = 400) {
  const lists = variables.map(allowedValues);
  const total = lists.reduce((n, l) => n * Math.max(1, l.length), 1);
  if (total > limit) return null;
  const out = [];
  const rec = (i, cur) => { if (i === variables.length) { out.push({ ...cur }); return; } for (const x of lists[i]) rec(i + 1, { ...cur, [variables[i].name]: x }); };
  rec(0, {});
  return out;
}

/** Whether a design meets the constraints, and by how much it misses them (relative, 0 when feasible). */
export function feasibility(sensors, constraints = []) {
  let miss = 0;
  for (const c of constraints) {
    const v = Number(sensors?.[c.sensor]), lim = Number(c.value);
    if (!Number.isFinite(v)) { miss += 1; continue; }
    const scale = Math.max(Math.abs(lim), 1e-12);
    if (c.op === '<=' && v > lim) miss += (v - lim) / scale;
    if (c.op === '>=' && v < lim) miss += (lim - v) / scale;
  }
  return { feasible: miss === 0, miss };
}

/** The objective to minimise: the goal's sensor (negated for 'max', the distance for 'target'), plus the penalty. */
export function objective(sensors, goal, constraints = []) {
  const f = feasibility(sensors, constraints);
  const v = Number(sensors?.[goal?.sensor]);
  if (!Number.isFinite(v)) return { value: Infinity, ...f };
  const raw = goal.sense === 'max' ? -v : goal.sense === 'target' ? Math.abs(v - Number(goal.value)) : v;
  // An infeasible design never beats a feasible one; among infeasible ones the smaller miss wins (the search heads
  // for the feasible region first).
  return { value: f.miss > 0 ? 1e20 * (1 + f.miss) : raw, raw, ...f };
}

/**
 * Runs a study. opts { variables, method, scenarios, goal, constraints, start (values), maxEvaluations (60),
 * evaluate(values) → Promise<{ ok, sensors }>, onProgress(done, total, row), cancel() }.
 * Returns { rows: [{ name, values, ok, sensors, feasible, objective }], best (row index or -1), evaluations }.
 */
export async function runDesignStudy({ variables = [], method = 'whatif', scenarios = [], goal = null, constraints = [], start = null, maxEvaluations = 60, evaluate, onProgress = null, cancel = null }) {
  const rows = [], cache = new Map();
  const key = (values) => variables.map((v) => `${v.name}=${values[v.name]}`).join('|');
  const run = async (values, name = '') => {
    const k = key(values);
    if (cache.has(k)) return cache.get(k);
    if (cancel?.()) throw Object.assign(new Error('cancelled'), { cancelled: true });
    const r = await evaluate(values);
    const row = { name, values: { ...values }, ok: Boolean(r?.ok), sensors: r?.sensors ?? {}, error: r?.error ?? null };
    if (goal) Object.assign(row, { objective: objective(row.sensors, goal, constraints).value });
    Object.assign(row, { feasible: row.ok && feasibility(row.sensors, constraints).feasible });
    rows.push(row); cache.set(k, row);
    onProgress?.(rows.length, method === 'optimise' ? maxEvaluations : total, row);
    return row;
  };
  let total = 0;
  if (method === 'whatif') {
    total = scenarios.length;
    for (const s of scenarios) await run({ ...(start ?? {}), ...s.values }, s.name);
  } else if (method === 'grid') {
    const grid = gridOf(variables, maxEvaluations);
    if (!grid) throw Object.assign(new Error('too many combinations'), { code: 'too-many' });
    total = grid.length;
    for (const values of grid) await run(values);
  } else {
    // Pattern search over the allowed values (a range variable starts with its full step, halving it when stuck).
    const lists = variables.map(allowedValues);
    const steps = variables.map((v) => (v.kind === 'range' ? Math.abs(Number(v.step)) || (Number(v.max) - Number(v.min)) / 4 || 1 : 1));
    const snap = (i, x) => {
      const v = variables[i];
      if (v.kind === 'discrete') return x;
      return Math.min(Number(v.max), Math.max(Number(v.min), +x.toPrecision(12)));
    };
    let cur = {};
    variables.forEach((v, i) => { const s = start?.[v.name]; cur[v.name] = Number.isFinite(Number(s)) ? snap(i, Number(s)) : lists[i][Math.floor(lists[i].length / 2)]; });
    let best = await run(cur, 'start');
    // Moves to an equal objective are taken too (a plateau along a constraint leads on), never back to a point
    // already stood on.
    const stood = new Set([key(cur)]);
    const better = (r) => r.ok && !stood.has(key(r.values)) && r.objective <= best.objective + 1e-12 * Math.max(1, Math.abs(best.objective)) && (r.objective < best.objective - 1e-12 * Math.max(1, Math.abs(best.objective)) || r.objective < 1e19);
    const take = (r) => { best = r; cur = { ...r.values }; stood.add(key(cur)); };
    const minStep = variables.map((v, i) => (v.kind === 'range' ? steps[i] / 16 : 1));
    while (rows.length < maxEvaluations) {
      let moved = false;
      for (let i = 0; i < variables.length && rows.length < maxEvaluations; i++) {
        const v = variables[i];
        const cand = [];
        if (v.kind === 'discrete') { const j = lists[i].indexOf(cur[v.name]); if (j > 0) cand.push(lists[i][j - 1]); if (j >= 0 && j < lists[i].length - 1) cand.push(lists[i][j + 1]); }
        else for (const d of [-1, 1]) { const x = snap(i, cur[v.name] + d * steps[i]); if (x !== cur[v.name]) cand.push(x); }
        for (const x of cand) {
          if (rows.length >= maxEvaluations) break;
          const r = await run({ ...cur, [v.name]: x });
          if (better(r)) { take(r); moved = true; break; }
        }
      }
      if (moved) continue;
      // No better single move: two variables at once (diagonal steps) — along a constraint boundary one variable
      // alone cannot move (a thinner beam is too weak unless it gets taller at the same time).
      const stepOf = (i, d) => {
        const v = variables[i];
        if (v.kind === 'discrete') { const j = lists[i].indexOf(cur[v.name]) + d; return j >= 0 && j < lists[i].length ? lists[i][j] : null; }
        const x = snap(i, cur[v.name] + d * steps[i]); return x !== cur[v.name] ? x : null;
      };
      for (let i = 0; i < variables.length && !moved && rows.length < maxEvaluations; i++) {
        for (let j = i + 1; j < variables.length && !moved && rows.length < maxEvaluations; j++) {
          for (const [di, dj] of [[-1, 1], [1, -1], [-1, -1], [1, 1]]) {
            const xi = stepOf(i, di), xj = stepOf(j, dj);
            if (xi == null || xj == null || rows.length >= maxEvaluations) continue;
            const r = await run({ ...cur, [variables[i].name]: xi, [variables[j].name]: xj });
            if (better(r)) { take(r); moved = true; break; }
          }
        }
      }
      if (moved) continue;
      // No better neighbour: finer steps on the range variables, or done.
      let refined = false;
      for (let i = 0; i < variables.length; i++) if (variables[i].kind === 'range' && steps[i] / 2 >= minStep[i]) { steps[i] /= 2; refined = true; }
      if (!refined) break;
    }
  }
  // The best: among the feasible rows the lowest objective (or, for "what if" without a goal, none).
  let best = -1;
  if (goal) rows.forEach((r, i) => { if (r.ok && r.feasible && (best < 0 || r.objective < rows[best].objective)) best = i; });
  return { rows, best, evaluations: rows.length };
}

/** The study as CSV: name, the variables, the sensors, feasible. */
export function designStudyCsv(result, variables, sensors) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ['Design', ...variables.map((v) => v.name), ...sensors, 'Feasible', 'Best'];
  const lines = result.rows.map((r, i) => [r.name || `${i + 1}`, ...variables.map((v) => r.values[v.name]), ...sensors.map((s) => (Number.isFinite(r.sensors[s]) ? +Number(r.sensors[s]).toPrecision(8) : '')), r.feasible ? 'yes' : 'no', i === result.best ? 'yes' : ''].map(q).join(','));
  return [head.map(q).join(','), ...lines].join('\n') + '\n';
}
