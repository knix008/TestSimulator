// Resolved predicates → portable SQL WHERE + params (and ORDER BY).
// Portable means: `?` placeholders, "double-quoted" identifiers, LOWER(), LIKE … ESCAPE '!', IN/EXISTS
// subqueries without LIMIT, CASE — the same text runs on SQLite, MySQL/MariaDB, PostgreSQL and SQL Server
// after core/db/sqlgen.js rewriteSql().
import { likeEscape } from '../db/sqlgen.js';
import { resolve } from './resolve.js';

const Q = (n) => '"' + n + '"';

/**
 * @param {string|object|null} textOrAst
 * @param {import('./resolve.js').JqlOptions} [opts]
 * @returns {{ where: string, params: any[], orderBy: string }}
 */
export function compile(textOrAst, opts = {}) {
  const { where, order } = resolve(textOrAst, opts);
  const b = new Builder(opts.alias || 'i');
  const sql = where ? b.pred(where) : '1 = 1';
  const orderBy = order.length ? b.order(order) : '';
  return { where: sql, params: b.params, orderBy };
}

class Builder {
  constructor(alias) {
    this.a = alias;
    this.params = [];
    this.n = 0;
  }
  col(name) { return `${this.a}.${Q(name)}`; }
  p(v) { this.params.push(v); return '?'; }
  list(values) { return values.map((v) => this.p(v)).join(', '); }
  alias(prefix) { return prefix + ++this.n; }
  like(sub) { return this.p('%' + likeEscape(sub) + '%'); }

  pred(x) {
    switch (x.t) {
      case 'and': return '(' + x.items.map((i) => this.pred(i)).join(' AND ') + ')';
      case 'or': return '(' + x.items.map((i) => this.pred(i)).join(' OR ') + ')';
      case 'not': return `(NOT ${this.pred(x.item)})`;
      case 'const': return x.value ? '1 = 1' : '1 = 0';
      case 'ref': return this.ref(x);
      case 'empty': {
        const c = this.col(x.f.column);
        if (x.f.kind === 'text') return x.not ? `(${c} IS NOT NULL AND ${c} <> '')` : `(${c} IS NULL OR ${c} = '')`;
        return x.not ? `${c} IS NOT NULL` : `${c} IS NULL`;
      }
      case 'category':
        return `${this.col('status_id')} ${x.neg ? 'NOT IN' : 'IN'} (SELECT ${Q('id')} FROM ${Q('statuses')} WHERE ${Q('category')} IN (${this.list(x.values)}))`;
      case 'prioCmp': {
        const c = this.col('priority_id');
        return `(${c} IS NOT NULL AND ${c} IN (SELECT ${Q('id')} FROM ${Q('priorities')} WHERE ${Q('position')} ${x.cmp} ` +
          `(SELECT MIN(${Q('position')}) FROM ${Q('priorities')} WHERE ${Q('id')} = ${this.p(x.value)} OR LOWER(${Q('name')}) = ${this.p(x.value)})))`;
      }
      case 'key': {
        const inner = `(${this.col('key')} IN (${this.list(x.keys)}) OR ${this.col('id')} IN (${this.list(x.ids)}))`;
        return x.neg ? `(NOT ${inner})` : inner;
      }
      case 'keyCmp':
        return `(${this.col('project_id')} IN (SELECT ${Q('id')} FROM ${Q('projects')} WHERE ${Q('key')} = ${this.p(x.project)}) AND ${this.col('number')} ${x.cmp} ${this.p(x.number)})`;
      case 'multi': return (x.neg ? 'NOT ' : '') + this.multiExists(x.f, (al) => this.multiMatch(x.f, al, x.values));
      case 'multiLike': {
        if (x.f.multi.type !== 'labels') throw new Error('~ only on labels');
        return (x.neg ? 'NOT ' : '') + this.multiExists(x.f, (al) => `LOWER(${al}.${Q('label')}) LIKE ${this.like(x.value)} ESCAPE '!'`);
      }
      case 'multiEmpty': return (x.not ? '' : 'NOT ') + this.multiExists(x.f, () => '1 = 1');
      case 'cmp': return this.cmp(x);
      case 'inNum': {
        const c = this.col(x.f.column);
        return `(${c} IS NOT NULL AND ${c} ${x.neg ? 'NOT IN' : 'IN'} (${this.list(x.values)}))`;
      }
      case 'like': {
        const c = this.col(x.f.column);
        return `(${c} IS NOT NULL AND LOWER(${c}) ${x.neg ? 'NOT LIKE' : 'LIKE'} ${this.like(x.value)} ESCAPE '!')`;
      }
      case 'alltext': {
        const s = this.col('summary');
        const d = this.col('description');
        const k = this.col('key');
        const inner = `(LOWER(${s}) LIKE ${this.like(x.value)} ESCAPE '!' OR (${d} IS NOT NULL AND LOWER(${d}) LIKE ${this.like(x.value)} ESCAPE '!') OR LOWER(${k}) LIKE ${this.like(x.value)} ESCAPE '!')`;
        return x.neg ? `(NOT ${inner})` : inner;
      }
      case 'bool': return `${this.col(x.f.column)} = ${x.value}`;
      case 'cv': return this.cv(x);
    }
    throw new Error(`unknown predicate ${x.t}`);
  }

