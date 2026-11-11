// Report date ranges: a "to" given as YYYY-MM-DD includes that whole day (the reports page sends today's date as
// the end of its range, so issues finished today must count). SQLite only — the date handling is the same on all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startWeb } from '../../server/web.js';

const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('reports: a YYYY-MM-DD "to" includes issues finished on that day; the reference column can be chosen', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myboard-report-dates-'));
  const web = await startWeb({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'dist'), db: { type: 'sqlite', file: path.join(dataDir, 'r.sqlite3') }, scheduler: false });
  try {
    const call = async (method, p, body, token) => {
      const res = await fetch(web.url + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => null);
      assert.ok(res.status < 300, `${method} ${p} → ${res.status} ${JSON.stringify(data)}`);
      return data;
    };
    const { token } = await call('POST', '/api/auth/setup', { username: 'boss', password: 'boss-pw', displayName: 'Boss' });
    const api = (method, p, body) => call(method, p, body, token);
    const project = await api('POST', '/api/projects', { key: 'RD', name: 'Report dates', template: 'kanban' });
    const projectId = project.id ?? project.project?.id;
    const boardId = project.boardId;
    const { columns } = await api('GET', `/api/boards/${boardId}/data`);
    const done = columns[columns.length - 1];
    for (let i = 0; i < 3; i++) {
      const issue = await api('POST', '/api/issues', { projectId, summary: `finished today ${i}` });
      await api('POST', `/api/issues/${issue.id}/move`, { boardId, columnId: done.id });
    }
    const today = isoDay(Date.now());
    const from = isoDay(Date.now() - 30 * 86400000);
    const q = `boardId=${boardId}&from=${from}&to=${today}`;
    const throughput = await api('GET', `/api/reports/throughput?${q}&interval=day`);
    assert.equal(throughput.buckets.reduce((n, b) => n + b.count, 0), 3, 'throughput counts today');
    const cr = await api('GET', `/api/reports/created-resolved?${q}`);
    assert.equal(cr.days.reduce((n, d) => n + d.resolved, 0), 3, 'resolved today');
    assert.equal(cr.days.reduce((n, d) => n + d.created, 0), 3, 'created today');
    const control = await api('GET', `/api/reports/control?${q}`);
    assert.equal(control.points.length, 3, 'control chart points of today');
    // the reference column can be chosen in the board settings: a middle column then counts as done
    const middle = columns[1];
    const one = await api('POST', '/api/issues', { projectId, summary: 'in the middle' });
    await api('POST', `/api/issues/${one.id}/move`, { boardId, columnId: middle.id });
    const b = await api('GET', `/api/boards/${boardId}`);
    await api('PATCH', `/api/boards/${boardId}`, { settings: { reportColumnId: middle.id }, rev: (b.board ?? b).rev });
    const chosen = await api('GET', `/api/reports/throughput?${q}&interval=day`);
    assert.equal(chosen.referenceColumn.id, middle.id, 'the chosen reference column');
    assert.equal(chosen.buckets.reduce((n, x) => n + x.count, 0), 1, 'only the issue in the chosen column counts');
    const b2 = await api('GET', `/api/boards/${boardId}`);
    await api('PATCH', `/api/boards/${boardId}`, { settings: { reportColumnId: null }, rev: (b2.board ?? b2).rev });
    assert.equal((await api('GET', `/api/reports/throughput?${q}&interval=day`)).referenceColumn.id, done.id, 'unset → the rightmost column again');
  } finally {
    await web.close?.();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
