// AI voice: Korean sound changes between sung syllables (ported from OpenUtau's KoreanPhonemizerUtil)
// and English word grouping / letter-to-sound rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, separate, variateEnd, variateSyllable, variateSyllables } from '../../src/audio/singer/korean.js';
import { groupWords, letterToSound } from '../../src/audio/singer/english.js';

const sung = (text, linked) => variateSyllables([...text], linked).join('');

test('jamo split and merge', () => {
  assert.deepEqual(separate('냥'), ['ㄴ', 'ㅑ', 'ㅇ']);
  assert.deepEqual(separate('가'), ['ㄱ', 'ㅏ', ' ']);
  assert.equal(merge(['ㄷ', 'ㅏ', 'ㄺ']), '닭');
  assert.equal(merge([' ', 'ㅏ', ' ']), '아');
  for (const ch of '가각힣뷁읽') assert.equal(merge(separate(ch)), ch);
});

test('연음 (a final consonant moves to the next vowel)', () => {
  assert.equal(sung('그대만을'), '그대마늘');
  assert.equal(sung('옷이'), '오시');
  assert.equal(sung('닭이'), '달기', 'ㄺ splits');
  assert.equal(sung('값이'), '갑씨', 'ㅄ splits (and ㅅ after ㅂ is tense)');
  assert.equal(sung('좋아'), '조아', 'ㅎ drops before a vowel');
  assert.equal(sung('강아지'), '강아지', 'ㅇ stays');
});

test('격음화 · 된소리 · 비음화 · 유음화', () => {
  assert.equal(sung('착하다'), '차카다');
  assert.equal(sung('많다'), '만타');
  assert.equal(sung('닭장'), '닥짱');
  assert.equal(sung('밥먹자'), '밤먹짜');
  assert.equal(sung('국물'), '궁물');
  assert.equal(sung('만리'), '말리');
  assert.equal(sung('칼날'), '칼랄');
  assert.equal(sung('담력'), '담녁', 'ㅁ + ㄹ → ㄴ');
  assert.equal(sung('막론'), '망논', 'ㄱ + ㄹ → ㅇ + ㄴ');
});

test('ㅎ after a final weakens (as OpenUtau), after a vowel it stays', () => {
  assert.equal(sung('사랑해요'), '사랑애요');
  assert.equal(sung('함께해요'), '함께해요');
  assert.equal(sung('도함'), '도함');
});

test('phrase ends, rests and other letters', () => {
  assert.equal(variateSyllable(null, '삵', null), '삭');
  assert.equal(merge(variateEnd(separate('있'))), '읻');
  assert.equal(variateSyllable('사', '랑', null), '랑');
  // A rest between the syllables: no sound change across it.
  assert.equal(sung('만을', [false]), '만을');
  assert.deepEqual(variateSyllables(['만', 'la', '을']), ['만', 'la', '을']);
});

test('English syllables become words again; unknown words are spelled out', () => {
  const words = new Set(['morning', 'love', 'you', 'today', 'beautiful']);
  const isWord = (w) => words.has(w);
  assert.deepEqual(groupWords(['I', 'love', 'you'], isWord), [[0], [1], [2]]);
  assert.deepEqual(groupWords(['good', 'mor', 'ning'], isWord), [[0], [1, 2]]);
  assert.deepEqual(groupWords(['mor', 'ning'], isWord, [false]), [[0], [1]], 'a rest splits a word');
  assert.deepEqual(groupWords(['사', '랑'], isWord), [[0], [1]]);
  assert.deepEqual(letterToSound('cat'), ['k', 'ae', 't']);
  assert.deepEqual(letterToSound('time'), ['t', 'ay', 'm']);
  assert.deepEqual(letterToSound('night'), ['n', 'ay', 't']);
  assert.deepEqual(letterToSound('ship'), ['sh', 'ih', 'p']);
  assert.ok(letterToSound('zorblax').length >= 5);
});
