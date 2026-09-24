'use strict';

// 탐색기 바탕화면 아이콘(SysListView32)의 자리를 읽고 옮긴다.
// 박스에 넣은 아이콘은 화면 밖으로 치워 창 안의 아이콘과 겹치지 않게 한다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const koffi = require('koffi');
const { sameName, isOnDesktop, listDesktopFiles } = require('./files');
const { pickIcon, isDesktopTarget, shellPathFor, movedEnough } = require('../../shared/deskpick');
const deskgrid = require('../../shared/deskgrid');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const shell32 = koffi.load('shell32.dll');
const gdi32 = koffi.load('gdi32.dll');
const comctl32 = koffi.load('comctl32.dll');
const ole32 = koffi.load('ole32.dll');

const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 className, str16 windowName)');
const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 className, str16 windowName)');
const SendMessageW = user32.func('int64 __stdcall SendMessageW(void *hwnd, uint32 msg, uint64 wParam, uint64 lParam)');
const SendMessageTimeoutW = user32.func('intptr __stdcall SendMessageTimeoutW(void *hwnd, uint32 msg, uintptr wParam, intptr lParam, uint32 flags, uint32 timeout, void *result)');
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hwnd, _Out_ uint8_t *name, int max)');
const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int key)');
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
const GetWindowLongPtrW = user32.func('int64 __stdcall GetWindowLongPtrW(void *hwnd, int index)');
const InvalidateRect = user32.func('int __stdcall InvalidateRect(void *hwnd, void *rect, int erase)');
const UpdateWindow = user32.func('int __stdcall UpdateWindow(void *hwnd)');
const SetWindowLongPtrW = user32.func('int64 __stdcall SetWindowLongPtrW(void *hwnd, int index, int64 value)');
const DeskPoint = koffi.struct('DeskPoint', { x: 'int32', y: 'int32' });
const GetCursorPos = user32.func('int __stdcall GetCursorPos(_Out_ DeskPoint *pos)');
const WindowFromPoint = user32.func('void * __stdcall WindowFromPoint(DeskPoint pt)');

// 탐색기가 쓰는 것과 같은 그림을 얻기 위한 선언
const SHFILEINFOW = koffi.struct('SHFILEINFOW', {
  hIcon: 'void *',
  iIcon: 'int32',
  dwAttributes: 'uint32',
  szDisplayName: koffi.array('uint16_t', 260),
  szTypeName: koffi.array('uint16_t', 80),
});
const ICONINFO = koffi.struct('ICONINFO', {
  fIcon: 'int32',
  xHotspot: 'uint32',
  yHotspot: 'uint32',
  hbmMask: 'void *',
  hbmColor: 'void *',
});
const BITMAP = koffi.struct('BITMAP', {
  bmType: 'int32',
  bmWidth: 'int32',
  bmHeight: 'int32',
  bmWidthBytes: 'int32',
  bmPlanes: 'uint16',
  bmBitsPixel: 'uint16',
  bmBits: 'void *',
});

const SHGetFileInfoW = shell32.func('uintptr __stdcall SHGetFileInfoW(str16 path, uint32 attrs, _Out_ SHFILEINFOW *info, uint32 size, uint32 flags)');
const SHGetImageList = shell32.func('int32 __stdcall SHGetImageList(int32 which, uint8_t *riid, _Out_ void **out)');
const ImageList_GetIcon = comctl32.func('void * __stdcall ImageList_GetIcon(void *list, int32 index, uint32 flags)');
const GetIconInfo = user32.func('int __stdcall GetIconInfo(void *icon, _Out_ ICONINFO *info)');
const DestroyIcon = user32.func('int __stdcall DestroyIcon(void *icon)');
const GetDC = user32.func('void * __stdcall GetDC(void *hwnd)');
const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *hwnd, void *hdc)');
const GetObjectW = gdi32.func('int __stdcall GetObjectW(void *handle, int size, _Out_ BITMAP *out)');
const GetDIBits = gdi32.func('int __stdcall GetDIBits(void *hdc, void *bitmap, uint32 start, uint32 lines, _Out_ uint8_t *bits, uint8_t *info, uint32 usage)');
const DeleteObject = gdi32.func('int __stdcall DeleteObject(void *handle)');
const CoInitializeEx = ole32.func('int32 __stdcall CoInitializeEx(void *reserved, uint32 flags)');
const CoTaskMemFree = ole32.func('void __stdcall CoTaskMemFree(void *p)');
// 휴지통처럼 파일이 아닌 항목은 이름이 아니라 셸 항목 식별자(PIDL)로 다룬다.
const SHChangeNotify = shell32.func('void __stdcall SHChangeNotify(uint32 eventId, uint32 flags, void *item1, void *item2)');
const SHParseDisplayName = shell32.func('int32 __stdcall SHParseDisplayName(str16 name, void *bind, _Out_ void **pidl, uint32 wantIn, _Out_ uint32 *gotOut)');
const SHGetFileInfoPidl = shell32.func('uintptr __stdcall SHGetFileInfoW(void *pidl, uint32 attrs, _Out_ SHFILEINFOW *info, uint32 size, uint32 flags)');

