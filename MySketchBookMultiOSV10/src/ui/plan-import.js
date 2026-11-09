// File › Import floor plan…: CAD drawings (DXF, SVG) become walls, doors, windows
// and rooms; pictures (PNG, JPG, WebP, BMP, GIF) become an underlay on the floor
// to trace over, scaled with a two-point calibration and optionally read by the
// automatic wall detection (plan-image.js).
//
// app.js hands over the few things this needs (createPlanImport(app)); the parsing
// and recognition are pure modules in src/io (plan-dxf, plan-svg, plan-recognize,
// plan-build, plan-image), the underlay drawing is src/engine/underlay.js.
import * as THREE from 'three';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatLength, newId, parseLength, toUnits } from '../engine/document.js';
import { readDxf, flattenDxf, dxfUnits, extentOf, dxfToPlan, layerStats, SKIP_LAYER } from '../io/plan-dxf.js';
import { readSvgPlan, svgUnits, svgToPlan } from '../io/plan-svg.js';
import { recognizePlan } from '../io/plan-recognize.js';
import { applyPlan, floorForName } from '../io/plan-build.js';
import { detectImageWalls, MAX_DETECT_SIZE } from '../io/plan-image.js';
import { dwgToDxf, dwgVersion, isDwgName, desktopDwgConverter, wasmDwgConverter } from '../io/plan-dwg.js';
import { libraryUrl } from '../library/environments.js';
import { UnderlayLayer, underlayToPlan, planToUnderlay } from '../engine/underlay.js';

export const PLAN_ACCEPT = '.dxf,.dwg,.svg,.png,.jpg,.jpeg,.webp,.bmp,.gif';
export const isPlanName = (name) => /\.(dxf|dwg|svg)$/i.test(name ?? '');

/**
 * DWG → DXF bytes: the converter installed on the computer (desktop), else LibreDWG WebAssembly when it was put
 * into library/dwg (optional, GPL — see io/plan-dwg.js). Neither → an error that says what to install.
 */
export async function convertDwg(app, name, bytes) {
  const converters = [];
  if (app.desktop && app.native?.invoke) converters.push(desktopDwgConverter(app.native.invoke));
  converters.push(wasmDwgConverter({
    load: async () => { const m = await import(/* @vite-ignore */ libraryUrl('dwg/libredwg-web.js')); return m.default ?? m.createModule; },
    locate: (file) => libraryUrl(`dwg/${file}`),
  }));
  try {
    return (await dwgToDxf(bytes, { converters })).dxf;
  } catch (error) {
    if (error.code !== 'dwg-unavailable') throw error;
    const release = error.version?.release ?? dwgVersion(bytes)?.release ?? 'DWG';
    const detail = (error.tried ?? []).filter((x) => x.error !== 'not available').map((x) => `${x.name}: ${x.error}`).join('\n');
    throw Object.assign(new Error(t(app.desktop ? 'plan.dwgHelpDesktop' : 'plan.dwgHelpWeb', { name, release }) + (detail ? `\n\n${detail}` : '')), { code: 'dwg-unavailable' });
  }
}
export const isPlanImageName = (name) => /\.(png|jpe?g|webp|bmp|gif)$/i.test(name ?? '');
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' };
const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name ?? '')?.[1] ?? '').toLowerCase();
const stem = (name) => String(name ?? '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

/** Reads a CAD plan (DXF or SVG bytes) → { kind, plan (metres, plan axes), units, layers, doc }. */
export function readPlanFile(name, bytes, { units = 'auto', layers = null } = {}) {
  if (/\.svg$/i.test(name)) {
    const svg = readSvgPlan(new TextDecoder('utf-8').decode(bytes));
    const u = svgUnits(svg, units);
    const keep = (x) => !layers || layers.includes(x.layer || '0');
    const filtered = { lines: svg.lines.filter(keep), arcs: svg.arcs.filter(keep), texts: svg.texts };
    const names = [...new Set([...svg.lines, ...svg.arcs].map((x) => x.layer || '0'))];
    return { kind: 'svg', plan: svgToPlan(filtered, u.metres), units: u, layers: names.map((n) => ({ name: n, lines: svg.lines.filter((l) => (l.layer || '0') === n).length, arcs: svg.arcs.filter((a) => (a.layer || '0') === n).length, texts: 0, off: false })) };
  }
  const doc = readDxf(bytes);
  const stats = layerStats(doc);
  const chosen = layers ? new Set(layers) : new Set(stats.filter((l) => !l.off && !SKIP_LAYER.test(l.name)).map((l) => l.name));
  const flat = flattenDxf(doc, { layers: chosen });
  const u = dxfUnits(doc, extentOf(flattenDxf(doc)).size, units);
  return { kind: 'dxf', plan: dxfToPlan(flat, u.metres), units: u, layers: stats, doc };
}

/** Decodes picture bytes (browser): { width, height, bitmap }. */
async function decodeImage(bytes, mime) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  return { width: bitmap.width, height: bitmap.height, bitmap };
}

