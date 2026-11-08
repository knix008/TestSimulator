// Viewers in the main window (a tab each, no popup windows), after CommandCenter's preview:
// pictures (fit / actual size / zoom 5–3200 % with Ctrl+wheel, drag to pan, rotate, copy, save
// as PNG / JPEG / WebP / BMP), video and audio (the browser's player), and PDF (the webview's
// own PDF viewer). `doc.url` is a URL the page can load (asset protocol or an object URL).
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';

const ZOOMS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const button = (id, glyph, tip, extra = '') => `<button class="tool-button" data-viewer="${id}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}" ${extra}>${icon(glyph)}</button>`;

/** Draws `doc` (kind image | video | audio | pdf) into `host`. hooks: notify(kind, text), save(name, blob), copyImage(blob), status(text). */
export function showViewer(host, doc, hooks) {
  host.innerHTML = '';
  host.dataset.kind = doc.kind;
  if (doc.kind === 'image') return imageViewer(host, doc, hooks);
  if (doc.kind === 'video' || doc.kind === 'audio') return mediaViewer(host, doc, hooks);
  if (doc.kind === 'pdf') return pdfViewer(host, doc, hooks);
  return null;
}

function imageViewer(host, doc, hooks) {
  const view = doc.view ??= { zoom: null, rotate: 0, x: 0, y: 0 };
  host.innerHTML = `<div class="viewer-bar">
      ${button('zoomOut', 'zoomOut', `${t('viewer.zoomOut')} (−)`)}<span class="viewer-zoom" data-viewer-zoom>100%</span>${button('zoomIn', 'zoomIn', `${t('viewer.zoomIn')} (+)`)}
      ${button('fit', 'fitPage', `${t('viewer.fit')} (0)`)}${button('actual', 'zoomReset', `${t('viewer.actual')} (1)`)}
      <span class="tool-sep"></span>${button('rotateLeft', 'rotateLeft', `${t('viewer.rotateLeft')} (Shift+R)`)}${button('rotateRight', 'rotateRight', `${t('viewer.rotateRight')} (R)`)}
      <span class="tool-sep"></span>${button('copy', 'copy', t('viewer.copy'))}
      <span class="split-button">${button('savePng', 'exportImage', t('viewer.saveAs'))}${button('saveMenu', 'chevronDown', t('viewer.saveAs'), 'aria-haspopup="true"')}</span>
      <span class="grow"></span><span class="viewer-info" data-viewer-info></span></div>
    <div class="viewer-stage image-stage checker" tabindex="0"><img alt="" draggable="false"/></div>`;
  const stage = host.querySelector('.viewer-stage');
  const img = stage.querySelector('img');
  const info = host.querySelector('[data-viewer-info]');
  const zoomLabel = host.querySelector('[data-viewer-zoom]');
  let natural = { w: 0, h: 0 };

  const fitZoom = () => {
    const rotated = view.rotate % 180 !== 0;
    const w = rotated ? natural.h : natural.w;
    const h = rotated ? natural.w : natural.h;
    return Math.min(1, (stage.clientWidth - 24) / w, (stage.clientHeight - 24) / h) || 1;
  };
  const apply = () => {
    const zoom = view.zoom ?? fitZoom();
    img.style.width = `${natural.w * zoom}px`;
    img.style.height = `${natural.h * zoom}px`;
    img.style.transform = `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotate}deg)`;
    img.style.imageRendering = zoom >= 4 ? 'pixelated' : 'auto';
    zoomLabel.textContent = `${Math.round(zoom * 100)}%${view.zoom === null ? ` · ${t('viewer.fitShort')}` : ''}`;
  };
  const setZoom = (zoom) => { view.zoom = Math.max(0.05, Math.min(32, zoom)); apply(); };
  const step = (direction) => {
    const zoom = view.zoom ?? fitZoom();
    const next = direction > 0 ? ZOOMS.find((z) => z > zoom + 1e-6) ?? 32 : [...ZOOMS].reverse().find((z) => z < zoom - 1e-6) ?? 0.05;
    setZoom(next);
  };

  img.addEventListener('load', () => {
    natural = { w: img.naturalWidth || 300, h: img.naturalHeight || 150 };
    info.textContent = `${natural.w} × ${natural.h} px · ${doc.sizeText ?? ''}`;
    hooks.status?.(`${natural.w} × ${natural.h}`);
    apply();
  });
  img.addEventListener('error', () => { info.textContent = t('viewer.cannotShow'); stage.classList.add('broken'); });
  img.src = doc.url;

  stage.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    step(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  stage.addEventListener('dblclick', () => { view.zoom = view.zoom === null ? 1 : null; view.x = 0; view.y = 0; apply(); });
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    stage.focus();
    const start = { x: event.clientX - view.x, y: event.clientY - view.y };
    stage.classList.add('panning');
    const move = (e) => { view.x = e.clientX - start.x; view.y = e.clientY - start.y; apply(); };
    const up = () => { stage.classList.remove('panning'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  stage.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const map = { '+': () => step(1), '=': () => step(1), '-': () => step(-1), 0: () => { view.zoom = null; view.x = 0; view.y = 0; apply(); }, 1: () => setZoom(1), r: () => rotate(90), R: () => rotate(-90) };
    if (map[event.key]) { event.preventDefault(); map[event.key](); }
  });
  new ResizeObserver(() => apply()).observe(stage);

  const rotate = (deg) => { view.rotate = (view.rotate + deg + 360) % 360; apply(); };
  /** The picture as shown (rotation applied) on a canvas. */
  const canvas = (background) => {
    const rotated = view.rotate % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = rotated ? natural.h : natural.w;
    c.height = rotated ? natural.w : natural.h;
    const g = c.getContext('2d');
    if (background) { g.fillStyle = background; g.fillRect(0, 0, c.width, c.height); }
    g.translate(c.width / 2, c.height / 2);
    g.rotate((view.rotate * Math.PI) / 180);
    g.drawImage(img, -natural.w / 2, -natural.h / 2);
    return c;
  };
  const blob = (type, background) => new Promise((resolve, reject) => {
    try { canvas(background).toBlob((b) => (b ? resolve(b) : reject(new Error(t('viewer.cannotConvert')))), type, 0.92); } catch (error) { reject(error); }
  });
  const base = doc.name.replace(/\.[^.]+$/, '');
  const save = async (format) => {
    const [type, ext, bg] = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg', '#ffffff'], webp: ['image/webp', 'webp'], bmp: ['bmp', 'bmp', '#ffffff'] }[format];
    const data = type === 'bmp' ? bmpBlob(canvas(bg)) : await blob(type, bg);
    await hooks.save(`${base}.${ext}`, data);
  };

  host.querySelector('.viewer-bar').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-viewer]')?.dataset.viewer;
    try {
      if (id === 'zoomIn') step(1);
      else if (id === 'zoomOut') step(-1);
      else if (id === 'fit') { view.zoom = null; view.x = 0; view.y = 0; apply(); }
      else if (id === 'actual') setZoom(1);
      else if (id === 'rotateLeft') rotate(-90);
      else if (id === 'rotateRight') rotate(90);
      else if (id === 'copy') { await hooks.copyImage(await blob('image/png')); hooks.notify('success', t('viewer.copied')); }
      else if (id === 'savePng') await save('png');
      else if (id === 'saveMenu') hooks.menu(event.target.closest('[data-viewer]'), ['png', 'jpeg', 'webp', 'bmp'].map((format) => ({ label: `${format.toUpperCase()}…`, icon: 'exportImage', run: () => save(format).catch((e) => hooks.notify('error', String(e?.message ?? e))) })));
    } catch (error) {
      hooks.notify('error', String(error?.message ?? error));
    }
  });
  return { focus: () => stage.focus(), command: (id) => ({ zoomIn: () => step(1), zoomOut: () => step(-1), zoomReset: () => setZoom(1) }[id]?.()) };
}

