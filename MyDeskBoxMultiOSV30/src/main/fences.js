'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, app, screen, shell, Menu, nativeImage, dialog } = require('electron');
const store = require('./store');
const arrange = require('../shared/arrange');
const deskgrid = require('../shared/deskgrid');
const desktop = require('./desktop');
const hold = require('./hold');
const portal = require('./portal');
const autostart = require('./autostart');

const icons = require('./icons');
const ask = require('./ask');
const themes = require('./themes');
const i18n = require('../shared/i18n');
const deliver = require('../shared/deliver');
const catalog = require('../shared/catalog');
const rules = require('../shared/rules');
const snaps = require('../shared/snaps');

// 만든 이. 프로그램 정보 탭과 트레이가 같은 것을 보여 준다.
const AUTHOR = { name: 'SHKWON', email: 'knix008@naver.com' };

// 예전 판에서 올라온 상태를 지금 모습으로 맞춘다.
//
// store.load 는 이미 이 일을 하지만, 상태를 손으로 만들어 넘기는 자리(검사, 예전 저장본)도
// 있다. 페이지 목록이나 규칙이 비어 있으면 그것을 읽는 자리마다 넘어지므로 여기서 한 번 채운다.
function settleState(state) {
  if (!Array.isArray(state.pages) || !state.pages.length) state.pages = [{ id: 'main', name: '' }];
  if (!Array.isArray(state.snaps)) state.snaps = [];
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  // 규칙은 늘 정규화된 모습이어야 한다. 값이 빠진 규칙은 짝을 찾는 자리에서 조용히 지나간다.
  state.settings.rules = rules.normalizeRules(state.settings.rules);
  state.settings.autoSort = !!state.settings.autoSort;
  if (!Array.isArray(state.fences)) state.fences = [];
  const known = new Set(state.pages.map((page) => page.id));
  const first = state.pages[0].id;
  for (const fence of state.fences) {
    // 없어진 페이지를 가리키는 박스는 첫 페이지로 데려온다. 보이지 않는 박스를 남기지 않는다.
    if (!fence.page || !known.has(fence.page)) fence.page = first;
    if (typeof fence.portal !== 'string') fence.portal = '';
  }
  if (!known.has(state.page)) state.page = first;
  return state;
}

