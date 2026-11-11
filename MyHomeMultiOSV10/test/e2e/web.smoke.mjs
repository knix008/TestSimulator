// Web tests: the web build in headless Edge / Chrome, every feature, in Korean and English.
//   node test/e2e/web.smoke.mjs [distDir] [--lang ko|en]   (no dir: builds into a temporary folder)
// Sections: start page, templates, samples, blocks, designs, editing, items & pictures, style,
// pages, site & design, view, problems & spelling, files, publishing, menus, every command, popups, settings,
// appearance, tutorial, window. The browser's file and clipboard APIs are replaced by fakes, so
// nothing is written outside the test and no dialog waits for a person.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './web-harness.mjs';
import { sleep } from './cdp.mjs';
import { Report } from '../report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const languages = argv.includes('--lang') ? [argv[argv.indexOf('--lang') + 1]] : ['ko', 'en'];
let dist = argv.find((a) => !a.startsWith('--') && !['ko', 'en'].includes(a));
let temporary = null;
if (!dist) {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-webtest-'));
  const built = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', temporary, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) process.exit(1);
  dist = temporary;
}

const report = new Report('web', 'web', 'the web build in headless Edge — every feature, Korean and English');
const expect = (value, message) => { if (!value) throw new Error(message); };

/** Fakes for the browser APIs that would wait for a person (installed before the app runs). */
const FAKES = `(() => {
  window.__saved = []; window.__opened = []; window.__clip = '';
  window.showSaveFilePicker = async (o) => ({ name: o?.suggestedName ?? 'file', queryPermission: async () => 'granted', createWritable: async () => ({ write: async (c) => { window.__saved.push({ name: o?.suggestedName, data: typeof c === 'string' ? c : c instanceof Blob ? new Uint8Array(await c.arrayBuffer()) : c }); }, close: async () => {} }) });
  window.showOpenFilePicker = async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); };
  window.open = (u) => { window.__opened.push(String(u)); return null; };
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = String(t); }, readText: async () => window.__clip }, configurable: true });
  HTMLInputElement.prototype.click = function () { if (this.type !== 'file') HTMLElement.prototype.click.call(this); };
  window.__MYHOMEMAKER_NO_WELCOME = true;
  return 1;
})()`;

