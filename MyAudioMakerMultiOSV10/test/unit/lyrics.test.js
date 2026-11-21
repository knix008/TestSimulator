// Lyrics: syllables, particles, the built-in writer, rhymes, text in and out, and the AI plan's checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { englishSyllables, hasBatchim, josa, rhymeKey, splitEnglishWord, syllabify, syllableCount, vowelOf, startsWithConsonant } from '../../src/music/syllables.js';
import { fillTopic, parseLyricsText, themeForTopic, topicWord, writeLyrics } from '../../src/music/lyrics.js';
import { BANK, THEMES } from '../../src/music/lyrics-bank.js';
import { cleanPlan, extractJson, lyricsPrompt, planPrompt, PLAN_SCHEMA, providerFor, requestLyrics, requestPlan } from '../../src/music/ai.js';

test('Korean and English syllables', () => {
  assert.deepEqual(syllabify('사랑해, 너를!'), ['사', '랑', '해', '너', '를']);
  assert.equal(syllableCount('I love you more than words can say'), 8);
  assert.deepEqual(splitEnglishWord('morning'), ['mor', 'ning']);
  assert.deepEqual(splitEnglishWord('fire'), ['fire']);
  assert.equal(englishSyllables('beautiful'), 3);
  assert.equal(englishSyllables('the'), 1);
  assert.equal(vowelOf('사'), 'a');
  assert.equal(vowelOf('너'), 'o');
  assert.equal(vowelOf('리'), 'i');
  assert.equal(vowelOf('see'), 'i');
  assert.equal(startsWithConsonant('아'), false);
  assert.equal(startsWithConsonant('라'), true);
});

test('Korean particles follow the final consonant', () => {
  assert.equal(hasBatchim('사랑'), true);
  assert.equal(hasBatchim('바다'), false);
  assert.equal(josa('사랑', '을/를'), '사랑을');
  assert.equal(josa('바다', '을/를'), '바다를');
  assert.equal(josa('서울', '으로/로'), '서울로');
  assert.equal(fillTopic('{t:과/와} 함께', '여름'), '여름과 함께');
  assert.equal(fillTopic('{t:과/와} 함께', '바다'), '바다와 함께');
  assert.equal(fillTopic('{t:(으)로} 떠나는', '바다'), '바다로 떠나는');
});

test('topics point to themes', () => {
  assert.equal(themeForTopic('비 오는 날'), 'rain');
  assert.equal(themeForTopic('비 오는 날의 첫사랑'), 'love', 'the longer word wins');
  assert.equal(themeForTopic('a summer road trip with friends'), 'summer');
  assert.equal(themeForTopic('', 'sad'), 'breakup');
  assert.equal(topicWord('첫사랑을', 'love', 'ko'), '첫사랑');
});

test('every theme has verses, hooks and bridges in both languages, short enough to sing', () => {
  for (const lang of ['ko', 'en']) for (const theme of THEMES) {
    const b = BANK[lang][theme.id];
    assert.ok(b.verse.length >= 8 && b.hook.length >= 6 && b.bridge.length >= 4, `${lang}/${theme.id}`);
    for (const line of [...b.verse, ...b.hook, ...b.bridge]) {
      const n = syllableCount(fillTopic(line, lang === 'ko' ? '사랑' : 'love'));
      assert.ok(n >= 3 && n <= 14, `${lang}/${theme.id}: “${line}” has ${n} syllables`);
    }
  }
});

