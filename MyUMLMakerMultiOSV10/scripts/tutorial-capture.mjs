// Runs the in-app tutorial in the real desktop app (debug build, its own profile
// and data folder — nothing of the user's is touched) and records it:
//
//   node scripts/tutorial-capture.mjs docs    one screenshot per step → docs/tutorial/images/,
//                                             docs/tutorial/README.md (Korean) + README.en.md,
//                                             then the HTML pages (scripts/build-docs.mjs)
//   node scripts/tutorial-capture.mjs video   the whole tour on auto play → docs/video/MyUMLMaker-Tutorial.mp4
//                                             (H.264, yuv420p, faststart) and MyUMLMaker-Tutorial.json beside it
//                                             (start time of every step and chapter, for the player's chapter
//                                             marks). Needs ffmpeg (PATH, FFMPEG=…, or Chocolatey's). CRF=… overrides
//                                             the quality (default 24; lower = sharper and larger).
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
        // A capture can come back empty while the page is busy (a popup frame loading): try again.
        let shot = null;
        for (let attempt = 0; attempt < 5 && !shot?.result?.data; attempt++) {
          if (attempt) await sleep(800);
          shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }).catch(() => null);
        }
        if (!shot?.result?.data) throw new Error(`step ${i + 1} (${steps[i].id}): no screenshot (${shot?.error?.message ?? 'empty'})`);
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
    await page.waitFor(`Boolean(${P}?.actions && document.querySelector('#toolbar .tool-button'))`, { timeout: 40000, message: 'the app is ready' });
    // When each step starts (page clock, ms): the chapter marks of the player.
    await evalJs(`(() => { window.__tourTimes = {}; window.__tourTimer = setInterval(() => { const s = ${tour}?.state(); if (s?.active && !(s.index in window.__tourTimes)) window.__tourTimes[s.index] = Date.now(); }, 40); return 1; })()`);
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
    await sleep(500);
    await evalJs(`(${P}.actions.startTutorial({ autoplay: true }), 1)`);
    await page.waitFor(ready(steps.length - 1), { timeout: 30 * 60000, message: 'auto play reaches the last step' });
    await sleep(6000);
    await page.send('Page.stopScreencast');
    const stepTimes = await evalJs(`(clearInterval(window.__tourTimer), window.__tourTimes)`);
    await evalJs(`${tour}.stop().then(() => 1)`);
    // Frames come only when something changes: hold each one until the next (concat demuxer durations). The
    // durations follow the real clock exactly (from rounded offsets, so rounding never adds up): the video runs at
    // real speed and the step times of the sidecar match it. (A minimum per frame stretched the video by a third.)
    const origin = frames[0].time;
    const offset = (time) => Math.round((time - origin) * 1000) / 1000;
    const endOf = (i) => offset(frames[i + 1]?.time ?? frames[i].time + 2);
    const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, endOf(i) - offset(f.time)).toFixed(3)}`).join('\n');
    const listFile = path.join(frameDir, 'list.txt');
    fs.writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`);
    const outDir = path.join(root, 'docs', 'video');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, 'MyUMLMaker-Tutorial.mp4');
    // Screen content: mostly still pictures with sharp text. -tune stillimage and a keyframe every 4 s
    // (chapter jumps seek quickly) keep the ~7 minute tour small without blurring the text.
    const crf = process.env.CRF ?? '24';
    execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:out_range=tv,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`, '-color_range', 'tv',
      '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', crf, '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
    const duration = endOf(frames.length - 1);
    await writeVideoChapters(path.join(outDir, 'MyUMLMaker-Tutorial.json'), steps, chapters, stepTimes, origin, duration);
    console.log(`${frames.length} frames → ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${duration.toFixed(0)} s, CRF ${crf})`);
  }
  if (errors.length) {
    console.error(`page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await app.stop();
}

/** ffmpeg: FFMPEG=…, then PATH, then Chocolatey's shim on Windows. */
function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (process.platform === 'win32' && fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg 가 필요합니다 (PATH 또는 FFMPEG=경로)');
}

/**
 * The player's chapter marks: docs/video/MyUMLMaker-Tutorial.json with the start (seconds into the video) and the
 * Korean and English title of every step and chapter. `stepTimes` are page-clock ms per step index, `origin` the
 * first frame's time (s).
 */
async function writeVideoChapters(file, list, chapterIds, stepTimes, origin, duration) {
  const dicts = {};
  for (const lang of ['ko', 'en']) dicts[lang] = (await import(pathToFileURL(path.join(root, 'src', 'i18n', `${lang}.js`)).href)).default;
  const title = (key) => ({ ko: dicts.ko[key], en: dicts.en[key] });
  const at = (index) => (stepTimes?.[index] != null ? Math.max(0, Math.round((stepTimes[index] / 1000 - origin) * 100) / 100) : null);
  const stepsOut = list.map((step, index) => ({ id: step.id, chapter: step.chapter, start: at(index), title: title(`tutorial.${step.id}.title`) })).filter((step) => step.start != null);
  const chaptersOut = chapterIds.map((id) => ({ id, start: stepsOut.find((step) => step.chapter === id)?.start ?? null, title: title(`tutorial.chapter.${id}`) })).filter((c) => c.start != null);
  const data = { version: 1, video: path.basename(file).replace(/\.json$/, '.mp4'), width: WIDTH, height: HEIGHT, duration: Math.round(duration * 100) / 100, recorded: new Date().toISOString(), chapters: chaptersOut, steps: stepsOut };
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${path.relative(root, file)}: ${chaptersOut.length} chapters, ${stepsOut.length} steps`);
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
      '- 전체 과정을 녹화한 동영상: **시작 화면 › 튜토리얼 동영상** 또는 **도움말 › 튜토리얼 동영상** 이 별도의 창에서 재생합니다 (장 표시·속도·전체 화면). 파일은 `docs/video/MyUMLMaker-Tutorial.mp4` 이며 `npm run tutorial:video` 로 만듭니다.',
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
      '- A recording of the whole tour: **Start page › Tutorial video** or **Help › Tutorial video** plays it in its own window (chapter marks, speed, full screen). The file is `docs/video/MyUMLMaker-Tutorial.mp4`, made with `npm run tutorial:video`.',
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
