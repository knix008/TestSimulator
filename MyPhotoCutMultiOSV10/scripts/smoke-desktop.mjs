// Drives a running desktop app (WebView2 started with --remote-debugging-port) through CDP:
//   node scripts/smoke-desktop.mjs --port 9330 --out <dir> --steps steps.json
// The steps file is the same as smoke-web.mjs's. Nothing is started or stopped here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Page, waitTarget, sleep } from '../test/e2e/cdp.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const port = Number(opt('--port', 9330));
const out = opt('--out', '.');
const steps = JSON.parse(readFileSync(opt('--steps'), 'utf8'));
mkdirSync(out, { recursive: true });

const target = await waitTarget(port, (t) => t.type === 'page' && /^MyPhotoCut/.test(t.title), 240000);
const page = await new Page(target).open();
await page.waitFor('Boolean(window.__myphotocut)', { timeout: 120000, interval: 300 });
let failed = false;
for (const step of steps) {
  const label = step.shot ?? step.eval?.slice(0, 60) ?? '';
  if (step.eval) {
    const r = await page.send('Runtime.evaluate', { expression: `(async () => { ${step.eval.trim().startsWith('return') ? step.eval : `return (${step.eval})`} })()`, awaitPromise: true, returnByValue: true }, 180000);
    const ex = r.result?.exceptionDetails;
    if (ex || r.error) { failed = true; console.log(`✘ ${label}: ${ex?.exception?.description ?? ex?.text ?? r.error?.message}`); } else if (r.result?.result?.value !== undefined) console.log(`  ${label} → ${JSON.stringify(r.result.result.value)}`);
  }
  if (step.until) { try { await page.waitFor(step.until, { timeout: step.timeout ?? 30000, interval: 200 }); } catch { failed = true; console.log(`✘ timed out: ${step.until}`); } }
  if (step.wait) await sleep(step.wait);
  if (step.shot) {
    const shot = await page.send('Page.captureScreenshot', { format: 'png' }, 60000);
    const file = path.join(out, `${step.shot}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log(`📷 ${file}`);
  }
  for (const e of page.errors.splice(0)) { failed = true; console.log(`  ! ${String(e).slice(0, 400)}`); }
}
page.close();
process.exit(failed ? 1 : 0);
