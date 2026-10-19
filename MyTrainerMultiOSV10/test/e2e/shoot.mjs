// Development helper: screenshots of the main screens (web build) into test-results/, and a check
// that no canvas or image is drawn stretched (its pixel aspect ratio differs from its shown one).
//   node test/e2e/shoot.mjs [start|model|neurons|data|code|train|test|all]
//   env: SAMPLE=<sample id or ids,comma> LANG_UI=ko|en THEME=light|dark WIDTH HEIGHT TRAIN=1
import { startWeb } from './web.harness.mjs';
import { sleep } from './cdp.mjs';

const which = process.argv[2] ?? 'all';
const width = Number(process.env.WIDTH ?? 1600);
const height = Number(process.env.HEIGHT ?? 1000);
const { page, close } = await startWeb({ width, height, storage: { 'mytrainer.settings.v1': { language: process.env.LANG_UI ?? 'ko', showStartPage: which === 'start' || which === 'all', theme: process.env.THEME ?? 'light' } } });

/** Canvases / images whose drawing is stretched: pixel ratio vs. shown ratio off by more than 3 %. */
const STRETCH_CHECK = `(() => {
  const out = [];
  const name = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : el.tagName.toLowerCase()) + (el.closest('[class]') && el.closest('[class]') !== el ? ' in ' + el.parentElement.className : '');
  for (const el of document.querySelectorAll('canvas, img')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || el.closest('[hidden]')) continue;
    const pw = el.tagName === 'IMG' ? el.naturalWidth : el.width;
    const ph = el.tagName === 'IMG' ? el.naturalHeight : el.height;
    if (!pw || !ph) continue;
    const fit = getComputedStyle(el).objectFit;
    if (el.tagName === 'IMG' && (fit === 'contain' || fit === 'cover')) continue;
    const ratio = (r.width / r.height) / (pw / ph);
    if (Math.abs(ratio - 1) > 0.03) out.push(name(el) + ' shown ' + Math.round(r.width) + '×' + Math.round(r.height) + ' drawn ' + pw + '×' + ph + ' (×' + ratio.toFixed(2) + ')');
  }
  return JSON.stringify(out);
})()`;

let stretched = 0;
const shot = async (name) => {
  await sleep(700);
  await page.screenshot(`test-results/${name}.png`);
  const bad = JSON.parse(await page.eval(STRETCH_CHECK));
  stretched += bad.length;
  console.log('shot', name, bad.length ? `STRETCHED:\n  ${bad.join('\n  ')}` : '');
};
try {
  if (which === 'start' || which === 'all') await shot('start');
  for (const sample of (process.env.SAMPLE ?? 'spiral').split(',')) {
    await page.eval(`__mytrainer.openSampleNow(${JSON.stringify(sample)})`);
    await sleep(1500);
    if (process.env.TRAIN) {
      await page.eval(`__mytrainer.run('train')`);
      await page.waitFor(`__mytrainer.state.run.state === 'idle' && __mytrainer.state.run.history.length > 0`, { timeout: 600000, interval: 500 });
    }
    for (const tab of ['model', 'neurons', 'data', 'code', 'train', 'test']) {
      if (which !== 'all' && which !== tab) continue;
      await page.eval(`__mytrainer.switchTab('${tab}')`);
      await sleep(tab === 'neurons' ? 1600 : 900);
      await shot(`${sample}-${tab}`);
    }
  }
  console.log(stretched ? `${stretched} stretched drawings` : 'no stretched drawings');
} finally {
  console.log('errors:', JSON.stringify(page.errors.slice(0, 10), null, 1));
  const log = await page.eval('JSON.stringify(__mytrainer.state.console.filter(e => e.level === "error").map(e => e.text).slice(0, 10))').catch(() => '[]');
  console.log('console errors:', log);
  await close();
}
