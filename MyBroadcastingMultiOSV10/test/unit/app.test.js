// Unit tests (node:test, no browser) of the app around the engine: icons, texts (every catalogue name and
// option in both languages), settings, profiles, hotkeys, tools, the remote-control protocol, the relay's
// WebSocket framing and FFmpeg arguments, samples, the recent list, print setup and popup events.
// [F:<id>] in a name marks the feature (src/bc/features.js) the test proves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'src');
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const f = path.join(dir, n); if (statSync(f).isDirectory()) walk(f, out); else if (/\.js$/.test(n)) out.push(f); } return out; };
const sources = walk(src).filter((f) => !/[\\/]i18n[\\/]/.test(f));

const { hasIcon, ICON_NAMES, animationIcon } = await import('../../src/icons.js');
const { toneOf } = await import('../../src/icon-tones.js');
const { DICTIONARIES } = await import('../../src/i18n.js');
const { ANIMATIONS, normalizeSettings, defaultSettings, resetForNewInstall } = await import('../../src/domain/settings.js');
const { addRecent, removeRecent } = await import('../../src/domain/recent.js');
const { DARK_THEMES, LIGHT_THEMES } = await import('../../src/themes.js');
const { SOURCE_TYPES, FILTER_TYPES, TRANSITION_TYPES, BLEND_MODES, BOUNDS_TYPES, SCALE_FILTERS, ALIGNMENTS } = await import('../../src/bc/catalog.js');
const { FEATURES, AREAS } = await import('../../src/bc/features.js');
const M = await import('../../src/bc/model.js');
const { defaultProfile, normalizeProfile, encodersOf, videoOf, fpsOf, loadProfiles, storeProfiles, simpleRecordBitrate } = await import('../../src/studio/profile.js');
const { hotkeyActions, comboOf, normalizeCombo, toAccelerator, keyMap, pruneBindings, GENERAL_ACTIONS } = await import('../../src/studio/hotkeys.js');
const { switcherPick, loadTools, defaultTools } = await import('../../src/studio/tools.js');
const { RemoteControl, authString, REQUESTS } = await import('../../src/studio/wsproto.js');
const { frame, parseFrames } = await import('../../server/relay.mjs');
const { streamArgs } = await import('../../server/ffargs.mjs');
const { SAMPLE_COLLECTIONS, SAMPLE_ICONS, sampleText } = await import('../../src/bc/samples.js');
const { REPORTS } = await import('../../src/studio/reports.js');
const { normalizePrint, sheetOf, parseRanges, rangesText, pageCss, withPageCss } = await import('../../src/print/printwin.js');

const has = (key) => key in DICTIONARIES.ko && key in DICTIONARIES.en;

