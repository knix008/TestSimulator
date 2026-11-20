// A profile: everything about how the program broadcasts and records (kept per profile):
// video sizes and rate, audio format and devices, the stream service, the outputs, advanced options and
// the hotkeys. Profiles are kept in localStorage (small); the settings popup edits them and the main window
// follows the storage event. Pure — tested in node.

export const PROFILES_KEY = 'mybroadcasting.profiles.v1';
export const BASE_SIZES = ['3840x2160', '2560x1440', '1920x1080', '1600x900', '1280x720', '1080x1920', '1080x1080', '854x480', '640x360'];
export const FPS_COMMON = ['10', '20', '24 NTSC', '25 PAL', '29.97', '30', '48', '50 PAL', '59.94', '60'];
export const DOWNSCALE = ['bilinear', 'area', 'bicubic', 'lanczos'];
export const SAMPLE_RATES = [44100, 48000];
export const CHANNELS = ['mono', 'stereo'];
export const METER_DECAY = ['fast', 'medium', 'slow'];
export const PEAK_METER = ['sample', 'truepeak'];
export const REC_QUALITY = ['stream', 'high', 'indistinguishable'];
export const LATENCY = ['quality', 'realtime'];
export const HARDWARE = ['no-preference', 'prefer-hardware', 'prefer-software'];
export const SPLIT_MODES = ['off', 'time', 'size'];
export const REMUX_FORMATS = ['mp4', 'mov', 'mkv', 'flv', 'ts'];
export const GLOBAL_AUDIO = ['desktop1', 'desktop2', 'mic1', 'mic2', 'mic3', 'mic4'];

/** '29.97' → { num: 30000, den: 1001 }; '30' → 30/1. */
export function fpsOf(label) {
  const v = parseFloat(String(label));
  const table = { 29.97: [30000, 1001], 59.94: [60000, 1001], 23.976: [24000, 1001] };
  const ntsc = table[v];
  if (ntsc) return { num: ntsc[0], den: ntsc[1], value: ntsc[0] / ntsc[1] };
  const n = Math.max(1, Math.min(240, Math.round(v) || 30));
  return { num: n, den: 1, value: n };
}

export function defaultProfile(name = 'Untitled') {
  return {
    name,
    video: { base: '1920x1080', output: '1920x1080', fps: '30', downscale: 'bicubic' },
    audio: { sampleRate: 48000, channels: 'stereo', devices: { desktop1: 'default', desktop2: '', mic1: 'default', mic2: '', mic3: '', mic4: '' }, monitorDevice: 'default', meterDecay: 'fast', peakMeter: 'sample', trackNames: ['', '', '', '', '', ''] },
    stream: { service: 'twitch', serverId: 'auto', server: '', key: '', bandwidthTest: false, whipToken: '', relay: 'ws://127.0.0.1:8765', direct: { port: 8790, code: '', maxViewers: 10, stun: 'stun:stun.l.google.com:19302', title: '', server: 'ws://127.0.0.1:8790' }, accounts: { twitch: { clientId: '', login: '' }, youtube: { clientId: '', clientSecret: '', login: '' } } },
    output: {
      mode: 'simple',
      simple: { videoBitrate: 2500, audioBitrate: 160, encoder: 'avc', hardware: 'prefer-hardware', recQuality: 'stream', recFormat: 'fmp4', recPath: '', replay: { enabled: false, seconds: 20, maxMB: 512 } },
      stream: { encoder: 'avc', rateControl: 'CBR', bitrate: 2500, keyint: 2, latency: 'realtime', hardware: 'prefer-hardware', audioCodec: 'aac', audioBitrate: 160, track: 1 },
      record: { path: '', format: 'fmp4', sameAsStream: true, encoder: 'avc', rateControl: 'VBR', bitrate: 8000, cqp: 20, keyint: 2, hardware: 'prefer-hardware', audioCodec: 'aac', audioBitrate: 192, tracks: [1], split: { mode: 'off', minutes: 15, mb: 2048 } },
      replay: { enabled: false, seconds: 20, maxMB: 512 },
    },
    advanced: {
      filenameFormat: '%CCYY-%MM-%DD %hh-%mm-%ss', overwrite: false, autoRemux: false, remuxFormat: 'mp4', replayPrefix: 'Replay', replaySuffix: '',
      delay: { enabled: false, seconds: 20, preserve: true }, reconnect: { enabled: true, delay: 2, retries: 25 }, ffmpegPath: '',
      websocket: { enabled: false, port: 4455, auth: true, password: '' },
    },
    hotkeys: {},
  };
}

const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
const size = (v, d) => (/^\d{2,5}x\d{2,5}$/.test(String(v)) ? String(v) : d);

