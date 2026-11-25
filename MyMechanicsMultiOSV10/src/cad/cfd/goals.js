// Goals of a flow study and parametric studies over them.
//
// Goals are the numbers a flow study is run for:
//   global   drag, lift, side force (N), drag coefficient, pressure drop (Pa), largest velocity (m/s), heat to the
//            fluid (W), Nusselt number, torque (N·m) and shaft power (W) of a rotating body, Strouhal number
//   surface  on chosen faces of the body: mean (area-weighted), largest and smallest pressure (Pa), and the pressure
//            force on them along the flow, lift and side axes (N)
//   volume   in a box (mm): mean and largest speed (m/s), mean pressure (Pa), mean and largest temperature (°C)
// Each goal can also tell whether it has settled: its history over the last part of the run (force and heat goals)
// spreads less than a tolerance. A steady run may stop on its goals settling (flowStudy time.goalTol).
//
// A parametric study runs the study once per value of a parameter (inlet velocity, inlet temperature, speed of a
// rotating body, or a design variable of the part that rebuilds its shape) and tabulates the goals.

export const GLOBAL_GOALS = {
  drag: { unit: 'N', of: (r) => r.dragForce },
  lift: { unit: 'N', of: (r) => r.liftForce },
  side: { unit: 'N', of: (r) => r.sideForce },
  cd: { unit: '', of: (r) => r.dragCoefficient },
  dp: { unit: 'Pa', of: (r) => r.pressureDrop },
  vmax: { unit: 'm/s', of: (r) => r.maxVelocity },
  heat: { unit: 'W', of: (r) => r.heat },
  nusselt: { unit: '', of: (r) => r.nusselt },
  torque: { unit: 'N·m', of: (r) => r.rotation?.torque ?? 0 },
  power: { unit: 'W', of: (r) => r.rotation?.power ?? 0 },
  strouhal: { unit: '', of: (r) => r.strouhal },
};
export const SURFACE_GOALS = { pAvg: 'Pa', pMax: 'Pa', pMin: 'Pa', fFlow: 'N', fLift: 'N', fSide: 'N' };
export const VOLUME_GOALS = { vAvg: 'm/s', vMax: 'm/s', pAvg: 'Pa', tAvg: '°C', tMax: '°C' };

const AXIS = { x: 0, y: 1, z: 2 };

/** The lattice axes of a result: the flow axis, and the lift and side axes (as flowStudy names them). */
function axesOf(r) {
  const fa = AXIS[r.axis] ?? 0, lat = [0, 1, 2].filter((a) => a !== fa);
  return { flow: fa, side: lat[0], lift: lat[1] };
}

/**
 * A surface goal on faces (faceIds of the mesh's faceGroups): from the pressure at the surface vertices
 * (result.vertexPressure), triangle by triangle (area-weighted mean; force = −∫p n dA, mm² → m²).
 */
