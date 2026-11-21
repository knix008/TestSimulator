// The sing-along strip's lines: every sung syllable belongs to exactly one line, lines follow the
// sections' lyric lines in time order, and the line shown at a beat is the one being sung (or next).
import assert from 'node:assert/strict';
import test from 'node:test';
import { lineAt, singLines } from '../../src/ui/karaoke.js';
import { compose } from '../../src/music/composer.js';

const song = compose({ genre: 'pop', mood: 'happy', language: 'ko', seed: 11, structure: 'standard' });

test('every sung syllable is in exactly one line, lines in time order', () => {
  const lines = singLines(song);
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  const sung = vocal.notes.filter((n) => n.syl);
  assert.ok(lines.length >= 8);
  assert.equal(lines.reduce((n, l) => n + l.notes.length, 0), sung.length);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].start >= lines[i - 1].start, 'time order');
  for (const l of lines) assert.ok(l.text.length > 0 && l.end > l.start);
});

test('the line at a beat: the one being sung, else the next; none after the last', () => {
  const lines = singLines(song);
  const mid = lines[3];
  assert.equal(lineAt(lines, (mid.start + mid.end) / 2), 3);
  assert.equal(lineAt(lines, 0), 0, 'before the first line: the first one, shown early');
  assert.equal(lineAt(lines, lines[lines.length - 1].end + 4), -1);
});

test('a song without a vocal has no lines', () => {
  const instrumental = compose({ genre: 'edm', mood: 'happy', language: 'ko', seed: 2, structure: 'loop', vocal: 'none' });
  assert.deepEqual(singLines(instrumental), []);
});
