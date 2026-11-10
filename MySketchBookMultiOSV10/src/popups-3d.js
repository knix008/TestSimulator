// The 3D app's own popups (run inside popup.js, which supplies the frame and
// controls through `api`): Settings › 3D view, model import options, picture
// size, photo-real render options and result, and a new material.
// Each popup keeps its edits in state.draft and answers with close({ ok: true, … }).

import { formatInfo, imageFormats } from './io/imageformats.js';

const RESOLUTIONS = [['hd', 1280, 720], ['fhd', 1920, 1080], ['qhd', 2560, 1440], ['uhd', 3840, 2160], ['square', 2048, 2048], ['a4', 3508, 2480]];
const SAMPLES = [64, 128, 256, 512, 1024, 2048];

/** Settings › 3D view: units, drawing defaults, display quality and navigation. */
export function renderView3dSettings(api) {
  const { row, toggle, segmented, numberField, t, s } = api;
  const set = s();
  return [
    `<h3 class="section-title">${api.icon('units')}${api.escapeHtml(t('settings.sectionModel'))}</h3>`,
    row('units', t('settings.units'), segmented('units', api.UNITS.map((u) => [u, t(`unit.${u}`)]), set.units)),
    row('wallTool', t('settings.wallHeight'), numberField('defaultWallHeight', set.defaultWallHeight, 1.8, 6, 0.05, 'm', t('settings.wallHeight'))),
    row('wallTool', t('settings.wallThickness'), numberField('defaultWallThickness', set.defaultWallThickness, 0.05, 0.6, 0.01, 'm', t('settings.wallThickness'))),
    toggle('inference', t('settings.inference'), 'lineTool'),
    toggle('snapToGrid', t('action.snapGrid'), 'grid'),
    row('grid', t('settings.gridSize'), numberField('gridSize', set.gridSize, 0.05, 2, 0.05, 'm', t('settings.gridSize'))),
    `<h3 class="section-title">${api.icon('quality')}${api.escapeHtml(t('settings.sectionQuality'))}</h3>`,
    row('quality', t('settings.renderQuality'), segmented('renderQuality', [['fast', t('quality.fast'), 'fps'], ['balanced', t('quality.balanced'), 'quality'], ['high', t('quality.high'), 'renderPhoto']], set.renderQuality)),
    toggle('antialias', t('settings.antialias'), 'edgesToggle'),
    toggle('ambientOcclusion', t('settings.ambientOcclusion'), 'styleShaded'),
    toggle('shadows', t('shadows.show'), 'shadowToggle'),
    row('shadowToggle', t('settings.shadowQuality'), segmented('shadowQuality', [['low', t('quality.low')], ['medium', t('quality.medium')], ['high', t('quality.high')]], set.shadowQuality)),
    row('fps', t('settings.maxFps'), segmented('maxFps', [[30, '30'], [60, '60'], [120, '120'], [0, t('settings.unlimited')]], set.maxFps)),
    row('zoomIn', t('settings.pixelRatio'), segmented('pixelRatio', [[0, t('settings.auto')], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%']], set.pixelRatio)),
    toggle('showFps', t('action.fps'), 'fps'),
    `<h3 class="section-title">${api.icon('orbitTool')}${api.escapeHtml(t('settings.sectionNavigation'))}</h3>`,
    row('select', t('settings.leftDrag'), segmented('leftDrag', [['orbit', t('settings.leftDragOrbit'), 'orbitTool'], ['select', t('settings.leftDragSelect'), 'select']], set.leftDrag)),
    row('info', '', `<span class="muted">${api.escapeHtml(t('settings.mouseHelp'))}</span>`),
    row('perspective', t('settings.fieldOfView'), numberField('fieldOfView', set.fieldOfView, 20, 100, 5, '°', t('settings.fieldOfView'))),
    row('orbitTool', t('settings.orbitSpeed'), numberField('orbitSpeed', set.orbitSpeed, 20, 300, 10, '%', t('settings.orbitSpeed'))),
    row('zoomTool', t('settings.zoomSpeed'), numberField('zoomSpeed', set.zoomSpeed, 20, 300, 10, '%', t('settings.zoomSpeed'))),
    toggle('invertZoom', t('settings.invertZoom'), 'zoomTool'),
    toggle('showGrid', t('action.grid'), 'grid'),
    toggle('showAxes', t('action.axes'), 'axesTool'),
  ].join('');
}

/** Draws one of the 3D popups; returns true when `kind` is one of them. */
export function render3dPopup(kind, api) {
  const fn = { importmodel: importModel, importplan: importPlan, snapshot, render: renderOptions, renderresult: renderResult, material }[kind];
  if (!fn) return false;
  fn(api);
  return true;
}

/** Picture format choice + quality (lossy formats) + transparency (formats with alpha, when offered). */
const formatRows = (api, d, { transparency = true } = {}) => {
  const f = formatInfo(d.format);
  const q = Math.round(Number(d.quality ?? 0.92) * 100);
  return api.row('picture', api.t('snapshot.format'), `<span class="segmented wrap">${imageFormats().map((x) => `<button class="segment ${x.id === f.id ? 'active' : ''}" role="radio" aria-checked="${x.id === f.id}" data-draft-segment="format" data-value="${x.id}" title="${api.escapeHtml(api.t(`imageFormat.${x.id}`))}">${api.escapeHtml(x.label)}</button>`).join('')}</span>`, api.t('snapshot.format'), 'full')
    + (f.quality || f.id === 'pdf' ? api.row('quality', api.t('snapshot.quality'), `<input type="range" min="0.4" max="1" step="0.01" data-draft="quality" value="${Number(d.quality ?? 0.92)}" aria-label="${api.escapeHtml(api.t('snapshot.quality'))}" /><output>${q}%</output>`) : '')
    + (transparency && f.alpha ? draftToggle(api, 'transparent', api.t('snapshot.transparent'), 'styleWhite', d.transparent) : '')
    + `<p class="muted hint">${api.icon('info')} ${api.escapeHtml(api.t(`imageFormat.${f.id}`))}</p>`;
};

const draftOf = (api, defaults) => { api.state.draft ??= { ...defaults, ...api.P() }; return api.state.draft; };
const seg = (api, key, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-draft-segment="${key}" data-value="${api.escapeHtml(value)}" title="${api.escapeHtml(label)}">${glyph ? api.icon(glyph) : ''}${api.escapeHtml(label)}</button>`).join('')}</span>`;
const draftToggle = (api, key, label, glyph, checked) => api.row(glyph, label, `<label class="switch-wrap" title="${api.escapeHtml(label)}"><input type="checkbox" data-draft-toggle="${key}" ${checked ? 'checked' : ''} aria-label="${api.escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
const sizeRows = (api, d) => {
  const { row, numberField, t } = api;
  const presets = `<span class="segmented wrap">${RESOLUTIONS.map(([id, w, h]) => `<button class="segment ${Number(d.width) === w && Number(d.height) === h ? 'active' : ''}" data-action="size-preset" data-value="${w}x${h}" title="${w} × ${h}">${api.escapeHtml(t(`size.${id}`))}</button>`).join('')}</span>`;
  return row('scaleTool', t('snapshot.preset'), presets, t('snapshot.preset'), 'full')
    + row('dimension', t('snapshot.width'), numberField('draft:width', Number(d.width), 320, 7680, 10, 'px', t('snapshot.width')))
    + row('dimension', t('snapshot.height'), numberField('draft:height', Number(d.height), 240, 4320, 10, 'px', t('snapshot.height')));
};

function importModel(api) {
  const { frame, button, row, t, escapeHtml, icon } = api;
  const d = draftOf(api, { units: 'auto', upAxis: 'auto', optimize: true });
  const names = d.names ?? [];
  const skp = names.some((n) => /\.skp$/i.test(n));
  api.root.innerHTML = frame({
    glyph: 'importModel', title: t('import.title'),
    body: `<div class="editor">
      <div class="row file-list">${names.map((n) => `<span class="file-chip" title="${escapeHtml(n)}">${icon('cube')}<span>${escapeHtml(n)}</span></span>`).join('')}</div>
      ${row('units', t('import.units'), seg(api, 'units', [['auto', t('import.auto'), 'sparkles'], ['mm', 'mm'], ['cm', 'cm'], ['m', 'm'], ['in', 'in'], ['ft', 'ft']], d.units))}
      ${row('axesTool', t('import.upAxis'), seg(api, 'upAxis', [['auto', t('import.auto'), 'sparkles'], ['y', t('import.yUp')], ['z', t('import.zUp')]], d.upAxis))}
      ${draftToggle(api, 'optimize', t('import.optimize'), 'fps', d.optimize)}
      <p class="muted hint">${icon('info')} ${escapeHtml(t('import.hint'))}</p>
      ${skp ? `<p class="badge danger">${icon('warning')} ${escapeHtml(t('error.code.skp-unsupported'))}</p>` : ''}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('import-apply', t('import.go'), 'importModel', 'primary')}`,
  });
  api.ready();
}

/**
 * Import › Floor plan: CAD / PDF options (units or scale, layers, walls, target), picture options (size, opacity,
 * calibration), building options (IFC, Sweet Home 3D: target, furniture, rooms) or the choice of a page (PDF, TIFF).
 */
function importPlan(api) {
  const { frame, button, row, t, escapeHtml, icon, numberField } = api;
  const d = draftOf(api, {});
  const has = d.hasProject !== false;
  const targets = d.mode === 'image'
    ? [['level', t('plan.targetActive'), 'level'], ['new', t('plan.targetNew'), 'fileNew']]
    : d.mode === 'building' ? [['new', t('plan.targetNew'), 'fileNew'], ['add', t('plan.targetAddBuilding'), 'levelAdd']]
      : [['replace', t('plan.targetReplace'), 'level'], ['level', t('plan.targetLevel'), 'levelAdd'], ['new', t('plan.targetNew'), 'fileNew']];
  const target = seg(api, 'target', targets.filter(([id]) => has || id === 'new'), has ? d.target : 'new');
  const glyph = d.mode === 'image' ? 'picture' : d.mode === 'building' ? 'levelAdd' : 'plan2d';
  const note = d.mode === 'image' ? `${d.pixels ?? ''} px` : d.mode === 'pdf' ? [t('plan.page', { n: d.page ?? 1 }), d.paper].filter(Boolean).join(' · ') : d.mode === 'building' ? d.format ?? '' : d.mode === 'pages' ? '' : t(d.guessed ? 'plan.unitsGuessed' : 'plan.unitsFile', { units: d.detected ?? '' });
  const chip = `<div class="row file-list"><span class="file-chip" title="${escapeHtml(d.name ?? '')}">${icon(glyph)}<span>${escapeHtml(d.name ?? '')}</span></span><span class="muted">${escapeHtml(note)}</span></div>`;
  const layersHtml = (layers) => `<div class="row plan-layers-head"><span class="row-label">${icon('tagsPanel')}<span>${escapeHtml(t('plan.layers'))}</span></span><span class="muted">${escapeHtml(t('plan.layersHint'))}</span></div>
      <div class="plan-layers" role="group" aria-label="${escapeHtml(t('plan.layers'))}">${layers.map((l, i) => `<label class="plan-layer" title="${escapeHtml(l.name)}"><input type="checkbox" data-plan-layer="${i}" ${l.on ? 'checked' : ''} /><span class="plan-layer-name">${escapeHtml(l.name)}</span><span class="muted">${escapeHtml(t('plan.layerCounts', { lines: l.lines, arcs: l.arcs, texts: l.texts }))}</span></label>`).join('')}</div>`;
  const wallRows = () => `${row('wallTool', t('plan.walls'), seg(api, 'walls', [['auto', t('import.auto'), 'sparkles'], ['pairs', t('plan.wallsPairs')], ['single', t('plan.wallsSingle')]], d.walls))}
      ${row('wallTool', t('settings.wallHeight'), numberField('draft:wallHeight', Number(d.wallHeight), 1.8, 6, 0.05, 'm', t('settings.wallHeight')))}
      ${row('wallTool', t('plan.thickness'), numberField('draft:thickness', Number(d.thickness), 0.05, 0.6, 0.01, 'm', t('plan.thickness')))}
      ${row('level', t('plan.target'), target)}
      ${draftToggle(api, 'keepLines', t('plan.keepLines'), 'guide', d.keepLines !== false)}`;
  let body;
  if (d.mode === 'pages') {
    const pages = d.pages ?? [];
    body = `${chip}
      <div class="row plan-layers-head"><span class="row-label">${icon('layers')}<span>${escapeHtml(t('plan.choosePage'))}</span></span></div>
      <div class="segmented plan-pages" role="radiogroup" aria-label="${escapeHtml(t('plan.choosePage'))}">${pages.map((p) => `<button class="segment ${String(d.page) === String(p.number) ? 'active' : ''}" role="radio" aria-checked="${String(d.page) === String(p.number)}" data-draft-segment="page" data-value="${p.number}" title="${escapeHtml(p.label)}">${icon(p.raster ? 'picture' : 'plan2d')}<span>${escapeHtml(p.label)}</span></button>`).join('')}</div>
      <p class="muted hint">${icon('info')} ${escapeHtml(t('plan.pagesHint'))}</p>`;
  } else if (d.mode === 'image') {
    body = `${chip}
      ${row('dimension', t('plan.imageWidth'), numberField('draft:imageWidth', Number(d.imageWidth), 1, 200, 0.5, 'm', t('plan.imageWidth')))}
      ${row('styleXray', t('plan.opacity'), numberField('draft:opacityPct', Math.round(Number(d.opacity ?? 0.6) * 100), 5, 100, 5, '%', t('plan.opacity')))}
      ${row('level', t('plan.target'), target)}
      ${draftToggle(api, 'calibrate', t('plan.calibrate'), 'tapeMeasure', d.calibrate)}
      ${draftToggle(api, 'detect', t('plan.detect'), 'wallTool', d.detect)}
      <p class="muted hint">${icon('info')} ${escapeHtml(t('plan.imageHint'))}</p>`;
  } else if (d.mode === 'pdf') {
    const layers = d.layers ?? [];
    body = `${chip}
      ${row('scaleTool', t('plan.scale'), numberField('draft:scale', Number(d.scale), 1, 5000, 1, '', t('plan.scale')))}
      <div class="row muted plan-note">${icon('info')}<span>${escapeHtml(d.scaleNote ?? '')}</span></div>
      ${draftToggle(api, 'calibrate', t('plan.calibratePlan'), 'tapeMeasure', d.calibrate)}
      ${wallRows()}
      ${layers.length > 1 ? layersHtml(layers) : ''}
      <p class="muted hint">${icon('info')} ${escapeHtml(t('plan.pdfHint'))}</p>`;
  } else if (d.mode === 'building') {
    body = `${chip}
      <div class="row plan-note">${icon('levelAdd')}<span>${escapeHtml(d.summary ?? '')}</span></div>
      <div class="row muted plan-note">${icon('furniture')}<span>${escapeHtml(d.furnitureNote ?? '')}</span></div>
      ${d.warning ? `<p class="badge warning">${icon('warning')} ${escapeHtml(d.warning)}</p>` : ''}
      ${row('level', t('plan.target'), target)}
      ${row('furniture', t('plan.furniture'), seg(api, 'furniture', [['models', t('plan.furnitureModels')], ['library', t('plan.furnitureLibrary')], ['none', t('plan.furnitureNone')]], d.furniture))}
      ${draftToggle(api, 'rooms', t('plan.buildingRooms'), 'roomTool', d.rooms !== false)}
      <p class="muted hint">${icon('info')} ${escapeHtml(t('plan.buildingHint'))}</p>`;
  } else {
    const layers = d.layers ?? [];
    body = `${chip}
      ${row('units', t('plan.units'), seg(api, 'units', [['auto', t('import.auto'), 'sparkles'], ['mm', 'mm'], ['cm', 'cm'], ['m', 'm'], ['in', 'in'], ['ft', 'ft']], d.units))}
      ${wallRows()}
      ${layersHtml(layers)}
      <p class="muted hint">${icon('info')} ${escapeHtml(t('plan.hint'))}</p>`;
  }
  api.root.innerHTML = frame({
    glyph: 'importPlan', title: t(d.mode === 'building' ? 'plan.buildingTitle' : 'plan.title'),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('importplan-apply', t(d.mode === 'pages' ? 'common.ok' : 'import.go'), d.mode === 'pages' ? 'check' : 'importPlan', 'primary')}`,
  });
  api.fitHeight();
  api.ready();
}

function snapshot(api) {
  const { frame, button, t } = api;
  const d = draftOf(api, { width: 1920, height: 1080, format: 'png', quality: 0.92, transparent: false });
  api.root.innerHTML = frame({
    glyph: 'exportImage', title: t('snapshot.title'),
    body: `<div class="editor">${sizeRows(api, d)}
      ${formatRows(api, d)}
      <p class="muted hint">${api.icon('info')} ${api.escapeHtml(t('snapshot.hint'))}</p></div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('snapshot-apply', t('snapshot.save'), 'exportImage', 'primary')}`,
  });
  api.ready();
}

function renderOptions(api) {
  const { frame, button, t, escapeHtml, icon } = api;
  const d = draftOf(api, { width: 1920, height: 1080, samples: 256 });
  const megapixels = (Number(d.width) * Number(d.height)) / 1e6;
  const estimate = Math.max(5, Math.round(megapixels * Number(d.samples) * 0.06));
  api.root.innerHTML = frame({
    glyph: 'renderPhoto', title: t('render.title'),
    body: `<div class="editor">${sizeRows(api, d)}
      ${api.row('quality', t('render.samples'), seg(api, 'samples', SAMPLES.map((n) => [n, String(n)]), d.samples))}
      <div class="row muted">${icon('clock')}<span>${escapeHtml(t('render.estimate', { s: estimate }))}</span></div>
      <p class="muted hint">${icon('info')} ${escapeHtml(t('render.hint'))}</p></div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('render-apply', t('render.go'), 'renderPhoto', 'primary')}`,
  });
  api.ready();
}

function renderResult(api) {
  const { frame, button, t, escapeHtml } = api;
  const p = api.P();
  const d = draftOf(api, { format: 'png', quality: 0.92 });
  api.root.innerHTML = frame({
    glyph: 'renderPhoto', title: t('render.result', { w: p.width, h: p.height }),
    body: `<div class="render-result-wrap"><div class="render-result"><img src="${escapeHtml(p.image ?? '')}" alt="" /></div><div class="editor render-format">${formatRows(api, d, { transparency: false })}</div></div>`,
    foot: `<span class="grow"></span>${button('close', t('common.close'), 'close')}${button('render-save', t('render.save'), 'save', 'primary')}`,
  });
  api.ready();
}

/** Map slots of a custom material (engine/usertextures.js TEXTURE_SLOTS): [slot, label key, icon]. */
const MAP_SLOTS = [['color', 'materials.mapColor', 'picture'], ['normal', 'materials.mapNormal', 'styleShaded'], ['roughness', 'materials.mapRoughness', 'quality']];

/** One map row: the chosen picture (preview + file name) with Choose… and Remove. */
const mapRow = (api, slot, labelKey, glyph, map) => {
  const { row, t, escapeHtml, icon } = api;
  const chip = map
    ? `<span class="file-chip mat-map" title="${escapeHtml(map.name)}">${map.preview ? `<img class="mat-map-preview" src="${escapeHtml(map.preview)}" alt="" />` : icon('picture')}<span>${escapeHtml(map.name)}</span></span>`
    : `<span class="muted mat-map-none">${escapeHtml(t('materials.mapNone'))}</span>`;
  const choose = `<button class="button" data-action="material-pick" data-value="${slot}" title="${escapeHtml(t('materials.mapChoose'))}">${icon('folderOpen')}<span>${escapeHtml(t('materials.mapChoose'))}</span></button>`;
  const clear = map ? `<button class="icon-button" data-action="material-clear" data-value="${slot}" title="${escapeHtml(t('materials.mapRemove'))}" aria-label="${escapeHtml(t('materials.mapRemove'))}">${icon('close')}</button>` : '';
  return row(glyph, t(labelKey), `<span class="mat-map-row">${chip}${choose}${clear}</span>`);
};

function material(api) {
  const { frame, button, row, t, escapeHtml, icon, numberField } = api;
  const d = draftOf(api, { name: '', color: '#a0a0a0', roughness: 0.7, metalness: 0, maps: {}, tileW: 1, tileH: 1 });
  d.maps ??= {};
  const textured = Boolean(d.maps.color);
  const preview = d.maps.color?.preview;
  const swatch = preview
    ? `background:url('${escapeHtml(preview)}') center / cover, ${escapeHtml(d.color)}; background-blend-mode: multiply`
    : `background:radial-gradient(circle at 35% 30%, #ffffff ${Math.round((1 - d.roughness) * 40)}%, ${escapeHtml(d.color)} 60%, #000 140%)`;
  const anyMap = MAP_SLOTS.some(([slot]) => d.maps[slot]);
  api.root.innerHTML = frame({
    glyph: 'materialsPanel', title: t(d.edit ? 'materials.edit' : 'materials.new'),
    body: `<div class="editor">
      ${row('textTool', t('materials.name'), `<input type="text" data-draft="name" value="${escapeHtml(d.name)}" />`)}
      ${row('palette', t(textured ? 'materials.tint' : 'materials.color'), `<input type="color" data-draft="color" value="${escapeHtml(d.color)}" />`)}
      ${row('styleShaded', t('materials.roughness'), `<input type="range" min="0" max="1" step="0.01" data-draft="roughness" value="${escapeHtml(d.roughness)}" ${d.maps.roughness ? 'disabled' : ''} /><output>${Number(d.roughness).toFixed(2)}</output>`)}
      ${row('metalness', t('materials.metalness'), `<input type="range" min="0" max="1" step="0.01" data-draft="metalness" value="${escapeHtml(d.metalness)}" /><output>${Number(d.metalness).toFixed(2)}</output>`)}
      ${MAP_SLOTS.map(([slot, label, glyph]) => mapRow(api, slot, label, glyph, d.maps[slot])).join('')}
      ${anyMap ? row('dimension', t('materials.tileWidth'), numberField('draft:tileW', Number(d.tileW) || 1, 0.01, 50, 0.05, 'm', t('materials.tileWidth'))) : ''}
      ${anyMap ? row('dimension', t('materials.tileHeight'), numberField('draft:tileH', Number(d.tileH) || 1, 0.01, 50, 0.05, 'm', t('materials.tileHeight'))) : ''}
      <div class="row"><span class="mat-preview" style="${swatch}"></span></div>
      ${anyMap ? `<div class="row muted mat-hint">${icon('info')}<span>${escapeHtml(t('materials.mapHint'))}</span></div>` : ''}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('material-apply', t('common.ok'), 'check', 'primary')}`,
  });
  api.fitHeight();
  api.ready();
}

/**
 * Clicks (and change / input / stepper events) of the 3D popups. Returns true when handled.
 */
export function popup3dAction(kind, target, api, type = 'click') {
  const d = api.state.draft;
  if (type === 'stepper') {
    if (!d) return false;
    d[target.dataset.stepper] = target.dataset.value;
    api.render();
    return true;
  }
  if ((type === 'input' || type === 'change') && kind === 'importplan' && target.dataset.planLayer !== undefined && d) {
    const layer = d.layers?.[Number(target.dataset.planLayer)];
    if (layer) layer.on = target.checked;
    return true;
  }
  if (type === 'input' || type === 'change') {
    if ((kind === 'snapshot' || kind === 'renderresult') && target.dataset.draft === 'quality' && d) {
      d.quality = Number(target.value);
      const out = target.parentElement?.querySelector('output');
      if (out) out.textContent = `${Math.round(d.quality * 100)}%`;
      return type === 'input';
    }
    if (kind === 'material' && target.dataset.draft && d) {
      d[target.dataset.draft] = target.type === 'range' ? Number(target.value) : target.value;
      if (target.dataset.draft === 'color') d.colorSet = true;
      const out = target.parentElement?.querySelector('output');
      if (out) out.textContent = Number(target.value).toFixed(2);
      const preview = api.root.querySelector('.mat-preview');
      if (preview && d.maps?.color?.preview) preview.style.backgroundColor = d.color;
      else if (preview) preview.style.background = `radial-gradient(circle at 35% 30%, #ffffff ${Math.round((1 - d.roughness) * 40)}%, ${d.color} 60%, #000 140%)`;
      return type === 'input';
    }
    return false;
  }
  const action = target.dataset?.action;
  switch (action) {
    case 'progress-cancel':
      api.state.cancelled = true;
      api.action('progress-cancel', { op: api.P().op });
      api.render();
      return true;
    case 'size-preset': { const [w, h] = target.dataset.value.split('x').map(Number); d.width = w; d.height = h; api.render(); return true; }
    case 'import-apply': api.close({ ok: true, units: d.units, upAxis: d.upAxis, optimize: d.optimize !== false }); return true;
    case 'importplan-apply': {
      const targetOf = d.hasProject === false ? 'new' : d.target;
      if (d.mode === 'pages') api.close({ ok: true, page: Number(d.page) || 1 });
      else if (d.mode === 'building') api.close({ ok: true, target: targetOf === 'add' ? 'add' : 'new', furniture: d.furniture ?? 'library', rooms: d.rooms !== false });
      else if (d.mode === 'pdf') api.close({ ok: true, scale: Number(d.scale) || 100, calibrate: Boolean(d.calibrate), walls: d.walls, wallHeight: Number(d.wallHeight), thickness: Number(d.thickness), target: targetOf, keepLines: d.keepLines !== false, layers: (d.layers ?? []).filter((l) => l.on).map((l) => l.name) });
      else if (d.mode === 'image') api.close({ ok: true, imageWidth: Number(d.imageWidth) || 12, opacity: Math.max(5, Math.min(100, Number(d.opacityPct ?? Math.round((d.opacity ?? 0.6) * 100)))) / 100, target: targetOf, calibrate: Boolean(d.calibrate), detect: Boolean(d.detect) });
      else api.close({ ok: true, units: d.units, walls: d.walls, wallHeight: Number(d.wallHeight), thickness: Number(d.thickness), target: targetOf, keepLines: d.keepLines !== false, layers: (d.layers ?? []).filter((l) => l.on).map((l) => l.name) });
      return true;
    }
    case 'snapshot-apply': api.close({ ok: true, width: Math.round(Number(d.width)), height: Math.round(Number(d.height)), format: formatInfo(d.format).id, quality: Number(d.quality ?? 0.92), transparent: Boolean(formatInfo(d.format).alpha && d.transparent) }); return true;
    case 'render-apply': api.close({ ok: true, width: Math.round(Number(d.width)), height: Math.round(Number(d.height)), samples: Number(d.samples) }); return true;
    case 'render-save': api.close({ save: true, format: formatInfo(d?.format).id, quality: Number(d?.quality ?? 0.92) }); return true;
    case 'material-apply': {
      // Maps: { slot: { token (picked now) | asset (kept), name } } — the main window owns the bytes.
      const maps = Object.fromEntries(Object.entries(d.maps ?? {}).filter(([, m]) => m).map(([slot, m]) => [slot, { token: m.token ?? null, asset: m.asset ?? null, name: m.name }]));
      api.close({ ok: true, name: d.name || api.t('materials.newName'), color: d.color, roughness: d.roughness, metalness: d.metalness, maps, tileW: Number(d.tileW) || 1, tileH: Number(d.tileH) || Number(d.tileW) || 1 });
      return true;
    }
    case 'material-pick': api.action('material-texture', { slot: target.dataset.value }); return true;
    case 'material-clear': if (d?.maps) { d.maps[target.dataset.value] = null; api.render(); } return true;
    default: return false;
  }
}

/**
 * Messages from the main window to these popups. 'material-texture': the picture chosen for a map slot
 * ({ slot, token, name, preview, aspect }); the tile height follows the picture's aspect.
 */
export function popup3dHostMessage(kind, message, api) {
  if (kind !== 'material' || message?.type !== 'material-texture') return false;
  const d = api.state.draft;
  if (!d) return true;
  d.maps ??= {};
  d.maps[message.slot] = { token: message.token, name: message.name, preview: message.preview ?? null };
  if (message.slot === 'color' && message.aspect > 0) d.tileH = Math.round((Number(d.tileW) || 1) * message.aspect * 1000) / 1000;
  if (message.slot === 'color' && !d.colorSet) d.color = '#ffffff';
  api.render();
  return true;
}
