'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, app, screen, shell, Menu } = require('electron');
const store = require('./store');
const arrange = require('../shared/arrange');
const desktop = require('./desktop');

const icons = require('./icons');
const ask = require('./ask');
const themes = require('./themes');
const i18n = require('../shared/i18n');
const deliver = require('../shared/deliver');
const catalog = require('../shared/catalog');

function createHost(state) {
  const wins = new Map();
  // 박스마다 판 창이 하나 더 있다. 아이콘 층 뒤에서 판만 그린다.
  const panels = new Map();
  const scrollTops = new Map();
  // 박스마다 따로 여는 설정 창
  const settingWins = new Map();
  const listeners = new Set();
  // 물어보는 창이 여러 개 겹치지 않게 한다.
  let asking = false;
  let drawWin = null;

  function persist() {
    store.save(state);
  }

  // 지금 고른 언어로 글을 고른다.
  function say(key, vars) {
    return i18n.t(state.settings.lang, key, vars);
  }

  function fenceById(id) {
    return state.fences.find((fence) => fence.id === id) || null;
  }

  // 휴지통은 비었을 때와 찼을 때 그림이 다르다. 바뀌면 박스를 다시 그린다.
  function binState() {
    if (typeof desktop.recycleCount !== 'function') return '';
    const left = desktop.recycleCount();
    if (left < 0) return '';
    return left > 0 ? 'full' : 'empty';
  }

  function prune(fence) {
    const kept = fence.items.filter((item) => {
      if (desktop.isShellItem && desktop.isShellItem(item.path)) return true;
      try {
        return fs.existsSync(item.path);
      } catch (_err) {
        return false;
      }
    });
    if (kept.length !== fence.items.length) {
      fence.items = kept;
      persist();
    }
    return kept;
  }

  // 아이콘 그림은 이제 탐색기가 박스 위에 직접 그린다. 우리는 그리지 않는다.
  // 그래도 설정 창과 메뉴가 담긴 목록을 알아야 하므로 이름과 경로는 보낸다.
  function payload(fence) {
    const items = prune(fence).map((item) => ({
      name: item.name,
      path: item.path,
      label: desktop.labelOf(item.name),
      shortcut: deliver.isShortcut(item.path),
      recycle: deliver.isRecycle(item.path),
    }));
    return {
      fence,
      theme: themes.resolve(fence),
      corner: { radius: themes.cornerRadius(fence.corner) },
      lang: state.settings.lang,
      shadow: !!state.settings.shadow,
      openWith: state.settings.openWith === 'single' ? 'single' : 'double',
      items,
    };
  }

  function push(id) {
    pushSettings(id);
    const fence = fenceById(id);
    if (!fence) return;
    const shown = payload(fence);
    const win = wins.get(id);
    if (win && !win.isDestroyed()) win.webContents.send('fence:state', shown);
    // 판 창도 같은 상태로 그린다. 테마와 접힘이 함께 바뀌어야 한다.
    const board = panels.get(id);
    if (board && !board.isDestroyed()) board.webContents.send('fence:state', shown);
  }

  function pushAll() {
    for (const fence of state.fences) push(fence.id);
  }

  function webPrefs() {
    return {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    };
  }

  function showFence(win) {
    if (!win || win.isDestroyed()) return;
    win.showInactive();
    desktop.place(win);
  }

  function openFence(fence) {
    const existing = wins.get(fence.id);
    if (existing && !existing.isDestroyed()) return existing;
    // 화면 수가 바뀐 뒤에도 적어 둔 자리가 화면 밖일 수 있다.
    clampToScreen(fence);
    const outer = arrange.windowRect(fence, state.settings.shadow);
    const win = new BrowserWindow({
      x: outer.x,
      y: outer.y,
      width: outer.width,
      height: outer.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      show: false,
      icon: icons.app(),
      backgroundColor: '#00000000',
      webPreferences: webPrefs(),
    });
    wins.set(fence.id, win);
    win.loadFile(path.join(__dirname, '../renderer/fence.html'), { query: { id: fence.id } });
    const show = () => {
      if (state.hidden || win.isDestroyed()) return;
      showFence(win);
    };
    win.once('ready-to-show', show);
    win.on('show', () => desktop.place(win));
    win.on('closed', () => {
      if (wins.get(fence.id) === win) wins.delete(fence.id);
      closePanel(fence.id);
    });
    openPanel(fence);
    return win;
  }

  // 박스의 판. 바탕화면 아이콘 층 뒤에 들어가므로 아이콘이 이 위에 그려진다.
  // 마우스는 받지 않는다. 제목 줄과 가장자리는 앞의 테두리 창이 맡는다.
  function openPanel(fence) {
    if (!desktop.nativeIcons || typeof desktop.behindIcons !== 'function') return null;
    const existing = panels.get(fence.id);
    if (existing && !existing.isDestroyed()) return existing;
    const outer = arrange.windowRect(fence, state.settings.shadow);
    const win = new BrowserWindow({
      x: outer.x,
      y: outer.y,
      width: outer.width,
      height: outer.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: webPrefs(),
    });
    panels.set(fence.id, win);
    win.loadFile(path.join(__dirname, '../renderer/panel.html'), { query: { id: fence.id } });
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      if (!state.hidden) win.showInactive();
      sinkPanel(fence.id);
    });
    win.on('closed', () => {
      if (panels.get(fence.id) === win) panels.delete(fence.id);
    });
    return win;
  }

  // 판을 아이콘 층 뒤로 넣고 자리를 잡는다.
  // 한 번 넣으면 부모가 바뀌므로 자리는 placeBehind 로만 옮긴다.
  function sinkPanel(id) {
    const win = panels.get(id);
    const fence = fenceById(id);
    if (!win || win.isDestroyed() || !fence) return;
    const handle = handleOf(win);
    if (!handle) return;
    if (!win.__sunk) win.__sunk = desktop.behindIcons(handle);
    placePanel(id);
  }

  function placePanel(id) {
    const win = panels.get(id);
    const fence = fenceById(id);
    if (!win || win.isDestroyed() || !fence) return;
    const outer = arrange.windowRect(fence, state.settings.shadow);
    const rect = { x: outer.x, y: outer.y, width: outer.width, height: outer.height };
    if (win.__sunk && typeof desktop.placeBehind === 'function') {
      desktop.placeBehind(handleOf(win), rect);
      return;
    }
    win.setBounds(outer);
  }

  function closePanel(id) {
    const win = panels.get(id);
    panels.delete(id);
    if (win && !win.isDestroyed()) win.close();
  }

  function openAll() {
    for (const fence of state.fences) openFence(fence);
    refreshIcons();
    if (clickTimer) return;
    clickTimer = setInterval(passClicks, 40);
    // 이 시계 하나 때문에 프로세스가 살아 있을 까닭은 없다.
    if (typeof clickTimer.unref === 'function') clickTimer.unref();
  }

  // 테두리 창은 박스 넓이만큼 크지만 그리는 것은 제목 줄과 가장자리뿐이다.
  // 가운데는 그 아래 바탕화면 아이콘이 받아야 하므로 마우스를 흘려보낸다.
  // 커서가 제목 줄이나 가장자리에 오면 다시 받는다.
  let clickTimer = null;

  function passClicks() {
    let cursor = null;
    try {
      cursor = screen.getCursorScreenPoint();
    } catch (_err) {
      return;
    }
    for (const [id, win] of wins) {
      if (!win || win.isDestroyed()) continue;
      const fence = fenceById(id);
      const bounds = win.getBounds();
      const x = cursor.x - bounds.x;
      const y = cursor.y - bounds.y;
      const pad = state.settings.shadow ? arrange.SHADOW : 0;
      const inside = x >= pad && y >= pad && x <= bounds.width - pad && y <= bounds.height - pad;
      // 접은 박스는 제목 줄이 전부다. 통째로 우리가 받는다.
      const collapsed = !!(fence && fence.collapsed);
      const chrome = inside && (collapsed
        || y < pad + arrange.TITLE_H
        || y > bounds.height - pad - 12
        || x < pad + 12
        || x > bounds.width - pad - 12);
      const ignore = !chrome;
      if (win.__pass === ignore) continue;
      win.__pass = ignore;
      win.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }

  function openSettings(id) {
    const fence = fenceById(id);
    if (!fence) return;
    const existing = settingWins.get(id);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return;
    }
    const win = new BrowserWindow({
      width: 380 + arrange.SHADOW * 2,
      height: 430 + arrange.SHADOW * 2,
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      show: false,
      icon: icons.app(),
      backgroundColor: '#00000000',
      webPreferences: webPrefs(),
    });
    settingWins.set(id, win);
    win.loadFile(path.join(__dirname, '../renderer/settings.html'), { query: { id } });
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      if (settingWins.get(id) === win) settingWins.delete(id);
    });
  }

  // 설정 창을 내용 높이에 맞춘다. 스크롤 막대가 생기지 않게 한다.
  function fitSettings(id, height) {
    const win = settingWins.get(id);
    if (!win || win.isDestroyed()) return;
    const want = Math.max(240, Math.min(900, Math.round(Number(height) || 0)));
    if (!want) return;
    const bounds = win.getBounds();
    const outer = want + arrange.SHADOW * 2;
    if (Math.abs(bounds.height - outer) < 2) return;
    win.setBounds({ ...bounds, height: outer });
  }

  function closeSettings(id) {
    const win = settingWins.get(id);
    if (win && !win.isDestroyed()) win.close();
  }

  async function pushSettings(id) {
    const win = settingWins.get(id);
    const fence = fenceById(id);
    if (!win || win.isDestroyed() || !fence) return;
    const shot = icons.app();
    win.webContents.send('box:state', {
      fence,
      lang: state.settings.lang,
      icon: shot && !shot.isEmpty() ? shot.resize({ width: 18, height: 18 }).toDataURL() : '',
      themes: themes.THEMES.map((theme) => ({
        id: theme.id, label: theme.label, bg: theme.bg, bar: theme.bar,
      })),
      corner: { radius: themes.cornerRadius(fence.corner), min: themes.MIN_CORNER, max: themes.MAX_CORNER },
      look: themes.resolve(fence),
      opacity: { value: fence.opacity, min: 0.15, max: 0.9 },
      shadow: !!state.settings.shadow,
    });
  }

  // 설정 창에서 바꾼 것을 곧바로 박스에 반영한다.
  function changeBox(id, patch) {
    if (!patch) return;
    if (typeof patch.title === 'string') rename(id, patch.title);
    if (typeof patch.collapsed === 'boolean') setCollapsed(id, patch.collapsed);
    if (typeof patch.shadow === 'boolean') setShadow(patch.shadow);
    if (patch.theme || patch.custom || patch.corner !== undefined || typeof patch.opacity === 'number') {
      restyle(id, patch);
    }
    pushSettings(id);
  }

  // 이 박스만 처음 모습으로 되돌린다. 안의 아이콘과 자리는 그대로 둔다.
  function resetBox(id) {
    const fence = fenceById(id);
    if (!fence) return;
    fence.theme = state.settings.theme;
    fence.custom = null;
    fence.corner = themes.cornerRadius(state.settings.corner);
    fence.opacity = state.settings.opacity;
    fence.collapsed = false;
    persist();
    applyBounds(id, fence, true);
    push(id);
  }

  function boundsOf(id) {
    const win = wins.get(id);
    if (!win || win.isDestroyed()) return null;
    return arrange.panelRect(win.getBounds(), state.settings.shadow);
  }

  function hit(screenX, screenY) {
    const point = { x: screenX, y: screenY };
    for (const fence of [...state.fences].reverse()) {
      if (fence.collapsed) continue;
      const bounds = boundsOf(fence.id);
      if (!bounds) continue;
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
        return fence;
      }
    }
    return null;
  }

  function createFence(rect) {
    const n = state.fences.length + 1;
    const fence = store.normalizeFence({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: n === 1 ? say('box.first') : say('box.nth', { n }),
      x: rect.x,
      y: rect.y,
      w: Math.max(220, rect.w),
      h: Math.max(180, rect.h),
      theme: state.settings.theme,
      opacity: state.settings.opacity,
      corner: state.settings.corner,
    });
    state.fences.push(fence);
    persist();
    const win = openFence(fence);
    if (!state.hidden) showFence(win);
    // 새 박스가 깔고 앉은 바탕화면 아이콘을 바로 밀어낸다. 3초를 기다리지 않는다.
    refreshIcons();
    return fence;
  }

  // 박스는 화면 밖으로 나가지 않는다. 가장 가까운 화면의 작업 영역 안으로 들인다.
  // 그림자를 켜 두면 창이 박스보다 크므로 그 여백까지 넣고 잰다.
  function clampToScreen(fence) {
    const pad = state.settings.shadow ? arrange.SHADOW : 0;
    let area = null;
    try {
      area = screen.getDisplayNearestPoint({ x: Math.round(fence.x), y: Math.round(fence.y) }).workArea;
    } catch (_err) {
      return;
    }
    if (!area || !area.width || !area.height) return;
    const left = area.x + pad;
    const top = area.y + pad;
    const width = Math.max(180, area.width - pad * 2);
    const height = Math.max(160, area.height - pad * 2);
    fence.w = Math.min(fence.w, width);
    if (!fence.collapsed) fence.h = Math.min(fence.h, height);
    const tall = arrange.panelHeight(fence);
    fence.x = Math.min(Math.max(fence.x, left), left + width - fence.w);
    fence.y = Math.min(Math.max(fence.y, top), top + Math.max(0, height - tall));
  }

  function applyBounds(id, rect, save) {
    const fence = fenceById(id);
    const win = wins.get(id);
    if (!fence || !win || win.isDestroyed()) return;
    fence.x = rect.x;
    fence.y = rect.y;
    const wasW = fence.w;
    const wasH = fence.h;
    if (!fence.collapsed) {
      fence.w = Math.max(180, rect.w);
      fence.h = Math.max(160, rect.h);
    }
    clampToScreen(fence);
    win.setBounds(arrange.windowRect(fence, state.settings.shadow));
    // 판은 아이콘 층 뒤에 있어 부모가 다르다. 따로 옮긴다.
    placePanel(id);
    if (save) {
      persist();
      refreshIcons();
      return;
    }
    // 자리만 옮긴 것이면 안의 칸은 그대로다. 옮기는 동안 다시 그리지 않아야 따라온다.
    if (fence.w !== wasW || fence.h !== wasH) win.webContents.send('fence:resize');
    // 끄는 동안에도 새로 가린 바탕화면 아이콘을 밀어낸다.
    nudgeSoon();
  }

  // 창을 끄는 동안에도 아이콘이 따라오게 한다. 한 칸마다 부르면 무거우니 사이를 둔다.
  // 끄는 중(live)에는 목록을 다시 읽지 않고, 탐색기가 다 그릴 때까지 기다리지도 않는다.
  const LAYOUT_GAP = 40;
  let laidOutAt = 0;
  let layoutTimer = null;

  function groupsNow() {
    return state.fences.map((fence) => ({
      names: fence.items.map((item) => item.name),
      rect: iconArea(fence),
    }));
  }

  function nudgeSoon() {
    if (state.hidden || closing || typeof desktop.layoutGroups !== 'function') return;
    const left = LAYOUT_GAP - (Date.now() - laidOutAt);
    if (left > 0) {
      if (layoutTimer) return;
      layoutTimer = setTimeout(() => {
        layoutTimer = null;
        nudgeSoon();
      }, left);
      return;
    }
    laidOutAt = Date.now();
    desktop.layoutGroups(groupsNow(), blockRects(), true);
  }

  function setCollapsed(id, collapsed) {
    const fence = fenceById(id);
    if (!fence) return;
    fence.collapsed = !!collapsed;
    persist();
    applyBounds(id, fence, true);
    push(id);
  }

  function setScroll(id, top) {
    scrollTops.set(id, Math.max(0, Number(top) || 0));
  }

  function indexAt(fence, screenX, screenY, filePath) {
    const bounds = boundsOf(fence.id);
    if (!bounds) return fence.items.length;
    const grid = arrange.gridOf(bounds.width, bounds.height, fence.collapsed);
    const without = fence.items.filter((item) => item.path !== filePath);
    // 박스 안이 스크롤돼 있으면 커서 아래 칸은 그만큼 내려가 있다.
    const localY = screenY - bounds.y + (scrollTops.get(fence.id) || 0);
    return arrange.insertIndex(screenX - bounds.x, localY, grid, without.length);
  }

  async function reorder(id, filePath, index) {
    const fence = fenceById(id);
    if (!fence) return;
    const current = fence.items.findIndex((item) => item.path === filePath);
    if (current < 0) return;
    const [item] = fence.items.splice(current, 1);
    const at = Math.max(0, Math.min(index, fence.items.length));
    fence.items.splice(at, 0, item);
    persist();
    await push(id);
  }

  // 파일 경로만 오기도 하고, 이름이 함께 오기도 한다(휴지통 같은 셸 항목).
  function toItem(entry) {
    if (!entry) return null;
    if (typeof entry === 'object' && entry.path) {
      return { name: String(entry.name || path.basename(entry.path)), path: String(entry.path) };
    }
    const filePath = String(entry);
    if (desktop.isShellItem && desktop.isShellItem(filePath)) return null;
    if (!fs.existsSync(filePath)) return null;
    return { name: path.basename(filePath), path: filePath };
  }

  async function acceptDesktopDrop(item, dip) {
    if (!item || !item.path || !dip) return;
    const target = hit(dip.x, dip.y);
    if (!target) return;
    if (target.items.some((entry) => entry.path === item.path)) return;
    const index = indexAt(target, dip.x, dip.y, item.path);
    await dropFiles(target.id, [item], index);
  }

  function isDirectory(filePath) {
    if (!filePath || deliver.isShortcut(filePath) || deliver.isRecycle(filePath)) return false;
    try {
      return fs.statSync(filePath).isDirectory();
    } catch (_err) {
      return false;
    }
  }

  function shortcutLink(filePath) {
    if (process.platform !== 'win32' || !/\.lnk$/i.test(filePath)) return null;
    try {
      const link = shell.readShortcutLink(filePath);
      return link && link.target ? link : null;
    } catch (_err) {
      return null;
    }
  }

  function launch(plan) {
    if (!plan) return;
    if (typeof shell.launch === 'function') {
      shell.launch(plan);
      return;
    }
    const { spawn } = require('child_process');
    const child = spawn(plan.command, plan.args, {
      detached: true,
      stdio: 'ignore',
      cwd: plan.cwd || undefined,
    });
    child.unref();
  }

  async function moveInto(filePath, dir) {
    const dest = path.join(dir, path.basename(filePath));
    if (path.resolve(dest) === path.resolve(filePath)) return false;
    if (fs.existsSync(dest)) return false;
    try {
      await fs.promises.rename(filePath, dest);
    } catch (err) {
      if (!err || err.code !== 'EXDEV') throw err;
      await fs.promises.copyFile(filePath, dest);
      await fs.promises.unlink(filePath);
    }
    return true;
  }

  // moved 면 박스에서 빠진다. handed 면 프로그램에만 넘기고 박스에는 남긴다.
  async function sendInto(filePath, intoPath) {
    if (!filePath || !intoPath || filePath === intoPath) return '';
    if (deliver.isRecycle(intoPath)) {
      await shell.trashItem(filePath);
      return 'moved';
    }
    if (isDirectory(intoPath)) {
      return (await moveInto(filePath, intoPath)) ? 'moved' : '';
    }
    const link = shortcutLink(intoPath);
    if (link && isDirectory(link.target)) {
      return (await moveInto(filePath, link.target)) ? 'moved' : '';
    }
    const plan = deliver.handPlan(link, filePath);
    if (plan) {
      launch(plan);
      return 'handed';
    }
    return '';
  }

  function takeOut(filePath) {
    for (const fence of state.fences) {
      fence.items = fence.items.filter((item) => item.path !== filePath);
    }
  }

  async function dropFiles(id, filePaths, index, intoPath) {
    if (intoPath) {
      let changed = false;
      for (const entry of filePaths || []) {
        const item = toItem(entry);
        if (!item) continue;
        const done = await sendInto(item.path, intoPath);
        if (done === 'moved') {
          takeOut(item.path);
          changed = true;
        }
      }
      if (changed) {
        persist();
        await pushAll();
        refreshIcons();
        return;
      }
    }
    const fence = fenceById(id);
    if (!fence) return;
    const incoming = [];
    for (const entry of filePaths) {
      const item = toItem(entry);
      if (!item) continue;
      // 담는다는 것은 그 박스의 폴더로 옮긴다는 뜻이다.
      // 휴지통 같은 셸 항목은 파일이 아니므로 자리만 적어 둔다.
      if (!(desktop.isShellItem && desktop.isShellItem(item.path))) {
        const next = bringIn(fence, item);
        if (next !== item.path) {
          item.path = next;
          item.name = path.basename(next);
        }
      }
      incoming.push(item);
    }
    if (!incoming.length) return;
    for (const other of state.fences) {
      other.items = other.items.filter((item) => !incoming.some((add) => add.path === item.path));
    }
    const at = Math.max(0, Math.min(index == null ? fence.items.length : index, fence.items.length));
    fence.items.splice(at, 0, ...incoming);
    persist();
    await pushAll();
    refreshIcons();
  }

  // 박스 안에서 바로 지운다. 파일은 휴지통으로 간다.
  // 박스에서만 빼는 것이 아니라 파일 자체가 없어져야 한다.
  async function trashItem(id, filePath) {
    const fence = fenceById(id);
    if (!fence) return;
    const item = fence.items.find((entry) => entry.path === filePath);
    if (!item) return;
    // 휴지통 같은 셸 항목은 지울 파일이 없다. 박스에서만 뺀다.
    if (desktop.isShellItem && desktop.isShellItem(item.path)) {
      fence.items = fence.items.filter((entry) => entry.path !== filePath);
      persist();
      await push(id);
      return;
    }
    try {
      await shell.trashItem(item.path);
    } catch (_err) {
      // 지우지 못했으면 박스에 그대로 둔다. 말없이 사라지는 것보다 낫다.
      return;
    }
    fence.items = fence.items.filter((entry) => entry.path !== filePath);
    persist();
    await push(id);
    // 휴지통이 찼으니 그 그림도 새로 그린다.
    watchBin();
  }

  // 박스에서 꺼내면 그 아이콘을 박스 밖, 원래 있던 자리로 돌려놓는다.
  // 파일은 처음부터 움직이지 않았으므로 옮길 것이 없다.
  async function eject(id, filePath) {
    const fence = fenceById(id);
    if (!fence) return;
    const item = fence.items.find((entry) => entry.path === filePath);
    if (!item) return;
    fence.items = fence.items.filter((entry) => entry.path !== filePath);
    persist();
    await push(id);
    letGo(item);
    // 돌려놓은 자리가 다른 박스 밑이면 그 박스가 다시 밀어낸다.
    refreshIcons();
  }

  // 진짜 바탕화면 폴더. 꺼낸 파일이 돌아갈 곳이다.
  function desktopFolder() {
    try {
      if (typeof desktop.desktopDirectories === 'function') {
        const found = desktop.desktopDirectories()[0];
        if (found) return found;
      }
    } catch (_err) {
      /* 못 찾으면 아래에서 앱에게 묻는다. */
    }
    try {
      return app.getPath('desktop');
    } catch (_err) {
      return '';
    }
  }

  // 아이콘을 끄는 일은 탐색기가 한다. 우리는 손을 뗀 자리만 보고 어느 박스인지 고른다.
  // 그 길은 watchDrag -> acceptDesktopDrop 이다.
  async function transfer(fromId, filePath, screenX, screenY, intoPath) {
    if (intoPath && intoPath !== filePath) {
      const done = await sendInto(filePath, intoPath);
      if (done === 'moved') {
        takeOut(filePath);
        persist();
        pushAll();
        refreshIcons();
      }
      if (done) return;
    }
    const target = hit(screenX, screenY);
    if (!target) {
      await eject(fromId, filePath);
      return;
    }
    const index = indexAt(target, screenX, screenY, filePath);
    if (target.id === fromId) await reorder(fromId, filePath, index);
    else await dropFiles(target.id, [filePath], index);
  }

  // 담는다는 것은 그 아이콘을 이 박스 자리로 모은다는 뜻이다.
  // 파일은 옮기지 않고 숨기지도 않는다. 바탕화면 폴더의 내용은 그대로이고,
  // 탐색기에서도 그대로 보인다. 자리만 바꾸므로 두 곳에 겹쳐 보이지도 않는다.
  function bringIn(_fence, item) {
    return typeof item === 'string' ? item : item && item.path;
  }

  // 바탕화면 아이콘을 원래 자리로 돌려놓는다. 파일은 처음부터 움직이지 않았다.
  function letGo(item) {
    const name = item && (typeof item === 'string' ? item : item.name);
    if (!name) return false;
    if (typeof desktop.putHome !== 'function') return false;
    return desktop.putHome([name]);
  }

  // 바탕화면에서 사라진 항목은 박스에서도 뺀다.
  // 탐색기에서 지웠거나 다른 곳으로 옮긴 것이 이 길로 박스에서 빠진다.
  function settleBox(fence) {
    const kept = fence.items.filter((item) => {
      if (desktop.isShellItem && desktop.isShellItem(item.path)) return true;
      try {
        return fs.existsSync(item.path);
      } catch (_err) {
        return false;
      }
    });
    if (kept.length === fence.items.length) return false;
    fence.items = kept;
    return true;
  }

  // 모든 박스를 폴더와 맞춘다.
  function settleAll() {
    let changed = false;
    for (const fence of state.fences) {
      if (settleBox(fence)) changed = true;
    }
    if (changed) {
      persist();
      pushAll();
    }
    return changed;
  }

  // 마지막으로 본 휴지통 상태. 바뀌면 박스의 그림을 다시 보낸다.
  let lastBin = null;

  function watchBin() {
    const now = binState();
    if (now === lastBin) return;
    lastBin = now;
    const shown = state.fences.some((fence) => fence.items.some((item) => deliver.isRecycle(item.path)));
    if (shown) pushAll();
  }

  // 끝낼 때 바탕화면을 켜기 전 모습으로 돌려놓는다.
  // 파일은 처음부터 옮기지 않았으므로, 담으면서 바꿔 둔 아이콘 자리만 되돌리면 된다.
  // 되돌리는 일 자체는 desktop.release / shutdown 이 적어 둔 자리(homes)로 한다.
  let closing = false;

  function putBack() {
    closing = true;
    if (typeof desktop.release === 'function') desktop.release(captured());
    return true;
  }

  // 박스에 담긴 것은 진짜 바탕화면 아이콘이다. 그 아이콘을 박스 안 격자로 모으고,
  // 담기지 않은 아이콘이 박스 자리에 남아 있으면 밖으로 밀어낸다.
  // 파일은 옮기지도, 감추지도 않는다. 바탕화면 폴더의 내용은 그대로다.
  function iconArea(fence) {
    const bounds = boundsOf(fence.id) || { x: fence.x, y: fence.y, width: fence.w, height: arrange.panelHeight(fence) };
    const title = arrange.TITLE_H;
    return {
      x: bounds.x + 6,
      y: bounds.y + title,
      width: Math.max(40, bounds.width - 12),
      height: Math.max(0, bounds.height - title - 6),
    };
  }

  function refreshIcons() {
    if (closing) return;
    watchBin();
    const changed = settleAll();
    // 셸 아이콘은 레지스트리로 감추지 않는다. 휴지통도 목록에 든 아이콘이라
    // 다른 것처럼 박스 안으로 모으면 된다. 감추면 탐색기에서도 사라진다.
    if (typeof desktop.syncShellIcons === 'function') desktop.syncShellIcons([]);
    if (changed) pushAll();
    if (state.hidden) {
      // 박스를 숨기면 담고 있던 아이콘도 제자리로 돌려준다.
      if (typeof desktop.release === 'function') desktop.release([]);
      return;
    }
    if (typeof desktop.layoutGroups !== 'function') return;
    // 바탕화면에서 무언가를 끌고 있는 동안에는 건드리지 않는다. 손을 떼면 이 길로 다시 온다.
    if (desktop.mouseDown && desktop.mouseDown()) return;
    laidOutAt = Date.now();
    desktop.layoutGroups(groupsNow(), blockRects());
  }

  // 지금 화면에 보이는 박스들이 차지한 자리.
  function blockRects() {
    if (state.hidden) return [];
    const rects = [];
    for (const fence of state.fences) {
      const bounds = boundsOf(fence.id);
      if (bounds) rects.push(bounds);
    }
    return rects;
  }

  function rename(id, title) {
    const fence = fenceById(id);
    if (!fence) return;
    const next = String(title || '').trim();
    if (!next) return;
    fence.title = next;
    persist();
    push(id);
  }

  function restyle(id, patch) {
    const fence = fenceById(id);
    if (!fence) return;
    if (typeof patch.theme === 'string') {
      fence.theme = patch.theme === 'custom' ? 'custom' : themes.themeOf(patch.theme).id;
    }
    if (patch.custom) {
      const made = themes.customTheme(patch.custom);
      fence.custom = { bg: made.bg, bar: made.bar };
      fence.theme = 'custom';
    }
    if (patch.corner !== undefined) fence.corner = themes.cornerRadius(patch.corner);
    if (typeof patch.opacity === 'number') {
      fence.opacity = Math.max(0.15, Math.min(0.9, patch.opacity));
    }
    persist();
    push(id);
  }

  async function removeFence(id) {
    const fence = fenceById(id);
    if (!fence) return;
    const win = wins.get(id);
    const yes = await ask.confirm({
      title: say('dialog.remove', { title: fence.title }),
      detail: say('dialog.removeDetail'),
      confirm: say('dialog.delete'),
      cancel: say('dialog.cancel'),
      icon: icons.menu('remove'),
      danger: true,
    });
    if (!yes) return;
    // 박스를 지우면 담고 있던 아이콘을 원래 자리로 돌려놓는다. 파일은 건드리지 않는다.
    const back = fence.items.map((item) => item.name).filter(Boolean);
    if (back.length && typeof desktop.putHome === 'function') desktop.putHome(back);
    state.fences = state.fences.filter((entry) => entry.id !== id);
    persist();
    closeSettings(id);
    closePanel(id);
    if (win && !win.isDestroyed()) win.close();
    refreshIcons();
  }

  async function openItem(filePath) {
    if (!filePath) return;
    // 휴지통 같은 항목은 파일 경로가 아니라 셸에게 넘겨야 열린다.
    if (desktop.isShellItem && desktop.isShellItem(filePath)) {
      await shell.openExternal(filePath);
      return;
    }
    await shell.openPath(filePath);
  }

  // 메뉴에 쓸 작은 그림. 운영체제에서 그대로 가져온다.
  function shellIcon(shellPath) {
    try {
      const shot = typeof desktop.fileIcon === 'function' ? desktop.fileIcon(shellPath) : null;
      if (!shot || !shot.width) return icons.menu('gather');
      const image = nativeImage.createFromBitmap(shot.data, { width: shot.width, height: shot.height });
      return image.isEmpty() ? icons.menu('gather') : image.resize({ width: 16, height: 16, quality: 'best' });
    } catch (_err) {
      return icons.menu('gather');
    }
  }

  // 휴지통처럼 끌어 넣을 수 없는 바탕화면 항목은 메뉴로 담는다.
  function specialItems(id) {
    if (typeof desktop.shellItems !== 'function') return [];
    const taken = new Set(state.fences.flatMap((fence) => fence.items).map((item) => item.path));
    const left = desktop.shellItems().filter((item) => !taken.has(item.path));
    if (!left.length) return [];
    return [{
      label: say('menu.special'),
      icon: icons.menu('gather'),
      submenu: left.map((item) => ({
        label: item.name,
        icon: shellIcon(item.path),
        click: () => dropFiles(id, [item]),
      })),
    }];
  }

  // 창 번호. 시스템이 띄우는 창의 주인으로 넘겨 박스 뒤로 숨지 않게 한다.
  function handleOf(win) {
    try {
      if (!win || win.isDestroyed() || typeof win.getNativeWindowHandle !== 'function') return 0;
      const buf = win.getNativeWindowHandle();
      if (!buf || buf.length < 4) return 0;
      return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
    } catch (_err) {
      return 0;
    }
  }

  // 지울지 묻는 창과 지우는 동안의 진행률은 시스템이 그대로 보여 준다.
  // 우리가 먼저 묻지 않는다. 같은 것을 두 번 묻게 된다.
  async function emptyBin(id) {
    if (typeof desktop.emptyRecycle !== 'function') return;
    const emptied = await desktop.emptyRecycle(handleOf(wins.get(id)));
    if (!emptied) return;
    await pushAll();
  }

  function showMenu(id, filePath) {
    const fence = fenceById(id);
    const win = wins.get(id);
    if (!fence || !win || win.isDestroyed()) return;
    const template = [];
    if (filePath) {
      template.push(
        { label: say('menu.open'), icon: icons.menu('open'), click: () => openItem(filePath) },
      );
      if (deliver.isRecycle(filePath)) {
        // 비울 것이 없으면 누르지 못하게 한다. 개수를 모를 때(-1)는 열어 둔다.
        const left = typeof desktop.recycleCount === 'function' ? desktop.recycleCount() : -1;
        template.push({
          label: say('menu.emptyBin'),
          icon: icons.menu('remove'),
          enabled: left !== 0,
          click: () => emptyBin(id),
        });
      }
      template.push(
        {
          label: say('menu.eject'),
          icon: icons.menu('eject'),
          click: () => eject(id, filePath),
        },
        {
          label: say('menu.delete'),
          icon: icons.menu('remove'),
          enabled: !(desktop.isShellItem && desktop.isShellItem(filePath)),
          click: () => trashItem(id, filePath),
        },
        { type: 'separator' }
      );
    }
    template.push(
      {
        label: say('menu.rename'),
        icon: icons.menu('rename'),
        click: () => win.webContents.send('fence:rename'),
      },
      {
        label: say(fence.collapsed ? 'menu.expand' : 'menu.collapse'),
        icon: icons.menu(fence.collapsed ? 'expand' : 'collapse'),
        click: () => setCollapsed(id, !fence.collapsed),
      },
      {
        label: say('menu.settings'),
        icon: icons.menu('settings'),
        click: () => openSettings(id),
      },
      { type: 'separator' },
      {
        label: say('menu.theme'),
        icon: icons.themeChip(fence.theme),
        submenu: themes.THEMES.map((theme) => ({
          label: themes.themeLabel(theme, state.settings.lang),
          icon: icons.themeChip(theme.id),
          type: 'radio',
          checked: fence.theme === theme.id,
          click: () => restyle(id, { theme: theme.id }),
        })),
      },
      {
        label: say('menu.corner'),
        icon: icons.corner(fence.corner),
        submenu: themes.CORNERS.map((corner) => ({
          label: corner.label[state.settings.lang] || corner.label.ko,
          icon: icons.corner(corner.radius),
          type: 'radio',
          checked: themes.cornerRadius(fence.corner) === corner.radius,
          click: () => restyle(id, { corner: corner.radius }),
        })),
      },
      {
        label: say('menu.opacity'),
        icon: icons.opacityLevel(fence.opacity),
        submenu: themes.OPACITIES.map((opacity) => ({
          label: `${Math.round(opacity * 100)}%`,
          icon: icons.opacityLevel(opacity),
          type: 'radio',
          checked: Math.abs(fence.opacity - opacity) < 0.05,
          click: () => restyle(id, { opacity }),
        })),
      },
      { type: 'separator' },
      ...specialItems(id),
      { label: say('menu.newBox'), icon: icons.menu('draw'), click: () => beginDraw() },
      { label: say('menu.remove'), icon: icons.menu('remove'), click: () => removeFence(id) }
    );
    Menu.buildFromTemplate(template).popup({ window: win });
  }

  function setHidden(hidden) {
    const next = !!hidden;
    if (state.hidden === next) return;
    state.hidden = next;
    persist();
    for (const [id, win] of wins) {
      if (win.isDestroyed()) continue;
      if (state.hidden) win.hide();
      else {
        showFence(win);
        push(id);
      }
    }
    refreshIcons();
    announce();
  }

  function toggleHidden() {
    setHidden(!state.hidden);
  }

  function beginDraw() {
    if (drawWin && !drawWin.isDestroyed()) {
      drawWin.focus();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = display.bounds;
    drawWin = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      alwaysOnTop: true,
      show: false,
      icon: icons.app(),
      backgroundColor: '#00000000',
      webPreferences: webPrefs(),
    });
    drawWin.loadFile(path.join(__dirname, '../renderer/draw.html'), {
      query: { lang: state.settings.lang },
    });
    drawWin.once('ready-to-show', () => {
      if (!drawWin || drawWin.isDestroyed()) return;
      drawWin.show();
      drawWin.focus();
    });
    drawWin.on('closed', () => {
      drawWin = null;
    });
  }

  // 바탕화면에서 사각형을 끌었을 때. 곧바로 만들지 않고 물어본다.
  async function offerFence(rect) {
    if (!rect || rect.w < 120 || rect.h < 90) return null;
    if (asking) return null;
    asking = true;
    try {
      const yes = await ask.confirm({
        title: say('dialog.create'),
        detail: say('dialog.createDetail'),
        confirm: say('dialog.make'),
        cancel: say('dialog.cancel'),
        icon: icons.menu('draw'),
      });
      if (!yes) return null;
      setHidden(false);
      return createFence(rect);
    } finally {
      asking = false;
    }
  }

  function finishDraw(rect) {
    if (drawWin && !drawWin.isDestroyed()) drawWin.close();
    if (!rect || rect.w < 80 || rect.h < 64) return null;
    // 박스를 그렸다면 보고 싶다는 뜻이다. 숨겨 둔 상태면 함께 되돌린다.
    setHidden(false);
    return createFence(rect);
  }

  function cancelDraw() {
    if (drawWin && !drawWin.isDestroyed()) drawWin.close();
  }

  function announce() {
    for (const listener of listeners) listener();
  }

  function setLang(lang) {
    const next = i18n.langOf(lang);
    if (state.settings.lang === next) return;
    state.settings.lang = next;
    persist();
    pushAll();
    announce();
  }

  function setDefaultTheme(theme) {
    state.settings.theme = themes.themeOf(theme).id;
    persist();
    announce();
  }

  function setDefaultCorner(corner) {
    state.settings.corner = themes.cornerRadius(corner);
    persist();
    announce();
  }

  // 아이콘을 한 번 눌러 열지, 두 번 눌러 열지 정한다.
  function setOpenWith(kind) {
    const next = kind === 'single' ? 'single' : 'double';
    if (state.settings.openWith === next) return;
    state.settings.openWith = next;
    persist();
    pushAll();
    announce();
  }

  function setShadow(on) {
    state.settings.shadow = !!on;
    persist();
    for (const fence of state.fences) {
      const win = wins.get(fence.id);
      if (!win || win.isDestroyed()) continue;
      win.setBounds(arrange.windowRect(fence, state.settings.shadow));
    }
    pushAll();
    announce();
  }

  function setDefaultOpacity(opacity) {
    state.settings.opacity = Math.max(0.15, Math.min(0.9, Number(opacity) || themes.DEFAULT_OPACITY));
    persist();
    announce();
  }

  function setLogin(on) {
    state.settings.openAtLogin = !!on;
    try {
      app.setLoginItemSettings({ openAtLogin: !!on });
    } catch (_err) {
      /* 설치본이 아니면 운영체제가 로그인 항목을 거절할 수 있다. */
    }
    persist();
    announce();
  }

  function captured() {
    return state.fences.flatMap((fence) => fence.items);
  }

  return {
    state,
    openAll,
    push,
    openSettings,
    closeSettings,
    pushSettings,
    fitSettings,
    changeBox,
    resetBox,
    setScroll,
    createFence,
    applyBounds,
    setCollapsed,
    dropFiles,
    acceptDesktopDrop,
    transfer,
    rename,
    removeFence,
    openItem,
    showMenu,
    setHidden,
    toggleHidden,
    onChange: (listener) => listeners.add(listener),
    beginDraw,
    offerFence,
    finishDraw,
    cancelDraw,
    refreshIcons,
    setLogin,
    setLang,
    setDefaultTheme,
    setDefaultCorner,
    setDefaultOpacity,
    setShadow,
    setOpenWith,
    putBack,
    trashItem,
    eject,
    restyle,
    captured,
  };
}

module.exports = { createHost };
