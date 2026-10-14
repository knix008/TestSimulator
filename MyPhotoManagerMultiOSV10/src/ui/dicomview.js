// DICOM in the viewer: the toolbar and overlays a medical image needs.
//   window / level  presets (from the file and for the modality), centre and width,
//                   drag tool (left-right = width, up-down = centre), reset
//   display         invert, colour map, VOI LUT and its function, overlay planes
//   frames          slider, step, cine play with frames per second
//   measure         distance (mm from the pixel spacing), rectangle / ellipse ROI
//                   statistics (mean, SD, min, max, area)
//   information     four-corner text (patient, study, series, window, frame,
//                   zoom), orientation markers, every tag in a searchable list,
//                   the value under the cursor in real units (e.g. HU)
//   export          the shown frame as PNG / JPEG
// The decoder (formats/dicomDecoder.js) does the pixel work; this draws and controls.
import { joinPath, parentOf } from '../catalog/catalog.js';
import { stemOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, reload } from '../store.js';
import { openDialog, selectEl, toast } from './dialog.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (name, attrs = {}) => { const el = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
const fmt = (v, digits = 1) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? Math.round(v) : Number(v.toFixed(digits))) : '–');

export function createDicomTools({ stage, imagePoint, scaleOf, onRendered }) {
  const bar = h('div.dicom-bar', { hidden: true });
  const layer = svg('svg', { class: 'dicom-layer' });
  const corners = h('div.dicom-corners', { hidden: true });
  stage.append(layer, corners);

  let image = null;
  let item = null;
  let canvas = null;
  let state = {};
  let tool = 'pan';
  let measures = [];
  let cineTimer = null;
  let fps = 10;
  let showCorners = true;
  let rendering = null;

  const frames = () => image?.frames ?? 1;
  const spacing = () => image?.geometry?.pixelSpacing ?? null;

  // ───────── rendering

  async function render(change = {}) {
    if (!image) return;
    state = { ...state, ...change };
    const token = {};
    rendering = token;
    const { canvas: out, state: shown } = await image.toCanvas({ ...state });
    if (rendering !== token || !canvas) return;
    canvas.getContext('2d').drawImage(out, 0, 0, canvas.width, canvas.height);
    state = { ...state, ...shown };
    delete state.resetWindow;
    syncBar();
    drawCorners();
    onRendered?.();
  }

  // ───────── attach / detach

  async function attach(current) {
    detach();
    image = current.dicom;
    item = current.item;
    canvas = current.el;
    state = { frame: 0, ...image.state };
    fps = Math.round(image.frameRate || 10);
    measures = [];
    tool = 'pan';
    layer.setAttribute('viewBox', `0 0 ${current.width} ${current.height}`);
    layer.style.display = '';
    corners.hidden = !showCorners;
    buildBar();
    bar.hidden = false;
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
    stage.classList.remove('dicom-tool');
  }

  /** The measurement layer follows the picture's transform (set by the viewer). */
  function layout(style) {
    layer.style.width = style.width;
    layer.style.height = style.height;
    layer.style.transform = style.transform;
    drawCorners();
  }

  // ───────── toolbar

  const controls = {};
  function presetOptions() {
    const options = [];
    (image.windowsFor?.(state.frame) ?? image.fileWindows ?? []).forEach((w, i) => options.push([`file:${i}`, `${w.label || t('dicom.fileWindow')} (C ${fmt(w.wc)} / W ${fmt(w.ww)})`, w]));
    for (const p of image.presets ?? []) options.push([`preset:${p.id}`, `${t(`dicom.preset.${p.id}`) === `dicom.preset.${p.id}` ? p.id : t(`dicom.preset.${p.id}`)} (C ${p.wc} / W ${p.ww})`, p]);
    return options;
  }

  function buildBar() {
    clear(bar);
    const presets = presetOptions();
    const presetSelect = selectEl([['', t('dicom.presets')], ...presets.map(([v, label]) => [v, label])], '', (v) => {
      const found = presets.find(([id]) => id === v)?.[2];
      if (found) render({ wc: found.wc, ww: found.ww });
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
    bar.append(
      group(h('span.dicom-label', 'W/L'), presetSelect, h('span.dicom-label', 'C'), controls.wc, h('span.dicom-label', 'W'), controls.ww,
        h('button.tool', { type: 'button', title: t('dicom.resetWindow'), html: icon('refresh'), dataset: { dicom: 'reset' }, onclick: () => render({ resetWindow: true, wc: undefined, ww: undefined }) })),
      group(toggle('invert', 'invert', t('dicom.invert'), () => render({ invert: !state.invert })), colormap, voi, voiFunction,
        (image.overlays?.length ?? 0) > 0 ? toggle('overlays', 'layers', t('dicom.overlays'), () => render({ overlays: !state.overlays })) : null),
      frames() > 1 ? group(
        h('button.tool', { type: 'button', title: t('view.prevPage'), html: icon('prev'), onclick: () => setFrame(state.frame - 1) }),
        controls.frame = h('input.dicom-frame', { type: 'range', min: 0, max: frames() - 1, value: state.frame, dataset: { key: 'dicom-frame' }, oninput: (e) => setFrame(Number(e.target.value)) }),
        controls.frameLabel = h('span.dicom-label', ''),
        h('button.tool', { type: 'button', title: t('view.nextPage'), html: icon('next'), onclick: () => setFrame(state.frame + 1) }),
        controls.play = h('button.tool', { type: 'button', title: t('dicom.cine'), dataset: { dicom: 'cine' }, html: icon('play'), onclick: toggleCine }),
        controls.fps = h('input.input.dicom-num', { type: 'number', min: 1, max: 60, value: fps, title: t('dicom.fps'), dataset: { key: 'dicom-fps', noStepper: '' }, onchange: (e) => { fps = Math.max(1, Math.min(60, Number(e.target.value) || 10)); if (cineTimer) { stopCine(); startCine(); } } }),
        h('span.dicom-label', 'fps')) : null,
      group(toolButton('wl', 'contrast', t('dicom.toolWindow')), toolButton('distance', 'straighten', t('dicom.toolDistance')), toolButton('rect', 'square', t('dicom.toolRect')), toolButton('ellipse', 'circle', t('dicom.toolEllipse')),
        h('button.tool', { type: 'button', title: t('dicom.clearMeasures'), html: icon('close'), dataset: { dicom: 'clear' }, onclick: () => { measures = []; drawMeasures(); } })),
      group(h(`button.tool${showCorners ? '.on' : ''}`, { type: 'button', title: t('dicom.cornerInfo'), html: icon('info'), dataset: { dicom: 'corners' }, onclick: () => { showCorners = !showCorners; corners.hidden = !showCorners; buildBar(); } }),
        h('button.btn.small', { type: 'button', dataset: { dicom: 'tags' }, onclick: tagsDialog }, t('dicom.tags')),
        h('button.tool', { type: 'button', title: t('dicom.saveFrame'), html: icon('download'), dataset: { dicom: 'save' }, onclick: saveFrame })));
    syncBar();
  }

  function syncBar() {
    if (!controls.wc) return;
    if (document.activeElement !== controls.wc) controls.wc.value = fmt(state.wc);
    if (document.activeElement !== controls.ww) controls.ww.value = fmt(state.ww);
    if (controls.frame) { controls.frame.value = state.frame; controls.frameLabel.textContent = `${state.frame + 1} / ${frames()}`; }
    if (controls.play) controls.play.innerHTML = icon(cineTimer ? 'pause' : 'play');
    for (const button of bar.querySelectorAll('[data-dicom=invert]')) button.classList.toggle('on', Boolean(state.invert));
  }

  function setTool(next) {
    tool = next;
    stage.classList.toggle('dicom-tool', tool !== 'pan');
    for (const button of bar.querySelectorAll('[data-dicom-tool]')) button.classList.toggle('on', button.dataset.dicomTool === tool);
  }

  // ───────── frames and cine

  function setFrame(n) {
    if (!image) return;
    const total = frames();
    render({ frame: ((n % total) + total) % total });
  }

  function startCine() {
    cineTimer = setInterval(() => { if (!stage.isConnected) { stopCine(); return; } setFrame(state.frame + 1); }, 1000 / fps);
    syncBar();
  }

  function stopCine() {
    clearInterval(cineTimer);
    cineTimer = null;
    syncBar();
  }

  function toggleCine() { if (cineTimer) stopCine(); else startCine(); }

  // ───────── pointer tools (window drag, distance, ROI)

  /** Handles a press on the picture when a DICOM tool is active; true = handled. */
  function pointerDown(event) {
    if (!image || tool === 'pan' || event.button !== 0) return false;
    const start = imagePoint(event.clientX, event.clientY, true);
    if (!start) return false;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    const from = { x: event.clientX, y: event.clientY, wc: state.wc, ww: state.ww };
    let measure = null;
    if (tool === 'distance') measure = { type: 'distance', x1: start.x, y1: start.y, x2: start.x, y2: start.y };
    if (tool === 'rect' || tool === 'ellipse') measure = { type: tool, x: start.x, y: start.y, w: 0, h: 0, x0: start.x, y0: start.y };
    if (measure) measures.push(measure);
    const move = (e) => {
      if (tool === 'wl') {
        // Sensitivity follows the range of values (a 12-bit CT needs bigger steps than an 8-bit picture).
        const k = Math.max(1, (from.ww || 256) / 256);
        render({ ww: Math.max(1, Math.round(from.ww + (e.clientX - from.x) * k)), wc: Math.round(from.wc + (e.clientY - from.y) * k) });
        return;
      }
      const p = imagePoint(e.clientX, e.clientY, true) ?? start;
      if (measure.type === 'distance') { measure.x2 = p.x; measure.y2 = p.y; } else {
        measure.x = Math.min(measure.x0, p.x); measure.y = Math.min(measure.y0, p.y);
        measure.w = Math.abs(p.x - measure.x0); measure.h = Math.abs(p.y - measure.y0);
      }
      drawMeasures();
    };
    const up = () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      if (measure && (measure.type === 'distance' ? Math.hypot(measure.x2 - measure.x1, measure.y2 - measure.y1) < 2 : measure.w < 2 || measure.h < 2)) measures.pop();
      drawMeasures();
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    return true;
  }

  /** Text of a measurement (distance in mm when the pixel spacing is known). */
  function measureText(m) {
    const sp = spacing();
    if (m.type === 'distance') {
      const dx = m.x2 - m.x1;
      const dy = m.y2 - m.y1;
      return sp ? `${fmt(Math.hypot(dx * sp[1], dy * sp[0]), 2)} mm` : `${fmt(Math.hypot(dx, dy))} px`;
    }
    const s = image.stats({ x: Math.round(m.x), y: Math.round(m.y), w: Math.max(1, Math.round(m.w)), h: Math.max(1, Math.round(m.h)), shape: m.type });
    if (!s) return '';
    m.stats = s;
    const units = image.units ? ` ${image.units}` : '';
    const area = s.areaMm2 ? `${fmt(s.areaMm2 / 100, 2)} cm²` : `${s.areaPx ?? s.n} px`;
    return `${t('dicom.mean')} ${fmt(s.mean)}${units} ± ${fmt(s.std)} · ${t('dicom.min')} ${fmt(s.min)} · ${t('dicom.max')} ${fmt(s.max)} · ${area}`;
  }

  function drawMeasures() {
    clear(layer);
    const k = 1 / (scaleOf() || 1);
    for (const [i, m] of measures.entries()) {
      const g = svg('g', { class: 'dicom-measure', 'data-index': i });
      const textAt = (x, y, text) => {
        const label = svg('text', { x, y, 'font-size': 13 * k, 'stroke-width': 3 * k });
        label.textContent = text;
        return label;
      };
      if (m.type === 'distance') {
        g.append(svg('line', { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, 'stroke-width': 1.5 * k }));
        for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2]]) g.append(svg('circle', { cx: x, cy: y, r: 3 * k }));
        g.append(textAt(m.x2 + 6 * k, m.y2 - 6 * k, measureText(m)));
      } else {
        const shape = m.type === 'rect'
          ? svg('rect', { x: m.x, y: m.y, width: m.w, height: m.h, 'stroke-width': 1.5 * k })
          : svg('ellipse', { cx: m.x + m.w / 2, cy: m.y + m.h / 2, rx: m.w / 2, ry: m.h / 2, 'stroke-width': 1.5 * k });
        g.append(shape, textAt(m.x, m.y + m.h + 16 * k, m.w >= 2 && m.h >= 2 ? measureText(m) : ''));
      }
      layer.append(g);
    }
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
      h('div.dicom-corner.br', lines(`C ${fmt(state.wc)} / W ${fmt(state.ww)}`, frames() > 1 ? `${t('dicom.frame')} ${state.frame + 1} / ${frames()}` : '', `${Math.round((scaleOf() || 1) * 100)}%`)));
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
    await openDialog({
      title: `${t('dicom.tags')} — ${item?.name ?? ''}`, width: 860, id: 'dicom-tags',
      body: h('div.dicom-tags', search, h('div.dicom-tags-scroll', h('table.prop-table.small', h('thead', h('tr', h('th', 'Tag'), h('th', t('dicom.tagName')), h('th', 'VR'), h('th', t('dicom.tagValue')))), body))),
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

  async function saveFrame() {
    if (!canvas || !item) return;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const name = `${stemOf(item.name)}_frame${String(state.frame + 1).padStart(3, '0')}.png`;
    const target = joinPath(parentOf(item.path), name);
    await fs.write(target, new Uint8Array(await blob.arrayBuffer()));
    toast(t('view.frameSaved', { name }), 'success');
    if (app.state.source.type === 'folder' && app.state.source.path === parentOf(item.path)) reload();
  }

  /** Arrow keys and the wheel step through frames of a multi-frame image. */
  function onKey(event) {
    if (!image || frames() < 2) return false;
    if (event.key === 'ArrowUp') { setFrame(state.frame - 1); return true; }
    if (event.key === 'ArrowDown') { setFrame(state.frame + 1); return true; }
    return false;
  }

  return {
    bar, attach, detach, layout, pointerDown, probe, onKey, render,
    get active() { return Boolean(image); },
    /** Test hooks. */
    debug: () => (image ? { state: { ...state }, frames: frames(), tool, measures: measures.map((m) => ({ type: m.type, text: measureText(m) })), cine: Boolean(cineTimer), fps, corners: corners.textContent, units: image.units } : null),
    testing: { setTool, setFrame, startCine, stopCine, tagsDialog, saveFrame },
  };
}