test('every icon the app names exists, and each has a colour tone', () => {
  const missing = new Set();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bicon\(\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
    for (const m of text.matchAll(/\bicon:\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
    for (const m of text.matchAll(/\bglyph:\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
  }
  for (const t of [...Object.values(SOURCE_TYPES), ...Object.values(FILTER_TYPES), ...Object.values(TRANSITION_TYPES)]) if (!hasIcon(t.icon)) missing.add(t.icon);
  for (const v of Object.values(SAMPLE_ICONS)) if (!hasIcon(v)) missing.add(v);
  for (const r of REPORTS) if (!hasIcon(`report${r[0].toUpperCase()}${r.slice(1)}`)) missing.add(`report ${r}`);
  assert.deepEqual([...missing], []);
  assert.ok(ICON_NAMES.length > 400);
  for (const name of ICON_NAMES) assert.ok(toneOf(name), name);
});

test('[F:shell.start] 16 moving broadcast backgrounds, each with its own icon and name in both languages', () => {
  assert.equal(ANIMATIONS.length, 16);
  for (const kind of ANIMATIONS) {
    assert.ok(hasIcon(animationIcon(kind)), kind);
    assert.ok(has(`animation.${kind}`), kind);
  }
});

test('[F:shell.themes] 20 dark and 20 light themes with names in both languages', () => {
  assert.equal(DARK_THEMES.length, 20);
  assert.equal(LIGHT_THEMES.length, 20);
  assert.equal(new Set([...DARK_THEMES, ...LIGHT_THEMES].map((x) => x.id)).size, 40);
  for (const theme of [...DARK_THEMES, ...LIGHT_THEMES]) assert.ok(theme.name.ko && theme.name.en && theme.dark === DARK_THEMES.includes(theme), theme.id);
});

test('[F:shell.language] both dictionaries have the same keys', () => {
  const ko = Object.keys(DICTIONARIES.ko);
  const en = new Set(Object.keys(DICTIONARIES.en));
  assert.deepEqual(ko.filter((k) => !en.has(k)), []);
  assert.deepEqual([...en].filter((k) => !(k in DICTIONARIES.ko)), []);
});

test('every catalogue name, field label and option label exists in Korean and English', () => {
  const missing = [];
  const need = (k) => { if (!has(k)) missing.push(k); };
  for (const [id, type] of Object.entries(SOURCE_TYPES)) {
    need(`src.${id}`);
    for (const f of type.props) {
      if (f.type === 'button') { need(`prop.action.${f.action}`); continue; }
      need(f.label ?? `prop.${f.key}`);
      if (f.type === 'select') for (const o of f.options) if (!Array.isArray(o) && !/^\d/.test(String(o)) && !has(`opt.${f.key}.${o}`) && !has(`opt.${o}`)) missing.push(`opt.${f.key}.${o}`);
    }
  }
  for (const [id, type] of Object.entries(FILTER_TYPES)) {
    need(`flt.${id}`);
    for (const f of type.props) { need(f.label ?? `prop.${f.key}`); if (f.type === 'select') for (const o of f.options) if (!/^\d/.test(String(o)) && !/:/.test(String(o)) && !/x/.test(String(o)) && !has(`opt.${f.key}.${o}`) && !has(`opt.${o}`)) missing.push(`opt.${f.key}.${o}`); }
    if (type.unsupported) need(`filter.unsupported.${type.unsupported}`);
  }
  for (const [id, type] of Object.entries(TRANSITION_TYPES)) { need(`trn.${id}`); for (const f of type.props) { need(`prop.${f.key}`); if (f.type === 'select') for (const o of f.options) need(`opt.${f.key}.${o}`); } }
  for (const x of BLEND_MODES) need(`blend.${x}`);
  for (const x of BOUNDS_TYPES) need(`bounds.${x}`);
  for (const x of SCALE_FILTERS) need(`scaleFilter.${x}`);
  for (const x of ALIGNMENTS) need(`align.${x}`);
  for (const a of GENERAL_ACTIONS) need(`hk.${a}`);
  for (const r of REPORTS) { need(`report.${r}`); need(`report.${r}.desc`); }
  for (const s of SAMPLE_COLLECTIONS) { need(`sample.${s}`); need(`sample.${s}.desc`); }
  for (const a of AREAS) need(`feature.area.${a}`);
  for (const st of ['full', 'adapted', 'external', 'unsupported']) need(`feature.status.${st}`);
  assert.deepEqual(missing, []);
  assert.ok(FEATURES.every((f) => AREAS.includes(f.area)));
});

// ───────────────────────── settings, profiles

test('[F:set.general] [F:set.accessibility] app settings keep the broadcasting preferences inside their limits', () => {
  const s = normalizeSettings({ snap: { distance: 500, edges: 'no' }, mixerLayout: 'diagonal', selectionColor: 'red', report: 'x', rightTab: 'zzz', confirmStartStream: 'yes' }, 'ko');
  assert.equal(s.snap.distance, 60);
  assert.equal(s.snap.edges, true);
  assert.equal(s.mixerLayout, 'horizontal');
  assert.equal(s.selectionColor, '#ff3b3b');
  assert.equal(s.report, 'scenes');
  assert.equal(s.rightTab, 'props');
  assert.equal(s.confirmStartStream, true);
  assert.equal(defaultSettings('ko').showBottomPanel, true);
});

test('a new installation resets preferences but keeps scene collections and profiles', () => {
  const store = new Map([['mybroadcasting.settings.v1', '{"theme":"x","lastDirectory":"C:/v"}'], ['mybroadcasting.collection.Show', '{}'], ['mybroadcasting.profiles.v1', '{}'], ['mybroadcasting.tools.v1', '{}']]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => [...store.keys()][i] };
  assert.equal(resetForNewInstall(storage, 'token-1'), true);
  assert.ok(store.has('mybroadcasting.collection.Show'));
  assert.ok(store.has('mybroadcasting.profiles.v1'));
  assert.ok(!store.has('mybroadcasting.tools.v1'));
  assert.equal(JSON.parse(store.get('mybroadcasting.settings.v1')).lastDirectory, 'C:/v');
});

test('[F:set.video] [F:out.scaling] video settings: base and output sizes, frame rates, downscale filter', () => {
  assert.deepEqual(fpsOf('29.97'), { num: 30000, den: 1001, value: 30000 / 1001 });
  assert.equal(fpsOf('60').value, 60);
  const p = normalizeProfile({ video: { base: '2560x1440', output: '1281x721', fps: '60', downscale: 'nope' } });
  assert.equal(p.video.downscale, 'bicubic');
  const v = videoOf(p);
  assert.deepEqual([v.baseW, v.baseH, v.outW, v.outH, v.fps], [2560, 1440, 1280, 720, 60], 'odd output sizes become even (encoders need it)');
  assert.equal(normalizeProfile({ video: { base: 'big' } }).video.base, '1920x1080');
});

test('[F:set.output] [F:out.simpleAdvanced] simple and advanced output modes give the encoders their settings', () => {
  const simple = encodersOf(normalizeProfile({ output: { mode: 'simple', simple: { videoBitrate: 4000, recQuality: 'stream', recFormat: 'mkv' } } }));
  assert.equal(simple.sameEncoder, true);
  assert.equal(simple.stream.bitrate, 4000);
  assert.equal(simple.container, 'mkv');
  const high = encodersOf(normalizeProfile({ output: { mode: 'simple', simple: { recQuality: 'high' } } }));
  assert.equal(high.sameEncoder, false);
  assert.ok(high.record.bitrate > high.stream.bitrate);
  assert.ok(simpleRecordBitrate('indistinguishable', 1920, 1080, 30, 2500) > simpleRecordBitrate('high', 1920, 1080, 30, 2500));
  const adv = encodersOf(normalizeProfile({ output: { mode: 'advanced', stream: { encoder: 'hevc', bitrate: 6000, track: 2 }, record: { sameAsStream: false, encoder: 'av1', rateControl: 'CQP', cqp: 18, tracks: [1, 3, 9], format: 'webm', split: { mode: 'time', minutes: 30 } } } }));
  assert.deepEqual([adv.stream.codec, adv.record.codec, adv.record.rateControl, adv.record.cqp], ['hevc', 'av1', 'CQP', 18]);
  assert.deepEqual(adv.tracks, [1, 3], 'tracks outside 1…6 dropped');
  assert.equal(adv.audio.record.codec, 'opus', 'WebM takes Opus');
  assert.equal(adv.streamTrack, 2);
  assert.equal(adv.split.minutes, 30);
});

test('[F:set.audio] [F:set.stream] [F:set.advanced] audio, stream and advanced settings are repaired', () => {
  const p = normalizeProfile({ audio: { sampleRate: 96000, channels: '7.1', meterDecay: 'x' }, stream: { service: 'youtube', key: 123 }, advanced: { delay: { seconds: 99999 }, reconnect: { retries: -5 }, remuxFormat: 'avi', websocket: { port: 80 } } });
  assert.deepEqual([p.audio.sampleRate, p.audio.channels, p.audio.meterDecay], [48000, 'stereo', 'fast']);
  assert.equal(p.stream.key, '123');
  assert.equal(p.advanced.delay.seconds, 1800);
  assert.equal(p.advanced.reconnect.retries, 1);
  assert.equal(p.advanced.remuxFormat, 'mp4');
  assert.equal(p.advanced.websocket.port, 1024);
  assert.deepEqual(Object.keys(p.audio.devices), ['desktop1', 'desktop2', 'mic1', 'mic2', 'mic3', 'mic4']);
});

test('[F:col.profiles] profiles are stored, listed with unique names and fall back to one', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const empty = loadProfiles(storage);
  assert.equal(empty.list.length, 1);
  storeProfiles(storage, { list: [defaultProfile('A'), defaultProfile('A'), defaultProfile('B')], current: 'B' });
  const back = loadProfiles(storage);
  assert.deepEqual(back.list.map((p) => p.name), ['A', 'A 2', 'B']);
  assert.equal(back.current, 'B');
});

// ───────────────────────── hotkeys

test('[F:hk.bind] every action of a collection can be bound; combos normalise; stale bindings drop', () => {
  const c = M.createCollection();
  const mic = M.createSource(c, 'wasapi_input_capture', 'Mic');
  const media = M.createSource(c, 'ffmpeg_source', 'Clip');
  const it = M.addItem(c, c.current, mic.id);
  M.addItem(c, c.current, media.id);
  const ids = hotkeyActions(c).map((a) => a.id);
  for (const a of GENERAL_ACTIONS) assert.ok(ids.includes(a), a);
  assert.ok(ids.includes(`scene:${c.current}`));
  assert.ok(ids.includes(`item:${c.current}:${it.id}:show`));
  assert.ok(ids.includes(`source:${mic.id}:ptt`) && ids.includes(`source:${mic.id}:mute`));
  assert.ok(ids.includes(`source:${media.id}:restart`));
  assert.ok(ids.some((x) => x.startsWith('quick:')));
  assert.equal(normalizeCombo('shift+ctrl+r'), 'Ctrl+Shift+R');
  assert.equal(comboOf({ key: 'r', code: 'KeyR', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+R');
  assert.equal(comboOf({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), null);
  assert.equal(comboOf({ key: 'F5', code: 'F5' }), 'F5');
  const map = keyMap({ startStream: ['ctrl+f1'], startRecording: ['Ctrl+F1'] });
  assert.deepEqual(map.get('Ctrl+F1'), ['startStream', 'startRecording'], 'one key may run several actions');
  assert.deepEqual(Object.keys(pruneBindings({ 'scene:gone': ['A'], startStream: ['B'] }, c)), ['startStream']);
});

test('[F:hk.global] hotkeys become the global-shortcut plug-in\'s accelerators', () => {
  assert.equal(toAccelerator('Ctrl+Shift+R'), 'Control+Shift+KeyR');
  assert.equal(toAccelerator('Alt+5'), 'Alt+Digit5');
  assert.equal(toAccelerator('Meta+Num3'), 'Super+Numpad3');
  assert.equal(toAccelerator('F9'), 'F9');
  assert.equal(toAccelerator('Ctrl+Up'), 'Control+ArrowUp');
});

// ───────────────────────── tools

test('[F:tool.sceneSwitcher] the scene switcher matches window titles (text and /regex/) and the no-match rule', () => {
  const scenes = [{ name: 'Game' }, { name: 'Chat' }, { name: 'Away' }];
  const sw = { ...defaultTools().switcher, rules: [{ window: 'minecraft', scene: 'Game' }, { window: '^Discord', regex: true, scene: 'Chat' }], noMatch: 'switch', noMatchScene: 'Away' };
  assert.equal(switcherPick(sw, 'Minecraft 1.21', scenes), 'Game');
  assert.equal(switcherPick(sw, 'Discord - #general', scenes), 'Chat');
  assert.equal(switcherPick(sw, 'Notepad', scenes), 'Away');
  assert.equal(switcherPick({ ...sw, noMatch: 'none' }, 'Notepad', scenes), null);
  assert.equal(switcherPick({ ...sw, rules: [{ window: '(', regex: true, scene: 'Game' }], noMatch: 'none' }, '(', scenes), null, 'a bad regex matches nothing');
});

test('[F:tool.outputTimer] tool settings keep their shape (timers, switcher, scripts, captions)', () => {
  const store = new Map([['mybroadcasting.tools.v1', JSON.stringify({ timer: { stream: { enabled: true, m: 5 } }, scripts: [{ name: 'x', code: 1 }] })]]);
  const t = loadTools({ getItem: (k) => store.get(k) ?? null });
  assert.deepEqual([t.timer.stream.enabled, t.timer.stream.m, t.timer.stream.h, t.timer.record.enabled], [true, 5, 0, false]);
  assert.deepEqual(t.scripts, [{ name: 'x', code: '1', enabled: false }]);
  assert.equal(t.captions.language, 'ko-KR');
});

// ───────────────────────── remote control (WebSocket protocol 5)

function fakeStudio() {
  const c = M.createCollection();
  const b = M.addScene(c, 'B');
  const mic = M.createSource(c, 'wasapi_input_capture', 'Mic');
  M.addItem(c, c.current, mic.id);
  const listeners = new Map();
  const calls = [];
  const s = {
    c, studioMode: false, outputs: { stream: null, recording: null, replay: null, vcam: false }, profiles: { list: [{ name: 'P' }], current: 'P' }, collections: { names: ['C'], current: 'C' },
    on: (e, fn) => { listeners.set(e, fn); return () => listeners.delete(e); }, emit: (e, d) => listeners.get(e)?.(d),
    transitionTo: (id) => { calls.push(['transitionTo', id]); c.current = id; return true; },
    setAudio: (id, patch) => { Object.assign(c.sources[id].audio, patch); calls.push(['setAudio', id, patch]); },
    stats: () => ({ fps: 30, renderMs: 1, lagged: 0, frames: 10, skipped: 0, encoded: 10, stream: null, recording: null }),
    toggleVisible: (id, v) => calls.push(['toggleVisible', id, v]), change: (l, fn) => fn(c),
    selectScene: (id) => { c.preview = id; }, studioTransition: () => calls.push(['studioTransition']),
    switchProfile: () => true, switchCollection: () => true, addScene: (n) => M.addScene(c, n), removeScene: (id) => M.removeScene(c, id),
    setTransition: (id) => { c.transition = id; }, setDuration: (ms) => { c.duration = ms; }, updateSettings: () => {},
    engine: { runtime: () => ({ control: (a) => calls.push(['control', a]) }), screenshot: async () => null },
    pauseRecording: () => false, resumeRecording: () => false, splitRecording: () => {}, addChapter: () => null,
  };
  return { s, b, mic, calls, listeners };
}

test('[F:tool.websocket] remote-control protocol 5: hello, identify with a password, requests, events, batches', async () => {
  const { s, b, mic, calls } = fakeStudio();
  const sent = [];
  const runs = [];
  const rc = new RemoteControl(s, { send: (id, text) => sent.push([id, JSON.parse(text)]), run: async (id) => { runs.push(id); }, password: 'secret', auth: true });
  await rc.open(1);
  const hello = sent.at(-1)[1];
  assert.equal(hello.op, 0);
  assert.equal(hello.d.rpcVersion, 1);
  await rc.message(1, JSON.stringify({ op: 6, d: { requestType: 'GetVersion', requestId: 'x' } }));
  assert.equal(sent.at(-1)[1].close, 4007, 'requests before Identify close the connection');
  await rc.message(1, JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: 'wrong' } }));
  assert.equal(sent.at(-1)[1].close, 4009);
  await rc.open(2);
  const h2 = sent.at(-1)[1].d.authentication;
  await rc.message(2, JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: await authString('secret', h2.salt, h2.challenge) } }));
  assert.equal(sent.at(-1)[1].op, 2);
  const ask = async (requestType, requestData = {}) => { await rc.message(2, JSON.stringify({ op: 6, d: { requestType, requestId: requestType, requestData } })); return sent.at(-1)[1].d; };
  assert.equal((await ask('GetSceneList')).responseData.scenes.length, 2);
  assert.equal((await ask('SetCurrentProgramScene', { sceneName: 'B' })).requestStatus.result, true);
  assert.deepEqual(calls.find((x) => x[0] === 'transitionTo'), ['transitionTo', b.id]);
  assert.equal((await ask('SetInputMute', { inputName: 'Mic', inputMuted: true })).requestStatus.code, 100);
  assert.equal(s.c.sources[mic.id].audio.muted, true);
  assert.equal((await ask('GetInputVolume', { inputName: 'Mic' })).responseData.inputVolumeMul, 1);
  await ask('SetInputVolume', { inputName: 'Mic', inputVolumeDb: -6 });
  assert.ok(Math.abs(s.c.sources[mic.id].audio.volume - 0.501) < 0.01);
  await ask('StartStream');
  await ask('ToggleRecord');
  assert.deepEqual(runs, ['startStream', 'startRecording']);
  assert.equal((await ask('NoSuchThing')).requestStatus.code, 204);
  assert.equal((await ask('SetCurrentProgramScene', { sceneName: 'Nope' })).requestStatus.code, 600);
  s.emit('program', b.id);
  assert.equal(sent.at(-1)[1].d.eventType, 'CurrentProgramSceneChanged');
  await rc.message(2, JSON.stringify({ op: 8, d: { requestId: 'batch', requests: [{ requestType: 'GetVersion' }, { requestType: 'GetStats' }] } }));
  assert.equal(sent.at(-1)[1].op, 9);
  assert.equal(sent.at(-1)[1].d.results.length, 2);
  assert.ok(REQUESTS.length > 50);
  rc.dispose();
});

// ───────────────────────── the web relay

test('[F:str.start] [F:str.protocols] the relay frames WebSocket messages and picks FFmpeg\'s output format per protocol', () => {
  const masked = (payload) => { const mask = [1, 2, 3, 4]; const data = Buffer.from(payload); return Buffer.concat([Buffer.from([0x82, 0x80 | data.length, ...mask]), Buffer.from(data.map((x, i) => x ^ mask[i % 4]))]); };
  const { frames, rest } = parseFrames(Buffer.concat([masked('abc'), masked('defg').subarray(0, 4)]));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].data.toString(), 'abc');
  assert.equal(rest.length, 4, 'a partial frame waits for more bytes');
  const big = frame(Buffer.alloc(70000), 2);
  assert.equal(big[1], 127);
  assert.equal(frame('hi', 1).toString('utf8', 2), 'hi');
  assert.ok(streamArgs('rtmp://a/b', 'aac').join(' ').includes('-f flv'));
  assert.ok(streamArgs('rtmps://a/b', 'opus').join(' ').includes('-c:a aac'));
  assert.ok(streamArgs('srt://h:1', 'opus').join(' ').includes('-f mpegts'));
  assert.ok(streamArgs('rist://h:1').join(' ').includes('-f mpegts'));
  assert.ok(streamArgs('out/live.m3u8').join(' ').includes('-f hls'));
});

