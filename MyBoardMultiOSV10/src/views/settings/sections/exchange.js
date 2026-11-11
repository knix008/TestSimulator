// Import / export: the project as .myboard, issues as CSV (by JQL), the CSV import wizard (upload → columns,
// sample and suggested mapping from POST /import/csv → mapping table → dry run → import with per-row errors)
// and the card-board JSON (Trello-style) import.
import { tr, esc, icon, btn, select, input, textarea, checkbox, card, note } from '../util.js';
import * as native from '../../../platform/native.js';

const FIELD_ICON = {
  summary: 'notes', description: 'notes', type: 'layers', status: 'flag', priority: 'sort', assignee: 'user', reporter: 'user', labels: 'tag',
  components: 'container', fixVersions: 'calendar', affectedVersions: 'calendar', dueDate: 'calendar', startDate: 'calendar', storyPoints: 'percent',
  originalEstimate: 'clock', created: 'clock', key: 'key', epic: 'layers', parent: 'link',
};

/** RFC 4180 CSV → rows of cells (quotes, doubled quotes, CR LF). */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let rowCells = [];
  let cell = '';
  let quoted = false;
  const src = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { rowCells.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      rowCells.push(cell); cell = '';
      if (rowCells.some((c) => c !== '')) rows.push(rowCells);
      rowCells = [];
    } else cell += ch;
  }
  if (cell !== '' || rowCells.length) { rowCells.push(cell); if (rowCells.some((c) => c !== '')) rows.push(rowCells); }
  return rows;
}

const looksLikeDate = (v) => /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(v) || /^\d{1,2}[./]\d{1,2}[./]\d{4}/.test(v) || Number.isFinite(Date.parse(v));

/** Checks every row against the project before importing: { rows, ok, problems [{ row, field, message, level }] }. */
export function dryRun(S, csv) {
  const rows = parseCsv(csv.text, csv.preview.delimiter || ',');
  const headers = rows[0]?.map((h) => h.trim()) ?? [];
  const data = rows.slice(1);
  const mapping = csv.mapping;
  const col = (field) => headers.findIndex((h) => mapping[h] === field);
  const get = (r, field) => { const i = col(field); return i >= 0 ? String(r[i] ?? '').trim() : ''; };
  const named = (list, v) => list.some((x) => x.name.toLowerCase() === v.toLowerCase() || x.id === v);
  const users = S.users;
  const knownUser = (v) => users.some((u) => [u.username, u.displayName, u.email].filter(Boolean).some((x) => String(x).toLowerCase() === v.toLowerCase()));
  const keys = new Set(data.map((r) => get(r, 'key').toUpperCase()).filter(Boolean));
  const problems = [];
  let ok = 0;
  if (col('summary') < 0) problems.push({ row: 0, field: 'summary', level: 'error', message: tr('csv.noSummary') });
  data.forEach((r, i) => {
    const line = i + 2;
    const before = problems.filter((p) => p.level === 'error').length;
    const err = (field, message) => problems.push({ row: line, field, level: 'error', message });
    const warn = (field, message) => problems.push({ row: line, field, level: 'warning', message });
    if (col('summary') >= 0 && !get(r, 'summary')) err('summary', tr('csv.emptySummary'));
    for (const [field, list] of [['type', S.config.types], ['status', S.config.statuses], ['priority', S.config.priorities]]) {
      const v = get(r, field);
      if (v && !named(list, v)) err(field, tr('csv.unknown', { field: tr(`csvField.${field}`), value: v }));
    }
    for (const field of ['assignee', 'reporter']) { const v = get(r, field); if (v && !knownUser(v)) warn(field, tr('csv.unknownUser', { value: v })); }
    for (const field of ['dueDate', 'startDate', 'created']) { const v = get(r, field); if (v && !looksLikeDate(v)) err(field, tr('csv.badDate', { value: v })); }
    const sp = get(r, 'storyPoints');
    if (sp && !Number.isFinite(Number(sp.replace(',', '.')))) err('storyPoints', tr('csv.badNumber', { value: sp }));
    for (const [field, list] of [['components', S.config.components], ['fixVersions', S.config.versions], ['affectedVersions', S.config.versions]]) {
      for (const v of get(r, field).split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
        if (!named(list, v)) (csv.createMissing ? warn : err)(field, tr(csv.createMissing ? 'csv.willCreate' : 'csv.unknown', { field: tr(`csvField.${field}`), value: v }));
      }
    }
    for (const field of ['epic', 'parent']) {
      const v = get(r, field).toUpperCase();
      if (v && !keys.has(v) && !/^[A-Z][A-Z0-9]+-\d+$/.test(v)) err(field, tr('csv.badRef', { value: v }));
    }
    if (problems.filter((p) => p.level === 'error').length === before) ok += 1;
  });
  return { rows: data.length, ok, problems };
}

