// The instrument library after the recorded instruments were added: every id the songs use is still there,
// each instrument is complete (names, GM program, range, a synth voice as the fallback), and the sampler's
// note choice and playback scheduling work on a fake audio context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS, INSTRUMENT_CATEGORIES, instrument, hasInstrument } from '../../src/music/instruments.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The ids before the sound library (songs, the 24 sample songs and genres refer to them).
const LEGACY = ['piano', 'brightPiano', 'epiano', 'organ', 'harpsichord', 'acousticGuitar', 'nylonGuitar', 'cleanGuitar', 'overdriveGuitar',
  'fingerBass', 'pickBass', 'synthBass', 'subBass', 'uprightBass', 'strings', 'violin', 'cello', 'pizzicato', 'brass', 'trumpet', 'sax', 'flute',
  'clarinet', 'sawLead', 'squareLead', 'chipLead', 'supersaw', 'pluckSynth', 'arpSynth', 'warmPad', 'airPad', 'choirPad', 'bell', 'marimba',
  'vibraphone', 'musicBox', 'kitPop', 'kitAcoustic', 'kit808', 'kitElectro', 'kitLofi', 'kitRock', 'kitBrush', 'voiceFemale', 'voiceMale', 'voiceChoir'];

test('every earlier instrument id still exists', () => {
  for (const id of LEGACY) assert.ok(hasInstrument(id), id);
});

test('about 50 or more instruments, ids unique, each complete', () => {
  assert.ok(INSTRUMENTS.length >= 50, `${INSTRUMENTS.length} instruments`);
  assert.equal(new Set(INSTRUMENTS.map((i) => i.id)).size, INSTRUMENTS.length, 'unique ids');
  const cats = new Set(INSTRUMENT_CATEGORIES.map((c) => c.id));
  for (const i of INSTRUMENTS) {
    assert.ok(cats.has(i.category), `${i.id}: category`);
    assert.ok(i.ko && i.en, `${i.id}: names`);
    assert.ok(Number.isInteger(i.program) && i.program >= 0 && i.program <= 127, `${i.id}: GM program`);
    assert.ok(i.range[0] >= 0 && i.range[1] <= 127 && i.range[0] < i.range[1], `${i.id}: range`);
    assert.ok(i.voice && typeof i.voice === 'object', `${i.id}: a synth voice (the fallback)`);
    if (i.samples) for (const s of [].concat(i.samples)) assert.equal(typeof s, 'string', `${i.id}: samples`);
  }
  assert.ok(INSTRUMENTS.filter((i) => i.samples).length >= 40, 'at least 40 recorded instruments');
});

test('the sample songs only use known instruments', () => {
  const dir = join(ROOT, 'samples');
  const files = readdirSync(dir).filter((f) => f.endsWith('.mam'));
  assert.ok(files.length >= 20, 'sample songs found');
  for (const f of files) {
    const entries = unzipSync(new Uint8Array(readFileSync(join(dir, f))));
    const song = JSON.parse(strFromU8(entries['song.json']));
    for (const t of song.tracks) assert.ok(hasInstrument(t.instrument), `${f}: ${t.instrument}`);
  }
});

// ───────────────────────── the sampler on a fake context

function fakeContext() {
  const param = () => ({ value: 1, events: [], setValueAtTime(v, t) { this.events.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); }, setTargetAtTime(v, t, c) { this.events.push(['target', v, t, c]); }, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect(n) { return n; }, disconnect() {}, ...extra });
  const made = [];
  const ac = {
    sampleRate: 48000, currentTime: 0, made,
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param(), gain: param() }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createBuffer: (ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, data: Array.from({ length: ch }, () => new Float32Array(len)), getChannelData(i) { return this.data[i]; } }),
    createBufferSource: () => { const s = node({ buffer: null, loop: false, loopStart: 0, loopEnd: 0, playbackRate: param(), start(t) { this.started = t; }, stop(t) { this.stopped = t; } }); made.push(s); return s; },
  };
  return ac;
}

test('sampler: plays the nearest recording, pitched, with loops; drums by note', async () => {
  const sampler = await import('../../src/audio/sampler.js');
  const soundlib = await import('../../src/audio/soundlib.js');
  // Serve the project's sounds/ to the loader from disk.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const rel = decodeURIComponent(String(url).replace(/^.*?\/sounds\//, ''));
    try { const buf = readFileSync(join(ROOT, 'sounds', ...rel.split('/'))); return new Response(buf, { status: 200 }); } catch { return new Response('', { status: 404 }); }
  };
  try {
    const ac = fakeContext();
    const progress = [];
    const result = await sampler.preloadInstruments(ac, ['sax', 'kitPop', 'piano', 'organ'], { onProgress: (p) => progress.push(p) });
    assert.deepEqual(result.failed, [], 'nothing failed (the organ has no samples: it is not loaded at all)');
    assert.ok(result.loaded.includes('sax') && result.loaded.includes('kitPop') && result.loaded.includes('piano'));
    assert.ok(progress.length > 3 && progress.at(-1).fraction === 1, 'progress reported to the end');
    assert.ok(progress.every((p) => p.fraction >= 0 && p.fraction <= 1 && p.total >= p.done), 'progress values');
    assert.ok(sampler.instrumentReady('sax'));
    assert.deepEqual(sampler.instrumentsToLoad(['sax', 'piano', 'organ']), [], 'loaded instruments need nothing more');

    const m = soundlib.currentManifest();
    const sax = m.sets.altoSax;
    const sources = sampler.playSampledNote(ac, ac.createGain(), instrument('sax'), 1, 2.5, 65, 0.9);
    assert.equal(sources.length, 1);
    const nearest = Math.min(...sax.layers.at(-1).zones.map((z) => Math.abs(z.root - 65)));
    const rate = sources[0].playbackRate.events[0][1];
    const shift = Math.log2(rate) * 12;
    const fits = sax.layers.at(-1).zones.filter((z) => Math.abs(z.root - 65) === nearest).some((z) => Math.abs(shift - (65 - z.root - (z.tune ?? 0) / 100)) < 0.01);
    assert.ok(fits, `pitched from the nearest root (shift ${shift.toFixed(2)} semitones)`);
    assert.equal(sources[0].loop, true, 'a held sax note loops');
    assert.equal(sources[0].started, 1);
    assert.ok(sources[0].stopped > 3.5 && sources[0].stopped < 5, `released after the note (${sources[0].stopped})`);

    const kick = sampler.playSampledDrum(ac, ac.createGain(), 'popKit', 36, 0.5, 0.8);
    assert.equal(kick.length, 1, 'kick sample');
    const conga = sampler.playSampledDrum(ac, ac.createGain(), 'popKit', 63, 0.5, 0.8);
    assert.equal(conga?.length, 1, 'a kit plays the shared percussion (congas) too');
    assert.equal(sampler.playSampledDrum(ac, ac.createGain(), 'popKit', 52, 0.5, 0.8), null, 'a note with no recording: the synthesizer plays it');
    const dest = ac.createGain();
    const open = sampler.playSampledDrum(ac, dest, 'popKit', 46, 1, 0.8)[0];
    sampler.playSampledDrum(ac, dest, 'popKit', 42, 1.2, 0.8);
    assert.ok(open.stopped <= 1.2 + 0.1, 'a closed hi-hat chokes the open one');
    assert.equal(sampler.playSampledNote(ac, dest, instrument('organ'), 0, 1, 60, 0.8), null, 'no samples: the synth plays');
  } finally {
    globalThis.fetch = realFetch;
  }
});
