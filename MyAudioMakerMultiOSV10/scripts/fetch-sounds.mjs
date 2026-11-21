#!/usr/bin/env node
// npm run sounds — builds the bundled sound library `sounds/` from free sample sources (scripts/sounds-config.mjs):
// downloads the recordings (into a cache OUTSIDE the project), picks notes about every 3 semitones and one or two
// velocity layers, trims silence, checks the real pitch, normalizes, bakes loops for sustained sounds, encodes
// Ogg Opus with ffmpeg and writes sounds/<set>/<file>.ogg, sounds/manifest.json, sounds/CREDITS.md and
// sounds/licenses/*. Re-runnable: downloads and finished sample sets are kept.
//
// Options: --only id,id   rebuild only these sets      --force   rebuild every set      --cache <dir>
//          --list         print the plan without building
// Needs: git, ffmpeg (with libopus) and a network connection.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_LICENCES, DRUMS, SOURCES, TONAL } from './sounds-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'sounds');
const BUILD_VERSION = 5; // bump when processing changes: every set is rebuilt
const SR = 48000;
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const FORCE = args.includes('--force');
const LIST = args.includes('--list');
const CACHE = resolve(opt('--cache') ?? process.env.MYAUDIOMAKER_SOUNDS_CACHE ?? join(tmpdir(), 'myaudiomaker-sounds-src'));
if (`${CACHE}${sep}`.toLowerCase().startsWith(`${ROOT}${sep}`.toLowerCase())) throw new Error(`The source cache must be outside the project: ${CACHE}`);

const log = (...a) => console.log(...a);
const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const noteMidi = (n, o) => 12 * (Number(o) + 1) + NOTE_PC[n[0].toLowerCase()] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0);
const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const hashOf = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const specHash = (spec) => hashOf(JSON.stringify(spec, (k, v) => (v instanceof RegExp ? v.source : typeof v === 'function' ? v.toString() : v)) + BUILD_VERSION);

// ───────────────────────── sources: listing and download

function run(cmd, argv, options = {}) {
  return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...options }).toString();
}

