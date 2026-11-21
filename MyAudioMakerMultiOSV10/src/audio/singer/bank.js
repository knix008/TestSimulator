// An OpenUtau DiffSinger voice bank's layout (CONTRACT: pure apart from the reader it is given):
//   character.yaml, dsconfig.yaml (acoustic model, phonemes, speakers, vocoder), <speaker>.emb,
//   dsdur/ (linguistic + duration model, dsdict*.yaml), dspitch/ (pitch model), dsvariance/,
//   dsvocoder/ (vocoder.yaml + model) or dsconfig "vocoder: <dependency>" (installed separately).
// readBankLayout() checks that the files the singer needs are there and collects what the settings
// show: name, author, languages, speakers, size, and the licence / credit files to read before use.
import { parseYaml } from './yaml.js';

const join = (dir, rel) => {
  const parts = `${dir ? `${dir}/` : ''}${String(rel ?? '').replace(/\\/g, '/')}`.split('/');
  const out = [];
  for (const p of parts) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
  return out.join('/');
};
export const joinPath = join;

/** Licence-like files: shown before a bank is used. */
export const LICENCE_FILE = /(?:^|\/)(?:[^/]*(?:licen[cs]e|readme|terms|credit|copyright|copying|notice|eula|rule|利用規約|規約|약관|이용|規則)[^/]*)\.(?:txt|md|markdown|url|html?)$|(?:^|\/)character\.txt$/i;

/** A file index: case-insensitive lookups of the bank's files. */
export function fileIndex(files) {
  const byLower = new Map();
  let size = 0;
  for (const f of files) { const p = String(f.path).replace(/\\/g, '/'); byLower.set(p.toLowerCase(), { path: p, size: Number(f.size) || 0 }); size += Number(f.size) || 0; }
  return {
    size,
    count: byLower.size,
    has: (p) => byLower.has(join('', p).toLowerCase()),
    get: (p) => byLower.get(join('', p).toLowerCase())?.path ?? null,
    sizeOf: (p) => byLower.get(join('', p).toLowerCase())?.size ?? 0,
    all: () => [...byLower.values()].map((f) => f.path),
  };
}

const yamlOf = async (index, read, path) => {
  const real = index.get(path);
  if (!real) return null;
  try { return parseYaml(await read(real, 'text')) ?? {}; } catch (error) { throw new Error(`${real}: ${error.message}`); }
};

/** The phonemes file of a config: its own key, else phonemes.txt / phonemes.json beside it. */
function phonemesPath(index, dir, config) {
  const named = config?.phonemes ? join(dir, config.phonemes) : null;
  if (named && index.has(named)) return index.get(named);
  for (const name of ['phonemes.json', 'phonemes.txt']) if (index.has(join(dir, name))) return index.get(join(dir, name));
  return named;
}

/** Dictionaries in a folder by language: { ko: [...], en: [...], '': ['dsdict.yaml'] } in lookup order. */
function dictionaries(index, dir) {
  const out = {};
  for (const path of index.all()) {
    const m = /^(?:(.*)\/)?dsdict(?:-([a-z]{2,3}(?:-[a-z0-9]+)?))?\.yaml$/i.exec(path);
    if (!m || (m[1] ?? '') !== dir) continue;
    const lang = (m[2] ?? '').toLowerCase();
    (out[lang] ??= []).push(path);
  }
  return out;
}

/** The dictionary files for a language, OpenUtau order: dsdict-<lang>.yaml, else dsdict.yaml. */
export function dictionaryFor(dicts, lang) {
  const exact = (dicts[lang] ?? []).filter((p) => /dsdict-[a-z]+\.yaml$/i.test(p));
  if (exact.length) return exact[0];
  return dicts['']?.[0] ?? null;
}

function sub(index, config, dir, kind) {
  if (!config) return null;
  const need = { dur: ['linguistic', 'dur'], pitch: ['linguistic', 'pitch'], variance: ['linguistic', 'variance'] }[kind];
  const missing = need.filter((k) => !config[k] || !index.has(join(dir, config[k]))).map((k) => (config[k] ? join(dir, config[k]) : `${dir}/dsconfig.yaml: ${k}`));
  const phonemes = phonemesPath(index, dir, config);
  if (!phonemes || !index.has(phonemes)) missing.push(phonemes ?? `${dir}/phonemes.txt`);
  return {
    dir, config, missing,
    linguistic: config.linguistic ? index.get(join(dir, config.linguistic)) : null,
    model: config[need[1]] ? index.get(join(dir, config[need[1]])) : null,
    phonemes,
    languages: config.use_lang_id && config.languages ? index.get(join(dir, config.languages)) : null,
    speakers: Array.isArray(config.speakers) ? config.speakers.map(String) : null,
    dicts: dictionaries(index, dir),
  };
}

