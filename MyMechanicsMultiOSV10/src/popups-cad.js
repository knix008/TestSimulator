// The CAD app's own popups (run inside popup.js, which supplies the frame and controls through
// `api`): Settings › Modeling, the Mass Properties window and the Interference Detection results.

/** Settings › Modeling: units, sketching, display and navigation. */
export function renderCadSettings(api) {
  const { row, toggle, segmented, numberField, t, s, escapeHtml, icon } = api;
  const set = s();
  return [
    `<h3 class="section-title">${icon('units')}${escapeHtml(t('settings.sectionModel'))}</h3>`,
    row('units', t('settings.units'), segmented('units', [['mm', 'mm'], ['cm', 'cm'], ['in', 'in']], set.units)),
    row('smartDim', t('settings.decimals'), numberField('decimals', set.decimals ?? 2, 0, 6, 1, '', t('settings.decimals'))),
    toggle('snapToGrid', t('settings.snapGrid'), 'grid'),
    toggle('autoRelations', t('settings.autoRelations'), 'addRelation'),
    toggle('editDimOnCreate', t('settings.editDimOnCreate'), 'smartDim'),
    row('drawing', t('settings.projection'), segmented('projection', [['third', t('drawing.third')], ['first', t('drawing.first')]], set.projection ?? 'third')),
    // DWG releases to save in (AutoCAD 2000 … 2018 formats; the newest opens in every current program, R2004 also in old ones).
    row('dwgFile', t('settings.dwgVersion'), api.select('data-select', 'dwgVersion', ['R2018', 'R2013', 'R2010', 'R2007', 'R2004', 'R2000'].map((v) => [v, t(`settings.dwgRelease.${v}`), 'dwgFile']), set.dwgVersion ?? 'R2004', t('settings.dwgVersion'))),
    `<h3 class="section-title">${icon('styleShaded')}${escapeHtml(t('settings.sectionDisplay'))}</h3>`,
    row('styleShaded', t('settings.displayStyle'), segmented('displayStyle', [['shadedEdges', t('style.shadedEdges'), 'styleShaded'], ['shaded', t('style.shaded'), 'styleWhite'], ['hiddenRemoved', t('style.hiddenRemoved'), 'styleHidden'], ['wireframe', t('style.wireframe'), 'styleWireframe']], set.displayStyle ?? 'shadedEdges')),
    toggle('showPlanes', t('settings.showPlanes'), 'refPlane'),
    toggle('showOrigin', t('settings.showOrigin'), 'origin'),
    toggle('showSketches', t('settings.showSketches'), 'featSketch'),
    toggle('perspectiveView', t('settings.perspective'), 'perspective'),
    row('quality', t('settings.meshQuality'), segmented('meshQuality', [['coarse', t('quality.low')], ['normal', t('quality.medium')], ['fine', t('quality.high')]], set.meshQuality ?? 'normal')),
    toggle('modelledThreads', t('settings.modelledThreads'), 'featThread'),
    row('largeAssembly', t('settings.largeAssembly'), segmented('largeAssembly', [['auto', t('lam.auto')], ['on', t('lam.on')], ['off', t('lam.off')]], set.largeAssembly ?? 'auto')),
    row('assembly', t('settings.largeAssemblyThreshold'), numberField('largeAssemblyThreshold', set.largeAssemblyThreshold ?? 40, 2, 100000, 10, '', t('settings.largeAssemblyThreshold'))),
    row('hide', t('settings.largeHideSmall'), numberField('largeHideSmall', set.largeHideSmall ?? 0, 0, 0.2, 0.01, '', t('settings.largeHideSmall'))),
    row('magneticMate', t('settings.magneticDistance'), numberField('magneticDistance', set.magneticDistance ?? 25, 0, 10000, 1, 'mm', t('settings.magneticDistance'))),
    row('clearanceCheck', t('settings.clearanceMin'), numberField('clearanceMin', set.clearanceMin ?? 1, 0, 1000, 0.1, 'mm', t('settings.clearanceMin'))),
    toggle('clearanceIgnoreTouching', t('settings.clearanceIgnoreTouching'), 'interference'),
    row('holeAlignment', t('settings.holeAlignTolerance'), numberField('holeAlignTolerance', set.holeAlignTolerance ?? 0.01, 0, 10, 0.01, 'mm', t('settings.holeAlignTolerance'))),
    `<h3 class="section-title">${icon('orbitTool')}${escapeHtml(t('settings.sectionNavigation'))}</h3>`,
    row('info', '', `<span class="muted">${escapeHtml(t('settings.mouseHelp'))}</span>`),
    row('orbitTool', t('settings.orbitMode'), segmented('orbitMode', [['free', t('settings.orbitFree')], ['turntable', t('settings.orbitTurntable')]], set.orbitMode ?? 'free')),
    row('orbitTool', t('settings.orbitSpeed'), numberField('orbitSpeed', set.orbitSpeed ?? 100, 20, 300, 10, '%', t('settings.orbitSpeed'))),
    row('rotateRight', t('settings.arrowStep'), numberField('arrowStep', set.arrowStep ?? 15, 1, 90, 1, '°', t('settings.arrowStep'))),
    toggle('invertZoom', t('settings.invertZoom'), 'zoomTool'),
  ].join('');
}

