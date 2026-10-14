// View mode: one photo at a time — zoom and pan, previous / next, filmstrip,
// information and histogram overlays, rating / label / tag, rotate, delete,
// full screen. Formats the engine shows natively use <img> (animated GIF/WebP
// play); TIFF, HEIC, PSD and RAW are decoded to a canvas; videos play.
import { LABEL_COLORS } from '../catalog/catalog.js';
import { decodeImage } from '../formats/decode.js';
import { formatExposure } from '../formats/exif.js';
import { kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { setFullscreen } from '../platform/native.js';
import { app, deleteItems, selectItem, setMode, viewableList } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatBytes, formatDateTime, formatDims } from '../util/format.js';
import { statusProgress } from './dialog.js';
import { createDicomTools } from './dicomview.js';
import { button, clear, h } from './dom.js';
import { drawHistogram, histogramOf } from './histogram.js';
import { icon } from './icons.js';

const ZOOMS = [0.05, 0.08, 0.1, 0.125, 0.167, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export function createViewer({ onEdit, onSlideshow, onRotate, onContextMenu }) {
  const stage = h('div.viewer-stage', { tabIndex: 0 });
  const holder = h('div.viewer-holder');
  const spinner = h('div.viewer-spinner', t('list.loading'));
  const overlayInfo = h('div.viewer-info');
  const overlayHist = h('canvas.viewer-histogram', { width: 256, height: 100 });
  const navPrev = h('button.viewer-nav.prev', { type: 'button', title: t('view.prev'), html: icon('prev') });
  const navNext = h('button.viewer-nav.next', { type: 'button', title: t('view.next'), html: icon('next') });
  const faceLayer = h('div.face-layer', { hidden: true });
  const navigator = h('div.viewer-navigator', { hidden: true }, h('canvas.navigator-image'), h('div.navigator-view'));
  const loupe = h('canvas.loupe', { width: 220, height: 220, hidden: true });
  const pageNav = h('div.page-nav', { hidden: true });
  stage.append(holder, faceLayer, spinner, overlayInfo, overlayHist, navPrev, navNext, navigator, loupe, pageNav);
  const status = h('div.viewer-status');
  const strip = h('div.filmstrip');
  const toolbar = h('div.viewer-toolbar');
  // Medical images get their own toolbar, overlays and tools (dicomview.js).
  const dicom = createDicomTools({
    stage,
    imagePoint: (x, y) => imagePoint(x, y),
    scaleOf: () => (fit ? fitScale() : zoom),
    onRendered: () => { pixelSource = null; drawNavigatorImage(); },
  });
  const el = h('div.viewer', toolbar, dicom.bar, stage, strip, status);

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
    toolbar.append(
      group(button('back', t('view.backToManage'), () => setMode('manage'), { title: `${t('view.backToManage')} (Esc)`, showLabel: true, className: 'with-label' })),
      group(
        button('first', t('view.first'), () => go(0), { title: `${t('view.first')} (Home)` }),
        button('prev', t('view.prev'), () => step(-1), { title: `${t('view.prev')} (←)` }),
        button('next', t('view.next'), () => step(1), { title: `${t('view.next')} (→)` }),
        button('last', t('view.last'), () => go(list.length - 1), { title: `${t('view.last')} (End)` })),
      group(
        button('zoomOut', t('view.zoomOut'), () => zoomStep(-1), { title: `${t('view.zoomOut')} (-)` }),
        button('zoomIn', t('view.zoomIn'), () => zoomStep(1), { title: `${t('view.zoomIn')} (+)` }),
        button('fit', t('view.fit'), () => setFit(), { title: `${t('view.fit')} (/)` }),
        button('actual', t('view.actual'), () => setZoom(1), { title: `${t('view.actual')} (*)` })),
      group(
        button('rotateLeft', t('view.rotateLeft'), () => onRotate?.([current?.item?.path].filter(Boolean), -1), { title: `${t('view.rotateLeft')} (Ctrl+[)` }),
        button('rotateRight', t('view.rotateRight'), () => onRotate?.([current?.item?.path].filter(Boolean), 1), { title: `${t('view.rotateRight')} (Ctrl+])` })),
      group(
        button('pencil', t('view.edit'), () => current && onEdit?.(current.item.path), { title: `${t('view.edit')} (E)` }),
        button('play', t('view.slideshow'), () => onSlideshow?.(index), { title: `${t('view.slideshow')} (S)` }),
        button('trash', t('file.delete'), () => current && deleteCurrent(), { title: `${t('file.delete')} (Del)` })),
      group(
        button('info', t('view.info'), () => toggleSetting('info'), { title: `${t('view.info')} (I)`, className: settings().info ? 'on' : '' }),
        button('histogram', t('view.histogram'), () => toggleSetting('histogram'), { title: `${t('view.histogram')} (H)`, className: settings().histogram ? 'on' : '' }),
        button('filmstrip', t('view.filmstrip'), () => toggleSetting('filmstrip'), { title: t('view.filmstrip'), className: settings().filmstrip ? 'on' : '' }),
        button('fullscreen', t('view.fullscreen'), () => toggleFullscreen(), { title: `${t('view.fullscreen')} (F)` })),
      group(
        button('search', t('view.loupe'), () => toggleLoupe(), { title: `${t('view.loupe')} (L)`, className: loupeOn ? 'on' : '' }),
        button('map', t('view.navigator'), () => toggleSetting('navigator'), { title: t('view.navigator'), className: settings().navigator ? 'on' : '' }),
        button('lock', t('view.zoomLock'), () => toggleSetting('zoomLock'), { title: `${t('view.zoomLock')} (Z)`, className: settings().zoomLock ? 'on' : '' }),
        button('user', t('view.faces'), () => toggleSetting('faces'), { title: `${t('view.faces')} (G)`, className: settings().faces ? 'on' : '' }),
        current?.kind === 'video' ? button('camera', t('view.saveFrame'), () => saveVideoFrame(), { title: t('view.saveFrame') }) : null),
      h('div.tool-spacer'),
      h('div.viewer-rating'));
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
    strip.hidden = !settings().filmstrip;
    applyTransform();
  }

  // ───────── loading

  function open(path) {
    list = viewableList();
    index = Math.max(0, list.findIndex((item) => item.path === path));
    buildToolbar();
    strip.hidden = !settings().filmstrip;
    renderStrip();
    show();
    stage.focus({ preventScroll: true });
  }

  async function elementFor(item) {
    const kind = kindOf(item.name);
    if (kind === 'video') {
      const video = h('video.viewer-media', { crossOrigin: 'anonymous', src: await fs.url(item.path), controls: true, autoplay: true }); // anonymous: saved frames are not tainted
      await new Promise((resolve) => { video.onloadedmetadata = resolve; video.onerror = resolve; setTimeout(resolve, 4000); });
      return { el: video, width: video.videoWidth || 1280, height: video.videoHeight || 720, kind };
    }
    if (kind === 'native' || kind === 'svg') {
      const img = h('img.viewer-media', { crossOrigin: 'anonymous', src: await fs.url(item.path), alt: item.name, draggable: false, decoding: 'async' });
      try {
        await img.decode();
        return { el: img, width: img.naturalWidth || 1024, height: img.naturalHeight || 768, kind };
      } catch {
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
      entry = { canvas, pages: decoded.pages ?? 1 };
      cache.set(key, entry);
      while (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    const { canvas } = entry;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    copy.className = 'viewer-media';
    return { el: copy, width: canvas.width, height: canvas.height, kind, pages: entry.pages };
  }

  async function show() {
    const item = list[index];
    const mine = ++token;
    if (!item) { clear(holder); current = null; renderStatus(); return; }
    selectItem(item.path);
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
      if (kind === 'native') Promise.resolve(fs.url(item.path)).then((url) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = url; });
      else if (kind && kind !== 'video' && kind !== 'svg' && !cache.has(item.path)) {
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
    style.width = `${current.width}px`;
    style.height = `${current.height}px`;
    style.transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
    style.imageRendering = scale > 2 && !settings().smooth ? 'pixelated' : 'auto';
    stage.classList.toggle('pannable', w > stage.clientWidth || hgt > stage.clientHeight);
    // Face boxes ride on the same transform.
    faceLayer.style.width = style.width;
    faceLayer.style.height = style.height;
    faceLayer.style.transform = style.transform;
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
    const { promptDialog } = await import('./dialog.js');
    const name = await promptDialog(t('people.name'), face.person ?? face.suggested ?? '', { title: t('people.whoIsThis') });
    if (name == null) return;
    app.catalog.nameFace(current.item.path, index, name);
    renderFaces();
  }

  // ───────── video frames

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
    const { toast } = await import('./dialog.js');
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
    if (event.button !== 0 || event.target.closest('button, video')) return;
    if (dicom.pointerDown(event)) return; // DICOM window / measure tools
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

  function renderStrip() {
    clear(strip);
    if (!settings().filmstrip) return;
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

  function markStrip() {
    for (const cell of strip.children) cell.classList.toggle('current', Number(cell.dataset.index) === index);
    strip.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function updateOverlays() {
    overlayInfo.hidden = !settings().info;
    overlayHist.hidden = !settings().histogram;
    if (!current?.item) return;
    if (settings().info) {
      const record = app.catalog.get(current.item.path) ?? {};
      const m = record.meta ?? {};
      clear(overlayInfo);
      overlayInfo.append(
        h('div.info-name', current.item.name),
        h('div', formatDateTime(m.taken ?? current.item.modified)),
        h('div', [formatDims(current.width, current.height), formatBytes(current.item.size)].filter(Boolean).join(' · ')),
        m.camera ? h('div', [m.camera, m.lens].filter(Boolean).join(' · ')) : '',
        m.exposure || m.fNumber || m.iso ? h('div', [m.exposure ? formatExposure(m.exposure) : '', m.fNumber ? `f/${m.fNumber}` : '', m.iso ? `ISO ${m.iso}` : '', m.focal ? `${m.focal} mm` : ''].filter(Boolean).join('  ')) : '',
        record.keywords?.length ? h('div.info-keywords', record.keywords.join(', ')) : '',
        record.caption ? h('div.info-caption', record.caption) : '');
    }
    if (settings().histogram && current.el && current.kind !== 'video') drawHistogram(overlayHist, histogramOf(current.el));
  }

  function renderStatus() {
    clear(status);
    if (!current?.item) return;
    const scale = fit ? fitScale() : zoom;
    status.append(
      h('span', `${index + 1} / ${list.length}`),
      h('span.status-name', current.item.name),
      h('span', formatDims(current.width, current.height)),
      h('span', formatBytes(current.item.size)),
      h('span.status-zoom', `${Math.round(scale * 100)}%${fit ? ` (${t('view.fitShort')})` : ''}`),
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

  function onKey(event) {
    const k = event.key;
    if (dicom.onKey(event)) return true;
    if (k === 'Escape') { if (fullscreen) toggleFullscreen(false); else setMode('manage'); return true; }
    // Pages first: Ctrl+PageDown is a page, plain PageDown the next photo.
    if ((event.ctrlKey || event.metaKey) && k === 'PageDown') { goPage(page + 1); return true; }
    if ((event.ctrlKey || event.metaKey) && k === 'PageUp') { goPage(page - 1); return true; }
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !event.shiftKey)) { step(1); return true; }
    if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace' || (k === ' ' && event.shiftKey)) { step(-1); return true; }
    if (k === 'Home') { go(0); return true; }
    if (k === 'End') { go(list.length - 1); return true; }
    if (k === '+' || k === '=') { zoomStep(1); return true; }
    if (k === '-') { zoomStep(-1); return true; }
    if (k === '/') { setFit(); return true; }
    if (k === '*') { setZoom(1); return true; }
    if (k === 'Enter') { setMode('manage'); return true; }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (k === 'f' || k === 'F' || k === 'F11') { toggleFullscreen(); return true; }
    if (k === 'i' || k === 'I') { toggleSetting('info'); return true; }
    if (k === 'h' || k === 'H') { toggleSetting('histogram'); return true; }
    if (k === 'e' || k === 'E') { if (current) onEdit?.(current.item.path); return true; }
    if (k === 's' || k === 'S') { onSlideshow?.(index); return true; }
    if (k === 'Delete') { deleteCurrent(); return true; }
    if (k === 'l' || k === 'L') { toggleLoupe(); return true; }
    if (k === 'z' || k === 'Z') { toggleSetting('zoomLock'); return true; }
    if (k === 'g' || k === 'G') { toggleSetting('faces'); return true; }
    return false;
  }

  app.on('catalog', (change) => { if (app.state.mode === 'view' && current && (!change?.paths || change.paths.includes(current.item.path))) { renderRating(); updateOverlays(); renderFaces(); } });

  /** Called after the current file changed on disk (rotate, edit). */
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

  return {
    el, open, onKey, reloadCurrent, exitFullscreen: () => fullscreen && toggleFullscreen(false), get currentPath() { return current?.item?.path ?? null; },
    /** Test hooks. */
    debug: () => ({ zoom, fit, offset: { ...offset }, page, pages: current?.pages ?? 1, kind: current?.kind ?? null, width: current?.width ?? 0, height: current?.height ?? 0, loupeOn, pixelInfo, navigator: !navigator.hidden, faces: faceLayer.querySelectorAll('.face-box').length }),
    testing: { saveVideoFrame, goPage, setZoom: (value) => setZoom(value) },
    dicom,
  };
}