/** A profile read from storage or a file: every field present and inside its limits. */
/** Account connection: the user's own Client IDs and the connected account names (text only). */
function normalizeAccounts(d, x = {}) {
  const out = {};
  for (const [k, v] of Object.entries(d)) out[k] = Object.fromEntries(Object.keys(v).map((f) => [f, String(x?.[k]?.[f] ?? v[f]).trim()]));
  return out;
}

/** Direct viewing: port 1024…65535, 1…100 viewers, text fields as text. */
function normalizeDirect(x) {
  const int = (v, lo, hi, fb) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
  return { port: int(x.port, 1024, 65535, 8790), code: String(x.code ?? '').trim(), maxViewers: int(x.maxViewers, 1, 100, 10), stun: String(x.stun ?? ''), title: String(x.title ?? ''), server: String(x.server ?? 'ws://127.0.0.1:8790') };
}

export function normalizeProfile(raw = {}) {
  const d = defaultProfile(raw?.name || 'Untitled');
  const r = raw && typeof raw === 'object' ? raw : {};
  const v = { ...d.video, ...r.video };
  const a = { ...d.audio, ...r.audio, devices: { ...d.audio.devices, ...r.audio?.devices } };
  const s = { ...d.stream, ...r.stream };
  const o = r.output ?? {};
  const out = {
    mode: pick(o.mode, ['simple', 'advanced'], 'simple'),
    simple: { ...d.output.simple, ...o.simple, replay: { ...d.output.simple.replay, ...o.simple?.replay } },
    stream: { ...d.output.stream, ...o.stream },
    record: { ...d.output.record, ...o.record, split: { ...d.output.record.split, ...o.record?.split } },
    replay: { ...d.output.replay, ...o.replay },
  };
  out.simple.videoBitrate = num(out.simple.videoBitrate, 200, 100000, 2500);
  out.simple.audioBitrate = pick(Number(out.simple.audioBitrate), [64, 96, 128, 160, 192, 256, 320], 160);
  out.simple.recQuality = pick(out.simple.recQuality, REC_QUALITY, 'stream');
  out.simple.recFormat = pick(out.simple.recFormat, ['mp4', 'fmp4', 'mov', 'mkv', 'webm'], 'fmp4');
  out.stream.bitrate = num(out.stream.bitrate, 200, 100000, 2500);
  out.stream.keyint = num(out.stream.keyint, 0, 20, 2);
  out.stream.rateControl = pick(out.stream.rateControl, ['CBR', 'VBR'], 'CBR');
  out.stream.track = num(out.stream.track, 1, 6, 1);
  out.record.bitrate = num(out.record.bitrate, 200, 500000, 8000);
  out.record.cqp = num(out.record.cqp, 0, 51, 20);
  out.record.rateControl = pick(out.record.rateControl, ['CBR', 'VBR', 'CQP'], 'VBR');
  out.record.tracks = [...new Set((Array.isArray(out.record.tracks) ? out.record.tracks : [1]).map(Number).filter((x) => x >= 1 && x <= 6))].sort();
  if (!out.record.tracks.length) out.record.tracks = [1];
  out.record.split.mode = pick(out.record.split.mode, SPLIT_MODES, 'off');
  out.record.split.minutes = num(out.record.split.minutes, 0.1, 1440, 15);
  out.record.split.mb = num(out.record.split.mb, 1, 1048576, 2048);
  for (const rb of [out.replay, out.simple.replay]) { rb.seconds = num(rb.seconds, 1, 21600, 20); rb.maxMB = num(rb.maxMB, 16, 65536, 512); rb.enabled = Boolean(rb.enabled); }
  const ad = { ...d.advanced, ...r.advanced, delay: { ...d.advanced.delay, ...r.advanced?.delay }, reconnect: { ...d.advanced.reconnect, ...r.advanced?.reconnect }, websocket: { ...d.advanced.websocket, ...r.advanced?.websocket } };
  ad.delay.seconds = num(ad.delay.seconds, 1, 1800, 20);
  ad.reconnect.delay = num(ad.reconnect.delay, 1, 30, 2);
  ad.reconnect.retries = num(ad.reconnect.retries, 1, 10000, 25);
  ad.websocket.port = num(ad.websocket.port, 1024, 65535, 4455);
  ad.remuxFormat = pick(ad.remuxFormat, REMUX_FORMATS, 'mp4');
  return {
    name: String(r.name || d.name),
    video: { base: size(v.base, d.video.base), output: size(v.output, d.video.output), fps: String(v.fps || '30'), downscale: pick(v.downscale, DOWNSCALE, 'bicubic') },
    audio: { ...a, sampleRate: pick(Number(a.sampleRate), SAMPLE_RATES, 48000), channels: pick(a.channels, CHANNELS, 'stereo'), meterDecay: pick(a.meterDecay, METER_DECAY, 'fast'), peakMeter: pick(a.peakMeter, PEAK_METER, 'sample'), trackNames: Array.from({ length: 6 }, (_, i) => String(a.trackNames?.[i] ?? '')) },
    stream: { ...s, key: String(s.key ?? ''), server: String(s.server ?? ''), direct: normalizeDirect({ ...d.stream.direct, ...s.direct }), accounts: normalizeAccounts(d.stream.accounts, s.accounts) },
    output: out,
    advanced: ad,
    hotkeys: r.hotkeys && typeof r.hotkeys === 'object' ? { ...r.hotkeys } : {},
  };
}

