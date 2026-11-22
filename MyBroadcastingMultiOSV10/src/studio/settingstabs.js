// Settings window tabs of the broadcasting part (General · Stream · Output · Audio · Video ·
// Hotkeys · Accessibility · Advanced). The profile is edited in localStorage (studio/profile.js); the main
// window follows the storage event. Controls carry data-prof="<path>" (select / text), data-prof-check,
// data-prof-set (segments) and steppers keyed "prof:<path>"; app preferences use the shell's own toggles.
import { SERVICES, serviceById, checkStream, recommendedBitrate } from '../bc/services.js';
import { CONTAINERS, VIDEO_CODECS, AUDIO_CODECS } from '../bc/engine/outputs.js';
import { BASE_SIZES, CHANNELS, DOWNSCALE, FPS_COMMON, HARDWARE, LATENCY, METER_DECAY, PEAK_METER, REC_QUALITY, REMUX_FORMATS, SAMPLE_RATES, SPLIT_MODES, currentProfile, loadProfiles, normalizeProfile, storeProfiles, encodersOf } from './profile.js';
import { hotkeyActions, comboOf, normalizeCombo } from './hotkeys.js';
import { COLLECTIONS_KEY } from './studio.js';
import { normalizeCollection, createCollection } from '../bc/model.js';

export const BROADCAST_TABS = [
  ['stream', 'stream', 'settings.stream'],
  ['output', 'record', 'settings.output'],
  ['audio', 'mixer', 'settings.audio'],
  ['video', 'canvasSize', 'settings.video'],
  ['hotkeys', 'keyboard', 'settings.hotkeys'],
  ['accessibility', 'accessibility', 'settings.accessibility'],
  ['advanced', 'advanced', 'settings.advanced'],
];

export function profileState() { return loadProfiles(globalThis.localStorage); }
export function profile() { return currentProfile(profileState()); }
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setIn(obj, path, value) { const keys = path.split('.'); let cur = obj; for (let i = 0; i < keys.length - 1; i++) { cur[keys[i]] = { ...(cur[keys[i]] ?? {}) }; cur = cur[keys[i]]; } cur[keys.at(-1)] = value; return obj; }

/** Writes one value of the current profile (the main window picks it up). */
export function setProfile(path, value) {
  const st = profileState();
  const p = JSON.parse(JSON.stringify(currentProfile(st)));
  setIn(p, path, value);
  const next = normalizeProfile(p);
  st.list = st.list.map((x) => (x.name === st.current ? next : x));
  storeProfiles(globalThis.localStorage, st);
  return next;
}

/** The open scene collection (for the hotkeys list). */
export function currentCollection() {
  try {
    const list = JSON.parse(globalThis.localStorage.getItem(COLLECTIONS_KEY) ?? 'null');
    const raw = globalThis.localStorage.getItem(`mybroadcasting.collection.${list?.current ?? 'Untitled'}`);
    return raw ? normalizeCollection(JSON.parse(raw)) : createCollection();
  } catch { return createCollection(); }
}

