// Smoke test: launches the desktop program (npm run build:debug first — it runs
// src-tauri/target/test/debug — or
// --release for src-tauri/target/release) with a private profile
// (.smoke/profile, MFS_USER_DATA) whose settings share .smoke/share, drives
// the page over the Chrome DevTools Protocol of its WebView2 through
// window.__mfs (start the server, connect real FTP / FTPS / SFTP clients,
// open dialogs, the start page…), screenshots into .smoke/<scenario>.png and
// quits; then checks that quitting stopped the servers (the Node host is
// gone). The web version is checked the same way: server/server.js plus a
// headless Edge / Chrome on its page (fetch transport, polling).
//
//   npm run build:debug && npm run smoke            # desktop + web, default scenarios
//   npm run smoke -- --scenario running             # one scenario (desktop)
//   npm run smoke -- --scenario running --web       # the same in the web version
//   npm run smoke -- --scenario all                 # every scenario (desktop)
//   npm run smoke -- --desktop-only | --web-only | --release
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import { freeDevPort } from './dev-port.mjs';
import { ANIMATION_KINDS } from '../src/lib/startBackground.js';

const require = createRequire(import.meta.url);
const { writeSelfSigned } = require('../core/x509');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const smokeDir = path.join(root, '.smoke');
const profile = path.join(smokeDir, 'profile');
const shareDir = path.join(smokeDir, 'share');
const docsDir = path.join(smokeDir, 'docs');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const exeName = process.platform === 'win32' ? 'MyFTPServer.exe' : 'MyFTPServer';
const exe = path.join(root, 'src-tauri', 'target', ...(args.includes('--release') ? ['release'] : ['test', 'debug']), exeName);

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[smoke] dist/ missing — run `npm run build:debug` first.');
  process.exit(1);
}

