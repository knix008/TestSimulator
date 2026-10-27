// Audio: audioread / audiowrite / audioinfo for WAV (PCM 8/16/24/32-bit,
// IEEE float 32/64, WAVE_FORMAT_EXTENSIBLE), and playback through the GUI:
// sound / soundsc / audioplayer / beep post 'audio.*' messages to ctx.host.
import {
  E, S, N, str, num, bool, tensor, isTextArg, isTensor, toTensor, absPath, extName, readFileBytes, writeFileBytes,
  structScalar, nameValues, ByteWriter,
} from './util.js';
import { object } from '../../value.js';

// ---------------------------------------------------------------- WAV codec

/** Parses a WAV file → { format, channels, rate, bits, frames, data (Uint8Array view), info:{} }. */
export function parseWav(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    if (b.length >= 4 && tag(0) === 'RIFX') throw E('io:audioread:unsupported', 'Big-endian WAV (RIFX) files are not supported.');
    throw E('io:audioread:notWav', 'The file is not a WAV file.');
  }
  let p = 12;
  let fmt = null, data = null;
  const info = {};
  while (p + 8 <= b.length) {
    const id = tag(p), size = dv.getUint32(p + 4, true);
    const body = p + 8;
    const end = Math.min(b.length, body + size);
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true);
      const rate = dv.getUint32(body + 4, true);
      const blockAlign = dv.getUint16(body + 12, true);
      const bits = dv.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 40) format = dv.getUint16(body + 24, true);
      fmt = { format, channels, rate, blockAlign, bits };
    } else if (id === 'data') {
      data = b.subarray(body, end);
    } else if (id === 'LIST' && tag(body) === 'INFO') {
      let q = body + 4;
      while (q + 8 <= end) {
        const sid = tag(q), ss = dv.getUint32(q + 4, true);
        let s = ''; for (let k = q + 8; k < q + 8 + ss && b[k]; k++) s += String.fromCharCode(b[k]);
        info[sid] = s;
        q += 8 + ss + (ss & 1);
      }
    }
    p = body + size + (size & 1);
  }
  if (!fmt) throw E('io:audioread:corrupt', 'The WAV file has no format chunk.');
  if (!data) throw E('io:audioread:corrupt', 'The WAV file has no data chunk.');
  if (fmt.format !== 1 && fmt.format !== 3) throw E('io:audioread:unsupported', `WAV encoding ${fmt.format} is not supported (only PCM and IEEE float).`);
  const bps = fmt.bits >> 3;
  const frames = Math.floor(data.length / (bps * fmt.channels));
  return { ...fmt, frames, data, info };
}

function sampleReader(w) {
  const dv = new DataView(w.data.buffer, w.data.byteOffset, w.data.byteLength);
  const bps = w.bits >> 3;
  const ch = w.channels;
  if (w.format === 3) {
    if (w.bits === 32) return [(f, c) => dv.getFloat32((f * ch + c) * 4, true), 1, 'single'];
    if (w.bits === 64) return [(f, c) => dv.getFloat64((f * ch + c) * 8, true), 1, 'double'];
    throw E('io:audioread:unsupported', `Float WAV with ${w.bits} bits is not supported.`);
  }
  switch (w.bits) {
    case 8: return [(f, c) => w.data[f * ch + c], 1, 'uint8'];
    case 16: return [(f, c) => dv.getInt16((f * ch + c) * 2, true), 1, 'int16'];
    case 24: return [(f, c) => { const o = (f * ch + c) * 3; const v = w.data[o] | (w.data[o + 1] << 8) | (w.data[o + 2] << 16); return v & 0x800000 ? v - 0x1000000 : v; }, 1, 'int32'];
    case 32: return [(f, c) => dv.getInt32((f * ch + c) * 4, true), 1, 'int32'];
    default: throw E('io:audioread:unsupported', `PCM WAV with ${w.bits} bits per sample is not supported.`);
  }
  void bps;
}
const scaleOf = (w) => (w.format === 3 ? 1 : w.bits === 8 ? 128 : 2 ** (w.bits - 1));

