// Settings › Voice: guide synth or AI voice, the voice banks (download, re-download, import, remove,
// licence and credits with Accept), the voice colour, render quality, the compute device and a test.
// Runs inside popup.js like settingsAi: `api` supplies row / button / segmented / select / t / s / state.
// Downloads keep going when this window closes (desktop: in Rust; web: in the main window).
import { formatBytes } from './i18n.js';
import { chooseFiles, pickWithInput } from './platform/native.js';
import {
  acceptLicence, backendInfo, bankInfo, CATALOG, cancelDownload, DEFAULT_BANK, downloadBank, IMPORT_HINTS, importBank, isAccepted,
  listBanks, onVoiceEvent, redownload, removeBank,
} from './audio/singer/index.js';
import { isDesktop } from './audio/singer/storage.js';

const RUNNING = ['queued', 'download', 'verify', 'unzip'];

function voiceState(api) {
  const v = (api.state.voice ??= { banks: null, loading: false, licence: null, info: null, error: null, confirm: null, backend: null, renderAt: 0 });
  if (!v.subscribed) {
    v.subscribed = true;
    // Progress and changes from any window: refresh, at most ~5 times a second.
    onVoiceEvent((event) => {
      if (event.type === 'changed') { refresh(api); return; }
      const p = event.progress;
      const bank = v.banks?.find((b) => b.id === p.id);
      if (bank) {
        bank.progress = p;
        bank.status = RUNNING.includes(p.phase) ? 'downloading' : bank.status;
        if (p.phase === 'error') v.error = { code: p.code || 'network', message: p.error, id: p.id };
      }
      if (!RUNNING.includes(p.phase)) { refresh(api); return; }
      const now = Date.now();
      if (now - v.renderAt > 200) { v.renderAt = now; api.render(); }
    });
  }
  if (!v.banks && !v.loading) refresh(api);
  // Opened to accept a licence (the app got VoiceError 'licence'): show that bank's licence first.
  const want = api.P?.()?.voiceLicence;
  if (want && !v.openedFromParams) { v.openedFromParams = true; setTimeout(() => openLicence(api, want), 0); }
  return v;
}

function refresh(api) {
  const v = api.state.voice;
  v.loading = true;
  listBanks()
    .then((banks) => { v.banks = banks; })
    .catch((error) => { v.banks = []; v.error = { code: error.code ?? 'storage', message: error.message }; })
    .finally(() => { v.loading = false; api.render(); });
  if (!v.backend) backendInfo().then((info) => { v.backend = info; api.render(); }).catch(() => {});
}

const pct = (p) => Math.round(100 * (p?.fraction ?? (p?.total ? p.done / p.total : 0)));
const langs = (list) => (list ?? []).map((l) => l.toUpperCase()).join(' · ');

function progressBar(api, p) {
  const { t, escapeHtml } = api;
  const speed = p.speed > 0 ? ` · ${formatBytes(p.speed)}/s` : '';
  const line = t('voice.progressLine', { phase: t(`voice.phase.${p.phase}`), done: formatBytes(p.done), total: formatBytes(p.total), speed });
  return `<div class="voice-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(p)}" title="${escapeHtml(p.file || line)}">
    <div class="voice-progress-bar"><i style="width:${pct(p)}%"></i></div><span class="muted">${escapeHtml(line)}${p.file ? ` — ${escapeHtml(p.file)}` : ''}</span></div>`;
}

function statusBadge(api, b) {
  const { t, icon, escapeHtml } = api;
  if (b.status === 'downloading') return `<span class="badge">${icon('refresh')}${escapeHtml(t('voice.status.downloading', { percent: pct(b.progress) }))}</span>`;
  if (b.status === 'broken') return `<span class="badge danger" title="${escapeHtml(b.problems.join(', '))}">${icon('warning')}${escapeHtml(t('voice.status.broken'))}</span>`;
  if (b.status === 'installed') return `<span class="badge ok">${icon('check')}${escapeHtml(t('voice.status.installed'))}${b.version ? ` ${escapeHtml(b.version)}` : ''}</span>`;
  return `<span class="badge">${escapeHtml(t('voice.status.missing'))}</span>`;
}

