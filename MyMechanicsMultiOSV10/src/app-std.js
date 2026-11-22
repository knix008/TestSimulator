// The main window's side of the standard parts library, smart fasteners, routing and photo rendering
// (app.js hands in what they need, `ctx`, and calls the hooks):
//   library   a PropertyManager page with categories, items, size / length choices and the size table; Insert
//             adds the part to the assembly as a component (one part per size, reused) or to the part as a body
//   fastener  pick a hole in an assembly: a bolt of the hole's size (washers, spring washer, nut) goes in with
//             concentric and coincident mates (and a spin lock) — into every hole of the hole's pattern, through
//             the holes of stacked parts on the same axis; each fastener is kept (assembly.fasteners) so its size,
//             length and kind can be changed later
//   routing   pipe / tube / cable routes: in a part a route feature (its own PropertyManager page, pm-std.js),
//             in an assembly a route part placed at the origin, its points picked on the components' faces
//   render    a photo-like picture of the view (app-render.js: path tracer and raster preview), saved through the export path
// The modelling is in cad/stdparts.js, cad/routing.js, cad/fastener.js (no DOM there).
import './styles-std.css';
import * as THREE from 'three';
import { createPart, addDrawing } from './cad/document.js';
import { SHEETS } from './cad/drawing.js';
import { harnessSheet, harnessKey, applyHarnessSheet, harnessSheetOptions, HARNESS_SCALES } from './cad/harness-sheet.js';
import { createFeature, STD_PLANES, frame as makeFrame } from './cad/features.js';
import { quatIdentity, quatFromAxisAngle, instanceName, mateEntityOfFace, placePoint, placeDir, quatConjugate, rotate, composePlacement } from './cad/assembly.js';
import { faceSignature } from './cad/refs.js';
import { STD_ITEMS, STD_CATEGORIES, stdDefaults, designation, stdMateRefs, stdKey, GEAR_PARAMS } from './cad/stdparts.js';
import { STD_DEFAULTS, ROUTE_ICONS } from './cad/std-types.js';
import { routeBom, routeSolid, routeSection, faceOffsetPoint } from './cad/routing.js';
import { harnessSolid, harnessBom, harnessModel, harnessFlat, harnessSvg, harnessDxf } from './cad/harness.js';
import { editRouteTable, routeTableCommand, isRouteTableKey, ensureHarness } from './cad/route-edit.js';
import { stdShape } from './cad/stdparts.js';
import { holeOfFace, fastenerPlan, holePattern, holeSeries, FASTENER_KINDS, NUT_KINDS } from './cad/fastener.js';
import { createRenderTools } from './app-render.js';
import { materialName } from './cad/materials.js';
import { sizeControls, sizeTableHtml, stdSummary, placementGroup, routeSettings, routePoints as routePointsHtml, routeBomHtml, stdNames, routeBranches, harnessTables, harnessResults, harnessLabels } from './ui/pm-std.js';
import { escapeHtml } from './ui/dom.js';
import { select as selectHtml } from './ui/propertymanager.js';
import { icon } from './icons.js';

