// Runs the in-app tutorial in the real desktop app (debug build, its own profile
// and data folder — nothing of the user's is touched) and records it:
//
//   node scripts/tutorial-capture.mjs docs    one screenshot per step → docs/tutorial/images/,
//                                             docs/tutorial/README.md (Korean) + README.en.md,
//                                             then the HTML pages (scripts/build-docs.mjs)
//   node scripts/tutorial-capture.mjs video   the whole tour on auto play → MyUMLMaker-Tutorial.mp4
//                                             in the project root (needs ffmpeg on PATH)
//   node scripts/tutorial-capture.mjs check   every step once, fails on page errors
//
// Needs `cargo build` (src-tauri/target/debug) like the E2E tests.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sleep } from '../test/e2e/cdp.mjs';
import { App, root } from '../test/e2e/harness.mjs';
import { slugify } from './build-docs.mjs';

const mode = process.argv[2] ?? 'docs';
const P = 'window.__myumlmaker';
const WIDTH = 1440;
const HEIGHT = 900;

const app = new App();
await app.start();
const page = app.main;
const evalJs = (code) => page.eval(code);
// The first-run welcome popup is not part of the tour.
await app.popup('welcome', 4000).then((p) => p.close()).catch(() => {});
await evalJs(`${P}.popups.closeAll().then(() => 1)`).catch(() => {});
await evalJs(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${WIDTH}, height: ${HEIGHT} } } }).then(() => 1)`);
await evalJs(`window.__TAURI_INTERNALS__.invoke('plugin:window|center', { label: 'main' }).then(() => 1, () => 1)`);
await sleep(800);

const steps = await evalJs(`(async () => (await import('/src/ui/tutorial.js')).STEPS.map((s) => ({ id: s.id, chapter: s.chapter })))()`);
const chapters = await evalJs(`(async () => (await import('/src/ui/tutorial.js')).CHAPTERS)()`);
const tour = `${P}.tutorial()`;
// Null-safe and "active": the tutorial object exists only after the first start, and before it starts its state reads "step 0, not busy".
const ready = (index) => `Boolean(${tour}?.state().active && ${tour}.state().index === ${index} && !${tour}.state().busy)`;
const waitStep = (index, timeout = 60000) => page.waitFor(ready(index), { timeout, message: `tutorial step ${index + 1}` });
const errors = [];
page.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));

try {
  if (mode === 'docs' || mode === 'check') {
    const outDir = path.join(root, 'docs', 'tutorial', 'images');
    if (mode === 'docs') { fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true }); }
    // The dev server may reload the page once while it prepares modules: wait until the app is there again.
    await page.waitFor(`Boolean(${P}?.actions && document.querySelector('#toolbar .tool-button'))`, { timeout: 40000, message: 'the app is ready' });
    await evalJs(`(${P}.actions.startTutorial(), 1)`);
    for (let i = 0; i < steps.length; i++) {
      if (i > 0) await evalJs(`${tour}.next(); 1`);
      await waitStep(i);
      await sleep(1200); // let the step settle (animations, popups opening)
      if (mode === 'docs') {
        const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        fs.writeFileSync(path.join(outDir, `${String(i + 1).padStart(2, '0')}-${steps[i].id}.jpg`), Buffer.from(shot.result.data, 'base64'));
      }
      process.stdout.write(`\r${i + 1}/${steps.length} ${steps[i].id}                    `);
    }
    process.stdout.write('\n');
    await evalJs(`${tour}.stop().then(() => 1)`);
    if (mode === 'docs') {
      await writeDocs(steps, chapters);
      execFileSync(process.execPath, [path.join(root, 'scripts', 'build-docs.mjs')], { stdio: 'inherit' });
    }
  } else if (mode === 'video') {
    const frameDir = fs.mkdtempSync(path.join(app.work, 'frames-'));
    const frames = [];
    page.on('Page.screencastFrame', (frame) => {
      const file = path.join(frameDir, `${String(frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(frame.data, 'base64'));
      frames.push({ file, time: frame.metadata.timestamp });
      page.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
    await sleep(500);
    await evalJs(`(${P}.actions.startTutorial({ autoplay: true }), 1)`);
    await page.waitFor(ready(steps.length - 1), { timeout: 30 * 60000, message: 'auto play reaches the last step' });
    await sleep(6000);
    await page.send('Page.stopScreencast');
    await evalJs(`${tour}.stop().then(() => 1)`);
    // Frames come only when something changes: hold each one until the next (concat demuxer durations).
    const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.04, ((frames[i + 1]?.time ?? f.time + 2) - f.time)).toFixed(3)}`).join('\n');
    const listFile = path.join(frameDir, 'list.txt');
    fs.writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`);
    const out = path.join(root, 'MyUMLMaker-Tutorial.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', out], { stdio: 'inherit' });
    console.log(`${frames.length} frames → ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
  }
  if (errors.length) {
    console.error(`page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await app.stop();
}

