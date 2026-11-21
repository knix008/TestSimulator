// MyAudioMaker — the main window: state, the command table (menus, toolbar, shortcuts and context
// menus all point to it), the shell (menu bar, toolbar, tabs, side panels, bottom panel, status bar),
// the views (arrangement, piano roll, lyrics, lead sheet), AI composing, playback, files, printing,
// the start page and the tutorial. Popups run in popup.js; the documents in viewer.js.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { History } from './domain/history.js';
import { ANIMATIONS, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { baseName, directoryOf, fileSafe, stripExtension, withExtension } from './domain/paths.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { PROGRESS_ICONS, PROGRESS_NAME_ICONS, PROGRESS_STEP_ICONS } from './ui/progressicons.js';
import { ArrangementView } from './ui/arrangement.js';
import { PianoRoll, SNAPS } from './ui/pianoroll.js';
import { composeHtml, instrumentsHtml, lyricsViewHtml, mixEditorHtml, notesEditorHtml, outlineHtml, sectionEditorHtml, sectionsHtml, songEditorHtml, trackEditorHtml } from './ui/panels.js';
import { createPrintHost } from './print/host.js';
import { Player, renderSong } from './audio/engine.js';
import { audioBufferToWav } from './io/wav.js';
import { midiToSong, songToMidi } from './io/midi.js';
import { chordChart, isLyricsName, isMidiName, isSongName, lyricsToLrc, lyricsToText, packSong, unpackSong } from './io/fileformat.js';
import { compose, fitMelody, makeSection, PARTS, writeSection } from './music/composer.js';
import { requestLyrics, requestPlan, providerFor, modelOf, listOllamaModels, canFallBack } from './music/ai.js';
import { pickPatch } from './ui/aipicker.js';
import { checkSong, countBySeverity } from './music/checks.js';
import { leadSheetSvg } from './music/notation.js';
import { Karaoke } from './ui/karaoke.js';
import { buildSample, buildTemplate, SAMPLE_GROUPS, SAMPLES, TEMPLATES } from './music/samples.js';
import { addNotes, audible, barBeats, chordLineText, cloneSong, createSong, cutRange, newId, normalizeSong, parseChordLineText, respellChords, sectionLabel, sectionSpans, shiftNotes, songBeats, songStats, trackName, ROLE_COLORS } from './music/song.js';
import { GENRES, SECTION_DEFAULTS, SECTION_TYPES, structureOf } from './music/genres.js';
import { instrument, INSTRUMENTS } from './music/instruments.js';
import { barBeatLabel, beatsToSeconds, keyName, mod12, parseChordSymbol, parseNote, timeLabel, transposeChord, chordSymbol, prefersFlats } from './music/theory.js';
import { parseLyricsText } from './music/lyrics.js';
import { newSeed } from './music/random.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const player = new Player();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  doc: null,
  showStart: false,
  view: 'arrangement',
  tool: 'select',
  section: null,
  track: null,
  leftTab: 'compose',
  rightTab: 'song',
  bottomTab: 'problems',
  problems: [],
  problemFilter: 'all',
  log: [],
  notice: null,
  info: null,
  instance: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  maximized: false,
  minWidth: 0,
  untitled: 0,
  instrumentCategory: 'all',
  instrumentQuery: '',
  playing: false,
  position: 0,
  clipboard: null,
  dynamicMenus: new Map(),
  compose: null,
  busy: false,
};
state.compose = {
  topic: '', theme: null, genre: 'pop', mood: 'happy', language: state.settings.lyricLanguage ?? (state.settings.language === 'en' ? 'en' : 'ko'), tonic: null, mode: null,
  bpm: null, structure: 'standard', vocal: 'auto', seed: newSeed(), notes: '',
};