const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *handle)');
const CreateMutexW = kernel32.func('void * __stdcall CreateMutexW(void *attrs, int owner, str16 name)');
const GetLastError = kernel32.func('uint32 __stdcall GetLastError()');
const VirtualAllocEx = kernel32.func('uint64 __stdcall VirtualAllocEx(void *process, uint64 address, uintptr size, uint32 type, uint32 protect)');
const VirtualFreeEx = kernel32.func('int __stdcall VirtualFreeEx(void *process, uint64 address, uintptr size, uint32 type)');
const WriteProcessMemory = kernel32.func('int __stdcall WriteProcessMemory(void *process, uint64 address, uint8_t *buffer, uintptr size, void *written)');
const ReadProcessMemory = kernel32.func('int __stdcall ReadProcessMemory(void *process, uint64 address, _Out_ uint8_t *buffer, uintptr size, void *read)');

const LVM_GETITEMCOUNT = 0x1004;
const LVM_GETITEMPOSITION = 0x1010;
const LVM_SETITEMPOSITION32 = 0x1031;
const LVM_GETITEMTEXTW = 0x1073;
const PROCESS_RIGHTS = 0x0008 | 0x0010 | 0x0020 | 0x0400;
const GWL_STYLE = -16;
const SHGFI_SYSICONINDEX = 0x4000;
const SHGFI_DISPLAYNAME = 0x0200;
const SHGFI_PIDL = 0x0008;
// 바탕화면에 놓을 수 있는, 파일이 아닌 항목들
const SHELL_ITEMS = [
  'shell:RecycleBinFolder',
  'shell:MyComputerFolder',
  'shell:NetworkPlacesFolder',
  'shell:UsersFilesFolder',
  'shell:ControlPanelFolder',
];
// 자리만 옮기면 탐색기가 되돌려 놓는 항목이다. 박스에 넣는 동안은 바탕화면에서 숨긴다.
const SHELL_CLSID = {
  'shell:RecycleBinFolder': '{645FF040-5081-101B-9F08-00AA002F954E}',
  'shell:MyComputerFolder': '{20D04FE0-3AEA-1069-A2D8-08002B30309D}',
  'shell:NetworkPlacesFolder': '{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}',
  'shell:UsersFilesFolder': '{59031A47-3F72-44A7-89C5-5595FE6B30EE}',
  'shell:ControlPanelFolder': '{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}',
};
const HIDE_ICON_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\ClassicStartMenu',
];
const SHIL_EXTRALARGE = 2;
const SHIL_LARGE = 0;
const ILD_TRANSPARENT = 1;
// IID_IImageList {46EB5926-582E-4017-9FDF-E8998DAA0950}
const IID_IImageList = Buffer.from([
  0x26, 0x59, 0xeb, 0x46, 0x2e, 0x58, 0x17, 0x40,
  0x9f, 0xdf, 0xe8, 0x99, 0x8d, 0xaa, 0x09, 0x50,
]);
const LVS_AUTOARRANGE = 0x0100;
const LVM_GETEXTENDEDLISTVIEWSTYLE = 0x1037;
const LVM_SETEXTENDEDLISTVIEWSTYLE = 0x1036;
// 격자에 맞춤. 켜져 있으면 화면 밖으로 치운 아이콘이 격자로 되돌아온다.
const LVS_EX_SNAPTOGRID = 0x00080000;

let homes = new Map();
// 우리가 숨긴 셸 항목의, 숨기기 전 레지스트리 값.
let shellPrev = new Map();
let homeFile = null;
let prepared = false;
let warned = false;
// 탐색기의 '아이콘 자동 정렬'을 우리가 껐다면 true. 끝낼 때 되돌린다.
let turnedOffAutoArrange = false;
// '격자에 맞춤' 도 마찬가지로 우리가 껐다면 true.
let turnedOffSnapToGrid = false;

function init(dir) {
  homeFile = path.join(dir, 'icon-homes.json');
  process.once('exit', () => {
    try {
      restoreShellIcons();
    } catch (_err) {
      /* 끝나는 중에는 더 할 일이 없다. */
    }
  });
  try {
    const parsed = JSON.parse(fs.readFileSync(homeFile, 'utf8'));
    if (parsed && parsed.homes) {
      homes = new Map(Object.entries(parsed.homes));
      turnedOffAutoArrange = !!parsed.autoArrange;
      turnedOffSnapToGrid = !!parsed.snapToGrid;
      shellPrev = new Map(Object.entries(parsed.shellPrev || {}));
    } else {
      homes = new Map(Object.entries(parsed));
    }
  } catch (_err) {
    homes = new Map();
  }
}

