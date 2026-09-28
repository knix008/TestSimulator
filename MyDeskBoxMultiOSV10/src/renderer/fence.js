'use strict';

// 박스의 테두리 창. 제목 줄과 가장자리만 그린다.
//
// 박스의 판은 다른 창(panel.*)이 바탕화면 아이콘 층 '뒤'에서 그리고,
// 아이콘은 탐색기가 그 위에 그린다. 그래서 이 창의 가운데는 비어 있어야 하고,
// 그 자리의 마우스는 아래(탐색기 아이콘)로 흘려보내야 한다.
// 흘려보내는 일은 메인이 창 밖에서 한다(setIgnoreMouseEvents).

const id = new URLSearchParams(location.search).get('id');
const panel = document.getElementById('panel');
const title = document.getElementById('title');
const nameEl = document.getElementById('name');
const renameEl = document.getElementById('rename');

let fence = null;
let theme = null;
let corner = null;
let lang = window.DeskI18n.DEFAULT_LANG;

function rgba(hex, alpha) {
  const value = Number.parseInt(String(hex).replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintChrome() {
  if (!fence) return;
  const look = theme || { bg: '#2563eb', bar: '#1e3a8a', text: '#ffffff' };
  panel.style.borderRadius = `${corner ? corner.radius : 20}px`;
  const alpha = fence.opacity || 0.52;
  // 제목 줄만 그린다. 판은 아이콘 뒤의 창이 그린다.
  title.style.background = [
    'linear-gradient(180deg,',
    'rgba(255,255,255,0.26) 0%,',
    'rgba(255,255,255,0.05) 48%,',
    'rgba(0,0,0,0.16) 100%),',
    rgba(look.bar, Math.min(0.96, alpha + 0.34)),
  ].join(' ');
  title.style.color = look.text;
  const dark = look.text.toLowerCase() !== '#ffffff';
  panel.classList.toggle('light', dark);
  nameEl.textContent = fence.title || window.DeskI18n.t(lang, 'box.untitled');
  panel.classList.toggle('collapsed', !!fence.collapsed);
}

// 창은 박스보다 사방으로 그림자 여백만큼 크다.
let edge = 0;

title.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target === renameEl || !fence) return;
  const start = { x: event.screenX, y: event.screenY, fx: fence.x, fy: fence.y };
  let moved = false;
  title.setPointerCapture(event.pointerId);
  // 마우스는 화면보다 자주 움직인다. 그릴 때마다 한 번만 옮겨야 창이 손을 따라온다.
  let frame = 0;
  let want = null;
  const send = () => {
    frame = 0;
    if (!want) return;
    desk.move(want);
    want = null;
  };
  const move = (ev) => {
    const dx = ev.screenX - start.x;
    const dy = ev.screenY - start.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    want = { id, x: start.fx + dx, y: start.fy + dy, w: fence.w, h: fence.h };
    if (!frame) frame = requestAnimationFrame(send);
  };
  const up = (ev) => {
    title.removeEventListener('pointermove', move);
    title.removeEventListener('pointerup', up);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    want = null;
    if (!moved) return;
    const dx = ev.screenX - start.x;
    const dy = ev.screenY - start.y;
    fence.x = start.fx + dx;
    fence.y = start.fy + dy;
    desk.saveBounds({ id, x: fence.x, y: fence.y, w: fence.w, h: fence.h });
  };
  title.addEventListener('pointermove', move);
  title.addEventListener('pointerup', up);
});

// 톱니 단추는 이 박스의 설정 창을 연다. 제목 줄 끌기와 섞이지 않게 막는다.
const gear = document.getElementById('gear');
gear.addEventListener('pointerdown', (event) => event.stopPropagation());
gear.addEventListener('click', (event) => {
  event.stopPropagation();
  desk.settings(id);
});

title.addEventListener('dblclick', () => {
  if (!fence || !renameEl.hidden) return;
  desk.collapse(id, !fence.collapsed);
});

// 제목 줄과 가장자리에서 오른쪽 단추를 누르면 메뉴가 뜬다.
// 가운데는 이 창이 받지 않으므로 탐색기의 바탕화면 메뉴가 그대로 뜬다.
panel.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  desk.menu(id, null);
});

for (const handle of document.querySelectorAll('.edge')) {
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !fence || fence.collapsed) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = handle.dataset.edge;
    const start = {
      x: event.screenX,
      y: event.screenY,
      fx: fence.x,
      fy: fence.y,
      fw: fence.w,
      fh: fence.h,
    };
    const edgeEl = event.currentTarget;
    edgeEl.setPointerCapture(event.pointerId);
    let frame = 0;
    const send = () => {
      frame = 0;
      desk.move({ id, x: fence.x, y: fence.y, w: fence.w, h: fence.h });
    };
    const move = (ev) => {
      const dx = ev.screenX - start.x;
      const dy = ev.screenY - start.y;
      let x = start.fx;
      let y = start.fy;
      let w = start.fw;
      let h = start.fh;
      if (mode.includes('e')) w = start.fw + dx;
      if (mode.includes('s')) h = start.fh + dy;
      if (mode.includes('w')) {
        w = start.fw - dx;
        x = start.fx + dx;
      }
      if (mode.includes('n')) {
        h = start.fh - dy;
        y = start.fy + dy;
      }
      w = Math.max(180, w);
      h = Math.max(160, h);
      if (mode.includes('w')) x = start.fx + (start.fw - w);
      if (mode.includes('n')) y = start.fy + (start.fh - h);
      fence.x = x;
      fence.y = y;
      fence.w = w;
      fence.h = h;
      if (!frame) frame = requestAnimationFrame(send);
    };
    const up = () => {
      edgeEl.removeEventListener('pointermove', move);
      edgeEl.removeEventListener('pointerup', up);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      desk.saveBounds({ id, x: fence.x, y: fence.y, w: fence.w, h: fence.h });
    };
    edgeEl.addEventListener('pointermove', move);
    edgeEl.addEventListener('pointerup', up);
  });
}

function startRename() {
  if (!fence) return;
  renameEl.hidden = false;
  nameEl.hidden = true;
  renameEl.value = fence.title;
  renameEl.focus();
  renameEl.select();
}

function commitRename() {
  if (renameEl.hidden) return;
  const next = renameEl.value.trim();
  renameEl.hidden = true;
  nameEl.hidden = false;
  if (next && next !== fence.title) desk.rename(id, next);
}

renameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') commitRename();
  if (event.key === 'Escape') {
    renameEl.hidden = true;
    nameEl.hidden = false;
  }
});
renameEl.addEventListener('blur', commitRename);

desk.onState((payload) => {
  if (!payload || payload.fence.id !== id) return;
  fence = payload.fence;
  theme = payload.theme || null;
  corner = payload.corner || null;
  lang = payload.lang || lang;
  edge = payload.shadow ? window.DeskArrange.SHADOW : 0;
  panel.classList.toggle('shadow', !!payload.shadow);
  paintChrome();
});

desk.onRename(() => startRename());
desk.ready(id);