const MODES = new Set(['stdLibrary', 'smartFastener', 'asmRoute', 'render', 'harnessSheet']);
const ROUTE_MATERIAL = { pipe: 'steel-1020', tube: 'copper', cable: 'rubber', harness: 'rubber' };
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
    const key = stdKey(p);
    let found = pr.parts.find((x) => x.std === key) ?? made.find((x) => x.std === key);
    if (found) return found;
    const name = designation(p, names());
    found = createPart(name, { std: key, material: STD_ITEMS[p.kind].material, partNo: name, description: t(`std.item.${p.kind}`) });
    const params = { kind: p.kind, size: p.size, dn: p.dn, length: Number(p.length) || 0, x: 0, y: 0, z: 0, axis: 'z', angle: 0, merge: false };
    const item = STD_ITEMS[p.kind];
    if (item.threads) params.threads = p.threads ?? 'auto';
    if (item.gear || item.pulley) {
      for (const k of Object.keys(GEAR_PARAMS[p.kind])) params[k] = p[k] ?? GEAR_PARAMS[p.kind][k];
      if (item.gear) params.module = Number(p.module);
      params.teeth = Math.round(Number(params.teeth));
    }
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
      else if (item.pulley) p.size = value;
      else {
        p.size = value;
        const list = item.lengths?.(String(value)) ?? [];
        if (list.length && !list.includes(Number(p.length))) p.length = list.reduce((b, l) => (Math.abs(l - Number(p.length)) < Math.abs(b - Number(p.length)) ? l : b), list[0]);
      }
      return true;
    }
    if (key === 'stdLength') { p.length = Number(value); return true; }
    if (key === 'stdModule') { p.module = Number(value); return true; }
    if (key === 'stdThreads') { p.threads = value; return true; }
    if (key === 'stdHand') { p.hand = value; return true; }
    return false;
  }

  // ───────────────────────── smart fasteners

  const FASTENER_DEFAULTS = { kind: 'hexBolt', washer: true, springWasher: false, nutWasher: false, nut: true, nutKind: 'hexNut', pattern: true, series: true, lock: true, threads: 'auto' };

  function startFastener() {
    const a = asm();
    if (!a?.components.length) { notify('info', t('notice.assemblyOnly')); return; }
    begin({ mode: 'smartFastener', ...FASTENER_DEFAULTS, last: null, made: [], group: a.fasteners?.at(-1)?.id ?? null });
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

  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  /** World ↔ part frame of a picked component (and of a part inside a sub-assembly). */
  function frames(topo) {
    const toWorld = (p) => placePoint(topo.comp, topo.inner ? placePoint(topo.inner, p) : p);
    const dirWorld = (d) => placeDir(topo.comp, topo.inner ? placeDir(topo.inner, d) : d);
    const dirLocal = (d) => { let v = rotate(quatConjugate(topo.comp.rotation), d); if (topo.inner) v = rotate(quatConjugate(topo.inner.rotation), v); return v; };
    return { toWorld, dirWorld, dirLocal };
  }

  /** Every hole of a part's faces (holeOfFace of each cylindrical face), with its face. */
  function holesOf(faces) {
    const out = [];
    for (const f of faces ?? []) { try { const h = holeOfFace(f, faces); if (h) out.push({ ...h, face: f }); } catch { /* not a hole */ } }
    return out;
  }

  /**
   * The holes on the same axis in the other components (stacked parts): intervals along the entry normal into
   * the material (t from the entry face), with the faces at their ends.
   */
  function seriesSegments(a, host, axisPoint, n, minD) {
    const segs = [];
    // Every part of every component — a sub-assembly's parts too, at their place in it — except the picked one.
    const leaves = (c) => ctx.partLeaves?.(c) ?? (c.part ? [{ path: [], placement: null, entry: ctx.partEntry?.(c) }] : []);
    for (const c of a.components) {
      if (c.hidden) continue;
      for (const leaf of leaves(c)) {
      if (c.id === host.comp.id && (leaf.path ?? []).join('/') === (host.path ?? []).join('/')) continue;
      const entry = leaf.entry;
      if (!entry?.faces) continue;
      const topo = { comp: c, inner: leaf.path?.length ? leaf.placement : null, path: leaf.path ?? [] };
      const fr = frames(topo);
      for (const h of holesOf(entry.faces)) {
        if (h.diameter < minD) continue;
        const dirW = fr.dirWorld(h.axis.dir);
        if (Math.abs(Math.abs(dot3(dirW, n)) - 1) > 1e-5) continue;
        const off = sub3(fr.toWorld(h.axis.point), axisPoint); const along = dot3(off, n);
        if (Math.hypot(off[0] - n[0] * along, off[1] - n[1] * along, off[2] - n[2] * along) > 0.05) continue;
        const ts = h.ends.map((e) => -dot3(sub3(fr.toWorld(e.centre), axisPoint), n));
        const near = ts[0] <= ts[1] ? 0 : 1; const far = 1 - near;
        // Open toward the entry (the bolt can come in) and, for a nut, open at the far end too.
        if (!h.ends[near].open) continue;
        segs.push({ topo, t0: ts[near], t1: ts[far], through: h.through, diameter: h.diameter, farFace: h.ends[far].face });
      }
      }
    }
    return segs;
  }

  /** The plan of a stored fastener spec. */
  function planOf(spec) {
    const hole = { diameter: spec.diameter, depth: spec.grip, through: spec.through, ends: [{ open: true, normal: [0, 0, 1], centre: [0, 0, 0] }, { open: spec.through, normal: [0, 0, -1], centre: [0, 0, -spec.grip] }] };
    return fastenerPlan(hole, { ...spec.opts, kind: spec.kind, prefer: 0, grip: spec.grip, through: spec.through, size: spec.size ?? null, length: spec.length ?? null });
  }

  /**
   * One fastener (a "spec": what it is and where — plain data, stored with the assembly so it can be made again
   * with another size or length): its stack of components and the mates that hold it. Returns { plan, comps, mates }.
   */
  function insertStack(pr, a, spec, made) {
    const plan = planOf(spec);
    if (plan.error) return { plan, comps: [], mates: [] };
    const n = spec.place.n; const q = rotationTo(n); const qf = rotationTo(n.map((v) => -v));
    const comps = []; const mates = [];
    const count = {};
    const mate = (type, aRef, bRef, extra = {}) => { count[type] = (count[type] ?? a.mates.filter((m) => m.type === type).length) + 1; mates.push({ id: ctx.newId('mate'), type, aligned: 'anti', a: aRef, b: bRef, name: `${t(`mate.${type}`)}${count[type]}`, ...extra }); };
    const at = (k) => spec.place.entry.map((v, i) => v + n[i] * k);
    let headSide = null; let nutSide = null;
    for (const item of plan.stack) {
      const p = { ...stdDefaults(item.kind), size: item.size, ...(item.length ? { length: item.length } : {}) };
      if (STD_ITEMS[item.kind].threads) p.threads = spec.threads ?? 'auto';
      const lp = libraryPart(pr, p, made);
      const c = { ...newComponent(a, lp, { position: at(item.at), rotation: [...(item.flip ? qf : q)] }), fixed: false };
      a.components.push(c); comps.push(c);
      const r = stdMateRefs(p);
      mate('concentric', { comp: c.id, ...r.axis }, spec.host.axis);
      if (item.flip) { mate('coincident', { comp: c.id, ...r.bottom }, nutSide ?? spec.host.exit); nutSide = { comp: c.id, ...r.top }; }
      else { mate('coincident', { comp: c.id, ...r.bottom }, headSide ?? spec.host.entry); headSide = { comp: c.id, ...r.top }; }
      if (spec.opts.lock && spec.host.spin) mate('parallel', { comp: c.id, ...r.spin }, spec.host.spin, { aligned: 'aligned' });
    }
    a.mates.push(...mates);
    return { plan, comps, mates };
  }

  /** The fastener specs for a picked hole: one per hole of its pattern (or just it), each through its stack. */
  function specsForHole(e, a, topo) {
    const faces = topo.entry?.faces ?? [];
    const hole = holeOfFace(topo.shape, faces);
    if (!hole) return { error: 'notHole' };
    const fr = frames(topo);
    const base = fastenerPlan(hole, { kind: e.kind, washer: e.washer, nut: e.nut, up: fr.dirLocal([0, 0, 1]) });
    if (base.error) return { error: base.error };
    const all = holesOf(faces);
    const picked = all.find((h) => h.face === topo.shape) ?? { ...hole, face: topo.shape };
    const group = e.pattern ? holePattern(picked, base.entry, all) : [{ hole: picked, entry: base.entry }];
    const specs = [];
    for (const { hole: h, entry } of group) {
      const en = h.ends[entry]; const ex = h.ends[1 - entry];
      if (!en.face) continue;
      const n = fr.dirWorld(en.normal);
      const pEntry = fr.toWorld(en.centre);
      const host = { axis: refOfFace(topo, h.face), entry: refOfFace(topo, en.face), exit: ex.face ? refOfFace(topo, ex.face) : null, spin: null };
      // A plane through the hole's axis in the host's frame where the fastener's +X goes: its spin lock.
      const xw = rotate(rotationTo(n), [1, 0, 0]);
      host.spin = { comp: topo.comp.id, kind: 'plane', point: [...(topo.inner ? placePoint(topo.inner, h.axis.point) : h.axis.point)], dir: rotate(quatConjugate(topo.comp.rotation), xw), ...(topo.inner ? { path: topo.path } : {}) };
      let grip = h.depth; let through = h.through; let diameter = h.diameter; let parts = [topo.comp.id];
      if (e.series && h.through) {
        const segs = [{ t0: 0, t1: h.depth, through: true, diameter: h.diameter, farFace: ex.face, topo }, ...seriesSegments(a, topo, pEntry, n, h.diameter * 0.6)];
        const ser = holeSeries(segs);
        if (ser.chain.length > 1) {
          grip = ser.grip; through = ser.through;
          const last = ser.last;
          if (through && last.farFace) host.exit = refOfFace(last.topo, last.farFace);
          if (!through) diameter = last.diameter; // the bolt screws into the tapped hole of the last part
          parts = ser.chain.map((sg) => sg.topo.comp.id);
        }
      }
      specs.push({ kind: e.kind, size: null, length: null, threads: e.threads ?? 'auto', opts: { washer: e.washer, springWasher: e.springWasher, nutWasher: e.nutWasher, nut: e.nut, nutKind: e.nutKind, lock: e.lock }, host, place: { entry: pEntry, n }, grip, through, diameter, parts });
    }
    return { specs, hole };
  }

  async function fastenerPick(hit) {
    const e = editing(); const a = asm();
    await ctx.ensureKernel();
    const topo = ctx.topoOf(hit);
    if (hit?.kind !== 'face' || !topo?.comp || !topo.shape) { notify('info', t('notice.pickComponentFace')); return null; }
    const found = specsForHole(e, a, topo);
    if (found.error) { notify('warning', t(found.error === 'notHole' ? 'fastener.notHole' : `fastener.${found.error}`)); return null; }
    if (!found.specs.length) { notify('warning', t('fastener.no-entry')); return null; }
    const made = []; const groups = []; const allComps = []; const allMates = [];
    let firstPlan = null; let firstError = null;
    ctx.change('op.smartFastener', (pr) => {
      a.fasteners ??= [];
      for (const spec of found.specs) {
        const r = insertStack(pr, a, spec, made);
        if (r.plan.error) { firstError ??= r.plan.error; continue; }
        firstPlan ??= r.plan;
        const g = { id: ctx.newId('fst'), name: designation(r.plan.bolt), comps: r.comps.map((c) => c.id), mates: r.mates.map((m) => m.id), spec };
        a.fasteners.push(g); groups.push(g);
        allComps.push(...r.comps); allMates.push(...r.mates);
      }
      for (const m of made) pr.parts.push(m);
    });
    if (!firstPlan) { notify('warning', t(`fastener.${firstError ?? 'too-small'}`)); return null; }
    e.group = groups[0]?.id ?? null;
    e.last = { plan: firstPlan, diameter: found.hole.diameter, depth: firstPlan.grip, holes: groups.length, stacked: (found.specs[0]?.parts?.length ?? 1) > 1, names: allComps.map((c) => c.name) };
    e.made.push(...allComps.map((c) => c.name));
    const failed = allMates.filter((m) => state.failedMates.has(m.id));
    notify(failed.length ? 'warning' : 'success', t('fastener.madeMany', { bolt: designation(firstPlan.bolt), count: allComps.length, holes: groups.length }));
    ctx.renderLeft();
    return { plan: firstPlan, comps: allComps.map((c) => c.id), mates: allMates.map((m) => m.id), groups: groups.map((g) => g.id) };
  }

  /** Removes a fastener's components and mates from the assembly (inside a change). */
  function removeStack(a, g) {
    const gone = new Set(g.comps);
    a.components = a.components.filter((c) => !gone.has(c.id));
    a.mates = a.mates.filter((m) => !g.mates.includes(m.id) && !gone.has(m.a?.comp) && !gone.has(m.b?.comp));
  }

  /**
   * Changes a fastener after it was inserted — `change`: { size, length, kind, threads, opts } — its parts are
   * made again on the same hole(s). A new size picks the length again unless one is given.
   */
  function editFastener(groupId, change = {}) {
    const a = asm();
    const g = a?.fasteners?.find((x) => x.id === groupId);
    if (!g) return null;
    const spec = { ...g.spec, ...change, opts: { ...g.spec.opts, ...(change.opts ?? {}) } };
    if ((change.size || change.kind) && change.length === undefined) spec.length = null;
    const check = planOf(spec);
    if (check.error) { notify('warning', t(`fastener.${check.error}`)); return null; }
    const made = [];
    let result = null;
    ctx.change('op.editFastener', (pr) => {
      removeStack(a, g);
      const r = insertStack(pr, a, spec, made);
      for (const m of made) pr.parts.push(m);
      Object.assign(g, { spec, name: designation(r.plan.bolt), comps: r.comps.map((c) => c.id), mates: r.mates.map((m) => m.id) });
      result = r;
    });
    ctx.renderLeft();
    return result ? { plan: result.plan, comps: result.comps.map((c) => c.id), mates: result.mates.map((m) => m.id) } : null;
  }

  function deleteFastener(groupId) {
    const a = asm();
    const g = a?.fasteners?.find((x) => x.id === groupId);
    if (!g) return;
    ctx.change('op.deleteFastener', () => { removeStack(a, g); a.fasteners = a.fasteners.filter((x) => x !== g); });
    const e = editing();
    if (e?.mode === 'smartFastener') e.group = a.fasteners.at(-1)?.id ?? null;
    ctx.renderLeft();
  }

  function fastenerPm(e) {
    const { pmHead, pmGroup } = ctx.pm;
    const a = asm();
    const last = e.last;
    const check = (key, glyph, label) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="${key}" ${e[key] ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(t(label))}</span></label>`;
    const res = last ? pmGroup('check', t('fastener.result'), `<dl class="pm-results"><dt>${escapeHtml(t('fastener.hole'))}</dt><dd>${escapeHtml(`Ø${ctx.fmt(last.diameter, 2)} × ${ctx.fmt(last.depth, 2)} (${t(last.plan.through ? 'fastener.through' : 'fastener.blind')})`)}</dd><dt>${escapeHtml(t('fastener.fit'))}</dt><dd>${escapeHtml(t(`fastener.fit.${last.plan.fit}`))}</dd><dt>${escapeHtml(t('fastener.bolt'))}</dt><dd>${escapeHtml(designation(last.plan.bolt))}</dd><dt>${escapeHtml(t('fastener.holes'))}</dt><dd>${last.holes}${last.stacked ? ` · ${escapeHtml(t('fastener.stacked'))}` : ''}</dd></dl>`) : '';
    const groups = a?.fasteners ?? [];
    const sel = groups.find((g) => g.id === e.group) ?? null;
    let editor = '';
    if (sel) {
      const plan = planOf(sel.spec);
      const sizes = STD_ITEMS[sel.spec.kind]?.sizes ?? [];
      editor = [
        selectHtml('fastEditKind', FASTENER_KINDS.map((k) => [k, t(`std.item.${k}`), STD_ITEMS[k].icon]), sel.spec.kind, t('fastener.type')),
        selectHtml('fastSize', sizes.map((s) => [s, s]), plan.size ?? '', t('fastener.size')),
        selectHtml('fastLength', (plan.lengths ?? []).map((l) => [String(l), `${l} mm`]), String(plan.bolt?.length ?? ''), t('fastener.length')),
        `<p class="pm-note">${escapeHtml(t('fastener.editNote'))}</p>`,
        `<div class="pm-row"><button class="small-button" data-pm="fastener.delete" title="${escapeHtml(t('fastener.delete'))}">${icon('trash')}<span>${escapeHtml(t('fastener.delete'))}</span></button></div>`,
      ].join('');
    }
    const list = groups.length ? `${selectHtml('fastGroup', groups.map((g, i) => [g.id, `${i + 1}. ${g.name}`, 'smartFastener']), e.group ?? '', t('fastener.inserted'))}${editor}` : `<p class="pm-note">${escapeHtml(t('fastener.none'))}</p>`;
    return [
      pmHead('smartFastener', t('cmd.smartFastener'), t('pm.help.smartFastener')),
      pmGroup('hexBolt', t('fastener.type'), `${selectHtml('fastKind', FASTENER_KINDS.map((k) => [k, `${t(`std.item.${k}`)} (${STD_ITEMS[k].standard})`, STD_ITEMS[k].icon]), e.kind, t('fastener.type'))}${selectHtml('fastThreads', [['auto', t('thread.mode.auto')], ['cosmetic', t('thread.mode.cosmetic')], ['modelled', t('thread.mode.modelled')]], e.threads ?? 'auto', t('thread.display'))}`),
      pmGroup('flatWasher', t('fastener.stack'), `${check('washer', 'flatWasher', 'fastener.washer')}${check('springWasher', 'springWasher', 'fastener.springWasher')}${check('nut', 'hexNut', 'fastener.nut')}${e.nut ? `${selectHtml('fastNutKind', NUT_KINDS.map((k) => [k, `${t(`std.item.${k}`)} (${STD_ITEMS[k].standard})`, STD_ITEMS[k].icon]), e.nutKind, t('fastener.nutKind'))}${check('nutWasher', 'flatWasher', 'fastener.nutWasher')}` : ''}<p class="pm-note">${escapeHtml(t('fastener.rules'))}</p>`),
      pmGroup('featCirPattern', t('fastener.holesGroup'), `${check('pattern', 'featCirPattern', 'fastener.pattern')}${check('series', 'stackedHoles', 'fastener.series')}${check('lock', 'lockRotation', 'fastener.lock')}`),
      res,
      pmGroup('smartFastener', t('fastener.edit'), list),
    ].join('');
  }

  // ───────────────────────── routing

  const routeKinds = (kind) => {
    const f = { ...STD_DEFAULTS.route(), kind, points: kind === 'cable' ? [[0, 0, 0], [40, 30, 20], [90, 0, 50], [140, 40, 60]] : kind === 'harness' ? [[0, 0, 20], [150, 0, 20], [300, 0, 20]] : STD_DEFAULTS.route().points, ...(kind === 'tube' ? { bendRadius: 30 } : {}), ...(kind === 'harness' ? { bendRadius: 20, diameter: 4 } : {}) };
    return kind === 'harness' ? ensureHarness(f) : f;
  };
  /** A route's solid and BOM (harnesses have their own). */
  const routeBuild = (f, features = []) => {
    if (f.kind === 'harness') { const r = harnessSolid(f, features); return { r, bom: harnessBom(r.model) }; }
    const r = routeSolid(f, features, stdShape);
    return { r, bom: routeBom(f, features, { measured: r.measured }) };
  };

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
    begin({ mode: 'asmRoute', f: { ...routeKinds(kind), points: [], ...(kind === 'harness' ? { branches: [], connectors: [], clips: [], wires: [] } : {}) }, standoff: 0, error: null });
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
      const { r, bom } = routeBuild(e.f, []);
      e.bom = bom;
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
      routeBranches(A, e.f),
      e.f.kind === 'harness' ? harnessTables(A, e.f, []) : '',
      pmGroup('pointTool', t('route.pickOptions'), pmNum('standoff', e.standoff, t('route.standoff'), 'smartDim', ctx.units())),
      e.error ? `<p class="pm-error">${icon('error')}<span>${escapeHtml(t(`rebuild.${e.error}`, null, e.error))}</span></p>` : '',
      routeBomHtml(A, e.bom),
      harnessResults(A, e.f, e.bom, []),
    ].join('');
  }

  function asmRoutePick(hit, ev) {
    const e = editing();
    let p = null;
    const topo = hit?.kind === 'face' ? ctx.topoOf(hit) : null;
    if (hit?.point && topo?.comp) {
      p = hit.point.slice();
      if (e.standoff && topo.shape) {
        try {
          const placement = topo.inner ? composePlacement(topo.comp, topo.inner) : topo.comp;
          p = faceOffsetPoint(p, placement, (local) => topo.shape.normalAt(local), e.standoff);
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
      rp.features.push(createFeature(rp, 'route', JSON.parse(JSON.stringify(e.f))));
      pr.parts.push(rp);
      comp = { id: ctx.newId('cmp'), part: rp.id, name: instanceName(a, rp.name, rp.id), position: [0, 0, 0], rotation: quatIdentity(), fixed: true };
      a.components.push(comp);
    });
    notify('success', t('route.made', { name: comp.name, length: ctx.fmtLen(e.bom?.length ?? 0) }));
    return comp;
  }

  // ───────────────────────── rendering (app-render.js: path tracer, preview, appearances)

  const rnd = createRenderTools(ctx, { begin, editing });
  const { startRender, rerender, saveRender } = rnd;

  // ───────────────────────── PropertyManager hooks

  function pm(e) {
    if (e.mode === 'stdLibrary') return libraryPm(e);
    if (e.mode === 'smartFastener') return fastenerPm(e);
    if (e.mode === 'asmRoute') return asmRoutePm(e);
    if (e.mode === 'render') return rnd.pm(e);
    if (e.mode === 'harnessSheet') return harnessSheetPm(e);
    return '';
  }

  function pick(hit, ev) {
    const e = editing();
    if (e.mode === 'smartFastener') return fastenerPick(hit);
    if (e.mode === 'asmRoute') return asmRoutePick(hit, ev);
    return undefined;
  }

  function field(key, raw, v) {
    const e = editing();
    if (e.mode === 'harnessSheet') { if (key === 'hsRowH' && v > 0) setSheetOption('rowH', Math.max(3, Math.min(12, v))); else ctx.renderLeft(); return; }
    if (e.mode === 'render') return rnd.field(key, raw, v);
    if (e.mode === 'asmRoute' && isRouteTableKey(key)) { if (editRouteTable(e.f, key, raw, v) === 'invalid') notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return; }
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return; }
    if (e.mode === 'stdLibrary') {
      if (['teeth', 'mateTeeth'].includes(key)) e.p[key] = Math.max(e.p.kind === 'gearRack' ? 1 : 6, Math.min(400, Math.round(v)));
      else if (['width', 'height'].includes(key)) e.p[key] = Math.max(0.1, v);
      else if (key === 'bore') e.p[key] = Math.max(0, v);
      else if (key === 'helixAngle') e.p[key] = Math.max(0, Math.min(45, v));
      else if (['x', 'y', 'z', 'angle'].includes(key)) e.p[key] = v;
      ctx.renderLeft(); return;
    }
    if (e.mode === 'asmRoute') {
      if (isRouteTableKey(key)) { if (editRouteTable(e.f, key, raw, v) === 'invalid') notify('error', t('notice.invalidValue', { text: raw })); }
      else if (key === 'fill' && v > 0) e.f.fill = Math.min(1, v);
      else if (key === 'endAllowance' && v >= 0) e.f.endAllowance = v;
      else if (key === 'standoff') e.standoff = v;
      else if (['od', 'wall', 'bendRadius', 'diameter'].includes(key) && v > 0) e.f[key] = v;
      ctx.renderLeft(); return;
    }
    ctx.renderLeft();
  }

  function step(key, delta) {
    const e = editing();
    if (e.mode === 'render') return rnd.step(key, delta);
    const target = e.mode === 'stdLibrary' ? e.p : e.mode === 'asmRoute' ? e.f : null;
    if (!target || !Number.isFinite(Number(target[key]))) return;
    const cur = Number(target[key]);
    const inc = key === 'teeth' || key === 'mateTeeth' || key === 'helixAngle' ? 1 : key === 'angle' ? 15 : cur >= 20 ? 5 : 1;
    field(key, String(cur + delta * inc), cur + delta * inc);
  }

  function set(key, value) {
    const e = editing();
    if (e.mode === 'stdLibrary') {
      if (key === 'stdCategory') { e.category = value; const c = STD_CATEGORIES.find((x) => x.id === value); if (c && !c.items.includes(e.p.kind)) setStd(e.p, 'stdKind', c.items[0]); }
      else if (!setStd(e.p, key, value)) e.p[key] = value;
      if (key === 'stdKind') e.category = STD_CATEGORIES.find((c) => c.items.includes(value))?.id ?? e.category;
    } else if (e.mode === 'smartFastener') { if (key === 'fastKind') e.kind = value; }
    else if (e.mode === 'harnessSheet') { if (key === 'hsRotate') setSheetOption('rotate', Number(value)); return; }
    else if (e.mode === 'asmRoute') {
      if (key === 'drawPlane') e.drawPlane = value;
      else if (isRouteTableKey(key)) editRouteTable(e.f, key, value, Number(value));
      else { e.f[key] = value; if (key === 'kind' && value === 'harness') ensureHarness(e.f); }
    }
    else if (e.mode === 'render') { rnd.set(key, value); return; }
    ctx.renderLeft();
  }

  function toggle(key, checked) {
    const e = editing();
    if (e.mode === 'render') { rnd.toggle(key, checked); return; }
    if (e.mode === 'harnessSheet') { const k = { hsAuto: 'auto', hsMirror: 'mirror', hsWires: 'showWires', hsConnectors: 'showConnectors' }[key]; if (k) setSheetOption(k, checked); return; }
    if (e.mode === 'stdLibrary') e.p[key] = checked;
    else e[key] = checked;
    ctx.renderLeft();
  }

  /** Selects (data-pm-select) of the library page and of stdPart features; true when handled. */
  function select(key, value) {
    const e = editing();
    if (e?.mode === 'smartFastener' && key.startsWith('fast')) {
      if (key === 'fastKind') e.kind = value;
      else if (key === 'fastNutKind') e.nutKind = value;
      else if (key === 'fastThreads') e.threads = value;
      else if (key === 'fastGroup') e.group = value || null;
      else if (key === 'fastSize' && e.group) editFastener(e.group, { size: value });
      else if (key === 'fastLength' && e.group) editFastener(e.group, { length: Number(value) });
      else if (key === 'fastEditKind' && e.group) editFastener(e.group, { kind: value });
      ctx.renderLeft();
      return true;
    }
    if (e?.mode === 'render') return rnd.select(key, value);
    if (e?.mode === 'harnessSheet' && key === 'hsScale') { setSheetOption('scale', value === 'auto' ? 'auto' : Number(value)); return true; }
    if (isRouteTableKey(key)) {
      const num = Number(value);
      if (e?.mode === 'asmRoute') { editRouteTable(e.f, key, value, Number.isFinite(num) ? num : null); ctx.renderLeft(); return true; }
      if (routeFeature(e)) { ctx.updateFeature((f) => { editRouteTable(f, key, value, Number.isFinite(num) ? num : null); }); return true; }
      return false;
    }
    if (!key.startsWith('std')) {
      if (e?.mode === 'asmRoute') { e.f[key] = value || null; ctx.renderLeft(); return true; }
      return false;
    }
    if (e?.mode === 'stdLibrary') { setStd(e.p, key, value); ctx.renderLeft(); return true; }
    if (e?.mode === 'feature' && e.feature.type === 'stdPart') { ctx.updateFeature((f) => { setStd(f, key, value); }); return true; }
    return false;
  }

  const routeFeature = (e) => e?.mode === 'feature' && e.feature?.type === 'route';

  /** Typed route table fields of a route feature (branch points, harness tables). True when handled. */
  function featureField(key, raw, v) {
    const e = editing();
    if (!routeFeature(e) || !isRouteTableKey(key)) return false;
    let bad = false;
    ctx.updateFeature((f) => { if (editRouteTable(f, key, raw, v) === 'invalid') bad = true; });
    if (bad) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); }
    return true;
  }

  /** data-pm-set of a stdPart feature (size table rows) or a route feature (swatches, harness kind). True when handled. */
  function featureSet(key, value) {
    const e = editing();
    if (routeFeature(e) && isRouteTableKey(key)) { ctx.updateFeature((f) => { editRouteTable(f, key, value, Number(value)); }); return true; }
    if (routeFeature(e) && key === 'kind') { ctx.updateFeature((f) => { f.kind = value; if (value === 'harness') { ensureHarness(f); f.bendRadius = Math.max(Number(f.bendRadius) || 0, 1); } }); return true; }
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
    if (e?.mode === 'render') rnd.cleanup(e);
    if (e?.mode === 'asmRoute') { ctx.viewport()?.setPreview(null); previewKey = ''; }
  }

  const COMMAND_NAMES = new Set(['std.insert', 'std.render', 'std.renderStop', 'std.renderSave', 'fastener.delete', 'std.harnessUpdate']);
  function handles(name) { return COMMAND_NAMES.has(name) || rnd.handles(name) || (owns(editing()) && ['addPt3', 'delPt3', 'clear', 'routeEdit'].includes(name)) || (name === 'routeEdit' && routeFeature(editing())); }

  /** The flattened harness of the route being edited, saved as SVG or DXF (export path, file dialog). */
  function exportHarness(f, features, format) {
    let flat;
    try { flat = harnessFlat(harnessModel(f, features)); } catch (error) { notify('error', t(`rebuild.${error.code ?? 'route-failed'}`, null, error.code ?? '')); return undefined; }
    const base = `${ctx.fileSafe(ctx.activeName() || 'harness')}-harness`;
    if (format === 'dxf') return ctx.saveExport(`${base}.dxf`, 'dxf', harnessDxf(flat, { labels: harnessLabels(t) }), 'application/dxf');
    return ctx.saveExport(`${base}.svg`, 'svg', harnessSvg(flat, { labels: harnessLabels(t) }), 'image/svg+xml');
  }

  /** The harness to put on a drawing: the active part's first harness route, or (assembly) a route part's. */
  function harnessSource() {
    const e = editing();
    if (e?.mode === 'feature' && e.feature?.type === 'route' && e.feature.kind === 'harness' && part()) return { f: e.feature, features: part().features, part: part() };
    const pt = part();
    const own = pt?.features.find((x) => x.type === 'route' && x.kind === 'harness' && !x.suppressed);
    if (own) return { f: own, features: pt.features, part: pt };
    const a = asm();
    for (const c of a?.components ?? []) {
      const rp = ctx.project()?.parts.find((x) => x.id === c.part);
      const f = rp?.features.find((x) => x.type === 'route' && x.kind === 'harness' && !x.suppressed);
      if (f) return { f, features: rp.features, part: rp };
    }
    return null;
  }

  const sheetLabels = () => ({ ...harnessLabels(t), clips: t('harness.clips') });
  const activeDrw = () => (ctx.project()?.active?.kind === 'drawing' ? ctx.project().drawings.find((d) => d.id === ctx.project().active.id) ?? null : null);

  /** Builds the sheet of annotation `ann` (on drawing `d`) from its harness; throws the rebuild error codes. */
  function rebuildHarnessSheet(d, ann, src) {
    const flat = harnessFlat(harnessModel(src.f, src.features));
    const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3;
    const sheet = harnessSheet(flat, { W, H, labels: sheetLabels(), ids: () => ctx.newId('ann'), title: t('harness.flat'), opts: ann.opts });
    applyHarnessSheet(d, ann, sheet, { source: { part: src.part.id, feature: src.f.id }, key: harnessKey(src.f, src.features) });
    ann.staleText = t('harness.outOfDate');
    return ann;
  }

  /** The harness of a sheet annotation, from its source (part and route feature). */
  function sheetSource(ann) {
    const pt = ctx.project()?.parts.find((x) => x.id === ann.source?.part);
    const f = pt?.features.find((x) => x.id === ann.source?.feature && x.type === 'route' && x.kind === 'harness');
    return f ? { f, features: pt.features, part: pt } : null;
  }

  /**
   * Keeps the harness sheets of drawing `d` associative (app.js calls it before drawing the sheet): a sheet whose
   * harness changed is rebuilt (auto update on) or marked out of date; one whose harness is gone is marked too.
   * Returns true when something changed.
   */
  function syncHarnessDrawings(d) {
    let changed = false;
    for (const ann of (d?.annotations ?? []).filter((x) => x.kind === 'drwHarness' && x.source)) {
      const src = sheetSource(ann);
      if (!src) { if (ann.stale !== 'missing') { ann.stale = 'missing'; ann.staleText = t('harness.sourceMissing'); changed = true; } continue; }
      const key = harnessKey(src.f, src.features);
      if (key === ann.key) { if (ann.stale) { ann.stale = false; changed = true; } continue; }
      if (harnessSheetOptions(ann.opts).auto) {
        try { rebuildHarnessSheet(d, ann, src); } catch { ann.stale = true; ann.staleText = t('harness.outOfDate'); }
      } else if (ann.stale !== true) { ann.stale = true; ann.staleText = t('harness.outOfDate'); }
      changed = true;
    }
    return changed;
  }

  /**
   * Harness Drawing: on a drawing with a harness sheet, its edit page; otherwise a new drawing holding the
   * flattened harness ('drwHarness', associative to the route) with the wire list and the connector tables as
   * the drawing's general tables — it shows, prints and exports like any sheet — and its edit page.
   */
  function harnessDrawing() {
    const dw = activeDrw();
    const existing = dw?.annotations?.find((x) => x.kind === 'drwHarness' && (x.id === state.drawingSelected || true));
    if (existing) { begin({ mode: 'harnessSheet', drawing: dw.id, ann: (dw.annotations.find((x) => x.kind === 'drwHarness' && x.id === state.drawingSelected) ?? existing).id }); return undefined; }
    const src = harnessSource();
    if (!src) { notify('info', t('harness.needHarness')); return undefined; }
    try { harnessFlat(harnessModel(src.f, src.features)); } catch (error) { notify('error', t(`rebuild.${error.code ?? 'route-failed'}`, error.params ?? null, error.code ?? '')); return undefined; }
    if (editing()) ctx.cancelEditing({ quiet: true });
    const name = `${src.part.name} - ${t('harness.flat')}`;
    let d; let ann;
    ctx.change('op.harnessDrawing', (pr) => {
      d = addDrawing(pr, { kind: 'part', id: src.part.id }, name);
      d.views = [];
      ann = { id: ctx.newId('ann'), kind: 'drwHarness', opts: harnessSheetOptions() };
      rebuildHarnessSheet(d, ann, src);
      d.annotations.unshift(ann);
      d.scale = ann.scale; d.autoScale = false;
      pr.active = { kind: 'drawing', id: d.id };
    });
    notify('success', t('notice.drawingCreated', { name: d.name }));
    begin({ mode: 'harnessSheet', drawing: d.id, ann: ann.id });
    return d;
  }

  const sheetOf = (e) => { const d = ctx.project()?.drawings.find((x) => x.id === e.drawing); return { d, ann: d?.annotations.find((x) => x.id === e.ann) ?? null }; };

  /** Changes an option of the harness sheet being edited and rebuilds it from its harness. */
  function setSheetOption(key, value) {
    const e = editing();
    const { d, ann } = sheetOf(e);
    if (!ann) return;
    ctx.change('op.harnessSheet', () => {
      ann.opts = harnessSheetOptions({ ...ann.opts, [key]: value });
      const src = sheetSource(ann);
      if (src && key !== 'auto') { try { rebuildHarnessSheet(d, ann, src); } catch (error) { notify('error', t(`rebuild.${error.code ?? 'route-failed'}`, error.params ?? null, error.code ?? '')); } }
    });
    ctx.renderAll();
  }

  /** Update now (the sheet is out of date and auto update is off). */
  function updateSheet() {
    const { d, ann } = sheetOf(editing());
    const src = ann && sheetSource(ann);
    if (!src) { notify('error', t('harness.sourceMissing')); return; }
    ctx.change('op.harnessSheet', () => { try { rebuildHarnessSheet(d, ann, src); } catch (error) { notify('error', t(`rebuild.${error.code ?? 'route-failed'}`, error.params ?? null, error.code ?? '')); } });
    ctx.renderAll();
  }

  /** The edit page of a harness sheet: status, scale, orientation, tables, auto update. */
  function harnessSheetPm(e) {
    const { pmHead, pmGroup, pmSeg, pmNum, pmButton } = ctx.pm;
    const { ann } = sheetOf(e);
    if (!ann) return pmHead('harnessFlat', t('cmd.harnessDrawing'), t('pm.help.harnessSheet'));
    const o = harnessSheetOptions(ann.opts);
    const src = sheetSource(ann);
    const status = !src ? 'missing' : ann.stale ? 'stale' : 'current';
    const scales = [['auto', t('harness.scaleAuto')], ...HARNESS_SCALES.map((k) => [String(k), k >= 1 ? `${k}:1` : `1:${Math.round(1 / k)}`])];
    const check = (key, on, label, glyph) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
    return [
      pmHead('harnessFlat', t('cmd.harnessDrawing'), t('pm.help.harnessSheet')),
      pmGroup(status === 'current' ? 'check' : 'warning', t('harness.sheetStatus'), `<p class="pm-note ${status === 'current' ? '' : 'warn'}" data-harness-status="${status}">${escapeHtml(t(`harness.status.${status}`))}</p>${status === 'stale' ? `<div class="pm-row">${pmButton('std.harnessUpdate', 'refresh', t('harness.update'))}</div>` : ''}${check('hsAuto', o.auto, t('harness.autoUpdate'), 'refresh')}`),
      pmGroup('scaleTool', t('harness.sheetScale'), `<label class="pm-field"><span class="pm-label">${escapeHtml(t('harness.sheetScale'))}</span><select data-pm-select="hsScale">${scales.map(([v, l]) => `<option value="${v}" ${String(o.scale) === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></label><p class="pm-note">${escapeHtml(t('harness.scaleNow', { scale: ann.scaleLabel ?? '' }))}</p>`),
      pmGroup('rotateTool', t('harness.orientation'), `${pmSeg('hsRotate', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], String(o.rotate))}${check('hsMirror', o.mirror, t('harness.mirror'), 'featMirror')}`),
      pmGroup('generalTable', t('harness.sheetTables'), `${check('hsWires', o.showWires, t('harness.wireList'), 'harnessWire')}${check('hsConnectors', o.showConnectors, t('harness.connectorTables'), 'harnessConnector')}${pmNum('hsRowH', o.rowH, t('harness.rowHeight'), 'generalTable')}`),
    ].join('');
  }

  function routeEdit(arg) {
    const e = editing();
    if (arg === 'exportSvg' || arg === 'exportDxf') {
      const format = arg === 'exportDxf' ? 'dxf' : 'svg';
      if (e?.mode === 'asmRoute') return exportHarness(e.f, [], format);
      if (routeFeature(e)) return exportHarness(e.feature, part()?.features ?? [], format);
      return undefined;
    }
    if (e?.mode === 'asmRoute') { routeTableCommand(e.f, arg); return ctx.renderLeft(); }
    if (routeFeature(e)) ctx.updateFeature((f) => { routeTableCommand(f, arg); });
    return undefined;
  }
  function command(name, arg) {
    const e = editing();
    if (name === 'std.insert') return insertLibrary();
    if (name === 'fastener.delete') { if (e?.group) deleteFastener(e.group); return undefined; }
    if (rnd.handles(name)) return rnd.command(name, arg);
    if (name === 'routeEdit') return routeEdit(arg);
    if (name === 'std.harnessUpdate') return updateSheet();
    if (e?.mode === 'asmRoute') {
      if (name === 'addPt3') { const last = e.f.points.at(-1) ?? [0, 0, 0]; e.f.points.push([last[0] + 50, last[1], last[2]]); }
      if (name === 'delPt3') e.f.points.splice(Number(arg), 1);
      if (name === 'clear') e.f.points = [];
      return ctx.renderLeft();
    }
    return undefined;
  }

  const subject = (e) => t({ stdLibrary: 'cmd.stdLibrary', smartFastener: 'cmd.smartFastener', asmRoute: `cmd.${e.f?.kind ?? 'pipe'}Route`, render: 'cmd.renderView', harnessSheet: 'cmd.harnessDrawing' }[e.mode]);

  // ───────────────────────── commands

  const docOpen = () => Boolean(part() || asm()) && editing()?.mode !== 'sketch';
  const toggleMode = (mode, startFn) => () => (editing()?.mode === mode ? ctx.cancelEditing({ quiet: true }) : startFn());
  const commands = {
    stdLibrary: { icon: 'stdLibrary', label: 'cmd.stdLibrary', enabled: docOpen, checked: () => editing()?.mode === 'stdLibrary', run: toggleMode('stdLibrary', () => startLibrary()) },
    smartFastener: { icon: 'smartFastener', label: 'cmd.smartFastener', enabled: () => Boolean(asm()?.components.length), checked: () => editing()?.mode === 'smartFastener', run: toggleMode('smartFastener', startFastener) },
    pipeRoute: { icon: 'pipeRoute', label: 'cmd.pipeRoute', enabled: docOpen, run: () => startRoute('pipe') },
    tubeRoute: { icon: 'tubeRoute', label: 'cmd.tubeRoute', enabled: docOpen, run: () => startRoute('tube') },
    cableRoute: { icon: 'cableRoute', label: 'cmd.cableRoute', enabled: docOpen, run: () => startRoute('cable') },
    harnessRoute: { icon: 'harnessRoute', label: 'cmd.harnessRoute', enabled: docOpen, run: () => startRoute('harness') },
    harnessDrawing: { icon: 'harnessFlat', label: 'cmd.harnessDrawing', enabled: () => Boolean(harnessSource() || activeDrw()?.annotations?.some((x) => x.kind === 'drwHarness')), checked: () => editing()?.mode === 'harnessSheet', run: () => (editing()?.mode === 'harnessSheet' ? ctx.cancelEditing({ quiet: true }) : harnessDrawing()) },
    renderView: { icon: 'renderView', label: 'cmd.renderView', enabled: docOpen, checked: () => editing()?.mode === 'render', run: toggleMode('render', startRender) },
  };

  /** The CommandManager tab of these tools. */
  const TAB = ['stdLibrary', 'smartFastener', '|', 'pipeRoute', 'tubeRoute', 'cableRoute', 'harnessRoute', 'harnessDrawing', '|', 'renderView'];
  const SUBMENU = { icon: 'stdLibrary', items: ['stdLibrary', 'smartFastener', '-', 'pipeRoute', 'tubeRoute', 'cableRoute', 'harnessRoute', 'harnessDrawing'] };

  return {
    commands, TAB, SUBMENU, owns, pm, pick, field, step, set, toggle, select, featureSet, featureField, accept, cleanup, handles, command, subject,
    startLibrary, startRoute, insertLibrary, harnessDrawing, syncHarnessDrawings, fastenerPick, editFastener, deleteFastener, rerender, saveRender,
    get photo() { return rnd.photo; },
    get renderSettings() { return rnd.renderSettings; },
    setSaveHook(fn) { rnd.setSaveHook(fn); },
    render: rnd,
    routeSection,
  };
}
