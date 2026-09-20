// API surface: app.info, session, profiles, clipboard, folder picker, unknown methods.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi, serializeError } = require('../core/api');
const { PROTOCOLS } = require('../core/profiles');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-api-'));
const folder = path.join(tmp, 'pick');
fs.mkdirSync(folder);

let api;
let clip = '';

before(() => {
  api = createApi({
    name: 'test',
    version: '9.9.9',
    configDir: path.join(tmp, 'config'),
    detachedDialogs: true,
    pickFolder: async (start) => start || folder,
    clipboard: {
      writeText: (t) => { clip = String(t); },
      readText: () => clip,
    },
  });
});

after(async () => {
  await api.shutdown();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('api: app.info reports host, protocols and capabilities', async () => {
  const info = await api.call('app.info');
  assert.equal(info.host, 'test');
  assert.equal(info.version, '9.9.9');
  assert.equal(info.home, os.homedir());
  assert.deepEqual(info.protocols, PROTOCOLS);
  assert.equal(info.capabilities.terminals, true);
  assert.equal(info.capabilities.detachedDialogs, true);
  assert.equal(info.capabilities.pickFolder, true);
  assert.ok(api.methods.includes('session.load'));
  assert.ok(api.methods.includes('terminal.open'));
  assert.ok(api.methods.includes('app.fonts'));
  assert.ok(api.methods.includes('transfer.upload'));
});

test('api: app.fonts lists installed families', async () => {
  const r = await api.call('app.fonts');
  assert.ok(Array.isArray(r.fonts) && r.fonts.length >= 1);
  assert.ok(r.fonts.every((n) => typeof n === 'string' && n));
  assert.ok(r.defaultFamily);
});

test('api: unknown method and serializeError', async () => {
  await assert.rejects(() => api.call('no.such'), /Unknown API method/);
  const err = Object.assign(new Error('boom'), { code: 'EFAIL', path: '/x' });
  const s = serializeError(err);
  assert.equal(s.code, 'EFAIL');
  assert.equal(s.message, 'boom');
  assert.equal(s.path, '/x');
  assert.equal(serializeError(null).code, 'UNKNOWN');
});

test('api: session save/load settings used by the settings dialog', async () => {
  const loaded = await api.call('session.load');
  assert.equal(loaded.theme, 'midnight');
  const saved = await api.call('session.save', {
    patch: {
      theme: 'ocean',
      terminalStartDir: folder,
      powershellPrompt: 'PS {path}> ',
      terminalMaxLines: 8000,
      terminalFont: 'Consolas',
      terminalFontSize: 16,
      lastLocalPath: folder,
    },
  });
  assert.equal(saved.theme, 'ocean');
  assert.equal(saved.terminalStartDir, folder);
  assert.equal(saved.terminalMaxLines, 8000);
  assert.equal(saved.terminalFont, 'Consolas');
  assert.equal(saved.terminalFontSize, 16);
  assert.equal((await api.call('session.load')).theme, 'ocean');
});

test('api: profiles save/list/delete through the API', async () => {
  await api.call('profiles.save', { profile: { name: 'office', protocol: 'SFTP', host: 'h', port: '22', user: 'u', password: 'secret' } });
  const { profiles } = await api.call('profiles.list');
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'office');
  assert.equal(profiles[0].password, 'secret');
  const del = await api.call('profiles.delete', { names: ['office'] });
  assert.equal(del.removed, 1);
  assert.equal((await api.call('profiles.list')).profiles.length, 0);
});

test('api: clipboard and pickFolder', async () => {
  await api.call('clipboard.write', { text: '경로 복사' });
  assert.equal((await api.call('clipboard.read')).text, '경로 복사');
  const picked = await api.call('local.pickFolder', { start: folder });
  assert.equal(picked.path, folder);
});

test('api: pickFolder / reveal are unsupported without a host hook', async () => {
  const plain = createApi({ name: 'web', configDir: path.join(tmp, 'web') });
  try {
    await assert.rejects(() => plain.call('local.pickFolder', {}), (e) => e.code === 'UNSUPPORTED');
    await assert.rejects(() => plain.call('local.reveal', { path: folder }), (e) => e.code === 'UNSUPPORTED');
    const info = await plain.call('app.info');
    assert.equal(info.capabilities.pickFolder, false);
    assert.equal(info.capabilities.detachedDialogs, false);
  } finally {
    await plain.shutdown();
  }
});

test('api: local.exists / stat / jobs.running empty', async () => {
  const file = path.join(folder, 'a.txt');
  fs.writeFileSync(file, 'hi');
  assert.equal((await api.call('local.exists', { path: file })).exists, true);
  const st = await api.call('local.stat', { path: file });
  assert.equal(st.isDir, false);
  assert.equal(st.size, 2);
  assert.deepEqual(await api.call('jobs.running'), []);
});