const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }) : '—');

// ───────────────────────── the macro editor (app-macros.js): script, console, record / run / stop

let macroView = null;          // what the main window last sent ({ text, log, recording, running, name, steps })
let macroTimer = null;

function macroLog(api) {
  const { escapeHtml, icon } = api;
  const glyph = { error: 'error', warn: 'warning', ok: 'check', input: 'chevronRight', result: 'chevronLeft', info: 'info' };
  return (macroView.log ?? []).map((l) => `<li class="macro-${l.level}" ${l.line ? `data-line="${l.line}"` : ''}>${icon(glyph[l.level] ?? 'info', 'icon tiny')}<span>${escapeHtml(l.text)}</span></li>`).join('');
}
function macroBar(api) {
  const { t, escapeHtml, icon } = api;
  const v = macroView;
  const b = (op, glyph, label, extra = '') => `<button type="button" class="small-button ${extra}" data-action="macro-${op}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
  return `${b('record', 'macroRecord', v.recording ? t('macro.stopRecording') : t('cmd.macroRecord'), v.recording ? 'recording' : '')}${b('run', 'macroRun', t('macro.run'), 'primary')}${b('stop', 'macroStop', t('cmd.macroStop'))}<span class="macro-sep"></span>${b('new', 'fileNew', t('macro.new'))}${b('load', 'folderOpen', t('macro.load'))}${b('save', 'save', t('macro.save'))}<span class="grow"></span><span class="macro-status ${v.recording ? 'rec' : v.running ? 'run' : ''}">${escapeHtml(v.recording ? t('macro.rec', { count: v.steps ?? 0 }) : v.running ? t('macro.playing') : t('macro.idle'))}</span>`;
}
function macroGutter(text) { const n = String(text ?? '').split('\n').length; return Array.from({ length: Math.max(1, n) }, (_, i) => i + 1).join('\n'); }
/** Updates the editor window from the main window's state without touching what is being typed. */
function macroRefresh(api, { replaceText = false } = {}) {
  const { root } = api;
  const bar = root.querySelector('.macro-bar'); if (bar) bar.innerHTML = macroBar(api);
  const log = root.querySelector('.macro-log'); if (log) { log.innerHTML = macroLog(api); log.scrollTop = log.scrollHeight; }
  const area = root.querySelector('[data-macro-text]');
  if (area && replaceText) { area.value = macroView.text ?? ''; }
  const gutter = root.querySelector('.macro-gutter'); if (gutter && area) gutter.textContent = macroGutter(area.value);
  const busy = macroView.running;
  for (const el of root.querySelectorAll('[data-action="macro-run"], [data-action="macro-load"], [data-action="macro-new"], [data-action="macro-record"]')) el.disabled = busy;
  const stop = root.querySelector('[data-action="macro-stop"]'); if (stop) stop.disabled = !busy;
}
function renderMacro(api) {
  const { t, escapeHtml, frame, button, P, root } = api;
  // A new opening (its stamp) starts from what the main window sent; a redraw (theme, language) keeps the typed script.
  const typed = root.querySelector('[data-macro-text]')?.value;
  if (!macroView || macroView.stamp !== P().stamp) macroView = { ...P() };
  else if (typed != null) macroView.text = typed;
  root.innerHTML = frame({
    glyph: 'macroEditor', title: `${t('cmd.macroEditor')} — ${macroView.name ?? 'macro.mmjs'}`,
    body: `<div class="macro-editor">
      <div class="macro-bar"></div>
      <div class="macro-code"><pre class="macro-gutter" aria-hidden="true"></pre><textarea data-macro-text spellcheck="false" wrap="off" placeholder="${escapeHtml(t('macro.placeholder'))}"></textarea></div>
      <div class="macro-console"><ul class="macro-log"></ul><label class="macro-prompt"><span>›</span><input type="text" data-macro-eval spellcheck="false" placeholder="${escapeHtml(t('macro.prompt'))}"/></label></div>
    </div>`,
    foot: `${button('macro-clear-log', t('macro.clearLog'), 'trash')}<span class="grow"></span><span class="muted hint">${escapeHtml(t('macro.apiHint'))}</span>${button('close', t('common.done'), 'check', 'primary')}`,
  });
  const area = root.querySelector('[data-macro-text]');
  area.value = macroView.text ?? '';
  const gutter = root.querySelector('.macro-gutter');
  area.addEventListener('scroll', () => { gutter.scrollTop = area.scrollTop; });
  area.addEventListener('keydown', (event) => {
    // Tab indents (two spaces) instead of leaving the editor.
    if (event.key === 'Tab') { event.preventDefault(); const s = area.selectionStart; area.setRangeText('  ', s, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input', { bubbles: true })); }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); api.action('macro', { op: 'run', text: area.value }); }
    event.stopPropagation();
  });
  const prompt = root.querySelector('[data-macro-eval]');
  prompt.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault(); event.stopPropagation();
    const line = prompt.value; prompt.value = '';
    api.action('macro', { op: 'eval', line, text: area.value });
  });
  root.querySelector('.macro-log').addEventListener('click', (event) => {
    // A logged error's line: the cursor goes there.
    const li = event.target.closest('[data-line]'); if (!li) return;
    const n = Number(li.dataset.line); const lines = area.value.split('\n');
    const at = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
    area.focus(); area.setSelectionRange(at, at + (lines[n - 1]?.length ?? 0));
  });
  macroRefresh(api);
  api.ready();
  return true;
}

export function renderCadPopup(kind, api) {
  const { t, escapeHtml, icon, frame, button, P, root } = api;
  if (kind === 'macro') return renderMacro(api);
  if (kind === 'massprops') {
    const p = P();
    const rows = (p.rows ?? []).map(([glyph, label, value]) => `<dt title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('');
    root.innerHTML = frame({
      glyph: 'massProps', title: t('mass.title'),
      body: `<div class="about mass-props">
        <div class="mass-head">${icon(p.kind === 'assembly' ? 'assembly' : 'part', 'icon big')}<div><div class="about-name">${escapeHtml(p.name ?? '')}</div><div class="muted">${escapeHtml(p.material ?? '')}</div></div></div>
        <dl class="about-table">${rows}</dl>
        <p class="muted hint">${escapeHtml(t('mass.note'))}</p>
      </div>`,
      foot: `${button('copy-mass', t('action.copy'), 'copy')}<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
    });
    api.fitHeight();
    api.ready();
    return true;
  }
  if (kind === 'interference' && P().mode === 'clearance') {
    // Clearance verification (the same window): pairs closer than the minimum clearance, closest first.
    const p = P();
    const list = p.items ?? [];
    const msg = list.length ? t('asmx.clearanceLow', { count: list.length, min: fmt(p.min ?? 0) }) : t('asmx.clearanceOk', { count: p.checked ?? 0, min: fmt(p.min ?? 0) });
    root.innerHTML = frame({
      glyph: 'clearanceCheck', title: t('cmd.clearanceCheck'),
      body: `<div class="confirm">
        <div class="confirm-message">${icon(list.length ? 'warning' : 'check', 'icon big')}<p>${escapeHtml(msg)}</p></div>
        ${list.length ? `<ul class="confirm-items" data-clearance-items>${list.slice(0, 30).map((it) => `<li title="${escapeHtml(`${it.a} ↔ ${it.b}`)}">${icon('clearanceCheck')}<span>${escapeHtml(`${it.a} ↔ ${it.b}`)} — ${escapeHtml(it.gap < 1e-6 ? t('asmx.clearanceTouch') : t('asmx.clearanceGap', { gap: fmt(it.gap) }))}</span></li>`).join('')}</ul>` : ''}
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
    });
    api.fitHeight();
    api.ready();
    return true;
  }
  if (kind === 'interference' && P().mode === 'holes') {
    // Hole alignment (the same window): holes of different components off one axis by more than the tolerance.
    const p = P();
    const list = p.items ?? [];
    const msg = list.length ? t('asmx.holesOff', { count: list.length }) : t('asmx.holesOk', { count: p.checked ?? 0 });
    root.innerHTML = frame({
      glyph: 'holeAlignment', title: t('cmd.holeAlignment'),
      body: `<div class="confirm">
        <div class="confirm-message">${icon(list.length ? 'warning' : 'check', 'icon big')}<p>${escapeHtml(msg)}</p></div>
        <p class="pm-note">${escapeHtml(t('asmx.holesSummary', { checked: p.checked ?? 0, aligned: p.aligned ?? 0, tolerance: fmt(p.tolerance ?? 0) }))}</p>
        ${list.length ? `<ul class="confirm-items" data-hole-items>${list.slice(0, 20).map((it) => `<li title="${escapeHtml(`${it.a} ↔ ${it.b}`)}">${icon('holeAlignment')}<span>${escapeHtml(`${it.a} ↔ ${it.b}`)} — ${escapeHtml(t('asmx.holeOffset', { offset: fmt(it.offset), da: fmt(2 * it.radiusA), db: fmt(2 * it.radiusB) }))}</span></li>`).join('')}</ul>` : ''}
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
    });
    api.fitHeight();
    api.ready();
    return true;
  }
  if (kind === 'interference') {
    const p = P();
    const list = p.items ?? [];
    root.innerHTML = frame({
      glyph: 'interference', title: t('interference.title'),
      body: `<div class="confirm">
        <div class="confirm-message">${icon(list.length ? 'warning' : 'check', 'icon big')}<p>${escapeHtml(list.length ? t('interference.found', { count: list.length }) : t('interference.none'))}</p></div>
        ${list.length ? `<ul class="confirm-items">${list.slice(0, 12).map((it) => `<li title="${escapeHtml(`${it.a} ↔ ${it.b}`)}">${icon('interference')}<span>${escapeHtml(`${it.a} ↔ ${it.b}`)} — ${escapeHtml(fmt(it.volume))} mm³</span></li>`).join('')}</ul>` : ''}
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
    });
    api.fitHeight();
    api.ready();
    return true;
  }
  return false;
}