/** Encodes a WAV. samples: per-channel Float64Array (double scale -1..1 unless intNative). */
export function encodeWav({ channels, rate, frames, get, bits, float, info }) {
  const bps = bits >> 3;
  const out = new ByteWriter(44 + frames * channels * bps + 64);
  const dataSize = frames * channels * bps;
  const infoChunk = [];
  for (const [k, v] of Object.entries(info || {})) if (v) infoChunk.push([k, v]);
  let listSize = 0;
  if (infoChunk.length) { listSize = 4; for (const [, v] of infoChunk) { const n = v.length + 1; listSize += 8 + n + (n & 1); } }
  out.ascii('RIFF'); out.u32(4 + 8 + 16 + 8 + dataSize + (dataSize & 1) + (listSize ? 8 + listSize : 0)); out.ascii('WAVE');
  out.ascii('fmt '); out.u32(16); out.u16(float ? 3 : 1); out.u16(channels); out.u32(rate); out.u32(rate * channels * bps); out.u16(channels * bps); out.u16(bits);
  if (listSize) {
    out.ascii('LIST'); out.u32(listSize); out.ascii('INFO');
    for (const [k, v] of infoChunk) { const n = v.length + 1; out.ascii(k); out.u32(n); out.ascii(v); out.u8(0); if (n & 1) out.u8(0); }
  }
  out.ascii('data'); out.u32(dataSize);
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) {
    const x = get(f, c);
    if (float) { if (bits === 32) out.f32(x); else out.f64(x); continue; }
    switch (bits) {
      case 8: out.u8(x); break;
      case 16: out.i16(x); break;
      case 24: { const v = x < 0 ? x + 0x1000000 : x; out.u8(v & 255); out.u8((v >> 8) & 255); out.u8((v >> 16) & 255); break; }
      default: out.i32(x);
    }
  }
  if (dataSize & 1) out.u8(0);
  return out.result();
}

function readWavFile(ctx, file) {
  const ext = extName(file);
  if (ext && ext !== '.wav' && ext !== '.wave') throw E('io:audioread:unsupportedFormat', `Audio format '${ext}' is not supported. Use WAV files.`);
  return parseWav(readFileBytes(ctx, file, 'io:audioread:fileNotFound'));
}

// ---------------------------------------------------------------- builtins

