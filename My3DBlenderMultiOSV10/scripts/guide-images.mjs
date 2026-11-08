// npm run guide:images — takes the pictures of the User's Guide and the Tutorial from the running program: doc/images/{ko,en}/*.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep, startVite, waitFor } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = await startVite(root);
const { cdp, stop } = await launchBrowser(vite.url, { width: 1500, height: 900 });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});
const js = (e) => cdp.evaluate(e);
const frame = () => js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
const settle = async (ms = 400) => { await sleep(ms); await frame(); };
const openSample = async (id, name) => {
  await js(`(async () => { const list = await (await fetch('./sample/index.json')).json(); await window.__my3d.openSample(list.find((x) => x.id === ${JSON.stringify(id)})); })()`);
  await waitFor(() => js(`window.__my3d.doc.name === ${JSON.stringify(name)}`), 8000);
  await settle();
};

const SHOTS = [
  ['start', async () => { await js('window.__my3d.showStart()'); await settle(1200); }],
  ['mug', async () => { await openSample('subsurf-mug', 'Mug'); await js("window.__my3d.setWorkspace('layout')"); await js("window.__my3d.doc.mode = 'OBJECT'; window.__my3d.touch();"); await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.state.shading = 'MATERIAL'; v.frameAll(); })()"); await settle(800); }],
  ['paint', async () => { await openSample('texture-painted', 'Texture Painting'); await js("window.__my3d.setWorkspace('paint'); window.__my3d.doc.activeId = window.__my3d.doc.objects.find((o) => o.name === 'Cube').id; window.__my3d.doc.mode = 'TEXTURE_PAINT'; window.__my3d.touch();"); await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.frameAll(); })()"); await settle(900); }],
  ['shading', async () => { await openSample('noise-material', 'Marble'); await js("window.__my3d.setWorkspace('shading')"); await settle(500); await js("window.__my3d.editorsOf('nodes')[0].api.frameAll()"); await settle(700); }],
  ['smoke', async () => { await openSample('campfire', 'Campfire'); await waitFor(() => js("import('/src/core/simulation.js').then((m) => m.simBaked(window.__my3d.doc.objects.find((o) => o.smoke)))"), 60000); await js('window.__my3d.setFrame(40)'); await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.state.shading = 'MATERIAL'; })()"); await settle(1000); }],
  ['scripting', async () => { await openSample('python-tower', 'Python: Twisted Tower'); await js("window.__my3d.setWorkspace('scripting')"); await settle(500); await js("window.__my3d.editorsOf('view3d')[0].api.frameAll()"); await settle(700); }],
  ['assets', async () => { await js("window.__my3d.setWorkspace('assets')"); await settle(3500); }],
  ['sequencer', async () => { await openSample('title-card', 'Title Sequence'); await js("window.__my3d.setWorkspace('video'); window.__my3d.setFrame(20);"); await settle(900); }],
  ['clip', async () => { await openSample('camera-solve', 'Motion Tracking'); await js("window.__my3d.setWorkspace('tracking'); window.__my3d.setFrame(8);"); await settle(900); }],
];

// What the tutorial makes: its steps done one after another with Do It for Me, and the picture its Render step renders.
// The tutorial popup and the tutorial's first and last steps show it (public/tutorial/result.png), and so does the
// written tutorial (doc/images/tutorial-result.png).
async function tutorialResult() {
  await js(`localStorage.setItem('my3d.settings', JSON.stringify({ language: 'ko', showStart: false, askTutorial: false }))`);
  await cdp.send('Page.reload');
  await sleep(600);
  await waitFor(() => js('document.readyState === "complete" && Boolean(window.__my3d)'), 30000);
  await js('window.__my3d.startTutorial()');
  await waitFor(() => js("Boolean(document.querySelector('[data-testid=tutorial-text]'))"), 10000);
  for (let guard = 0; guard < 40; guard++) {
    if (await js("Boolean(document.querySelector('[data-testid=tutorial-done]'))")) break;
    if (await js("Boolean(document.querySelector('[data-testid=tutorial-do]'))")) await js("document.querySelector('[data-testid=tutorial-do]').click()");
    await waitFor(() => js("Boolean(document.querySelector('[data-testid=tutorial-next]:not([disabled]), [data-testid=tutorial-done]'))"), 180000, 200);
    if (await js("Boolean(document.querySelector('[data-testid=tutorial-done]'))")) break;
    await js("document.querySelector('[data-testid=tutorial-next]').click()");
    await settle(200);
  }
  const data = await js(`(async () => {
    const { resultToPng } = await import('/src/ui/render.js');
    const blob = await resultToPng(window.__my3d.renderResult);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  })()`);
  const png = Buffer.from(data, 'base64');
  for (const file of [path.join(root, 'public', 'tutorial', 'result.png'), path.join(root, 'doc', 'images', 'tutorial-result.png')]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
  }
  await js("document.querySelector('[data-testid=tutorial-done]')?.click()");
  console.log(`  tutorial result: ${png.length} bytes`);
}
await tutorialResult();

for (const language of ['ko', 'en']) {
  await js(`localStorage.setItem('my3d.settings', JSON.stringify({ language: ${JSON.stringify(language)}, showStart: false, askTutorial: false }))`);
  await cdp.send('Page.reload');
  await sleep(600);
  await waitFor(() => js('document.readyState === "complete" && Boolean(window.__my3d)'), 30000);
  const dir = path.join(root, 'doc', 'images', language);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, prepare] of SHOTS) {
    await prepare();
    await cdp.screenshot(path.join(dir, `${name}.png`));
    await js('window.__my3d.hideStart()');
    console.log(`  ${language}/${name}.png`);
  }
}
await stop();
await vite.stop?.();
process.exit(0);
