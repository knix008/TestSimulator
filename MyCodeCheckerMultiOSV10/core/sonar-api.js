'use strict';

// A SonarQube-compatible subset of the Web API (/api/<area>/<action>), so
// dashboards, IDE plugins and scripts written for SonarQube can read results.
// Every route goes through api.call, so permissions apply as for the UI.

const { isClosed } = require('./ratings');

const SEVERITY_TO_IMPACT = { BLOCKER: 'BLOCKER', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'INFO' };
const QUALITY = { BUG: 'RELIABILITY', VULNERABILITY: 'SECURITY', CODE_SMELL: 'MAINTAINABILITY', SECURITY_HOTSPOT: 'SECURITY' };
const TRANSITIONS = {
  confirm: { status: 'CONFIRMED' },
  unconfirm: { status: 'REOPENED', resolution: null },
  reopen: { status: 'REOPENED', resolution: null },
  resolve: { status: 'RESOLVED', resolution: 'FIXED' },
  falsepositive: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' },
  wontfix: { status: 'RESOLVED', resolution: 'WONTFIX' },
  accept: { status: 'ACCEPTED' },
};

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function text(m, lang = 'en') {
  if (m && typeof m === 'object') return m[lang] || m.en || m.ko || '';
  return String(m || '');
}

function list(v) {
  return v == null || v === '' ? [] : String(v).split(',').map((x) => x.trim()).filter(Boolean);
}

function page(items, q) {
  const p = Math.max(1, Number(q.p) || 1);
  const ps = Math.min(500, Math.max(1, Number(q.ps) || 100));
  return { p, ps, total: items.length, slice: items.slice((p - 1) * ps, p * ps) };
}