function persistHomes() {
  if (!homeFile) return;
  const obj = {};
  for (const [key, value] of homes) obj[key] = value;
  fs.mkdirSync(path.dirname(homeFile), { recursive: true });
  fs.writeFileSync(homeFile, JSON.stringify({
    version: 3,
    autoArrange: turnedOffAutoArrange,
    snapToGrid: turnedOffSnapToGrid,
    homes: obj,
    shellPrev: Object.fromEntries(shellPrev),
  }));
}

function styleOf(hwnd) {
  return Number(BigInt(GetWindowLongPtrW(hwnd, GWL_STYLE)) & 0xffffffffn);
}

// 자동 정렬이 켜져 있으면 탐색기가 아이콘 자리를 되돌려 놓는다.
// 아이콘을 옮기기 전에 꺼 두고, 앱을 끝낼 때 원래대로 되돌린다.
// 껐다는 사실은 파일에 남긴다. 갑자기 끝나도 다음 번에 되돌릴 수 있다.
function exStyleOf(list) {
  return Number(BigInt(SendMessageW(list, LVM_GETEXTENDEDLISTVIEWSTYLE, 0n, 0n)) & 0xffffffffn);
}

function manualArrange(list) {
  const style = styleOf(list);
  const autoOn = (style & LVS_AUTOARRANGE) !== 0;
  if (autoOn && !turnedOffAutoArrange) {
    turnedOffAutoArrange = true;
    persistHomes();
  }
  if (autoOn) SetWindowLongPtrW(list, GWL_STYLE, BigInt(style & ~LVS_AUTOARRANGE));

  // 격자에 맞춤이 켜져 있으면 화면 밖으로 치운 아이콘이 되돌아온다.
  const snapOn = (exStyleOf(list) & LVS_EX_SNAPTOGRID) !== 0;
  if (snapOn && !turnedOffSnapToGrid) {
    turnedOffSnapToGrid = true;
    persistHomes();
  }
  if (snapOn) {
    SendMessageW(list, LVM_SETEXTENDEDLISTVIEWSTYLE, BigInt(LVS_EX_SNAPTOGRID), 0n);
  }
}

function restoreArrange() {
  if (!turnedOffAutoArrange && !turnedOffSnapToGrid) return;
  const list = findListView();
  if (!list) return;

  if (turnedOffSnapToGrid) {
    SendMessageW(list, LVM_SETEXTENDEDLISTVIEWSTYLE, BigInt(LVS_EX_SNAPTOGRID), BigInt(LVS_EX_SNAPTOGRID));
    if ((exStyleOf(list) & LVS_EX_SNAPTOGRID) !== 0) turnedOffSnapToGrid = false;
  }

  if (turnedOffAutoArrange) {
    const style = styleOf(list);
    if (!(style & LVS_AUTOARRANGE)) SetWindowLongPtrW(list, GWL_STYLE, BigInt(style | LVS_AUTOARRANGE));
    // 정말 켜졌는지 확인한 뒤에만 기록을 지운다.
    // 실패한 채 지우면 사용자 설정이 꺼진 채로 남는다.
    if ((styleOf(list) & LVS_AUTOARRANGE) !== 0) turnedOffAutoArrange = false;
  }

  persistHomes();
}

function prepare() {
  if (prepared) return;
  prepared = true;
  const progman = FindWindowW('Progman', null);
  if (progman) SendMessageTimeoutW(progman, 0x052c, 0, 0, 0, 800, null);
}

function findListView() {
  prepare();
  const progman = FindWindowW('Progman', 'Program Manager') || FindWindowW('Progman', null);
  const direct = listIn(progman);
  if (direct) return direct;
  let previous = null;
  for (;;) {
    const worker = FindWindowExW(null, previous, 'WorkerW', null);
    if (!worker) return null;
    previous = worker;
    const found = listIn(worker);
    if (found) return found;
  }
}

function listIn(parent) {
  if (!parent) return null;
  const defView = FindWindowExW(parent, null, 'SHELLDLL_DefView', null);
  if (!defView) return null;
  return FindWindowExW(defView, null, 'SysListView32', 'FolderView')
    || FindWindowExW(defView, null, 'SysListView32', null);
}