const doc = () => state.doc;
const song = () => state.doc?.song ?? null;
const hasSong = () => Boolean(state.doc) && !state.showStart;
const sectionName = (section) => sectionLabel(song(), section, (type) => t(`section.${type}`));
const trackLabel = (track) => trackName(track, lang());

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text, detail = '') {
  state.notice = { kind, text, at: Date.now() };
  state.log.unshift({ kind, text, detail, at: new Date() });
  if (state.log.length > 500) state.log.length = 500;
  if (state.bottomTab === 'messages') renderBottom();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const code = error?.code;
  if (code && t(`error.code.${code}`) !== `error.code.${code}`) return { message: t(`error.code.${code}`), detail: error.message ?? '' };
  const text = native.errorText(error);
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

function showError(titleKey, error, context = '') {
  if (error?.code === 'cancelled') { notify('info', t('notice.cancelled')); return null; }
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyAudioMaker ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (/^ResizeObserver loop/.test(String(event.message ?? ''))) return; if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents (one song at a time)

class Doc {
  constructor(songData, { path = null, name = null, handle = null } = {}) {
    this.song = songData;
    this.history = new History(150);
    this.path = path;
    this.name = name;
    this.handle = handle;
    this.revision = 0;
    this.savedRevision = 0;
  }
  get dirty() { return this.revision !== this.savedRevision; }
  markSaved() { this.savedRevision = this.revision; }
}

const docName = (d = doc()) => (d ? (d.path ? baseName(d.path) : d.name ?? (d.song.title || t('tabs.untitled', { n: 1 }))) : '');
function untitledName() { state.untitled += 1; return t('tabs.untitled', { n: state.untitled }); }

function setDoc(d) {
  if (!tutorial?.active) popups.close('welcome');
  stopPlayback();
  state.doc = d;
  state.showStart = false;
  state.section = d.song.sections[0]?.id ?? null;
  state.track = d.song.tracks.find((tr) => tr.role === 'vocal')?.id ?? d.song.tracks[0]?.id ?? null;
  state.position = 0;
  roll?.selection.clear();
  player.update(d.song);
  persistSession();
  scheduleProblems(0);
  renderAll();
  requestAnimationFrame(() => { arrangement?.fit(); roll?.centerOnNotes(); });
}

function newSong(templateId = 'empty') {
  const name = templateId === 'empty' ? untitledName() : t(`template.${templateId}`);
  const s = buildTemplate(templateId, { title: templateId === 'empty' ? '' : name, language: state.compose.language, seed: newSeed() });
  const d = new Doc(s, { name });
  setDoc(d);
  notify('success', t(templateId === 'empty' ? 'notice.newSong' : 'notice.fromTemplate', { name }));
  return d;
}

async function confirmReplace() {
  const d = doc();
  if (!d?.dirty) return true;
  const choice = await ask({
    icon: 'save', title: t('confirm.replaceTitle'), message: t('confirm.replaceMessage', { name: docName(d) }),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

async function newSongAsk(templateId = 'empty') {
  if (!(await confirmReplace())) return null;
  if (templateId === 'empty') return newSong(templateId);
  return withProgress('progress.template', t(`template.${templateId}`), async () => { await idle(); return newSong(templateId); }, { delay: 200 });
}

async function openSampleAsk(id) {
  if (!(await confirmReplace())) return null;
  const entry = SAMPLES.find((x) => x.id === id);
  const title = entry?.[lang()]?.[0] ?? id;
  return withProgress('progress.sample', title, async () => {
    await idle();
    const s = buildSample(id);
    if (!s) return null;
    const d = new Doc(s, { name: s.title });
    setDoc(d);
    notify('success', t('notice.sampleOpened', { name: s.title }));
    return d;
  }, { delay: 200 });
}

const idle = () => new Promise((resolve) => setTimeout(resolve, 0));

function persistSession() {
  if (state.instance && !state.instance.first) return;
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.doc?.path ? [state.doc.path] : [] })); } catch { /* ignore */ }
}

// ───────────────────────── changes, undo

/** A JSON copy of the song before a change (drags take one when they start). */
const snapshot = () => JSON.stringify(song());

/** Records `before` as one undo step labelled `labelKey`, then everything follows the change. */
function record(before, labelKey) {
  const d = doc();
  if (!d || before === JSON.stringify(d.song)) { afterChange({ quiet: true }); return; }
  d.history.record(before, t(labelKey));
  d.revision += 1;
  afterChange();
}

/** Applies mutate(song) as one undo step. */
function change(labelKey, mutate) {
  const d = doc();
  if (!d) return undefined;
  const before = snapshot();
  const result = mutate(d.song);
  record(before, labelKey);
  return result;
}

function afterChange({ quiet = false } = {}) {
  const s = song();
  if (!s) return;
  if (state.section && !s.sections.some((x) => x.id === state.section)) state.section = s.sections[0]?.id ?? null;
  if (state.track && !s.tracks.some((x) => x.id === state.track)) state.track = s.tracks[0]?.id ?? null;
  player.update(s);
  if (!quiet) scheduleProblems();
  renderTitleProject();
  renderView();
  renderRight();
  renderStatus();
  renderToolbarState();
  if (state.leftTab !== 'compose') renderLeft();
}

function restore(entry) {
  const d = doc();
  d.song = normalizeSong(JSON.parse(entry.snapshot));
  d.revision += 1;
  roll?.selection.clear();
  afterChange();
  scheduleProblems();
}

function undo() {
  const d = doc();
  const entry = d?.history.undo(snapshot());
  if (!entry) return;
  restore(entry);
  notify('info', t('notice.undo', { label: entry.label }));
}

function redo() {
  const d = doc();
  const entry = d?.history.redo(snapshot());
  if (!entry) return;
  restore(entry);
  notify('info', t('notice.redo', { label: entry.label }));
}

// ───────────────────────── selection

const selectedSection = () => song()?.sections.find((s) => s.id === state.section) ?? null;
const selectedTrack = () => song()?.tracks.find((tr) => tr.id === state.track) ?? null;
const selectedNotes = () => (state.view === 'roll' ? roll?.selected() ?? [] : []);

function selectSection(id, { open = false } = {}) {
  state.section = id;
  if (state.rightTab !== 'section' && open) state.rightTab = 'section';
  if (open) { setView('lyrics'); requestAnimationFrame(() => root.querySelector(`[data-lyric-section="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })); }
  renderView();
  renderRight();
}

function selectTrack(id, { open = false, beat = null } = {}) {
  state.track = id;
  if (open) { setView('roll'); if (beat != null) requestAnimationFrame(() => roll.reveal(Math.max(0, beat - 2))); }
  else renderView();
  renderRight();
  if (state.leftTab === 'instruments') renderLeft();
}

// ───────────────────────── playback

function play(from = null) {
  const s = song();
  if (!s) return;
  try {
    player.metronome = state.settings.metronome;
    player.setVolume(state.settings.masterVolume / 100);
    player.play(s, from ?? state.position);
    state.playing = true;
  } catch (error) { showError('error.audio', error); }
  renderToolbarState();
  renderStatus();
}

function stopPlayback() {
  if (!state.playing) return;
  state.position = player.stop();
  state.playing = false;
  renderToolbarState();
  renderStatus();
}

function togglePlay() { if (state.playing) stopPlayback(); else play(); }

function seek(beat, { quiet = false } = {}) {
  const s = song();
  if (!s) return;
  state.position = Math.max(0, Math.min(songBeats(s), beat));
  if (state.playing) play(state.position);
  else showPosition(state.position);
  if (!quiet) renderStatus();
}

const showPosition = frameThrottle((beat) => {
  arrangement?.setPlayhead(beat, state.playing && state.settings.followPlayhead);
  roll?.setPlayhead(beat, state.playing && state.settings.followPlayhead);
  const el = root.querySelector('#status-position');
  const s = song();
  if (el && s) el.textContent = `${barBeatLabel(beat, s.timeSignature)} · ${timeLabel(beatsToSeconds(beat, s.bpm))} / ${timeLabel(beatsToSeconds(songBeats(s), s.bpm))}`;
  const meter = root.querySelector('#level-meter');
  if (meter) meter.style.width = `${Math.min(100, player.level() * 100)}%`;
  const highlight = root.querySelector('.lyric-card.playing');
  const span = s && state.playing ? sectionSpans(s).find((x) => beat >= x.start && beat < x.end) : null;
  if (highlight && highlight.dataset.lyricSection !== span?.section.id) highlight.classList.remove('playing');
  if (span) root.querySelector(`[data-lyric-section="${CSS.escape(span.section.id)}"]`)?.classList.add('playing');
  lightNotes(beat);
  karaoke?.update(beat, state.playing);
});

/** The Lyrics view's staves are drawn for its width: redraw them when the view gets noticeably wider or narrower. */
let lyricsObserver = null;
function watchLyricsWidth(el) {
  if (lyricsObserver || !globalThis.ResizeObserver) return;
  let timer = null;
  lyricsObserver = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (state.view !== 'lyrics' || Math.abs((el.clientWidth || 0) - (state.lyricsWidth ?? 0)) < 24) return;
      renderView();
    }, 120);
  });
  lyricsObserver.observe(el);
}

/** The note being played lights up on the staves (Lyrics view, Lead sheet): <g class="nt" data-t data-e>. */
let litNotes = [];
function lightNotes(beat) {
  for (const el of litNotes) el.classList.remove('now');
  litNotes = [];
  if (!state.playing || !['lyrics', 'sheet'].includes(state.view)) return;
  const host = root.querySelector(state.view === 'lyrics' ? '.view-lyrics' : '.view-sheet');
  if (!host) return;
  for (const el of host.querySelectorAll('g.nt')) {
    if (Number(el.dataset.t) <= beat + 1e-3 && beat < Number(el.dataset.e) - 1e-3) { el.classList.add('now'); litNotes.push(el); }
  }
}

player.onPosition = (beat) => { state.position = beat; showPosition(beat); };
player.onEnd = () => { state.playing = false; state.position = 0; showPosition(0); renderToolbarState(); renderStatus(); };

function setLoop(start, end, on = true, { commit = true } = {}) {
  const s = song();
  if (!s) return;
  const apply = (x) => { x.loop = { on: on && end > start, start, end }; };
  if (commit) change('op.loop', apply); else { apply(s); renderView(); }
  player.update(s);
}

function loopSection() {
  const span = sectionSpans(song()).find((x) => x.section.id === state.section);
  if (span) { setLoop(span.start, span.end, true); notify('info', t('notice.loopSection', { name: sectionName(span.section) })); }
}

// ───────────────────────── AI compose

/** The composer's spec from the Compose panel (and the song being edited, when there is one). */
function composeSpec(overrides = {}) {
  const d = state.compose;
  return {
    topic: d.topic, theme: d.theme, genre: d.genre, mood: d.mood, language: d.language, structure: d.structure, seed: Number(d.seed) || newSeed(),
    key: d.tonic != null ? { tonic: Number(d.tonic), mode: d.mode ?? (['sad', 'dark', 'epic'].includes(d.mood) ? 'minor' : 'major') } : d.mode ? { mode: d.mode } : undefined,
    bpm: d.bpm || undefined, vocal: d.vocal === 'auto' ? undefined : d.vocal, notes: d.notes, ...overrides,
  };
}

/** "Claude (Anthropic) · claude-opus-5-5" — the AI and its model, for progress and notices. */
function aiName(provider) {
  const model = modelOf(state.settings, provider);
  return model ? `${t(`ai.provider.${provider}`)} · ${model}` : t(`ai.provider.${provider}`);
}

/**
 * Runs an AI request; when Claude or Ollama fails (and Settings › AI › fall back is on) the built-in
 * writer does the job instead and a notice says why. The user's cancel is never replaced.
 */
async function withFallback(provider, signal, report, run) {
  try {
    return await run(provider);
  } catch (error) {
    if (signal.cancelled || !canFallBack(error, state.settings, provider)) throw error;
    const reason = error?.code ? t(`error.code.${error.code}`, null, error.message) : String(error?.message ?? error);
    notify('warning', t('notice.aiFallback', { name: aiName(provider), reason }));
    report({ fraction: 0.3, text: t('progress.step.fallback'), icon: PROGRESS_STEP_ICONS['progress.step.lyrics'] });
    return run('builtin');
  }
}

/** Composes a new song from the Compose panel: the AI (or built-in) plan → the composer → a new document. */
async function aiCompose(overrides = {}) {
  if (state.busy) return null;
  if (!(await confirmReplace())) return null;
  const spec = composeSpec(overrides);
  const provider = providerFor(state.settings);
  const controller = new AbortController();
  state.busy = true;
  try {
    return await withProgress('progress.compose', spec.topic || t(`genre.${spec.genre}`), async (op, report, signal) => {
      signal.onCancel = () => controller.abort();
      report({ fraction: 0.05, text: t(provider === 'builtin' ? 'progress.step.lyrics' : 'progress.step.ask', { name: aiName(provider) }), icon: PROGRESS_STEP_ICONS[provider === 'builtin' ? 'progress.step.lyrics' : 'progress.step.ask'] });
      await idle();
      const planSpec = { ...spec, keyName: spec.key?.tonic != null ? keyName(spec.key) : '' };
      const plan = await withFallback(provider, signal, report, (p) => requestPlan(planSpec, state.settings, { signal: controller.signal, provider: p }));
      if (signal.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      report({ fraction: 0.6, text: t('progress.step.compose'), icon: PROGRESS_STEP_ICONS['progress.step.compose'] });
      await idle();
      const s = compose({
        ...spec, title: plan.title, provider: plan.provider ?? provider, model: plan.model ?? '', prompt: spec.topic,
        sections: plan.sections.map((x) => ({ type: x.type, bars: x.bars, lines: x.lines.length })),
        lyrics: { title: plan.title, sections: plan.sections.map((x) => x.lines) },
        chords: plan.sections.map((x) => x.chords),
      });
      report({ fraction: 0.95, text: t('progress.step.done'), icon: 'check' });
      const d = new Doc(s, { name: s.title || untitledName() });
      setDoc(d);
      setView('arrangement');
      notify('success', t('notice.composed', { name: s.title, provider: t(`ai.provider.${plan.provider ?? provider}`) }));
      state.compose.seed = newSeed();
      if (state.leftTab === 'compose') renderLeft();
      return d;
    }, { delay: 0, cancellable: true });
  } catch (error) {
    showError('error.compose', error, t(`ai.provider.${provider}`));
    return null;
  } finally { state.busy = false; }
}

/** New lyrics for the song (all sung sections, or one), from the AI; the melody follows the new words. */
async function aiLyrics(sectionId = null) {
  const s = song();
  if (!s || state.busy) return;
  const provider = providerFor(state.settings);
  const targets = s.sections.filter((x) => (sectionId ? x.id === sectionId : true));
  const sections = targets.map((x) => ({ id: x.id, type: x.type, bars: x.bars, lines: x.lyrics.length || SECTION_DEFAULTS[x.type].lines, chords: chordLineText(s, x).split(' | '), repeatOf: sectionId ? null : x.repeatOf }));
  if (!sections.some((x) => x.lines)) { notify('info', t('notice.noSungSections')); return; }
  const controller = new AbortController();
  state.busy = true;
  try {
    await withProgress('progress.lyrics', s.title || t('song.untitled'), async (op, report, signal) => {
      signal.onCancel = () => controller.abort();
      report({ fraction: 0.1, text: t(provider === 'builtin' ? 'progress.step.lyrics' : 'progress.step.ask', { name: aiName(provider) }), icon: PROGRESS_STEP_ICONS['progress.step.lyrics'] });
      await idle();
      const spec = { ...composeSpec(), genre: s.genre, mood: s.mood, language: state.compose.language, seed: newSeed() };
      const result = await withFallback(provider, signal, report, (p) => requestLyrics(spec, sections, state.settings, { signal: controller.signal, provider: p }));
      report({ fraction: 0.7, text: t('progress.step.compose'), icon: PROGRESS_STEP_ICONS['progress.step.compose'] });
      change('op.aiLyrics', (x) => {
        targets.forEach((sec, i) => { const lines = result.lines[i] ?? []; if (sections[i].lines) sec.lyrics = lines.slice(0, Math.max(1, sections[i].lines + 2)); });
        x.language = spec.language;
        if (!x.title && result.title) x.title = result.title;
        ensureVocal(x);
        for (const sec of targets) if (sec.lyrics.length && !(sec.repeatOf && !sectionId)) fitMelody(x, sec, newSeed());
      });
      notify('success', t('notice.lyricsWritten', { provider: t(`ai.provider.${result.provider ?? provider}`) }));
    }, { delay: 0, cancellable: true });
  } catch (error) { showError('error.lyrics', error, t(`ai.provider.${provider}`)); } finally { state.busy = false; }
}

/** A song with words gets a vocal track when it has none. */
function ensureVocal(s) {
  if (s.tracks.some((tr) => tr.role === 'vocal')) return;
  const genre = GENRES.find((g) => g.id === s.genre) ?? GENRES[0];
  s.tracks.unshift({ id: newId('trk'), role: 'vocal', instrument: genre.band.vocal ?? 'voiceFemale', name: '', volume: 0.9, pan: 0, reverb: 0.32, mute: false, solo: false, color: ROLE_COLORS.vocal, notes: [] });
}

/** The same song again with a new seed (the same settings, different tunes and words). */
async function aiVariation() {
  const s = song();
  if (!s) return aiCompose();
  state.compose = { ...state.compose, genre: s.genre, mood: s.mood, language: s.language };
  return aiCompose({ seed: newSeed(), structure: undefined, sections: s.sections.map((x) => ({ type: x.type, bars: x.bars })), key: s.key, bpm: s.bpm, title: undefined });
}

/** Rewrites one part of the selected section (or all of them). */
function regenerate(part, sectionId = state.section) {
  const s = song();
  const section = s?.sections.find((x) => x.id === sectionId);
  if (!section) { notify('info', t('notice.pickSection')); return; }
  const parts = part === 'all' ? PARTS : [part];
  change('op.regenerate', (x) => {
    const sec = x.sections.find((y) => y.id === sectionId);
    if (part === 'melody' || part === 'all') ensureVocal(x);
    writeSection(x, sec, part === 'all' ? ['chords', ...PARTS.filter((p) => p !== 'chords')] : parts, newSeed());
  });
  notify('success', t('notice.regenerated', { part: t(`regen.${part}`), name: sectionName(section) }));
}

function fitSelectedMelody(sectionId = state.section) {
  const s = song();
  const section = s?.sections.find((x) => x.id === sectionId);
  if (!section) return;
  change('op.fitMelody', (x) => { ensureVocal(x); fitMelody(x, x.sections.find((y) => y.id === sectionId), newSeed()); });
  notify('success', t('notice.melodyFitted', { name: sectionName(section) }));
}

// ───────────────────────── song edits

function addSection(type, { after = state.section } = {}) {
  const s = song();
  if (!s) return;
  let index = s.sections.findIndex((x) => x.id === after);
  index = index < 0 ? s.sections.length : index + 1;
  change('op.addSection', (x) => {
    const sec = makeSection(x, type, index, newSeed());
    const at = sectionSpans(x)[index]?.start ?? songBeats(x);
    shiftNotes(x, at, sec.bars * barBeats(x));
    x.sections.splice(index, 0, sec);
    writeSection(x, sec, PARTS.filter((p) => p !== 'chords' && p !== 'melody'), newSeed());
    state.section = sec.id;
  });
  notify('success', t('notice.sectionAdded', { name: t(`section.${type}`) }));
}

async function deleteSection(id = state.section) {
  const s = song();
  const span = sectionSpans(s).find((x) => x.section.id === id);
  if (!span || s.sections.length <= 1) { notify('info', t('notice.lastSection')); return; }
  if (state.settings.confirmDelete && (await ask({ icon: 'trash', title: t('confirm.deleteSectionTitle'), message: t('confirm.deleteSection', { name: sectionName(span.section) }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] })) !== 'ok') return;
  change('op.deleteSection', (x) => {
    cutRange(x, span.start, span.end);
    x.sections = x.sections.filter((y) => y.id !== id);
    for (const y of x.sections) if (y.repeatOf === id) y.repeatOf = null;
  });
}

function duplicateSection(id = state.section) {
  const s = song();
  const span = sectionSpans(s).find((x) => x.section.id === id);
  if (!span) return;
  change('op.duplicateSection', (x) => {
    const index = x.sections.findIndex((y) => y.id === id);
    const copy = { ...JSON.parse(JSON.stringify(x.sections[index])), id: newId('sec'), repeatOf: x.sections[index].repeatOf ?? id };
    const len = span.end - span.start;
    shiftNotes(x, span.end, len);
    for (const tr of x.tracks) addNotes(tr, tr.notes.filter((n) => n.t >= span.start && n.t < span.end).map((n) => ({ ...n, t: n.t + len })));
    x.sections.splice(index + 1, 0, copy);
    state.section = copy.id;
  });
}

function moveSection(index, dir) {
  const s = song();
  const j = index + dir;
  if (j < 0 || j >= s.sections.length) return;
  change('op.moveSection', (x) => {
    const spans = sectionSpans(x);
    const a = spans[Math.min(index, j)];
    const b = spans[Math.max(index, j)];
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    for (const tr of x.tracks) for (const n of tr.notes) {
      if (n.t >= a.start && n.t < a.end) n.t += lenB;
      else if (n.t >= b.start && n.t < b.end) n.t -= lenA;
    }
    for (const tr of x.tracks) tr.notes.sort((p, q) => p.t - q.t);
    [x.sections[index], x.sections[j]] = [x.sections[j], x.sections[index]];
  });
}

/** Changes a section's length: notes after it move; a longer section gets its parts written. */
function setSectionBars(id, bars) {
  const s = song();
  const span = sectionSpans(s).find((x) => x.section.id === id);
  if (!span) return;
  const per = barBeats(s);
  const delta = (bars - span.section.bars) * per;
  if (!delta) return;
  change('op.editSection', (x) => {
    const sec = x.sections.find((y) => y.id === id);
    if (delta > 0) shiftNotes(x, span.end, delta);
    else cutRange(x, span.end + delta, span.end);
    const oldBars = sec.bars;
    sec.bars = bars;
    // Chords: the pattern repeats into new bars, or is cut.
    if (bars > oldBars) {
      const extra = [];
      for (let b = oldBars; b < bars; b++) for (const c of sec.chords.filter((c) => Math.floor(c.at / per) === b % oldBars)) extra.push({ ...c, at: b * per + (c.at % per) });
      sec.chords.push(...extra);
      writeSection(x, sec, PARTS.filter((p) => p !== 'chords' && p !== 'melody'), newSeed());
    } else sec.chords = sec.chords.filter((c) => c.at < bars * per).map((c) => ({ ...c, len: Math.min(c.len, bars * per - c.at) }));
  });
}

function addTrack(instrumentId = 'piano') {
  const inst = instrument(instrumentId);
  const role = inst.drums ? 'drums' : inst.vocal ? 'vocal' : inst.category === 'bass' ? 'bass' : inst.category === 'pad' ? 'pad' : 'lead';
  change('op.addTrack', (x) => {
    const tr = normalizeSong({ ...x, tracks: [{ role, instrument: instrumentId, notes: [] }] }).tracks[0];
    x.tracks.push(tr);
    state.track = tr.id;
  });
  notify('success', t('notice.trackAdded', { name: lang() === 'en' ? inst.en : inst.ko }));
}

function setTrackInstrument(trackId, instrumentId) {
  change('op.instrument', (x) => { const tr = x.tracks.find((y) => y.id === trackId); if (tr) tr.instrument = instrumentId; });
}

async function deleteTrack(id = state.track) {
  const tr = song()?.tracks.find((x) => x.id === id);
  if (!tr) return;
  if (state.settings.confirmDelete && tr.notes.length && (await ask({ icon: 'trash', title: t('confirm.deleteTrackTitle'), message: t('confirm.deleteTrack', { name: trackLabel(tr), n: tr.notes.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] })) !== 'ok') return;
  change('op.deleteTrack', (x) => { x.tracks = x.tracks.filter((y) => y.id !== id); });
}

function duplicateTrack(id = state.track) {
  change('op.duplicateTrack', (x) => {
    const i = x.tracks.findIndex((y) => y.id === id);
    if (i < 0) return;
    const copy = { ...JSON.parse(JSON.stringify(x.tracks[i])), id: newId('trk'), name: `${trackLabel(x.tracks[i])} 2` };
    x.tracks.splice(i + 1, 0, copy);
    state.track = copy.id;
  });
}

function toggleTrack(id, field) {
  change(field === 'mute' ? 'op.mute' : 'op.solo', (x) => { const tr = x.tracks.find((y) => y.id === id); if (tr) tr[field] = !tr[field]; });
}

function setTrackVolume(id, value, commitIt) {
  const tr = song()?.tracks.find((y) => y.id === id);
  if (!tr) return;
  if (!commitIt) { tr.volume = value; player.update(song()); return; }
  const before = JSON.stringify({ ...song(), tracks: song().tracks.map((y) => (y.id === id ? { ...y, volume: state.dragVolume ?? y.volume } : y)) });
  tr.volume = value;
  record(before, 'op.volume');
}

/** Moves the whole song (key, chords and notes; not the drums) by semitones. */
function transposeSong(semitones) {
  change('op.transpose', (x) => {
    x.key = { ...x.key, tonic: mod12(x.key.tonic + semitones) };
    const flats = prefersFlats(x.key.tonic, x.key.mode);
    for (const sec of x.sections) for (const c of sec.chords) { const ch = parseChordSymbol(c.symbol); if (ch) c.symbol = chordSymbol(transposeChord(ch, semitones), flats); }
    for (const tr of x.tracks) if (!instrument(tr.instrument).drums) for (const n of tr.notes) n.p = Math.max(0, Math.min(127, n.p + semitones));
  });
  notify('info', t('notice.transposed', { key: keyName(song().key) }));
}

function editNotes(labelKey, fn) {
  const notes = selectedNotes();
  if (!notes.length) { notify('info', t('notice.selectNotes')); return; }
  const before = snapshot();
  for (const n of notes) fn(n);
  selectedTrack()?.notes.sort((a, b) => a.t - b.t || a.p - b.p);
  record(before, labelKey);
}

function deleteSelection() {
  if (state.view === 'roll' && selectedNotes().length) {
    const set = new Set(selectedNotes());
    change('op.deleteNotes', () => { const tr = selectedTrack(); tr.notes = tr.notes.filter((n) => !set.has(n)); });
    roll.selection.clear();
    return;
  }
  if (state.view === 'arrangement' && state.section) deleteSection();
}

function copyNotes(cut = false) {
  const notes = selectedNotes();
  if (!notes.length) return;
  const t0 = Math.min(...notes.map((n) => n.t));
  state.clipboard = { notes: notes.map((n) => ({ ...n, t: n.t - t0 })) };
  if (cut) { const set = new Set(notes); change('op.cut', () => { const tr = selectedTrack(); tr.notes = tr.notes.filter((n) => !set.has(n)); }); }
  notify('info', t('notice.copiedNotes', { n: notes.length }));
}

function pasteNotes() {
  const tr = selectedTrack();
  if (!tr || !state.clipboard?.notes?.length) return;
  const at = roll?.snapBeat(state.position, 'floor') ?? state.position;
  const pasted = state.clipboard.notes.map((n) => ({ ...n, t: Math.round((n.t + at) * 1000) / 1000 }));
  change('op.paste', () => { tr.notes.push(...pasted); tr.notes.sort((a, b) => a.t - b.t || a.p - b.p); });
  if (roll) { roll.selection = new Set(pasted); roll.draw(); }
}

function duplicateNotes() {
  const notes = selectedNotes();
  if (!notes.length) return;
  const t0 = Math.min(...notes.map((n) => n.t));
  const t1 = Math.max(...notes.map((n) => n.t + n.d));
  const len = Math.ceil((t1 - t0) / (roll.snap || 0.25)) * (roll.snap || 0.25);
  const copies = notes.map((n) => ({ ...n, t: Math.round((n.t + len) * 1000) / 1000 }));
  change('op.duplicateNotes', () => { const tr = selectedTrack(); tr.notes.push(...copies); tr.notes.sort((a, b) => a.t - b.t || a.p - b.p); });
  roll.selection = new Set(copies);
  roll.draw();
}

function quantize() {
  const grid = roll?.snap || 0.25;
  editNotes('op.quantize', (n) => { n.t = Math.round(n.t / grid) * grid; n.d = Math.max(grid, Math.round(n.d / grid) * grid); });
}

/** The next syllable of the section's lyrics for a note drawn at `beat` on the vocal track. */
function nextSyllable(beat) {
  const s = song();
  const vocal = s?.tracks.find((tr) => tr.role === 'vocal');
  const before = vocal?.notes.filter((n) => n.t < beat && n.syl).length ?? 0;
  const all = s?.sections.flatMap((sec) => sec.lyrics.join(' ').replace(/\s+/g, '').split('')) ?? [];
  return all[before] ?? 'la';
}

// ───────────────────────── views

let arrangement = null;
let karaoke = null;
let roll = null;
const VIEWS = [['arrangement', 'arrangement'], ['roll', 'pianoRoll'], ['lyrics', 'lyrics'], ['sheet', 'leadSheet']];

function setView(view) {
  if (!VIEWS.some(([id]) => id === view)) return;
  state.view = view;
  renderTabs();
  renderView();
  renderRight();
  renderToolbarState();
}

/** Puts the views into the centre once; afterwards only redraws the active one. */
function mountViews() {
  const host = root.querySelector('#view-host');
  if (host.dataset.mounted) return;
  host.dataset.mounted = '1';
  host.innerHTML = '<div class="view view-arrangement"></div><div class="view view-roll"></div><div class="view view-lyrics"></div><div class="view view-sheet"></div>';
  const viewApi = {
    song, state, t, lang, commandTip, sectionName, escape: escapeHtml, trackLabel, settings: () => state.settings,
    onSeek: (beat, o) => seek(beat, o), onSelectSection: (id, o) => selectSection(id, o), onSelectTrack: (id, o) => selectTrack(id, o),
    onLoopDrag: (a, b, done) => setLoop(a, b, true, { commit: done }),
    contextMenu: (e, kind, payload) => contextMenu(e, kind, payload),
    toggleTrack, setTrackVolume: (id, v, done) => { if (!done && state.dragVolume == null) state.dragVolume = song().tracks.find((x) => x.id === id)?.volume; setTrackVolume(id, v, done); if (done) state.dragVolume = null; },
    track: selectedTrack, tool: () => state.tool, snapshot, record, preview: (inst, p, syl) => player.preview(inst, p, { syllable: syl }), playing: () => state.playing,
    selectionChanged: () => { if (state.rightTab === 'notes' || selectedNotes().length) { if (selectedNotes().length) state.rightTab = 'notes'; renderRight(); } renderStatus(); },
    nextSyllable,
  };
  arrangement = new ArrangementView(host.querySelector('.view-arrangement'), viewApi);
  roll = new PianoRoll(host.querySelector('.view-roll'), viewApi);
  karaoke = new Karaoke(host, viewApi);
}

function renderView() {
  const host = root.querySelector('#view-host');
  if (!host || !hasSong()) return;
  mountViews();
  for (const [id] of VIEWS) host.querySelector(`.view-${id}`).hidden = state.view !== id;
  karaoke.setSong(song());
  if (state.view === 'arrangement') arrangement.render();
  else if (state.view === 'roll') {
    roll.render();
    // A track shown for the first time: its notes in view (not the top of the keyboard).
    if (roll.shownTrack !== state.track) { roll.shownTrack = state.track; requestAnimationFrame(() => roll.centerOnNotes()); }
  }
  else if (state.view === 'lyrics') {
    const el = host.querySelector('.view-lyrics');
    const focused = document.activeElement;
    if (focused && el.contains(focused) && focused.matches('textarea')) return;
    const scroll = el.querySelector('.lyrics-view')?.scrollTop ?? 0;
    state.lyricsWidth = el.clientWidth || state.lyricsWidth;
    el.innerHTML = lyricsViewHtml(panelApi);
    watchLyricsWidth(el);
    el.querySelector('.lyrics-view').scrollTop = scroll;
  } else if (state.view === 'sheet') {
    const el = host.querySelector('.view-sheet');
    const scroll = el.scrollTop;
    el.innerHTML = `<div class="sheet-view">${leadSheetSvg(song(), { ctx: { t, labels: sectionName, subtitle: t(`genre.${song().genre}`) }, scale: (state.settings.sheetZoom ?? 100) / 100 * 3.4 })}</div>`;
    el.scrollTop = scroll;
  }
  arrangement?.setPlayhead(state.position);
  roll?.setPlayhead(state.position);
}

function zoom(dir) {
  if (state.view === 'roll') roll?.zoomAt(dir);
  else if (state.view === 'sheet') { updateSettings({ sheetZoom: Math.max(50, Math.min(200, (state.settings.sheetZoom ?? 100) + dir * 10)) }, { quiet: true }); renderView(); }
  else arrangement?.zoomAt(dir);
}
function zoomFit() { if (state.view === 'roll') roll?.fit(); else if (state.view === 'sheet') { updateSettings({ sheetZoom: 100 }, { quiet: true }); renderView(); } else arrangement?.fit(); }

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const viewCommand = (id, glyph) => ({ icon: glyph, label: `view.${id}`, enabled: hasSong, checked: () => state.view === id, run: () => setView(id) });
const toolCommand = (id, glyph, key) => ({ icon: glyph, label: `tool.${id}`, key, enabled: hasSong, checked: () => state.tool === id, run: () => { state.tool = id; if (state.view !== 'roll') setView('roll'); renderToolbarState(); renderStatus(); } });
const regenCommand = (part) => ({ icon: part === 'all' ? 'aiCompose' : `part_${part}`, label: `regen.${part}`, enabled: () => hasSong() && Boolean(state.section), run: () => regenerate(part) });
const sectionCommand = (type) => ({ icon: `sec${type[0].toUpperCase()}${type.slice(1)}`, label: `section.${type}`, enabled: hasSong, run: () => addSection(type) });
const exportCommand = (fn, glyph, label) => ({ icon: glyph, label, enabled: hasSong, run: fn });
const notesSelected = () => hasSong() && selectedNotes().length > 0;

const commands = {
  new: { icon: 'fileNew', label: 'action.new', run: () => newSongAsk('empty') },
  newFromTemplate: { icon: 'template', label: 'action.newFromTemplate', run: (c) => templateMenu(c?.anchor) },
  openExample: { icon: 'samples', label: 'action.openExample', run: (c) => examplesMenu(c?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', checked: () => state.showStart || !state.doc, run: () => showStartPage(!state.showStart) },
  recent: { icon: 'recent', label: 'action.recent', run: () => popups.open('recent') },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (c) => recentFoldersMenu(c?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  save: { icon: 'save', label: 'action.save', enabled: hasSong, run: () => saveDoc() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', enabled: hasSong, run: () => saveDoc({ saveAs: true }) },
  importAny: { icon: 'importFile', label: 'action.importAny', run: () => importDialog() },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasSong, run: (c) => showMenu(menuItems(SUBMENUS.exportTo.items), c?.anchor ?? anchorFor('exportMenu'), 'export', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  exportAudio: exportCommand(() => exportAudioDialog(), 'exportAudio', 'action.exportAudio'),
  exportStems: exportCommand(() => exportAudioDialog({ stems: true }), 'tracks', 'action.exportStems'),
  exportMidi: exportCommand(() => exportMidi(), 'midiFile', 'action.exportMidi'),
  exportLyrics: exportCommand(() => exportText('txt'), 'lyrics', 'action.exportLyrics'),
  exportLrc: exportCommand(() => exportText('lrc'), 'lrcFile', 'action.exportLrc'),
  exportChords: exportCommand(() => exportText('chords'), 'chords', 'action.exportChords'),
  exportJson: exportCommand(() => exportText('json'), 'jsonFile', 'action.exportJson'),
  print: { icon: 'print', label: 'action.print', enabled: hasSong, run: () => printHost.open() },
  closeProject: { icon: 'exitProject', label: 'action.closeProject', enabled: () => Boolean(state.doc), run: () => closeSong() },
  exit: { icon: 'exit', label: 'action.exit', run: () => requestExit() },
  undo: { icon: 'undo', label: 'action.undo', enabled: () => Boolean(doc()?.history.canUndo), run: undo },
  redo: { icon: 'redo', label: 'action.redo', enabled: () => Boolean(doc()?.history.canRedo), run: redo },
  cut: { icon: 'cut', label: 'action.cut', enabled: notesSelected, run: () => copyNotes(true) },
  copy: { icon: 'copy', label: 'action.copy', enabled: notesSelected, run: () => copyNotes() },
  paste: { icon: 'paste', label: 'action.paste', enabled: () => hasSong() && Boolean(state.clipboard) && Boolean(selectedTrack()), run: pasteNotes },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', enabled: notesSelected, run: duplicateNotes },
  delete: { icon: 'trash', label: 'action.delete', enabled: () => hasSong() && (selectedNotes().length > 0 || (state.view === 'arrangement' && Boolean(state.section))), run: deleteSelection },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', enabled: () => hasSong() && state.view === 'roll', run: () => { roll.selectAll(); renderRight(); } },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', enabled: notesSelected, run: () => { roll.clearSelection(); renderRight(); } },
  quantize: { icon: 'quantize', label: 'action.quantize', key: 'Q', enabled: notesSelected, run: quantize },
  transposeNotesUp: { icon: 'transposeUp', label: 'action.transposeNotesUp', enabled: notesSelected, run: () => editNotes('op.transpose', (n) => { n.p = Math.min(127, n.p + 1); }) },
  transposeNotesDown: { icon: 'transposeDown', label: 'action.transposeNotesDown', enabled: notesSelected, run: () => editNotes('op.transpose', (n) => { n.p = Math.max(0, n.p - 1); }) },
  octaveUp: { icon: 'octaveUp', label: 'action.octaveUp', enabled: notesSelected, run: () => editNotes('op.transpose', (n) => { n.p = Math.min(127, n.p + 12); }) },
  octaveDown: { icon: 'octaveDown', label: 'action.octaveDown', enabled: notesSelected, run: () => editNotes('op.transpose', (n) => { n.p = Math.max(0, n.p - 12); }) },
  transposeUp: { icon: 'transposeUp', label: 'action.transposeUp', enabled: hasSong, run: () => transposeSong(1) },
  transposeDown: { icon: 'transposeDown', label: 'action.transposeDown', enabled: hasSong, run: () => transposeSong(-1) },
  addSectionMenu: { icon: 'sectionAdd', label: 'action.addSection', enabled: hasSong, run: (c) => showMenu(menuItems(SUBMENUS.addSection.items), c?.anchor ?? anchorFor('addSectionMenu'), 'context', { header: { icon: 'sectionAdd', title: t('action.addSection') } }) },
  duplicateSection: { icon: 'duplicate', label: 'action.duplicateSection', enabled: () => hasSong() && Boolean(state.section), run: () => duplicateSection() },
  deleteSection: { icon: 'trash', label: 'action.deleteSection', enabled: () => hasSong() && Boolean(state.section) && song().sections.length > 1, run: () => deleteSection() },
  sectionUp: { icon: 'chevronUp', label: 'action.sectionUp', enabled: () => hasSong() && song().sections.findIndex((s) => s.id === state.section) > 0, run: () => moveSection(song().sections.findIndex((s) => s.id === state.section), -1) },
  sectionDown: { icon: 'chevronDown', label: 'action.sectionDown', enabled: () => hasSong() && song().sections.findIndex((s) => s.id === state.section) < song().sections.length - 1 && Boolean(state.section), run: () => moveSection(song().sections.findIndex((s) => s.id === state.section), 1) },
  addTrack: { icon: 'trackAdd', label: 'action.addTrack', enabled: hasSong, run: (c) => trackMenu(c?.anchor ?? anchorFor('addTrack')) },
  duplicateTrack: { icon: 'duplicate', label: 'action.duplicateTrack', enabled: () => hasSong() && Boolean(state.track), run: () => duplicateTrack() },
  deleteTrack: { icon: 'trash', label: 'action.deleteTrack', enabled: () => hasSong() && Boolean(state.track), run: () => deleteTrack() },
  openRoll: { icon: 'pianoRoll', label: 'action.openRoll', enabled: () => hasSong() && Boolean(state.track), run: () => { setView('roll'); roll.fit(); } },
  songProps: { icon: 'songInfo', label: 'action.songProps', enabled: hasSong, run: () => { state.rightTab = 'song'; if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true }); renderRight(); } },
  aiCompose: { icon: 'aiCompose', label: 'action.aiCompose', key: null, run: () => aiCompose() },
  aiWizard: { icon: 'aiWizard', label: 'action.aiWizard', run: () => composeWizard() },
  aiLyrics: { icon: 'aiLyrics', label: 'action.aiLyrics', enabled: hasSong, run: () => aiLyrics() },
  aiVariation: { icon: 'variation', label: 'action.aiVariation', enabled: hasSong, run: () => aiVariation() },
  regenerateMenu: { icon: 'chevronDown', label: 'action.regenerateMenu', enabled: () => hasSong() && Boolean(state.section), run: (c) => showMenu(menuItems(SUBMENUS.regenerate.items), c?.anchor ?? anchorFor('regenerateMenu'), 'context', { header: { icon: 'variation', title: t('submenu.regenerate') } }) },
  'regen:all': regenCommand('all'), 'regen:chords': regenCommand('chords'), 'regen:melody': regenCommand('melody'), 'regen:lead': regenCommand('lead'), 'regen:accompaniment': regenCommand('accompaniment'), 'regen:bass': regenCommand('bass'), 'regen:drums': regenCommand('drums'),
  fitMelody: { icon: 'fitMelody', label: 'action.fitMelody', enabled: () => hasSong() && Boolean(selectedSection()?.lyrics.length), run: () => fitSelectedMelody() },
  aiSettings: { icon: 'aiSettings', label: 'action.aiSettings', run: () => popups.open('settings', { tab: 'ai' }) },
  copyLyrics: { icon: 'copy', label: 'action.copyLyrics', enabled: hasSong, run: () => native.clipboardWrite(lyricsToText(song(), sectionName)).then(() => notify('success', t('notice.copiedText'))).catch((e) => showError('error.clipboard', e)) },
  pasteLyrics: { icon: 'paste', label: 'action.pasteLyrics', enabled: hasSong, run: () => pasteLyrics() },
  play: { icon: 'play', label: 'action.play', key: 'Space', enabled: hasSong, checked: () => state.playing, run: togglePlay },
  stop: { icon: 'stop', label: 'action.stop', enabled: hasSong, run: () => { stopPlayback(); seek(0); } },
  toStart: { icon: 'toStart', label: 'action.toStart', enabled: hasSong, run: () => seek(song()?.loop?.on ? song().loop.start : 0) },
  loop: { icon: 'loop', label: 'action.loop', key: 'L', enabled: hasSong, checked: () => Boolean(song()?.loop.on), run: () => { const s = song(); if (s.loop.end > s.loop.start) setLoop(s.loop.start, s.loop.end, !s.loop.on); else loopSection(); } },
  loopSection: { icon: 'loopSection', label: 'action.loopSection', enabled: () => hasSong() && Boolean(state.section), run: loopSection },
  metronome: { icon: 'metronome', label: 'action.metronome', key: 'M', checked: () => state.settings.metronome, run: () => { toggle('metronome'); player.metronome = state.settings.metronome; } },
  follow: { icon: 'follow', label: 'action.follow', checked: () => state.settings.followPlayhead, run: () => toggle('followPlayhead') },
  'view:arrangement': viewCommand('arrangement', 'arrangement'),
  'view:roll': viewCommand('roll', 'pianoRoll'),
  'view:lyrics': viewCommand('lyrics', 'lyrics'),
  karaoke: { icon: 'lyrics', label: 'karaoke.toggle', checked: () => state.settings.karaoke !== false, run: () => { toggle('karaoke'); karaoke?.update(state.position, state.playing); } },
  'view:sheet': viewCommand('sheet', 'leadSheet'),
  'tool:select': toolCommand('select', 'pointer', 'V'),
  'tool:draw': toolCommand('draw', 'pencil', 'D'),
  'tool:erase': toolCommand('erase', 'eraser', 'E'),
  snapMenu: { icon: 'snap', label: 'action.snapMenu', enabled: hasSong, run: (c) => snapMenu(c?.anchor ?? anchorFor('snapMenu')) },
  ghosts: { icon: 'ghost', label: 'action.ghosts', checked: () => state.settings.rollGhosts, run: () => { toggle('rollGhosts'); roll?.draw(); } },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', enabled: hasSong, run: () => zoom(1) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', enabled: hasSong, run: () => zoom(-1) },
  zoomFit: { icon: 'fitPage', label: 'action.zoomFit', enabled: hasSong, run: zoomFit },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  showProblems: { icon: 'warning', label: 'action.showProblems', run: () => { state.bottomTab = 'problems'; if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom(); } },
  showMessages: { icon: 'info', label: 'action.showMessages', run: () => { state.bottomTab = 'messages'; if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom(); } },
  checkNow: { icon: 'validate', label: 'action.checkNow', enabled: hasSong, run: () => { runProblems(); notify('info', t('notice.checked', countBySeverity(state.problems))); } },
  copyMessages: { icon: 'copy', label: 'action.copyMessages', enabled: () => state.log.length > 0, run: () => native.clipboardWrite(state.log.map(logLine).join('\n')).then(() => notify('success', t('notice.copiedText'))) },
  clearMessages: { icon: 'clearHistory', label: 'action.clearMessages', enabled: () => state.log.length > 0, run: () => { state.log = []; renderBottom(); } },
  theme: { icon: 'palette', label: 'action.theme', run: () => updateSettings({ theme: resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark ? 'light' : 'dark' }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage), run: () => removeBackground() },
  settings: { icon: 'gear', label: 'action.settings', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', run: () => popups.open('about') },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', run: () => startTutorial() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  tutorialVideo: { icon: 'tutorialVideo', label: 'action.tutorialVideo', run: () => openDocWindow('video') },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
};
for (const type of SECTION_TYPES) commands[`section:${type}`] = sectionCommand(type);
for (const [i, s] of SNAPS.entries()) commands[`snap:${i}`] = { icon: 'snap', label: s ? `snap.${String(s).replace('.', '_').slice(0, 6)}` : 'snap.off', checked: () => (state.settings.rollSnap ?? 0.25) === s, run: () => { updateSettings({ rollSnap: s }, { quiet: true }); roll?.draw(); renderStatus(); } };

function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) {
  const c = commands[id];
  if (!c) return '';
  const shortcut = SHORTCUTS.find(([, , cmd]) => cmd === id);
  const key = c.key ? keyLabel(c.key) : shortcut ? keyLabel(`Ctrl+${shortcut[1] ? 'Shift+' : ''}${shortcut[0].length === 1 ? shortcut[0].toUpperCase() : shortcut[0]}`) : '';
  const tip = t(`tip.${id}`, null, '');
  return `${t(c.label)}${key ? ` (${key})` : ''}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { return await c.run(context); } catch (error) { showError('error.command', error, id); return undefined; }
}

// ───────────────────────── menus

const SUBMENUS = {
  exportTo: { icon: 'exportFile', items: ['exportAudio', 'exportStems', 'exportMidi', '-', 'exportLyrics', 'exportLrc', 'exportChords', 'exportJson'] },
  addSection: { icon: 'sectionAdd', items: SECTION_TYPES.map((x) => `section:${x}`) },
  regenerate: { icon: 'variation', items: ['regen:all', '-', 'regen:chords', 'regen:melody', 'regen:lead', 'regen:accompaniment', 'regen:bass', 'regen:drums'] },
  transpose: { icon: 'transposeUp', items: ['transposeUp', 'transposeDown', '-', 'transposeNotesUp', 'transposeNotesDown', 'octaveUp', 'octaveDown'] },
  views: { icon: 'arrangement', items: VIEWS.map(([id]) => `view:${id}`) },
  show: { icon: 'eye', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'ghosts', 'follow', 'karaoke'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  snap: { icon: 'snap', items: SNAPS.map((_, i) => `snap:${i}`) },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'newFromTemplate', 'openExample', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', '-', 'importAny', sub('exportTo'), '-', 'print', '-', 'closeProject', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', 'clearSelection', '-', sub('transpose'), 'quantize', '-', 'tool:select', 'tool:draw', 'tool:erase', sub('snap')],
  song: ['songProps', '-', sub('addSection'), 'duplicateSection', 'deleteSection', 'sectionUp', 'sectionDown', '-', 'addTrack', 'duplicateTrack', 'deleteTrack', 'openRoll', '-', 'copyLyrics', 'pasteLyrics', '-', 'checkNow', 'showProblems', 'showMessages'],
  ai: ['aiCompose', 'aiWizard', 'aiLyrics', 'aiVariation', '-', sub('regenerate'), 'fitMelody', '-', 'aiSettings'],
  play: ['play', 'stop', 'toStart', '-', 'loop', 'loopSection', 'metronome', 'follow'],
  view: [sub('views'), '-', 'zoomIn', 'zoomOut', 'zoomFit', '-', sub('show'), '-', sub('appearance')],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'tutorialVideo', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', song: 'songInfo', ai: 'aiCompose', play: 'play', view: 'eye', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'print', 'exportSplit', 'importAny'],
  ['undo', 'redo'],
  ['toStart', 'play', 'stop', 'loop', 'metronome', 'follow'],
  ['aiCompose', 'aiWizard', 'aiLyrics', 'regenerateSplit'],
  ['view:arrangement', 'view:roll', 'view:lyrics', 'view:sheet'],
  ['tool:select', 'tool:draw', 'tool:erase', 'snapMenu'],
  ['zoomIn', 'zoomOut', 'zoomFit'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const TOOLBAR_MAIN = { exportSplit: 'exportAudio', themeSplit: 'theme', regenerateSplit: 'regen:all' };

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.doc;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyAudioMaker v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyAudioMaker</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const projectName = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + projectName + `<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const d = state.showStart ? null : state.doc;
  box.classList.toggle('empty', !d);
  box.classList.toggle('dirty', Boolean(d?.dirty));
  box.querySelector('.app-brand-project-name').textContent = d ? docName(d) : '';
  box.title = d ? `${d.path ?? docName(d)}${d.dirty ? ` (${t('status.modified')})` : ''}` : '';
  document.title = `${d ? `${docName(d)}${d.dirty ? ' *' : ''} — ` : ''}MyAudioMaker v${state.info?.version ?? VERSION}`;
}

function windowButton(id) {
  if (!desktop) return;
  if (id === 'minimize') appWindow.minimize().catch(() => {});
  else if (id === 'maximize') appWindow.toggleMaximize().catch(() => {});
  else if (id === 'close') requestExit();
}

async function trackMaximized() {
  if (!desktop) return;
  const update = async () => {
    const maximized = await appWindow.isMaximized().catch(() => false);
    if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); }
  };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const mark = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('myaudiomaker.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('myaudiomaker.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id) => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    return `<button class="tool-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => {
    if (id === 'exportSplit') return split('exportAudio', 'exportMenu', 'action.exportMenu');
    if (id === 'themeSplit') return split('theme', 'themeMenu', 'action.themeChoose');
    if (id === 'regenerateSplit') return split('regen:all', 'regenerateMenu', 'action.regenerateMenu');
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${escapeHtml(t('toolbar.more'))}" aria-label="${escapeHtml(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
  fitToolbar();
}

function fitToolbar() {
  const inner = root.querySelector('.toolbar-inner');
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  const more = root.querySelector('[data-toolbar-more]');
  if (!inner || !left || !right || !more) return;
  const groups = [...left.querySelectorAll('[data-group]')];
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = false;
  more.hidden = true;
  const room = inner.clientWidth - right.offsetWidth - 12;
  if (left.scrollWidth <= room) { state.toolbarHidden = []; return; }
  more.hidden = false;
  const limit = room - more.offsetWidth - 6;
  const start = left.getBoundingClientRect().left;
  let cut = groups.length;
  for (const [i, g] of groups.entries()) if (g.getBoundingClientRect().right - start > limit) { cut = Math.max(1, i); break; }
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = Number(el.dataset.group ?? el.dataset.groupSep) >= cut;
  state.toolbarHidden = TOOLBAR.slice(cut);
}

function showToolbarMore(button) {
  const ids = (state.toolbarHidden ?? []).flatMap((group, i) => [...(i ? ['-'] : []), ...group.map((id) => TOOLBAR_MAIN[id] ?? id)]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const playBtn = root.querySelector('#toolbar [data-command="play"]');
  if (playBtn) { playBtn.innerHTML = icon(state.playing ? 'pause' : 'play'); playBtn.title = commandTip('play'); }
}

function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const folded = [...left.querySelectorAll('[data-group], [data-group-sep]')].filter((el) => el.hidden);
    const more = left.querySelector('[data-toolbar-more]');
    const moreHidden = more?.hidden;
    for (const el of folded) el.hidden = false;
    if (more) more.hidden = true;
    const full = left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
    for (const el of folded) el.hidden = true;
    if (more) more.hidden = moreHidden;
    const screenWidth = window.screen?.availWidth || Infinity;
    const width = Math.ceil(Math.min(screenWidth, Math.max(menus, full)));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 680).catch(() => {});
    fitToolbar();
  });
}

/** View tabs above the centre, and the song's key, tempo and metre on the right. */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const s = state.showStart ? null : song();
  if (!s) { tabs.innerHTML = ''; return; }
  tabs.innerHTML = `<div class="tab-strip">${VIEWS.map(([id, glyph]) => `<button class="tab ${state.view === id ? 'active' : ''}" data-view="${id}" title="${escapeHtml(commandTip(`view:${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`view.${id}`))}</span></button>`).join('')}</div>
    <span class="grow"></span>
    <div class="tabs-right">
      <button class="level-chip" data-song-chip="key" title="${escapeHtml(t('song.keyTip'))}">${icon('keySig')}<span>${escapeHtml(keyName(s.key))}</span></button>
      <button class="level-chip" data-song-chip="bpm" title="${escapeHtml(t('song.bpm'))}">${icon('tempo')}<span>${s.bpm} BPM</span></button>
      <button class="level-chip" data-song-chip="ts" title="${escapeHtml(t('song.timeSignature'))}">${icon('timeSig')}<span>${s.timeSignature.join('/')}</span></button>
      <span class="level-chip static" title="${escapeHtml(t(`genre.${s.genre}`))}">${icon(GENRES.find((g) => g.id === s.genre)?.icon ?? 'genrePop')}<span>${escapeHtml(t(`genre.${s.genre}`))}</span></span>
    </div>`;
}

// ───────────────────────── left panel

const LEFT_TABS = [['compose', 'aiCompose'], ['instruments', 'instKeys'], ['sections', 'structure']];

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  if (state.showStart || !state.doc) { if (!state.doc) panel.innerHTML = ''; return; }
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}">${icon('panelLeftOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('aiCompose')}<span>${escapeHtml(t('panel.composeShort'))}</span></div></div>`;
    return;
  }
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('textarea, input[type="text"], input[type="search"]') && state.leftTab === 'compose') return;
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const body = state.leftTab === 'instruments' ? instrumentsHtml(panelApi) : state.leftTab === 'sections' ? sectionsHtml(panelApi) : composeHtml(panelApi);
  panel.innerHTML = `<div class="panel-header">${icon(LEFT_TABS.find(([id]) => id === state.leftTab)[1])}<span>${escapeHtml(t(`panel.${state.leftTab}`))}</span>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
    <div class="editor-tabs" role="tablist">${LEFT_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.leftTab === id ? 'active' : ''}" data-left-tab="${id}" role="tab" title="${escapeHtml(t(`panel.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`panel.${id}`))}</span></button>`).join('')}</div>
    <div class="panel-body ${state.leftTab}">${body}</div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
}

// ───────────────────────── right panel

const RIGHT_TABS = [['song', 'songInfo'], ['section', 'structure'], ['track', 'tracks'], ['notes', 'notesIcon'], ['mix', 'mixer']];

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}">${icon('panelRightOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('songInfo')}<span>${escapeHtml(t('panel.outlineShort'))}</span></div></div>`;
    return;
  }
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input[type="text"], textarea')) {
    clearTimeout(renderRight.timer);
    renderRight.timer = setTimeout(() => { if (!panel.contains(document.activeElement)) renderRight(); }, 400);
    return;
  }
  if (!panel.querySelector('#outliner')) {
    panel.innerHTML = `<div class="panel-header">${icon('songInfo')}<span>${escapeHtml(t('panel.outline'))}</span>
        <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}">${icon('panelRightClose')}</button></div>
      <div id="outliner" class="explorer"></div>
      <div class="splitter horizontal" data-split="explorer" role="separator" aria-orientation="horizontal"></div>
      <div id="editor-tabs" class="editor-tabs" role="tablist"></div>
      <div id="editors" class="editors"></div>`;
    bindExplorerSplitter(panel.querySelector('[data-split="explorer"]'));
  }
  panel.style.setProperty('--explorer-height', `${state.settings.explorerHeight}%`);
  const ol = panel.querySelector('#outliner');
  const olScroll = ol.scrollTop;
  ol.innerHTML = state.showStart || !song() ? '' : outlineHtml(panelApi);
  ol.scrollTop = olScroll;
  panel.querySelector('#editor-tabs').innerHTML = RIGHT_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.rightTab === id ? 'active' : ''}" data-editor-tab="${id}" role="tab" title="${escapeHtml(t(`editors.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`editors.${id}`))}</span></button>`).join('');
  const host = panel.querySelector('#editors');
  const scroll = host.scrollTop;
  let html;
  if (!song() || state.showStart) html = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noSong'))}</span></p>`;
  else html = { song: songEditorHtml, section: sectionEditorHtml, track: trackEditorHtml, notes: notesEditorHtml, mix: mixEditorHtml }[state.rightTab](panelApi);
  host.innerHTML = `<div class="editor-body">${html}</div>`;
  host.scrollTop = scroll;
}

function bindExplorerSplitter(splitter) {
  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const panel = root.querySelector('#right-panel');
    const rect = panel.getBoundingClientRect();
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy, e) => { const pct = Math.max(15, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100)); panel.style.setProperty('--explorer-height', `${pct}%`); state.settings.explorerHeight = Math.round(pct); },
      end: (e, moved) => { if (moved) updateSettings({ explorerHeight: state.settings.explorerHeight }, { quiet: true }); },
    });
  });
}

