// DICOM in the viewer: the toolbar and overlays a medical image needs.
//   window / level  presets (from the file and for the modality), centre and width,
//                   drag tool (left-right = width, up-down = centre), reset
//   display         invert, colour map, VOI LUT and its function, overlay planes
//   frames          slider (and its wheel), step, cine play — the file's frame
//                   times or 1…120 fps, loop / bounce / once
//   measurements    undo / redo, delete one (Del), bound to their frame
//   measure         distance (mm from the pixel spacing), angle (3 points), Cobb
//                   angle (between two lines), rectangle / ellipse ROI statistics
//                   (mean, SD, min, max, area)
//   scale           rulers with mm ticks along the picture, the scale ratio
//                   (mm per pixel, 1:N on the screen) and actual physical size
//   keyboard        see onKey (tools, display, overlays, frames)
//   information     four-corner text (patient, study, series, window, frame,
//                   zoom), orientation markers, every tag in a searchable list,
//                   the value under the cursor in real units (e.g. HU)
//   export          the shown frame or all frames in any output format (JPEG,
//                   PNG, TIFF, JPEG 2000, DICOM, …), every frame as a WebM video,
//                   the tags as JSON / CSV / TXT or to the clipboard
// The decoder (formats/dicomDecoder.js) does the pixel work; this draws and controls.
import { joinPath, parentOf } from '../catalog/catalog.js';
import { OUTPUT_FORMATS, stemOf } from '../formats/types.js';
import { encodeCanvas } from '../formats/encode.js';
import { warmVideoEncoder } from './create.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, reload } from '../store.js';
import { openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { contextMenu } from './menu.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (name, attrs = {}) => { const el = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
const fmt = (v, digits = 1) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? Math.round(v) : Number(v.toFixed(digits))) : '–');