for (const language of languages) {
  const { page, close } = await launch(dist, { language, width: 1500, height: 950 });
  const run = (code, timeout) => page.eval(code, timeout);
  const app = (body, timeout) => run(`(async () => { document.activeElement?.blur?.(); const a = window.__myhomemaker; const A = a.actions; const S = a.domain.S; const doc = () => a.state.docs[0]; const frame = () => document.querySelector('.site-frame').contentDocument; ${body} })()`, timeout);
  const closePopups = () => run("window.__myhomemaker.popups.closeAll().then(() => { document.querySelectorAll('.web-popup, .web-popup-shield').forEach((el) => el.remove()); window.__myhomemaker.popups.frames.clear(); return 1; })");
  const popupDoc = (kind) => `document.querySelector('.web-popup-${kind} iframe')?.contentDocument`;
  const waitPopup = (kind) => page.waitFor(`(() => { const d = ${popupDoc(kind)}; return d && d.querySelector('.popup, .popup-menu, .menu-stack .popup-menu') && getComputedStyle(document.querySelector('.web-popup-${kind}')).visibility !== 'hidden'; })()`, { timeout: 10000 })
    .catch(async (error) => { const why = await run(`JSON.stringify({ frame: !!document.querySelector('.web-popup-${kind}'), visibility: document.querySelector('.web-popup-${kind}')?.style.visibility, body: (document.querySelector('.web-popup-${kind} iframe')?.contentDocument?.body?.innerHTML ?? '').slice(0, 80), focus: document.activeElement?.tagName + '#' + (document.activeElement?.id ?? ''), log: (window.__popupLog ?? []).slice(-8) })`).catch(() => ''); throw new Error(`${error.message} ${why}`); });
  /** Records what happens to popup frames, for the message of a popup that never shows. */
  const POPUP_LOG = `(() => { const P = window.__myhomemaker.popups; if (P.__logged) return 1; P.__logged = true; window.__popupLog = []; const log = (text) => { window.__popupLog.push(Math.round(performance.now()) + ' ' + text); if (window.__popupLog.length > 40) window.__popupLog.shift(); }; const fm = P.frameMessage.bind(P); P.frameMessage = (k, t, d) => { log('msg ' + k + ' ' + t); return fm(k, t, d); }; const rf = P.removeFrame.bind(P); P.removeFrame = (k) => { log('remove ' + k + ' ' + (new Error().stack.split('\\n')[2] ?? '').trim()); return rf(k); }; const op = P.openFrame.bind(P); P.openFrame = (k, a) => { log('open ' + k); return op(k, a); }; const st = P.settle.bind(P); P.settle = (k, v) => { if (P.pending.has(k)) log('settle ' + k + ' ' + JSON.stringify(v)); return st(k, v); }; return 1; })()`;
  const fresh = async (template = 'business') => { await closePopups(); await app(`if (a.state.preview) A.togglePreview(); A.newSite('${template}'); await new Promise((r) => setTimeout(r, 80)); return 1;`); };
  const errorsSoFar = () => page.errors.splice(0);
  const tag = (name) => `[${language}] ${name}`;
  try {
    // The old page must not answer for the new one: it is marked, and the wait is for an unmarked page.
    await run(`window.__beforeReload = true; localStorage.clear(); localStorage.setItem('myhomemaker.settings.v1', JSON.stringify({ language: '${language}', showWelcome: false, animationRandom: false })); location.reload(); 1`).catch(() => {});
    await page.waitFor("!window.__beforeReload && document.readyState === 'complete' && !!window.__myhomemaker && document.querySelector('#statusbar .status-notice')", { timeout: 20000 });
    await run(FAKES);
    await run(POPUP_LOG);

    // ── start page
    report.group('start page');
    await report.check(tag('start page shows every card in the right language'), async () => {
      expect(await run('document.documentElement.lang') === language, 'language');
      const cards = await run("[...document.querySelectorAll('.start-card')].map((c) => c.dataset.card).join(',')");
      for (const id of ['hero', 'actions', 'recent', 'templates', 'samples', 'background']) expect(cards.includes(id), `card ${id}: ${cards}`);
      expect(!cards.includes('theme'), 'the app theme card is not on the start page');
    });
    for (const [action, effect] of [
      ['language', `a.settings ? 1 : 1`], ['animation', 'a.state.settings.animation === "waves"'],
      ['shuffle', 'a.state.settings.backgroundKind === "animated"'], ['arrange', '!a.state.settings.startLayout || typeof a.state.settings.startLayout === "object"'],
      ['help-menu', '!!document.querySelector(".web-popup-menu")'], ['start-settings', '!!document.querySelector(".web-popup-settings")'],
      ['about', '!!document.querySelector(".web-popup-about")'], ['code-editor', 'window.__opened.some((u) => u.includes("viewer=code"))'], ['guide', 'window.__opened.some((u) => u.includes("viewer=guide"))'], ['tutorial-doc', 'window.__opened.some((u) => u.includes("viewer=tutorial"))'],
    ]) {
      await report.check(tag(`start page action "${action}"`), async () => {
        await closePopups();
        const value = { 'pick-theme': 'midnight', animation: 'waves' }[action] ?? '';
        await app(`A.showStartPage(true); const el = [...document.querySelectorAll('[data-start="${action}"]')].find((x) => !'${value}' || x.dataset.value === '${value}'); if (!el) throw new Error('no tile'); el.click(); await new Promise((r) => setTimeout(r, 400)); return 1;`);
        expect(await app(`return ${effect};`), 'no effect');
        if (action === 'language') await app(`A.updateSettings({ language: '${language}' }); return 1;`);
      });
    }
    await closePopups();
    await report.check(tag('start page template tile starts that template'), async () => {
      await app("A.showStartPage(true); document.querySelector('[data-start=\"template\"][data-value=\"portfolio\"]').click(); await new Promise((r) => setTimeout(r, 300)); return 1;");
      expect(await app('return doc().site.pages.length === 3 && !a.state.showStart;'), 'portfolio not open');
    });
    await report.check(tag('start page sample tile opens that sample'), async () => {
      await app("A.showStartPage(true); document.querySelector('[data-start=\"sample\"][data-value=\"flower\"]').click(); await new Promise((r) => setTimeout(r, 300)); return 1;");
      expect(await app("return doc().site.design.id === 'rose';"), 'flower sample not open');
    });
    await report.check(tag('start page "show at start" switch'), async () => {
      await app("A.showStartPage(true); const box = document.querySelector('[data-start-toggle]'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); return 1;");
      expect(await app('return a.state.settings.showStartPage === false;'), 'not saved');
      await app('A.updateSettings({ showStartPage: true }); A.showStartPage(false); return 1;');
    });

    // ── templates and samples
    report.group('templates');
    for (const id of await app('return a.domain.TEMPLATES.map(([id]) => id);')) {
      await report.check(tag(`template "${id}" draws at every device width`), async () => {
        const out = await app(`A.newSite('${id}'); const bad = []; for (const device of ['desktop', 'tablet', 'mobile']) { A.setDevice(device); const d = frame(); if (!d.querySelectorAll('[data-block-id]').length) bad.push(device + ' empty'); if (device !== 'desktop' && d.documentElement.scrollWidth > d.documentElement.clientWidth + 2) bad.push(device + ' too wide'); } A.setDevice('desktop'); return bad.join(', ');`);
        expect(!out, out);
      });
    }
    report.group('samples');
    for (const id of await app('return a.domain.SAMPLES.map((s) => s.id);')) {
      await report.check(tag(`sample "${id}" opens with every page`), async () => {
        const out = await app(`A.openSampleBuiltin('${id}'); const bad = []; for (const p of doc().site.pages) { A.openPage(p.id); const d = frame(); if (d.querySelectorAll('main > [data-block-id]').length !== p.blocks.length) bad.push(p.slug); if (d.body.innerHTML.includes('undefined')) bad.push(p.slug + ' undefined'); } return bad.join(', ');`);
        expect(!out, out);
      });
    }

    // ── every block kind
    report.group('blocks');
    await fresh('blank');
    for (const type of await app('return a.domain.PAGE_BLOCK_TYPES;')) {
      await report.check(tag(`block "${type}" inserts, shows its fields, deletes`), async () => {
        const out = await app(`const b = A.insertBlock('${type}'); if (!b) return 'insert'; const el = frame().querySelector('[data-block-id="' + b.id + '"]'); const bad = []; if (!el) bad.push('draw'); if (a.state.selected !== b.id) bad.push('select'); if (!document.querySelector('#editors [data-prop], #editors .items-field, #editors [data-stepper]')) bad.push('fields'); A.deleteBlock(b.id); if (frame().querySelector('[data-block-id="' + b.id + '"]')) bad.push('delete'); return bad.join(',');`);
        expect(!out, out);
      });
    }

    // ── designs
    report.group('designs');
    await fresh('business');
    for (const id of await app('return a.domain.DESIGNS.map((d) => d.id);')) {
      await report.check(tag(`design "${id}" restyles the canvas`), async () => {
        const out = await app(`A.setDesign({ id: '${id}' }, { reset: true }); const d = a.domain.DESIGNS.find((x) => x.id === '${id}'); const bg = getComputedStyle(frame().body).backgroundColor; const rgb = 'rgb(' + [1, 3, 5].map((i) => parseInt(d.bg.slice(i, i + 2), 16)).join(', ') + ')'; const primary = getComputedStyle(frame().documentElement).getPropertyValue('--primary').trim(); return bg === rgb && primary === d.primary ? '' : bg + ' ' + primary;`);
        expect(!out, out);
      });
    }

    // ── editing on the canvas
    report.group('editing');
    await fresh('business');
    await report.check(tag('a click on a block selects it, the hover shows its name'), async () => {
      const at = await app("const el = frame().querySelector('[data-block-type=\"features\"]'); el.scrollIntoView({ block: 'center' }); const fr = document.querySelector('.site-frame').getBoundingClientRect(); const z = fr.width / document.querySelector('.site-frame').offsetWidth; const r = el.getBoundingClientRect(); return { x: fr.left + (r.left + 30) * z, y: fr.top + (r.top + 30) * z };");
      await page.mouse('mouseMoved', at.x, at.y, { button: 'none' });
      await sleep(150);
      await page.realClick(at.x, at.y);
      await sleep(200);
      expect(await app("return doc().site.pages[0].blocks.find((b) => b.id === a.state.selected)?.type === 'features' && !document.querySelector('.sel-bar').hidden;"), 'not selected');
    });
    await report.check(tag('typing on the canvas edits the text (Enter keeps, Esc cancels)'), async () => {
      await app("const el = frame().querySelector('[data-block-type=\"features\"] [data-edit=\"title\"]'); a.api.view.startEdit(el); return 1;");
      await page.send('Input.insertText', { text: 'Typed title' });
      await page.key('Enter');
      expect(await app("return doc().page.blocks.find((b) => b.type === 'features').props.title === 'Typed title';"), 'Enter did not keep');
      await app("a.api.view.startEdit(frame().querySelector('[data-block-type=\"features\"] [data-edit=\"title\"]')); return 1;");
      await page.send('Input.insertText', { text: 'Thrown away' });
      await page.key('Escape');
      expect(await app("return doc().page.blocks.find((b) => b.type === 'features').props.title === 'Typed title';"), 'Esc did not cancel');
    });
    await report.check(tag('a double click on formatted text opens its field'), async () => {
      await app("const b = A.insertBlock('text'); const el = frame().querySelector('[data-block-id=\"' + b.id + '\"] [data-edit-field]'); el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); await new Promise((r) => setTimeout(r, 200)); return 1;");
      expect(await run("document.activeElement?.dataset?.prop === 'body'"), 'field not focused');
    });
    await report.check(tag('a field of the Content tab changes the block'), async () => {
      await app("const b = doc().page.blocks.find((x) => x.type === 'heroSplit'); A.select(b.id); a.state.rightTab = 'content'; a.api.renderRight(); const input = document.querySelector('#editors [data-prop=\"button1\"]'); input.value = 'Call now'; input.dispatchEvent(new Event('change', { bubbles: true })); return 1;");
      expect(await app("return frame().querySelector('[data-block-type=\"heroSplit\"] .hm-btn').textContent === 'Call now';"), 'not drawn');
    });
    for (const [name, code, check] of [
      ['move a block up and down', "const id = doc().page.blocks[2].id; A.select(id); A.moveBlock(-1, id); const up = doc().page.blocks[1].id === id; A.moveBlock(1, id); return up && doc().page.blocks[2].id === id;", null],
      ['duplicate a block', "const n = doc().page.blocks.length; A.duplicateBlock(doc().page.blocks[1].id); return doc().page.blocks.length === n + 1 && doc().page.blocks[1].type === doc().page.blocks[2].type;", null],
      ['delete a block', "const n = doc().page.blocks.length; A.deleteBlock(doc().page.blocks[2].id); return doc().page.blocks.length === n - 1;", null],
      ['undo and redo', "const n = doc().page.blocks.length; A.insertBlock('quote'); A.undo(); const undone = doc().page.blocks.length === n; A.redo(); return undone && doc().page.blocks.length === n + 1;", null],
      ['hide a block: faded on the canvas, left out when published', "const b = doc().page.blocks[1]; A.toggleHidden(b.id); const faded = frame().querySelector('[data-block-id=\"' + b.id + '\"]').classList.contains('hm-hidden'); const html = a.domain.siteFiles(doc().site).find((f) => f.path === 'index.html').data; A.toggleHidden(b.id); return faded && !html.includes('hm-' + b.type + ' ');", null],
      ['copy and paste a block', "A.select(doc().page.blocks[1].id); await A.copyBlock(); const n = doc().page.blocks.length; await A.pasteBlocks(); return doc().page.blocks.length === n + 1 && window.__clip.includes('myhomemakerBlocks');", null],
      ['cut a block', "const b = doc().page.blocks.at(-1); A.select(b.id); await A.copyBlock({ cut: true }); return !doc().page.blocks.some((x) => x.id === b.id);", null],
      ['paste plain text as a Text block', "window.__clip = 'Pasted words'; await A.pasteBlocks(); return doc().page.blocks.some((b) => b.type === 'text' && b.props.body === 'Pasted words');", null],
      ['select the next and previous block (Alt+Down / Alt+Up)', "A.select(doc().page.blocks[0].id); return 1;", 'keys'],
      ['Delete key deletes the selected block, Ctrl+Z brings it back', "A.select(doc().page.blocks[1].id); return doc().page.blocks.length;", 'delete'],
    ]) {
      await report.check(tag(name), async () => {
        if (check === 'keys') {
          await app(code);
          await run("document.querySelector('#statusbar').click(), 1");
          const first = await app('return a.state.selected;');
          await page.key('ArrowDown', 1);
          const second = await app('return a.state.selected;');
          await page.key('ArrowUp', 1);
          expect(first !== second && (await app('return a.state.selected;')) === first, 'Alt+arrows');
          return;
        }
        if (check === 'delete') {
          const n = await app(code);
          await page.key('Delete');
          const after = await app('return doc().page.blocks.length;');
          await page.key('z', 2);
          expect(after === n - 1 && (await app('return doc().page.blocks.length;')) === n, `${n} → ${after}`);
          return;
        }
        expect(await app(code), 'failed');
      });
    }
    await report.check(tag('drag a block from the panel onto the canvas'), async () => {
      await fresh('business');
      await run("document.querySelector('#left-panel .block-item[data-block-type=\"gallery\"]').scrollIntoView({ block: 'center' }), 1");
      const from = await page.center('#left-panel .block-item[data-block-type="gallery"]');
      const to = await app("const fr = document.querySelector('.site-frame'); const r = fr.getBoundingClientRect(); const z = r.width / fr.offsetWidth; const b = frame().querySelectorAll('main > [data-block-id]')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (b.top + 8) * z };");
      await page.drag(from, to, 16);
      await sleep(200);
      expect(await app("return doc().page.blocks[1].type === 'gallery';"), await app("return doc().page.blocks.map((b) => b.type).join(',');"));
    });
    await report.check(tag('drag a block by its name tab'), async () => {
      await fresh('business');
      await app("A.select(doc().page.blocks[1].id); document.querySelector('.canvas-scroll').scrollTop = 0; return 1;");
      await sleep(200);
      const before = await app("return doc().page.blocks[1].type;");
      const from = await page.center('.sel-bar .sel-name');
      const to = await app("const fr = document.querySelector('.site-frame'); const r = fr.getBoundingClientRect(); const z = r.width / fr.offsetWidth; const b = frame().querySelectorAll('main > [data-block-id]')[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (b.top + 6) * z };");
      await page.drag(from, to, 20);
      await sleep(200);
      expect(await app(`return doc().page.blocks[0].type === '${before}';`), 'not moved');
    });
    await report.check(tag('the block tool bar buttons work'), async () => {
      await fresh('business');
      const out = await app("const id = doc().page.blocks[2].id; A.select(id); const bad = []; for (const act of ['up', 'down', 'duplicate', 'hide', 'hide', 'style', 'delete']) { const btn = document.querySelector('.sel-bar [data-block-action=\"' + act + '\"]'); if (!btn) { bad.push(act); continue; } btn.click(); if (act !== 'delete' && act !== 'duplicate' && a.state.selected !== id) A.select(id); } return bad.join(',') + (a.state.rightTab === 'style' ? '' : ' style tab');");
      expect(!out.trim(), out);
    });

    // ── item lists and pictures
    report.group('items & pictures');
    await fresh('business');
    for (const [name, code] of [
      ['add an item', "A.itemAction('add', b.id, 'items'); return b2().props.items.length === n + 1;"],
      ['duplicate an item', "A.itemAction('copy', b.id, 'items:0'); return b2().props.items.length === n + 1 && b2().props.items[1].title === b2().props.items[0].title;"],
      ['move an item down', "const first = b2().props.items[0].title; A.itemAction('move', b.id, 'items:0:1'); return b2().props.items[1].title === first;"],
      ['delete an item', "A.itemAction('delete', b.id, 'items:0'); return b2().props.items.length === n - 1;"],
      ['fold an item card', "A.select(b.id); a.state.rightTab = 'content'; a.api.renderRight(); document.querySelector('[data-item-toggle]').click(); return !!document.querySelector('.item-card.collapsed');"],
      ['the item buttons of the Content tab', "A.select(b.id); a.state.rightTab = 'content'; a.api.renderRight(); document.querySelector('[data-item-add]').click(); return b2().props.items.length === n + 1;"],
      ['a built-in picture', "const s = doc().page.blocks.find((x) => x.type === 'heroSplit'); A.setProp(s.id, 'image', '', 'image'); A.select(s.id); a.state.rightTab = 'content'; a.api.renderRight(); document.querySelector('[data-image-art=\"image\"]').click(); await new Promise((r) => setTimeout(r, 900)); const menu = document.querySelector('.web-popup-menu iframe')?.contentDocument; menu.querySelector('.menu-item[data-id=\"custom:art:city\"]').click(); await new Promise((r) => setTimeout(r, 500)); return doc().page.blocks.find((x) => x.id === s.id).props.image.startsWith('data:image/svg');"],
      ['remove a picture', "const s = doc().page.blocks.find((x) => x.type === 'heroSplit'); A.select(s.id); a.state.rightTab = 'content'; a.api.renderRight(); document.querySelector('[data-image-clear=\"image\"]').click(); return doc().page.blocks.find((x) => x.id === s.id).props.image === '' && !!frame().querySelector('.hm-img-empty');"],
      ['a picture address', "const s = doc().page.blocks.find((x) => x.type === 'heroSplit'); A.setProp(s.id, 'image', 'https://example.com/a.png', 'url'); return frame().querySelector('[data-block-type=\"heroSplit\"] img').getAttribute('src') === 'https://example.com/a.png';"],
      ['a dropped picture file goes into the selected block', "const s = doc().page.blocks.find((x) => x.type === 'heroSplit'); A.select(s.id); const c = document.createElement('canvas'); c.width = 8; c.height = 8; c.getContext('2d').fillRect(0, 0, 8, 8); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const file = new File([blob], 'p.png', { type: 'image/png' }); await A.handleDroppedFiles([file]); return doc().page.blocks.find((x) => x.id === s.id).props.image.startsWith('data:image/png');"],
    ]) {
      await report.check(tag(name), async () => {
        expect(await app(`const b = doc().page.blocks.find((x) => x.type === 'features'); const b2 = () => doc().page.blocks.find((x) => x.id === b.id); const n = b.props.items.length; ${code}`), 'failed');
        await closePopups();
      });
    }

    // ── style
    report.group('style');
    await fresh('business');
    for (const [key, value, css] of [['bg', 'primary', 'tone-primary'], ['bg', 'surface', 'tone-surface'], ['bg', 'dark', 'tone-dark'], ['bg', 'accent', 'tone-accent'], ['bg', 'footer', 'tone-footer'], ['bgColor', '#123456', 'background-color:#123456'], ['color', '#abcdef', 'color:#abcdef'], ['padTop', 200, '--pt:200px'], ['padBottom', 8, '--pb:8px'], ['align', 'right', 'align-right'], ['width', 'narrow', 'w-narrow'], ['anchor', 'here', 'id="here"'], ['radius', true, 'hm-round-block'], ['hideMobile', true, 'hm-hide-mobile'], ['bgImage', 'https://example.com/b.jpg', 'url(&quot;https://example.com/b.jpg&quot;)'], ['overlay', 50, 'rgba(0,0,0,0.5)']]) {
      await report.check(tag(`style "${key}" = ${value}`), async () => {
        const out = await app(`const b = doc().page.blocks.find((x) => x.type === 'stats'); ${key === 'bgColor' ? "A.setStyle(b.id, { bg: 'custom' });" : ''}${key === 'overlay' ? "A.setStyle(b.id, { bgImage: 'https://example.com/b.jpg' });" : ''} A.setStyle(b.id, { ${key}: ${JSON.stringify(value)} }); const el = frame().querySelector('[data-block-id="' + b.id + '"]'); return el.outerHTML.includes(${JSON.stringify(css)}) ? '' : el.outerHTML.slice(0, 300);`);
        expect(!out, out);
      });
    }
    await report.check(tag('reset style'), async () => {
      expect(await app("const b = doc().page.blocks.find((x) => x.type === 'stats'); A.select(b.id); a.state.rightTab = 'style'; a.api.renderRight(); document.querySelector('[data-style-reset]').click(); const s = doc().page.blocks.find((x) => x.id === b.id).style; return s.bg === 'dark' && !s.radius && s.align === 'center';"), 'not reset');
    });
    await report.check(tag('the Style tab controls change the block'), async () => {
      expect(await app("const b = doc().page.blocks.find((x) => x.type === 'stats'); A.select(b.id); a.state.rightTab = 'style'; a.api.renderRight(); document.querySelector('[data-style-set=\"align\"][data-value=\"left\"]').click(); const sel = document.querySelector('[data-style=\"bg\"]'); sel.value = 'surface'; sel.dispatchEvent(new Event('change', { bubbles: true })); const s = doc().page.blocks.find((x) => x.id === b.id).style; return s.align === 'left' && s.bg === 'surface';"), 'controls');
    });

    // ── pages
    report.group('pages');
    await fresh('blank');
    for (const kind of ['blank', 'about', 'services', 'gallery', 'contact', 'pricing', 'blog']) {
      await report.check(tag(`add a page starting with "${kind}"`), async () => {
        await closePopups();
        await app('void a.run("addPage"); return 1;');
        await waitPopup('prompt');
        await run(`(() => { const d = ${popupDoc('prompt')}; const input = d.querySelector('[data-draft="value"]'); input.value = 'P ${kind}'; input.dispatchEvent(new Event('input', { bubbles: true })); d.querySelector('[data-draft-segment="choice"][data-value="${kind}"]').click(); return 1; })()`);
        await sleep(150);
        await run(`${popupDoc('prompt')}.querySelector('[data-action="prompt-apply"]').click(), 1`);
        await page.waitFor(`window.__myhomemaker.state.docs[0].page.name === 'P ${kind}'`, { timeout: 5000 });
        expect(await app('return doc().page.blocks.length > 0 && frame().querySelector("[data-block-id]") !== null && document.querySelectorAll("#tabs [data-page-tab]").length === doc().site.pages.length;'), 'page not drawn');
      });
    }
    for (const [name, code] of [
      ['page tabs switch the canvas', "const p = doc().site.pages[2]; document.querySelector('[data-page-tab=\"' + p.id + '\"]').click(); return doc().page.id === p.id;"],
      ['next and previous page (Ctrl+PageDown / PageUp)', "const i = doc().site.pages.indexOf(doc().page); a.run('nextPage'); const next = doc().site.pages.indexOf(doc().page) === (i + 1) % doc().site.pages.length; a.run('prevPage'); return next && doc().site.pages.indexOf(doc().page) === i;"],
      ['the menu lists the pages', "return frame().querySelectorAll('.hm-links a:not(.hm-btn)').length === doc().site.pages.length;"],
      ['rename a page and change its file name', "A.setPageField('name', 'Renamed'); A.setPageField('slug', 'my-page'); return doc().page.name === 'Renamed' && doc().page.slug === 'my-page' && a.domain.siteFiles(doc().site).some((f) => f.path === 'my-page.html');"],
      ['hide a page from the menu', "A.setPageField('nav', false); const hidden = ![...frame().querySelectorAll('.hm-links a')].some((x) => x.textContent === 'Renamed'); A.setPageField('nav', true); return hidden;"],
      ['browser title and description of a page', "A.setPageField('title', 'T1'); A.setPageField('description', 'D1'); const html = a.domain.siteFiles(doc().site).find((f) => f.path === doc().page.slug + '.html').data; return html.includes('<title>T1</title>') && html.includes('content=\"D1\"');"],
      ['duplicate a page', "const n = doc().site.pages.length; A.duplicatePage(); return doc().site.pages.length === n + 1;"],
      ['move a page left and right', "const id = doc().page.id; const i = doc().site.pages.findIndex((p) => p.id === id); A.movePage(-1); const left = doc().site.pages.findIndex((p) => p.id === id) === i - 1; A.movePage(1); return left && doc().site.pages.findIndex((p) => p.id === id) === i;"],
      ['the first page is always index.html', "A.openPage(doc().site.pages[1].id); A.movePage(-1); return doc().site.pages[0].slug === 'index' && doc().site.pages.filter((p) => p.slug === 'index').length === 1;"],
      ['Ctrl+click on a menu link opens that page', "const link = frame().querySelectorAll('.hm-links [data-page-link]')[1]; link.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); return doc().page.id === link.dataset.pageLink;"],
    ]) {
      await report.check(tag(name), async () => { expect(await app(code), 'failed'); });
    }
    await report.check(tag('delete a page (asks first)'), async () => {
      const n = await app('return doc().site.pages.length;');
      await app('void A.deletePage(); return 1;');
      await waitPopup('confirm');
      await run(`${popupDoc('confirm')}.querySelector('[data-value="delete"]').click(), 1`);
      await page.waitFor(`window.__myhomemaker.state.docs[0].site.pages.length === ${n - 1}`, { timeout: 5000 });
    });
    await report.check(tag('rename a page from its tab (double click)'), async () => {
      await closePopups();
      await app("const tab = document.querySelector('#tabs .tab.active'); tab.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); return 1;");
      await waitPopup('prompt');
      await run(`(() => { const d = ${popupDoc('prompt')}; const i = d.querySelector('[data-draft="value"]'); i.value = 'Tab name'; i.dispatchEvent(new Event('input', { bubbles: true })); d.querySelector('[data-action="prompt-apply"]').click(); return 1; })()`);
      await page.waitFor("window.__myhomemaker.state.docs[0].page.name === 'Tab name'", { timeout: 5000 });
    });

    // ── site & design
    report.group('site & design');
    await fresh('business');
    for (const [name, code] of [
      ['site title and description go into every page', "A.setSiteField('title', 'Site T'); A.setSiteField('description', 'Site D'); A.setSiteField('keywords', 'k1, k2'); A.setSiteField('author', 'Me'); const html = a.domain.siteFiles(doc().site).find((f) => f.path === 'index.html').data; return html.includes('<title>Site T</title>') && html.includes('Site D') && html.includes('k1, k2') && html.includes('content=\"Me\"');"],
      ['site language', "A.setSiteField('language', 'en'); const html = a.domain.siteFiles(doc().site)[0].data; const ok = html.includes('<html lang=\"en\">'); A.setSiteField('language', 'ko'); return ok && a.domain.siteFiles(doc().site)[0].data.includes('<html lang=\"ko\">');"],
      ['site icon', "A.setProp('@site', '@site.favicon', 'https://example.com/i.png', 'url'); return a.domain.siteFiles(doc().site)[0].data.includes('<link rel=\"icon\" href=\"https://example.com/i.png\"');"],
      ['each design colour can be changed and cleared', "const bad = []; for (const key of ['primary', 'accent', 'bg', 'surface', 'text', 'headerBg', 'footerBg']) { A.setDesign({ [key]: '#010203' }); if (doc().site.design.overrides[key] !== '#010203') bad.push(key); A.setDesign({ [key]: null }); if (key in doc().site.design.overrides) bad.push(key + ' clear'); } return bad.length === 0;"],
      ['heading and body fonts', "A.setDesign({ headingFont: 'serif', bodyFont: 'mono' }); const css = getComputedStyle(frame().documentElement); const ok = css.getPropertyValue('--font-heading').includes('Serif') && css.getPropertyValue('--font-body').includes('Consolas'); return ok;"],
      ['corners, content width, text size', "A.setDesign({ radius: 20, width: 900, baseSize: 19 }); const css = getComputedStyle(frame().documentElement); return css.getPropertyValue('--radius').trim() === '20px' && css.getPropertyValue('--width').trim() === '900px' && css.getPropertyValue('--base').trim() === '19px';"],
      ['clear design changes', "a.run('resetDesign'); return Object.keys(doc().site.design.overrides).length === 0;"],
      ['random design', "const before = doc().site.design.id; A.randomDesign(); return doc().site.design.id !== before;"],
      ['the Site tab controls change the site', "A.select(null); a.state.rightTab = 'site'; a.api.renderRight(); const input = document.querySelector('[data-site-field=\"title\"]'); input.value = 'From tab'; input.dispatchEvent(new Event('change', { bubbles: true })); const color = document.querySelector('[data-design=\"primary\"]'); color.value = '#ff0000'; color.dispatchEvent(new Event('change', { bubbles: true })); return doc().site.meta.title === 'From tab' && doc().site.design.overrides.primary === '#ff0000';"],
      ['header: name, button, centred layout, not sticky', "const h = doc().site.layout.header; A.setProp(h.id, 'brand', 'Brand X', 'text'); A.setProp(h.id, 'ctaLabel', 'Go', 'text'); A.setProp(h.id, 'layout', 'center', 'select'); A.setProp(h.id, 'sticky', false, 'toggle'); const el = frame().querySelector('.hm-navbar'); return el.textContent.includes('Brand X') && el.textContent.includes('Go') && el.classList.contains('hm-nav-center') && !el.classList.contains('hm-sticky');"],
      ['footer: copyright and links', "const f = doc().site.layout.footer; const n = f.props.items.length; A.setProp(f.id, 'copyright', '(c) X', 'text'); A.itemAction('add', f.id, 'items'); const el = frame().querySelector('.hm-footer'); return el.textContent.includes('(c) X') && el.querySelectorAll('.hm-social a').length === n + 1;"],
    ]) {
      await report.check(tag(name), async () => { expect(await app(code), 'failed'); });
    }
    await report.check(tag('the design window applies a design'), async () => {
      await app('void a.run("designPicker"); return 1;');
      await waitPopup('design');
      await run(`(() => { const d = ${popupDoc('design')}; d.querySelector('[data-action="design-group"][data-value="dark"]').click(); return 1; })()`);
      await sleep(200);
      await run(`(() => { const d = ${popupDoc('design')}; d.querySelector('[data-pick-design="neon"]').click(); d.querySelector('[data-action="design-apply"]').click(); return 1; })()`);
      await page.waitFor("window.__myhomemaker.state.docs[0].site.design.id === 'neon'", { timeout: 5000 });
    });

    // ── view
    report.group('view');
    await fresh('business');
    for (const [name, code] of [
      ['desktop, tablet and phone widths', "const w = []; for (const d of ['tablet', 'mobile', 'desktop']) { A.setDevice(d); w.push(document.querySelector('.site-frame').offsetWidth); } return w.join() === '820,390,1280';"],
      ['the phone width folds the menu', "A.setDevice('mobile'); const shown = getComputedStyle(frame().querySelector('.hm-burger')).display !== 'none'; A.setDevice('desktop'); return shown && getComputedStyle(frame().querySelector('.hm-burger')).display === 'none';"],
      ['zoom in, out, 100 % and fit width', "A.setZoom(100); a.run('zoomIn'); const zin = doc().view.zoom > 100; a.run('zoomOut'); a.run('zoomOut'); const zout = doc().view.zoom < 100; a.run('zoomReset'); const reset = doc().view.zoom === 100; A.fitWidth(); return zin && zout && reset && doc().view.zoom < 100;"],
      ['the zoom box of the toolbar', "const box = document.querySelector('#zoom-value'); box.value = '75'; box.dispatchEvent(new Event('change', { bubbles: true })); return doc().view.zoom === 75;"],
      ['the zoom slider of the status bar', "const s = document.querySelector('#zoom-slider'); s.value = '12'; s.dispatchEvent(new Event('change', { bubbles: true })); return doc().view.zoom === 100;"],
      ['preview mode: no editing marks, menu links switch pages, Esc ends it', "A.togglePreview(); const clean = !frame().querySelector('[data-block-id]') && document.querySelector('.canvas-overlay').hidden; const target = doc().site.pages[1]; frame().querySelector('.hm-links a[href=\"' + target.slug + '.html\"]').click(); const moved = doc().page.id === target.id; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return clean && moved && !a.state.preview;"],
      ['Blocks and Site panels fold and open', "a.run('leftPanel'); a.run('rightPanel'); const folded = !!document.querySelector('#left-panel .panel-rail') && !!document.querySelector('#right-panel .panel-rail'); a.run('leftPanel'); a.run('rightPanel'); return folded && !!document.querySelector('#site-tree');"],
      ['status bar shows and hides', "a.run('statusBar'); const hidden = getComputedStyle(document.querySelector('#statusbar')).display === 'none'; a.run('statusBar'); return hidden;"],
      ['the site tree selects blocks and opens pages', "const p = doc().site.pages[1]; document.querySelector('[data-tree-page=\"' + p.id + '\"]').click(); const opened = doc().page.id === p.id; const row = document.querySelector('[data-tree-block]:not([data-tree-block=\"' + doc().site.layout.header.id + '\"])'); row.click(); return opened && a.state.selected === row.dataset.treeBlock;"],
      ['Blocks panel search and icon-only view', "const box = document.querySelector('#toolbox-search'); box.value = 'gallery'; box.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); const found = document.querySelectorAll('#left-panel .block-item').length; document.querySelector('#toolbox-search').value = ''; document.querySelector('#toolbox-search').dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); document.querySelector('[data-toolbox-compact]').click(); const compact = !!document.querySelector('.block-list.compact'); document.querySelector('[data-toolbox-compact]').click(); return found === 1 && compact;"],
      ['Ctrl+wheel zooms the canvas', "const before = doc().view.zoom; document.querySelector('.canvas-scroll').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })); return doc().view.zoom > before;"],
    ]) {
      await report.check(tag(name), async () => { expect(await app(code), 'failed'); });
    }

    // ── problems & spelling (the bottom panel)
    report.group('problems');
    await fresh('business');
    const typoEn = language === 'ko' ? '홈패이지를 쉽게 만듭니다' : 'Make your websiet in minutes';
    const typoWord = language === 'ko' ? '홈패이지를' : 'websiet';
    const rightWord = language === 'ko' ? '홈페이지를' : 'website';
    const setTypo = `const hero = doc().page.blocks[0]; A.commitText(hero.id, 'title', ${JSON.stringify(typoEn)}); await a.problems.check();`;
    const typoRow = `a.problems.list().find((r) => r.word === ${JSON.stringify(typoWord)})`;
    for (const [name, code] of [
      ['the panel is under the canvas with its counts in the header and the status bar', "await a.problems.check(); const panel = document.querySelector('#bottom-panel'); const c = a.problems.counts(); const head = ['error', 'warning', 'spelling'].map((k) => Number(panel.querySelector('[data-problem-count=\"' + k + '\"] b').textContent)); const status = document.querySelector('#statusbar .problems-status')?.textContent ?? ''; return panel.offsetHeight >= 90 && head.join() === [c.error, c.warning, c.spelling].join() && status.includes(String(c.warning)) ? '' : panel.offsetHeight + ' ' + head + ' ' + status;"],
      ['a fresh template has nothing misspelt', "await a.problems.check(); return a.problems.counts().spelling === 0 ? '' : a.problems.list().filter((r) => r.kind === 'spelling').map((r) => r.word).join(',');"],
      ['the toolbar button folds and opens the panel', "const b = document.querySelector('#toolbar [data-command=\"bottomPanel\"]'); b.click(); const folded = getComputedStyle(document.querySelector('#bottom-panel')).display === 'none' && !a.state.settings.showBottomPanel; document.querySelector('#toolbar [data-command=\"bottomPanel\"]').click(); const open = document.querySelector('#bottom-panel').offsetHeight > 0; return folded && open ? '' : 'folded ' + folded + ' open ' + open;"],
      ['Ctrl+J folds and opens it, the × in its header folds it', "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true })); const folded = !a.state.settings.showBottomPanel; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true })); const open = a.state.settings.showBottomPanel; document.querySelector('#bottom-panel .problems-header [data-command=\"bottomPanel\"]').click(); const closed = !a.state.settings.showBottomPanel; a.run('bottomPanel'); return folded && open && closed && a.state.settings.showBottomPanel ? '' : [folded, open, closed].join();"],
      ['a misspelt word is listed and underlined on the canvas', `${setTypo} const row = ${typoRow}; return row && row.path === 'title' && a.state.view.spellRanges >= 1 && document.querySelector('#bottom-panel .problem-row.spelling') ? '' : JSON.stringify(a.problems.list().map((r) => r.word)) + ' ranges ' + a.state.view.spellRanges;`],
      ['conjugated and particle forms are not flagged', `A.commitText(doc().page.blocks[0].id, 'text', ${JSON.stringify(language === 'ko' ? '새로운 홈페이지를 만들어 보세요. 고마워요! 함께해요, 했습니다, 즐거운 시간을 보냈어요.' : "We're glad you didn't wait: it's ready, isn't it? Our café opens on Monday.")}); await a.problems.check(); const bad = a.problems.list().filter((r) => r.kind === 'spelling' && r.path === 'text').map((r) => r.word); return bad.length ? bad.join(',') : '';`],
      ['a click shows the place on the canvas', `const row = ${typoRow}; document.querySelector('#bottom-panel [data-problem="' + CSS.escape(row.key) + '"] .cell.msg').click(); await new Promise((r) => setTimeout(r, 120)); const shown = a.state.view.shownProblem; return a.state.selected === row.blockId && shown?.found && frame().querySelector('.hm-problem-flash') ? '' : JSON.stringify(shown);`],
      ['a double click goes to the field with the word selected', `const row = ${typoRow}; document.querySelector('#bottom-panel [data-problem="' + CSS.escape(row.key) + '"] .cell.msg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); for (let i = 0; i < 20 && document.activeElement?.dataset?.prop !== 'title'; i++) await new Promise((r) => setTimeout(r, 100)); const f = document.activeElement; return a.state.rightTab === 'content' && f?.dataset.prop === 'title' && f.value.slice(f.selectionStart, f.selectionEnd) === ${JSON.stringify(typoWord)} ? '' : (f?.dataset.prop + ' ' + f?.value?.slice(f.selectionStart, f.selectionEnd));`],
      ['the right word comes first and its button fixes the text (one undo step)', `const row = ${typoRow}; const first = a.problems.suggest(row)[0]; if (first !== ${JSON.stringify(rightWord)}) return 'first ' + first; a.problems.select(row.key); const button = document.querySelector('#bottom-panel [data-problem-replace="' + CSS.escape(row.key) + '"]'); button.click(); await a.problems.check(); const fixed = doc().page.blocks[0].props.title.includes(${JSON.stringify(rightWord)}); A.undo(); return fixed && doc().page.blocks[0].props.title.includes(${JSON.stringify(typoWord)}) ? '' : 'not fixed';`],
      ['Add to dictionary: the word goes away and is kept in my dictionary', `await a.problems.check(); const row = ${typoRow}; document.querySelector('#bottom-panel [data-problem-add="' + CSS.escape(row.key) + '"]').click(); await new Promise((r) => setTimeout(r, 150)); await a.problems.check(); const kept = JSON.parse(localStorage.getItem('myhomemaker.settings.v1')).userWords; const gone = !${typoRow}; A.updateSettings({ userWords: [] }); await a.problems.check(); return gone && kept.includes(${JSON.stringify(typoWord)}) && ${typoRow} ? '' : 'gone ' + gone + ' kept ' + kept;`],
      ['F7 turns spelling off and on', "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7', bubbles: true })); await a.problems.check(); const off = !a.state.settings.spellCheck && a.problems.counts().spelling === 0 && a.state.view.spellRanges === 0; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7', bubbles: true })); await a.problems.check(); return off && a.problems.counts().spelling > 0 ? '' : 'off ' + off;"],
      ['English and Korean words are checked separately', `A.commitText(doc().page.blocks[0].id, 'eyebrow', '홈패이지 websiet'); A.updateSettings({ spellEnglish: false }); await a.problems.check(); const noEn = !a.problems.list().some((r) => r.word === 'websiet') && a.problems.list().some((r) => r.word === '홈패이지'); A.updateSettings({ spellEnglish: true, spellKorean: false }); await a.problems.check(); const noKo = a.problems.list().some((r) => r.word === 'websiet') && !a.problems.list().some((r) => r.word === '홈패이지'); A.updateSettings({ spellKorean: true }); return noEn && noKo ? '' : noEn + ' ' + noKo;`],
      ['filters: errors, warnings, spelling, this page only and the search box', `A.setSiteField('description', ''); const hero = doc().page.blocks[0]; A.setProp(hero.id, 'url1', 'nowhere.html', 'url'); const other = doc().site.pages[1]; A.change('op.edit', (s) => { a.domain.S.findBlock(s, s.pages[1].blocks[0].id).block.props.title = 'Anothr pagge'; }); await a.problems.check(); const panel = document.querySelector('#bottom-panel'); const rows = () => panel.querySelectorAll('.problem-row[data-problem]').length; const counts = {}; for (const k of ['error', 'warning', 'spelling', 'all']) { panel.querySelector('[data-problem-severity="' + k + '"]').click(); counts[k] = rows(); } const c = a.problems.counts(); const sev = counts.error === c.error && counts.warning === c.warning && counts.spelling === c.spelling && counts.all === c.total && c.error >= 1; panel.querySelector('[data-problem-current]').click(); const here = rows(); panel.querySelector('[data-problem-current]').click(); const q = panel.querySelector('#problem-query'); q.value = 'Anothr'; q.dispatchEvent(new Event('input', { bubbles: true })); const found = rows(); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); return sev && here < c.total && found === 1 ? '' : JSON.stringify({ counts, c, here, found });`],
      ['every kind of check points at its field', `await a.problems.check(); const where = (code) => a.problems.list().find((r) => r.code === code); const broken = where('check.brokenLink'); const noDesc = where('check.noDescription'); if (!broken || broken.path !== 'url1' || broken.scope !== 'block') return 'broken ' + JSON.stringify(broken); a.problems.reveal(noDesc, { edit: true }); await new Promise((r) => setTimeout(r, 120)); const siteField = document.activeElement?.dataset.siteField; A.change('op.page', (s) => { s.pages.push({ id: 'p-empty', name: 'Empty', slug: 'empty', title: '', description: '', nav: true, blocks: [] }); }); await a.problems.check(); const empty = where('check.emptyPage'); a.problems.reveal(empty, { edit: true }); await new Promise((r) => setTimeout(r, 120)); const onPage = doc().page.id === 'p-empty' && a.state.rightTab === 'page'; return siteField === 'description' && empty?.pageId === 'p-empty' && onPage ? '' : siteField + ' ' + onPage;`],
      ['header and footer words are listed once, for every page', "const f = doc().site.layout.footer; A.commitText(f.id, 'about', 'Hellow from the footr'); await a.problems.check(); const rows = a.problems.list().filter((r) => r.blockId === f.id); const label = a.problems.where(rows[0] ?? {})[0]; return rows.length === 2 && label === a.t('problems.allPagesFooter') ? '' : rows.length + ' ' + label;"],
      ['right-click: corrections, add and ignore', `const row = ${typoRow} ?? a.problems.list().find((r) => r.kind === 'spelling'); const el = document.querySelector('#bottom-panel [data-problem="' + CSS.escape(row.key) + '"]'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 800 })); return 1;`, 'menu'],
      ['the arrow keys move in the list and Enter goes to the field', "const list = document.querySelector('#bottom-panel .problems-list'); list.focus(); a.problems.selected = null; list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); const first = a.problems.selected; list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); const second = a.problems.selected; list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise((r) => setTimeout(r, 200)); return first && second && first !== second && document.activeElement !== list ? '' : [first, second].join();"],
      ['the status bar count opens the panel', "A.updateSettings({ showBottomPanel: false }); document.querySelector('#statusbar [data-problems-open]').click(); await new Promise((r) => setTimeout(r, 150)); return a.state.settings.showBottomPanel && document.activeElement?.classList.contains('problems-list') ? '' : 'not opened';"],
      ['Tools menu and the panels submenu have the commands', "return ['showProblems', 'spellCheck', 'dictionary'].every((id) => a.menus.MENUS.tools.includes(id)) && a.menus.SUBMENUS.panels.items.includes('bottomPanel') ? '' : 'missing';"],
    ]) {
      if (code === undefined) continue;
      await report.check(tag(name), async () => {
        const out = await app(code);
        if (name.startsWith('right-click')) {
          await waitPopup('menu');
          const items = await run(`[...${popupDoc('menu')}.querySelectorAll('.menu-item')].map((m) => m.dataset.id).join(',')`);
          expect(/custom:replace0/.test(items) && /custom:add/.test(items) && /custom:ignore/.test(items), items);
          await run(`${popupDoc('menu')}.querySelector('.menu-item[data-id="custom:ignore"]').click(), 1`);
          await page.waitFor(`!window.__myhomemaker.problems.list().some((r) => r.word === ${JSON.stringify(typoWord)})`, { timeout: 5000 });
          return;
        }
        expect(out === '' || out === true, String(out));
      });
    }
    await report.check(tag('the splitter changes the height of the panel'), async () => {
      const box = await run("(() => { const r = document.querySelector('[data-split=\"bottom\"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 2, h: window.__myhomemaker.problems.height() }; })()");
      await page.drag({ x: box.x, y: box.y }, { x: box.x, y: box.y - 80 });
      await sleep(200);
      const after = await run('window.__myhomemaker.state.settings.bottomHeight');
      await app('A.updateSettings({ bottomHeight: 170 }); return 1;');
      expect(after >= box.h + 60, `height ${box.h} → ${after}`);
    });
    await report.check(tag('Settings › Dictionary: add, find, remove and clear words'), async () => {
      await closePopups();
      await app("void a.popups.open('settings', { tab: 'dictionary' }); return 1;");
      await waitPopup('settings');
      const d = popupDoc('settings');
      const out = await run(`(async () => {
        const d = () => ${d};
        const wait = () => new Promise((r) => setTimeout(r, 120));
        const add = async (word) => { const input = d().querySelector('#dict-word'); input.value = word; input.dispatchEvent(new Event('input', { bubbles: true })); d().querySelector('[data-action="dict-add"]').click(); await wait(); };
        await add('Seoulful'); await add('마이홈'); await add('no good!');
        const invalid = !!d().querySelector('.dict-note.error');
        const words = JSON.parse(localStorage.getItem('myhomemaker.settings.v1')).userWords;
        if (!(words.includes('seoulful') && words.includes('마이홈') && invalid)) return 'add ' + words + ' invalid ' + invalid;
        const find = d().querySelector('#dict-find'); find.value = '마이'; find.dispatchEvent(new Event('input', { bubbles: true })); await wait();
        const filtered = d().querySelectorAll('.dict-word').length;
        find.value = ''; d().querySelector('#dict-find').dispatchEvent(new Event('input', { bubbles: true })); await wait();
        d().querySelector('[data-action="dict-remove"][data-value="마이홈"]').click(); await wait();
        const removed = !JSON.parse(localStorage.getItem('myhomemaker.settings.v1')).userWords.includes('마이홈');
        d().querySelector('[data-action="dict-clear"]').click(); await wait();
        const cleared = JSON.parse(localStorage.getItem('myhomemaker.settings.v1')).userWords.length === 0;
        return filtered === 1 && removed && cleared ? '' : JSON.stringify({ filtered, removed, cleared });
      })()`);
      await closePopups();
      expect(!out, out);
    });
    await report.check(tag('a word added in Settings is no longer a problem'), async () => {
      const out = await app(`A.commitText(doc().page.blocks[0].id, 'eyebrow', 'Seoulful'); await a.problems.check(); const before = a.problems.list().some((r) => r.word === 'Seoulful'); localStorage.setItem('myhomemaker.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('myhomemaker.settings.v1')), userWords: ['seoulful'] })); window.dispatchEvent(new StorageEvent('storage', { key: 'myhomemaker.settings.v1' })); await new Promise((r) => setTimeout(r, 50)); await a.problems.check(); const after = a.problems.list().some((r) => r.word === 'Seoulful'); A.updateSettings({ userWords: [] }); return before && !after ? '' : before + ' ' + after;`);
      expect(!out, out);
    });

    // ── files
    report.group('files');
    await fresh('business');
    await report.check(tag('save a site file and open it again'), async () => {
      const out = await app("await A.saveDoc(doc()); const saved = window.__saved.at(-1); if (!saved || !saved.name.endsWith('.myhome')) return 'not saved'; const json = JSON.parse(saved.data); if (json.format !== 'myhomemaker') return 'format'; await A.closeDoc(doc(), { force: true }); await A.openContent('again.myhome', saved.data); return doc()?.site.pages.length === 4 && !doc().dirty ? '' : 'reopen';");
      expect(!out, out);
    });
    await report.check(tag('the recent list remembers the file'), async () => {
      expect(await app("return a.state.recent.some((r) => r.path === 'again.myhome');"), 'not in recent');
    });
    await report.check(tag('save as template and start from it'), async () => {
      const out = await app("await a.run('saveTemplate'); const t = window.__saved.at(-1); if (!t.name.endsWith('.mhomt')) return t.name; await A.openContent('mine.mhomt', typeof t.data === 'string' ? t.data : new TextDecoder().decode(t.data)); return doc().fromTemplate ? '' : 'not a template';");
      expect(!out, out);
    });
    await report.check(tag('unsaved changes are asked about before another site opens'), async () => {
      await app("A.insertBlock('quote'); void A.openSampleAsk('law'); return 1;");
      await waitPopup('confirm');
      await run(`${popupDoc('confirm')}.querySelector('[data-value="discard"]').click(), 1`);
      await page.waitFor("window.__myhomemaker.state.docs[0].site.design.id === 'classic'", { timeout: 5000 });
    });
    await report.check(tag('a dropped site file opens'), async () => {
      const out = await app("const text = a.domain.S.serializeSite(a.domain.buildTemplate('event', 'en')); await A.handleDroppedFiles([new File([text], 'drop.myhome')]); return doc().site.design.id === 'galaxy';");
      expect(out, 'not opened');
    });
    await report.check(tag('a broken file shows an error window'), async () => {
      await closePopups();
      await app("void A.openContent('bad.myhome', '{nope'); return 1;");
      await waitPopup('error');
      await closePopups();
    });
    await report.check(tag('close the site goes back to the start page'), async () => {
      expect(await app("await A.closeDoc(doc(), { force: true }); return a.state.docs.length === 0 && !document.querySelector('#start-page').hidden;"), 'not closed');
    });

    // ── publishing
    report.group('publishing');
    await fresh('business');
    await report.check(tag('publish as ZIP: every page, the style sheet, the pictures'), async () => {
      const out = await app("await A.publishSite('zip', { extract: true }); const z = window.__saved.at(-1); if (!z || !z.name.endsWith('.zip')) return 'no zip'; const bytes = z.data; const text = new TextDecoder('latin1').decode(bytes); const names = ['index.html', 'about.html', 'services.html', 'contact.html', 'style.css', 'assets/img-']; const miss = names.filter((n) => !text.includes(n)); return bytes[0] === 0x50 && bytes[1] === 0x4b && !miss.length ? '' : 'missing ' + miss.join(',');");
      expect(!out, out);
    });
    await report.check(tag('publish this page only, with its style inside'), async () => {
      const out = await app("await A.publishSite('html'); const f = window.__saved.at(-1); return f.name.endsWith('.html') && f.data instanceof Uint8Array ? new TextDecoder().decode(f.data).includes('<style>:root{--primary') : String(f.data).includes('<style>:root{--primary');");
      expect(out, 'no inline style');
    });
    await report.check(tag('the publish window publishes'), async () => {
      const n = await app('return window.__saved.length;');
      await app('void a.run("publish"); return 1;');
      await waitPopup('publish');
      await run(`(() => { const d = ${popupDoc('publish')}; d.querySelector('[data-draft-segment="format"][data-value="zip"]').click(); return 1; })()`);
      await sleep(150);
      await run(`${popupDoc('publish')}.querySelector('[data-action="publish-apply"]').click(), 1`);
      await page.waitFor(`window.__saved.length === ${n + 1}`, { timeout: 8000 });
    });
    for (const [name, code] of [
      ['pictures as files or inside the pages', "const a1 = a.domain.siteFiles(doc().site, { extractImages: true }); const a2 = a.domain.siteFiles(doc().site, { extractImages: false }); return a1.some((f) => f.path.startsWith('assets/')) && !a2.some((f) => f.path.startsWith('assets/')) && a2[0].data.includes('data:image');"],
      ['published pages carry no editing marks', "return a.domain.siteFiles(doc().site).filter((f) => f.path.endsWith('.html')).every((f) => !/data-edit|data-block-id|contenteditable/.test(f.data));"],
      ['copy this page as HTML', "await a.run('copyPageHtml'); return window.__clip.startsWith('<!doctype html>');"],
      ['preview in the browser (web: the page in a new tab)', "window.__opened = []; await A.previewInBrowser(); return window.__opened.some((u) => u.startsWith('blob:'));"],
    ]) {
      await report.check(tag(name), async () => { expect(await app(code), 'failed'); });
    }
    await report.check(tag('check the site lists what to fix'), async () => {
      await closePopups();
      await app("A.newSite('blank'); doc().site.meta.description = ''; void A.checkSite(); return 1;");
      await waitPopup('confirm');
      const text = await run(`${popupDoc('confirm')}.body.innerText`);
      expect(/description|설명/.test(text), text.slice(0, 120));
      await closePopups();
    });
    await report.check(tag('site statistics'), async () => {
      await app('void a.run("siteStats"); return 1;');
      await waitPopup('confirm');
      await closePopups();
    });

    // ── menus
    report.group('menus');
    await fresh('business');
    for (const name of await app('return Object.keys(a.menus.MENUS);')) {
      await report.check(tag(`menu "${name}" opens with every item`), async () => {
        await closePopups();
        await app(`A.openMenubarMenu('${name}'); return 1;`);
        await waitPopup('menu');
        const out = await run(`(() => { const d = ${popupDoc('menu')}; const items = d.querySelectorAll('.popup-menu[data-level="0"] .menu-item').length; const expected = window.__myhomemaker.menus.MENUS['${name}'].filter((x) => x !== '-').length; const untranslated = [...d.querySelectorAll('.menu-label')].filter((l) => /^[a-z]+\\.[a-zA-Z.:]+$/.test(l.textContent)).map((l) => l.textContent); return items === expected && !untranslated.length ? '' : items + '/' + expected + ' ' + untranslated.join(','); })()`);
        expect(!out, out);
      });
    }
    await report.check(tag('a submenu opens beside its row'), async () => {
      await closePopups();
      await app("A.openMenubarMenu('insert'); return 1;");
      await waitPopup('menu');
      await run(`(() => { const d = ${popupDoc('menu')}; d.querySelector('.menu-item.has-sub').click(); return 1; })()`);
      await sleep(300);
      expect(await run(`${popupDoc('menu')}.querySelectorAll('.popup-menu').length === 2`), 'no submenu');
      await closePopups();
    });
    await report.check(tag('context menus: block, canvas, page tab, start page'), async () => {
      for (const kind of ['block', 'canvas', 'page', 'start', 'status', 'panel']) {
        await closePopups();
        await app(`const id = '${kind}' === 'page' ? doc().page.id : doc().page.blocks[1].id; A.contextMenu({ clientX: 300, clientY: 300 }, '${kind}', { id }); return 1;`);
        await waitPopup('menu');
      }
      await closePopups();
    });

    // ── every command
    report.group('commands');
    const ids = await app('return Object.keys(a.commands);');
    for (const id of ids) {
      if (id === 'exit') continue;
      await report.check(tag(`command "${id}" runs`), async () => {
        await closePopups();
        await app(`if (a.state.sourceMode) a.run('sourceMode'); if (a.state.preview) A.togglePreview(); if (!doc() || a.state.showStart) A.newSite('business'); if (a.tutorial()?.active) await a.tutorial().stop(); const p = doc().page; if (!a.state.selected) A.select(p.blocks[1].id); window.__before = JSON.stringify(a.state.settings); return 1;`);
        errorsSoFar();
        const enabled = await app(`return a.menus.enabled('${id}');`);
        await app(`void a.run('${id}', { anchor: { x: 200, y: 200 } }); await new Promise((r) => setTimeout(r, 250)); return 1;`);
        const problems = errorsSoFar();
        const notice = await run("document.querySelector('#statusbar .status-notice')?.className ?? ''");
        await app("if (a.tutorial()?.active) await a.tutorial().stop(); if (a.state.preview) A.togglePreview(); const before = JSON.parse(window.__before); a.state.settings.language !== before.language || a.state.settings.showLeftPanel !== before.showLeftPanel || a.state.settings.showRightPanel !== before.showRightPanel || a.state.settings.showStatusBar !== before.showStatusBar || a.state.settings.showBottomPanel !== before.showBottomPanel || a.state.settings.spellCheck !== before.spellCheck ? A.updateSettings({ language: before.language, showLeftPanel: before.showLeftPanel, showRightPanel: before.showRightPanel, showStatusBar: before.showStatusBar, showBottomPanel: before.showBottomPanel, spellCheck: before.spellCheck }) : 0; if (a.state.showStart) A.showStartPage(false); return 1;");
        expect(!problems.length, problems.join(' | '));
        expect(!notice.includes('error'), `error notice (${enabled ? 'enabled' : 'disabled'})`);
      });
    }

    // ── popups
    report.group('popups');
    for (const [kind, code] of [['settings', "a.popups.open('settings', { tab: 'general' })"], ['design', "a.run('designPicker')"], ['template', "a.popups.open('template', {})"], ['publish', "a.run('publish')"], ['about', "a.run('about')"], ['welcome', "a.popups.open('welcome', {})"], ['recent', "a.popups.open('recent', {})"], ['theme', "a.popups.open('theme', {})"], ['prompt', "a.popups.open('prompt', { title: 'x', label: 'y', value: 'z' })"], ['confirm', "a.popups.open('confirm', { title: 'x', message: 'y' })"], ['error', "a.popups.open('error', { title: 'x', message: 'y' })"], ['progress', "a.popups.open('progress', { title: 'x', name: 'y' })"], ['packages', "a.run('packages')"], ['print', "a.run('print')"]]) {
      await report.check(tag(`popup "${kind}" fits without scrolling, every text translated`), async () => {
        await closePopups();
        await app(`void ${code}; return 1;`);
        await waitPopup(kind);
        await sleep(300);
        const info = await run(`(() => { const d = ${popupDoc(kind)}; const body = d.querySelector('.popup-body'); const raw = [...d.body.innerText.matchAll(/\\b[a-z]+\\.[a-z][a-zA-Z]+(?:\\.[a-zA-Z]+)*\\b/g)].map((m) => m[0]).filter((k) => !/\\.(html|css|zip|js|myhome|mhomt|png|com|net|org)$|^(e\\.g|i\\.e)/.test(k)); return { overflow: body ? body.scrollHeight - body.clientHeight : 0, raw: raw.join(' ') }; })()`);
        expect(info.overflow <= 2, `scrolls by ${info.overflow}px`);
        expect(!info.raw, `untranslated: ${info.raw}`);
      });
    }
    await report.check(tag('the new site window creates a site and a sample'), async () => {
      await closePopups();
      await app("A.newSite('blank'); doc().markSaved(null); void a.run('new'); return 1;");
      await waitPopup('template');
      await run(`(() => { const d = ${popupDoc('template')}; d.querySelector('[data-pick-template="resume"]').click(); return 1; })()`);
      await sleep(200);
      await run(`(() => { const d = ${popupDoc('template')}; const i = d.querySelector('[data-draft="name"]'); i.value = 'Named'; i.dispatchEvent(new Event('input', { bubbles: true })); d.querySelector('[data-action="template-create"]').click(); return 1; })()`);
      await page.waitFor("window.__myhomemaker.state.docs[0].site.name === 'Named' && window.__myhomemaker.state.docs[0].site.design.id === 'slate'", { timeout: 5000 });
      await app("doc().markSaved(null); void a.run('new'); return 1;");
      await waitPopup('template');
      await run(`(() => { const d = ${popupDoc('template')}; d.querySelector('[data-action="template-group"][data-value="people"]').click(); return 1; })()`);
      await sleep(200);
      await run(`(() => { const d = ${popupDoc('template')}; d.querySelector('[data-pick-sample="wedding"]').click(); return 1; })()`);
      await sleep(200);
      await run(`${popupDoc('template')}.querySelector('[data-action="template-create"]').click(), 1`);
      await page.waitFor("window.__myhomemaker.state.docs[0].site.design.id === 'wedding'", { timeout: 5000 });
    });

    // ── settings
    report.group('settings');
    for (const tab of ['general', 'start', 'appearance', 'font', 'background', 'editor', 'recent', 'packages', 'shortcuts']) {
      await report.check(tag(`settings tab "${tab}"`), async () => {
        await closePopups();
        await app(`void a.popups.open('settings', { tab: '${tab}' }); return 1;`);
        await waitPopup('settings');
        expect(await run(`!!${popupDoc('settings')}.querySelector('.settings-${tab}')`), 'tab not drawn');
      });
    }
    await report.check(tag('Settings › Packages downloads and installs the packages that are missing'), async () => {
      await closePopups();
      await app("window.__pkgAsked = []; a.popups.on('package-install', (d) => window.__pkgAsked.push(d)); localStorage.setItem('myhomemaker.packages.v1', JSON.stringify({ jshint: { phase: 'done', installed: '2.13.6' }, htmlhint: { phase: 'download', received: 1, total: 10, installed: null } })); void a.popups.open('settings', { tab: 'packages' }); return 1;");
      await waitPopup('settings');
      await page.waitFor('window.__pkgAsked.length > 0', { timeout: 5000 });
      const asked = await app("const first = window.__pkgAsked[0]; a.popups.on('package-install', (d) => a.installPackages(d.ids ?? [], { quiet: !!d.auto })); localStorage.removeItem('myhomemaker.packages.v1'); return first;");
      expect(asked.auto === true && asked.ids.length === 1 && asked.ids[0] === 'prettier', JSON.stringify(asked));
    });
    for (const [name, code, check] of [
      ['a switch in Settings changes the app', "d.querySelector('[data-toggle=\"statusClock\"]').click();", 'a.state.settings.statusClock === false'],
      ['the editor tab sets the default device', "d.querySelector('[data-setting=\"defaultDevice\"][data-value=\"tablet\"]').click();", "a.state.settings.defaultDevice === 'tablet'"],
      ['the defaults button resets the settings', "d.querySelector('[data-action=\"reset-settings\"]').click();", "a.state.settings.statusClock === true && a.state.settings.defaultDevice === 'desktop'"],
    ]) {
      await report.check(tag(name), async () => {
        await closePopups();
        await app("void a.popups.open('settings', { tab: 'editor' }); return 1;");
        await waitPopup('settings');
        if (name.includes('switch')) { await run(`(() => { const d = ${popupDoc('settings')}; d.querySelector('[data-action="tab"][data-value="general"]').click(); return 1; })()`); await sleep(150); }
        await run(`(() => { const d = ${popupDoc('settings')}; ${code} return 1; })()`);
        await page.waitFor(`(() => { const a = window.__myhomemaker; return ${check}; })()`, { timeout: 5000 });
      });
    }

    // ── appearance
    report.group('appearance');
    for (const [name, code, check] of [
      ['random program theme', "a.run('theme');", "document.documentElement.style.getPropertyValue('--bg') !== ''"],
      ['the theme list picks a theme', "void a.run('themeMenu'); await new Promise((r) => setTimeout(r, 900)); document.querySelector('.web-popup-theme iframe').contentDocument.querySelector('[data-pick-theme=\"dark\"]').click(); await new Promise((r) => setTimeout(r, 400));", "a.state.settings.theme === 'dark'"],
      ['the language switches the whole window', `a.run('language');`, `document.documentElement.lang === '${language === 'ko' ? 'en' : 'ko'}' && document.querySelector('[data-menu="file"]').textContent.trim() === '${language === 'ko' ? 'File' : '파일'}'`],
      ['the language switches back', `a.run('language');`, `document.documentElement.lang === '${language}'`],
      ['shuffle the moving background', "a.run('shuffleBackground');", "a.state.settings.backgroundKind === 'animated'"],
      ['remove the background', "await a.run('clearBackground');", "a.state.settings.backgroundImage === null"],
      ['window zoom (Ctrl+wheel outside the canvas)', "document.querySelector('#toolbar').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));", 'a.state.settings.zoom === 110'],
    ]) {
      await report.check(tag(name), async () => {
        await closePopups();
        await app(`${code} return 1;`);
        await page.waitFor(`(() => { const a = window.__myhomemaker; return ${check}; })()`, { timeout: 5000 });
      });
    }
    await app("A.updateSettings({ theme: 'light', zoom: 100 }); return 1;");

    // ── window
    report.group('window');
    await report.check(tag('at the minimum width no toolbar button is cut off'), async () => {
      await fresh('business');
      await sleep(300);
      const min = await run('window.__myhomemaker.state.minWidth');
      expect(min > 900, `minimum width ${min}`);
      await page.send('Emulation.setDeviceMetricsOverride', { width: min, height: 800, deviceScaleFactor: 1, mobile: false });
      await sleep(400);
      const out = await run(`(() => { const bar = document.querySelector('#toolbar'); const r = bar.getBoundingClientRect(); const bad = []; for (const b of bar.querySelectorAll('.tool-button, .stepper')) { const x = b.getBoundingClientRect(); if (x.width && (x.right > r.right + 0.5 || x.left < r.left - 0.5)) bad.push(b.dataset.command ?? b.className); } return bad.join(',') + (document.documentElement.scrollWidth > window.innerWidth + 1 ? ' page scrolls sideways' : ''); })()`);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
      expect(!out, out);
    });
    await report.check(tag('every toolbar button has a translated tooltip'), async () => {
      const out = await run("[...document.querySelectorAll('#toolbar [data-command]')].filter((b) => !b.title || /^[a-z]+\\.[a-zA-Z.:]+/.test(b.title)).map((b) => b.dataset.command).join(',')");
      expect(!out, out);
    });

    // ── tutorial
    report.group('tutorial');
    const steps = await run('window.__myhomemaker.domain.tutorialSteps()');
    await app('void A.startTutorial(); return 1;');
    await page.waitFor('window.__myhomemaker.tutorial()?.active', { timeout: 5000 });
    const stepInfo = await run('window.__myhomemaker.tutorial() && Array.from({ length: window.__myhomemaker.domain.tutorialSteps() }, (_, i) => i)');
    const info = await run('window.__myhomemaker.domain.tutorialInfo()');
    let chapter = null;
    for (const i of stepInfo) {
      await report.check(tag(`tutorial step ${String(i + 1).padStart(2)} of ${steps}: ${info.steps[i].id}`), async () => {
        await run(`window.__myhomemaker.tutorial().go(${i}).then(() => 1)`, 30000);
        const text = await run("document.querySelector('.tour-card .tour-chapter')?.textContent + ' — ' + document.querySelector('.tour-card h3')?.textContent + ' | ' + document.querySelector('.tour-card p')?.textContent");
        expect(text && !/tutorial\.|undefined/.test(text), text);
        chapter = text.split(' — ')[0];
        // The part of the window the step is about is there and outlined.
        const step = info.steps[i];
        const outlined = await run(`(() => { const el = document.querySelector(${JSON.stringify(step.target)}); return !!el && !!document.querySelector('.tour-outline'); })()`);
        expect(outlined, `no outline: ${step.target}`);
        // The site is exactly what the steps so far have built (start page steps have none of their own).
        if (!['welcome', 'newSite'].includes(step.id)) {
          const upTo = step.id === 'plan' ? info.steps.length : step.id === 'addPage' ? i : i + 1;
          const [shape, expected] = await run(`(() => { const a = window.__myhomemaker; return [a.domain.siteShape(), a.domain.tutorialShape(${upTo})]; })()`);
          expect(shape === expected, `${step.id}: ${shape} ≠ ${expected}`);
        }
        if (step.id === 'spelling' || step.id === 'seo') {
          const words = await run("window.__myhomemaker.problems.list().map((r) => r.word ?? r.code).join(',')");
          if (step.id === 'spelling') expect(!words.split(',').includes(language === 'ko' ? '함니다' : 'meetting'), `typo still listed: ${words}`);
          else expect(words === '', `the finished site still has problems: ${words}`);
        }
      });
    }
    void chapter;
    await report.check(tag('the tutorial ends and gives back the site, the settings and the dictionary'), async () => {
      await run('window.__myhomemaker.tutorial().stop().then(() => 1)');
      expect(await app("return !a.tutorial().active && !document.querySelector('.tour-card') && a.state.settings.userWords.length === 0 && a.state.settings.showBottomPanel === true;"), 'not given back');
    });

    // ── panels, toolbar, print, packages, the code editor
    report.group('print & code');
    await report.check(tag('the start page shows no side panels; folded panels are thin strips with their names written down'), async () => {
      await closePopups();
      await fresh();
      const start = await app("A.showStartPage(true); await new Promise((r) => setTimeout(r, 50)); const hidden = ['#left-panel', '#right-panel'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none') && [...document.querySelectorAll('.panel-split')].every((s) => getComputedStyle(s).display === 'none'); A.showStartPage(false); return hidden;");
      expect(start, 'side panels on the start page');
      const rails = await app("a.run('leftPanel'); a.run('rightPanel'); await new Promise((r) => setTimeout(r, 50)); const out = [...document.querySelectorAll('.panel-rail')].map((r) => ({ w: r.getBoundingClientRect().width, mode: getComputedStyle(r.querySelector('.rail-name')).writingMode, text: r.textContent.trim() })); a.run('leftPanel'); a.run('rightPanel'); return out;");
      expect(rails.length === 2, 'two rails');
      for (const rail of rails) expect(rail.w <= 30 && rail.mode === 'vertical-rl' && rail.text, `rail ${JSON.stringify(rail)}`);
    });
    await report.check(tag('print sits right of Save, then Preview; icons only, with tips; the toolbar fits 1440 px; tab arrows always shown'), async () => {
      const info = await app("const ids = [...document.querySelectorAll('.toolbar-left .tool-group:first-child [data-command]')].map((b) => b.dataset.command); return { ids, labels: [...document.querySelectorAll('#toolbar .tool-button')].filter((b) => b.textContent.trim()).length, tips: [...document.querySelectorAll('#toolbar .tool-button[data-command]')].every((b) => b.title), design: !!document.querySelector('#toolbar [data-command=\"designPicker\"]'), min: a.state.minWidth, arrows: [...document.querySelectorAll('#tabs .tab-scroll')].filter((b) => getComputedStyle(b.parentElement).display !== 'none').length };");
      expect(info.ids.indexOf('print') === info.ids.indexOf('save') + 1 && info.ids.indexOf('previewBrowser') === info.ids.indexOf('print') + 1, info.ids.join());
      expect(info.labels === 0 && info.tips && !info.design, `toolbar: ${info.labels} labelled buttons, tips ${info.tips}, design button ${info.design}`);
      expect(info.min <= 1440, `toolbar needs ${info.min} px`);
      expect(info.arrows === 2, 'tab arrows hidden');
    });
    await report.check(tag('the print window lays the pages on sheets, follows its settings and prints'), async () => {
      await closePopups();
      await app("void a.run('print'); return 1;");
      await waitPopup('print');
      await page.waitFor(`(() => { const d = ${popupDoc('print')}; return d && d.querySelectorAll('#print-host .print-page').length > 0; })()`, { timeout: 15000 });
      const first = await run(`(() => { const d = ${popupDoc('print')}; const w = d.defaultView; return { sheets: d.querySelectorAll('#print-host .print-page').length, frames: d.querySelectorAll('#print-host iframe').length, header: d.querySelector('.print-header')?.textContent.trim(), number: d.querySelector('#page-number').textContent, width: w.__myhomemakerPopup.printLayout().paper.width }; })()`);
      expect(first.sheets >= 3 && first.frames === first.sheets && first.header && /1/.test(first.number) && first.width === 210, JSON.stringify(first));
      await run(`(() => { const d = ${popupDoc('print')}; d.querySelector('[data-print-segment="orientation"][data-value="landscape"]').click(); d.querySelector('[data-print-range="current"]').click(); d.querySelector('[data-print-range="current"]').dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await sleep(400);
      const second = await run(`(() => { const d = ${popupDoc('print')}; const w = d.defaultView; const l = w.__myhomemakerPopup.printLayout(); return { width: l.paper.width, pages: new Set(l.sheets.map((s) => s.pageId)).size, sheets: d.querySelectorAll('#print-host .print-page').length }; })()`);
      expect(second.width === 297 && second.pages === 1 && second.sheets >= 1, JSON.stringify(second));
      await run(`(() => { const w = ${popupDoc('print')}.defaultView; w.__printed = null; w.__myhomemakerPrintHook = async (layout, job) => { w.__printed = job; }; ${popupDoc('print')}.querySelector('[data-action="print"]').click(); return 1; })()`);
      await page.waitFor(`!!${popupDoc('print')}?.defaultView.__printed`, { timeout: 10000 });
      const job = await run(`${popupDoc('print')}.defaultView.__printed`);
      expect(job.widthMm === 297 && job.heightMm === 210 && job.copies === 1, JSON.stringify(job));
      await run(`(() => { localStorage.removeItem('myhomemaker.print'); return 1; })()`);
    });
    await report.check(tag('Packages: one card per package with its state, and Download / Retry / Cancel ask the main window'), async () => {
      await closePopups();
      await app("a.installPackages = a.installPackages; window.__pkgAsked = []; a.popups.on('package-install', (d) => window.__pkgAsked.push(d.ids)); localStorage.setItem('myhomemaker.packages.v1', JSON.stringify({ jshint: { phase: 'failed', error: 'HTTP 503', installed: null }, htmlhint: { phase: 'download', received: 15000, total: 30565, installed: null } })); void a.run('packages'); return 1;");
      await waitPopup('packages');
      const info = await run(`(() => { const d = ${popupDoc('packages')}; return { cards: d.querySelectorAll('.package-card').length, failed: !!d.querySelector('[data-package="jshint"] .package-error'), retry: d.querySelector('[data-package="jshint"] [data-action="package-install"]')?.textContent.trim(), bar: d.querySelector('[data-package="htmlhint"] .progress-bar')?.getAttribute('aria-valuenow'), cancel: !!d.querySelector('[data-package="htmlhint"] [data-action="package-cancel"]') }; })()`);
      expect(info.cards === 3 && info.failed && info.retry && info.bar === '49' && info.cancel, JSON.stringify(info));
      await run(`${popupDoc('packages')}.querySelector('[data-package="jshint"] [data-action="package-install"]').click(), 1`);
      await page.waitFor('window.__pkgAsked.length > 0', { timeout: 5000 });
      expect(await run("JSON.stringify(window.__pkgAsked[0]) === '[\"jshint\"]'"), 'retry did not ask for jshint');
      await app("a.popups.on('package-install', (d) => a.installPackages(d.ids ?? [])); localStorage.removeItem('myhomemaker.packages.v1'); return 1;");
    });
    await report.check(tag('the code editor opens files, and the site code typed there changes the site (one undo)'), async () => {
      await closePopups();
      await fresh();
      const opened = await app("window.__opened.length = 0; await a.openCodeWindow({ type: 'new', language: 'css' }); const inbox = JSON.parse(localStorage.getItem('myhomemaker.code.inbox')); localStorage.setItem('myhomemaker.code.inbox', '[]'); return { url: window.__opened[0] ?? '', inbox: inbox.at(-1)?.type };");
      expect(/viewer=code/.test(opened.url) && opened.inbox === 'new', JSON.stringify(opened));
      const site = await app("const shared = JSON.parse(localStorage.getItem('myhomemaker.code.site')); localStorage.setItem('myhomemaker.code.outbox', JSON.stringify([{ id: 'x1', type: 'site-code', siteId: doc().site.id, field: 'css', value: '.smoke-test { color: red; }' }])); a.readCodeOutbox(); await new Promise((r) => setTimeout(r, 100)); const applied = doc().site.code.css; const inCanvas = frame().getElementById('hm-site').textContent.includes('.smoke-test'); const shared2 = JSON.parse(localStorage.getItem('myhomemaker.code.site')).code.css; A.undo(); return { same: shared.siteId === doc().site.id, applied, inCanvas, shared2, undone: doc().site.code.css };");
      expect(site.same && site.applied === '.smoke-test { color: red; }' && site.inCanvas && site.shared2 === site.applied && site.undone === '', JSON.stringify(site));
    });
    await report.check(tag('the editor edits the page HTML, style.css and script.js, and undo puts the blocks back'), async () => {
      await closePopups();
      await fresh('blank');
      const opened = await app("a.run('pageHtmlCode'); await new Promise((r) => setTimeout(r, 80)); const tabs = [...document.querySelectorAll('.source-file')].map((b) => b.textContent.trim()); const text = document.querySelector('#source-host .code-input')?.value ?? ''; return { mode: a.state.sourceMode, file: a.state.sourceFile, tabs, hasHtml: text.includes('<!doctype html>'), canvas: !!document.querySelector('.site-frame'), menu: !!document.querySelector('#menubar'), toolbar: !!document.querySelector('#toolbar'), save: (document.querySelector('.source-save')?.textContent ?? '').trim().length > 0 };");
      expect(opened.mode && opened.file === 'page' && opened.tabs.includes('index.html') && opened.tabs.includes('style.css') && opened.tabs.includes('script.js') && opened.hasHtml && opened.canvas && opened.menu && opened.toolbar && opened.save, JSON.stringify(opened));
      const live = await app("const input = document.querySelector('#source-host .code-input'); input.focus(); input.value = '<!doctype html><html><head><link rel=\"stylesheet\" href=\"style.css\" /></head><body><h1 id=\"live\">LIVE</h1></body></html>'; input.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return { source: (doc().site.pages[0].source ?? '').includes('LIVE'), shown: frame().body.textContent.includes('LIVE'), menu: !!document.querySelector('#menubar') };");
      expect(live.source && live.shown && live.menu, JSON.stringify(live));
      expect(await app("document.querySelector('#source-host .code-input').blur(); A.undo(); return doc().site.pages[0].source ?? '';") === '', 'live edit did not undo');
      const edited = await app("a.api.commitSource('page', '<!doctype html><html><head><link rel=\"stylesheet\" href=\"style.css\" /></head><body><h1 class=\"from-file\">FILE</h1></body></html>'); a.api.commitSource('css', 'h1.from-file{color:pink}\\n'); a.api.commitSource('js', 'window.__fromFile = 1\\n'); const site = doc().site; const files = a.domain.siteFiles(site); const heading = frame().querySelector('h1.from-file'); return { html: !!site.pages[0].source?.includes('from-file'), css: site.files.css.includes('pink'), js: site.code.js.includes('__fromFile'), published: files.find((f) => f.path === 'index.html').data.includes('from-file'), sheet: files.find((f) => f.path === 'style.css').data.includes('pink'), script: files.find((f) => f.path === 'script.js').data.includes('__fromFile'), shown: frame().body.textContent.includes('FILE'), color: heading ? getComputedStyle(heading).color : '', gui: !!document.querySelector('#menubar') && !!document.querySelector('.site-frame') };");
      expect(edited.html && edited.css && edited.js && edited.published && edited.sheet && edited.script && edited.shown && edited.color === 'rgb(255, 192, 203)' && edited.gui, JSON.stringify(edited));
      const back = await app("A.undo(); A.undo(); A.undo(); a.run('sourceMode'); await new Promise((r) => setTimeout(r, 50)); const page = doc().site.pages[0]; return { source: page.source ?? '', css: doc().site.files.css, js: doc().site.code.js, canvas: !!document.querySelector('.site-frame') };");
      expect(back.source === '' && back.css === '' && back.js === '' && back.canvas, JSON.stringify(back));
    });

    // ── the bulletin board and my themes
    report.group('board & themes');
    await report.check(tag('the board block draws its list in the canvas and its posts are edited in the Content tab'), async () => {
      await closePopups();
      await fresh('blank');
      const info = await app("A.insertBlock('board'); await new Promise((r) => setTimeout(r, 200)); const b = frame().querySelector('.hm-board'); const block = doc().page.blocks.at(-1); return { type: block.type, rows: b.querySelectorAll('tbody tr[data-post]').length, scripts: b.querySelectorAll('script').length, posts: b.querySelectorAll('.hm-post').length, items: a.state.selected === doc().page.blocks.at(-1).id ? 99 : 0 };");
      expect(info.type === 'board' && info.rows === 5 && info.scripts === 0 && info.posts === 0 && info.items >= 5, JSON.stringify(info));
      const added = await app("const block = doc().page.blocks.at(-1); A.itemAction('add', block.id, 'items:0'); await new Promise((r) => setTimeout(r, 100)); return frame().querySelectorAll('.hm-board tbody tr[data-post]').length;");
      expect(added === 6, `rows after adding: ${added}`);
    });
    await report.check(tag('the published board filters by category, searches, opens a post'), async () => {
      const result = await app(`const files = A.publishSite ? null : null; const site = doc().site; const f = a.domain.siteFiles(site); const html = f.find((x) => x.path === 'index.html').data.replace('<link rel="stylesheet" href="style.css" />', '<style>' + f.find((x) => x.path === 'style.css').data + '</style>');
        const holder = document.createElement('iframe'); holder.style.cssText = 'position:fixed;left:-3000px;width:1200px;height:800px'; document.body.append(holder);
        await new Promise((r) => { holder.onload = r; holder.srcdoc = html; });
        const d = holder.contentDocument; const b = d.querySelector('.hm-board'); const shown = () => [...b.querySelectorAll('tbody tr')].filter((r) => !r.hidden).length;
        const all = shown(); const cats = [...b.querySelectorAll('[data-board-cat]')]; cats[cats.length - 1].click(); const one = shown();
        cats[0].click(); const s = b.querySelector('.hm-board-search'); s.value = 'zzzz-none'; s.dispatchEvent(new Event('input')); const none = shown(); const empty = !b.querySelector('.hm-board-empty').hidden;
        const hidden = getComputedStyle(d.querySelector('.hm-post')).display === 'none';
        holder.remove(); return { all, one, none, empty, hidden };`);
      expect(result.all === 6 && result.one > 0 && result.one < 6 && result.none === 0 && result.empty && result.hidden, JSON.stringify(result));
    });
    await report.check(tag('40 designs in the design window, 26 light without scrolling'), async () => {
      await closePopups();
      await app("void a.run('designPicker'); return 1;");
      await waitPopup('design');
      const info = await run(`(() => { const d = ${popupDoc('design')}; const b = d.querySelector('.popup-body'); return { cards: d.querySelectorAll('.design-card').length, overflow: b.scrollHeight - b.clientHeight, tabs: d.querySelectorAll('[data-action="design-group"]').length }; })()`);
      expect(info.cards === 26 && info.overflow <= 2 && info.tabs === 3, JSON.stringify(info));
    });
    await report.check(tag('my themes: made in the editor from the site, saved, applied, kept in the settings, deleted'), async () => {
      await run(`(() => { const d = ${popupDoc('design')}; d.querySelector('[data-action="design-group"][data-value="mine"]').click(); return 1; })()`);
      await sleep(200);
      await run(`(() => { const d = ${popupDoc('design')}; d.querySelector('[data-action="design-from-site"]').click(); return 1; })()`);
      await sleep(200);
      await run(`(() => { const d = ${popupDoc('design')}; const c = d.querySelector('[data-edit-design="primary"]'); c.value = '#cc2244'; c.dispatchEvent(new Event('input', { bubbles: true })); const n = d.querySelector('[data-edit-design="name"]'); n.value = 'Smoke Red'; n.dispatchEvent(new Event('input', { bubbles: true })); const r = d.querySelector('[data-edit-design="radius"]'); r.value = '22'; r.dispatchEvent(new Event('input', { bubbles: true })); return d.querySelector('#mine-preview .mp-hero').style.background; })()`);
      await run(`${popupDoc('design')}.querySelector('[data-action="design-edit-apply"]').click(), 1`);
      await page.waitFor("window.__myhomemaker.state.docs[0].site.design.name === 'Smoke Red'", { timeout: 5000 });
      const applied = await app("const d = doc().site.design; return { primary: d.overrides.primary, radius: d.overrides.radius, mine: a.state.settings.customDesigns.map((x) => x.name), css: frame().getElementById('hm-site').textContent.includes('--primary:#cc2244'), status: document.querySelector('#statusbar').textContent.includes('Smoke Red') };");
      expect(applied.primary === '#cc2244' && applied.radius === 22 && applied.mine.includes('Smoke Red') && applied.css && applied.status, JSON.stringify(applied));
      // Another preset, then the theme again from the My themes tab; then delete it.
      await app("A.setDesign({ id: 'forest' }, { reset: true }); void a.run('designPicker'); return 1;");
      await waitPopup('design');
      await run(`(() => { const d = ${popupDoc('design')}; d.querySelector('[data-action="design-group"][data-value="mine"]').click(); return 1; })()`);
      await sleep(200);
      await run(`(() => { const d = ${popupDoc('design')}; const card = [...d.querySelectorAll('.design-card[data-pick-design]')].find((c) => c.textContent.includes('Smoke Red')); card.click(); return 1; })()`);
      await sleep(150);
      await run(`(() => { const d = ${popupDoc('design')}; d.querySelector('[data-action="design-apply"]').click(); return 1; })()`);
      await page.waitFor("window.__myhomemaker.state.docs[0].site.design.name === 'Smoke Red' && window.__myhomemaker.state.docs[0].site.design.overrides.primary === '#cc2244'", { timeout: 5000 });
      await app("void a.run('designPicker'); return 1;");
      await waitPopup('design');
      await run(`(() => { const d = ${popupDoc('design')}; d.defaultView.confirm = () => true; const del = d.querySelector('[data-action="design-delete"]'); del.click(); return 1; })()`);
      await page.waitFor("window.__myhomemaker.state.settings.customDesigns.length === 0", { timeout: 5000 });
      expect(await app("return doc().site.design.overrides.primary === '#cc2244';"), 'the site lost the theme values');
      await closePopups();
    });
    await report.check(tag('Save this design as my theme keeps the site design under a name'), async () => {
      await app("A.setDesign({ id: 'rose' }, { reset: true }); A.setDesign({ accent: '#00aa11' }); void a.run('saveDesignAsMine'); return 1;");
      await waitPopup('prompt');
      await run(`(() => { const d = ${popupDoc('prompt')}; const i = d.querySelector('[data-draft="value"]'); i.value = 'Rose Green'; i.dispatchEvent(new Event('input', { bubbles: true })); d.querySelector('[data-action="prompt-apply"]').click(); return 1; })()`);
      await page.waitFor("window.__myhomemaker.state.settings.customDesigns.some((x) => x.name === 'Rose Green' && x.values.accent === '#00aa11' && x.base === 'rose')", { timeout: 5000 });
      expect(await app("return doc().site.design.name === 'Rose Green';"), 'name not on the site');
      await app("A.updateSettings({ customDesigns: [] }); return 1;");
    });

    // ── the right panel: every field belongs to the block selected, and changes only that block
    report.group('right panel');
    /** A site with one block of every kind on its home page. */
    const everyBlock = "A.newSite('blank'); for (const type of a.domain.PAGE_BLOCK_TYPES) A.insertBlock(type); await new Promise((r) => setTimeout(r, 120)); return doc().page.blocks.length;";
    /** The site without the selected block: for "nothing else changed". */
    const others = "(() => { const s = JSON.parse(JSON.stringify(doc().site)); const keep = a.state.selected; for (const p of s.pages) p.blocks = p.blocks.filter((b) => b.id !== keep); return JSON.stringify(s); })()";
    await report.check(tag('every field of the Content and Style tabs belongs to the block selected, for every kind of block'), async () => {
      await closePopups();
      const count = await app(everyBlock);
      expect(count >= 30, `blocks: ${count}`);
      const wrong = await app(`const bad = [];
        for (const block of doc().page.blocks) {
          A.select(block.id);
          for (const tab of ['content', 'style']) {
            a.api.showEditorTab ? a.api.showEditorTab(tab) : document.querySelector('[data-editor-tab="' + tab + '"]').click();
            await new Promise((r) => setTimeout(r, 0));
            const fields = [...document.querySelectorAll('#editors [data-block]')];
            if (!fields.length && !document.querySelector('#editors [data-stepper]') && tab === 'content') bad.push(block.type + ': no fields');
            for (const f of fields) if (f.dataset.block !== block.id) bad.push(block.type + '/' + tab + ': ' + (f.dataset.prop || f.dataset.style || f.className) + ' → ' + f.dataset.block);
            for (const s of document.querySelectorAll('#editors [data-stepper]')) { const k = s.dataset.stepper; if (/^(prop|style):/.test(k) && k.split(':')[1] !== block.id) bad.push(block.type + '/' + tab + ': stepper ' + k); }
          }
        }
        document.querySelector('[data-editor-tab="content"]').click();
        return bad.slice(0, 8).join(' | ');`, 60000);
      expect(!wrong, wrong);
    });
    await report.check(tag('a field being typed in when another block is selected: the text goes to its own block, the fields change to the new block'), async () => {
      const result = await app(`const [first, second] = doc().page.blocks.filter((b) => b.type === 'heading' || b.type === 'button');
        A.select(first.id); document.querySelector('[data-editor-tab="content"]').click();
        const field = document.querySelector('#editors input[type="text"][data-prop], #editors textarea[data-prop]');
        field.focus(); field.value = 'Typed for the first'; field.dispatchEvent(new Event('input', { bubbles: true }));
        const prop = field.dataset.prop;
        // Selected another way than a click on the canvas: the field keeps the focus.
        A.select(second.id); await new Promise((r) => setTimeout(r, 30));
        const shown = [...document.querySelectorAll('#editors [data-block]')].map((f) => f.dataset.block);
        const now = (id) => a.domain.S.findBlock(doc().site, id).block;
        return { firstValue: now(first.id).props[prop], secondChanged: JSON.stringify(now(second.id).props).includes('Typed for the first'), shownForSecond: shown.length > 0 && shown.every((id) => id === second.id), focusLeft: !document.querySelector('#editors').contains(document.activeElement) };`);
      expect(result.firstValue === 'Typed for the first' && !result.secondChanged && result.shownForSecond && result.focusLeft, JSON.stringify(result));
    });
    await report.check(tag('adding a block from the Blocks panel while typing: the fields are those of the new block'), async () => {
      const result = await app(`const text = doc().page.blocks.find((b) => b.type === 'text'); A.select(text.id); document.querySelector('[data-editor-tab="content"]').click();
        const field = document.querySelector('#editors textarea[data-prop], #editors input[type="text"][data-prop]'); field.focus();
        const item = document.querySelector('#left-panel .block-item[data-block-type="button"]'); item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1 })); item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1 })); item.click();
        await new Promise((r) => setTimeout(r, 120));
        const added = a.domain.S.findBlock(doc().site, a.state.selected)?.block;
        const shown = [...document.querySelectorAll('#editors [data-block]')].map((f) => f.dataset.block);
        return { type: added?.type, all: shown.length > 0 && shown.every((id) => id === a.state.selected) };`);
      expect(result.type === 'button' && result.all, JSON.stringify(result));
    });
    await report.check(tag('a text, a toggle, a list and a picture-less select change only the block selected'), async () => {
      const result = await app(`const bad = [];
        for (const type of ['heading', 'text', 'button', 'hero', 'features', 'board', 'contact']) {
          const block = doc().page.blocks.find((b) => b.type === type); A.select(block.id); document.querySelector('[data-editor-tab="content"]').click();
          await new Promise((r) => setTimeout(r, 0));
          const before = ${others};
          const text = document.querySelector('#editors input[type="text"][data-prop]:not([data-prop^="items"]), #editors textarea[data-prop]:not([data-prop^="items"])');
          if (text) { text.value = 'Changed ' + type; text.dispatchEvent(new Event('change', { bubbles: true })); }
          const toggle = document.querySelector('#editors input[type="checkbox"][data-prop]');
          if (toggle) { toggle.checked = !toggle.checked; toggle.dispatchEvent(new Event('change', { bubbles: true })); }
          const sel = document.querySelector('#editors select[data-prop]');
          if (sel && sel.options.length > 1) { sel.value = sel.options[sel.selectedIndex === 0 ? 1 : 0].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          await new Promise((r) => setTimeout(r, 0));
          const own = a.domain.S.findBlock(doc().site, block.id).block;
          if (text && !JSON.stringify(own.props).includes('Changed ' + type)) bad.push(type + ': its text did not change');
          if (${others} !== before) bad.push(type + ': another block changed');
        }
        return bad.join(' | ');`);
      expect(!result, result);
    });
    await report.check(tag('items: changing one item changes that item only; Style tab steppers and swatches change the block selected only'), async () => {
      const result = await app(`const block = doc().page.blocks.find((b) => b.type === 'features'); A.select(block.id); document.querySelector('[data-editor-tab="content"]').click();
        await new Promise((r) => setTimeout(r, 0));
        const before = JSON.stringify(a.domain.S.findBlock(doc().site, block.id).block.props.items);
        const f = document.querySelector('#editors [data-prop="items.1.title"]');
        if (!f) return 'no item field';
        f.value = 'Second item'; f.dispatchEvent(new Event('change', { bubbles: true }));
        const items = a.domain.S.findBlock(doc().site, block.id).block.props.items;
        const old = JSON.parse(before);
        if (items[1].title !== 'Second item' || JSON.stringify(items[0]) !== JSON.stringify(old[0]) || JSON.stringify(items[2]) !== JSON.stringify(old[2])) return 'items: ' + JSON.stringify(items.map((i) => i.title));
        document.querySelector('[data-editor-tab="style"]').click(); await new Promise((r) => setTimeout(r, 0));
        const otherBefore = ${others};
        const up = document.querySelector('#editors [data-stepper^="style:"] .stepper-button[data-step-dir="1"]:not([data-at-limit])');
        if (up) up.click();
        const swatch = document.querySelector('#editors [data-style-set]');
        if (swatch) swatch.click();
        await new Promise((r) => setTimeout(r, 0));
        if (${others} !== otherBefore) return 'style changed another block';
        if (!up && !swatch) return 'no style controls';
        document.querySelector('[data-editor-tab="content"]').click();
        return '';`);
      expect(!result, result);
    });

    await report.check(tag('the Page tab: a page name being typed when another page opens goes to its own page'), async () => {
      const result = await app(`A.newSite('business'); await new Promise((r) => setTimeout(r, 80));
        const [first, second] = doc().site.pages; A.openPage(first.id); document.querySelector('[data-editor-tab="page"]').click(); await new Promise((r) => setTimeout(r, 0));
        const field = document.querySelector('#editors [data-page-field="title"]'); field.focus(); field.value = 'Title of the first page';
        A.openPage(second.id); await new Promise((r) => setTimeout(r, 30));
        const pages = doc().site.pages;
        const shown = document.querySelector('#editors [data-page-field="title"]')?.dataset.page;
        document.querySelector('[data-editor-tab="content"]').click();
        return { first: pages[0].title, second: pages[1].title, shown: shown === second.id };`);
      expect(result.first === 'Title of the first page' && result.second !== 'Title of the first page' && result.shown, JSON.stringify(result));
    });

    await report.check(tag('button settings: style, size, corners, colours, icon, full width and new tab, for that button only'), async () => {
      const result = await app(`A.newSite('blank'); A.insertBlock('hero'); A.insertBlock('pricing'); await new Promise((r) => setTimeout(r, 100));
        const hero = doc().page.blocks.filter((b) => b.type === 'hero').at(-1); A.select(hero.id); document.querySelector('[data-editor-tab="content"]').click(); await new Promise((r) => setTimeout(r, 0));
        const box = document.querySelector('#editors details[data-props-key="' + hero.id + ':btn:button1"]'); if (!box) return 'no button settings';
        box.open = true; box.dispatchEvent(new Event('toggle'));
        const set = (key, value) => { const el = document.querySelector('#editors [data-button-path="button1"][data-button-prop="' + key + '"]'); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
        set('variant', 'outline'); set('size', 'large'); set('shape', 'pill'); set('bg', '#112233'); set('color', '#ffeedd'); set('icon', '★'); set('full', true); set('newTab', true);
        await new Promise((r) => setTimeout(r, 50));
        const look = a.domain.S.findBlock(doc().site, hero.id).block.props.buttons;
        const a1 = frame().querySelector('[data-block-id="' + hero.id + '"] .hm-btn');
        const a2 = frame().querySelectorAll('[data-block-id="' + hero.id + '"] .hm-btn')[1];
        const reopened = document.querySelector('#editors details[data-props-key="' + hero.id + ':btn:button1"]').open;
        document.querySelector('#editors [data-button-clear="bg"][data-button-path="button1"]').click();
        const cleared = !('bg' in a.domain.S.findBlock(doc().site, hero.id).block.props.buttons.button1);
        const published = a.domain.siteFiles(doc().site).find((f) => f.path === 'index.html').data;
        return JSON.stringify({ ok: look.button1.variant === 'outline' && look.button1.full === true && !look.button2,
          classes: a1.className, second: a2.className, style: a1.getAttribute('style'), icon: a1.textContent.includes('★'), target: a1.getAttribute('target'), reopened, cleared,
          publishedTarget: /target="_blank" rel="noopener"/.test(published) });`);
      const r = JSON.parse(result.startsWith('{') ? result : '{"error":' + JSON.stringify(result) + '}');
      expect(r.ok && /hm-btn-outline/.test(r.classes) && /hm-btn-large/.test(r.classes) && /hm-btn-pill/.test(r.classes) && /hm-btn-full/.test(r.classes) && !/hm-btn-large/.test(r.second) && /#ffeedd/.test(r.style) && r.icon && r.target === '_blank' && r.reopened && r.cleared && r.publishedTarget, result);
    });
    await report.check(tag('item settings: hide, highlight and colours of one item (and a button inside an item)'), async () => {
      const result = await app(`const pricing = doc().page.blocks.find((b) => b.type === 'pricing'); A.select(pricing.id); document.querySelector('[data-editor-tab="content"]').click(); await new Promise((r) => setTimeout(r, 0));
        const field = (path) => document.querySelector('#editors [data-prop="' + path + '"]');
        const toggle = (path, on) => { const el = field(path); el.checked = on; el.dispatchEvent(new Event('change', { bubbles: true })); };
        toggle('items.0._hidden', true); toggle('items.1._accent', true);
        const bg = field('items.1._bg'); bg.value = '#334455'; bg.dispatchEvent(new Event('change', { bubbles: true }));
        const variant = document.querySelector('#editors [data-button-path="items.2.button"][data-button-prop="variant"]'); variant.value = 'link'; variant.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 50));
        const block = a.domain.S.findBlock(doc().site, pricing.id).block;
        const cards = frame().querySelectorAll('[data-block-id="' + pricing.id + '"] .hm-plan');
        const published = a.domain.siteFiles(doc().site).find((f) => f.path === 'index.html').data;
        const names = block.props.items.map((it) => it.name);
        return JSON.stringify({ hiddenInEditor: cards[0].hasAttribute('data-item-hidden'), accent: cards[1].hasAttribute('data-item-accent'), bg: (cards[1].getAttribute('style') || '').includes('#334455'),
          linkButton: cards[2].querySelector('.hm-btn').className.includes('hm-btn-link'), others: !block.props.items[0]._bg && !block.props.items[2]._accent,
          published: !published.includes('>' + names[0] + '<') && published.includes('>' + names[1] + '<'), plansPublished: (published.match(/class="hm-card hm-plan/g) || []).length });`);
      const r = JSON.parse(result);
      expect(r.hiddenInEditor && r.accent && r.bg && r.linkButton && r.others && r.published && r.plansPublished === 2, result);
    });

    await report.check(tag('every button of both side panels has an icon, for every kind of block and every editor tab'), async () => {
      const missing = await app(`A.newSite('blank'); for (const type of a.domain.PAGE_BLOCK_TYPES) A.insertBlock(type); await new Promise((r) => setTimeout(r, 150));
        const out = new Set();
        const scan = (where) => { for (const b of document.querySelectorAll('#left-panel button, #right-panel button')) { if (b.offsetParent === null || b.classList.contains('design-card') || b.querySelector('svg')) continue; out.add(where + ': ' + (b.textContent.trim() || b.title || b.className).slice(0, 30)); } };
        scan('panels');
        for (const block of [...doc().page.blocks, doc().site.layout.header, doc().site.layout.footer]) {
          A.select(block.id);
          for (const tab of ['content', 'style', 'page', 'site']) { document.querySelector('[data-editor-tab="' + tab + '"]').click(); await new Promise((r) => setTimeout(r, 0)); document.querySelectorAll('#editors details').forEach((d) => { d.open = true; }); scan(block.type + '/' + tab); }
        }
        document.querySelector('[data-editor-tab="content"]').click();
        return [...out].slice(0, 8).join(' | ');`, 120000);
      expect(!missing, missing);
    });

    // ── right-click menus: what cannot be done is greyed out
    report.group('context menus');
    const menuState = `(() => { const d = document.querySelector('.web-popup-menu iframe')?.contentDocument; if (!d) return null; return Object.fromEntries([...d.querySelectorAll('.menu-item[data-id]')].map((b) => [b.dataset.id, !b.disabled])); })()`;
    const openMenu = async (code) => {
      await closePopups();
      await app(`${code}; return 1;`);
      await waitPopup('menu');
      await sleep(150);
      return run(menuState);
    };
    await report.check(tag('block menu: Paste only with blocks to paste; Move up off for the first block; Delete page off for the only page'), async () => {
      await app("A.newSite('blank'); A.insertBlock('heading'); A.insertBlock('text'); a.state.clipboard = null; window.__clip = ''; return 1;");
      const first = await openMenu("const b = doc().page.blocks[0]; A.select(b.id); const r = document.querySelector('.site-frame').getBoundingClientRect(); void A.contextMenu({ clientX: r.left + 40, clientY: r.top + 40 }, 'block', { id: b.id })");
      expect(first && first.paste === false && first.moveUp === false && first.moveDown === true && first.copy === true, `first block: ${JSON.stringify(first)}`);
      const after = await openMenu("A.copyBlock(); const b = doc().page.blocks.at(-1); A.select(b.id); void A.contextMenu({ clientX: 200, clientY: 200 }, 'block', { id: b.id })");
      expect(after && after.paste === true && after.moveDown === false && after.moveUp === true, `after copying, last block: ${JSON.stringify(after)}`);
      const page = await openMenu("void A.contextMenu({ clientX: 200, clientY: 120 }, 'page', { id: doc().page.id })");
      expect(page && page.deletePage === false && page.pageLeft === false && page.pageRight === false, `the only page: ${JSON.stringify(page)}`);
      await closePopups();
    });
    await report.check(tag('text field menu: Cut and Copy need a selection, Paste needs text, Undo needs something to undo'), async () => {
      await app("a.state.clipboard = null; window.__clip = ''; const b = doc().page.blocks[0]; A.select(b.id); document.querySelector('[data-editor-tab=\"content\"]').click(); return 1;");
      const empty = await openMenu("const f = [...document.querySelectorAll('#editors input[type=\"text\"][data-prop], #editors textarea[data-prop]')].find((x) => x.value); f.focus(); f.setSelectionRange(0, 0); const r = f.getBoundingClientRect(); f.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }))");
      expect(empty && empty['custom:cut'] === false && empty['custom:copy'] === false && empty['custom:paste'] === false && empty['custom:undo'] === false && empty['custom:selectAll'] === true, `no selection: ${JSON.stringify(empty)}`);
      const full = await openMenu("window.__clip = 'some text'; const f = [...document.querySelectorAll('#editors input[type=\"text\"][data-prop], #editors textarea[data-prop]')].find((x) => x.value); f.focus(); f.select(); const r = f.getBoundingClientRect(); f.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }))");
      expect(full && full['custom:cut'] === true && full['custom:copy'] === true && full['custom:paste'] === true, `with a selection and text to paste: ${JSON.stringify(full)}`);
      await closePopups();
      await app("window.__clip = ''; return 1;");
    });

    report.group('errors');
    await report.check(tag('no script errors in the whole run'), async () => {
      const problems = errorsSoFar();
      expect(!problems.length, problems.join(' | '));
    });
  } finally {
    await close();
  }
}
if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
process.exitCode = report.finish() ? 0 : 1;
