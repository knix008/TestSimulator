// Pictures for the user's guide and the tutorial document: the web build in headless Edge (the E2E harness), each
// tutorial step and each guide scene captured in Korean and English, saved as WebP in doc/images/{ko,en}/.
// Samples only (built-in generated files) — never the user's files; the print window is only shown, never printed.
//   npm run docs:images            all pictures, then npm run build:docs puts them in the pages
//   npm run docs:images -- --only guide|tutorial
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebApp } from '../test/e2e/web.harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const WIDTH = 1440;
const HEIGHT = 900;

/** Guide scenes: name → page script (A = app, T = test helpers), run after a reset. */
const GUIDE = {
  start: `await T.reset(); await T.frames(4);`,
  overview: `await T.reset({ sample: 'png' }); A.app.updateSettings({ showLeftPanel: true, showRightPanel: true, showBottomPanel: true }); await A.app.runTemplate(A.editor.active(), { template: 'png', quiet: true }); A.app.setRightTab('structure'); T.view().select(0x10, 0x1D);`,
  editing: `await T.reset({ sample: 'mixed' }); T.view().select(0x100, 0x11B); A.app.setRightTab('inspector'); await T.sleep(300);`,
  find: `await T.reset({ sample: 'mixed' }); await A.toolHost.ops.findAll({ pattern: { kind: 'text', value: 'Device', encoding: 'utf8', caseSensitive: false }, scope: 'all' }).catch(() => {}); A.run('find'); await T.popupReady('find'); await T.sleep(300);`,
  properties: `await T.reset({ sample: 'pe' }); await A.props.runHashes(); A.app.setRightTab('hashes'); await T.sleep(300);`,
  stats: `await T.reset({ sample: 'mixed' }); await A.props.runStats(); A.app.setRightTab('stats'); await T.sleep(300);`,
  template: `await T.reset({ sample: 'png' }); A.run('template'); await T.popupReady('template'); await T.sleep(400);`,
  strings: `await T.reset({ sample: 'mixed' }); A.run('strings'); await T.popupReady('strings'); T.click('strings', '[data-tw-act="strings-run"]'); await T.until(() => T.popupDoc('strings').querySelectorAll('.tw-item').length > 3, 8000, 'strings');`,
  disasm: `await T.reset({ sample: 'mixed' }); T.view().setCaret(0x5000); A.run('disasm'); await T.popupReady('disasm'); T.click('disasm', '[data-tw-act="disasm-caret"]'); await T.until(() => T.popupDoc('disasm').querySelector('.tw-asm .tw-item'), 8000, 'asm');`,
  carve: `await T.reset({ sample: 'mixed' }); A.run('carve'); await T.popupReady('carve'); await T.until(() => T.popupDoc('carve').querySelector('[data-tw^="type:"]'), 5000, 'types'); T.click('carve', '[data-tw-act="carve-run"]'); await T.until(() => T.popupDoc('carve').querySelectorAll('.tw-list .tw-item').length >= 3, 8000, 'carved');`,
  filesystem: `await T.reset({ sample: 'disk' }); A.run('filesystem'); await T.popupReady('filesystem'); await T.until(() => T.popupDoc('filesystem').querySelectorAll('[data-fs-part]').length === 2, 8000, 'parts'); T.click('filesystem', '[data-fs-part="0"]'); await T.until(() => T.popupDoc('filesystem').querySelector('[data-fs-entry]'), 8000, 'root');`,
  yara: `await T.reset({ sample: 'pe' }); A.run('yara'); await T.popupReady('yara'); T.click('yara', '[data-tw-act="yara-example"]'); await T.frames(2); T.click('yara', '[data-tw-act="yara-run"]'); await T.until(() => T.popupDoc('yara').querySelector('[data-tw-goto]'), 8000, 'matches');`,
  processor: `await T.reset({ sample: 'text' }); T.view().select(0, 16); A.run('processor'); await T.popupReady('processor'); await T.sleep(500); const run = T.popupDoc('processor').querySelector('[data-tw-act="pn-run"], [data-tw-act="processor-run"]'); if (run) { run.click(); await T.sleep(800); }`,
  compare: `await T.reset({ sample: 'elf' }); await A.app.openSample('pe'); const [a, b] = A.editor.tabs; await A.app.openCompare(a.doc.id, b.doc.id); await T.until(() => A.app.activeTab()?.kind === 'compare', 8000, 'compare'); await T.sleep(400);`,
  textmode: `await T.reset({ sample: 'text' }); await A.run('textMode'); await T.until(() => document.querySelector('.text-mode .cm-editor'), 8000, 'text'); await T.sleep(300);`,
  transform: `await T.reset({ sample: 'text' }); T.view().select(0, 32); A.run('tr:aesEncrypt'); await T.popupReady('form'); await T.sleep(300);`,
  calc: `await T.reset({ sample: 'mixed' }); A.run('calc'); await T.popupReady('calc'); T.fill('calc', '[data-tw="expr"]', '0xDEAD << 4 | 0x0F'); await T.until(() => T.popupDoc('calc').querySelector('.tw-calc td'), 5000, 'calc');`,
  export: `await T.reset({ sample: 'png' }); T.view().select(0, 64); A.run('exportMenu'); await T.sleep(1200);`,
  print: `await T.reset({ sample: 'png' }); A.run('print'); await T.popupReady('print'); await T.until(() => T.popupDoc('print').querySelector('.print-frame'), 10000, 'preview'); await T.sleep(1500);`,
  settings: `await T.reset(); A.run('settings'); await T.popupReady('settings'); await T.sleep(300);`,
  visualizer: `await T.reset({ sample: 'mixed' }); A.run('visualizer'); await T.popupReady('visualizer'); await T.until(() => T.popupDoc('visualizer').querySelector('[data-vis-canvas]')?.width > 1, 8000, 'pixels'); T.fill('visualizer', '[data-tw="vis-zoom"]', '4'); await T.sleep(300);`,
  script: `await T.reset({ sample: 'zip' }); A.run('script'); await T.popupReady('script'); T.fill('script', '[data-tw="script-example"]', 'report'); T.click('script', '[data-tw-act="script-example-load"]'); await T.frames(2); T.click('script', '[data-tw-act="script-run"]'); await T.until(() => T.popupDoc('script').querySelector('[data-script-output]'), 8000, 'output');`,
  patch: `await T.reset({ sample: 'png' }); await A.app.openSample('bmp'); A.run('patch'); await T.popupReady('patch'); await T.sleep(400);`,
  demangle: `await T.reset({ sample: 'pe' }); A.run('demangle'); await T.popupReady('demangle'); T.click('demangle', '[data-tw-act="dm-run"]'); await T.until(() => T.popupDoc('demangle').querySelector('.tw-list .tw-item'), 8000, 'names');`,
  split: `await T.reset({ sample: 'elf' }); await A.run('splitView'); await T.frames(3); A.app.activeTab().splitView.setCaret(0x40, { reveal: true }); await T.sleep(300);`,
  multisearch: `await T.reset({ sample: 'mixed' }); A.run('find'); await T.popupReady('find'); T.fill('find', '[data-tw="kind"]', 'multi'); await T.until(() => T.popupDoc('find').querySelector('textarea[data-tw="value"]'), 5000, 'terms'); T.fill('find', 'textarea[data-tw="value"]', '"Device"\\n4D 59 46 57\\n/Serial: [0-9]{4}/'); T.click('find', '[data-tw-act="find-all"]'); await T.until(() => T.popupDoc('find').querySelectorAll('.tw-list .tw-item').length >= 3, 8000, 'results');`,
};

