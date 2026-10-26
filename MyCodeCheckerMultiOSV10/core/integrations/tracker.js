'use strict';

// Issue tracker export: Jira Cloud / Server / Data Center (REST v3 with ADF or
// v2 with wiki markup), Redmine (issues.json), GitHub Issues and GitLab
// Issues. ticketPayload() builds the body, ticketRequest() the full request
// (pure, no network), createTicket() sends it through http.js.
//
// issue: our issue object { key?, rule, message: {en, ko}, file, line, severity,
//   type, cid?, checker?, impact?, events?: [{line, file?, tag, text: {en,ko}, main}] }

const { request, basicAuth } = require('./http');

const KINDS = ['jira', 'redmine', 'github', 'gitlab'];

const JIRA_PRIORITY = { BLOCKER: 'Highest', CRITICAL: 'High', MAJOR: 'Medium', MINOR: 'Low', INFO: 'Lowest' };
// Redmine's default priorities: 1 Low, 2 Normal, 3 High, 4 Urgent, 5 Immediate.
const REDMINE_PRIORITY = { BLOCKER: 5, CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1 };
const IMPACT_SEVERITY = { High: 'CRITICAL', Medium: 'MAJOR', Low: 'MINOR', Audit: 'INFO' };

function txt(v, lang) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return v[lang] || v.en || v.ko || '';
}

function severityOf(issue) {
  const s = String(issue.severity || '').toUpperCase();
  if (JIRA_PRIORITY[s]) return s;
  if (issue.impact && IMPACT_SEVERITY[issue.impact]) return IMPACT_SEVERITY[issue.impact];
  return 'MAJOR';
}

/** Severity → tracker priority (config.priorityMap overrides). */
function priorityFor(kind, issue, config = {}) {
  const sev = severityOf(issue);
  const map = { ...(kind === 'redmine' ? REDMINE_PRIORITY : JIRA_PRIORITY), ...(config.priorityMap || {}) };
  return map[sev];
}

function location(issue) {
  return issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '';
}

/** One-line summary: "[MAJOR] message (file:line)", at most 255 characters. */
function summaryOf(issue, lang = 'en') {
  const msg = txt(issue.message, lang) || issue.rule || 'Issue';
  const loc = location(issue);
  const s = `[${severityOf(issue)}] ${msg}${loc ? ` (${loc})` : ''}`.replace(/[\r\n]+/g, ' ');
  return s.length > 255 ? `${s.slice(0, 254)}…` : s;
}

/** Labels without spaces (Jira rejects spaces). */
function labelsOf(issue, config = {}) {
  const raw = ['mycodechecker', ...(config.labels || []), issue.type && String(issue.type).toLowerCase(), `severity-${severityOf(issue).toLowerCase()}`, issue.checker && `defectAnalysis-${issue.checker}`];
  return [...new Set(raw.filter(Boolean).map((l) => String(l).replace(/\s+/g, '-').replace(/[^\w.:-]/g, '-').slice(0, 255)))];
}

/** Structured description: facts, events, link. */
function facts(issue, lang, opts = {}) {
  const ko = lang === 'ko';
  const rows = [];
  rows.push([ko ? '규칙' : 'Rule', issue.rule || '']);
  if (issue.type) rows.push([ko ? '유형' : 'Type', issue.type]);
  rows.push([ko ? '심각도' : 'Severity', severityOf(issue)]);
  if (issue.file) rows.push([ko ? '위치' : 'Location', location(issue)]);
  if (issue.cid) rows.push(['CID', String(issue.cid)]);
  if (issue.checker) rows.push([ko ? '검사기' : 'Checker', issue.checker]);
  if (issue.impact) rows.push([ko ? '영향도' : 'Impact', issue.impact]);
  if (issue.key) rows.push([ko ? '이슈 키' : 'Issue key', issue.key]);
  const events = (issue.events || []).map((e) => ({ loc: `${e.file || issue.file || ''}:${e.line || ''}`, tag: e.tag || '', text: txt(e.text, lang), main: !!e.main }));
  return { message: txt(issue.message, lang) || issue.rule || '', rows, events, url: opts.issueUrl || '', eventsTitle: ko ? '이벤트' : 'Events', linkTitle: ko ? 'MyCodeChecker에서 보기' : 'Open in MyCodeChecker' };
}

function markdownDescription(issue, lang, opts) {
  const f = facts(issue, lang, opts);
  const out = [f.message, ''];
  out.push('| | |', '|---|---|');
  for (const [k, v] of f.rows) out.push(`| ${k} | \`${String(v).replace(/[|`]/g, ' ')}\` |`);
  if (f.events.length) {
    out.push('', `**${f.eventsTitle}**`, '');
    f.events.forEach((e, n) => out.push(`${n + 1}. \`${e.loc}\` ${e.tag ? `*${e.tag}* ` : ''}${e.text}${e.main ? ' ⬅' : ''}`));
  }
  if (f.url) out.push('', `[${f.linkTitle}](${f.url})`);
  return out.join('\n');
}

