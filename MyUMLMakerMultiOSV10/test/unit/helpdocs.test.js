// Help documents and the tutorial video window (src/domain/helpdocs.js): document
// addresses, the chapter list from the page headings, find in page, the video's
// chapter sidecar and time labels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  chapterEntries, currentChapter, DOC_KINDS, docFile, docLabel, docUrl, docWindowTitle, entryAt, findOffsets, formatTime, headingText,
  isDocKind, markOffsets, parseVideoChapters, stepMatch, VIDEO_CHAPTERS_FILE, VIDEO_FILE,
} from '../../src/domain/helpdocs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('document kinds, window labels and page addresses', () => {
  assert.deepEqual(Object.keys(DOC_KINDS), ['guide', 'tutorial', 'video']);
  assert.ok(isDocKind('guide') && isDocKind('video') && !isDocKind('settings') && !isDocKind('toString'));
  assert.equal(docLabel('guide'), 'doc-guide');
  assert.equal(docUrl('guide', 'ko'), 'docs/UsersGuide.html');
  assert.equal(docUrl('guide', 'en'), 'docs/UsersGuide.en.html');
  assert.equal(docUrl('tutorial', 'en'), 'docs/Tutorial.en.html');
  assert.equal(docUrl('video', 'ko'), null);
  assert.equal(docFile('tutorial', 'ko'), 'Tutorial.html');
  assert.equal(docWindowTitle('사용 설명서'), 'MyUMLMaker — 사용 설명서');
  for (const kind of ['guide', 'tutorial']) for (const lang of ['ko', 'en']) assert.ok(fs.existsSync(path.join(root, docUrl(kind, lang))), `${docUrl(kind, lang)} exists`);
  assert.match(VIDEO_FILE, /^video\/.+\.mp4$/);
  assert.equal(VIDEO_CHAPTERS_FILE, VIDEO_FILE.replace(/\.mp4$/, '.json'));
});

test('chapter list from the h2/h3 headings (anchor marks dropped, headings without id skipped)', () => {
  const nodes = [
    { tagName: 'H1', id: 'title', textContent: 'Guide' },
    { tagName: 'H2', id: 'start', textContent: 'Getting started #' },
    { tagName: 'H3', id: 'first', textContent: '  First   run  #' },
    { tagName: 'H3', id: '', textContent: 'No anchor' },
    { tagName: 'H4', id: 'deep', textContent: 'Too deep' },
    { tagName: 'h2', id: 'menus', textContent: 'Menus' },
  ];
  assert.deepEqual(chapterEntries(nodes), [
    { id: 'start', level: 2, text: 'Getting started' },
    { id: 'first', level: 3, text: 'First run' },
    { id: 'menus', level: 2, text: 'Menus' },
  ]);
  assert.deepEqual(chapterEntries(null), []);
  assert.equal(headingText('시작하기 #'), '시작하기');
  // The chapter being read: the last heading at or above the top of the view.
  const entries = chapterEntries(nodes);
  assert.equal(currentChapter(entries, [-500, -20, 300], 40), 'first');
  assert.equal(currentChapter(entries, [100, 300, 900], 40), null);
  assert.equal(currentChapter(entries, [-900, -800, 10], 40), 'menus');
});

