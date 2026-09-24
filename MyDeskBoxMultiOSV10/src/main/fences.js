'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, app, screen, shell, Menu, nativeImage } = require('electron');
const store = require('./store');
const arrange = require('../shared/arrange');
const desktop = require('./desktop');

const icons = require('./icons');
const ask = require('./ask');
const themes = require('./themes');
const i18n = require('../shared/i18n');
const deliver = require('../shared/deliver');
const thumbCache = new Map();

function createHost(state) {
  const wins = new Map();
  const scrollTops = new Map();
  // 박스마다 따로 여는 설정 창
  const settingWins = new Map();
  const listeners = new Set();
  // 물어보는 창이 여러 개 겹치지 않게 한다.
  let asking = false;
  let drawWin = null;
  let ghost = null;
  let ghostReady = false;

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

  // .ico 나 .png 는 그림 파일 그대로 읽고, 프로그램 파일은 안에 든 그림을 꺼낸다.
  async function iconFrom(source) {
    if (!source) return null;
    try {
      if (!fs.existsSync(source)) return null;
    } catch (_err) {
      return null;
    }
    if (/\.(ico|png|bmp)$/i.test(source)) {
      const image = nativeImage.createFromPath(source);
      if (image.isEmpty()) return null;
      const size = image.getSize();
      return size.width > 64 ? image.resize({ width: 64, height: 64, quality: 'best' }) : image;
    }
    try {
      const image = await app.getFileIcon(source, { size: 'large' });
      return image.isEmpty() ? null : image;
    } catch (_err) {
      return null;
    }
  }

  // 바로가기 자체는 밋밋한 문서 그림만 준다. 지정된 그림이나 가리키는 프로그램에서 가져온다.
  async function iconOf(filePath) {
    // 운영체제가 바탕화면에 그리는 그림을 그대로 가져올 수 있으면 그것이 가장 정확하다.
    if (typeof desktop.fileIcon === 'function') {
      const shot = desktop.fileIcon(filePath);
      if (shot && shot.width && shot.height) {
        const image = nativeImage.createFromBitmap(shot.data, { width: shot.width, height: shot.height });
        if (!image.isEmpty()) return image;
      }
    }
    if (process.platform === 'win32') {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.lnk') {
        let link = null;
        try {
          link = shell.readShortcutLink(filePath);
        } catch (_err) {
          link = null;
        }
        if (link) {
          const found = (await iconFrom(link.icon)) || (await iconFrom(link.target));
          if (found) return found;
        }
      }
      if (ext === '.url') {
        try {
          const text = fs.readFileSync(filePath, 'utf8');
          const line = /^IconFile=(.+)$/im.exec(text);
          const found = line && (await iconFrom(line[1].trim()));
          if (found) return found;
        } catch (_err) {
          /* 아이콘 줄이 없으면 파일 자체의 그림을 쓴다. */
        }
      }
    }
    return app.getFileIcon(filePath, { size: 'large' });
  }

  async function thumb(filePath) {
    try {
      // 셸 항목은 파일이 아니므로 파일 정보를 묻지 않는다.
      const shellItem = desktop.isShellItem && desktop.isShellItem(filePath);
      const key = shellItem ? filePath : `${filePath}:${fs.statSync(filePath).mtimeMs}`;
      if (thumbCache.has(key)) return thumbCache.get(key);
      const image = await iconOf(filePath);
      const url = !image || image.isEmpty() ? '' : image.toDataURL();
      thumbCache.set(key, url);
      return url;
    } catch (_err) {
      return '';
    }
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

  async function payload(fence) {
    const items = [];
    for (const item of prune(fence)) {
      items.push({
        name: item.name,
        path: item.path,
        label: desktop.labelOf(item.name),
        icon: await thumb(item.path),
        shortcut: deliver.isShortcut(item.path),
        folder: isDirectory(item.path),
        recycle: deliver.isRecycle(item.path),
      });
    }
    return {
      fence,
      theme: themes.resolve(fence),
      corner: { radius: themes.cornerRadius(fence.corner) },
      lang: state.settings.lang,
      items,
    };
  }

  async function push(id) {
    pushSettings(id);
    const win = wins.get(id);
    const fence = fenceById(id);
    if (!win || win.isDestroyed() || !fence) return;
    win.webContents.send('fence:state', await payload(fence));
  }

  async function pushAll() {
    for (const fence of state.fences) await push(fence.id);
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
    const outer = arrange.windowRect(fence);
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
    });
    return win;
  }

  function openAll() {
    for (const fence of state.fences) openFence(fence);
    refreshIcons();
    ensureGhost();
  }

  function ensureGhost() {
    if (ghost && !ghost.isDestroyed()) return ghost;
    ghostReady = false;
    ghost = new BrowserWindow({
      width: 76,
      height: 88,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      show: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: webPrefs(),
    });
    ghost.loadFile(path.join(__dirname, '../renderer/ghost.html'));
    ghost.once('ready-to-show', () => {
      ghostReady = true;
    });
    return ghost;
  }