function wikiEscape(s) {
  return String(s).replace(/([{}[\]|*_^~])/g, '\\$1');
}

/** Jira wiki markup (REST v2). */
function wikiDescription(issue, lang, opts) {
  const f = facts(issue, lang, opts);
  const out = [wikiEscape(f.message), ''];
  for (const [k, v] of f.rows) out.push(`||${k}|{{${String(v).replace(/[|}]/g, ' ')}}}|`);
  if (f.events.length) {
    out.push('', `*${f.eventsTitle}*`);
    for (const e of f.events) out.push(`# {{${e.loc}}} ${e.tag ? `_${wikiEscape(e.tag)}_ ` : ''}${wikiEscape(e.text)}${e.main ? ' (!)' : ''}`);
  }
  if (f.url) out.push('', `[${f.linkTitle}|${f.url}]`);
  return out.join('\n');
}

/** Atlassian Document Format (REST v3). */
function adfDescription(issue, lang, opts) {
  const f = facts(issue, lang, opts);
  const t = (text, marks) => ({ type: 'text', text: String(text) || ' ', ...(marks ? { marks } : {}) });
  const content = [{ type: 'paragraph', content: [t(f.message)] }];
  content.push({
    type: 'table', attrs: { isNumberColumnEnabled: false, layout: 'default' },
    content: f.rows.map(([k, v]) => ({
      type: 'tableRow',
      content: [
        { type: 'tableHeader', content: [{ type: 'paragraph', content: [t(k)] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [t(v, [{ type: 'code' }])] }] },
      ],
    })),
  });
  if (f.events.length) {
    content.push({ type: 'heading', attrs: { level: 3 }, content: [t(f.eventsTitle)] });
    content.push({
      type: 'orderedList',
      content: f.events.map((e) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [t(e.loc, [{ type: 'code' }]), t(` ${e.tag ? `${e.tag}: ` : ''}${e.text}`, e.main ? [{ type: 'strong' }] : undefined)] }],
      })),
    });
  }
  if (f.url) content.push({ type: 'paragraph', content: [t(f.linkTitle, [{ type: 'link', attrs: { href: f.url } }])] });
  return { type: 'doc', version: 1, content };
}

function textileDescription(issue, lang, opts) {
  const f = facts(issue, lang, opts);
  const out = [f.message, ''];
  for (const [k, v] of f.rows) out.push(`|_. ${k} | @${String(v).replace(/[|@]/g, ' ')}@ |`);
  if (f.events.length) {
    out.push('', `*${f.eventsTitle}*`, '');
    for (const e of f.events) out.push(`# @${e.loc}@ ${e.tag ? `_${e.tag}_ ` : ''}${e.text}`);
  }
  if (f.url) out.push('', `"${f.linkTitle}":${f.url}`);
  return out.join('\n');
}

function trimBase(u, fallback) {
  return String(u || fallback || '').replace(/\/+$/, '');
}

function need(config, keys, kind) {
  for (const k of keys) {
    if (config[k] == null || config[k] === '') {
      const err = new Error(`${kind}: ${k} is required`);
      err.code = 'ECONFIG';
      err.text = { en: `${kind} setting "${k}" is missing.`, ko: `${kind} 설정 "${k}" 값이 없습니다.` };
      throw err;
    }
  }
}

/**
 * Request body for one tracker (pure).
 * @param {'jira'|'redmine'|'github'|'gitlab'} kind
 * @param {object} config
 *   jira:    { baseUrl, apiVersion: 2|3 (default 3), projectKey, issueType='Bug', email+apiToken | pat, labels?, priorityMap?, usePriority=true, components?, extraFields? }
 *   redmine: { baseUrl, apiKey, projectId, trackerId?, priorityMap?, textFormat: 'markdown'|'textile' (default markdown), customFields? }
 *   github:  { apiUrl='https://api.github.com', owner, repo, token, labels?, assignees? }
 *   gitlab:  { baseUrl='https://gitlab.com', projectId, token, labels?, confidential? }
 * @param {object} issue
 * @param {{lang?:'en'|'ko', issueUrl?:string}} [opts]
 */
function ticketPayload(kind, config = {}, issue = {}, opts = {}) {
  const lang = opts.lang || config.lang || 'en';
  const title = summaryOf(issue, lang);
  switch (kind) {
    case 'jira': {
      const v = Number(config.apiVersion || 3);
      const fields = {
        project: { key: config.projectKey },
        issuetype: config.issueTypeId ? { id: String(config.issueTypeId) } : { name: config.issueType || 'Bug' },
        summary: title,
        description: v >= 3 ? adfDescription(issue, lang, opts) : wikiDescription(issue, lang, opts),
        labels: labelsOf(issue, config),
      };
      if (config.usePriority !== false) fields.priority = { name: priorityFor('jira', issue, config) };
      if (config.components && config.components.length) fields.components = config.components.map((c) => ({ name: c }));
      Object.assign(fields, config.extraFields || {});
      return { fields };
    }
    case 'redmine': {
      const body = {
        project_id: config.projectId,
        subject: title,
        description: config.textFormat === 'textile' ? textileDescription(issue, lang, opts) : markdownDescription(issue, lang, opts),
        priority_id: priorityFor('redmine', issue, config),
      };
      if (config.trackerId != null && config.trackerId !== '') body.tracker_id = Number(config.trackerId);
      if (config.customFields) body.custom_fields = config.customFields;
      return { issue: body };
    }
    case 'github': {
      const body = { title, body: markdownDescription(issue, lang, opts), labels: labelsOf(issue, config) };
      if (config.assignees && config.assignees.length) body.assignees = config.assignees;
      return body;
    }
    case 'gitlab': {
      const body = { title, description: markdownDescription(issue, lang, opts), labels: labelsOf(issue, config).join(',') };
      if (config.confidential) body.confidential = true;
      return body;
    }
    default:
      throw Object.assign(new Error(`Unknown tracker: ${kind}`), { code: 'ECONFIG', text: { en: `Unknown issue tracker: ${kind}`, ko: `알 수 없는 이슈 트래커입니다: ${kind}` } });
  }
}

