// Staff notation: rhythm splitting into writable values (rests, dots, ties at beats and bars), beat groups,
// accidentals that hold through a bar, syllables on the first note of a tie, spacing that leaves room for
// every syllable, and the Lyrics view's per-section staff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { barEvents, beatGroup, engraveBars, quantize, splitValues, staffSvg, leadSheetPages, textWidth } from '../../src/music/notation.js';
import { compose } from '../../src/music/composer.js';
import { normalizeSong } from '../../src/music/song.js';

const sum = (list) => list.reduce((n, x) => n + x.v, 0);

test('beat groups: quarters in x/4, dotted quarters in compound metres', () => {
  assert.equal(beatGroup([4, 4]), 1);
  assert.equal(beatGroup([3, 4]), 1);
  assert.equal(beatGroup([6, 8]), 1.5);
  assert.equal(beatGroup([12, 8]), 1.5);
});

test('values never hide a beat: a note across beat 2–3 in 4/4 is tied, whole bars stay whole', () => {
  assert.deepEqual(splitValues(0, 4, 0, 4, 1).map((x) => x.v), [4]);
  assert.deepEqual(splitValues(0, 3, 0, 4, 1).map((x) => x.v), [3]);
  assert.deepEqual(splitValues(1, 3, 0, 4, 1).map((x) => x.v), [1, 1], 'a half note on beat 2 is written as two tied quarters');
  assert.deepEqual(splitValues(0.5, 1.5, 0, 4, 1).map((x) => x.v), [0.5, 0.5], 'syncopated quarter → tied eighths across the beat');
  assert.deepEqual(splitValues(0, 1.5, 0, 4, 1).map((x) => x.v), [1.5], 'dotted quarter on the beat');
  assert.deepEqual(splitValues(0, 0.75, 0, 4, 1).map((x) => x.v), [0.75], 'dotted eighth');
  assert.deepEqual(splitValues(0, 3, 0, 3, 1.5).map((x) => x.v), [3], 'dotted half fills a 6/8 bar');
});

test('a bar is notes and rests that add up to the bar; notes past the bar line tie over', () => {
  const q = quantize([{ t: 0.5, d: 1, p: 60, syl: '사' }, { t: 3, d: 2, p: 62, syl: '랑' }]);
  const bar1 = barEvents(q, 0, 4, 1);
  assert.equal(sum(bar1), 4);
  assert.deepEqual(bar1.map((e) => e.kind), ['rest', 'note', 'note', 'rest', 'rest', 'note']);
  assert.equal(bar1[1].syl, '사');
  assert.equal(bar1[1].tieNext, true);
  assert.equal(bar1[2].syl, '', 'the tied continuation carries no syllable');
  assert.equal(bar1[5].tieNext, true, 'tied into the next bar');
  const bar2 = barEvents(q, 4, 4, 1);
  assert.equal(sum(bar2), 4);
  assert.equal(bar2[0].kind, 'note');
  assert.equal(bar2[0].tieFrom, true);
  assert.equal(bar2[0].syl, '');
  const empty = barEvents(q, 8, 4, 1);
  assert.deepEqual(empty.map((e) => [e.kind, e.whole]), [['rest', true]], 'an empty bar is one whole-bar rest');
});

test('quantizing removes overlaps and keeps one note per onset', () => {
  const q = quantize([{ t: 0, d: 1.2, p: 60 }, { t: 1, d: 1, p: 64 }, { t: 1.01, d: 1, p: 67 }]);
  assert.deepEqual(q.map((n) => [n.s, n.e, n.p]), [[0, 1, 60], [1, 2, 64]]);
});

test('accidentals hold through the bar and are not repeated', () => {
  const song = normalizeSong({ key: { tonic: 0, mode: 'major' }, sections: [{ type: 'verse', bars: 1 }], tracks: [{ role: 'vocal', notes: [{ t: 0, d: 1, p: 61 }, { t: 1, d: 1, p: 61 }, { t: 2, d: 1, p: 60 }, { t: 3, d: 1, p: 61 }] }] });
  const marks = engraveBars(song).bars[0].events.map((e) => e.accidental);
  assert.deepEqual(marks, ['♯', '', '♮', '♯']);
});

test('spacing leaves room for every syllable (no overlapping lyrics on a busy line)', () => {
  const song = compose({ genre: 'kpop', mood: 'happy', language: 'ko', seed: 7, structure: 'standard' });
  const pages = leadSheetPages(song, { ctx: { t: (k) => k, labels: (s) => s.type } });
  const svg = pages.join('');
  const lines = [...svg.matchAll(/<g class="sheet-line"[\s\S]*?(?=<g class="sheet-line"|$)/g)].map((m) => m[0]);
  assert.ok(lines.length > 4);
  for (const line of lines) {
    const ly = [...line.matchAll(/<text class="ly" x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ x: Number(m[1]), size: Number(m[2]), text: m[3] }));
    for (let i = 1; i < ly.length; i++) {
      const prevRight = ly[i - 1].x + textWidth(ly[i - 1].text, ly[i - 1].size) / 2;
      const left = ly[i].x - textWidth(ly[i].text, ly[i].size) / 2;
      assert.ok(left >= prevRight - 0.4, `"${ly[i - 1].text}" and "${ly[i].text}" do not overlap (${prevRight.toFixed(1)} → ${left.toFixed(1)})`);
    }
  }
  assert.match(svg, /<rect [^>]*fill="#111"/, 'beams or rests are drawn');
});

test('the Lyrics view staff: one svg per section in the text colour, every note marked with its time', () => {
  const song = compose({ genre: 'ballad', mood: 'sad', language: 'ko', seed: 3, structure: 'standard' });
  const verse = song.sections.find((s) => s.type === 'verse');
  const svg = staffSvg(song, verse, { widthPx: 600 });
  assert.match(svg, /^<svg class="staff-svg"/);
  assert.match(svg, /stroke="currentColor"/);
  assert.ok((svg.match(/class="nt"/g) ?? []).length > 4);
  assert.ok((svg.match(/class="ly"/g) ?? []).length > 4, 'syllables under the notes');
});