const FTP_PORT = 2121, FTPS_PORT = 2990, SFTP_PORT = 2222;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fixtures ──
function seed(sessionPatch = {}) {
  fs.rmSync(shareDir, { recursive: true, force: true });
  fs.rmSync(docsDir, { recursive: true, force: true });
  // WebView2's helper processes let go of the profile a moment after the program exits.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
  fs.mkdirSync(path.join(shareDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(docsDir, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(shareDir, 'welcome.txt'), 'welcome to my ftp server');
  fs.writeFileSync(path.join(shareDir, 'images', 'logo.png'), Buffer.alloc(80_000, 3));
  fs.writeFileSync(path.join(shareDir, 'video.mp4'), Buffer.alloc(2_000_000, 4));
  fs.writeFileSync(path.join(docsDir, 'plan.md'), '# plan');
  fs.writeFileSync(path.join(docsDir, 'notes', 'a.txt'), 'a');
  fs.mkdirSync(profile, { recursive: true });
  const cert = writeSelfSigned(path.join(profile, 'server_cert.pem'), { commonName: '127.0.0.1', validityYears: 1 });
  // The server view unless a scenario asks for the start page.
  fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({ language: opt('lang') || 'ko', theme: opt('theme') || 'midnight', lastProfile: 'Smoke', showStartOnLaunch: false, ...sessionPatch }, null, 2));
  const settings = {
    sharedFolders: [{ virtualName: 'data', physicalPath: shareDir }, { virtualName: 'docs', physicalPath: docsDir }],
    protocols: { enableFtp: true, enableFtps: true, enableSftp: true, ftpPort: FTP_PORT, ftpsPort: FTPS_PORT, sftpPort: SFTP_PORT, explicitTls: true },
    certPath: cert.certPath,
    allowAnonymous: true,
    users: [{ username: 'bob', password: 'secret', canRead: true, canWrite: true }, { username: 'viewer', password: 'ro', canRead: true, canWrite: false }],
    bufferSizeKb: 64, maxConnections: 10,
  };
  fs.writeFileSync(path.join(profile, 'server_settings.json'), JSON.stringify(settings, null, 2));
  fs.mkdirSync(path.join(profile, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'profiles', 'Smoke.json'), JSON.stringify(settings, null, 2));
  fs.writeFileSync(path.join(profile, 'profiles', 'Office.json'), JSON.stringify({ ...settings, protocols: { ...settings.protocols, enableSftp: false } }, null, 2));
}

// ── Page scripts (run inside the page; `window.__mfs` is the hook) ──
const BOOT = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  await until(() => window.__mfs && window.__mfs.state.settings);
`;
const START = `${BOOT}
  await window.__mfs.start();
  await until(() => window.__mfs.state.server.running);
`;
// A failed check: the scenario throws, the runner reports it.
const CHECK = 'const check = (ok, what) => { if (!ok) throw new Error("check failed: " + what); };';

const SCENARIOS = {
  main: `(async () => { ${BOOT} await wait(300); return JSON.stringify({ shares: window.__mfs.state.settings.sharedFolders.length, users: window.__mfs.state.settings.users.length, profiles: window.__mfs.state.profiles, host: window.__mfs.state.info.host, version: window.__mfs.state.info.version, title: document.title }); })()`,
  running: `(async () => { ${START} await wait(400); return JSON.stringify({ protocols: window.__mfs.state.server.protocols, log: window.__mfs.state.log.filter((l) => l.level !== 'trace').slice(-6).map((l) => l.text) }); })()`,
  // The smoke runner connects real clients while this waits; the counters must move.
  transfer: `(async () => { ${START} await until(() => window.__mfs.state.stats.uploads >= 1 && window.__mfs.state.stats.downloads >= 1, 40000); await wait(300); return JSON.stringify(window.__mfs.state.stats); })()`,
  share_dialog: `(async () => { ${BOOT} window.__mfs.addShare(); await until(() => document.querySelector('.dlg')); return 'share dialog'; })()`,
  user_dialog: `(async () => { ${BOOT} window.__mfs.addUser(); await until(() => document.querySelector('.dlg')); return 'user dialog'; })()`,
  cert_dialog: `(async () => { ${BOOT} window.__mfs.generateCert(); await until(() => document.querySelector('.dlg')); return 'cert dialog'; })()`,
  cert_generated: `(async () => { ${BOOT} ${CHECK} const before = window.__mfs.state.settings.certPath; window.__mfs.generateCert(); await until(() => document.querySelector('.dlg')); document.querySelector('.dlg .btn.primary').click(); await until(() => window.__mfs.state.certInfo && window.__mfs.state.settings.certPath && document.querySelectorAll('.dlg').length === 1 && !document.querySelector('.dlg input'), 20000); await wait(600); check(window.__mfs.state.certInfo && !window.__mfs.state.certInfo.error, 'certificate readable'); return JSON.stringify({ before, cert: window.__mfs.state.settings.certPath, info: window.__mfs.state.certInfo }); })()`,
  hostkey: `(async () => { ${BOOT} ${CHECK} window.__mfs.generateHostKey(); await until(() => document.querySelector('.dlg')); const confirm = document.querySelector('.dlg .btn.primary, .dlg .btn.danger'); if (confirm && /덮어|overwrite/i.test(document.querySelector('.dlg').textContent)) confirm.click(); await until(() => window.__mfs.state.hostKey && window.__mfs.state.hostKey.fingerprint, 30000); await wait(300); return JSON.stringify(window.__mfs.state.hostKey); })()`,
  error: `(async () => { ${BOOT} window.__mfs.updateSettings({ sharedFolders: [] }); await wait(100); window.__mfs.start(); await until(() => document.querySelector('.dlg.error')); return 'settings error dialog'; })()`,
  port_error: `(async () => { ${BOOT} window.__mfs.updateSettings({ protocols: { ...window.__mfs.state.settings.protocols, enableSftp: true, sftpPort: ${FTP_PORT} } }); await wait(100); window.__mfs.start(); await until(() => document.querySelector('.dlg.error')); return 'port clash dialog'; })()`,
  // Width bookkeeping: the strips' minimum must not change when the server starts.
  minsize: `(async () => { ${BOOT} ${CHECK} await wait(800); const snap = () => [document.documentElement.style.getPropertyValue('--app-min-width'), window.innerWidth, window.innerHeight, window.__mfsNeeds]; const a = snap(); await window.__mfs.start(); await wait(1200); const b = snap(); window.__mfs.action('toggleLanguage'); await wait(700); const c = snap(); window.__mfs.action('toggleLanguage'); await wait(700); const d = snap(); check(a[0] === b[0] && b[0] === c[0] && c[0] === d[0], 'min width stable: ' + [a[0], b[0], c[0], d[0]]); check(window.innerWidth >= parseFloat(a[0]), 'window not narrower than its minimum'); return JSON.stringify({ stopped: a, running: b, otherLang: c, back: d }); })()`,
  addresses: `(async () => { ${START} document.querySelectorAll('.bp-tab')[1].click(); await wait(200); return JSON.stringify({ rows: document.querySelectorAll('.addr-table tbody tr').length }); })()`,
  addresses_delete: `(async () => { ${START} document.querySelectorAll('.bp-tab')[1].click(); await wait(200); const before = document.querySelectorAll('.addr-table tbody tr').length; document.querySelector('.addr-table .icon-btn.danger').click(); await wait(200); const after = document.querySelectorAll('.addr-table tbody tr').length; document.querySelectorAll('.addr-hint .tb-btn')[1].click(); await wait(200); const none = document.querySelectorAll('.addr-table tbody tr.addr-row').length; const session = window.__mfs.state.session.hiddenAddresses.length; document.querySelectorAll('.addr-hint .tb-btn')[2].click(); await wait(200); const restored = document.querySelectorAll('.addr-table tbody tr').length; return JSON.stringify({ before, after, none, restored, session }); })()`,
  tree: `(async () => { ${BOOT} await wait(300); const rows = () => document.querySelectorAll('.tree-row:not(.info)').length; const a = rows(); document.querySelectorAll('.tree-row')[1].querySelector('.tree-chevron').click(); await until(() => rows() > a, 5000); const b = rows(); document.querySelectorAll('.tree-row')[2].querySelector('.tree-chevron').click(); await wait(400); document.querySelector('.tree-toggle').click(); await wait(150); const collapsed = !document.querySelector('.tree-panel'); document.querySelector('.tb-tree').click(); await wait(150); return JSON.stringify({ before: a, after: b, collapsed, restored: !!document.querySelector('.tree-panel') }); })()`,
  tree_open: `(async () => { ${BOOT} await wait(300); const rows = () => document.querySelectorAll('.tree-row:not(.info)').length; const a = rows(); document.querySelectorAll('.tree-row')[1].querySelector('.tree-chevron').click(); await until(() => rows() > a, 5000); document.querySelectorAll('.tree-row')[2].querySelector('.tree-chevron').click(); await wait(400); document.querySelectorAll('.tree-row')[1].click(); return JSON.stringify({ rows: rows() }); })()`,
  // Settings and About are windows of their own (WINDOWS): the main page only opens them.
  about: `(async () => { ${BOOT} ${CHECK} await wait(1000); window.__mfs.action('about'); await wait(800); check(!document.querySelector('.dlg'), 'not drawn inside the main window'); return 'about window opened'; })()`,
  settings: `(async () => { ${BOOT} ${CHECK} await wait(1000); window.__mfs.action('settings'); await wait(800); check(!document.querySelector('.dlg'), 'not drawn inside the main window'); return 'settings window opened'; })()`,
  settings_behavior: `(async () => { ${BOOT} await wait(1000); window.__mfs.action('settings'); await wait(800); return 'settings window opened'; })()`,
  // The theme dropdown: on the desktop a window of its own (checked in MENU).
  themes: `(async () => { ${BOOT}
    await wait(1000);   // the window is on screen (shown after the first paint)
    document.querySelector('.tb-split-caret').click();
    await wait(1200);
    return 'theme dropdown opened';
  })()`,
  // "+ 사용자 정의 테마": the settings window on its theme tab with a copy of the current theme.
  settings_theme: `(async () => { ${BOOT} await wait(1000); window.__mfs.action('newCustomTheme'); await wait(800); return 'settings window (theme tab) opened'; })()`,
  custom_theme_saved: `(async () => { ${BOOT} await wait(1000); window.__mfs.action('newCustomTheme'); await wait(800); return 'settings window (theme tab) opened'; })()`,
  // 사용법 on the start page opens the user guide window (checked in desktopShot).
  manual: `(async () => { ${BOOT} ${CHECK}
    await until(() => document.querySelector('.start-page'));
    const btn = [...document.querySelectorAll('.start-hero .sp-btn')].find((b) => /사용법|User guide/.test(b.textContent));
    check(btn, 'user guide button on the start page');
    btn.click();
    await wait(1500);
    return 'user guide opened';
  })()`,
  light_en: `(async () => { ${BOOT} window.__mfs.action('theme:daylight'); window.__mfs.action('toggleLanguage'); await wait(200); await window.__mfs.start(); await until(() => window.__mfs.state.server.running); await wait(300); return 'light/en'; })()`,
  theme_nord: `(async () => { ${BOOT} window.__mfs.action('theme:nord'); await wait(300); return 'nord'; })()`,
  picker: `(async () => { ${BOOT} window.__mfs.dialogs.path({ mode: 'folder', start: ${JSON.stringify(smokeDir)} }); await until(() => document.querySelector('.picker-item')); await wait(300); return 'picker'; })()`,
  // ── Start page ──
  start_page: `(async () => { ${BOOT} ${CHECK}
    await until(() => document.querySelector('.start-page'));
    await wait(700);
    const cards = [...document.querySelectorAll('.start-card')].map((c) => c.dataset.card);
    check(cards.length === 8, 'eight cards: ' + cards);
    const bg = window.__mfsStartBg; const t0 = bg.time; await wait(500); check(bg.time > t0, 'background animates');
    check(document.querySelector('.server-view').hasAttribute('inert'), 'server view inert under the start page');
    const board = document.querySelector('.start-board').getBoundingClientRect();
    for (const c of document.querySelectorAll('.start-card')) { const r = c.getBoundingClientRect(); check(r.left >= board.left - 1 && r.right <= board.right + 1, 'card inside the board: ' + c.dataset.card); }
    check(document.querySelectorAll('.sp-proto').length === 3, 'three protocol rows');
    check(document.querySelectorAll('.start-shares .start-row').length === 2, 'two shares');
    check(document.querySelectorAll('.start-profiles .start-row').length === 2, 'two profiles');
    check(document.querySelectorAll('.start-addresses .start-row').length >= 3, 'addresses listed');
    const bar = [...document.querySelector('.toolbar').children];
    check(bar.indexOf(document.querySelector('.tb-start')) < bar.indexOf(document.querySelector('.tb-profile')), 'home button left of the profile');
    // 섞기 간격: label, then − value초 + on the same line, the value centred.
    const sh = document.querySelector('.start-shuffle');
    check(sh.children[1].getBoundingClientRect().height < 24, 'shuffle label on one line');
    const nf = sh.querySelector('.numfield');
    const [minus, mid, plus] = nf.children;
    check(minus.classList.contains('num-btn') && mid.classList.contains('num-mid') && plus.classList.contains('num-btn'), '− value +');
    check(/초/.test(mid.textContent), 'value in seconds');
    const nr = nf.getBoundingClientRect(); const lr = sh.children[1].getBoundingClientRect();
    check(Math.abs((nr.top + nr.bottom) / 2 - (lr.top + lr.bottom) / 2) < 6, 'value on the label line');
    const mr = mid.getBoundingClientRect(); const ir = mid.firstChild.getBoundingClientRect(); const ur = mid.lastChild.getBoundingClientRect();
    check(Math.abs((ir.left + ur.right) / 2 - (mr.left + mr.right) / 2) < 3, 'value centred');
    plus.click();
    await until(() => (window.__mfs.state.session.startBackground || {}).shuffleSec === 5);
    minus.click();
    await until(() => (window.__mfs.state.session.startBackground || {}).shuffleSec === 0);
    check(document.querySelectorAll('.bg-kind[data-kind]').length === 21, '21 backgrounds');
    return JSON.stringify({ cards, kind: bg.kind });
  })()`,
  start_page_run: `(async () => { ${BOOT} ${CHECK}
    await until(() => document.querySelector('.start-page'));
    document.querySelector('.bg-kind[data-kind="radar"]').click();
    await until(() => window.__mfs.state.session.startBackground && window.__mfs.state.session.startBackground.kind === 'radar');
    check(window.__mfsStartBg.kind === 'radar', 'engine switched to radar');
    document.querySelector('.start-hero .sp-btn.primary').click();
    await until(() => window.__mfs.state.server.running, 15000);
    await until(() => document.querySelectorAll('.sp-proto.live').length === 3, 5000);
    check(document.querySelector('.start-hero .sp-btn.danger'), 'hero shows Stop while running');
    check(document.querySelector('.template-tile[data-action="addShare"]').disabled, 'add share locked while running');
    check(!document.querySelector('.template-tile[data-action="saveLog"]').disabled, 'save log stays available');
    await wait(500);
    return JSON.stringify({ live: document.querySelectorAll('.sp-proto.live').length, saved: window.__mfs.state.session.startBackground.kind });
  })()`,
  start_page_switch: `(async () => { ${BOOT} ${CHECK}
    await until(() => document.querySelector('.start-page'));
    await until(() => document.documentElement.style.getPropertyValue('--app-min-width'));
    await wait(400);
    const widthBefore = document.documentElement.style.getPropertyValue('--app-min-width');
    document.querySelector('.tb-start').click();
    await until(() => !document.querySelector('.start-page'));
    check(!document.querySelector('.server-view').hasAttribute('inert'), 'server view live again');
    const widthAfter = document.documentElement.style.getPropertyValue('--app-min-width'); check(widthAfter === widthBefore, 'switching keeps the minimum width: ' + widthBefore + ' → ' + widthAfter);
    document.querySelector('.tb-start').click();
    await until(() => document.querySelector('.start-page'));
    document.querySelector('.start-tools .sp-btn:last-child').click();
    await until(() => !document.querySelector('.start-page'));
    document.querySelector('.tb-start').click();
    await until(() => document.querySelector('.start-page'));
    document.querySelector('.start-foot input[type=checkbox]').click();
    await until(() => window.__mfs.state.session.showStartOnLaunch === false);
    document.querySelector('.template-tile[data-action="addUser"]').click();
    await until(() => document.querySelector('.dlg'));
    await wait(300);
    return 'start page ⇄ server view, show-on-launch off, add-user dialog from a tile';
  })()`,
  start_page_arrange: `(async () => { ${BOOT} ${CHECK}
    await until(() => document.querySelector('.start-page'));
    await wait(500);
    const handle = document.querySelector('[data-card="side"] .card-handle');
    handle.focus();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    await until(() => window.__mfs.state.session.startBackground && window.__mfs.state.session.startBackground.layout);
    const layout = window.__mfs.state.session.startBackground.layout;
    check(layout.version === 2 && layout.cards.side, 'layout saved');
    document.querySelector('.start-tools .sp-btn').click();
    await wait(400);
    return JSON.stringify(layout.cards.side);
  })()`,
  start_page_en_light: `(async () => { ${BOOT} await until(() => document.querySelector('.start-page')); window.__mfs.action('theme:daylight'); window.__mfs.action('toggleLanguage'); document.querySelector('.bg-kind[data-kind="globe"]').click(); await wait(900); return 'start page en / light / globe'; })()`,
};

// Scenario → session patch for its seed (the start page shows only when asked).
const SEED = { start_page: { showStartOnLaunch: true }, start_page_run: { showStartOnLaunch: true }, start_page_switch: { showStartOnLaunch: true }, start_page_arrange: { showStartOnLaunch: true }, start_page_en_light: { showStartOnLaunch: true }, manual: { showStartOnLaunch: true } };
// Every kind, one screenshot each (--scenario backgrounds).
const BG_KINDS = ANIMATION_KINDS;

// The program's other windows (desktop): after the scenario, each step finds
// the next new window, runs `check` there (and screenshots it), `pick`s
// something in it (it may close), then runs `after` in the main window.
const WIN_LIB = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  const check = (ok, what) => { if (!ok) throw new Error('check failed: ' + what); };
`;
const MENU_LIB = `${WIN_LIB}
  await until(() => document.querySelector('.theme-menu'));
  await wait(400);
  const pop = document.querySelector('.theme-menu');
`;
// A dialog window: the dialog fills it, the title bar is its only frame.
const DLG_LIB = `${WIN_LIB}
  await until(() => document.querySelector('.dlg'));
  await wait(400);
  const dlg = document.querySelector('.dlg');
  check(document.documentElement.classList.contains('dialog-window'), 'a dialog window');
  check(Math.abs(dlg.getBoundingClientRect().width - innerWidth) < 2, 'the dialog fills its window');
  check(dlg.querySelector('.dlg-title'), 'title bar to move it by');
`;
const MAIN_ACCENT = `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`;
const SET_ACCENT = `const accent = document.querySelectorAll('.custom-color input.mono')[9];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(accent, '#ff3366');
      accent.dispatchEvent(new Event('input', { bubbles: true }));
      await until(() => ${MAIN_ACCENT} === '#ff3366');`;
const WINDOWS = {
  // 사용자 정의 테마 + 설정 on top; dark (two columns of ten, top to bottom) with
  // light under it — two columns in all, one-line items, the whole menu shown.
  themes: [{
    check: `(async () => { ${MENU_LIB}
      check(pop.classList.contains('ctx-menu'), 'an ordinary dropdown menu');
      const top = pop.firstElementChild;
      check(top.classList.contains('theme-menu-top') && top.querySelector('.theme-new-custom') && top.querySelector('.theme-open-settings'), 'custom theme and settings items on top');
      const groups = [...pop.querySelectorAll('.theme-group')];
      check(groups.map((g) => g.dataset.mode).join() === 'dark,light', 'dark first, then light');
      check(groups[0].getBoundingClientRect().bottom <= groups[1].getBoundingClientRect().top + 1, 'light under dark');
      const all = [...pop.querySelectorAll('.theme-modes .theme-item')];
      check(new Set(all.map((c) => Math.round(c.getBoundingClientRect().left))).size === 2, 'two columns in all');
      for (const g of groups) {
        const items = [...g.querySelectorAll('.theme-item')];
        check(items.length === 20, g.dataset.mode + ': 20 themes');
        const first = items.slice(0, 10).map((c) => c.getBoundingClientRect());
        const second = items.slice(10).map((c) => c.getBoundingClientRect());
        check(first.every((r, i) => !i || (Math.round(r.left) === Math.round(first[0].left) && r.top > first[i - 1].top)), g.dataset.mode + ': first ten down the left column');
        check(second.every((r) => r.left > first[0].left), g.dataset.mode + ': next ten in the right column');
        check(items.every((c) => c.getBoundingClientRect().height < 34 && c.querySelector('.theme-swatch')), g.dataset.mode + ': one-line items with a swatch');
      }
      const r = pop.getBoundingClientRect();
      check(r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, 'the whole menu is shown: ' + [r.width, r.height, innerWidth, innerHeight]);
      return JSON.stringify({ menu: [Math.round(r.width), Math.round(r.height)], at: [screenX, screenY] });
    })()`,
    pick: `document.querySelector('.theme-group[data-mode="light"] .theme-item').click()`,
    after: `(async () => { ${BOOT} await until(() => document.documentElement.dataset.mode === 'light'); return 'light theme picked from the dropdown'; })()`,
  }],
  settings: [{
    check: `(async () => { ${DLG_LIB}
      check(document.querySelectorAll('.settings-tab').length === 3, 'three tabs');
      const langs = [...document.querySelectorAll('.set-lang-btn')];
      check(langs.length === 2 && langs[0].querySelector('.flag-kr') && langs[1].querySelector('.flag-gb'), 'language choices with flags');
      check(langs.find((b) => b.classList.contains('on')).dataset.lang === 'ko', 'the current language is marked');
      check(Math.abs(innerHeight - dlg.getBoundingClientRect().height) < 2, 'fixed-size window, dialog fills it');
      return JSON.stringify({ window: [innerWidth, innerHeight], at: [screenX, screenY] });
    })()`,
    dragOut: true,
  }],
  settings_behavior: [{
    check: `(async () => { ${DLG_LIB}
      document.querySelector('.settings-tab[data-tab="behavior"]').click();
      await wait(150);
      const opts = [...document.querySelectorAll('.set-option')];
      check(opts.length === 5, 'five behaviour options');
      check(opts.every((o) => !o.classList.contains('disabled')), 'tray option enabled on the desktop');
      const pane = document.querySelector('.settings-pane');
      check(pane.scrollHeight <= pane.clientHeight + 1, 'behaviour tab fits without scrolling');
      return 'settings / behaviour tab';
    })()`,
  }],
  // A copy of the current theme, previewed in both windows; Cancel undoes it in the main one.
  settings_theme: [{
    check: `(async () => { ${DLG_LIB}
      check(document.querySelector('.settings-tab.active').dataset.tab === 'theme', 'opens on the theme tab');
      const name = document.querySelector('.custom-theme-head input');
      check(name.value.length > 0 && !name.disabled, 'a new custom theme is being edited');
      ${SET_ACCENT}
      check(document.querySelectorAll('.settings-themes .theme-group[data-mode] .theme-item').length === 40, '40 built-in themes');
      check(document.querySelectorAll('.custom-theme .theme-item').length === 1, 'the custom theme on top');
      const pane = document.querySelector('.settings-themes');
      check(pane.scrollHeight <= pane.clientHeight + 1, 'theme tab fits without scrolling');
      await wait(200);
      return 'custom theme previewed in the settings window';
    })()`,
    after: `(async () => { ${BOOT} await until(() => ${MAIN_ACCENT} === '#ff3366'); return 'the main window previews it too'; })()`,
  }, {
    // The same window again (the previous step left it open): Cancel.
    same: true,
    check: `(async () => { ${DLG_LIB} return 'cancel'; })()`,
    pick: `(() => { const b = [...document.querySelectorAll('.dlg-footer .btn')]; b[b.indexOf(document.querySelector('.dlg-footer .btn.primary')) - 1].click(); })()`,
    after: `(async () => { ${BOOT} await until(() => ${MAIN_ACCENT} === '#4cc9f0' && !(window.__mfs.state.session.customThemes || []).length); return 'Cancel put the main window back'; })()`,
  }],
  // Saved: stored in the session, then listed on top of the dropdown and applied from there.
  custom_theme_saved: [{
    check: `(async () => { ${DLG_LIB} ${SET_ACCENT} return 'custom theme edited'; })()`,
    pick: `document.querySelector('.dlg .btn.primary').click()`,
    after: `(async () => { ${BOOT} ${CHECK}
      await until(() => (window.__mfs.state.session.customThemes || []).length === 1);
      check(window.__mfs.state.session.theme === window.__mfs.state.session.customThemes[0].id, 'the custom theme is the current one');
      window.__mfs.action('theme:nord');
      await until(() => document.documentElement.dataset.theme === 'nord');
      await wait(300);
      document.querySelector('.tb-split-caret').click();
      await wait(1200);
      return 'saved; dropdown opened';
    })()`,
  }, {
    check: `(async () => { ${MENU_LIB}
      const item = pop.querySelector('.theme-list.custom .theme-item');
      check(item && /^custom-/.test(item.dataset.themeId), 'custom theme listed on top');
      check(item.getBoundingClientRect().top < pop.querySelector('.theme-modes').getBoundingClientRect().top, 'above the built-in themes');
      return item.dataset.themeId;
    })()`,
    pick: `document.querySelector('.theme-list.custom .theme-item').click()`,
    after: `(async () => { ${BOOT} await until(() => /^custom-/.test(document.documentElement.dataset.theme) && ${MAIN_ACCENT} === '#ff3366'); return 'custom theme applied from the dropdown'; })()`,
  }],
  about: [{
    check: `(async () => { ${DLG_LIB}
      check(/Tauri/.test(dlg.textContent), 'About names the Tauri host');
      const body = dlg.querySelector('.dlg-body');
      check(body.scrollWidth <= body.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth, 'no sideways scrolling');
      check(Math.abs(innerHeight - dlg.getBoundingClientRect().height) < 3, 'window fitted to the dialog: ' + [innerHeight, dlg.getBoundingClientRect().height]);
      return JSON.stringify({ window: [innerWidth, innerHeight] });
    })()`,
    dragOut: true,
    pick: `document.querySelector('.dlg-footer .btn').click()`,
    after: `(async () => { ${BOOT} await wait(300); return 'about closed'; })()`,
  }],
};

// Drags a dialog window by its title bar with the real mouse (scripts/os-drag.ps1)
// until it sits past the main window's right edge, and checks it got there.
const WIN_OBJ = `({ x: screenX, y: screenY, w: outerWidth, h: outerHeight, dpr: devicePixelRatio })`;
const WIN_GEOMETRY = `JSON.stringify(${WIN_OBJ})`;
async function dragOut(main, dlg, pid) {
  if (process.platform !== 'win32') return 'drag skipped (Windows only)';
  const m = JSON.parse(await main.evaluate(WIN_GEOMETRY));
  const before = JSON.parse(await dlg.evaluate(`(() => { const t = document.querySelector('.dlg-title').getBoundingClientRect(); const hit = document.elementFromPoint(t.left + 60, t.top + t.height / 2); return JSON.stringify({ ...${WIN_OBJ}, tx: t.left + 60, ty: t.top + t.height / 2, hit: hit ? hit.tagName + '.' + hit.className + ' ' + getComputedStyle(hit).webkitAppRegion : 'none', focus: document.hasFocus(), title: document.title }); })()`));
  const dx = Math.round(m.x + m.w + 30 - before.x);
  const dpr = before.dpr;
  const x = Math.round((before.x + before.tx) * dpr);
  const y = Math.round((before.y + before.ty) * dpr);
  const under = execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'os-drag.ps1'), `-X:${x}`, `-Y:${y}`, `-DX:${Math.round(dx * dpr)}`, '-DY:0', `-ProcessId:${pid}`, '-Title', before.title], { encoding: 'utf8' }).trim();
  if (/^blocked/.test(under)) throw new Error(`no drag (nothing pressed): ${under}`);
  await wait(400);
  const after = JSON.parse(await dlg.evaluate(`JSON.stringify({ ...${WIN_OBJ}, presses: window.__mfsPresses || 0 })`));
  const moved = after.x - before.x;
  // (Crossing onto another monitor may shift it a little.)
  if (moved < dx / 2) throw new Error(`the dialog did not follow the mouse: moved ${moved}px of ${dx}px (pressed at ${x},${y} on ${before.hit}, focused ${before.focus}, page saw ${after.presses} press(es), dpr ${dpr}, ${under})`);
  if (after.x + after.w <= m.x + m.w + 100) throw new Error(`the dialog did not get out of the main window: right ${after.x + after.w}, main right ${m.x + m.w}`);
  return `dragged by its title bar ${moved}px, out past the main window (dialog ${after.x}–${after.x + after.w}, main right ${m.x + m.w})`;
}

