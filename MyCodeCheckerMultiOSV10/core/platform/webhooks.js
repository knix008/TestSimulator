'use strict';

// Webhooks in the SonarQube shape: definitions, the payload, an HMAC-SHA256
// signature header and a delivery that never throws and returns a log record.

const crypto = require('crypto');

const EVENTS = ['analysis-done', 'gate-changed'];
const SIGNATURE_HEADER = 'X-Sonar-Webhook-HMAC-SHA256';

/**
 * Create / normalize a webhook definition. Throws only on an invalid URL or event (definition time).
 * @param {{id?:string, name?:string, url:string, secret?:string, events?:string[], projectId?:string|null, enabled?:boolean}} input
 */
function defineWebhook(input = {}) {
  let url;
  try { url = new URL(String(input.url || '')); } catch { throw new Error('Webhook URL is not valid'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Webhook URL must be http or https');
  const events = (input.events && input.events.length ? input.events : ['analysis-done']).map(String);
  for (const e of events) if (!EVENTS.includes(e)) throw new Error(`Unknown webhook event: ${e}`);
  return {
    id: input.id || `wh-${crypto.randomBytes(6).toString('hex')}`,
    name: input.name || url.host,
    url: url.toString(),
    secret: input.secret || '',
    events: [...new Set(events)],
    projectId: input.projectId || null,
    enabled: input.enabled !== false,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/** Public view without the secret (hasSecret instead). */
function publicWebhook(hook) {
  const { secret, ...rest } = hook;
  return { ...rest, hasSecret: !!secret };
}

const OPS = { GT: 'GREATER_THAN', LT: 'LESS_THAN', GTE: 'GREATER_THAN_OR_EQUALS', LTE: 'LESS_THAN_OR_EQUALS', EQ: 'EQUALS', NE: 'NOT_EQUALS' };

/**
 * SonarQube webhook payload.
 * @param {{project:object, analysis:object, branch?:string, isMain?:boolean, pullRequest?:object, serverUrl?:string, taskId?:string, revision?:string, properties?:object}} args
 */
function buildPayload(args = {}) {
  const project = args.project || {};
  const analysis = args.analysis || {};
  const gate = analysis.qualityGate || { status: 'NONE', conditions: [] };
  const server = (args.serverUrl || 'http://localhost').replace(/\/$/, '');
  const branchName = args.branch || project.mainBranch || 'main';
  const payload = {
    serverUrl: server,
    taskId: args.taskId || '',
    status: 'SUCCESS',
    analysedAt: analysis.finishedAt || new Date().toISOString(),
    revision: args.revision || '',
    changedAt: analysis.finishedAt || new Date().toISOString(),
    project: { key: project.key || project.id || '', name: project.name || project.key || '', url: `${server}/dashboard?id=${encodeURIComponent(project.key || project.id || '')}` },
    branch: args.pullRequest
      ? { name: String(args.pullRequest.key || args.pullRequest.id || ''), type: 'PULL_REQUEST', isMain: false, url: `${server}/dashboard?id=${encodeURIComponent(project.key || '')}&pullRequest=${encodeURIComponent(args.pullRequest.key || '')}` }
      : { name: branchName, type: 'BRANCH', isMain: args.isMain != null ? !!args.isMain : branchName === (project.mainBranch || 'main'), url: `${server}/dashboard?id=${encodeURIComponent(project.key || '')}&branch=${encodeURIComponent(branchName)}` },
    qualityGate: {
      name: gate.name || 'Checker way',
      status: gate.status,
      conditions: (gate.conditions || []).map((c) => ({
        metric: c.metric,
        operator: OPS[c.op] || c.op,
        ...(c.actual != null ? { value: String(c.actual) } : {}),
        status: c.status === 'NO_DATA' ? 'NO_VALUE' : c.status,
        errorThreshold: String(c.threshold),
      })),
    },
    properties: { ...(args.properties || {}) },
  };
  if (analysis.coverity && analysis.coverity.policy) payload.properties['coverity.policy'] = analysis.coverity.policy.status;
  return payload;
}

/** Hex HMAC-SHA256 of the exact body with the secret. */
function sign(body, secret) {
  return crypto.createHmac('sha256', String(secret)).update(typeof body === 'string' ? body : JSON.stringify(body)).digest('hex');
}

/** Constant-time check of a received signature. */
function verifySignature(body, secret, signature) {
  const want = Buffer.from(sign(body, secret), 'hex');
  let got;
  try { got = Buffer.from(String(signature || ''), 'hex'); } catch { return false; }
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/**
 * Which events fire for this analysis.
 * @param {{previousGate?:string|null, gate?:string}} state
 * @returns {string[]}
 */
function eventsFor(state = {}) {
  const out = ['analysis-done'];
  if (state.previousGate != null && state.gate && state.previousGate !== state.gate) out.push('gate-changed');
  return out;
}

/** Webhooks that should receive this delivery (enabled, matching project or global, subscribed to an event). */
function selectWebhooks(hooks, projectId, events) {
  return (hooks || []).filter((h) => h.enabled !== false && (!h.projectId || h.projectId === projectId) && (h.events || ['analysis-done']).some((e) => events.includes(e)));
}

/**
 * POST the payload. Never throws; resolves a delivery log record.
 * @param {object} webhook defineWebhook() result
 * @param {object} payload buildPayload() result
 * @param {{fetch?:Function, timeoutMs?:number, event?:string}} [opts]
 * @returns {Promise<{id:string, webhookId:string, url:string, event:string, at:string, durationMs:number, success:boolean, httpStatus:number|null, error:string|null, payloadSize:number, response:string}>}
 */
async function deliver(webhook, payload, opts = {}) {
  const started = Date.now();
  const body = JSON.stringify(payload);
  const record = {
    id: `dl-${crypto.randomBytes(6).toString('hex')}`,
    webhookId: webhook && webhook.id, url: webhook && webhook.url, event: opts.event || 'analysis-done',
    at: new Date(started).toISOString(), durationMs: 0, success: false, httpStatus: null, error: null,
    payloadSize: Buffer.byteLength(body), response: '',
  };
  const doFetch = opts.fetch || globalThis.fetch;
  if (!webhook || !webhook.url) { record.error = 'No webhook URL'; return record; }
  if (typeof doFetch !== 'function') { record.error = 'fetch is not available'; return record; }
  const headers = { 'content-type': 'application/json', 'user-agent': 'MyCodeChecker-Webhook', 'X-MyCodeChecker-Event': record.event };
  if (webhook.secret) headers[SIGNATURE_HEADER] = sign(body, webhook.secret);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { if (controller) controller.abort(); reject(new Error(`Timed out after ${opts.timeoutMs || 10000} ms`)); }, opts.timeoutMs || 10000);
    });
    const res = await Promise.race([doFetch(webhook.url, { method: 'POST', headers, body, signal: controller ? controller.signal : undefined, redirect: 'manual' }), timeout]);
    record.httpStatus = res && typeof res.status === 'number' ? res.status : null;
    record.success = !!res && record.httpStatus >= 200 && record.httpStatus < 300;
    try { record.response = res && typeof res.text === 'function' ? String(await res.text()).slice(0, 2000) : ''; } catch { record.response = ''; }
    if (!record.success) record.error = `HTTP ${record.httpStatus}`;
  } catch (err) {
    record.error = (err && err.message) || String(err);
  } finally {
    if (timer) clearTimeout(timer);
    record.durationMs = Date.now() - started;
  }
  return record;
}

/** Keep the last N delivery records per webhook (Sonar keeps recent deliveries). */
function appendDelivery(log, record, max = 30) {
  const list = [record, ...(log || [])];
  const per = {};
  return list.filter((r) => { per[r.webhookId] = (per[r.webhookId] || 0) + 1; return per[r.webhookId] <= max; });
}

module.exports = { EVENTS, SIGNATURE_HEADER, defineWebhook, publicWebhook, buildPayload, sign, verifySignature, eventsFor, selectWebhooks, deliver, appendDelivery };
