'use strict';

// 창이 메인과 이야기하는 길 (Electron 판 src/preload/preload.js 의 자리).
//
// 창 코드(fence.js 따위)는 window.desk 만 본다. 이름과 모양은 Electron 판과 같고,
// 그 아래를 Tauri 명령(src-tauri/src/commands.rs)과 사건으로 바꿨다.
// 모든 화면에서 맨 먼저 읽는다.

(function attach() {
  const tauri = window.__TAURI__;
  const invoke = tauri.core.invoke;
  const me = tauri.webviewWindow.getCurrentWebviewWindow();

  // 창이 location.search 대신 읽는 값. 메인이 창을 만들 때 넣어 준다.
  window.deskQuery = new URLSearchParams(window.__DESK_QUERY__ || location.search);

  // 사건 듣기는 비동기로 등록된다. 등록이 끝나기 전에 '준비됐다' 를 보내면
  // 메인이 곧바로 보낸 첫 상태를 놓친다. 그래서 준비 신호는 등록이 다 끝난 뒤에 보낸다.
  const listening = [];

  function on(event, handler) {
    let off = null;
    let dead = false;
    const wait = me.listen(event, (message) => handler(message.payload)).then((unlisten) => {
      if (dead) unlisten();
      else off = unlisten;
    });
    listening.push(wait);
    return () => {
      dead = true;
      if (off) off();
    };
  }

  function whenListening(name, args) {
    return Promise.all(listening).then(() => invoke(name, args));
  }

  // 끄는 도중에 묻는 '다른 프로그램 위인가'. Electron 판은 동기로 물었다.
  // 여기서는 묻고 기다리지 않는다. 마지막으로 들은 답을 주고, 새 답은 다음 움직임에 쓴다.
  let foreign = false;
  let asking = false;
  function overForeign(screenX, screenY) {
    if (!asking) {
      asking = true;
      invoke('fence_over_foreign', { x: screenX, y: screenY })
        .then((answer) => {
          foreign = !!answer;
        })
        .catch(() => {
          foreign = false;
        })
        .finally(() => {
          asking = false;
        });
    }
    return foreign;
  }

  // 탐색기에서 박스 창으로 파일을 끌어 오는 길. Tauri 가 끄는 동안의 자리와 놓은 파일을 알려 준다.
  // 자리는 창 안의 물리 픽셀이라 CSS 픽셀로 바꿔 넘긴다.
  function onFileDrag(handler) {
    const view = tauri.webview && tauri.webview.getCurrentWebview ? tauri.webview.getCurrentWebview() : null;
    if (!view || typeof view.onDragDropEvent !== 'function') return () => {};
    let off = null;
    let dead = false;
    view
      .onDragDropEvent((event) => {
        const drop = event.payload || {};
        const ratio = window.devicePixelRatio || 1;
        const at = drop.position || { x: 0, y: 0 };
        handler({
          type: drop.type,
          clientX: at.x / ratio,
          clientY: at.y / ratio,
          paths: Array.isArray(drop.paths) ? drop.paths : [],
        });
      })
      .then((unlisten) => {
        if (dead) unlisten();
        else off = unlisten;
      });
    return () => {
      dead = true;
      if (off) off();
    };
  }

  window.desk = {
    ready: (id) => whenListening('fence_ready', { id }),
    onState: (handler) => on('fence:state', handler),
    onHover: (handler) => on('fence:hover', handler),
    onResize: (handler) => on('fence:resize', handler),
    onRename: (handler) => on('fence:rename', handler),
    onRenameItem: (handler) => on('fence:rename-item', handler),
    // 다른 박스나 바탕화면을 눌렀다. 이 박스의 고른 표시를 거둔다.
    onUnpick: (handler) => on('fence:unpick', handler),
    // 이 박스에서 고르기를 시작했다. 다른 박스의 고른 표시를 거두게 한다.
    picked: (id) => invoke('fence_picked', { id }),
    move: (rect) => invoke('fence_bounds', { rect }),
    saveBounds: (rect) => invoke('fence_bounds_save', { rect }),
    hover: (payload) => invoke('fence_hover', { payload: payload || null }),
    overForeign,
    // 파일 하나나 여러 개의 목록을 넘긴다.
    dragOut: (filePaths) => {
      invoke('fence_drag_out', { paths: filePaths });
      return true;
    },
    // 마우스 메시지가 끝난 뒤에 넘긴다. 단추는 아직 눌려 있다.
    dragOutLater: (filePaths) => invoke('fence_drag_out', { paths: filePaths }),
    scrolled: (id, top) => invoke('fence_scroll', { id, top }),
    collapse: (id, collapsed) => invoke('fence_collapse', { id, collapsed }),
    transfer: (payload) => invoke('fence_transfer', {
      id: payload.id,
      filePath: payload.filePath,
      screenX: payload.screenX,
      screenY: payload.screenY,
      paths: payload.paths || null,
    }),
    dropFiles: (payload) => invoke('fence_drop', {
      id: payload.id,
      paths: payload.paths,
      index: payload.index == null ? null : payload.index,
      into: payload.into || null,
    }),
    onFileDrag,
    copyItem: (id, filePath) => invoke('fence_copy', { id, filePath }),
    cutItem: (id, filePath) => invoke('fence_cut', { id, filePath }),
    paste: (id) => invoke('fence_paste', { id }),
    removeItems: (id, paths) => invoke('fence_delete', { id, paths }),
    open: (filePath) => invoke('fence_open', { filePath }),
    menu: (id, filePath, paths) => invoke('fence_menu', { id, filePath: filePath || null, paths: paths || null }),
    rename: (id, title) => invoke('fence_rename', { id, title }),
    renameItem: (id, filePath, name) => invoke('fence_rename_item', { id, filePath, name }),
    finishDraw: (rect) => invoke('draw_finish', { rect: rect || null }),
    cancelDraw: () => invoke('draw_cancel'),
    onGhost: (handler) => on('ghost:icon', handler),
    answer: (id, ok) => invoke('ask_answer', { id, ok: !!ok }),
    askSize: (id, height) => invoke('ask_size', { id, height }),
    // 항목 속성 창
    propsSize: (key, height) => invoke('props_size', { key, height }),
    propsClose: (key) => invoke('props_close', { key }),
    settings: (id) => invoke('box_open', { id }),
    boxReady: (id) => whenListening('box_ready', { id }),
    onBoxSettings: (handler) => on('box:state', handler),
    boxChange: (id, patch) => invoke('box_change', { id, patch }),
    boxReset: (id) => invoke('box_reset', { id }),
    boxSize: (id, height) => invoke('box_size', { id, height }),
    boxClose: (id) => invoke('box_close', { id }),
    // 프로그램 전체 설정 창
    prefsReady: () => whenListening('prefs_ready'),
    onPrefs: (handler) => on('prefs:state', handler),
    prefsChange: (patch) => invoke('prefs_change', { patch }),
    prefsOpen: (what) => invoke('prefs_action', { what }),
    prefsClose: () => invoke('prefs_close'),
    // 큰 오류 창. 글 전체를 클립보드로 보내거나 창을 닫는다.
    fatalCopy: () => invoke('fatal_copy'),
    fatalClose: () => invoke('fatal_close'),
    onFatalCopied: (handler) => on('fatal:copied', handler),
  };
}());
