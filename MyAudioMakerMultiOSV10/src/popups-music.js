// The music app's own popups (run inside popup.js, which supplies the frame and controls through `api`):
// Settings › Audio, Settings › AI, Settings › Editor; the AI song wizard; audio export options.
// Each popup keeps its edits in state.draft and answers with close({ ok: true, … }).
import { GENRES, MOODS, STRUCTURES } from './music/genres.js';
import { THEMES } from './music/lyrics-bank.js';
import { AI_CREATIVITY, AI_EFFORTS, AI_TIMEOUTS, CUSTOM_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, listOllamaModels, providerFor, testProvider } from './music/ai.js';
import { aiPickerHtml, modelChoices, pickPatch } from './ui/aipicker.js';
import { instrument } from './music/instruments.js';
import { pcName } from './music/theory.js';
import { storeAiKey } from './domain/settings.js';

const nm = (api, x) => (api.L() === 'en' ? x.en : x.ko);

/** Settings › Audio. */
export function settingsAudio(api) {
  const { row, toggle, numberField, segmented, t, s, button } = api;
  return [
    row('volume', t('settings.masterVolume'), numberField('masterVolume', s().masterVolume, 0, 150, 5, '%', t('settings.masterVolume'))),
    toggle('metronome', t('action.metronome'), 'metronome'),
    toggle('followPlayhead', t('action.follow'), 'follow'),
    toggle('previewNotes', t('settings.previewNotes'), 'play'),
    row('waveform', t('settings.sampleRate'), segmented('exportSampleRate', [[44100, '44.1 kHz'], [48000, '48 kHz']], s().exportSampleRate)),
    row('bars', t('settings.bitDepth'), segmented('exportBits', [[16, '16 bit'], [24, '24 bit'], [32, '32 bit float']], s().exportBits)),
    toggle('exportNormalize', t('settings.normalize'), 'volume'),
    row('play', t('settings.testSound'), button('test-sound', t('settings.testSoundButton'), 'play', 'small')),
    row('info', '', `<span class="muted">${api.escapeHtml(t('settings.audioHint'))}</span>`),
  ].join('');
}

const MB = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Settings › Sounds: the recorded-instrument library — its state, a check, re-download / repair. */
export function settingsSounds(api) {
  return soundsSection(api).join('');
}

function soundsSection(api) {
  const { row, t, button, escapeHtml, icon } = api;
  const st = api.state.soundStatus;
  const job = api.state.soundJob;
  let summary = t('sounds.summary.unchecked');
  let level = 'muted';
  if (st) {
    const key = `sounds.summary.${st.summary}`;
    summary = t(key, { sets: Object.keys(st.sets ?? {}).length, size: MB(st.totalBytes ?? 0), missing: st.missing ?? 0, broken: st.broken ?? 0 });
    level = st.summary === 'installed' ? 'ok' : 'danger';
  }
  const repairable = st ? st.repair?.possible !== false : true;
  const categories = st ? Object.entries(st.categories ?? {}).map(([cat, c]) => `<span class="badge ${c.status === 'installed' ? 'ok' : 'danger'}" title="${escapeHtml(t(`sounds.status.${c.status}`))}">${escapeHtml(t(`instcat.${cat}`, null, cat))} · ${escapeHtml(t(`sounds.status.${c.status}`))}</span>`).join('') : '';
  return [
    row('info', '', `<span class="muted">${escapeHtml(t('sounds.section.desc', { size: st?.totalBytes ? MB(st.totalBytes) : '60 MB' }))}</span>`),
    row('check', t('sounds.section.title'), `<span class="badge ${level}" data-sounds-summary>${escapeHtml(job ? job.text : summary)}</span>`, summary, 'full'),
    ...(job ? [row('hourglass', '', `<span class="sounds-progress"><i style="width:${Math.round((job.fraction ?? 0) * 100)}%"></i></span>`, job.text, 'full')] : []),
    ...(categories ? [row('layers', '', `<span class="badge-row">${categories}</span>`, '', 'full')] : []),
    row('validate', t('sounds.check'), `${button('sounds-check', t('sounds.check'), 'validate', 'small', '', job ? 'disabled' : '')}${button('sounds-check-deep', t('sounds.check.deep'), 'search', 'small', '', job ? 'disabled' : '')}${button('sounds-repair', t('sounds.repair'), 'refresh', 'small', '', job || !repairable ? 'disabled' : '')}`, t('sounds.check'), 'full'),
    ...(st && st.repair?.possible === false ? [row('warning', '', `<span class="muted">${escapeHtml(t('sounds.repair.unavailable'))}</span>`)] : []),
    ...(st && st.kind === 'web' ? [row('info', '', `<span class="muted">${escapeHtml(t('sounds.repair.web'))}</span>`)] : []),
    row('hyperlink', t('sounds.baseUrl'), `<input type="text" data-setting-text="soundsBaseUrl" value="${escapeHtml(api.s().soundsBaseUrl ?? '')}" placeholder="https://…/sounds/" spellcheck="false" aria-label="${escapeHtml(t('sounds.baseUrl'))}" />`, t('sounds.baseUrl.hint')),
    row('info', t('sounds.credits'), `<span class="muted">${escapeHtml(t('sounds.credits.desc'))}</span>`, t('sounds.credits')),
  ];
}