export function createPlanImport(app) {
  let layer = null; // UnderlayLayer (made with the viewport)
  let calib = null; // { id, points: [], level }

  const layerOf = () => {
    const vp = app.viewport();
    if (!vp) return null;
    if (!layer || layer.viewport !== vp) layer = new UnderlayLayer(vp);
    return layer;
  };

  /** Keeps the underlays in line with the project (app.js calls it from syncScene). */
  function sync() {
    const d = app.doc();
    const l = layerOf();
    if (!d || !l) return;
    d.project.underlays ??= [];
    l.sync(d.project, { assets: d.assets, levelMode: app.levelMode(d.project) });
  }

  // ───────────────────────── dialog

  async function dialog() {
    try {
      if (app.desktop) {
        const paths = await app.native.chooseFiles(app.settings().lastDirectory, [{ name: t('plan.filter'), extensions: PLAN_ACCEPT.replace(/\./g, '').split(',') }], false);
        if (paths.length) await importFiles([{ name: paths[0].replace(/^.*[\\/]/, ''), path: paths[0] }]);
      } else {
        const files = await app.native.pickWithInput(PLAN_ACCEPT, false);
        if (files.length) await importFiles([{ name: files[0].name, bytes: new Uint8Array(await files[0].arrayBuffer()) }]);
      }
    } catch (error) { app.showError('error.importPlan', error); }
  }

  /** Files dropped, opened or chosen: the first plan or picture is imported (with its options asked). */
  async function importFiles(files) {
    const file = files.find((f) => isPlanName(f.name) || isPlanImageName(f.name));
    if (!file) return null;
    try {
      const bytes = file.bytes ?? await app.readBytes(file.path);
      return isPlanName(file.name) ? await importPlan(file.name, bytes) : await importImage(file.name, bytes);
    } catch (error) { app.showError('error.importPlan', error, file.name); return null; }
  }

  // ───────────────────────── CAD plans

  /**
   * DXF / SVG → walls, doors, windows, rooms. `options` skips the popup (tests): { units, layers, wallHeight,
   * thickness, walls: 'auto' | 'pairs' | 'single', target: 'replace' | 'level' | 'new', keepLines }.
   */
  async function importPlan(name, source, options = null) {
    // DWG: converted to DXF first (read as DXF from here on).
    const bytes = isDwgName(name) ? await app.withProgress('progress.convertDwg', name, () => convertDwg(app, name, source), { delay: 150 }) : source;
    const first = readPlanFile(name, bytes);
    const settings = app.settings();
    const hasWalls = Boolean(app.project()?.walls.length);
    let o = options;
    if (!o) {
      o = await app.popups.open('importplan', {
        mode: 'cad', name, units: 'auto', detected: first.units.units, guessed: first.units.guessed,
        layers: first.layers.map((l) => ({ name: l.name, lines: l.lines, arcs: l.arcs, texts: l.texts, on: !l.off && !SKIP_LAYER.test(l.name) })),
        wallHeight: settings.defaultWallHeight || 2.4, thickness: settings.defaultWallThickness || 0.15, walls: 'auto',
        target: !app.project() ? 'new' : hasWalls ? 'level' : 'replace', keepLines: true, hasProject: Boolean(app.project()),
      });
      if (!o?.ok) return null;
    }
    const read = readPlanFile(name, bytes, { units: o.units ?? 'auto', layers: o.layers ?? null });
    const result = recognizePlan(read.plan, { mode: o.walls ?? 'auto', defaultThickness: Number(o.thickness) || 0.15 });
    result.texts = read.plan.texts;
    if (!result.walls.length) { app.notify('error', t('notice.planEmpty', { name })); return { result, applied: null }; }
    if ((o.target ?? 'replace') === 'new' || !app.project()) app.newProject('empty');
    const target = o.target === 'level' ? 'level' : 'replace';
    const applied = app.change('op.importPlan', (p) => applyPlan(p, result, { target, wallHeight: Number(o.wallHeight) || null, keepLeftovers: o.keepLines !== false, levelName: stem(name) }), null);
    app.afterImport?.(applied);
    app.notify('success', t('notice.planImported', { name, walls: applied.walls, doors: applied.doors, windows: applied.windows, rooms: applied.rooms }));
    return { result, applied, units: read.units };
  }

  // ───────────────────────── pictures

  /** A picture → an underlay on the active level (options skip the popup: { width (m), opacity, target, calibrate, detect }). */
  async function importImage(name, bytes, options = null) {
    const mime = MIME[extOf(name)] ?? 'image/png';
    const { width, height, bitmap } = await decodeImage(bytes, mime);
    bitmap.close?.();
    let o = options;
    if (!o) {
      o = await app.popups.open('importplan', { mode: 'image', name, pixels: `${width} × ${height}`, imageWidth: 12, opacity: 0.6, target: app.project() ? 'level' : 'new', calibrate: true, detect: false, hasProject: Boolean(app.project()) });
      if (!o?.ok) return null;
    }
    if (o.target === 'new' || !app.project()) app.newProject('empty');
    const d = app.doc();
    const id = newId('ul');
    const asset = newId('as');
    const scale = (Number(o.imageWidth) || 12) / width;
    const level = d.project.activeLevel;
    // Centred on what is drawn on the level already, else on the origin.
    const walls = d.project.walls.filter((w) => w.level === level);
    const xs = walls.flatMap((w) => [w.a[0], w.b[0]]); const zs = walls.flatMap((w) => [w.a[1], w.b[1]]);
    const position = xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] : [0, 0];
    d.assets.set(asset, bytes);
    app.change('op.importPlan', (p) => {
      p.assets[asset] = { name: stem(name), ext: extOf(name) === 'jpeg' ? 'jpg' : extOf(name) || 'png', mime, kind: 'underlay', pixels: [width, height] };
      p.underlays ??= [];
      p.underlays.push({ id, level, asset, name: stem(name), width, height, position, rotation: 0, scale, opacity: Number(o.opacity ?? 0.6), hidden: false });
    }, null);
    app.notify('success', t('notice.underlayAdded', { name }));
    app.focusUnderlay?.(id);
    frame(id);
    if (o.calibrate) startCalibration(id, { detectAfter: Boolean(o.detect) });
    else if (o.detect) await detectWalls(id);
    return { id, asset, width, height };
  }

  const underlay = (id) => app.project()?.underlays?.find((u) => u.id === id) ?? null;

  /** Zooms the view to an underlay (the content box leaves helpers out, so Zoom extents alone would miss it). */
  function frame(id) {
    const vp = app.viewport();
    const root = layerOf()?.items.get(id)?.root;
    if (!vp || !root) return;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const walls = vp.contentBox();
    if (!walls.isEmpty()) box.union(walls);
    vp.zoomExtents(box);
  }

  /** Rescales an underlay so that plan points p1 and p2 are `metres` apart; p1 stays where it is. */
  function calibrateWith(id, p1, p2, metres) {
    const u = underlay(id);
    const measured = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (!u || !(measured > 1e-6) || !(metres > 0)) return false;
    app.change('op.underlay', () => {
      const pixel = planToUnderlay(u, p1);
      u.scale *= metres / measured;
      const now = underlayToPlan(u, pixel);
      u.position = [u.position[0] + p1[0] - now[0], u.position[1] + p1[1] - now[1]];
    }, ['underlays']);
    app.notify('success', t('underlay.calibrated', { length: formatLength(metres, app.units()) }));
    return true;
  }

  // Two clicks on the floor (any tool is paused), then the real distance is asked.
  function startCalibration(id, { detectAfter = false } = {}) {
    stopCalibration();
    const u = underlay(id);
    const vp = app.viewport();
    if (!u || !vp) return;
    if (!app.planView()) app.setPlanView(true);
    const level = app.project().levels.find((l) => l.id === u.level);
    calib = { id, points: [], elevation: level?.elevation ?? 0, detectAfter };
    const ground = (e) => vp.screenToWorldOnPlane(e.clientX, e.clientY, new THREE.Vector3(0, calib.elevation, 0), new THREE.Vector3(0, 1, 0));
    const draw = (cursor = null) => {
      const pts = calib.points.map((p) => new THREE.Vector3(p[0], calib.elevation + 0.01, p[1]));
      if (cursor && pts.length === 1) pts.push(cursor);
      app.overlay()?.points('plan-calib-pts', pts, { color: '#e0352b', size: 11 });
      app.overlay()?.lines('plan-calib', pts.length === 2 ? pts : [], { color: '#e0352b' });
      vp.requestRender();
    };
    calib.down = async (e) => {
      if (e.button !== 0 || e.target !== vp.canvas) return;
      e.stopPropagation(); e.preventDefault();
      const p = ground(e);
      if (!p) return;
      calib.points.push([p.x, p.z]);
      draw();
      if (calib.points.length < 2) { app.notify('info', t('underlay.calibrateSecond')); return; }
      const [p1, p2] = calib.points;
      const measured = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const after = calib.detectAfter;
      stopCalibration({ keepMarks: true });
      const answer = await app.popups.open('prompt', { title: t('underlay.distanceTitle'), label: t('underlay.distanceLabel', { units: app.units() }), value: String(Number(toUnits(measured, app.units()).toFixed(app.units() === 'mm' ? 0 : 3))), icon: 'tapeMeasure' });
      app.overlay()?.clear('plan-calib'); app.overlay()?.clear('plan-calib-pts');
      const v = answer?.value != null ? parseLength(String(answer.value).replace(/(\d),(?=\d{3}(?!\d))/g, '$1'), app.units()) : null;
      const metres = Array.isArray(v) ? v[0] : v;
      if (metres > 0) calibrateWith(id, p1, p2, metres);
      if (after) await detectWalls(id);
    };
    calib.move = (e) => { if (e.target !== vp.canvas || !calib.points.length) return; const p = ground(e); if (p) draw(new THREE.Vector3(p.x, calib.elevation + 0.01, p.z)); };
    calib.key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stopCalibration(); app.notify('info', t('underlay.calibrateCancelled')); } };
    window.addEventListener('pointerdown', calib.down, true);
    window.addEventListener('pointermove', calib.move, true);
    window.addEventListener('keydown', calib.key, true);
    app.notify('info', t('underlay.calibrateHint'));
  }

  function stopCalibration({ keepMarks = false } = {}) {
    if (!calib) return;
    window.removeEventListener('pointerdown', calib.down, true);
    window.removeEventListener('pointermove', calib.move, true);
    window.removeEventListener('keydown', calib.key, true);
    if (!keepMarks) { app.overlay()?.clear('plan-calib'); app.overlay()?.clear('plan-calib-pts'); }
    calib = null;
  }

  /**
   * Automatic wall detection on an underlay picture: walls, doors and windows on its level (one undo step),
   * then asks to keep them. `ask: false` keeps them without asking (tests). Returns the counts.
   */
  async function detectWalls(id, { ask = true } = {}) {
    const u = underlay(id);
    const d = app.doc();
    const bytes = u && d?.assets.get(u.asset);
    if (!bytes) return null;
    const result = await app.withProgress('progress.detectWalls', u.name, async () => {
      const { bitmap } = await decodeImage(bytes, d.project.assets[u.asset]?.mime ?? 'image/png');
      const k = Math.min(1, MAX_DETECT_SIZE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * k)); const h = Math.max(1, Math.round(bitmap.height * k));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      // Picture metres of the shrunk picture → original pixels → plan.
      const mpp = (u.scale * bitmap.width) / w;
      bitmap.close?.();
      const pixels = ctx.getImageData(0, 0, w, h);
      const found = detectImageWalls({ data: pixels.data, width: w, height: h }, { metresPerPixel: mpp });
      const toPlan = (p) => underlayToPlan(u, [p[0] / u.scale, p[1] / u.scale]);
      return { ...found, walls: found.walls.map((x) => ({ ...x, a: toPlan(x.a), b: toPlan(x.b) })), leftovers: [], texts: [] };
    }, { delay: 150 });
    if (!result.walls.length) { app.notify('error', t('underlay.detectNone')); return { walls: 0 }; }
    const level = app.project().activeLevel;
    // Pictures carry no room labels the app can read (no OCR): rooms get a name from size and shape, listed in the
    // underlay's panel to be renamed.
    const roomNames = (key, n) => { const base = t(`plan.roomGuess.${key}`); return n > 1 && key !== 'living' ? `${base} ${n}` : base; };
    const applied = app.change('op.detectWalls', (p) => { p.activeLevel = u.level; return applyPlan(p, result, { target: 'add', shift: [0, 0], keepLeftovers: false, roomNames, source: u.id }); }, null);
    const counts = { walls: result.walls.length, doors: result.stats.doors, windows: result.stats.windows, rooms: applied?.rooms ?? 0, angle: Math.round(((result.angle ?? 0) * 180) / Math.PI * 10) / 10 };
    if (level !== u.level) app.project().activeLevel = level;
    if (ask) {
      const choice = await app.ask({ icon: 'wallTool', title: t('underlay.keepTitle'), message: t('underlay.keepMessage', counts), buttons: [{ id: 'discard', label: t('underlay.discard'), icon: 'undo' }, { id: 'keep', label: t('underlay.keep'), icon: 'check', primary: true }] });
      if (choice !== 'keep') { app.undo(); return { ...counts, kept: false }; }
    }
    app.notify('success', t('underlay.detected', counts));
    return { ...counts, kept: true };
  }

  function remove(id) {
    app.change('op.delete', (p) => {
      const u = p.underlays.find((x) => x.id === id);
      p.underlays = p.underlays.filter((x) => x.id !== id);
      if (u && !p.underlays.some((x) => x.asset === u.asset)) delete p.assets[u.asset];
    }, ['underlays']);
  }

  // ───────────────────────── Entity Info: the underlays of the active level

  function panelHtml() {
    const p = app.project();
    const list = (p?.underlays ?? []).filter((u) => u.level === p.activeLevel);
    if (!list.length) return '';
    const units = app.units();
    const len = (v) => formatLength(v, units, { suffix: false });
    const row = (label, control, title = label) => `<div class="prop-row" title="${escapeHtml(title)}"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
    const num = (u, key, value, unit) => `<span class="unit-input"><input type="text" inputmode="decimal" data-prop="underlay.${escapeHtml(u.id)}.${key}" value="${escapeHtml(value)}" /><em>${escapeHtml(unit)}</em></span>`;
    const btn = (action, u, glyph, label) => `<button class="button small" data-underlay-action="${action}:${escapeHtml(u.id)}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
    return list.map((u) => `<section class="prop-section underlay-section" data-underlay="${escapeHtml(u.id)}"><header><span class="section-toggle">${icon('underlay')}<span>${escapeHtml(t('underlay.section'))} · ${escapeHtml(u.name)}</span></span></header><div class="props">
      <label class="prop-row check"><span class="prop-label"><span>${escapeHtml(t('underlay.visible'))}</span></span><span class="prop-control"><input type="checkbox" data-prop="underlay.${escapeHtml(u.id)}.visible" ${u.hidden ? '' : 'checked'} /></span></label>
      ${row(t('underlay.opacity'), `<input type="range" min="5" max="100" step="1" data-prop="underlay.${escapeHtml(u.id)}.opacity" value="${Math.round((u.opacity ?? 0.6) * 100)}" /><output>${Math.round((u.opacity ?? 0.6) * 100)}%</output>`)}
      ${row(t('underlay.x'), num(u, 'x', len(u.position[0]), units))}
      ${row(t('underlay.z'), num(u, 'z', len(u.position[1]), units))}
      ${row(t('underlay.rotation'), num(u, 'rotation', String(Math.round(((u.rotation ?? 0) * 180) / Math.PI * 100) / 100), '°'))}
      ${row(t('underlay.width'), num(u, 'width', len(u.width * u.scale), units), t('underlay.widthTip'))}
      <div class="prop-actions">${btn('calibrate', u, 'tapeMeasure', t('underlay.calibrate'))}${btn('detect', u, 'wallTool', t('underlay.detect'))}${btn('remove', u, 'trash', t('underlay.remove'))}</div>
      ${roomsHtml(u)}
    </div></section>`).join('');
  }

  /** The rooms found in an underlay picture, each with its name to edit (they were named from size and shape). */
  function roomsHtml(u) {
    const rooms = (app.project()?.rooms ?? []).filter((r) => r.planSource === u.id);
    if (!rooms.length) return '';
    const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
    return `<div class="prop-subhead" title="${escapeHtml(t('underlay.roomsHint'))}">${escapeHtml(t('underlay.rooms'))}</div>${rooms.map((r) => `<div class="prop-row" title="${escapeHtml(t('underlay.roomsHint'))}"><span class="prop-label"><span>${escapeHtml(`${area(r.points).toFixed(1)} m²`)}</span></span><span class="prop-control"><input type="text" data-prop="underlay.${escapeHtml(u.id)}.room.${escapeHtml(r.id)}" value="${escapeHtml(r.name ?? '')}" /></span></div>`).join('')}`;
  }

  /** data-prop="underlay.<id>.<field>" edits (app.js setProp passes them here). */
  function setProp(field, raw, input) {
    const [, id, key, roomId] = field.split('.');
    const u = underlay(id);
    if (!u) return;
    if (key === 'room') {
      // A room found in the picture renamed: its floor follows the new name while it was the guessed one.
      const room = app.project().rooms.find((r) => r.id === roomId);
      const name = String(raw ?? '').trim();
      if (room && name !== room.name) app.change('op.underlay', () => { if (room.nameGuessed) room.floor = floorForName(name); room.name = name; delete room.nameGuessed; }, null);
      return;
    }
    const units = app.units();
    // "1,200" as shown (thousands separators) is one number, not a list.
    const len = () => { const v = parseLength(String(raw).replace(/(\d),(?=\d{3}(?!\d))/g, '$1'), units); return Array.isArray(v) ? v[0] : v; };
    let edit = null;
    if (key === 'visible') edit = () => { u.hidden = !input.checked; };
    else if (key === 'opacity') { const v = Number(raw); if (Number.isFinite(v)) edit = () => { u.opacity = Math.max(0.05, Math.min(1, v / 100)); }; }
    else if (key === 'x' || key === 'z') { const v = len(); if (v != null) edit = () => { u.position = key === 'x' ? [v, u.position[1]] : [u.position[0], v]; }; }
    else if (key === 'rotation') { const v = Number(raw); if (Number.isFinite(v)) edit = () => { u.rotation = (v * Math.PI) / 180; }; }
    else if (key === 'width') { const v = len(); if (v > 0.01) edit = () => { u.scale = v / u.width; }; }
    if (edit) app.change('op.underlay', edit, ['underlays']);
  }

  /** Live opacity while the slider moves (no undo step). */
  function previewOpacity(field, raw, input) {
    const [, id] = field.split('.');
    const u = underlay(id);
    if (!u) return;
    u.opacity = Math.max(0.05, Math.min(1, Number(raw) / 100));
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = `${Math.round(u.opacity * 100)}%`;
    sync();
  }

  function action(spec) {
    const [name, id] = String(spec).split(':');
    if (name === 'calibrate') return startCalibration(id);
    if (name === 'detect') return detectWalls(id);
    if (name === 'remove') return remove(id);
    return undefined;
  }

  return { dialog, importFiles, importPlan, importImage, frame, calibrateWith, startCalibration, stopCalibration, detectWalls, remove, sync, panelHtml, setProp, previewOpacity, action, get calibrating() { return Boolean(calib); }, get layer() { return layer; } };
}
