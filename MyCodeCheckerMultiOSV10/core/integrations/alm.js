'use strict';

// Pull request decoration over the real ALM APIs. The payloads come from
// core/platform/pullrequest.js (used read-only here); this module only posts
// them.
//
//   GitHub:    Checks API (create the run, then PATCH further annotation
//              batches of 50) + a PR summary comment upserted by a hidden marker.
//   GitLab:    MR note upsert + optional commit status; the Code Quality JSON
//              is a CI artifact, so it is returned and optionally written to disk.
//   Azure:     PR threads (one per new issue, deduplicated by fingerprint,
//              fixed ones resolved), a summary thread upsert, and a PR status.
//   Bitbucket: Code Insights report + annotations (Cloud 2.0 or Server/DC insights 1.0).
//
// payload may be any of:
//   { pr, markdown?, decorations? }   what api.analyzePullRequest returns
//   the analyzePullRequest() result itself ({ issues, qualityGate, ... })
//   the provider's raw builder output (githubCheckRun array, gitlabCodeQuality
//   array, azureDevOps {threads,status}, bitbucketCodeInsights {report,annotations})

const fs = require('fs');
const path = require('path');
const pullrequest = require('../platform/pullrequest');
const { client, basicAuth } = require('./http');

const PROVIDERS = ['github', 'gitlab', 'azure', 'bitbucket'];

function trimBase(u, fallback) {
  return String(u || fallback || '').replace(/\/+$/, '');
}

function configError(provider, key) {
  const err = new Error(`${provider}: ${key} is required`);
  err.code = 'ECONFIG';
  err.text = { en: `${provider} setting "${key}" is missing.`, ko: `${provider} 설정 "${key}" 값이 없습니다.` };
  return err;
}

function need(provider, config, keys) {
  for (const k of keys) if (config[k] == null || config[k] === '') throw configError(provider, k);
}

/** Hidden marker that identifies our summary comment. */
function marker(config = {}) {
  return `<!-- mycodechecker:pr-summary${config.markerKey ? `:${config.markerKey}` : ''} -->`;
}

function isPr(p) {
  return p && Array.isArray(p.issues) && p.qualityGate && typeof p.qualityGate === 'object';
}

/** Turn any accepted payload into { deco, markdown, gateOk }. */
function resolvePayload(provider, payload, config = {}) {
  const p = payload || {};
  const lang = config.lang || 'en';
  const pr = isPr(p.pr) ? p.pr : isPr(p) ? p : null;
  let deco;
  if (p.decorations && p.decorations[provider] != null) deco = p.decorations[provider];
  else if (pr) {
    const opts = { headSha: config.headSha, lang, detailsUrl: config.detailsUrl, targetUrl: config.detailsUrl, link: config.detailsUrl, name: config.checkName };
    if (provider === 'github') deco = pullrequest.githubCheckRun(pr, opts);
    else if (provider === 'gitlab') deco = pullrequest.gitlabCodeQuality(pr, opts);
    else if (provider === 'azure') deco = pullrequest.azureDevOps(pr, opts);
    else deco = pullrequest.bitbucketCodeInsights(pr, opts);
  } else deco = p.payload != null ? p.payload : p;
  let markdown = p.markdown || null;
  if (!markdown && pr) markdown = pullrequest.summaryMarkdown(pr, { lang, url: config.detailsUrl });
  if (!markdown && provider === 'github' && Array.isArray(deco) && deco[0] && deco[0].output) markdown = deco[0].output.summary || null;
  let gateOk = null;
  if (pr) gateOk = pr.qualityGate.status === 'OK';
  else if (provider === 'github' && Array.isArray(deco) && deco[0]) gateOk = deco[0].conclusion === 'success';
  else if (provider === 'azure' && deco && deco.status) gateOk = deco.status.state === 'succeeded';
  else if (provider === 'bitbucket' && deco && deco.report) gateOk = deco.report.result === 'PASSED';
  if (gateOk == null && config.gateStatus) gateOk = config.gateStatus === 'OK';
  if (!markdown) {
    const n = Array.isArray(deco) ? deco.length : 0;
    markdown = lang === 'ko'
      ? `## ${gateOk === false ? '❌ 품질 게이트 실패' : '✅ 품질 게이트 통과'}\n\n새 이슈 ${n}개`
      : `## ${gateOk === false ? '❌ Quality Gate failed' : '✅ Quality Gate passed'}\n\n${n} new issue${n === 1 ? '' : 's'}`;
  }
  return { deco, markdown, gateOk, pr };
}

