// The main window's side of the standard parts library, smart fasteners, routing and photo rendering
// (app.js hands in what they need, `ctx`, and calls the hooks):
//   library   a PropertyManager page with categories, items, size / length choices and the size table; Insert
//             adds the part to the assembly as a component (one part per size, reused) or to the part as a body
//   fastener  pick a hole in an assembly: a bolt of the hole's size (and washer / nut) goes in with concentric
//             and coincident mates
//   routing   pipe / tube / cable routes: in a part a route feature (its own PropertyManager page, pm-std.js),
//             in an assembly a route part placed at the origin, its points picked on the components' faces
//   render    a photo-like picture of the view (view/render.js), progressive, saved through the export path
// The modelling is in cad/stdparts.js, cad/routing.js, cad/fastener.js (no DOM there).
import './styles-std.css';
import * as THREE from 'three';
import { createPart } from './cad/document.js';
import { createFeature, STD_PLANES, frame as makeFrame } from './cad/features.js';
import { quatIdentity, quatFromAxisAngle, instanceName, mateEntityOfFace, placePoint, placeDir, quatConjugate, rotate } from './cad/assembly.js';
import { faceSignature } from './cad/refs.js';
import { STD_ITEMS, STD_CATEGORIES, stdDefaults, designation, stdMateRefs, sizeOf } from './cad/stdparts.js';
import { STD_DEFAULTS, ROUTE_ICONS } from './cad/std-types.js';
import { routeBom, routeSolid, routeSection } from './cad/routing.js';
import { stdShape } from './cad/stdparts.js';
import { holeOfFace, fastenerPlan } from './cad/fastener.js';
import { PhotoRenderer, ENV_IDS, DEFAULT_RENDER, normalizeRenderSettings, pbrFor, materialClass } from './view/render.js';
import { materialName } from './cad/materials.js';
import { sizeControls, sizeTableHtml, stdSummary, placementGroup, routeSettings, routePoints as routePointsHtml, routeBomHtml, stdNames } from './ui/pm-std.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const MODES = new Set(['stdLibrary', 'smartFastener', 'asmRoute', 'render']);
const ROUTE_MATERIAL = { pipe: 'steel-1020', tube: 'copper', cable: 'rubber' };
const round3 = (v) => Math.round(v * 1000) / 1000;

