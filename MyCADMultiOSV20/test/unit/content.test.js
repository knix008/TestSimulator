// Start page, tutorial and documentation content stay consistent: every
// sample listed exists, every task points at a lesson and a sample, every
// lesson step is complete in both languages, and doc/ follows the lessons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DOC_DIALOGS, LESSONS } from '../../src/tutorial/lessons.js';
import { START_TASKS, TIP_COUNT } from '../../src/view/startpage.js';
import { DICTIONARIES } from '../../src/i18n.js';

const { ko, en } = DICTIONARIES;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'samples', 'index.json'), 'utf8'));

test('samples/index.json: every sample exists, once, with titles and descriptions in both languages', () => {
  assert.ok(index.length >= 20);
  assert.equal(new Set(index.map((s) => s.file)).size, index.length);
  for (const s of index) {
    assert.ok(fs.existsSync(path.join(root, 'samples', s.file)), s.file);
    assert.ok(s.title && s.titleKo && s.description && s.descriptionKo, s.file);
    assert.ok(Array.isArray(s.tags) && s.tags.length, s.file);
  }
});

test('start page: every task has a lesson, a sample from the index and its texts', () => {
  for (const task of START_TASKS) {
    assert.ok(task.lesson >= 1 && task.lesson <= LESSONS.length, task.id);
    assert.ok(index.some((s) => s.file === task.sample), `${task.id}: ${task.sample}`);
    for (const dict of [ko, en]) {
      assert.ok(dict[`start.task.${task.id}`] && dict[`start.task.${task.id}.text`], `${task.id} texts`);
    }
  }
  for (let i = 0; i < TIP_COUNT; i++) assert.ok(ko[`start.tip.${i}`] && en[`start.tip.${i}`], `tip ${i}`);
});

test('tutorial: 21 lessons, every step with title, text and run; practice texts in both languages', () => {
  assert.equal(LESSONS.length, 21);
  assert.ok(LESSONS[0].fresh, 'the first lesson starts from scratch');
  let steps = 0;
  for (const lesson of LESSONS) {
    assert.ok(lesson.title.ko && lesson.title.en);
    for (const step of lesson.steps) {
      steps++;
      assert.ok(step.title.ko && step.title.en && step.text.ko && step.text.en, step.title.en);
      assert.equal(typeof step.run, 'function', step.title.en);
      if (step.practice) {
        assert.ok(step.practice.todo.ko && step.practice.todo.en, `${step.title.en}: todo`);
        if (step.practice.check) assert.equal(typeof step.practice.check, 'function');
      }
    }
  }
  assert.ok(steps >= 80, `${steps} steps`);
  for (const key of Object.keys(DOC_DIALOGS)) {
    const [l, s] = key.split('-').map(Number);
    assert.ok(LESSONS[l - 1]?.steps[s - 1], `DOC_DIALOGS ${key} names a real step`);
  }
});

test('doc/: Tutorial.md (ko) and Tutorial.en.md follow the lessons, and every picture they show exists', () => {
  for (const [file, language] of [['Tutorial.md', 'ko'], ['Tutorial.en.md', 'en']]) {
    const md = fs.readFileSync(path.join(root, 'doc', file), 'utf8');
    LESSONS.forEach((lesson, i) => assert.ok(md.includes(`${i + 1}. ${lesson.title[language]}`), `${file}: lesson ${i + 1}`));
    for (const lesson of LESSONS) for (const step of lesson.steps) assert.ok(md.includes(`**${step.title[language]}**`), `${file}: ${step.title[language]}`);
    const pictures = [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(pictures.length >= 80, `${file}: ${pictures.length} pictures`);
    for (const picture of pictures) assert.ok(fs.existsSync(path.join(root, 'doc', picture)), `${file}: ${picture}`);
    assert.ok(fs.existsSync(path.join(root, 'doc', file.replace(/\.md$/, '.html'))), `${file}: HTML version`);
  }
});
