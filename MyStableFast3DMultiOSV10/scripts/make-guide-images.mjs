#!/usr/bin/env node
// `npm run guide:images`: the user's guide pictures (doc/images/*.png and
// *.en.png), taken from the web build in headless Edge / Chrome.
//
// Needs the dev server (`npm run dev`) and a ready engine (`npm run engine`,
// or ENGINE_URL). The "installing" picture comes from a stand-in engine this
// script runs itself, so no real installation is needed for it.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, hasBrowser } from '../test/e2e/cdp.mjs';
import { defaultHome } from './engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'doc', 'images');
const APP = process.env.APP_URL || 'http://localhost:5195/';
const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:57650';
const SAMPLE = process.env.SAMPLE_IMAGE
  || path.join(defaultHome(), 'models', 'sf3d', 'src', 'demo_files', 'examples', 'chair1.png');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// An engine that is always half-way through installing PyTorch.
function fakeInstallingEngine() {
  const health = {
    ok: true, service: 'mysf3d', version: '1.0.0', state: 'installing', error: '',
    install: { step: 'torch', index: 0, total: 4, fraction: 0.42, done: 1.05e9, size: 2.5e9 },
    build: 'cuda', torch: '', device: { preference: 'auto', gpu: 'NVIDIA GeForce RTX 4070 Laptop GPU' },
    model: 'sf3d', loaded: null, capabilities: {}, hasToken: false, busy: null, queued: 0,
    models: [
      { id: 'sf3d', name: 'Stable Fast 3D', status: 'not-installed', license: 'Stability AI Community License', size: '4 GB', summary: { ko: '', en: '' }, options: [] },
      { id: 'triposr', name: 'TripoSR', status: 'not-installed', license: 'MIT', size: '1.7 GB', summary: { ko: '', en: '' }, options: [] },
    ],
    python: '3.11', platform: 'Windows AMD64', home: '', uptime: 30, logSeq: 3,
  };
  const lines = [
    { seq: 1, t: Date.now(), level: 'info', src: 'engine', msg: '[1/4] torch …' },
    { seq: 2, t: Date.now(), level: 'info', src: 'uv', msg: '$ uv pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128 …' },
    { seq: 3, t: Date.now(), level: 'info', src: 'uv', msg: 'Downloading torch (2.4GiB)' },
  ];
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/logs')) res.end(JSON.stringify({ lines: req.url.endsWith('after=0') ? lines : [], last: 3 }));
    else res.end(JSON.stringify(health));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function rectOf(b, selector, pad = 8) {
  return b.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: Math.max(0, r.left - ${pad}), y: Math.max(0, r.top - ${pad}), width: r.width + ${pad * 2}, height: r.height + ${pad * 2}, scale: 1 }; })()`);
}

async function clip(b, file, rect) {
  const r = await b.send('Page.captureScreenshot', { format: 'png', clip: rect });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

async function shots(lang) {
  const suffix = lang === 'en' ? '.en' : '';
  const file = (n) => path.join(OUT, `${n}${suffix}.png`);
  const b = await launch({ port: lang === 'en' ? 9582 : 9581, width: 1520, height: 940 });
  try {
    const state = (extra = {}) => JSON.stringify({ engineUrl: ENGINE, lang, showStartPage: true, theme: 'dark', ...extra });
    await b.goto(APP);
    await b.eval(`localStorage.clear(); localStorage.setItem('mystablefast3d-lang', '${lang}'); localStorage.setItem('mystablefast3d-state', ${JSON.stringify(state())}); true`);
    await b.goto(APP);
    await b.waitFor(`document.querySelectorAll('.start .model-link').length >= 2`, 30000);
    await b.waitFor(`/준비됨|Ready/.test(document.querySelector('.st-engine')?.textContent || '')`, 120000);
    await sleep(800);
    await b.shot(file('start'));

    await b.drop([SAMPLE]);
    await b.waitFor(`!!document.querySelector('.input-figure img')`);
    await b.click('.convert-group .tbtn.primary');
    await b.waitFor(`!document.querySelector('.convert-overlay') && !!window.__mysf3dViewer?.model`, 300000);
    await sleep(1500);
    await b.shot(file('main'));

    // The model picker, open.
    await b.click('.model-picker > .tbtn');
    await sleep(500);
    const menu = await b.eval(`(() => { const a = document.querySelector('.model-picker').getBoundingClientRect(); const d = document.querySelector('.dropdown').getBoundingClientRect();
      return { x: Math.max(0, a.left - 10), y: Math.max(0, a.top - 8), width: Math.max(d.right, a.right) - a.left + 20, height: d.bottom - a.top + 16, scale: 1 }; })()`);
    await clip(b, file('model-menu'), menu);
    await b.eval(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true`);
    await sleep(300);

    // Lights: select the key light.
    await b.eval(`[...document.querySelectorAll('.panel-tab')][2].click(); true`);
    await sleep(300);
    await b.eval(`document.querySelector('.light-list .light-row').click(); true`);
    await sleep(800);
    await b.shot(file('lights'));

    // Scene with the bounding box.
    await b.eval(`[...document.querySelectorAll('.panel-tab')][1].click(); true`);
    await b.eval(`document.querySelector('.light-list') ; [...document.querySelectorAll('.toolbar .tbtn')].find((x) => /경계 상자|Bounding box/.test(x.getAttribute('aria-label') || '')).click(); true`);
    await b.eval(`window.__mysf3dViewer.selectLight(null); true`);
    await sleep(800);
    await b.shot(file('scene'));
    await b.eval(`[...document.querySelectorAll('.toolbar .tbtn')].find((x) => /경계 상자|Bounding box/.test(x.getAttribute('aria-label') || '')).click(); true`);

    // The log panel, taller.
    await b.eval(`(() => { const s = JSON.parse(localStorage.getItem('mystablefast3d-state')); return true; })()`);
    const log = await rectOf(b, '.log-panel', 0);
    await clip(b, file('log'), { ...log, y: Math.max(0, log.y - 2), height: log.height + 2 });

    // Settings → Engine.
    await b.eval(`document.querySelectorAll('.toolbar-right .tbtn')[[...document.querySelectorAll('.toolbar-right .tbtn')].length - 2].click(); true`);
    await b.waitFor(`!!document.querySelector('.settings-modal')`);
    await b.eval(`[...document.querySelectorAll('.settings-modal .tab')][1].click(); true`);
    await sleep(500);
    await clip(b, file('settings-engine'), await rectOf(b, '.settings-modal', 0));
  } finally {
    b.close();
  }

  // The installation banner, from the stand-in engine.
  const fake = await fakeInstallingEngine();
  const url = `http://127.0.0.1:${fake.address().port}`;
  const c = await launch({ port: lang === 'en' ? 9584 : 9583, width: 1520, height: 940 });
  try {
    await c.goto(APP);
    await c.eval(`localStorage.clear(); localStorage.setItem('mystablefast3d-lang', '${lang}'); localStorage.setItem('mystablefast3d-state', ${JSON.stringify(JSON.stringify({ engineUrl: url, lang, showStartPage: false }))}); true`);
    await c.goto(APP);
    await c.drop([SAMPLE]);
    await c.waitFor(`!!document.querySelector('.engine-banner .engine-card')`, 20000);
    await sleep(800);
    const r = await rectOf(c, '.engine-banner', 14);
    await clip(c, file('engine-install'), r);
  } finally {
    c.close();
    fake.close();
  }
}

async function main() {
  if (!hasBrowser()) throw new Error('No Edge / Chrome found (set CHROME_PATH).');
  if (!fs.existsSync(SAMPLE)) throw new Error(`Sample image missing: ${SAMPLE} (set SAMPLE_IMAGE)`);
  fs.mkdirSync(OUT, { recursive: true });
  for (const lang of ['ko', 'en']) {
    console.log(`[guide] ${lang} …`);
    await shots(lang);
  }
  console.log(`[guide] Pictures in ${OUT}`);
}

main().catch((err) => { console.error(`[guide] ${err.message}`); process.exit(1); });
