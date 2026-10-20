// Records the tutorial video (MyBrainMap-Tutorial.mp4 in the project root) and
// the pictures of doc/ (doc/images/*.png) from the web build in headless Edge /
// Chrome. A drawn cursor and captions show what is being done; every step uses
// the real app through mouse and keyboard input (window.__mtm reads the state).
//
//   npm run build && npm run tutorial:video          (needs ffmpeg on PATH, or FFMPEG=path)
//   FRAMES_ONLY=1 node scripts/make-tutorial-video.mjs (pictures and frames, no encoding)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, root } from './cdp.mjs';

const W = 1280, H = 800, FPS = 12;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'mbm-tutorial-'));
const docImages = path.join(root, 'doc', 'images');
const out = path.join(root, 'MyBrainMap-Tutorial.mp4');
fs.mkdirSync(docImages, { recursive: true });

const rectOf = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; })()`;
const centerOfSel = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`;
const topicAt = (text) => `(() => { const L = window.__mtm.layout(); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); for (const n of L.nodes.values()) if (n.topic.text === ${JSON.stringify(text)}) return { x: r.left + v.x + (n.x + n.w / 2) * v.k, y: r.top + v.y + (n.y + n.h / 2) * v.k, id: n.id }; return null; })()`;

// The overlay: a cursor, a click ripple and a caption bar, drawn above the app.
const OVERLAY = `(() => {
  if (document.getElementById('tut-cursor')) return;
  const st = document.createElement('style');
  st.textContent = '#tut-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:99999;pointer-events:none;transform:translate(-2px,-2px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}'
    + '#tut-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #ffd54f;z-index:99998;pointer-events:none;opacity:0;transition:opacity .25s, transform .25s;transform:scale(.4)}'
    + '#tut-ripple.on{opacity:1;transform:scale(1)}'
    + '#tut-cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);max-width:1100px;z-index:99999;pointer-events:none;padding:10px 22px;border-radius:12px;background:rgba(10,16,40,.86);color:#fff;font:600 21px/1.45 "Malgun Gothic","Segoe UI",sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.45);border:1px solid rgba(120,160,255,.5)}'
    + '#tut-cap small{display:block;font-weight:400;font-size:15px;color:#c8d4ff;margin-top:2px}'
    + '#tut-cap:empty{display:none}';
  document.head.append(st);
  const c = document.createElement('div');
  c.id = 'tut-cursor';
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l17 9-7.5 1.8L9 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id = 'tut-ripple';
  const cap = document.createElement('div'); cap.id = 'tut-cap';
  document.body.append(c, r, cap);
})()`;

let p;
let n = 0;
let cur = { x: W / 2, y: H / 2 };

