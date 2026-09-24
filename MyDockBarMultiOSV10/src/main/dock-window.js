'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const slide = require('./slide');
const placement = require('../shared/placement');

const MIN = { width: 80, height: 80 };

/** Roughly one frame: the slide is redrawn this often while it runs. */
const FRAME_MS = 16;

class DockWindow {
  constructor(config) {
    this.config = config;
    this.win = null;
    this.contentSize = { width: 400, height: 90 };
    this.hidden = false;
    // How far along the auto-hide slide the window is: 0 fully out, 1 fully
    // away. Anything in between means it is moving right now.
    this.slide = 0;
    this._hideTimer = null;
    this._showTimer = null;
    this._slideTimer = null;
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
      skipTaskbar: !dock.showInTaskbar,
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
    this.applyTaskbar(dock);

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
      this.cancelSlide();
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

  /** Whether the dock claims a button on the OS taskbar. */
  applyTaskbar(dock = this.config.get().dock) {
    if (!this.alive()) return;
    this.win.setSkipTaskbar(!dock.showInTaskbar);
  }

  applyAlwaysOnTop(dock = this.config.get().dock) {
    if (!this.alive()) return;
    // 'normal' is what "not on top" means, so the stacking level is the whole
    // setting; a separate always-on-top switch could only ever contradict it.
    if (dock.stackingLevel === 'normal') {
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

  /** Where the window rests when the dock is fully out, and fully hidden. */
  slideStops() {
    const dock = this.config.get().dock;
    const area = this.targetDisplay().workArea;
    const { width: w, height: h } = this.contentSize;

    let x;
    let y;
    const place = placement.resolve(dock.position, dock.align);
    // An auto-hiding dock has to sit flush against the edge, otherwise the
    // pointer that reveals it lands in the gap and it hides straight away.
    const offset = dock.autoHide ? 0 : dock.edgeOffset;

    if (place.vertical) {
      y = alignWithin(area.y, area.height, h, place.align);
      x = place.edge === 'left'
        ? area.x + offset
        : area.x + area.width - w - offset;
    } else {
      x = alignWithin(area.x, area.width, w, place.align);
      y = place.edge === 'top'
        ? area.y + offset
        : area.y + area.height - h - offset;
    }

    const shown = { x: Math.round(x), y: Math.round(y) };
    const away = slide.awayOrigin(shown, {
      position: place.edge,
      area,
      width: w,
      height: h,
      peek: dock.autoHidePeek,
    });
    return { shown, away, width: w, height: h };
  }

  /** Move the window to wherever the slide currently stands. */
  place() {
    if (!this.alive()) return;
    const { shown, away, width, height } = this.slideStops();
    const at = slide.originAt(shown, away, this.slide);
    this.win.setBounds({ x: at.x, y: at.y, width, height });
  }

  reposition() {
    if (!this.alive()) return;
    this.place();
    this.applyAlwaysOnTop();
  }

  /** How long a full hide or reveal should take, in milliseconds. */
  slideMs() {
    const ms = this.config.get().dock.autoHideAnimation;
    return Number.isFinite(ms) ? Math.max(0, ms) : 0;
  }

  /** True while the dock is part-way between out and away. */
  sliding() {
    return !!this._slideTimer;
  }

  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;

    const ms = this.slideMs();
    // The renderer fades the dock out over the same span, so the two halves of
    // the effect finish together instead of one snapping ahead of the other.
    this.send('dock:hidden-changed', { hidden, duration: ms });
    this.slideTo(hidden ? 1 : 0, ms);
  }

  /**
   * Walk the window to `target` (0 out, 1 away) over `ms`, easing at both ends.
   * Starting a new slide part-way through simply redirects the one in flight,
   * so a dock caught on its way out returns from where it had got to rather
   * than jumping back to the edge first.
   */
  slideTo(target, ms) {
    this.cancelSlide();
    if (!this.alive()) { this.slide = target; return; }

    const from = this.slide;
    const span = slide.duration(ms, from, target);
    if (!span) {
      this.slide = target;
      this.reposition();
      return;
    }

    const started = Date.now();
    this._slideTimer = setInterval(() => {
      if (!this.alive()) { this.cancelSlide(); return; }
      const t = (Date.now() - started) / span;
      if (t >= 1) {
        this.slide = target;
        this.cancelSlide();
      } else {
        this.slide = from + (target - from) * slide.ease(t);
      }
      this.place();
    }, FRAME_MS);
  }

  cancelSlide() {
    clearInterval(this._slideTimer);
    this._slideTimer = null;
  }

  /**
   * The strip that wakes a hidden dock, in window-local coordinates.
   *
   * Not simply "the whole window": while the dock slides out, the window is
   * still largely on screen and sweeping across the desktop, so treating all
   * of it as a hot zone would have the dock spring back the moment it passed
   * under the pointer. Only the sliver at the screen edge counts.
   */
  hotRect() {
    if (!this.alive()) return null;
    const dock = this.config.get().dock;
    const place = placement.resolve(dock.position, dock.align);
    const band = slide.edgeBand(place.edge, this.targetDisplay().workArea, dock.autoHidePeek);
    return slide.localOverlap(this.win.getBounds(), band);
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
    this.applyTaskbar(dock);
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
