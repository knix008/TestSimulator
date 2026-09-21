// Language detection from file names (src/lib/languages.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguage, languageByName, FEATURED_LANGUAGES, ALL_LANGUAGES, OTHER_LANGUAGES, PLAIN,
} from '../src/lib/languages.js';

function nameOf(file) {
  const d = detectLanguage(file);
  return d ? d.name : null;
}

const FILES = [
  ['notes.txt', null],
  ['app.log', null],
  ['readme.text', null],
  ['data.csv', null],
  ['sheet.tsv', null],
  ['app.js', 'JavaScript'],
  ['app.mjs', 'JavaScript'],
  ['app.cjs', 'JavaScript'],
  ['app.ts', 'TypeScript'],
  ['app.mts', 'TypeScript'],
  ['app.cts', 'TypeScript'],
  ['App.jsx', 'JSX'],
  ['App.tsx', 'TSX'],
  ['index.html', 'HTML'],
  ['index.htm', 'HTML'],
  ['page.xhtml', 'HTML'],
  ['style.css', 'CSS'],
  ['style.scss', 'SCSS'],
  ['style.less', 'LESS'],
  ['data.json', 'JSON'],
  ['tsconfig.jsonc', 'JSON'],
  ['x.json5', 'JSON'],
  ['site.webmanifest', 'JSON'],
  ['doc.md', 'Markdown'],
  ['doc.markdown', 'Markdown'],
  ['main.py', 'Python'],
  ['main.pyw', 'Python'],
  ['main.c', 'C'],
  ['header.h', 'C'],
  ['main.cpp', 'C++'],
  ['header.hpp', 'C++'],
  ['Program.cs', 'C#'],
  ['Main.java', 'Java'],
  ['main.go', 'Go'],
  ['lib.rs', 'Rust'],
  ['index.php', 'PHP'],
  ['app.rb', 'Ruby'],
  ['run.sh', 'Shell'],
  ['run.bash', 'Shell'],
  ['run.zsh', 'Shell'],
  ['run.bat', 'Shell'],
  ['run.cmd', 'Shell'],
  ['.env', 'Shell'],
  ['.gitignore', 'Shell'],
  ['Makefile', 'Shell'],
  ['script.ps1', 'PowerShell'],
  ['module.psm1', 'PowerShell'],
  ['chart.yml', 'YAML'],
  ['chart.yaml', 'YAML'],
  ['data.xml', 'XML'],
  ['icon.svg', 'XML'],
  ['Info.plist', 'XML'],
  ['App.csproj', 'XML'],
  ['Dockerfile', 'Dockerfile'],
  ['Containerfile', 'Dockerfile'],
  ['Dockerfile.prod', 'Dockerfile'],
  ['app.sql', 'SQL'],
  ['CMakeLists.txt', 'CMake'],
  ['Main.kt', 'Kotlin'],
  ['build.kts', 'Kotlin'],
  ['a.tex', 'LaTeX'],
  ['setup.nsi', 'NSIS'],
  ['setup.nsh', 'NSIS'],
];

for (const [file, want] of FILES) {
  test(`detectLanguage(${file})`, () => {
    assert.equal(nameOf(file), want);
  });
}

const FEATURED = ['JavaScript', 'TypeScript', 'JSX', 'TSX', 'HTML', 'CSS', 'JSON', 'Markdown', 'Python', 'C', 'C++', 'C#', 'Java', 'Go', 'Rust', 'PHP', 'Ruby', 'Shell', 'PowerShell', 'SQL', 'XML', 'YAML', 'Dockerfile'];

for (const name of FEATURED) {
  test(`featured language ${name} is registered`, () => {
    assert.ok(languageByName(name), name);
    assert.ok(FEATURED_LANGUAGES.some((d) => d.name === name), name);
  });
}

test('plain text has no language description', () => {
  assert.equal(languageByName(PLAIN), null);
  assert.equal(languageByName(''), null);
  assert.equal(detectLanguage(''), null);
  assert.equal(detectLanguage(null), null);
});

test('ALL_LANGUAGES has unique names and includes featured plus others', () => {
  const names = ALL_LANGUAGES.map((d) => d.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(ALL_LANGUAGES.length, FEATURED_LANGUAGES.length + OTHER_LANGUAGES.length);
  assert.ok(ALL_LANGUAGES.length > 80);
});
