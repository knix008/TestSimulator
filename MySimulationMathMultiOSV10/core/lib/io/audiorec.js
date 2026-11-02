// Audio recording and audio utilities of the GNU Octave function set:
// audiorecorder (object), record, audiodevinfo, audioformats, lin2mu, mu2lin,
// getaudiodata / getplayer / isrecording, and function-form entry points
// (play, stop, resume, playblocking, isplaying, recordblocking ...) that
// forward to the methods of audioplayer / audiorecorder objects.
//
// Microphone access lives in the GUI. The engine talks to it through ctx.host:
//   request { type: 'audio.devices' }
//     → { input: [{ name, id, driver }], output: [{ name, id, driver }] }
//   request { type: 'audio.record.start', id, sampleRate, bits, numChannels, deviceId, seconds|null } → { ok: true } | { error }
//   request { type: 'audio.record.data', id }   → { channels: [Float32Array|number[] per channel] }   (keeps recording)
//   request { type: 'audio.record.stop', id }   → { channels: [...] }                                 (final data)
//   post    { type: 'audio.record.pause' | 'audio.record.resume', id }
//   request { type: 'audio.recordBlocking', id, sampleRate, bits, numChannels, deviceId, seconds } → { channels: [...] }
// Without a host (Node, tests without GUI) recording fails with 'io:audiorecorder:noHost'.
import { E, S, N, str, num, bool, tensor, isTextArg, isTensor, toTensor, structScalar, structArray } from './util.js';
import { object, saturate } from '../../value.js';
import { makePlayer, PLAYER_CLASS, AUDIO_FORMATS } from './audio.js';
import { ulawToLinear } from './audiofmt.js';

let recSeq = 0;

function hostRequest(ctx, msg) {
  try { return ctx.host && typeof ctx.host.request === 'function' ? ctx.host.request(msg) : null; } catch (e) { return { error: e.message || String(e) }; }
}
function hostPost(ctx, msg) { try { if (ctx.host && ctx.host.post) ctx.host.post(msg); } catch { /* no GUI */ } }

function needHost(reply, what) {
  if (reply == null) throw E('io:audiorecorder:noHost', `${what} is not available here (no application host with audio input).`);
  if (reply.error) throw E('io:audiorecorder:failed', `${what} failed: ${reply.error}`);
  return reply;
}

/** Host reply → per-channel Float64Array samples in [-1, 1]. */
function channelsOfReply(reply, nch) {
  const list = Array.isArray(reply.channels) ? reply.channels : [];
  const out = [];
  for (let c = 0; c < nch; c++) {
    const src = list[Math.min(c, list.length - 1)] || [];
    out.push(Float64Array.from(src, (x) => Math.max(-1, Math.min(1, Number(x) || 0))));
  }
  const frames = out.length ? Math.min(...out.map((a) => a.length)) : 0;
  return out.map((a) => a.subarray(0, frames));
}

// ---------------------------------------------------------------- audiorecorder

function makeRecorder(args) {
  const a = args.map((v) => N(v));
  const rate = a[0] ?? 8000, bits = a[1] ?? 8, channels = a[2] ?? 1, deviceId = a[3] ?? -1;
  if (!(rate > 0)) throw E('io:audiorecorder:badRate', 'The sample rate must be positive.');
  if (![8, 16, 24].includes(bits)) throw E('io:audiorecorder:badBits', 'BitsPerSample must be 8, 16 or 24.');
  if (channels !== 1 && channels !== 2) throw E('io:audiorecorder:badChannels', 'The number of channels must be 1 or 2.');
  return object('audiorecorder', {
    id: `recorder${++recSeq}`, rate, bits, channels, deviceId, running: false, paused: false, pending: false,
    seconds: null, startedAt: 0, data: null, tag: '', userData: tensor('double', [0, 0]),
  }, { handle: true });
}

/** Marks a timed recording as finished when its length has passed. */
function refresh(p) {
  if (p.running && p.seconds != null && (Date.now() - p.startedAt) / 1000 >= p.seconds) { p.running = false; p.pending = true; }
}

function fetchData(ctx, p, type) {
  const reply = needHost(hostRequest(ctx, { type, id: p.id }), 'Reading the recorded audio');
  p.data = channelsOfReply(reply, p.channels);
}

