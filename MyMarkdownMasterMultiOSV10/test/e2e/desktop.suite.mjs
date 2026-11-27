// Desktop E2E: the web cases marked `desktop: true` run unchanged in the real app
// (WebView2, Tauri IPC), plus what only the desktop has: popups as their own OS
// windows (popup-<kind> targets) and the backend answering the page.
import assert from 'node:assert/strict';
import { sleep } from './cdp.mjs';
import { cases } from './web.suite.mjs';

export const desktopCases = [
  {
    group: 'Desktop',
    name: 'Backend answers: app info (name, version, OS), first-run detection',
    async run(app) {
      const r = await app.run(`return { info: A.state.info, instance: A.state.instance, title: document.title, desktop: Boolean(window.__TAURI_INTERNALS__) };`);
      assert.ok(r.desktop, 'Tauri IPC present');
      assert.equal(r.info?.name, 'MyMarkdownMaster');
      assert.match(r.info?.version ?? '', /^\d+\.\d+\.\d+/);
      assert.ok(r.instance?.first, 'MYMARKDOWN_MULTI=1: every copy acts as the first');
      assert.match(r.title, /^MyMarkdownMaster v/);
    },
  },
  {
    group: 'Desktop',
    name: 'Explorer tab: Favorites, the user home and drives from Rust; a folder expands lazily (read-only)',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true });
        A.app.updateSettings({ favorites: [] });
        const places = await window.__TAURI_INTERNALS__.invoke('explorer_places');
        A.app.setLeftTab('explorer');
        await T.until(() => document.querySelector('#left-panel .xp-place'), 8000, 'places');
        const home = document.querySelector('#left-panel .xp-place');
        home.click();
        await T.until(() => document.querySelectorAll('#left-panel .xp-row').length > places.length, 8000, 'home listed');
        const sections = [...document.querySelectorAll('#left-panel .xp-section')].map((s) => s.dataset.xpSection);
        const rows = document.querySelectorAll('#left-panel .xp-row').length;
        home.click(); A.app.setLeftTab('files');
        return { places: places.map((p) => p.id), sections, rows };`);
      assert.ok(r.places.includes('home'), 'home place');
      assert.ok(r.places.includes('drive'), 'a drive');
      assert.deepEqual(r.sections, ['favorites', 'home', 'drives']);
      assert.ok(r.rows > r.places.length);
    },
  },
  ...cases.filter((c) => c.desktop),
  {
    group: 'Desktop',
    name: 'Every popup is its own OS window: theme drop-down, command palette, name prompt, print',
    async run(app) {
      const opened = {};
      const openers = {
        menu: `A.run('themeMenu'); return 1;`,
        suggest: `A.run('commandPalette'); return 1;`,
        prompt: `A.run('newFolder'); return 1;`,
        print: `A.run('print'); return 1;`,
      };
      await app.run(`await T.reset({ vault: true }); return 1;`);
      for (const [kind, open] of Object.entries(openers)) {
        await app.run(open);
        const end = Date.now() + 15000;
        let found = null;
        while (Date.now() < end && !found) { found = (await app.targets()).find((t) => t.title === `popup-${kind}` || String(t.url).includes(`popup=${kind}`)); if (!found) await sleep(200); }
        const inPage = await app.run(`return Boolean(document.querySelector('.web-popup-${kind}, .suggest-layer'));`);
        opened[kind] = Boolean(found) && !inPage;
        await app.run(`await A.popups.close(${JSON.stringify(kind)}); return 1;`);
        await sleep(300);
      }
      assert.deepEqual(opened, { menu: true, suggest: true, prompt: true, print: true });
    },
  },
  {
    group: 'Desktop',
    name: 'Popups open and close as their own OS windows (popup-about, popup-settings)',
    async run(app) {
      for (const kind of ['about', 'settings']) {
        await app.run(`A.popups.open(${JSON.stringify(kind)}, ${kind === 'settings' ? "{ tab: 'general' }" : '{}'}); return 1;`);
        const end = Date.now() + 15000;
        let found = null;
        while (Date.now() < end && !found) { found = (await app.targets()).find((t) => t.title === `popup-${kind}` || String(t.url).includes(`popup=${kind}`)); if (!found) await sleep(200); }
        assert.ok(found, `popup-${kind} window target`);
        await app.run(`await A.popups.close(${JSON.stringify(kind)}); return 1;`);
      }
    },
  },
];
