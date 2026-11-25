// Top-down design in the main window: a part edited in the context of an assembly (Edit Part in context / New
// Part in context). The other components show see-through around the part, placed in the part's own frame; a
// sketch can be put on any of their planar faces — an external reference (cad/ext-refs.js) that follows the
// assembly when references are updated, can be locked, or broken into a fixed plane. A PropertyManager page lists
// a part's references. The rest of the app calls in here from syncPart (contextBodies), topoOf (contextTopo) and
// pickSketchPlane (sketchOnContextFace).
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { createPart } from './cad/document.js';
import { planeOfFace, faceSignature } from './cad/refs.js';
import { placePoint, placeDir, relativePlacement, composePlacement } from './cad/assembly.js';
import { frameBetween, addExternalRef, updateExternalRefs, breakExternalRefs, inContextFeatures } from './cad/ext-refs.js';

const MODES = new Set(['extRefs']);

export function createInContextTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const asmOf = (id) => ctx.project()?.assemblies.find((a) => a.id === id) ?? null;
  const ic = () => state.inContext ?? null;
  /** The assembly and component of the part being edited in context (when that part is the active one). */
  function context() {
    const c = ic();
    if (!c) return null;
    const asm = asmOf(c.asmId); const comp = asm?.components.find((x) => x.id === c.compId);
    const part = ctx.activePart();
    if (!asm || !comp || !part || comp.part !== part.id) return null;
    return { asm, comp, part };
  }
  const placementOf = (asmId, compId) => asmOf(asmId)?.components.find((c) => c.id === compId) ?? null;

  /** A referenced face's frame in its component's frame (through a sub-assembly's part), or null. */
  function faceFrameOf(r) {
    const asm = asmOf(r.asm); const comp = asm?.components.find((c) => c.id === r.comp);
    if (!comp) return null;
    const leaf = r.path?.length ? ctx.componentLeaves(comp).find((l) => l.path.join('/') === r.path.join('/')) : null;
    const part = ctx.project().parts.find((p) => p.id === (leaf ? leaf.part : comp.part));
    if (!part) return null;
    const face = ctx.buildPart(part).faces?.find((f) => ctx.matchesSig(f, r.sig));
    if (!face || face.geomType !== 'PLANE') return null;
    const p = planeOfFace(face);
    return leaf ? { origin: placePoint(leaf.placement, p.origin), xDir: placeDir(leaf.placement, p.xDir), normal: placeDir(leaf.placement, p.normal) } : p;
  }

  function refresh(part, { quiet = false } = {}) {
    if (!part?.externalRefs?.length) return { updated: 0, missing: [] };
    let r;
    ctx.change('op.extRefs', () => { r = updateExternalRefs(part, faceFrameOf, placementOf); });
    if (!quiet) notify(r.missing.length ? 'warning' : 'success', t(r.missing.length ? 'ic.missing' : 'ic.updated', { count: r.updated, missing: r.missing.length }));
    return r;
  }

  function editInContext(compId = null) {
    const asm = ctx.activeAssembly();
    const id = compId ?? state.selection.find((s) => s.kind === 'comp')?.id;
    const comp = asm?.components.find((c) => c.id === id);
    if (!comp?.part) { notify('info', t('ic.pickPart')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.inContext = { asmId: asm.id, compId: comp.id };
    ctx.switchDocument({ kind: 'part', id: comp.part });
    refresh(ctx.activePart(), { quiet: true });
    notify('info', t('ic.editing', { name: comp.name, asm: asm.name }));
    ctx.renderAll();
  }

  /** A new part in the assembly at its origin (fixed there), opened in context for its first sketch. */
  function newPartInContext() {
    const asm = ctx.activeAssembly();
    if (!asm) { notify('info', t('notice.assemblyOnly')); return; }
    const part = createPart(`${t('ic.newPartName')}${ctx.project().parts.length + 1}`);
    const compId = ctx.newId('cmp');
    ctx.change('op.newPart', (p) => {
      p.parts.push(part);
      asm.components.push({ id: compId, name: `${part.name}<1>`, part: part.id, position: [0, 0, 0], rotation: [0, 0, 0, 1], fixed: true });
    });
    editInContext(compId);
    ctx.startSketchPick?.();
  }

  function exitInContext() {
    const c = ic();
    if (!c) return;
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.inContext = null;
    if (asmOf(c.asmId)) ctx.switchDocument({ kind: 'assembly', id: c.asmId });
    ctx.renderAll();
  }

  /** The other components, see-through, in the edited part's frame. */
  function contextBodies() {
    const cx = context();
    if (!cx) return [];
    const out = [];
    for (const c of cx.asm.components) {
      if (c.id === cx.comp.id || c.hidden || c.suppressed) continue;
      const rel = relativePlacement(cx.comp, c);
      for (const leaf of ctx.componentLeaves(c)) {
        const part = ctx.project().parts.find((p) => p.id === leaf.part);
        if (!part) continue;
        let entry; try { entry = ctx.buildPart(part); } catch { continue; }
        if (!entry?.mesh) continue;
        const key = leaf.path.length ? `ctx:${c.id}/${leaf.path.join('/')}` : `ctx:${c.id}`;
        out.push(ctx.bodySpec(key, entry, part, { matrix: ctx.componentMatrix(leaf.path.length ? composePlacement(rel, leaf.placement) : rel), opacity: 0.3 }));
      }
    }
    return out;
  }

  /** A pick on a context body → its face (as topoOf gives faces). */
  function contextTopo(hit) {
    const cx = context();
    if (!cx || !String(hit?.bodyKey).startsWith('ctx:')) return null;
    const [compId, ...path] = String(hit.bodyKey).slice(4).split('/');
    const comp = cx.asm.components.find((c) => c.id === compId);
    if (!comp) return null;
    const leaf = path.length ? ctx.componentLeaves(comp).find((l) => l.path.join('/') === path.join('/')) : null;
    const part = ctx.project().parts.find((p) => p.id === (leaf ? leaf.part : comp.part));
    if (!part) return null;
    const entry = ctx.buildPart(part);
    return { entry, part, comp: null, ctxComp: comp, ctxPath: path, inner: leaf?.placement ?? null, shape: hit.kind === 'face' ? entry.faces?.[hit.index] : entry.edgeList?.[hit.index] };
  }

  /** A new sketch on a face of another component: an external reference. */
  function sketchOnContextFace(topo) {
    const cx = context();
    if (!cx || topo?.shape?.geomType !== 'PLANE') { notify('info', t('notice.pickPlanarFace')); return; }
    let f = planeOfFace(topo.shape);
    if (topo.inner) f = { origin: placePoint(topo.inner, f.origin), xDir: placeDir(topo.inner, f.xDir), normal: placeDir(topo.inner, f.normal) };
    let id;
    ctx.change('op.extRefs', () => {
      id = addExternalRef(cx.part, { asm: cx.asm.id, at: cx.comp.id, comp: topo.ctxComp.id, sig: faceSignature(topo.shape), frame: frameBetween(f, cx.comp, topo.ctxComp) }, () => ctx.newId('xref'));
      const r = cx.part.externalRefs.find((x) => x.id === id);
      if (topo.ctxPath?.length) r.path = topo.ctxPath;
    });
    ctx.openNewSketch({ kind: 'ext', id });
  }

  // ───────────────────────── the list page

  function startList() {
    const part = ctx.activePart();
    if (!part) { notify('info', t('notice.partOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'extRefs' };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  function pm() {
    const { pmHead, pmGroup, pmButton } = ctx.pm;
    const part = ctx.activePart();
    const refs = part?.externalRefs ?? [];
    const used = inContextFeatures(part ?? {});
    const nameOf = (r) => { const a = asmOf(r.asm); const c = a?.components.find((x) => x.id === r.comp); return `${a?.name ?? '?'} › ${c?.name ?? '?'}`; };
    const rows = refs.map((r) => `<div class="cfg-row" data-xref="${escapeHtml(r.id)}"><span>${icon(r.locked ? 'lock' : 'extRef')}</span><span>${escapeHtml(nameOf(r))}</span><span class="grow"></span><label class="pm-check" title="${escapeHtml(t('ic.lock'))}"><input type="checkbox" data-pm-toggle="xlock:${escapeHtml(r.id)}" ${r.locked ? 'checked' : ''}/>${icon('lock', 'icon tiny')}</label><button class="icon-button" data-pm="xbreak:${escapeHtml(r.id)}" title="${escapeHtml(t('ic.break'))}">${icon('unlink')}</button></div>`).join('');
    return [
      pmHead('extRef', t('cmd.externalRefs'), t('ic.help')),
      pmGroup('extRef', t('ic.refs', { count: refs.length }), `${rows || `<p class="pm-note">${escapeHtml(t('ic.none'))}</p>`}<p class="pm-note">${escapeHtml(t('ic.used', { count: used.length }))}</p><div class="pm-row">${pmButton('xupdate', 'rebuild', t('cmd.updateExternalRefs'))}${refs.length ? pmButton('xbreakAll', 'unlink', t('ic.breakAll')) : ''}</div>`),
    ].join('');
  }

  function toggle(key, checked) {
    const part = ctx.activePart();
    const r = part?.externalRefs?.find((x) => x.id === key.slice(6));
    if (key.startsWith('xlock:') && r) ctx.change('op.extRefs', () => { if (checked) r.locked = true; else delete r.locked; });
    return ctx.renderAll();
  }
  const handles = (name) => /^x(update|break|breakAll)/.test(name);
  function command(name, arg) {
    const part = ctx.activePart();
    if (name === 'xupdate') { refresh(part); return ctx.renderAll(); }
    if (name === 'xbreakAll') { ctx.change('op.extRefs', () => { breakExternalRefs(part); }); return ctx.renderAll(); }
    if (name === 'xbreak') { ctx.change('op.extRefs', () => { breakExternalRefs(part, [arg]); }); return ctx.renderAll(); }
    return undefined;
  }

  const partHasRefs = () => Boolean(ctx.activePart()?.externalRefs?.length);
  const commands = {
    editInContext: { icon: 'editInContext', label: 'cmd.editInContext', enabled: () => Boolean(ctx.activeAssembly()) && state.selection.some((s) => s.kind === 'comp' && ctx.activeAssembly()?.components.find((c) => c.id === s.id)?.part), run: () => editInContext() },
    newPartInContext: { icon: 'newPartInContext', label: 'cmd.newPartInContext', enabled: () => Boolean(ctx.activeAssembly()), run: () => newPartInContext() },
    exitInContext: { icon: 'exitInContext', label: 'cmd.exitInContext', enabled: () => Boolean(context()), run: () => exitInContext() },
    updateExternalRefs: { icon: 'rebuild', label: 'cmd.updateExternalRefs', enabled: partHasRefs, run: () => { refresh(ctx.activePart()); ctx.renderAll(); } },
    externalRefs: { icon: 'extRef', label: 'cmd.externalRefs', enabled: () => Boolean(ctx.activePart()), checked: () => editing()?.mode === 'extRefs', run: () => (editing()?.mode === 'extRefs' ? ctx.cancelEditing({ quiet: true }) : startList()) },
  };
  return {
    owns, pm, pick: () => undefined, field: () => ctx.renderLeft(), set: () => ctx.renderLeft(), toggle, select: () => false,
    accept: () => { state.editing = null; return ctx.renderAll(); }, subject: () => t('cmd.externalRefs'), handles, command, commands,
    context, contextBodies, contextTopo, sketchOnContextFace, refresh, exitInContext, editInContext,
  };
}