const fieldOptions = (S, fields) => [
  { value: '', label: tr('csv.ignore'), icon: 'close' },
  ...(fields ?? []).map((f) => ({ value: f, label: tr(`csvField.${f}`), icon: FIELD_ICON[f] ?? 'field' })),
  ...S.config.fields.map((f) => ({ value: `custom:${f.id}`, label: `${f.name} (${tr('fields.custom')})`, icon: 'field' })),
];

function csvCard(S) {
  const csv = S.pending.csv;
  const e = S.project.myRole !== 'viewer';
  if (!csv || csv.step === 'upload') {
    return card(tr('csv.title'), 'csvFile', `<p class="ps-p">${esc(tr('csv.text'))}</p>
      <div class="ps-actions">${btn('csv-file', tr('csv.chooseFile'), 'folderOpen', { disabled: !e })}</div>
      ${textarea('csv-text', csv?.text ?? '', { rows: 5, placeholder: tr('csv.paste'), attrs: 'data-csv-text', disabled: !e })}
      <div class="ps-actions">${btn('csv-read', tr('csv.read'), 'table', { cls: 'primary', disabled: !e })}</div>`, { attrs: 'data-csv-step="upload"' });
  }
  if (csv.step === 'map') {
    const p = csv.preview;
    const sampleOf = (i) => (p.sample ?? []).map((r) => r[i]).filter((v) => v != null && v !== '').slice(0, 2).join(' · ');
    const dry = csv.dry;
    return card(tr('csv.mapTitle', { name: csv.name || 'CSV' }), 'csvFile', `<p class="ps-p">${esc(tr('csv.mapText', { rows: p.rowCount, cols: p.headers.length }))}</p>
      <div class="ps-table" role="table" style="--ps-cols: minmax(110px, 1fr) minmax(140px, 1.6fr) minmax(170px, 1.2fr)">
        <div class="ps-tr ps-thead" role="row"><div class="ps-th">${esc(tr('csv.column'))}</div><div class="ps-th">${esc(tr('csv.sample'))}</div><div class="ps-th">${esc(tr('csv.field'))}</div></div>
        <div class="ps-tbody">${p.headers.map((h, i) => `<div class="ps-tr" role="row" data-header="${esc(h)}"><div class="ps-td"><b>${esc(h)}</b></div><div class="ps-td"><span class="ps-sample" title="${esc(sampleOf(i))}">${esc(sampleOf(i) || '—')}</span></div>
          <div class="ps-td">${select('csv-map', csv.mapping[h] ?? '', fieldOptions(S, p.fields), { attrs: `data-map="${esc(h)}"`, title: tr('csv.field'), glyph: 'field' })}</div></div>`).join('')}</div>
      </div>
      ${checkbox('csv-create', csv.createMissing, tr('csv.createMissing'), { attrs: 'data-csv-create' })}
      ${dry ? `<div class="ps-dry ${dry.problems.some((x) => x.level === 'error') ? 'bad' : 'good'}" data-dry>${icon(dry.problems.some((x) => x.level === 'error') ? 'warning' : 'check')}<b>${esc(tr('csv.dryResult', { ok: dry.ok, rows: dry.rows, errors: dry.problems.filter((x) => x.level === 'error').length, warnings: dry.problems.filter((x) => x.level === 'warning').length }))}</b></div>
        ${problemsTable(dry.problems)}` : ''}
      <div class="ps-actions">${btn('csv-back', tr('common.back'), 'chevronLeft')}<span class="grow"></span>${btn('csv-dry', tr('csv.dryRun'), 'search')}${btn('csv-import', tr('csv.import'), 'importFile', { cls: 'primary', disabled: !e })}</div>`, { attrs: 'data-csv-step="map"' });
  }
  const r = csv.result;
  return card(tr('csv.doneTitle'), 'check', `<div class="ps-dry ${r.errors?.length ? 'bad' : 'good'}" data-import-result>${icon(r.errors?.length ? 'warning' : 'check')}<b>${esc(tr('csv.imported', { created: r.created ?? 0, errors: r.errors?.length ?? 0 }))}</b></div>
    ${r.errors?.length ? problemsTable(r.errors.map((x) => ({ row: x.row, field: x.code, level: 'error', message: x.message }))) : ''}
    ${r.issues?.length ? `<p class="ps-p muted">${esc(tr('csv.keys', { keys: r.issues.slice(0, 12).map((x) => x.key).join(', ') + (r.issues.length > 12 ? ' …' : '') }))}</p>` : ''}
    <div class="ps-actions">${btn('csv-again', tr('csv.again'), 'refresh')}${btn('open-board', tr('board.open'), 'columns', { cls: 'primary' })}</div>`, { attrs: 'data-csv-step="result"' });
}

