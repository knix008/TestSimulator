/*
 * electron/main.js - 데스크톱(Windows · macOS · Linux) 진입점
 *
 * 화면은 웹판과 완전히 같은 dist 를 읽는다.
 * 여기서는 창을 띄우고 파일 열기/저장 대화상자만 맡는다.
 * 메뉴 막대는 두지 않는다 - 명령은 모두 툴바와 단축키에 있다.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWindowResize } from './windowResize.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_URL);

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 420,      /* 툴바 11개 버튼이 잘리지 않는 최소 폭 */
    minHeight: 560,
    title: '천지인 한글 입력기',
    autoHideMenuBar: true,
    backgroundColor: '#F6F7FA',
    show: false,
    icon: path.join(dir, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(dir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  /* 바깥 링크는 기본 브라우저로 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(dir, '..', 'dist', 'index.html'));
  }
}

/*
 * 메뉴 막대는 두지 않는다.
 * 명령은 모두 툴바 버튼과 단축키에 있고, 화면을 한 줄이라도 넓게 쓰는 편이 낫다.
 * macOS 는 메뉴 막대가 창 밖(화면 위)에 있어 자리를 먹지 않으므로,
 * 복사·붙여넣기 단축키가 살아 있도록 최소한의 메뉴만 남긴다.
 */
function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: '편집',
      submenu: [
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

/* ------------------------------------------------------------------ */
/* 파일 대화상자                                                       */
/* ------------------------------------------------------------------ */

const FILTERS = [
  { name: '텍스트 파일', extensions: ['txt'] },
  { name: '모든 파일', extensions: ['*'] },
];

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '열기',
    filters: FILTERS,
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;

  let text = await readFile(filePaths[0], 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);   /* BOM 은 건너뛴다 */
  return { text, name: path.basename(filePaths[0]) };
});

ipcMain.handle('file:save', async (_e, text, suggestedName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '저장',
    defaultPath: suggestedName || '무제.txt',
    filters: FILTERS,
  });
  if (canceled || !filePath) return null;

  /* 원본과 같이 UTF-8 BOM 을 붙여 쓴다 */
  await writeFile(filePath, `﻿${text}`, 'utf8');
  return path.basename(filePath);
});

/* 오른쪽 아래 손잡이로 창 크기를 바꾼다 */
registerWindowResize(ipcMain, () => win);

/* ------------------------------------------------------------------ */

/*
 * 배포판에서는 파일에서 읽은 화면만 돌면 되므로 바깥으로 나가는 길을 모두 막는다.
 * 개발 중에는 Vite 가 인라인 스크립트를 넣으므로 씌우지 않는다.
 */
function applyCsp() {
  if (isDev) return;
  session.defaultSession.webRequest.onHeadersReceived((details, done) => {
    done({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
          + "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'",
        ],
      },
    });
  });
}

app.whenReady().then(() => {
  applyCsp();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
