// Automatic walk-through, the controls: a bar at the bottom of the 3D view while it runs — the room it is in
// (n / total), previous / pause / next room, slower / speed / faster, stop. engine/tour.js plans and walks.
//   F full screen (Esc leaves it first), Esc stops, Space pauses, ← / → previous / next room; a press in the view pauses (look round yourself),
//   the play button goes on from where the tour was.
import { planTour, TourPlayer } from '../engine/tour.js';
import { icon } from '../icons.js';

const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * app: { viewport(), project(), t, notify, host() (the 3D view's element), settings(), updateSettings(patch), onChange() }.
 */
export function createTour(app) {
  let player = null;
  let bar = null;
  let last = null;
  let full = false;

  /** Full screen: the 3D view alone over the whole screen (menus, toolbar and panels out of the way). */
  function setFull(on) {
    if (full === on) return;
    full = on;
    app.setFullscreen?.(on);
    render();
  }

  const speedIndex = () => { const s = app.settings().tourSpeed ?? 1; const i = SPEEDS.indexOf(s); return i < 0 ? 2 : i; };

  function start() {
    const vp = app.viewport(); const p = app.project();
    if (!vp || !p) return false;
    const cam = vp.camera.position;
    const moves = planTour(p, { start: [cam.x, cam.z] });
    if (!moves.some((m) => m.type === 'look')) { app.notify('info', app.t('tour.noRooms')); return false; }
    player = new TourPlayer(vp, p, moves, { speed: SPEEDS[speedIndex()], onChange: (s) => { last = s; render(); if (s.done) finished(); } });
    showBar();
    player.start();
    app.onChange?.();
    return true;
  }

  function finished() {
    app.notify('success', app.t('tour.done'));
    stop();
  }

  function stop({ restore = true } = {}) {
    if (!player) return;
    const p = player;
    player = null;
    setFull(false);
    p.stop({ restore });
    bar?.remove();
    bar = null;
    last = null;
    app.onChange?.();
  }

  function toggle() { if (player) stop(); else start(); }

  function setPaused(paused) {
    if (!player || player.paused === paused) return;
    if (!paused) player.resume(); else player.setPaused(true);
  }

  function setSpeedIndex(i) {
    const k = Math.max(0, Math.min(SPEEDS.length - 1, i));
    app.updateSettings({ tourSpeed: SPEEDS[k] });
    player?.setSpeed(SPEEDS[k]);
    render();
  }

  function showBar() {
    bar?.remove();
    bar = document.createElement('div');
    bar.className = 'tour-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', app.t('tour.title'));
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tour]');
      if (!b || !player) return;
      const what = b.dataset.tour;
      if (what === 'stop') stop();
      else if (what === 'pause') setPaused(!player.paused);
      else if (what === 'prev') player.skip(-1);
      else if (what === 'next') player.skip(1);
      else if (what === 'slower') setSpeedIndex(speedIndex() - 1);
      else if (what === 'faster') setSpeedIndex(speedIndex() + 1);
      else if (what === 'full') setFull(!full);
    });
    app.host().append(bar);
    render();
  }

  function render() {
    if (!bar || !player) return;
    const t = app.t;
    const s = last ?? {};
    const room = s.room;
    const where = s.climbing ? t('tour.climbing') : room ? `${room.name || t('tour.room')}` : t('tour.starting');
    const count = room?.total ? `<span class="tour-count">${room.index} / ${room.total}</span>` : '';
    const btn = (id, glyph, label, extra = '') => `<button class="tour-button" data-tour="${id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${extra}>${icon(glyph)}</button>`;
    const sp = SPEEDS[speedIndex()];
    bar.innerHTML = `<span class="tour-title">${icon('tour')}<b>${escapeHtml(where)}</b>${count}</span>
      <span class="tour-sep"></span>
      ${btn('prev', 'skipPrev', t('tour.prev'))}${btn('pause', player.paused ? 'play' : 'pause', player.paused ? t('tour.play') : t('tour.pause'))}${btn('next', 'skipNext', t('tour.next'))}
      <span class="tour-sep"></span>
      ${btn('slower', 'minus', t('tour.slower'), sp <= SPEEDS[0] ? 'disabled' : '')}<span class="tour-speed" title="${escapeHtml(t('tour.speed'))}">×${sp}</span>${btn('faster', 'plus', t('tour.faster'), sp >= SPEEDS.at(-1) ? 'disabled' : '')}
      <span class="tour-sep"></span>
      ${btn('full', full ? 'exitFullscreen' : 'fullscreen', full ? t('tour.exitFull') : t('tour.full'), `aria-pressed="${full}"`)}${btn('stop', 'close', t('tour.stop'))}`;
  }

  /** Keys while the tour runs; true when used. */
  function key(event) {
    if (!player) return false;
    const k = event.key.toLowerCase();
    // Esc leaves full screen first, then ends the tour.
    if (k === 'escape') { if (full) setFull(false); else stop(); return true; }
    if (k === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) { setFull(!full); return true; }
    if (k === ' ' || k === 'spacebar') { setPaused(!player.paused); return true; }
    if (k === 'arrowright') { player.skip(1); return true; }
    if (k === 'arrowleft') { player.skip(-1); return true; }
    return false;
  }

  /** A press in the view: the tour pauses so the view can be turned by hand. */
  function interrupt() { if (player && !player.paused) setPaused(true); }

  return {
    start, stop, toggle, key, interrupt, setFull,
    /** The browser left full screen by itself (its own Esc): the view goes back into the window too. */
    fullscreenLeft() { if (full) { full = false; app.setFullscreen?.(false); render(); } },
    get full() { return full; },
    get active() { return Boolean(player); },
    get state() { return player ? { ...last, paused: player.paused, speed: player.speed, moves: player.moves, index: player.index } : null; },
    debug: () => player,
  };
}
