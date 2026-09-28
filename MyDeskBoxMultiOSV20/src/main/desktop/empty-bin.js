'use strict';

// 휴지통 비우기. 묻는 창과 진행률은 윈도우가 직접 그린다.
// 그 창이 떠 있는 동안 SHEmptyRecycleBinW 는 돌아오지 않으므로,
// 앱이 멈추지 않게 이 파일을 따로 띄워 거기서 부른다.
// 첫 번째 인자는 주인 창 번호다. 그 창 위에 떠서 박스 뒤로 숨지 않는다.
// 끝낼 때 알려 주는 값: 0 비웠다, 2 사용자가 그만두었거나 비울 것이 없었다, 1 부르지 못했다.

const koffi = require('koffi');

const shell32 = koffi.load('shell32.dll');
const ole32 = koffi.load('ole32.dll');
const user32 = koffi.load('user32.dll');

const SHEmptyRecycleBinW = shell32.func('int32 __stdcall SHEmptyRecycleBinW(uintptr hwnd, str16 root, uint32 flags)');
const CoInitializeEx = ole32.func('int32 __stdcall CoInitializeEx(void *reserved, uint32 flags)');
const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 className, str16 windowName)');
const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 className, str16 windowName)');
const SendMessageTimeoutW = user32.func('intptr __stdcall SendMessageTimeoutW(void *hwnd, uint32 msg, uintptr wParam, intptr lParam, uint32 flags, uint32 timeout, void *result)');

const COINIT_APARTMENTTHREADED = 0x2;
const WM_COMMAND = 0x0111;
// 바탕화면 보기의 '새로 고침'.
const DESKTOP_REFRESH = 0x7103;

function ownerFrom(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 바탕화면 아이콘을 그리는 보기 창. Progman 아래에 없으면 WorkerW 들을 훑는다.
function findDefView() {
  const direct = FindWindowExW(FindWindowW('Progman', null), null, 'SHELLDLL_DefView', null);
  if (direct) return direct;
  let previous = null;
  for (;;) {
    const worker = FindWindowExW(null, previous, 'WorkerW', null);
    if (!worker) return null;
    previous = worker;
    const found = FindWindowExW(worker, null, 'SHELLDLL_DefView', null);
    if (found) return found;
  }
}

// 비운 뒤 휴지통 그림이 빈 것으로 바뀌게 한다.
// SHCNE_ASSOCCHANGED 는 쓰지 않는다. 그 알림 하나에 셸이 아이콘 그림 곳간을 통째로
// 다시 만들고, 그동안 바탕화면이 그림 없이 이름만 그려진다.
function refreshDesktop() {
  const view = findDefView();
  if (!view) return;
  SendMessageTimeoutW(view, WM_COMMAND, DESKTOP_REFRESH, 0, 0, 200, null);
}

function main() {
  try {
    CoInitializeEx(null, COINIT_APARTMENTTHREADED);
  } catch (_err) {
    /* 이미 준비되어 있으면 그대로 쓴다. */
  }
  let hr = -1;
  try {
    // 깃발을 하나도 세우지 않으면 확인 창, 진행률, 소리를 모두 윈도우가 맡는다.
    hr = SHEmptyRecycleBinW(ownerFrom(process.argv[2]), null, 0);
  } catch (_err) {
    return 1;
  }
  if (hr === 0) {
    try {
      refreshDesktop();
    } catch (_err) {
      /* 새로 고침이 실패해도 비운 것은 비운 것이다. */
    }
    return 0;
  }
  return 2;
}

process.exit(main());