/** Editor fields: song, section, track, note. */
function setField(kind, field, raw, target) {
  const s = song();
  if (!s) return;
  if (kind === 'song') {
    change('op.editSong', (x) => {
      if (field === 'title' || field === 'artist') x[field] = String(raw).trim();
      else if (field === 'genre' || field === 'mood') x[field] = raw;
      else if (field === 'tonic') { const shift = ((Number(raw) - x.key.tonic + 18) % 12) - 6; x.key.tonic = x.key.tonic; transposeInside(x, shift); }
      else if (field === 'mode') { x.key.mode = raw; respellChords(x); }
      else if (field === 'bpm') x.bpm = Math.max(30, Math.min(300, Number(raw) || x.bpm));
      else if (field === 'timeSignature') { const [n, d] = String(raw).split('/').map(Number); x.timeSignature = [n, d]; }
      else if (field === 'swing') x.swing = Number(raw);
      else if (field === 'language') x.language = raw;
    });
    if (field === 'bpm' || field === 'timeSignature' || field === 'tonic' || field === 'mode') renderTabs();
    return;
  }
  if (kind === 'section') {
    const section = selectedSection();
    if (!section) return;
    if (field === 'bars') { setSectionBars(section.id, Math.max(1, Math.min(64, Math.round(Number(raw) || section.bars)))); return; }
    change('op.editSection', (x) => {
      const sec = x.sections.find((y) => y.id === section.id);
      if (field === 'label') sec.label = String(raw).trim();
      else if (field === 'type') sec.type = raw;
      else if (field === 'energy') sec.energy = Number(raw);
      else if (field === 'repeatOf') { sec.repeatOf = raw || null; if (raw) { const src = x.sections.find((y) => y.id === raw); sec.lyrics = [...src.lyrics]; sec.chords = src.chords.map((c) => ({ ...c })); fitMelody(x, src, x.seed); } }
      else if (field === 'chords') {
        const chords = parseChordLineText(raw, x, sec);
        if (!chords.length && String(raw).trim()) { notify('error', t('notice.badChords')); target.value = chordLineText(x, sec); return; }
        sec.chords = chords;
        writeSection(x, sec, ['accompaniment', 'bass', 'pad'], newSeed());
      }
    });
    return;
  }
  if (kind === 'track') {
    const track = selectedTrack();
    if (!track) return;
    change(field === 'instrument' ? 'op.instrument' : 'op.editTrack', (x) => {
      const tr = x.tracks.find((y) => y.id === track.id);
      if (field === 'name') tr.name = String(raw).trim();
      else if (['volume', 'pan', 'reverb'].includes(field)) tr[field] = Number(raw);
      else tr[field] = raw;
    });
    return;
  }
  if (kind === 'note') {
    if (field === 'velocity') { editNotes('op.velocity', (n) => { n.v = Number(raw); }); return; }
    const notes = selectedNotes();
    if (notes.length !== 1) return;
    const n = notes[0];
    editNotes('op.editNote', (x) => {
      if (field === 'pitch') { const p = parseNote(raw) ?? Number(raw); if (Number.isFinite(p)) x.p = Math.max(0, Math.min(127, p)); }
      else if (field === 'start') { const v = Number(raw); if (Number.isFinite(v)) x.t = Math.max(0, v); }
      else if (field === 'length') { const v = Number(raw); if (Number.isFinite(v) && v > 0) x.d = v; }
      else if (field === 'syl') { if (raw) x.syl = String(raw).trim(); else delete x.syl; }
    });
    void n;
  }
}

