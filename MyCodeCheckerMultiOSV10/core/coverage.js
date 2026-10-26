'use strict';

const fs = require('fs');
const path = require('path');

// Coverage import. SonarQube reads a report; so does this checker.
// Supported: lcov.info, Cobertura XML, JaCoCo XML.

// Also Clover XML, OpenCover XML, Go cover profiles and the SonarQube generic
// coverage XML. `reports` (paths relative to root) replaces auto-detection, and
// several reports are merged (a line is covered when any report covers it).
function readCoverage(root, reports) {
  if (reports && reports.length) {
    const parsed = [];
    for (const rel of reports) {
      const full = path.resolve(root, rel);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
      const one = parseAny(fs.readFileSync(full, 'utf8'), root, full);
      if (one) parsed.push(one);
    }
    return parsed.length ? merge(parsed) : null;
  }
  const candidates = [
    'coverage/lcov.info', 'lcov.info', 'coverage/lcov.info.txt',
    'coverage/cobertura-coverage.xml', 'cobertura.xml',
    'jacoco.xml', 'build/reports/jacoco/test/jacocoTestReport.xml',
    'coverage/clover.xml', 'clover.xml', 'build/logs/clover.xml',
    'coverage.opencover.xml', 'opencover.xml',
    'coverage.out', 'cover.out',
    'coverage/sonar-coverage.xml', 'sonar-coverage.xml',
  ];
  for (const rel of candidates) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const result = parseAny(fs.readFileSync(full, 'utf8'), root, full);
    if (result) return result;
  }
  return null;
}

/** Detect the format from the content. */
function parseAny(text, root, name = '') {
  const head = text.slice(0, 2000);
  if (/^mode:\s*(set|count|atomic)/m.test(head)) return parseGoCover(text, root);
  if (/<coverage\s+version="1"/.test(head) && /<file\s+path=/.test(text)) return parseGenericCoverage(text, root);
  if (/<CoverageSession\b/.test(head)) return parseOpenCover(text, root);
  if (/<coverage\b[^>]*generated=/.test(head) && /<project\b/.test(head)) return parseClover(text, root);
  if (/cobertura|<coverage\b[^>]*line-rate=/i.test(head + name)) return parseCobertura(text, root);
  if (/<report\b/.test(head) && /<sourcefile\b/.test(text)) return parseJacoco(text, root);
  if (/^(SF|TN):/m.test(head)) return parseLcov(text, root);
  return null;
}

function addLine(rec, lineNo, hit) {
  if (rec.lines[lineNo] == null) {
    rec.lines[lineNo] = hit;
    rec.toCover += 1;
    if (hit) rec.covered += 1;
  } else if (hit && !rec.lines[lineNo]) {
    rec.lines[lineNo] = true;
    rec.covered += 1;
  }
}

function fileRec(files, key) {
  return files[key] || (files[key] = { lines: {}, covered: 0, toCover: 0 });
}

/** Clover XML (PHPUnit, Jest/Istanbul clover reporter, OpenClover). */
function parseClover(text, root) {
  const files = {};
  const fileRe = /<file\b([^>]*)>([\s\S]*?)<\/file>/g;
  let f;
  while ((f = fileRe.exec(text))) {
    const attr = f[1];
    const p = /\bpath="([^"]+)"/.exec(attr) || /\bname="([^"]+)"/.exec(attr);
    if (!p) continue;
    const rec = fileRec(files, norm(root, p[1]));
    const lineRe = /<line\b([^>]*)\/?>/g;
    let l;
    while ((l = lineRe.exec(f[2]))) {
      const num = /\bnum="(\d+)"/.exec(l[1]);
      const type = /\btype="(\w+)"/.exec(l[1]);
      if (!num || (type && type[1] === 'method')) continue;
      const count = /\bcount="(\d+)"/.exec(l[1]) || /\btruecount="(\d+)"/.exec(l[1]);
      addLine(rec, Number(num[1]), !!count && Number(count[1]) > 0);
    }
  }
  return summarize(files, 'clover');
}

/** OpenCover XML (.NET): sequence points with visit counts. */
function parseOpenCover(text, root) {
  const files = {};
  const names = {};
  const fileRe = /<File\b[^>]*\buid="(\d+)"[^>]*\bfullPath="([^"]+)"/g;
  let m;
  while ((m = fileRe.exec(text))) names[m[1]] = norm(root, m[2]);
  const spRe = /<SequencePoint\b([^>]*)\/?>/g;
  while ((m = spRe.exec(text))) {
    const a = m[1];
    const vc = /\bvc="(\d+)"/.exec(a);
    const sl = /\bsl="(\d+)"/.exec(a);
    const el = /\bel="(\d+)"/.exec(a);
    const fid = /\bfileid="(\d+)"/.exec(a);
    if (!vc || !sl || !fid || !names[fid[1]]) continue;
    const rec = fileRec(files, names[fid[1]]);
    for (let n = Number(sl[1]); n <= Number(el ? el[1] : sl[1]); n++) addLine(rec, n, Number(vc[1]) > 0);
  }
  return summarize(files, 'opencover');
}

/** Go cover profile: "file.go:10.2,12.3 2 1" (statements, count). */
function parseGoCover(text, root) {
  const files = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^(.+\.go):(\d+)\.\d+,(\d+)\.\d+\s+\d+\s+(\d+)$/.exec(line.trim());
    if (!m) continue;
    // Module paths (github.com/x/y/pkg/f.go) are matched by suffix in coverageFor.
    const rec = fileRec(files, norm(root, m[1]));
    for (let n = Number(m[2]); n <= Number(m[3]); n++) addLine(rec, n, Number(m[4]) > 0);
  }
  return summarize(files, 'go');
}

/** SonarQube generic coverage XML: <file path><lineToCover lineNumber covered/>. */
function parseGenericCoverage(text, root) {
  const files = {};
  const fileRe = /<file\b[^>]*\bpath="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g;
  let f;
  while ((f = fileRe.exec(text))) {
    const rec = fileRec(files, norm(root, f[1]));
    const re = /<lineToCover\b[^>]*\blineNumber="(\d+)"[^>]*\bcovered="(true|false)"/g;
    let l;
    while ((l = re.exec(f[2]))) addLine(rec, Number(l[1]), l[2] === 'true');
  }
  return summarize(files, 'generic');
}

function merge(list) {
  const files = {};
  for (const one of list) {
    for (const [key, rec] of Object.entries(one.files)) {
      const out = fileRec(files, key);
      if (rec.suffix) out.suffix = rec.suffix;
      for (const [n, hit] of Object.entries(rec.lines)) addLine(out, Number(n), hit);
    }
  }
  return summarize(files, list.map((x) => x.format).join('+'));
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

module.exports = { readCoverage, coverageFor, parseAny, parseLcov, parseCobertura, parseJacoco, parseClover, parseOpenCover, parseGoCover, parseGenericCoverage };
