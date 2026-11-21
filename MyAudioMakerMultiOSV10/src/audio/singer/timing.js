// Time for the AI singer (CONTRACT: pure): song beats → milliseconds (tempo and swing exactly as the
// player plays them), notes → phrases split at rests, and DiffSinger's frame arithmetic.
//
// The frame helpers are ported from OpenUtau (MIT License, Copyright (c) 2021 stakira and
// contributors), OpenUtau.Core/DiffSinger/DiffSingerUtils.cs and DiffSingerBasePhonemizer.cs.

export const HEAD_FRAMES = 8;
export const TAIL_FRAMES = 8;

/** Swing exactly as audio/engine.js swingBeat: off-beat eighths (and sixteenths) are played late. */
export function swingBeat(t, swing) {
  if (!swing) return t;
  const frac = t - Math.floor(t);
  if (Math.abs(frac - 0.5) < 1e-3) return t + swing * 0.5;
  if (Math.abs(frac - 0.25) < 1e-3 || Math.abs(frac - 0.75) < 1e-3) return t + swing * 0.25;
  return t;
}

/** A note's start and end in ms from beat 0: the player starts it at swingBeat(t) and holds it d beats. */
export function noteMs(note, bpm, swing) {
  const spbMs = 60000 / bpm;
  const start = swingBeat(note.t, swing) * spbMs;
  return { startMs: start, endMs: start + note.d * spbMs };
}

/** 1000 · hop / rate (11.61 ms for 44.1 kHz, hop 512). */
export const frameMsOf = (config) => (1000 * (config?.hop_size ?? 512)) / (config?.sample_rate ?? 44100);

/** C# Math.Round(x, MidpointRounding.ToEven). */
export function roundHalfEven(x) {
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

/**
 * Durations in ms → frames with cumulative rounding (round(cumsum / frame + 0.5), banker's rounding),
 * so the frames add up the way the training data did.
 */
export function durationsMsToFrames(durationsMs, frameMs) {
  const out = [];
  let acc = 0;
  let previous = 0;
  for (const ms of durationsMs) {
    if (ms < 0) throw new RangeError(`Negative DiffSinger duration: ${ms} ms`);
    acc += ms;
    const frame = roundHalfEven(acc / frameMs + 0.5);
    out.push(frame - previous);
    previous = frame;
  }
  return out;
}

/** Makes durations add up to `total` frames (the last ones give or take). */
export function fitDurationSum(durations, total) {
  if (!durations.length) return durations;
  const out = durations.slice();
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  if (out[out.length - 1] < 0) {
    let deficit = -out[out.length - 1];
    out[out.length - 1] = 0;
    for (let i = out.length - 2; i >= 0 && deficit > 0; i--) { const take = Math.min(out[i], deficit); out[i] -= take; deficit -= take; }
    if (deficit > 0) throw new RangeError(`Cannot fit DiffSinger durations to ${total} frames`);
  }
  return out;
}

/** Phones with SP padding: [{ phoneme, ms, index }] (index -1 for padding and gaps). */
export function paddedSegments(phones, frameMs, head = HEAD_FRAMES, tail = TAIL_FRAMES) {
  const out = [{ phoneme: 'SP', ms: head * frameMs, index: -1 }];
  phones.forEach((ph, i) => {
    if (i > 0) {
      const gap = ph.positionMs - (phones[i - 1].positionMs + phones[i - 1].durationMs);
      if (gap > 0) out.push({ phoneme: 'SP', ms: gap, index: -1 });
    }
    out.push({ phoneme: ph.phoneme, ms: ph.durationMs, index: i });
  });
  out.push({ phoneme: 'SP', ms: tail * frameMs, index: -1 });
  return out;
}

/** word_div / word_dur over padded segments (a word = a vowel and the consonants after it). */
export function wordDivAndDur(segments, phDur, isVowel) {
  if (phDur.length !== segments.length) throw new RangeError('word mode: duration count does not match the tokens');
  let vowels = segments.map((s, i) => (s.index >= 0 && isVowel(s.phoneme) ? i : -1)).filter((i) => i >= 0);
  if (!vowels.length) vowels = [segments.length - 2];
  const tailIndex = segments.length - 1;
  const wordDiv = [vowels[0]];
  for (let k = 1; k < vowels.length; k++) wordDiv.push(vowels[k] - vowels[k - 1]);
  wordDiv.push(tailIndex - vowels[vowels.length - 1], 1);
  if (wordDiv.some((d) => d <= 0)) throw new RangeError('word mode: empty word division');
  const wordDur = [];
  let offset = 0;
  for (const n of wordDiv) { let sum = 0; for (let j = 0; j < n; j++) sum += phDur[offset + j]; wordDur.push(sum); offset += n; }
  return { wordDiv, wordDur };
}

/** OpenUtau's stretch: start positions (ms) of `source` frames scaled by `ratio`, ending at `endMs`. */
export function stretch(source, ratio, endMs) {
  const total = source.reduce((a, b) => a + b, 0);
  let at = endMs - total * ratio;
  const out = [];
  for (const d of source) { out.push(at); at += d * ratio; }
  return out;
}

/**
 * The vocal notes as connected phrases: [{ notes: [{ startMs, endMs, midi, syl, vel, index }] }].
 * A phrase ends at a rest of `splitMs` or more, and grows to at most `maxMs` (then it is cut at its
 * longest inner rest, or between notes). Overlapping notes are shortened (one voice sings).
 */
export function splitPhrases(notes, { bpm, swing = 0, splitMs = 500, maxMs = 16000 } = {}) {
  const timed = notes
    .map((n, index) => ({ ...noteMs(n, bpm, swing), midi: Number.isFinite(n.p) ? n.p : 60, syl: n.syl ?? '', vel: n.v ?? 0.8, index }))
    .filter((n) => n.endMs > n.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  for (let i = 0; i + 1 < timed.length; i++) if (timed[i].endMs > timed[i + 1].startMs) timed[i].endMs = Math.max(timed[i].startMs + 1, timed[i + 1].startMs);
  const runs = [];
  let run = [];
  for (const n of timed) {
    if (run.length && n.startMs - run[run.length - 1].endMs >= splitMs) { runs.push(run); run = []; }
    run.push(n);
  }
  if (run.length) runs.push(run);
  const out = [];
  const cut = (list) => {
    if (list.length < 2 || list[list.length - 1].endMs - list[0].startMs <= maxMs) { out.push({ notes: list }); return; }
    // The longest rest inside the window; else the note boundary nearest the middle.
    let best = -1; let bestGap = -1;
    for (let i = 0; i + 1 < list.length; i++) {
      if (list[i + 1].endMs - list[0].startMs > maxMs && best >= 0) break;
      const gap = list[i + 1].startMs - list[i].endMs;
      if (gap > bestGap) { bestGap = gap; best = i; }
    }
    if (bestGap < 60) {
      const mid = list[0].startMs + maxMs * 0.75;
      best = Math.max(0, list.findIndex((n) => n.endMs >= mid));
    }
    cut(list.slice(0, best + 1));
    cut(list.slice(best + 1));
  };
  runs.forEach(cut);
  return out;
}