/** Key change inside a song edit (chords and pitched notes move with the key). */
function transposeInside(x, semitones) {
  x.key = { ...x.key, tonic: mod12(x.key.tonic + semitones) };
  const flats = prefersFlats(x.key.tonic, x.key.mode);
  for (const sec of x.sections) for (const c of sec.chords) { const ch = parseChordSymbol(c.symbol); if (ch) c.symbol = chordSymbol(transposeChord(ch, semitones), flats); }
  for (const tr of x.tracks) if (!instrument(tr.instrument).drums) for (const n of tr.notes) n.p = Math.max(0, Math.min(127, n.p + semitones));
}

/** Lyrics typed into a section: stored; the melody follows when the syllables changed (Settings › Editor). */
function setLyrics(sectionId, text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const s = song();
  const section = s.sections.find((x) => x.id === sectionId);
  if (!section || lines.join('\n') === section.lyrics.join('\n')) return;
  change('op.lyrics', (x) => {
    const sec = x.sections.find((y) => y.id === sectionId);
    sec.lyrics = lines;
    for (const other of x.sections) if (other.repeatOf === sectionId) other.lyrics = [...lines];
    if (state.settings.autoFitMelody && lines.length && x.tracks.some((tr) => tr.role === 'vocal')) fitMelody(x, sec, newSeed());
  });
}