const problemsTable = (problems) => (problems.length ? `<div class="ps-table ps-problems" role="table" style="--ps-cols: 64px 120px minmax(160px, 1fr)">
  <div class="ps-tr ps-thead"><div class="ps-th">${esc(tr('csv.row'))}</div><div class="ps-th">${esc(tr('csv.field'))}</div><div class="ps-th">${esc(tr('csv.problem'))}</div></div>
  <div class="ps-tbody">${problems.slice(0, 200).map((x) => `<div class="ps-tr ${x.level}" data-problem-row="${x.row}"><div class="ps-td">${x.row || '—'}</div><div class="ps-td">${icon(x.level === 'error' ? 'error' : 'warning')}<span>${esc(trField(x.field))}</span></div><div class="ps-td"><span class="ps-wrap">${esc(x.message)}</span></div></div>`).join('')}</div></div>` : '');
const trField = (f) => { const v = tr(`csvField.${f}`); return v.startsWith('ps.') ? String(f ?? '') : v; };

export const exchangeSection = {
  id: 'exchange', glyph: 'importFile', open: true,
  render(S) {
    const key = S.project.key;
    const trello = S.pending.trello;
    return `${card(tr('exp.title'), 'exportFile', `<p class="ps-p">${esc(tr('exp.text'))}</p>
        <div class="ps-actions">${btn('export-myboard', tr('exp.myboard'), 'exportFile', { cls: 'primary' })}${btn('import-myboard', tr('exp.importMyboard'), 'importFile')}</div>
        <div class="ps-row"><div class="ps-row-label">${icon('csvFile')}<span>${esc(tr('exp.csv'))}</span></div><div class="ps-row-control"><div class="ps-inline">${input('export-jql', S.pending.exportJql ?? `project = "${key}"`, { attrs: 'data-export-jql', placeholder: 'JQL' })}${btn('export-csv', tr('exp.csvButton'), 'csvFile')}</div></div></div>`)}
      ${csvCard(S)}
      ${card(tr('trello.title'), 'importFile', `<p class="ps-p">${esc(tr('trello.text'))}</p>
        <div class="ps-actions">${btn('trello-file', tr('trello.choose'), 'folderOpen')}</div>
        ${trello ? `<div class="ps-dry good" data-trello-result>${icon('check')}<b>${esc(tr('trello.done', { name: trello.name ?? '', issues: trello.imported?.issues ?? 0 }))}</b>${btn('trello-open', tr('trello.open'), 'folderOpen', { cls: 'primary' })}</div>` : ''}`)}
      ${note(tr('exp.dbHint'))}`;
  },
  bind(S, el) {
    el.addEventListener('change', (event) => {
      const t = event.target;
      const csv = S.pending.csv;
      if (t.dataset.map != null && csv) { csv.mapping[t.dataset.map] = t.value; csv.dry = null; S.render(); } else if (t.dataset.csvCreate != null && csv) { csv.createMissing = t.checked; csv.dry = null; S.render(); } else if (t.dataset.exportJql != null) S.pending.exportJql = t.value;
    });
    el.addEventListener('input', (event) => { if (event.target.dataset.csvText != null) S.pending.csv = { ...(S.pending.csv ?? { step: 'upload' }), text: event.target.value }; });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      const csv = S.pending.csv;
      switch (button.dataset.act) {
        case 'export-myboard': S.ctx.app?.run?.('exportProject'); break;
        case 'import-myboard': S.ctx.app?.run?.('import'); break;
        case 'export-csv': await exportCsv(S, el.querySelector('[data-export-jql]').value.trim()); break;
        case 'csv-file': {
          const [file] = await native.pickWithInput('.csv,text/csv', false);
          if (!file) return;
          S.pending.csv = { step: 'upload', name: file.name, text: await file.text() };
          await readCsv(S);
          break;
        }
        case 'csv-read': S.pending.csv = { step: 'upload', ...(csv ?? {}), text: el.querySelector('[data-csv-text]').value }; await readCsv(S); break;
        case 'csv-back': S.pending.csv = { step: 'upload', text: csv?.text ?? '', name: csv?.name }; S.render(); break;
        case 'csv-dry': csv.dry = dryRun(S, csv); S.render(); break;
        case 'csv-import': {
          const result = await S.run(() => S.api.importCsv({ projectId: S.pid, csv: csv.text, mapping: csv.mapping, delimiter: csv.preview.delimiter, createMissing: csv.createMissing }));
          if (result && result !== true) { S.pending.csv = { ...csv, step: 'result', result }; S.render(); }
          break;
        }
        case 'csv-again': S.pending.csv = null; S.render(); break;
        case 'open-board': S.ctx.app?.setView?.('board'); break;
        case 'trello-file': {
          const [file] = await native.pickWithInput('.json,application/json', false);
          if (!file) return;
          let board;
          try { board = JSON.parse(await file.text()); } catch { S.say('danger', tr('err.INVALID_JSON')); S.render(); return; }
          const out = await S.run(() => S.api.importTrello({ board, fileName: file.name }), { reload: false, ok: tr('trello.ok') });
          if (out && out !== true) { S.pending.trello = out; S.render(); globalThis.__myboard?.actions?.refreshProjects?.(); }
          break;
        }
        case 'trello-open': { const id = S.pending.trello?.id ?? S.pending.trello?.project?.id; S.pending.trello = null; if (id) S.ctx.app?.openTarget?.('project', id); break; }
        default:
      }
    });
  },
};

async function readCsv(S) {
  const csv = S.pending.csv;
  if (!String(csv.text ?? '').trim()) { S.say('danger', tr('csv.empty')); S.render(); return; }
  const preview = await S.run(() => S.api.importCsv({ projectId: S.pid, csv: csv.text }), { reload: false });
  if (!preview || preview === true) return;
  S.pending.csv = { ...csv, step: 'map', preview, mapping: { ...(preview.suggestedMapping ?? {}) }, createMissing: true, dry: null };
  S.render();
}

async function exportCsv(S, jql) {
  try {
    const response = await S.api.request('GET', '/export/csv', { query: { jql }, raw: true });
    const text = await response.text();
    const name = `${S.project.key}.csv`;
    if (native.isDesktop()) {
      const path = await native.chooseSavePath(name, ['csv']);
      if (!path) return;
      await native.writeTextFile(path, text, '');
    } else await native.saveFileWeb(text, { name, mime: 'text/csv' });
    S.say('success', tr('exp.csvDone', { name }));
    S.render();
  } catch (error) { S.fail(error); }
}

