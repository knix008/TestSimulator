// npm run guide:images — the screenshots in doc/images/ko/ for doc/UsersGuide*.md and
// doc/Tutorial*.md, taken from the real desktop program (debug build, `npm run build:debug`
// first) with real synthesis. Data: a COPY of the installed models (scripts/lib/testdata.mjs);
// the WebView storage is a fresh scratch folder, so the shots always show the default look.
import fs from 'node:fs';
import path from 'node:path';
import { launchDesktop, root } from './lib/desktop.mjs';
import { sleep } from './lib/cdp.mjs';
import { ensureTestData, scratch } from './lib/testdata.mjs';

const out = path.join(root, 'doc', 'images', 'ko');
fs.mkdirSync(out, { recursive: true });
const data = ensureTestData();
if (!data.dir) { console.error('No voice model found to copy (install one in the program first, or set TTS_TEST_APPDATA).'); process.exit(2); }
// Models from the copy, webview storage fresh: link the models folder into a new config dir.
const config = scratch('tts-shots-');
fs.mkdirSync(path.join(config, 'TTSMultiOSV10'), { recursive: true });
fs.cpSync(path.join(data.dir, 'TTSMultiOSV10', 'models'), path.join(config, 'TTSMultiOSV10', 'models'), { recursive: true });

const app = await launchDesktop({ configDir: config, port: 9481 });
const { page } = app;
const shots = [];

/** The page area around `selectors` (padding in CSS px), or the whole window. */
async function shot(name, selectors = null, pad = 8) {
  const file = path.join(out, `${name}.png`);
  let clip;
  if (selectors) {
    clip = await page.eval(`(() => {
      const rects = ${JSON.stringify(selectors)}.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.offsetParent || e.getClientRects().length).map((e) => e.getBoundingClientRect());
      if (!rects.length) return null;
      const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - ${pad});
      const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - ${pad});
      const right = Math.min(innerWidth, Math.max(...rects.map((r) => r.right)) + ${pad});
      const bottom = Math.min(innerHeight, Math.max(...rects.map((r) => r.bottom)) + ${pad});
      return { x, y, width: right - x, height: bottom - y, scale: 1 };
    })()`);
    if (!clip) throw new Error(`${name}: nothing matches ${selectors}`);
  }
  // Park the pointer on an empty spot: the real cursor over the window would show a tooltip.
  await page.mouse('mouseMoved', 3, 300, { button: 'none' });
  await sleep(250);
  const r = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  shots.push(name);
  console.log(`  ✔ ${name}.png`);
}
const click = (selector) => page.eval(`(document.querySelector(${JSON.stringify(selector)}).click(), true)`);
const closeDialogs = () => page.eval(`([...document.querySelectorAll('dialog[open]')].forEach((d) => d.close()), true)`);

