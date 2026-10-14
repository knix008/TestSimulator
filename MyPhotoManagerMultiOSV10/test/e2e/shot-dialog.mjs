// Debug: open a dialog and screenshot its own window (a separate CDP target).
//   node test/e2e/shot-dialog.mjs <out dir> "<expression that opens the dialog>" name.png
import { listTargets, Page } from './cdp.mjs';
import { App } from './harness.mjs';

const [out, expression, name] = process.argv.slice(2);
const app = new App();
await app.start();
await app.main.eval(`(() => { ${expression}; return 1; })()`);
await new Promise((r) => setTimeout(r, 1500));
const info = await app.main.eval(`(() => { const box = window.__myphoto.topDialog(); return { inWindow: Boolean(box && box.ownerDocument !== document), w: box?.ownerDocument.defaultView.innerWidth, h: box?.ownerDocument.defaultView.innerHeight, scrollH: box?.ownerDocument.documentElement.scrollHeight }; })()`);
console.log(JSON.stringify(info));
console.log(await app.main.eval(`(() => { const box = window.__myphoto.topDialog(); const d = box.ownerDocument; return JSON.stringify({ cls: box.className, styles: [...d.querySelectorAll("style, link")].map((s) => s.tagName + ":" + (s.textContent.includes("in-window") ? "has" : "no") + ":" + (s.href ?? "")), body: d.body.className, sheets: d.styleSheets.length }); })()`));
const targets = await listTargets(app.port);
console.log(targets.map((t) => `${t.type} ${t.url}`).join('\n'));
const popup = targets.find((t) => t.type === 'page' && t.url.startsWith('about:blank'));
if (popup) {
  const page = await new Page(popup).open();
  await page.screenshot(`${out}/${name}`);
  page.close();
}
await app.stop();