/** Runs a check of the sound library in this window (it only reads), showing progress in the section. */
async function checkSounds(api, decode) {
  const { soundLibraryStatus } = await import('./audio/soundlib.js');
  api.state.soundJob = { fraction: 0, text: api.t('sounds.check.progress', { done: 0, total: '…' }) };
  api.render();
  try {
    api.state.soundStatus = await soundLibraryStatus({
      decode, baseUrl: api.s().soundsBaseUrl ?? '',
      onProgress: (p) => { api.state.soundJob = { fraction: p.fraction ?? 0, text: api.t('sounds.check.progress', { done: p.done ?? 0, total: p.total ?? 0 }) }; updateSoundJob(api); },
    });
  } catch (error) {
    api.state.soundStatus = { summary: 'unavailable', repair: { possible: false }, categories: {}, sets: {}, error: String(error?.message ?? error) };
  }
  api.state.soundJob = null;
  api.render();
}

/** Progress without redrawing the whole tab (keeps it smooth). */
function updateSoundJob(api) {
  const job = api.state.soundJob;
  const badge = api.root.querySelector('[data-sounds-summary]');
  const bar = api.root.querySelector('.sounds-progress i');
  if (!badge || !bar) { api.render(); return; }
  badge.textContent = job.text;
  bar.style.width = `${Math.round((job.fraction ?? 0) * 100)}%`;
}

/** Settings › Editor. */
export function settingsEditor(api) {
  const { row, toggle, segmented, t, s, select } = api;
  return [
    row('snap', t('settings.snap'), select('data-select', 'rollSnap', [[1, t('snap.1')], [0.5, t('snap.0_5')], [0.25, t('snap.0_25')], [0.125, t('snap.0_125')], [1 / 3, t('snap.0_3333')], [1 / 6, t('snap.0_1666')], [0, t('snap.off')]], s().rollSnap, t('settings.snap'))),
    toggle('rollGhosts', t('action.ghosts'), 'ghost'),
    toggle('rollChordTones', t('settings.chordTones'), 'chords'),
    toggle('autoFitMelody', t('settings.autoFitMelody'), 'fitMelody'),
    toggle('lyricsStaff', t('settings.lyricsStaff'), 'leadSheet'),
    toggle('vocalLaneLyrics', t('settings.vocalLaneLyrics'), 'instVocal'),
    toggle('karaoke', t('karaoke.toggleTip'), 'lyrics'),
    row('globe', t('settings.lyricLanguage'), segmented('lyricLanguage', [['ko', '한국어'], ['en', 'English']], s().lyricLanguage)),
    row('instVocal', t('settings.defaultVocal'), select('data-select', 'defaultVocal', ['auto', 'voiceFemale', 'voiceMale', 'voiceChoir', 'none'].map((v) => [v, v === 'auto' ? t('compose.byGenre') : v === 'none' ? t('compose.noVocal') : nm(api, instrument(v))]), s().defaultVocal, t('settings.defaultVocal'))),
  ].join('');
}