export function cadPopupAction(kind, target, api, type = 'click') {
  if (kind === 'macro') {
    const area = api.root.querySelector('[data-macro-text]');
    if (type === 'input' && target.matches?.('[data-macro-text]')) {
      // Typed text: the line numbers now, the main window a moment later (it keeps the script).
      const gutter = api.root.querySelector('.macro-gutter'); if (gutter) gutter.textContent = macroGutter(target.value);
      clearTimeout(macroTimer); macroTimer = setTimeout(() => api.action('macro', { op: 'text', text: target.value }), 250);
      return true;
    }
    if (type !== 'click') return false;
    const op = /^macro-(.+)$/.exec(target.dataset?.action ?? '')?.[1];
    if (!op) return false;
    clearTimeout(macroTimer);
    api.action('macro', { op, text: area?.value ?? '' });
    return true;
  }
  if (type !== 'click') return false;
  if (kind === 'massprops' && target.dataset?.action === 'copy-mass') {
    const text = (api.P().rows ?? []).map(([, label, value]) => `${label}\t${value}`).join('\n');
    api.action('copy-text', { text });
    return true;
  }
  return false;
}

/** Messages from the main window: the macro editor's state (log, recording, running; the script when replaced). */
export function cadHostMessage(kind, message, api) {
  if (kind !== 'macro' || message?.type !== 'macro-state') return false;
  const { type: _type, replaceText = false, ...rest } = message;
  macroView = { ...(macroView ?? {}), ...rest };
  macroRefresh(api, { replaceText });
  return true;
}
