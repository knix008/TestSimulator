// Printed reports (File › Print): standalone HTML documents laid out in pages by the print window
// (print/printwin.js, paged.js) and printed or saved as PDF. Each report is a production document a
// broadcaster keeps or hands over: the scene rundown (with a picture of every scene), the source list,
// the audio setup, the hotkeys, the output settings, the session log and the feature list.
import { FILTER_TYPES, SOURCE_TYPES, TRANSITION_TYPES } from '../bc/catalog.js';
import * as M from '../bc/model.js';
import { FEATURES } from '../bc/features.js';
import { mulToDb } from '../bc/engine/audio.js';
import { encodersOf } from './profile.js';
import { hotkeyActions } from './hotkeys.js';

export const REPORTS = ['scenes', 'sources', 'audio', 'hotkeys', 'output', 'session', 'features'];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const db = (mul) => (mul > 0 ? `${mulToDb(mul).toFixed(1)} dB` : '-∞ dB');
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const CSS = `
  @page { @bottom-center { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #666; } @top-right { content: string(title); font: 8pt sans-serif; color: #888; } }
  body { font: 10pt/1.45 "Malgun Gothic", "Segoe UI", "Noto Sans KR", sans-serif; color: #111; }
  h1 { string-set: title content(); font-size: 20pt; margin: 0 0 4mm; border-bottom: 2px solid #e5484d; padding-bottom: 2mm; }
  h2 { font-size: 13pt; margin: 7mm 0 2mm; break-after: avoid; color: #1d3c78; }
  h3 { font-size: 11pt; margin: 4mm 0 1.5mm; break-after: avoid; }
  .meta { color: #555; font-size: 9pt; margin-bottom: 5mm; display: grid; grid-template-columns: max-content 1fr; gap: 0.5mm 4mm; }
  table { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 8.8pt; break-inside: auto; }
  th, td { border: 0.3mm solid #bbb; padding: 1mm 1.6mm; text-align: left; vertical-align: top; }
  th { background: #eef2f8; font-weight: 700; }
  tr { break-inside: avoid; }
  .scene { break-inside: avoid; margin-bottom: 6mm; }
  .thumb { width: 82mm; border: 0.3mm solid #888; display: block; margin: 1mm 0 2mm; background: #000; }
  .tag { display: inline-block; padding: 0 1.5mm; border-radius: 1mm; background: #eee; font-size: 8pt; margin-right: 1mm; }
  .tag.live { background: #e5484d; color: #fff; } .tag.preview { background: #21c35a; color: #fff; }
  .muted { color: #777; } .small { font-size: 8pt; } code { font: 8pt Consolas, monospace; }
  .ok { color: #157f3b; } .warn { color: #a15c00; } .bad { color: #b3121a; }
`;

