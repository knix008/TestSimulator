'use strict';

// 박스 창. 판과 제목 줄과 그 안의 아이콘을 모두 이 창이 그린다.
//
// 담긴 파일은 박스의 폴더에 있다. 바탕화면 폴더에서 빠져 있으므로 탐색기는
// 그 아이콘을 그리지 않는다. 그래서 고르기·열기·끌어 옮기기를 우리가 맡는다.

const id = new URLSearchParams(location.search).get('id');
const panel = document.getElementById('panel');
const title = document.getElementById('title');
const nameEl = document.getElementById('name');
const renameEl = document.getElementById('rename');
const body = document.getElementById('body');
const floor = document.getElementById('floor');

let fence = null;
let theme = null;
let corner = null;
let lang = window.DeskI18n.DEFAULT_LANG;
let items = [];
let hover = null;
let drag = null;
// 한 번 눌러 열지, 두 번 눌러 열지. 설정에서 고른다.
let openWith = 'double';
// 창은 그림자를 켜면 박스보다 사방으로 이만큼 크다.
let edge = 0;

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
  // 모서리를 각지게도, 둥글게도 할 수 있다.
  panel.style.borderRadius = `${corner ? corner.radius : 20}px`;
  const alpha = fence.opacity || 0.52;
  // 색 위에 빛과 그늘을 겹쳐 두께가 있는 판처럼 보이게 한다.
  panel.style.background = [
    'linear-gradient(168deg,',
    'rgba(255,255,255,0.22) 0%,',
    'rgba(255,255,255,0.05) 30%,',
    'rgba(0,0,0,0.06) 62%,',
    'rgba(0,0,0,0.20) 100%),',
    rgba(look.bg, alpha),
  ].join(' ');
  // 제목 줄은 바탕보다 진하고 위쪽이 밝아 튀어나와 보인다.
  title.style.background = [
    'linear-gradient(180deg,',
    'rgba(255,255,255,0.26) 0%,',
    'rgba(255,255,255,0.05) 48%,',
    'rgba(0,0,0,0.16) 100%),',
    rgba(look.bar, Math.min(0.96, alpha + 0.34)),
  ].join(' ');
  panel.style.color = look.text;
  title.style.color = look.text;
  // 밝은 테마에서는 흰 글씨 그림자가 오히려 지저분하다.
  const dark = look.text.toLowerCase() !== '#ffffff';
  panel.classList.toggle('light', dark);
  nameEl.textContent = fence.title || window.DeskI18n.t(lang, 'box.untitled');
  panel.classList.toggle('collapsed', !!fence.collapsed);
  body.style.display = fence.collapsed ? 'none' : 'block';
}

function itemByPath(filePath) {
  return items.find((item) => item.path === filePath) || null;
}

function ensureIcon(item) {
  let el = [...body.children].find((node) => node.dataset.path === item.path);
  if (!el) {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'icon';
    el.dataset.path = item.path;
    el.innerHTML = '<img alt=""><i class="mark"></i><span></span>';
    el.addEventListener('pointerdown', onIconDown);
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      desk.menu(id, item.path);
    });
    body.appendChild(el);
  }
  el.classList.toggle('shortcut', !!item.shortcut);
  el.classList.toggle('folder', !!item.folder);
  el.classList.toggle('recycle', !!item.recycle);
  el.classList.toggle('hot', !!(drag && drag.into === item.path));
  el.querySelector('span').textContent = item.label || item.name;
  const img = el.querySelector('img');
  if (item.icon) img.src = item.icon;
  return el;
}

// 창이 박스보다 클 수 있다. 마우스 좌표를 박스 기준으로 옮긴다.
function localX(clientX) {
  return clientX - edge;
}

function localY(clientY) {
  return clientY - edge;
}

// 박스 기준 세로 좌표를 스크롤한 내용 기준으로 옮긴다. 칸 계산은 늘 내용 기준이다.
function scrolled(value) {
  return value + body.scrollTop;
}

