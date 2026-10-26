// SonarQube-compatible Web API and the scanner upload (scan.mjs --server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { createHandler } = require('../server/handle.js');
const users = require('../core/platform/users.js');

async function serve(configDir) {
  const { handle, api } = createHandler({ configDir, version: '9.9.9' });
  const server = http.createServer((req, res) => { handle(req, res).then((done) => { if (!done) { res.writeHead(404); res.end(); } }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, api, base: `http://127.0.0.1:${server.address().port}` };
}

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-scan-src-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'gen'));
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'eval(input);\nconsole.log(x == y);\n');
  fs.writeFileSync(path.join(dir, 'gen', 'big.js'), 'eval(other);\n');
  fs.writeFileSync(path.join(dir, 'sonar-project.properties'), '# demo\nsonar.projectKey=demo:app\nsonar.projectName=Demo App\nsonar.sources=src, \\\n  gen\nsonar.exclusions=gen/**\n');
  return dir;
}

function runScan(cwd, extra) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.resolve('scripts/scan.mjs'), ...extra], { cwd, env: { ...process.env, MCC_TOKEN: '' } });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, err }));
  });
}

test('scan.mjs uploads sources from sonar-project.properties and the server keeps the analysis', async () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-srv-'));
  const { server, base, api } = await serve(configDir);
  try {
    const dir = project();
    const r = await runScan(dir, ['--server', base]);
    assert.match(r.err, /upload 1 files of demo:app/);
    assert.match(r.err, /project=demo:app/);
    const ws = api.store.load();
    const p = ws.projects.find((x) => x.key === 'demo:app');
    assert.ok(p, 'project stored under its key');
    assert.equal(p.name, 'Demo App');
    assert.ok(p.branches.main.latest.issues.some((i) => i.rule === 'js:eval' && i.file === 'src/a.js'));
    assert.ok(!p.branches.main.latest.issues.some((i) => i.file.startsWith('gen/')), 'sonar.exclusions applied');
    const again = await runScan(dir, ['--server', base, '--branch', 'feature']);
    assert.match(again.err, /branch=feature/);
    assert.equal(api.store.load().projects.filter((x) => x.key === 'demo:app').length, 1, 'same project on the next upload');
  } finally {
    server.close();
  }
});

test('Sonar Web API routes answer in SonarQube shapes', async () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-srv-'));
  const { server, base } = await serve(configDir);
  const get = async (p) => { const res = await fetch(`${base}/api/${p}`); return { status: res.status, body: await res.json() }; };
  try {
    await runScan(project(), ['--server', base]);
    assert.deepEqual((await get('system/status')).body, { id: 'mycodechecker', version: '9.9.9', status: 'UP' });
    const projects = (await get('projects/search?q=demo')).body;
    assert.equal(projects.components[0].key, 'demo:app');
    const issues = (await get('issues/search?componentKeys=demo:app&types=VULNERABILITY&facets=rules&ps=1')).body;
    assert.ok(issues.total >= 1);
    assert.equal(issues.issues.length, 1);
    assert.match(issues.issues[0].component, /^demo:app:src\/a\.js$/);
    assert.ok(issues.facets[0].values.length >= 1);
    const measures = (await get('measures/component?component=demo:app&metricKeys=bugs,vulnerabilities,new_coverage,alert_status')).body;
    assert.ok(measures.component.measures.some((m) => m.metric === 'vulnerabilities'));
    assert.ok(measures.component.measures.some((m) => m.metric === 'alert_status'));
    const gate = (await get('qualitygates/project_status?projectKey=demo:app')).body;
    assert.ok(['OK', 'ERROR'].includes(gate.projectStatus.status));
    assert.ok(gate.projectStatus.conditions.every((c) => c.metricKey && c.status));
    const rules = (await get('rules/search?languages=js&q=eval&ps=5')).body;
    assert.ok(rules.rules.some((r) => r.key === 'js:eval'));
    assert.equal((await get('rules/show?key=nope:x')).status, 404);
    assert.equal((await get('nothing/here')).status, 404);
    const key = issues.issues[0].key;
    const res = await fetch(`${base}/api/issues/do_transition`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `issue=${key}&transition=falsepositive` });
    const done = await res.json();
    assert.equal(done.issue.resolution, 'FALSE_POSITIVE');
    const tagged = await (await fetch(`${base}/api/issues/set_tags`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `issue=${key}&tags=legacy,ci` })).json();
    assert.deepEqual(tagged.issue.tags, ['legacy', 'ci']);
  } finally {
    server.close();
  }
});

test('with permissions on, Sonar routes take a token as Basic user or Bearer', async () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-srv-'));
  const { server, base, api } = await serve(configDir);
  try {
    await runScan(project(), ['--server', base]);
    const ws = api.store.load();
    users.ensureSecurity(ws);
    users.setPassword(ws, 'admin', 'admin-password-1');
    users.setEnabled(ws, true);
    const { token } = users.generateToken(ws, { login: 'admin', name: 'ci' });
    api.store.save(ws);
    assert.equal((await fetch(`${base}/api/issues/search`)).status, 401);
    const basic = await fetch(`${base}/api/issues/search`, { headers: { authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` } });
    assert.equal(basic.status, 200);
    const bearer = await fetch(`${base}/api/projects/search`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await bearer.json()).components.length, 1);
    const denied = await runScan(project(), ['--server', base]);
    assert.equal(denied.code, 2);
    const ok = await runScan(project(), ['--server', base, '--token', token]);
    assert.ok([0, 1].includes(ok.code), ok.err);
  } finally {
    server.close();
  }
});