function recorderFrames(p) { return p.data && p.data.length ? p.data[0].length : 0; }

function recData(ctx, p) {
  refresh(p);
  if (p.running || p.paused) fetchData(ctx, p, 'audio.record.data');
  else if (p.pending) { fetchData(ctx, p, 'audio.record.stop'); p.pending = false; }
  return p.data;
}

function recProp(ctx, obj, name) {
  const p = obj.props;
  refresh(p);
  switch (name.toLowerCase()) {
    case 'samplerate': return num(p.rate);
    case 'bitspersample': return num(p.bits);
    case 'numchannels': case 'numberofchannels': return num(p.channels);
    case 'deviceid': return num(p.deviceId);
    case 'running': return str(p.running ? 'on' : 'off');
    case 'totalsamples': case 'currentsample': {
      if (p.running || p.paused || p.pending) { try { recData(ctx, p); } catch { /* keep the last data */ } }
      return num(recorderFrames(p));
    }
    case 'tag': return str(p.tag);
    case 'userdata': return p.userData;
    case 'type': return str('audiorecorder');
    default: return undefined;
  }
}

const REC_PROPS = ['BitsPerSample', 'CurrentSample', 'DeviceID', 'NumChannels', 'Running', 'SampleRate', 'Tag', 'TotalSamples', 'Type', 'UserData'];

function startRecording(ctx, p, seconds) {
  const reply = needHost(hostRequest(ctx, { type: 'audio.record.start', id: p.id, sampleRate: p.rate, bits: p.bits, numChannels: p.channels, deviceId: p.deviceId, seconds }), 'Audio recording');
  void reply;
  Object.assign(p, { running: true, paused: false, pending: false, seconds, startedAt: Date.now(), data: null });
}

function convertData(p, type) {
  const frames = recorderFrames(p);
  const ch = p.channels;
  const re = new Float64Array(frames * ch);
  for (let c = 0; c < ch; c++) re.set(p.data[c], c * frames);
  const t = String(type || 'double').toLowerCase();
  if (t === 'double') return tensor('double', [frames, ch], re);
  if (t === 'single') return tensor('single', [frames, ch], re.map((x) => Math.fround(x)));
  if (t === 'int16') return tensor('int16', [frames, ch], re.map((x) => saturate('int16', Math.round(x * 32768))));
  if (t === 'int8') return tensor('int8', [frames, ch], re.map((x) => saturate('int8', Math.round(x * 128))));
  if (t === 'uint8') return tensor('uint8', [frames, ch], re.map((x) => saturate('uint8', Math.round(x * 128 + 128))));
  throw E('io:getaudiodata:badType', "Data type must be 'double', 'single', 'int16', 'int8' or 'uint8'.");
}

