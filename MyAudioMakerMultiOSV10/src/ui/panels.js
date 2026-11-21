// HTML of the side panels and the lyrics view (strings; app.js binds the data-* attributes):
//   left:  AI Compose (the song generator), Instruments (the library), Sections (song parts to add)
//   right: the song outline (sections and tracks) and the editors — Song, Section, Track, Notes, Mix
//   centre: the Lyrics view (each section's words, syllables against notes, chords)
import { engraveBars, melodyNotes, staffSvg } from '../music/notation.js';
import { aiPickerHtml } from './aipicker.js';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { stepperHtml } from '../stepper.js';
import { GENRES, MOODS, SECTION_COLORS, SECTION_ICONS, SECTION_TYPES, STRUCTURES, SECTION_DEFAULTS } from '../music/genres.js';
import { INSTRUMENTS, INSTRUMENT_CATEGORIES, instrument, ROLE_ICONS, TRACK_ROLES } from '../music/instruments.js';
import { THEMES } from '../music/lyrics-bank.js';
import { MODES, keyName, noteName, pcName, prefersFlats } from '../music/theory.js';
import { chordLineText, sectionSpans, songStats, trackName } from '../music/song.js';
import { lyricFit } from '../music/composer.js';
import { syllableCount } from '../music/syllables.js';
import { timeLabel } from '../music/theory.js';
import { providerFor } from '../music/ai.js';

const L = (api) => api.lang();
const nm = (x, api) => (L(api) === 'en' ? x.en : x.ko);

