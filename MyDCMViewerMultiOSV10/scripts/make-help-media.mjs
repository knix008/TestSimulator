// The pictures of the help pages (doc/images/help-*.jpg), taken from the real app: the web page in
// headless Edge for most of them, the desktop program (with scripts/mini-pacs.cjs) for the PACS window
// and the About window. Then the help window's data is rebuilt (scripts/make-help.mjs).
//
//   npm run help:media                    all pictures
//   node scripts/make-help-media.mjs mpr volume     only these (names without help- / .jpg)
//   --no-desktop                          skip the desktop pictures
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, root } from './cdp.mjs';

const args = process.argv.slice(2);
const only = new Set(args.filter((a) => !a.startsWith('--')));
const noDesktop = args.includes('--no-desktop');
const OUT = path.join(root, 'doc', 'images');
fs.mkdirSync(OUT, { recursive: true });
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* PNG kept */ }

async function save(page, name, clip) {
  const params = { format: 'png' };
  if (clip) { clip = { x: Math.max(0, Math.round(clip.x)), y: Math.max(0, Math.round(clip.y)), width: Math.round(clip.width), height: Math.round(clip.height) }; params.clip = { ...clip, scale: 1 }; }
  const png = Buffer.from((await page.send('Page.captureScreenshot', params)).data, 'base64');
  const file = path.join(OUT, `help-${name}.jpg`);
  if (sharp) await sharp(png).resize({ width: Math.min(1280, clip ? clip.width : 1280), withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  else fs.writeFileSync(file.replace(/\.jpg$/, '.png'), png);
  console.log('  ✔', path.basename(file), `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
const rectOf = (page, sel, pad = 12) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x - ${pad}, y: r.y - ${pad}, width: r.width + ${pad * 2}, height: r.height + ${pad * 2} }; })()`);
const act = (page, action, dataset = {}) => page.eval(`(window.__d = false, App.runAction(${JSON.stringify(action)}, { dataset: ${JSON.stringify(dataset)} }).then(() => window.__d = true, () => window.__d = true), 0)`).then(() => page.waitFor('window.__d', 60000));
const fire = (page, action, dataset = {}) => page.eval(`(App.runAction(${JSON.stringify(action)}, { dataset: ${JSON.stringify(dataset)} }), 0)`);
const closeDialogs = (page) => page.eval(`App.Dlg.closeAll(); 0`);

// name → what to do before the picture; return a clip rect (or nothing for the whole window)
const SHOTS = {
  start: async (p) => { await act(p, 'start-page'); await sleep(2500); },
  background: async (p) => { await act(p, 'start-page'); await sleep(800); await p.eval(`document.querySelector('#startPage .start-scenes').scrollIntoView({ block: 'center' }); 0`); await sleep(1800); },
  screen: async (p) => { await act(p, 'sample', { sample: 'ct' }); await act(p, 'demo-measure', { kind: 'length' }); await sleep(600); },
  contextmenu: async (p) => {
    await act(p, 'sample', { sample: 'ct' }); await sleep(400);
    const r = await p.rect('#viewport');
    await p.click(r.cx - 120, r.cy - 120, { button: 'right' }); await sleep(500);
    return rectOf(p, '#ctxViewer', 40);
  },
  dicomdir: async (p) => { await act(p, 'sample', { sample: 'ct' }); await p.eval(`App.openPath(App.state.sampleRoot + '/dicomdir/DICOMDIR')`); await sleep(1500); },
  view: async (p) => { await act(p, 'sample', { sample: 'mrbrain' }); await act(p, 'toggle', { key: 'ruler' }); await act(p, 'toggle', { key: 'grid' }); await act(p, 'zoom-in'); await sleep(600); },
  tags: async (p) => { await act(p, 'sample', { sample: 'ct' }); await act(p, 'sidebar-tab', { tab: 'tags' }); await p.eval(`(() => { const s = document.getElementById('tagSearch'); s.value = 'Patient'; s.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()`); await sleep(600); },
  window: async (p) => { await act(p, 'sample', { sample: 'ct' }); await act(p, 'preset', { value: 'lung' }); await act(p, 'sidebar-tab', { tab: 'histogram' }); await sleep(700); },
  measure: async (p) => {
    await act(p, 'sample', { sample: 'ct' }); await act(p, 'clear-measurements');
    for (const kind of ['length', 'angle', 'rect', 'polygon', 'point', 'arrow']) await act(p, 'demo-measure', { kind });
    await sleep(500);
  },
  cine: async (p) => { await act(p, 'sample', { sample: 'echo' }); await fire(p, 'cine-play'); await sleep(1600); },
  video: async (p) => { await act(p, 'sample', { sample: 'video' }); await fire(p, 'cine-play'); await sleep(1300); await act(p, 'cine-pause'); await sleep(600); },
  'video-mpeg2': async (p) => { await act(p, 'sample', { sample: 'video-mpeg2' }); await sleep(1200); },
  layout: async (p) => { for (const s of ['rtdose', 'mrbrain', 'emri', 'ct']) await act(p, 'sample', { sample: s }); await act(p, 'layout', { value: '2x2' }); await sleep(1800); },
  mpr: async (p) => { await act(p, 'sample', { sample: 'emri' }); await fire(p, 'mpr'); await sleep(4000); },
  volume: async (p) => {
    await act(p, 'sample', { sample: 'emri' }); await fire(p, 'volume'); await sleep(4500);
    // the sample is a 10-slice slab: look at it from above
    await p.eval(`(() => { const b = [...document.querySelectorAll('#modalBox .vr-views .btn')][4]; if (b) b.click(); return 0; })()`); await sleep(1500);
  },
  filters: async (p) => {
    await act(p, 'sample', { sample: 'ct' }); await fire(p, 'filters'); await sleep(800);
    await p.eval(`(() => { const b = document.querySelector('#modalBox #fiAdd'); b.click(); b.click(); const sel = document.querySelectorAll('#modalBox .filter-step > select'); sel[1].value = 'sharpen'; sel[1].dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
    await sleep(1500);
  },
  fusion: async (p) => { await act(p, 'sample', { sample: 'rtdose' }); await act(p, 'sample', { sample: 'ct' }); await act(p, 'demo-fusion', { on: true }); await sleep(800); },
  tageditor: async (p) => { await act(p, 'sample', { sample: 'ct' }); await fire(p, 'tag-editor'); await sleep(1500); },
  anonymize: async (p) => { await act(p, 'sample', { sample: 'ct' }); await fire(p, 'anonymize'); await sleep(900); },
  sr: async (p) => { await act(p, 'sample', { sample: 'sr' }); await sleep(1000); },
  ecg: async (p) => { await act(p, 'sample', { sample: 'ecg' }); await sleep(1400); },
  rt: async (p) => { await act(p, 'sample', { sample: 'rtplan' }); await sleep(1000); },
  export: async (p) => {
    await act(p, 'sample', { sample: 'ct' }); await sleep(300);
    await p.eval(`document.querySelector('#exportMenu .menu-title, #exportMenu > button').click(); 0`); await sleep(500);
    const r = await rectOf(p, '#exportMenu .menu-panel', 16);
    return r ? { x: r.x - 300, y: r.y - 60, width: r.width + 320, height: r.height + 80 } : null;
  },
  exportas: async (p) => {
    await act(p, 'sample', { sample: 'ct' }); await fire(p, 'export-as-dialog'); await p.waitFor(`!!document.querySelector('#modalBox #exFmt')`, 30000); await sleep(400);
    await p.eval(`(() => { const s = document.querySelector('#modalBox #exFmt'); s.value = 'jp2'; s.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`); await sleep(500);
  },
  progress: async (p) => { await act(p, 'sample', { sample: 'echo' }); await p.eval(`App.Progress.start('color3d_jpeg_baseline.dcm 내보내는 중…', { cancellable: true }); 0`); await sleep(500); await p.eval(`App.Progress.update(48, 120, '프레임 48 / 120'); 0`); await sleep(500); },
  print: async (p) => { await act(p, 'sample', { sample: 'ct' }); await fire(p, 'print'); await sleep(1800); },
  batch: async (p) => { await fire(p, 'batch'); await sleep(900); },
  settings: async (p) => { await fire(p, 'settings'); await sleep(900); },
  shortcuts: async (p) => { await fire(p, 'shortcuts'); await sleep(900); },
};
const DESKTOP = ['pacs', 'about'];

async function webShots() {
  const names = Object.keys(SHOTS).filter((n) => !only.size || only.has(n));
  if (!names.length) return;
  console.log('Web pictures');
  for (const name of names) {
    // a fresh page for every picture: no state carried over from the one before
    const page = await launch({ lang: 'ko', width: 1440, height: 900, settings: { showStartOnLaunch: name === 'start' || name === 'background', startScreen: { transparency: 25 } } });
    try {
      await sleep(1200);
      const clip = await SHOTS[name](page);
      await save(page, name, clip || null);
      const e = page.errors.filter((x) => !/favicon/.test(x));
      if (e.length) console.log('    page errors:', e.slice(0, 2));
    } catch (err) { console.log('  ✘', name, err.message); } finally { await page.close(); }
  }
}

async function desktopShots() {
  const names = DESKTOP.filter((n) => !only.size || only.has(n));
  if (!names.length || noDesktop) return;
  console.log('Desktop pictures');
  const port = 11600 + Math.floor(Math.random() * 300);
  const pacs = spawn(process.execPath, [path.join(root, 'scripts', 'mini-pacs.cjs'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => pacs.stdout.on('data', (d) => { if (/READY/.test(d)) r(); }));
  const page = await launch({ desktop: true, lang: 'ko', width: 1440, height: 900, settings: { pacsNodes: [{ name: '병원 PACS (시험용)', ae: 'MINIPACS', host: '127.0.0.1', port }] } });
  const popup = async (kind) => {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { t = (await page.targets()).find((x) => new RegExp(`kind=${kind}\\b`).test(x.url)); if (!t) await sleep(250); }
    const p = await page.connectTarget(t);
    await p.waitFor(`document.querySelector('#popupBox') && document.querySelector('#popupBox').children.length > 0`, 15000);
    return p;
  };
  try {
    await sleep(1500);
    if (names.includes('pacs')) {
      await act(page, 'sample', { sample: 'ct' });
      await fire(page, 'pacs');
      const p = await popup('pacs');
      const idle = () => p.waitFor(`[...document.querySelectorAll('.pacs button')].every((b) => b.id === 'pcOpen' || !b.disabled)`, 30000);
      await p.eval(`document.querySelector('#pcEcho').click(); 0`); await sleep(400); await idle();
      await p.eval(`document.querySelector('#pcFind').click(); 0`); await sleep(400); await idle();
      await p.eval(`document.querySelector('#pcStudies tbody tr[data-i]:nth-child(4)') ? document.querySelector('#pcStudies tbody tr[data-i]:nth-child(4)').click() : document.querySelector('#pcStudies tbody tr[data-i]').click(); 0`); await sleep(400); await idle();
      await save(p, 'pacs');
      await p.close();
      await page.eval(`App.Dlg.close('pacs'); 0`); await sleep(500);
    }
    if (names.includes('about')) {
      await fire(page, 'about');
      const p = await popup('about');
      await sleep(600);
      await save(p, 'about');
      await p.close();
    }
  } catch (err) { console.log('  ✘ desktop:', err.message); } finally { await page.close(); pacs.kill(); }
}

await webShots();
await desktopShots();
const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'make-help.mjs')], { stdio: 'inherit' });
process.exit(r.status || 0);