const REC_METHODS = {
  record(args, nargout, ctx) {
    const p = args[0].props;
    const len = args[1] !== undefined ? N(args[1]) : null;
    if (len != null && !(len > 0)) throw E('io:audiorecorder:badLength', 'The recording length must be a positive number of seconds.');
    startRecording(ctx, p, len);
    return undefined;
  },
  recordblocking(args, nargout, ctx) {
    const p = args[0].props;
    if (args[1] === undefined) throw E('io:recordblocking:notEnoughInputs', 'recordblocking needs the length in seconds.');
    const len = N(args[1]);
    if (!(len > 0)) throw E('io:audiorecorder:badLength', 'The recording length must be a positive number of seconds.');
    const reply = needHost(hostRequest(ctx, { type: 'audio.recordBlocking', id: p.id, sampleRate: p.rate, bits: p.bits, numChannels: p.channels, deviceId: p.deviceId, seconds: len }), 'Audio recording');
    p.data = channelsOfReply(reply, p.channels);
    Object.assign(p, { running: false, paused: false, pending: false });
    return undefined;
  },
  stop(args, nargout, ctx) {
    const p = args[0].props;
    refresh(p);
    if (p.running || p.paused || p.pending) { fetchData(ctx, p, 'audio.record.stop'); }
    Object.assign(p, { running: false, paused: false, pending: false });
    return undefined;
  },
  pause(args, nargout, ctx) {
    const p = args[0].props;
    refresh(p);
    if (p.running) { hostPost(ctx, { type: 'audio.record.pause', id: p.id }); Object.assign(p, { running: false, paused: true }); }
    return undefined;
  },
  resume(args, nargout, ctx) {
    const p = args[0].props;
    if (p.paused) { hostPost(ctx, { type: 'audio.record.resume', id: p.id }); Object.assign(p, { running: true, paused: false }); }
    return undefined;
  },
  isrecording(args) { const p = args[0].props; refresh(p); return bool(p.running); },
  getaudiodata(args, nargout, ctx) {
    const p = args[0].props;
    recData(ctx, p);
    if (!recorderFrames(p)) throw E('io:getaudiodata:noData', 'The audiorecorder has no recorded data.');
    return convertData(p, args[1] !== undefined ? S(args[1]) : 'double');
  },
  getplayer(args, nargout, ctx) {
    const p = args[0].props;
    recData(ctx, p);
    if (!recorderFrames(p)) throw E('io:getplayer:noData', 'The audiorecorder has no recorded data.');
    return makePlayer([convertData(p, 'double'), num(p.rate), num(p.bits <= 16 ? p.bits : 16)], ctx);
  },
  play(args, nargout, ctx) {
    const player = REC_METHODS.getplayer([args[0]], 1, ctx);
    PLAYER_CLASS.methods.play([player, ...args.slice(1)], 0, ctx);
    return nargout > 0 ? player : undefined;
  },
  get(args, nargout, ctx) {
    const obj = args[0];
    if (args[1] !== undefined) {
      const name = S(args[1]);
      const v = recProp(ctx, obj, name);
      if (v === undefined) throw E('io:audiorecorder:noProperty', `Unrecognized property '${name}' for class 'audiorecorder'.`);
      return v;
    }
    const o = {};
    for (const k of REC_PROPS) o[k] = recProp(ctx, obj, k);
    return structScalar(o);
  },
  set(args, nargout, ctx) {
    const obj = args[0];
    for (let i = 1; i + 1 < args.length; i += 2) REC_CLASS.subsasgn(obj, [{ type: '.', subs: S(args[i]) }], args[i + 1], ctx);
    return undefined;
  },
};

const REC_CLASS = {
  handle: true,
  props: REC_PROPS,
  construct(args) { return makeRecorder(args); },
  subsref(obj, subs, nargout, ctx) {
    if (subs[0].type === '.') {
      const name = Array.isArray(subs[0].subs) ? S(subs[0].subs[0]) : String(subs[0].subs);
      const v = recProp(ctx, obj, name);
      if (v !== undefined) return [v];
      const m = Object.keys(REC_METHODS).find((k) => k.toLowerCase() === name.toLowerCase());
      if (m) {
        const call = subs[1] && subs[1].type === '()' ? subs[1].subs : [];
        const r = REC_METHODS[m]([obj, ...call], nargout, ctx);
        return r === undefined ? [] : [r];
      }
      throw E('io:audiorecorder:noProperty', `Unrecognized property '${name}' for class 'audiorecorder'.`);
    }
    throw E('io:audiorecorder:badIndex', 'audiorecorder objects support only property access.');
  },
  subsasgn(obj, subs, rhs) {
    const name = Array.isArray(subs[0].subs) ? S(subs[0].subs[0]) : String(subs[0].subs);
    const p = obj.props;
    const l = name.toLowerCase();
    if (l === 'tag') p.tag = S(rhs);
    else if (l === 'userdata') p.userData = rhs;
    else if (l === 'samplerate' || l === 'bitspersample' || l === 'numchannels' || l === 'deviceid') {
      if (p.running) throw E('io:audiorecorder:running', `Property '${name}' cannot be changed while recording.`);
      const v = N(rhs);
      if (l === 'samplerate') p.rate = v; else if (l === 'bitspersample') p.bits = v; else if (l === 'numchannels') p.channels = v; else p.deviceId = v;
    } else throw E('io:audiorecorder:readOnly', `Property '${name}' cannot be set.`);
    return obj;
  },
  methods: REC_METHODS,
  display(obj, name, ctx) {
    const p = obj.props;
    refresh(p);
    return `  audiorecorder with properties:\n\n    SampleRate: ${p.rate}\n    BitsPerSample: ${p.bits}\n    NumChannels: ${p.channels}\n    DeviceID: ${p.deviceId}\n    TotalSamples: ${recorderFrames(p)}\n    Running: '${p.running ? 'on' : 'off'}'\n`;
  },
};

