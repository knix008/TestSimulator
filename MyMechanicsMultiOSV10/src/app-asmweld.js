// Assembly weld beads in the main window (cad/asm-weld.js has the geometry): a PropertyManager page where the
// edges of one component and the face of another they stand on are picked and the weld size set; the beads show
// in the assembly (grey solids, not pickable) and the page lists every weld with its length and volume (a weld
// table). Welds belong to the assembly: assembly.welds = [{ id, name, a: { comp, edges: [edge signatures] },
// b: { comp, face: face signature }, size }]. Chained onto the hooks of `more` in app.js like the other add-ins.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { weldBeads } from './cad/asm-weld.js';
import { edgeSignature, faceSignature, findEdges, findFace } from './cad/refs.js';
import { placeShape, relativePlacement } from './cad/assembly.js';

const MODES = new Set(['asmWeld']);

export function createAsmWeldTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const asm = () => ctx.activeAssembly();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const comp = (id) => asm()?.components.find((c) => c.id === id);
  const partOf = (c) => (c?.part ? ctx.project().parts.find((p) => p.id === c.part) : null);
  const cache = new Map();

  /** A weld's beads in assembly space (cached by the weld and where its two components are). */
  function geometry(w) {
    const A = comp(w.a?.comp); const B = comp(w.b?.comp);
    const pa = partOf(A); const pb = partOf(B);
    if (!pa || !pb) throw new Error('weld-components');
    const ea = ctx.buildPart(pa); const eb = ctx.buildPart(pb);
    const key = JSON.stringify([w.a, w.b, w.size, A.position, A.rotation, B.position, B.rotation, ea.key ?? ea.uid, eb.key ?? eb.uid]);
    const hit = cache.get(w.id ?? 'preview');
    if (hit?.key === key) return hit.value;
    const edges = findEdges(ea.body, w.a.edges ?? []);
    if (!edges.length) throw new Error('no-edges');
    const face = findFace(eb.body, w.b.face);
    if (!face) throw new Error('face-missing');
    // Made in A's own frame (its edges stay edges of its body), B's face brought into it; then placed.
    const local = weldBeads(ea.body, edges, placeShape(face, relativePlacement(A, B)), w.size);
    const value = { ...local, bead: placeShape(local.bead, A) };
    cache.set(w.id ?? 'preview', { key, value });
    return value;
  }

  function start() {
    if (!asm()) { notify('info', t('notice.assemblyOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'asmWeld', a: null, edges: [], b: null, face: null, size: 5, pick: 'edges' };
    state.leftTab = 'pm';
    ctx.renderAll();
    notify('info', t('aw.pickEdges'));
  }

  const draft = (e) => ({ id: null, a: { comp: e.a, edges: e.edges }, b: { comp: e.b, face: e.face }, size: e.size });

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmList } = ctx.pm;
    const a = asm();
    const name = (id) => comp(id)?.name ?? '?';
    let info = '';
    if (e.edges.length && e.face) {
      try { const g = geometry(draft(e)); info = `<dl class="pm-results" data-weld-preview><dt>${escapeHtml(t('aw.length'))}</dt><dd>${escapeHtml(`${ctx.fmt(g.length, 2)} mm`)}</dd><dt>${escapeHtml(t('aw.volume'))}</dt><dd>${escapeHtml(`${ctx.fmt(g.volume, 2)} mm³`)}</dd></dl>`; } catch (err) { info = `<p class="pm-note error" data-weld-error>${escapeHtml(t(`aw.error.${err.message}`))}</p>`; }
    }
    const welds = a?.welds ?? [];
    const rows = welds.map((w, i) => {
      let g = null; try { g = geometry(w); } catch { g = null; }
      return `<div class="cfg-row" data-weld-row="${escapeHtml(w.id)}"><span>${icon('weldBead')}</span><span>${escapeHtml(`${w.name} · ${name(w.a.comp)} ↔ ${name(w.b.comp)}`)}</span><span class="grow"></span><b>${escapeHtml(g ? `${ctx.fmt(g.length, 1)} mm` : t('aw.broken'))}</b><button class="icon-button" data-pm="awDel:${i}" title="${escapeHtml(t('aw.delete'))}">${icon('trash')}</button></div>${pmNum(`awSize:${i}`, w.size, t('aw.size'), 'weldBead', 'mm')}`;
    }).join('');
    const total = welds.reduce((s, w) => { try { return s + geometry(w).length; } catch { return s; } }, 0);
    return [
      pmHead('weldBead', t('cmd.asmWeldBead'), t('aw.help')),
      pmGroup('weldBead', t('aw.new'), [
        pmList('edges', e.edges.map((_, i) => `${name(e.a)} · ${t('pm.edge')} ${i + 1}`), t('aw.edges'), 'lineTool', e.pick === 'edges'),
        pmList('face', e.face ? [`${name(e.b)} · ${t('pm.face')}`] : [], t('aw.face'), 'faceFillet', e.pick === 'face'),
        pmNum('size', e.size, t('aw.size'), 'weldBead', 'mm'),
        info,
      ].join('')),
      pmGroup('weldBead', t('aw.table', { count: welds.length }), `${rows || `<p class="pm-note">${escapeHtml(t('aw.none'))}</p>`}${welds.length ? `<p class="pm-note" data-weld-total>${escapeHtml(t('aw.total', { length: ctx.fmt(total, 1) }))}</p>` : ''}`),
    ].join('');
  }

  function pick(hit) {
    const e = editing();
    const topo = ctx.topoOf(hit);
    const c = topo?.comp;
    if (!c || !topo.shape) { notify('info', t('notice.pickComponentFace')); return undefined; }
    if (c.sub || topo.inner) { notify('info', t('aw.partsOnly')); return undefined; }
    if (hit.kind === 'edge') {
      if (e.a && e.a !== c.id) { notify('info', t('aw.sameComponent')); return undefined; }
      const sig = edgeSignature(topo.shape);
      const i = e.edges.findIndex((x) => Math.hypot(...x.mid.map((v, k) => v - sig.mid[k])) < 1e-6);
      if (i >= 0) e.edges.splice(i, 1); else e.edges.push(sig);
      e.a = e.edges.length ? c.id : null;
      if (e.edges.length && !e.face) e.pick = 'face';
    } else if (hit.kind === 'face') {
      if (c.id === e.a) { notify('info', t('notice.sameComponent')); return undefined; }
      e.b = c.id; e.face = faceSignature(topo.shape); e.pick = 'edges';
    }
    return ctx.renderAll();
  }

  function field(key, raw, v) {
    const e = editing();
    if (v == null || !(v > 0)) return ctx.renderLeft();
    if (key === 'size') { e.size = v; return ctx.renderAll(); }
    const [k, i] = key.split(':');
    const w = asm()?.welds?.[Number(i)];
    if (k === 'awSize' && w) ctx.change('op.weld', () => { w.size = v; });
    return ctx.renderAll();
  }

  function accept() {
    const e = editing(); const a = asm();
    if (e.edges.length && e.face) {
      try { geometry(draft(e)); } catch (err) { notify('error', t(`aw.error.${err.message}`)); return undefined; }
      ctx.change('op.weld', () => {
        a.welds ??= [];
        a.welds.push({ id: ctx.newId('weld'), name: `${t('aw.weld')}${a.welds.length + 1}`, a: { comp: e.a, edges: e.edges }, b: { comp: e.b, face: e.face }, size: e.size });
      });
    }
    state.editing = null;
    return ctx.renderAll();
  }

  const handles = (name) => name === 'clear' || /^awDel:/.test(name);
  function command(name, arg) {
    const e = editing();
    if (name === 'clear') { if (arg === 'edges') { e.edges = []; e.a = null; } if (arg === 'face') { e.face = null; e.b = null; } return ctx.renderAll(); }
    if (name.startsWith('awDel')) { const a = asm(); ctx.change('op.weld', () => { a.welds.splice(Number(arg), 1); }); return ctx.renderAll(); }
    return undefined;
  }

  /** The beads as bodies of the view (after the components): the assembly's welds and the one being made. */
  function decorate(kind) {
    const vp = ctx.viewport();
    if (!vp) return;
    for (const key of [...vp.bodies.keys()]) if (key.startsWith('weld:')) { vp.disposeBody(vp.bodies.get(key)); vp.bodies.delete(key); }
    const a = asm();
    if (kind !== 'assembly' || !a) return;
    const list = [...(a.welds ?? []).filter((w) => !w.suppressed)];
    const e = editing();
    if (owns(e) && e.edges.length && e.face) list.push(draft(e));
    let added = false;
    for (const w of list) {
      let g; try { g = geometry(w); } catch { continue; }
      const mesh = g.bead.mesh({ tolerance: 0.05, angularTolerance: 0.3 });
      vp.addBody({ key: `weld:${w.id ?? 'preview'}`, mesh: { ...mesh, triangles: Array.from(mesh.triangles) }, edges: null, faceIndex: new Map(), edgeIndex: new Map(), color: w.id ? '#8d939b' : '#f28c1e', metal: 0.5, rough: 0.55, pickable: false });
      added = true;
    }
    if (added) { vp.applyStyle?.(); vp.requestRender?.(); }
  }

  const commands = {
    asmWeldBead: { icon: 'weldBead', label: 'cmd.asmWeldBead', enabled: () => (asm()?.components.length ?? 0) > 1, checked: () => editing()?.mode === 'asmWeld', run: () => (editing()?.mode === 'asmWeld' ? ctx.cancelEditing({ quiet: true }) : start()) },
  };
  return { owns, pm, pick, field, set: () => ctx.renderLeft(), toggle: () => ctx.renderLeft(), select: () => false, accept, subject: () => t('cmd.asmWeldBead'), handles, command, commands, decorate, geometry };
}