function audioread(args, nargout, ctx) {
  if (!args.length) throw E('io:audioread:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  const w = readWavFile(ctx, file);
  let start = 1, stop = w.frames;
  let dataType = 'double';
  for (const a of args.slice(1)) {
    if (isTextArg(a)) { dataType = S(a).toLowerCase(); if (dataType !== 'double' && dataType !== 'native') throw E('io:audioread:badDataType', "Data type must be 'double' or 'native'."); continue; }
    const r = Array.from(toTensor(a).re);
    if (r.length !== 2) throw E('io:audioread:badRange', 'Sample range must be [start finish].');
    start = r[0]; stop = r[1] === Infinity ? w.frames : r[1];
    if (!(start >= 1 && stop >= start - 1 && stop <= w.frames && Number.isInteger(start) && Number.isInteger(stop))) throw E('io:audioread:badRange', `Sample range must be within [1 ${w.frames}].`);
  }
  const [get, , nativeCls] = sampleReader(w);
  const n = stop - start + 1;
  const ch = w.channels;
  const re = new Float64Array(n * ch);
  const sc = scaleOf(w);
  for (let f = 0; f < n; f++) for (let c = 0; c < ch; c++) {
    let x = get(start - 1 + f, c);
    if (dataType === 'double') x = w.format === 3 ? x : w.bits === 8 ? (x - 128) / 128 : x / sc;
    re[f + c * n] = x;
  }
  let y;
  if (dataType === 'native') {
    if (nativeCls === 'single') for (let i = 0; i < re.length; i++) re[i] = Math.fround(re[i]);
    y = tensor(nativeCls, [n, ch], re);
  } else y = tensor('double', [n, ch], re);
  return [y, num(w.rate)];
}

function audioinfo(args, nargout, ctx) {
  if (!args.length) throw E('io:audioinfo:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  const w = readWavFile(ctx, file);
  return structScalar({
    Filename: str(absPath(ctx, file)),
    CompressionMethod: str('Uncompressed'),
    NumChannels: num(w.channels),
    SampleRate: num(w.rate),
    TotalSamples: num(w.frames),
    Duration: num(w.frames / w.rate),
    Title: str(w.info.INAM || ''),
    Comment: str(w.info.ICMT || ''),
    Artist: str(w.info.IART || ''),
    BitsPerSample: num(w.bits),
  });
}

function audiowrite(args, nargout, ctx) {
  if (args.length < 3) throw E('io:audiowrite:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  const ext = extName(file);
  if (ext !== '.wav' && ext !== '.wave') throw E('io:audiowrite:unsupportedFormat', `Audio format '${ext || '(none)'}' is not supported. Use a .wav file name.`);
  const y = args[1];
  if (!isTensor(y)) throw E('io:audiowrite:badData', 'Audio data must be a numeric matrix.');
  const rate = N(args[2], 'Sample rate');
  if (!(rate > 0) || !Number.isInteger(rate)) throw E('io:audiowrite:badRate', 'Sample rate must be a positive integer.');
  const o = nameValues(args, 3);
  let [frames, channels] = y.dims;
  if (frames === 1 && channels > 1 && y.dims.length === 2) { frames = channels; channels = 1; }
  const isFloatIn = y.cls === 'double' || y.cls === 'single';
  let bits = o.bitspersample !== undefined ? N(o.bitspersample) : y.cls === 'uint8' ? 8 : y.cls === 'int16' ? 16 : y.cls === 'int32' ? 32 : y.cls === 'single' ? 32 : 16;
  if (![8, 16, 24, 32, 64].includes(bits)) throw E('io:audiowrite:badBits', 'BitsPerSample must be 8, 16, 24, 32 or 64.');
  const float = bits === 64 || (bits === 32 && (y.cls === 'single' || (isFloatIn && o.bitspersample !== undefined)));
  if (bits === 64 && !isFloatIn) throw E('io:audiowrite:badBits', '64 bits per sample needs floating-point data.');
  let clipped = false;
  const at = (f, c) => y.re[f + c * frames];
  const get = (f, c) => {
    let x = at(f, c);
    if (isFloatIn) {
      if (float) return x;
      if (x > 1) { x = 1; clipped = true; } else if (x < -1) { x = -1; clipped = true; }
      if (Number.isNaN(x)) x = 0;
      if (bits === 8) return Math.min(255, Math.round((x + 1) * 128));
      const m = 2 ** (bits - 1);
      return Math.max(-m, Math.min(m - 1, Math.round(x * m)));
    }
    // integer input: rescale between integer classes
    const srcBits = { uint8: 8, int8: 8, int16: 16, int32: 32, uint16: 16, uint32: 32, int64: 64, uint64: 64 }[y.cls] || 16;
    let v = y.cls === 'uint8' ? (x - 128) / 128 : x / 2 ** (srcBits - 1);
    if (float) return v;
    if (bits === 8) return Math.min(255, Math.round((v + 1) * 128));
    const m = 2 ** (bits - 1);
    return Math.max(-m, Math.min(m - 1, Math.round(v * m)));
  };
  const info = { INAM: o.title ? S(o.title) : '', IART: o.artist ? S(o.artist) : '', ICMT: o.comment ? S(o.comment) : '' };
  const bytes = encodeWav({ channels, rate, frames, get, bits, float, info });
  if (clipped) ctx.warning('io:audiowrite:dataClipped', 'Data clipped when writing file.');
  writeFileBytes(ctx, file, bytes);
  return undefined;
}

// ---------------------------------------------------------------- playback

let playerSeq = 0;

function channelsOf(y, scaleTo = null) {
  const t = toTensor(y);
  let [frames, ch] = t.dims;
  if (frames === 1 && ch > 1) { frames = ch; ch = 1; }
  const isInt = t.cls !== 'double' && t.cls !== 'single';
  const k = t.cls === 'uint8' ? 128 : t.cls === 'int16' ? 32768 : t.cls === 'int32' ? 2147483648 : 1;
  const out = [];
  for (let c = 0; c < ch; c++) {
    const a = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let x = t.re[f + c * frames];
      if (isInt) x = t.cls === 'uint8' ? (x - 128) / 128 : x / k;
      if (scaleTo) x = scaleTo(x);
      a[f] = Math.max(-1, Math.min(1, Number.isNaN(x) ? 0 : x));
    }
    out.push(a);
  }
  return { frames, channels: out };
}

function postAudio(ctx, msg) { try { if (ctx.host && ctx.host.post) ctx.host.post(msg); } catch { /* no GUI */ } }

function sound(args, nargout, ctx) {
  if (!args.length) throw E('io:sound:notEnoughInputs', 'Not enough input arguments.');
  const fs = args[1] !== undefined ? N(args[1]) : 8192;
  const { frames, channels } = channelsOf(args[0]);
  postAudio(ctx, { type: 'audio.play', id: `sound${++playerSeq}`, sampleRate: fs, numChannels: channels.length, frames, channels });
  return undefined;
}
function soundsc(args, nargout, ctx) {
  if (!args.length) throw E('io:soundsc:notEnoughInputs', 'Not enough input arguments.');
  const t = toTensor(args[0]);
  let fs = 8192, range = null;
  for (const a of args.slice(1)) { const v = Array.from(toTensor(a).re); if (v.length === 2) range = v; else if (v.length === 1) fs = v[0]; }
  if (!range) { let m = 0; for (const x of t.re) if (Math.abs(x) > m && Number.isFinite(x)) m = Math.abs(x); range = [-m || -1, m || 1]; }
  const [lo, hi] = range;
  const { frames, channels } = channelsOf({ ...t, cls: 'double' }, (x) => (hi > lo ? (2 * (x - lo)) / (hi - lo) - 1 : 0));
  postAudio(ctx, { type: 'audio.play', id: `sound${++playerSeq}`, sampleRate: fs, numChannels: channels.length, frames, channels });
  return undefined;
}
function beep(args, nargout, ctx) {
  if (args.length) { const s = S(args[0]).toLowerCase(); ctx.state.beep = s === 'on'; return undefined; }
  if (ctx.state.beep !== false) postAudio(ctx, { type: 'audio.beep' });
  return undefined;
}

function playerProps(p) {
  const now = Date.now();
  const running = p.running && (now - p.startedAt) / 1000 < (p.frames - p.startSample + 1) / p.rate;
  if (p.running && !running) p.running = false;
  const cur = running ? Math.min(p.frames, p.startSample + Math.floor(((now - p.startedAt) / 1000) * p.rate)) : p.current;
  return { running, cur };
}

function makePlayer(args, ctx) {
  if (!args.length) throw E('io:audioplayer:notEnoughInputs', 'Not enough input arguments.');
  const fs = args[1] !== undefined ? N(args[1]) : 8192;
  const { frames, channels } = channelsOf(args[0]);
  const id = `player${++playerSeq}`;
  const bits = args[2] !== undefined ? N(args[2]) : 16;
  return object('audioplayer', { id, rate: fs, frames, channels, bits, running: false, startedAt: 0, startSample: 1, current: 1, paused: false }, { handle: true });
}

function playFrom(ctx, p, range) {
  let a = 1, b = p.frames;
  if (range) { const r = Array.from(toTensor(range).re); a = r[0]; if (r.length > 1) b = r[1]; }
  const sliced = p.channels.map((c) => c.subarray(a - 1, b));
  postAudio(ctx, { type: 'audio.play', id: p.id, sampleRate: p.rate, numChannels: sliced.length, frames: b - a + 1, channels: sliced });
  Object.assign(p, { running: true, paused: false, startedAt: Date.now(), startSample: a, current: a });
}

const PLAYER_CLASS = {
  handle: true,
  props: ['SampleRate', 'BitsPerSample', 'NumChannels', 'TotalSamples', 'CurrentSample', 'Running', 'Tag', 'UserData'],
  construct(args, ctx) { return makePlayer(args, ctx); },
  subsref(obj, subs, nargout, ctx) {
    const p = obj.props;
    if (subs[0].type === '.') {
      const name = Array.isArray(subs[0].subs) ? S(subs[0].subs[0]) : String(subs[0].subs);
      const { running, cur } = playerProps(p);
      const map = { SampleRate: num(p.rate), BitsPerSample: num(p.bits), NumChannels: num(p.channels.length), TotalSamples: num(p.frames), CurrentSample: num(cur), Running: str(running ? 'on' : 'off'), Tag: str(p.tag || ''), UserData: p.userData || tensor('double', [0, 0]) };
      if (name in map) return [map[name]];
      if (name in PLAYER_CLASS.methods) return ctx.call(name, [obj], nargout);
      throw E('io:audioplayer:noProperty', `Unrecognized property '${name}' for class 'audioplayer'.`);
    }
    throw E('io:audioplayer:badIndex', 'audioplayer objects support only property access.');
  },
  subsasgn(obj, subs, rhs) {
    const name = Array.isArray(subs[0].subs) ? S(subs[0].subs[0]) : String(subs[0].subs);
    if (name === 'Tag') obj.props.tag = S(rhs);
    else if (name === 'UserData') obj.props.userData = rhs;
    else if (name === 'SampleRate') obj.props.rate = N(rhs);
    else throw E('io:audioplayer:readOnly', `Property '${name}' cannot be set.`);
    return obj;
  },
  methods: {
    play(args, nargout, ctx) { playFrom(ctx, args[0].props, args[1]); return undefined; },
    playblocking(args, nargout, ctx) {
      const p = args[0].props;
      let a = 1, b = p.frames;
      if (args[1]) { const r = Array.from(toTensor(args[1]).re); a = r[0]; if (r.length > 1) b = r[1]; }
      const sliced = p.channels.map((c) => c.subarray(a - 1, b));
      try { if (ctx.host && ctx.host.request) ctx.host.request({ type: 'audio.playBlocking', id: p.id, sampleRate: p.rate, numChannels: sliced.length, frames: b - a + 1, channels: sliced }); } catch { /* no GUI */ }
      p.running = false; p.current = 1;
      return undefined;
    },
    stop(args, nargout, ctx) { const p = args[0].props; postAudio(ctx, { type: 'audio.stop', id: p.id }); Object.assign(p, { running: false, paused: false, current: 1 }); return undefined; },
    pause(args, nargout, ctx) {
      const p = args[0].props; const { running, cur } = playerProps(p);
      if (running) { postAudio(ctx, { type: 'audio.pause', id: p.id }); Object.assign(p, { running: false, paused: true, current: cur }); }
      return undefined;
    },
    resume(args, nargout, ctx) {
      const p = args[0].props;
      if (p.paused) { postAudio(ctx, { type: 'audio.resume', id: p.id }); Object.assign(p, { running: true, paused: false, startedAt: Date.now(), startSample: p.current }); }
      return undefined;
    },
    isplaying(args) { return bool(playerProps(args[0].props).running); },
    get(args) {
      const p = args[0].props; const { running, cur } = playerProps(p);
      return structScalar({ SampleRate: num(p.rate), BitsPerSample: num(p.bits), NumChannels: num(p.channels.length), TotalSamples: num(p.frames), CurrentSample: num(cur), Running: str(running ? 'on' : 'off') });
    },
  },
  display(obj) {
    const p = obj.props;
    return `  audioplayer with properties:\n\n    SampleRate: ${p.rate}\n    BitsPerSample: ${p.bits}\n    NumChannels: ${p.channels.length}\n    TotalSamples: ${p.frames}\n    Running: '${playerProps(p).running ? 'on' : 'off'}'\n`;
  },
};

export const classes = { audioplayer: PLAYER_CLASS };

export const builtins = {
  audioread, audiowrite, audioinfo, sound, soundsc, beep,
  audioplayer: (args, nargout, ctx) => makePlayer(args, ctx),
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  audioread: H('Read an audio file (WAV).', '오디오 파일(WAV)을 읽습니다.', ['[y, Fs] = audioread(filename)', '[y, Fs] = audioread(filename, samples)', "[y, Fs] = audioread(___, dataType)"]),
  audiowrite: H('Write an audio file (WAV).', '오디오 파일(WAV)을 씁니다.', ['audiowrite(filename, y, Fs)', 'audiowrite(filename, y, Fs, Name, Value)']),
  audioinfo: H('Information about an audio file.', '오디오 파일 정보.', ['info = audioinfo(filename)']),
  sound: H('Play a signal as sound.', '신호를 소리로 재생합니다.', ['sound(y)', 'sound(y, Fs)', 'sound(y, Fs, nBits)']),
  soundsc: H('Scale a signal and play it as sound.', '신호의 크기를 맞춰 소리로 재생합니다.', ['soundsc(y)', 'soundsc(y, Fs)', 'soundsc(y, Fs, yRange)']),
  beep: H('Produce an operating system beep.', '시스템 경고음을 냅니다.', ['beep', 'beep on', 'beep off']),
  audioplayer: H('Object for playing audio.', '오디오 재생용 객체.', ['player = audioplayer(Y, Fs)', 'player = audioplayer(Y, Fs, nBits)', 'play(player)', 'stop(player)', 'pause(player)', 'resume(player)', 'isplaying(player)']),
};
