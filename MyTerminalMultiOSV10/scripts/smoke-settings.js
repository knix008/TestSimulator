/**
 * Smoke test for the settings window: boots the real app with a throw-away
 * userData directory, opens Settings, walks every tab, checks that nothing
 * scrolls, switches a prompt preset and captures screenshots.
 *
 *   npx electron scripts/smoke-settings.js [outDir]
 *
 * Exit code 0 when every check passes.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const outDir = process.argv[2] || path.join(os.tmpdir(), 'myterminal-smoke-out');
fs.mkdirSync(outDir, { recursive: true });
app.setPath('userData', path.join(os.tmpdir(), `myterminal-smoke-${process.pid}`));

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 15000, every = 150, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    let value = null;
    try {
      value = await fn();
    } catch (_) {
      value = null;
    }
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(every);
  }
}

function mainWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.getTitle() !== '' && !popupOf(w));
}
function popupOf(w) {
  try {
    return w.webContents.getURL().includes('popup.html');
  } catch (_) {
    return false;
  }
}
function popupWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && popupOf(w));
}

async function capture(win, name) {
  const img = await win.capturePage();
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  console.log(`      saved ${file}`);
}

async function run() {
  const win = await waitFor(() => BrowserWindow.getAllWindows().find((w) => !popupOf(w)), { label: 'main window' });
  await waitFor(
    () =>
      win.webContents.executeJavaScript(
        `!!(document.getElementById('btn-settings') && document.querySelector('.terminal-pane.active .xterm'))`,
        true
      ),
    { label: 'renderer ready' }
  );
  await sleep(800);
  win.webContents.on('console-message', (_e, _level, message) => {
    if (/\[profile\]|\[resize\]|error/i.test(message)) console.log('      renderer:', message);
  });

  // First launch (fresh userData): the terminal is fitted to the default 120 × 25
  // (columns may exceed 120 when the toolbar's minimum width is wider).
  await sleep(3500);
  const firstSize = await win.webContents.executeJavaScript(`document.getElementById('status-size').textContent`, true);
  {
    const m = /^(\d+)×(\d+)$/.exec(firstSize) || [];
    record('first launch fits the terminal to the default size (rows 25)', Number(m[2]) === 25 && Number(m[1]) >= 120, firstSize);
  }

  await win.webContents.executeJavaScript(`document.getElementById('btn-prompt').click(); true`, true);
  const popup = await waitFor(popupWindow, { label: 'settings popup' });
  await waitFor(() => popup.isVisible(), { label: 'popup visible' });
  await sleep(600);
  record('settings popup opens from the prompt button', true);
  record('settings popup is not resizable', !popup.isResizable());

  const tabs = await popup.webContents.executeJavaScript(
    `[...document.querySelectorAll('.settings-tab')].map((b) => b.dataset.tab)`,
    true
  );
  record('settings has nine tabs', tabs.length === 9, tabs.join(','));
  const initialTab = await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab.active')?.dataset.tab`,
    true
  );
  record('prompt button opens the prompt tab', initialTab === 'prompt', initialTab);

  const [pw, ph] = popup.getContentSize();
  console.log(`      popup content size ${pw}x${ph}`);
  for (const tab of tabs) {
    await popup.webContents.executeJavaScript(
      `document.querySelector('.settings-tab[data-tab="${tab}"]').click(); true`,
      true
    );
    await sleep(250);
    const m = await popup.webContents.executeJavaScript(
      `(() => {
        const app = document.getElementById('popup-app');
        const body = document.getElementById('popup-body');
        const pane = document.querySelector('.settings-pane.active');
        const r = pane.getBoundingClientRect();
        return {
          docScroll: document.documentElement.scrollHeight, inner: window.innerHeight,
          bodyScroll: body.scrollHeight, bodyClient: body.clientHeight,
          appScroll: app.scrollHeight,
          paneBottom: Math.round(r.bottom), paneRight: Math.round(r.right), innerWidth: window.innerWidth,
          // Clipped previews (overflow:hidden) may legitimately extend past the edge.
          overflowX: [...pane.querySelectorAll('*')].some(
            (el) => !el.closest('.term-out') && el.getBoundingClientRect().right > window.innerWidth + 1
          ),
        };
      })()`,
      true
    );
    const fits =
      m.bodyScroll <= m.bodyClient + 1 && m.docScroll <= m.inner + 1 && m.paneBottom <= m.inner && !m.overflowX;
    record(`tab "${tab}" fits without scrolling`, fits, JSON.stringify(m));
    await capture(popup, `settings-${tab}`);
  }

  // Prompt preset switch → config reaches main + the active shell prompt changes.
  await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab[data-tab="prompt"]').click();
     document.querySelector('.pe-preset[data-pe-preset="agnoster"]').click(); true`,
    true
  );
  await sleep(900);
  const applied = await win.webContents.executeJavaScript(
    `(async () => { const s = await window.myTerminal.getSettings(); return { preset: s.promptPresetId, cfgPreset: s.promptConfig?.preset, blocks: s.promptConfig?.blocks?.length }; })()`,
    true
  );
  record('preset click persists promptPresetId', applied.preset === 'agnoster' && applied.cfgPreset === 'agnoster', JSON.stringify(applied));
  await capture(popup, 'settings-prompt-agnoster');
  await capture(win, 'main-after-agnoster');

  // Quick option: two lines adds a second block; the advanced list shows it.
  await popup.webContents.executeJavaScript(
    `const tl = document.querySelector('[data-pe-two-lines]'); tl.checked = true; tl.dispatchEvent(new Event('change'));
     document.querySelector('.settings-tab[data-tab="promptEdit"]').click(); true`,
    true
  );
  await sleep(500);
  const blocks = await popup.webContents.executeJavaScript(`document.querySelectorAll('.pe-list-block').length`, true);
  record('two-lines toggle adds a block', blocks === 2, `blocks=${blocks}`);
  // Pick the second row (path) and change its foreground through the detail editor.
  await popup.webContents.executeJavaScript(
    `document.querySelector('[data-pe-row="0:1"]').click();
     const c = document.querySelector('[data-pe-color-text="foreground"]'); c.value = '#123456'; c.dispatchEvent(new Event('input')); true`,
    true
  );
  await sleep(600);
  const fg = await win.webContents.executeJavaScript(
    `(async () => { const s = await window.myTerminal.getSettings(); return s.promptConfig.blocks[0].segments[1].foreground; })()`,
    true
  );
  record('detail editor colour reaches settings', fg === '#123456', fg);
  await capture(popup, 'settings-promptEdit-edited');

  // Shell select present with a default marked.
  const shellInfo = await popup.webContents.executeJavaScript(
    `(() => { const s = document.getElementById('setting-shell'); return s ? { value: s.value, count: s.options.length } : null; })()`,
    true
  );
  record('command shell selector present', !!shellInfo && shellInfo.count >= 2, JSON.stringify(shellInfo));

  // Command shell: switch to PowerShell / Git Bash in the settings and run a line
  // through each — the shell's output comes back on the pty:data channel.
  const pm = require('../src/main/pty-manager');
  let captured = '';
  const origSend = win.webContents.send.bind(win.webContents);
  win.webContents.send = (channel, payload, ...rest) => {
    if (channel === 'pty:data' && payload?.data) captured += payload.data;
    return origSend(channel, payload, ...rest);
  };
  const sessionId = pm.getSessionInfo().sessions[0]?.sessionId;
  const runLine = async (line, expected, ms = 6000) => {
    captured = '';
    pm.writePty({ sessionId, data: `${line}\r` });
    const start = Date.now();
    while (Date.now() - start < ms && !captured.includes(expected) && !captured.includes('[exit')) await sleep(150);
    await sleep(300);
    return captured;
  };
  const shellIds = await popup.webContents.executeJavaScript(
    `[...document.getElementById('setting-shell').options].map((o) => o.value)`,
    true
  );
  // (echo is a MyShell built-in, so each line uses something only that shell has.)
  const trials = [
    ['powershell', 'Write-Output ("MYTERM_" + "OK")', 'MYTERM_OK'],
    ['gitbash', "printf 'MYTERM_%s' OK", 'MYTERM_OK'],
    ['cmd', 'ver', 'Microsoft Windows'],
  ].filter(([id]) => shellIds.includes(id));
  for (const [id, line, expected] of trials) {
    await popup.webContents.executeJavaScript(
      `{ const s = document.getElementById('setting-shell'); s.value = '${id}'; s.dispatchEvent(new Event('change')); } true`,
      true
    );
    await sleep(500);
    const current = pm.currentShell();
    record(`shell setting switches main to ${id}`, current.id === id, current.path);
    const out = await runLine(line, expected);
    record(`${id} runs a command line`, out.includes(expected), JSON.stringify(out.slice(-160)));
  }

  // Theme tab: pick Nord, override its accent on the colours tab, reset → Nord's own accent is back
  // while the Dark override made earlier survives.
  const getSettings = () => win.webContents.executeJavaScript(`window.myTerminal.getSettings()`, true);
  await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab[data-tab="colors"]').click();
     { const c = document.getElementById('color-accent'); c.value = '#ff0000'; c.dispatchEvent(new Event('input')); } true`,
    true
  );
  await sleep(400);
  let st = await getSettings();
  record('colour edit becomes an override of the current theme', st.themeId === 'dark' && st.themeOverrides?.dark?.accent === '#ff0000', JSON.stringify(st.themeOverrides));
  await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab[data-tab="theme"]').click();
     document.querySelector('.theme-card[data-theme-card="nord"]').click(); true`,
    true
  );
  await sleep(400);
  st = await getSettings();
  record('theme card applies the theme', st.themeId === 'nord' && st.custom?.accent === '#88c0d0', `${st.themeId} ${st.custom?.accent}`);
  await capture(popup, 'settings-theme');
  await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab[data-tab="colors"]').click();
     { const c = document.getElementById('color-accent'); c.value = '#00ff00'; c.dispatchEvent(new Event('input')); } true`,
    true
  );
  await sleep(400);
  st = await getSettings();
  record('per-theme overrides are kept apart', st.themeOverrides?.nord?.accent === '#00ff00' && st.themeOverrides?.dark?.accent === '#ff0000', JSON.stringify(st.themeOverrides));
  await popup.webContents.executeJavaScript(
    `[...document.querySelectorAll('#popup-footer .modal-btn')][0].click(); true`,
    true
  );
  await sleep(600);
  st = await getSettings();
  record('reset restores the current theme only', st.themeId === 'nord' && !st.themeOverrides?.nord && st.themeOverrides?.dark?.accent === '#ff0000' && st.custom?.accent === '#88c0d0', JSON.stringify(st.themeOverrides));
  const themeCount = await popup.webContents.executeJavaScript(`document.querySelectorAll('.theme-card').length`, true);
  const kinds = await popup.webContents.executeJavaScript(`[...document.querySelectorAll('.theme-grid')].map((g) => g.querySelectorAll('.theme-card').length)`, true);
  record('20 dark + 20 light themes', themeCount === 40 && kinds.join(',') === '20,20', `count=${themeCount} groups=${kinds.join(',')}`);

  // SSH tab: add a host, fill it, add another, delete the first.
  await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab[data-tab="ssh"]').click();
     document.querySelector('[data-ssh-add]').click();
     { const f = (k, v) => { const el = document.querySelector('[data-ssh-f="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
       f('name', 'Build box'); f('host', 'build.local'); f('port', '2222'); f('username', 'me'); }
     document.querySelector('[data-ssh-add]').click(); true`,
    true
  );
  await sleep(500);
  st = await getSettings();
  record('ssh profiles are saved', st.sshProfiles?.length === 2 && st.sshProfiles[0].name === 'Build box' && st.sshProfiles[0].port === 2222, JSON.stringify(st.sshProfiles));
  await capture(popup, 'settings-ssh');
  await popup.webContents.executeJavaScript(
    `document.querySelector('[data-ssh-row]').click(); document.querySelector('[data-ssh-remove]').click(); true`,
    true
  );
  await sleep(400);
  st = await getSettings();
  record('ssh profile deleted individually', st.sshProfiles?.length === 1 && st.sshProfiles[0].name !== 'Build box', JSON.stringify(st.sshProfiles));

  // Number fields: − / + buttons; scrollback steps by 100.
  const numInfo = await popup.webContents.executeJavaScript(
    `(() => {
      document.querySelector('.settings-tab[data-tab="general"]').click();
      const sb = document.getElementById('setting-scrollback');
      const wrap = sb.closest('.num-field');
      const before = Number(sb.value);
      wrap.querySelector('.num-btn-inc').click();
      const afterInc = Number(sb.value);
      wrap.querySelector('.num-btn-dec').click();
      return { wrapped: !!wrap, before, afterInc, afterDec: Number(sb.value), total: document.querySelectorAll('.num-field').length, bare: [...document.querySelectorAll('input[type="number"]')].filter((i) => !i.closest('.num-field')).length };
    })()`,
    true
  );
  record('number fields have − / + buttons (scrollback by 100)', numInfo.wrapped && numInfo.afterInc === numInfo.before + 100 && numInfo.afterDec === numInfo.before && numInfo.bare === 0, JSON.stringify(numInfo));

  // Terminal profiles: "From current" → set 100×30, 16 px → apply → the window is resized to fit.
  await popup.webContents.executeJavaScript(
    `document.querySelector('.settings-tab[data-tab="terminal"]').click();
     document.querySelector('[data-term-save-current]').click();
     { const f = (k, v) => { const el = document.querySelector('[data-term-f="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
       f('name', 'Wide'); f('cols', '140'); f('rows', '30'); f('fontSize', '16'); }
     true`,
    true
  );
  await sleep(400);
  await capture(popup, 'settings-terminal');
  await popup.webContents.executeJavaScript(`document.querySelector('[data-term-apply]').click(); true`, true);
  await sleep(1500);
  const applied2 = await win.webContents.executeJavaScript(
    `(async () => { const s = await window.myTerminal.getSettings(); const size = document.getElementById('status-size').textContent; return { profiles: s.terminalProfiles?.length, name: s.terminalProfiles?.[0]?.name, fontSize: s.fontSize, size }; })()`,
    true
  );
  record('terminal profile saved and applied', applied2.profiles === 1 && applied2.name === 'Wide' && applied2.fontSize === 16 && /^140×30$/.test(applied2.size), JSON.stringify(applied2));
  await capture(win, 'main-profile-applied');

  popup.close();
  await sleep(300);

  // Toolbar language button toggles immediately and shows the language badge.
  const before = await win.webContents.executeJavaScript(`document.querySelector('#lang-flag svg')?.getAttribute('class')`, true);
  await win.webContents.executeJavaScript(`document.getElementById('btn-lang').click(); true`, true);
  await sleep(400);
  const after = await win.webContents.executeJavaScript(
    `({ badge: document.querySelector('#lang-flag svg')?.getAttribute('class'), lang: document.documentElement.lang })`,
    true
  );
  // The flag is the *target* language: Korean UI shows the Union Jack, English UI shows 태극기.
  record('language button toggles the language', before !== after.badge && ['ko', 'en'].includes(after.lang) && after.badge === (after.lang === 'ko' ? 'flag-en' : 'flag-ko'), `${before} → ${after.badge} (${after.lang})`);
  await win.webContents.executeJavaScript(`document.getElementById('btn-lang').click(); true`, true);
  await sleep(300);

  // "+ ▾" on the tab bar: pick PowerShell → a new tab named after it.
  await win.webContents.executeJavaScript(`document.querySelector('[data-new-tab-menu]').click(); true`, true);
  await sleep(300);
  const menuItems = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('#shell-menu [data-shell]')].map((b) => b.dataset.shell)`,
    true
  );
  record('new-tab shell menu lists the shells', menuItems.includes('cmd') && menuItems.length >= 2, menuItems.join(','));
  await capture(win, 'main-shell-menu');
  await win.webContents.executeJavaScript(`document.querySelector('#shell-menu [data-shell="powershell"]').click(); true`, true);
  await sleep(1200);
  const tabInfo = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.tab-item[data-tab-id]')].map((b) => b.querySelector('.tab-label').textContent)`,
    true
  );
  record('tabs are named after their shell', tabInfo.some((t) => /^PowerShell \d+$/.test(t)) && tabInfo.some((t) => /^cmd \d+$/.test(t)), tabInfo.join(' | '));
  const sessions = pm.getSessionInfo().sessions;
  const psSession = sessions[sessions.length - 1]?.sessionId;
  captured = '';
  pm.writePty({ sessionId: psSession, data: 'Write-Output ("PS_" + "TAB")\r' });
  for (let i = 0; i < 40 && !captured.includes('PS_TAB'); i += 1) await sleep(150);
  record('the new tab runs PowerShell', captured.includes('PS_TAB'), JSON.stringify(captured.slice(-80)));
  await capture(win, 'main-powershell-tab');

  // Tab strip overflow: many tabs → ◀ ▶ appear on the right and scroll the strip.
  for (let i = 0; i < 14; i += 1) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-new-tab]').click(); true`, true);
    await sleep(150);
  }
  await sleep(1200);
  const strip = await win.webContents.executeJavaScript(
    `(() => { const bar = document.getElementById('tab-bar'); const box = document.getElementById('tab-scroll');
       return { tabs: document.querySelectorAll('.tab-item[data-tab-id]').length, overflow: bar.scrollWidth > bar.clientWidth, visible: !box.hidden, rightEnabled: !document.getElementById('tab-scroll-right').disabled }; })()`,
    true
  );
  record('tab strip shows scroll buttons when tabs overflow', strip.overflow && strip.visible, JSON.stringify(strip));
  await capture(win, 'main-many-tabs');
  const scrolled = await win.webContents.executeJavaScript(
    `(async () => { const bar = document.getElementById('tab-bar'); bar.scrollLeft = 0; const before = bar.scrollLeft;
       document.getElementById('tab-scroll-right').click(); await new Promise((r) => setTimeout(r, 700)); return { before, after: bar.scrollLeft }; })()`,
    true
  );
  record('right scroll button scrolls the tabs', scrolled.after > scrolled.before, JSON.stringify(scrolled));
  const sizeAfterTabs = await win.webContents.executeJavaScript(`document.getElementById('status-size').textContent`, true);
  void sizeAfterTabs;
  // close the extra tabs so the rest of the run stays quick
  for (let i = 0; i < 14; i += 1) {
    await win.webContents.executeJavaScript(`(() => { const t = [...document.querySelectorAll('.tab-item[data-tab-id]')].pop(); t?.querySelector('.tab-close')?.click(); return true; })()`, true);
    await sleep(120);
  }
  await sleep(500);

  // Error dialog: an uncaught renderer error opens a popup with the details; Copy puts them on the clipboard.
  const { clipboard } = require('electron');
  clipboard.writeText('');
  await win.webContents.executeJavaScript(`setTimeout(() => { throw new Error('SMOKE_ERROR boom'); }, 0); true`, true);
  const errPopup = await waitFor(
    () => BrowserWindow.getAllWindows().find((w) => popupOf(w) && !w.isDestroyed() && w.isVisible()),
    { label: 'error popup', timeout: 8000 }
  );
  await sleep(500);
  const errInfo = await errPopup.webContents.executeJavaScript(
    `({ title: document.title, text: document.getElementById('error-details')?.value || '', buttons: [...document.querySelectorAll('#popup-footer .modal-btn')].length })`,
    true
  );
  record('error popup shows the details', /SMOKE_ERROR boom/.test(errInfo.text) && /at /.test(errInfo.text) && errInfo.buttons === 2, JSON.stringify({ title: errInfo.title, head: errInfo.text.slice(0, 60) }));
  await capture(errPopup, 'error-dialog');
  await errPopup.webContents.executeJavaScript(`document.querySelectorAll('#popup-footer .modal-btn')[0].click(); true`, true);
  await sleep(400);
  record('error popup copies the details', clipboard.readText().includes('SMOKE_ERROR boom'), clipboard.readText().slice(0, 60));
  errPopup.close();
  await sleep(300);
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (err) {
    record('smoke run', false, String(err?.stack || err));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  setTimeout(() => app.exit(failed ? 1 : 0), 200);
});

// Boot the real app (after our hooks are registered).
require('../src/main/main.js');
