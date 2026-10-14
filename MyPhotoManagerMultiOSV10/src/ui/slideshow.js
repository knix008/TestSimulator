// Slideshow: full-screen, timed, with fade / slide / zoom (Ken Burns)
// transitions, shuffle, loop and captions. Space pauses, arrows step, Esc ends.
import { decodeImage } from '../formats/decode.js';
import { kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { setFullscreen } from '../platform/native.js';
import { app } from '../store.js';
import { formatDate } from '../util/format.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export async function startSlideshow(items, startIndex = 0) {
  const list = items.filter((item) => !item.isDir && kindOf(item.name));
  if (!list.length) return;
  const options = { ...app.settings.slideshow };
  let order = list.map((_, i) => i);
  if (options.shuffle) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order = [startIndex, ...order.filter((i) => i !== startIndex)];
  } else {
    order = [...order.slice(startIndex), ...order.slice(0, startIndex)];
  }
  let position = 0;
  let paused = false;
  let timer = null;
  let showing = null;

  const stage = h('div.slideshow-stage');
  const caption = h('div.slideshow-caption');
  const controls = h('div.slideshow-controls',
    h('button.tool', { type: 'button', title: t('view.prev'), html: icon('prev'), onclick: () => step(-1) }),
    h('button.tool.play-toggle', { type: 'button', title: t('slideshow.pause'), html: icon('pause'), onclick: () => togglePause() }),
    h('button.tool', { type: 'button', title: t('view.next'), html: icon('next'), onclick: () => step(1) }),
    h('span.slideshow-counter'),
    h('button.tool', { type: 'button', title: t('slideshow.end'), html: icon('close'), onclick: () => end() }));
  const root = h(`div.slideshow.transition-${options.transition}`, { tabIndex: 0 }, stage, caption, controls);
  document.body.append(root);
  document.body.classList.add('slideshow-on');
  if (fs.kind === 'desktop') setFullscreen(true); else document.documentElement.requestFullscreen?.().catch(() => {});
  root.focus();

  let idle = null;
  root.addEventListener('pointermove', () => {
    root.classList.add('show-controls');
    clearTimeout(idle);
    idle = setTimeout(() => root.classList.remove('show-controls'), 2000);
  });

  async function media(item) {
    const kind = kindOf(item.name);
    if (kind === 'video') return h('video.slide-media', { src: await fs.url(item.path), autoplay: true, muted: false, playsInline: true });
    if (kind === 'native' || kind === 'svg') {
      const img = h('img.slide-media', { src: await fs.url(item.path), alt: '' });
      await img.decode().catch(() => {});
      return img;
    }
    const decoded = await decodeImage(await fs.read(item.path), item.name, { maxSize: Math.max(screen.width, screen.height) * (devicePixelRatio || 1) });
    const canvas = document.createElement('canvas');
    canvas.width = decoded.source.width;
    canvas.height = decoded.source.height;
    canvas.getContext('2d').drawImage(decoded.source, 0, 0);
    canvas.className = 'slide-media';
    return canvas;
  }

  async function show(direction = 1) {
    clearTimeout(timer);
    const item = list[order[position]];
    let el;
    try { el = await media(item); } catch { el = h('div.viewer-error', item.name); }
    const slide = h(`div.slide.enter-${direction > 0 ? 'next' : 'prev'}`, el);
    if (options.transition === 'zoom') slide.style.setProperty('--kb-x', `${(Math.random() - 0.5) * 6}%`);
    stage.append(slide);
    requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('active')));
    if (showing) {
      const old = showing;
      old.classList.remove('active');
      old.classList.add(`leave-${direction > 0 ? 'next' : 'prev'}`);
      setTimeout(() => old.remove(), 900);
    }
    showing = slide;
    const record = app.catalog.get(item.path);
    caption.hidden = !options.caption;
    caption.textContent = [item.name, record?.caption ?? record?.title, formatDate(record?.meta?.taken ?? item.modified)].filter(Boolean).join('  ·  ');
    root.querySelector('.slideshow-counter').textContent = `${position + 1} / ${order.length}`;
    schedule(el);
  }

  function schedule(el) {
    clearTimeout(timer);
    if (paused) return;
    if (el instanceof HTMLVideoElement) { el.onended = () => step(1); return; }
    timer = setTimeout(() => step(1), Math.max(1, options.interval) * 1000);
  }

  function step(d) {
    let next = position + d;
    if (next >= order.length) { if (!options.loop) { end(); return; } next = 0; }
    if (next < 0) next = order.length - 1;
    position = next;
    show(d);
  }

  function togglePause() {
    paused = !paused;
    root.querySelector('.play-toggle').innerHTML = icon(paused ? 'play' : 'pause');
    root.classList.toggle('paused', paused);
    if (paused) clearTimeout(timer); else schedule(showing?.firstChild);
  }

  function end() {
    clearTimeout(timer);
    root.remove();
    document.body.classList.remove('slideshow-on');
    document.removeEventListener('keydown', keys, true);
    if (fs.kind === 'desktop') { if (!document.body.classList.contains('immersive')) setFullscreen(false); } else if (document.fullscreenElement && !document.body.classList.contains('immersive')) document.exitFullscreen?.();
  }

  const keys = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (event.key === 'Escape') end();
    else if (event.key === ' ' || event.key === 'p' || event.key === 'P') togglePause();
    else if (event.key === 'ArrowRight' || event.key === 'PageDown') step(1);
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') step(-1);
  };
  document.addEventListener('keydown', keys, true);
  stage.addEventListener('click', () => step(1));
  show(1);
  return { end };
}

/** Slideshow options dialog content. */
export function slideshowSettingsFields(options, { field, selectEl }) {
  const interval = h('input.input', { type: 'number', min: 1, max: 120, value: options.interval });
  const transition = selectEl(['fade', 'slide', 'zoom', 'none'].map((v) => [v, t(`slideshow.${v}`)]), options.transition);
  const shuffle = h('input', { type: 'checkbox', checked: options.shuffle });
  const loop = h('input', { type: 'checkbox', checked: options.loop });
  const caption = h('input', { type: 'checkbox', checked: options.caption });
  return {
    el: h('div', h('div.field-row', field(t('slideshow.interval'), interval), field(t('slideshow.transition'), transition)),
      h('label.check', shuffle, t('slideshow.shuffle')), h('label.check', loop, t('slideshow.loop')), h('label.check', caption, t('slideshow.caption'))),
    read: () => ({ interval: Math.max(1, Number(interval.value) || 4), transition: transition.value, shuffle: shuffle.checked, loop: loop.checked, caption: caption.checked }),
  };
}
