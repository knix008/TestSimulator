// Free-surface study (part › Evaluate › Free Surface): the part as a container — a tank, a cup — partly filled with a
// liquid (water, oil) up to a level, optionally only over the first part of its length (a dam), and the vessel
// standing still or accelerating sideways (sloshing). Solved on the lattice (cad/cfd/freesurface.js vesselStudy) in
// the worker; the liquid is shown as a blue surface over the see-through part, frame by frame, with the run-up at
// the walls and the shift of the liquid's centre of mass.
import { escapeHtml } from './ui/dom.js';
import { liquidMesh } from './cad/cfd/freesurface.js';

const LIQUIDS = { water: 1e-6, oil: 1e-4, glycerine: 1.1e-3 };

export function createFreeSurfaceTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'freeSurface';
  const part = () => ctx.activePart();
  const fmt = (v, d = 2) => ctx.fmt(v, d);
  let playing = null;

  function begin() {
    const p = part();
    if (!p) { notify('info', t('cam.needPart')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'freeSurface', level: 50, dam: 100, accel: 0, duration: 0.5, liquid: 'water', resolution: 40, frames: 20, result: null, frame: 0, partId: p.id };
    state.leftTab = 'pm';
    ctx.renderAll();
  }
  function finish() { stop(); ctx.cancelEditing({ quiet: true }); ctx.syncView(); }

  async function run() {
    const e = editing(); const p = part();
    if (!owns(e) || !p) return null;
    const entry = ctx.buildPart(p);
    if (!entry?.mesh) { notify('info', t('notice.noBody')); return null; }
    const input = {
      mesh: { vertices: Float32Array.from(entry.mesh.vertices), triangles: Uint32Array.from(entry.mesh.triangles) },
      level: Math.min(1, Math.max(0.02, e.level / 100)), dam: Math.min(1, Math.max(0.02, e.dam / 100)), accel: Number(e.accel) || 0,
      duration: Math.max(0.01, Number(e.duration) || 0.5), viscosity: LIQUIDS[e.liquid] ?? 1e-6, resolution: Math.max(10, Math.min(120, Math.round(e.resolution))), frames: Math.max(2, Math.min(100, Math.round(e.frames))),
    };
    const r = await ctx.runStudy('freeSurface', input, p.name);
    if (!r) return null;
    if (r.ok === false) { notify('error', t(`fs.error.${r.error}`, null, r.error)); return null; }
    if (part() !== p || !owns(editing())) return null;
    editing().result = r; editing().frame = r.frames.length - 1;
    notify('success', t('fs.done', { time: fmt(r.frames.at(-1).time, 3), rise: fmt(r.frames.at(-1).top - r.frames[0].top, 1) }));
    ctx.syncView(); ctx.renderLeft();
    return r;
  }

  function stop() { if (playing) { clearInterval(playing); playing = null; } }
  function play() {
    const e = editing(); if (!e?.result) return;
    stop(); e.frame = 0;
    playing = setInterval(() => { const x = editing(); if (!owns(x) || !x.result) { stop(); return; } x.frame++; if (x.frame >= x.result.frames.length) { x.frame = x.result.frames.length - 1; stop(); } ctx.syncView(); ctx.renderLeft(); }, 150);
    ctx.renderLeft();
  }

  /** The liquid of the shown frame over the see-through part. */
  function decorate(kind) {
    const e = editing(); const v = ctx.viewport();
    if (!v || kind !== 'part' || !owns(e) || !e.result || part()?.id !== e.partId) return;
    const r = e.result, fr = r.frames[Math.min(e.frame, r.frames.length - 1)];
    const mesh = liquidMesh(fr.fill, r.dims, r.origin, r.h);
    if (mesh.triangles.length) v.addBody({ key: 'fs:liquid', mesh: { ...mesh, triangles: Array.from(mesh.triangles) }, edges: null, color: '#2f80ed', faceIndex: new Map(), edgeIndex: new Map(), opacity: 0.85, pickable: false });
    const body = v.bodies.get('body');
    if (body?.mesh) { body.mesh.material.transparent = true; body.mesh.material.opacity = 0.25; body.mesh.material.depthWrite = false; }
    v.requestRender?.();
  }

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmButton } = ctx.pm;
    if (!part()) return pmHead('freeSurface', t('cmd.freeSurface'), t('cam.needPart'));
    const setup = [
      pmSeg('fsLiquid', Object.keys(LIQUIDS).map((k) => [k, t(`fs.liquid.${k}`)]), e.liquid),
      pmNum('fsLevel', e.level, `${t('fs.level')} (%)`, 'freeSurface'),
      pmNum('fsDam', e.dam, `${t('fs.dam')} (%)`, 'freeSurface'),
      pmNum('fsAccel', e.accel, `${t('fs.accel')} (m/s²)`, 'sim2Flow'),
      pmNum('fsDuration', e.duration, `${t('fem.duration')} (s)`, 'clock'),
      pmNum('fsResolution', e.resolution, t('sim2.resolution'), 'plVoxel'),
      `<p class="pm-note">${escapeHtml(t('fs.note'))}</p>`,
      `<div class="pm-row">${pmButton('fs.run', 'play', t('sim.run'), 'primary')}</div>`,
    ].join('');
    let res = '';
    const r = e.result;
    if (r) {
      const fr = r.frames[Math.min(e.frame, r.frames.length - 1)], f0 = r.frames[0];
      res = `${pmNum('fsFrame', e.frame, t('fs.frame', { n: r.frames.length - 1 }), 'clock')}<div class="pm-row">${pmButton(playing ? 'fs.stop' : 'fs.play', playing ? 'stop' : 'play', t(playing ? 'il.stop' : 'il.play'))}</div><dl class="pm-results">
        <dt>${escapeHtml(t('fs.time'))}</dt><dd data-fs-time>${escapeHtml(`${fmt(fr.time, 4)} s`)}</dd>
        <dt>${escapeHtml(t('fs.top'))}</dt><dd>${escapeHtml(`${fmt(fr.top, 1)} mm (${fr.top >= f0.top ? '+' : ''}${fmt(fr.top - f0.top, 1)})`)}</dd>
        <dt>${escapeHtml(t('fs.com'))}</dt><dd>${escapeHtml(`Δx ${fmt(fr.com[0] - f0.com[0], 2)} · Δz ${fmt(fr.com[2] - f0.com[2], 2)} mm`)}</dd>
        <dt>${escapeHtml(t('fs.mass'))}</dt><dd>${escapeHtml(`${fmt((100 * (r.massEnd - r.massStart)) / r.massStart, 3)} %`)}</dd>
        <dt>${escapeHtml(t('sim2.cells'))}</dt><dd>${escapeHtml(`${r.dims.join('×')} (${fmt(r.h, 2)} mm) · ${r.steps}`)}</dd></dl>`;
    }
    return [pmHead('freeSurface', t('cmd.freeSurface'), t('pm.help.freeSurface')), pmGroup('freeSurface', t('fs.setup'), setup), r ? pmGroup('simulation', t('sim.results'), res) : ''].join('');
  }

  function field(key, raw) {
    const e = editing(); const v = Number(String(raw ?? '').replace(',', '.'));
    if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return true; }
    const map = { fsLevel: ['level', 1, 100], fsDam: ['dam', 1, 100], fsAccel: ['accel', -50, 50], fsDuration: ['duration', 0.01, 20], fsResolution: ['resolution', 10, 120] };
    if (key === 'fsFrame') { if (e.result) { e.frame = Math.max(0, Math.min(e.result.frames.length - 1, Math.round(v))); ctx.syncView(); ctx.renderLeft(); } return true; }
    const m = map[key]; if (!m) return false;
    e[m[0]] = Math.min(m[2], Math.max(m[1], v)); e.result = null; ctx.syncView(); ctx.renderLeft(); return true;
  }
  function set(key, value) { if (key === 'fsLiquid' && LIQUIDS[value]) { editing().liquid = value; editing().result = null; ctx.renderLeft(); return true; } return false; }

  const NAMES = new Set(['fs.run', 'fs.play', 'fs.stop']);
  const handles = (name) => NAMES.has(name);
  function command(name) {
    if (name === 'fs.run') return run();
    if (name === 'fs.play') return play();
    if (name === 'fs.stop') { stop(); return ctx.renderLeft(); }
    return undefined;
  }
  const commands = { freeSurface: { icon: 'freeSurface', label: 'cmd.freeSurface', enabled: () => Boolean(part()), checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) } };
  const api = { begin, run, finish, play, stop, frame: (n) => { const e = editing(); if (e?.result) { e.frame = n; ctx.syncView(); ctx.renderLeft(); } } };
  return { commands, owns, pm, pick: () => undefined, field, set, select: () => false, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.freeSurface'), finish, cleanup: stop, decorate, api };
}
