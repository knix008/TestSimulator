// Spelling: the word lists, Korean particles and endings, English forms, corrections, and every
// built-in site (templates, samples, block starting text) free of spelling problems.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpellChecker, decodeWordList, encodeWordList, normalizeWord, validUserWord, words } from '../../src/domain/spell.js';
import { SPELL_EXTRA } from '../../src/domain/spell-extra.js';
import { DICT_INFO } from '../../src/domain/dict-info.js';
import { spellingProblems } from '../../src/domain/problems.js';
import { TEMPLATES, buildTemplate } from '../../src/domain/templates.js';
import { SAMPLES, buildSample } from '../../src/domain/samples.js';
import { BLOCK_TYPES, blockDef } from '../../src/domain/blocks.js';
import { createBlock, createSite } from '../../src/domain/site.js';
import { normalizeSettings, normalizeUserWords, resetForNewInstall, STORAGE_KEY } from '../../src/domain/settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (id) => decodeWordList(fs.readFileSync(path.join(root, 'public', 'dict', `${id}.txt`), 'utf8'));
const en = read('en');
const ko = read('ko');
const checker = new SpellChecker({ en, ko, extra: SPELL_EXTRA });

test('word lists: front coding round trip, sizes, licences', () => {
  const list = ['a', 'ab', 'abc', 'abd', 'b', '가', '가나', '가나다'];
  assert.deepEqual(decodeWordList(encodeWordList(list)), list);
  assert.deepEqual(decodeWordList(encodeWordList(['web', 'website']).replace(/\n/g, '\r\n')), ['web', 'website']);
  assert.equal(en.length, DICT_INFO.en);
  assert.equal(ko.length, DICT_INFO.ko);
  assert.ok(en.length > 200_000 && ko.length > 90_000);
  assert.deepEqual([...en.slice(0, 1000)].sort(), en.slice(0, 1000), 'sorted');
  assert.ok(fs.readFileSync(path.join(root, 'public', 'dict', 'LICENSES.txt'), 'utf8').includes('Mozilla Public'));
});

test('words of a text: addresses, e-mail, code, numbers and hashtags are not words', () => {
  const found = words('Visit https://example.com/a-b or mail me@test.co.kr, see `codeword` and [link](page.html) #hashtag 3D 24h v2 about.html MyHomeMaker로 정말요').map((w) => w.word);
  assert.deepEqual(found, ['Visit', 'or', 'mail', 'see', 'and', 'link', 'MyHomeMaker', '정말요']);
  const [w] = words('  hello');
  assert.deepEqual([w.start, w.end], [2, 7]);
});

for (const [label, list] of [
  ['Korean nouns with particles', ['홈페이지를', '홈페이지에서', '사이트에는', '고객님께', '서울에서부터', '회사와', '우리의', '꽃들이', '디자인으로', '이메일로', '저희는']],
  ['Korean compound nouns', ['홈페이지제작', '고객상담']],
  ['Korean verbs: polite and formal endings', ['만듭니다', '만들어요', '만들었습니다', '만들고', '만들면', '만들기', '드립니다', '드려요', '하세요', '하십시오', '했어요', '해요', '합니다', '됩니다', '돼요', '봐요', '써요', '마셔요']],
  ['Korean irregular verbs and adjectives', ['새로운', '고마워요', '도와드립니다', '불러요', '몰라요', '들어보세요', '그래요', '빨간', '바빠요', '예뻐요', '즐거운', '아름다운', '가까운', '따뜻한', '쉽게']],
  ['Korean noun + 하다 / 되다', ['제작합니다', '예약하세요', '안내해', '소개합니다', '문의하세요', '준비했습니다', '팔로우하세요']],
  ['English words and inflections', ['website', 'websites', 'running', 'happily', 'Booking', 'BEST', 'café', 'Monday', 'December']],
  ['English contractions and possessives', ["don't", "isn't", "we're", "you'll", "it's", "team's", "can't", "won't", 'o’clock']],
  ['names, acronyms and the program’s words', ['MyHomeMaker', 'YouTube', 'iPhone', 'FAQ', 'SNS', 'HTML', 'Instagram', '인스타그램', '유튜브', '아메리카노']],
]) {
  test(`known: ${label}`, () => {
    const unknown = list.filter((w) => !checker.check(w));
    assert.deepEqual(unknown, []);
  });
}

