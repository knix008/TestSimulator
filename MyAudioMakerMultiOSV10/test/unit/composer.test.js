// The composer: every genre and mood makes a whole, clean song; the sung melody gives each syllable a
// note; repeated choruses repeat; regenerating one section leaves the others; the same seed makes the
// same song.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, fitMelody, lineRhythm, lyricFit, makeSection, writeSection } from '../../src/music/composer.js';
import { GENRES, MOODS, STRUCTURES } from '../../src/music/genres.js';
import { checkSong } from '../../src/music/checks.js';
import { instrument } from '../../src/music/instruments.js';
import { sectionSpans, songBeats, normalizeSong, chordLineText, parseChordLineText } from '../../src/music/song.js';
import { syllabify } from '../../src/music/syllables.js';
import { isChordTone, parseChordSymbol } from '../../src/music/theory.js';
import { rng } from '../../src/music/random.js';
import { buildSample, buildTemplate, SAMPLES, TEMPLATES } from '../../src/music/samples.js';

const serious = (song) => checkSong(song).filter((p) => p.severity !== 'info');

test('every genre × mood composes a clean song', () => {
  for (const g of GENRES) {
    for (const m of MOODS) {
      const song = compose({ genre: g.id, mood: m.id, seed: 11, topic: 'love', language: m.id.length % 2 ? 'en' : 'ko' });
      const label = `${g.id}/${m.id}`;
      assert.ok(song.tracks.length >= 5, `${label}: band`);
      assert.ok(song.tracks.every((t) => t.notes.length || t.role === 'arp' || t.role === 'pad'), `${label}: every track plays`);
      assert.deepEqual(serious(song).map((p) => p.code), [], `${label}: no errors or warnings`);
      const end = songBeats(song);
      for (const t of song.tracks) {
        const [lo, hi] = instrument(t.instrument).range;
        for (const n of t.notes) {
          assert.ok(n.t >= 0 && n.t < end, `${label}: ${t.role} note inside the song`);
          if (!instrument(t.instrument).drums) assert.ok(n.p >= lo && n.p <= hi, `${label}: ${t.role} note in range`);
        }
      }
      assert.ok(song.bpm >= g.bpm[0] - 10 && song.bpm <= g.bpm[1] + 10, `${label}: tempo ${song.bpm}`);
      if (g.timeSignature) assert.deepEqual(song.timeSignature, g.timeSignature);
    }
  }
});

test('every form composes, with lyrics where it sings', () => {
  for (const s of STRUCTURES) {
    const song = compose({ genre: 'pop', mood: 'happy', structure: s.id, seed: 3 });
    assert.equal(song.sections.length, s.sections.length, s.id);
    if (s.id !== 'loop') assert.ok(song.sections.some((x) => x.lyrics.length), `${s.id}: lyrics`);
  }
});

test('the vocal sings one note per syllable, on chord tones on strong beats', () => {
  const song = compose({ genre: 'ballad', mood: 'sad', seed: 5, topic: '비 오는 날', language: 'ko' });
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  for (const section of song.sections) {
    for (const f of lyricFit(song, section)) assert.equal(f.notes, f.syllables, `“${f.line}”: ${f.notes} notes for ${f.syllables} syllables`);
  }
  const syllables = song.sections.flatMap((s) => s.lyrics.flatMap((l) => syllabify(l)));
  assert.equal(vocal.notes.length, syllables.length);
  assert.deepEqual(vocal.notes.map((n) => n.syl), syllables);
  // Strong-beat long notes sit on the chord.
  let strong = 0; let fits = 0;
  for (const { section, start } of sectionSpans(song)) {
    for (const n of vocal.notes) {
      const rel = n.t - start;
      if (rel < 0 || rel >= section.bars * 4 || n.t % 1 || n.d < 1) continue;
      const c = section.chords.find((x) => rel >= x.at && rel < x.at + x.len);
      strong += 1;
      if (isChordTone(n.p, parseChordSymbol(c.symbol))) fits += 1;
    }
  }
  assert.ok(strong >= 6 && fits / strong > 0.9, `${fits}/${strong} long strong-beat notes on the chord`);
});

test('a repeated chorus sings the same words and tune', () => {
  const song = compose({ genre: 'pop', mood: 'happy', seed: 9 });
  const choruses = sectionSpans(song).filter((s) => s.section.type === 'chorus');
  assert.ok(choruses.length >= 2);
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  const tune = ({ start, end }) => vocal.notes.filter((n) => n.t >= start && n.t < end).map((n) => `${n.t - start}:${n.p}:${n.syl}`);
  assert.deepEqual(choruses[1].section.lyrics, choruses[0].section.lyrics);
  assert.deepEqual(tune(choruses[1]), tune(choruses[0]));
});

