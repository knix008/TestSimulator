// The Help content: every chapter exists in both languages with the same
// numbers, every picture it shows is in images/<lang>/, and links between
// chapters point at chapters that exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const help = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'help');
const chapters = (lang) => fs.readdirSync(path.join(help, lang)).filter((f) => f.endsWith('.md')).sort();

test('Korean and English have the same chapters', () => {
  const ko = chapters('ko'), en = chapters('en');
  assert.ok(ko.length >= 10);
  assert.deepEqual(ko.map((f) => f.slice(0, 2)), en.map((f) => f.slice(0, 2)));
});

test('pictures and chapter links resolve', () => {
  const problems = [];
  for (const lang of ['ko', 'en']) {
    const files = chapters(lang);
    for (const f of files) {
      const text = fs.readFileSync(path.join(help, lang, f), 'utf8');
      if (!/^# /m.test(text)) problems.push(`${lang}/${f}: no title`);
      for (const m of text.matchAll(/!\[[^\]]*\]\(images\/([^)]+)\)/g)) {
        if (!fs.existsSync(path.join(help, 'images', lang, m[1]))) problems.push(`${lang}/${f}: missing image ${m[1]}`);
      }
      for (const m of text.matchAll(/\]\((\d\d-[^)#]+\.md)/g)) {
        if (!files.includes(m[1])) problems.push(`${lang}/${f}: link to ${m[1]}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