const listings = new Map();
/** Every file path of a source at its pinned commit (a blob-less clone: names only, nothing downloaded). */
function listing(srcId) {
  if (listings.has(srcId)) return listings.get(srcId);
  const src = SOURCES[srcId];
  const dir = join(CACHE, srcId);
  const cached = join(dir, `tree-${src.commit}.txt`);
  if (!existsSync(cached)) {
    mkdirSync(dir, { recursive: true });
    const repo = join(dir, 'repo');
    if (!existsSync(join(repo, '.git'))) {
      log(`  listing ${src.repo} …`);
      run('git', ['init', '-q', repo]);
      run('git', ['-C', repo, 'remote', 'add', 'origin', `https://github.com/${src.repo}`]);
    }
    run('git', ['-C', repo, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', src.commit]);
    writeFileSync(cached, run('git', ['-C', repo, 'ls-tree', '-r', '--name-only', src.commit]));
  }
  const files = readFileSync(cached, 'utf8').split(/\r?\n/).filter(Boolean);
  listings.set(srcId, files);
  return files;
}

const rawUrl = (srcId, path) => `https://raw.githubusercontent.com/${SOURCES[srcId].repo}/${SOURCES[srcId].commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
const cachePath = (srcId, path) => join(CACHE, srcId, 'files', ...path.split('/'));

const looksLikeAudio = (buf) => buf.length > 64 && (buf.subarray(0, 4).toString('latin1') === 'RIFF' || buf.subarray(0, 4).toString('latin1') === 'fLaC' || buf.subarray(0, 4).toString('latin1') === 'OggS' || buf[0] === 0xff || buf.subarray(0, 3).toString('latin1') === 'ID3');

let downloadedBytes = 0;
async function download(srcId, path, { text = false } = {}) {
  const target = cachePath(srcId, path);
  if (existsSync(target) && statSync(target).size > 0) return target;
  mkdirSync(dirname(target), { recursive: true });
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(rawUrl(srcId, path), { headers: { 'User-Agent': 'sound-library-builder' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buf = Buffer.from(await response.arrayBuffer());
      if (!text && !looksLikeAudio(buf)) throw new Error('not an audio file (Git LFS pointer?)');
      writeFileSync(`${target}.part`, buf);
      renameSync(`${target}.part`, target);
      downloadedBytes += buf.length;
      return target;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`Download failed: ${srcId}:${path}: ${lastError?.message}`);
}

/** Runs `fn` over items with `limit` at a time. */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// ───────────────────────── audio in and out (ffmpeg)

function pipe(cmd, argv, input = null) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const out = []; const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolvePromise(Buffer.concat(out)) : reject(new Error(`${cmd} failed (${code}): ${Buffer.concat(err).toString().slice(-600)}`))));
    if (input) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

/** A file decoded to two Float32Array channels at 48 kHz. */
async function decode(file) {
  const raw = await pipe('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-']);
  const all = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  const n = all.length / 2;
  const L = new Float32Array(n); const R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = all[2 * i]; R[i] = all[2 * i + 1]; }
  return [L, R];
}

async function encode(channels, file, kbps) {
  const n = channels[0].length; const c = channels.length;
  const inter = new Float32Array(n * c);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < c; ch++) inter[i * c + ch] = channels[ch][i];
  mkdirSync(dirname(file), { recursive: true });
  await pipe('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(c), '-i', '-', '-c:a', 'libopus', '-b:a', `${kbps}k`, '-vbr', 'on', '-compression_level', '10', '-application', 'audio', '-map_metadata', '-1', `${file}.tmp.ogg`], Buffer.from(inter.buffer));
  renameSync(`${file}.tmp.ogg`, file);
}

// ───────────────────────── analysis

const peakOf = (chs) => { let p = 0; for (const ch of chs) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > p) p = a; } return p; };
const monoOf = (chs) => { const m = new Float32Array(chs[0].length); for (const ch of chs) for (let i = 0; i < m.length; i++) m[i] += ch[i] / chs.length; return m; };

/** RMS envelope in 10 ms frames. */
function envelope(mono, frame = 480) {
  const out = new Float32Array(Math.ceil(mono.length / frame));
  for (let f = 0; f < out.length; f++) { let s = 0; const a = f * frame; const b = Math.min(mono.length, a + frame); for (let i = a; i < b; i++) s += mono[i] * mono[i]; out[f] = Math.sqrt(s / Math.max(1, b - a)); }
  return out;
}

/** How periodic x is with period tau around `start` (1 = perfectly). */
function periodicity(x, start, len, tau) {
  let num = 0; let den = 0;
  for (let i = start; i < start + len; i++) { const a = x[i]; const b = x[i + tau]; num += (a - b) * (a - b); den += a * a + b * b; }
  return den > 0 ? 1 - num / den : 0;
}

/** The best period between tauLo and tauHi (inclusive), with parabolic refinement: { tau, r }. */
function bestPeriod(x, start, len, tauLo, tauHi) {
  let best = { tau: 0, r: -1 };
  const lo = Math.max(2, Math.floor(tauLo)); const hi = Math.ceil(tauHi);
  for (let tau = lo; tau <= hi; tau++) { const r = periodicity(x, start, len, tau); if (r > best.r) best = { tau, r }; }
  if (best.tau > lo && best.tau < hi) {
    const a = periodicity(x, start, len, best.tau - 1); const b = best.r; const c = periodicity(x, start, len, best.tau + 1);
    const d = a - 2 * b + c;
    if (d < 0) best = { tau: best.tau + 0.5 * (a - c) / d, r: b };
  }
  return best;
}

/**
 * The pitch of a tonal recording: { midi (float), conf } — checks the named note and the octaves around it
 * (sample sets name octaves differently), preferring the highest candidate that is nearly as periodic as the best.
 * With `range` [loHz, hiHz] and no name, searches the whole range (timpani).
 */
function detectPitch(mono, onset, namedMidi, range = null, after = 0.2) {
  const start = Math.min(mono.length - 1, onset + Math.round(SR * after));
  const avail = mono.length - start;
  const candidates = [];
  if (range) {
    const [loHz, hiHz] = range;
    const len = Math.min(8192, avail - Math.ceil(SR / loHz) - 2);
    if (len < 1024) return null;
    // Coarse sweep in semitone steps, then the smallest period close to the best (not a subharmonic).
    const steps = [];
    for (let m = 12 * Math.log2(loHz / 440) + 69; m <= 12 * Math.log2(hiHz / 440) + 69; m += 0.5) {
      const hz = 440 * 2 ** ((m - 69) / 12);
      steps.push({ m, ...bestPeriod(mono, start, len, (SR / hz) * 0.985, (SR / hz) * 1.015) });
    }
    const max = Math.max(...steps.map((s) => s.r));
    if (!(max > 0.3)) return null;
    const pick = steps.filter((s) => s.r >= max * 0.93).sort((a, b) => a.tau - b.tau)[0];
    return pick ? { midi: 69 + 12 * Math.log2(SR / pick.tau / 440), conf: pick.r } : null;
  }
  for (const k of [-24, -12, 0, 12, 24]) {
    const hz = 440 * 2 ** ((namedMidi + k - 69) / 12);
    if (hz < 24 || hz > 4500) continue;
    const tau = SR / hz;
    const len = Math.min(Math.max(4096, Math.round(tau * 6)), avail - Math.ceil(tau * 1.1) - 2);
    if (len < Math.max(512, tau * 2)) continue;
    const best = bestPeriod(mono, start, len, tau * 0.96, tau * 1.04);
    candidates.push({ k, ...best, midi: 69 + 12 * Math.log2(SR / best.tau / 440) });
  }
  if (!candidates.length) return null;
  const max = Math.max(...candidates.map((c) => c.r));
  if (!(max > 0.3)) return null;
  const pick = candidates.filter((c) => c.r >= max * 0.92).sort((a, b) => b.k - a.k)[0];
  return pick ? { midi: pick.midi, octave: pick.k, conf: pick.r } : null;
}

/**
 * The pitch measured in several windows along the note (vibrato and the attack would mislead one window):
 * the median of the confident ones, { midi, conf }.
 */
function measurePitch(mono, onset, namedMidi, range = null) {
  const afters = range ? [0.12, 0.3] : [0.15, 0.35, 0.6, 0.9, 1.3, 1.8];
  const found = afters.map((a) => (onset + (a + 0.25) * SR < mono.length ? detectPitch(mono, onset, namedMidi, range, a) : null)).filter((d) => d && d.conf > 0.5);
  if (!found.length) return null;
  const midis = found.map((d) => d.midi).sort((a, b) => a - b);
  return { midi: midis[Math.floor(midis.length / 2)], conf: Math.max(...found.map((d) => d.conf)), windows: found.length, spread: midis.at(-1) - midis[0] };
}

/** Onset: first sample above -50 dB of the peak, minus a little pre-roll. */
function onsetOf(mono, peak, preroll = 0.002) {
  const th = peak * 0.0032;
  for (let i = 0; i < mono.length; i++) if (Math.abs(mono[i]) > th) return Math.max(0, i - Math.round(SR * preroll));
  return 0;
}

/** Where the sound has faded below -60 dB of the peak (in samples). */
function tailOf(env, peak, frame = 480) {
  const th = peak * 0.001;
  for (let f = env.length - 1; f >= 0; f--) if (env[f] > th) return Math.min(env.length * frame, (f + 2) * frame);
  return env.length * frame;
}

const sliceChs = (chs, a, b) => chs.map((ch) => ch.slice(a, b));

function fadeOut(chs, seconds) {
  const n = chs[0].length; const len = Math.min(n, Math.round(SR * seconds));
  for (const ch of chs) for (let i = 0; i < len; i++) { const g = (1 - i / len) ** 2; ch[n - len + i] *= g; }
}

/**
 * Bakes a seamless loop into a sustained note: finds the steady part (within 6 dB of the loudest), loops its
 * later half, crossfades the loop end into the material before the loop start, and cuts the file at the loop end.
 * Returns [startSec, endSec] or null when the note has no usable steady part.
 */
function bakeLoop(chs, maxLen) {
  const mono = monoOf(chs);
  const env = envelope(mono);
  const top = Math.max(...env);
  const frame = 480;
  let a = env.findIndex((e) => e > top * 0.5);
  let b = env.length - 1; while (b > a && env[b] < top * 0.5) b--;
  if (a < 0 || b <= a) return null;
  let le = Math.min(b * frame - Math.round(0.05 * SR), Math.round(maxLen * SR));
  let ls = Math.max(a * frame + Math.round(0.2 * SR), Math.round(le - 1.6 * SR), Math.round(a * frame + (le - a * frame) * 0.35));
  if (le - ls < 0.35 * SR) { ls = a * frame + Math.round(0.12 * SR); if (le - ls < 0.3 * SR) return null; }
  const X = Math.min(Math.round(0.25 * SR), Math.round((le - ls) * 0.45), ls);
  for (const ch of chs) {
    for (let i = 0; i < X; i++) {
      const t = (i + 1) / (X + 1);
      const gOut = Math.cos(t * Math.PI / 2); const gIn = Math.sin(t * Math.PI / 2); // equal power
      ch[le - X + i] = ch[le - X + i] * gOut + ch[ls - X + i] * gIn;
    }
  }
  for (let c = 0; c < chs.length; c++) chs[c] = chs[c].slice(0, le);
  return [ls / SR, le / SR];
}

/** Mixes decoded files (all start aligned) with gains. */
function mix(list) {
  const n = Math.max(...list.map((x) => x[0].length));
  const out = [new Float32Array(n), new Float32Array(n)];
  for (const chs of list) for (let c = 0; c < 2; c++) { const src = chs[c]; for (let i = 0; i < src.length; i++) out[c][i] += src[i]; }
  return out;
}

const rmsOf = (chs, seconds = 1) => { const m = monoOf(chs); const n = Math.min(m.length, Math.round(seconds * SR)); let s = 0; for (let i = 0; i < n; i++) s += m[i] * m[i]; return Math.sqrt(s / Math.max(1, n)); };

/**
 * Cuts one zone: trims silence, measures pitch (tonal), loops or shortens, normalizes to -1 dBFS, mono/stereo,
 * encodes. Returns its manifest entry (without file hash; added after writing).
 */
async function cutZone({ files, out, kbps, stereo, maxLen, sustain, namedMidi, detect, drum = false, len = null }) {
  const decoded = await Promise.all(files.map((f) => decode(f)));
  let chs = decoded.length === 1 ? decoded[0] : mix(decoded);
  const rawPeak = peakOf(chs);
  if (rawPeak < 1e-5) throw new Error(`silent recording: ${files.join(', ')}`);
  let mono = monoOf(chs);
  const onset = onsetOf(mono, rawPeak, drum ? 0.0008 : 0.003);
  let pitch = null;
  if (!drum) pitch = measurePitch(mono, onset, namedMidi ?? 60, detect);
  const env = envelope(mono);
  const tail = tailOf(env, rawPeak);
  chs = sliceChs(chs, onset, Math.max(onset + 480, tail));
  let loop = null;
  const keep = drum ? (len ?? maxLen) : maxLen;
  if (sustain) loop = bakeLoop(chs, keep);
  if (!loop && chs[0].length > keep * SR) { chs = sliceChs(chs, 0, Math.round(keep * SR)); fadeOut(chs, Math.max(0.08, keep * 0.25)); } else if (!loop) fadeOut(chs, 0.02);
  // Normalize.
  const peak = peakOf(chs);
  const g = 0.89 / peak;
  for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  if (!stereo) chs = [monoOf(chs)];
  await encode(chs, out, kbps);
  return { dur: chs[0].length / SR, loop, rawPeak, pitch, rms: rmsOf(chs) };
}

// ───────────────────────── tonal sets

/** Candidate recordings of a tonal part: [{ path, midi (as named), v }]. */
function candidatesOf(part) {
  const files = listing(part.src).filter((p) => p.startsWith(part.dir));
  const out = [];
  for (const path of files) {
    const m = part.re.exec(path);
    if (!m) continue;
    const g = m.groups ?? {};
    const midi = part.midi ? part.midi(g) : g.n ? noteMidi(g.n, g.o) : null;
    out.push({ path, midi, v: g.v ?? null, drum: g.d ?? null });
  }
  return out;
}

/** Keeps roots about `step` semitones apart from a sorted list (always the lowest and the highest). */
function spread(roots, step) {
  const sorted = [...new Set(roots)].sort((a, b) => a - b);
  const keep = [];
  for (const r of sorted) if (!keep.length || r - keep.at(-1) >= step) keep.push(r);
  if (sorted.length && keep.at(-1) !== sorted.at(-1)) { if (sorted.at(-1) - keep.at(-1) < step / 2 && keep.length > 1) keep.pop(); keep.push(sorted.at(-1)); }
  return keep;
}

async function buildTonal(spec) {
  const layersOfPart = (part) => part.layers ?? spec.layers;
  const nLayers = Math.max(...spec.parts.map((p) => layersOfPart(p).length));
  // 1. Octave naming of each part: measure a few loud notes.
  const plan = [];
  for (const part of spec.parts) {
    const cands = candidatesOf(part);
    if (!cands.length) throw new Error(`${spec.id}: nothing matches in ${part.src}:${part.dir}`);
    let offset = part.octave ?? 0;
    if (!part.detect && part.octave == null) {
      const loud = layersOfPart(part).at(-1);
      const pool0 = cands.filter((c) => loud.includes(c.v)).sort((a, b) => a.midi - b.midi);
      const probes = [pool0[Math.floor(pool0.length * 0.3)], pool0[Math.floor(pool0.length * 0.55)], pool0[Math.floor(pool0.length * 0.8)]].filter(Boolean);
      const votes = [];
      for (const p of probes) {
        const file = await download(part.src, p.path);
        const chs = await decode(file); const mono = monoOf(chs);
        const det = measurePitch(mono, onsetOf(mono, peakOf(chs)), p.midi);
        if (det && det.conf > 0.6) votes.push(Math.round((det.midi - p.midi) / 12) * 12);
      }
      votes.sort((a, b) => votes.filter((v) => v === a).length - votes.filter((v) => v === b).length);
      offset = votes.at(-1) ?? 0;
      if (offset) log(`  ${spec.id}: ${part.dir} is named ${-offset / 12} octave(s) off — corrected`);
    }
    for (const c of cands) c.root = c.midi == null ? null : c.midi + offset;
    plan.push({ part, cands });
  }
  // 2. Choose files per layer.
  const layers = Array.from({ length: nLayers }, () => []);
  for (const { part, cands } of plan) {
    const pl = layersOfPart(part);
    pl.forEach((labels, li) => {
      const target = Math.round((li * (nLayers - 1)) / Math.max(1, pl.length - 1));
      // the first available label of the list, per root
      const byRoot = new Map();
      for (const label of labels) for (const c of cands) if (c.v === label || label === null) {
        const key = part.detect ? c.drum : c.root;
        if ((part.min != null && c.root < part.min) || (part.max != null && c.root > part.max)) continue;
        if (!byRoot.has(key)) byRoot.set(key, c);
      }
      const chosen = part.detect ? [...byRoot.values()] : spread([...byRoot.keys()], spec.step).map((r) => byRoot.get(r));
      layers[target].push(...chosen.map((c) => ({ ...c, part })));
    });
  }
  // 3. Download, cut, encode.
  const jobs = layers.flatMap((zones, li) => zones.map((z) => ({ z, li })));
  await pool(jobs, 6, async ({ z }) => { z.file = await download(z.part.src, z.path); });
  const results = await pool(jobs, Math.max(2, Math.min(8, cpus().length - 1)), async ({ z, li }) => {
    const name = `${z.part.detect ? `drum${z.drum}` : midiName(z.root)}-v${li + 1}.ogg`;
    const out = join(OUT, spec.id, name);
    const r = await cutZone({ files: [z.file], out, kbps: spec.kbps, stereo: spec.stereo, maxLen: spec.maxLen, sustain: spec.sustain, namedMidi: z.root, detect: z.part.detect });
    let root = z.root; let tune = 0;
    if (r.pitch) {
      if (z.part.detect) { root = Math.round(r.pitch.midi); tune = Math.round((r.pitch.midi - root) * 100); } else {
        const cents = (r.pitch.midi - z.root) * 100;
        // Only sustained, harmonic sounds are re-tuned: struck strings, bars and tines measure sharp
        // (inharmonic partials) though they are in tune.
        if (spec.sustain && r.pitch.conf > 0.9 && Math.abs(cents) <= 35 && z.root < 96) tune = Math.round(cents);
        else if (Math.abs(cents) > 60) log(`  ${spec.id} ${name}: measured ${r.pitch.midi.toFixed(2)} for ${z.root} (conf ${r.pitch.conf.toFixed(2)}) — kept the name`);
      }
    }
    return { li, zone: { file: `${spec.id}/${name}`, root, tune, dur: round(r.dur, 4), loop: r.loop ? r.loop.map((x) => round(x, 5)) : null, source: z.part.src, from: z.path }, rawPeak: r.rawPeak, rms: r.rms };
  });
  // 4. Order layers soft → loud by recorded level, velocity ranges, gain.
  for (const r of results) if (r.zone.root == null || !Number.isFinite(r.zone.root)) { log(`  ${spec.id}: no pitch found for ${r.zone.from} — dropped`); rmSync(join(OUT, ...r.zone.file.split('/')), { force: true }); }
  const byLayer = layers.map((_, li) => results.filter((r) => r.li === li && r.zone.root != null && Number.isFinite(r.zone.root)));
  const level = byLayer.map((rs) => rs.reduce((s, r) => s + r.rawPeak, 0) / Math.max(1, rs.length));
  const order = byLayer.map((_, i) => i).filter((i) => byLayer[i].length).sort((a, b) => level[a] - level[b]);
  const splits = order.length === 1 ? [[0, 1]] : order.length === 2 ? [[0, 0.62], [0.62, 1]] : order.map((_, i) => [i / order.length, (i + 1) / order.length]);
  const loudRms = median(byLayer[order.at(-1)].map((r) => r.rms));
  const gain = round(Math.min(4, Math.max(0.15, 0.2 / Math.max(1e-4, loudRms))) * (spec.level ?? 1), 3);
  return {
    kind: 'tonal', sources: [...new Set(spec.parts.map((p) => p.src))], channels: spec.stereo ? 2 : 1, gain,
    attack: spec.attack ?? 0.003, release: spec.release ?? 0.2, ring: Boolean(spec.ring), loop: Boolean(spec.sustain),
    layers: order.map((li, i) => ({ vel: splits[i], zones: byLayer[li].map((r) => r.zone).sort((a, b) => a.root - b.root) })),
  };
}

// ───────────────────────── drum sets

/** The soft and loud files of one microphone part of a hit. */
function hitFiles(part) {
  if (part.files) return part.files;
  const files = listing(part.src);
  const stemDir = part.stem.slice(0, part.stem.lastIndexOf('/') + 1);
  const base = part.stem.slice(stemDir.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = (part.suffix ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reVel = new RegExp(`^${base}_vl?(\\d+)(?:_rr1)?${suffix}\\.(wav|flac)$`);
  const reRr = new RegExp(`^${base}_rr(\\d+)${suffix}\\.(wav|flac)$`);
  const vels = []; const rrs = [];
  for (const p of files) {
    if (!p.startsWith(stemDir)) continue;
    const name = p.slice(stemDir.length);
    if (name.includes('/')) continue;
    let m = reVel.exec(name); if (m) { vels.push([Number(m[1]), p]); continue; }
    m = reRr.exec(name); if (m) rrs.push([Number(m[1]), p]);
  }
  if (vels.length) {
    vels.sort((a, b) => a[0] - b[0]);
    const max = vels.at(-1)[0];
    const pick = (target) => vels.reduce((best, x) => (Math.abs(x[0] - target) < Math.abs(best[0] - target) ? x : best))[1];
    return [pick(Math.max(1, Math.round(max * 0.45))), pick(max >= 6 ? max - 1 : max)];
  }
  if (rrs.length) { rrs.sort((a, b) => a[0] - b[0]); return [rrs[0][1]]; }
  throw new Error(`no files for ${part.src}:${part.stem}*${part.suffix ?? ''}`);
}

async function buildDrums(spec) {
  const notes = {};
  const jobs = [];
  for (const [note, hit] of Object.entries(spec.notes)) {
    let perPart;
    try { perPart = hit.parts.map((part) => hitFiles(part).map((path) => ({ src: part.src, path }))); } catch (error) { log(`  ${spec.id} ${note}: ${error.message} — left to the synthesizer`); continue; }
    const layerCount = Math.max(...perPart.map((x) => x.length));
    for (let li = 0; li < layerCount; li++) jobs.push({ note, hit, li, layerCount, files: perPart.map((x) => x[Math.min(li, x.length - 1)]) });
  }
  await pool(jobs.flatMap((j) => j.files), 6, async (f) => { f.local = await download(f.src, f.path); });
  // Notes that play the same recording (toms at other pitches, kick 2) share one file.
  const cuts = new Map();
  for (const j of jobs) {
    const key = `${j.files.map((f) => `${f.src}:${f.path}`).join('+')}|${j.hit.len ?? spec.len}`;
    if (!cuts.has(key)) cuts.set(key, { name: `n${j.note}-v${j.li + 1}.ogg`, files: j.files, len: j.hit.len ?? spec.len });
    j.cut = cuts.get(key);
  }
  await pool([...cuts.values()], Math.max(2, Math.min(8, cpus().length - 1)), async (c) => {
    c.r = await cutZone({ files: c.files.map((f) => f.local), out: join(OUT, spec.id, c.name), kbps: spec.kbps, stereo: true, maxLen: spec.len, drum: true, len: c.len });
  });
  const results = jobs.map((j) => ({ ...j, entry: { file: `${spec.id}/${j.cut.name}`, dur: round(j.cut.r.dur, 4), source: j.files[0].src, from: j.files.map((f) => f.path) }, rms: j.cut.r.rms, rawPeak: j.cut.r.rawPeak }));
  for (const [note, hit] of Object.entries(spec.notes)) {
    const rs = results.filter((r) => r.note === note).sort((a, b) => a.li - b.li);
    if (!rs.length) continue;
    // Drum layers keep their recorded level difference (soft hits are quieter), loud = 1.
    const loud = rs.at(-1).rawPeak;
    const splits = rs.length === 1 ? [[0, 1]] : [[0, 0.62], [0.62, 1]];
    notes[note] = { pitch: hit.pitch ?? 0, ...(hit.group ? { group: hit.group } : {}), layers: rs.map((r, i) => ({ vel: splits[i], ...r.entry, level: round(Math.min(1, Math.max(0.45, r.rawPeak / loud)), 3) })) };
  }
  const kickRms = results.filter((r) => r.note === '36' || r.note === '38').map((r) => r.rms);
  const gain = round(Math.min(3, Math.max(0.2, 0.22 / Math.max(1e-4, median(kickRms.length ? kickRms : results.map((r) => r.rms))))) * (spec.level ?? 1), 3);
  return { kind: 'drums', sources: [...new Set(results.map((r) => r.entry.source))], channels: 2, gain, also: spec.also ?? null, notes };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// ───────────────────────── licences, credits, manifest

async function licences() {
  mkdirSync(join(OUT, 'licenses'), { recursive: true });
  for (const [id, src] of Object.entries(SOURCES)) {
    if (!ALLOWED_LICENCES.includes(src.licence)) throw new Error(`${id}: licence ${src.licence} is not allowed`);
    const file = await download(id, src.licenceFile, { text: true });
    const text = readFileSync(file, 'utf8');
    const expect = { 'CC0-1.0': /CC0 1\.0 Universal/, 'CC-BY-3.0': /Attribution 3\.0 Unported/, 'CC-BY-4.0': /Attribution 4\.0 International/ }[src.licence];
    if (expect && !expect.test(text)) throw new Error(`${id}: the LICENSE file does not read as ${src.licence}`);
    if (/NonCommercial|NoDerivatives|ShareAlike|GNU GENERAL PUBLIC/i.test(text)) throw new Error(`${id}: the LICENSE file mentions a restricted licence`);
    writeFileSync(join(OUT, 'licenses', `${id}.txt`), `${src.name}\n${src.url} (commit ${src.commit})\nLicence: ${src.licence}\n\n${text}`);
  }
}

function credits(manifest, instrumentsBySet) {
  const lines = ['# Sound library credits', '', 'MyAudioMaker plays real recorded instruments from these free sample libraries. Each was cut to a subset of notes,',
    'trimmed, level-normalized, looped where notes sustain, resampled to 48 kHz and encoded to Ogg Opus by `scripts/fetch-sounds.mjs`.',
    'The full licence texts are in `licenses/`.', ''];
  for (const [id, src] of Object.entries(SOURCES)) {
    const sets = Object.entries(manifest.sets).filter(([, s]) => s.sources.includes(id)).map(([setId]) => setId);
    if (!sets.length) continue;
    lines.push(`## ${src.name}`, '', `- Author: ${src.author}`, `- Source: ${src.url} (commit \`${src.commit.slice(0, 10)}\`)`, `- Licence: ${src.licence === 'CC0-1.0' ? 'CC0 1.0 Universal (public domain dedication)' : src.licence === 'CC-BY-3.0' ? 'Creative Commons Attribution 3.0 Unported (CC BY 3.0)' : src.licence} — \`licenses/${id}.txt\``);
    if (src.attribution) lines.push(`- Attribution: ${src.attribution}`);
    if (src.note) lines.push(`- Note: ${src.note}`);
    lines.push(`- Used for: ${sets.map((s) => `${s} (${(instrumentsBySet[s] ?? []).join(', ') || 'unused'})`).join('; ')}`, '');
  }
  lines.push('Instruments not listed here (organ, synth leads and basses, pads, choir, 808 and electronic kits, steel and nylon',
    'acoustic guitars, bell and music box) are played by the built-in synthesizer.', '');
  return lines.join('\n');
}