test('the same seed makes the same song; another seed another one', () => {
  const a = compose({ genre: 'kpop', mood: 'energetic', seed: 77, topic: 'summer' });
  const b = compose({ genre: 'kpop', mood: 'energetic', seed: 77, topic: 'summer' });
  const c = compose({ genre: 'kpop', mood: 'energetic', seed: 78, topic: 'summer' });
  const strip = (s) => JSON.stringify({ ...s, sections: s.sections.map((x) => ({ ...x, id: 0, repeatOf: Boolean(x.repeatOf) })), tracks: s.tracks.map((t) => ({ ...t, id: 0 })), created: 0 });
  assert.equal(strip(a), strip(b));
  assert.notEqual(strip(a), strip(c));
});

test('regenerating one part of one section leaves the rest', () => {
  const song = compose({ genre: 'rock', mood: 'energetic', seed: 2 });
  const spans = sectionSpans(song);
  const target = spans[1];
  const outside = (t) => t.notes.filter((n) => n.t < target.start || n.t >= target.end).map((n) => `${n.t}:${n.p}`).join();
  const before = Object.fromEntries(song.tracks.map((t) => [t.id, outside(t)]));
  const drumsBefore = song.tracks.find((t) => t.role === 'drums').notes.filter((n) => n.t >= target.start && n.t < target.end).length;
  writeSection(song, target.section, ['bass'], 1234);
  for (const t of song.tracks) assert.equal(outside(t), before[t.id], `${t.role} outside unchanged`);
  assert.equal(song.tracks.find((t) => t.role === 'drums').notes.filter((n) => n.t >= target.start && n.t < target.end).length, drumsBefore, 'drums unchanged');
});

test('edited lyrics get a melody that fits them', () => {
  const song = compose({ genre: 'folk', mood: 'calm', seed: 4 });
  const verse = song.sections.find((s) => s.type === 'verse');
  verse.lyrics = ['짧은 줄', '이번 줄은 조금 더 길게 써 봤어요', 'A line in English', '끝'];
  fitMelody(song, verse, 99);
  for (const f of lyricFit(song, verse)) assert.equal(f.notes, f.syllables, f.line);
});

test('line rhythms fill their bars without overlaps', () => {
  const random = rng(1);
  for (const n of [1, 3, 6, 9, 12, 16, 22]) {
    const r = lineRhythm(n, 8, { random, density: 0.6, sync: 0.6 });
    assert.equal(r.length, n);
    for (let i = 0; i < r.length; i++) {
      assert.ok(r[i].at >= 0 && r[i].at + r[i].d <= 8 + 1e-6, `n=${n}: inside the line`);
      if (i) assert.ok(r[i].at >= r[i - 1].at + r[i - 1].d - 1e-6, `n=${n}: no overlap at ${i}`);
    }
  }
});

test('chord lines typed by hand', () => {
  const song = compose({ genre: 'pop', seed: 1 });
  const section = song.sections[1];
  section.chords = parseChordLineText('C G | Am | % | F G', song, section);
  assert.equal(section.chords.length, 2 + 1 + 1 + 2 + 2 + 1 + 1 + 2);
  assert.match(chordLineText(song, section), /^C G \| Am \| Am \| F G/);
  const extra = makeSection(song, 'bridge', 2, 5);
  assert.equal(extra.chords.length, 8);
});

test('samples and templates all build', () => {
  for (const s of SAMPLES) {
    const song = buildSample(s.id);
    assert.ok(song.title, s.id);
    assert.equal(song.language, s.language);
    assert.deepEqual(serious(song).map((p) => p.code), [], s.id);
  }
  for (const [id] of TEMPLATES) {
    const song = buildTemplate(id);
    assert.ok(song.sections.length, id);
    assert.ok(!song.tracks.some((t) => t.role === 'vocal'), `${id}: templates have no vocal`);
  }
});

test('normalizeSong repairs a broken song', () => {
  const s = normalizeSong({ bpm: 9999, key: { tonic: 40, mode: 'nope' }, sections: [{ type: 'x', bars: -3, chords: [{ at: 0, len: 4, symbol: 'Zz' }] }], tracks: [{ role: 'drums', notes: [{ t: -1, p: 300 }] }] });
  assert.equal(s.bpm, 300);
  assert.deepEqual(s.key, { tonic: 11, mode: 'major' });
  assert.equal(s.sections[0].type, 'verse');
  assert.equal(s.sections[0].bars, 1);
  assert.equal(s.tracks[0].instrument, 'kitPop');
  assert.deepEqual(s.tracks[0].notes[0], { t: 0, d: 0.5, p: 127, v: 0.8 });
});