async function grab() { return Buffer.from((await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 })).data, 'base64'); }
function put(buf) { fs.writeFileSync(path.join(frames, `${String(n++).padStart(5, '0')}.jpg`), buf); }
async function frame() { put(await grab()); }
async function hold(sec) { for (let i = 0; i < Math.round(sec * FPS); i++) await frame(); }
// Records what the page does by itself (the tour's demos) at its real speed: a frame is repeated
// when a screenshot takes longer than a frame. Stops when `until` (a page expression) is true and
// at least `minSec` have passed, or after `maxSec`.
async function live(minSec, until, maxSec = 40) {
  const t0 = Date.now();
  let made = 0;
  for (;;) {
    const sec = (Date.now() - t0) / 1000;
    if (sec >= maxSec || (sec >= minSec && (!until || await p.eval(until)))) break;
    const buf = await grab();
    const want = Math.max(made + 1, Math.floor(((Date.now() - t0) / 1000) * FPS));
    while (made < want) { put(buf); made++; }
  }
}
async function overlay() { await p.eval(OVERLAY); await p.eval(`(() => { const c = document.getElementById('tut-cursor'); c.style.left = '${cur.x}px'; c.style.top = '${cur.y}px'; })()`); }
async function caption(title, sub = '') {
  await overlay();
  await p.eval(`document.getElementById('tut-cap').innerHTML = ${JSON.stringify(title ? `${title}${sub ? `<small>${sub}</small>` : ''}` : '')}`);
}
async function moveTo(x, y, sec = 0.6, mods = 0, held = false) {
  const steps = Math.max(2, Math.round(sec * FPS));
  const from = { ...cur };
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    cur = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cur.x, y: cur.y, button: held ? 'left' : 'none', buttons: held ? 1 : 0, modifiers: mods });
    await p.eval(`(() => { const c = document.getElementById('tut-cursor'); if (c) { c.style.left = '${cur.x}px'; c.style.top = '${cur.y}px'; } })()`);
    await frame();
  }
}
async function ripple() {
  await p.eval(`(() => { const r = document.getElementById('tut-ripple'); r.style.left = '${cur.x}px'; r.style.top = '${cur.y}px'; r.classList.add('on'); setTimeout(() => r.classList.remove('on'), 380); })()`);
}
async function click(x, y, { button = 'left', sec = 0.55, after = 0.5 } = {}) {
  await moveTo(x, y, sec);
  await ripple();
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'left' ? 1 : 2, clickCount: 1 });
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
  await hold(after);
}
async function clickSel(sel, opts) {
  const c = await p.eval(centerOfSel(sel));
  if (!c) throw new Error(`no element ${sel}`);
  await click(c.x, c.y, opts);
}
async function clickTopic(text, opts) {
  const c = await p.eval(topicAt(text));
  if (!c) throw new Error(`no topic ${text}`);
  await click(c.x, c.y, opts);
}
async function drag(x0, y0, x1, y1, { mods = 0, sec = 1.1 } = {}) {
  await moveTo(x0, y0, 0.5);
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
  await moveTo(x1, y1, sec, mods, true);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1, modifiers: mods });
  await hold(0.6);
}
async function key(k, o = {}) { await p.key(k, o); await hold(o.after ?? 0.35); }
async function type(text, perChar = 2) {
  for (const ch of text) { await p.type(ch); for (let i = 0; i < perChar; i++) await frame(); }
}
const run = (id) => p.eval(`void window.__mtm.run(${JSON.stringify(id)})`);
async function still(name, clip) {
  await p.eval("(() => { for (const id of ['tut-cursor', 'tut-cap', 'tut-ripple']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } })()");
  await p.shot(path.join(docImages, `${name}.png`), clip);
  await p.eval("(() => { for (const id of ['tut-cursor', 'tut-cap', 'tut-ripple']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; } })()");
  console.log(`  doc/images/${name}.png`);
}