export const classes = { audiorecorder: REC_CLASS };

// ---------------------------------------------------------------- function forms

const OWN = { audioplayer: PLAYER_CLASS, audiorecorder: REC_CLASS };

/** play(x) etc.: methods of audioplayer / audiorecorder objects (objects normally dispatch before reaching here). */
function forward(name, kinds) {
  return (args, nargout, ctx) => {
    const o = args[0];
    const def = o && o.isObject ? OWN[o.cls] : null;
    if (def && def.methods[name]) return def.methods[name](args, nargout, ctx);
    throw E(`io:${name}:badArgument`, `${name}: the first argument must be an ${kinds} object.`);
  };
}

function record(args, nargout, ctx) {
  if (args[0] && args[0].isObject) return forward('record', 'audiorecorder')(args, nargout, ctx);
  // x = record(sec, fs): record sec seconds from the default input device
  if (!args.length) throw E('io:record:notEnoughInputs', 'Not enough input arguments.');
  const sec = N(args[0]);
  const fs = args[1] !== undefined ? N(args[1]) : 8000;
  const rec = makeRecorder([num(fs), num(16), num(1)]);
  REC_METHODS.recordblocking([rec, num(sec)], 0, ctx);
  return convertData(rec.props, 'double');
}

// ---------------------------------------------------------------- audiodevinfo

function devices(ctx) {
  const r = hostRequest(ctx, { type: 'audio.devices' });
  const norm = (list, io) => (Array.isArray(list) ? list : []).map((d, i) => ({ name: String(d.name ?? `Device ${i}`), id: Number(d.id ?? i), driver: String(d.driver ?? ''), io }));
  if (!r || r.error) return { input: [], output: [] };
  return { input: norm(r.input, 1), output: norm(r.output, 0) };
}
const devStruct = (list) => structArray(list.map((d) => ({ Name: str(d.name), DriverVersion: str(d.driver), ID: num(d.id) })), ['Name', 'DriverVersion', 'ID'], [1, list.length]);

function audiodevinfo(args, nargout, ctx) {
  const dev = devices(ctx);
  if (!args.length) return structScalar({ output: devStruct(dev.output), input: devStruct(dev.input) });
  const io = N(args[0]);
  if (io !== 0 && io !== 1) throw E('io:audiodevinfo:badIO', 'The first argument must be 0 (output) or 1 (input).');
  const list = io === 1 ? dev.input : dev.output;
  if (args.length === 1) return num(list.length);
  if (args.length === 2) {
    if (isTextArg(args[1])) {
      const name = S(args[1]);
      const d = list.find((x) => x.name === name);
      if (!d) throw E('io:audiodevinfo:noDevice', `No ${io ? 'input' : 'output'} device named '${name}'.`);
      return num(d.id);
    }
    const d = list.find((x) => x.id === N(args[1]));
    if (!d) throw E('io:audiodevinfo:noDevice', `No ${io ? 'input' : 'output'} device with ID ${N(args[1])}.`);
    return str(d.name);
  }
  if (args.length === 3 && isTextArg(args[2]) && S(args[2]).toLowerCase() === 'driverversion') {
    const d = list.find((x) => x.id === N(args[1]));
    if (!d) throw E('io:audiodevinfo:noDevice', `No ${io ? 'input' : 'output'} device with ID ${N(args[1])}.`);
    return str(d.driver);
  }
  const supports = (rate, bits, chans) => rate >= 1000 && rate <= 384000 && [8, 16, 24].includes(bits) && (chans === 1 || chans === 2);
  if (args.length === 4) {
    const [rate, bits, chans] = args.slice(1).map((v) => N(v));
    return num(list.length && supports(rate, bits, chans) ? list[0].id : -1);
  }
  if (args.length === 5) {
    const [id, rate, bits, chans] = args.slice(1).map((v) => N(v));
    return bool(list.some((x) => x.id === id) && supports(rate, bits, chans));
  }
  throw E('io:audiodevinfo:badArgs', 'Invalid arguments for audiodevinfo.');
}

