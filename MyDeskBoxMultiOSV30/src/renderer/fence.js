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
// 이 박스만의 글자 색과 그림·글씨 크기. 적지 않은 값은 테마가 정한 대로 채워 온다.
let look = null;
let corner = null;
let lang = window.DeskI18n.DEFAULT_LANG;
let items = [];
let hover = null;
let drag = null;
// 한 번 눌러 고른 아이콘. 같은 아이콘을 다시 누르면 고르기를 푼다.
// Delete 는 그 항목을 박스에서 뺀다. 파일 자체는 지우지 않는다.
let selected = null;
// 이름을 바꾸고 있는 아이콘. { path, el, input }
let editing = null;
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
  const skin = theme || { bg: '#2563eb', bar: '#1e3a8a', text: '#ffffff' };
  // 아이콘 그림과 이름 글씨의 크기. 칸 크기가 여기서 나오므로 CSS 도 같은 값을 쓴다.
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, fence.collapsed, fence.look);
  panel.style.setProperty('--cell-w', `${grid.cellW}px`);
  panel.style.setProperty('--cell-h', `${grid.cellH}px`);
  panel.style.setProperty('--icon', `${grid.icon}px`);
  panel.style.setProperty('--label', `${grid.font}px`);
  // 모서리를 각지게도, 둥글게도 할 수 있다.
  const radiusPx = corner ? corner.radius : 20;
  panel.style.borderRadius = `${radiusPx}px`;
  // 모퉁이 밖은 판이 칠하지 않는다. 둥글기만으로는 그 칸이 사각으로 남는 경우가 있다.
  panel.style.clipPath = radiusPx > 0 ? `inset(0 round ${radiusPx}px)` : 'none';
  // 제목 줄은 사각형이라, 위 모퉁이를 같이 둥글게 해야 그 칸이 사각으로 남지 않는다.
  title.style.borderTopLeftRadius = `${radiusPx}px`;
  title.style.borderTopRightRadius = `${radiusPx}px`;
  panel.classList.toggle('native', items.some((item) => item.native));
  const alpha = fence.opacity == null ? 0.52 : fence.opacity;
  // 빛 덧칠은 기본 투명도에서 지금과 같게, 투명도를 낮추면 같이 옅어진다.
  // 고정된 덧칠이 있으면 설정을 내려도 판이 그대로 진해 보인다.
  const shine = alpha / 0.52;
  panel.style.setProperty('--shine', String(shine));
  const wash = (amount) => Math.max(0, Math.min(1, amount * shine)).toFixed(3);
  // 색 위에 빛과 그늘을 겹쳐 두께가 있는 판처럼 보이게 한다.
  panel.style.background = [
    'linear-gradient(168deg,',
    `rgba(255,255,255,${wash(0.22)}) 0%,`,
    `rgba(255,255,255,${wash(0.05)}) 30%,`,
    `rgba(0,0,0,${wash(0.06)}) 62%,`,
    `rgba(0,0,0,${wash(0.2)}) 100%),`,
    rgba(skin.bg, alpha),
  ].join(' ');
  // 제목 줄은 바탕보다 조금 진하다. 진하기는 판과 같은 비율로 따라간다.
  title.style.background = [
    'linear-gradient(180deg,',
    `rgba(255,255,255,${wash(0.26)}) 0%,`,
    `rgba(255,255,255,${wash(0.05)}) 48%,`,
    `rgba(0,0,0,${wash(0.16)}) 100%),`,
    rgba(skin.bar, Math.min(0.96, alpha * 1.65)),
  ].join(' ');
  // 글씨 색은 박스마다 따로 정할 수 있다. 정하지 않았으면 테마가 고른 색이 온다.
  const labelColor = (look && look.text) || skin.text;
  const titleColor = (look && look.bar) || skin.text;
  panel.style.color = labelColor;
  title.style.color = titleColor;
  // 밝은 테마에서는 흰 글씨 그림자가 오히려 지저분하다.
  const dark = skin.text.toLowerCase() !== '#ffffff';
  panel.classList.toggle('light', dark);
  nameEl.textContent = fence.title || window.DeskI18n.t(lang, 'box.untitled');
  // 포털은 폴더를 비추는 박스다. 제목 줄에 그 표시를 두어 보통 박스와 헷갈리지 않게 한다.
  panel.classList.toggle('portal', !!(fence && fence.portal));
  title.title = fence && fence.portal ? fence.portal : '';
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
  el.classList.toggle('hot', receiver() === item.path);
  el.classList.toggle('picked', selected === item.path);
  el.classList.toggle('native', !!item.native);
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