/** A page target of the program not in `seen` (and not the user guide). */
async function otherPage(port, seen, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((x) => x.type === 'page' && !seen.includes(x.webSocketDebuggerUrl) && /tauri\.localhost|^tauri:/.test(x.url) && !/\/doc\//.test(x.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await wait(250);
  }
  throw new Error('no second window');
}

// The user guide window (doc/index.html, its own CDP page target): the
// header's language and text-size controls, every picture loaded.
const DOC_CHECK = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  const check = (ok, what) => { if (!ok) throw new Error('check failed: ' + what); };
  await until(() => document.body.classList.contains('ready'));
  const imgs = [...document.querySelectorAll('main img')];
  await until(() => imgs.every((i) => i.complete), 10000);
  const broken = imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src'));
  check(!broken.length, 'pictures load: ' + broken);
  check(document.querySelectorAll('.lang-group button').length === 2, 'language buttons');
  const now = document.getElementById('size-now');
  check(now.textContent === '13px', '13px by default: ' + now.textContent);
  check(getComputedStyle(now).justifyContent === 'center', 'size centred');
  const [down, up] = [document.getElementById('size-down'), document.getElementById('size-up')];
  check(down.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING && now.compareDocumentPosition(up) & Node.DOCUMENT_POSITION_FOLLOWING, '− 13px + order');
  up.click(); check(now.textContent === '14px', '+ makes 14px'); down.click(); check(now.textContent === '13px', '− back to 13px');
  document.querySelector('.lang-group button[data-lang="en"]').click(); check(document.body.classList.contains('en') && /User Guide/.test(document.title), 'English');
  document.querySelector('.lang-group button[data-lang="ko"]').click(); check(document.body.classList.contains('ko'), 'Korean');
  check(document.body.classList.contains('desktop') === !!window.__TAURI__, 'window buttons on the desktop');
  check(document.querySelectorAll('#side a').length >= 12, 'contents built');
  await wait(300);
  return JSON.stringify({ images: imgs.length, sections: document.querySelectorAll('main section').length, bg: getComputedStyle(document.body).backgroundColor });
})()`;

// ── CDP ──
class Cdp {
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('CDP socket failed')); });
    return new Cdp(ws);
  }
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      }
    };
  }
  send(method, params = {}, { noReply = false } = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    if (noReply) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); } }, 120_000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return fs.statSync(file).size;
  }
  close() { try { this.ws.close(); } catch { /* gone */ } }
}

async function pageTarget(port, match, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((x) => x.type === 'page' && match(x.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await wait(250);
  }
  throw new Error(`no page target on CDP port ${port}`);
}

// WebView2 keeps its browser processes for a few seconds after the program
// exits, and they still write into the scratch profile: wait for them.
async function webviewGone(dir, ms = 20000) {
  if (process.platform !== 'win32') { await wait(1000); return; }
  const needle = dir.replace(/'/g, "''");
  const script = `@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${needle}') }).Count`;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let n = '0';
    try { n = execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim(); } catch { /* none */ }
    if (n === '0') return;
    await wait(300);
  }
}

