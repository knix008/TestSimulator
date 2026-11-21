// AI voice: beats → ms (tempo and swing as the player), phrases, DiffSinger's frame arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationsMsToFrames, fitDurationSum, frameMsOf, noteMs, paddedSegments, roundHalfEven, splitPhrases, stretch, swingBeat, wordDivAndDur } from '../../src/audio/singer/timing.js';
import { swingBeat as engineSwing } from '../../src/audio/engine.js';

test('swing is the same as the player\'s', () => {
  for (const swing of [0, 0.1, 0.33, 0.5]) for (let t = 0; t < 4; t += 0.125) assert.equal(swingBeat(t, swing), engineSwing(t, swing), `t=${t} swing=${swing}`);
  // A note starts at its swung beat and lasts d beats.
  assert.deepEqual(noteMs({ t: 1.5, d: 0.5 }, 120, 0.2), { startMs: (1.5 + 0.1) * 500, endMs: (1.5 + 0.1) * 500 + 250 });
  assert.deepEqual(noteMs({ t: 2, d: 1 }, 60, 0.5), { startMs: 2000, endMs: 3000 });
});

test('ms → frames: cumulative rounding, banker\'s rounding at .5', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(-2.5), -2);
  assert.equal(roundHalfEven(2.4), 2);
  assert.deepEqual(durationsMsToFrames([20], 10), [2], '2.0 + 0.5 = 2.5 → 2');
  assert.deepEqual(durationsMsToFrames([30], 10), [4], '3.5 → 4');
  assert.deepEqual(durationsMsToFrames([20, 10], 10), [2, 2]);
  const f = frameMsOf({ hop_size: 512, sample_rate: 44100 });
  assert.ok(Math.abs(f - 11.609977) < 1e-5);
  const ms = [92.88, 100, 100, 100, 37.5, 250, 92.88];
  const frames = durationsMsToFrames(ms, f);
  // 92.88 ms = 8.00002 frames → round(8.50002) = 9; then 192.88 → round(17.11) = 17 → 8 more, …
  assert.deepEqual(frames, [9, 8, 9, 8, 4, 21, 8]);
  // The frames add up to the rounded total, not to the sum of rounded parts.
  assert.equal(frames.reduce((a, b) => a + b, 0), roundHalfEven(ms.reduce((a, b) => a + b, 0) / f + 0.5));
  assert.throws(() => durationsMsToFrames([-1], f), RangeError);
});

test('fitting durations, padded segments, word division', () => {
  assert.deepEqual(fitDurationSum([3, 4, 5], 14), [3, 4, 7]);
  assert.deepEqual(fitDurationSum([3, 4, 5], 6), [3, 3, 0]);
  assert.throws(() => fitDurationSum([1, 1], -1), RangeError);
  const phones = [{ phoneme: 's', positionMs: 0, durationMs: 50 }, { phoneme: 'a', positionMs: 50, durationMs: 400 }, { phoneme: 'n', positionMs: 500, durationMs: 100 }];
  const seg = paddedSegments(phones, 10);
  assert.deepEqual(seg.map((s) => s.phoneme), ['SP', 's', 'a', 'SP', 'n', 'SP'], 'head, gap and tail are SP');
  assert.equal(seg[0].ms, 80);
  assert.equal(seg[3].ms, 50);
  const phDur = durationsMsToFrames(seg.map((s) => s.ms), 10);
  const { wordDiv, wordDur } = wordDivAndDur(seg, phDur, (p) => p === 'a');
  assert.equal(wordDiv.reduce((a, b) => a + b, 0), seg.length);
  assert.equal(wordDur.reduce((a, b) => a + b, 0), phDur.reduce((a, b) => a + b, 0));
  assert.deepEqual(wordDiv, [2, 3, 1]);
  assert.deepEqual(stretch([2, 3], 10, 100), [50, 70]);
});

test('phrases split at rests; overlapping notes are shortened; long phrases are cut', () => {
  const notes = [
    { t: 0, d: 1, p: 60, syl: '사' }, { t: 1, d: 1.5, p: 62, syl: '랑' }, // overlaps the next note
    { t: 2, d: 1, p: 64, syl: '해' }, { t: 4, d: 1, p: 65, syl: '요' }, // 1 beat rest = 500 ms at 120 BPM → new phrase
  ];
  const phrases = splitPhrases(notes, { bpm: 120 });
  assert.equal(phrases.length, 2);
  assert.deepEqual(phrases[0].notes.map((n) => n.syl), ['사', '랑', '해']);
  assert.equal(phrases[0].notes[1].endMs, 1000, 'the overlapping note ends where the next starts');
  assert.equal(phrases[1].notes[0].startMs, 2000);
  const long = Array.from({ length: 60 }, (_, i) => ({ t: i, d: i % 10 === 9 ? 0.6 : 1, p: 60, syl: '라' }));
  const cut = splitPhrases(long, { bpm: 60, maxMs: 16000 });
  assert.ok(cut.length >= 4);
  for (const ph of cut) assert.ok(ph.notes[ph.notes.length - 1].endMs - ph.notes[0].startMs <= 16000);
  assert.equal(cut.reduce((a, ph) => a + ph.notes.length, 0), 60);
  // Cut at the inner rests (after every tenth note).
  assert.ok(cut.every((ph) => ph.notes[ph.notes.length - 1].index % 10 === 9 || ph === cut[cut.length - 1]));
});