function withList(fn) {
  const list = findListView();
  if (!list) return null;
  const pidBox = [0];
  if (!GetWindowThreadProcessId(list, pidBox) || !pidBox[0]) return null;
  const proc = OpenProcess(PROCESS_RIGHTS, 0, pidBox[0]);
  if (!proc) return null;
  const remote = VirtualAllocEx(proc, 0n, 1024, 0x3000, 0x04);
  try {
    if (!remote) return null;
    return fn({ list, proc, remote: BigInt(remote) });
  } finally {
    if (remote) VirtualFreeEx(proc, remote, 0, 0x8000);
    CloseHandle(proc);
  }
}

function readAll(session) {
  const count = Number(SendMessageW(session.list, LVM_GETITEMCOUNT, 0n, 0n));
  const items = [];
  const limit = Math.min(count, 400);
  for (let index = 0; index < limit; index += 1) {
    const name = readText(session, index);
    const pos = readPos(session, index);
    if (!name) continue;
    items.push({ index, name, x: pos.x, y: pos.y });
  }
  return items;
}

function readText(session, index) {
  const textAt = session.remote + 128n;
  const item = Buffer.alloc(88);
  item.writeInt32LE(0, 8);
  item.writeBigUInt64LE(textAt, 24);
  item.writeInt32LE(260, 32);
  WriteProcessMemory(session.proc, session.remote, item, item.length, null);
  SendMessageW(session.list, LVM_GETITEMTEXTW, BigInt(index), session.remote);
  const buf = Buffer.alloc(520);
  ReadProcessMemory(session.proc, textAt, buf, buf.length, null);
  return decodeUtf16(buf);
}

function readPos(session, index) {
  const pointAt = session.remote + 768n;
  const blank = Buffer.alloc(8);
  WriteProcessMemory(session.proc, pointAt, blank, blank.length, null);
  SendMessageW(session.list, LVM_GETITEMPOSITION, BigInt(index), pointAt);
  const buf = Buffer.alloc(8);
  ReadProcessMemory(session.proc, pointAt, buf, buf.length, null);
  return { x: buf.readInt32LE(0), y: buf.readInt32LE(4) };
}

function writePos(session, index, x, y) {
  const pointAt = session.remote + 768n;
  const buf = Buffer.alloc(8);
  buf.writeInt32LE(x | 0, 0);
  buf.writeInt32LE(y | 0, 4);
  WriteProcessMemory(session.proc, pointAt, buf, buf.length, null);
  SendMessageW(session.list, LVM_SETITEMPOSITION32, BigInt(index), pointAt);
}

function decodeUtf16(buf) {
  let end = buf.length;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    if (buf[i] === 0 && buf[i + 1] === 0) {
      end = i;
      break;
    }
  }
  return buf.toString('utf16le', 0, end);
}

// 치워 둔 아이콘을 두는 자리.
// 음수 좌표는 탐색기가 되돌려 놓는 항목이 있어(휴지통 등) 오른쪽 멀리로 보낸다.
const PARK_X = 20000;

function parkSpot(index) {
  return { x: PARK_X, y: 2000 + (index % 60) * 8 };
}

function isParked(icon) {
  // 예전 판에서 음수 자리에 치워 둔 것도 알아본다.
  return icon.x >= PARK_X - 1000 || icon.x < -1000 || icon.y < -1000;
}

function keyOf(name) {
  return String(name || '').trim().toLowerCase();
}

function defaultSpot(index) {
  try {
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const col = index % 12;
    const row = Math.floor(index / 12);
    const phys = screen.dipToScreenPoint({
      x: display.workArea.x + 24 + col * 90,
      y: display.workArea.y + 24 + row * 100,
    });
    return { x: Math.round(phys.x), y: Math.round(phys.y) };
  } catch (_err) {
    return { x: 40 + (index % 12) * 90, y: 40 + Math.floor(index / 12) * 100 };
  }
}

// 창 자리(DIP)를 바탕화면 아이콘이 쓰는 실제 픽셀 자리로 옮긴다.
function toPhysicalRect(rect) {
  try {
    const { screen } = require('electron');
    const tl = screen.dipToScreenPoint({ x: rect.x, y: rect.y });
    const br = screen.dipToScreenPoint({ x: rect.x + rect.width, y: rect.y + rect.height });
    return {
      x: Math.round(tl.x),
      y: Math.round(tl.y),
      width: Math.round(br.x - tl.x),
      height: Math.round(br.y - tl.y),
    };
  } catch (_err) {
    return rect;
  }
}

function toDipRect(rect) {
  try {
    const { screen } = require('electron');
    const tl = screen.screenToDipPoint({ x: rect.x, y: rect.y });
    const br = screen.screenToDipPoint({ x: rect.x + rect.width, y: rect.y + rect.height });
    return {
      x: Math.round(tl.x),
      y: Math.round(tl.y),
      w: Math.round(br.x - tl.x),
      h: Math.round(br.y - tl.y),
    };
  } catch (_err) {
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }
}

