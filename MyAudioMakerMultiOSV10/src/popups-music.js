// The music app's own popups (run inside popup.js, which supplies the frame and controls through `api`):
// Settings › Audio, Settings › AI, Settings › Editor; the AI song wizard; audio export options.
// Each popup keeps its edits in state.draft and answers with close({ ok: true, … }).
import { GENRES, MOODS, STRUCTURES } from './music/genres.js';
import { THEMES } from './music/lyrics-bank.js';
import { CLAUDE_MODELS, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, testProvider } from './music/ai.js';
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

/** Settings › Editor. */
export function settingsEditor(api) {
  const { row, toggle, segmented, t, s, select } = api;
  return [
    row('snap', t('settings.snap'), select('data-select', 'rollSnap', [[1, t('snap.1')], [0.5, t('snap.0_5')], [0.25, t('snap.0_25')], [0.125, t('snap.0_125')], [1 / 3, t('snap.0_3333')], [1 / 6, t('snap.0_1666')], [0, t('snap.off')]], s().rollSnap, t('settings.snap'))),
    toggle('rollGhosts', t('action.ghosts'), 'ghost'),
    toggle('rollChordTones', t('settings.chordTones'), 'chords'),
    toggle('autoFitMelody', t('settings.autoFitMelody'), 'fitMelody'),
    row('globe', t('settings.lyricLanguage'), segmented('lyricLanguage', [['ko', '한국어'], ['en', 'English']], s().lyricLanguage)),
    row('instVocal', t('settings.defaultVocal'), select('data-select', 'defaultVocal', ['auto', 'voiceFemale', 'voiceMale', 'voiceChoir', 'none'].map((v) => [v, v === 'auto' ? t('compose.byGenre') : v === 'none' ? t('compose.noVocal') : nm(api, instrument(v))]), s().defaultVocal, t('settings.defaultVocal'))),
  ].join('');
}

