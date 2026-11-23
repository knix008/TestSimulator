// Defeature (Tools): a simplified part — the details (small fillets, chamfers, holes, threads, logos …) found by the
// criteria (cad/defeature.js), the chosen ones suppressed in a "Simplified" configuration (features that then fail to
// rebuild go too), and optionally a new part holding only the simplified body (no feature history: for sharing).
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { candidates, defeature, DEFAULT_CRITERIA } from './cad/defeature.js';
import { effectiveFeatures } from './cad/params.js';
import { createPart } from './cad/document.js';
import { createFeature } from './cad/features.js';

export function createDefeatureTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'defeature';
  const part = () => ctx.activePart();
  const fmt = (v, d = 2) => ctx.fmt(v, d);

  function begin() {
    const p = part();
    if (!p) { notify('info', t('notice.partOnly')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    const criteria = { ...DEFAULT_CRITERIA };
    state.editing = { mode: 'defeature', criteria, off: new Set(), asPart: false, name: t('df.defaultName'), preview: null };
    ctx.renderAll();
  }
  function finish() { ctx.cancelEditing({ quiet: true }); }
  const list = (e = editing()) => candidates(part(), e.criteria);
  const chosen = (e = editing()) => list(e).filter((c) => !e.off.has(c.id)).map((c) => c.id);

  /** Builds the part with `ids` suppressed (a copy; the open part unchanged): { faces, volume } of both. */
  function preview() {
    const e = editing(), p = part(); if (!owns(e) || !p) return null;
    const ids = new Set(chosen(e));
    const R = ctx.rep();
    const now = ctx.buildPart(p);
    const copy = { ...p, features: effectiveFeatures(p).map((f) => (ids.has(f.id) ? { ...f, suppressed: true } : f)), configurations: [], config: null };
    const simple = ctx.buildPart(copy, { slot: 'defeature' });
    const facesOf = (b) => (b?.body ? b.body.faces.length : 0);
    const volOf = (b) => (b?.body ? R.measureShapeVolumeProperties(b.body).volume : 0);
    e.preview = { facesBefore: facesOf(now), facesAfter: facesOf(simple), volumeBefore: volOf(now), volumeAfter: volOf(simple), failed: [...(simple?.result?.results ?? new Map()).entries()].filter(([, r]) => r?.ok === false).length };
    ctx.renderLeft();
    return e.preview;
  }

  /** The configuration with the details suppressed; failing features follow; optionally the body as a new part. */
  function apply() {
    const e = editing(), p = part(); if (!owns(e) || !p) return null;
    const ids = chosen(e);
    if (!ids.length) { notify('info', t('df.nothing')); return null; }
    // The part is changed in place (rebuilt between the rounds), then committed once: one undo step for all of it.
    let extra = 0;
    defeature(p, ids, { name: e.name || t('df.defaultName') });
    // Features built on a removed one fail now: they are suppressed too (a few rounds — one may unblock the next).
    for (let round = 0; round < 5; round++) {
      const failing = ctx.rebuildErrors(p).map((x) => x.feature.id);
      if (!failing.length) break;
      const c = (p.configurations ?? []).find((x) => x.defeatured);
      for (const id of failing) c.suppress[id] = true;
      extra += failing.length;
    }
    let made = null, np = null;
    if (e.asPart) {
      const body = ctx.buildPart(p)?.body;
      if (body) {
        np = createPart(`${p.name} — ${e.name || t('df.defaultName')}`);
        np.material = p.material; np.partNo = p.partNo; np.description = p.description;
        np.features.push(createFeature(np, 'import', { brep: body.serialize(), source: p.name, name: t('df.bodyName') }));
        made = np.name;
      }
    }
    ctx.change('op.defeature', (proj) => { if (np) proj.parts.push(np); });
    notify('success', t('df.done', { n: ids.length, extra, name: made ?? '' }) + (made ? ` ${t('df.newPart', { name: made })}` : ''));
    finish();
    return { suppressed: ids.length + extra, part: made };
  }

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmNum } = ctx.pm;
    const c = e.criteria;
    const check = (key, on, label) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/><span>${escapeHtml(label)}</span></label>`;
    const crit = `${check('df.fillets', c.fillets, t('df.fillets'))}${c.fillets ? pmNum('df.filletRadius', c.filletRadius, `${t('df.upTo')} R (mm)`, 'featFillet') : ''}${check('df.chamfers', c.chamfers, t('df.chamfers'))}${c.chamfers ? pmNum('df.chamferDistance', c.chamferDistance, `${t('df.upTo')} (mm)`, 'featChamfer') : ''}${check('df.holes', c.holes, t('df.holes'))}${c.holes ? pmNum('df.holeDiameter', c.holeDiameter, `${t('df.upTo')} Ø (mm)`, 'featHole') : ''}${check('df.threads', c.threads, t('df.threads'))}${check('df.wraps', c.wraps, t('df.wraps'))}${check('df.domes', c.domes, t('df.domes'))}`;
    const items = list(e);
    const rows = items.length ? `<ul class="df-list">${items.map((x) => `<li><label class="pm-check"><input type="checkbox" data-pm-toggle="df.item:${escapeHtml(x.id)}" ${e.off.has(x.id) ? '' : 'checked'}/><span>${escapeHtml(x.name)} <small>${escapeHtml(t(`df.reason.${x.reason}`))}${x.size != null ? ` ${fmt(x.size)}` : ''}</small></span></label></li>`).join('')}</ul>` : `<p class="pm-note">${escapeHtml(t('df.none'))}</p>`;
    const pv = e.preview ? `<dl class="pm-results"><dt>${escapeHtml(t('df.faces'))}</dt><dd>${e.preview.facesBefore} → ${e.preview.facesAfter}</dd><dt>${escapeHtml(t('df.volume'))}</dt><dd>${fmt(e.preview.volumeBefore, 0)} → ${fmt(e.preview.volumeAfter, 0)} mm³</dd>${e.preview.failed ? `<dt>${escapeHtml(t('df.failing'))}</dt><dd class="error">${e.preview.failed}</dd>` : ''}</dl>` : '';
    return [
      pmHead('defeature', t('cmd.defeature'), t('pm.help.defeature')),
      pmGroup('statistics', t('df.criteria'), crit),
      pmGroup('defeature', t('df.details', { n: items.length - items.filter((x) => e.off.has(x.id)).length }), `${rows}<div class="pm-row">${pmButton('df.preview', 'massProps', t('df.preview'))}</div>${pv}`),
      pmGroup('configurations', t('df.result'), `<label class="pm-field"><span class="pm-label">${escapeHtml(t('df.configName'))}</span><input type="text" class="pm-text" data-pm-field="df.name" value="${escapeHtml(e.name)}" spellcheck="false"/></label>${check('df.asPart', e.asPart, t('df.asPart'))}<div class="pm-row">${pmButton('df.apply', 'check', t('df.apply'), 'primary')}</div>`),
    ].join('');
  }
  void icon;

  function field(key, raw) {
    const e = editing(); const v = Number(String(raw ?? '').replace(',', '.'));
    if (key === 'df.name') { e.name = String(raw ?? '').trim() || t('df.defaultName'); return ctx.renderLeft(); }
    const k = { 'df.filletRadius': 'filletRadius', 'df.chamferDistance': 'chamferDistance', 'df.holeDiameter': 'holeDiameter' }[key];
    if (k && v >= 0) { e.criteria[k] = v; e.preview = null; }
    return ctx.renderLeft();
  }
  function toggle(key, checked) {
    const e = editing(); let m;
    if ((m = /^df\.item:(.+)$/.exec(key))) { if (checked) e.off.delete(m[1]); else e.off.add(m[1]); e.preview = null; ctx.renderLeft(); return true; }
    if (key === 'df.asPart') { e.asPart = Boolean(checked); ctx.renderLeft(); return true; }
    const k = { 'df.fillets': 'fillets', 'df.chamfers': 'chamfers', 'df.holes': 'holes', 'df.threads': 'threads', 'df.wraps': 'wraps', 'df.domes': 'domes' }[key];
    if (k) { e.criteria[k] = Boolean(checked); e.preview = null; ctx.renderLeft(); return true; }
    return false;
  }
  const NAMES = new Set(['df.preview', 'df.apply']);
  const handles = (name) => NAMES.has(name);
  function command(name) { if (name === 'df.preview') return preview(); if (name === 'df.apply') return apply(); return undefined; }
  const commands = { defeature: { icon: 'defeature', label: 'cmd.defeature', enabled: () => Boolean(part()), checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) } };
  const api = { begin, preview, apply, candidates: () => list(), choose: (id, on) => toggle(`df.item:${id}`, on) };
  return { commands, owns, pm, pick: () => undefined, field, set: () => undefined, select: () => false, toggle, accept: () => apply(), handles, command, subject: () => t('cmd.defeature'), finish, api };
}