// ---------------------------------------------------------------- audioformats

function audioformats(args, nargout, ctx) {
  let list = AUDIO_FORMATS;
  if (args.length) {
    const want = S(args[0]).toLowerCase().replace(/^\./, '');
    list = list.filter((f) => f.name.toLowerCase() === want || f.ext.some((e) => e.slice(1) === want));
  }
  if (nargout > 0) {
    return structArray(list.map((f) => ({ name: str(f.name), description: str(f.description), extension: str(f.ext.join(' ')), read: bool(true), write: bool(true) })),
      ['name', 'description', 'extension', 'read', 'write'], [list.length, 1]);
  }
  let t = '';
  for (const f of list) t += `name: ${f.name}\ndescription: ${f.description}\nextension: ${f.ext.join(' ')}\nread / write: yes / yes\n\n`;
  ctx.out(t || 'No matching audio format.\n');
  return undefined;
}

// ---------------------------------------------------------------- mu-law

function lin2mu(args, nargout, ctx) {
  if (!args.length) throw E('io:lin2mu:notEnoughInputs', 'Not enough input arguments.');
  const x = toTensor(args[0]);
  if (!isTensor(x) || x.cls === 'char') throw E('io:lin2mu:badInput', 'X must be a numeric array.');
  let n;
  if (args[1] !== undefined) {
    n = N(args[1]);
    if (n !== 0 && n !== 8 && n !== 16) throw E('io:lin2mu:badN', 'N must be either 0, 8, or 16.');
  } else {
    let range = 0; for (const v of x.re) if (Math.abs(v) > range) range = Math.abs(v);
    if (range <= 1) n = 0;
    else if (range <= 128) { n = 8; ctx.warning('io:lin2mu:noPrecision', 'No precision specified, so using 8.'); } else n = 16;
  }
  const out = new Float64Array(x.re.length);
  for (let i = 0; i < out.length; i++) {
    let v = x.re[i];
    if (n === 0) v = Math.round(32768 * v); else if (n === 8) v *= 256;
    const sig = v > 0 ? 1 : v < 0 ? -1 : 1;
    const a = Math.min(Math.abs(v), 32635) + 132;
    const e = Math.floor(Math.log2(a)) + 1; // a = f * 2^e with 0.5 <= f < 1
    const f = a / 2 ** e;
    out[i] = 64 * sig - 16 * e - Math.trunc(32 * f) + 335;
  }
  return tensor('double', x.dims.slice(), out);
}

function mu2lin(args) {
  if (!args.length) throw E('io:mu2lin:notEnoughInputs', 'Not enough input arguments.');
  const x = toTensor(args[0]);
  const n = args[1] !== undefined ? N(args[1]) : 0;
  if (n !== 0 && n !== 8 && n !== 16) throw E('io:mu2lin:badN', 'N must be either 0, 8, or 16.');
  const y = new Float64Array(x.re.length);
  for (let i = 0; i < y.length; i++) {
    const u = x.re[i];
    if (!(u >= 0 && u <= 255) || !Number.isInteger(u)) throw E('io:mu2lin:badInput', 'X must contain integers between 0 and 255.');
    y[i] = ulawToLinear(u);
  }
  if (n === 0) for (let i = 0; i < y.length; i++) y[i] /= 32768;
  else if (n === 8) {
    let ld = 0; for (const v of y) if (Math.abs(v) > ld) ld = Math.abs(v);
    const sc = ld < 16384 && ld > 0 ? 64 / ld : 1 / 256;
    for (let i = 0; i < y.length; i++) y[i] = Math.trunc(y[i] * sc);
  }
  return tensor('double', x.dims.slice(), y);
}

