// Web smoke test: the web build in headless Edge / Chrome.
//   node test/e2e/web.smoke.mjs [distDir]   (no dir: builds into a temporary folder first)
// Every template and sample drawn on the canvas at every device width, every design, every block
// kind inserted, the menus and their commands' state, the popups as frames, the tutorial steps.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './web-harness.mjs';
import { sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let dist = process.argv[2];
let temporary = null;
if (!dist) {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-webtest-'));
  const built = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', temporary, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) process.exit(1);
  dist = temporary;
}

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name.padEnd(52)} ${String(Date.now() - started).padStart(6)} ms`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name.padEnd(52)} ${String(Date.now() - started).padStart(6)} ms\n        ${String(error?.message ?? error).split('\n')[0]}`);
  }
}
const expect = (value, message) => { if (!value) throw new Error(message); };

console.log('MyHomeMaker web smoke');
for (const language of ['ko', 'en']) {
  const { page, close } = await launch(dist, { language, width: 1500, height: 950 });
  const run = (code) => page.eval(code);
  const closePopups = () => run("window.__myhomemaker.popups.closeAll().then(() => { document.querySelectorAll('.web-popup, .web-popup-shield').forEach((el) => el.remove()); window.__myhomemaker.popups.frames.clear(); return 1; })");
  try {
    await run(`localStorage.setItem('myhomemaker.settings.v1', JSON.stringify({ language: '${language}', showWelcome: false })); location.reload(); 1`).catch(() => {});
    await page.waitFor("document.readyState === 'complete' && !!window.__myhomemaker && document.querySelector('#statusbar .status-notice')", { timeout: 20000 });

    await check(`[${language}] start page in the right language`, async () => {
      const lang = await run('document.documentElement.lang');
      expect(lang === language, lang);
      const cards = await run("[...document.querySelectorAll('.start-card')].map((c) => c.dataset.card).join(',')");
      for (const id of ['hero', 'actions', 'recent', 'templates', 'samples', 'theme', 'background']) expect(cards.includes(id), `card ${id} missing: ${cards}`);
    });

    await check(`[${language}] every template draws at every width`, async () => {
      const out = await run(`(async () => {
        const a = window.__myhomemaker; const bad = [];
        for (const [id] of a.domain.TEMPLATES) {
          a.actions.newSite(id);
          await new Promise((r) => setTimeout(r, 60));
          for (const device of ['desktop', 'tablet', 'mobile']) {
            a.actions.setDevice(device);
            const doc = document.querySelector('.site-frame').contentDocument;
            const blocks = doc.querySelectorAll('[data-block-id]').length;
            const wide = doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 2;
            if (!blocks) bad.push(id + ':' + device + ':empty');
            if (wide && device !== 'desktop') bad.push(id + ':' + device + ':wider than the device');
          }
          a.actions.setDevice('desktop');
        }
        return bad.join(' ');
      })()`, 120000);
      expect(!out, out);
    });

    await check(`[${language}] every sample opens and every page draws`, async () => {
      const out = await run(`(async () => {
        const a = window.__myhomemaker; const bad = [];
        for (const sample of a.domain.SAMPLES) {
          a.actions.openSampleBuiltin(sample.id);
          for (const p of a.state.docs[0].site.pages) {
            a.actions.openPage(p.id);
            const doc = document.querySelector('.site-frame').contentDocument;
            if (doc.querySelectorAll('main > [data-block-id]').length !== p.blocks.length) bad.push(sample.id + '/' + p.slug);
            if (doc.body.innerHTML.includes('undefined')) bad.push(sample.id + '/' + p.slug + ':undefined');
          }
        }
        return bad.join(' ');
      })()`, 120000);
      expect(!out, out);
    });

    await check(`[${language}] every block kind inserts, edits and deletes`, async () => {
      const out = await run(`(async () => {
        const a = window.__myhomemaker; a.actions.newSite('blank'); const bad = [];
        for (const type of a.domain.PAGE_BLOCK_TYPES) {
          const b = a.actions.insertBlock(type);
          if (!b) { bad.push(type + ':insert'); continue; }
          const el = document.querySelector('.site-frame').contentDocument.querySelector('[data-block-id="' + b.id + '"]');
          if (!el) bad.push(type + ':draw');
          if (!document.querySelector('#editors [data-prop], #editors .items-field, #editors [data-stepper]')) bad.push(type + ':fields');
          a.actions.deleteBlock(b.id);
        }
        return bad.join(' ') + (a.state.docs[0].page.blocks.length === 1 ? '' : ' leftover blocks');
      })()`, 60000);
      expect(!out.trim(), out);
    });

    await check(`[${language}] every design restyles the canvas`, async () => {
      const out = await run(`(async () => {
        const a = window.__myhomemaker; a.actions.newSite('business'); const seen = new Set(); const bad = [];
        for (const d of a.domain.DESIGNS) {
          a.actions.setDesign({ id: d.id }, { reset: true });
          const doc = document.querySelector('.site-frame').contentDocument;
          const bg = getComputedStyle(doc.body).backgroundColor;
          seen.add(bg);
          const hex = d.bg.toLowerCase(); const rgb = 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
          if (bg !== rgb) bad.push(d.id + ':' + bg);
        }
        return bad.join(' ') + (seen.size < 20 ? ' too few colours' : '');
      })()`, 60000);
      expect(!out.trim(), out);
    });

    await check(`[${language}] every menu lists only known commands`, async () => {
      const out = await run(`(() => {
        const { MENUS, SUBMENUS, enabled } = window.__myhomemaker.menus; const t = window.__myhomemaker.t; const bad = [];
        const items = [...Object.values(MENUS).flat(), ...Object.values(SUBMENUS).flatMap((s) => s.items)];
        for (const id of items) {
          if (id === '-' ) continue;
          if (typeof id === 'object') { if (!SUBMENUS[id.sub]) bad.push('submenu ' + id.sub); continue; }
          const c = window.__myhomemaker.commands[id];
          if (!c) { bad.push('command ' + id); continue; }
          if (t(c.label) === c.label) bad.push('label ' + c.label);
          enabled(id);
        }
        return bad.join(' ');
      })()`);
      expect(!out, out);
    });

    await check(`[${language}] at the minimum width no toolbar button is cut off`, async () => {
      await run("window.__myhomemaker.actions.newSite('business'), 1");
      await sleep(300);
      const min = await run("window.__myhomemaker.state.minWidth || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-width'))");
      expect(min > 900, `minimum width ${min}`);
      await page.send('Emulation.setDeviceMetricsOverride', { width: min, height: 800, deviceScaleFactor: 1, mobile: false });
      await sleep(400);
      const out = await run(`(() => {
        const bar = document.querySelector('#toolbar'); const r = bar.getBoundingClientRect(); const bad = [];
        for (const b of bar.querySelectorAll('.tool-button, .stepper')) { const x = b.getBoundingClientRect(); if (x.width && (x.right > r.right + 0.5 || x.left < r.left - 0.5)) bad.push(b.dataset.command ?? b.className); }
        const menus = [...document.querySelectorAll('#menubar .menubar-item, #menubar .window-controls')].filter((m) => m.getBoundingClientRect().right > window.innerWidth + 0.5).length;
        return bad.join(',') + (menus ? ' menus:' + menus : '') + (document.documentElement.scrollWidth > window.innerWidth + 1 ? ' page scrolls sideways' : '');
      })()`);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
      expect(!out, out);
    });

    for (const [kind, code] of [['menu', "window.__myhomemaker.actions.openMenubarMenu('insert')"], ['settings', "window.__myhomemaker.popups.open('settings', { tab: 'editor' })"], ['design', "window.__myhomemaker.run('designPicker')"], ['template', "window.__myhomemaker.popups.open('template', {})"], ['publish', "window.__myhomemaker.run('publish')"], ['about', "window.__myhomemaker.run('about')"], ['welcome', "window.__myhomemaker.popups.open('welcome', {})"], ['recent', "window.__myhomemaker.popups.open('recent', {})"], ['theme', "window.__myhomemaker.popups.open('theme', {})"]]) {
      await check(`[${language}] popup "${kind}" draws without scrolling`, async () => {
        await closePopups();
        await run(`void ${code}, 1`);
        await page.waitFor(`(() => { const f = document.querySelector('.web-popup-${kind} iframe'); const d = f?.contentDocument; return d && d.querySelector('.popup, .popup-menu') && getComputedStyle(f.parentElement).visibility !== 'hidden'; })()`, { timeout: 10000 });
        await sleep(300);
        const info = await run(`(() => { const d = document.querySelector('.web-popup-${kind} iframe').contentDocument; const body = d.querySelector('.popup-body'); const raw = [...d.body.innerText.matchAll(/\\b[a-z]+\\.[a-z][a-zA-Z]+(?:\\.[a-zA-Z]+)*\\b/g)].map((m) => m[0]).filter((k) => !/\\.(html|css|zip|js|myhome|mhomt|png|com|net|org)$|^(e\\.g|i\\.e)/.test(k)); return { overflow: body ? body.scrollHeight - body.clientHeight : 0, raw: raw.join(' ') }; })()`);
        expect(info.overflow <= 2 || kind === 'settings', `scrolls by ${info.overflow}px`);
        expect(!info.raw, `untranslated: ${info.raw}`);
      });
    }
    await closePopups();

    await check(`[${language}] the tutorial runs every step`, async () => {
      const total = await run('window.__myhomemaker.domain.tutorialSteps()');
      await run('void window.__myhomemaker.actions.startTutorial(), 1');
      for (let i = 0; i < total; i++) {
        await run(`window.__myhomemaker.tutorial().go(${i}).then(() => 1)`, 30000);
        const text = await run("document.querySelector('.tour-card h3')?.textContent + '|' + document.querySelector('.tour-card p')?.textContent");
        expect(!/tutorial\./.test(text), `step ${i}: ${text}`);
      }
      await run('window.__myhomemaker.tutorial().stop().then(() => 1)');
    });

    await check(`[${language}] no script errors`, async () => {
      expect(!page.errors.length, page.errors.join(' | '));
    });
  } finally {
    await close();
  }
}
if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
