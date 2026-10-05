'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** 렌더러가 쓸 수 있는 유일한 창구 — nodeIntegration 없이 필요한 기능만 노출한다. */
const api = {
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    defaultCities: () => ipcRenderer.invoke('settings:default-cities')
  },

  events: {
    load: () => ipcRenderer.invoke('events:load'),
    save: (events) => ipcRenderer.invoke('events:save', events)
  },

  startup: {
    get: () => ipcRenderer.invoke('startup:get'),
    set: (enable) => ipcRenderer.invoke('startup:set', enable)
  },

  window: {
    getBounds: () => ipcRenderer.invoke('clock:get-bounds'),
    dragStart: () => ipcRenderer.send('window:drag-start'),
    resizeStart: () => ipcRenderer.send('window:resize-start'),
    gestureEnd: () => ipcRenderer.send('window:gesture-end'),
    minimize: () => ipcRenderer.send('window:minimize'),
    hideToTray: () => ipcRenderer.send('window:hide-to-tray'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    setAlwaysOnTop: (onTop) => ipcRenderer.send('window:set-always-on-top', onTop),
    setMinSize: (size) => ipcRenderer.send('window:set-min-size', size),
    setSize: (size) => ipcRenderer.send('window:set-size', size),
    closeSelf: () => ipcRenderer.send('window:close-self'),
    onBounds: (fn) => ipcRenderer.on('clock:bounds', (_e, bounds) => fn(bounds))
  },

  panel: {
    toggle: (tab) => ipcRenderer.send('panel:toggle', tab),
    close: () => ipcRenderer.send('panel:close'),
    isOpen: () => ipcRenderer.invoke('panel:is-open'),
    pendingTab: () => ipcRenderer.invoke('panel:pending-tab'),
    /** 설정 패널이 "이 크기면 다 보인다"고 알려 준다. */
    fit: (size) => ipcRenderer.send('panel:fit', size),
    onOpened: (fn) => ipcRenderer.on('panel:opened', (_e, open) => fn(open)),
    onSide: (fn) => ipcRenderer.on('panel:side', (_e, right) => fn(right)),
    onTab: (fn) => ipcRenderer.on('panel:tab', (_e, tab) => fn(tab))
  },

  /** 추가 시계 — 시간대·테마·모양을 저마다 따로 갖는 시계 창들. */
  clocks: {
    list: () => ipcRenderer.invoke('clocks:list'),
    add: (city) => ipcRenderer.invoke('clocks:add', city),
    close: (id) => ipcRenderer.send('clocks:close', id),
    update: (id, patch) => ipcRenderer.send('clocks:update', { id, patch }),
    openSettings: () => ipcRenderer.send('clocks:open-settings'),
    onChanged: (fn) => ipcRenderer.on('clocks:changed', (_e, list) => fn(list))
  },

  /** 시계 창이 자기 설정을 읽고 받아보는 창구. */
  clock: {
    self: () => ipcRenderer.invoke('clock:self'),
    onConfig: (fn) => ipcRenderer.on('clock:config', (_e, config) => fn(config))
  },

  /** 알람·타이머·스톱워치·캘린더·세계 시간을 별도 창으로 분리한다. */
  tools: {
    open: (tab) => ipcRenderer.send('tools:open', tab),
    opened: () => ipcRenderer.invoke('tools:opened')
  },

  menu: {
    open: (payload) => ipcRenderer.send('menu:open', payload),
    onItems: (fn) => ipcRenderer.on('menu:items', (_e, payload) => fn(payload)),
    ready: (size) => ipcRenderer.send('menu:ready', size),
    choose: (id) => ipcRenderer.send('menu:choose', id),
    close: () => ipcRenderer.send('menu:close'),
    onAction: (fn) => ipcRenderer.on('menu:action', (_e, id) => fn(id)),
    onClosed: (fn) => ipcRenderer.on('menu:closed', () => fn())
  },

  alarm: {
    show: (payload) => ipcRenderer.send('alarm:show', payload),
    dismiss: () => ipcRenderer.send('alarm:dismiss'),
    onShow: (fn) => ipcRenderer.on('alarm:show', (_e, payload) => fn(payload))
  },

  fullscreen: {
    open: () => ipcRenderer.send('fullscreen:open'),
    close: () => ipcRenderer.send('fullscreen:close')
  },

  tray: {
    setIcon: (dataUrl) => ipcRenderer.send('tray:icon', dataUrl),
    setTooltip: (text) => ipcRenderer.send('tray:tooltip', text)
  },

  /** 시계 창 ↔ 설정 패널 창 사이의 메시지 중계. */
  bus: {
    toClock: (message) => ipcRenderer.send('relay:to-clock', message),
    toPanel: (message) => ipcRenderer.send('relay:to-panel', message),
    onFromPanel: (fn) => ipcRenderer.on('from-panel', (_e, message) => fn(message)),
    onFromClock: (fn) => ipcRenderer.on('from-clock', (_e, message) => fn(message))
  },

  app: {
    quit: () => ipcRenderer.send('app:quit'),
    /** 프로그램 정보 창 — 버전·빌드·제작자 */
    info: () => ipcRenderer.invoke('app:info'),
    about: () => ipcRenderer.send('about:open'),
    onBeforeQuit: (fn) => ipcRenderer.on('app:before-quit', () => fn()),
    openExternal: (url) => ipcRenderer.send('shell:open-external', url),
    platform: process.platform
  }
};

contextBridge.exposeInMainWorld('myclock', api);
