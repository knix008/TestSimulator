'use strict';

const { screen } = require('electron');

/**
 * A transparent dock window is a rectangle: without help it would swallow every
 * click in its empty corners. We poll the cursor and make the window
 * click-through except while the pointer is actually over the dock plate.
 *
 * Polling (rather than `setIgnoreMouseEvents(true, { forward: true })`) is used
 * because event forwarding is not supported on Linux.
 */
class PointerWatch {
  constructor(dockWindow) {
    this.dockWindow = dockWindow;
    this.rect = null;        // interactive region, in window-local coordinates
    this.interactive = null; // tri-state: null = not yet applied
    this.timer = null;
    this.nearMs = 16;
    this.farMs = 120;
    this.currentMs = 0;
  }

  setRect(rect) {
    this.rect = rect;
    this.tick();
  }

  start() {
    this.schedule(this.farMs);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(ms) {
    if (this.timer && this.currentMs === ms) return;
    clearTimeout(this.timer);
    this.currentMs = ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
      this.schedule(this.currentMs);
    }, ms);
  }

  tick() {
    const dock = this.dockWindow;
    if (!dock.alive() || !dock.win.isVisible()) {
      this.schedule(this.farMs);
      return;
    }

    const point = screen.getCursorScreenPoint();
    const bounds = dock.win.getBounds();

    const local = { x: point.x - bounds.x, y: point.y - bounds.y };
    const inWindow = local.x >= 0 && local.y >= 0 && local.x < bounds.width && local.y < bounds.height;

    // When auto-hidden the whole visible sliver is a hot zone, otherwise only
    // the plate the renderer told us about.
    const hot = dock.hidden ? { x: 0, y: 0, width: bounds.width, height: bounds.height } : this.rect;
    const inHot = !!hot
      && local.x >= hot.x && local.x < hot.x + hot.width
      && local.y >= hot.y && local.y < hot.y + hot.height;

    this.apply(inHot);

    if (inHot) dock.scheduleShow();
    else if (!inWindow) dock.scheduleHide();

    // Poll hard only while the pointer is in the neighbourhood.
    const near = inWindow || withinMargin(local, bounds, 60);
    this.schedule(near ? this.nearMs : this.farMs);
  }

  apply(interactive) {
    if (this.interactive === interactive) return;
    this.interactive = interactive;
    const dock = this.dockWindow;
    if (!dock.alive()) return;
    dock.win.setIgnoreMouseEvents(!interactive, { forward: false });
  }
}

function withinMargin(local, bounds, margin) {
  return local.x >= -margin && local.y >= -margin
    && local.x < bounds.width + margin && local.y < bounds.height + margin;
}

module.exports = { PointerWatch };
