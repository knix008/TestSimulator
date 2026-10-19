// Captures the Help window's screenshots (src/help/images/<lang>/*.png) from
// the web build in headless Edge / Chrome, in Korean and English. Each scene
// starts from a fresh profile; window.__mtm (src/App.jsx) drives the app.
//
//   npm run build && npm run help:media            (both languages)
//   node scripts/make-help-media.mjs en             (one language)
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './cdp.mjs';

const W = 1280, H = 800;
const langs = process.argv[2] ? [process.argv[2]] : ['ko', 'en'];
const rectOf = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; })()`;
const centerOf = (text) => `(() => { const L = window.__mtm.layout(); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); for (const n of L.nodes.values()) if (n.topic.text === ${JSON.stringify(text)}) return { x: r.left + v.x + (n.x + n.w / 2) * v.k, y: r.top + v.y + (n.y + n.h / 2) * v.k, id: n.id }; return null; })()`;
const selectText = (text) => `(() => { const L = window.__mtm.layout(); for (const n of L.nodes.values()) if (n.topic.text === ${JSON.stringify(text)}) { window.__mtm.select([n.id]); return n.id; } return null; })()`;
const firstMain = "(() => { const d = window.__mtm.doc(); return d.map.root.children[0].text; })()";

async function scenes(lang) {
  const out = path.join(root, 'src', 'help', 'images', lang);
  fs.mkdirSync(out, { recursive: true });
  const p = await launch({ width: W, height: H, lang, session: { theme: 'midnight', panelVisible: true, sidebarVisible: true } });
  const shot = (name, clip) => p.shot(path.join(out, `${name}.png`), clip).then((f) => console.log(`  ${lang}/${path.basename(f)}`));
  const run = (id) => p.eval(`window.__mtm.run(${JSON.stringify(id)})`);
  const settle = (ms = 500) => p.sleep(ms);
  try {
    await p.waitFor('!!window.__mtm && !!document.querySelector(".start-page")');
    await settle(1500);
    await shot('start-page');

    // a map built by typing, the main window
    await run('template:brainstorm');
    await settle(900);
    await p.eval(selectText(await p.eval(firstMain)));
    await settle(300);
    await shot('main-window');
    await shot('toolbar', await p.eval(rectOf('.icon-toolbar')));

    // editing
    const t1 = await p.eval(firstMain);
    const c = await p.eval(centerOf(t1));
    await p.click(c.x, c.y);
    await p.key('F2');
    await settle(200);
    await p.type(lang === 'ko' ? ' — 새 내용' : ' — new text');
    await settle(300);
    await shot('editing', { x: Math.max(0, c.x - 380), y: Math.max(0, c.y - 200), width: 760, height: 400 });
    await p.key('Escape');

    // dragging (held mid-way)
    const kids = await p.eval('window.__mtm.doc().map.root.children.map((x) => x.text)');
    const a = await p.eval(centerOf(kids[1])), b = await p.eval(centerOf(kids[0]));
    await p.mouse('mouseMoved', a.x, a.y);
    await p.mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 10; i++) await p.mouse('mouseMoved', a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
    await settle(200);
    await shot('drag', { x: 250, y: 100, width: 760, height: 560 });
    await p.mouse('mouseMoved', a.x, a.y);
    await p.key('Escape');
    await p.mouse('mouseReleased', a.x, a.y);
    await settle(200);

    // quick entry
    await run('quickEntry');
    await settle(300);
    await p.type(lang === 'ko' ? '장소 후보\n\t바닷가\n\t산\n예산\n\t숙박\n\t식비' : 'Places\n\tBeach\n\tMountains\nBudget\n\tLodging\n\tFood');
    await settle(200);
    await shot('quick-entry', await p.eval(rectOf('.dlg')));
    await p.key('Escape');
    await settle(200);

    // layouts
    for (const [tpl, name] of [['org', 'layout-org'], ['fishbone', 'layout-fishbone'], ['roadmap', 'layout-timeline']]) {
      await run(`template:${tpl}`);
      await settle(900);
      await run('fit');
      await settle(500);
      await shot(name, await p.eval(rectOf('.map-canvas')));
    }

    // the task pane tabs, on the project template
    await run('template:project');
    await settle(900);
    await run('fit');
    await settle(400);
    await p.eval(selectText(lang === 'ko' ? '요구사항 정리' : 'Requirements'));
    for (const [tab, name] of [['format', 'format-pane'], ['markers', 'markers-pane'], ['task', 'task-pane'], ['notes', 'notes-pane'], ['links', 'links-pane'], ['map', 'map-pane']]) {
      if (tab === 'notes') {
        await p.eval(selectText(lang === 'ko' ? '신제품 출시 프로젝트' : 'Product launch project'));
      }
      await p.clickSel(`.pane-tab[data-pane="${tab}"]`);
      await settle(350);
      await shot(name, await p.eval(rectOf('.task-pane')));
    }

    // outline and Gantt
    await run('view:outline');
    await settle(500);
    await shot('outline-view');
    await run('view:gantt');
    await settle(500);
    await shot('gantt-view');
    await run('view:map');
    await settle(400);

    // find and filter
    await run('find');
    await settle(200);
    await p.type(lang === 'ko' ? '출시' : 'launch');
    await settle(400);
    await shot('find');
    await run('side:filter');
    await settle(300);
    await p.clickSel('.index-item');
    await settle(400);
    await shot('filter');
    await run('filterClear');
    await run('side:outline');

    // relationships, boundary, callout: the feature tour
    await run('tour');
    await settle(1000);
    await run('zoom100');
    await settle(400);
    await p.eval(`window.__mtm.canvas().centerOn(${centerOf(lang === 'ko' ? '보기' : 'Views')}.id)`);
    await settle(600);
    await shot('relationship', await p.eval(rectOf('.map-canvas')));

    // presentation
    await p.eval('Element.prototype.requestFullscreen = undefined');   // headless would shrink the page to 800 × 600
    await run('presentation');
    await settle(800);
    await p.key('ArrowRight');
    await p.key('ArrowRight');
    await settle(1200);
    await shot('presentation');
    await p.key('Escape');
    await settle(400);

    // dialogs
    await run('export');
    await settle(400);
    await shot('export', await p.eval(rectOf('.dlg')));
    await p.key('Escape');
    await run('print');
    await settle(1200);
    await shot('print-preview', await p.eval(rectOf('.dlg')));
    await p.key('Escape');
    await run('template');
    await settle(1500);
    await shot('templates', await p.eval(rectOf('.dlg')));
    await p.key('Escape');
    await run('settings');
    await settle(400);
    await shot('settings', await p.eval(rectOf('.dlg')));
    await p.clickSel('.settings-tab[data-tab="theme"]');
    await settle(300);
    await shot('settings-theme', await p.eval(rectOf('.dlg')));
    await p.key('Escape');
    if (p.errors.length) console.log('page errors:', p.errors);
  } finally {
    await p.close();
  }
}

for (const lang of langs) {
  console.log(`[help] ${lang}`);
  await scenes(lang);
}
