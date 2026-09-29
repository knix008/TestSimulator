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
// 이름을 바꾸고 있는 아이콘. { path, el, input }
let editing = null;
// 글쇠로 복사·잘라내기 할 항목. 누른 아이콘이 그 대상이다.
let picked = null;
// 잘라 둔 항목. 붙여넣기 전까지 흐리게 보여 준다.
let cutPath = null;
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
    el.innerHTML = '<img alt="" draggable="false"><i class="mark"></i><span></span>';
    el.addEventListener('pointerdown', onIconDown);
    el.addEventListener('dragstart', onIconDragStart);
    el.addEventListener('click', onIconClick);
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      pick(item.path);
      desk.menu(id, item.path);
    });
    body.appendChild(el);
  }
  el.classList.toggle('shortcut', !!item.shortcut);
  el.classList.toggle('folder', !!item.folder);
  el.classList.toggle('recycle', !!item.recycle);
  el.classList.toggle('hot', receiver() === item.path);
  el.classList.toggle('picked', item.path === picked);
  el.classList.toggle('cut', item.path === cutPath);
  // 파일과 바로가기만 다른 프로그램으로 넘긴다. 휴지통은 놓을 파일이 없다.
  el.draggable = canHandOff(item);
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
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, fence.collapsed);
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

// 끌어다 놓은 자리에 다른 항목의 그림이 있으면 그 항목에게 보낸다.
// 폴더와 폴더 바로가기는 그 안으로, 휴지통은 버리기, 그 밖의 항목은 그것을 실행하며
// 놓은 파일을 입력으로 받는다. 어느 쪽인지는 메인이 고른다.
function receiverAt(clientX, clientY, exceptPath) {
  const x = localX(clientX);
  const y = scrolled(localY(clientY));
  const grid = window.DeskArrange.gridOf(panel.clientWidth, panel.clientHeight, false);
  for (const node of body.querySelectorAll('.icon')) {
    if (node.dataset.path === exceptPath || node.classList.contains('dragging')) continue;
    const left = Number.parseFloat(node.style.left);
    const top = Number.parseFloat(node.style.top) + grid.titleH;
    if (!window.DeskDeliver.onPicture(x - left, y - top)) continue;
    return node.dataset.path;
  }
  return null;
}

// 이 창 밖으로 나갔는가. 포인터를 잡아 두면 창 밖 좌표도 들어온다.
function leftWindow(ev) {
  return ev.clientX < 0 || ev.clientY < 0
    || ev.clientX >= window.innerWidth || ev.clientY >= window.innerHeight;
}

// 휴지통 같은 셸 항목은 넘길 파일이 없다.
function canHandOff(item) {
  if (!item || item.recycle) return false;
  return !String(item.path || '').startsWith('shell:');
}

