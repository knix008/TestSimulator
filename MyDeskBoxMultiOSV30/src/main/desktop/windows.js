'use strict';

// 탐색기 바탕화면 아이콘(SysListView32)의 자리를 읽고 옮긴다.
// 박스에 넣은 아이콘은 그 박스 칸으로 옮겨, 박스를 끌면 함께 움직인다.
// 파일 속성은 바꾸지 않는다. 탐색기는 그 파일을 보통 파일로 보여 준다.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const koffi = require('koffi');
const { sameName, isOnDesktop, listDesktopFiles, desktopDirectories } = require('./files');
const deskgrid = require('../../shared/deskgrid');
const {
  pickIcon,
  iconAt,
  isDesktopTarget,
  shellPathFor,
  movedEnough,
  shouldOfferFence,
  createDeskTaps,
} = require('../../shared/deskpick');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const shell32 = koffi.load('shell32.dll');
const gdi32 = koffi.load('gdi32.dll');
const comctl32 = koffi.load('comctl32.dll');
const ole32 = koffi.load('ole32.dll');
const dwmapi = koffi.load('dwmapi.dll');

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
const ValidateRect = user32.func('int __stdcall ValidateRect(void *hwnd, void *rect)');

const UpdateWindow = user32.func('int __stdcall UpdateWindow(void *hwnd)');
const SetWindowLongPtrW = user32.func('int64 __stdcall SetWindowLongPtrW(void *hwnd, int index, int64 value)');
const DeskPoint = koffi.struct('DeskPoint', { x: 'int32', y: 'int32' });
const GetCursorPos = user32.func('int __stdcall GetCursorPos(_Out_ DeskPoint *pos)');
// 두 번 누르기로 셀 시간과 허용 범위. 사용자가 제어판에서 정한 값을 그대로 따른다.
const GetDoubleClickTime = user32.func('uint32 __stdcall GetDoubleClickTime()');
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)');
const SetWindowPos = user32.func('int __stdcall SetWindowPos(void *hwnd, void *after, int x, int y, int w, int h, uint32 flags)');
const DeskRect = koffi.struct('DeskRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
const GetClientRect = user32.func('int __stdcall GetClientRect(void *hwnd, _Out_ DeskRect *rect)');
const GetParent = user32.func('void * __stdcall GetParent(void *hwnd)');
const ShowWindow = user32.func('int __stdcall ShowWindow(void *hwnd, int cmd)');
const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void *hwnd)');
const WindowFromPoint = user32.func('void * __stdcall WindowFromPoint(DeskPoint pt)');
const GetWindow = user32.func('void * __stdcall GetWindow(void *h, uint32 cmd)');

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
const CreateRoundRectRgn = gdi32.func('void * __stdcall CreateRoundRectRgn(int left, int top, int right, int bottom, int rw, int rh)');
const SetWindowRgn = user32.func('int __stdcall SetWindowRgn(void *hwnd, void *rgn, int redraw)');
const CoInitializeEx = ole32.func('int32 __stdcall CoInitializeEx(void *reserved, uint32 flags)');
const CoTaskMemFree = ole32.func('void __stdcall CoTaskMemFree(void *p)');
// 휴지통처럼 파일이 아닌 항목은 이름이 아니라 셸 항목 식별자(PIDL)로 다룬다.
const SHEmptyRecycleBinW = shell32.func('int32 __stdcall SHEmptyRecycleBinW(uintptr hwnd, void *root, uint32 flags)');
// 휴지통에 무엇이 들었는지 묻는다. 크기와 개수를 준다.
const SHQUERYRBINFO = koffi.struct('SHQUERYRBINFO', { cbSize: 'uint32', i64Size: 'int64', i64NumItems: 'int64' });
const SHQueryRecycleBinW = shell32.func('int32 __stdcall SHQueryRecycleBinW(str16 root, _Inout_ SHQUERYRBINFO *info);');
const SHParseDisplayName = shell32.func('int32 __stdcall SHParseDisplayName(str16 name, void *bind, _Out_ void **pidl, uint32 wantIn, _Out_ uint32 *gotOut)');
const SHGetFileInfoPidl = shell32.func('uintptr __stdcall SHGetFileInfoW(void *pidl, uint32 attrs, _Out_ SHFILEINFOW *info, uint32 size, uint32 flags)');

const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *handle)');
const CreateMutexW = kernel32.func('void * __stdcall CreateMutexW(void *attrs, int owner, str16 name)');
const GetLastError = kernel32.func('uint32 __stdcall GetLastError()');
const GetFileAttributesW = kernel32.func('uint32 __stdcall GetFileAttributesW(str16 path)');
const SetFileAttributesW = kernel32.func('int __stdcall SetFileAttributesW(str16 path, uint32 attrs)');
const SHChangeNotifyPath = shell32.func('void __stdcall SHChangeNotify(uint32 eventId, uint32 flags, str16 item1, void *item2)');
const VirtualAllocEx = kernel32.func('uint64 __stdcall VirtualAllocEx(void *process, uint64 address, uintptr size, uint32 type, uint32 protect)');
const VirtualFreeEx = kernel32.func('int __stdcall VirtualFreeEx(void *process, uint64 address, uintptr size, uint32 type)');
const WriteProcessMemory = kernel32.func('int __stdcall WriteProcessMemory(void *process, uint64 address, uint8_t *buffer, uintptr size, void *written)');
const ReadProcessMemory = kernel32.func('int __stdcall ReadProcessMemory(void *process, uint64 address, _Out_ uint8_t *buffer, uintptr size, void *read)');

// 무슨 일이 언제 일어났는지 적어 두는 자리. MYDESKBOX_TRACE 가 있을 때만 쓴다.
const TRACE = process.env.MYDESKBOX_TRACE || '';
function trace(line) {
  if (!TRACE) return;
  try {
    fs.appendFileSync(TRACE, `${new Date().toISOString().slice(11, 23)} ${line}
`);
  } catch (_err) {
    /* 기록에 실패해도 하던 일은 계속한다. */
  }
}

const SW_HIDE = 0;
const SW_SHOWNA = 8;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
// 창을 Z 순서의 맨 위에 둔다. 바탕화면보다 위에 올릴 때 쓴다.
const HWND_TOP = 0;
// 바로 위에 있는 창. 바탕화면 창의 바로 위를 찾을 때 쓴다.
const GW_HWNDPREV = 3;
// 사각 전체를 흐리는 값은 쓰지 않는다. 쓰면 둥근 모퉁이 밖이 흐린 채로 남는다.
const ACCENT_DISABLED = 0;
const WCA_ACCENT_POLICY = 19;
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWCP_DONOTROUND = 1;
const DWMWA_BORDER_COLOR = 34;
const DWMWA_COLOR_NONE = 0xfffffffe;
const DWMWA_SYSTEMBACKDROP_TYPE = 38;
const DWMSBT_NONE = 1;
// 흐림 영역 밖은 투명이다. 사각 재질과 달리 모퉁이를 칠하지 않는다.
const DWM_BB_ENABLE = 0x1;
const DWM_BB_BLURREGION = 0x2;
const AccentPolicy = koffi.struct('AccentPolicy', {
  AccentState: 'int32',
  AccentFlags: 'int32',
  GradientColor: 'uint32',
  AnimationId: 'int32',
});
const WindowCompositionAttribData = koffi.struct('WindowCompositionAttribData', {
  Attribute: 'int32',
  Data: 'AccentPolicy *',
  SizeOfData: 'uint32',
});
const MARGINS = koffi.struct('MARGINS', {
  cxLeftWidth: 'int32',
  cxRightWidth: 'int32',
  cyTopHeight: 'int32',
  cyBottomHeight: 'int32',
});
const DWM_BLURBEHIND = koffi.struct('DWM_BLURBEHIND', {
  dwFlags: 'uint32',
  fEnable: 'int32',
  hRgnBlur: 'void *',
  fTransitionOnMaximized: 'int32',
});
const DwmExtendFrameIntoClientArea = dwmapi.func('int32 __stdcall DwmExtendFrameIntoClientArea(void *hwnd, MARGINS *margins)');
const DwmSetWindowAttribute = dwmapi.func('int32 __stdcall DwmSetWindowAttribute(void *hwnd, uint32 attribute, uint8_t *value, uint32 size)');
const DwmEnableBlurBehindWindow = dwmapi.func('int32 __stdcall DwmEnableBlurBehindWindow(void *hwnd, DWM_BLURBEHIND *behind)');
const WM_SETREDRAW = 0x000B;
const WM_COMMAND = 0x0111;
// 바탕화면 보기의 '새로 고침'. 목록만 다시 읽고 아이콘 그림 곳간은 건드리지 않는다.
const DESKTOP_REFRESH = 0x7103;
const LVM_GETITEMCOUNT = 0x1004;
// 한 칸의 크기를 탐색기에게 직접 묻는다(LVM_FIRST + 51).
// 놓인 아이콘에서 재면 아이콘이 둘뿐일 때 두 칸 거리를 한 칸으로 잘못 볼 수 있다.
const LVM_GETITEMSPACING = 0x1033;
const LVM_GETITEMPOSITION = 0x1010;
const LVM_SETITEMPOSITION32 = 0x1031;