// ───────────────────────── samples, recent list, print setup

test('[F:help.samples] six sample collections with names, descriptions and their own pictures', () => {
  assert.equal(SAMPLE_COLLECTIONS.length, 6);
  assert.match(sampleText('warm.cube'), /LUT_3D_SIZE 9/);
  assert.match(sampleText('chat.txt'), /viewer1/);
});

test('recent list: newest first, no duplicates (paths compare case- and slash-insensitively), at most 10', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = addRecent(list, { path: `C:\\shows\\${i}.mybc`, kind: 'file' });
  assert.equal(list.length, 10);
  list = addRecent(list, { path: 'c:/SHOWS/11.mybc', kind: 'file' });
  assert.equal(list.filter((x) => /11\.mybc$/i.test(x.path)).length, 1);
  assert.equal(removeRecent(list, 'C:\\shows\\11.mybc').length, 9);
});

test('[F:print.pdf] print setup: papers, orientation, ranges and the page CSS that follows the report\'s own', () => {
  const p = normalizePrint({ paper: 'A5', orientation: 'landscape', copies: 500, margins: 'wide', range: 'x' });
  assert.deepEqual(sheetOf(p), [210, 148]);
  assert.equal(p.copies, 99);
  assert.equal(p.range, 'all');
  assert.deepEqual(parseRanges('1-3, 5, 7-', 9), [1, 2, 3, 5, 7, 8, 9]);
  assert.equal(parseRanges('3-1', 9), null);
  assert.equal(rangesText([1, 2, 3, 5, 7, 8]), '1-3,5,7-8');
  assert.match(pageCss(p), /@page\{size:210mm 148mm;margin:25mm 25mm\}/);
  assert.match(pageCss({ ...p, color: 'gray' }), /grayscale/);
  const html = withPageCss('<html><head><style>@page{size:A4}</style></head><body></body></html>', p);
  assert.ok(html.indexOf('data-print-setup') > html.indexOf('@page{size:A4}'));
});

