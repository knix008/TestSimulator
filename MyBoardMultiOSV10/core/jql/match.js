// Resolved predicates evaluated in memory over a hydrated issue (see index.js for the issue shape).
// Mirrors compile.js exactly; the tests run both over the same data and compare.
import { resolve } from './resolve.js';

const lc = (s) => (s == null ? null : String(s).toLowerCase());

/**
 * @param {string|object|null} textOrAst
 * @param {import('./resolve.js').JqlOptions} [opts]
 * @returns {(issue: object) => boolean}
 */
export function createMatcher(textOrAst, opts = {}) {
  const { where } = resolve(textOrAst, opts);
  if (!where) return () => true;
  const env = {
    priorities: opts.priorities || [],
    users: opts.users || [],
  };
  return (issue) => evalPred(where, issue, env);
}

/**
 * @param {string|object|null} textOrAst
 * @param {import('./resolve.js').JqlOptions} [opts]
 * @returns {((a: object, b: object) => number) | null}
 */
export function createComparator(textOrAst, opts = {}) {
  const { order } = resolve(textOrAst, opts);
  if (!order.length) return null;
  const keys = [];
  for (const { f, dir } of order) for (const [get, invert] of orderGetters(f)) keys.push({ get, desc: (dir === 'desc') !== invert });
  return (a, b) => {
    for (const k of keys) {
      const va = k.get(a);
      const vb = k.get(b);
      const na = va == null;
      const nb = vb == null;
      if (na !== nb) return na ? 1 : -1; // NULLs last
      if (na) continue;
      if (va < vb) return k.desc ? 1 : -1;
      if (va > vb) return k.desc ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

function orderGetters(f) {
  const g = (fn) => [[fn, false]];
  switch (f.name) {
    case 'rank': return g((i) => i.rank);
    case 'key': return [[(i) => i.project?.key ?? null, false], [(i) => i.number, false]];
    case 'project': return g((i) => i.project?.key ?? null);
    case 'created': return g((i) => i.created);
    case 'updated': return g((i) => i.updated);
    case 'resolved': return g((i) => i.resolved ?? null);
    case 'due': return g((i) => i.due ?? null);
    case 'storyPoints': return g((i) => i.storyPoints ?? null);
    case 'summary': return g((i) => lc(i.summary));
    case 'priority': return [[(i) => i.priority?.position ?? null, true]];
    case 'status': return g((i) => i.status?.position ?? null);
    case 'type': return g((i) => i.type?.position ?? null);
    case 'assignee': return g((i) => lc(i.assignee?.displayName));
    case 'reporter': return g((i) => lc(i.reporter?.displayName));
  }
  throw new Error(`cannot order by ${f.name}`);
}

function cmpOp(a, op, b) {
  switch (op) {
    case '=': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
  }
  return false;
}

/** Candidate strings a lookup object matches on (id + lower-cased names), per field lookup.cols. */
function candidates(obj, lookup) {
  return lookup.cols.map(([, prop]) => lc(obj[prop])).filter((x) => x != null);
}

function multiItems(issue, f) {
  const m = f.multi;
  if (m.type === 'labels') return (issue.labels || []).map((l) => lc(l));
  if (m.type === 'component') return issue.components || [];
  return issue[m.prop] || [];
}

function evalPred(x, issue, env) {
  switch (x.t) {
    case 'and': return x.items.every((i) => evalPred(i, issue, env));
    case 'or': return x.items.some((i) => evalPred(i, issue, env));
    case 'not': return !evalPred(x.item, issue, env);
    case 'const': return x.value;
    case 'ref': {
      const obj = issue[x.f.prop];
      if (obj == null) return false;
      const hit = candidates(obj, x.f.lookup).some((c) => x.values.includes(c));
      return x.neg ? !hit : hit;
    }
    case 'empty': {
      const v = issue[x.f.prop];
      const empty = v == null || (x.f.kind === 'text' && v === '');
      return x.not ? !empty : empty;
    }
    case 'category': {
      const hit = x.values.includes(issue.status?.category);
      return x.neg ? !hit : hit;
    }
    case 'prioCmp': {
      if (!issue.priority) return false;
      const target = env.priorities.filter((p) => lc(p.id) === x.value || lc(p.name) === x.value);
      if (!target.length) return false;
      const pos = Math.min(...target.map((p) => p.position));
      const own = issue.priority.position ?? env.priorities.find((p) => p.id === issue.priority.id)?.position;
      return own != null && cmpOp(own, x.cmp, pos);
    }
    case 'key': {
      const hit = x.keys.includes(String(issue.key).toUpperCase()) || x.ids.includes(lc(issue.id));
      return x.neg ? !hit : hit;
    }
    case 'keyCmp':
      return String(issue.project?.key).toUpperCase() === x.project && cmpOp(issue.number, x.cmp, x.number);
    case 'multi': {
      const items = multiItems(issue, x.f);
      const hit = x.f.multi.type === 'labels'
        ? items.some((l) => x.values.includes(l))
        : items.some((o) => x.values.includes(lc(o.id)) || x.values.includes(lc(o.name)));
      return x.neg ? !hit : hit;
    }
    case 'multiLike': {
      const hit = multiItems(issue, x.f).some((l) => l.includes(x.value));
      return x.neg ? !hit : hit;
    }
    case 'multiEmpty': {
      const empty = multiItems(issue, x.f).length === 0;
      return x.not ? !empty : empty;
    }
    case 'cmp': {
      let v = issue[x.f.prop];
      if (v == null) return false;
      if (x.f.kind === 'text') v = lc(v);
      return cmpOp(v, x.cmp, x.value);
    }
    case 'inNum': {
      const v = issue[x.f.prop];
      if (v == null) return false;
      const hit = x.values.includes(v);
      return x.neg ? !hit : hit;
    }
    case 'like': {
      const v = issue[x.f.prop];
      if (v == null) return false;
      const hit = lc(v).includes(x.value);
      return x.neg ? !hit : hit;
    }
    case 'alltext': {
      const hit = lc(issue.summary || '').includes(x.value) || (issue.description != null && lc(issue.description).includes(x.value)) || lc(issue.key || '').includes(x.value);
      return x.neg ? !hit : hit;
    }
    case 'bool': return (issue[x.f.prop] ? 1 : 0) === x.value;
    case 'cv': {
      const row = customRow(x.cf, issue.custom ? issue.custom[x.cf.id] : undefined);
      const v = row ? row[x.col] : null;
      const exists = v != null && cvTest(x.test, v, env);
      return x.neg ? !exists : exists;
    }
  }
  throw new Error(`unknown predicate ${x.t}`);
}

function cvTest(t, v, env) {
  switch (t.op) {
    case 'present': return true;
    case 'cmp': return cmpOp(v, t.cmp, t.value);
    case 'in': return t.values.includes(v);
    case 'notIn': return !t.values.includes(v);
    case 'likeAny': return t.subs.some((s) => v.includes(s));
    case 'notLike': return !v.includes(t.sub);
    case 'user': {
      const u = env.users.find((x) => lc(x.id) === v);
      const names = u ? [lc(u.username), lc(u.displayName ?? u.display_name)] : [];
      const hit = t.values.includes(v) || names.some((n) => n != null && t.values.includes(n));
      return t.neg ? !hit : hit;
    }
  }
  return false;
}

/**
 * A custom field value in its stored query form — must equal what the services write into
 * custom_values.text_value / num_value (see index.js `customValueColumns`).
 * @returns {{ text: string|null, num: number|null } | null}
 */
export function customRow(cf, raw) {
  if (raw == null || raw === '') return null;
  switch (cf.type) {
    case 'number': { const n = Number(raw); return Number.isFinite(n) ? { text: null, num: n } : null; }
    case 'checkbox': return { text: null, num: raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0 };
    case 'multiselect':
    case 'labels': {
      const arr = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x).toLowerCase()).filter(Boolean);
      return arr.length ? { text: ('|' + arr.join('|') + '|').slice(0, 191), num: null } : null;
    }
    default: return { text: String(raw).toLowerCase().slice(0, 191), num: null };
  }
}