export function makeTabs(h) {
  const { row, numberField, segmented, button, escapeHtml: esc, icon, t, s, toggle } = h;
  const P = () => profile();
  const sel = (path, options, labelKey, glyph = 'listBullet') => `<select data-prof="${path}" data-icon="${glyph}" aria-label="${esc(t(labelKey))}">${options.map(([v, l, ic]) => `<option value="${esc(v)}" ${String(get(P(), path)) === String(v) ? 'selected' : ''} ${ic ? `data-icon="${ic}"` : ''}>${esc(l)}</option>`).join('')}</select>`;
  const txt = (path, labelKey, { type = 'text', placeholder = '' } = {}) => `<input type="${type}" class="text-input" data-prof="${path}" value="${esc(get(P(), path) ?? '')}" placeholder="${esc(placeholder)}" aria-label="${esc(t(labelKey))}" spellcheck="false" />`;
  const num = (path, min, max, step, unit, labelKey) => numberField(`prof:${path}`, get(P(), path), min, max, step, unit, t(labelKey));
  const check = (path, labelKey, glyph) => row(glyph, t(labelKey), `<label class="switch-wrap" title="${esc(t(labelKey))}"><input type="checkbox" data-prof-check="${path}" ${get(P(), path) ? 'checked' : ''} aria-label="${esc(t(labelKey))}" /><span class="switch" aria-hidden="true"></span></label>`);
  const seg = (path, options) => segmented(path, options, get(P(), path), 'data-prof-set');
  const head = (glyph, key) => `<h3 class="section-title">${icon(glyph)}<span>${esc(t(key))}</span></h3>`;
  // A hint: one full-width line (icon + text), nothing when there is no text.
  const note = (text) => (text ? `<p class="settings-note">${icon('info')}<span>${esc(text)}</span></p>` : '');

  function general() {
    return [
      head('stream', 'settings.general.outputs'),
      toggle('confirmStartStream', t('settings.confirmStartStream'), 'stream'),
      toggle('confirmStopStream', t('settings.confirmStopStream'), 'streamStop'),
      toggle('confirmStopRecord', t('settings.confirmStopRecord'), 'recordStop'),
      toggle('recordWhenStreaming', t('settings.recordWhenStreaming'), 'record'),
      toggle('keepRecordingWhenStreamStops', t('settings.keepRecordingWhenStreamStops'), 'record'),
      toggle('replayWhenStreaming', t('settings.replayWhenStreaming'), 'replay'),
      toggle('keepReplayWhenStreamStops', t('settings.keepReplayWhenStreamStops'), 'replay'),
      head('magnet', 'settings.general.snapping'),
      row('magnet', t('settings.snapEnabled'), `<label class="switch-wrap"><input type="checkbox" data-snap="enabled" ${s().snap.enabled ? 'checked' : ''} /><span class="switch"></span></label>`),
      row('magnet', t('settings.snapDistance'), numberField('snap:distance', s().snap.distance, 1, 60, 1, 'px', t('settings.snapDistance'))),
      row('magnet', t('settings.snapTo'), ['edges', 'center', 'sources'].map((k) => `<label class="check-row"><input type="checkbox" data-snap="${k}" ${s().snap[k] ? 'checked' : ''} /><span>${esc(t(`settings.snap.${k}`))}</span></label>`).join('')),
      head('studio', 'settings.general.studio'),
      toggle('duplicateScene', t('settings.duplicateScene'), 'copy'),
      toggle('swapScenes', t('settings.swapScenes'), 'swap'),
      toggle('multiviewClickTransition', t('settings.multiviewClickTransition'), 'multiview'),
      head('projector', 'settings.general.projectors'),
      toggle('projectorsOnTop', t('settings.projectorsOnTop'), 'projector'),
      toggle('globalHotkeys', t('settings.globalHotkeys'), 'keyboard'),
      toggle('confirmDelete', t('settings.confirmDelete'), 'trash'),
    ].join('');
  }

  /** Settings › Stream › Account: the user's own app registration signs in and fetches the stream key. */
  function accountRows(id, p) {
    if (id !== 'twitch' && id !== 'youtube') return [];
    const a = p.stream.accounts?.[id] ?? {};
    const youtube = id === 'youtube';
    return [
      head('user', 'settings.account.title'),
      row('key', t('settings.account.clientId'), txt(`stream.accounts.${id}.clientId`, 'settings.account.clientId', { placeholder: t('settings.account.clientIdHint') })),
      youtube ? row('key', t('settings.account.clientSecret'), txt('stream.accounts.youtube.clientSecret', 'settings.account.clientSecret', { type: 'password' })) : '',
      row('user', t('settings.account.state'), `<span class="${a.login ? 'ok' : 'muted'}">${esc(a.login ? t('settings.account.connected', { name: a.login }) : t('settings.account.none'))}</span>${button('account-connect', t(a.login ? 'settings.account.reconnect' : 'settings.account.connect'), 'hyperlink', 'small', id)}${a.login ? button('account-disconnect', t('settings.account.disconnect'), 'close', 'small', id) : ''}`),
      note(t(youtube ? 'settings.account.helpYoutube' : 'settings.account.helpTwitch')),
      row('hyperlink', t('settings.account.console'), button('open-url', t('settings.account.openConsole'), 'hyperlink', 'small', youtube ? 'https://console.cloud.google.com/apis/credentials' : 'https://dev.twitch.tv/console/apps')),
    ];
  }

  /** Settings › Advanced › Virtual camera device (state comes from the main window: h.state.vcam). */
  function vcamRows() {
    const v = h.state?.vcam;
    if (!v?.supported) return [];
    const state = !v.dll ? t('vcam.state.missing') : v.installed ? t('vcam.state.installed') : v.registered_path ? t('vcam.state.other') : t('vcam.state.none');
    return [
      head('vcam', 'vcam.device'),
      row('vcam', t('vcam.deviceState'), `<span class="${v.installed ? 'ok' : 'muted'}">${esc(state)}</span>${v.dll && !v.installed ? button('vcam-install', t('vcam.installAdmin'), 'shield', 'small') : ''}${v.installed ? button('vcam-remove', t('vcam.remove'), 'trash', 'small') : ''}`),
      note(t('vcam.deviceHelp')),
    ];
  }

  function stream() {
    const p = P();
    const service = serviceById(p.stream.service);
    const enc = encodersOf(p);
    const verdict = checkStream({ ...p.stream, videoBitrate: enc.stream.bitrate, audioBitrate: enc.audio.stream.bitrate });
    const custom = service.id === 'custom' || service.id === 'whip';
    const serviceRow = row('stream', t('settings.stream.service'), sel('stream.service', SERVICES.map((x) => [x.id, x.id === 'custom' ? t('settings.stream.custom') : x.direct ? t('settings.stream.direct') : x.name, x.whip || x.direct ? 'webrtc' : 'stream']), 'settings.stream.service', 'stream'));
    if (service.direct) {
      return [
        serviceRow,
        row('server', t('settings.stream.directPort'), num('stream.direct.port', 1024, 65535, 1, '', 'settings.stream.directPort')),
        row('key', t('settings.stream.directCode'), txt('stream.direct.code', 'settings.stream.directCode')),
        row('user', t('settings.stream.directMax'), num('stream.direct.maxViewers', 1, 100, 1, '', 'settings.stream.directMax')),
        row('stream', t('settings.stream.directTitle'), txt('stream.direct.title', 'settings.stream.directTitle', { placeholder: t('settings.stream.directTitle') })),
        row('globe', t('settings.stream.directStun'), txt('stream.direct.stun', 'settings.stream.directStun', { placeholder: 'stun:… , turn:…' })),
        h.desktop ? '' : row('server', t('settings.stream.directServer'), txt('stream.direct.server', 'settings.stream.directServer')),
        note(t('settings.stream.directHelp')),
        h.desktop ? '' : note(t('settings.stream.directHelpWeb')),
      ].join('');
    }
    return [
      serviceRow,
      custom ? row('server', t('settings.stream.server'), txt('stream.server', 'settings.stream.server', { placeholder: service.id === 'whip' ? 'https://example.com/whip/endpoint' : 'rtmp://… · rtmps://… · srt://… · rist://…' })) : row('server', t('settings.stream.server'), sel('stream.serverId', service.servers.map(([id, url]) => [id, `${t(`settings.stream.serverName.${id}`, null, id)} — ${url}`]), 'settings.stream.server', 'server')),
      row('key', t(service.id === 'whip' ? 'settings.stream.token' : 'settings.stream.key'), `${txt(service.id === 'whip' ? 'stream.whipToken' : 'stream.key', 'settings.stream.key', { type: 'password' })}${service.keyUrl ? button('open-url', t('settings.stream.getKey'), 'hyperlink', 'small', service.keyUrl) : ''}`),
      service.bandwidthTest ? check('stream.bandwidthTest', 'settings.stream.bandwidthTest', 'speed') : '',
      row('server', t('settings.stream.protocol'), `<b>${esc(verdict.protocol ? verdict.protocol.toUpperCase() : '—')}</b>`),
      verdict.problems.length ? row('warning', t('settings.stream.check'), `<span class="warn">${esc(verdict.problems.map((x) => t(`stream.problem.${x}`)).join(' · '))}</span>`) : row('check', t('settings.stream.check'), `<span class="ok">${esc(t('settings.stream.ok'))}</span>`),
      service.maxVideo ? note(t('settings.stream.limits', { video: service.maxVideo, audio: service.maxAudio })) : '',
      ...accountRows(service.id, p),
      head('plug', 'settings.stream.transport'),
      note(h.desktop ? t('settings.stream.transportDesktop') : t('settings.stream.transportWeb')),
      h.desktop ? '' : row('server', t('settings.stream.relay'), txt('stream.relay', 'settings.stream.relay')),
    ].join('');
  }

  function output() {
    const p = P();
    const mode = p.output.mode;
    const codecs = (list) => list.map((c) => [c, t(`codec.${c}`)]);
    const out = [row('record', t('settings.output.mode'), seg('output.mode', [['simple', t('opt.mode.simple')], ['advanced', t('opt.mode.advanced')]]))];
    if (mode === 'simple') {
      out.push(head('stream', 'settings.output.streaming'),
        row('bitrate', t('settings.output.videoBitrate'), num('output.simple.videoBitrate', 200, 100000, 100, 'kb/s', 'settings.output.videoBitrate')),
        row('chip', t('settings.output.encoder'), sel('output.simple.encoder', codecs(VIDEO_CODECS), 'settings.output.encoder', 'chip')),
        row('chip', t('settings.output.hardware'), sel('output.simple.hardware', HARDWARE.map((x) => [x, t(`opt.hardware.${x}`)]), 'settings.output.hardware', 'chip')),
        row('volume', t('settings.output.audioBitrate'), sel('output.simple.audioBitrate', [64, 96, 128, 160, 192, 256, 320].map((x) => [x, `${x} kb/s`]), 'settings.output.audioBitrate', 'volume')),
        head('record', 'settings.output.recording'),
        row('folder', t('settings.output.path'), pathRow('output.simple.recPath')),
        row('star', t('settings.output.quality'), sel('output.simple.recQuality', REC_QUALITY.map((x) => [x, t(`opt.recQuality.${x}`)]), 'settings.output.quality', 'star')),
        row('fileVideo', t('settings.output.format'), sel('output.simple.recFormat', CONTAINERS.map((x) => [x, t(`opt.container.${x}`)]), 'settings.output.format', 'fileVideo')),
        head('replay', 'settings.output.replay'),
        check('output.simple.replay.enabled', 'settings.output.replayEnabled', 'replay'),
        row('clock', t('settings.output.replaySeconds'), num('output.simple.replay.seconds', 1, 21600, 1, 's', 'settings.output.replaySeconds')),
        row('memory', t('settings.output.replayMB'), num('output.simple.replay.maxMB', 16, 65536, 16, 'MB', 'settings.output.replayMB')));
    } else {
      out.push(head('stream', 'settings.output.streaming'),
        row('chip', t('settings.output.encoder'), sel('output.stream.encoder', codecs(VIDEO_CODECS), 'settings.output.encoder', 'chip')),
        row('chip', t('settings.output.hardware'), sel('output.stream.hardware', HARDWARE.map((x) => [x, t(`opt.hardware.${x}`)]), 'settings.output.hardware', 'chip')),
        row('bitrate', t('settings.output.rateControl'), seg('output.stream.rateControl', [['CBR', 'CBR'], ['VBR', 'VBR']])),
        row('bitrate', t('settings.output.videoBitrate'), num('output.stream.bitrate', 200, 100000, 100, 'kb/s', 'settings.output.videoBitrate')),
        row('key', t('settings.output.keyint'), num('output.stream.keyint', 0, 20, 1, 's', 'settings.output.keyint')),
        row('speed', t('settings.output.latency'), seg('output.stream.latency', LATENCY.map((x) => [x, t(`opt.latency.${x}`)]))),
        row('volume', t('settings.output.audioCodec'), seg('output.stream.audioCodec', AUDIO_CODECS.map((x) => [x, t(`codec.${x}`)]))),
        row('volume', t('settings.output.audioBitrate'), sel('output.stream.audioBitrate', [64, 96, 128, 160, 192, 256, 320].map((x) => [x, `${x} kb/s`]), 'settings.output.audioBitrate', 'volume')),
        row('mixer', t('settings.output.streamTrack'), seg('output.stream.track', [1, 2, 3, 4, 5, 6].map((x) => [x, String(x)]))),
        head('record', 'settings.output.recording'),
        row('folder', t('settings.output.path'), pathRow('output.record.path')),
        row('fileVideo', t('settings.output.format'), sel('output.record.format', CONTAINERS.map((x) => [x, t(`opt.container.${x}`)]), 'settings.output.format', 'fileVideo')),
        row('mixer', t('settings.output.tracks'), [1, 2, 3, 4, 5, 6].map((x) => `<label class="track-box"><input type="checkbox" data-prof-track="${x}" ${p.output.record.tracks.includes(x) ? 'checked' : ''} /><span>${x}</span></label>`).join('')),
        check('output.record.sameAsStream', 'settings.output.sameAsStream', 'copy'));
      if (!p.output.record.sameAsStream) out.push(
        row('chip', t('settings.output.encoder'), sel('output.record.encoder', codecs(VIDEO_CODECS), 'settings.output.encoder', 'chip')),
        row('bitrate', t('settings.output.rateControl'), seg('output.record.rateControl', [['CBR', 'CBR'], ['VBR', 'VBR'], ['CQP', 'CQP']])),
        p.output.record.rateControl === 'CQP' ? row('star', t('settings.output.cqp'), num('output.record.cqp', 0, 51, 1, '', 'settings.output.cqp')) : row('bitrate', t('settings.output.videoBitrate'), num('output.record.bitrate', 200, 500000, 100, 'kb/s', 'settings.output.videoBitrate')),
        row('key', t('settings.output.keyint'), num('output.record.keyint', 0, 20, 1, 's', 'settings.output.keyint')),
        row('volume', t('settings.output.audioCodec'), seg('output.record.audioCodec', AUDIO_CODECS.map((x) => [x, t(`codec.${x}`)]))),
        row('volume', t('settings.output.audioBitrate'), sel('output.record.audioBitrate', [64, 96, 128, 160, 192, 256, 320].map((x) => [x, `${x} kb/s`]), 'settings.output.audioBitrate', 'volume')));
      out.push(row('split', t('settings.output.split'), seg('output.record.split.mode', SPLIT_MODES.map((x) => [x, t(`opt.split.${x}`)]))),
        p.output.record.split.mode === 'time' ? row('clock', t('settings.output.splitMinutes'), num('output.record.split.minutes', 0.1, 1440, 1, 'min', 'settings.output.splitMinutes')) : '',
        p.output.record.split.mode === 'size' ? row('memory', t('settings.output.splitMB'), num('output.record.split.mb', 1, 1048576, 64, 'MB', 'settings.output.splitMB')) : '',
        head('replay', 'settings.output.replay'),
        check('output.replay.enabled', 'settings.output.replayEnabled', 'replay'),
        row('clock', t('settings.output.replaySeconds'), num('output.replay.seconds', 1, 21600, 1, 's', 'settings.output.replaySeconds')),
        row('memory', t('settings.output.replayMB'), num('output.replay.maxMB', 16, 65536, 16, 'MB', 'settings.output.replayMB')));
    }
    out.push(note(t('settings.output.webcodecs')));
    return out.join('');
  }

  function pathRow(path) {
    const value = get(P(), path);
    return `<span class="path" title="${esc(value || t('settings.output.defaultPath'))}">${esc(value || t('settings.output.defaultPath'))}</span>${button('choose-folder', t('settings.output.browse'), 'folderOpen', 'small', path)}${value ? button('clear-folder', t('prop.clearFile'), 'close', 'small', path) : ''}`;
  }

  function audio() {
    const p = P();
    const devices = h.devices();
    const deviceSel = (slot, kind) => {
      const list = devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default');
      const opts = [['', t('settings.audio.disabled')], ['default', t('prop.deviceDefault')], ...list.map((d, i) => [d.deviceId, d.label || `${t(`prop.kind.${kind}`)} ${i + 1}`])];
      return sel(`audio.devices.${slot}`, opts, `audio.global.${slot}`, kind === 'audioinput' ? 'srcMic' : 'srcSpeaker');
    };
    return [
      row('mixer', t('settings.audio.sampleRate'), seg('audio.sampleRate', SAMPLE_RATES.map((x) => [x, `${x / 1000} kHz`]))),
      row('mixer', t('settings.audio.channels'), seg('audio.channels', CHANNELS.map((x) => [x, t(`opt.channels.${x}`)]))),
      head('srcSpeaker', 'settings.audio.devices'),
      ...['desktop1', 'desktop2'].map((slot) => row('srcSpeaker', t(`audio.global.${slot}`), deviceSel(slot, 'audiooutput'))),
      ...['mic1', 'mic2', 'mic3', 'mic4'].map((slot) => row('srcMic', t(`audio.global.${slot}`), deviceSel(slot, 'audioinput'))),
      row('refresh', t('prop.refreshDevices'), button('devices', t('prop.refreshDevices'), 'refresh', 'small')),
      head('headphones', 'settings.audio.monitoring'),
      row('headphones', t('settings.audio.monitorDevice'), sel('audio.monitorDevice', [['default', t('prop.deviceDefault')], ...devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default').map((d, i) => [d.deviceId, d.label || `${t('prop.kind.audiooutput')} ${i + 1}`])], 'settings.audio.monitorDevice', 'headphones')),
      head('meter', 'settings.audio.meters'),
      row('meter', t('settings.audio.meterDecay'), seg('audio.meterDecay', METER_DECAY.map((x) => [x, t(`opt.meterDecay.${x}`)]))),
      row('meter', t('settings.audio.peakMeter'), seg('audio.peakMeter', PEAK_METER.map((x) => [x, t(`opt.peakMeter.${x}`)]))),
      head('mixer', 'settings.audio.trackNames'),
      `<div class="track-names">${[0, 1, 2, 3, 4, 5].map((i) => `<label class="track-name"><span>${i + 1}</span>${txt(`audio.trackNames.${i}`, 'settings.audio.trackNames', { placeholder: t('audio.trackN', { n: i + 1 }) })}</label>`).join('')}</div>`,
    ].join('');
  }

  function video() {
    const p = P();
    const [w, h2] = p.video.output.split('x').map(Number);
    const fps = parseFloat(p.video.fps);
    return [
      row('canvasSize', t('settings.video.base'), sel('video.base', [...new Set([p.video.base, ...BASE_SIZES])].map((x) => [x, x]), 'settings.video.base', 'canvasSize')),
      row('canvasSize', t('settings.video.output'), sel('video.output', [...new Set([p.video.output, ...scaledSizes(p.video.base)])].map((x) => [x, x]), 'settings.video.output', 'canvasSize')),
      row('edit', t('settings.video.custom'), `${txt('video.base', 'settings.video.base', { placeholder: '1920x1080' })}${txt('video.output', 'settings.video.output', { placeholder: '1280x720' })}`),
      row('fps', t('settings.video.fps'), sel('video.fps', [...new Set([p.video.fps, ...FPS_COMMON.map((x) => String(parseFloat(x)))])].map((x) => [x, `${x} fps`]), 'settings.video.fps', 'fps')),
      row('filter', t('settings.video.downscale'), seg('video.downscale', DOWNSCALE.map((x) => [x, t(`opt.downscale.${x}`)]))),
      note(t('settings.video.recommended', { bitrate: recommendedBitrate(w, h2, fps) })),
    ].join('');
  }

  function hotkeys() {
    const c = currentCollection();
    const p = P();
    const filter = (h.state.hkFilter ?? '').toLowerCase();
    const actions = hotkeyActions(c).filter((a) => !filter || t(...a.label).toLowerCase().includes(filter));
    const [list, pager] = h.paged('hotkeys', actions, 11);
    const capture = h.state.hkCapture;
    const rows = list.map((a) => {
      const combos = [].concat(p.hotkeys[a.id] ?? []);
      return `<div class="row hk-row" title="${esc(t(...a.label))}"><span class="row-label">${icon(a.group.startsWith('scene') ? 'srcScene' : a.group.startsWith('source') ? 'sources' : 'keyboard')}<span>${esc(t(...a.label))}</span></span>
        <span class="row-control"><button class="hk-box ${capture === a.id ? 'capturing' : ''}" data-action="hk-capture" data-value="${esc(a.id)}" title="${esc(t('settings.hotkeys.capture'))}">${esc(capture === a.id ? t('settings.hotkeys.pressKey') : combos.join(' · ') || t('settings.hotkeys.none'))}</button>
        <button class="icon-button" data-action="hk-clear" data-value="${esc(a.id)}" ${combos.length ? '' : 'disabled'} title="${esc(t('settings.hotkeys.clear'))}" aria-label="${esc(t('settings.hotkeys.clear'))}">${icon('close')}</button></span></div>`;
    }).join('');
    return `<div class="row"><span class="row-label">${icon('search')}<span>${esc(t('settings.hotkeys.filter'))}</span></span><span class="row-control"><input type="text" class="text-input" data-hk-filter value="${esc(h.state.hkFilter ?? '')}" aria-label="${esc(t('settings.hotkeys.filter'))}" />${pager}</span></div>${rows}${note(t(h.desktop ? 'settings.hotkeys.globalNote' : 'settings.hotkeys.webNote'))}`;
  }

  function accessibility() {
    return [
      row('palette', t('settings.selectionColor'), `<input type="color" data-color-setting="selectionColor" value="${esc(s().selectionColor)}" aria-label="${esc(t('settings.selectionColor'))}" />`),
      toggle('safeAreas', t('action.safeAreas'), 'safeAreas'),
      row('mixer', t('settings.mixerLayout'), segmented('mixerLayout', [['horizontal', t('opt.mixerLayout.horizontal')], ['vertical', t('opt.mixerLayout.vertical')]], s().mixerLayout)),
      note(t('settings.accessibilityHint')),
    ].join('');
  }

  function advanced() {
    const p = P();
    return [
      head('fileVideo', 'settings.advanced.recording'),
      row('edit', t('settings.advanced.filename'), txt('advanced.filenameFormat', 'settings.advanced.filename')),
      note(t('settings.advanced.filenameHelp')),
      check('advanced.overwrite', 'settings.advanced.overwrite', 'warning'),
      check('advanced.autoRemux', 'settings.advanced.autoRemux', 'remux'),
      row('remux', t('settings.advanced.remuxFormat'), seg('advanced.remuxFormat', REMUX_FORMATS.map((x) => [x, x.toUpperCase()]))),
      row('replay', t('settings.advanced.replayPrefix'), `${txt('advanced.replayPrefix', 'settings.advanced.replayPrefix')}${txt('advanced.replaySuffix', 'settings.advanced.replaySuffix', { placeholder: t('settings.advanced.replaySuffix') })}`),
      head('clock', 'settings.advanced.delay'),
      check('advanced.delay.enabled', 'settings.advanced.delayEnabled', 'clock'),
      row('clock', t('settings.advanced.delaySeconds'), num('advanced.delay.seconds', 1, 1800, 1, 's', 'settings.advanced.delaySeconds')),
      check('advanced.delay.preserve', 'settings.advanced.delayPreserve', 'clock'),
      head('refresh', 'settings.advanced.reconnect'),
      check('advanced.reconnect.enabled', 'settings.advanced.reconnectEnabled', 'refresh'),
      row('clock', t('settings.advanced.reconnectDelay'), num('advanced.reconnect.delay', 1, 30, 1, 's', 'settings.advanced.reconnectDelay')),
      row('refresh', t('settings.advanced.reconnectRetries'), num('advanced.reconnect.retries', 1, 10000, 1, '', 'settings.advanced.reconnectRetries')),
      head('terminal', 'settings.advanced.ffmpeg'),
      row('terminal', t('settings.advanced.ffmpegPath'), `<span class="path" title="${esc(p.advanced.ffmpegPath || t('settings.advanced.ffmpegAuto'))}">${esc(p.advanced.ffmpegPath || t('settings.advanced.ffmpegAuto'))}</span>${h.desktop ? `${button('choose-ffmpeg', t('settings.output.browse'), 'folderOpen', 'small')}${button('find-ffmpeg', t('settings.advanced.ffmpegFind'), 'search', 'small')}` : ''}`),
      h.state.ffmpeg !== undefined ? note(h.state.ffmpeg ? t('settings.advanced.ffmpegFound', { path: h.state.ffmpeg.path, version: h.state.ffmpeg.version }) : t('error.ffmpegMissing')) : note(t(h.desktop ? 'settings.advanced.ffmpegHelp' : 'settings.advanced.ffmpegWeb')),
      ...vcamRows(),
    ].join('');
  }

  return { general, stream, output, audio, video, hotkeys, accessibility, advanced };
}

function scaledSizes(base) {
  const [w, h] = base.split('x').map(Number);
  return [1, 1.25, 1.5, 1.67, 2, 2.25, 2.5, 3].map((k) => `${Math.round(w / k / 2) * 2}x${Math.round(h / k / 2) * 2}`);
}

/** A keydown in capture mode → the binding to add (null: Esc / a bare modifier). */
export function captured(event) {
  if (event.key === 'Escape') return null;
  const combo = comboOf(event);
  return combo ? normalizeCombo(combo) : undefined;
}