/** Settings › AI: which writes the lyrics and plans, the key (kept on this computer), models, a test. */
export function settingsAi(api) {
  const { row, segmented, t, s, escapeHtml, button, select, icon } = api;
  const set = s();
  const p = set.aiProvider;
  const test = api.state.aiTest;
  const rows = [
    row('aiCompose', t('settings.aiProvider'), segmented('aiProvider', [['builtin', t('ai.provider.builtin'), 'aiBuiltin'], ['claude', t('ai.provider.claude'), 'aiClaude'], ['ollama', t('ai.provider.ollama'), 'aiLocal']], p), t('settings.aiProvider'), 'full'),
    row('info', '', `<span class="muted">${escapeHtml(t(`ai.providerHelp.${p}`))}</span>`),
  ];
  if (p === 'claude') {
    rows.push(
      row('key', t('settings.apiKey'), `<input type="password" data-ai-key value="${escapeHtml(set.aiApiKey ?? '')}" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(t('settings.apiKey'))}" />${button('ai-key-show', t('settings.showKey'), 'eye', 'small')}${button('ai-key-clear', t('settings.clearKey'), 'trash', 'small danger')}`, t('settings.apiKeyTip'), 'full'),
      row('aiClaude', t('settings.aiModel'), select('data-select', 'aiModel', CLAUDE_MODELS.map((m) => [m, `${m}${m === 'claude-opus-5-5' ? ` — ${t('settings.modelBest')}` : m === 'claude-haiku-5-5' ? ` — ${t('settings.modelFast')}` : ''}`]), set.aiModel, t('settings.aiModel'))),
      row('hyperlink', t('settings.getKey'), `<span class="muted">console.anthropic.com</span>${button('open-console', t('settings.openConsole'), 'readerExternal', 'small')}`),
      row('warning', '', `<span class="muted">${escapeHtml(t('settings.keyPrivacy'))}</span>`),
    );
  }
  if (p === 'ollama') {
    rows.push(
      row('server', t('settings.ollamaUrl'), `<input type="text" data-setting-text="ollamaUrl" value="${escapeHtml(set.ollamaUrl || DEFAULT_OLLAMA_URL)}" spellcheck="false" />`),
      row('aiLocal', t('settings.ollamaModel'), `<input type="text" data-setting-text="ollamaModel" value="${escapeHtml(set.ollamaModel || DEFAULT_OLLAMA_MODEL)}" spellcheck="false" list="ollama-models" />${test?.models?.length ? `<datalist id="ollama-models">${test.models.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>` : ''}`),
      row('info', '', `<span class="muted">${escapeHtml(t('settings.ollamaHint'))}</span>`),
    );
  }
  if (p !== 'builtin') rows.push(row('validate', t('settings.aiTest'), `${button('ai-test', test?.running ? t('settings.aiTesting') : t('settings.aiTestButton'), 'validate', 'small', '', test?.running ? 'disabled' : '')}${test && !test.running ? `<span class="badge ${test.ok ? 'ok' : 'danger'}" title="${escapeHtml(test.detail ?? '')}">${icon(test.ok ? 'check' : 'warning')}${escapeHtml(test.ok ? t('settings.aiOk') : (test.code ? t(`error.code.${test.code}`, null, test.detail) : test.detail))}</span>` : ''}`, t('settings.aiTest'), 'full'));
  return rows.join('');
}

/** The AI song wizard. */
function composeWizard(api) {
  const { t, escapeHtml, icon, row, button } = api;
  const p = api.P();
  const d = (api.state.draft ??= { ...(p.draft ?? {}) });
  const chips = (key, list, glyphKey = 'icon') => `<span class="chip-row">${list.map((x) => `<button type="button" class="chip ${d[key] === x.id ? 'on' : ''}" data-draft-segment="${key}" data-value="${x.id}" title="${escapeHtml(nm(api, x))}">${icon(x[glyphKey])}<span>${escapeHtml(nm(api, x))}</span></button>`).join('')}</span>`;
  const sel = (key, options, current) => `<select data-draft-select="${key}">${options.map(([v, label]) => `<option value="${escapeHtml(v)}" ${String(current) === String(v) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
  api.root.innerHTML = api.frame({
    glyph: 'aiWizard', title: t('wizard.title'),
    body: `<div class="wizard">
      <div class="wizard-provider ${p.provider}">${icon(p.provider === 'builtin' ? 'aiBuiltin' : p.provider === 'claude' ? 'aiClaude' : 'aiLocal')}<span>${escapeHtml(t('start.providerNow', { name: t(`ai.provider.${p.provider}`) }))}</span><span class="grow"></span>${button('open-ai-settings', t('compose.change'), 'gear', 'small')}</div>
      <label class="wizard-topic"><b>${icon('lyrics')}${escapeHtml(t('wizard.topic'))}</b><textarea data-draft="topic" rows="3" placeholder="${escapeHtml(t('compose.topicHint'))}">${escapeHtml(d.topic ?? '')}</textarea></label>
      <div class="wizard-group"><b>${icon('themeLove')}${escapeHtml(t('wizard.theme'))}</b>${chips('theme', THEMES)}</div>
      <div class="wizard-group"><b>${icon('genrePop')}${escapeHtml(t('compose.genre'))}</b>${chips('genre', GENRES)}</div>
      <div class="wizard-group"><b>${icon('moodHappy')}${escapeHtml(t('compose.mood'))}</b>${chips('mood', MOODS)}</div>
      <div class="wizard-grid">
        ${row('globe', t('compose.language'), sel('language', [['ko', '한국어'], ['en', 'English']], d.language))}
        ${row('structure', t('compose.structure'), sel('structure', STRUCTURES.map((s) => [s.id, nm(api, s)]), d.structure))}
        ${row('keySig', t('compose.key'), sel('tonic', [['auto', t('compose.auto')], ...Array.from({ length: 12 }, (_, pc) => [String(pc), pcName(pc, [5, 10, 3, 8, 1].includes(pc))])], d.tonic ?? 'auto') + sel('mode', [['auto', t('compose.byMood')], ['major', t('mode.major')], ['minor', t('mode.minor')], ['dorian', t('mode.dorian')], ['mixolydian', t('mode.mixolydian')]], d.mode ?? 'auto'))}
        ${row('tempo', t('compose.bpm'), `<input type="text" data-draft="bpm" value="${escapeHtml(d.bpm ?? '')}" placeholder="${escapeHtml(t('compose.auto'))}" inputmode="numeric" />`)}
        ${row('instVocal', t('compose.vocal'), sel('vocal', ['auto', 'voiceFemale', 'voiceMale', 'voiceChoir', 'none'].map((v) => [v, v === 'auto' ? t('compose.byGenre') : v === 'none' ? t('compose.noVocal') : nm(api, instrument(v))]), d.vocal ?? 'auto'))}
        ${row('dice', t('compose.seed'), `<input type="text" data-draft="seed" value="${escapeHtml(d.seed ?? '')}" inputmode="numeric" />${button('wizard-dice', t('compose.newSeed'), 'dice', 'small')}`)}
      </div>
      ${p.provider === 'builtin' ? '' : `<label class="wizard-topic"><b>${icon('notes')}${escapeHtml(t('compose.notes'))}</b><input type="text" data-draft="notes" value="${escapeHtml(d.notes ?? '')}" placeholder="${escapeHtml(t('compose.notesHint'))}" /></label>`}
      <p class="muted hint">${icon('info')} ${escapeHtml(t(p.provider === 'builtin' ? 'compose.hintBuiltin' : 'compose.hintAi'))}</p>
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
    case 'ai-test': {
      api.state.aiTest = { running: true };
      api.render();
      testProvider(api.state.settings).then((r) => { api.state.aiTest = r; api.render(); });
      return true;
    }
    case 'open-ai-settings': api.action('open-settings', { tab: 'ai' }); api.close(); return true;
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