test('the writer: choruses repeat their hook, verses do not repeat lines, the seed decides', () => {
  const sections = [{ id: 'v1', type: 'verse', lines: 4 }, { id: 'c1', type: 'chorus', lines: 4 }, { id: 'v2', type: 'verse', lines: 4 }, { id: 'c2', type: 'chorus', lines: 4, repeatOf: 'c1' }, { id: 'b', type: 'bridge', lines: 4 }];
  const a = writeLyrics({ topic: '여름 바다', mood: 'happy', language: 'ko', seed: 5, sections });
  assert.equal(a.theme, 'summer');
  assert.deepEqual(a.sections.c2, a.sections.c1);
  assert.equal(a.sections.c1[0], a.sections.c1[3], 'the hook comes back');
  const verses = [...a.sections.v1, ...a.sections.v2];
  assert.equal(new Set(verses).size, verses.length, 'no repeated verse lines');
  assert.ok(a.title);
  assert.deepEqual(writeLyrics({ topic: '여름 바다', mood: 'happy', language: 'ko', seed: 5, sections }), a);
  const en = writeLyrics({ topic: 'rain', mood: 'sad', language: 'en', seed: 5, sections });
  assert.ok(en.sections.v1.every((l) => /^[\x20-\x7e]+$/.test(l)), 'English lyrics');
});

test('rhyme keys', () => {
  assert.equal(rhymeKey('in the night'), rhymeKey('a shining light'));
  assert.notEqual(rhymeKey('in the night'), rhymeKey('by the sea'));
  assert.equal(rhymeKey('너를 사랑'), rhymeKey('바람 따라 방랑'));
});

test('lyrics text with and without section headers', () => {
  const sections = [{ id: 'a', type: 'verse', lyrics: ['x', 'y'] }, { id: 'b', type: 'chorus', lyrics: ['z'] }];
  const labels = (s) => ({ verse: 'Verse', chorus: 'Chorus' })[s.type];
  assert.deepEqual(parseLyricsText('[Chorus]\nhello\n[Verse]\none\ntwo', sections, labels), { b: ['hello'], a: ['one', 'two'] });
  assert.deepEqual(parseLyricsText('1\n2\n3\n4', sections, labels), { a: ['1', '2'], b: ['3', '4'] });
});

test('AI prompts and plans are checked', () => {
  const prompt = planPrompt({ topic: '첫사랑', genre: 'ballad', mood: 'sad', language: 'ko', structure: 'short' });
  assert.match(prompt, /Ballad/);
  assert.match(prompt, /Korean/);
  assert.match(prompt, /verse \(8 bars, 4 lines\)/);
  assert.match(lyricsPrompt({ language: 'en', genre: 'pop', mood: 'happy' }, [{ type: 'verse', bars: 8, lines: 4, chords: ['C', 'G'] }]), /1\. verse: 8 bars, 4 lines/);
  assert.equal(PLAN_SCHEMA.additionalProperties, false);
  const plan = cleanPlan({ title: 'T', sections: [{ type: 'chorus', bars: 99, lines: [' a  b ', ''], chords: ['Am F', 'Xyz', 'G'] }, { type: 'weird', bars: 4, lines: [], chords: [] }] });
  assert.deepEqual(plan.sections[0], { type: 'chorus', bars: 32, lines: ['a b'], chords: ['Am F', 'G'] });
  assert.equal(plan.sections[1].type, 'verse');
  assert.deepEqual(extractJson('Here you go:\n```json\n{"title":"x","sections":[]}\n```'), { title: 'x', sections: [] });
  assert.throws(() => extractJson('no json'));
});

test('providers: the built-in one answers offline; Claude without a key falls back to it', async () => {
  assert.equal(providerFor({ aiProvider: 'claude', aiApiKey: '' }), 'builtin');
  assert.equal(providerFor({ aiProvider: 'claude', aiApiKey: 'k' }), 'claude');
  assert.equal(providerFor({ aiProvider: 'ollama' }), 'ollama');
  const plan = await requestPlan({ topic: 'night city', genre: 'citypop', mood: 'nostalgic', language: 'en', structure: 'short', seed: 3 }, { aiProvider: 'builtin' });
  assert.equal(plan.sections.length, 6);
  assert.ok(plan.sections.find((s) => s.type === 'verse').lines.length === 4);
  const lyr = await requestLyrics({ topic: '친구', mood: 'happy', language: 'ko', seed: 1 }, [{ id: 'a', type: 'verse', lines: 4 }], { aiProvider: 'builtin' });
  assert.equal(lyr.lines[0].length, 4);
});
