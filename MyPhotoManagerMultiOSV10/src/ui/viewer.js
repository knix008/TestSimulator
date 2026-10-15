// View mode: one photo at a time — zoom and pan, previous / next, filmstrip,
// information and histogram overlays, rating / label / tag, rotate, delete,
// full screen. Formats the engine shows natively use <img> (animated GIF/WebP
// play); TIFF, HEIC, PSD and RAW are decoded to a canvas; videos play.
import { LABEL_COLORS, baseName, parentOf } from '../catalog/catalog.js';
import { decodeImage } from '../formats/decode.js';
import { formatExposure } from '../formats/exif.js';
import { badgeOf, kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { setFullscreen } from '../platform/native.js';
import { app, deleteItems, openFolder, selectItem, setMode, viewableList } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatBytes, formatDateTime, formatDims, formatDuration } from '../util/format.js';
import { promptDialog, statusProgress, toast } from './dialog.js';
import { createDicomTools } from './dicomview.js';
import { button, clear, h } from './dom.js';
import { drawHistogram, histogramOf } from './histogram.js';
import { icon } from './icons.js';
import { commandFor, registerCommands } from './keymap.js';

const ZOOMS = [0.05, 0.08, 0.1, 0.125, 0.167, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export function createViewer({ onEdit, onSlideshow, onRotate, onContextMenu }) {
  const stage = h('div.viewer-stage', { tabIndex: 0 });
  const holder = h('div.viewer-holder');
  const spinner = h('div.viewer-spinner', t('list.loading'));
  const overlayHist = h('canvas.viewer-histogram', { width: 256, height: 100 });
  const navPrev = h('button.viewer-nav.prev', { type: 'button', title: t('view.prev'), html: icon('prev') });
  const navNext = h('button.viewer-nav.next', { type: 'button', title: t('view.next'), html: icon('next') });
  const faceLayer = h('div.face-layer', { hidden: true });
  const navigator = h('div.viewer-navigator', { hidden: true }, h('canvas.navigator-image'), h('div.navigator-view'));
  const loupe = h('canvas.loupe', { width: 220, height: 220, hidden: true });
  const pageNav = h('div.page-nav', { hidden: true });
  // Video: a big ▶ / ❚❚ that shows for a moment when playback starts or stops, and a "paused" badge while paused.
  const videoFlash = h('div.video-flash', { hidden: true });
  const videoPaused = h('div.video-paused', { hidden: true });
  stage.append(holder, faceLayer, spinner, overlayHist, navPrev, navNext, navigator, loupe, pageNav, videoFlash, videoPaused);
  // Information for the picture on screen: a panel beside the stage, folded with ">" and switched from the toolbar.
  const infoBody = h('div.viewer-info');
  const infoHead = h('div.pane-head');
  const infoPane = h('aside.viewer-info-pane', infoHead, infoBody);
  const viewerBody = h('div.viewer-body', stage, infoPane);
  const status = h('div.viewer-status');
  const strip = h('div.filmstrip');
  // ◀ ▶ at both ends of the filmstrip: previous / next picture (the strip follows).
  const stripPrev = h('button.strip-nav.prev', { type: 'button', title: `${t('view.prev')} (←)`, 'aria-label': t('view.prev'), html: icon('prev'), dataset: { key: 'strip-prev' }, onclick: () => step(-1) });
  const stripNext = h('button.strip-nav.next', { type: 'button', title: `${t('view.next')} (→)`, 'aria-label': t('view.next'), html: icon('next'), dataset: { key: 'strip-next' }, onclick: () => step(1) });
  const stripBox = h('div.filmstrip-box', stripPrev, strip, stripNext);
  // The wheel scrolls the strip sideways.
  strip.addEventListener('wheel', (event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); strip.scrollLeft += event.deltaY; } }, { passive: false });
  const toolbar = h('div.viewer-toolbar');
  // Medical images get their own toolbar, overlays and tools (dicomview.js).
  const dicom = createDicomTools({
    stage,
    imagePoint: (x, y) => imagePoint(x, y),
    scaleOf: () => (fit ? fitScale() : zoom),
    zoomTo: (value) => setZoom(value),
    zoomStep: (direction) => zoomStep(direction),
    onRendered: () => { pixelSource = null; drawNavigatorImage(); },
    onHistory: () => {
      const undo = toolbar.querySelector('#dicom-undo');
      const redo = toolbar.querySelector('#dicom-redo');
      if (undo) undo.disabled = !dicom.canUndo;
      if (redo) redo.disabled = !dicom.canRedo;
    },
  });
  const el = h('div.viewer', toolbar, dicom.bar, viewerBody, stripBox, status);

  let list = [];
  let index = 0;
  let current = null; // { item, el, width, height, kind }
  let zoom = 1;
  let fit = true;
  let offset = { x: 0, y: 0 };
  let token = 0;
  const cache = new Map(); // path#page → canvas (decoded formats)
  let page = 0;
  let loupeOn = false;
  let pixelSource = null; // full-size canvas of the current picture, for pixel values
  let pixelInfo = '';

  const settings = () => app.settings.viewer;

  // ───────── toolbar

  function buildToolbar() {
    clear(toolbar);
    const group = (...items) => h('div.tool-group', items);
    toolbar.append(...[
      group(button('back', t('view.backToManage'), () => setMode('manage'), { title: `${t('view.backToManage')} (Esc)`, showLabel: true, className: 'with-label' })),
      group(
        button('first', t('view.first'), () => go(0), { title: `${t('view.first')} (Home)` }),
        button('prev', t('view.prev'), () => step(-1), { title: `${t('view.prev')} (←)` }),
        button('next', t('view.next'), () => step(1), { title: `${t('view.next')} (→)` }),
        button('last', t('view.last'), () => go(list.length - 1), { title: `${t('view.last')} (End)` })),
      group(
        button('zoomOut', t('view.zoomOut'), () => zoomStep(-1), { title: `${t('view.zoomOut')} (-)`, id: 'viewer-zoom-out' }),
        h('span.zoom-value', { id: 'viewer-zoom', title: t('view.zoomLevel') }, zoomText()),
        button('zoomIn', t('view.zoomIn'), () => zoomStep(1), { title: `${t('view.zoomIn')} (+)`, id: 'viewer-zoom-in' }),
        button('fit', t('view.fit'), () => setFit(), { title: `${t('view.fit')} (/)` }),
        button('actual', t('view.actual'), () => setZoom(1), { title: `${t('view.actual')} (*)` })),
      current?.kind === 'dicom' ? group(
        button('undo', t('undo.undo'), () => dicom.undo(), { title: `${t('undo.undo')} (Ctrl+Z)`, showLabel: true, className: 'with-label', id: 'dicom-undo', disabled: !dicom.canUndo }),
        button('redo', t('undo.redo'), () => dicom.redo(), { title: `${t('undo.redo')} (Ctrl+Y)`, showLabel: true, className: 'with-label', id: 'dicom-redo', disabled: !dicom.canRedo })) : null,
      group(
        button('rotateLeft', t('view.rotateLeft'), () => onRotate?.([current?.item?.path].filter(Boolean), -1), { title: `${t('view.rotateLeft')} (Ctrl+[)` }),
        button('rotateRight', t('view.rotateRight'), () => onRotate?.([current?.item?.path].filter(Boolean), 1), { title: `${t('view.rotateRight')} (Ctrl+])` })),
      group(
        button('pencil', t('view.edit'), () => current && onEdit?.(current.item.path), { title: `${t('view.edit')} (E)` }),
        button('play', t('view.slideshow'), () => onSlideshow?.(index), { title: `${t('view.slideshow')} (S)` }),
        button('trash', t('file.delete'), () => current && deleteCurrent(), { title: `${t('file.delete')} (Del)` })),
      group(
        button('info', t('view.info'), () => toggleSetting('info'), { title: `${settings().info ? t('view.infoHide') : t('view.infoShow')} (I)`, className: settings().info ? 'on' : '', id: 'viewer-info-toggle' }),
        button('histogram', t('view.histogram'), () => toggleSetting('histogram'), { title: `${t('view.histogram')} (H)`, className: settings().histogram ? 'on' : '' }),
        button('filmstrip', t('view.filmstrip'), () => toggleSetting('filmstrip'), { title: t('view.filmstrip'), className: settings().filmstrip ? 'on' : '' }),
        button('fullscreen', t('view.fullscreen'), () => toggleFullscreen(), { title: `${t('view.fullscreen')} (F)` })),
      group(
        button('search', t('view.loupe'), () => toggleLoupe(), { title: `${t('view.loupe')} (L)`, className: loupeOn ? 'on' : '' }),
        button('map', t('view.navigator'), () => toggleSetting('navigator'), { title: t('view.navigator'), className: settings().navigator ? 'on' : '' }),
        button('lock', t('view.zoomLock'), () => toggleSetting('zoomLock'), { title: `${t('view.zoomLock')} (Z)`, className: settings().zoomLock ? 'on' : '' }),
        button('user', t('view.faces'), () => toggleSetting('faces'), { title: `${t('view.faces')} (G)`, className: settings().faces ? 'on' : '' }),
        current?.kind === 'video' ? button('camera', t('view.saveFrame'), () => saveVideoFrame(), { title: t('view.saveFrame') }) : null,
        current?.kind === 'video' ? button('scissors', t('trim.menu'), () => trimCurrent(), { title: t('trim.menu'), id: 'viewer-trim' }) : null),
      current?.kind === 'video' ? videoControls() : null,
      h('div.tool-spacer'),
      h('div.viewer-rating')].filter(Boolean));
    renderRating();
  }

  function renderRating() {
    const box = toolbar.querySelector('.viewer-rating');
    if (!box) return;
    clear(box);
    if (!current) return;
    const record = app.catalog.get(current.item.path) ?? {};
    for (let n = 1; n <= 5; n++) {
      box.append(h(`button.star${(record.rating ?? 0) >= n ? '.on' : ''}`, { type: 'button', title: t('organize.rating', { n }), html: icon((record.rating ?? 0) >= n ? 'starFill' : 'star'), onclick: () => app.catalog.setRating([current.item.path], record.rating === n ? 0 : n) }));
    }
    box.append(h(`button.tag-toggle${record.tagged ? '.on' : ''}`, { type: 'button', title: t('organize.tag'), html: icon(record.tagged ? 'checkSquare' : 'square'), onclick: () => app.catalog.toggleTagged([current.item.path]) }));
    if (record.label) box.append(h('span.label-dot', { style: { background: LABEL_COLORS[record.label] }, title: t(`label.${record.label}`) }));
  }

  function toggleSetting(key) {
    settings()[key] = !settings()[key];
    app.saveSettings();
    buildToolbar();
    updateOverlays();
    renderFaces();
    stripBox.hidden = !settings().filmstrip;
    applyTransform();
  }

  /** The information panel sits on the right. ">" folds it to a strip; the toolbar button hides it. */
  function setInfoCollapsed(value) {
    settings().infoCollapsed = value;
    app.saveSettings();
    layoutInfoPane();
    requestAnimationFrame(() => applyTransform());
  }

  function layoutInfoPane() {
    const on = Boolean(settings().info);
    const collapsed = Boolean(settings().infoCollapsed);
    infoPane.hidden = !on;
    infoPane.classList.toggle('collapsed', on && collapsed);
    const toggle = toolbar.querySelector('#viewer-info-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(on));
    clear(infoHead);
    infoHead.className = 'pane-head';
    if (!on) return;
    if (collapsed) {
      infoHead.append(
        h('button.pane-fold', { type: 'button', title: t('pane.expand'), dataset: { fold: 'info' }, onclick: () => setInfoCollapsed(false) }, '<'),
        h('div.pane-strip-title', { title: t('view.info') }, h('span', { html: icon('info') }), h('span.pane-strip-text', t('view.info'))));
      infoBody.hidden = true;
      return;
    }
    infoHead.append(
      h('button.pane-fold', { type: 'button', title: t('pane.collapse'), dataset: { fold: 'info' }, onclick: () => setInfoCollapsed(true) }, '>'),
      h('span.pane-head-icon', { html: icon('info') }),
      h('span.pane-head-title', t('view.info')));
    infoBody.hidden = false;
  }

  // ───────── loading

  /** New language: rewrite the labels and leave the picture, zoom and frame alone. */
  function relabel() {
    navPrev.title = t('view.prev');
    navNext.title = t('view.next');
    stripPrev.title = `${t('view.prev')} (←)`;
    stripPrev.setAttribute('aria-label', t('view.prev'));
    stripNext.title = `${t('view.next')} (→)`;
    stripNext.setAttribute('aria-label', t('view.next'));
    spinner.textContent = t('list.loading');
    buildToolbar();
    layoutInfoPane();
    updateOverlays();
    renderStatus();
    renderPageNav();
    if (dicom.active) dicom.refresh();
  }

  function open(path) {
    list = viewableList();
    index = Math.max(0, list.findIndex((item) => item.path === path));
    buildToolbar();
    layoutInfoPane();
    stripBox.hidden = !settings().filmstrip;
    renderStrip();
    show();
    stage.focus({ preventScroll: true });
  }

  async function elementFor(item) {
    const kind = kindOf(item.name);
    if (kind === 'video') {
      const v = videoSettings();
      const video = h('video.viewer-media', { crossOrigin: 'anonymous', src: await fs.url(item.path), controls: v.controls, autoplay: v.autoplay, loop: v.loop, muted: v.muted, playsInline: true }); // anonymous: saved frames are not tainted
      await new Promise((resolve) => { video.onloadedmetadata = resolve; video.onerror = resolve; setTimeout(resolve, 4000); });
      applyVideoSettings(video, item.path);
      return { el: video, width: video.videoWidth || 1280, height: video.videoHeight || 720, kind };
    }
    if (kind === 'native' || kind === 'svg') {
      const url = await fs.objectUrl(item.path);
      const img = h('img.viewer-media', { crossOrigin: 'anonymous', src: url, alt: item.name, draggable: false, decoding: 'async' });
      try {
        await img.decode();
        URL.revokeObjectURL(url);
        return { el: img, width: img.naturalWidth || 1024, height: img.naturalHeight || 768, kind };
      } catch {
        URL.revokeObjectURL(url);
        if (kind === 'svg') throw new Error(t('view.cannotOpen'));
        // Not decodable as-is (e.g. a JPEG the engine rejects): our decoder.
      }
    }
    if (kind === 'dicom') {
      const { loadDicom } = await import('../formats/dicom.js');
      const image = await loadDicom(await fs.read(item.path));
      const { canvas } = await image.toCanvas({ frame: 0 });
      const view = document.createElement('canvas');
      view.width = canvas.width;
      view.height = canvas.height;
      view.getContext('2d').drawImage(canvas, 0, 0);
      view.className = 'viewer-media';
      return { el: view, width: canvas.width, height: canvas.height, kind, dicom: image };
    }
    const key = `${item.path}#${page}`;
    let entry = cache.get(key);
    if (!entry) {
      const decoded = await decodeImage(await fs.read(item.path), item.name, { page: kind === 'tiff' || kind === 'pdf' ? page : null });
      let canvas = decoded.source;
      if (!(canvas instanceof HTMLCanvasElement)) {
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        canvas = c;
      }
      entry = { canvas, pages: decoded.pages ?? 1, profile: decoded.profile ?? '' };
      cache.set(key, entry);
      while (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    const { canvas } = entry;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    copy.className = 'viewer-media';
    return { el: copy, width: canvas.width, height: canvas.height, kind, pages: entry.pages, profile: entry.profile };
  }

  async function show() {
    const item = list[index];
    const mine = ++token;
    if (!item) { clear(holder); current = null; renderStatus(); return; }
    selectItem(item.path);
    app.state.viewPath = item.path;
    app.state.viewPath = item.path;
    spinner.hidden = false;
    // Zoom lock: the next picture keeps the zoom and position (read before the placeholder resets them).
    const kept = settings().zoomLock && !fit ? { zoom, offset: { ...offset } } : null;
    // Thumbnail first so something is on screen at once.
    const thumb = thumbs.peek(item);
    if (thumb?.url && (!current || current.item !== item)) {
      clear(holder);
      const placeholder = h('img.viewer-media.placeholder', { src: thumb.url, alt: '' });
      holder.append(placeholder);
      current = { item, el: placeholder, width: thumb.width || 400, height: thumb.height || 300, kind: 'placeholder' };
      if (!kept) { fit = true; offset = { x: 0, y: 0 }; }
      applyTransform();
    }
    // A slow picture (big RAW, TIFF, PDF page …) shows in the status bar while it loads.
    let slow = null;
    const slowTimer = setTimeout(() => { slow = statusProgress.start(t('status.loadingPicture', { name: item.name })); }, 300);
    const loaded = () => { clearTimeout(slowTimer); slow?.done(); };
    try {
      const result = await elementFor(item).finally(loaded);
      if (mine !== token) return;
      clear(holder);
      holder.append(result.el);
      current = { item, ...result };
      pixelSource = null;
      if (current.kind === 'dicom') await dicom.attach(current); else dicom.detach();
      if (current.kind !== 'video') { videoFlash.hidden = true; videoPaused.hidden = true; }
      if (kept) { fit = false; zoom = kept.zoom; offset = kept.offset; } else { fit = true; offset = { x: 0, y: 0 }; }
      applyTransform();
      renderPageNav();
      renderFaces();
      drawNavigatorImage();
      buildToolbar();
      spinner.hidden = true;
      updateOverlays();
      preload();
    } catch (error) {
      if (mine !== token) return;
      spinner.hidden = true;
      clear(holder);
      holder.append(h('div.viewer-error', h('span', { html: icon('warning') }), h('div', item.name), h('div', error?.message ?? String(error))));
      current = { item, el: null, width: 0, height: 0, kind: 'error' };
    }
    renderStatus();
    renderRating();
    markStrip();
  }

  function preload() {
    for (const d of [1, -1]) {
      const item = list[index + d];
      if (!item) continue;
      const kind = kindOf(item.name);
      if (kind && kind !== 'video' && kind !== 'svg' && !cache.has(item.path)) {
        fs.read(item.path).then((bytes) => decodeImage(bytes, item.name)).then((decoded) => {
          const c = document.createElement('canvas');
          c.width = decoded.source.width;
          c.height = decoded.source.height;
          c.getContext('2d').drawImage(decoded.source, 0, 0);
          cache.set(item.path, c);
          while (cache.size > 4) cache.delete(cache.keys().next().value);
        }).catch(() => {});
      }
    }
  }

  // ───────── zoom & pan

  function fitScale() {
    if (!current?.width) return 1;
    const w = stage.clientWidth - 8;
    const hgt = stage.clientHeight - 8;
    const k = Math.min(w / current.width, hgt / current.height);
    if (current.kind === 'video') {
      // Video: fit the window (also enlarged), its actual size, or fill the window (cropped).
      const mode = videoSettings().fit;
      return mode === 'actual' ? 1 : mode === 'fill' ? Math.max((stage.clientWidth) / current.width, (stage.clientHeight) / current.height) : k;
    }
    return settings().enlarge ? k : Math.min(1, k);
  }

  function applyTransform() {
    if (!current?.el) return;
    const scale = fit ? fitScale() : zoom;
    if (fit) zoom = scale;
    const w = current.width * scale;
    const hgt = current.height * scale;
    // Keep the picture on screen.
    const maxX = Math.max(0, (w - stage.clientWidth) / 2);
    const maxY = Math.max(0, (hgt - stage.clientHeight) / 2);
    offset.x = Math.max(-maxX, Math.min(maxX, offset.x));
    offset.y = Math.max(-maxY, Math.min(maxY, offset.y));
    const style = current.el.style;
    // DICOM frames are drawn into the canvas while it stays on screen. A CSS
    // scale keeps the previous bitmap (the cine looks frozen), so size it like
    // a video: the element is the displayed size and is only positioned, not scaled.
    if (current.kind === 'dicom') {
      style.width = `${w}px`;
      style.height = `${hgt}px`;
      style.marginLeft = `${offset.x - w / 2}px`;
      style.marginTop = `${offset.y - hgt / 2}px`;
      style.transform = 'none';
    } else if (current.kind === 'video') {
      style.marginLeft = '';
      style.marginTop = '';
      // A video is sized, not scaled: scaling would blow up the player's own controls too.
      style.width = `${w}px`;
      style.height = `${hgt}px`;
      style.transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`;
      // The player's own control bar keeps the width it was first laid out at
      // until playback redraws it: re-create it whenever the size changes.
      const size = `${Math.round(w)}x${Math.round(hgt)}`;
      const video = current.el;
      if (video.dataset.size !== size) {
        video.dataset.size = size;
        if (video.controls) {
          video.controls = false;
          requestAnimationFrame(() => { if (current?.el === video) video.controls = videoSettings().controls !== false; });
        }
      }
    } else {
      style.width = `${current.width}px`;
      style.height = `${current.height}px`;
      style.marginLeft = '';
      style.marginTop = '';
      style.transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
    }
    style.imageRendering = scale > 2 && !settings().smooth ? 'pixelated' : 'auto';
    stage.classList.toggle('pannable', w > stage.clientWidth || hgt > stage.clientHeight);
    // Face boxes ride on the same transform.
    faceLayer.style.width = style.width;
    faceLayer.style.height = style.height;
    faceLayer.style.transform = style.transform;
    faceLayer.style.marginLeft = style.marginLeft;
    faceLayer.style.marginTop = style.marginTop;
    if (dicom.active) dicom.layout(style);
    updateNavigator(scale, w, hgt);
    renderStatus();
  }

  // ───────── navigator (where the zoomed view is in the whole picture)

  function drawNavigatorImage() {
    const canvas = navigator.querySelector('canvas');
    if (!current?.el || current.kind === 'video') return;
    const k = Math.min(180 / current.width, 130 / current.height);
    canvas.width = Math.max(1, Math.round(current.width * k));
    canvas.height = Math.max(1, Math.round(current.height * k));
    try { canvas.getContext('2d').drawImage(current.el, 0, 0, canvas.width, canvas.height); } catch { /* not drawable yet */ }
  }

  function updateNavigator(scale, w, hgt) {
    const show = settings().navigator && current?.el && current.kind !== 'video' && (w > stage.clientWidth + 1 || hgt > stage.clientHeight + 1);
    navigator.hidden = !show;
    if (!show) return;
    const canvas = navigator.querySelector('canvas');
    const view = navigator.querySelector('.navigator-view');
    const k = canvas.width / current.width;
    // Visible part of the picture, in picture pixels.
    const left = (current.width * scale / 2 - stage.clientWidth / 2 - offset.x) / scale;
    const top = (current.height * scale / 2 - stage.clientHeight / 2 - offset.y) / scale;
    view.style.left = `${Math.max(0, left * k)}px`;
    view.style.top = `${Math.max(0, top * k)}px`;
    view.style.width = `${Math.min(canvas.width, (stage.clientWidth / scale) * k)}px`;
    view.style.height = `${Math.min(canvas.height, (stage.clientHeight / scale) * k)}px`;
  }

  navigator.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    const canvas = navigator.querySelector('canvas');
    navigator.setPointerCapture(event.pointerId);
    const moveTo = (e) => {
      const rect = canvas.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const scale = fit ? fitScale() : zoom;
      offset.x = (0.5 - fx) * current.width * scale;
      offset.y = (0.5 - fy) * current.height * scale;
      applyTransform();
    };
    moveTo(event);
    const up = () => { navigator.removeEventListener('pointermove', moveTo); navigator.removeEventListener('pointerup', up); };
    navigator.addEventListener('pointermove', moveTo);
    navigator.addEventListener('pointerup', up);
  });

  // ───────── picture coordinates, pixel values, loupe

  function imagePoint(clientX, clientY) {
    if (!current?.width) return null;
    const rect = stage.getBoundingClientRect();
    const scale = fit ? fitScale() : zoom;
    const x = (clientX - rect.left - rect.width / 2 - offset.x) / scale + current.width / 2;
    const y = (clientY - rect.top - rect.height / 2 - offset.y) / scale + current.height / 2;
    return x >= 0 && y >= 0 && x < current.width && y < current.height ? { x: Math.floor(x), y: Math.floor(y) } : null;
  }

  function pixelAt(x, y) {
    if (!current?.el || current.kind === 'video' || current.kind === 'placeholder') return null;
    if (!pixelSource) {
      pixelSource = document.createElement('canvas');
      pixelSource.width = current.width;
      pixelSource.height = current.height;
      try { pixelSource.getContext('2d', { willReadFrequently: true }).drawImage(current.el, 0, 0, current.width, current.height); } catch { return null; }
    }
    try { return pixelSource.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data; } catch { return null; }
  }

  function toggleLoupe(force) {
    loupeOn = force ?? !loupeOn;
    loupe.hidden = true;
    buildToolbar();
  }

  stage.addEventListener('pointermove', (event) => {
    const point = imagePoint(event.clientX, event.clientY);
    const px = point ? pixelAt(point.x, point.y) : null;
    pixelInfo = point && dicom.active ? (dicom.probe(point.x, point.y) ?? '') : point && px ? `${point.x}, ${point.y}  RGB(${px[0]}, ${px[1]}, ${px[2]})  #${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}` : '';
    const info = status.querySelector('.pixel-info');
    if (info) info.textContent = pixelInfo;
    if (!loupeOn || !point || !current?.el || current.kind === 'video') { loupe.hidden = true; return; }
    const rect = stage.getBoundingClientRect();
    loupe.hidden = false;
    loupe.style.left = `${event.clientX - rect.left - 110}px`;
    loupe.style.top = `${event.clientY - rect.top - 110}px`;
    const scale = fit ? fitScale() : zoom;
    const magnify = scale * (settings().loupe || 3);
    const span = 220 / magnify;
    const c = loupe.getContext('2d');
    c.imageSmoothingEnabled = magnify < 4;
    c.fillStyle = '#000';
    c.fillRect(0, 0, 220, 220);
    try { c.drawImage(current.el, point.x - span / 2, point.y - span / 2, span, span, 0, 0, 220, 220); } catch { /* not drawable */ }
  });
  stage.addEventListener('pointerleave', () => { loupe.hidden = true; });

  // ───────── pages (multi-page TIFF, PDF)

  function renderPageNav() {
    clear(pageNav);
    const pages = current?.pages ?? 1;
    pageNav.hidden = pages <= 1;
    if (pages <= 1) return;
    pageNav.append(
      h('button.tool', { type: 'button', title: `${t('view.prevPage')} (Ctrl+PageUp)`, html: icon('prev'), disabled: page <= 0, onclick: () => goPage(page - 1) }),
      h('span.page-label', t('view.page', { n: page + 1, total: pages })),
      h('button.tool', { type: 'button', title: `${t('view.nextPage')} (Ctrl+PageDown)`, html: icon('next'), disabled: page >= pages - 1, onclick: () => goPage(page + 1) }));
  }

  function goPage(next) {
    const pages = current?.pages ?? 1;
    if (next < 0 || next >= pages || next === page) return;
    page = next;
    show();
  }

  // ───────── faces

  function renderFaces() {
    clear(faceLayer);
    faceLayer.hidden = !settings().faces || !current?.width;
    if (faceLayer.hidden) return;
    const record = app.catalog.get(current.item.path);
    (record?.faces ?? []).forEach((face, i) => {
      const box = h(`div.face-box${face.person ? '.named' : ''}`, {
        style: { left: `${face.box.x * 100}%`, top: `${face.box.y * 100}%`, width: `${face.box.w * 100}%`, height: `${face.box.h * 100}%` },
        title: face.person ?? t('people.whoIsThis'),
      }, h('span.face-name', face.person ?? (face.suggested ? `${face.suggested}?` : '?')));
      box.addEventListener('pointerdown', (e) => e.stopPropagation());
      box.addEventListener('click', () => nameFace(i, face));
      faceLayer.append(box);
    });
  }

  async function nameFace(index, face) {
    const name = await promptDialog(t('people.name'), face.person ?? face.suggested ?? '', { title: t('people.whoIsThis') });
    if (name == null) return;
    app.catalog.nameFace(current.item.path, index, name);
    renderFaces();
  }

  // ───────── video playback options (Settings → Video, and the viewer's video tools)

  const videoSettings = () => ({ autoplay: true, loop: false, muted: false, volume: 100, speed: 1, controls: true, fit: 'fit', resume: true, nextAtEnd: false, ...(app.settings.video ?? {}) });
  const videoPositions = new Map(); // where each video was left (this session)
  function saveVideo(change) {
    app.settings.video = { ...videoSettings(), ...change };
    app.saveSettings();
    const video = current?.el;
    if (video instanceof HTMLVideoElement) applyVideoSettings(video, current.item.path, { keepTime: true });
    if ('fit' in change) { fit = true; offset = { x: 0, y: 0 }; applyTransform(); }
    buildToolbar();
  }
  function applyVideoSettings(video, path, { keepTime = false } = {}) {
    const v = videoSettings();
    video.loop = v.loop;
    video.muted = v.muted;
    video.controls = v.controls;
    video.volume = Math.max(0, Math.min(1, v.volume / 100));
    video.playbackRate = v.speed;
    video.defaultPlaybackRate = v.speed;
    if (!keepTime && v.resume && videoPositions.get(path) > 0 && videoPositions.get(path) < (video.duration || Infinity) - 1) video.currentTime = videoPositions.get(path);
    video.ontimeupdate = () => { videoPositions.set(path, video.currentTime); };
    const showState = (flash) => {
      if (current?.el !== video) return;
      videoPaused.hidden = !video.paused || video.ended;
      videoPaused.innerHTML = `${icon('pause')}<span>${t('video.paused')}</span>`;
      if (!flash) return;
      videoFlash.innerHTML = icon(video.paused ? 'pause' : 'play');
      videoFlash.hidden = false;
      videoFlash.classList.remove('fade');
      void videoFlash.offsetWidth; // restart the fade
      videoFlash.classList.add('fade');
      clearTimeout(videoFlash.timer);
      videoFlash.timer = setTimeout(() => { videoFlash.hidden = true; }, 900);
    };
    video.onplay = () => showState(true);
    video.onpause = () => showState(true);
    video.onloadeddata = () => showState(false);
    // A click on the picture (not on the player's controls) plays / pauses.
    video.onclick = (event) => {
      const box = video.getBoundingClientRect();
      if (video.controls && event.clientY > box.bottom - 48) return;
      event.preventDefault();
      if (video.paused) video.play().catch(() => {}); else video.pause();
    };
    showState(false);
    video.onended = () => { videoPositions.delete(path); if (videoSettings().nextAtEnd && !videoSettings().loop && current?.el === video) step(1); };
  }
  /** Speed, loop, sound and how the video fills the screen. */
  function videoControls() {
    const v = videoSettings();
    const speed = h('select.input.video-speed', { title: t('video.speed'), dataset: { key: 'video-speed' } }, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => h('option', { value: s, selected: s === v.speed }, `${s}×`)));
    speed.addEventListener('change', () => saveVideo({ speed: Number(speed.value) }));
    const fitSelect = h('select.input.video-fit', { title: t('video.fit'), dataset: { key: 'video-fit' } }, [['fit', t('video.fitWindow')], ['actual', t('video.fitActual')], ['fill', t('video.fitFill')]].map(([id, label]) => h('option', { value: id, selected: id === v.fit }, label)));
    fitSelect.addEventListener('change', () => saveVideo({ fit: fitSelect.value }));
    return h('div.tool-group.video-tools',
      button('repeat', t('video.loop'), () => saveVideo({ loop: !videoSettings().loop }), { className: v.loop ? 'on' : '', id: 'video-loop' }),
      button(v.muted ? 'volumeOff' : 'volume', t('video.mute'), () => saveVideo({ muted: !videoSettings().muted }), { className: v.muted ? 'on' : '', id: 'video-mute' }),
      speed, fitSelect);
  }

  // ───────── video frames

  async function trimCurrent() {
    const video = current?.el;
    if (!(video instanceof HTMLVideoElement)) return;
    video.pause();
    const { trimVideoDialog } = await import('./videotrim.js');
    await trimVideoDialog(current.item, video.currentTime);
  }

  async function saveVideoFrame() {
    const video = current?.el;
    if (!(video instanceof HTMLVideoElement)) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const seconds = Math.floor(video.currentTime);
    const name = `${current.item.name.replace(/\.[^.]+$/, '')}_${String(Math.floor(seconds / 60)).padStart(2, '0')}m${String(seconds % 60).padStart(2, '0')}s.jpg`;
    const dir = current.item.path.slice(0, current.item.path.length - current.item.name.length - 1);
    const target = `${dir}${current.item.path.includes('\\') && !current.item.path.includes('/') ? '\\' : '/'}${name}`;
    const how = await fs.write(target, new Uint8Array(await blob.arrayBuffer()));
    toast(how === 'downloaded' ? t('edit.downloaded') : t('view.frameSaved', { name }), 'success');
  }

  function setZoom(value, at = null) {
    if (!current?.width) return;
    const before = fit ? fitScale() : zoom;
    const next = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], value));
    if (at) {
      const rect = stage.getBoundingClientRect();
      const px = at.x - rect.left - rect.width / 2 - offset.x;
      const py = at.y - rect.top - rect.height / 2 - offset.y;
      offset.x -= px * (next / before - 1);
      offset.y -= py * (next / before - 1);
    } else if (fit) offset = { x: 0, y: 0 };
    fit = false;
    zoom = next;
    applyTransform();
  }

  function zoomStep(direction, at) {
    const currentZoom = fit ? fitScale() : zoom;
    const next = direction > 0 ? ZOOMS.find((z) => z > currentZoom + 1e-6) : [...ZOOMS].reverse().find((z) => z < currentZoom - 1e-6);
    if (next) setZoom(next, at);
  }

  function setFit() {
    fit = true;
    offset = { x: 0, y: 0 };
    applyTransform();
  }

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.ctrlKey || settings().wheel === 'zoom') zoomStep(event.deltaY < 0 ? 1 : -1, { x: event.clientX, y: event.clientY });
    else step(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  stage.addEventListener('dblclick', (event) => {
    if (event.target.closest('button, video')) return;
    if (fit) setZoom(1, { x: event.clientX, y: event.clientY }); else setFit();
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, video')) return;
    if (dicom.pointerDown(event)) return; // DICOM window / measure tools (also Ctrl / middle-button windowing)
    if (event.button !== 0) return;
    stage.focus({ preventScroll: true });
    const start = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('panning');
    const move = (e) => { offset.x = start.ox + e.clientX - start.x; offset.y = start.oy + e.clientY - start.y; applyTransform(); };
    const up = () => { stage.classList.remove('panning'); stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerup', up); };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
  });

  stage.addEventListener('contextmenu', (event) => { if (current) onContextMenu?.(event, current.item); });
  navPrev.addEventListener('click', () => step(-1));
  navNext.addEventListener('click', () => step(1));
  new ResizeObserver(() => applyTransform()).observe(stage);

  // ───────── navigation

  function go(i) {
    if (!list.length) return;
    const next = Math.max(0, Math.min(list.length - 1, i));
    if (next === index && current?.item === list[next]) return;
    index = next;
    page = 0;
    show();
  }

  function step(d) { go(index + d); }

  async function deleteCurrent() {
    const item = current?.item;
    if (!item) return;
    await deleteItems([item.path]);
    list = viewableList();
    if (!list.length) { setMode('manage'); return; }
    index = Math.min(index, list.length - 1);
    renderStrip();
    show();
  }

  // ───────── filmstrip, overlays, status

  /** Visible folder name. A parent with no usable name is shown as "..". */
  function folderLabel(path) {
    const name = baseName(String(path).replace(/^@\d+:/, ''));
    return name || '..';
  }

  /** Parent folder and the sub-folders of the folder being viewed, so the strip can move up and down. */
  function stripFolders() {
    if (app.state.source?.type !== 'folder') return [];
    const parent = parentOf(app.state.source.path);
    const up = parent && parent !== app.state.source.path ? [{ path: parent, name: folderLabel(parent) }] : [];
    const dirs = app.state.list.filter((item) => item.isDir).map((item) => ({ path: item.path, name: item.name || folderLabel(item.path) }));
    return [...up, ...dirs];
  }

  function folderCell(entry) {
    const cell = h('button.strip-cell.strip-folder', { type: 'button', title: entry.name, dataset: { folder: entry.path } });
    cell.append(h('span.strip-folder-icon', { html: icon('folder') }), h('span.strip-folder-name', entry.name));
    cell.addEventListener('click', () => enterFolder(entry.path));
    return cell;
  }

  function renderStrip() {
    clear(strip);
    if (!settings().filmstrip) return;
    for (const entry of stripFolders()) strip.append(folderCell(entry));
    list.forEach((item, i) => {
      const cell = h('button.strip-cell', { type: 'button', title: item.name, dataset: { index: String(i) } });
      const thumb = thumbs.peek(item);
      if (thumb?.url) cell.append(h('img', { src: thumb.url, alt: '', loading: 'lazy', draggable: false }));
      else thumbs.get(item, 2).then((r) => { if (r?.url && cell.isConnected) cell.replaceChildren(h('img', { src: r.url, alt: '', draggable: false })); });
      cell.addEventListener('click', () => go(i));
      strip.append(cell);
    });
    markStrip();
  }

  function showEmptyFolder() {
    token += 1;
    dicom.detach();
    clear(holder);
    current = null;
    spinner.hidden = true;
    const name = app.state.source?.path?.split(/[\\/]/).filter(Boolean).pop() ?? '';
    holder.append(h('div.viewer-error', h('span', { html: icon('folder') }), h('div', name), h('div', t('list.empty'))));
    renderStrip();
    renderStatus();
    renderRating();
  }

  /** Opens a folder from the strip. The picture and the strip follow once that folder is listed. */
  function enterFolder(path) {
    openFolder(path);
  }

  function markStrip() {
    for (const cell of strip.children) cell.classList.toggle('current', cell.dataset.index != null && Number(cell.dataset.index) === index);
    stripPrev.disabled = !list.length || index <= 0;
    stripNext.disabled = !list.length || index >= list.length - 1;
    strip.querySelector(`.strip-cell[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function infoTable(rows) {
    const kept = rows.filter(([, value]) => value != null && value !== '');
    if (!kept.length) return null;
    return h('table.prop-table', kept.map(([key, value]) => h('tr', h('th', key), h('td', { title: String(value) }, String(value)))));
  }

  function infoSection(title, body) {
    return body ? h('section.viewer-info-section', h('div.viewer-info-head', title), body) : null;
  }

  function fillInfo() {
    clear(infoBody);
    const item = current?.item;
    if (!item) { infoBody.append(h('div.prop-empty', t('prop.nothingSelected'))); return; }
    const record = app.catalog.get(item.path) ?? {};
    const m = record.meta ?? {};
    const folder = item.path.slice(0, Math.max(0, item.path.length - item.name.length - 1));
    infoBody.append(h('div.info-name', item.name));
    infoBody.append(infoSection(t('prop.file'), infoTable([
      [t('prop.type'), badgeOf(item.name)],
      [t('prop.folder'), folder],
      [t('prop.size'), formatBytes(item.size)],
      [t('prop.dimensions'), formatDims(current.width, current.height)],
      [t('prop.duration'), formatDuration(m.duration)],
      [t('view.pages'), current.pages > 1 ? `${page + 1} / ${current.pages}` : ''],
      [t('prop.modified'), formatDateTime(item.modified)],
      [t('prop.created'), item.created && item.created !== item.modified ? formatDateTime(item.created) : ''],
      ['ICC', current.profile || ''],
    ])));
    const exposure = [m.exposure ? formatExposure(m.exposure) : '', m.fNumber ? `f/${m.fNumber}` : '', m.iso ? `ISO ${m.iso}` : '', m.bias ? `${m.bias > 0 ? '+' : ''}${m.bias} EV` : ''].filter(Boolean).join('   ');
    infoBody.append(infoSection(t('prop.exif'), infoTable([
      [t('exif.taken'), formatDateTime(m.taken)],
      [t('exif.camera'), m.camera],
      [t('exif.lens'), m.lens],
      [t('exif.exposure'), exposure],
      [t('exif.focal'), m.focal ? `${m.focal} mm${m.focal35 ? ` (35mm: ${m.focal35} mm)` : ''}` : ''],
      [t('exif.flash'), m.flash == null ? '' : m.flash ? t('exif.flashOn') : t('exif.flashOff')],
      [t('exif.gps'), m.lat != null ? `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}${m.alt != null ? ` · ${m.alt} m` : ''}` : ''],
      [t('exif.location'), [m.city, m.country].filter(Boolean).join(', ')],
      [t('exif.artist'), m.artist],
      [t('exif.copyright'), m.copyright],
    ])));
    const dicomMeta = current.dicom?.meta;
    if (dicomMeta) {
      infoBody.append(infoSection(t('view.dicom'), infoTable([
        [t('view.patient'), dicomMeta.patientName],
        [t('view.patientId'), dicomMeta.patientId],
        [t('view.modality'), dicomMeta.modality],
        [t('view.study'), [dicomMeta.studyDescription, dicomMeta.studyDate].filter(Boolean).join(' · ')],
        [t('view.series'), [dicomMeta.seriesDescription, dicomMeta.seriesNumber].filter(Boolean).join(' · ')],
        [t('view.bodyPart'), dicomMeta.bodyPart],
        [t('view.institution'), dicomMeta.institution],
        [t('exif.camera'), dicomMeta.manufacturer],
        [t('view.frames'), dicomMeta.frames],
        [t('view.spacing'), dicomMeta.pixelSpacing],
        [t('view.thickness'), dicomMeta.sliceThickness],
      ])));
    }
    const notes = [];
    if (record.title) notes.push([t('organize.title'), record.title]);
    if (record.caption) notes.push([t('organize.caption'), record.caption]);
    if (record.keywords?.length) notes.push([t('organize.keywords'), record.keywords.join(', ')]);
    if (notes.length) infoBody.append(infoSection(t('prop.organize'), infoTable(notes)));
  }

  function updateOverlays() {
    layoutInfoPane();
    overlayHist.hidden = !settings().histogram;
    if (settings().info) fillInfo();
    if (!current?.item) return;
    if (settings().histogram && current.el && current.kind !== 'video') drawHistogram(overlayHist, histogramOf(current.el));
  }

  /** "125%" — the zoom shown in the toolbar between − and +. */
  function zoomText() {
    if (!current?.width) return '–';
    return `${Math.round((fit ? fitScale() : zoom) * 100)}%`;
  }

  function renderStatus() {
    const value = toolbar.querySelector('.zoom-value');
    if (value) value.textContent = zoomText();
    clear(status);
    if (!current?.item) {
      if (app.state.source?.type === 'folder') status.append(h('span.status-name', app.state.source.path.split(/[\\/]/).filter(Boolean).pop() ?? ''), h('span', t('list.empty')));
      return;
    }
    const scale = fit ? fitScale() : zoom;
    status.append(
      h('span', `${index + 1} / ${list.length}`),
      h('span.status-name', current.item.name),
      h('span', formatDims(current.width, current.height)),
      h('span', formatBytes(current.item.size)),
      h('span.status-zoom', `${Math.round(scale * 100)}%${fit ? ` (${t('view.fitShort')})` : ''}`),
      current.profile ? h('span.status-profile', { title: app.settings.colorManagement ? t('view.profileConverted') : t('view.profileIgnored') }, `ICC: ${current.profile}`) : '',
      h('span.pixel-info', pixelInfo));
  }

  // ───────── full screen

  let fullscreen = false;
  async function toggleFullscreen(force) {
    fullscreen = force ?? !fullscreen;
    document.body.classList.toggle('immersive', fullscreen);
    if (fs.kind === 'desktop') await setFullscreen(fullscreen);
    else if (fullscreen) await document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {});
    setTimeout(applyTransform, 120);
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && fullscreen && fs.kind === 'web') { fullscreen = false; document.body.classList.remove('immersive'); setTimeout(applyTransform, 50); }
  });

  // ───────── keys (called by the app while in View mode)

  // The viewer's keys, as commands the user can reassign (Help → Customize shortcuts).
  // Esc always leaves full screen / the viewer.
  registerCommands([
    { id: 'view:next', label: 'keys.view.next', key: ['ArrowRight', 'PageDown', 'Space'], run: () => step(1) },
    { id: 'view:prev', label: 'keys.view.prev', key: ['ArrowLeft', 'PageUp', 'Backspace', 'Shift+Space'], run: () => step(-1) },
    { id: 'view:first', label: 'keys.view.first', key: 'Home', run: () => go(0) },
    { id: 'view:last', label: 'keys.view.last', key: 'End', run: () => go(list.length - 1) },
    { id: 'view:nextPage', label: 'keys.view.nextPage', key: 'Ctrl+PageDown', run: () => goPage(page + 1) },
    { id: 'view:prevPage', label: 'keys.view.prevPage', key: 'Ctrl+PageUp', run: () => goPage(page - 1) },
    { id: 'view:zoomIn', label: 'keys.view.zoomIn', key: ['+', '='], run: () => zoomStep(1) },
    { id: 'view:zoomOut', label: 'keys.view.zoomOut', key: '-', run: () => zoomStep(-1) },
    { id: 'view:fit', label: 'keys.view.fit', key: '/', run: () => setFit() },
    { id: 'view:actual', label: 'keys.view.actual', key: '*', run: () => setZoom(1) },
    { id: 'view:browse', label: 'keys.view.browse', key: 'Enter', run: () => setMode('manage') },
    { id: 'view:fullscreen', label: 'keys.view.fullscreen', key: ['F', 'F11'], run: () => toggleFullscreen() },
    { id: 'view:info', label: 'keys.view.info', key: 'I', run: () => toggleSetting('info') },
    { id: 'view:histogram', label: 'keys.view.histogram', key: 'H', run: () => toggleSetting('histogram') },
    { id: 'view:edit', label: 'keys.view.edit', key: 'E', run: () => { if (current) onEdit?.(current.item.path); } },
    { id: 'view:slideshow', label: 'keys.view.slideshow', key: 'S', run: () => onSlideshow?.(index) },
    { id: 'view:delete', label: 'keys.view.delete', key: 'Delete', run: () => deleteCurrent() },
    { id: 'view:loupe', label: 'keys.view.loupe', key: 'L', run: () => toggleLoupe() },
    { id: 'view:zoomLock', label: 'keys.view.zoomLock', key: 'Z', run: () => toggleSetting('zoomLock') },
    { id: 'view:faces', label: 'keys.view.faces', key: 'G', run: () => toggleSetting('faces') },
  ], 'view');

  function onKey(event) {
    if (dicom.onKey(event)) return true;
    if (current?.el instanceof HTMLVideoElement && (event.key === ' ' || event.key === 'k' || event.key === 'K') && !event.ctrlKey && !event.altKey) {
      const video = current.el;
      if (video.paused) video.play().catch(() => {}); else video.pause();
      return true;
    }
    if (event.key === 'Escape') { if (fullscreen) toggleFullscreen(false); else setMode('manage'); return true; }
    const command = commandFor(event, 'view');
    if (!command) return false;
    command.run();
    return true;
  }

  app.on('items', () => {
    if (app.state.mode !== 'view' || !stage.isConnected) return;
    const images = viewableList();
    const keep = current?.item ? images.findIndex((item) => item.path === current.item.path) : -1;
    list = images;
    if (keep >= 0) { index = keep; renderStrip(); return; }
    index = 0;
    page = 0;
    if (images.length) { renderStrip(); show(); }
    else showEmptyFolder();
  });
  app.on('catalog', (change) => { if (app.state.mode === 'view' && current && (!change?.paths || change.paths.includes(current.item.path))) { renderRating(); updateOverlays(); renderFaces(); } });

  /** Called after the current file changed on disk (rotate, edit). */
  /** Pictures decoded under the old colour setting are decoded again. */
  function forgetDecoded() { cache.clear(); }

  function reloadCurrent() {
    if (!current?.item) return;
    cache.delete(current.item.path);
    fs.releaseUrl?.(current.item.path);
    list = viewableList();
    const i = list.findIndex((item) => item.path === current.item.path);
    if (i >= 0) index = i;
    current = null;
    show();
  }

  layoutInfoPane();

  return {
    el, open, relabel, onKey, reloadCurrent, forgetDecoded, exitFullscreen: () => fullscreen && toggleFullscreen(false), get currentPath() { return current?.item?.path ?? null; },
    /** Test hooks. */
    debug: () => ({ zoom, fit, offset: { ...offset }, page, pages: current?.pages ?? 1, kind: current?.kind ?? null, width: current?.width ?? 0, height: current?.height ?? 0, loupeOn, pixelInfo, navigator: !navigator.hidden, faces: faceLayer.querySelectorAll('.face-box').length }),
    testing: { saveVideoFrame, trimCurrent, saveVideo, videoSettings, goPage, setZoom: (value) => setZoom(value) },
    dicom,
  };
}
