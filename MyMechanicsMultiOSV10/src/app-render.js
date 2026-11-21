// The Render command (app-std.js hands its hooks here): a picture of the current view over the graphics area,
//   Final    the progressive GPU path tracer (view/pt/pathtracer.js)
//   Preview  the fast raster accumulation (view/render.js PhotoRenderer)
// with its PropertyManager page: environment (procedural HDRs or a loaded .hdr), sun, the document's lights and
// render area lights, ground (shadow catcher with reflections, or a floor), camera (projection, field of view,
// depth of field with f-number and focus distance, focus picked on the picture), quality (resolution presets,
// samples, time limit, bounces, denoiser, caustics, firefly clamp, exposure), a render region drawn on the
// picture, the appearances of the bodies (presets, colour, roughness, metalness, transmission, IOR, emission,
// textures — stored in the part or the component, undoable) and saving the PNG through the export path.
import * as THREE from 'three';
import { PhotoRenderer, ENV_IDS, ENV_PRESETS, RESOLUTIONS, DEFAULT_RENDER, DEFAULT_AREA_LIGHT, normalizeRenderSettings, resolveResolution } from './view/render.js';
import { PathTracer, tracerCamera } from './view/pt/pathtracer.js';
import { appearanceFor, previewPbr, normalizeAppearance, APPEARANCE_IDS, APPEARANCE_PRESETS, TEXTURES } from './view/pt/appearance.js';
import { parseHdr } from './view/pt/env.js';
import { materialName } from './cad/materials.js';
import { pickWithInput } from './platform/native.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

/** Number fields of the page: [min, max, integer]. */
const NUMS = {
  samples: [1, 65536, true], timeLimit: [0, 86400], bounces: [1, 32, true], sunIntensity: [0, 10], softness: [0, 10],
  envIntensity: [0, 100], envRotation: [-360, 360], exposure: [0.01, 100], fov: [5, 120], fStop: [0.5, 64], focus: [0, 1e7],
  floorReflect: [0, 1], floorRoughness: [0, 1], denoiseStrength: [0.05, 10], clamp: [0, 1e6],
};
const AREA_NUMS = { intensity: [0, 1e5], az: [-360, 360], el: [-89, 89], distance: [0.05, 100], width: [0.01, 50], height: [0.01, 50] };
const AP_NUMS = { roughness: [0, 1], metalness: [0, 1], transmission: [0, 1], ior: [1, 3], specular: [0, 1], clearcoat: [0, 1], clearcoatRoughness: [0, 1], emissiveIntensity: [0, 1000], absorb: [0, 1e6], textureScale: [0.01, 100] };
const clampTo = ([lo, hi, int], v) => { const x = Math.max(lo, Math.min(hi, v)); return int ? Math.round(x) : x; };
const RES_LABEL = { view: null, small: '640×360', hd: '1280×720', fhd: '1920×1080', qhd: '2560×1440', uhd: '3840×2160', square: '1024²', portrait: '1080×1350' };

