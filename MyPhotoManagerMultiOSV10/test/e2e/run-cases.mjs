// Runs some cases of a desktop suite with full error output (for debugging).
//
//   node test/e2e/run-cases.mjs features 1,5,9        (1-based case numbers)
//   node test/e2e/run-cases.mjs features "편집"        (cases whose group/name contains the text)
//   node test/e2e/run-cases.mjs features "A|B"         (any of several texts)
import { App } from './harness.mjs';

const [suiteName = 'features', which = ''] = process.argv.slice(2);
const suite = await import(`./${suiteName}.suite.mjs`);
const numbers = /^[\d,]+$/.test(which) ? new Set(which.split(',').map(Number)) : null;
const chosen = suite.cases.filter((c, i) => !which || (numbers ? numbers.has(i + 1) : which.split('|').some((text) => `${c.group} ${c.name}`.includes(text))));
const app = new App({ prepare: suite.prepare, env: suite.env });
await app.start();
let failed = 0;
for (const testCase of chosen) {
  const start = Date.now();
  try {
    const outcome = await testCase.run(app);
    console.log(`✔ ${testCase.group} › ${testCase.name} (${Date.now() - start} ms)${outcome?.skipped ? ` — skipped: ${outcome.skipped}` : ''}`);
  } catch (error) {
    failed += 1;
    console.log(`✖ ${testCase.group} › ${testCase.name} (${Date.now() - start} ms)\n${error.stack}\n`);
    const state = await app.main.eval(`JSON.stringify({ dialogs: [...document.querySelectorAll('.dialog')].map((d) => d.textContent.slice(0, 300)), toasts: [...document.querySelectorAll('.toast-text')].map((e) => e.textContent), mode: window.__myphoto.app.state.mode, source: window.__myphoto.app.state.source })`).catch((e) => e.message);
    console.log(`   state: ${state}\n`);
    await app.main.eval(`window.__myphoto.closeAllDialogs(); window.__myphoto.actions.setMode('manage'); 1`).catch(() => {});
  }
}
await app.stop();
process.exit(failed ? 1 : 0);
