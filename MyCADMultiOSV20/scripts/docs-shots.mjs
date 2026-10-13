// npm run build:docs — the pictures of doc/Tutorial.md, taken from the real
// app: the start page, the tutorial panel, and the drawing after every step
// of every lesson (the same steps the in-app tutorial performs), plus the
// dialog windows the steps use. Writes doc/images/<lang>/*.webp and
// doc/images/<lang>/shots.json, then builds the Markdown and HTML documents.
//   node scripts/docs-shots.mjs [--lang ko,en] [--only l4-]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from '../test/e2e/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const languages = argument('lang', 'ko,en').split(',');
const only = argument('only', '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const { LESSONS, DOC_DIALOGS } = await import('../src/tutorial/lessons.js');

for (const language of languages) {
  const dir = path.join(root, 'doc', 'images', language);
  fs.mkdirSync(dir, { recursive: true });
  const manifestFile = path.join(dir, 'shots.json');
  const manifest = only && fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const L = (o) => o?.[language] ?? o?.en ?? '';
  const app = await new App().start();
  const m = app.main;
  const k = 'window.__mycad';
  const want = (name) => !only || name.startsWith(only);
  const shot = async (name, caption, page = m) => {
    await page.screenshot(path.join(dir, `${name}.webp`));
    manifest[name] = { file: `images/${language}/${name}.webp`, caption };
    console.log(`  ${language}/${name}.webp`);
  };
  try {
    await m.eval(`(${k}.actions.updateSettings({ theme: 'light', language: '${language}', toolbarRows: 1, collapsedSections: [], showLeftPanel: true, showRightPanel: true }), 1)`);
    await sleep(400);

    if (want('start-page')) {
      await m.eval(`(${k}.actions.showHome(true), 1)`);
      await m.waitFor(`document.querySelectorAll('canvas.sample-thumb.ready').length >= 20`, { timeout: 60000 }).catch(() => {});
      await sleep(400);
      await shot('start-page', language === 'ko' ? '시작 페이지: 할 수 있는 일(레슨·샘플), 빠른 시작, 최근 파일, 오늘의 팁, 샘플' : 'Start page: tasks (lessons and samples), quick start, recent files, tip of the day, samples');
    }
    if (want('tutorial-')) {
      await m.eval(`(${k}.actions.openTutorial({ lesson: 1, mode: 'watch' }).then((t) => { t.instant = false; t.speed = 1; t.play(); }), 1)`);
      await sleep(9000);
      await shot('tutorial-watch', language === 'ko' ? '튜토리얼 보기: 커서가 실제 화면을 조작하고, 패널이 단계를 설명합니다' : 'Tutorial, Watch: the cursor works the real interface while the panel explains the step');
      await m.eval(`(${k}.state.tutorial.close(), 1)`);
      await m.eval(`(${k}.actions.openTutorial({ lesson: 1, mode: 'practice' }).then((t) => t.advance().then(() => t.practiceStep())), 1)`);
      await sleep(1500);
      await shot('tutorial-practice', language === 'ko' ? '튜토리얼 직접 하기: 할 일과 클릭할 곳(빨간 원)이 표시되고, 해내면 다음 단계로 넘어갑니다' : 'Tutorial, Practice: what to do and where to click (red circles); it moves on when you have done it');
      await m.eval(`(${k}.state.tutorial.close(), 1)`);
    }

    // Every step of every lesson, run instantly by the tutorial player.
    await m.eval(`(async () => {
      const t = await ${k}.actions.openTutorial({ lesson: 0 });
      t.instant = true;
      t.hidePanel();
      window.__doc = {
        async run(li, si) {
          t.li = li; t.si = si;
          await t.lessons[li].steps[si].run(t.ctx());
          t.hideMarks(); t.hidePanel(); t.cursor.hidden = true; t.ring.hidden = true; t.targetLayer.replaceChildren();
          return ${k}.state.view3d;
        },
      };
      return 1;
    })()`);
    for (let li = 0; li < LESSONS.length; li++) {
      for (let si = 0; si < LESSONS[li].steps.length; si++) {
        const name = `l${li + 1}-s${si + 1}`;
        const in3d = await m.eval(`window.__doc.run(${li}, ${si})`, 120000);
        if (!want(`l${li + 1}-`)) continue;
        await sleep(in3d ? 1200 : 450);
        const step = LESSONS[li].steps[si];
        await shot(name, `${L(LESSONS[li].title)} · ${L(step.title)}`);
        const dialog = DOC_DIALOGS[`${li + 1}-${si + 1}`];
        if (!dialog) continue;
        await m.eval(`(async () => { const { DOC_DIALOGS } = await import('/src/tutorial/lessons.js'); DOC_DIALOGS['${li + 1}-${si + 1}'].open(${k}.actions.tutorialApi()); return 1; })()`);
        const popup = await app.popup(dialog.popup);
        if (dialog.tab) { await popup.eval(`(document.querySelector('[data-action="tab"][data-value="${dialog.tab}"]')?.click(), 1)`); }
        await sleep(dialog.popup === 'solid' || dialog.popup === 'print' || dialog.popup === 'stl' ? 1800 : 800);
        await shot(`${name}-dialog`, `${L(step.title)} — ${language === 'ko' ? '창' : 'window'}`, popup);
        if (dialog.popup === 'menu') await m.eval(`(${k}.actions.tutorialApi().closeMenu(), 1)`);
        else await m.eval(`window.__TAURI_INTERNALS__.invoke('close_popup', { kind: '${dialog.popup}' }).then(() => 1)`);
        await sleep(300);
      }
    }
  } finally {
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
    await Promise.race([app.kill(), sleep(8000)]);
  }
}

// The documents themselves (Markdown + HTML) from the lessons and these pictures.
const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-docs.mjs')], { stdio: 'inherit' });
process.exit(build.status ?? 0);