async function main() {
  try { run('ffmpeg', ['-hide_banner', '-encoders']).includes('libopus') || (() => { throw new Error('ffmpeg has no libopus encoder'); })(); } catch (error) { throw new Error(`ffmpeg with libopus is needed: ${error.message}`); }
  log(`Sound library → ${relative(process.cwd(), OUT) || OUT}   (source cache: ${CACHE})`);
  mkdirSync(join(CACHE, 'build'), { recursive: true });
  mkdirSync(OUT, { recursive: true });
  if (LIST) {
    for (const spec of TONAL) for (const part of spec.parts) log(`${spec.id}: ${part.src}:${part.dir} — ${candidatesOf(part).length} candidates`);
    for (const spec of DRUMS) log(`${spec.id}: ${Object.keys(spec.notes).length} notes`);
    return;
  }
  await licences();
  const previous = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : null;
  const sets = {};
  const all = [...TONAL.map((s) => ({ spec: s, build: buildTonal })), ...DRUMS.map((s) => ({ spec: s, build: buildDrums }))];
  for (const { spec, build } of all) {
    const record = join(CACHE, 'build', `${spec.id}.json`);
    const hash = specHash(spec);
    const wanted = !ONLY || ONLY.includes(spec.id);
    if (!FORCE && existsSync(record)) {
      const saved = JSON.parse(readFileSync(record, 'utf8'));
      const files = saved.set.kind === 'drums' ? Object.values(saved.set.notes).flatMap((n) => n.layers) : saved.set.layers.flatMap((l) => l.zones);
      const intact = files.every((z) => existsSync(join(OUT, ...z.file.split('/'))) && hashOf(readFileSync(join(OUT, ...z.file.split('/')))) === z.sha256);
      if ((saved.hash === hash || !wanted) && intact) { sets[spec.id] = saved.set; log(`✓ ${spec.id} (kept)`); continue; }
    }
    if (!wanted) { if (previous?.sets?.[spec.id]) sets[spec.id] = previous.sets[spec.id]; continue; }
    log(`… ${spec.id}`);
    rmSync(join(OUT, spec.id), { recursive: true, force: true });
    const started = Date.now();
    let set;
    try { set = await build(spec); } catch (error) { log(`✗ ${spec.id}: ${error.message}`); if (process.env.MYAUDIOMAKER_SOUNDS_STRICT) throw error; continue; }
    const files = set.kind === 'drums' ? Object.values(set.notes).flatMap((n) => n.layers) : set.layers.flatMap((l) => l.zones);
    for (const z of files) { const buf = readFileSync(join(OUT, ...z.file.split('/'))); z.bytes = buf.length; z.sha256 = hashOf(buf); }
    set.bytes = [...new Map(files.map((z) => [z.file, z.bytes])).values()].reduce((s, b) => s + b, 0);
    writeFileSync(record, JSON.stringify({ hash, set }));
    sets[spec.id] = set;
    log(`✓ ${spec.id}: ${files.length} files, ${(set.bytes / 1e6).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  // Instruments that use each set (for the credits).
  const { INSTRUMENTS } = await import('../src/music/instruments.js');
  const instrumentsBySet = {};
  for (const inst of INSTRUMENTS) for (const s of [].concat(inst.samples ?? [])) (instrumentsBySet[s] ??= []).push(inst.id);
  const totalBytes = Object.values(sets).reduce((s, x) => s + x.bytes, 0);
  const manifest = {
    format: 'myaudiomaker-sounds', version: 1, build: BUILD_VERSION, codec: 'ogg-opus', sampleRate: SR, totalBytes,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([id, s]) => [id, { name: s.name, author: s.author, url: s.url, commit: s.commit, licence: s.licence, licenceFile: `licenses/${id}.txt`, ...(s.attribution ? { attribution: s.attribution } : {}) }])),
    sets,
  };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  writeFileSync(join(OUT, 'CREDITS.md'), credits(manifest, instrumentsBySet));
  // Files no set refers to any more.
  const known = new Set(Object.values(sets).flatMap((s) => (s.kind === 'drums' ? Object.values(s.notes).flatMap((n) => n.layers) : s.layers.flatMap((l) => l.zones)).map((z) => z.file)));
  for (const dir of readdirSync(OUT, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'licenses') continue;
    if (!sets[dir.name]) { rmSync(join(OUT, dir.name), { recursive: true, force: true }); continue; }
    for (const f of readdirSync(join(OUT, dir.name))) if (!known.has(`${dir.name}/${f}`)) rmSync(join(OUT, dir.name, f), { force: true });
  }
  log(`\nSound library: ${Object.keys(sets).length} sets, ${(totalBytes / 1e6).toFixed(1)} MB (downloaded this run: ${(downloadedBytes / 1e6).toFixed(0)} MB)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
