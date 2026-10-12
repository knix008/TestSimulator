const assert = require('node:assert/strict');
const { describe, it } = require('../lib/framework');
const { buildReport, buildMarkdown, getReportFilename } = require('../../src/services/report-builder');

const SUMMARY = {
  boardTitle: 'Release Plan',
  columns: [
    { title: 'Todo', type: 'normal', count: 3 },
    { title: 'Doing', type: 'normal', count: 1 },
    { title: 'Done', type: 'done', count: 4 },
  ],
  totalCards: 8,
  completedCards: 4,
  overdueCards: 1,
  projectStartDate: '2026-01-15',
};

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Summary report builder', () => {
  it('builds an English Markdown report with overview and column table', () => {
    const md = buildMarkdown(SUMMARY, {}, 'en');
    assert.match(md, /^# Release Plan/);
    assert.match(md, /## Project Summary Report/);
    assert.match(md, /\| 8 \| 4 \| 1 \| 50% \|/);
    assert.match(md, /\| Todo \| 3 \|/);
    assert.match(md, /\| Done \| 4 \|/);
  });

  it('builds a Korean Markdown report', () => {
    const md = buildMarkdown(SUMMARY, {}, 'ko');
    assert.match(md, /프로젝트 요약 리포트/);
  });

  it('embeds chart images in Markdown when provided', () => {
    const md = buildMarkdown(SUMMARY, { columnDist: PNG, burndown: PNG }, 'en');
    assert.equal((md.match(/!\[/g) || []).length, 2);
  });

  it('reports a 0% completion rate when there are no cards', () => {
    const md = buildMarkdown({ ...SUMMARY, totalCards: 0, completedCards: 0, columns: [] }, {}, 'en');
    assert.match(md, /\| 0 \| 0 \| 1 \| 0% \|/);
  });

  it('builds a Markdown buffer via buildReport()', async () => {
    const { buffer, mime } = await buildReport('md', SUMMARY, {}, 'en');
    assert.match(mime, /text\/markdown/);
    assert.ok(buffer.toString('utf8').includes('Release Plan'));
  });

  it('builds a valid DOCX file (ZIP signature)', async () => {
    const { buffer, mime } = await buildReport('docx', SUMMARY, { burndown: PNG }, 'en');
    assert.match(mime, /wordprocessingml/);
    assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK');
  });

  it('builds a valid PDF file (%PDF signature)', async () => {
    const { buffer, mime } = await buildReport('pdf', SUMMARY, { columnDist: PNG }, 'en');
    assert.equal(mime, 'application/pdf');
    assert.equal(buffer.subarray(0, 4).toString('latin1'), '%PDF');
  }, { timeout: 30000 });

  it('rejects unsupported formats', async () => {
    await assert.rejects(() => buildReport('xls', SUMMARY, {}, 'en'), /Unsupported format/);
  });

  it('creates safe, dated report file names', () => {
    const name = getReportFilename('a/b:c*?', 'pdf');
    assert.match(name, /^a_b_c__-report-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.match(getReportFilename('', 'md'), /^project-report-.*\.md$/);
    assert.match(getReportFilename('x', 'docx'), /\.docx$/);
  });
});
