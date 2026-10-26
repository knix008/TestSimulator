'use strict';

// E-mail notifications like SonarQube ("My new issues", "Changes in quality
// gate status", "Background tasks in failure"), Coverity Connect (new
// high-impact defects for a stream or component owner) and Sparrow
// (exception / deviation request workflow). Pure composition plus a
// dispatch() that sends through smtp.sendMail or an injected `send`.
//
// Subscription: { login, email?, lang?, events: [eventId], projects: [projectKey] }
//   projects empty or missing = every project.
// Users: users.js records { login, name, email, active, lang? }.

const smtp = require('./smtp');

/** Event ids. `personal` events go only to the people they are about (and only if they subscribed). */
const EVENTS = [
  { id: 'gate-changed', personal: false, name: { en: 'Quality gate status changed', ko: '품질 게이트 상태 변경' } },
  { id: 'issues-assigned', personal: true, name: { en: 'New issues assigned to me', ko: '나에게 할당된 새 이슈' } },
  { id: 'coverity-high-impact', personal: false, name: { en: 'New high-impact defects', ko: '새 높은 영향도 결함' } },
  { id: 'exception-pending', personal: true, name: { en: 'Exception request waiting for my approval', ko: '승인 대기 중인 예외 요청' } },
  { id: 'exception-approved', personal: true, name: { en: 'My exception request approved', ko: '내 예외 요청 승인' } },
  { id: 'exception-rejected', personal: true, name: { en: 'My exception request rejected', ko: '내 예외 요청 반려' } },
  { id: 'scan-failed', personal: false, name: { en: 'Analysis failed', ko: '분석 실패' } },
];
const EVENT_IDS = EVENTS.map((e) => e.id);
const PREFIX = '[MyCodeChecker]';

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function txt(v, lang) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return v[lang] || v.en || v.ko || '';
}

function projName(ctx) {
  const p = ctx.project || {};
  return p.name || p.key || p.id || '';
}

function projKey(ctx) {
  const p = ctx.project || {};
  return p.key || p.id || '';
}

/** Normalize a subscription; unknown events are dropped. */
function normalizeSubscription(s = {}) {
  return {
    login: s.login ? String(s.login) : '',
    email: s.email ? String(s.email) : '',
    lang: s.lang === 'ko' ? 'ko' : s.lang === 'en' ? 'en' : '',
    events: [...new Set((s.events || []).map(String).filter((e) => EVENT_IDS.includes(e)))],
    projects: [...new Set((s.projects || []).map(String).filter(Boolean))],
  };
}

function matchesProject(sub, key) {
  return !sub.projects.length || !key || sub.projects.includes(key);
}

/** Logins an event is about (personal recipients). */
function targets(event, ctx) {
  const out = new Set();
  if (event === 'issues-assigned') for (const i of ctx.issues || []) if (i.assignee) out.add(String(i.assignee));
  if (event === 'exception-pending') for (const a of (ctx.request && ctx.request.approvers) || []) out.add(String(a));
  if (event === 'exception-approved' || event === 'exception-rejected') if (ctx.request && ctx.request.requester) out.add(String(ctx.request.requester));
  if (event === 'coverity-high-impact') {
    const owners = ctx.componentOwners || {};
    for (const d of ctx.defects || []) {
      const o = d.owner || (d.component && owners[d.component]);
      for (const login of [].concat(o || [])) out.add(String(login));
    }
  }
  return out;
}

/**
 * Who receives this event. Broadcast events go to every subscriber of the
 * event and project; personal events to the targeted logins that subscribed.
 * Coverity component owners receive their defects even without a subscription
 * when `ctx.notifyOwners` is not false (Coverity Connect behaviour).
 * @returns {{login:string, email:string, name:string, lang:string}[]}
 */
