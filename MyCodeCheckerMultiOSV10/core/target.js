'use strict';

// What an analysis of a folder would read, without analyzing it (project.target):
// the source files per language with their sizes, the folders, the largest
// files, the folders that are skipped, and the build and version-control files
// at the top. The Overview shows it before the first analysis and next to the
// analysis results afterwards.

const fs = require('fs');
const path = require('path');
const { detectLanguage } = require('./languages');
const { excluded, SKIP_DIRS } = require('./analyze');

// Files at the top of a project that tell how it is built or kept.
const MARKERS = [
  ['CMakeLists.txt', 'CMake'], ['Makefile', 'Make'], ['makefile', 'Make'], ['meson.build', 'Meson'],
  ['compile_commands.json', 'compile_commands.json'], ['configure', 'Autotools'], ['configure.ac', 'Autotools'],
  ['build.gradle', 'Gradle'], ['build.gradle.kts', 'Gradle'], ['pom.xml', 'Maven'], ['package.json', 'npm'],
  ['pyproject.toml', 'Python'], ['setup.py', 'Python'], ['requirements.txt', 'pip'], ['go.mod', 'Go modules'],
  ['Cargo.toml', 'Cargo'], ['Gemfile', 'Bundler'], ['composer.json', 'Composer'], ['Dockerfile', 'Docker'],
  ['docker-compose.yml', 'Docker Compose'], ['Jenkinsfile', 'Jenkins'], ['.gitlab-ci.yml', 'GitLab CI'],
];
const SCM = [['.git', 'Git'], ['.svn', 'Subversion'], ['.hg', 'Mercurial']];

function normDirs(list) {
  return (list || []).map((d) => String(d).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
}

function survey(root, options = {}) {
  const abs = path.resolve(String(root || ''));
  let st = null;
  try { st = fs.statSync(abs); } catch { /* missing */ }
  if (!st || !st.isDirectory()) return { path: abs, exists: false };
  const exclusions = options.exclusions || [];
  const excludeDirs = normDirs(options.excludeDirs);
  const maxFiles = options.maxFiles || Infinity;
  const languages = {};
  const skipped = new Map();
  const largest = [];
  let files = 0;
  let bytes = 0;
  let dirs = 0;
  let otherFiles = 0;
  const started = Date.now();
  const visit = (dir, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    let here = 0;
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        const why = SKIP_DIRS.has(ent.name) ? 'skip' : excluded(r, exclusions) ? 'exclusion' : excludeDirs.some((d) => r === d || r.startsWith(`${d}/`)) ? 'excludeDir' : '';
        if (why) { if (skipped.size < 50) skipped.set(r, why); continue; }
        visit(full, r);
      } else if (ent.isFile()) {
        const lang = files < maxFiles && !excluded(r, exclusions) ? detectLanguage(full) : null;
        if (!lang) { otherFiles++; continue; }
        let size = 0;
        try { size = fs.statSync(full).size; } catch { continue; }
        files++;
        here++;
        bytes += size;
        const l = languages[lang] || (languages[lang] = { files: 0, bytes: 0 });
        l.files++;
        l.bytes += size;
        if (largest.length < 10 || size > largest[largest.length - 1].bytes) {
          largest.push({ path: r, bytes: size, language: lang });
          largest.sort((a, b) => b.bytes - a.bytes);
          if (largest.length > 10) largest.pop();
        }
      }
    }
    if (here) dirs++;
  };
  visit(abs, '');
  const top = new Set();
  try { for (const e of fs.readdirSync(abs)) top.add(e); } catch { /* unreadable */ }
  const build = [...new Set(MARKERS.filter(([f]) => top.has(f)).map(([, name]) => name))];
  const scm = SCM.filter(([f]) => top.has(f)).map(([, name]) => name);
  return {
    path: abs,
    exists: true,
    files,
    bytes,
    dirs,
    otherFiles,
    languages,
    largest,
    skipped: [...skipped].map(([dir, reason]) => ({ dir, reason })),
    build,
    scm,
    exclusions: exclusions.length,
    excludeDirs,
    surveyMs: Date.now() - started,
  };
}

module.exports = { survey };