function layout() {
  if (!fence) return;
  paintChrome();
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, fence.collapsed);
  const active = (hover && hover.filePath) || (drag && drag.path) || null;
  const mine = items.some((item) => item.path === active);
  const showGap = !!(hover && active) && !(drag && drag.into);
  let shown = items.slice();
  if ((showGap && mine) || (!showGap && drag && mine)) {
    shown = shown.filter((item) => item.path !== active);
  }
  const points = showGap
    ? window.DeskArrange.gapPoints(shown.length, window.DeskArrange.insertIndex(hover.localX, scrolled(hover.localY), grid, shown.length), grid)
    : window.DeskArrange.reflowPoints(shown.length, grid);
  const rows = Math.max(1, Math.ceil((shown.length + (showGap ? 1 : 0)) / grid.cols));
  // 마지막 줄 아래에는 조금만 남긴다. 한 칸만큼 남기면 스크롤 막대가 생겼을 때
  // 끝까지 내려도 빈 자리가 넓게 보인다.
  floor.style.height = `${rows * grid.cellH + 4}px`;
  const keep = new Set(shown.map((item) => item.path));
  if (drag && mine) keep.add(drag.path);
  for (const node of [...body.children]) {
    if (node !== floor && !keep.has(node.dataset.path)) node.remove();
  }
  // 칸 좌표는 창 기준이고 아이콘은 제목 줄 아래 #body 안에 놓이므로 제목 높이를 뺀다.
  shown.forEach((item, index) => {
    const el = ensureIcon(item);
    const point = points[index];
    el.classList.remove('dragging', 'away');
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y - grid.titleH}px`;
  });
  if (drag && mine) {
    const el = ensureIcon(itemByPath(drag.path) || { path: drag.path, label: drag.label, icon: drag.icon });
    el.classList.add('dragging');
    el.classList.toggle('away', !showGap);
    if (showGap) {
      el.style.left = `${drag.localX - 43}px`;
      el.style.top = `${scrolled(drag.localY) - grid.titleH - 28}px`;
    }
  }
}

// 두 번 누르면 실행한다. 세는 방법은 shared/taps.js 에 있다.
const taps = window.DeskTaps.createTaps();

// 끌어다 놓은 자리에 폴더나 바로가기가 있으면 그 안으로 보낸다.
function receiverAt(clientX, clientY, exceptPath) {
  const x = localX(clientX);
  const y = scrolled(localY(clientY));
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, false);
  for (const node of body.querySelectorAll('.icon')) {
    if (node.dataset.path === exceptPath || node.classList.contains('dragging')) continue;
    if (!node.classList.contains('folder') && !node.classList.contains('shortcut') && !node.classList.contains('recycle')) {
      continue;
    }
    const left = Number.parseFloat(node.style.left);
    const top = Number.parseFloat(node.style.top) + grid.titleH;
    if (!window.DeskDeliver.onPicture(x - left, y - top)) continue;
    return node.dataset.path;
  }
  return null;
}

function onIconDown(event) {
  if (event.button !== 0 || !fence) return;
  event.preventDefault();
  event.stopPropagation();
  const el = event.currentTarget;
  const filePath = el.dataset.path;
  const item = itemByPath(filePath);
  const startX = event.screenX;
  const startY = event.screenY;
  let moved = false;
  el.setPointerCapture(event.pointerId);
  const move = (ev) => {
    if (Math.abs(ev.screenX - startX) + Math.abs(ev.screenY - startY) < 4) return;
    moved = true;
    drag = {
      path: filePath,
      label: item ? item.label : '',
      icon: item ? item.icon : '',
      localX: localX(ev.clientX),
      localY: localY(ev.clientY),
      into: receiverAt(ev.clientX, ev.clientY, filePath),
    };
    desk.hover({
      filePath,
      screenX: ev.screenX,
      screenY: ev.screenY,
      icon: drag.icon,
    });
    layout();
  };
  const up = (ev) => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    if (!moved) {
      if (openWith === 'single' || taps.tap(filePath)) desk.open(filePath);
      return;
    }
    // 끌어 옮긴 뒤에는 두 번 누른 것으로 세지 않는다.
    taps.forget();
    const into = drag && drag.into;
    drag = null;
    desk.transfer({
      id,
      filePath,
      screenX: ev.screenX,
      screenY: ev.screenY,
      into,
    });
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

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

// 빈 곳에서 오른쪽 단추를 누르면 박스 메뉴가 뜬다.
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
      layout();
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

body.addEventListener('scroll', () => {
  desk.scrolled(id, body.scrollTop);
  layout();
});

// 탐색기에서 끌어다 놓는 길. 박스 안의 아이콘을 끄는 길과 다르다.
body.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!fence || drag) return;
  hover = { filePath: '__external__', localX: localX(event.clientX), localY: localY(event.clientY) };
  layout();
});

body.addEventListener('dragleave', () => {
  if (hover && hover.filePath === '__external__') {
    hover = null;
    layout();
  }
});

body.addEventListener('drop', (event) => {
  event.preventDefault();
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, false);
  const index = window.DeskArrange.insertIndex(localX(event.clientX), scrolled(localY(event.clientY)), grid, items.length);
  const paths = [...event.dataTransfer.files].map((file) => desk.pathForFile(file)).filter(Boolean);
  const into = receiverAt(event.clientX, event.clientY, null);
  hover = null;
  if (paths.length) desk.dropFiles({ id, paths, index, into });
});

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
  const wasDrag = drag;
  fence = payload.fence;
  theme = payload.theme || null;
  corner = payload.corner || null;
  lang = payload.lang || lang;
  items = payload.items || [];
  openWith = payload.openWith === 'single' ? 'single' : 'double';
  edge = payload.shadow ? window.DeskArrange.SHADOW : 0;
  panel.classList.toggle('shadow', !!payload.shadow);
  if (wasDrag) drag = wasDrag;
  layout();
});

desk.onHover((payload) => {
  hover = payload;
  layout();
});

desk.onResize(() => layout());
desk.onRename(() => startRename());
desk.ready(id);

window.addEventListener('resize', () => layout());