  /** Lookup subquery: ids of `table` rows whose id or lower-cased name/key is in `values`. */
  lookup(lookup, values) {
    const conds = lookup.cols.map(([sqlCol]) => (sqlCol === 'id' ? `${Q('id')} IN (${this.list(values)})` : `LOWER(${Q(sqlCol)}) IN (${this.list(values)})`));
    return `SELECT ${Q('id')} FROM ${Q(lookup.table)} WHERE ${conds.join(' OR ')}`;
  }

  ref(x) {
    const c = this.col(x.f.column);
    const sub = this.lookup(x.f.lookup, x.values);
    const test = `${c} ${x.neg ? 'NOT IN' : 'IN'} (${sub})`;
    return x.f.nullable || x.neg ? `(${c} IS NOT NULL AND ${test})` : test;
  }

  multiExists(f, cond) {
    const id = this.col('id');
    const m = f.multi;
    if (m.type === 'labels') {
      const al = this.alias('jl');
      return `EXISTS (SELECT 1 FROM ${Q('issue_labels')} ${al} WHERE ${al}.${Q('issue_id')} = ${id} AND ${cond(al)})`;
    }
    if (m.type === 'component') {
      const al = this.alias('jc');
      return `EXISTS (SELECT 1 FROM ${Q('issue_components')} ${al} WHERE ${al}.${Q('issue_id')} = ${id} AND ${cond(al)})`;
    }
    const al = this.alias('jv');
    return `EXISTS (SELECT 1 FROM ${Q('issue_versions')} ${al} WHERE ${al}.${Q('issue_id')} = ${id} AND ${al}.${Q('kind')} = '${m.kind}' AND ${cond(al)})`;
  }

  multiMatch(f, al, values) {
    const m = f.multi;
    if (m.type === 'labels') return `LOWER(${al}.${Q('label')}) IN (${this.list(values)})`;
    if (m.type === 'component') return `${al}.${Q('component_id')} IN (${this.lookup({ table: 'components', cols: [['id'], ['name']] }, values)})`;
    return `${al}.${Q('version_id')} IN (${this.lookup({ table: 'versions', cols: [['id'], ['name']] }, values)})`;
  }

  cmp(x) {
    const raw = this.col(x.f.column);
    const c = x.f.kind === 'text' ? `LOWER(${raw})` : raw;
    const op = x.cmp === '!=' ? '<>' : x.cmp;
    const test = `${c} ${op} ${this.p(x.value)}`;
    return x.f.nullable || x.cmp === '!=' ? `(${raw} IS NOT NULL AND ${test})` : test;
  }

