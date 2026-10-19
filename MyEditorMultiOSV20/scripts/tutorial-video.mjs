// The full tutorial video (tutorial-all.mp4): one guided tour through the real
// app, recorded with the DevTools screencast and encoded with ffmpeg. Called by
// make-help-media.mjs, which provides the running server, browser and page.
// A caption bar and a pointer are drawn into the page while recording; each
// step points at a control first, then uses it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const W = 1280;
const H = 720;
const FPS = 30;

// Drawn into the page (outside React's root, so re-renders leave it alone).
const OVERLAY = `
  if (!document.getElementById('tv-caption')) {
    const css = document.createElement('style');
    css.textContent = \`
      #tv-caption { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 2147483647; max-width: 86vw; padding: 10px 22px; border-radius: 12px;
        background: rgba(10, 14, 22, 0.86); color: #fff; font: 600 19px/1.45 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.45);
        border: 1px solid rgba(110, 190, 255, .55); pointer-events: none; text-align: center; transition: opacity .25s; }
      #tv-caption small { display: block; font-size: 13px; font-weight: 500; color: #9fd0ff; }
      #tv-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 26px; height: 26px; pointer-events: none; transform: translate(640px, 360px);
        transition: transform .65s cubic-bezier(.3,.7,.2,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
      #tv-ring { position: fixed; z-index: 2147483646; pointer-events: none; border: 3px solid #ffbe0b; border-radius: 10px; opacity: 0; transition: all .45s ease; box-shadow: 0 0 0 6px rgba(255,190,11,.25); }
      .tv-click { position: fixed; z-index: 2147483646; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid #ffbe0b; pointer-events: none; animation: tv-pop .5s ease-out forwards; }
      @keyframes tv-pop { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }\`;
    document.documentElement.appendChild(css);
    const cap = document.createElement('div'); cap.id = 'tv-caption'; cap.style.opacity = '0'; document.documentElement.appendChild(cap);
    const ring = document.createElement('div'); ring.id = 'tv-ring'; document.documentElement.appendChild(ring);
    const cur = document.createElement('div'); cur.id = 'tv-cursor';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.6-7.6L21 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cur);
  }
  const tv = {
    say(text, sub = '') { const c = document.getElementById('tv-caption'); c.innerHTML = text + (sub ? '<small>' + sub + '</small>' : ''); c.style.opacity = '1'; },
    hide() { document.getElementById('tv-caption').style.opacity = '0'; },
    async point(el, ring = true) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      document.getElementById('tv-cursor').style.transform = 'translate(' + Math.round(r.left + Math.min(r.width / 2, 60)) + 'px,' + Math.round(r.top + r.height / 2) + 'px)';
      const g = document.getElementById('tv-ring');
      if (ring) Object.assign(g.style, { left: (r.left - 5) + 'px', top: (r.top - 5) + 'px', width: (r.width + 4) + 'px', height: (r.height + 4) + 'px', opacity: '1' });
      await wait(750);
      return el;
    },
    unring() { document.getElementById('tv-ring').style.opacity = '0'; },
    pop() { const t = document.getElementById('tv-cursor').style.transform.match(/translate\\((\\d+)px,\\s*(\\d+)px\\)/); if (!t) return; const d = document.createElement('div'); d.className = 'tv-click'; d.style.left = t[1] + 'px'; d.style.top = t[2] + 'px'; document.documentElement.appendChild(d); setTimeout(() => d.remove(), 600); },
    async click(el, how = 'click') {
      el = await tv.point(el);
      if (!el) return null;
      tv.pop();
      if (how === 'mousedown') el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      else el.click();
      await wait(250);
      tv.unring();
      return el;
    },
    async type(text, ms = 55) { const v = med().view(); v.focus(); for (const ch of text) { const at = v.state.selection.main.head; v.dispatch({ changes: { from: at, insert: ch }, selection: { anchor: at + ch.length }, userEvent: 'input.type' }); await wait(ch === ' ' ? ms * 1.6 : ms); } },
    async typeInput(el, text, ms = 70) { for (let i = 1; i <= text.length; i++) { await typeInto(el, text.slice(0, i)); await wait(ms); } },
  };
`;