/** docs/tutorial/README.md (Korean) and README.en.md from the tutorial's own text and the screenshots. */
async function writeDocs(list, chapterIds) {
  const dicts = {};
  for (const lang of ['ko', 'en']) dicts[lang] = (await import(pathToFileURL(path.join(root, 'src', 'i18n', `${lang}.js`)).href)).default;
  const intro = {
    ko: [
      '# MyUMLMaker 튜토리얼',
      '',
      '이 문서는 앱 안의 **튜토리얼**과 같은 내용을 단계별 화면과 함께 보여 줍니다. 그림은 실제 앱에서 튜토리얼을 실행하며 찍은 것입니다 (`npm run tutorial:docs` 로 다시 만듭니다).',
      '',
      '## 튜토리얼 실행하기',
      '',
      '- **시작 페이지 › 튜토리얼 시작**, 툴바의 **튜토리얼** 버튼, **도움말 › 튜토리얼** 또는 **F11**을 누릅니다.',
      '- 카드의 **다음 / 이전**으로 한 단계씩, **자동 재생**으로 끝까지 봅니다. 장 목록으로 원하는 장으로 바로 가고, **✕** 또는 **Esc**로 언제든 끝냅니다.',
      '- 튜토리얼은 자기 예제 탭에서만 작업합니다. 열어 둔 계획은 바뀌지 않고, 바꾼 테마·언어·보기 설정은 끝날 때 원래대로 돌아갑니다.',
      '- 전체 과정을 녹화한 동영상: 프로젝트 루트의 `MyUMLMaker-Tutorial.mp4`.',
      '',
    ],
    en: [
      '# MyUMLMaker tutorial',
      '',
      'This document follows the in-app **Tutorial** step by step, with a screenshot of each step taken from the real app (`npm run tutorial:docs` makes them again).',
      '',
      '## Running the tutorial',
      '',
      '- **Start page › Start tutorial**, the **Tutorial** toolbar button, **Help › Tutorial** or **F11**.',
      '- In the card: **Next / Previous** one step at a time, **Auto play** to the end, the chapter list to jump to a chapter, **✕** or **Esc** to stop at any time.',
      '- The tutorial works only in its own sample tab. Your open drawings are not changed, and the theme, language and view settings it changes are put back when it ends.',
      '- A recording of the whole tour: `MyUMLMaker-Tutorial.mp4` in the project root.',
      '',
    ],
  };
  for (const lang of ['ko', 'en']) {
    const d = dicts[lang];
    const lines = [...intro[lang], lang === 'ko' ? '## 차례' : '## Contents', ''];
    // Links to the heading anchors build-docs makes (no raw HTML: the page builder prints it as text).
    chapterIds.forEach((c, i) => lines.push(`${i + 1}. [${d[`tutorial.chapter.${c}`]}](#${slugify(`${i + 1}. ${d[`tutorial.chapter.${c}`]}`)})`));
    lines.push('');
    chapterIds.forEach((c, ci) => {
      lines.push(`## ${ci + 1}. ${d[`tutorial.chapter.${c}`]}`, '');
      for (const step of list.filter((s) => s.chapter === c)) {
        const n = list.indexOf(step) + 1;
        const image = `images/${String(n).padStart(2, '0')}-${step.id}.jpg`;
        const title = d[`tutorial.${step.id}.title`];
        lines.push(`### ${n}. ${title}`, '', d[`tutorial.${step.id}.text`], '', `![${title}](${image})`, '');
      }
    });
    fs.writeFileSync(path.join(root, 'docs', 'tutorial', lang === 'ko' ? 'README.md' : 'README.en.md'), `${lines.join('\n')}\n`);
  }
  console.log('docs/tutorial/README.md, README.en.md');
}