export const sizeOf = (s) => String(s).split('x').map(Number);

/** The engine's video settings from a profile. */
export function videoOf(p) {
  const [baseW, baseH] = sizeOf(p.video.base);
  const [outW, outH] = sizeOf(p.video.output);
  return { baseW, baseH, outW: outW - (outW % 2), outH: outH - (outH % 2), fps: fpsOf(p.video.fps).value, downscale: p.video.downscale };
}

/** Recording quality of the simple mode → a bitrate for a size and rate. */
export function simpleRecordBitrate(quality, w, h, fps, streamBitrate) {
  if (quality === 'stream') return streamBitrate;
  const base = (w * h * fps) / (1920 * 1080 * 30);
  return Math.round((quality === 'indistinguishable' ? 40000 : 15000) * Math.max(0.3, base));
}

/** The encoder settings of the stream and the recording, whichever mode the output is in. */
export function encodersOf(p) {
  const v = videoOf(p);
  const o = p.output;
  const channels = p.audio.channels === 'mono' ? 1 : 2;
  if (o.mode === 'simple') {
    const s = o.simple;
    const stream = { codec: s.encoder, width: v.outW, height: v.outH, fps: v.fps, bitrate: s.videoBitrate, rateControl: 'CBR', keyint: 2, hardware: s.hardware, latency: 'realtime' };
    const record = s.recQuality === 'stream' ? stream : { ...stream, bitrate: simpleRecordBitrate(s.recQuality, v.outW, v.outH, v.fps, s.videoBitrate), rateControl: 'VBR', latency: 'quality' };
    const audio = { codec: s.recFormat === 'webm' ? 'opus' : 'aac', bitrate: s.audioBitrate, sampleRate: p.audio.sampleRate, channels };
    return { stream, record, sameEncoder: s.recQuality === 'stream', audio: { stream: audio, record: audio }, container: s.recFormat, tracks: [1], streamTrack: 1, path: s.recPath, replay: s.replay, split: { mode: 'off' } };
  }
  const st = o.stream;
  const rc = o.record;
  const stream = { codec: st.encoder, width: v.outW, height: v.outH, fps: v.fps, bitrate: st.bitrate, rateControl: st.rateControl, keyint: st.keyint || 2, hardware: st.hardware, latency: st.latency };
  const record = rc.sameAsStream ? stream : { codec: rc.encoder, width: v.outW, height: v.outH, fps: v.fps, bitrate: rc.bitrate, rateControl: rc.rateControl, cqp: rc.cqp, keyint: rc.keyint || 2, hardware: rc.hardware, latency: 'quality' };
  return {
    stream, record, sameEncoder: rc.sameAsStream,
    audio: { stream: { codec: st.audioCodec, bitrate: st.audioBitrate, sampleRate: p.audio.sampleRate, channels }, record: { codec: rc.format === 'webm' ? 'opus' : rc.audioCodec, bitrate: rc.audioBitrate, sampleRate: p.audio.sampleRate, channels } },
    container: rc.format, tracks: rc.tracks, streamTrack: st.track, path: rc.path, replay: o.replay, split: rc.split,
  };
}

// ───────────────────────── the list of profiles

export function loadProfiles(storage) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(PROFILES_KEY) ?? 'null'); } catch { raw = null; }
  const list = Array.isArray(raw?.list) && raw.list.length ? raw.list.map(normalizeProfile) : [normalizeProfile({ name: 'Untitled' })];
  const names = new Set();
  for (const p of list) { let n = p.name; let i = 2; while (names.has(n)) n = `${p.name} ${i++}`; p.name = n; names.add(n); }
  const current = list.some((p) => p.name === raw?.current) ? raw.current : list[0].name;
  return { list, current };
}
export function storeProfiles(storage, state) {
  try { storage?.setItem(PROFILES_KEY, JSON.stringify({ list: state.list, current: state.current })); } catch { /* full or private */ }
}
export const currentProfile = (state) => state.list.find((p) => p.name === state.current) ?? state.list[0];
export function uniqueProfileName(state, base) {
  const names = new Set(state.list.map((p) => p.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}
