// The 3D app's own popups (run inside popup.js, which supplies the frame and
// controls through `api`): Settings › 3D view, model import options, picture
// size, photo-real render options and result, and a new material.
// Each popup keeps its edits in state.draft and answers with close({ ok: true, … }).

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
  const fn = { importmodel: importModel, snapshot, render: renderOptions, renderresult: renderResult, material }[kind];
  if (!fn) return false;
  fn(api);
  return true;
}

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

function snapshot(api) {
  const { frame, button, t } = api;
  const d = draftOf(api, { width: 1920, height: 1080, format: 'png', transparent: false });
  api.root.innerHTML = frame({
    glyph: 'exportImage', title: t('snapshot.title'),
    body: `<div class="editor">${sizeRows(api, d)}
      ${api.row('picture', t('snapshot.format'), seg(api, 'format', [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP']], d.format))}
      ${d.format === 'png' ? draftToggle(api, 'transparent', t('snapshot.transparent'), 'styleWhite', d.transparent) : ''}
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
  api.root.innerHTML = frame({
    glyph: 'renderPhoto', title: t('render.result', { w: p.width, h: p.height }),
    body: `<div class="render-result"><img src="${escapeHtml(p.image ?? '')}" alt="" /></div>`,
    foot: `<span class="grow"></span>${button('close', t('common.close'), 'close')}${button('render-save', t('render.save'), 'save', 'primary')}`,
  });
  api.ready();
}

function material(api) {
  const { frame, button, row, t, escapeHtml } = api;
  const d = draftOf(api, { name: '', color: '#a0a0a0', roughness: 0.7, metalness: 0 });
  api.root.innerHTML = frame({
    glyph: 'materialsPanel', title: t('materials.new'),
    body: `<div class="editor">
      ${row('textTool', t('materials.name'), `<input type="text" data-draft="name" value="${escapeHtml(d.name)}" />`)}
      ${row('palette', t('materials.color'), `<input type="color" data-draft="color" value="${escapeHtml(d.color)}" />`)}
      ${row('styleShaded', t('materials.roughness'), `<input type="range" min="0" max="1" step="0.01" data-draft="roughness" value="${escapeHtml(d.roughness)}" /><output>${Number(d.roughness).toFixed(2)}</output>`)}
      ${row('metalness', t('materials.metalness'), `<input type="range" min="0" max="1" step="0.01" data-draft="metalness" value="${escapeHtml(d.metalness)}" /><output>${Number(d.metalness).toFixed(2)}</output>`)}
      <div class="row"><span class="mat-preview" style="background:radial-gradient(circle at 35% 30%, #ffffff ${Math.round((1 - d.roughness) * 40)}%, ${escapeHtml(d.color)} 60%, #000 140%)"></span></div>
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
  if (type === 'input' || type === 'change') {
    if (kind === 'material' && target.dataset.draft && d) {
      d[target.dataset.draft] = target.type === 'range' ? Number(target.value) : target.value;
      const out = target.parentElement?.querySelector('output');
      if (out) out.textContent = Number(target.value).toFixed(2);
      const preview = api.root.querySelector('.mat-preview');
      if (preview) preview.style.background = `radial-gradient(circle at 35% 30%, #ffffff ${Math.round((1 - d.roughness) * 40)}%, ${d.color} 60%, #000 140%)`;
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
    case 'snapshot-apply': api.close({ ok: true, width: Math.round(Number(d.width)), height: Math.round(Number(d.height)), format: d.format, transparent: d.format === 'png' && Boolean(d.transparent) }); return true;
    case 'render-apply': api.close({ ok: true, width: Math.round(Number(d.width)), height: Math.round(Number(d.height)), samples: Number(d.samples) }); return true;
    case 'render-save': api.close({ save: true }); return true;
    case 'material-apply': api.close({ ok: true, name: d.name || api.t('materials.newName'), color: d.color, roughness: d.roughness, metalness: d.metalness }); return true;
    default: return false;
  }
}

/** Messages from the main window to these popups (none beyond progress yet). */
export function popup3dHostMessage() { return false; }