const row = (glyph, label, control, title = label, cls = '') => `<div class="prop-row ${cls}" title="${escapeHtml(title)}"><span class="prop-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
const opt = (value, label, current, glyph = '') => `<option value="${escapeHtml(value)}" ${String(current) === String(value) ? 'selected' : ''} ${glyph ? `data-icon="${glyph}"` : ''}>${escapeHtml(label)}</option>`;
const seg = (attr, options, current) => `<span class="segmented compact">${options.map(([v, label, glyph]) => `<button type="button" class="segment ${String(current) === String(v) ? 'active' : ''}" ${attr}="${escapeHtml(v)}" title="${escapeHtml(label)}" aria-pressed="${String(current) === String(v)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;
const stepper = (api, key, value, min, max, step, unit, label) => stepperHtml({ key, value, min, max, step, unit, label, decreaseTip: api.t('stepper.decrease', { label }), increaseTip: api.t('stepper.increase', { label }) });

// ───────────────────────── left: AI Compose

export function composeHtml(api) {
  const t = api.t;
  const d = api.state.compose;
  const s = api.settings();
  const provider = providerFor(s);
  const flats = prefersFlats(d.tonic ?? 0, d.mode);
  const keys = [['auto', t('compose.auto')], ...Array.from({ length: 12 }, (_, pc) => [String(pc), pcName(pc, flats)])];
  return `<div class="compose">
    ${aiPickerHtml(s, t, { settingsAttr: 'data-command="aiSettings"', settingsTip: api.commandTip('aiSettings'), compact: true })}
    <label class="compose-topic"><span class="prop-label">${icon('lyrics')}<span>${escapeHtml(t('compose.topic'))}</span></span>
      <textarea id="compose-topic" rows="3" spellcheck="false" placeholder="${escapeHtml(t('compose.topicHint'))}">${escapeHtml(d.topic)}</textarea></label>
    <div class="compose-themes">${THEMES.map((th) => `<button type="button" class="chip ${d.theme === th.id ? 'on' : ''}" data-compose-theme="${th.id}" title="${escapeHtml(nm(th, api))}">${icon(th.icon)}<span>${escapeHtml(nm(th, api))}</span></button>`).join('')}</div>
    <div class="props">
      ${row('genrePop', t('compose.genre'), `<select data-compose="genre" data-icon="genrePop" aria-label="${escapeHtml(t('compose.genre'))}">${GENRES.map((g) => opt(g.id, nm(g, api), d.genre, g.icon)).join('')}</select>`)}
      ${row('moodHappy', t('compose.mood'), `<select data-compose="mood" data-icon="moodHappy" aria-label="${escapeHtml(t('compose.mood'))}">${MOODS.map((m) => opt(m.id, nm(m, api), d.mood, m.icon)).join('')}</select>`)}
      ${row('globe', t('compose.language'), seg('data-compose-language', [['ko', '한국어'], ['en', 'English']], d.language))}
      ${row('keySig', t('compose.key'), `<span class="inline-pair"><select data-compose="tonic" data-icon="keySig" aria-label="${escapeHtml(t('compose.key'))}">${keys.map(([v, label]) => opt(v, label, d.tonic == null ? 'auto' : d.tonic)).join('')}</select><select data-compose="mode" data-icon="keySig" aria-label="${escapeHtml(t('compose.mode'))}">${opt('auto', t('compose.byMood'), d.mode ?? 'auto')}${['major', 'minor', 'dorian', 'mixolydian'].map((m) => opt(m, t(`mode.${m}`), d.mode ?? 'auto')).join('')}</select></span>`)}
      ${row('tempo', t('compose.bpm'), `<span class="inline-pair"><label class="check-inline"><input type="checkbox" data-compose-auto-bpm ${d.bpm ? '' : 'checked'} /><span>${escapeHtml(t('compose.auto'))}</span></label>${d.bpm ? stepper(api, 'compose:bpm', d.bpm, 40, 220, 1, '', t('compose.bpm')) : ''}</span>`)}
      ${row('structure', t('compose.structure'), `<select data-compose="structure" data-icon="structure" aria-label="${escapeHtml(t('compose.structure'))}">${STRUCTURES.map((st) => opt(st.id, nm(st, api), d.structure, 'structure')).join('')}</select>`)}
      ${row('instVocal', t('compose.vocal'), `<select data-compose="vocal" data-icon="instVocal" aria-label="${escapeHtml(t('compose.vocal'))}">${['auto', 'voiceFemale', 'voiceMale', 'voiceChoir', 'none'].map((v) => opt(v, v === 'auto' ? t('compose.byGenre') : v === 'none' ? t('compose.noVocal') : nm(instrument(v), api), d.vocal, v === 'none' ? 'close' : 'instVocal')).join('')}</select>`)}
      ${row('dice', t('compose.seed'), `<span class="inline-pair"><input type="text" data-compose-seed value="${escapeHtml(d.seed)}" inputmode="numeric" aria-label="${escapeHtml(t('compose.seed'))}" /><button class="icon-button" data-compose-dice title="${escapeHtml(t('compose.newSeed'))}">${icon('dice')}</button></span>`, t('compose.seedTip'))}
      ${row('notes', t('compose.notes'), `<input type="text" data-compose-notes value="${escapeHtml(d.notes ?? '')}" placeholder="${escapeHtml(t('compose.notesHint'))}" ${provider === 'builtin' ? 'disabled' : ''} />`, t('compose.notesTip'))}
    </div>
    <div class="compose-actions">
      <button class="button primary big" data-command="aiCompose" title="${escapeHtml(api.commandTip('aiCompose'))}">${icon('aiCompose')}<span>${escapeHtml(t('compose.make'))}</span></button>
      <div class="compose-row">
        <button class="button" data-command="aiLyrics" title="${escapeHtml(api.commandTip('aiLyrics'))}" ${api.hasSong() ? '' : 'disabled'}>${icon('aiLyrics')}<span>${escapeHtml(t('compose.lyricsOnly'))}</span></button>
        <button class="button" data-command="aiVariation" title="${escapeHtml(api.commandTip('aiVariation'))}" ${api.hasSong() ? '' : 'disabled'}>${icon('variation')}<span>${escapeHtml(t('compose.variation'))}</span></button>
      </div>
      <p class="panel-hint">${icon('info')}<span>${escapeHtml(t(provider === 'builtin' ? 'compose.hintBuiltin' : 'compose.hintAi'))}</span></p>
    </div>
  </div>`;
}

// ───────────────────────── left: instruments

export function instrumentsHtml(api) {
  const t = api.t;
  const cat = api.state.instrumentCategory;
  const q = api.state.instrumentQuery.trim().toLowerCase();
  const track = api.selectedTrack();
  const list = INSTRUMENTS.filter((i) => (cat === 'all' || i.category === cat) && (!q || i.ko.toLowerCase().includes(q) || i.en.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)));
  return `<label class="search-box">${icon('search')}<input id="instrument-search" type="search" value="${escapeHtml(api.state.instrumentQuery)}" placeholder="${escapeHtml(t('library.search'))}" /></label>
    <div class="lib-chips">${[{ id: 'all', icon: 'library', ko: '전체', en: 'All' }, ...INSTRUMENT_CATEGORIES].map((c) => `<button type="button" class="lib-chip ${cat === c.id ? 'active' : ''}" data-inst-category="${c.id}" title="${escapeHtml(nm(c, api))}">${icon(c.icon)}<span>${escapeHtml(nm(c, api))}</span><i>${c.id === 'all' ? INSTRUMENTS.length : INSTRUMENTS.filter((i) => i.category === c.id).length}</i></button>`).join('')}</div>
    ${track ? `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('library.hintTrack', { name: api.trackLabel(track) }))}</span></p>` : ''}
    <div class="inst-grid">${list.map((i) => {
      const c = INSTRUMENT_CATEGORIES.find((x) => x.id === i.category);
      const current = track?.instrument === i.id;
      return `<div class="inst-card ${current ? 'active' : ''}" data-instrument="${i.id}" title="${escapeHtml(`${nm(i, api)} — ${t('library.cardTip')}`)}">
        <span class="inst-icon cat-${i.category}">${icon(c.icon)}</span>
        <span class="inst-name"><b>${escapeHtml(nm(i, api))}</b><small>${escapeHtml(nm(c, api))}${i.drums ? '' : ` · ${noteName(i.range[0])}–${noteName(i.range[1])}`}</small></span>
        <span class="inst-buttons">
          <button class="icon-button" data-inst-preview="${i.id}" title="${escapeHtml(t('library.preview'))}" aria-label="${escapeHtml(t('library.preview'))}">${icon('play')}</button>
          <button class="icon-button" data-inst-use="${i.id}" title="${escapeHtml(track ? t('library.useOnTrack') : t('library.addTrack'))}" aria-label="${escapeHtml(t('library.useOnTrack'))}" ${api.hasSong() ? '' : 'disabled'}>${icon(track ? 'swap' : 'trackAdd')}</button>
        </span>
      </div>`;
    }).join('')}</div>`;
}

// ───────────────────────── left: sections

export function sectionsHtml(api) {
  const t = api.t;
  return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('sections.hint'))}</span></p>
    <div class="section-palette">${SECTION_TYPES.map((type) => `<button type="button" class="section-card" data-add-section="${type}" style="--section:${SECTION_COLORS[type]}" title="${escapeHtml(t('sections.addTip', { name: t(`section.${type}`) }))}" ${api.hasSong() ? '' : 'disabled'}>
      ${icon(SECTION_ICONS[type])}<b>${escapeHtml(t(`section.${type}`))}</b><small>${escapeHtml(t('sections.barsLines', { bars: SECTION_DEFAULTS[type].bars, lines: SECTION_DEFAULTS[type].lines }))}</small></button>`).join('')}</div>
    <h3 class="prop-subhead">${icon('structure')}<span>${escapeHtml(t('sections.forms'))}</span></h3>
    <div class="form-list">${STRUCTURES.map((st) => `<button type="button" class="form-row" data-apply-structure="${st.id}" title="${escapeHtml(t('sections.formTip'))}" ${api.hasSong() ? '' : 'disabled'}>${icon('structure')}<span>${escapeHtml(nm(st, api))}</span></button>`).join('')}</div>`;
}

// ───────────────────────── right: outline

export function outlineHtml(api) {
  const song = api.song();
  if (!song) return '';
  const t = api.t;
  const spans = sectionSpans(song);
  const sel = api.state;
  return `<div class="ol-group-head">${icon('structure')}<span>${escapeHtml(t('outline.sections'))}</span><b>${song.sections.length}</b></div>
    ${spans.map(({ section, start }, i) => `<div class="ol-row ${sel.section === section.id ? 'selected' : ''}" data-ol-section="${escapeHtml(section.id)}" title="${escapeHtml(chordLineText(song, section))}">
      <i class="ol-dot" style="background:${SECTION_COLORS[section.type]}"></i>${icon(SECTION_ICONS[section.type])}<span class="ol-name">${escapeHtml(api.sectionName(section))}</span>
      <small>${escapeHtml(t('outline.barsAt', { bars: section.bars, at: timeLabel((start * 60) / song.bpm) }))}</small>
      <span class="ol-tools"><button class="icon-button tiny" data-section-up="${i}" title="${escapeHtml(t('action.sectionUp'))}" ${i === 0 ? 'disabled' : ''}>${icon('chevronUp')}</button><button class="icon-button tiny" data-section-down="${i}" title="${escapeHtml(t('action.sectionDown'))}" ${i === song.sections.length - 1 ? 'disabled' : ''}>${icon('chevronDown')}</button></span>
    </div>`).join('')}
    <div class="ol-group-head">${icon('tracks')}<span>${escapeHtml(t('outline.tracks'))}</span><b>${song.tracks.length}</b></div>
    ${song.tracks.map((track) => `<div class="ol-row ${sel.track === track.id ? 'selected' : ''}" data-ol-track="${escapeHtml(track.id)}" title="${escapeHtml(trackName(track, L(api)))}">
      <i class="ol-dot" style="background:${track.color}"></i>${icon(ROLE_ICONS[track.role])}<span class="ol-name">${escapeHtml(trackName(track, L(api)))}</span><small>${track.notes.length}</small>
      <span class="ol-tools"><button class="ms-button tiny ${track.mute ? 'on mute' : ''}" data-track-mute="${escapeHtml(track.id)}" title="${escapeHtml(t('track.mute'))}">M</button><button class="ms-button tiny ${track.solo ? 'on solo' : ''}" data-track-solo="${escapeHtml(track.id)}" title="${escapeHtml(t('track.solo'))}">S</button></span>
    </div>`).join('')}`;
}

// ───────────────────────── right: editors

export function songEditorHtml(api) {
  const song = api.song();
  const t = api.t;
  const stats = songStats(song);
  const flats = prefersFlats(song.key.tonic, song.key.mode);
  return `<div class="props">
    ${row('edit', t('song.title'), `<input type="text" data-song="title" value="${escapeHtml(song.title)}" placeholder="${escapeHtml(t('song.untitled'))}" />`)}
    ${row('user', t('song.artist'), `<input type="text" data-song="artist" value="${escapeHtml(song.artist)}" placeholder="${escapeHtml(t('song.artistHint'))}" />`)}
    ${row('genrePop', t('compose.genre'), `<select data-song="genre">${GENRES.map((g) => opt(g.id, nm(g, api), song.genre, g.icon)).join('')}</select>`, t('song.genreTip'))}
    ${row('moodHappy', t('compose.mood'), `<select data-song="mood">${MOODS.map((m) => opt(m.id, nm(m, api), song.mood, m.icon)).join('')}</select>`)}
    ${row('keySig', t('song.key'), `<span class="inline-pair"><select data-song="tonic" data-icon="keySig">${Array.from({ length: 12 }, (_, pc) => opt(pc, pcName(pc, flats), song.key.tonic)).join('')}</select><select data-song="mode" data-icon="keySig">${MODES.map((m) => opt(m, t(`mode.${m}`), song.key.mode)).join('')}</select></span>`, t('song.keyTip'))}
    ${row('tempo', t('song.bpm'), stepper(api, 'song:bpm', song.bpm, 30, 300, 1, '', t('song.bpm')))}
    ${row('timeSig', t('song.timeSignature'), `<select data-song="timeSignature" data-icon="timeSig">${['4/4', '3/4', '6/8', '2/4', '5/4', '7/8', '12/8'].map((v) => opt(v, v, song.timeSignature.join('/'))).join('')}</select>`)}
    ${row('swing', t('song.swing'), `<input type="range" min="0" max="0.5" step="0.01" data-song-range="swing" value="${song.swing}" /><output>${Math.round(song.swing * 200)}%</output>`, t('song.swingTip'))}
    ${row('globe', t('compose.language'), seg('data-song-language', [['ko', '한국어'], ['en', 'English']], song.language))}
    <div class="prop-badges">
      <span class="badge">${icon('clock')}${escapeHtml(timeLabel(stats.seconds))}</span><span class="badge">${icon('bars')}${escapeHtml(t('song.bars', { n: stats.bars }))}</span>
      <span class="badge">${icon('tracks')}${escapeHtml(t('song.tracksCount', { n: stats.tracks }))}</span><span class="badge">${icon('notesIcon')}${escapeHtml(t('song.notesCount', { n: stats.notes }))}</span>
      <span class="badge">${icon('dice')}${escapeHtml(t('song.seedValue', { n: song.seed }))}</span>
    </div>
    <div class="prop-actions">
      <button class="small-button" data-command="transposeUp" title="${escapeHtml(api.commandTip('transposeUp'))}">${icon('transposeUp')}<span>${escapeHtml(t('action.transposeUp'))}</span></button>
      <button class="small-button" data-command="transposeDown" title="${escapeHtml(api.commandTip('transposeDown'))}">${icon('transposeDown')}<span>${escapeHtml(t('action.transposeDown'))}</span></button>
      <button class="small-button" data-command="aiVariation" title="${escapeHtml(api.commandTip('aiVariation'))}">${icon('variation')}<span>${escapeHtml(t('action.aiVariation'))}</span></button>
    </div>
  </div>`;
}

export function sectionEditorHtml(api) {
  const song = api.song();
  const t = api.t;
  const section = song.sections.find((s) => s.id === api.state.section);
  if (!section) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.pickSection'))}</span></p>`;
  const others = song.sections.filter((s) => s !== section && s.type === section.type);
  return `<div class="props">
    <div class="prop-master"><i class="ol-dot big" style="background:${SECTION_COLORS[section.type]}"></i><div><b>${escapeHtml(api.sectionName(section))}</b><small class="muted">${escapeHtml(t(`section.${section.type}`))}</small></div></div>
    ${row('edit', t('section.label'), `<input type="text" data-section-field="label" value="${escapeHtml(section.label)}" placeholder="${escapeHtml(api.sectionName(section))}" />`)}
    ${row(SECTION_ICONS[section.type], t('section.type'), `<select data-section-field="type">${SECTION_TYPES.map((ty) => opt(ty, t(`section.${ty}`), section.type, SECTION_ICONS[ty])).join('')}</select>`)}
    ${row('bars', t('section.bars'), stepper(api, 'section:bars', section.bars, 1, 64, 1, '', t('section.bars')))}
    ${row('energy', t('section.energy'), `<input type="range" min="0" max="1" step="0.05" data-section-range="energy" value="${section.energy}" /><output>${Math.round(section.energy * 100)}%</output>`, t('section.energyTip'))}
    ${row('chords', t('section.chords'), `<input type="text" class="mono" data-section-field="chords" value="${escapeHtml(chordLineText(song, section))}" spellcheck="false" />`, t('section.chordsTip'), 'tall')}
    ${row('copy', t('section.repeatOf'), `<select data-section-field="repeatOf" data-icon="copy">${opt('', t('section.repeatNone'), section.repeatOf ?? '')}${others.map((o) => opt(o.id, api.sectionName(o), section.repeatOf ?? '')).join('')}</select>`, t('section.repeatTip'))}
    <h3 class="prop-subhead">${icon('aiCompose')}<span>${escapeHtml(t('section.regenerate'))}</span></h3>
    <div class="prop-buttons wrap">${['all', 'chords', 'melody', 'lead', 'accompaniment', 'bass', 'drums'].map((part) => `<button class="small-button" data-regenerate="${part}" title="${escapeHtml(t(`regen.${part}Tip`))}">${icon(part === 'all' ? 'aiCompose' : `part_${part}`)}<span>${escapeHtml(t(`regen.${part}`))}</span></button>`).join('')}</div>
    <div class="prop-actions">
      <button class="small-button" data-command="fitMelody" title="${escapeHtml(api.commandTip('fitMelody'))}">${icon('fitMelody')}<span>${escapeHtml(t('action.fitMelody'))}</span></button>
      <button class="small-button" data-command="loopSection" title="${escapeHtml(api.commandTip('loopSection'))}">${icon('loop')}<span>${escapeHtml(t('action.loopSection'))}</span></button>
      <button class="small-button" data-command="duplicateSection" title="${escapeHtml(api.commandTip('duplicateSection'))}">${icon('duplicate')}<span>${escapeHtml(t('action.duplicateSection'))}</span></button>
      <button class="small-button danger" data-command="deleteSection" title="${escapeHtml(api.commandTip('deleteSection'))}">${icon('trash')}<span>${escapeHtml(t('action.deleteSection'))}</span></button>
    </div>
  </div>`;
}

export function trackEditorHtml(api) {
  const song = api.song();
  const t = api.t;
  const track = song.tracks.find((x) => x.id === api.state.track);
  if (!track) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.pickTrack'))}</span></p>`;
  const inst = instrument(track.instrument);
  return `<div class="props">
    <div class="prop-master"><i class="ol-dot big" style="background:${track.color}"></i><div><b>${escapeHtml(trackName(track, L(api)))}</b><small class="muted">${escapeHtml(t(`role.${track.role}`))}</small></div></div>
    ${row('edit', t('track.name'), `<input type="text" data-track-field="name" value="${escapeHtml(track.name)}" placeholder="${escapeHtml(nm(inst, api))}" />`)}
    ${row(ROLE_ICONS[track.role], t('track.role'), `<select data-track-field="role">${TRACK_ROLES.map((r) => opt(r, t(`role.${r}`), track.role, ROLE_ICONS[r])).join('')}</select>`, t('track.roleTip'))}
    ${row('instKeys', t('track.instrument'), `<select data-track-field="instrument">${INSTRUMENT_CATEGORIES.map((c) => `<optgroup label="${escapeHtml(nm(c, api))}">${INSTRUMENTS.filter((i) => i.category === c.id).map((i) => opt(i.id, nm(i, api), track.instrument, c.icon)).join('')}</optgroup>`).join('')}</select>`)}
    ${row('volume', t('track.volume'), `<input type="range" min="0" max="1.5" step="0.01" data-track-range="volume" value="${track.volume}" /><output>${Math.round(track.volume * 100)}%</output>`)}
    ${row('pan', t('track.pan'), `<input type="range" min="-1" max="1" step="0.05" data-track-range="pan" value="${track.pan}" /><output>${track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}</output>`)}
    ${row('reverb', t('track.reverb'), `<input type="range" min="0" max="1" step="0.01" data-track-range="reverb" value="${track.reverb}" /><output>${Math.round(track.reverb * 100)}%</output>`)}
    ${row('palette', t('track.color'), `<input type="color" data-track-field="color" value="${escapeHtml(track.color)}" />`)}
    ${row('volume', t('track.state'), `<span class="inline-pair"><button class="ms-button ${track.mute ? 'on mute' : ''}" data-track-mute="${escapeHtml(track.id)}" title="${escapeHtml(t('track.mute'))}">M</button><button class="ms-button ${track.solo ? 'on solo' : ''}" data-track-solo="${escapeHtml(track.id)}" title="${escapeHtml(t('track.solo'))}">S</button></span>`)}
    <div class="prop-badges"><span class="badge">${icon('notesIcon')}${escapeHtml(t('song.notesCount', { n: track.notes.length }))}</span>${inst.drums ? '' : `<span class="badge">${icon('range')}${escapeHtml(`${noteName(inst.range[0])}–${noteName(inst.range[1])}`)}</span>`}</div>
    <div class="prop-actions">
      <button class="small-button" data-command="openRoll" title="${escapeHtml(api.commandTip('openRoll'))}">${icon('pianoRoll')}<span>${escapeHtml(t('action.openRoll'))}</span></button>
      <button class="small-button" data-command="duplicateTrack" title="${escapeHtml(api.commandTip('duplicateTrack'))}">${icon('duplicate')}<span>${escapeHtml(t('action.duplicateTrack'))}</span></button>
      <button class="small-button danger" data-command="deleteTrack" title="${escapeHtml(api.commandTip('deleteTrack'))}">${icon('trash')}<span>${escapeHtml(t('action.deleteTrack'))}</span></button>
    </div>
  </div>`;
}

export function notesEditorHtml(api) {
  const t = api.t;
  const notes = api.selectedNotes();
  if (!notes.length) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.pickNotes'))}</span></p>`;
  const one = notes.length === 1 ? notes[0] : null;
  const avg = notes.reduce((s, n) => s + n.v, 0) / notes.length;
  return `<div class="props">
    <div class="prop-master">${icon('notesIcon')}<div><b>${escapeHtml(t('notes.selected', { n: notes.length }))}</b><small class="muted">${escapeHtml(one ? noteName(one.p) : `${noteName(Math.min(...notes.map((n) => n.p)))}–${noteName(Math.max(...notes.map((n) => n.p)))}`)}</small></div></div>
    ${one ? row('keySig', t('notes.pitch'), `<input type="text" class="mono" data-note-field="pitch" value="${escapeHtml(noteName(one.p))}" />`) : ''}
    ${one ? row('clock', t('notes.start'), `<input type="text" class="mono" data-note-field="start" value="${one.t}" />`, t('notes.beatsTip')) : ''}
    ${one ? row('bars', t('notes.length'), `<input type="text" class="mono" data-note-field="length" value="${one.d}" />`, t('notes.beatsTip')) : ''}
    ${row('volume', t('notes.velocity'), `<input type="range" min="0.05" max="1" step="0.01" data-note-range="velocity" value="${avg}" /><output>${Math.round(avg * 100)}</output>`)}
    ${one ? row('lyrics', t('notes.syllable'), `<input type="text" data-note-field="syl" value="${escapeHtml(one.syl ?? '')}" />`) : ''}
    <div class="prop-buttons wrap">
      <button class="small-button" data-command="transposeNotesUp">${icon('transposeUp')}<span>${escapeHtml(t('action.transposeNotesUp'))}</span></button>
      <button class="small-button" data-command="transposeNotesDown">${icon('transposeDown')}<span>${escapeHtml(t('action.transposeNotesDown'))}</span></button>
      <button class="small-button" data-command="octaveUp">${icon('octaveUp')}<span>${escapeHtml(t('action.octaveUp'))}</span></button>
      <button class="small-button" data-command="octaveDown">${icon('octaveDown')}<span>${escapeHtml(t('action.octaveDown'))}</span></button>
      <button class="small-button" data-command="quantize">${icon('quantize')}<span>${escapeHtml(t('action.quantize'))}</span></button>
      <button class="small-button danger" data-command="delete">${icon('trash')}<span>${escapeHtml(t('action.delete'))}</span></button>
    </div>
  </div>`;
}

export function mixEditorHtml(api) {
  const song = api.song();
  const t = api.t;
  return `<div class="props">
    ${row('volume', t('mix.master'), `<input type="range" min="0" max="1.5" step="0.01" data-mix-range="master" value="${song.mix.master}" /><output>${Math.round(song.mix.master * 100)}%</output>`)}
    ${row('reverb', t('mix.reverb'), `<input type="range" min="0" max="1" step="0.01" data-mix-range="reverb" value="${song.mix.reverb}" /><output>${Math.round(song.mix.reverb * 100)}%</output>`)}
    ${row('compressor', t('mix.compressor'), `<label class="switch-wrap"><input type="checkbox" data-mix-toggle="compressor" ${song.mix.compressor ? 'checked' : ''} /><span class="switch"></span></label>`, t('mix.compressorTip'))}
    <h3 class="prop-subhead">${icon('tracks')}<span>${escapeHtml(t('mix.channels'))}</span></h3>
    <div class="mixer">${song.tracks.map((track) => `<div class="mixer-strip ${api.state.track === track.id ? 'selected' : ''}" style="--track:${track.color}" title="${escapeHtml(trackName(track, L(api)))}">
      <span class="mixer-name" data-ol-track="${escapeHtml(track.id)}">${icon(ROLE_ICONS[track.role])}<b>${escapeHtml(trackName(track, L(api)))}</b></span>
      <input type="range" min="0" max="1.5" step="0.01" data-strip-volume="${escapeHtml(track.id)}" value="${track.volume}" aria-label="${escapeHtml(t('track.volume'))}" />
      <span class="inline-pair"><button class="ms-button tiny ${track.mute ? 'on mute' : ''}" data-track-mute="${escapeHtml(track.id)}">M</button><button class="ms-button tiny ${track.solo ? 'on solo' : ''}" data-track-solo="${escapeHtml(track.id)}">S</button></span>
    </div>`).join('')}</div>
    <div class="meter" aria-hidden="true"><i id="level-meter"></i></div>
  </div>`;
}

// ───────────────────────── centre: lyrics

export function lyricsViewHtml(api) {
  const song = api.song();
  const t = api.t;
  const hasVocal = song.tracks.some((tr) => tr.role === 'vocal');
  // Each section's melody on a staff, syllables under the notes (Settings or the header button turn it off).
  const showStaff = api.settings().lyricsStaff !== false;
  const melody = showStaff ? melodyNotes(song) : [];
  const spans = sectionSpans(song);
  const melodyIn = (section) => { const sp = spans.find((x) => x.section === section); return sp && melody.some((n) => n.t >= sp.start - 1e-6 && n.t < sp.end - 1e-6); };
  const engraved = showStaff && melody.length ? engraveBars(song) : null;
  const staffWidth = Math.max(320, (api.state.lyricsWidth ?? 820) - 34);
  const cards = spans.map(({ section, start }) => {
    const fit = lyricFit(song, section);
    const repeat = section.repeatOf ? song.sections.find((s) => s.id === section.repeatOf) : null;
    const counts = section.lyrics.map((line, i) => {
      const f = fit[i];
      const s = syllableCount(line);
      const ok = !hasVocal || !f || f.notes === s;
      return `<span class="lyric-count ${ok ? '' : 'off'}" title="${escapeHtml(t('lyrics.countTip', { syllables: s, notes: f?.notes ?? 0 }))}">${s}${hasVocal && f ? `<small>/${f.notes}</small>` : ''}</span>`;
    }).join('');
    return `<section class="lyric-card ${api.state.section === section.id ? 'selected' : ''}" data-lyric-section="${escapeHtml(section.id)}" style="--section:${SECTION_COLORS[section.type]}">
      <header>${icon(SECTION_ICONS[section.type])}<b>${escapeHtml(api.sectionName(section))}</b><small>${escapeHtml(t('outline.barsAt', { bars: section.bars, at: timeLabel((start * 60) / song.bpm) }))}</small>${repeat ? `<span class="badge">${icon('copy')}${escapeHtml(t('lyrics.repeats', { name: api.sectionName(repeat) }))}</span>` : ''}<span class="grow"></span>
        <button class="icon-button" data-lyric-play="${escapeHtml(section.id)}" title="${escapeHtml(t('lyrics.play'))}">${icon('play')}</button>
        <button class="icon-button" data-lyric-ai="${escapeHtml(section.id)}" title="${escapeHtml(t('lyrics.rewrite'))}">${icon('aiLyrics')}</button>
        <button class="icon-button" data-lyric-fit="${escapeHtml(section.id)}" title="${escapeHtml(t('lyrics.fit'))}" ${hasVocal ? '' : 'disabled'}>${icon('fitMelody')}</button>
      </header>
      ${showStaff && melodyIn(section) ? `<div class="lyric-staff" title="${escapeHtml(t('lyrics.staffTip'))}">${staffSvg(song, section, { widthPx: staffWidth, engraved })}</div>` : `<div class="lyric-chords mono" title="${escapeHtml(t('section.chordsTip'))}">${escapeHtml(chordLineText(song, section))}</div>`}
      <div class="lyric-edit"><textarea data-lyrics="${escapeHtml(section.id)}" rows="${Math.max(2, section.lyrics.length + 1)}" spellcheck="false" placeholder="${escapeHtml(t('lyrics.placeholder'))}">${escapeHtml(section.lyrics.join('\n'))}</textarea><div class="lyric-counts">${counts}</div></div>
    </section>`;
  }).join('');
  return `<div class="lyrics-view">
    <div class="lyrics-head">${icon('lyrics')}<b>${escapeHtml(song.title || t('song.untitled'))}</b><span class="muted">${escapeHtml(`${keyName(song.key)} · ${song.bpm} BPM`)}</span><span class="grow"></span>
      <button class="small-button ${showStaff ? 'on' : ''}" data-lyrics-staff-toggle aria-pressed="${showStaff}" title="${escapeHtml(t('lyrics.staffToggleTip'))}">${icon('leadSheet')}<span>${escapeHtml(t('lyrics.staffToggle'))}</span></button>
      <button class="small-button" data-command="aiLyrics">${icon('aiLyrics')}<span>${escapeHtml(t('action.aiLyrics'))}</span></button>
      <button class="small-button" data-command="copyLyrics">${icon('copy')}<span>${escapeHtml(t('action.copyLyrics'))}</span></button>
      <button class="small-button" data-command="pasteLyrics">${icon('paste')}<span>${escapeHtml(t('action.pasteLyrics'))}</span></button>
    </div>
    <p class="panel-hint">${icon('info')}<span>${escapeHtml(t('lyrics.hint'))}</span></p>
    ${cards}
  </div>`;
}