/** A 24-bit BMP of a canvas (browsers cannot encode BMP). */
function bmpBlob(c) {
  const { width, height } = c;
  const data = c.getContext('2d').getImageData(0, 0, width, height).data;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const buffer = new Uint8Array(54 + rowSize * height);
  const view = new DataView(buffer.buffer);
  buffer[0] = 0x42; buffer[1] = 0x4d;
  view.setUint32(2, buffer.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowSize * height, true);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4;
      const d = 54 + (height - 1 - y) * rowSize + x * 3;
      buffer[d] = data[s + 2]; buffer[d + 1] = data[s + 1]; buffer[d + 2] = data[s];
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

function mediaViewer(host, doc, hooks) {
  const video = doc.kind === 'video';
  host.innerHTML = `<div class="viewer-bar"><span>${icon(video ? 'tutorialVideo' : 'speed')}</span><b class="viewer-title">${escapeHtml(doc.name)}</b><span class="grow"></span><span class="viewer-info" data-viewer-info></span></div>
    <div class="viewer-stage media-stage">${video ? '<video controls autoplay playsinline></video>' : `<div class="audio-card">${icon('speed', 'icon audio-icon')}<b>${escapeHtml(doc.name)}</b><audio controls autoplay></audio></div>`}</div>`;
  const player = host.querySelector(video ? 'video' : 'audio');
  const info = host.querySelector('[data-viewer-info]');
  const duration = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
  player.addEventListener('loadedmetadata', () => {
    info.textContent = [video ? `${player.videoWidth} × ${player.videoHeight}` : '', duration(player.duration), doc.sizeText ?? ''].filter(Boolean).join(' · ');
  });
  player.addEventListener('error', () => { info.textContent = t('viewer.unsupported'); host.querySelector('.viewer-stage').classList.add('broken'); });
  player.src = doc.url;
  player.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') player.currentTime -= 5;
    else if (event.key === 'ArrowRight') player.currentTime += 5;
    else if (event.key.toLowerCase() === 'm') player.muted = !player.muted;
  });
  return { focus: () => player.focus(), stop: () => player.pause() };
}

function pdfViewer(host, doc) {
  host.innerHTML = `<div class="viewer-stage pdf-stage"><iframe title="${escapeHtml(doc.name)}" src="${escapeHtml(doc.url)}"></iframe></div>`;
  return { focus: () => host.querySelector('iframe')?.focus() };
}
