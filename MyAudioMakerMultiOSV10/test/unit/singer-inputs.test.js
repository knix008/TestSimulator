// AI voice: a tiny fake DiffSinger bank (no real models) — the layout is read, and every model gets
// inputs of the right names, types and shapes; the vocoder output lands at the right time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBankLayout, speakerIndex } from '../../src/audio/singer/bank.js';
import { loadRuntime, melForVocoder, renderPhrase, samplingFeeds } from '../../src/audio/singer/pipeline.js';
import { frameMsOf, HEAD_FRAMES, splitPhrases } from '../../src/audio/singer/timing.js';

const H = 4;
const emb = (v) => new Uint8Array(new Float32Array(H).fill(v).buffer);
const PHONEMES = '<PAD>\nAP\nSP\na\nsx\nrj\nng\nee\ny\noo\n';
const DICT = `symbols:
- {symbol: a, type: vowel}
- {symbol: ee, type: vowel}
- {symbol: oo, type: vowel}
- {symbol: sx, type: fricative}
- {symbol: rj, type: liquid}
- {symbol: ng, type: nasal}
- {symbol: y, type: semivowel}
entries:
- {grapheme: 사, phonemes: [sx, a]}
- {grapheme: 랑, phonemes: [rj, a, ng]}
- {grapheme: 해, phonemes: [ee]}
- {grapheme: 애, phonemes: [ee]}
- {grapheme: 요, phonemes: [y, oo]}
`;

function fakeBank({ dur = true, pitch = true } = {}) {
  const files = {
    'character.yaml': 'name: "Tiny"\nauthor: tester\nsubbanks:\n- {color: Alto, suffix: dsacoustic/alto}\n- {color: Soprano, suffix: dsacoustic/soprano}\n',
    'dsconfig.yaml': `phonemes: dsacoustic/phonemes.txt\nacoustic: dsacoustic/acoustic.onnx\nvocoder: dsvocoder\nhidden_size: ${H}\nuse_key_shift_embed: true\nuse_speed_embed: true\nuse_continuous_acceleration: true\nuse_variable_depth: true\nmax_depth: 0.6\nmel_base: '10'\nspeakers:\n  - dsacoustic/alto\n  - dsacoustic/soprano\n`,
    'dsacoustic/phonemes.txt': PHONEMES, 'dsacoustic/acoustic.onnx': 'x', 'dsacoustic/alto.emb': emb(1), 'dsacoustic/soprano.emb': emb(2),
    'dsvocoder/vocoder.yaml': 'name: tiny\nmodel: voc.onnx\nmel_base: e\n', 'dsvocoder/voc.onnx': 'x',
    'LICENSE.txt': 'Tiny licence: non-commercial.', 'dsdict.yaml': DICT,
  };
  if (dur) Object.assign(files, {
    'dsdur/dsconfig.yaml': 'phonemes: files/phonemes.txt\nlinguistic: files/linguistic.onnx\ndur: files/dur.onnx\npredict_dur: true\nspeakers: [files/alto, files/soprano]\n',
    'dsdur/files/phonemes.txt': PHONEMES, 'dsdur/files/linguistic.onnx': 'x', 'dsdur/files/dur.onnx': 'x', 'dsdur/files/alto.emb': emb(3), 'dsdur/files/soprano.emb': emb(4), 'dsdur/dsdict.yaml': DICT,
  });
  if (pitch) Object.assign(files, {
    'dspitch/dsconfig.yaml': 'phonemes: files/phonemes.txt\nlinguistic: files/linguistic.onnx\npitch: files/pitch.onnx\npredict_dur: false\nuse_note_rest: true\nuse_expr: true\nuse_continuous_acceleration: true\nspeakers: [files/alto, files/soprano]\n',
    'dspitch/files/phonemes.txt': PHONEMES, 'dspitch/files/linguistic.onnx': 'x', 'dspitch/files/pitch.onnx': 'x', 'dspitch/files/alto.emb': emb(5), 'dspitch/files/soprano.emb': emb(6),
  });
  const list = Object.entries(files).map(([path, v]) => ({ path, size: typeof v === 'string' ? v.length : v.length }));
  const read = async (path, kind) => { const v = files[path]; if (v == null) throw new Error(`missing ${path}`); return kind === 'text' ? String(v) : (typeof v === 'string' ? new TextEncoder().encode(v) : v); };
  return { list, read };
}