function createHost(state) {
  settleState(state);
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

  // ── 폴더 포털 ─────────────────────────────────────────────────────────────
  //
  // 보통 박스는 담은 파일을 제 폴더로 옮긴다. 포털은 디스크에 이미 있는 폴더를
  // 가리키고 그 내용을 그대로 비춰 보여 준다. 파일은 그 폴더에 머물고,
  // 박스를 지워도 폴더는 남는다. 그래서 보관함(hold)을 쓰지 않는다.
  function isPortal(fence) {
    return !!(fence && fence.portal);
  }

  // ── 담는다는 것 ───────────────────────────────────────────────────────────
  //
  // 두 가지 방식이 있다.
  //
  //  그대로 두기(keep) — 파일은 있는 자리에 남고, 박스는 그것을 가리켜 보여 주기만 한다.
  //    바탕화면에서 사라지지 않으므로 같은 항목이 두 곳에 함께 보인다. 기본값이다.
  //  옮기기(move) — 파일을 이 박스의 폴더로 옮긴다. 바탕화면 폴더에서 빠지므로
  //    탐색기가 그 아이콘을 더 그리지 않는다.
  //
  // 어느 쪽이든 박스가 깔고 앉은 자리의 바탕화면 아이콘은 옆으로 비켜 준다.
  //
  // **지금 설정이 아니라 항목에 새긴 표시(item.keep)를 보고 다룬다.** 그대로 두기로 담은 뒤
  // 설정을 옮기기로 바꾸고 끝내면, 설정만 보는 코드는 남의 폴더에 있던 파일을 바탕화면으로
  // 쏟아 놓는다. 담을 때 정해진 것은 그 항목에 그대로 남아 있어야 한다.
  function keeping() {
    return state.settings.takeWith !== 'move';
  }

  // 이 항목은 가리키고만 있는 것인가. 파일을 건드려도 되는지 묻는 자리마다 이것을 본다.
  function pointsAt(item) {
    return !!(item && item.keep);
  }

  // 바탕화면에 아이콘이 있는 항목. 파일을 옮긴 것은 바탕화면에서 빠져 여기 해당하지 않는다.
  function isDesktopIcon(item) {
    if (!item || !item.path) return false;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return true;
    return pointsAt(item) && typeof desktop.isOnDesktop === 'function' && desktop.isOnDesktop(item.path);
  }

  // 탐색기가 그 아이콘에 붙이는 이름. 칸을 찾을 때 이 이름으로 견준다.
  function seatName(item) {
    if (!item) return '';
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return item.name || '';
    // 이름은 한 번만 묻는다. 박스를 끄는 동안 매번 물으면 창이 손을 따라가지 못한다.
    return labelFor(item);
  }

  // 지금 보이는 박스들의 칸. 좌표는 화면 DIP 이고, 바탕화면 모듈이 픽셀로 바꾼다.
  function seatPlaces() {
    if (state.hidden) return [];
    const places = [];
    for (const fence of visibleFences()) {
      if (fence.collapsed) continue;
      const grid = arrange.gridOf(fence.w, arrange.panelHeight(fence), false, fence.look);
      const scroll = scrollTops.get(fence.id) || 0;
      fence.items.forEach((item, index) => {
        if (!isDesktopIcon(item)) return;
        const name = seatName(item);
        if (!name) return;
        const slot = arrange.slotPoint(index, grid);
        places.push({
          name,
          x: fence.x + slot.x,
          y: fence.y + slot.y - scroll,
        });
      });
    }
    return places;
  }

  // ── 바탕화면 페이지 ───────────────────────────────────────────────────────
  //
  // 박스 묶음을 여러 벌 두고 갈아 쓴다. 한 페이지에 속한 박스만 창을 띄우고,
  // 다른 페이지의 박스는 창을 닫아 둔다. 담긴 파일은 페이지와 상관없이 그대로 있다.
  function pageById(id) {
    return state.pages.find((page) => page.id === id) || null;
  }

  // 페이지 이름. 이름을 붙이지 않은 페이지는 차례로 부른다.
  function pageLabel(page) {
    if (!page) return '';
    if (page.name) return page.name;
    const at = state.pages.findIndex((one) => one.id === page.id);
    return at === 0 ? say('page.first') : say('page.nth', { n: at + 1 });
  }

  // 지금 보고 있는 페이지의 박스. 창을 띄우고 아이콘을 밀어내는 일은 이것만 본다.
  function visibleFences() {
    return state.fences.filter((fence) => fence.page === state.page);
  }

  function onThisPage(fence) {
    return !!fence && fence.page === state.page;
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
        // 바탕화면에서 들어온 아이콘은 박스 창이 판보다 앞에 그린다.
        native: isDesktopIcon(item),
      });
    }
    return {
      fence,
      theme: themes.resolve(fence),
      // 이 박스만의 글자 색과 그림·글씨 크기. 적지 않은 값은 테마가 정한 대로 채워 보낸다.
      look: themes.resolveLook(fence),
      corner: { radius: themes.cornerRadius(fence.corner) },
      lang: state.settings.lang,
      shadow: !!state.settings.shadow,
      openWith: state.settings.openWith === 'single' ? 'single' : 'double',
      // 포털은 폴더를 비추는 박스다. 제목 줄에 그 표시를 둔다.
      portal: fence.portal || '',
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

  // 박스를 바탕화면 층에 두고, 켜 두었으면 뒤를 흐린다.
  // 포커스를 받아도 다른 프로그램 위로 올라오지 않게 다시 내린다.
  function fenceOf(win) {
    for (const [id, one] of wins) {
      if (one === win) return fenceById(id);
    }
    return null;
  }

  // 모서리 밖은 창에서 뺀다. 흐림이 사각 모서리를 채우지 않게 한다.
  function shapeWindow(win, fence) {
    if (!win || !fence || typeof desktop.roundWindow !== 'function') return;
    const pad = state.settings.shadow ? arrange.SHADOW : 0;
    desktop.roundWindow(win, themes.cornerRadius(fence.corner), pad);
  }

  function settleWindow(win) {
    if (!win || win.isDestroyed()) return;
    desktop.place(win);
    const fence = fenceOf(win);
    // 흐림보다 먼저 모퉁이를 잘라 둔다. 흐림이 사각을 다시 채우면 한 번 더 자른다.
    shapeWindow(win, fence);
    if (typeof desktop.blurBehind === 'function') desktop.blurBehind(win, !!state.settings.blur);
    shapeWindow(win, fence);
  }

  function showFence(win) {
    if (!win || win.isDestroyed()) return;
    win.showInactive();
    settleWindow(win);
  }

  function openFence(fence) {
    const existing = wins.get(fence.id);
    if (existing && !existing.isDestroyed()) return existing;
    // 다른 페이지의 박스는 창을 띄우지 않는다. 그 페이지로 옮겨 가면 이 길로 다시 온다.
    if (!onThisPage(fence)) return null;
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
    win.on('show', () => settleWindow(win));
    win.on('focus', () => settleWindow(win));
    win.on('closed', () => {
      if (wins.get(fence.id) === win) wins.delete(fence.id);
    });
    return win;
  }

  function openAll() {
    for (const fence of visibleFences()) openFence(fence);
    watchPortals();
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
  // 커서 아래에 다른 항목의 그림이 있는가. 있으면 그 항목의 자리를 준다.
  //
  // 이 판단은 메인이 한다. 창이 제 안에서만 하면 제 창 밖은 알 수 없어,
  // 다른 박스의 폴더나 바탕화면에서 끌어 온 것은 아무리 겨눠도 받아 주지 못했다.
  // 박스 안 아이콘의 자리는 메인도 그대로 셀 수 있다(indexAt 과 같은 셈이다).
  function receiverAt(fence, screenX, screenY, exceptPath) {
    if (!fence || fence.collapsed) return null;
    const bounds = boundsOf(fence.id);
    if (!bounds) return null;
    const grid = arrange.gridOf(bounds.width, bounds.height, false, fence.look);
    const localX = screenX - bounds.x;
    const localY = screenY - bounds.y + (scrollTops.get(fence.id) || 0);
    const shown = fence.items.filter((item) => item.path !== exceptPath);
    for (let n = 0; n < shown.length; n += 1) {
      const point = arrange.slotPoint(n, grid);
      if (deliver.onPicture(localX - point.x, localY - point.y, grid.icon, grid.cellW)) return shown[n].path;
    }
    return null;
  }

  function hover(filePath, screenX, screenY, icon) {
    const target = hit(screenX, screenY);
    // 그림부터 손을 따라가게 한다. 다른 박스에 알린 뒤에 옮기면 아이콘이 늦게 따라온다.
    const owner = ownerOf(filePath);
    if (target && owner && target.id === owner.id) hideGhost();
    else showGhost(icon, screenX, screenY);
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
          // 어느 항목 위인지 창에게 함께 알려 준다. 창은 그 항목을 밝혀 보여 준다.
          into: receiverAt(target, screenX, screenY, filePath),
        });
      } else {
        win.webContents.send('fence:hover', null);
      }
    }
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
      // 테마 조각은 한 줄에 열 개씩 세 줄이다. 줄 하나가 27픽셀이다.
      height: 457 + arrange.SHADOW * 2,
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
  // 탭이 여섯 개이고, 규칙 줄에는 고를 것이 셋씩 들어간다. 그만큼 넓고 높다.
  const PREFS_W = 452;
  const PREFS_H = 592;
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
      opacity: { min: themes.MIN_OPACITY, max: themes.MAX_OPACITY },
      gear: dataUrl(icons.menu('settings'), 18),
      boxRoot: hold.rootDir(),
      // 바탕화면 페이지
      pages: state.pages.map((page) => ({ id: page.id, name: page.name, label: pageLabel(page) })),
      page: state.page,
      // 배치 스냅샷. 목록에 보여 줄 만큼만 보낸다.
      snaps: state.snaps.map((snap) => ({ id: snap.id, name: snap.name, at: snap.at, boxes: snap.boxes.length })),
      // 자동 분류 규칙과, 규칙이 고를 수 있는 박스 목록
      rules: state.settings.rules.map((rule) => ({ ...rule })),
      ruleKinds: rules.KINDS,
      ruleTypes: rules.TYPES(),
      boxes: state.fences.map((fence) => ({ id: fence.id, title: fence.title || say('box.untitled'), page: fence.page })),
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
    if (typeof patch.takeWith === 'string') setTakeWith(patch.takeWith);
    if (typeof patch.shadow === 'boolean') setShadow(patch.shadow);
    if (typeof patch.blur === 'boolean') setBlur(patch.blur);
    if (typeof patch.theme === 'string') setDefaultTheme(patch.theme);
    if (patch.corner !== undefined) setDefaultCorner(patch.corner);
    if (typeof patch.opacity === 'number') setDefaultOpacity(patch.opacity);
    if (typeof patch.autoSort === 'boolean') setAutoSort(patch.autoSort);
    pushPrefs();
  }

  // 설정 창의 규칙·페이지·스냅샷 탭에서 온 것. 무엇을 하라는 것인지 act 에 적혀 온다.
  async function prefsEdit(payload) {
    const what = payload && payload.act;
    if (!what) return null;
    const id = payload.id ? String(payload.id) : '';
    if (what === 'rule-add') addRule(payload.rule);
    else if (what === 'rule-change') changeRule(id, payload.rule);
    else if (what === 'rule-remove') removeRule(id);
    else if (what === 'sort-now') await sortNow();
    else if (what === 'page-add') addPage(payload.name);
    else if (what === 'page-show') showPage(id);
    else if (what === 'page-rename') renamePage(id, payload.name);
    else if (what === 'page-remove') removePage(id);
    else if (what === 'snap-save') saveSnap(payload.name);
    else if (what === 'snap-apply') await applySnap(id);
    else if (what === 'snap-remove') removeSnap(id);
    else if (what === 'portal-new') await createPortal();
    pushPrefs();
    return null;
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
    const want = Math.max(240, Math.min(1000, Math.round(Number(height) || 0)));
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
      // 이 박스만의 글자 색과 그림·글씨 크기. 빈 값이면 테마가 정한 대로라는 뜻이다.
      mine: themes.normalizeLook(fence.look),
      shown: themes.resolveLook(fence),
      iconSize: { value: arrange.iconSize(fence.look), min: arrange.MIN_ICON, max: arrange.MAX_ICON },
      fontSize: { value: arrange.fontSize(fence.look), min: arrange.MIN_FONT, max: arrange.MAX_FONT },
      opacity: { value: fence.opacity, min: themes.MIN_OPACITY, max: themes.MAX_OPACITY },
      shadow: !!state.settings.shadow,
      blur: state.settings.blur !== false,
      // 포털이면 가리키는 폴더를 보여 준다.
      portal: fence.portal || '',
      // 이 박스를 다른 페이지로 옮길 수 있다.
      pages: state.pages.map((page) => ({ id: page.id, label: pageLabel(page) })),
      page: fence.page,
    });
  }

  // 설정 창에서 바꾼 것을 곧바로 박스에 반영한다.
  function changeBox(id, patch) {
    if (!patch) return;
    if (typeof patch.title === 'string') rename(id, patch.title);
    if (typeof patch.collapsed === 'boolean') setCollapsed(id, patch.collapsed);
    if (typeof patch.shadow === 'boolean') setShadow(patch.shadow);
    if (typeof patch.blur === 'boolean') setBlur(patch.blur);
    if (patch.theme || patch.custom || patch.look || patch.corner !== undefined || typeof patch.opacity === 'number') {
      restyle(id, patch);
    }
    if (typeof patch.page === 'string') movePage(id, patch.page);
    pushSettings(id);
  }

  // 이 박스만 처음 모습으로 되돌린다. 안의 아이콘과 자리는 그대로 둔다.
  function resetBox(id) {
    const fence = fenceById(id);
    if (!fence) return;
    fence.theme = state.settings.theme;
    fence.custom = null;
    // 이 박스만 따로 정해 둔 글자 색과 그림 크기도 함께 놓는다. 테마가 정한 대로 돌아간다.
    fence.look = themes.normalizeLook(null);
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
    for (const fence of visibleFences().reverse()) {
      if (fence.collapsed) continue;
      const bounds = boundsOf(fence.id);
      if (!bounds) continue;
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
        return fence;
      }
    }
    return null;
  }

  function createFence(rect, extra) {
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
      // 새 박스는 지금 보고 있는 페이지에 선다.
      page: state.page,
      ...(extra || {}),
    });
    // 새 박스는 그린 자리에 둔다. 바탕화면 아이콘 줄에 끌어 맞추지 않는다.
    // 다른 박스를 덮을 때만 비킨다.
    keepApart(fence);
    clampToScreen(fence);
    state.fences.push(fence);
    persist();
    const win = openFence(fence);
    if (win && !state.hidden) showFence(win);
    if (isPortal(fence)) watchPortals();
    // 새 박스가 깔고 앉은 바탕화면 아이콘을 바로 밀어낸다. 3초를 기다리지 않는다.
    refreshIcons();
    return fence;
  }

  // 이 박스가 놓인 화면의 작업 영역.
  // 박스 자리는 바탕화면 아이콘 격자에 맞추지 않는다. 놓은 곳이 그 자리다.
  function areaFor(fence) {
    try {
      const found = screen.getDisplayNearestPoint({ x: Math.round(fence.x), y: Math.round(fence.y) }).workArea;
      return found && found.width ? found : null;
    } catch (_err) {
      return null;
    }
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
  // 겹치지 않아야 할 상대는 같은 페이지의 박스뿐이다. 다른 페이지의 박스는 화면에 없다.
  function otherRects(fence) {
    return state.fences
      .filter((entry) => entry.id !== fence.id && entry.page === fence.page)
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
      // 바탕화면 정렬에는 맞추지 않는다. 다른 박스와 겹칠 때만 비킨다.
      keepApart(fence, what);
    }
    clampToScreen(fence);
    // 손을 떼면 맞춤이 끝난 자리에서 다시 잡는다. 직전 그림은 창보다 먼저 치지 않는다.
    if (save && typeof desktop.followReset === 'function') desktop.followReset();
    // 번호는 창을 옮기기 전에 찾는다. 옛 그림도 창을 옮기기 전에 지운다.
    // 창만 먼저 가면 옛 자리의 아이콘이 박스 밖에 보이고, 새 자리를 먼저 그리면 앞에서 비친다.
    followSoon();
    if (typeof desktop.armFollow === 'function') desktop.armFollow();
    try {
      win.setBounds(arrange.windowRect(fence, state.settings.shadow));
    } finally {
      if (typeof desktop.paintFollow === 'function') desktop.paintFollow();
    }
    shapeWindow(win, fence);
    if (save) {
      settled.set(id, { x: fence.x, y: fence.y, w: fence.w, h: fence.h });
      persist();
      win.webContents.send('fence:resize');
      refreshIcons();
      return;
    }
    // 자리만 옮긴 것이면 안의 칸은 그대로다. 옮기는 동안 다시 그리지 않아야 따라온다.
    if (fence.w !== wasW || fence.h !== wasH) win.webContents.send('fence:resize');
  }

  function followSoon() {
    if (state.hidden || closing) return;
    const places = seatPlaces();
    if (typeof desktop.followSeats === 'function') desktop.followSeats(places);
    else if (typeof desktop.seatKept === 'function') desktop.seatKept(places, true);
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
    if (typeof desktop.seatKept === 'function') desktop.seatKept(seatPlaces(), true);
  }

  function indexAt(fence, screenX, screenY, filePath) {
    const bounds = boundsOf(fence.id);
    if (!bounds) return fence.items.length;
    const grid = arrange.gridOf(bounds.width, bounds.height, fence.collapsed, fence.look);
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
    if (!target) {
      // 박스 밖으로 끌어 바탕화면에 놓으면 그 박스에서 빠지고, 그 자리에 그대로 보인다.
      const owner = ownerOf(item.path);
      if (owner) await eject(owner.id, item.path);
      return;
    }
    if (target.items.some((entry) => entry.path === item.path)) return;
    // 바탕화면에서 끌어 온 것도 박스 안 항목 위에 놓을 수 있어야 한다.
    // 휴지통이면 버리고, 폴더면 그 안으로, 프로그램이면 그것에게 넘긴다.
    const into = receiverAt(target, dip.x, dip.y, item.path);
    const index = indexAt(target, dip.x, dip.y, item.path);
    await dropFiles(target.id, [item], index, into);
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
      // 셸을 거쳐 넘길 때 검은 창이 번쩍이지 않게 한다.
      windowsHide: true,
    });
    child.unref();
  }

  async function moveInto(filePath, dir) {
    if (!filePath || String(filePath).startsWith('shell:')) return false;
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

  // 아래 항목이 무엇이냐에 따라 갈린다.
  //  - 폴더, 폴더를 가리키는 바로가기 : 그 안으로 옮긴다
  //  - 휴지통 : 버린다
  //  - 그 밖의 항목 : 그것을 실행하면서 놓은 파일을 입력으로 넘긴다
  //
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
    // 바로가기면 가리키는 프로그램에, 프로그램이나 문서면 그 항목에 그대로 넘긴다.
    const plan = deliver.handPlan(link, filePath) || deliver.openPlan(intoPath, filePath, process.platform);
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
      let handled = false;
      for (const entry of filePaths || []) {
        const item = toItem(entry);
        if (!item) continue;
        const done = await sendInto(item.path, intoPath);
        if (done === 'moved') {
          takeOut(item.path);
          changed = true;
        }
        if (done) handled = true;
      }
      if (changed) {
        persist();
        await pushAll();
        refreshIcons();
      }
      // 아래 항목이 받아 갔으면 박스에 새로 담을 것이 없다.
      if (handled) return;
    }
    const fence = fenceById(id);
    if (!fence) return;
    const incoming = [];
    for (const entry of filePaths) {
      const item = toItem(entry);
      if (!item) continue;
      // 같은 것을 한 박스에 두 번 담지 않는다. 그대로 두기에서는 파일이 그 자리에 남아
      // 있으므로, 한 번 담은 것을 다시 끌어다 놓기 쉽다.
      if (fence.items.some((held) => samePath(held.path, item.path))) continue;
      // 휴지통 같은 셸 항목은 파일이 아니므로 목록에만 담는다.
      // 어느 방식이든 옮길 것이 없다.
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        incoming.push(item);
        continue;
      }
      // 박스에 같은 이름이 이미 있으면 대체할지 먼저 묻는다.
      if (!(await clearClash(fence, item.path))) continue;
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

  // 같은 파일을 가리키는 두 경로인가. Windows 는 대소문자를 가리지 않는다.
  function samePath(a, b) {
    const one = path.resolve(String(a || ''));
    const two = path.resolve(String(b || ''));
    if (process.platform === 'win32') return one.toLowerCase() === two.toLowerCase();
    return one === two;
  }

  // 같은 이름이 이미 있다. 대체할지 묻는다.
  function askReplace(fence, name) {
    return ask.confirm({
      title: say('dialog.replace', { name, title: fence.title || say('box.untitled') }),
      detail: say('dialog.replaceDetail'),
      confirm: say('dialog.replaceGo'),
      cancel: say('dialog.cancel'),
      icon: icons.menu('remove'),
      danger: true,
    });
  }

  // 바탕화면과 박스에 이름이 같은 항목이 따로 있을 수 있다. 담으면 자리가 부딪힌다.
  // 대체하겠다면 박스에 있던 것을 휴지통으로 보내 자리를 비운다.
  // 그대로 두겠다면 담지 않는다. 파일은 있던 자리에 남는다.
  // 이 파일을 담으면 무엇과 이름이 부딪히는가. 포털은 가리키는 폴더를 본다.
  //
  // 그대로 두기에서는 아무것도 쓰지 않으므로 부딪힐 파일이 없다. 같은 이름이 나란히
  // 보일 수는 있지만, 그것은 서로 다른 폴더에 있는 다른 파일이다.
  function clashOf(fence, filePath) {
    if (!isPortal(fence) && keeping()) return '';
    if (!isPortal(fence)) return hold.clash(fence, filePath);
    const from = String(filePath || '');
    if (!from || portal.inside(fence.portal, from)) return '';
    const dest = path.join(fence.portal, path.basename(from));
    try {
      return fs.existsSync(dest) ? dest : '';
    } catch (_err) {
      return '';
    }
  }

  async function clearClash(fence, filePath) {
    const older = clashOf(fence, filePath);
    if (!older) return true;
    const yes = await askReplace(fence, path.basename(String(filePath)));
    if (!yes) return false;
    try {
      await shell.trashItem(older);
    } catch (_err) {
      // 지우지 못했으면 담지 않는다. 번호를 붙여 몰래 늘리지 않는다.
      return false;
    }
    takeOut(older);
    watchBin();
    return true;
  }

  // 박스에 적힌 이름은 확장자를 감춘 것일 수 있다(탐색기 설정, 바로가기).
  // 사람이 적어 준 것에 확장자가 없으면 원래 것을 그대로 붙여 준다.
  function wantedName(item, text) {
    // Windows 는 끝의 점과 빈칸을 말없이 떼어 낸다. 우리가 먼저 떼어 둔다.
    const typed = String(text || '').trim().replace(/[. ]+$/, '');
    if (!typed || /[\\/:*?"<>|]/.test(typed)) return '';
    const ext = path.extname(item.path);
    if (!ext) return typed;
    const low = ext.toLowerCase();
    // 확장자를 보여 주고 있었다면 사람이 적은 그대로가 온 이름이다.
    if (typed.toLowerCase().endsWith(low)) return typed;
    if (labelFor(item).toLowerCase().endsWith(low)) return typed;
    return `${typed}${ext}`;
  }

  // 박스에 담긴 항목의 이름을 바꾼다. 박스 폴더 안의 파일 이름이 실제로 바뀐다.
  // 휴지통 같은 셸 항목은 바꿀 파일이 없다.
  async function renameItem(id, filePath, text) {
    const fence = fenceById(id);
    if (!fence) return;
    const item = fence.items.find((entry) => entry.path === filePath);
    if (!item) return;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return;
    const base = wantedName(item, text);
    if (!base || base === path.basename(item.path)) return;
    const dir = path.dirname(item.path);
    const dest = path.join(dir, base);
    // 대소문자만 바꾼 것은 그 파일 자신이라 물을 것이 없다.
    if (!samePath(dest, item.path) && fs.existsSync(dest)) {
      const yes = await askReplace(fence, base);
      if (!yes) return;
      try {
        await shell.trashItem(dest);
      } catch (_err) {
        return;
      }
      takeOut(dest);
      watchBin();
    }
    const moved = hold.relabel(item, base);
    if (!moved) return;
    // 적어 둔 이름표는 경로를 열쇠로 삼는다. 바뀐 경로는 다시 물어본다.
    labels.delete(item.path);
    item.name = moved.name;
    item.path = moved.path;
    if (moved.home) item.home = moved.home;
    persist();
    await push(id);
    refreshFolders(dir);
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
    letGo(item, fence);
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
  async function transfer(fromId, filePath, screenX, screenY) {
    hideGhost();
    // 받을 항목은 손을 뗀 자리에서 다시 잰다. 창이 알려 준 값을 그대로 믿으면
    // 제 창 안에서 끈 경우에만 맞고, 다른 박스로 건너간 경우에는 늘 비어 있다.
    const landed = hit(screenX, screenY);
    const intoPath = landed ? receiverAt(landed, screenX, screenY, filePath) : null;
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

  // 항목 하나를 이 박스에 들인다. 방식에 따라 하는 일이 다르다.
  //
  //  그대로 두기 — 파일을 건드리지 않고 그 자리를 가리켜 둔다. 가리킴 표시를 새긴다.
  //  포털       — 가리키는 폴더로 옮긴다. 담기 전 자리는 적지 않는다. 그 폴더가 제자리다.
  //  옮기기     — 이 박스의 폴더로 옮기고, 담기 전에 있던 폴더를 함께 적어 둔다.
  //               꺼내거나 끝낼 때 그 자리로 돌려준다.
  function bringIn(fence, item) {
    // 그대로 두기. 파일은 건드리지 않고 그 자리를 가리켜 둔다.
    // 포털보다 먼저 볼 것은 아니다. 포털은 제 폴더로 모으는 것이 뜻이므로 그쪽이 앞선다.
    if (!isPortal(fence) && keeping()) {
      try {
        if (!fs.existsSync(item.path)) return null;
      } catch (_err) {
        return null;
      }
      return { name: path.basename(item.path), path: item.path, keep: true };
    }
    // 포털은 가리키는 폴더가 곧 그 박스다. 보관함을 거치지 않고 그 폴더로 옮긴다.
    // 담기 전 자리를 적어 두지 않는다. 포털에 있는 파일은 '담긴' 것이 아니라 그 폴더의 것이다.
    if (isPortal(fence)) {
      const moved = portal.bring(fence.portal, item.path, hold.spareName);
      if (!moved) return null;
      if (moved !== item.path) refreshFolders(path.dirname(item.path), fence.portal);
      return { name: path.basename(moved), path: moved };
    }
    const moved = hold.take(fence, item);
    if (!moved) return null;
    if (moved.path !== item.path) refreshFolders(path.dirname(item.path), path.dirname(moved.path));
    return moved;
  }

  // 꺼낸다. 파일을 담기 전 폴더로 돌려보내고, 그 아이콘도 적어 둔 자리에 놓는다.
  //
  // 포털에 있던 것은 '담기 전 폴더' 가 없다. 그 폴더가 곧 제자리였기 때문이다.
  // 그래서 꺼낸다는 것은 바탕화면으로 내보내는 일이고, 바탕화면 자리를 그때 다시 묻는다.
  function letGo(item, from) {
    if (!item) return false;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return putIconHome(item.name);
    // 가리키고만 있던 파일은 이미 그 폴더에 있다. 아이콘만 담기 전 자리로 돌려 다시 보이게 한다.
    if (pointsAt(item)) return putIconHome(item.name);
    const going = isPortal(from) ? { ...item, home: desktopFolder() } : item;
    const back = hold.give(going);
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
  // 포털 박스를 가리키는 폴더와 맞춘다.
  //
  // 포털이 보여 주는 것은 그 폴더 자체다. 파일을 옮기지 않으므로 할 일은 목록을
  // 폴더와 같게 두는 것뿐이다. 차례는 우리가 적어 둔 것을 따르고, 처음 보는 파일은
  // 뒤에 붙인다. 폴더에서 없어진 파일은 목록에서도 빠진다.
  function settlePortal(fence) {
    const before = fence.items.map((item) => item.path).join('\n');
    // 폴더를 읽을 수 없다면(네트워크 드라이브가 끊겼거나 폴더가 잠겼다) 목록을 비우지 않는다.
    // 비워 버리면 드라이브가 돌아와도 차례가 흐트러진다.
    if (!portal.usable(fence.portal)) return false;
    const found = portal.entries(fence.portal);
    const byPath = new Map(found.map((entry) => [path.resolve(entry.path), entry]));
    const kept = [];
    for (const item of fence.items) {
      const key = path.resolve(item.path);
      const entry = byPath.get(key);
      if (!entry) continue;
      byPath.delete(key);
      kept.push({ name: entry.name, path: entry.path });
    }
    for (const entry of found) {
      if (!byPath.has(path.resolve(entry.path))) continue;
      kept.push({ name: entry.name, path: entry.path });
    }
    fence.items = kept;
    return before !== kept.map((item) => item.path).join('\n');
  }

  function settleBox(fence) {
    if (isPortal(fence)) return settlePortal(fence);
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
        if (!inFolder.has(name)) continue;
        inFolder.delete(name);
        // 그대로 두기이면 보관함에 둔 파일은 바탕화면으로 되돌린다.
        // 보관함에 있으면 탐색기 바탕화면에서 그 항목이 보이지 않는다.
        if (keeping()) {
          const back = hold.give({ ...item, home: item.home || desktopFolder() });
          if (back && path.resolve(back) !== path.resolve(item.path)) {
            refreshFolders(dir, path.dirname(back));
            kept.push({ name: path.basename(back), path: back, keep: true });
            continue;
          }
        }
        kept.push(item);
        continue;
      }
      // 가리키고만 있는 항목은 폴더 밖에 있는 것이 정상이다. 있는 자리에 둔다.
      //
      // 항목에 새긴 표시가 지금 설정보다 앞선다. 그래야 그대로 두기로 담은 뒤 설정을
      // 옮기기로 바꿔도, 폴더와 맞추는 이 길에서 사람의 파일이 끌려가지 않는다.
      //
      // 표시가 없는데 그대로 두기인 경우에도 여기로 온다. 첫 실행 분류처럼 bringIn 을
      // 거치지 않고 목록에 바로 들어온 항목이 그렇다. 그때 표시를 새겨 둔다.
      // 보관함 안에 있는 것은 여기서 두면 주인 없이 남으므로 아래로 보낸다.
      if (pointsAt(item) || (keeping() && !hold.inside(item.path))) {
        let there = false;
        try {
          there = fs.existsSync(item.path);
        } catch (_err) {
          there = false;
        }
        if (there) kept.push(pointsAt(item) ? item : { ...item, keep: true });
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
    stopPortals();
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

  // ── 바탕화면에 새로 생긴 항목 ────────────────────────────────────────────
  //
  // 탐색기에서 '새 폴더' 나 '새 텍스트 문서' 를 만들면 바탕화면 폴더에 항목이 하나 생긴다.
  // 그런데 같은 이름을 이미 어느 박스가 들고 있을 수 있다. 담긴 파일은 박스 폴더에 있어
  // 탐색기 눈에 보이지 않으므로, 탐색기는 그것을 막아 주지 못한다. 그대로 두면 같은 이름이
  // 바탕화면과 박스에 두 벌 생기고, 나중에 박스에 담을 때에야 부딪힌다.
  //
  // 그래서 생기자마자 묻는다. 대체하겠다면 박스에 있던 것은 휴지통으로 가고 새로 만든 것이
  // 그 자리에 담긴다. 다시 만들겠다면 새로 만든 것을 바탕화면에 그대로 둔다.
  // 한 번 물은 항목은 다시 묻지 않는다.

  // 지난번에 본 바탕화면 항목. null 이면 아직 한 번도 보지 않은 것이다.
  let seenOnDesk = null;
  // 물어볼 차례를 기다리는 항목. 다른 물음이 떠 있으면 다음 차례로 미룬다.
  const freshQueue = [];
  // 규칙대로 담을 차례를 기다리는 항목. 이쪽은 묻지 않는다.
  const sortQueue = [];
  let draining = false;

  function deskPaths() {
    if (typeof desktop.desktopEntries !== 'function') return [];
    try {
      return desktop.desktopEntries()
        .filter((entry) => entry && entry.path)
        .map((entry) => String(entry.path));
    } catch (_err) {
      return [];
    }
  }

  // 같은 이름인가. Windows 는 대소문자를 가리지 않는다.
  function sameLabel(a, b) {
    const one = String(a || '');
    const two = String(b || '');
    if (!one || !two) return false;
    if (process.platform === 'win32') return one.toLowerCase() === two.toLowerCase();
    return one === two;
  }

  // 이 이름을 이미 들고 있는 박스. 들고 있는 항목까지 함께 준다.
  // 가리키고만 있는 항목은 건너뛴다. 그것은 바탕화면에 그대로 있어 탐색기 눈에 보이므로,
  // 탐색기가 같은 이름을 두 번 만들지 않는다. 물을 일이 없고, 물어서 대체하면 사람이
  // 바탕화면에 두고 쓰던 파일이 휴지통으로 간다.
  function holderOf(name) {
    for (const fence of state.fences) {
      for (const item of fence.items) {
        if (desktop.isShellItem && desktop.isShellItem(item.path)) continue;
        if (pointsAt(item)) continue;
        if (sameLabel(path.basename(item.path), name)) return { fence, item };
      }
    }
    return null;
  }

  // 바탕화면을 다시 볼 때마다 새로 생긴 항목을 찾아 둔다.
  function watchFresh() {
    const now = deskPaths();
    const keys = new Set(now.map((at) => path.resolve(at)));
    // 처음 보는 것이면 지금 있는 것은 모두 '이미 있던 것' 이다.
    // 그러지 않으면 켜자마자 바탕화면에 있는 것을 하나씩 묻게 된다.
    if (seenOnDesk === null) {
      seenOnDesk = keys;
      return;
    }
    for (const at of now) {
      if (seenOnDesk.has(path.resolve(at))) continue;
      // 같은 이름을 박스가 이미 들고 있으면 그것을 먼저 푼다. 규칙보다 앞서는 물음이다.
      if (holderOf(path.basename(at))) freshQueue.push(at);
      else if (state.settings.autoSort) sortQueue.push(at);
    }
    seenOnDesk = keys;
  }

  // 미뤄 둔 물음을 하나씩 푼다. 다른 물음이 떠 있으면 다음 기회에 다시 온다.
  function drainFresh() {
    if (draining || asking || closing || (!freshQueue.length && !sortQueue.length)) return;
    draining = true;
    (async () => {
      try {
        while (freshQueue.length && !closing) {
          await offerReplace(freshQueue.shift());
        }
        if (sortQueue.length && !closing) await sortInto(sortQueue.splice(0, sortQueue.length));
      } finally {
        draining = false;
      }
    })();
  }

  // 새로 생긴 항목을 규칙대로 담는다. 규칙에 맞는 것이 없으면 바탕화면에 그대로 둔다.
  async function sortInto(paths) {
    const files = [];
    for (const at of paths) {
      const file = fileAt(at);
      if (file) files.push(file);
    }
    if (!files.length) return 0;
    let count = 0;
    for (const [id, found] of planFor(files)) {
      const fence = fenceById(id);
      if (!fence) continue;
      const was = fence.items.length;
      await dropFiles(id, found);
      count += Math.max(0, fence.items.length - was);
    }
    return count;
  }

  // 규칙은 폴더인지까지 본다. 경로 하나를 규칙이 볼 수 있는 모습으로 만든다.
  function fileAt(at) {
    const filePath = String(at || '');
    if (!filePath) return null;
    try {
      return { name: path.basename(filePath), path: filePath, directory: fs.statSync(filePath).isDirectory() };
    } catch (_err) {
      // 묻는 사이에 없어졌다. 담을 것이 없다.
      return null;
    }
  }

  // 새로 만든 것 하나. 대체할지 그대로 둘지 묻고, 대체하겠다면 박스로 옮긴다.
  async function offerReplace(filePath) {
    const name = path.basename(String(filePath || ''));
    const found = holderOf(name);
    if (!found) return false;
    try {
      if (!fs.existsSync(filePath)) return false;
    } catch (_err) {
      return false;
    }
    asking = true;
    let yes = false;
    try {
      yes = await ask.confirm({
        title: say('dialog.fresh', { name }),
        detail: say('dialog.freshDetail', { title: found.fence.title || say('box.untitled') }),
        confirm: say('dialog.freshGo'),
        cancel: say('dialog.freshKeep'),
        icon: icons.menu('remove'),
        danger: true,
      });
    } finally {
      asking = false;
    }
    if (!yes) return false;
    return replaceHeld(found.fence, found.item, filePath);
  }

  // 박스에 있던 것을 새로 만든 것으로 바꾼다.
  // 있던 것은 휴지통으로 가고, 새로 만든 것이 그 자리에 담긴다.
  async function replaceHeld(fence, older, filePath) {
    const at = fence.items.findIndex((item) => item.path === older.path);
    // 묻는 동안 새로 만든 것이 없어졌을 수 있다. 사람이 지웠거나 다른 곳으로 옮긴 경우다.
    // 그러면 바꿔 놓을 것이 없으므로 박스에 있던 것도 그대로 둔다.
    // 이 빗장이 없으면 있던 것만 휴지통으로 가고 박스가 빈다.
    try {
      if (!fs.existsSync(filePath)) return false;
    } catch (_err) {
      return false;
    }
    try {
      await shell.trashItem(older.path);
    } catch (_err) {
      // 지우지 못했으면 아무것도 하지 않는다. 새로 만든 것은 바탕화면에 그대로 있다.
      return false;
    }
    takeOut(older.path);
    watchBin();
    await dropFiles(fence.id, [filePath], at < 0 ? fence.items.length : at);
    return true;
  }

  // 박스에 담긴 바탕화면 아이콘은 그 박스의 칸으로 옮긴다. 파일은 그 폴더에 둔다.
  // 박스를 끌면 칸이 움직이고 아이콘이 그 칸을 따라간다.
  // 담기지 않은 아이콘이 박스 자리에 남아 있으면 밖으로 밀어낸다.
  // 박스 자리는 그대로 두고, 그 밑에 깔린 바탕화면 아이콘만 비킨다.
  // 박스가 깔고 앉은 칸의, 박스에 없는 아이콘은 밖의 빈 칸으로 비켜 준다.
  // 박스 칸에 앉힌 아이콘은 밀어내지 않는다. 그 아이콘이 박스 내용이다.
  function refreshIcons() {
    if (closing) return;
    watchBin();
    watchFresh();
    drainFresh();
    const changed = settleAll();
    // 휴지통도 숨기지 않는다. 다른 바탕화면 아이콘과 같이 박스 칸으로 옮긴다.
    // 예전에 레지스트리로 감춰 둔 것이 있으면 여기서 되살린 뒤 칸에 앉힌다.
    if (typeof desktop.syncShellIcons === 'function') desktop.syncShellIcons([]);
    if (typeof desktop.seatKept === 'function') desktop.seatKept(seatPlaces(), false);
    if (changed) pushAll();
    if (state.hidden) {
      // 박스를 숨기면 밀어낸 아이콘도 제자리로 돌려준다.
      if (typeof desktop.release === 'function') desktop.release([]);
      return;
    }
    if (typeof desktop.nudge !== 'function') return;
    // 바탕화면에서 무언가를 끌고 있는 동안에는 건드리지 않는다. 손을 떼면 이 길로 다시 온다.
    if (desktop.mouseDown && desktop.mouseDown()) return;
    desktop.nudge(blockRects());
  }

  // 지금 화면에 보이는 박스들이 차지한 자리.
  function blockRects() {
    if (state.hidden) return [];
    const rects = [];
    for (const fence of visibleFences()) {
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
    if (patch.corner !== undefined) {
      fence.corner = themes.cornerRadius(patch.corner);
      shapeWindow(wins.get(id), fence);
    }
    if (typeof patch.opacity === 'number') {
      fence.opacity = Math.max(themes.MIN_OPACITY, Math.min(themes.MAX_OPACITY, patch.opacity));
    }
    // 이 박스만의 글자 색과 그림·글씨 크기. 온 것만 고치고 나머지는 그대로 둔다.
    // 빈 글자나 0 을 보내면 그 값은 다시 테마가 정한 대로 돌아간다.
    if (patch.look && typeof patch.look === 'object') {
      fence.look = themes.normalizeLook({ ...themes.normalizeLook(fence.look), ...patch.look });
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
      // 포털을 지우는 것은 창을 닫는 일이다. 가리키던 폴더와 그 안의 파일은 그대로 남는다.
      detail: say(isPortal(fence) ? 'dialog.removePortal' : 'dialog.removeDetail'),
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
    // 없어진 박스로 보내라는 규칙은 쓸 데가 없다.
    dropRulesFor(id);
    persist();
    closeSettings(id);
    if (win && !win.isDestroyed()) win.close();
    watchPortals();
    refreshIcons();
  }

  // 이 박스를 가리키던 자동 분류 규칙을 치운다.
  function dropRulesFor(id) {
    const left = state.settings.rules.filter((rule) => rule.fence !== id);
    if (left.length === state.settings.rules.length) return false;
    state.settings.rules = left;
    return true;
  }

  // 박스 하나를 비운다. 담긴 파일은 담기 전 폴더로, 아이콘은 적어 둔 자리로 간다.
  // 돌려준 개수를 준다.
  function emptyBox(fence) {
    // 포털이 들고 있는 것은 담긴 파일이 아니라 그 폴더의 파일이다.
    // 바탕화면으로 보내면 남의 폴더를 비우는 일이 된다. 목록만 놓는다.
    if (isPortal(fence)) {
      fence.items = [];
      return 0;
    }
    let count = 0;
    const names = [];
    for (const item of fence.items) {
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        names.push(item.name);
        continue;
      }
      // 가리키고만 있던 것은 옮긴 적이 없다. 파일은 그대로 두고 아이콘만 제자리로 돌린다.
      // 여기서 hold.give 를 부르면 바탕화면이 아닌 폴더에서 가리킨 파일이 바탕화면으로 끌려온다.
      if (pointsAt(item)) {
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
          // 박스 폴더 안의 파일 이름을 바꾼다. 셸 항목은 바꿀 파일이 없다.
          label: say('menu.rename'),
          icon: icons.menu('rename'),
          enabled: !(desktop.isShellItem && desktop.isShellItem(filePath)),
          click: () => win.webContents.send('fence:rename-item', filePath),
        },
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
        // 항목 이름 바꾸기와 한 메뉴에 나란히 서므로 무엇의 이름인지 적어 둔다.
        label: say('menu.renameBox'),
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
      // 폴더 포털. 가리키는 폴더를 그대로 비추는 박스다.
      {
        label: say(isPortal(fence) ? 'menu.portalChange' : 'menu.portalMake'),
        icon: icons.menu('portal'),
        click: () => makePortal(id),
      },
      ...(isPortal(fence)
        ? [
          { label: say('menu.portalOpen'), icon: icons.menu('open'), click: () => shell.openPath(fence.portal) },
          { label: say('menu.portalDrop'), icon: icons.menu('eject'), click: () => dropPortal(id) },
        ]
        : []),
      // 다른 페이지로 옮기기. 페이지가 하나뿐이면 옮길 데가 없다.
      ...(state.pages.length > 1
        ? [{
          label: say('menu.movePage'),
          icon: icons.menu('page'),
          submenu: state.pages.map((page) => ({
            label: pageLabel(page),
            icon: icons.menu('page'),
            type: 'radio',
            checked: fence.page === page.id,
            click: () => movePage(id, page.id),
          })),
        }]
        : []),
      { type: 'separator' },
      ...specialItems(id),
      { label: say('menu.newBox'), icon: icons.menu('draw'), click: () => beginDraw() },
      { label: say('menu.newPortal'), icon: icons.menu('portal'), click: () => createPortal() },
      { label: say('tray.about'), icon: icons.menu('info'), click: () => showAbout() },
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

  // 담을 때 파일을 옮길지, 있는 자리에 두고 가리킬지 정한다.
  //
  // 이미 담아 둔 것은 건드리지 않는다. 항목마다 담을 때의 방식이 새겨져 있고,
  // 그것을 바꾸는 일은 파일을 옮기는 일이라 설정을 누른 것만으로 할 일이 아니다.
  // 지금 담긴 것을 되돌리려면 '바탕화면으로 모두 돌려주기' 를 쓴다.
  function setTakeWith(kind) {
    const next = kind === 'move' ? 'move' : 'keep';
    if (state.settings.takeWith === next) return;
    state.settings.takeWith = next;
    persist();
    // 감춰 두었던 셸 아이콘을 방식에 맞게 다시 맞춘다.
    refreshIcons();
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
      shapeWindow(win, fence);
    }
    pushAll();
    announce();
  }

  // 박스 뒤로 바탕화면을 흐려 비출지. 모든 박스에 함께 걸린다.
  function setBlur(on) {
    state.settings.blur = !!on;
    persist();
    for (const fence of state.fences) {
      const win = wins.get(fence.id);
      if (!win || win.isDestroyed()) continue;
      if (typeof desktop.blurBehind === 'function') desktop.blurBehind(win, state.settings.blur);
      shapeWindow(win, fence);
    }
    announce();
  }

  function showAbout() {
    const lines = [
      `${say('about.version')} ${appVersion()}`,
      `${say('about.made')} ${AUTHOR.name}`,
      `${say('about.mail')} ${AUTHOR.email}`,
    ];
    ask.notice({
      title: appName(),
      detail: lines.join('\n'),
      confirm: say('settings.ok'),
      icon: icons.app(),
    });
  }

  function setDefaultOpacity(opacity) {
    state.settings.opacity = Math.max(themes.MIN_OPACITY, Math.min(themes.MAX_OPACITY, Number(opacity) || themes.DEFAULT_OPACITY));
    persist();
    announce();
  }

  function setLogin(on) {
    state.settings.openAtLogin = !!on;
    // 설치본이 아니거나 운영체제가 거절하면 적히지 않는다. 그래도 고른 값은 남긴다.
    autostart.apply(state.settings.openAtLogin, appName());
    persist();
    announce();
  }

  // 켜질 때 한 번. 설정에 적힌 대로 운영체제의 시작프로그램 목록을 다시 맞춘다.
  // 다시 설치했거나 다른 자리에 설치했어도 이 길로 지금 자리가 다시 적힌다.
  function syncLogin() {
    return autostart.sync(state.settings.openAtLogin, appName());
  }

  function captured() {
    return state.fences.flatMap((fence) => fence.items);
  }

  // ── 폴더 포털 ─────────────────────────────────────────────────────────────
  //
  // 포털은 가리키는 폴더를 그대로 비춘다. 그래서 그 폴더를 지켜본다. 탐색기에서 넣거나
  // 지운 것이 바로 박스에 드러나야 한다. 3초마다 도는 훑기에 맡겨 두면 한 박자 늦다.

  // 박스 id -> { dir, off }
  const portalWatch = new Map();

  function watchPortals() {
    const wanted = new Map();
    for (const fence of state.fences) {
      if (isPortal(fence) && onThisPage(fence)) wanted.set(fence.id, fence.portal);
    }
    // 폴더가 바뀌었거나 볼 까닭이 없어진 것부터 손을 뗀다.
    for (const [id, watching] of [...portalWatch]) {
      if (wanted.get(id) === watching.dir) continue;
      watching.off();
      portalWatch.delete(id);
    }
    for (const [id, dir] of wanted) {
      if (portalWatch.has(id)) continue;
      portalWatch.set(id, { dir, off: portal.watch(dir, () => portalChanged(id)) });
    }
  }

  // 포털 폴더가 바뀌었다. 그 박스만 다시 맞춘다.
  function portalChanged(id) {
    if (closing) return;
    const fence = fenceById(id);
    if (!fence || !isPortal(fence)) return;
    if (!settlePortal(fence)) return;
    persist();
    push(id);
  }

  function stopPortals() {
    for (const [, watching] of portalWatch) watching.off();
    portalWatch.clear();
  }

  // 폴더 하나를 고른다. 취소하면 빈 글자를 준다.
  async function pickFolder(owner) {
    try {
      const options = {
        title: say('dialog.portalPick'),
        buttonLabel: say('dialog.portalGo'),
        properties: ['openDirectory'],
      };
      const picked = owner && !owner.isDestroyed()
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      if (!picked || picked.canceled || !picked.filePaths.length) return '';
      return picked.filePaths[0];
    } catch (_err) {
      return '';
    }
  }

  // 새 박스를 놓을 자리. 커서가 있는 화면의 왼쪽 위에서 조금 들어온 데다.
  function defaultSpot() {
    let area = { x: 0, y: 0, width: 1280, height: 800 };
    try {
      const found = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      if (found && found.width) area = found;
    } catch (_err) {
      /* 화면을 못 물어보면 위의 값으로 둔다. */
    }
    return { x: area.x + 48, y: area.y + 48, w: 300, h: 340 };
  }

  // 폴더를 고르고 그 폴더를 비추는 박스를 만든다.
  async function createPortal(rect) {
    const dir = await pickFolder();
    if (!dir) return null;
    setHidden(false);
    const fence = createFence(rect && rect.w ? rect : defaultSpot(), {
      portal: dir,
      title: path.basename(dir) || dir,
    });
    if (settleBox(fence)) persist();
    await push(fence.id);
    return fence;
  }

  // 이미 있는 박스를 포털로 바꾼다.
  // 담고 있던 파일이 있으면 먼저 담기 전 폴더로 돌려준다. 포털은 남의 폴더를 비추는
  // 박스이므로, 우리가 들고 있던 파일을 그 폴더에 섞어 넣지 않는다.
  async function makePortal(id) {
    const fence = fenceById(id);
    if (!fence || asking) return false;
    const dir = await pickFolder(wins.get(id));
    if (!dir) return false;
    if (!isPortal(fence) && fence.items.length) {
      asking = true;
      let yes = false;
      try {
        yes = await ask.confirm({
          title: say('dialog.portalTake', { title: fence.title || say('box.untitled') }),
          detail: say('dialog.portalTakeDetail', { n: fence.items.length }),
          confirm: say('dialog.portalGo'),
          cancel: say('dialog.cancel'),
          icon: icons.menu('folder'),
        });
      } finally {
        asking = false;
      }
      if (!yes) return false;
      emptyBox(fence);
    }
    fence.portal = dir;
    fence.items = [];
    settleBox(fence);
    persist();
    watchPortals();
    await push(id);
    pushSettings(id);
    refreshIcons();
    return true;
  }

  // 포털을 그만둔다. 가리키던 폴더와 그 안의 파일은 그대로 두고, 빈 보통 박스가 된다.
  async function dropPortal(id) {
    const fence = fenceById(id);
    if (!fence || !isPortal(fence)) return false;
    fence.portal = '';
    fence.items = [];
    persist();
    watchPortals();
    await push(id);
    pushSettings(id);
    refreshIcons();
    return true;
  }

  // ── 바탕화면 페이지 ───────────────────────────────────────────────────────
  //
  // 페이지를 갈면 그 페이지의 박스만 창을 띄운다. 다른 페이지의 박스는 창을 닫지만
  // 담긴 파일은 그대로 제 폴더에 있다. 페이지를 가는 것은 보는 것을 바꾸는 일이지
  // 파일을 옮기는 일이 아니다.

  // 지금 state.page 에 맞게 창을 맞춘다. 페이지를 갈거나 지운 뒤에 부른다.
  function applyPage() {
    for (const [boxId, win] of [...wins]) {
      const fence = fenceById(boxId);
      if (fence && onThisPage(fence)) continue;
      closeSettings(boxId);
      if (!win.isDestroyed()) win.close();
      wins.delete(boxId);
    }
    for (const fence of visibleFences()) {
      const win = openFence(fence);
      if (win && !state.hidden) showFence(win);
    }
    watchPortals();
    refreshIcons();
    announce();
  }

  function showPage(id) {
    if (!pageById(id) || state.page === id) return false;
    state.page = id;
    persist();
    applyPage();
    return true;
  }

  // 새 페이지. 만들면 곧 그 페이지로 간다. 빈 바탕화면에 박스를 그리려는 것이기 때문이다.
  function addPage(name) {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    state.pages.push({ id, name: String(name || '').trim() });
    state.page = id;
    persist();
    applyPage();
    return id;
  }

  function renamePage(id, name) {
    const page = pageById(id);
    if (!page) return false;
    page.name = String(name || '').trim();
    persist();
    announce();
    pushAllSettings();
    return true;
  }

  // 페이지를 지운다. 그 페이지의 박스는 첫 페이지로 데려온다.
  // 박스를 말없이 지우지 않는다. 담긴 파일이 함께 없어지기 때문이다.
  function removePage(id) {
    if (state.pages.length < 2 || !pageById(id)) return false;
    const rest = state.pages.filter((page) => page.id !== id);
    const home = rest[0].id;
    for (const fence of state.fences) {
      if (fence.page !== id) continue;
      fence.page = home;
      keepApart(fence);
      clampToScreen(fence);
    }
    state.pages = rest;
    if (state.page === id) state.page = home;
    persist();
    applyPage();
    return true;
  }

  // 박스 하나를 다른 페이지로 옮긴다.
  function movePage(id, pageId) {
    const fence = fenceById(id);
    if (!fence || !pageById(pageId) || fence.page === pageId) return false;
    fence.page = pageId;
    // 옮겨 간 페이지에서 다른 박스와 겹칠 수 있다. 자리만 비켜 준다.
    keepApart(fence);
    clampToScreen(fence);
    persist();
    applyPage();
    return true;
  }

  // 열려 있는 박스 설정 창을 모두 다시 채운다. 페이지 이름처럼 여러 창에 함께 보이는 것.
  function pushAllSettings() {
    for (const boxId of settingWins.keys()) pushSettings(boxId);
  }

  // ── 배치 스냅샷 ───────────────────────────────────────────────────────────
  //
  // 박스의 자리와 크기와 모습을 그 순간 그대로 적어 둔다. 담긴 파일은 적지 않는다.
  // 되돌리는 것은 박스를 옮기는 일이지 파일을 옮기는 일이 아니다.
  const MAX_SNAPS = 20;

  // 이름을 붙이지 않았으면 적어 둔 때를 이름으로 쓴다.
  function snapName(when) {
    const at = new Date(when);
    const two = (n) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
  }

  function saveSnap(name) {
    const when = Date.now();
    const snap = snaps.capture(state, String(name || '').trim() || snapName(when), when);
    state.snaps.unshift(snap);
    // 쌓이면 설정 파일만 커진다. 가장 오래된 것부터 버린다.
    if (state.snaps.length > MAX_SNAPS) state.snaps.length = MAX_SNAPS;
    persist();
    announce();
    return snap.id;
  }

  // 적어 둔 배치로 되돌린다. 그 사이에 만든 박스는 건드리지 않는다.
  async function applySnap(id) {
    const snap = state.snaps.find((one) => one.id === id);
    if (!snap) return 0;
    const touched = snaps.apply(state, snap);
    if (!touched.length) return 0;
    const moved = new Set(touched);
    for (const fence of state.fences) {
      if (!moved.has(fence.id)) continue;
      fence.corner = themes.cornerRadius(fence.corner);
      fence.look = themes.normalizeLook(fence.look);
      clampToScreen(fence);
      const win = wins.get(fence.id);
      if (win && !win.isDestroyed()) {
        win.setBounds(arrange.windowRect(fence, state.settings.shadow));
        shapeWindow(win, fence);
      }
    }
    persist();
    applyPage();
    await pushAll();
    return touched.length;
  }

  function removeSnap(id) {
    const left = state.snaps.filter((one) => one.id !== id);
    if (left.length === state.snaps.length) return false;
    state.snaps = left;
    persist();
    announce();
    return true;
  }

  // ── 자동 분류 규칙 ────────────────────────────────────────────────────────
  //
  // 바탕화면에 새로 생긴 항목을 규칙대로 박스에 담는다. **파일이 저절로 옮겨 가는
  // 일이므로** 사람이 켜 주기 전에는 하지 않는다(settings.autoSort).
  // 짝을 찾는 셈은 shared/rules.js 에 있고, 옮기는 일만 여기서 한다.

  function setAutoSort(on) {
    state.settings.autoSort = !!on;
    persist();
    announce();
    // 막 켰다면 지금 바탕화면에 있는 것부터 규칙대로 담는다.
    if (state.settings.autoSort) sortNow();
  }

  function addRule(patch) {
    const rule = rules.normalizeRule({ ...(patch || {}) });
    if (!rule) return '';
    // 보낼 박스를 고르지 않았으면 첫 박스로 둔다. 빈 규칙은 아무 일도 하지 않는다.
    if (!rule.fence) rule.fence = (state.fences[0] && state.fences[0].id) || '';
    state.settings.rules.push(rule);
    persist();
    announce();
    return rule.id;
  }

  function changeRule(id, patch) {
    const at = state.settings.rules.findIndex((rule) => rule.id === id);
    if (at < 0) return false;
    state.settings.rules[at] = rules.normalizeRule({ ...state.settings.rules[at], ...(patch || {}), id });
    persist();
    announce();
    return true;
  }

  function removeRule(id) {
    const left = state.settings.rules.filter((rule) => rule.id !== id);
    if (left.length === state.settings.rules.length) return false;
    state.settings.rules = left;
    persist();
    announce();
    return true;
  }

  // 바탕화면에 있는 것. 규칙은 폴더인지까지 보므로 종류를 함께 읽는다.
  function deskFiles() {
    if (typeof desktop.listDesktopFiles !== 'function') return [];
    try {
      return desktop.listDesktopFiles();
    } catch (_err) {
      return [];
    }
  }

  // 이 항목들을 어느 박스로 보낼지 정한다. 박스 id -> 경로 목록.
  function planFor(files) {
    const plan = new Map();
    if (!state.settings.rules.length) return plan;
    const held = new Set(captured().map((item) => path.resolve(item.path)));
    for (const file of files || []) {
      if (!file || !file.path) continue;
      if (held.has(path.resolve(file.path))) continue;
      const to = rules.pick(state.settings.rules, file);
      if (!to || !fenceById(to)) continue;
      if (!plan.has(to)) plan.set(to, []);
      plan.get(to).push(file.path);
    }
    return plan;
  }

  // 규칙대로 지금 바탕화면에 있는 것을 담는다. 담은 개수를 준다.
  async function sortNow() {
    if (closing) return 0;
    let count = 0;
    for (const [id, paths] of planFor(deskFiles())) {
      const fence = fenceById(id);
      if (!fence) continue;
      const was = fence.items.length;
      await dropFiles(id, paths);
      count += Math.max(0, fence.items.length - was);
    }
    return count;
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
    prefsEdit,
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
    renameItem,
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
    syncLogin,
    setLang,
    setTakeWith,
    keeping,
    setDefaultTheme,
    setDefaultCorner,
    setDefaultOpacity,
    setShadow,
    setBlur,
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
    // 폴더 포털
    isPortal,
    createPortal,
    makePortal,
    dropPortal,
    watchPortals,
    stopPortals,
    // 바탕화면 페이지
    pageLabel,
    visibleFences,
    showPage,
    addPage,
    renamePage,
    removePage,
    movePage,
    // 배치 스냅샷
    saveSnap,
    applySnap,
    removeSnap,
    snapName,
    // 자동 분류 규칙
    setAutoSort,
    addRule,
    changeRule,
    removeRule,
    sortNow,
    planFor,
  };
}

module.exports = { createHost };