export const builtins = {
  audiorecorder: (args) => makeRecorder(args),
  record, audiodevinfo, audioformats, lin2mu, mu2lin,
  recordblocking: forward('recordblocking', 'audiorecorder'),
  isrecording: forward('isrecording', 'audiorecorder'),
  getaudiodata: forward('getaudiodata', 'audiorecorder'),
  getplayer: forward('getplayer', 'audiorecorder'),
  play: forward('play', 'audioplayer or audiorecorder'),
  playblocking: forward('playblocking', 'audioplayer'),
  stop: forward('stop', 'audioplayer or audiorecorder'),
  resume: forward('resume', 'audioplayer or audiorecorder'),
  isplaying: forward('isplaying', 'audioplayer'),
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  audiorecorder: H('Object for recording audio from an input device (microphone) through the application.', '응용 프로그램을 통해 입력 장치(마이크)에서 오디오를 녹음하는 객체.', ['recorder = audiorecorder()', 'recorder = audiorecorder(fs, nbits, channels)', 'recorder = audiorecorder(fs, nbits, channels, id)', 'record(recorder)', 'recordblocking(recorder, length)', 'stop(recorder)', 'y = getaudiodata(recorder)']),
  record: H('Record audio for a number of seconds from the default input device, or start an audiorecorder.', '기본 입력 장치에서 정해진 초만큼 오디오를 녹음하거나 audiorecorder 녹음을 시작합니다.', ['x = record(sec)', 'x = record(sec, fs)', 'record(recorder)', 'record(recorder, length)']),
  recordblocking: H('Record with an audiorecorder and wait until the recording is done.', 'audiorecorder로 녹음하고 끝날 때까지 기다립니다.', ['recordblocking(recorder, length)']),
  isrecording: H('True while an audiorecorder is recording.', 'audiorecorder가 녹음 중이면 참입니다.', ['tf = isrecording(recorder)']),
  getaudiodata: H('Recorded samples of an audiorecorder.', 'audiorecorder에 녹음된 샘플.', ['data = getaudiodata(recorder)', 'data = getaudiodata(recorder, datatype)']),
  getplayer: H('audioplayer object for the recorded audio of an audiorecorder.', 'audiorecorder에 녹음된 오디오의 audioplayer 객체.', ['player = getplayer(recorder)']),
  play: H('Start playback of an audioplayer (or of the audio recorded by an audiorecorder).', 'audioplayer(또는 audiorecorder에 녹음된 오디오)의 재생을 시작합니다.', ['play(player)', 'play(player, start)', 'play(player, [start, stop])', 'player = play(recorder)']),
  playblocking: H('Play an audioplayer and wait until playback ends.', 'audioplayer를 재생하고 끝날 때까지 기다립니다.', ['playblocking(player)', 'playblocking(player, [start, stop])']),
  stop: H('Stop an audioplayer or audiorecorder.', 'audioplayer나 audiorecorder를 멈춥니다.', ['stop(player)', 'stop(recorder)']),
  resume: H('Resume a paused audioplayer or audiorecorder.', '일시 정지한 audioplayer나 audiorecorder를 다시 시작합니다.', ['resume(player)', 'resume(recorder)']),
  isplaying: H('True while an audioplayer is playing.', 'audioplayer가 재생 중이면 참입니다.', ['tf = isplaying(player)']),
  audiodevinfo: H('Information about the audio input and output devices of the application.', '응용 프로그램의 오디오 입력·출력 장치 정보.', ['devinfo = audiodevinfo()', 'nDevs = audiodevinfo(io)', 'name = audiodevinfo(io, id)', 'id = audiodevinfo(io, name)', "driver = audiodevinfo(io, id, 'DriverVersion')", 'id = audiodevinfo(io, rate, bits, chans)', 'supports = audiodevinfo(io, id, rate, bits, chans)']),
  audioformats: H('List the audio file formats that audioread and audiowrite support.', 'audioread와 audiowrite가 지원하는 오디오 파일 형식 목록.', ['audioformats()', 'audioformats(format)', 'S = audioformats(___)']),
  lin2mu: H('Convert linear audio samples to 8-bit mu-law codes (0..255).', '선형 오디오 샘플을 8비트 mu-law 코드(0..255)로 바꿉니다.', ['y = lin2mu(x)', 'y = lin2mu(x, n)']),
  mu2lin: H('Convert 8-bit mu-law codes (0..255) to linear audio samples.', '8비트 mu-law 코드(0..255)를 선형 오디오 샘플로 바꿉니다.', ['y = mu2lin(x)', 'y = mu2lin(x, n)']),
};