// The target shows up while the page is still loading; a script started then
// dies with it ("Execution context was destroyed"). Wait for the loaded app.
// `app: false` — a page that is not the app (the user guide): loaded is enough.
async function settled(cdp, ms = 30000, app = true) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await cdp.evaluate(app ? "document.readyState === 'complete' && !!(window.__mfs && window.__mfs.state.settings)" : "document.readyState === 'complete'")) return;
    } catch { /* context replaced: ask again */ }
    await wait(150);
  }
  throw new Error('the page never finished loading');
}

const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
  s.setTimeout(1000, () => { s.destroy(); resolve(false); });
});

function killTree(pid) {
  try {
    if (process.platform === 'win32') execFileSync('C:\\Windows\\System32\\taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch { /* gone */ }
}

// One run of the desktop program: scenario → screenshot → quit (and the
// servers must be gone afterwards). `after(cdp, child)` may close the window
// itself (tray / quit scenarios) instead of the default quit.
async function desktopShot(name, script, { during = null, after = null, docWindow = false, windows = null } = {}) {
  if (!fs.existsSync(exe)) throw new Error(`${path.relative(root, exe)} missing — run \`npm run build:debug\` first.`);
  const cdpPort = await freeDevPort(9461);
  const env = { ...process.env, MFS_USER_DATA: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const shot = path.join(smokeDir, `${name}.png`);
  let cdp = null;
  try {
    const mainWs = await pageTarget(cdpPort, (u) => /tauri\.localhost|^tauri:/.test(u));
    cdp = await Cdp.connect(mainWs);
    await cdp.send('Runtime.enable');
    await settled(cdp);
    const duringRun = during ? during() : null;
    const result = script ? await cdp.evaluate(script) : null;
    if (duringRun) await duringRun;
    await wait(Number(opt('settle') || 500));
    const size = await cdp.screenshot(shot);
    if (result !== null && result !== undefined) console.log(`[smoke] ${name}: ${typeof result === 'string' ? result : JSON.stringify(result)}`);
    console.log(`[smoke] desktop ${name} OK → ${path.relative(root, shot)} (${size} bytes)`);
    if (windows) {
      // Dialogs and the theme dropdown are windows of their own.
      const seen = [mainWs];
      let last = null;
      for (const [k, step] of windows.entries()) {
        const ws = step.same && last ? last : await otherPage(cdpPort, seen);
        if (!seen.includes(ws)) seen.push(ws);
        last = ws;
        const w = await Cdp.connect(ws);
        try {
          await w.send('Runtime.enable');
          const info = await w.evaluate(step.check);
          const shot = path.join(smokeDir, `${name}_window${k ? k + 1 : ''}.png`);
          const winSize = await w.screenshot(shot);
          console.log(`[smoke] desktop ${name} window ${k + 1} OK → ${path.relative(root, shot)} (${winSize} bytes) ${info}`);
          if (step.dragOut) console.log(`[smoke] desktop ${name}: ${await dragOut(cdp, w, child.pid)}`);
          if (step.pick) await w.send('Runtime.evaluate', { expression: step.pick }, { noReply: true });
        } finally { w.close(); }
        if (step.after) console.log(`[smoke] desktop ${name}: ${await cdp.evaluate(step.after)}`);
      }
    }
    if (docWindow) {
      // The scenario opened the user guide: its window is a page target of its own.
      const doc = await Cdp.connect(await pageTarget(cdpPort, (u) => /\/doc\/index\.html/.test(u), 15000));
      try {
        await doc.send('Runtime.enable');
        const info = await doc.evaluate(DOC_CHECK);
        const docSize = await doc.screenshot(path.join(smokeDir, `${name}_window.png`));
        console.log(`[smoke] desktop ${name} guide window OK → .smoke/${name}_window.png (${docSize} bytes) ${info}`);
      } finally { doc.close(); }
    }
    if (after) await after(cdp, child, exited);
    else {
      // The page asks the shell to quit; the answer may never come (the page is going away).
      await cdp.send('Runtime.evaluate', { expression: "window.__TAURI_INTERNALS__.invoke('quit_app')" }, { noReply: true });
      const code = await Promise.race([exited, wait(15000).then(() => 'timeout')]);
      if (code === 'timeout') throw new Error('the program did not quit');
    }
    // Quitting stops the servers with the Node host.
    for (const port of [FTP_PORT, FTPS_PORT, SFTP_PORT]) if (await portOpen(port)) throw new Error(`port ${port} still open after quit — the host kept serving`);
    return result;
  } catch (err) {
    console.error(output.split('\n').slice(-20).join('\n'));
    throw new Error(`scenario ${name}: ${err.message}`);
  } finally {
    if (cdp) cdp.close();
    if (child.exitCode === null) killTree(child.pid);
    await webviewGone(profile);
  }
}

// ── Real clients ──
// FTP: waits for the port, logs in, uploads a folder, downloads a file.
async function ftpRoundTrip(port) {
  const ftp = require('basic-ftp');
  const start = Date.now();
  while (Date.now() - start < 40_000) {
    const c = new ftp.Client(8000);
    try {
      await c.access({ host: '127.0.0.1', port, user: 'bob', password: 'secret' });
      const root0 = (await c.list('/')).map((e) => e.name);
      if (!root0.includes('data') || !root0.includes('docs')) throw new Error(`root listing wrong: ${root0}`);
      await c.ensureDir('/data/uploaded');
      await c.uploadFromDir(docsDir, '/data/uploaded');
      await c.downloadTo(path.join(smokeDir, 'video-down.mp4'), '/data/video.mp4');
      c.close();
      if (!fs.existsSync(path.join(shareDir, 'uploaded', 'notes', 'a.txt'))) throw new Error('upload did not land in the share');
      if (fs.statSync(path.join(smokeDir, 'video-down.mp4')).size !== 2_000_000) throw new Error('download size mismatch');
      console.log('[smoke] ftp round trip OK (upload tree + 2 MB download)');
      return;
    } catch (err) {
      c.close();
      if (/ECONNREFUSED|timeout|Timeout/i.test(err.message)) { await wait(500); continue; }
      throw err;
    }
  }
  throw new Error('server never came up on ' + port);
}

// FTPS both ways: explicit AUTH TLS + PROT P on the FTP port, implicit TLS
// on the FTPS port. The certificate is self-signed, so verification is off.
async function ftpsRoundTrip(ftpPort, ftpsPort) {
  const ftp = require('basic-ftp');
  const tls = { rejectUnauthorized: false };
  const e = new ftp.Client(8000);
  await e.access({ host: '127.0.0.1', port: ftpPort, user: 'bob', password: 'secret', secure: true, secureOptions: tls });
  await e.uploadFrom(path.join(docsDir, 'plan.md'), '/data/via-ftps.md');
  const names = (await e.list('/data')).map((x) => x.name);
  e.close();
  if (!names.includes('via-ftps.md')) throw new Error('explicit FTPS upload missing');
  const i = new ftp.Client(8000);
  await i.access({ host: '127.0.0.1', port: ftpsPort, user: 'viewer', password: 'ro', secure: 'implicit', secureOptions: tls });
  await i.downloadTo(path.join(smokeDir, 'via-ftps-down.md'), '/data/via-ftps.md');
  let refused = false;
  try { await i.remove('/data/via-ftps.md'); } catch (err) { refused = /550/.test(err.message); }
  i.close();
  if (!refused) throw new Error('read-only user could delete over implicit FTPS');
  if (fs.readFileSync(path.join(smokeDir, 'via-ftps-down.md'), 'utf8') !== '# plan') throw new Error('implicit FTPS download differs');
  console.log('[smoke] ftps round trip OK (AUTH TLS upload, implicit TLS download, read-only refused)');
}

// SFTP with the ssh2 client: listing, upload, download, delete.
function sftpRoundTrip(port) {
  const { Client } = require('ssh2');
  return new Promise((resolve, reject) => {
    const c = new Client();
    const done = (err) => { c.end(); err ? reject(err) : resolve(); };
    c.on('error', reject);
    c.on('ready', () => c.sftp((err, sftp) => {
      if (err) return done(err);
      const call = (m, ...a) => new Promise((res, rej) => sftp[m](...a, (e, r) => (e ? rej(e) : res(r))));
      return (async () => {
        const root0 = (await call('readdir', '/')).map((x) => x.filename);
        if (!root0.includes('data') || !root0.includes('docs')) throw new Error(`sftp root listing wrong: ${root0}`);
        await call('fastPut', path.join(shareDir, 'images', 'logo.png'), '/docs/via-sftp.png');
        await call('fastGet', '/docs/via-sftp.png', path.join(smokeDir, 'via-sftp-down.png'));
        if (fs.statSync(path.join(smokeDir, 'via-sftp-down.png')).size !== 80_000) throw new Error('sftp download size mismatch');
        await call('unlink', '/docs/via-sftp.png');
        console.log('[smoke] sftp round trip OK (readdir, 80 KB put/get, unlink)');
      })().then(() => done(), done);
    }));
    c.connect({ host: '127.0.0.1', port, username: 'bob', password: 'secret', readyTimeout: 8000 });
  });
}

// Every protocol the app is serving, in turn (FTP first: it waits for the port).
async function roundTrips() {
  await ftpRoundTrip(FTP_PORT);
  await ftpsRoundTrip(FTP_PORT, FTPS_PORT);
  await sftpRoundTrip(SFTP_PORT);
}

// ── Window close: tray or quit ──
// "Minimise to tray" on and a server running: closing the window hides it,
// the program and its servers stay; quit_app then ends both.
async function trayClose(cdp, child, exited) {
  await cdp.send('Runtime.evaluate', { expression: "window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' })" }, { noReply: true });
  const code = await Promise.race([exited, wait(2500).then(() => 'alive')]);
  if (code !== 'alive') throw new Error('closing the window quit the program although it should hide to the tray');
  if (!(await portOpen(FTP_PORT))) throw new Error('the FTP server stopped when the window hid to the tray');
  const hidden = await cdp.evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })");
  if (hidden !== false) throw new Error(`the window is still visible after close (is_visible=${hidden})`);
  console.log('[smoke] tray: window hidden, servers still serving');
  await cdp.send('Runtime.evaluate', { expression: "window.__TAURI_INTERNALS__.invoke('quit_app')" }, { noReply: true });
  if ((await Promise.race([exited, wait(15000).then(() => 'timeout')])) === 'timeout') throw new Error('quit from the tray state did not end the program');
}

// Without the tray setting, closing the window quits (and stops the servers).
async function plainClose(cdp, child, exited) {
  await cdp.send('Runtime.evaluate', { expression: "window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' })" }, { noReply: true });
  if ((await Promise.race([exited, wait(15000).then(() => 'timeout')])) === 'timeout') throw new Error('closing the window did not quit');
  console.log('[smoke] close: program quit');
}

// ── Web version: server/server.js + a headless browser on its page ──
function post(port, name, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path: `/api/${name}`, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(data);
  });
}

