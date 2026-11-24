// The main window's side of the added assembly tools (cad/asm-tools.js has the modelling): Replace Components
// and Copy with Mates (PropertyManager pages), Hole Alignment (a check with its result list), and envelopes
// (mark components as envelopes; select what is inside or crossing one). Chained onto the hooks of `more`
// in app.js like the other add-ins.
import { replaceComponents, bestReference, copyWithMates, holeAlignment, envelopeSelection, isEnvelope } from './cad/asm-tools.js';
import { mateEntityOfFace, mateTouches, instanceName, axisOfFace } from './cad/assembly.js';
import { faceSignature, cylinderRadius, isCylinder } from './cad/refs.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const MODES = new Set(['replaceComp', 'copyMates']);

export function createAsmTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const asm = () => ctx.activeAssembly();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const comp = (id) => asm()?.components.find((c) => c.id === id);
  const compName = (id) => comp(id)?.name ?? '?';
  const selectedComps = () => state.selection.filter((s) => s.kind === 'comp').map((s) => s.id).filter((id) => comp(id) && !comp(id).pattern);
  const partName = (id) => ctx.project().parts.find((p) => p.id === id)?.name ?? id;
  const start = (e) => {
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = e;
    state.leftTab = 'pm';
    ctx.renderAll();
  };

  // ───────────────────────── replace components

  function startReplace() {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    const comps = selectedComps().filter((id) => comp(id)?.part);
    const current = comps.length ? comp(comps[0]).part : '';
    const other = ctx.project().parts.find((p) => p.id !== current)?.id ?? '';
    start({ mode: 'replaceComp', comps, part: other, all: false, pick: 'comps' });
    if (!comps.length) notify('info', t('asmx.pickComponents'));
  }

  /** The mate references a part offers: every face, as a plane or an axis in the part's frame. */
  function candidatesOf(partId) {
    const part = ctx.project().parts.find((p) => p.id === partId);
    if (!part) return [];
    let entry; try { entry = ctx.buildPart(part); } catch { return []; }
    const out = [];
    for (const face of entry?.body?.faces ?? []) { try { out.push(mateEntityOfFace(face, faceSignature)); } catch { /* skip */ } }
    return out;
  }

  function replacePm(e) {
    const { pmHead, pmGroup, pmList } = ctx.pm;
    const current = new Set(e.comps.map((id) => comp(id)?.part));
    const parts = ctx.project().parts.filter((p) => !current.has(p.id) || current.size > 1);
    const options = parts.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === e.part ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    const lost = e.comps.length && e.part ? previewLost(e) : null;
    return [
      pmHead('replaceComponent', t('cmd.replaceComponent'), t('asmx.help.replace')),
      pmGroup('assembly', t('asmx.toReplace'), `${pmList('comps', e.comps.map(compName), t('asmx.components'), 'part', e.pick === 'comps')}<label class="pm-check"><input type="checkbox" data-pm-toggle="all" ${e.all ? 'checked' : ''}/>${icon('featLinPattern')}<span>${escapeHtml(t('asmx.allInstances'))}</span></label>`),
      pmGroup('part', t('asmx.withPart'), parts.length
        ? `<label class="pm-field"><span class="pm-label">${escapeHtml(t('asmx.newPart'))}</span><select data-pm-select="part" aria-label="${escapeHtml(t('asmx.newPart'))}">${options}</select></label>${lost ? `<p class="pm-note ${lost.lost ? 'warn' : ''}">${lost.lost ? icon('warning', 'icon tiny') : ''}${escapeHtml(t('asmx.replacePreview', { mates: lost.mates, lost: lost.lost }))}</p>` : ''}`
        : `<p class="pm-note warn">${icon('warning', 'icon tiny')}${escapeHtml(t('asmx.noOtherPart'))}</p>`),
    ].join('');
  }

  /** How many mate references the replacement would find again (on a copy of the assembly). */
  function previewLost(e) {
    const a = asm(); if (!a) return null;
    const copy = JSON.parse(JSON.stringify({ components: a.components, mates: a.mates }));
    const cands = candidatesOf(e.part);
    const r = replaceComponents(copy, e.comps, e.part, (ref) => (ref.path ? ref : bestReference(ref, cands)), { allInstances: e.all });
    return { mates: copy.mates.filter((m) => r.replaced.some((id) => mateTouches(m, id))).length, lost: r.lost.length };
  }

  function acceptReplace() {
    const e = editing(); const a = asm();
    if (!e.comps.length) { notify('error', t('asmx.pickComponents')); return; }
    if (!e.part) { notify('error', t('asmx.noOtherPart')); return; }
    const cands = candidatesOf(e.part);
    let r = null;
    state.editing = null; state.leftTab = 'tree';
    ctx.change('op.replaceComponent', () => {
      r = replaceComponents(a, e.comps, e.part, (ref) => (ref.path ? ref : bestReference(ref, cands)), { allInstances: e.all });
      // The instances take the new part's name.
      for (const id of r.replaced) { const c = comp(id); if (c) c.name = instanceName(a, partName(e.part), e.part); }
    });
    notify(r.lost.length ? 'warning' : 'success', t(r.lost.length ? 'asmx.replacedLost' : 'asmx.replaced', { count: r.replaced.length, lost: r.lost.length }));
  }

  // ───────────────────────── copy with mates

  function startCopy() {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    const [id] = selectedComps();
    start({ mode: 'copyMates', comp: id ?? null, plan: {}, pick: id ? null : 'comp' });
    if (!id) notify('info', t('asmx.pickComponent'));
  }

  const matesOf = (e) => (asm()?.mates ?? []).filter((m) => e.comp && mateTouches(m, e.comp) && !m.suppressed);
  const otherSide = (m, id) => ['a', 'b', 'c', 'd'].map((k) => m[k]).find((r) => r && r.comp !== id);

  function copyPm(e) {
    const { pmHead, pmGroup, pmList, pmSeg } = ctx.pm;
    const rows = matesOf(e).map((m) => {
      const p = e.plan[m.id] ?? { mode: 'repeat' };
      const other = otherSide(m, e.comp);
      const pick = p.mode === 'new'
        ? pmList(`mate:${m.id}`, p.other ? [`${compName(p.other.comp)} — ${t(p.other.kind === 'axis' ? 'smartMate.cylinder' : 'smartMate.planar')}`] : [], t('asmx.newReference'), 'face', e.pick === `mate:${m.id}`)
        : '';
      return `<div class="asmx-mate"><div class="asmx-mate-head">${icon('mate')}<b>${escapeHtml(m.name ?? m.type)}</b><span class="pm-note">${escapeHtml(other ? compName(other.comp) : '')}</span></div>${pmSeg(`plan:${m.id}`, [['repeat', t('asmx.repeat'), 'refresh'], ['new', t('asmx.newRef'), 'face'], ['skip', t('asmx.skip'), 'close']], p.mode)}${pick}</div>`;
    });
    return [
      pmHead('copyWithMates', t('cmd.copyWithMates'), t('asmx.help.copy')),
      pmGroup('assembly', t('asmx.componentToCopy'), pmList('comp', e.comp ? [compName(e.comp)] : [], t('asmx.component'), 'part', e.pick === 'comp')),
      pmGroup('mate', t('asmx.mates'), rows.length ? rows.join('') : `<p class="pm-note">${escapeHtml(t('asmx.noMates'))}</p>`),
    ].join('');
  }

  function acceptCopy() {
    const e = editing(); const a = asm();
    if (!e.comp) { notify('error', t('asmx.pickComponent')); return; }
    const missing = matesOf(e).filter((m) => e.plan[m.id]?.mode === 'new' && !e.plan[m.id]?.other);
    if (missing.length) { notify('error', t('asmx.pickNewReference', { name: missing[0].name ?? missing[0].type })); return; }
    const src = comp(e.comp);
    const part = ctx.project().parts.find((p) => p.id === src.part);
    const count = new Map();
    let made = null;
    state.editing = null; state.leftTab = 'tree';
    ctx.change('op.copyWithMates', () => {
      made = copyWithMates(a, e.comp, e.plan, {
        newId: ctx.newId,
        nameOf: () => instanceName(a, part?.name ?? src.name, src.part),
        mateName: (m) => { const n = (count.get(m.type) ?? a.mates.filter((x) => x.type === m.type).length) + 1; count.set(m.type, n); return `${t(`mate.${m.type}`)}${n}`; },
        offset: [ctx.assemblySize(a) * 0.15, 0, 0],
      });
    });
    state.selection = [{ kind: 'comp', id: made.component.id, key: `comp:${made.component.id}` }];
    notify('success', t('asmx.copied', { name: made.component.name, count: made.mates.length }));
    ctx.renderAll();
  }

  // ───────────────────────── hole alignment

  /** The distance of a point from a hole's axis line. */
  const lineGap = (h, p) => {
    const d = [p[0] - h.point[0], p[1] - h.point[1], p[2] - h.point[2]];
    const t = d[0] * h.dir[0] + d[1] * h.dir[1] + d[2] * h.dir[2];
    return Math.hypot(d[0] - t * h.dir[0], d[1] - t * h.dir[1], d[2] - t * h.dir[2]);
  };

  /** The holes of a placed component: inward cylinders, with their axis and extent, in assembly space. */
  function holesOf(c) {
    const out = [];
    for (const { shape } of ctx.componentShapes(c)) {
      for (const face of shape.faces) {
        if (!isCylinder(face.geomType)) continue;
        const ax = axisOfFace(face); const radius = cylinderRadius(face);
        if (!ax || !radius) continue;
        let inward = false;
        try {
          const p = face.pointOnSurface(0.5, 0.5); const n = face.normalAt(p);
          const q = [p.x - ax.point[0], p.y - ax.point[1], p.z - ax.point[2]];
          const along = q[0] * ax.dir[0] + q[1] * ax.dir[1] + q[2] * ax.dir[2];
          const radial = [q[0] - along * ax.dir[0], q[1] - along * ax.dir[1], q[2] - along * ax.dir[2]];
          inward = radial[0] * n.x + radial[1] * n.y + radial[2] * n.z < 0;
        } catch { continue; }
        if (!inward) continue;
        const ts = face.edges.flatMap((e) => [e.startPoint, e.endPoint, e.pointAt(0.5)]).map((v) => (v.x - ax.point[0]) * ax.dir[0] + (v.y - ax.point[1]) * ax.dir[1] + (v.z - ax.point[2]) * ax.dir[2]);
        const lo = Math.min(...ts); const hi = Math.max(...ts);
        // One hole can be several faces (half cylinders, split at a seam): faces on the same axis with the same
        // radius are one hole, its extent the union of theirs.
        const same = out.find((h) => Math.abs(h.radius - radius) < 1e-6 && Math.abs(Math.abs(h.dir[0] * ax.dir[0] + h.dir[1] * ax.dir[1] + h.dir[2] * ax.dir[2]) - 1) < 1e-9 && lineGap(h, ax.point) < 1e-6);
        if (same) {
          const s0 = (ax.point[0] - same.point[0]) * same.dir[0] + (ax.point[1] - same.point[1]) * same.dir[1] + (ax.point[2] - same.point[2]) * same.dir[2];
          const k = Math.sign(same.dir[0] * ax.dir[0] + same.dir[1] * ax.dir[1] + same.dir[2] * ax.dir[2]) || 1;
          const a0 = s0 + k * lo; const a1 = s0 + k * hi;
          same.lo = Math.min(same.lo, a0, a1); same.hi = Math.max(same.hi, a0, a1);
        } else out.push({ comp: c.id, point: ax.point, dir: ax.dir, radius, lo, hi });
      }
    }
    return out;
  }

  async function checkHoles() {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return undefined; }
    const tol = Math.max(0, Number(state.settings.holeAlignTolerance ?? 0.01));
    const r = await ctx.withProgress('asmx.checkingHoles', a.name, () => {
      const holes = a.components.filter((c) => !c.hidden && !c.suppressed && !isEnvelope(c)).flatMap((c) => holesOf(c));
      return holeAlignment(holes, { tolerance: tol });
    });
    state.holeAlignment = r;
    const items = r.misaligned.map((m) => ({ a: compName(m.a), b: compName(m.b), offset: m.offset, radiusA: m.radiusA, radiusB: m.radiusB }));
    notify(items.length ? 'warning' : 'success', items.length ? t('asmx.holesOff', { count: items.length }) : t('asmx.holesOk', { count: r.checked }));
    await ctx.popups.open('interference', { mode: 'holes', items, checked: r.checked, aligned: r.aligned, tolerance: tol });
    return r;
  }

  // ───────────────────────── envelopes

  function toggleEnvelope() {
    const a = asm(); if (!a) return;
    const ids = selectedComps();
    if (!ids.length) { notify('info', t('asmx.pickComponents')); return; }
    const on = !ids.every((id) => isEnvelope(comp(id)));
    ctx.change('op.envelope', () => { for (const id of ids) { const c = comp(id); if (on) c.envelope = true; else delete c.envelope; } });
    notify('success', t(on ? 'asmx.envelopeOn' : 'asmx.envelopeOff', { count: ids.length }));
  }

  function boxesOf(a) {
    const boxes = new Map();
    for (const c of a.components) {
      if (c.hidden || c.suppressed) continue;
      let lo = [Infinity, Infinity, Infinity]; let hi = [-Infinity, -Infinity, -Infinity];
      for (const { shape } of ctx.componentShapes(c)) {
        const [l, h] = shape.boundingBox.bounds;
        lo = lo.map((v, i) => Math.min(v, l[i])); hi = hi.map((v, i) => Math.max(v, h[i]));
      }
      if (Number.isFinite(lo[0])) boxes.set(c.id, [lo, hi]);
    }
    return boxes;
  }

  function selectByEnvelope(mode) {
    const a = asm(); if (!a) return;
    const env = selectedComps().find((id) => isEnvelope(comp(id))) ?? a.components.find((c) => isEnvelope(c))?.id;
    if (!env) { notify('info', t('asmx.needEnvelope')); return; }
    const ids = envelopeSelection(env, boxesOf(a), mode).filter((id) => !isEnvelope(comp(id)));
    state.selection = ids.map((id) => ({ kind: 'comp', id, key: `comp:${id}` }));
    ctx.viewport()?.setSelection(ids.map((id) => ({ kind: 'body', bodyKey: `comp:${id}` })));
    notify('info', t('asmx.envelopeSelected', { count: ids.length, name: compName(env) }));
    ctx.renderAll();
  }

  // ───────────────────────── PropertyManager hooks

  function pm(e) { return e.mode === 'replaceComp' ? replacePm(e) : copyPm(e); }

  function pick(hit) {
    const e = editing();
    const topo = ctx.topoOf(hit);
    const c = topo?.comp;
    if (!c) { notify('info', t('notice.pickComponentFace')); return undefined; }
    if (e.mode === 'replaceComp') {
      if (c.pattern) { notify('info', t('compPattern.instancePicked')); return undefined; }
      const i = e.comps.indexOf(c.id);
      if (i >= 0) e.comps.splice(i, 1); else e.comps.push(c.id);
      if (e.comps.length === 1 && (!e.part || e.part === c.part)) e.part = ctx.project().parts.find((p) => p.id !== c.part)?.id ?? '';
      ctx.viewport()?.setSelection(e.comps.map((id) => ({ kind: 'body', bodyKey: `comp:${id}` })));
      return ctx.renderLeft();
    }
    if (e.pick === 'comp' || !e.comp) {
      if (c.pattern) { notify('info', t('compPattern.instancePicked')); return undefined; }
      e.comp = c.id; e.plan = {}; e.pick = null;
      return ctx.renderLeft();
    }
    if (e.pick?.startsWith('mate:')) {
      if (hit?.kind !== 'face' || !topo.shape) { notify('info', t('notice.pickComponentFace')); return undefined; }
      if (c.id === e.comp) { notify('info', t('asmx.notTheCopied')); return undefined; }
      const id = e.pick.slice(5);
      const ent = mateEntityOfFace(topo.shape, faceSignature);
      e.plan[id] = { ...(e.plan[id] ?? {}), mode: 'new', other: { comp: c.id, ...ent } };
      e.pick = null;
      return ctx.renderLeft();
    }
    return undefined;
  }

  function set(key, value) {
    const e = editing();
    if (key.startsWith('plan:')) {
      const id = key.slice(5);
      e.plan[id] = { ...(e.plan[id] ?? {}), mode: value };
      if (value === 'new' && !e.plan[id].other) e.pick = `mate:${id}`;
    } else e[key] = value;
    ctx.renderLeft();
  }
  function toggle(key, checked) { editing()[key] = checked; ctx.renderLeft(); }
  function select(key, value) { const e = editing(); if (e) e[key] = value; ctx.renderLeft(); return true; }
  function field() { ctx.renderLeft(); }
  function accept() { return editing().mode === 'replaceComp' ? acceptReplace() : acceptCopy(); }
  const subject = (e) => t(e.mode === 'replaceComp' ? 'cmd.replaceComponent' : 'cmd.copyWithMates');
  const handles = (name) => name === 'clear' && owns(editing());
  function command(name, arg) {
    const e = editing();
    if (name === 'clear') {
      if (arg === 'comps') e.comps = [];
      if (arg === 'comp') { e.comp = null; e.plan = {}; }
      if (arg?.startsWith('mate:')) { const id = arg.slice(5); if (e.plan[id]) e.plan[id].other = null; }
      ctx.viewport()?.setSelection([]);
      return ctx.renderLeft();
    }
    return undefined;
  }

  // ───────────────────────── commands

  const asmOpen = () => Boolean(asm());
  const commands = {
    replaceComponent: { icon: 'replaceComponent', label: 'cmd.replaceComponent', enabled: () => asmOpen() && ctx.project().parts.length > 1, checked: () => editing()?.mode === 'replaceComp', run: () => (editing()?.mode === 'replaceComp' ? ctx.cancelEditing({ quiet: true }) : startReplace()) },
    copyWithMates: { icon: 'copyWithMates', label: 'cmd.copyWithMates', enabled: () => asmOpen() && (asm()?.components.length ?? 0) > 0, checked: () => editing()?.mode === 'copyMates', run: () => (editing()?.mode === 'copyMates' ? ctx.cancelEditing({ quiet: true }) : startCopy()) },
    holeAlignment: { icon: 'holeAlignment', label: 'cmd.holeAlignment', enabled: () => (asm()?.components.length ?? 0) > 1, run: () => checkHoles() },
    envelopeComponent: { icon: 'envelope', label: 'cmd.envelopeComponent', enabled: () => asmOpen() && selectedComps().length > 0, checked: () => selectedComps().length > 0 && selectedComps().every((id) => isEnvelope(comp(id))), run: () => toggleEnvelope() },
    envelopeSelectInside: { icon: 'envelopeInside', label: 'cmd.envelopeSelectInside', enabled: () => Boolean(asm()?.components.some(isEnvelope)), run: () => selectByEnvelope('inside') },
    envelopeSelectCrossing: { icon: 'envelopeCrossing', label: 'cmd.envelopeSelectCrossing', enabled: () => Boolean(asm()?.components.some(isEnvelope)), run: () => selectByEnvelope('crossing') },
  };
  const TAB = ['replaceComponent', 'copyWithMates', 'holeAlignment', 'envelopeComponent', 'envelopeSelectInside', 'envelopeSelectCrossing'];

  return { owns, pm, pick, field, set, toggle, select, accept, subject, handles, command, commands, TAB, holesOf, checkHoles, boxesOf };
}
