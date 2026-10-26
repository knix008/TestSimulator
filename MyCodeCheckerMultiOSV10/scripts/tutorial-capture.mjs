// npm run tutorial:capture — runs every tutorial step in the real (web) app,
// screenshots it, and writes the tutorial document from the same step texts:
//
//   docs/images/tutorial/<ko|en>/<NN>-<id>.jpg
//   Tutorial.md / Tutorial.en.md   (then scripts/build-docs.mjs → docs/Tutorial*.html)
//
// Vite (own free port, isolated MCC_USER_DATA) + headless Edge/Chrome over
// CDP (test/e2e/cdp.mjs) at 1360×840, so the pictures always match the
// current UI. A step whose outline target is missing is reported and the run
// fails (exit 1).
//
// Options (also as env): --langs ko,en (TUTORIAL_LANGS) · --limit N (only the
// first N steps; no documents are written) · --out <dir> (images somewhere
// else; no documents) · --theme <id> (default midnight).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startVite, launchBrowser, sleep, ENSURE_TOUR } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, env, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return process.env[env] ?? fallback;
};
const languages = String(opt('langs', 'TUTORIAL_LANGS', 'ko,en')).split(',').map((s) => s.trim()).filter(Boolean);
const limit = Number(opt('limit', 'TUTORIAL_LIMIT', 0)) || 0;
const outArg = opt('out', 'TUTORIAL_OUT', '');
const theme = opt('theme', 'TUTORIAL_THEME', 'midnight');
const images = outArg ? path.resolve(outArg) : path.join(root, 'docs', 'images', 'tutorial');
const writeDocs = !limit && !outArg;
const WIDTH = 1360;
const HEIGHT = 840;

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: WIDTH, height: HEIGHT });
const problems = [];
let steps = [];
try {
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } }).catch(() => {});
  if (!(await cdp.evaluate(ENSURE_TOUR))) throw new Error('window.__mcc.tutorial is missing');
  steps = await cdp.evaluate('window.__mcc.tutorial.steps.map((s) => ({ id: s.id, chapter: s.chapter, target: s.target, text: s.text }))');
  const chapters = await cdp.evaluate('window.__mcc.tutorial.chapters');
  const count = limit ? Math.min(limit, steps.length) : steps.length;
  const width = Math.max(2, String(steps.length).length);
  for (const lang of languages) {
    const dir = path.join(images, lang);
    if (!limit) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await cdp.evaluate(`(async () => { window.__mcc.action('theme:${theme}'); window.__mcc.action('lang:${lang}'); await new Promise((r) => setTimeout(r, 400)); return 1; })()`);
    await cdp.evaluate(ENSURE_TOUR);
    await cdp.evaluate('window.__mcc.tutorial.start({ index: 0 })');
    for (let i = 0; i < count; i++) {
      const step = steps[i];
      await cdp.evaluate(`window.__mcc.tutorial.go(${i})`);
      await sleep(650);
      const state = await cdp.evaluate('window.__mcc.tutorial.state()');
      if (state.missing) problems.push(`${lang} ${i + 1} ${step.id}: none of ${step.target.join(' | ')}`);
      const file = path.join(dir, `${String(i + 1).padStart(width, '0')}-${step.id}.jpg`);
      await cdp.screenshot(file, { format: 'jpeg', quality: 80 });
      process.stdout.write(`\r  ${lang} ${String(i + 1).padStart(3)}/${count} ${step.id.padEnd(22)}${state.missing ? ' (target missing)' : '                 '}`);
    }
    await cdp.evaluate('window.__mcc.tutorial.stop()');
    process.stdout.write('\n');
    if (writeDocs) writeDocument(lang, steps, chapters, width);
  }
  if (errors.length) problems.push(...errors.map((e) => `page error: ${e}`));
} finally {
  stop();
  vite.stop();
}

function writeDocument(lang, list, chapters, width) {
  const en = lang === 'en';
  const name = (id) => { const c = chapters.find((x) => x.id === id); return c ? (en ? c.en : c.ko) : id; };
  const lines = [
    en ? '# MyCodeChecker Tutorial' : '# MyCodeChecker 튜토리얼',
    '',
    en
      ? 'This tutorial walks through MyCodeChecker on the real screen, from the start page to analysing a project, handling issues, AI code fix, defects from defect analysis, compliance reports, administration and settings. The same steps run inside the program: **Help › Start tutorial** (or **Start tutorial** on the start page) moves the window for you, with previous / next, auto play and a chapter list on a card at the bottom right.'
      : '이 튜토리얼은 시작 화면부터 프로젝트 분석, 이슈 처리, AI 코드 수정, 정밀 결함 분석, 규정 보고서, 관리와 설정까지 MyCodeChecker 를 실제 화면으로 따라갑니다. 같은 단계가 프로그램 안에서도 실행됩니다 — **도움말 › 튜토리얼 시작** (또는 시작 화면의 **튜토리얼 시작**) 을 누르면 오른쪽 아래 카드의 이전 / 다음, 자동 재생, 장 목록으로 화면이 직접 움직입니다.',
    '',
    en ? '## Contents' : '## 차례',
    '',
    ...chapters.map((c, n) => `${n + 1}. ${en ? c.en : c.ko}`),
    '',
  ];
  let chapter = null;
  let chapterNo = 0;
  list.forEach((step, i) => {
    const text = step.text[en ? 'en' : 'ko'];
    if (step.chapter !== chapter) {
      chapter = step.chapter;
      chapterNo += 1;
      lines.push(`## ${chapterNo}. ${name(chapter)}`, '');
    }
    lines.push(`### ${i + 1}. ${text.title}`, '', `![${text.title}](docs/images/tutorial/${lang}/${String(i + 1).padStart(width, '0')}-${step.id}.jpg)`, '', text.body, '');
  });
  lines.push('---', '', en ? 'See the [user\'s guide](UsersGuide.en.md) for every feature in detail.' : '모든 기능의 자세한 설명은 [사용 설명서](UsersGuide.md) 에 있습니다.', '', '© SHKWON (knix008@naver.com)', '');
  fs.writeFileSync(path.join(root, en ? 'Tutorial.en.md' : 'Tutorial.md'), lines.join('\n'));
}

if (writeDocs && !problems.length) {
  const { build } = await import(pathToFileURL(path.join(root, 'scripts', 'build-docs.mjs')).href);
  const { written } = build();
  console.log(`build-docs: ${written.length} pages`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exitCode = 1;
} else if (writeDocs) {
  console.log(`\nTutorial.md, Tutorial.en.md, docs/images/tutorial/ (${languages.join(', ')}) and docs/Tutorial*.html written.`);
} else {
  console.log(`\n${limit || steps.length} step(s) captured to ${images} (dry run: documents not written).`);
}
