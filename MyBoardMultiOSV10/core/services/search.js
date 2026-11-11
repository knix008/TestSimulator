// JQL validation and autocomplete with values from the database.
import { suggestContext, quoteValue, FIELDS } from '../jql/index.js';
import { likeEscape } from '../db/sqlgen.js';
import { requireUser, accessibleProjectIds, parseJson } from './common.js';

const MAX_VALUES = 30;

export function createSearch(core) {
  const db = () => core.db;

  /** Values of a field for autocomplete, filtered by prefix. */
  async function values(ctx, field, prefix) {
    const p = String(prefix || '').replace(/^["']/, '').replace(/["']$/, '').toLowerCase();
    const like = `${likeEscape(p)}%`;
    const ids = await accessibleProjectIds(db(), ctx);
    const inProj = (col) => (ids ? (ids.length ? ` AND ${col} IN (${ids.map(() => '?').join(', ')})` : ' AND 1 = 0') : '');
    const pp = ids || [];
    const distinct = async (sql, params) => [...new Set((await db().all(sql, params)).map((r) => r.v).filter(Boolean))].slice(0, MAX_VALUES);
    const named = (table, col = 'name') => distinct(`SELECT ${db().q(col)} AS v FROM ${db().q(table)} WHERE LOWER(${db().q(col)}) LIKE ? ESCAPE '!'${table === 'priorities' || table === 'resolutions' ? '' : inProj('"project_id"')} ORDER BY ${db().q(col)}`, [like, ...(table === 'priorities' || table === 'resolutions' ? [] : pp)]);
    switch (field) {
      case 'project': {
        const rows = await db().all(`SELECT "key", "name" FROM "projects" WHERE (LOWER("key") LIKE ? ESCAPE '!' OR LOWER("name") LIKE ? ESCAPE '!')${inProj('"id"')} ORDER BY "key"`, [like, like, ...pp]);
        return rows.slice(0, MAX_VALUES).map((r) => ({ label: r.key, insert: quoteValue(r.key), detail: r.name }));
      }
      case 'type': return (await named('issue_types')).map(item);
      case 'status': return (await named('statuses')).map(item);
      case 'priority': return (await named('priorities')).map(item);
      case 'resolution': return (await named('resolutions')).map(item);
      case 'component': return (await named('components')).map(item);
      case 'fixVersion':
      case 'affectedVersion': return (await named('versions')).map(item);
      case 'assignee':
      case 'reporter': {
        const rows = await db().all('SELECT "username", "display_name" FROM "users" WHERE "active" = 1 AND (LOWER("username") LIKE ? ESCAPE \'!\' OR LOWER("display_name") LIKE ? ESCAPE \'!\') ORDER BY "display_name"', [like, like]);
        return rows.slice(0, MAX_VALUES).map((r) => ({ label: r.username, insert: quoteValue(r.username), detail: r.display_name }));
      }
      case 'labels': return (await distinct(`SELECT DISTINCT l."label" AS v FROM "issue_labels" l JOIN "issues" i ON i."id" = l."issue_id" WHERE LOWER(l."label") LIKE ? ESCAPE '!'${inProj('i."project_id"')} ORDER BY v`, [like, ...pp])).map(item);
      case 'epic': {
        const rows = await db().all(`SELECT e."key", e."summary" FROM "issues" e JOIN "issue_types" t ON t."id" = e."type_id" WHERE t."level" = -1 AND (LOWER(e."key") LIKE ? ESCAPE '!' OR LOWER(e."summary") LIKE ? ESCAPE '!')${inProj('e."project_id"')} ORDER BY e."key"`, [like, `%${likeEscape(p)}%`, ...pp]);
        return rows.slice(0, MAX_VALUES).map((r) => ({ label: r.key, insert: quoteValue(r.key), detail: r.summary }));
      }
      case 'parent':
      case 'key': {
        if (!p) return [];
        const rows = await db().all(`SELECT i."key", i."summary" FROM "issues" i WHERE LOWER(i."key") LIKE ? ESCAPE '!'${inProj('i."project_id"')} ORDER BY i."key"`, [like, ...pp]);
        return rows.slice(0, MAX_VALUES).map((r) => ({ label: r.key, insert: quoteValue(r.key), detail: r.summary }));
      }
      default: {
        // custom select / multiselect fields: option values
        const cf = (await db().select('custom_fields', {})).find((f) => f.name === field || f.id === field || `cf[${f.id}]` === field);
        if (cf && ['select', 'multiselect'].includes(cf.type)) {
          return (parseJson(cf.options, []) || []).map((o) => String(o.value)).filter((v) => v.toLowerCase().startsWith(p)).slice(0, MAX_VALUES).map(item);
        }
        return [];
      }
    }
  }
  const item = (v) => ({ label: v, insert: quoteValue(v) });

  return {
    async validate(ctx, jql) { return core.services.issues.validateJql(ctx, jql); },

    /** → { kind, prefix, start, end, field?, items } (items: static + database values) */
    async suggest(ctx, text, caret) {
      requireUser(ctx);
      const fields = await core.services.issues.allFields();
      const sc = suggestContext(text || '', caret == null || caret === '' ? String(text || '').length : Number(caret), { fields });
      if (sc.kind === 'value' && sc.field) {
        const extra = await values(ctx, sc.field, sc.prefix);
        sc.items = [...extra, ...sc.items];
      }
      return sc;
    },

    fields: () => FIELDS,
  };
}
