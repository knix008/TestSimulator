// The DiffSinger chain for one phrase (CONTRACT: pure apart from the `runner` that runs ONNX models):
//   phonemes → linguistic encoder + duration model → phone timing → pitch model (or a sung line
//   drawn from the notes) → variance model (when the acoustic model needs it) → acoustic model (mel)
//   → vocoder (waveform at 44.1 kHz).
// Tensors are plain { type, data, dims } here; the worker turns them into onnxruntime tensors.
//
// Inputs follow OpenUtau (MIT License, Copyright (c) 2021 stakira and contributors),
// OpenUtau.Core/DiffSinger/ DiffSingerRenderer.cs, DiffSingerPitch.cs, DiffSingerVariance.cs,
// DiffSingerSpeakerEmbedManager.cs, and openvpi/DiffSinger's ONNX exporters (Apache-2.0).
import { buildDictionary, parseLanguages, parsePhonemes, phonemeLanguage } from './dictionary.js';
import { dictionaryFor, joinPath, speakerIndex, vocoderConfig } from './bank.js';
import { alignPhones, groupWordInputs, phraseGroups, phraseWords, ruleDurations } from './phonemizer.js';
import { durationsMsToFrames, fitDurationSum, frameMsOf, HEAD_FRAMES, paddedSegments, TAIL_FRAMES, wordDivAndDur } from './timing.js';

export const SAMPLE_RATE = 44100;

const i64 = (values) => BigInt64Array.from(values, (v) => BigInt(Math.round(Number(v))));
export const tensor = {
  i64: (values, dims = [1, values.length]) => ({ type: 'int64', data: i64(values), dims }),
  f32: (values, dims = [1, values.length]) => ({ type: 'float32', data: values instanceof Float32Array ? values : Float32Array.from(values), dims }),
  bool: (values, dims = [1, values.length]) => ({ type: 'bool', data: Uint8Array.from(values, (v) => (v ? 1 : 0)), dims }),
};

/** A speaker embedding repeated over `count` rows: [1, count, hidden]. */
export function repeatEmbed(emb, count) {
  const h = emb.length;
  const out = new Float32Array(count * h);
  for (let i = 0; i < count; i++) out.set(emb, i * h);
  return { type: 'float32', data: out, dims: [1, count, h] };
}