// The tour. Each step: caption, sub-caption, and what happens (page code).
const STEPS = [
  ['My Editor 시작 화면', '프로그램을 켜면 이 화면부터 보이고, 이전 문서는 뒤에서 열립니다', `await wait(3500);`],
  ['시작하기', '튜토리얼 · 새 문서 · 열기 · 폴더 열기 · 설정 · 단축키', `await tv.point('[data-group="begin"]'); await wait(2600);`],
  ['할 수 있는 일', '자주 쓰는 기능을 바로 실행합니다', `await tv.point('[data-group="tasks"] .task-grid'); await wait(2400);`],
  ['사용법 보기', '모든 기능의 자세한 설명을 화면과 함께 별도 창에서 봅니다 (F1)', `await tv.point('#start-help'); await wait(2600);`],
  ['배경 효과', '배경 장면과 투명도 · 속도를 고릅니다', `await tv.point('[data-group="scenes"]'); await wait(900); for (const id of ['circuit', 'network', 'terminal']) { const b = document.querySelector('[data-scene="' + id + '"]'); if (b) { await tv.click(b); await wait(1500); } }`],
  ['시작 시 항상 시작 화면 보기', '켜 두면 문서가 복원되어도 시작 화면부터 보입니다', `await tv.point('.start-always'); await wait(2500);`],
  ['새 문서', '빈 문서를 만들고 바로 입력합니다', `await tv.click('#start-new'); await wait(600); await tv.type('안녕하세요, My Editor!\\n여러 문서를 탭으로 열어 편집합니다.\\n'); await wait(1200);`],
  ['폴더 트리에서 파일 열기', '폴더를 펼치고 파일을 누르면 탭으로 열립니다', `const row = (name) => Array.from(document.querySelectorAll('.sidebar .tree-row, .sidebar [role="treeitem"]')).find((e) => e.textContent.trim() === name); await tv.click(row('src')); await wait(700); await tv.click(row('app.js')); await wait(1500);`],
  ['찾기', 'Ctrl+F — 대/소문자 · 단어 · 정규식, 일치 개수가 보입니다', `med().action('find'); await until(() => document.querySelector('.findbar input')); const f = document.querySelectorAll('.findbar input')[0]; await tv.point(f); await tv.typeInput(f, 'orders'); await wait(1800); tv.unring();`],
  ['바꾸기', 'Ctrl+H — 하나씩 또는 모두 바꿉니다', `med().action('replace'); await until(() => document.querySelectorAll('.findbar input').length > 1); const r = document.querySelectorAll('.findbar input'); await tv.typeInput(r[0], 'const'); await tv.point(r[1]); await tv.typeInput(r[1], 'let'); await wait(1800); tv.unring(); med().action('closeFind'); await wait(400);`],
  ['자동 완성', '입력하면 키워드와 문서의 단어를 제안합니다 (Ctrl+Space)', `const v = med().view(); const end = v.state.doc.line(22).to; v.dispatch({ selection: { anchor: end } }); await tv.type('\\n  con'); press(v.contentDOM, ' ', { ctrlKey: true, code: 'Space' }); await wait(2200); press(v.contentDOM, 'Escape'); med().action('undo'); await wait(500);`],
  ['Markdown', '편집 · WYSIWYG · 미리보기를 나란히 봅니다', `await show('README.md'); await wait(1200); const eye = document.querySelector('.icon-toolbar [data-cmd="togglePreview"]'); if (eye) { await tv.point(eye); tv.pop(); tv.unring(); } med().action('togglePreview'); await wait(2600);`],
  ['문서 구조', '제목 목록을 누르면 그 위치로 갑니다', `med().action('toggleStructure'); await wait(2600); med().action('toggleStructure'); med().action('togglePreview'); await wait(500);`],
  ['HTML 미리보기', '로컬 그림 · CSS · 스크립트까지 문서 옆에 그려집니다', `await open('docs/page.html'); if (!document.querySelector('.html-preview')) med().action('togglePreview'); await wait(3200);`],
  ['그림과 16진수 보기', '그림은 그림으로, 이진 파일은 16진수로 엽니다', `await open('docs/sunset.png'); await wait(2200); await open('sample.bin'); await wait(2200);`],
  ['창 나누기', '좌우 · 2×2 로 여러 문서를 함께 편집합니다', `await show('app.js'); med().action('split:cols'); await wait(600); med().showInPane(1, docNamed('README.md').id); await wait(1600); med().action('split:grid'); await wait(500); med().showInPane(2, docNamed('notes.txt').id); med().showInPane(3, docNamed('page.html').id); await wait(2200); med().action('split:none'); await wait(600);`],
  ['터미널', 'Ctrl+\` — 아래 패널에서 셸을 씁니다', `med().action('toggleTerminal'); await until(() => document.querySelector('.term-view:not(.hidden) input'), 8000); await wait(1500); const t = document.querySelector('.term-view:not(.hidden) input'); await tv.point(t); await tv.typeInput(t, 'dir', 120); press(t, 'Enter'); await wait(2600); tv.unring(); med().action('toggleTerminal'); await wait(500);`],
  ['테마', '40가지 테마 — 누를 때마다 다음 테마, ▾ 로 목록', `const caret = document.querySelector('.tb-split-caret'); await tv.click(caret); await wait(1800); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(300); const main = document.querySelector('.tb-split-main'); for (let i = 0; i < 3; i++) { await tv.click(main); await wait(1100); } med().action('theme:midnight'); await wait(800);`],
  ['설정 › 시작 화면', '시작 화면과 배경을 설정 창에서도 바꿉니다', `med().action('settings'); await until(() => document.querySelector('.settings-tab')); await wait(700); const tab = Array.from(document.querySelectorAll('.settings-tab')).find((b) => b.textContent.trim() === '시작 화면'); await tv.click(tab); await wait(2600); await tv.click(Array.from(document.querySelectorAll('.settings-tab')).find((b) => b.textContent.trim() === '테마')); await wait(1800); med().closeDialog && med().closeDialog(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(600);`],
];