export function createRenderTools(ctx, { begin, editing }) {
  const { t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const part = () => ctx.activePart();
  const asm = () => ctx.activeAssembly();

  let photo = null; // preview renderer
  let tracer = null; // path tracer
  let current = null; // the one whose picture is shown
  let tracerError = null;
  let host = null;
  let job = 0;
  let customEnv = null; // { data, width, height, key, name }
  const renderSettings = structuredClone(DEFAULT_RENDER);
  /** Test hook: a function (blob, name) that receives the saved picture instead of the save dialog. */
  let saveHook = null;

  // ───────────────────────── the overlay and the picture

  function overlay() {
    const vh = ctx.viewHost();
    if (!vh) return null;
    if (!host || !host.isConnected) {
      host = document.createElement('div');
      host.className = 'render-view';
      host.innerHTML = '<div class="render-frame"><div class="render-box render-region-box" hidden></div><div class="render-box render-drag-box" hidden></div></div><div class="render-status" role="status"></div>';
      vh.append(host);
      const frame = host.querySelector('.render-frame');
      frame.addEventListener('pointerdown', onPointerDown);
      new ResizeObserver(() => drawRegionBox()).observe(frame);
    }
    return host;
  }

  function showCanvas(canvas) {
    const frame = overlay()?.querySelector('.render-frame');
    if (!frame) return;
    for (const c of frame.querySelectorAll('canvas')) if (c !== canvas) c.remove();
    if (canvas.parentElement !== frame) frame.prepend(canvas);
  }

  function hideOverlay() { photo?.stop(); tracer?.stop(); host?.remove(); host = null; job += 1; }

  /** Fractions (0…1 from the top left) of a pointer event on the picture, or null outside it. */
  function pictureAt(ev) {
    const c = current?.canvas;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { fx: (ev.clientX - r.left) / r.width, fy: (ev.clientY - r.top) / r.height, rect: r };
  }

  function onPointerDown(ev) {
    const e = editing();
    if (e?.mode !== 'render' || ev.button !== 0) return;
    const at = pictureAt(ev);
    if (!at || at.fx < 0 || at.fx > 1 || at.fy < 0 || at.fy > 1) return;
    ev.preventDefault();
    const frame = host.querySelector('.render-frame');
    if (e.tool === 'region') {
      const box = host.querySelector('.render-drag-box');
      const start = at;
      const move = (m) => {
        const p = pictureAt(m); if (!p) return;
        placeBox(box, { x0: start.fx, y0: start.fy, x1: Math.max(0, Math.min(1, p.fx)), y1: Math.max(0, Math.min(1, p.fy)) });
        box.hidden = false;
      };
      const up = (u) => {
        frame.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        box.hidden = true;
        const p = pictureAt(u) ?? start;
        setRegion({ x0: start.fx, y0: start.fy, x1: Math.max(0, Math.min(1, p.fx)), y1: Math.max(0, Math.min(1, p.fy)) });
      };
      frame.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      return;
    }
    const hit = pickAt(at.fx, at.fy);
    if (e.tool === 'focus') {
      e.tool = null;
      if (!hit) { notify('info', t('render.focusMissed')); ctx.renderLeft(); return; }
      renderSettings.focus = Math.round(hit.distance * 100) / 100; renderSettings.dof = true;
      notify('success', t('render.focusPicked', { d: ctx.fmt(renderSettings.focus, 1) }));
      ctx.renderLeft(); rerender();
      return;
    }
    if (hit) { e.selected = hit.key; ctx.renderLeft(); }
  }

  /** The body and its distance (along the view) under a point of the picture. */
  function pickAt(fx, fy) {
    const { list } = sceneBodies();
    if (current === tracer && tracer?.scene) {
      const hit = tracer.pick(fx, fy);
      return hit ? { key: list[hit.body]?.key ?? null, distance: hit.distance } : null;
    }
    const vp = ctx.viewport();
    const s = normalizeRenderSettings(renderSettings);
    const { width, height } = resolveResolution(s.resolution, vp.width, vp.height);
    const cam = tracerCamera(vp.camera, vp.target, width, height, s);
    const x = fx * 2 - 1; const y = 1 - fy * 2;
    const v = (a) => new THREE.Vector3(...a);
    let origin; let dir;
    if (cam.ortho) { origin = v(cam.position).addScaledVector(v(cam.right), x * cam.halfHeight * cam.aspect).addScaledVector(v(cam.up), y * cam.halfHeight); dir = v(cam.forward); }
    else { origin = v(cam.position); dir = v(cam.forward).addScaledVector(v(cam.right), x * cam.tanHalf * cam.aspect).addScaledVector(v(cam.up), y * cam.tanHalf).normalize(); }
    const ray = new THREE.Raycaster(origin, dir);
    let best = null;
    for (const b of list) {
      const m = new THREE.Mesh(b.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      m.matrixAutoUpdate = false; m.matrix.copy(b.matrix); m.updateMatrixWorld(true);
      const h = ray.intersectObject(m, false)[0];
      m.material.dispose();
      if (h && (!best || h.distance < best.d)) best = { d: h.distance, key: b.key, point: h.point };
    }
    return best ? { key: best.key, distance: best.point.clone().sub(origin).dot(v(cam.forward)) + (cam.ortho ? 0 : 0) } : null;
  }

  function placeBox(box, r) {
    const c = current?.canvas; const frame = host?.querySelector('.render-frame');
    if (!c || !frame) return;
    const cr = c.getBoundingClientRect(); const fr = frame.getBoundingClientRect();
    const x0 = Math.min(r.x0, r.x1); const x1 = Math.max(r.x0, r.x1); const y0 = Math.min(r.y0, r.y1); const y1 = Math.max(r.y0, r.y1);
    Object.assign(box.style, { left: `${cr.left - fr.left + x0 * cr.width}px`, top: `${cr.top - fr.top + y0 * cr.height}px`, width: `${(x1 - x0) * cr.width}px`, height: `${(y1 - y0) * cr.height}px` });
  }

  function drawRegionBox() {
    const box = host?.querySelector('.render-region-box');
    if (!box) return;
    const r = normalizeRenderSettings(renderSettings).region;
    box.hidden = !r || current !== tracer;
    if (r) placeBox(box, r);
  }

  function setRegion(r) {
    const e = editing();
    if (e) e.tool = null;
    renderSettings.region = r;
    const n = normalizeRenderSettings(renderSettings).region;
    renderSettings.region = n;
    ctx.renderLeft();
    rerender({ keepOutside: Boolean(n) });
  }

  // ───────────────────────── bodies and their appearances

  /** The part and component a viewport body shows. */
  function owners(b) {
    const pr = ctx.project();
    let comp = null;
    if (String(b.key).startsWith('comp:')) { const id = String(b.key).slice(5).split('/')[0]; comp = asm()?.components.find((c) => c.id === id) ?? null; }
    const partOf = pr?.parts.find((p) => p.id === b.partId) ?? (b.key === 'body' ? part() : null) ?? (comp?.part ? pr?.parts.find((p) => p.id === comp.part) : null) ?? null;
    return { part: partOf, comp };
  }

  /** A short content key of a geometry (the hierarchy is reused while the shapes stay the same). */
  function geometryKey(g) {
    const a = g.getAttribute('position')?.array;
    if (!a) return 'none';
    let h = a.length;
    const step = Math.max(1, Math.floor(a.length / 24));
    for (let i = 0; i < a.length; i += step) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
    return `${a.length}:${g.index?.count ?? 0}:${h}`;
  }

  /** The view's bodies with their appearances (shared geometry). */
  function sceneBodies() {
    const vp = ctx.viewport();
    const list = [];
    const box = new THREE.Box3();
    for (const b of vp?.bodies?.values() ?? []) {
      if (String(b.key).startsWith('surf:') || b.mesh.visible === false || b.ghost) continue;
      const matrix = b.mesh.matrixAutoUpdate ? b.mesh.matrixWorld.clone() : b.mesh.matrix.clone();
      const { part: p, comp } = owners(b);
      const material = p?.material ?? b.material ?? 'steel-1020';
      const appearance = appearanceFor(material, p?.color ?? null, p?.appearance, comp?.appearance);
      const geometry = b.mesh.geometry;
      geometry.key ??= geometryKey(geometry);
      list.push({ geometry, matrix, key: b.key, material, part: p, comp, name: comp?.name ?? p?.name ?? String(b.key), appearance, pbr: previewPbr(appearance) });
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox.clone().applyMatrix4(matrix));
    }
    return { list, box };
  }

  function startRender() {
    const vp = ctx.viewport();
    if (!vp || (!part() && !asm())) { notify('info', t('notice.noBody')); return; }
    begin({ mode: 'render', status: null, settings: renderSettings, selected: null, scope: 'part', tool: null });
    rerender();
  }

  /** Starts the picture over with the current settings (the region only, keeping the rest, when keepOutside). */
  async function rerender({ keepOutside = false } = {}) {
    const e = editing();
    if (e?.mode !== 'render') return undefined;
    const vp = ctx.viewport();
    const { list, box } = sceneBodies();
    if (!list.length) { notify('info', t('notice.noBody')); return undefined; }
    if (!overlay()) return undefined;
    const s = normalizeRenderSettings(renderSettings);
    const my = ++job;
    const size = resolveResolution(s.resolution, vp.width, vp.height, 4096);
    e.status = { mode: s.mode, count: 0, total: s.samples, ms: 0, done: false, preparing: true, ...size };
    updateStatus();
    let final = s.mode === 'final';
    if (final && !tracer && !tracerError) {
      try { tracer = new PathTracer(); } catch (error) { tracerError = String(error?.message ?? error); notify('warning', t('render.noPathTracer', { reason: tracerError })); }
    }
    if (final && !tracer) final = false;
    if (final) {
      photo?.stop();
      showCanvas(tracer.canvas);
      const preset = ENV_PRESETS[s.env] ?? ENV_PRESETS.studio;
      try {
        const ok = await tracer.setup({
          bodies: list, camera: vp.camera, target: vp.target, box, sceneLights: ctx.project()?.lights ?? null, preset: s.env === 'custom' ? { ...ENV_PRESETS.studio, exposure: 1 } : preset,
          settings: { ...s, env: s.env === 'custom' && customEnv ? 'custom' : s.env === 'custom' ? 'studio' : s.env, size }, custom: s.env === 'custom' ? customEnv : null, keepOutside,
        });
        if (!ok || my !== job || editing() !== e) return undefined;
      } catch (error) {
        if (my !== job) return undefined;
        if (error?.code === 'shader') {
          tracerError = String(error.message);
          notify('error', t('render.noPathTracer', { reason: tracerError }));
          renderSettings.mode = 'preview'; ctx.renderLeft();
          return rerender();
        }
        notify('error', t('render.failed', { reason: String(error?.message ?? error) }));
        Object.assign(e.status, { done: true, preparing: false }); updateStatus();
        return undefined;
      }
      current = tracer;
      Object.assign(e.status, { preparing: false, focal: tracer.cam.focalLength, focusAuto: tracer.cam.focusAuto, triangles: tracer.scene?.count ?? 0 });
      drawRegionBox();
      updateStatus();
      const at = document.querySelector('[data-render-camera]');
      if (at) at.textContent = cameraNote(e.status);
      tracer.start({
        onProgress: (p) => { if (my !== job) return; Object.assign(e.status, p); updateStatus(); },
        onDone: (p) => { if (my !== job) return; Object.assign(e.status, p, { done: true }); updateStatus(); ctx.renderLeft(); },
        onError: (msg) => { if (my !== job) return; tracerError = msg; notify('error', t('render.noPathTracer', { reason: msg })); renderSettings.mode = 'preview'; ctx.renderLeft(); rerender(); },
      });
      return undefined;
    }
    tracer?.stop();
    try { photo ??= new PhotoRenderer(); } catch { notify('error', t('render.noWebgl')); ctx.cancelEditing({ quiet: true }); return undefined; }
    showCanvas(photo.canvas);
    current = photo;
    drawRegionBox();
    const got = photo.setup({ bodies: list, camera: vp.camera, target: vp.target, box, settings: { ...s, env: ENV_PRESETS[s.env] ? s.env : 'studio', viewWidth: vp.width, viewHeight: vp.height } });
    Object.assign(e.status, { preparing: false, total: photo.settings.samples, ...got });
    updateStatus();
    photo.start({
      onProgress: (p) => { if (my !== job) return; Object.assign(e.status, p); updateStatus(); },
      onDone: (p) => { if (my !== job) return; Object.assign(e.status, p, { done: true }); updateStatus(); ctx.renderLeft(); },
    });
    return undefined;
  }

  const cameraNote = (st) => (st?.focal ? t('render.cameraNote', { f: ctx.fmt(st.focal, 0), d: ctx.fmt(st.focusAuto ?? 0, 0) }) : '');

  function updateStatus() {
    const e = editing();
    const s = e?.status;
    const el = host?.querySelector('.render-status');
    if (!s || !el) return;
    const frac = s.fraction ?? s.count / Math.max(1, s.total);
    const pct = Math.min(100, Math.round(100 * frac));
    const secs = (s.ms ?? 0) / 1000;
    const rate = secs > 0 ? s.count / secs : 0;
    const vars = { count: s.count, total: s.total, w: s.width, h: s.height, s: ctx.fmt(secs, 1), rate: ctx.fmt(rate, rate >= 10 ? 0 : 1) };
    const key = s.preparing ? 'render.preparing' : s.mode === 'final' && current === tracer ? (s.done ? 'render.donePt' : 'render.progressPt') : (s.done ? 'render.done' : 'render.progress');
    const glyph = s.done ? 'check' : s.preparing ? 'renderTimer' : current === tracer ? 'renderFinal' : 'renderPreview';
    el.innerHTML = `${icon(glyph, 'icon tiny')}<span>${escapeHtml(t(key, vars))}</span><i class="render-bar ${s.done ? 'done' : ''}"><b style="width:${s.preparing ? 0 : pct}%"></b></i><span class="render-pct">${s.preparing ? '' : `${pct}%`}</span>`;
    const out = document.querySelector('[data-render-progress]');
    if (out) out.textContent = `${s.count} / ${s.total}`;
  }

  async function saveRender() {
    if (!current) return false;
    current.show({ fresh: true });
    const blob = await current.toBlob();
    const name = `${ctx.fileSafe(ctx.activeName() || 'render')}-render.png`;
    if (saveHook) { saveHook(blob, name); notify('success', t('notice.exported', { name })); return true; }
    return ctx.saveExport(name, 'png', blob, 'image/png');
  }

  // ───────────────────────── appearances

  function selectedBody(e = editing()) {
    const { list } = sceneBodies();
    return list.find((b) => b.key === e?.selected) ?? null;
  }

  /** Changes (field = null: resets) the appearance of the selected body's part or component, undoably. */
  function setAppearance(field, value) {
    const e = editing();
    const b = selectedBody(e);
    if (!b) { notify('info', t('render.selectBody')); return; }
    const toComp = e.scope === 'component' && b.comp;
    const partId = b.part?.id; const compId = b.comp?.id; const asmId = asm()?.id;
    ctx.change('op.appearance', (p) => {
      const target = toComp ? p.assemblies.find((a) => a.id === asmId)?.components.find((c) => c.id === compId) : p.parts.find((x) => x.id === partId);
      if (!target) return;
      let next;
      if (field === null) next = null;
      else if (field === 'preset') {
        const keep = APPEARANCE_PRESETS[value]?.color ? {} : { color: target.appearance?.color };
        next = normalizeAppearance({ ...keep, preset: value, image: target.appearance?.image });
      } else next = normalizeAppearance({ ...(target.appearance ?? {}), [field]: value });
      if (next) target.appearance = next; else delete target.appearance;
    });
    ctx.renderLeft();
    rerender();
  }

  async function loadImage(dataUrl = null) {
    let url = dataUrl;
    if (!url) {
      const [file] = await pickWithInput('image/png,image/jpeg,image/webp,image/gif,image/bmp');
      if (!file) return;
      url = await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => resolve(null); fr.readAsDataURL(file); });
      if (!url) return;
      url = await shrinkImage(url);
    }
    const e = editing();
    if (!selectedBody(e)) { notify('info', t('render.selectBody')); return; }
    const b = selectedBody(e);
    const toComp = e.scope === 'component' && b.comp;
    const partId = b.part?.id; const compId = b.comp?.id; const asmId = asm()?.id;
    ctx.change('op.appearance', (p) => {
      const target = toComp ? p.assemblies.find((a) => a.id === asmId)?.components.find((c) => c.id === compId) : p.parts.find((x) => x.id === partId);
      if (target) target.appearance = normalizeAppearance({ ...(target.appearance ?? {}), image: url, texture: 'image' });
    });
    ctx.renderLeft();
    rerender();
  }

  /** A picture at most 1024 px wide as a JPEG data URL (documents keep the texture). */
  async function shrinkImage(url) {
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { return url; }
    const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  }

  async function loadHdr(buffer = null, name = '') {
    let buf = buffer; let label = name;
    if (!buf) {
      const [file] = await pickWithInput('.hdr');
      if (!file) return;
      buf = await file.arrayBuffer(); label = file.name;
    }
    try {
      const map = parseHdr(buf);
      customEnv = { ...map, key: `${label}:${buf.byteLength}`, name: label || 'HDR' };
    } catch (error) { notify('error', t('render.hdrBad', { reason: String(error?.message ?? error) })); return; }
    renderSettings.env = 'custom';
    notify('success', t('render.hdrLoaded', { name: customEnv.name, w: customEnv.width, h: customEnv.height }));
    ctx.renderLeft();
    rerender();
  }

  // ───────────────────────── the PropertyManager page

  function pm(e) {
    const { pmHead, pmGroup, pmSeg, pmNum, pmButton } = ctx.pm;
    const s = normalizeRenderSettings(renderSettings);
    const st = e.status;
    const check = (key, on, label, glyph) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
    const note = (text, attr = '') => `<p class="pm-note" ${attr}>${escapeHtml(text)}</p>`;
    const color = (key, value, label) => `<label class="pm-field">${icon('palette')}<span class="pm-label">${escapeHtml(label)}</span><input type="color" data-pm-field="${escapeHtml(key)}" value="${escapeHtml(value)}"/></label>`;
    const select = (key, options, value, label, glyph) => `<label class="pm-field">${icon(glyph)}<span class="pm-label">${escapeHtml(label)}</span><select data-pm-select="${escapeHtml(key)}">${options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${String(v) === String(value) ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></label>`;
    const final = s.mode === 'final';
    const envs = [...ENV_IDS.map((id) => [id, t(`render.env.${id}`)]), ...(customEnv ? [['custom', customEnv.name]] : [])];
    // Lights
    const sceneLightCount = (ctx.project()?.lights?.lights ?? []).filter((l) => l.on !== false).length;
    const areas = s.areaLights.map((a, i) => `<div class="render-light"><div class="render-light-head">${check(`al:${a.id}:on`, a.on, t('render.areaLight', { n: i + 1 }), 'areaLight')}<input type="color" data-pm-field="al:${escapeHtml(a.id)}:color" value="${escapeHtml(a.color)}" title="${escapeHtml(t('render.al.color'))}"/><button class="icon-button" data-pm="std.renderDelLight:${escapeHtml(a.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>${['intensity', 'az', 'el', 'distance', 'width', 'height'].map((k) => pmNum(`al:${a.id}:${k}`, a[k], t(`render.al.${k}`), k === 'intensity' ? 'sun' : k === 'az' || k === 'el' ? 'dimAngle' : 'smartDim')).join('')}</div>`).join('');
    // Appearances
    const { list } = sceneBodies();
    const rows = list.slice(0, 200).map((b, i) => `<button class="render-body ${e.selected === b.key ? 'active' : ''}" data-pm="std.renderSelect:${i}" title="${escapeHtml(b.name)}"><i class="route-swatch" style="--swatch:${escapeHtml(b.appearance.color)}"></i><span>${escapeHtml(b.name)}</span><small>${escapeHtml(t(`render.class.${b.appearance.class}`))}${b.part?.appearance || b.comp?.appearance ? ' ✎' : ''}</small></button>`).join('');
    const sel = list.find((b) => b.key === e.selected);
    let editor = note(t('render.selectBody'));
    if (sel) {
      const a = sel.appearance;
      const own = (e.scope === 'component' && sel.comp ? sel.comp.appearance : sel.part?.appearance) ?? {};
      editor = [
        `<p class="pm-note"><b>${escapeHtml(sel.name)}</b> · ${escapeHtml(materialName(sel.material, ctx.lang()))}</p>`,
        sel.comp ? `<div class="pm-row">${pmSeg('ap.scope', [['part', t('render.scope.part')], ['component', t('render.scope.component')]], e.scope)}</div>` : '',
        select('ap.preset', APPEARANCE_IDS.map((id) => [id, t(`render.preset.${id}`)]), own.preset ?? 'auto', t('render.preset'), 'appearance'),
        color('ap.color', a.color, t('render.ap.color')),
        ...['roughness', 'metalness', 'transmission', 'ior', 'clearcoat'].map((k) => pmNum(`ap.${k}`, Math.round(a[k] * 1000) / 1000, t(`render.ap.${k}`), k === 'ior' ? 'renderFinal' : 'material')),
        a.transmission > 0 ? pmNum('ap.absorb', a.absorb, t('render.ap.absorb'), 'smartDim') : '',
        color('ap.emissive', a.emissive, t('render.ap.emissive')),
        pmNum('ap.emissiveIntensity', a.emissiveIntensity, t('render.ap.emissiveIntensity'), 'bulb'),
        select('ap.texture', TEXTURES.map((id) => [id, t(`render.texture.${id}`)]), a.texture, t('render.ap.texture'), 'texture'),
        a.texture !== 'none' ? pmNum('ap.textureScale', a.textureScale, t('render.ap.textureScale'), 'texture') : '',
        `<div class="pm-row">${pmButton('std.renderLoadImage', 'imageBg', t('render.loadImage'))}${a.image ? pmButton('std.renderClearImage', 'imageClear', t('render.clearImage')) : ''}${pmButton('std.renderAppReset', 'refresh', t('render.ap.reset'))}</div>`,
      ].join('');
    }
    const region = s.region ? t('render.regionOn', { x0: Math.round(s.region.x0 * 100), y0: Math.round(s.region.y0 * 100), x1: Math.round(s.region.x1 * 100), y1: Math.round(s.region.y1 * 100) }) : t('render.regionOff');
    return [
      pmHead('renderView', t('cmd.renderView'), t('pm.help.renderView')),
      pmGroup('renderFinal', t('render.mode'), `${pmSeg('mode', [['final', t('render.mode.final'), 'renderFinal'], ['preview', t('render.mode.preview'), 'renderPreview']], s.mode)}${note(t(final ? 'render.mode.finalNote' : 'render.mode.previewNote'))}${tracerError ? note(t('render.noPathTracer', { reason: tracerError })) : ''}`),
      pmGroup('environment', t('render.environment'), `${pmSeg('env', envs, s.env)}<div class="pm-row">${pmButton('std.renderLoadHdr', 'hdrLoad', t('render.loadHdr'))}</div>${pmNum('envIntensity', s.envIntensity, t('render.envIntensity'), 'sun')}${pmNum('envRotation', s.envRotation, t('render.envRotation'), 'dimAngle')}${pmSeg('background', [['env', t('render.bg.env')], ['white', t('render.bg.white')], ['transparent', t('render.bg.transparent')]], s.background)}`),
      pmGroup('sun', t('render.lighting'), `${pmNum('sunIntensity', s.sunIntensity, t('render.sunIntensity'), 'sun')}${pmNum('softness', s.softness, t('render.softness'), 'groundShadow')}${final ? `${check('sceneLights', s.sceneLights, t('render.sceneLights', { n: sceneLightCount }), 'bulb')}${areas || note(t('render.al.none'))}<div class="pm-row">${pmButton('std.renderAddLight', 'areaLight', t('render.addAreaLight'))}</div>` : ''}`),
      pmGroup('groundShadow', t('render.groundBg'), `${pmSeg('ground', [['shadow', t('render.ground.shadow')], ['floor', t('render.ground.floor')], ['none', t('render.ground.none')]], s.ground)}${final && s.ground === 'shadow' ? check('reflections', s.reflections, t('render.reflections'), 'groundShadow') : ''}${final && (s.ground === 'floor' || s.reflections) && s.ground !== 'none' ? `${pmNum('floorReflect', s.floorReflect, t('render.floorReflect'), 'groundShadow')}${pmNum('floorRoughness', s.floorRoughness, t('render.floorRoughness'), 'groundShadow')}` : ''}`),
      pmGroup('cameraLens', t('render.camera'), `${final ? pmSeg('projection', [['view', t('render.projection.view')], ['perspective', t('render.projection.perspective')], ['orthographic', t('render.projection.orthographic')]], s.projection) : ''}${final ? pmNum('fov', s.fov, t('render.fov'), 'dimAngle') : ''}${check('dof', s.dof, t('render.dofOn'), 'depthOfField')}${s.dof ? `${pmNum('fStop', s.fStop, t('render.fStop'), 'depthOfField')}${pmNum('focus', s.focus, t('render.focus'), 'smartDim', 'mm')}${note(t('render.focusAuto'))}<div class="pm-row">${pmButton('std.renderFocusPick', 'focusPick', t('render.pickFocus'), e.tool === 'focus' ? 'active' : '')}</div>` : ''}${note(cameraNote(st), 'data-render-camera')}`),
      pmGroup('resolution', t('render.quality'), `${select('resolution', Object.keys(RESOLUTIONS).map((k) => [k, RES_LABEL[k] ?? t('render.res.view')]), s.resolution, t('render.resolution'), 'resolution')}${pmNum('samples', s.samples, t('render.samples'), 'resolution')}${final ? `${pmNum('timeLimit', s.timeLimit, t('render.timeLimit'), 'renderTimer')}${pmNum('bounces', s.bounces, t('render.bounces'), 'bounces')}${check('denoise', s.denoise, t('render.denoise'), 'denoise')}${s.denoise ? pmNum('denoiseStrength', s.denoiseStrength, t('render.denoiseStrength'), 'denoise') : ''}${pmSeg('caustics', [['fast', t('render.caustics.fast')], ['physical', t('render.caustics.physical')]], s.caustics)}${pmNum('clamp', s.clamp, t('render.clamp'), 'sparkles')}` : ''}${pmNum('exposure', s.exposure, t('render.exposure'), 'sun')}${final ? pmSeg('tone', [['aces', t('render.tone.aces')], ['linear', t('render.tone.linear')]], s.tone) : ''}`),
      final ? pmGroup('renderRegion', t('render.region'), `${note(region)}<div class="pm-row">${pmButton('std.renderRegion', 'renderRegion', t('render.drawRegion'), e.tool === 'region' ? 'active' : '')}${pmButton('std.renderRegionClear', 'renderRegionClear', t('render.clearRegion'))}</div>${e.tool === 'region' ? note(t('render.regionHint')) : ''}`) : '',
      pmGroup('appearance', t('render.appearances'), `${note(t('render.pickHint'))}<div class="render-bodies">${rows}</div>${editor}`),
      pmGroup('renderView', t('render.output'), `<p class="pm-note">${escapeHtml(t('render.samplesDone'))}: <b data-render-progress>${st ? `${st.count} / ${st.total}` : '—'}</b></p><div class="pm-row">${pmButton('std.render', 'play', t('render.restart'), 'primary')}${pmButton('std.renderStop', 'stop', t('render.stop'))}${pmButton('std.renderSave', 'renderSave', t('render.save'))}</div>`),
    ].join('');
  }

  // ───────────────────────── PropertyManager hooks

  function field(key, raw, v) {
    const e = editing();
    const text = String(raw ?? '').trim();
    if (key.startsWith('ap.')) {
      const f = key.slice(3);
      if (f === 'color' || f === 'emissive') return setAppearance(f, text);
      if (AP_NUMS[f]) { if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return undefined; } return setAppearance(f, clampTo(AP_NUMS[f], v)); }
      return undefined;
    }
    if (key.startsWith('al:')) {
      const [, id, f] = key.split(':');
      const a = (renderSettings.areaLights ?? []).find((x) => x.id === id);
      if (!a) return undefined;
      if (f === 'color') a.color = text;
      else if (AREA_NUMS[f]) { if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return undefined; } a[f] = clampTo(AREA_NUMS[f], v); }
      ctx.renderLeft(); rerender();
      return undefined;
    }
    if (!NUMS[key]) return undefined;
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return undefined; }
    renderSettings[key] = clampTo(NUMS[key], v);
    if (e && key === 'focus') e.tool = null;
    ctx.renderLeft();
    rerender();
    return undefined;
  }

  function step(key, delta) {
    let cur;
    if (key.startsWith('ap.')) cur = selectedBody()?.appearance?.[key.slice(3)];
    else if (key.startsWith('al:')) { const [, id, f] = key.split(':'); cur = renderSettings.areaLights.find((x) => x.id === id)?.[f]; }
    else cur = renderSettings[key];
    if (!Number.isFinite(Number(cur))) return;
    const c = Number(cur);
    const small = ['roughness', 'metalness', 'transmission', 'clearcoat', 'clearcoatRoughness', 'specular', 'floorReflect', 'floorRoughness'].some((k) => key.endsWith(k));
    const inc = small ? 0.05 : key.endsWith('ior') ? 0.01 : key === 'fStop' ? (c >= 4 ? 1 : 0.1) : key === 'envRotation' || key.endsWith(':az') || key.endsWith(':el') ? 15 : key === 'samples' ? (c >= 256 ? 64 : 16) : c >= 20 ? 5 : 1;
    const nv = Math.round((c + delta * inc) * 1000) / 1000;
    field(key, String(nv), nv);
  }

  function set(key, value) {
    const e = editing();
    if (key === 'ap.scope') { e.scope = value === 'component' ? 'component' : 'part'; ctx.renderLeft(); return; }
    renderSettings[key] = value;
    if (key === 'mode' && value === 'final' && tracerError) { tracerError = null; tracer = null; }
    ctx.renderLeft();
    rerender();
  }

  function toggle(key, checked) {
    if (key.startsWith('al:')) {
      const [, id] = key.split(':');
      const a = renderSettings.areaLights.find((x) => x.id === id);
      if (a) a.on = checked;
    } else renderSettings[key] = checked;
    ctx.renderLeft();
    rerender();
  }

  /** Selects (data-pm-select) of the page: true when handled. */
  function select(key, value) {
    if (key === 'ap.preset') { setAppearance('preset', value); return true; }
    if (key === 'ap.texture') { setAppearance('texture', value); return true; }
    if (key === 'resolution') { renderSettings.resolution = value; renderSettings.region = null; ctx.renderLeft(); rerender(); return true; }
    return false;
  }

  function cleanup() { hideOverlay(); }

  const COMMANDS = new Set(['std.render', 'std.renderStop', 'std.renderSave', 'std.renderLoadHdr', 'std.renderAddLight', 'std.renderDelLight', 'std.renderRegion', 'std.renderRegionClear', 'std.renderFocusPick', 'std.renderSelect', 'std.renderAppReset', 'std.renderLoadImage', 'std.renderClearImage']);
  const handles = (name) => COMMANDS.has(name);

  function command(name, arg) {
    const e = editing();
    if (name === 'std.render') return rerender();
    if (name === 'std.renderStop') { current?.stop(); if (e?.status) { e.status.done = true; updateStatus(); } return undefined; }
    if (name === 'std.renderSave') return saveRender();
    if (name === 'std.renderLoadHdr') return loadHdr();
    if (e?.mode !== 'render') return undefined;
    if (name === 'std.renderAddLight') {
      const n = renderSettings.areaLights.length;
      if (n >= 8) return undefined;
      const ids = new Set(renderSettings.areaLights.map((a) => a.id));
      let k = n + 1; while (ids.has(`area${k}`)) k += 1;
      renderSettings.areaLights.push({ ...DEFAULT_AREA_LIGHT, id: `area${k}`, az: (DEFAULT_AREA_LIGHT.az + n * 120) % 360 });
      ctx.renderLeft(); return rerender();
    }
    if (name === 'std.renderDelLight') { renderSettings.areaLights = renderSettings.areaLights.filter((a) => a.id !== arg); ctx.renderLeft(); return rerender(); }
    if (name === 'std.renderRegion') { e.tool = e.tool === 'region' ? null : 'region'; return ctx.renderLeft(); }
    if (name === 'std.renderRegionClear') { setRegion(null); return undefined; }
    if (name === 'std.renderFocusPick') { e.tool = e.tool === 'focus' ? null : 'focus'; renderSettings.dof = true; return ctx.renderLeft(); }
    if (name === 'std.renderSelect') { const b = sceneBodies().list[Number(arg)]; e.selected = b?.key ?? null; return ctx.renderLeft(); }
    if (name === 'std.renderAppReset') return setAppearance(null);
    if (name === 'std.renderLoadImage') return loadImage();
    if (name === 'std.renderClearImage') return clearImage();
    return undefined;
  }

  function clearImage() {
    const e = editing(); const b = selectedBody(e);
    if (!b) return undefined;
    const toComp = e.scope === 'component' && b.comp;
    const partId = b.part?.id; const compId = b.comp?.id; const asmId = asm()?.id;
    ctx.change('op.appearance', (p) => {
      const target = toComp ? p.assemblies.find((a) => a.id === asmId)?.components.find((c) => c.id === compId) : p.parts.find((x) => x.id === partId);
      if (!target?.appearance) return;
      const { image, ...rest } = target.appearance;
      const next = normalizeAppearance({ ...rest, texture: rest.texture === 'image' ? 'none' : rest.texture });
      if (next) target.appearance = next; else delete target.appearance;
    });
    ctx.renderLeft();
    return rerender();
  }

  return {
    startRender, rerender, saveRender, pm, field, step, set, toggle, select, cleanup, handles, command, pickAt, sceneBodies,
    get photo() { return current ?? photo; },
    get preview() { return photo; },
    get tracer() { return tracer; },
    get renderSettings() { return renderSettings; },
    setSaveHook(fn) { saveHook = fn; },
    /** Test hooks: a loaded .hdr environment and an image texture without file dialogs. */
    setEnvironmentHdr: (buffer, name = 'test.hdr') => loadHdr(buffer, name),
    setAppearanceImage: (dataUrl) => loadImage(dataUrl),
    setAppearance: (fieldName, value) => setAppearance(fieldName, value),
    /** Test scenes (glass, metal, shadow, convergence) built from plain geometry: view/pt/lab.js. */
    lab: () => import('./view/pt/lab.js'),
  };
}
