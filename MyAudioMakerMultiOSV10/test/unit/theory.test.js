// Music theory: note names, keys, chords, roman numerals, voice leading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chordPcs, chordSymbol, diatonicChord, keyName, midiToFrequency, noteName, parseChordLine, parseChordSymbol, parseKey, parseNote, pitchClass,
  romanToChord, scaleStep, snapToScale, voiceChord, barBeatLabel, timeLabel, transposeChord, prefersFlats,
} from '../../src/music/theory.js';

test('note names and frequencies', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61), 'C#4');
  assert.equal(noteName(61, true), 'Db4');
  assert.equal(parseNote('A4'), 69);
  assert.equal(parseNote('Bb3'), 58);
  assert.equal(parseNote('B#3'), 60);
  assert.equal(parseNote('Cb4'), 59);
  assert.equal(parseNote('nope'), null);
  assert.equal(Math.round(midiToFrequency(69)), 440);
  assert.equal(pitchClass('F#'), 6);
  assert.equal(pitchClass('eb'), 3);
});

test('keys: parsing, names and spelling', () => {
  assert.deepEqual(parseKey('Am'), { tonic: 9, mode: 'minor' });
  assert.deepEqual(parseKey('Eb major'), { tonic: 3, mode: 'major' });
  assert.deepEqual(parseKey('F# dorian'), { tonic: 6, mode: 'dorian' });
  assert.equal(keyName({ tonic: 10, mode: 'major' }), 'Bb major');
  assert.equal(keyName({ tonic: 9, mode: 'minor' }, { short: true }), 'Am');
  assert.equal(prefersFlats(5, 'major'), true);
  assert.equal(prefersFlats(7, 'major'), false);
  assert.equal(prefersFlats(2, 'minor'), true, 'D minor is written with a flat');
});

test('chord symbols parse and print back', () => {
  for (const s of ['C', 'Am', 'F#m7', 'Bbmaj7', 'G7', 'Dsus4', 'Edim', 'Caug', 'Am7b5', 'Cadd9', 'G/B', 'Dm9']) {
    const chord = parseChordSymbol(s);
    assert.ok(chord, s);
    assert.equal(chordSymbol(chord, /b/.test(s)), s.replace('Am7b5', 'Am7b5'));
  }
  assert.deepEqual(chordPcs(parseChordSymbol('Am7')), [9, 0, 4, 7]);
  assert.equal(parseChordSymbol('H7'), null);
  assert.equal(parseChordLine('C G | Am F').length, 4);
});

test('roman numerals in a key', () => {
  const C = { tonic: 0, mode: 'major' };
  const sym = (r, key = C) => chordSymbol(romanToChord(r, key));
  assert.equal(sym('I'), 'C');
  assert.equal(sym('vi'), 'Am');
  assert.equal(sym('V7'), 'G7');
  assert.equal(sym('ii7'), 'Dm7');
  assert.equal(sym('IVmaj7'), 'Fmaj7');
  assert.equal(sym('bVII'), 'A#', 'a borrowed chord (spelled with sharps here)');
  assert.equal(chordSymbol(romanToChord('bVII', C), true), 'Bb');
  assert.equal(sym('V/V'), 'D', 'a secondary dominant');
  const Am = { tonic: 9, mode: 'minor' };
  assert.equal(sym('i', Am), 'Am');
  assert.equal(sym('bVI', Am), 'F');
  assert.equal(sym('iim7b5', Am), 'Bm7b5');
  assert.equal(chordSymbol(diatonicChord(C, 5, true)), 'G7');
  assert.equal(chordSymbol(diatonicChord(C, 7)), 'Bdim');
});

test('scales, steps and voice leading', () => {
  const G = { tonic: 7, mode: 'major' };
  assert.equal(snapToScale(65, G), 66, 'F snaps up to F#');
  assert.equal(scaleStep(67, 2, G), 71, 'G up two steps is B');
  assert.equal(scaleStep(67, -1, G), 66);
  const c = voiceChord(parseChordSymbol('C'), { center: 60 });
  const f = voiceChord(parseChordSymbol('F'), { center: 60, previous: c });
  const move = f.reduce((s, n, i) => s + Math.abs(n - c[i]), 0);
  assert.ok(move <= 4, `C → F moves little (${c} → ${f})`);
  for (const n of f) assert.ok([5, 9, 0].includes(n % 12));
  assert.equal(chordSymbol(transposeChord(parseChordSymbol('Am'), 2)), 'Bm');
});

test('time labels', () => {
  assert.equal(barBeatLabel(0), '1:1');
  assert.equal(barBeatLabel(5.5), '2:2');
  assert.equal(barBeatLabel(4, [3, 4]), '2:2');
  assert.equal(timeLabel(125), '2:05');
});