// The Help window (its own page), shown last.
const HELP_STEPS = [
  ['도움말 창', '장 목록과 절, 검색, 이전/다음 — 도움말 › 도움말 (F1)', `await until(() => document.querySelector('.help-article h1')); await wait(2600);`],
  ['도움말 — 장 고르기', '각 장은 실행 화면과 함께 기능을 자세히 설명합니다', `const pick = (t) => Array.from(document.querySelectorAll('.help-chapter')).find((b) => b.textContent.includes(t)); await tv.click(pick('Markdown')); await wait(1200); document.querySelector('.help-article').scrollTo({ top: 700, behavior: 'smooth' }); await wait(2400);`],
  ['도움말 — 검색', '찾는 말이 있는 장만 남고 본문에 표시됩니다', `const s = document.querySelector('.help-search input'); await tv.point(s); await tv.typeInput(s, '인코딩', 160); await wait(2800); tv.unring();`],
  ['이제 시작해 보세요', '자세한 내용은 언제든 도움말(F1)과 튜토리얼에서 볼 수 있습니다', `await wait(3500);`],
];

export async function recordTutorial({ page, evaluate, navigate, viewport, seed, writeSession, startServer, PRELUDE, PORT, tmp, out }) {
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('ffmpeg is required on PATH (or set FFMPEG).');
  const frames = path.join(tmp, 'frames');
  fs.mkdirSync(frames, { recursive: true });
  const list = [];   // [file, timestamp]
  page.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(frames, `f${String(list.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    list.push([file, metadata.timestamp]);
    page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const record = () => page.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const pause = () => page.send('Page.stopScreencast');

  const run = async (steps, first) => {
    for (let i = 0; i < steps.length; i++) {
      const [title, sub, body] = steps[i];
      const n = first + i + 1;
      process.stdout.write(`  ${n}. ${title}\n`);
      await evaluate(`(async () => { ${PRELUDE} ${OVERLAY} tv.say(${JSON.stringify(`${title}`)}, ${JSON.stringify(sub)}); await wait(500); ${body} return 'ok'; })()`, 90000);
    }
  };

  seed();
  writeSession({ showStartOnLaunch: true });
  await startServer();
  await viewport(W, H);
  await page.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${PORT}`, storageTypes: 'all' });
  console.log(`video → ${path.relative(process.cwd(), out)}`);
  await navigate(`http://127.0.0.1:${PORT}/`);
  await evaluate(`(async () => { ${PRELUDE} await ready(); await until(() => document.querySelector('.start-page')); await wait(1500); ${OVERLAY} return 'ok'; })()`);
  await record();
  await run(STEPS, 0);
  await pause();
  await navigate(`http://127.0.0.1:${PORT}/?popup=help`);
  await evaluate(`(async () => { ${PRELUDE} await until(() => document.querySelector('.help-article h1')); await wait(600); ${OVERLAY} return 'ok'; })()`);
  await record();
  await run(HELP_STEPS, STEPS.length);
  await pause();
  await new Promise((r) => setTimeout(r, 500));

  // Each frame lasts until the next one; the pause around the page switch is cut short.
  const lines = [];
  for (let i = 0; i < list.length; i++) {
    const [file, ts] = list[i];
    const next = list[i + 1] ? list[i + 1][1] : ts + 2;
    const dur = Math.min(Math.max(next - ts, 1 / FPS), 2.5);
    lines.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${list[list.length - 1][0].replace(/\\/g, '/')}'`);
  const listFile = path.join(tmp, 'frames.txt');
  fs.writeFileSync(listFile, lines.join('\n') + '\n');
  const enc = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0d1117,fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (enc.status !== 0) throw new Error('ffmpeg failed');
  console.log(`  ${list.length} frames → ${path.basename(out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
}