// 아이콘을 놓을 수 있는 넓이. 작업 표시줄을 뺀 자리다.
function desktopArea() {
  try {
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    return toPhysicalRect({ x: area.x, y: area.y, width: area.width, height: area.height });
  } catch (_err) {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
}

function mouseDown() {
  try {
    return (GetAsyncKeyState(0x01) & 0x8000) !== 0;
  } catch (_err) {
    return false;
  }
}

function guard(fn) {
  try {
    return fn();
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error('바탕화면 아이콘 자리를 읽지 못했습니다.', err);
    }
    return false;
  }
}

// 옮길 것이 하나도 없으면 탐색기 설정을 건드리지 않는다.
function applyMoves(session, moves) {
  if (!moves.length) return false;
  manualArrange(session.list);
  for (const move of moves) writePos(session, move.index, move.x, move.y);
  // 자리를 바꾼 뒤에는 바탕화면을 다시 그리게 한다. 그러지 않으면 옛 그림이 남는다.
  InvalidateRect(session.list, null, 1);
  UpdateWindow(session.list);
  persistHomes();
  return true;
}

// items 는 박스에 담긴 것, blocks 는 박스가 차지한 자리다.
// 담긴 것은 화면 밖으로 치우고, 박스 자리에 남은 바탕화면 아이콘은 밖으로 밀어낸다.
// reg.exe 는 값이 없을 때 콘솔 코드로 오류를 찍는다. 출력을 받아 두고 화면에는 내지 않는다.
const REG_STDIO = ['ignore', 'pipe', 'pipe'];

function reg(args) {
  return execFileSync('reg', args, { encoding: 'utf8', windowsHide: true, stdio: REG_STDIO });
}

function readHide(clsid) {
  for (const key of HIDE_ICON_KEYS) {
    try {
      const out = reg(['query', key, '/v', clsid]);
      const match = /0x([0-9a-f]+)/i.exec(out);
      if (match) return parseInt(match[1], 16);
    } catch (_err) {
      /* 값이 없으면 보이는 상태다. */
    }
  }
  return 0;
}

function writeHide(clsid, value) {
  for (const key of HIDE_ICON_KEYS) {
    try {
      reg(['add', key, '/v', clsid, '/t', 'REG_DWORD', '/d', String(value), '/f']);
    } catch (_err) {
      /* 한 키가 없어도 다른 쪽은 적는다. */
    }
  }
}

function refreshShellIcons() {
  try {
    SHChangeNotify(0x08000000, 0x1000, null, null);
  } catch (_err) {
    /* 알림이 실패해도 레지스트리 값은 남는다. */
  }
}

// 앱이 숨긴 셸 아이콘을 바탕화면에 다시 나타낸다.
// 우리가 숨기기 전에 이미 숨겨 둔 값(1)만 그대로 두고, 기록 없는 숨김도 보이게 되돌린다.
function restoreShellIcons() {
  let changed = false;
  for (const shellPath of Object.keys(SHELL_CLSID)) {
    const clsid = SHELL_CLSID[shellPath];
    const prev = shellPrev.get(shellPath) === 1 ? 1 : 0;
    if (readHide(clsid) !== prev) {
      writeHide(clsid, prev);
      changed = true;
    }
    if (shellPrev.has(shellPath)) {
      shellPrev.delete(shellPath);
      changed = true;
    }
  }
  if (!changed) return;
  refreshShellIcons();
  persistHomes();
}

// 박스에 담긴 휴지통 같은 항목은 바탕화면에서 지운다. 빼면 원래 보이던 대로 되돌린다.
function syncShellIcons(items) {
  const wanted = new Set(
    (items || []).filter((item) => String(item.path || '').startsWith('shell:')).map((item) => item.path)
  );
  let changed = false;
  for (const shellPath of Object.keys(SHELL_CLSID)) {
    const hide = wanted.has(shellPath);
    const tracked = shellPrev.has(shellPath);
    if (hide === tracked) continue;
    const clsid = SHELL_CLSID[shellPath];
    if (hide) {
      shellPrev.set(shellPath, readHide(clsid));
      writeHide(clsid, 1);
    } else {
      const prev = shellPrev.get(shellPath) === 1 ? 1 : 0;
      shellPrev.delete(shellPath);
      writeHide(clsid, prev);
    }
    changed = true;
  }
  if (!changed) return;
  refreshShellIcons();
  persistHomes();
}

function shellNameTable() {
  const rows = [];
  for (const shellPath of SHELL_ITEMS) {
    const info = shellInfo(shellPath);
    if (info && info.name) rows.push({ name: info.name, path: shellPath });
  }
  return rows;
}

