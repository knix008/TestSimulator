// The bundled sound library (sounds/, npm run sounds): the manifest matches the files, every recorded instrument
// covers its range with every velocity layer, licences are allowed and credited, and the Ogg Opus decoder reads
// the files back with the lengths and loop points the manifest promises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRUM_NOTES, INSTRUMENTS } from '../../src/music/instruments.js';
import { decodeOggOpus, readOggOpus } from '../../src/audio/ogg-opus.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOUNDS = join(ROOT, 'sounds');
const manifest = JSON.parse(readFileSync(join(SOUNDS, 'manifest.json'), 'utf8'));
const ALLOWED = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'MIT', 'public-domain'];
const MAX_SHIFT = 12; // semitones a note may be pitched from its nearest recording (only at the range's edges)
const filesOf = (set) => [...new Map((set.kind === 'drums' ? Object.values(set.notes).flatMap((n) => n.layers) : set.layers.flatMap((l) => l.zones)).map((z) => [z.file, z])).values()];

/** Velocity ranges of a layer list cover 0–1 without gaps or overlaps. */
function assertVelocities(layers, where) {
  const sorted = [...layers].sort((a, b) => a.vel[0] - b.vel[0]);
  assert.equal(sorted[0].vel[0], 0, `${where}: velocities start at 0`);
  assert.equal(sorted.at(-1).vel[1], 1, `${where}: velocities end at 1`);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i].vel[0], sorted[i - 1].vel[1], `${where}: velocity layers touch`);
}

test('manifest: format and sets', () => {
  assert.equal(manifest.format, 'myaudiomaker-sounds');
  assert.equal(manifest.codec, 'ogg-opus');
  assert.ok(Object.keys(manifest.sets).length >= 30, 'at least 30 sample sets');
});

test('every file of the manifest exists with its size and SHA-256', () => {
  let total = 0;
  for (const [id, set] of Object.entries(manifest.sets)) {
    for (const z of filesOf(set)) {
      const path = join(SOUNDS, ...z.file.split('/'));
      assert.ok(existsSync(path), `${id}: ${z.file} exists`);
      const buf = readFileSync(path);
      assert.equal(buf.length, z.bytes, `${z.file}: size`);
      assert.equal(createHash('sha256').update(buf).digest('hex'), z.sha256, `${z.file}: hash`);
      assert.equal(buf.subarray(0, 4).toString('latin1'), 'OggS', `${z.file}: Ogg`);
      total += buf.length;
    }
  }
  assert.equal(total, manifest.totalBytes, 'totalBytes');
  assert.ok(total < 160 * 1024 * 1024, `the library stays within the installer budget (${(total / 1e6).toFixed(1)} MB)`);
});

test('licences: only allowed ones, each with its licence text and a credit', () => {
  const credits = readFileSync(join(SOUNDS, 'CREDITS.md'), 'utf8');
  const used = new Set(Object.values(manifest.sets).flatMap((s) => s.sources));
  for (const id of used) {
    const src = manifest.sources[id];
    assert.ok(src, `source ${id} is described`);
    assert.ok(ALLOWED.includes(src.licence), `${id}: ${src.licence} is allowed`);
    const text = readFileSync(join(SOUNDS, ...src.licenceFile.split('/')), 'utf8');
    assert.doesNotMatch(text, /NonCommercial|NoDerivatives|ShareAlike/i, `${id}: no NC / ND / SA terms`);
    assert.ok(credits.includes(src.name), `${id} is credited`);
    if (src.licence.startsWith('CC-BY')) {
      assert.ok(src.attribution && credits.includes(src.attribution), `${id}: the CC BY attribution is in CREDITS.md`);
      assert.match(text, /Attribution/, `${id}: licence text`);
    }
  }
});

test('instruments name existing sets; tonal sets cover the instrument range in every layer', () => {
  const gaps = [];
  for (const inst of INSTRUMENTS.filter((i) => i.samples && !i.drums)) {
    const ids = [].concat(inst.samples);
    for (const s of ids) assert.equal(manifest.sets[s]?.kind, 'tonal', `${inst.id}: set ${s}`);
    for (const s of ids) assertVelocities(manifest.sets[s].layers, `${inst.id}/${s}`);
    for (let midi = inst.range[0]; midi <= inst.range[1]; midi++) {
      // A section (several sets) needs one set near the note. Within it every velocity layer has a recording near
      // (the sampler borrows from another layer only where one layer was recorded over a shorter range).
      const near = ids.map((s) => manifest.sets[s]).filter((set) => set.layers.some((l) => l.zones.some((z) => Math.abs(z.root - midi) <= MAX_SHIFT)));
      assert.ok(near.length, `${inst.id}: note ${midi} has a recording within ${MAX_SHIFT} semitones`);
      const full = near.filter((set) => set.layers.every((l) => l.zones.some((z) => Math.abs(z.root - midi) <= MAX_SHIFT)));
      if (!full.length) gaps.push(`${inst.id}:${midi}`);
    }
  }
  // Known: the VSCO horn has no loud recordings above C5 (its top notes use the soft layer).
  assert.deepEqual(gaps.filter((g) => !g.startsWith('frenchHorn:')), [], 'velocity layers cover the range');
});

