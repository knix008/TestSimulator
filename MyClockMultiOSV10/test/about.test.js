'use strict';

/** 프로그램 정보 창 — 아이콘·버전·빌드 정보·제작자가 제대로 나오는지. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/minidom');
const { readSource } = require('./helpers/fakes');

const ROOT = path.join(__dirname, '..');

const INFO = {
  name: 'MyClock',
  version: '1.0.0',
  author: 'SHKWON',
  email: 'knix008@naver.com',
  license: 'MIT',
  electron: '33.4.11',
  chrome: '130.0.6723.191',
  node: '20.18.3',
  platform: 'win32 x64',
  packaged: false,
  buildDate: '2026-10-03T05:16:00.000Z',
  iconSvg: '<svg viewBox="0 0 512 512"><circle cx="256" cy="256" r="240" /></svg>'
};

/** about.html 을 작은 DOM 으로 세우고 진짜 about.js 를 돌린다. */
async function openAboutWindow(options = {}) {
  const document = createDocument(fs.readFileSync(path.join(ROOT, 'src', 'about.html'), 'utf8'));
  const info = { ...INFO, ...(options.info || {}) };
  const log = { closed: 0, external: [] };

  const api = {
    settings: { load: async () => ({ theme: 'OceanTheme', customThemeColor: '#89B4FA', customThemeLight: false }) },
    app: {
      info: async () => ({ ...info }),
      openExternal: (url) => log.external.push(url)
    },
    window: {
      closeSelf: () => {
        log.closed += 1;
      }
    }
  };

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    Promise,
    Error,
    setTimeout,
    clearTimeout
  };
  sandbox.window = { myclock: api };
  sandbox.document = document;
  sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
  sandbox.globalThis = sandbox;

  const html = fs.readFileSync(path.join(ROOT, 'src', 'about.html'), 'utf8');
  const context = vm.createContext(sandbox);
  for (const src of [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', src), 'utf8'), context, { filename: src });
  }
  for (let i = 0; i < 4; i++) await new Promise((done) => setImmediate(done));

  return { document, log, api, $: (id) => document.getElementById(id) };
}

test('정보 창에 이름·버전·설명이 나온다', async () => {
  const about = await openAboutWindow();
  assert.equal(about.$('aboutName').textContent, 'MyClock');
  assert.equal(about.$('aboutVersion').textContent, '버전 1.0.0');
  assert.match(about.$('aboutTagline').textContent, /Windows/);
});

test('정보 창에 프로그램 아이콘이 들어간다', async () => {
  const about = await openAboutWindow();
  const icon = about.$('aboutIcon');
  assert.ok(icon.querySelector('svg'), '아이콘 그림이 없다');
});

test('정보 창에 빌드 정보가 나온다', async () => {
  const about = await openAboutWindow();
  const names = about.$('aboutBuild').querySelectorAll('dt').map((n) => n.textContent);
  const values = about.$('aboutBuild').querySelectorAll('dd').map((n) => n.textContent);

  assert.deepEqual(names, ['빌드', '빌드 시각', 'Electron', 'Chromium', 'Node.js', '플랫폼']);
  assert.equal(values[0], '개발 실행');
  assert.match(values[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, `빌드 시각: ${values[1]}`);
  assert.equal(values[2], '33.4.11');
  assert.equal(values[5], 'win32 x64');
});

test('설치본이면 "설치본"으로 적는다', async () => {
  const about = await openAboutWindow({ info: { packaged: true } });
  const values = about.$('aboutBuild').querySelectorAll('dd').map((n) => n.textContent);
  assert.equal(values[0], '설치본');
});

test('제작자와 메일이 나오고, 메일을 누르면 메일 프로그램을 연다', async () => {
  const about = await openAboutWindow();

  assert.equal(about.$('aboutAuthor').textContent, 'SHKWON');
  assert.equal(about.$('aboutEmail').textContent, 'knix008@naver.com');
  assert.equal(about.$('aboutLicense').textContent, 'MIT');
  assert.match(about.$('aboutCopyright').textContent, /SHKWON/);

  about.$('aboutEmail').emit('click');
  assert.deepEqual(about.log.external, ['mailto:knix008@naver.com']);
});

test('정보 창은 ✕ 와 Esc 로 닫는다', async () => {
  const about = await openAboutWindow();

  about.$('aboutCloseBtn').emit('click');
  assert.equal(about.log.closed, 1);

  about.document.emit('keydown', { key: 'Escape' });
  assert.equal(about.log.closed, 2);
});

test('정보 창도 테마를 따른다', async () => {
  const about = await openAboutWindow();
  assert.equal(about.document.documentElement.dataset.theme, 'OceanTheme');
});

test('제작자 정보는 package.json 과 같다', () => {
  const pkg = require('../package.json');
  const main = readSource('electron/main.js');

  assert.equal(pkg.author.name, 'SHKWON');
  assert.equal(pkg.author.email, 'knix008@naver.com');
  assert.ok(main.includes(`author: '${pkg.author.name}'`), '메인 프로세스의 제작자 이름이 다르다');
  assert.ok(main.includes(`email: '${pkg.author.email}'`), '메인 프로세스의 메일이 다르다');
  assert.ok(main.includes(`license: '${pkg.license}'`));
  // 아이콘 원본이 포장 목록에 들어 있어야 설치본에서도 그림이 보인다.
  assert.ok(pkg.build.files.includes('asset/icon.svg'), '아이콘 원본이 포장되지 않는다');
});
