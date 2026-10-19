import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findBrowser, openInBrowser, fileUrl, candidates } = require('../core/browser');
const { createApi } = require('../core/api');

test('fileUrl is a file URL for the absolute path', () => {
  const p = path.resolve('samples', 'web', 'index.html');
  const url = fileUrl(p);
  assert.match(url, /^file:\/\//);
  assert.match(url, /index\.html$/);
});

test('findBrowser returns the first existing candidate', () => {
  const list = candidates();
  assert.ok(list.length > 0);
  const hit = list[1] || list[0];
  assert.equal(findBrowser((p) => p === hit), hit);
  assert.equal(findBrowser(() => false), null);
});

test('openInBrowser launches that browser with the file URL and does not use the default app', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-browser-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, '<!DOCTYPE html><title>x</title>');
  const calls = [];
  const spawn = (bin, args) => {
    calls.push({ bin, args });
    return { unref() {}, on() {} };
  };
  const out = openInBrowser(file, { find: () => 'C:\\Browsers\\msedge.exe', spawn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, 'C:\\Browsers\\msedge.exe');
  assert.equal(calls[0].args[0], fileUrl(file));
  assert.equal(out.url, calls[0].args[0]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('browser.open is an API method and refuses a missing file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-browser-api-'));
  const api = createApi({ name: 'test', configDir: dir });
  assert.equal(typeof api.methods['browser.open'], 'function');
  await assert.rejects(() => api.call('browser.open', { path: path.join(dir, 'missing.html') }), (e) => e.code === 'ENOENT');
  await api.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
});