/**
 * Reads a bank's layout. `files`: [{ path, size }] relative to the bank root; `read(path, 'text')`.
 * Throws an Error with .code 'notBank' when there is no usable acoustic model.
 */
export async function readBankLayout(files, read) {
  const index = fileIndex(files);
  const config = await yamlOf(index, read, 'dsconfig.yaml');
  if (!config || !config.acoustic) {
    const error = new Error(index.has('vocoder.yaml') ? 'This archive is a vocoder, not a voice bank.' : 'No DiffSinger voice bank (dsconfig.yaml with an acoustic model) was found.');
    error.code = index.has('vocoder.yaml') ? 'isVocoder' : 'notBank';
    throw error;
  }
  const character = (await yamlOf(index, read, 'character.yaml')) ?? {};
  const problems = [];
  const acousticPath = index.get(config.acoustic) ?? join('', config.acoustic);
  if (!index.has(acousticPath)) problems.push(acousticPath);
  const acPhonemes = phonemesPath(index, '', config);
  if (!acPhonemes || !index.has(acPhonemes)) problems.push(acPhonemes ?? 'phonemes.txt');
  const speakerFiles = Array.isArray(config.speakers) ? config.speakers.map(String) : null;
  for (const s of speakerFiles ?? []) if (!index.has(`${s}.emb`)) problems.push(`${s}.emb`);
  const durConfig = await yamlOf(index, read, 'dsdur/dsconfig.yaml');
  const pitchConfig = await yamlOf(index, read, 'dspitch/dsconfig.yaml');
  const varConfig = await yamlOf(index, read, 'dsvariance/dsconfig.yaml');
  const dur = sub(index, durConfig, 'dsdur', 'dur');
  const pitch = sub(index, pitchConfig, 'dspitch', 'pitch');
  const variance = sub(index, varConfig, 'dsvariance', 'variance');
  for (const part of [dur, pitch, variance]) if (part?.missing.length) problems.push(...part.missing);
  const needsVariance = ['use_energy_embed', 'use_breathiness_embed', 'use_voicing_embed', 'use_tension_embed'].some((k) => config[k]);
  if (needsVariance && !variance) problems.push('dsvariance/dsconfig.yaml');
  // Vocoder: bundled dsvocoder/, else the dependency the bank names.
  let vocoder = null;
  const vocYaml = await yamlOf(index, read, 'dsvocoder/vocoder.yaml');
  if (vocYaml) {
    const model = index.get(join('dsvocoder', vocYaml.model ?? 'model.onnx'));
    if (!model) problems.push(join('dsvocoder', vocYaml.model ?? 'model.onnx'));
    vocoder = { bundled: true, dir: 'dsvocoder', config: vocoderConfig(vocYaml), model };
  } else vocoder = { bundled: false, dependency: config.vocoder ? String(config.vocoder) : null };
  // The phonemizer's dictionaries live with the duration model, else at the root.
  const dictDir = dur ? 'dsdur' : '';
  const dicts = dur?.dicts ?? dictionaries(index, '');
  // Languages: dsdict-<lang>.yaml, languages.json, and Hangul in the main dictionary.
  const languages = new Set(Object.keys(dicts).filter(Boolean).map((l) => l.split('-')[0]));
  const langFile = config.use_lang_id && config.languages ? index.get(config.languages) : null;
  if (langFile) { try { for (const k of Object.keys(JSON.parse(await read(langFile, 'text')))) languages.add(k); } catch { /* ignore */ } }
  const mainDict = dicts['']?.[0];
  if (mainDict && !languages.has('ko')) {
    try { if (/grapheme:\s*["']?[가-힣]/.test(await read(mainDict, 'text'))) languages.add('ko'); } catch { /* ignore */ }
  }
  // Speakers: character.yaml subbanks (named voice colours), else the dsconfig speakers.
  const subbanks = Array.isArray(character.subbanks) ? character.subbanks.filter((s) => s && s.suffix != null) : [];
  const speakers = subbanks.length
    ? subbanks.map((s) => ({ id: String(s.suffix), name: String(s.color ?? s.suffix).trim() }))
    : (speakerFiles ?? []).map((s) => ({ id: s, name: s.split('/').pop() }));
  const licenceFiles = index.all().filter((p) => LICENCE_FILE.test(p) && p.split('/').length <= 3).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return {
    name: String(character.name ?? '').trim() || 'DiffSinger',
    author: character.author != null ? String(character.author) : '',
    voice: character.voice != null ? String(character.voice) : '',
    version: character.version != null ? String(character.version) : '',
    web: character.web != null ? String(character.web) : '',
    image: character.image && index.has(character.image) ? index.get(character.image) : null,
    config,
    acoustic: { model: index.get(acousticPath), phonemes: acPhonemes, speakers: speakerFiles, languages: langFile },
    dur, pitch, variance, vocoder, dictDir, dicts,
    languages: [...languages].sort(),
    speakers,
    licenceFiles,
    size: index.size,
    files: index.count,
    problems: [...new Set(problems)],
  };
}

/** vocoder.yaml with OpenUtau's defaults (some banks write fmin/fmax instead of mel_fmin/mel_fmax). */
export function vocoderConfig(y = {}) {
  return {
    name: String(y.name ?? 'vocoder'), model: String(y.model ?? 'model.onnx'),
    sample_rate: Number(y.sample_rate ?? 44100), hop_size: Number(y.hop_size ?? 512), win_size: Number(y.win_size ?? 2048), fft_size: Number(y.fft_size ?? 2048),
    num_mel_bins: Number(y.num_mel_bins ?? 128), mel_fmin: Number(y.mel_fmin ?? y.fmin ?? 40), mel_fmax: Number(y.mel_fmax ?? y.fmax ?? 16000),
    mel_base: String(y.mel_base ?? '10'), mel_scale: String(y.mel_scale ?? 'slaney'), pitch_controllable: Boolean(y.pitch_controllable),
  };
}

/** Reads a vocoder package's layout (vocoder.yaml at its root). */
export async function readVocoderLayout(files, read) {
  const index = fileIndex(files);
  const y = await yamlOf(index, read, 'vocoder.yaml');
  if (!y) { const e = new Error('No vocoder.yaml found.'); e.code = 'notVocoder'; throw e; }
  const config = vocoderConfig(y);
  const model = index.get(config.model);
  const oudep = (await yamlOf(index, read, 'oudep.yaml')) ?? {};
  return { config, model, problems: model ? [] : [config.model], id: String(oudep.id ?? config.name), version: String(oudep.version ?? ''), licenceFiles: index.all().filter((p) => LICENCE_FILE.test(p) || /statements?\.txt$/i.test(p)), size: index.size };
}

/** Acoustic and vocoder must agree on the audio frame (OpenUtau checks the same). */
export function checkVocoderMatch(acoustic, vocoder) {
  const a = { sample_rate: 44100, hop_size: 512, win_size: 2048, fft_size: 2048, num_mel_bins: 128, mel_fmin: 40, mel_fmax: 16000, mel_scale: 'slaney', ...acoustic };
  const bad = [];
  for (const k of ['sample_rate', 'hop_size', 'win_size', 'fft_size', 'num_mel_bins']) if (Number(a[k]) !== Number(vocoder[k])) bad.push(`${k} ${a[k]} ≠ ${vocoder[k]}`);
  for (const k of ['mel_fmin', 'mel_fmax']) if (Math.abs(Number(a[k]) - Number(vocoder[k])) > 1e-5) bad.push(`${k} ${a[k]} ≠ ${vocoder[k]}`);
  if (String(a.mel_scale) !== String(vocoder.mel_scale)) bad.push(`mel_scale ${a.mel_scale} ≠ ${vocoder.mel_scale}`);
  return bad;
}

/** Which speaker of a model's list a chosen speaker id is: exact, trailing path parts, then file name. */
export function speakerIndex(list, id) {
  if (!list?.length) return -1;
  if (id == null || id === '') return 0;
  const want = String(id).replace(/\\/g, '/');
  let i = list.indexOf(want);
  if (i >= 0) return i;
  const segs = want.split('/');
  i = list.findIndex((s) => { const p = s.split('/'); return segs.length <= p.length && segs.every((x, k) => p[p.length - segs.length + k] === x); });
  if (i >= 0) return i;
  const base = segs[segs.length - 1];
  i = list.findIndex((s) => s.split('/').pop() === base);
  return i >= 0 ? i : 0;
}