const INPUTS = {
  acoustic: ['tokens', 'durations', 'f0', 'gender', 'velocity', 'spk_embed', 'depth', 'steps'],
  vocoder: ['mel', 'f0'],
  'dur.linguistic': ['tokens', 'word_div', 'word_dur'],
  'dur.model': ['encoder_out', 'x_masks', 'ph_midi', 'spk_embed'],
  'pitch.linguistic': ['tokens', 'ph_dur'],
  'pitch.model': ['encoder_out', 'ph_dur', 'note_midi', 'note_rest', 'note_dur', 'pitch', 'expr', 'retake', 'spk_embed', 'steps'],
};

function fakeRunner() {
  const calls = {};
  return {
    calls,
    inputs: (key) => new Set(INPUTS[key]),
    async run(key, feeds) {
      calls[key] = feeds;
      const n = (name) => feeds[name].dims[1];
      if (key.endsWith('linguistic')) return { encoder_out: { type: 'float32', data: new Float32Array(n('tokens') * H), dims: [1, n('tokens'), H] }, x_masks: { type: 'bool', data: new Uint8Array(n('tokens')).fill(1), dims: [1, n('tokens')] } };
      if (key === 'dur.model') return { ph_dur_pred: { type: 'float32', data: new Float32Array(n('ph_midi')).fill(6), dims: [1, n('ph_midi')] } };
      if (key === 'pitch.model') return { pitch_pred: { type: 'float32', data: new Float32Array(n('pitch')).fill(61), dims: [1, n('pitch')] } };
      if (key === 'acoustic') return { mel: { type: 'float32', data: new Float32Array(n('f0') * 128).fill(-2), dims: [1, n('f0'), 128] } };
      if (key === 'vocoder') return { waveform: { type: 'float32', data: new Float32Array(n('f0') * 512).fill(0.1), dims: [1, n('f0') * 512] } };
      throw new Error(key);
    },
  };
}

const notes = ['사', '랑', '해', '요'].map((syl, i) => ({ t: i, d: 0.95, p: 60 + i, v: 0.8, syl }));

test('the layout of a bank: models, speakers, languages, licence files, problems', async () => {
  const { list, read } = fakeBank();
  const layout = await readBankLayout(list, read);
  assert.equal(layout.name, 'Tiny');
  assert.deepEqual(layout.speakers, [{ id: 'dsacoustic/alto', name: 'Alto' }, { id: 'dsacoustic/soprano', name: 'Soprano' }]);
  assert.ok(layout.languages.includes('ko'), 'Hangul in the dictionary → Korean');
  assert.deepEqual(layout.licenceFiles, ['LICENSE.txt']);
  assert.deepEqual(layout.problems, []);
  assert.ok(layout.vocoder.bundled && layout.vocoder.config.mel_base === 'e');
  assert.equal(layout.dur.model, 'dsdur/files/dur.onnx');
  const broken = await readBankLayout(list.filter((f) => f.path !== 'dsacoustic/soprano.emb' && f.path !== 'dspitch/files/pitch.onnx'), read);
  assert.deepEqual(broken.problems.sort(), ['dsacoustic/soprano.emb', 'dspitch/files/pitch.onnx']);
  await assert.rejects(readBankLayout([{ path: 'vocoder.yaml', size: 1 }], async () => 'model: a.onnx'), (e) => e.code === 'isVocoder');
  // Speakers of a part are found by their file name too (files/soprano for dsacoustic/soprano).
  assert.equal(speakerIndex(['files/alto', 'files/soprano'], 'dsacoustic/soprano'), 1);
  assert.equal(speakerIndex(['dsacoustic/alto', 'dsacoustic/soprano'], 'dsacoustic/soprano'), 1);
  assert.equal(speakerIndex(['a', 'b'], ''), 0);
});

