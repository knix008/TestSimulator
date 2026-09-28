'use strict';

// 우리 모양으로 만든 묻는 창. 운영체제 기본 대화상자 대신 쓴다.
// confirm() 은 사용자가 고른 값을 약속(Promise)으로 돌려준다.

const path = require('path');
const { BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const arrange = require('../shared/arrange');

const WIDTH = 330;
// 글이 몇 줄일지 모르니 넉넉히 잡았다가 창 쪽에서 알려 준 높이로 줄인다.
const HEIGHT = 160;

const pending = new Map();
let installed = false;
let nextId = 1;

function install() {
  if (installed) return;
  installed = true;
  ipcMain.on('ask:answer', (_event, payload) => {
    const entry = pending.get(payload && payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    entry.settle(!!payload.ok);
  });
  // 글 길이에 맞춘 높이를 창이 알려 준다. 그만큼만 남기고 줄인다.
  ipcMain.on('ask:size', (_event, payload) => {
    const entry = pending.get(payload && payload.id);
    if (entry) entry.fit(Number(payload.height) || 0);
  });
}

// 커서가 있는 화면 한가운데에 띄운다.
function middle(height) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const outer = {
    width: WIDTH + arrange.SHADOW * 2,
    height: Math.max(90, height) + arrange.SHADOW * 2,
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

function confirm(options) {
  install();
  const id = `ask${nextId}`;
  nextId += 1;

  const ask = {
    id,
    title: String(options.title || ''),
    detail: String(options.detail || ''),
    confirm: String(options.confirm || 'OK'),
    cancel: String(options.cancel || 'Cancel'),
    danger: !!options.danger,
    lone: !!options.lone,
    icon: options.icon ? dataUrl(options.icon) : '',
  };

  return new Promise((resolve) => {
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

    let done = false;
    let shown = false;
    const settle = (value) => {
      if (done) return;
      done = true;
      pending.delete(id);
      if (!win.isDestroyed()) win.close();
      resolve(value);
    };

    const reveal = () => {
      if (shown || done || win.isDestroyed()) return;
      shown = true;
      win.show();
      win.focus();
    };

    const fit = (height) => {
      if (done || win.isDestroyed()) return;
      if (height > 0) win.setBounds(middle(height));
      reveal();
    };

    pending.set(id, { settle, fit });
    // 창을 그냥 닫으면 안 하겠다는 뜻이다.
    win.on('closed', () => settle(false));
    // 높이를 알려 주지 못하더라도 창은 보여 준다.
    win.once('ready-to-show', () => setTimeout(reveal, 250));
    win.loadFile(path.join(__dirname, '../renderer/ask.html'), {
      query: { ask: JSON.stringify(ask) },
    });
  });
}

// 단추가 하나뿐인 알림. 프로그램 정보처럼 고를 것이 없을 때 쓴다.
function notice(options) {
  return confirm({ ...options, lone: true, cancel: '' });
}

module.exports = { confirm, notice, WIDTH, HEIGHT };