function itemForIcon(icon) {
  if (!icon || !icon.name) return null;
  const shell = shellPathFor(icon.name, shellNameTable(), sameName);
  if (shell) return shell;
  const file = listDesktopFiles().find((entry) => sameName(icon.name, entry.name));
  return file ? { name: file.name, path: file.path } : null;
}

function iconUnder(pos) {
  const listed = withList((session) => (session ? readAll(session) : [])) || [];
  return pickIcon(listed, pos);
}

function desktopAt(pos) {
  let hwnd = null;
  try {
    hwnd = WindowFromPoint({ x: pos.x, y: pos.y });
  } catch (_err) {
    hwnd = null;
  }
  return isDesktopTarget(className(hwnd), className(GetForegroundWindow()));
}

function toDipPoint(pos) {
  try {
    const { screen } = require('electron');
    const dip = screen.screenToDipPoint({ x: pos.x, y: pos.y });
    return { x: Math.round(dip.x), y: Math.round(dip.y) };
  } catch (_err) {
    return { x: pos.x, y: pos.y };
  }
}

function gather(items, blocks) {
  if (!items || mouseDown()) return false;
  syncShellIcons(items);
  // 치울 수 있는 것은 바탕화면 폴더에 있는 것뿐이다.
  const mine = items.filter((item) => isOnDesktop(item.path));
  const walls = (blocks || []).map(toPhysicalRect);
  return guard(() => withList((session) => {
    if (!session) return false;
    const listed = readAll(session);
    const moves = [];
    const loose = [];
    let spot = 0;
    for (const icon of listed) {
      const wanted = mine.some((item) => sameName(icon.name, item.name));
      // 이름이 박스 안의 것과 같으면 어떤 경우에도 바탕화면으로 되돌리지 않는다.
      // 잠깐 못 알아본 사이에 되돌리면 아이콘이 나타났다 사라져 어지럽다.
      const known = wanted || items.some((item) => sameName(icon.name, item.name));
      if (wanted) {
        if (!isParked(icon)) {
          homes.set(keyOf(icon.name), { x: icon.x, y: icon.y });
          const spotAt = parkSpot(icon.index);
          moves.push({ index: icon.index, x: spotAt.x, y: spotAt.y });
        }
      } else if (isParked(icon)) {
        if (known) continue;
        const home = homes.get(keyOf(icon.name)) || defaultSpot(spot);
        spot += 1;
        moves.push({ index: icon.index, x: home.x, y: home.y });
      } else if (!known) {
        loose.push(icon);
      }
    }
    // 박스가 깔고 앉은 아이콘을 빈 칸으로 옮긴다. 펜스처럼 자리를 비워 준다.
    if (walls.length && loose.length) {
      for (const move of deskgrid.relocate(loose, walls, desktopArea())) moves.push(move);
    }
    return applyMoves(session, moves);
  }));
}

function release(items) {
  if (!items) return;
  restoreShellIcons();
  const mine = items.filter((item) => isOnDesktop(item.path));
  guard(() => withList((session) => {
    if (!session) return;
    const listed = readAll(session);
    const moves = [];
    let spot = 0;
    for (const icon of listed) {
      const wanted = mine.some((item) => sameName(icon.name, item.name));
      if (!wanted || !isParked(icon)) continue;
      const home = homes.get(keyOf(icon.name)) || defaultSpot(spot);
      spot += 1;
      moves.push({ index: icon.index, x: home.x, y: home.y });
    }
    applyMoves(session, moves);
  }));
}

function moveIcon(item, dipPoint) {
  if (!item || !isOnDesktop(item.path)) return false;
  return guard(() => withList((session) => {
    if (!session) return false;
    const listed = readAll(session);
    const icon = listed.find((entry) => sameName(entry.name, item.name));
    if (!icon) return false;
    let pos = homes.get(keyOf(icon.name)) || defaultSpot(icon.index);
    if (dipPoint) {
      try {
        const { screen } = require('electron');
        const phys = screen.dipToScreenPoint(dipPoint);
        pos = { x: Math.round(phys.x), y: Math.round(phys.y) };
      } catch (_err) {
        pos = { x: Math.round(dipPoint.x), y: Math.round(dipPoint.y) };
      }
    }
    homes.set(keyOf(icon.name), pos);
    return applyMoves(session, [{ index: icon.index, x: pos.x, y: pos.y }]);
  }));
}

function place(win) {
  if (!win || win.isDestroyed()) return;
  // 작업 창을 항상 가리지 않게 포커스를 빼앗지 않는다.
  // HWND_BOTTOM 은 바탕화면 뒤로 들어가 박스가 사라지므로 쓰지 않는다.
  win.setAlwaysOnTop(false);
}

function cursorOnIcon() {
  const pos = { x: 0, y: 0 };
  if (!GetCursorPos(pos)) return false;
  return !!iconUnder(pos);
}

