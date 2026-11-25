// Beam (frame) study of a weldment (Weldments › Beam Study): the structural members of the part as 3D beam elements
// (cad/fem/beam.js) — each member's section from its profile (built-in or drawn), its line through the section's
// centroid —, the joints listed with their supports (free, pinned, fixed) and loads (forces N, moments N·m), the self
// weight, and the results: member stresses as coloured lines over the model with the deformed shape (scaled), the
// largest stress and displacement, factors of safety, end forces per member and the support reactions (CSV).
import * as THREE from 'three';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { profileLoops, sectionProperties, frameModel, frameStudy } from './cad/fem/beam.js';
import { profiles } from './cad/sketch.js';
import { loopPoints } from './cad/wrap-surface.js';
import { stressColor } from './cad/fea.js';

const r3 = (p) => p.map((v) => Math.round(v * 1000) / 1000);

export function createFrameTools(ctx) {
  const { state, t } = ctx;
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'frameStudy';
  const part = () => ctx.activePart();
  const fmt = (v, d = 3) => ctx.fmt(v, d);

  /** The part's members as beams: [{ a, b, u, section, material, feature, line, name }]. */
  function membersOf(p = part(), entry = ctx.partEntry()) {
    const out = [];
    const results = entry?.result?.results;
    const material = ctx.feaMaterial(p);
    for (const f of p?.features ?? []) {
      if (f.type !== 'structural' || f.suppressed) continue;
      const res = results?.get?.(f.id);
      if (!res?.members?.length) continue;
      const section = sectionOf(f, p);
      if (!section) continue;
      res.members.forEach((m, k) => {
        if (!m.a || !m.b) return;
        // The beam runs through the section's centroid (profile x along u, y along v).
        const off = [0, 1, 2].map((c) => section.cu * m.u[c] + section.cv * m.v[c]);
        out.push({ a: m.a.map((x, c) => x + off[c]), b: m.b.map((x, c) => x + off[c]), u: m.u, section, material, feature: f.id, line: m.line, name: `${f.name} · ${k + 1}` });
      });
    }
    return out;
  }
  /** A structural feature's section: a built-in profile, or the loops of its profile sketch. */
  function sectionOf(f, p) {
    if (f.profile !== 'custom') { const pl = profileLoops(f.profile, f.w, f.h, f.t); return sectionProperties(pl.loops, pl.torsion); }
    const sk = p.features.find((x) => x.id === f.profileSketch);
    if (!sk) return null;
    const loops = [];
    for (const r of profiles(sk)) { loops.push({ pts: loopPoints(r.outer, 24) }); for (const h of r.holes) loops.push({ pts: loopPoints(h, 24), hole: true }); }
    return loops.length ? sectionProperties(loops, null) : null;
  }

  function start() {
    const p = part();
    if (!p) { ctx.notify('info', t('notice.partOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    const members = membersOf(p);
    if (!members.length) { ctx.notify('info', t('frame.noMembers')); return; }
    p.frameStudy ??= { supports: {}, loads: {}, gravity: true };
    state.editing = { mode: 'frameStudy', joint: null, result: null, scale: 0, deformed: true };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  const study = () => part()?.frameStudy;
  const joints = () => frameModel(membersOf()).joints;
  const keyOf = (p) => r3(p).join(',');

  async function run() {
    const e = editing(); const p = part(); const s = study();
    const members = membersOf(p);
    const js = frameModel(members).joints;
    const supports = []; const loads = [];
    for (const q of js) {
      const k = keyOf(q);
      const sp = s.supports[k]; if (sp && sp !== 'free') supports.push({ point: q, dofs: sp });
      const ld = s.loads[k]; if (ld && (ld.f?.some((x) => x) || ld.m?.some((x) => x))) loads.push({ point: q, force: ld.f ?? [0, 0, 0], moment: (ld.m ?? [0, 0, 0]).map((x) => x * 1000) });
    }
    const r = frameStudy({ members, supports, loads, gravity: s.gravity ? [0, 0, -9.81] : null });
    if (!r.ok) { ctx.notify('error', t(`frame.error.${r.error}`, null, r.error)); return null; }
    const size = Math.max(1, ...js.flatMap((a) => js.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))));
    e.result = r; e.members = members; e.scale = r.maxDisplacement > 0 ? (0.08 * size) / r.maxDisplacement : 1;
    ctx.notify(r.minFactorOfSafety < 1 ? 'warning' : 'success', t('frame.done', { s: fmt(r.maxStress, 1), d: fmt(r.maxDisplacement, 3), fos: fmt(r.minFactorOfSafety, 2) }));
    ctx.syncView(); ctx.renderLeft();
    return r;
  }

  // ─────────── the display

  let group = null;
  function decorate() {
    const vp = ctx.viewport(); if (!vp) return;
    if (!group) { group = new THREE.Group(); group.name = 'frame'; vp.scene.add(group); vp.groups.frame = group; }
    const e = editing();
    if (!owns(e)) { vp.setLines('frame', []); return; }
    const list = [];
    const js = joints();
    const s = study();
    // Joints: supports in red, loaded joints in orange, the picked one larger.
    const pts = (pred, color, size) => { const p = js.filter(pred).flat(); if (p.length) list.push({ points: p, color, size }); };
    pts((q) => (s.supports[keyOf(q)] ?? 'free') !== 'free', '#e5484d', 10);
    pts((q) => Boolean(s.loads[keyOf(q)]), '#f59e0b', 9);
    pts(() => true, '#2f6fed', 6);
    if (e.joint) pts((q) => keyOf(q) === e.joint, '#111827', 13);
    const r = e.result;
    if (r) {
      const top = Math.max(1e-9, r.maxStress);
      for (const el of r.results) {
        const seg = []; const cols = [];
        for (let k = 1; k < el.samples.length; k++) {
          const a = el.samples[k - 1], b = el.samples[k];
          const at = (x) => (e.deformed ? x.pos.map((v, c) => v + e.scale * x.disp[c]) : x.pos);
          seg.push(...at(a), ...at(b));
          cols.push((a.stress + b.stress) / 2);
        }
        // One line per sample piece, coloured by its stress.
        for (let k = 0; k < cols.length; k++) list.push({ segments: seg.slice(6 * k, 6 * k + 6), color: `#${new THREE.Color(...stressColor(cols[k], 0, top)).getHexString()}`, width: 5, order: 18 });
      }
    }
    vp.setLines('frame', list);
  }

  // ─────────── the page

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmButton } = ctx.pm;
    const s = study(); const js = joints();
    const members = membersOf();
    const sel = e.joint ? js.find((q) => keyOf(q) === e.joint) : null;
    const jrow = (q, i) => { const k = keyOf(q); const sp = s.supports[k] ?? 'free'; const ld = s.loads[k]; return `<div class="cfg-row ${e.joint === k ? 'selected' : ''}"><button type="button" class="grow cam-op" data-pm="frame.joint:${escapeHtml(k)}">${icon(sp === 'fixed' ? 'fixture' : sp === 'pinned' ? 'femHinge' : 'point', 'icon tiny')}<span>J${i + 1}:</span><span class="pm-count">${escapeHtml(r3(q).map((v) => fmt(v, 1)).join(', '))}${ld ? ' · ⇣' : ''}</span></button></div>`; };
    const ld = sel ? s.loads[e.joint] ?? { f: [0, 0, 0], m: [0, 0, 0] } : null;
    const jointPage = sel ? [
      pmSeg('frame.support', [['free', t('frame.free'), 'point'], ['pinned', t('frame.pinned'), 'femHinge'], ['fixed', t('frame.fixed'), 'fixture']], s.supports[e.joint] ?? 'free'),
      ...['x', 'y', 'z'].map((c, i) => pmNum(`frame.f.${i}`, ld.f?.[i] ?? 0, `F${c} (N)`, 'load')),
      ...['x', 'y', 'z'].map((c, i) => pmNum(`frame.m.${i}`, ld.m?.[i] ?? 0, `M${c} (N·m)`, 'femTorque')),
    ].join('') : `<p class="pm-note">${escapeHtml(t('frame.pickJoint'))}</p>`;
    const r = e.result;
    let res = '';
    if (r) {
      const rows = r.results.map((x, i) => `<tr class="${x.factorOfSafety < 1 ? 'error' : ''}"><td>${escapeHtml(members[x.member]?.name ?? `#${x.member + 1}`)}${r.results.filter((y) => y.member === x.member).length > 1 ? ` (${i + 1})` : ''}</td><td>${fmt(x.length, 1)}</td><td>${fmt(x.maxStress, 1)}</td><td>${fmt(Math.max(Math.abs(x.ends.N1), Math.abs(x.ends.N2)), 1)}</td><td>${fmt(x.factorOfSafety, 2)}</td></tr>`).join('');
      res = pmGroup('simulation', t('frame.results'), `<dl class="pm-results"><dt>${escapeHtml(t('frame.maxStress'))}</dt><dd>${fmt(r.maxStress, 2)} MPa</dd><dt>${escapeHtml(t('frame.maxDisp'))}</dt><dd>${fmt(r.maxDisplacement, 4)} mm</dd><dt>${escapeHtml(t('frame.minFos'))}</dt><dd class="${r.minFactorOfSafety < 1 ? 'warn' : ''}">${fmt(r.minFactorOfSafety, 2)}</dd><dt>${escapeHtml(t('frame.elements'))}</dt><dd>${r.results.length} · ${escapeHtml(t('frame.jointsN', { n: r.joints.length }))}</dd></dl>
        <label class="pm-check"><input type="checkbox" data-pm-toggle="frame.deformed" ${e.deformed ? 'checked' : ''}/>${icon('femDisplacement', 'icon tiny')}<span>${escapeHtml(t('frame.deformed'))}</span></label>${e.deformed ? pmNum('frame.scale', Math.round(e.scale * 100) / 100, t('frame.scale'), 'smartDim') : ''}
        <table class="sim2-table frame-table"><tr><th>${escapeHtml(t('frame.member'))}</th><th>L (mm)</th><th>σ (MPa)</th><th>N (N)</th><th>${escapeHtml(t('frame.fos'))}</th></tr>${rows}</table>
        <p class="pm-note">${escapeHtml(t('frame.reactions'))}: ${r.reactions.map((x) => `[${x.force.map((v) => fmt(v, 1)).join(', ')}] N`).join(' · ')}</p>
        <div class="pm-row-buttons">${pmButton('frame.csv', 'export', t('frame.csv'))}</div>`);
    }
    return [
      pmHead('frameStudy', t('cmd.frameStudy'), t('frame.help')),
      pmGroup('weldment', t('frame.members', { n: members.length }), `<p class="pm-note">${escapeHtml(t('frame.membersNote', { e: fmt(ctx.feaMaterial(part()).E / 1000, 0) }))}</p>`),
      pmGroup('point', t('frame.joints', { n: js.length }), `<div class="cam-list">${js.map(jrow).join('')}</div>`),
      pmGroup('fixture', sel ? `J${js.findIndex((q) => keyOf(q) === e.joint) + 1}` : t('frame.joint'), jointPage),
      pmGroup('femGravity', t('frame.loads'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="frame.gravity" ${s.gravity ? 'checked' : ''}/>${icon('femGravity', 'icon tiny')}<span>${escapeHtml(t('frame.gravity'))}</span></label><div class="pm-row-buttons">${pmButton('frame.run', 'play', t('sim.run'), 'primary')}</div>`),
      res,
    ].join('');
  }

  function edit(mutate) { ctx.change('op.frameStudy', () => { const p = part(); p.frameStudy ??= { supports: {}, loads: {}, gravity: true }; mutate(p.frameStudy); }); editing().result = null; }

  function field(key, raw, v) {
    const e = editing();
    if (v == null) return ctx.renderLeft();
    const m = /^frame\.(f|m)\.([012])$/.exec(key);
    if (m && e.joint) { edit((s) => { const l = s.loads[e.joint] ?? { f: [0, 0, 0], m: [0, 0, 0] }; l[m[1]][Number(m[2])] = v; if (l.f.every((x) => !x) && l.m.every((x) => !x)) delete s.loads[e.joint]; else s.loads[e.joint] = l; }); }
    if (key === 'frame.scale' && v >= 0) { e.scale = v; ctx.syncView(); }
    return ctx.renderLeft();
  }
  function set(key, value) {
    const e = editing();
    if (key === 'frame.support' && e.joint) edit((s) => { if (value === 'free') delete s.supports[e.joint]; else s.supports[e.joint] = value; });
    ctx.syncView();
    return ctx.renderLeft();
  }
  function toggle(key, checked) {
    const e = editing();
    if (key === 'frame.gravity') edit((s) => { s.gravity = checked; });
    if (key === 'frame.deformed') { e.deformed = checked; ctx.syncView(); }
    return ctx.renderLeft();
  }
  const handles = (name) => /^frame\./.test(name);
  async function command(name, arg) {
    const e = editing();
    if (name === 'frame.joint') { e.joint = e.joint === arg ? null : arg; ctx.syncView(); return ctx.renderLeft(); }
    if (name === 'frame.run') return run();
    if (name === 'frame.csv') return saveCsv();
    return undefined;
  }
  /** The member table and the reactions as CSV. */
  function saveCsv() {
    const e = editing(); const r = e?.result; if (!r) return false;
    const lines = ['member,length (mm),max stress (MPa),N1 (N),N2 (N),T (N mm),My1 (N mm),Mz1 (N mm),My2 (N mm),Mz2 (N mm),factor of safety'];
    r.results.forEach((x) => { const en = x.ends; lines.push([`"${(e.members[x.member]?.name ?? '').replace(/"/g, '""')}"`, x.length, x.maxStress, en.N1, en.N2, en.T, en.My1, en.Mz1, en.My2, en.Mz2, x.factorOfSafety].join(',')); });
    lines.push('', 'support,x,y,z,Fx (N),Fy (N),Fz (N),Mx (N mm),My (N mm),Mz (N mm)');
    for (const x of r.reactions) lines.push([`J${x.joint + 1}`, ...x.point, ...x.force, ...x.moment].join(','));
    return ctx.saveExport(`${part()?.name ?? 'frame'} - ${t('cmd.frameStudy')}.csv`, 'csv', `${lines.join('\n')}\n`, 'text/csv');
  }
  /** A click on the model picks the nearest joint to the point clicked. */
  function pick(hit) {
    if (!hit?.point) return;
    const js = joints(); let best = null, bd = Infinity;
    for (const q of js) { const d = Math.hypot(q[0] - hit.point[0], q[1] - hit.point[1], q[2] - hit.point[2]); if (d < bd) { bd = d; best = q; } }
    if (best) { editing().joint = keyOf(best); ctx.syncView(); ctx.renderLeft(); }
  }
  const accept = () => { state.editing = null; state.leftTab = 'tree'; ctx.syncView(); return ctx.renderAll(); };
  const cleanup = () => { ctx.viewport()?.setLines('frame', []); };

  const commands = {
    frameStudy: { icon: 'frameStudy', label: 'cmd.frameStudy', enabled: () => Boolean(part()?.features?.some((f) => f.type === 'structural')), checked: () => owns(editing()), run: () => (owns(editing()) ? ctx.cancelEditing({ quiet: true }) : start()) },
  };
  return { owns, pm, pick, field, set, toggle, select: () => false, accept, subject: () => t('cmd.frameStudy'), handles, command, commands, decorate, cleanup, api: { run, membersOf, joints, keyOf, start } };
}
