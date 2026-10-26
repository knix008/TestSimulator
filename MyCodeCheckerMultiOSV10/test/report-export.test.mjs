// Native report files through the API and the regulatory ZIP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');

function zipNames(buf) {
  const names = [];
  let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  for (let n = 0; n < count; n++) {
    const len = buf.readUInt16LE(p + 28);
    names.push(buf.slice(p + 46, p + 46 + len).toString('utf8'));
    p += 46 + len + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return names;
}

test('report.export returns docx, xlsx and pdf files', async () => {
  const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-rx-')) });
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  for (const [format, magic] of [['docx', 'PK'], ['xlsx', 'PK'], ['pdf', '%PDF']]) {
    const out = await api.call('report.export', { projectId: r.project.id, kind: 'executive', format });
    assert.ok(out.fileName.endsWith(`.${format}`) && !out.fileName.includes('..'), out.fileName);
    assert.equal(Buffer.from(out.base64, 'base64').slice(0, magic.length).toString('latin1'), magic);
  }
});

test('the regulatory report bundles PDFs, the XLSX and a manifest', async () => {
  const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-rx-')) });
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  const z = await api.call('report.regulatory', { projectId: r.project.id, kinds: ['executive', 'security'] });
  const names = zipNames(Buffer.from(z.base64, 'base64'));
  assert.equal(names.filter((n) => n.endsWith('.pdf')).length, 2);
  assert.ok(names.some((n) => n.endsWith('.xlsx')));
  assert.ok(names.includes('manifest.json'));
});