export function createDicomTools({ stage, imagePoint, scaleOf, zoomTo, zoomStep, onRendered, onHistory }) {
  const bar = h('div.dicom-bar', { hidden: true });
  const layer = svg('svg', { class: 'dicom-layer' });
  const corners = h('div.dicom-corners', { hidden: true });
  const rulers = svg('svg', { class: 'dicom-rulers' });
  const crosshair = svg('svg', { class: 'dicom-crosshair' });
  const crossX = svg('line', { x1: 0, y1: 0, x2: 0, y2: 0 });
  const crossY = svg('line', { x1: 0, y1: 0, x2: 0, y2: 0 });
  crosshair.append(crossX, crossY);
  crosshair.style.display = 'none';
  stage.append(layer, corners, rulers, crosshair);
  const placeCross = (x, y, box) => {
    if (!shown('crosshair')) { crosshair.style.display = 'none'; return; }
    crosshair.style.display = '';
    crosshair.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    crossX.setAttribute('x1', 0);
    crossX.setAttribute('x2', box.width);
    crossX.setAttribute('y1', y);
    crossX.setAttribute('y2', y);
    crossY.setAttribute('y1', 0);
    crossY.setAttribute('y2', box.height);
    crossY.setAttribute('x1', x);
    crossY.setAttribute('x2', x);
  };
  stage.addEventListener('pointermove', (event) => {
    if (!image) return;
    const box = stage.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    if (x < 0 || y < 0 || x > box.width || y > box.height) { crosshair.style.display = 'none'; return; }
    placeCross(x, y, box);
    rulers.querySelector('.dicom-ruler.horizontal .dicom-ruler-cursor')?.setAttribute('x1', x);
    rulers.querySelector('.dicom-ruler.horizontal .dicom-ruler-cursor')?.setAttribute('x2', x);
    rulers.querySelector('.dicom-ruler.vertical .dicom-ruler-cursor')?.setAttribute('y1', y);
    rulers.querySelector('.dicom-ruler.vertical .dicom-ruler-cursor')?.setAttribute('y2', y);
  });
  stage.addEventListener('pointerleave', () => { crosshair.style.display = 'none'; });

  let image = null;
  let item = null;
  let canvas = null;
  let state = {};
  let tool = 'pan';
  let measures = [];
  let cineTimer = null;
  let fps = 10;
  // Overlays: rulers, scale bar and corner information, each on/off (remembered in Settings).
  const shown = (key) => app.settings.dicom?.[key] !== false;
  const toggleShown = (key) => { app.settings.dicom = { ...(app.settings.dicom ?? {}), [key]: !shown(key) }; app.saveSettings(); };
  let pending = null; // an angle / Cobb measurement waiting for its next point
  let selected = null; // the measurement picked by a click (Del / context menu delete it)
  let undoStack = []; // measurement history (Ctrl+Z / Ctrl+Y)
  let redoStack = [];
  let cineMode = 'loop'; // loop | bounce | once
  let cineDirection = 1;
  let cineGen = 0;
  let playing = false;
  let cineWait = null; // resolves the pause between frames when playback stops
  let fpsFromFile = true; // follow the file's frame times until the user sets a rate
  let rendering = null;

  const frames = () => image?.frames ?? 1;
  const spacing = () => image?.frameInfo?.(state.frame)?.pixelSpacing ?? image?.geometry?.pixelSpacing ?? null;
  // Length unit chosen in Settings: mm, cm or inch (the file's spacing is in mm).
  const UNIT_MM = { mm: 1, cm: 10, inch: 25.4 };
  const unitName = () => (UNIT_MM[app.settings.measureUnit] ? app.settings.measureUnit : 'mm');
  const unitLabel = () => ({ mm: 'mm', cm: 'cm', inch: 'in' })[unitName()];
  const fromMm = (mm) => mm / UNIT_MM[unitName()];

  // ───────── rendering

  async function render(change = {}) {
    if (!image) return;
    state = { ...state, ...change };
    const token = {};
    rendering = token;
    const { canvas: out, state: shown } = await image.toCanvas({ ...state });
    if (rendering !== token || !canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(out, 0, 0, canvas.width, canvas.height);
    // WebView keeps the previous bitmap when the canvas is only moved by a CSS
    // transform, so a cine looks frozen. A size change is not required; dropping
    // the transform for one frame makes the new pixels show.
    const transform = canvas.style.transform;
    if (transform && transform !== 'none') {
      canvas.style.transform = 'none';
      requestAnimationFrame(() => { if (canvas) canvas.style.transform = transform; });
    }
    state = { ...state, ...shown };
    delete state.resetWindow;
    syncBar();
    drawCorners();
    drawMeasures();
    onRendered?.();
  }

  // ───────── attach / detach

  async function attach(current) {
    detach();
    image = current.dicom;
    item = current.item;
    canvas = current.el;
    state = { frame: 0, ...image.state };
    fps = Math.round(image.frameRate || app.settings.dicom?.fps || 10);
    fpsFromFile = true;
    cineDirection = 1;
    measures = [];
    undoStack = [];
    redoStack = [];
    tool = 'pan';
    layer.setAttribute('viewBox', `0 0 ${current.width} ${current.height}`);
    layer.style.display = 'block'; // the stylesheet hides the layer until a DICOM is shown
    corners.hidden = !shown('corners');
    buildBar();
    bar.hidden = false;
    stage.classList.add('dicom-view');
    pending = null;
    drawMeasures();
    drawCorners();
  }

  function detach() {
    stopCine();
    image = null;
    item = null;
    canvas = null;
    bar.hidden = true;
    corners.hidden = true;
    layer.style.display = 'none';
    clear(layer);
    clear(rulers);
    crosshair.style.display = 'none';
    pending = null;
    stage.classList.remove('dicom-tool', 'dicom-draw', 'dicom-has-rulers', 'dicom-view');
  }

  /** The measurement layer follows the picture's transform (set by the viewer). */
  function layout(style) {
    layer.style.width = style.width;
    layer.style.height = style.height;
    layer.style.transform = style.transform;
    layer.style.marginLeft = style.marginLeft;
    layer.style.marginTop = style.marginTop;
    drawCorners();
    drawMeasures();
    requestAnimationFrame(drawRulers);
  }

  // ───────── toolbar

  const controls = {};
  function presetOptions() {
    const options = [];
    if (image.autoWindow) options.push(['auto', t('dicom.autoWindow'), { auto: true }]);
    (image.windowsFor?.(state.frame) ?? image.fileWindows ?? []).forEach((w, i) => options.push([`file:${i}`, `${w.label || t('dicom.fileWindow')} (C ${fmt(w.wc)} / W ${fmt(w.ww)})`, w]));
    for (const p of image.presets ?? []) options.push([`preset:${p.id}`, `${t(`dicom.preset.${p.id}`) === `dicom.preset.${p.id}` ? p.id : t(`dicom.preset.${p.id}`)} (C ${p.wc} / W ${p.ww})`, p]);
    return options;
  }

  function buildBar() {
    clear(bar);
    const presets = presetOptions();
    const presetSelect = selectEl([['', t('dicom.presets')], ...presets.map(([v, label]) => [v, label])], '', (v) => {
      const found = presets.find(([id]) => id === v)?.[2];
      if (found?.auto) { const w = image.autoWindow(); if (w) render({ wc: w.wc, ww: w.ww }); } else if (found) render({ wc: found.wc, ww: found.ww });
    });
    presetSelect.dataset.key = 'dicom-preset';
    controls.wc = h('input.input.dicom-num', { type: 'number', step: 1, title: t('dicom.center'), dataset: { key: 'dicom-wc', noStepper: '' } });
    controls.ww = h('input.input.dicom-num', { type: 'number', step: 1, min: 1, title: t('dicom.width'), dataset: { key: 'dicom-ww', noStepper: '' } });
    for (const input of [controls.wc, controls.ww]) input.addEventListener('change', () => render({ wc: Number(controls.wc.value), ww: Math.max(1, Number(controls.ww.value)) }));
    const toggle = (key, iconName, label, onClick) => h(`button.tool${state[key] ? '.on' : ''}`, { type: 'button', title: label, 'aria-label': label, dataset: { dicom: key }, html: icon(iconName), onclick: onClick });
    const colormap = selectEl((image.colormaps ?? ['gray']).map((id) => [id, t(`dicom.map.${id}`) === `dicom.map.${id}` ? id : t(`dicom.map.${id}`)]), state.colormap ?? 'gray', (v) => render({ colormap: v }));
    colormap.dataset.key = 'dicom-colormap';
    const voi = (image.voiLuts?.length ?? 0) > 0
      ? selectEl([['-1', t('dicom.voiLinear')], ...image.voiLuts.map((lut, i) => [String(i), lut.label || `LUT ${i + 1}`])], String(state.voiLut ?? -1), (v) => render({ voiLut: Number(v) }))
      : null;
    const voiFunction = selectEl([['LINEAR', 'LINEAR'], ['LINEAR_EXACT', 'LINEAR_EXACT'], ['SIGMOID', 'SIGMOID']], state.voiFunction ?? 'LINEAR', (v) => render({ voiFunction: v }));
    voiFunction.dataset.key = 'dicom-voi-function';
    voiFunction.title = t('dicom.voiFunction');
    const toolButton = (id, iconName, label) => h(`button.tool${tool === id ? '.on' : ''}`, { type: 'button', title: label, 'aria-label': label, dataset: { dicomTool: id }, html: icon(iconName), onclick: () => setTool(tool === id ? 'pan' : id) });
    const group = (...nodes) => h('div.dicom-group', nodes.filter(Boolean));
    bar.append(...[
      // Window / level and colour maps only mean something for greyscale pictures.
      image.isColor ? null : group(h('span.dicom-label', 'W/L'), presetSelect, h('span.dicom-label', 'C'), controls.wc, h('span.dicom-label', 'W'), controls.ww,
        h('button.tool', { type: 'button', title: t('dicom.resetWindow'), html: icon('refresh'), dataset: { dicom: 'reset' }, onclick: () => render({ resetWindow: true, wc: undefined, ww: undefined }) })),
      group(toggle('invert', 'invert', t('dicom.invert'), () => render({ invert: !state.invert })), image.isColor ? null : colormap, voi, image.isColor ? null : voiFunction,
        (image.overlays?.length ?? 0) > 0 ? toggle('overlays', 'layers', t('dicom.overlays'), () => render({ overlays: !state.overlays })) : null),
      frames() > 1 ? group(
        h('button.tool', { type: 'button', title: t('view.prevPage'), html: icon('prev'), onclick: () => setFrame(state.frame - 1) }),
        controls.frame = h('input.dicom-frame', { type: 'range', min: 0, max: frames() - 1, value: state.frame, dataset: { key: 'dicom-frame' }, oninput: (e) => setFrame(Number(e.target.value)), onwheel: (e) => { e.preventDefault(); setFrame(state.frame + (e.deltaY > 0 ? 1 : -1)); } }),
        controls.frameLabel = h('span.dicom-label.dicom-frame-count', { style: { '--digits': String(Math.max(2, String(frames()).length)) } },
          controls.frameNow = h('span.n'), h('span.sep', '/'), controls.frameTotal = h('span.n')),
        h('button.tool', { type: 'button', title: t('view.nextPage'), html: icon('next'), onclick: () => setFrame(state.frame + 1) }),
        controls.play = h('button.tool', { type: 'button', title: t('dicom.cine'), dataset: { dicom: 'cine' }, html: icon('play'), onclick: toggleCine }),
        h('button.tool', { type: 'button', title: t('dicom.cineStop'), dataset: { dicom: 'cine-stop' }, html: icon('stop'), onclick: stopAndRewind }),
        controls.fps = h('input.input.dicom-num', { type: 'number', min: 1, max: 120, value: fps, title: t('dicom.fps'), dataset: { key: 'dicom-fps', noStepper: '' }, onchange: (e) => { fps = Math.max(1, Math.min(120, Number(e.target.value) || 10)); fpsFromFile = false; if (playing) { stopCine(); startCine(); } } }),
        h('span.dicom-label', 'fps'),
        (() => { const s = selectEl([['loop', t('dicom.cineLoop')], ['bounce', t('dicom.cineBounce')], ['once', t('dicom.cineOnce')]], cineMode, (v) => { cineMode = v; cineDirection = 1; }); s.dataset.key = 'dicom-cine-mode'; s.title = t('dicom.cineMode'); return s; })()) : null,
      group(toolButton('wl', 'contrast', t('dicom.toolWindow')), toolButton('distance', 'straighten', t('dicom.toolDistance')), toolButton('angle', 'angle', t('dicom.toolAngle')), toolButton('cobb', 'cobb', t('dicom.toolCobb')), toolButton('rect', 'square', t('dicom.toolRect')), toolButton('ellipse', 'circle', t('dicom.toolEllipse')),
        controls.undo = h('button.tool', { type: 'button', title: `${t('undo.undo')} (Ctrl+Z)`, html: icon('undo'), dataset: { dicom: 'undo' }, onclick: undoMeasure }),
        controls.redo = h('button.tool', { type: 'button', title: `${t('undo.redo')} (Ctrl+Y)`, html: icon('redo'), dataset: { dicom: 'redo' }, onclick: redoMeasure }),
        h('button.tool', { type: 'button', title: `${t('dicom.deleteMeasure')} (Del)`, html: icon('trash'), dataset: { dicom: 'delete' }, onclick: deleteLastMeasure }),
        h('button.tool', { type: 'button', title: t('dicom.clearMeasures'), html: icon('close'), dataset: { dicom: 'clear' }, onclick: () => { commitMeasures(); measures = []; pending = null; drawMeasures(); } })),
      group(h(`button.tool${shown('rulers') ? '.on' : ''}`, { type: 'button', title: t('dicom.rulers'), 'aria-pressed': String(shown('rulers')), html: icon('ruler'), dataset: { dicom: 'rulers' }, onclick: () => { toggleShown('rulers'); buildBar(); drawRulers(); } }),
        h(`button.tool.with-label${shown('grid') ? '.on' : ''}`, { type: 'button', title: `${t('dicom.grid')} (D)`, 'aria-pressed': String(shown('grid')), dataset: { dicom: 'grid' }, onclick: () => { toggleShown('grid'); buildBar(); drawRulers(); } }, h('span', { html: icon('gridLines') }), h('span.tool-label', `${t('dicom.gridShort')} ${shown('grid') ? 'ON' : 'OFF'}`)),
        h(`button.tool${shown('scaleBar') ? '.on' : ''}`, { type: 'button', title: t('dicom.scaleBar'), 'aria-pressed': String(shown('scaleBar')), html: icon('scaleBar'), dataset: { dicom: 'scalebar' }, onclick: () => { toggleShown('scaleBar'); buildBar(); drawRulers(); } }),
        h(`button.tool.with-label${shown('crosshair') ? '.on' : ''}`, { type: 'button', title: `${t('dicom.crosshair')} (X)`, 'aria-pressed': String(shown('crosshair')), dataset: { dicom: 'crosshair' }, onclick: () => { toggleShown('crosshair'); if (!shown('crosshair')) crosshair.style.display = 'none'; buildBar(); } }, h('span', { html: icon('plus') }), h('span.tool-label', `${t('dicom.crosshairShort')} ${shown('crosshair') ? 'ON' : 'OFF'}`)),
        h('button.btn.small', { type: 'button', title: t('dicom.actualSizeHint'), dataset: { dicom: 'actual' }, disabled: !spacing(), onclick: actualSize }, '1:1'),
        h('button.tool', { type: 'button', title: `${t('view.zoomOut')} (-)`, html: icon('zoomOut'), dataset: { dicom: 'zoom-out' }, onclick: () => zoomStep?.(-1) }),
        controls.zoom = h('span.dicom-label.dicom-zoom', { title: t('view.zoomLevel'), dataset: { dicom: 'zoom' } }),
        h('button.tool', { type: 'button', title: `${t('view.zoomIn')} (+)`, html: icon('zoomIn'), dataset: { dicom: 'zoom-in' }, onclick: () => zoomStep?.(1) }),
        controls.scale = h('span.dicom-label.dicom-scale', { title: t('dicom.scaleRatio') })),
      group(h(`button.tool${shown('corners') ? '.on' : ''}`, { type: 'button', title: t('dicom.cornerInfo'), 'aria-pressed': String(shown('corners')), html: icon('info'), dataset: { dicom: 'corners' }, onclick: () => { toggleShown('corners'); corners.hidden = !shown('corners'); buildBar(); drawCorners(); } }),
        h('button.btn.small', { type: 'button', dataset: { dicom: 'tags' }, onclick: tagsDialog }, t('dicom.tags')),
        h('button.tool', { type: 'button', title: t('dicom.exportFrame'), html: icon('download'), dataset: { dicom: 'save' }, onclick: () => exportDialog() }),
        frames() > 1 ? h('button.tool', { type: 'button', title: t('dicom.saveCine'), html: icon('video'), dataset: { dicom: 'save-cine' }, onclick: () => saveCine() }) : null,
        frames() > 1 ? h('button.tool', { type: 'button', title: t('dicom.exportFrames'), html: icon('images'), dataset: { dicom: 'export-frames' }, onclick: () => exportDialog() }) : null)].filter(Boolean));
    syncBar();
  }

  function syncBar() {
    if (!controls.wc) return;
    if (document.activeElement !== controls.wc) controls.wc.value = fmt(state.wc);
    if (document.activeElement !== controls.ww) controls.ww.value = fmt(state.ww);
    if (controls.frame) {
      controls.frame.value = state.frame;
      controls.frameNow.textContent = String(state.frame + 1);
      controls.frameTotal.textContent = String(frames());
    }
    // Only when it changes: replacing the icon on every cine frame swallows the click on it.
    if (controls.play && controls.play.dataset.state !== (playing ? 'pause' : 'play')) {
      controls.play.dataset.state = playing ? 'pause' : 'play';
      controls.play.innerHTML = icon(controls.play.dataset.state);
      controls.play.classList.toggle('playing', playing);
    }
    if (controls.fps && document.activeElement !== controls.fps) controls.fps.value = String(Math.round(fps));
    if (controls.undo) { controls.undo.disabled = !undoStack.length; controls.redo.disabled = !redoStack.length; }
    onHistory?.();
    for (const button of bar.querySelectorAll('[data-dicom=invert]')) button.classList.toggle('on', Boolean(state.invert));
    syncZoom();
  }

  /** The zoom between − and + and the scale ratio, after every zoom change. */
  function syncZoom() {
    if (controls.zoom) controls.zoom.textContent = `${Math.round((scaleOf() || 1) * 100)}%`;
    if (controls.scale) controls.scale.textContent = scaleText();
  }

  const DRAW_TOOLS = new Set(['distance', 'angle', 'cobb', 'rect', 'ellipse']);

  function setTool(next) {
    tool = next;
    cancelPending();
    drawMeasures();
    stage.classList.toggle('dicom-tool', tool !== 'pan');
    // Length, angle and the other drawing tools use a plus pointer on the picture itself.
    stage.classList.toggle('dicom-draw', DRAW_TOOLS.has(tool));
    for (const button of bar.querySelectorAll('[data-dicom-tool]')) button.classList.toggle('on', button.dataset.dicomTool === tool);
  }

  // ───────── frames and cine

  function setFrame(n) {
    if (!image) return;
    const total = frames();
    render({ frame: ((n % total) + total) % total });
  }

  /** ms to show this frame: the file's Frame Time Vector while the rate is the file's, else 1000 / fps. */
  const frameDelay = (frame) => {
    const own = fpsFromFile ? image?.frameTimes?.[frame] : null;
    return Math.max(1000 / 120, Number.isFinite(own) && own > 0 ? own : 1000 / Math.max(1, fps));
  };

  /** Cine: loop, bounce (forward then back) or play once. The next frame is not started until this one is on screen. */
  function startCine() {
    stopCine();
    if (!image || frames() < 2 || !stage.isConnected) return;
    const gen = ++cineGen;
    playing = true;
    cineTimer = true;
    syncBar();
    const pause = (ms) => new Promise((resolve) => {
      const finish = () => { if (cineWait === finish) cineWait = null; resolve(); };
      cineWait = finish;
      cineTimer = setTimeout(finish, ms);
    });
    (async () => {
      while (cineGen === gen && image && stage.isConnected) {
        let next = state.frame + cineDirection;
        if (next >= frames() || next < 0) {
          if (cineMode === 'once') { stopCine(); return; }
          if (cineMode === 'bounce') { cineDirection = -cineDirection; next = state.frame + cineDirection; } else next = cineDirection > 0 ? 0 : frames() - 1;
        }
        const t0 = performance.now();
        cineTimer = true;
        try { await render({ frame: next }); } catch { /* keep the last frame and try the next */ }
        if (cineGen !== gen) return;
        const remain = frameDelay(next) - (performance.now() - t0);
        if (remain > 0) await pause(remain);
      }
      if (cineGen === gen) stopCine();
    })();
  }

  function stopCine() {
    playing = false;
    cineGen += 1;
    clearTimeout(cineTimer);
    cineTimer = null;
    const finish = cineWait;
    cineWait = null;
    finish?.();
    syncBar();
  }

  function toggleCine() { if (playing) stopCine(); else startCine(); }
  /** Stop: playback ends and the first frame is shown. */
  function stopAndRewind() { stopCine(); cineDirection = 1; setFrame(0); }

  // ───────── pointer tools (window drag, distance, ROI)

  /** Handles a press on the picture when a DICOM tool is active; true = handled. */
  function pointerDown(event) {
    if (!image) return false;
    // Ctrl+drag or the middle button: window / level with any tool.
    const windowDrag = event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey));
    // A click on a drawn measurement selects it (Del or the context menu deletes it); elsewhere drops the selection.
    if (!windowDrag && event.button === 0 && !pending) {
      const hit = measureAt(event.clientX, event.clientY);
      if (hit) {
        event.preventDefault();
        stage.focus({ preventScroll: true });
        selected = hit;
        drawMeasures();
        return true;
      }
      if (selected) { selected = null; drawMeasures(); }
    }
    if (!windowDrag && (tool === 'pan' || event.button !== 0)) return false;
    const start = imagePoint(event.clientX, event.clientY, true);
    if (!start) return false;
    const activeTool = windowDrag ? 'wl' : tool;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    // A measurement waiting for its next point: this press places it (click-click
    // works as well as dragging each line).
    if (pending && !windowDrag) {
      const m = pending;
      if (m.next === 2) {
        m.x2 = start.x; m.y2 = start.y;
        if (m.type === 'angle') { m.next = 3; m.px = start.x; m.py = start.y; } else if (m.type === 'cobb') { m.step = 1; m.next = null; } else finishPending();
        drawMeasures();
        return true;
      }
      if (m.type === 'angle') { m.x3 = start.x; m.y3 = start.y; delete m.px; delete m.py; finishPending(); drawMeasures(); return true; }
      if (m.type === 'cobb' && m.next === 4) { m.x4 = start.x; m.y4 = start.y; delete m.step; finishPending(); drawMeasures(); return true; }
      if (m.type === 'cobb' && m.step === 1) { m.step = 2; m.x3 = start.x; m.y3 = start.y; m.x4 = start.x; m.y4 = start.y; }
    }
    const from = { x: event.clientX, y: event.clientY, wc: state.wc, ww: state.ww };
    let measure = null;
    let continuing = false;
    if (!windowDrag) {
      if (pending?.type === 'cobb' && pending.step === 2) { measure = pending; continuing = true; }
      else if (tool === 'angle') measure = { type: 'angle', x1: start.x, y1: start.y, x2: start.x, y2: start.y, x3: null, y3: null };
      else if (tool === 'cobb') measure = { type: 'cobb', step: 0, x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      else if (tool === 'distance') measure = { type: 'distance', x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      else if (tool === 'rect' || tool === 'ellipse') measure = { type: tool, x: start.x, y: start.y, w: 0, h: 0, x0: start.x, y0: start.y };
    }
    if (measure && !continuing) { commitMeasures(); measure.frame = state.frame; measures.push(measure); }
    const move = (e) => {
      if (activeTool === 'wl') {
        // Sensitivity follows the range of values (a 12-bit CT needs bigger steps than an 8-bit picture).
        const k = Math.max(1, (from.ww || 256) / 256);
        render({ ww: Math.max(1, Math.round(from.ww + (e.clientX - from.x) * k)), wc: Math.round(from.wc + (e.clientY - from.y) * k) });
        return;
      }
      const p = imagePoint(e.clientX, e.clientY, true) ?? start;
      if (measure.type === 'cobb' && measure.step === 2) { measure.x4 = p.x; measure.y4 = p.y; } else if (measure.type === 'distance' || measure.type === 'angle' || measure.type === 'cobb') { measure.x2 = p.x; measure.y2 = p.y; } else {
        measure.x = Math.min(measure.x0, p.x); measure.y = Math.min(measure.y0, p.y);
        measure.w = Math.abs(p.x - measure.x0); measure.h = Math.abs(p.y - measure.y0);
      }
      drawMeasures();
    };
    const up = () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      const short = (m) => Math.hypot(m.x2 - m.x1, m.y2 - m.y1) < 2;
      const drop = () => { measures.pop(); undoStack.pop(); };
      if (measure?.type === 'angle') {
        // A click (no drag) leaves the vertex to the next click.
        measure.next = short(measure) ? 2 : 3;
        pending = measure;
        stage.addEventListener('pointermove', follow);
      } else if (measure?.type === 'cobb') {
        if (measure.step === 0) {
          if (short(measure)) measure.next = 2; else measure.step = 1;
          pending = measure;
          stage.addEventListener('pointermove', follow);
        } else if (measure.step === 2) {
          if (Math.hypot(measure.x4 - measure.x3, measure.y4 - measure.y3) < 2) measure.next = 4; else { delete measure.step; finishPending(); }
        }
      } else if (measure?.type === 'distance' && short(measure)) {
        measure.next = 2;
        pending = measure;
        stage.addEventListener('pointermove', follow);
      } else if (measure && measure.type !== 'distance' && (measure.w < 2 || measure.h < 2)) drop();
      syncBar();
      drawMeasures();
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    return true;
  }

  /** While a measurement waits for its next point, that point follows the pointer. */
  function follow(e) {
    if (!pending) { stage.removeEventListener('pointermove', follow); return; }
    const p = imagePoint(e.clientX, e.clientY, true);
    if (!p) return;
    const m = pending;
    if (m.next === 2) { m.x2 = p.x; m.y2 = p.y; } else if (m.next === 4) { m.x4 = p.x; m.y4 = p.y; } else if (m.type === 'angle') { m.px = p.x; m.py = p.y; } else return;
    drawMeasures();
  }

  /** The waiting measurement is complete. */
  function finishPending() {
    if (pending) delete pending.next;
    pending = null;
    stage.removeEventListener('pointermove', follow);
    syncBar();
  }

  /** Drops a measurement still waiting for points (Esc, another tool). */
  function cancelPending() {
    if (!pending) return;
    const at = measures.indexOf(pending);
    if (at >= 0) { measures.splice(at, 1); undoStack.pop(); }
    pending = null;
    stage.removeEventListener('pointermove', follow);
  }

  // ───────── measurement history and deleting

  const snapshot = () => JSON.parse(JSON.stringify(measures));
  /** Remembers the measurements before a change (`merge`: part of the change already remembered). */
  function commitMeasures(merge = false) {
    if (!merge) { undoStack.push(snapshot()); if (undoStack.length > 50) undoStack.shift(); }
    redoStack = [];
    syncBar();
  }
  function undoMeasure() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    measures = undoStack.pop();
    pending = null;
    drawMeasures();
    syncBar();
  }
  function redoMeasure() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    measures = redoStack.pop();
    pending = null;
    drawMeasures();
    syncBar();
  }
  /** Deletes the selected measurement, or the newest one when none is selected. */
  function deleteLastMeasure() {
    const at = selected ? measures.indexOf(selected) : -1;
    selected = null;
    if (at >= 0) { commitMeasures(); measures.splice(at, 1); pending = null; drawMeasures(); syncBar(); return true; }
    for (let i = measures.length - 1; i >= 0; i--) {
      if (onFrame(measures[i])) { commitMeasures(); measures.splice(i, 1); pending = null; drawMeasures(); syncBar(); return true; }
    }
    return false;
  }
  /** Measurements stay on every frame, so they are still there while a cine plays. */
  const onFrame = () => true;

  /** The drawn measurement under the pointer (the newest first), or null. Lines and outlines are hit within a few screen pixels. */
  function measureAt(clientX, clientY) {
    const p = imagePoint(clientX, clientY);
    if (!p) return null;
    const x = p.x + 0.5;
    const y = p.y + 0.5;
    const tol = Math.max(1.5, 6 / (scaleOf() || 1));
    const toSegment = (x1, y1, x2, y2) => {
      const dx = x2 - x1; const dy = y2 - y1;
      const len = dx * dx + dy * dy;
      const u = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
      return Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy));
    };
    const distanceTo = (m) => {
      if (m.type === 'distance') return toSegment(m.x1, m.y1, m.x2, m.y2);
      if (m.type === 'angle') return Math.min(toSegment(m.x1, m.y1, m.x2, m.y2), m.x3 == null ? Infinity : toSegment(m.x2, m.y2, m.x3, m.y3));
      if (m.type === 'cobb') return Math.min(toSegment(m.x1, m.y1, m.x2, m.y2), m.x3 == null ? Infinity : toSegment(m.x3, m.y3, m.x4, m.y4));
      if (m.type === 'rect') {
        const right = m.x + m.w; const bottom = m.y + m.h;
        return Math.min(toSegment(m.x, m.y, right, m.y), toSegment(right, m.y, right, bottom), toSegment(right, bottom, m.x, bottom), toSegment(m.x, bottom, m.x, m.y));
      }
      const rx = m.w / 2; const ry = m.h / 2;
      if (rx <= 0 || ry <= 0) return Infinity;
      return Math.abs(Math.hypot((x - m.x - rx) / rx, (y - m.y - ry) / ry) - 1) * Math.min(rx, ry);
    };
    for (let i = measures.length - 1; i >= 0; i--) {
      if (measures[i] !== pending && onFrame(measures[i]) && distanceTo(measures[i]) <= tol) return measures[i];
    }
    return null;
  }

  /** Right-click on a measurement: select it and offer to delete it; true = handled. */
  function measureMenu(event) {
    if (!image) return false;
    const hit = measureAt(event.clientX, event.clientY);
    if (!hit) return false;
    selected = hit;
    drawMeasures();
    contextMenu(event, [{ id: 'dicom-delete-measure', label: t('dicom.deleteMeasure'), icon: 'trash', shortcut: 'Del', danger: true, action: () => { if (measures.includes(hit)) { selected = hit; deleteLastMeasure(); } } }]);
    return true;
  }

  /** Angle in degrees at (bx, by) between the arms to a and c. */
  const angleAt = (ax, ay, bx, by, cx, cy) => {
    const sp = spacing() ?? [1, 1];
    const v1 = [(ax - bx) * sp[1], (ay - by) * sp[0]];
    const v2 = [(cx - bx) * sp[1], (cy - by) * sp[0]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  /** Angle between two lines (0…90°). */
  const lineAngle = (m) => {
    const sp = spacing() ?? [1, 1];
    const a = Math.atan2((m.y2 - m.y1) * sp[0], (m.x2 - m.x1) * sp[1]);
    const b = Math.atan2((m.y4 - m.y3) * sp[0], (m.x4 - m.x3) * sp[1]);
    let d = Math.abs(((a - b) * 180) / Math.PI) % 180;
    if (d > 90) d = 180 - d;
    return d;
  };

  // ───────── scale: rulers, ratio, actual size

  const SCREEN_MM_PER_PX = 25.4 / 96; // CSS pixel
  /** mm per screen pixel along x and y, or null without a pixel spacing. */
  const mmPerScreenPx = () => { const sp = spacing(); const k = scaleOf() || 1; return sp ? [sp[1] / k, sp[0] / k] : null; };
  function scaleText() {
    const sp = spacing();
    const zoomText = `${Math.round((scaleOf() || 1) * 100)}%`;
    if (!sp) return `${t('dicom.noSpacing')} · ${zoomText}`;
    const mm = mmPerScreenPx()[0];
    return `1 px = ${fmt(fromMm(sp[1]), 4)} ${unitLabel()} · ${t('dicom.onScreen')} 1:${fmt(mm / SCREEN_MM_PER_PX, 2)} · ${zoomText}`;
  }
  /** Shows the picture at its real physical size (1 mm on the screen = 1 mm). */
  function actualSize() {
    const sp = spacing();
    if (!sp) return;
    zoomTo?.(sp[1] / SCREEN_MM_PER_PX);
  }
  const NICE = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  const niceAtLeast = (value) => NICE.find((v) => v >= value) ?? NICE[NICE.length - 1];
  const niceAtMost = (value) => [...NICE].reverse().find((v) => v <= value) ?? NICE[0];
  // The scale bar's place (fractions of the window), remembered in Settings; double-click puts it back.
  const scaleBarPlace = () => app.settings.dicom?.scaleBarAt ?? null;
  const setScaleBarPlace = (at) => { app.settings.dicom = { ...(app.settings.dicom ?? {}), scaleBarAt: at }; app.saveSettings(); };

  /**
   * Rulers: bars along the window's top (X) and left (Y) edges, 0 at the
   * picture's top-left corner, in mm / cm / inch (px without a pixel spacing),
   * ticks along the whole bar (negative before the corner); they follow zoom and panning, the
   * picture's extent is lit and a marker follows the cursor. Plus a scale bar
   * of a round length that can be dragged anywhere.
   */
  function drawRulers() {
    clear(rulers);
    stage.classList.remove('dicom-has-rulers');
    if (!image || !canvas || (!shown('rulers') && !shown('scaleBar') && !shown('grid'))) return;
    const box = stage.getBoundingClientRect();
    const pic = canvas.getBoundingClientRect();
    if (!box.width || !pic.width) return;
    rulers.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    rulers.setAttribute('preserveAspectRatio', 'none');
    const sp = spacing();
    const unit = sp ? unitLabel() : 'px';
    const unitsPerImagePx = sp ? [fromMm(sp[1]), fromMm(sp[0])] : [1, 1];
    const screenPerImagePx = [pic.width / canvas.width, pic.height / canvas.height];
    // Ruler bars like an image editor's: fixed along the window's top and left
    // edges, ticks and numbers counted from the picture's top-left corner (0),
    // the picture's extent lit on the bar, a marker following the cursor.
    const BAND = 24;
    // The same scale as the ruler: 0 at the picture's top-left, one minor tick
    // apart. Zooming changes that step, and every grid line falls on a ruler mark.
    // A stronger line closes the ruler's major step (five minor steps, or four
    // when that keeps the mark a round number).
    const axisScale = (horizontal) => {
      const c = horizontal ? 0 : 1;
      const pxPerUnit = screenPerImagePx[c] / unitsPerImagePx[c];
      const total = (horizontal ? canvas.width : canvas.height) * unitsPerImagePx[c];
      const major = niceAtLeast(70 / pxPerUnit);
      const minor = major / (String(major).startsWith('2') ? 4 : 5);
      const origin = horizontal ? pic.left - box.left : pic.top - box.top;
      const length = horizontal ? box.width : box.height;
      return { pxPerUnit, total, major, minor, origin, length };
    };
    const majorTick = (scale, value) => Math.abs(value / scale.major - Math.round(value / scale.major)) < 1e-6;
    if (shown('grid')) {
      const xScale = axisScale(true);
      const yScale = axisScale(false);
      const x0 = shown('rulers') ? BAND : 0;
      const y0 = shown('rulers') ? BAND : 0;
      const g = svg('g', { class: 'dicom-grid' });
      const place = (scale, from, to) => {
        const first = Math.ceil(((from - scale.origin) / scale.pxPerUnit) / scale.minor - 1e-9);
        const last = Math.floor(((to - scale.origin) / scale.pxPerUnit) / scale.minor + 1e-9);
        const at = [];
        for (let k = first; k <= last; k++) {
          const value = k * scale.minor;
          const pos = scale.origin + value * scale.pxPerUnit;
          if (pos < from || pos > to) continue;
          at.push([pos, majorTick(scale, value)]);
        }
        return at;
      };
      for (const [x, major] of place(xScale, x0, box.width)) g.append(svg('line', { x1: x, y1: y0, x2: x, y2: box.height, class: major ? 'major' : 'minor' }));
      for (const [y, major] of place(yScale, y0, box.height)) g.append(svg('line', { x1: x0, y1: y, x2: box.width, y2: y, class: major ? 'major' : 'minor' }));
      g.dataset.cell = `${Math.round(xScale.minor * xScale.pxPerUnit)}x${Math.round(yScale.minor * yScale.pxPerUnit)}`;
      rulers.append(g);
    }
    const axis = (horizontal) => {
      const { pxPerUnit, total, major, minor, origin, length } = axisScale(horizontal);
      const g = svg('g', { class: `dicom-ruler ${horizontal ? 'horizontal' : 'vertical'}` });
      g.append(svg('rect', horizontal ? { x: BAND, y: 0, width: length - BAND, height: BAND, class: 'dicom-ruler-band' } : { x: 0, y: BAND, width: BAND, height: length - BAND, class: 'dicom-ruler-band' }));
      const span = [Math.max(BAND, origin), Math.min(length, origin + total * pxPerUnit)];
      if (span[1] > span[0]) g.append(svg('rect', horizontal ? { x: span[0], y: 0, width: span[1] - span[0], height: BAND, class: 'dicom-ruler-extent' } : { x: 0, y: span[0], width: BAND, height: span[1] - span[0], class: 'dicom-ruler-extent' }));
      let ticks = 0;
      // Ticks over the whole bar: negative before the picture's corner, past its size after it.
      const first = Math.ceil(((BAND - origin) / pxPerUnit) / minor - 1e-9);
      const last = Math.floor(((length - origin) / pxPerUnit) / minor + 1e-9);
      for (let k = first; k <= last; k++) {
        const value = k * minor;
        const at = origin + value * pxPerUnit;
        if (at > length) break;
        if (at < BAND) continue;
        const isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-6;
        const len = isMajor ? 12 : 6;
        g.append(svg('line', horizontal ? { x1: at, y1: BAND, x2: at, y2: BAND - len } : { x1: BAND, y1: at, x2: BAND - len, y2: at }));
        ticks++;
        if (isMajor) {
          const label = svg('text', horizontal ? { x: at + 3, y: 10 } : { x: 10, y: at - 3, transform: `rotate(-90 10 ${at - 3})` });
          label.textContent = `${fmt(value, 3)}${k === 0 ? ` ${unit}` : ''}`;
          g.append(label);
        }
      }
      // Where the cursor is (moved by the stage's pointer events).
      g.append(svg('line', { class: 'dicom-ruler-cursor', ...(horizontal ? { x1: -10, y1: 0, x2: -10, y2: BAND } : { x1: 0, y1: -10, x2: BAND, y2: -10 }) }));
      g.dataset.major = String(major);
      g.dataset.total = String(total);
      g.dataset.ticks = String(ticks);
      g.dataset.from = String(first * minor);
      g.dataset.to = String(last * minor);
      g.dataset.origin = String(origin);
      g.dataset.pxPerUnit = String(pxPerUnit);
      rulers.append(g);
    };
    stage.classList.toggle('dicom-has-rulers', shown('rulers'));
    if (shown('rulers')) {
      const corner = svg('g', { class: 'dicom-ruler-corner' });
      corner.append(svg('rect', { x: 0, y: 0, width: BAND, height: BAND }));
      const name = svg('text', { x: BAND / 2, y: BAND / 2 + 4, 'text-anchor': 'middle' });
      name.textContent = unit;
      corner.append(name);
      rulers.append(corner);
    }
    if (shown('rulers')) { axis(true); axis(false); }
    if (!shown('scaleBar')) return;
    // Scale bar: a round length about a fifth of the window, movable.
    const pxPerUnit = screenPerImagePx[0] / unitsPerImagePx[0];
    const length = niceAtMost((box.width * 0.2) / pxPerUnit);
    const width = length * pxPerUnit;
    const at = scaleBarPlace() ?? { x: (box.width - width) / 2 / box.width, y: 0.94 };
    const x = Math.min(Math.max(at.x * box.width, 8), box.width - width - 8);
    const y = Math.min(Math.max(at.y * box.height, 24), box.height - 8);
    const bar = svg('g', { class: 'dicom-scalebar', transform: `translate(${x} ${y})` });
    bar.append(svg('rect', { x: -6, y: -22, width: width + 12, height: 30, class: 'dicom-scalebar-hit' }));
    bar.append(svg('line', { x1: 0, y1: 0, x2: width, y2: 0 }), svg('line', { x1: 0, y1: -6, x2: 0, y2: 6 }), svg('line', { x1: width, y1: -6, x2: width, y2: 6 }), svg('line', { x1: width / 2, y1: -3, x2: width / 2, y2: 3 }));
    const label = svg('text', { x: width / 2, y: -9, 'text-anchor': 'middle' });
    label.textContent = `${fmt(length, 3)} ${unit}`;
    bar.append(label);
    bar.dataset.length = String(length);
    bar.dataset.pixels = String(width);
    bar.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const from = { x: event.clientX, y: event.clientY, at: { x: x / box.width, y: y / box.height } };
      bar.setPointerCapture?.(event.pointerId);
      let place = from.at;
      const move = (e) => {
        place = { x: from.at.x + (e.clientX - from.x) / box.width, y: from.at.y + (e.clientY - from.y) / box.height };
        app.settings.dicom = { ...(app.settings.dicom ?? {}), scaleBarAt: place };
        drawRulers();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setScaleBarPlace(place); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    bar.addEventListener('dblclick', (event) => { event.stopPropagation(); setScaleBarPlace(null); drawRulers(); });
    const tip = svg('title');
    tip.textContent = t('dicom.scaleBarHint');
    bar.append(tip);
    rulers.append(bar);
  }

  /** Text of a measurement (distance in mm when the pixel spacing is known). */
  function measureText(m) {
    const sp = spacing();
    if (m.type === 'angle') return (m.x3 == null && m.px == null) || m.next === 2 ? '' : `${fmt(angleAt(m.x1, m.y1, m.x2, m.y2, m.x3 ?? m.px, m.y3 ?? m.py), 1)}°`;
    if (m.type === 'cobb') return m.x3 == null ? '' : `Cobb ${fmt(lineAngle(m), 1)}°`;
    if (m.type === 'distance') {
      const dx = m.x2 - m.x1;
      const dy = m.y2 - m.y1;
      return sp ? `${fmt(fromMm(Math.hypot(dx * sp[1], dy * sp[0])), unitName() === 'mm' ? 2 : 3)} ${unitLabel()}` : `${fmt(Math.hypot(dx, dy))} px`;
    }
    const s = image.stats({ x: Math.round(m.x), y: Math.round(m.y), w: Math.max(1, Math.round(m.w)), h: Math.max(1, Math.round(m.h)), shape: m.type });
    if (!s) return '';
    m.stats = s;
    const units = image.units ? ` ${image.units}` : '';
    const area = s.areaMm2 ? (unitName() === 'inch' ? `${fmt(s.areaMm2 / 645.16, 3)} in²` : unitName() === 'mm' ? `${fmt(s.areaMm2, 1)} mm²` : `${fmt(s.areaMm2 / 100, 2)} cm²`) : `${s.areaPx ?? s.n} px`;
    return `${t('dicom.mean')} ${fmt(s.mean)}${units} ± ${fmt(s.std)} · ${t('dicom.min')} ${fmt(s.min)} · ${t('dicom.max')} ${fmt(s.max)} · ${area}`;
  }

  function drawMeasures() {
    if (selected && !measures.includes(selected)) selected = null; // undo / redo / clear / another file
    clear(layer);
    const k = 1 / (scaleOf() || 1);
    for (const [i, m] of measures.entries()) {
      if (!onFrame(m)) continue;
      const g = svg('g', { class: m === selected ? 'dicom-measure selected' : 'dicom-measure', 'data-index': i });
      const textAt = (x, y, text) => {
        const label = svg('text', { x, y, 'font-size': 13 * k, 'stroke-width': 3 * k });
        label.textContent = text;
        return label;
      };
      if (m.type === 'angle') {
        const cx = m.x3 ?? m.px ?? m.x2;
        const cy = m.y3 ?? m.py ?? m.y2;
        g.append(svg('polyline', { points: `${m.x1},${m.y1} ${m.x2},${m.y2} ${cx},${cy}`, fill: 'none', 'stroke-width': 1.5 * k }));
        for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2], [cx, cy]]) g.append(svg('circle', { cx: x, cy: y, r: 3 * k }));
        if ((cx !== m.x2 || cy !== m.y2) && (m.x1 !== m.x2 || m.y1 !== m.y2)) {
          const a1 = Math.atan2(m.y1 - m.y2, m.x1 - m.x2); const a2 = Math.atan2(cy - m.y2, cx - m.x2);
          const r = 18 * k;
          let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          g.append(svg('path', { d: `M ${m.x2 + r * Math.cos(a1)} ${m.y2 + r * Math.sin(a1)} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${m.x2 + r * Math.cos(a2)} ${m.y2 + r * Math.sin(a2)}`, fill: 'none', 'stroke-width': 1.2 * k }));
          g.append(textAt(m.x2 + 22 * k, m.y2 - 8 * k, measureText({ ...m, x3: cx, y3: cy })));
        }
      } else if (m.type === 'cobb') {
        g.append(svg('line', { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, 'stroke-width': 1.5 * k }));
        if (m.x3 != null) {
          g.append(svg('line', { x1: m.x3, y1: m.y3, x2: m.x4, y2: m.y4, 'stroke-width': 1.5 * k }));
          if (Math.hypot(m.x4 - m.x3, m.y4 - m.y3) >= 2) g.append(textAt((m.x3 + m.x4) / 2 + 8 * k, (m.y3 + m.y4) / 2 + 16 * k, measureText(m)));
        }
      } else if (m.type === 'distance') {
        g.append(svg('line', { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, 'stroke-width': 1.5 * k }));
        for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2]]) g.append(svg('circle', { cx: x, cy: y, r: 3 * k }));
        if (Math.hypot(m.x2 - m.x1, m.y2 - m.y1) >= 1) g.append(textAt(m.x2 + 6 * k, m.y2 - 6 * k, measureText(m)));
      } else {
        const shape = m.type === 'rect'
          ? svg('rect', { x: m.x, y: m.y, width: m.w, height: m.h, 'stroke-width': 1.5 * k })
          : svg('ellipse', { cx: m.x + m.w / 2, cy: m.y + m.h / 2, rx: m.w / 2, ry: m.h / 2, 'stroke-width': 1.5 * k });
        g.append(shape, textAt(m.x, m.y + m.h + 16 * k, m.w >= 2 && m.h >= 2 ? measureText(m) : ''));
      }
      layer.append(g);
    }
    drawRulers();
    syncZoom();
  }

  // ───────── corner information and orientation

  function drawCorners() {
    if (!image || corners.hidden) return;
    const meta = image.meta ?? {};
    const lines = (...values) => h('div', values.filter(Boolean).map((v) => h('div', v)));
    const markers = image.geometry?.markers;
    clear(corners);
    corners.append(
      h('div.dicom-corner.tl', lines(meta.patientName, meta.patientId, [meta.patientSex, meta.patientAge].filter(Boolean).join(' · '))),
      h('div.dicom-corner.tr', lines(meta.institution, [meta.studyDate, meta.studyTime].filter(Boolean).join(' '), meta.studyDescription, meta.seriesDescription, meta.seriesNumber ? `${t('dicom.series')} ${meta.seriesNumber}${meta.instanceNumber ? ` · ${t('dicom.image')} ${meta.instanceNumber}` : ''}` : '')),
      h('div.dicom-corner.bl', lines([meta.modality, meta.manufacturer].filter(Boolean).join(' · '), meta.imageSize, meta.sliceThickness ? `${t('dicom.thickness')} ${meta.sliceThickness}` : '', meta.sliceLocation ? `${t('dicom.location')} ${meta.sliceLocation}` : '')),
      h('div.dicom-corner.br', lines(`C ${fmt(state.wc)} / W ${fmt(state.ww)}`, frames() > 1 ? `${t('dicom.frame')} ${String(state.frame + 1).padStart(Math.max(2, String(frames()).length), '\u2007')} / ${frames()}` : '', scaleText())));
    if (markers) {
      for (const side of ['left', 'right', 'top', 'bottom']) if (markers[side]) corners.append(h(`div.dicom-marker.${side}`, markers[side]));
    }
  }

  // ───────── tags, probe, export

  async function tagsDialog() {
    const search = h('input.input', { type: 'search', placeholder: t('dicom.searchTags'), dataset: { key: 'dicom-tag-search' } });
    const body = h('tbody');
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      clear(body);
      for (const tag of image.tags) {
        const text = `${tag.tag} ${tag.name} ${tag.vr} ${tag.value}`.toLowerCase();
        if (q && !text.includes(q)) continue;
        body.append(h('tr', h('td.mono', tag.tag), h('td', { style: { paddingLeft: `${6 + (tag.depth ?? 0) * 14}px` } }, tag.name), h('td.mono', tag.vr), h('td', { title: String(tag.value ?? '') }, String(tag.value ?? '').slice(0, 200))));
      }
    };
    search.addEventListener('input', fill);
    fill();
    const actions = h('div.row-buttons',
      h('button.btn.small', { type: 'button', dataset: { dicom: 'copy-tags' }, onclick: copyTags }, h('span', { html: icon('copy') }), t('dicom.copyTags')),
      ...['json', 'csv', 'txt'].map((kind) => h('button.btn.small', { type: 'button', dataset: { dicom: `export-${kind}` }, onclick: () => exportTags(kind) }, h('span', { html: icon('download') }), kind.toUpperCase())));
    await openDialog({
      title: `${t('dicom.tags')} — ${item?.name ?? ''}`, width: 860, id: 'dicom-tags',
      body: h('div.dicom-tags', h('div.dicom-tags-top', search, actions), h('div.dicom-tags-scroll', h('table.prop-table.small', h('thead', h('tr', h('th', 'Tag'), h('th', t('dicom.tagName')), h('th', 'VR'), h('th', t('dicom.tagValue')))), body))),
    });
  }

  /** Value under the cursor for the status bar, e.g. "x 64, y 64  −1001 HU". */
  function probe(x, y) {
    if (!image) return null;
    const v = image.valueAt(x, y);
    if (!v) return null;
    if (v.r != null) return `${x}, ${y}  RGB(${v.r}, ${v.g}, ${v.b})`;
    return `${x}, ${y}  ${fmt(v.value, 2)}${v.units ? ` ${v.units}` : ''}${v.raw != null && v.raw !== v.value ? ` (${v.raw})` : ''}`;
  }

  /** The tags as text: JSON, CSV or tab-separated lines. */
  function tagsText(kind) {
    const rows = image.tags.map((tag) => ({ tag: tag.tag, name: tag.name, vr: tag.vr, value: String(tag.value ?? ''), depth: tag.depth ?? 0 }));
    if (kind === 'json') return JSON.stringify(rows, null, 1);
    if (kind === 'csv') return ['tag,name,vr,value', ...rows.map((r) => [r.tag, r.name, r.vr, r.value].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\r\n');
    return rows.map((r) => `${'  '.repeat(r.depth)}${r.tag}\t${r.name}\t${r.vr}\t${r.value}`).join('\n');
  }
  async function copyTags() {
    await navigator.clipboard.writeText(tagsText('txt')).catch(() => {});
    toast(t('dicom.tagsCopied'), 'success', 1500);
  }
  async function exportTags(kind) {
    if (!item) return null;
    const name = `${stemOf(item.name)}_tags.${kind}`;
    const target = joinPath(parentOf(item.path), name);
    await fs.write(target, new TextEncoder().encode(tagsText(kind)));
    toast(t('view.frameSaved', { name }), 'success');
    return target;
  }

  /** Every frame as a numbered PNG, into a folder next to the file. */
  async function exportFrames({ format = 'png', quality = 0.92 } = {}) {
    if (!image || !item) return null;
    const spec = OUTPUT_FORMATS.find((o) => o.id === format) ?? OUTPUT_FORMATS[1];
    stopCine();
    const folderName = `${stemOf(item.name)}_frames`;
    const folder = joinPath(parentOf(item.path), folderName);
    const progress = progressDialog(t('dicom.exportingFrames'));
    try {
      await Promise.resolve(fs.mkdir?.(parentOf(item.path), folderName)).catch(() => {}); // already there is fine
      const digits = String(frames()).length < 3 ? 3 : String(frames()).length;
      for (let f = 0; f < frames(); f++) {
        if (progress.cancelled) break;
        progress.update(f, frames(), `${t('dicom.frame')} ${f + 1} / ${frames()}`);
        const { canvas: frame } = await image.toCanvas({ ...state, frame: f });
        const bytes = await encodeCanvas(frame, spec.id, { quality });
        await fs.write(joinPath(folder, `${stemOf(item.name)}_${String(f + 1).padStart(digits, '0')}.${spec.ext}`), bytes);
      }
    } finally {
      progress.close();
    }
    toast(t('dicom.framesExported', { n: frames() }), 'success');
    return folder;
  }

  /** The shown frame (window, colour map and invert as on the screen) in any output format. */
  async function saveFrame({ format = 'png', quality = 0.92 } = {}) {
    if (!canvas || !item) return null;
    const spec = OUTPUT_FORMATS.find((o) => o.id === format) ?? OUTPUT_FORMATS[1];
    const bytes = await encodeCanvas(canvas, spec.id, { quality });
    const name = `${stemOf(item.name)}_frame${String(state.frame + 1).padStart(3, '0')}${spec.deep ? '_16bit' : ''}.${spec.ext}`;
    const target = joinPath(parentOf(item.path), name);
    await fs.write(target, bytes);
    toast(t('view.frameSaved', { name }), 'success');
    if (app.state.source.type === 'folder' && app.state.source.path === parentOf(item.path)) reload();
    return target;
  }

  /** Asks for the format (every output format the app writes), quality and which frames. */
  async function exportDialog() {
    if (!canvas || !item) return;
    stopCine();
    const saved = app.settings.dicom ?? {};
    let format = OUTPUT_FORMATS.some((o) => o.id === saved.exportFormat) ? saved.exportFormat : 'png';
    let quality = Number(saved.exportQuality) || 92;
    let which = 'current';
    const qualityRow = h('label.field', h('span', t('dicom.exportQuality')));
    const qualityValue = h('span.mono', `${quality}`);
    const range = h('input', { type: 'range', min: 10, max: 100, value: quality, dataset: { key: 'dicom-export-quality' }, oninput: (e) => { quality = Number(e.target.value); qualityValue.textContent = String(quality); } });
    qualityRow.append(h('div.row', range, qualityValue));
    const syncQuality = () => { qualityRow.hidden = !OUTPUT_FORMATS.find((o) => o.id === format)?.quality; };
    const select = selectEl(OUTPUT_FORMATS.map((o) => [o.id, `${o.label} (.${o.ext})`]), format, (v) => { format = v; syncQuality(); });
    select.dataset.key = 'dicom-export-format';
    syncQuality();
    const frameChoice = frames() > 1
      ? h('div.field', h('span', t('dicom.exportWhich')), h('div.row',
        ...[['current', t('dicom.exportCurrent', { n: state.frame + 1 })], ['all', t('dicom.exportAll', { n: frames() })]].map(([value, label]) => h('label.check', h('input', { type: 'radio', name: 'dicom-export-which', value, checked: value === which, dataset: { key: `dicom-export-${value}` }, onchange: () => { which = value; } }), label))))
      : null;
    const ok = await openDialog({
      title: `${t('dicom.exportFrame')} — ${item.name}`, id: 'dicom-export', width: 420,
      body: h('div.form', h('label.field', h('span', t('dicom.exportFormat')), select), qualityRow, frameChoice, h('p.muted.small', t('dicom.exportHint'))),
      buttons: [{ label: t('common.cancel'), value: false }, { label: t('dicom.exportSave'), value: true, primary: true }],
    });
    if (!ok) return;
    app.settings.dicom = { ...(app.settings.dicom ?? {}), exportFormat: format, exportQuality: quality };
    app.saveSettings();
    if (which === 'all') await exportFrames({ format, quality: quality / 100 });
    else await saveFrame({ format, quality: quality / 100 });
  }

  /** Every frame, in order, as a WebM video at the cine frame rate. */
  async function saveCine({ fps: rate = fps } = {}) {
    if (!image || !item || frames() < 2 || typeof MediaRecorder === 'undefined') return null;
    stopCine();
    const progress = progressDialog(t('dicom.savingCine'));
    try {
      const first = await image.toCanvas({ ...state, frame: 0 });
      const out = document.createElement('canvas');
      out.width = first.canvas.width; out.height = first.canvas.height;
      const g = out.getContext('2d');
      const stream = out.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      await warmVideoEncoder(type, out.width, out.height);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      for (let f = 0; f < frames(); f++) {
        if (progress.cancelled) break;
        progress.update(f, frames(), `${t('dicom.frame')} ${f + 1} / ${frames()}`);
        const { canvas: frame } = await image.toCanvas({ ...state, frame: f });
        g.drawImage(frame, 0, 0, out.width, out.height);
        track.requestFrame?.();
        await new Promise((r) => setTimeout(r, 1000 / Math.max(1, rate)));
      }
      recorder.stop();
      await stopped;
      if (progress.cancelled) return null;
      const name = `${stemOf(item.name)}_cine.webm`;
      const target = joinPath(parentOf(item.path), name);
      await fs.write(target, new Uint8Array(await new Blob(chunks, { type }).arrayBuffer()));
      toast(t('view.frameSaved', { name }), 'success');
      if (app.state.source.type === 'folder' && app.state.source.path === parentOf(item.path)) reload();
      return target;
    } finally {
      progress.close();
    }
  }

  /** Arrow keys and the wheel step through frames of a multi-frame image. */
  /**
   * DICOM keys (before the viewer's): ↑/↓ Home/End frames, Space cine, Ctrl+Z/Y
   * measurement undo/redo, Del delete one, Esc leave the tool; I invert, W reset
   * window, M next colour map, V overlays, G rulers, B scale bar, O information, X crosshair;
   * tools R distance, A angle, C Cobb, T rectangle, E ellipse, L window drag.
   */
  function onKey(event) {
    if (!image) return false;
    const ctrl = event.ctrlKey || event.metaKey;
    const k = event.key;
    if (ctrl && k.toLowerCase() === 'z') { undoMeasure(); return true; }
    if (ctrl && k.toLowerCase() === 'y') { redoMeasure(); return true; }
    if (ctrl || event.altKey) return false;
    if (k === 'Delete' && measures.some(onFrame)) return deleteLastMeasure();
    if (k === 'Escape' && selected) { selected = null; drawMeasures(); return true; }
    if (k === 'Escape' && (tool !== 'pan' || pending)) { setTool('pan'); return true; }
    if (frames() > 1) {
      if (k === 'ArrowUp') { setFrame(state.frame - 1); return true; }
      if (k === 'ArrowDown') { setFrame(state.frame + 1); return true; }
      if (k === 'Home') { setFrame(0); return true; }
      if (k === 'End') { setFrame(frames() - 1); return true; }
      if (k === ' ') { toggleCine(); return true; }
    }
    const lower = k.toLowerCase();
    const tools = { r: 'distance', a: 'angle', c: 'cobb', t: 'rect', e: 'ellipse', l: 'wl' };
    if (tools[lower]) { setTool(tool === tools[lower] ? 'pan' : tools[lower]); return true; }
    if (lower === 'i') { render({ invert: !state.invert }); return true; }
    if (lower === 'w') { render({ resetWindow: true, wc: undefined, ww: undefined }); return true; }
    if (lower === 'm') { const maps = image.colormaps ?? ['gray']; render({ colormap: maps[(maps.indexOf(state.colormap ?? 'gray') + 1) % maps.length] }); buildBar(); return true; }
    if (lower === 'v' && image.overlays?.length) { render({ overlays: !state.overlays }); return true; }
    const overlayKeys = { g: 'rulers', b: 'scaleBar', o: 'corners', d: 'grid', x: 'crosshair' };
    if (overlayKeys[lower]) { toggleShown(overlayKeys[lower]); if (!shown('crosshair')) crosshair.style.display = 'none'; corners.hidden = !shown('corners'); buildBar(); drawCorners(); drawMeasures(); return true; }
    return false;
  }

  /** Settings changed (e.g. the length unit): redraw the labels. */
  function refresh() {
    if (!image) return;
    buildBar();
    drawMeasures();
    drawCorners();
  }

  return {
    bar, attach, detach, layout, pointerDown, measureMenu, probe, onKey, render, refresh,
    get active() { return Boolean(image); },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    undo() { undoMeasure(); },
    redo() { redoMeasure(); },
    /** Test hooks. */
    debug: () => (image ? { grid: rulers.querySelector('.dicom-grid')?.dataset.cell ?? null, state: { ...state }, frames: frames(), tool, selected: measures.indexOf(selected), measures: measures.map((m) => ({ type: m.type, text: measureText(m), frame: m.frame ?? null, y: m.y1 ?? m.y })), undo: undoStack.length, redo: redoStack.length, cineMode, direction: cineDirection, pending: pending?.type ?? null, pendingNext: pending?.next ?? null, cine: playing, fps, corners: corners.textContent, units: image.units, spacing: spacing(), scale: scaleText(), rulers: [...rulers.querySelectorAll('.dicom-ruler')].map((r) => ({ axis: r.classList.contains('horizontal') ? 'x' : 'y', major: Number(r.dataset.major), total: Number(r.dataset.total), ticks: Number(r.dataset.ticks), origin: Number(r.dataset.origin), pxPerUnit: Number(r.dataset.pxPerUnit), from: Number(r.dataset.from), to: Number(r.dataset.to) })), scaleBar: (() => { const b = rulers.querySelector('.dicom-scalebar'); if (!b) return null; const r = b.getBoundingClientRect(); return { length: Number(b.dataset.length), pixels: Number(b.dataset.pixels), x: r.left, y: r.top }; })() } : null),
    testing: { setTool, setFrame, startCine, stopCine, tagsDialog, saveFrame, saveCine, actualSize, exportFrames, exportDialog, exportTags, tagsText, undoMeasure, redoMeasure, deleteLastMeasure, frameDelay: (f) => frameDelay(f), setCineMode: (m) => { cineMode = m; cineDirection = 1; } },
  };
}