/** http client that counts requests. */
function counted(defaults) {
  const c = client(defaults);
  const stats = { requests: 0 };
  const wrap = (fn) => (...args) => { stats.requests++; return fn(...args); };
  return { get: wrap(c.get), post: wrap(c.post), put: wrap(c.put), patch: wrap(c.patch), del: wrap(c.del), stats };
}

function transportOpts(config) {
  return { timeoutMs: config.timeoutMs, retries: config.retries, transport: config.transport, rejectUnauthorized: config.rejectUnauthorized, ca: config.ca };
}

function chunk(list, size) {
  const out = [];
  for (let n = 0; n < list.length; n += size) out.push(list.slice(n, n + size));
  return out;
}

/** Page through a list endpoint (array responses) until a short page. */
async function listAll(http, url, sep, maxPages = 20) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await http.get(`${url}${sep}per_page=100&page=${page}`);
    const items = Array.isArray(res.json) ? res.json : [];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// GitHub

async function github(config, payload) {
  need('GitHub', config, ['token', 'owner', 'repo']);
  const { deco, markdown } = resolvePayload('github', payload, config);
  const runs = Array.isArray(deco) ? deco : [deco];
  const http = counted({
    baseUrl: trimBase(config.apiUrl, 'https://api.github.com'),
    headers: { authorization: `Bearer ${config.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    ...transportOpts(config),
  });
  const repo = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const result = { provider: 'github', checkRunId: null, checkRunUrl: '', annotations: 0, comment: null, requests: 0 };
  if (config.checkRun !== false && runs.length && runs[0]) {
    const first = runs[0];
    const { output = {}, ...base } = first;
    if (config.headSha) base.head_sha = config.headSha;
    if (!base.head_sha) throw configError('GitHub', 'headSha');
    if (config.checkName) base.name = config.checkName;
    const annotations = runs.flatMap((r) => (r && r.output && r.output.annotations) || []);
    const batches = chunk(annotations, 50);
    const out = (anns) => ({ title: output.title || 'MyCodeChecker', summary: (output.summary || markdown || '').slice(0, 65535), annotations: anns });
    const created = await http.post(`${repo}/check-runs`, { ...base, output: out(batches[0] || []) });
    result.checkRunId = created.json && created.json.id;
    result.checkRunUrl = (created.json && created.json.html_url) || '';
    for (const b of batches.slice(1)) await http.patch(`${repo}/check-runs/${result.checkRunId}`, { output: out(b) });
    result.annotations = annotations.length;
  }
  if (config.comment !== false && config.prNumber != null) {
    const mark = marker(config);
    const body = `${mark}\n${markdown}`;
    const comments = await listAll(http, `${repo}/issues/${config.prNumber}/comments`, '?');
    const mine = comments.find((c) => typeof c.body === 'string' && c.body.includes(mark));
    if (mine) {
      const res = await http.patch(`${repo}/issues/comments/${mine.id}`, { body });
      result.comment = { id: mine.id, action: 'updated', url: (res.json && res.json.html_url) || mine.html_url || '' };
    } else {
      const res = await http.post(`${repo}/issues/${config.prNumber}/comments`, { body });
      result.comment = { id: res.json && res.json.id, action: 'created', url: (res.json && res.json.html_url) || '' };
    }
  }
  result.requests = http.stats.requests;
  return result;
}

// ---------------------------------------------------------------------------
// GitLab

async function gitlab(config, payload) {
  need('GitLab', config, ['token', 'projectId']);
  const { deco, markdown, gateOk } = resolvePayload('gitlab', payload, config);
  const codeQuality = Array.isArray(deco) ? deco : (deco && deco.codeQuality) || [];
  const http = counted({
    baseUrl: `${trimBase(config.baseUrl, 'https://gitlab.com')}/api/v4/projects/${encodeURIComponent(config.projectId)}`,
    headers: config.oauth ? { authorization: `Bearer ${config.token}` } : { 'private-token': config.token },
    ...transportOpts(config),
  });
  const result = { provider: 'gitlab', note: null, status: null, codeQuality, reportPath: null, requests: 0 };
  if (config.reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(config.reportPath)), { recursive: true });
    fs.writeFileSync(config.reportPath, JSON.stringify(codeQuality, null, 2));
    result.reportPath = config.reportPath;
  }
  if (config.comment !== false && config.mrIid != null) {
    const mark = marker(config);
    const body = `${mark}\n${markdown}`;
    const notesUrl = `/merge_requests/${encodeURIComponent(config.mrIid)}/notes`;
    const notes = await listAll(http, `${notesUrl}?sort=asc&order_by=created_at`, '&');
    const mine = notes.find((n) => !n.system && typeof n.body === 'string' && n.body.includes(mark));
    if (mine) {
      await http.put(`${notesUrl}/${mine.id}`, { body });
      result.note = { id: mine.id, action: 'updated' };
    } else {
      const res = await http.post(notesUrl, { body });
      result.note = { id: res.json && res.json.id, action: 'created' };
    }
  }
  if (config.headSha && config.status !== false) {
    const status = {
      state: gateOk === false ? 'failed' : 'success',
      name: config.checkName || 'MyCodeChecker',
      description: gateOk === false ? 'Quality Gate failed' : 'Quality Gate passed',
      ...(config.detailsUrl ? { target_url: config.detailsUrl } : {}),
      ...(config.ref ? { ref: config.ref } : {}),
    };
    await http.post(`/statuses/${encodeURIComponent(config.headSha)}`, status);
    result.status = status;
  }
  result.requests = http.stats.requests;
  return result;
}

// ---------------------------------------------------------------------------
// Azure DevOps

function fpOf(thread) {
  const p = thread && thread.properties && thread.properties.mycodechecker;
  if (!p) return null;
  return typeof p === 'object' ? (p.$value != null ? String(p.$value) : null) : String(p);
}

async function azure(config, payload) {
  need('Azure DevOps', config, ['token', 'project', 'repositoryId', 'pullRequestId']);
  if (!config.baseUrl && !config.organization) throw configError('Azure DevOps', 'organization');
  const { deco, markdown } = resolvePayload('azure', payload, config);
  const threads = (deco && deco.threads) || [];
  const v = config.apiVersion || '7.1';
  const http = counted({
    baseUrl: `${trimBase(config.baseUrl, `https://dev.azure.com/${encodeURIComponent(config.organization || '')}`)}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repositoryId)}/pullRequests/${encodeURIComponent(config.pullRequestId)}`,
    headers: { authorization: config.bearer ? `Bearer ${config.token}` : basicAuth('', config.token) },
    ...transportOpts(config),
  });
  const result = { provider: 'azure', created: 0, skipped: 0, resolved: 0, summary: null, status: null, requests: 0 };
  const existing = await http.get(`/threads?api-version=${v}`);
  const list = (existing.json && existing.json.value) || [];
  const known = new Map();
  for (const t of list) { const fp = fpOf(t); if (fp) known.set(fp, t); }
  const current = new Set();
  for (const t of threads) {
    const fp = fpOf(t);
    if (fp) current.add(fp);
    if (fp && known.has(fp)) { result.skipped++; continue; }
    await http.post(`/threads?api-version=${v}`, t);
    result.created++;
  }
  if (config.resolveFixed !== false) {
    for (const [fp, t] of known) {
      // 1 = active, 2 = fixed.
      if (!current.has(fp) && (t.status === 1 || t.status === 'active')) { await http.patch(`/threads/${t.id}?api-version=${v}`, { status: 2 }); result.resolved++; }
    }
  }
  if (config.comment !== false) {
    const mark = marker(config);
    const content = `${mark}\n${markdown}`;
    const mine = list.find((t) => Array.isArray(t.comments) && t.comments[0] && typeof t.comments[0].content === 'string' && t.comments[0].content.includes(mark));
    if (mine) {
      await http.patch(`/threads/${mine.id}/comments/${mine.comments[0].id}?api-version=${v}`, { content });
      result.summary = { id: mine.id, action: 'updated' };
    } else {
      const res = await http.post(`/threads?api-version=${v}`, { comments: [{ parentCommentId: 0, commentType: 1, content }], status: 4 });
      result.summary = { id: res.json && res.json.id, action: 'created' };
    }
  }
  if (deco && deco.status && config.status !== false) {
    await http.post(`/statuses?api-version=${v}-preview.1`, deco.status);
    result.status = deco.status;
  }
  result.requests = http.stats.requests;
  return result;
}

// ---------------------------------------------------------------------------
// Bitbucket

const SERVER_SEVERITY = { CRITICAL: 'HIGH', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

function serverReport(r) {
  return {
    title: r.title, details: r.details, reporter: r.reporter, result: r.result === 'PASSED' ? 'PASS' : r.result === 'FAILED' ? 'FAIL' : r.result,
    ...(r.link ? { link: r.link } : {}),
    data: (r.data || []).map((d) => ({ title: d.title, type: d.type, value: d.value })),
  };
}

function serverAnnotation(a) {
  return { externalId: a.external_id, path: a.path, line: a.line, message: a.summary, severity: SERVER_SEVERITY[a.severity] || 'LOW', type: a.annotation_type };
}

async function bitbucket(config, payload) {
  const server = config.flavor === 'server' || config.flavor === 'datacenter';
  const { deco } = resolvePayload('bitbucket', payload, config);
  const report = (deco && deco.report) || {};
  const annotations = ((deco && deco.annotations) || []).flat();
  const key = config.reportKey || 'mycodechecker';
  let auth;
  if (config.token) auth = `Bearer ${config.token}`;
  else if (config.user && (config.appPassword || config.password)) auth = basicAuth(config.user, config.appPassword || config.password);
  else throw configError('Bitbucket', 'token');
  const result = { provider: 'bitbucket', flavor: server ? 'server' : 'cloud', reportKey: key, annotations: annotations.length, requests: 0 };
  if (server) {
    need('Bitbucket', config, ['baseUrl', 'projectKey', 'repo', 'commit']);
    const http = counted({ baseUrl: trimBase(config.baseUrl), headers: { authorization: auth }, ...transportOpts(config) });
    const p = `/rest/insights/1.0/projects/${encodeURIComponent(config.projectKey)}/repos/${encodeURIComponent(config.repo)}/commits/${encodeURIComponent(config.commit)}/reports/${encodeURIComponent(key)}`;
    await http.del(p, { okStatuses: [404] });
    await http.put(p, serverReport(report));
    for (const b of chunk(annotations.map(serverAnnotation), 1000)) await http.post(`${p}/annotations`, { annotations: b });
    result.requests = http.stats.requests;
    return result;
  }
  need('Bitbucket', config, ['workspace', 'repo', 'commit']);
  const http = counted({ baseUrl: trimBase(config.apiUrl, 'https://api.bitbucket.org/2.0'), headers: { authorization: auth }, ...transportOpts(config) });
  const p = `/repositories/${encodeURIComponent(config.workspace)}/${encodeURIComponent(config.repo)}/commit/${encodeURIComponent(config.commit)}/reports/${encodeURIComponent(key)}`;
  await http.del(p, { okStatuses: [404] });
  await http.put(p, report);
  for (const b of chunk(annotations, 100)) await http.post(`${p}/annotations`, b);
  result.requests = http.stats.requests;
  return result;
}

/**
 * Post a PR decoration.
 * @param {'github'|'gitlab'|'azure'|'bitbucket'} provider
 * @param {object} config common: { lang?, detailsUrl?, checkName?, markerKey?, comment?:boolean, timeoutMs?, retries?, transport?, rejectUnauthorized?, ca? }
 *   github:    { apiUrl='https://api.github.com' (GHE: https://host/api/v3), token, owner, repo, headSha, prNumber?, checkRun?:boolean }
 *   gitlab:    { baseUrl='https://gitlab.com', token, oauth?, projectId, mrIid?, headSha?, ref?, status?:boolean, reportPath? }
 *   azure:     { baseUrl? (collection URL) | organization, project, repositoryId, pullRequestId, token (PAT), bearer?, apiVersion='7.1', resolveFixed?, status? }
 *   bitbucket: { flavor:'cloud'|'server', apiUrl? | baseUrl, workspace | projectKey, repo, commit, reportKey='mycodechecker', token | user+appPassword }
 * @param {object} payload see the header comment
 * @returns {Promise<object>} provider summary, always with `provider` and `requests`
 */
async function postDecoration(provider, config = {}, payload = {}) {
  switch (provider) {
    case 'github': return github(config, payload);
    case 'gitlab': return gitlab(config, payload);
    case 'azure': case 'azure-devops': case 'azuredevops': return azure(config, payload);
    case 'bitbucket': case 'bitbucket-cloud': return bitbucket(config, payload);
    case 'bitbucket-server': return bitbucket({ ...config, flavor: 'server' }, payload);
    default: {
      const err = new Error(`Unknown ALM provider: ${provider}`);
      err.code = 'ECONFIG';
      err.text = { en: `Unknown ALM provider: ${provider}`, ko: `알 수 없는 ALM 제공자입니다: ${provider}` };
      throw err;
    }
  }
}

module.exports = { PROVIDERS, postDecoration, resolvePayload, marker };
