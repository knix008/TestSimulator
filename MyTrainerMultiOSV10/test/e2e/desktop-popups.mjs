// Development helper: screenshots of the desktop popup windows.
import { App } from './desktop.harness.mjs';
import { sleep } from './cdp.mjs';

const app = await new App({ storage: { 'mytrainer.settings.v1': { language: process.env.LANG_UI ?? 'ko', showStartPage: false, theme: process.env.THEME ?? 'light' } } }).start();
try {
  for (const [kind, command] of [['pyenv', 'pyenv'], ['samples', 'gallery'], ['settings', 'settings'], ['about', 'about']]) {
    await app.main.eval(`__mytrainer.run('${command}')`);
    const popup = await app.popup(kind, 20000);
    if (kind === 'pyenv') await popup.waitFor(`!document.querySelector('.py-status.busy')`, { timeout: 120000, interval: 500 });
    await sleep(1200);
    await popup.screenshot(`test-results/popup-${kind}.png`);
    console.log('shot', kind, JSON.stringify(popup.errors));
    await popup.eval(`document.querySelector('[data-action="close"]').click()`);
    popup.close();
    await sleep(600);
  }
} finally {
  console.log('console:', await app.main.eval('JSON.stringify(__mytrainer.state.console.filter((e) => e.level === "error").map((e) => e.text))').catch(() => '[]'));
  await app.close();
}