function browserPath() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function browserShot(name, url, script, during) {
  const bin = browserPath();
  if (!bin) { console.log('[smoke] no Edge / Chrome found — the web page itself is not screenshotted'); return null; }
  const cdpPort = await freeDevPort(9481);
  // A browser that just quit (or its crash handler) may still hold a file of the
  // last profile: retry, then fall back to a fresh folder.
  let dataDir = path.join(smokeDir, 'browser');
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { dataDir = path.join(smokeDir, `browser-${Date.now()}`); }
  const child = spawn(bin, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${dataDir}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--window-size=1400,900', url], { stdio: 'ignore', detached: process.platform !== 'win32' });
  let cdp = null;
  try {
    cdp = await Cdp.connect(await pageTarget(cdpPort, (u) => u.startsWith(url)));
    await cdp.send('Runtime.enable');
    await settled(cdp, 30000, !url.includes('/doc/'));
    const duringRun = during ? during() : null;
    const result = await cdp.evaluate(script);
    if (duringRun) await duringRun;
    await wait(500);
    const size = await cdp.screenshot(path.join(smokeDir, `${name}.png`));
    console.log(`[smoke] web-ui ${name} OK → .smoke/${name}.png (${size} bytes) ${typeof result === 'string' ? result : JSON.stringify(result)}`);
    return result;
  } finally {
    if (cdp) cdp.close();
    killTree(child.pid);
  }
}

async function webSmoke(scenario = null) {
  const port = await freeDevPort(5199);
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--no-open', '--config', profile], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MFS_SMOKE: '1' } });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 10_000);
      child.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
      child.on('exit', (c) => reject(new Error(`server exited ${c}`)));
    });
    const info = await post(port, 'app.info');
    if (!info.ok || info.data.host !== 'web') throw new Error('app.info failed');
    const html = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b)); }).on('error', reject));
    if (!html.includes('<div id="root">')) throw new Error('index.html not served');
    // Start the servers over HTTP, talk to them, poll the log, stop.
    const st = await post(port, 'server.start', {});
    if (!st.ok || !st.data.state.running) throw new Error(`server.start failed: ${st.error && st.error.message}`);
    await roundTrips();
    const poll = await post(port, 'server.poll', { seq: 0 });
    if (!poll.ok || poll.data.stats.uploads < 1 || !poll.data.lines.length) throw new Error('server.poll did not report the transfer');
    console.log(`[smoke] web OK → api + static + start/transfer/poll (${poll.data.lines.length} log lines, ${poll.data.stats.uploads} uploads)`);
    await post(port, 'server.stop');
    // The UI itself in a browser pointed at the server.
    const s = scenario || 'running';
    await browserShot(`web_${s}`, `http://127.0.0.1:${port}/`, SCENARIOS[s], s === 'transfer' ? roundTrips : null);
    // The user guide is served from dist/doc as well.
    if (!scenario) await browserShot('web_manual', `http://127.0.0.1:${port}/doc/index.html`, DOC_CHECK);
  } finally {
    child.kill();
  }
}

