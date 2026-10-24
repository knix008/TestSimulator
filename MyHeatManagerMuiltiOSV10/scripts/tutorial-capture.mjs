// npm run tutorial:capture — runs every tutorial step in the real (web) app,
// screenshots it, and writes the tutorial document from the same step texts:
//
//   docs/images/tutorial/<ko|en>/<NN>-<id>.jpg
//   Tutorial.md / Tutorial.en.md   (then npm run build:docs → docs/Tutorial*.html)
//
// Uses Vite + headless Edge/Chrome over CDP (test/e2e/cdp.mjs) at a fixed
// window size, so the pictures always match the current UI. A step whose
// outline target is missing is reported and the run fails (exit 1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep } from '../test/e2e/cdp.mjs';
import { CHAPTERS, STEP_TEXT } from '../src/core/tutorial-text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = path.join(root, 'docs', 'images', 'tutorial');
const languages = (process.env.TUTORIAL_LANGS ?? 'ko,en').split(',');

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: 1360, height: 840 });
const problems = [];
try {
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } }).catch(() => {});
  const steps = await cdp.evaluate('(async () => (await import("/src/ui/tutorial.js")).STEPS.map((s) => ({ id: s.id, target: s.target, chapter: s.chapter })))()');
  for (const lang of languages) {
    fs.rmSync(path.join(images, lang), { recursive: true, force: true });
    fs.mkdirSync(path.join(images, lang), { recursive: true });
    await cdp.evaluate(`window.__myheat.api.patchSettings({ language: '${lang}', theme: 'dark', tutorialDone: false })`);
    // A fresh empty tab named in this language (the first one was made in the previous language).
    await cdp.evaluate('window.__myheat.api.closeDocForce(window.__myheat.doc().id)');
    await sleep(300);
    await cdp.evaluate('window.__myheat.tutorial.start({ index: 0 })');
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await cdp.evaluate(`window.__myheat.tutorial.go(${i})`);
      await sleep(step.id === 'view3d' ? 1500 : 700);
      // Redraw the card so the outline follows the final layout.
      await cdp.evaluate(`(() => { const t = window.__myheat.tutorial; import('/src/ui/tutorial.js').then((m) => t.draw(m.STEPS[t.index])); })()`);
      await sleep(250);
      const found = await cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(step.target)}))`);
      if (!found) problems.push(`${lang} ${i + 1} ${step.id}: no ${step.target}`);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 74 });
      fs.writeFileSync(path.join(images, lang, `${String(i + 1).padStart(2, '0')}-${step.id}.jpg`), Buffer.from(data, 'base64'));
      process.stdout.write(`\r  ${lang} ${i + 1}/${steps.length} ${step.id.padEnd(18)}`);
    }
    await cdp.evaluate('window.__myheat.tutorial.stop()');
    process.stdout.write('\n');
    writeDocument(lang, steps);
  }
  if (errors.length) problems.push(...errors.map((e) => `page error: ${e}`));
} finally {
  stop();
  vite.stop();
}

function writeDocument(lang, steps) {
  const en = lang === 'en';
  const lines = [
    en ? '# MyHeatManager Tutorial' : '# MyHeatManager 튜토리얼',
    '',
    en
      ? 'This tutorial walks through MyHeatManager on the real screen, from the start page to drawing a model, solving it and reading the results. The same steps run inside the program: **Help › Tutorial** (or **Start the tutorial** on the start page) moves the window for you, with previous / next, auto play and a chapter list on a card at the bottom right.'
      : '이 튜토리얼은 시작 화면부터 모델 그리기, 해석, 결과 읽기까지 MyHeatManager 를 실제 화면으로 따라갑니다. 같은 단계가 프로그램 안에서도 실행됩니다 — **도움말 › 튜토리얼** (또는 시작 화면의 **튜토리얼 시작**) 을 누르면 오른쪽 아래 카드의 이전 / 다음, 자동 재생, 장 목록으로 화면이 직접 움직입니다.',
    '',
    en ? '## Contents' : '## 차례',
    '',
    ...Object.keys(CHAPTERS).map((id, n) => `${n + 1}. ${CHAPTERS[id][en ? 1 : 0]}`),
    '',
  ];
  let chapter = null;
  let chapterNo = 0;
  steps.forEach((step, i) => {
    const text = STEP_TEXT[step.id][en ? 'en' : 'ko'];
    if (step.chapter !== chapter) {
      chapter = step.chapter;
      chapterNo += 1;
      lines.push(`## ${chapterNo}. ${CHAPTERS[chapter][en ? 1 : 0]}`, '');
    }
    lines.push(`### ${i + 1}. ${text.title}`, '', `![${text.title}](docs/images/tutorial/${lang}/${String(i + 1).padStart(2, '0')}-${step.id}.jpg)`, '', text.text, '');
  });
  lines.push('---', '', en ? 'See the [user\'s guide](UsersGuide.en.md) for every feature in detail.' : '모든 기능의 자세한 설명은 [사용 설명서](UsersGuide.md) 에 있습니다.', '', '© SHKWON (knix008@naver.com)', '');
  fs.writeFileSync(path.join(root, en ? 'Tutorial.en.md' : 'Tutorial.md'), lines.join('\n'));
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`\nTutorial.md, Tutorial.en.md and docs/images/tutorial/ written (${languages.join(', ')}). Run npm run build:docs next.`);
}