async function shot(app, file) {
  const response = await app.main.send('Page.captureScreenshot', { format: 'webp', quality: 82 });
  if (response.error) throw new Error(response.error.message);
  const { data } = response.result;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

const app = new WebApp({ width: WIDTH, height: HEIGHT });
const made = [];
try {
  await app.start();
  for (const lang of ['ko', 'en']) {
    const dir = path.join(root, 'doc', 'images', lang);
    await app.run(`await T.reset(); A.app.updateSettings({ language: ${JSON.stringify(lang)}, theme: 'paper', animationSpeed: 0 }); await T.frames(3);`);
    if (only !== 'tutorial') {
      for (const [name, script] of Object.entries(GUIDE)) {
        try {
          await app.run(script, 30000);
          await app.run('await T.frames(4); await T.sleep(250);');
          await shot(app, path.join(dir, `guide-${name}.webp`));
          made.push(`${lang}/guide-${name}`);
        } catch (error) { console.error(`[docs:images] ${lang} guide ${name}: ${error.message}`); process.exitCode = 1; }
      }
    }
    if (only !== 'guide') {
      const total = await app.run('await T.reset(); return (await import("/src/ui/tutorial.js")).STEPS.map((s) => s.id);');
      await app.run(`A.state.settings.tutorialDone = false; A.run('tutorial'); await T.until(() => A.tutorial()?.state().active, 15000, 'tutorial'); return 1;`);
      for (const [index, id] of total.entries()) {
        try {
          await app.run(`const tu = A.tutorial(); await tu.start({ index: ${index} }); await T.until(() => !tu.state().busy && tu.state().index === ${index}, 20000, 'step'); await T.sleep(700);`, 30000);
          await shot(app, path.join(dir, `tutorial-${id}.webp`));
          made.push(`${lang}/tutorial-${id}`);
        } catch (error) { console.error(`[docs:images] ${lang} tutorial ${id}: ${error.message}`); process.exitCode = 1; }
      }
      await app.run('if (A.tutorial()?.state().active) await A.tutorial().stop();');
    }
  }
} finally {
  await app.stop();
}
console.log(`[docs:images] ${made.length} pictures in doc/images/{ko,en}/`);