// 지금 커서 아래에 있는 받을 항목.
//
// 손가락으로 끄는 길에서는 메인이 재어 알려 준다(hover.into). 창은 제 안쪽만
// 볼 수 있어, 다른 박스에서 건너오거나 바탕화면에서 끌어 온 것은 알 수 없다.
// 탐색기에서 끌어다 놓는 길은 메인을 거치지 않으므로 창이 직접 잰다.
function receiver() {
  return (hover && hover.into) || null;
}

function layout() {
  if (!fence) return;
  paintChrome();
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, fence.collapsed, fence.look);
  const active = (hover && hover.filePath) || (drag && drag.path) || null;
  const mine = items.some((item) => item.path === active);
  // 받을 항목 위에 있는 동안에는 끼워 넣을 자리를 벌리지 않는다.
  // 두 가지를 함께 보여 주면 무엇이 일어날지 알 수 없다.
  const showGap = !!(hover && active) && !receiver();
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
    // 손끝이 판 밖이면 그 아이콘을 판 안에 그리지 않는다. 밖에 그리는 그림은 따로 따라온다.
    const left = drag.localX - Math.round(grid.cellW / 2);
    const top = scrolled(drag.localY) - grid.titleH - Math.round(grid.cellH * 0.32);
    const outside = left < 0 || top < 0 || left + grid.cellW > panel.clientWidth || top + grid.cellH > panel.clientHeight;
    el.classList.add('dragging');
    el.classList.toggle('away', outside || !showGap);
    if (showGap && !outside) {
      // 끄는 아이콘은 손끝 아래 가운데에 온다. 칸 크기가 박스마다 다르므로 칸에서 셈한다.
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }
  }
}

// 두 번 누르면 실행한다. 세는 방법은 shared/taps.js 에 있다.
const taps = window.DeskTaps.createTaps();

// 끌어다 놓은 자리에 다른 항목의 그림이 있으면 그 항목에게 보낸다.
// 폴더와 폴더 바로가기는 그 안으로, 휴지통은 버리기, 그 밖의 항목은 그것을 실행하며
// 놓은 파일을 입력으로 받는다. 어느 쪽인지는 메인이 고른다.
function receiverAt(clientX, clientY, exceptPath) {
  const x = localX(clientX);
  const y = scrolled(localY(clientY));
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, false, fence && fence.look);
  for (const node of body.querySelectorAll('.icon')) {
    if (node.dataset.path === exceptPath || node.classList.contains('dragging')) continue;
    const left = Number.parseFloat(node.style.left);
    const top = Number.parseFloat(node.style.top) + grid.titleH;
    if (!window.DeskDeliver.onPicture(x - left, y - top, grid.icon, grid.cellW)) continue;
    return node.dataset.path;
  }
  return null;
}

function onIconDown(event) {
  if (event.button !== 0 || !fence) return;
  // 이름을 바꾸는 중인 아이콘은 끌지 않는다. 글자를 고르는 손짓이다.
  if (editing && editing.el === event.currentTarget) return;
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
      selected = selected === filePath ? null : filePath;
      layout();
      if (openWith === 'single' || taps.tap(filePath)) desk.open(filePath);
      return;
    }
    // 끌어 옮긴 뒤에는 두 번 누른 것으로 세지 않는다.
    taps.forget();
    drag = null;
    // 받을 항목은 메인이 손을 뗀 자리에서 다시 잰다. 여기서는 어디서 뗐는지만 알린다.
    desk.transfer({
      id,
      filePath,
      screenX: ev.screenX,
      screenY: ev.screenY,
    });
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

// 제목 줄이나 가장자리를 끄는 동안에는 클릭을 바탕화면으로 넘기지 않는다.
let chromeHold = false;

