// Report glossary (core/report-glossary.js): only the terms a report uses, in
// Korean and English, the same texts as the GUI term tooltips, off by default,
// and in every export format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const glossary = require('../core/report-glossary.js');
const { createApi } = require('../core/api.js');
const ex = require('../core/export/index.js');
const { TERMS } = await import(pathToFileURL(path.join(root, 'src/lib/terms.js')).href);
const { ABBREVIATIONS } = await import(pathToFileURL(path.join(root, 'src/lib/abbrev.js')).href);

const DEMO = path.join(root, 'samples/demo');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

/** { name: Buffer } of a ZIP, from its central directory. */
function unzip(buf) {
  const files = {};
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const data = buf.subarray(local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)).subarray(0, size);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return files;
}
const zipText = (files, re) => Object.keys(files).filter((n) => re.test(n)).map((n) => files[n].toString('utf8')).join('\n');

async function demoApi(settings) {
  const api = createApi({ configDir: tmp('mcc-gloss-') });
  const r = await api.call('project.scan', { path: DEMO });
  if (settings) {
    const ws = await api.call('workspace.load', {});
    await api.call('workspace.save', { workspace: { settings: { ...ws.settings, ...settings } } });
  }
  return { api, projectId: r.project.id };
}

test('the glossary texts are the GUI term and abbreviation texts', () => {
  for (const [key, v] of Object.entries(glossary.TERM_TEXTS)) {
    assert.ok(TERMS[key], `src/lib/terms.js has no ${key}`);
    assert.deepEqual(v, { ko: TERMS[key].ko, en: TERMS[key].en }, key);
  }
  for (const [key, v] of Object.entries(glossary.ABBREV_TEXTS)) {
    assert.ok(ABBREVIATIONS[key], `src/lib/abbrev.js has no ${key}`);
    assert.deepEqual(v, { ko: ABBREVIATIONS[key].ko, en: ABBREVIATIONS[key].en }, key);
  }
});

test('every glossary entry has a term, a full name and an explanation in both languages', () => {
  const keys = new Set();
  for (const [key, source, findEn, findKo] of glossary.ENTRIES) {
    assert.ok(!keys.has(key), `duplicate ${key}`);
    keys.add(key);
    assert.ok(['term', 'abbr', 'extra'].includes(source), key);
    for (const f of [findEn, findKo]) assert.ok(f instanceof RegExp || typeof f === 'function', key);
  }
  for (const key of Object.keys(glossary.EXTRA_TEXTS)) assert.ok(keys.has(key), `${key} is not listed`);
  for (const lang of ['ko', 'en']) {
    assert.deepEqual(glossary.termsIn('x', lang), []);
    for (const [key] of glossary.ENTRIES) {
      const [, source] = glossary.ENTRIES.find((x) => x[0] === key);
      const texts = source === 'term' ? glossary.TERM_TEXTS[key][lang] : source === 'abbr' ? glossary.ABBREV_TEXTS[key][lang] : glossary.EXTRA_TEXTS[key][lang];
      assert.ok(texts.every((s) => typeof s === 'string' && s.trim()), `${key} ${lang}`);
      assert.doesNotMatch(texts.join(' '), /sonar|coverity|sparrow|klocwork|polyspace|fortify|checkmarx/i, key);
    }
  }
});

test('only the terms used in a text are listed, in that language', () => {
  const en = glossary.termsIn('Quality gate: Failed. Metric Threshold Status. Bugs GT 0 ERROR. CWE-79 in OWASP A03.', 'en');
  const keys = en.map((e) => e.key);
  for (const k of ['quality_gate', 'gate_status', 'pr_threshold', 'bugs', 'CWE', 'OWASP']) assert.ok(keys.includes(k), `${k} missing: ${keys}`);
  for (const k of ['MISRA', 'sqale_index', 'coverage', 'cid', 'HIS', 'SBOM']) assert.ok(!keys.includes(k), `${k} listed: ${keys}`);
  const cwe = en.find((e) => e.key === 'CWE');
  assert.equal(cwe.term, 'CWE');
  assert.equal(cwe.full, 'Common Weakness Enumeration');
  const bugs = en.find((e) => e.key === 'bugs');
  assert.equal(bugs.term, 'Bugs');
  assert.ok(bugs.full && bugs.text);

  const ko = glossary.termsIn('품질 게이트: 실패 · 기술 부채 5h · MISRA C:2012', 'ko');
  assert.deepEqual(ko.map((e) => e.key), ['quality_gate', 'sqale_index', 'MISRA']);
  assert.equal(ko[1].term, '기술 부채');
  assert.equal(ko[1].full, 'Technical debt');
  assert.match(ko[2].full, /자동차 산업 소프트웨어 신뢰성 협회/);

  // Words that only look like terms: ERROR without a gate, "THIS", lower-case "stream" in a rule name.
  const none = glossary.termsIn('THIS ERROR in a stream of tokens', 'en').map((e) => e.key);
  assert.deepEqual(none, []);
  // HIS metrics by their rule key.
  const his = glossary.termsIn('his:VG 3 violations', 'en');
  assert.deepEqual(his.map((e) => e.key), ['his:VG']);
  assert.match(his[0].text, /McCabe/);
});

