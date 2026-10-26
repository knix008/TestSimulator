// Audit log, housekeeping, portfolio aggregation and monorepo uploads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const { createHandler } = require('../server/handle.js');
const users = require('../core/platform/users.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('the audit log records who changed what, including refused calls', async () => {
  const api = createApi({ configDir: tmp('mcc-audit-') });
  await api.call('project.scan', { path: path.resolve('samples/demo') });
  const ws = api.store.load();
  users.ensureSecurity(ws);
  users.setPassword(ws, 'admin', 'admin-password-1');
  users.createUser(ws, { login: 'dev', name: 'Dev', password: 'developer-pw' });
  users.setEnabled(ws, true);
  api.store.save(ws);
  const admin = (await api.call('security.login', { login: 'admin', password: 'admin-password-1' })).token;
  const dev = (await api.call('security.login', { login: 'dev', password: 'developer-pw' })).token;
  await assert.rejects(api.call('security.login', { login: 'dev', password: 'wrong-password' }));
  await assert.rejects(api.call('security.get', {}, { token: dev }));
  const key = api.store.load().projects[0].branches.main.latest.issues[0].key;
  await api.call('issue.update', { projectId: ws.projects[0].id, keys: [key], patch: { comment: 'x' } }, { token: dev });
  const log = await api.call('audit.list', {}, { token: admin });
  assert.ok(log.some((e) => e.method === 'security.login' && e.outcome !== 'OK'), 'failed login');
  assert.ok(log.some((e) => e.method === 'security.get' && e.outcome === 'FORBIDDEN' && e.login === null));
  assert.ok(log.some((e) => e.method === 'issue.update' && e.login === 'dev' && e.outcome === 'OK'));
  await assert.rejects(api.call('audit.list', {}, { token: dev }), (e) => e.code === 'FORBIDDEN');
  const loaded = await api.call('workspace.load', {}, { token: admin });
  assert.equal(loaded.auditLog, undefined, 'not sent with the workspace');
});

test('housekeeping drops stale branches and the main branch stays', async () => {
  const api = createApi({ configDir: tmp('mcc-hk-') });
  await api.call('project.scan', { path: path.resolve('samples/demo') });
  await api.call('project.scan', { path: path.resolve('samples/demo'), branch: 'old-feature' });
  const ws = api.store.load();
  ws.projects[0].branches['old-feature'].updatedAt = new Date(Date.now() - 40 * 86400000).toISOString();
  ws.settings.housekeeping = { branchDays: 30 };
  api.store.save(ws);
  assert.deepEqual(await api.call('housekeeping.run'), { branches: 1, issueStates: 0 });
  assert.deepEqual(Object.keys(api.store.load().projects[0].branches), ['main']);
});

test('portfolio measures sum counts and take the worst rating', async () => {
  const api = createApi({ configDir: tmp('mcc-pf-') });
  const a = tmp('mcc-pa-');
  const b = tmp('mcc-pb-');
  fs.writeFileSync(path.join(a, 'a.js'), 'eval(x);\n');
  fs.writeFileSync(path.join(b, 'b.js'), 'const ok = 1;\nexport default ok;\n');
  const ra = await api.call('project.scan', { path: a });
  const rb = await api.call('project.scan', { path: b });
  const ws = api.store.load();
  ws.portfolios = [{ id: 'pf', name: 'All', projects: [ra.project.id, rb.project.id] }];
  api.store.save(ws);
  const [pf] = await api.call('portfolio.measures', { id: 'pf' });
  assert.equal(pf.projects.length, 2);
  assert.equal(pf.measures.vulnerabilities, ra.analysis.measures.vulnerabilities + rb.analysis.measures.vulnerabilities);
  assert.equal(pf.measures.security_rating, Math.max(ra.analysis.measures.security_rating, rb.analysis.measures.security_rating));
  assert.equal(pf.releasability, ra.analysis.qualityGate.status === 'ERROR' || rb.analysis.qualityGate.status === 'ERROR' ? 'ERROR' : 'OK');
});

test('sonar.modules uploads each module of a monorepo as its own project', async () => {
  const configDir = tmp('mcc-mono-');
  const { handle, api } = createHandler({ configDir });
  const server = http.createServer((req, res) => { handle(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const dir = tmp('mcc-mono-src-');
    fs.mkdirSync(path.join(dir, 'web', 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'api'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'web', 'src', 'a.js'), 'eval(x);\n');
    fs.writeFileSync(path.join(dir, 'api', 'b.py'), 'import os\nos.system(cmd)\n');
    fs.writeFileSync(path.join(dir, 'sonar-project.properties'), 'sonar.projectKey=mono\nsonar.modules=web,api\nweb.sonar.sources=src\napi.sonar.projectKey=mono-api\n');
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.resolve('scripts/scan.mjs'), '--server', `http://127.0.0.1:${server.address().port}`], { cwd: dir, env: { ...process.env, MCC_TOKEN: '' } });
      child.on('close', resolve);
    });
    assert.ok([0, 1].includes(code));
    const keys = api.store.load().projects.map((p) => p.key).sort();
    assert.deepEqual(keys, ['mono-api', 'mono:web']);
    const web = api.store.load().projects.find((p) => p.key === 'mono:web');
    assert.ok(web.branches.main.latest.issues.some((i) => i.file === 'src/a.js'));
  } finally {
    server.close();
  }
});