function className(hwnd) {
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(hwnd, buf, 255);
  if (!n) return '';
  return buf.toString('utf16le', 0, n * 2);
}

// 바탕화면 빈 곳에서 왼쪽 단추로 사각형을 끌면 그 자리를 알려 준다.
// 사각형이 아니어도 바탕화면에서 손을 떼면 onSettle 을 부른다.
// 아이콘을 옮긴 직후 바로 다시 정리해야 나타났다 사라지는 일이 없다.
function watchDrag(onRect, onSettle, onDrop) {
  let start = null;
  let held = null;
  let wasDown = false;
  let settleTimer = null;
  const settle = () => {
    if (typeof onSettle !== 'function') return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(onSettle, 150);
  };
  const timer = setInterval(() => {
    let down = false;
    try {
      down = mouseDown();
    } catch (_err) {
      return;
    }
    const pos = { x: 0, y: 0 };
    if (!GetCursorPos(pos)) return;

    if (down && !wasDown) {
      const onDesktop = desktopAt(pos);
      const icon = onDesktop ? iconUnder(pos) : null;
      // 휴지통처럼 파일이 아닌 항목도 여기서 잡아 둔다. 손을 떼는 곳이 박스면 그 박스로 넣는다.
      held = icon ? { name: icon.name, x: pos.x, y: pos.y } : null;
      start = onDesktop && !icon ? { x: pos.x, y: pos.y } : null;
      if (onDesktop && icon) settle();
    } else if (!down && wasDown) {
      const dragged = held;
      held = null;
      if (dragged && movedEnough(dragged, pos) && typeof onDrop === 'function') {
        try {
          const item = itemForIcon(dragged);
          if (item) onDrop(item, toDipPoint(pos));
        } catch (_err) {
          /* 이름을 못 읽으면 이번 끌기는 버린다. */
        }
      }
      if (start) {
        const from = start;
        start = null;
        const rect = {
          x: Math.min(from.x, pos.x),
          y: Math.min(from.y, pos.y),
          width: Math.abs(pos.x - from.x),
          height: Math.abs(pos.y - from.y),
        };
        // 잠깐 흔들린 것은 사각형으로 보지 않는다.
        if (rect.width >= 120 && rect.height >= 90) onRect(toDipRect(rect));
        else settle();
      } else {
        settle();
      }
    }
    wasDown = down;
  }, 40);
  return () => {
    clearTimeout(settleTimer);
    clearInterval(timer);
  };
}

function watchDoubleClick(onToggle) {
  let wasDown = false;
  let last = 0;
  const timer = setInterval(() => {
    let down = false;
    try {
      down = mouseDown();
    } catch (_err) {
      return;
    }
    if (wasDown && !down) {
      const now = Date.now();
      const fg = className(GetForegroundWindow());
      const empty = fg === 'Progman' || fg === 'WorkerW';
      if (empty && now - last < 320 && !cursorOnIcon()) onToggle();
      last = now;
    }
    wasDown = down;
  }, 40);
  return () => clearInterval(timer);
}

// 탐색기가 바탕화면에 그리는 바로 그 그림을 꺼낸다.
// 바로가기·확장자·앱이 등록한 그림을 셸이 알아서 골라 주므로 늘 화면과 같다.
// 셸 그림은 COM 이 준비돼 있어야 얻을 수 있다. 한 번만 부른다.
let comReady = false;
function prepareCom() {
  if (comReady) return;
  comReady = true;
  try {
    CoInitializeEx(null, 2); // COINIT_APARTMENTTHREADED
  } catch (_err) {
    /* 이미 준비돼 있으면 그대로 쓴다. */
  }
}

function imageListFor(which) {
  const out = [null];
  if (SHGetImageList(which, IID_IImageList, out) !== 0) return null;
  return out[0];
}

function bitmapOf(hIcon) {
  const info = {};
  if (!GetIconInfo(hIcon, info)) return null;
  const shape = {};
  try {
    if (!GetObjectW(info.hbmColor, koffi.sizeof(BITMAP), shape)) return null;
    const width = shape.bmWidth;
    const height = shape.bmHeight;
    if (!width || !height) return null;
    const header = Buffer.alloc(44);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(width, 4);
    header.writeInt32LE(-height, 8); // 위에서 아래로 읽는다
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const hdc = GetDC(null);
    try {
      const data = Buffer.alloc(width * height * 4);
      if (!GetDIBits(hdc, info.hbmColor, 0, height, data, header, 0)) return null;
      let hasAlpha = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) {
          hasAlpha = true;
          break;
        }
      }
      // 옛 아이콘은 알파가 없다. 이럴 때는 마스크 그림으로 투명한 곳을 정한다.
      if (!hasAlpha) {
        const mask = Buffer.alloc(width * height * 4);
        const ok = GetDIBits(hdc, info.hbmMask, 0, height, mask, header, 0);
        for (let i = 0; i < width * height; i += 1) {
          data[i * 4 + 3] = ok && mask[i * 4] ? 0 : 255;
        }
      }
      return { data, width, height };
    } finally {
      ReleaseDC(null, hdc);
    }
  } finally {
    if (info.hbmColor) DeleteObject(info.hbmColor);
    if (info.hbmMask) DeleteObject(info.hbmMask);
  }
}