test('popup events: each popup only takes its own, so a hidden menu does not come back for the progress window', async () => {
  // A fake Tauri: like the real one, every listener of an event gets it, whichever window it was sent to.
  const listeners = [];
  const sent = [];
  const callbacks = new Map();
  let ids = 0;
  const saved = globalThis.window;
  globalThis.window = {
    addEventListener() {},
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
    __TAURI_INTERNALS__: {
      transformCallback: (callback) => { ids += 1; callbacks.set(ids, callback); return ids; },
      invoke: async (cmd, args) => {
        if (cmd === 'plugin:event|listen') { listeners.push({ event: args.event, id: args.handler }); return listeners.length; }
        if (cmd === 'plugin:event|emit_to') {
          sent.push(args);
          for (const l of listeners) if (l.event === args.event) callbacks.get(l.id)({ event: args.event, payload: args.payload });
          return null;
        }
        if (cmd === 'open_popup' || cmd === 'hide_popup') return null;
        return null;
      },
    },
  };
  try {
    const { PopupHost, forPopup } = await import('../../src/platform/popups.js');
    // The popup side (popup.js): a menu ignores what is meant for the progress window.
    assert.equal(forPopup('menu', 'progress'), false);
    assert.equal(forPopup('menu', 'menu'), true);
    assert.equal(forPopup('menu', undefined), true);
    // The host side: messages to a popup say whom they are for, and the host does not take them as a popup's.
    const host = new PopupHost();
    await host.init();
    const results = [];
    host.receive = (message) => results.push(message);
    await host.post('progress', { type: 'refresh' });
    assert.equal(sent.at(-1).payload.to, 'progress');
    assert.deepEqual(sent.at(-1).target, { kind: 'AnyLabel', label: 'popup-progress' });
    assert.deepEqual(results, [], 'a message to a popup is not one from a popup');
    await globalThis.window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'AnyLabel', label: 'main' }, event: 'popup-message', payload: { kind: 'menu', type: 'result', data: { id: 'x' } } });
    assert.equal(results.length, 1);
    // The menu's choice runs once its window has hidden itself (or after a short wait at most).
    const started = Date.now();
    const hidden = host.whenHidden('menu', 1000);
    await globalThis.window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'AnyLabel', label: 'main' }, event: 'popup-hidden', payload: 'menu' });
    await hidden;
    assert.ok(Date.now() - started < 500);
  } finally {
    globalThis.window = saved;
  }
});