function page(title, meta, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
    <h1>${esc(title)}</h1><div class="meta">${meta.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>${body}</body></html>`;
}

const sourceName = (c, id) => c.sources[id]?.name ?? M.sceneById(c, id)?.name ?? '?';
const typeName = (t, c, id) => (M.sceneById(c, id) ? t('src.scene') : t(`src.${c.sources[id]?.type}`));

function settingsSummary(t, src) {
  const s = src.settings;
  const files = [s.file, s.local_file, s.input, s.url].filter((x) => typeof x === 'string' && x && x !== 'https://').map((x) => (x.startsWith('sample:') ? `${t('prop.sample')} ${x.slice(7)}` : x.startsWith('asset:') ? t('prop.storedFile') : x));
  const list = [...(Array.isArray(s.files) ? s.files : []), ...(Array.isArray(s.playlist) ? s.playlist : [])];
  const parts = [...files];
  if (list.length) parts.push(t('report.files', { n: list.length }));
  if (src.type === 'text_gdiplus') parts.push(`${t(`opt.text_mode.${s.text_mode}`, null, s.text_mode)}: "${String(s.text_mode === 'static' ? s.text ?? '' : s.clock_format ?? '').slice(0, 60)}" · ${s.font?.face} ${s.font?.size}px`);
  if (src.type === 'color_source_v3') parts.push(`${s.color} · ${s.width}×${s.height}`);
  if (src.type === 'browser_source') parts.push(`${s.mode} · ${s.width}×${s.height}`);
  if (src.type === 'dshow_input') parts.push(s.res_type === 'custom' ? `${s.resolution} @ ${s.frame_interval}` : t('opt.res_type.device'));
  return parts.join(' · ') || '—';
}

/** The report's HTML. `studio` gives the collection, profile, log and stats; thumbnails come from the engine. */
export async function buildReport(kind, { studio, t, lang = 'ko', thumbnails = true, version = '1.0.0', sys = null } = {}) {
  const c = studio.c;
  const p = studio.profile;
  const now = new Date().toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');
  const meta = [[t('report.collection'), studio.collections.current], [t('report.profile'), p.name], [t('report.date'), now], [t('report.program'), `MyBroadcasting ${version}`]];
  const title = t(`report.${kind}`);

  if (kind === 'scenes') {
    const parts = [];
    parts.push(`<table><tr><th>#</th><th>${esc(t('report.scene'))}</th><th>${esc(t('report.items'))}</th><th>${esc(t('report.transition'))}</th><th>${esc(t('report.state'))}</th></tr>${c.scenes.map((s, i) => {
      const o = s.override ? M.transitionById(c, s.override.transition) : null;
      return `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${M.allItems(s).length}</td><td>${esc(o ? `${o.name} (${s.override.duration} ms)` : t('report.default'))}</td><td>${s.id === c.current ? `<span class="tag live">${esc(t('studio.program'))}</span>` : ''}${studio.studioMode && s.id === c.preview ? `<span class="tag preview">${esc(t('studio.preview'))}</span>` : ''}</td></tr>`;
    }).join('')}</table>`);
    for (const s of c.scenes) {
      let img = '';
      if (thumbnails && studio.engine) {
        const blob = await studio.engine.screenshot(`scene:${s.id}`, 'image/jpeg').catch(() => null);
        if (blob) img = `<img class="thumb" src="${await blobUrl(blob)}" alt="" />`;
      }
      const rows = [...M.allItems(s)].reverse().map((it) => {
        const tr = it.transform;
        const parent = s.items.find((g) => g.children?.includes(it));
        return `<tr><td>${parent ? '↳ ' : ''}${esc(sourceName(c, it.source))}</td><td>${esc(typeName(t, c, it.source))}</td><td>${it.visible ? '✔' : '—'}${it.locked ? ' 🔒' : ''}</td><td>${round(tr.x)}, ${round(tr.y)}</td><td>${round(tr.sx, 3)} × ${round(tr.sy, 3)}${tr.rot ? ` · ${round(tr.rot)}°` : ''}</td><td>${esc(t(`bounds.${tr.bounds.type}`))}${tr.crop.l + tr.crop.t + tr.crop.r + tr.crop.b ? ` · ${esc(t('transform.crop'))} ${tr.crop.l}/${tr.crop.t}/${tr.crop.r}/${tr.crop.b}` : ''}</td><td>${esc(t(`blend.${it.blend}`))}</td></tr>`;
      }).join('');
      parts.push(`<section class="scene"><h2>${esc(s.name)}</h2>${img}${(s.filters ?? []).length ? `<p class="small">${esc(t('report.sceneFilters'))}: ${esc(s.filters.map((f) => f.name).join(', '))}</p>` : ''}
        <table><tr><th>${esc(t('report.source'))}</th><th>${esc(t('report.type'))}</th><th>${esc(t('report.visible'))}</th><th>${esc(t('transform.position'))}</th><th>${esc(t('transform.scale'))}</th><th>${esc(t('transform.boundsType'))}</th><th>${esc(t('transform.blend'))}</th></tr>${rows || `<tr><td colspan="7" class="muted">${esc(t('dock.noSources'))}</td></tr>`}</table></section>`);
    }
    parts.push(`<h2>${esc(t('report.transitions'))}</h2><table><tr><th>${esc(t('trn.name'))}</th><th>${esc(t('report.type'))}</th><th>${esc(t('report.settings'))}</th></tr>${c.transitions.map((x) => `<tr><td>${esc(x.name)}${x.id === c.transition ? ' ✔' : ''}</td><td>${esc(t(`trn.${x.type}`))}</td><td class="small">${esc(Object.entries(x.settings).map(([k, v]) => `${t(`prop.${k}`, null, k)}: ${v}`).join(' · ') || '—')}</td></tr>`).join('')}</table><p class="small">${esc(t('trn.duration'))}: ${c.duration} ms</p>`);
    return page(title, meta, parts.join(''));
  }

  if (kind === 'sources') {
    const used = new Map();
    for (const s of c.scenes) for (const it of M.allItems(s)) { if (!used.has(it.source)) used.set(it.source, []); used.get(it.source).push(s.name); }
    const rows = Object.values(c.sources).map((src) => `<tr><td>${esc(src.name)}${src.global ? ` <span class="tag">${esc(t('audio.globalTag'))}</span>` : ''}</td><td>${esc(t(`src.${src.type}`))}</td><td class="small">${esc(settingsSummary(t, src))}</td><td class="small">${esc((src.filters ?? []).map((f) => `${f.name}${f.enabled ? '' : ` (${t('report.off')})`}`).join(', ') || '—')}</td><td class="small">${esc([...new Set(used.get(src.id) ?? [])].join(', ') || '—')}</td></tr>`).join('');
    return page(title, meta, `<table><tr><th>${esc(t('report.source'))}</th><th>${esc(t('report.type'))}</th><th>${esc(t('report.settings'))}</th><th>${esc(t('report.filters'))}</th><th>${esc(t('report.usedIn'))}</th></tr>${rows || `<tr><td colspan="5" class="muted">—</td></tr>`}</table>`);
  }

  if (kind === 'audio') {
    const audio = Object.values(c.sources).filter((s) => s.audio && s.type !== 'group');
    const rows = audio.map((s) => { const a = s.audio; return `<tr><td>${esc(s.name)}</td><td>${esc(db(a.volume))}${a.muted ? ` <span class="bad">${esc(t('audio.muted'))}</span>` : ''}</td><td>${Math.round((a.balance - 0.5) * 200)}</td><td>${a.sync} ms</td><td>${a.mono ? '✔' : '—'}</td><td>${esc(t(`audio.monitor.${a.monitor}`))}</td><td>${a.tracks.map((on, i) => (on ? i + 1 : '·')).join(' ')}</td><td class="small">${esc([a.ptt.enabled ? `PTT ${a.ptt.delay} ms` : '', a.ptm.enabled ? `PTM ${a.ptm.delay} ms` : ''].filter(Boolean).join(' · ') || '—')}</td><td class="small">${esc(s.filters.filter((f) => FILTER_TYPES[f.type]?.kind === 'audio').map((f) => f.name).join(', ') || '—')}</td></tr>`; }).join('');
    const a = p.audio;
    return page(title, [...meta, [t('settings.audio.sampleRate'), `${a.sampleRate} Hz`], [t('settings.audio.channels'), t(`opt.channels.${a.channels}`)]],
      `<table><tr><th>${esc(t('report.source'))}</th><th>${esc(t('audio.volume'))}</th><th>${esc(t('audio.balance'))}</th><th>${esc(t('audio.sync'))}</th><th>${esc(t('audio.mono'))}</th><th>${esc(t('audio.monitor'))}</th><th>${esc(t('audio.tracks'))}</th><th>PTT/PTM</th><th>${esc(t('report.filters'))}</th></tr>${rows || `<tr><td colspan="9" class="muted">${esc(t('audio.noSources'))}</td></tr>`}</table>
       <h2>${esc(t('settings.audio.devices'))}</h2><table>${Object.entries(a.devices).map(([k, v]) => `<tr><th>${esc(t(`audio.global.${k}`))}</th><td>${esc(v ? (v === 'default' ? t('prop.deviceDefault') : v) : t('report.off'))}</td></tr>`).join('')}</table>`);
  }

  if (kind === 'hotkeys') {
    const bound = studio.hotkeyBindings;
    const actions = hotkeyActions(c).filter((x) => bound[x.id]?.length);
    const rows = actions.map((x) => `<tr><td>${esc(t(...x.label))}</td><td><code>${esc([].concat(bound[x.id]).join(', '))}</code></td></tr>`).join('');
    return page(title, meta, `<table><tr><th>${esc(t('report.action'))}</th><th>${esc(t('report.keys'))}</th></tr>${rows || `<tr><td colspan="2" class="muted">${esc(t('report.noHotkeys'))}</td></tr>`}</table>`);
  }

  if (kind === 'output') {
    const enc = encodersOf(p);
    const target = studio.streamTarget();
    const row = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
    const v = p.video;
    return page(title, meta, `<h2>${esc(t('settings.video'))}</h2><table>${row(t('settings.video.base'), v.base)}${row(t('settings.video.output'), v.output)}${row(t('settings.video.fps'), v.fps)}${row(t('settings.video.downscale'), t(`opt.downscale.${v.downscale}`, null, v.downscale))}</table>
      <h2>${esc(t('settings.stream'))}</h2><table>${row(t('settings.stream.service'), target.service.name)}${row(t('settings.stream.server'), target.server ?? '—')}${row(t('settings.stream.protocol'), target.protocol ?? '—')}${row(t('settings.stream.key'), p.stream.key ? '••••••••' : '—')}${row(t('report.problems'), target.problems.map((x) => t(`stream.problem.${x}`)).join(' · ') || t('report.none'))}</table>
      <h2>${esc(t('settings.output'))}</h2><table>${row(t('settings.output.mode'), t(`opt.mode.${p.output.mode}`, null, p.output.mode))}${row(t('report.streamEncoder'), `${enc.stream.codec} · ${enc.stream.bitrate} kb/s · ${enc.stream.rateControl} · ${t('settings.output.keyint')} ${enc.stream.keyint} s`)}${row(t('report.streamAudio'), `${enc.audio.stream.codec} · ${enc.audio.stream.bitrate} kb/s`)}${row(t('report.recordEncoder'), `${enc.record.codec} · ${enc.record.rateControl === 'CQP' ? `CQP ${enc.record.cqp}` : `${enc.record.bitrate} kb/s ${enc.record.rateControl}`}`)}${row(t('settings.output.format'), enc.container)}${row(t('settings.output.tracks'), enc.tracks.join(', '))}${row(t('settings.output.path'), enc.path || t('report.default'))}${row(t('settings.output.split'), enc.split.mode === 'off' ? t('report.off') : enc.split.mode === 'time' ? `${enc.split.minutes} min` : `${enc.split.mb} MB`)}${row(t('settings.output.replay'), `${enc.replay.seconds} s · ${enc.replay.maxMB} MB`)}</table>
      <h2>${esc(t('settings.advanced'))}</h2><table>${row(t('settings.advanced.filename'), p.advanced.filenameFormat)}${row(t('settings.advanced.delay'), p.advanced.delay.enabled ? `${p.advanced.delay.seconds} s` : t('report.off'))}${row(t('settings.advanced.reconnect'), p.advanced.reconnect.enabled ? `${p.advanced.reconnect.delay} s × ${p.advanced.reconnect.retries}` : t('report.off'))}${row(t('settings.advanced.autoRemux'), p.advanced.autoRemux ? p.advanced.remuxFormat : t('report.off'))}</table>`);
  }

  if (kind === 'session') {
    const st = studio.stats();
    const row = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
    const lines = studio.logLines.slice(-400);
    return page(title, meta, `<h2>${esc(t('report.summary'))}</h2><table>${row(t('stats.fps'), `${st.fps} / ${round(st.target, 2)}`)}${row(t('stats.render'), `${st.renderMs.toFixed(2)} ms`)}${row(t('stats.lagged'), `${st.lagged} / ${st.frames}`)}${row(t('stats.skipped'), `${st.skipped}`)}${row(t('stats.cpu'), sys?.cpu != null ? `${sys.cpu.toFixed(1)}%` : '—')}${row(t('stats.stream'), st.stream ? `${Math.round(st.stream.seconds)} s · ${Math.round(st.stream.kbps)} kb/s` : t('report.off'))}${row(t('stats.recording'), st.recording ? `${Math.round(st.recording.seconds)} s · ${st.recording.path}` : studio.lastRecording ? studio.lastRecording.path : t('report.off'))}</table>
      <h2>${esc(t('report.log'))}</h2><table><tr><th>${esc(t('report.time'))}</th><th>${esc(t('report.level'))}</th><th>${esc(t('report.message'))}</th></tr>${lines.map((l) => `<tr><td class="small">${esc(l.at.toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US'))}</td><td class="${l.level === 'error' ? 'bad' : l.level === 'warning' ? 'warn' : ''}">${esc(t(`log.${l.level}`, null, l.level))}</td><td class="small">${esc(l.text)}</td></tr>`).join('') || `<tr><td colspan="3" class="muted">${esc(t('log.empty'))}</td></tr>`}</table>`);
  }

  // features
  const byArea = new Map();
  for (const f of FEATURES) { if (!byArea.has(f.area)) byArea.set(f.area, []); byArea.get(f.area).push(f); }
  const body = [...byArea].map(([area, list]) => `<h2>${esc(t(`feature.area.${area}`))}</h2><table><tr><th>${esc(t('report.feature'))}</th><th>${esc(t('report.status'))}</th><th>ID</th></tr>${list.map((f) => `<tr><td>${esc(lang === 'ko' ? f.ko : f.en)}</td><td class="${f.status === 'full' ? 'ok' : f.status === 'unsupported' ? 'bad' : 'warn'}">${esc(t(`feature.status.${f.status}`))}</td><td><code>${esc(f.id)}</code></td></tr>`).join('')}</table>`).join('');
  return page(title, [...meta, [t('report.featureCount'), String(FEATURES.length)]], `<p class="small">${esc(t('report.featuresNote'))}</p>${body}`);
}

function blobUrl(blob) {
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob); });
}

export { SOURCE_TYPES, TRANSITION_TYPES };