function bankRow(api, b) {
  const { t, icon, escapeHtml, button } = api;
  const v = api.state.voice;
  const running = b.status === 'downloading';
  const actions = [];
  actions.push(button('voice-licence', t('voice.licence'), 'info', 'small', b.id));
  if (running) actions.push(button('voice-cancel', t('voice.cancel'), 'stop', 'small', b.id, `title="${escapeHtml(t('voice.cancelTip'))}"`));
  else if (b.catalog && !b.installed) actions.push(button('voice-download', t('voice.download'), 'importFile', 'small primary', b.id));
  else if (b.catalog) actions.push(button('voice-redownload', t('voice.redownload'), 'refresh', 'small', b.id, `title="${escapeHtml(t('voice.redownloadTip'))}"`));
  if (b.installed && !running) {
    actions.push(v.confirm === b.id
      ? button('voice-remove-yes', t('voice.removeConfirm', { name: b.name }), 'trash', 'small danger', b.id)
      : button('voice-remove', t('voice.remove'), 'trash', 'small', b.id));
  }
  const vocoder = b.vocoder && !b.vocoder.bundled ? `<span class="muted">${escapeHtml(t('voice.needsVocoder', { name: CATALOG[b.vocoder.id]?.name ?? b.vocoder.id }))}</span>` : b.vocoder?.bundled ? `<span class="muted">${escapeHtml(t('voice.bundledVocoder'))}</span>` : '';
  const err = v.error?.id === b.id && !running ? `<span class="badge danger" title="${escapeHtml(v.error.message ?? '')}">${icon('warning')}${escapeHtml(t(`voice.error.${v.error.code}`, null, v.error.message))}</span>` : '';
  return `<div class="voice-bank" data-bank="${escapeHtml(b.id)}">
    <div class="voice-bank-head">${icon(b.kind === 'vocoder' ? 'waveform' : 'instVocal')}<b>${escapeHtml(b.name)}</b>
      ${statusBadge(api, b)}
      <span class="badge ${b.accepted ? 'ok' : ''}">${icon(b.accepted ? 'check' : 'key')}${escapeHtml(t(b.accepted ? 'voice.licenceAccepted' : 'voice.licenceNeeded'))}</span>
      ${b.licence ? `<span class="badge" title="${escapeHtml(t('voice.nonCommercial'))}">${escapeHtml(b.licence)}</span>` : ''}</div>
    <div class="voice-bank-meta muted">${b.languages?.length ? `${escapeHtml(t('voice.languages'))}: ${escapeHtml(langs(b.languages))} · ` : ''}${escapeHtml(t('voice.size'))}: ${escapeHtml(formatBytes(b.size))}${b.catalog && !b.installed && CATALOG[b.id] ? ` · ${escapeHtml(t('voice.downloadSize', { size: formatBytes(CATALOG[b.id].size) }))}` : ''} ${vocoder}</div>
    ${running && b.progress ? progressBar(api, b.progress) : ''}
    <div class="voice-bank-actions">${actions.join('')}${err}</div>
  </div>`;
}

