'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, app, screen, shell, Menu, nativeImage } = require('electron');
const store = require('./store');
const arrange = require('../shared/arrange');
const deskgrid = require('../shared/deskgrid');
const desktop = require('./desktop');
const hold = require('./hold');

const icons = require('./icons');
const ask = require('./ask');
const themes = require('./themes');
const i18n = require('../shared/i18n');
const deliver = require('../shared/deliver');
const catalog = require('../shared/catalog');

// 만든 이. 프로그램 정보 탭과 트레이가 같은 것을 보여 준다.
const AUTHOR = { name: 'SHKWON', email: 'knix008@naver.com' };

function createHost(state) {
  const wins = new Map();
  const scrollTops = new Map();
  // 박스마다 따로 여는 설정 창
  const settingWins = new Map();
  const listeners = new Set();
  // 물어보는 창이 여러 개 겹치지 않게 한다.
  let asking = false;
  let drawWin = null;

  // 박스는 제 폴더에서 돌아간다. 보관함 자리를 보관함 모듈에 알려 준다.
  // 설정에서 보관함을 바꾸면 이 길로 다시 알린다.
  function setupHold() {
    return hold.configure({
      root: state.settings.root,
      desktopDir: desktopFolder(),
      userDir: userFolder(),
      hide: typeof desktop.hidePath === 'function' ? desktop.hidePath : null,
    });
  }

  setupHold();

  function boxRoot() {
    return hold.ensureRoot();
  }

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

  // 담긴 파일은 박스 폴더에 있어 바탕화면 아이콘이 없다. 그림은 우리가 그린다.
  // 같은 파일의 그림을 되읽지 않도록 고친 때(mtime)를 열쇠로 기억해 둔다.
  const thumbs = new Map();

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

  // 아이콘 그림.
  //
  // 운영체제가 바탕화면에 그리는 그림을 그대로 가져오는 것이 가장 정확하다.
  // 폴더는 폴더답게, 바로가기는 가리키는 프로그램의 그림으로 보여야 한다.
  // app.getFileIcon 만 쓰면 폴더도 바로가기도 밋밋한 문서 그림이 된다.
  // 탐색기가 바탕화면에서 미리 보기를 그려 주는 그림 파일.
  const PICTURE = /\.(png|jpe?g|gif|bmp|webp|avif)$/i;
  // 너무 큰 그림은 읽는 데만 한참 걸린다. 그런 것은 종류 그림으로 둔다.
  const PICTURE_MAX = 32 * 1024 * 1024;

  // 그림 파일은 그림 자체를 작게 줄여 보여 준다.
  // 종류 그림만 보여 주면 어떤 사진인지 알 수 없다. 바탕화면에서는 미리 보기가 보인다.
  function pictureOf(filePath) {
    if (!PICTURE.test(filePath)) return null;
    try {
      if (fs.statSync(filePath).size > PICTURE_MAX) return null;
      const image = nativeImage.createFromPath(filePath);
      if (!image || image.isEmpty()) return null;
      const size = image.getSize();
      if (!size.width || !size.height) return null;
      // 긴 쪽을 64 로 맞춘다. 창에서는 44 로 그리므로 배율이 높은 화면에서도 또렷하다.
      const scale = 64 / Math.max(size.width, size.height);
      if (scale >= 1) return image;
      return image.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: 'good',
      });
    } catch (_err) {
      return null;
    }
  }

  async function iconOf(filePath) {
    if (desktop.isShellItem && desktop.isShellItem(filePath)) return shellImage(filePath);
    const picture = pictureOf(filePath);
    if (picture) return picture;
    const shot = typeof desktop.fileIcon === 'function' ? desktop.fileIcon(filePath) : null;
    if (shot && shot.width && shot.height) {
      try {
        const image = nativeImage.createFromBitmap(shot.data, { width: shot.width, height: shot.height });
        if (!image.isEmpty()) return image;
      } catch (_err) {
        /* 그림을 만들지 못하면 아래의 길로 간다. */
      }
    }
    if (process.platform === 'win32') {
      const ext = path.extname(filePath).toLowerCase();
      // 바로가기 파일 자체는 밋밋한 문서 그림만 준다. 지정된 그림이나 가리키는 프로그램에서 가져온다.
      if (ext === '.lnk') {
        const link = shortcutLink(filePath);
        if (link) {
          const found = (await iconFrom(link.icon)) || (await iconFrom(link.target));
          if (found) return found;
        }
      }
      if (ext === '.url') {
        try {
          const line = /^IconFile=(.+)$/im.exec(fs.readFileSync(filePath, 'utf8'));
          const found = line && (await iconFrom(line[1].trim()));
          if (found) return found;
        } catch (_err) {
          /* 아이콘 줄이 없으면 파일 자체의 그림을 쓴다. */
        }
      }
    }
    try {
      const image = await app.getFileIcon(filePath, { size: 'large' });
      return image && !image.isEmpty() ? image : null;
    } catch (_err) {
      return null;
    }
  }

  async function thumb(filePath) {
    try {
      const shellItem = desktop.isShellItem && desktop.isShellItem(filePath);
      const key = shellItem ? `${filePath}:${binState()}` : `${filePath}:${fs.statSync(filePath).mtimeMs}`;
      if (thumbs.has(key)) return thumbs.get(key);
      const image = await iconOf(filePath);
      const url = !image || image.isEmpty() ? '' : image.toDataURL();
      thumbs.set(key, url);
      return url;
    } catch (_err) {
      return '';
    }
  }

  // 박스에 적을 이름. 탐색기가 바탕화면에 그리는 글과 같아야 한다.
  // 확장자를 감추는 설정과 폴더의 localized 이름(Documents -> 문서)까지 셸이 붙여 준다.
  // 셸이 답하지 않으면 파일 이름에서 확장자만 떼어 쓴다.
  const labels = new Map();

  function labelFor(item) {
    const key = item.path;
    if (labels.has(key)) return labels.get(key);
    let shown = '';
    if (typeof desktop.displayName === 'function') {
      try {
        shown = desktop.displayName(item.path) || '';
      } catch (_err) {
        shown = '';
      }
    }
    if (!shown) shown = desktop.labelOf(item.name);
    labels.set(key, shown);
    return shown;
  }

  async function payload(fence) {
    const items = [];
    for (const item of prune(fence)) {
      items.push({
        name: item.name,
        path: item.path,
        label: labelFor(item),
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
      shadow: !!state.settings.shadow,
      openWith: state.settings.openWith === 'single' ? 'single' : 'double',
      items,
    };
  }

  async function push(id) {
    pushSettings(id);
    const fence = fenceById(id);
    if (!fence) return;
    const shown = await payload(fence);
    const win = wins.get(id);
    if (win && !win.isDestroyed()) win.webContents.send('fence:state', shown);
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
    // 켤 때는 박스를 옮기지 않는다.
    //
    // 줄을 맞추거나 겹침을 푸는 일은 손이 박스를 움직였을 때만 한다.
    // 켤 때마다 자리를 손보면, 어제 놓아 둔 자리에 오늘 박스가 없다.
    // 화면 수가 바뀌어 자리가 화면 밖으로 나간 경우만 안으로 들인다.
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
    });
    return win;
  }

  function openAll() {
    for (const fence of state.fences) openFence(fence);
    refreshIcons();
    ensureGhost();
  }

  // 끌고 있는 동안 손을 따라다니는 그림.
  //
  // 박스 밖으로 끌고 나가면 그 아이콘을 그릴 창이 없다. 박스 창은 제 안쪽만 그리고,
  // 바탕화면은 우리 것이 아니다. 그래서 아이콘만 한 작은 창을 띄워 손을 따라가게 한다.
  // 이것이 없으면 박스 밖에서 아이콘이 사라져, 무엇을 끌고 있는지 알 수 없다.
  let ghost = null;
  let ghostReady = false;

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
    const place = () => {
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
    if (ghostReady || !win.webContents.isLoading()) place();
    else win.webContents.once('did-finish-load', place);
  }

  function hideGhost() {
    if (ghost && !ghost.isDestroyed() && ghost.isVisible()) ghost.hide();
  }

  function ownerOf(filePath) {
    return state.fences.find((fence) => fence.items.some((item) => item.path === filePath)) || null;
  }

  // 끌고 있는 동안 어느 박스 위인지 알려 준다.
  // 그 박스는 놓일 자리를 비워 두고, 나머지 박스는 비워 둔 자리를 거둔다.
  function hover(filePath, screenX, screenY, icon) {
    const target = hit(screenX, screenY);
    for (const fence of state.fences) {
      const win = wins.get(fence.id);
      if (!win || win.isDestroyed()) continue;
      if (target && target.id === fence.id) {
        const bounds = boundsOf(fence.id);
        if (!bounds) continue;
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
    // 밖이나 다른 박스 위에서는 그 그림이 계속 보여야 한다.
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

  // 프로그램 전체 설정 창. 트레이의 '설정'이 이 창을 연다.
  //
  // 크기는 고정이다. 항목은 창 안에서 탭으로 나뉘므로 내용에 맞춰 늘일 까닭이 없다.
  // 박스 하나의 설정 창(openSettings)과는 다른 창이다.
  const PREFS_W = 380;
  const PREFS_H = 452;
  let prefsWin = null;

  function openPrefs() {
    if (prefsWin && !prefsWin.isDestroyed()) {
      prefsWin.show();
      prefsWin.focus();
      return prefsWin;
    }
    const win = new BrowserWindow({
      width: PREFS_W + arrange.SHADOW * 2,
      height: PREFS_H + arrange.SHADOW * 2,
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
    prefsWin = win;
    win.loadFile(path.join(__dirname, '../renderer/prefs.html'));
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      if (prefsWin === win) prefsWin = null;
    });
    return win;
  }

  function closePrefs() {
    if (prefsWin && !prefsWin.isDestroyed()) prefsWin.close();
  }

  function dataUrl(image, size) {
    try {
      if (!image || image.isEmpty()) return '';
      const shown = size ? image.resize({ width: size, height: size, quality: 'best' }) : image;
      return shown.toDataURL();
    } catch (_err) {
      return '';
    }
  }

  function pushPrefs() {
    if (!prefsWin || prefsWin.isDestroyed()) return;
    prefsWin.webContents.send('prefs:state', {
      lang: state.settings.lang,
      settings: { ...state.settings, corner: themes.cornerRadius(state.settings.corner) },
      langs: i18n.LANGS.map((row) => ({ id: row.id, label: row.label })),
      themes: themes.THEMES.map((theme) => ({
        id: theme.id, label: theme.label, bg: theme.bg, bar: theme.bar,
      })),
      corner: { min: themes.MIN_CORNER, max: themes.MAX_CORNER },
      opacity: { min: 0.15, max: 0.9 },
      gear: dataUrl(icons.menu('settings'), 18),
      boxRoot: hold.rootDir(),
      about: {
        name: appName(),
        version: appVersion(),
        author: AUTHOR.name,
        email: AUTHOR.email,
        icon: dataUrl(icons.app(), 56),
      },
    });
  }

  function appName() {
    try {
      return app.getName();
    } catch (_err) {
      return 'MyDeskBox';
    }
  }

  function appVersion() {
    try {
      return app.getVersion();
    } catch (_err) {
      return '';
    }
  }

  // 설정 창에서 바꾼 프로그램 전체 값.
  function changePrefs(patch) {
    if (!patch) return;
    if (typeof patch.lang === 'string') setLang(patch.lang);
    if (typeof patch.openAtLogin === 'boolean') setLogin(patch.openAtLogin);
    if (typeof patch.openWith === 'string') setOpenWith(patch.openWith);
    if (typeof patch.shadow === 'boolean') setShadow(patch.shadow);
    if (typeof patch.theme === 'string') setDefaultTheme(patch.theme);
    if (patch.corner !== undefined) setDefaultCorner(patch.corner);
    if (typeof patch.opacity === 'number') setDefaultOpacity(patch.opacity);
    pushPrefs();
  }

  // 설정 창의 단추들. 폴더를 열거나, 담은 것을 모두 바탕화면으로 돌려준다.
  async function prefsAction(what) {
    if (what === 'boxes') {
      const dir = boxRoot();
      if (dir) await shell.openPath(dir);
      return;
    }
    if (what === 'data') {
      try {
        await shell.openPath(app.getPath('userData'));
      } catch (_err) {
        /* 열지 못해도 설정은 그대로다. */
      }
      return;
    }
    if (what === 'putBack') {
      await returnAll();
      pushPrefs();
    }
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
    // 새 박스도 바탕화면 아이콘과 같은 줄에 서고, 다른 박스를 덮지 않는다.
    snapToGrid(fence);
    keepApart(fence);
    clampToScreen(fence);
    state.fences.push(fence);
    persist();
    const win = openFence(fence);
    if (!state.hidden) showFence(win);
    // 새 박스가 깔고 앉은 바탕화면 아이콘을 바로 밀어낸다. 3초를 기다리지 않는다.
    refreshIcons();
    return fence;
  }

  // 박스를 바탕화면 아이콘 격자에 맞춘다.
  //
  // 박스도 바탕화면 아이콘과 같은 줄에 서야 한다. 모서리를 칸 경계에 대면
  // 박스가 칸을 반만 덮는 일이 없어지고, 옆으로 밀려난 아이콘과 나란히 놓인다.
  // 격자를 잴 수 없으면(아이콘이 거의 없는 바탕화면) 그린 그대로 둔다.
  // 이 박스가 놓인 화면의 작업 영역.
  function areaFor(fence) {
    try {
      const found = screen.getDisplayNearestPoint({ x: Math.round(fence.x), y: Math.round(fence.y) }).workArea;
      return found && found.width ? found : null;
    } catch (_err) {
      return null;
    }
  }

  function snapToGrid(fence, what) {
    if (typeof desktop.gridInfo !== 'function') return false;
    const grid = desktop.gridInfo();
    if (!grid || !grid.dx || !grid.dy) return false;
    const snapped = deskgrid.snapRect(
      { x: fence.x, y: fence.y, width: fence.w, height: arrange.panelHeight(fence) },
      grid,
      { width: arrange.CELL_W + arrange.PAD * 2, height: arrange.TITLE_H + arrange.CELL_H },
      areaFor(fence),
      what || { place: true, size: true }
    );
    fence.x = Math.round(snapped.x);
    fence.y = Math.round(snapped.y);
    fence.w = Math.round(snapped.width);
    // 접은 박스는 제목 줄이 전부다. 높이는 접기가 정한다.
    if (!fence.collapsed) fence.h = Math.round(snapped.height);
    return true;
  }

  // 크기만 바꾸다 옆 박스에 닿았다. 자리를 옮기는 대신 닿은 데서 멈춘다.
  // 크기를 키웠을 뿐인데 박스가 저쪽으로 뛰어가면 안 된다.
  function trimToFit(fence, others) {
    let width = fence.w;
    let height = arrange.panelHeight(fence);
    let cut = false;
    for (const other of others) {
      if (!deskgrid.overlaps({ x: fence.x, y: fence.y, width, height }, other)) continue;
      // 오른쪽이나 아래로 자란 만큼만 되돌린다.
      const toRight = other.x - fence.x;
      const toBottom = other.y - fence.y;
      if (toRight >= 180 && toRight < width) {
        width = toRight;
        cut = true;
        continue;
      }
      if (toBottom >= 160 && toBottom < height) {
        height = toBottom;
        cut = true;
        continue;
      }
      // 줄여서는 비킬 수 없는 자리다. 그때는 옆으로 비킨다.
      return false;
    }
    if (!cut) return true;
    fence.w = Math.round(width);
    if (!fence.collapsed) fence.h = Math.round(height);
    return true;
  }

  // 이 박스 말고 지금 놓여 있는 박스들의 자리.
  function otherRects(fence) {
    return state.fences
      .filter((entry) => entry.id !== fence.id)
      .map((entry) => ({
        x: entry.x,
        y: entry.y,
        width: entry.w,
        height: arrange.panelHeight(entry),
      }));
  }

  // 끌고 가다 다른 박스에 닿으면 거기서 멈춘다.
  // 놓은 뒤에 밀어내면 박스가 갑자기 딴 자리로 뛰므로, 끄는 동안 벽처럼 막는다.
  function slideAlong(fence, from) {
    const others = otherRects(fence);
    if (!others.length) return false;
    const moved = deskgrid.slideTo(
      from,
      { x: fence.x, y: fence.y, width: fence.w, height: arrange.panelHeight(fence) },
      others
    );
    if (moved.x === fence.x && moved.y === fence.y) return false;
    fence.x = Math.round(moved.x);
    fence.y = Math.round(moved.y);
    return true;
  }

  function overlapsOthers(fence) {
    const rect = { x: fence.x, y: fence.y, width: fence.w, height: arrange.panelHeight(fence) };
    return otherRects(fence).some((other) => deskgrid.overlaps(rect, other));
  }

  // 박스끼리는 겹치지 않는다. 겹쳤으면 가장 적게 움직이는 쪽으로 비킨다.
  function keepApart(fence, what) {
    const others = otherRects(fence);
    if (!others.length) return false;
    // 크기만 바꾼 것이면 자리를 지키고 크기로 비켜 준다.
    if (what && what.place === false && trimToFit(fence, others)) return true;
    const area = areaFor(fence);
    const moved = deskgrid.pushOut(
      { x: fence.x, y: fence.y, width: fence.w, height: arrange.panelHeight(fence) },
      others,
      area
    );
    if (moved.x === fence.x && moved.y === fence.y) return false;
    fence.x = moved.x;
    fence.y = moved.y;
    return true;
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

  // 손을 떼고 적어 둔 마지막 자리. 이번에 무엇을 바꾼 것인지 여기에 견주어 안다.
  const settled = new Map();

  function applyBounds(id, rect, save) {
    const fence = fenceById(id);
    const win = wins.get(id);
    if (!fence || !win || win.isDestroyed()) return;
    const last = settled.get(id) || { x: fence.x, y: fence.y, w: fence.w, h: fence.h };
    // 끌기 전 자리. 여기서 어디까지 갈 수 있는지 잰다.
    const from = { x: fence.x, y: fence.y, width: fence.w, height: arrange.panelHeight(fence) };
    fence.x = rect.x;
    fence.y = rect.y;
    const wasW = fence.w;
    const wasH = fence.h;
    if (!fence.collapsed) {
      fence.w = Math.max(180, rect.w);
      fence.h = Math.max(160, rect.h);
    }
    // 다른 박스에 닿으면 거기서 멈춘다. 끄는 동안에도 그렇게 해야
    // 보이는 자리가 곧 놓일 자리가 되어, 손을 뗀 뒤에 박스가 뛰지 않는다.
    slideAlong(fence, from);
    if (save) {
      // 크기만 바꾼 것이면 자리는 손대지 않는다. 크기를 줄였을 뿐인데
      // 박스가 옆으로 뛰면 무엇을 한 것인지 알 수 없다.
      const what = {
        place: fence.x !== last.x || fence.y !== last.y,
        size: fence.w !== last.w || fence.h !== last.h,
      };
      // 줄을 맞추다 남의 자리를 덮으면 맞추지 않은 자리가 낫다.
      const before = { x: fence.x, y: fence.y, w: fence.w, h: fence.h };
      snapToGrid(fence, what);
      if (overlapsOthers(fence)) {
        fence.x = before.x;
        fence.y = before.y;
        fence.w = before.w;
        fence.h = before.h;
      }
      keepApart(fence, what);
    }
    clampToScreen(fence);
    win.setBounds(arrange.windowRect(fence, state.settings.shadow));
    if (save) {
      settled.set(id, { x: fence.x, y: fence.y, w: fence.w, h: fence.h });
      persist();
      win.webContents.send('fence:resize');
      refreshIcons();
      return;
    }
    // 자리만 옮긴 것이면 안의 칸은 그대로다. 옮기는 동안 다시 그리지 않아야 따라온다.
    if (fence.w !== wasW || fence.h !== wasH) win.webContents.send('fence:resize');
    // 끄는 동안에도 새로 가린 바탕화면 아이콘을 밀어낸다.
    nudgeSoon();
  }

  // 박스를 끄는 동안에도 그 자리의 바탕화면 아이콘이 옆으로 비킨다.
  // 한 칸마다 부르면 무거우니 사이를 둔다.
  const NUDGE_GAP = 40;
  let nudgedAt = 0;
  let nudgeTimer = null;

  function nudgeSoon() {
    if (state.hidden || closing || typeof desktop.nudge !== 'function') return;
    const left = NUDGE_GAP - (Date.now() - nudgedAt);
    if (left > 0) {
      if (nudgeTimer) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        nudgeSoon();
      }, left);
      return;
    }
    nudgedAt = Date.now();
    // 끄는 중에는 가벼운 길로 간다. 목록을 다시 읽지 않고 자리만 던져 둔다.
    desktop.nudge(blockRects(), true);
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
      // 휴지통 같은 셸 항목은 파일이 아니므로 목록에만 담는다.
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        incoming.push(item);
        continue;
      }
      const moved = bringIn(fence, item);
      if (moved) incoming.push({ ...moved, from: item.path });
    }
    if (!incoming.length) return;
    // 담기면서 자리가 바뀌므로 옮기기 전 자리로도 견준다.
    // 그러지 않으면 앞 박스에 없는 파일을 가리키는 항목이 남는다.
    const gone = new Set(incoming.flatMap((add) => [add.path, add.from].filter(Boolean)));
    for (const other of state.fences) {
      other.items = other.items.filter((item) => !gone.has(item.path));
    }
    for (const add of incoming) delete add.from;
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

  // 박스에서 꺼내면 파일이 담기 전 폴더(보통 바탕화면)로 돌아간다.
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

  // 보관함을 두는 사용자 전용 폴더. 설정 파일과 같은 자리다.
  // 바탕화면에 두면 '숨긴 항목 표시'를 켠 사람에게 폴더가 하나 더 보인다.
  function userFolder() {
    try {
      return app.getPath('userData');
    } catch (_err) {
      return '';
    }
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
  // 손을 뗐다. 어디에 놓았느냐에 따라 세 갈래다.
  //  - 같은 박스 안  : 차례만 바꾼다
  //  - 다른 박스 위  : 그 박스의 폴더로 옮긴다
  //  - 박스 밖(바탕화면) : 담기 전 폴더로 돌려보낸다
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
    clearHover();
    if (!target) {
      await eject(fromId, filePath);
      return;
    }
    const index = indexAt(target, screenX, screenY, filePath);
    if (target.id === fromId) await reorder(fromId, filePath, index);
    else await dropFiles(target.id, [filePath], index);
  }

  // 담는다는 것은 그 파일을 이 박스의 폴더로 옮긴다는 뜻이다.
  // 옮기고 나면 바탕화면 폴더에서 빠지므로 탐색기가 그 아이콘을 더 그리지 않는다.
  // 담기 전에 있던 폴더는 함께 적어 둔다. 꺼내거나 끝낼 때 그 자리로 돌려준다.
  function bringIn(fence, item) {
    const moved = hold.take(fence, item);
    if (!moved) return null;
    if (moved.path !== item.path) refreshFolders(path.dirname(item.path), path.dirname(moved.path));
    return moved;
  }

  // 꺼낸다. 파일을 담기 전 폴더로 돌려보내고, 그 아이콘도 적어 둔 자리에 놓는다.
  function letGo(item) {
    if (!item) return false;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return putIconHome(item.name);
    const back = hold.give(item);
    if (!back || back === item.path) return false;
    refreshFolders(path.dirname(item.path), path.dirname(back));
    putIconHome(path.basename(back));
    return true;
  }

  // 돌려준 아이콘을 담기 전 자리에 놓는다. 자리를 모르면 탐색기가 정한 자리에 둔다.
  function putIconHome(name) {
    if (!name || typeof desktop.putHome !== 'function') return false;
    return desktop.putHome([name]);
  }

  // 파일을 옮기면 탐색기가 곧 알아채지만, 알려 주면 바로 다시 그린다.
  function refreshFolders(...dirs) {
    if (typeof desktop.refreshFolder !== 'function') return;
    for (const dir of new Set(dirs.filter(Boolean))) desktop.refreshFolder(dir);
  }

  // 박스를 제 폴더와 맞춘다.
  //
  // 박스가 보여 주는 것은 그 폴더의 내용이다. 탐색기에서 폴더에 파일을 넣거나
  // 지운 것도 이 길로 박스에 드러난다. 목록의 차례는 우리가 적어 둔 것을 따르고,
  // 처음 보는 파일은 뒤에 붙인다.
  function settleBox(fence) {
    const before = fence.items.map((item) => `${item.path}`).join('\n');
    const inFolder = new Set(hold.names(fence));
    const dir = hold.rootDir() && fence.folder ? path.join(hold.rootDir(), fence.folder) : '';
    const kept = [];
    for (const item of fence.items) {
      // 휴지통 같은 셸 항목은 폴더에 둘 파일이 없다. 목록에만 있다.
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        kept.push(item);
        continue;
      }
      const name = path.basename(item.path);
      if (dir && path.resolve(path.dirname(item.path)) === path.resolve(dir)) {
        if (inFolder.has(name)) {
          kept.push(item);
          inFolder.delete(name);
        }
        continue;
      }
      // 아직 폴더 밖에 있는 것은 옮겨 담는다. 예전 판에서 올라온 박스가 이 길로 들어온다.
      const moved = bringIn(fence, item);
      if (moved) {
        kept.push(moved);
        inFolder.delete(path.basename(moved.path));
      }
    }
    // 탐색기에서 폴더에 바로 넣은 파일.
    for (const name of inFolder) {
      kept.push({ name, path: path.join(dir, name), home: '' });
    }
    fence.items = kept;
    return before !== kept.map((item) => `${item.path}`).join('\n');
  }

  // 앞선 실행이 갑자기 끝나(작업 관리자, 전원 내림) 보관함에 남은 파일을 돌려준다.
  // 지금 박스가 들고 있는 것은 그대로 둔다. 그것은 남은 것이 아니라 담긴 것이다.
  function recoverHeld() {
    const keep = state.fences.flatMap((fence) => fence.items.map((item) => item.path));
    let back = [];
    try {
      back = hold.recover(keep);
    } catch (_err) {
      return [];
    }
    if (back.length) refreshFolders(...back.map((at) => path.dirname(at)));
    return back;
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

  // 끝낼 때 바탕화면을 켜기 전 모습으로 돌려놓는다.
  //
  // 담은 파일은 박스 폴더에 있다. 그대로 두고 끝내면 바탕화면이 빈 채로 남으므로
  // 하나도 빠뜨리지 않고 담기 전 폴더로 되돌린다. 파일을 먼저 돌려준 뒤에
  // 밀어냈던 아이콘 자리를 되돌린다(desktop.release). 그래야 돌아온 파일의
  // 아이콘도 제자리를 찾는다.
  //
  // 이 길은 트레이로 끝낼 때도, Ctrl+C 나 로그아웃으로 끝낼 때도, 큰 오류로
  // 끝낼 때도 똑같이 지난다. 두 번 불러도 한 번만 한다.
  let putBackDone = false;

  function putBack() {
    closing = true;
    if (putBackDone) return true;
    putBackDone = true;
    const items = captured();
    for (const fence of state.fences) {
      try {
        emptyBox(fence);
      } catch (_err) {
        /* 하나가 막혀도 나머지는 돌려준다. */
      }
    }
    try {
      persist();
    } catch (_err) {
      /* 끝나는 중에 저장하지 못해도 파일은 이미 제자리로 갔다. */
    }
    if (typeof desktop.release === 'function') desktop.release(items);
    return true;
  }

  // 박스에 담긴 것은 진짜 바탕화면 아이콘이다. 그 아이콘을 박스 안 격자로 모으고,
  // 담기지 않은 아이콘이 박스 자리에 남아 있으면 밖으로 밀어낸다.
  // 파일은 옮기지도, 감추지도 않는다. 바탕화면 폴더의 내용은 그대로다.
  // 박스는 바탕화면 아이콘과 같은 격자 위에 선다. 먼저 자리를 잡는 쪽은 박스다.
  // 박스가 깔고 앉은 칸의 아이콘은 밖의 빈 칸으로 비켜 준다. 박스 밑에 깔린 채로
  // 두면 그 아이콘은 고를 수도, 열 수도 없다.
  //
  // 담긴 파일은 박스 폴더에 있어 바탕화면 아이콘이 없다. 그래서 여기서 할 일은
  // 담기지 않은 아이콘을 박스 밖으로 밀어내는 것 하나뿐이다.
  function refreshIcons() {
    if (closing) return;
    watchBin();
    const changed = settleAll();
    // 휴지통 같은 셸 항목은 옮길 파일이 없다. 박스에 담으면 바탕화면 쪽 아이콘을
    // 레지스트리로 감추고, 박스 창이 대신 그린다. 끝낼 때 restoreShellIcons 가 되살린다.
    // 박스를 숨긴 동안에는 감출 까닭이 없으므로 모두 되살린다.
    if (typeof desktop.syncShellIcons === 'function') {
      desktop.syncShellIcons(state.hidden ? [] : captured());
    }
    if (changed) pushAll();
    if (state.hidden) {
      // 박스를 숨기면 밀어낸 아이콘도 제자리로 돌려준다.
      if (typeof desktop.release === 'function') desktop.release([]);
      return;
    }
    if (typeof desktop.nudge !== 'function') return;
    // 바탕화면에서 무언가를 끌고 있는 동안에는 건드리지 않는다. 손을 떼면 이 길로 다시 온다.
    if (desktop.mouseDown && desktop.mouseDown()) return;
    nudgedAt = Date.now();
    desktop.nudge(blockRects());
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
    // 박스를 지우면 담고 있던 파일을 모두 담기 전 폴더로 돌려준다.
    // 하나도 빠뜨리지 않아야 바탕화면이 지우기 전 모습으로 돌아간다.
    emptyBox(fence);
    state.fences = state.fences.filter((entry) => entry.id !== id);
    persist();
    closeSettings(id);
    if (win && !win.isDestroyed()) win.close();
    refreshIcons();
  }

  // 박스 하나를 비운다. 담긴 파일은 담기 전 폴더로, 아이콘은 적어 둔 자리로 간다.
  // 돌려준 개수를 준다.
  function emptyBox(fence) {
    let count = 0;
    const names = [];
    for (const item of fence.items) {
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        names.push(item.name);
        continue;
      }
      const back = hold.give(item);
      if (back && back !== item.path) {
        refreshFolders(path.dirname(item.path), path.dirname(back));
        names.push(path.basename(back));
        count += 1;
      } else if (back) {
        names.push(path.basename(back));
      }
    }
    fence.items = [];
    // 빈 폴더는 남길 까닭이 없다.
    hold.drop(fence);
    if (names.length && typeof desktop.putHome === 'function') desktop.putHome(names);
    return count;
  }

  // 트레이의 '바탕화면으로 모두 돌려주기'. 박스는 그대로 두고 안의 것만 비운다.
  async function returnAll() {
    let count = 0;
    for (const fence of state.fences) count += emptyBox(fence);
    persist();
    await pushAll();
    refreshIcons();
    return count;
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

  // 휴지통 같은 셸 항목은 파일이 아니라 운영체제에서 그림을 받아 온다.
  function shellImage(shellPath) {
    try {
      const shot = typeof desktop.fileIcon === 'function' ? desktop.fileIcon(shellPath) : null;
      if (!shot || !shot.width) return null;
      const image = nativeImage.createFromBitmap(shot.data, { width: shot.width, height: shot.height });
      return image.isEmpty() ? null : image;
    } catch (_err) {
      return null;
    }
  }

  // 메뉴에 쓸 작은 그림. 운영체제에서 그대로 가져온다.
  function shellIcon(shellPath) {
    const image = shellImage(shellPath);
    if (!image) return icons.menu('gather');
    try {
      return image.resize({ width: 16, height: 16, quality: 'best' });
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
    pushPrefs();
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
    openPrefs,
    closePrefs,
    pushPrefs,
    changePrefs,
    prefsAction,
    AUTHOR,
    pushSettings,
    fitSettings,
    changeBox,
    resetBox,
    setScroll,
    hover,
    clearHover,
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
    returnAll,
    boxRoot,
    settleAll,
    recoverHeld,
    trashItem,
    eject,
    restyle,
    captured,
  };
}

module.exports = { createHost };
