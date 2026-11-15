// npm run tutorial:docs — runs the in-app tutorial in headless Edge / Chrome and
// saves a picture of every step for the tutorial document and the user's guide:
//   doc/tutorial/images/NN-<step>.jpg      (Korean screen)
//   doc/tutorial/images/en/NN-<step>.jpg   (English screen)
// then builds the HTML pages (scripts/build-docs.mjs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebApp } = await import(pathToFileURL(path.join(root, 'test/e2e/web.harness.mjs')).href);
const images = path.join(root, 'doc', 'tutorial', 'images');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = new WebApp({ gpu: true, width: 1600, height: 960 });
try {
  await app.start();
  for (const lang of ['ko', 'en']) {
    const dir = lang === 'ko' ? images : path.join(images, 'en');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await app.run(`A.actions.updateSettings({ language: '${lang}', theme: 'light', tutorialDone: false, startShowTutorialBanner: true }); return 1;`);
    const steps = await app.run(`A.run('tutorial'); await T.until(() => A.tutorial()?.state().active, 10000, 'tutorial'); const { STEPS } = await import('/src/ui/tutorial.js'); return STEPS.map((s) => s.id);`);
    for (const [i, id] of steps.entries()) {
      await app.run(`const tut = A.tutorial(); await tut.go(${i}); await T.until(() => !tut.state().busy, 30000, 'step'); return 1;`, 60000);
      await sleep(id === 'stats' || id === 'charts' ? 1200 : 1600);
      const shot = await app.main.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${id}.jpg`);
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log(`${lang} ${path.basename(file)}`);
    }
    await app.run(`await A.tutorial().stop(); return 1;`);
    const errors = app.takeErrors();
    if (errors.length) console.log('page errors:', errors);
  }
  await app.run(`A.actions.updateSettings({ language: 'ko' }); return 1;`);
} finally {
  await app.stop();
}
spawnSync(process.execPath, [path.join(root, 'scripts', 'build-docs.mjs')], { cwd: root, stdio: 'inherit' });
