'use strict';

const fs = require('fs');
const path = require('path');

// Coverage import. SonarQube reads a report; so does this checker.
// Supported: lcov.info, Cobertura XML, JaCoCo XML.

function readCoverage(root) {
  const candidates = [
    'coverage/lcov.info', 'lcov.info', 'coverage/lcov.info.txt',
    'coverage/cobertura-coverage.xml', 'cobertura.xml',
    'jacoco.xml', 'build/reports/jacoco/test/jacocoTestReport.xml',
  ];
  for (const rel of candidates) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (rel.endsWith('.xml') && /cobertura/i.test(text.slice(0, 200) + rel)) return parseCobertura(text, root);
    if (rel.endsWith('.xml')) return parseJacoco(text, root);
    return parseLcov(text, root);
  }
  return null;
}

function parseLcov(text, root) {
  const files = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      cur = norm(root, line.slice(3).trim());
      files[cur] = files[cur] || { lines: {}, covered: 0, toCover: 0 };
    } else if (line.startsWith('DA:') && cur) {
      const [n, hits] = line.slice(3).split(',');
      const lineNo = Number(n);
      const hit = Number(hits) > 0;
      files[cur].lines[lineNo] = hit;
      files[cur].toCover += 1;
      if (hit) files[cur].covered += 1;
    } else if (line === 'end_of_record') cur = null;
  }
  return summarize(files, 'lcov');
}

function parseCobertura(text, root) {
  const files = {};
  const classRe = /<class\b[^>]*filename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g;
  let m;
  while ((m = classRe.exec(text))) {
    const file = norm(root, m[1]);
    const body = m[2];
    const rec = files[file] || { lines: {}, covered: 0, toCover: 0 };
    const lineRe = /<line\b[^>]*number="(\d+)"[^>]*hits="(\d+)"[^>]*\/?>/g;
    let lm;
    while ((lm = lineRe.exec(body))) {
      const lineNo = Number(lm[1]);
      const hit = Number(lm[2]) > 0;
      if (rec.lines[lineNo] == null) {
        rec.lines[lineNo] = hit;
        rec.toCover += 1;
        if (hit) rec.covered += 1;
      }
    }
    files[file] = rec;
  }
  return summarize(files, 'cobertura');
}

function parseJacoco(text, root) {
  const files = {};
  const srcRe = /<sourcefile\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/sourcefile>/g;
  let m;
  while ((m = srcRe.exec(text))) {
    const name = m[1];
    const body = m[2];
    // JaCoCo names are file names; match later by suffix.
    const rec = { lines: {}, covered: 0, toCover: 0, suffix: name };
    const lineRe = /<line\b[^>]*nr="(\d+)"[^>]*ci="(\d+)"[^>]*\/?>/g;
    let lm;
    while ((lm = lineRe.exec(body))) {
      const lineNo = Number(lm[1]);
      const hit = Number(lm[2]) > 0;
      rec.lines[lineNo] = hit;
      rec.toCover += 1;
      if (hit) rec.covered += 1;
    }
    files['*' + name] = rec;
  }
  return summarize(files, 'jacoco');
}

function norm(root, file) {
  let p = file.replace(/\\/g, '/');
  const rootNorm = String(root || '').replace(/\\/g, '/').replace(/\/$/, '');
  if (rootNorm && (p === rootNorm || p.startsWith(rootNorm + '/'))) p = p.slice(rootNorm.length + 1);
  return p.replace(/^\.\//, '');
}

function summarize(files, format) {
  let toCover = 0;
  let covered = 0;
  for (const rec of Object.values(files)) {
    toCover += rec.toCover;
    covered += rec.covered;
  }
  return {
    format,
    files,
    linesToCover: toCover,
    uncoveredLines: toCover - covered,
    coveredLines: covered,
    lineCoverage: toCover ? Math.round((covered / toCover) * 1000) / 10 : null,
  };
}

function coverageFor(coverage, relPath) {
  if (!coverage) return null;
  const rel = relPath.replace(/\\/g, '/');
  if (coverage.files[rel]) return coverage.files[rel];
  const base = rel.split('/').pop();
  for (const [k, rec] of Object.entries(coverage.files)) {
    if (k === rel || k.endsWith('/' + rel) || rel.endsWith('/' + k) || k.endsWith(base) || (rec.suffix && rec.suffix === base)) return rec;
  }
  return null;
}

module.exports = { readCoverage, coverageFor, parseLcov, parseCobertura, parseJacoco };
