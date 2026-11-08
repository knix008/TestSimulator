import path from 'node:path';
import { serve, launch } from './test/harness.mjs';
const { server, url } = await serve(path.resolve('dist'));
const page = await launch({ width: 1300, height: 860 });
try {
  await page.goto(url);
  await page.eval(`await window.__mytextmaster.openSample('feature-tour');`);
  await new Promise((r) => setTimeout(r, 1200));
  console.log(await page.eval(`
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height), getComputedStyle(e).display]; };
    return { area: r('#editor-area'), areaCols: getComputedStyle(document.querySelector('#editor-area')).gridTemplateColumns, mode: document.querySelector('#editor-area').dataset.mode, ed: r('#editor-pane'), pv: r('#preview-pane'), head: r('#preview-pane .pane-head'), host: r('#preview-host'), frame: r('.preview-frame'), article: document.querySelector('.preview-frame')?.contentDocument?.querySelector('article')?.innerHTML.length,
      groups: [...document.querySelectorAll('#toolbar .tool-group, #toolbar .tool-sep, #toolbar .grow')].map(e => e.className.split(' ')[0] + ':' + Math.round(e.getBoundingClientRect().width)) };`));
  console.log('errors:', page.errors);
} catch (e) { console.log('FAIL', e.message, page.errors); }
await page.close(); server.close();