test('tonal zones: sane roots, tuning, lengths and loops', () => {
  for (const [id, set] of Object.entries(manifest.sets).filter(([, s]) => s.kind === 'tonal')) {
    assert.ok(set.gain > 0 && set.gain < 10, `${id}: gain`);
    assert.ok(set.release > 0, `${id}: release`);
    for (const l of set.layers) {
      assert.ok(l.zones.length, `${id}: layer has zones`);
      for (const z of l.zones) {
        assert.ok(Number.isInteger(z.root) && z.root >= 12 && z.root <= 120, `${z.file}: root ${z.root}`);
        assert.ok(Math.abs(z.tune ?? 0) <= 50, `${z.file}: tune`);
        assert.ok(z.dur > 0.05 && z.dur <= 12, `${z.file}: duration ${z.dur}`);
        if (z.loop) assert.ok(z.loop[0] >= 0 && z.loop[1] > z.loop[0] + 0.2 && z.loop[1] <= z.dur + 1e-3, `${z.file}: loop ${z.loop}`);
      }
    }
  }
});

test('drum kits: named GM notes, velocity layers, the core hits recorded', () => {
  for (const inst of INSTRUMENTS.filter((i) => i.drums && i.samples)) {
    const set = manifest.sets[inst.samples];
    assert.equal(set?.kind, 'drums', `${inst.id}: kit ${inst.samples}`);
    if (set.also) assert.equal(manifest.sets[set.also]?.kind, 'drums', `${inst.id}: shared percussion ${set.also}`);
    for (const [n, hit] of Object.entries(set.notes)) {
      assert.ok(DRUM_NOTES[n], `${inst.id}: note ${n} has a name`);
      assertVelocities(hit.layers, `${inst.id}/${n}`);
      for (const l of hit.layers) assert.ok(l.level > 0 && l.level <= 1, `${inst.id}/${n}: level`);
    }
    if (inst.samples !== 'percussion') for (const n of [36, 38, 42, 46, 49, 51]) assert.ok(set.notes[n], `${inst.id}: note ${n} is recorded`);
  }
});

test('Ogg Opus: the decoder reads files back at the manifest length, loops inside', async () => {
  const picks = ['grandPiano', 'stringEnsemble', 'altoSax', 'popKit', 'cp80'].map((id) => filesOf(manifest.sets[id])).flatMap((zs) => [zs[0], zs.at(-1)]);
  for (const z of picks) {
    const bytes = new Uint8Array(readFileSync(join(SOUNDS, ...z.file.split('/'))));
    const head = readOggOpus(bytes);
    assert.ok(head.channels === 1 || head.channels === 2, `${z.file}: channels`);
    const out = await decodeOggOpus(bytes);
    assert.equal(out.sampleRate, 48000);
    assert.equal(out.channelData.length, head.channels);
    const expected = Math.round(z.dur * 48000);
    assert.ok(Math.abs(out.length - expected) <= 2, `${z.file}: ${out.length} samples, manifest ${expected}`);
    let peak = 0; let finite = true;
    for (const ch of out.channelData) for (let i = 0; i < ch.length; i += 7) { if (!Number.isFinite(ch[i])) finite = false; peak = Math.max(peak, Math.abs(ch[i])); }
    assert.ok(finite, `${z.file}: finite samples`);
    assert.ok(peak > 0.2 && peak < 1.2, `${z.file}: peak ${peak.toFixed(2)}`);
    if (z.loop) assert.ok(z.loop[1] * 48000 <= out.length + 2, `${z.file}: loop end inside the decoded audio`);
  }
});

test('loops are seamless: the audio before the loop end matches the audio before the loop start', async () => {
  const looped = Object.values(manifest.sets).filter((s) => s.kind === 'tonal' && s.loop).flatMap((s) => [s.layers[0].zones[0], s.layers.at(-1).zones.at(-1)]).filter((z) => z.loop);
  assert.ok(looped.length >= 20, 'looped zones');
  const worst = [];
  for (const z of looped) {
    const { channelData } = await decodeOggOpus(new Uint8Array(readFileSync(join(SOUNDS, ...z.file.split('/')))));
    const ch = channelData[0];
    const ls = Math.round(z.loop[0] * 48000); const le = Math.min(ch.length, Math.round(z.loop[1] * 48000));
    const n = 96; let diff = 0; let sig = 0;
    for (let i = 1; i <= n; i++) { diff += (ch[le - i] - ch[ls - i]) ** 2; sig += ch[le - i] ** 2 + ch[ls - i] ** 2; }
    worst.push([Math.sqrt(diff / Math.max(1e-12, sig / 2)), z.file]);
  }
  worst.sort((a, b) => b[0] - a[0]);
  assert.ok(worst[0][0] < 0.35, `loop seams (worst ${worst[0][0].toFixed(3)} at ${worst[0][1]})`);
});

test('Ogg reader rejects what is not Ogg Opus', () => {
  assert.throws(() => readOggOpus(new Uint8Array(64)), /Ogg/);
});
