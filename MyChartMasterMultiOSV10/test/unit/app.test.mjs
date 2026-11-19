// App modules without a DOM: exports (PDF, HTML), settings, the two dictionaries, icons, tutorial steps, menus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chartHtml, chartPdf, chartSvg, CHART_FORMATS } from '../../src/domain/export/chartexport.js';
import { SAMPLES } from '../../src/domain/chart/samples.js';
import { ChartDoc } from '../../src/domain/chart/doc.js';
import { CHART_IDS, CHART_GROUPS } from '../../src/domain/chart/types.js';
import { PALETTES } from '../../src/domain/chart/palettes.js';
import { ANIMATIONS, defaultSettings, normalizeSettings, resetForNewInstall, STORAGE_KEY, zoomStep } from '../../src/domain/settings.js';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';
import chartKo from '../../src/i18n/chart-ko.js';
import chartEn from '../../src/i18n/chart-en.js';
import { hasIcon, animationIcon } from '../../src/icons.js';
import { CHAPTERS, STEPS } from '../../src/ui/tutorial.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const KO = { ...ko, ...chartKo };
const EN = { ...en, ...chartEn };
const sampleDoc = (id = 'monthly-sales') => { const b = SAMPLES.find((s) => s.id === id).build('ko'); return new ChartDoc({ name: b.name, table: b.table, chart: b.chart }); };

test('PDF with the picture: valid structure, image object, data pages, offsets', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const lines = Array.from({ length: 120 }, (_, i) => `row ${i} 가나다`);
  const pdf = chartPdf({ jpeg, pixels: { width: 2048, height: 1280 }, title: '월별 매출', lines, paper: 'A4', orientation: 'landscape' });
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Subtype \/Image \/Width 2048 \/Height 1280/);
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  const count = Number(/\/Count (\d+)/.exec(text)[1]);
  assert.ok(count >= 3, `${count} pages (chart + data)`);
  // Every xref offset points at "n 0 obj".
  const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
  const entries = text.slice(xref).split('\n').filter((l) => /^\d{10} 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
  entries.forEach((offset, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, offset), `object ${i + 1} at ${offset}`));
  const portrait = new TextDecoder('latin1').decode(chartPdf({ jpeg, pixels: { width: 10, height: 10 }, paper: 'Letter', orientation: 'portrait' }));
  assert.match(portrait, /\/MediaBox \[0 0 612\.00 792\.00\]/);
});