test('unknown: misspelt words in both languages', () => {
  const typos = ['홈패이지', '웹사이트들릏', '만듭미다', 'websiet', 'recieve', 'adress', 'teh', 'minuts', 'Bussiness'];
  assert.deepEqual(typos.filter((w) => checker.check(w)), []);
});

test('corrections put the right word first', () => {
  for (const [typo, right] of [['websiet', 'website'], ['recieve', 'receive'], ['adress', 'address'], ['Bussiness', 'Business'], ['홈패이지', '홈페이지'], ['홈패이지를', '홈페이지를'], ['웹사이드', '웹사이트']]) {
    assert.equal(checker.suggest(typo)[0], right, typo);
  }
});

test('the user’s words: added, normalized, counted as nouns (with particles)', () => {
  const c = new SpellChecker({ en, ko, extra: SPELL_EXTRA });
  assert.equal(c.check('Seoulful'), false);
  assert.equal(c.check('마이홈'), false);
  c.setUserWords(['seoulful', '마이홈']);
  assert.ok(c.check('Seoulful') && c.check('SEOULFUL') && c.check('마이홈') && c.check('마이홈에서') && c.check('마이홈입니다'));
  assert.equal(normalizeWord(' Seoul’s '), "seoul's");
  assert.ok(validUserWord('마이홈') && validUserWord("rock'n'roll") && validUserWord('e-mail'));
  assert.ok(!validUserWord('no good') && !validUserWord('abc1') && !validUserWord('') && !validUserWord('a'.repeat(41)));
  assert.deepEqual(normalizeUserWords(['Zebra', 'zebra', '가나', 'bad word', 3, null, 'Apple']), ['가나', 'apple', 'zebra']);
  assert.deepEqual(normalizeSettings({ userWords: 'x' }).userWords, []);
});

test('the user’s dictionary survives a new installation', () => {
  const store = new Map([[STORAGE_KEY, JSON.stringify({ theme: 'dark', userWords: ['seoulful'] })]]);
  const storage = { get length() { return store.size; }, key: (i) => [...store.keys()][i], getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  assert.ok(resetForNewInstall(storage, 'token-1'));
  const kept = JSON.parse(store.get(STORAGE_KEY));
  assert.deepEqual(kept.userWords, ['seoulful']);
  assert.equal(kept.theme, undefined);
});

test('checking is quick: a whole sample site in well under a second', () => {
  const site = buildSample('law', 'ko');
  const fresh = new SpellChecker({ en, ko, extra: SPELL_EXTRA });
  const started = performance.now();
  spellingProblems(site, fresh);
  assert.ok(performance.now() - started < 1000);
});

// Every built-in site is free of spelling problems (one test each, in both languages).
const clean = (site) => spellingProblems(site, checker).map((p) => `${p.word} (${p.path})`);
for (const L of ['ko', 'en']) {
  for (const [id] of TEMPLATES) test(`no spelling problems: template ${id} [${L}]`, () => assert.deepEqual(clean(buildTemplate(id, L)), []));
  for (const s of SAMPLES) test(`no spelling problems: sample ${s.id} [${L}]`, () => assert.deepEqual(clean(buildSample(s.id, L)), []));
  test(`no spelling problems: every block's starting text [${L}]`, () => {
    const site = createSite({ L });
    site.pages[0].blocks = BLOCK_TYPES.filter((type) => !blockDef(type).global).map((type) => createBlock(type, { L }));
    assert.deepEqual(clean(site), []);
  });
}
