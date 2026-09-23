'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const MIN = { width: 80, height: 80 };

class DockWindow {
  constructor(config) {
    this.config = config;
    this.win = null;
    this.contentSize = { width: 400, height: 90 };
    this.hidden = false;
    this._hideTimer = null;
    this._showTimer = null;
    this._onDisplayChange = () => this.reposition();
  }

  create() {
    const dock = this.config.get().dock;

    this.win = new BrowserWindow({
      width: MIN.width,
      height: MIN.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      acceptFirstMouse: true,
      roundedCorners: false,
      // The dock is chrome, not a document: keep it out of the window cycle.
      type: process.platform === 'linux' ? 'dock' : undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    this.win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    this.win.setMenuBarVisibility(false);

    this.applyAlwaysOnTop(dock);
    this.applyWorkspaceVisibility(dock);

    this.win.once('ready-to-show', () => {
      this.win.showInactive(); // never steal focus from whatever the user is doing
      this.reposition();
    });

    // A transparent, always-on-top window can be pushed behind fullscreen apps;
    // re-assert the level whenever the desktop layout changes.
    screen.on('display-metrics-changed', this._onDisplayChange);
    screen.on('display-added', this._onDisplayChange);
    screen.on('display-removed', this._onDisplayChange);

    this.win.on('closed', () => {
      screen.removeListener('display-metrics-changed', this._onDisplayChange);
      screen.removeListener('display-added', this._onDisplayChange);
      screen.removeListener('display-removed', this._onDisplayChange);
      this.win = null;
    });

    return this.win;
  }

  alive() {
    return this.win && !this.win.isDestroyed();
  }

  applyAlwaysOnTop(dock = this.config.get().dock) {
    if (!this.alive()) return;
    if (!dock.alwaysOnTop || dock.stackingLevel === 'normal') {
      this.win.setAlwaysOnTop(false);
      return;
    }
    // 'floating' sits above ordinary windows; 'screen-saver' also clears
    // full-screen video and most launchers.
    const level = dock.stackingLevel === 'floating' ? 'floating' : 'screen-saver';
    this.win.setAlwaysOnTop(true, level);
  }

  applyWorkspaceVisibility(dock = this.config.get().dock) {
    if (!this.alive()) return;
    try {
      this.win.setVisibleOnAllWorkspaces(!!dock.showOnAllWorkspaces, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
    } catch { /* unsupported on some Linux WMs */ }
  }

  /** The display the dock should live on, per config. */
  targetDisplay() {
    const { display } = this.config.get().dock;
    if (display === 'cursor') {
      return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    }
    if (display && display !== 'primary') {
      const match = screen.getAllDisplays().find((d) => String(d.id) === String(display));
      if (match) return match;
    }
    return screen.getPrimaryDisplay();
  }

  /** Called by the renderer once it knows how big the dock actually is. */
  setContentSize(width, height) {
    const w = Math.max(MIN.width, Math.ceil(width));
    const h = Math.max(MIN.height, Math.ceil(height));
    if (w === this.contentSize.width && h === this.contentSize.height) return;
    this.contentSize = { width: w, height: h };
    this.reposition();
  }

  reposition() {
    if (!this.alive()) return;

    const dock = this.config.get().dock;
    const display = this.targetDisplay();
    const area = display.workArea;
    const { width: w, height: h } = this.contentSize;

    let x;
    let y;
    const vertical = dock.position === 'left' || dock.position === 'right';
    // An auto-hiding dock has to sit flush against the edge, otherwise the
    // pointer that reveals it lands in the gap and it hides straight away.
    const offset = dock.autoHide ? 0 : dock.edgeOffset;

    if (vertical) {
      y = alignWithin(area.y, area.height, h, dock.align);
      x = dock.position === 'left'
        ? area.x + offset
        : area.x + area.width - w - offset;
    } else {
      x = alignWithin(area.x, area.width, w, dock.align);
      y = dock.position === 'top'
        ? area.y + offset
        : area.y + area.height - h - offset;
    }

    if (this.hidden) {
      const peek = Math.max(1, dock.autoHidePeek);
      if (dock.position === 'bottom') y = area.y + area.height - peek;
      else if (dock.position === 'top') y = area.y - h + peek;
      else if (dock.position === 'left') x = area.x - w + peek;
      else x = area.x + area.width - peek;
    }

    this.win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
    this.applyAlwaysOnTop(dock);
  }

  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.reposition();
    this.send('dock:hidden-changed', hidden);
  }

  scheduleHide() {
    this.cancelShow();
    const dock = this.config.get().dock;
    // The pointer watcher calls this on every poll, so an already-pending hide
    // must be left alone — restarting it would keep pushing the deadline back.
    if (!dock.autoHide || this.hidden || this._hideTimer) return;
    this._hideTimer = setTimeout(() => {
      this._hideTimer = null;
      this.setHidden(true);
    }, dock.autoHideDelay);
  }

  cancelHide() {
    clearTimeout(this._hideTimer);
    this._hideTimer = null;
  }

  reveal() {
    this.cancelHide();
    this.setHidden(false);
  }

  /**
   * Reveal after the pointer has rested on the edge for `autoShowDelay`, so
   * merely sweeping the cursor past the edge does not pop the dock open.
   */
  scheduleShow() {
    if (!this.hidden) { this.cancelHide(); return; }
    const dock = this.config.get().dock;
    this.cancelHide();
    if (!dock.autoShowDelay) { this.reveal(); return; }
    if (this._showTimer) return;
    this._showTimer = setTimeout(() => {
      this._showTimer = null;
      this.reveal();
    }, dock.autoShowDelay);
  }

  cancelShow() {
    clearTimeout(this._showTimer);
    this._showTimer = null;
  }

  /** Re-apply every window-level setting after the user edits preferences. */
  applyConfig() {
    if (!this.alive()) return;
    const dock = this.config.get().dock;
    this.applyAlwaysOnTop(dock);
    this.applyWorkspaceVisibility(dock);
    if (!dock.autoHide && this.hidden) this.setHidden(false);
    this.reposition();
  }

  send(channel, payload) {
    if (this.alive()) this.win.webContents.send(channel, payload);
  }

  toggleVisible() {
    if (!this.alive()) return;
    if (this.win.isVisible()) this.win.hide();
    else this.win.showInactive();
  }
}

function alignWithin(start, total, size, align) {
  if (align === 'start') return start;
  if (align === 'end') return start + total - size;
  return start + (total - size) / 2;
}

module.exports = { DockWindow };
