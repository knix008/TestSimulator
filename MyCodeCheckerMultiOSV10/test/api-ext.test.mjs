import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');

function freshApi() {
  return createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-api-')) });
}

test('scan stores snapshots and creation dates, and the extended methods answer', async () => {
  const api = freshApi();
  const first = await api.call('project.sample', {});
  const projectId = first.project.id;
  await api.call('project.sample', {});
  assert.ok(first.analysis.issues.every((i) => i.creationDate), 'every issue has a creation date');
  assert.ok(first.analysis.issues.some((i) => i.engine === 'sca'), 'the SCA engine runs during a scan');

  const snaps = await api.call('snapshot.list', { projectId });
  assert.equal(snaps.length, 2);
  const diff = await api.call('snapshot.compare', { projectId });
  assert.ok(diff && typeof diff === 'object');

  const cwe = await api.call('compliance.report', { projectId, standard: 'cweTop25' });
  assert.ok(cwe);
  const misra = await api.call('misra.compliance', { projectId });
  assert.equal(typeof misra.compliant, 'boolean');

  for (const kind of await api.call('report.kinds')) {
    const out = await api.call('report.export', { projectId, kind });
    assert.match(out.body, /<html/i, `${kind} report is HTML`);
  }
  const bom = JSON.parse((await api.call('sca.sbom', { projectId })).body);
  assert.equal(bom.bomFormat, 'CycloneDX');
  const deps = await api.call('sca.scan', { projectId });
  assert.ok(Array.isArray(deps.dependencies));

  const hook = await api.call('webhook.save', { webhook: { name: 'ci', url: 'http://127.0.0.1:9/hook' } });
  assert.equal((await api.call('webhook.list')).length, 1);
  await api.call('webhook.delete', { id: hook.id });
  assert.equal((await api.call('webhook.list')).length, 0);

  const security = await api.call('security.get');
  assert.equal(security.enabled, false);
  assert.ok((await api.call('issue.age', { projectId })).buckets.length > 0);
  assert.ok(await api.call('component.tree', { projectId }));
});

test('external SARIF import adds issues to the latest analysis', async () => {
  const api = freshApi();
  const { project } = await api.call('project.sample', {});
  const sarif = JSON.stringify({
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'othertool', rules: [{ id: 'R1', shortDescription: { text: 'Rule one' } }] } },
      results: [{ ruleId: 'R1', level: 'error', message: { text: 'found' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/app.js' }, region: { startLine: 2 } } }] }],
    }],
  });
  const out = await api.call('external.import', { projectId: project.id, text: sarif, fileName: 'x.sarif' });
  assert.equal(out.count, 1);
});

test('DAST scans only the given local target and keeps the result', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<a href="/next">next</a><a href="http://203.0.113.9/out">out</a>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = freshApi();
    const target = `http://127.0.0.1:${server.address().port}`;
    const result = await api.call('dast.start', { target, maxRequests: 15 });
    assert.ok(result.requests > 0 && result.requests <= 15);
    assert.ok(result.findings.some((f) => f.rule === 'dast:missing-csp'));
    const list = await api.call('dast.results');
    assert.equal(list.length, 1);
    const report = await api.call('dast.report', { id: result.id, format: 'sarif' });
    assert.equal(JSON.parse(report.body).version, '2.1.0');
  } finally {
    server.close();
  }
});