async function pasteLyrics() {
  try {
    const text = await native.clipboardRead();
    if (!text?.trim()) { notify('info', t('notice.clipboardEmpty')); return; }
    const s = song();
    const map = parseLyricsText(text, s.sections, sectionName);
    change('op.lyrics', (x) => {
      for (const sec of x.sections) if (map[sec.id]) sec.lyrics = map[sec.id];
      ensureVocal(x);
      for (const sec of x.sections) if (map[sec.id]) fitMelody(x, sec, newSeed());
    });
    notify('success', t('notice.lyricsPasted'));
  } catch (error) { showError('error.clipboard', error); }
}

// ───────────────────────── bottom panel

let problemsTimer = 0;
function scheduleProblems(delay = 400) { clearTimeout(problemsTimer); problemsTimer = setTimeout(runProblems, delay); }
function runProblems() {
  const s = song();
  state.problems = s ? checkSong(s, { labels: sectionName, trackName: trackLabel }) : [];
  renderBottom();
  renderStatus();
}

const logLine = (e) => `[${e.at.toLocaleTimeString()}] ${e.kind.toUpperCase()} ${e.text}${e.detail ? `\n${e.detail}` : ''}`;
const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };
const problemText = (pr) => t(`check.${pr.code}`, pr.params);
const problemFix = (pr) => t(`check.fix.${pr.code}`, pr.params);

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (!state.settings.showBottomPanel || state.showStart || !state.doc) { host.innerHTML = ''; return; }
  const counts = countBySeverity(state.problems);
  const tabs = [['problems', 'warning', t('bottom.problems'), state.problems.length], ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'songInfo', t('bottom.info'), null]];
  const tabHtml = `<span class="segmented" role="tablist">${tabs.map(([id, glyph, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${state.bottomTab === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>`;
  let tools = '';
  let body = '';
  if (state.bottomTab === 'problems') {
    const filters = [['all', t('bottom.all'), state.problems.length], ['error', t('bottom.errors'), counts.error], ['warning', t('bottom.warnings'), counts.warning], ['info', t('bottom.infos'), counts.info]];
    tools = `<span class="segmented">${filters.map(([id, label, n]) => `<button class="segment ${state.problemFilter === id ? 'active' : ''}" data-problem-filter="${id}">${id === 'all' ? '' : icon(SEV_ICON[id])}<span>${escapeHtml(label)} ${n}</span></button>`).join('')}</span>
      <span class="grow"></span><button class="small-button" data-command="checkNow" title="${escapeHtml(commandTip('checkNow'))}">${icon('validate')}<span>${escapeHtml(t('action.checkNow'))}</span></button>`;
    const list = state.problems.filter((pr) => state.problemFilter === 'all' || pr.severity === state.problemFilter);
    body = list.length ? `<div class="problem-row head"><span class="cell"></span><span class="cell">${escapeHtml(t('bottom.message'))}</span><span class="cell">${escapeHtml(t('bottom.fix'))}</span><span class="cell">${escapeHtml(t('bottom.target'))}</span></div>` + list.map((pr) => {
      const target = pr.target?.section ? sectionName(song().sections.find((x) => x.id === pr.target.section) ?? { type: 'verse', label: '' }) : pr.target?.track ? trackLabel(song().tracks.find((x) => x.id === pr.target.track) ?? { instrument: 'piano', name: '' }) : t('song.song');
      return `<div class="problem-row bottom-row ${pr.severity}" data-problem="${escapeHtml(pr.id)}" title="${escapeHtml(`${problemText(pr)} — ${problemFix(pr)}`)}"><span class="cell sev">${icon(SEV_ICON[pr.severity])}</span><span class="cell">${escapeHtml(problemText(pr))}</span><span class="cell fix">${escapeHtml(problemFix(pr))}</span><span class="cell el">${icon(pr.target?.section ? 'structure' : pr.target?.track ? 'tracks' : 'songInfo')}<b>${escapeHtml(target)}</b></span></div>`;
    }).join('') : `<p class="problems-empty">${icon('check')}<span>${escapeHtml(t(state.problems.length ? 'bottom.noneFiltered' : 'bottom.none'))}</span></p>`;
  } else if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button" data-command="copyMessages" ${state.log.length ? '' : 'disabled'}>${icon('copy')}<span>${escapeHtml(t('action.copyMessages'))}</span></button><button class="small-button danger" data-command="clearMessages" ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    body = state.log.length ? state.log.map((e, i) => `<div class="problem-row bottom-row log-row ${e.kind === 'error' ? 'error' : e.kind === 'info' ? '' : e.kind}" data-log="${i}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon(SEV_ICON[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.detail.split('\n')[0] ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else {
    const s = song();
    const st = songStats(s);
    const rows = [
      ['songInfo', t('bottom.infoSong'), `${s.title || t('song.untitled')}${s.artist ? ` — ${s.artist}` : ''} · ${t(`genre.${s.genre}`)} · ${t(`mood.${s.mood}`)}`],
      ['keySig', t('bottom.infoKey'), `${keyName(s.key)} · ${s.bpm} BPM · ${s.timeSignature.join('/')}${s.swing ? ` · swing ${Math.round(s.swing * 200)}%` : ''}`],
      ['clock', t('bottom.infoLength'), `${timeLabel(st.seconds)} · ${t('song.bars', { n: st.bars })} · ${t('bottom.sectionsCount', { n: st.sections })}`],
      ['tracks', t('bottom.infoTracks'), s.tracks.map((tr) => `${trackLabel(tr)} ${tr.notes.length}`).join(' · ') || '—'],
      ['lyrics', t('bottom.infoLyrics'), t('bottom.lyricsValue', { lines: st.lines, language: s.language === 'en' ? 'English' : '한국어' })],
      ['aiCompose', t('bottom.infoAi'), `${t(`ai.provider.${s.ai.provider}`, null, s.ai.provider)}${s.ai.model ? ` · ${s.ai.model}` : ''} · ${t('song.seedValue', { n: s.seed })}`],
    ];
    body = rows.map(([glyph, label, value]) => `<div class="problem-row bottom-row info-row"><span class="cell sev">${icon(glyph)}</span><span class="cell"><b>${escapeHtml(label)}</b></span><span class="cell info-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`).join('');
  }
  const scroll = host.querySelector('.problems-list')?.scrollTop ?? 0;
  host.innerHTML = `<div class="problems-header">${tabHtml}${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.hide'))}">${icon('close')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
  host.querySelector('.problems-list').scrollTop = scroll;
}

function revealProblem(id) {
  const pr = state.problems.find((x) => x.id === id);
  if (!pr) return;
  if (pr.target?.section) { selectSection(pr.target.section); state.rightTab = 'section'; renderRight(); const span = sectionSpans(song()).find((x) => x.section.id === pr.target.section); if (span) arrangement?.revealBeat(span.start); }
  if (pr.target?.track) { selectTrack(pr.target.track, { open: pr.target.note != null, beat: pr.target.note ?? null }); state.rightTab = 'track'; renderRight(); }
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const hint = notice?.text ?? (hasSong() ? t(`hint.${state.view}`, null, t('status.ready')) : t('status.ready'));
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  const so = state.showStart ? null : song();
  if (so) {
    items.push(`<span class="status-item ${state.playing ? 'playing' : ''}" title="${escapeHtml(t('status.positionTip'))}">${icon(state.playing ? 'play' : 'clock')}<span id="status-position">${escapeHtml(`${barBeatLabel(state.position, so.timeSignature)} · ${timeLabel(beatsToSeconds(state.position, so.bpm))} / ${timeLabel(beatsToSeconds(songBeats(so), so.bpm))}`)}</span></span>`);
    if (state.view === 'roll') {
      const snap = s.rollSnap ?? 0.25;
      items.push(`<button class="status-item" data-command="snapMenu" title="${escapeHtml(t('action.snapMenu'))}">${icon('snap')}<span>${escapeHtml(t(snap ? `snap.${String(snap).replace('.', '_').slice(0, 6)}` : 'snap.off'))}</span></button>`);
      const n = selectedNotes().length;
      if (n) items.push(`<span class="status-item">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: n }))}</span></span>`);
    }
    items.push(`<span class="status-item" title="${escapeHtml(t('song.key'))}">${icon('keySig')}<span>${escapeHtml(keyName(so.key, { short: true }))} · ${so.bpm}</span></span>`);
    const counts = countBySeverity(state.problems);
    items.push(`<button class="status-item ${counts.error ? 'error-count' : ''}" data-command="showProblems" title="${escapeHtml(t('status.problemsTip'))}">${icon(counts.error ? 'error' : counts.warning ? 'warning' : 'check')}<span>${escapeHtml(t('status.problems', counts))}</span></button>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('compose.providerTip'))}">${icon(providerFor(s) === 'builtin' ? 'aiBuiltin' : providerFor(s) === 'claude' ? 'aiClaude' : 'aiLocal')}<span>${escapeHtml(t(`ai.provider.${providerFor(s)}`))}</span></span>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  const onStart = state.showStart || !state.doc;
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart;
  root.querySelector('#view-host').hidden = onStart;
  if (onStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startHost.innerHTML = ''; renderView(); }
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;
function renderStartPage() {
  const host = root.querySelector('#start-page');
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  if (show) stopPlayback();
  state.showStart = show;
  if (!state.doc) state.showStart = true;
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': return newSongAsk(value);
    case 'open': return openWithDialog();
    case 'import': return importDialog();
    case 'compose': return composeWizard();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'sample': return openSampleAsk(value);
    case 'genre': state.compose.genre = value; return composeWizard();
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'continue': return value ? openRecent(value) : run('open');
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'help-menu': return showMenu(menuItems(MENUS.help), anchorBelow(target), 'help');
    case 'tutorial': return startTutorial();
    case 'guide': return openDocWindow('guide');
    case 'tutorial-doc': return openDocWindow('tutorial');
    case 'tutorial-video': return openDocWindow('video');
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

function examplesMenu(anchor, group = null) {
  const at = anchor ?? anchorBelow(root.querySelector('[data-menu="file"]'));
  const handlers = {};
  if (!group) {
    const items = SAMPLE_GROUPS.map((g) => { handlers[`custom:group:${g.id}`] = () => examplesMenu(at, g.id); return { id: `custom:group:${g.id}`, label: `${g[lang()] ?? g.en} (${SAMPLES.filter((x) => x.group === g.id).length})`, icon: g.icon }; });
    return showMenu(items, at, 'context', { handlers, header: { icon: 'samples', title: t('action.openExample') } });
  }
  const g = SAMPLE_GROUPS.find((x) => x.id === group);
  const items = SAMPLES.filter((x) => x.group === group).map((x) => { handlers[`custom:sample:${x.id}`] = () => openSampleAsk(x.id); return { id: `custom:sample:${x.id}`, label: x[lang()]?.[0] ?? x.en[0], icon: GENRES.find((ge) => ge.id === x.genre)?.icon ?? 'samples' }; });
  return showMenu(items, at, 'context', { handlers, header: { icon: g?.icon ?? 'samples', title: g?.[lang()] ?? t('action.openExample') } });
}

function templateMenu(anchor) {
  const handlers = Object.fromEntries(TEMPLATES.map(([id]) => [`custom:${id}`, () => newSongAsk(id)]));
  return showMenu(TEMPLATES.map(([id, glyph]) => ({ id: `custom:${id}`, label: t(`template.${id}`), icon: glyph })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'template', title: t('action.newFromTemplate') } });
}

