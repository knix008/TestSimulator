// npm run guide:images — the pictures of the user's guide and the tutorial document, taken from
// the real app (the web build in headless Edge / Chrome), in Korean and English:
//   doc/images/ko/NN-name.png, doc/images/en/NN-name.png
// Then `npm run build:docs` copies them to public/docs/images/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../test/e2e/web-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** [file, what to do before the picture]. `p` is the CDP page; app actions through window.__myhomemaker. */
export const SHOTS = [
  ['01-start', async () => {}],
  ['02-new-site', async (p) => { await p.eval("void window.__myhomemaker.run('new'), 1"); await sleep(900); }],
  ['03-editor', async (p) => { await closePopups(p); await p.eval("window.__myhomemaker.actions.newSite('business'), 1"); await sleep(900); }],
  ['04-blocks-panel', async (p) => { await p.eval("window.__myhomemaker.actions.select(null), 1"); }],
  ['05-select-block', async (p) => { await selectType(p, 'features'); }],
  ['06-inline-edit', async (p) => { await selectType(p, 'heroSplit'); await p.eval(`(() => { const a = window.__myhomemaker; const id = a.state.selected; const el = a.api.view.blockElement(id).querySelector('[data-edit="title"]'); a.api.view.startEdit(el); return 1; })()`); }],
  ['07-content-tab', async (p) => { await p.eval('window.__myhomemaker.api.view.finishEdit(false), 1'); await selectType(p, 'features'); await p.eval("(() => { const a = window.__myhomemaker; a.state.rightTab = 'content'; a.api.renderRight(); document.querySelector('#editors .items-field')?.scrollIntoView({ block: 'center' }); return 1; })()"); }],
  ['08-style-tab', async (p) => { await selectType(p, 'stats'); await p.eval("(() => { const a = window.__myhomemaker; a.state.rightTab = 'style'; a.api.renderRight(); return 1; })()"); }],
  ['09-add-block-menu', async (p) => { await selectType(p, 'features'); await p.eval("void window.__myhomemaker.actions.addBlockMenu(), 1"); await sleep(700); }],
  ['10-pages', async (p) => { await closePopups(p); await p.eval("void window.__myhomemaker.run('addPage'), 1"); await sleep(800); }],
  ['11-page-tab', async (p) => { await closePopups(p); await p.eval("(() => { const a = window.__myhomemaker; a.actions.openPage(a.state.docs[0].site.pages[1].id); a.actions.select(null); a.state.rightTab = 'page'; a.api.renderRight(); return 1; })()"); }],
  ['12-design-picker', async (p) => { await p.eval("(() => { const a = window.__myhomemaker; a.actions.openPage(a.state.docs[0].site.pages[0].id); return 1; })()"); await p.eval("void window.__myhomemaker.run('designPicker'), 1"); await sleep(900); }],
  ['13-site-tab', async (p) => { await closePopups(p); await p.eval("(() => { const a = window.__myhomemaker; a.actions.setDesign({ id: 'midnight' }, { reset: true }); a.actions.select(null); a.state.rightTab = 'site'; a.api.renderRight(); return 1; })()"); }],
  ['14-mobile', async (p) => { await p.eval("(() => { const a = window.__myhomemaker; a.actions.setDesign({ id: 'corporate' }, { reset: true }); a.actions.setDevice('mobile'); a.actions.setZoom(100); return 1; })()"); }],
  ['15-preview', async (p) => { await p.eval("(() => { const a = window.__myhomemaker; a.actions.setDevice('desktop'); a.actions.fitWidth({ quiet: true }); a.actions.togglePreview(); return 1; })()"); }],
  ['16-publish', async (p) => { await p.eval("(() => { const a = window.__myhomemaker; if (a.state.preview) a.actions.togglePreview(); return 1; })()"); await p.eval("void window.__myhomemaker.run('publish'), 1"); await sleep(900); }],
  ['17-settings', async (p) => { await closePopups(p); await p.eval("void window.__myhomemaker.popups.open('settings', { tab: 'editor' }), 1"); await sleep(900); }],
  ['18-sample', async (p) => { await closePopups(p); await p.eval("window.__myhomemaker.actions.openSampleBuiltin('bakery'), 1"); await sleep(900); }],
  ['19-tutorial', async (p) => { await p.eval("void window.__myhomemaker.actions.startTutorial({ index: 9 }), 1"); await sleep(1600); }],
];

async function closePopups(p) {
  await p.eval('void window.__myhomemaker.popups.closeAll(), 1');
  await p.eval("document.querySelectorAll('.web-popup, .web-popup-shield').forEach((el) => el.remove()); window.__myhomemaker.popups.frames.clear(); 1");
  await sleep(200);
}

async function selectType(p, type) {
  await p.eval(`(() => { const a = window.__myhomemaker; const site = a.state.docs[0].site; const page = site.pages.find((x) => x.blocks.some((b) => b.type === '${type}')); a.actions.openPage(page.id); a.actions.select(page.blocks.find((b) => b.type === '${type}').id); return 1; })()`);
  await sleep(300);
}

export async function capture({ languages = ['ko', 'en'], outDir = path.join(root, 'doc', 'images'), only = null } = {}) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-guide-'));
  const built = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) throw new Error('vite build failed');
  const written = [];
  try {
    for (const language of languages) {
      const { page, close } = await launch(dist, { width: 1440, height: 900, language });
      try {
        await page.eval(`(() => { localStorage.setItem('myhomemaker.settings.v1', JSON.stringify({ language: '${language}', theme: 'light', showWelcome: false, animationRandom: false, animation: 'aurora', tutorialDone: false })); return 1; })()`);
        await page.send('Page.reload');
        await page.waitFor("document.readyState === 'complete' && !!window.__myhomemaker", { timeout: 20000 });
        await sleep(800);
        fs.mkdirSync(path.join(outDir, language), { recursive: true });
        for (const [name, run] of SHOTS) {
          if (only && !only.includes(name)) { await run(page); continue; }
          await run(page);
          await sleep(700);
          const file = path.join(outDir, language, `${name}.png`);
          await page.screenshot(file);
          written.push(file);
          if (page.errors.length) console.warn(`${language}/${name}: ${page.errors.splice(0).join(' | ')}`);
        }
      } finally {
        await close();
      }
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await capture();
  console.log(`그림 ${written.length}장: ${path.relative(root, path.join(root, 'doc', 'images'))}/{ko,en}/`);
}