/**
 * Full request for createTicket (pure): { method, url, headers, body }.
 */
function ticketRequest(kind, config = {}, issue = {}, opts = {}) {
  const body = ticketPayload(kind, config, issue, opts);
  switch (kind) {
    case 'jira': {
      need(config, ['baseUrl', 'projectKey'], 'Jira');
      const v = Number(config.apiVersion || 3);
      let auth;
      if (config.pat) auth = `Bearer ${config.pat}`;
      else if (config.email && config.apiToken) auth = basicAuth(config.email, config.apiToken);
      else if (config.user && config.password) auth = basicAuth(config.user, config.password);
      else need(config, ['apiToken'], 'Jira');
      return { method: 'POST', url: `${trimBase(config.baseUrl)}/rest/api/${v >= 3 ? 3 : 2}/issue`, headers: { authorization: auth, 'content-type': 'application/json', accept: 'application/json' }, body };
    }
    case 'redmine':
      need(config, ['baseUrl', 'apiKey', 'projectId'], 'Redmine');
      return { method: 'POST', url: `${trimBase(config.baseUrl)}/issues.json`, headers: { 'x-redmine-api-key': config.apiKey, 'content-type': 'application/json' }, body };
    case 'github':
      need(config, ['owner', 'repo', 'token'], 'GitHub');
      return {
        method: 'POST', url: `${trimBase(config.apiUrl, 'https://api.github.com')}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`,
        headers: { authorization: `Bearer ${config.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' }, body,
      };
    case 'gitlab':
      need(config, ['projectId', 'token'], 'GitLab');
      return { method: 'POST', url: `${trimBase(config.baseUrl, 'https://gitlab.com')}/api/v4/projects/${encodeURIComponent(config.projectId)}/issues`, headers: { 'private-token': config.token, 'content-type': 'application/json' }, body };
    default:
      return ticketPayload(kind, config, issue, opts);
  }
}

/** Ticket key and browser URL from the tracker's response. */
function parseResponse(kind, config, json) {
  const j = json || {};
  switch (kind) {
    case 'jira': return { key: j.key || String(j.id || ''), id: j.id || null, url: j.key ? `${trimBase(config.browseUrl || config.baseUrl)}/browse/${j.key}` : (j.self || '') };
    case 'redmine': { const id = j.issue && j.issue.id; return { key: id != null ? `#${id}` : '', id: id == null ? null : id, url: id != null ? `${trimBase(config.baseUrl)}/issues/${id}` : '' }; }
    case 'github': return { key: j.number != null ? `#${j.number}` : '', id: j.number == null ? null : j.number, url: j.html_url || '' };
    case 'gitlab': return { key: j.iid != null ? `#${j.iid}` : '', id: j.iid == null ? null : j.iid, url: j.web_url || '' };
    default: return { key: '', id: null, url: '' };
  }
}

/**
 * Create a ticket.
 * @param {'jira'|'redmine'|'github'|'gitlab'} kind
 * @param {object} config see ticketPayload; plus { timeoutMs?, retries?, transport?, rejectUnauthorized?, ca? }
 * @param {object} issue
 * @param {{lang?:string, issueUrl?:string}} [opts]
 * @returns {Promise<{key:string, url:string, id:any, kind:string}>}
 */
async function createTicket(kind, config = {}, issue = {}, opts = {}) {
  if (!KINDS.includes(kind)) ticketPayload(kind, config, issue, opts);
  const req = ticketRequest(kind, config, issue, opts);
  const res = await request({
    ...req,
    timeoutMs: config.timeoutMs, retries: config.retries == null ? 2 : config.retries,
    transport: config.transport || opts.transport, rejectUnauthorized: config.rejectUnauthorized, ca: config.ca,
  });
  return { kind, ...parseResponse(kind, config, res.json) };
}

module.exports = {
  KINDS, JIRA_PRIORITY, REDMINE_PRIORITY, ticketPayload, ticketRequest, createTicket, priorityFor, summaryOf, labelsOf,
  adfDescription, wikiDescription, markdownDescription, textileDescription, parseResponse,
};