function trackMenu(anchor) {
  const handlers = {};
  const groups = [...new Set(INSTRUMENTS.map((i) => i.category))];
  const items = groups.map((cat) => {
    const children = INSTRUMENTS.filter((i) => i.category === cat).map((i) => { handlers[`custom:add:${i.id}`] = () => addTrack(i.id); return { id: `custom:add:${i.id}`, label: lang() === 'en' ? i.en : i.ko, icon: `inst${cat[0].toUpperCase()}${cat.slice(1)}` }; });
    return { id: `custom:cat:${cat}`, label: t(`instcat.${cat}`), icon: `inst${cat[0].toUpperCase()}${cat.slice(1)}`, submenu: true, children };
  });
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'trackAdd', title: t('action.addTrack') } });
}

function snapMenu(anchor) {
  return showMenu(menuItems(SUBMENUS.snap.items), anchor, 'context', { header: { icon: 'snap', title: t('action.snapMenu') } });
}

// ───────────────────────── background (animated / image)

let appBackground = null;
let startBackground = null;

function backgroundColors() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' };
}

function updateBackgroundState() {
  const s = state.settings;
  const layer = root.querySelector('.app-bg');
  if (!layer) return;
  if (!appBackground) appBackground = new AnimatedBackground(layer.querySelector('.anim-bg'), { colors: backgroundColors, speed: () => s.animationSpeed / 100, kind: s.animation });
  appBackground.setKind(s.animation);
  startBackground?.setKind(s.animation);
  const onStart = state.showStart || !state.doc;
  layer.classList.toggle('animated', false);
  appBackground.stop();
  if (onStart && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } }
  else startBackground?.stop();
}

let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !state.doc) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) { startBackgroundChangedAt = Date.now(); updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); startBackground?.setKind(state.settings.animation); }
}
function shuffleBackground() { const next = (startBackground ?? appBackground)?.shuffle() ?? ANIMATIONS[0]; updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(state.settings); } catch (error) { state.backgroundUrl = null; showError('error.background', error); }
  updateBackgroundState();
  if (state.showStart || !state.doc) renderStartPage();
}
async function chooseBackground() {
  try {
    if (desktop) { const path = await native.chooseImage(state.settings.lastDirectory); if (path) { const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op)); updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image' }); await loadBackground(); } }
    else { const [file] = await native.pickWithInput('image/*'); if (file) { await native.storeWebBackground(file); updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' }); await loadBackground(); } }
  } catch (error) { showError('error.background', error); }
}
async function removeBackground() { await native.clearBackground(); state.backgroundUrl = null; updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: state.settings.backgroundKind === 'image' ? 'animated' : 'none' }); }

// ───────────────────────── settings, theme

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if (quiet) return;
  applySettings(previous);
}

function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
    const panel = root.querySelector('#right-panel');
    if (panel) panel.innerHTML = '';
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if (s.masterVolume !== previous.masterVolume) player.setVolume(s.masterVolume / 100);
  player.metronome = s.metronome;
  renderAll();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── progress popup

const progressJobs = [];
async function withProgress(titleKey, name, task, { delay = 250, cancellable = false } = {}) {
  const op = `op-${newId()}`;
  let shown = false;
  let last = null;
  const signal = { cancelled: false, onCancel: null };
  const job = { op, reopen: null };
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), icon: PROGRESS_ICONS[titleKey] ?? 'hourglass', nameIcon: PROGRESS_NAME_ICONS[titleKey] ?? 'file', name, op, last, cancellable, delay: wait }, { delay: wait }).then((r) => { if (r?.cancel) { signal.cancelled = true; signal.onCancel?.(); } }); };
  job.reopen = () => show(0);
  progressJobs.push(job);
  let timer = null;
  if (delay <= 0) { const drawn = popups.whenDrawn('progress'); show(0); await drawn; }
  else if (desktop && !popups.useFrames) show(delay);
  else if (popups.useFrames) { const drawn = popups.whenDrawn('progress', 400); show(delay); await drawn; await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))); }
  else timer = setTimeout(() => show(0), delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  popups.on(`cancel:${op}`, () => { signal.cancelled = true; signal.onCancel?.(); });
  try {
    return await task(op, (progress) => {
      last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '', icon: progress.icon ?? last?.icon ?? null };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    progressJobs.splice(progressJobs.indexOf(job), 1);
    popups.actions.delete(`cancel:${op}`);
    if (shown) {
      popups.post('progress', { type: 'done' });
      const outer = progressJobs.at(-1);
      setTimeout(() => { if (progressJobs.at(-1) !== outer) return; if (outer) outer.reopen(); else popups.hide('progress'); }, 600);
    }
  }
}

// ───────────────────────── files

function rememberRecent(entry) {
  state.recent = addRecent(loadRecent(globalThis.localStorage), entry);
  storeRecent(globalThis.localStorage, state.recent);
  if (!entry.web) rememberDirectory(directoryOf(entry.path));
}
function rememberDirectory(dir) {
  if (!dir) return;
  state.recentDirs = addRecent(loadRecentDirs(globalThis.localStorage), { path: dir });
  storeRecentDirs(globalThis.localStorage, state.recentDirs);
  if (state.settings.lastDirectory !== dir) updateSettings({ lastDirectory: dir }, { quiet: true });
}

async function readBytes(path, op) {
  const b64 = await native.readBase64File(path, op);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bytes of any supported file → a song (MIDI is imported; lyrics go into the open song). */
async function openBytes(name, bytes, { path = null, handle = null, quiet = false } = {}) {
  if (isLyricsName(name)) return importLyricsText(new TextDecoder().decode(bytes), name);
  if (!(await confirmReplace())) return null;
  try {
    const s = isMidiName(name) ? midiToSong(bytes, { title: stripExtension(baseName(name)) }) : unpackSong(bytes);
    const d = new Doc(s, { path: isMidiName(name) ? null : path, name: isMidiName(name) ? `${stripExtension(baseName(name))}` : baseName(name), handle: isMidiName(name) ? null : handle });
    if (isMidiName(name)) d.revision = 1;
    setDoc(d);
    if (!isMidiName(name)) rememberRecent(path ? { path, title: s.title } : { path: name, title: s.title, web: true });
    if (!quiet) notify('success', t(isMidiName(name) ? 'notice.midiImported' : 'notice.opened', { name: baseName(name), tracks: s.tracks.length }));
    return d;
  } catch (error) { showError('error.open', error, path ?? name); return null; }
}

async function openPath(path, options = {}) {
  try {
    const bytes = await withProgress('progress.open', baseName(path), (op) => readBytes(path, op));
    return await openBytes(baseName(path), bytes, { ...options, path });
  } catch (error) { showError('error.open', error, path); return null; }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseDiagramsToOpen(directory ?? state.settings.lastDirectory);
      if (paths[0]) await openPath(paths[0]);
    } else {
      const files = await native.pickDiagramFilesWeb();
      if (files[0]) await openBytes(files[0].name, files[0].content instanceof Uint8Array ? files[0].content : new TextEncoder().encode(files[0].content), { handle: files[0].handle });
    }
  } catch (error) { showError('error.open', error); }
}

async function importDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseFiles(state.settings.lastDirectory, native.IMPORT_FILTERS(), false);
      if (paths[0]) await openPath(paths[0]);
    } else {
      const [file] = await native.pickWithInput('.mid,.midi,.kar,.txt,.lrc,.mam,.json');
      if (file) await openBytes(file.name, new Uint8Array(await file.arrayBuffer()));
    }
  } catch (error) { showError('error.import', error); }
}

/** A lyrics file (.txt / .lrc) into the open song (a new song when none is open). */
function importLyricsText(text, name) {
  if (!song()) newSong('empty');
  const clean = String(text).split(/\r?\n/).map((l) => l.replace(/^\[\d+:\d+(?:\.\d+)?\]/, '').trim()).filter((l) => l && !/^\[(ti|ar|re|al|by|offset):/i.test(l)).join('\n');
  const s = song();
  let map = parseLyricsText(clean, s.sections, sectionName);
  if (!Object.keys(map).length) {
    const lines = clean.split('\n');
    map = {};
    let at = 0;
    for (const sec of s.sections) { const n = SECTION_DEFAULTS[sec.type].lines; if (n) { map[sec.id] = lines.slice(at, at + n); at += n; } }
  }
  change('op.lyrics', (x) => {
    ensureVocal(x);
    for (const sec of x.sections) if (map[sec.id]?.length) { sec.lyrics = map[sec.id]; fitMelody(x, sec, newSeed()); }
  });
  notify('success', t('notice.lyricsImported', { name }));
}

async function openRecent(path) {
  const item = state.recent.find((entry) => entry.path === path);
  if (item?.web || !desktop) {
    const handle = await native.loadWebHandle(path);
    if (handle?.getFile) {
      try { if ((await handle.queryPermission?.({ mode: 'read' })) !== 'granted') await handle.requestPermission?.({ mode: 'read' }); const file = await handle.getFile(); return openBytes(file.name, new Uint8Array(await file.arrayBuffer()), { handle }); } catch (error) { return showError('error.open', error, path); }
    }
    return notify('info', t('notice.webRecent'));
  }
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    const choice = await ask({ icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage', { path }), buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.removeEntry'), icon: 'trash', primary: true }] });
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderAll(); }
    return null;
  }
  return openPath(path);
}

function clearRecentAll() { state.recent = []; state.recentDirs = []; storeRecent(globalThis.localStorage, []); storeRecentDirs(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); renderAll(); }

async function recentFoldersMenu(anchor) {
  const items = state.recentDirs.length ? state.recentDirs.map((item, index) => ({ id: `custom:dir:${index}`, label: item.path, icon: 'folder' })) : [{ id: 'none', label: t('recent.noFolders'), icon: 'info', disabled: true }];
  const handlers = Object.fromEntries(state.recentDirs.map((item, index) => [`custom:dir:${index}`, () => openWithDialog(item.path)]));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'recentFolder', title: t('action.recentFolders') } });
}

const safeName = () => fileSafe(doc()?.path ? stripExtension(baseName(doc().path)) : song()?.title || docName() || 'song');

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

async function saveDoc({ saveAs = false } = {}) {
  const d = doc();
  if (!d) return false;
  const suggested = `${safeName()}.mam`;
  try {
    const bytes = packSong(d.song);
    if (desktop) {
      let path = d.path;
      if (!path || saveAs) {
        const dir = d.path ? directoryOf(d.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['mam']);
        if (!path) return false;
        path = withExtension(path, 'mam');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeBase64File(path, bytesToBase64(bytes), op));
      d.path = path; d.name = null;
      rememberRecent({ path, title: d.song.title });
    } else {
      const saved = await native.saveFileWeb(new Blob([bytes], { type: 'application/zip' }), { name: suggested, handle: d.handle, saveAs: saveAs || !d.handle, mime: 'application/zip' });
      if (!saved) return false;
      d.handle = saved.handle; d.name = saved.name;
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: d.song.title, web: true });
    }
    d.markSaved();
    persistSession();
    renderTitleProject();
    notify('success', t('notice.saved', { name: docName(d) }));
    return true;
  } catch (error) { showError('error.save', error, d.path ?? docName(d)); return false; }
}

async function closeSong({ force = false } = {}) {
  if (!state.doc) return true;
  if (!force && !(await confirmReplace())) return false;
  stopPlayback();
  state.doc = null;
  state.showStart = true;
  persistSession();
  renderAll();
  return true;
}

/** Writes bytes the user names (desktop: a save dialog; web: a download or the save picker). */
async function saveExport(name, type, bytes, mime = 'application/octet-stream') {
  if (desktop) {
    const dir = state.settings.lastDirectory;
    let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
    if (!path) return null;
    path = withExtension(path, type);
    await withProgress('progress.save', baseName(path), (op) => native.writeBase64File(path, bytesToBase64(bytes), op));
    rememberDirectory(directoryOf(path));
    notify('success', t('notice.exported', { name: baseName(path) }));
    return path;
  }
  const saved = await native.saveFileWeb(new Blob([bytes], { type: mime }), { name, saveAs: true, mime });
  if (saved) notify('success', t('notice.exported', { name: saved.name }));
  return saved?.name ?? null;
}

async function exportAudioDialog({ stems = false } = {}) {
  const s = song();
  if (!s) return;
  stopPlayback();
  const result = await popups.open('exportaudio', { stems, sampleRate: state.settings.exportSampleRate, bits: state.settings.exportBits, normalize: state.settings.exportNormalize, hasLoop: s.loop.end > s.loop.start, section: state.section ? sectionName(selectedSection()) : '', tracks: s.tracks.map((tr) => ({ id: tr.id, name: trackLabel(tr), color: tr.color })) });
  if (!result?.ok) return;
  updateSettings({ exportSampleRate: result.sampleRate, exportBits: result.bits, exportNormalize: result.normalize }, { quiet: true });
  let start = 0;
  let end = songBeats(s);
  if (result.range === 'loop' && s.loop.end > s.loop.start) { start = s.loop.start; end = s.loop.end; }
  if (result.range === 'section') { const span = sectionSpans(s).find((x) => x.section.id === state.section); if (span) { start = span.start; end = span.end; } }
  const base = safeName();
  try {
    const jobs = result.stems ? s.tracks.filter((tr) => !result.exclude?.includes(tr.id)).map((tr) => ({ name: `${base} - ${fileSafe(trackLabel(tr))}.wav`, tracks: [tr.id] })) : [{ name: `${base}.wav`, tracks: result.exclude?.length ? s.tracks.filter((tr) => !result.exclude.includes(tr.id)).map((tr) => tr.id) : null }];
    const files = await withProgress('progress.export', jobs.length > 1 ? t('export.stemsName', { n: jobs.length }) : jobs[0].name, async (op, report, signal) => {
      const out = [];
      for (const [i, job] of jobs.entries()) {
        report({ fraction: i / jobs.length, text: t(jobs.length > 1 ? 'progress.step.stem' : 'progress.step.render', { name: job.name }), icon: PROGRESS_STEP_ICONS['progress.step.render'] });
        const buffer = await renderSong(s, { sampleRate: result.sampleRate, start, end, tracks: job.tracks, tail: result.tail ?? 2.5, signal, onProgress: (f) => report({ fraction: (i + f * 0.9) / jobs.length, text: t('progress.step.render', { name: job.name }), icon: PROGRESS_STEP_ICONS['progress.step.render'] }) });
        report({ fraction: (i + 0.95) / jobs.length, text: t('progress.step.encode'), icon: PROGRESS_STEP_ICONS['progress.step.encode'] });
        out.push({ name: job.name, bytes: audioBufferToWav(buffer, { bits: result.bits, normalize: result.normalize }) });
      }
      return out;
    }, { delay: 0, cancellable: true });
    if (files.length === 1) await saveExport(files[0].name, 'wav', files[0].bytes, 'audio/wav');
    else if (desktop) {
      const dir = await native.chooseFolder(state.settings.lastDirectory);
      if (!dir) return;
      await withProgress('progress.save', dir, async (op) => { for (const f of files) await native.writeBase64File(`${dir}/${f.name}`, bytesToBase64(f.bytes), op); });
      rememberDirectory(dir);
      notify('success', t('notice.stemsExported', { n: files.length, dir }));
    } else {
      const { zipSync } = await import('fflate');
      const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, [f.bytes, { level: 0 }]])));
      await saveExport(`${base} - stems.zip`, 'zip', zip, 'application/zip');
    }
  } catch (error) { showError('error.export', error); }
}