  cv(x) {
    const al = this.alias('cv');
    const col = `${al}.${Q(x.col === 'num' ? 'num_value' : 'text_value')}`;
    const t = x.test;
    const fieldParam = this.p(x.cf.id); // placeholder order = text order
    let test;
    switch (t.op) {
      case 'present': test = '1 = 1'; break;
      case 'cmp': test = `${col} ${t.cmp === '!=' ? '<>' : t.cmp} ${this.p(t.value)}`; break;
      case 'in': test = `${col} IN (${this.list(t.values)})`; break;
      case 'notIn': test = `${col} NOT IN (${this.list(t.values)})`; break;
      case 'likeAny': test = '(' + t.subs.map((s) => `${col} LIKE ${this.like(s)} ESCAPE '!'`).join(' OR ') + ')'; break;
      case 'notLike': test = `${col} NOT LIKE ${this.like(t.sub)} ESCAPE '!'`; break;
      case 'user': {
        const direct = this.list(t.values); // pushed first: it comes first in the text
        const users = `SELECT ${Q('id')} FROM ${Q('users')} WHERE LOWER(${Q('username')}) IN (${this.list(t.values)}) OR LOWER(${Q('display_name')}) IN (${this.list(t.values)})`;
        const inner = `(${col} IN (${direct}) OR ${col} IN (${users}))`;
        test = t.neg ? `NOT ${inner}` : inner;
        break;
      }
      default: throw new Error(`unknown custom test ${t.op}`);
    }
    const exists = `EXISTS (SELECT 1 FROM ${Q('custom_values')} ${al} WHERE ${al}.${Q('issue_id')} = ${this.col('id')} AND ${al}.${Q('field_id')} = ${fieldParam} AND ${col} IS NOT NULL AND ${test})`;
    return x.neg ? `NOT ${exists}` : exists;
  }

  // ---- ORDER BY ---------------------------------------------------------------------------------------
  order(order) {
    const parts = [];
    for (const { f, dir } of order) {
      for (const [expr, invert] of this.orderExprs(f)) {
        const d = (dir === 'desc') !== invert ? ' DESC' : '';
        // NULLs always last, on every dialect
        parts.push(`CASE WHEN ${expr} IS NULL THEN 1 ELSE 0 END`, expr + d);
      }
    }
    parts.push(this.col('id'));
    // SQL Server rejects a column listed twice in ORDER BY (e.g. "ORDER BY created, created")
    const seen = new Set();
    return parts.filter((p) => { const k = p.replace(/ DESC$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }).join(', ');
  }

  /** @returns {Array<[string, boolean]>} [expression, invert direction] */
  orderExprs(f) {
    const sub = (table, col, fk) => `(SELECT ${Q(col)} FROM ${Q(table)} WHERE ${Q(table)}.${Q('id')} = ${this.col(fk)})`;
    switch (f.name) {
      case 'rank': return [[this.col('rank'), false]];
      case 'key': return [[sub('projects', 'key', 'project_id'), false], [this.col('number'), false]];
      case 'project': return [[sub('projects', 'key', 'project_id'), false]];
      case 'created': return [[this.col('created_at'), false]];
      case 'updated': return [[this.col('updated_at'), false]];
      case 'resolved': return [[this.col('resolved_at'), false]];
      case 'due': return [[this.col('due_date'), false]];
      case 'storyPoints': return [[this.col('story_points'), false]];
      case 'summary': return [[`LOWER(${this.col('summary')})`, false]];
      // ascending priority = lowest first; position 0 is Highest
      case 'priority': return [[sub('priorities', 'position', 'priority_id'), true]];
      case 'status': return [[sub('statuses', 'position', 'status_id'), false]];
      case 'type': return [[sub('issue_types', 'position', 'type_id'), false]];
      case 'assignee': return [[`(SELECT LOWER(${Q('display_name')}) FROM ${Q('users')} WHERE ${Q('users')}.${Q('id')} = ${this.col('assignee_id')})`, false]];
      case 'reporter': return [[`(SELECT LOWER(${Q('display_name')}) FROM ${Q('users')} WHERE ${Q('users')}.${Q('id')} = ${this.col('reporter_id')})`, false]];
    }
    throw new Error(`cannot order by ${f.name}`);
  }
}
