// Technical illustrations of an assembly (the PropertyManager and commands; the drawing and maths are in
// cad/illustration.js): saved views — camera, explode amount, hidden components, balloons, line style — shown in the
// graphics area, played as an animation, and exported as vector line art (SVG), one stepping HTML document, or PNG.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { illustrationOf, normaliseView, interpolateViews, viewPlacements, autoCallouts, anchorPoints, illustrationSvg, illustrationHtml } from './cad/illustration.js';

export function createIllustrationTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'illustration';
  const asm = () => ctx.activeAssembly();
  let playing = null;

  const ill = (create = false) => { const a = asm(); return a ? illustrationOf(a, { create }) : null; };
  const views = () => ill()?.views ?? [];
  const selected = () => views().find((v) => v.id === editing()?.sel) ?? null;
  const edit = (mutate) => ctx.change('op.illustration', () => { const a = asm(); mutate(illustrationOf(a, { create: true }), a); });

  // ───────────────────────── showing a view in the graphics area

  /** The viewport's camera as a view camera (looking from the eye toward the target). */
  function currentCamera() {
    const s = ctx.viewport()?.cameraState();
    if (!s) return { dir: [-1, 1, -1], up: [0, 0, 1], target: [0, 0, 0], zoom: 1 };
    return { dir: s.dir.map((v) => -v), up: s.up, target: s.target, zoom: 1, distance: s.distance };
  }

  /** Shows a view (or an in-between state): camera, exploded placements, hidden components. */
  function show(state2) {
    const vp = ctx.viewport(); const a = asm();
    if (!vp || !a) return;
    const cam = state2.camera;
    const cur = vp.cameraState();
    vp.setCameraState({ ...cur, target: cam.target ?? cur.target, dir: cam.dir.map((v) => -v), up: cam.up, distance: cam.distance ?? cur.distance });
    state.motionPose = viewPlacements(a, { explode: state2.explode, hidden: [] });
    state.viewHidden = new Set(state2.hidden ?? Object.entries(state2.opacity ?? {}).filter(([, o]) => o < 0.5).map(([id]) => id));
    ctx.syncView();
  }
  const showView = (v) => show(normaliseView(v));
  function clearShow() { state.motionPose = null; state.viewHidden = null; ctx.syncView(); }

  // ───────────────────────── mode

  function begin() {
    if (!asm()) { notify('info', t('il.needAsm')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'illustration', sel: views()[0]?.id ?? null };
    if (selected()) showView(selected());
    ctx.renderAll();
  }
  function finish() { stop(); clearShow(); ctx.cancelEditing({ quiet: true }); }

  // ───────────────────────── views

  function addView() {
    if (!owns(editing())) begin();
    const a = asm(); if (!a) return;
    const n = views().length + 1;
    const id = ctx.newId('ilv');
    const prev = selected();
    edit((il) => { il.views.push(normaliseView({ id, name: t('il.viewName', { n }), camera: currentCamera(), explode: prev?.explode ?? 0, hidden: prev?.hidden ?? [], callouts: prev?.callouts ?? [], style: prev?.style ?? 'lines' }, id)); });
    editing().sel = id;
    showView(selected());
    ctx.renderLeft();
    notify('success', t('il.added', { name: t('il.viewName', { n }) }));
  }
  function updateView(id) { edit((il) => { const v = il.views.find((x) => x.id === id); if (v) v.camera = { ...currentCamera() }; }); notify('success', t('il.updated')); ctx.renderLeft(); }
  function deleteView(id) { edit((il) => { il.views = il.views.filter((x) => x.id !== id); }); if (editing()?.sel === id) editing().sel = views()[0]?.id ?? null; if (selected()) showView(selected()); else clearShow(); ctx.renderLeft(); }
  function moveView(id, d) { edit((il) => { const i = il.views.findIndex((x) => x.id === id); const j = i + d; if (i < 0 || j < 0 || j >= il.views.length) return; [il.views[i], il.views[j]] = [il.views[j], il.views[i]]; }); ctx.renderLeft(); }
  function select(id) { if (!owns(editing())) begin(); editing().sel = id; showView(selected()); ctx.renderLeft(); }
  const patchSel = (mutate) => { const id = editing()?.sel; if (!id) return; edit((il) => { const v = il.views.find((x) => x.id === id); if (v) mutate(v); }); showView(selected()); ctx.renderLeft(); };

  function autoBalloons() { const a = asm(); if (!a || !selected()) return; const c = autoCallouts(a, anchorPoints(a, (x) => ctx.localShape(x))); patchSel((v) => { v.callouts = c; }); notify('success', t('il.balloonsAdded', { count: c.length })); }

  // ───────────────────────── playing

  function stop() { if (playing) { playing.stop = true; playing = null; } }
  /** Plays the views in order: each transition `duration` seconds, eased; the camera and the explode move together. */
  function play() {
    const list = views();
    if (list.length < 2) { notify('info', t('il.needTwo')); return; }
    stop();
    const run = { stop: false };
    playing = run;
    const dur = Math.max(0.2, Number(ill()?.duration) || 2) * 1000;
    let i = 0; let start = performance.now();
    const step = () => {
      if (run.stop || !owns(editing())) return;
      const f = Math.min(1, (performance.now() - start) / dur);
      const target = list[i + 1].camera.distance ?? list[i].camera.distance;
      const s = interpolateViews(list[i], list[i + 1], f);
      show({ ...s, camera: { ...s.camera, distance: list[i].camera.distance != null && target != null ? list[i].camera.distance * (1 - f) + target * f : undefined } });
      if (f >= 1) { i++; start = performance.now(); if (i >= list.length - 1) { playing = null; editing().sel = list.at(-1).id; ctx.renderLeft(); return; } }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    ctx.renderLeft();
  }

  // ───────────────────────── exports

  const nameOf = (partId) => ctx.project()?.parts.find((p) => p.id === partId)?.name ?? partId;
  const art = (v) => illustrationSvg(asm(), v, { shapeOf: (c) => ctx.localShape(c), nameOf, title: `${asm().name} — ${v.name}` });
  async function exportSvg() {
    const v = selected(); if (!v) { notify('info', t('il.pickView')); return undefined; }
    await ctx.ensureKernel();
    const { svg } = art(v);
    return ctx.saveExport(`${ctx.fileSafe(`${asm().name} - ${v.name}`)}.svg`, 'svg', svg, 'image/svg+xml');
  }
  async function exportHtml() {
    if (!views().length) { notify('info', t('il.noViews')); return undefined; }
    await ctx.ensureKernel();
    const steps = views().map((v) => ({ name: v.name, svg: art(v).svg }));
    return ctx.saveExport(`${ctx.fileSafe(asm().name)}.html`, 'html', illustrationHtml(asm().name, steps), 'text/html');
  }
  async function exportPng() {
    const v = selected(); const vp = ctx.viewport();
    if (!v || !vp) { notify('info', t('il.pickView')); return undefined; }
    showView(v);
    const canvas = vp.capture(1920, 1080);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return ctx.saveExport(`${ctx.fileSafe(`${asm().name} - ${v.name}`)}.png`, 'png', blob, 'image/png');
  }

  // ───────────────────────── PropertyManager

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmNum, pmSeg } = ctx.pm;
    if (!asm()) return pmHead('illustration', t('cmd.illustration'), t('il.needAsm'));
    const rows = views().map((v, i) => `<div class="il-row ${v.id === e.sel ? 'active' : ''}"><button type="button" class="il-name" data-pm="il.sel:${escapeHtml(v.id)}" title="${escapeHtml(t('il.show'))}">${icon('ilView', 'icon tiny')}<span>${i + 1}. ${escapeHtml(v.name)}</span></button><button type="button" class="icon-button" data-pm="il.up:${escapeHtml(v.id)}" title="${escapeHtml(t('il.up'))}">${icon('chevronUp', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="il.down:${escapeHtml(v.id)}" title="${escapeHtml(t('il.down'))}">${icon('chevronDown', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="il.update:${escapeHtml(v.id)}" title="${escapeHtml(t('il.update'))}">${icon('rebuild', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="il.delete:${escapeHtml(v.id)}" title="${escapeHtml(t('il.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const v = selected();
    const detail = v ? [
      `<label class="pm-field"><span class="pm-label">${escapeHtml(t('il.name'))}</span><input type="text" class="pm-text" data-pm-field="ilName" value="${escapeHtml(v.name)}" spellcheck="false"/></label>`,
      pmNum('ilExplode', Math.round(v.explode * 100), t('il.explode'), 'explode', '%'),
      pmSeg('ilStyle', [['lines', t('il.style.lines'), 'ilView'], ['hidden', t('il.style.hidden'), 'hiddenLines']], v.style),
      `<p class="pm-note">${escapeHtml(t('il.hiddenNote', { count: v.hidden.length }))}</p>`,
      `<div class="pm-row">${pmButton('il.showAll', 'eye', t('il.showAll'))}${pmButton('il.auto', 'inspBalloon', t('il.auto'))}${pmButton('il.clearBalloons', 'trash', t('il.clearBalloons'))}</div>`,
      `<p class="pm-note">${escapeHtml(t('il.balloonCount', { count: v.callouts.length }))}</p>`,
    ].join('') : `<p class="pm-note">${escapeHtml(t('il.pickView'))}</p>`;
    return [
      pmHead('illustration', t('cmd.illustration'), t('pm.help.illustration')),
      pmGroup('ilView', t('il.views'), `<div class="il-list">${rows || `<p class="pm-note">${escapeHtml(t('il.noViews'))}</p>`}</div><div class="pm-row">${pmButton('il.add', 'plus', t('cmd.ilAddView'), 'primary')}</div>`),
      pmGroup('edit', t('il.selected'), detail),
      pmGroup('ilPlay', t('il.play'), `${pmNum('ilDuration', Number(ill()?.duration) || 2, t('il.duration'), 'clock', 's')}<div class="pm-row">${playing ? pmButton('il.stop', 'stop', t('il.stop')) : pmButton('il.play', 'play', t('il.play'), 'primary')}</div>`),
      pmGroup('ilExport', t('il.export'), `<div class="pm-row">${pmButton('il.svg', 'exportFile', t('cmd.ilExportSvg'))}${pmButton('il.html', 'exportFile', t('cmd.ilExportHtml'))}${pmButton('il.png', 'exportImage', t('il.exportPng'))}</div>`),
    ].join('');
  }

  function field(key, raw) {
    if (key === 'ilName') { const name = String(raw ?? '').trim(); if (name) patchSel((v) => { v.name = name; }); return undefined; }
    if (key === 'ilExplode') { const x = Number(raw); if (Number.isFinite(x)) patchSel((v) => { v.explode = Math.max(0, Math.min(1, x / 100)); }); return undefined; }
    if (key === 'ilDuration') { const x = Number(raw); if (Number.isFinite(x) && x > 0) edit((il) => { il.duration = Math.min(30, Math.max(0.2, x)); }); return ctx.renderLeft(); }
    return undefined;
  }
  function set(key, value) { if (key === 'ilStyle') patchSel((v) => { v.style = value === 'hidden' ? 'hidden' : 'lines'; }); return undefined; }

  /** A click on a component in the graphics area hides it in the selected view (or shows it again). */
  function pick(hit) {
    const v = selected();
    const id = String(hit?.bodyKey ?? '').startsWith('comp:') ? String(hit.bodyKey).slice(5).split('/')[0] : null;
    if (!v || !id) return undefined;
    patchSel((x) => { x.hidden = x.hidden.includes(id) ? x.hidden.filter((h) => h !== id) : [...x.hidden, id]; });
    return true;
  }

  const NAMES = new Set(['il.sel', 'il.up', 'il.down', 'il.update', 'il.delete', 'il.add', 'il.showAll', 'il.auto', 'il.clearBalloons', 'il.play', 'il.stop', 'il.svg', 'il.html', 'il.png']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    switch (name) {
      case 'clear': return undefined;
      case 'il.sel': return select(arg);
      case 'il.up': return moveView(arg, -1);
      case 'il.down': return moveView(arg, 1);
      case 'il.update': return updateView(arg);
      case 'il.delete': return deleteView(arg);
      case 'il.add': return addView();
      case 'il.showAll': return patchSel((v) => { v.hidden = []; });
      case 'il.auto': return autoBalloons();
      case 'il.clearBalloons': return patchSel((v) => { v.callouts = []; });
      case 'il.play': return play();
      case 'il.stop': stop(); return ctx.renderLeft();
      case 'il.svg': return exportSvg();
      case 'il.html': return exportHtml();
      case 'il.png': return exportPng();
      default: return undefined;
    }
  }

  const hasAsm = () => Boolean(asm());
  const commands = {
    illustration: { icon: 'illustration', label: 'cmd.illustration', enabled: hasAsm, checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
    ilAddView: { icon: 'ilView', label: 'cmd.ilAddView', enabled: hasAsm, run: () => addView() },
    ilPlay: { icon: 'play', label: 'cmd.ilPlay', enabled: () => views().length > 1, run: () => { if (!owns(editing())) begin(); return play(); } },
    ilExportSvg: { icon: 'exportFile', label: 'cmd.ilExportSvg', enabled: () => views().length > 0, run: () => { if (!owns(editing())) begin(); return exportSvg(); } },
    ilExportHtml: { icon: 'exportFile', label: 'cmd.ilExportHtml', enabled: () => views().length > 0, run: () => exportHtml() },
  };
  const api = { begin, addView, select, play, stop, exportSvg, exportHtml, svgOf: (id) => art(views().find((v) => v.id === id)), views, playing: () => Boolean(playing), toggleHidden: (compId) => pick({ bodyKey: `comp:${compId}` }), command };
  return { commands, owns, pm, pick, field, set, select: () => false, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.illustration'), finish, api };
}