function createSonarApi(api, opts = {}) {
  const version = opts.version || '1.0.0';

  async function ws(ctx) {
    return api.call('workspace.load', {}, ctx);
  }

  function projectByKey(w, key) {
    const p = (w.projects || []).find((x) => x.key === key || x.id === key);
    if (!p) throw fail('NOT_FOUND', `Component key '${key}' not found`);
    return p;
  }

  // "project:key:path/file.js" -> { project, file }; project keys may contain ':'.
  function componentOf(w, comp) {
    const c = String(comp || '');
    const p = (w.projects || []).filter((x) => c === x.key || c === x.id || c.startsWith(`${x.key}:`)).sort((a, b) => b.key.length - a.key.length)[0];
    if (!p) throw fail('NOT_FOUND', `Component key '${c}' not found`);
    return { project: p, file: c.length > p.key.length && c !== p.id ? c.slice(p.key.length + 1) : '' };
  }

  function branchOf(p, name) {
    const b = (p.branches || {})[name || p.mainBranch || 'main'];
    if (!b || !b.latest) throw fail('NOT_FOUND', `No analysis for '${p.key}'${name ? ` branch '${name}'` : ''}`);
    return b;
  }

  function issueJson(p, i) {
    const status = i.type === 'SECURITY_HOTSPOT' ? (i.status || 'TO_REVIEW') : (isClosed(i) ? (i.status === 'ACCEPTED' ? 'ACCEPTED' : 'RESOLVED') : (i.status || 'OPEN'));
    return {
      key: i.key,
      rule: i.rule,
      severity: i.severity,
      component: `${p.key}:${i.file}`,
      project: p.key,
      line: i.line,
      textRange: { startLine: i.line, endLine: i.endLine || i.line, startOffset: Math.max(0, (i.column || 1) - 1), endOffset: Math.max(0, (i.endColumn || i.column || 1) - 1) },
      flows: (i.events || []).length > 1 ? [{ locations: i.events.map((e) => ({ component: `${p.key}:${e.file || i.file}`, textRange: { startLine: e.line, endLine: e.line }, msg: text(e.text) })) }] : [],
      status,
      issueStatus: status === 'RESOLVED' && i.resolution === 'FALSE-POSITIVE' ? 'FALSE_POSITIVE' : status,
      resolution: i.resolution ? String(i.resolution).replace('-', '_') : undefined,
      message: text(i.message),
      effort: `${i.debtMin || 0}min`,
      debt: `${i.debtMin || 0}min`,
      assignee: i.assignee || undefined,
      author: i.author || '',
      tags: i.tags || [],
      type: i.type,
      impacts: [{ softwareQuality: QUALITY[i.type] || 'MAINTAINABILITY', severity: SEVERITY_TO_IMPACT[i.severity] || 'MEDIUM' }],
      creationDate: i.createdAt || null,
      updateDate: i.updatedAt || i.createdAt || null,
      comments: (i.comments || []).map((c, n) => ({ key: `${i.key}-${n}`, login: c.author, markdown: c.text, createdAt: c.at })),
      isNew: !!i.isNew,
    };
  }

  const routes = {
    'GET system/status': async () => ({ id: 'mycodechecker', version, status: 'UP' }),
    'GET system/health': async () => ({ health: 'GREEN', causes: [] }),
    'GET server/version': async () => ({ raw: version }),
    'GET authentication/validate': async (q, ctx) => {
      try { await api.call('security.me', {}, ctx); return { valid: true }; } catch { return { valid: false }; }
    },

    'GET projects/search': async (q, ctx) => {
      const w = await ws(ctx);
      const term = String(q.q || '').toLowerCase();
      const rows = (w.projects || []).filter((p) => !term || p.key.toLowerCase().includes(term) || String(p.name).toLowerCase().includes(term));
      const pg = page(rows, q);
      return { paging: { pageIndex: pg.p, pageSize: pg.ps, total: pg.total }, components: pg.slice.map((p) => ({ key: p.key, name: p.name, qualifier: 'TRK', visibility: 'private', lastAnalysisDate: p.updatedAt || null })) };
    },
    'GET components/show': async (q, ctx) => {
      const w = await ws(ctx);
      const { project: p, file } = componentOf(w, q.component);
      return { component: file ? { key: q.component, name: file.split('/').pop(), qualifier: 'FIL', path: file, project: p.key } : { key: p.key, name: p.name, qualifier: 'TRK' } };
    },
    'GET project_branches/list': async (q, ctx) => {
      const p = projectByKey(await ws(ctx), q.project);
      return { branches: Object.entries(p.branches || {}).map(([name, b]) => ({ name, isMain: name === (p.mainBranch || 'main'), type: 'BRANCH', status: { qualityGateStatus: b.gate || (b.latest && b.latest.qualityGate.status) }, analysisDate: b.updatedAt })) };
    },

    'GET issues/search': async (q, ctx) => {
      const w = await ws(ctx);
      const keys = list(q.componentKeys || q.components || q.projects || q.projectKeys);
      const projects = keys.length ? keys.map((k) => componentOf(w, k).project) : (w.projects || []);
      const types = new Set(list(q.types));
      const sev = new Set(list(q.severities));
      const statuses = new Set(list(q.statuses || q.issueStatuses));
      const rules = new Set(list(q.rules));
      const tags = new Set(list(q.tags));
      const issueKeys = new Set(list(q.issues));
      const resolved = q.resolved == null ? null : String(q.resolved) === 'true';
      const after = q.createdAfter ? Date.parse(q.createdAfter) : null;
      const rows = [];
      for (const p of projects) {
        const b = (p.branches || {})[q.branch || p.mainBranch || 'main'];
        if (!b || !b.latest) continue;
        for (const i of b.latest.issues || []) {
          if (i.type === 'SECURITY_HOTSPOT') continue;
          const j = issueJson(p, i);
          if (types.size && !types.has(j.type)) continue;
          if (sev.size && !sev.has(j.severity)) continue;
          if (statuses.size && !statuses.has(j.status) && !statuses.has(j.issueStatus)) continue;
          if (rules.size && !rules.has(j.rule)) continue;
          if (tags.size && !j.tags.some((t) => tags.has(t))) continue;
          if (issueKeys.size && !issueKeys.has(j.key)) continue;
          if (resolved !== null && resolved !== isClosed(i)) continue;
          if (q.inNewCodePeriod === 'true' && !i.isNew) continue;
          if (after && !(j.creationDate && Date.parse(j.creationDate) >= after)) continue;
          rows.push(j);
        }
      }
      const pg = page(rows, q);
      const facets = list(q.facets).map((property) => {
        const counts = {};
        for (const r of rows) for (const v of [].concat(property === 'tags' ? r.tags : r[property === 'types' ? 'type' : property === 'severities' ? 'severity' : property === 'statuses' ? 'status' : property === 'rules' ? 'rule' : property])) counts[v] = (counts[v] || 0) + 1;
        return { property, values: Object.entries(counts).map(([val, count]) => ({ val, count })).sort((a, b) => b.count - a.count) };
      });
      const comps = [...new Set(pg.slice.map((r) => r.component))].map((key) => ({ key, qualifier: 'FIL', path: componentOf(w, key).file, name: key.split('/').pop() }));
      return { total: pg.total, p: pg.p, ps: pg.ps, paging: { pageIndex: pg.p, pageSize: pg.ps, total: pg.total }, effortTotal: rows.reduce((n, r) => n + parseInt(r.effort, 10), 0), issues: pg.slice, components: comps, facets };
    },
    'GET hotspots/search': async (q, ctx) => {
      const p = projectByKey(await ws(ctx), q.projectKey || q.project);
      const b = branchOf(p, q.branch);
      const rows = (b.latest.issues || []).filter((i) => i.type === 'SECURITY_HOTSPOT' && (!q.status || (i.status || 'TO_REVIEW') === q.status)).map((i) => ({
        key: i.key, component: `${p.key}:${i.file}`, project: p.key, securityCategory: (i.tags || []).find((t) => /^cwe-/.test(t)) || 'others',
        vulnerabilityProbability: i.severity === 'BLOCKER' || i.severity === 'CRITICAL' ? 'HIGH' : i.severity === 'MAJOR' ? 'MEDIUM' : 'LOW',
        status: i.status === 'SAFE' || i.status === 'FIXED' || i.status === 'ACKNOWLEDGED' ? 'REVIEWED' : 'TO_REVIEW',
        resolution: i.status === 'SAFE' || i.status === 'FIXED' || i.status === 'ACKNOWLEDGED' ? i.status : undefined,
        line: i.line, message: text(i.message), ruleKey: i.rule, creationDate: i.createdAt || null,
      }));
      const pg = page(rows, q);
      return { paging: { pageIndex: pg.p, pageSize: pg.ps, total: pg.total }, hotspots: pg.slice };
    },
    'GET measures/component': async (q, ctx) => {
      const p = componentOf(await ws(ctx), q.component).project;
      const b = branchOf(p, q.branch);
      const m = b.latest.measures || {};
      const keys = list(q.metricKeys);
      const ratingValue = (v) => (typeof v === 'number' ? String(v) : v == null ? undefined : String(v));
      const measures = (keys.length ? keys : Object.keys(m)).filter((k) => m[k] !== undefined && m[k] !== null).map((k) => {
        const v = ratingValue(m[k]);
        return /^new_/.test(k) ? { metric: k, period: { index: 1, value: v }, periods: [{ index: 1, value: v }] } : { metric: k, value: v };
      });
      measures.push(...(keys.includes('alert_status') || !keys.length ? [{ metric: 'alert_status', value: b.latest.qualityGate.status }] : []));
      return { component: { key: p.key, name: p.name, qualifier: 'TRK', measures } };
    },
    'GET qualitygates/project_status': async (q, ctx) => {
      const p = projectByKey(await ws(ctx), q.projectKey || q.projectId);
      const b = branchOf(p, q.branch);
      const g = b.latest.qualityGate || {};
      return {
        projectStatus: {
          status: g.status,
          ignoredConditions: false,
          conditions: (g.conditions || []).map((c) => ({ status: c.status, metricKey: c.metric, comparator: c.op || 'GT', errorThreshold: String(c.threshold ?? ''), actualValue: c.actual == null ? undefined : String(c.actual) })),
          period: { mode: 'PREVIOUS_VERSION', date: b.updatedAt || null },
        },
      };
    },
    'GET qualitygates/list': async (q, ctx) => {
      const w = await ws(ctx);
      return { qualitygates: (w.gates || []).map((g) => ({ id: g.id, name: g.name, isDefault: !!g.isDefault, isBuiltIn: g.id === 'sonar-way' })) };
    },
    'GET qualityprofiles/search': async (q, ctx) => {
      const w = await ws(ctx);
      return { profiles: (w.profiles || []).filter((p) => !q.language || p.language === q.language).map((p) => ({ key: p.id, name: p.name, language: p.language, isDefault: !!p.isDefault, parentKey: p.parentId || undefined, isInherited: !!p.parentId })) };
    },
    'GET rules/search': async (q, ctx) => {
      const rules = await api.call('rules.list', {}, ctx);
      const term = String(q.q || '').toLowerCase();
      const langs = new Set(list(q.languages));
      const types = new Set(list(q.types));
      const sev = new Set(list(q.severities));
      const tags = new Set(list(q.tags));
      const rows = rules.filter((r) => (!term || r.key.toLowerCase().includes(term) || text(r.name).toLowerCase().includes(term))
        && (!langs.size || (r.langs || []).some((l) => langs.has(l)))
        && (!types.size || types.has(r.type)) && (!sev.size || sev.has(r.severity))
        && (!tags.size || (r.tags || []).some((t) => tags.has(t))));
      const pg = page(rows, q);
      return { total: pg.total, p: pg.p, ps: pg.ps, rules: pg.slice.map((r) => ({ key: r.key, repo: r.key.split(':')[0], name: text(r.name, q.lang || 'en'), severity: r.severity, type: r.type, lang: (r.langs || [])[0], langs: r.langs, tags: r.tags || [], sysTags: r.tags || [], htmlDesc: `<p>${text(r.why, q.lang || 'en')}</p><h3>How to fix</h3><p>${text(r.fix, q.lang || 'en')}</p>`, impacts: r.impacts || undefined })) };
    },
    'GET rules/show': async (q, ctx) => {
      const rules = await api.call('rules.list', {}, ctx);
      const r = rules.find((x) => x.key === q.key);
      if (!r) throw fail('NOT_FOUND', `Rule not found: ${q.key}`);
      return { rule: { key: r.key, name: text(r.name), severity: r.severity, type: r.type, langs: r.langs, tags: r.tags || [], htmlDesc: `<p>${text(r.why)}</p><p>${text(r.fix)}</p>`, standards: r.standards || {} } };
    },
    'GET ce/activity': async (q, ctx) => {
      const w = await ws(ctx);
      const p = q.component ? projectByKey(w, q.component) : null;
      return { tasks: (w.tasks || []).filter((t) => !p || t.projectId === p.id).map((t) => ({ id: t.id, type: 'REPORT', componentKey: ((w.projects || []).find((x) => x.id === t.projectId) || {}).key, status: t.status, submittedAt: t.submittedAt, executedAt: t.executedAt, executionTimeMs: t.durationMs, branch: t.branch, errorMessage: t.error })) };
    },

    'POST issues/do_transition': async (q, ctx) => {
      const patch = TRANSITIONS[q.transition];
      if (!patch) throw fail('BAD_REQUEST', `Unknown transition: ${q.transition}`);
      return updateOne(q.issue, patch, ctx);
    },
    'POST issues/assign': async (q, ctx) => updateOne(q.issue, { assignee: q.assignee || '' }, ctx),
    'POST issues/add_comment': async (q, ctx) => updateOne(q.issue, { comment: q.text || '' }, ctx),
    'POST issues/set_tags': async (q, ctx) => updateOne(q.issue, { tags: list(q.tags) }, ctx),
  };

  async function updateOne(key, patch, ctx) {
    const w = await ws(ctx);
    for (const p of w.projects || []) {
      for (const b of Object.values(p.branches || {})) {
        const i = b.latest && (b.latest.issues || []).find((x) => x.key === key);
        if (i) {
          await api.call('issue.update', { projectId: p.id, keys: [key], patch }, ctx);
          const after = await ws(ctx);
          const pp = after.projects.find((x) => x.id === p.id);
          const fresh = Object.values(pp.branches || {}).map((x) => x.latest && x.latest.issues.find((y) => y.key === key)).find(Boolean);
          return { issue: issueJson(pp, fresh) };
        }
      }
    }
    throw fail('NOT_FOUND', `Issue with key '${key}' does not exist`);
  }

  /** Handle `${method} ${area/action}`; returns undefined when the route is unknown. */
  async function route(method, name, query, ctx) {
    const fn = routes[`${method} ${name}`] || (method === 'POST' ? routes[`GET ${name}`] : null);
    if (!fn) return undefined;
    return fn(query || {}, ctx || {});
  }

  return { route, routes: Object.keys(routes) };
}

module.exports = { createSonarApi };
