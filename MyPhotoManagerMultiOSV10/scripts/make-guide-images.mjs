// Screenshots for the user guide (UsersGuide.md / UsersGuide.en.md), in Korean and
// English: docs/guide/images/<name>.<ko|en>.jpg. Runs the real desktop app (debug
// build, like the E2E tests) on a copy of the test photos — nothing of the user's
// is shown or touched. Then: node scripts/build-guide.mjs
//
//   node scripts/make-guide-images.mjs [name …]     (default: all)
import fs from 'node:fs';
import path from 'node:path';
import { listTargets, Page, sleep } from '../test/e2e/cdp.mjs';
import { App, root } from '../test/e2e/harness.mjs';

const out = path.join(root, 'docs', 'guide', 'images');
fs.mkdirSync(out, { recursive: true });
const P = 'window.__myphoto';
const js = JSON.stringify;
const only = new Set(process.argv.slice(2));

async function jpeg(page, file) {
  const response = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
  if (response.error) throw new Error(response.error.message);
  fs.writeFileSync(file, Buffer.from(response.result.data, 'base64'));
  console.log(`  ${path.relative(root, file)}`);
}

/** The newest dialog window (its own page target). */
async function dialogPage(app) {
  for (let i = 0; i < 40; i++) {
    const target = (await listTargets(app.port)).filter((t) => t.type === 'page' && t.url.includes('#dialog-')).at(-1);
    if (target) return new Page(target).open();
    await sleep(150);
  }
  throw new Error('no dialog window');
}

const app = new App();
await app.start();
const m = app.main;
const pathOf = (name) => m.eval(`${P}.app.state.list.find((i) => i.name === ${js(name)})?.path`);
const settle = async (ms = 900) => {
  await m.waitFor(`!${P}.app.state.loading`, { timeout: 30000 }).catch(() => {});
  await sleep(ms);
};

const SHOTS = {
  async start() {
    await m.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('start'); 1`);
    await m.waitFor(`document.querySelectorAll('.start-card').length >= 8`);
    await sleep(3000); // the 3D background
  },
  async manage() {
    await m.eval(`${P}.actions.setMode('manage'); ${P}.actions.showLeftTab('catalog'); ${P}.actions.showRightTab('properties'); 1`);
    const beach = await pathOf('beach.jpg');
    await m.eval(`${P}.actions.setSelection([${js(beach)}], ${js(beach)}); 1`);
    await settle(1500);
  },
  async list() {
    await m.eval(`${P}.app.settings.view = 'details'; ${P}.app.saveSettings(); ${P}.fileList.rebuild(); 1`);
    await settle();
  },
  async search() {
    await m.eval(`${P}.app.settings.view = 'thumbs'; ${P}.app.saveSettings(); ${P}.fileList.rebuild(); ${P}.actions.showLeftTab('search'); 1`);
    await settle();
  },
  async viewer() {
    await m.eval(`${P}.actions.showLeftTab('catalog'); ${P}.actions.viewItem(${js(await pathOf('forest.jpg'))}); 1`);
    await m.waitFor(`${P}.app.state.mode === 'view'`);
    await settle(1500);
  },
  async editor() {
    const file = await pathOf('sunset.png');
    await m.eval(`${P}.actions.editPath(${js(file)}); 1`);
    await m.waitFor(`${P}.editor.path === ${js(file)} && ${P}.editor.debug().preview`, { timeout: 60000 });
    await m.eval(`${P}.editor.testing.change((e) => { e.adjust.exposure = 0.3; e.adjust.vibrance = 30; }, ${P}.t('edit.exposure')); 1`);
    await settle(1200);
  },
  async compare() {
    await m.eval(`${P}.editor.testing?.discard?.(); ${P}.actions.setMode('manage'); 1`);
    await settle();
    const paths = [await pathOf('beach.jpg'), await pathOf('forest.jpg')];
    await m.eval(`${P}.actions.setSelection(${js(paths)}, ${js(paths[0])}); ${P}.menu('tools', 'tools.compare'); 1`);
    await settle(1800);
  },
  async dashboard() {
    await m.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('dashboard'); 1`);
    await settle(1500);
  },
  async settings() {
    await m.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('manage'); document.querySelector('#open-settings').click(); 1`);
    return dialogPage(app);
  },
  async batch() {
    await m.eval(`${P}.closeAllDialogs(); 1`);
    await settle(400);
    const paths = await m.eval(`${P}.app.state.list.filter((i) => /\\.(jpg|png)$/i.test(i.name)).slice(0, 4).map((i) => i.path)`);
    await m.eval(`${P}.actions.setSelection(${js(paths)}, ${js(paths[0])}); ${P}.menu('tools', 'tools.batchRename'); 1`);
    return dialogPage(app);
  },
};

try {
  for (const lang of ['ko', 'en']) {
    console.log(lang);
    if ((await m.eval('document.documentElement.lang')) !== lang) {
      await m.eval(`document.querySelector('#language-toggle').click(); 1`);
      await m.waitFor(`document.documentElement.lang === ${js(lang)}`);
      await sleep(500);
    }
    for (const [name, shoot] of Object.entries(SHOTS)) {
      const page = await shoot();
      if (only.size && !only.has(name)) { if (page) page.close(); continue; }
      if (page) await sleep(700);
      await jpeg(page ?? m, path.join(out, `${name}.${lang}.jpg`));
      if (page) page.close();
      // Leave the editor / dialogs before the next picture.
      if (name === 'editor') {
        await m.eval(`${P}.dq('#edit-cancel').click(); 1`);
        await sleep(500);
        const ask = await m.eval(`Boolean(${P}.topDialog())`);
        if (ask) await m.eval(`[...${P}.topDialog().querySelectorAll('.dialog-buttons button')].find((b) => b.textContent.trim() === ${P}.t('edit.bgSaveNo'))?.click(); 1`);
        await m.waitFor(`${P}.app.state.mode !== 'edit'`).catch(() => {});
      }
      if (name === 'compare') await m.eval(`document.querySelector('.compare-bar .btn')?.click(); 1`);
      if (page) await m.eval(`${P}.closeAllDialogs(); 1`);
    }
  }
} finally {
  await app.stop();
}