function decodeName(arr) {
  const buf = Buffer.from(Uint16Array.from(arr).buffer);
  return decodeUtf16(buf);
}

// 파일이 아닌 셸 항목의 이름과 그림 번호를 얻는다.
function shellInfo(shellPath) {
  prepareCom();
  const out = [null];
  const attrs = [0];
  if (SHParseDisplayName(shellPath, null, out, 0, attrs) !== 0 || !out[0]) return null;
  try {
    const info = {};
    const flags = SHGFI_PIDL | SHGFI_DISPLAYNAME | SHGFI_SYSICONINDEX;
    if (!SHGetFileInfoPidl(out[0], 0, info, koffi.sizeof(SHFILEINFOW), flags)) return null;
    return { name: decodeName(info.szDisplayName), iconIndex: info.iIcon };
  } finally {
    CoTaskMemFree(out[0]);
  }
}

// 바탕화면에 실제로 놓여 있는, 파일이 아닌 항목들.
// 이름은 운영체제 언어를 따르므로 셸에게 물어본다.
function shellItems() {
  const found = [];
  try {
    const listed = withList((session) => (session ? readAll(session) : [])) || [];
    const onDesktop = new Set(listed.map((icon) => keyOf(icon.name)));
    for (const shellPath of SHELL_ITEMS) {
      const info = shellInfo(shellPath);
      if (!info || !info.name) continue;
      if (!onDesktop.has(keyOf(info.name))) continue;
      found.push({ name: info.name, path: shellPath });
    }
  } catch (_err) {
    /* 못 읽으면 아무것도 없는 셈 친다. */
  }
  return found;
}

function iconFromIndex(index) {
  const list = imageListFor(SHIL_EXTRALARGE) || imageListFor(SHIL_LARGE);
  if (!list) return null;
  const hIcon = ImageList_GetIcon(list, index, ILD_TRANSPARENT);
  if (!hIcon) return null;
  try {
    return bitmapOf(hIcon);
  } finally {
    DestroyIcon(hIcon);
  }
}

function fileIcon(filePath) {
  try {
    prepareCom();
    const wanted = String(filePath);
    if (wanted.startsWith('shell:')) {
      const found = shellInfo(wanted);
      return found ? iconFromIndex(found.iconIndex) : null;
    }
    const info = {};
    // 셸은 역슬래시 경로를 받는다.
    const target = path.win32.normalize(wanted);
    if (!SHGetFileInfoW(target, 0, info, koffi.sizeof(SHFILEINFOW), SHGFI_SYSICONINDEX)) return null;
    return iconFromIndex(info.iIcon);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error('바탕화면 그림을 꺼내지 못했습니다.', err);
    }
    return null;
  }
}

// 바탕화면 아이콘은 컴퓨터에 하나뿐이다.
// 두 벌이 동시에 돌면 서로 상대가 치운 아이콘을 되돌려 놓아 화면이 깜빡인다.
// 그래서 먼저 뜬 쪽만 아이콘을 다룬다.
const ERROR_ALREADY_EXISTS = 183;
let claim = null;

function claimSingleInstance() {
  if (claim) return true;
  try {
    const handle = CreateMutexW(null, 1, 'Local\MyDeskBox.DesktopOwner');
    if (!handle) return true;
    if (GetLastError() === ERROR_ALREADY_EXISTS) {
      CloseHandle(handle);
      return false;
    }
    claim = handle;
    return true;
  } catch (_err) {
    return true;
  }
}

function shutdown() {
  restoreShellIcons();
  guard(() => restoreArrange());
  if (claim) {
    try {
      CloseHandle(claim);
    } catch (_err) {
      /* 이미 닫혔으면 그만이다. */
    }
    claim = null;
  }
}

// 살펴보기용. limit 를 주면 그만큼만 돌려준다.
function debugList(limit) {
  return withList((session) => {
    if (!session) return [];
    const all = readAll(session);
    return limit ? all.slice(0, limit) : all;
  });
}

module.exports = {
  nativeIcons: true,
  claimSingleInstance,
  fileIcon,
  shellItems,
  init,
  prepare,
  place,
  gather,
  release,
  moveIcon,
  mouseDown,
  watchDrag,
  watchDoubleClick,
  shutdown,
  debugList,
};
