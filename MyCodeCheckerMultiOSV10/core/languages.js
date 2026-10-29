'use strict';

// Language detection for the checker. A file is one language; rule families
// share a runner (TypeScript runs the JavaScript rules, C++ runs the C rules).

const LANGS = {
  js: { exts: ['.js', '.jsx', '.mjs', '.cjs'], comments: 'slash', label: { ko: 'JavaScript', en: 'JavaScript' } },
  ts: { exts: ['.ts', '.tsx', '.mts', '.cts'], comments: 'slash', label: { ko: 'TypeScript', en: 'TypeScript' } },
  py: { exts: ['.py', '.pyi', '.pyw'], comments: 'hash', label: { ko: 'Python', en: 'Python' } },
  java: { exts: ['.java'], comments: 'slash', label: { ko: 'Java', en: 'Java' } },
  kt: { exts: ['.kt', '.kts'], comments: 'slash', label: { ko: 'Kotlin', en: 'Kotlin' } },
  cs: { exts: ['.cs'], comments: 'slash', label: { ko: 'C#', en: 'C#' } },
  c: { exts: ['.c', '.h'], comments: 'slash', label: { ko: 'C', en: 'C' } },
  cpp: { exts: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'], comments: 'slash', label: { ko: 'C++', en: 'C++' } },
  go: { exts: ['.go'], comments: 'slash', label: { ko: 'Go', en: 'Go' } },
  rs: { exts: ['.rs'], comments: 'slash', label: { ko: 'Rust', en: 'Rust' } },
  php: { exts: ['.php', '.phtml'], comments: 'slash', label: { ko: 'PHP', en: 'PHP' } },
  rb: { exts: ['.rb', '.rake', '.gemspec', '.ru'], comments: 'hash', label: { ko: 'Ruby', en: 'Ruby' } },
  sh: { exts: ['.sh', '.bash', '.zsh'], comments: 'hash', label: { ko: 'Shell', en: 'Shell' } },
  ps1: { exts: ['.ps1', '.psm1'], comments: 'hash', label: { ko: 'PowerShell', en: 'PowerShell' } },
  sql: { exts: ['.sql'], comments: 'dash', label: { ko: 'SQL', en: 'SQL' } },
  html: { exts: ['.html', '.htm', '.vue'], comments: 'xml', label: { ko: 'HTML', en: 'HTML' } },
  css: { exts: ['.css', '.scss', '.less'], comments: 'slash', label: { ko: 'CSS', en: 'CSS' } },
  xml: { exts: ['.xml'], comments: 'xml', label: { ko: 'XML', en: 'XML' } },
  json: { exts: ['.json'], comments: 'none', label: { ko: 'JSON', en: 'JSON' } },
  yaml: { exts: ['.yml', '.yaml'], comments: 'hash', label: { ko: 'YAML', en: 'YAML' } },
  docker: { exts: [], comments: 'hash', label: { ko: 'Docker', en: 'Docker' } },
  tf: { exts: ['.tf'], comments: 'hash', label: { ko: 'Terraform', en: 'Terraform' } },
  groovy: { exts: ['.groovy', '.gradle'], comments: 'slash', label: { ko: 'Groovy', en: 'Groovy' } },
  swift: { exts: ['.swift'], comments: 'slash', label: { ko: 'Swift', en: 'Swift' } },
  objc: { exts: ['.m', '.mm'], comments: 'slash', label: { ko: 'Objective-C', en: 'Objective-C' } },
  scala: { exts: ['.scala', '.sc'], comments: 'slash', label: { ko: 'Scala', en: 'Scala' } },
  dart: { exts: ['.dart'], comments: 'slash', label: { ko: 'Dart', en: 'Dart' } },
  vbnet: { exts: ['.vb'], comments: 'quote', label: { ko: 'VB.NET', en: 'VB.NET' } },
  vb6: { exts: ['.bas', '.frm', '.ctl'], comments: 'quote', label: { ko: 'VB6', en: 'VB6' } },
  cobol: { exts: ['.cbl', '.cob', '.cpy'], comments: 'cobol', label: { ko: 'COBOL', en: 'COBOL' } },
  plsql: { exts: ['.pls', '.pkb', '.pks', '.plb', '.prc', '.fnc', '.trg'], comments: 'dash', label: { ko: 'PL/SQL', en: 'PL/SQL' } },
  abap: { exts: ['.abap'], comments: 'abap', label: { ko: 'ABAP', en: 'ABAP' } },
  apex: { exts: ['.cls', '.trigger', '.apex'], comments: 'slash', label: { ko: 'Apex', en: 'Apex' } },
  rpg: { exts: ['.rpgle', '.sqlrpgle', '.rpg'], comments: 'slash', label: { ko: 'RPG', en: 'RPG' } },
  pli: { exts: ['.pli', '.pl1'], comments: 'slash', label: { ko: 'PL/I', en: 'PL/I' } },
  jcl: { exts: ['.jcl'], comments: 'jcl', label: { ko: 'JCL', en: 'JCL' } },
  flex: { exts: ['.as'], comments: 'slash', label: { ko: 'Flex (ActionScript)', en: 'Flex (ActionScript)' } },
  bicep: { exts: ['.bicep'], comments: 'slash', label: { ko: 'Bicep', en: 'Bicep' } },
};

const EXT = new Map();
for (const [id, lang] of Object.entries(LANGS)) {
  for (const ext of lang.exts) EXT.set(ext, id);
}

// Ruby DSL files without an extension.
const RUBY_FILES = new Set(['Rakefile', 'Gemfile', 'Guardfile', 'Capfile', 'Vagrantfile', 'Podfile', 'Fastfile', 'Brewfile']);

// detectLanguage(path[, text]): with the text, an extension that several
// formats share is checked against the content, so a file of another kind is
// not analyzed with the wrong language's rules (null = not analyzed).
function detectLanguage(filePath, text) {
  const base = String(filePath).split(/[/\\]/).pop() || '';
  if (/^dockerfile/i.test(base) || base === 'Containerfile') return 'docker';
  if (base === 'Jenkinsfile') return 'groovy';
  if (RUBY_FILES.has(base)) return 'rb';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = base.slice(dot).toLowerCase();
  const lang = EXT.get(ext) || null;
  return lang && typeof text === 'string' ? refineLanguage(lang, ext, text) : lang;
}

// The language of a file whose extension is shared with other formats.
function refineLanguage(lang, ext, text) {
  const head = text.slice(0, 4096).replace(/^﻿/, '');
  // Qt Linguist translation files are XML with the TypeScript extension.
  if (ext === '.ts' && /^\s*<(?:\?xml|!DOCTYPE\s+TS\b|TS\b)/i.test(head)) return 'xml';
  if (ext === '.cls') {
    // Visual Basic class modules (VB6 / VBA export).
    if (/^\s*VERSION\s+1\.0\s+CLASS\b|^\s*Attribute\s+VB_Name\s*=/im.test(head)) return 'vb6';
    // LaTeX document classes.
    if (/^\s*\\(?:NeedsTeXFormat|ProvidesClass|LoadClass|documentclass)\b/m.test(head)) return null;
  }
  // MATLAB / Octave scripts share .m with Objective-C.
  if (ext === '.m' && !/^\s*(?:#\s*(?:import|include)\b|@(?:interface|implementation|protocol|class)\b)/m.test(head)
    && /^\s*(?:function\b[^\n(]*(?:=|\()|%|end\s*$|classdef\b)/m.test(head)) return null;
  // Audio playlists (.pls) and SQL*Loader control files (.ctl).
  if (ext === '.pls' && /^\s*\[playlist\]/i.test(head)) return null;
  if (ext === '.ctl' && /^\s*(?:OPTIONS\s*\(|LOAD\s+DATA\b)/im.test(head)) return null;
  return lang;
}

// Which rule languages apply to a file language.
function ruleLangsFor(lang) {
  const extra = {
    ts: ['js'],
    cpp: ['c'],
    kt: ['java'],
    groovy: ['java'],
  };
  return [lang, ...(extra[lang] || [])];
}

function commentKind(lang) {
  return (LANGS[lang] && LANGS[lang].comments) || 'none';
}

module.exports = { LANGS, detectLanguage, refineLanguage, ruleLangsFor, commentKind };
