// npm run tutorial:capture — runs every tutorial step in the real (web) app, screenshots it, and writes
// the tutorial document from the same step texts (then build:docs makes docs/Tutorial*.html):
//
//   docs/images/tutorial/<ko|en>/<NN>-<id>.jpg
//   Tutorial.md / Tutorial.en.md
//
// Vite + headless Edge/Chrome over CDP (test/e2e/web.harness.mjs) at a fixed window size, so the pictures
// always match the current UI. A step whose outline target is missing fails the run (exit 1).
// TUTORIAL_LANGS=ko,en (default both) · THEME=light|dark (default light).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWeb } from '../test/e2e/web.harness.mjs';
import { sleep } from '../test/e2e/cdp.mjs';
import { CHAPTERS, STEP_TEXT } from '../src/domain/tutorial-text.js';
import { STEPS } from '../src/ui/tutorial.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = path.join(root, 'docs', 'images', 'tutorial');
const languages = (process.env.TUTORIAL_LANGS ?? 'ko,en').split(',');
const theme = process.env.THEME ?? 'light';
const problems = [];

/** Waits while a step runs (its state: opening a sample, training …), polling from outside the page. */
async function settle(page) {
  for (let k = 0; k < 120 && (await page.eval('String(__mytrainer.tutorial.state().busy)')) === 'true'; k++) await sleep(250);
  await sleep(700); // the outline and the card glide into place
}

for (const lang of languages) {
  const { page, close } = await startWeb({ width: 1440, height: 900, storage: { 'mytrainer.settings.v1': { language: lang, showStartPage: true, theme } } });
  try {
    fs.rmSync(path.join(images, lang), { recursive: true, force: true });
    fs.mkdirSync(path.join(images, lang), { recursive: true });
    await sleep(1500);
    // Still pictures: no gliding outline or card (a shot during the glide shows them halfway).
    await page.eval(`(() => { const s = document.createElement('style'); s.textContent = '.tutorial-spot, .tutorial-card { transition: none !important; }'; document.head.append(s); return 1; })()`);
    await page.eval('(() => { __mytrainer.tutorial.start({ index: 0 }); return 1; })()');
    for (let i = 0; i < STEPS.length; i++) {
      const [id] = STEPS[i];
      await page.eval(`(() => { __mytrainer.tutorial.go(${i}); return 1; })()`);
      await settle(page);
      const found = await page.eval('String(!document.querySelector(".tutorial-spot").hidden)');
      if (found !== 'true') problems.push(`${lang} ${i + 1} ${id}: the target is not on the screen`);
      const { result: { data } } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
      fs.writeFileSync(path.join(images, lang, `${String(i + 1).padStart(2, '0')}-${id}.jpg`), Buffer.from(data, 'base64'));
      process.stdout.write(`\r  ${lang} ${i + 1}/${STEPS.length} ${id.padEnd(16)}`);
    }
    await page.eval('(() => { __mytrainer.tutorial.stop(); return 1; })()');
    process.stdout.write('\n');
    writeDocument(lang);
  } finally {
    await close();
  }
}

function writeDocument(lang) {
  const en = lang === 'en';
  const text = new Map(STEP_TEXT.map(([id, chapter, koTitle, koText, enTitle, enText]) => [id, { chapter, title: en ? enTitle : koTitle, text: en ? enText : koText }]));
  const lines = [
    en ? '# MyTrainer Tutorial' : '# MyTrainer 튜토리얼',
    '',
    en
      ? 'This tutorial walks through MyTrainer on the real screen: opening a sample, its data and model, training it live, looking at the neurons, testing, the generated PyTorch code, comparing models and exporting. The same steps run inside the program — **Help › Start the tutorial** (or **Start the tutorial** on the start page or in the welcome window) outlines each part of the window with a card beside it: Next / Back, or → / ← and Esc. **Help › Tutorial video** shows it as a video.'
      : '이 튜토리얼은 예제 열기, 데이터와 모델, 실시간 학습, 뉴런 보기, 테스트, PyTorch 코드, 모델 비교, 내보내기까지 MyTrainer 를 실제 화면으로 따라갑니다. 같은 단계가 프로그램 안에서도 실행됩니다 — **도움말 › 튜토리얼 시작** (또는 시작 화면 · 시작 안내 창의 **튜토리얼 시작**) 을 누르면 화면의 각 부분을 강조하고 옆에 설명 카드를 띄웁니다: [다음] / [이전], 또는 → / ← 와 Esc. **도움말 › 튜토리얼 영상** 으로 영상으로도 볼 수 있습니다.',
    '',
    en ? '## Contents' : '## 차례',
    '',
    ...Object.keys(CHAPTERS).map((id, n) => `${n + 1}. ${CHAPTERS[id][lang]}`),
    '',
  ];
  let chapter = null;
  let chapterNo = 0;
  STEPS.forEach(([id], i) => {
    const step = text.get(id);
    if (step.chapter !== chapter) {
      chapter = step.chapter;
      chapterNo += 1;
      lines.push(`## ${chapterNo}. ${CHAPTERS[chapter][lang]}`, '');
    }
    lines.push(`### ${i + 1}. ${step.title}`, '', `![${step.title}](docs/images/tutorial/${lang}/${String(i + 1).padStart(2, '0')}-${id}.jpg)`, '', step.text, '');
  });
  lines.push('---', '', en ? 'See the [user\'s guide](UsersGuide.en.md) for every feature in detail.' : '모든 기능의 자세한 설명은 [사용 설명서](UsersGuide.md) 에 있습니다.', '', '© SHKWON (knix008@naver.com)', '');
  fs.writeFileSync(path.join(root, en ? 'Tutorial.en.md' : 'Tutorial.md'), lines.join('\r\n'));
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`\nTutorial.md, Tutorial.en.md and docs/images/tutorial/ written (${languages.join(', ')}).`);
}
