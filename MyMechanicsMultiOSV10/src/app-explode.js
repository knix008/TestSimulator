// The exploded view editor (a PropertyManager page) of the main window: explode steps made from picked
// components — regular (along a direction, with a turn about an axis) or radial (straight out from an axis) —
// edited and deleted in a list; automatic explode; explode lines (the paths the parts travel) on or off; and the
// explode / collapse animation (the steps played one after the other). The geometry is in cad/assembly.js
// (explodedPlacement, applyExplodeStep, explodeLines). Chained onto the hooks of `more` in app.js.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const MODES = new Set(['explode']);
const DIRS = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] };
const dirKey = (d) => Object.entries(DIRS).find(([, v]) => v.every((x, i) => Math.abs(x - (d?.[i] ?? 0)) < 1e-9))?.[0] ?? null;

export function createExplodeTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const asm = () => ctx.activeAssembly();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const comp = (id) => asm()?.components.find((c) => c.id === id);
  const compName = (id) => comp(id)?.name ?? '?';
  const selectedComps = () => state.selection.filter((s) => s.kind === 'comp').map((s) => s.id).filter((id) => comp(id));

  function start() {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'explode', kind: 'regular', dir: 'z', distance: Math.round(ctx.assemblySize(a) * 0.3), angle: 0, rotAxis: 'z', comps: selectedComps(), pick: 'comps' };
    state.leftTab = 'pm';
    // The editor shows the assembly exploded (the steps so far).
    if (a.explode?.steps?.length && !a.explode.on) ctx.change('op.explode', () => { a.explode.on = true; });
    ctx.renderAll();
    if (!state.editing.comps.length) notify('info', t('xp.pickComponents'));
  }

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton } = ctx.pm;
    const a = asm();
    const steps = a?.explode?.steps ?? [];
    const rows = steps.map((s, i) => `<div class="cfg-row ${e.step === s.id ? 'active' : ''}"><button class="icon-button" data-pm="xpSel:${escapeHtml(s.id)}" title="${escapeHtml(t('xp.select'))}">${icon(s.kind === 'radial' ? 'explodeRadial' : 'explode')}</button><span>${escapeHtml(s.name ?? `${t('xp.step')}${i + 1}`)} · ${escapeHtml(s.comps.map(compName).join(', '))}</span><button class="icon-button" data-pm="xpDel:${escapeHtml(s.id)}" title="${escapeHtml(t('xp.delete'))}">${icon('trash')}</button></div>${e.step === s.id ? `${pmNum(`sd:${s.id}`, s.distance ?? 0, t('xp.distance'), 'smartDim', 'mm')}${s.kind === 'radial' ? '' : pmNum(`sa:${s.id}`, s.angle ?? 0, t('xp.angle'), 'dimAngle', '°')}` : ''}`).join('');
    const kind = e.kind ?? 'regular';
    return [
      pmHead('explode', t('cmd.explodeEditor'), t('xp.help')),
      pmGroup('explode', t('xp.steps', { count: steps.length }), `${rows || `<p class="pm-note">${escapeHtml(t('xp.noSteps'))}</p>`}<div class="pm-row">${pmButton('xpAuto', 'autoArrange', t('xp.auto'))}${pmButton('xpAnimate', 'play', t('xp.animate'))}</div>`),
      pmGroup('plus', t('xp.newStep'), [
        pmSeg('kind', [['regular', t('xp.regular'), 'explode'], ['radial', t('xp.radial'), 'explodeRadial']], kind),
        pmList('comps', e.comps.map(compName), t('xp.components'), 'part', e.pick === 'comps'),
        kind === 'radial' ? pmSeg('dir', ['x', 'y', 'z'].map((k) => [k, t('xp.axisOf', { axis: k.toUpperCase() }), 'refAxis']), ['x', 'y', 'z'].includes(e.dir) ? e.dir : 'z') : pmSeg('dir', Object.keys(DIRS).map((k) => [k, k.toUpperCase(), 'mkArrow']), e.dir),
        pmNum('distance', e.distance, t('xp.distance'), 'smartDim', 'mm'),
        kind === 'radial' ? '' : `${pmNum('angle', e.angle, t('xp.angle'), 'dimAngle', '°')}${pmSeg('rotAxis', ['x', 'y', 'z'].map((k) => [k, t('xp.about', { axis: k.toUpperCase() }), 'rotateTool']), e.rotAxis)}`,
        `<div class="pm-row">${pmButton('xpAdd', 'plus', t('xp.add'), 'primary')}</div>`,
      ].join('')),
      pmGroup('settings', t('pm.options'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="lines" ${a?.explode?.lines !== false ? 'checked' : ''}/>${icon('explodeLine')}<span>${escapeHtml(t('xp.lines'))}</span></label><label class="pm-check"><input type="checkbox" data-pm-toggle="on" ${a?.explode?.on ? 'checked' : ''}/>${icon('explode')}<span>${escapeHtml(t('xp.showExploded'))}</span></label>`),
    ].join('');
  }

  function pick(hit) {
    const e = editing();
    const c = ctx.topoOf(hit)?.comp;
    if (!c) { notify('info', t('notice.pickComponentFace')); return undefined; }
    const i = e.comps.indexOf(c.id);
    if (i >= 0) e.comps.splice(i, 1); else e.comps.push(c.id);
    ctx.viewport()?.setSelection(e.comps.map((id) => ({ kind: 'body', bodyKey: `comp:${id}` })));
    return ctx.renderLeft();
  }

  /** The new step from the page (a radial one about an axis through the chosen components' middle). */
  function addStep() {
    const e = editing(); const a = asm();
    if (!e.comps.length) { notify('info', t('xp.pickComponents')); return; }
    const distance = Number(e.distance) || 0;
    if (!distance && !(Number(e.angle) || 0)) { notify('info', t('xp.zero')); return; }
    const centers = ctx.explodeCenters(a);
    ctx.change('op.explode', () => {
      a.explode ??= { steps: [], on: true };
      a.explode.steps ??= [];
      const n = a.explode.steps.length + 1;
      const step = { id: ctx.newId('xstep'), name: `${t('xp.step')}${n}`, kind: e.kind ?? 'regular', comps: [...e.comps], distance };
      if (step.kind === 'radial') {
        // The axis through the middle of the chosen components' centres (where they are before this step).
        const pts = e.comps.map((id) => ctx.placedCenter(a, id, centers)).filter(Boolean);
        const mid = pts.length ? [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length) : [0, 0, 0];
        step.axis = { point: mid, dir: DIRS[['x', 'y', 'z'].includes(e.dir) ? e.dir : 'z'] };
      } else {
        step.dir = DIRS[e.dir] ?? DIRS.z;
        if (Number(e.angle)) { step.angle = Number(e.angle); step.rotAxis = DIRS[e.rotAxis] ?? DIRS.z; }
      }
      a.explode.steps.push(step);
      a.explode.on = true;
      e.step = step.id;
    });
    e.comps = [];
    ctx.viewport()?.setSelection([]);
    notify('success', t('xp.added'));
    ctx.renderAll();
  }

  function set(key, value) {
    const e = editing();
    if (key === 'kind') { e.kind = value; if (value === 'radial' && !['x', 'y', 'z'].includes(e.dir)) e.dir = 'z'; }
    else if (key === 'dir' || key === 'rotAxis') e[key] = value;
    return ctx.renderLeft();
  }

  function toggle(key, checked) {
    const a = asm();
    if (!a) return undefined;
    if (key === 'lines') ctx.change('op.explode', () => { a.explode ??= { steps: [], on: false }; a.explode.lines = checked; });
    if (key === 'on') ctx.change('op.explode', () => { a.explode ??= { steps: [], on: false }; a.explode.on = checked; });
    return ctx.renderAll();
  }

  function field(key, raw, v) {
    const e = editing(); const a = asm();
    if (v == null) return ctx.renderLeft();
    if (key === 'distance' || key === 'angle') { e[key] = v; return ctx.renderLeft(); }
    const [k, id] = key.split(':');
    const s = a?.explode?.steps?.find((x) => x.id === id);
    if (!s) return ctx.renderLeft();
    if (k === 'sd') ctx.change('op.explode', () => { s.distance = v; });
    if (k === 'sa') ctx.change('op.explode', () => { s.angle = v; s.rotAxis ??= s.dir ?? DIRS.z; });
    return ctx.renderAll();
  }

  const handles = (name) => name === 'clear' || /^xp(Add|Auto|Animate|Sel|Del)/.test(name);
  function command(name, arg) {
    const e = editing(); const a = asm();
    if (name === 'clear') { e.comps = []; ctx.viewport()?.setSelection([]); return ctx.renderLeft(); }
    if (name === 'xpAdd') return addStep();
    if (name === 'xpAuto') { ctx.autoExplode(); return ctx.renderAll(); }
    if (name === 'xpAnimate') return ctx.animateExplode();
    if (name === 'xpSel') { e.step = e.step === arg ? null : arg; const s = a?.explode?.steps?.find((x) => x.id === arg); if (s && e.step) { e.kind = s.kind ?? 'regular'; if (s.dir) e.dir = dirKey(s.dir) ?? e.dir; } return ctx.renderLeft(); }
    if (name === 'xpDel') {
      ctx.change('op.explode', () => { a.explode.steps = a.explode.steps.filter((x) => x.id !== arg); if (!a.explode.steps.length) a.explode.on = false; });
      if (e.step === arg) e.step = null;
      return ctx.renderAll();
    }
    return undefined;
  }

  function accept() {
    const e = editing();
    // Components still chosen with a distance: their step is made too (OK means "done").
    if (e.comps.length && (Number(e.distance) || Number(e.angle))) addStep();
    state.editing = null;
    return ctx.renderAll();
  }
  const subject = () => t('cmd.explodeEditor');

  const commands = {
    explodeEditor: { icon: 'explode', label: 'cmd.explodeEditor', enabled: () => (asm()?.components.length ?? 0) > 1, checked: () => editing()?.mode === 'explode', run: () => (editing()?.mode === 'explode' ? ctx.cancelEditing({ quiet: true }) : start()) },
    explodeAnimate: { icon: 'play', label: 'cmd.explodeAnimate', enabled: () => Boolean(asm()?.explode?.steps?.length), run: () => ctx.animateExplode() },
  };

  return { owns, pm, pick, field, set, toggle, select: () => false, accept, subject, handles, command, commands };
}
