// Runs the in-app tutorial (the web build in headless Edge / Chrome, a private profile — nothing of the
// user's is touched) and records it:
//
//   node scripts/tutorial-capture.mjs docs [ko|en]  one picture per step → doc/images/{ko,en}/tutorial/NN-id.png,
//                                                   doc/Tutorial.md and doc/Tutorial.en.md written from the
//                                                   tutorial's own text, then the pages (scripts/build-docs.mjs)
//   node scripts/tutorial-capture.mjs video [ko|en] the whole tour on auto play → doc/video/MyHomeMaker-Tutorial(.en).mp4
//                                                   (H.264, silent) with a .json of chapter marks beside it, and a
//                                                   copy in the project folder. Needs ffmpeg (PATH, FFMPEG=…, or
//                                                   Chocolatey's). CRF=… sets the quality (default 24).
//   node scripts/tutorial-capture.mjs check         every step once in both languages, fails on page errors
//
//   npm run tutorial:docs · npm run tutorial:video · npm run tutorial:check
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../test/e2e/web-harness.mjs';
import { sleep } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'docs';
const languages = ['ko', 'en'].includes(process.argv[3]) ? [process.argv[3]] : mode === 'video' ? ['ko'] : ['ko', 'en'];
const WIDTH = 1440;
const HEIGHT = 900;
const P = 'window.__myhomemaker';
const tour = `${P}.tutorial()`;
const ready = (index) => `Boolean(${tour}?.state().active && ${tour}.state().index === ${index} && !${tour}.state().busy)`;

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-tour-'));
const built = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
if (built.status !== 0) process.exit(1);

const dicts = {};
for (const lang of ['ko', 'en']) dicts[lang] = (await import(pathToFileURL(path.join(root, 'src', 'i18n', `${lang}.js`)).href)).default;
const pad = (n) => String(n).padStart(2, '0');
const errors = [];
/** The tutorial's steps and chapters, read from the app (filled by the first page). */
let STEPS = [];
let CHAPTERS = [];

