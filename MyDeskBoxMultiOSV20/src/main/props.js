'use strict';

// 항목 속성 창. 아이콘을 오른쪽 단추로 눌러 고른 '속성'이 이 창을 연다.
//
// 운영체제의 속성 대화상자를 부르지 않는다. ask.js 와 같은 뜻이다 — 박스는
// 세 운영체제에서 같은 모양이어야 하고, 셸 대화상자는 박스 뒤로 숨는다.
//
// 무엇을 적을지는 부르는 쪽(fences.js)이 다 정해서 줄(rows)로 넘긴다.
// 이 파일과 창은 그 줄을 받아 그리기만 한다. 말과 언어는 한 곳에만 둔다.

const path = require('path');
const { BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const arrange = require('../shared/arrange');

const WIDTH = 408;
// 줄이 몇 개일지 모르니 넉넉히 잡았다가 창이 알려 준 높이로 줄인다.
const HEIGHT = 340;

// 같은 항목의 창을 두 번 열지 않는다. key -> { win, fit }
const open = new Map();
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  // 줄 높이에 맞춘 키를 창이 알려 준다. 그만큼만 남기고 줄인다.
  ipcMain.on('props:size', (_event, payload) => {
    const entry = open.get(payload && payload.key);
    if (entry) entry.fit(Number(payload.height) || 0);
  });
  ipcMain.on('props:close', (_event, key) => {
    const entry = open.get(key);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
  });
}

// 커서가 있는 화면 한가운데에 띄운다. ask.js 와 같은 자리다.
function middle(height) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const outer = {
    width: WIDTH + arrange.SHADOW * 2,
    height: Math.max(120, height) + arrange.SHADOW * 2,
  };
  return {
    x: Math.round(area.x + (area.width - outer.width) / 2),
    y: Math.round(area.y + (area.height - outer.height) / 2.4),
    width: outer.width,
    height: outer.height,
  };
}

function dataUrl(image) {
  try {
    if (!image || image.isEmpty()) return '';
    return image.toDataURL();
  } catch (_err) {
    return '';
  }
}

// info: { key, title, kind, icon, rows: [{ label, value, wide }], close }
function show(info) {
  install();
  const key = String(info && info.key ? info.key : 'props');
  const already = open.get(key);
  if (already && !already.win.isDestroyed()) {
    already.win.show();
    already.win.focus();
    return already.win;
  }

  const shown = {
    key,
    title: String(info.title || ''),
    kind: String(info.kind || ''),
    close: String(info.close || 'Close'),
    icon: info.icon ? dataUrl(info.icon) : '',
    rows: (info.rows || [])
      .filter((row) => row && row.label)
      .map((row) => ({ label: String(row.label), value: String(row.value == null ? '' : row.value), wide: !!row.wide })),
  };

  const win = new BrowserWindow({
    ...middle(HEIGHT),
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
    show: false,
    icon: nativeImage.createEmpty(),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let visible = false;
  const reveal = () => {
    if (visible || win.isDestroyed()) return;
    visible = true;
    win.show();
    win.focus();
  };
  const fit = (height) => {
    if (win.isDestroyed()) return;
    if (height > 0) win.setBounds(middle(height));
    reveal();
  };

  open.set(key, { win, fit });
  win.on('closed', () => {
    if (open.get(key) && open.get(key).win === win) open.delete(key);
  });
  // 높이를 알려 주지 못하더라도 창은 보여 준다.
  win.once('ready-to-show', () => setTimeout(reveal, 250));
  win.loadFile(path.join(__dirname, '../renderer/props.html'), {
    query: { props: JSON.stringify(shown) },
  });
  return win;
}

module.exports = { show, WIDTH, HEIGHT };