function recipients(event, ctx = {}, { subscriptions = [], users = [], lang = 'en' } = {}) {
  const def = EVENTS.find((e) => e.id === event);
  if (!def) return [];
  const subs = subscriptions.map(normalizeSubscription);
  const byLogin = new Map(users.map((u) => [String(u.login), u]));
  const key = projKey(ctx);
  const tgt = targets(event, ctx);
  const chosen = new Map();
  const add = (login, sub) => {
    const u = byLogin.get(login) || null;
    if (u && u.active === false) return;
    const email = (sub && sub.email) || (u && u.email) || '';
    if (!email) return;
    if (chosen.has(email.toLowerCase())) return;
    chosen.set(email.toLowerCase(), { login: login || '', email, name: (u && u.name) || login || email, lang: (sub && sub.lang) || (u && u.lang) || lang || 'en' });
  };
  for (const sub of subs) {
    if (!sub.events.includes(event) || !matchesProject(sub, key)) continue;
    if (def.personal && !tgt.has(sub.login)) continue;
    add(sub.login, sub);
  }
  if (event === 'coverity-high-impact' && ctx.notifyOwners !== false) {
    for (const login of tgt) if (!subs.some((s) => s.login === login && s.events.includes(event))) add(login, subs.find((s) => s.login === login) || null);
  }
  return [...chosen.values()];
}

// ---------------------------------------------------------------------------
// Rendering

const L = {
  project: { en: 'Project', ko: '프로젝트' },
  branch: { en: 'Branch', ko: '브랜치' },
  details: { en: 'Open in MyCodeChecker', ko: 'MyCodeChecker에서 보기' },
  footer: { en: 'You receive this e-mail because of your notification settings in MyCodeChecker.', ko: 'MyCodeChecker 알림 설정에 따라 이 메일을 보냅니다.' },
  passed: { en: 'Passed', ko: '통과' },
  failed: { en: 'Failed', ko: '실패' },
  none: { en: 'None', ko: '없음' },
};

function gateLabel(status, lang) {
  if (status === 'OK') return txt(L.passed, lang);
  if (status === 'ERROR' || status === 'FAILED') return txt(L.failed, lang);
  if (!status) return txt(L.none, lang);
  return String(status);
}

function issueLine(i, lang) {
  return `${i.severity || ''} ${i.type || ''} ${i.file || ''}:${i.line || ''} ${txt(i.message, lang)} (${i.rule || i.checker || ''})`.replace(/\s+/g, ' ').trim();
}

/**
 * Subject / text / html for one event in one language.
 * @param {string} event
 * @param {object} ctx event context (see dispatch)
 * @param {'en'|'ko'} [lang]
 * @param {{login?:string}} [recipient] personal events show only the recipient's items
 * @returns {{subject:string, text:string, html:string}}
 */
