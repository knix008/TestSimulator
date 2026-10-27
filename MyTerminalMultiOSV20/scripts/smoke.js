/**
 * Desktop smoke test: starts the debug program (npm run build:debug) with a
 * scratch data folder and a WebView2 debugging port, drives it over CDP and
 * checks what the Tauri port must keep working:
 *   shell start-up · built-in commands · programs in a pseudo terminal keep
 *   their colours and exit codes · typing into a running program · Ctrl+C ·
 *   settings / About popups · toolbar drop-down window · new tab, detach into
 *   a window, merge back · maximise · window opacity · quit without leftovers
 *
 *   npm run smoke            (Windows; rebuild first after changing src/ or src-tauri/)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyTerminal.exe' : 'MyTerminal');
const PORT = Number(process.env.SMOKE_PORT || 9452);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myterminal-smoke-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.platform !== 'win32') {
  console.error('The smoke test drives WebView2 over CDP: Windows only.');
  process.exit(2);
}
if (!fs.existsSync(exe)) {
  console.error(`${exe} is missing: run npm run build:debug first.`);
  process.exit(2);
}

async function targets() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  } catch (_) {
    return [];
  }
}

async function page(match, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const t = (await targets()).find((x) => x.type === 'page' && (typeof match === 'function' ? match(x.url) : x.url.includes(match)));
    if (t) return t;
    if (Date.now() > end) throw new Error(`no window ${match}`);
    await wait(250);
  }
}

async function evaluate(match, expression, timeout) {
  const t = await page(match, timeout);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  try {
    // A window that is still hidden can leave an evaluate unanswered: never wait forever.
    const res = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('page did not answer')), 30000);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === 1) {
          clearTimeout(timer);
          resolve(msg);
        }
      };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true } }));
    });
    if (res.result.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'page error');
    return res.result.result.value;
  } finally {
    ws.close();
  }
}

const MAIN = (url) => url.includes('/src/renderer/index.html') && !url.includes('adopt=');

// Runs a command line in session `id` of the main window and returns what it printed.
const RUN = `
  window.__smokeRun = async (id, line, ms, then) => {
    const api = window.myTerminal;
    let out = '';
    const off = api.onPtyData((p) => { if (p.sessionId === id) out += p.data; });
    await api.ptyWrite(id, line + '\\r');
    await new Promise((r) => setTimeout(r, ms));
    if (then) { await api.ptyWrite(id, then); await new Promise((r) => setTimeout(r, 1500)); }
    off();
    return out;
  };
  return true;`;

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const env = { ...process.env, MYTERMINAL_CONFIG_DIR: dataDir, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = spawn(exe, [], { env, stdio: 'ignore' });
  let exited = null;
  app.on('exit', (code) => {
    exited = code;
  });
  console.log(`MyTerminal smoke (data: ${dataDir})`);

  await check('window opens and MyShell answers', async () => {
    await page(MAIN, 30000);
    await wait(2500);
    await evaluate(MAIN, RUN);
    // The terminal draws with WebGL (no text in the DOM): ask the shell.
    const text = await evaluate(MAIN, 'return window.__smokeRun("1", "about", 1200);');
    expect(text.includes('MyTerminal Shell v'), JSON.stringify(text.slice(0, 200)));
  });

  await check('built-in commands (echo, pwd)', async () => {
    const out = await evaluate(MAIN, 'return window.__smokeRun("1", "echo smoke-echo", 1000);');
    expect(out.includes('smoke-echo'), JSON.stringify(out));
  });

  await check('programs keep their colours (pseudo terminal)', async () => {
    const out = await evaluate(MAIN, 'return window.__smokeRun("1", "powershell -NoProfile -Command Write-Host -ForegroundColor Green SMOKE-GREEN", 5000);');
    expect(/\x1b\[(32|92|38;5;(2|10))mSMOKE-GREEN/.test(out), `no colour: ${JSON.stringify(out.slice(0, 300))}`);
  });

  await check('exit codes are reported', async () => {
    const out = await evaluate(MAIN, 'return window.__smokeRun("1", "cmd /c exit 3", 2500);');
    expect(out.includes('[exit 3]'), JSON.stringify(out.slice(-200)));
  });

  await check('typing reaches a running program', async () => {
    const out = await evaluate(MAIN, `return window.__smokeRun("1", "powershell -NoProfile -Command \\"$x = Read-Host q; Write-Host ('GOT:' + $x)\\"", 4500, "typed\\r");`);
    expect(out.includes('GOT:typed'), JSON.stringify(out.slice(-300)));
  });

  await check('Ctrl+C ends a program with one prompt', async () => {
    const out = await evaluate(MAIN, 'return window.__smokeRun("1", "ping -n 30 127.0.0.1", 2500, "\\u0003");');
    expect(out.includes('^C'), 'no ^C');
    expect(!out.includes('[exit'), `late exit line: ${JSON.stringify(out.slice(-200))}`);
  });

  await check('settings popup opens, sizes itself and closes', async () => {
    await evaluate(MAIN, 'document.getElementById("btn-settings").click(); return true;');
    await page('kind=settings');
    await wait(3000);
    const info = await evaluate('kind=settings', 'return { tabs: document.querySelectorAll(".settings-tab, [role=tab]").length, h: innerHeight };', 15000);
    expect(info.tabs >= 9 && info.h > 300, JSON.stringify(info));
    await evaluate('kind=settings', 'window.myTerminal.popupGetId().then((id) => window.myTerminal.closePopup(id)); return true;');
    await wait(1000);
    expect(!(await targets()).some((t) => t.url.includes('kind=settings')), 'popup still open');
  });

  await check('About shows the Tauri runtime', async () => {
    await evaluate(MAIN, 'document.getElementById("btn-about").click(); return true;');
    await page('kind=about');
    await wait(3000);
    const rows = await evaluate('kind=about', 'return [...document.querySelectorAll(".about-row")].map((r) => r.textContent);', 15000);
    expect(rows.some((r) => r.includes('Tauri')), JSON.stringify(rows));
    await evaluate('kind=about', 'window.myTerminal.popupGetId().then((id) => window.myTerminal.closePopup(id)); return true;');
  });

  await check('theme drop-down window opens and picks', async () => {
    await evaluate(MAIN, 'document.getElementById("btn-theme-pick").click(); return true;');
    await wait(1200);
    const theme = await evaluate('dropdown.html', 'const b = [...document.querySelectorAll("#menu button[data-theme]")][3]; b.click(); return b.dataset.theme;');
    await wait(800);
    const now = await evaluate(MAIN, 'return window.__myTerminal.state.themeId;');
    expect(now === theme, `${now} != ${theme}`);
  });

  await check('custom theme: made from the theme menu, renamed and deleted in settings', async () => {
    await evaluate(MAIN, 'document.getElementById("btn-theme-pick").click(); return true;');
    await wait(1200);
    const actions = await evaluate('dropdown.html', 'return [...document.querySelectorAll("#menu button[data-action]")].map((b) => b.dataset.action);');
    expect(actions.join() === 'theme-new,theme-settings', `menu actions: ${actions}`);
    await evaluate('dropdown.html', 'document.querySelector("#menu button[data-action=theme-new]").click(); return true;');
    await page('kind=settings');
    await wait(3000);
    const made = await evaluate(MAIN, 'const s = window.__myTerminal.state; return { id: s.themeId, list: s.customThemes.map((t) => t.name) };');
    expect(made.id.startsWith('user-') && made.list.length === 1, JSON.stringify(made));
    const renamed = await evaluate('kind=settings', `
      document.querySelector('[data-tab="theme"], [data-settings-tab="theme"]')?.click();
      const input = document.querySelector('[data-custom-theme-name]');
      input.value = 'Smoke Theme';
      document.querySelector('[data-custom-theme-rename]').click();
      await new Promise((r) => setTimeout(r, 400));
      return [...document.querySelectorAll('.theme-grid-custom .theme-name')].map((n) => n.textContent);`);
    expect(renamed.includes('Smoke Theme'), JSON.stringify(renamed));
    await wait(800);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    expect(saved.customThemes?.[0]?.name === 'Smoke Theme' && saved.themeId === saved.customThemes[0].id, JSON.stringify(saved.customThemes));
    await evaluate(MAIN, 'document.getElementById("btn-theme-pick").click(); return true;');
    await wait(1200);
    const listed = await evaluate('dropdown.html', 'const names = [...document.querySelectorAll("#menu button[data-theme^=user-]")].map((b) => b.textContent.trim()); window.myTerminal.closeDropdown(); return names;');
    expect(listed.includes('Smoke Theme'), `menu: ${listed}`);
    await evaluate('kind=settings', `
      window.confirm = () => true;
      document.querySelector('[data-custom-theme-delete]').click();
      await new Promise((r) => setTimeout(r, 400));
      return true;`);
    await wait(800);
    const after = await evaluate(MAIN, 'const s = window.__myTerminal.state; return { id: s.themeId, n: s.customThemes.length };');
    expect(after.n === 0 && !after.id.startsWith('user-'), JSON.stringify(after));
    await evaluate('kind=settings', 'window.myTerminal.popupGetId().then((id) => window.myTerminal.closePopup(id)); return true;');
    await wait(800);
  });

  await check('new tab, detach into a window, merge back', async () => {
    const r = await evaluate(MAIN, `
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+').click();
      await new Promise((r) => setTimeout(r, 1500));
      return window.myTerminal.detachSession({ sessionId: '2', title: 'cmd 2', mode: 'local', serialized: '', width: 900, height: 600 });`);
    expect(r && r.ok, JSON.stringify(r));
    const adopted = (u) => u.includes('adopt=2');
    await page(adopted, 15000);
    await wait(2000);
    await evaluate(adopted, RUN);
    const echo = await evaluate(adopted, 'return window.__smokeRun("2", "echo moved-ok", 1200);');
    expect(echo.includes('moved-ok'), 'detached session does not answer');
    const m = await evaluate(adopted, 'return window.myTerminal.attachSession({ sessionId: "2", targetWindowId: 1, title: "cmd 2", mode: "local", serialized: "" });');
    expect(m && m.ok, JSON.stringify(m));
    await wait(1500);
    expect(!(await targets()).some((t) => adopted(t.url)), 'emptied window stayed');
    const tabs = await evaluate(MAIN, 'return document.querySelectorAll(".tab-item[data-session-id], .tab-bar .tab-item").length;');
    expect(tabs >= 2, `tabs ${tabs}`);
  });

  await check('maximise toggles and reports', async () => {
    const r = await evaluate(MAIN, `
      const api = window.myTerminal; const seen = [];
      const off = api.onMaximized((v) => seen.push(v));
      await api.maximize(); await new Promise((r) => setTimeout(r, 600));
      await api.maximize(); await new Promise((r) => setTimeout(r, 600));
      off(); return seen;`);
    expect(JSON.stringify(r) === '[true,false]', JSON.stringify(r));
  });

  await check('window opacity follows the slider', async () => {
    const r = await evaluate(MAIN, `
      const s = document.querySelector('.tb-opacity-slider');
      const set = (v) => { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); };
      set('50'); const half = document.body.style.opacity; set('0');
      return [half, document.body.style.opacity];`);
    expect(r[0] === '0.5' && r[1] === '', JSON.stringify(r));
  });

  await check('settings are saved to settings.json', async () => {
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    expect(saved.themeId && saved.windowBounds, Object.keys(saved).join(','));
  });

  await check('quitting ends the program and its host', async () => {
    await evaluate(MAIN, 'window.myTerminal.quitApp(); return true;').catch(() => {});
    for (let i = 0; i < 40 && exited === null; i += 1) await wait(250);
    expect(exited === 0, `exit code ${exited}`);
  });

  if (exited === null) app.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
