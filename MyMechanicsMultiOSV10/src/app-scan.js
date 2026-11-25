// Scan to Solid (Surfaces tab): a scanned or faceted body (an STL / mesh import) rebuilt as a solid of fitted
// surfaces (cad/scan-fit.js). The page: the noise tolerance (0 = from the size), the smallest planar face width,
// Analyse (the regions found: planes, cylinders, spheres, free-form, with their fit), and Make Solid — a new part
// in the project holding the rebuilt body (the scan part stays as it was).
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { scanToSolid, weld, segmentMesh } from './cad/scan-fit.js';
import { createPart } from './cad/document.js';
import { createFeature } from './cad/features.js';
import { recognizeBody } from './cad/feature-recog.js';

export function createScanTools(ctx) {
  const { state, t } = ctx;
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'scanToSolid';
  const part = () => ctx.activePart();
  const fmt = (v, d = 3) => ctx.fmt(v, d);
  const mesh = () => ctx.partEntry()?.mesh ?? null;
  const opts = (e) => ({ tol: e.tol > 0 ? e.tol : null, minWidth: (e.minWidth ?? 3) / 100 });

  function start() {
    if (!part() || !mesh()) { ctx.notify('info', t('notice.noBody')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'scanToSolid', tol: 0, minWidth: 3, report: null };
    state.leftTab = 'pm';
    ctx.renderAll();
  }
  const summary = (rep) => ({ planes: rep.regions.filter((r) => r.kind === 'plane').length, cylinders: rep.regions.filter((r) => r.kind === 'cylinder').length, spheres: rep.regions.filter((r) => r.kind === 'sphere').length, freeform: rep.regions.filter((r) => r.kind === 'freeform').length });

  function analyse() {
    const e = editing(); const m = mesh();
    if (!m) return null;
    const seg = segmentMesh(weld(m), opts(e));
    e.report = { ...summary(seg), eps: seg.eps, regions: seg.regions.filter((r) => r.kind !== 'freeform' || r.area > 1e-3 * seg.total).slice(0, 40).map((r) => ({ kind: r.kind, area: r.area, rms: r.rms, r: r.fit?.r ?? null, coverage: r.coverage ?? null, convex: r.convex ?? null })) };
    ctx.renderLeft();
    return e.report;
  }

  async function make() {
    const e = editing(); const src = part(); const m = mesh();
    if (!m || !src) return null;
    let out;
    try { out = await ctx.withProgress('progress.scanToSolid', src.name, () => new Promise((resolve, reject) => setTimeout(() => { try { resolve(scanToSolid(m, opts(e))); } catch (error) { reject(error); } }, 20)), { delay: 150 }); }
    catch (error) { ctx.notify('error', t('scan.failed', { reason: error.message })); return null; }
    if (!out) return null;
    const faces = out.shape.faces.map((f) => f.geomType);
    const name = `${src.name} ${t('scan.suffix')}`;
    const p = createPart(name);
    p.material = src.material;
    p.features.push(createFeature(p, 'import', { brep: out.shape.serialize(), source: src.name, name: t('scan.featureName') }));
    ctx.change('op.scanToSolid', (pr) => { pr.parts.push(p); pr.active = { kind: 'part', id: p.id }; });
    e.report = { ...summary(out.report), eps: out.report.tolerance, exact: out.report.exactCylinders, faces: faces.length, analytic: faces.filter((g) => g !== 'PLANE').length, regions: out.report.regions.slice(0, 40).map((r) => ({ ...r, r: r.radius })) };
    ctx.notify('success', t('scan.done', { name, planes: out.report.planes, cylinders: out.report.cylinders, faces: faces.length }));
    state.editing = null; state.leftTab = 'tree';
    ctx.renderAll();
    return { part: p.id, report: e.report, faces };
  }

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmButton } = ctx.pm;
    const r = e.report;
    const res = r ? `<dl class="pm-results scan-results"><dt>${escapeHtml(t('scan.planes'))}</dt><dd>${r.planes}</dd><dt>${escapeHtml(t('scan.cylinders'))}</dt><dd>${r.cylinders}</dd><dt>${escapeHtml(t('scan.spheres'))}</dt><dd>${r.spheres}</dd><dt>${escapeHtml(t('scan.freeform'))}</dt><dd>${r.freeform}</dd><dt>${escapeHtml(t('scan.tolerance'))}</dt><dd>${escapeHtml(`${fmt(r.eps, 4)} mm`)}</dd></dl>
      <table class="sim2-table scan-table"><tr><th>${escapeHtml(t('scan.region'))}</th><th>${escapeHtml(t('scan.area'))}</th><th>${escapeHtml(t('scan.fit'))}</th><th>RMS</th></tr>${r.regions.filter((x) => x.kind !== 'freeform').map((x) => `<tr><td>${escapeHtml(t(`scan.kind.${x.kind}`))}</td><td>${escapeHtml(fmt(x.area, 1))}</td><td>${escapeHtml(x.r != null ? `R ${fmt(x.r, 3)}${x.coverage != null ? ` · ${Math.round(x.coverage)}°${x.convex ? ' ⊃' : ' ⊂'}` : ''}` : '')}</td><td>${escapeHtml(x.rms != null ? fmt(x.rms, 4) : '')}</td></tr>`).join('')}</table>` : '';
    return [
      pmHead('scanToSolid', t('cmd.scanToSolid'), t('pm.help.scanToSolid')),
      pmGroup('scanToSolid', t('scan.settings'), `${pmNum('scanTol', e.tol, `${t('scan.tolerance')} (mm, 0 = ${t('scan.auto')})`, 'smartDim')}${pmNum('scanMinWidth', e.minWidth, `${t('scan.minWidth')} (%)`, 'smartDim')}<p class="pm-note">${escapeHtml(t('scan.note'))}</p><div class="pm-row">${pmButton('scan.analyse', 'measure', t('scan.analyse'))}${pmButton('scan.make', 'scanToSolid', t('scan.make'), 'primary')}</div>`),
      res ? pmGroup('statistics', t('scan.regions'), res) : '',
    ].join('');
  }
  function field(key, raw, v) {
    const e = editing();
    if (key === 'scanTol' && v != null && v >= 0) { e.tol = v; e.report = null; }
    else if (key === 'scanMinWidth' && v > 0 && v < 50) { e.minWidth = v; e.report = null; }
    else ctx.notify('error', t('notice.invalidValue', { text: raw }));
    return ctx.renderLeft();
  }
  const handles = (name) => /^scan\./.test(name);
  function command(name) {
    if (name === 'scan.analyse') return analyse();
    if (name === 'scan.make') return make();
    return undefined;
  }
  /**
   * Feature recognition (FeatureWorks-like): the part's imported body (its last 'import' feature) replaced by
   * reference planes, sketches and extrudes (steps along the main axis, hole cuts) that rebuild it; the import
   * feature is kept, suppressed, above them. Undoable as one change.
   */
  async function recognize() {
    const p = part(), entry = ctx.partEntry();
    const imp = p?.features.filter((f) => f.type === 'import' && !f.suppressed).at(-1);
    if (!p || !imp || !entry?.body) { ctx.notify('info', t('recog.needImport')); return null; }
    let out;
    try { out = await ctx.withProgress('progress.recognize', p.name, () => new Promise((resolve, reject) => setTimeout(() => { try { resolve(recognizeBody(entry.body)); } catch (error) { reject(error); } }, 20)), { delay: 150 }); }
    catch (error) { ctx.notify('error', t('recog.failed', { reason: error.message })); return null; }
    if (!out?.features.length) { ctx.notify('warning', t('recog.none')); return out?.report ?? null; }
    ctx.change('op.recognize', (pr) => {
      const q = pr.parts.find((x) => x.id === p.id), f0 = q.features.find((f) => f.id === imp.id);
      if (f0) f0.suppressed = true;
      q.features.push(...out.features);
    });
    ctx.notify('success', t('recog.done', { steps: out.report.steps, holes: out.report.holes, axis: out.report.axis.toUpperCase() }));
    ctx.renderAll();
    return out.report;
  }

  const accept = () => { state.editing = null; state.leftTab = 'tree'; return ctx.renderAll(); };
  const commands = {
    recognizeFeatures: { icon: 'recognizeFeatures', label: 'cmd.recognizeFeatures', enabled: () => Boolean(part()?.features.some((f) => f.type === 'import' && !f.suppressed)), run: () => recognize() },
    scanToSolid: { icon: 'scanToSolid', label: 'cmd.scanToSolid', enabled: () => Boolean(part() && mesh()), checked: () => owns(editing()), run: () => (owns(editing()) ? ctx.cancelEditing({ quiet: true }) : start()) },
  };
  return { owns, pm, pick: () => undefined, field, set: () => undefined, toggle: () => undefined, select: () => false, accept, subject: () => t('cmd.scanToSolid'), handles, command, commands, api: { start, analyse, make, recognize } };
}
