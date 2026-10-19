// Development helper: opens every popup (web frames, same fixed sizes as the desktop windows) and
// every main tab at the minimum window size, in Korean and English, and reports anything cut off:
// an element that overflows its scroll-less box, text that is clipped, or a toolbar button outside
// the window. Screenshots go to test-results/clip-*.png.
//   node test/e2e/clipping.mjs
import { startWeb } from './web.harness.mjs';
import { sleep } from './cdp.mjs';

/** Headless Chrome stops making frames on an idle page: nudge it and retry once. */
async function shot(page, file) {
  try { await page.screenshot(file); } catch {
    await page.eval('document.body.style.outline = document.body.style.outline ? "" : "0 solid transparent"').catch(() => {});
    await sleep(500);
    await page.screenshot(file).catch(() => console.log('  (no screenshot)'));
  }
}

/** Elements whose content is cut: overflow hidden / clip with more content than room, outside any scroll box. */
const CLIP_CHECK = `(() => {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); };
  const scrolls = (el) => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && p !== el) return true; } return false; };
  const label = (el) => (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.matches('svg *, canvas, option, script, style, input, textarea, select')) continue;
    const s = getComputedStyle(el);
    const hidden = /(hidden|clip)/.test(s.overflowX + s.overflowY);
    if (!hidden) continue;
    const dx = el.scrollWidth - el.clientWidth; const dy = el.scrollHeight - el.clientHeight;
    // Ellipsis text is deliberate; vertical overflow of inline text by a pixel or two is rounding.
    if (s.textOverflow === 'ellipsis' && el.title) continue;
    if ((dx > 3 && s.textOverflow !== 'ellipsis') || dy > 3) {
      if (scrolls(el)) continue;
      out.push(label(el) + ' +' + Math.max(dx, 0) + '×' + Math.max(dy, 0));
    }
  }
  // Anything poking out of the window itself.
  for (const el of document.querySelectorAll('button, .tool-button, .menubar-item')) {
    if (!visible(el) || scrolls(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1) out.push('OUTSIDE ' + label(el) + ' at ' + Math.round(r.left) + ',' + Math.round(r.top));
  }
  // Strips that scroll sideways would still hide tabs / toolbar buttons.
  for (const strip of document.querySelectorAll('#tabs, #toolbar, #menubar, .tabs-strip')) if (strip.scrollWidth > strip.clientWidth + 1 && strip.getBoundingClientRect().width > 0) out.push('STRIP overflows ' + label(strip) + ' +' + (strip.scrollWidth - strip.clientWidth));
  return JSON.stringify([...new Set(out)].slice(0, 25));
})()`;

const POPUP_COMMANDS = [['settings', 'settings'], ['about', 'about'], ['samples', 'gallery'], ['shortcuts', 'shortcuts']];
let problems = 0;
for (const language of ['ko', 'en']) {
  const { page, close } = await startWeb({ width: 1600, height: 1000, storage: { 'mytrainer.settings.v1': { language, showStartPage: false } } });
  try {
    await sleep(1500);
    for (const [kind, command] of POPUP_COMMANDS) {
      await page.eval(`__mytrainer.run('${command}')`);
      await sleep(1800);
      const tabs = kind === 'settings' ? JSON.parse(await page.eval(`JSON.stringify([...document.querySelector('.web-popup-settings iframe').contentDocument.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab))`)) : [null];
      for (const tab of tabs) {
        if (tab) { await page.eval(`document.querySelector('.web-popup-settings iframe').contentDocument.querySelector('[data-tab="${tab}"]').click()`); await sleep(500); }
        const found = JSON.parse(await page.eval(`(() => { const d = document.querySelector('.web-popup-${kind} iframe')?.contentDocument; if (!d) return '["no frame"]'; return d.defaultView.eval(${JSON.stringify(CLIP_CHECK)}); })()`));
        const name = `${language}-${kind}${tab ? `-${tab}` : ''}`;
        await shot(page, `test-results/clip-${name}.png`);
        console.log(name.padEnd(28), found.length ? `CLIPPED\n    ${found.join('\n    ')}` : 'ok');
        problems += found.length;
      }
      await page.eval(`__mytrainer.engines && document.querySelector('.web-popup-${kind} iframe').contentDocument.querySelector('[data-action="close"]')?.click()`);
      await sleep(600);
    }
    // The main window at its minimum size, every tab, with a sample that fills them.
    const min = JSON.parse(await page.eval(`JSON.stringify([parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-width')) || 1000, 640])`));
    await page.setViewport(min[0], min[1]);
    await sleep(800);
    for (const sample of ['kwsKo', 'gptEn']) {
      await page.eval(`__mytrainer.openSampleNow('${sample}')`);
      await sleep(2500);
      for (const tab of ['data', 'model', 'neurons', 'code', 'train', 'test']) {
        await page.eval(`__mytrainer.switchTab('${tab}')`);
        await sleep(1200);
        const found = JSON.parse(await page.eval(CLIP_CHECK));
        const name = `${language}-main-${sample}-${tab}`;
        await shot(page, `test-results/clip-${name}.png`);
        console.log(name.padEnd(28), found.length ? `CLIPPED\n    ${found.join('\n    ')}` : 'ok');
        problems += found.length;
      }
    }
  } finally {
    if (page.errors.length) console.log('page errors', page.errors.slice(0, 5));
    await close();
  }
}
console.log(problems ? `${problems} clipped elements` : 'nothing clipped');