test('the glossary section is HTML with a heading and a table, and a CSV table', () => {
  const html = '<!doctype html><html lang="en"><head><title>T</title><style>.CWE{}</style></head><body><h1>T</h1><p>Technical debt 5h</p></body></html>';
  const out = glossary.addGlossaryHtml(html, 'en');
  assert.match(out, /<h2 class="glossary" id="glossary">Glossary<\/h2>/);
  assert.match(out, /<td><strong>Technical debt<\/strong><\/td>/);
  assert.ok(out.indexOf('Glossary') < out.indexOf('</body>'));
  assert.ok(!out.includes('<strong>CWE</strong>'), 'style text is not report text');
  const doc = ex.fromHtml(out);
  const heading = doc.blocks.findIndex((b) => b.type === 'h2' && b.text === 'Glossary');
  assert.ok(heading > 0 && doc.blocks[heading - 1].type === 'pagebreak');
  const table = doc.blocks.slice(heading).find((b) => b.type === 'table');
  assert.deepEqual(table.columns, ['Term', 'Full name', 'Explanation']);
  assert.equal(table.rows[0][0], 'Technical debt');
  // Nothing to explain: unchanged.
  const plain = '<html><body><p>hello</p></body></html>';
  assert.equal(glossary.addGlossaryHtml(plain, 'en'), plain);
  const csv = glossary.addGlossaryCsv('﻿"a"\r\n', glossary.termsIn('기술 부채', 'ko'), 'ko');
  assert.equal(csv, '﻿"a"\r\n\r\n"용어 설명"\r\n"용어","전체 이름","설명"\r\n"기술 부채","Technical debt","남은 코드 스멜을 모두 고치는 데 드는 예상 시간(분)입니다. 하루는 8시간으로 셉니다."\r\n');
});

test('reports have no glossary unless asked for', async () => {
  const { api, projectId } = await demoApi();
  const html = await api.call('report.export', { projectId, kind: 'executive', format: 'html', lang: 'en' });
  assert.ok(!html.body.includes('class="glossary"'));
  const csv = await api.call('report.export', { projectId, kind: 'executive', format: 'csv', lang: 'en' });
  assert.ok(!csv.body.includes('"Glossary"'));
  const ws = await api.call('workspace.load', {});
  assert.notEqual(((ws.settings || {}).reports || {}).glossary, true);
});

test('the glossary lists the terms of each report in both languages', async () => {
  const { api, projectId } = await demoApi();
  const want = {
    executive: { en: ['Quality gate', 'Technical debt', 'Ratings A–E', 'BLOCKER'], ko: ['품질 게이트', '기술 부채', '등급 A–E'] },
    misra: { en: ['Mandatory / Required / Advisory', 'GCS', 'MISRA'], ko: ['편차', 'GCS', 'MISRA'] },
    integrity: { en: ['Outstanding', 'KLOC', 'Defect density'], ko: ['미해결', 'KLOC', '결함 밀도'] },
    'defect-security': { en: ['Security score', 'CWE'], ko: ['보안 점수', 'CWE'] },
    sbom: { en: ['SBOM'], ko: ['SBOM'] },
  };
  for (const [kind, langs] of Object.entries(want)) {
    for (const [lang, terms] of Object.entries(langs)) {
      const out = await api.call('report.export', { projectId, kind, format: 'html', lang, glossary: true });
      const at = out.body.indexOf('class="glossary" id="glossary"');
      assert.ok(at > 0, `${kind} ${lang}: no glossary`);
      const section = out.body.slice(at);
      assert.ok(section.includes(lang === 'ko' ? '>용어 설명<' : '>Glossary<'), `${kind} ${lang}: heading`);
      for (const term of terms) assert.ok(section.includes(`<strong>${term.replace('&', '&amp;')}</strong>`), `${kind} ${lang}: ${term}`);
      // Only terms of this report: the executive summary has no MISRA terms, MISRA no technical debt.
      if (kind === 'executive') assert.ok(!section.includes('<strong>GCS</strong>'), 'executive lists GCS');
      if (kind === 'misra') assert.ok(!section.includes(lang === 'ko' ? '<strong>기술 부채</strong>' : '<strong>Technical debt</strong>'), 'misra lists technical debt');
    }
  }
});

