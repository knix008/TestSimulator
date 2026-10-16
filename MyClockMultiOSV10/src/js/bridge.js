'use strict';

/**
 * 렌더러가 쓸 수 있는 유일한 창구 — window.myclock.
 *
 * Electron 판의 preload.js 와 같은 모양이라 렌더러 코드는 그대로다. 아래 호출은 모두
 * src-tauri/src/lib.rs 의 #[tauri::command] 이고, on* 는 lib.rs 의 post() 가 이 창에만
 * 보내는 알림이다.
 *
 * 창이 듣기 전에 보낸 알림은 메인 쪽에 쌓여 있다가, 여기서 듣기 시작할 때
 * (bridge_listen) 한꺼번에 넘어온다 — 페이지가 늦게 떠도 첫 알림을 흘리지 않는다.
 */
(function installBridge() {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== 'function') return;

  const invoke = (command, args = {}) => internals.invoke(command, args);
  /** 답을 기다리지 않는 호출 — 받을 창이 사라졌어도 조용히 넘어간다. */
  const send = (command, args = {}) => {
    invoke(command, args).catch(() => {});
  };
  /** 이 창으로 온 알림을 듣는다. */
  const on = (event) => (fn) => {
    const current = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
    current
      .listen(event, (message) => fn(message.payload))
      .then(() => invoke('bridge_listen', { event }))
      .then((queued) => {
        for (const payload of queued || []) fn(payload);
      })
      .catch(() => {});
  };

  const ua = navigator.userAgent || '';
  const platform = /Windows/i.test(ua) ? 'win32' : /Mac/i.test(ua) ? 'darwin' : 'linux';

  const api = {
    settings: {
      load: () => invoke('settings_load'),
      save: (patch) => invoke('settings_save', { patch: patch || {} }),
      reset: () => invoke('settings_reset'),
      defaultCities: () => invoke('settings_default_cities')
    },

    events: {
      load: () => invoke('events_load'),
      save: (events) => invoke('events_save', { events: events || [] })
    },

    startup: {
      get: () => invoke('startup_get'),
      set: (enable) => invoke('startup_set', { enable: enable === true })
    },

    window: {
      getBounds: () => invoke('clock_get_bounds'),
      dragStart: () => send('window_drag_start'),
      resizeStart: () => send('window_resize_start'),
      gestureEnd: () => send('window_gesture_end'),
      minimize: () => send('window_minimize'),
      hideToTray: () => send('window_hide_to_tray'),
      toggleMaximize: () => send('window_toggle_maximize'),
      isMaximized: () => invoke('window_is_maximized'),
      setAlwaysOnTop: () => send('window_set_always_on_top'),
      setMinSize: (size) => send('window_set_min_size', { size: size || {} }),
      setSize: (size) => send('window_set_size', { size: size || {} }),
      closeSelf: () => send('window_close_self'),
      onBounds: on('clock:bounds'),
      /** 메인이 다시 그려 달라고 할 때 (화면 구성이 바뀌거나 잠자기에서 깨어났을 때). */
      onSurfaceRefresh: on('surface:refresh'),
      /** 창이 다시 보이면 메인 쪽에 시계 창들을 다시 그리게 해 달라고 한다. */
      requestSurfaceRefresh: () => send('surface_request_refresh')
    },

    panel: {
      toggle: (tab) => send('panel_toggle', { tab: tab || null }),
      close: () => send('panel_close'),
      isOpen: () => invoke('panel_is_open'),
      pendingTab: () => invoke('panel_pending_tab'),
      /** 설정 패널이 "이 크기면 다 보인다"고 알려 준다. */
      fit: (size) => send('panel_fit', { size: size || {} }),
      onOpened: on('panel:opened'),
      onSide: on('panel:side'),
      onTab: on('panel:tab')
    },

    /** 추가 시계 — 시간대·테마·모양을 저마다 따로 갖는 시계 창들. */
    clocks: {
      list: () => invoke('clocks_list'),
      add: (city) => invoke('clocks_add', { city: city || {} }),
      close: (id) => send('clocks_close', { id: String(id) }),
      update: (id, patch) => send('clocks_update', { id: String(id), patch: patch || {} }),
      openSettings: () => send('clocks_open_settings'),
      onChanged: on('clocks:changed')
    },

    /** 시계 창이 자기 설정을 읽고 받아보는 창구. */
    clock: {
      self: () => invoke('clock_self'),
      onConfig: on('clock:config')
    },

    /** 알람·타이머·스톱워치·캘린더·세계 시간을 별도 창으로 분리한다. */
    tools: {
      open: (tab) => send('tools_open', { tab: String(tab) }),
      opened: () => invoke('tools_opened')
    },

    menu: {
      open: (payload) => send('menu_open', { payload: payload || { items: [] } }),
      onItems: on('menu:items'),
      ready: (size) => send('menu_ready', { size: size || {} }),
      choose: (id) => send('menu_choose', { id: id ?? null }),
      close: () => send('menu_close'),
      onAction: on('menu:action'),
      onClosed: on('menu:closed')
    },

    alarm: {
      show: (payload) => send('alarm_show', { payload: payload || {} }),
      dismiss: () => send('alarm_dismiss'),
      onShow: on('alarm:show')
    },

    fullscreen: {
      open: () => send('fullscreen_open'),
      close: () => send('fullscreen_close'),
      fit: (rect) => send('fullscreen_fit', { rect: rect || {} })
    },

    tray: {
      setIcon: (dataUrl) => {
        if (typeof dataUrl === 'string') send('tray_icon', { dataUrl });
      },
      setTooltip: (text) => {
        if (typeof text === 'string') send('tray_tooltip', { text });
      }
    },

    /** 시계 창 ↔ 설정 패널 창 사이의 메시지 중계. */
    bus: {
      toClock: (message) => send('relay_to_clock', { message: message ?? null }),
      toPanel: (message) => send('relay_to_panel', { message: message ?? null }),
      onFromPanel: on('from-panel'),
      onFromClock: on('from-clock')
    },

    app: {
      quit: () => send('app_quit'),
      /** 프로그램 정보 창 — 버전·빌드·제작자 */
      info: () => invoke('app_info'),
      about: () => send('about_open'),
      onBeforeQuit: on('app:before-quit'),
      openExternal: (url) => {
        if (typeof url === 'string') send('shell_open_external', { url });
      },
      platform
    }
  };

  window.myclock = api;
})();