async function main() {
  p = await launch({ width: W, height: H, lang: 'ko', session: { theme: 'midnight', showStartOnLaunch: true, startScreen: { scene: 'radial', transparency: 55, motion: 20 } } });
  await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await p.waitFor('!!window.__mtm && !!document.querySelector(".start-page")');
  await p.sleep(1500);
  await overlay();

  // ── 1. the start page ──
  await caption('MyBrainMap — 생각을 가지로 펼치는 마인드맵 프로그램', 'Windows · macOS · Linux 데스크톱과 웹 브라우저에서 똑같이 동작합니다');
  await hold(3.5);
  await still('start-page');
  await caption('시작 화면 — 튜토리얼, 새 맵, 템플릿, 예제 맵 16가지', '아래로 내리면 최근 파일과 배경 효과가 있습니다');
  await moveTo(200, 250, 0.8);
  await hold(2);
  await p.eval("document.querySelector('.start-scroll').scrollTo({ top: 99999 })");
  await hold(0.6);
  await caption('배경 효과 — 마인드맵을 주제로 한 3D 장면 21가지', '버튼마다 아이콘이 있고, 투명도와 속도를 바꿀 수 있습니다');
  for (const scene of ['brain', 'orgchart', 'idea', 'islands']) await clickSel(`.start-scene[data-scene="${scene}"]`, { after: 1.4 });
  await still('start-backgrounds');
  await clickSel('.start-scene[data-scene="radial"]', { after: 0.4 });
  await p.eval("document.querySelector('.start-scroll').scrollTo({ top: 0 })");
  await hold(0.5);

  // ── 2. the guided tour, every step: the card explains, the demo plays by itself ──
  await caption('시작하기의 맨 위: 튜토리얼', '설치 후 처음 실행하면 저절로 시작됩니다');
  await clickSel('#start-tour', { after: 1.0 });
  await p.waitFor('!!document.querySelector(".tour-card.placed")');
  await caption('');
  await hold(2.5);
  await still('tour-welcome');
  const steps = await p.eval('document.querySelector(".tour-count").textContent');
  console.log(`  tour: ${steps}`);
  for (;;) {
    const s = await p.eval('(() => { const t = document.querySelector(".tour"); if (!t) return null; return { id: t.dataset.step, text: document.querySelector(".tour-text").textContent.length, last: !document.querySelector("[data-tour=next] svg") }; })()');
    if (!s) break;
    // time to read the card (about 18 characters a second), and the demo played to its end
    await live(Math.min(9, Math.max(3.2, s.text / 18)), 'document.querySelector(".tour") && document.querySelector(".tour").dataset.played === "1"');
    await hold(1.2);
    if (s.id === 'redraw') await still('tour-step');
    console.log(`    ${s.id}  ${(n / FPS).toFixed(0)} s`);
    await clickSel('[data-tour=next]', { after: 0.2 });
    if (s.last) break;
  }
  await caption('안내는 언제든 Esc 로 끝내고, 도움말 › 튜토리얼로 다시 볼 수 있습니다');
  await hold(2.5);
  await run('fit');
  await hold(1.5);
  await still('tutorial-map');
  await caption('토픽마다 메모에 해 볼 일이 적혀 있습니다', '격자와 눈금자, 오른쪽 아래의 전체 보기 창이 함께 보입니다');
  await clickTopic('끌어서 옮기기 — 연결은 유지', { after: 0.4 });
  await run('pane:notes');
  await hold(2.5);

  // ── 3. making topics with the keyboard ──
  await caption('새 맵 (Ctrl+N) — 중심 토픽에 바로 입력합니다');
  await key('n', { code: 'KeyN', modifiers: 2, after: 0.8 });
  await type('여름 휴가 계획');
  await key('Enter');
  await caption('Tab: 하위 토픽 · Enter: 형제 토픽', '글자를 치면 바로 편집되고 Enter 로 끝납니다');
  await key('Tab', { after: 0.3 }); await type('장소'); await key('Enter');
  await key('Enter', { after: 0.3 }); await type('예산'); await key('Enter');
  await key('Enter', { after: 0.3 }); await type('준비물'); await key('Enter');
  await key('Enter', { after: 0.3 }); await type('일정'); await key('Enter');
  await clickTopic('장소', { after: 0.3 });
  await key('Tab', { after: 0.3 }); await type('바닷가'); await key('Enter');
  await key('Enter', { after: 0.3 }); await type('산'); await key('Enter');
  await key('Enter', { after: 0.3 }); await type('도시'); await key('Enter');
  await clickTopic('예산', { after: 0.3 });
  await key('Tab', { after: 0.3 }); await type('숙박'); await key('Enter');
  await key('Enter', { after: 0.3 }); await type('교통'); await key('Enter');
  await run('fit');
  await hold(1.2);
  await still('typing');

  // ── 4. dragging keeps the connection ──
  await caption('끌어서 빈 곳에 놓아도 연결은 유지됩니다', '하위 토픽, 연결선, 관계선이 함께 따라옵니다');
  const a = await p.eval(topicAt('준비물'));
  await drag(a.x, a.y, a.x + 150, a.y + 120);
  await hold(0.8);
  await run('fit');
  await hold(1.2);
  await still('drag-keeps-connection');
  await caption('Alt 를 누른 채 놓으면 떼어서 플로팅 토픽이 됩니다');
  const b = await p.eval(topicAt('도시'));
  await drag(b.x, b.y, b.x + 120, b.y - 150, { mods: 1 });
  await hold(1.2);
  await caption('Ctrl+Z 실행 취소 · Ctrl+Y 다시 실행', '모든 편집을 하나씩 되돌릴 수 있습니다');
  await p.eval('window.__mtm.canvas().focus()');
  await key('z', { code: 'KeyZ', modifiers: 2, after: 0.9 });
  await key('z', { code: 'KeyZ', modifiers: 2, after: 0.9 });
  await key('y', { code: 'KeyY', modifiers: 2, after: 0.9 });
  await key('z', { code: 'KeyZ', modifiers: 2, after: 0.9 });

  // ── 5. redraw in a direction, auto arrange ──
  await caption('도구 모음: 위→아래로 다시 그리기 (Ctrl+Alt+↓)');
  await clickSel('[data-cmd="redraw:orgDown"]', { after: 1.6 });
  await still('redraw-down');
  await caption('왼쪽→오른쪽 (Ctrl+Alt+→)');
  await clickSel('[data-cmd="redraw:right"]', { after: 1.4 });
  await caption('오른쪽→왼쪽 (Ctrl+Alt+←)');
  await clickSel('[data-cmd="redraw:left"]', { after: 1.4 });
  await caption('양쪽 (Ctrl+Alt+M)');
  await clickSel('[data-cmd="redraw:map"]', { after: 1.4 });
  await caption('자동 정리 (Ctrl+Shift+L) — 옮긴 토픽을 제자리로, 양쪽 균형 맞추기');
  const c2 = await p.eval(topicAt('일정'));
  await drag(c2.x, c2.y, c2.x + 90, c2.y + 110);
  await clickSel('[data-cmd="arrange"]', { after: 1.6 });

  // ── 6. the screen: grid, rulers, overview, panes ──
  await caption('격자 · 눈금자 · 전체 보기 창 — 도구 모음에서 켜고 끕니다', 'Ctrl+Alt+G / Ctrl+Alt+R / Ctrl+Alt+O');
  for (const id of ['toggle:showGrid', 'toggle:showRulers', 'toggle:overviewVisible']) await clickSel(`[data-cmd="${id}"]`, { after: 0.7 });
  await hold(0.6);
  for (const id of ['toggle:showGrid', 'toggle:showRulers', 'toggle:overviewVisible']) await clickSel(`[data-cmd="${id}"]`, { after: 0.7 });
  await caption('왼쪽 · 오른쪽 패널 접기와 펴기', '경계의 작은 화살표, 또는 Ctrl+Alt+S / Ctrl+Alt+P');
  await clickSel('[data-cmd="collapse-left"]', { after: 0.7 });
  await clickSel('[data-cmd="collapse-right"]', { after: 1 });
  await still('panes-folded');
  await clickSel('[data-cmd="expand-left"]', { after: 0.7 });
  await clickSel('[data-cmd="expand-right"]', { after: 0.9 });

  // ── 7. context menus ──
  await caption('오른쪽 클릭: 아이콘이 붙은 컨텍스트 메뉴');
  const ctx = await p.eval(topicAt('예산'));
  await click(ctx.x, ctx.y, { button: 'right', after: 1.8 });
  await still('context-menu');
  await key('Escape', { after: 0.4 });
  await caption('왼쪽 패널의 항목에서도 같은 메뉴가 열립니다');
  await clickSel('[data-side="outline"]', { after: 0.4 });
  const row = await p.eval('(() => { const b = document.querySelectorAll(".outline-tree .tree-row")[2].getBoundingClientRect(); return { x: b.x + 50, y: b.y + b.height / 2 }; })()');
  await click(row.x, row.y, { button: 'right', after: 1.6 });
  await key('Escape', { after: 0.4 });

  // ── 8. structure: relationship, boundary, summary ──
  await caption('관계선 (Ctrl+Shift+R) — 다른 토픽을 누릅니다');
  await clickTopic('바닷가', { after: 0.3 });
  await clickSel('[data-cmd="relationship"]', { after: 0.4 });
  await clickTopic('숙박', { after: 1.2 });
  await caption('경계 (Ctrl+Shift+B) — 가지를 테두리로 묶습니다');
  await clickTopic('장소', { after: 0.3 });
  await clickSel('[data-cmd="boundary"]', { after: 1.2 });
  await caption('요약 (Ctrl+]) — 하위 토픽 옆에 괄호와 요약');
  await clickTopic('예산', { after: 0.3 });
  await clickSel('[data-cmd="summary"]', { after: 0.6 });
  await p.eval("(() => { const i = document.querySelector('.dlg input'); i.select(); })()");
  await type('약 120만 원', 2);
  await key('Enter', { after: 1.4 });
  await run('fit');
  await hold(1);
  await still('structure');

  // ── 9. what a topic holds ──
  await caption('메모 · 댓글 · 사용자 속성 — 작업 창 › 메모');
  await clickTopic('숙박', { after: 0.3 });
  await clickSel('.pane-tab[data-pane="notes"]', { after: 0.4 });
  await clickSel('.notes-input', { after: 0.2 });
  await type('**바닷가 숙소 3곳** 비교 후 예약', 1);
  await clickSel('.comment-author', { after: 0.2 });
  await type('김여행', 1);
  await clickSel('.comment-new textarea', { after: 0.2 });
  await type('7월 말은 비싸요. 8월 초로 할까요?', 1);
  await clickSel('.comment-new .btn', { after: 0.6 });
  const keyIn = await p.eval(centerOfSel('.props-grid input'));
  await click(keyIn.x, keyIn.y, { after: 0.2 });
  await type('담당', 1);
  const valIn = await p.eval('(() => { const el = document.querySelectorAll(".props-grid input")[1]; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()');
  await click(valIn.x, valIn.y, { after: 0.2 });
  await type('김여행', 1);
  await key('Enter', { after: 1.2 });
  await still('notes-comments');
  await caption('아이콘 · 우선순위 · 진행률 — 작업 창 › 아이콘');
  await clickSel('.pane-tab[data-pane="markers"]', { after: 0.8 });
  await still('markers-pane');

  // ── 10. views ──
  await caption('예제 맵을 열어 다른 보기를 봅니다', '모바일 앱 출시 계획: 일정 · 담당 · 마일스톤');
  await run('sample:app-launch');
  await hold(1.4);
  await run('fit');
  await hold(1);
  await caption('개요 보기 — 들여 쓴 목록으로 보고 편집');
  await clickSel('[data-cmd="view:outline"]', { after: 1.8 });
  await still('outline-view');
  await caption('간트 차트 — 날짜가 있는 토픽을 막대로, 끌어서 날짜 변경');
  await clickSel('[data-cmd="view:gantt"]', { after: 2.2 });
  await still('gantt-view');
  await caption('칸반 보드 — 주 토픽은 열, 하위 토픽은 카드', '카드를 다른 열로 끌면 맵에서도 옮겨집니다');
  await clickSel('[data-cmd="view:kanban"]', { after: 1.2 });
  await still('kanban-view');
  const card = await p.eval(centerOfSel('.kanban-col:nth-child(1) .kanban-card'));
  const col = await p.eval(centerOfSel('.kanban-col:nth-child(2) .kanban-add-btn'));
  if (card && col) {
    // HTML5 drag & drop (the board listens to dragstart / dragover / drop): the events go to the
    // elements under the drawn cursor as it moves, with one DataTransfer like a real drag
    await moveTo(card.x, card.y, 0.5);
    await p.eval(`(() => { window.__dt = new DataTransfer(); const el = document.elementFromPoint(${card.x}, ${card.y}).closest('.kanban-card'); el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: window.__dt })); })()`);
    const steps = 12;
    const from = { ...cur };
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((col.x - from.x) * i) / steps, y = from.y + ((col.y - 30 - from.y) * i) / steps;
      cur = { x, y };
      await p.eval(`(() => { const c = document.getElementById('tut-cursor'); c.style.left = '${x}px'; c.style.top = '${y}px'; const el = document.elementFromPoint(${x}, ${y}); if (el) el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientX: ${x}, clientY: ${y} })); })()`);
      await frame();
    }
    await p.eval(`(() => { const el = document.elementFromPoint(${cur.x}, ${cur.y}); if (el) el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__dt })); const src = document.querySelector('.kanban-card.dragging'); if (src) src.dispatchEvent(new DragEvent('dragend', { bubbles: true })); })()`);
    await hold(1.4);
    console.log('  kanban columns after the drop:', await p.eval('[...document.querySelectorAll(".kanban-col[data-col]")].map((c) => c.querySelectorAll(".kanban-card").length).join(" / ")'));
  }
  await caption('프레젠테이션 (F5) — 가지마다 한 장씩');
  await clickSel('[data-cmd="view:map"]', { after: 0.6 });
  await p.eval('Element.prototype.requestFullscreen = undefined');
  await clickSel('[data-cmd="presentation"]', { after: 1.4 });
  await key('ArrowRight', { after: 1.4 });
  await key('ArrowRight', { after: 1.4 });
  await still('presentation');
  await key('Escape', { after: 0.6 });

  // ── 11. find and filter ──
  await caption('찾기 · 바꾸기 (Ctrl+F)');
  await key('f', { code: 'KeyF', modifiers: 2, after: 0.4 });
  await type('디자인', 2);
  await hold(1.4);
  await caption('필터 — 우선순위 · 아이콘 · 태그 · 진행 상태로 거르기');
  await clickSel('[data-side="filter"]', { after: 0.5 });
  await clickSel('.index-item', { after: 1.8 });
  await still('filter');
  await run('filterClear');
  await clickSel('[data-side="outline"]', { after: 0.4 });

  // ── 12. files and settings ──
  await caption('내보내기 (Ctrl+E) — PNG · SVG · PDF · Word · HTML · Markdown · XMind · CSV …');
  await clickSel('[data-cmd="export"]', { after: 2 });
  await still('export-dialog', await p.eval(rectOf('.dlg')));
  await key('Escape', { after: 0.4 });
  await caption('인쇄 미리 보기 (Ctrl+P)');
  await clickSel('[data-cmd="print"]', { after: 2.2 });
  await still('print-preview', await p.eval(rectOf('.dlg')));
  await key('Escape', { after: 0.4 });
  await caption('설정 (Ctrl+,) — 테마 40가지, 시작 화면, 내보내기 · 인쇄');
  await run('settings');
  await hold(1);
  await clickSel('.settings-tab[data-tab="theme"]', { after: 0.8 });
  const light = await p.eval('(() => { const el = document.querySelectorAll(".theme-grid")[1].children[3]; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()');
  await click(light.x, light.y, { after: 1.4 });
  await still('settings-theme', await p.eval(rectOf('.dlg')));
  await clickSel('.theme-card:nth-child(1)', { after: 0.8 });
  await clickSel('.settings-tab[data-tab="start"]', { after: 1.4 });
  await key('Escape', { after: 0.5 });

  // ── 13. closing asks to save ──
  await caption('바꾼 맵을 닫으면 저장할지 묻습니다 (Ctrl+W)');
  await p.eval('window.__mtm.canvas().focus()');
  await clickTopic(await p.eval('window.__mtm.doc().map.root.text'), { after: 0.3 });
  await key('Tab', { after: 0.3 }); await type('마무리'); await key('Enter');
  await key('w', { code: 'KeyW', modifiers: 2, after: 1.6 });
  await still('save-prompt', await p.eval(rectOf('.dlg')));
  await clickSel('.dlg .btn:last-child', { after: 0.8 });

  // ── 14. help ──
  await caption('도움말 (F1) — 모든 기능의 설명이 그림과 함께 별도 창에서 열립니다');
  await hold(1.5);
  // the open maps are unsaved, so the page asks before it is left (beforeunload): say yes
  const seen = p.events.length;
  const nav = p.send('Page.navigate', { url: `http://127.0.0.1:${p.port}/?popup=help` });
  for (let i = 0; i < 50; i++) {
    if (p.events.slice(seen).some((e) => e.method === 'Page.javascriptDialogOpening')) { await p.send('Page.handleJavaScriptDialog', { accept: true }); break; }
    if (p.events.slice(seen).some((e) => e.method === 'Page.frameNavigated')) break;
    await p.sleep(100);
  }
  await nav;
  await p.waitFor('!!document.querySelector(".help-nav, .help-article")', 15000).catch(() => {});
  await p.sleep(1200);
  await overlay();
  await caption('도움말 창 — 왼쪽 목차, 검색, 앞뒤 이동');
  await hold(2.5);
  await still('help-window');
  await caption('MyBrainMap — 이제 직접 맵을 만들어 보세요!', '튜토리얼 맵은 시작 화면 › 시작하기 › 튜토리얼에서 언제든 다시 열 수 있습니다');
  await hold(3.5);
  if (p.errors.length) console.log('page errors:', p.errors);
  await p.close();

  console.log(`[tutorial] ${n} frames (${(n / FPS).toFixed(1)} s) in ${frames}`);
  if (process.env.FRAMES_ONLY) return;
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.error ? r.error.message : r.status}) — set FFMPEG to the ffmpeg executable`);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`[tutorial] wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

main().catch(async (err) => { console.error(err); if (p) await p.close().catch(() => {}); process.exit(1); });