async function exportMidi() {
  try { await saveExport(`${safeName()}.mid`, 'mid', songToMidi(song(), { labels: sectionName }), 'audio/midi'); } catch (error) { showError('error.export', error); }
}

async function exportText(kind) {
  const s = song();
  const enc = new TextEncoder();
  try {
    if (kind === 'txt') await saveExport(`${safeName()}.txt`, 'txt', enc.encode(lyricsToText(s, sectionName)), 'text/plain');
    else if (kind === 'lrc') await saveExport(`${safeName()}.lrc`, 'lrc', enc.encode(lyricsToLrc(s, sectionName)), 'text/plain');
    else if (kind === 'chords') await saveExport(`${safeName()} - chords.txt`, 'txt', enc.encode(chordChart(s, sectionName, t)), 'text/plain');
    else await saveExport(`${safeName()}.json`, 'json', enc.encode(JSON.stringify(s, null, 2)), 'application/json');
  } catch (error) { showError('error.export', error); }
}

/** The AI / model picker of the AI Compose panel: the choice goes to the settings at once. */
function pickAi(target) {
  const patch = pickPatch(target, state.settings);
  if (!patch) return;
  const { openSettings, ...change } = patch;
  updateSettings(change);
  const s = state.settings;
  notify('info', t('notice.aiPicked', { name: t(`ai.provider.${s.aiProvider}`), model: modelOf(s) || '-' }));
  if (openSettings) popups.open('settings', { tab: 'ai' });
}

/** Asks Ollama which models it has (the model menus list them). */
async function refreshOllamaModels() {
  try {
    const models = await listOllamaModels(state.settings);
    updateSettings({ ollamaModels: models });
    notify(models.length ? 'success' : 'warning', models.length ? t('notice.ollamaModels', { count: models.length }) : t('notice.ollamaNoModels'));
  } catch (error) { showError('error.ollamaModels', error, state.settings.ollamaUrl); }
}

/** The AI song wizard (a popup with every choice); its answer composes the song. */
async function composeWizard() {
  const result = await popups.open('compose', { draft: state.compose, provider: providerFor(state.settings) });
  if (!result?.ok) return null;
  state.compose = { ...state.compose, ...result.draft };
  if (state.compose.language !== state.settings.lyricLanguage) updateSettings({ lyricLanguage: state.compose.language }, { quiet: true });
  renderLeft();
  return aiCompose();
}

// ───────────────────────── confirmation & exit

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!doc()?.dirty) return true;
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: [docName()], buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

// ───────────────────────── menus (popup windows)

const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() {
  if (screenOffset.measured) return;
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  screenOffset.x = window.screenX + border;
  screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
}
window.addEventListener('pointermove', (event) => { if (!event.isTrusted) return; screenOffset.x = event.screenX - event.clientX; screenOffset.y = event.screenY - event.clientY; screenOffset.measured = true; }, { passive: true });
function toScreen(x, y) { if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y }; estimateOffset(); return { x: screenOffset.x + x, y: screenOffset.y + y }; }
function anchorBelow(element) { const rect = element.getBoundingClientRect(); const point = toScreen(rect.left, rect.bottom + 2); return { ...point, flipY: toScreen(rect.left, rect.top - 2).y }; }
const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : shortcutOf(id), disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
}

function shortcutOf(id) {
  const s = SHORTCUTS.find(([, , cmd]) => cmd === id);
  if (!s) return '';
  return keyLabel(`Ctrl+${s[1] ? 'Shift+' : ''}${s[0].length === 1 ? s[0].toUpperCase() : s[0]}`);
}