const readEmb = async (read, path, hidden) => {
  const bytes = await read(path, 'bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(hidden);
  for (let i = 0; i < hidden && i * 4 + 4 <= bytes.byteLength; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
};

async function phonemeTable(read, path) {
  return parsePhonemes(await read(path, 'text'), /\.json$/i.test(path));
}

/** A model part's tables: phonemes, languages, the chosen speaker's embedding. */
async function partRuntime(read, part, hidden, speaker) {
  const tokens = await phonemeTable(read, part.phonemes);
  const langIds = part.languages ? parseLanguages(await read(part.languages, 'text')) : null;
  let emb = null;
  if (part.speakers?.length) {
    const idx = speakerIndex(part.speakers, speaker);
    emb = await readEmb(read, `${joinPath(part.dir, part.speakers[idx])}.emb`, hidden);
  }
  return { tokens, langIds, emb, config: part.config };
}

/**
 * Loads what rendering needs from a bank (not the ONNX models: the runner loads them by key from
 * `models`). `vocoder`: { config, model } of the vocoder to use (bundled or installed dependency).
 */
export async function loadRuntime(layout, read, { speaker = null, vocoder = null } = {}) {
  const config = layout.config;
  const hidden = Number(config.hidden_size ?? 256);
  const acoustic = await partRuntime(read, { dir: '', phonemes: layout.acoustic.phonemes, languages: layout.acoustic.languages, speakers: layout.acoustic.speakers, config }, hidden, speaker);
  const dur = layout.dur ? await partRuntime(read, layout.dur, hidden, speaker) : null;
  const pitch = layout.pitch ? await partRuntime(read, layout.pitch, hidden, speaker) : null;
  const variance = layout.variance ? await partRuntime(read, layout.variance, hidden, speaker) : null;
  const textOf = async (p) => (p ? read(p, 'text') : null);
  const dicts = {
    ko: buildDictionary([await textOf(dictionaryFor(layout.dicts, 'ko'))]),
    en: buildDictionary([await textOf(dictionaryFor(layout.dicts, 'en'))]),
  };
  if (!dicts.ko.size) dicts.ko = dicts.en;
  if (!dicts.en.size) dicts.en = dicts.ko;
  // Word-mode pitch / variance models need their own symbol types.
  if (pitch && pitch.config.predict_dur && layout.pitch.dicts['']?.[0]) pitch.dict = buildDictionary([await read(layout.pitch.dicts[''][0], 'text')]);
  if (variance && variance.config.predict_dur && layout.variance.dicts['']?.[0]) variance.dict = buildDictionary([await read(layout.variance.dicts[''][0], 'text')]);
  const voc = vocoder ?? (layout.vocoder.bundled ? { config: layout.vocoder.config, model: layout.vocoder.model } : null);
  if (!voc) { const e = new Error(`This voice bank needs the vocoder "${layout.vocoder.dependency ?? '?'}".`); e.code = 'vocoderMissing'; throw e; }
  const models = { acoustic: layout.acoustic.model, vocoder: voc.model };
  if (layout.dur) { models['dur.linguistic'] = layout.dur.linguistic; models['dur.model'] = layout.dur.model; }
  if (layout.pitch) { models['pitch.linguistic'] = layout.pitch.linguistic; models['pitch.model'] = layout.pitch.model; }
  if (layout.variance) { models['variance.linguistic'] = layout.variance.linguistic; models['variance.model'] = layout.variance.model; }
  return { layout, config, hidden, frameMs: frameMsOf(config), acoustic, dur, pitch, variance, dicts, vocoder: { config: vocoderConfig(voc.config), model: voc.model, external: !layout.vocoder.bundled }, models };
}

/** Whether a symbol is a vowel in any of the runtime's dictionaries. */
const vowelTest = (rt) => (s) => s === 'SP' || s === 'AP' || rt.dicts.ko.isVowel(s) || rt.dicts.en.isVowel(s) || rt.dicts.ko.isVowel(s.replace(/^[a-z]{2,3}\//, ''));

/** Token ids of symbols; a symbol a secondary model lacks becomes one of the same kind (or SP). */
function tokenize(table, symbols, { strict = false, isVowel = () => false, what = 'model' } = {}) {
  const fallbackVowel = [...table.keys()].find((k) => isVowel(k) && k !== 'SP' && k !== 'AP');
  const fallbackConsonant = [...table.keys()].find((k) => k && !isVowel(k) && !/^(?:<PAD>|SP|AP)$/.test(k));
  const missing = [];
  const ids = symbols.map((s) => {
    if (table.has(s)) return table.get(s);
    missing.push(s);
    const sub = isVowel(s) ? fallbackVowel : fallbackConsonant;
    return table.get(sub ?? 'SP') ?? 0;
  });
  if (missing.length && strict) { const e = new Error(`Phoneme(s) ${[...new Set(missing)].join(' ')} not supported by the ${what}.`); e.code = 'phoneme'; throw e; }
  return ids;
}

const langIdsOf = (symbols, langIds) => symbols.map((s) => langIds?.get(phonemeLanguage(s)) ?? 0);

/** Depth / steps inputs (continuous acceleration: steps + float depth; legacy: speedup + int depth). */
export function samplingFeeds(config, steps, inputNames, { depth = 1 } = {}) {
  const feeds = {};
  const maxDepth = config.use_continuous_acceleration ? Number(config.max_depth ?? 1) : Number(config.max_depth ?? 1000) / 1000;
  const variable = config.use_variable_depth ?? config.use_shallow_diffusion ?? false;
  const d = variable ? Math.min(depth, maxDepth > 0 ? maxDepth : 1) : 1;
  if (config.use_continuous_acceleration) {
    if (variable) feeds.depth = tensor.f32([d], [1]);
    feeds.steps = tensor.i64([steps], [1]);
  } else {
    let speedup;
    if (variable) {
      let depth64 = Math.round(d * 1000);
      speedup = Math.max(1, Math.floor(depth64 / steps));
      depth64 = Math.floor(depth64 / speedup) * speedup;
      feeds.depth = tensor.i64([depth64], [1]);
    } else {
      speedup = Math.max(1, Math.floor(1000 / steps));
      while (1000 % speedup !== 0 && speedup > 1) speedup--;
    }
    feeds.speedup = tensor.i64([speedup], [1]);
  }
  for (const k of Object.keys(feeds)) if (inputNames && !inputNames.has(k)) delete feeds[k];
  return feeds;
}

/** Linguistic + duration model inputs for a phrase's groups (OpenUtau ProcessPart). */
export function durationFeeds(rt, groups, frameMs) {
  const flat = groups.flatMap((g) => g.phonemes);
  const tokens = tokenize(rt.dur.tokens, flat, { strict: true, what: 'duration model' });
  const { wordDiv, wordDur } = groupWordInputs(groups, frameMs);
  const linguistic = { tokens: tensor.i64(tokens), word_div: tensor.i64(wordDiv), word_dur: tensor.i64(wordDur) };
  if (rt.dur.config.use_lang_id) linguistic.languages = tensor.i64(langIdsOf(flat, rt.dur.langIds));
  const phMidi = groups.flatMap((g) => g.phonemes.map(() => g.tone));
  const duration = { ph_midi: tensor.i64(phMidi), word_div: linguistic.word_div, word_dur: linguistic.word_dur };
  if (rt.dur.emb) duration.spk_embed = repeatEmbed(rt.dur.emb, flat.length);
  return { linguistic, duration, count: flat.length };
}

/** The notes of a phrase for a pitch model: durations (frames), MIDI, rest flags (OpenUtau DsPitch). */
export function pitchNotes(phrase, phones, startMs, totalFrames, frameMs, isVowel) {
  const notes = phrase.notes;
  const durMs = [Math.max(0, notes[0].startMs - startMs)];
  const midi = [notes[0].midi];
  const rest = [true];
  let prevEnd = notes[0].startMs;
  for (const n of notes) {
    const gap = n.startMs - prevEnd;
    if (gap > 0) { durMs.push(gap); midi.push(n.midi); rest.push(true); }
    durMs.push(n.endMs - n.startMs);
    midi.push(n.midi);
    const inside = phones.filter((ph) => ph.positionMs + ph.durationMs > n.startMs + 1 && ph.positionMs < n.endMs - 1);
    rest.push(!inside.length || inside.every((ph) => ph.phoneme === 'SP' || ph.phoneme === 'AP' || !isVowel(ph.phoneme)));
    prevEnd = n.endMs;
  }
  durMs.push(TAIL_FRAMES * frameMs);
  midi.push(notes[notes.length - 1].midi);
  rest.push(true);
  // Rests take the pitch of their neighbours (the first half the note before, the second the note after).
  if (rest.every(Boolean)) midi.fill(60);
  else {
    for (let i = 0; i < rest.length; i++) {
      if (!rest[i]) continue;
      let j = i + 1;
      while (j < rest.length && rest[j]) j++;
      if (i === 0) midi.fill(midi[j], 0, j);
      else if (j === rest.length) midi.fill(midi[i - 1], i, rest.length);
      else { const mid = Math.floor((i + j + 1) / 2); midi.fill(midi[i - 1], i, mid); midi.fill(midi[j], mid, j); }
      i = j;
    }
  }
  return { noteDur: fitDurationSum(durationsMsToFrames(durMs, frameMs), totalFrames), noteMidi: midi, noteRest: rest };
}

/** A sung line from the notes (no pitch model): glides between notes and a vibrato on long notes. */
export function rulePitch(notes, startMs, totalFrames, frameMs) {
  const out = new Float32Array(totalFrames);
  let k = 0;
  for (let f = 0; f < totalFrames; f++) {
    const t = startMs + f * frameMs;
    while (k + 1 < notes.length && t >= notes[k + 1].startMs - 40) k++;
    const n = notes[k];
    let tone = n.midi;
    if (k > 0 && t < n.startMs + 60) {
      const x = Math.min(1, Math.max(0, (t - (n.startMs - 40)) / 100));
      tone = notes[k - 1].midi + (n.midi - notes[k - 1].midi) * (0.5 - 0.5 * Math.cos(Math.PI * x));
    }
    const into = t - n.startMs;
    if (n.endMs - n.startMs > 450 && into > 250) tone += Math.min(1, (into - 250) / 300) * 0.28 * Math.sin((2 * Math.PI * 5.5 * into) / 1000);
    out[f] = tone;
  }
  return out;
}

/** Linear resampling of a per-frame curve to `length` frames. */
export function resampleCurve(curve, length) {
  if (curve.length === length) return curve;
  const out = new Float32Array(length);
  if (curve.length === 1 || length === 1) { out.fill(curve[0]); return out; }
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * (curve.length - 1);
    const a = Math.floor(x);
    const b = Math.min(a + 1, curve.length - 1);
    out[i] = curve[a] + (curve[b] - curve[a]) * (x - a);
  }
  return out;
}

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

/**
 * Everything the acoustic model takes for one phrase, given its phones and pitch curve (semitones).
 * Returns { feeds, totalFrames, durations, f0 } (feeds not in `inputNames` are left out).
 */
export function acousticFeeds(rt, phones, pitch, { steps = 20, inputNames = null, variance = null } = {}) {
  const frameMs = rt.frameMs;
  const segments = paddedSegments(phones, frameMs);
  const durations = durationsMsToFrames(segments.map((s) => s.ms), frameMs);
  const total = durations.reduce((a, b) => a + b, 0);
  const symbols = segments.map((s) => s.phoneme);
  const tokens = tokenize(rt.acoustic.tokens, symbols, { strict: true, what: 'acoustic model' });
  const curve = resampleCurve(pitch, total);
  const f0 = new Float32Array(total);
  for (let i = 0; i < total; i++) f0[i] = midiToHz(curve[i]);
  const c = rt.config;
  const feeds = { tokens: tensor.i64(tokens), durations: tensor.i64(durations), f0: tensor.f32(f0) };
  Object.assign(feeds, samplingFeeds(c, steps, null, { depth: 1 }));
  if (c.use_lang_id) feeds.languages = tensor.i64(segments.map((s) => (s.index >= 0 ? rt.acoustic.langIds?.get(phonemeLanguage(s.phoneme)) ?? 0 : 0)));
  if (rt.acoustic.emb) feeds.spk_embed = repeatEmbed(rt.acoustic.emb, total);
  if (c.use_key_shift_embed) feeds.gender = tensor.f32(new Float32Array(total));
  if (c.use_speed_embed) feeds.velocity = tensor.f32(new Float32Array(total).fill(1));
  const clampDb = (v) => Math.min(0, Math.max(-96, v));
  if (c.use_energy_embed) feeds.energy = tensor.f32(resampleCurve(variance?.energy ?? new Float32Array(total).fill(-30), total).map(clampDb));
  if (c.use_breathiness_embed) feeds.breathiness = tensor.f32(resampleCurve(variance?.breathiness ?? new Float32Array(total).fill(-70), total).map(clampDb));
  if (c.use_voicing_embed) feeds.voicing = tensor.f32(resampleCurve(variance?.voicing ?? new Float32Array(total).fill(-10), total).map(clampDb));
  if (c.use_tension_embed) feeds.tension = tensor.f32(resampleCurve(variance?.tension ?? new Float32Array(total), total).map((v) => Math.min(10, Math.max(-10, v))));
  if (inputNames) for (const k of Object.keys(feeds)) if (!inputNames.has(k)) delete feeds[k];
  return { feeds, totalFrames: total, durations, f0, segments };
}

/** The mel spectrogram scaled to the vocoder's log base (10 ↔ e) when they differ. */
export function melForVocoder(mel, acousticBase, vocoderBase) {
  const a = String(acousticBase ?? '10');
  const v = String(vocoderBase ?? '10');
  if (a === v) return mel;
  const k = v === 'e' && a === '10' ? 2.30259 : v === '10' && a === 'e' ? 0.434294 : 1;
  const out = new Float32Array(mel.length);
  for (let i = 0; i < mel.length; i++) out[i] = mel[i] * k;
  return out;
}

const first = (outputs, name) => outputs[name] ?? Object.values(outputs)[0];

/** Linguistic encoder of a pitch / variance part over the padded phones. */
async function partEncoder(part, key, phones, frameMs, runner, isVowel) {
  const segments = paddedSegments(phones, frameMs);
  const phDur = durationsMsToFrames(segments.map((s) => s.ms), frameMs);
  const symbols = segments.map((s) => s.phoneme);
  const feeds = { tokens: tensor.i64(tokenize(part.tokens, symbols, { isVowel })) };
  if (part.config.predict_dur) {
    const vowel = part.dict ? (s) => part.dict.isVowel(s) : isVowel;
    const { wordDiv, wordDur } = wordDivAndDur(segments, phDur, vowel);
    feeds.word_div = tensor.i64(wordDiv);
    feeds.word_dur = tensor.i64(wordDur);
  } else feeds.ph_dur = tensor.i64(phDur);
  if (part.config.use_lang_id) feeds.languages = tensor.i64(segments.map((s) => (s.index >= 0 ? part.langIds?.get(phonemeLanguage(s.phoneme)) ?? 0 : 0)));
  const out = await runner.run(`${key}.linguistic`, filterFeeds(feeds, runner, `${key}.linguistic`));
  return { encoder: out.encoder_out, masks: out.x_masks, phDur, total: phDur.reduce((a, b) => a + b, 0) };
}

const filterFeeds = (feeds, runner, key) => {
  const names = runner.inputs?.(key);
  if (!names) return feeds;
  const out = {};
  for (const [k, v] of Object.entries(feeds)) if (names.has(k)) out[k] = v;
  return out;
};

/**
 * Sings one phrase. `phrase`: { notes: [{ startMs, endMs, midi, syl }] }. `runner`: { run(key, feeds) →
 * outputs, inputs(key) → Set }. Returns { startMs, samples (44.1 kHz), phones, words, unknown }.
 */
export async function renderPhrase(rt, phrase, runner, { steps = 20, pitchSteps = 10, varianceSteps = 10, fallbackLang = 'ko', signal = null, onStage = null } = {}) {
  const check = () => { if (signal?.aborted) { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; } };
  const isVowel = vowelTest(rt);
  const phTokens = rt.dur?.tokens ?? rt.acoustic.tokens;
  const words = phraseWords(phrase, { dicts: rt.dicts, tokens: phTokens, fallbackLang });
  const { groups } = phraseGroups(words);
  const durFrameMs = rt.dur ? frameMsOf(rt.dur.config) : rt.frameMs;
  let frames;
  if (rt.dur) {
    onStage?.('duration');
    const f = durationFeeds(rt, groups, durFrameMs);
    const ling = await runner.run('dur.linguistic', filterFeeds(f.linguistic, runner, 'dur.linguistic'));
    check();
    const out = await runner.run('dur.model', filterFeeds({ encoder_out: ling.encoder_out, x_masks: ling.x_masks, ...f.duration }, runner, 'dur.model'));
    frames = Array.from(first(out, 'ph_dur_pred').data, Number);
  } else frames = ruleDurations(groups, isVowel, durFrameMs);
  check();
  const phones = alignPhones(groups, frames, durFrameMs);
  const frameMs = rt.frameMs;
  const startMs = phones[0].positionMs - HEAD_FRAMES * frameMs;
  const totalFrames = durationsMsToFrames(paddedSegments(phones, frameMs).map((s) => s.ms), frameMs).reduce((a, b) => a + b, 0);
  // Pitch.
  let pitch;
  if (rt.pitch) {
    onStage?.('pitch');
    const pf = frameMsOf(rt.pitch.config);
    const enc = await partEncoder(rt.pitch, 'pitch', phones, pf, runner, isVowel);
    check();
    const { noteDur, noteMidi, noteRest } = pitchNotes(phrase, phones, phones[0].positionMs - HEAD_FRAMES * pf, enc.total, pf, isVowel);
    const names = runner.inputs?.('pitch.model');
    const feeds = {
      encoder_out: enc.encoder, note_midi: tensor.f32(noteMidi), note_dur: tensor.i64(noteDur), ph_dur: tensor.i64(enc.phDur),
      pitch: tensor.f32(new Float32Array(enc.total).fill(60)), retake: tensor.bool(new Array(enc.total).fill(true)),
      ...samplingFeeds({ ...rt.pitch.config, use_variable_depth: false }, pitchSteps, names),
    };
    if (rt.pitch.config.use_note_rest) feeds.note_rest = tensor.bool(noteRest);
    if (rt.pitch.config.use_expr) feeds.expr = tensor.f32(new Float32Array(enc.total).fill(1));
    if (rt.pitch.emb) feeds.spk_embed = repeatEmbed(rt.pitch.emb, enc.total);
    const out = await runner.run('pitch.model', filterFeeds(feeds, runner, 'pitch.model'));
    pitch = resampleCurve(Float32Array.from(first(out, 'pitch_pred').data), totalFrames);
  } else pitch = rulePitch(phrase.notes, startMs, totalFrames, frameMs);
  check();
  // Variance (energy, breathiness, …) when the acoustic model takes them.
  let variance = null;
  const c = rt.config;
  if (rt.variance && (c.use_energy_embed || c.use_breathiness_embed || c.use_voicing_embed || c.use_tension_embed)) {
    onStage?.('variance');
    const vc = rt.variance.config;
    const vf = frameMsOf(vc);
    const enc = await partEncoder(rt.variance, 'variance', phones, vf, runner, isVowel);
    check();
    const n = enc.total;
    const kinds = ['energy', 'breathiness', 'voicing', 'tension'].filter((k) => vc[`predict_${k}`] ?? (k === 'energy' || k === 'breathiness'));
    const feeds = { encoder_out: enc.encoder, ph_dur: tensor.i64(enc.phDur), pitch: tensor.f32(resampleCurve(pitch, n)), retake: { type: 'bool', data: new Uint8Array(n * kinds.length).fill(1), dims: [1, n, kinds.length] }, ...samplingFeeds({ ...vc, use_variable_depth: false }, varianceSteps, runner.inputs?.('variance.model')) };
    for (const k of kinds) feeds[k] = tensor.f32(new Float32Array(n));
    if (rt.variance.emb) feeds.spk_embed = repeatEmbed(rt.variance.emb, n);
    const out = await runner.run('variance.model', filterFeeds(feeds, runner, 'variance.model'));
    variance = {};
    for (const k of kinds) if (out[`${k}_pred`]) variance[k] = Float32Array.from(out[`${k}_pred`].data);
  }
  check();
  onStage?.('acoustic');
  const ac = acousticFeeds(rt, phones, pitch, { steps, inputNames: runner.inputs?.('acoustic') ?? null, variance });
  const acOut = await runner.run('acoustic', ac.feeds);
  check();
  const melT = first(acOut, 'mel');
  const mel = melForVocoder(Float32Array.from(melT.data), c.mel_base, rt.vocoder.config.mel_base);
  onStage?.('vocoder');
  const vocOut = await runner.run('vocoder', filterFeeds({ mel: { type: 'float32', data: mel, dims: melT.dims }, f0: tensor.f32(ac.f0) }, runner, 'vocoder'));
  const wave = Float32Array.from(first(vocOut, 'waveform').data);
  return { startMs, samples: wave, sampleRate: rt.vocoder.config.sample_rate || SAMPLE_RATE, phones, words: words.map((w) => ({ text: w.text, symbols: w.symbols, found: w.found, rest: Boolean(w.rest) })), unknown: words.filter((w) => !w.found).map((w) => w.text), frames: ac.totalFrames };
}