test('the chapter list of the real guide pages', () => {
  const html = fs.readFileSync(path.join(root, 'docs', 'UsersGuide.html'), 'utf8');
  const nodes = [...html.matchAll(/<(h[23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({ tagName: m[1], id: m[2], textContent: m[3].replace(/<[^>]+>/g, '') }));
  const entries = chapterEntries(nodes);
  assert.ok(entries.filter((e) => e.level === 2).length >= 8, 'chapters');
  assert.ok(entries.every((e) => !e.text.endsWith('#')));
});

test('find in page: every match, ignoring case; next/previous wrap around', () => {
  assert.deepEqual(findOffsets('Class class CLASS', 'class'), [0, 6, 12]);
  assert.deepEqual(findOffsets('aaaa', 'aa'), [0, 2], 'matches do not overlap');
  assert.deepEqual(findOffsets('다이어그램 다이어그램', '그램'), [3, 9]);
  assert.deepEqual(findOffsets('text', ''), []);
  assert.deepEqual(findOffsets(null, 'x'), []);
  assert.equal(stepMatch(3, -1), 0);
  assert.equal(stepMatch(3, 2), 0);
  assert.equal(stepMatch(3, 0, true), 2);
  assert.equal(stepMatch(3, -1, true), 2);
  assert.equal(stepMatch(0, 0), -1);
});

test('video chapter sidecar: titles in the chosen language, sorted, bad entries dropped', () => {
  const sidecar = {
    duration: 412.5,
    chapters: [
      { id: 'edit', start: 120, title: { ko: '편집', en: 'Editing' } },
      { id: 'basics', start: 0, title: { ko: '기본', en: 'Basics' } },
      { id: 'bad', start: 'x', title: { ko: '잘못', en: 'Bad' } },
      { id: 'untitled', start: 10, title: {} },
    ],
    steps: [
      { id: 'welcome', chapter: 'basics', start: 0.4, title: { ko: '환영', en: 'Welcome' } },
      { id: 'select', chapter: 'edit', start: 121, title: { ko: '선택', en: 'Select' } },
      { id: 'neg', chapter: 'edit', start: -3, title: { ko: '음수', en: 'Negative' } },
    ],
  };
  const en = parseVideoChapters(JSON.stringify(sidecar), 'en');
  assert.equal(en.duration, 412.5);
  assert.deepEqual(en.chapters.map((c) => [c.id, c.start, c.title]), [['basics', 0, 'Basics'], ['edit', 120, 'Editing']]);
  assert.deepEqual(en.steps.map((s) => [s.id, s.chapter, s.title]), [['welcome', 'basics', 'Welcome'], ['select', 'edit', 'Select']]);
  assert.equal(parseVideoChapters(sidecar, 'ko').chapters[1].title, '편집');
  // Only steps: chapters start at each chapter's first step.
  const fromSteps = parseVideoChapters({ steps: sidecar.steps }, 'ko');
  assert.deepEqual(fromSteps.chapters.map((c) => [c.id, c.start]), [['basics', 0.4], ['edit', 121]]);
  // Plain string titles, a missing or broken file.
  assert.equal(parseVideoChapters({ chapters: [{ start: 5, title: 'Intro' }] }).chapters[0].title, 'Intro');
  for (const broken of [null, '', '{not json', '[]', 42]) assert.deepEqual(parseVideoChapters(broken), { duration: null, chapters: [], steps: [] });
});

test('the recorded sidecar (when the video was made) parses into chapters and steps', (t) => {
  const file = path.join(root, 'docs', VIDEO_CHAPTERS_FILE);
  if (!fs.existsSync(file)) { t.skip('docs/video/MyUMLMaker-Tutorial.json not made yet (npm run tutorial:video)'); return; }
  const data = parseVideoChapters(fs.readFileSync(file, 'utf8'), 'ko');
  assert.ok(data.duration > 60, `duration ${data.duration}`);
  assert.ok(data.chapters.length >= 5, 'chapters');
  assert.ok(data.steps.length >= 50, 'steps');
  assert.ok(data.steps.every((s, i) => i === 0 || s.start >= data.steps[i - 1].start), 'steps in order');
  assert.ok(data.steps.at(-1).start < data.duration, 'every step starts inside the video');
});

test('time labels, the entry playing and the timeline marks', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65.9), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(-4), '0:00');
  assert.equal(formatTime(Number.NaN), '0:00');
  const entries = [{ start: 0 }, { start: 30 }, { start: 90 }];
  assert.equal(entryAt(entries, 0), 0);
  assert.equal(entryAt(entries, 29.9), 0);
  assert.equal(entryAt(entries, 30), 1);
  assert.equal(entryAt(entries, 500), 2);
  assert.equal(entryAt([], 5), -1);
  assert.deepEqual(markOffsets(entries, 120), [0, 25, 75]);
  assert.deepEqual(markOffsets([{ start: 200 }], 100), [100]);
  assert.deepEqual(markOffsets(entries, 0), []);
});