test('HTML page: the chart, tool tips, the data table, escaped text', () => {
  const doc = sampleDoc();
  doc.setChart({ title: 'A <b> & "c"' });
  const svg = chartSvg(doc, { language: 'en' });
  assert.ok(svg.includes('<title>'), 'SVG export has hover titles');
  const html = chartHtml(doc, svg, { language: 'en' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<svg') && html.includes('data-tip'));
  assert.ok(html.includes('A &lt;b&gt; &amp; &quot;c&quot;'));
  assert.equal((html.match(/<tr>/g) ?? []).length, doc.table.rows.length + 1);
  assert.ok(!chartHtml(doc, svg, { includeData: false }).includes('<table>'));
  assert.deepEqual(Object.keys(CHART_FORMATS), ['png', 'jpg', 'webp', 'gif', 'avif', 'svg', 'pdf', 'html', 'docx', 'markdown']);
  const other = chartSvg(doc, { width: 300, height: 200, background: 'transparent' });
  assert.match(other, /width="300" height="200"/);
  assert.ok(!other.includes('chart-bg'));
});

test('settings: defaults, repairs, zoom steps, reset after a new installation', () => {
  const s = normalizeSettings({ theme: 'nope', animation: 'packetflow', paneLayout: 'x', chartLegend: 'up', importDelimiter: '#', exportScale: 9, textZoom: 13 }, 'en');
  assert.equal(s.language, 'en');
  assert.equal(s.theme, 'light');
  assert.equal(s.animation, 'bars');
  assert.equal(s.paneLayout, 'grid-bottom');
  assert.equal(s.chartLegend, 'bottom');
  assert.equal(s.importDelimiter, 'auto');
  assert.equal(s.exportScale, 4);
  assert.equal(s.textZoom, 25);
  assert.equal(normalizeSettings({ textZoom: 0 }).textZoom, 0, '0 = fit');
  assert.equal(zoomStep(0, 1), 110);
  assert.equal(zoomStep(100, -1), 90);
  assert.equal(zoomStep(400, 1), 400);
  assert.equal(ANIMATIONS.length, 20);
  const store = new Map([[STORAGE_KEY, JSON.stringify({ ...defaultSettings('ko'), theme: 'dark', lastDirectory: 'C:/x' })], ['mychartmaster.recent.v1', '[1]'], ['mychartmaster.popup.export', '{}']]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } };
  assert.ok(resetForNewInstall(storage, 'token-1'));
  assert.equal(JSON.parse(store.get(STORAGE_KEY)).theme, undefined);
  assert.equal(JSON.parse(store.get(STORAGE_KEY)).lastDirectory, 'C:/x');
  assert.equal(store.get('mychartmaster.recent.v1'), '[1]');
  assert.ok(!store.has('mychartmaster.popup.export'));
  assert.ok(!resetForNewInstall(storage, 'token-1'), 'once per token');
});

test('dictionaries: the same keys in Korean and English, nothing empty, no leftovers of other programs', () => {
  const missingEn = Object.keys(KO).filter((k) => !(k in EN));
  const missingKo = Object.keys(EN).filter((k) => !(k in KO));
  assert.deepEqual(missingEn, []);
  assert.deepEqual(missingKo, []);
  for (const [k, v] of Object.entries(chartKo)) assert.ok(String(v).trim(), `empty ko ${k}`);
  for (const [k, v] of Object.entries(chartEn)) assert.ok(String(v).trim(), `empty en ${k}`);
  for (const id of CHART_IDS) { assert.ok(KO[`chartType.${id}`], id); assert.ok(EN[`chartType.${id}`], id); }
  for (const kind of ANIMATIONS) { assert.ok(chartKo[`animation.${kind}`] && chartEn[`animation.${kind}`], kind); assert.ok(hasIcon(animationIcon(kind)), `icon of ${kind}`); }
  for (const key of ['about.description', 'about.tagline', 'start.tagline', 'welcome.text', 'drop.hint', 'tip.home', 'settings.confirmDelete']) {
    assert.ok(!/UML|패킷|캡처|Wireshark|capture|packet|다이어그램/i.test(KO[key] + EN[key]), `${key} speaks of another program`);
  }
});

test('icons for every chart type, group, palette command and moving background', () => {
  for (const id of CHART_IDS) assert.ok(hasIcon(`chart${id[0].toUpperCase()}${id.slice(1)}`), id);
  for (const g of CHART_GROUPS) assert.ok(hasIcon(g.icon), g.icon);
  for (const name of ['newChart', 'importData', 'exportChart', 'copyImage', 'pasteData', 'addRow', 'addColumn', 'deleteRow', 'deleteColumn', 'sortAsc', 'sortDesc', 'transpose', 'dataStats', 'dataGrid', 'chartGallery', 'inspector', 'legendIcon', 'axisIcon', 'labelsIcon', 'seriesIcon', 'trendline', 'fitView', 'typeNumber', 'typeText', 'typeDate', 'fileChart', 'xlsxFile']) assert.ok(hasIcon(name), name);
  assert.equal(PALETTES.length, 20);
});

test('tutorial: every step has its texts, a chapter and a target', () => {
  assert.equal(STEPS.length, 35);
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
  for (const step of STEPS) {
    assert.ok(CHAPTERS.includes(step.chapter), step.id);
    assert.ok(step.target, step.id);
    for (const dict of [KO, EN]) { assert.ok(dict[`tutorial.${step.id}.title`], `${step.id} title`); assert.ok(dict[`tutorial.${step.id}.text`], `${step.id} text`); }
  }
  for (const chapter of CHAPTERS) assert.ok(KO[`tutorial.chapter.${chapter}`] && EN[`tutorial.chapter.${chapter}`], chapter);
});

test('documents: both languages, every picture they show exists in both image folders', () => {
  for (const name of ['UserGuide', 'Tutorial']) {
    for (const [file, lang] of [[`${name}.md`, 'ko'], [`${name}.en.md`, 'en']]) {
      const text = fs.readFileSync(path.join(root, 'doc', file), 'utf8');
      const pictures = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
      assert.ok(pictures.length >= 8, `${file}: ${pictures.length} pictures`);
      for (const pic of pictures) {
        assert.ok(pic.startsWith(`images/${lang}/`), `${file}: ${pic} is not in images/${lang}`);
        assert.ok(fs.existsSync(path.join(root, 'doc', pic)), `${file}: ${pic} missing (npm run doc:images)`);
      }
      assert.ok(!/패킷|캡처|Wireshark|pcap/i.test(text), `${file} speaks of another program`);
    }
  }
});

test('project files: names, port, file association, popup kinds match the Rust side', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.productName, 'MyChartMaster');
  const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.equal(conf.identifier, 'com.shkwon.mychartmaster');
  assert.equal(conf.build.devUrl, 'http://localhost:1476');
  assert.deepEqual(conf.bundle.fileAssociations.map((a) => a.ext).flat(), ['mychart']);
  assert.ok(!JSON.stringify(conf).includes('pcap'));
  const lib = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const kinds = /const POPUP_KINDS: &\[&str\] = &\[([\s\S]*?)\];/.exec(lib)[1].match(/"([a-z]+)"/g).map((s) => s.slice(1, -1));
  const popups = fs.readFileSync(path.join(root, 'src', 'platform', 'popups.js'), 'utf8');
  const js = /export const POPUPS = \{([\s\S]*?)\n\};/.exec(popups)[1].match(/^\s+([a-z]+):/gm).map((s) => s.trim().slice(0, -1));
  assert.deepEqual([...kinds].sort(), [...js].sort());
});