async function runScenario(name) {
  seed(SEED[name] || {});
  const extra = {};
  if (name === 'transfer') extra.during = roundTrips;
  if (name === 'manual') extra.docWindow = true;
  if (WINDOWS[name]) extra.windows = WINDOWS[name];
  return desktopShot(name, SCENARIOS[name], extra);
}

(async () => {
  const scenario = opt('scenario');
  if (scenario === 'backgrounds') {
    for (const kind of BG_KINDS) {
      seed({ showStartOnLaunch: true, startBackground: { kind } });
      await desktopShot(`bg_${kind}`, `(async () => { ${BOOT} await new Promise((r) => setTimeout(r, 1500)); return window.__mfsStartBg.kind; })()`);
    }
    console.log('[smoke] scenario done');
    return;
  }
  if (scenario) {
    seed(SEED[scenario] || {});
    if (args.includes('--web')) await webSmoke(scenario);
    else if (scenario === 'all') { for (const k of Object.keys(SCENARIOS)) await runScenario(k); }
    else await runScenario(scenario);
    console.log('[smoke] scenario done');
    return;
  }
  if (!args.includes('--web-only')) {
    await runScenario('main');
    const stats = await runScenario('transfer');
    if (!/"uploads":[1-9]/.test(stats)) throw new Error('upload counter did not move');
    console.log('[smoke] desktop verified (server started from the UI, real FTP + FTPS + SFTP transfers, counters updated)');
    await runScenario('start_page');
    await runScenario('start_page_run');
    await runScenario('themes');
    await runScenario('custom_theme_saved');
    await runScenario('manual');
    // Tray: closing while serving hides the window, the servers keep running.
    seed({ minimizeToTray: true });
    await desktopShot('tray', `(async () => { ${START} await new Promise((r) => setTimeout(r, 800)); return 'serving'; })()`, { after: trayClose });
    seed();
    await desktopShot('close', `(async () => { ${START} return 'serving'; })()`, { after: plainClose });
  }
  if (!args.includes('--desktop-only')) { seed(); await webSmoke(); }
  console.log('[smoke] all good');
})().catch((err) => { console.error('[smoke] FAILED:', err.message); process.exit(1); });