/** Settings › AI: which writes the lyrics and plans, the key (kept on this computer), models, a test. */
export function settingsAi(api) {
  const { row, segmented, t, s, escapeHtml, button, select, icon, toggle } = api;
  const set = s();
  const p = set.aiProvider;
  const test = api.state.aiTest;
  const title = (glyph, text) => `<h3 class="section-title">${icon(glyph)}${escapeHtml(text)}</h3>`;
  const rows = [
    title('aiCompose', t('settings.aiSection.provider')),
    row('aiCompose', t('settings.aiProvider'), segmented('aiProvider', [['builtin', t('ai.provider.builtin'), 'aiBuiltin'], ['claude', t('ai.provider.claude'), 'aiClaude'], ['ollama', t('ai.provider.ollama'), 'aiLocal']], p), t('settings.aiProvider'), 'full'),
    row('info', '', `<span class="muted">${escapeHtml(t(`ai.providerHelp.${p}`))}</span>`),
  ];
  if (p === 'claude') {
    const { list, current } = modelChoices(set, t, 'claude');
    rows.push(
      title('aiClaude', t('settings.aiSection.claude')),
      row('key', t('settings.apiKey'), `<input type="password" data-ai-key value="${escapeHtml(set.aiApiKey ?? '')}" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(t('settings.apiKey'))}" />${button('ai-key-show', t('settings.showKey'), 'eye', 'small')}${button('ai-key-clear', t('settings.clearKey'), 'trash', 'small danger')}`, t('settings.apiKeyTip'), 'full'),
      row('aiModel', t('settings.aiModel'), select('data-select', 'aiModel', list, current, t('settings.aiModel')), t('settings.aiModelTip')),
      ...(set.aiModel === CUSTOM_MODEL ? [row('edit', t('settings.aiModelCustom'), `<input type="text" data-setting-text="aiModelCustom" value="${escapeHtml(set.aiModelCustom ?? '')}" placeholder="claude-…" spellcheck="false" aria-label="${escapeHtml(t('settings.aiModelCustom'))}" />`, t('settings.aiModelCustomTip'))] : []),
      row('speed', t('settings.aiEffort'), segmented('aiEffort', AI_EFFORTS.map((e) => [e, t(`settings.effort.${e}`)]), set.aiEffort), t('settings.aiEffortTip')),
      row('hyperlink', t('settings.getKey'), `<span class="muted">console.anthropic.com</span>${button('open-console', t('settings.openConsole'), 'readerExternal', 'small')}`),
      row('warning', '', `<span class="muted">${escapeHtml(t('settings.keyPrivacy'))}</span>`),
    );
  }
  if (p === 'ollama') {
    const { list, current } = modelChoices(set, t, 'ollama');
    rows.push(
      title('aiLocal', t('settings.aiSection.ollama')),
      row('server', t('settings.ollamaUrl'), `<input type="text" data-setting-text="ollamaUrl" value="${escapeHtml(set.ollamaUrl || DEFAULT_OLLAMA_URL)}" spellcheck="false" />`),
      row('aiModel', t('settings.ollamaModel'), `${select('data-select', 'ollamaModel', list, current, t('settings.ollamaModel'))}${button('ai-refresh', t('ai.pick.refresh'), 'refresh', 'small')}`, t('settings.ollamaModelTip')),
      row('edit', t('settings.ollamaModelName'), `<input type="text" data-setting-text="ollamaModel" value="${escapeHtml(set.ollamaModel || DEFAULT_OLLAMA_MODEL)}" spellcheck="false" placeholder="${escapeHtml(DEFAULT_OLLAMA_MODEL)}" aria-label="${escapeHtml(t('settings.ollamaModelName'))}" />`, t('settings.ollamaModelNameTip')),
      row('info', '', `<span class="muted">${escapeHtml(api.state.ollamaNote ?? t('settings.ollamaHint'))}</span>`),
    );
  }
  rows.push(
    title('gear', t('settings.aiSection.writing')),
    row('sparkles', t('settings.aiCreativity'), segmented('aiCreativity', AI_CREATIVITY.map((c) => [c, t(`settings.creativity.${c}`)]), set.aiCreativity), t('settings.aiCreativityTip')),
    row('clock', t('settings.aiTimeout'), select('data-select', 'aiTimeout', AI_TIMEOUTS.map((n) => [n, t('settings.seconds', { n })]), set.aiTimeout, t('settings.aiTimeout')), t('settings.aiTimeoutTip')),
    toggle('aiFallback', t('settings.aiFallback'), 'aiBuiltin'),
  );
  if (p !== 'builtin') rows.push(row('validate', t('settings.aiTest'), `${button('ai-test', test?.running ? t('settings.aiTesting') : t('settings.aiTestButton'), 'validate', 'small', '', test?.running ? 'disabled' : '')}${test && !test.running ? `<span class="badge ${test.ok ? 'ok' : 'danger'}" title="${escapeHtml(test.detail ?? '')}">${icon(test.ok ? 'check' : 'warning')}${escapeHtml(test.ok ? t('settings.aiOk') : (test.code ? t(`error.code.${test.code}`, null, test.detail) : test.detail))}</span>` : ''}`, t('settings.aiTest'), 'full'));
  return rows.join('');
}