export function createStdTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const asm = () => ctx.activeAssembly();
  const part = () => ctx.activePart();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const names = () => stdNames(t);
  /** The api the shared PropertyManager pieces (pm-std.js) need. */
  const api = () => ({ t, fmt: ctx.fmt, fmtLen: (v) => ctx.fmtLen(v), fmtLenBare: (v) => ctx.fmtLen(v, false), unitName: () => ctx.units(), editing: state.editing, previewResult: null });
  const begin = (e) => { if (state.editing) ctx.cancelEditing({ quiet: true }); state.editing = e; state.leftTab = 'pm'; state.selection = []; ctx.syncView(); ctx.renderAll(); };

  // ───────────────────────── library

  function startLibrary(kind = null) {
    if (!asm() && !part()) { notify('info', t('std.needDocument')); return; }
    const k = kind ?? editing()?.p?.kind ?? 'hexBolt';
    const cat = STD_CATEGORIES.find((c) => c.items.includes(k))?.id ?? 'bolts';
    begin({ mode: 'stdLibrary', category: cat, p: { ...stdDefaults(k), x: 0, y: 0, z: 0, axis: 'z', angle: 0, merge: false }, inserted: [] });
  }

  /** A project part for the library part (the same kind and size is one part, inserted again). */
  function libraryPart(pr, p, made) {
    const key = JSON.stringify([p.kind, sizeOf(p), STD_ITEMS[p.kind].lengths ? Number(p.length) : 0, STD_ITEMS[p.kind].gear ? [Number(p.teeth), Number(p.width), Number(p.bore)] : 0]);
    let found = pr.parts.find((x) => x.std === key) ?? made.find((x) => x.std === key);
    if (found) return found;
    const name = designation(p, names());
    found = createPart(name, { std: key, material: STD_ITEMS[p.kind].material, partNo: name, description: t(`std.item.${p.kind}`) });
    const params = { kind: p.kind, size: p.size, dn: p.dn, length: Number(p.length) || 0, x: 0, y: 0, z: 0, axis: 'z', angle: 0, merge: false };
    if (STD_ITEMS[p.kind].gear) Object.assign(params, { module: Number(p.module), teeth: Math.round(Number(p.teeth)), width: Number(p.width), bore: Number(p.bore) || 0 });
    found.features.push(createFeature(found, 'stdPart', params));
    made.push(found);
    return found;
  }

  function newComponent(a, p, { position = null, rotation = null } = {}) {
    const first = a.components.length === 0;
    return { id: ctx.newId('cmp'), part: p.id, name: instanceName(a, p.name, p.id), position: position ?? (first ? [0, 0, 0] : [ctx.assemblySize(a) * 0.6 + 20, 0, 0]), rotation: rotation ?? quatIdentity(), fixed: first };
  }

  async function insertLibrary() {
    const e = editing();
    await ctx.ensureKernel();
    const p = e.p;
    const a = asm();
    if (a) {
      let comp = null; const made = [];
      ctx.change('op.insertStdPart', (pr) => {
        const lp = libraryPart(pr, p, made);
        for (const m of made) pr.parts.push(m);
        comp = newComponent(a, lp);
        a.components.push(comp);
      });
      e.inserted.push(comp.name);
      state.selection = [{ kind: 'comp', id: comp.id, key: `comp:${comp.id}` }];
      notify('success', t('std.inserted', { name: comp.name }));
      ctx.fitView();
      ctx.renderLeft();
      return comp;
    }
    const pt = part();
    if (!pt) return null;
    let f = null;
    ctx.change('op.insertStdPart', () => {
      f = createFeature(pt, 'stdPart', { ...p, length: Number(p.length) || 0 });
      const at = pt.rollback ?? pt.features.length;
      pt.features.splice(at, 0, f);
      if (pt.rollback != null) pt.rollback += 1;
    });
    e.inserted.push(f.name);
    notify('success', t('std.inserted', { name: f.name }));
    ctx.fitView();
    ctx.renderLeft();
    return f;
  }

  function libraryPm(e) {
    const { pmHead, pmGroup, pmButton } = ctx.pm;
    const A = api();
    const p = e.p;
    const cats = `<div class="std-cats" role="tablist">${STD_CATEGORIES.map((c) => `<button type="button" class="std-cat ${c.id === e.category ? 'active' : ''}" data-pm-set="stdCategory" data-value="${c.id}" title="${escapeHtml(t(`std.cat.${c.id}`))}" aria-pressed="${c.id === e.category}">${icon(c.icon)}<span>${escapeHtml(t(`std.cat.${c.id}`))}</span></button>`).join('')}</div>`;
    const cat = STD_CATEGORIES.find((c) => c.id === e.category) ?? STD_CATEGORIES[0];
    const items = `<div class="std-items">${cat.items.map((k) => `<button type="button" class="std-item ${k === p.kind ? 'active' : ''}" data-pm-set="stdKind" data-value="${k}" title="${escapeHtml(`${t(`std.item.${k}`)} — ${STD_ITEMS[k].standard}`)}">${icon(STD_ITEMS[k].icon)}<span><b>${escapeHtml(t(`std.item.${k}`))}</b><small>${escapeHtml(STD_ITEMS[k].standard)}</small></span></button>`).join('')}</div>`;
    const where = asm() ? t('std.insertComponent') : t('std.insertBody');
    return [
      pmHead('stdLibrary', t('cmd.stdLibrary'), t('pm.help.stdLibrary')),
      pmGroup('stdLibrary', t('std.categories'), cats),
      pmGroup(cat.icon, t(`std.cat.${cat.id}`), items),
      pmGroup(STD_ITEMS[p.kind].icon, t('std.size'), `${sizeControls(A, p)}${stdSummary(A, p)}`),
      pmGroup('csvFile', t('std.sizeTable'), sizeTableHtml(A, p)),
      asm() ? '' : placementGroup(A, p),
      pmGroup('plus', where, `<div class="pm-row">${pmButton('std.insert', 'plus', where, 'primary')}</div>${e.inserted.length ? `<ul class="pm-list">${e.inserted.map((n) => `<li>${icon('check', 'icon tiny')}<span>${escapeHtml(n)}</span></li>`).join('')}</ul>` : ''}`),
    ].join('');
  }

  /** stdKind / stdSize / stdLength / stdModule for a library part `p` (the library page or a stdPart feature). */
  function setStd(p, key, value) {
    if (key === 'stdKind') { Object.assign(p, stdDefaults(value, p)); return true; }
    const item = STD_ITEMS[p.kind];
    if (key === 'stdSize') {
      if (item.pipe) p.dn = value;
      else if (item.gear) p.module = Number(value);
      else {
        p.size = value;
        const list = item.lengths?.(String(value)) ?? [];
        if (list.length && !list.includes(Number(p.length))) p.length = list.reduce((b, l) => (Math.abs(l - Number(p.length)) < Math.abs(b - Number(p.length)) ? l : b), list[0]);
      }
      return true;
    }
    if (key === 'stdLength') { p.length = Number(value); return true; }
    if (key === 'stdModule') { p.module = Number(value); return true; }
    return false;
  }

  // ───────────────────────── smart fasteners

  function startFastener() {
    const a = asm();
    if (!a?.components.length) { notify('info', t('notice.assemblyOnly')); return; }
    begin({ mode: 'smartFastener', kind: 'hexBolt', washer: true, nut: true, last: null, made: [] });
    notify('info', t('fastener.pickHole'));
  }

  /** A face of a component as a mate reference in the component's frame (like the Mate tool picks it). */
  function refOfFace(topo, face) {
    const ent = { comp: topo.comp.id, ...mateEntityOfFace(face, faceSignature) };
    if (topo.inner) { ent.point = placePoint(topo.inner, ent.point); ent.dir = placeDir(topo.inner, ent.dir); ent.path = topo.path; }
    return ent;
  }

  /** Rotation taking +Z to `n`. */
  function rotationTo(n) {
    const z = [0, 0, 1];
    const axis = [z[1] * n[2] - z[2] * n[1], z[2] * n[0] - z[0] * n[2], z[0] * n[1] - z[1] * n[0]];
    const c = Math.max(-1, Math.min(1, n[2]));
    if (Math.hypot(...axis) < 1e-9) return c > 0 ? quatIdentity() : quatFromAxisAngle([1, 0, 0], 180);
    return quatFromAxisAngle(axis, (Math.acos(c) * 180) / Math.PI);
  }

  async function fastenerPick(hit) {
    const e = editing(); const a = asm();
    await ctx.ensureKernel();
    const topo = ctx.topoOf(hit);
    if (hit?.kind !== 'face' || !topo?.comp || !topo.shape) { notify('info', t('notice.pickComponentFace')); return null; }
    const hole = holeOfFace(topo.shape, topo.entry?.faces ?? []);
    if (!hole) { notify('warning', t('fastener.notHole')); return null; }
    // Which end is "up": world +Z seen in the part's frame (the component's rotation, and a sub-assembly's).
    const toLocal = (d) => { let v = rotate(quatConjugate(topo.comp.rotation), d); if (topo.inner) v = rotate(quatConjugate(topo.inner.rotation), v); return v; };
    const plan = fastenerPlan(hole, { kind: e.kind, washer: e.washer, nut: e.nut, up: toLocal([0, 0, 1]) });
    if (plan.error) { notify('warning', t(`fastener.${plan.error}`)); return null; }
    const entry = hole.ends[plan.entry]; const exit = hole.ends[plan.exit];
    if (!entry.face) { notify('warning', t('fastener.no-entry')); return null; }
    // World placement of the joint.
    const toWorld = (p) => placePoint(topo.comp, topo.inner ? placePoint(topo.inner, p) : p);
    const dirWorld = (d) => placeDir(topo.comp, topo.inner ? placeDir(topo.inner, d) : d);
    const n = dirWorld(entry.normal);
    const q = rotationTo(n);
    const pEntry = toWorld(entry.centre);
    const holeAxis = refOfFace(topo, topo.shape);
    const entryPlane = refOfFace(topo, entry.face);
    const exitPlane = exit.face ? refOfFace(topo, exit.face) : null;
    const comps = []; const mates = []; const made = [];
    const count = {};
    const mate = (type, aRef, bRef) => { count[type] = (count[type] ?? a.mates.filter((m) => m.type === type).length) + 1; mates.push({ id: ctx.newId('mate'), type, aligned: 'anti', a: aRef, b: bRef, name: `${t(`mate.${type}`)}${count[type]}` }); };
    let washerComp = null;
    ctx.change('op.smartFastener', (pr) => {
      const at = (p, k) => p.map((v, i) => v + n[i] * k);
      const add = (p, position) => { const lp = libraryPart(pr, p, made); const c = { ...newComponent(a, lp, { position, rotation: [...q] }), fixed: false }; a.components.push(c); comps.push(c); return c; };
      let seat = 0;
      if (plan.washer) {
        washerComp = add({ ...stdDefaults('flatWasher'), size: plan.size }, pEntry);
        const r = stdMateRefs({ kind: 'flatWasher', size: plan.size });
        mate('concentric', { comp: washerComp.id, ...r.axis }, holeAxis);
        mate('coincident', { comp: washerComp.id, ...r.bottom }, entryPlane);
        seat = r.top.point[2];
      }
      const bolt = add({ ...stdDefaults(plan.bolt.kind), size: plan.size, length: plan.bolt.length }, at(pEntry, seat));
      const br = stdMateRefs(plan.bolt);
      mate('concentric', { comp: bolt.id, ...br.axis }, holeAxis);
      if (washerComp) mate('coincident', { comp: bolt.id, ...br.bottom }, { comp: washerComp.id, ...stdMateRefs({ kind: 'flatWasher', size: plan.size }).top });
      else mate('coincident', { comp: bolt.id, ...br.bottom }, entryPlane);
      if (plan.nut && exitPlane) {
        const nr = stdMateRefs({ kind: 'hexNut', size: plan.size });
        const nut = add({ ...stdDefaults('hexNut'), size: plan.size }, at(toWorld(exit.centre), -nr.top.point[2]));
        mate('concentric', { comp: nut.id, ...nr.axis }, holeAxis);
        mate('coincident', { comp: nut.id, ...nr.top }, exitPlane);
      }
      for (const m of made) pr.parts.push(m);
      a.mates.push(...mates);
    });
    e.last = { plan, diameter: hole.diameter, depth: hole.depth, names: comps.map((c) => c.name) };
    e.made.push(...comps.map((c) => c.name));
    const failed = mates.filter((m) => state.failedMates.has(m.id));
    notify(failed.length ? 'warning' : 'success', t('fastener.made', { bolt: designation(plan.bolt), count: comps.length }));
    ctx.renderLeft();
    return { plan, comps: comps.map((c) => c.id), mates: mates.map((m) => m.id) };
  }

  function fastenerPm(e) {
    const { pmHead, pmGroup, pmSeg } = ctx.pm;
    const last = e.last;
    const res = last ? pmGroup('check', t('fastener.result'), `<dl class="pm-results"><dt>${escapeHtml(t('fastener.hole'))}</dt><dd>${escapeHtml(`Ø${ctx.fmt(last.diameter, 2)} × ${ctx.fmt(last.depth, 2)} (${t(last.plan.through ? 'fastener.through' : 'fastener.blind')})`)}</dd><dt>${escapeHtml(t('fastener.fit'))}</dt><dd>${escapeHtml(t(`fastener.fit.${last.plan.fit}`))}</dd><dt>${escapeHtml(t('fastener.bolt'))}</dt><dd>${escapeHtml(designation(last.plan.bolt))}</dd></dl><ul class="pm-list">${last.names.map((x) => `<li>${icon('part', 'icon tiny')}<span>${escapeHtml(x)}</span></li>`).join('')}</ul>`) : '';
    return [
      pmHead('smartFastener', t('cmd.smartFastener'), t('pm.help.smartFastener')),
      pmGroup('hexBolt', t('fastener.type'), pmSeg('fastKind', [['hexBolt', t('std.item.hexBolt'), 'hexBolt'], ['socketCap', t('std.item.socketCap'), 'socketCap']], e.kind)),
      pmGroup('flatWasher', t('fastener.stack'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="washer" ${e.washer ? 'checked' : ''}/>${icon('flatWasher')}<span>${escapeHtml(t('fastener.washer'))}</span></label><label class="pm-check"><input type="checkbox" data-pm-toggle="nut" ${e.nut ? 'checked' : ''}/>${icon('hexNut')}<span>${escapeHtml(t('fastener.nut'))}</span></label><p class="pm-note">${escapeHtml(t('fastener.rules'))}</p>`),
      res,
    ].join('');
  }

  // ───────────────────────── routing

  const routeKinds = (kind) => ({ ...STD_DEFAULTS.route(), kind, points: kind === 'cable' ? [[0, 0, 0], [40, 30, 20], [90, 0, 50], [140, 40, 60]] : STD_DEFAULTS.route().points, ...(kind === 'tube' ? { bendRadius: 30 } : {}) });

  function startRoute(kind) {
    const pt = part(); const a = asm();
    if (pt) {
      // A selected 3D sketch / XYZ curve becomes the path.
      const sel = state.selection.find((s) => s.kind === 'feat');
      const path = sel && pt.features.find((f) => f.id === sel.id && (f.type === 'sketch3d' || f.type === 'curveXYZ'));
      const f = createFeature(pt, 'route', { ...routeKinds(kind), ...(path ? { path: path.id } : {}) });
      ctx.beginFeature(f, { pick: path ? null : 'points3d' });
      if (state.editing) state.editing.drawPlane = 'top';
      notify('info', t('route.started'));
      return;
    }
    if (!a) { notify('info', t('std.needDocument')); return; }
    begin({ mode: 'asmRoute', f: { ...routeKinds(kind), points: [] }, standoff: 0, error: null });
    notify('info', t('route.pickPoints'));
  }

  let previewKey = '';
  function routePreview(e) {
    const key = JSON.stringify(e.f);
    if (key === previewKey) return;
    previewKey = key;
    e.error = null; e.bom = null; e.length = null;
    const vp = ctx.viewport();
    if ((e.f.points?.length ?? 0) < 2) { vp?.setPreview(null); return; }
    try {
      const r = routeSolid(e.f, [], stdShape);
      e.bom = routeBom(e.f, [], { measured: r.measured });
      vp?.setPreview({ mesh: r.shape.mesh({ tolerance: 0.2, angularTolerance: 0.3 }) });
    } catch (error) {
      e.error = error.code ?? 'route-failed';
      vp?.setPreview(null);
    }
  }

  function asmRoutePm(e) {
    const { pmHead, pmGroup, pmNum } = ctx.pm;
    const A = api();
    routePreview(e);
    return [
      pmHead(ROUTE_ICONS[e.f.kind], t(`cmd.${e.f.kind}Route`), t('pm.help.asmRoute')),
      routeSettings(A, e.f),
      routePointsHtml(A, e.f, { picking: true }),
      pmGroup('pointTool', t('route.pickOptions'), pmNum('standoff', e.standoff, t('route.standoff'), 'smartDim', ctx.units())),
      e.error ? `<p class="pm-error">${icon('error')}<span>${escapeHtml(t(`rebuild.${e.error}`, null, e.error))}</span></p>` : '',
      routeBomHtml(A, e.bom),
    ].join('');
  }

  function asmRoutePick(hit, ev) {
    const e = editing();
    let p = null;
    const topo = hit?.kind === 'face' ? ctx.topoOf(hit) : null;
    if (hit?.point && topo?.comp) {
      p = hit.point.slice();
      if (e.standoff && !topo.inner && topo.shape) {
        try {
          const c = topo.comp;
          const local = rotate(quatConjugate(c.rotation), p.map((v, i) => v - c.position[i]));
          const nl = topo.shape.normalAt(local);
          const nw = placeDir(c, [nl.x, nl.y, nl.z]); const l = Math.hypot(...nw) || 1;
          p = p.map((v, i) => v + (nw[i] / l) * e.standoff);
        } catch { /* no normal: the point itself */ }
      }
    } else {
      // Empty space: on the plane through the last point (Top by default).
      const last = e.f.points.at(-1) ?? [0, 0, 0];
      const fr = makeFrame(STD_PLANES[e.drawPlane ?? 'top']);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...fr.normal), new THREE.Vector3(...last));
      const vp = ctx.viewport();
      const q = ev && vp ? vp.rayAt(ev.clientX, ev.clientY).ray.intersectPlane(plane, new THREE.Vector3()) : null;
      if (!q) return;
      p = q.toArray();
    }
    e.f.points.push(p.map(round3));
    ctx.renderLeft();
  }

  function acceptAsmRoute() {
    const e = editing(); const a = asm();
    routePreview(e);
    if (e.f.points.length < 2) { notify('error', t('route.needPoints')); return; }
    if (e.error) { notify('error', t(`rebuild.${e.error}`, null, e.error)); return; }
    const kindName = t(`route.${e.f.kind}`);
    let comp = null;
    state.editing = null; state.leftTab = 'tree';
    ctx.viewport()?.setPreview(null);
    previewKey = '';
    ctx.change('op.addRoute', (pr) => {
      const n = pr.parts.filter((x) => x.route).length + 1;
      const rp = createPart(`${kindName}${t('route.partSuffix')}${n}`, { route: true, material: ROUTE_MATERIAL[e.f.kind], color: e.f.kind === 'cable' ? e.f.color : null, description: t('route.partDescription') });
      rp.features.push(createFeature(rp, 'route', { ...e.f, points: e.f.points.map((p) => [...p]) }));
      pr.parts.push(rp);
      comp = { id: ctx.newId('cmp'), part: rp.id, name: instanceName(a, rp.name, rp.id), position: [0, 0, 0], rotation: quatIdentity(), fixed: true };
      a.components.push(comp);
    });
    notify('success', t('route.made', { name: comp.name, length: ctx.fmtLen(e.bom?.length ?? 0) }));
    return comp;
  }

  // ───────────────────────── rendering

  let photo = null;
  let host = null;
  const renderSettings = { ...DEFAULT_RENDER };
  /** Test hook: a function (blob, name) that receives the saved picture instead of the save dialog. */
  let saveHook = null;

  function overlay() {
    const vh = ctx.viewHost();
    if (!vh) return null;
    if (!host || !host.isConnected) {
      host = document.createElement('div');
      host.className = 'render-view';
      host.innerHTML = '<div class="render-frame"></div><div class="render-status" role="status"></div>';
      vh.append(host);
    }
    return host;
  }

  function hideOverlay() { photo?.stop(); host?.remove(); host = null; }

  /** The view's bodies as the photo renderer takes them (shared geometry, the part's material). */
  function sceneBodies() {
    const vp = ctx.viewport();
    const list = [];
    const box = new THREE.Box3();
    for (const b of vp?.bodies?.values() ?? []) {
      if (String(b.key).startsWith('surf:') || b.mesh.visible === false || b.ghost) continue;
      const matrix = b.mesh.matrixAutoUpdate ? b.mesh.matrixWorld.clone() : b.mesh.matrix.clone();
      const pbr = pbrFor(b.material ?? 'steel-1020', b.color);
      list.push({ geometry: b.mesh.geometry, matrix, pbr, key: b.key, material: b.material ?? 'steel-1020' });
      b.mesh.geometry.computeBoundingBox();
      box.union(b.mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
    return { list, box };
  }

  function startRender() {
    const vp = ctx.viewport();
    if (!vp || (!part() && !asm())) { notify('info', t('notice.noBody')); return; }
    begin({ mode: 'render', status: null, settings: renderSettings });
    rerender();
  }

  function rerender() {
    const e = editing();
    if (e?.mode !== 'render') return;
    const vp = ctx.viewport();
    const { list, box } = sceneBodies();
    if (!list.length) { notify('info', t('notice.noBody')); return; }
    const el = overlay();
    try {
      photo ??= new PhotoRenderer();
    } catch (error) { notify('error', t('render.noWebgl')); ctx.cancelEditing({ quiet: true }); return; }
    const frame = el.querySelector('.render-frame');
    if (photo.canvas.parentElement !== frame) frame.append(photo.canvas);
    const size = photo.setup({ bodies: list, camera: vp.camera, target: vp.target, box, settings: { ...normalizeRenderSettings(renderSettings), viewWidth: vp.width, viewHeight: vp.height } });
    e.status = { count: 0, total: photo.settings.samples, ms: 0, done: false, ...size };
    updateStatus();
    photo.start({
      onProgress: (s) => { Object.assign(e.status, s); updateStatus(); },
      onDone: (s) => { Object.assign(e.status, s, { done: true }); updateStatus(); ctx.renderLeft(); },
    });
  }

  function updateStatus() {
    const e = editing();
    const s = e?.status;
    const el = host?.querySelector('.render-status');
    if (!s || !el) return;
    const pct = Math.round((100 * s.count) / Math.max(1, s.total));
    el.innerHTML = `${icon(s.done ? 'check' : 'renderView', 'icon tiny')}<span>${escapeHtml(t(s.done ? 'render.done' : 'render.progress', { count: s.count, total: s.total, w: s.width, h: s.height, s: ctx.fmt((s.ms ?? 0) / 1000, 1) }))}</span><i class="render-bar"><b style="width:${pct}%"></b></i>`;
    const out = document.querySelector('[data-render-progress]');
    if (out) out.textContent = `${s.count} / ${s.total}`;
  }

  async function saveRender() {
    if (!photo) return false;
    photo.show();
    const blob = await photo.toBlob();
    const name = `${ctx.fileSafe(ctx.activeName() || 'render')}-render.png`;
    if (saveHook) { saveHook(blob, name); notify('success', t('notice.exported', { name })); return true; }
    return ctx.saveExport(name, 'png', blob, 'image/png');
  }

  function renderPm(e) {
    const { pmHead, pmGroup, pmSeg, pmNum, pmButton } = ctx.pm;
    const s = normalizeRenderSettings(renderSettings);
    const s0 = e.status;
    const classes = new Map();
    for (const b of sceneBodies().list) { const c = materialClass(b.material); if (!classes.has(b.material)) classes.set(b.material, c); }
    const mats = [...classes].map(([id, c]) => `<li>${icon('material', 'icon tiny')}<span>${escapeHtml(materialName(id, ctx.lang()))} → <b>${escapeHtml(t(`render.class.${c}`))}</b></span></li>`).join('');
    return [
      pmHead('renderView', t('cmd.renderView'), t('pm.help.renderView')),
      pmGroup('environment', t('render.environment'), pmSeg('env', ENV_IDS.map((id) => [id, t(`render.env.${id}`)]), s.env)),
      pmGroup('sun', t('render.lighting'), `${pmNum('sunIntensity', s.sunIntensity, t('render.sunIntensity'), 'sun')}${pmNum('softness', s.softness, t('render.softness'), 'groundShadow')}`),
      pmGroup('groundShadow', t('render.groundBg'), `${pmSeg('ground', [['shadow', t('render.ground.shadow')], ['floor', t('render.ground.floor')], ['none', t('render.ground.none')]], s.ground)}${pmSeg('background', [['env', t('render.bg.env')], ['white', t('render.bg.white')], ['transparent', t('render.bg.transparent')]], s.background)}`),
      pmGroup('depthOfField', t('render.dof'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="dof" ${s.dof ? 'checked' : ''}/>${icon('depthOfField')}<span>${escapeHtml(t('render.dofOn'))}</span></label>${s.dof ? `${pmNum('aperture', s.aperture, t('render.aperture'), 'depthOfField')}${pmNum('focus', s.focus, t('render.focus'), 'smartDim', ctx.units())}<p class="pm-note">${escapeHtml(t('render.focusAuto'))}</p>` : ''}`),
      pmGroup('resolution', t('render.quality'), `${pmSeg('resolution', [['view', t('render.res.view')], ['hd', '1280×720'], ['fhd', '1920×1080'], ['qhd', '2560×1440'], ['square', '1024²']], s.resolution)}${pmNum('samples', s.samples, t('render.samples'), 'resolution')}`),
      pmGroup('material', t('render.materials'), `<ul class="pm-list">${mats}</ul>`),
      pmGroup('renderView', t('render.output'), `<p class="pm-note">${escapeHtml(t('render.samplesDone'))}: <b data-render-progress>${s0 ? `${s0.count} / ${s0.total}` : '—'}</b></p><div class="pm-row">${pmButton('std.render', 'play', t('render.restart'), 'primary')}${pmButton('std.renderStop', 'stop', t('render.stop'))}${pmButton('std.renderSave', 'renderSave', t('render.save'))}</div>`),
    ].join('');
  }

  // ───────────────────────── PropertyManager hooks

  function pm(e) {
    if (e.mode === 'stdLibrary') return libraryPm(e);
    if (e.mode === 'smartFastener') return fastenerPm(e);
    if (e.mode === 'asmRoute') return asmRoutePm(e);
    if (e.mode === 'render') return renderPm(e);
    return '';
  }

  function pick(hit, ev) {
    const e = editing();
    if (e.mode === 'smartFastener') return fastenerPick(hit);
    if (e.mode === 'asmRoute') return asmRoutePick(hit, ev);
    return undefined;
  }

  const RENDER_NUMS = { sunIntensity: [0, 10], softness: [0, 10], aperture: [0, 10], focus: [0, 1e7], samples: [1, 4096] };
  function field(key, raw, v) {
    const e = editing();
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return; }
    if (e.mode === 'render' && RENDER_NUMS[key]) { renderSettings[key] = Math.max(RENDER_NUMS[key][0], Math.min(RENDER_NUMS[key][1], key === 'samples' ? Math.round(v) : v)); ctx.renderLeft(); rerender(); return; }
    if (e.mode === 'stdLibrary') {
      if (['teeth', 'width', 'bore', 'x', 'y', 'z', 'angle'].includes(key)) e.p[key] = key === 'teeth' ? Math.max(6, Math.min(400, Math.round(v))) : ['width'].includes(key) ? Math.max(0.1, v) : key === 'bore' ? Math.max(0, v) : v;
      ctx.renderLeft(); return;
    }
    if (e.mode === 'asmRoute') {
      if (key.startsWith('pt3:')) { const [, i, j] = key.split(':').map(Number); if (e.f.points[i]) e.f.points[i][j] = v; }
      else if (key === 'standoff') e.standoff = v;
      else if (['od', 'wall', 'bendRadius', 'diameter'].includes(key) && v > 0) e.f[key] = v;
      ctx.renderLeft(); return;
    }
    ctx.renderLeft();
  }

  function step(key, delta) {
    const e = editing();
    const target = e.mode === 'stdLibrary' ? e.p : e.mode === 'asmRoute' ? e.f : e.mode === 'render' ? renderSettings : null;
    if (!target || !Number.isFinite(Number(target[key]))) return;
    const cur = Number(target[key]);
    const inc = key === 'teeth' ? 1 : key === 'angle' ? 15 : cur >= 20 ? 5 : 1;
    field(key, String(cur + delta * inc), cur + delta * inc);
  }

  function set(key, value) {
    const e = editing();
    if (e.mode === 'stdLibrary') {
      if (key === 'stdCategory') { e.category = value; const c = STD_CATEGORIES.find((x) => x.id === value); if (c && !c.items.includes(e.p.kind)) setStd(e.p, 'stdKind', c.items[0]); }
      else if (!setStd(e.p, key, value)) e.p[key] = value;
      if (key === 'stdKind') e.category = STD_CATEGORIES.find((c) => c.items.includes(value))?.id ?? e.category;
    } else if (e.mode === 'smartFastener') { if (key === 'fastKind') e.kind = value; }
    else if (e.mode === 'asmRoute') { if (key === 'drawPlane') e.drawPlane = value; else e.f[key] = value; }
    else if (e.mode === 'render') { renderSettings[key] = value; ctx.renderLeft(); rerender(); return; }
    ctx.renderLeft();
  }

  function toggle(key, checked) {
    const e = editing();
    if (e.mode === 'render') { renderSettings[key] = checked; ctx.renderLeft(); rerender(); return; }
    if (e.mode === 'stdLibrary') e.p[key] = checked;
    else e[key] = checked;
    ctx.renderLeft();
  }

  /** Selects (data-pm-select) of the library page and of stdPart features; true when handled. */
  function select(key, value) {
    const e = editing();
    if (!key.startsWith('std')) {
      if (e?.mode === 'asmRoute') { e.f[key] = value || null; ctx.renderLeft(); return true; }
      return false;
    }
    if (e?.mode === 'stdLibrary') { setStd(e.p, key, value); ctx.renderLeft(); return true; }
    if (e?.mode === 'feature' && e.feature.type === 'stdPart') { ctx.updateFeature((f) => { setStd(f, key, value); }); return true; }
    return false;
  }

  /** data-pm-set of a stdPart feature (size table rows). True when handled. */
  function featureSet(key, value) {
    const e = editing();
    if (e?.mode === 'feature' && e.feature.type === 'stdPart' && key.startsWith('std')) { ctx.updateFeature((f) => { setStd(f, key, value); }); return true; }
    return false;
  }

  function accept() {
    const e = editing();
    if (e.mode === 'stdLibrary') {
      if (!e.inserted.length) return insertLibrary().then(() => { if (editing()?.mode === 'stdLibrary') ctx.cancelEditing({ quiet: true }); });
      return ctx.cancelEditing({ quiet: true });
    }
    if (e.mode === 'asmRoute') return acceptAsmRoute();
    return ctx.cancelEditing({ quiet: true });
  }

  /** Cleans up after a mode of ours ends (cancelEditing calls it). */
  function cleanup(e) {
    if (e?.mode === 'render') hideOverlay();
    if (e?.mode === 'asmRoute') { ctx.viewport()?.setPreview(null); previewKey = ''; }
  }

  const COMMAND_NAMES = new Set(['std.insert', 'std.render', 'std.renderStop', 'std.renderSave']);
  function handles(name) { return COMMAND_NAMES.has(name) || (owns(editing()) && ['addPt3', 'delPt3', 'clear'].includes(name)); }
  function command(name, arg) {
    const e = editing();
    if (name === 'std.insert') return insertLibrary();
    if (name === 'std.render') return rerender();
    if (name === 'std.renderStop') { photo?.stop(); if (e?.status) { e.status.done = true; updateStatus(); } return undefined; }
    if (name === 'std.renderSave') return saveRender();
    if (e?.mode === 'asmRoute') {
      if (name === 'addPt3') { const last = e.f.points.at(-1) ?? [0, 0, 0]; e.f.points.push([last[0] + 50, last[1], last[2]]); }
      if (name === 'delPt3') e.f.points.splice(Number(arg), 1);
      if (name === 'clear') e.f.points = [];
      return ctx.renderLeft();
    }
    return undefined;
  }

  const subject = (e) => t({ stdLibrary: 'cmd.stdLibrary', smartFastener: 'cmd.smartFastener', asmRoute: `cmd.${e.f?.kind ?? 'pipe'}Route`, render: 'cmd.renderView' }[e.mode]);

  // ───────────────────────── commands

  const docOpen = () => Boolean(part() || asm()) && editing()?.mode !== 'sketch';
  const toggleMode = (mode, startFn) => () => (editing()?.mode === mode ? ctx.cancelEditing({ quiet: true }) : startFn());
  const commands = {
    stdLibrary: { icon: 'stdLibrary', label: 'cmd.stdLibrary', enabled: docOpen, checked: () => editing()?.mode === 'stdLibrary', run: toggleMode('stdLibrary', () => startLibrary()) },
    smartFastener: { icon: 'smartFastener', label: 'cmd.smartFastener', enabled: () => Boolean(asm()?.components.length), checked: () => editing()?.mode === 'smartFastener', run: toggleMode('smartFastener', startFastener) },
    pipeRoute: { icon: 'pipeRoute', label: 'cmd.pipeRoute', enabled: docOpen, run: () => startRoute('pipe') },
    tubeRoute: { icon: 'tubeRoute', label: 'cmd.tubeRoute', enabled: docOpen, run: () => startRoute('tube') },
    cableRoute: { icon: 'cableRoute', label: 'cmd.cableRoute', enabled: docOpen, run: () => startRoute('cable') },
    renderView: { icon: 'renderView', label: 'cmd.renderView', enabled: docOpen, checked: () => editing()?.mode === 'render', run: toggleMode('render', startRender) },
  };

  /** The CommandManager tab of these tools. */
  const TAB = ['stdLibrary', 'smartFastener', '|', 'pipeRoute', 'tubeRoute', 'cableRoute', '|', 'renderView'];
  const SUBMENU = { icon: 'stdLibrary', items: ['stdLibrary', 'smartFastener', '-', 'pipeRoute', 'tubeRoute', 'cableRoute'] };

  return {
    commands, TAB, SUBMENU, owns, pm, pick, field, step, set, toggle, select, featureSet, accept, cleanup, handles, command, subject,
    startLibrary, startRoute, insertLibrary, fastenerPick, rerender, saveRender,
    get photo() { return photo; },
    get renderSettings() { return renderSettings; },
    setSaveHook(fn) { saveHook = fn; },
    routeSection,
  };
}