try {
  for (const language of languages) {
    const { page, close } = await launch(dist, { width: WIDTH, height: HEIGHT, language });
    page.errors = page.errors ?? [];
    try {
      await page.eval(`(() => { localStorage.clear(); localStorage.setItem('myhomemaker.settings.v1', JSON.stringify({ language: '${language}', theme: 'light', showWelcome: false, animationRandom: false, animation: 'aurora', tutorialDone: false })); return 1; })()`);
      await page.eval('window.__beforeReload = true, 1');
        await page.send('Page.reload');
      await page.waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!${P} && document.querySelector('#statusbar .status-notice')`, { timeout: 20000 });
      await sleep(600);
      ({ steps: STEPS, chapters: CHAPTERS } = await page.eval(`${P}.domain.tutorialInfo()`));
      if (mode === 'docs' || mode === 'check') {
        const outDir = path.join(root, 'doc', 'images', language, 'tutorial');
        if (mode === 'docs') { fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true }); }
        await page.eval(`(${P}.actions.startTutorial(), 1)`);
        for (let i = 0; i < STEPS.length; i++) {
          if (i > 0) await page.eval(`${tour}.go(${i}); 1`);
          await page.waitFor(ready(i), { timeout: 60000, message: `step ${i + 1}` });
          await sleep(mode === 'docs' ? 1300 : 300);
          if (mode === 'docs') await page.screenshot(path.join(outDir, `${pad(i + 1)}-${STEPS[i].id}.png`));
          process.stdout.write(`\r  [${language}] ${i + 1}/${STEPS.length} ${STEPS[i].id.padEnd(16)}`);
        }
        process.stdout.write('\n');
        await page.eval(`${tour}.stop().then(() => 1)`);
      } else if (mode === 'video') {
        await recordVideo(page, language);
      }
      errors.push(...(page.errors ?? []).map((e) => `[${language}] ${e}`));
    } finally {
      await close();
    }
  }
  if (mode === 'docs') {
    for (const language of ['ko', 'en']) writeDocument(language);
    execFileSync(process.execPath, [path.join(root, 'scripts', 'build-docs.mjs')], { stdio: 'inherit' });
  }
  if (errors.length) { console.error(`page errors:\n${errors.join('\n')}`); process.exitCode = 1; }
} finally {
  fs.rmSync(dist, { recursive: true, force: true });
}

/** The whole tour on auto play, recorded frame by frame (frames come when the picture changes). */
async function recordVideo(page, language) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-frames-'));
  const frames = [];
  page.on('Page.screencastFrame', (frame) => {
    const file = path.join(work, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(frame.data, 'base64'));
    frames.push({ file, time: frame.metadata.timestamp });
    page.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  // When each step starts (page clock): the chapter marks.
  await page.eval(`(() => { window.__tourTimes = {}; window.__tourTimer = setInterval(() => { const s = ${tour}?.state(); if (s?.active && !(s.index in window.__tourTimes)) window.__tourTimes[s.index] = Date.now() / 1000; }, 40); return 1; })()`);
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  await sleep(1500);
  await page.eval(`(${P}.actions.startTutorial({ autoplay: true }), 1)`);
  await page.waitFor(ready(STEPS.length - 1), { timeout: 30 * 60000, interval: 500, message: 'auto play reaches the last step' });
  await sleep((STEPS.at(-1).dwell ?? 5000) + 500);
  await page.send('Page.stopScreencast');
  const stepTimes = await page.eval(`(clearInterval(window.__tourTimer), window.__tourTimes)`);
  await page.eval(`${tour}.stop().then(() => 1)`);
  if (!frames.length) throw new Error('no frames were recorded');
  // Each frame is held until the next one (concat demuxer durations), so the video runs at real speed.
  const origin = frames[0].time;
  const offset = (time) => Math.round((time - origin) * 1000) / 1000;
  const endOf = (i) => offset(frames[i + 1]?.time ?? frames[i].time + 2);
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, endOf(i) - offset(f.time)).toFixed(3)}`).join('\n');
  const listFile = path.join(work, 'list.txt');
  fs.writeFileSync(listFile, `${list}\nfile '${frames.at(-1).file.replace(/\\/g, '/')}'\n`);
  const outDir = path.join(root, 'doc', 'video');
  fs.mkdirSync(outDir, { recursive: true });
  const name = `MyHomeMaker-Tutorial${language === 'ko' ? '' : `.${language}`}`;
  const out = path.join(outDir, `${name}.mp4`);
  const crf = process.env.CRF ?? '24';
  execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', crf, '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  const duration = endOf(frames.length - 1);
  const at = (index) => (stepTimes?.[index] != null ? Math.max(0, Math.round((stepTimes[index] - origin) * 100) / 100) : null);
  const steps = STEPS.map((step, index) => ({ id: step.id, chapter: step.chapter, start: at(index), title: dicts[language][`tutorial.${step.id}.title`] })).filter((s) => s.start != null);
  const chapters = CHAPTERS.map((id) => ({ id, start: steps.find((s) => s.chapter === id)?.start ?? null, title: dicts[language][`tutorial.chapter.${id}`] })).filter((c) => c.start != null);
  fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify({ version: 1, language, video: `${name}.mp4`, width: WIDTH, height: HEIGHT, duration: Math.round(duration * 100) / 100, recorded: new Date().toISOString(), chapters, steps }, null, 2)}\n`);
  fs.copyFileSync(out, path.join(root, `${name}.mp4`));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`  ${frames.length} frames → doc/video/${name}.mp4 (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${Math.round(duration)} s, ${chapters.length} chapters) · copied to ${name}.mp4`);
}

/** ffmpeg: FFMPEG=…, then PATH, then Chocolatey's shim on Windows. */
function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (process.platform === 'win32' && fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg is needed (PATH or FFMPEG=path)');
}

/** doc/Tutorial.md (Korean) and doc/Tutorial.en.md: the tutorial's own text, step by step, with its pictures. */
function writeDocument(language) {
  const d = dicts[language];
  const ko = language === 'ko';
  const video = `MyHomeMaker-Tutorial${ko ? '' : '.en'}.mp4`;
  const lines = ko ? [
    '# MyHomeMaker 튜토리얼 — 요즘 스타일 홈페이지 만들기',
    '',
    '이 문서는 앱 안의 **튜토리얼**을 단계별 화면과 함께 그대로 옮긴 것입니다. 빈 사이트에서 시작해 **4개 페이지(홈·요금제·소개·문의)** 로 된 AI 노트 앱 ‘플로우노트’의 홈페이지를 만들고, 디자인을 다듬고, 휴대폰에서 확인하고, 문제점과 맞춤법을 점검한 뒤 게시합니다.',
    '',
    '## 튜토리얼 실행하기',
    '',
    '- **시작 화면 › 튜토리얼 시작**, 툴바의 **튜토리얼** 버튼, **도움말 › 튜토리얼** 또는 **F11**.',
    '- 카드의 **다음 / 이전**으로 한 단계씩, **자동 재생**으로 끝까지 봅니다. 장 목록으로 원하는 장으로 바로 가고, **✕** 또는 **Esc**로 언제든 끝냅니다.',
    '- 어느 단계로 건너뛰어도 그 단계까지 만든 사이트가 그대로 나타납니다.',
    '- 튜토리얼은 자기 사이트에서만 작업합니다. 열어 둔 사이트는 바뀌지 않고, 바꾼 테마·언어·사전·보기 설정은 끝날 때 원래대로 돌아갑니다.',
    `- 전체 과정 동영상: \`doc/video/${video}\` (프로젝트 폴더에도 같은 파일이 있습니다). \`npm run tutorial:video\` 로 다시 만듭니다.`,
    '',
    '## 이 튜토리얼이 따르는 요즘 홈페이지의 흐름',
    '',
    '| 흐름 | 튜토리얼에서 |',
    '| --- | --- |',
    '| 한 문장으로 말하는 큰 첫 화면 | 대표 배너, 짧고 굵은 제목 |',
    '| 벤토 격자 | 특징 블록 2열 4칸 |',
    '| 신뢰를 보여 주기 | 로고, 숫자, 후기 |',
    '| 분명한 다음 행동 | 첫 화면 버튼, 고정된 머리글 버튼, 마지막 행동 유도 |',
    '| 다크 모드와 강조색 | 오로라 디자인, 분홍 강조색, 둥근 모서리 |',
    '| 휴대폰 우선 | 태블릿·휴대폰 너비, 미리 보기 |',
    '| 검색엔진과 접근성 | 사이트 설명·키워드, 그림 대체 글, 맞춤법 |',
    '| 빠르고 안전한 정적 사이트 | HTML·CSS 폴더나 ZIP으로 게시 |',
    '',
    '## 차례',
    '',
  ] : [
    '# MyHomeMaker tutorial — building an up-to-date website',
    '',
    'This document follows the in-app **Tutorial** step by step, with a picture of each step taken from the real app. Starting from an empty site it builds **four pages (Home, Pricing, About, Contact)** for “FlowNote”, an AI note app, then refines the design, checks it on a phone, checks the problems and the spelling, and publishes it.',
    '',
    '## Running the tutorial',
    '',
    '- **Start page › Start tutorial**, the **Tutorial** toolbar button, **Help › Tutorial** or **F11**.',
    '- In the card: **Next / Previous** one step at a time, **Auto play** to the end, the chapter list to jump to a chapter, **✕** or **Esc** to stop at any time.',
    '- Whichever step you jump to, the site appears as it is at that step.',
    '- The tutorial works on a site of its own. Your open sites are not changed, and the theme, language, dictionary and view settings it changes are put back when it ends.',
    `- A video of the whole tour: \`doc/video/${video}\` (the same file is in the project folder). \`npm run tutorial:video\` makes it again.`,
    '',
    '## What makes a website up to date — and where the tutorial does it',
    '',
    '| Trend | In the tutorial |',
    '| --- | --- |',
    '| One bold message on the first screen | the hero banner, a short strong title |',
    '| Bento grid | the Features block, two columns, four boxes |',
    '| Showing trust | logos, numbers, reviews |',
    '| One clear next step | the hero button, the sticky header button, the closing call to action |',
    '| Dark mode with a bright accent | the Aurora design, a pink accent, round corners |',
    '| Mobile first | tablet and phone widths, preview |',
    '| Search engines and accessibility | the site description and keywords, alt text, spelling |',
    '| A fast, safe static site | published as an HTML/CSS folder or a ZIP |',
    '',
    '## Contents',
    '',
  ];
  CHAPTERS.forEach((c, i) => lines.push(`${i + 1}. ${d[`tutorial.chapter.${c}`]}`));
  lines.push('');
  CHAPTERS.forEach((c, ci) => {
    lines.push(`## ${ci + 1}. ${d[`tutorial.chapter.${c}`]}`, '');
    for (const step of STEPS.filter((s) => s.chapter === c)) {
      const n = STEPS.indexOf(step) + 1;
      const title = d[`tutorial.${step.id}.title`];
      lines.push(`### ${n}. ${title}`, '', d[`tutorial.${step.id}.text`], '', `![${title}](images/${language}/tutorial/${pad(n)}-${step.id}.png)`, '');
    }
  });
  lines.push(ko ? '## 더 알아보기' : '## Learn more', '', ko ? '- 모든 기능은 [사용 설명서](UsersGuide.md)에 있습니다.' : "- Every feature is described in the [User's guide](UsersGuide.en.md).", ko ? '- 예제 36가지(파일 › 예제 열기)를 열어 블록과 디자인이 어떻게 짜였는지 보세요.' : '- Open one of the 36 samples (File › Open sample) to see how they are made.', '');
  fs.writeFileSync(path.join(root, 'doc', ko ? 'Tutorial.md' : 'Tutorial.en.md'), `${lines.join('\n')}`);
  console.log(`  doc/${ko ? 'Tutorial.md' : 'Tutorial.en.md'}: ${STEPS.length} steps`);
}