try {
  await page.waitFor(`document.querySelectorAll('.start-board > .start-card').length >= 5 && document.querySelectorAll('#modelSelect option').length > 1`, 30000);
  await sleep(1800); // the moving background
  await shot('start');

  await click('[data-start="start-settings"]');
  await page.waitFor(`document.querySelector('#startSettingsDialog')?.open`);
  await shot('start-settings', ['#startSettingsDialog'], 0);
  await closeDialogs();

  // A sample in its tab, Supertonic, silent playback.
  await click('[data-start="sample"][data-value="korean_greeting"]');
  await page.eval(`(() => { const s = document.querySelector('#modelSelect'); s.value = 'ko-supertonic-int8'; s.dispatchEvent(new Event('change', { bubbles: true })); const v = document.querySelector('#volumeRange'); v.value = 0; v.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await page.waitFor(`[...document.querySelectorAll('#voiceSelect option')].filter((o) => o.value).length > 1 && !document.querySelector('#speakAllVoices').disabled`, 60000);
  await click('#speakAllVoices');
  await page.waitFor(`document.querySelectorAll('.speaker-row.done').length > 1 && !document.querySelector('#speakAllVoices').disabled`, 240000);
  await page.eval(`(document.querySelectorAll('.speaker-row [data-speaker-action="play"]')[1].click(), true)`);
  await sleep(1300);
  await page.eval(`(document.querySelector('#pausePlayback').disabled || document.querySelector('#pausePlayback').click(), true)`);
  await shot('main');
  await shot('speakers', ['.waveform-panel', '#speakerPanel'], 6);
  await shot('voice-panel', ['#right-panel'], 0);
  await shot('toolbar', ['#toolbar'], 0);

  // Menus
  await click('#menubar [data-menu="file"]');
  await page.waitFor(`document.querySelector('.menu-layer .popup-menu')`);
  await shot('menu-file', ['#menubar .app-brand', '#menubar [data-menu="file"]', '.menu-layer .popup-menu'], 10);
  await page.key('Escape');

  const editor = await page.center('#textInput');
  await page.mouse('mousePressed', editor.x - 200, editor.y - 120, { button: 'right' });
  await page.mouse('mouseReleased', editor.x - 200, editor.y - 120, { button: 'right' });
  await page.waitFor(`document.querySelector('.context-menu')`);
  await shot('context-menu', ['.context-menu'], 30);
  await page.key('Escape');

  const wave = await page.center('#waveformCanvas');
  await page.mouse('mousePressed', wave.x, wave.y, { button: 'right' });
  await page.mouse('mouseReleased', wave.x, wave.y, { button: 'right' });
  await page.waitFor(`!document.querySelector('#waveformContextMenu').hidden`);
  await shot('waveform-menu', ['#waveformContextMenu'], 30);
  await page.key('Escape');
  await page.eval(`(document.querySelector('#waveformContextMenu').hidden = true, true)`);

  // Tabs: one per sample, then more until the strip overflows.
  for (const id of ['english_greeting', 'korean_news']) {
    await click('#menubar [data-cmd="home"]');
    await page.waitFor(`document.querySelector('#app').classList.contains('on-start')`);
    await click(`[data-start="sample"][data-value="${id}"]`);
  }
  for (let i = 0; i < 6; i += 1) await click('#toolbar [data-cmd="newText"]');
  await page.eval(`(document.querySelectorAll('#docTabs .tab')[3].click(), true)`);
  await shot('tabs', ['#docTabs'], 0);
  await page.eval(`(async () => { while (document.querySelectorAll('#docTabs .tab').length > 3) { document.querySelectorAll('#docTabs .tab-close')[3].click(); await new Promise((r) => setTimeout(r, 50)); } document.querySelector('#docTabs .tab').click(); return true; })()`);

  // Themes
  await click('#statusTheme');
  await page.waitFor(`document.querySelector('#themeDialog')?.open`);
  await shot('theme-dialog', ['#themeDialog'], 0);
  await click('#themeDialog [data-start="dlg-theme"][data-value="tokyo"]');
  await closeDialogs();
  await sleep(400);
  await shot('dark');
  await click('#statusTheme');
  await click('#themeDialog [data-start="dlg-theme"][data-value="light"]');
  await closeDialogs();

  // The guide window
  await page.key('F1');
  const guide = await app.otherPage((t) => t.url.includes('guide.html'), 20000);
  await guide.waitFor(`document.querySelectorAll('#guideToc a').length > 5 && document.querySelector('#guideContent img')`, 20000);
  await sleep(500);
  const r = await guide.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'guide.png'), Buffer.from(r.result.data, 'base64'));
  shots.push('guide');
  console.log('  ✔ guide.png');
  guide.close();
} catch (error) {
  console.error(`✘ ${error.message}`);
  console.error(await page.eval(`JSON.stringify({ status: document.querySelector('#statusBarMessage').textContent, rows: [...document.querySelectorAll('.speaker-row')].map((r) => r.className.replace('speaker-row', '').trim() + ':' + r.querySelector('.speaker-status')?.textContent), error: document.querySelector('#errorDialog').open ? document.querySelector('#errorDetails').textContent.slice(0, 400) : null })`).catch((e) => e.message));
  process.exitCode = 1;
} finally {
  await page.eval(`(document.querySelector('[data-window=close]')?.click(), true)`).catch(() => {});
  await app.waitExit(8000);
  await app.close();
  fs.rmSync(config, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(`${shots.length} images in ${path.relative(root, out)}`);
