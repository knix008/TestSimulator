// npm run docs:capture — screenshots for the user's guide and the tutorial, in both languages,
// taken from the real web app (Vite + headless Edge/Chrome over CDP):
//   docs/images/guide/<lang>/<name>.jpg     the user's guide pictures
//   docs/images/tutorial/<lang>/<nn>-<id>.jpg  one per tutorial step
// and writes Tutorial.md / Tutorial.en.md (each step's text next to its picture).
// Then run npm run build:docs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep, waitFor } from '../test/e2e/cdp.mjs';
import { STEP_TEXT, CHAPTERS, stepText, chapterName } from '../src/core/tutorial-text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ?? '';
const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: 1600, height: 940 });
const js = (e) => cdp.evaluate(e);
const shot = async (file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sleep(450);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
};
const open = (id, lang) => js(`(async () => { const { sampleModel } = await import('/src/core/samples.js'); window.__mysim.api.openModel(sampleModel(${JSON.stringify(id)}, ${JSON.stringify(lang)}), null); })()`);
const run = async () => { await js('window.__mysim.api.runPipeline()'); await waitFor(async () => !(await js('window.__mysim.state.running')), 120000, 150); };
const close = () => js('document.querySelectorAll(".popup-backdrop").forEach((b) => b.remove()); window.__mysim.closeMenu()');
const select = (id) => js(`window.__mysim.api.select({ kind: 'node', ids: [${JSON.stringify(id)}] })`);

try {
  await js('localStorage.setItem("mysim.inlineWindows", "1")');
  for (const lang of ['ko', 'en']) {
    await js(`window.__mysim.api.patchSettings({ language: ${JSON.stringify(lang)}, theme: 'dark', tutorialDone: true, showStartPage: true })`);
    const dir = path.join(root, 'docs', 'images', 'guide', lang);
    if (!only || only === 'guide') {
      await js('window.__mysim.api.showStart(true)');
      await shot(path.join(dir, 'start.jpg'));
      await open('signalCleanup', lang);
      await run();
      await select('lp');
      await shot(path.join(dir, 'main.jpg'));
      await js('window.__mysim.api.setView("dashboard")');
      await shot(path.join(dir, 'dashboard.jpg'));
      await js('window.__mysim.api.setView("data")');
      await shot(path.join(dir, 'data.jpg'));
      await js('window.__mysim.api.setView("graph")');
      await js('void window.__mysim.run("nodeLibrary")');
      await shot(path.join(dir, 'library.jpg'));
      await close();
      await open('pidControl', lang);
      await run();
      await select('pid');
      await js('window.__mysim.api.setView("dashboard")');
      await shot(path.join(dir, 'control.jpg'));
      await open('lorenz', lang);
      await run();
      await select('lor');
      await js('window.__mysim.api.setView("3d")');
      await shot(path.join(dir, '3d.jpg'));
      for (const [id, name] of [['tolerance', 'montecarlo'], ['classification', 'ml'], ['optimization', 'optimization'], ['chirpSpectrogram', 'spectrogram'], ['pidSweep', 'sweep']]) {
        await open(id, lang);
        await run();
        await js('window.__mysim.api.setView("dashboard")');
        await shot(path.join(dir, `${name}.jpg`));
      }
      await open('python', lang);
      await select('py');
      await js('window.__mysim.api.setView("graph")');
      await shot(path.join(dir, 'python.jpg'));
      await js('void window.__mysim.run("exportReport")');
      await sleep(600);
      await shot(path.join(dir, 'report.jpg'));
      await close();
      await js('void window.__mysim.run("settings")');
      await shot(path.join(dir, 'settings.jpg'));
      await close();
      await js('window.__mysim.run("closeOthers")');
    }
    if (!only || only === 'tutorial') {
      // The tutorial: every step as the tour shows it.
      const tdir = path.join(root, 'docs', 'images', 'tutorial', lang);
      fs.rmSync(tdir, { recursive: true, force: true });
      await js('window.__mysim.api.startTutorial()');
      const count = await js('window.__mysim.tutorial.state().total');
      const lines = [];
      const T = lang === 'en'
        ? { title: '# MySimulator Tutorial', intro: 'The in-app tutorial (Help › Tutorial, or the 🎓 button on the start page) moves the real screen through every step below. This document shows the same steps with a picture of each.', chapter: 'Chapter' }
        : { title: '# MySimulator 튜토리얼', intro: '프로그램 안의 튜토리얼(도움말 › 튜토리얼, 시작 화면의 🎓 단추)은 아래 단계를 실제 화면을 움직이며 보여 줍니다. 이 문서는 같은 단계를 그림과 함께 보여 줍니다.', chapter: '장' };
      lines.push(T.title, '', T.intro, '');
      let chapter = null;
      for (let i = 0; i < count; i++) {
        await js(`window.__mysim.tutorial.go(${i})`);
        await waitFor(async () => !(await js('window.__mysim.tutorial.busy')), 40000, 120);
        const id = await js('window.__mysim.tutorial.state().id');
        const name = `${String(i + 1).padStart(2, '0')}-${id}`;
        await shot(path.join(tdir, `${name}.jpg`));
        const step = STEP_TEXT[id];
        if (step.chapter !== chapter) {
          chapter = step.chapter;
          lines.push(`## ${chapterName(chapter, lang)}`, '');
        }
        const text = stepText(id, lang);
        lines.push(`### ${i + 1}. ${text.title}`, '', text.text, '', `![${text.title}](docs/images/tutorial/${lang}/${name}.jpg)`, '');
      }
      await js('window.__mysim.tutorial.stop()');
      fs.writeFileSync(path.join(root, lang === 'en' ? 'Tutorial.en.md' : 'Tutorial.md'), `${lines.join('\n')}\n`);
      void CHAPTERS;
    }
  }
  console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'pictures taken, no page errors');
} finally {
  await stop();
  vite.stop();
  process.exit(0);
}