/** The AI song wizard. */
function composeWizard(api) {
  const { t, escapeHtml, icon, row, button } = api;
  const provider = providerFor(api.s());
  const d = (api.state.draft ??= { ...(api.P().draft ?? {}) });
  const chips = (key, list, glyphKey = 'icon') => `<span class="chip-row">${list.map((x) => `<button type="button" class="chip ${d[key] === x.id ? 'on' : ''}" data-draft-segment="${key}" data-value="${x.id}" title="${escapeHtml(nm(api, x))}">${icon(x[glyphKey])}<span>${escapeHtml(nm(api, x))}</span></button>`).join('')}</span>`;
  const SEL_ICONS = { language: 'globe', structure: 'structure', tonic: 'keySig', mode: 'keySig', vocal: 'instVocal' };
  const sel = (key, options, current) => `<select data-draft-select="${key}" data-icon="${SEL_ICONS[key] ?? 'list'}">${options.map(([v, label]) => `<option value="${escapeHtml(v)}" ${String(current) === String(v) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
  api.root.innerHTML = api.frame({
    glyph: 'aiWizard', title: t('wizard.title'),
    body: `<div class="wizard">
      ${aiPickerHtml(api.s(), t, { settingsAttr: 'data-action="open-ai-settings"' })}
      <label class="wizard-topic"><b>${icon('lyrics')}${escapeHtml(t('wizard.topic'))}</b><textarea data-draft="topic" rows="3" placeholder="${escapeHtml(t('compose.topicHint'))}">${escapeHtml(d.topic ?? '')}</textarea></label>
      <div class="wizard-group"><b>${icon('themeLove')}${escapeHtml(t('wizard.theme'))}</b>${chips('theme', THEMES)}</div>
      <div class="wizard-group"><b>${icon('genrePop')}${escapeHtml(t('compose.genre'))}</b>${chips('genre', GENRES)}</div>
      <div class="wizard-group"><b>${icon('moodHappy')}${escapeHtml(t('compose.mood'))}</b>${chips('mood', MOODS)}</div>
      <div class="wizard-grid">
        ${row('globe', t('compose.language'), sel('language', [['ko', '한국어'], ['en', 'English']], d.language))}
        ${row('structure', t('compose.structure'), sel('structure', STRUCTURES.map((s) => [s.id, nm(api, s)]), d.structure))}
        ${row('keySig', t('compose.key'), sel('tonic', [['auto', t('compose.auto')], ...Array.from({ length: 12 }, (_, pc) => [String(pc), pcName(pc, [5, 10, 3, 8, 1].includes(pc))])], d.tonic ?? 'auto') + sel('mode', [['auto', t('compose.byMood')], ['major', t('mode.major')], ['minor', t('mode.minor')], ['dorian', t('mode.dorian')], ['mixolydian', t('mode.mixolydian')]], d.mode ?? 'auto'), t('compose.key'), 'wide')}
        ${row('tempo', t('compose.bpm'), `<input type="text" data-draft="bpm" value="${escapeHtml(d.bpm ?? '')}" placeholder="${escapeHtml(t('compose.auto'))}" inputmode="numeric" />`)}
        ${row('instVocal', t('compose.vocal'), sel('vocal', ['auto', 'voiceFemale', 'voiceMale', 'voiceChoir', 'none'].map((v) => [v, v === 'auto' ? t('compose.byGenre') : v === 'none' ? t('compose.noVocal') : nm(api, instrument(v))]), d.vocal ?? 'auto'))}
        ${row('dice', t('compose.seed'), `<input type="text" data-draft="seed" value="${escapeHtml(d.seed ?? '')}" inputmode="numeric" />${button('wizard-dice', t('compose.newSeed'), 'dice', 'small')}`)}
      </div>
      ${provider === 'builtin' ? '' : `<label class="wizard-topic"><b>${icon('notes')}${escapeHtml(t('compose.notes'))}</b><input type="text" data-draft="notes" value="${escapeHtml(d.notes ?? '')}" placeholder="${escapeHtml(t('compose.notesHint'))}" /></label>`}
      <p class="muted hint">${icon('info')} ${escapeHtml(t(provider === 'builtin' ? 'compose.hintBuiltin' : 'compose.hintAi'))}</p>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('wizard-go', t('compose.make'), 'aiCompose', 'primary')}`,
  });
  api.ready();
}

/** Audio export options. */
function exportAudio(api) {
  const { t, escapeHtml, icon, row, button } = api;
  const p = api.P();
  const d = (api.state.draft ??= { stems: Boolean(p.stems), sampleRate: p.sampleRate ?? 44100, bits: p.bits ?? 16, normalize: p.normalize !== false, range: 'song', tail: 2.5, exclude: [] });
  const seg = (key, options) => `<span class="segmented">${options.map(([v, label, glyph, disabled]) => `<button type="button" class="segment ${String(d[key]) === String(v) ? 'active' : ''}" data-draft-segment="${key}" data-value="${escapeHtml(v)}" ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;
  api.root.innerHTML = api.frame({
    glyph: 'exportAudio', title: t('export.title'),
    body: `<div class="editor">
      ${row('tracks', t('export.what'), seg('stems', [['false', t('export.mix'), 'waveform'], ['true', t('export.stems'), 'tracks']]))}
      ${row('clock', t('export.range'), seg('range', [['song', t('export.rangeSong'), 'songInfo'], ['loop', t('export.rangeLoop'), 'loop', !p.hasLoop], ['section', p.section ? t('export.rangeSection', { name: p.section }) : t('export.rangeSectionNone'), 'structure', !p.section]]))}
      ${row('waveform', t('settings.sampleRate'), seg('sampleRate', [[44100, '44.1 kHz'], [48000, '48 kHz']]))}
      ${row('bars', t('settings.bitDepth'), seg('bits', [[16, '16 bit'], [24, '24 bit'], [32, '32 bit float']]))}
      ${api.draftToggle ? api.draftToggle('normalize', t('settings.normalize'), 'volume', d.normalize) : ''}
      ${row('reverb', t('export.tail'), `<input type="text" data-draft="tail" value="${escapeHtml(d.tail)}" inputmode="decimal" /><span class="muted">s</span>`)}
      <h3 class="section-title">${icon('tracks')}${escapeHtml(t('export.tracks'))}</h3>
      <div class="export-tracks">${(p.tracks ?? []).map((tr) => `<label class="export-track"><input type="checkbox" data-export-track="${escapeHtml(tr.id)}" ${d.exclude.includes(tr.id) ? '' : 'checked'} /><i style="background:${tr.color}"></i><span>${escapeHtml(tr.name)}</span></label>`).join('')}</div>
      <p class="muted hint">${icon('info')} ${escapeHtml(t('export.hint'))}</p>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('export-go', t('export.go'), 'exportAudio', 'primary')}`,
  });
  api.fitHeight();
  api.ready();
}

export function renderMusicPopup(kind, api) {
  const fn = { compose: composeWizard, exportaudio: exportAudio }[kind];
  if (!fn) return false;
  fn(api);
  return true;
}

/** Clicks and changes of these popups (and Settings › AI); true when handled. */
export function musicPopupAction(kind, target, api, type = 'click') {
  const d = api.state.draft;
  if (type === 'change') {
    if (target.dataset?.aiPick) {
      const patch = pickPatch(target, api.state.settings);
      if (!patch) return true;
      const { openSettings, ...change } = patch;
      api.update(change);
      if (openSettings) { api.action('open-settings', { tab: 'ai' }); api.close(); }
      return true;
    }
    if (target.dataset?.aiKey !== undefined && 'aiKey' in target.dataset) { storeAiKey(globalThis.localStorage, target.value); api.state.settings.aiApiKey = target.value.trim(); api.state.aiTest = null; api.notifyKey?.(); return true; }
    if (target.dataset?.exportTrack && d) { const id = target.dataset.exportTrack; d.exclude = target.checked ? d.exclude.filter((x) => x !== id) : [...d.exclude, id]; return true; }
    return false;
  }
  if (type === 'input') return Boolean(target.dataset && 'aiKey' in target.dataset);
  switch (target.dataset?.action) {
    case 'progress-cancel':
      api.state.cancelled = true;
      api.action('progress-cancel', { op: api.P().op });
      api.render();
      return true;
    case 'ai-key-show': { const input = api.root.querySelector('[data-ai-key]'); if (input) input.type = input.type === 'password' ? 'text' : 'password'; return true; }
    case 'ai-key-clear': storeAiKey(globalThis.localStorage, ''); api.state.settings.aiApiKey = ''; api.state.aiTest = null; api.update({}); return true;
    case 'open-console': api.openExternal('https://console.anthropic.com/settings/keys'); return true;
    case 'test-sound': api.action('test-sound'); return true;
    case 'sounds-check': checkSounds(api, false); return true;
    case 'sounds-check-deep': checkSounds(api, true); return true;
    // Repair runs in the main window (it owns the playing sounds and their cache) with its own progress window.
    case 'sounds-repair': api.action('sounds-repair'); api.state.soundStatus = null; api.render(); return true;
    case 'ai-test': {
      api.state.aiTest = { running: true };
      api.render();
      testProvider(api.state.settings).then((r) => { api.state.aiTest = r; if (r.models?.length) api.update({ ollamaModels: r.models }); api.render(); });
      return true;
    }
    case 'open-ai-settings': api.action('open-settings', { tab: 'ai' }); api.close(); return true;
    case 'ai-refresh': {
      // Ollama's installed models fill the model menus (here, in Settings › AI and in the panel).
      api.state.ollamaNote = api.t('settings.ollamaListing');
      api.render();
      listOllamaModels(api.state.settings)
        .then((models) => { api.state.ollamaNote = models.length ? api.t('settings.ollamaListed', { count: models.length, names: models.join(', ') }) : api.t('notice.ollamaNoModels'); api.update({ ollamaModels: models }); })
        .catch((error) => { api.state.ollamaNote = `${api.t('error.code.aiOllamaOffline')} (${error.message})`; api.render(); });
      return true;
    }
    case 'wizard-dice': d.seed = 1 + Math.floor(Math.random() * 999999); api.render(); return true;
    case 'wizard-go': {
      const out = { ...d, tonic: d.tonic === 'auto' || d.tonic == null || d.tonic === '' ? null : Number(d.tonic), mode: d.mode === 'auto' ? null : d.mode, bpm: Number(d.bpm) > 0 ? Math.round(Number(d.bpm)) : null, seed: Math.max(1, Math.round(Number(d.seed) || 1)) };
      api.close({ ok: true, draft: out });
      return true;
    }
    case 'export-go': api.close({ ok: true, stems: String(d.stems) === 'true', range: d.range, sampleRate: Number(d.sampleRate), bits: Number(d.bits), normalize: d.normalize !== false, tail: Math.max(0, Math.min(10, Number(d.tail) || 0)), exclude: d.exclude }); return true;
    default: return false;
  }
}
