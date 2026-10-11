// Shows one saved capture in the preview area.
//   image: zoom in/out (buttons, wheel around the cursor, + / - / 0 keys),
//          fit / 100 %, drag to pan, double-click toggles fit ↔ 100 %
//   video: play / pause, stop (back to the start), seek bar, time
import { formatDuration } from './domain/naming.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 16;
const ZOOM_STEP = 1.25;

/** Scale that fits `content` inside `box`, never enlarging past 100 %. */
export function fitScale(content, box) {
  if (!content.width || !content.height || !box.width || !box.height) return 1;
  return Math.min(1, box.width / content.width, box.height / content.height);
}

/** Zooms by `factor` keeping the point (px, py) of the box fixed on screen. */
export function zoomAround(view, factor, px, py) {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

/** Offset that centres content of the given size at `scale` in the box. */
export function centred(content, box, scale) {
  return { scale, x: (box.width - content.width * scale) / 2, y: (box.height - content.height * scale) / 2 };
}

export class MediaViewer {
  /**
   * @param {HTMLElement} host element inside the preview area
   * @param {{ onClose: () => void, onOpenExternal: (item) => void, onReveal: (item) => void }} handlers
   */
  constructor(host, handlers) {
    this.host = host;
    this.handlers = handlers;
    this.item = null;
    this.view = { scale: 1, x: 0, y: 0 };
    this.fitted = true;
    this.observer = new ResizeObserver(() => this.item?.kind === 'image' && this.fitted && this.fit());
    this.observer.observe(host);
    host.addEventListener('click', (event) => this.onClick(event));
  }

  get open() {
    return Boolean(this.item);
  }

  show(item, url) {
    this.close(false);
    this.item = item;
    this.url = url;
    this.host.hidden = false;
    this.render();
  }

  /** Re-renders labels (language switch) without losing playback or zoom. */
  relabel() {
    if (!this.item) return;
    for (const button of this.host.querySelectorAll('[data-viewer]')) {
      const key = VIEWER_KEYS[button.dataset.viewer];
      if (key) {
        button.title = t(key);
        button.setAttribute('aria-label', t(key));
      }
    }
    this.syncVideo();
  }

  render() {
    const item = this.item;
    const name = item.path.split(/[\\/]/).pop();
    const media = item.kind === 'video'
      ? `<video class="viewer-video" src="${this.url}" preload="metadata" playsinline></video>`
      : `<div class="viewer-canvas"><img class="viewer-image" src="${this.url}" alt="" draggable="false" /></div>`;
    this.host.innerHTML = `
      <div class="viewer-top">
        <span class="viewer-name" title="${escapeAttr(item.path)}">${icon(item.kind === 'video' ? 'video' : 'camera')}<span>${escapeAttr(name)}</span></span>
        ${button('external', 'open')}${button('reveal', 'folder')}${button('close', 'close')}
      </div>
      ${media}
      <p class="viewer-error" hidden>${t('viewer.error')}</p>
      <div class="viewer-controls">${item.kind === 'video' ? `
        ${button('play', 'play', 'viewer-main')}${button('stop', 'stop')}
        <input class="viewer-seek" type="range" min="0" max="0" step="0.01" value="0" aria-label="${t('viewer.seek')}" />
        <span class="viewer-time">00:00 / 00:00</span>` : `
        ${button('zoom-out', 'zoomOut')}<span class="viewer-zoom">100%</span>${button('zoom-in', 'zoomIn')}
        ${button('fit', 'fit')}${button('actual', 'actual')}
        <span class="viewer-hint">${t('viewer.hint')}</span>`}
      </div>`;
    this.relabel();
    if (item.kind === 'video') this.bindVideo();
    else this.bindImage();
  }

  // ── image

  bindImage() {
    const canvas = this.host.querySelector('.viewer-canvas');
    const image = canvas.querySelector('img');
    image.addEventListener('load', () => this.fit());
    image.addEventListener('error', () => this.failed());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const box = canvas.getBoundingClientRect();
      this.setView(zoomAround(this.view, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX - box.left, event.clientY - box.top));
    }, { passive: false });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY, view: { ...this.view } };
      canvas.classList.add('dragging');
      const move = (moveEvent) => this.setView({ ...start.view, x: start.view.x + moveEvent.clientX - start.x, y: start.view.y + moveEvent.clientY - start.y });
      const up = () => {
        canvas.classList.remove('dragging');
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
    });
    canvas.addEventListener('dblclick', () => (this.fitted ? this.actual() : this.fit()));
    if (image.complete && image.naturalWidth) this.fit();
  }

  imageSize() {
    const image = this.host.querySelector('.viewer-image');
    return { width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 };
  }

  boxSize() {
    const canvas = this.host.querySelector('.viewer-canvas');
    return { width: canvas?.clientWidth ?? 0, height: canvas?.clientHeight ?? 0 };
  }

  setView(view, fitted = false) {
    this.view = view;
    this.fitted = fitted;
    const image = this.host.querySelector('.viewer-image');
    if (!image) return;
    image.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    this.host.querySelector('.viewer-zoom').textContent = `${Math.round(view.scale * 100)}%`;
    this.host.querySelector('[data-viewer="zoom-in"]').disabled = view.scale >= ZOOM_MAX;
    this.host.querySelector('[data-viewer="zoom-out"]').disabled = view.scale <= ZOOM_MIN;
  }

  fit() {
    const content = this.imageSize();
    const box = this.boxSize();
    this.setView(centred(content, box, fitScale(content, box)), true);
  }

  actual() {
    this.setView(centred(this.imageSize(), this.boxSize(), 1));
  }

  zoom(factor) {
    const box = this.boxSize();
    this.setView(zoomAround(this.view, factor, box.width / 2, box.height / 2));
  }

  // ── video

  bindVideo() {
    const video = this.host.querySelector('video');
    const seek = this.host.querySelector('.viewer-seek');
    for (const name of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'durationchange']) {
      video.addEventListener(name, () => this.syncVideo());
    }
    video.addEventListener('error', () => this.failed());
    video.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
    seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
  }

  /** WebM written by MediaRecorder may report Infinity until the end is known. */
  duration(video) {
    if (Number.isFinite(video.duration)) return video.duration;
    return this.item?.durationMs ? this.item.durationMs / 1000 : 0;
  }

  syncVideo() {
    const video = this.host.querySelector('video');
    if (!video) return;
    const duration = this.duration(video);
    const seek = this.host.querySelector('.viewer-seek');
    seek.max = String(duration);
    if (document.activeElement !== seek) seek.value = String(video.currentTime);
    this.host.querySelector('.viewer-time').textContent = `${formatDuration(video.currentTime * 1000)} / ${formatDuration(duration * 1000)}`;
    const main = this.host.querySelector('[data-viewer="play"], [data-viewer="pause"]');
    const playing = !video.paused && !video.ended;
    main.dataset.viewer = playing ? 'pause' : 'play';
    main.innerHTML = icon(playing ? 'pause' : 'play');
    main.classList.toggle('playing', playing);
    main.title = t(playing ? 'viewer.pause' : 'viewer.play');
    main.setAttribute('aria-label', main.title);
  }

  stop() {
    const video = this.host.querySelector('video');
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    this.syncVideo();
  }

  // ── common

  failed() {
    this.host.querySelector('.viewer-error').hidden = false;
    this.host.querySelector('.viewer-controls').hidden = true;
  }

  onClick(event) {
    const button = event.target.closest('[data-viewer]');
    if (!button || button.disabled || !this.item) return;
    const video = this.host.querySelector('video');
    switch (button.dataset.viewer) {
      case 'play': video?.play(); break;
      case 'pause': video?.pause(); break;
      case 'stop': this.stop(); break;
      case 'zoom-in': this.zoom(ZOOM_STEP); break;
      case 'zoom-out': this.zoom(1 / ZOOM_STEP); break;
      case 'fit': this.fit(); break;
      case 'actual': this.actual(); break;
      case 'external': this.handlers.onOpenExternal(this.item); break;
      case 'reveal': this.handlers.onReveal(this.item); break;
      case 'close': this.handlers.onClose(); break;
      default:
    }
  }

  /** Keyboard while the viewer is open: space = play/pause, +/-/0 = zoom. Returns true if handled. */
  key(event) {
    if (!this.item) return false;
    const video = this.host.querySelector('video');
    if (video && event.key === ' ') {
      if (video.paused) video.play(); else video.pause();
      return true;
    }
    if (!video && (event.key === '+' || event.key === '=')) { this.zoom(ZOOM_STEP); return true; }
    if (!video && event.key === '-') { this.zoom(1 / ZOOM_STEP); return true; }
    if (!video && event.key === '0') { this.fit(); return true; }
    return false;
  }

  close(hide = true) {
    const video = this.host.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    this.item = null;
    this.host.innerHTML = '';
    if (hide) this.host.hidden = true;
  }
}

const VIEWER_KEYS = {
  external: 'viewer.openExternal', reveal: 'result.reveal', close: 'viewer.close',
  play: 'viewer.play', pause: 'viewer.pause', stop: 'viewer.stop',
  'zoom-in': 'viewer.zoomIn', 'zoom-out': 'viewer.zoomOut', fit: 'viewer.fit', actual: 'viewer.actual',
};

function button(action, glyph, extra = '') {
  return `<button class="viewer-button ${extra}" data-viewer="${action}">${icon(glyph)}</button>`;
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
