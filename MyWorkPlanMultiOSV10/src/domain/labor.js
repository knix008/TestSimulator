// Wages and labor cost.
//
// Every work resource (a person) can be paid by the hour, day, week, month or
// year: resource.wage = { basis, amount }. The scheduler costs work by the hour,
// so the wage is turned into the hourly standard rate (stdRate) with the
// project's working time (hours per day / week, days per month): a monthly
// salary of 4,000,000 with 8-hour days and 20-day months is 25,000 an hour.
//
// laborBreakdown() splits the project cost into labor (work resources), materials,
// cost resources and fixed costs, and gives the labor cost per person and per
// phase with its share of the whole.
import { DEFAULT_OPTIONS } from './duration.js';

export const WAGE_BASES = ['hour', 'day', 'week', 'month', 'year'];

const opts = (options) => ({ ...DEFAULT_OPTIONS, ...(options ?? {}) });

/** Working hours in one wage period. */
export function hoursPerBasis(basis, options) {
  const o = opts(options);
  switch (basis) {
    case 'day': return o.hoursPerDay;
    case 'week': return o.hoursPerWeek;
    case 'month': return o.daysPerMonth * o.hoursPerDay;
    case 'year': return 12 * o.daysPerMonth * o.hoursPerDay;
    default: return 1;
  }
}

const round2 = (value) => Math.round(value * 100) / 100;

/** The wage of a resource as { basis, amount }; without one, the hourly standard rate. */
export function wageOf(resource) {
  const wage = resource?.wage;
  if (wage && WAGE_BASES.includes(wage.basis) && Number.isFinite(Number(wage.amount))) return { basis: wage.basis, amount: Number(wage.amount) };
  return { basis: 'hour', amount: Number(resource?.stdRate) || 0 };
}

/** The hourly rate a wage comes to. */
export const hourlyFromWage = (basis, amount, options) => round2((Number(amount) || 0) / hoursPerBasis(basis, options));

/**
 * Sets a person's wage: the wage is kept (unless it is hourly) and the standard
 * rate becomes its hourly equivalent. Returns the resource.
 */
export function setWage(resource, basis, amount, options) {
  const b = WAGE_BASES.includes(basis) ? basis : 'hour';
  const value = Math.max(0, Number(amount) || 0);
  resource.wage = b === 'hour' ? null : { basis: b, amount: value };
  resource.stdRate = hourlyFromWage(b, value, options);
  return resource;
}

/** After the hours per day / week / days per month change: hourly rates follow the wages again. */
export function refreshWages(project) {
  for (const resource of project.resources ?? []) {
    if (resource.type === 'work' && resource.wage && resource.wage.basis !== 'hour') resource.stdRate = hourlyFromWage(resource.wage.basis, resource.wage.amount, project.options);
  }
}

/** The kind of cost an assignment is: labor (work resource), material or cost resource. */
const KIND = { work: 'labor', material: 'material', cost: 'costResource' };

/**
 * The project cost split by kind, and the labor cost per person and per phase.
 * `sched` is the schedule (schedule.js) of `project`.
 */
export function laborBreakdown(project, sched) {
  const totals = { labor: 0, material: 0, costResource: 0, fixed: 0, actualLabor: 0, laborWork: 0, actualLaborWork: 0, baselineLabor: 0 };
  const resources = new Map((project.resources ?? []).map((r) => [r.id, r]));
  const people = new Map();
  const leafOf = new Map();
  for (const task of project.tasks) leafOf.set(task.id, task);
  // Top-level phase of every task (outline level 1 ancestor).
  const phaseOf = new Map();
  let phase = null;
  for (const task of project.tasks) {
    if ((task.outlineLevel ?? 1) <= 1) phase = task;
    phaseOf.set(task.id, phase);
  }
  const phases = new Map();
  const addPhase = (taskId, key, value) => {
    const p = phaseOf.get(taskId);
    if (!p) return;
    if (!phases.has(p.id)) phases.set(p.id, { id: p.id, name: p.name, labor: 0, cost: 0 });
    phases.get(p.id)[key] += value;
  };
  for (const a of project.assignments ?? []) {
    const info = sched.assignments?.get(a.id);
    const resource = resources.get(a.resourceId);
    const task = leafOf.get(a.taskId);
    if (!info || !resource || !task || task.active === false) continue;
    const kind = KIND[resource.type] ?? 'costResource';
    totals[kind] += info.cost;
    if (kind !== 'labor') continue;
    totals.actualLabor += info.actualCost;
    totals.laborWork += info.work;
    totals.actualLaborWork += info.actualWork;
    addPhase(task.id, 'labor', info.cost);
    if (!people.has(resource.id)) {
      const wage = wageOf(resource);
      people.set(resource.id, { id: resource.id, name: resource.name, group: resource.group ?? '', basis: wage.basis, amount: wage.amount, hourly: Number(resource.stdRate) || 0, work: 0, actualWork: 0, cost: 0, actualCost: 0, tasks: 0 });
    }
    const person = people.get(resource.id);
    person.work += info.work;
    person.actualWork += info.actualWork;
    person.cost += info.cost;
    person.actualCost += info.actualCost;
    person.tasks += 1;
  }
  for (const task of project.tasks) {
    const info = sched.info?.(task.id);
    if (!info || task.active === false) continue;
    totals.fixed += Number(task.fixedCost) || 0;
    // Every top-level row is a phase (a summary, or a task on its own), in plan order.
    if ((task.outlineLevel ?? 1) <= 1) {
      const p = phases.get(task.id) ?? { id: task.id, name: task.name, labor: 0, cost: 0 };
      phases.delete(task.id);
      phases.set(task.id, { ...p, cost: info.cost ?? 0 });
    }
  }
  // Labor in the baseline: the share of labor in each task's baseline cost is not stored,
  // so the baseline labor is the current labor scaled by baseline work / work.
  const baseWork = project.tasks.reduce((sum, task) => {
    const info = sched.info?.(task.id);
    return info && !info.summary ? sum + (Number(task.baselines?.[0]?.work) || 0) : sum;
  }, 0);
  totals.baselineLabor = totals.laborWork ? Math.round((totals.labor * baseWork) / totals.laborWork) : 0;
  const total = totals.labor + totals.material + totals.costResource + totals.fixed;
  const share = (value) => (total ? value / total : 0);
  const list = [...people.values()].sort((a, b) => b.cost - a.cost).map((p) => ({ ...p, share: totals.labor ? p.cost / totals.labor : 0 }));
  return {
    total,
    labor: totals.labor,
    material: totals.material,
    costResource: totals.costResource,
    fixed: totals.fixed,
    laborShare: share(totals.labor),
    actualLabor: totals.actualLabor,
    remainingLabor: totals.labor - totals.actualLabor,
    laborWork: totals.laborWork,
    actualLaborWork: totals.actualLaborWork,
    baselineLabor: totals.baselineLabor,
    averageHourly: totals.laborWork ? totals.labor / (totals.laborWork / 60) : 0,
    people: list,
    phases: [...phases.values()].map((p) => ({ ...p, share: p.cost ? p.labor / p.cost : 0 })),
  };
}