function showGhost(iconUrl, screenX, screenY) {
  const win = ensureGhost();
  const placeGhost = () => {
    if (!win || win.isDestroyed()) return;
    ghostReady = true;
    win.setBounds({
      x: Math.round(screenX - 24),
      y: Math.round(screenY - 18),
      width: 76,
      height: 88,
    });
    if (!win.isVisible()) win.showInactive();
    win.webContents.send('ghost:icon', iconUrl || '');
  };
  if (ghostReady || !win.webContents.isLoading()) placeGhost();
  else win.webContents.once('did-finish-load', placeGhost);
}

  function hideGhost() {
    if (ghost && !ghost.isDestroyed() && ghost.isVisible()) ghost.hide();
  }

  // 창이 아니라 눈에 보이는 박스의 자리. 그림자 여백을 뺀 값이다.
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
    });
  }

  // 설정 창에서 바꾼 것을 곧바로 박스에 반영한다.
  function changeBox(id, patch) {
    if (!patch) return;
    if (typeof patch.title === 'string') rename(id, patch.title);
    if (typeof patch.collapsed === 'boolean') setCollapsed(id, patch.collapsed);
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
    return arrange.panelRect(win.getBounds());
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
    return fence;
  }

  function applyBounds(id, rect, save) {
    const fence = fenceById(id);
    const win = wins.get(id);
    if (!fence || !win || win.isDestroyed()) return;
    fence.x = rect.x;
    fence.y = rect.y;
    if (!fence.collapsed) {
      fence.w = Math.max(180, rect.w);
      fence.h = Math.max(160, rect.h);
    }
    win.setBounds(arrange.windowRect(fence));
    if (save) {
      persist();
      refreshIcons();
    } else {
      win.webContents.send('fence:resize');
    }
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
      if (item) incoming.push(item);
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

  async function eject(id, filePath, screenX, screenY) {
    const fence = fenceById(id);
    if (!fence) return;
    const item = fence.items.find((entry) => entry.path === filePath);
    fence.items = fence.items.filter((entry) => entry.path !== filePath);
    persist();
    await push(id);
    if (item) desktop.moveIcon(item, { x: screenX, y: screenY });
    refreshIcons();
  }

  async function transfer(fromId, filePath, screenX, screenY, intoPath) {
    hideGhost();
    if (intoPath && intoPath !== filePath) {
      const done = await sendInto(filePath, intoPath);
      if (done === 'moved') {
        takeOut(filePath);
        persist();
        await pushAll();
        refreshIcons();
      }
      clearHover();
      if (done) return;
    }
    const target = hit(screenX, screenY);
    if (!target) {
      await eject(fromId, filePath, screenX, screenY);
      clearHover();
      return;
    }
    const index = indexAt(target, screenX, screenY, filePath);
    if (target.id === fromId) await reorder(fromId, filePath, index);
    else await dropFiles(target.id, [filePath], index);
    clearHover();
  }

  function ownerOf(filePath) {
    return state.fences.find((fence) => fence.items.some((item) => item.path === filePath)) || null;
  }

  function hover(filePath, screenX, screenY, icon) {
    const target = hit(screenX, screenY);
    for (const fence of state.fences) {
      const win = wins.get(fence.id);
      if (!win || win.isDestroyed()) continue;
      if (target && target.id === fence.id) {
        const bounds = arrange.panelRect(win.getBounds());
        win.webContents.send('fence:hover', {
          filePath,
          localX: screenX - bounds.x,
          localY: screenY - bounds.y,
        });
      } else {
        win.webContents.send('fence:hover', null);
      }
    }
    // 원래 있던 박스 위에서는 그 박스가 직접 그리므로 따라다니는 그림을 숨긴다.
    // 다른 박스 위에서는 그 박스가 자리만 비워 두므로 그림이 계속 보여야 한다.
    const owner = ownerOf(filePath);
    if (target && owner && target.id === owner.id) hideGhost();
    else showGhost(icon, screenX, screenY);
  }

  function clearHover() {
    hideGhost();
    for (const fence of state.fences) {
      const win = wins.get(fence.id);
      if (win && !win.isDestroyed()) win.webContents.send('fence:hover', null);
    }
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

  // 박스에 담긴 항목은 바탕화면에서 치운다. 같은 항목이 두 곳에 함께 있지 않게 한다.
  // 박스가 깔고 앉은 바탕화면 아이콘은 옆으로 밀어낸다.
  // 박스를 숨긴 동안에는 보여 줄 곳이 없으므로 모두 바탕화면으로 돌려놓는다.
  function refreshIcons() {
    const captured = state.fences.flatMap((fence) => fence.items);
    if (state.hidden) desktop.release(captured);
    else desktop.gather(captured, blockRects());
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
    const items = fence.items.slice();
    state.fences = state.fences.filter((entry) => entry.id !== id);
    persist();
    closeSettings(id);
    if (win && !win.isDestroyed()) win.close();
    for (const item of items) desktop.moveIcon(item, null);
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

  async function emptyBin() {
    const yes = await ask.confirm({
      title: say('dialog.emptyBin'),
      detail: say('dialog.emptyBinDetail'),
      confirm: say('dialog.empty'),
      cancel: say('dialog.cancel'),
      icon: icons.menu('remove'),
      danger: true,
    });
    if (!yes) return;
    if (typeof desktop.emptyRecycle === 'function') desktop.emptyRecycle();
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
        template.push({
          label: say('menu.emptyBin'),
          icon: icons.menu('remove'),
          click: () => emptyBin(),
        });
      }
      template.push(
        {
          label: say('menu.eject'),
          icon: icons.menu('eject'),
          click: () => {
            const bounds = arrange.panelRect(win.getBounds());
            eject(id, filePath, bounds.x + bounds.width + 24, bounds.y + 48);
          },
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
    hover,
    clearHover,
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
    restyle,
    captured,
  };
}

module.exports = { createHost };