function passMouse(event) {
  if (!window.desk.pass) return;
  if (chromeHold) {
    window.desk.pass(false);
    return;
  }
  const chrome = event.target.closest('#title, #gear, .edge, input, button.icon');
  window.desk.pass(!chrome);
}

window.addEventListener('mousemove', passMouse);

title.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target === renameEl || !fence) return;
  chromeHold = true;
  if (window.desk.pass) window.desk.pass(false);
  const start = { x: event.screenX, y: event.screenY, fx: fence.x, fy: fence.y };
  let moved = false;
  title.setPointerCapture(event.pointerId);
  panel.classList.add('moving');
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
    chromeHold = false;
    panel.classList.remove('moving');
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
    chromeHold = true;
    if (window.desk.pass) window.desk.pass(false);
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
    panel.classList.add('moving');
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
      chromeHold = false;
      panel.classList.remove('moving');
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

body.addEventListener('pointerdown', (event) => {
  if (event.target !== body) return;
  if (!selected) return;
  selected = null;
  layout();
});

body.addEventListener('scroll', () => {
  desk.scrolled(id, body.scrollTop);
  layout();
});

// 탐색기에서 끌어다 놓는 길. 박스 안의 아이콘을 끄는 길과 다르다.
body.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!fence || drag) return;
  // 탐색기에서 끌고 오는 동안에도 어느 항목 위인지 보여 준다.
  // 놓고 나서야 알게 되면 휴지통이나 폴더를 겨누기가 어렵다.
  hover = {
    filePath: '__external__',
    localX: localX(event.clientX),
    localY: localY(event.clientY),
    into: receiverAt(event.clientX, event.clientY, null),
  };
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
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, false, fence && fence.look);
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

// 박스에 담긴 항목 하나의 이름. 아이콘의 글자 자리에 입력칸을 얹는다.
// 박스 이름과 달리 이것은 박스 폴더 안의 파일 이름을 바꾸는 일이다.
function labelOfItem(filePath) {
  const item = itemByPath(filePath);
  if (!item) return '';
  return item.label || item.name || '';
}

function startItemRename(filePath) {
  if (!fence || fence.collapsed) return;
  commitItemRename();
  const el = [...body.children].find((node) => node.dataset.path === filePath);
  if (!el) return;
  const input = document.createElement('input');
  input.className = 'edit';
  input.spellcheck = false;
  input.value = labelOfItem(filePath);
  el.appendChild(input);
  el.classList.add('editing');
  editing = { path: filePath, el, input };
  // 입력칸 위의 손짓과 글쇠는 아이콘의 끌기·열기와 섞이지 않게 여기서 멈춘다.
  input.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') commitItemRename();
    if (event.key === 'Escape') stopItemRename();
  });
  input.addEventListener('blur', () => commitItemRename());
  input.focus();
  input.select();
}

function stopItemRename() {
  if (!editing) return;
  const { el, input } = editing;
  editing = null;
  el.classList.remove('editing');
  input.remove();
}

function commitItemRename() {
  if (!editing) return;
  const filePath = editing.path;
  const next = editing.input.value.trim();
  const was = labelOfItem(filePath);
  stopItemRename();
  if (next && next !== was) desk.renameItem(id, filePath, next);
}

desk.onState((payload) => {
  if (!payload || payload.fence.id !== id) return;
  const wasDrag = drag;
  fence = payload.fence;
  theme = payload.theme || null;
  look = payload.look || null;
  corner = payload.corner || null;
  lang = payload.lang || lang;
  items = payload.items || [];
  // 이름을 바꾸던 항목이 목록에서 빠졌으면(이름이 바뀌었거나 없어졌다) 입력칸을 거둔다.
  if (editing && !items.some((item) => item.path === editing.path)) stopItemRename();
  if (selected && !items.some((item) => item.path === selected)) selected = null;
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
desk.onRenameItem((filePath) => startItemRename(filePath));
desk.ready(id);

window.addEventListener('keydown', (event) => {
  if (!selected || editing || !renameEl.hidden) return;
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (event.target && event.target.tagName === 'INPUT') return;
  event.preventDefault();
  const filePath = selected;
  selected = null;
  layout();
  desk.eject(id, filePath);
});

window.addEventListener('resize', () => layout());