// ───────────────────────── no other program's name
test('[F:help.about] no other broadcasting program is named in the code, texts or documents', () => {
  const name = String.fromCharCode(111, 98, 115); // the three letters, kept out of this file too
  const Cap = name[0].toUpperCase() + name.slice(1);
  const bad = new RegExp(String.raw`\b(${name}|${Cap}|${name.toUpperCase()})\b|\b${name}[_-]|\b${name}(?=[A-Z])|[a-z]${Cap}(?=[A-Z(])|${name.toUpperCase()}[_-]`);
  const top = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const skip = new Set(['node_modules', 'target', 'dist', 'test-results', '.git', 'icons', 'fixtures']);
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|rs|md|html|json|toml|css|nsh|svg)$/.test(entry) || /lock/.test(entry)) continue;
      readFileSync(full, 'utf8').split('\n').forEach((line, i) => { if (bad.test(line.replace(/\bjobs\b|Jobs\b/g, ''))) hits.push(`${path.relative(top, full)}:${i + 1}`); });
    }
  };
  for (const dir of ['src', 'src-tauri/src', 'src-tauri/tauri.conf.json', 'scripts', 'server', 'test', 'public/doc', 'README.md', 'ARCHITECTURE.md', 'USERSGUIDE.md', 'package.json']) {
    const full = path.join(top, dir);
    if (statSync(full).isDirectory()) walk(full);
    else readFileSync(full, 'utf8').split('\n').forEach((line, i) => { if (bad.test(line)) hits.push(`${dir}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

// ───────────────────────── direct viewing
test('[F:str.direct] direct viewing: no key needed, who may watch, addresses, ICE servers, profile limits', async () => {
  const { admit, parseIceServers, viewerUrls } = await import('../../src/bc/engine/viewers.js');
  const { checkStream } = await import('../../src/bc/services.js');
  const { normalizeProfile, defaultProfile } = await import('../../src/studio/profile.js');
  assert.deepEqual(checkStream({ service: 'direct', key: '', server: '' }), { problems: [], server: null, protocol: 'direct' });
  assert.equal(admit({ code: '', maxViewers: 2, watching: 0 }, {}), 'ok');
  assert.equal(admit({ code: 'abc', maxViewers: 2, watching: 0 }, { code: 'abd' }), 'code');
  assert.equal(admit({ code: 'abc', maxViewers: 2, watching: 0 }, { code: ' abc ' }), 'ok');
  assert.equal(admit({ code: '', maxViewers: 2, watching: 2 }, {}), 'full');
  assert.deepEqual(parseIceServers('stun:a:3478, turn:b\nhttp://no'), [{ urls: 'stun:a:3478' }, { urls: 'turn:b' }]);
  assert.deepEqual(viewerUrls(['192.168.0.5', '127.0.0.1', '127.0.0.1'], 8790, 'a b'), ['http://192.168.0.5:8790/?code=a%20b', 'http://127.0.0.1:8790/?code=a%20b']);
  const p = normalizeProfile({ ...defaultProfile(), stream: { ...defaultProfile().stream, direct: { port: 80, maxViewers: 500, code: '  x ' } } });
  assert.deepEqual([p.stream.direct.port, p.stream.direct.maxViewers, p.stream.direct.code], [1024, 100, 'x']);
  assert.equal(p.stream.direct.server, 'ws://127.0.0.1:8790');
});

test('[F:str.direct] the web build\'s viewer server: the page, and signalling between a viewer and this computer only', async () => {
  const { startViewerServer } = await import('../../server/viewers.mjs');
  const vs = await startViewerServer({ port: 0, host: '127.0.0.1', log: () => {} });
  const open = (url) => new Promise((resolve, reject) => { const ws = new WebSocket(url); const inbox = []; ws.onmessage = (e) => inbox.push(JSON.parse(e.data)); ws.onopen = () => resolve({ ws, inbox }); ws.onerror = () => reject(new Error(`no ${url}`)); });
  const until = async (fn) => { for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); assert.ok(fn()); };
  try {
    const page = await (await fetch(`http://127.0.0.1:${vs.port}/`)).text();
    assert.match(page, /RTCPeerConnection/);
    assert.equal((await fetch(`http://127.0.0.1:${vs.port}/secret`)).status, 404);
    const host = await open(`ws://127.0.0.1:${vs.port}/host`);
    await until(() => host.inbox.some((m) => m.ev === 'ready'));
    assert.equal(host.inbox[0].addresses.at(-1), '127.0.0.1');
    const viewer = await open(`ws://127.0.0.1:${vs.port}/ws`);
    await until(() => host.inbox.some((m) => m.ev === 'open'));
    const id = host.inbox.find((m) => m.ev === 'open').id;
    viewer.ws.send(JSON.stringify({ type: 'hello', code: '' }));
    await until(() => host.inbox.some((m) => m.ev === 'message'));
    assert.deepEqual(JSON.parse(host.inbox.find((m) => m.ev === 'message').text), { type: 'hello', code: '' });
    host.ws.send(JSON.stringify({ to: id, text: JSON.stringify({ type: 'welcome', title: 'T', live: true }) }));
    await until(() => viewer.inbox.length);
    assert.deepEqual(viewer.inbox[0], { type: 'welcome', title: 'T', live: true });
    viewer.ws.close();
    await until(() => host.inbox.some((m) => m.ev === 'close' && m.id === id));
    host.ws.close();
  } finally { await vs.close(); }
});

// ───────────────────────── account connection
test('[F:str.account] account connection: Twitch device code and YouTube PKCE fetch the stream key with the user\'s own Client ID', async () => {
  const { twitchConnect, youtubeConnect, base64url } = await import('../../src/studio/accounts.js');
  const { createHash } = await import('node:crypto');
  const calls = [];
  let polls = 0;
  const twitchIo = {
    sleep: async () => {}, openUrl: async (u) => calls.push(['open', u]),
    http: async (method, url, { form, headers } = {}) => {
      calls.push([method, url, form?.grant_type ?? headers?.Authorization ?? '']);
      if (url.endsWith('/oauth2/device')) return { status: 200, body: JSON.stringify({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://www.twitch.tv/activate', interval: 1, expires_in: 60 }) };
      if (url.endsWith('/oauth2/token')) { polls++; return polls === 1 ? { status: 400, body: '{"message":"authorization_pending"}' } : polls === 2 ? { status: 400, body: '{"message":"slow_down"}' } : { status: 200, body: '{"access_token":"tok"}' }; }
      if (url.endsWith('/helix/users')) return { status: 200, body: '{"data":[{"id":"42","login":"me","display_name":"Me"}]}' };
      if (url.includes('/helix/streams/key?broadcaster_id=42')) return { status: 200, body: '{"data":[{"stream_key":"live_123"}]}' };
      return { status: 404, body: '{}' };
    },
  };
  let shown = null;
  const t = await twitchConnect({ clientId: 'cid', io: twitchIo, onCode: (c) => { shown = c; } });
  assert.deepEqual(t, { login: 'Me', key: 'live_123' });
  assert.equal(shown.code, 'ABCD-1234');
  assert.equal(polls, 3);
  assert.ok(calls.some(([m, u, auth]) => m === 'GET' && u.endsWith('/helix/users') && auth === 'Bearer tok'));
  await assert.rejects(twitchConnect({ clientId: '', io: twitchIo }), /no-client-id/);
  await assert.rejects(twitchConnect({ clientId: 'cid', io: { ...twitchIo, http: async (m, u) => (u.endsWith('/device') ? twitchIo.http(m, u) : { status: 400, body: '{"message":"authorization_pending"}' }) }, signal: { cancelled: true } }), /cancelled/);

  // YouTube: the redirect must carry our state; the verifier is sent with the code.
  let authUrl = '';
  let sent = null;
  const ytIo = {
    random: (n) => new Uint8Array(n).fill(7), sha256: async (s) => new Uint8Array(createHash('sha256').update(s).digest()),
    loopback: async () => 50123, openUrl: async (u) => { authUrl = u; },
    waitRedirect: async () => `code=c0de&state=${new URL(authUrl).searchParams.get('state')}`,
    http: async (method, url, { form } = {}) => {
      if (url.endsWith('/token')) { sent = form; return { status: 200, body: '{"access_token":"yt"}' }; }
      if (url.includes('/liveStreams')) return { status: 200, body: JSON.stringify({ items: [{ snippet: { title: 'Main' }, cdn: { ingestionInfo: { streamName: 'abcd-efgh', ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2' } } }] }) };
      if (url.includes('/channels')) return { status: 200, body: '{"items":[{"snippet":{"title":"My Channel"}}]}' };
      return { status: 404, body: '{}' };
    },
  };
  const y = await youtubeConnect({ clientId: 'gid', clientSecret: 'sec', io: ytIo });
  assert.deepEqual(y, { login: 'My Channel', key: 'abcd-efgh' });
  const q = new URL(authUrl).searchParams;
  assert.equal(q.get('redirect_uri'), 'http://127.0.0.1:50123');
  assert.equal(q.get('code_challenge'), base64url(createHash('sha256').update(sent.code_verifier).digest()));
  assert.equal(sent.client_secret, 'sec');
  await assert.rejects(youtubeConnect({ clientId: 'gid', io: { ...ytIo, waitRedirect: async () => 'code=x&state=wrong' } }), /youtube-state/);
  await assert.rejects(youtubeConnect({ clientId: 'gid', io: { ...ytIo, http: async (m, u, o) => (u.includes('/liveStreams') ? { status: 200, body: '{"items":[]}' } : ytIo.http(m, u, o)) } }), /youtube-no-stream/);
});