export function surfaceGoal(result, mesh, faceIds, kind) {
  const P = result.vertexPressure;
  if (!P?.length || !mesh?.faceGroups) return null;
  const ids = new Set(faceIds);
  const V = mesh.vertices, T = mesh.triangles;
  let A = 0, sum = 0, mx = -Infinity, mn = Infinity; const F = [0, 0, 0];
  for (const g of mesh.faceGroups) {
    if (!ids.has(g.faceId)) continue;
    for (let t = g.start; t < g.start + g.count; t += 3) {
      const a = T[t], b = T[t + 1], c = T[t + 2];
      const u = [V[3 * b] - V[3 * a], V[3 * b + 1] - V[3 * a + 1], V[3 * b + 2] - V[3 * a + 2]], v = [V[3 * c] - V[3 * a], V[3 * c + 1] - V[3 * a + 1], V[3 * c + 2] - V[3 * a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const ar = Math.hypot(...n) / 2;
      const p = (P[a] + P[b] + P[c]) / 3;
      A += ar; sum += p * ar;
      for (const q of [P[a], P[b], P[c]]) { mx = Math.max(mx, q); mn = Math.min(mn, q); }
      for (let k = 0; k < 3; k++) F[k] -= (p * n[k] / 2) * 1e-6;
    }
  }
  if (!(A > 0)) return null;
  const ax = axesOf(result);
  return { pAvg: sum / A, pMax: mx, pMin: mn, fFlow: F[ax.flow] * (result.sign ?? 1), fLift: F[ax.lift], fSide: F[ax.side] }[kind] ?? null;
}

/** A volume goal in a box { lo: [x,y,z], hi } (mm): over the fluid cells whose centres are inside it. */
export function volumeGoal(result, box, kind) {
  const { dims, origin, h, solid, vel, rho, temp } = result;
  if (!dims || !vel) return null;
  const scaleV = result.velocity / result.uLat, qd = (result.fluid?.density ?? 1.204) * scaleV * scaleV;
  const lo = [0, 1, 2].map((a) => Math.max(0, Math.ceil((Math.min(box.lo[a], box.hi[a]) - origin[a]) / h - 0.5)));
  const hi = [0, 1, 2].map((a) => Math.min(dims[a] - 1, Math.floor((Math.max(box.lo[a], box.hi[a]) - origin[a]) / h - 0.5)));
  let n = 0, sv = 0, mv = 0, sp = 0, st = 0, mt = -Infinity;
  for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
    const s = i + dims[0] * (j + dims[1] * k);
    if (solid[s]) continue;
    const sp3 = Math.hypot(vel[3 * s], vel[3 * s + 1], vel[3 * s + 2]) * scaleV;
    n++; sv += sp3; mv = Math.max(mv, sp3); sp += ((rho[s] - 1) / 3) * qd;
    if (temp) { st += temp[s]; mt = Math.max(mt, temp[s]); }
  }
  if (!n) return null;
  return { vAvg: sv / n, vMax: mv, pAvg: sp / n, tAvg: temp ? st / n : null, tMax: temp ? mt : null }[kind] ?? null;
}

/** The value of a goal { kind: 'global' | 'surface' | 'volume', id, faceIds?, box? }. */
export function goalValue(result, mesh, g) {
  if (!result) return null;
  if (g.kind === 'surface') return surfaceGoal(result, mesh, g.faceIds ?? [], g.id);
  if (g.kind === 'volume') return volumeGoal(result, g.box, g.id);
  const v = GLOBAL_GOALS[g.id]?.of(result);
  return Number.isFinite(v) ? v : null;
}
export const goalUnit = (g) => (g.kind === 'surface' ? SURFACE_GOALS[g.id] : g.kind === 'volume' ? VOLUME_GOALS[g.id] : GLOBAL_GOALS[g.id]?.unit) ?? '';

/**
 * Has a goal settled? For the force goals (drag, lift, side) and heat: the run's mean over its last `fraction` of
 * history differs from the mean over the span before by less than `tol` (relative). Other goals come from the final
 * field: settled when the run converged. { settled, drift, spread }.
 */
export function goalSettled(result, g, { tol = 0.01, fraction = 0.25 } = {}) {
  const H = result?.history ?? [];
  const ax = axesOf(result ?? {});
  const series = g.kind === 'global' && ['drag', 'lift', 'side', 'heat', 'cd'].includes(g.id)
    ? H.map((x) => (g.id === 'heat' ? x.heat : x.force[g.id === 'lift' ? ax.lift : g.id === 'side' ? ax.side : ax.flow]))
    : null;
  if (!series || series.length < 8) return { settled: Boolean(result?.converged ?? !result?.error), spread: null };
  // The mean over the last `fraction` against the mean over the same span before it (an oscillating goal settles on
  // its mean); `spread` is the oscillation's size over the last span.
  const w = Math.max(2, Math.floor(series.length * fraction));
  const last = series.slice(-w), before = series.slice(-2 * w, -w);
  const avg = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const m2 = avg(last), m1 = avg(before), ref = Math.max(1e-300, Math.abs(m2));
  const drift = Math.abs(m2 - m1) / ref, spread = (Math.max(...last) - Math.min(...last)) / ref;
  return { settled: drift < tol, drift, spread };
}

/** The goals of a result as rows [{ goal, value, unit, settled, spread }]. */
export function evaluateGoals(result, mesh, goals, opts = {}) {
  return goals.map((g) => ({ goal: g, value: goalValue(result, mesh, g), unit: goalUnit(g), ...goalSettled(result, g, opts) }));
}

/** Evenly spaced values from `from` to `to` (`steps` of them), or the list given. */
export function parameterValues({ from, to, steps, list = null }) {
  if (Array.isArray(list) && list.length) return list.map(Number).filter(Number.isFinite);
  const n = Math.max(1, Math.round(steps) || 1);
  if (n === 1) return [Number(from)];
  return Array.from({ length: n }, (_, i) => Number(from) + ((Number(to) - Number(from)) * i) / (n - 1));
}

/**
 * Runs `run(value)` → { result, mesh, goals? (the goals resolved on this run's shape) } for each value and evaluates the goals: { rows: [{ value, ok, error, goals:
 * [values] }] }. `cancel()` stops between runs; `onRow(row, i)` reports progress.
 */
export async function parametricStudy(values, run, goals, { cancel = null, onRow = null } = {}) {
  const rows = [];
  for (const [i, value] of values.entries()) {
    if (cancel?.()) break;
    let row;
    try {
      const got = await run(value);
      if (!got?.result || (got.result.error && got.result.error !== 'not-converged')) row = { value, ok: false, error: got?.result?.error ?? 'failed', goals: goals.map(() => null) };
      else row = { value, ok: true, error: got.result.error ?? null, goals: goals.map((g, k) => goalValue(got.result, got.mesh, got.goals?.[k] ?? g)) };
    } catch (error) { row = { value, ok: false, error: error.message ?? String(error), goals: goals.map(() => null) }; }
    rows.push(row); onRow?.(row, i);
  }
  return { rows };
}

/** The study as CSV: the parameter, then one column per goal. */
export function parametricCsv(study, paramName, goalNames) {
  const esc = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const lines = [[paramName, ...goalNames].map(esc).join(',')];
  for (const r of study.rows) lines.push([r.value, ...r.goals.map((v) => (v == null ? '' : v))].map(esc).join(','));
  return `${lines.join('\n')}\n`;
}