/** The licence and credits of one bank, with Accept (and the vocoder's terms when it needs one). */
function licenceView(api) {
  const { t, icon, escapeHtml, button } = api;
  const v = api.state.voice;
  const info = v.info;
  if (!info) return `<p class="muted">${escapeHtml(t('voice.checking'))}</p>`;
  const L = api.L() === 'en' ? 'en' : 'ko';
  const terms = (cat) => (cat?.terms?.[L] ?? []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const vocId = info.vocoder && !info.vocoder.bundled ? info.vocoder.id : CATALOG[info.id]?.vocoder ?? null;
  const voc = vocId ? CATALOG[vocId] : null;
  const files = (info.licence.files ?? []).map((f) => (f.link
    ? `<div class="voice-licence-file"><b>${icon('hyperlink')}${escapeHtml(f.path)}</b> ${f.text ? button('voice-open', f.text, 'readerExternal', 'small', f.text) : ''}</div>`
    : `<details class="voice-licence-file" ${/licen[cs]e/i.test(f.path) ? 'open' : ''}><summary>${icon('file')}${escapeHtml(f.path)}</summary><pre>${escapeHtml(f.text || '—')}</pre></details>`)).join('');
  const credits = [info.credits?.author && `${t('voice.author')}: ${info.credits.author}`, info.credits?.voice && info.credits.voice !== info.credits.author && info.credits.voice, info.credits?.web && `${t('voice.web')}: ${info.credits.web}`].filter(Boolean);
  const needsDownload = info.catalog && !info.installed;
  const accepted = isAccepted(info.id) && (!vocId || isAccepted(vocId));
  return `<div class="voice-licence">
    <h3 class="section-title">${icon('key')}${escapeHtml(t('voice.licenceTitle', { name: info.name }))}</h3>
    <p>${escapeHtml(t('voice.licenceIntro'))}</p>
    <p class="voice-warning">${icon('warning')}<b>${escapeHtml(t('voice.nonCommercial'))}</b></p>
    ${info.licence.terms ? `<h4>${escapeHtml(t('voice.licenceTerms'))} — ${escapeHtml(info.licence.name)}</h4><ul>${terms(CATALOG[info.id])}</ul>` : ''}
    ${voc ? `<h4>${escapeHtml(t('voice.licenceVocoder'))} — ${escapeHtml(voc.name)} (${escapeHtml(voc.licence)})</h4><ul>${terms(voc)}</ul>` : ''}
    ${credits.length ? `<h4>${escapeHtml(t('voice.credits'))}</h4><p>${credits.map(escapeHtml).join('<br>')}</p>` : ''}
    ${files ? `<h4>${escapeHtml(t('voice.licenceFiles'))}</h4>${files}` : ''}
    <div class="voice-bank-actions">
      ${info.licence.page ? button('voice-open', t('voice.openPage'), 'readerExternal', 'small', info.licence.page) : ''}
      ${info.licence.url ? button('voice-open', t('voice.openLicence'), 'readerExternal', 'small', info.licence.url) : ''}
    </div>
    <div class="voice-bank-actions voice-licence-buttons">
      ${button('voice-back', t('voice.back'), 'chevronLeft', 'small')}
      <span class="grow"></span>
      ${accepted && !needsDownload ? button('voice-decline', t('voice.revoke'), 'close', 'small', info.id) : button('voice-decline', t('voice.decline'), 'close', 'small', info.id)}
      ${accepted && !needsDownload ? '' : button('voice-accept', t(needsDownload ? 'voice.acceptDownload' : 'voice.accept'), 'check', 'small primary', info.id)}
    </div>
  </div>`;
}

/** Settings › Voice. */
export function settingsVoice(api) {
  const { row, segmented, t, s, escapeHtml, button, select, icon } = api;
  const v = voiceState(api);
  if (v.licence) return licenceView(api);
  const set = s();
  const engine = set.voiceEngine === 'ai' ? 'ai' : 'guide';
  const title = (glyph, text) => `<h3 class="section-title">${icon(glyph)}${escapeHtml(text)}</h3>`;
  const banks = (v.banks ?? []).filter((b) => b.kind === 'bank');
  const vocoders = (v.banks ?? []).filter((b) => b.kind === 'vocoder' && (b.installed || b.status === 'downloading' || b.id === CATALOG[DEFAULT_BANK].vocoder));
  const current = banks.find((b) => b.id === set.voiceBank) ?? banks.find((b) => b.id === DEFAULT_BANK) ?? banks[0];
  const rows = [
    title('instVocal', t('voice.section.engine')),
    row('instVocal', t('voice.engine'), segmented('voiceEngine', [['guide', t('voice.engine.guide'), 'waveform'], ['ai', t('voice.engine.ai'), 'sparkles']], engine), t('voice.engine'), 'full'),
    row('info', '', `<span class="muted">${escapeHtml(t(`voice.engineHelp.${engine}`))}</span>`),
  ];
  if (banks.length) {
    rows.push(row('instVocal', t('voice.bank'), select('data-select', 'voiceBank', banks.map((b) => [b.id, `${b.name}${b.installed ? '' : ` — ${t('voice.status.missing')}`}`]), current?.id ?? DEFAULT_BANK, t('voice.bank'))));
    if (current?.speakers?.length > 1) rows.push(row('user', t('voice.speaker'), select('data-select', 'voiceSpeaker', [['', t('voice.speakerDefault')], ...current.speakers.map((sp) => [sp.id, sp.name])], set.voiceSpeaker ?? '', t('voice.speaker'))));
  }
  rows.push(
    title('library', t('voice.section.banks')),
    v.banks ? (banks.length ? banks.map((b) => bankRow(api, b)).join('') : `<p class="muted">${escapeHtml(t('voice.noBanks'))}</p>`) : `<p class="muted">${escapeHtml(t('voice.checking'))}</p>`,
    `<div class="voice-bank-actions">${button('voice-import', t('voice.import'), 'folderOpen', 'small', '', `title="${escapeHtml(t('voice.importTip'))}"`)}${v.importing ? `<span class="muted">${escapeHtml(t('voice.importing'))}</span>` : ''}</div>`,
    `<p class="muted hint">${icon('info')} ${escapeHtml(t('voice.importHint', { name: IMPORT_HINTS.map((h) => h.name).join(', ') }))}</p>`,
  );
  if (v.error && !v.error.id) rows.push(`<p class="voice-warning">${icon('warning')}${escapeHtml(t(`voice.error.${v.error.code}`, null, v.error.message))}</p>`);
  if (vocoders.length) rows.push(title('waveform', t('voice.vocoders')), `<p class="muted hint">${escapeHtml(t('voice.vocoderNote'))}</p>`, vocoders.map((b) => bankRow(api, b)).join(''));
  const b = v.backend;
  const line = b && !b.error ? t('voice.backendLine', { gpu: b.webgpu ? (b.adapter || 'WebGPU') : t('voice.noGpu'), threads: b.threads, isolated: b.isolated ? '' : t('voice.notIsolated') }) + (b.ep ? ` · ${b.ep === 'webgpu' ? 'GPU' : 'CPU'}` : '') : t('voice.checking');
  rows.push(
    title('quality', t('voice.section.quality')),
    row('quality', t('voice.steps'), segmented('voiceSteps', [10, 20, 50].map((n) => [n, t(`voice.steps.${n}`)]), Number(set.voiceSteps ?? 10)), t('voice.stepsTip'), 'full'),
    row('speed', t('voice.backend'), segmented('voiceBackend', [['auto', t('voice.backend.auto')], ['webgpu', t('voice.backend.webgpu')], ['wasm', t('voice.backend.wasm')]], set.voiceBackend ?? 'auto'), t('voice.backend'), 'full'),
    row('info', t('voice.backendInfo'), `<span class="muted">${escapeHtml(line)}</span>`),
    row('play', t('voice.test'), button('voice-test', t('voice.test'), 'play', 'small', current?.id ?? DEFAULT_BANK, current?.installed ? '' : 'disabled'), t('voice.testTip')),
  );
  return rows.join('');
}

async function openLicence(api, id) {
  const v = api.state.voice;
  v.licence = id;
  v.info = null;
  api.render();
  try {
    const info = await bankInfo(id);
    v.info = info;
  } catch (error) { v.licence = null; v.error = { code: error.code ?? 'notInstalled', message: error.message, id }; }
  api.render();
}

/** Downloads a catalog bank and the vocoder it needs (each once accepted). */
async function download(api, id, fresh = false) {
  const v = api.state.voice;
  v.error = null;
  const need = [id];
  const vocId = CATALOG[id]?.vocoder;
  if (vocId && !(v.banks ?? []).some((b) => b.id === vocId && b.installed)) need.push(vocId);
  for (const x of need) {
    if (!isAccepted(x)) { openLicence(api, id); return; }
  }
  try {
    for (const x of need) {
      const bank = v.banks?.find((b) => b.id === x);
      if (bank) { bank.status = 'downloading'; bank.progress = { id: x, phase: 'queued', done: 0, total: CATALOG[x]?.size ?? 0 }; }
      api.render();
      if (fresh && x === id) await redownload(x); else await downloadBank(x);
    }
  } catch (error) {
    v.error = { code: error.code ?? 'network', message: error.message, id: error.id ?? id };
    if (error.code === 'licence') openLicence(api, error.id ?? id);
  }
  refresh(api);
}

async function doImport(api) {
  const v = api.state.voice;
  let input = null;
  if (isDesktop()) {
    const picked = await chooseFiles(null, [{ name: 'Voice bank', extensions: ['zip', 'oudep'] }], false).catch(() => []);
    input = picked[0] ?? null;
  } else {
    const picked = await pickWithInput('.zip,.oudep', false);
    input = picked[0] ?? null;
  }
  if (!input) return;
  v.importing = true;
  v.error = null;
  api.render();
  try {
    const info = await importBank(input);
    v.importing = false;
    refresh(api);
    if (info.kind === 'bank') openLicence(api, info.id);
  } catch (error) {
    v.importing = false;
    v.error = { code: error.code ?? 'badZip', message: error.message };
    api.render();
  }
}

/** Clicks of Settings › Voice; true when handled. */
export function voicePopupAction(kind, target, api, type = 'click') {
  if (type !== 'click') return false;
  const action = target.dataset?.action;
  if (!action || !action.startsWith('voice-')) return false;
  const v = voiceState(api);
  const id = target.dataset.value;
  switch (action) {
    case 'voice-licence': openLicence(api, id); return true;
    case 'voice-back': v.licence = null; v.info = null; api.render(); return true;
    case 'voice-accept': {
      const info = v.info;
      const vocId = info?.vocoder && !info.vocoder.bundled ? info.vocoder.id : CATALOG[id]?.vocoder;
      Promise.all([acceptLicence(id), vocId ? acceptLicence(vocId) : null]).then(() => {
        const needsDownload = info?.catalog && !info.installed;
        v.licence = null; v.info = null;
        api.render();
        if (needsDownload) download(api, id);
        else if (vocId && !(v.banks ?? []).some((b) => b.id === vocId && b.installed)) download(api, vocId);
        else refresh(api);
      });
      return true;
    }
    case 'voice-decline': acceptLicence(id, false).then(() => { v.licence = null; v.info = null; refresh(api); }); return true;
    case 'voice-download': download(api, id); return true;
    case 'voice-redownload': download(api, id, true); return true;
    case 'voice-cancel': cancelDownload(id).catch(() => {}); return true;
    case 'voice-remove': v.confirm = id; api.render(); setTimeout(() => { if (v.confirm === id) { v.confirm = null; api.render(); } }, 4000); return true;
    case 'voice-remove-yes': v.confirm = null; removeBank(id).catch((error) => { v.error = { code: error.code ?? 'disk', message: error.message, id }; }).finally(() => refresh(api)); return true;
    case 'voice-import': doImport(api); return true;
    case 'voice-open': api.openExternal(id); return true;
    case 'voice-test': api.action('voice-test', { bank: id, speaker: api.s().voiceSpeaker ?? '', steps: Number(api.s().voiceSteps ?? 10), backend: api.s().voiceBackend ?? 'auto' }); return true;
    default: return false;
  }
}
