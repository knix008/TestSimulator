'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, app, screen, shell, Menu, nativeImage } = require('electron');
const store = require('./store');
const arrange = require('../shared/arrange');
const deskgrid = require('../shared/deskgrid');
const desktop = require('./desktop');
const hold = require('./hold');
const autostart = require('./autostart');

const icons = require('./icons');
const ask = require('./ask');
const props = require('./props');
const themes = require('./themes');
const i18n = require('../shared/i18n');
const deliver = require('../shared/deliver');
const catalog = require('../shared/catalog');
const clipfiles = require('./clipfiles');

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
  // 다른 프로그램으로 끌어 낼 때 커서 밑에 보여줄 그림. 창에 보내는 주소와 따로 둔다.
  const dragIcons = new Map();

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
      if (image && !image.isEmpty()) dragIcons.set(filePath, image);
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
        // 끌어다 놓은 것을 받아 줄 수 있는가. 창은 이것으로 밝혀 보여 준다.
        receives: canReceive(item),
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

  // 고른 표시를 거둔다. 박스 창은 제 안쪽만 볼 수 있어, 바탕화면이나 다른 박스를
  // 누른 것을 알지 못한다. 그 누름을 아는 쪽(바탕화면 감시, 누른 박스)이 알려 준다.
  // exceptId 는 방금 고르기를 시작한 박스다. 그 박스의 표시는 그대로 둔다.
  function clearPicks(exceptId) {
    for (const [id, win] of wins) {
      if (id === exceptId) continue;
      if (win && !win.isDestroyed()) win.webContents.send('fence:unpick');
    }
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
    // 그림만 보여 주는 창이다. 마우스를 받으면 커서 아래의 다른 프로그램을 가린다.
    // 박스 창은 그대로 둔다. 박스가 마우스를 흘려보내면 안의 아이콘을 고를 수 없다.
    ghost.setIgnoreMouseEvents(true);
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
  // 이 항목이 끌어다 놓은 것을 받아 줄 수 있는가.
  //
  // 받는 것은 옮겨 넣을 수 있는 곳뿐이다. 폴더, 폴더를 가리키는 바로가기, 휴지통이다.
  // 그 밖의 항목은 받지 않으므로 그 그림 위에 놓아도 '사이에 끼우기' 가 된다.
  // 받지 못하는 항목까지 받는다고 보이면, 밝아진 아이콘에 놓았는데 아무 일도
  // 일어나지 않는 것처럼 보인다.
  // 무엇을 받는지 정하는 표는 deliver.receiveKind 하나뿐이다.
  // 여기서는 그 표가 보고 판단할 것(폴더인지, 바로가기가 폴더를 가리키는지)만 알아 준다.
  function canReceive(item) {
    if (!item || !item.path) return false;
    const link = deliver.isShortcut(item.path) ? shortcutLink(item.path) : null;
    const aimed = link && link.target && isDirectory(link.target) ? link.target : '';
    return !!deliver.receiveKind({
      path: item.path,
      directory: isDirectory(item.path),
      shortcutDir: aimed,
    });
  }

  function receiverAt(fence, screenX, screenY, exceptPath) {
    if (!fence || fence.collapsed) return null;
    const bounds = boundsOf(fence.id);
    if (!bounds) return null;
    const grid = arrange.gridOf(bounds.width, bounds.height, false);
    const localX = screenX - bounds.x;
    const localY = screenY - bounds.y + (scrollTops.get(fence.id) || 0);
    const shown = fence.items.filter((item) => item.path !== exceptPath);
    for (let n = 0; n < shown.length; n += 1) {
      const point = arrange.slotPoint(n, grid);
      if (!deliver.onPicture(localX - point.x, localY - point.y)) continue;
      return canReceive(shown[n]) ? shown[n].path : null;
    }
    return null;
  }

  function hover(filePath, screenX, screenY, icon, incoming) {
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
          // 어느 항목 위인지 창에게 함께 알려 준다. 창은 그 항목을 밝혀 보여 준다.
          into: receiverAt(target, screenX, screenY, filePath),
        });
      } else {
        win.webContents.send('fence:hover', null);
      }
    }
    // 바탕화면에서 끌어 오는 동안에는 탐색기가 그림을 들고 있다. 우리 창을 겹치지 않는다.
    if (incoming) {
      hideGhost();
      return;
    }
    // 원래 있던 박스 위에서는 그 박스가 직접 그리므로 따라다니는 그림을 숨긴다.
    // 밖이나 다른 박스 위에서는 그 그림이 계속 보여야 한다.
    const owner = ownerOf(filePath);
    if (target && owner && target.id === owner.id) hideGhost();
    else showGhost(icon, screenX, screenY);
  }

  // 바탕화면 아이콘을 박스 위로 끌고 오는 동안. 넣을 자리만 보여 준다.
  function hoverIncoming(filePath, screenX, screenY) {
    if (!filePath) {
      clearHover();
      return;
    }
    hover(filePath, screenX, screenY, '', true);
  }

  function clearHover() {
    hideGhost();
    for (const fence of state.fences) {
      const win = wins.get(fence.id);
      if (win && !win.isDestroyed()) win.webContents.send('fence:hover', null);
    }
  }

  // 우리 창의 번호. 커서 아래가 우리 것인지 가릴 때 쓴다.
  function ownHandles() {
    const found = [];
    const list = typeof BrowserWindow.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [...wins.values()];
    for (const win of list) {
      const id = handleOf(win);
      if (id) found.push(id);
    }
    return found;
  }

  // 커서 아래가 다른 프로그램인가. 바탕화면과 우리 창은 아니다.
  function overForeign(screenX, screenY) {
    if (typeof desktop.foreignAt !== 'function') return false;
    try {
      return !!desktop.foreignAt({ x: screenX, y: screenY }, ownHandles());
    } catch (_err) {
      return false;
    }
  }

  // 커서 아래가 바탕화면인가. 알 수 없으면 박스 밖을 바탕화면으로 본다.
  function releaseOnDesktop(screenX, screenY) {
    if (typeof desktop.onDesktop !== 'function') return true;
    try {
      return !!desktop.onDesktop({ x: screenX, y: screenY }, ownHandles());
    } catch (_err) {
      return false;
    }
  }

  // 휴지통 같은 셸 항목은 넘길 파일이 없다.
  function canDragOut(filePath) {
    if (!filePath || deliver.isRecycle(filePath)) return false;
    if (desktop.isShellItem && desktop.isShellItem(filePath)) return false;
    try {
      return fs.existsSync(filePath);
    } catch (_err) {
      return false;
    }
  }

  // 끄는 동안 커서 밑에 둘 그림. 비어 있으면 운영체제가 끌기를 거절한다.
  function dragIconFor(filePath) {
    let image = dragIcons.get(filePath);
    if (!image || image.isEmpty()) image = icons.app();
    if (!image || image.isEmpty()) {
      const data = Buffer.alloc(16 * 16 * 4, 0xff);
      return nativeImage.createFromBitmap(data, { width: 16, height: 16 });
    }
    try {
      const size = image.getSize();
      if (size && size.width > 48 && typeof image.resize === 'function') {
        const small = image.resize({ width: 32, height: 32 });
        if (small && !small.isEmpty()) return small;
      }
    } catch (_err) {
      /* 줄이지 못하면 있는 그림을 그대로 쓴다. */
    }
    return image;
  }

  // 파일이나 바로가기를 다른 프로그램에 넘긴다.
  // 마우스를 누른 채로 부르므로, 운영체제가 그 손짓을 이어받아 놓는 곳까지 간다.
  // 휴지통은 여기 오지 않는다. 놓을 파일이 없기 때문이다.
  // 받은 쪽이 파일을 가져가 그 자리가 비면 박스에서도 뺀다. 다른 프로그램에 복사만 했으면 박스에 남긴다.
  // 바탕화면에 놓았으면 박스에 있던 것은 지운다. 복사로 두 벌이 되면 안 된다.
  function dragOut(contents, filePath) {
    if (!contents || typeof contents.startDrag !== 'function') return false;
    if (!canDragOut(filePath)) return false;
    hideGhost();
    clearHover();
    const deskDir = desktopFolder();
    const before = namesIn(deskDir);
    try {
      contents.startDrag({
        file: path.resolve(filePath),
        icon: dragIconFor(filePath),
      });
    } catch (_err) {
      return false;
    }
    let still = true;
    try {
      still = fs.existsSync(filePath);
    } catch (_err) {
      still = false;
    }
    if (!still) {
      // 나간 것은 그 파일 하나다. 바로가기도 파일이므로, 그것이 가리키는 다른 파일은
      // 건드리지 않는다. 끌어다 놓기는 끌어 온 그 파일만 옮긴다.
      takeOut(filePath);
      persist();
      Promise.resolve(pushAll()).catch(() => {});
      refreshIcons();
      return true;
    }
    // 탐색기는 파일을 옮기지 않고 바로가기만 만들어 두기도 한다.
    // 그것은 옮긴 것이 아니므로, 그 바로가기를 치우고 파일 자체를 꺼낸다.
    const fresh = freshLinks(filePath, deskDir, before);
    if (fresh.length) return dropLinksAndRelease(filePath, fresh, deskDir, before);
    // 다른 박스의 휴지통 위에 놓으면 버린다. 끌어 내기는 운영체제가 이어받으므로
    // 손을 뗀 자리를 여기서 다시 본다. 보지 않으면 휴지통이 그 파일을 받지 못한다.
    const landed = landOnBox(filePath);
    if (landed) return landed;
    if (droppedOnDesktop()) releaseToDesktop(filePath, deskDir, before);
    return true;
  }

  // 손을 뗀 곳이 박스 안이다. 휴지통이면 버리고, 다른 박스의 빈 자리면 그 박스로 옮긴다.
  // 휴지통에 같은 이름이 이미 있어도 버린다. 윈도우는 그것을 다른 항목으로 따로 둔다.
  function landOnBox(filePath) {
    const at = cursorDip();
    if (!at) return null;
    const landed = hit(at.x, at.y);
    if (!landed) return null;
    const into = receiverAt(landed, at.x, at.y, filePath);
    const owner = ownerOf(filePath);
    if (into && into !== filePath) {
      return sendInto(filePath, into).then((done) => {
        if (done === 'moved') {
          takeOut(filePath);
          persist();
          return pushAll().then(() => {
            refreshIcons();
            return true;
          });
        }
        if (done) return true;
        if (!owner || owner.id === landed.id) return true;
        return dropFiles(landed.id, [filePath]).then(() => true);
      });
    }
    if (owner && owner.id === landed.id) return true;
    return dropFiles(landed.id, [filePath]).then(() => true);
  }

  // 탐색기가 파일을 옮기지 않고 바로가기만 만들어 두었다.
  //
  // 그 바로가기를 치우고 파일 자체를 바탕화면으로 꺼낸다. 묻지 않는다.
  // 끌어다 놓기는 옮기는 일이므로, 바탕화면으로 끌어 냈으면 파일이 거기에 있어야 한다.
  // 앞서는 '바로가기만 대체' 와 '새로 만들기' 를 물었다. 사람은 파일을 옮기려고 끌었을
  // 뿐인데, 무엇을 고르라는 것인지 알기 어려운 물음이었다.
  async function dropLinksAndRelease(filePath, fresh, deskDir, before) {
    for (const full of fresh) {
      try {
        fs.rmSync(full, { force: true });
      } catch (_err) {
        /* 바로가기를 못 지워도 항목은 꺼낸다. */
      }
    }
    releaseToDesktop(filePath, deskDir, before);
    return true;
  }

  function namesIn(dir) {
    if (!dir) return null;
    try {
      return new Set(fs.readdirSync(dir).map((name) => name.toLowerCase()));
    } catch (_err) {
      return null;
    }
  }

  function cursorDip() {
    try {
      const pos = screen.getCursorScreenPoint();
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return { x: pos.x, y: pos.y };
    } catch (_err) {
      /* 자리를 모르면 담기 전 자리에 둔다. */
    }
    return null;
  }

  // 손을 뗀 곳이 바탕화면인가. 모르면 다른 프로그램에 놓은 것으로 둔다.
  function droppedOnDesktop() {
    if (typeof desktop.onDesktop !== 'function') return false;
    const pos = cursorDip();
    if (!pos) return false;
    try {
      return !!desktop.onDesktop(pos, ownHandles());
    } catch (_err) {
      return false;
    }
  }

  // 바탕화면에 놓인 것이다. 박스 폴더에 남은 파일은 지운다.
  // 탐색기가 이미 같은 이름으로 복사해 두었으면 그 복사를 남기고 박스 쪽만 지운다.
  function releaseToDesktop(filePath, deskDir, before) {
    const owner = ownerOf(filePath);
    if (!owner) return;
    const base = path.basename(filePath);
    const landed = deskDir ? path.join(deskDir, base) : '';
    let copied = false;
    try {
      copied = !!before && !!landed && !before.has(base.toLowerCase())
        && !samePath(landed, filePath) && fs.existsSync(landed);
    } catch (_err) {
      copied = false;
    }
    if (copied) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (_err) {
        return;
      }
      try {
        if (fs.existsSync(filePath)) return;
      } catch (_err) {
        return;
      }
      takeOut(filePath);
      persist();
      Promise.resolve(pushAll()).catch(() => {});
      refreshIcons();
      return;
    }
    dropFreshLinks(deskDir, filePath, before);
    Promise.resolve(eject(owner.id, filePath, cursorDip())).catch(() => {});
  }

  // 끌어 내는 동안 바탕화면에 새로 생긴, 이 파일을 가리키는 바로가기.
  function freshLinks(filePath, dir, before) {
    if (!dir || !before || !filePath) return [];
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch (_err) {
      return [];
    }
    const found = [];
    for (const name of names) {
      if (before.has(name.toLowerCase()) || !/\.lnk$/i.test(name)) continue;
      const full = path.join(dir, name);
      if (pointsAt(full, filePath)) found.push(full);
    }
    return found;
  }

  function pointsAt(lnkPath, filePath) {
    const link = shortcutLink(lnkPath);
    if (!link || !link.target) return false;
    if (samePath(link.target, filePath)) return true;
    try {
      return samePath(fs.realpathSync(link.target), fs.realpathSync(filePath));
    } catch (_err) {
      return false;
    }
  }

  // 탐색기가 박스 파일을 가리키는 바로가기를 바탕화면에 만든 것은 지운다.
  // 그대로 두면 꺼낸 파일과 바로가기가 둘 다 남는다.
  function dropFreshLinks(dir, filePath, before) {
    if (!dir || !before) return;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch (_err) {
      return;
    }
    for (const name of names) {
      if (before.has(name.toLowerCase()) || !/\.lnk$/i.test(name)) continue;
      const full = path.join(dir, name);
      const link = shortcutLink(full);
      if (!link || !samePath(link.target, filePath)) continue;
      try {
        fs.rmSync(full, { force: true });
      } catch (_err) {
        /* 바로가기를 못 지워도 파일은 꺼낸다. */
      }
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
  const PREFS_W = 380;
  const PREFS_H = 479;
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
    const skip = new Set(Array.isArray(filePath) ? filePath : [filePath].filter(Boolean));
    const without = fence.items.filter((item) => !skip.has(item.path));
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

  // 바탕화면에서 끌어다 놓았다. 여러 개를 골라 끌었으면 그 모두가 함께 온다.
  // 하나만 온 예전 모양(항목 하나)도 그대로 받는다.
  async function acceptDesktopDrop(entries, dip) {
    if (!dip) return;
    const list = (Array.isArray(entries) ? entries : [entries]).filter((one) => one && one.path);
    if (!list.length) return;
    const target = hit(dip.x, dip.y);
    if (!target) return;
    // 그 박스가 이미 들고 있는 것은 옮길 것이 없다.
    const held = new Set(target.items.map((entry) => entry.path));
    const coming = list.filter((one) => !held.has(one.path));
    if (!coming.length) return;
    const paths = coming.map((one) => one.path);
    // 바탕화면에서 끌어 온 것도 박스 안 항목 위에 놓을 수 있어야 한다.
    // 휴지통이면 버리고, 폴더면 그 안으로, 프로그램이면 그것에게 넘긴다.
    // 여러 개를 놓아도 겨눈 자리는 하나다. 커서 아래의 그림으로 고른다.
    const into = receiverAt(target, dip.x, dip.y, paths[0]);
    const index = indexAt(target, dip.x, dip.y, paths);
    await dropFiles(target.id, coming, index, into);
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

  // 폴더를 그 폴더 안(또는 그 자신)으로 옮기면 운영체제가 거절한다.
  function nestedIn(parent, child) {
    const from = path.resolve(parent);
    const to = path.resolve(child);
    const left = process.platform === 'win32' ? from.toLowerCase() : from;
    const right = process.platform === 'win32' ? to.toLowerCase() : to;
    if (right === left) return true;
    const prefix = left.endsWith(path.sep) ? left : `${left}${path.sep}`;
    return right.startsWith(prefix);
  }

  async function moveInto(filePath, dir) {
    const dest = path.join(dir, path.basename(filePath));
    if (nestedIn(filePath, dir) || nestedIn(filePath, dest)) return false;
    try {
      if (fs.existsSync(dest)) return false;
    } catch (_err) {
      return false;
    }
    try {
      await fs.promises.rename(filePath, dest);
      return true;
    } catch (err) {
      // 드라이브가 다르면 이름 바꾸기가 EXDEV 로 거절된다.
      // 파일만 복사하면 폴더를 넣을 때 여기서 예외가 나 앱이 죽는다.
      if (!err || err.code !== 'EXDEV') return false;
    }
    try {
      await fs.promises.cp(filePath, dest, { recursive: true });
      await fs.promises.rm(filePath, { recursive: true, force: true });
      return true;
    } catch (_err) {
      try {
        await fs.promises.rm(dest, { recursive: true, force: true });
      } catch (_clean) {
        /* 반쯤 복사된 것은 치우되, 치우지 못해도 앱은 살아 있어야 한다. */
      }
      return false;
    }
  }

  // 아래 항목이 무엇이냐에 따라 갈린다. 어느 쪽이든 옮기는 일이다.
  //  - 폴더, 폴더를 가리키는 바로가기 : 그 안으로 옮긴다
  //  - 휴지통 : 버린다
  //  - 그 밖의 항목 : 받지 않는다. 부른 쪽이 그 박스로 옮겨 담는다
  //
  // moved 면 옮겼으므로 박스에서 빠진다. 빈 값이면 아무것도 하지 않았다.
  async function sendInto(filePath, intoPath) {
    if (!filePath || !intoPath || filePath === intoPath) return '';
    try {
      if (deliver.isRecycle(intoPath)) {
        // 같은 이름이 휴지통에 이미 있어도 버린다. 있던 것을 바꾸지 않고 따로 넣는다.
        await throwAway(filePath);
        return 'moved';
      }
      if (isDirectory(intoPath)) {
        return (await moveInto(filePath, intoPath)) ? 'moved' : '';
      }
      const link = shortcutLink(intoPath);
      if (link && isDirectory(link.target)) {
        return (await moveInto(filePath, link.target)) ? 'moved' : '';
      }
      // 폴더도 휴지통도 아니면 받아 줄 것이 없다. 부른 쪽이 그 박스로 옮겨 담는다.
      // 끌어다 놓기는 옮기는 일이므로, 어떤 항목 위에 놓아도 프로그램을 띄우지 않는다.
      return '';
    } catch (_err) {
      // 휴지통이 거절하거나 옮기기가 실패해도 앱은 계속 떠 있어야 한다.
      return 'failed';
    }
  }

  // 담지 못한 파일을 알린다. 다른 프로그램이 그 파일을 쓰고 있다는 뜻이다.
  //
  // 말없이 넘어가면 어떤 파일은 들어가고 어떤 파일은 안 들어가는 것으로 보인다.
  // 열어 둔 문서(.pptx, .docx 등)가 이 길로 온다. 파일 종류와는 상관이 없다.
  function tellBusy(paths) {
    if (typeof ask.notice !== 'function' || !paths.length) return;
    const title = paths.length === 1
      ? say('dialog.busy', { name: path.basename(paths[0]) })
      : say('dialog.busyMany', { n: paths.length });
    Promise.resolve(ask.notice({
      title,
      detail: say('dialog.busyDetail'),
      confirm: say('settings.ok'),
      icon: icons.menu('remove'),
    })).catch(() => {});
  }

  // 휴지통으로 보낸다. 같은 이름이 이미 있어도 묻지 않고, 각각 다른 항목으로 남긴다.
  async function throwAway(filePath) {
    if (typeof desktop.discardFile === 'function') {
      try {
        if (await desktop.discardFile(filePath)) return;
      } catch (_err) {
        /* 따로 버리지 못하면 아래의 보통 길로 보낸다. */
      }
    }
    await shell.trashItem(filePath);
  }

  function takeOut(filePath) {
    for (const fence of state.fences) {
      fence.items = fence.items.filter((item) => item.path !== filePath);
    }
  }

  async function dropFiles(id, filePaths, index, intoPath) {
    // 실제로 받아 간 원래 자리. 잘라 붙이기가 클립보드를 비울지 이것으로 정한다.
    const accepted = [];
    if (intoPath) {
      let changed = false;
      let handled = false;
      for (const entry of filePaths || []) {
        const item = toItem(entry);
        if (!item) continue;
        const done = await sendInto(item.path, intoPath);
        if (done === 'moved') {
          takeOut(item.path);
          accepted.push(item.path);
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
      if (handled) return accepted;
    }
    const fence = fenceById(id);
    if (!fence) return;
    const incoming = [];
    // 다른 프로그램이 붙잡고 있어 옮기지 못한 것. 다 해 본 뒤에 한 번만 알린다.
    const busy = [];
    for (const entry of filePaths) {
      const item = toItem(entry);
      if (!item) continue;
      // 담는다는 것은 그 박스의 폴더로 옮긴다는 뜻이다.
      // 휴지통 같은 셸 항목은 파일이 아니므로 목록에만 담는다.
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        incoming.push(item);
        accepted.push(item.path);
        continue;
      }
      // 옮기는 일은 대체가 아니다. 그래서 묻지 않는다.
      //
      // 한 항목은 바탕화면과 박스 가운데 한 곳에만 있다. 끌어다 놓기는 그 하나를
      // 이쪽에서 저쪽으로 옮기는 것이므로, 대체할 짝이 애초에 없다.
      // 그런데도 물으면, 하나뿐인 것을 두고 무엇을 버릴지 묻는 것이 된다.
      // 이름이 같은 다른 파일이 박스 폴더에 있으면 hold.spareName 이 뒤에 번호를 붙인다.
      // 어느 것도 버리지 않는다. 대체는 '새로 만들 때' 만 묻는다(offerReplace).
      const got = bringIn(fence, item);
      if (got.item) {
        incoming.push({ ...got.item, from: item.path });
        accepted.push(item.path);
      } else if (got.stuck) {
        // 옮기지 못했다. 담은 것처럼 보이면서 파일은 그 자리에 남는 일은 없어야 한다.
        // 왜 안 들어갔는지 모르면 파일 종류에 따라 되고 안 되는 것처럼 보인다.
        busy.push(item.path);
      }
    }
    if (busy.length) tellBusy(busy);
    if (!incoming.length) return accepted;
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
    return accepted;
  }

  // 복사해서 담는다. 원래 파일은 그 자리에 남는다.
  // 끌어서 놓기는 옮기는 일이고, 붙여넣기의 복사는 이 길이다.
  function copyInto(fence, item) {
    if (!item || !item.path) return null;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return null;
    const from = String(item.path);
    try {
      const stat = fs.statSync(from);
      if (!stat.isFile() && !stat.isDirectory()) return null;
    } catch (_err) {
      return null;
    }
    const dir = hold.dirFor(fence);
    if (!dir) return null;
    const dest = hold.spareName(dir, path.basename(from));
    try {
      fs.cpSync(from, dest, { recursive: true });
    } catch (_err) {
      return null;
    }
    // 박스 안에서 온 복사는 그 박스 폴더를 집으로 적으면 안 된다.
    // 꺼낼 때 바탕화면이 아니라 그 폴더로 돌아가 버린다.
    const home = item.home
      || (hold.inside(from) ? (hold.noted(from) || desktopFolder()) : path.dirname(from));
    refreshFolders(path.dirname(dest));
    return { name: path.basename(dest), path: dest, home };
  }

  // 클립보드에 올릴 수 있는 항목. 휴지통 같은 셸 항목은 파일이 아니다.
  function clipTarget(id, filePath) {
    const fence = fenceById(id);
    if (!fence || !filePath) return null;
    const item = fence.items.find((entry) => entry.path === filePath);
    if (!item) return null;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) return null;
    try {
      if (!fs.existsSync(item.path)) return null;
    } catch (_err) {
      return null;
    }
    return item;
  }

  // 하나여도 되고 여러 개여도 된다. 휴지통 같은 셸 항목은 빠진다.
  function clipPaths(id, filePath) {
    const list = Array.isArray(filePath) ? filePath : [filePath];
    const paths = [];
    for (const one of list) {
      const item = clipTarget(id, one);
      if (item) paths.push(item.path);
    }
    return paths;
  }

  function copyItem(id, filePath) {
    const paths = clipPaths(id, filePath);
    if (!paths.length) return false;
    return clipfiles.write(paths, clipfiles.COPY);
  }

  function cutItem(id, filePath) {
    const paths = clipPaths(id, filePath);
    if (!paths.length) return false;
    return clipfiles.write(paths, clipfiles.MOVE);
  }

  // 박스에 적어 둔 항목이면 집(담기 전 폴더)을 함께 가져온다.
  // 클립보드에는 경로만 있으므로, 그대로 담으면 집을 잃는다.
  function remembered(filePath) {
    for (const fence of state.fences) {
      const found = fence.items.find((entry) => samePath(entry.path, filePath));
      if (found) return found;
    }
    return toItem(filePath);
  }

  // 클립보드의 파일을 이 박스에 붙인다.
  // 복사는 원본을 두고 하나 더 만들고, 잘라내기는 원본을 박스 폴더로 옮긴 뒤 클립보드를 비운다.
  // 잘라내기를 비우지 않으면 다음 붙여넣기가 이미 없는 파일을 또 옮기려 한다.
  async function pasteFiles(id) {
    const clip = clipfiles.read();
    if (!clip || !clip.paths.length) return false;
    const fence = fenceById(id);
    if (!fence) return false;
    if (clip.cut) {
      const taken = new Set(await dropFiles(id, clip.paths) || []);
      const left = clip.paths.filter((filePath) => !taken.has(filePath));
      if (!left.length) clipfiles.clear();
      else if (left.length !== clip.paths.length) clipfiles.write(left, clipfiles.MOVE);
      return taken.size > 0;
    }
    const incoming = [];
    for (const filePath of clip.paths) {
      const item = remembered(filePath);
      if (!item) continue;
      if (!(await clearClash(fence, item.path))) continue;
      const copied = copyInto(fence, item);
      if (copied) incoming.push(copied);
    }
    if (!incoming.length) return false;
    fence.items.push(...incoming);
    persist();
    await pushAll();
    refreshIcons();
    return true;
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

  // 복사해서 새로 만들 때 쓴다. 옮기는 길(dropFiles)은 여기 오지 않는다.
  //
  // 붙여넣기의 복사는 항목을 하나 더 만드는 일이다. 박스에 같은 이름이 이미 있으면
  // 대체할지 묻는다. 대체하겠다면 박스에 있던 것을 휴지통으로 보내 자리를 비우고,
  // 그대로 두겠다면 만들지 않는다. 원본은 있던 자리에 그대로 남는다.
  async function clearClash(fence, filePath) {
    const older = hold.clash(fence, filePath);
    if (!older) return true;
    const yes = await askReplace(fence, path.basename(String(filePath)));
    if (!yes) return false;
    try {
      await throwAway(older);
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
        await throwAway(dest);
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

  // 지우기 전에 묻는다. 휴지통으로 보내는 길은 확인 창을 띄우지 않으므로 여기서 묻는다.
  async function askDelete(list) {
    if (typeof ask.confirm !== 'function' || !list.length) return false;
    const title = list.length === 1
      ? say('dialog.trash', { name: list[0].name || path.basename(list[0].path) })
      : say('dialog.trashMany', { n: list.length });
    asking = true;
    try {
      return await ask.confirm({
        title,
        detail: say('dialog.trashDetail'),
        confirm: say('dialog.delete'),
        cancel: say('dialog.cancel'),
        icon: icons.menu('remove'),
        danger: true,
      });
    } catch (_err) {
      return false;
    } finally {
      asking = false;
    }
  }

  // 박스 안에서 바로 지운다. 파일은 휴지통으로 간다.
  // 하나여도 되고 여러 개여도 된다. 지우기 전에 한 번 묻는다.
  // 휴지통 같은 셸 항목은 지울 파일이 없으므로 빼 둔다.
  async function trashItems(id, filePaths) {
    const fence = fenceById(id);
    if (!fence) return false;
    const list = [];
    for (const filePath of filePaths || []) {
      const item = fence.items.find((entry) => entry.path === filePath);
      if (!item) continue;
      if (desktop.isShellItem && desktop.isShellItem(item.path)) continue;
      list.push(item);
    }
    if (!list.length) return false;
    if (!(await askDelete(list))) return false;
    let changed = false;
    for (const item of list) {
      try {
        await throwAway(item.path);
      } catch (_err) {
        // 지우지 못한 것은 박스에 그대로 둔다.
        continue;
      }
      fence.items = fence.items.filter((entry) => entry.path !== item.path);
      changed = true;
    }
    if (!changed) return false;
    persist();
    await push(id);
    watchBin();
    return true;
  }

  async function trashItem(id, filePath) {
    return trashItems(id, [filePath]);
  }

  // 박스에서 꺼내면 파일이 담기 전 폴더(보통 바탕화면)로 돌아간다.
  // at 이 있으면 그 자리(끌어다 놓은 곳)에 아이콘을 둔다. 없으면 담기 전 자리다.
  // 파일은 목록에서 빼기 전에 먼저 옮긴다. 폴더에 남아 있으면 다시 담겨 버린다.
  // 꺼내는 것은 그 파일 하나다. 바로가기도 파일이므로, 그것이 가리키는 다른 파일은
  // 그 자리에 그대로 둔다. 바로가기는 박스 폴더 안의 파일을 계속 가리키며 잘 열린다.
  async function eject(id, filePath, at) {
    const fence = fenceById(id);
    if (!fence) return;
    const item = fence.items.find((entry) => entry.path === filePath);
    if (!item) return;
    // 돌려보내지 못했으면 박스에 그대로 둔다. 목록에서만 빼면 파일은 박스 폴더에
    // 남아 있는데 아무 데서도 보이지 않는다.
    if (!letGo(item, at)) return;
    fence.items = fence.items.filter((entry) => entry.path !== filePath);
    persist();
    await push(id);
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
  // 손을 뗐다. 어디에 놓았느냐에 따라 갈린다.
  //  - 같은 박스 안  : 차례만 바꾼다
  //  - 다른 박스 위  : 그 박스의 폴더로 옮긴다
  //  - 바탕화면      : 박스에서 빼 놓은 자리에 둔다
  // 함께 옮길 경로. 고른 묶음이 있으면 그 묶음이고, 없으면 끌어 온 하나다.
  function movingPaths(fromId, filePath, paths) {
    const wanted = (Array.isArray(paths) && paths.length ? paths : [filePath]).filter(Boolean);
    const fence = fenceById(fromId);
    if (!fence) return wanted;
    const have = new Set(fence.items.map((item) => item.path));
    const found = wanted.filter((one) => have.has(one));
    return found.length ? found : [filePath].filter(Boolean);
  }

  async function transfer(fromId, filePath, screenX, screenY, paths) {
    hideGhost();
    const moving = movingPaths(fromId, filePath, paths);
    // 받을 항목은 손을 뗀 자리에서 다시 잰다. 창이 알려 준 값을 그대로 믿으면
    // 제 창 안에서 끈 경우에만 맞고, 다른 박스로 건너간 경우에는 늘 비어 있다.
    const landed = hit(screenX, screenY);
    const intoPath = landed ? receiverAt(landed, screenX, screenY, filePath) : null;
    if (intoPath && !moving.some((one) => samePath(one, intoPath))) {
      let changed = false;
      let handled = false;
      for (const one of moving) {
        const done = await sendInto(one, intoPath);
        if (done === 'moved') {
          takeOut(one);
          changed = true;
        }
        if (done) handled = true;
      }
      if (changed) {
        persist();
        await pushAll();
        refreshIcons();
      }
      clearHover();
      if (handled) return;
    }
    const target = hit(screenX, screenY);
    clearHover();
    if (!target) {
      const at = releaseOnDesktop(screenX, screenY) ? { x: screenX, y: screenY } : null;
      for (const one of moving) await eject(fromId, one, at);
      return;
    }
    const index = indexAt(target, screenX, screenY, moving);
    if (target.id === fromId) await reorderMany(fromId, moving, index);
    else await dropFiles(target.id, moving, index);
  }

  // 고른 여러 개를 그 자리로 한데 옮긴다.
  async function reorderMany(id, paths, index) {
    const fence = fenceById(id);
    if (!fence) return;
    const held = [];
    for (const filePath of paths) {
      const at = fence.items.findIndex((item) => item.path === filePath);
      if (at < 0) continue;
      held.push(fence.items.splice(at, 1)[0]);
    }
    if (!held.length) return;
    const at = Math.max(0, Math.min(index == null ? fence.items.length : index, fence.items.length));
    fence.items.splice(at, 0, ...held);
    persist();
    await push(id);
  }

  // 담는다는 것은 그 파일을 이 박스의 폴더로 옮긴다는 뜻이다.
  // 옮기고 나면 바탕화면 폴더에서 빠지므로 탐색기가 그 아이콘을 더 그리지 않는다.
  // 담기 전에 있던 폴더는 함께 적어 둔다. 꺼내거나 끝낼 때 그 자리로 돌려준다.
  // 옮기지 못했을 때(stuck) 어떻게 할지는 부르는 쪽이 정한다.
  //
  //  - 새로 담는 길(dropFiles) : 담지 않는다(keepStuck 없음).
  //    담은 것처럼 목록에 넣으면 파일은 바탕화면에 그대로 있으면서 박스에도 보인다.
  //    한 항목이 두 곳에 있는 것처럼 되고, 옮겼는데도 남아 있는 것처럼 보인다.
  //  - 이미 들고 있던 것을 폴더와 맞추는 길(settleBox) : 그대로 들고 있는다(keepStuck).
  //    보관함을 쓸 수 없는 잠깐 동안 목록에서 빼 버리면 사람이 놓아 둔 차례를 잃는다.
  // 담은 결과를 { item, stuck } 으로 돌려준다.
  //  item  : 담긴 항목. 없으면 담지 않았다.
  //  stuck : 다른 프로그램이 붙잡고 있어 옮기지 못했다. 부른 쪽이 사람에게 알린다.
  function bringIn(fence, item, keepStuck) {
    const moved = hold.take(fence, item);
    if (!moved) return { item: null, stuck: false };
    if (moved.stuck) {
      if (!keepStuck) return { item: null, stuck: true };
      return { item: { name: item.name, path: item.path, home: item.home }, stuck: true };
    }
    if (moved.path !== item.path) refreshFolders(path.dirname(item.path), path.dirname(moved.path));
    return { item: moved, stuck: false };
  }

  // 꺼낸다. 파일을 담기 전 폴더로 돌려보낸다.
  // at 이 있으면 끌어다 놓은 자리에, 없으면 담기 전 자리에 아이콘을 둔다.
  function letGo(item, at) {
    if (!item) return false;
    if (desktop.isShellItem && desktop.isShellItem(item.path)) {
      if (at && putIconAt(item.name, at)) return true;
      return putIconHome(item.name);
    }
    // 담는 동안 감춰 두었던 파일이면 속성을 먼저 되돌린다.
    // 숨긴 채로 내보내면 파일은 바탕화면에 있는데 아이콘이 없다.
    // 꺼낸 것은 반드시 눈에 보여야 한다.
    if (typeof desktop.revealFile === 'function') {
      try {
        desktop.revealFile(item.path);
      } catch (_err) {
        /* 속성을 못 되돌려도 파일은 내보낸다. */
      }
    }
    const back = hold.give(item);
    if (!back || back === item.path) return false;
    refreshFolders(path.dirname(item.path), path.dirname(back));
    const name = path.basename(back);
    if (at && putIconAt(name, at)) return true;
    putIconHome(name);
    return true;
  }

  function putIconAt(name, at) {
    if (!name || !at || typeof desktop.putAt !== 'function') return false;
    try {
      return !!desktop.putAt(name, at);
    } catch (_err) {
      return false;
    }
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
      const got = bringIn(fence, item, true);
      if (got.item) {
        kept.push(got.item);
        if (!got.stuck) inFolder.delete(path.basename(got.item.path));
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
        // 파일은 바탕화면으로 돌려보내되, 어느 박스의 무엇이었는지는 남긴다.
        // 다음 실행이 그 목록으로 박스를 다시 채운다.
        fence.items = parkBox(fence);
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

  // 담긴 파일을 담기 전 폴더로 돌려보내고, 다시 담을 목록은 남긴다.
  // 박스를 지우거나 사람이 모두 돌려준 경우에는 쓰지 않는다. 그때는 비우는 것이 맞다.
  function parkBox(fence) {
    const kept = [];
    const names = [];
    for (const item of fence.items) {
      if (desktop.isShellItem && desktop.isShellItem(item.path)) {
        kept.push(item);
        if (item.name) names.push(item.name);
        continue;
      }
      const back = hold.give(item);
      if (!back) continue;
      const home = item.home || path.dirname(back);
      kept.push({ name: path.basename(back), path: back, home });
      names.push(path.basename(back));
      if (back !== item.path) refreshFolders(path.dirname(item.path), path.dirname(back));
    }
    hold.drop(fence);
    if (names.length && typeof desktop.putHome === 'function') desktop.putHome(names);
    return kept;
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
  function holderOf(name) {
    for (const fence of state.fences) {
      for (const item of fence.items) {
        if (desktop.isShellItem && desktop.isShellItem(item.path)) continue;
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
      if (holderOf(path.basename(at))) freshQueue.push(at);
    }
    seenOnDesk = keys;
  }

  // 미뤄 둔 물음을 하나씩 푼다. 다른 물음이 떠 있으면 다음 기회에 다시 온다.
  function drainFresh() {
    if (draining || asking || closing || !freshQueue.length) return;
    draining = true;
    (async () => {
      try {
        while (freshQueue.length && !closing) {
          await offerReplace(freshQueue.shift());
        }
      } finally {
        draining = false;
      }
    })();
  }

  // 새로 만든 것 하나. 대체할지 그대로 둘지 묻고, 대체하겠다면 박스로 옮긴다.
  async function offerReplace(filePath) {
    const name = path.basename(String(filePath || ''));
    const found = holderOf(name);
    if (!found) return false;
    try {
      if (!fs.existsSync(filePath)) return false;
      // 박스가 들고 있다고 적혀 있어도 그 파일이 없으면 부딪힐 것이 없다.
      // 새로 생긴 것 하나뿐이므로 대체할 것도 없다. 묻지 않는다.
      if (!fs.existsSync(found.item.path)) return false;
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
      await throwAway(older.path);
    } catch (_err) {
      // 지우지 못했으면 아무것도 하지 않는다. 새로 만든 것은 바탕화면에 그대로 있다.
      return false;
    }
    takeOut(older.path);
    watchBin();
    await dropFiles(fence.id, [filePath], at < 0 ? fence.items.length : at);
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
    // 박스를 폴더와 먼저 맞춘다. 그런 다음에 바탕화면에 새로 생긴 것을 본다.
    //
    // 차례가 거꾸로면, 박스 폴더에서 바탕화면으로 옮겨 온 파일을 두고 대체할지 묻는다.
    // 그 파일은 박스에서 이미 빠져 나온 그 파일 하나뿐인데, 맞추기 전의 묵은 목록에는
    // 아직 박스가 들고 있는 것으로 적혀 있어 부딪히는 것처럼 보인다.
    const changed = settleAll();
    watchFresh();
    drainFresh();
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

  // ── 속성 ──────────────────────────────────────────────────
  //
  // 아이콘의 '속성'. 탐색기의 속성 대화상자를 부르지 않는다. 셸 대화상자는
  // 늘 위에 있는 박스 뒤로 숨고, 세 운영체제에서 모양이 저마다 다르다.
  // 무엇을 적을지는 여기서 다 정해 줄로 만들어 넘긴다(props.js 는 그리기만 한다).

  // 폴더를 따라 내려가 크기를 잴 때의 한도. 아주 큰 폴더에서 창이 늦게 뜨지
  // 않게 한다. 한도에 닿으면 잰 값에 '이상'을 붙여 정직하게 적는다.
  const WALK_ENTRIES = 40000;
  const WALK_MS = 1200;

  function locale() {
    return state.settings.lang === 'en' ? 'en-US' : 'ko-KR';
  }

  function sizeText(bytes, capped) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let unit = 0;
    while (n >= 1024 && unit < units.length - 1) {
      n /= 1024;
      unit += 1;
    }
    const exact = say('props.bytes', { n: bytes.toLocaleString(locale()) });
    // 1024 바이트가 안 되면 바이트 수만으로 충분하다. 두 번 적지 않는다.
    const text = unit === 0 ? exact : `${n.toFixed(n < 10 ? 1 : 0)} ${units[unit]} (${exact})`;
    return capped ? say('props.atLeast', { size: text }) : text;
  }

  function whenText(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString(locale());
    } catch (_err) {
      return '';
    }
  }

  // 폴더 하나를 따라 내려가 크기와 개수를 잰다. 심볼릭 링크는 따라가지 않는다.
  // 같은 곳을 두 번 세거나 링크 고리를 끝없이 도는 일을 막는다.
  function walk(root, budget) {
    const out = { bytes: 0, files: 0, dirs: 0 };
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_err) {
        continue;   // 열 수 없는 폴더는 건너뛴다
      }
      for (const entry of entries) {
        // 한도는 항목 하나마다 본다. 폴더 경계에서만 보면 파일이 십만 개 든
        // 폴더 하나를 끝까지 세고 만다.
        if (budget.entries <= 0 || Date.now() > budget.until) {
          budget.capped = true;
          return out;
        }
        budget.entries -= 1;
        if (entry.isSymbolicLink()) {
          out.files += 1;
          continue;
        }
        if (entry.isDirectory()) {
          out.dirs += 1;
          stack.push(path.join(dir, entry.name));
          continue;
        }
        out.files += 1;
        try {
          out.bytes += fs.statSync(path.join(dir, entry.name)).size;
        } catch (_err) {
          /* 잴 수 없는 파일은 0 으로 둔다 */
        }
      }
    }
    return out;
  }

  // 파일 하나든 폴더 하나든 크기와 안의 개수를 같은 모양으로 돌려준다.
  function measure(filePath, budget) {
    let stat = null;
    try {
      stat = fs.statSync(filePath);
    } catch (_err) {
      return null;
    }
    if (!stat.isDirectory()) return { stat, bytes: stat.size, files: 1, dirs: 0, folder: false };
    const inside = walk(filePath, budget);
    return { stat, bytes: inside.bytes, files: inside.files, dirs: inside.dirs, folder: true };
  }

  function kindText(filePath, folder) {
    if (desktop.isShellItem && desktop.isShellItem(filePath)) return say('props.system');
    if (deliver.isShortcut(filePath)) return say('props.shortcut');
    if (folder) return say('props.folder');
    const ext = path.extname(filePath);
    return ext ? say('props.extFile', { ext: ext.slice(1).toUpperCase() }) : say('props.plainFile');
  }

  // 여럿을 고른 채 그중 하나를 누르면 그 묶음 전체를 잰다. 탐색기와 같다.
  function groupRows(id, group, budget) {
    const fence = fenceById(id);
    let bytes = 0;
    let files = 0;
    let dirs = 0;
    for (const one of group) {
      if (desktop.isShellItem && desktop.isShellItem(one)) continue;
      const found = measure(one, budget);
      if (!found) continue;
      bytes += found.bytes;
      // 고른 것 자체도 하나로 센다. 폴더는 그 안의 것까지 더한다.
      if (found.folder) {
        dirs += 1 + found.dirs;
        files += found.files;
      } else {
        files += 1;
      }
    }
    const kinds = new Set(group.map((one) => kindText(one, isDirectory(one))));
    return {
      title: say('props.many', { n: group.length }),
      kind: kinds.size === 1 ? [...kinds][0] : say('props.manyKinds'),
      rows: [
        { label: say('props.box'), value: fence ? (fence.title || say('box.untitled')) : '' },
        { label: say('props.where'), value: path.dirname(group[0]), wide: true },
        { label: say('props.size'), value: sizeText(bytes, budget.capped) },
        { label: say('props.count'), value: say('props.inside', { files, dirs }) },
      ],
    };
  }

  function itemRows(id, filePath, budget) {
    const fence = fenceById(id);
    const boxName = fence ? (fence.title || say('box.untitled')) : '';
    const shellItem = !!(desktop.isShellItem && desktop.isShellItem(filePath));
    const name = path.basename(filePath);
    const label = labelFor({ path: filePath, name }) || name;
    const rows = [];

    // 셸 항목(휴지통 따위)에는 잴 파일이 없다. 아는 것만 적는다.
    if (shellItem) {
      rows.push({ label: say('props.box'), value: boxName });
      rows.push({ label: say('props.where'), value: filePath, wide: true });
      if (deliver.isRecycle(filePath) && typeof desktop.recycleCount === 'function') {
        const left = desktop.recycleCount();
        if (left >= 0) rows.push({ label: say('props.count'), value: say('props.many', { n: left }) });
      }
      return { title: label, kind: say('props.system'), rows };
    }

    const found = measure(filePath, budget);
    const kind = kindText(filePath, !!(found && found.folder));
    if (label !== name) rows.push({ label: say('props.file'), value: name, wide: true });
    rows.push({ label: say('props.box'), value: boxName });
    rows.push({ label: say('props.where'), value: path.dirname(filePath), wide: true });

    const link = shortcutLink(filePath);
    if (link) rows.push({ label: say('props.target'), value: link.target, wide: true });

    if (!found) {
      // 박스에 담긴 뒤 바깥에서 지워진 항목. 다음 훑기에서 아이콘이 사라진다.
      return { title: label, kind: `${kind} · ${say('props.gone')}`, rows };
    }

    rows.push({ label: say('props.size'), value: sizeText(found.bytes, budget.capped) });
    if (found.folder) rows.push({ label: say('props.count'), value: say('props.inside', { files: found.files, dirs: found.dirs }) });

    const made = whenText(found.stat.birthtimeMs || found.stat.birthtime);
    if (made) rows.push({ label: say('props.made'), value: made });
    rows.push({ label: say('props.changed'), value: whenText(found.stat.mtimeMs || found.stat.mtime) });
    rows.push({ label: say('props.used'), value: whenText(found.stat.atimeMs || found.stat.atime) });

    const attrs = [];
    // 윈도우의 읽기 전용 특성은 노드가 쓰기 비트로 옮겨 준다.
    if (!(found.stat.mode & 0o200)) attrs.push(say('props.readonly'));
    try {
      if (fs.lstatSync(filePath).isSymbolicLink()) attrs.push(say('props.link'));
    } catch (_err) {
      /* 링크인지 알 수 없으면 적지 않는다 */
    }
    rows.push({ label: say('props.attrs'), value: attrs.length ? attrs.join(' · ') : say('props.none') });

    return { title: label, kind, rows };
  }

  // limits 는 폴더를 얼마나 따라 내려갈지다. 메뉴는 넘기지 않고 위의 한도를 쓴다.
  // 검사에서 한도에 닿는 경우를 좁은 한도로 흉내 낼 수 있게 열어 둔다.
  async function showProps(id, filePath, paths, limits) {
    if (!filePath || !fenceById(id)) return null;
    const group = Array.isArray(paths) && paths.length > 1 && paths.includes(filePath) ? paths : [filePath];
    const budget = {
      entries: (limits && limits.entries) || WALK_ENTRIES,
      until: Date.now() + ((limits && limits.ms) || WALK_MS),
      capped: false,
    };
    const shown = group.length > 1 ? groupRows(id, group, budget) : itemRows(id, filePath, budget);
    return props.show({
      // 같은 항목의 창을 두 번 열지 않는다. 묶음은 고른 것이 달라지면 다른 창이다.
      key: group.length > 1 ? `${id}:${[...group].sort().join('|')}` : filePath,
      title: shown.title,
      kind: shown.kind,
      rows: shown.rows,
      close: say('props.close'),
      icon: await iconOf(filePath),
    });
  }

  function showMenu(id, filePath, paths) {
    const fence = fenceById(id);
    const win = wins.get(id);
    if (!fence || !win || win.isDestroyed()) return;
    const template = [];
    // 여러 개를 고른 채 그중 하나를 누르면 그 묶음이 복사·잘라내기·삭제의 대상이다.
    const group = Array.isArray(paths) && paths.includes(filePath) ? paths : (filePath ? [filePath] : []);
    const clipable = group.some((one) => clipTarget(id, one));
    const deletable = group.some((one) => !(desktop.isShellItem && desktop.isShellItem(one)));
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
          label: say('menu.copy'),
          icon: icons.menu('copy'),
          accelerator: 'CommandOrControl+C',
          enabled: clipable,
          click: () => copyItem(id, group),
        },
        {
          label: say('menu.cut'),
          icon: icons.menu('cut'),
          accelerator: 'CommandOrControl+X',
          enabled: clipable,
          click: () => cutItem(id, group),
        },
        {
          label: say('menu.paste'),
          icon: icons.menu('paste'),
          accelerator: 'CommandOrControl+V',
          enabled: clipfiles.read().paths.length > 0,
          click: () => pasteFiles(id),
        },
        { type: 'separator' },
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
          enabled: deletable,
          click: () => trashItems(id, group),
        },
        {
          // 아이콘의 속성. 아래로는 박스 자체를 다루는 항목이 이어지므로
          // 항목에 딸린 것끼리 한데 모아 둔다.
          label: say('menu.props'),
          icon: icons.menu('info'),
          click: () => showProps(id, filePath, group),
        },
        { type: 'separator' }
      );
    }
    if (!filePath) {
      template.push(
        {
          label: say('menu.paste'),
          icon: icons.menu('paste'),
          accelerator: 'CommandOrControl+V',
          enabled: clipfiles.read().paths.length > 0,
          click: () => pasteFiles(id),
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
    clearPicks,
    hover,
    hoverIncoming,
    clearHover,
    overForeign,
    dragOut,
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
    showProps,
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
    trashItems,
    copyItem,
    cutItem,
    pasteFiles,
    eject,
    restyle,
    captured,
  };
}

module.exports = { createHost };