function render(event, ctx = {}, lang = 'en', recipient = {}) {
  const ko = lang === 'ko';
  const name = projName(ctx);
  const lines = [];   // text lines
  const blocks = [];  // html blocks
  const head = [];
  let subject = '';
  const para = (t) => { lines.push(t); blocks.push(`<p>${esc(t)}</p>`); };
  const list = (items) => {
    if (!items.length) return;
    for (const t of items) lines.push(`- ${t}`);
    blocks.push(`<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
  };
  head.push([txt(L.project, lang), name]);
  if (ctx.branch) head.push([txt(L.branch, lang), ctx.branch]);

  switch (event) {
    case 'gate-changed': {
      const now = gateLabel(ctx.gate, lang);
      const before = gateLabel(ctx.previousGate, lang);
      subject = ko ? `${PREFIX} ${name}: 품질 게이트가 ${now}(으)로 바뀌었습니다` : `${PREFIX} ${name}: quality gate is now ${now}`;
      para(ko ? `품질 게이트 상태가 ${before}에서 ${now}(으)로 바뀌었습니다.` : `The quality gate status changed from ${before} to ${now}.`);
      const failed = (ctx.failedConditions || []).map((c) => (typeof c === 'string' ? c : `${c.metric}: ${c.actual == null ? '—' : c.actual} (${c.op || ''} ${c.threshold == null ? '' : c.threshold})`.trim()));
      if (failed.length) { para(ko ? '실패한 조건:' : 'Failed conditions:'); list(failed); }
      break;
    }
    case 'issues-assigned': {
      const mine = (ctx.issues || []).filter((i) => !recipient.login || String(i.assignee) === recipient.login);
      subject = ko ? `${PREFIX} ${name}: 새 이슈 ${mine.length}개가 할당되었습니다` : `${PREFIX} ${name}: ${mine.length} new issue${mine.length === 1 ? '' : 's'} assigned to you`;
      para(ko ? `다음 이슈가 나에게 할당되었습니다 (${mine.length}개).` : `These issues were assigned to you (${mine.length}).`);
      const max = ctx.maxItems || 50;
      list(mine.slice(0, max).map((i) => issueLine(i, lang)));
      if (mine.length > max) para(ko ? `… 외 ${mine.length - max}개` : `… and ${mine.length - max} more`);
      break;
    }
    case 'coverity-high-impact': {
      const all = ctx.defects || [];
      const owners = ctx.componentOwners || {};
      const own = (d) => [].concat(d.owner || (d.component && owners[d.component]) || []).map(String);
      // An owner who is not a broad subscriber sees only the defects in their components.
      const mine = recipient.ownerOnly ? all.filter((d) => own(d).includes(recipient.login)) : all;
      const where = ctx.stream ? (ko ? `스트림 ${ctx.stream}` : `stream ${ctx.stream}`) : name;
      subject = ko ? `${PREFIX} ${where}: 높은 영향도 새 결함 ${mine.length}개` : `${PREFIX} ${where}: ${mine.length} new high-impact defect${mine.length === 1 ? '' : 's'}`;
      if (ctx.stream) head.push([ko ? '스트림' : 'Stream', ctx.stream]);
      if (ctx.snapshot) head.push([ko ? '스냅샷' : 'Snapshot', ctx.snapshot]);
      para(ko ? `최근 스냅샷에서 높은 영향도 결함 ${mine.length}개가 새로 발견되었습니다.` : `The latest snapshot found ${mine.length} new high-impact defect${mine.length === 1 ? '' : 's'}.`);
      const max = ctx.maxItems || 50;
      list(mine.slice(0, max).map((d) => `CID ${d.cid || '?'} ${d.checker || ''} ${d.file || ''}:${d.line || ''} ${txt(d.message, lang)}${d.component ? ` [${d.component}]` : ''}`.replace(/\s+/g, ' ').trim()));
      if (mine.length > max) para(ko ? `… 외 ${mine.length - max}개` : `… and ${mine.length - max} more`);
      break;
    }
    case 'exception-pending':
    case 'exception-approved':
    case 'exception-rejected': {
      const r = ctx.request || {};
      const what = r.rule || r.cid || r.issueKey || r.id || '';
      if (event === 'exception-pending') {
        subject = ko ? `${PREFIX} ${name}: 예외 요청 승인을 기다립니다 (${what})` : `${PREFIX} ${name}: exception request waiting for approval (${what})`;
        para(ko ? `${r.requester || ''} 님이 예외를 요청했습니다. 검토 후 승인하거나 반려하십시오.` : `${r.requester || ''} requested an exception. Please review and approve or reject it.`);
      } else if (event === 'exception-approved') {
        subject = ko ? `${PREFIX} ${name}: 예외 요청이 승인되었습니다 (${what})` : `${PREFIX} ${name}: exception request approved (${what})`;
        para(ko ? `${r.decidedBy || ''} 님이 예외 요청을 승인했습니다.` : `${r.decidedBy || ''} approved the exception request.`);
      } else {
        subject = ko ? `${PREFIX} ${name}: 예외 요청이 반려되었습니다 (${what})` : `${PREFIX} ${name}: exception request rejected (${what})`;
        para(ko ? `${r.decidedBy || ''} 님이 예외 요청을 반려했습니다.` : `${r.decidedBy || ''} rejected the exception request.`);
      }
      const items = [];
      if (r.id) items.push(`${ko ? '요청' : 'Request'}: ${r.id}`);
      if (r.rule) items.push(`${ko ? '규칙' : 'Rule'}: ${r.rule}`);
      if (r.file) items.push(`${ko ? '위치' : 'Location'}: ${r.file}${r.line ? `:${r.line}` : ''}`);
      if (r.reason) items.push(`${ko ? '사유' : 'Reason'}: ${txt(r.reason, lang)}`);
      if (r.comment) items.push(`${ko ? '의견' : 'Comment'}: ${txt(r.comment, lang)}`);
      list(items);
      break;
    }
    case 'scan-failed': {
      subject = ko ? `${PREFIX} ${name}: 분석에 실패했습니다` : `${PREFIX} ${name}: analysis failed`;
      para(ko ? '분석이 끝나지 못하고 실패했습니다.' : 'The analysis did not finish.');
      if (ctx.error) para(`${ko ? '오류' : 'Error'}: ${txt(ctx.error, lang)}`);
      break;
    }
    default:
      throw new Error(`Unknown notification event: ${event}`);
  }

  const headText = head.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  const url = ctx.url || '';
  const text = [...headText, '', ...lines, ...(url ? ['', `${txt(L.details, lang)}: ${url}`] : []), '', '--', txt(L.footer, lang), ''].join('\n');
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"></head>',
    '<body style="font-family:Segoe UI,Malgun Gothic,Arial,sans-serif;font-size:14px;color:#222">',
    `<h2 style="font-size:16px">${esc(subject.replace(`${PREFIX} `, ''))}</h2>`,
    `<table style="border-collapse:collapse">${head.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`,
    ...blocks,
    url ? `<p><a href="${esc(url)}">${esc(txt(L.details, lang))}</a></p>` : '',
    `<hr><p style="color:#888;font-size:12px">${esc(txt(L.footer, lang))}</p>`,
    '</body></html>',
  ].join('\n');
  return { subject, text, html };
}

/**
 * Send an event to everyone who should get it. Never throws for a single
 * failed recipient; each failure is reported.
 * @param {string} event one of EVENT_IDS
 * @param {object} ctx
 *   gate-changed:         { project, branch, previousGate, gate, failedConditions?, url? }
 *   issues-assigned:      { project, branch, issues: [{assignee, rule, message, file, line, severity, type}], url? }
 *   coverity-high-impact: { project, stream, snapshot, defects: [{cid, checker, impact, file, line, message, component, owner?}], componentOwners?: {component: login|login[]}, notifyOwners?, url? }
 *   exception-*:          { project, request: {id, rule, file, line, reason, requester, approvers, decidedBy, comment}, url? }
 *   scan-failed:          { project, branch, error, url? }
 * @param {{subscriptions?:object[], users?:object[], smtpConfig?:object, send?:(message)=>Promise<any>, lang?:string, from?:string}} opts
 * @returns {Promise<{event:string, sent:{login:string,email:string}[], failed:{login:string,email:string,error:string}[], recipients:number}>}
 */
async function dispatch(event, ctx = {}, opts = {}) {
  if (!EVENT_IDS.includes(event)) throw new Error(`Unknown notification event: ${event}`);
  const list = recipients(event, ctx, opts);
  const subs = (opts.subscriptions || []).map(normalizeSubscription);
  const send = typeof opts.send === 'function' ? opts.send : (msg) => smtp.sendMail(opts.smtpConfig || {}, msg);
  const from = opts.from || (opts.smtpConfig && opts.smtpConfig.from) || undefined;
  const result = { event, sent: [], failed: [], recipients: list.length };
  for (const r of list) {
    const broad = subs.some((s) => s.login === r.login && s.events.includes(event));
    const recipient = { login: r.login, ownerOnly: event === 'coverity-high-impact' && !broad };
    let msg;
    try {
      msg = render(event, ctx, r.lang, recipient);
    } catch (err) {
      result.failed.push({ login: r.login, email: r.email, error: err.message });
      continue;
    }
    try {
      await send({ from, to: r.name && r.name !== r.email ? { name: r.name, address: r.email } : r.email, subject: msg.subject, text: msg.text, html: msg.html, headers: { 'X-MyCodeChecker-Event': event } });
      result.sent.push({ login: r.login, email: r.email });
    } catch (err) {
      result.failed.push({ login: r.login, email: r.email, error: (err && err.message) || String(err) });
    }
  }
  return result;
}

module.exports = { EVENTS, EVENT_IDS, normalizeSubscription, recipients, render, dispatch };
