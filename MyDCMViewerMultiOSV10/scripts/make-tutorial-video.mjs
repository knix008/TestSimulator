// Records the whole tutorial (src/js/tour.js) from the real app in headless Edge:
//   MyDCMViewer-Tutorial.mp4 in the project root (H.264, 1280×800, with a title and an end card)
//   doc/images/tutorial-NN-<step>.jpg   one picture per step, taken while its demo runs
//   doc/tutorial.md                      every step with its text and picture
// Each step's demo plays at its real speed; the tutorial card on screen is the caption.
//
//   npm run tutorial:video            (needs ffmpeg on PATH, or FFMPEG=path)
//   FRAMES_ONLY=1 node scripts/make-tutorial-video.mjs      pictures and doc/tutorial.md only
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, sleep, root } from './cdp.mjs';

const FPS = 10;
const W = 1440, H = 900;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const framesOnly = !!process.env.FRAMES_ONLY;
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'dcmv-tutorial-'));
const IMG = path.join(root, 'doc', 'images');
const OUT = path.join(root, 'MyDCMViewer-Tutorial.mp4');
fs.mkdirSync(IMG, { recursive: true });
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* stills stay full size */ }

let n = 0;
const put = (buf) => { const f = path.join(frames, `${String(n++).padStart(6, '0')}.jpg`); fs.writeFileSync(f, buf); return f; };
let page;
const grab = async () => Buffer.from((await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 })).data, 'base64');
/** Record in real time until `done()` is true (and at least `minMs` passed, at most `maxMs`); returns the frame files. */
async function record(minMs, done, maxMs = 30000) {
  const t0 = Date.now(), files = [];
  let made = 0;
  for (;;) {
    const el = Date.now() - t0;
    if (el >= maxMs || (el >= minMs && (!done || (await done())))) break;
    const buf = await grab();
    const want = Math.floor(((Date.now() - t0) / 1000) * FPS) + 1;
    while (made < want) { files.push(put(buf)); made++; }
  }
  return files;
}
async function card(html, ms) {
  await page.eval(`(() => { let c = document.getElementById('tut-title'); if (!c) { c = document.createElement('div'); c.id = 'tut-title'; document.body.append(c); }
    c.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(circle at 50% 40%,#1d3557ee,#0b1020f5);color:#fff;font-family:"Malgun Gothic","Segoe UI",sans-serif;text-align:center';
    c.innerHTML = ${JSON.stringify(html)}; return 0; })()`);
  await record(ms);
  await page.eval(`(() => { const c = document.getElementById('tut-title'); if (c) c.remove(); return 0; })()`);
}

page = await launch({ lang: 'ko', width: W, height: H, settings: { showStartOnLaunch: true, tutorialDone: true, startScreen: { transparency: 20 } } });
const steps = [];
try {
  await page.waitFor('window.App && window.Tour && window.StartPage', 30000);
  await sleep(2500);
  const icon = await page.eval(`(() => { const i = document.querySelector('.start-brand img, img[src*="icon"]'); return i ? i.src : ''; })()`);
  await card(`${icon ? `<img src="${icon}" style="width:120px;height:120px">` : ''}<div style="font-size:46px;font-weight:700">MyDCMViewer 튜토리얼</div><div style="font-size:22px;color:#c8d4ff">DICOM 의료 영상 뷰어 — 모든 기능을 단계별로</div>`, 3500);
  const STEPS = await page.eval('Tour.STEPS.map((s) => ({ id: s.id, chapter: s.chapter, ko: s.ko, en: s.en }))');
  const CHAPTERS = await page.eval('Tour.CHAPTERS');
  await page.eval(`(App.runAction('tour'), 0)`);
  await page.waitFor('Tour.active', 10000);
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (i > 0) await page.eval(`(document.querySelector('.tour .tour-next').click(), 0)`);
    await page.waitFor(`Tour.index === ${i}`, 20000);
    // the demo at its own speed, then time to read the card
    const t0 = Date.now();
    const demo = await record(900, async () => !(await page.eval('Tour.playing')), 40000);
    const demoMs = Date.now() - t0;
    // time to read the card: about 22 Korean characters a second, plus a moment to look at the picture
    const read = Math.min(12000, 3500 + s.ko[1].length * 45);
    const rest = await record(Math.max(1200, read - demoMs));
    const pool = demo.length > 3 ? demo : demo.concat(rest);
    const still = pool[Math.min(pool.length - 1, Math.floor(pool.length * 0.6))];
    const name = `tutorial-${String(i + 1).padStart(2, '0')}-${s.id}.jpg`;
    if (sharp) await sharp(fs.readFileSync(still)).resize({ width: 1280 }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(IMG, name));
    else fs.copyFileSync(still, path.join(IMG, name));
    steps.push({ ...s, image: name, seconds: ((demo.length + rest.length) / FPS).toFixed(1) });
    console.log(`  ${String(i + 1).padStart(2)} ${s.id.padEnd(11)} ${steps[i].seconds} s`);
  }
  await page.eval(`(document.querySelector('.tour .tour-next').click(), 0)`);
  await sleep(800);
  await card(`<div style="font-size:40px;font-weight:700">이제 직접 해 보세요</div><div style="font-size:22px;color:#c8d4ff">도움말 › 튜토리얼 · 도움말 › 도움말 (그림 설명) · F1 단축키</div>`, 3500);
  const e = page.errors.filter((x) => !/favicon/.test(x));
  if (e.length) console.log('page errors:', e);

  // doc/tutorial.md
  const md = [
    '# MyDCMViewer 튜토리얼', '',
    `모든 기능을 ${steps.length}단계로 하나씩 보여 주는 안내입니다. 프로그램에서는 **도움말 › 튜토리얼** 로 시작하고, 각 단계의 데모가 저절로 실행됩니다. 카드 위의 목록으로 원하는 장(章)부터 시작하고, **▶ 다시 실행** 으로 데모를 다시 봅니다.`, '',
    `전체 과정을 녹화한 동영상: [MyDCMViewer-Tutorial.mp4](../MyDCMViewer-Tutorial.mp4)`, '',
    '## 차례', '',
    ...CHAPTERS.map((c, i) => `${i + 1}. [${c.ko}](#${i + 1}-${c.ko.replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '').toLowerCase()})`), '',
  ];
  CHAPTERS.forEach((c, ci) => {
    md.push(`## ${ci + 1}. ${c.ko}`, '');
    steps.filter((s) => s.chapter === c.id).forEach((s, k) => {
      md.push(`### ${ci + 1}.${k + 1} ${s.ko[0]}`, '', s.ko[1], '', `![${s.ko[0]}](images/${s.image})`, '');
    });
  });
  fs.writeFileSync(path.join(root, 'doc', 'tutorial.md'), md.join('\n'));
  console.log(`doc/tutorial.md: ${steps.length} steps`);
} finally { await page.close(); }

if (!framesOnly) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frames, '%06d.jpg'),
    '-vf', 'scale=1280:800:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-r', '30', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height', '-of', 'compact', OUT], { encoding: 'utf8' }).stdout.trim();
  console.log(`${path.basename(OUT)}: ${probe}`);
}
fs.rmSync(frames, { recursive: true, force: true });