// 다른 실행 중인 프로그램으로 넘기는 길.
// 이 시작점(dragstart)에서 넘겨야 그 프로그램이 파일을 받는다.
// 마우스를 움직이는 도중에 넘기면 운영체제가 끌기를 바로 끝내 버린다.
function onIconDragStart(event) {
  const el = event.currentTarget;
  const item = itemByPath(el.dataset.path);
  if (!canHandOff(item) || (editing && editing.el === el)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  el.dataset.handed = '1';
  desk.dragOut(item.path);
}

// 끌어 낸 뒤에 남는 클릭으로는 열지 않는다.
function onIconClick(event) {
  const el = event.currentTarget;
  if (el.dataset.handed) {
    delete el.dataset.handed;
    event.preventDefault();
    return;
  }
  const item = itemByPath(el.dataset.path);
  if (!canHandOff(item)) return;
  if (openWith === 'single' || taps.tap(item.path)) desk.open(item.path);
}

function pick(filePath) {
  picked = filePath || null;
  for (const node of body.querySelectorAll('.icon')) {
    node.classList.toggle('picked', node.dataset.path === picked);
  }
}

function onIconDown(event) {
  if (event.button !== 0 || !fence) return;
  pick(event.currentTarget.dataset.path);
  // 이름을 바꾸는 중인 아이콘은 끌지 않는다. 글자를 고르는 손짓이다.
  if (editing && editing.el === event.currentTarget) return;
  const el = event.currentTarget;
  const filePath = el.dataset.path;
  const item = itemByPath(filePath);
  if (canHandOff(item)) {
    // preventDefault 를 하면 dragstart 가 나지 않아, 다른 프로그램이 파일을 받지 못한다.
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const startX = event.screenX;
  const startY = event.screenY;
  let moved = false;
  el.setPointerCapture(event.pointerId);
  const stop = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
  };
  const move = (ev) => {
    if (Math.abs(ev.screenX - startX) + Math.abs(ev.screenY - startY) < 4) return;
    moved = true;
    // 파일과 바로가기는 다른 프로그램 위에서 그 프로그램이 받을 수 있게 넘긴다.
    // 박스와 바탕화면 위에서는 지금처럼 우리가 옮긴다. 휴지통은 넘기지 않는다.
    if (canHandOff(item) && leftWindow(ev) && desk.overForeign(ev.screenX, ev.screenY)) {
      stop();
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch (_err) {
        /* 이미 풀려 있을 수 있다. */
      }
      drag = null;
      desk.hover(null);
      layout();
      if (desk.dragOut(filePath)) {
        taps.forget();
        return;
      }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    }
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
    stop();
    if (!moved) {
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

// 아이콘이 아닌 곳을 누르면 고른 표시를 거둔다.
panel.addEventListener('pointerdown', (event) => {
  const icon = event.target.closest && event.target.closest('.icon');
  if (!icon) pick(null);
});

// 고른 항목을 복사하거나 잘라 두고, 클립보드에 있는 것을 이 박스에 붙인다.
// 이름을 적는 중에는 그 글자를 복사해야 하므로 입력칸의 글쇠는 건드리지 않는다.
document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = String(event.key || '').toLowerCase();
  if (key === 'c' && picked) {
    event.preventDefault();
    cutPath = null;
    desk.copyItem(id, picked);
    layout();
  } else if (key === 'x' && picked) {
    event.preventDefault();
    cutPath = picked;
    desk.cutItem(id, picked);
    layout();
  } else if (key === 'v') {
    event.preventDefault();
    cutPath = null;
    desk.paste(id);
  }
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

// 탐색기나 바탕화면에서 끌어다 놓는 길. 박스 안의 아이콘을 끄는 길과 다르다.
// 제목 줄 위에 놓아도 들어가야 하므로 창 전체가 받는다.
document.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  if (!fence || drag) return;
  // 끌고 오는 동안에도 어느 항목 위인지 보여 준다.
  // 놓고 나서야 알게 되면 휴지통이나 폴더를 겨누기가 어렵다.
  hover = {
    filePath: '__external__',
    localX: localX(event.clientX),
    localY: localY(event.clientY),
    into: receiverAt(event.clientX, event.clientY, null),
  };
  layout();
});

document.addEventListener('dragleave', (event) => {
  // 창 안의 다른 칸으로 옮겨 간 것은 떠난 것이 아니다.
  if (event.relatedTarget) return;
  if (hover && hover.filePath === '__external__') {
    hover = null;
    layout();
  }
});

document.addEventListener('drop', (event) => {
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
  corner = payload.corner || null;
  lang = payload.lang || lang;
  items = payload.items || [];
  // 이름을 바꾸던 항목이 목록에서 빠졌으면(이름이 바뀌었거나 없어졌다) 입력칸을 거둔다.
  if (editing && !items.some((item) => item.path === editing.path)) stopItemRename();
  if (picked && !items.some((item) => item.path === picked)) picked = null;
  if (cutPath && !items.some((item) => item.path === cutPath)) cutPath = null;
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

window.addEventListener('resize', () => layout());
