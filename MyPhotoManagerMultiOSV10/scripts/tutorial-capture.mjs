// Runs the in-app tutorial in the real desktop app (debug build, own profile and
// data folder — nothing of the user's is touched) and records it:
//
//   node scripts/tutorial-capture.mjs docs    one screenshot per step → docs/tutorial/images/,
//                                             and docs/tutorial/README.md (Korean) + README.en.md
//   node scripts/tutorial-capture.mjs video   the whole tour on auto play → MyPhotoManager-Tutorial.mp4
//                                             in the project root (needs ffmpeg on PATH)
//   node scripts/tutorial-capture.mjs check   every step once, fails on page errors (used by the tests)
//
// Needs `cargo build` (src-tauri/target/debug) like the E2E tests.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../test/e2e/cdp.mjs';
import { App, root } from '../test/e2e/harness.mjs';

const mode = process.argv[2] ?? 'docs';
const P = 'window.__myphoto';
const WIDTH = 1440;
const HEIGHT = 900;

const app = new App();
await app.start();
const page = app.main;
const evalJs = (code) => page.eval(code);
await evalJs(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${WIDTH}, height: ${HEIGHT} } } }).then(() => 1)`);
await evalJs(`window.__TAURI_INTERNALS__.invoke('plugin:window|center', { label: 'main' }).then(() => 1, () => 1)`);
await sleep(800);

const steps = await evalJs(`(async () => { const m = await import('/src/ui/tutorial.js'); return m.STEPS.map((s) => ({ id: s.id, chapter: s.chapter })); })()`);
const chapters = await evalJs(`(async () => (await import('/src/ui/tutorial.js')).CHAPTERS)()`);
const waitStep = async (index, timeout = 60000) => {
  await page.waitFor(`${P}.tutorial.state().index === ${index} && !${P}.tutorial.state().busy`, { timeout, message: `tutorial step ${index + 1}` });
};
const errors = [];
page.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));

try {
  if (mode === 'docs' || mode === 'check') {
    const outDir = path.join(root, 'docs', 'tutorial', 'images');
    if (mode === 'docs') { fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true }); }
    await evalJs(`${P}.tutorial.start(); 1`);
    for (let i = 0; i < steps.length; i++) {
      if (i > 0) await evalJs(`${P}.tutorial.next(); 1`);
      await waitStep(i);
      await sleep(steps[i].id === 'viewStyles' ? 300 : 1200); // let the step settle (thumbnails, previews, playback)
      if (mode === 'docs') {
        const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        fs.writeFileSync(path.join(outDir, `${String(i + 1).padStart(2, '0')}-${steps[i].id}.jpg`), Buffer.from(shot.result.data, 'base64'));
      }
      process.stdout.write(`\r${i + 1}/${steps.length} ${steps[i].id}            `);
    }
    process.stdout.write('\n');
    await evalJs(`${P}.tutorial.stop(); 1`);
    if (mode === 'docs') writeDocs(steps, chapters);
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
    await evalJs(`${P}.tutorial.start({ autoplay: true }); 1`);
    await page.waitFor(`${P}.tutorial.state().index === ${steps.length - 1} && !${P}.tutorial.state().busy`, { timeout: 20 * 60000, message: 'auto play reaches the last step' });
    await sleep(5000);
    await page.send('Page.stopScreencast');
    await evalJs(`${P}.tutorial.stop(); 1`);
    // Frames come when something changes: hold each one until the next (concat demuxer durations).
    const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.04, ((frames[i + 1]?.time ?? f.time + 2) - f.time)).toFixed(3)}`).join('\n');
    const listFile = path.join(frameDir, 'list.txt');
    fs.writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`);
    const out = path.join(root, 'MyPhotoManager-Tutorial.mp4');
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
function writeDocs(list, chapterIds) {
  const dicts = {};
  for (const lang of ['ko', 'en']) {
    const text = fs.readFileSync(path.join(root, 'src', 'i18n', `tutorial-${lang}.js`), 'utf8');
    dicts[lang] = Function(`return (${text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)});`)();
  }
  const intro = {
    ko: [
      '# MyPhotoManager 튜토리얼',
      '',
      '이 문서는 앱 안의 **튜토리얼**과 같은 내용을 단계별 화면과 함께 보여 줍니다. 그림은 실제 앱에서 튜토리얼을 실행하며 찍은 것입니다 (`node scripts/tutorial-capture.mjs docs` 로 다시 만듭니다).',
      '',
      '## 튜토리얼 실행하기',
      '',
      '- **시작 화면 › 시작하기 › 튜토리얼**, 또는 **도움말 › 튜토리얼**을 누릅니다.',
      '- 오른쪽 아래 카드에서 **다음 / 이전**으로 한 단계씩, **자동 재생**으로 끝까지 봅니다. 위쪽 목록으로 원하는 장으로 바로 갑니다. **✕**로 언제든 끝냅니다.',
      '- 튜토리얼은 앱 데이터 폴더의 `tutorial-photos` 예제 폴더에서만 작업합니다. 내 사진은 바뀌지 않고, 바꾼 테마·언어·보기 설정은 끝날 때 원래대로 돌아갑니다.',
      '- 전체 과정을 녹화한 동영상: 프로젝트 루트의 `MyPhotoManager-Tutorial.mp4`.',
      '',
    ],
    en: [
      '# MyPhotoManager tutorial',
      '',
      'This document follows the in-app **Tutorial** step by step, with a screenshot of each step taken from the real app (`node scripts/tutorial-capture.mjs docs` makes them again).',
      '',
      '## Running the tutorial',
      '',
      '- **Start page › Ways to begin › Tutorial**, or **Help › Tutorial**.',
      '- In the card at the bottom right: **Next / Previous** one step at a time, **Auto play** to the end, the list at the top to jump to a chapter, **✕** to stop at any time.',
      '- The tutorial works only in a sample folder, `tutorial-photos` in the app data folder. Your photos are not changed, and the theme, language and view settings it changes are put back when it ends.',
      '- A recording of the whole tour: `MyPhotoManager-Tutorial.mp4` in the project root.',
      '',
    ],
  };
  for (const lang of ['ko', 'en']) {
    const d = dicts[lang];
    const lines = [...intro[lang], lang === 'ko' ? '## 차례' : '## Contents', ''];
    chapterIds.forEach((c, i) => lines.push(`${i + 1}. [${d[`tut.ch.${c}`]}](#ch-${c})`));
    lines.push('');
    let n = 0;
    chapterIds.forEach((c, ci) => {
      lines.push(`<a id="ch-${c}"></a>`, '', `## ${ci + 1}. ${d[`tut.ch.${c}`]}`, '');
      for (const step of list.filter((s) => s.chapter === c)) {
        n = list.indexOf(step) + 1;
        const image = `images/${String(n).padStart(2, '0')}-${step.id}.jpg`;
        lines.push(`### ${n}. ${d[`tut.${step.id}.title`]}`, '', d[`tut.${step.id}.text`], '', `![${d[`tut.${step.id}.title`]}](${image})`, '');
      }
    });
    fs.writeFileSync(path.join(root, 'docs', 'tutorial', lang === 'ko' ? 'README.md' : 'README.en.md'), `${lines.join('\n')}\n`);
  }
  console.log('docs/tutorial/README.md, README.en.md');
}
