'use strict';

const { screen } = require('electron');
const slide = require('./slide');

/**
 * Grace band around the dock. Leaving it by a hair should not start the dock
 * hiding, and it has to be wide enough to span the gap between the sliver of
 * an auto-hidden dock and the plate that is sliding up to meet the pointer.
 */
const NEAR_DOCK = 48;

/**
 * How many polls go on saying the pointer has left after it has.
 *
 * Once should be enough, but the dock is also being sent real mouse events,
 * and Chromium can deliver a move it coalesced earlier *after* this message -
 * magnifying the dock around a pointer that has gone, with the window now
 * click-through and no further event coming to correct it. Repeating it over
 * the next few polls means the last word is always ours.
 */
const AWAY_REPEATS = 3;

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
    this.menuOpen = false;
    this.fed = undefined;    // last pointer pushed to the dock, to skip repeats
    this.away = 0;           // consecutive "the pointer has left" messages sent
  }

  /**
   * A popup menu takes the mouse: while one is up the dock's window sees no
   * move and no leave at all, so icons magnified under the pointer would stay
   * magnified wherever it went next, and stay that way after the menu closed.
   *
   * We already know where the cursor is, so for as long as the menu is open
   * the dock is fed it from here instead - and once more as the menu closes,
   * so it settles on whatever is true by then.
   */
  setMenuOpen(open) {
    if (this.menuOpen === open) return;
    this.menuOpen = open;
    if (open) { this.tick(); this.schedule(this.nearMs); return; }

    const local = this.localPoint();
    if (local) this.feed(local, true);
  }

  /** Where the cursor is in the dock window's own coordinates. */
  localPoint() {
    const dock = this.dockWindow;
    if (!dock.alive() || !dock.win.isVisible()) return null;
    const point = screen.getCursorScreenPoint();
    const bounds = dock.win.getBounds();
    return { x: point.x - bounds.x, y: point.y - bounds.y };
  }

  /**
   * Hand the dock the cursor, in its own window's coordinates, or `null` for
   * "not on the plate".
   *
   * The leave half matters even with no menu in sight. Once the pointer is
   * off the plate this window is made click-through, and a window that is
   * click-through stops being sent mouse messages - including the `mouseleave`
   * the dock was waiting for. Whichever of the two lands first is a race, so
   * the dock is told outright instead of being left magnified around a pointer
   * that is no longer there.
   *
   * @param {boolean} track also follow the pointer across the plate. Off by
   *   default: while the dock is being sent real mouse events, its own
   *   handlers know more than this poll does.
   */
  feed(local, track) {
    const plate = this.rect;
    const inside = !!plate && !!local
      && local.x >= plate.x && local.x < plate.x + plate.width
      && local.y >= plate.y && local.y < plate.y + plate.height;

    if (inside && !track) { this.fed = undefined; this.away = 0; return; }

    const point = inside
      ? { x: Math.round(local.x), y: Math.round(local.y), quiet: this.menuOpen }
      : null;
    const key = point ? `${point.x},${point.y},${point.quiet}` : 'away';
    // A still pointer is not worth repeating; a departed one is, up to a point.
    if (key === this.fed && (point || this.away >= AWAY_REPEATS)) return;
    this.away = point ? 0 : this.away + 1;
    this.fed = key;
    this.dockWindow.send('dock:pointer', point);
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

    const call = slide.decide({
      point: local,
      hidden: dock.hidden,
      sliding: dock.sliding(),
      plate: this.rect,
      sliver: dock.hidden ? dock.hotRect() : null,
      margin: NEAR_DOCK,
    });

    this.apply(call.interactive);
    this.feed(local, this.menuOpen);

    if (call.show) dock.scheduleShow();
    else if (call.hide) dock.scheduleHide();

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