test('every model gets inputs of the right shape; audio starts 8 frames before the first phone', async () => {
  const { list, read } = fakeBank();
  const layout = await readBankLayout(list, read);
  const rt = await loadRuntime(layout, read, { speaker: 'dsacoustic/soprano' });
  const runner = fakeRunner();
  const [phrase] = splitPhrases(notes, { bpm: 120 });
  const res = await renderPhrase(rt, phrase, runner, { steps: 20 });
  const c = runner.calls;
  // Duration: tokens = lead SP + 사(2) 랑(3) 애(1) 요(2) = 9 phonemes.
  const T = c['dur.linguistic'].tokens.dims[1];
  assert.equal(T, 9);
  assert.equal(c['dur.linguistic'].tokens.type, 'int64');
  const wd = Array.from(c['dur.linguistic'].word_div.data, Number);
  assert.equal(wd.reduce((a, b) => a + b, 0), T);
  assert.deepEqual(c['dur.model'].ph_midi.dims, [1, T]);
  assert.deepEqual(c['dur.model'].spk_embed.dims, [1, T, H]);
  assert.equal(c['dur.model'].spk_embed.data[0], 4, 'the duration model uses its own soprano embedding');
  assert.equal(c['dur.model'].x_masks.type, 'bool');
  // Pitch.
  const P = c['pitch.model'].pitch.dims[1];
  assert.deepEqual(c['pitch.model'].retake.dims, [1, P]);
  assert.equal(c['pitch.model'].note_midi.type, 'float32');
  assert.equal(Array.from(c['pitch.model'].note_dur.data, Number).reduce((a, b) => a + b, 0), P, 'note durations fill the frames');
  assert.equal(c['pitch.model'].note_rest.dims[1], c['pitch.model'].note_midi.dims[1]);
  assert.equal(Number(c['pitch.model'].steps.data[0]), 10);
  assert.ok(!('depth' in c['pitch.model']));
  // Acoustic.
  const a = c.acoustic;
  const N = a.f0.dims[1];
  assert.equal(Array.from(a.durations.data, Number).reduce((x, y) => x + y, 0), N);
  assert.deepEqual(a.tokens.dims, a.durations.dims);
  assert.equal(a.tokens.data[0], 2n, 'padded with SP');
  assert.deepEqual(a.spk_embed.dims, [1, N, H]);
  assert.equal(a.spk_embed.data[H * 5], 2, 'acoustic soprano embedding');
  assert.deepEqual(a.gender.dims, [1, N]);
  assert.equal(a.velocity.data[0], 1);
  assert.equal(Number(a.steps.data[0]), 20);
  assert.ok(Math.abs(a.depth.data[0] - 0.6) < 1e-6, 'depth limited to max_depth');
  assert.ok(Math.abs(a.f0.data[N >> 1] - 440 * 2 ** ((61 - 69) / 12)) < 1e-3, 'f0 from the pitch model');
  // Vocoder: mel converted from log10 to ln.
  assert.deepEqual(c.vocoder.mel.dims, [1, N, 128]);
  assert.ok(Math.abs(c.vocoder.mel.data[0] - -2 * 2.30259) < 1e-4);
  assert.equal(res.samples.length, N * 512);
  assert.equal(res.startMs, res.phones[0].positionMs - HEAD_FRAMES * frameMsOf({}));
  assert.ok(res.phones[0].positionMs < 0, 'the first consonant is sung before beat 0');
  assert.equal(res.phones.find((p) => p.phoneme === 'a').positionMs, 0, 'the vowel starts on the note');
  assert.deepEqual(res.words.map((w) => w.text), ['사', '랑', '애', '요']);
});

test('a bank without duration and pitch models still sings (rules)', async () => {
  const { list, read } = fakeBank({ dur: false, pitch: false });
  const layout = await readBankLayout(list, read);
  const rt = await loadRuntime(layout, read, {});
  const runner = fakeRunner();
  const [phrase] = splitPhrases(notes, { bpm: 120 });
  const res = await renderPhrase(rt, phrase, runner, { steps: 10 });
  assert.ok(!runner.calls['dur.model'] && !runner.calls['pitch.model']);
  const f0 = runner.calls.acoustic.f0.data;
  assert.ok(f0.some((x) => Math.abs(x - 261.63) < 3) && f0.some((x) => Math.abs(x - 311.13) < 6), 'the notes\' pitches (MIDI 60 … 63)');
  assert.ok(res.phones.every((p) => p.durationMs >= 0));
  for (let i = 1; i < res.phones.length; i++) assert.ok(res.phones[i].positionMs >= res.phones[i - 1].positionMs - 1e-6);
});

test('sampling inputs (continuous and legacy diffusion) and mel log base', () => {
  const cont = samplingFeeds({ use_continuous_acceleration: true, use_variable_depth: true, max_depth: 0.6 }, 20, null);
  assert.equal(Number(cont.steps.data[0]), 20);
  assert.ok(Math.abs(cont.depth.data[0] - 0.6) < 1e-6);
  const legacy = samplingFeeds({ use_continuous_acceleration: false, use_variable_depth: true, max_depth: 600 }, 20, null);
  assert.equal(Number(legacy.depth.data[0]), 600);
  assert.equal(Number(legacy.speedup.data[0]), 30);
  const full = samplingFeeds({ use_continuous_acceleration: false }, 20, null);
  assert.equal(Number(full.speedup.data[0]), 50);
  assert.ok(!('depth' in full));
  assert.equal(Number(samplingFeeds({ use_continuous_acceleration: false }, 30, null).speedup.data[0]), 25, 'a divisor of 1000');
  const mel = Float32Array.from([1, -2]);
  assert.equal(melForVocoder(mel, '10', '10'), mel);
  assert.ok(Math.abs(melForVocoder(mel, 'e', '10')[1] - -2 * 0.434294) < 1e-6);
});