function withChildren(items, handlers, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || item.children || depth > 3) return item;
    const key = item.id.slice('submenu:'.length);
    const children = SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'appIcon', title: 'MyAudioMaker' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items, context.handlers);
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    const at = result.at ?? anchor;
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  if (kind === 'section') {
    const sec = song()?.sections.find((x) => x.id === payload.id);
    const handlers = { 'custom:play': () => { const span = sectionSpans(song()).find((x) => x.section.id === payload.id); if (span) { seek(span.start); play(span.start); } }, 'custom:lyrics': () => selectSection(payload.id, { open: true }) };
    return showMenu([{ id: 'custom:play', label: t('section.playFrom'), icon: 'play', disabled: !sec }, { id: 'custom:lyrics', label: t('section.editLyrics'), icon: 'lyrics', disabled: !sec }, { separator: true }, ...menuItems([sub('regenerate'), 'fitMelody', 'loopSection', '-', sub('addSection'), 'duplicateSection', 'sectionUp', 'sectionDown', 'deleteSection'])], anchor, 'context', { handlers, header: { icon: 'structure', title: sec ? sectionName(sec) : t('outline.sections') } });
  }
  if (kind === 'track') {
    const tr = song()?.tracks.find((x) => x.id === payload.id);
    const handlers = { 'custom:mute': () => toggleTrack(payload.id, 'mute'), 'custom:solo': () => toggleTrack(payload.id, 'solo'), 'custom:roll': () => selectTrack(payload.id, { open: true, beat: payload.beat ?? null }) };
    return showMenu([{ id: 'custom:roll', label: t('action.openRoll'), icon: 'pianoRoll' }, { id: 'custom:mute', label: t('track.mute'), icon: 'mute', checked: tr?.mute }, { id: 'custom:solo', label: t('track.solo'), icon: 'solo', checked: tr?.solo }, { separator: true }, ...menuItems(['addTrack', 'duplicateTrack', 'deleteTrack'])], anchor, 'context', { handlers, header: { icon: 'tracks', title: tr ? trackLabel(tr) : t('outline.tracks') } });
  }
  if (kind === 'notes') return showMenu(menuItems(['cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', 'quantize', sub('transpose'), '-', 'tool:select', 'tool:draw', 'tool:erase', sub('snap'), 'ghosts']), anchor, 'context', { header: { icon: 'notesIcon', title: t('view.roll') } });
  if (kind === 'arrangement') return showMenu(menuItems(['play', 'loop', '-', sub('addSection'), 'addTrack', '-', 'zoomIn', 'zoomOut', 'zoomFit']), anchor, 'context', { header: { icon: 'arrangement', title: t('view.arrangement') } });
  if (kind === 'instrument') {
    const handlers = { 'custom:preview': () => previewInstrument(payload.id), 'custom:add': () => addTrack(payload.id), 'custom:use': () => setTrackInstrument(state.track, payload.id) };
    return showMenu([{ id: 'custom:preview', label: t('library.preview'), icon: 'play' }, { id: 'custom:add', label: t('library.addTrack'), icon: 'trackAdd', disabled: !hasSong() }, { id: 'custom:use', label: t('library.useOnTrack'), icon: 'swap', disabled: !selectedTrack() }], anchor, 'context', { handlers, header: { icon: 'instKeys', title: lang() === 'en' ? instrument(payload.id).en : instrument(payload.id).ko } });
  }
  if (kind === 'problem') {
    const pr = state.problems.find((x) => x.id === payload.id);
    const handlers = { 'custom:reveal': () => revealProblem(payload.id), 'custom:copy': () => native.clipboardWrite(`${problemText(pr)}\n${t('bottom.fix')}: ${problemFix(pr)}`).then(() => notify('success', t('notice.copiedText'))) };
    return showMenu([{ id: 'custom:reveal', label: t('bottom.reveal'), icon: 'goTo', disabled: !pr?.target }, { id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !pr }, { separator: true }, ...menuItems(['checkNow', 'bottomPanel'])], anchor, 'context', { handlers, header: { icon: 'warning', title: pr ? problemFix(pr) : t('bottom.problems') } });
  }
  if (kind === 'log') {
    const e = state.log[payload.index];
    const handlers = { 'custom:copy': () => native.clipboardWrite(logLine(e)).then(() => notify('success', t('notice.copiedText'))) };
    return showMenu([{ id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !e }, { separator: true }, ...menuItems(['copyMessages', 'clearMessages', '-', 'bottomPanel'])], anchor, 'context', { handlers, header: { icon: 'info', title: t('bottom.messages') } });
  }
  if (kind === 'bottom') return showMenu(menuItems(['showProblems', 'showMessages', 'checkNow', '-', 'copyMessages', 'clearMessages', '-', 'bottomPanel']), anchor, 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('menu.view') } });
  if (kind === 'start') return showMenu(menuItems(['new', 'aiWizard', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'play', 'stop', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'appIcon', title: 'MyAudioMaker' } });
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const text = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, text ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
  };
  const hasSel = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !hasSel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !hasSel },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, { separator: true }, { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll' },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

function previewInstrument(id) {
  const inst = instrument(id);
  try { player.previewPhrase(id, inst.drums ? 'drums' : inst.vocal ? 'vocal' : inst.category === 'bass' ? 'bass' : 'melodic'); } catch (error) { showError('error.audio', error); }
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) { globalThis.open(url, `myaudiomaker-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function openDocFrame(kind, url) {
  const key = docLabel(kind);
  let frame = popups.frames.get(key);
  if (!frame) { frame = document.createElement('div'); frame.className = `web-popup web-popup-doc web-popup-${key}`; frame.dataset.kind = key; frame.innerHTML = `<iframe title="${escapeHtml(key)}" src="${escapeHtml(url)}"></iframe>`; document.body.append(frame); popups.frames.set(key, frame); }
  return frame;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

function setDropActive(active) {
  root.classList.toggle('drop-active', active);
  const label = root.querySelector('.drop-overlay span');
  if (label) label.textContent = t('drop.hint');
}

async function handleDroppedPaths(paths) {
  const path = paths.find((p) => isSongName(p) || isMidiName(p) || isLyricsName(p));
  if (path) await openPath(path);
  else if (paths.length) notify('error', t('notice.dropUnsupported'));
}
async function handleDroppedFiles(files) {
  const file = files.find((f) => isSongName(f.name) || isMidiName(f.name) || isLyricsName(f.name));
  if (file) await openBytes(file.name, new Uint8Array(await file.arrayBuffer()));
  else if (files.length) notify('error', t('notice.dropUnsupported'));
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart || !state.doc);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const toolbarMore = target.closest('[data-toolbar-more]');
    if (toolbarMore) return showToolbarMore(toolbarMore);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'exportMenu', 'regenerateMenu', 'recentFolders', 'newFromTemplate', 'openExample', 'addTrack', 'snapMenu', 'addSectionMenu'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const viewTab = target.closest('[data-view]');
    if (viewTab) return setView(viewTab.dataset.view);
    const chip = target.closest('[data-song-chip]');
    if (chip) { state.rightTab = 'song'; if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true }); renderRight(); root.querySelector(`#editors [data-${chip.dataset.songChip === 'key' ? 'song="tonic"' : chip.dataset.songChip === 'bpm' ? 'stepper="song:bpm"' : 'song="timeSignature"'}]`)?.focus?.(); return undefined; }
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab) { state.leftTab = leftTab.dataset.leftTab; return renderLeft(); }
    const editorTab = target.closest('[data-editor-tab]');
    if (editorTab) { state.rightTab = editorTab.dataset.editorTab; return renderRight(); }
    const theme = target.closest('[data-compose-theme]');
    if (theme) { state.compose.theme = state.compose.theme === theme.dataset.composeTheme ? null : theme.dataset.composeTheme; return renderLeft(); }
    const langSeg = target.closest('[data-compose-language]');
    if (langSeg) { state.compose.language = langSeg.dataset.composeLanguage; updateSettings({ lyricLanguage: state.compose.language }, { quiet: true }); return renderLeft(); }
    if (target.closest('[data-compose-dice]')) { state.compose.seed = newSeed(); return renderLeft(); }
    if (target.closest('[data-ai-refresh]')) { refreshOllamaModels(); return undefined; }
    if (target.closest('[data-lyrics-staff-toggle]')) { updateSettings({ lyricsStaff: state.settings.lyricsStaff === false }, { quiet: true }); renderView(); return undefined; }
    const songLang = target.closest('[data-song-language]');
    if (songLang) return setField('song', 'language', songLang.dataset.songLanguage);
    const instCat = target.closest('[data-inst-category]');
    if (instCat) { state.instrumentCategory = instCat.dataset.instCategory; return renderLeft(); }
    const instPreview = target.closest('[data-inst-preview]');
    if (instPreview) return previewInstrument(instPreview.dataset.instPreview);
    const instUse = target.closest('[data-inst-use]');
    if (instUse) { if (selectedTrack()) return setTrackInstrument(state.track, instUse.dataset.instUse); return addTrack(instUse.dataset.instUse); }
    const instCard = target.closest('[data-instrument]');
    if (instCard) { previewInstrument(instCard.dataset.instrument); if (event.detail === 2 && hasSong()) { if (selectedTrack()) setTrackInstrument(state.track, instCard.dataset.instrument); else addTrack(instCard.dataset.instrument); } return undefined; }
    const addSec = target.closest('[data-add-section]');
    if (addSec) return addSection(addSec.dataset.addSection);
    const applyForm = target.closest('[data-apply-structure]');
    if (applyForm) return applyStructure(applyForm.dataset.applyStructure);
    const olSection = target.closest('[data-ol-section]');
    if (olSection && !target.closest('button')) { selectSection(olSection.dataset.olSection, { open: event.detail === 2 }); state.rightTab = 'section'; const span = sectionSpans(song()).find((x) => x.section.id === olSection.dataset.olSection); if (span) arrangement?.revealBeat(span.start); return renderRight(); }
    const up = target.closest('[data-section-up]');
    if (up) return moveSection(Number(up.dataset.sectionUp), -1);
    const down = target.closest('[data-section-down]');
    if (down) return moveSection(Number(down.dataset.sectionDown), 1);
    const mute = target.closest('[data-track-mute]');
    if (mute) return toggleTrack(mute.dataset.trackMute, 'mute');
    const solo = target.closest('[data-track-solo]');
    if (solo) return toggleTrack(solo.dataset.trackSolo, 'solo');
    const olTrack = target.closest('[data-ol-track]');
    if (olTrack && !target.closest('button')) { selectTrack(olTrack.dataset.olTrack, { open: event.detail === 2 }); state.rightTab = 'track'; return renderRight(); }
    const regen = target.closest('[data-regenerate]');
    if (regen) return regenerate(regen.dataset.regenerate);
    const lyricPlay = target.closest('[data-lyric-play]');
    if (lyricPlay) { const span = sectionSpans(song()).find((x) => x.section.id === lyricPlay.dataset.lyricPlay); if (span) play(span.start); return undefined; }
    const lyricAi = target.closest('[data-lyric-ai]');
    if (lyricAi) return aiLyrics(lyricAi.dataset.lyricAi);
    const lyricFitBtn = target.closest('[data-lyric-fit]');
    if (lyricFitBtn) return fitSelectedMelody(lyricFitBtn.dataset.lyricFit);
    const lyricCard = target.closest('[data-lyric-section]');
    if (lyricCard && !target.closest('textarea, button')) { state.section = lyricCard.dataset.lyricSection; for (const c of root.querySelectorAll('.lyric-card')) c.classList.toggle('selected', c === lyricCard); return renderRight(); }
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    const problemFilter = target.closest('[data-problem-filter]');
    if (problemFilter) { state.problemFilter = problemFilter.dataset.problemFilter; return renderBottom(); }
    const problemRow = target.closest('[data-problem]');
    if (problemRow) return revealProblem(problemRow.dataset.problem);
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.aiPick) return pickAi(target);
    if (target.dataset.compose) {
      const key = target.dataset.compose;
      state.compose[key] = key === 'tonic' ? (target.value === 'auto' ? null : Number(target.value)) : key === 'mode' && target.value === 'auto' ? null : target.value;
      if (key === 'genre') { const g = GENRES.find((x) => x.id === target.value); if (g?.timeSignature?.[0] === 3 && state.compose.structure === 'kpop') state.compose.structure = 'short'; }
      return renderLeft();
    }
    if ('composeAutoBpm' in target.dataset) { state.compose.bpm = target.checked ? null : Math.round((GENRES.find((g) => g.id === state.compose.genre).bpm[0] + GENRES.find((g) => g.id === state.compose.genre).bpm[1]) / 2); return renderLeft(); }
    if ('composeSeed' in target.dataset) { state.compose.seed = Math.max(1, Math.round(Number(target.value) || newSeed())); return undefined; }
    if ('composeNotes' in target.dataset) { state.compose.notes = target.value; return undefined; }
    if (target.id === 'compose-topic') { state.compose.topic = target.value; return undefined; }
    if (target.dataset.song) return setField('song', target.dataset.song, target.value, target);
    if (target.dataset.songRange) return setField('song', target.dataset.songRange, target.value, target);
    if (target.dataset.sectionField) return setField('section', target.dataset.sectionField, target.value, target);
    if (target.dataset.sectionRange) return setField('section', target.dataset.sectionRange, target.value, target);
    if (target.dataset.trackField) return setField('track', target.dataset.trackField, target.value, target);
    if (target.dataset.trackRange) return setField('track', target.dataset.trackRange, target.value, target);
    if (target.dataset.noteField) return setField('note', target.dataset.noteField, target.value, target);
    if (target.dataset.noteRange) return setField('note', 'velocity', target.value, target);
    if (target.dataset.mixRange) return change('op.mix', (x) => { x.mix[target.dataset.mixRange] = Number(target.value); });
    if (target.dataset.mixToggle) return change('op.mix', (x) => { x.mix[target.dataset.mixToggle] = target.checked; });
    if (target.dataset.stripVolume) return setTrackVolume(target.dataset.stripVolume, Number(target.value), true);
    if (target.dataset.lyrics) return setLyrics(target.dataset.lyrics, target.value);
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'compose-topic') state.compose.topic = target.value;
    if (target.id === 'instrument-search') {
      clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = setTimeout(() => { state.instrumentQuery = target.value; const pos = target.selectionStart; renderLeft(); const input = root.querySelector('#instrument-search'); input?.focus(); input?.setSelectionRange(pos, pos); }, 150);
    }
    const out = target.matches?.('input[type="range"]') ? target.parentElement?.querySelector('output') : null;
    if (out && (target.dataset.trackRange || target.dataset.mixRange || target.dataset.sectionRange || target.dataset.songRange || target.dataset.noteRange)) {
      const v = Number(target.value);
      out.textContent = target.dataset.trackRange === 'pan' ? (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`) : target.dataset.songRange === 'swing' ? `${Math.round(v * 200)}%` : target.dataset.noteRange ? String(Math.round(v * 100)) : `${Math.round(v * 100)}%`;
      // Live while dragging: the mix follows without an undo step for each move.
      const s = song();
      if (target.dataset.trackRange && selectedTrack()) { selectedTrack()[target.dataset.trackRange] = v; player.update(s); }
      if (target.dataset.mixRange) { s.mix[target.dataset.mixRange] = v; player.update(s); }
    }
    if (target.dataset.stripVolume) { const tr = song()?.tracks.find((x) => x.id === target.dataset.stripVolume); if (tr) { if (state.dragVolume == null) state.dragVolume = tr.volume; tr.volume = Number(target.value); player.update(song()); } }
    if (target.dataset.lyrics) {
      const counts = target.parentElement.querySelector('.lyric-counts');
      if (counts) counts.innerHTML = target.value.split('\n').map((line) => `<span class="lyric-count">${[...line.replace(/[^\p{L}\p{N}]/gu, '')].length ? escapeHtml(String(syllablesOf(line))) : ''}</span>`).join('');
    }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.matches?.('#editors input[type="text"], .compose input[type="text"]') && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); event.target.blur(); }
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const problemRow = event.target.closest('[data-problem]');
    if (problemRow) return contextMenu(event, 'problem', { id: problemRow.dataset.problem });
    const logRow = event.target.closest('[data-log]');
    if (logRow) return contextMenu(event, 'log', { index: Number(logRow.dataset.log) });
    if (event.target.closest('#bottom-panel')) return contextMenu(event, 'bottom');
    const sec = event.target.closest('[data-ol-section], [data-lyric-section]');
    if (sec) { const id = sec.dataset.olSection ?? sec.dataset.lyricSection; state.section = id; return contextMenu(event, 'section', { id }); }
    const tr = event.target.closest('[data-ol-track]');
    if (tr) { state.track = tr.dataset.olTrack; return contextMenu(event, 'track', { id: tr.dataset.olTrack }); }
    const inst = event.target.closest('[data-instrument]');
    if (inst) return contextMenu(event, 'instrument', { id: inst.dataset.instrument });
    if (event.target.closest('#left-panel, #right-panel')) return contextMenu(event, 'panel');
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    return contextMenu(event, 'default');
  });

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(700, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) updateSettings({ [key]: state.settings[key] }, { quiet: true }); },
    });
  }));

  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!state.settings.showBottomPanel) return;
    event.preventDefault();
    const start = state.settings.bottomHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, start - dy)); root.style.setProperty('--bottom-height', `${h}px`); state.settings.bottomHeight = Math.round(h); },
      end: (e, moved) => { if (moved) updateSettings({ bottomHeight: state.settings.bottomHeight }, { quiet: true }); },
    });
  });

  root.querySelector('#menubar')?.addEventListener('mousedown', (event) => {
    if (!desktop || event.button !== 0 || !event.target.closest?.('[data-window-drag]')) return;
    event.preventDefault();
    if (event.detail === 2) appWindow?.toggleMaximize().catch(() => {});
    else native.invoke('window_drag', {}).catch(() => {});
  });
  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    native.invoke('window_drag', { edge: 'SouthEast' }).catch(() => appWindow?.startResizeDragging('SouthEast').catch(() => {}));
  });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 680).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) { state.recent = loadRecent(globalThis.localStorage); state.recentDirs = loadRecentDirs(globalThis.localStorage); if (state.showStart || !state.doc) renderStartPage(); }
  });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => { event.preventDefault(); depth = 0; setDropActive(false); handleDroppedFiles([...(event.dataTransfer?.files ?? [])]); });
    window.addEventListener('beforeunload', (event) => { if (doc()?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  }

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

function syllablesOf(line) { return [...String(line).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()].filter((ch) => /[가-힣]/.test(ch)).length || String(line).trim().split(/\s+/).filter(Boolean).length; }

/** Replaces the song's sections with a form (the music in kept sections stays; new ones are written). */
async function applyStructure(id) {
  const form = structureOf(id).sections;
  const choice = await ask({ icon: 'structure', title: t('sections.applyTitle'), message: t('sections.applyMessage'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('sections.apply'), icon: 'check', primary: true }] });
  if (choice !== 'ok') return;
  change('op.structure', (x) => {
    const fresh = compose({ genre: x.genre, mood: x.mood, key: x.key, bpm: x.bpm, sections: form, language: x.language, seed: newSeed(), topic: x.topic });
    // The band stays: instruments and mix of the tracks with the same role.
    for (const tr of fresh.tracks) { const old = x.tracks.find((o) => o.role === tr.role); if (old) Object.assign(tr, { instrument: old.instrument, volume: old.volume, pan: old.pan, reverb: old.reverb, name: old.name, color: old.color, mute: old.mute, solo: old.solo }); }
    x.sections = fresh.sections;
    x.tracks = fresh.tracks;
  });
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['p', false, 'print'], ['w', false, 'closeProject'], ['i', false, 'importAny'],
  ['e', false, 'exportAudio'], ['e', true, 'exportMidi'], ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'], ['d', false, 'duplicate'],
  ['a', false, 'selectAll'], ['g', false, 'aiCompose'], ['g', true, 'aiWizard'], ['l', false, 'aiLyrics'], ['r', true, 'regen:all'], ['m', false, 'fitMelody'],
  [',', false, 'settings'], ['l', true, 'language'], ['1', true, 'leftPanel'], ['2', true, 'rightPanel'], ['j', false, 'bottomPanel'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['r', false, 'recent'], ['q', false, 'exit'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomFit'], ['arrowup', true, 'transposeUp'], ['arrowdown', true, 'transposeDown'],
];
const LETTERS = Object.fromEntries(Object.entries(commands).filter(([, c]) => c.key && /^[A-Z]$|^Space$/.test(c.key)).map(([id, c]) => [c.key.toLowerCase().replace('space', ' '), id]));
const VIEW_KEYS = { 1: 'arrangement', 2: 'roll', 3: 'lyrics', 4: 'sheet' };

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (key === 'f5') { event.preventDefault(); run('play'); return; }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (!hasSong()) return;
  if (key === ' ') { event.preventDefault(); togglePlay(); return; }
  if (key === 'enter') { event.preventDefault(); stopPlayback(); seek(0); return; }
  if (key === 'home') { event.preventDefault(); seek(0); return; }
  if (key === 'end') { event.preventDefault(); seek(songBeats(song())); return; }
  if (VIEW_KEYS[key] && !event.shiftKey) { event.preventDefault(); setView(VIEW_KEYS[key]); return; }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === 'escape') { event.preventDefault(); if (state.playing) stopPlayback(); else if (roll?.selection.size) { roll.clearSelection(); renderRight(); } return; }
  if (state.view === 'roll' && selectedNotes().length && key.startsWith('arrow')) {
    event.preventDefault();
    const grid = roll.snap || 0.25;
    if (key === 'arrowup') editNotes('op.transpose', (n) => { n.p = Math.min(127, n.p + (event.shiftKey ? 12 : 1)); });
    else if (key === 'arrowdown') editNotes('op.transpose', (n) => { n.p = Math.max(0, n.p - (event.shiftKey ? 12 : 1)); });
    else if (key === 'arrowleft') editNotes('op.moveNotes', (n) => { if (event.shiftKey) n.d = Math.max(grid, n.d - grid); else n.t = Math.max(0, n.t - grid); });
    else if (key === 'arrowright') editNotes('op.moveNotes', (n) => { if (event.shiftKey) n.d += grid; else n.t += grid; });
    return;
  }
  if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); const per = barBeats(song()); seek(Math.max(0, (Math.round(state.position / per) + (key === 'arrowleft' ? -1 : 1)) * per)); return; }
  const id = LETTERS[key];
  if (id) { event.preventDefault(); run(id); }
}

// ───────────────────────── popup actions

const printHost = createPrintHost({ song, popups, t, language: () => getLanguage(), labels: (s) => sectionName(s), trackName: trackLabel, showError, saveExport, safeName });

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('open-recent', (data) => openRecent(data.path));
  popups.on('open-folder', (data) => openWithDialog(data.path));
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('print-save-pdf', (data) => printHost.savePdf(data));
  popups.on('preview-instrument', (data) => previewInstrument(data.id));
  popups.on('test-sound', () => { try { player.previewPhrase('piano', 'melodic'); } catch (error) { showError('error.audio', error); } });
}

// ───────────────────────── tutorial

let tutorial = null;
async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  if (state.instance && !state.instance.first) return;
  let files = [];
  try { files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? []; } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  if (exists[0]) await openPath(files[0], { quiet: true });
}

/** What the panels and the start page read. */
const panelApi = {
  state, t, lang, commands, commandTip, commandEnabled, settings: () => state.settings, version: () => state.info?.version ?? VERSION,
  song, hasSong, sectionName, trackLabel, selectedTrack, selectedNotes,
};

/** What the tutorial and tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, change, setView, showStartPage, updateSettings, renderAll, selectSection, selectTrack,
  settings: () => state.settings, song, anchorBelow, openMenubarMenu, openDocWindow, closeDocFrames, ask, version: () => state.info?.version ?? VERSION,
  takeDoc: () => state.doc, putDoc: (d) => { if (d) setDoc(d); else closeSong({ force: true }); },
  openSample: (id) => { const s = buildSample(id); setDoc(new Doc(s, { name: s.title })); },
  stop: () => stopPlayback(), play: (from) => play(from),
  get arrangement() { return arrangement; }, get roll() { return roll; },
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  const welcomeLikely = desktop && state.settings.showWelcome && state.settings.showStartPage !== false && !globalThis.__MYAUDIOMAKER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();
  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? []); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
  }
  await restoreSession();
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  if (!state.doc && !state.settings.showStartPage) newSong('pop');
  state.showStart = !state.doc;
  renderAll();
  const welcome = state.settings.showWelcome && state.showStart && !globalThis.__MYAUDIOMAKER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (desktop) await appWindow.show();
  if (welcome) openWelcome();
  else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  } else {
    const warm = () => setTimeout(() => popups.prewarm('progress', { warm: true }), 300);
    if (welcome) popups.whenDrawn('welcome', 3000).then(warm); else warm();
  }
}

async function openWelcome() {
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSampleAsk('pop-firstlove');
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__myaudiomaker = {
  state, t, commands, popups, run, player,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  api: appApi,
  get arrangement() { return arrangement; },
  get roll() { return roll; },
  actions: { newSong, openSampleAsk, openBytes, saveDoc, closeSong, change, undo, redo, setView, aiCompose, aiLyrics, regenerate, addSection, addTrack, deleteSection, setLyrics, transposeSong, exportMidi, play, stopPlayback, seek, showStartPage, updateSettings, selectSection, selectTrack, withProgress, setSectionBars, applyStructure },
  domain: { compose, buildSample, SAMPLES, TEMPLATES, tutorialSteps: () => TUTORIAL_STEPS.length, cloneSong, createSong, audible },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