test('every format carries the glossary', async () => {
  const { api, projectId } = await demoApi();
  const args = { projectId, kind: 'executive', lang: 'en', glossary: true };
  const html = await api.call('report.export', { ...args, format: 'html' });
  assert.match(html.body, /<h2 class="glossary" id="glossary">Glossary<\/h2>/);
  const md = await api.call('report.export', { ...args, format: 'md' });
  assert.match(md.body, /^### Glossary$/m);
  assert.match(md.body, /\| Term \| Full name \| Explanation \|/);
  assert.match(md.body, /\| Technical debt \| Remediation effort \| /);
  const csv = await api.call('report.export', { ...args, format: 'csv' });
  assert.match(csv.body, /\r\n\r\n"Glossary"\r\n"Term","Full name","Explanation"\r\n/);
  const xlsx = unzip(Buffer.from((await api.call('report.export', { ...args, format: 'xlsx' })).base64, 'base64'));
  assert.match(xlsx['xl/workbook.xml'].toString('utf8'), /<sheet name="Glossary"/);
  assert.match(xlsx['xl/sharedStrings.xml'].toString('utf8'), /Technical debt/);
  const docx = unzip(Buffer.from((await api.call('report.export', { ...args, format: 'docx' })).base64, 'base64'));
  assert.match(docx['word/document.xml'].toString('utf8'), /Glossary[\s\S]*Technical debt/);
  const pptx = unzip(Buffer.from((await api.call('report.export', { ...args, format: 'pptx' })).base64, 'base64'));
  const slides = Object.keys(pptx).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml/.exec(a)[1]) - Number(/(\d+)\.xml/.exec(b)[1]));
  assert.match(pptx[slides[slides.length - 1]].toString('utf8'), /Glossary/);
  assert.match(zipText(pptx, /^ppt\/slides\/slide\d+\.xml$/), /Technical debt/);
  const pdf = Buffer.from((await api.call('report.export', { ...args, format: 'pdf' })).base64, 'base64');
  const bookmark = `<FEFF${Buffer.from('Glossary', 'utf16le').swap16().toString('hex').toUpperCase()}>`;
  assert.ok(pdf.toString('latin1').includes(`/Title ${bookmark}`), 'PDF bookmark');
  const ko = await api.call('report.export', { ...args, lang: 'ko', format: 'xlsx' });
  assert.match(unzip(Buffer.from(ko.base64, 'base64'))['xl/workbook.xml'].toString('utf8'), /<sheet name="용어 설명"/);
});

test('Settings › Reports turns the glossary on for exports, the regulatory ZIP and automatic reports', async () => {
  const dir = tmp('mcc-gloss-auto-');
  const folder = path.join(dir, 'out');
  const api = createApi({ configDir: dir });
  const ws = await api.call('workspace.load', {});
  await api.call('workspace.save', { workspace: { settings: { ...ws.settings, reports: { glossary: true, auto: { enabled: true, kinds: ['executive'], formats: ['html', 'md'], folder } } } } });
  const r = await api.call('project.scan', { path: DEMO });
  const files = fs.readdirSync(folder);
  assert.ok(fs.readFileSync(path.join(folder, files.find((f) => f.endsWith('.html'))), 'utf8').includes('class="glossary"'));
  assert.match(fs.readFileSync(path.join(folder, files.find((f) => f.endsWith('.md'))), 'utf8'), /^### (Glossary|용어 설명)$/m);
  const html = await api.call('report.export', { projectId: r.project.id, kind: 'executive', format: 'html', lang: 'en' });
  assert.ok(html.body.includes('class="glossary"'));
  // The argument wins over the setting.
  const off = await api.call('report.export', { projectId: r.project.id, kind: 'executive', format: 'html', lang: 'en', glossary: false });
  assert.ok(!off.body.includes('class="glossary"'));
  const z = unzip(Buffer.from((await api.call('report.regulatory', { projectId: r.project.id, kinds: ['executive'], lang: 'en' })).base64, 'base64'));
  const pdfName = Object.keys(z).find((n) => n.endsWith('.pdf'));
  const bookmark = `<FEFF${Buffer.from('Glossary', 'utf16le').swap16().toString('hex').toUpperCase()}>`;
  assert.ok(z[pdfName].toString('latin1').includes(`/Title ${bookmark}`), 'regulatory PDF');
  const xlsxName = Object.keys(z).find((n) => n.endsWith('.xlsx'));
  assert.match(unzip(z[xlsxName])['xl/workbook.xml'].toString('utf8'), /<sheet name="Glossary"/);
});

test('exportReport takes the glossary option', () => {
  const analysis = { issues: [], measures: { bugs: 0, vulnerabilities: 0, code_smells: 0, ncloc: 10 }, ratings: {}, qualityGate: { status: 'OK', conditions: [] } };
  const on = ex.exportReport('executive', analysis, 'html', { lang: 'en', glossary: true }).buffer.toString('utf8');
  assert.match(on, /id="glossary"/);
  const off = ex.exportReport('executive', analysis, 'html', { lang: 'en' }).buffer.toString('utf8');
  assert.doesNotMatch(off, /id="glossary"/);
});