// 좌표를 lParam 에 담는 옛 메시지. 탐색기의 답을 기다리지 않고 보낼 수 있다.

const LVM_SETITEMPOSITION = 0x100f;
const LVM_GETITEMTEXTW = 0x1073;
const LVM_GETWORKAREAS = 0x1046;
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
let fileAttrs = new Map();
let homeFile = null;
let prepared = false;
let warned = false;
// 탐색기의 '아이콘 자동 정렬'을 우리가 껐다면 true. 끝낼 때 되돌린다.
let turnedOffAutoArrange = false;
// '격자에 맞춤' 도 마찬가지로 우리가 껐다면 true.
let turnedOffSnapToGrid = false;

function init(dir) {
  homeFile = path.join(dir, 'icon-homes.json');
  // 앞선 판이 넓혀 둔 채 끝났을 수 있다. 먼저 제자리로 돌려놓는다.
  guard(() => normalizeList());
  process.once('exit', () => {
    try {
      if (listFrozen) listRedraw(true);
      // 갑자기 끝나도 바탕화면은 원래대로 두고 나간다.
      homeAll();
      restoreArrange();
      for (const filePath of [...fileAttrs.keys()]) {
        if (revealFile(filePath)) notifyItem(filePath);
      }
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
      fileAttrs = new Map(Object.entries(parsed.fileAttrs || {}).map(([key, value]) => [key, Number(value)]));
      // 갑자기 끝났어도 밀어낸 아이콘을 알아보고 제자리로 돌려놓을 수 있게 적어 둔다.
      for (const key of parsed.nudged || []) nudged.add(key);
    } else {
      homes = new Map(Object.entries(parsed));
    }
  } catch (_err) {
    homes = new Map();
  }
  // 예전 판이 숨김 속성을 붙여 둔 파일은 바로 보통 파일로 되돌린다.
  // 탐색기와 바탕화면이 그 파일을 숨김 파일로 그리면 안 된다.
  guard(() => revealStored());
  // 예전 판이 꺼 둔 자동 정렬이 남아 있으면 아이콘을 옮겨도 자리가 고정된다.
  guard(() => restoreArrange());
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
    nudged: [...nudged],
    shellPrev: Object.fromEntries(shellPrev),
    fileAttrs: Object.fromEntries(fileAttrs),
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

// 자동 정렬이 켜져 있으면 탐색기가 아이콘 자리를 되돌려 놓는다. 창 스타일에서 지운다.
// 격자에 맞춤(LVS_EX_SNAPTOGRID)은 건드리지 않는다.
// 그 비트를 담아 LVM_SETEXTENDEDLISTVIEWSTYLE 을 보내면 comctl32 가 모든 아이콘을
// 격자로 끌어모은다. 치워 둔 아이콘이 화면 안으로 튀어나오는 것이 바로 그것이었다.
function manualArrange(list) {
  const style = styleOf(list);
  const autoOn = (style & LVS_AUTOARRANGE) !== 0;
  if (autoOn && !turnedOffAutoArrange) {
    turnedOffAutoArrange = true;
    persistHomes();
  }
  if (autoOn) SetWindowLongPtrW(list, GWL_STYLE, BigInt(style & ~LVS_AUTOARRANGE));
}

// 예전 판은 격자 보정을 피하려고 아이콘 영역과 목록 창을 화면 밖까지 넓혔다.
// 탐색기는 그래도 손을 뗄 때 아이콘을 모니터 안으로 끌어들였고,
// 탐색기 창 크기를 건드린 탓에 바탕화면이 이름만 그려지는 일까지 생겼다.
// 그래서 넓히지 않는다. 남아 있는 넓힘만 제자리로 돌려놓는다.
function normalizeList() {
  const list = findListView();
  if (!list) return;
  // 앞선 판이 감춘 채 끝났을 수 있다.
  showLayer(true);
  // 앞선 판이 셸 아이콘을 감춘 채 끝났을 수도 있다. 되돌려 놓고 시작한다.
  restoreShellIcons();
  // LVM_SETWORKAREAS 는 보내지 않는다. 그 메시지 하나에 바탕화면 아이콘의 그림이
  // 모두 사라지고 이름만 남는다. 탐색기를 다시 띄우기 전에는 돌아오지 않는다.
  // 앱을 켤 때마다 여기를 지나므로, 이것이 '켜면 아이콘이 사라진다'의 까닭이었다.
  const parent = GetParent(list);
  if (!parent) return;
  const rect = {};
  if (!GetClientRect(parent, rect)) return;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width <= 0 || height <= 0) return;
  const now = {};
  if (!GetClientRect(list, now)) return;
  // 목록 창 크기는 함부로 건드리지 않는다. 끝낸 뒤 바탕화면이 이름만 그려지는 것을 보았다.
  // 앞선 판이 넓혀 둔 것만 되돌린다. 좁히기만 하고, 넓히지는 않는다.
  if (now.right - now.left <= width && now.bottom - now.top <= height) return;
  trace(`앞선 판이 넓혀 둔 목록 창을 ${width}x${height} 로 좁힘`);
  SetWindowPos(list, null, 0, 0, width, height, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
}

function restoreArrange() {
  normalizeList();
  if (!turnedOffAutoArrange && !turnedOffSnapToGrid) return;
  const list = findListView();
  if (!list) return;

  // 예전 판이 꺼 둔 격자에 맞춤을 한 번만 되돌린다. 이제는 우리가 끄지 않는다.
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

function classOf(hwnd) {
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(hwnd, buf, 255);
  return Buffer.from(buf.subarray(0, n * 2)).toString('ucs2');
}

// 바탕화면 아이콘이 붙어 있는 맨 위 창. Progman 이거나, 벽지를 갈라 둔 WorkerW 다.
function desktopHost() {
  prepare();
  const progman = FindWindowW('Progman', 'Program Manager') || FindWindowW('Progman', null);
  if (progman && listIn(progman)) return progman;
  let previous = null;
  for (;;) {
    const worker = FindWindowExW(null, previous, 'WorkerW', null);
    if (!worker) return progman || null;
    previous = worker;
    if (listIn(worker)) return worker;
  }
}

function nativeHwnd(win) {
  try {
    if (!win || win.isDestroyed() || typeof win.getNativeWindowHandle !== 'function') return null;
    const buf = win.getNativeWindowHandle();
    if (!buf || buf.length < 4) return null;
    return buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
  } catch (_err) {
    return null;
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

function itemCount(session) {
  return Number(SendMessageW(session.list, LVM_GETITEMCOUNT, 0n, 0n));
}

function readAll(session) {
  const count = itemCount(session);
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

// 박스를 끄는 동안 쓰는 빠른 길.
// LVM_SETITEMPOSITION 은 좌표를 lParam 에 담으므로 건너편 메모리가 필요 없다.
// 좌표는 16비트라 화면 안에서만 쓴다.
function packPos(x, y) {
  if (x < 0 || y < 0 || x > 32767 || y > 32767) return null;
  return BigInt(((y & 0xffff) << 16) | (x & 0xffff)) & 0xffffffffn;
}

// 자리를 확정한 뒤에 창을 옮긴다. 메시지를 던져 두면 쌓여서 새로 들어온 아이콘이 천천히 따라온다.
function sendPos(list, index, x, y) {
  const lParam = packPos(x, y);
  if (lParam == null) return false;
  SendMessageW(list, LVM_SETITEMPOSITION, BigInt(index), lParam);
  return true;
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
function applyMoves(session, moves, keepArrange, live) {
  if (!moves.length) return false;
  // 자리를 한 번 옮기려고 자동 정렬을 끄면, 그 뒤로는 아이콘을 끌어도 자리가 고정된다.
  if (!keepArrange) manualArrange(session.list);
  // 끄는 동안에는 자리를 확정하고 끝낸다. 던져 두면 아이콘이 창보다 늦게 그려진다.
  let synced = !!live;
  for (const move of moves) {
    if (live && sendPos(session.list, move.index, move.x, move.y)) continue;
    synced = false;
    writePos(session, move.index, move.x, move.y);
  }
  // 옮긴 자리는 읽어 둔 목록에도 반영한다. 끄는 동안 같은 것을 되풀이해 옮기지 않는다.
  if (listCache) {
    for (const move of moves) {
      const found = listCache.items.find((icon) => icon.index === move.index);
      if (found) {
        found.x = move.x;
        found.y = move.y;
      }
    }
  }
  // 자리를 바꾼 뒤에는 바탕화면을 다시 그리게 한다. 그러지 않으면 옛 그림이 남는다.
  // UpdateWindow 는 탐색기가 다 그릴 때까지 우리를 멈춰 세운다(계측 8.4ms).
  // 박스를 끄는 동안에는 항목 자리 메시지가 그 칸만 고친다. 바탕 전체를 지우면
  // 그 그림이 늦어져, 새로 들어온 아이콘이 창 뒤를 따라온다.
  if (!listFrozen && !synced) {
    InvalidateRect(session.list, null, 1);
    if (!live) UpdateWindow(session.list);
  }
  if (!live) persistHomes();
  return true;
}

// 바탕화면 목록 읽기. 박스를 끄는 동안에는 방금 읽은 것을 다시 쓴다.
// 우리가 옮긴 자리는 applyMoves 가 여기에 반영하므로 어긋나지 않는다.
let listCache = null;

function readMaybeCached(session, live) {
  if (live && listCache && Date.now() - listCache.at < 900) return listCache.items;
  const items = readAll(session);
  listCache = { at: Date.now(), items };
  return items;
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

// 셸 아이콘을 감추거나 되살린 뒤, 바탕화면이 그 값을 다시 읽게 한다.
// SHCNE_ASSOCCHANGED 는 쓰지 않는다. 그 알림 하나에 셸이 아이콘 그림 곳간을 통째로
// 다시 만들고, 그동안 바탕화면이 그림 없이 이름만 그려진다. 계측으로 확인했다.
// 바탕화면 보기에 '새로 고침'만 보내면 목록만 다시 읽고 그림 곳간은 건드리지 않는다.
function refreshShellIcons() {
  try {
    const list = findListView();
    const view = list ? GetParent(list) : null;
    if (!view) return;
    // 탐색기가 바쁘면 기다리지 않는다. 다음 새로 고침 때 따라온다.
    SendMessageTimeoutW(view, WM_COMMAND, DESKTOP_REFRESH, 0, 0, 200, null);
  } catch (_err) {
    /* 새로 고침이 실패해도 레지스트리 값은 남는다. */
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

// 박스에 담아도 파일은 건드리지 않는다. 옮기지도, 감추지도 않는다.
// 아래는 예전 판이 숨김 속성을 붙여 둔 파일을 다시 보이게 되돌리는 길이다.
const FILE_ATTRIBUTE_HIDDEN = 0x2;
const FILE_ATTRIBUTE_SYSTEM = 0x4;
const INVALID_FILE_ATTRIBUTES = 0xffffffff;

function notifyItem(filePath) {
  try {
    SHChangeNotifyPath(0x00002000, 0x0005 | 0x1000, filePath, null);
  } catch (_err) {
    /* 알림이 실패해도 속성은 남는다. */
  }
}

function revealFile(filePath) {
  if (!filePath || String(filePath).startsWith('shell:')) return false;
  const saved = fileAttrs.has(filePath) ? (fileAttrs.get(filePath) >>> 0) : null;
  fileAttrs.delete(filePath);
  const attr = GetFileAttributesW(filePath) >>> 0;
  if (attr === INVALID_FILE_ATTRIBUTES) return false;
  const next = saved == null ? (attr & ~(FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) >>> 0 : saved;
  if (next === attr) return false;
  return !!SetFileAttributesW(filePath, next);
}

function revealStored() {
  const paths = [...fileAttrs.keys()];
  let changed = false;
  for (const filePath of paths) {
    if (revealFile(filePath)) {
      notifyItem(filePath);
      changed = true;
    }
  }
  if (changed) persistHomes();
}

// 박스 칸에 앉혀 둔 바탕화면 아이콘. 키는 아이콘 이름, 값은 마지막으로 앉힌 자리.
// 박스 안에 있는 것이 맞으므로 밀어내기(nudge)는 이것을 건드리지 않는다.
const seated = new Map();

function toPhysicalPoint(point) {
  if (!point) return null;
  try {
    const { screen } = require('electron');
    const phys = screen.dipToScreenPoint({ x: point.x, y: point.y });
    return { x: Math.round(phys.x), y: Math.round(phys.y) };
  } catch (_err) {
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }
}

// 박스에 담긴 바탕화면 아이콘을 그 박스의 칸으로 옮긴다.
//
// 파일은 옮기지 않고 속성도 바꾸지 않는다. 탐색기는 보통 파일로 보여 준다.
// 박스를 끌면 칸의 화면 좌표가 바뀌고, 아이콘을 그 좌표로 다시 놓아 함께 움직인다.
// 박스에서 빠지고도 아직 그 칸에 있으면 담기 전 자리로 돌려 바탕화면에 다시 보인다.
// 사람이 칸 밖으로 끌어 둔 것은 그 자리에 둔다. 정렬을 되돌리지 않는다.
// places 의 x, y 는 DIP 다. 바탕화면 아이콘 좌표는 실제 픽셀이라 여기서 바꾼다.
function seatKept(places, live) {
  const list = places || [];
  return guard(() => withList((session) => {
    if (!session) return false;
    const listed = readMaybeCached(session, !!live);
    const moves = [];
    const next = new Map();
    for (const place of list) {
      if (!place || !place.name) continue;
      const icon = listed.find((entry) => sameName(entry.name, place.name));
      if (!icon) continue;
      const key = keyOf(icon.name);
      const point = toPhysicalPoint(place);
      if (!point) continue;
      if (!homes.has(key) && !isParked(icon)) homes.set(key, { x: icon.x, y: icon.y });
      next.set(key, { x: point.x, y: point.y, index: icon.index, name: icon.name });
      if (Math.abs(icon.x - point.x) > 2 || Math.abs(icon.y - point.y) > 2) {
        moves.push({ index: icon.index, x: point.x, y: point.y });
      }
    }
    for (const [key, at] of seated) {
      if (next.has(key)) continue;
      const icon = listed.find((entry) => keyOf(entry.name) === key);
      if (!icon) continue;
      const stillThere = Math.abs(icon.x - at.x) < 40 && Math.abs(icon.y - at.y) < 40;
      if (!stillThere) continue;
      const home = homes.get(key);
      if (!home || (home.x === icon.x && home.y === icon.y)) continue;
      moves.push({ index: icon.index, x: home.x, y: home.y });
    }
    seated.clear();
    for (const [key, point] of next) seated.set(key, point);
    if (!moves.length) return false;
    trace(`박스 칸으로 아이콘 ${moves.length}개를 옮긴다`);
    return applyMoves(session, moves, false, !!live);
  }));
}

// 이 번 끌기에서 번호 없는 아이콘을 이미 찾아 보았는가. 매 프레임 읽으면 박스가 느려진다.
let followLatched = false;
// 자리를 옮기는 동안 바탕화면 그림을 멈춰 둔 목록. 창이 덮기 전에 그리면 밖에 비친다.
let followList = null;
// 창이 새 자리를 덮은 뒤에 옮길 아이콘. 그 전에 그리면 박스 밖에 잠깐 보인다.
let pendingMoves = [];
// 창을 옮기기 전에 자리만 바꿔 둔 아이콘. 그림은 창이 덮은 뒤에 친다.
let carried = [];

function invalidateAt(list, x, y, w, h) {
  const rect = Buffer.alloc(16);
  rect.writeInt32LE(x | 0, 0);
  rect.writeInt32LE(y | 0, 4);
  rect.writeInt32LE((x + w) | 0, 8);
  rect.writeInt32LE((y + h) | 0, 12);
  InvalidateRect(list, rect, 1);
}

function validateAt(list, x, y, w, h) {
  const rect = Buffer.alloc(16);
  rect.writeInt32LE(x | 0, 0);
  rect.writeInt32LE(y | 0, 4);
  rect.writeInt32LE((x + w) | 0, 8);
  rect.writeInt32LE((y + h) | 0, 12);
  ValidateRect(list, rect);
}

// 아이콘 글자는 칸보다 넓다. 칸만 지우면 글자 잔상이 박스 밖에 남는다.
function cellBox(x, y, spacing) {
  const cx = spacing && spacing.cx ? spacing.cx : 128;
  const cy = spacing && spacing.cy ? spacing.cy : 112;
  const side = Math.round(cx * 0.5) + 8;
  return { x: x - side, y: y - 8, w: cx + side * 2, h: cy + 24 };
}

// 번호가 없는 아이콘만 목록에서 찾는다. 자리는 옮기지 않는다.
// 창을 옮긴 뒤에 찾으면, 그 동안 아이콘이 박스 뒤를 따라온다.
function noteSeats(places) {
  if (followLatched) return;
  const want = places || [];
  if (!want.length) return;
  let missing = seated.size === 0;
  if (!missing) {
    for (const place of want) {
      let found = false;
      for (const entry of seated.values()) {
        if (entry.index != null && sameName(entry.name, place.name)) {
          found = true;
          break;
        }
      }
      if (!found) {
        missing = true;
        break;
      }
    }
  }
  if (!missing) return;
  followLatched = true;
  guard(() => withList((session) => {
    if (!session) return false;
    const listed = readMaybeCached(session, true);
    for (const place of want) {
      const icon = listed.find((entry) => sameName(entry.name, place.name));
      if (!icon) continue;
      const key = keyOf(icon.name);
      const have = seated.get(key);
      if (have && have.index != null) continue;
      seated.set(key, { x: icon.x, y: icon.y, index: icon.index, name: icon.name });
    }
    return true;
  }));
}

function rememberMove(move) {
  if (listCache) {
    const found = listCache.items.find((icon) => icon.index === move.index);
    if (found) {
      found.x = move.x;
      found.y = move.y;
    }
  }
  move.slot.x = move.x;
  move.slot.y = move.y;
}

// 창을 옮기기 전에 부른다. 아이콘 자리만 새 칸으로 바꾸고, 옛 그림만 지운다.
// 새 칸을 지금 그리면 창이 아직 옛 자리에 있어 아이콘이 박스 밖에 보인다.
// 옛 그림을 남겨 두고 창만 옮기면, 그 그림이 박스 밖에 남는다.
function armFollow() {
  const list = followList;
  const moves = pendingMoves;
  pendingMoves = [];
  if (!list || !moves.length) return false;
  const spacing = itemSpacing(list) || { cx: 128, cy: 112 };
  const hold = !listFrozen;
  if (hold) SendMessageTimeoutW(list, WM_SETREDRAW, 0, 0, 0, 8, null);
  const spots = [];
  try {
    for (const move of moves) {
      const fromX = move.slot ? move.slot.x : move.x;
      const fromY = move.slot ? move.slot.y : move.y;
      if (!sendPos(list, move.index, move.x, move.y)) continue;
      spots.push({ fromX, fromY, x: move.x, y: move.y });
      rememberMove(move);
    }
  } finally {
    if (hold) SendMessageW(list, WM_SETREDRAW, 1n, 0n);
  }
  carried = spots;
  if (!hold || !spots.length) return spots.length > 0;
  // 다시 그리기를 켜면 목록 전체가 더러워진다. 먼저 걷어 내고 옛 자리만 지운다.
  ValidateRect(list, null);
  for (const spot of spots) {
    const oldBox = cellBox(spot.fromX, spot.fromY, spacing);
    invalidateAt(list, oldBox.x, oldBox.y, oldBox.w, oldBox.h);
  }
  // 새 자리와 겹치는 칸은 아직 그리지 않는다. 창 밖에서 아이콘이 나타난다.
  for (const spot of spots) {
    const nextBox = cellBox(spot.x, spot.y, spacing);
    validateAt(list, nextBox.x, nextBox.y, nextBox.w, nextBox.h);
  }
  UpdateWindow(list);
  return true;
}

// 창이 새 자리를 덮은 뒤에 부른다. 여기서 새 칸을 그린다.
// 아직 자리를 못 바꾼 것이 있으면 지금 바꾼다. 하나씩 그리면 뒤의 아이콘이 늦게 따라온다.
function paintFollow() {
  const list = followList;
  const moves = pendingMoves;
  pendingMoves = [];
  const spots = carried;
  carried = [];
  if (!list) return false;
  const hold = !listFrozen;
  if (moves.length) {
    if (hold) SendMessageTimeoutW(list, WM_SETREDRAW, 0, 0, 0, 8, null);
    try {
      for (const move of moves) {
        const fromX = move.slot ? move.slot.x : move.x;
        const fromY = move.slot ? move.slot.y : move.y;
        if (!sendPos(list, move.index, move.x, move.y)) continue;
        spots.push({ fromX, fromY, x: move.x, y: move.y });
        rememberMove(move);
      }
    } finally {
      // 타임아웃으로 켜면 그리기가 꺼진 채 남을 수 있다. 켜는 쪽은 답이 올 때까지 기다린다.
      if (hold) SendMessageW(list, WM_SETREDRAW, 1n, 0n);
    }
  }
  if (!hold || !spots.length) return spots.length > 0;
  const spacing = itemSpacing(list) || { cx: 128, cy: 112 };
  for (const spot of spots) {
    const oldBox = cellBox(spot.fromX, spot.fromY, spacing);
    invalidateAt(list, oldBox.x, oldBox.y, oldBox.w, oldBox.h);
    if (spot.x !== spot.fromX || spot.y !== spot.fromY) {
      const nextBox = cellBox(spot.x, spot.y, spacing);
      invalidateAt(list, nextBox.x, nextBox.y, nextBox.w, nextBox.h);
    }
  }
  UpdateWindow(list);
  return true;
}

// 손을 떼면 다음 끌기에서 번호 없는 아이콘을 다시 찾는다.
// 여기서 그리면 창보다 먼저 아이콘이 움직인다. 그리기는 창을 옮긴 뒤에 한다.
function followReset() {
  followLatched = false;
  pendingMoves = [];
  carried = [];
  followList = null;
}

// 박스를 끄는 동안 칸에 앉힌 아이콘만 새 좌표로 적는다. 그리지는 않는다.
// 목록을 다시 읽거나 다른 아이콘을 밀지 않는다. 그 일이 박스 이동을 느리게 만든다.
// 번호는 직전에 앉힐 때 적어 둔 것을 쓴다. 번호가 없으면 끌기 처음에 한 번만 찾는다.
// 여기서 옮기거나 그리면, 창이 아직 옛 자리에 있어 아이콘이 밖에 보이거나 늦게 따라온다.
function followSeats(places) {
  const want = places || [];
  if (!want.length) return false;
  const list = findListView();
  if (!list) return false;
  noteSeats(want);
  if (!seated.size) return false;
  const moves = [];
  for (const place of want) {
    let slot = null;
    for (const entry of seated.values()) {
      if (sameName(entry.name, place.name)) {
        slot = entry;
        break;
      }
    }
    if (!slot || slot.index == null) continue;
    const point = toPhysicalPoint(place);
    if (!point) continue;
    if (Math.abs(slot.x - point.x) <= 1 && Math.abs(slot.y - point.y) <= 1) continue;
    moves.push({ slot, index: slot.index, x: point.x, y: point.y });
  }
  if (!moves.length) return false;
  // 지금은 좌표만 적는다. 창보다 먼저 그리면 아이콘이 밖에 보이고, 창만 먼저 가면 늦게 따라온다.
  followList = list;
  pendingMoves = moves;
  return true;
}

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
  return iconAt(listed, pos);
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


// 바탕화면에 남겨 둘 아이콘이 하나도 없으면 아이콘 층을 통째로 감춘다.
// 윈도우의 '바탕화면 아이콘 표시' 끄기와 같은 방법이다.
// 자리를 옮겨 숨기는 것과 달리 되돌려 놓을 자리가 없어, 탐색기가 끌어낼 수도 없다.
// 바탕화면 오른쪽 단추 메뉴는 그대로 뜬다.
let layerHidden = false;

function showLayer(on) {
  const list = findListView();
  if (!list) return false;
  const now = !!IsWindowVisible(list);
  if (now === !!on) {
    layerHidden = !on;
    return false;
  }
  trace(on ? '아이콘 층을 보인다' : '아이콘 층을 감춘다');
  // SW_SHOWNA 는 창을 앞으로 끌어내지 않고 보이기만 한다.
  ShowWindow(list, on ? SW_SHOWNA : SW_HIDE);
  layerHidden = !on;
  return true;
}

let listFrozen = false;

function listRedraw(on) {
  const list = findListView();
  if (!list) return;
  trace(on ? '다시 그리기 켬' : '다시 그리기 끔');
  SendMessageTimeoutW(list, WM_SETREDRAW, on ? 1 : 0, 0, 0, 50, null);
  listFrozen = !on;
  if (on) {
    InvalidateRect(list, null, 1);
    UpdateWindow(list);
  }
}

// 예전 판이 바탕화면에 해 둔 것을 되돌린다.
// 이제 박스는 제 폴더에서 돌아가므로 바탕화면 아이콘은 건드리지 않는다.
// 예전 판으로 쓰던 사람이 올라왔을 때만 할 일이 남아 있다.
function release(items) {
  showLayer(true);
  restoreShellIcons();
  for (const item of items || []) {
    if (item && item.path && !String(item.path).startsWith('shell:') && revealFile(item.path)) notifyItem(item.path);
  }
  for (const filePath of [...fileAttrs.keys()]) {
    if (revealFile(filePath)) notifyItem(filePath);
  }
  homeAll();
  persistHomes();
}

// 밀어냈던 아이콘을 제자리로 들인다.
//
// 박스를 옮기면 그 자리가 빈다. 비켜 준 아이콘을 그대로 두면 박스가 지나간 자리마다
// 구멍이 남아, 바탕화면이 점점 흐트러진다. 적어 둔 자리가 이제 비었으면 돌려놓는다.
// 돌아갈 자리가 아직 박스에 가렸거나 남이 쓰고 있으면 그대로 둔다.
function homecoming(icons, walls, grid, moves) {
  if (!nudged.size) return [];
  const going = new Map(moves.map((move) => [move.index, move]));
  const taken = new Set();
  for (const icon of icons) {
    const at = going.get(icon.index) || icon;
    taken.add(`${at.x},${at.y}`);
  }
  const back = [];
  for (const icon of icons) {
    if (going.has(icon.index)) continue;
    const key = keyOf(icon.name);
    if (!nudged.has(key)) continue;
    const home = homes.get(key);
    if (!home) continue;
    if (home.x === icon.x && home.y === icon.y) {
      nudged.delete(key);
      continue;
    }
    if (deskgrid.blocked(deskgrid.cellOf(home, grid), grid, walls)) continue;
    if (taken.has(`${home.x},${home.y}`)) continue;
    taken.delete(`${icon.x},${icon.y}`);
    taken.add(`${home.x},${home.y}`);
    nudged.delete(key);
    back.push({ index: icon.index, x: home.x, y: home.y });
  }
  if (back.length) trace(`비켜 줬던 아이콘 ${back.length}개를 제자리로 들인다`);
  return back;
}

// 박스가 깔고 앉은 바탕화면 아이콘을 빈 칸으로 밀어낸다.
// 옮기는 자리는 모두 화면 안이다. 탐색기가 되돌릴 까닭이 없어 다툼이 생기지 않는다.
// 이번에 우리가 밀어낸 아이콘의 이름. 끝낼 때 적어 둔 자리로 돌려놓는다.
const nudged = new Set();

function nudge(blocks, live) {
  const walls = (blocks || []).map(toPhysicalRect).filter(Boolean);
  if (!walls.length) return false;
  return guard(() => withList((session) => {
    if (!session) return false;
    const listed = readMaybeCached(session, live);
    if (!listed.length) return false;
    // 박스 칸에 앉힌 아이콘은 그 자리에 있는 것이 맞다. 밖으로 밀면 박스를 따라가지 못한다.
    const origin = walls[0];
    const visible = listed
      .filter((icon) => !seated.has(keyOf(icon.name)))
      .map((icon) => (
        isParked(icon) ? { ...icon, x: origin.x + 1, y: origin.y + 1 } : icon
      ));
    // 박스를 맞춘 격자와 같은 것으로 민다. 서로 다른 격자를 쓰면 줄이 어긋난다.
    const grid = latticeOf(session.list, visible);
    const moves = deskgrid.relocate(visible, walls, desktopArea(), grid);
    // 박스가 비켜 간 자리로는 밀어냈던 아이콘이 돌아온다.
    for (const back of homecoming(visible, walls, grid, moves)) moves.push(back);
    if (!moves.length) return false;
    // 옮기기 전 자리를 적어 둔다. 적어 두지 않으면 끝낼 때 돌려놓을 곳을 모른다.
    // 이미 적힌 것은 그대로 둔다. 처음 자리가 진짜 제자리이기 때문이다.
    const byIndex = new Map(listed.map((icon) => [icon.index, icon]));
    for (const move of moves) {
      const icon = byIndex.get(move.index);
      if (!icon) continue;
      const key = keyOf(icon.name);
      if (!homes.has(key) && !isParked(icon)) homes.set(key, { x: icon.x, y: icon.y });
      nudged.add(key);
    }
    trace(`박스에 가린 아이콘 ${moves.length}개를 옆으로 옮긴다`);
    // 자동 정렬이 켜져 있으면 탐색기가 밀어낸 아이콘을 곧바로 제자리로 되돌린다.
    // 되돌아간 자리는 박스 밑이라 그 아이콘은 고를 수도, 열 수도 없다.
    // 그래서 아이콘을 옮기기 전에 자동 정렬을 끈다. 끈 것은 적어 두었다가
    // 끝낼 때 restoreArrange 가 되돌린다.
    return applyMoves(session, moves, false, live);
  }));
}

// 바탕화면 아이콘 격자. 박스를 그 격자에 맞출 때 쓴다.
//
// 칸 크기는 지금 놓인 아이콘들에서 읽어 온다. 화면 배율이나 아이콘 크기 설정이
// 달라도 따라간다. 돌려주는 값은 DIP 다. 박스 자리도 DIP 이기 때문이다.
// 아이콘이 없어 잴 수 없으면 아무것도 돌려주지 않는다. 그때는 박스를 그린 그대로 둔다.
// 탐색기가 쓰는 한 칸의 크기. 못 물으면 0 을 준다.
function itemSpacing(list) {
  const packed = Number(SendMessageW(list, LVM_GETITEMSPACING, 0, 0));
  if (!packed || packed < 0) return null;
  const cx = packed & 0xffff;
  const cy = (packed >> 16) & 0xffff;
  if (cx < 16 || cy < 16) return null;
  return { cx, cy };
}

// 박스와 아이콘이 함께 설 격자.
//
// 칸 크기는 탐색기에게 묻고, 못 물으면 놓인 아이콘에서 잰다.
// 원점은 위상만 쓴다. 아이콘을 밀어내도 격자가 움직이지 않아야 박스가 제자리에 머문다.
function latticeOf(list, listed) {
  const measured = deskgrid.metrics(listed);
  const spacing = itemSpacing(list);
  const dx = spacing ? spacing.cx : measured.dx;
  const dy = spacing ? spacing.cy : measured.dy;
  return {
    dx,
    dy,
    x0: deskgrid.wrap(measured.x0, dx),
    y0: deskgrid.wrap(measured.y0, dy),
  };
}

function gridInfo() {
  return guard(() => withList((session) => {
    if (!session) return null;
    const listed = readAll(session).filter((icon) => !isParked(icon));
    if (!listed.length) return null;
    const grid = latticeOf(session.list, listed);
    const origin = toDipRect({ x: grid.x0, y: grid.y0, width: grid.dx, height: grid.dy });
    if (!origin || origin.w < 8 || origin.h < 8) return null;
    return { x0: origin.x, y0: origin.y, dx: origin.w, dy: origin.h };
  })) || null;
}

// 보관함 폴더를 탐색기에서 감춘다. 바탕화면 아래에 두므로 감추지 않으면 아이콘이 하나 늘어난다.
function hidePath(target) {
  if (!target) return false;
  const attr = GetFileAttributesW(target) >>> 0;
  if (attr === INVALID_FILE_ATTRIBUTES) return false;
  const next = (attr | FILE_ATTRIBUTE_HIDDEN) >>> 0;
  if (next === attr) return true;
  return !!SetFileAttributesW(target, next);
}


function refreshFolder(dir) {
  if (!dir) return;
  try {
    SHChangeNotifyPath(0x00001000, 0x0005 | 0x1000, dir, null);
  } catch (_err) {
    /* 알림이 없어도 탐색기가 곧 알아챈다. */
  }
}

// 창 자리(DIP)를 바탕화면 아이콘이 쓰는 실제 픽셀 자리로 옮긴다.
function toPhysicalRect(rect) {
  if (!rect) return null;
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

// 아이콘을 놓을 수 있는 넓이. 작업 표시줄을 뺀 자리다.
function desktopArea() {
  try {
    const { screen } = require('electron');
    const area = screen.getPrimaryDisplay().workArea;
    return toPhysicalRect({ x: area.x, y: area.y, width: area.width, height: area.height });
  } catch (_err) {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
}

// 박스에 담기 전에 그 아이콘이 있던 자리를 적어 둔다.
// 나중에 바탕화면으로 돌려줄 때 그 자리에 놓는다.
function noteHome(name) {
  if (!name) return false;
  return guard(() => withList((session) => {
    if (!session) return false;
    const icon = readAll(session).find((entry) => sameName(entry.name, name));
    if (!icon || isParked(icon)) return false;
    homes.set(keyOf(icon.name), { x: icon.x, y: icon.y });
    persistHomes();
    return true;
  }));
}

// 바탕화면으로 돌려준 아이콘을 적어 둔 자리에 놓는다.
// 자리를 모르면 탐색기가 정한 자리에 그대로 둔다.
function putHome(names) {
  const want = (names || []).filter(Boolean);
  if (!want.length) return false;
  return guard(() => withList((session) => {
    if (!session) return false;
    const moves = [];
    for (const icon of readAll(session)) {
      if (!want.some((name) => sameName(icon.name, name))) continue;
      const home = homes.get(keyOf(icon.name));
      if (!home) continue;
      if (home.x === icon.x && home.y === icon.y) continue;
      moves.push({ index: icon.index, x: home.x, y: home.y });
    }
    if (!moves.length) return false;
    trace(`돌려준 아이콘 ${moves.length}개를 적어 둔 자리에 놓는다`);
    return applyMoves(session, moves);
  }));
}

// 박스를 바탕화면 바로 위에, 다른 프로그램 창보다는 아래에 둔다.
//
// Palisades 는 HWND_BOTTOM 으로 항상 맨 뒤에 붙인다. 그 자리는 바탕화면보다
// 뒤라 박스가 사라진다. 그래서 바탕화면 창의 바로 위를 찾아 그 아래에 끼운다.
// 끼워 넣을 창이 없으면 맨 위로 올려 바탕화면보다는 앞에 있게 한다.
function place(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(false);
  const hwnd = nativeHwnd(win);
  if (!hwnd) return;
  try {
    const shell = desktopHost();
    const above = shell ? GetWindow(shell, GW_HWNDPREV) : null;
    const behind = above && String(above) !== String(hwnd) ? above : HWND_TOP;
    SetWindowPos(hwnd, behind, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  } catch (_err) {
    /* 바탕화면 층을 못 찾으면 보통 창으로 둔다. */
  }
}

// 둥근 모서리 밖은 창에 넣지 않는다. 흐림을 켜도 그 칸은 바탕이 그대로 비친다.
// radius 와 inset 은 DIP 다. 창 크기는 실제 픽셀이라 여기서 맞춘다.
const blurWanted = new WeakMap();
const shapeOf = new WeakMap();
const regionKey = new WeakMap();
const watched = new WeakSet();
const clipQueued = new WeakSet();
let setComposition = null;

// 재질을 켠 직후 창 영역이 풀리는 경우가 있다. 지금 크기로 한 번 더 자른다.
function scheduleClip(win) {
  if (clipQueued.has(win)) return;
  clipQueued.add(win);
  setImmediate(() => {
    clipQueued.delete(win);
    if (!win || win.isDestroyed()) return;
    const shape = shapeOf.get(win);
    if (!shape) return;
    regionKey.delete(win);
    applyRegion(win, shape.radiusDip, shape.insetDip, 'again');
  });
}

function watchShape(win) {
  if (watched.has(win)) return;
  watched.add(win);
  const again = () => {
    if (!win || win.isDestroyed()) return;
    const shape = shapeOf.get(win);
    if (!shape) return;
    regionKey.delete(win);
    applyRegion(win, shape.radiusDip, shape.insetDip);
  };
  try {
    win.on('show', again);
    win.on('resize', again);
  } catch (_err) {
    /* 창이 이미 닫혔다. */
  }
}

function writeAttr(hwnd, attribute, value) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value >>> 0);
  DwmSetWindowAttribute(hwnd, attribute, data, 4);
}

// 사각 전체를 흐리는 효과는 끈다. 켜 두면 모퉁이 밖이 흐리게 남는다.
function disableAccent(hwnd) {
  try {
    if (!setComposition) {
      setComposition = user32.func('int __stdcall SetWindowCompositionAttribute(void *hwnd, WindowCompositionAttribData *data)');
    }
    setComposition(hwnd, {
      Attribute: WCA_ACCENT_POLICY,
      Data: {
        AccentState: ACCENT_DISABLED,
        AccentFlags: 0,
        GradientColor: 0,
        AnimationId: 0,
      },
      SizeOfData: koffi.sizeof(AccentPolicy),
    });
  } catch (_err) {
    /* 사각 흐림을 끄지 못해도 모서리 자르기는 한다. */
  }
}

// 사각으로 깔리는 재질은 끈다. 아크릴과 프레임 확장은 모퉁이까지 칠한다.
function applyMaterial(win, hwnd) {
  try {
    if (typeof win.setBackgroundMaterial === 'function') win.setBackgroundMaterial('none');
  } catch (_err) {
    /* 재질을 끄지 못해도 아래 호출로 사각 흐림은 거둔다. */
  }
  try {
    DwmExtendFrameIntoClientArea(hwnd, {
      cxLeftWidth: 0,
      cxRightWidth: 0,
      cyTopHeight: 0,
      cyBottomHeight: 0,
    });
    writeAttr(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_NONE);
    writeAttr(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND);
    writeAttr(hwnd, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE);
  } catch (_err) {
    /* 흐림을 못 꺼도 모서리 자르기는 한다. */
  }
  disableAccent(hwnd);
}

// 흐림은 둥근 영역 안에만 둔다. 그 밖은 바탕이 그대로 비친다.
function setBlurShape(hwnd, rgn, on) {
  try {
    DwmEnableBlurBehindWindow(hwnd, {
      dwFlags: on && rgn ? (DWM_BB_ENABLE | DWM_BB_BLURREGION) : DWM_BB_ENABLE,
      fEnable: on ? 1 : 0,
      hRgnBlur: on && rgn ? rgn : null,
      fTransitionOnMaximized: 0,
    });
  } catch (_err) {
    /* 영역 흐림을 못 켜도 창 모양은 자른다. */
  }
}

function makeRound(inset, across, down, radius) {
  return CreateRoundRectRgn(inset, inset, inset + across + 1, inset + down + 1, radius * 2, radius * 2);
}

function applyRegion(win, radiusDip, insetDip, later) {
  if (!win || win.isDestroyed()) return false;
  const hwnd = nativeHwnd(win);
  if (!hwnd) return false;
  const box = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!GetClientRect(hwnd, box)) return false;
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width < 2 || height < 2) return false;
  let scale = 1;
  try {
    const dip = win.getBounds();
    if (dip && dip.width > 0) scale = width / dip.width;
  } catch (_err) {
    scale = 1;
  }
  const blurOn = blurWanted.get(win) === true;
  const key = `${Math.round(Number(radiusDip) || 0)}|${Math.round(Number(insetDip) || 0)}|${width}|${height}|${blurOn ? 1 : 0}`;
  if (!later && regionKey.get(win) === key) return true;
  const inset = Math.max(0, Math.round((Number(insetDip) || 0) * scale));
  const across = width - inset * 2;
  const down = height - inset * 2;
  if (across < 2 || down < 2) return false;
  let radius = Math.round((Number(radiusDip) || 0) * scale);
  radius = Math.max(0, Math.min(radius, Math.floor(Math.min(across, down) / 2)));
  if (radius < 1) {
    setBlurShape(hwnd, null, false);
    SetWindowRgn(hwnd, null, 1);
    regionKey.set(win, key);
    return true;
  }
  // 오른쪽과 아래는 포함되지 않아 한 픽셀이 사각으로 남는다. 한 칸 더 잡아 맞춘다.
  // 흐림용 영역은 우리가 지우고, 창 모양용 영역은 SetWindowRgn 이 가져간다.
  const blurRgn = blurOn ? makeRound(inset, across, down, radius) : null;
  const rgn = makeRound(inset, across, down, radius);
  if (!rgn) {
    if (blurRgn) DeleteObject(blurRgn);
    return false;
  }
  if (!SetWindowRgn(hwnd, rgn, 1)) {
    DeleteObject(rgn);
    if (blurRgn) DeleteObject(blurRgn);
    return false;
  }
  setBlurShape(hwnd, blurRgn, blurOn);
  if (blurRgn) DeleteObject(blurRgn);
  regionKey.set(win, key);
  if (later !== 'again') scheduleClip(win);
  return true;
}

function roundWindow(win, radiusDip, insetDip) {
  if (!win || win.isDestroyed()) return false;
  shapeOf.set(win, { radiusDip, insetDip });
  watchShape(win);
  return applyRegion(win, radiusDip, insetDip);
}

// 반투명 박스 뒤로 바탕화면을 흐려 비춘다. 끄면 흐림을 거둔다.
// 모퉁이 밖은 흐리지 않는다. 사각 흐림은 켜지 않는다.
function blurBehind(win, on) {
  if (!win || win.isDestroyed()) return;
  const want = !!on;
  if (blurWanted.get(win) === want) return;
  blurWanted.set(win, want);
  const hwnd = nativeHwnd(win);
  if (hwnd) applyMaterial(win, hwnd);
  regionKey.delete(win);
  const shape = shapeOf.get(win);
  if (shape) applyRegion(win, shape.radiusDip, shape.insetDip);
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
// 담긴 아이콘은 목록에 없으므로 끄는 동안 그려질 일이 없다. 그래서 그리기를 멈추지 않는다.
function watchDrag(onRect, onSettle, onDrop) {
  let start = null;
  let held = null;
  let wasDown = false;
  let settleTimer = null;
  let lastWatch = 0;
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
      // 빈 곳에서 시작한 끌기만 새 박스 후보이다. 아이콘 위는 그 아이콘을 옮기는 것이다.
      start = onDesktop && !icon ? { x: pos.x, y: pos.y } : null;
    } else if (!down && wasDown) {
      // 떼는 순간 탐색기가 화면 밖 아이콘을 끌어낸다. 곧바로, 그리고 잠깐 더 쫓아가 되치운다.
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
        // 그 안에 아이콘이 있으면 여러 개를 고른 것이지, 박스를 그리는 것이 아니다.
        const listed = withList((session) => (session ? readAll(session) : [])) || [];
        if (shouldOfferFence(rect, listed)) onRect(toDipRect(rect));
        else settle();
      } else {
        settle();
      }
    } else if (!down && Date.now() - lastWatch > 250) {
      // 탐색기가 목록을 다시 채웠는지 이따금 살핀다. 길이만 묻는 싼 확인이다.
      lastWatch = Date.now();
    }
    wasDown = down;
  }, 16);
  return () => {
    clearTimeout(settleTimer);
    clearInterval(timer);
  };
}

const SM_CXDOUBLECLK = 36;
const SM_CYDOUBLECLK = 37;

// 사용자가 정한 두 번 누르기 시간. 너무 짧거나 긴 값은 손본다.
function doubleTime() {
  try {
    const ms = Number(GetDoubleClickTime());
    if (!Number.isFinite(ms) || ms <= 0) return 500;
    return Math.max(200, Math.min(1000, ms));
  } catch (_err) {
    return 500;
  }
}

// 두 번째 누름이 첫 번째와 얼마나 떨어져도 되는지.
//
// 운영체제가 주는 값(보통 4픽셀)은 아이콘을 두 번 눌러 여는 데 쓰는 잣대다.
// 여기서 하는 일은 '빈 바탕화면을 두 번 눌러 박스를 감추기'라서 그만한 정확도가
// 필요 없다. 실제로 재 보니 손이 두 번 누르는 사이 20픽셀 넘게 움직였고,
// 4픽셀로 재면 그 모두를 두 번으로 세지 않았다. 넉넉하게 잡는다.
const SLOP_FLOOR = 28;

function doubleSlop() {
  try {
    return {
      x: Math.max(SLOP_FLOOR, (Number(GetSystemMetrics(SM_CXDOUBLECLK)) || 0) * 4),
      y: Math.max(SLOP_FLOOR, (Number(GetSystemMetrics(SM_CYDOUBLECLK)) || 0) * 4),
    };
  } catch (_err) {
    return { x: SLOP_FLOOR, y: SLOP_FLOOR };
  }
}

// 바탕화면 빈 곳을 두 번 누르면 박스를 감추고, 다시 두 번 누르면 보여 준다.
//
// 누름(내려감)을 센다. 뗌을 세면 손이 빠른 사람의 첫 클릭을 통째로 놓친다.
// 버튼 상태는 물어볼 때의 값만 알려 주므로, 누르고 떼는 일이 두 번의 물음 사이에
// 모두 끝나면 우리 눈에는 아무 일도 없던 것이 된다. 그래서 16밀리초마다 묻는다.
//
// 세는 일 자체는 deskpick.createDeskTaps 가 한다. 사이 시간과 허용 범위는
// 사용자가 제어판에서 정한 값(GetDoubleClickTime, SM_CXDOUBLECLK)을 그대로 따른다.
// 320밀리초처럼 박아 두면 보통 속도로 두 번 누른 것이 두 번으로 세지지 않는다.
function watchDoubleClick(onToggle) {
  const taps = createDeskTaps({ limit: doubleTime, slop: doubleSlop });
  let wasDown = false;
  const timer = setInterval(() => {
    let down = false;
    try {
      down = mouseDown();
    } catch (_err) {
      return;
    }
    if (down && !wasDown) {
      const pos = { x: 0, y: 0 };
      let read = false;
      try {
        read = !!GetCursorPos(pos);
      } catch (_err) {
        read = false;
      }
      // 커서 아래가 바탕화면이어야 한다. 앞 창만 보면 박스 위에서 누른 것도 잡힌다.
      const onDesk = read && desktopAt(pos);
      const onIcon = onDesk && cursorOnIcon();
      if (!onDesk || onIcon) {
        // 창 이름을 읽는 일은 자취를 남길 때만 한다. 누를 때마다 부르면 값이 비싸다.
        if (TRACE) {
          const under = read ? className(WindowFromPoint({ x: pos.x, y: pos.y })) : '(못 읽음)';
          trace(`누름 ${pos.x},${pos.y} 밑=${under} 앞=${className(GetForegroundWindow())} 아이콘=${onIcon} -> 세지 않는다`);
        }
        taps.forget();
      } else {
        const twice = taps.press(Date.now(), pos);
        if (TRACE) trace(`누름 ${pos.x},${pos.y} 두 번째=${twice}`);
        if (twice) onToggle();
      }
    }
    wasDown = down;
  }, 16);
  if (typeof timer.unref === 'function') timer.unref();
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

// 탐색기가 바탕화면에 그리는 이름 그대로.
//
// 확장자를 감추는 설정, 폴더의 localized 이름(예: Documents -> 문서),
// desktop.ini 로 바꿔 둔 이름까지 셸이 알아서 붙여 준다.
// 우리가 이름을 지어내면 바탕화면과 박스에 다른 글이 적힌다.
function displayName(filePath) {
  try {
    const wanted = String(filePath || '');
    if (!wanted) return '';
    if (wanted.startsWith('shell:')) {
      const found = shellInfo(wanted);
      return found ? found.name : '';
    }
    prepareCom();
    const info = {};
    const target = path.win32.normalize(wanted);
    if (!SHGetFileInfoW(target, 0, info, koffi.sizeof(SHFILEINFOW), SHGFI_DISPLAYNAME)) return '';
    return decodeName(info.szDisplayName);
  } catch (_err) {
    return '';
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

// 휴지통에 든 항목 수. 0 이면 비울 것이 없다. 물어보지 못했으면 -1 이다.
function recycleCount() {
  try {
    const info = { cbSize: koffi.sizeof(SHQUERYRBINFO), i64Size: 0, i64NumItems: 0 };
    if (SHQueryRecycleBinW(null, info) !== 0) return -1;
    return Number(info.i64NumItems);
  } catch (_err) {
    return -1;
  }
}

// 이 자리에서 바로 부르면 윈도우가 창을 닫을 때까지 앱이 멈춘다.
// 그래서 empty-bin.js 를 따로 띄운다. 그쪽을 띄우지 못했을 때만 여기서 부른다.
function emptyHere(owner) {
  try {
    SHEmptyRecycleBinW(Number(owner) || 0, null, 0);
    // 빈 휴지통 그림으로 바뀌도록 바탕화면만 새로 고친다.
    // 여기서도 SHCNE_ASSOCCHANGED 는 쓰지 않는다. 아이콘 그림 곳간이 통째로 다시 만들어진다.
    refreshShellIcons();
    return true;
  } catch (_err) {
    return false;
  }
}

// 휴지통 비우기. 물어보는 창과 진행률은 윈도우가 그대로 보여 준다.
// owner 는 그 창을 띄울 주인 창 번호다.
function emptyRecycle(owner) {
  return new Promise((resolve) => {
    let child = null;
    try {
      child = spawn(process.execPath, [path.join(__dirname, 'empty-bin.js'), String(owner || 0)], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch (_err) {
      resolve(emptyHere(owner));
      return;
    }
    child.once('error', () => resolve(emptyHere(owner)));
    child.once('exit', (code) => {
      // 1 은 그쪽에서 부르지 못했다는 뜻이다. 그때만 이 자리에서 다시 부른다.
      if (code === 1) resolve(emptyHere(owner));
      else resolve(code === 0);
    });
  });
}

// 치워 둔 아이콘을 모두 원래 자리로 돌려놓는다.
// 박스 목록을 못 받는 자리(갑작스러운 종료)에서도 이름만으로 되돌릴 수 있어야 한다.
function homeAll() {
  showLayer(true);
  return guard(() => withList((session) => {
    if (!session) return false;
    const listed = readAll(session);
    const moves = [];
    let spot = 0;
    for (const icon of listed) {
      const key = keyOf(icon.name);
      // 박스 칸에 앉혀 둔 것은 담기 전 자리로 돌려 바탕화면에 다시 보이게 한다.
      if (seated.has(key)) {
        const home = homes.get(key) || defaultSpot(spot);
        spot += 1;
        if (icon.x !== home.x || icon.y !== home.y) moves.push({ index: icon.index, x: home.x, y: home.y });
        continue;
      }
      // 화면 밖에 치워 둔 것은 적어 둔 자리로, 없으면 화면 안 빈 자리로 들인다.
      if (isParked(icon)) {
        const home = homes.get(key) || defaultSpot(spot);
        spot += 1;
        moves.push({ index: icon.index, x: home.x, y: home.y });
        continue;
      }
      // 박스가 가려서 우리가 옆으로 밀어낸 것도 제자리로 돌려놓는다.
      // 그러지 않으면 앱을 끝내도 바탕화면이 켜기 전 모습으로 돌아가지 않는다.
      if (!nudged.has(key)) continue;
      const home = homes.get(key);
      if (!home) continue;
      if (icon.x === home.x && icon.y === home.y) continue;
      moves.push({ index: icon.index, x: home.x, y: home.y });
    }
    nudged.clear();
    seated.clear();
    return applyMoves(session, moves);
  }));
}

function shutdown() {
  if (listFrozen) listRedraw(true);
  // 박스가 들고 있던 것뿐 아니라, 화면 밖에 남은 아이콘을 모두 되돌린다.
  guard(() => homeAll());
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

function heldDir() {
  if (!homeFile) return '';
  return path.join(path.dirname(homeFile), 'held');
}

function spareName(dir, base) {
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let n = 1;
  let dest = path.join(dir, base);
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${stem} (${n})${ext}`);
    n += 1;
  }
  return dest;
}

// 예전 판이 바탕화면 밖으로 옮겨 둔 파일을 제자리로 되돌린다.
function unstashFile(filePath) {
  const dir = heldDir();
  if (!dir || !filePath || path.normalize(path.dirname(filePath)) !== path.normalize(dir)) return filePath;
  const desk = desktopDirectories()[0];
  if (!desk) return filePath;
  try {
    if (!fs.existsSync(filePath)) return filePath;
    revealFile(filePath);
    const dest = spareName(desk, path.basename(filePath));
    fs.renameSync(filePath, dest);
    return dest;
  } catch (_err) {
    return filePath;
  }
}

module.exports = {
  nativeIcons: true,
  claimSingleInstance,
  fileIcon,
  shellItems,
  init,
  prepare,
  place,
  blurBehind,
  roundWindow,
  release,
  syncShellIcons,
  seatKept,
  followSeats,
  armFollow,
  paintFollow,
  followReset,
  gridInfo,
  hidePath,
  displayName,
  revealFile,
  nudge,
  noteHome,
  refreshFolder,
  putHome,
  unstashFile,
  mouseDown,
  watchDrag,
  watchDoubleClick,
  emptyRecycle,
  recycleCount,
  shutdown,
  debugList,
};
