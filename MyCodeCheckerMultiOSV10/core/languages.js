'use strict';

// Language detection for the checker. A file is one language; rule families
// share a runner (TypeScript runs the JavaScript rules, C++ runs the C rules).

const LANGS = {
  js: { exts: ['.js', '.jsx', '.mjs', '.cjs'], comments: 'slash', label: { ko: 'JavaScript', en: 'JavaScript' } },
  ts: { exts: ['.ts', '.tsx'], comments: 'slash', label: { ko: 'TypeScript', en: 'TypeScript' } },
  py: { exts: ['.py'], comments: 'hash', label: { ko: 'Python', en: 'Python' } },
  java: { exts: ['.java'], comments: 'slash', label: { ko: 'Java', en: 'Java' } },
  kt: { exts: ['.kt', '.kts'], comments: 'slash', label: { ko: 'Kotlin', en: 'Kotlin' } },
  cs: { exts: ['.cs'], comments: 'slash', label: { ko: 'C#', en: 'C#' } },
  c: { exts: ['.c', '.h'], comments: 'slash', label: { ko: 'C', en: 'C' } },
  cpp: { exts: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'], comments: 'slash', label: { ko: 'C++', en: 'C++' } },
  go: { exts: ['.go'], comments: 'slash', label: { ko: 'Go', en: 'Go' } },
  rs: { exts: ['.rs'], comments: 'slash', label: { ko: 'Rust', en: 'Rust' } },
  php: { exts: ['.php', '.phtml'], comments: 'slash', label: { ko: 'PHP', en: 'PHP' } },
  rb: { exts: ['.rb'], comments: 'hash', label: { ko: 'Ruby', en: 'Ruby' } },
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
};

const EXT = new Map();
for (const [id, lang] of Object.entries(LANGS)) {
  for (const ext of lang.exts) EXT.set(ext, id);
}

function detectLanguage(filePath) {
  const base = String(filePath).split(/[/\\]/).pop() || '';
  if (/^dockerfile/i.test(base) || base === 'Containerfile') return 'docker';
  if (base === 'Jenkinsfile') return 'groovy';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT.get(base.slice(dot).toLowerCase()) || null;
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

module.exports = { LANGS, detectLanguage, ruleLangsFor, commentKind };
