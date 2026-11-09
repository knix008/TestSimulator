// Desktop E2E: the web cases marked `desktop: true` run unchanged in the real app
// (WebView2, Tauri IPC), plus what only the desktop has: popups as their own OS
// windows (popup-<kind> targets) and the backend answering the page.
import assert from 'node:assert/strict';
import { sleep } from './cdp.mjs';
import { cases } from './web.suite.mjs';

export const desktopCases = [
  {
    group: '데스크톱',
    name: '백엔드 응답: 앱 정보(이름·버전·OS), 첫 실행 판별',
    async run(app) {
      const r = await app.run(`return { info: A.state.info, instance: A.state.instance, title: document.title, desktop: Boolean(window.__TAURI_INTERNALS__) };`);
      assert.ok(r.desktop, 'Tauri IPC present');
      assert.equal(r.info?.name, 'MySketchBook');
      assert.match(r.info?.version ?? '', /^\d+\.\d+\.\d+/);
      assert.ok(r.instance?.first, 'MYSKETCHBOOK_MULTI=1: every copy acts as the first');
      assert.match(r.title, /^MySketchBook v/);
    },
  },
  ...cases.filter((c) => c.desktop),
  {
    group: '데스크톱',
    name: '팝업은 자기 OS 창 (popup-about · popup-settings) 으로 열리고 닫힘',
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
