// Workspace glue for integrations: masked secrets, notifications, tickets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const integrate = require('../core/integrate.js');
const { createApi } = require('../core/api.js');

test('secrets are masked on read and kept when the mask comes back', () => {
  const ws = { settings: {} };
  integrate.saveConfig(ws, { smtp: { host: 'mail', pass: 's3cret' }, trackers: { jira: { apiToken: 'tok', baseUrl: 'https://j' } } });
  const pub = integrate.publicConfig(ws);
  assert.equal(pub.smtp.pass, integrate.MASK);
  assert.equal(pub.trackers.jira.apiToken, integrate.MASK);
  integrate.saveConfig(ws, { ...pub, smtp: { ...pub.smtp, host: 'mail2' } });
  assert.equal(ws.settings.integrations.smtp.pass, 's3cret');
  assert.equal(ws.settings.integrations.smtp.host, 'mail2');
  assert.equal(ws.settings.integrations.trackers.jira.apiToken, 'tok');
});

test('analysis events: gate change and new high-impact defects', () => {
  const project = { id: 'p', key: 'k', name: 'n' };
  const prev = { qualityGate: { status: 'OK' }, issues: [{ cid: 1 }] };
  const now = { qualityGate: { status: 'ERROR', conditions: [{ metric: 'new_bugs', status: 'ERROR' }] }, defectAnalysis: { snapshot: 3 }, issues: [{ cid: 1, impact: 'High' }, { cid: 2, impact: 'High', checker: 'FORWARD_NULL' }, { cid: 3, impact: 'Low' }] };
  const ev = integrate.analysisEvents(project, 'main', now, prev);
  assert.deepEqual(ev.map((e) => e[0]), ['gate-changed', 'defect-high-impact']);
  assert.equal(ev[0][1].failedConditions.length, 1);
  assert.deepEqual(ev[1][1].defects.map((d) => d.cid), [2]);
  assert.deepEqual(integrate.analysisEvents(project, 'main', now, null), [], 'no events on the first analysis');
});

test('notify sends through the configured SMTP and is silent when off', async () => {
  const sent = [];
  const ws = { settings: { language: 'ko', integrations: { smtp: { enabled: true, host: 'x', from: 'mcc@example.com' }, subscriptions: [{ login: 'lee', email: 'lee@example.com', events: ['gate-changed'] }] } }, security: { users: [{ login: 'lee', email: 'lee@example.com', active: true }] } };
  const r = await integrate.notify(ws, 'gate-changed', { project: { name: 'Demo' }, branch: 'main', previousGate: 'OK', gate: 'ERROR' }, { send: async (m) => { sent.push(m); return { accepted: [m.to] }; } });
  assert.equal(r.sent.length, 1);
  assert.match(sent[0].subject, /Demo|게이트/);
  assert.equal(await integrate.notify({ settings: {} }, 'gate-changed', {}), null);
});

test('issue.ticket creates a Redmine issue and links it back', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-redmine-api-key'], body: JSON.parse(body) });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ issue: { id: 77 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-int-')) });
    const scan = await api.call('project.scan', { path: path.resolve('samples/demo') });
    await api.call('integrations.save', { integrations: { trackers: { redmine: { baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'rk', projectId: 'demo' } } } });
    const key = scan.analysis.issues[0].key;
    const made = await api.call('issue.ticket', { projectId: scan.project.id, keys: [key], kind: 'redmine' });
    assert.equal(made[0].id, 77);
    assert.equal(seen[0].url, '/issues.json');
    assert.equal(seen[0].key, 'rk');
    assert.equal(seen[0].body.issue.project_id, 'demo');
    const issue = api.store.load().projects[0].branches.main.latest.issues.find((i) => i.key === key);
    assert.ok(issue.externalReference);
    assert.equal((await api.call('integrations.get')).trackers.redmine.apiKey, integrate.MASK);
    await assert.rejects(api.call('pr.decorate', { projectId: scan.project.id, provider: 'github' }), (e) => e.code === 'NOT_CONFIGURED' || /not a git|repository|configured/i.test(e.message));
  } finally {
    server.close();
  }
});
