'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const CONFIG_VERSION = 1;

/** Default configuration. Any key missing from the user's file falls back to this. */
function defaults() {
  return {
    version: CONFIG_VERSION,
    dock: {
      position: 'bottom',        // top | bottom | left | right
      display: 'primary',        // 'primary' | 'cursor' | <display id>
      align: 'center',           // start | center | end
      edgeOffset: 0,             // px away from the screen edge
      iconSize: 48,
      spacing: 10,
      padding: 0,
      plateThickness: 0,         // 0 = size the background to the icons; else px
      maxZoom: 1.5,              // magnification multiplier under the cursor
      zoomRange: 2,              // how many icons on each side are affected
      animation: 'parabolic',    // parabolic | linear | none
      clickEffect: 'bounce',     // bounce | pop | none
      // Which way a launched icon travels. 'auto' points it away from the
      // screen edge the dock is docked against, which is up for a dock along
      // the bottom and right for one down the left-hand side.
      clickEffectDirection: 'auto', // auto | up | down | left | right
      // What an icon does on its way out when it is dragged off the dock.
      // poof | shrink | fade | drop | suck | shatter | none
      removeEffect: 'poof',
      autoHide: false,
      autoHidePeek: 3,           // px left visible when hidden
      autoHideDelay: 450,        // ms before hiding again
      autoShowDelay: 60,         // ms the pointer must rest on the edge first
      autoHideAnimation: 260,    // ms the dock takes to slide away or back; 0 = instant
      // How far above other windows the dock floats. 'normal' leaves it in the
      // ordinary stacking order, so this one setting covers "always on top"
      // as well as how far on top.
      // normal | floating | screen-saver
      stackingLevel: 'screen-saver',
      showOnAllWorkspaces: true,
      // Whether MyDockBar itself gets a button on the OS taskbar. Off by
      // default: the dock is chrome, and it already lives in the tray.
      showInTaskbar: false,
      showLabels: true,
      showReflection: true,
      showRunningIndicator: true,
      showRunningApps: false,   // also show icons for apps that are open
      focusRunningWindow: true, // click raises an open window instead of relaunching
      opacity: 1,        // the whole dock
      plateOpacity: 1,   // just the background plate behind the icons
      lockItems: false,
    },
    // Custom icons survive an entry being removed: keyed by target, so adding
    // the same program back later restores the icon that was chosen for it.
    iconMemory: {},
    theme: 'aqua',
    locale: 'auto',              // auto | en | ko
    startWithOS: false,
    firstRun: true,
    items: [],
  };
}

/** Deep-merge `src` onto a copy of `base`, keeping arrays atomic. */
function merge(base, src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) {
    return src === undefined ? base : src;
  }
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(src)) {
    const a = out[key];
    const b = src[key];
    out[key] = a && typeof a === 'object' && !Array.isArray(a) ? merge(a, b) : b;
  }
  return out;
}

class Config {
  constructor() {
    this.dir = app.getPath('userData');
    this.file = path.join(this.dir, 'config.json');
    this.data = defaults();
    this._saveTimer = null;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.data = merge(defaults(), JSON.parse(raw));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[config] unreadable, starting from defaults:', err.message);
        this._backupBroken();
      }
      this.data = defaults();
    }
    return this.data;
  }

  _backupBroken() {
    try {
      fs.renameSync(this.file, `${this.file}.broken-${Date.now()}`);
    } catch { /* nothing we can do */ }
  }

  get() {
    return this.data;
  }

  /** Merge a partial config in and persist it. */
  patch(partial) {
    this.data = merge(this.data, partial);
    this.save();
    return this.data;
  }

  setItems(items) {
    this.data.items = items;
    // Adding, removing or reordering an icon is a discrete edit the user just
    // made on purpose. Slider drags can be debounced; this cannot, or a crash
    // in the next quarter second silently undoes it.
    this.saveNow();
    return this.data;
  }

  /** Debounced write so dragging sliders does not hammer the disk. */
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 250);
  }

  saveNow() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file); // atomic-ish: never leave a half-written config
    } catch (err) {
      console.error('[config] save failed:', err.message);
    }
  }

  exportTo(target) {
    fs.writeFileSync(target, JSON.stringify(this.data, null, 2), 'utf8');
  }

  importFrom(source) {
    const incoming = JSON.parse(fs.readFileSync(source, 'utf8'));
    this.data = merge(defaults(), incoming);
    this.saveNow();
    return this.data;
  }

  reset() {
    this.data = defaults();
    this.data.firstRun = false;
    this.saveNow();
    return this.data;
  }
}

module.exports = { Config, defaults, merge, CONFIG_VERSION, HOME: os.homedir() };
